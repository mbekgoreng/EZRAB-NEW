/**
 * Nyebrang Proyek — logika murni (tanpa DOM).
 *
 * Tukang melompat ke depan menghindari truk molen & kendaraan proyek.
 * Baris (lane) dibuat prosedural & deterministik per nomor baris.
 * py membesar ke depan (atas). Skor = baris terjauh.
 */

export const COLS = 9;

export type LaneKind = 'aman' | 'jalan';
export type VehicleKind = 'molen' | 'pickup' | 'beko';

export interface Vehicle {
  x: number; // posisi kiri (satuan tile, float)
  w: number;
  kind: VehicleKind;
}

export interface Lane {
  kind: LaneKind;
  dir: 1 | -1;
  speed: number; // tile/detik
  vehicles: Vehicle[];
  /** kolom dekorasi untuk lajur aman (cone/tumpukan material) */
  deco: number[];
}

export interface State {
  lanes: Map<number, Lane>;
  px: number;
  py: number;
  maxRow: number;
  score: number;
  hops: number;
  over: boolean;
  cause: 'tabrak' | null;
  t: number;
  seed: number;
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

const VEH_W: Record<VehicleKind, number> = { molen: 2.4, pickup: 1.3, beko: 1.7 };
const KINDS: VehicleKind[] = ['molen', 'pickup', 'beko'];

/** Lajur deterministik dari (seed, row). Murni. */
export function genLane(seed: number, row: number): Lane {
  const rng = mulberry((seed ^ Math.imul(row + 1, 0x9e3779b1)) >>> 0);
  if (row <= 0) {
    return { kind: 'aman', dir: 1, speed: 0, vehicles: [], deco: [1, 4, 7] };
  }
  // tiap 7 baris ada zona aman (tempat istirahat)
  if (row % 7 === 6) {
    const deco: number[] = [];
    for (let c = 0; c < COLS; c += 1) if (rng() < 0.5) deco.push(c);
    return { kind: 'aman', dir: 1, speed: 0, vehicles: [], deco };
  }
  if (rng() < 0.45) {
    // lajur aman biasa
    const deco: number[] = [];
    for (let c = 0; c < COLS; c += 1) if (rng() < 0.35) deco.push(c);
    return { kind: 'aman', dir: 1, speed: 0, vehicles: [], deco };
  }
  // jalan: kendaraan
  const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
  const speed = 2.2 + rng() * 3.2 + Math.min(2, row * 0.03);
  const n = 2 + Math.floor(rng() * 2);
  const vehicles: Vehicle[] = [];
  const spacing = COLS / n;
  for (let i = 0; i < n; i += 1) {
    const kind = KINDS[Math.floor(rng() * KINDS.length)];
    const w = VEH_W[kind];
    // posisi tersebar agar tak menumpuk
    const x = i * spacing + rng() * Math.max(0.5, spacing - w - 0.6);
    vehicles.push({ x, w, kind });
  }
  return { kind: 'jalan', dir, speed, vehicles, deco: [] };
}

export function getLane(st: State, row: number): Lane {
  let lane = st.lanes.get(row);
  if (!lane) {
    lane = genLane(st.seed, row);
    st.lanes.set(row, lane);
  }
  return lane;
}

export function createState(seed = 1): State {
  const st: State = {
    lanes: new Map(), px: 4, py: 0, maxRow: 0, score: 0, hops: 0,
    over: false, cause: null, t: 0, seed: seed >>> 0,
  };
  getLane(st, 0);
  return st;
}

/** Lompat satu sel. */
export function hop(st: State, dx: number, dy: number): boolean {
  if (st.over) return false;
  st.px = Math.max(0, Math.min(COLS - 1, st.px + dx));
  st.py = Math.max(0, st.py + dy);
  st.hops += 1;
  getLane(st, st.py); // pastikan lajur ada
  if (st.py > st.maxRow) {
    st.maxRow = st.py;
    st.score = st.py;
  }
  return true;
}

/** Tabrakan pemain vs kendaraan di barisnya. */
export function checkCollision(st: State): boolean {
  const lane = getLane(st, st.py);
  if (lane.kind !== 'jalan') return false;
  const pL = st.px + 0.12;
  const pR = st.px + 0.88;
  for (const v of lane.vehicles) {
    if (pL < v.x + v.w && pR > v.x) return true;
  }
  return false;
}

export function step(st: State, dt: number): void {
  if (st.over) return;
  st.t += dt;
  // gerakkan kendaraan di lajur sekitar pemain
  for (let r = Math.max(0, st.py - 2); r <= st.py + 10; r += 1) {
    const lane = getLane(st, r);
    if (lane.kind !== 'jalan') continue;
    for (const v of lane.vehicles) {
      v.x += lane.dir * lane.speed * dt;
      const span = COLS + 2 + v.w;
      if (lane.dir === 1 && v.x > COLS + 1) v.x -= span;
      if (lane.dir === -1 && v.x + v.w < -1) v.x += span;
    }
  }
  // buang lajur jauh di belakang (hemat memori)
  for (const key of [...st.lanes.keys()]) {
    if (key < st.py - 4) st.lanes.delete(key);
  }
  if (checkCollision(st)) {
    st.over = true;
    st.cause = 'tabrak';
  }
}
