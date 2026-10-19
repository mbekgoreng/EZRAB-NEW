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
  x: number; y: number; vx: number; vy: number; r: number;
  /** spin fisik: dibelokkan Magnus; di-set saat tendangan, meluruh pelan */
  spin: number;
  /** sudut visual untuk gambar jahitan bola */
  rot: number;
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
  return { x: field.w / 2, y: field.groundY - 60, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
}

export function makePlayer(x: number, groundY: number, facing: 1 | -1): Player {
  return { x, y: groundY, vx: 0, vy: 0, w: 44, h: 96, facing, kickCd: 0, onGround: true };
}

/* ---------------- bola ---------------- */

/**
 * Konstanta Magnus: seberapa kuat spin membelokkan bola.
 * a = MAGNUS * spin × v. Dengan spin tendangan (±9) & laju 560 px/s,
 * lengkungan ≈ 300 px/s² — terasa, tapi tak mendominasi gravitasi.
 */
export const MAGNUS = 0.06;

/** Satu langkah fisika bola: gravitasi, efek Magnus (spin), pantul. */
export function stepBall(b: Ball, dt: number, f: Field): void {
  b.vy += f.gravity * dt;
  // Magnus: spin memengaruhi arah — topspin menukik, backspin mengapung
  b.vx += -b.spin * b.vy * MAGNUS * dt;
  b.vy += b.spin * b.vx * MAGNUS * dt;
  // spin meluruh pelan; rotasi visual mengikuti laju + spin
  b.spin *= Math.max(0, 1 - 0.35 * dt);
  b.rot += (b.vx * 0.05 + b.spin * 0.9) * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

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

  // Tanah — spin memengaruhi pantul: topspin melesat maju, backspin tertahan
  if (b.y + b.r > f.groundY) {
    b.y = f.groundY - b.r;
    if (b.vy > 0) {
      b.vy = -b.vy * 0.65;
      if (Math.abs(b.vy) < 30) b.vy = 0;
      b.vx *= 0.92;
      b.vx += b.spin * 4;
      b.spin *= 0.7;
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
  // Kepala meredam (e≈0.45) — sundulan menjinakkan bola, bukan meledakkannya;
  // power datang dari tendangan (kick).
  const circles = [
    { x: p.x, y: p.y - p.h * 0.78, r: p.w * 0.52, e: 0.45 }, // kepala
    { x: p.x, y: p.y - p.h * 0.32, r: p.w * 0.36, e: 0.6 }, // badan
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
        b.vx -= (1 + c.e) * dot * nx;
        b.vy -= (1 + c.e) * dot * ny;
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
  /**
   * Positioning bertahan: 0 = nempel gawang, 1 = nempel bola.
   * Target jaga = anchor + (bola - anchor) * defendBias.
   */
  defendBias: number;
  /** jarak (px) bola-AI saat bertahan yg memicu tackle langsung */
  tackleRange: number;
}

export const AI_LEVELS: AiLevel[] = [
  { name: 'Magang',          speed: 165, jumpReact: 60,  kickPower: 430, thinkInterval: 0.60, defendBias: 0.25, tackleRange: 80 },
  { name: 'Tukang',          speed: 215, jumpReact: 90,  kickPower: 530, thinkInterval: 0.38, defendBias: 0.38, tackleRange: 105 },
  { name: 'Mandor',          speed: 250, jumpReact: 110, kickPower: 590, thinkInterval: 0.28, defendBias: 0.46, tackleRange: 120 },
  { name: 'Pengawas',        speed: 280, jumpReact: 130, kickPower: 640, thinkInterval: 0.20, defendBias: 0.54, tackleRange: 135 },
  { name: 'Konsultan Galak', speed: 300, jumpReact: 150, kickPower: 660, thinkInterval: 0.15, defendBias: 0.55, tackleRange: 145 },
];

/** Otak AI: menyimpan keputusan terakhir + timer berpikir. */
export interface AiBrain {
  reactT: number;
  left: boolean; right: boolean; jump: boolean; kick: boolean;
}

export function makeBrain(): AiBrain {
  return { reactT: 0, left: false, right: false, jump: false, kick: false };
}

function clampN(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * AI v2: bukan sekadar kejar bola.
 * - Bola di wilayah lawan (x < 45% lapangan) → menyerang: kejar bola.
 * - Bola di wilayah sendiri → bertahan: jaga depan gawang, condong ke
 *   arah bola sebesar defendBias; tackle bila bola masuk tackleRange.
 * - Lompat untuk duel udara / blok; tendang clearance ke gawang pemain.
 */
export function aiDecide(
  brain: AiBrain, ai: Player, b: Ball, level: AiLevel, dt: number, f: Field,
): void {
  brain.reactT -= dt;
  if (brain.reactT > 0) return;
  brain.reactT = level.thinkInterval;

  const attacking = b.x < f.w * 0.45;
  let targetX: number;
  if (attacking) {
    targetX = b.x;
  } else {
    const anchor = f.w - 95; // depan gawang sendiri
    targetX = anchor + (b.x - anchor) * level.defendBias;
    targetX = clampN(targetX, f.w * 0.5, f.w - 45);
    // tackle: bola dekat & rendah → rebut langsung
    if (Math.abs(b.x - ai.x) < level.tackleRange && b.y > f.groundY - 170) {
      targetX = b.x;
    }
  }

  const dead = 12;
  brain.left = targetX < ai.x - dead;
  brain.right = targetX > ai.x + dead;

  // Lompat: bola melayang di atas kepala & cukup dekat horizontal
  const headY = ai.y - ai.h * 0.78;
  brain.jump = b.y < headY - 30 && Math.abs(b.x - ai.x) < level.jumpReact && b.vy > -50;

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
