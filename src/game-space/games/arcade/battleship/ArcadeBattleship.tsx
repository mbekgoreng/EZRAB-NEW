/**
 * PERANG CRANE — Battleship reskin konstruksi.
 * Taruh armada alat berat di grid lahan 10x10, lalu bombardir markas AI SEDANG.
 * Hunt/target AI (paritas) — bisa dikalahkan dengan strategi.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, setJson, getJson } from '../../../engine2d/best';
import {
  SIZE, FLEET, emptyBoard, canPlace, placeShip, placeFleetRandom, fireAt, allSunk,
  shipAt, key, createAi, aiChooseShot, aiRegister, mulberry32,
  type Board, type AiMemory,
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
    selShip: 0, horiz: true, aiTimer: -1, msg: '', msgT: 0,
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
      flash(run, 'Mentok! Cari petak lain 🚧');
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
    if (run.mine.ships.length === FLEET.length) flash(run, 'Armada siap! Tekan ⚔️ SERANG!');
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
        flash(run, `☠️ ${out.sunk.def.name} KITA tenggelam!`);
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
        api.scores.add(x + CELL / 2, y - 6, `TENGGELAM! ${out.sunk.def.emoji}`, { color: '#4ade80', size: 16 });
        flash(run, `💥 ${out.sunk.def.name} musuh TENGGELAM!`);
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

    api.input.onDown = (p) => {
      api.sfx.ensure();
      const run = runRef.current;
      const lp = toLogical(p.x, p.y);
      const scr = screenRef.current;
      if (!run || (scr !== 'place' && scr !== 'play')) return;
      if (scr === 'place') {
        // grid taruh
        const gx = Math.floor((lp.x - 16) / CELL);
        const gy = Math.floor((lp.y - GRID_Y) / CELL);
        if (gx >= 0 && gx < SIZE && gy >= 0 && gy < SIZE) doPlaceAt(gx, gy);
      } else {
        const gx = Math.floor((lp.x - 16) / CELL);
        const gy = Math.floor((lp.y - GRID_Y) / CELL);
        if (gx >= 0 && gx < SIZE && gy >= 0 && gy < SIZE) doFireAt(gx, gy);
      }
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
          ⚔️ {hud.enemyLeft} vs {hud.ownLeft} ⚓
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#7dd3fc', fontWeight: 800, fontSize: 13 }}>
          🎯 {hud.shots} tembakan
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
          <div style={{ fontSize: 44 }}>🏗️⚔️</div>
          <h2 style={titleStyle}>PERANG CRANE</h2>
          <p style={textStyle}>Taruh 5 alat berat di lahanmu, lalu bombardir markas kontraktor lawan sampai semua armadanya tenggelam. Dia balas tembak — jangan sampai markasmu duluan yang rata!</p>
          <button style={primaryBtn} onClick={startPlace}>Atur Armada 🛠️</button>
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
              if (r) { placeFleetRandom(r.mine, mulberry32((Date.now() % 100000) | 0)); sfx.ensure(); sfx.pop(1); }
            }}
            onReset={() => {
              const r = runRef.current;
              if (r) { r.mine.ships = []; r.selShip = 0; sfx.ensure(); sfx.click(); }
            }}
            onReady={() => {
              const r = runRef.current;
              if (allPlaced && r) {
                placeFleetRandom(r.enemy, mulberry32((Date.now() % 100000) | 0));
                flash(r, '⚔️ Serang markas lawan! Ketuk petaknya!');
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
          <div style={{ fontSize: 40 }}>⏸</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Armada berhenti sejenak. Lawan juga ikut nunggu kok.</p>
          <button style={primaryBtn} onClick={doResume}>Lanjut Perang</button>
        </Overlay>
      )}

      {screen === 'over' && run && (
        <Overlay>
          <div style={{ fontSize: 44 }}>{run.over === 'menang' ? '🏆' : '💥'}</div>
          <h2 style={titleStyle}>{run.over === 'menang' ? 'MARKAS LAWAN RATA!' : 'MARKASMU RATA!'}</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            {run.over === 'menang'
              ? `Menang dalam ${run.shots} tembakan (${run.hits} kena).`
              : 'Kontraktor lawan lebih garang. Coba strategi baru!'}
            {run.newBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={startPlace}>Main Lagi 🔁</button>
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

function drawCell(
  ctx: CanvasRenderingContext2D, x: number, y: number, c: number,
  state: 'empty' | 'miss' | 'hit' | 'sunkHit' | 'ship' | 'ghost', t: number, rm: boolean,
): void {
  // petak lahan: tanah berlapis
  const g = ctx.createLinearGradient(x, y, x, y + c);
  g.addColorStop(0, '#3b2f23');
  g.addColorStop(1, '#2a211a');
  ctx.fillStyle = g;
  ctx.fillRect(x + 0.5, y + 0.5, c - 1, c - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(x + 0.5, y + 0.5, c - 1, 3);
  if (state === 'ghost') {
    ctx.fillStyle = 'rgba(74,222,128,0.35)';
    ctx.fillRect(x + 0.5, y + 0.5, c - 1, c - 1);
  } else if (state === 'ship') {
    ctx.fillStyle = 'rgba(59,130,246,0.5)';
    ctx.fillRect(x + 0.5, y + 0.5, c - 1, c - 1);
  } else if (state === 'miss') {
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    const m = c * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + m, y + m); ctx.lineTo(x + c - m, y + c - m);
    ctx.moveTo(x + c - m, y + m); ctx.lineTo(x + m, y + c - m);
    ctx.stroke();
  } else if (state === 'hit' || state === 'sunkHit') {
    // kawah ledakan berlapis
    const pulse = rm ? 1 : 1 + 0.1 * Math.sin(t * 6 + x);
    const r = (c / 2 - 3) * pulse;
    const cx = x + c / 2, cy = y + c / 2;
    ctx.fillStyle = '#0f0a06';
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, TAU); ctx.fill();
    const eg = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    eg.addColorStop(0, '#fde68a');
    eg.addColorStop(0.5, '#f97316');
    eg.addColorStop(1, '#7c2d12');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    if (state === 'sunkHit') {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, c / 2 - 1.5, 0, TAU); ctx.stroke();
    }
  }
}

function drawPlace(ctx: CanvasRenderingContext2D, run: { mine: Board; selShip: number; horiz: boolean }, t: number): void {
  const def = FLEET[run.selShip];
  const placed = run.mine.ships.some((s) => s.def === def);
  ctx.fillStyle = '#fff';
  ctx.font = `900 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('📍 TARUH ARMADAMU DI LAHAN', 195, 118);
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(placed ? 'Kapal ini sudah ditaruh' : `${def.emoji} ${def.name} (${def.size} petak) — ketuk lahan`, 195, 138);
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      const x = 16 + gx * CELL;
      const y = GRID_Y + gy * CELL;
      const ship = shipAt(run.mine, gx, gy);
      drawCell(ctx, x, y, CELL, ship ? 'ship' : 'empty', t, true);
    }
  }
  // gambar emoji kapal yg sudah ditaruh
  for (const s of run.mine.ships) {
    const cx = 16 + (s.cells[0].x + (s.cells.length / 2)) * CELL;
    const cy = GRID_Y + s.cells[0].y * CELL + CELL / 2;
    ctx.fillStyle = '#ffffff'; // reset alpha: emoji harus opaque
    ctx.font = `${Math.round(CELL * 0.9)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.def.emoji, cx, cy + 1);
  }
  // ghost preview kapal terpilih
  if (!placed) {
    for (let i = 0; i < def.size; i += 1) {
      const gx = 0 + (run.horiz ? i : 0);
      const gy = 0 + (run.horiz ? 0 : i);
      if (gx < SIZE && gy < SIZE && !shipAt(run.mine, gx, gy)) {
        ctx.fillStyle = canPlace(run.mine, def, 0, 0, run.horiz) ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)';
        ctx.fillRect(16 + gx * CELL + 0.5, GRID_Y + gy * CELL + 0.5, CELL - 1, CELL - 1);
      }
    }
  }
}

function drawBattle(ctx: CanvasRenderingContext2D, run: Run, t: number, rm: boolean): void {
  // grid musuh (target)
  ctx.fillStyle = '#fff';
  ctx.font = `900 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('🎯 MARKAS LAWAN — ketuk untuk menembak', 195, 118);
  const sunkSet = new Set<string>();
  for (const s of run.enemy.ships) {
    const all = s.cells.every((c) => run.enemy.shots.get(key(c.x, c.y)) === 'hit');
    if (all) for (const c of s.cells) sunkSet.add(key(c.x, c.y));
  }
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      const x = 16 + gx * CELL;
      const y = GRID_Y + gy * CELL;
      const shot = run.enemy.shots.get(key(gx, gy));
      const st = shot === 'hit' ? (sunkSet.has(key(gx, gy)) ? 'sunkHit' : 'hit')
        : shot === 'miss' ? 'miss' : 'empty';
      drawCell(ctx, x, y, CELL, st, t, rm);
      if (sunkSet.has(key(gx, gy))) {
        const ship = shipAt(run.enemy, gx, gy);
        if (ship && gx === ship.cells[0].x && gy === ship.cells[0].y) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `${Math.round(CELL * 1.6)}px system-ui`;
          ctx.fillText(ship.def.emoji, x + CELL / 2, y + CELL / 2 + 2);
        }
      }
    }
  }
  const gridBottom = GRID_Y + SIZE * CELL;
  // grid sendiri (mini)
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText('🛡️ MARKASMU', 195, MINE_Y - 10);
  for (let gy = 0; gy < SIZE; gy += 1) {
    for (let gx = 0; gx < SIZE; gx += 1) {
      const x = (390 - MGW) / 2 + gx * MCELL;
      const y = MINE_Y + gy * MCELL;
      const shot = run.mine.shots.get(key(gx, gy));
      const ship = shipAt(run.mine, gx, gy);
      const st = shot === 'hit' ? 'hit' : shot === 'miss' ? 'miss' : ship ? 'ship' : 'empty';
      const g = ctx.createLinearGradient(x, y, x, y + MCELL);
      g.addColorStop(0, '#3b2f23');
      g.addColorStop(1, '#241c15');
      ctx.fillStyle = g;
      ctx.fillRect(x + 0.4, y + 0.4, MCELL - 0.8, MCELL - 0.8);
      if (st === 'ship') { ctx.fillStyle = 'rgba(59,130,246,0.55)'; ctx.fillRect(x + 0.4, y + 0.4, MCELL - 0.8, MCELL - 0.8); }
      else if (st === 'miss') { ctx.fillStyle = '#7dd3fc'; ctx.fillRect(x + MCELL / 2 - 1, y + MCELL / 2 - 1, 2, 2); }
      else if (st === 'hit') { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(x + MCELL / 2, y + MCELL / 2, MCELL / 3, 0, TAU); ctx.fill(); }
    }
  }
  // giliran lawan: indikator
  if (run.aiTimer >= 0) {
    ctx.fillStyle = 'rgba(248,113,113,0.9)';
    ctx.font = `900 13px ${FONT}`;
    ctx.fillText('⏳ Lawan membidik…', 195, gridBottom + 16);
  }
  void gridBottom;
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
                color: '#fff', borderRadius: 10, padding: '8px 10px', fontSize: 12,
                fontWeight: 800, fontFamily: FONT, cursor: 'pointer', minHeight: 44, opacity: done ? 0.6 : 1,
              }}
            >
              {d.emoji} {d.name}{done ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button style={smallBtn} onClick={props.onRotate}>↻ {run.horiz ? 'Mendatar' : 'Tegak'}</button>
        <button style={smallBtn} onClick={props.onRandom}>🎲 Acak</button>
        <button style={smallBtn} onClick={props.onReset}>🧹 Reset</button>
        <button
          style={{ ...smallBtn, background: allPlaced ? 'linear-gradient(135deg,#f59e0b,#ea580c)' : 'rgba(255,255,255,0.08)', fontWeight: 900, opacity: allPlaced ? 1 : 0.5 }}
          onClick={props.onReady}
        >
          ⚔️ SERANG!
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
