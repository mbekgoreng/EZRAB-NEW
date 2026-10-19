/**
 * ArcadeArchery ("Tembak Paku") — tembak paku pakai nail gun ke papan triplek.
 * Ada tiupan angin (vertikal), tiap ronde papan makin jauh & makin kecil.
 * 5 ronde × 5 paku. Bidik pakai gerakan pointer, tekan TEMBAK / klik.
 */
import React, { useRef, useState } from 'react';
import {
  useGameCanvas, type GameApi, TAU, clamp, easeOutBack, sfx,
} from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  VH, NAIL_SPEED, GRAVITY, WIND_ACCEL, NAILS_PER_ROUND, MAX_ROUNDS,
  roundSpec, targetScale, flightTime, fireShot, type RoundSpec,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tembak-paku', 'best');
const RING_RADII = [54, 40, 27, 14];

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface NailFlight {
  t: number;
  dur: number;
  aimY: number;
  spec: RoundSpec;
  x0: number;
  x1: number;
}

interface StuckNail { y: number; ring: number }

interface S {
  level: number;
  spec: RoundSpec;
  nailsLeft: number;
  score: number;
  totalScore: number;
  hits: number;
  bulls: number;
  aimY: number; // dalam unit VH
  flight: NailFlight | null;
  stuck: StuckNail[];
  t: number;
  over: boolean;
}

export default function ArcadeArchery({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, level: 0, nails: NAILS_PER_ROUND, wind: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(sfx.muted);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);
    const s: S = {
      level: 0, spec: roundSpec(0), nailsLeft: NAILS_PER_ROUND,
      score: 0, totalScore: 0, hits: 0, bulls: 0,
      aimY: VH / 2, flight: null, stuck: [], t: 0, over: false,
    };
    const gunX = (): number => 44;

    const push = (): void => {
      api.pushHud({
        score: s.totalScore + s.score, level: s.level, nails: s.nailsLeft,
        wind: s.spec.wind, best: getBest(BK, 0),
      });
    };

    const reset = (): void => {
      s.level = 0;
      s.spec = roundSpec(0);
      s.nailsLeft = NAILS_PER_ROUND;
      s.score = 0; s.totalScore = 0; s.hits = 0; s.bulls = 0;
      s.aimY = VH / 2;
      s.flight = null; s.stuck = [];
      s.over = false;
      push();
    };

    const endGame = (): void => {
      s.over = true;
      const nb = setBest(BK, s.totalScore + s.score);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, s.bulls > 0 ? '🎯 SELESAI!' : 'SELESAI!', { size: 32, color: '#fde047' });
      sfx.chime(3);
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 70, colors: ['#fde047', '#fb923c', '#fff7d6', '#f59e0b'],
        speed: [120, 420], life: [0.6, 1.2], size: [2, 6], gravity: 300, shape: 'rect', rotation: true,
      });
      window.setTimeout(() => {
        push();
        (api as unknown as { __best: number }).__best = nb;
        api.pushHud({
          score: s.totalScore + s.score, level: s.level, nails: s.nailsLeft,
          wind: s.spec.wind, best: nb,
        });
        setScreen('over');
      }, 1400);
    };

    const fire = (): void => {
      if (screenRef.current !== 'play' || s.over || s.flight || s.nailsLeft <= 0) return;
      s.nailsLeft -= 1;
      const spec = s.spec;
      const dur = flightTime(spec.distance);
      s.flight = {
        t: 0, dur, aimY: s.aimY, spec, x0: gunX() + 54, x1: api.W - 84,
      };
      sfx.ensure();
      sfx.whoosh();
      api.particles.spawn(gunX() + 58, (s.aimY / VH) * api.H, {
        count: 8, colors: ['#fbbf24', '#fde047', '#fff7d6'],
        speed: [60, 220], life: [0.15, 0.4], size: [1.5, 4], gravity: 200, shape: 'circle',
      });
      push();
    };

    const landNail = (): void => {
      const f = s.flight;
      if (!f) return;
      s.flight = null;
      const res = fireShot(f.aimY, f.spec);
      const ty = (f.spec.targetY / VH) * api.H;
      const scale = targetScale(f.spec.distance);
      const ypx = (res.hitY / VH) * api.H;
      const dx = Math.abs(ypx - ty);
      sfx.ensure();
      if (res.ring > 0) {
        s.stuck.push({ y: res.hitY, ring: res.ring });
        s.score += res.score;
        s.hits += 1;
        if (res.bullseye) {
          s.bulls += 1;
          api.shake.add(0.7);
          sfx.chime(2);
          if (wrapRef.current) popText(wrapRef.current, '🎯 TEPAT TENGAH!', { size: 24, color: '#fde047' });
        } else {
          sfx.thud(0.7);
        }
        api.scores.add(api.W - 84, ty - 90 * scale, `+${res.score}`, {
          color: res.bullseye ? '#fde047' : '#fff7d6', size: res.bullseye ? 26 : 20,
        });
        api.particles.spawn(api.W - 84, ypx, {
          count: res.bullseye ? 24 : 12,
          colors: ['#d6a05c', '#a16207', '#fef3c7', '#fbbf24'],
          speed: [60, 260], life: [0.3, 0.7], size: [1.5, 4], gravity: 500, shape: 'rect', rotation: true,
        });
      } else {
        sfx.fail();
        if (wrapRef.current) popText(wrapRef.current, dx < 0.25 * VH ? 'Tipis! Awas angin 💨' : 'Meleset!', { size: 16, color: '#fca5a5' });
      }
      push();
      window.setTimeout(() => {
        if (s.over) return;
        if (s.nailsLeft > 0) return;
        // ronde selesai
        if (s.level + 1 >= MAX_ROUNDS) { endGame(); return; }
        s.totalScore += s.score;
        s.score = 0;
        s.level += 1;
        s.spec = roundSpec(s.level);
        s.nailsLeft = NAILS_PER_ROUND;
        s.stuck = [];
        s.aimY = s.spec.targetY;
        sfx.chime(1);
        if (wrapRef.current) popText(wrapRef.current, `Ronde ${s.level + 1} — papan lebih jauh!`, { size: 20, color: '#bfdbfe' });
        push();
      }, 650);
    };

    api.input.onMove = (p) => {
      if (screenRef.current !== 'play') return;
      s.aimY = clamp((p.y / api.H) * VH, 8, VH - 8);
    };
    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play') return;
      s.aimY = clamp((p.y / api.H) * VH, 8, VH - 8);
      fire();
    };
    (api as unknown as { __fire: () => void }).__fire = fire;

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (screenRef.current !== 'play' || s.over) return;
      if (s.flight) {
        s.flight.t += dt;
        if (s.flight.t >= s.flight.dur) landNail();
      }
    });

    // ---------- gambar ----------
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#1c2a4a');
      sky.addColorStop(0.55, '#4a3a5a');
      sky.addColorStop(0.8, '#c26a3a');
      sky.addColorStop(1, '#8a4a2a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // matahari senja
      const sun = ctx.createRadialGradient(W * 0.78, H * 0.62, 4, W * 0.78, H * 0.62, 60);
      sun.addColorStop(0, 'rgba(255,220,150,0.9)');
      sun.addColorStop(1, 'rgba(255,180,100,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffcf7a';
      ctx.beginPath(); ctx.arc(W * 0.78, H * 0.62, 22, 0, TAU); ctx.fill();
      // awan
      ctx.fillStyle = 'rgba(255,200,170,0.25)';
      for (let i = 0; i < 3; i += 1) {
        const cx = ((i * 197 + s.t * 8) % (W + 160)) - 80;
        const cy = H * (0.14 + i * 0.09);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 44, 12, 0, 0, TAU);
        ctx.ellipse(cx + 28, cy + 3, 32, 9, 0, 0, TAU);
        ctx.fill();
      }
      // siluet tower crane
      ctx.strokeStyle = 'rgba(20,16,28,0.85)';
      ctx.lineWidth = 7;
      const cx0 = W * 0.30;
      ctx.beginPath(); ctx.moveTo(cx0, H * 0.78); ctx.lineTo(cx0, H * 0.16); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx0 - 90, H * 0.16); ctx.lineTo(cx0 + 110, H * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx0, H * 0.10); ctx.lineTo(cx0 - 90, H * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx0, H * 0.10); ctx.lineTo(cx0 + 110, H * 0.16); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,16,28,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx0 + 96, H * 0.16); ctx.lineTo(cx0 + 96, H * 0.26); ctx.stroke();
      ctx.fillStyle = 'rgba(20,16,28,0.9)';
      ctx.fillRect(cx0 + 88, H * 0.26, 16, 12);
      // pagar proyek
      ctx.fillStyle = '#3d3427';
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      ctx.fillStyle = '#4d4335';
      for (let x = 0; x < W; x += 46) ctx.fillRect(x, H * 0.78, 10, H * 0.22);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, H * 0.78, W, 8);
      // tanah
      const gr = ctx.createLinearGradient(0, H * 0.86, 0, H);
      gr.addColorStop(0, '#6b543a');
      gr.addColorStop(1, '#4a3826');
      ctx.fillStyle = gr;
      ctx.fillRect(0, H * 0.86, W, H * 0.14);
      // debu melayang
      ctx.fillStyle = 'rgba(255,220,170,0.18)';
      for (let i = 0; i < 14; i += 1) {
        const px = ((i * 97 + s.t * 20) % (W + 30)) - 15;
        const py = (i * 61 + s.t * 9) % H;
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, TAU); ctx.fill();
      }
    };

    const drawWind = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const w = s.spec.wind;
      const label = w === 0 ? 'Tenang' : w > 0 ? 'Angin ↓' : 'Angin ↑';
      const str = Math.abs(w) / (s.spec.windMax || 1);
      const bx = 12, by = 118, bw = 108, bh = 34;
      ctx.fillStyle = 'rgba(10,10,20,0.55)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, bw, bh, 10);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.fillStyle = '#bfdbfe';
      ctx.font = `800 12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`💨 ${label}`, bx + 10, by + 12);
      // panah kekuatan
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(bx + 10, by + 22, bw - 20, 5);
      const fg = ctx.createLinearGradient(bx + 10, 0, bx + bw - 10, 0);
      fg.addColorStop(0, '#93c5fd');
      fg.addColorStop(1, '#3b82f6');
      ctx.fillStyle = fg;
      ctx.fillRect(bx + 10, by + 22, (bw - 20) * str, 5);
      // penanda arah tiupan di tengah layar
      if (w !== 0) {
        const dirY = w > 0 ? 1 : -1;
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.2 * Math.sin(s.t * 5);
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -s.t * 40 * dirY;
        ctx.beginPath();
        ctx.moveTo(W / 2, H * 0.15);
        ctx.lineTo(W / 2, H * 0.15 + dirY * 60);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    };

    const drawNailGun = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const gx = gunX();
      const gy = (s.aimY / VH) * H;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;
      // bodi
      const body = ctx.createLinearGradient(0, -26, 0, 20);
      body.addColorStop(0, '#f97316');
      body.addColorStop(0.5, '#ea580c');
      body.addColorStop(1, '#9a3412');
      ctx.fillStyle = body;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-16, -26, 56, 46, 10);
      else ctx.rect(-16, -26, 56, 46);
      ctx.fill();
      // laras
      const bar = ctx.createLinearGradient(40, -10, 74, -10);
      bar.addColorStop(0, '#78716c');
      bar.addColorStop(0.5, '#d6d3d1');
      bar.addColorStop(1, '#57534e');
      ctx.fillStyle = bar;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(38, -11, 36, 22, 6);
      else ctx.rect(38, -11, 36, 22);
      ctx.fill();
      ctx.fillStyle = '#292524';
      ctx.fillRect(70, -8, 6, 16);
      // gagang
      const grip = ctx.createLinearGradient(-8, 20, 12, 20);
      grip.addColorStop(0, '#44403c');
      grip.addColorStop(1, '#1c1917');
      ctx.fillStyle = grip;
      ctx.beginPath();
      ctx.moveTo(-6, 18); ctx.lineTo(12, 18); ctx.lineTo(8, 52); ctx.lineTo(-12, 52);
      ctx.closePath(); ctx.fill();
      // highlight bodi
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(-8, -20, 40, 7);
      // strip kuning khas nail gun
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-16, -4, 56, 9);
      ctx.fillStyle = '#1c1917';
      ctx.font = `900 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('NAIL', 12, 3);
      // tangan tukang
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath(); ctx.arc(-2, 34, 11, 0, TAU); ctx.fill();
      ctx.restore();
    };

    const drawTarget = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const tx = W - 84;
      const ty = (s.spec.targetY / VH) * H;
      const scale = targetScale(s.spec.distance);
      // tiang penyangga
      ctx.fillStyle = '#5b4a36';
      ctx.fillRect(tx - 8, ty, 16, H - ty);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(tx - 8, ty, 4, H - ty);
      // papan triplek berlapis
      const r = 62 * scale;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      const ply = ctx.createRadialGradient(tx, ty, r * 0.1, tx, ty, r);
      ply.addColorStop(0, '#e8c88a');
      ply.addColorStop(0.6, '#d4a95e');
      ply.addColorStop(1, '#a87c3c');
      ctx.fillStyle = ply;
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, TAU); ctx.fill();
      ctx.restore();
      // serat kayu
      ctx.strokeStyle = 'rgba(140,95,40,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(tx, ty, r * (0.25 + i * 0.17), 0.4, 2.4);
        ctx.stroke();
      }
      // lingkaran target 4 ring
      const cols = ['#f8fafc', '#1e293b', '#3b82f6', '#fbbf24'];
      for (let i = 0; i < RING_RADII.length; i += 1) {
        const rr = RING_RADII[i] * scale;
        const g = ctx.createRadialGradient(tx - rr * 0.2, ty - rr * 0.2, rr * 0.1, tx, ty, rr);
        if (i === 3) {
          g.addColorStop(0, '#fde047');
          g.addColorStop(1, '#f59e0b');
        } else {
          g.addColorStop(0, cols[i]);
          g.addColorStop(1, cols[i]);
        }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(tx, ty, rr, 0, TAU); ctx.fill();
        if (i === 3) {
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(tx, ty, rr, 0, TAU); ctx.stroke();
        }
      }
      // paku yang menancap
      for (const n of s.stuck) {
        const ny = (n.y / VH) * H;
        ctx.save();
        ctx.translate(tx, ny);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(-1.6, -14, 3.2, 14);
        const hg = ctx.createLinearGradient(-4, -18, 4, -18);
        hg.addColorStop(0, '#f8fafc');
        hg.addColorStop(0.5, '#9ca3af');
        hg.addColorStop(1, '#4b5563');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.ellipse(0, -14, 4.6, 2.6, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // label jarak
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`📏 ${(s.spec.distance / 25).toFixed(0)} m`, tx, ty + r + 16);
    };

    const drawAim = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const spec = s.spec;
      const aimPxY = (s.aimY / VH) * H;
      // garis bidik datar
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(gunX() + 74, aimPxY);
      ctx.lineTo(W - 150, aimPxY);
      ctx.stroke();
      ctx.setLineDash([]);
      // prediksi lintasan (fisika jujur dari logic)
      const t = flightTime(spec.distance);
      ctx.fillStyle = 'rgba(253,224,71,0.85)';
      for (let i = 1; i <= 10; i += 1) {
        const ti = (t * i) / 10;
        const xx = gunX() + 74 + ((W - 84 - gunX() - 74) * i) / 10;
        const yy = (s.aimY + 0.5 * (GRAVITY + spec.wind * WIND_ACCEL) * ti * ti) / VH * H;
        ctx.beginPath(); ctx.arc(xx, yy, 3 - i * 0.18, 0, TAU); ctx.fill();
      }
      // crosshair
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(gunX() + 74 + (W - 224) * 0.0 + 40, aimPxY, 10, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gunX() + 114 - 14, aimPxY); ctx.lineTo(gunX() + 114 + 14, aimPxY);
      ctx.moveTo(gunX() + 114, aimPxY - 14); ctx.lineTo(gunX() + 114, aimPxY + 14);
      ctx.stroke();
      ctx.restore();
    };

    const drawFlight = (ctx: CanvasRenderingContext2D): void => {
      const f = s.flight;
      if (!f) return;
      const k = clamp(f.t / f.dur, 0, 1);
      const H = api.H;
      const x = f.x0 + (f.x1 - f.x0) * k;
      const y = ((f.aimY + 0.5 * (GRAVITY + f.spec.wind * WIND_ACCEL) * (f.t * f.t)) / VH) * H;
      ctx.save();
      // jejak gerak
      ctx.strokeStyle = 'rgba(253,224,71,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 60, y - 12);
      ctx.lineTo(x - 6, y - 1);
      ctx.stroke();
      // paku melesat
      ctx.translate(x, y);
      ctx.rotate(0.06);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(-14, -1.8, 24, 3.6);
      const hg = ctx.createLinearGradient(-6, -4, 6, -4);
      hg.addColorStop(0, '#f8fafc');
      hg.addColorStop(0.5, '#9ca3af');
      hg.addColorStop(1, '#4b5563');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(-13, 0, 4.4, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#78716c';
      ctx.beginPath(); ctx.moveTo(10, -1.8); ctx.lineTo(16, 0); ctx.lineTo(10, 1.8); ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      drawBackground(ctx, W, H);
      drawTarget(ctx, W, H);
      if (screenRef.current === 'play' && !s.over && !s.flight) drawAim(ctx, W, H);
      drawFlight(ctx);
      drawNailGun(ctx, W, H);
      drawWind(ctx, W, H);
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,6,20,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
  };
  const fireBtn = (): void => {
    (apiRef.current as unknown as { __fire?: () => void } | null)?.__fire?.();
  };
  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    sfx.ensure();
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    sfx.ensure();
    sfx.toggleMute();
    setMuted(sfx.muted);
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(15,10,25,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#1c2a4a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(15,10,25,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 140 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            🎯 Ronde {hud.level + 1}/{MAX_ROUNDS} • 🔩 {hud.nails}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'play' && (
        <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 5 }}>
          <button
            onPointerDown={(e) => { e.preventDefault(); fireBtn(); }}
            style={{
              padding: '14px 44px', borderRadius: 999, border: 'none', fontFamily: FONT,
              fontWeight: 900, fontSize: 18, cursor: 'pointer', color: '#3a2a00',
              background: 'linear-gradient(180deg,#fde047,#f59e0b)',
              boxShadow: '0 10px 26px rgba(245,158,11,0.5)',
            }}
          >
            🔫 TEMBAK
          </button>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🔫</div>
          <h2 style={h2}>TEMBAK PAKU</h2>
          <p style={p}>
            Tembak <b>nail gun</b> ke papan triplek! <b>Geser jari</b> untuk membidik,
            waspadai <b>💨 angin</b> yang mendorong paku ke atas/bawah —
            garis kuning menunjukkan perkiraan lintasan. Tiap ronde papan <b>makin jauh</b>!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Menembak</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Nail gun-nya ikut istirahat dulu.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🎯</div>
          <h2 style={h2}>PAPAN PENUH PAKU!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0e7ff' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fde047', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(12,8,24,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#2a2140,#141020)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e0e7ff' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
