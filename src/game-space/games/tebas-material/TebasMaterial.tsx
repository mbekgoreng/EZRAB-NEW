/**
 * Tebas Material — fruit-ninja 2D: tebas material proyek yang beterbangan.
 * Pure rules in ./logic.ts; this file is rendering + input + juice.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  mulberry32, spawnItem, stepItems, sliceCheck, splitItem,
  waveFor, comboBonus, slicePoints, SPLASH, START_LIVES, COMBO_MIN,
  type FlyingItem, type ItemKind, type Rng,
} from './logic';

const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const BK = bestKey('tebas-material', 'best');

interface Hud {
  score: number;
  best: number;
  lives: number;
}

interface TrailPt { x: number; y: number; t: number }
interface Cloud { fx: number; fy: number; s: number; spd: number; a: number }
interface Building { fx: number; fw: number; fh: number; wins: Array<[number, number]> }

interface G {
  items: FlyingItem[];
  trail: TrailPt[];
  clouds: Cloud[];
  buildings: Building[];
  spawnT: number;
  elapsed: number;
  score: number;
  lives: number;
  rng: Rng;
  down: boolean;
  swipeSlices: number;
  comboShown: number;
  flash: number;
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

/* ---------------- background ---------------- */

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

  // clouds (2 parallax layers) — warm dusk tint
  for (const c of g.clouds) {
    const cx = ((c.fx * W + g.elapsed * c.spd) % (W + 320) + W + 320) % (W + 320) - 160;
    const cy = c.fy * H;
    ctx.fillStyle = `rgba(255,226,188,${c.a * 0.75})`;
    for (const [ox, oy, s] of [[-34, 6, 0.75], [0, 0, 1], [34, 8, 0.7], [8, -12, 0.6]] as const) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * c.s, cy + oy * c.s, 34 * c.s * s, 15 * c.s * s, 0, 0, TAU);
      ctx.fill();
    }
  }

  // far buildings silhouette
  const horizon = H - 84;
  for (const b of g.buildings) {
    const bx = b.fx * W;
    const bw = b.fw * W;
    const bh = b.fh * H;
    ctx.fillStyle = '#182a44';
    ctx.fillRect(bx, horizon - bh, bw, bh);
    ctx.fillStyle = 'rgba(255,215,130,0.75)';
    for (const [wx, wy] of b.wins) {
      ctx.fillRect(bx + wx * bw, horizon - bh + wy * bh, 5, 7);
    }
  }

  // crane silhouette
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
  // counter-jib weight
  ctx.fillRect(crx - W * 0.16 - 8, horizon - H * 0.40 - 16, 16, 22);

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
  // dirt speckles
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

/* ---------------- item bodies ---------------- */

function drawBody(ctx: CanvasRenderingContext2D, kind: ItemKind, r: number, id: number, t: number): void {
  if (kind === 'bata') {
    const w = 2 * r;
    const h = 1.02 * r;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#f97316');
    g.addColorStop(1, '#9a3412');
    ctx.fillStyle = g;
    rr(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7c2d12';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,205,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 3, 0); ctx.lineTo(w / 2 - 3, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 6, -h / 2 + 3); ctx.lineTo(-w / 6, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 6, 3); ctx.lineTo(w / 6, h / 2 - 3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    rr(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, 9, 4);
    ctx.fill();
  } else if (kind === 'kayu') {
    const w = 2.3 * r;
    const h = 0.85 * r;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#d99a4e');
    g.addColorStop(1, '#8a5a24');
    ctx.fillStyle = g;
    rr(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#5d3a15';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(93,58,21,0.55)';
    ctx.lineWidth = 1.6;
    for (const oy of [-h * 0.22, 0, h * 0.22]) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 6, oy);
      ctx.bezierCurveTo(-w / 6, oy - 4, w / 6, oy + 4, w / 2 - 6, oy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,70,25,0.6)';
    ctx.beginPath();
    ctx.ellipse(w * 0.22, 0, 5, 3.4, 0.4, 0, TAU);
    ctx.fill();
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
    ctx.strokeStyle = 'rgba(13,63,28,0.8)';
    ctx.lineWidth = 5;
    for (const fx of [-0.55, -0.18, 0.18, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(fx * r, 0, r * 0.13, r * 0.92, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.30, r * 0.16, -0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#6b4a1f';
    rr(ctx, -3.5, -r - 7, 7, 12, 3);
    ctx.fill();
  } else if (kind === 'beton') {
    const w = 1.9 * r;
    const h = 1.28 * r;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#c3c9d2');
    g.addColorStop(1, '#6b7280');
    ctx.fillStyle = g;
    rr(ctx, -w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#374151';
    ctx.stroke();
    for (let i = 0; i < 14; i += 1) {
      const px = (hash(id * 7 + i * 13) - 0.5) * (w - 14);
      const py = (hash(id * 3 + i * 29) - 0.5) * (h - 14);
      ctx.fillStyle = hash(id + i) > 0.5 ? 'rgba(55,65,81,0.5)' : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(px, py, 1.4 + hash(i * 5 + id) * 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(55,65,81,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 5, -h * 0.18); ctx.lineTo(w / 2 - 5, -h * 0.18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 2 + 5, h * 0.18); ctx.lineTo(w / 2 - 5, h * 0.18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, 8, 4);
    ctx.fill();
  } else {
    // dinamit: bundle of 3 sticks
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
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#450a0a';
      ctx.stroke();
    }
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-sw * 1.5 - 4, -sh * 0.18, sw * 3 + 8, 7);
    ctx.fillRect(-sw * 1.5 - 4, sh * 0.18 - 7, sw * 3 + 8, 7);
    ctx.fillStyle = '#fbbf24';
    rr(ctx, -sw * 1.5 - 2, -6, sw * 3 + 4, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#450a0a';
    ctx.font = `900 ${Math.max(9, r * 0.34)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TNT', 0, 0);
    // fuse
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -sh / 2);
    ctx.quadraticCurveTo(r * 0.5, -sh / 2 - r * 0.5, r * 0.75, -sh / 2 - r * 0.28);
    ctx.stroke();
    // spark
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
}

function drawSemangkaInterior(ctx: CanvasRenderingContext2D, r: number, id: number): void {
  const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#fca5a5');
  g.addColorStop(0.6, '#f87171');
  g.addColorStop(1, '#dc2626');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#1d7a38';
  ctx.beginPath();
  ctx.arc(0, 0, r - 5, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#bbf7d0';
  ctx.beginPath();
  ctx.arc(0, 0, r - 10, 0, TAU);
  ctx.stroke();
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
}

function drawItem(ctx: CanvasRenderingContext2D, it: FlyingItem, t: number): void {
  ctx.save();
  ctx.translate(it.x, it.y);
  // ambient shadow blob
  ctx.fillStyle = 'rgba(10,8,4,0.20)';
  ctx.beginPath();
  ctx.ellipse(0, it.r * 0.85, it.r * 0.95, it.r * 0.30, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(it.rot);
  if (it.half) {
    ctx.save();
    ctx.beginPath();
    if (it.side === 0) ctx.rect(-it.r * 2, -it.r * 2, it.r * 4, it.r * 2);
    else ctx.rect(-it.r * 2, 0, it.r * 4, it.r * 2);
    ctx.clip();
    if (it.kind === 'semangka') drawSemangkaInterior(ctx, it.r, it.id);
    else drawBody(ctx, it.kind, it.r, it.id, t);
    ctx.restore();
    // cut edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-it.r * 1.05, 0);
    ctx.lineTo(it.r * 1.05, 0);
    ctx.stroke();
  } else {
    drawBody(ctx, it.kind, it.r, it.id, t);
  }
  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: TrailPt[]): void {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(253,224,71,0.9)';
  ctx.shadowBlur = 12;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1];
      const b = trail[i];
      const wdt = 13 * ((a.t + b.t) / 2) * (pass === 0 ? 1 : 0.42);
      if (wdt < 0.8) continue;
      ctx.strokeStyle =
        pass === 0
          ? `rgba(253,224,71,${0.75 * ((a.t + b.t) / 2)})`
          : `rgba(255,255,255,${0.9 * ((a.t + b.t) / 2)})`;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ---------------- component ---------------- */

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

export default function TebasMaterial({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(BK, 0), lives: START_LIVES });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
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
      clouds: mkClouds(),
      buildings: mkBuildings(),
      spawnT: 0.4,
      elapsed: 0,
      score: 0,
      lives: START_LIVES,
      rng,
      down: false,
      swipeSlices: 0,
      comboShown: 0,
      flash: 0,
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
      setScreen('over');
    };

    const doSlice = (ax: number, ay: number, bx: number, by: number): void => {
      const { hit, rest } = sliceCheck(g.items, ax, ay, bx, by);
      if (hit.length === 0) return;
      g.items = rest;
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
        api.particles.spawn(it.x, it.y, {
          count: 22, colors: SPLASH[it.kind], speed: [90, 380],
          life: [0.35, 0.8], size: [2, 6], gravity: 700, shape: 'rect', rotation: true,
        });
        api.scores.add(it.x, it.y - 10, `+${slicePoints()}`, { color: '#fde047', size: 22 });
        api.sfx.pop(0.9 + g.rng() * 0.5);
      }
      for (const it of hit) {
        if (it.kind !== 'dinamit') continue;
        g.lives -= 1;
        g.flash = 1;
        api.shake.add(0.7);
        api.sfx.crumble(1.2);
        api.particles.spawn(it.x, it.y, {
          count: 46, colors: SPLASH.dinamit, speed: [140, 520],
          life: [0.4, 1.0], size: [2, 7], gravity: 500, shape: 'spark',
        });
        api.scores.add(it.x, it.y - 14, 'DINAMIT!', { color: '#f87171', size: 28 });
      }
      if (dyn === 0) {
        const bonus = comboBonus(g.swipeSlices);
        if (g.swipeSlices >= COMBO_MIN && g.swipeSlices > g.comboShown) {
          g.comboShown = g.swipeSlices;
          g.score += bonus;
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `KOMBO x${g.swipeSlices}! +${bonus}`, { size: 34, color: '#fde047' });
          api.sfx.chime(3);
          api.shake.add(0.25);
        }
      }
      if (g.score >= g.nextMilestone) {
        g.nextMilestone += 150;
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, MILESTONES[Math.floor(g.rng() * MILESTONES.length)], { size: 22, color: '#bae6fd' });
        api.sfx.chime(2);
      }
      api.pushHud(hudOf());
      if (g.lives <= 0) gameOver();
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play') return;
      g.down = true;
      g.swipeSlices = 0;
      g.comboShown = 0;
      g.trail = [{ x: p.x, y: p.y, t: 1 }];
      doSlice(p.x, p.y, p.x, p.y);
    };
    api.input.onMove = (p) => {
      if (!g.down || screenRef.current !== 'play') return;
      const last = g.trail[g.trail.length - 1];
      if (!last) return;
      if (Math.hypot(p.x - last.x, p.y - last.y) < 3) return;
      g.trail.push({ x: p.x, y: p.y, t: 1 });
      if (g.trail.length > 26) g.trail.shift();
      doSlice(last.x, last.y, p.x, p.y);
    };
    api.input.onUp = () => {
      g.down = false;
    };

    api.setUpdate((dt) => {
      g.elapsed += dt;
      const playing = screenRef.current === 'play';
      if (playing && g.lives > 0) {
        const wave = waveFor(g.elapsed);
        g.spawnT -= dt;
        if (g.spawnT <= 0) {
          g.spawnT = wave.interval * (0.7 + g.rng() * 0.6);
          if (g.items.length < 15) g.items.push(spawnItem(g.rng, api.W, api.H, wave.speedMul));
        }
      } else if (screenRef.current === 'tutorial') {
        // ambient drifting items behind the tutorial card
        g.spawnT -= dt;
        if (g.spawnT <= 0) {
          g.spawnT = 1.4;
          if (g.items.length < 5) g.items.push(spawnItem(g.rng, api.W, api.H, 0.8));
        }
      }
      const stepped = stepItems(g.items, dt, api.W, api.H);
      g.items = stepped.items;
      for (const pt of g.trail) pt.t -= dt * 2.4;
      g.trail = g.trail.filter((p) => p.t > 0);
      g.flash = Math.max(0, g.flash - dt * 2.4);
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
      drawTrail(ctx, g.trail);
      if (g.flash > 0) {
        ctx.fillStyle = `rgba(255,246,230,${0.75 * g.flash})`;
        ctx.fillRect(0, 0, W, H);
      }
    });

    api.loop.start();
    api.pushHud(hudOf());
    resetRef.current = () => {
      g = fresh();
      api.pushHud(hudOf());
    };
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    api.loop.setPaused(false);
    // reset via soft reload of state: easiest is full remount through key change
    setScreen('play');
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
      // sfx singleton holds the real flag; keep in sync
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
            <p style={{ fontSize: 13.5, lineHeight: 1.55, opacity: 0.92, margin: '6px 0 10px' }}>
              Material beterbangan dari bawah proyek. <b>Tebas dengan jarimu</b> — anggap saja
              sedang menebas revisi RAB yang ke-13 kalinya.
            </p>
            <ul style={{ textAlign: 'left', fontSize: 13, lineHeight: 1.9, margin: '0 0 6px', paddingLeft: 20 }}>
              <li>✅ Tebas bata, kayu, semangka, beton: <b>+10</b></li>
              <li>🔥 {COMBO_MIN}x tebas beruntun = <b>KOMBO + bonus</b></li>
              <li>💥 <b>JANGAN</b> tebas dinamit — helm melayang!</li>
              <li>🪖 3 helm habis = proyek meledak duluan</li>
            </ul>
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
              Kena dinamit 3x! Proyek diledakkan sebelum serah terima.
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
