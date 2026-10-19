/**
 * ArcadeAsteroids — pure game logic (physics, collisions, spawning).
 * Canvas coordinates: world wraps on LW x LH.
 */
import { clamp, TAU, rand } from '../../../engine2d';

export const LW = 390;
export const LH = 620;
export const SHIP_R = 11;
export const BULLET_SPEED = 460;
export const BULLET_LIFE = 1.1;
export const THRUST = 340;
export const TURN_SPEED = 4.6;
export const RESPAWN_T = 2.2;
export const SAUCER_SCORE = 200;

export interface Rock {
  x: number; y: number; vx: number; vy: number; r: number;
  verts: number[]; // radial multipliers for jagged shape
  spin: number; rot: number;
}
export interface Bullet { x: number; y: number; vx: number; vy: number; life: number }
export interface Saucer { x: number; y: number; vx: number; dir: 1 | -1; shootT: number; alive: boolean }

export interface Ship {
  x: number; y: number; vx: number; vy: number; angle: number;
  alive: boolean; invuln: number; thrusting: boolean;
}

export interface AstroState {
  ship: Ship;
  rocks: Rock[];
  bullets: Bullet[];
  saucers: Saucer[];
  saucerBullets: Bullet[];
  level: number;
  score: number;
  lives: number;
  saucerT: number; // countdown to next saucer spawn
  over: boolean;
  shakeKick: number; // set when ship dies, consumed by component
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

export function makeRock(
  x: number, y: number, r: number, speed: number, rng: () => number,
): Rock {
  const a = rng() * TAU;
  const sp = speed * (0.6 + rng() * 0.8);
  const n = 9 + ((rng() * 4) | 0);
  const verts: number[] = [];
  for (let i = 0; i < n; i += 1) verts.push(0.72 + rng() * 0.5);
  return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, verts, spin: (rng() - 0.5) * 1.6, rot: rng() * TAU };
}

export function createState(seed: number): AstroState {
  const rng = mulberry32(seed);
  const st: AstroState = {
    ship: { x: LW / 2, y: LH / 2, vx: 0, vy: 0, angle: -Math.PI / 2, alive: true, invuln: RESPAWN_T, thrusting: false },
    rocks: [], bullets: [], saucers: [], saucerBullets: [],
    level: 1, score: 0, lives: 3, saucerT: 9, over: false, shakeKick: 0,
  };
  spawnLevelRocks(st, rng);
  return st;
}

export function spawnLevelRocks(st: AstroState, rng: () => number): void {
  const n = Math.min(3 + st.level, 9);
  for (let i = 0; i < n; i += 1) {
    // spawn jauh dari kapal
    let x = rng() * LW; let y = rng() * LH; let tries = 0;
    while (Math.hypot(x - st.ship.x, y - st.ship.y) < 130 && tries < 20) {
      x = rng() * LW; y = rng() * LH; tries += 1;
    }
    st.rocks.push(makeRock(x, y, 44, 40 + st.level * 6, rng));
  }
}

function wrap(o: { x: number; y: number }, pad = 0): void {
  if (o.x < -pad) o.x += LW + pad * 2;
  if (o.x > LW + pad) o.x -= LW + pad * 2;
  if (o.y < -pad) o.y += LH + pad * 2;
  if (o.y > LH + pad) o.y -= LH + pad * 2;
}

export function stepShip(
  st: AstroState, dt: number, left: boolean, right: boolean, thrust: boolean,
): void {
  const s = st.ship;
  if (!s.alive) return;
  if (left) s.angle -= TURN_SPEED * dt;
  if (right) s.angle += TURN_SPEED * dt;
  s.thrusting = thrust;
  if (thrust) {
    s.vx += Math.cos(s.angle) * THRUST * dt;
    s.vy += Math.sin(s.angle) * THRUST * dt;
    const sp = Math.hypot(s.vx, s.vy);
    const max = 420;
    if (sp > max) { s.vx = (s.vx / sp) * max; s.vy = (s.vy / sp) * max; }
  }
  // drag ringan
  s.vx *= 1 - 0.12 * dt;
  s.vy *= 1 - 0.12 * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  wrap(s);
  s.invuln = Math.max(0, s.invuln - dt);
}

export function fireBullet(st: AstroState): boolean {
  const s = st.ship;
  if (!s.alive || st.bullets.length >= 6) return false;
  const nx = s.x + Math.cos(s.angle) * (SHIP_R + 6);
  const ny = s.y + Math.sin(s.angle) * (SHIP_R + 6);
  st.bullets.push({
    x: nx, y: ny,
    vx: s.vx + Math.cos(s.angle) * BULLET_SPEED,
    vy: s.vy + Math.sin(s.angle) * BULLET_SPEED,
    life: BULLET_LIFE,
  });
  return true;
}

export function rockScore(r: number): number {
  if (r > 30) return 20;
  if (r > 16) return 50;
  return 100;
}

/** Split rock -> children. Returns children (empty if too small). */
export function splitRock(r: Rock, rng: () => number): Rock[] {
  if (r.r <= 15) return [];
  const kids: Rock[] = [];
  const n = r.r > 30 ? 2 : 2;
  for (let i = 0; i < n; i += 1) {
    kids.push(makeRock(r.x + (rng() - 0.5) * 10, r.y + (rng() - 0.5) * 10, r.r / 2.1, Math.hypot(r.vx, r.vy) + 40, rng));
  }
  return kids;
}

export interface StepEvents {
  rockHit: Rock[];       // rocks destroyed this step (for particles)
  saucerHit: Saucer[];   // saucers destroyed
  shipDied: boolean;
  leveledUp: boolean;
}

export function updateState(st: AstroState, dt: number, rng: () => number): StepEvents {
  const ev: StepEvents = { rockHit: [], saucerHit: [], shipDied: false, leveledUp: false };
  if (st.over) return ev;

  // rocks
  for (const r of st.rocks) {
    r.x += r.vx * dt; r.y += r.vy * dt; wrap(r, r.r); r.rot += r.spin * dt;
  }
  // bullets
  for (const b of st.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.x < 0) b.x += LW; if (b.x > LW) b.x -= LW;
    if (b.y < 0) b.y += LH; if (b.y > LH) b.y -= LH;
  }
  st.bullets = st.bullets.filter((b) => b.life > 0);
  for (const b of st.saucerBullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
  }
  st.saucerBullets = st.saucerBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < LW + 20 && b.y > -20 && b.y < LH + 20);

  // saucers
  for (const sc of st.saucers) {
    sc.x += sc.vx * dt;
    sc.y += Math.sin(sc.x * 0.02) * 30 * dt;
    sc.shootT -= dt;
    if (sc.shootT <= 0 && st.ship.alive) {
      sc.shootT = 1.1 + rng() * 0.8;
      const a = Math.atan2(st.ship.y - sc.y, st.ship.x - sc.x) + (rng() - 0.5) * 0.35;
      st.saucerBullets.push({ x: sc.x, y: sc.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 1.6 });
    }
  }
  st.saucers = st.saucers.filter((sc) => sc.dir === 1 ? sc.x < LW + 40 : sc.x > -40);

  // spawn saucer
  st.saucerT -= dt;
  if (st.saucerT <= 0 && st.rocks.length > 0) {
    st.saucerT = 12 + rng() * 8;
    const dir = rng() < 0.5 ? 1 : -1;
    st.saucers.push({ x: dir === 1 ? -30 : LW + 30, y: 60 + rng() * (LH * 0.5), vx: dir * (90 + st.level * 10), dir, shootT: 1.2, alive: true });
  }

  // bullet vs rock / saucer
  const deadRocks = new Set<Rock>();
  const deadSaucers = new Set<Saucer>();
  const usedBullets = new Set<Bullet>();
  for (const b of st.bullets) {
    for (const r of st.rocks) {
      if (deadRocks.has(r)) continue;
      if (Math.hypot(b.x - r.x, b.y - r.y) < r.r * 0.95) {
        deadRocks.add(r); usedBullets.add(b);
        st.score += rockScore(r.r);
        ev.rockHit.push(r);
        for (const k of splitRock(r, rng)) st.rocks.push(k);
        break;
      }
    }
    if (usedBullets.has(b)) continue;
    for (const sc of st.saucers) {
      if (Math.hypot(b.x - sc.x, b.y - sc.y) < 22) {
        deadSaucers.add(sc); usedBullets.add(b);
        st.score += SAUCER_SCORE;
        ev.saucerHit.push(sc);
        break;
      }
    }
  }
  st.bullets = st.bullets.filter((b) => !usedBullets.has(b));
  st.rocks = st.rocks.filter((r) => !deadRocks.has(r));
  st.saucers = st.saucers.filter((sc) => !deadSaucers.has(sc));

  // ship collisions
  const s = st.ship;
  if (s.alive && s.invuln <= 0) {
    let hit = false;
    for (const r of st.rocks) {
      if (Math.hypot(s.x - r.x, s.y - r.y) < r.r * 0.85 + SHIP_R * 0.7) { hit = true; break; }
    }
    if (!hit) {
      for (const sc of st.saucers) {
        if (Math.hypot(s.x - sc.x, s.y - sc.y) < 24) { hit = true; deadSaucers.add(sc); break; }
      }
    }
    if (!hit) {
      for (const b of st.saucerBullets) {
        if (Math.hypot(s.x - b.x, s.y - b.y) < SHIP_R) { hit = true; break; }
      }
    }
    if (hit) {
      s.alive = false;
      ev.shipDied = true;
      st.lives -= 1;
      st.shakeKick = 1;
    }
  }

  // respawn
  if (!s.alive && st.lives > 0) {
    s.x = LW / 2; s.y = LH / 2; s.vx = 0; s.vy = 0; s.angle = -Math.PI / 2;
    s.alive = true; s.invuln = RESPAWN_T;
  }
  if (st.lives <= 0) st.over = true;

  // level up
  if (st.rocks.length === 0 && st.saucers.length === 0 && !st.over) {
    st.level += 1;
    spawnLevelRocks(st, rng);
    ev.leveledUp = true;
  }
  return ev;
}

export const __priv = { clamp, rand };
