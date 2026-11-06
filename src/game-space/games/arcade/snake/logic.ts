/**
 * ArcadeSnake ("Ular Kabel") — pure logic.
 * Ular kabel listrik merayap di area proyek — makan konektor 🔌
 * untuk memanjang! Jangan menabrak pagar proyek atau kabel sendiri.
 * Konektor emas = bonus ganda, muncul sebentar saja.
 */

export const COLS = 20;
export const ROWS = 20;

export interface Vec { x: number; y: number; }

export type DirName = 'up' | 'down' | 'left' | 'right';

export const DIRS: Record<DirName, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface SnakeState {
  snake: Vec[]; // kepala di indeks 0
  dir: Vec;
  pendingDir: Vec | null;
  food: Vec;
  gold: Vec | null; // konektor emas bonus
  goldT: number; // sisa waktu emas (detik)
  score: number;
  eaten: number;
  dead: boolean;
  grew: boolean;
}

export function opposite(a: Vec, b: Vec): boolean {
  return a.x === -b.x && a.y === -b.y;
}

/** Sel acak yang tidak ditempati ular. */
export function freeCell(snake: ReadonlyArray<Vec>, rng: () => number): Vec {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
  const free: Vec[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  return free[Math.floor(rng() * free.length)] ?? { x: 0, y: 0 };
}

export function createGame(rng: () => number): SnakeState {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  const snake: Vec[] = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  const st: SnakeState = {
    snake,
    dir: { ...DIRS.right },
    pendingDir: null,
    food: { x: 0, y: 0 },
    gold: null,
    goldT: 0,
    score: 0,
    eaten: 0,
    dead: false,
    grew: false,
  };
  st.food = freeCell(snake, rng);
  return st;
}

/** Belok (abaikan bila balik 180°). */
export function turn(st: SnakeState, dir: Vec): void {
  const cur = st.pendingDir ?? st.dir;
  if (!opposite(cur, dir)) st.pendingDir = { ...dir };
}

/** Kecepatan langkah (detik): 0.16s → 0.08s seiring makan. */
export function stepInterval(eaten: number): number {
  return Math.max(0.08, 0.16 - eaten * 0.004);
}

/* ---------- Progresi level eksplisit (Gelombang 5) ----------
 * Level naik tiap CONNECTORS_PER_LEVEL konektor yang dimakan.
 * Kecepatan tick adalah fungsi murni DARI LEVEL (bukan kontinu per
 * konektor) supaya HUD bisa menampilkan level + sisa ke level berikut
 * dan pemain merasakan "gigi" kecepatan yang jelas tiap naik level.
 * stepInterval lama dipertahankan apa adanya untuk kompatibilitas;
 * loop game kini memakai tickMsFor(levelFor(eaten)).
 */
export const CONNECTORS_PER_LEVEL = 5;
export const BASE_TICK_MS = 160;
export const MIN_TICK_MS = 80;
export const TICK_STEP_MS = 20; // = 4ms/konektor (laju stepInterval lama) x 5 konektor per level

/** Level dari jumlah konektor yang dimakan (mulai dari 1). */
export function levelFor(eaten: number): number {
  return 1 + Math.floor(Math.max(0, eaten) / CONNECTORS_PER_LEVEL);
}

/** Interval tick (ms) untuk level tertentu: turun TICK_STEP_MS per level, floor MIN_TICK_MS. */
export function tickMsFor(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - (lv - 1) * TICK_STEP_MS);
}

/** Interval tick (detik) langsung dari jumlah makanan — dipakai loop game. */
export function tickSecondsFor(eaten: number): number {
  return tickMsFor(levelFor(eaten)) / 1000;
}

/** Progres dalam level berjalan: 0..CONNECTORS_PER_LEVEL-1. */
export function progressInLevel(eaten: number): number {
  return Math.max(0, eaten) % CONNECTORS_PER_LEVEL;
}

/** Berapa konektor lagi menuju level berikutnya. */
export function connectorsToNextLevel(eaten: number): number {
  return CONNECTORS_PER_LEVEL - progressInLevel(eaten);
}

/** Peluang konektor emas muncul tiap konektor biasa dimakan. */
export const GOLD_CHANCE = 0.35;
export const GOLD_DURATION = 6; // detik

export type StepEvent = 'moved' | 'ate' | 'ate-gold' | 'died';

/** Satu langkah maju. */
export function step(st: SnakeState, rng: () => number): StepEvent {
  if (st.dead) return 'died';
  if (st.pendingDir) {
    st.dir = st.pendingDir;
    st.pendingDir = null;
  }
  const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };
  // pagar proyek
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    st.dead = true;
    return 'died';
  }
  // gigit kabel sendiri (ekor boleh karena ikut maju — kecuali tumbuh)
  const body = st.grew ? st.snake : st.snake.slice(0, -1);
  if (body.some((s) => s.x === head.x && s.y === head.y)) {
    st.dead = true;
    return 'died';
  }
  st.snake.unshift(head);
  st.grew = false;

  if (head.x === st.food.x && head.y === st.food.y) {
    st.grew = true; // tumbuh: ekor tidak dipotong langkah ini
    st.eaten += 1;
    st.score += 10;
    st.food = freeCell(st.snake, rng);
    if (rng() < GOLD_CHANCE && !st.gold) {
      st.gold = freeCell(st.snake, rng);
      st.goldT = GOLD_DURATION;
    }
    return 'ate';
  }
  if (st.gold && head.x === st.gold.x && head.y === st.gold.y) {
    st.grew = true; // tumbuh: ekor tidak dipotong langkah ini
    st.eaten += 1;
    st.score += 25;
    st.gold = null;
    st.goldT = 0;
    return 'ate-gold';
  }
  st.snake.pop();
  return 'moved';
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 400) return 'S';
  if (score >= 280) return 'A';
  if (score >= 170) return 'B';
  if (score >= 80) return 'C';
  return 'D';
}
