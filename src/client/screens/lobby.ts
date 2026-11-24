import { MAX_PLAYERS } from '../../shared/protocol';
import type { Route } from '../app';
import { avatarElement } from '../avatarRender';
import { h } from '../dom';
import { getRoom, inviteLink, isReconnecting, leaveRoom, onRoomChange, startGame } from '../room';

export function lobbyScreen(root: HTMLElement, go: (r: Route) => void, route: { message?: string }): () => void {
  const notice = h('p', { class: 'hint error', role: 'status' }, route.message ?? '');
  const codeEl = h('div', { class: 'room-code', 'aria-label': '방 코드' });
  const countEl = h('span', { class: 'count' });
  const list = h('ul', { class: 'players' });
  const banner = h('div', { class: 'banner', role: 'status' });
  const footer = h('div', { class: 'lobby-foot' });
  const toast = h('p', { class: 'hint copy-hint', role: 'status' });

  const copyLink = async () => {
    const room = getRoom();
    if (!room) return;
    const link = inviteLink(room.code);
    const ok = await copyText(link);
    toast.textContent = ok ? '링크를 복사했어요! 친구에게 보내 주세요.' : `복사가 안 되면 이 주소를 보내 주세요: ${link}`;
  };

  const render = () => {
    const room = getRoom();
    if (!room) return;
    codeEl.replaceChildren(...[...room.code].map((c) => h('span', {}, c)));
    countEl.textContent = `${room.players.length} / ${MAX_PLAYERS}명`;
    banner.textContent = isReconnecting() ? '연결이 끊겼어요. 다시 연결하는 중…' : '';
    banner.classList.toggle('show', isReconnecting());

    list.replaceChildren(
      ...room.players.map((p) =>
        h(
          'li',
          { class: (p.id === room.myId ? 'me ' : '') + (p.connected ? '' : 'away') },
          avatarElement(p.avatar, 2),
          h('span', { class: 'nick' }, p.nickname),
          h(
            'span',
            { class: 'tags' },
            p.id === room.hostId ? h('em', { class: 'tag host' }, '👑 방장') : null,
            p.id === room.myId ? h('em', { class: 'tag' }, '나') : null,
            p.connected ? null : h('em', { class: 'tag away' }, '연결 끊김'),
          ),
        ),
      ),
    );

    const isHost = room.hostId === room.myId;
    const playing = room.phase === 'playing';
    footer.replaceChildren(
      playing
        ? h('p', { class: 'waiting playing' }, '🔨 지금 게임 중이에요. 판이 끝나면 결과가 바로 나와요.')
        : isHost
          ? h('button', { class: 'btn primary', onclick: () => startGame() }, '게임 시작')
          : h('p', { class: 'waiting' }, '방장이 시작하기를 기다리는 중…'),
      notice,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => go({ name: 'customize', back: { name: 'lobby' } }) }, '캐릭터 바꾸기'),
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              leaveRoom();
              go({ name: 'start' });
            },
          },
          '나가기',
        ),
      ),
    );
  };

  root.append(
    h(
      'main',
      { class: 'screen lobby' },
      banner,
      h('h2', {}, '대기실'),
      h(
        'div',
        { class: 'code-box' },
        h('small', {}, '방 코드'),
        codeEl,
        h('button', { class: 'btn small primary', onclick: () => void copyLink() }, '🔗 초대 링크 복사'),
        toast,
      ),
      h('div', { class: 'players-head' }, h('h3', {}, '참가자'), countEl),
      list,
      footer,
    ),
  );

  const off = onRoomChange((e) => {
    if (e.kind === 'lost') go({ name: 'start', message: e.message, error: true });
    else if (e.kind === 'game_start') go({ name: 'game', mode: 'multi' });
    else if (e.kind === 'game_end') {
      const room = getRoom();
      if (room) go({ name: 'result', ranking: e.ranking, myId: room.myId, mode: 'multi' });
    } else if (e.kind === 'notice') notice.textContent = e.message;
    else render();
  });
  if (!getRoom()) {
    queueMicrotask(() => go({ name: 'start' }));
    return off;
  }
  render();
  return off;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http(같은 와이파이 테스트) 환경에서는 clipboard API가 막혀 있음 → 예전 방식
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
