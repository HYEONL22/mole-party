/**
 * 게임 화면이 쓰는 연결 인터페이스와 그 구현 두 가지.
 *  - LocalSession: 혼자 연습 (엔진을 브라우저 안에서 돌림)
 *  - NetSession:   같이 하기 (서버가 엔진을 돌리고 메시지만 받음)
 */
import { GameEngine } from '../shared/engine';
import { rankPlayers } from '../shared/game';
import type { ClientMsg, PlayerInfo, ServerMsg } from '../shared/protocol';
import { net } from './net';
import { getGameLog, getRoom } from './room';

export interface GameSession {
  readonly myId: string;
  send(msg: ClientMsg): void;
  /** 등록하는 순간, 이미 받아 둔 이번 판 메시지부터 차례로 전달된다 */
  onMessage(handler: (msg: ServerMsg) => void): void;
  /** 서버 기준 현재 시각(ms) */
  now(): number;
  close(): void;
}

export class LocalSession implements GameSession {
  readonly myId: string;
  private handler: (msg: ServerMsg) => void = () => {};
  private engine: GameEngine | null = null;

  constructor(private me: PlayerInfo) {
    this.myId = me.id;
  }

  now(): number {
    return Date.now();
  }

  onMessage(handler: (msg: ServerMsg) => void): void {
    this.handler = handler;
  }

  send(msg: ClientMsg): void {
    // 네트워크 흉내: 다음 틱에 처리
    setTimeout(() => {
      if (msg.type === 'start_game') this.start();
      else if (msg.type === 'whack') this.engine?.whack(this.myId, msg.moleId);
    }, 0);
  }

  close(): void {
    this.engine?.stop();
    this.engine = null;
  }

  private start() {
    this.engine?.stop();
    this.engine = new GameEngine({
      now: () => this.now(),
      emit: (m) => this.handler(m),
      onEnd: (scores) =>
        this.handler({ type: 'game_end', ranking: rankPlayers([{ ...this.me, score: scores.get(this.myId) ?? 0 }]) }),
    });
    this.engine.start([this.myId]);
  }
}

const GAME_TYPES = new Set<ServerMsg['type']>(['game_start', 'mole_spawn', 'mole_hit', 'game_end']);

export class NetSession implements GameSession {
  readonly myId: string;
  private off: (() => void) | null = null;

  constructor() {
    this.myId = getRoom()?.myId ?? '';
  }

  now(): number {
    return net.serverNow();
  }

  onMessage(handler: (msg: ServerMsg) => void): void {
    for (const m of getGameLog()) handler(m);
    this.off = net.on((m) => {
      if (GAME_TYPES.has(m.type)) handler(m);
    });
  }

  send(msg: ClientMsg): void {
    net.send(msg);
  }

  close(): void {
    this.off?.();
    this.off = null;
  }
}
