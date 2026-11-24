// 개발용: 화면(vite)과 게임 서버(ws)를 함께 실행
//  - 화면: PORT 환경변수 또는 5173  → 브라우저/폰은 이 주소로 접속
//  - 게임 서버: 항상 3001 (vite가 /ws 요청을 여기로 넘겨줌)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webPort = process.env.PORT || '5173';
const bin = (p) => fileURLToPath(new URL(`../node_modules/${p}`, import.meta.url));

const run = (label, args, env) => {
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...env } });
  p.on('exit', (code) => {
    console.log(`[${label}] 종료 (code ${code}) — 전체를 종료합니다`);
    process.exit(code ?? 0);
  });
  return p;
};

const children = [
  run('server', [bin('tsx/dist/cli.mjs'), 'watch', 'server/index.ts'], { PORT: '3001' }),
  run('client', [bin('vite/bin/vite.js'), '--host', '--port', webPort], {}),
];

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    children.forEach((c) => c.kill());
    process.exit(0);
  });
}
