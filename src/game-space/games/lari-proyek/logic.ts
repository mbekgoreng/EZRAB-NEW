/**
 * Lari Proyek — pure endless-runner logic (side-scroll).
 * NO DOM / window / Math.random. RNG disuntik (mulberry32) agar test deterministik.
 *
 * Satuan: design px, world 900x700, ground y = 560.
 * Pemain di x tetap (PLAYER_X); dunia (rintangan) bergerak ke kiri.
 */

export const WORLD_W = 900;
export const WORLD_H = 700;
export const GROUND_Y = 560;
export const PLAYER_X = 190;

export const GRAV = 2300;
export const JUMP_V = 830;
export const SLIDE_T = 0.6;

export const STAND_W = 46;
export const STAND_H = 98;
export const SLIDE_W = 66;
export const SLIDE_H = 48;

export const BATA_WARN_T = 0.8;
export const BATA_FALL_T = 0.34;

/** RNG deterministik (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ObKind = 'barier' | 'balok' | 'lubang' | 'bata' | 'helm';

export interface Obstacle {
  kind: ObKind;
  x: number; // kiri (design px), bergerak ke kiri
  w: number;
  h: number;
  /** untuk 'balok': jarak bawah balok dari tanah. untuk 'helm': tinggi melayang. */
  yOff: number;
  /** fase khusus 'bata': approach -> warn -> fall -> rubble */
  phase?: 'approach' | 'warn' | 'fall' | 'rubble';
  t?: number; // timer fase
  lockX?: number; // x target jatuh (bata)
  brickY?: number; // y bata saat jatuh (negatif = di langit)
  dead: boolean;
  scored?: boolean;
}

export interface Player {
  /** tinggi kaki di atas tanah (0 = napak) */
  y: number;
  vy: number;
  grounded: boolean;
  sliding: boolean;
  slideT: number;
  dead: boolean;
}

export function createPlayer(): Player {
  return { y: 0, vy: 0, grounded: true, sliding: false, slideT: 0, dead: false };
}

export function playerRect(p: Player): { x: number; y: number; w: number; h: number } {
  const w = p.sliding ? SLIDE_W : STAND_W;
  const h = p.sliding ? SLIDE_H : STAND_H;
  return { x: PLAYER_X - w / 2, y: GROUND_Y - p.y - h, w, h };
}

/**
 * Step pemain. jump/slide adalah edge-trigger dari tsx (sekali tekan).
 * Kembalikan event untuk sfx.
 */
export function stepPlayer(
  p: Player,
  dt: number,
  jump: boolean,
  slide: boolean,
): string[] {
  const ev: string[] = [];
  if (jump && p.grounded && !p.dead) {
    p.vy = -JUMP_V;
    p.grounded = false;
    p.sliding = false;
    p.slideT = 0;
    ev.push('jump');
  }
  if (slide && p.grounded && !p.dead) {
    p.sliding = true;
    p.slideT = SLIDE_T;
    ev.push('slide');
  }
  if (!p.grounded) {
    p.vy += GRAV * dt;
    p.y += -p.vy * dt;
    if (p.y <= 0) {
      p.y = 0; p.vy = 0; p.grounded = true;
      ev.push('land');
    }
  }
  if (p.sliding) {
    p.slideT -= dt;
    if (p.slideT <= 0) { p.sliding = false; p.slideT = 0; }
  }
  return ev;
}

/** Tinggi lompatan maksimum teoritis (vy^2 / 2g). */
export function jumpHeight(): number {
  return (JUMP_V * JUMP_V) / (2 * GRAV);
}

/** Kecepatan dunia (px/s) dari jarak tempuh (px). */
export function speedFor(distancePx: number): number {
  return Math.min(700, 260 + distancePx * 0.004);
}

/** Gap antar rintangan (px dunia) — menyempit saat cepat. */
export function gapFor(speed: number, rng: () => number): number {
  const base = Math.max(380, Math.min(800, 1100 - speed * 0.8));
  return base + rng() * 180;
}

/**
 * Spawn satu rintangan di x = spawnX. Pemilihan jenis via rng.
 * 'bata' kadang mengunci di dekat pemain (harus lompat saat jatuh),
 * kadang di depan (aman, jadi puing yang harus dilompati).
 */
export function spawnObstacle(rng: () => number, speed: number, spawnX: number): Obstacle {
  const r = rng();
  if (r < 0.30) {
    return { kind: 'barier', x: spawnX, w: 34, h: 66, yOff: 0, dead: false };
  }
  if (r < 0.55) {
    // balok gantung: bawah balok 78px dari tanah
    return { kind: 'balok', x: spawnX, w: 64, h: 34, yOff: 78, dead: false };
  }
  if (r < 0.75) {
    return { kind: 'lubang', x: spawnX, w: 70 + rng() * 35, h: 0, yOff: 0, dead: false };
  }
  if (r < 0.90) {
    const danger = rng() < 0.55;
    const lockX = danger
      ? PLAYER_X + (rng() * 30 - 15) // tepat di atas pemain: harus lompat saat bata jatuh
      : PLAYER_X + 120 + rng() * 110; // mendarat di depan: jadi puing, lompat seperti biasa
    return {
      kind: 'bata', x: spawnX, w: 56, h: 40, yOff: 0,
      phase: 'approach', t: 0, lockX, brickY: -170, dead: false,
    };
  }
  // helm proyek: melayang, diambil = +50
  return { kind: 'helm', x: spawnX, w: 36, h: 30, yOff: 60 + rng() * 70, dead: false };
}

/** Rect rintangan untuk AABB (bata rubble & helm ikut; lubang ditangani khusus). */
export function obstacleRect(o: Obstacle): { x: number; y: number; w: number; h: number } | null {
  if (o.kind === 'lubang') return null;
  if (o.kind === 'bata') {
    if (o.phase === 'rubble') {
      return { x: o.x, y: GROUND_Y - 30, w: o.w, h: 30 };
    }
    return null; // warn/fall: hit hanya saat mendarat (checkBataLanding)
  }
  if (o.kind === 'helm') {
    return { x: o.x, y: GROUND_Y - o.yOff - o.h, w: o.w, h: o.h };
  }
  if (o.kind === 'balok') {
    return { x: o.x, y: GROUND_Y - o.yOff - o.h, w: o.w, h: o.h };
  }
  return { x: o.x, y: GROUND_Y - o.h, w: o.w, h: o.h }; // barier
}

export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface HitResult {
  kind: 'hit' | 'helm' | 'ketiban';
  obstacle: Obstacle;
}

/**
 * Cek tabrakan pemain vs rintangan.
 * - 'helm': overlap -> collected (dead=true), bukan game over.
 * - 'lubang': pemain napak & kaki di atas lubang -> jatuh (hit).
 * - 'bata' rubble: overlap -> hit.
 */
export function checkHits(p: Player, obstacles: Obstacle[]): HitResult | null {
  const pr = playerRect(p);
  const pcx = PLAYER_X;
  for (const o of obstacles) {
    if (o.dead) continue;
    if (o.kind === 'helm') {
      const r = obstacleRect(o)!;
      if (rectsOverlap(pr, r)) {
        o.dead = true;
        return { kind: 'helm', obstacle: o };
      }
      continue;
    }
    if (o.kind === 'lubang') {
      if (p.grounded && pcx > o.x + 8 && pcx < o.x + o.w - 8) {
        return { kind: 'hit', obstacle: o };
      }
      continue;
    }
    const r = obstacleRect(o);
    if (r && rectsOverlap(pr, r)) {
      return { kind: 'hit', obstacle: o };
    }
  }
  return null;
}

/**
 * Step rintangan: gerak ke kiri; logika fase bata.
 * Kembalikan event: 'bataLand' bila bata mendarat (untuk cek ketiban & sfx).
 */
export function stepObstacles(
  obstacles: Obstacle[],
  dt: number,
  speed: number,
  worldW: number,
): { kind: 'bataLand'; obstacle: Obstacle }[] {
  const ev: { kind: 'bataLand'; obstacle: Obstacle }[] = [];
  for (const o of obstacles) {
    if (o.dead) continue;
    if (o.kind === 'bata' && o.phase) {
      const lockX = o.lockX ?? o.x;
      if (o.phase === 'approach') {
        o.x -= speed * dt;
        if (o.x <= lockX + speed * 0.02) {
          o.x = lockX;
          o.phase = 'warn';
          o.t = BATA_WARN_T;
        }
      } else if (o.phase === 'warn') {
        o.t = (o.t ?? 0) - dt;
        if ((o.t ?? 0) <= 0) {
          o.phase = 'fall';
          o.t = BATA_FALL_T;
        }
      } else if (o.phase === 'fall') {
        const t = (o.t ?? BATA_FALL_T) - dt;
        o.t = t;
        const k = 1 - Math.max(0, t) / BATA_FALL_T; // 0 -> 1
        o.brickY = -170 + 170 * k * k;
        if (t <= 0) {
          o.phase = 'rubble';
          o.x = lockX;
          ev.push({ kind: 'bataLand', obstacle: o });
        }
      } else {
        // rubble ikut arus dunia
        o.x -= speed * dt;
      }
    } else {
      o.x -= speed * dt;
    }
    if (o.x + o.w < -80) o.dead = true;
  }
  return ev;
}

/**
 * Saat bata mendarat: pemain ketiban bila kakinya di zona jatuh & sedang napak.
 * Zona = [lockX - 14, lockX + w + 14].
 */
export function checkBataLanding(p: Player, o: Obstacle): boolean {
  if (o.kind !== 'bata') return false;
  const zx0 = (o.lockX ?? o.x) - 14;
  const zx1 = (o.lockX ?? o.x) + o.w + 14;
  return p.grounded && PLAYER_X > zx0 && PLAYER_X < zx1;
}

/** Fase langit 0=siang, 1=senja, 2=malam — siklus tiap 1200 m. */
export function skyPhase(meters: number): number {
  return (meters / 400) % 3;
}

/** Skor: meter + helm*50. */
export function scoreFor(meters: number, helmCount: number): number {
  return meters + helmCount * 50;
}
