/**
 * ArcadeFlappyBird — "Mandor Terbang: Hindari Crane".
 * Mandor berhelm terbang menembus celah tower crane saat senja.
 * Pure logic: fisika, spawn gate, tabrakan, skor, grace-period adil.
 *
 * Fairness (wajib):
 *  - fase 'ready': burung hover, gate diam. Tap PERTAMA = flap + mulai run.
 *  - grace 1 detik setelah run dimulai: tabrakan gate nonaktif.
 *  - buffer input 100ms: tap sedikit lebih awal tetap dihitung.
 */

export const GRAVITY = 1500; // px/s^2
export const FLAP_V = -445; // px/s
export const BIRD_R = 13;
export const GATE_W = 66;
export const GATE_SPACING = 252; // jarak antar gate (px)
export const GRACE_T = 1.0; // detik kebal setelah mulai
export const FLAP_BUFFER_S = 0.1;

export type Phase = 'ready' | 'play' | 'dead';
export type DeathCause = 'gate' | 'ground' | null;

export interface Bird {
  x: number;
  y: number;
  vy: number;
  rot: number;
}

export interface Gate {
  x: number;
  w: number;
  gapY: number; // pusat celah
  gapH: number; // tinggi celah
  passed: boolean;
}

export interface FlapState {
  W: number;
  H: number;
  groundY: number;
  bird: Bird;
  gates: Gate[];
  t: number; // waktu sejak run dimulai (detik)
  phase: Phase;
  alive: boolean;
  passed: number; // gate terlewati
  speed: number; // px/s, naik seiring skor
  seed: number;
}

export interface StepResult {
  scored: boolean;
  died: DeathCause;
}

export function createState(seed: number, W: number, H: number): FlapState {
  return {
    W,
    H,
    groundY: H - 64,
    bird: { x: W * 0.32, y: H * 0.42, vy: 0, rot: 0 },
    gates: [],
    t: 0,
    phase: 'ready',
    alive: true,
    passed: 0,
    speed: 175,
    seed,
  };
}

/** Tap pertama: mulai run SEKALIGUS flap. */
export function startRun(st: FlapState): void {
  st.phase = 'play';
  st.t = 0;
  st.alive = true;
}

export function flap(b: Bird): void {
  b.vy = FLAP_V;
}

/** Bobbing saat ready (jam ambient, gate diam). */
export function updateReady(st: FlapState, dt: number): void {
  st.t += dt;
}

export function readyBobOffset(st: FlapState): number {
  return Math.sin(st.t * 4) * 8;
}

/** true selama 1 detik pertama run — tabrakan gate nonaktif. */
export function inGrace(st: FlapState): boolean {
  return st.phase === 'play' && st.alive && st.t < GRACE_T;
}

/** Celah menyempit perlahan: 152 → 118. */
export function gapHeightFor(passed: number): number {
  return Math.max(118, 152 - passed * 1.2);
}

/** Kecepatan dunia naik: 175 → 300. */
export function speedFor(passed: number): number {
  return Math.min(300, 175 + passed * 4);
}

export function spawnGate(st: FlapState, rng: () => number, atX: number): Gate {
  const gapH = gapHeightFor(st.passed);
  const margin = 110;
  const lo = margin + gapH / 2;
  const hi = st.groundY - margin - gapH / 2;
  const gapY = lo + rng() * Math.max(1, hi - lo);
  const g: Gate = { x: atX, w: GATE_W, gapY, gapH, passed: false };
  st.gates.push(g);
  return g;
}

function circleHitsRect(
  cx: number, cy: number, r: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export function updateState(st: FlapState, dt: number, rng: () => number): StepResult {
  const res: StepResult = { scored: false, died: null };
  if (st.phase !== 'play' || !st.alive) return res;

  st.t += dt;
  st.speed = speedFor(st.passed);
  const b = st.bird;

  // fisika
  b.vy += GRAVITY * dt;
  b.y += b.vy * dt;
  b.rot = Math.max(-0.45, Math.min(1.25, b.vy / 850));

  // langit-langit: mentok, tidak mati
  if (b.y < BIRD_R) {
    b.y = BIRD_R;
    b.vy = Math.max(0, b.vy);
  }

  // geser gate
  for (const g of st.gates) g.x -= st.speed * dt;

  // spawn: jaga jarak antar gate
  const last = st.gates[st.gates.length - 1];
  if (!last || last.x < st.W - GATE_SPACING + GATE_W) {
    const atX = last ? last.x + GATE_SPACING : st.W + 60;
    spawnGate(st, rng, atX);
  }
  // buang yang lewat
  while (st.gates.length > 0 && st.gates[0].x + st.gates[0].w < -80) {
    st.gates.shift();
  }

  // skor: gate terlewati
  for (const g of st.gates) {
    if (!g.passed && g.x + g.w < b.x - BIRD_R) {
      g.passed = true;
      st.passed += 1;
      res.scored = true;
    }
  }

  // jatuh ke tanah
  if (b.y + BIRD_R >= st.groundY) {
    b.y = st.groundY - BIRD_R;
    st.alive = false;
    st.phase = 'dead';
    res.died = 'ground';
    return res;
  }

  // tabrakan gate (nonaktif selama grace)
  if (!inGrace(st)) {
    for (const g of st.gates) {
      const gapTop = g.gapY - g.gapH / 2;
      const gapBot = g.gapY + g.gapH / 2;
      const hitTop = circleHitsRect(b.x, b.y, BIRD_R - 2, g.x, -40, g.w, gapTop + 40);
      const hitBot = circleHitsRect(
        b.x, b.y, BIRD_R - 2, g.x, gapBot, g.w, st.groundY - gapBot,
      );
      if (hitTop || hitBot) {
        st.alive = false;
        st.phase = 'dead';
        res.died = 'gate';
        return res;
      }
    }
  }

  return res;
}

/** Medali progres: humor ala estimator. */
export type Medal = 'C' | 'B' | 'A' | 'S' | null;
export function medalFor(passed: number): Medal {
  if (passed >= 30) return 'S';
  if (passed >= 20) return 'A';
  if (passed >= 12) return 'B';
  if (passed >= 6) return 'C';
  return null;
}
export const MEDAL_LABEL: Record<Exclude<Medal, null>, string> = {
  C: '🥉 MANDOR MAGANG',
  B: '🥈 MANDOR SENIOR',
  A: '🥇 KEPALA PROYEK',
  S: '🏆 DIREKTUR UTAMA',
};
