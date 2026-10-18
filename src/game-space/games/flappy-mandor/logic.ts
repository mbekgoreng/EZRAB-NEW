/**
 * Flappy Mandor — pure game logic (tanpa DOM/window).
 *
 * Mandor berhelm terbang melewati celah antara crane (atas) dan
 * tumpukan balok (bawah). Fisika, tabrakan, dan kesulitan murni di sini.
 */

/* ---------------- constants ---------------- */

export const GRAVITY = 1500; // px/s^2
export const FLAP_V = 430; // kecepatan ke atas saat tap
export const BIRD_R = 14;
export const GATE_W = 64;
export const GATE_SPACING = 260;

/* ---------------- seeded rng ---------------- */

/** mulberry32 — RNG deterministik untuk test & generate gate. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- difficulty ---------------- */

export interface Difficulty {
  gapH: number;
  speed: number;
}

/** Celah menyempit & kecepatan naik seiring gate terlewati. */
export function difficulty(passed: number): Difficulty {
  return {
    gapH: Math.max(150, 210 - passed * 2),
    speed: 180 + passed * 3,
  };
}

/* ---------------- entities ---------------- */

export interface Bird {
  x: number;
  y: number;
  vy: number;
  r: number;
  rot: number; // radian, untuk render
}

export interface Gate {
  x: number;
  gapY: number; // tengah celah
  gapH: number;
  w: number;
  passed: boolean;
}

export interface FlapState {
  bird: Bird;
  gates: Gate[];
  passed: number;
  alive: boolean;
  t: number;
  W: number;
  H: number;
  groundY: number;
}

export function createBird(x: number, y: number): Bird {
  return { x, y, vy: 0, r: BIRD_R, rot: 0 };
}

/** Tap/spasi: ke atas! */
export function flap(b: Bird): void {
  b.vy = -FLAP_V;
}

/** Gravitasi + rotasi mengikuti vy. */
export function stepBird(b: Bird, dt: number): void {
  b.vy += GRAVITY * dt;
  b.y += b.vy * dt;
  const target = b.vy < 0 ? -0.35 : Math.min(1.2, b.vy / 700);
  b.rot += (target - b.rot) * Math.min(1, dt * 10);
}

/** Tabrakan lingkaran vs kotak. */
export function circleVsRect(
  cx: number, cy: number, r: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export type DeathCause = 'gate' | 'ground' | null;

/**
 * Buat gate baru di kanan layar. gapY acak dalam batas aman.
 * rng boleh di-inject (test) atau Math.random (game).
 */
export function createGate(
  rng: () => number,
  x: number,
  gapH: number,
  H: number,
  groundY: number,
): Gate {
  const margin = 70;
  const lo = margin + gapH / 2;
  const hi = groundY - margin - gapH / 2;
  const gapY = lo + rng() * Math.max(1, hi - lo);
  void H;
  return { x, gapY, gapH, w: GATE_W, passed: false };
}

export function createState(seed: number, W: number, H: number): FlapState {
  const rng = mulberry32(seed);
  const groundY = H - 64;
  const d = difficulty(0);
  const gates: Gate[] = [];
  let x = W + 120;
  for (let i = 0; i < 3; i += 1) {
    gates.push(createGate(rng, x, d.gapH, H, groundY));
    x += GATE_SPACING;
  }
  return {
    bird: createBird(W * 0.32, H * 0.42),
    gates,
    passed: 0,
    alive: true,
    t: 0,
    W, H, groundY,
  };
}

export interface StepResult {
  scored: boolean;
  died: DeathCause;
}

/**
 * Majukan satu frame. Menggerakkan gate, cek skor & tabrakan.
 * rng dipakai untuk gate baru (inject di test).
 */
export function updateState(s: FlapState, dt: number, rng: () => number): StepResult {
  const res: StepResult = { scored: false, died: null };
  if (!s.alive) return res;
  s.t += dt;

  stepBird(s.bird, dt);
  const d = difficulty(s.passed);

  for (const g of s.gates) g.x -= d.speed * dt;

  // buang yang lewat kiri, tambah di kanan
  while (s.gates.length > 0 && s.gates[0].x + s.gates[0].w < -20) {
    s.gates.shift();
  }
  const last = s.gates[s.gates.length - 1];
  if (!last || last.x < s.W - GATE_SPACING) {
    s.gates.push(createGate(rng, (last ? last.x : s.W) + GATE_SPACING, d.gapH, s.H, s.groundY));
  }

  const b = s.bird;

  // langit-langit: mentok, tidak mati
  if (b.y - b.r < 0) {
    b.y = b.r;
    b.vy = Math.max(b.vy, 0);
  }
  // tanah: mati
  if (b.y + b.r >= s.groundY) {
    b.y = s.groundY - b.r;
    s.alive = false;
    res.died = 'ground';
    return res;
  }

  for (const g of s.gates) {
    if (!g.passed && g.x + g.w < b.x - b.r) {
      g.passed = true;
      s.passed += 1;
      res.scored = true;
    }
    if (g.x - b.r < b.x && b.x < g.x + g.w + b.r) {
      const topH = g.gapY - g.gapH / 2;
      const botY = g.gapY + g.gapH / 2;
      const hitTop = circleVsRect(b.x, b.y, b.r, g.x, -40, g.w, topH + 40);
      const hitBot = circleVsRect(b.x, b.y, b.r, g.x, botY, g.w, s.groundY - botY);
      if (hitTop || hitBot) {
        s.alive = false;
        res.died = 'gate';
        return res;
      }
    }
  }
  return res;
}

/* ---------------- medals ---------------- */

export type Medal = 'perunggu' | 'perak' | 'emas' | 'platinum' | null;

export function medalFor(score: number): Medal {
  if (score >= 40) return 'platinum';
  if (score >= 30) return 'emas';
  if (score >= 20) return 'perak';
  if (score >= 10) return 'perunggu';
  return null;
}

export const MEDAL_LABEL: Record<Exclude<Medal, null>, string> = {
  perunggu: '🥉 Perunggu',
  perak: '🥈 Perak',
  emas: '🥇 Emas',
  platinum: '💠 Platinum',
};
