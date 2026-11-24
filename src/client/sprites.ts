/** 게임판 도트 스프라이트 (오리지널) */
import type { MoleKind } from '../shared/protocol';
import { makeCanvas, makeSprite } from './pixel';

const MOLE_ROWS = [
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

/** 일부 행만 바꾼 변형 */
const variant = (base: string[], changes: Record<number, string>) => base.map((r, i) => changes[i] ?? r);

/** 맞았을 때: 눈 감김 */
const hitRows = (base: string[]) =>
  variant(base, { 4: '.DMMMMMMMMMMMMD.', 5: '.DMEEEMMMMEEEMD.', 9: 'DMMMLLWWWWLLMMMD' });

/** 가짜 두더지: 찌푸린 눈썹 + 빨간 코 (일반 두더지와 헷갈리게) */
const DECOY_ROWS = variant(MOLE_ROWS, { 3: '.DMEEMMMMMMEEMD.', 6: '.DMMMMMRRMMMMMD.' });

/** 번개 두더지: 이마에 번개 */
const FLASH_ROWS = variant(MOLE_ROWS, {
  1: '...DMMMMYMMMD...',
  2: '..DMMMMYYMMMMD..',
  3: '.DMMMMYMMMMMMMD.',
});

const BOMB_ROWS = [
  '..........R.Y...',
  '...........Y....',
  '..........F.....',
  '.........F......',
  '......aaaa......',
  '....KKKKKKKK....',
  '...KKWWKKKKKK...',
  '..KKWKKKKKKKKK..',
  '..KKKKKKKKKKKK..',
  '.KKKRRKKKKRRKKK.',
  '.KKKKKKKKKKKKKK.',
  '.KKKKKKKKKKKKKK.',
  '..KKKKKKKKKKKK..',
  '..KKKKKKKKKKKK..',
  '...KKKKKKKKKK...',
  '....KKKKKKKK....',
];

const COMMON = { E: '#1b1b22', W: '#ffffff', P: '#f07890' };
const BROWN = { ...COMMON, D: '#3b2416', M: '#8b5a3c', m: '#6e4429', L: '#e8c4a0' };
const GOLD = { ...COMMON, D: '#7a5a10', M: '#f2c230', m: '#c9971c', L: '#fff1b8' };
const DECOY = { ...BROWN, R: '#e0352b' };
const FLASH = { ...COMMON, D: '#24304a', M: '#7d93bd', m: '#5d6f94', L: '#e3ecfa', Y: '#ffe14a' };
const BOMB = { K: '#26262c', W: '#8c8c98', a: '#9aa0aa', F: '#b08850', Y: '#ffd84a', R: '#ff4b3a' };

export const SPRITES = {
  normal: makeSprite(MOLE_ROWS, BROWN),
  normalHit: makeSprite(hitRows(MOLE_ROWS), BROWN),
  gold: makeSprite(MOLE_ROWS, GOLD),
  goldHit: makeSprite(hitRows(MOLE_ROWS), GOLD),
  decoy: makeSprite(DECOY_ROWS, DECOY),
  decoyHit: makeSprite(hitRows(DECOY_ROWS), DECOY),
  flash: makeSprite(FLASH_ROWS, FLASH),
  flashHit: makeSprite(hitRows(FLASH_ROWS), FLASH),
  bomb: makeSprite(BOMB_ROWS, BOMB),
  /** 뿅망치 (손잡이 아래쪽 끝이 회전 중심) */
  hammer: makeSprite(
    [
      '.KKKKKKKKKK.',
      'KRRYRRRRYRRK',
      'KRRYRRRRYRRK',
      'KrrYrrrrYrrK',
      '.KKKKKKKKKK.',
      '....KwwK....',
      '....KwwK....',
      '....KwwK....',
      '....KwwK....',
      '....KwwK....',
      '....KKKK....',
    ],
    { K: '#2a1a10', R: '#ef5350', r: '#b83333', Y: '#ffd84a', w: '#c8955a' },
  ),
  hole: makeSprite(
    [
      '....dddddddddddddd....',
      '..ddDDDDDDDDDDDDDDdd..',
      '.dDDKKKKKKKKKKKKKKDDd.',
      'dDKKKKKKKKKKKKKKKKKKDd',
      'dDKKKKKKKKKKKKKKKKKKDd',
      '.dDDKKKKKKKKKKKKKKDDd.',
      '..ddDDDDDDDDDDDDDDdd..',
      '....dddddddddddddd....',
    ],
    { d: '#8a6040', D: '#5a3a22', K: '#1c120c' },
  ),
};

/** 화면에 보이는 모습 기준 (trick은 호출 전에 gold/bomb으로 바꿔서 넘긴다) */
export function moleSprite(look: Exclude<MoleKind, 'trick'>, hit: boolean): HTMLCanvasElement {
  switch (look) {
    case 'bomb':
      return SPRITES.bomb;
    case 'gold':
      return hit ? SPRITES.goldHit : SPRITES.gold;
    case 'decoy':
      return hit ? SPRITES.decoyHit : SPRITES.decoy;
    case 'flash':
      return hit ? SPRITES.flashHit : SPRITES.flash;
    default:
      return hit ? SPRITES.normalHit : SPRITES.normal;
  }
}

/** 잔디 배경 (결정적 난수로 점 찍기) */
export function grassBackground(w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5fb04a';
  ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < (w * h) / 9; i++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    ctx.fillStyle = rnd() < 0.5 ? '#4f9a3d' : '#74c45a';
    ctx.fillRect(x, y, 1, rnd() < 0.3 ? 2 : 1);
  }
  return c;
}
