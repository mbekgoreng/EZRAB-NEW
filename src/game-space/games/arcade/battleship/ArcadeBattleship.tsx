/**
 * PERANG CRANE — Battleship reskin konstruksi.
 * Taruh armada alat berat di grid lahan 10x10, lalu bombardir markas AI SEDANG.
 * Hunt/target AI (paritas + perpanjangan garis) — bisa dikalahkan dengan strategi.
 * Semua grafis gameplay digambar prosedural di canvas (siluet vektor per jenis
 * alat berat, ledakan bintang, riak meleset, asap bangkai) — tanpa emoji.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, setJson, getJson } from '../../../engine2d/best';
import {
  SIZE, FLEET, emptyBoard, canPlace, placeShip, placeFleetRandom, fireAt, allSunk,
  shipAt, key, createAi, aiChooseShot, aiRegister, mulberry32, placementCells,
  type Board, type AiMemory, type Placed, type ShipKind,
} from './logic';

const SLUG = 'battleship';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'place' | 'play' | 'pause' | 'over';

interface Hud {
  phase: Screen;
  shots: number;
  enemyLeft: number;
  ownLeft: number;
  turn: 'kamu' | 'lawan';
}

interface Run {
  mine: Board;
  enemy: Board;
  ai: AiMemory;
  shots: number;
  hits: number;
  enemyLeft: number; // kapal musuh yg belum tenggelam
  ownLeft: number;
  selShip: number; // indeks kapal yg dipilih saat place
  horiz: boolean;
  hoverGx: number; // sel bidik pratinjau penempatan (-1 = di luar grid)
  hoverGy: number;
  aiTimer: number; // jeda sebelum AI menembak, -1 = tidak
  msg: string;
  msgT: number;
  sunkFlash: number;
  over: 'menang' | 'kalah' | null;
  newBest: boolean;
}

export default function ArcadeBattleship({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const runRef = useRef<Run | null>(null);
  const screenRef = useRef<Screen>('ready');
  const [screen, setScreenState] = useState<Screen>('ready');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ phase: 'ready', shots: 0, enemyLeft: 5, ownLeft: 5, turn: 'kamu' });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const pushHud = (run: Run): void => {
    apiRef.current?.pushHud({
      phase: screenRef.current, shots: run.shots, enemyLeft: run.enemyLeft,
      ownLeft: run.ownLeft, turn: run.aiTimer >= 0 ? 'lawan' : 'kamu',
    } as Hud);
  };

  const shotsKey = bestKey(SLUG, 'shots');

  const newRun = (): Run => ({
    mine: emptyBoard(),
    enemy: emptyBoard(),
    ai: createAi(),
    shots: 0, hits: 0, enemyLeft: 5, ownLeft: 5,
    selShip: 0, horiz: true, hoverGx: -1, hoverGy: -1,
    aiTimer: -1, msg: '', msgT: 0,
    sunkFlash: 0, over: null, newBest: false,
  });

  const startPlace = (): void => {
    const api = apiRef.current;
    if (!api) return;
    runRef.current = newRun();
    pushHud(runRef.current);
    setScreen('place');
    api.sfx.ensure();
    api.sfx.click();
  };

  const flash = (run: Run, msg: string): void => {
    run.msg = msg;
    run.msgT = 1.6;
  };

  const doPlaceAt = (gx: number, gy: number): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'place') return;
    const def = FLEET[run.selShip];
    if (run.mine.ships.some((s) => s.def === def)) return;
    if (!canPlace(run.mine, def, gx, gy, run.horiz)) {
      api.sfx.thud(0.3);
      flash(run, 'Mentok! Cari petak lain.');
      return;
    }
    placeShip(run.mine, def, gx, gy, run.horiz);
    api.sfx.pop(0.9);
    // lompat ke kapal berikutnya yg belum ditaruh
    const next = FLEET.findIndex((d, i) => i !== run.selShip && !run.mine.ships.some((s) => s.def === d));
    if (next >= 0) run.selShip = next;
    const { x, y } = gridToLogical(gx, gy);
    api.particles.spawn(x + CELL / 2, y + CELL / 2, {
      count: 10, colors: ['#ffd166', '#fb923c', '#fff'],
      speed: [60, 180], gravity: 160, life: [0.3, 0.6], size: [2, 5], shape: 'rect',
    });
    if (run.mine.ships.length === FLEET.length) flash(run, 'Armada siap! Tekan SERANG!');
    pushHud(run);
  };

  const aiTurn = (): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.over) return;
    const rng = mulberry32((Date.now() % 100000) | 0);
    const s = aiChooseShot(run.ai, rng);
    const out = fireAt(run.mine, s.x, s.y);
    aiRegister(run.ai, s.x, s.y, out.result === 'hit', out.sunk ? out.sunk.cells : null);
    const { x, y } = mineGridToLogical(s.x, s.y);
    if (out.result === 'hit') {
      api.sfx.crumble(1);
      api.shake.add(0.35);
      api.particles.spawn(x + MCELL / 2, y + MCELL / 2, {
        count: 18, colors: ['#f97316', '#ef4444', '#fbbf24', '#78350f'],
        speed: [80, 260], gravity: 300, life: [0.4, 0.9], size: [2.5, 6], shape: 'rect', rotation: true,
      });
      if (out.sunk) {
        run.ownLeft -= 1;
        api.sfx.fail();
        api.shake.add(0.4);
        flash(run, `${out.sunk.def.name} KITA tenggelam!`);
        api.scores.add(LW / 2, 470, `-${out.sunk.def.name}`, { color: '#f87171', size: 16 });
      }
      if (allSunk(run.mine)) return endGame('kalah');
    } else {
      api.sfx.thud(0.25);
    }
    run.aiTimer = -1;
    pushHud(run);
  };

  const doFireAt = (gx: number, gy: number): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.over || run.aiTimer >= 0) return;
    const out = fireAt(run.enemy, gx, gy);
    if (out.result === 'repeat') return;
    api.sfx.ensure();
    run.shots += 1;
    const { x, y } = gridToLogical(gx, gy);
    if (out.result === 'hit') {
      run.hits += 1;
      api.sfx.crumble(1.1);
      api.shake.add(0.3);
      api.particles.spawn(x + CELL / 2, y + CELL / 2, {
        count: 20, colors: ['#f97316', '#ef4444', '#fbbf24', '#fff'],
        speed: [90, 280], gravity: 320, life: [0.4, 0.9], size: [2.5, 6], shape: 'rect', rotation: true,
      });
      if (out.sunk) {
        run.enemyLeft -= 1;
        run.sunkFlash = 1.2;
        api.sfx.chime(3);
        api.shake.add(0.4);
        api.scores.add(x + CELL / 2, y - 6, 'TENGGELAM!', { color: '#4ade80', size: 16 });
        flash(run, `${out.sunk.def.name} musuh TENGGELAM!`);
      } else {
        api.scores.add(x + CELL / 2, y - 4, 'KENA!', { color: '#fdba74', size: 14 });
      }
      if (allSunk(run.enemy)) return endGame('menang');
    } else {
      api.sfx.thud(0.4);
      api.particles.spawn(x + CELL / 2, y + CELL / 2, {
        count: 10, colors: ['#93c5fd', '#dbeafe', '#fff'],
        speed: [50, 160], gravity: 260, life: [0.3, 0.7], size: [2, 5], shape: 'circle',
      });
    }
    run.aiTimer = 0.55; // lawan balas
    pushHud(run);
  };

  const endGame = (who: 'menang' | 'kalah'): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run) return;
    run.over = who;
    if (who === 'menang') {
      const prev = getJson<number>(shotsKey, 0);
      run.newBest = prev === 0 || run.shots < prev;
      if (run.newBest) setJson(shotsKey, run.shots);
      api.sfx.chime(5);
      for (let k = 0; k < 3; k += 1) {
        api.particles.spawn(60 + k * 135, 160, {
          count: 26, colors: ['#ffd166', '#4ade80', '#7dd3fc', '#fff'],
          speed: [80, 300], gravity: 420, life: [0.8, 1.6], size: [3, 7], shape: 'rect', rotation: true,
        });
      }
    } else {
      api.sfx.fail();
    }
    pushHud(run);
    window.setTimeout(() => setScreen('over'), 1100);
  };

  // ---------- grid geometry ----------
  const gridToLogical = (gx: number, gy: number): { x: number; y: number } => {
    const pad = 16;
    const gw = LW - pad * 2;
    const cell = gw / SIZE;
    return { x: pad + gx * cell, y: GRID_Y + gy * cell };
  };
  const mineGridToLogical = (gx: number, gy: number): { x: number; y: number } => {
    const cell = MGW / SIZE;
    return { x: (LW - MGW) / 2 + gx * cell, y: MINE_Y + gy * cell };
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);

    const toLogical = (px: number, py: number): { x: number; y: number } => {
      const s = api.W / LW;
      return { x: px / s, y: py / s };
    };
    const cellFromLogical = (lp: { x: number; y: number }): { gx: number; gy: number } => ({
      gx: Math.floor((lp.x - 16) / CELL),
      gy: Math.floor((lp.y - GRID_Y) / CELL),
    });

    api.input.onDown = (p) => {
      api.sfx.ensure();
      const run = runRef.current;
      const lp = toLogical(p.x, p.y);
      const scr = screenRef.current;
      if (!run || (scr !== 'place' && scr !== 'play')) return;
      const { gx, gy } = cellFromLogical(lp);
      run.hoverGx = gx;
      run.hoverGy = gy;
      if (gx >= 0 && gx < SIZE && gy >= 0 && gy < SIZE) {
        if (scr === 'place') doPlaceAt(gx, gy);
        else doFireAt(gx, gy);
      }
    };

    // Pratinjau penempatan mengikuti penunjuk (perbaikan bug ghost di origin).
    api.input.onMove = (p) => {
      const run = runRef.current;
      const scr = screenRef.current;
      if (!run || (scr !== 'place' && scr !== 'play')) return;
      const { gx, gy } = cellFromLogical(toLogical(p.x, p.y));
      run.hoverGx = gx;
      run.hoverGy = gy;
    };

    api.setUpdate((dt) => {
      const run = runRef.current;
      if (!run) return;
      if (run.msgT > 0) run.msgT -= dt;
      run.sunkFlash = Math.max(0, run.sunkFlash - dt);
      if (screenRef.current === 'play' && run.aiTimer >= 0 && !run.over) {
        run.aiTimer -= dt;
        if (run.aiTimer < 0) aiTurn();
      }
    });

    api.setRender(() => {
      const run = runRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = performance.now() / 1000;
      ctx.save();
      ctx.scale(s, s);
      drawSite(ctx, t, lh, api.reducedMotion);
      if (run) {
        const scr = screenRef.current;
        if (scr === 'place') drawPlace(ctx, run, t);
        else if (scr === 'play' || scr === 'pause' || scr === 'over') drawBattle(ctx, run, t, api.reducedMotion);
        if (run.msgT > 0 && run.msg) drawFlashMsg(ctx, run.msg, Math.min(1, run.msgT));
      }
      ctx.restore();
    });

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__battleship = {
        get screen() { return screenRef.current; },
        get shots() { return runRef.current?.shots ?? 0; },
        get placed() { return runRef.current?.mine.ships.length ?? 0; },
        get over() { return runRef.current?.over ?? null; },
        get enemyLeft() { return runRef.current?.enemyLeft ?? 5; },
        start() { startPlace(); },
        autoPlace() {
          const run = runRef.current;
          if (run) {
            placeFleetRandom(run.mine, mulberry32(99));
            placeFleetRandom(run.enemy, mulberry32(1001));
            run.selShip = 0; pushHud(run);
          }
        },
        battle() { setScreen('play'); },
        fire(gx: number, gy: number) { doFireAt(gx, gy); },
      };
    }
    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__battleship;
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
    sfx.ensure();
    setMuted(sfx.toggleMute());
  };

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };
  const run = runRef.current;
  const allPlaced = run ? run.mine.ships.length === FLEET.length : false;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0e1526', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
          LAWAN {hud.enemyLeft} : {hud.ownLeft} KAMU
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#7dd3fc', fontWeight: 800, fontSize: 13 }}>
          {hud.shots} tembakan
        </div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'ready' && (
        <Overlay>
          <VehicleIcon kind="crane" size={92} />
          <h2 style={titleStyle}>PERANG CRANE</h2>
          <p style={textStyle}>Taruh 5 alat berat di lahanmu, lalu bombardir markas kontraktor lawan sampai semua armadanya tenggelam. Dia balas tembak — jangan sampai markasmu duluan yang rata!</p>
          <button style={primaryBtn} onClick={startPlace}>Atur Armada</button>
        </Overlay>
      )}

      {screen === 'place' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6, padding: '10px 14px 16px', background: 'rgba(10,18,32,0.82)', backdropFilter: 'blur(4px)' }}>
          <FleetPalette
            run={run}
            onSelect={(i) => { if (runRef.current) { runRef.current.selShip = i; sfx.ensure(); sfx.click(); } }}
            onRotate={() => { if (runRef.current) { runRef.current.horiz = !runRef.current.horiz; sfx.ensure(); sfx.click(); } }}
            onRandom={() => {
              const r = runRef.current;
              if (r) { placeFleetRandom(r.mine, mulberry32((Date.now() % 100000) | 0)); pushHud(r); sfx.ensure(); sfx.pop(1); }
            }}
            onReset={() => {
              const r = runRef.current;
              if (r) { r.mine.ships = []; r.selShip = 0; pushHud(r); sfx.ensure(); sfx.click(); }
            }}
            onReady={() => {
              const r = runRef.current;
              if (allPlaced && r) {
                placeFleetRandom(r.enemy, mulberry32((Date.now() % 100000) | 0));
                flash(r, 'Serang markas lawan! Ketuk petaknya!');
                setScreen('play');
                sfx.ensure(); sfx.whoosh();
                pushHud(r);
              }
            }}
          />
        </div>
      )}

      {screen === 'pause' && (
        <Overlay>
          <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="10" y="7" width="7" height="26" rx="2" fill="#fff" />
            <rect x="23" y="7" width="7" height="26" rx="2" fill="#fff" />
          </svg>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Armada berhenti sejenak. Lawan juga ikut nunggu kok.</p>
          <button style={primaryBtn} onClick={doResume}>Lanjut Perang</button>
        </Overlay>
      )}

      {screen === 'over' && run && (
        <Overlay>
          <svg width="52" height="52" viewBox="0 0 48 48" aria-hidden="true">
            {run.over === 'menang'
              ? <polygon points="24,3 29.5,16.5 44,17.5 32.5,26.5 36.5,41 24,33.5 11.5,41 15.5,26.5 4,17.5 18.5,16.5" fill="#fbbf24" stroke="#b45309" strokeWidth="1.5" />
              : <polygon points="24,2 28,12 38,6 34,16 44,18 36,24 44,30 34,32 38,42 28,36 24,46 20,36 10,42 14,32 4,30 12,24 4,18 14,16 10,6 20,12" fill="#f97316" stroke="#7c2d12" strokeWidth="1.5" />}
          </svg>
          <h2 style={titleStyle}>{run.over === 'menang' ? 'MARKAS LAWAN RATA!' : 'MARKASMU RATA!'}</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            {run.over === 'menang'
              ? `Menang dalam ${run.shots} tembakan (${run.hits} kena).`
              : 'Kontraktor lawan lebih garang. Coba strategi baru!'}
            {run.newBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={startPlace}>Main Lagi</button>
            <button style={secondaryBtn} onClick={() => setScreen('ready')}>Menu</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ---------- geometry consts (dibaca di canvas & handler) ----------
const GRID_Y = 150;
const CELL = (390 - 32) / 10;
const MGW = 150;
const MINE_Y = 560;
const MCELL = MGW / 10;

// ---------- palet & gambar vektor prosedural ----------

interface Palette { body: string; dark: string; accent: string; glass: string }

const KIND_PALETTE: Record<ShipKind, Palette> = {
  crane: { body: '#f59e0b', dark: '#b45309', accent: '#fde68a', glass: '#7dd3fc' },
  bulldozer: { body: '#f97316', dark: '#9a3412', accent: '#fdba74', glass: '#7dd3fc' },
  excavator: { body: '#eab308', dark: '#a16207', accent: '#fef08a', glass: '#7dd3fc' },
  molen: { body: '#38bdf8', dark: '#0369a1', accent: '#e0f2fe', glass: '#bae6fd' },
  pickup: { body: '#4ade80', dark: '#15803d', accent: '#bbf7d0', glass: '#7dd3fc' },
};
const WRECK_PALETTE: Palette = { body: '#4b5563', dark: '#2b303c', accent: '#6b7280', glass: '#1f2430' };
export const KIND_COLOR: Record<ShipKind, string> = {
  crane: '#f59e0b', bulldozer: '#f97316', excavator: '#eab308', molen: '#38bdf8', pickup: '#4ade80',
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.lineTo(x + w - q, y);
  ctx.arcTo(x + w, y, x + w, y + q, q);
  ctx.lineTo(x + w, y + h - q);
  ctx.arcTo(x + w, y + h, x + w - q, y + h, q);
  ctx.lineTo(x + q, y + h);
  ctx.arcTo(x, y + h, x, y + h - q, q);
  ctx.lineTo(x, y + q);
  ctx.arcTo(x, y, x + q, y, q);
  ctx.closePath();
}

function wheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: Palette): void {
  ctx.fillStyle = p.dark;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.fillStyle = p.accent;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, TAU); ctx.fill();
}

function track(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Palette): void {
  ctx.fillStyle = p.dark;
  rr(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = p.accent;
  const n = Math.max(2, Math.round(w / (h * 1.1)));
  for (let i = 0; i < n; i += 1) {
    ctx.beginPath();
    ctx.arc(x + (i + 0.5) * (w / n), y + h / 2, h * 0.26, 0, TAU);
    ctx.fill();
  }
}

/** Siluet alat berat digambar di ruang lokal L (panjang) x T (tebal), depan = +x. */
function drawVehicleShape(ctx: CanvasRenderingContext2D, kind: ShipKind, L: number, T: number, p: Palette): void {
  ctx.lineJoin = 'round';
  if (kind === 'crane') {
    // pondasi + menara kisi
    ctx.fillStyle = p.dark;
    rr(ctx, L * 0.03, T * 0.8, L * 0.2, T * 0.16, 2); ctx.fill();
    ctx.fillStyle = p.body;
    rr(ctx, L * 0.08, T * 0.1, L * 0.08, T * 0.72, 2); ctx.fill();
    ctx.strokeStyle = p.dark; ctx.lineWidth = Math.max(1.2, T * 0.045);
    ctx.beginPath();
    ctx.moveTo(L * 0.08, T * 0.78); ctx.lineTo(L * 0.16, T * 0.16);
    ctx.moveTo(L * 0.16, T * 0.78); ctx.lineTo(L * 0.08, T * 0.16);
    ctx.stroke();
    // pemberat belakang + jib panjang + tali pengikat
    ctx.fillStyle = p.dark;
    rr(ctx, 0, T * 0.12, L * 0.06, T * 0.3, 2); ctx.fill();
    ctx.fillStyle = p.body;
    rr(ctx, L * 0.05, T * 0.04, L * 0.93, T * 0.11, 2); ctx.fill();
    ctx.strokeStyle = p.accent; ctx.lineWidth = Math.max(1, T * 0.035);
    ctx.beginPath();
    ctx.moveTo(L * 0.12, T * 0.04); ctx.lineTo(L * 0.96, T * 0.1);
    ctx.moveTo(L * 0.12, T * 0.04); ctx.lineTo(L * 0.01, T * 0.14);
    ctx.stroke();
    // kabin operator
    ctx.fillStyle = p.glass;
    rr(ctx, L * 0.17, T * 0.2, L * 0.07, T * 0.2, 2); ctx.fill();
    // kabel kait + beban beton
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = Math.max(1, T * 0.03);
    ctx.beginPath(); ctx.moveTo(L * 0.8, T * 0.15); ctx.lineTo(L * 0.8, T * 0.52); ctx.stroke();
    ctx.fillStyle = p.accent;
    rr(ctx, L * 0.755, T * 0.52, L * 0.09, T * 0.2, 2); ctx.fill();
  } else if (kind === 'bulldozer') {
    track(ctx, L * 0.05, T * 0.6, L * 0.6, T * 0.32, p);
    ctx.fillStyle = p.body;
    rr(ctx, L * 0.09, T * 0.32, L * 0.5, T * 0.3, 3); ctx.fill();
    // kabin + kaca + cerobong
    rr(ctx, L * 0.3, T * 0.04, L * 0.22, T * 0.3, 3); ctx.fill();
    ctx.fillStyle = p.glass;
    rr(ctx, L * 0.335, T * 0.09, L * 0.15, T * 0.18, 2); ctx.fill();
    ctx.fillStyle = p.dark;
    rr(ctx, L * 0.13, T * 0.12, L * 0.035, T * 0.2, 1); ctx.fill();
    // lengan + bilah pendorong di depan
    ctx.strokeStyle = p.body; ctx.lineWidth = T * 0.09;
    ctx.beginPath(); ctx.moveTo(L * 0.58, T * 0.5); ctx.lineTo(L * 0.85, T * 0.62); ctx.stroke();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(L * 0.86, T * 0.26); ctx.lineTo(L * 0.99, T * 0.4);
    ctx.lineTo(L * 0.99, T * 0.92); ctx.lineTo(L * 0.86, T * 0.78);
    ctx.closePath(); ctx.fill();
  } else if (kind === 'excavator') {
    track(ctx, L * 0.03, T * 0.64, L * 0.44, T * 0.28, p);
    ctx.fillStyle = p.body;
    rr(ctx, L * 0.05, T * 0.48, L * 0.4, T * 0.18, 3); ctx.fill();
    // kabin putar
    rr(ctx, L * 0.06, T * 0.18, L * 0.17, T * 0.32, 3); ctx.fill();
    ctx.fillStyle = p.glass;
    rr(ctx, L * 0.085, T * 0.23, L * 0.11, T * 0.2, 2); ctx.fill();
    ctx.fillStyle = p.dark;
    rr(ctx, L * 0.26, T * 0.3, L * 0.16, T * 0.2, 2); ctx.fill();
    // boom + stick + bucket
    ctx.strokeStyle = p.body; ctx.lineWidth = T * 0.15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L * 0.4, T * 0.5); ctx.lineTo(L * 0.66, T * 0.1); ctx.stroke();
    ctx.strokeStyle = p.dark; ctx.lineWidth = T * 0.1;
    ctx.beginPath(); ctx.moveTo(L * 0.66, T * 0.1); ctx.lineTo(L * 0.85, T * 0.48); ctx.stroke();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(L * 0.83, T * 0.44); ctx.lineTo(L * 0.99, T * 0.56);
    ctx.lineTo(L * 0.93, T * 0.78); ctx.lineTo(L * 0.79, T * 0.6);
    ctx.closePath(); ctx.fill();
  } else if (kind === 'molen') {
    // sasis + roda
    ctx.fillStyle = p.dark;
    rr(ctx, L * 0.03, T * 0.64, L * 0.94, T * 0.1, 2); ctx.fill();
    wheel(ctx, L * 0.2, T * 0.8, T * 0.13, p);
    wheel(ctx, L * 0.62, T * 0.8, T * 0.13, p);
    wheel(ctx, L * 0.88, T * 0.8, T * 0.13, p);
    // drum putar miring + garis pita
    ctx.save();
    ctx.translate(L * 0.37, T * 0.4);
    ctx.rotate(-0.28);
    ctx.fillStyle = p.body;
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.27, T * 0.31, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = p.dark; ctx.lineWidth = T * 0.06;
    ctx.beginPath(); ctx.moveTo(-L * 0.2, -T * 0.2); ctx.lineTo(L * 0.2, T * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-L * 0.2, T * 0.2); ctx.lineTo(L * 0.2, -T * 0.2); ctx.stroke();
    ctx.strokeStyle = p.accent; ctx.lineWidth = T * 0.07;
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.27, T * 0.31, 0, -0.5, 0.5); ctx.stroke();
    ctx.restore();
    // corong belakang + kabin depan
    ctx.fillStyle = p.dark;
    ctx.beginPath();
    ctx.moveTo(L * 0.02, T * 0.2); ctx.lineTo(L * 0.13, T * 0.3);
    ctx.lineTo(L * 0.13, T * 0.48); ctx.lineTo(L * 0.02, T * 0.44);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.body;
    rr(ctx, L * 0.74, T * 0.28, L * 0.23, T * 0.38, 3); ctx.fill();
    ctx.fillStyle = p.glass;
    rr(ctx, L * 0.83, T * 0.33, L * 0.11, T * 0.2, 2); ctx.fill();
  } else {
    // pickup
    ctx.fillStyle = p.body;
    rr(ctx, L * 0.03, T * 0.42, L * 0.94, T * 0.32, 4); ctx.fill();
    // bak terbuka
    ctx.strokeStyle = p.dark; ctx.lineWidth = T * 0.05;
    ctx.beginPath();
    ctx.moveTo(L * 0.06, T * 0.42); ctx.lineTo(L * 0.4, T * 0.42);
    ctx.moveTo(L * 0.12, T * 0.42); ctx.lineTo(L * 0.12, T * 0.56);
    ctx.moveTo(L * 0.34, T * 0.42); ctx.lineTo(L * 0.34, T * 0.56);
    ctx.stroke();
    // kabin + kaca
    ctx.fillStyle = p.body;
    ctx.beginPath();
    ctx.moveTo(L * 0.44, T * 0.44); ctx.lineTo(L * 0.52, T * 0.14);
    ctx.lineTo(L * 0.66, T * 0.14); ctx.lineTo(L * 0.74, T * 0.44);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.glass;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, T * 0.4); ctx.lineTo(L * 0.55, T * 0.2);
    ctx.lineTo(L * 0.64, T * 0.2); ctx.lineTo(L * 0.69, T * 0.4);
    ctx.closePath(); ctx.fill();
    // roda + lampu
    wheel(ctx, L * 0.22, T * 0.76, T * 0.15, p);
    wheel(ctx, L * 0.8, T * 0.76, T * 0.15, p);
    ctx.fillStyle = p.accent;
    ctx.beginPath(); ctx.arc(L * 0.955, T * 0.52, T * 0.05, 0, TAU); ctx.fill();
  }
}

/** Kotak pixel kapal dari sel-selnya (orientasi sadar dari data sel aktual). */
function shipBBox(ship: Placed, originX: number, originY: number, cell: number): { x: number; y: number; w: number; h: number; horiz: boolean } {
  const xs = ship.cells.map((c) => c.x);
  const ys = ship.cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: originX + minX * cell,
    y: originY + minY * cell,
    w: (Math.max(...xs) - minX + 1) * cell,
    h: (Math.max(...ys) - minY + 1) * cell,
    horiz: Math.max(...ys) - minY === 0,
  };
}

/** Gambar satu alat berat utuh melintasi seluruh selnya; wreck = bangkai berasap. */
function drawVehicle(
  ctx: CanvasRenderingContext2D, ship: Placed,
  originX: number, originY: number, cell: number,
  wreck: boolean, t: number, rm: boolean,
): void {
  const b = shipBBox(ship, originX, originY, cell);
  const L = Math.max(b.w, b.h);
  const T = Math.min(b.w, b.h);
  const p = wreck ? WRECK_PALETTE : KIND_PALETTE[ship.def.kind];
  ctx.save();
  if (wreck) ctx.globalAlpha = 0.92;
  // bayangan tanah
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.86, b.w * 0.46, b.h * 0.16, 0, 0, TAU);
  ctx.fill();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  if (!b.horiz) ctx.rotate(Math.PI / 2);
  ctx.translate(-L / 2, -T / 2);
  // inset tipis agar siluet tidak menempel garis petak
  ctx.translate(L * 0.015, T * 0.06);
  drawVehicleShape(ctx, ship.def.kind, L * 0.97, T * 0.88, p);
  ctx.restore();
  if (wreck) drawSmoke(ctx, b.x + b.w / 2, b.y + b.h * 0.2, T, t, rm);
}

/** Ledakan prosedural: kawah gelap + bintang percikan berlapis + inti menyala. */
function drawExplosion(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, rm: boolean): void {
  ctx.fillStyle = '#170b06';
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.02, 0, TAU); ctx.fill();
  const pulse = rm ? 1 : 1 + 0.08 * Math.sin(t * 6 + cx * 0.7);
  const spikes = 8;
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
  g.addColorStop(0, '#fde68a');
  g.addColorStop(0.55, '#f97316');
  g.addColorStop(1, '#b91c1c');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const ang = (i / (spikes * 2)) * TAU + 0.2;
    const rad = (i % 2 === 0 ? r : r * 0.55) * pulse;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.3 * pulse, 0, TAU); ctx.fill();
}

/** Meleset: riak air berlapis (cincin konsentris + titik pusat). */
function drawRipple(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, rm: boolean): void {
  const phase = rm ? 0 : (t * 0.7 + (cx + cy) * 0.01) % 1;
  ctx.strokeStyle = '#7dd3fc';
  for (let i = 0; i < 2; i += 1) {
    const rad = r * (0.42 + i * 0.3 + phase * 0.12);
    ctx.globalAlpha = 0.9 - i * 0.35 - phase * 0.2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#bae6fd';
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.6, r * 0.12), 0, TAU); ctx.fill();
}

/** Asap prosedural untuk kapal rusak/tenggelam: gumpalan abu berlapis melayang. */
function drawSmoke(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, t: number, rm: boolean): void {
  for (let i = 0; i < 3; i += 1) {
    const drift = rm ? 0 : Math.sin(t * 1.2 + i * 2.1) * cell * 0.12;
    const px = cx + drift + (i - 1) * cell * 0.22;
    const py = cy - i * cell * 0.3;
    const rad = cell * (0.2 + i * 0.09);
    ctx.fillStyle = `rgba(148,163,184,${0.4 - i * 0.09})`;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.fill();
  }
}

/** Dasar petak lahan: tanah bergradasi + sorot atas + bintik tekstur. */
function drawCellBase(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
  const g = ctx.createLinearGradient(x, y, x, y + c);
  g.addColorStop(0, '#3b2f23');
  g.addColorStop(1, '#2a211a');
  ctx.fillStyle = g;
  ctx.fillRect(x + 0.5, y + 0.5, c - 1, c - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(x + 0.5, y + 0.5, c - 1, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + c * 0.22, y + c * 0.62, 2, 2);
  ctx.fillRect(x + c * 0.68, y + c * 0.3, 2, 2);
}

function drawSite(ctx: CanvasRenderingContext2D, t: number, lh: number, rm: boolean): void {
  const g = ctx.createLinearGradient(0, 0, 0, lh);
  g.addColorStop(0, '#1b2745');
  g.addColorStop(0.55, '#141c33');
  g.addColorStop(1, '#0b1122');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 390, lh);
  // blueprint grid
  ctx.strokeStyle = 'rgba(120,160,220,0.08)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < 390; gx += 26) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, lh); ctx.stroke();
  }
  for (let gy = 0; gy < lh; gy += 26) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(390, gy); ctx.stroke();
  }
  // siluet tower crane jauh
  ctx.save();
  ctx.strokeStyle = 'rgba(90,120,180,0.25)';
  ctx.lineWidth = 4;
  const sway = rm ? 0 : Math.sin(t * 0.8) * 3;
  ctx.beginPath();
  ctx.moveTo(360, lh); ctx.lineTo(360, 60);
  ctx.moveTo(300, 78 + sway * 0.3); ctx.lineTo(400, 70 - sway * 0.3);
  ctx.moveTo(360, 60); ctx.lineTo(340, 78); ctx.lineTo(380, 78);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,120,180,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(395, 70); ctx.lineTo(395, 120 + sway); ctx.stroke();
  ctx.fillStyle = 'rgba(90,120,180,0.22)';
  ctx.fillRect(390, 118 + sway, 10, 8);
  ctx.restore();
}

function drawPlace(ctx: CanvasRenderingContext2D, run: Run, t: number): void {
  const def = FLEET[run.selShip];
  const placed = run.mine.ships.some((s) => s.def === def);
  ctx.fillStyle = '#fff';
  ctx.font = `900 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('TARUH ARMADAMU DI LAHAN', 195, 118);
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(placed ? 'Alat ini sudah ditaruh' : `${def.name} (${def.size} petak) — arahkan penunjuk, ketuk untuk menaruh`, 195, 138);
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      const x = 16 + gx * CELL;
      const y = GRID_Y + gy * CELL;
      drawCellBase(ctx, x, y, CELL);
      if (shipAt(run.mine, gx, gy)) {
        ctx.fillStyle = 'rgba(59,130,246,0.35)';
        ctx.fillRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
    }
  }
  // armada yang sudah ditaruh: siluet vektor per jenis, orientasi dari sel aktual
  for (const s of run.mine.ships) drawVehicle(ctx, s, 16, GRID_Y, CELL, false, t, true);
  // pratinjau ghost: mengikuti sel bidik, validitas dihitung DI jangkar itu
  if (!placed && run.hoverGx >= 0 && run.hoverGy >= 0) {
    const cells = placementCells(def, run.hoverGx, run.hoverGy, run.horiz);
    const valid = canPlace(run.mine, def, run.hoverGx, run.hoverGy, run.horiz);
    for (const c of cells) {
      if (c.x < 0 || c.y < 0 || c.x >= SIZE || c.y >= SIZE) continue;
      ctx.fillStyle = valid ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)';
      ctx.fillRect(16 + c.x * CELL + 0.5, GRID_Y + c.y * CELL + 0.5, CELL - 1, CELL - 1);
    }
    const inBounds = cells.filter((c) => c.x >= 0 && c.y >= 0 && c.x < SIZE && c.y < SIZE);
    if (inBounds.length > 0) {
      const xs = inBounds.map((c) => c.x);
      const ys = inBounds.map((c) => c.y);
      ctx.strokeStyle = valid ? '#4ade80' : '#f87171';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(
        16 + Math.min(...xs) * CELL + 1, GRID_Y + Math.min(...ys) * CELL + 1,
        (Math.max(...xs) - Math.min(...xs) + 1) * CELL - 2,
        (Math.max(...ys) - Math.min(...ys) + 1) * CELL - 2,
      );
      ctx.setLineDash([]);
    }
  }
}

function drawBattle(ctx: CanvasRenderingContext2D, run: Run, t: number, rm: boolean): void {
  // grid musuh (target)
  ctx.fillStyle = '#fff';
  ctx.font = `900 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('MARKAS LAWAN — ketuk untuk menembak', 195, 118);
  const sunkSet = new Set<string>();
  for (const s of run.enemy.ships) {
    const all = s.cells.every((c) => run.enemy.shots.get(key(c.x, c.y)) === 'hit');
    if (all) for (const c of s.cells) sunkSet.add(key(c.x, c.y));
  }
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      drawCellBase(ctx, 16 + gx * CELL, GRID_Y + gy * CELL, CELL);
    }
  }
  // bangkai armada musuh yang tenggelam: siluet abu berasap di bawah penanda kena
  for (const s of run.enemy.ships) {
    if (s.cells.every((c) => sunkSet.has(key(c.x, c.y)))) {
      drawVehicle(ctx, s, 16, GRID_Y, CELL, true, t, rm);
    }
  }
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      const x = 16 + gx * CELL;
      const y = GRID_Y + gy * CELL;
      const shot = run.enemy.shots.get(key(gx, gy));
      if (shot === 'hit') {
        drawExplosion(ctx, x + CELL / 2, y + CELL / 2, CELL * (sunkSet.has(key(gx, gy)) ? 0.34 : 0.42), t, rm);
        if (sunkSet.has(key(gx, gy))) {
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, CELL / 2 - 1.5, 0, TAU); ctx.stroke();
        }
      } else if (shot === 'miss') {
        drawRipple(ctx, x + CELL / 2, y + CELL / 2, CELL * 0.42, t, rm);
      }
    }
  }
  // bidik penunjuk di papan lawan (sel belum ditembak)
  if (run.aiTimer < 0 && !run.over && run.hoverGx >= 0 && run.hoverGx < SIZE && run.hoverGy >= 0 && run.hoverGy < SIZE
    && !run.enemy.shots.has(key(run.hoverGx, run.hoverGy))) {
    const x = 16 + run.hoverGx * CELL;
    const y = GRID_Y + run.hoverGy * CELL;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    const m = 5;
    const len = 9;
    ctx.beginPath();
    ctx.moveTo(x + m, y + m + len); ctx.lineTo(x + m, y + m); ctx.lineTo(x + m + len, y + m);
    ctx.moveTo(x + CELL - m - len, y + m); ctx.lineTo(x + CELL - m, y + m); ctx.lineTo(x + CELL - m, y + m + len);
    ctx.moveTo(x + CELL - m, y + CELL - m - len); ctx.lineTo(x + CELL - m, y + CELL - m); ctx.lineTo(x + CELL - m - len, y + CELL - m);
    ctx.moveTo(x + m + len, y + CELL - m); ctx.lineTo(x + m, y + CELL - m); ctx.lineTo(x + m, y + CELL - m - len);
    ctx.stroke();
  }
  const gridBottom = GRID_Y + SIZE * CELL;
  // grid sendiri (mini): lambung mini per jenis + penanda prosedural
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText('MARKASMU', 195, MINE_Y - 10);
  const mineX = (390 - MGW) / 2;
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      const x = mineX + gx * MCELL;
      const y = MINE_Y + gy * MCELL;
      const g = ctx.createLinearGradient(x, y, x, y + MCELL);
      g.addColorStop(0, '#3b2f23');
      g.addColorStop(1, '#241c15');
      ctx.fillStyle = g;
      ctx.fillRect(x + 0.4, y + 0.4, MCELL - 0.8, MCELL - 0.8);
    }
  }
  for (const s of run.mine.ships) {
    const b = shipBBox(s, mineX, MINE_Y, MCELL);
    ctx.fillStyle = KIND_COLOR[s.def.kind];
    ctx.globalAlpha = 0.75;
    rr(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 3); ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      const x = mineX + gx * MCELL;
      const y = MINE_Y + gy * MCELL;
      const shot = run.mine.shots.get(key(gx, gy));
      if (shot === 'hit') drawExplosion(ctx, x + MCELL / 2, y + MCELL / 2, MCELL * 0.34, t, rm);
      else if (shot === 'miss') {
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x + MCELL / 2, y + MCELL / 2, MCELL * 0.26, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(x + MCELL / 2 - 1, y + MCELL / 2 - 1, 2, 2);
      }
    }
  }
  // giliran lawan: indikator
  if (run.aiTimer >= 0) {
    ctx.fillStyle = 'rgba(248,113,113,0.9)';
    ctx.font = `900 13px ${FONT}`;
    ctx.fillText('Lawan membidik...', 195, gridBottom + 16);
  }
}

function drawFlashMsg(ctx: CanvasRenderingContext2D, msg: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 15px ${FONT}`;
  ctx.textAlign = 'center';
  const w = ctx.measureText(msg).width + 36;
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(195 - w / 2, 478, w, 34, 17);
  else ctx.rect(195 - w / 2, 478, w, 34);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(msg, 195, 500);
  ctx.restore();
}

/** Ikon SVG garis sederhana per jenis alat berat (palet & layar sambutan). */
function VehicleIcon({ kind, size }: { kind: ShipKind; size: number }): React.JSX.Element {
  const color = KIND_COLOR[kind];
  const common: React.SVGProps<SVGSVGElement> = {
    width: size, height: size * 0.72, viewBox: '0 0 48 34',
    fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (kind === 'crane') {
    return (
      <svg {...common}>
        <path d="M11 30 V5 M5 8 H45 M11 5 L19 8 M36 8 V15" />
        <rect x="32" y="15" width="8" height="6" fill={color} stroke="none" />
        <path d="M6 30 H18" />
      </svg>
    );
  }
  if (kind === 'bulldozer') {
    return (
      <svg {...common}>
        <rect x="4" y="21" width="27" height="8" rx="4" />
        <path d="M9 21 v-7 h13 v7 M38 10 v18" />
      </svg>
    );
  }
  if (kind === 'excavator') {
    return (
      <svg {...common}>
        <rect x="3" y="23" width="21" height="7" rx="3.5" />
        <path d="M7 23 v-8 h9 v8 M22 16 L33 6 L41 16" />
      </svg>
    );
  }
  if (kind === 'molen') {
    return (
      <svg {...common}>
        <ellipse cx="17" cy="15" rx="11" ry="8" />
        <path d="M36 13 h7 v10 h-7 z M6 27 h38" />
        <circle cx="13" cy="28" r="2.6" /><circle cx="35" cy="28" r="2.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 22 H44 M8 22 v-5 h13 l5-6 h9 l5 6 v5" />
      <circle cx="13" cy="25" r="3" /><circle cx="35" cy="25" r="3" />
    </svg>
  );
}

function FleetPalette(props: {
  run: Run | null;
  onSelect: (i: number) => void;
  onRotate: () => void;
  onRandom: () => void;
  onReset: () => void;
  onReady: () => void;
}): React.JSX.Element {
  const { run } = props;
  if (!run) return <div />;
  const allPlaced = run.mine.ships.length === FLEET.length;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 }}>
        {FLEET.map((d, i) => {
          const done = run.mine.ships.some((s) => s.def === d);
          const sel = run.selShip === i && !done;
          return (
            <button
              key={d.name}
              onClick={() => props.onSelect(i)}
              style={{
                border: sel ? '2px solid #4ade80' : '1px solid rgba(255,255,255,0.2)',
                background: done ? 'rgba(74,222,128,0.18)' : sel ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.08)',
                color: '#fff', borderRadius: 10, padding: '6px 10px', fontSize: 12,
                fontWeight: 800, fontFamily: FONT, cursor: 'pointer', minHeight: 44, opacity: done ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <VehicleIcon kind={d.kind} size={26} />
              {d.name}{done ? ' · terpasang' : ''}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button style={smallBtn} onClick={props.onRotate}>Putar: {run.horiz ? 'Mendatar' : 'Tegak'}</button>
        <button style={smallBtn} onClick={props.onRandom}>Acak</button>
        <button style={smallBtn} onClick={props.onReset}>Reset</button>
        <button
          style={{ ...smallBtn, background: allPlaced ? 'linear-gradient(135deg,#f59e0b,#ea580c)' : 'rgba(255,255,255,0.08)', fontWeight: 900, opacity: allPlaced ? 1 : 0.5 }}
          onClick={props.onReady}
        >
          SERANG!
        </button>
      </div>
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 800,
  fontFamily: FONT, cursor: 'pointer', minHeight: 44,
};

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
