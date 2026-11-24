import { DEFAULT_AVATAR, sanitizeAvatar, type Avatar } from '../shared/avatar';

export { NICKNAME_MAX, cleanNickname } from '../shared/nickname';

const AVATAR_KEY = 'moleparty.avatar3';
const NICK_KEY = 'moleparty.nickname';
/** 방 재접속 정보는 탭마다 따로 (같은 PC에서 탭 두 개로 테스트 가능) */
const SESSION_KEY = 'moleparty.session';

function read(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: Storage | undefined, key: string, value: string | null): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* 저장 불가(사생활 보호 모드 등) — 이번 접속 동안만 유지 */
  }
}

const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

export function loadAvatar(): Avatar {
  const raw = read(local(), AVATAR_KEY);
  if (!raw) return { ...DEFAULT_AVATAR };
  try {
    return sanitizeAvatar(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

export function saveAvatar(a: Avatar): void {
  write(local(), AVATAR_KEY, JSON.stringify(a));
}

export function loadNickname(): string {
  return read(local(), NICK_KEY) ?? '';
}

export function saveNickname(n: string): void {
  write(local(), NICK_KEY, n);
}

export interface RoomSession {
  code: string;
  token: string;
}

export function loadRoomSession(): RoomSession | null {
  const raw = read(session(), SESSION_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v?.code === 'string' && typeof v?.token === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function saveRoomSession(s: RoomSession | null): void {
  write(session(), SESSION_KEY, s ? JSON.stringify(s) : null);
}
