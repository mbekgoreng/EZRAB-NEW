/**
 * ArcadeLightsOut ("Matikan Lampu Proyek") — ketuk lampu menara proyek untuk
 * mematikannya beserta tetangganya. Matikan semua = hemat listrik!
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, easeOutBack } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { GRID, affected, toggle, isSolved, emptyBoard, scramble, scoreFor, starsFor, SHIFTS } from './logic';

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
  /** Riwayat langkah (r,c) untuk Urungkan. Invarian: history.length === moves. */
  history: { r: number; c: number }[];
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

    const s: S = { board: emptyBoard(), moves: 0, elapsed: 0, over: false, score: 0, shiftIdx: 1, pops: [], t: 0, history: [] };
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
      s.history = [];
      push();
    };

    /**
     * Urungkan satu langkah. Toggle adalah invers dirinya sendiri, jadi
     * menerapkan toggle yang sama pada langkah terakhir persis membatalkan
     * langkah itu. Perilaku: riwayat kosong / permainan sudah selesai =
     * no-op aman; selain itu langkah terakhir dikeluarkan dari riwayat,
     * moves berkurang 1, dan papan kembali ke keadaan sebelum langkah itu
     * (keadaan itu pasti belum solved: papan awal dijamin belum solved oleh
     * reset, dan langkah sesudah solved tidak pernah tercatat karena
     * permainan berakhir saat solved).
     */
    const undo = (): void => {
      if (s.over) return;
      const last = s.history.pop();
      if (!last) return;
      s.board = toggle(s.board, last.r, last.c);
      s.moves = Math.max(0, s.moves - 1);
      for (const i of affected(last.r, last.c)) s.pops.push({ i, age: 0 });
      sfx.click();
      push();
    };

    const winGame = (): void => {
      s.over = true;
      s.score = scoreFor(s.moves, s.elapsed);
      const nb = setBest(BK, s.score);
      sfx.chime(4);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'LISTRIK HEMAT! PROYEK GELAP!', { size: 24, color: '#fde047' });
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
      s.history.push({ r, c });
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
    (api as unknown as { __undo: () => void }).__undo = undo;
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
  const undoGame = (): void => {
    if (screenRef.current !== 'play') return;
    (apiRef.current as unknown as { __undo?: () => void } | null)?.__undo?.();
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
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.92, display: 'flex', alignItems: 'center', gap: 5 }}>
            <StepsIcon /> {hud.moves} langkah &nbsp;<ClockIcon /> {mm}:{ss}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? <PauseIcon /> : <PlayIcon />}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? <MutedIcon /> : <SoundIcon />}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar"><CloseIcon /></button>
        </div>
      </div>
      {screen === 'play' && (
        <button
          onClick={undoGame}
          disabled={hud.moves === 0}
          aria-label="Urungkan langkah terakhir"
          style={{
            position: 'absolute', left: 12, bottom: 12, zIndex: 6, display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(8,14,30,0.62)', color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 13,
            cursor: hud.moves === 0 ? 'default' : 'pointer', opacity: hud.moves === 0 ? 0.45 : 1, backdropFilter: 'blur(6px)',
          }}
        >
          <UndoIcon /> Urungkan
        </button>
      )}
      <div style={{ position: 'absolute', top: 76, left: 0, right: 0, textAlign: 'center', zIndex: 4, pointerEvents: 'none' }}>
        <span style={{ fontSize: 12, color: '#93c5fd', background: 'rgba(8,14,30,0.55)', padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(147,197,253,0.25)' }}>
          Matikan SEMUA lampu proyek! Satu ketuk = dirinya + tetangga.
        </span>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><BulbIcon size={46} /></div>
          <h2 style={h2}>MATIKAN LAMPU PROYEK</h2>
          <p style={p}>
            Malam hari, lampu menara proyek masih menyala — <b>boros listrik!</b> Ketuk
            satu lampu: ia <b>dan tetangganya</b> ikut mati/nyala. Matikan <b>semuanya</b>
            dengan langkah sesedikit mungkin!
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            {SHIFTS.map((sh, i) => (
              <button key={sh.id} onClick={() => { shiftRef.current = i; setShiftSel(i); }} style={{ ...shiftBtn, outline: shiftSel === i ? '2px solid #fde047' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}><ShiftIcon id={sh.id} size={28} /></div>
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
          <div style={{ display: 'flex', justifyContent: 'center' }}><CoffeeIcon size={44} /></div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Lampu-lampunya ikut istirahat. Jangan lupa dimatikan lagi nanti.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><NightIcon size={48} /></div>
          <h2 style={h2}>PROYEK GELAP GULITA!</h2>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '6px 0 2px' }} aria-label={`Bintang ${starsFor(hud.moves, SHIFTS[shiftSel].presses, true)} dari 3`}>
            {[0, 1, 2].map((i) => (
              <StarIcon key={i} filled={i < starsFor(hud.moves, SHIFTS[shiftSel].presses, true)} size={30} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#93c5fd' }}>
            Par shift ini: {SHIFTS[shiftSel].presses} langkah (par pendekatan dari ketukan acak pembentuk papan, bukan optimum terbukti)
          </div>
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

/* ---------- Ikon SVG prosedural (pengganti emoji) ---------- */

function ShiftIcon({ id, size = 28 }: { id: string; size?: number }): React.JSX.Element {
  if (id === 'pagi') {
    // Matahari terbit: setengah matahari di atas garis horizon + sinar.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.5 17a5.5 5.5 0 0 1 11 0Z" fill="#fbbf24" />
        <path d="M12 7.5V5M5.9 10.1 4.5 8.7M18.1 10.1l1.4-1.4" stroke="#fde047" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 17.5h18M5.5 20.5h13" stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'malam') {
    // Bulan sabit + satu bintang kecil.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M19.5 14.2A7.5 7.5 0 1 1 9.8 4.5a6 6 0 0 0 9.7 9.7Z" fill="#c7d6fb" />
        <path d="M18.6 4.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" fill="#fde047" />
      </svg>
    );
  }
  // Shift Siang: matahari penuh dengan sinar.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.6" fill="#fbbf24" stroke="#fde047" strokeWidth="1.4" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" stroke="#fde047" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon({ filled, size = 30 }: { filled: boolean; size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6l2.8 5.9 6.5.8-4.8 4.4 1.3 6.4L12 17l-5.8 3.1 1.3-6.4L2.7 9.3l6.5-.8L12 2.6Z"
        fill={filled ? '#fde047' : 'rgba(255,255,255,0.12)'}
        stroke={filled ? '#f59e0b' : 'rgba(255,255,255,0.35)'}
        strokeWidth="1.2" strokeLinejoin="round"
      />
    </svg>
  );
}

function BulbIcon({ size = 46 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18.5h6M10 21h4" stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 3a6 6 0 0 1 3.3 10.9c-.6.5-1 1-1.1 1.8h-4.4c-.1-.8-.5-1.3-1.1-1.8A6 6 0 0 1 12 3Z" fill="#fde047" stroke="#f59e0b" strokeWidth="1.2" />
      <path d="M12 6.2a3.2 3.2 0 0 1 2 5.9" stroke="#fff7cc" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CoffeeIcon({ size = 44 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3.5c0 1.2-1 1.3-1 2.5M12.5 3.5c0 1.2-1 1.3-1 2.5" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.5 9.5h11v5.2a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9.5Z" fill="#e8f1ff" />
      <path d="M15.5 10.5h1.2a2.9 2.9 0 0 1 0 5.8h-1.4" stroke="#e8f1ff" strokeWidth="1.8" />
      <path d="M4.5 12h11" stroke="#93c5fd" strokeWidth="1.4" />
    </svg>
  );
}

function NightIcon({ size = 48 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18.8 12.6A6.4 6.4 0 1 1 11.4 5.2a5.1 5.1 0 0 0 7.4 7.4Z" fill="#c7d6fb" />
      <path d="M3 21v-6.2h4V21M8.5 21v-4h3.6v4M15 21v-3.2h3V21" fill="#31456f" />
      <path d="M2.5 21h19" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StepsIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6.5 3.5c1.9-.4 3.4 1.6 3.2 4-.1 1.9-1.2 3.4-2.6 3.3-1.5-.1-2.4-2-2.2-4 .2-1.9.8-3.1 1.6-3.3ZM15.5 12.5c1.9-.4 3.4 1.6 3.2 4-.1 1.9-1.2 3.4-2.6 3.3-1.5-.1-2.4-2-2.2-4 .2-1.9.8-3.1 1.6-3.3Z" fill="#fde047" />
    </svg>
  );
}

function ClockIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="8.5" stroke="#93c5fd" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="#e8f1ff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PauseIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="#fff" /><rect x="14" y="5" width="4" height="14" rx="1.2" fill="#fff" /></svg>
  );
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="#fff" /></svg>
  );
}

function SoundIcon(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="#fff" />
      <path d="M15 9.5a3.6 3.6 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MutedIcon(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="#fff" />
      <path d="M15.5 9.8l5 5M20.5 9.8l-5 5" stroke="#fda4af" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
  );
}

function UndoIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 6.5 5 10l3.5 3.5" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10H14a5 5 0 0 1 0 10h-2.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
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
