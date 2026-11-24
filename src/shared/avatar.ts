import { HAT_COLORS, TOP_COLORS } from './avatarParts';

/** 바꿀 수 있는 것: 모자 색, 반팔티 색 */
export interface Avatar {
  hatColor: number;
  topColor: number;
}

export type AvatarKey = keyof Avatar;

/** 각 항목의 선택 개수. 색 배열 길이에서 계산하므로 색 추가 시 자동 반영. */
export const AVATAR_OPTION_COUNTS: Record<AvatarKey, number> = {
  hatColor: HAT_COLORS.length,
  topColor: TOP_COLORS.length,
};

export const AVATAR_KEYS = Object.keys(AVATAR_OPTION_COUNTS) as AvatarKey[];

export const DEFAULT_AVATAR: Avatar = { hatColor: 0, topColor: 0 };

/** 알 수 없는 입력(localStorage, 네트워크)을 안전한 Avatar로 정규화 */
export function sanitizeAvatar(input: unknown): Avatar {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_AVATAR };
  for (const key of AVATAR_KEYS) {
    const v = src[key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_OPTION_COUNTS[key]) {
      out[key] = v;
    }
  }
  return out;
}

export function randomAvatar(rand: () => number = Math.random): Avatar {
  const out = { ...DEFAULT_AVATAR };
  for (const key of AVATAR_KEYS) out[key] = Math.floor(rand() * AVATAR_OPTION_COUNTS[key]);
  return out;
}
