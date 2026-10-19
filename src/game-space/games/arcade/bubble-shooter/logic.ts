/**
 * ArcadeBubbleShooter ("Tembak Semen") — pure logic.
 * Tembak gumpalan semen warna-warni; match-3 meletus, yang menggantung jatuh.
 * Grid heksagonal offset (odd-r).
 */

export const EMPTY = -1;

export type Grid = number[][]; // [row][col], EMPTY = kosong

/** Tetangga heksagonal (odd-r offset) dari sel (r,c). */
export function neighbors(r: number, c: number, cols: number): Array<[number, number]> {
  const even = r % 2 === 0;
  const cand: Array<[number, number]> = even
    ? [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]]
    : [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]];
  return cand.filter(([rr, cc]) => cc >= 0 && cc < cols && rr >= 0);
}

/** Buat grid awal level: `rows` baris terisi warna acak (tanpa match-3 instan). */
export function levelGrid(
  rows: number,
  cols: number,
  colors: number,
  rng: () => number,
): Grid {
  const g: Grid = [];
  for (let r = 0; r < rows; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < cols; c += 1) {
      let col = Math.floor(rng() * colors);
      // hindari 3 berurutan horizontal saat generate
      let guard = 0;
      while (
        guard < 12 && c >= 2 &&
        row[c - 1] === col && row[c - 2] === col
      ) {
        col = Math.floor(rng() * colors);
        guard += 1;
      }
      row.push(col);
    }
    g.push(row);
  }
  return g;
}

/** Flood fill: semua sel terhubung dengan warna sama dari (r,c). */
export function findCluster(grid: Grid, r: number, c: number): Array<[number, number]> {
  const cols = grid[0]?.length ?? 0;
  const color = grid[r]?.[c];
  if (color === undefined || color === EMPTY) return [];
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  const stack: Array<[number, number]> = [[r, c]];
  seen.add(`${r},${c}`);
  while (stack.length > 0) {
    const [cr, cc] = stack.pop() as [number, number];
    out.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc, cols)) {
      const k = `${nr},${nc}`;
      if (!seen.has(k) && grid[nr]?.[nc] === color) {
        seen.add(k);
        stack.push([nr, nc]);
      }
    }
  }
  return out;
}

/** Sel berisi yang TIDAK terhubung ke baris atas (akan jatuh). */
export function findFloating(grid: Grid): Array<[number, number]> {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const anchored = new Set<string>();
  const stack: Array<[number, number]> = [];
  for (let c = 0; c < cols; c += 1) {
    if (grid[0]?.[c] !== EMPTY) {
      anchored.add(`0,${c}`);
      stack.push([0, c]);
    }
  }
  while (stack.length > 0) {
    const [cr, cc] = stack.pop() as [number, number];
    for (const [nr, nc] of neighbors(cr, cc, cols)) {
      const k = `${nr},${nc}`;
      if (!anchored.has(k) && nr < rows && grid[nr]?.[nc] !== EMPTY) {
        anchored.add(k);
        stack.push([nr, nc]);
      }
    }
  }
  const floating: Array<[number, number]> = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (grid[r][c] !== EMPTY && !anchored.has(`${r},${c}`)) floating.push([r, c]);
    }
  }
  return floating;
}

/** Warna-warna yang masih ada di grid (untuk memilih peluru yang berguna). */
export function colorsInGrid(grid: Grid): number[] {
  const set = new Set<number>();
  for (const row of grid) {
    for (const v of row) if (v !== EMPTY) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

/** Tambah baris baru di ATAS (langit-langit turun). Kembalikan false bila game over. */
export function pushCeiling(grid: Grid, cols: number, colors: number, rng: () => number, maxRows: number): boolean {
  if (grid.length >= maxRows) return false;
  const row: number[] = [];
  for (let c = 0; c < cols; c += 1) row.push(Math.floor(rng() * colors));
  grid.unshift(row);
  return true;
}

/** Apakah grid kosong total (level selesai)? */
export function isCleared(grid: Grid): boolean {
  return grid.every((row) => row.every((v) => v === EMPTY));
}

/** Baris level: 4 + level (cap 9). */
export function rowsForLevel(level: number): number {
  return Math.min(9, 4 + level);
}

/** Jumlah warna: 4 + level/2 (cap 6). */
export function colorsForLevel(level: number): number {
  return Math.min(6, 4 + Math.floor(level / 2));
}

/** Skor: letusan 10/biji, yang jatuh 20/biji, bonus level 500. */
export function scorePop(n: number): number {
  return n * 10;
}
export function scoreDrop(n: number): number {
  return n * 20;
}
export const LEVEL_BONUS = 500;
