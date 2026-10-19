/**
 * TUKANG NYEBRANG — Frogger reskin konstruksi.
 * Tukang 👷 menyeberangi jalan proyek (awas kelindas!) & sungai (naik balok kayu 🪵)
 * menuju 5 rumah. 3 nyawa, 60 detik per nyawa.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, setJson, getJson } from '../../../engine2d/best';
import {
  COLS, ROWS, HOME_COLS, ATTEMPT_TIME, createGame, move, update, obstacleCells,
  homesFilled,
  type Game, type MoveResult,
} from './logic';

const SLUG = 'frogger';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';

interface Hud {
  lives: number;
  score: number;
  homes: number;
  timeLeft: number;
}

interface Run {
  g: Game;
  hopT: number; // animasi lompat 0..1
  hopDir: { dx: number; dy: number };
  deathT: number; // animasi mati
  deathKind: 'kelindas' | 'tenggelam' | '';
  deathX: number;
  deathY: number;
  splashDone: boolean;
  result: { won: boolean; score: number; newBest: boolean } | null;
}

const CELL = 42;
const GX = (LW - COLS * CELL) / 2;
const GY = 148;

const VEHICLES = ['🚚', '🚜', '🚛', '🛻'];

function laneEmoji(laneIdx: number): string {
  return VEHICLES[laneIdx % VEHICLES.length];
}

export default function ArcadeFrogger({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const runRef = useRef<Run | null>(null);
  const screenRef = useRef<Screen>('ready');
  const [screen, setScreenState] = useState<Screen>('ready');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ lives: 3, score: 0, homes: 0, timeLeft: ATTEMPT_TIME });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const pushHud = (run: Run): void => {
    apiRef.current?.pushHud({
      lives: run.g.lives, score: run.g.score,
      homes: homesFilled(run.g), timeLeft: Math.ceil(run.g.timeLeft),
    } as Hud);
  };

  const scoreKey = bestKey(SLUG, 'score');

  const startGame = (): void => {
    const api = apiRef.current;
    if (!api) return;
    runRef.current = {
      g: createGame((Date.now() % 100000) | 0),
      hopT: 1, hopDir: { dx: 0, dy: 0 },
      deathT: 0, deathKind: '', deathX: 0, deathY: 0, splashDone: true,
      result: null,
    };
    setScreen('play');
    api.sfx.ensure();
    api.sfx.click();
    pushHud(runRef.current);
  };

  const onDeath = (run: Run, kind: 'kelindas' | 'tenggelam', px: number, py: number): void => {
    const api = apiRef.current;
    if (!api) return;
    run.deathT = 0.9;
    run.deathKind = kind;
    run.deathX = px;
    run.deathY = py;
    run.splashDone = false;
    api.shake.add(0.35);
    if (kind === 'kelindas') {
      api.sfx.crumble(1);
      api.particles.spawn(px, py, {
        count: 16, colors: ['#fbbf24', '#f97316', '#78350f'],
        speed: [60, 220], gravity: 300, life: [0.4, 0.8], size: [2.5, 5.5], shape: 'rect', rotation: true,
      });
    } else {
      api.sfx.thud(0.8);
      api.particles.spawn(px, py, {
        count: 20, colors: ['#7dd3fc', '#38bdf8', '#fff'],
        speed: [60, 220], gravity: 320, life: [0.4, 0.9], size: [2.5, 5.5], shape: 'circle',
      });
    }
    if (run.g.status === 'lost') {
      window.setTimeout(() => finishRun(false), 1000);
    }
  };

  const finishRun = (won: boolean): void => {
    const run = runRef.current;
    if (!run || run.result) return;
    const prev = getJson<number>(scoreKey, 0);
    const newBest = run.g.score > prev;
    if (newBest) setJson(scoreKey, run.g.score);
    run.result = { won, score: run.g.score, newBest };
    const api = apiRef.current;
    if (won && api) {
      api.sfx.chime(5);
      for (let k = 0; k < 3; k += 1) {
        api.particles.spawn(60 + k * 135, 200, {
          count: 26, colors: ['#ffd166', '#4ade80', '#7dd3fc', '#fff'],
          speed: [80, 300], gravity: 420, life: [0.8, 1.6], size: [3, 7], shape: 'rect', rotation: true,
        });
      }
    }
    pushHud(run);
    window.setTimeout(() => setScreen('over'), won ? 1200 : 600);
  };

  const doMove = (dx: number, dy: number): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.result) return;
    api.sfx.ensure();
    const livesBefore = run.g.lives;
    const scoreBefore = run.g.score;
    const res: MoveResult = move(run.g, dx, dy);
    if (res === 'moved') {
      api.sfx.pop(0.8);
      run.hopT = 0;
      run.hopDir = { dx, dy };
    } else if (res === 'home') {
      api.sfx.chime(3);
      run.hopT = 0;
      run.hopDir = { dx, dy };
      api.scores.add(195, GY - 30, `+${run.g.score - scoreBefore} 🏠`, { color: '#4ade80', size: 18 });
      if (run.g.status === 'won') window.setTimeout(() => finishRun(true), 900);
    } else if (res === 'blocked') {
      api.sfx.thud(0.2);
    }
    if (run.g.lives < livesBefore) {
      const { x, y } = cellXY(Math.round(run.g.fx), run.g.y);
      onDeath(run, res === 'drowned' ? 'tenggelam' : 'tenggelam', x, y);
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
      const run = runRef.current;
      if (!run || screenRef.current !== 'play' || run.result) return;
      const lp = toLogical(p.x, p.y);
      const tcx = Math.floor((lp.x - GX) / CELL);
      const tcy = Math.floor((lp.y - GY) / CELL);
      if (tcx < 0 || tcx >= COLS || tcy < 0 || tcy >= ROWS) return;
      const fx = Math.round(run.g.fx);
      const fy = run.g.y;
      const dx = tcx - fx;
      const dy = tcy - fy;
      if (dx === 0 && dy === 0) return;
      if (Math.abs(dx) >= Math.abs(dy)) doMove(Math.sign(dx), 0);
      else doMove(0, Math.sign(dy));
    };

    api.setUpdate((dt) => {
      const run = runRef.current;
      if (!run || run.result) return;
      if (screenRef.current !== 'play') return;
      const livesBefore = run.g.lives;
      const px = run.g.fx;
      const py = run.g.y;
      update(run.g, dt);
      if (run.g.lives < livesBefore) {
        const { x, y } = cellXY(Math.round(px), py);
        // bedakan kelindas vs tenggelam dari posisi
        const lane = run.g.lanes[py];
        onDeath(run, lane && lane.kind === 'road' ? 'kelindas' : 'tenggelam', x, y);
      }
      if (run.hopT < 1) run.hopT = Math.min(1, run.hopT + dt * 5);
      if (run.deathT > 0) {
        run.deathT -= dt;
        if (!run.splashDone && run.deathT < 0.6) run.splashDone = true;
      }
      if (run.g.status === 'lost' && !run.result) {
        // finishRun dipicu via onDeath timeout; fallback
      }
      pushHudThrottled(run, dt);
    });

    let hudAcc = 0;
    function pushHudThrottled(run: Run, dt: number): void {
      hudAcc += dt;
      if (hudAcc > 0.3) { hudAcc = 0; pushHud(run); }
    }

    api.setRender(() => {
      const run = runRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = performance.now() / 1000;
      ctx.save();
      ctx.scale(s, s);
      drawBackdrop(ctx, lh);
      if (run) {
        drawLanes(ctx, run.g, t, api.reducedMotion);
        drawHomes(ctx, run.g, t, api.reducedMotion);
        drawFrog(ctx, run, t, api.reducedMotion);
        if (run.deathT > 0) drawDeath(ctx, run);
        drawTimerBar(ctx, run.g);
      }
      ctx.restore();
    });

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__frogger = {
        get screen() { return screenRef.current; },
        get lives() { return runRef.current?.g.lives ?? 0; },
        get score() { return runRef.current?.g.score ?? 0; },
        get homes() { return runRef.current ? homesFilled(runRef.current.g) : 0; },
        get status() { return runRef.current?.g.status ?? 'playing'; },
        get pos() {
          const r = runRef.current;
          return r ? { x: Math.round(r.g.fx), y: r.g.y } : { x: 0, y: 0 };
        },
        lanes() {
          const r = runRef.current;
          if (!r) return [];
          return r.g.lanes.map((l) => ({
            kind: l.kind, cells: [...obstacleCells(l, r.g.t)],
          }));
        },
        start() { startGame(); },
        move(dx: number, dy: number) { doMove(dx, dy); },
        game() { return runRef.current?.g ?? null; },
      };
    }
    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__frogger;
    };
  });

  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    setScreen('pause');
  };
  const doResume = (): void => {
    sfx.ensure();
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
  const best = getJson<number>(scoreKey, 0);
  const res = runRef.current?.result ?? null;
  const homeStr = hud.homes > 0 ? '🏠'.repeat(Math.min(5, hud.homes)) : '';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0d1a12', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          {'❤️'.repeat(Math.max(0, hud.lives)) || '💀'}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13 }}>
          ⭐ {hud.score} {homeStr}
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
          <div style={{ fontSize: 44 }}>👷🐸</div>
          <h2 style={titleStyle}>TUKANG NYEBRANG</h2>
          <p style={textStyle}>Ketuk petak untuk melompat! Seberangi jalan proyek (jangan kelindas 🚚) lalu sungai dengan naik balok kayu 🪵. Antar tukang ke 5 rumah — 3 nyawa, 60 detik tiap nyawa.</p>
          <button style={primaryBtn} onClick={startGame}>Berangkat Kerja 🏗️</button>
          {best > 0 && (
            <p style={{ ...textStyle, marginTop: 10, fontSize: 13 }}>🏅 Skor terbaik: {best}</p>
          )}
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>⏸</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Tukang istirahat ngopi dulu.</p>
          <button style={primaryBtn} onClick={doResume}>Lanjut</button>
        </Overlay>
      )}

      {screen === 'over' && res && (
        <Overlay>
          <div style={{ fontSize: 44 }}>{res.won ? '🏆' : '🚧'}</div>
          <h2 style={titleStyle}>{res.won ? 'SEMUA TUKANG SAMPAI!' : 'PROYEK GAGAL!'}</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            ⭐ Skor: {res.score}
            {res.newBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <p style={textStyle}>{res.won ? 'Lima rumah berpenghuni. Bonus THR cair!' : 'Nyawa habis di tengah jalan. Coba rute lebih aman!'}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={startGame}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={() => setScreen('ready')}>Menu</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function cellXY(cx: number, cy: number): { x: number; y: number } {
  return { x: GX + cx * CELL, y: GY + cy * CELL };
}

function drawBackdrop(ctx: CanvasRenderingContext2D, lh: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, lh);
  g.addColorStop(0, '#1c2b1e');
  g.addColorStop(1, '#0d1a12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LW, lh);
}

function drawLanes(ctx: CanvasRenderingContext2D, g: Game, t: number, rm: boolean): void {
  for (let y = 0; y < ROWS; y += 1) {
    const lane = g.lanes[y];
    const yy = GY + y * CELL;
    if (lane.kind === 'river') {
      // air berlapis + ombak
      const wg = ctx.createLinearGradient(0, yy, 0, yy + CELL);
      wg.addColorStop(0, '#1d6fa5');
      wg.addColorStop(1, '#0d3d63');
      ctx.fillStyle = wg;
      ctx.fillRect(GX, yy, COLS * CELL, CELL);
      if (!rm) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        for (let w = 0; w < 4; w += 1) {
          const wx = GX + ((t * 40 * (w % 2 === 0 ? 1 : -1) + w * 97) % (COLS * CELL + 60)) - 30;
          const wy = yy + 8 + w * 9;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.quadraticCurveTo(wx + 10, wy - 4, wx + 20, wy);
          ctx.quadraticCurveTo(wx + 30, wy + 4, wx + 40, wy);
          ctx.stroke();
        }
      }
      // balok kayu
      const cells = obstacleCells(lane, g.t);
      const drawn = new Set<number>();
      for (const c of cells) {
        if (drawn.has(c)) continue;
        drawn.add(c);
        // gabungkan sel bersebelahan jadi satu balok
        let len = 1;
        while (cells.has((c + len) % COLS)) { drawn.add((c + len) % COLS); len += 1; }
        const bx = GX + c * CELL;
        drawLog(ctx, bx, yy + 4, len * CELL, CELL - 8);
      }
    } else if (lane.kind === 'road') {
      // aspal berlapis
      const ag = ctx.createLinearGradient(0, yy, 0, yy + CELL);
      ag.addColorStop(0, '#3a3f4a');
      ag.addColorStop(1, '#23262e');
      ctx.fillStyle = ag;
      ctx.fillRect(GX, yy, COLS * CELL, CELL);
      ctx.strokeStyle = 'rgba(250,204,21,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(GX, yy + CELL / 2);
      ctx.lineTo(GX + COLS * CELL, yy + CELL / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // kendaraan
      const cells = obstacleCells(lane, g.t);
      const drawn = new Set<number>();
      let vi = 0;
      for (const c of [...cells].sort((a, b) => a - b)) {
        if (drawn.has(c)) continue;
        drawn.add(c);
        let len = 1;
        while (cells.has((c + len) % COLS)) { drawn.add((c + len) % COLS); len += 1; }
        drawVehicle(ctx, GX + c * CELL, yy + 2, len * CELL, CELL - 4, laneEmoji(vi + y));
        vi += 1;
      }
    } else {
      // safe / start / home: tanah
      const sg = ctx.createLinearGradient(0, yy, 0, yy + CELL);
      sg.addColorStop(0, lane.kind === 'home' ? '#4a3b28' : '#3d5a34');
      sg.addColorStop(1, lane.kind === 'home' ? '#33271c' : '#2a4024');
      ctx.fillStyle = sg;
      ctx.fillRect(GX, yy, COLS * CELL, CELL);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(GX, yy, COLS * CELL, 3);
    }
  }
}

function drawLog(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x + 2, y + 3, w, h, 8);
  else ctx.rect(x + 2, y + 3, w, h);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#c98f4e');
  g.addColorStop(0.5, '#a66a2e');
  g.addColorStop(1, '#7c4a1c');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 8);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  // serat kayu
  ctx.strokeStyle = 'rgba(90,50,15,0.5)';
  ctx.lineWidth = 1.5;
  for (let px = x + 12; px < x + w - 4; px += 18) {
    ctx.beginPath(); ctx.moveTo(px, y + 4); ctx.lineTo(px, y + h - 4); ctx.stroke();
  }
  // ujung lingkaran kayu
  ctx.fillStyle = '#e0b877';
  ctx.beginPath(); ctx.arc(x + 7, y + h / 2, 6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#7c4a1c';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x + 7, y + h / 2, 6, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 7, y + h / 2, 3, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawVehicle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, emoji: string): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x + 2, y + 4, w, h, 8);
  else ctx.rect(x + 2, y + 4, w, h);
  ctx.fill();
  // bodi berlapis
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f8fafc');
  g.addColorStop(1, '#94a3b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 8);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // roda
  ctx.fillStyle = '#111827';
  const wr = 6;
  ctx.beginPath(); ctx.arc(x + 10, y + h - 2, wr, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 10, y + h - 2, wr, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6b7280';
  ctx.beginPath(); ctx.arc(x + 10, y + h - 2, 2.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 10, y + h - 2, 2.5, 0, TAU); ctx.fill();
  // emoji kendaraan
  ctx.font = `${Math.round(h * 0.75)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x + w / 2, y + h / 2 - 2);
  ctx.restore();
}

function drawHomes(ctx: CanvasRenderingContext2D, g: Game, t: number, rm: boolean): void {
  const yy = GY;
  for (let h = 0; h < 5; h += 1) {
    const cx = GX + HOME_COLS[h] * CELL;
    const filled = g.homes[h];
    const pulse = filled && !rm ? 1 + 0.05 * Math.sin(t * 5 + h) : 1;
    ctx.save();
    ctx.translate(cx + CELL / 2, yy + CELL / 2);
    ctx.scale(pulse, pulse);
    // bayangan
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 14, 18, 5, 0, 0, TAU); ctx.fill();
    // badan rumah
    const bg = ctx.createLinearGradient(0, -8, 0, 16);
    bg.addColorStop(0, filled ? '#fef3c7' : '#d6cfc0');
    bg.addColorStop(1, filled ? '#fcd34d' : '#a89f8d');
    ctx.fillStyle = bg;
    ctx.fillRect(-15, -8, 30, 24);
    // atap
    ctx.fillStyle = filled ? '#dc2626' : '#7c5a3a';
    ctx.beginPath();
    ctx.moveTo(-18, -8); ctx.lineTo(0, -22); ctx.lineTo(18, -8);
    ctx.closePath(); ctx.fill();
    // pintu
    const dg = ctx.createLinearGradient(0, 0, 0, 16);
    dg.addColorStop(0, filled ? '#fbbf24' : '#3f3f46');
    dg.addColorStop(1, filled ? '#f59e0b' : '#27272a');
    ctx.fillStyle = dg;
    ctx.fillRect(-6, 0, 12, 16);
    // jendela
    ctx.fillStyle = filled ? '#fef9c3' : '#52525b';
    ctx.fillRect(-13, -2, 5, 5);
    ctx.fillRect(8, -2, 5, 5);
    if (filled) {
      // asap cerobong berdenyut
      if (!rm) {
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(t * 3 + h)})`;
        ctx.beginPath(); ctx.arc(10, -26 - 2 * Math.sin(t * 3 + h), 3.5, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('👷', 0, 12);
    }
    ctx.restore();
  }
}

function drawFrog(ctx: CanvasRenderingContext2D, run: Run, t: number, rm: boolean): void {
  const g = run.g;
  if (g.status === 'lost' || run.deathT > 0.5) return;
  const lane = g.lanes[g.y];
  const px = GX + g.fx * CELL + CELL / 2;
  const py = GY + g.y * CELL + CELL / 2;
  const hopping = run.hopT < 1;
  const lift = hopping && !rm ? Math.sin(run.hopT * Math.PI) * 14 : 0;
  const squash = hopping && !rm ? 1 - 0.18 * Math.sin(run.hopT * Math.PI) : 1;
  const onLog = lane.kind === 'river';
  const bob = onLog && !rm ? Math.sin(t * 4) * 1.5 : 0;

  ctx.save();
  ctx.translate(px, py - lift + bob);
  ctx.scale(1 / Math.sqrt(Math.max(0.3, squash)), squash);
  // bayangan
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 14 + lift, 13, 4, 0, 0, TAU); ctx.fill();
  // tukang dengan helm proyek
  ctx.fillStyle = '#ffffff'; // reset alpha bayangan
  ctx.font = '30px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👷', 0, 0);
  ctx.restore();
}

function drawDeath(ctx: CanvasRenderingContext2D, run: Run): void {
  const a = Math.max(0, run.deathT / 0.9);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = '30px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const jx = run.deathKind === 'kelindas' ? Math.sin(run.deathT * 40) * 3 : 0;
  ctx.fillText(run.deathKind === 'kelindas' ? '💥' : '🌊', run.deathX + CELL / 2 + jx, run.deathY + CELL / 2);
  ctx.font = `900 14px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(run.deathKind === 'kelindas' ? 'KELINDAS!' : 'TENGGELAM!', run.deathX + CELL / 2, run.deathY - 8);
  ctx.restore();
}

function drawTimerBar(ctx: CanvasRenderingContext2D, g: Game): void {
  const w = COLS * CELL;
  const frac = Math.max(0, g.timeLeft / ATTEMPT_TIME);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(GX, GY - 14, w, 8);
  const tg = ctx.createLinearGradient(GX, 0, GX + w, 0);
  tg.addColorStop(0, frac > 0.3 ? '#4ade80' : '#f87171');
  tg.addColorStop(1, frac > 0.3 ? '#22c55e' : '#ef4444');
  ctx.fillStyle = tg;
  ctx.fillRect(GX, GY - 14, w * frac, 8);
  ctx.fillStyle = '#fff';
  ctx.font = `800 10px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(g.timeLeft)}s`, GX + w, GY - 18);
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
