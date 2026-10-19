/**
 * Tebas Material — fruit-ninja 2D: tebas material proyek yang beterbangan.
 * Pure rules in ./logic.ts; this file is rendering + input + juice.
 *
 * Fairness & feel (hasil play-test):
 *  - 2 detik pertama run: TIDAK ADA dinamit.
 *  - Trail responsif: digambar langsung dari pointermove + interpolasi
 *    antar titik (tidak patah-patah); sliceCheck per sub-segmen.
 *  - Dinamit JELAS berbahaya: blink merah + sumbu mendesis + tengkorak.
 *  - Kombo x2/x3: slow-mo 0.3x selama 300ms + popup kombo.
 *  - Miss material = -1 nyawa dengan feedback jelas (bukan diam-diam).
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  mulberry32, spawnItem, stepItems, sliceCheck, splitItem,
  waveFor, comboBonus, slicePoints, SPLASH, START_LIVES, COMBO_MIN,
  SLOWMO_SCALE, SLOWMO_T, GRACE_NO_DYNAMITE_T, missLivesLost, MAX_ITEMS,
  type FlyingItem, type ItemKind, type Rng,
} from './logic';

const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const BK = bestKey('tebas-material', 'best');

/** Arcade-test harness hook: aktif hanya bila URL mengandung ?arcade */
const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

interface Hud {
  score: number;
  best: number;
  lives: number;
}

interface TrailPt { x: number; y: number; t: number }
interface Cloud { fx: number; fy: number; s: number; spd: number; a: number }
interface Building { fx: number; fw: number; fh: number; wins: Array<[number, number]> }
interface Slash { x1: number; y1: number; x2: number; y2: number; t: number }

interface G {
  items: FlyingItem[];
  trail: TrailPt[];
  slashes: Slash[];
  clouds: Cloud[];
  buildings: Building[];
  spawnT: number;
  elapsed: number;
  runT: number; // waktu run (untuk grace dinamit & wave)
  score: number;
  lives: number;
  rng: Rng;
  down: boolean;
  swipeSlices: number;
  comboShown: number;
  flash: number;      // flash putih-merah saat kena dinamit
  missFlash: number;  // flash tepi merah saat miss material
  slowmoT: number;    // sisa slow-mo kombo
  hitStop: number;    // freeze 60ms saat kena dinamit
  nextMilestone: number;
  newBest: boolean;
}

const MILESTONES = [
  'Target tercapai! Mandor tersenyum.',
  'Bagus! RAB aman… untuk sekarang.',
  'Klien pasti minta revisi. Tapi bukan hari ini.',
  'Produktivitas naik! Bonus THR menanti. (Mungkin.)',
];

function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/* ---------------- fuse hiss (WebAudio lokal, tanpa aset) ---------------- */

interface HissRig {
  ctx: AudioContext | null;
  gain: GainNode | null;
  lastTarget: number;
}

function ensureHiss(rig: HissRig): void {
  if (rig.ctx) {
    if (rig.ctx.state === 'suspended') void rig.ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4800;
    bp.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    rig.ctx = ctx;
    rig.gain = gain;
  } catch {
    /* audio tidak tersedia — visual blink tetap jalan */
  }
}

/** Atur volume desis: nyala hanya saat ada dinamit di layar & tidak mute. */
function hissTarget(rig: HissRig, on: boolean, muted: boolean): void {
  if (!rig.ctx || !rig.gain) return;
  const target = on && !muted ? 0.09 : 0;
  if (target === rig.lastTarget) return;
  rig.lastTarget = target;
  rig.gain.gain.setTargetAtTime(target, rig.ctx.currentTime, 0.09);
}

/* ---------------- background (senja proyek, 2 lapis parallax) ---------------- */

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, g: G): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b2440');
  sky.addColorStop(0.5, '#1d4e7e');
  sky.addColorStop(0.74, '#c97a3a');
  sky.addColorStop(0.86, '#f2b25c');
  sky.addColorStop(1, '#3a2410');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // sun + glow
  const sx = W * 0.76;
  const sy = H * 0.34;
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 110);
  glow.addColorStop(0, 'rgba(255,236,180,0.95)');
  glow.addColorStop(0.25, 'rgba(255,210,120,0.55)');
  glow.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 110, sy - 110, 220, 220);
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath();
  ctx.arc(sx, sy, 26, 0, TAU);
  ctx.fill();

  // clouds bervolume (2 lapis parallax): bayangan bawah + badan gradien
  for (const c of g.clouds) {
    const cx = ((c.fx * W + g.elapsed * c.spd) % (W + 320) + W + 320) % (W + 320) - 160;
    const cy = c.fy * H;
    const puffs: Array<[number, number, number]> = [[-34, 6, 0.75], [0, 0, 1], [34, 8, 0.7], [8, -12, 0.6]];
    ctx.fillStyle = `rgba(120,80,90,${c.a * 0.4})`;
    for (const [ox, oy, s] of puffs) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * c.s, cy + (oy + 6) * c.s, 34 * c.s * s, 15 * c.s * s, 0, 0, TAU);
      ctx.fill();
    }
    const cg = ctx.createLinearGradient(0, cy - 18 * c.s, 0, cy + 14 * c.s);
    cg.addColorStop(0, `rgba(255,236,205,${c.a * 0.9})`);
    cg.addColorStop(1, `rgba(235,170,140,${c.a * 0.9})`);
    ctx.fillStyle = cg;
    for (const [ox, oy, s] of puffs) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * c.s, cy + oy * c.s, 34 * c.s * s, 15 * c.s * s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255,246,225,${c.a * 0.7})`;
    ctx.beginPath();
    ctx.ellipse(cx - 4 * c.s, cy - 9 * c.s, 22 * c.s, 7 * c.s, -0.1, 0, TAU);
    ctx.fill();
  }

  // far buildings silhouette + jendela senja
  const horizon = H - 84;
  for (const b of g.buildings) {
    const bx = b.fx * W;
    const bw = b.fw * W;
    const bh = b.fh * H;
    const bg = ctx.createLinearGradient(0, horizon - bh, 0, horizon);
    bg.addColorStop(0, '#1d3153');
    bg.addColorStop(1, '#141f36');
    ctx.fillStyle = bg;
    ctx.fillRect(bx, horizon - bh, bw, bh);
    ctx.fillStyle = 'rgba(255,215,130,0.75)';
    for (const [wx, wy] of b.wins) {
      ctx.fillRect(bx + wx * bw, horizon - bh + wy * bh, 5, 7);
    }
  }

  // crane silhouette (detail: jib, counter-jib, hook bergoyang)
  const crx = W * 0.16;
  ctx.strokeStyle = '#101f36';
  ctx.fillStyle = '#101f36';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(crx, horizon); ctx.lineTo(crx, horizon - H * 0.42); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(crx - W * 0.16, horizon - H * 0.40); ctx.lineTo(crx + W * 0.22, horizon - H * 0.40); ctx.stroke();
  ctx.lineWidth = 2;
  const hookX = crx + W * 0.13;
  const hookDrop = 26 + Math.sin(g.elapsed * 0.8) * 8;
  ctx.beginPath(); ctx.moveTo(hookX, horizon - H * 0.40); ctx.lineTo(hookX, horizon - H * 0.40 + hookDrop); ctx.stroke();
  ctx.fillRect(hookX - 7, horizon - H * 0.40 + hookDrop, 14, 10);
  ctx.fillRect(crx - W * 0.16 - 8, horizon - H * 0.40 - 16, 16, 22);
  // lampu puncak crane berkedip
  const blink = 0.5 + 0.5 * Math.sin(g.elapsed * 4);
  ctx.fillStyle = `rgba(239,68,68,${0.35 + 0.55 * blink})`;
  ctx.beginPath();
  ctx.arc(crx, horizon - H * 0.42, 4, 0, TAU);
  ctx.fill();

  // ground
  const gg = ctx.createLinearGradient(0, horizon, 0, H);
  gg.addColorStop(0, '#6b4423');
  gg.addColorStop(0.25, '#4a2c14');
  gg.addColorStop(1, '#241305');
  ctx.fillStyle = gg;
  ctx.fillRect(0, horizon, W, H - horizon);
  // hazard stripe on ground edge
  const sw = 26;
  for (let x = -sw; x < W + sw; x += sw) {
    ctx.fillStyle = (x / sw) % 2 === 0 ? '#f5b301' : '#1c1c1c';
    ctx.beginPath();
    ctx.moveTo(x, horizon);
    ctx.lineTo(x + sw / 2, horizon);
    ctx.lineTo(x + sw / 2 - 8, horizon + 12);
    ctx.lineTo(x - 8, horizon + 12);
    ctx.closePath();
    ctx.fill();
  }
  // dirt speckles + highlight tanah
  ctx.fillStyle = 'rgba(255,220,170,0.08)';
  ctx.fillRect(0, horizon + 12, W, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 26; i += 1) {
    const px = hash(i * 3.7) * W;
    const py = horizon + 18 + hash(i * 9.1) * (H - horizon - 22);
    ctx.beginPath();
    ctx.ellipse(px, py, 3 + hash(i) * 5, 2 + hash(i * 2) * 3, 0, 0, TAU);
    ctx.fill();
  }

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,10,20,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------- item bodies: base + gradient + highlight + detail ---------------- */

function drawBody(ctx: CanvasRenderingContext2D, kind: ItemKind, r: number, id: number, t: number): void {
  if (kind === 'bata') {
    const w = 2 * r;
    const h = 1.02 * r;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#fb923c');
    g.addColorStop(0.45, '#f97316');
    g.addColorStop(1, '#9a3412');
    ctx.fillStyle = g;
    rr(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    // tekstur pori bata
    ctx.fillStyle = 'rgba(124,45,18,0.5)';
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.arc((hash(id * 3 + i * 7) - 0.5) * (w - 16), (hash(id * 5 + i * 11) - 0.5) * (h - 14), 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7c2d12';
    ctx.stroke();
    // nat bata
    ctx.strokeStyle = 'rgba(255,235,205,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 3, 0); ctx.lineTo(w / 2 - 3, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 6, -h / 2 + 3); ctx.lineTo(-w / 6, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 6, 3); ctx.lineTo(w / 6, h / 2 - 3); ctx.stroke();
    // highlight atas
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    rr(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, 9, 4);
    ctx.fill();
  } else if (kind === 'kayu') {
    const w = 2.3 * r;
    const h = 0.85 * r;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#e8b96f');
    g.addColorStop(0.5, '#d99a4e');
    g.addColorStop(1, '#8a5a24');
    ctx.fillStyle = g;
    rr(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#5d3a15';
    ctx.stroke();
    // serat kayu
    ctx.strokeStyle = 'rgba(93,58,21,0.55)';
    ctx.lineWidth = 1.6;
    for (const oy of [-h * 0.22, 0, h * 0.22]) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 6, oy);
      ctx.bezierCurveTo(-w / 6, oy - 4, w / 6, oy + 4, w / 2 - 6, oy);
      ctx.stroke();
    }
    // mata kayu
    ctx.fillStyle = 'rgba(120,70,25,0.6)';
    ctx.beginPath();
    ctx.ellipse(w * 0.22, 0, 5, 3.4, 0.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(93,58,21,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(w * 0.22, 0, 8, 5.4, 0.4, 0, TAU);
    ctx.stroke();
    // highlight
    ctx.fillStyle = 'rgba(255,240,210,0.3)';
    rr(ctx, -w / 2 + 5, -h / 2 + 4, w - 10, 7, 3.5);
    ctx.fill();
  } else if (kind === 'semangka') {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.15);
    g.addColorStop(0, '#2ea44d');
    g.addColorStop(1, '#14622a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0d3f1c';
    ctx.stroke();
    // loreng
    ctx.strokeStyle = 'rgba(13,63,28,0.8)';
    ctx.lineWidth = 5;
    for (const fx of [-0.55, -0.18, 0.18, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(fx * r, 0, r * 0.13, r * 0.92, 0, 0, TAU);
      ctx.stroke();
    }
    // kilau
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.30, r * 0.16, -0.6, 0, TAU);
    ctx.fill();
    // tangkai
    ctx.fillStyle = '#6b4a1f';
    rr(ctx, -3.5, -r - 7, 7, 12, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-3.5, -r - 7, 2.5, 12);
  } else if (kind === 'beton') {
    const w = 1.9 * r;
    const h = 1.28 * r;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#d3d9e1');
    g.addColorStop(0.5, '#a7aeb9');
    g.addColorStop(1, '#6b7280');
    ctx.fillStyle = g;
    rr(ctx, -w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#374151';
    ctx.stroke();
    // agregat kasar
    for (let i = 0; i < 14; i += 1) {
      const px = (hash(id * 7 + i * 13) - 0.5) * (w - 14);
      const py = (hash(id * 3 + i * 29) - 0.5) * (h - 14);
      ctx.fillStyle = hash(id + i) > 0.5 ? 'rgba(55,65,81,0.5)' : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(px, py, 1.4 + hash(i * 5 + id) * 1.8, 0, TAU);
      ctx.fill();
    }
    // retak halus
    ctx.strokeStyle = 'rgba(55,65,81,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 8, -h * 0.28);
    ctx.lineTo(-w / 6, -h * 0.05);
    ctx.lineTo(-w / 3, h * 0.25);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(55,65,81,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 5, -h * 0.18); ctx.lineTo(w / 2 - 5, -h * 0.18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 2 + 5, h * 0.18); ctx.lineTo(w / 2 - 5, h * 0.18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, 8, 4);
    ctx.fill();
  } else {
    drawDynamite(ctx, r, t);
  }
}

/** Wajah irisan: interior bertekstur untuk tiap material. */
function drawCutFace(ctx: CanvasRenderingContext2D, kind: ItemKind, r: number, id: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();
  if (kind === 'semangka') {
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#fca5a5');
    g.addColorStop(0.6, '#f87171');
    g.addColorStop(1, '#dc2626');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    // biji
    ctx.fillStyle = '#3f1d1d';
    for (let i = 0; i < 7; i += 1) {
      const a = hash(id * 11 + i * 17) * TAU;
      const d = r * (0.25 + hash(id + i * 31) * 0.45);
      ctx.save();
      ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.2, 4.6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // tetes jus
    ctx.fillStyle = 'rgba(220,38,38,0.55)';
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc((hash(id + i * 3) - 0.5) * r * 1.4, (hash(id * 2 + i * 7) - 0.5) * r * 1.4, 2.4, 0, TAU);
      ctx.fill();
    }
  } else if (kind === 'kayu') {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    g.addColorStop(0, '#f3d29a');
    g.addColorStop(1, '#d99a4e');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    // lingkaran tahun
    ctx.strokeStyle = 'rgba(140,90,35,0.65)';
    for (let rr2 = r * 0.25; rr2 < r; rr2 += r * 0.22) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, rr2, 0, TAU);
      ctx.stroke();
    }
  } else if (kind === 'bata') {
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#e8823f');
    g.addColorStop(1, '#a83c14');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(90,30,10,0.55)';
    for (let i = 0; i < 12; i += 1) {
      ctx.beginPath();
      ctx.arc((hash(id * 3 + i * 13) - 0.5) * r * 1.5, (hash(id * 7 + i * 5) - 0.5) * r * 1.5, 2.2, 0, TAU);
      ctx.fill();
    }
  } else {
    // beton: interior agregat terang
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#e2e6ec');
    g.addColorStop(1, '#9aa1ac');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    for (let i = 0; i < 14; i += 1) {
      ctx.fillStyle = hash(id + i * 3) > 0.5 ? 'rgba(55,65,81,0.6)' : 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc((hash(id * 2 + i * 11) - 0.5) * r * 1.5, (hash(id * 5 + i * 17) - 0.5) * r * 1.5, 2 + hash(i + id) * 2.4, 0, TAU);
      ctx.fill();
    }
  }
  // kilau basah irisan
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.38, r * 0.42, r * 0.2, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ---------------- dinamit: JELAS berbahaya ---------------- */

function drawDynamite(ctx: CanvasRenderingContext2D, r: number, t: number): void {
  const sw = r * 0.52;
  const sh = r * 1.7;
  for (const ox of [-sw - 2, 0, sw + 2]) {
    const g = ctx.createLinearGradient(ox - sw / 2, 0, ox + sw / 2, 0);
    g.addColorStop(0, '#f87171');
    g.addColorStop(0.5, '#dc2626');
    g.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = g;
    rr(ctx, ox - sw / 2, -sh / 2, sw, sh, 5);
    ctx.fill();
    // highlight tiap stick
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(ctx, ox - sw / 2 + 3, -sh / 2 + 4, 5, sh - 8, 2.5);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#450a0a';
    ctx.stroke();
  }
  // tali pengikat
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-sw * 1.5 - 4, -sh * 0.18, sw * 3 + 8, 7);
  ctx.fillRect(-sw * 1.5 - 4, sh * 0.18 - 7, sw * 3 + 8, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-sw * 1.5 - 4, -sh * 0.18, sw * 3 + 8, 2);
  // label
  ctx.fillStyle = '#fbbf24';
  rr(ctx, -sw * 1.5 - 2, -6, sw * 3 + 4, 12, 3);
  ctx.fill();
  ctx.fillStyle = '#450a0a';
  ctx.font = `900 ${Math.max(9, r * 0.34)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TNT', 0, 0);
  // sumbu
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -sh / 2);
  ctx.quadraticCurveTo(r * 0.5, -sh / 2 - r * 0.5, r * 0.75, -sh / 2 - r * 0.28);
  ctx.stroke();
  // percikan api
  const fx = r * 0.75;
  const fy = -sh / 2 - r * 0.28;
  const fl = 1 + 0.35 * Math.sin(t * 43) + 0.2 * Math.sin(t * 97);
  const sg = ctx.createRadialGradient(fx, fy, 1, fx, fy, 16 * fl);
  sg.addColorStop(0, 'rgba(255,250,200,1)');
  sg.addColorStop(0.4, 'rgba(251,191,36,0.9)');
  sg.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(fx, fy, 16 * fl, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.arc(fx, fy, 3.6 * fl, 0, TAU);
  ctx.fill();
}

/**
 * Lapisan bahaya dinamit: blink merah + tengkorak + tint merah.
 * Digambar SETELAH body (tidak di-rotate agar ikon tegak).
 */
function drawDynamiteDanger(ctx: CanvasRenderingContext2D, it: FlyingItem, t: number): void {
  const r = it.r;
  const pulse = 0.5 + 0.5 * Math.sin(t * 11 + it.id * 1.7);
  // aura merah berdenyut
  const glow = ctx.createRadialGradient(it.x, it.y, r * 0.4, it.x, it.y, r * 2.4);
  glow.addColorStop(0, `rgba(239,68,68,${0.30 + 0.25 * pulse})`);
  glow.addColorStop(1, 'rgba(239,68,68,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(it.x, it.y, r * 2.4, 0, TAU);
  ctx.fill();
  // ring peringatan putus-putus
  ctx.save();
  ctx.strokeStyle = `rgba(239,68,68,${0.55 + 0.4 * pulse})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = -t * 60;
  ctx.beginPath();
  ctx.arc(it.x, it.y, r * 1.55, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // ikon tengkorak melayang di atas (tegak, berdenyut)
  const bobY = Math.sin(t * 6 + it.id) * 4;
  const skullR = r * (0.95 + 0.12 * pulse);
  ctx.save();
  ctx.font = `${Math.round(skullR)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(239,68,68,0.9)';
  ctx.shadowBlur = 10;
  ctx.fillText('💀', it.x, it.y - r * 1.85 + bobY);
  ctx.restore();
  // tint merah pada badan (berkedip)
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.16 * pulse;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(it.x, it.y, r * 1.05, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, it: FlyingItem, t: number): void {
  ctx.save();
  ctx.translate(it.x, it.y);
  // bayangan ambient
  ctx.fillStyle = 'rgba(10,8,4,0.20)';
  ctx.beginPath();
  ctx.ellipse(0, it.r * 0.85, it.r * 0.95, it.r * 0.30, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(it.rot);
  if (it.half) {
    // belahan: eksterior terpotong + wajah irisan bertekstur di bidang potong
    ctx.save();
    ctx.beginPath();
    if (it.side === 0) ctx.rect(-it.r * 2, -it.r * 2, it.r * 4, it.r * 2);
    else ctx.rect(-it.r * 2, 0, it.r * 4, it.r * 2);
    ctx.clip();
    drawBody(ctx, it.kind, it.r, it.id, t);
    ctx.restore();
    // wajah irisan: elips di bidang potong
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, it.r * 1.0, it.r * 0.36, 0, 0, TAU);
    ctx.clip();
    drawCutFace(ctx, it.kind, it.r, it.id);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, it.r * 1.0, it.r * 0.36, 0, 0, TAU);
    ctx.stroke();
  } else {
    drawBody(ctx, it.kind, it.r, it.id, t);
  }
  ctx.restore();
  if (it.kind === 'dinamit' && !it.half) drawDynamiteDanger(ctx, it, t);
}

/* ---------------- trail: responsif, terinterpolasi ---------------- */

function drawTrail(ctx: CanvasRenderingContext2D, trail: TrailPt[]): void {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(253,224,71,0.9)';
  ctx.shadowBlur = 12;
  // lapis luar (kuning menyala) + inti putih
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1];
      const b = trail[i];
      const fade = (a.t + b.t) / 2;
      const wdt = 14 * fade * (pass === 0 ? 1 : 0.42);
      if (wdt < 0.8) continue;
      ctx.strokeStyle =
        pass === 0
          ? `rgba(253,224,71,${0.8 * fade})`
          : `rgba(255,255,255,${0.95 * fade})`;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // percikan di ujung bilah
  const head = trail[trail.length - 1];
  if (head && head.t > 0.5) {
    const hg = ctx.createRadialGradient(head.x, head.y, 1, head.x, head.y, 18);
    hg.addColorStop(0, 'rgba(255,255,255,0.95)');
    hg.addColorStop(1, 'rgba(253,224,71,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 18, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Panah swipe animasi untuk tutorial (visual 1 kalimat). */
function drawSwipeHint(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
  const cx = W / 2;
  const cy = H * 0.52;
  const ph = (t * 0.9) % 1; // 0..1 gerak menyabet
  const x0 = cx - 110;
  const x1 = cx + 110;
  const x = x0 + (x1 - x0) * ph;
  const y = cy - Math.sin(ph * Math.PI) * 70;
  const alpha = Math.sin(ph * Math.PI);
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.65 * alpha;
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(253,224,71,0.9)';
  ctx.shadowBlur = 14;
  // jejak lengkung
  ctx.beginPath();
  for (let i = 0; i <= 20; i += 1) {
    const p = (ph * i) / 20;
    const px = x0 + (x1 - x0) * p;
    const py = cy - Math.sin(p * Math.PI) * 70;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // ujung jari
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(x, y, 13, -0.6, 1.2);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------------- component ---------------- */

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

export default function TebasMaterial({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const screenRef = useRef<Screen>('tutorial');
  const mutedRef = useRef(false);
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(BK, 0), lives: START_LIVES });
  const [muted, setMuted] = useState(false);
  const hissRig = useRef<HissRig>({ ctx: null, gain: null, lastTarget: -1 });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    mutedRef.current = api.sfx.muted;
    setMuted(api.sfx.muted);
    const rng = mulberry32((Date.now() ^ (Math.random() * 1e9)) | 0);

    const mkClouds = (): Cloud[] => {
      const cs: Cloud[] = [];
      for (let i = 0; i < 9; i += 1) {
        const layer = i % 2;
        cs.push({
          fx: rng(), fy: 0.06 + rng() * 0.4,
          s: 0.55 + rng() * (layer === 0 ? 0.5 : 1.0),
          spd: layer === 0 ? 7 : 16,
          a: layer === 0 ? 0.5 : 0.85,
        });
      }
      return cs;
    };
    const mkBuildings = (): Building[] => {
      const bs: Building[] = [];
      let fx = -0.05;
      while (fx < 1.05) {
        const fw = 0.07 + rng() * 0.09;
        const fh = 0.10 + rng() * 0.16;
        const wins: Array<[number, number]> = [];
        const n = 3 + Math.floor(rng() * 6);
        for (let i = 0; i < n; i += 1) wins.push([0.12 + rng() * 0.76, 0.12 + rng() * 0.76]);
        bs.push({ fx, fw, fh, wins });
        fx += fw + 0.015 + rng() * 0.04;
      }
      return bs;
    };

    const fresh = (): G => ({
      items: [],
      trail: [],
      slashes: [],
      clouds: mkClouds(),
      buildings: mkBuildings(),
      spawnT: 1.0, // item pertama ~1 detik setelah run mulai (fair)
      elapsed: 0,
      runT: 0,
      score: 0,
      lives: START_LIVES,
      rng,
      down: false,
      swipeSlices: 0,
      comboShown: 0,
      flash: 0,
      missFlash: 0,
      slowmoT: 0,
      hitStop: 0,
      nextMilestone: 150,
      newBest: false,
    });
    let g = fresh();
    const hudOf = (): Hud => ({ score: g.score, best: getBest(BK, 0), lives: g.lives });

    const gameOver = (): void => {
      g.newBest = g.score > getBest(BK, 0);
      setBest(BK, g.score);
      api.pushHud({ ...hudOf(), best: getBest(BK, 0) });
      api.sfx.fail();
      hissTarget(hissRig.current, false, mutedRef.current);
      setScreen('over');
    };

    const loseLife = (x: number, y: number, label: string, big: boolean): void => {
      g.lives -= 1;
      api.shake.add(big ? 0.7 : 0.32);
      api.scores.add(x, y, label, {
        color: big ? '#f87171' : '#fca5a5',
        size: big ? 30 : 24,
      });
      api.pushHud(hudOf());
      if (g.lives <= 0) gameOver();
    };

    const doSlice = (ax: number, ay: number, bx: number, by: number): void => {
      const { hit, rest } = sliceCheck(g.items, ax, ay, bx, by);
      if (hit.length === 0) return;
      g.items = rest;
      // kilatan bilah di titik tebasan
      g.slashes.push({ x1: ax, y1: ay, x2: bx, y2: by, t: 1 });
      if (g.slashes.length > 8) g.slashes.shift();
      let dyn = 0;
      for (const it of hit) {
        if (it.kind === 'dinamit') {
          dyn += 1;
          continue;
        }
        const halves = splitItem(it, g.rng);
        g.items.push(...halves);
        g.score += slicePoints();
        g.swipeSlices += 1;
        // semburan juicy sesuai material
        api.particles.spawn(it.x, it.y, {
          count: 24, colors: SPLASH[it.kind], speed: [90, 400],
          life: [0.35, 0.85], size: [2, 6.5], gravity: 750, shape: 'rect', rotation: true,
        });
        // tetesan jus untuk semangka
        if (it.kind === 'semangka') {
          api.particles.spawn(it.x, it.y, {
            count: 10, colors: ['#ef4444', '#dc2626', '#fca5a5'], speed: [60, 260],
            life: [0.4, 0.9], size: [2.5, 5], gravity: 1100, shape: 'circle',
          });
        }
        api.scores.add(it.x, it.y - 10, `+${slicePoints()}`, { color: '#fde047', size: 22 });
        api.sfx.pop(0.9 + g.rng() * 0.5);
      }
      for (const it of hit) {
        if (it.kind !== 'dinamit') continue;
        // KENA DINAMIT: hit-stop + ledakan besar + feedback keras
        g.hitStop = 0.06;
        g.flash = 1;
        api.sfx.crumble(1.2);
        api.particles.spawn(it.x, it.y, {
          count: 52, colors: SPLASH.dinamit, speed: [140, 560],
          life: [0.4, 1.1], size: [2, 8], gravity: 480, shape: 'spark',
        });
        api.particles.spawn(it.x, it.y, {
          count: 16, colors: ['#450a0a', '#1f2937', '#6b7280'], speed: [40, 220],
          life: [0.6, 1.3], size: [3, 8], gravity: 300, shape: 'circle',
        });
        loseLife(it.x, it.y - 30, 'DINAMIT! -1⛑️', true);
      }
      if (dyn === 0) {
        const bonus = comboBonus(g.swipeSlices);
        if (g.swipeSlices >= COMBO_MIN && g.swipeSlices > g.comboShown) {
          g.comboShown = g.swipeSlices;
          g.score += bonus;
          // SLOW-MO kombo: timeScale 0.3 selama 300ms
          g.slowmoT = SLOWMO_T;
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `KOMBO x${g.swipeSlices}! +${bonus}`, { size: 34, color: '#fde047' });
          api.sfx.chime(3);
          api.shake.add(0.22);
        }
      }
      if (g.score >= g.nextMilestone) {
        g.nextMilestone += 150;
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, MILESTONES[Math.floor(g.rng() * MILESTONES.length)], { size: 22, color: '#bae6fd' });
        api.sfx.chime(2);
      }
      api.pushHud(hudOf());
    };

    /** Tambah titik trail + slice per sub-segmen (interpolasi ≤6px). */
    const pushTrail = (x: number, y: number): void => {
      const last = g.trail[g.trail.length - 1];
      if (!last) {
        g.trail.push({ x, y, t: 1 });
        return;
      }
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) return;
      const steps = Math.min(24, Math.max(1, Math.ceil(dist / 6)));
      let px = last.x;
      let py = last.y;
      for (let i = 1; i <= steps; i += 1) {
        const qx = last.x + (dx * i) / steps;
        const qy = last.y + (dy * i) / steps;
        g.trail.push({ x: qx, y: qy, t: 1 });
        doSlice(px, py, qx, qy);
        px = qx;
        py = qy;
      }
      if (g.trail.length > 48) g.trail.splice(0, g.trail.length - 48);
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      ensureHiss(hissRig.current);
      if (screenRef.current !== 'play') return;
      g.down = true;
      g.swipeSlices = 0;
      g.comboShown = 0;
      g.trail = [{ x: p.x, y: p.y, t: 1 }];
      doSlice(p.x, p.y, p.x, p.y);
    };
    api.input.onMove = (p) => {
      if (!g.down || screenRef.current !== 'play') return;
      pushTrail(p.x, p.y);
    };
    api.input.onUp = () => {
      g.down = false;
    };

    api.setUpdate((dt) => {
      g.elapsed += dt;
      const playing = screenRef.current === 'play';

      // slow-mo kombo: dunia melambat, UI tetap real-time
      const ts = g.slowmoT > 0 ? SLOWMO_SCALE : 1;
      g.slowmoT = Math.max(0, g.slowmoT - dt);
      const edt = dt * ts;

      if (g.hitStop > 0) {
        // hit-stop 60ms: dunia membeku, efek tetap jalan
        g.hitStop -= dt;
      } else if (playing && g.lives > 0) {
        g.runT += edt;
        const wave = waveFor(g.runT);
        g.spawnT -= edt;
        if (g.spawnT <= 0) {
          g.spawnT = wave.interval * (0.7 + g.rng() * 0.6);
          if (g.items.length < MAX_ITEMS) {
            g.items.push(spawnItem(g.rng, api.W, api.H, wave.speedMul, {
              noDinamit: g.runT < GRACE_NO_DYNAMITE_T,
            }));
          }
        }
      } else if (screenRef.current === 'tutorial') {
        g.spawnT -= edt;
        if (g.spawnT <= 0) {
          g.spawnT = 1.4;
          if (g.items.length < 5) g.items.push(spawnItem(g.rng, api.W, api.H, 0.8));
        }
      }

      if (g.hitStop <= 0) {
        const stepped = stepItems(g.items, edt, api.W, api.H);
        g.items = stepped.items;
        // MISS = -1 nyawa dengan feedback JELAS (kecuali dinamit: beruntung)
        for (const m of stepped.missed) {
          const lost = missLivesLost(m.kind);
          if (lost > 0 && playing && g.lives > 0) {
            g.missFlash = 1;
            api.sfx.thud(1.1);
            loseLife(Math.min(Math.max(m.x, 70), api.W - 70), api.H - 90, 'MISS! -1⛑️', false);
          }
        }
      }

      for (const pt of g.trail) pt.t -= dt * 2.2;
      g.trail = g.trail.filter((p) => p.t > 0);
      for (const sl of g.slashes) sl.t -= dt * 4;
      g.slashes = g.slashes.filter((s2) => s2.t > 0);
      g.flash = Math.max(0, g.flash - dt * 2.2);
      g.missFlash = Math.max(0, g.missFlash - dt * 1.8);

      // desis sumbu: nyala saat ada dinamit di layar
      const anyDyn = playing && g.items.some((it) => it.kind === 'dinamit' && !it.half);
      hissTarget(hissRig.current, anyDyn, mutedRef.current);

      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') {
          api.loop.setPaused(true);
          setScreen('pause');
        } else if (screenRef.current === 'pause') {
          api.loop.setPaused(false);
          setScreen('play');
        }
      }
    });

    api.setRender(() => {
      const { ctx, W, H } = api;
      drawBackground(ctx, W, H, g);
      for (const it of g.items) drawItem(ctx, it, g.elapsed);

      // kilatan bilah
      for (const sl of g.slashes) {
        ctx.save();
        ctx.globalAlpha = sl.t;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(sl.x1, sl.y1);
        ctx.lineTo(sl.x2, sl.y2);
        ctx.stroke();
        ctx.restore();
      }

      drawTrail(ctx, g.trail);

      // vignette slow-mo (biru tipis)
      if (g.slowmoT > 0) {
        ctx.fillStyle = `rgba(125,211,252,${0.10 * (g.slowmoT / SLOWMO_T)})`;
        ctx.fillRect(0, 0, W, H);
      }
      // flash kena dinamit
      if (g.flash > 0) {
        ctx.fillStyle = `rgba(255,240,230,${0.7 * g.flash})`;
        ctx.fillRect(0, 0, W, H);
      }
      // flash tepi merah saat miss
      if (g.missFlash > 0) {
        const m = 0.55 * g.missFlash;
        const eg = 46;
        const mk = (x: number, y: number, w: number, h: number, horiz: boolean): void => {
          const gr = horiz
            ? ctx.createLinearGradient(x, y, x, y + h)
            : ctx.createLinearGradient(x, y, x + w, y);
          gr.addColorStop(0, `rgba(239,68,68,${m})`);
          gr.addColorStop(1, 'rgba(239,68,68,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(x, y, w, h);
        };
        mk(0, 0, W, eg, true);
        mk(0, H - eg, W, eg, true);
        mk(0, 0, eg, H, false);
        mk(W - eg, 0, eg, H, false);
      }

      // hint swipe animasi di tutorial
      if (screenRef.current === 'tutorial') {
        drawSwipeHint(ctx, W, H, g.elapsed);
      }
    });

    api.loop.start();
    api.pushHud(hudOf());

    const doReset = (): void => {
      g = fresh();
      api.pushHud(hudOf());
    };
    resetRef.current = doReset;
    startRef.current = () => {
      g = fresh();
      api.loop.setPaused(false);
      setScreen('play');
    };

    // Arcade-test hook (inert tanpa ?arcade di URL).
    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__tebas = {
        get screen() { return screenRef.current; },
        get score() { return g.score; },
        get lives() { return g.lives; },
        get itemCount() { return g.items.length; },
        get runT() { return g.runT; },
        get slowmoT() { return g.slowmoT; },
        get items() {
          return g.items.map((it) => ({ x: Math.round(it.x), y: Math.round(it.y), kind: it.kind, half: it.half, r: Math.round(it.r) }));
        },
        start() { startRef.current(); },
        restart() { resetRef.current(); api.loop.setPaused(false); setScreen('play'); },
        /** Paksa satu dinamit melayang di tengah (untuk screenshot & uji ledakan). */
        forceDynamite() {
          const it = spawnItem(g.rng, api.W, api.H, 0.6);
          it.kind = 'dinamit';
          it.x = api.W / 2;
          it.y = api.H * 0.45;
          it.vx = 0;
          it.vy = -160;
          it.r = 30;
          g.items.push(it);
          return { x: it.x, y: it.y };
        },
      };
    }

    return () => {
      apiRef.current = null;
      hissTarget(hissRig.current, false, true);
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__tebas;
    };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    ensureHiss(hissRig.current);
    startRef.current();
  };

  const restart = (): void => {
    const api = apiRef.current;
    resetRef.current();
    if (api) api.loop.setPaused(false);
    setScreen('play');
  };

  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    if (screenRef.current === 'play') {
      api.loop.setPaused(true);
      setScreen('pause');
    } else if (screenRef.current === 'pause') {
      api.loop.setPaused(false);
      setScreen('play');
    }
  };

  const toggleMute = (): void => {
    const api = apiRef.current;
    if (api) api.sfx.ensure();
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (api && api.sfx.muted !== next) api.sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(10,18,32,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    backdropFilter: 'blur(6px)',
  };
  const card: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(6,12,24,0.62)', backdropFilter: 'blur(4px)', zIndex: 10, padding: 20,
  };
  const panel: React.CSSProperties = {
    background: 'linear-gradient(160deg, #10233d, #0a1628)',
    border: '1px solid rgba(253,224,71,0.25)', borderRadius: 20, padding: 24,
    maxWidth: 340, width: '100%', textAlign: 'center', color: '#e8eef7',
    boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
  };
  const bigBtn: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: 10, padding: '13px 16px', borderRadius: 14,
    border: 'none', fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 520, overflow: 'hidden', borderRadius: 18, background: '#0b2440', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }} />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,18,32,0.55)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, padding: '8px 12px', color: '#fff', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontWeight: 900, fontSize: 20, lineHeight: 1 }}>🍉 {hud.score}</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>Terbaik: {hud.best}</div>
          <div style={{ fontSize: 17, marginTop: 2, letterSpacing: 2 }} aria-label={`${hud.lives} nyawa`}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ opacity: i < hud.lives ? 1 : 0.22, filter: i < hud.lives ? 'none' : 'grayscale(1)' }}>⛑️</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label={screen === 'play' ? 'Jeda' : 'Lanjut'}>{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label={muted ? 'Nyalakan suara' : 'Bisukan'}>{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>🍉⚔️</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 24, color: '#fde047' }}>TEBAS MATERIAL</h2>
            {/* Tutorial 1 kalimat + visual (panah swipe animasi di canvas) */}
            <p style={{ fontSize: 14.5, lineHeight: 1.6, opacity: 0.95, margin: '6px 0 4px' }}>
              <b>Tebas</b> material yang beterbangan dengan jarimu — <b>JANGAN</b> sentuh <b>💥dinamit💥</b>!
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, opacity: 0.75, margin: '0 0 6px' }}>
              +10 per tebasan • kombo x{COMBO_MIN}+ = slow-mo • 3 ⛑️ • miss = -1 ⛑️
            </p>
            <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={startGame}>
              Mulai Menebas
            </button>
          </div>
        </div>
      )}

      {screen === 'pause' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>☕</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22 }}>JEDA</h2>
            <p style={{ fontSize: 13, opacity: 0.85 }}>Mandor lagi ngopi. Material menunggu dengan sabar (tidak seperti klien).</p>
            <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={togglePause}>Lanjutkan</button>
            <button style={{ ...bigBtn, background: 'rgba(255,255,255,0.12)', color: '#fff' }} onClick={restart}>Mulai Ulang</button>
            <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
          </div>
        </div>
      )}

      {screen === 'over' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>💥</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#f87171' }}>PROYEK MELEDAK!</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, opacity: 0.92 }}>
              3 helm habis! Proyek diledakkan sebelum serah terima.
              Mandor sudah kabur duluan — seperti biasa.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '12px 0 4px' }}>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 16px' }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>SKOR</div>
                <div style={{ fontWeight: 900, fontSize: 24, color: '#fde047' }}>{hud.score}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 16px' }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>TERBAIK</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>{hud.best}</div>
              </div>
            </div>
            <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={restart}>Tebas Lagi</button>
            <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
          </div>
        </div>
      )}
    </div>
  );
}