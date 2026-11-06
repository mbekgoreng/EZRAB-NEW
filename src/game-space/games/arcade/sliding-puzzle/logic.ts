/**
 * ArcadeSlidingPuzzle ("Geser Keramik") — pure logic.
 * Keping keramik 4×4 (atau 3×3) digeser hingga membentuk blueprint utuh.
 * Acakan selalu solvable (random walk dari kondisi solved).
 */

export type Board = number[]; // 0 = lubang kosong, 1..n = nomor keping

/** Papan solved: 1..n-1 lalu 0 di kanan bawah. */
export function solvedBoard(size: number): Board {
  const b: number[] = [];
  for (let i = 1; i < size * size; i += 1) b.push(i);
  b.push(0);
  return b;
}

/** Indeks-indeks tetangga (atas/bawah/kiri/kanan) dari posisi idx. */
export function neighbors(idx: number, size: number): number[] {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out: number[] = [];
  if (r > 0) out.push(idx - size);
  if (r < size - 1) out.push(idx + size);
  if (c > 0) out.push(idx - 1);
  if (c < size - 1) out.push(idx + 1);
  return out;
}

/**
 * Acak papan dengan random walk dari solved → dijamin solvable.
 * `moves`: jumlah langkah acak (makin banyak = makin sulit).
 */
export function shuffleBoard(size: number, moves: number, rng: () => number): Board {
  const b = solvedBoard(size);
  let empty = b.indexOf(0);
  let prev = -1;
  for (let i = 0; i < moves; i += 1) {
    const opts = neighbors(empty, size).filter((n) => n !== prev);
    const pick = opts[Math.floor(rng() * opts.length)];
    b[empty] = b[pick];
    b[pick] = 0;
    prev = empty;
    empty = pick;
  }
  // jangan sampai kebetulan sudah solved
  if (isSolved(b)) {
    const opts = neighbors(empty, size);
    const pick = opts[Math.floor(rng() * opts.length)];
    b[empty] = b[pick];
    b[pick] = 0;
  }
  return b;
}

/** Bisakah keping di idx digeser (bertetangga dengan lubang)? */
export function canMove(board: Board, size: number, idx: number): boolean {
  if (board[idx] === 0) return false;
  const empty = board.indexOf(0);
  return neighbors(idx, size).includes(empty);
}

/** Geser keping; kembalikan papan baru, atau null bila tidak valid. */
export function moveTile(board: Board, size: number, idx: number): Board | null {
  if (!canMove(board, size, idx)) return null;
  const b = [...board];
  const empty = b.indexOf(0);
  b[empty] = b[idx];
  b[idx] = 0;
  return b;
}

/** Apakah papan sudah tersusun (blueprint utuh)? */
export function isSolved(board: Board): boolean {
  for (let i = 0; i < board.length - 1; i += 1) {
    if (board[i] !== i + 1) return false;
  }
  return board[board.length - 1] === 0;
}

/** Jumlah keping yang belum di posisi benar (untuk statistik). */
export function misplaced(board: Board): number {
  let n = 0;
  for (let i = 0; i < board.length; i += 1) {
    const v = board[i];
    if (v !== 0 && v !== i + 1) n += 1;
  }
  return n;
}

/**
 * Apakah papan ini MUNGKIN diselesaikan? (aturan paritas klasik)
 * - Lebar ganjil (3×3): solvable ⟺ jumlah inversi genap.
 * - Lebar genap (4×4): solvable ⟺ inversi + baris lubang dari bawah ganjil.
 * Permutasi mentah acak melanggar aturan ini ±50% waktu — fungsi ini
 * adalah penjaga yang bisa dipakai generator/tes untuk menolaknya.
 * `shuffleBoard` di atas sudah aman (random walk dari solved), fungsi
 * ini membuktikannya secara eksplisit per papan.
 */
export function isSolvable(board: Board, size: number): boolean {
  const tiles = board.filter((v) => v !== 0);
  let inversions = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      if (tiles[i] > tiles[j]) inversions += 1;
    }
  }
  if (size % 2 === 1) return inversions % 2 === 0;
  const emptyRowFromBottom = size - Math.floor(board.indexOf(0) / size);
  return (inversions + emptyRowFromBottom) % 2 === 1;
}

/** Apakah keping di idx sudah duduk di posisi asalnya? (lubang: tidak) */
export function isAtHome(board: Board, idx: number): boolean {
  return board[idx] !== 0 && board[idx] === idx + 1;
}

/** Masker per sel: true bila keping di sel itu sudah di tempat benar. */
export function homeMask(board: Board): boolean[] {
  return board.map((_, idx) => isAtHome(board, idx));
}

/** Jumlah keping yang sudah di tempat benar (0..n-1, lubang tak dihitung). */
export function placedCount(board: Board): number {
  let n = 0;
  for (let i = 0; i < board.length; i += 1) {
    if (isAtHome(board, i)) n += 1;
  }
  return n;
}
