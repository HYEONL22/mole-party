/** 문자열 픽셀 아트 → 캔버스 유틸 */

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** rows 패턴을 palette로 칠해 1배율 캔버스로 만든다 */
export function makeSprite(rows: string[], palette: Record<string, string>): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  const c = makeCanvas(w, rows.length);
  paintRows(c.getContext('2d')!, rows, palette, 0, 0);
  return c;
}

export function paintRows(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  palette: Record<string, string>,
  ox: number,
  oy: number,
): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}
