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
    rngState: seed >>> 0, viewH,
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
}

/** Satu langkah fisika. Murni kecuali memakai w.rngState internal. */
export function stepWorld(w: World, dt: number, input: Input): StepEvents {
  const ev: StepEvents = { bounced: null, broke: null, super: false };
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

  // isi platform di atas
  topUp(w, rng);
  w.rngState = (w.rngState + 1) >>> 0;

  if (w.py < w.cameraY - 120) w.over = true;
  return ev;
}

/** Tinggi lompatan maksimum (untuk validasi jarak platform). */
export const maxJumpHeight = (): number => (BOUNCE_V * BOUNCE_V) / (2 * GRAVITY);
