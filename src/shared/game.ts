/** 게임 규칙 (지시서 7장 + 추가 요소). 서버와 로컬 세션이 같은 코드를 사용한다. */
import type { MoleKind, PlayerInfo, RankEntry } from './protocol';

export const ROUND_MS = 50_000;
export const COUNTDOWN_MS = 3_000;
/** 두더지가 들어간 직후 도착한 타격도 인정해 주는 여유 (네트워크 지연 보정) */
export const LATE_GRACE_MS = 150;
export const HOLES = 9;

export const SPAWN_GAP_MIN = 300;
export const SPAWN_GAP_MAX = 1200;
export const STAY_MIN = 800;
export const STAY_MAX = 1500;
/** 같은 구멍에 다음 두더지가 나오기 전 최소 간격 */
export const HOLE_COOLDOWN = 200;

/** 피버 타임: 마지막 10초. 출현 간격 절반, 득점(+)은 2배 */
export const FEVER_MS = 10_000;
export const FEVER_GAP_FACTOR = 0.5;
export const FEVER_MULTIPLIER = 2;

/** 콤보: 감점 없이 연속으로 맞히면 COMBO_STEP마다 보너스 */
export const COMBO_STEP = 5;
export const COMBO_BONUS = 2;

/**
 * 두더지 종류. 출현 확률(chance)의 나머지는 일반 두더지.
 * - decoy  가짜 두더지: 빨간 코 + 찌푸린 눈썹. 누르면 감점
 * - flash  번개 두더지: 아주 잠깐만 나옴
 * - trick  변신 두더지: 황금으로 나왔다가 중간에 폭탄으로 바뀜 (누른 순간의 모습으로 판정)
 */
export const KINDS: Record<MoleKind, { points: number; chance: number; stay?: [number, number] }> = {
  normal: { points: 1, chance: 0 },
  gold: { points: 3, chance: 0.1 },
  bomb: { points: -2, chance: 0.1 },
  decoy: { points: -1, chance: 0.1 },
  flash: { points: 2, chance: 0.08, stay: [450, 650] },
  trick: { points: 0, chance: 0.06, stay: [1200, 1600] },
};

export interface MoleSpec {
  moleId: number;
  hole: number;
  kind: MoleKind;
  spawnAt: number;
  despawnAt: number;
  /** trick 전용: 이 시각부터 폭탄 */
  switchAt?: number;
}

const between = (rand: () => number, min: number, max: number) => min + rand() * (max - min);

function pickKind(r: number): MoleKind {
  let acc = 0;
  for (const kind of Object.keys(KINDS) as MoleKind[]) {
    acc += KINDS[kind].chance;
    if (r < acc) return kind;
  }
  return 'normal';
}

export function isFever(t: number, startAt: number, durationMs: number): boolean {
  return t >= startAt + durationMs - FEVER_MS && t < startAt + durationMs;
}

/** 라운드 전체의 두더지 출현 일정을 미리 생성 */
export function generateSchedule(startAt: number, durationMs = ROUND_MS, rand: () => number = Math.random): MoleSpec[] {
  const endAt = startAt + durationMs;
  const busyUntil = new Array<number>(HOLES).fill(0);
  const list: MoleSpec[] = [];
  let t = startAt + 400;
  let id = 1;

  while (t < endAt - 450) {
    const free: number[] = [];
    for (let h = 0; h < HOLES; h++) if (busyUntil[h] + HOLE_COOLDOWN <= t) free.push(h);

    if (free.length > 0) {
      const hole = free[Math.floor(rand() * free.length)];
      const kind = pickKind(rand());
      const [smin, smax] = KINDS[kind].stay ?? [STAY_MIN, STAY_MAX];
      const despawnAt = Math.min(Math.round(t + between(rand, smin, smax)), endAt);
      const spec: MoleSpec = { moleId: id++, hole, kind, spawnAt: Math.round(t), despawnAt };
      if (kind === 'trick') {
        spec.switchAt = Math.round(spec.spawnAt + (despawnAt - spec.spawnAt) * between(rand, 0.4, 0.6));
      }
      list.push(spec);
      busyUntil[hole] = despawnAt;
    }
    const gap = between(rand, SPAWN_GAP_MIN, SPAWN_GAP_MAX);
    t += isFever(t, startAt, durationMs) ? gap * FEVER_GAP_FACTOR : gap;
  }
  return list;
}

/** 시각 t에 이 두더지가 실제로 무엇인가 (trick은 switchAt 기준으로 황금/폭탄) */
export function effectiveKind(m: Pick<MoleSpec, 'kind' | 'switchAt'>, t: number): Exclude<MoleKind, 'trick'> {
  if (m.kind === 'trick') return t < (m.switchAt ?? Infinity) ? 'gold' : 'bomb';
  return m.kind;
}

export interface HitResult {
  next: number;
  /** 실제로 변한 점수 (보너스 포함, 최저 0점 반영) */
  delta: number;
  combo: number;
  /** 이번에 받은 콤보 보너스 (0이면 없음) */
  bonus: number;
}

/** 점수 계산: 피버 2배(+만), 콤보 보너스, 최저 0점 */
export function scoreHit(score: number, combo: number, kind: Exclude<MoleKind, 'trick'>, fever: boolean): HitResult {
  const base = KINDS[kind].points;
  if (base < 0) {
    const next = Math.max(0, score + base);
    return { next, delta: next - score, combo: 0, bonus: 0 };
  }
  const nextCombo = combo + 1;
  const bonus = nextCombo % COMBO_STEP === 0 ? COMBO_BONUS : 0;
  const gain = base * (fever ? FEVER_MULTIPLIER : 1) + bonus;
  return { next: score + gain, delta: gain, combo: nextCombo, bonus };
}

/** 점수 내림차순, 동점은 공동 순위 (1, 1, 3 …) */
export function rankPlayers(players: PlayerInfo[]): RankEntry[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((p) => {
    const firstSame = sorted.findIndex((q) => q.score === p.score);
    return { rank: firstSame + 1, id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score };
  });
}
