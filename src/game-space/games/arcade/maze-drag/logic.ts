/**
 * Maze Drag — logika murni (generasi labirin, tabrakan, checkpoint).
 * Bola diseret pointer; menabrak dinding dengan kecepatan tinggi
 * (pointerSpeed > SLAM_SPEED) = kembali ke checkpoint terakhir.
 */

export type Rand = () => number;

export interface Cell {
  c: number;
  r: number;
}

export interface Maze {
  cols: number;
  rows: number;
  /** 1 = dinding, 0 = jalan */
  cells: Uint8Array;
  start: Cell;
  goal: Cell;
  /** BFS shortest path start -> goal */
  path: Cell[];
  /** subset path sebagai checkpoint */
  checkpoints: Cell[];
}

/** Kecepatan pointer (px/detik) di atas ini saat menyentuh dinding = slam. */
export const SLAM_SPEED = 240;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idx = (m: Maze, c: number, r: number): number => r * m.cols + c;

export function isWall(m: Maze, c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return true;
  return m.cells[idx(m, c, r)] === 1;
}

/** Ukuran labirin untuk level n (1-based): 5,7,9,...,19 ganjil. */
export function mazeSizeForLevel(level: number): { cols: number; rows: number } {
  const n = Math.min(19, 5 + (Math.max(1, level) - 1) * 2);
  const odd = n % 2 === 1 ? n : n + 1;
  return { cols: odd, rows: odd };
}

/** Recursive-backtracker (iteratif). Selalu solvable: start (1,1) -> goal (cols-2, rows-2). */
export function generateMaze(colsIn: number, rowsIn: number, rand: Rand): Maze {
  const cols = colsIn % 2 === 1 ? colsIn : colsIn + 1;
  const rows = rowsIn % 2 === 1 ? rowsIn : rowsIn + 1;
  const cells = new Uint8Array(cols * rows).fill(1);
  const m: Maze = {
    cols,
    rows,
    cells,
    start: { c: 1, r: 1 },
    goal: { c: cols - 2, r: rows - 2 },
    path: [],
    checkpoints: [],
  };
  const carve = (c: number, r: number): void => {
    m.cells[idx(m, c, r)] = 0;
  };
  carve(1, 1);
  const stack: Cell[] = [{ c: 1, r: 1 }];
  const dirs: Cell[] = [
    { c: 2, r: 0 },
    { c: -2, r: 0 },
    { c: 0, r: 2 },
    { c: 0, r: -2 },
  ];
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const opts: Cell[] = [];
    for (const d of dirs) {
      const nc = cur.c + d.c;
      const nr = cur.r + d.r;
      if (nc > 0 && nr > 0 && nc < cols - 1 && nr < rows - 1 && isWall(m, nc, nr)) {
        opts.push(d);
      }
    }
    if (opts.length === 0) {
      stack.pop();
      continue;
    }
    const d = opts[Math.floor(rand() * opts.length)];
    carve(cur.c + d.c / 2, cur.r + d.r / 2);
    carve(cur.c + d.c, cur.r + d.r);
    stack.push({ c: cur.c + d.c, r: cur.r + d.r });
  }
  m.path = bfsPath(m);
  // checkpoint: titik 1/3 dan 2/3 dari path (unik, bukan start/goal)
  const picks = new Set<number>();
  for (const f of [0.34, 0.67]) {
    const i = Math.min(m.path.length - 2, Math.max(1, Math.floor(m.path.length * f)));
    if (m.path[i] && !picks.has(i)) {
      picks.add(i);
      m.checkpoints.push(m.path[i]);
    }
  }
  return m;
}

/** BFS shortest path start -> goal. */
export function bfsPath(m: Maze): Cell[] {
  const prev = new Int32Array(m.cols * m.rows).fill(-1);
  const q: number[] = [idx(m, m.start.c, m.start.r)];
  prev[q[0]] = q[0];
  const gi = idx(m, m.goal.c, m.goal.r);
  const dc = [1, -1, 0, 0];
  const dr = [0, 0, 1, -1];
  while (q.length > 0) {
    const cur = q.shift() as number;
    if (cur === gi) break;
    const cc = cur % m.cols;
    const cr = Math.floor(cur / m.cols);
    for (let k = 0; k < 4; k += 1) {
      const nc = cc + dc[k];
      const nr = cr + dr[k];
      if (nc < 0 || nr < 0 || nc >= m.cols || nr >= m.rows) continue;
      const ni = nr * m.cols + nc;
      if (prev[ni] !== -1 || m.cells[ni] === 1) continue;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  const path: Cell[] = [];
  if (prev[gi] === -1) return path;
  let cur = gi;
  while (cur !== prev[cur]) {
    path.push({ c: cur % m.cols, r: Math.floor(cur / m.cols) });
    cur = prev[cur];
  }
  path.push(m.start);
  return path.reverse();
}

export function cellCenter(m: Maze, cellSize: number, c: Cell): { x: number; y: number } {
  return { x: (c.c + 0.5) * cellSize, y: (c.r + 0.5) * cellSize };
}

/**
 * Dorong lingkaran keluar dari sel dinding yang tumpang tindih.
 * Mengembalikan posisi terkoreksi + apakah menyentuh dinding.
 */
export function collideWalls(
  m: Maze,
  cellSize: number,
  x: number,
  y: number,
  r: number,
): { x: number; y: number; hit: boolean } {
  const minX = r;
  const maxX = m.cols * cellSize - r;
  const minY = r;
  const maxY = m.rows * cellSize - r;
  let px = x;
  let py = y;
  let hit = false;
  for (let iter = 0; iter < 3; iter += 1) {
    const c0 = Math.max(0, Math.floor((px - r) / cellSize));
    const c1 = Math.min(m.cols - 1, Math.floor((px + r) / cellSize));
    const r0 = Math.max(0, Math.floor((py - r) / cellSize));
    const r1 = Math.min(m.rows - 1, Math.floor((py + r) / cellSize));
    for (let cc = c0; cc <= c1; cc += 1) {
      for (let rr = r0; rr <= r1; rr += 1) {
        if (!isWall(m, cc, rr)) continue;
        const rx = cc * cellSize;
        const ry = rr * cellSize;
        const nx = Math.max(rx, Math.min(px, rx + cellSize));
        const ny = Math.max(ry, Math.min(py, ry + cellSize));
        const dx = px - nx;
        const dy = py - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 < 1e-9) {
          // pusat tepat di dalam sel: dorong ke sisi terdekat yang VALID
          // (tetap di dalam batas labirin — border selalu dinding).
          const cands: Array<[number, number]> = [
            [rx - r, py],
            [rx + cellSize + r, py],
            [px, ry - r],
            [px, ry + cellSize + r],
          ].filter(
            ([cx, cy]) => cx >= minX && cx <= maxX && cy >= minY && cy <= maxY,
          ) as Array<[number, number]>;
          if (cands.length > 0) {
            let best = cands[0];
            let bd = (best[0] - px) ** 2 + (best[1] - py) ** 2;
            for (const cd of cands) {
              const dd = (cd[0] - px) ** 2 + (cd[1] - py) ** 2;
              if (dd < bd) {
                bd = dd;
                best = cd;
              }
            }
            [px, py] = best;
          }
        } else {
          const d = Math.sqrt(d2);
          px = nx + (dx / d) * r;
          py = ny + (dy / d) * r;
        }
      }
    }
  }
  // batas keras: bola tidak pernah keluar labirin.
  // Menyentuh/melewati batas = kontak dinding (border selalu dinding).
  if (px < minX || px > maxX || py < minY || py > maxY) hit = true;
  px = Math.max(minX, Math.min(maxX, px));
  py = Math.max(minY, Math.min(maxY, py));
  return { x: px, y: py, hit };
}

export interface MoveResult {
  x: number;
  y: number;
  hit: boolean;
  /** true bila menabrak dinding dengan kecepatan pointer tinggi */
  slammed: boolean;
}

/**
 * Gerakkan bola menuju target pointer (lerp halus), lalu selesaikan tabrakan.
 * pointerSpeed = kecepatan pointer px/detik (untuk deteksi slam).
 */
export function moveBall(
  m: Maze,
  cellSize: number,
  x: number,
  y: number,
  tx: number,
  ty: number,
  r: number,
  dt: number,
  pointerSpeed: number,
): MoveResult {
  const k = Math.min(1, 14 * dt);
  const nx = x + (tx - x) * k;
  const ny = y + (ty - y) * k;
  const res = collideWalls(m, cellSize, nx, ny, r);
  const slammed = res.hit && pointerSpeed > SLAM_SPEED;
  return { x: res.x, y: res.y, hit: res.hit, slammed };
}

/** Jarak Euclidean. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
