/**
 * Set objek JATUH & KETOK bersama Game Space — sprite generate-AI dipakai
 * lintas game kelompok sapuan visual 5 (whack-a-mole, shape-clicker,
 * insect-catch, emoji-catcher, fruit-slicer, tebas-material).
 *
 * Memakai ulang set glif material Kelompok 1 (`materialSprites`) untuk objek
 * yang IDENTIK secara peran (paku, palu, obeng, kunci pas, meteran, helm,
 * rompi, bata, kayu, dinamit) — ikon Kelompok 1 terbukti terbaca pada ukuran
 * tampil kecil. Yang digenerasi BARU di sini hanya objek yang tidak punya
 * padanan terbaca di set itu: bor emas insect-catch (mat-gergaji adalah
 * gergaji tangan, bukan bor), baut larangan whack-a-mole (kepala heks oranye
 * + slot silang = kode fungsi JANGAN DIPUKUL), bambu & triplek & beton
 * (material tebasan: mat-kayu adalah tumpukan papan, bukan lembaran/balok),
 * sarung tangan & sepatu boot (varian APD emoji-catcher), bintang & medali
 * (bonus emoji-catcher).
 *
 * Pola sama seperti modul bersama lain: muat lewat loader resmi
 * `engine2d/sprites`; `drawFallerSprite` mengembalikan false bila sprite
 * belum siap/gagal — pemanggil menggambar prosedural lama sebagai fallback.
 */

import { drawSprite, loadSprite, readySprite, useSprite } from '../engine2d/sprites';

export { loadSprite, readySprite, useSprite };

import objBambu from '../assets/fallers/obj-bambu.webp';
import objBautLarangan from '../assets/fallers/obj-baut-larangan.webp';
import objBeton from '../assets/fallers/obj-beton.webp';
import objBintang from '../assets/fallers/obj-bintang.webp';
import objBorEmas from '../assets/fallers/obj-bor-emas.webp';
import objMedali from '../assets/fallers/obj-medali.webp';
import objSarungTangan from '../assets/fallers/obj-sarung-tangan.webp';
import objSepatuBoot from '../assets/fallers/obj-sepatu-boot.webp';
import objTriplek from '../assets/fallers/obj-triplek.webp';

/** Slug objek jatuh & ketok baru (nama objek persis dari kode game). */
export type FallerSlug =
  | 'bambu' | 'baut-larangan' | 'beton' | 'bintang' | 'bor-emas'
  | 'medali' | 'sarung-tangan' | 'sepatu-boot' | 'triplek';

export const FALLER_SPRITES: Record<FallerSlug, string> = {
  bambu: objBambu,
  'baut-larangan': objBautLarangan,
  beton: objBeton,
  bintang: objBintang,
  'bor-emas': objBorEmas,
  medali: objMedali,
  'sarung-tangan': objSarungTangan,
  'sepatu-boot': objSepatuBoot,
  triplek: objTriplek,
};

export const ALL_FALLER_SPRITES: string[] = Object.values(FALLER_SPRITES);

/** Muat awal seluruh set baru (panggil sekali saat game dibuka). */
export function preloadFallerSprites(): void {
  for (const u of ALL_FALLER_SPRITES) void loadSprite(u);
}

/**
 * Gambar objek terpusat di (cx, cy) muat di kotak maxW x maxH.
 * Mengembalikan false bila sprite belum siap/gagal — pemanggil menggambar
 * prosedural fallback-nya.
 */
export function drawFallerSprite(
  ctx: CanvasRenderingContext2D,
  slug: FallerSlug,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): boolean {
  return drawSprite(ctx, readySprite(FALLER_SPRITES[slug]), cx, cy, maxW, maxH);
}
