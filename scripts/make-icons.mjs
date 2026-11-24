// 앱 아이콘 PNG 만들기 (외부 라이브러리 없이 도트를 직접 찍어 PNG로 저장)
// 사용: node scripts/make-icons.mjs  → public/ 에 아이콘 파일 생성
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const MOLE = [
  '....DDDDDDDD....',
  '...DMMMMMMMMD...',
  '..DMMMMMMMMMMD..',
  '.DMMMMMMMMMMMMD.',
  '.DMMWEMMMMEWMMD.',
  '.DMMEEMMMMEEMMD.',
  '.DMMMMMPPMMMMMD.',
  'DMMMMLLLLLLMMMMD',
  'DMMMLLLLLLLLMMMD',
  'DMMMLLLWWLLLMMMD',
  'DmMMMLLLLLLMMMmD',
  'DmLLMMMMMMMMLLmD',
  'DmmMMMMMMMMMMmmD',
  'DmmMMMMMMMMMMmmD',
  'DmmmMMMMMMMMmmmD',
  'DmmmMMMMMMMMmmmD',
];
const HOLE = [
  '....dddddddddddddd....',
  '..ddDDDDDDDDDDDDDDdd..',
  '.dDDKKKKKKKKKKKKKKDDd.',
  'dDKKKKKKKKKKKKKKKKKKDd',
  'dDKKKKKKKKKKKKKKKKKKDd',
  '.dDDKKKKKKKKKKKKKKDDd.',
  '..ddDDDDDDDDDDDDDDdd..',
  '....dddddddddddddd....',
];
const HAMMER = [
  '.KKKKKKKKKK.',
  'KRRYRRRRYRRK',
  'KRRYRRRRYRRK',
  'KrrYrrrrYrrK',
  '.KKKKKKKKKK.',
  '....KwwK....',
  '....KwwK....',
  '....KwwK....',
  '....KwwK....',
  '....KKKK....',
];
const MOLE_PAL = { D: '#3b2416', M: '#8b5a3c', m: '#6e4429', L: '#e8c4a0', E: '#1b1b22', W: '#ffffff', P: '#f07890' };
const HOLE_PAL = { d: '#8a6040', D: '#5a3a22', K: '#1c120c' };
const HAMMER_PAL = { K: '#2a1a10', R: '#ef5350', r: '#b83333', Y: '#ffd84a', w: '#c8955a' };

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** 32x32 도트 그림 (배경 포함) */
function art() {
  const N = 32;
  const px = Array.from({ length: N }, (_, y) =>
    Array.from({ length: N }, (_, x) => {
      // 잔디 배경 + 살짝 체크 무늬
      return (x * 7 + y * 13) % 11 === 0 ? '#4f9a3d' : (x * 5 + y * 3) % 17 === 0 ? '#74c45a' : '#5fb04a';
    }),
  );
  const put = (rows, pal, ox, oy, clipY = Infinity) =>
    rows.forEach((r, y) =>
      [...r].forEach((c, x) => {
        const col = pal[c];
        const X = ox + x;
        const Y = oy + y;
        if (col && X >= 0 && X < N && Y >= 0 && Y < N && Y < clipY) px[Y][X] = col;
      }),
    );
  put(HOLE, HOLE_PAL, 5, 22);
  put(MOLE, MOLE_PAL, 8, 9, 26); // 구멍 가운데선 아래는 가려짐
  put(HAMMER, HAMMER_PAL, 19, 2);
  return px;
}

/** 도트 그림을 size 픽셀로 확대 (pad = 바깥 여백 비율, 안드로이드 아이콘 잘림 대비) */
function render(size, pad = 0) {
  const px = art();
  const inner = Math.round(size * (1 - pad * 2));
  const off = Math.round((size - inner) / 2);
  const buf = Buffer.alloc(size * size * 4);
  const bg = hex('#5fb04a');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let rgb = bg;
      const ix = x - off;
      const iy = y - off;
      if (ix >= 0 && iy >= 0 && ix < inner && iy < inner) {
        rgb = hex(px[Math.floor((iy * 32) / inner)][Math.floor((ix * 32) / inner)]);
      }
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
      buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

// ---- 최소 PNG 인코더 ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'icon-maskable-512.png': render(512, 0.1), // 안드로이드가 동그랗게 잘라도 그림이 남도록 여백
  'apple-touch-icon.png': render(180),
  'favicon-32.png': render(32),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(new URL(name, out), data);
  console.log('생성', name, data.length, 'bytes');
}
