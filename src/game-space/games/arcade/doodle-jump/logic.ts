/**
 * Lompat Scaffolding — logika murni (tanpa DOM).
 *
 * Tukang melompat ke atas dari perancah ke perancah. Koordinat y membesar
 * ke atas. Jenis perancah: kayu (normal), gerobak (bergerak horizontal),
 * lapuk (patah sekali injak), dongkrak (lantingan super).
 */

export const WORLD_W = 400;
export const GRAVITY = 1500;
export const BOUNCE_V = 680;
export const SUPER_V = 1050;
export const MOVE_SPEED = 340;
export const PLAYER_W = 44;
export const PLAYER_H = 56;

export type PlatformKind = 'kayu' | 'gerobak' | 'lapuk' | 'dongkrak';

export interface Platform {
  x: number; // kiri
  y: number; // atas platform
  w: number;
  kind: PlatformKind;
  vx: number; // gerobak
  broken: boolean;
  id: number;
}

export interface Input {
  left: boolean;
  right: boolean;
}

export interface World {
  px: number; // pusat pemain
  py: number; // kaki pemain
  vx: number;
  vy: number;
  platforms: Platform[];
  cameraY: number; // y dunia di tengah-bawah kamera (pemain mati jika py < cameraY - 80)
  maxY: number;
  score: number;
  over: boolean;
  bounces: number;
  nextId: number;
  rngState: number;
  viewH: number;
  /** zona ketinggian saat ini (indeks ZONES) — naik memicu event zoneUp */
  zone: number;
}

/* ================= zona ketinggian (Gelombang 3) =================
   Skor game ini SUDAH dalam "meter" (score = (maxY-60)/10). Zona membuat
   progresi ketinggian terukur & bernama: HUD menampilkan meter, nama zona,
   dan sisa meter ke zona berikutnya; langit renderer mengikuti zona yang
   sama (satu sumber kebenaran, bukan ambang terpisah di komponen). */

export interface Zone {
  name: string;
  /** meter awal zona ini */
  at: number;
  /** [langit atas, langit bawah] untuk renderer */
  sky: [string, string];
  night: boolean;
}

export const ZONES: readonly Zone[] = [
  { name: 'Fondasi', at: 0, sky: ['#f59e0b', '#fbbf24'], night: false },
  { name: 'Kolom', at: 150, sky: ['#38bdf8', '#7dd3fc'], night: false },
  { name: 'Balok', at: 400, sky: ['#c2410c', '#fb923c'], night: false },
  { name: 'Atap', at: 800, sky: ['#0b0f2a', '#1e1b4b'], night: true },
];

export interface ZoneProgress {
  index: number;
  zone: Zone;
  /** zona berikutnya; null di zona teratas */
  next: Zone | null;
  /** sisa meter menuju zona berikutnya (0 bila null) */
  toNext: number;
  /** kemajuan 0..1 di dalam zona ini */
  progress: number;
}

export function zoneFor(meters: number): ZoneProgress {
  const m = Math.max(0, meters);
  let index = 0;
  for (let i = 0; i < ZONES.length; i += 1) if (m >= ZONES[i].at) index = i;
  const zone = ZONES[index];
  const next = index + 1 < ZONES.length ? ZONES[index + 1] : null;
  if (!next) return { index, zone, next: null, toNext: 0, progress: 1 };
  const span = Math.max(1, next.at - zone.at);
  return {
    index, zone, next,
    toNext: Math.max(0, Math.ceil(next.at - m)),
    progress: Math.min(1, Math.max(0, (m - zone.at) / span)),
  };
}

/* ================= gaya visual platform (Gelombang 3) =================
   Deskriptor murni per jenis platform: renderer menggambar berdasarkan
   deskriptor ini agar papan kokoh vs rapuh terbaca beda TANPA emoji —
   kayu = papan hangat berserat, gerobak = pelat baja beroda,
   lapuk = kusam retak miring, dongkrak = baja merah + pegas. */

export type PlatformMarking = 'serat-kayu' | 'roda-baja' | 'retak' | 'pegas';

export interface PlatformStyle {
  /** warna papan [atas, bawah] */
  fill: [string, string];
  /** warna tepi bawah / rangka */
  edge: string;
  marking: PlatformMarking;
  /** papan rapuh digambar sedikit miring (derajat, deterministik per id) */
  tiltDeg: number;
  /** pantulan saat diinjak: normal / super / patah-setelah-injak */
  bounce: 'normal' | 'super' | 'patah';
}

export function platformStyleFor(p: Platform): PlatformStyle {
  switch (p.kind) {
    case 'gerobak':
      return { fill: ['#94a3b8', '#475569'], edge: '#1f2937', marking: 'roda-baja', tiltDeg: 0, bounce: 'normal' };
    case 'lapuk':
      return {
        fill: ['#8a7a66', '#453b31'], edge: '#292019', marking: 'retak',
        tiltDeg: p.id % 2 === 0 ? -2.2 : 2.2, bounce: 'patah',
      };
    case 'dongkrak':
      return { fill: ['#f87171', '#991b1b'], edge: '#7f1d1d', marking: 'pegas', tiltDeg: 0, bounce: 'super' };
    case 'kayu':
    default:
      return { fill: ['#e0aa63', '#8a5a24'], edge: '#6b4420', marking: 'serat-kayu', tiltDeg: 0, bounce: 'normal' };
  }
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickKind(rng: () => number, height: number): PlatformKind {
  const r = rng();
  // makin tinggi makin menantang
  const lapukP = height > 1500 ? 0.16 : 0.08;
  const gerobakP = 0.14;
  const dongkrakP = 0.08;
  if (r < dongkrakP) return 'dongkrak';
  if (r < dongkrakP + gerobakP) return 'gerobak';
  if (r < dongkrakP + gerobakP + lapukP) return 'lapuk';
  return 'kayu';
}

function makePlatform(w: World, rng: () => number, y: number): Platform {
  const kind = pickKind(rng, y);
  const ww = kind === 'dongkrak' ? 64 : 70 + rng() * 40;
  return {
    x: rng() * (WORLD_W - ww),
    y,
    w: ww,
    kind,
    vx: kind === 'gerobak' ? (rng() < 0.5 ? -1 : 1) * (70 + rng() * 90) : 0,
    broken: false,
    id: w.nextId++,
  };
}

export function createWorld(seed: number, viewH = 700): World {
  const w: World = {
    px: WORLD_W / 2, py: 60, vx: 0, vy: BOUNCE_V,
    platforms: [], cameraY: 0, maxY: 60, score: 0,
    over: false, bounces: 0, nextId: 1,
    rngState: seed >>> 0, viewH, zone: 0,
  };
  const rng = mulberry(seed);
  // platform awal di bawah pemain
  w.platforms.push({ x: WORLD_W / 2 - 55, y: 40, w: 110, kind: 'kayu', vx: 0, broken: false, id: w.nextId++ });
  let y = 130;
  while (y < viewH + 400) {
    w.platforms.push(makePlatform(w, rng, y));
    y += 70 + rng() * 48;
  }
  return w;
}

/** Pastikan selalu ada platform di atas kamera. */
function topUp(w: World, rng: () => number): void {
  let top = -Infinity;
  for (const p of w.platforms) top = Math.max(top, p.y);
  let y = top + 70 + rng() * 48;
  const need = w.cameraY + w.viewH + 300;
  while (y < need) {
    w.platforms.push(makePlatform(w, rng, y));
    y += 70 + rng() * 48;
  }
  // buang yang jauh di bawah
  w.platforms = w.platforms.filter((p) => p.y > w.cameraY - 200);
}

export interface StepEvents {
  bounced: Platform | null;
  broke: Platform | null;
  super: boolean;
  /** zona ketinggian BARU yang baru saja dimasuki langkah ini (null bila tetap) */
  zoneUp: Zone | null;
}

/** Satu langkah fisika. Murni kecuali memakai w.rngState internal. */
export function stepWorld(w: World, dt: number, input: Input): StepEvents {
  const ev: StepEvents = { bounced: null, broke: null, super: false, zoneUp: null };
  if (w.over) return ev;
  // rng deterministik per langkah (derivasi dari rngState, lalu increment)
  let ra = (w.rngState + 0x9e3779b9) >>> 0;
  const rng = (): number => {
    ra |= 0;
    ra = (ra + 0x6d2b79f5) | 0;
    let t = Math.imul(ra ^ (ra >>> 15), 1 | ra);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const prevPy = w.py;
  // gerak horizontal (tembus dinding kiri-kanan)
  const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  w.vx = ax * MOVE_SPEED;
  w.px += w.vx * dt;
  if (w.px < -PLAYER_W / 2) w.px = WORLD_W + PLAYER_W / 2;
  if (w.px > WORLD_W + PLAYER_W / 2) w.px = -PLAYER_W / 2;

  // gravitasi
  w.vy -= GRAVITY * dt;
  w.py += w.vy * dt;

  // platform bergerak
  for (const p of w.platforms) {
    if (p.kind === 'gerobak' && !p.broken) {
      p.x += p.vx * dt;
      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
      if (p.x + p.w > WORLD_W) { p.x = WORLD_W - p.w; p.vx = -Math.abs(p.vx); }
    }
  }

  // pendaratan: hanya saat jatuh & kaki melewati permukaan platform
  if (w.vy <= 0) {
    for (const p of w.platforms) {
      if (p.broken) continue;
      const withinX = w.px + PLAYER_W / 2 > p.x + 6 && w.px - PLAYER_W / 2 < p.x + p.w - 6;
      if (withinX && prevPy >= p.y && w.py <= p.y) {
        w.py = p.y;
        if (p.kind === 'lapuk') {
          p.broken = true;
          ev.broke = p;
        }
        if (p.kind === 'dongkrak') {
          w.vy = SUPER_V;
          ev.super = true;
        } else {
          w.vy = BOUNCE_V;
        }
        w.bounces += 1;
        ev.bounced = p;
        break;
      }
    }
  }

  // kamera mengikuti
  const targetCam = w.py - w.viewH * 0.55;
  if (targetCam > w.cameraY) w.cameraY = targetCam;
  if (w.py > w.maxY) {
    w.maxY = w.py;
    w.score = Math.max(0, Math.floor((w.maxY - 60) / 10));
  }
  // progresi zona ketinggian: skor (meter) menentukan zona; naik zona = event
  const zp = zoneFor(w.score);
  if (zp.index > w.zone) {
    w.zone = zp.index;
    ev.zoneUp = zp.zone;
  }

  // isi platform di atas
  topUp(w, rng);
  w.rngState = (w.rngState + 1) >>> 0;

  if (w.py < w.cameraY - 120) w.over = true;
  return ev;
}

/** Tinggi lompatan maksimum (untuk validasi jarak platform). */
export const maxJumpHeight = (): number => (BOUNCE_V * BOUNCE_V) / (2 * GRAVITY);
