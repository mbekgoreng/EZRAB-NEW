/**
 * ArcadeConnectFour ("Sambung Pipa") — pure logic.
 * Sambungkan 4 segmen pipa sewarna dalam garis (7 kolom × 6 baris).
 * Pemain 1 = pipa PVC biru, Pemain 2/AI = pipa HDPE oranye.
 * AI SEDANG: selalu ambil kemenangan, biasanya blokir ancaman, kadang blunder.
 * Langkah heuristiknya dinilai scoreMove: membangun ancaman garis sendiri
 * (termasuk ancaman ganda) dan menghindari langkah umpan yang memberi lawan
 * kemenangan langsung di giliran berikut.
 */

export const COLS = 7;
export const ROWS = 6;
export const CONNECT = 4;

export type Cell = 0 | 1 | 2; // 0 kosong, 1 biru, 2 oranye
export type Board = Cell[][];
export type Player = 1 | 2;

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

/** Baris tempat keping mendarat bila dijatuhkan di kolom col; -1 bila penuh. */
export function dropRow(board: Board, col: number): number {
  if (col < 0 || col >= COLS) return -1;
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (board[r][col] === 0) return r;
  }
  return -1;
}

/** Jatuhkan keping; kembalikan {row} atau null bila kolom penuh. */
export function dropPiece(board: Board, col: number, player: Player): { row: number } | null {
  const row = dropRow(board, col);
  if (row < 0) return null;
  board[row][col] = player;
  return { row };
}

/** Apakah langkah terakhir (col,row,player) membentuk 4 beruntun? */
export function isWinningMove(board: Board, col: number, row: number, player: Player): boolean {
  const dirs: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [0, 1], [1, 1], [1, -1],
  ];
  for (const [dx, dy] of dirs) {
    let count = 1;
    for (const s of [1, -1] as const) {
      let c = col + dx * s;
      let r = row + dy * s;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[r][c] === player) {
        count += 1;
        c += dx * s;
        r += dy * s;
      }
    }
    if (count >= CONNECT) return true;
  }
  return false;
}

export interface WinningCell { c: number; r: number; }

/**
 * SEMUA sel pembentuk garis kemenangan dari langkah terakhir (col,row,player).
 * Satu langkah bisa menutup dua garis sekaligus (mis. mendatar + diagonal);
 * gabungan (union) kedua garis dikembalikan, bukan hanya arah pertama.
 * Urutan deterministik: baris lalu kolom. [] bila langkah itu tidak menang.
 */
export function winningCells(board: Board, col: number, row: number, player: Player): WinningCell[] {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS || board[row][col] !== player) return [];
  const found = new Map<string, WinningCell>();
  const dirs: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [0, 1], [1, 1], [1, -1],
  ];
  for (const [dx, dy] of dirs) {
    const line: WinningCell[] = [{ c: col, r: row }];
    for (const s of [1, -1] as const) {
      let c = col + dx * s;
      let r = row + dy * s;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[r][c] === player) {
        line.push({ c, r });
        c += dx * s;
        r += dy * s;
      }
    }
    if (line.length >= CONNECT) {
      for (const cell of line) found.set(`${cell.c},${cell.r}`, cell);
    }
  }
  return [...found.values()].sort((a, b) => (a.r - b.r) || (a.c - b.c));
}

export function isFull(board: Board): boolean {
  for (let c = 0; c < COLS; c += 1) {
    if (board[0][c] === 0) return false;
  }
  return true;
}

export function other(p: Player): Player {
  return p === 1 ? 2 : 1;
}

/** Kolom yang masih bisa diisi. */
export function legalColumns(board: Board): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLS; c += 1) {
    if (board[0][c] === 0) out.push(c);
  }
  return out;
}

/**
 * Simulasi: bila player menjatuhkan di col, apakah langsung menang?
 * (Mutasi board sementara lalu dikembalikan.)
 */
function winsImmediately(board: Board, col: number, player: Player): boolean {
  const row = dropRow(board, col);
  if (row < 0) return false;
  board[row][col] = player;
  const win = isWinningMove(board, col, row, player);
  board[row][col] = 0;
  return win;
}

/** Kolom-kolom di mana player langsung menang bila menjatuhkan keping sekarang. */
export function winningColumns(board: Board, player: Player): number[] {
  return legalColumns(board).filter((c) => winsImmediately(board, c, player));
}

/**
 * Apakah keping player di col menjadi UMPAN bagi lawan: sesudah langkah ini
 * lawan punya kemenangan langsung di giliran berikut (klasiknya keping lawan
 * mendarat tepat di atas keping ini dan menutup garisnya). Murni, tanpa mutasi.
 */
export function givesOpponentImmediateWin(board: Board, col: number, player: Player): boolean {
  const row = dropRow(board, col);
  if (row < 0) return false;
  board[row][col] = player;
  const foeWins = winningColumns(board, other(player)).length > 0;
  board[row][col] = 0;
  return foeWins;
}

/**
 * Nilai taktis satu langkah (fungsi murni, dipakai AI di langkah heuristik):
 * - menang langsung: 1000.
 * - membangun ancaman: sesudah langkah ini, tiap kolom kemenangan untuk
 *   giliran berikut +30; dua ancaman sekaligus (garis bercabang yang tak
 *   bisa diblokir dua-duanya) +60.
 * - menjadi umpan kemenangan lawan di giliran berikut: −120.
 * - selebihnya heuristik kolom dasar (pusat + potensi garis terbuka).
 */
export function scoreMove(board: Board, col: number, player: Player): number {
  const row = dropRow(board, col);
  if (row < 0) return -Infinity;
  if (winsImmediately(board, col, player)) return 1000;
  let score = columnScore(board, col, player);
  board[row][col] = player;
  const threats = winningColumns(board, player).length;
  board[row][col] = 0;
  if (threats >= 2) score += 60;
  else if (threats === 1) score += 30;
  if (givesOpponentImmediateWin(board, col, player)) score -= 120;
  return score;
}

/** Skor heuristik kolom: pusat lebih baik + potensi garis terbuka. */
function columnScore(board: Board, col: number, player: Player): number {
  let score = 0;
  // preferensi tengah (pipa utama lewat tengah proyek)
  score += (3 - Math.abs(3 - col)) * 2;
  const row = dropRow(board, col);
  if (row < 0) return -Infinity;
  board[row][col] = player;
  // hitung tetangga sewarna di 4 arah
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    let run = 1;
    let open = 0;
    for (const s of [1, -1] as const) {
      let c = col + dx * s;
      let r = row + dy * s;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[r][c] === player) {
        run += 1;
        c += dx * s;
        r += dy * s;
      }
      // ujung terbuka (kosong & bisa diisi dari atas)?
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[r][c] === 0) open += 1;
    }
    if (run >= 3) score += 12;
    else if (run === 2) score += 4 + open;
  }
  board[row][col] = 0;
  return score;
}

/** Peluang AI blunder (tidak blokir ancaman) — inilah yang membuatnya bisa dikalahkan. */
export const AI_BLUNDER_CHANCE = 0.22;

/**
 * AI SEDANG — pilih kolom untuk aiPlayer.
 * 1. Ambil kemenangan langsung bila ada.
 * 2. Blokir kemenangan langsung lawan (kecuali blunder).
 * 3. Heuristik + noise; kadang pilih acak (blunder).
 */
export function aiChooseColumn(board: Board, aiPlayer: Player, rng: () => number): number {
  const legal = legalColumns(board);
  if (legal.length === 0) return -1;
  const foe = other(aiPlayer);

  // 1. Menang bila bisa
  for (const c of legal) {
    if (winsImmediately(board, c, aiPlayer)) return c;
  }
  // 2. Blokir ancaman lawan (bisa blunder)
  if (rng() >= AI_BLUNDER_CHANCE) {
    for (const c of legal) {
      if (winsImmediately(board, c, foe)) return c;
    }
  } else {
    // blunder total: kolom acak
    return legal[Math.floor(rng() * legal.length)];
  }
  // 3. Nilai taktis (scoreMove: bangun ancaman sendiri, hindari umpan) + noise kecil
  let best = legal[0];
  let bestScore = -Infinity;
  for (const c of legal) {
    const sc = scoreMove(board, c, aiPlayer) + rng() * 3;
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return best;
}
