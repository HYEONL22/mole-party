/** 서버와의 WebSocket 연결 하나를 관리 */
import type { ClientMsg, ServerMsg } from '../shared/protocol';

type Handler = (msg: ServerMsg) => void;

/** 무료 호스팅은 잠들어 있다가 깨는 데 최대 1분 정도 걸릴 수 있다 */
const CONNECT_TIMEOUT_MS = 70_000;

class Net {
  private ws: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private handlers = new Set<Handler>();
  private closeHandlers = new Set<() => void>();
  /** 서버 시계 - 내 시계 (ms) */
  private offset = 0;
  private bestRtt = Infinity;

  /** 서버 기준 현재 시각. 두더지 출현/판정 시각과 맞추는 데 쓴다 */
  serverNow(): number {
    return Date.now() + this.offset;
  }

  /** 핑을 몇 번 보내서 왕복 시간이 가장 짧았던 측정값으로 시계 차이를 잡는다 */
  private syncClock() {
    this.bestRtt = Infinity;
    for (let i = 0; i < 6; i++) setTimeout(() => this.send({ type: 'ping', t: Date.now() }), i * 150);
  }

  private pongWaiters = new Set<() => void>();

  /**
   * 폰에서 다른 앱에 다녀오면 연결이 "열린 척" 죽어 있는 경우가 있다.
   * 핑을 보내 3초 안에 답이 없으면 끊고 재연결 흐름(onClose)으로 넘긴다.
   */
  checkAlive() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    let answered = false;
    const done = () => (answered = true);
    this.pongWaiters.add(done);
    this.send({ type: 'ping', t: Date.now() });
    setTimeout(() => {
      this.pongWaiters.delete(done);
      if (!answered && this.ws === ws) ws.close();
    }, 3000);
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    if (this.opening) return this.opening;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    this.opening = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('timeout'));
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        this.syncClock();
        resolve();
      };
      ws.onerror = () => {
        /* onclose에서 처리 */
      };
      ws.onclose = () => {
        clearTimeout(timer);
        reject(new Error('closed'));
        if (this.ws === ws) {
          this.ws = null;
          this.closeHandlers.forEach((h) => h());
        }
      };
      ws.onmessage = (e) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.type === 'pong') {
          this.pongWaiters.forEach((fn) => fn());
          this.pongWaiters.clear();
          const rtt = Date.now() - msg.t;
          if (rtt >= 0 && rtt < this.bestRtt) {
            this.bestRtt = rtt;
            this.offset = msg.serverNow + rtt / 2 - Date.now();
          }
          return;
        }
        this.handlers.forEach((h) => h(msg));
      };
    }).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  send(msg: ClientMsg): boolean {
    if (!this.isOpen) return false;
    this.ws!.send(JSON.stringify(msg));
    return true;
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  onClose(h: () => void): () => void {
    this.closeHandlers.add(h);
    return () => this.closeHandlers.delete(h);
  }

  /** 다음에 오는 메시지 중 조건에 맞는 첫 번째를 기다린다 */
  waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, timeoutMs = 10_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const off = this.on((m) => {
        if (pred(m)) {
          clearTimeout(timer);
          off();
          resolve(m);
        }
      });
      const timer = setTimeout(() => {
        off();
        reject(new Error('timeout'));
      }, timeoutMs);
    });
  }
}

export const net = new Net();
