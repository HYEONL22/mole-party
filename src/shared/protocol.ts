/** 실시간 메시지 규격 (지시서 8장 + 방 입장/재접속에 필요한 메시지 추가). */
import type { Avatar } from './avatar';

export type MoleKind = 'normal' | 'gold' | 'bomb' | 'decoy' | 'flash' | 'trick';

export const MAX_PLAYERS = 8;
export const ROOM_CODE_RE = /^[A-Z0-9]{5}$/;

export interface PlayerInfo {
  id: string;
  nickname: string;
  avatar: Avatar;
  score: number;
  /** 새로고침 등으로 잠시 끊긴 상태면 false */
  connected: boolean;
}

export interface RankEntry {
  rank: number;
  id: string;
  nickname: string;
  avatar: Avatar;
  score: number;
}

export type RoomPhase = 'lobby' | 'playing';

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'game_started'
  | 'nickname_taken'
  | 'bad_nickname'
  | 'not_host'
  | 'not_in_room'
  | 'not_ready'
  | 'bad_request';

// 클라이언트 → 서버
export type ClientMsg =
  | { type: 'create_room'; nickname: string; avatar: Avatar }
  | { type: 'join_room'; code: string; nickname: string; avatar: Avatar }
  /** 새로고침 후 같은 자리로 복귀 (token은 joined에서 받은 값) */
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'leave_room' }
  | { type: 'update_avatar'; avatar: Avatar }
  | { type: 'start_game' }
  | { type: 'whack'; moleId: number }
  /** 시계 맞추기: t는 보낸 순간의 클라이언트 시각 */
  | { type: 'ping'; t: number };

// 서버 → 클라이언트
export type ServerMsg =
  /** 방 입장 성공. token은 재접속용 비밀값(이 탭에만 저장) */
  | { type: 'joined'; code: string; playerId: string; token: string }
  | { type: 'room_state'; code: string; hostId: string; phase: RoomPhase; players: PlayerInfo[] }
  | { type: 'game_start'; startAt: number; durationMs: number }
  | { type: 'mole_spawn'; moleId: number; hole: number; kind: MoleKind; spawnAt: number; despawnAt: number; switchAt?: number }
  | {
      type: 'mole_hit';
      moleId: number;
      playerId: string;
      scoreDelta: number;
      scores: Record<string, number>;
      /** 판정 시점의 실제 종류 (trick이면 gold 또는 bomb) */
      hitKind: MoleKind;
      combo: number;
      bonus: number;
      fever: boolean;
    }
  | { type: 'game_end'; ranking: RankEntry[] }
  | { type: 'pong'; t: number; serverNow: number }
  | { type: 'error'; message: string; code?: ErrorCode };
