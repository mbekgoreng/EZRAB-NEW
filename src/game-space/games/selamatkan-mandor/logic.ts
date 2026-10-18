/**
 * Selamatkan Mandor — pure game logic (no DOM, no window).
 * Save-the-dog style: falling objects, player draws one polyline shield,
 * foreman must survive the level timer.
 */

export type FallKind = 'bata' | 'palu' | 'ember';

export interface Vec {
  x: number;
  y: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: FallKind;
  rot: number;
  spin: number;
  landed: boolean;
  landT: number;
}

export interface SpawnEvent {
  /** seconds after level start */
  at: number;
  /** x position (fraction of width 0..1, converted with W) */
  xf: number;
  kind: FallKind;
  /** initial fall speed px/s */
  vy0: number;
}

export interface LevelDef {
  name: string;
  sub: string;
  /** level duration in seconds */
  duration: number;
  /** total drawable line length in px */
  ink: number;
  gravity: number;
  spawns: SpawnEvent[];
}

export const KIND_R: Record<FallKind, number> = { bata: 15, palu: 17, ember: 19 };
export const KIND_NAME: Record<FallKind, string> = {
  bata: 'bata',
  palu: 'palu',
  ember: 'ember semen',
};

/** 15 data-driven levels. */
export const LEVELS: LevelDef[] = [
  {
    name: 'Apel Pagi',
    sub: 'Satu bata nyasar. Gambar garis di atas helm mandor.',
    duration: 10, ink: 420, gravity: 1300,
    spawns: [
      { at: 1.5, xf: 0.5, kind: 'bata', vy0: 120 },
      { at: 4.5, xf: 0.42, kind: 'bata', vy0: 120 },
      { at: 7.0, xf: 0.58, kind: 'bata', vy0: 120 },
    ],
  },
  {
    name: 'Shift Pagi',
    sub: 'Bata mulai berani jatuh lebih cepat.',
    duration: 12, ink: 440, gravity: 1350,
    spawns: [
      { at: 1.0, xf: 0.5, kind: 'bata', vy0: 150 },
      { at: 3.5, xf: 0.38, kind: 'bata', vy0: 150 },
      { at: 6.0, xf: 0.62, kind: 'bata', vy0: 150 },
      { at: 8.5, xf: 0.5, kind: 'bata', vy0: 170 },
    ],
  },
  {
    name: 'Tukang Lupa Helm',
    sub: 'Dua bata sekaligus. Untung mandor pakai helm.',
    duration: 13, ink: 460, gravity: 1400,
    spawns: [
      { at: 1.0, xf: 0.5, kind: 'bata', vy0: 160 },
      { at: 2.5, xf: 0.35, kind: 'bata', vy0: 160 },
      { at: 4.0, xf: 0.65, kind: 'bata', vy0: 160 },
      { at: 6.5, xf: 0.5, kind: 'bata', vy0: 190 },
      { at: 8.5, xf: 0.42, kind: 'bata', vy0: 190 },
      { at: 10.5, xf: 0.58, kind: 'bata', vy0: 190 },
    ],
  },
  {
    name: 'Palu Terbang',
    sub: 'Hati-hati: palu memantul lebih liar dari bata.',
    duration: 14, ink: 480, gravity: 1450,
    spawns: [
      { at: 1.0, xf: 0.5, kind: 'bata', vy0: 170 },
      { at: 3.0, xf: 0.5, kind: 'palu', vy0: 150 },
      { at: 5.5, xf: 0.38, kind: 'bata', vy0: 190 },
      { at: 7.5, xf: 0.62, kind: 'palu', vy0: 160 },
      { at: 10.0, xf: 0.5, kind: 'bata', vy0: 200 },
      { at: 11.5, xf: 0.45, kind: 'bata', vy0: 200 },
    ],
  },
  {
    name: 'Cor-Coran',
    sub: 'Ember semen ikutan jatuh. Berat, bro.',
    duration: 15, ink: 500, gravity: 1500,
    spawns: [
      { at: 1.0, xf: 0.5, kind: 'ember', vy0: 140 },
      { at: 3.5, xf: 0.4, kind: 'bata', vy0: 190 },
      { at: 5.0, xf: 0.6, kind: 'bata', vy0: 190 },
      { at: 7.5, xf: 0.5, kind: 'palu', vy0: 170 },
      { at: 9.5, xf: 0.42, kind: 'ember', vy0: 150 },
      { at: 12.0, xf: 0.58, kind: 'bata', vy0: 210 },
    ],
  },
  {
    name: 'Angin Kencang',
    sub: 'Material jatuh dari kiri-kanan. Perlebar atap spidolmu.',
    duration: 15, ink: 520, gravity: 1550,
    spawns: [
      { at: 1.0, xf: 0.3, kind: 'bata', vy0: 180 },
      { at: 2.5, xf: 0.7, kind: 'bata', vy0: 180 },
      { at: 4.5, xf: 0.5, kind: 'palu', vy0: 170 },
      { at: 6.5, xf: 0.25, kind: 'ember', vy0: 150 },
      { at: 8.5, xf: 0.75, kind: 'bata', vy0: 200 },
      { at: 10.5, xf: 0.5, kind: 'bata', vy0: 210 },
      { at: 12.5, xf: 0.4, kind: 'palu', vy0: 180 },
    ],
  },
  {
    name: 'Lembur',
    sub: 'Durasi lebih lama. Stamina spidol diuji.',
    duration: 18, ink: 540, gravity: 1600,
    spawns: [
      { at: 1.0, xf: 0.5, kind: 'bata', vy0: 190 },
      { at: 3.0, xf: 0.38, kind: 'bata', vy0: 190 },
      { at: 5.0, xf: 0.62, kind: 'palu', vy0: 175 },
      { at: 7.0, xf: 0.5, kind: 'ember', vy0: 155 },
      { at: 9.5, xf: 0.35, kind: 'bata', vy0: 210 },
      { at: 11.0, xf: 0.65, kind: 'bata', vy0: 210 },
      { at: 13.5, xf: 0.5, kind: 'palu', vy0: 185 },
      { at: 15.5, xf: 0.45, kind: 'bata', vy0: 220 },
    ],
  },
  {
    name: 'Mandor Galak Datang',
    sub: 'Semua orang panik. Material jatuh makin ngawur.',
    duration: 18, ink: 540, gravity: 1650,
    spawns: [
      { at: 0.8, xf: 0.5, kind: 'ember', vy0: 160 },
      { at: 2.5, xf: 0.32, kind: 'palu', vy0: 180 },
      { at: 4.0, xf: 0.68, kind: 'palu', vy0: 180 },
      { at: 6.0, xf: 0.5, kind: 'bata', vy0: 215 },
      { at: 7.5, xf: 0.42, kind: 'bata', vy0: 215 },
      { at: 9.0, xf: 0.58, kind: 'ember', vy0: 165 },
      { at: 11.5, xf: 0.5, kind: 'palu', vy0: 190 },
      { at: 13.5, xf: 0.38, kind: 'bata', vy0: 225 },
      { at: 15.5, xf: 0.62, kind: 'bata', vy0: 225 },
    ],
  },
  {
    name: 'Hujan Deras',
    sub: 'Licin! Benda jatuh lebih cepat dari biasanya.',
    duration: 19, ink: 560, gravity: 1800,
    spawns: [
      { at: 0.8, xf: 0.5, kind: 'bata', vy0: 230 },
      { at: 2.2, xf: 0.4, kind: 'bata', vy0: 230 },
      { at: 3.8, xf: 0.6, kind: 'palu', vy0: 205 },
      { at: 5.5, xf: 0.5, kind: 'ember', vy0: 180 },
      { at: 7.5, xf: 0.35, kind: 'bata', vy0: 240 },
      { at: 9.0, xf: 0.65, kind: 'bata', vy0: 240 },
      { at: 11.0, xf: 0.5, kind: 'palu', vy0: 210 },
      { at: 13.0, xf: 0.45, kind: 'ember', vy0: 185 },
      { at: 15.0, xf: 0.55, kind: 'bata', vy0: 250 },
      { at: 16.8, xf: 0.5, kind: 'bata', vy0: 250 },
    ],
  },
  {
    name: 'Audit Mendadak',
    sub: 'Konsultan datang bawa palu. Entah kenapa.',
    duration: 20, ink: 560, gravity: 1850,
    spawns: [
      { at: 0.7, xf: 0.5, kind: 'palu', vy0: 200 },
      { at: 2.0, xf: 0.38, kind: 'palu', vy0: 200 },
      { at: 3.5, xf: 0.62, kind: 'palu', vy0: 200 },
      { at: 5.2, xf: 0.5, kind: 'bata', vy0: 240 },
      { at: 7.0, xf: 0.3, kind: 'ember', vy0: 185 },
      { at: 8.8, xf: 0.7, kind: 'ember', vy0: 185 },
      { at: 10.8, xf: 0.5, kind: 'bata', vy0: 250 },
      { at: 12.5, xf: 0.42, kind: 'palu', vy0: 215 },
      { at: 14.5, xf: 0.58, kind: 'palu', vy0: 215 },
      { at: 16.5, xf: 0.5, kind: 'ember', vy0: 190 },
      { at: 18.0, xf: 0.45, kind: 'bata', vy0: 255 },
    ],
  },
  {
    name: 'Deadline Mepet',
    sub: 'Semua material turun sekaligus. Gambar atap yang kokoh!',
    duration: 20, ink: 580, gravity: 1900,
    spawns: [
      { at: 0.6, xf: 0.5, kind: 'ember', vy0: 185 },
      { at: 1.5, xf: 0.35, kind: 'bata', vy0: 245 },
      { at: 1.5, xf: 0.65, kind: 'bata', vy0: 245 },
      { at: 3.2, xf: 0.5, kind: 'palu', vy0: 215 },
      { at: 4.8, xf: 0.4, kind: 'bata', vy0: 250 },
      { at: 4.8, xf: 0.6, kind: 'bata', vy0: 250 },
      { at: 6.8, xf: 0.3, kind: 'ember', vy0: 190 },
      { at: 6.8, xf: 0.7, kind: 'ember', vy0: 190 },
      { at: 9.0, xf: 0.5, kind: 'palu', vy0: 220 },
      { at: 10.8, xf: 0.45, kind: 'bata', vy0: 255 },
      { at: 12.5, xf: 0.55, kind: 'bata', vy0: 255 },
      { at: 14.5, xf: 0.38, kind: 'palu', vy0: 225 },
      { at: 16.2, xf: 0.62, kind: 'ember', vy0: 195 },
      { at: 18.0, xf: 0.5, kind: 'bata', vy0: 260 },
    ],
  },
  {
    name: 'Proyek Tetangga Iri',
    sub: 'Mereka melempar material dari samping juga.',
    duration: 21, ink: 580, gravity: 1950,
    spawns: [
      { at: 0.6, xf: 0.28, kind: 'bata', vy0: 245 },
      { at: 1.4, xf: 0.72, kind: 'bata', vy0: 245 },
      { at: 2.6, xf: 0.5, kind: 'palu', vy0: 220 },
      { at: 4.2, xf: 0.38, kind: 'ember', vy0: 190 },
      { at: 5.8, xf: 0.62, kind: 'ember', vy0: 190 },
      { at: 7.5, xf: 0.5, kind: 'bata', vy0: 255 },
      { at: 9.0, xf: 0.32, kind: 'palu', vy0: 225 },
      { at: 10.5, xf: 0.68, kind: 'palu', vy0: 225 },
      { at: 12.5, xf: 0.5, kind: 'ember', vy0: 195 },
      { at: 14.0, xf: 0.42, kind: 'bata', vy0: 260 },
      { at: 15.5, xf: 0.58, kind: 'bata', vy0: 260 },
      { at: 17.5, xf: 0.5, kind: 'palu', vy0: 230 },
      { at: 19.0, xf: 0.45, kind: 'ember', vy0: 200 },
    ],
  },
  {
    name: 'Revisi Ke-13',
    sub: 'Klien revisi, mandor yang kena getahnya. Klasik.',
    duration: 22, ink: 600, gravity: 2000,
    spawns: [
      { at: 0.5, xf: 0.5, kind: 'bata', vy0: 250 },
      { at: 1.6, xf: 0.35, kind: 'palu', vy0: 225 },
      { at: 2.8, xf: 0.65, kind: 'palu', vy0: 225 },
      { at: 4.2, xf: 0.5, kind: 'ember', vy0: 195 },
      { at: 5.8, xf: 0.3, kind: 'bata', vy0: 260 },
      { at: 7.2, xf: 0.7, kind: 'bata', vy0: 260 },
      { at: 9.0, xf: 0.45, kind: 'ember', vy0: 200 },
      { at: 10.5, xf: 0.55, kind: 'palu', vy0: 230 },
      { at: 12.2, xf: 0.5, kind: 'bata', vy0: 265 },
      { at: 13.8, xf: 0.38, kind: 'bata', vy0: 265 },
      { at: 15.2, xf: 0.62, kind: 'ember', vy0: 205 },
      { at: 17.0, xf: 0.5, kind: 'palu', vy0: 235 },
      { at: 18.8, xf: 0.42, kind: 'bata', vy0: 270 },
      { at: 20.2, xf: 0.58, kind: 'bata', vy0: 270 },
    ],
  },
  {
    name: 'Badai PHK',
    sub: 'Semua orang melempar barang. Selamatkan satu-satunya mandor setia.',
    duration: 23, ink: 600, gravity: 2100,
    spawns: [
      { at: 0.5, xf: 0.5, kind: 'ember', vy0: 200 },
      { at: 1.3, xf: 0.3, kind: 'bata', vy0: 260 },
      { at: 2.1, xf: 0.7, kind: 'bata', vy0: 260 },
      { at: 3.0, xf: 0.5, kind: 'palu', vy0: 235 },
      { at: 4.2, xf: 0.4, kind: 'palu', vy0: 235 },
      { at: 5.4, xf: 0.6, kind: 'ember', vy0: 205 },
      { at: 6.8, xf: 0.35, kind: 'bata', vy0: 270 },
      { at: 8.2, xf: 0.65, kind: 'bata', vy0: 270 },
      { at: 9.6, xf: 0.5, kind: 'ember', vy0: 210 },
      { at: 11.0, xf: 0.42, kind: 'palu', vy0: 240 },
      { at: 12.4, xf: 0.58, kind: 'palu', vy0: 240 },
      { at: 14.0, xf: 0.5, kind: 'bata', vy0: 275 },
      { at: 15.6, xf: 0.33, kind: 'ember', vy0: 215 },
      { at: 17.2, xf: 0.67, kind: 'ember', vy0: 215 },
      { at: 18.8, xf: 0.5, kind: 'palu', vy0: 245 },
      { at: 20.4, xf: 0.45, kind: 'bata', vy0: 280 },
      { at: 21.8, xf: 0.55, kind: 'bata', vy0: 280 },
    ],
  },
  {
    name: 'Serah Terima',
    sub: 'Level terakhir. Bertahanlah demi berita acara yang mulus.',
    duration: 25, ink: 620, gravity: 2150,
    spawns: [
      { at: 0.5, xf: 0.5, kind: 'bata', vy0: 260 },
      { at: 1.2, xf: 0.32, kind: 'palu', vy0: 240 },
      { at: 2.0, xf: 0.68, kind: 'palu', vy0: 240 },
      { at: 3.0, xf: 0.5, kind: 'ember', vy0: 210 },
      { at: 4.0, xf: 0.4, kind: 'bata', vy0: 270 },
      { at: 5.0, xf: 0.6, kind: 'bata', vy0: 270 },
      { at: 6.2, xf: 0.3, kind: 'ember', vy0: 215 },
      { at: 7.4, xf: 0.7, kind: 'ember', vy0: 215 },
      { at: 8.8, xf: 0.5, kind: 'palu', vy0: 245 },
      { at: 10.2, xf: 0.42, kind: 'bata', vy0: 275 },
      { at: 11.6, xf: 0.58, kind: 'bata', vy0: 275 },
      { at: 13.0, xf: 0.35, kind: 'palu', vy0: 250 },
      { at: 14.4, xf: 0.65, kind: 'palu', vy0: 250 },
      { at: 16.0, xf: 0.5, kind: 'ember', vy0: 220 },
      { at: 17.6, xf: 0.45, kind: 'bata', vy0: 280 },
      { at: 19.2, xf: 0.55, kind: 'bata', vy0: 280 },
      { at: 20.8, xf: 0.5, kind: 'palu', vy0: 255 },
      { at: 22.4, xf: 0.4, kind: 'ember', vy0: 225 },
      { at: 23.8, xf: 0.6, kind: 'bata', vy0: 285 },
    ],
  },
];

/* ---------------- state ---------------- */

export type PlayStatus = 'play' | 'win' | 'dead';

export interface ThudEvent {
  x: number;
  y: number;
  strength: number;
}

export interface MandorState {
  W: number;
  H: number;
  level: LevelDef;
  levelIndex: number;
  time: number;
  bodies: Body[];
  line: Vec[];
  inkMax: number;
  inkUsed: number;
  spawnIdx: number;
  status: PlayStatus;
  foreman: { x: number; y: number; r: number };
  groundY: number;
  /** events for the UI layer: sfx + particles (consumed each frame) */
  thuds: ThudEvent[];
  hits: Vec[];
  lands: Vec[];
}

export function foremanPos(W: number, H: number): { x: number; y: number; r: number } {
  const groundY = H - 64;
  return { x: W / 2, y: groundY - 26, r: 20 };
}

export function createState(levelIndex: number, W: number, H: number): MandorState {
  const level = LEVELS[levelIndex];
  const groundY = H - 64;
  return {
    W, H,
    level,
    levelIndex,
    time: 0,
    bodies: [],
    line: [],
    inkMax: level.ink,
    inkUsed: 0,
    spawnIdx: 0,
    status: 'play',
    foreman: foremanPos(W, H),
    groundY,
    thuds: [],
    hits: [],
    lands: [],
  };
}

export function lineLength(pts: Vec[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i += 1) {
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return L;
}

/**
 * Replace the drawn line. Points beyond the ink budget are trimmed;
 * only the affordable prefix is kept.
 */
export function setLine(state: MandorState, pts: Vec[]): void {
  const kept: Vec[] = [];
  let used = 0;
  for (const p of pts) {
    if (kept.length === 0) {
      kept.push(p);
      continue;
    }
    const prev = kept[kept.length - 1];
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (used + d > state.inkMax) {
      // partial segment: extend as far as the remaining ink allows
      const remain = state.inkMax - used;
      if (remain > 0.5 && d > 0) {
        const t = remain / d;
        kept.push({ x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t });
        used = state.inkMax;
      }
      break;
    }
    kept.push(p);
    used += d;
  }
  state.line = kept;
  state.inkUsed = used;
}

/** Erase the line; ink is fully refunded. */
export function clearLine(state: MandorState): void {
  state.line = [];
  state.inkUsed = 0;
}

export function inkLeft(state: MandorState): number {
  return Math.max(0, state.inkMax - state.inkUsed);
}

/* ---------------- physics ---------------- */

const BOUNCE_DAMPING = 0.6;

function distToSegmentInfo(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { d: number; nx: number; ny: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  const d = Math.hypot(px - cx, py - cy);
  let nx = 0;
  let ny = -1;
  if (d > 1e-6) {
    nx = (px - cx) / d;
    ny = (py - cy) / d;
  }
  return { d, nx, ny };
}

function spawnBody(state: MandorState, ev: SpawnEvent): void {
  state.bodies.push({
    x: ev.xf * state.W,
    y: -KIND_R[ev.kind] - 4,
    vx: 0,
    vy: ev.vy0,
    r: KIND_R[ev.kind],
    kind: ev.kind,
    rot: 0,
    spin: (ev.xf - 0.5) * 4,
    landed: false,
    landT: 0,
  });
}

function collideBodyWithLine(state: MandorState, b: Body): void {
  const pts = state.line;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const c = pts[i];
    const { d, nx, ny } = distToSegmentInfo(b.x, b.y, a.x, a.y, c.x, c.y);
    if (d < b.r) {
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx = (b.vx - 2 * vn * nx) * BOUNCE_DAMPING;
        b.vy = (b.vy - 2 * vn * ny) * BOUNCE_DAMPING;
        state.thuds.push({
          x: b.x - nx * b.r,
          y: b.y - ny * b.r,
          strength: Math.min(1, Math.abs(vn) / 600),
        });
      }
      // push out so it doesn't sink into the line
      const push = b.r - d + 0.5;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
}

function physicsSubstep(state: MandorState, dt: number): void {
  const g = state.level.gravity;
  for (const b of state.bodies) {
    if (b.landed) {
      b.landT += dt;
      continue;
    }
    b.vy += g * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.spin * dt;

    // side walls: soft bounce
    if (b.x < b.r) {
      b.x = b.r;
      b.vx = Math.abs(b.vx) * BOUNCE_DAMPING;
    } else if (b.x > state.W - b.r) {
      b.x = state.W - b.r;
      b.vx = -Math.abs(b.vx) * BOUNCE_DAMPING;
    }

    collideBodyWithLine(state, b);

    // foreman hit?
    const f = state.foreman;
    const df = Math.hypot(b.x - f.x, b.y - f.y);
    if (df < b.r + f.r - 2) {
      state.status = 'dead';
      state.hits.push({ x: f.x, y: f.y - f.r });
      return;
    }

    // ground: land (harmless) or already covered by foreman check
    if (b.y + b.r >= state.groundY) {
      b.y = state.groundY - b.r;
      b.landed = true;
      b.landT = 0;
      state.lands.push({ x: b.x, y: state.groundY });
    }
  }
  // drop long-landed debris
  state.bodies = state.bodies.filter((b) => !b.landed || b.landT < 1.2);
}

/** Advance the simulation. Pure: mutates the passed state only. */
export function step(state: MandorState, dt: number): void {
  if (state.status !== 'play') return;
  state.thuds.length = 0;
  state.hits.length = 0;
  state.lands.length = 0;

  state.time += dt;

  // spawn due events
  const spawns = state.level.spawns;
  while (state.spawnIdx < spawns.length && spawns[state.spawnIdx].at <= state.time) {
    spawnBody(state, spawns[state.spawnIdx]);
    state.spawnIdx += 1;
  }

  // substep so fast bodies can't tunnel through the line
  let maxV = 0;
  for (const b of state.bodies) {
    maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
  }
  const maxStep = Math.max(1, Math.ceil((maxV * dt) / 8));
  const sub = Math.min(8, maxStep);
  const sdt = dt / sub;
  for (let i = 0; i < sub; i += 1) {
    physicsSubstep(state, sdt);
    if (state.status !== 'play') break;
  }

  if (state.status === 'play' && state.time >= state.level.duration) {
    state.status = 'win';
  }
}

/** Stars earned: more leftover ink = better (1..3). */
export function starsFor(state: MandorState): number {
  const frac = inkLeft(state) / state.inkMax;
  if (frac >= 0.5) return 3;
  if (frac >= 0.22) return 2;
  return 1;
}

/** Reset a state for replay of the same level/dimensions. */
export function resetState(state: MandorState): void {
  const fresh = createState(state.levelIndex, state.W, state.H);
  Object.assign(state, fresh);
}
