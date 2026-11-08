/**
 * Labirin Gudang — seret troli material lewat rak-rak gudang.
 * Senggol rak keras = troli kembali ke checkpoint terakhir.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { bestKey, getBest, setBest, setJson } from '../../../engine2d/best';
import { drawSceneSprite, preloadSceneSprites } from '../../../shared/sceneSprites';
import {
  generateMaze, mazeSizeForLevel, moveBall, cellCenter, mulberry32,
  parSecondsFor, starsFor, furthestCheckpointIndex, improvedBestTime,
  type Maze,
} from './logic';

const SLUG = 'maze-drag';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;
const BALL_R = 9;

const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'done';

interface Hud {
  level: number;
  time: number;
  bestLevel: number;
  bestTime: number;
  cp: number;
  cpTotal: number;
  lastStars: number;
}

interface ClearInfo {
  level: number;
  time: number;
  par: number;
  stars: number;
}

interface Level {
  maze: Maze;
  cell: number;
  ox: number; // offset gambar labirin (logical px)
  oy: number;
  ball: { x: number; y: number };
  checkpointIdx: number; // -1 = start
  time: number;
  dragging: boolean;
}

function checkpointCells(lv: Level): Array<{ x: number; y: number }> {
  const pts = [{ x: 0, y: 0 }];
  pts[0] = cellCenter(lv.maze, lv.cell, lv.maze.start);
  for (const c of lv.maze.checkpoints) pts.push(cellCenter(lv.maze, lv.cell, c));
  return pts.map((p) => ({ x: p.x + lv.ox, y: p.y + lv.oy }));
}

function respawnOf(lv: Level): { x: number; y: number } {
  const cps = checkpointCells(lv);
  return cps[Math.max(0, lv.checkpointIdx + 1)] ?? cps[0];
}

function makeLevel(level: number, seed: number, areaW: number, areaH: number): Level {
  const { cols, rows } = mazeSizeForLevel(level);
  const maze = generateMaze(cols, rows, mulberry32(seed * 7919 + level * 131));
  const cell = Math.min(areaW / cols, areaH / rows);
  const ox = (areaW - cell * cols) / 2;
  const oy = (areaH - cell * rows) / 2;
  const s = cellCenter(maze, cell, maze.start);
  return {
    maze, cell, ox, oy,
    ball: { x: s.x + ox, y: s.y + oy },
    checkpointIdx: -1,
    time: 0,
    dragging: false,
  };
}

/** Prerender dinding labirin ke offscreen canvas (statis per level). */
function prerenderMaze(lv: Level): HTMLCanvasElement {
  const w = Math.ceil(lv.cell * lv.maze.cols);
  const h = Math.ceil(lv.cell * lv.maze.rows);
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, w * 2);
  cv.height = Math.max(2, h * 2);
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  const S = 2; // supersample
  ctx.scale(S, S);
  const cell = lv.cell;
  // alas koridor
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#16233c');
  bg.addColorStop(1, '#0d1526');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // tekstur koridor: dot grid halus
  ctx.fillStyle = 'rgba(120,160,220,0.10)';
  for (let y = cell / 2; y < h; y += cell) {
    for (let x = cell / 2; x < w; x += cell) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, TAU);
      ctx.fill();
    }
  }
  // RAK GUDANG berlapis: tiang oranye + papan rak + dus material
  for (let r = 0; r < lv.maze.rows; r += 1) {
    for (let c = 0; c < lv.maze.cols; c += 1) {
      if (lv.maze.cells[r * lv.maze.cols + c] !== 1) continue;
      const x = c * cell;
      const y = r * cell;
      // bayangan bawah
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 2, y + 3, cell, cell);
      // badan rak: gradien oranye besi
      const g = ctx.createLinearGradient(x, y, x, y + cell);
      g.addColorStop(0, '#e8823a');
      g.addColorStop(0.5, '#c2571a');
      g.addColorStop(1, '#8a3d10');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
      // dus material di tengah rak
      const bx = x + cell * 0.16;
      const by = y + cell * 0.2;
      const bw = cell * 0.68;
      const bh = cell * 0.6;
      const bgd = ctx.createLinearGradient(bx, by, bx, by + bh);
      bgd.addColorStop(0, '#d9a066');
      bgd.addColorStop(1, '#a06a2e');
      ctx.fillStyle = bgd;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx, by, bw, Math.max(1.5, bh * 0.22));
      ctx.strokeStyle = 'rgba(90,50,15,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + bw, by + bh);
      ctx.moveTo(bx + bw, by);
      ctx.lineTo(bx, by + bh);
      ctx.stroke();
      // tiang rak kiri-kanan
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(x, y, Math.max(2, cell * 0.09), cell);
      ctx.fillRect(x + cell - Math.max(2, cell * 0.09), y, Math.max(2, cell * 0.09), cell);
      // highlight atas
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x, y, cell, Math.max(1.5, cell * 0.1));
      // garis sambungan antar rak (hilangkan sekat visual)
      ctx.fillStyle = '#c2571a';
      if (c + 1 < lv.maze.cols && lv.maze.cells[r * lv.maze.cols + c + 1] === 1) {
        ctx.fillRect(x + cell - 1, y + 2, 2, cell - 4);
      }
      if (r + 1 < lv.maze.rows && lv.maze.cells[(r + 1) * lv.maze.cols + c] === 1) {
        ctx.fillRect(x + 2, y + cell - 1, cell - 4, 2);
      }
    }
  }
  // outline luar
  ctx.strokeStyle = 'rgba(255,180,100,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  return cv;
}

/* Ikon SVG prosedural (pengganti emoji HUD/overlay) */
const svgBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };
function IconWarehouse({ size = 16 }: { size?: number }): React.JSX.Element {
  return (<svg width={size} height={size} {...svgBase}><path d="M3 21V9l9-6 9 6v12" /><path d="M7 21v-8h10v8" /><path d="M7 17h10M7 20h10" /></svg>);
}
function IconClock({ size = 14 }: { size?: number }): React.JSX.Element {
  return (<svg width={size} height={size} {...svgBase}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
}
function IconMedal({ size = 14 }: { size?: number }): React.JSX.Element {
  return (<svg width={size} height={size} {...svgBase}><circle cx="12" cy="14" r="5" /><path d="M8.5 9.5 6 3h4l2 4 2-4h4l-2.5 6.5" /></svg>);
}
function IconRing({ size = 14 }: { size?: number }): React.JSX.Element {
  return (<svg width={size} height={size} {...svgBase}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></svg>);
}
function IconPlay({ size = 18 }: { size?: number }): React.JSX.Element {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>);
}
function IconPause({ size = 18 }: { size?: number }): React.JSX.Element {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>);
}
function IconSound({ size = 20, off = false }: { size?: number; off?: boolean }): React.JSX.Element {
  return (<svg width={size} height={size} {...svgBase}><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />{off ? <path d="M16 9l6 6M22 9l-6 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}</svg>);
}
function IconClose({ size = 18 }: { size?: number }): React.JSX.Element {
  return (<svg width={size} height={size} {...svgBase}><path d="M5 5l14 14M19 5L5 19" /></svg>);
}
/** Bintang rating: poligon SVG prosedural (bukan glif teks). */
function StarIcon({ size = 26, filled = true }: { size?: number; filled?: boolean }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <polygon
        points="12,2 14.9,8.6 22,9.3 16.7,14 18.2,21 12,17.3 5.8,21 7.3,14 2,9.3 9.1,8.6"
        fill={filled ? '#ffd166' : 'rgba(255,255,255,0.18)'}
        stroke={filled ? '#d97706' : 'rgba(255,255,255,0.35)'}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function StarsRow({ stars, size = 26 }: { stars: number; size?: number }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} aria-label={`${stars} dari 3 bintang`}>
      {[1, 2, 3].map((i) => <StarIcon key={i} size={size} filled={i <= stars} />)}
    </div>
  );
}

export default function ArcadeMazeDrag({ onExit }: { onExit: () => void }): React.JSX.Element {
  preloadSceneSprites();
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const lvRef = useRef<Level | null>(null);
  const mazeCvRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(1);
  const seedRef = useRef((Date.now() % 100000) | 0);
  const screenRef = useRef<Screen>('ready');
  const [screen, setScreenState] = useState<Screen>('ready');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({
    level: 1, time: 0,
    bestLevel: getBest(bestKey(SLUG, 'level')),
    bestTime: getBest(bestKey(SLUG, 'time')),
    cp: 0, cpTotal: 0, lastStars: 0,
  });
  const [clear, setClear] = useState<ClearInfo | null>(null);
  const resultRef = useRef<ClearInfo | null>(null);

  const fxRef = useRef({
    animT: 0,
    trail: 0,
    slamFlash: 0,
    goalBurst: 0,
    toast: '',
    toastT: 0,
    pointerSpeed: 0,
    done: false,
    lastP: null as { x: number; y: number } | null,
  });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHud = (): void => {
    const lv = lvRef.current;
    apiRef.current?.pushHud({
      level: levelRef.current,
      time: lv?.time ?? 0,
      bestLevel: getBest(bestKey(SLUG, 'level')),
      bestTime: getBest(bestKey(SLUG, 'time')),
      cp: lv ? lv.checkpointIdx + 1 : 0,
      cpTotal: lv ? lv.maze.checkpoints.length : 0,
      lastStars: resultRef.current?.stars ?? 0,
    } as Hud);
  };

  const startLevel = (api: GameApi, level: number): void => {
    const s = api.W / LW;
    const areaH = api.H / s - 150; // ruang HUD atas + bawah
    const lv = makeLevel(level, seedRef.current, LW - 24, Math.max(280, areaH));
    lvRef.current = lv;
    fxRef.current.done = false;
    setClear(null);
    mazeCvRef.current = prerenderMaze(lv);
    pushHud();
  };

  const doSlam = (api: GameApi, lv: Level): void => {
    const rp = respawnOf(lv);
    lv.ball.x = rp.x;
    lv.ball.y = rp.y;
    lv.dragging = false;
    fxRef.current.slamFlash = 1;
    fxRef.current.pointerSpeed = 0;
    fxRef.current.lastP = null;
    api.sfx.fail();
    api.shake.add(0.7);
    api.particles.spawn(lv.ball.x, lv.ball.y, {
      count: 22, colors: ['#ff6b6b', '#ffa94d', '#ffffff'],
      speed: [80, 320], gravity: 300, life: [0.4, 0.9], size: [2.5, 6],
      shape: 'rect', rotation: true,
    });
    api.scores.add(lv.ball.x, lv.ball.y - 24, 'SRODOK RAK!', { color: '#ff6b6b', size: 20 });
  };

  const doGoal = (api: GameApi, lv: Level): void => {
    const fx = fxRef.current;
    // Penjaga selesai: tanpa ini doGoal terpanggil ulang tiap frame selama
    // bola diam di goal -> banyak timeout antre, level melompat-lompat.
    if (fx.done) return;
    fx.done = true;
    lv.dragging = false;
    fx.goalBurst = 1;
    api.sfx.chime(4);
    api.particles.spawn(lv.ball.x, lv.ball.y, {
      count: 46, colors: ['#ffd166', '#4ade80', '#7dd3fc', '#ffffff'],
      speed: [60, 380], gravity: 260, life: [0.6, 1.3], size: [3, 7],
      shape: 'rect', rotation: true,
    });
    const t = lv.time;
    // Waktu terbaik = nilai TERKECIL. setBest() menyimpan max (untuk
    // skor/level), jadi untuk waktu wajib tulis hanya bila membaik —
    // dulu rekor justru mengunci waktu terburuk & toast TERBAIK mati.
    const prevBest = getBest(bestKey(SLUG, 'time'));
    const isBest = improvedBestTime(prevBest, t) !== prevBest || prevBest === 0;
    if (isBest) setJson(bestKey(SLUG, 'time'), t);
    setBest(bestKey(SLUG, 'level'), levelRef.current + 1);
    const par = parSecondsFor(lv.maze);
    const stars = starsFor(t, par);
    const info: ClearInfo = { level: levelRef.current, time: t, par, stars };
    resultRef.current = info;
    setClear(info);
    fx.toast = isBest
      ? `Level ${levelRef.current} selesai: ${t.toFixed(1)}s — TERBAIK!`
      : `Level ${levelRef.current} selesai: ${t.toFixed(1)}s`;
    fx.toastT = 1.6;
    pushHud();
    window.setTimeout(() => {
      levelRef.current += 1;
      startLevel(api, levelRef.current);
    }, 1400);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);
    startLevel(api, 1);

    const toLogical = (px: number, py: number): { x: number; y: number } => {
      const s = api.W / LW;
      return { x: px / s, y: py / s };
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      const lv = lvRef.current;
      if (!lv || screenRef.current !== 'play') return;
      const lp = toLogical(p.x, p.y);
      const d = Math.hypot(lp.x - lv.ball.x, lp.y - lv.ball.y);
      if (d < 64) {
        lv.dragging = true;
        fxRef.current.lastP = lp;
        fxRef.current.pointerSpeed = 0;
      }
    };
    api.input.onMove = (p) => {
      const lv = lvRef.current;
      if (!lv || !lv.dragging || screenRef.current !== 'play') return;
      const lp = toLogical(p.x, p.y);
      const last = fxRef.current.lastP;
      if (last) {
        const dt = 1 / 60;
        const inst = Math.hypot(lp.x - last.x, lp.y - last.y) / dt;
        // smoothing kecepatan pointer
        fxRef.current.pointerSpeed = fxRef.current.pointerSpeed * 0.7 + inst * 0.3;
      }
      fxRef.current.lastP = lp;
    };
    api.input.onUp = () => {
      const lv = lvRef.current;
      if (lv) lv.dragging = false;
      fxRef.current.lastP = null;
      fxRef.current.pointerSpeed = 0;
    };

    api.setUpdate((dt) => {
      const lv = lvRef.current;
      const fx = fxRef.current;
      fx.animT += dt;
      fx.slamFlash = Math.max(0, fx.slamFlash - dt * 2.2);
      fx.goalBurst = Math.max(0, fx.goalBurst - dt * 1.4);
      fx.toastT = Math.max(0, fx.toastT - dt);
      if (!lv || screenRef.current !== 'play') return;
      if (fx.done) return; // level sudah selesai: bekukan bola & timer

      lv.time += dt;
      if (Math.floor(lv.time * 10) !== Math.floor((lv.time - dt) * 10)) pushHud();

      if (lv.dragging && fx.lastP) {
        const res = moveBall(
          lv.maze, lv.cell,
          lv.ball.x - lv.ox, lv.ball.y - lv.oy,
          fx.lastP.x - lv.ox, fx.lastP.y - lv.oy,
          BALL_R, dt, fx.pointerSpeed,
        );
        lv.ball.x = res.x + lv.ox;
        lv.ball.y = res.y + lv.oy;
        if (res.slammed) {
          doSlam(api, lv);
          return;
        }
        // jejak partikel saat bergerak
        fx.trail += dt;
        if (fx.trail > 0.05 && !api.reducedMotion) {
          fx.trail = 0;
          api.particles.spawn(lv.ball.x, lv.ball.y, {
            count: 2, colors: ['#7dd3fc', '#38bdf8'],
            speed: [10, 60], life: [0.25, 0.5], size: [2, 4], shape: 'circle',
          });
        }
      }
      // peluruhan kecepatan pointer
      fx.pointerSpeed *= Math.max(0, 1 - dt * 6);

      // checkpoint: fungsi murni di ruang grid (radius 0,55 sel)
      const gi = furthestCheckpointIndex(
        lv.maze,
        (lv.ball.x - lv.ox) / lv.cell,
        (lv.ball.y - lv.oy) / lv.cell,
        0.55,
      );
      if (gi > lv.checkpointIdx) {
        lv.checkpointIdx = gi;
        const cp = checkpointCells(lv)[gi + 1];
        api.sfx.pop(1.3);
        api.scores.add(cp.x, cp.y - 18, 'CHECKPOINT', { color: '#4ade80', size: 15 });
        api.particles.spawn(cp.x, cp.y, {
          count: 14, colors: ['#4ade80', '#bbf7d0'],
          speed: [40, 180], life: [0.4, 0.8], size: [2, 5], shape: 'circle',
        });
        pushHud();
      }

      // goal?
      const g = cellCenter(lv.maze, lv.cell, lv.maze.goal);
      const gx = g.x + lv.ox;
      const gy = g.y + lv.oy;
      if (Math.hypot(lv.ball.x - gx, lv.ball.y - gy) < lv.cell * 0.5) {
        doGoal(api, lv);
      }
    });

    api.setRender(() => {
      const lv = lvRef.current;
      if (!lv) return;
      const fx = fxRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = fx.animT;
      ctx.save();
      ctx.scale(s, s);

      // latar: gradien malam + vignette + bintang
      const sky = ctx.createLinearGradient(0, 0, 0, lh);
      sky.addColorStop(0, '#0b1226');
      sky.addColorStop(0.6, '#101b36');
      sky.addColorStop(1, '#0a0f1f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, LW, lh);
      ctx.fillStyle = 'rgba(180,210,255,0.5)';
      for (let i = 0; i < 40; i += 1) {
        const sx = (i * 97.3) % LW;
        const sy = (i * 57.7) % lh;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + i));
        ctx.globalAlpha = 0.25 * tw;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;

      // panel labirin
      const mw = lv.cell * lv.maze.cols;
      const mh = lv.cell * lv.maze.rows;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(lv.ox - 10, lv.oy - 10, mw + 20, mh + 20, 16);
      else ctx.rect(lv.ox - 10, lv.oy - 10, mw + 20, mh + 20);
      ctx.fill();
      if (mazeCvRef.current) {
        ctx.drawImage(mazeCvRef.current, lv.ox, lv.oy, mw, mh);
      }

      // start / checkpoint / goal — semua bentuk canvas prosedural
      const cellU = lv.cell;
      // START: lingkaran hijau + segitiga main putih tergambar (path)
      const sc = cellCenter(lv.maze, lv.cell, lv.maze.start);
      {
        const x = sc.x + lv.ox;
        const y = sc.y + lv.oy;
        const rr = cellU * 0.32;
        ctx.save();
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(x - rr * 0.3, y - rr * 0.35, rr * 0.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#052e12';
        ctx.beginPath();
        ctx.moveTo(x - rr * 0.38, y - rr * 0.48);
        ctx.lineTo(x - rr * 0.38, y + rr * 0.48);
        ctx.lineTo(x + rr * 0.52, y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // CHECKPOINT: cincin berdenyut + belah ketupat di tengah
      const cps = checkpointCells(lv);
      lv.maze.checkpoints.forEach((_, i) => {
        const done = lv.checkpointIdx >= i;
        const x = cps[i + 1].x;
        const y = cps[i + 1].y;
        const col = done ? '#4ade80' : '#fbbf24';
        const ringR = cellU * 0.36 * (done ? 1 : 1 + 0.1 * Math.sin(t * 5 + i));
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = done ? 0.95 : 0.85;
        ctx.beginPath();
        ctx.arc(x, y, ringR, 0, TAU);
        ctx.stroke();
        const dr = cellU * 0.15;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, y - dr);
        ctx.lineTo(x + dr, y);
        ctx.lineTo(x, y + dr);
        ctx.lineTo(x - dr, y);
        ctx.closePath();
        ctx.fill();
        if (done) {
          ctx.fillStyle = '#052e12';
          ctx.beginPath();
          ctx.arc(x, y, dr * 0.38, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      });
      // GOAL: pintu gudang emas + bendera berkibar di atasnya
      const gc = cellCenter(lv.maze, lv.cell, lv.maze.goal);
      {
        const x = gc.x + lv.ox;
        const y = gc.y + lv.oy;
        const pulse = 1 + 0.15 * Math.sin(t * 6);
        const dw = cellU * 0.56;
        const dh = cellU * 0.62;
        ctx.save();
        ctx.shadowColor = '#ffd166';
        ctx.shadowBlur = 18 * pulse;
        const dg = ctx.createLinearGradient(x, y - dh / 2, x, y + dh / 2);
        dg.addColorStop(0, '#ffe08a');
        dg.addColorStop(1, '#d97706');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.moveTo(x - dw / 2, y + dh / 2);
        ctx.lineTo(x - dw / 2, y - dh * 0.1);
        ctx.arc(x, y - dh * 0.1, dw / 2, Math.PI, 0);
        ctx.lineTo(x + dw / 2, y + dh / 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowColor = 'transparent';
        // bilah pintu gudang (rolling door)
        ctx.strokeStyle = 'rgba(120,53,15,0.75)';
        ctx.lineWidth = 1.5;
        for (let k = 1; k <= 3; k += 1) {
          const ly = y - dh / 2 + (dh / 4) * k;
          ctx.beginPath();
          ctx.moveTo(x - dw / 2 + 2, ly);
          ctx.lineTo(x + dw / 2 - 2, ly);
          ctx.stroke();
        }
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(x, y + dh * 0.18, Math.max(1.8, cellU * 0.06), 0, TAU);
        ctx.fill();
        // tiang + bendera keselamatan oranye berkibar
        const poleTop = y - dh / 2 - cellU * 0.34;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - dh / 2);
        ctx.lineTo(x, poleTop);
        ctx.stroke();
        const wave = Math.sin(t * 7) * cellU * 0.05;
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.moveTo(x, poleTop);
        ctx.lineTo(x + cellU * 0.34, poleTop + cellU * 0.09 + wave);
        ctx.lineTo(x, poleTop + cellU * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // TROLI GUDANG: bak + dus semen + 2 roda + gagang dorong
      const b = lv.ball;
      const tr = BALL_R + 3; // radius visual troli
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      // troli = sprite generate-AI terpusat di titik bola (tabrakan tetap
      // BALL_R logic); cincin seret prosedural digambar sesudahnya.
      if (!drawSceneSprite(ctx, 'scene-troli', b.x, b.y, tr * 3.1, tr * 3.1)) {
      // bak troli
      const tg = ctx.createLinearGradient(b.x - tr, b.y - tr, b.x - tr, b.y + tr);
      tg.addColorStop(0, '#7dd3fc');
      tg.addColorStop(0.55, '#0284c7');
      tg.addColorStop(1, '#075985');
      ctx.fillStyle = tg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x - tr, b.y - tr * 0.9, tr * 2, tr * 1.5, 4);
      else ctx.rect(b.x - tr, b.y - tr * 0.9, tr * 2, tr * 1.5);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // dus semen di atas bak
      ctx.fillStyle = '#d9a066';
      ctx.fillRect(b.x - tr * 0.62, b.y - tr * 1.35, tr * 1.24, tr * 0.62);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(b.x - tr * 0.62, b.y - tr * 1.35, tr * 1.24, tr * 0.18);
      ctx.strokeStyle = '#7c4a1e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x - tr * 0.62, b.y - tr * 1.35, tr * 1.24, tr * 0.62);
      ctx.fillStyle = '#5b3a16';
      ctx.font = `900 7px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SEMEN', b.x, b.y - tr * 1.04);
      // gagang dorong
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - tr * 0.9, b.y - tr * 0.2);
      ctx.lineTo(b.x - tr * 1.5, b.y - tr * 1.1);
      ctx.stroke();
      // roda
      for (const wx of [b.x - tr * 0.55, b.x + tr * 0.55]) {
        const wg = ctx.createRadialGradient(wx - 1, b.y + tr * 0.75 - 1, 1, wx, b.y + tr * 0.75, 5);
        wg.addColorStop(0, '#64748b');
        wg.addColorStop(1, '#1e293b');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.arc(wx, b.y + tr * 0.75, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(wx, b.y + tr * 0.75, 1.8, 0, TAU);
        ctx.fill();
      }
      // outline bak
      ctx.strokeStyle = 'rgba(12,74,110,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x - tr, b.y - tr * 0.9, tr * 2, tr * 1.5, 4);
      else ctx.rect(b.x - tr, b.y - tr * 0.9, tr * 2, tr * 1.5);
      ctx.stroke();
      }
      if (lv.dragging) {
        ctx.strokeStyle = `rgba(125,211,252,${0.5 + 0.4 * Math.sin(t * 8)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, tr + 8, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();

      // flash merah saat slam
      if (fx.slamFlash > 0) {
        ctx.fillStyle = `rgba(239,68,68,${0.28 * fx.slamFlash})`;
        ctx.fillRect(0, 0, LW, lh);
      }

      // toast level selesai
      if (fx.toastT > 0 && fx.toast) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, fx.toastT * 2);
        ctx.fillStyle = 'rgba(10,18,32,0.8)';
        ctx.font = `800 15px ${FONT}`;
        ctx.textAlign = 'center';
        const tw = ctx.measureText(fx.toast).width + 36;
        const ty = 120;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(LW / 2 - tw / 2, ty, tw, 38, 12);
        else ctx.rect(LW / 2 - tw / 2, ty, tw, 38);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.textBaseline = 'middle';
        ctx.fillText(fx.toast, LW / 2, ty + 20);
        ctx.restore();
      }

      ctx.restore();
    });

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__maze = {
        get screen() { return screenRef.current; },
        get level() { return levelRef.current; },
        get ball() {
          const lv = lvRef.current;
          return lv ? { x: lv.ball.x, y: lv.ball.y } : null;
        },
        get goal() {
          const lv = lvRef.current;
          if (!lv) return null;
          const g = cellCenter(lv.maze, lv.cell, lv.maze.goal);
          return { x: g.x + lv.ox, y: g.y + lv.oy };
        },
      };
    }

    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__maze;
    };
  });

  const begin = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.sfx.click();
    setScreen('play');
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
    background: 'rgba(15,23,42,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };
  const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0b1226', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5, flexWrap: 'wrap' }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconWarehouse /> Lv {hud.level}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#7dd3fc', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconClock /> {fmt(hud.time)}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#4ade80', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconRing /> Checkpoint {hud.cp}/{hud.cpTotal}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconMedal /> Lv {hud.bestLevel}{hud.bestTime > 0 ? ` • ${fmt(hud.bestTime)}` : ''}
        </div>
        {hud.lastStars > 0 && (
          <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
            <StarsRow stars={hud.lastStars} size={15} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">
            {screen === 'play' ? <IconPause /> : <IconPlay />}
          </button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan"><IconSound off={muted} /></button>
        <button style={btn} onClick={onExit} aria-label="Tutup"><IconClose /></button>
      </div>

      {clear && screen === 'play' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: 24 }}>
          <div style={{ background: 'rgba(10,18,32,0.88)', border: '1px solid rgba(255,209,102,0.45)', borderRadius: 18, padding: '18px 26px', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 8 }}>Level {clear.level} Selesai!</div>
            <StarsRow stars={clear.stars} size={30} />
            <div style={{ color: '#7dd3fc', fontWeight: 800, fontSize: 14, marginTop: 10 }}>
              Waktu {clear.time.toFixed(1)}s • Par {clear.par.toFixed(1)}s
            </div>
            <div style={{ color: '#f1f5f9', fontSize: 12, marginTop: 4 }}>Rating {clear.stars} dari 3 bintang</div>
          </div>
        </div>
      )}

      {screen === 'ready' && (
        <Overlay>
          <div style={{ color: '#ffd166' }}><IconWarehouse size={52} /></div>
          <h2 style={titleStyle}>LABIRIN GUDANG</h2>
          <p style={textStyle}>Seret troli semen dari titik awal hijau menuju pintu gudang emas melewati rak-rak gudang. Senggol rak keras-keras = troli balik ke checkpoint terakhir. Estimator teliti, troli selamat!</p>
          <button style={{ ...primaryBtn, display: 'flex', alignItems: 'center', gap: 8 }} onClick={begin}>Mulai <IconPlay size={16} /></button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ color: '#fff' }}><IconPause size={42} /></div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Troli lagi parkir di pos satpam. Jangan diganggu.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={doResume}>Lanjut</button>
            <button style={secondaryBtn} onClick={() => { const a = apiRef.current; if (a) { startLevel(a, levelRef.current); a.loop.setPaused(false); } setScreen('play'); }}>Ulangi Lv</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(15,23,42,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: 14, lineHeight: 1.6, margin: '6px 0 14px', maxWidth: 300,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#38bdf8,#4c5fd5)', color: '#fff',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(56,189,248,0.4)',
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
      background: 'rgba(10,18,32,0.66)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
