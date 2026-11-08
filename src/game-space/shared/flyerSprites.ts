/**
 * Set karakter terbang & pelari BERSAMA Game Space — sprite generate-AI
 * untuk kelompok sapuan visual 4 (flappy-mandor, flappy-bird,
 * doodle-jump). Pola mengikuti set material (Kelompok 1), token papan
 * (Kelompok 2), dan corak kartu (Kelompok 3): tiap sprite `.webp`
 * transparan 512x512 dimuat lewat loader resmi `engine2d/sprites`;
 * gambar prosedural lama di tiap game tetap menjadi FALLBACK bila
 * sprite belum siap / gagal muat.
 *
 * KARAKTER — satu identitas fiksi generik proyek untuk ketiga game
 * (bukan meniru karakter game komersial mana pun):
 * - Mandor terbang (flappy-mandor & flappy-bird): figur samping menghadap
 *   KANAN — helm kuning bergerigi tengah, kumis, rompi oranye 2 strip
 *   reflektif perak, kerah navy, syal merah berkibar ke belakang, SATU
 *   sayap biru besar berujung bulu gelap. Kode kedua game menggerakkan
 *   sayapnya dengan SATU parameter fase (0..1 dari animasi flap): sayap
 *   terangkat penuh pada fase 1 dan kembali menyapu ke bawah pada
 *   fase 0. Karena itu set berisi DUA pose ujung yang digambar utuh
 *   (sayap ATAS / sayap BAWAH) dan penarikan MEMADUKAN keduanya dengan
 *   crossfade berbobot fase — ayunan sayap tetap menerus seperti
 *   mekanisme prosedural lama, bukan potongan dua frame yang meloncat.
 *   Rotasi mengikuti kecepatan dan squash sesaat sesudah flap tetap
 *   transformasi pemanggil (ctx.rotate/scale), tidak dibakar ke aset.
 * - Tukang lompat (doodle-jump): figur DEPAN — kode tidak memuat pose
 *   alternatif dan kakinya digambar menendang simetris; SATU pose netral
 *   mid-air cukup. Gerakan kaki prosedural bergantian kiri/kanan hilang
 *   bersama gambar lamanya (kaki sprite menekuk simetris); kemiringan
 *   arah gerak + squash & stretch pantulan tetap transformasi pemanggil.
 */

import { drawSprite, loadSprite, readySprite, spriteStatus, useSprite } from '../engine2d/sprites';

export { loadSprite, readySprite, spriteStatus, useSprite };

import mandorSayapAtas from '../assets/flyers/char-mandor-terbang-sayap-atas.webp';
import mandorSayapBawah from '../assets/flyers/char-mandor-terbang-sayap-bawah.webp';
import tukangLompat from '../assets/jumpers/char-tukang-lompat.webp';

/** Mandor terbang, sayap terangkat penuh (ujung atas ayunan). */
export const FLYER_WING_UP_URL = mandorSayapAtas;
/** Mandor terbang, sayap menyapu ke bawah (ujung bawah ayunan). */
export const FLYER_WING_DOWN_URL = mandorSayapBawah;
/** Tukang lompat tampak depan (doodle-jump). */
export const JUMPER_URL = tukangLompat;

export const ALL_FLYER_SPRITES: string[] = [
  mandorSayapAtas, mandorSayapBawah, tukangLompat,
];

/** Muat awal seluruh set karakter kelompok 4 (panggil sekali saat game dibuka). */
export function preloadFlyers(): void {
  for (const u of ALL_FLYER_SPRITES) void loadSprite(u);
}

/**
 * Gambar mandor terbang terpusat di (cx, cy), diskalakan agar lebarnya
 * `width` px (tinggi mengikuti aspek sprite). `wingPhase` 0..1 adalah
 * parameter fase sayap yang sama seperti mekanisme prosedural lama:
 * pose sayap-bawah digambar penuh, lalu pose sayap-atas dipadukan di
 * atasnya dengan alpha = wingPhase. Transformasi (rotasi/squash/translasi)
 * adalah urusan pemanggil — fungsi ini menggambar di dalam transformasi
 * yang sedang aktif. Mengembalikan false bila KEDUA pose belum siap /
 * gagal — pemanggil menggambar gambar prosedural fallback-nya. Bila
 * hanya satu pose siap, pose itu digambar apa adanya.
 */
export function drawFlyer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  wingPhase: number,
): boolean {
  if (width <= 0) return false;
  const up = readySprite(FLYER_WING_UP_URL);
  const down = readySprite(FLYER_WING_DOWN_URL);
  if (!up && !down) return false;
  const base = down ?? up;
  if (!base) return false;
  const h = (width * base.naturalHeight) / base.naturalWidth;
  const x = cx - width / 2;
  const y = cy - h / 2;
  if (down) ctx.drawImage(down, x, y, width, h);
  if (up) {
    if (down) {
      const a = Math.min(1, Math.max(0, wingPhase));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(up, x, y, width, h);
      ctx.restore();
    } else {
      ctx.drawImage(up, x, y, width, h);
    }
  }
  return true;
}

/**
 * Gambar tukang lompat terpusat di (cx, cy) muat di kotak maxW x maxH
 * (aspek terjaga oleh drawSprite). Mengembalikan false bila sprite belum
 * siap / gagal — pemanggil menggambar gambar prosedural fallback-nya.
 */
export function drawJumper(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): boolean {
  const img = readySprite(JUMPER_URL);
  if (!img || maxW <= 0 || maxH <= 0) return false;
  return drawSprite(ctx, img, cx, cy, maxW, maxH);
}
