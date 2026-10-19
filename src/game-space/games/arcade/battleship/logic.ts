/**
 * Perang Crane — Battleship reskin konstruksi.
 * Armada alat berat di grid site 10x10 vs AI SEDANG (hunt/target + paritas).
 * Pure logic.
 */

export const SIZE = 10;

export interface ShipDef {
  name: string;
  emoji: string;
  size: number;
}

export const FLEET: ShipDef[] = [
  { name: 'Tower Crane', emoji: '🏗️', size: 5 },
  { name: 'Bulldozer', emoji: '🚜', size: 4 },
  { name: 'Excavator', emoji: '🦺', size: 3 },
  { name: 'Molen', emoji: '🚚', size: 3 },
  { name: 'Pickup', emoji: '🛻', size: 2 },
];

export interface Placed {
  id: number;
  def: ShipDef;
  cells: { x: number; y: number }[];
}

export type ShotResult = 'hit' | 'miss';

export interface Board {
  ships: Placed[];
  shots: Map<string, ShotResult>; // "x,y"
}

export const key = (x: number, y: number): string => `${x},${y}`;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyBoard(): Board {
  return { ships: [], shots: new Map() };
}

export function shipAt(b: Board, x: number, y: number): Placed | undefined {
  return b.ships.find((s) => s.cells.some((c) => c.x === x && c.y === y));
}

export function cellsOf(b: Board): Set<string> {
  const s = new Set<string>();
  for (const sh of b.ships) for (const c of sh.cells) s.add(key(c.x, c.y));
  return s;
}

/** Cek apakah kapal bisa ditaruh (di dalam grid & tidak tabrakan). */
export function canPlace(b: Board, def: ShipDef, x: number, y: number, horiz: boolean): boolean {
  const taken = cellsOf(b);
  for (let i = 0; i < def.size; i += 1) {
    const cx = x + (horiz ? i : 0);
    const cy = y + (horiz ? 0 : i);
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return false;
    if (taken.has(key(cx, cy))) return false;
  }
  return true;
}

export function placeShip(b: Board, def: ShipDef, x: number, y: number, horiz: boolean): Placed | null {
  if (!canPlace(b, def, x, y, horiz)) return null;
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < def.size; i += 1) cells.push({ x: x + (horiz ? i : 0), y: y + (horiz ? 0 : i) });
  const p: Placed = { id: b.ships.length, def, cells };
  b.ships.push(p);
  return p;
}

/** Taruh seluruh armada acak. Return false jika gagal (sangat jarang). */
export function placeFleetRandom(b: Board, rng: () => number): boolean {
  b.ships = [];
  for (const def of FLEET) {
    let ok = false;
    for (let t = 0; t < 200 && !ok; t += 1) {
      const horiz = rng() < 0.5;
      const x = (rng() * SIZE) | 0;
      const y = (rng() * SIZE) | 0;
      ok = placeShip(b, def, x, y, horiz) !== null;
    }
    if (!ok) return false;
  }
  return true;
}

export interface FireOutcome {
  result: ShotResult | 'repeat';
  sunk: Placed | null;
}

/** Tembak satu sel. 'repeat' jika sel sudah ditembak. */
export function fireAt(b: Board, x: number, y: number): FireOutcome {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return { result: 'repeat', sunk: null };
  const k = key(x, y);
  if (b.shots.has(k)) return { result: 'repeat', sunk: null };
  const ship = shipAt(b, x, y);
  if (!ship) {
    b.shots.set(k, 'miss');
    return { result: 'miss', sunk: null };
  }
  b.shots.set(k, 'hit');
  const sunk = ship.cells.every((c) => b.shots.get(key(c.x, c.y)) === 'hit') ? ship : null;
  return { result: 'hit', sunk };
}

export function allSunk(b: Board): boolean {
  return b.ships.length > 0 && b.ships.every(
    (s) => s.cells.every((c) => b.shots.get(key(c.x, c.y)) === 'hit'),
  );
}

export function sunkShips(b: Board): Placed[] {
  return b.ships.filter((s) => s.cells.every((c) => b.shots.get(key(c.x, c.y)) === 'hit'));
}

// ---------- AI SEDANG: hunt (paritas papan catur) + target (tetangga hit) ----------

export interface AiMemory {
  shotKeys: Set<string>;
  /** sel hit yang kapalnya belum tenggelam */
  openHits: { x: number; y: number }[];
}

export function createAi(): AiMemory {
  return { shotKeys: new Set(), openHits: [] };
}

function neighbors(x: number, y: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (x > 0) out.push({ x: x - 1, y });
  if (x < SIZE - 1) out.push({ x: x + 1, y });
  if (y > 0) out.push({ x, y: y - 1 });
  if (y < SIZE - 1) out.push({ x, y: y + 1 });
  return out;
}

/** Pilih tembakan: prioritaskan tetangga openHits, lalu sel paritas yang belum ditembak. */
export function aiChooseShot(mem: AiMemory, rng: () => number): { x: number; y: number } {
  // mode target
  const cands: { x: number; y: number }[] = [];
  for (const h of mem.openHits) {
    for (const n of neighbors(h.x, h.y)) {
      if (!mem.shotKeys.has(key(n.x, n.y)) && !cands.some((c) => c.x === n.x && c.y === n.y)) {
        cands.push(n);
      }
    }
  }
  if (cands.length > 0) return cands[(rng() * cands.length) | 0];
  // mode hunt: paritas papan catur (kapal terkecil 2 selalu kena sel paritas)
  const parity: { x: number; y: number }[] = [];
  const rest: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (mem.shotKeys.has(key(x, y))) continue;
      if ((x + y) % 2 === 0) parity.push({ x, y });
      else rest.push({ x, y });
    }
  }
  const pool = parity.length > 0 ? parity : rest;
  return pool[(rng() * pool.length) | 0];
}

/** Catat hasil tembakan AI. sunkCells = sel kapal yang baru tenggelam. */
export function aiRegister(
  mem: AiMemory, x: number, y: number, hit: boolean, sunkCells: { x: number; y: number }[] | null,
): void {
  mem.shotKeys.add(key(x, y));
  if (hit) {
    if (sunkCells) {
      const dead = new Set(sunkCells.map((c) => key(c.x, c.y)));
      mem.openHits = mem.openHits.filter((h) => !dead.has(key(h.x, h.y)));
    } else {
      mem.openHits.push({ x, y });
    }
  }
}
