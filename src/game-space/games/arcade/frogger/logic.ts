/**
 * Tukang Nyebrang — Frogger reskin konstruksi.
 * Tukang menyeberangi jalan proyek (kendaraan) & sungai (balok kayu) menuju 5 rumah.
 * 3 nyawa, tiap nyawa 60 detik. Pure logic, grid COLS x ROWS.
 */

export const COLS = 9;
export const ROWS = 11;
export const HOME_COLS = [0, 2, 4, 6, 8];
export const START_LIVES = 3;
export const ATTEMPT_TIME = 60;
export const HOME_SCORE = 200;
export const ROW_SCORE = 10;

export type LaneKind = 'home' | 'river' | 'safe' | 'road' | 'start';

export interface Obstacle {
  start: number; // posisi awal (float, dalam sel)
  len: number; // panjang dalam sel
}

export interface Lane {
  kind: LaneKind;
  dir: 1 | -1;
  speed: number; // sel per detik
  obstacles: Obstacle[];
}

export interface Game {
  lanes: Lane[];
  fx: number; // posisi x float (bisa pecahan karena terbawa balok)
  y: number; // baris
  lives: number;
  homes: boolean[]; // 5 rumah, true = sudah dihuni
  score: number;
  bestY: number; // baris tertinggi yg dicapai nyawa ini (makin kecil = makin maju)
  timeLeft: number;
  t: number; // waktu game berjalan
  status: 'playing' | 'won' | 'lost';
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Konfigurasi lajur: sungai (1-4), aman (5), jalan (6-9). */
function makeLanes(rng: () => number): Lane[] {
  const lanes: Lane[] = [{ kind: 'home', dir: 1, speed: 0, obstacles: [] }];
  // sungai: balok kayu
  const riverCfg = [
    { dir: 1 as const, speed: 1.1, lens: [3, 2] },
    { dir: -1 as const, speed: 1.5, lens: [2, 3] },
    { dir: 1 as const, speed: 1.9, lens: [2, 2] },
    { dir: -1 as const, speed: 1.3, lens: [4] },
  ];
  for (const c of riverCfg) {
    lanes.push({
      kind: 'river', dir: c.dir, speed: c.speed,
      obstacles: c.lens.map((len) => ({ start: rng() * COLS, len })),
    });
  }
  lanes.push({ kind: 'safe', dir: 1, speed: 0, obstacles: [] });
  // jalan proyek: kendaraan
  const roadCfg = [
    { dir: -1 as const, speed: 1.6, lens: [2, 2] },
    { dir: 1 as const, speed: 2.2, lens: [3] },
    { dir: -1 as const, speed: 2.8, lens: [2] },
    { dir: 1 as const, speed: 1.9, lens: [2, 3] },
  ];
  for (const c of roadCfg) {
    lanes.push({
      kind: 'road', dir: c.dir, speed: c.speed,
      obstacles: c.lens.map((len) => ({ start: rng() * COLS, len })),
    });
  }
  lanes.push({ kind: 'start', dir: 1, speed: 0, obstacles: [] });
  return lanes;
}

export function createGame(seed: number): Game {
  const rng = mulberry32(seed);
  const g: Game = {
    lanes: makeLanes(rng),
    fx: (COLS - 1) / 2, y: ROWS - 1,
    lives: START_LIVES, homes: [false, false, false, false, false],
    score: 0, bestY: ROWS - 1, timeLeft: ATTEMPT_TIME, t: 0,
    status: 'playing',
  };
  return g;
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Sel-sel yang ditempati rintangan di baris tertentu pada waktu t. */
export function obstacleCells(lane: Lane, t: number): Set<number> {
  const out = new Set<number>();
  for (const o of lane.obstacles) {
    const base = mod(o.start + lane.dir * lane.speed * t, COLS);
    for (let i = 0; i < o.len; i += 1) out.add(Math.floor(mod(base + i, COLS)));
  }
  return out;
}

export type MoveResult = 'moved' | 'blocked' | 'home' | 'drowned' | 'gameover';

function respawn(g: Game): void {
  g.fx = (COLS - 1) / 2;
  g.y = ROWS - 1;
  g.bestY = ROWS - 1;
  g.timeLeft = ATTEMPT_TIME;
}

function die(g: Game): MoveResult {
  g.lives -= 1;
  if (g.lives <= 0) {
    g.status = 'lost';
    return 'gameover';
  }
  respawn(g);
  return 'drowned';
}

/**
 * Lompat satu sel. Return 'home' saat sampai rumah kosong,
 * 'blocked' jika tidak bisa, 'drowned'/'gameover' jika mati saat lompat (sungai).
 */
export function move(g: Game, dx: number, dy: number): MoveResult {
  if (g.status !== 'playing') return 'blocked';
  const nx = Math.round(g.fx) + dx;
  const ny = g.y + dy;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return 'blocked';
  // baris rumah: hanya kolom rumah yg belum dihuni
  if (ny === 0) {
    const hi = HOME_COLS.indexOf(nx);
    if (hi < 0 || g.homes[hi]) return 'blocked';
    g.homes[hi] = true;
    g.score += HOME_SCORE + Math.ceil(g.timeLeft);
    if (g.homes.every(Boolean)) {
      g.status = 'won';
      return 'home';
    }
    respawn(g);
    return 'home';
  }
  g.fx = nx;
  g.y = ny;
  if (ny < g.bestY) {
    g.score += (g.bestY - ny) * ROW_SCORE;
    g.bestY = ny;
  }
  // mendarat di sungai tanpa balok = langsung tenggelam
  const lane = g.lanes[ny];
  if (lane.kind === 'river' && !obstacleCells(lane, g.t).has(nx)) return die(g);
  return 'moved';
}

/** Majukan waktu: balok membawa tukang, cek tabrakan & timer. */
export function update(g: Game, dt: number): void {
  if (g.status !== 'playing') return;
  g.t += dt;
  g.timeLeft -= dt;
  if (g.timeLeft <= 0) {
    g.timeLeft = 0;
    die(g);
    return;
  }
  const lane = g.lanes[g.y];
  const cx = Math.round(g.fx);
  if (lane.kind === 'river') {
    const cells = obstacleCells(lane, g.t);
    if (!cells.has(cx)) {
      die(g); // jatuh dari balok
      return;
    }
    g.fx += lane.dir * lane.speed * dt;
    if (g.fx < -0.6 || g.fx > COLS - 0.4) {
      die(g); // terbawa arus keluar
      return;
    }
  } else if (lane.kind === 'road') {
    if (obstacleCells(lane, g.t).has(cx)) die(g); // kelindas!
  }
}

export function homesFilled(g: Game): number {
  return g.homes.filter(Boolean).length;
}
