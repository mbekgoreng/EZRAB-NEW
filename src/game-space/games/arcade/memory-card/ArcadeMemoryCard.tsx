/**
 * Pasangan Material — balik kartu & temukan pasangan material konstruksi.
 * Mode 4x4 (santai) & 6x6 (mandor senior). Langkah & waktu dicatat.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { bestKey, setBest, setJson, getJson } from '../../../engine2d/best';
import {
  createMemory, flipCard, closeMismatch, scoreFor, materialById,
  mulberry32, pairsForMode,
  type MemoryState, type Mode,
} from './logic';

const SLUG = 'memory-card';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';

interface Hud {
  mode: Mode;
  steps: number;
  time: number;
  pairs: number;
  total: number;
}

interface Run {
  mem: MemoryState;
  mode: Mode;
  flipT: number[]; // 0 = belakang, 1 = depan
  elapsed: number;
  closeAt: number; // waktu menutup mismatch, -1 = tidak ada
  grid: { x: number; y: number; cw: number; ch: number; gap: number; cols: number; rows: number };
  winFx: number;
}

function layoutGrid(mode: Mode): Run['grid'] {
  const cols = mode === '4x4' ? 4 : 6;
  const rows = cols;
  const gap = mode === '4x4' ? 8 : 6;
  const pad = 16;
  const cw = (LW - pad * 2 - gap * (cols - 1)) / cols;
  const ch = cw * (mode === '4x4' ? 1.18 : 1.12);
  const totalH = ch * rows + gap * (rows - 1);
  const y = 108 + Math.max(0, (560 - totalH) / 2);
  return { x: pad, y, cw, ch, gap, cols, rows };
}

function cardAt(g: Run['grid'], i: number): { x: number; y: number } {
  const c = i % g.cols;
  const r = Math.floor(i / g.cols);
  return { x: g.x + c * (g.cw + g.gap), y: g.y + r * (g.ch + g.gap) };
}

export default function ArcadeMemoryCard({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const runRef = useRef<Run | null>(null);
  const screenRef = useRef<Screen>('ready');
  const modeRef = useRef<Mode>('4x4');
  const [screen, setScreenState] = useState<Screen>('ready');
  const [mode, setModeState] = useState<Mode>('4x4');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ mode: '4x4', steps: 0, time: 0, pairs: 0, total: 8 });
  const [result, setResult] = useState<{ steps: number; time: number; score: number; newBest: boolean } | null>(null);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHud = (run: Run): void => {
    apiRef.current?.pushHud({
      mode: run.mode, steps: run.mem.steps, time: run.elapsed,
      pairs: run.mem.pairsFound, total: run.mem.totalPairs,
    } as Hud);
  };

  const bestStepsKey = (m: Mode): string => bestKey(SLUG, `${m}:steps`);
  const bestTimeKey = (m: Mode): string => bestKey(SLUG, `${m}:time`);

  const startGame = (m: Mode): void => {
    const api = apiRef.current;
    if (!api) return;
    modeRef.current = m;
    setModeState(m);
    const mem = createMemory(m, mulberry32((Date.now() % 100000) | 0));
    runRef.current = {
      mem,
      mode: m,
      flipT: new Array(mem.deck.length).fill(0),
      elapsed: 0,
      closeAt: -1,
      grid: layoutGrid(m),
      winFx: 0,
    };
    setResult(null);
    pushHud(runRef.current);
    setScreen('play');
    api.sfx.ensure();
    api.sfx.click();
  };

  const doFlip = (i: number): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play') return;
    const before = run.mem.steps;
    const res = flipCard(run.mem, i);
    if (res.kind === 'ignored') return;
    if (res.kind === 'first') {
      api.sfx.click();
    } else if (res.kind === 'match') {
      api.sfx.pop(1 + Math.min(0.5, run.mem.pairsFound * 0.05));
      const { x, y } = cardAt(run.grid, i);
      const cx = x + run.grid.cw / 2;
      const cy = y + run.grid.ch / 2;
      const mat = materialById(run.mem.deck[i]);
      api.particles.spawn(cx, cy, {
        count: 16, colors: [mat.color, '#ffffff', '#ffd166'],
        speed: [60, 240], gravity: 200, life: [0.4, 0.8], size: [2.5, 5.5],
        shape: 'rect', rotation: true,
      });
      api.scores.add(cx, cy - 20, `+${mat.name}`, { color: mat.color, size: 15 });
      if (run.mem.pairsFound % 4 === 0) api.sfx.chime(2);
    } else if (res.kind === 'mismatch') {
      api.sfx.thud(0.4);
      api.shake.add(0.18);
      run.closeAt = run.elapsed + 0.8;
    } else if (res.kind === 'win') {
      const secs = run.elapsed;
      const score = scoreFor(run.mem.steps, secs, run.mem.totalPairs);
      let newBest = false;
      const ps = getJson<number>(bestStepsKey(run.mode), 0);
      const pt = getJson<number>(bestTimeKey(run.mode), 0);
      if (ps === 0 || run.mem.steps < ps) { setJson(bestStepsKey(run.mode), run.mem.steps); newBest = true; }
      if (pt === 0 || secs < pt) { setJson(bestTimeKey(run.mode), secs); newBest = true; }
      setBest(bestKey(SLUG, 'score'), score);
      setResult({ steps: run.mem.steps, time: secs, score, newBest });
      run.winFx = 1;
      api.sfx.chime(4);
      api.shake.add(0.3);
      // hujan konfeti
      for (let k = 0; k < 3; k += 1) {
        api.particles.spawn(60 + k * 135, 120, {
          count: 26, colors: ['#ffd166', '#4ade80', '#7dd3fc', '#f472b6', '#ffffff'],
          speed: [80, 300], gravity: 420, life: [0.8, 1.6], size: [3, 7],
          shape: 'rect', rotation: true,
        });
      }
      window.setTimeout(() => setScreen('over'), 900);
    }
    if (run.mem.steps !== before) pushHud(run);
    else pushHud(run);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);

    const toLogical = (px: number, py: number): { x: number; y: number } => {
      const s = api.W / LW;
      return { x: px / s, y: py / s };
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      const run = runRef.current;
      if (!run || screenRef.current !== 'play') return;
      const lp = toLogical(p.x, p.y);
      const g = run.grid;
      for (let i = 0; i < run.mem.deck.length; i += 1) {
        const { x, y } = cardAt(g, i);
        if (lp.x >= x && lp.x <= x + g.cw && lp.y >= y && lp.y <= y + g.ch) {
          doFlip(i);
          break;
        }
      }
    };

    api.setUpdate((dt) => {
      const run = runRef.current;
      if (!run) return;
      const mem = run.mem;
      // animasi flip selalu jalan (biar mulus)
      for (let i = 0; i < run.flipT.length; i += 1) {
        const target = mem.open.includes(i) || mem.matched[i] ? 1 : 0;
        const cur = run.flipT[i];
        if (cur !== target) {
          const sp = api.reducedMotion ? 14 : 10;
          const nx = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), sp * dt);
          run.flipT[i] = Math.abs(nx - target) < 0.02 ? target : nx;
        }
      }
      if (screenRef.current !== 'play') return;
      if (mem.started && !mem.finished) {
        run.elapsed += dt;
        pushHudThrottled(run, dt);
      }
      if (run.closeAt >= 0 && run.elapsed >= run.closeAt && mem.locked) {
        closeMismatch(mem);
        run.closeAt = -1;
      }
      run.winFx = Math.max(0, run.winFx - dt * 0.8);
    });

    let hudAcc = 0;
    function pushHudThrottled(run: Run, dt: number): void {
      hudAcc += dt;
      if (hudAcc > 0.25) {
        hudAcc = 0;
        pushHud(run);
      }
    }

    api.setRender(() => {
      const run = runRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = performance.now() / 1000;
      ctx.save();
      ctx.scale(s, s);

      // latar gudang: gradien + blueprint grid
      const sky = ctx.createLinearGradient(0, 0, 0, lh);
      sky.addColorStop(0, '#131c33');
      sky.addColorStop(1, '#0b1122');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, LW, lh);
      ctx.strokeStyle = 'rgba(120,160,220,0.07)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < LW; gx += 26) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, lh); ctx.stroke();
      }
      for (let gy = 0; gy < lh; gy += 26) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(LW, gy); ctx.stroke();
      }

      if (!run) {
        ctx.restore();
        return;
      }
      const g = run.grid;
      const mem = run.mem;
      const small = run.mode === '6x6';

      for (let i = 0; i < mem.deck.length; i += 1) {
        const { x, y } = cardAt(g, i);
        const cx = x + g.cw / 2;
        const ft = run.flipT[i];
        const sx = Math.abs(Math.cos(ft * Math.PI));
        const w = Math.max(0.001, g.cw * sx);
        const faceUp = ft > 0.5;
        ctx.save();
        ctx.translate(cx, y + g.ch / 2);
        ctx.scale(w / g.cw, 1);
        ctx.translate(-g.cw / 2, -g.ch / 2);
        drawCard(ctx, 0, 0, g.cw, g.ch, faceUp, mem, i, small, t);
        ctx.restore();
      }
      ctx.restore();
    });

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__memory = {
        get screen() { return screenRef.current; },
        get mode() { return modeRef.current; },
        get steps() { return runRef.current?.mem.steps ?? 0; },
        get pairs() { return runRef.current?.mem.pairsFound ?? 0; },
        get finished() { return runRef.current?.mem.finished ?? false; },
        get deck() { return runRef.current ? [...runRef.current.mem.deck] : []; },
        flip(i: number) { doFlip(i); },
        start(m: Mode) { startGame(m); },
      };
    }

    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__memory;
    };
  });

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
  const fmt = (sec: number): string =>
    `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const bestS = getJson<number>(bestStepsKey(mode), 0);
  const bestT = getJson<number>(bestTimeKey(mode), 0);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0b1122', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          🧱 {hud.mode} • {hud.pairs}/{hud.total}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#7dd3fc', fontWeight: 800, fontSize: 13 }}>
          👣 {hud.steps} • ⏱ {fmt(hud.time)}
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

      {screen === 'ready' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🧱</div>
          <h2 style={titleStyle}>PASANGAN MATERIAL</h2>
          <p style={textStyle}>Balik kartu &amp; temukan pasangan material yang sama. 4×4 buat kenek magang, 6×6 buat mandor senior!</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={() => startGame('4x4')}>4×4 Santai</button>
            <button style={secondaryBtn} onClick={() => startGame('6x6')}>6×6 Senior</button>
          </div>
          {(bestS > 0 || bestT > 0) && (
            <p style={{ ...textStyle, marginTop: 12, fontSize: 13 }}>
              🏅 {mode}: {bestS > 0 ? `${bestS} langkah` : '—'}{bestT > 0 ? ` • ${fmt(bestT)}` : ''}
            </p>
          )}
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>⏸</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Kartu-kartu istirahat dulu.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={doResume}>Lanjut</button>
            <button style={secondaryBtn} onClick={() => { apiRef.current?.loop.setPaused(false); startGame(modeRef.current); }}>Ulangi</button>
          </div>
        </Overlay>
      )}
      {screen === 'over' && result && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🏆</div>
          <h2 style={titleStyle}>GUDANG RAPI!</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            👣 {result.steps} langkah • ⏱ {fmt(result.time)} • ⭐ {result.score}
            {result.newBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <p style={textStyle}>Semua material ketemu pasangannya. Estimator bangga.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => startGame(modeRef.current)}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={() => setScreen('ready')}>Ganti Mode</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function drawCard(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  faceUp: boolean, mem: MemoryState, i: number, small: boolean, t: number,
): void {
  const r = 12;
  ctx.save();
  // bayangan
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x + 2, y + 4, w, h, r);
  else ctx.rect(x + 2, y + 4, w, h);
  ctx.fill();

  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.clip();

  if (!faceUp) {
    // belakang: blueprint + paku rivet + tanda tanya
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#2b4a7f');
    g.addColorStop(1, '#1a2f55');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(140,180,240,0.25)';
    ctx.lineWidth = 1;
    for (let gx = x + 8; gx < x + w; gx += 14) {
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke();
    }
    for (const [rx, ry] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) {
      ctx.fillStyle = '#93c5fd';
      ctx.beginPath(); ctx.arc(rx, ry, 2.4, 0, TAU); ctx.fill();
    }
    const pulse = 1 + 0.08 * Math.sin(t * 4 + i);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `900 ${Math.round(h * 0.34 * pulse)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h / 2 + 1);
  } else {
    const mat = materialById(mem.deck[i]);
    const dim = mem.matched[i];
    // depan: kartu putih + pita warna material
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, dim ? '#e8f5e9' : '#ffffff');
    g.addColorStop(1, dim ? '#c8e6c9' : '#e2e8f0');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = mat.color;
    ctx.fillRect(x, y, w, Math.max(5, h * 0.09));
    // medali lingkaran berlapis
    const mr = Math.min(w, h) * 0.30;
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 3, mr, 0, TAU); ctx.fill();
    const mg = ctx.createRadialGradient(cx - mr * 0.3, cy - mr * 0.35, mr * 0.2, cx, cy, mr);
    mg.addColorStop(0, '#ffffff');
    mg.addColorStop(0.5, mat.color);
    mg.addColorStop(1, mat.color);
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(cx, cy, mr, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, mr, 0, TAU); ctx.stroke();
    ctx.font = `${Math.round(mr * 1.25)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mat.emoji, cx, cy + 1);
    // nama material
    ctx.fillStyle = dim ? '#15803d' : '#1e293b';
    ctx.font = `800 ${small ? 8.5 : 11}px ${FONT}`;
    ctx.fillText(mat.name.toUpperCase(), cx, y + h * 0.82, w - 8);
    if (dim) {
      ctx.fillStyle = 'rgba(74,222,128,0.9)';
      ctx.font = `900 ${small ? 13 : 17}px system-ui`;
      ctx.fillText('✓', x + w - 14, y + 16);
    }
  }
  // outline (di luar clip)
  ctx.restore();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.strokeStyle = faceUp ? 'rgba(255,255,255,0.65)' : 'rgba(147,197,253,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(15,23,42,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: 14, lineHeight: 1.6, margin: '6px 0 14px', maxWidth: 300,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: '#fff',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(245,158,11,0.4)',
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
