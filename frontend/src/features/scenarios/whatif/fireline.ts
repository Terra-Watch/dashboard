/** Fire lines: polylines in grid cells rasterised into the blocked mask. */
export interface Cell { col: number; row: number }

/** Bresenham line between two cells, both ends included. Consecutive cells touch by edge or corner (8-connected), which the engine treats as a closed barrier. */
export function rasterLine(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let x = a.col;
  let y = a.row;
  const dx = Math.abs(b.col - a.col);
  const dy = -Math.abs(b.row - a.row);
  const sx = a.col < b.col ? 1 : -1;
  const sy = a.row < b.row ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ col: x, row: y });
    if (x === b.col && y === b.row) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

/** Mask (1 = fire line) for any number of polylines; cells outside the grid are ignored. A single-point line marks one cell. */
export function rasterFireLines(lines: readonly (readonly Cell[])[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const cells = i === 0 ? [line[0]] : rasterLine(line[i - 1], line[i]);
      for (const c of cells) if (c.col >= 0 && c.row >= 0 && c.col < width && c.row < height) mask[c.row * width + c.col] = 1;
    }
  }
  return mask;
}

/** Drop consecutive duplicates (a double-click adds the same point twice). */
export function pushPoint(line: readonly Cell[], cell: Cell): Cell[] {
  const last = line[line.length - 1];
  return last && last.col === cell.col && last.row === cell.row ? [...line] : [...line, cell];
}
