/**
 * Ketapel Konstruksi — pure game logic (slingshot physics 2D, reskin konstruksi).
 * NO DOM / window / Math.random di sini. Semua deterministik.
 *
 * Mekanik terinspirasi genre ketapel fisika (tarik-lepas, runtuh berantai),
 * karakter & istilah 100% EZRAB: proyektil = KEPALA PEKERJA BERHELM PROYEK,
 * target = KEPALA "KLIEN REVISI" yang harus dijatuhkan dari struktur.
 *
 * Satuan: design px, world 900x700, ground y = 620.
 * Renderer memetakan dunia ke canvas dengan letterbox.
 */

export const WORLD_W = 900;
export const WORLD_H = 700;
export const GROUND_Y = 620;
export const GRAV = 1500; // px/s^2
export const DRAG_MAX = 150; // radius tarik maksimum (design px)
export const LAUNCH_POWER = 7.4; // kecepatan = jarakTarik * power
export const PREDICT_STEPS = 26;
export const PREDICT_DT = 1 / 22;

/* ------------------------------------------------------------------ */
/* Kepala berhelm — proyektil dengan skill per warna helm              */
/* ------------------------------------------------------------------ */

export type HelmColor = 'putih' | 'merah' | 'kuning' | 'hijau';
export type SkillKind = 'tumbuk' | 'ledak' | 'boost' | 'belah';

export interface HelmDef {
  color: HelmColor;
  /** Nama panggilan karakter (original EZRAB). */
  name: string;
  /** Peran/julukan di site. */
  role: string;
  skill: SkillKind;
  skillName: string;
  /** Penjelasan 1 baris untuk tutorial. */
  desc: string;
  mass: number;
  radius: number;
  /** Bonus damage datar pada tumbukan langsung yang solid. */
  bonusDamage: number;
  /** Warna helm untuk renderer. */
  helm: string;
  helmDark: string;
}

/**
 * Penyeimbangan skill (diaktifkan dengan KETUK saat melayang, 1x per lemparan):
 * - PUTIH "Mandor": massa 1.6 (terberat), +1 damage datar. Skill TUMBUK:
 *   menghujam lurus ke bawah (+2 damage hujaman) — satu-satunya cara memecah
 *   beton HP6 dalam sekali hantam penuh.
 * - MERAH "Kabel": massa 1.1 standar. Skill LEDAK: meledak radius 130,
 *   damage 3/2/1 menurut jarak — peruntuh area & pembunuh target bergerombol.
 * - KUNING "Pengawas": massa 0.9 (ringan), tapi skill BOOST mempercepat
 *   1.9x searah gerak + status boosted memberi +1 damage — penembus jarak jauh.
 * - HIJAU "Tukang": massa 1.0. Skill BELAH: membelah jadi 3 kepala
 *   (1 utama + 2 mini massa 0.45 menyebar ±0.38 rad) — damage menyebar.
 */
export const HELMS: Record<HelmColor, HelmDef> = {
  putih: {
    color: 'putih', name: 'Pak Mandor', role: 'Si Berat',
    skill: 'tumbuk', skillName: 'Tumbuk Hujam',
    desc: 'Paling berat, damage terbesar. Ketuk saat melayang: menghujam lurus ke bawah!',
    mass: 1.6, radius: 26, bonusDamage: 1, helm: '#f8fafc', helmDark: '#cbd5e1',
  },
  merah: {
    color: 'merah', name: 'Kabel', role: 'Si Pemecah',
    skill: 'ledak', skillName: 'Ledakan Kecil',
    desc: 'Ketuk saat melayang: MELEDAK! Menghancurkan material di sekitarnya.',
    mass: 1.1, radius: 23, bonusDamage: 0, helm: '#dc2626', helmDark: '#991b1b',
  },
  kuning: {
    color: 'kuning', name: 'Pengawas', role: 'Si Penembus',
    skill: 'boost', skillName: 'Meluncur Kilat',
    desc: 'Ketuk saat melayang: melesat 1,9x lebih cepat menembus kayu & bata ringan.',
    mass: 0.9, radius: 21, bonusDamage: 0, helm: '#facc15', helmDark: '#ca8a04',
  },
  hijau: {
    color: 'hijau', name: 'Tukang', role: 'Si Penyebar',
    skill: 'belah', skillName: 'Belah Tiga',
    desc: 'Ketuk saat melayang: membelah jadi 3 kepala menyebar. Satu pukulan, tiga sasaran.',
    mass: 1.0, radius: 23, bonusDamage: 0, helm: '#22c55e', helmDark: '#15803d',
  },
};

export const EXPLO_RADIUS = 130;
export const BOOST_FACTOR = 1.9;
export const SLAM_VY = 1020;
export const SPLIT_SPREAD = 0.38; // rad
export const MINI_MASS = 0.45;
export const MINI_R = 13;

/** Radius bola default (kompat lama). */
export const BALL_R = 23;

/**
 * Damage tumbukan dari momentum (kecepatan x massa):
 * gesekan ringan <240 -> 0 (hanya mendorong), lalu 1/2/3 berjenjang.
 * Inilah yang membuat lemparan keras terasa kuat dan lemparan lemah tidak.
 */
export function impactDamage(speed: number, mass: number): number {
  const p = Math.abs(speed) * mass;
  if (p < 320) return 0;
  if (p < 750) return 1;
  if (p < 1250) return 2;
  return 3;
}

/* ------------------------------------------------------------------ */
/* Material blok                                                       */
/* ------------------------------------------------------------------ */

export type Mat = 'kayu' | 'kaca' | 'bata' | 'beton' | 'berkas';

/** HP dalam poin damage (bukan jumlah pukul): tumbukan solid memberi 2-3. */
export const MAT_HP: Record<Mat, number> = {
  kaca: 1,
  kayu: 2,
  bata: 4,
  beton: 6,
  berkas: 1,
};

/** Kepadatan relatif — menentukan massa blok (momentum jatuh & dorongan). */
export const MAT_DENSITY: Record<Mat, number> = {
  kaca: 0.7,
  kayu: 1.0,
  bata: 1.7,
  beton: 2.4,
  berkas: 0.4,
};

export const MAT_SCORE: Record<Mat, number> = {
  kayu: 60,
  kaca: 80,
  bata: 120,
  beton: 200,
  berkas: 300,
};

export function blockMass(mat: Mat, w: number, h: number): number {
  return (MAT_DENSITY[mat] * (w * h)) / 2600;
}

/* ------------------------------------------------------------------ */
/* Entitas                                                             */
/* ------------------------------------------------------------------ */

export interface BlockDef {
  mat: Mat;
  x: number; // kiri-atas (design px)
  y: number;
  w: number;
  h: number;
}

export interface Block extends BlockDef {
  id: number;
  hp: number;
  mass: number;
  vx: number;
  vy: number;
  angle: number; // tilt visual (rad, dijepit)
  va: number;
  dead: boolean;
  grounded: boolean;
  /** waktu (s, jam state) terakhir kena bola per flightId — cegah damage ganda */
  lastHitAt: Record<number, number>;
}

export interface TargetDef {
  x: number; // kiri-atas figur (design px)
  y: number;
}

export const TARGET_W = 38;
export const TARGET_H = 50;
export const TARGET_SCORE = 500;

/** Kepala "Klien Revisi" — target yang harus dijatuhkan/dihancurkan. */
export interface TargetEnt extends TargetDef {
  id: number;
  vx: number;
  vy: number;
  angle: number;
  dead: boolean;
  grounded: boolean;
  wobble: number; // fase goyangan idle (visual)
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: HelmColor;
  mini: boolean;
  dead: boolean;
  age: number;
  slowT: number; // berapa lama sudah lambat (untuk mati wajar)
  flightId: number;
  skillUsed: boolean;
  boosted: boolean;
  slammed: boolean;
  spin: number; // rotasi visual kepala saat terbang
}

export interface Level {
  name: string;
  tagline: string;
  /** Antrean kepala yang dilempar, urut. */
  queue: HelmColor[];
  /** Jumlah lemparan (= queue.length, kompat). */
  balls: number;
  sling: { x: number; y: number };
  anchorX: number;
  defs: BlockDef[];
  targets: TargetDef[];
  /** Warna helm yang pertama kali diperkenalkan di level ini (tutorial). */
  intro?: HelmColor;
}

/** Event untuk juice di renderer (sfx/partikel/popup/kamera). */
export type KEvent =
  | { type: 'ballHit'; blockId: number; mat: Mat; x: number; y: number; hard: boolean; dmg: number }
  | { type: 'blockBreak'; mat: Mat; x: number; y: number; w: number; h: number }
  | { type: 'blockLand'; x: number; y: number; w: number; hard: boolean }
  | { type: 'launch'; x: number; y: number; color: HelmColor }
  | { type: 'ballDead' }
  | { type: 'skill'; skill: SkillKind; x: number; y: number; color: HelmColor }
  | { type: 'explode'; x: number; y: number; r: number }
  | { type: 'targetDown'; x: number; y: number; cause: 'bola' | 'ledakan' | 'jatuh' | 'tertimpa' }
  | { type: 'targetHit'; x: number; y: number };

/* ------------------------------------------------------------------ */
/* Level builder DSL                                                   */
/* ------------------------------------------------------------------ */

function B(mat: Mat, x: number, y: number, w: number, h: number): BlockDef {
  return { mat, x, y, w, h };
}

const COL_H: Record<Mat, number> = { kayu: 96, kaca: 96, bata: 76, beton: 84, berkas: 56 };
const COL_W = 30;

function tower(cx: number, baseY: number, mats: Mat[]): BlockDef[] {
  const out: BlockDef[] = [];
  let y = baseY;
  for (const m of mats) {
    const h = COL_H[m];
    y -= h;
    const w = m === 'berkas' ? 46 : COL_W;
    out.push(B(m, cx - w / 2, y, w, h));
  }
  return out;
}

function cap(x1: number, x2: number, yTop: number, mat: Mat, h = 26): BlockDef {
  return B(mat, x1, yTop, x2 - x1, h);
}

/** Target berdiri dengan kaki di baseY, terpusat di cx. */
function T(cx: number, baseY: number): TargetDef {
  return { x: cx - TARGET_W / 2, y: baseY - TARGET_H };
}

function L(
  name: string, tagline: string, anchorX: number,
  defs: BlockDef[], targets: TargetDef[], queue: HelmColor[], intro?: HelmColor,
): Level {
  return { name, tagline, queue, balls: queue.length, sling: { x: 150, y: 452 }, anchorX, defs, targets, intro };
}

export const LEVELS: Level[] = (() => {
  const g = GROUND_Y;
  const lv: Level[] = [];

  // L1 — pemanasan: 2 kolom kayu + papan, 1 klien di atas. Kenalkan PUTIH.
  {
    const a = 620;
    const topY = g - 96 * 2;
    const defs = [
      ...tower(a - 55, g, ['kayu', 'kayu']),
      ...tower(a + 55, g, ['kayu', 'kayu']),
      cap(a - 110, a + 110, topY - 26, 'kayu'),
    ];
    lv.push(L('Pemanasan', 'Revisi pertama selalu paling manis.', a, defs,
      [T(a, topY - 26)], ['putih', 'putih', 'putih'], 'putih'));
  }
  // L2 — kaca ikut main, klien di puncak + satu bersembunyi di dalam
  {
    const a = 600;
    const defs = [
      ...tower(a - 80, g, ['kayu', 'kaca']),
      ...tower(a, g, ['kayu', 'kayu', 'kaca']),
      ...tower(a + 80, g, ['kayu', 'kaca']),
      cap(a - 95, a + 95, g - 96 * 3 - 26, 'kaca'),
    ];
    lv.push(L('Kaca Mata', 'Klien bilang "coba dibuat lebih transparan".', a, defs,
      [T(a, g - 96 * 3 - 26), T(a - 40, g)], ['putih', 'putih', 'putih', 'putih']));
  }
  // L3 — bata muncul, MERAH diperkenalkan
  {
    const a = 630;
    const capY = g - 76 - 26; // papan kayu menumpu tepat di atas kolom bata (76)
    const topCapY = capY - 76 - 96 - 26;
    const defs = [
      ...tower(a - 70, g, ['bata']),
      ...tower(a + 70, g, ['bata']),
      cap(a - 85, a + 85, capY, 'kayu'),
      ...tower(a - 70, capY, ['bata', 'kayu']),
      ...tower(a + 70, capY, ['bata', 'kayu']),
      cap(a - 85, a + 85, topCapY, 'kaca'),
    ];
    lv.push(L('Tembok Revisi', 'Bata: keras kepala kayak owner proyek.', a, defs,
      [T(a - 70, topCapY), T(a + 70, topCapY)], ['putih', 'merah', 'putih', 'putih'], 'merah'));
  }
  // L4 — beton muncul, 3 klien (1 menara tengah, 2 di tanah)
  {
    const a = 600;
    const defs = [
      ...tower(a - 90, g, ['beton']),
      ...tower(a + 90, g, ['beton']),
      cap(a - 105, a + 105, g - 84 - 26, 'bata'),
      ...tower(a, g - 84 - 26, ['kayu', 'kayu']),
    ];
    lv.push(L('Cor Pagi Ini', 'Beton kuat. Untung ada Kabel si pemecah.', a, defs,
      [T(a, g - 84 - 26 - 96 * 2), T(a - 120, g), T(a + 120, g)],
      ['putih', 'merah', 'putih', 'merah']));
  }
  // L5 — menara kembar, KUNING diperkenalkan
  {
    const a = 590;
    const capY = g - 96 - 76 - 96 - 26;
    const defs = [
      ...tower(a - 120, g, ['kayu', 'bata', 'kaca']),
      ...tower(a - 40, g, ['bata', 'bata']),
      ...tower(a + 40, g, ['bata', 'bata']),
      ...tower(a + 120, g, ['kayu', 'bata', 'kaca']),
      cap(a - 135, a - 25, capY, 'kayu'),
      cap(a + 25, a + 135, capY, 'kayu'),
    ];
    lv.push(L('Twin Tower', 'Dua-duanya minta revisi. Serentak.', a, defs,
      [T(a - 80, capY), T(a + 80, capY)], ['kuning', 'putih', 'kuning', 'putih', 'putih'], 'kuning'));
  }
  // L6 — benteng beton, klien di puncak + di dalam benteng
  {
    const a = 640;
    const inner = g - 84;
    const capBetonY = inner - 84 - 26;
    const defs = [
      ...tower(a - 110, g, ['beton', 'beton']),
      ...tower(a + 110, g, ['beton', 'beton']),
      cap(a - 125, a + 125, capBetonY, 'beton'),
      ...tower(a - 55, capBetonY, ['bata', 'kaca']),
      ...tower(a + 55, capBetonY, ['bata', 'kaca']),
      cap(a - 70, a + 70, capBetonY - 76 - 96 - 26, 'kayu'),
    ];
    lv.push(L('Benteng Owner', 'Dindingnya setebal alasan telat bayar.', a, defs,
      [T(a, capBetonY - 76 - 96 - 26), T(a, g)], ['merah', 'putih', 'merah', 'putih', 'putih']));
  }
  // L7 — jantung kaca, HIJAU diperkenalkan
  {
    const a = 610;
    const capBataY = g - 84 - 26;
    const capKacaY = capBataY - 96 - 26;
    const defs = [
      ...tower(a - 130, g, ['beton']),
      ...tower(a - 45, g, ['kaca', 'kaca']),
      ...tower(a + 45, g, ['kaca', 'kaca']),
      ...tower(a + 130, g, ['beton']),
      cap(a - 145, a + 145, capBataY, 'bata'),
      ...tower(a - 90, capBataY, ['kayu']),
      ...tower(a + 90, capBataY, ['kayu']),
      cap(a - 105, a + 105, capKacaY, 'kaca'),
    ];
    lv.push(L('Jantung Kaca', 'Satu titik lemah di tengah kubu. Belah tiga!', a, defs,
      [T(a - 90, capBataY - 96), T(a + 90, capBataY - 96), T(a, capKacaY)],
      ['hijau', 'putih', 'hijau', 'kuning', 'putih'], 'hijau'));
  }
  // L8 — piramida + klien di puncak & di samping
  {
    const a = 600;
    const defs: BlockDef[] = [];
    const rows: Mat[][] = [
      ['beton', 'beton', 'beton', 'beton', 'beton'],
      ['bata', 'bata', 'bata', 'bata'],
      ['kayu', 'kayu', 'kayu'],
      ['kaca', 'kaca'],
    ];
    const bw = 46;
    let y = g;
    rows.forEach((row) => {
      const totalW = row.length * bw;
      row.forEach((m, ci) => {
        const h = 64;
        const x = a - totalW / 2 + ci * bw;
        defs.push(B(m, x, y - h, bw - 4, h));
      });
      y -= 64;
    });
    lv.push(L('Piramida RAB', 'Makin ke atas makin runcing anggarannya.', a, defs,
      [T(a, y), T(a + 185, g)], ['hijau', 'kuning', 'merah', 'putih', 'hijau', 'putih']));
  }
  // L9 — tiga menara, tiga klien di puncak
  {
    const a = 630;
    const capYL = g - 96 - 76 - 84 - 96 - 26;
    const capYM = g - 84 - 76 - 76 - 96 - 26;
    const defs = [
      ...tower(a - 150, g, ['kayu', 'bata', 'beton', 'kaca']),
      ...tower(a, g, ['beton', 'bata', 'bata', 'kaca']),
      ...tower(a + 150, g, ['kayu', 'bata', 'beton', 'kaca']),
      cap(a - 165, a - 105, capYL, 'kaca'),
      cap(a - 30, a + 45, capYM, 'kaca'),
      cap(a + 105, a + 165, capYL, 'kaca'),
    ];
    lv.push(L('Triple Threat', 'Tiga revisi. Tiga deadline. Satu malam.', a, defs,
      [T(a - 150, capYL), T(a, capYM), T(a + 150, capYL)],
      ['hijau', 'merah', 'kuning', 'hijau', 'putih', 'putih']));
  }
  // L10 — final: kastil
  {
    const a = 620;
    const inner = g - 84;
    const capBetonY = inner - 84 - 26;
    const topCapY = capBetonY - 96 - 96 - 26;
    const defs = [
      ...tower(a - 140, g, ['beton', 'beton', 'bata']),
      ...tower(a - 70, g, ['beton', 'bata', 'kaca']),
      ...tower(a + 70, g, ['beton', 'bata', 'kaca']),
      ...tower(a + 140, g, ['beton', 'beton', 'bata']),
      cap(a - 155, a - 55, capBetonY, 'beton'),
      cap(a + 55, a + 155, capBetonY, 'beton'),
      ...tower(a - 105, capBetonY, ['kayu', 'kayu']),
      ...tower(a + 105, capBetonY, ['kayu', 'kayu']),
      cap(a - 120, a + 120, topCapY, 'bata'),
      ...tower(a, topCapY, ['beton']),
    ];
    lv.push(L('Kastil Final', 'Revisi ke-13. Hancurkan semuanya. Puas-puasin.', a, defs,
      [T(a - 105, capBetonY - 96 * 2), T(a + 105, capBetonY - 96 * 2), T(a, topCapY - 84)],
      ['merah', 'hijau', 'kuning', 'putih', 'merah', 'hijau', 'putih']));
  }
  return lv;
})();

/* ------------------------------------------------------------------ */
/* Prediksi lintasan                                                   */
/* ------------------------------------------------------------------ */

export interface PPoint { x: number; y: number }

/** Simulasi parabola dengan integrator yang sama dengan stepBall. */
export function predict(
  x: number, y: number, vx: number, vy: number,
  g: number = GRAV, steps: number = PREDICT_STEPS, dt: number = PREDICT_DT,
): PPoint[] {
  const pts: PPoint[] = [];
  let px = x; let py = y; let pvx = vx; let pvy = vy;
  for (let i = 0; i < steps; i += 1) {
    pvy += g * dt;
    px += pvx * dt;
    py += pvy * dt;
    pts.push({ x: px, y: py });
    if (py > GROUND_Y) break;
  }
  return pts;
}

/** Kecepatan luncur dari posisi tarik (pocket) relatif ke anchor ketapel. */
export function launchVel(anchorX: number, anchorY: number, px: number, py: number): { vx: number; vy: number } {
  let dx = anchorX - px;
  let dy = anchorY - py;
  const d = Math.hypot(dx, dy);
  if (d > DRAG_MAX) {
    dx = (dx / d) * DRAG_MAX;
    dy = (dy / d) * DRAG_MAX;
  }
  return { vx: dx * LAUNCH_POWER, vy: dy * LAUNCH_POWER };
}

/* ------------------------------------------------------------------ */
/* Tabrakan primitif                                                   */
/* ------------------------------------------------------------------ */

export interface Rect { x: number; y: number; w: number; h: number }

export function circleRectCollide(cx: number, cy: number, r: number, rc: Rect): boolean {
  const nx = Math.max(rc.x, Math.min(cx, rc.x + rc.w));
  const ny = Math.max(rc.y, Math.min(cy, rc.y + rc.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function distToRect(cx: number, cy: number, rc: Rect): number {
  const nx = Math.max(rc.x, Math.min(cx, rc.x + rc.w));
  const ny = Math.max(rc.y, Math.min(cy, rc.y + rc.h));
  return Math.hypot(cx - nx, cy - ny);
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface KState {
  level: Level;
  levelIndex: number;
  blocks: Block[];
  targets: TargetEnt[];
  balls: Ball[];
  /** indeks lemparan berikutnya di level.queue (kepala aktif = queue[nextIdx]) */
  nextIdx: number;
  ballsLeft: number;
  score: number;
  phase: 'aim' | 'flying' | 'settle' | 'done';
  won: boolean;
  settleT: number;
  time: number;
  drag: { x: number; y: number } | null;
  nextFlightId: number;
}

/** Kepala yang sedang duduk di ketapel (null bila antrean habis). */
export function currentHead(s: KState): HelmColor | null {
  return s.nextIdx < s.level.queue.length ? s.level.queue[s.nextIdx] : null;
}

let idCounter = 1;

export function createState(levelIndex: number): KState {
  const level = LEVELS[levelIndex];
  idCounter = 1;
  const blocks: Block[] = level.defs.map((d) => ({
    ...d,
    id: idCounter++,
    hp: MAT_HP[d.mat],
    mass: blockMass(d.mat, d.w, d.h),
    vx: 0, vy: 0, angle: 0, va: 0,
    dead: false, grounded: false, lastHitAt: {},
  }));
  for (const b of blocks) b.grounded = isSupported(b, blocks);
  const targets: TargetEnt[] = level.targets.map((t, i) => ({
    ...t,
    id: idCounter++,
    vx: 0, vy: 0, angle: 0,
    dead: false, grounded: false, wobble: i * 1.7,
  }));
  for (const t of targets) t.grounded = isSupported({ x: t.x, y: t.y, w: TARGET_W, h: TARGET_H }, blocks);
  return {
    level, levelIndex, blocks, targets,
    balls: [], nextIdx: 0, ballsLeft: level.queue.length,
    score: 0, phase: 'aim', won: false, settleT: 0, time: 0,
    drag: null, nextFlightId: 1,
  };
}

/** Apakah rect entitas ditopang tanah / blok di bawahnya. */
function isSupported(
  e: { x: number; y: number; w: number; h: number },
  blocks: Block[],
  _targets?: TargetEnt[],
): boolean {
  const bottom = e.y + e.h;
  if (bottom >= GROUND_Y - 3) return true;
  // Penyangga dihitung dari TUMPAH-TINDIH TELAPAK, bukan titik tengah:
  // papan lebar yang menumpu dua kolom (titik tengahnya di celah) tetap
  // tertopang; balok yang hanya menyentuh <16px di ujung dianggap miring.
  const need = Math.min(16, e.w * 0.34);
  for (const o of blocks) {
    if (o.dead) continue;
    if ((o as unknown) === (e as unknown)) continue;
    if (Math.abs(o.y - bottom) > 6) continue;
    const overlap = Math.min(e.x + e.w, o.x + o.w) - Math.max(e.x, o.x);
    if (overlap >= need) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Damage                                                              */
/* ------------------------------------------------------------------ */

/** Damage sejumlah dmg poin ke blok; true bila hancur. */
export function damageBlockAmount(
  b: Block, dmg: number, events: KEvent[], scoreRef: { v: number },
  knock?: { vx: number; vy: number },
  opts?: { unground?: boolean },
): boolean {
  if (b.dead || dmg <= 0) return false;
  b.hp -= dmg;
  if (knock) {
    b.vx = knock.vx;
    b.vy = knock.vy;
    b.va = (knock.vx >= 0 ? 1 : -1) * Math.min(6, Math.hypot(knock.vx, knock.vy) / 220);
    if (opts?.unground ?? true) b.grounded = false;
  }
  if (b.hp <= 0) {
    b.dead = true;
    scoreRef.v += MAT_SCORE[b.mat];
    events.push({ type: 'blockBreak', mat: b.mat, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });
    return true;
  }
  events.push({ type: 'ballHit', blockId: b.id, mat: b.mat, x: b.x + b.w / 2, y: b.y + b.h / 2, hard: dmg >= 2, dmg });
  return false;
}

/** Kompat: damage tepat 1 poin. */
export function damageBlock(b: Block, events: KEvent[], scoreRef: { v: number }, knock?: { vx: number; vy: number }): boolean {
  return damageBlockAmount(b, 1, events, scoreRef, knock);
}

export function killTarget(
  t: TargetEnt, cause: 'bola' | 'ledakan' | 'jatuh' | 'tertimpa',
  events: KEvent[], scoreRef: { v: number },
): void {
  if (t.dead) return;
  t.dead = true;
  scoreRef.v += TARGET_SCORE;
  events.push({ type: 'targetDown', x: t.x + TARGET_W / 2, y: t.y + TARGET_H / 2, cause });
}

/**
 * Ledakan MERAH: damage 3/2/1 menurut jarak ke rect blok, target dalam
 * radius pasti tumbang, blok terdorong menjauhi pusat ledakan.
 */
export function explode(
  s: KState, cx: number, cy: number, events: KEvent[], scoreRef: { v: number },
): void {
  events.push({ type: 'explode', x: cx, y: cy, r: EXPLO_RADIUS });
  for (const b of s.blocks) {
    if (b.dead) continue;
    const d = distToRect(cx, cy, b);
    if (d > EXPLO_RADIUS) continue;
    const dmg = d <= 46 ? 3 : d <= 85 ? 2 : 1;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    const ang = Math.atan2(by - cy, bx - cx);
    const push = (1 - d / EXPLO_RADIUS) * 640 + 120;
    damageBlockAmount(b, dmg, events, scoreRef, {
      vx: Math.cos(ang) * push,
      vy: Math.sin(ang) * push - 260,
    });
    if (!b.dead) { b.grounded = false; }
  }
  for (const t of s.targets) {
    if (t.dead) continue;
    const d = distToRect(cx, cy, { x: t.x, y: t.y, w: TARGET_W, h: TARGET_H });
    if (d <= EXPLO_RADIUS + 6) killTarget(t, 'ledakan', events, scoreRef);
  }
}

/* ------------------------------------------------------------------ */
/* Tarik & luncur (dipakai input pemain DAN harness uji — jalur sama)  */
/* ------------------------------------------------------------------ */

export function beginDrag(s: KState, x: number, y: number): boolean {
  if (s.phase !== 'aim' || currentHead(s) === null) return false;
  const dx = x - s.level.sling.x;
  const dy = y - s.level.sling.y;
  if (Math.hypot(dx, dy) >= 90) return false;
  s.drag = { x, y };
  return true;
}

export function moveDrag(s: KState, x: number, y: number): void {
  if (!s.drag || s.phase !== 'aim') return;
  let dx = x - s.level.sling.x;
  let dy = y - s.level.sling.y;
  const d = Math.hypot(dx, dy);
  if (d > DRAG_MAX) { dx = (dx / d) * DRAG_MAX; dy = (dy / d) * DRAG_MAX; }
  s.drag = { x: s.level.sling.x + dx, y: s.level.sling.y + dy };
}

/** Lepas tarikan: buat bola kepala. Kembalikan true bila terluncur. */
export function releaseDrag(s: KState, events: KEvent[]): boolean {
  if (!s.drag || s.phase !== 'aim') return false;
  const color = currentHead(s);
  const drag = s.drag;
  s.drag = null;
  if (color === null) return false;
  const dx = s.level.sling.x - drag.x;
  const dy = s.level.sling.y - drag.y;
  if (Math.hypot(dx, dy) < 18) return false; // tarikan terlalu kecil -> batal
  const v = launchVel(s.level.sling.x, s.level.sling.y, drag.x, drag.y);
  const def = HELMS[color];
  s.balls.push({
    x: s.level.sling.x, y: s.level.sling.y,
    vx: v.vx, vy: v.vy,
    r: def.radius, color, mini: false,
    dead: false, age: 0, slowT: 0,
    flightId: s.nextFlightId++,
    skillUsed: false, boosted: false, slammed: false, spin: 0,
  });
  s.nextIdx += 1;
  s.ballsLeft = s.level.queue.length - s.nextIdx;
  s.phase = 'flying';
  events.push({ type: 'launch', x: s.level.sling.x, y: s.level.sling.y, color });
  return true;
}

/* ------------------------------------------------------------------ */
/* Skill (ketuk saat melayang) — sekali per lemparan                   */
/* ------------------------------------------------------------------ */

/** Bola utama yang bisa memakai skill sekarang (terbang, belum pakai, bukan mini). */
export function skillBall(s: KState): Ball | null {
  return s.balls.find((b) => !b.dead && !b.mini && !b.skillUsed) ?? null;
}

export function activateSkill(s: KState, events: KEvent[], scoreRef: { v: number }): boolean {
  if (s.phase !== 'flying') return false;
  const ball = skillBall(s);
  if (!ball) return false;
  const def = HELMS[ball.color];
  ball.skillUsed = true;
  events.push({ type: 'skill', skill: def.skill, x: ball.x, y: ball.y, color: ball.color });

  if (def.skill === 'ledak') {
    explode(s, ball.x, ball.y, events, scoreRef);
    ball.dead = true;
  } else if (def.skill === 'boost') {
    ball.vx *= BOOST_FACTOR;
    ball.vy *= BOOST_FACTOR;
    ball.boosted = true;
  } else if (def.skill === 'tumbuk') {
    ball.vx *= 0.18;
    ball.vy = Math.max(ball.vy, SLAM_VY);
    ball.slammed = true;
  } else if (def.skill === 'belah') {
    const sp = Math.hypot(ball.vx, ball.vy);
    const baseAng = Math.atan2(ball.vy, ball.vx);
    for (const da of [-SPLIT_SPREAD, SPLIT_SPREAD]) {
      const a = baseAng + da;
      s.balls.push({
        x: ball.x, y: ball.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: MINI_R, color: ball.color, mini: true,
        dead: false, age: 0, slowT: 0,
        flightId: s.nextFlightId++,
        skillUsed: true, boosted: false, slammed: false, spin: 0,
      });
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Stepping fisika                                                     */
/* ------------------------------------------------------------------ */

export function stepBall(ball: Ball, dt: number, g: number = GRAV): void {
  ball.vy += g * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.age += dt;
  ball.spin += (ball.vx / Math.max(10, ball.r)) * dt * 0.45;
}

export function ballShouldDie(ball: Ball): boolean {
  if (ball.x > WORLD_W + 90 || ball.x < -90 || ball.y > GROUND_Y + 110) return true;
  if (ball.age > 7) return true;
  return ball.slowT > 0.55;
}

/** Pantulan & gesekan tanah untuk bola; perbarui slowT. */
function ballGroundStep(ball: Ball, dt: number): void {
  if (ball.y + ball.r >= GROUND_Y) {
    ball.y = GROUND_Y - ball.r;
    if (Math.abs(ball.vy) > 130) {
      ball.vy = -ball.vy * 0.34;
      ball.vx *= 0.82;
    } else {
      ball.vy = 0;
      ball.vx *= Math.max(0, 1 - 4.5 * dt); // gesekan gulir tanah (kuat: tembakan datar cepat habis)
    }
  }
  const sp = Math.hypot(ball.vx, ball.vy);
  if (ball.age > 0.9 && sp < 58) ball.slowT += dt;
  else ball.slowT = 0;
}

function landBlock(b: Block, events: KEvent[], scoreRef: { v: number }, onTopOf?: Block): void {
  const impact = b.vy;
  b.vy = 0;
  b.vx *= 0.3;
  b.va *= 0.3;
  b.angle *= 0.6;
  b.grounded = true;
  if (onTopOf) {
    const dmg = impactDamage(impact, b.mass);
    if (dmg > 0) damageBlockAmount(onTopOf, dmg, events, scoreRef, { vx: b.vx * 0.4, vy: -120 });
  }
  if (impact > 430) {
    const self = impactDamage(impact, Math.max(0.6, 2.6 - b.mass)); // blok ringan lebih ringkih saat jatuh
    if (self > 0) damageBlockAmount(b, self, events, scoreRef);
    events.push({ type: 'blockLand', x: b.x + b.w / 2, y: b.y + b.h, w: b.w, hard: true });
  } else if (impact > 180) {
    events.push({ type: 'blockLand', x: b.x + b.w / 2, y: b.y + b.h, w: b.w, hard: false });
  }
}

/** Satu langkah fisika blok: jatuh tanpa penyangga, runtuh berantai. */
export function toppleStep(blocks: Block[], dt: number, events: KEvent[], scoreRef: { v: number }): void {
  for (const b of blocks) {
    if (b.dead) continue;
    if (!b.grounded) {
      b.vy += GRAV * dt;
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      b.angle += b.va * dt;
      if (b.angle > 0.6) { b.angle = 0.6; b.va = 0; }
      if (b.angle < -0.6) { b.angle = -0.6; b.va = 0; }
      b.vx *= 1 - 0.25 * dt;

      const bottom = b.y + b.h;
      if (bottom >= GROUND_Y) {
        b.y = GROUND_Y - b.h;
        landBlock(b, events, scoreRef);
        continue;
      }
      for (const o of blocks) {
        if (o === b || o.dead) continue;
        if (b.vy > 0 && bottom >= o.y && bottom - o.y < 26 && b.x + b.w * 0.6 > o.x && b.x + b.w * 0.4 < o.x + o.w) {
          b.y = o.y - b.h;
          landBlock(b, events, scoreRef, o);
          break;
        }
      }
    } else {
      if (!isSupported(b, blocks)) {
        b.grounded = false;
      } else if (Math.abs(b.vx) > 12) {
        b.x += b.vx * dt;
        b.vx *= 1 - 5 * dt;
        for (const o of blocks) {
          if (o === b || o.dead) continue;
          if (rectsOverlap(b, o)) {
            const sp = Math.abs(b.vx);
            o.vx = b.vx * 0.85;
            o.grounded = false;
            o.va = (b.vx >= 0 ? 1 : -1) * 2.5;
            const dmg = impactDamage(sp, b.mass);
            if (dmg > 0) damageBlockAmount(o, dmg, events, scoreRef);
            b.vx *= 0.25;
          }
        }
        if (!isSupported(b, blocks)) b.grounded = false;
      }
    }
  }
  // blok jatuh cepat menabrak blok lain -> damage berantai
  for (const b of blocks) {
    if (b.dead || b.grounded) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 230) continue;
    for (const o of blocks) {
      if (o === b || o.dead) continue;
      if (rectsOverlap(b, o)) {
        const dmg = impactDamage(sp, b.mass);
        if (dmg > 0) damageBlockAmount(o, dmg, events, scoreRef, { vx: b.vx * 0.7, vy: b.vy * 0.4 - 160 });
        b.vx *= 0.45;
        b.vy *= 0.45;
      }
    }
  }
}

/** Target: jatuh bila penopang hilang; jatuh keras = tumbang. */
export function targetStep(s: KState, dt: number, events: KEvent[], scoreRef: { v: number }): void {
  for (const t of s.targets) {
    if (t.dead) continue;
    t.wobble += dt * 2.2;
    const rect = { x: t.x, y: t.y, w: TARGET_W, h: TARGET_H };
    // tertimpa blok jatuh cepat?
    let crushed = false;
    for (const b of s.blocks) {
      if (b.dead || b.grounded) continue;
      if (b.vy < 240 || b.vy < Math.abs(b.vx) * 0.8) continue; // harus jatuh dari atas, bukan meluncur menyamping
      if (rectsOverlap(b, rect)) {
        const dmg = impactDamage(Math.hypot(b.vx, b.vy), b.mass);
        if (dmg > 0) { killTarget(t, 'tertimpa', events, scoreRef); crushed = true; }
        break;
      }
    }
    if (crushed) continue;

    if (!t.grounded) {
      t.vy += GRAV * dt;
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      t.angle = Math.max(-0.5, Math.min(0.5, t.vx * 0.0012));
      const bottom = t.y + TARGET_H;
      if (bottom >= GROUND_Y) {
        t.y = GROUND_Y - TARGET_H;
        landTarget(t, events, scoreRef);
        continue;
      }
      for (const o of s.blocks) {
        if (o.dead) continue;
        if (t.vy > 0 && bottom >= o.y && bottom - o.y < 24 && t.x + TARGET_W * 0.6 > o.x && t.x + TARGET_W * 0.4 < o.x + o.w) {
          t.y = o.y - TARGET_H;
          landTarget(t, events, scoreRef);
          break;
        }
      }
    } else if (!isSupported({ x: t.x, y: t.y, w: TARGET_W, h: TARGET_H }, s.blocks)) {
      t.grounded = false;
    }
  }
}

function landTarget(t: TargetEnt, events: KEvent[], scoreRef: { v: number }): void {
  const impact = t.vy;
  t.vy = 0;
  t.vx = 0;
  t.angle = 0;
  t.grounded = true;
  if (impact > 620) killTarget(t, 'jatuh', events, scoreRef);
}

/** Bola vs blok + bola vs target (per frame saat flying). */
export function ballBlockStep(s: KState, events: KEvent[], scoreRef: { v: number }): void {
  for (const ball of s.balls) {
    if (ball.dead) continue;
    const def = HELMS[ball.color];
    const mass = ball.mini ? MINI_MASS : def.mass;

    for (const b of s.blocks) {
      if (b.dead) continue;
      // Satu bola merusak satu blok HANYA SEKALI per lemparan (bukan gerinda
      // berulang saat bola meluncur menempel) — mini belahan punya flightId
      // sendiri sehingga tetap bisa memukul blok yang sama.
      if (b.lastHitAt[ball.flightId] !== undefined) continue;
      if (!circleRectCollide(ball.x, ball.y, ball.r, b)) continue;
      b.lastHitAt[ball.flightId] = s.time;
      const sp = Math.hypot(ball.vx, ball.vy);
      let dmg = impactDamage(sp, mass);
      if (dmg > 0) {
        if (!ball.mini && def.bonusDamage > 0) dmg += def.bonusDamage;
        if (ball.boosted) dmg += 1;
        if (ball.slammed) dmg += 2;
      }
      const nx = sp > 0 ? ball.vx / sp : 1;
      const ny = sp > 0 ? ball.vy / sp : 0;
      // Dorongan bola membuat blok TUMBANG, bukan terlontar: kecepatan knock
      // dijepit 300 px/s berapa pun kerasnya tumbukan; damage yang memecahkan.
      let kvx = nx * sp * 0.75 * (mass / Math.max(0.5, b.mass));
      let kvy = ny * sp * 0.45 - 190;
      const ksp = Math.hypot(kvx, kvy);
      if (ksp > 300) { kvx = (kvx / ksp) * 300; kvy = (kvy / ksp) * 300; }
      // Blok yang hanya retak TETAP berdiri di penyangganya; penyangga baru
      // lepas bila blok pecah (atau dari ledakan/dorongan berantai). Ini yang
      // membuat menara tidak tumbang hanya karena satu retakan.
      const broke = dmg > 0
        ? damageBlockAmount(b, dmg, events, scoreRef, { vx: kvx, vy: kvy }, { unground: false })
        : false;
      if (broke) b.grounded = false;
      if (dmg === 0) {
        // sentuhan ringan: dorong kecil saja
        b.vx += nx * 34 * (mass / Math.max(0.5, b.mass));
        if (!b.grounded && Math.abs(b.vx) > 4) b.va += nx * 0.6;
      }
      events.push({ type: 'ballHit', blockId: b.id, mat: b.mat, x: ball.x, y: ball.y, hard: sp > 420 && dmg > 0, dmg });
      // bola melambat: bola berat & blok pecah = tembus lebih jauh
      const retain = broke
        ? Math.min(0.72, 0.5 + 0.08 * mass)
        : Math.max(0.3, 0.5 - 0.06 * MAT_DENSITY[b.mat] + 0.03 * mass);
      ball.vx *= retain;
      ball.vy *= broke ? Math.min(0.72, 0.52 + 0.07 * mass) : retain;
      if (ball.slammed && !broke) { /* hujaman berhenti di blok keras */ ball.slammed = false; }
    }

    // bola vs target
    for (const t of s.targets) {
      if (t.dead) continue;
      if (!circleRectCollide(ball.x, ball.y, ball.r, { x: t.x, y: t.y, w: TARGET_W, h: TARGET_H })) continue;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (impactDamage(sp, mass) > 0 || sp > 210) {
        killTarget(t, 'bola', events, scoreRef);
        ball.vx *= 0.72;
        ball.vy *= 0.72;
      } else {
        events.push({ type: 'targetHit', x: t.x + TARGET_W / 2, y: t.y + 16 });
        t.vx += ball.vx * 0.12;
        ball.vx *= 0.6;
        ball.vy *= 0.6;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Objektif & update utama                                             */
/* ------------------------------------------------------------------ */

export function allTargetsDead(targets: TargetEnt[]): boolean {
  return targets.every((t) => t.dead);
}

export function remainingTargets(targets: Array<{ dead: boolean }>): number {
  return targets.filter((t) => !t.dead).length;
}

/** Kompat lama: berkas sebagai material blok biasa. */
export function allBerkasDead(blocks: Block[]): boolean {
  return blocks.filter((b) => b.mat === 'berkas').every((b) => b.dead);
}

export function remainingBerkas(blocks: Array<{ mat: Mat; dead: boolean }>): number {
  return blocks.filter((b) => b.mat === 'berkas' && !b.dead).length;
}

/**
 * Update utama per frame.
 * aim -> flying (bola hidup) -> settle (runtuh selesai) -> aim | done
 */
export function updateState(s: KState, dt: number): KEvent[] {
  const events: KEvent[] = [];
  const scoreRef = { v: s.score };
  s.time += dt;

  if (s.phase === 'flying') {
    for (const ball of s.balls) {
      if (ball.dead) continue;
      stepBall(ball, dt);
      ballGroundStep(ball, dt);
      if (ballShouldDie(ball)) ball.dead = true;
    }
    ballBlockStep(s, events, scoreRef);
    const before = s.balls.length;
    s.balls = s.balls.filter((b) => !b.dead);
    if (before > 0 && s.balls.length === 0) events.push({ type: 'ballDead' });
    if (s.balls.length === 0) {
      s.phase = 'settle';
      s.settleT = allTargetsDead(s.targets) ? 0.6 : 1.15;
    }
  }

  if (s.phase === 'settle' || s.phase === 'flying') {
    toppleStep(s.blocks, dt, events, scoreRef);
    targetStep(s, dt, events, scoreRef);
  }

  if (s.phase === 'settle') {
    s.settleT -= dt;
    if (s.settleT <= 0) {
      if (allTargetsDead(s.targets)) {
        s.phase = 'done';
        s.won = true;
      } else if (s.nextIdx < s.level.queue.length) {
        s.phase = 'aim';
      } else {
        s.phase = 'done';
        s.won = false;
      }
    }
  }

  s.score = scoreRef.v;
  return events;
}

/** Bintang 1-3 berdasar kepala terpakai (hanya bila menang). */
export function starFor(headsUsed: number, headsTotal: number): 1 | 2 | 3 {
  if (headsUsed <= Math.ceil(headsTotal / 2)) return 3;
  if (headsUsed < headsTotal) return 2;
  return 1;
}

/** Bonus skor: tiap kepala sisa +250. */
export function leftoverBonus(headsLeft: number): number {
  return headsLeft * 250;
}

/** Ekspresi kepala dari keadaan bola (dipakai renderer). */
export function ballMood(ball: Ball | null, phase: KState['phase']): 'semangat' | 'biasa' | 'pusing' {
  if (!ball) return 'semangat'; // kepala di ketapel selalu bersemangat
  if (phase !== 'flying') return 'biasa';
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > 480) return 'semangat';
  if (sp < 150 && ball.age > 0.8) return 'pusing';
  return 'biasa';
}

/* --- Umpan balik kerusakan & kejelasan objektif --- */

/**
 * Tingkat retak visual: 0 utuh, 1 retak, 2 retak parah.
 * Dari rasio sisa HP terhadap HP maksimum material.
 */
export function crackLevel(mat: Mat, hp: number): 0 | 1 | 2 {
  const max = MAT_HP[mat];
  if (hp >= max) return 0;
  if (hp <= max / 2) return 2;
  return 1;
}

/** Kekuatan tarikan ketapel 0..1 dari jarak tarik (meteran daya). */
export function launchPowerFrac(dragDist: number): number {
  if (dragDist <= 0) return 0;
  return Math.min(1, dragDist / DRAG_MAX);
}

export function launchPowerLabel(frac: number): 'LEMAH' | 'SEDANG' | 'KUAT' | 'MAKSIMUM' {
  if (frac >= 0.95) return 'MAKSIMUM';
  if (frac >= 0.6) return 'KUAT';
  if (frac >= 0.3) return 'SEDANG';
  return 'LEMAH';
}
