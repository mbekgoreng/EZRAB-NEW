/**
 * Set glif material BERSAMA Game Space — sprite generate-AI dipakai lintas
 * game kelompok sapuan visual 1 (sudoku, candy-crush, mahjong-match,
 * memory-card, sortir-material, capit-crane).
 *
 * Pola sama seperti aset chess/crossy-road: tiap ikon `.webp` transparan
 * dimuat lewat loader resmi `engine2d/sprites` (loadSprite/readySprite/
 * useSprite dari modul ini di-re-export agar game cukup impor satu tempat).
 * Bila sprite belum siap / gagal muat, pemanggil WAJIB menggambar glif
 * prosedural lama sebagai fallback — fungsi `drawMaterialSprite` di sini
 * mengembalikan false untuk itu.
 *
 * Kunci = slug material dari kode game (nama persis di logic/komponen):
 * sudoku memakai angka 1..9 yang dipetakan di ArcadeSudoku; game lain
 * memakai id string / indeks MATERIALS-nya sendiri yang dipetakan di
 * komponen masing-masing ke slug di sini.
 */

import { drawSprite, loadSprite, readySprite, useSprite } from '../engine2d/sprites';

export { loadSprite, readySprite, useSprite };

import matAspal from '../assets/materials/mat-aspal.webp';
import matBalokBesi from '../assets/materials/mat-balok-besi.webp';
import matBarikade from '../assets/materials/mat-barikade.webp';
import matBata from '../assets/materials/mat-bata.webp';
import matBatu from '../assets/materials/mat-batu.webp';
import matBesi from '../assets/materials/mat-besi.webp';
import matCat from '../assets/materials/mat-cat.webp';
import matCrane from '../assets/materials/mat-crane.webp';
import matDinamit from '../assets/materials/mat-dinamit.webp';
import matGenteng from '../assets/materials/mat-genteng.webp';
import matGergaji from '../assets/materials/mat-gergaji.webp';
import matHelm from '../assets/materials/mat-helm.webp';
import matKabel from '../assets/materials/mat-kabel.webp';
import matKaca from '../assets/materials/mat-kaca.webp';
import matKawat from '../assets/materials/mat-kawat.webp';
import matKayu from '../assets/materials/mat-kayu.webp';
import matKeramik from '../assets/materials/mat-keramik.webp';
import matKunci from '../assets/materials/mat-kunci.webp';
import matKunciEmas from '../assets/materials/mat-kunci-emas.webp';
import matMarmer from '../assets/materials/mat-marmer.webp';
import matMeteran from '../assets/materials/mat-meteran.webp';
import matObeng from '../assets/materials/mat-obeng.webp';
import matPaku from '../assets/materials/mat-paku.webp';
import matPalu from '../assets/materials/mat-palu.webp';
import matPasir from '../assets/materials/mat-pasir.webp';
import matPipa from '../assets/materials/mat-pipa.webp';
import matRompi from '../assets/materials/mat-rompi.webp';
import matSemen from '../assets/materials/mat-semen.webp';
import matTangga from '../assets/materials/mat-tangga.webp';
import matToolbox from '../assets/materials/mat-toolbox.webp';

/** Slug ikon material bersama (nama material/peran persis dari kode game). */
export type MaterialSlug =
  | 'aspal' | 'balok-besi' | 'barikade' | 'bata' | 'batu' | 'besi' | 'cat'
  | 'crane' | 'dinamit' | 'genteng' | 'gergaji' | 'helm' | 'kabel' | 'kaca'
  | 'kawat' | 'kayu' | 'keramik' | 'kunci' | 'kunci-emas' | 'marmer'
  | 'meteran' | 'obeng' | 'paku' | 'palu' | 'pasir' | 'pipa' | 'rompi'
  | 'semen' | 'tangga' | 'toolbox';

export const MATERIAL_SPRITES: Record<MaterialSlug, string> = {
  aspal: matAspal,
  'balok-besi': matBalokBesi,
  barikade: matBarikade,
  bata: matBata,
  batu: matBatu,
  besi: matBesi,
  cat: matCat,
  crane: matCrane,
  dinamit: matDinamit,
  genteng: matGenteng,
  gergaji: matGergaji,
  helm: matHelm,
  kabel: matKabel,
  kaca: matKaca,
  kawat: matKawat,
  kayu: matKayu,
  keramik: matKeramik,
  kunci: matKunci,
  'kunci-emas': matKunciEmas,
  marmer: matMarmer,
  meteran: matMeteran,
  obeng: matObeng,
  paku: matPaku,
  palu: matPalu,
  pasir: matPasir,
  pipa: matPipa,
  rompi: matRompi,
  semen: matSemen,
  tangga: matTangga,
  toolbox: matToolbox,
};

export const ALL_MATERIAL_SPRITES: string[] = Object.values(MATERIAL_SPRITES);

/** Muat awal seluruh set (panggil sekali saat game dibuka). */
export function preloadMaterialSprites(): void {
  for (const u of ALL_MATERIAL_SPRITES) void loadSprite(u);
}

/**
 * Gambar ikon material terpusat di (cx, cy) muat di kotak maxW x maxH.
 * Mengembalikan false bila sprite belum siap/gagal — pemanggil menggambar
 * glif prosedural fallback-nya.
 */
export function drawMaterialSprite(
  ctx: CanvasRenderingContext2D,
  slug: MaterialSlug,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): boolean {
  return drawSprite(ctx, readySprite(MATERIAL_SPRITES[slug]), cx, cy, maxW, maxH);
}
