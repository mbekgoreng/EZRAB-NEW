/**
 * Material Match — logika murni match-3 bertema material konstruksi.
 *
 * Papan 8x8 berisi material: Bata, Semen, Besi, Kayu, Kaca.
 * - 3+ sejajar (horizontal/vertikal) hancur & berjatuhan (cascade).
 * - 4 sejajar -> Material Baja (striped): menghancurkan 1 baris/kolom penuh.
 * - 5 sejajar -> Dinamit: meledakkan area 3x3 (berantai).
 * - Tukar material spesial dengan apa pun -> langsung meledak.
 *
 * Murni: tanpa DOM/window. Animasi & render di komponen.
 */

export const ROWS = 8;
export const COLS = 8;
export const NTYPES = 5;

/** Nama material untuk UI (index = t). */
export const MATERIALS = ['Bata', 'Semen', 'Besi', 'Kayu', 'Kaca'] as const;

export type Special = 'none' | 'bajaH' | 'bajaV' | 'dinamit';

export interface Cell {
  t: number; // 0..NTYPES-1
  s: Special;
  id: number;
}

export type Board = Cell[][]; // [r][c]

export interface Pos {
  r: number;
  c: number;
}

export interface Match {
  cells: Pos[];
  dir: 'h' | 'v';
}

export interface ClearedCell extends Pos {
  t: number;
  s: Special;
  id: number;
}

export interface SpawnedSpecial extends Pos {
  s: Special;
  t: number;
}

export interface ResolveStep {
  cleared: ClearedCell[];
  spawned: SpawnedSpecial[];
  gained: number;
  /** Snapshot papan SETELAH gravity+refill langkah ini. */
  board: Board;
}

export interface ResolveResult {
  steps: ResolveStep[];
  gained: number;
  board: Board;
}

/* ---------------- seeded rng ---------------- */

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

let nextId = 1;
const freshId = (): number => nextId++;

export const inBounds = (r: number, c: number): boolean =>
  r >= 0 && r < ROWS && c >= 0 && c < COLS;

const posKey = (r: number, c: number): number => r * COLS + c;

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.map((cell) => ({ ...cell })));
}

/* ---------------- board creation ---------------- */

function pickType(rng: () => number, b: Board, row: Cell[], r: number, c: number): number {
  for (let tries = 0; tries < 24; tries += 1) {
    const t = Math.floor(rng() * NTYPES);
    const left1 = c >= 1 ? row[c - 1].t : -1;
    const left2 = c >= 2 ? row[c - 2].t : -1;
    const up1 = r >= 1 ? b[r - 1][c].t : -1;
    const up2 = r >= 2 ? b[r - 2][c].t : -1;
    if (!(t === left1 && t === left2) && !(t === up1 && t === up2)) return t;
  }
  return Math.floor(rng() * NTYPES);
}

export function createBoard(seed: number): Board {
  nextId = 1;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const rng = mulberry32(seed + attempt * 7919);
    const b: Board = [];
    for (let r = 0; r < ROWS; r += 1) {
      const row: Cell[] = [];
      for (let c = 0; c < COLS; c += 1) {
        row.push({ t: pickType(rng, b, row, r, c), s: 'none', id: freshId() });
      }
      b.push(row);
    }
    if (hasPossibleMove(b)) return b;
  }
  // fallback: nyaris mustahil tercapai
  const rng = mulberry32(seed);
  const b: Board = [];
  for (let r = 0; r < ROWS; r += 1) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c += 1) {
      row.push({ t: pickType(rng, b, row, r, c), s: 'none', id: freshId() });
    }
    b.push(row);
  }
  return b;
}

/* ---------------- matching ---------------- */

/** Cari semua run horizontal/vertikal >= 3 dengan tipe sama. */
export function findMatches(b: Board): Match[] {
  const matches: Match[] = [];
  // horizontal
  for (let r = 0; r < ROWS; r += 1) {
    let c = 0;
    while (c < COLS) {
      const t = b[r][c].t;
      let len = 1;
      while (c + len < COLS && b[r][c + len].t === t) len += 1;
      if (len >= 3) {
        const cells: Pos[] = [];
        for (let i = 0; i < len; i += 1) cells.push({ r, c: c + i });
        matches.push({ cells, dir: 'h' });
      }
      c += len;
    }
  }
  // vertikal
  for (let c = 0; c < COLS; c += 1) {
    let r = 0;
    while (r < ROWS) {
      const t = b[r][c].t;
      let len = 1;
      while (r + len < ROWS && b[r + len][c].t === t) len += 1;
      if (len >= 3) {
        const cells: Pos[] = [];
        for (let i = 0; i < len; i += 1) cells.push({ r: r + i, c });
        matches.push({ cells, dir: 'v' });
      }
      r += len;
    }
  }
  return matches;
}

export const isAdjacent = (a: Pos, b: Pos): boolean =>
  Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

/* ---------------- special effects ---------------- */

/** Area yang dihancurkan special di pos (termasuk berantai). */
export function triggerArea(b: Board, start: Pos): Pos[] {
  const out = new Map<number, Pos>();
  const queue: Pos[] = [{ ...start }];
  const seenSpecial = new Set<number>();
  out.set(posKey(start.r, start.c), { ...start });
  while (queue.length > 0) {
    const p = queue.pop()!;
    const cell = b[p.r][p.c];
    const k = posKey(p.r, p.c);
    if (seenSpecial.has(k)) continue;
    seenSpecial.add(k);
    const add = (r: number, c: number): void => {
      if (!inBounds(r, c)) return;
      const kk = posKey(r, c);
      if (!out.has(kk)) {
        out.set(kk, { r, c });
        if (b[r][c].s !== 'none') queue.push({ r, c });
      }
    };
    if (cell.s === 'bajaH') {
      for (let c = 0; c < COLS; c += 1) add(p.r, c);
    } else if (cell.s === 'bajaV') {
      for (let r = 0; r < ROWS; r += 1) add(r, p.c);
    } else if (cell.s === 'dinamit') {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) add(p.r + dr, p.c + dc);
      }
    }
  }
  return [...out.values()];
}

/* ---------------- crush / gravity / refill ---------------- */

function applyCrush(b: Board, cells: Pos[], rng: () => number): ClearedCell[] {
  const cleared: ClearedCell[] = [];
  const gone = new Set<number>();
  for (const p of cells) gone.add(posKey(p.r, p.c));
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (!gone.has(posKey(r, c))) continue;
      const cell = b[r][c];
      cleared.push({ r, c, t: cell.t, s: cell.s, id: cell.id });
      b[r][c] = null as unknown as Cell;
    }
  }
  // gravity per kolom + refill dari atas
  for (let c = 0; c < COLS; c += 1) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r -= 1) {
      const cell = b[r][c];
      if (cell) {
        if (write !== r) {
          b[write][c] = cell;
          b[r][c] = null as unknown as Cell;
        }
        write -= 1;
      }
    }
    for (let r = write; r >= 0; r -= 1) {
      b[r][c] = { t: Math.floor(rng() * NTYPES), s: 'none', id: freshId() };
    }
  }
  return cleared;
}

/* ---------------- resolve (cascade) ---------------- */

function specialForMatch(m: Match): Special {
  const len = m.cells.length;
  if (len >= 5) return 'dinamit';
  if (len === 4) return m.dir === 'h' ? 'bajaH' : 'bajaV';
  return 'none';
}

export function resolveBoard(
  input: Board,
  prefer: Pos | null,
  seed: number,
): ResolveResult {
  const b = cloneBoard(input);
  const rng = mulberry32(seed);
  const steps: ResolveStep[] = [];
  let gained = 0;
  for (let iter = 0; iter < 40; iter += 1) {
    const matches = findMatches(b);
    if (matches.length === 0) break;
    const crushKeys = new Map<number, Pos>();
    const spawned: SpawnedSpecial[] = [];
    for (const m of matches) {
      const special = specialForMatch(m);
      let spawnIdx = Math.floor(m.cells.length / 2);
      if (prefer) {
        const pi = m.cells.findIndex((p) => p.r === prefer.r && p.c === prefer.c);
        if (pi >= 0) spawnIdx = pi;
      }
      m.cells.forEach((p, i) => {
        if (i === spawnIdx && special !== 'none') {
          const cell = b[p.r][p.c];
          cell.s = special;
          spawned.push({ r: p.r, c: p.c, s: special, t: cell.t });
        } else {
          crushKeys.set(posKey(p.r, p.c), p);
        }
      });
    }
    // special yang ikut hancur -> ledakkan areanya (berantai)
    const queue = [...crushKeys.values()];
    const expanded = new Set<number>(crushKeys.keys());
    while (queue.length > 0) {
      const p = queue.pop()!;
      const cell = b[p.r][p.c];
      if (cell.s === 'none') continue;
      for (const ap of triggerArea(b, p)) {
        const k = posKey(ap.r, ap.c);
        if (!expanded.has(k)) {
          expanded.add(k);
          queue.push(ap);
        }
      }
    }
    const crushList = [...expanded].map((k) => ({
      r: Math.floor(k / COLS),
      c: k % COLS,
    }));
    const cleared = applyCrush(b, crushList, rng);
    let stepGain = cleared.length * 60;
    for (const cl of cleared) {
      if (cl.s !== 'none') stepGain += 150;
    }
    for (const sp of spawned) stepGain += sp.s === 'dinamit' ? 400 : 200;
    gained += stepGain;
    steps.push({ cleared, spawned, gained: stepGain, board: cloneBoard(b) });
  }
  return { steps, gained, board: b };
}

/**
 * Tukar dua sel bersebelahan. Valid bila:
 *  - salah satunya special (langsung diledakkan), atau
 *  - swap menciptakan minimal satu match.
 * Mengembalikan papan baru (sudah di-swap, BELUM resolve) + info.
 */
export interface SwapInfo {
  board: Board;
  detonated: Pos | null; // posisi special yang diledakkan manual
}

export function trySwap(b: Board, a: Pos, c: Pos): SwapInfo | null {
  if (!inBounds(a.r, a.c) || !inBounds(c.r, c.c)) return null;
  if (!isAdjacent(a, c)) return null;
  const nb = cloneBoard(b);
  const tmp = nb[a.r][a.c];
  nb[a.r][a.c] = nb[c.r][c.c];
  nb[c.r][c.c] = tmp;
  const specialPos =
    b[a.r][a.c].s !== 'none' ? a : b[c.r][c.c].s !== 'none' ? c : null;
  if (specialPos) {
    // special diledakkan di posisi BARUnya setelah swap
    const newPos =
      b[a.r][a.c].s !== 'none' ? c : a;
    return { board: nb, detonated: newPos };
  }
  if (findMatches(nb).length === 0) return null;
  return { board: nb, detonated: null };
}

/** Ledakkan special di pos secara manual (hasil swap special). */
export function detonate(input: Board, pos: Pos, seed: number): ResolveResult {
  const b = cloneBoard(input);
  const area = triggerArea(b, pos);
  const rng = mulberry32(seed);
  const cleared = applyCrush(b, area, rng);
  let gained = cleared.length * 60 + 150;
  const steps: ResolveStep[] = [
    { cleared, spawned: [], gained, board: cloneBoard(b) },
  ];
  const rest = resolveBoard(b, null, seed + 1);
  for (const s of rest.steps) steps.push(s);
  gained += rest.gained;
  return { steps, gained, board: rest.board };
}

/* ---------------- moves / level ---------------- */

/** Ada langkah valid? (coba semua swap kanan & bawah) */
export function hasPossibleMove(b: Board): boolean {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (b[r][c].s !== 'none') return true;
      const dirs: Pos[] = [
        { r, c: c + 1 },
        { r: r + 1, c },
      ];
      for (const d of dirs) {
        if (!inBounds(d.r, d.c)) continue;
        const nb = cloneBoard(b);
        const tmp = nb[r][c];
        nb[r][c] = nb[d.r][d.c];
        nb[d.r][d.c] = tmp;
        if (findMatches(nb).length > 0) return true;
      }
    }
  }
  return false;
}

/** Acak ulang tipe material (special dipertahankan) sampai valid. */
export function shuffleBoard(input: Board, seed: number): Board {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const b = cloneBoard(input);
    const types: number[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) types.push(Math.floor(rng() * NTYPES));
    }
    // Fisher-Yates dengan rng
    for (let i = types.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    let k = 0;
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) b[r][c].t = types[k++];
    }
    if (findMatches(b).length === 0 && hasPossibleMove(b)) return b;
  }
  return createBoard(seed);
}

export interface LevelConfig {
  moves: number;
  target: number;
}

export function levelConfig(level: number): LevelConfig {
  return {
    moves: 30,
    target: 2500 + (level - 1) * 1500,
  };
}
