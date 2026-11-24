import type { MoleKind, PlayerInfo, ServerMsg } from '../../shared/protocol';
import { isFever } from '../../shared/game';
import { state, type GameMode, type Route } from '../app';
import { avatarElement } from '../avatarRender';
import { h } from '../dom';
import { LocalSession, NetSession, type GameSession } from '../localSession';
import { getRoom, onRoomChange } from '../room';
import { buzz, isMuted, setMuted, sfx } from '../sound';
import { grassBackground, moleSprite, SPRITES } from '../sprites';

// 게임판 논리 해상도 (도트 1개 = 1단위). 실제 크기는 정수 배율로 확대.
const CELL = 24;
const BOARD = CELL * 3;
const POP_MS = 110; // 올라오기/내려가기 시간
const HIT_SHOW_MS = 260; // 맞은 뒤 머무는 시간
const HIT_SINK_MS = 140;
const PENDING_TIMEOUT_MS = 500; // 서버 응답이 없으면 예측 타격 취소

interface MoleView {
  moleId: number;
  hole: number;
  kind: MoleKind;
  spawnAt: number;
  despawnAt: number;
  switchAt?: number;
  hitKind?: MoleKind;
  pendingAt?: number; // 내가 누른 시각 (클라이언트 예측)
  hitAt?: number; // 서버 확정 시각(클라 기준)
  hitBy?: string;
}

interface Effect {
  kind: 'burst' | 'boom' | 'text' | 'puff' | 'spark' | 'hammer';
  x: number;
  y: number;
  at: number;
  text?: string;
  color?: string;
  /** spark 입자 수 */
  n?: number;
}

const holeCenter = (hole: number) => ({ x: (hole % 3) * CELL + CELL / 2, y: Math.floor(hole / 3) * CELL + 18 });

export function gameScreen(root: HTMLElement, go: (r: Route) => void, route: { mode: GameMode }): () => void {
  const mode = route.mode;
  let players: PlayerInfo[];
  let session: GameSession;
  if (mode === 'multi') {
    const room = getRoom();
    if (!room) {
      queueMicrotask(() => go({ name: 'start' }));
      return () => {};
    }
    session = new NetSession();
    players = room.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0 }));
  } else {
    const me: PlayerInfo = { id: 'me', nickname: state.nickname, avatar: state.avatar, score: 0, connected: true };
    players = [me];
    session = new LocalSession(me);
  }

  let startAt = 0;
  let durationMs = 0;
  const moles = new Map<number, MoleView>();
  const effects: Effect[] = [];

  // ---------- DOM ----------
  const timerEl = h('div', { class: 'timer' }, '');
  const myScoreEl = h('div', { class: 'my-score' }, '0');
  const comboEl = h('div', { class: 'combo' });
  const feverEl = h('div', { class: 'fever-badge' }, '🔥 피버 타임 ×2');
  const board = h('div', { class: 'board' });
  const canvas = h('canvas', { class: 'board-canvas', 'aria-label': '두더지 게임판' });
  const overlay = h('div', { class: 'overlay' });
  const flashEl = h('div', { class: 'bomb-flash', 'aria-hidden': 'true' });
  board.append(canvas, flashEl, overlay, feverEl);
  let overlayUntil = 0;
  let feverAnnounced = false;
  const showOverlay = (text: string, cls: string, ms: number) => {
    overlay.textContent = text;
    overlay.className = `overlay show pop ${cls}`;
    overlayUntil = performance.now() + ms;
  };
  const scoreList = h('ul', { class: 'scores' });

  const renderScores = () => {
    const sorted = [...players].sort((a, b) => Number(b.connected) - Number(a.connected) || b.score - a.score);
    scoreList.replaceChildren(
      ...sorted.map((p) =>
        h(
          'li',
          { class: (p.id === session.myId ? 'me ' : '') + (p.connected ? '' : 'left') },
          avatarElement(p.avatar, 1),
          h('span', { class: 'nick' }, p.nickname),
          h('b', {}, p.connected ? String(p.score) : '나감'),
        ),
      ),
    );
    myScoreEl.textContent = String(players.find((p) => p.id === session.myId)?.score ?? 0);
  };

  root.append(
    h(
      'main',
      { class: 'screen game' },
      h(
        'header',
        { class: 'hud' },
        h(
          'button',
          { class: 'btn tiny', onclick: () => go(mode === 'multi' ? { name: 'lobby' } : { name: 'start' }) },
          mode === 'multi' ? '대기실' : '그만',
        ),
        h('div', { class: 'hud-mid' }, h('small', {}, '남은 시간'), timerEl),
        muteButton(),
        h('div', { class: 'hud-right' }, h('small', {}, '내 점수'), myScoreEl, comboEl),
      ),
      scoreList,
      board,
      legend(),
    ),
  );
  renderScores();

  // ---------- 캔버스 크기 (정수 배율) ----------
  const ctx = canvas.getContext('2d')!;
  const grass = grassBackground(BOARD, BOARD);
  let scale = 1;
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    // 스크롤 없이 한 화면에: 게임판 위쪽 위치와 아래 범례 높이를 빼고 남는 높이까지
    const top = board.getBoundingClientRect().top + window.scrollY;
    const below = (board.nextElementSibling as HTMLElement | null)?.offsetHeight ?? 0;
    const availH = window.innerHeight - top - below - 40;
    const cssW = Math.max(180, Math.min(board.clientWidth, availH));
    scale = Math.max(1, Math.floor((cssW * dpr) / BOARD));
    canvas.width = BOARD * scale;
    canvas.height = BOARD * scale;
    canvas.style.width = `${(BOARD * scale) / dpr}px`;
    canvas.style.height = `${(BOARD * scale) / dpr}px`;
  };
  resize();
  window.addEventListener('resize', resize);

  // ---------- 서버 메시지 ----------
  session.onMessage((msg: ServerMsg) => {
    switch (msg.type) {
      case 'game_start':
        startAt = msg.startAt;
        durationMs = msg.durationMs;
        break;
      case 'mole_spawn':
        moles.set(msg.moleId, { ...msg });
        break;
      case 'mole_hit': {
        const m = moles.get(msg.moleId);
        for (const p of players) {
          if (msg.scores[p.id] !== undefined) p.score = msg.scores[p.id];
          else p.connected = false; // 판 도중 나간 사람 (서버 점수 목록에서 빠짐)
        }
        renderScores();
        if (!m) break;
        m.hitAt = performance.now();
        m.hitBy = msg.playerId;
        m.hitKind = msg.hitKind;
        const { x, y } = holeCenter(m.hole);
        const bad = msg.hitKind === 'bomb' || msg.hitKind === 'decoy';
        const now = performance.now();
        if (msg.hitKind === 'gold') effects.push({ kind: 'spark', x, y: y - 8, at: now, color: '#ffe066', n: 10 });
        else if (msg.hitKind === 'flash') effects.push({ kind: 'spark', x, y: y - 8, at: now, color: '#bfe0ff', n: 8 });
        else if (!bad) effects.push({ kind: 'spark', x, y: y - 2, at: now, color: '#8a6040', n: 6 });
        if (msg.playerId === session.myId) {
          const k = msg.hitKind === 'trick' ? 'gold' : msg.hitKind;
          sfx[k]();
          buzz(k === 'bomb' ? [60, 40, 90] : bad ? 40 : 15);
          if (msg.bonus > 0) setTimeout(sfx.combo, 120);
          const sign = msg.scoreDelta > 0 ? '+' : msg.scoreDelta < 0 ? '−' : '±';
          effects.push({
            kind: 'text',
            x,
            y: y - 14,
            at: performance.now(),
            text: `${sign}${Math.abs(msg.scoreDelta)}`,
            color: bad ? '#ff5a4a' : msg.hitKind === 'gold' ? '#ffe066' : msg.fever ? '#ffb347' : '#ffffff',
          });
          if (msg.hitKind === 'decoy') {
            effects.push({ kind: 'text', x, y: y - 4, at: performance.now(), text: '가짜!', color: '#ff9a8a' });
          }
          comboEl.textContent = msg.combo >= 2 ? `콤보 ${msg.combo}` : '';
          if (msg.bonus > 0) showOverlay(`${msg.combo}콤보! +${msg.bonus}`, 'combo', 700);
          if (msg.scoreDelta !== 0) {
            myScoreEl.classList.remove('bump');
            void myScoreEl.offsetWidth;
            myScoreEl.classList.add('bump');
          }
        } else {
          const who = players.find((p) => p.id === msg.playerId)?.nickname ?? '?';
          effects.push({ kind: 'text', x, y: y - 14, at: performance.now(), text: who, color: '#cfe8ff' });
          sfx.other();
        }
        if (msg.hitKind === 'bomb') {
          effects.push({ kind: 'boom', x, y: y - 8, at: performance.now() });
          restartAnim(board, 'shake');
          if (msg.playerId === session.myId) restartAnim(flashEl, 'on');
        }
        break;
      }
      case 'game_end':
        sfx.end();
        queueMicrotask(() => go({ name: 'result', ranking: msg.ranking, myId: session.myId, mode }));
        break;
      case 'error':
        console.warn(msg.message);
        break;
    }
  });
  if (mode === 'solo') session.send({ type: 'start_game' });

  // 같이 하기: 연결이 끊기면(새로고침 포함) 대기실로 — 판이 끝나면 결과는 같이 받는다
  const offRoom =
    mode === 'multi'
      ? onRoomChange((e) => {
          if (e.kind === 'lost') go({ name: 'start', message: e.message, error: true });
          else if (e.kind === 'reconnecting') go({ name: 'lobby' });
        })
      : () => {};

  // ---------- 입력 ----------

  const onPointer = (e: PointerEvent) => {
    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!startAt || session.now() < startAt) return;
    const rect = canvas.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * BOARD;
    const ly = ((e.clientY - rect.top) / rect.height) * BOARD;
    const col = Math.floor(lx / CELL);
    const row = Math.floor(ly / CELL);
    if (col < 0 || col > 2 || row < 0 || row > 2) return;
    const hole = row * 3 + col;
    const t = session.now();
    const pnow = performance.now();

    const target = [...moles.values()].find(
      (m) => m.hole === hole && !m.hitAt && !m.pendingAt && t >= m.spawnAt && t <= m.despawnAt,
    );
    effects.push({ kind: 'hammer', x: lx, y: ly, at: pnow });
    if (target) {
      target.pendingAt = pnow; // 즉시 타격 표시 (점수는 서버 응답으로 확정)
      effects.push({ kind: 'burst', x: lx, y: ly, at: pnow, color: target.kind === 'gold' ? '#fff3a0' : '#ffffff' });
      session.send({ type: 'whack', moleId: target.moleId });
      sfx.tap();
    } else {
      effects.push({ kind: 'puff', x: lx, y: ly, at: pnow });
      sfx.miss();
    }
  };
  canvas.addEventListener('pointerdown', onPointer);
  const noMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('contextmenu', noMenu);

  // 게임 중에는 화면이 꺼지지 않게 + 당겨서 새로고침 방지
  document.body.classList.add('in-game');
  let wakeLock: { release: () => Promise<void> } | null = null;
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
  nav.wakeLock
    ?.request('screen')
    .then((l) => (wakeLock = l))
    .catch(() => {});

  // ---------- 그리기 ----------
  let raf = 0;
  let lastCount = '';
  let lastTick = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const t = session.now();
    const pnow = performance.now();

    // HUD 타이머 / 카운트다운
    if (startAt) {
      if (t < startAt) {
        const n = String(Math.ceil((startAt - t) / 1000));
        if (n !== lastCount) {
          overlay.textContent = n;
          overlay.className = 'overlay show pop';
          lastCount = n;
          sfx.count();
        }
        timerEl.textContent = String(Math.round(durationMs / 1000));
      } else {
        if (lastCount !== 'go') {
          showOverlay('시작!', '', 600);
          // 카운트다운이 이미 한참 지난 뒤 화면이 열린 경우엔 소리 생략
          if (t - startAt < 800) sfx.go();
          lastCount = 'go';
        }
        const fever = isFever(t, startAt, durationMs);
        if (fever && !feverAnnounced) {
          feverAnnounced = true;
          showOverlay('피버 타임!', 'fever', 900);
          sfx.fever();
          buzz([30, 50, 30]);
        }
        board.classList.toggle('fever', fever);
        const left = Math.max(0, startAt + durationMs - t);
        // 마지막 5초 째깍
        const sec = Math.ceil(left / 1000);
        if (sec <= 5 && sec > 0 && sec !== lastTick) {
          lastTick = sec;
          sfx.tick();
        }
        timerEl.textContent = left > 10_000 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1);
        timerEl.classList.toggle('hurry', left <= 10_000);
        if (overlayUntil && pnow > overlayUntil) {
          overlay.className = 'overlay';
          overlayUntil = 0;
        }
      }
    }

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grass, 0, 0);

    for (let i = 0; i < 9; i++) {
      const cx = (i % 3) * CELL;
      const cy = Math.floor(i / 3) * CELL;
      ctx.drawImage(SPRITES.hole, cx + 1, cy + 14);
    }

    for (const m of moles.values()) {
      // 예측 타격이 서버에서 확정되지 않으면 원상 복구
      if (m.pendingAt && !m.hitAt && pnow - m.pendingAt > PENDING_TIMEOUT_MS) m.pendingAt = undefined;

      // 보이는 모습: 확정되면 판정 종류, 변신 두더지는 시각에 따라 황금→폭탄 (바뀌기 직전 깜빡임)
      let look: Exclude<MoleKind, 'trick'>;
      if (m.hitKind && m.hitKind !== 'trick') look = m.hitKind;
      else if (m.kind === 'trick') {
        const toSwitch = (m.switchAt ?? Infinity) - t;
        look = toSwitch <= 0 ? 'bomb' : toSwitch < 300 && Math.floor(pnow / 60) % 2 ? 'bomb' : 'gold';
      } else look = m.kind;

      let height: number;
      let hitLook = false;
      if (m.hitAt || m.pendingAt) {
        const since = pnow - (m.pendingAt ?? m.hitAt!);
        hitLook = true;
        if (look === 'bomb' && m.hitAt) {
          height = 0; // 폭탄은 터져서 사라짐
        } else {
          height = since < HIT_SHOW_MS ? 1 : 1 - (since - HIT_SHOW_MS) / HIT_SINK_MS;
        }
        if (height <= 0 && m.hitAt) {
          moles.delete(m.moleId);
          continue;
        }
      } else {
        if (t > m.despawnAt) {
          moles.delete(m.moleId);
          continue;
        }
        if (t < m.spawnAt) continue;
        height = Math.min(1, (t - m.spawnAt) / POP_MS, (m.despawnAt - t) / POP_MS);
      }
      height = Math.max(0, Math.min(1, height));
      if (height <= 0) continue;

      const cx = (m.hole % 3) * CELL;
      const cy = Math.floor(m.hole / 3) * CELL;
      const groundY = cy + 18; // 구멍 가운데 선
      const sprite = moleSprite(look, hitLook);
      const shakeX = hitLook && look !== 'bomb' ? Math.round(Math.sin(pnow / 25)) : 0;
      // 맞으면 살짝 찌그러짐
      const squash = hitLook && look !== 'bomb' ? 2 : 0;
      const top = Math.round(groundY - height * 17) + squash;

      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy - 4, CELL, groundY - (cy - 4));
      ctx.clip();
      ctx.drawImage(sprite, cx + 4 + shakeX, top, 16, 16 - squash);
      if (look === 'gold' && !hitLook && Math.floor(pnow / 180) % 2 === 0) {
        ctx.fillStyle = '#fffbe0';
        ctx.fillRect(cx + 17, top + 1, 1, 3);
        ctx.fillRect(cx + 16, top + 2, 3, 1);
      }
      ctx.restore();
    }

    drawEffects(ctx, effects, pnow);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.removeEventListener('contextmenu', noMenu);
    document.body.classList.remove('in-game');
    void wakeLock?.release().catch(() => {});
    offRoom();
    session.close();
  };
}

function restartAnim(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** 🔊/🔇 토글 버튼 */
export function muteButton(): HTMLButtonElement {
  const b = h('button', { class: 'btn tiny mute', 'aria-label': '소리 켜기/끄기' });
  const sync = () => {
    b.textContent = isMuted() ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', String(isMuted()));
  };
  b.addEventListener('click', () => {
    setMuted(!isMuted());
    sync();
  });
  sync();
  return b;
}

const EFFECT_LIFE: Record<Effect['kind'], number> = {
  text: 700,
  boom: 380,
  burst: 220,
  puff: 160,
  spark: 420,
  hammer: 200,
};

/** 게임판 아래 범례: 두더지 그림 + 점수 */
function legend(): HTMLElement {
  const icon = (sprite: HTMLCanvasElement) => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    c.className = 'pixel';
    c.getContext('2d')!.drawImage(sprite, 0, 0);
    return c;
  };
  const item = (sprites: HTMLCanvasElement[], label: string, bad = false) =>
    h('li', { class: bad ? 'bad' : '' }, ...sprites.map(icon), h('span', {}, label));
  return h(
    'ul',
    { class: 'legend' },
    item([SPRITES.normal], '+1'),
    item([SPRITES.gold], '+3'),
    item([SPRITES.flash], '+2 (순식간)'),
    item([SPRITES.decoy], '−1 가짜', true),
    item([SPRITES.bomb], '−2', true),
    item([SPRITES.gold, SPRITES.bomb], '변신!', true),
  );
}

function drawEffects(ctx: CanvasRenderingContext2D, effects: Effect[], now: number) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const age = now - e.at;
    const life = EFFECT_LIFE[e.kind];
    if (age > life) {
      effects.splice(i, 1);
      continue;
    }
    const p = age / life;
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    switch (e.kind) {
      case 'hammer': {
        // 뿅망치: 들었다가(0~70ms) 내려치고 잠깐 머문다
        const swing = Math.min(1, age / 70);
        const angle = 0.15 - swing * 1.05;
        ctx.save();
        ctx.globalAlpha = age > 140 ? 1 - (age - 140) / 60 : 1;
        ctx.translate(x + 8, y + 6);
        ctx.rotate(angle);
        ctx.drawImage(SPRITES.hammer, -6, -11);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }
      case 'spark': {
        // 사방으로 튀는 입자 + 중력
        ctx.fillStyle = e.color ?? '#fff';
        const n = e.n ?? 6;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + 0.4;
          const speed = 9 + (k % 3) * 3;
          const px = x + Math.cos(ang) * speed * p;
          const py = y + Math.sin(ang) * speed * p - 6 * p + 14 * p * p;
          ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
        }
        break;
      }
      case 'burst': {
        // 8방향 별 모양 타격
        ctx.fillStyle = e.color ?? '#fff';
        const r = 3 + Math.round(p * 5);
        const dirs = [
          [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
        ];
        for (const [dx, dy] of dirs) {
          const k = dx && dy ? 0.7 : 1;
          ctx.fillRect(x + Math.round(dx * r * k), y + Math.round(dy * r * k), 2, 2);
        }
        if (p < 0.4) ctx.fillRect(x - 1, y - 1, 3, 3);
        break;
      }
      case 'puff': {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const r = 1 + Math.round(p * 3);
        ctx.fillRect(x - r, y, 1, 1);
        ctx.fillRect(x + r, y, 1, 1);
        ctx.fillRect(x, y - r, 1, 1);
        ctx.fillRect(x, y + r, 1, 1);
        break;
      }
      case 'boom': {
        const r = 2 + Math.round(p * 10);
        const colors = ['#fff5b0', '#ffc23a', '#ff6a2a', '#5a5a60'];
        ctx.fillStyle = colors[Math.min(3, Math.floor(p * 4))];
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          const rr = r * (a % 2 ? 0.7 : 1);
          ctx.fillRect(x + Math.round(Math.cos(ang) * rr) - 1, y + Math.round(Math.sin(ang) * rr) - 1, 3, 3);
        }
        break;
      }
      case 'text': {
        ctx.globalAlpha = 1 - Math.max(0, p - 0.6) / 0.4;
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#2a1a10';
        const ty = y - Math.round(p * 8);
        ctx.strokeText(e.text ?? '', x, ty);
        ctx.fillStyle = e.color ?? '#fff';
        ctx.fillText(e.text ?? '', x, ty);
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
}
