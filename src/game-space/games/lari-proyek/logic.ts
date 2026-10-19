/**
 * Lari Proyek 3D — pure endless-runner logic (Subway-Surfers style).
 * NO DOM / window / Math.random / three.js. RNG disuntik (mulberry32)
 * agar test deterministik.
 *
 * Satuan: meter. 3 lajur: LANES = [-2, 0, 2] (sumbu x).
 * Pemain di z = 0 (kamera di belakang, di +z); dunia bergerak +z
 * (rintangan spawn di z = SPAWN_Z negatif, mendekati pemain).
 */

export const LANES = [-2, 0, 2] as const;
export const LANE_COUNT = 3;

export const GRAV = 26;
export const JUMP_V = 8.2;
/** Input buffer lompat: lompatan yang ditekan <= 100ms sebelum mendarat tetap jalan. */
export const JUMP_BUFFER_T = 0.1;
/** Roll (guling) 0.6 dtk — sesuai spek. */
export const ROLL_T = 0.6;
/** Kecepatan lerp pindah lajur (~0.15 dtk terasa responsif). */
export const LANE_DAMP = 14;
/** Slam: tekan roll saat di udara = jatuh cepat + roll saat mendarat. */
export const FAST_FALL_V = 22;

/** Tinggi pemain berdiri / roll (meter). */
export const STAND_H = 1.7;
export const ROLL_H = 0.9;
export const PLAYER_HALF_W = 0.35;
export const PLAYER_HALF_D = 0.3;

/** Jarak spawn & buang rintangan (sumbu z). */
export const SPAWN_Z = -75;
export const DESPAWN_Z = 10;
/** Bata mulai telegraph saat z >= -WARN_AHEAD; bata mendarat tepat di z ~= 0. */
export const WARN_AHEAD = 24;
export const BATA_FALL_T = 0.35;
export const BATA_HOVER_Y = 6;

/** Grace period: JANGAN PERNAH bunuh pemain di 2 detik pertama. */
export const GRACE_T = 2.0;

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

export type ObKind = 'barier' | 'balok' | 'barikade' | 'bata' | 'helm';

export interface Obstacle {
  kind: ObKind;
  /** indeks lajur 0..2 */
  lane: number;
  /** posisi z dunia; bertambah seiring dunia bergerak (+z menuju pemain). */
  z: number;
  w: number; // lebar (x)
  h: number; // tinggi (y)
  d: number; // kedalaman (z)
  /** untuk 'balok': jarak bawah balok dari tanah. untuk 'helm': tengah melayang. */
  yOff: number;
  /** fase khusus 'bata': approach -> warn -> fall -> rubble */
  phase?: 'approach' | 'warn' | 'fall' | 'rubble';
  t?: number;
  /** y bata saat jatuh (BATA_HOVER_Y di langit -> 0 di tanah) */
  brickY?: number;
  dead: boolean;
}

export interface Player {
  /** indeks lajur logika 0..2 */
  lane: number;
  /** posisi x visual (lerp menuju LANES[lane]) */
  laneX: number;
  /** tinggi kaki di atas tanah */
  y: number;
  vy: number;
  grounded: boolean;
  rolling: boolean;
  rollT: number;
  /** roll tertunda (ditekan saat di udara -> jalan saat mendarat) */
  pendingRoll: boolean;
  /** sisa waktu input buffer lompat */
  bufferT: number;
  dead: boolean;
}

export function createPlayer(): Player {
  return {
    lane: 1, laneX: LANES[1],
    y: 0, vy: 0, grounded: true,
    rolling: false, rollT: 0, pendingRoll: false,
    bufferT: 0, dead: false,
  };
}

export function playerHeight(p: Player): number {
  return p.rolling ? ROLL_H : STAND_H;
}

/** Tinggi lompatan maksimum teoritis (vy^2 / 2g). */
export function jumpHeight(): number {
  return (JUMP_V * JUMP_V) / (2 * GRAV);
}

export type PlayerEvent = 'jump' | 'land' | 'roll' | 'lane' | 'slam';

/**
 * Step pemain. left/right/jump/roll adalah edge-trigger (sekali tekan).
 * Kembalikan event untuk sfx/juice.
 */
export function stepPlayer(
  p: Player,
  dt: number,
  input: { left: boolean; right: boolean; jump: boolean; roll: boolean },
): PlayerEvent[] {
  const ev: PlayerEvent[] = [];
  if (p.dead) return ev;

  if (input.left && p.lane > 0) { p.lane -= 1; ev.push('lane'); }
  if (input.right && p.lane < LANE_COUNT - 1) { p.lane += 1; ev.push('lane'); }
  // lerp visual menuju lajur logika (~0.15 dtk, bukan teleport)
  const targetX = LANES[p.lane];
  p.laneX += (targetX - p.laneX) * (1 - Math.exp(-LANE_DAMP * dt));
  if (Math.abs(targetX - p.laneX) < 0.001) p.laneX = targetX;

  if (input.jump) {
    if (p.grounded) {
      p.vy = JUMP_V;
      p.grounded = false;
      p.rolling = false; p.rollT = 0; p.pendingRoll = false;
      p.bufferT = 0;
      ev.push('jump');
    } else {
      p.bufferT = JUMP_BUFFER_T; // buffer 100ms
    }
  }
  if (input.roll) {
    if (p.grounded) {
      p.rolling = true; p.rollT = ROLL_T; p.pendingRoll = false;
      ev.push('roll');
    } else {
      // slam: jatuh cepat, roll otomatis saat mendarat
      p.vy = Math.min(p.vy, -FAST_FALL_V);
      p.pendingRoll = true;
      ev.push('slam');
    }
  }

  if (!p.grounded) {
    p.vy -= GRAV * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0; p.vy = 0; p.grounded = true;
      ev.push('land');
      if (p.bufferT > 0) {
        // buffered jump: langsung lompat lagi
        p.bufferT = 0;
        p.vy = JUMP_V;
        p.grounded = false;
        p.rolling = false; p.rollT = 0; p.pendingRoll = false;
        ev.push('jump');
      } else if (p.pendingRoll) {
        p.pendingRoll = false;
        p.rolling = true; p.rollT = ROLL_T;
        ev.push('roll');
      }
    }
  }
  // buffer lompat kedaluwarsa 100ms setelah ditekan, di udara maupun di tanah
  if (p.bufferT > 0) p.bufferT = Math.max(0, p.bufferT - dt);

  if (p.rolling) {
    p.rollT -= dt;
    if (p.rollT <= 0) { p.rolling = false; p.rollT = 0; }
  }
  return ev;
}

/** Kecepatan lari (m/s) dari jarak tempuh (m): 8 -> 22, kurva adil. */
export function speedFor(distanceM: number): number {
  return Math.min(22, 8 + distanceM * 0.012);
}

/**
 * Gap antar baris rintangan (meter). Menyempit saat cepat, longgar di awal.
 * Dijamin >= 14m (waktu reaksi cukup di kecepatan maks).
 */
export function gapFor(speed: number, distanceM: number, rng: () => number): number {
  const base = Math.max(14, Math.min(30, 34 - speed * 0.9));
  const early = distanceM < 150 ? 12 : 0;
  return base + early + rng() * 8;
}

function shuffledLanes(rng: () => number): number[] {
  const lanes = [0, 1, 2];
  for (let i = lanes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}

const mkBarier = (lane: number): Obstacle =>
  ({ kind: 'barier', lane, z: SPAWN_Z, w: 1.7, h: 0.95, d: 0.5, yOff: 0, dead: false });
const mkBalok = (lane: number): Obstacle =>
  ({ kind: 'balok', lane, z: SPAWN_Z, w: 1.8, h: 0.7, d: 0.5, yOff: 1.05, dead: false });
const mkBarikade = (lane: number): Obstacle =>
  ({ kind: 'barikade', lane, z: SPAWN_Z, w: 1.8, h: 2.4, d: 0.6, yOff: 0, dead: false });
const mkBata = (lane: number): Obstacle =>
  ({ kind: 'bata', lane, z: SPAWN_Z, w: 1.0, h: 0.4, d: 1.0, yOff: 0, phase: 'approach', t: 0, brickY: BATA_HOVER_Y, dead: false });
const mkHelm = (lane: number, z: number): Obstacle =>
  ({ kind: 'helm', lane, z, w: 0.6, h: 0.6, d: 0.6, yOff: 1.1, dead: false });

export interface SpawnCtx {
  rng: () => number;
  distanceM: number;
  /** true bila baris sebelumnya "berat" (>=2 lajur terisi) — paksa baris ringan. */
  lastHard: boolean;
}

/**
 * Spawn SATU BARIS rintangan di z = SPAWN_Z.
 * Jaminan keadilan:
 * - 'barikade' (wajib pindah lajur) maksimal di 2 lajur -> selalu ada lajur lolos.
 * - Setelah baris berat, baris berikutnya ringan (1 rintangan).
 * - Kurva kesulitan: barikade baru muncul > 150m, bata > 300m.
 */
export function spawnRow(ctx: SpawnCtx): { obstacles: Obstacle[]; hard: boolean } {
  const { rng, distanceM, lastHard } = ctx;
  const lanes = shuffledLanes(rng);
  const obs: Obstacle[] = [];
  let hard = false;
  const r = rng();

  const canBarikade = distanceM > 150;
  const canBata = distanceM > 300;

  if (lastHard) {
    // baris ringan: 1 rintangan sederhana
    obs.push(r < 0.5 ? mkBarier(lanes[0]) : mkBalok(lanes[0]));
    return { obstacles: obs, hard: false };
  }

  if (r < 0.26) {
    obs.push(mkBarier(lanes[0]));
    if (rng() < 0.35) obs.push(mkBarier(lanes[1])); // lompat ganda
  } else if (r < 0.44) {
    obs.push(mkBalok(lanes[0]));
    if (rng() < 0.3) obs.push(mkBalok(lanes[1])); // roll ganda
  } else if (r < 0.58 && canBarikade) {
    // barikade di 2 lajur — 1 lajur SELALU lolos
    obs.push(mkBarikade(lanes[0]), mkBarikade(lanes[1]));
    hard = true;
  } else if (r < 0.72) {
    obs.push(mkBarier(lanes[0]));
    obs.push(mkBalok(lanes[1]));
    hard = true;
  } else if (r < 0.84 && canBata) {
    obs.push(mkBata(lanes[0]));
    if (rng() < 0.4) obs.push(mkBarier(lanes[1])); // bata + barier di lajur lain
  } else if (r < 0.92 && canBarikade) {
    obs.push(mkBarikade(lanes[0]));
    obs.push(rng() < 0.5 ? mkBarier(lanes[1]) : mkBalok(lanes[1]));
    hard = true;
  } else {
    obs.push(mkBarier(lanes[0]));
  }
  return { obstacles: obs, hard };
}

/** Baris bonus helm: 3 helm segaris di satu lajur. */
export function spawnHelmRow(rng: () => number): Obstacle[] {
  const lane = Math.floor(rng() * 3);
  return [0, 1, 2].map((i) => mkHelm(lane, SPAWN_Z - i * 2.5));
}

export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

export function playerBox(p: Player): Box {
  const h = playerHeight(p);
  return {
    x0: p.laneX - PLAYER_HALF_W, x1: p.laneX + PLAYER_HALF_W,
    y0: p.y, y1: p.y + h,
    z0: -PLAYER_HALF_D, z1: PLAYER_HALF_D,
  };
}

export function obstacleBox(o: Obstacle): Box | null {
  if (o.kind === 'bata' && o.phase !== 'rubble') return null; // bahaya via landing, bukan AABB
  const cx = LANES[o.lane];
  const yBase = o.kind === 'balok' ? o.yOff : o.kind === 'helm' ? o.yOff - o.h / 2 : 0;
  return {
    x0: cx - o.w / 2, x1: cx + o.w / 2,
    y0: yBase, y1: yBase + o.h,
    z0: o.z - o.d / 2, z1: o.z + o.d / 2,
  };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  // sedikit pemaaf di x (0.06m tiap sisi) agar terasa adil
  const fx = 0.06;
  return a.x0 + fx < b.x1 && a.x1 - fx > b.x0
    && a.y0 < b.y1 && a.y1 > b.y0
    && a.z0 < b.z1 && a.z1 > b.z0;
}

export type HitKind = 'hit' | 'helm' | 'ketiban';
export interface HitResult { kind: HitKind; obstacle: Obstacle }

/**
 * Cek tabrakan pemain vs rintangan.
 * runTime < GRACE_T -> selalu null (JANGAN PERNAH bunuh di 2 detik pertama).
 */
export function checkHits(p: Player, obstacles: Obstacle[], runTime: number): HitResult | null {
  if (p.dead || runTime < GRACE_T) return null;
  const pb = playerBox(p);
  for (const o of obstacles) {
    if (o.dead) continue;
    if (o.kind === 'helm') {
      // magnet ringan: helm di lajur sama & dekat -> ketarik & keambil
      if (o.lane === p.lane && Math.abs(o.z) < 2.6) {
        o.z += (0 - o.z) * 0.35; // ketarik ke pemain
        if (Math.abs(o.z) < 0.9) {
          o.dead = true;
          return { kind: 'helm', obstacle: o };
        }
      }
      continue;
    }
    const b = obstacleBox(o);
    if (b && boxesOverlap(pb, b)) return { kind: 'hit', obstacle: o };
  }
  return null;
}

export interface WorldEvent { kind: 'bataWarn' | 'bataLand'; obstacle: Obstacle }

/**
 * Step dunia: rintangan bergerak +z; fase bata; despawn di belakang.
 * Kembalikan event (untuk sfx/telegraph).
 */
export function stepWorld(
  obstacles: Obstacle[],
  dt: number,
  speed: number,
): WorldEvent[] {
  const ev: WorldEvent[] = [];
  for (const o of obstacles) {
    if (o.dead) continue;
    o.z += speed * dt;
    if (o.kind === 'bata' && o.phase && o.phase !== 'rubble') {
      if (o.phase === 'approach') {
        if (o.z >= -WARN_AHEAD) {
          o.phase = 'warn';
          // bata mendarat tepat saat z ~= 0 -> telegraph adil di semua kecepatan
          o.t = Math.max(0.45, (-o.z) / speed - BATA_FALL_T);
          o.brickY = BATA_HOVER_Y;
          ev.push({ kind: 'bataWarn', obstacle: o });
        }
      } else if (o.phase === 'warn') {
        o.t = (o.t ?? 0) - dt;
        if ((o.t ?? 0) <= 0) { o.phase = 'fall'; o.t = BATA_FALL_T; }
      } else if (o.phase === 'fall') {
        const t = (o.t ?? BATA_FALL_T) - dt;
        o.t = t;
        const k = 1 - Math.max(0, t) / BATA_FALL_T;
        o.brickY = BATA_HOVER_Y * (1 - k * k);
        if (t <= 0) {
          o.phase = 'rubble';
          o.brickY = 0;
          ev.push({ kind: 'bataLand', obstacle: o });
        }
      }
    }
    if (o.z - o.d / 2 > DESPAWN_Z) o.dead = true;
  }
  return ev;
}

/**
 * Saat bata mendarat (event bataLand): pemain ketiban bila di lajur yang sama
 * dan sedang napak (berdiri/roll). Melompat = selamat.
 */
export function checkBataLanding(p: Player, o: Obstacle): boolean {
  return o.kind === 'bata' && p.grounded && !p.dead && o.lane === p.lane;
}

/** Skor: meter + helm*50. */
export function scoreFor(meters: number, helmCount: number): number {
  return meters + helmCount * 50;
}
