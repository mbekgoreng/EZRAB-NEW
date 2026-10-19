/**
 * Tenis Sendok Semen — ping-pong proyek. Pure match logic (no DOM).
 *
 * Bet = sendok semen, bola = bola beton. Pemain di kiri (pointer/touch),
 * AI di kanan. AI dibuat ADIL: kecepatan dibatasi, ada jeda reaksi, dan
 * bidikannya meleset acak — bisa dikalahkan.
 */

export const VW = 800;
export const VH = 480;
export const PADDLE_W = 16;
export const PADDLE_H = 96;
export const PLAYER_X = 34;
export const AI_X = VW - 34 - PADDLE_W;
export const WIN_SCORE = 7;

/** Batas kecepatan AI — di bawah kecepatan bola maksimal (adil). */
export const AI_MAX_SPEED = 430;
export const PLAYER_MAX_SPEED = 900;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PPState {
  ball: Ball;
  pY: number; // tengah bet pemain
  aY: number; // tengah bet AI
  p: number;
  a: number;
  serving: 'p' | 'a' | null; // null = bola sedang main
  rally: number;
  over: boolean;
  winner: '' | 'p' | 'a';
  /** waktu detik sejak match mulai — untuk error bidikan AI */
  time: number;
}

export function newMatch(): PPState {
  return {
    ball: { x: VW / 2, y: VH / 2, vx: 0, vy: 0 },
    pY: VH / 2,
    aY: VH / 2,
    p: 0,
    a: 0,
    serving: 'p',
    rally: 0,
    over: false,
    winner: '',
    time: 0,
  };
}

/** Taruh bola di sisi penyaji, diam sampai serve(). */
export function placeServe(s: PPState, who: 'p' | 'a'): PPState {
  const y = who === 'p' ? s.pY : s.aY;
  const x = who === 'p' ? PLAYER_X + PADDLE_W + 12 : AI_X - 12;
  return { ...s, serving: who, ball: { x, y, vx: 0, vy: 0 } };
}

/** Pukul bola dari posisi diam. */
export function serve(s: PPState): PPState {
  if (!s.serving) return s;
  const dir = s.serving === 'p' ? 1 : -1;
  const speed = 330;
  const ang = (Math.random() - 0.5) * 0.7;
  return {
    ...s,
    serving: null,
    rally: 0,
    ball: { ...s.ball, vx: Math.cos(ang) * speed * dir, vy: Math.sin(ang) * speed },
  };
}

/** Prediksi y bola saat mencapai x target (pantulan dinding ikut dihitung). */
export function predictY(ball: Ball, targetX: number): number {
  if (ball.vx === 0) return ball.y;
  const t = (targetX - ball.x) / ball.vx;
  if (t <= 0) return ball.y;
  let y = ball.y + ball.vy * t;
  // pantulkan prediksi dalam [0, VH]
  const h = VH;
  y = ((y % (2 * h)) + 2 * h) % (2 * h);
  if (y > h) y = 2 * h - y;
  return y;
}

export interface AISense {
  /** galat bidikan AI saat ini (diacak ulang tiap ~0.45 dtk oleh tsx) */
  err: number;
}

/**
 * Gerak AI satu frame — adil: hanya mengejar bila bola mendekat,
 * kecepatan dibatasi, dan ada galat bidikan.
 */
export function aiMove(s: PPState, dt: number, sense: AISense): number {
  let target: number;
  if (s.ball.vx > 40) {
    target = predictY(s.ball, AI_X) + sense.err;
  } else {
    target = VH / 2 + Math.sin(s.time * 1.3) * 40; // siaga di tengah
  }
  const dy = target - s.aY;
  const maxStep = AI_MAX_SPEED * dt;
  const step = Math.max(-maxStep, Math.min(maxStep, dy));
  return Math.max(PADDLE_H / 2, Math.min(VH - PADDLE_H / 2, s.aY + step));
}

export interface PPStep {
  state: PPState;
  events: Array<'pHit' | 'aHit' | 'pScore' | 'aScore' | 'wall'>;
}

/** Satu frame simulasi. pY = posisi tengah bet pemain yang diminta. */
export function step(s: PPState, pY: number, aiY: number, dt: number): PPStep {
  const events: PPStep['events'] = [];
  if (s.over || s.serving) {
    const ns: PPState = {
      ...s,
      time: s.time + dt,
      pY: Math.max(PADDLE_H / 2, Math.min(VH - PADDLE_H / 2, pY)),
      aY: aiY,
    };
    return { state: ns, events };
  }
  const st: PPState = {
    ...s,
    time: s.time + dt,
    pY: Math.max(PADDLE_H / 2, Math.min(VH - PADDLE_H / 2, pY)),
    aY: aiY,
  };
  const b = { ...st.ball };
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // dinding atas/bawah
  if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); events.push('wall'); }
  if (b.y > VH - 8) { b.y = VH - 8; b.vy = -Math.abs(b.vy); events.push('wall'); }

  const hitPaddle = (px: number, py: number): boolean =>
    b.x - 8 < px + PADDLE_W && b.x + 8 > px &&
    b.y > py - PADDLE_H / 2 - 8 && b.y < py + PADDLE_H / 2 + 8;

  // bet pemain (bola bergerak ke kiri)
  if (b.vx < 0 && hitPaddle(PLAYER_X, st.pY)) {
    const rel = Math.max(-1, Math.min(1, (b.y - st.pY) / (PADDLE_H / 2)));
    const sp = Math.min(760, Math.hypot(b.vx, b.vy) * 1.045);
    const ang = rel * 1.0; // -57°..57° dari horizontal
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;
    b.x = PLAYER_X + PADDLE_W + 9;
    st.rally += 1;
    events.push('pHit');
  }
  // bet AI (bola bergerak ke kanan)
  if (b.vx > 0 && hitPaddle(AI_X, st.aY)) {
    const rel = Math.max(-1, Math.min(1, (b.y - st.aY) / (PADDLE_H / 2)));
    const sp = Math.min(760, Math.hypot(b.vx, b.vy) * 1.045);
    b.vx = -Math.cos(rel * 1.0) * sp; // kembali ke kiri
    b.vy = Math.sin(rel * 1.0) * sp;
    b.x = AI_X - 9;
    st.rally += 1;
    events.push('aHit');
  }

  // gol
  let ns: PPState = { ...st, ball: b };
  if (b.x < -20) {
    ns = { ...placeServe({ ...ns, a: ns.a + 1 }, 'a'), time: ns.time };
    events.push('aScore');
  } else if (b.x > VW + 20) {
    ns = { ...placeServe({ ...ns, p: ns.p + 1 }, 'p'), time: ns.time };
    events.push('pScore');
  }
  if (ns.p >= WIN_SCORE || ns.a >= WIN_SCORE) {
    ns = { ...ns, over: true, winner: ns.p >= WIN_SCORE ? 'p' : 'a' };
  }
  return { state: ns, events };
}
