/**
 * 게임 서버: WebSocket(/ws) + 빌드된 화면(dist/) 제공.
 * 개발 중에는 화면은 vite가 띄우고, 이 서버는 /ws만 담당한다.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg } from '../src/shared/protocol';
import { handleClose, handleMessage, stats, type Conn } from './rooms';

const PORT = Number(process.env.PORT) || 3001;
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...stats() }));
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('화면 파일이 없습니다. 개발 중이면 vite 주소(5173)로 접속하거나 npm run build를 먼저 실행하세요.');
    return;
  }
  // 정적 파일 (경로 탈출 방지) — 없으면 index.html
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const ext = extname(file);
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': file.includes(`${join(DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  const conn: Conn = {
    send: (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return conn.send({ type: 'error', code: 'bad_request', message: '잘못된 요청이에요.' });
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    try {
      handleMessage(conn, msg);
    } catch (e) {
      console.error('[ws] 처리 중 오류', e);
      conn.send({ type: 'error', code: 'bad_request', message: '서버에서 오류가 났어요.' });
    }
  });

  ws.on('close', () => handleClose(conn));
});

// 죽은 연결 정리 + 무료 호스팅의 유휴 연결 끊김 방지
setInterval(() => {
  for (const client of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (!client.alive) {
      client.terminate();
      continue;
    }
    client.alive = false;
    client.ping();
  }
}, 25_000);

server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  (WebSocket: /ws)`);
});
