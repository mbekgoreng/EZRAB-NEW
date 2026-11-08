/**
 * Set KENDARAAN & PENEMBAK bersama Game Space — sprite generate-AI dipakai
 * lintas game kelompok sapuan visual 6 (battleship, asteroids, archery,
 * space-invaders, snake).
 *
 * Memakai loader resmi `engine2d/sprites`; `drawShooterSprite` mengembalikan
 * false bila sprite belum siap/gagal — pemanggil menggambar prosedural lama
 * sebagai fallback (fungsi *Procedural di komponen masing-masing).
 *
 * Peta slug = objek persis dari kode tiap game:
 * - battleship: veh-crane/bulldozer/excavator/molen/pickup per `ShipKind`
 *   logic.ts (crane, bulldozer, excavator, molen, pickup). Siluet digambar
 *   menghadap +x di ruang lokalnya, sama seperti `drawVehicleShape` lama.
 * - asteroids: char-drone (pemain, `drawDrone` — sprite SELALU tegak, putaran
 *   haluan kapal tetap transform pemanggil), char-drone-maling (saucer),
 *   obj-bata-jatuh (rock — bentuk bergerigi `Rock.verts` dari logic tetap
 *   penentu tabrakan; sprite diputar oleh `r.rot` pemanggil).
 * - archery: obj-nail-gun (`drawNailGun`), obj-papan-triplek (`drawTarget` —
 *   lingkaran ring 1..4 di logic.ts adalah skor; sprite membawa ring lukis
 *   dengan urutan warna yang sama, paku menancap digambar di atasnya).
 * - space-invaders: obj-kalender (baris 1..4) & obj-kalender-panas (baris 0,
 *   "hot") — label teks DL!/H-3/H-7/REV-2/REV-1 dari `DEADLINES` logic.ts
 *   tetap digambar kode DI ATAS sprite (teks fungsional, bukan glif);
 *   char-tukang-tembak (`drawPlayer`), char-mandor-lewat (`drawUfo`).
 * - snake: char-kepala-steker (kepala ular = steker dari kode; mata kedip &
 *   mulut prosedural digambar di atasnya), obj-konektor (makanan biasa) &
 *   obj-konektor-emas (bonus emas dari logic.ts).
 * Penanda fungsional TIDAK diganti (tetap prosedural di semua jalur):
 * ledakan/riak/asap battleship, templat tameng RAB space-invaders (grid
 * boolean logic), ring skor murni archery (`RING_RADII`), badan kabel &
 * pagar snake, overlay HUD semua game.
 */

import { drawSprite, loadSprite, readySprite, useSprite } from '../engine2d/sprites';

export { loadSprite, readySprite, useSprite };

import vehCrane from '../assets/shooters/veh-crane.webp';
import vehBulldozer from '../assets/shooters/veh-bulldozer.webp';
import vehExcavator from '../assets/shooters/veh-excavator.webp';
import vehMolen from '../assets/shooters/veh-molen.webp';
import vehPickup from '../assets/shooters/veh-pickup.webp';
import charDrone from '../assets/shooters/char-drone.webp';
import charDroneMaling from '../assets/shooters/char-drone-maling.webp';
import objBataJatuh from '../assets/shooters/obj-bata-jatuh.webp';
import objNailGun from '../assets/shooters/obj-nail-gun.webp';
import objPapanTriplek from '../assets/shooters/obj-papan-triplek.webp';
import objKalender from '../assets/shooters/obj-kalender.webp';
import objKalenderPanas from '../assets/shooters/obj-kalender-panas.webp';
import charTukangTembak from '../assets/shooters/char-tukang-tembak.webp';
import charMandorLewat from '../assets/shooters/char-mandor-lewat.webp';
import charKepalaSteker from '../assets/shooters/char-kepala-steker.webp';
import objKonektor from '../assets/shooters/obj-konektor.webp';
import objKonektorEmas from '../assets/shooters/obj-konektor-emas.webp';

/** Slug kendaraan & penembak (nama objek persis dari kode game). */
export type ShooterSlug =
  | 'veh-crane' | 'veh-bulldozer' | 'veh-excavator' | 'veh-molen' | 'veh-pickup'
  | 'char-drone' | 'char-drone-maling' | 'obj-bata-jatuh'
  | 'obj-nail-gun' | 'obj-papan-triplek'
  | 'obj-kalender' | 'obj-kalender-panas' | 'char-tukang-tembak' | 'char-mandor-lewat'
  | 'char-kepala-steker' | 'obj-konektor' | 'obj-konektor-emas';

export const SHOOTER_SPRITES: Record<ShooterSlug, string> = {
  'veh-crane': vehCrane,
  'veh-bulldozer': vehBulldozer,
  'veh-excavator': vehExcavator,
  'veh-molen': vehMolen,
  'veh-pickup': vehPickup,
  'char-drone': charDrone,
  'char-drone-maling': charDroneMaling,
  'obj-bata-jatuh': objBataJatuh,
  'obj-nail-gun': objNailGun,
  'obj-papan-triplek': objPapanTriplek,
  'obj-kalender': objKalender,
  'obj-kalender-panas': objKalenderPanas,
  'char-tukang-tembak': charTukangTembak,
  'char-mandor-lewat': charMandorLewat,
  'char-kepala-steker': charKepalaSteker,
  'obj-konektor': objKonektor,
  'obj-konektor-emas': objKonektorEmas,
};

export const ALL_SHOOTER_SPRITES: string[] = Object.values(SHOOTER_SPRITES);

/** Muat awal seluruh set (panggil sekali saat game dibuka). */
export function preloadShooterSprites(): void {
  for (const u of ALL_SHOOTER_SPRITES) void loadSprite(u);
}

/**
 * Gambar sprite terpusat di (cx, cy) muat di kotak maxW x maxH.
 * Mengembalikan false bila sprite belum siap/gagal — pemanggil menggambar
 * prosedural fallback-nya.
 */
export function drawShooterSprite(
  ctx: CanvasRenderingContext2D,
  slug: ShooterSlug,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): boolean {
  return drawSprite(ctx, readySprite(SHOOTER_SPRITES[slug]), cx, cy, maxW, maxH);
}
