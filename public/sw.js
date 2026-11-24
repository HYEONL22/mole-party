// 서비스 워커: 홈 화면 앱으로 설치 가능하게 + 인터넷이 잠깐 끊겼을 때 첫 화면은 뜨게.
// 게임 데이터(WebSocket)는 건드리지 않는다. 항상 최신 화면을 먼저 받아 오고, 실패할 때만 저장본 사용.
const CACHE = 'chigo-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 페이지 열기: 네트워크 우선, 안 되면 저장해 둔 첫 화면
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // 빌드된 파일(/assets/이름-해시.js)은 내용이 바뀌면 이름이 바뀌므로 저장본을 써도 안전
  if (new URL(req.url).pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
  }
});
