/**
 * Set corak kartu material BERSAMA Game Space — sprite generate-AI untuk
 * kelompok sapuan visual 3 (solitaire, blackjack, video-poker). Pola
 * mengikuti set material bersama (Kelompok 1) dan set token papan
 * (Kelompok 2): tiap corak `.webp` transparan 512x512 dimuat lewat loader
 * resmi `engine2d/sprites`; glif SVG/prosedural lama di tiap game tetap
 * menjadi FALLBACK bila sprite belum siap / gagal muat.
 *
 * PETA CORAK — dipetakan dari definisi persis di kode tiap game. Ketiga
 * game memakai EMPAT corak material yang sama secara makna (Bata, Kayu,
 * Besi, Cat) TETAPI dengan indeks & pasangan warna BERBEDA per game:
 *
 *   indeks | solitaire    | video-poker  | blackjack
 *   -------+--------------+--------------+----------------
 *     0    | Besi (hitam) | Bata (merah) | Bata
 *     1    | Bata (merah) | Kayu (hitam) | Besi
 *     2    | Kayu (hitam) | Besi (hitam) | Kayu
 *     3    | Cat  (merah) | Cat  (merah) | PIPA (biru)
 *
 * - solitaire: SUIT_INFO di logic.ts (0 Besi, 1 Bata, 2 Kayu, 3 Cat);
 *   merah = Bata & Cat. Penanda khusus: helm proyek untuk kartu wajah
 *   J/Q/K dan label "HELM K3" untuk As -> HELMET_URL.
 * - video-poker: SUITS di logic.ts (0 Bata, 1 Kayu, 2 Besi, 3 Cat);
 *   merah = Bata & Cat (`suit === 0 || suit === 3` di komponen).
 *   Kunci di sini mengikuti INDEKS video-poker — jangan tertukar dengan
 *   urutan solitaire.
 * - blackjack: SATU-SATUNYA corak yang menyimpang — indeks 3 = Pipa biru
 *   (komponen SuitMaterial), BUKAN Cat. Tanda sudut kartu blackjack
 *   memakai karakter suit klasik dari logic.ts (♠♥♦♣), bukan glif;
 *   yang diganti hanya ikon material di tengah kartu.
 */

import { drawSprite, loadSprite, readySprite, spriteStatus, useSprite } from '../engine2d/sprites';

export { loadSprite, readySprite, spriteStatus, useSprite };

import corakBata from '../assets/card-suits/corak-bata.webp';
import corakKayu from '../assets/card-suits/corak-kayu.webp';
import corakBesi from '../assets/card-suits/corak-besi.webp';
import corakCat from '../assets/card-suits/corak-cat.webp';
import corakPipa from '../assets/card-suits/corak-pipa.webp';
import penandaHelm from '../assets/card-suits/penanda-helm.webp';

export const SUIT_BATA = corakBata;
export const SUIT_KAYU = corakKayu;
export const SUIT_BESI = corakBesi;
export const SUIT_CAT = corakCat;
export const SUIT_PIPA = corakPipa;
/** Helm proyek — penanda kartu wajah & As di solitaire. */
export const HELMET_URL = penandaHelm;

/** Corak per indeks SUIT_INFO solitaire (0 Besi, 1 Bata, 2 Kayu, 3 Cat). */
export const SOLITAIRE_SUITS: string[] = [corakBesi, corakBata, corakKayu, corakCat];

/** Corak per indeks SUITS video-poker (0 Bata, 1 Kayu, 2 Besi, 3 Cat). */
export const VIDEO_POKER_SUITS: string[] = [corakBata, corakKayu, corakBesi, corakCat];

/** Ikon material per indeks suit blackjack (0 Bata, 1 Besi, 2 Kayu, 3 Pipa). */
export const BLACKJACK_SUITS: string[] = [corakBata, corakBesi, corakKayu, corakPipa];

export const ALL_CARD_SUIT_SPRITES: string[] = [
  corakBata, corakKayu, corakBesi, corakCat, corakPipa, penandaHelm,
];

/** Muat awal seluruh set corak kartu (panggil sekali saat game dibuka). */
export function preloadCardSuits(): void {
  for (const u of ALL_CARD_SUIT_SPRITES) void loadSprite(u);
}

/**
 * Gambar corak terpusat di (cx, cy) muat di kotak maxW x maxH (persegi
 * bila maxH dikosongkan). Mengembalikan false bila sprite belum siap /
 * gagal — pemanggil menggambar glif prosedural fallback-nya.
 */
export function drawCardSuit(
  ctx: CanvasRenderingContext2D,
  url: string,
  cx: number,
  cy: number,
  maxW: number,
  maxH?: number,
): boolean {
  const img = readySprite(url);
  if (!img || maxW <= 0) return false;
  return drawSprite(ctx, img, cx, cy, maxW, maxH ?? maxW);
}
