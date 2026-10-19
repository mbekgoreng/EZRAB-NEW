/**
 * Pak Mandor — logika murni Pac-Man bertema konstruksi (tanpa DOM).
 *
 * Pak Mandor (pemain) memakan helm-helm proyek di labirin. Hantu = para
 * "Klien Revisi" (Revisi Denah, Revisi RAB, Revisi Desain, Revisi Spek).
 * Kopi Tubruk (power pellet) membuat klien "setuju" (frightened) sesaat.
 *
 * Model gerak: posisi float dalam satuan tile; tiap entitas menuju pusat
 * tile berikutnya (tx,ty). Tiba -> putuskan arah berikutnya.
 */

export const COLS = 19;
export const ROWS = 17;

export const MAP: string[] = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#.......#....#',
  '####.#.##-##.#.####',
  '#....#.#GGG#.#....#',
  '#....#.#GGG#.#....#',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#....#...P...#....#',
  '##.#.#.#####.#.#.##',
  '#o...#...#...#...o#',
  '#.######.#.######.#',
  '#.................#',
];

export const T_WALL = 0;
export const T_DOT = 1;
export const T_PELLET = 2;
export const T_EMPTY = 3;
export const T_HOUSE = 4; // G: hanya hantu
export const T_DOOR = 5; // -: hanya hantu (keluar/masuk)

export interface Dir {
  x: number;
  y: number;
}
export const UP: Dir = { x: 0, y: -1 };
export const DOWN: Dir = { x: 0, y: 1 };
export const LEFT: Dir = { x: -1, y: 0 };
export const RIGHT: Dir = { x: 1, y: 0 };
export const DIRS: Dir[] = [UP, LEFT, DOWN, RIGHT];
const STOP: Dir = { x: 0, y: 0 };

export type GhostKind = 'denah' | 'rab' | 'desain' | 'spek';
export type GhostState = 'house' | 'exit' | 'active' | 'eaten';

export interface GhostInfo {
  kind: GhostKind;
  name: string;
  color: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Dir;
  state: GhostState;
  exitT: number;
  scatter: { x: number; y: number };
}

export interface GameState {
  grid: number[];
  player: { x: number; y: number; tx: number; ty: number; dir: Dir; queued: Dir };
  ghosts: GhostInfo[];
  score: number;
  lives: number;
  level: number;
  dotsLeft: number;
  mode: 'scatter' | 'chase';
  modeIdx: number;
  modeT: number;
  frightT: number;
  eatChain: number;
  t: number;
  over: boolean;
  levelClear: boolean;
  levelClearT: number;
  rngState: number;
}

export const GHOST_DEFS: { kind: GhostKind; name: string; color: string; hx: number; hy: number; exit: number; scatter: { x: number; y: number } }[] = [
  { kind: 'denah', name: 'Revisi Denah', color: '#ef4444', hx: 9, hy: 7, exit: 0.5, scatter: { x: 17, y: 0 } },
  { kind: 'rab', name: 'Revisi RAB', color: '#f9a8d4', hx: 8, hy: 7, exit: 2.5, scatter: { x: 1, y: 0 } },
  { kind: 'desain', name: 'Revisi Desain', color: '#22d3ee', hx: 10, hy: 7, exit: 5, scatter: { x: 17, y: 16 } },
  { kind: 'spek', name: 'Revisi Spek', color: '#fb923c', hx: 9, hy: 8, exit: 9, scatter: { x: 1, y: 16 } },
];

const DOOR = { x: 9, y: 6 };
const MODE_SCHEDULE: [number, 'scatter' | 'chase'][] = [
  [7, 'scatter'], [20, 'chase'], [7, 'scatter'], [20, 'chase'],
  [5, 'scatter'], [20, 'chase'], [5, 'scatter'], [Infinity, 'chase'],
];

export const tileAt = (grid: number[], x: number, y: number): number =>
  x < 0 || y < 0 || x >= COLS || y >= ROWS ? T_WALL : grid[y * COLS + x];

function buildGrid(): { grid: number[]; dots: number; px: number; py: number } {
  const grid = new Array(COLS * ROWS).fill(T_WALL);
  let dots = 0;
  let px = 9;
  let py = 12;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const ch = MAP[y][x];
      let t = T_WALL;
      if (ch === '.') { t = T_DOT; dots += 1; }
      else if (ch === 'o') { t = T_PELLET; dots += 1; }
      else if (ch === ' ') t = T_EMPTY;
      else if (ch === 'G') t = T_HOUSE;
      else if (ch === '-') t = T_DOOR;
      else if (ch === 'P') { t = T_EMPTY; px = x; py = y; }
      grid[y * COLS + x] = t;
    }
  }
  return { grid, dots, px, py };
}

export function rand(st: GameState): number {
  let a = st.rngState | 0;
  a = (a + 0x6d2b79f5) | 0;
  st.rngState = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeGhosts(): GhostInfo[] {
  return GHOST_DEFS.map((d) => ({
    kind: d.kind, name: d.name, color: d.color,
    x: d.hx, y: d.hy, tx: d.hx, ty: d.hy,
    dir: { ...STOP }, state: 'house' as GhostState, exitT: d.exit,
    scatter: { ...d.scatter },
  }));
}

export function createGame(seed = 1): GameState {
  const { grid, dots, px, py } = buildGrid();
  return {
    grid,
    player: { x: px, y: py, tx: px, ty: py, dir: { ...STOP }, queued: { ...LEFT } },
    ghosts: makeGhosts(),
    score: 0, lives: 3, level: 1, dotsLeft: dots,
    mode: 'scatter', modeIdx: 0, modeT: MODE_SCHEDULE[0][0],
    frightT: 0, eatChain: 0, t: 0, over: false,
    levelClear: false, levelClearT: 0, rngState: seed | 0,
  };
}

const walkPlayer = (st: GameState, x: number, y: number): boolean => {
  const t = tileAt(st.grid, x, y);
  return t !== T_WALL && t !== T_HOUSE && t !== T_DOOR;
};

const walkGhost = (st: GameState, x: number, y: number, g: GhostInfo): boolean => {
  const t = tileAt(st.grid, x, y);
  if (t === T_WALL) return false;
  if (g.state === 'eaten') return t !== T_HOUSE; // boleh lewat pintu
  if (g.state === 'exit') return true;
  return t !== T_HOUSE && t !== T_DOOR;
};

const speedOf = (st: GameState, who: 'player' | GhostInfo): number => {
  const lv = 1 + (st.level - 1) * 0.06;
  if (who === 'player') return 7.4 * lv;
  const g = who;
  if (g.state === 'eaten') return 12;
  if (st.frightT > 0) return 4.6 * lv;
  return 6.9 * lv;
};

/** Target kejar tiap hantu. */
function chaseTarget(st: GameState, g: GhostInfo): { x: number; y: number } {
  const p = st.player;
  const ahead = (n: number): { x: number; y: number } => ({
    x: Math.max(0, Math.min(COLS - 1, Math.round(p.x) + p.dir.x * n)),
    y: Math.max(0, Math.min(ROWS - 1, Math.round(p.y) + p.dir.y * n)),
  });
  switch (g.kind) {
    case 'denah': return { x: Math.round(p.x), y: Math.round(p.y) };
    case 'rab': return ahead(4);
    case 'desain': {
      const a = ahead(2);
      const red = st.ghosts[0];
      return { x: 2 * a.x - Math.round(red.x), y: 2 * a.y - Math.round(red.y) };
    }
    case 'spek': {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      return d > 8 ? { x: Math.round(p.x), y: Math.round(p.y) } : g.scatter;
    }
  }
}

function ghostTarget(st: GameState, g: GhostInfo): { x: number; y: number } {
  if (g.state === 'eaten') return DOOR;
  return st.mode === 'scatter' ? g.scatter : chaseTarget(st, g);
}

function arriveGhost(st: GameState, g: GhostInfo): void {
  g.x = g.tx;
  g.y = g.ty;
  const opts = DIRS.filter(
    (d) => !(d.x === -g.dir.x && d.y === -g.dir.y) && walkGhost(st, g.x + d.x, g.y + d.y, g),
  );
  let choice: Dir;
  if (opts.length === 0) {
    choice = { x: -g.dir.x, y: -g.dir.y };
  } else if (st.frightT > 0 && g.state === 'active') {
    choice = opts[Math.floor(rand(st) * opts.length)];
  } else {
    const tgt = ghostTarget(st, g);
    let bd = Infinity;
    choice = opts[0];
    for (const d of opts) {
      const dd = (g.x + d.x - tgt.x) ** 2 + (g.y + d.y - tgt.y) ** 2;
      if (dd < bd) { bd = dd; choice = d; }
    }
  }
  g.dir = { ...choice };
  g.tx = g.x + choice.x;
  g.ty = g.y + choice.y;
}

function arrivePlayer(st: GameState): void {
  const p = st.player;
  p.x = p.tx;
  p.y = p.ty;
  const t = tileAt(st.grid, p.x, p.y);
  if (t === T_DOT) {
    st.grid[p.y * COLS + p.x] = T_EMPTY;
    st.score += 10;
    st.dotsLeft -= 1;
  } else if (t === T_PELLET) {
    st.grid[p.y * COLS + p.x] = T_EMPTY;
    st.score += 50;
    st.dotsLeft -= 1;
    st.frightT = Math.max(2.5, 7 - st.level * 0.6);
    st.eatChain = 0;
    for (const g of st.ghosts) {
      if (g.state === 'active') {
        // balik arah saat kaget
        g.dir = { x: -g.dir.x, y: -g.dir.y };
        g.tx = g.x + g.dir.x;
        g.ty = g.y + g.dir.y;
      }
    }
  }
  // pilih arah: antrean dulu
  if ((p.queued.x !== 0 || p.queued.y !== 0) && walkPlayer(st, p.x + p.queued.x, p.y + p.queued.y)) {
    p.dir = { ...p.queued };
  }
  if ((p.dir.x !== 0 || p.dir.y !== 0) && !walkPlayer(st, p.x + p.dir.x, p.y + p.dir.y)) {
    p.dir = { ...STOP };
  }
  p.tx = p.x + p.dir.x;
  p.ty = p.y + p.dir.y;
}

function moveToward(e: { x: number; y: number; tx: number; ty: number }, speed: number, dt: number): boolean {
  const dx = e.tx - e.x;
  const dy = e.ty - e.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = speed * dt;
  if (dist <= stepLen + 1e-9) {
    e.x = e.tx;
    e.y = e.ty;
    return true;
  }
  e.x += (dx / dist) * stepLen;
  e.y += (dy / dist) * stepLen;
  return false;
}

function resetPositions(st: GameState): void {
  const { px, py } = buildGrid();
  st.player.x = px; st.player.y = py; st.player.tx = px; st.player.ty = py;
  st.player.dir = { ...STOP }; st.player.queued = { ...LEFT };
  st.ghosts = makeGhosts();
  st.mode = 'scatter'; st.modeIdx = 0; st.modeT = MODE_SCHEDULE[0][0];
  st.frightT = 0; st.eatChain = 0;
}

/** Target tile berikutnya bila entitas di (x,y) bergerak ke arah `dir`. */
function retarget(e: { x: number; y: number }, dir: Dir): { tx: number; ty: number } {
  const near = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-6;
  if (dir.x !== 0) {
    return {
      tx: near(e.x) ? Math.round(e.x) + dir.x : dir.x > 0 ? Math.ceil(e.x) : Math.floor(e.x),
      ty: Math.round(e.y),
    };
  }
  return {
    tx: Math.round(e.x),
    ty: near(e.y) ? Math.round(e.y) + dir.y : dir.y > 0 ? Math.ceil(e.y) : Math.floor(e.y),
  };
}

export function setInput(st: GameState, dir: Dir): void {
  const p = st.player;
  // balik arah langsung bila berlawanan (walau di tengah tile):
  // target = tile berikutnya di arah baru dari posisi saat ini.
  if (dir.x === -p.dir.x && dir.y === -p.dir.y && (p.dir.x !== 0 || p.dir.y !== 0)) {
    const t = retarget(p, dir);
    p.tx = t.tx;
    p.ty = t.ty;
    p.dir = { ...dir };
  }
  p.queued = { ...dir };
}

export function step(st: GameState, dt: number): void {
  if (st.over) return;
  st.t += dt;

  if (st.levelClear) {
    st.levelClearT -= dt;
    if (st.levelClearT <= 0) {
      st.level++;
      const { grid, dots, px, py } = buildGrid();
      st.grid = grid; st.dotsLeft = dots;
      st.player.x = px; st.player.y = py; st.player.tx = px; st.player.ty = py;
      st.player.dir = { ...STOP }; st.player.queued = { ...LEFT };
      st.ghosts = makeGhosts();
      st.mode = 'scatter'; st.modeIdx = 0; st.modeT = MODE_SCHEDULE[0][0];
      st.frightT = 0; st.eatChain = 0; st.levelClear = false;
    }
    return;
  }

  // mode scatter/chase
  if (st.frightT > 0) {
    st.frightT -= dt;
  } else {
    st.modeT -= dt;
    if (st.modeT <= 0) {
      st.modeIdx = Math.min(st.modeIdx + 1, MODE_SCHEDULE.length - 1);
      st.mode = MODE_SCHEDULE[st.modeIdx][1];
      st.modeT = MODE_SCHEDULE[st.modeIdx][0];
      for (const g of st.ghosts) {
        if (g.state === 'active' && (g.dir.x !== 0 || g.dir.y !== 0)) {
          const nd = { x: -g.dir.x, y: -g.dir.y };
          const t = retarget(g, nd);
          if (walkGhost(st, t.tx, t.ty, g)) {
            g.dir = nd;
            g.tx = t.tx;
            g.ty = t.ty;
          }
        }
      }
    }
  }

  // pemain
  const p = st.player;
  if (p.dir.x === 0 && p.dir.y === 0) {
    // diam: coba jalan sesuai antrean
    if ((p.queued.x !== 0 || p.queued.y !== 0) && walkPlayer(st, p.x + p.queued.x, p.y + p.queued.y)) {
      p.dir = { ...p.queued };
      p.tx = p.x + p.dir.x;
      p.ty = p.y + p.dir.y;
    }
  } else if (moveToward(p, speedOf(st, 'player'), dt)) {
    arrivePlayer(st);
  }

  // hantu
  for (const g of st.ghosts) {
    if (g.state === 'house') {
      g.exitT -= dt;
      if (g.exitT <= 0) g.state = 'exit';
      continue;
    }
    if (g.state === 'exit') {
      // menuju pintu lalu keluar ke koridor
      const target = g.y > DOOR.y + 0.6 ? { x: DOOR.x, y: g.y - 1 } : { x: DOOR.x, y: DOOR.y - 1 };
      // gerak sederhana menuju target
      const dx = target.x - g.x;
      const dy = target.y - g.y;
      const d = Math.hypot(dx, dy);
      const sp = 4 * dt;
      if (d <= sp) {
        g.x = target.x; g.y = target.y;
        if (target.y === DOOR.y - 1) {
          g.state = 'active';
          g.dir = { ...LEFT };
          g.tx = g.x - 1; g.ty = g.y;
        }
      } else {
        g.x += (dx / d) * sp;
        g.y += (dy / d) * sp;
      }
      continue;
    }
    if (moveToward(g, speedOf(st, g), dt)) {
      if (g.state === 'eaten' && g.tx === DOOR.x && g.ty === DOOR.y) {
        g.state = 'house';
        g.exitT = 1;
        continue;
      }
      arriveGhost(st, g);
    }
  }

  // tabrakan pemain-hantu
  for (const g of st.ghosts) {
    if (g.state !== 'active') continue;
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d < 0.65) {
      if (st.frightT > 0) {
        g.state = 'eaten';
        const pts = 200 * 2 ** st.eatChain;
        st.eatChain += 1;
        st.score += pts;
      } else {
        st.lives -= 1;
        if (st.lives <= 0) {
          st.over = true;
        } else {
          resetPositions(st);
        }
        break;
      }
    }
  }

  if (st.dotsLeft <= 0 && !st.levelClear) {
    st.levelClear = true;
    st.levelClearT = 2.2;
    st.score += 500;
  }
}
