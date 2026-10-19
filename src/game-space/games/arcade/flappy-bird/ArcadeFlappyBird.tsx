/**
 * ArcadeFlappyBird — "Mandor Terbang: Hindari Crane".
 * Mandor berhelm terbang menembus celah tower crane saat senja di proyek.
 * Fisika & tabrakan murni di logic.ts; file ini render + juice + UI.
 *
 * Fairness (wajib):
 *  - 'ready': burung hover bobbing, gate diam. Tap PERTAMA = flap + mulai run.
 *  - Grace 1 detik setelah mulai: tabrakan gate nonaktif (bubble pelindung).
 *  - Buffer input 100ms.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d';
import { popText } from '../../../engine2d';

import {
  createState, flap, updateState, updateReady, startRun, readyBobOffset,
  inGrace, medalFor, MEDAL_LABEL, FLAP_BUFFER_S, BIRD_R,
  type FlapState, type Gate, type DeathCause, type Bird,
} from './logic';

const SLUG = 'flappy-bird';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const A2TEST =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('a2test');

type Screen = 'tutorial' | 'ready' | 'play' | 'pause' | 'over';

/* ================= drawing helpers ================= */

function hazardStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#f5b301';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#232323';
  for (let sx = x - h; sx < x + w + h; sx += 15) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + 7.5, y + h);
    ctx.lineTo(sx + 7.5 + h, y);
    ctx.lineTo(sx + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Menara lattice crane dari tanah. */
function latticeTower(ctx: CanvasRenderingContext2D, x: number, yTop: number, w: number, h: number): void {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#c78d00');
  grad.addColorStop(0.3, '#ffd23e');
  grad.addColorStop(0.6, '#f0ad00');
  grad.addColorStop(1, '#a86f00');
  ctx.fillStyle = grad;
  ctx.fillRect(x, yTop, w, h);
  ctx.strokeStyle = 'rgba(110,72,0,0.8)';
  ctx.lineWidth = 3;
  const step = 24;
  for (let y = yTop; y < yTop + h; y += step) {
    ctx.beginPath();
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + w - 3, Math.min(y + step, yTop + h));
    ctx.moveTo(x + w - 3, y);
    ctx.lineTo(x + 3, Math.min(y + step, yTop + h));
    ctx.stroke();
  }
  ctx.fillStyle = '#8a5f00';
  ctx.fillRect(x, yTop, 6, h);
  ctx.fillRect(x + w - 6, yTop, 6, h);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x + 7, yTop, 4, h);
  ctx.strokeStyle = '#5c430a';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, yTop, w - 3, h);
}

/** Balok beton gantung (rintangan atas) + kabel. */
function hangingBeam(ctx: CanvasRenderingContext2D, g: Gate): void {
  const x = g.x;
  const w = g.w;
  const topH = g.gapY - g.gapH / 2;
  if (topH <= 0) return;
  // kabel dari langit
  ctx.strokeStyle = '#3a2f18';
  ctx.lineWidth = 4;
  for (const kx of [x + w * 0.25, x + w * 0.75]) {
    ctx.beginPath();
    ctx.moveTo(kx, -30);
    ctx.lineTo(kx, 24);
    ctx.stroke();
  }
  // balok beton
  const bh = Math.min(topH, 46);
  const by = topH - bh;
  const bg = ctx.createLinearGradient(x, by, x, by + bh);
  bg.addColorStop(0, '#b9c0c7');
  bg.addColorStop(0.5, '#9aa3ad');
  bg.addColorStop(1, '#7c8792');
  ctx.fillStyle = bg;
  ctx.fillRect(x - 6, by, w + 12, bh);
  // tekstur beton: bintik
  ctx.fillStyle = 'rgba(60,70,80,0.25)';
  for (let i = 0; i < 14; i += 1) {
    const px = x - 2 + ((i * 37) % (w + 4));
    const py = by + 6 + ((i * 53) % (bh - 12));
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x - 6, by, w + 12, 5);
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 6, by, w + 12, bh);
  // kait
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(x + w / 2 - 7, by - 12, 14, 14);
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + w / 2 - 7, by - 12, 14, 14);
  hazardStripes(ctx, x - 6, by + bh - 12, w + 12, 12);
}

/** Gate tower crane: balok gantung (atas) + menara lattice (bawah). */
function drawGate(ctx: CanvasRenderingContext2D, g: Gate, groundY: number, t: number): void {
  const x = g.x;
  const w = g.w;
  const botY = g.gapY + g.gapH / 2;
  hangingBeam(ctx, g);
  if (botY < groundY) {
    // fondasi
    ctx.fillStyle = '#8f979f';
    ctx.fillRect(x - 8, groundY - 26, w + 16, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - 8, groundY - 26, w + 16, 5);
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x - 8, groundY - 26, w + 16, 26);
    latticeTower(ctx, x, botY + 12, w, groundY - 26 - (botY + 12));
    hazardStripes(ctx, x, botY, w, 12);
    // lampu peringatan berkedip
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(239,68,68,${0.5 + 0.5 * pulse})`;
    ctx.beginPath();
    ctx.arc(x + w / 2, botY + 20, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(239,68,68,${0.18 * pulse})`;
    ctx.beginPath();
    ctx.arc(x + w / 2, botY + 20, 11, 0, TAU);
    ctx.fill();
  }
}

/** Mandor berhelm: rompi oranye, helm kuning, lengan mengepak. */
function drawMandor(ctx: CanvasRenderingContext2D, b: Bird, t: number, wing: number, squash: number): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  if (squash > 0) ctx.scale(1 + squash * 0.1, 1 - squash * 0.12);

  // lengan mengepak
  const wingA = -0.8 + wing * 1.4 + Math.sin(t * 15) * 0.1;
  ctx.save();
  ctx.translate(-7, 13);
  ctx.rotate(wingA);
  const wg = ctx.createLinearGradient(0, 0, -24, 0);
  wg.addColorStop(0, '#3b82f6');
  wg.addColorStop(1, '#1e40af');
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.ellipse(-13, 0, 14, 7, 0.25, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#16295e';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // rompi
  const vg = ctx.createLinearGradient(0, 6, 0, 36);
  vg.addColorStop(0, '#fb923c');
  vg.addColorStop(0.55, '#f97316');
  vg.addColorStop(1, '#b45309');
  ctx.fillStyle = vg;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(-12, 6, 24, 30, 8);
  else ctx.rect(-12, 6, 24, 30);
  ctx.fill();
  for (const sy of [15, 25]) {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(-12, sy, 24, 4.5);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-12, sy, 24, 1.6);
  }
  ctx.strokeStyle = 'rgba(124,45,18,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // kepala + helm
  const skin = ctx.createRadialGradient(-3, -5, 2, 0, 0, 14);
  skin.addColorStop(0, '#ffd9a8');
  skin.addColorStop(1, '#e8a96c');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f5b301';
  ctx.beginPath();
  ctx.arc(0, -3, 13.5, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-4.5, -10, 4.5, 3, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e0a400';
  ctx.beginPath();
  ctx.ellipse(0, -3, 16.5, 4.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f5b301';
  ctx.beginPath();
  ctx.ellipse(0, -4.1, 16.5, 4, 0, 0, TAU);
  ctx.fill();
  // mata & kumis
  const scared = b.vy > 380 ? 1 : 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(5, -0.5, 4 + scared, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(6.4, -0.5 + scared * 1.4, 2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#4a2f18';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(1.5, 6.5);
  ctx.quadraticCurveTo(6.5, 9, 11, 7);
  ctx.stroke();
  if (scared) {
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.ellipse(5.5, 10, 2.4, 3.2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawClouds(ctx: CanvasRenderingContext2D, t: number, alpha: number, sc: number, lh: number): void {
  for (let i = 0; i < 4; i += 1) {
    const span = LW + 180;
    const cx = (((i * 149 - t * (9 + i * 5)) % span) + span) % span - 90;
    const cy = 56 + ((i * 71) % 120);
    const s = sc * (0.7 + (i % 3) * 0.28);
    const puffs: Array<[number, number, number, number]> = [
      [0, 0, 32, 12], [-20, 4, 19, 8], [22, 4, 21, 9], [-5, -8, 22, 9],
    ];
    ctx.fillStyle = `rgba(255,190,150,${alpha * 0.75})`;
    for (const [ox, oy, rx, ry] of puffs) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * s, cy + (oy + 5) * s, rx * s, ry * s, 0, 0, TAU);
      ctx.fill();
    }
    const cg = ctx.createLinearGradient(0, cy - 15 * s, 0, cy + 13 * s);
    cg.addColorStop(0, `rgba(255,235,225,${alpha})`);
    cg.addColorStop(1, `rgba(255,190,170,${alpha})`);
    ctx.fillStyle = cg;
    for (const [ox, oy, rx, ry] of puffs) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * s, cy + oy * s, rx * s, ry * s, 0, 0, TAU);
      ctx.fill();
    }
    void lh;
  }
}

/** Siluet skyline kota saat senja. */
function drawSkyline(ctx: CanvasRenderingContext2D, t: number, groundY: number, speed: number, color: string, seedOff: number): void {
  const n = 7;
  const span = LW + 140;
  for (let i = 0; i < n; i += 1) {
    const bx = (((i * 103 + seedOff - t * speed) % span) + span) % span - 70;
    const bw = 40 + ((i * 47 + seedOff) % 30);
    const bh = 55 + ((i * 67 + seedOff) % 80);
    ctx.fillStyle = color;
    ctx.fillRect(bx, groundY - bh, bw, bh);
    // jendela menyala
    ctx.fillStyle = 'rgba(255,220,150,0.75)';
    for (let wy = groundY - bh + 9; wy < groundY - 10; wy += 14) {
      for (let wx = bx + 6; wx < bx + bw - 7; wx += 12) {
        if ((((wx * 7 + wy * 11 + seedOff) | 0) % 3) === 0) ctx.fillRect(wx, wy, 4.5, 6.5);
      }
    }
  }
}

/* ================= component ================= */

interface Hud {
  score: number;
  best: number;
}

export default function ArcadeFlappyBird({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const stRef = useRef<FlapState | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [muted, setMuted] = useState(false);
  const [deathCause, setDeathCause] = useState<DeathCause>(null);
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(bestKey(SLUG, 'best')) });

  const fxRef = useRef({
    animT: 0,
    flapAnim: 0,
    squash: 0,
    hitStop: 0,
    bufferedAt: -1,
  });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHudFor = (st: FlapState): void => {
    apiRef.current?.pushHud({ score: st.passed, best: getBest(bestKey(SLUG, 'best')) } as Hud);
  };

  const doDie = (cause: DeathCause): void => {
    const api = apiRef.current;
    const st = stRef.current;
    if (!api || !st) return;
    fxRef.current.hitStop = 0.06;
    fxRef.current.bufferedAt = -1;
    setDeathCause(cause);
    setBest(bestKey(SLUG, 'best'), st.passed);
    api.sfx.fail();
    api.shake.add(0.6);
    api.particles.spawn(st.bird.x, st.bird.y, {
      count: 28, colors: ['#f5b301', '#fb923c', '#ffd9a8', '#ffffff'],
      speed: [100, 380], gravity: 520, life: [0.5, 1.1], size: [2.5, 6],
      shape: 'rect', rotation: true,
    });
    pushHudFor(st);
    window.setTimeout(() => setScreen('over'), 750);
  };

  const restart = (): void => {
    const api = apiRef.current;
    if (!api) return;
    stRef.current = createState((Date.now() % 100000) | 0, api.W, api.H);
    fxRef.current.bufferedAt = -1;
    fxRef.current.hitStop = 0;
    setDeathCause(null);
    pushHudFor(stRef.current);
    setScreen('ready');
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);
    stRef.current = createState((Date.now() % 100000) | 0, api.W, api.H);
    pushHudFor(stRef.current);

    api.onResize((w, h) => {
      const st = stRef.current;
      if (!st) return;
      st.W = w;
      st.H = h;
      st.groundY = h - 64;
    });

    const doFlap = (st: FlapState): void => {
      flap(st.bird);
      api.sfx.pop(1.2);
      fxRef.current.flapAnim = 1;
      fxRef.current.squash = 1;
      api.shake.add(0.06);
      api.particles.spawn(st.bird.x - 13, st.bird.y + 10, {
        count: 8, colors: ['#ffffff', '#ffe9c4', '#f5b301'],
        speed: [60, 190], angle: Math.PI * 0.75, spread: 1.4, up: 60,
        life: [0.3, 0.6], size: [2, 4.5], shape: 'rect', rotation: true,
      });
    };

    api.input.onDown = () => {
      api.sfx.ensure();
      const st = stRef.current;
      if (!st || !st.alive) return;
      if (screenRef.current === 'ready') {
        startRun(st);
        doFlap(st);
        setScreen('play');
      } else if (screenRef.current === 'play') {
        fxRef.current.bufferedAt = fxRef.current.animT;
      }
    };

    api.setUpdate((dt) => {
      const st = stRef.current;
      const fx = fxRef.current;
      if (!st) return;
      fx.animT += dt;
      fx.flapAnim = Math.max(0, fx.flapAnim - dt * 5);
      fx.squash = Math.max(0, fx.squash - dt * 7);

      if (api.input.wasPressed('Space')) {
        api.sfx.ensure();
        if (screenRef.current === 'ready') {
          startRun(st);
          doFlap(st);
          setScreen('play');
        } else if (screenRef.current === 'play' && st.alive) {
          fx.bufferedAt = fx.animT;
        }
      }
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') {
          api.loop.setPaused(true);
          setScreen('pause');
        } else if (screenRef.current === 'pause') {
          api.loop.setPaused(false);
          setScreen('play');
        }
      }

      if (screenRef.current === 'tutorial' || screenRef.current === 'ready') {
        updateReady(st, dt);
        return;
      }
      if (screenRef.current !== 'play' || !st.alive) return;

      if (fx.hitStop > 0) {
        fx.hitStop -= dt;
        return;
      }

      if (fx.bufferedAt >= 0 && fx.animT - fx.bufferedAt <= FLAP_BUFFER_S) {
        fx.bufferedAt = -1;
        doFlap(st);
      } else if (fx.bufferedAt >= 0) {
        fx.bufferedAt = -1;
      }

      const res = updateState(st, dt, Math.random);
      if (res.scored) {
        api.sfx.pop(1 + Math.min(0.6, st.passed * 0.02));
        api.scores.add(st.bird.x + 30, st.bird.y - 34, '+1', { color: '#ffd166', size: 26 });
        if (st.passed % 10 === 0 && st.passed > 0 && wrapRef.current) {
          const m = medalFor(st.passed);
          popText(wrapRef.current, m ? `MEDALI ${MEDAL_LABEL[m]}!` : `${st.passed} CRANE!`, { size: 26, color: '#ffd166' });
          api.sfx.chime(2);
        }
        pushHudFor(st);
      }
      if (res.died) doDie(res.died);
    });

    api.setRender(() => {
      const st = stRef.current;
      if (!st) return;
      const fx = fxRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = fx.animT;
      ctx.save();
      ctx.scale(s, s);

      // langit senja
      const sky = ctx.createLinearGradient(0, 0, 0, lh);
      sky.addColorStop(0, '#2b1b4d');
      sky.addColorStop(0.45, '#8a3b63');
      sky.addColorStop(0.75, '#e2684a');
      sky.addColorStop(1, '#ffb35c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, LW, lh);

      // matahari terbenam
      ctx.fillStyle = 'rgba(255,200,120,0.95)';
      ctx.beginPath();
      ctx.arc(300, lh * 0.62, 30, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,180,100,0.28)';
      ctx.beginPath();
      ctx.arc(300, lh * 0.62, 48, 0, TAU);
      ctx.fill();

      // awan senja 2 lapis
      drawClouds(ctx, t, 0.45, 0.7, lh);
      drawClouds(ctx, t * 1.6 + 200, 0.8, 1, lh);

      // skyline parallax
      const driftBase = screenRef.current === 'ready' || screenRef.current === 'tutorial' ? t : st.t;
      drawSkyline(ctx, driftBase, st.groundY, 10, 'rgba(70,45,80,0.55)', 31);
      drawSkyline(ctx, driftBase, st.groundY, 22, 'rgba(48,30,58,0.8)', 137);

      // siluet tower crane jauh
      ctx.strokeStyle = 'rgba(40,24,48,0.6)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 3; i += 1) {
        const span = LW + 160;
        const cxp = (((i * 211 - driftBase * 7) % span) + span) % span - 80;
        const ch = 160 + (i % 2) * 40;
        ctx.beginPath();
        ctx.moveTo(cxp, st.groundY);
        ctx.lineTo(cxp, st.groundY - ch);
        ctx.moveTo(cxp - 60, st.groundY - ch + 14);
        ctx.lineTo(cxp + 60, st.groundY - ch + 14);
        ctx.stroke();
      }

      // gate crane
      for (const g of st.gates) {
        if (g.x + g.w < -60 || g.x > LW + 60) continue;
        drawGate(ctx, g, st.groundY, t);
      }

      // tanah proyek
      const gy = st.groundY;
      const gr = ctx.createLinearGradient(0, gy, 0, lh);
      gr.addColorStop(0, '#7a5a3e');
      gr.addColorStop(1, '#4e3826');
      ctx.fillStyle = gr;
      ctx.fillRect(0, gy, LW, lh - gy);
      ctx.fillStyle = 'rgba(255,170,80,0.25)';
      ctx.fillRect(0, gy, LW, 8);
      const stripeDrift = screenRef.current === 'play' ? st.t * 60 : 0;
      ctx.fillStyle = 'rgba(50,35,22,0.45)';
      for (let px = -((stripeDrift) % 44); px < LW; px += 44) {
        ctx.fillRect(px, gy + 24, 20, 5);
        ctx.fillRect(px + 22, gy + 42, 13, 4);
      }

      // mandor
      const bob = st.phase === 'ready' ? readyBobOffset(st) : 0;
      const birdY = st.bird.y + bob;
      if (st.phase !== 'dead' || screenRef.current !== 'over') {
        const shScale = Math.max(0.3, 1 - (gy - birdY) / 520);
        ctx.fillStyle = 'rgba(20,10,30,0.3)';
        ctx.beginPath();
        ctx.ellipse(st.bird.x, gy + 12, 15 * shScale, 5 * shScale, 0, 0, TAU);
        ctx.fill();
        const drawB: Bird = { ...st.bird, y: birdY };
        drawMandor(ctx, drawB, t, st.phase === 'ready' ? 0.55 + Math.sin(t * 6) * 0.25 : fx.flapAnim, fx.squash);

        // bubble grace
        if (st.phase === 'play' && inGrace(st) && st.alive) {
          const gp = 1 - st.t / 1.0;
          ctx.strokeStyle = `rgba(125,211,252,${0.35 + 0.45 * gp})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -t * 40;
          ctx.beginPath();
          ctx.arc(st.bird.x, birdY, 30, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // petunjuk ready (di canvas)
      if (screenRef.current === 'ready') {
        const pulse = 0.75 + 0.25 * Math.sin(t * 5);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(20,10,30,0.6)';
        ctx.shadowBlur = 12;
        const fy = lh * 0.2 + Math.sin(t * 5) * -8;
        ctx.font = '44px system-ui';
        ctx.fillText('👆', LW / 2, fy);
        ctx.font = `900 24px ${FONT}`;
        ctx.fillText('KETUK UNTUK TERBANG', LW / 2, fy + 46);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = 'rgba(20,10,30,0.6)';
        const tw = 330;
        const ty = fy + 70;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(LW / 2 - tw / 2, ty, tw, 52, 14);
        else ctx.rect(LW / 2 - tw / 2, ty, tw, 52);
        ctx.fill();
        ctx.fillStyle = '#ffe9c4';
        ctx.font = `700 14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Ketuk = kepakan pertama + 1 detik kebal.', LW / 2, ty + 16);
        ctx.fillText('Lewati celah crane, jangan senggol balok!', LW / 2, ty + 36);
        ctx.restore();
      }

      ctx.restore();
    });

    api.loop.start();

    if (A2TEST) {
      (window as unknown as Record<string, unknown>).__flappyBird = {
        get screen() { return screenRef.current; },
        get score() { return stRef.current?.passed ?? 0; },
        get alive() { return stRef.current?.alive ?? true; },
        get inGrace() { return stRef.current ? inGrace(stRef.current) : false; },
        tap() {
          const st = stRef.current;
          if (!st) return;
          if (screenRef.current === 'ready') {
            startRun(st);
            flap(st.bird);
            setScreen('play');
          } else if (screenRef.current === 'play' && st.alive) {
            flap(st.bird);
          }
        },
        /** QA saja: pusatkan celah gate terdekat ke posisi burung. */
        aim() {
          const st = stRef.current;
          if (!st) return;
          for (const g of st.gates) {
            if (g.x + g.w > st.bird.x - 60) g.gapY = st.bird.y;
          }
        },
        start() { setScreen('ready'); },
      };
    }

    return () => {
      apiRef.current = null;
      if (A2TEST) delete (window as unknown as Record<string, unknown>).__flappyBird;
    };
  });

  const startTutorialDone = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.sfx.click();
    setScreen('ready');
  };
  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    setScreen('pause');
  };
  const doResume = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };
  const toggleMute = (): void => {
    apiRef.current?.sfx.ensure();
    setMuted(apiRef.current?.sfx.toggleMute() ?? false);
  };

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(20,10,30,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };

  const medal = medalFor(hud.score);
  const isBest = hud.score > 0 && hud.score >= hud.best;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#2b1b4d', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(20,10,30,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          🏗️ {hud.score}
        </div>
        <div style={{ background: 'rgba(20,10,30,0.45)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13 }}>
          🏅 {hud.best}
        </div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">
            {screen === 'play' ? '⏸' : '▶'}
          </button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 46 }}>👷‍♂️🏗️</div>
          <h2 style={titleStyle}>MANDOR TERBANG</h2>
          <p style={textStyle}>
            Lembur sampai senja, mandor pulang terbang menembus tower crane.
            Ketuk untuk mengepak — ketukan pertama memberimu 1 detik kebal, jadi jangan panik!
          </p>
          <button style={primaryBtn} onClick={startTutorialDone}>Mulai Terbang 🚀</button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>ISTIRAHAT</h2>
          <p style={textStyle}>Mandor ngopi dulu di bedeng. Crane-nya disuruh nunggu.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={() => { restart(); apiRef.current?.loop.setPaused(false); }}>Ulangi</button>
          </div>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>💥</div>
          <h2 style={titleStyle}>MANDOR JATUH!</h2>
          <p style={textStyle}>
            {deathCause === 'ground'
              ? 'Mendarat lebih cepat dari progres proyek. Helmnya selamat, mandornya tidak.'
              : 'Kesenggol balok beton. Crane tidak bisa diajak damai.'}
          </p>
          {medal && (
            <div style={{ background: 'rgba(255,209,102,0.18)', border: '1px solid #ffd166', borderRadius: 14, padding: '8px 18px', marginBottom: 10, color: '#ffd166', fontWeight: 900, fontSize: 18 }}>
              {MEDAL_LABEL[medal]}
            </div>
          )}
          <p style={{ ...textStyle, fontSize: 16 }}>
            🏗️ Crane: <b>{hud.score}</b> &nbsp;•&nbsp; 🏅 Terbaik: <b>{hud.best}</b>
            {isBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => { apiRef.current?.sfx.ensure(); restart(); }}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(20,10,30,0.6)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#ffe9d6', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 310,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#ffd166,#ff7847)', color: '#3b1d05',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(255,120,71,0.4)',
};
const secondaryBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.16)', color: '#fff',
  fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(20,10,32,0.66)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
