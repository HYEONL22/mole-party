/**
 * 지금 들어가 있는 방의 상태 + 입장/퇴장/재접속.
 * 화면들은 onRoomChange로 변화를 구독한다.
 */
import type { Avatar } from '../shared/avatar';
import type { PlayerInfo, RankEntry, RoomPhase, ServerMsg } from '../shared/protocol';
import { net } from './net';
import { loadRoomSession, saveRoomSession } from './storage';

export interface RoomView {
  code: string;
  myId: string;
  hostId: string;
  phase: RoomPhase;
  players: PlayerInfo[];
}

export type RoomEvent =
  | { kind: 'update' }
  | { kind: 'reconnecting' }
  /** 방에서 나가게 됨 (연결 복구 실패, 다른 창에서 접속 등) */
  | { kind: 'lost'; message: string }
  /** 내가 참가하는 판이 시작됨 */
  | { kind: 'game_start' }
  | { kind: 'game_end'; ranking: RankEntry[] }
  /** 시작 실패 등 알림 */
  | { kind: 'notice'; message: string };

let room: RoomView | null = null;
let reconnecting = false;
/** 이번 판에 받은 메시지 (게임 화면이 늦게 열려도 처음부터 재생) */
let gameLog: ServerMsg[] = [];
const listeners = new Set<(e: RoomEvent) => void>();

export const getRoom = () => room;
export const isReconnecting = () => reconnecting;
export const getGameLog = () => gameLog;

export function onRoomChange(fn: (e: RoomEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const emit = (e: RoomEvent) => listeners.forEach((fn) => fn(e));

net.on((msg) => {
  if (msg.type === 'room_state' && room && msg.code === room.code) {
    room = { ...room, hostId: msg.hostId, phase: msg.phase, players: msg.players };
    emit({ kind: 'update' });
  } else if (msg.type === 'error' && msg.code === 'not_in_room' && room) {
    drop(msg.message);
  } else if (msg.type === 'error' && room && (msg.code === 'not_host' || msg.code === 'game_started')) {
    emit({ kind: 'notice', message: msg.message });
  } else if (msg.type === 'game_start' && room) {
    gameLog = [msg];
    emit({ kind: 'game_start' });
  } else if ((msg.type === 'mole_spawn' || msg.type === 'mole_hit') && room && gameLog.length) {
    gameLog.push(msg);
  } else if (msg.type === 'game_end' && room) {
    gameLog = [];
    emit({ kind: 'game_end', ranking: msg.ranking });
  }
});

export function startGame() {
  net.send({ type: 'start_game' });
}

net.onClose(() => {
  if (room && !reconnecting) void reconnect();
});

function drop(message: string) {
  room = null;
  gameLog = [];
  saveRoomSession(null);
  setUrlRoom(null);
  emit({ kind: 'lost', message });
}

export function setUrlRoom(code: string | null) {
  const url = code ? `${location.pathname}?room=${code}` : location.pathname;
  history.replaceState(null, '', url);
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

type Joined = Extract<ServerMsg, { type: 'joined' }>;
type Failed = Extract<ServerMsg, { type: 'error' }>;
type JoinReply = Joined | Failed;

/** 입장 요청을 보내고 joined/error 중 먼저 온 답을 기다린다. 실패하면 사람이 읽을 메시지를 돌려준다 */
async function enter(send: () => void): Promise<string | null> {
  try {
    await net.connect();
  } catch {
    return '서버에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  }
  const reply = net.waitFor((m): m is JoinReply => m.type === 'joined' || (m.type === 'error' && !!m.code));
  const state = net
    .waitFor((m): m is Extract<ServerMsg, { type: 'room_state' }> => m.type === 'room_state')
    .catch(() => null);
  send();
  let r: JoinReply;
  try {
    r = await reply;
  } catch {
    return '서버 응답이 없어요. 잠시 후 다시 시도해 주세요.';
  }
  if (r.type === 'error') return r.message;

  const s = await state;
  room = {
    code: r.code,
    myId: r.playerId,
    hostId: s?.hostId ?? r.playerId,
    phase: s?.phase ?? 'lobby',
    players: s?.players ?? [],
  };
  saveRoomSession({ code: r.code, token: r.token });
  setUrlRoom(r.code);
  emit({ kind: 'update' });
  return null;
}

export function createRoom(nickname: string, avatar: Avatar) {
  return enter(() => net.send({ type: 'create_room', nickname, avatar }));
}

export function joinRoom(code: string, nickname: string, avatar: Avatar) {
  return enter(() => net.send({ type: 'join_room', code: code.toUpperCase(), nickname, avatar }));
}

/** 이 탭에 저장된 자리로 복귀 시도 (새로고침 후) */
export async function rejoinSaved(): Promise<boolean> {
  const s = loadRoomSession();
  if (!s) return false;
  const err = await enter(() => net.send({ type: 'rejoin', code: s.code, token: s.token }));
  if (err) saveRoomSession(null);
  return !err;
}

export function leaveRoom() {
  net.send({ type: 'leave_room' });
  room = null;
  gameLog = [];
  saveRoomSession(null);
  setUrlRoom(null);
}

export function sendAvatar(avatar: Avatar) {
  if (room) net.send({ type: 'update_avatar', avatar });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 화면이 다시 보일 때까지 기다림 (백그라운드에서는 시도해도 대부분 실패하므로) */
const whenVisible = () =>
  document.hidden
    ? new Promise<void>((r) => {
        const on = () => {
          if (!document.hidden) {
            document.removeEventListener('visibilitychange', on);
            r();
          }
        };
        document.addEventListener('visibilitychange', on);
      })
    : Promise.resolve();

/**
 * 연결이 끊기면 다시 붙는다.
 * 1) 같은 자리로 복귀 (서버는 끊긴 사람 자리를 60초 동안 남겨 둔다)
 * 2) 자리가 사라졌으면 같은 닉네임으로 새로 입장 (대기실일 때만 가능)
 * 3) 그것도 안 되면 이유를 알려 주고 시작 화면으로
 */
async function reconnect() {
  reconnecting = true;
  emit({ kind: 'reconnecting' });
  const s = loadRoomSession();
  const me = room?.players.find((p) => p.id === room?.myId);

  for (let attempt = 0; attempt < 10 && s && room; attempt++) {
    await whenVisible();
    await sleep(attempt === 0 ? 200 : Math.min(500 + attempt * 1000, 4000));
    const err = await enter(() => net.send({ type: 'rejoin', code: s.code, token: s.token }));
    if (!err) {
      reconnecting = false;
      emit({ kind: 'update' });
      return;
    }
    if (net.isOpen) {
      // 서버는 살아 있는데 내 자리가 없음 → 새로 입장 시도
      const joinErr = me ? await enter(() => net.send({ type: 'join_room', code: s.code, nickname: me.nickname, avatar: me.avatar })) : err;
      reconnecting = false;
      if (!joinErr) {
        emit({ kind: 'update' });
        return;
      }
      drop(`방에 다시 들어가지 못했어요. (${joinErr})`);
      return;
    }
  }
  reconnecting = false;
  if (room) drop('서버와 연결이 끊겨서 방에서 나왔어요. 인터넷 연결을 확인하고 다시 들어와 주세요.');
}

// 다른 앱에 다녀왔을 때: 연결이 살아 있는지 확인하고, 끊겼으면 바로 재연결
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !room) return;
    if (net.isOpen) net.checkAlive();
    else if (!reconnecting) void reconnect();
  });
}
