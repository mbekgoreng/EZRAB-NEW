/**
 * Gabung Blok — 2048 ala kontraktor. Pure logic (tanpa DOM/window).
 *
 * Papan: number[16], 0 = kosong, selain itu tier+1 (tier 0..7).
 * Tier: BATA(0) → BATAKO(1) → DINDING(2) → RUMAH(3) → RUKO(4) →
 *       APARTEMEN(5) → GEDUNG(6) → MENARA(7).
 * Skor tiap gabungan = 10 * 2^tier baru.
 */

export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const MAX_TIER = 7;

export type Dir = 'left' | 'right' | 'up' | 'down';

export interface TierInfo {
  name: string;
  /** warna dasar tile */
  base: string;
  /** warna highlight tile */
  light: string;
  /** warna outline/garis detail */
  dark: string;
  /** warna teks label */
  text: string;
}

export const TIERS: TierInfo[] = [
  { name: 'BATA',      base: '#E2725B', light: '#F6A98C', dark: '#A84A34', text: '#5C2418' },
  { name: 'BATAKO',    base: '#9AA5B1', light: '#C6CFD9', dark: '#5F6B78', text: '#2E3742' },
  { name: 'DINDING',   base: '#E4D3B3', light: '#F7EEDC', dark: '#A68F63', text: '#5C4A2E' },
  { name: 'RUMAH',     base: '#F2B441', light: '#FBD67E', dark: '#B07E1C', text: '#5C3F0C' },
  { name: 'RUKO',      base: '#E8833A', light: '#F5AB6B', dark: '#A8541C', text: '#572A08' },
  { name: 'APARTEMEN', base: '#5B8DD9', light: '#93B8EC', dark: '#2F5B9E', text: '#16305C' },
  { name: 'GEDUNG',    base: '#3E63B6', light: '#7C9BD8', dark: '#243E7C', text: '#101F45' },
  { name: 'MENARA',    base: '#D4A017', light: '#F5D76E', dark: '#8A6408', text: '#4A3505' },
];

/** Nilai skor saat dua tile tier `tier` bergabung. */
export const tierScore = (tier: number): number => 10 * 2 ** tier;

/** rng: () => [0,1). Di-inject agar test deterministik. */
export type Rng = () => number;

export interface MoveResult {
  board: number[];
  gained: number;
  moved: boolean;
  /** true jika gerakan ini menciptakan MENARA */
  won: boolean;
}

/** Urutan indeks sel per baris/kolom sesuai arah geser. */
function lineIndices(line: number, dir: Dir): number[] {
  const idx: number[] = [];
  if (dir === 'left' || dir === 'right') {
    for (let c = 0; c < SIZE; c += 1) {
      const col = dir === 'left' ? c : SIZE - 1 - c;
      idx.push(line * SIZE + col);
    }
  } else {
    for (let r = 0; r < SIZE; r += 1) {
      const row = dir === 'up' ? r : SIZE - 1 - r;
      idx.push(row * SIZE + line);
    }
  }
  return idx;
}

/** Geser papan ke arah `dir`. Tiap tile gabung maksimal 1x per gerakan. */
export function move(board: number[], dir: Dir): MoveResult {
  const b = board.slice();
  let gained = 0;
  let moved = false;
  let won = false;

  for (let line = 0; line < SIZE; line += 1) {
    const idxs = lineIndices(line, dir);
    const tiles = idxs.map((i) => b[i]).filter((v) => v > 0);
    const merged: number[] = [];
    let i = 0;
    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1] && tiles[i] - 1 < MAX_TIER) {
        const nv = tiles[i] + 1;
        merged.push(nv);
        gained += tierScore(nv - 1);
        if (nv - 1 === MAX_TIER) won = true;
        i += 2;
      } else {
        merged.push(tiles[i]);
        i += 1;
      }
    }
    while (merged.length < SIZE) merged.push(0);
    for (let k = 0; k < SIZE; k += 1) {
      if (b[idxs[k]] !== merged[k]) moved = true;
      b[idxs[k]] = merged[k];
    }
  }

  return { board: b, gained, moved, won };
}

/** Indeks sel kosong. */
export function emptyCells(board: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === 0) out.push(i);
  }
  return out;
}

/**
 * Pilih 1 sel kosong secara acak lalu isi tier 0 (BATA).
 * 10% kemungkinan tier 1 (BATAKO) biar seru.
 * Return indeks yang diisi, atau -1 bila papan penuh.
 */
export function spawnRandom(board: number[], rng: Rng = Math.random): number {
  const empties = emptyCells(board);
  if (empties.length === 0) return -1;
  const idx = empties[Math.floor(rng() * empties.length)];
  board[idx] = rng() < 0.1 ? 2 : 1;
  return idx;
}

/** Masih ada langkah legal? (sel kosong ATAU ada pasangan bersebelahan) */
export function canMove(board: number[]): boolean {
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === 0) return true;
  }
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const v = board[r * SIZE + c];
      if (c + 1 < SIZE && board[r * SIZE + c + 1] === v) return true;
      if (r + 1 < SIZE && board[(r + 1) * SIZE + c] === v) return true;
    }
  }
  return false;
}

/** Papan baru: 2 tile awal. */
export function newBoard(rng: Rng = Math.random): number[] {
  const b = new Array<number>(CELLS).fill(0);
  spawnRandom(b, rng);
  spawnRandom(b, rng);
  return b;
}
