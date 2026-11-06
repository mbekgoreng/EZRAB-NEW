/**
 * Pasangan Material — balik kartu & temukan pasangan material konstruksi.
 * Mode 4x4 (santai) & 6x6 (mandor senior). Langkah & waktu dicatat.
 * Wajah kartu = glif material PROSEDURAL (canvas, per Material.id — bukan
 * emoji, bukan aset generate); ikon overlay = SVG/CSS. Pasangan beruntun
 * tanpa salah membangun kombo (lihat logic.ts: comboBonusFor/finalScore).
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { bestKey, setBest, setJson, getJson } from '../../../engine2d/best';
import {
  createMemory, flipCard, closeMismatch, finalScore, materialById,
  mulberry32,
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
  streak: number;
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
  const [hud, setHud] = useState<Hud>({ mode: '4x4', steps: 0, time: 0, pairs: 0, total: 8, streak: 0 });
  const [result, setResult] = useState<{
    steps: number; time: number; score: number; newBest: boolean;
    comboPoints: number; mismatches: number; bestStreak: number;
  } | null>(null);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHud = (run: Run): void => {
    apiRef.current?.pushHud({
      mode: run.mode, steps: run.mem.steps, time: run.elapsed,
      pairs: run.mem.pairsFound, total: run.mem.totalPairs,
      streak: run.mem.streak,
    } as Hud);
  };

  const bestStepsKey = (m: Mode): string => bestKey(SLUG, `${m}:steps`);
  const bestTimeKey = (m: Mode): string => bestKey(SLUG, `${m}:time`);

  const startGame = (m: Mode): void => {
    const api = apiRef.current;
    if (!api) return;
    // REGRESI: permainan baru harus selalu berjalan — tanpa ini, mulai ulang
    // dari layar selesai saat loop masih terjeda membuat game beku total
    // (update loop berhenti: timer mati, kartu tak beranimasi).
    api.loop.setPaused(false);
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
      api.scores.add(
        cx, cy - 20,
        res.bonus > 0 ? `KOMBO x${res.streak} +${res.bonus}` : `+${mat.name}`,
        { color: res.bonus > 0 ? '#f59e0b' : mat.color, size: res.bonus > 0 ? 16 : 15 },
      );
      if (run.mem.pairsFound % 4 === 0) api.sfx.chime(2);
    } else if (res.kind === 'mismatch') {
      api.sfx.thud(0.4);
      api.shake.add(0.18);
      run.closeAt = run.elapsed + 0.8;
    } else if (res.kind === 'win') {
      const secs = run.elapsed;
      const score = finalScore(run.mem.steps, secs, run.mem.totalPairs, run.mem.comboPoints, run.mem.mismatches);
      let newBest = false;
      const ps = getJson<number>(bestStepsKey(run.mode), 0);
      const pt = getJson<number>(bestTimeKey(run.mode), 0);
      if (ps === 0 || run.mem.steps < ps) { setJson(bestStepsKey(run.mode), run.mem.steps); newBest = true; }
      if (pt === 0 || secs < pt) { setJson(bestTimeKey(run.mode), secs); newBest = true; }
      setBest(bestKey(SLUG, 'score'), score);
      setResult({
        steps: run.mem.steps, time: secs, score, newBest,
        comboPoints: run.mem.comboPoints, mismatches: run.mem.mismatches,
        bestStreak: run.mem.bestStreak,
      });
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
      // hanya pindah ke layar selesai bila pemain tidak menjeda di jendela ini
      window.setTimeout(() => { if (screenRef.current === 'play') setScreen('over'); }, 900);
    }
    pushHud(run);
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
    // bila dijeda tepat di jendela perayaan menang, lanjut = ke layar selesai
    setScreen(runRef.current?.mem.finished ? 'over' : 'play');
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
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <IconBrick size={16} /> {hud.mode} • {hud.pairs}/{hud.total}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#7dd3fc', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
          <IconSteps size={14} /> {hud.steps} <IconClock size={14} /> {fmt(hud.time)}
        </div>
        {hud.streak >= 2 && (
          <div style={{ background: 'rgba(245,158,11,0.85)', borderRadius: 12, padding: '6px 10px', color: '#fff', fontWeight: 900, fontSize: 13 }}>
            KOMBO x{hud.streak}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">
            {screen === 'play' ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? <IconMute size={19} /> : <IconSound size={19} />}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup"><IconClose size={17} /></button>
      </div>

      {screen === 'ready' && (
        <Overlay>
          <IconBrick size={46} />
          <h2 style={titleStyle}>PASANGAN MATERIAL</h2>
          <p style={textStyle}>Balik kartu &amp; temukan pasangan material yang sama. 4×4 buat kenek magang, 6×6 buat mandor senior! Pasangan beruntun tanpa salah = bonus kombo; meleset kena penalti 15 poin.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={() => startGame('4x4')}>4×4 Santai</button>
            <button style={secondaryBtn} onClick={() => startGame('6x6')}>6×6 Senior</button>
          </div>
          {(bestS > 0 || bestT > 0) && (
            <p style={{ ...textStyle, marginTop: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconMedal size={15} /> {mode}: {bestS > 0 ? `${bestS} langkah` : '—'}{bestT > 0 ? ` • ${fmt(bestT)}` : ''}
            </p>
          )}
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <span style={{ width: 58, height: 58, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconPause size={26} />
          </span>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Kartu-kartu istirahat dulu.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={doResume}>Lanjut</button>
            <button style={secondaryBtn} onClick={() => startGame(modeRef.current)}>Ulangi</button>
          </div>
        </Overlay>
      )}
      {screen === 'over' && result && (
        <Overlay>
          <IconTrophy size={46} />
          <h2 style={titleStyle}>GUDANG RAPI!</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            {result.steps} langkah • {fmt(result.time)} • Skor {result.score}
            {result.newBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <p style={{ ...textStyle, fontSize: 13, marginTop: 0 }}>
            Kombo terbaik x{Math.max(1, result.bestStreak)} (+{result.comboPoints} poin)
            {' • '}Meleset {result.mismatches}x (−{result.mismatches * 15} poin)
          </p>
          <p style={textStyle}>Semua material ketemu pasangannya. Estimator bangga.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => startGame(modeRef.current)}>Main Lagi</button>
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
    // medali lingkaran terang + cincin warna material
    const mr = Math.min(w, h) * 0.30;
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 3, mr, 0, TAU); ctx.fill();
    const mg = ctx.createRadialGradient(cx - mr * 0.3, cy - mr * 0.35, mr * 0.2, cx, cy, mr);
    mg.addColorStop(0, '#ffffff');
    mg.addColorStop(1, '#eef2f7');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(cx, cy, mr, 0, TAU); ctx.fill();
    ctx.strokeStyle = mat.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, mr, 0, TAU); ctx.stroke();
    // glif material prosedural (vektor canvas per id — BUKAN emoji)
    drawMaterialGlyph(ctx, mat.id, cx, cy, mr * 0.62);
    // nama material
    ctx.fillStyle = dim ? '#15803d' : '#1e293b';
    ctx.font = `800 ${small ? 8.5 : 11}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mat.name.toUpperCase(), cx, y + h * 0.82, w - 8);
    if (dim) {
      // centang digambar dari dua segmen garis (bukan glif teks)
      const kx = x + w - 15;
      const ky = y + 15;
      const ks = small ? 5 : 7;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(kx - ks, ky);
      ctx.lineTo(kx - ks * 0.3, ky + ks * 0.7);
      ctx.lineTo(kx + ks, ky - ks * 0.7);
      ctx.stroke();
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

/**
 * Glif material PROSEDURAL — digambar dari primitif canvas (bukan emoji,
 * bukan aset generate; tercatat jujur sebagai prosedural). Kotak glif 32x32
 * satuan di sekitar (cx,cy), s = setengah sisi; siluet tebal + warna khas
 * agar ke-18 jenis terbedakan pada kartu 6x6 (~33px) maupun 4x4 (~50px).
 * Kunci mengikuti Material.id di logic.ts.
 */
function drawMaterialGlyph(
  ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 16, s / 16);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (id) {
    case 'bata': { // Bata Merah: pola bata 3 baris berselang-seling
      ctx.fillStyle = '#f3e2c7';
      ctx.fillRect(-14, -10, 28, 20);
      for (let row = 0; row < 3; row += 1) {
        const off = row % 2 === 0 ? 0 : -6.75;
        for (let col = 0; col < 3; col += 1) {
          ctx.fillStyle = (row + col) % 2 === 0 ? '#dc2626' : '#b91c1c';
          ctx.fillRect(off + col * 13.5 - 13, -9.4 + row * 6.6, 12.3, 5.6);
        }
      }
      ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.4; ctx.strokeRect(-14, -10, 28, 20);
      break;
    }
    case 'semen': { // Semen: karung kertas + lipatan atas + label
      ctx.fillStyle = '#d8c49a';
      ctx.beginPath();
      ctx.moveTo(-8, -11); ctx.lineTo(8, -11); ctx.lineTo(11, 12); ctx.lineTo(-11, 12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a6d3b'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#b08d4f'; ctx.fillRect(-8, -14.5, 16, 4);
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(-6, 0, 12, 8);
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(0, 4, 2.4, 0, TAU); ctx.fill();
      break;
    }
    case 'helm': { // Helm Proyek: kubah + tonjolan tengah + brim
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(0, 3, 11, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d97706'; ctx.fillRect(-2.2, -10.5, 4.4, 4.5);
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(-14, 3, 28, 4.5);
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 3, 11, Math.PI, 0); ctx.stroke();
      ctx.strokeRect(-14, 3, 28, 4.5);
      break;
    }
    case 'crane': { // Tower Crane: tiang + jib + kabel & beban
      ctx.strokeStyle = '#a16207'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-9, 14); ctx.lineTo(-9, -12);
      ctx.moveTo(-14, -12); ctx.lineTo(14, -12);
      ctx.moveTo(-9, -12); ctx.lineTo(2, -5);
      ctx.stroke();
      ctx.fillStyle = '#78716c'; ctx.fillRect(-14.5, -10, 4.5, 5.5);
      ctx.strokeStyle = '#57534e'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(9, -12); ctx.lineTo(9, -2); ctx.stroke();
      ctx.fillStyle = '#78716c'; ctx.fillRect(5, -2, 8, 6.5);
      ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-13.5, 14); ctx.lineTo(-4.5, 14); ctx.stroke();
      break;
    }
    case 'palu': { // Palu: kepala baja + gagang kayu (miring)
      ctx.save();
      ctx.rotate(-0.7);
      ctx.fillStyle = '#92400e'; ctx.fillRect(-1.8, -2, 3.6, 15);
      ctx.fillStyle = '#64748b'; ctx.fillRect(-9, -13, 18, 8);
      ctx.fillStyle = '#475569'; ctx.fillRect(6.5, -13, 3.5, 8);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.3; ctx.strokeRect(-9, -13, 18, 8);
      ctx.restore();
      break;
    }
    case 'gergaji': { // Gergaji: bilah bergigi + gagang kayu
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(-14, 5); ctx.lineTo(6, 5); ctx.lineTo(6, -6); ctx.lineTo(-14, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath();
      for (let tx = -14; tx < 6; tx += 3.4) {
        ctx.moveTo(tx, 5); ctx.lineTo(tx + 1.7, 8); ctx.lineTo(tx + 3.4, 5);
      }
      ctx.stroke();
      ctx.fillStyle = '#b45309';
      if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(6, -8, 9, 13, 3); ctx.fill(); }
      else ctx.fillRect(6, -8, 9, 13);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(10.5, -1.5, 2.3, 0, TAU); ctx.fill();
      break;
    }
    case 'kunci': { // Kunci Inggris: rahang terbuka + tangkai (miring)
      ctx.save();
      ctx.rotate(0.8);
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(0, -6, 6.8, 0, TAU); ctx.fill();
      ctx.fillRect(-2.2, -1, 4.4, 13);
      ctx.fillStyle = '#ffffff'; // potongan rahang
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(8.5, -13); ctx.lineTo(8.5, -4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#475569';
      ctx.beginPath(); ctx.arc(0, -6, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 10.5, 1.7, 0, TAU); ctx.fill();
      ctx.restore();
      break;
    }
    case 'obeng': { // Obeng: gagang merah + batang + ujung pipih (miring)
      ctx.save();
      ctx.rotate(0.7);
      ctx.fillStyle = '#dc2626';
      if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(-3.4, -14, 6.8, 11, 3); ctx.fill(); }
      else ctx.fillRect(-3.4, -14, 6.8, 11);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(-1.1, -3, 2.2, 11);
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(-1.1, 8); ctx.lineTo(1.1, 8); ctx.lineTo(0, 13.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    }
    case 'toolbox': { // Kotak Perkakas: badan + tutup + gagang + kait
      ctx.fillStyle = '#dc2626'; ctx.fillRect(-13, -2, 26, 13);
      ctx.fillStyle = '#b91c1c'; ctx.fillRect(-13, -7, 26, 5);
      ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.4; ctx.strokeRect(-13, -7, 26, 18);
      ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -7, 6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(-2.5, 1.5, 5, 6.5);
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1; ctx.strokeRect(-2.5, 1.5, 5, 6.5);
      break;
    }
    case 'cat': { // Cat Tembok: ember + permukaan cat + tetesan
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(7, 12); ctx.lineTo(-7, 12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#a855f7';
      ctx.beginPath(); ctx.ellipse(0, -8, 9, 2.8, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-3, 0.5, 2.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(-8.1, 5); ctx.lineTo(8.1, 5); ctx.stroke();
      break;
    }
    case 'kayu': { // Kayu Balok: potongan log — lingkaran tahun konsentris
      ctx.fillStyle = '#92400e';
      ctx.beginPath(); ctx.arc(0, 0, 12.5, 0, TAU); ctx.fill();
      const rings: [number, string][] = [[9.5, '#b45309'], [7, '#d97706'], [4.5, '#f59e0b'], [2, '#fbbf24']];
      for (const [r, c] of rings) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7.5, -6); ctx.stroke();
      break;
    }
    case 'tangga': { // Tangga: dua rel + empat anak tangga
      ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, -13); ctx.lineTo(-8, 13);
      ctx.moveTo(8, -13); ctx.lineTo(8, 13);
      ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (const ry of [-7, 0, 7]) { ctx.moveTo(-8, ry); ctx.lineTo(8, ry); }
      ctx.stroke();
      break;
    }
    case 'paku': { // Paku: kepala lebar + badan meruncing
      ctx.fillStyle = '#64748b'; ctx.fillRect(-8, -13.5, 16, 4.5);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2; ctx.strokeRect(-8, -13.5, 16, 4.5);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(-2.6, -9); ctx.lineTo(2.6, -9); ctx.lineTo(0.7, 9); ctx.lineTo(0, 13.5); ctx.lineTo(-0.7, 9);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.stroke();
      break;
    }
    case 'batu': { // Batu Kali: poligon tak beraturan + garis faset
      ctx.fillStyle = '#9aa0a8';
      ctx.beginPath();
      ctx.moveTo(-12, 9); ctx.lineTo(-13, -2); ctx.lineTo(-6, -11); ctx.lineTo(4, -13);
      ctx.lineTo(12, -6); ctx.lineTo(13, 6); ctx.lineTo(6, 11);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#565d66'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-9, 8);
      ctx.moveTo(-2, 0); ctx.lineTo(10, -4);
      ctx.stroke();
      break;
    }
    case 'barikade': { // Barikade: papan garis miring oranye + kaki
      ctx.save();
      ctx.beginPath(); ctx.rect(-14, -9, 28, 12); ctx.clip();
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(-14, -9, 28, 12);
      ctx.strokeStyle = '#f97316'; ctx.lineWidth = 5.5;
      ctx.beginPath();
      for (let bx = -20; bx < 16; bx += 11) {
        ctx.moveTo(bx, 4); ctx.lineTo(bx + 8, -10);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.5; ctx.strokeRect(-14, -9, 28, 12);
      ctx.strokeStyle = '#57534e'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-9, 3); ctx.lineTo(-11, 13);
      ctx.moveTo(9, 3); ctx.lineTo(11, 13);
      ctx.stroke();
      break;
    }
    case 'rompi': { // Rompi Proyek: siluet rompi + dua garis reflektif
      const vest = new Path2D();
      vest.moveTo(-6, -13); vest.lineTo(-11, -11); vest.lineTo(-9.5, 13);
      vest.lineTo(9.5, 13); vest.lineTo(11, -11); vest.lineTo(6, -13);
      vest.lineTo(2.5, -6); vest.lineTo(0, -4); vest.lineTo(-2.5, -6);
      vest.closePath();
      ctx.fillStyle = '#84cc16'; ctx.fill(vest);
      ctx.save();
      ctx.clip(vest);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-12, 2, 24, 3.4); ctx.fillRect(-12, 8, 24, 3.4);
      ctx.restore();
      ctx.strokeStyle = '#3f6212'; ctx.lineWidth = 1.5; ctx.stroke(vest);
      break;
    }
    case 'pipa': { // Baut Pipa: kepala baut heksagon + lubang + celah
      ctx.fillStyle = '#94a3b8';
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * TAU - Math.PI / 6;
        const px = 12 * Math.cos(a); const py = 12 * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-3.5, 3.5); ctx.lineTo(3.5, -3.5); ctx.stroke();
      break;
    }
    case 'meteran': { // Meteran: kotak kuning + gulungan + pita keluar
      ctx.fillStyle = '#eab308';
      if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(-13, -11, 20, 22, 5); ctx.fill(); }
      else ctx.fillRect(-13, -11, 20, 22);
      ctx.strokeStyle = '#854d0e'; ctx.lineWidth = 1.6;
      if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(-13, -11, 20, 22, 5); ctx.stroke(); }
      else ctx.strokeRect(-13, -11, 20, 22);
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(-3, 0, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#854d0e'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(-3, 0, 6, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#854d0e';
      ctx.beginPath(); ctx.arc(-3, 0, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(7, -3, 9.5, 6);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.1; ctx.strokeRect(7, -3, 9.5, 6);
      ctx.beginPath();
      ctx.moveTo(10.5, -3); ctx.lineTo(10.5, 0);
      ctx.moveTo(13.5, -3); ctx.lineTo(13.5, 0);
      ctx.stroke();
      break;
    }
    default: { // cadangan: cakram warna + titik tengah
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Ikon UI prosedural (SVG digambar kode — BUKAN emoji, BUKAN aset generate). */
function svgProps(size: number): React.SVGProps<SVGSVGElement> {
  return {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { display: 'block', flexShrink: 0 },
  };
}
function IconBrick({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)} stroke="#f87171"><rect x="3" y="7" width="18" height="11" rx="1.5" fill="#c4502e" stroke="#7e2f16" /><line x1="12" y1="7" x2="12" y2="12.5" stroke="#7e2f16" /><line x1="7.5" y1="12.5" x2="7.5" y2="18" stroke="#7e2f16" /><line x1="16.5" y1="12.5" x2="16.5" y2="18" stroke="#7e2f16" /><line x1="3" y1="12.5" x2="21" y2="12.5" stroke="#7e2f16" /></svg>);
}
function IconSteps({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)}><ellipse cx="8" cy="7" rx="3" ry="4.5" fill="currentColor" stroke="none" transform="rotate(-18 8 7)" /><ellipse cx="16.5" cy="16.5" rx="3" ry="4.5" fill="currentColor" stroke="none" transform="rotate(-18 16.5 16.5)" opacity="0.65" /></svg>);
}
function IconClock({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5 V12 L15.5 14" /></svg>);
}
function IconPause({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)}><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></svg>);
}
function IconPlay({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)}><path d="M8 5.5 L19 12 L8 18.5 Z" fill="currentColor" stroke="none" /></svg>);
}
function IconSound({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)}><path d="M4 9.5 V14.5 H7.5 L13 19 V5 L7.5 9.5 Z" fill="currentColor" stroke="none" /><path d="M16 9.5 a4 4 0 0 1 0 5 M18.5 7 a7.5 7.5 0 0 1 0 10" /></svg>);
}
function IconMute({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)}><path d="M4 9.5 V14.5 H7.5 L13 19 V5 L7.5 9.5 Z" fill="currentColor" stroke="none" /><line x1="16" y1="9.5" x2="21" y2="14.5" /><line x1="21" y1="9.5" x2="16" y2="14.5" /></svg>);
}
function IconClose({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>);
}
function IconMedal({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)} stroke="#fbbf24"><circle cx="12" cy="14.5" r="5.5" fill="#f59e0b" stroke="#b45309" /><path d="M8.5 9.5 L5.5 3.5 M15.5 9.5 L18.5 3.5" stroke="#60a5fa" /><path d="M12 11.8 l0.9 1.8 2 .3 -1.45 1.4 .35 2 -1.8 -0.95 -1.8 .95 .35 -2 -1.45 -1.4 2 -.3 Z" fill="#fff7ed" stroke="none" /></svg>);
}
function IconTrophy({ size = 24 }: { size?: number }): React.JSX.Element {
  return (<svg {...svgProps(size)} stroke="#fbbf24"><path d="M7 4 H17 V10 a5 5 0 0 1 -10 0 Z" fill="#f59e0b" stroke="#b45309" /><path d="M7 6 H4.5 a2.5 2.5 0 0 0 2.7 4.4 M17 6 H19.5 a2.5 2.5 0 0 1 -2.7 4.4" stroke="#b45309" /><line x1="12" y1="15" x2="12" y2="18" stroke="#b45309" /><line x1="8" y1="20.5" x2="16" y2="20.5" stroke="#b45309" /></svg>);
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
