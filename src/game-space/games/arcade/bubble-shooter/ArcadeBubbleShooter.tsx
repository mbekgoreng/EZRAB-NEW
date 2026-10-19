/**
 * ArcadeBubbleShooter ("Tembak Semen") — tembak gumpalan semen warna-warni.
 * Match-3 meletus, yang menggantung jatuh. Langit-langit turun tiap 5 tembakan.
 * Jangan sampai adonan menyentuh batas cor!
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  EMPTY, neighbors, levelGrid, findCluster, findFloating, colorsInGrid,
  pushCeiling, isCleared, rowsForLevel, colorsForLevel,
  scorePop, scoreDrop, LEVEL_BONUS, type Grid,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tembak-semen', 'best');

const CEMENT = [
  { base: '#9ca3af', dark: '#4b5563', light: '#e5e7eb' }, // abu
  { base: '#fbbf24', dark: '#92400e', light: '#fef3c7' }, // kuning
  { base: '#ef4444', dark: '#7f1d1d', light: '#fecaca' }, // merah bata
  { base: '#38bdf8', dark: '#0c4a6e', light: '#e0f2fe' }, // biru
  { base: '#4ade80', dark: '#14532d', light: '#dcfce7' }, // hijau
  { base: '#a78bfa', dark: '#4c1d95', light: '#ede9fe' }, // ungu
];

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Flying {
  x: number; y: number; vx: number; vy: number; color: number;
}
interface Falling {
  x: number; y: number; vy: number; color: number;
}
interface Ring {
  x: number; y: number; t: number; color: number;
}

interface S {
  grid: Grid;
  cols: number;
  R: number;
  cellH: number;
  x0: number;
  y0: number;
  level: number;
  score: number;
  shots: number;
  flying: Flying | null;
  loaded: number;
  next: number;
  falling: Falling[];
  rings: Ring[];
  aim: number; // radian, -PI..0 (ke atas)
  shooterY: number;
  over: boolean;
  t: number;
  levelMsg: number; // timer banner level
}

export default function ArcadeBubbleShooter({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, level: 1, best: getBest(BK, 0), shots: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      grid: [], cols: 10, R: 16, cellH: 27.7, x0: 0, y0: 96,
      level: 1, score: 0, shots: 0, flying: null, loaded: 0, next: 1,
      falling: [], rings: [], aim: -Math.PI / 2, shooterY: api.H - 84,
      over: false, t: 0, levelMsg: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const layout = (): void => {
      const W = api.W;
      s.R = 16;
      s.cols = Math.max(7, Math.floor((W - 16) / (s.R * 2)));
      s.cellH = s.R * Math.sqrt(3);
      s.x0 = (W - (s.cols * s.R * 2 + s.R)) / 2;
      s.y0 = 100;
      s.shooterY = api.H - 84;
    };

    const cellXY = (r: number, c: number): { x: number; y: number } => ({
      x: s.x0 + s.R + c * s.R * 2 + (r % 2) * s.R,
      y: s.y0 + s.R + r * s.cellH,
    });

    const push = (): void => {
      api.pushHud({ score: s.score, level: s.level, best: getBest(BK, 0), shots: s.shots % 5 });
    };

    const pickColor = (): number => {
      const avail = colorsInGrid(s.grid);
      const pool = avail.length > 0 ? avail : [0, 1, 2, 3];
      return pool[Math.floor(rng() * pool.length)];
    };

    const newLevel = (lv: number): void => {
      s.level = lv;
      s.grid = levelGrid(rowsForLevel(lv), s.cols, colorsForLevel(lv), rng);
      s.shots = 0;
      s.flying = null;
      s.falling = [];
      s.loaded = pickColor();
      s.next = pickColor();
      s.levelMsg = 2.2;
      push();
    };

    const reset = (): void => {
      layout();
      s.score = 0;
      s.over = false;
      s.rings = [];
      newLevel(1);
    };

    const gameOver = (): void => {
      s.over = true;
      const nb = setBest(BK, s.score);
      api.sfx.fail();
      api.shake.add(0.6);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'ADONAN MELEBER! 🪣', { size: 30, color: '#f87171' });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, level: s.level, best: nb, shots: 0 });
        setScreen('over');
      }, 1300);
    };

    const levelClear = (): void => {
      s.score += LEVEL_BONUS;
      api.sfx.chime(4);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, `LEVEL ${s.level} BERES! +${LEVEL_BONUS}`, { size: 26, color: '#4ade80' });
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 60, colors: ['#4ade80', '#fde047', '#fff7d6'],
        speed: [120, 400], life: [0.6, 1.1], size: [2, 6], gravity: 300, shape: 'spark',
      });
      window.setTimeout(() => {
        if (!s.over && screenRef.current === 'play') newLevel(s.level + 1);
      }, 1200);
    };

    /** Sel kosong terdekat dari titik (x,y). */
    const nearestEmpty = (x: number, y: number): [number, number] | null => {
      let bestCell: [number, number] | null = null;
      let bestD = Infinity;
      for (let r = 0; r < s.grid.length; r += 1) {
        for (let c = 0; c < s.cols; c += 1) {
          if (s.grid[r][c] !== EMPTY) continue;
          const p = cellXY(r, c);
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) { bestD = d; bestCell = [r, c]; }
        }
      }
      return bestCell;
    };

    const snapFlying = (f: Flying): void => {
      const cell = nearestEmpty(f.x, f.y);
      if (!cell) { s.flying = null; return; }
      const [r, c] = cell;
      s.grid[r][c] = f.color;
      s.flying = null;
      const p = cellXY(r, c);
      api.sfx.pop(1 + rng() * 0.2);
      // match?
      const cluster = findCluster(s.grid, r, c);
      if (cluster.length >= 3) {
        for (const [cr, cc] of cluster) {
          const cp = cellXY(cr, cc);
          s.rings.push({ x: cp.x, y: cp.y, t: 0, color: s.grid[cr][cc] });
          api.particles.spawn(cp.x, cp.y, {
            count: 10, colors: [CEMENT[s.grid[cr][cc]].base, CEMENT[s.grid[cr][cc]].light, '#ffffff'],
            speed: [60, 260], life: [0.35, 0.75], size: [2, 5], gravity: 420, shape: 'spark',
          });
          s.grid[cr][cc] = EMPTY;
        }
        const pts = scorePop(cluster.length);
        s.score += pts;
        api.scores.add(p.x, p.y - 20, `+${pts}`, { color: '#fef08a', size: 20 });
        api.sfx.chime(2);
        // yang menggantung jatuh
        const floating = findFloating(s.grid);
        for (const [fr, fc] of floating) {
          const fp = cellXY(fr, fc);
          s.falling.push({ x: fp.x, y: fp.y, vy: 60, color: s.grid[fr][fc] });
          s.grid[fr][fc] = EMPTY;
        }
        if (floating.length > 0) {
          const dpts = scoreDrop(floating.length);
          s.score += dpts;
          api.sfx.whoosh();
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `Runtuh! +${dpts}`, { size: 20, color: '#7dd3fc' });
        }
      }
      s.shots += 1;
      if (s.shots % 5 === 0) {
        const maxRows = Math.floor((s.shooterY - 110 - s.y0) / s.cellH);
        pushCeiling(s.grid, s.cols, colorsForLevel(s.level), rng, Math.max(6, maxRows));
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, 'Langit-langit turun! ⬇️', { size: 18, color: '#fb923c' });
        api.sfx.thud(0.7);
      }
      // cek kalah: adonan menyentuh batas
      const deadY = s.shooterY - 56;
      for (let rr = 0; rr < s.grid.length; rr += 1) {
        for (let cc = 0; cc < s.cols; cc += 1) {
          if (s.grid[rr][cc] !== EMPTY && cellXY(rr, cc).y + s.R > deadY) {
            gameOver();
            return;
          }
        }
      }
      if (isCleared(s.grid)) {
        levelClear();
        return;
      }
      s.loaded = s.next;
      s.next = pickColor();
      push();
    };

    const shoot = (): void => {
      if (s.flying || s.over) return;
      const sx = api.W / 2;
      const sp = 640;
      s.flying = {
        x: sx, y: s.shooterY - 26,
        vx: Math.cos(s.aim) * sp, vy: Math.sin(s.aim) * sp,
        color: s.loaded,
      };
      api.sfx.whoosh();
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      const sx = api.W / 2;
      if (p.y < s.shooterY - 10) {
        s.aim = clamp(Math.atan2(p.y - s.shooterY, p.x - sx), -Math.PI * 0.86, -Math.PI * 0.14);
        shoot();
      }
    };
    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.over) return;
      const sx = api.W / 2;
      if (p.y < s.shooterY - 10) {
        s.aim = clamp(Math.atan2(p.y - s.shooterY, p.x - sx), -Math.PI * 0.86, -Math.PI * 0.14);
      }
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.over) return;
      s.t += dt;
      if (s.levelMsg > 0) s.levelMsg -= dt;
      const W = api.W;
      const wallL = s.x0 + 2;
      const wallR = s.x0 + s.cols * s.R * 2 + s.R - 2;

      // peluru terbang
      const f = s.flying;
      if (f) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.x - s.R < wallL) { f.x = wallL + s.R; f.vx = Math.abs(f.vx); api.sfx.click(); }
        if (f.x + s.R > wallR) { f.x = wallR - s.R; f.vx = -Math.abs(f.vx); api.sfx.click(); }
        let hit = f.y - s.R <= s.y0 + 4;
        if (!hit) {
          outer: for (let r = 0; r < s.grid.length; r += 1) {
            for (let c = 0; c < s.cols; c += 1) {
              if (s.grid[r][c] === EMPTY) continue;
              const p = cellXY(r, c);
              if (Math.hypot(p.x - f.x, p.y - f.y) < s.R * 1.86) { hit = true; break outer; }
            }
          }
        }
        if (hit) snapFlying(f);
        else if (f.y > api.H + 40 || f.y < -40) s.flying = null;
      }
      // yang jatuh
      for (const fl of s.falling) {
        fl.vy += 1400 * dt;
        fl.y += fl.vy * dt;
      }
      s.falling = s.falling.filter((fl) => fl.y < api.H + 40);
      // ring letusan
      for (const rg of s.rings) rg.t += dt;
      s.rings = s.rings.filter((rg) => rg.t < 0.35);
      void W;
    });

    const drawCement = (ctx: CanvasRenderingContext2D, x: number, y: number, color: number, R: number, seed: number): void => {
      const cm = CEMENT[color % CEMENT.length];
      const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.15, x, y, R * 1.05);
      g.addColorStop(0, cm.light);
      g.addColorStop(0.45, cm.base);
      g.addColorStop(1, cm.dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.fill();
      // bintik semen (deterministik)
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let i = 0; i < 5; i += 1) {
        const a = ((seed * 37 + i * 89) % 360) * (Math.PI / 180);
        const rr = R * (0.35 + ((seed + i * 13) % 40) / 100);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, R * 0.09, 0, TAU);
        ctx.fill();
      }
      // gloss
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(x - R * 0.32, y - R * 0.42, R * 0.30, R * 0.16, -0.5, 0, TAU);
      ctx.fill();
      // rim
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.arc(x, y, R - 1, 0, TAU);
      ctx.stroke();
    };

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0f2a4a');
      sky.addColorStop(0.6, '#1b4a75');
      sky.addColorStop(1, '#0a1a30');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // cahaya lembut di area permainan
      const glow = ctx.createRadialGradient(W / 2, H * 0.32, 20, W / 2, H * 0.32, W * 0.55);
      glow.addColorStop(0, 'rgba(125,211,252,0.10)');
      glow.addColorStop(1, 'rgba(125,211,252,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      // dinding bata bawah
      const wallTop = s.shooterY + 46;
      const bg2 = ctx.createLinearGradient(0, wallTop, 0, H);
      bg2.addColorStop(0, '#7c2d12');
      bg2.addColorStop(1, '#431407');
      ctx.fillStyle = bg2;
      ctx.fillRect(0, wallTop, W, H - wallTop);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      const bh2 = 22;
      for (let y = wallTop; y < H; y += bh2) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        const off = (Math.round(y / bh2) % 2) * 30;
        for (let x = off; x < W; x += 60) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + bh2, H)); ctx.stroke();
        }
      }
      // garis batas cor
      const deadY = s.shooterY - 56;
      ctx.save();
      ctx.strokeStyle = 'rgba(248,113,113,0.8)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(s.x0, deadY);
      ctx.lineTo(s.x0 + s.cols * s.R * 2 + s.R, deadY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(248,113,113,0.9)';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('BATAS COR', W - 8, deadY - 8);
      ctx.restore();
    };

    const drawShooter = (ctx: CanvasRenderingContext2D): void => {
      const sx = api.W / 2;
      const sy = s.shooterY;
      ctx.save();
      // bayangan
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 34, 44, 10, 0, 0, TAU);
      ctx.fill();
      // badan mesin
      const bg = ctx.createLinearGradient(sx - 34, sy - 10, sx + 34, sy + 34);
      bg.addColorStop(0, '#fbbf24');
      bg.addColorStop(1, '#b45309');
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(sx - 34, sy - 6, 68, 40, 12);
      else ctx.rect(sx - 34, sy - 6, 68, 40);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.font = `900 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('MOLEN', sx, sy + 18);
      // laras
      ctx.save();
      ctx.translate(sx, sy - 8);
      ctx.rotate(s.aim + Math.PI / 2);
      const lg = ctx.createLinearGradient(0, -46, 0, 0);
      lg.addColorStop(0, '#9ca3af');
      lg.addColorStop(1, '#4b5563');
      ctx.fillStyle = lg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-11, -48, 22, 44, 8);
      else ctx.rect(-11, -48, 22, 44);
      ctx.fill();
      ctx.restore();
      // peluru terisi
      if (!s.flying) drawCement(ctx, sx, sy - 8, s.loaded, s.R * 0.95, 7);
      // berikutnya
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('⬇ berikutnya', sx + 66, sy + 8);
      drawCement(ctx, sx + 66, sy + 26, s.next, s.R * 0.6, 13);
      ctx.restore();
    };

    const drawTrajectory = (ctx: CanvasRenderingContext2D): void => {
      if (s.flying || s.over) return;
      const sx = api.W / 2;
      const sy = s.shooterY - 26;
      const wallL = s.x0 + 2 + s.R;
      const wallR = s.x0 + s.cols * s.R * 2 + s.R - 2 - s.R;
      let x = sx; let y = sy;
      let dx = Math.cos(s.aim); let dy = Math.sin(s.aim);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 9]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i < 3; i += 1) {
        // jarak ke dinding / atas
        let t = 240;
        if (dx > 0.01) t = Math.min(t, (wallR - x) / dx);
        if (dx < -0.01) t = Math.min(t, (wallL - x) / dx);
        if (dy < -0.01) t = Math.min(t, (s.y0 + 10 - y) / dy);
        x += dx * t; y += dy * t;
        ctx.lineTo(x, y);
        if (Math.abs(x - wallL) < 2 || Math.abs(x - wallR) < 2) dx = -dx;
        else break;
      }
      ctx.stroke();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      // grid semen
      for (let r = 0; r < s.grid.length; r += 1) {
        for (let c = 0; c < s.cols; c += 1) {
          const v = s.grid[r][c];
          if (v === EMPTY) continue;
          const p = cellXY(r, c);
          drawCement(ctx, p.x, p.y, v, s.R - 1, r * 31 + c * 7 + 3);
        }
      }
      // ring letusan
      for (const rg of s.rings) {
        const k = rg.t / 0.35;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = CEMENT[rg.color % CEMENT.length].light;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, s.R * (0.6 + k * 1.6), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      // yang jatuh
      for (const fl of s.falling) {
        drawCement(ctx, fl.x, fl.y, fl.color, s.R - 1, 99);
      }
      // peluru terbang
      if (s.flying) {
        drawCement(ctx, s.flying.x, s.flying.y, s.flying.color, s.R - 1, 5);
      }
      drawTrajectory(ctx);
      drawShooter(ctx);
      // banner level
      if (s.levelMsg > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(s.levelMsg, 0, 1);
        ctx.fillStyle = '#fde047';
        ctx.font = `900 30px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${s.level}`, W / 2, H * 0.45);
        ctx.font = `700 14px ${FONT}`;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText('Campuran makin beragam!', W / 2, H * 0.45 + 28);
        ctx.restore();
      }
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,8,18,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    api.onResize(() => {
      layout();
      s.shooterY = api.H - 84;
    });
    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    api?.sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
  };

  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };

  const toggleMute = (): void => {
    const api = apiRef.current;
    if (api) api.sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (api && api.sfx.muted !== next) api.sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(10,20,35,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0f2a4a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,20,35,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fef08a' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Level {hud.level} • plafon {hud.shots}/5</div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🪣</div>
          <h2 style={h2}>TEMBAK SEMEN</h2>
          <p style={p}>
            <b>Ketuk</b> untuk menembakkan gumpalan semen ke atas — bisa <b>memantul</b> di dinding!
            Samakan <b>3 warna</b> untuk meletuskannya. Yang menggantung akan <b>runtuh</b>!
          </p>
          <p style={p}>
            ⚠️ Tiap 5 tembakan <b>langit-langit turun</b>. Jangan sampai adonan menyentuh{' '}
            <b style={{ color: '#f87171' }}>BATAS COR</b>!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Nyemen</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Adonan tidak akan mengeras selama jeda. Janji mandor.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🪣</div>
          <h2 style={h2}>ADONAN MELEBER!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fef08a' }}>{hud.score.toLocaleString('id-ID')}</div>
          <p style={p}>Level {hud.level} • Terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fef08a', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0f2fe' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#93c5fd', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,12,26,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1b3a5f,#0a1830)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
