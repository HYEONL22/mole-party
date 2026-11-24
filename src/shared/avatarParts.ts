/**
 * 캐릭터 파츠 정의 (데이터 전용, DOM 의존 없음 → 서버에서도 import 가능).
 *
 * 캐릭터는 정면을 보는 증명사진 느낌의 32x32 도트 (머리 + 어깨).
 * 얼굴·머리는 모두 같고, 바꿀 수 있는 것은 "모자 색"과 "반팔티 색" 두 가지.
 *
 * 대부분 좌우 대칭이라 m([...]) 으로 "왼쪽 절반 16칸"만 적으면 오른쪽은 자동으로 거울 복사된다.
 *
 * 픽셀 코드
 *   .  투명(아래 레이어 유지)
 *   O  외곽선          S 피부   s 피부 그늘   p 볼터치
 *   E  속눈썹/눈선      I 눈동자  i 눈동자 그늘  W 흰색   M 입
 *   H  머리색  h 머리 그늘  X 머리 외곽선      (머리색은 고정)
 *   C  모자색  c 모자 그늘  y 모자 하이라이트  Z 모자 외곽선
 *   T  티셔츠색  t 티셔츠 그늘
 *
 * 색을 추가하려면 HAT_COLORS / TOP_COLORS 배열에 한 줄만 추가하면 된다.
 */

export interface Layer {
  x: number;
  y: number;
  rows: string[];
}

export interface ColorOption {
  name: string;
  color: string;
}

export const GRID = 32;
const HALF = GRID / 2;

/** 왼쪽 절반(16칸)을 적으면 좌우 대칭 32칸 행으로 만든다 */
export function m(halves: string[]): string[] {
  return halves.map((left) => {
    if (left.length !== HALF) throw new Error(`avatarParts: 반쪽 행은 ${HALF}칸이어야 함: "${left}"`);
    return left + [...left].reverse().join('');
  });
}

// ---------- 색상 ----------

export const HAT_COLORS: ColorOption[] = [
  { name: '빨강', color: '#d94a4a' },
  { name: '주황', color: '#f08a3a' },
  { name: '노랑', color: '#f2c94c' },
  { name: '초록', color: '#5daa68' },
  { name: '하늘', color: '#6fb3ea' },
  { name: '남색', color: '#3a4a8f' },
  { name: '보라', color: '#9a6ad6' },
  { name: '검정', color: '#33333d' },
];

export const TOP_COLORS: ColorOption[] = [
  { name: '흰색', color: '#f4f4f6' },
  { name: '연회색', color: '#cfd0d6' },
  { name: '검정', color: '#3a3a44' },
  { name: '분홍', color: '#f4b6c4' },
  { name: '하늘', color: '#a3cbef' },
  { name: '노랑', color: '#f6dc84' },
  { name: '초록', color: '#86bf8e' },
  { name: '빨강', color: '#d65a5a' },
];

/** 고정 색상 코드 */
export const FIXED_COLORS: Record<string, string> = {
  S: '#fde3d6',
  s: '#f0c3b3',
  p: '#f6a9a6',
  O: '#3d2b2e',
  E: '#2b1d20',
  I: '#5b3a33',
  i: '#3a2422',
  W: '#ffffff',
  M: '#c4615c',
  H: '#4a3330',
  h: '#3a2624',
  X: '#2a1b1a',
};

// ---------- 얼굴 + 목 ----------

export const BASE_HEAD: Layer = {
  x: 0,
  y: 0,
  rows: m([
    '................',
    '................',
    '................',
    '................',
    '................',
    '...........OOOOO',
    '.........OOSSSSS',
    '........OSSSSSSS',
    '.......OSSSSSSSS',
    '......OSSSSSSSSS',
    '......OSSSSSSSSS',
    '......OSSSSSSSSS',
    '.....OOSSSSSSSSS',
    '....OSSSSSSSSSSS',
    '....OSsSSSSSSSSS',
    '....OSsSSSSSSSSS',
    '....OSSSSSSSSSSS',
    '.....OOSSSSSSSSS',
    '......OSppSSSSSS',
    '.......OSSSSSSSS',
    '........OSSSSSSS',
    '.........OOSSSSS',
    '...........OOsss',
    '............Osss',
    '............OSSS',
    '............OSSS',
    '............OSSS',
    '............OSSS',
    '............OSSS',
    '............OSSS',
    '............OSSS',
    '............OSSS',
  ]),
};

/** 표정 (고정) */
export const FACE: Layer = {
  x: 0,
  y: 11,
  rows: m([
    '................',
    '................',
    '........EEEEE...',
    '.........IWIi...',
    '.........IIIi...',
    '.........iIIi...',
    '................',
    '................',
    '...............M',
  ]),
};

/** 모자 아래로 보이는 옆머리 (고정) */
export const HAIR: Layer = {
  x: 0,
  y: 9,
  rows: m(['......XHHHHHHHHH', '......XHHhHHHhHH', '......XHHh......', '......XHh.......', '......XH........']),
};

/** 정면에서 본 야구모자 */
export const HAT: Layer = {
  x: 0,
  y: 1,
  rows: m([
    '..........ZZZZZZ',
    '........ZZCCCCCC',
    '.......ZCCCCyyCC',
    '......ZCCCCyCCCC',
    '.....ZCCCCCCCCCC',
    '.....ZCCCCCCCCCW',
    '.....ZcCCCCCCCCC',
    '...ZZZZZZZZZZZZZ',
    '...Zcccccccccccc',
    '...ZZZZZZZZZZZZZ',
  ]),
};

/** 반팔티 (어깨까지만 보임) */
export const TSHIRT: Layer = {
  x: 0,
  y: 24,
  rows: m([
    '................',
    '.......OOOOOOtSS',
    '.....OTTTTTTTttt',
    '....OTTTTTTTTTTT',
    '...OTTTTTTTTTTTT',
    '..OtTTTTTTTTTTTT',
    '.OTtTTTTTTTTTTTT',
    '.OTtTTTTTTTTTTTT',
  ]),
};
