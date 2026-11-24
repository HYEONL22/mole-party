/**
 * 한 판의 진행과 판정. 서버(server/rooms.ts)와 혼자 연습(client/localSession.ts)이 같이 쓴다.
 * 판정 기준은 "이 엔진이 whack을 받은 순서와 시각" — 먼저 도착한 한 명만 득점.
 */
import {
  COUNTDOWN_MS,
  LATE_GRACE_MS,
  ROUND_MS,
  effectiveKind,
  generateSchedule,
  isFever,
  scoreHit,
  type MoleSpec,
} from './game';
import type { ServerMsg } from './protocol';

/** 두더지 출현을 이만큼 미리 알려 준다 (네트워크 지연을 흡수해 spawnAt 정각에 화면에 나오게) */
export const SPAWN_LEAD_MS = 300;

type Timer = ReturnType<typeof setTimeout>;

export interface EngineOptions {
  now: () => number;
  /** 참가자 전원에게 보내기 */
  emit: (msg: ServerMsg) => void;
  /** 시간이 끝났을 때 최종 점수 (판 도중 나간 사람은 빠져 있음) */
  onEnd: (scores: Map<string, number>) => void;
  durationMs?: number;
}

export class GameEngine {
  readonly startAt: number;
  readonly durationMs: number;
  private timers: Timer[] = [];
  private moles = new Map<number, MoleSpec & { hitBy?: string }>();
  private players = new Map<string, { score: number; combo: number }>();
  private running = false;

  constructor(private opts: EngineOptions) {
    this.durationMs = opts.durationMs ?? ROUND_MS;
    this.startAt = opts.now() + COUNTDOWN_MS;
  }

  start(playerIds: string[]) {
    this.running = true;
    for (const id of playerIds) this.players.set(id, { score: 0, combo: 0 });
    this.opts.emit({ type: 'game_start', startAt: this.startAt, durationMs: this.durationMs });

    for (const spec of generateSchedule(this.startAt, this.durationMs)) {
      this.at(spec.spawnAt - SPAWN_LEAD_MS, () => {
        this.moles.set(spec.moleId, { ...spec });
        this.opts.emit({ type: 'mole_spawn', ...spec });
      });
    }
    this.at(this.startAt + this.durationMs + LATE_GRACE_MS, () => {
      this.running = false;
      this.clearTimers();
      this.opts.onEnd(this.scores());
    });
  }

  whack(playerId: string, moleId: number) {
    const player = this.players.get(playerId);
    const mole = this.moles.get(moleId);
    const t = this.opts.now();
    if (!this.running || !player || !mole || mole.hitBy) return;
    if (t < mole.spawnAt || t > mole.despawnAt + LATE_GRACE_MS) return;

    mole.hitBy = playerId;
    // 늦게 도착한 탭은 사라지기 직전의 모습으로 판정
    const judgedAt = Math.min(t, mole.despawnAt);
    const hitKind = effectiveKind(mole, judgedAt);
    const fever = isFever(judgedAt, this.startAt, this.durationMs);
    const r = scoreHit(player.score, player.combo, hitKind, fever);
    player.score = r.next;
    player.combo = r.combo;

    this.opts.emit({
      type: 'mole_hit',
      moleId,
      playerId,
      scoreDelta: r.delta,
      scores: Object.fromEntries(this.scores()),
      hitKind,
      combo: r.combo,
      bonus: r.bonus,
      fever,
    });
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  scores(): Map<string, number> {
    return new Map([...this.players].map(([id, p]) => [id, p.score]));
  }

  stop() {
    this.running = false;
    this.clearTimers();
  }

  private at(when: number, fn: () => void) {
    this.timers.push(setTimeout(fn, Math.max(0, when - this.opts.now())));
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }
}
