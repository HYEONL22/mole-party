/**
 * 방 관리 (메모리 저장, DB 없음).
 * 연결(ws) 종류와 무관하게 동작하도록 "보내기 함수"만 받는다.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { sanitizeAvatar, type Avatar } from '../src/shared/avatar';
import { GameEngine } from '../src/shared/engine';
import { rankPlayers } from '../src/shared/game';
import { cleanNickname, nicknameKey } from '../src/shared/nickname';
import {
  MAX_PLAYERS,
  ROOM_CODE_RE,
  type ClientMsg,
  type ErrorCode,
  type PlayerInfo,
  type RoomPhase,
  type ServerMsg,
} from '../src/shared/protocol';

/** 새로고침/다른 앱 다녀오기(카톡으로 링크 보내기 등)를 기다려 주는 시간. 지나면 방에서 제거 */
export const RECONNECT_GRACE_MS = 60_000;

export type Send = (msg: ServerMsg) => void;

interface Player {
  id: string;
  token: string;
  nickname: string;
  avatar: Avatar;
  score: number;
  send: Send | null; // null = 연결 끊김
  removeTimer?: ReturnType<typeof setTimeout>;
}

interface Room {
  code: string;
  hostId: string;
  phase: RoomPhase;
  players: Player[]; // 입장 순서
  game?: GameEngine;
}

/** 한 연결(브라우저 탭)의 상태 */
export interface Conn {
  send: Send;
  room?: Room;
  player?: Player;
}

const rooms = new Map<string, Room>();

// 헷갈리는 글자(0/O, 1/I) 제외
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  for (;;) {
    const bytes = randomBytes(5);
    const code = [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
    if (!rooms.has(code)) return code;
  }
}

const fail = (conn: Conn, code: ErrorCode, message: string) => conn.send({ type: 'error', code, message });

function info(p: Player): PlayerInfo {
  return { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, connected: p.send !== null };
}

function broadcast(room: Room, msg: ServerMsg) {
  for (const p of room.players) p.send?.(msg);
}

function broadcastState(room: Room) {
  broadcast(room, {
    type: 'room_state',
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: room.players.map(info),
  });
}

function attach(conn: Conn, room: Room, player: Player) {
  if (player.removeTimer) clearTimeout(player.removeTimer);
  player.removeTimer = undefined;
  player.send = conn.send;
  conn.room = room;
  conn.player = player;
  conn.send({ type: 'joined', code: room.code, playerId: player.id, token: player.token });
  broadcastState(room);
}

function newPlayer(nickname: string, avatar: unknown): Player {
  return { id: randomUUID().slice(0, 8), token: randomUUID(), nickname, avatar: sanitizeAvatar(avatar), score: 0, send: null };
}

function removePlayer(room: Room, player: Player) {
  if (player.removeTimer) clearTimeout(player.removeTimer);
  const idx = room.players.indexOf(player);
  if (idx < 0) return;
  room.players.splice(idx, 1);
  room.game?.removePlayer(player.id);

  if (room.players.length === 0) {
    room.game?.stop();
    rooms.delete(room.code);
    log(`방 삭제 ${room.code}`);
    return;
  }
  if (room.hostId === player.id) {
    // 다음 참가자에게 방장 위임 (연결된 사람 우선)
    const next = room.players.find((p) => p.send) ?? room.players[0];
    room.hostId = next.id;
  }
  broadcastState(room);
}

/** 현재 연결이 들어가 있는 방에서 즉시 나가기 */
function leave(conn: Conn) {
  const { room, player } = conn;
  conn.room = undefined;
  conn.player = undefined;
  if (room && player && player.send === conn.send) removePlayer(room, player);
}

export function handleMessage(conn: Conn, msg: ClientMsg) {
  switch (msg.type) {
    case 'create_room': {
      const nickname = cleanNickname(msg.nickname);
      if (!nickname) return fail(conn, 'bad_nickname', '닉네임을 입력해 주세요.');
      leave(conn);
      const player = newPlayer(nickname, msg.avatar);
      const room: Room = { code: newCode(), hostId: player.id, phase: 'lobby', players: [player] };
      rooms.set(room.code, room);
      log(`방 생성 ${room.code} (${rooms.size}개)`);
      return attach(conn, room, player);
    }

    case 'join_room': {
      const code = String(msg.code ?? '').trim().toUpperCase();
      const nickname = cleanNickname(msg.nickname);
      const room = ROOM_CODE_RE.test(code) ? rooms.get(code) : undefined;
      if (!room) return fail(conn, 'room_not_found', '방을 찾을 수 없어요. 코드를 확인해 주세요.');
      if (!nickname) return fail(conn, 'bad_nickname', '닉네임을 입력해 주세요.');
      if (conn.room === room) return; // 이미 이 방에 있음
      if (room.phase !== 'lobby') return fail(conn, 'game_started', '이미 게임이 시작된 방이에요. 끝난 뒤에 다시 들어와 주세요.');
      if (room.players.length >= MAX_PLAYERS) return fail(conn, 'room_full', `방이 가득 찼어요. (최대 ${MAX_PLAYERS}명)`);
      const key = nicknameKey(nickname);
      if (room.players.some((p) => nicknameKey(p.nickname) === key)) {
        return fail(conn, 'nickname_taken', `'${nickname}'은(는) 이미 방에 있는 닉네임이에요. 다른 닉네임으로 들어와 주세요.`);
      }
      leave(conn);
      const player = newPlayer(nickname, msg.avatar);
      room.players.push(player);
      return attach(conn, room, player);
    }

    case 'rejoin': {
      const room = rooms.get(String(msg.code ?? '').toUpperCase());
      const player = room?.players.find((p) => p.token === msg.token);
      if (!room || !player) return fail(conn, 'room_not_found', '이전 방에 다시 들어갈 수 없어요.');
      // 같은 자리에 다른 탭이 붙어 있었다면 그 탭은 끊긴 것으로 처리
      if (player.send && player.send !== conn.send) player.send({ type: 'error', code: 'not_in_room', message: '다른 창에서 다시 접속했어요.' });
      // 게임 중 새로고침/재접속 → 이번 판에서는 빠지고 대기실에서 기다린다
      if (room.phase === 'playing') {
        room.game?.removePlayer(player.id);
        player.score = 0;
      }
      return attach(conn, room, player);
    }

    case 'leave_room':
      return leave(conn);

    case 'update_avatar': {
      if (!conn.room || !conn.player) return fail(conn, 'not_in_room', '방에 들어가 있지 않아요.');
      conn.player.avatar = sanitizeAvatar(msg.avatar);
      return broadcastState(conn.room);
    }

    case 'start_game': {
      if (!conn.room || !conn.player) return fail(conn, 'not_in_room', '방에 들어가 있지 않아요.');
      if (conn.room.hostId !== conn.player.id) return fail(conn, 'not_host', '방장만 시작할 수 있어요.');
      if (conn.room.phase !== 'lobby') return fail(conn, 'game_started', '이미 게임이 진행 중이에요.');
      return startGame(conn.room);
    }

    case 'whack': {
      if (conn.room?.phase === 'playing' && conn.player) conn.room.game?.whack(conn.player.id, Number(msg.moleId));
      return;
    }

    case 'ping':
      return conn.send({ type: 'pong', t: Number(msg.t) || 0, serverNow: Date.now() });

    default:
      return fail(conn, 'bad_request', '알 수 없는 요청이에요.');
  }
}

/** 지금 연결된 사람 전원으로 한 판 시작 */
function startGame(room: Room) {
  const ids = room.players.filter((p) => p.send).map((p) => p.id);
  room.players.forEach((p) => (p.score = 0));
  room.phase = 'playing';
  room.game = new GameEngine({
    now: Date.now,
    emit: (msg) => {
      if (msg.type === 'mole_hit') {
        for (const p of room.players) if (msg.scores[p.id] !== undefined) p.score = msg.scores[p.id];
      }
      broadcast(room, msg);
    },
    onEnd: (scores) => endGame(room, scores),
  });
  room.game.start(ids); // game_start를 먼저 보내고
  broadcastState(room); // 그 다음 phase=playing 알림
  log(`게임 시작 ${room.code} (${ids.length}명)`);
}

function endGame(room: Room, scores: Map<string, number>) {
  room.game = undefined;
  room.phase = 'lobby';
  const ranking = rankPlayers(
    room.players.filter((p) => scores.has(p.id)).map((p) => ({ ...info(p), score: scores.get(p.id)! })),
  );
  broadcast(room, { type: 'game_end', ranking });
  broadcastState(room);
  log(`게임 끝 ${room.code}`);
}

/** 연결이 끊김: 바로 지우지 않고 잠시 기다린다 (새로고침 대비) */
export function handleClose(conn: Conn) {
  const { room, player } = conn;
  if (!room || !player || player.send !== conn.send) return;
  player.send = null;
  broadcastState(room);
  player.removeTimer = setTimeout(() => removePlayer(room, player), RECONNECT_GRACE_MS);
}

export function stats() {
  let players = 0;
  for (const r of rooms.values()) players += r.players.length;
  return { rooms: rooms.size, players };
}

function log(s: string) {
  console.log(`[rooms] ${s}`);
}
