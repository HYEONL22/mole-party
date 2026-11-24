import type { Avatar } from '../shared/avatar';
import type { RankEntry } from '../shared/protocol';
import { loadAvatar, loadNickname } from './storage';

/** 앱 전역 상태 */
export const state = {
  nickname: loadNickname(),
  avatar: loadAvatar() as Avatar,
};

export type Route =
  | { name: 'start'; code?: string; message?: string; error?: boolean }
  | { name: 'connecting'; text: string }
  | { name: 'lobby'; message?: string }
  | { name: 'customize'; back: Route }
  | { name: 'game'; mode: GameMode }
  | { name: 'result'; ranking: RankEntry[]; myId: string; mode: GameMode };

/** solo: 혼자 연습 / multi: 방에서 같이 / practice: 방에 머문 채로 혼자 연습 (친구 기다리는 동안) */
export type GameMode = 'solo' | 'multi' | 'practice';
