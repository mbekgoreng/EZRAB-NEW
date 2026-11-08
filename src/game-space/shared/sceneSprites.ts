/**
 * Set ADEGAN & LATAR OBJEK TUNGGAL bersama Game Space — sprite generate-AI
 * dipakai lintas game kelompok sapuan visual 7 (hangman, lights-out,
 * maze-drag, number-guessing, dice-roll, sliding-puzzle, bubble-shooter,
 * quiz, simon-says, rock-paper-scissors).
 *
 * Memakai loader resmi `engine2d/sprites`; `drawSceneSprite` mengembalikan
 * false bila sprite belum siap/gagal — pemanggil menggambar prosedural lama
 * sebagai fallback (fungsi *Procedural di komponen masing-masing).
 *
 * Peta slug = objek persis dari kode tiap game:
 * - hangman: scene-tukang (`drawWorker` — pose calm/panic/dazed adalah
 *   KEADAAN ekspresi dari kode; sprite menggantikan gambar dasar pada pose
 *   tenang, keadaan panik/pusing tetap digambar prosedural + overlay bintang
 *   pusing), scene-perancah (bingkai utuh `drawScaffold` wrong=0; keadaan
 *   roboh bertahap 1..6 adalah keadaan permainan dari kode — patahan, miring,
 *   puing — dan tetap prosedural).
 * - lights-out: scene-lampu-nyala / scene-lampu-mati (`drawLamp` — gambar di
 *   dalam kotak sel yang sama; kerucut cahaya, genangan, kedip & pop tetap
 *   prosedural di atas/di belakang sprite pada kedua jalur).
 * - maze-drag: scene-troli (bola pemain visual troli; pemeriksaan tabrakan
 *   tetap `BALL_R` logic — sprite hanya kulit terpusat di titik bola).
 * - number-guessing: scene-molen (`drawMixerTruck` di adegan; strip spiral
 *   drum berputar, aliran cor, cipratan & asap tetap prosedural dinamis).
 * - dice-roll: scene-ikon-{bata,kayu,baut,cat,lampu,crane} = ikon material
 *   per sisi dari `FACES` logic.ts, digambar DI DALAM dadu prosedural
 *   menggantikan nama material teks (angka nilai tetap dari pip prosedural;
 *   ikon `icon` emoji-string di logic TIDAK pernah dirender komponen).
 * - sliding-puzzle: scene-blueprint = gambar utuh yang dipotong per keping
 *   (dipakai sebagai data-URI penuh menggantikan SVG data-URI prosedural;
 *   sprite sengaja TANPA teks/label — teks generate tidak dapat dipercaya).
 * - bubble-shooter: scene-gumpalan-semen = bola semen netral; warna adalah
 *   IDENTITAS match dari logic (indeks warna) sehingga rona warna digambar
 *   kode di atas sprite + glif bentuk per warna tetap digambar prosedural
 *   sebagai penanda fungsional (sama seperti sebelumnya).
 * - quiz & simon-says: scene-wajah-helm = maskot wajah helm (DOM `SvgIcon
 *   kind='helmet'`); simon-says: scene-rambu-{palu,helm,bendera,peluit} =
 *   glif bantalan dari `ABA_ABA` logic.ts (palu/helm/bendera/peluit) —
 *   panel, cahaya keadaan `lit`, warna panel & label tetap digambar kode.
 * - rock-paper-scissors: scene-jurus-{bata,gergaji,gambar} = glif jurus DOM
 *   `MoveGlyph` per `MOVES` logic.ts.
 * Penanda fungsional TIDAK diganti (tetap prosedural di semua jalur):
 * templat keadaan roboh hangman, kerucut/genangan lampu, rak labirin
 * (prerender per level), termometer panas/dingin number-guessing, pip &
 * angka dadu, glif bentuk bubble-shooter, panel+cahaya simon-says, kepala
 * mandor canvas simon-says (kedip = keadaan), ikon UI/HUD semua game.
 */

import { drawSprite, loadSprite, readySprite, useSprite } from '../engine2d/sprites';

export { loadSprite, readySprite, useSprite };

import sceneTukang from '../assets/scenes/scene-tukang.webp';
import scenePerancah from '../assets/scenes/scene-perancah.webp';
import sceneLampuNyala from '../assets/scenes/scene-lampu-nyala.webp';
import sceneLampuMati from '../assets/scenes/scene-lampu-mati.webp';
import sceneTroli from '../assets/scenes/scene-troli.webp';
import sceneMolen from '../assets/scenes/scene-molen.webp';
import sceneIkonBata from '../assets/scenes/scene-ikon-bata.webp';
import sceneIkonKayu from '../assets/scenes/scene-ikon-kayu.webp';
import sceneIkonBaut from '../assets/scenes/scene-ikon-baut.webp';
import sceneIkonCat from '../assets/scenes/scene-ikon-cat.webp';
import sceneIkonLampu from '../assets/scenes/scene-ikon-lampu.webp';
import sceneIkonCrane from '../assets/scenes/scene-ikon-crane.webp';
import sceneBlueprint from '../assets/scenes/scene-blueprint.webp';
import sceneGumpalanSemen from '../assets/scenes/scene-gumpalan-semen.webp';
import sceneWajahHelm from '../assets/scenes/scene-wajah-helm.webp';
import sceneRambuPalu from '../assets/scenes/scene-rambu-palu.webp';
import sceneRambuHelm from '../assets/scenes/scene-rambu-helm.webp';
import sceneRambuBendera from '../assets/scenes/scene-rambu-bendera.webp';
import sceneRambuPeluit from '../assets/scenes/scene-rambu-peluit.webp';
import sceneJurusBata from '../assets/scenes/scene-jurus-bata.webp';
import sceneJurusGergaji from '../assets/scenes/scene-jurus-gergaji.webp';
import sceneJurusGambar from '../assets/scenes/scene-jurus-gambar.webp';

/** Slug adegan & objek tunggal (nama objek persis dari kode game). */
export type SceneSlug =
  | 'scene-tukang' | 'scene-perancah'
  | 'scene-lampu-nyala' | 'scene-lampu-mati'
  | 'scene-troli' | 'scene-molen'
  | 'scene-ikon-bata' | 'scene-ikon-kayu' | 'scene-ikon-baut'
  | 'scene-ikon-cat' | 'scene-ikon-lampu' | 'scene-ikon-crane'
  | 'scene-blueprint' | 'scene-gumpalan-semen' | 'scene-wajah-helm'
  | 'scene-rambu-palu' | 'scene-rambu-helm' | 'scene-rambu-bendera' | 'scene-rambu-peluit'
  | 'scene-jurus-bata' | 'scene-jurus-gergaji' | 'scene-jurus-gambar';

export const SCENE_SPRITES: Record<SceneSlug, string> = {
  'scene-tukang': sceneTukang,
  'scene-perancah': scenePerancah,
  'scene-lampu-nyala': sceneLampuNyala,
  'scene-lampu-mati': sceneLampuMati,
  'scene-troli': sceneTroli,
  'scene-molen': sceneMolen,
  'scene-ikon-bata': sceneIkonBata,
  'scene-ikon-kayu': sceneIkonKayu,
  'scene-ikon-baut': sceneIkonBaut,
  'scene-ikon-cat': sceneIkonCat,
  'scene-ikon-lampu': sceneIkonLampu,
  'scene-ikon-crane': sceneIkonCrane,
  'scene-blueprint': sceneBlueprint,
  'scene-gumpalan-semen': sceneGumpalanSemen,
  'scene-wajah-helm': sceneWajahHelm,
  'scene-rambu-palu': sceneRambuPalu,
  'scene-rambu-helm': sceneRambuHelm,
  'scene-rambu-bendera': sceneRambuBendera,
  'scene-rambu-peluit': sceneRambuPeluit,
  'scene-jurus-bata': sceneJurusBata,
  'scene-jurus-gergaji': sceneJurusGergaji,
  'scene-jurus-gambar': sceneJurusGambar,
};

export const ALL_SCENE_SPRITES: string[] = Object.values(SCENE_SPRITES);

/** Muat awal seluruh set (panggil sekali saat game dibuka). */
export function preloadSceneSprites(): void {
  for (const u of ALL_SCENE_SPRITES) void loadSprite(u);
}

/**
 * Gambar sprite terpusat di (cx, cy) muat di kotak maxW x maxH.
 * Mengembalikan false bila sprite belum siap/gagal — pemanggil menggambar
 * prosedural fallback-nya.
 */
export function drawSceneSprite(
  ctx: CanvasRenderingContext2D,
  slug: SceneSlug,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): boolean {
  return drawSprite(ctx, readySprite(SCENE_SPRITES[slug]), cx, cy, maxW, maxH);
}

/**
 * Gambar sprite dengan SUMBER terpotong (fraksi 0..1 dari gambar utuh) ke
 * kotak tujuan persis w x h terpusat di (cx, cy) — untuk aset yang objeknya
 * hanya menempati sebagian bingkai (mis. kepala lampu di ujung tiang panjang)
 * atau yang harus mengisi rentang adegan persis (rangka perancah).
 * Mengembalikan false bila sprite belum siap/gagal.
 */
export function drawSceneSpriteRegion(
  ctx: CanvasRenderingContext2D,
  slug: SceneSlug,
  cx: number,
  cy: number,
  w: number,
  h: number,
  sxFrac: number,
  syFrac: number,
  swFrac: number,
  shFrac: number,
): boolean {
  const img = readySprite(SCENE_SPRITES[slug]);
  if (!img) return false;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  ctx.drawImage(img, sxFrac * iw, syFrac * ih, swFrac * iw, shFrac * ih, cx - w / 2, cy - h / 2, w, h);
  return true;
}
