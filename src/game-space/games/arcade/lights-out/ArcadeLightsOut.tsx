/**
 * ArcadeLightsOut ("Matikan Lampu Proyek") — ketuk lampu menara proyek untuk
 * mematikannya beserta tetangganya. Matikan semua = hemat listrik!
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, easeOutBack } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { GRID, toggle, isSolved, emptyBoard, scramble, scoreFor, SHIFTS } from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('lampu-proyek', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  board: boolean[];
  moves: number;
  elapsed: number;
  over: boolean;
  score: number;
  shiftIdx: number;
  pops: { i: number; age: number }[];
  t: number;
}

export default function ArcadeLightsOut({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const shiftRef = useRef(1);
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [shiftSel, setShiftSel] = useState(1);
  const [hud, setHud] = useState({ moves: 0, time: 0, best: getBest(BK, 0), shift: SHIFTS[1].name, score: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const geom = (W: number, H: number): { ox: number; oy: number; cell: number } => {
    const cell = Math.min((W - 32) / GRID, (H - 190) / GRID);
    const ox = (W - cell * GRID) / 2;
    const oy = 132;
    return { ox, oy, cell };
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = { board: emptyBoard(), moves: 0, elapsed: 0, over: false, score: 0, shiftIdx: 1, pops: [], t: 0 };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ moves: s.moves, time: s.elapsed, best: getBest(BK, 0), shift: SHIFTS[s.shiftIdx].name, score: s.score });
    };

    const reset = (shiftIdx: number): void => {
      s.shiftIdx = shiftIdx;
      s.board = scramble(rng, SHIFTS[shiftIdx].presses);
      if (isSolved(s.board)) s.board = toggle(s.board, 2, 2); // jangan mulai sudah menang
      s.moves = 0;
      s.elapsed = 0;
      s.over = false;
      s.score = 0;
      s.pops = [];
      push();
    };

    const winGame = (): void => {
      s.over = true;
      s.score = scoreFor(s.moves, s.elapsed);
      const nb = setBest(BK, s.score);
      sfx.chime(4);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '💡 LISTRIK HEMAT! PROYEK GELAP!', { size: 24, color: '#fde047' });
      // kembang api hemat energi
      for (let k = 0; k < 3; k += 1) {
        window.setTimeout(() => {
          api.particles.spawn(60 + rng() * (api.W - 120), 120 + rng() * 160, {
            count: 30, colors: ['#fde047', '#fef08a', '#93c5fd', '#4ade80'],
            speed: [60, 300], life: [0.5, 1], size: [2, 5], gravity: 160, shape: 'circle',
          });
        }, k * 260);
      }
      api.pushHud({ moves: s.moves, time: s.elapsed, best: nb, shift: SHIFTS[s.shiftIdx].name, score: s.score });
      window.setTimeout(() => setScreen('over'), 1300);
    };

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      const g = geom(api.W, api.H);
      const c = Math.floor((p.x - g.ox) / g.cell);
      const r = Math.floor((p.y - g.oy) / g.cell);
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;
      const before = s.board;
      s.board = toggle(before, r, c);
      s.moves += 1;
      sfx.click();
      const turnedOff: number[] = [];
      const turnedOn: number[] = [];
      for (let i = 0; i < before.length; i += 1) {
        if (before[i] !== s.board[i]) {
          s.pops.push({ i, age: 0 });
          if (!s.board[i]) turnedOff.push(i); else turnedOn.push(i);
        }
      }
      // partikel untuk lampu yang padam
      for (const i of turnedOff) {
        const cc = i % GRID; const rr = Math.floor(i / GRID);
        api.particles.spawn(g.ox + cc * g.cell + g.cell / 2, g.oy + rr * g.cell + g.cell * 0.32, {
          count: 5, colors: ['#94a3b8', '#cbd5e1'], speed: [30, 120],
          life: [0.25, 0.5], size: [1.5, 3], gravity: 120, shape: 'circle',
        });
      }
      if (turnedOn.length > 0) sfx.pop(0.7);
      if (isSolved(s.board)) { winGame(); return; }
      push();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      for (const pp of s.pops) pp.age += dt;
      s.pops = s.pops.filter((pp) => pp.age < 0.28);
      if (screenRef.current !== 'play' || s.over) return;
      s.elapsed += dt;
      push();
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#060b1d');
      sky.addColorStop(0.7, '#0e1a3a');
      sky.addColorStop(1, '#132240');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // bintang
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 46; i += 1) {
        const bx = (i * 167.3) % W;
        const by = (i * 89.7) % (H * 0.4);
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(s.t * 1.4 + i));
        ctx.globalAlpha = 0.25 + 0.5 * tw;
        ctx.beginPath(); ctx.arc(bx, by, 1.3, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // bulan
      ctx.save();
      ctx.shadowColor = 'rgba(240,245,255,0.8)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#e8eefc';
      ctx.beginPath(); ctx.arc(W - 52, 66, 20, 0, TAU); ctx.fill();
      ctx.restore();
      // siluet gedung + crane di kejauhan
      ctx.fillStyle = '#0a1228';
      const base = H * 0.86;
      const bw = [46, 60, 38, 70, 50];
      let bx = -8;
      for (const w of bw) {
        const bh = 60 + ((bx * 37) % 50 + 50) % 50;
        ctx.fillRect(bx, base - bh, w, bh + H);
        bx += w + 14;
      }
      // crane siluet
      ctx.strokeStyle = '#0a1228';
      ctx.lineWidth = 7;
      const cx = W * 0.82;
      ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, base - 190); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx - 70, base - 190); ctx.lineTo(cx + 80, base - 190); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, base - 190); ctx.lineTo(cx, base - 226); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 70, base - 190); ctx.lineTo(cx, base - 226); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 80, base - 190); ctx.lineTo(cx, base - 226); ctx.stroke();
      ctx.fillStyle = 'rgba(253,224,71,0.85)';
      ctx.beginPath(); ctx.arc(cx + 52, base - 160, 3.2, 0, TAU); ctx.fill();
    };

    const drawLamp = (ctx: CanvasRenderingContext2D, r: number, c: number, g: { ox: number; oy: number; cell: number }): void => {
      const { ox, oy, cell } = g;
      const i = r * GRID + c;
      const on = s.board[i];
      const x = ox + c * cell + cell / 2;
      const top = oy + r * cell;
      const headY = top + cell * 0.30;
      const groundY = top + cell * 0.94;
      const pop = s.pops.find((pp) => pp.i === i);
      const pk = pop ? easeOutBack(clamp(pop.age / 0.28, 0, 1)) : 1;

      ctx.save();
      // cahaya kerucut saat menyala
      if (on) {
        const flick = 0.92 + 0.08 * Math.sin(s.t * 9 + i * 2.1);
        const cone = ctx.createLinearGradient(0, headY, 0, groundY);
        cone.addColorStop(0, `rgba(253,224,71,${0.28 * flick})`);
        cone.addColorStop(1, 'rgba(253,224,71,0.02)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(x - cell * 0.10, headY);
        ctx.lineTo(x + cell * 0.10, headY);
        ctx.lineTo(x + cell * 0.30, groundY);
        ctx.lineTo(x - cell * 0.30, groundY);
        ctx.closePath();
        ctx.fill();
        // genangan cahaya di tanah
        const pool = ctx.createRadialGradient(x, groundY, 2, x, groundY, cell * 0.32);
        pool.addColorStop(0, `rgba(253,224,71,${0.5 * flick})`);
        pool.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = pool;
        ctx.beginPath(); ctx.ellipse(x, groundY, cell * 0.32, cell * 0.10, 0, 0, TAU); ctx.fill();
      }
      const sc = 0.9 + 0.1 * pk;
      ctx.translate(x, headY);
      ctx.scale(sc, sc);
      // tiang
      const pole = ctx.createLinearGradient(-3, 0, 3, 0);
      pole.addColorStop(0, '#3f4a5f');
      pole.addColorStop(0.5, '#8b96ab');
      pole.addColorStop(1, '#2b3345');
      ctx.fillStyle = pole;
      const poleH = cell * 0.62;
      ctx.fillRect(-3, 0, 6, poleH);
      // dasar tiang
      ctx.fillStyle = '#222a3c';
      ctx.beginPath(); ctx.ellipse(0, poleH, 10, 4.5, 0, 0, TAU); ctx.fill();
      // kepala lampu
      if (on) { ctx.shadowColor = 'rgba(253,224,71,0.95)'; ctx.shadowBlur = 26 * pk; }
      const hous = ctx.createLinearGradient(0, -16, 0, 0);
      hous.addColorStop(0, on ? '#fef9c3' : '#3a4358');
      hous.addColorStop(1, on ? '#fbbf24' : '#232b3f');
      ctx.fillStyle = hous;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-13, -18, 26, 20, 7);
      else ctx.rect(-13, -18, 26, 20);
      ctx.fill();
      ctx.shadowBlur = 0;
      // bohlam
      const bulb = ctx.createRadialGradient(0, -6, 1, 0, -6, 9);
      if (on) {
        bulb.addColorStop(0, '#fffbe8');
        bulb.addColorStop(0.5, '#fde047');
        bulb.addColorStop(1, '#b45309');
      } else {
        bulb.addColorStop(0, '#5b667d');
        bulb.addColorStop(1, '#2a3145');
      }
      ctx.fillStyle = bulb;
      ctx.beginPath(); ctx.arc(0, -6, 8, 0, TAU); ctx.fill();
      // sorot kaca
      ctx.fillStyle = on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.arc(-2.5, -8.5, 2.6, 0, TAU); ctx.fill();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      const g = geom(W, H);
      for (let r = 0; r < GRID; r += 1) for (let c = 0; c < GRID; c += 1) drawLamp(ctx, r, c, g);
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(2,5,14,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: (i: number) => void }).__reset = reset;
    reset(shiftRef.current);
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (si: number): void => {
    sfx.ensure();
    shiftRef.current = si;
    setShiftSel(si);
    (apiRef.current as unknown as { __reset?: (i: number) => void } | null)?.__reset?.(si);
    setScreen('play');
  };
  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (sfx.muted !== next) sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(8,14,30,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const mm = Math.floor(hud.time / 60);
  const ss = Math.floor(hud.time % 60).toString().padStart(2, '0');

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 620, overflow: 'hidden', borderRadius: 18, background: '#060b1d', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(8,14,30,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: '#fde047' }}>{hud.shift}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.92 }}>
            👆 {hud.moves} langkah &nbsp;⏱ {mm}:{ss}
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
      <div style={{ position: 'absolute', top: 76, left: 0, right: 0, textAlign: 'center', zIndex: 4, pointerEvents: 'none' }}>
        <span style={{ fontSize: 12, color: '#93c5fd', background: 'rgba(8,14,30,0.55)', padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(147,197,253,0.25)' }}>
          Matikan SEMUA lampu proyek! Satu ketuk = dirinya + tetangga.
        </span>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>💡</div>
          <h2 style={h2}>MATIKAN LAMPU PROYEK</h2>
          <p style={p}>
            Malam hari, lampu menara proyek masih menyala — <b>boros listrik!</b> Ketuk
            satu lampu: ia <b>dan tetangganya</b> ikut mati/nyala. Matikan <b>semuanya</b>
            dengan langkah sesedikit mungkin!
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            {SHIFTS.map((sh, i) => (
              <button key={sh.id} onClick={() => { shiftRef.current = i; setShiftSel(i); }} style={{ ...shiftBtn, outline: shiftSel === i ? '2px solid #fde047' : 'none' }}>
                <div style={{ fontSize: 26 }}>{sh.emoji}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#e8f1ff' }}>{sh.name}</div>
                <div style={{ fontSize: 10, opacity: 0.7, color: '#e8f1ff' }}>{sh.hint}</div>
              </button>
            ))}
          </div>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best}</b></p>}
          <button style={primaryBtn} onClick={() => startGame(shiftRef.current)}>Mulai Hemat Listrik</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Lampu-lampunya ikut istirahat. Jangan lupa dimatikan lagi nanti.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>🌃</div>
          <h2 style={h2}>PROYEK GELAP GULITA!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Langkah" value={String(hud.moves)} />
            <Stat label="Waktu" value={`${mm}:${ss}`} />
            <Stat label="Terbaik" value={String(hud.best)} />
          </div>
          <button style={primaryBtn} onClick={() => startGame(shiftRef.current)}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e8f1ff' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#93c5fd', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };
const shiftBtn: React.CSSProperties = {
  flex: 1, padding: '10px 6px', borderRadius: 13, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,9,20,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#16244a,#080d1e)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)', maxHeight: '92%', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e8f1ff' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}

void clamp;
