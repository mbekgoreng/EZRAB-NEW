/**
 * Head Soccer Mandor — fisika & AI bola kepala. Pure (tanpa DOM/window).
 *
 * Koordinat: x→kanan, y→bawah. Pemain kiri (kamu) menyerang gawang kanan,
 * pemain kanan (AI mandor) menyerang gawang kiri.
 */

export const MATCH_TIME = 60;
export const SUDDEN_DEATH_TIME = 30;
export const GOAL_FREEZE = 1.2;

export interface Ball {
  x: number; y: number; vx: number; vy: number; r: number; spin: number;
}

export interface Player {
  x: number; y: number;   // posisi kaki (titik tengah bawah)
  vx: number; vy: number;
  w: number; h: number;   // lebar & tinggi badan+ kepala
  facing: 1 | -1;
  kickCd: number;
  onGround: boolean;
}

export interface Field {
  w: number; h: number;
  groundY: number;     // permukaan tanah
  goalH: number;       // tinggi gawang (dari tanah ke mistar)
  goalDepth: number;   // kedalaman area gawang di balik garis
  gravity: number;
}

export interface PlayerCtl {
  left: boolean; right: boolean; jump: boolean; kick: boolean;
}

export const KICK_RANGE = 46;
export const KICK_COOLDOWN = 0.5;

export function makeBall(field: Field): Ball {
  return { x: field.w / 2, y: field.groundY - 60, vx: 0, vy: 0, r: 14, spin: 0 };
}

export function makePlayer(x: number, groundY: number, facing: 1 | -1): Player {
  return { x, y: groundY, vx: 0, vy: 0, w: 44, h: 96, facing, kickCd: 0, onGround: true };
}

/* ---------------- bola ---------------- */

/** Satu langkah fisika bola: gravitasi, pantul tanah 0.65, pantul dinding & tiang. */
export function stepBall(b: Ball, dt: number, f: Field): void {
  b.vy += f.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.spin += b.vx * dt * 0.05;

  const mouthTop = f.groundY - f.goalH;

  // Pantul tiang gawang (titik mistar kiri & kanan)
  for (const px of [0, f.w]) {
    const dx = b.x - px;
    const dy = b.y - mouthTop;
    const d = Math.hypot(dx, dy);
    if (d < b.r + 4 && d > 0.001) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = px + nx * (b.r + 4);
      b.y = mouthTop + ny * (b.r + 4);
      const dot = b.vx * nx + b.vy * ny;
      if (dot < 0) {
        b.vx -= 1.7 * dot * nx;
        b.vy -= 1.7 * dot * ny;
      }
    }
  }

  // Dinding samping — kecuali mulut gawang (biar bisa masuk gol)
  const inMouth = b.y > mouthTop && b.y < f.groundY;
  if (b.x - b.r < 0 && !inMouth) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
  if (b.x + b.r > f.w && !inMouth) { b.x = f.w - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
  // Dinding belakang gawang (area dalam gawang)
  if (b.x < -f.goalDepth) { b.x = -f.goalDepth; b.vx = Math.abs(b.vx) * 0.5; }
  if (b.x > f.w + f.goalDepth) { b.x = f.w + f.goalDepth; b.vx = -Math.abs(b.vx) * 0.5; }

  // Tanah
  if (b.y + b.r > f.groundY) {
    b.y = f.groundY - b.r;
    if (b.vy > 0) {
      b.vy = -b.vy * 0.65;
      if (Math.abs(b.vy) < 30) b.vy = 0;
      b.vx *= 0.92;
    }
  }
  // Langit-langit
  if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.6; }
}

/** 'left' = bola masuk gawang kiri, 'right' = gawang kanan, null = belum gol. */
export function checkGoal(b: Ball, f: Field): 'left' | 'right' | null {
  const mouthTop = f.groundY - f.goalH;
  const inMouth = b.y > mouthTop + 4 && b.y < f.groundY;
  if (!inMouth) return null;
  if (b.x < 0) return 'left';
  if (b.x > f.w) return 'right';
  return null;
}

/* ---------------- pemain ---------------- */

const RUN_ACCEL = 2600;
const MAX_RUN = 300;
const JUMP_V = 640;

export function stepPlayer(p: Player, ctl: PlayerCtl, dt: number, f: Field, maxRun = MAX_RUN): void {
  if (ctl.left) { p.vx -= RUN_ACCEL * dt; p.facing = -1; }
  if (ctl.right) { p.vx += RUN_ACCEL * dt; p.facing = 1; }
  if (!ctl.left && !ctl.right) p.vx *= Math.max(0, 1 - 8 * dt);
  p.vx = Math.max(-maxRun, Math.min(maxRun, p.vx));

  if (ctl.jump && p.onGround) {
    p.vy = -JUMP_V;
    p.onGround = false;
  }

  p.vy += f.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.kickCd > 0) p.kickCd -= dt;

  // Tanah & batas arena (tak boleh masuk area gawang lawan? boleh, bebas)
  if (p.y >= f.groundY) { p.y = f.groundY; p.vy = 0; p.onGround = true; }
  p.x = Math.max(p.w / 2, Math.min(f.w - p.w / 2, p.x));
}

/** Tendang: impuls ke arah hadap + ke atas. Return true bila berhasil. */
export function kick(p: Player, b: Ball, power: number): boolean {
  if (p.kickCd > 0) return false;
  const kx = p.x + p.facing * (p.w / 2 + 6);
  const ky = p.y - p.h * 0.45;
  const d = Math.hypot(b.x - kx, b.y - ky);
  if (d > KICK_RANGE + b.r) return false;
  b.vx = p.facing * power;
  b.vy = -power * 0.55;
  b.spin = p.facing * 9;
  p.kickCd = KICK_COOLDOWN;
  return true;
}

/** Tabrakan pemain-bola: dorong bola keluar + transfer sebagian velocity. */
export function collidePlayerBall(p: Player, b: Ball): boolean {
  // Pemain dianggap lingkaran kepala besar di atas + badan: pakai 2 lingkaran.
  const circles = [
    { x: p.x, y: p.y - p.h * 0.78, r: p.w * 0.52 }, // kepala
    { x: p.x, y: p.y - p.h * 0.32, r: p.w * 0.36 }, // badan
  ];
  let hit = false;
  for (const c of circles) {
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const d = Math.hypot(dx, dy);
    const minD = c.r + b.r;
    if (d < minD && d > 0.001) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = c.x + nx * minD;
      b.y = c.y + ny * minD;
      const relVx = b.vx - p.vx;
      const relVy = b.vy - p.vy;
      const dot = relVx * nx + relVy * ny;
      if (dot < 0) {
        b.vx -= 1.6 * dot * nx;
        b.vy -= 1.6 * dot * ny;
        // transfer sebagian momentum pemain
        b.vx += p.vx * 0.35;
        b.vy += p.vy * 0.15;
      }
      hit = true;
    }
  }
  return hit;
}

/* ---------------- AI ---------------- */

export interface AiLevel {
  name: string;
  speed: number;
  /** seberapa dekat (px) bola harus agar AI mau lompat */
  jumpReact: number;
  kickPower: number;
  /** jeda berpikir (detik) — makin kecil makin reaktif */
  thinkInterval: number;
}

export const AI_LEVELS: AiLevel[] = [
  { name: 'Magang',          speed: 170, jumpReact: 60,  kickPower: 480, thinkInterval: 0.55 },
  { name: 'Tukang',          speed: 210, jumpReact: 80,  kickPower: 540, thinkInterval: 0.42 },
  { name: 'Mandor',          speed: 250, jumpReact: 100, kickPower: 600, thinkInterval: 0.32 },
  { name: 'Pengawas',        speed: 285, jumpReact: 120, kickPower: 660, thinkInterval: 0.24 },
  { name: 'Konsultan Galak', speed: 315, jumpReact: 145, kickPower: 730, thinkInterval: 0.16 },
];

/** Otak AI: menyimpan keputusan terakhir + timer berpikir. */
export interface AiBrain {
  reactT: number;
  left: boolean; right: boolean; jump: boolean; kick: boolean;
}

export function makeBrain(): AiBrain {
  return { reactT: 0, left: false, right: false, jump: false, kick: false };
}

/**
 * AI: kejar bola, lompat bila bola di atas & dekat, tendang ke gawang
 * pemain (kiri) saat dalam jangkauan + cooldown.
 */
export function aiDecide(
  brain: AiBrain, ai: Player, b: Ball, level: AiLevel, dt: number,
): void {
  brain.reactT -= dt;
  if (brain.reactT > 0) return;
  brain.reactT = level.thinkInterval;

  const dx = b.x - ai.x;
  const dead = 12;
  brain.left = dx < -dead;
  brain.right = dx > dead;

  // Lompat: bola melayang di atas kepala & cukup dekat horizontal
  const headY = ai.y - ai.h * 0.78;
  brain.jump = b.y < headY - 30 && Math.abs(dx) < level.jumpReact && b.vy > -50;

  // Tendang ke gawang kiri (gawang pemain)
  ai.facing = -1;
  const kx = ai.x + ai.facing * (ai.w / 2 + 6);
  const ky = ai.y - ai.h * 0.45;
  brain.kick = Math.hypot(b.x - kx, b.y - ky) < KICK_RANGE + b.r && ai.kickCd <= 0;
}

export function brainToCtl(brain: AiBrain): PlayerCtl {
  return { left: brain.left, right: brain.right, jump: brain.jump, kick: brain.kick };
}

/* ---------------- match ---------------- */

export interface Match {
  timeLeft: number;
  scoreL: number; // kamu
  scoreR: number; // AI
  freezeT: number; // >0 saat selebrasi gol
  suddenDeath: boolean;
  over: boolean;
  /** 'win' | 'lose' | null — diisi saat over */
  result: 'win' | 'lose' | null;
}

export function makeMatch(): Match {
  return { timeLeft: MATCH_TIME, scoreL: 0, scoreR: 0, freezeT: 0, suddenDeath: false, over: false, result: null };
}

/** Catat gol. Return 'L' bila kamu yang cetak (gawang kanan), 'R' bila AI. */
export function onGoal(m: Match, side: 'left' | 'right'): 'L' | 'R' {
  if (side === 'right') m.scoreL += 1;
  else m.scoreR += 1;
  m.freezeT = GOAL_FREEZE;
  // Sudden death: gol pertama langsung menang
  if (m.suddenDeath) {
    m.over = true;
    m.result = side === 'right' ? 'win' : 'lose';
  }
  return side === 'right' ? 'L' : 'R';
}

/**
 * Tick timer. Return 'tick' | 'end' | 'suddenDeath'.
 * Seri saat waktu habis → sudden death 30 detik (bukan langsung kalah).
 */
export function stepMatch(m: Match, dt: number): 'tick' | 'end' | 'suddenDeath' {
  if (m.over) return 'end';
  if (m.freezeT > 0) {
    m.freezeT -= dt;
    return 'tick';
  }
  m.timeLeft -= dt;
  if (m.timeLeft > 0) return 'tick';
  if (!m.suddenDeath && m.scoreL === m.scoreR) {
    m.suddenDeath = true;
    m.timeLeft = SUDDEN_DEATH_TIME;
    return 'suddenDeath';
  }
  m.over = true;
  m.result = m.scoreL > m.scoreR ? 'win' : 'lose';
  return 'end';
}

/** Komentar gol humor estimator — dipilih acak di lapisan UI. */
export const GOAL_COMMENTS: string[] = [
  'GOOL! Estimator ikut selebrasi!',
  'Gol! Bonus cair!',
  'GOOL! Revisi RAB dibatalkan!',
  'Masuk! Mandor sampai joget!',
  'Gol! Harga satuan disetujui klien!',
  'GOOL! Lembur hari ini terbayar!',
];

export const CONCEDE_COMMENTS: string[] = [
  'Kebobolan! Kayak budget jebol…',
  'Gol lawan. Konsultan minta hitung ulang.',
  'Aduh! Itu kayak revisi gambar ke-14.',
];
