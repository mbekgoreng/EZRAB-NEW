/**
 * Susun Bata — tetris bertema konstruksi. Pure board logic (no DOM).
 * Tiap tetromino adalah material bangunan ber-texture bata.
 */

export const COLS = 10;
export const ROWS = 20;

export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export interface Material {
  name: string;
  c1: string; // warna terang
  c2: string; // warna gelap
}

export const MATERIALS: Record<PieceKind, Material> = {
  I: { name: 'Besi Beton', c1: '#7dd3fc', c2: '#0369a1' },
  O: { name: 'Hebel', c1: '#fef3c7', c2: '#b45309' },
  T: { name: 'Batako', c1: '#d6d3d1', c2: '#57534e' },
  S: { name: 'Genteng', c1: '#fca5a5', c2: '#b91c1c' },
  Z: { name: 'Paving', c1: '#a5b4fc', c2: '#4338ca' },
  J: { name: 'Bata Merah', c1: '#fdba74', c2: '#c2410c' },
  L: { name: 'Kayu Bekisting', c1: '#fcd34d', c2: '#92400e' },
};

/** Bentuk dasar tiap piece (matriks). */
export const SHAPES: Record<PieceKind, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

export type Rng = () => number;
/** Sel papan: 0 = kosong, selain itu PieceKind yang menempel. */
export type Board = (0 | PieceKind)[][];

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<0 | PieceKind>(COLS).fill(0));
}

/** Putar matriks 90° searah jarum jam. */
export function rotate(m: number[][]): number[][] {
  const h = m.length;
  const w = m[0].length;
  const out: number[][] = Array.from({ length: w }, () => Array<number>(h).fill(0));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) out[x][h - 1 - y] = m[y][x];
  }
  return out;
}

/** Apakah piece bertabrakan dengan dinding / tumpukan? */
export function collides(board: Board, shape: number[][], px: number, py: number): boolean {
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const bx = px + x;
      const by = py + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

/** Tempelkan piece ke papan (salinan baru). */
export function merge(board: Board, shape: number[][], px: number, py: number, kind: PieceKind): Board {
  const next = board.map((row) => [...row]);
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const by = py + y;
      if (by >= 0 && by < ROWS) next[by][px + x] = kind;
    }
  }
  return next;
}

/** Hapus baris penuh; kembalikan papan baru + jumlah baris terhapus. */
export function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => !row.every((c) => c !== 0));
  const cleared = ROWS - kept.length;
  const fresh = Array.from({ length: cleared }, () => Array<0 | PieceKind>(COLS).fill(0));
  return { board: [...fresh, ...kept], cleared };
}

/** Skor: 100/300/500/800 × (level+1). */
export function scoreFor(cleared: number, level: number): number {
  const base = [0, 100, 300, 500, 800][Math.min(cleared, 4)] ?? 0;
  return base * (level + 1);
}

/** Level naik tiap 10 baris. */
export function levelFor(lines: number): number {
  return Math.floor(lines / 10);
}

/** Gravitasi: makin cepat tiap level (ms per langkah turun). */
export function gravityMs(level: number): number {
  return Math.max(60, Math.round(750 * Math.pow(0.86, level)));
}

/** 7-bag: tiap 7 piece memuat semua material tepat sekali. */
export function bag7(rng: Rng = Math.random): PieceKind[] {
  const kinds: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  for (let i = kinds.length - 1; i > 0; i -= 1) {
    const j = (rng() * (i + 1)) | 0;
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds;
}

export interface ActivePiece {
  kind: PieceKind;
  shape: number[][];
  x: number;
  y: number;
}

export function spawnPiece(kind: PieceKind): ActivePiece {
  const shape = SHAPES[kind].map((r) => [...r]);
  return { kind, shape, x: Math.floor(COLS / 2) - Math.ceil(shape[0].length / 2), y: 0 };
}
