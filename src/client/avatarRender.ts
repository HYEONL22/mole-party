import type { Avatar } from '../shared/avatar';
import { BASE_HEAD, FACE, FIXED_COLORS, GRID, HAIR, HAT, HAT_COLORS, TOP_COLORS, TSHIRT } from '../shared/avatarParts';
import { makeCanvas, paintRows, shade } from './pixel';

function paletteFor(a: Avatar): Record<string, string> {
  const hat = HAT_COLORS[a.hatColor].color;
  const top = TOP_COLORS[a.topColor].color;
  return {
    ...FIXED_COLORS,
    C: hat,
    c: shade(hat, -0.25),
    y: shade(hat, 0.3),
    Z: shade(hat, -0.55),
    T: top,
    t: shade(top, -0.16),
  };
}

/** 그리는 순서: 얼굴·목 → 반팔티 → 표정 → 옆머리 → 모자 */
const LAYERS = [BASE_HEAD, TSHIRT, FACE, HAIR, HAT];

const cache = new Map<string, HTMLCanvasElement>();

/** 32x32 1배율 캔버스 (캐시됨). drawImage로 정수 배율 확대해서 쓴다. */
export function avatarSprite(a: Avatar): HTMLCanvasElement {
  const key = JSON.stringify(a);
  let c = cache.get(key);
  if (!c) {
    c = makeCanvas(GRID, GRID);
    const ctx = c.getContext('2d')!;
    const pal = paletteFor(a);
    for (const layer of LAYERS) paintRows(ctx, layer.rows, pal, layer.x, layer.y);
    cache.set(key, c);
  }
  return c;
}

/** DOM에 넣을 증명사진 캔버스 (CSS 크기 32*scale, 고해상도 화면에서도 선명) */
export function avatarElement(a: Avatar, scale: number, className = 'avatar'): HTMLCanvasElement {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const c = makeCanvas(GRID * scale * dpr, GRID * scale * dpr);
  c.className = className;
  c.style.width = `${GRID * scale}px`;
  c.style.height = `${GRID * scale}px`;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(avatarSprite(a), 0, 0, c.width, c.height);
  return c;
}
