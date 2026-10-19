/**
 * Bongkar Rumah 3D — pure game logic (tanpa DOM / three.js).
 *
 * Gedung = kumpulan blok pada grid 3D (1 sel = 1 unit dunia, y ke atas,
 * tanah y=0). Tiga lapis destruksi:
 *   facade   — dinding luar, jendela kaca, pintu, atap      (HP rendah)
 *   interior — lantai, sekat ruangan, perabot                 (HP 1)
 *   structure— kolom & balok/slab beton penahan               (HP 2-3)
 *
 * Blok intact/cracked yang kehilangan penyangga -> shaking (goyang
 * 0.1-0.35 dtk, supaya runtuhan terbaca beruntun) -> falling (gravitasi
 * + oleng) -> mendarat jadi rubble (menumpuk, bisa menyangga) atau
 * memantul bila keras. Menang saat >= 98% blok gone/rubble.
 */

export type Layer3D = 'facade' | 'interior' | 'structure';
export type Mat3D =
  | 'bata' | 'beton' | 'kaca' | 'kayu'
  | 'genteng' | 'plester' | 'lantai' | 'pintu';
export type BState = 'intact' | 'cracked' | 'shaking' | 'falling' | 'rubble' | 'gone';
export type Shape3D = 'box' | 'gable' | 'panel';

export interface Block3D {
  id: number;
  /** footprint grid: sel [cx, cx+cw) x [cz, cz+cd) */
  cx: number; cz: number; cw: number; cd: number;
  /** vertikal: bawah + tinggi (unit dunia) */
  y0: number; h: number;
  layer: Layer3D;
  mat: Mat3D;
  shape: Shape3D;
  hp: number; maxHp: number;
  state: BState;
  /** fisika (posisi bawah-tengah) */
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  tilt: number; vtilt: number;
  tiltAxis: number; // sudut yaw sumbu oleng
  slope: number;    // kemiringan visual panel atap (rad, sb-X)
  rotY: number;
  shakeT: number;
  bounces: number;
  seed: number;
  /** true -> selalu tersangga (kantilever: balkon, papan nama) */
  anchored: boolean;
  /** warna tint per-instance (0xffffff = netral) */
  tint: number;
}

export const GRAVITY = 22;          // unit/s^2
export const COMBO_WINDOW = 1.5;    // detik
export const WIN_PROGRESS = 0.98;
export const BASE_POINTS = 10;
export const MAX_MULTIPLIER = 5;
export const SUPPORT_MIN = 0.3;    // fraksi footprint min. agar tersangga
export const BOUNCE_IMPACT = 9;     // impact > ini -> memantul, bukan langsung rubble

/* ---------------- combo ---------------- */

export interface Combo { count: number; lastAt: number; }
export const createCombo = (): Combo => ({ count: 0, lastAt: -Infinity });

export function activeMultiplier(combo: Combo, now: number): number {
  if (now - combo.lastAt > COMBO_WINDOW) return 0;
  return Math.min(MAX_MULTIPLIER, combo.count);
}

/* ---------------- events ---------------- */

export type LogicEvent =
  | { type: 'destroyed'; block: Block3D }
  | { type: 'cracked'; block: Block3D }
  | { type: 'collapseStart'; block: Block3D }
  | { type: 'fallStart'; block: Block3D }
  | { type: 'landed'; block: Block3D; impact: number }
  | { type: 'bounced'; block: Block3D };

export interface DestroyResult {
  ok: boolean;
  points: number;
  multiplier: number;
  events: LogicEvent[];
}

/**
 * Ketuk blok: kurangi HP. HP habis -> gone (+skor kombo).
 * Blok retak (cracked) bila masih sisa HP.
 */
export function destroyBlock(
  blocks: Block3D[],
  id: number,
  combo: Combo,
  now: number,
): DestroyResult {
  const b = blocks.find((x) => x.id === id);
  if (!b || (b.state !== 'intact' && b.state !== 'cracked')) {
    return { ok: false, points: 0, multiplier: 1, events: [] };
  }
  b.hp -= 1;
  if (b.hp <= 0) {
    b.state = 'gone';
    b.vx = 0; b.vy = 0; b.vz = 0;
    if (now - combo.lastAt <= COMBO_WINDOW) combo.count += 1;
    else combo.count = 1;
    combo.lastAt = now;
    const multiplier = Math.min(MAX_MULTIPLIER, combo.count);
    return {
      ok: true, points: BASE_POINTS * multiplier, multiplier,
      events: [{ type: 'destroyed', block: b }],
    };
  }
  b.state = 'cracked';
  return { ok: true, points: 0, multiplier: 1, events: [{ type: 'cracked', block: b }] };
}

/* ---------------- support & collapse ---------------- */

function isSolid(b: Block3D): boolean {
  return b.state === 'intact' || b.state === 'cracked'
    || b.state === 'shaking' || b.state === 'rubble';
}

interface CellMap { [key: string]: Block3D[]; }

/** Indeks sel -> blok solid (dibangun ulang tiap cek; murah untuk <1000 blok). */
function buildCellMap(blocks: Block3D[]): CellMap {
  const map: CellMap = {};
  for (const b of blocks) {
    if (!isSolid(b)) continue;
    const ix0 = Math.floor(b.cx);
    const iz0 = Math.floor(b.cz);
    for (let ix = ix0; ix < b.cx + b.cw; ix += 1) {
      for (let iz = iz0; iz < b.cz + b.cd; iz += 1) {
        const k = `${ix},${iz}`;
        (map[k] ??= []).push(b);
      }
    }
  }
  return map;
}

/** Sel footprint yang dicakup blok (utk supportRatio). */
function footprintCells(b: Block3D): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let ix = Math.floor(b.cx); ix < b.cx + b.cw; ix += 1) {
    for (let iz = Math.floor(b.cz); iz < b.cz + b.cd; iz += 1) {
      out.push([ix, iz]);
    }
  }
  return out;
}

/** Apakah puncak blok o menopang alas blok b (toleransi 0.15)? */
function topSupportsBottom(o: Block3D, b: Block3D): boolean {
  const top = o.py + o.h;
  return top >= b.py - 0.15 && top <= b.py + 0.6;
}

/**
 * Fraksi sel footprint yang punya penyangga (blok solid yang puncaknya
 * menempel di bawah blok ini). 1.0 = penuh.
 */
export function supportRatio(b: Block3D, map: CellMap): number {
  if (b.y0 <= 0.01) return 1;
  const cells = footprintCells(b);
  let sup = 0;
  for (const [ix, iz] of cells) {
    const arr = map[`${ix},${iz}`];
    if (!arr) continue;
    for (const o of arr) {
      if (o === b) continue;
      if (topSupportsBottom(o, b)) { sup += 1; break; }
    }
  }
  return cells.length === 0 ? 1 : sup / cells.length;
}

export function isSupported(b: Block3D, map: CellMap): boolean {
  if (b.anchored) return true;
  return supportRatio(b, map) >= SUPPORT_MIN;
}

/**
 * Tandai blok intact/cracked yang kehilangan penyangga -> 'shaking'
 * (dengan jeda acak-deterministik supaya runtuh beruntun, bukan serentak).
 * Panggil saat ada perubahan (setelah destroy/land), bukan tiap frame.
 */
export function checkCollapse(blocks: Block3D[]): LogicEvent[] {
  const events: LogicEvent[] = [];
  const map = buildCellMap(blocks);
  for (const b of blocks) {
    if ((b.state === 'intact' || b.state === 'cracked') && !isSupported(b, map)) {
      b.state = 'shaking';
      b.shakeT = 0.1 + ((b.seed % 100) / 100) * 0.25;
      events.push({ type: 'collapseStart', block: b });
    }
  }
  return events;
}

/** Titik tumpu rata-rata (untuk arah oleng saat mulai jatuh). */
function supportCentroid(b: Block3D, map: CellMap): { x: number; z: number } {
  let sx = 0; let sz = 0; let n = 0;
  for (const [ix, iz] of footprintCells(b)) {
    const arr = map[`${ix},${iz}`];
    if (!arr) continue;
    for (const o of arr) {
      if (o === b) continue;
      if (topSupportsBottom(o, b)) {
        sx += ix + 0.5; sz += iz + 0.5; n += 1; break;
      }
    }
  }
  if (n === 0) return { x: b.px, z: b.pz };
  return { x: sx / n, z: sz / n };
}

/** Permukaan pendaratan tertinggi di bawah blok (tanah=0 / puncak blok solid). */
function landingTop(b: Block3D, blocks: Block3D[]): number {
  let top = 0;
  const x0 = b.px - (b.cw / 2); const x1 = b.px + (b.cw / 2);
  const z0 = b.pz - (b.cd / 2); const z1 = b.pz + (b.cd / 2);
  for (const o of blocks) {
    if (o === b || !isSolid(o)) continue;
    const ox0 = o.px - (o.cw / 2); const ox1 = o.px + (o.cw / 2);
    const oz0 = o.pz - (o.cd / 2); const oz1 = o.pz + (o.cd / 2);
    if (x1 <= ox0 || x0 >= ox1 || z1 <= oz0 || z0 >= oz1) continue;
    const ot = o.py + o.h;
    if (ot <= b.py + 0.05 && ot > top) top = ot;
  }
  return top;
}

/**
 * Majukan fisika satu langkah: shaking -> falling -> landed/rubble.
 * Kembalikan events untuk juice (debu/suara/shake).
 */
export function stepPhysics(blocks: Block3D[], dt: number): LogicEvent[] {
  const events: LogicEvent[] = [];
  const map = buildCellMap(blocks);
  for (const b of blocks) {
    if (b.state === 'shaking') {
      b.shakeT -= dt;
      if (b.shakeT <= 0) {
        b.state = 'falling';
        const c = supportCentroid(b, map);
        let dx = b.px - c.x; let dz = b.pz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01) { dx /= d; dz /= d; }
        else { dx = ((b.seed % 7) - 3) / 3; dz = ((b.seed % 5) - 2) / 2; }
        const push = 0.8 + ((b.seed % 50) / 50) * 1.2;
        b.vx = dx * push; b.vz = dz * push; b.vy = 0;
        b.tiltAxis = Math.atan2(dx, dz);
        b.vtilt = (1.2 + ((b.seed % 40) / 40) * 2.2) * (d > 0.01 ? 1 : (((b.seed % 2) * 2) - 1));
        events.push({ type: 'fallStart', block: b });
      }
    } else if (b.state === 'falling') {
      // permukaan dihitung SEBELUM integrasi (anti-tunneling saat menumpuk)
      const top = landingTop(b, blocks);
      b.vy -= GRAVITY * dt;
      // redaman horizontal ringan agar tumpukan tetap koheren
      const damp = Math.max(0, 1 - 0.6 * dt);
      b.vx *= damp; b.vz *= damp;
      b.px += b.vx * dt;
      b.py += b.vy * dt;
      b.pz += b.vz * dt;
      b.tilt += b.vtilt * dt;
      if (b.tilt > 1.1) { b.tilt = 1.1; b.vtilt *= 0.4; }
      if (b.py <= top) {
        const impact = -b.vy;
        b.py = top;
        if (impact > BOUNCE_IMPACT && b.bounces < 1) {
          // memantul sekali (di tanah / tumpukan), lalu memadat
          b.vy = impact * 0.18;
          b.vx *= 0.5; b.vz *= 0.5;
          b.vtilt *= 0.5;
          b.bounces += 1;
          events.push({ type: 'bounced', block: b });
        } else {
          b.state = 'rubble';
          b.vx = 0; b.vy = 0; b.vz = 0; b.vtilt = 0;
          b.tilt *= 0.45;
          b.h *= 0.55; // puing memadat
          events.push({ type: 'landed', block: b, impact });
        }
      }
      // jatuh jauh ke luar arena -> rubble di tanah (pengaman)
      if (b.py < -8) {
        b.py = 0; b.state = 'rubble'; b.h *= 0.55;
        b.vx = 0; b.vy = 0; b.vz = 0; b.vtilt = 0;
        events.push({ type: 'landed', block: b, impact: 12 });
      }
    }
  }
  // perubahan penyangga (mulai jatuh / mendarat) -> cek ulang runtuhan
  if (events.some((e) => e.type === 'landed' || e.type === 'fallStart')) {
    for (const e of checkCollapse(blocks)) events.push(e);
  }
  return events;
}

/* ---------------- progress & win ---------------- */

/** Proporsi blok yang sudah hancur (gone + rubble), 0..1. */
export function progress(blocks: Block3D[]): number {
  if (blocks.length === 0) return 0;
  let done = 0;
  for (const b of blocks) {
    if (b.state === 'gone' || b.state === 'rubble') done += 1;
  }
  return done / blocks.length;
}

export function isWon(blocks: Block3D[]): boolean {
  return progress(blocks) >= WIN_PROGRESS;
}

/** Jumlah blok per lapis (untuk HUD "lapis"). */
export function layerCounts(blocks: Block3D[]): Record<Layer3D, { total: number; left: number }> {
  const out: Record<Layer3D, { total: number; left: number }> = {
    facade: { total: 0, left: 0 },
    interior: { total: 0, left: 0 },
    structure: { total: 0, left: 0 },
  };
  for (const b of blocks) {
    out[b.layer].total += 1;
    if (b.state === 'intact' || b.state === 'cracked' || b.state === 'shaking') {
      out[b.layer].left += 1;
    }
  }
  return out;
}

/* ---------------- level data ---------------- */

export interface LevelMeta {
  name: string;
  sub: string;
  tagline: string;
}

export const LEVELS: LevelMeta[] = [
  { name: 'Rumah Type 36', sub: 'Fasad bata 1 lantai + atap prism', tagline: 'Kontraktor kabur bawa uang muka. Tersisa kamu dan dendam.' },
  { name: 'Ruko 2 Lantai', sub: 'Etalase kaca + papan nama + tandon', tagline: 'Tokonya tutup. Saatnya bongkar.' },
  { name: 'Apartemen', sub: '4 lantai + balkon + banyak kolom', tagline: 'Penghuninya sudah pindah. Bangunannya belum.' },
  { name: 'Tower', sub: '7 lantai + core beton + tirai kaca', tagline: 'Revisi ke-13. Hancurkan semuanya.' },
];

export interface LevelData {
  meta: LevelMeta;
  blocks: Block3D[];
  /** batas bangunan untuk kamera: {x0,x1,z0,z1,top} */
  bounds: { x0: number; x1: number; z0: number; z1: number; top: number };
}

let nextId = 1;

interface BOpts {
  shape?: Shape3D;
  slope?: number;
  rotY?: number;
  anchored?: boolean;
  tint?: number;
}

function B(
  blocks: Block3D[], seed: number,
  cx: number, cz: number, cw: number, cd: number, y0: number, h: number,
  layer: Layer3D, mat: Mat3D, hp: number, o: BOpts = {},
): Block3D {
  const b: Block3D = {
    id: nextId++,
    cx, cz, cw, cd, y0, h,
    layer, mat, shape: o.shape ?? 'box',
    hp, maxHp: hp, state: 'intact',
    px: cx + cw / 2, py: y0, pz: cz + cd / 2,
    vx: 0, vy: 0, vz: 0,
    tilt: 0, vtilt: 0, tiltAxis: 0,
    slope: o.slope ?? 0, rotY: o.rotY ?? 0,
    shakeT: 0, bounces: 0, seed,
    anchored: o.anchored ?? false,
    tint: o.tint ?? 0xffffff,
  };
  blocks.push(b);
  return b;
}

function boundsOf(blocks: Block3D[]): LevelData['bounds'] {
  let x0 = Infinity; let x1 = -Infinity;
  let z0 = Infinity; let z1 = -Infinity;
  let top = 0;
  for (const b of blocks) {
    x0 = Math.min(x0, b.cx); x1 = Math.max(x1, b.cx + b.cw);
    z0 = Math.min(z0, b.cz); z1 = Math.max(z1, b.cz + b.cd);
    top = Math.max(top, b.y0 + b.h);
  }
  return { x0, x1, z0, z1, top };
}

/* ----- L1: Rumah Type 36 (7 x 5, dinding h=3) ----- */
function buildHouse(facadeHp: number): Block3D[] {
  const blocks: Block3D[] = [];
  let s = 1;
  const W = 7; const D = 5; const WH = 3;
  // lantai interior
  B(blocks, s++, 0, 0, W, D, 0, 0.25, 'interior', 'lantai', 1);
  // kolom sudut struktur (mengganti bata di sudut)
  const corners: Array<[number, number]> = [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]];
  for (const [qx, qz] of corners) {
    B(blocks, s++, qx, qz, 1, 1, 0, WH, 'structure', 'beton', 3);
  }
  // dinding depan (z=0): pintu x=3, jendela x=1 & x=5
  for (let x = 1; x < W - 1; x += 1) {
    if (x === 3) {
      B(blocks, s++, x, 0, 1, 1, 0, 2.6, 'facade', 'pintu', facadeHp);
      B(blocks, s++, x, 0, 1, 1, 2.6, 0.4, 'facade', 'bata', facadeHp); // ambang
    } else if (x === 1 || x === 5) {
      B(blocks, s++, x, 0, 1, 1, 0, 1, 'facade', 'bata', facadeHp);
      B(blocks, s++, x, 0, 1, 1, 1, 1.5, 'facade', 'kaca', facadeHp);
      B(blocks, s++, x, 0, 1, 1, 2.5, 0.5, 'facade', 'bata', facadeHp);
    } else {
      B(blocks, s++, x, 0, 1, 1, 0, WH, 'facade', 'bata', facadeHp);
    }
  }
  // dinding belakang (z=D-1): jendela x=3
  for (let x = 1; x < W - 1; x += 1) {
    if (x === 3) {
      B(blocks, s++, x, D - 1, 1, 1, 0, 1, 'facade', 'bata', facadeHp);
      B(blocks, s++, x, D - 1, 1, 1, 1, 1.5, 'facade', 'kaca', facadeHp);
      B(blocks, s++, x, D - 1, 1, 1, 2.5, 0.5, 'facade', 'bata', facadeHp);
    } else {
      B(blocks, s++, x, D - 1, 1, 1, 0, WH, 'facade', 'bata', facadeHp);
    }
  }
  // dinding samping (x=0, x=W-1): jendela kecil z=2
  for (const qx of [0, W - 1]) {
    for (let z = 1; z < D - 1; z += 1) {
      if (z === 2) {
        B(blocks, s++, qx, z, 1, 1, 0, 1.2, 'facade', 'bata', facadeHp);
        B(blocks, s++, qx, z, 1, 1, 1.2, 1.1, 'facade', 'kaca', facadeHp);
        B(blocks, s++, qx, z, 1, 1, 2.3, 0.7, 'facade', 'bata', facadeHp);
      } else {
        B(blocks, s++, qx, z, 1, 1, 0, WH, 'facade', 'bata', facadeHp);
      }
    }
  }
  // balok beton di atas dinding depan & belakang (struktur)
  B(blocks, s++, 0, 0, W, 1, WH, 0.5, 'structure', 'beton', 3);
  B(blocks, s++, 0, D - 1, W, 1, WH, 0.5, 'structure', 'beton', 3);
  // atap prism: 2 panel miring (genteng). Selatan: tepi+z naik -> slope negatif.
  const slope = Math.PI / 5.2; // ~34.6 deg
  B(blocks, s++, -0.3, -0.3, W + 0.6, 3.1, WH, 0.22, 'facade', 'genteng', facadeHp,
    { shape: 'panel', slope: -slope });
  B(blocks, s++, -0.3, D - 2.8, W + 0.6, 3.1, WH, 0.22, 'facade', 'genteng', facadeHp,
    { shape: 'panel', slope });
  B(blocks, s++, -0.15, 0, 0.3, D, WH, 1.55, 'facade', 'bata', facadeHp, { shape: 'gable' });
  B(blocks, s++, W - 0.15, 0, 0.3, D, WH, 1.55, 'facade', 'bata', facadeHp, { shape: 'gable' });
  // interior: sekat + perabot
  B(blocks, s++, 4, 1, 0.35, 2, 0.25, 2.4, 'interior', 'plester', 1); // sekat (celah z=3)
  B(blocks, s++, 1.2, 2.2, 1.6, 1, 0.25, 0.75, 'interior', 'kayu', 1); // meja
  B(blocks, s++, 4.8, 3.2, 2, 1.4, 0.25, 0.55, 'interior', 'kayu', 1, { tint: 0xd8b28a }); // dipan
  B(blocks, s++, 5.6, 0.6, 0.9, 0.7, 0.25, 1.9, 'interior', 'kayu', 1); // lemari
  return blocks;
}

/* ----- L2: Ruko 2 lantai (6 x 5) ----- */
function buildRuko(facadeHp: number): Block3D[] {
  const blocks: Block3D[] = [];
  let s = 1000;
  const W = 6; const D = 5; const FH = 3;
  B(blocks, s++, 0, 0, W, D, 0, 0.25, 'interior', 'lantai', 1);
  for (let f = 0; f < 2; f += 1) {
    const y = f * (FH + 0.4) + 0.25;
    // kolom struktur sudut + tengah depan/belakang
    const cols: Array<[number, number]> = [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1], [2, 0], [3, 0]];
    for (const [qx, qz] of cols) {
      if (f === 1 && qx >= 2 && qx <= 3 && qz === 0) continue; // lt2 depan: etalase penuh
      B(blocks, s++, qx, qz, 1, 1, y, FH, 'structure', 'beton', 3);
    }
    if (f === 0) {
      // lantai dasar: etalase kaca depan + pintu
      for (let x = 1; x < W - 1; x += 1) {
        if (x === 2 || x === 3) continue; // kolom
        if (x === 4) {
          B(blocks, s++, x, 0, 1, 1, y, 2.6, 'facade', 'pintu', facadeHp);
          B(blocks, s++, x, 0, 1, 1, 2.6, FH - 2.6, 'facade', 'kaca', facadeHp);
        } else {
          B(blocks, s++, x, 0, 1, 1, y, FH, 'facade', 'kaca', facadeHp);
        }
      }
    } else {
      // lantai 2: bata + jendela depan
      for (let x = 1; x < W - 1; x += 1) {
        if (x === 2 || x === 4) {
          B(blocks, s++, x, 0, 1, 1, y, 1, 'facade', 'bata', facadeHp);
          B(blocks, s++, x, 0, 1, 1, y + 1, 1.4, 'facade', 'kaca', facadeHp);
          B(blocks, s++, x, 0, 1, 1, y + 2.4, FH - 2.4, 'facade', 'bata', facadeHp);
        } else {
          B(blocks, s++, x, 0, 1, 1, y, FH, 'facade', 'bata', facadeHp);
        }
      }
    }
    // dinding samping & belakang bata + jendela
    for (const qx of [0, W - 1]) {
      for (let z = 1; z < D - 1; z += 1) {
        if (z === 2) {
          B(blocks, s++, qx, z, 1, 1, y, 1.1, 'facade', 'bata', facadeHp);
          B(blocks, s++, qx, z, 1, 1, y + 1.1, 1.2, 'facade', 'kaca', facadeHp);
          B(blocks, s++, qx, z, 1, 1, y + 2.3, FH - 2.3, 'facade', 'bata', facadeHp);
        } else {
          B(blocks, s++, qx, z, 1, 1, y, FH, 'facade', 'bata', facadeHp);
        }
      }
    }
    for (let x = 1; x < W - 1; x += 1) {
      B(blocks, s++, x, D - 1, 1, 1, y, FH, 'facade', 'bata', facadeHp);
    }
    // slab lantai atas / dak (struktur)
    B(blocks, s++, 0, 0, W, D, y + FH, 0.4, 'structure', 'beton', 2);
    // interior lantai ini
    B(blocks, s++, 0, 0, W, D, y + FH + 0.4 - 0.25, 0.25, 'interior', 'lantai', 1);
    if (f === 0) {
      B(blocks, s++, 3.8, 1, 0.35, 3, y, 2.4, 'interior', 'plester', 1);
      B(blocks, s++, 1, 2.5, 2.2, 1, y, 0.9, 'interior', 'kayu', 1); // etalase
      B(blocks, s++, 4.5, 3.5, 1.2, 0.8, y, 0.75, 'interior', 'kayu', 1); // meja kasir
    } else {
      B(blocks, s++, 2, 2, 0.35, 2.5, y, 2.4, 'interior', 'plester', 1);
      B(blocks, s++, 0.8, 3.4, 2, 1.3, y, 0.55, 'interior', 'kayu', 1, { tint: 0xd8b28a });
      B(blocks, s++, 4.2, 1, 1.4, 0.9, y, 0.7, 'interior', 'kayu', 1);
    }
  }
  const roofY = 2 * (FH + 0.4) + 0.25;
  // parapet + papan nama + tandon
  for (let x = 0; x < W; x += 1) {
    B(blocks, s++, x, 0, 1, 1, roofY, 0.9, 'facade', 'bata', facadeHp);
    B(blocks, s++, x, D - 1, 1, 1, roofY, 0.9, 'facade', 'bata', facadeHp);
  }
  for (let z = 1; z < D - 1; z += 1) {
    B(blocks, s++, 0, z, 1, 1, roofY, 0.9, 'facade', 'bata', facadeHp);
    B(blocks, s++, W - 1, z, 1, 1, roofY, 0.9, 'facade', 'bata', facadeHp);
  }
  B(blocks, s++, 1, -0.55, 4, 0.3, roofY + 0.4, 1.1, 'facade', 'kayu', facadeHp,
    { anchored: true, tint: 0xffe1a8 }); // papan nama RUKO
  B(blocks, s++, 3.8, 3.2, 1.4, 1.4, roofY, 1.6, 'interior', 'beton', 1, { tint: 0x7fb2e8 }); // tandon
  return blocks;
}

/* ----- L3: Apartemen 4 lantai (8 x 6) ----- */
function buildApartemen(facadeHp: number): Block3D[] {
  const blocks: Block3D[] = [];
  let s = 2000;
  const W = 8; const D = 6; const FH = 2.8;
  B(blocks, s++, 0, 0, W, D, 0, 0.25, 'interior', 'lantai', 1);
  const colX = [0, 3, 7];
  for (let f = 0; f < 4; f += 1) {
    const y = f * (FH + 0.35) + 0.25;
    for (const qx of colX) {
      for (const qz of [0, D - 1]) {
        B(blocks, s++, qx, qz, 1, 1, y, FH, 'structure', 'beton', 3);
      }
    }
    // fasad depan/belakang: kaca + bata selang-seling antar kolom
    for (const qz of [0, D - 1]) {
      for (let x = 1; x < W - 1; x += 1) {
        if (colX.includes(x)) continue;
        if ((x + f) % 2 === 0) {
          B(blocks, s++, x, qz, 1, 1, y, 0.9, 'facade', 'bata', facadeHp);
          B(blocks, s++, x, qz, 1, 1, y + 0.9, 1.3, 'facade', 'kaca', facadeHp);
          B(blocks, s++, x, qz, 1, 1, y + 2.2, FH - 2.2, 'facade', 'bata', facadeHp);
        } else {
          B(blocks, s++, x, qz, 1, 1, y, FH, 'facade', 'bata', facadeHp);
        }
      }
    }
    // samping bata + jendela
    for (const qx of [0, W - 1]) {
      for (let z = 1; z < D - 1; z += 1) {
        if (z % 2 === 0) {
          B(blocks, s++, qx, z, 1, 1, y, 1, 'facade', 'bata', facadeHp);
          B(blocks, s++, qx, z, 1, 1, y + 1, 1.2, 'facade', 'kaca', facadeHp);
          B(blocks, s++, qx, z, 1, 1, y + 2.2, FH - 2.2, 'facade', 'bata', facadeHp);
        } else {
          B(blocks, s++, qx, z, 1, 1, y, FH, 'facade', 'bata', facadeHp);
        }
      }
    }
    // slab struktur
    B(blocks, s++, 0, 0, W, D, y + FH, 0.35, 'structure', 'beton', 2);
    B(blocks, s++, 0, 0, W, D, y + FH + 0.35 - 0.25, 0.25, 'interior', 'lantai', 1);
    // balkon depan (kantilever, anchored ke slab)
    for (const bx of [1, 4]) {
      B(blocks, s++, bx, -1.2, 2, 1.2, y + FH, 0.25, 'facade', 'beton', facadeHp,
        { anchored: true, tint: 0xd8dee6 });
    }
    // interior: sekat + perabot variasi per lantai
    B(blocks, s++, 5, 1, 0.35, 2.5, y, FH - 0.4, 'interior', 'plester', 1);
    B(blocks, s++, 1, 3.8, 2, 1.3, y, 0.55, 'interior', 'kayu', 1, { tint: 0xd8b28a });
    B(blocks, s++, 5.8, 0.6, 1.2, 0.8, y, 0.7, 'interior', 'kayu', 1);
    if (f % 2 === 0) {
      B(blocks, s++, 2.2, 1, 1.4, 0.7, y, 1.7, 'interior', 'kayu', 1); // lemari
    } else {
      B(blocks, s++, 6.2, 3.6, 1, 1, y, 0.45, 'interior', 'kayu', 1); // meja tamu
    }
  }
  const roofY = 4 * (FH + 0.35) + 0.25;
  for (let x = 0; x < W; x += 1) {
    B(blocks, s++, x, 0, 1, 1, roofY, 0.8, 'facade', 'bata', facadeHp);
    B(blocks, s++, x, D - 1, 1, 1, roofY, 0.8, 'facade', 'bata', facadeHp);
  }
  for (let z = 1; z < D - 1; z += 1) {
    B(blocks, s++, 0, z, 1, 1, roofY, 0.8, 'facade', 'bata', facadeHp);
    B(blocks, s++, W - 1, z, 1, 1, roofY, 0.8, 'facade', 'bata', facadeHp);
  }
  B(blocks, s++, 5.5, 4, 1.6, 1.6, roofY, 1.8, 'interior', 'beton', 1, { tint: 0x7fb2e8 });
  B(blocks, s++, 1.5, 1.5, 0.25, 0.25, roofY, 3.2, 'facade', 'beton', facadeHp, { anchored: true }); // antena
  return blocks;
}

/* ----- L4: Tower 6 lantai (7 x 7), core beton + tirai kaca ----- */
function buildTower(facadeHp: number): Block3D[] {
  const blocks: Block3D[] = [];
  let s = 3000;
  const W = 7; const D = 7; const FH = 3;
  B(blocks, s++, 0, 0, W, D, 0, 0.25, 'interior', 'lantai', 1);
  // core beton 3x3 di tengah, full height
  const coreH = 7 * (FH + 0.4);
  B(blocks, s++, 2, 2, 3, 1, 0, coreH, 'structure', 'beton', 3); // dinding core
  B(blocks, s++, 2, 4, 3, 1, 0, coreH, 'structure', 'beton', 3);
  B(blocks, s++, 2, 3, 1, 1, 0, coreH, 'structure', 'beton', 3);
  B(blocks, s++, 4, 3, 1, 1, 0, coreH, 'structure', 'beton', 3);
  const colPos: Array<[number, number]> = [[0, 0], [6, 0], [0, 6], [6, 6], [3, 0], [3, 6], [0, 3], [6, 3]];
  for (let f = 0; f < 7; f += 1) {
    const y = f * (FH + 0.4) + 0.25;
    for (const [qx, qz] of colPos) {
      B(blocks, s++, qx, qz, 1, 1, y, FH, 'structure', 'beton', 3);
    }
    // tirai kaca di semua sisi antar kolom
    for (let x = 1; x < W - 1; x += 1) {
      if (x === 3) continue;
      for (const qz of [0, D - 1]) {
        B(blocks, s++, x, qz, 1, 1, y, FH, 'facade', 'kaca', facadeHp);
      }
    }
    for (let z = 1; z < D - 1; z += 1) {
      if (z === 3) continue;
      for (const qx of [0, W - 1]) {
        B(blocks, s++, qx, z, 1, 1, y, FH, 'facade', 'kaca', facadeHp);
      }
    }
    // slab
    B(blocks, s++, 0, 0, W, D, y + FH, 0.4, 'structure', 'beton', 2);
    B(blocks, s++, 0, 0, W, D, y + FH + 0.4 - 0.25, 0.25, 'interior', 'lantai', 1);
    // interior: sekat + meja kantor
    B(blocks, s++, 1, 2, 0.35, 3, y, FH - 0.5, 'interior', 'plester', 1);
    B(blocks, s++, 4.6, 1.2, 1.6, 0.9, y, 0.75, 'interior', 'kayu', 1);
    B(blocks, s++, 4.6, 4.8, 1.6, 0.9, y, 0.75, 'interior', 'kayu', 1);
  }
  const roofY = 7 * (FH + 0.4) + 0.25;
  for (let x = 0; x < W; x += 1) {
    B(blocks, s++, x, 0, 1, 1, roofY, 1, 'facade', 'beton', facadeHp, { tint: 0xd8dee6 });
    B(blocks, s++, x, D - 1, 1, 1, roofY, 1, 'facade', 'beton', facadeHp, { tint: 0xd8dee6 });
  }
  for (let z = 1; z < D - 1; z += 1) {
    B(blocks, s++, 0, z, 1, 1, roofY, 1, 'facade', 'beton', facadeHp, { tint: 0xd8dee6 });
    B(blocks, s++, W - 1, z, 1, 1, roofY, 1, 'facade', 'beton', facadeHp, { tint: 0xd8dee6 });
  }
  B(blocks, s++, 1, 1, 1.8, 1.8, roofY, 2, 'interior', 'beton', 1, { tint: 0x7fb2e8 });
  B(blocks, s++, 5, 5, 0.3, 0.3, roofY, 4, 'facade', 'beton', facadeHp, { anchored: true });
  return blocks;
}

/** Bangun level ke-idx (0-based). Deterministik. facadeHp = HP blok fasad (playtest: 1 vs 2). */
export function createLevel(idx: number, facadeHp = 1): LevelData {
  const meta = LEVELS[idx] ?? LEVELS[0];
  nextId = 1;
  let blocks: Block3D[];
  switch (idx) {
    case 0: blocks = buildHouse(facadeHp); break;
    case 1: blocks = buildRuko(facadeHp); break;
    case 2: blocks = buildApartemen(facadeHp); break;
    case 3: blocks = buildTower(facadeHp); break;
    default: blocks = buildHouse(facadeHp);
  }
  return { meta, blocks, bounds: boundsOf(blocks) };
}
