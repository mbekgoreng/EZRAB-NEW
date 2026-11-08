/**
 * Set bidak & token papan BERSAMA Game Space — sprite generate-AI untuk
 * kelompok sapuan visual 2 (checkers, reversi, tic-tac-toe, connect-four,
 * mastermind). Pola mengikuti set glif material bersama (Kelompok 1) dan
 * set bidak Catur: tiap token `.webp` transparan 512x512 dimuat lewat
 * loader resmi `engine2d/sprites`; glif SVG/prosedural lama di tiap game
 * tetap menjadi FALLBACK bila sprite belum siap / gagal muat.
 *
 * Kunci dipetakan dari definisi persis di kode tiap game:
 * - checkers (Dam Bata): side 'merah' (keping bata) / 'abu' (keping batako),
 *   king = keping ganda bercincin emas + bintang -> 4 varian.
 * - reversi (Balik Triplek): SATU keping dua sisi — Cell 1 = sisi triplek
 *   (kayu lapis terang), Cell 2 = sisi bata/semen. Animasi balik memakai
 *   flipVisibleFace di komponen; pemanggil menggambar sprite sisi yang
 *   sedang terlihat pada radius terskala squash yang sama.
 * - tic-tac-toe (Bata vs Semen): Mark 'X' = satu bata oranye-merah,
 *   'O' = karung semen krem berlabel biru polos (tanpa teks).
 * - connect-four (Sambung Pipa): Player 1 = flensa baja + muka pipa PVC
 *   biru + lubang gelap; Player 2 = sama dengan muka HDPE oranye.
 * - mastermind (Tebak Campuran): pin bahan = bola bahan berwarna PERSIS
 *   warna BAHAN di logic.ts (fungsi warna dipertahankan): 0 Semen abu,
 *   1 Pasir kuning keemasan, 2 Kerikil cokelat kasar, 3 Air biru langit,
 *   4 Kapur putih, 5 Aditif ungu violet.
 */

import { drawSprite, loadSprite, readySprite, spriteStatus, useSprite } from '../engine2d/sprites';

export { loadSprite, readySprite, spriteStatus, useSprite };

import tokenDamBata from '../assets/board-tokens/token-dam-bata.webp';
import tokenDamBataRaja from '../assets/board-tokens/token-dam-bata-raja.webp';
import tokenDamBatako from '../assets/board-tokens/token-dam-batako.webp';
import tokenDamBatakoRaja from '../assets/board-tokens/token-dam-batako-raja.webp';
import tokenReversiTriplek from '../assets/board-tokens/token-reversi-triplek.webp';
import tokenReversiBata from '../assets/board-tokens/token-reversi-bata.webp';
import tokenTttBata from '../assets/board-tokens/token-ttt-bata.webp';
import tokenTttSemen from '../assets/board-tokens/token-ttt-semen.webp';
import tokenPipaBiru from '../assets/board-tokens/token-pipa-biru.webp';
import tokenPipaOranye from '../assets/board-tokens/token-pipa-oranye.webp';
import pegSemen from '../assets/board-tokens/peg-semen.webp';
import pegPasir from '../assets/board-tokens/peg-pasir.webp';
import pegKerikil from '../assets/board-tokens/peg-kerikil.webp';
import pegAir from '../assets/board-tokens/peg-air.webp';
import pegKapur from '../assets/board-tokens/peg-kapur.webp';
import pegAditif from '../assets/board-tokens/peg-aditif.webp';

/** Token dam: kunci `${side}` / `${side}-raja` (side dari logic checkers). */
export const CHECKERS_TOKENS: Record<string, string> = {
  merah: tokenDamBata,
  'merah-raja': tokenDamBataRaja,
  abu: tokenDamBatako,
  'abu-raja': tokenDamBatakoRaja,
};

/** Dua sisi keping reversi: indeks Cell logic (1 triplek, 2 bata). */
export const REVERSI_FACES: Record<number, string> = {
  1: tokenReversiTriplek,
  2: tokenReversiBata,
};

/** Token tic-tac-toe per Mark logic ('X' bata, 'O' karung semen). */
export const TTT_TOKENS: Record<string, string> = {
  X: tokenTttBata,
  O: tokenTttSemen,
};

/** Keping connect-four per Player logic (1 PVC biru, 2 HDPE oranye). */
export const PIPE_TOKENS: Record<number, string> = {
  1: tokenPipaBiru,
  2: tokenPipaOranye,
};

/** Pin mastermind per indeks BAHAN logic.ts (0..5). */
export const MASTERMIND_PEGS: string[] = [
  pegSemen, pegPasir, pegKerikil, pegAir, pegKapur, pegAditif,
];

export const ALL_BOARD_TOKEN_SPRITES: string[] = [
  ...Object.values(CHECKERS_TOKENS),
  ...Object.values(REVERSI_FACES),
  ...Object.values(TTT_TOKENS),
  ...Object.values(PIPE_TOKENS),
  ...MASTERMIND_PEGS,
];

/** Muat awal seluruh set token papan (panggil sekali saat game dibuka). */
export function preloadBoardTokens(): void {
  for (const u of ALL_BOARD_TOKEN_SPRITES) void loadSprite(u);
}

/**
 * Gambar token terpusat di (cx, cy) muat di kotak maxW x maxH.
 * Mengembalikan false bila sprite belum siap/gagal — pemanggil menggambar
 * glif prosedural fallback-nya. `squashX` 0..1 memampatkan lebar (dipakai
 * animasi balik reversi: lebar efektif disk = r * squash).
 */
export function drawBoardToken(
  ctx: CanvasRenderingContext2D,
  url: string,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
  squashX = 1,
): boolean {
  const img = readySprite(url);
  if (!img || maxW <= 0) return false;
  if (squashX >= 0.999) return drawSprite(ctx, img, cx, cy, maxW, maxH);
  const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * s * Math.max(0.02, squashX);
  const h = img.naturalHeight * s;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}
