/**
 * Ketapel Konstruksi — pure game logic (Angry-Birds-like 2D).
 * NO DOM / window / Math.random here. RNG disuntik dari luar bila perlu.
 *
 * Satuan: design px, world 900x700, ground y = 620.
 * tsx me-render dengan skala s = W/900 dan memetakan input balik /s.
 */

export const WORLD_W = 900;
export const WORLD_H = 700;
export const GROUND_Y = 620;
export const GRAV = 1500; // px/s^2
export const BALL_R = 22;
export const DRAG_MAX = 150; // radius tarik maksimum (design px)
export const LAUNCH_POWER = 7.4; // kecepatan = jarakTarik * power
export const PREDICT_STEPS = 26;
export const PREDICT_DT = 1 / 22;

export type Mat = 'kayu' | 'kaca' | 'bata' | 'beton' | 'berkas';

export const MAT_HP: Record<Mat, number> = {
  kayu: 1,
  kaca: 1,
  bata: 2,
  beton: 3,
  berkas: 1,
};

export const MAT_SCORE: Record<Mat, number> = {
  kayu: 60,
  kaca: 80,
  bata: 120,
  beton: 200,
  berkas: 300,
};

export interface BlockDef {
  mat: Mat;
  x: number; // kiri-atas (design px)
  y: number;
  w: number;
  h: number;
}

export interface Block extends BlockDef {
  id: number;
  hp: number;
  vx: number;
  vy: number;
  angle: number; // visual tilt saat mental
  va: number;
  dead: boolean;
  grounded: boolean;
  /** cegah damage ganda dari satu bola */
  lastHitBy: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flying: boolean;
  dead: boolean;
  age: number;
  flightId: number;
}

export interface Level {
  name: string;
  tagline: string;
  balls: number;
  sling: { x: number; y: number };
  anchorX: number;
  defs: BlockDef[];
}

/** Event untuk juice di tsx (sfx/partikel/popup). */
export type KEvent =
  | { type: 'ballHit'; blockId: number; mat: Mat; x: number; y: number; hard: boolean }
  | { type: 'blockBreak'; mat: Mat; x: number; y: number; w: number; h: number }
  | { type: 'blockLand'; x: number; y: number; w: number; hard: boolean }
  | { type: 'launch'; x: number; y: number }
  | { type: 'ballDead' };

/* ------------------------------------------------------------------ */
/* Level builder DSL                                                    */
/* ------------------------------------------------------------------ */

let nextId = 1;
function B(mat: Mat, x: number, y: number, w: number, h: number): BlockDef {
  return { mat, x, y, w, h };
}

/**
 * Menara kolom: mats dari bawah ke atas, tinggi per blok dari MAT_COL_H.
 * Mengembalikan defs, dasar di baseY (bawah), kolom di cx (tengah).
 */
const COL_H: Record<Mat, number> = { kayu: 96, kaca: 96, bata: 76, beton: 84, berkas: 56 };
const COL_W = 30;

function tower(cx: number, baseY: number, mats: Mat[]): BlockDef[] {
  const out: BlockDef[] = [];
  let y = baseY;
  for (const m of mats) {
    const h = COL_H[m];
    y -= h;
    const w = m === 'berkas' ? 46 : COL_W;
    out.push(B(m, cx - w / 2, y, w, h));
  }
  return out;
}

/** Papan horizontal di atas dua kolom. */
function cap(x1: number, x2: number, yTop: number, mat: Mat, h = 26): BlockDef {
  return B(mat, x1, yTop, x2 - x1, h);
}

function L(name: string, tagline: string, balls: number, anchorX: number, defs: BlockDef[]): Level {
  return { name, tagline, balls, sling: { x: 150, y: 452 }, anchorX, defs };
}

export const LEVELS: Level[] = (() => {
  const g = GROUND_Y;
  const lv: Level[] = [];

  // L1 — pemanasan: 2 kolom kayu + berkas di atas papan
  {
    const a = 620;
    const t1 = tower(a - 55, g, ['kayu', 'kayu']);
    const t2 = tower(a + 55, g, ['kayu', 'kayu']);
    const topY = g - 96 * 2;
    const defs = [...t1, ...t2, cap(a - 55 - 15 - 55, a + 55 + 15 + 55, topY - 26, 'kayu'), B('berkas', a - 23, topY - 26 - 56, 46, 56)];
    lv.push(L('Pemanasan', 'Revisi pertama selalu paling manis.', 3, a, defs));
  }
  // L2 — kaca ikut main
  {
    const a = 600;
    const defs = [
      ...tower(a - 80, g, ['kayu', 'kaca']),
      ...tower(a, g, ['kayu', 'kayu', 'kaca']),
      ...tower(a + 80, g, ['kayu', 'kaca']),
      cap(a - 95, a + 95, g - 96 - 96 - 96 - 26, 'kaca'),
      B('berkas', a - 23, g - 96 * 3 - 26 - 56, 46, 56),
    ];
    lv.push(L('Kaca Mata', 'Klien bilang "coba dibuat lebih transparan".', 3, a, defs));
  }
  // L3 — bata butuh 2x pukul
  {
    const a = 630;
    const tY = g - 96;
    const defs = [
      ...tower(a - 70, g, ['bata']),
      ...tower(a + 70, g, ['bata']),
      cap(a - 85, a + 85, tY - 26, 'kayu'),
      ...tower(a - 70, tY - 26, ['bata', 'berkas']),
      ...tower(a + 70, tY - 26, ['bata', 'berkas']),
      cap(a - 85, a + 85, tY - 26 - 76 - 56 - 26, 'kaca'),
    ];
    lv.push(L('Tembok Revisi', 'Bata: keras kepala kayak owner proyek.', 4, a, defs));
  }
  // L4 — beton muncul
  {
    const a = 600;
    const defs = [
      ...tower(a - 90, g, ['beton']),
      ...tower(a + 90, g, ['beton']),
      cap(a - 105, a + 105, g - 84 - 26, 'bata'),
      ...tower(a, g - 84 - 26, ['kayu', 'kayu', 'berkas']),
      B('berkas', a - 23 - 120, g - 56, 46, 56),
      B('berkas', a - 23 + 120, g - 56, 46, 56),
    ];
    lv.push(L('Cor Pagi Ini', 'Beton butuh 3x hantam. Kayak negosiasi fee.', 4, a, defs));
  }
  // L5 — menara kembar
  {
    const a = 590;
    const defs = [
      ...tower(a - 120, g, ['kayu', 'bata', 'kaca']),
      ...tower(a - 40, g, ['bata', 'bata']),
      ...tower(a + 40, g, ['bata', 'bata']),
      ...tower(a + 120, g, ['kayu', 'bata', 'kaca']),
      cap(a - 135, a - 25, g - 96 - 76 - 96 - 26, 'kayu'),
      cap(a + 25, a + 135, g - 96 - 76 - 96 - 26, 'kayu'),
      B('berkas', a - 80 - 23, g - 96 - 76 - 96 - 26 - 56, 46, 56),
      B('berkas', a + 80 - 23, g - 96 - 76 - 96 - 26 - 56, 46, 56),
    ];
    lv.push(L('Twin Tower', 'Dua-duanya minta revisi. Serentak.', 5, a, defs));
  }
  // L6 — benteng beton
  {
    const a = 640;
    const inner = g - 84;
    const defs = [
      ...tower(a - 110, g, ['beton', 'beton']),
      ...tower(a + 110, g, ['beton', 'beton']),
      cap(a - 125, a + 125, inner - 84 - 26, 'beton'),
      ...tower(a - 55, inner - 84 - 26, ['bata', 'kaca']),
      ...tower(a + 55, inner - 84 - 26, ['bata', 'kaca']),
      cap(a - 70, a + 70, inner - 84 - 26 - 76 - 96 - 26, 'kayu'),
      B('berkas', a - 23, inner - 84 - 26 - 76 - 96 - 26 - 56, 46, 56),
    ];
    lv.push(L('Benteng Owner', 'Dindingnya setebal alasan telat bayar.', 5, a, defs));
  }
  // L7 — kaca rapuh di tengah beton
  {
    const a = 610;
    const defs = [
      ...tower(a - 130, g, ['beton']),
      ...tower(a - 45, g, ['kaca', 'kaca']),
      ...tower(a + 45, g, ['kaca', 'kaca']),
      ...tower(a + 130, g, ['beton']),
      cap(a - 145, a + 145, g - 84 - 26, 'bata'),
      ...tower(a - 90, g - 84 - 26, ['kayu', 'berkas']),
      ...tower(a + 90, g - 84 - 26, ['kayu', 'berkas']),
      cap(a - 105, a + 105, g - 84 - 26 - 96 - 56 - 26, 'kaca'),
      B('berkas', a - 23, g - 84 - 26 - 96 - 56 - 26 - 56, 46, 56),
    ];
    lv.push(L('Jantung Kaca', 'Satu titik lemah di tengah kubu.', 5, a, defs));
  }
  // L8 — piramida
  {
    const a = 600;
    const defs: BlockDef[] = [];
    const rows: Mat[][] = [
      ['beton', 'beton', 'beton', 'beton', 'beton'],
      ['bata', 'bata', 'bata', 'bata'],
      ['kayu', 'kayu', 'kayu'],
      ['kaca', 'kaca'],
      ['berkas'],
    ];
    const bw = 46;
    let y = g;
    rows.forEach((row, ri) => {
      const totalW = row.length * bw;
      row.forEach((m, ci) => {
        const h = m === 'berkas' ? 56 : 64;
        const x = a - totalW / 2 + ci * bw;
        defs.push(B(m, x, y - h, bw - 4, h));
      });
      y -= ri === 4 ? 56 : 64;
    });
    void 0;
    lv.push(L('Piramida RAB', 'Makin ke atas makin runcing anggarannya.', 6, a, defs));
  }
  // L9 — tiga menara
  {
    const a = 630;
    const defs = [
      ...tower(a - 150, g, ['kayu', 'bata', 'beton', 'kaca']),
      ...tower(a, g, ['beton', 'bata', 'bata', 'kaca']),
      ...tower(a + 150, g, ['kayu', 'bata', 'beton', 'kaca']),
      cap(a - 165, a - 135 + 30, g - 96 - 76 - 84 - 96 - 26, 'kaca'),
      cap(a - 15, a + 15 + 30, g - 84 - 76 - 76 - 96 - 26, 'kaca'),
      cap(a + 135, a + 165 + 30, g - 96 - 76 - 84 - 96 - 26, 'kaca'),
      B('berkas', a - 150 - 23, g - 96 - 76 - 84 - 96 - 26 - 56, 46, 56),
      B('berkas', a - 23, g - 84 - 76 - 76 - 96 - 26 - 56, 46, 56),
      B('berkas', a + 150 - 23, g - 96 - 76 - 84 - 96 - 26 - 56, 46, 56),
    ];
    lv.push(L('Triple Threat', 'Tiga revisi. Tiga deadline. Satu malam.', 6, a, defs));
  }
  // L10 — final: kastil
  {
    const a = 620;
    const inner = g - 84;
    const defs = [
      ...tower(a - 140, g, ['beton', 'beton', 'bata']),
      ...tower(a - 70, g, ['beton', 'bata', 'kaca']),
      ...tower(a + 70, g, ['beton', 'bata', 'kaca']),
      ...tower(a + 140, g, ['beton', 'beton', 'bata']),
      cap(a - 155, a - 55, inner - 84 - 26, 'beton'),
      cap(a + 55, a + 155, inner - 84 - 26, 'beton'),
      ...tower(a - 105, inner - 84 - 26, ['kayu', 'kayu', 'berkas']),
      ...tower(a + 105, inner - 84 - 26, ['kayu', 'kayu', 'berkas']),
      cap(a - 120, a + 120, inner - 84 - 26 - 96 - 96 - 56 - 26, 'bata'),
      ...tower(a, inner - 84 - 26 - 96 - 96 - 56 - 26, ['beton', 'berkas']),
    ];
    lv.push(L('Kastil Final', 'Revisi ke-13. Hancurkan semuanya. Puas-puasin.', 7, a, defs));
  }
  return lv;
})();

/* ------------------------------------------------------------------ */
/* Prediksi lintasan (dipakai untuk trajectory dots)                    */
/* ------------------------------------------------------------------ */

export interface PPoint {
  x: number;
  y: number;
}

/**
 * Simulasi parabola dengan integrator yang SAMA persis dengan stepBall
 * (semi-implicit Euler) supaya dots menempel di jalur nyata.
 */
export function predict(
  x: number,
  y: number,
  vx: number,
  vy: number,
  g: number = GRAV,
  steps: number = PREDICT_STEPS,
  dt: number = PREDICT_DT,
): PPoint[] {
  const pts: PPoint[] = [];
  let px = x;
  let py = y;
  let pvx = vx;
  let pvy = vy;
  for (let i = 0; i < steps; i += 1) {
    pvy += g * dt;
    px += pvx * dt;
    py += pvy * dt;
    pts.push({ x: px, y: py });
    if (py > GROUND_Y) break;
  }
  return pts;
}

/** Kecepatan luncur dari posisi tarik (pocket) relatif ke anchor ketapel. */
export function launchVel(anchorX: number, anchorY: number, px: number, py: number): { vx: number; vy: number } {
  let dx = anchorX - px;
  let dy = anchorY - py;
  const d = Math.hypot(dx, dy);
  if (d > DRAG_MAX) {
    dx = (dx / d) * DRAG_MAX;
    dy = (dy / d) * DRAG_MAX;
  }
  return { vx: dx * LAUNCH_POWER, vy: dy * LAUNCH_POWER };
}

/* ------------------------------------------------------------------ */
/* Tabrakan                                                             */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Circle vs AABB (blok dianggap axis-aligned untuk fisika). */
export function circleRectCollide(cx: number, cy: number, r: number, rc: Rect): boolean {
  const nx = Math.max(rc.x, Math.min(cx, rc.x + rc.w));
  const ny = Math.max(rc.y, Math.min(cy, rc.y + rc.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ------------------------------------------------------------------ */
/* State & stepping                                                      */
/* ------------------------------------------------------------------ */

export interface KState {
  level: Level;
  levelIndex: number;
  blocks: Block[];
  ball: Ball | null;
  ballsLeft: number;
  score: number;
  phase: 'aim' | 'flying' | 'settle' | 'done';
  won: boolean;
  settleT: number;
  drag: { x: number; y: number } | null; // posisi pocket saat ditarik
}

export function createState(levelIndex: number): KState {
  const level = LEVELS[levelIndex];
  nextId = 1;
  const blocks: Block[] = level.defs.map((d) => ({
    ...d,
    id: nextId++,
    hp: MAT_HP[d.mat],
    vx: 0,
    vy: 0,
    angle: 0,
    va: 0,
    dead: false,
    grounded: false,
    lastHitBy: 0,
  }));
  // tandai blok yang mulai dengan penyangga (di atas tanah/blok lain)
  for (const b of blocks) {
    b.grounded = isSupported(b, blocks);
  }
  return {
    level,
    levelIndex,
    blocks,
    ball: null,
    ballsLeft: level.balls,
    score: 0,
    phase: 'aim',
    won: false,
    settleT: 0,
    drag: null,
  };
}

function isSupported(b: Block, blocks: Block[]): boolean {
  const bottom = b.y + b.h;
  if (bottom >= GROUND_Y - 3) return true;
  const cx = b.x + b.w / 2;
  for (const o of blocks) {
    if (o === b || o.dead) continue;
    const oTop = o.y;
    // blok lain menopang bila atasnya dekat dengan bawah b dan overlap horizontal
    if (Math.abs(oTop - bottom) <= 6 && cx > o.x - b.w * 0.25 && cx < o.x + o.w + b.w * 0.25) {
      return true;
    }
  }
  return false;
}

/** Damage 1 ke blok; kembalikan true bila blok hancur. */
export function damageBlock(b: Block, events: KEvent[], scoreRef: { v: number }, knock?: { vx: number; vy: number }): boolean {
  if (b.dead) return false;
  b.hp -= 1;
  if (knock) {
    b.vx = knock.vx;
    b.vy = knock.vy;
    b.va = (knock.vx >= 0 ? 1 : -1) * Math.min(6, Math.hypot(knock.vx, knock.vy) / 220);
    b.grounded = false;
  }
  if (b.hp <= 0) {
    b.dead = true;
    scoreRef.v += MAT_SCORE[b.mat];
    events.push({ type: 'blockBreak', mat: b.mat, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });
    return true;
  }
  events.push({ type: 'ballHit', blockId: b.id, mat: b.mat, x: b.x + b.w / 2, y: b.y + b.h / 2, hard: false });
  return false;
}

export function stepBall(ball: Ball, dt: number, g: number = GRAV): void {
  ball.vy += g * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.age += dt;
}

export function ballShouldDie(ball: Ball): boolean {
  if (ball.x > WORLD_W + 80 || ball.x < -80 || ball.y > GROUND_Y + 90) return true;
  const sp = Math.hypot(ball.vx, ball.vy);
  return ball.age > 1.1 && sp < 60;
}

/** Satu langkah fisika blok: jatuh bila tak disangga, mendarat keras = damage. */
export function toppleStep(blocks: Block[], dt: number, events: KEvent[], scoreRef: { v: number }): void {
  for (const b of blocks) {
    if (b.dead) continue;
    if (!b.grounded) {
      b.vy += GRAV * dt;
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      b.angle += b.va * dt;
      // gesekan udara ringan
      b.vx *= 1 - 0.25 * dt;

      const bottom = b.y + b.h;
      // mendarat di tanah
      if (bottom >= GROUND_Y) {
        b.y = GROUND_Y - b.h;
        landBlock(b, events, scoreRef);
        continue;
      }
      // mendarat di atas blok lain
      for (const o of blocks) {
        if (o === b || o.dead) continue;
        if (b.vy > 0 && bottom >= o.y && bottom - o.y < 26 && b.x + b.w * 0.6 > o.x && b.x + b.w * 0.4 < o.x + o.w) {
          b.y = o.y - b.h;
          landBlock(b, events, scoreRef);
          break;
        }
      }
    } else {
      // blok grounded: pastikan masih ada penyangga (blok di bawahnya bisa hancur)
      if (!isSupported(b, blocks)) {
        b.grounded = false;
      } else if (Math.abs(b.vx) > 12) {
        b.x += b.vx * dt;
        b.vx *= 1 - 5 * dt;
        // tabrak blok lain secara horizontal -> dorong berantai
        for (const o of blocks) {
          if (o === b || o.dead) continue;
          if (rectsOverlap(b, o)) {
            const sp = Math.abs(b.vx);
            o.vx = b.vx * 0.85;
            o.grounded = false;
            o.va = (b.vx >= 0 ? 1 : -1) * 2.5;
            if (sp > 260) damageBlock(o, events, scoreRef);
            b.vx *= 0.25;
          }
        }
        if (!isSupported(b, blocks)) b.grounded = false;
      }
    }
  }
  // blok mental berkecepatan tinggi menabrak blok lain -> damage berantai
  for (const b of blocks) {
    if (b.dead || b.grounded) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 230) continue;
    for (const o of blocks) {
      if (o === b || o.dead) continue;
      if (rectsOverlap(b, o)) {
        damageBlock(o, events, scoreRef, { vx: b.vx * 0.7, vy: b.vy * 0.4 - 160 });
        b.vx *= 0.45;
        b.vy *= 0.45;
      }
    }
  }
}

function landBlock(b: Block, events: KEvent[], scoreRef: { v: number }): void {
  const impact = b.vy;
  b.vy = 0;
  b.vx *= 0.3;
  b.va *= 0.3;
  b.angle *= 0.6;
  b.grounded = true;
  if (impact > 480) {
    damageBlock(b, events, scoreRef);
    events.push({ type: 'blockLand', x: b.x + b.w / 2, y: b.y + b.h, w: b.w, hard: true });
  } else if (impact > 180) {
    events.push({ type: 'blockLand', x: b.x + b.w / 2, y: b.y + b.h, w: b.w, hard: false });
  }
}

/** Bola vs blok (dipanggil tiap frame saat flying). Pakai scoreRef bersama. */
export function ballBlockStep(s: KState, events: KEvent[], scoreRef: { v: number }): void {
  const ball = s.ball;
  if (!ball || !ball.flying || ball.dead) return;
  for (const b of s.blocks) {
    if (b.dead || b.lastHitBy === ball.flightId) continue;
    if (circleRectCollide(ball.x, ball.y, BALL_R, b)) {
      b.lastHitBy = ball.flightId;
      const sp = Math.hypot(ball.vx, ball.vy);
      // arah mental: searah gerak bola + sedikit ke atas
      const nx = ball.vx === 0 && ball.vy === 0 ? 1 : ball.vx / (sp || 1);
      const ny = ball.vy / (sp || 1);
      const hard = sp > 420;
      damageBlock(b, events, scoreRef, { vx: nx * sp * 0.75, vy: ny * sp * 0.5 - 200 });
      events.push({ type: 'ballHit', blockId: b.id, mat: b.mat, x: ball.x, y: ball.y, hard });
      // bola berat: hanya sedikit melambat
      ball.vx *= 0.82;
      ball.vy *= 0.82;
    }
  }
}

/** Apakah semua berkas sudah hancur? */
export function allBerkasDead(blocks: Block[]): boolean {
  return blocks.filter((b) => b.mat === 'berkas').every((b) => b.dead);
}

/**
 * Update utama per frame. Kembalikan events untuk juice.
 * phase: aim -> flying -> settle -> aim | done
 */
export function updateState(s: KState, dt: number): KEvent[] {
  const events: KEvent[] = [];
  const scoreRef = { v: s.score };

  if (s.phase === 'flying' && s.ball) {
    stepBall(s.ball, dt);
    ballBlockStep(s, events, scoreRef);
    if (ballShouldDie(s.ball)) {
      events.push({ type: 'ballDead' });
      s.ball = null;
      s.phase = 'settle';
      s.settleT = 1.15;
    }
  }

  if (s.phase === 'settle' || s.phase === 'flying') {
    toppleStep(s.blocks, dt, events, scoreRef);
  }

  if (s.phase === 'settle') {
    s.settleT -= dt;
    if (s.settleT <= 0) {
      if (allBerkasDead(s.blocks)) {
        s.phase = 'done';
        s.won = true;
      } else if (s.ballsLeft > 0) {
        s.phase = 'aim';
      } else {
        s.phase = 'done';
        s.won = false;
      }
    }
  }

  s.score = scoreRef.v;
  return events;
}

/** Bintang 1-3 berdasar bola terpakai (hanya bila menang). */
export function starFor(ballsUsed: number, ballsTotal: number): 1 | 2 | 3 {
  if (ballsUsed <= Math.ceil(ballsTotal / 2)) return 3;
  if (ballsUsed < ballsTotal) return 2;
  return 1;
}

/** Bonus skor: tiap bola sisa +250. */
export function leftoverBonus(ballsLeft: number): number {
  return ballsLeft * 250;
}
