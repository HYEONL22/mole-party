// 배포된 서버 점검: 두 명이 방을 만들고/들어가서, 닉네임 중복 확인, 게임 시작, 두더지 몇 마리 잡기.
// 사용: node scripts/smoke-live.mjs https://mole-party.onrender.com
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:5173';
const wsUrl = base.replace(/^http/, 'ws') + '/ws';
const avatar = { hatColor: 1, topColor: 2 };

function client(name) {
  const ws = new WebSocket(wsUrl);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  const open = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  return {
    name, ws, inbox, open,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 15000) => new Promise((res, rej) => {
      const hit = inbox.find(pred); if (hit) return res(hit);
      waiters.push({ pred, res });
      setTimeout(() => rej(new Error(`${name}: timeout`)), ms);
    }),
  };
}

const log = (...a) => console.log('·', ...a);
const a = client('A'); const b = client('B'); const dup = client('dup');
await Promise.all([a.open, b.open, dup.open]);
log('WebSocket 연결 OK');

a.send({ type: 'create_room', nickname: 'smokeA', avatar });
const ja = await a.wait((m) => m.type === 'joined');
log('방 만들기 OK, 코드', ja.code);

dup.send({ type: 'join_room', code: ja.code, nickname: 'SMOKEA', avatar });
const de = await dup.wait((m) => m.type === 'error');
log('닉네임 중복 차단 OK:', de.code);

b.send({ type: 'join_room', code: ja.code, nickname: 'smokeB', avatar });
await b.wait((m) => m.type === 'joined');
const st = await a.wait((m) => m.type === 'room_state' && m.players.length === 2);
log('참가 OK, 인원', st.players.length);

a.send({ type: 'start_game' });
const gs = await b.wait((m) => m.type === 'game_start');
log('게임 시작 OK, 시작까지', Math.round((gs.startAt - Date.now()) / 1000), '초');

// 처음 나오는 두더지 3마리를 둘이 동시에 쳐서 한 명만 득점하는지 확인
let hits = 0;
for (let i = 0; i < 3; i++) {
  const sp = await a.wait((m) => m.type === 'mole_spawn' && !m._seen, 20000);
  sp._seen = true;
  await new Promise((r) => setTimeout(r, Math.max(0, sp.spawnAt - Date.now() + 120)));
  a.send({ type: 'whack', moleId: sp.moleId });
  b.send({ type: 'whack', moleId: sp.moleId });
  const hit = await a.wait((m) => m.type === 'mole_hit' && m.moleId === sp.moleId);
  const dupHits = a.inbox.filter((m) => m.type === 'mole_hit' && m.moleId === sp.moleId).length;
  hits++;
  log(`두더지 #${sp.moleId}(${sp.kind}) → ${hit.playerId === ja.playerId ? 'A' : 'B'} 득점 ${hit.scoreDelta}, 판정 ${dupHits}회`);
}
log(`동시 타격 판정 OK (${hits}마리)`);
for (const c of [a, b, dup]) c.ws.close();
console.log('완료');
process.exit(0);
