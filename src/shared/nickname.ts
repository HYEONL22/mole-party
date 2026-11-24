export const NICKNAME_MAX = 10;

/** 공백 정리 + 최대 길이 자르기. 빈 문자열이면 사용할 수 없는 닉네임 */
export function cleanNickname(n: unknown): string {
  if (typeof n !== 'string') return '';
  return n.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

/** 중복 검사용 비교 키 (대소문자·공백 무시) */
export function nicknameKey(n: string): string {
  return cleanNickname(n).replace(/\s/g, '').toLowerCase();
}
