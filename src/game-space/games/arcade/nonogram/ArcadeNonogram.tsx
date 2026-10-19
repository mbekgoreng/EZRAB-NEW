/**
 * ArcadeNonogram ("Bongkar Gambar: Piksel Proyek") — ungkap pixel-art alat proyek
 * (palu, helm, tower crane) dari petunjuk baris/kolom seperti denah mandor.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  PUZZLES, computeClues, solutionAt, checkWin, emptyMarks,
  scoreFor, findHintCell, rowComplete, colComplete,
  type CellMark, type NonogramPuzzle,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('bongkar-gambar', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Flash { r: number; c: number; age: number; ok: boolean; }

interface S {
  puzzle: NonogramPuzzle;
  marks: CellMark[][];
  rowsDone: boolean[];
  colsDone: boolean[];
  mistakes: number;
  hints: number;
  score: number;
  elapsed: number;
  over: boolean;
  won: boolean;
  flashes: Flash[];
  reveal: number; // 0..1 animasi kemenangan
  t: number;
}

const ART_COLORS: Record<string, string[]> = {
  palu: ['#64748b', '#cbd5e1', '#94a3b8', '#475569'],
  helm: ['#f59e0b', '#fde047', '#fbbf24', '#d97706'],
  crane: ['#fb923c', '#fdba74', '#f97316', '#c2410c'],
};

export default function ArcadeNonogram({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const modeRef = useRef<1 | 2>(1);
  const puzzleRef = useRef(0);
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [pzSel, setPzSel] = useState(0);
  const [mode, setModeState] = useState<1 | 2>(1);
  const [hud, setHud] = useState({ mistakes: 0, hints: 0, time: 0, best: getBest(BK, 0), puzzle: PUZZLES[0].name, score: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const setMode = (m: 1 | 2): void => {
    modeRef.current = m;
    setModeState(m);
  };

  // geometri papan — dipakai input & render
  const geom = (W: number, H: number): { ox: number; oy: number; cell: number } => {
    const clueL = 58;
    const clueT = 96;
    const cell = Math.min((W - clueL - 14) / 10, (H - clueT - 96) / 10);
    const bw = cell * 10;
    const ox = clueL + (W - clueL - 14 - bw) / 2;
    const oy = clueT + 6;
    return { ox, oy, cell };
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const newState = (pi: number): S => ({
      puzzle: PUZZLES[pi],
      marks: emptyMarks(),
      rowsDone: new Array(10).fill(false),
      colsDone: new Array(10).fill(false),
      mistakes: 0,
      hints: 0,
      score: 0,
      elapsed: 0,
      over: false,
      won: false,
      flashes: [],
      reveal: 0,
      t: 0,
    });

    const s: S = newState(0);
    let clues = computeClues(s.puzzle.grid);

    const push = (): void => {
      api.pushHud({ mistakes: s.mistakes, hints: s.hints, time: s.elapsed, best: getBest(BK, 0), puzzle: s.puzzle.name, score: s.score });
    };

    const reset = (pi: number): void => {
      puzzleRef.current = pi;
      const fresh = newState(pi);
      Object.assign(s, fresh);
      clues = computeClues(s.puzzle.grid);
      push();
    };

    const winGame = (): void => {
      s.over = true;
      s.won = true;
      s.score = scoreFor(s.mistakes, s.hints, s.elapsed);
      const nb = setBest(BK, s.score);
      sfx.chime(5);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, `${s.puzzle.emoji} ${s.puzzle.name.toUpperCase()} TERUNGKAP!`, { size: 26, color: '#fde047' });
      api.particles.spawn(api.W / 2, api.H * 0.42, {
        count: 70, colors: ['#fde047', '#fbbf24', '#fff7d6', '#fb923c'],
        speed: [80, 360], life: [0.7, 1.3], size: [2, 6], gravity: 260, shape: 'rect', rotation: true,
      });
      api.shake.add(0.6);
      api.pushHud({ mistakes: s.mistakes, hints: s.hints, time: s.elapsed, best: nb, puzzle: s.puzzle.name, score: s.score });
      window.setTimeout(() => setScreen('over'), 1400);
    };

    const checkLines = (): void => {
      const g = geom(api.W, api.H);
      for (let r = 0; r < 10; r += 1) {
        if (!s.rowsDone[r] && rowComplete(s.puzzle.grid, s.marks, r)) {
          s.rowsDone[r] = true;
          const x = g.ox - 10;
          const y = g.oy + r * g.cell + g.cell / 2;
          api.scores.add(x, y, '✓', { color: '#4ade80', size: 18 });
          sfx.pop(1.2);
        }
      }
      for (let c = 0; c < 10; c += 1) {
        if (!s.colsDone[c] && colComplete(s.puzzle.grid, s.marks, c)) {
          s.colsDone[c] = true;
          const x = g.ox + c * g.cell + g.cell / 2;
          const y = g.oy - 12;
          api.scores.add(x, y, '✓', { color: '#4ade80', size: 18 });
          sfx.pop(1.2);
        }
      }
    };

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      const g = geom(api.W, api.H);
      const c = Math.floor((p.x - g.ox) / g.cell);
      const r = Math.floor((p.y - g.oy) / g.cell);
      if (r < 0 || r > 9 || c < 0 || c > 9) return;
      const cur = s.marks[r][c];
      const m = modeRef.current;
      if (m === 1) {
        // mode isi
        if (cur === 1) { s.marks[r][c] = 0; sfx.click(); }
        else if (cur === 2) { s.marks[r][c] = 0; sfx.click(); }
        else if (solutionAt(s.puzzle.grid, r, c)) {
          s.marks[r][c] = 1;
          sfx.pop(0.9 + Math.random() * 0.3);
          const x = g.ox + c * g.cell + g.cell / 2;
          const y = g.oy + r * g.cell + g.cell / 2;
          api.particles.spawn(x, y, {
            count: 6, colors: ['#fde047', '#fff7d6'], speed: [40, 160],
            life: [0.25, 0.5], size: [1.5, 3.5], gravity: 200, shape: 'circle',
          });
        } else {
          s.mistakes += 1;
          s.flashes.push({ r, c, age: 0, ok: false });
          sfx.fail();
          api.shake.add(0.4);
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, 'SALAH! Bukan bagian alatnya.', { size: 15, color: '#f87171' });
        }
      } else {
        // mode silang
        if (cur === 2) s.marks[r][c] = 0;
        else if (cur === 0) s.marks[r][c] = 2;
        sfx.click();
      }
      checkLines();
      if (checkWin(s.puzzle.grid, s.marks)) { winGame(); return; }
      push();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      for (const f of s.flashes) f.age += dt;
      s.flashes = s.flashes.filter((f) => f.age < 0.5);
      if (screenRef.current !== 'play' || s.over) {
        if (s.won) s.reveal = Math.min(1, s.reveal + dt * 1.6);
        return;
      }
      s.elapsed += dt;
      push();
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#16294d');
      bg.addColorStop(1, '#0c1830');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // garis blueprint
      ctx.strokeStyle = 'rgba(120,170,255,0.10)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(120,170,255,0.16)';
      for (let x = 0; x < W; x += 130) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 130) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // judul gambar teknik
      ctx.fillStyle = 'rgba(190,220,255,0.55)';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('📐 DENAH ALAT PROYEK — SKALA 1:1', 14, 66);
    };

    const drawSheet = (ctx: CanvasRenderingContext2D, W: number): void => {
      const g = geom(W, api.H);
      const pad = 10;
      const x = g.ox - 58 + pad / 2;
      const y = g.oy - 58 + pad / 2;
      const w = g.cell * 10 + 58 - pad;
      const h = g.cell * 10 + 58 - pad;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      const sheet = ctx.createLinearGradient(0, y, 0, y + h);
      sheet.addColorStop(0, '#f5f0e1');
      sheet.addColorStop(1, '#ddd3b8');
      ctx.fillStyle = sheet;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 14);
      else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.restore();
    };

    const drawCell = (ctx: CanvasRenderingContext2D, r: number, c: number, g: { ox: number; oy: number; cell: number }): void => {
      const { ox, oy, cell } = g;
      const x = ox + c * cell;
      const y = oy + r * cell;
      const inset = Math.max(1.5, cell * 0.06);
      const flash = s.flashes.find((f) => f.r === r && f.c === c);
      // kotak dasar
      ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(30,58,110,0.10)' : 'rgba(30,58,110,0.05)';
      ctx.fillRect(x, y, cell, cell);
      const mark = s.marks[r][c];
      if (mark === 1) {
        const pal = ART_COLORS[s.puzzle.id];
        const grad = ctx.createLinearGradient(x, y, x, y + cell);
        const revealK = s.won ? s.reveal : 1;
        const idx = Math.min(pal.length - 1, Math.floor((r + c) * 0.7) % pal.length);
        grad.addColorStop(0, pal[(idx + 1) % pal.length]);
        grad.addColorStop(1, pal[idx]);
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.65 * revealK;
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.22);
        else ctx.rect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
        ctx.fill();
        // gloss
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(x + inset + 2, y + inset + 2, cell - inset * 2 - 4, (cell - inset * 2) * 0.38, cell * 0.14);
        else ctx.rect(x + inset + 2, y + inset + 2, cell - inset * 2 - 4, (cell - inset * 2) * 0.38);
        ctx.fill();
        ctx.restore();
      } else if (mark === 2) {
        ctx.strokeStyle = 'rgba(100,116,139,0.75)';
        ctx.lineWidth = 2;
        const o = inset + 3;
        ctx.beginPath();
        ctx.moveTo(x + o, y + o);
        ctx.lineTo(x + cell - o, y + cell - o);
        ctx.moveTo(x + cell - o, y + o);
        ctx.lineTo(x + o, y + cell - o);
        ctx.stroke();
      }
      if (flash && !flash.ok) {
        const k = 1 - flash.age / 0.5;
        ctx.fillStyle = `rgba(248,113,113,${0.7 * k})`;
        ctx.fillRect(x, y, cell, cell);
      }
    };

    const drawGrid = (ctx: CanvasRenderingContext2D, g: { ox: number; oy: number; cell: number }): void => {
      const { ox, oy, cell } = g;
      const bw = cell * 10;
      for (let r = 0; r < 10; r += 1) for (let c = 0; c < 10; c += 1) drawCell(ctx, r, c, g);
      ctx.strokeStyle = 'rgba(30,58,110,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i += 1) {
        const major = i % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(20,40,90,0.8)' : 'rgba(30,58,110,0.3)';
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + bw); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + bw, oy + i * cell); ctx.stroke();
      }
      // bingkai
      ctx.strokeStyle = '#1e3a6e';
      ctx.lineWidth = 3;
      ctx.strokeRect(ox, oy, bw, bw);
    };

    const drawClues = (ctx: CanvasRenderingContext2D, g: { ox: number; oy: number; cell: number }): void => {
      const { ox, oy, cell } = g;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // baris (kiri)
      for (let r = 0; r < 10; r += 1) {
        const clue = clues.rows[r];
        const done = s.rowsDone[r];
        ctx.font = `800 ${Math.max(10, cell * 0.34)}px ${FONT}`;
        ctx.fillStyle = done ? 'rgba(74,222,128,0.9)' : '#1e3a6e';
        const txt = clue.length === 0 ? '–' : clue.join(' ');
        ctx.fillText(txt, ox - 30, oy + r * cell + cell / 2);
      }
      // kolom (atas)
      for (let c = 0; c < 10; c += 1) {
        const clue = clues.cols[c];
        const done = s.colsDone[c];
        ctx.font = `800 ${Math.max(10, cell * 0.34)}px ${FONT}`;
        ctx.fillStyle = done ? 'rgba(74,222,128,0.9)' : '#1e3a6e';
        const x = ox + c * cell + cell / 2;
        if (clue.length === 0) {
          ctx.fillText('–', x, oy - 18);
        } else {
          clue.forEach((n, i) => {
            ctx.fillText(String(n), x, oy - 16 - (clue.length - 1 - i) * (cell * 0.36));
          });
        }
      }
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      drawSheet(ctx, W);
      const g = geom(W, H);
      drawGrid(ctx, g);
      drawClues(ctx, g);
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,10,24,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: (pi: number) => void }).__reset = reset;
    (api as unknown as { __hint: () => void }).__hint = () => {
      if (screenRef.current !== 'play' || s.over) return;
      const cell = findHintCell(s.puzzle.grid, s.marks);
      if (!cell) return;
      s.marks[cell.r][cell.c] = 1;
      s.hints += 1;
      sfx.chime(2, 880);
      checkLines();
      if (checkWin(s.puzzle.grid, s.marks)) { winGame(); return; }
      push();
    };
    reset(puzzleRef.current);
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (pi: number): void => {
    sfx.ensure();
    (apiRef.current as unknown as { __reset?: (p: number) => void } | null)?.__reset?.(pi);
    setScreen('play');
  };
  const useHint = (): void => {
    sfx.ensure();
    (apiRef.current as unknown as { __hint?: () => void } | null)?.__hint?.();
  };
  const selectPuzzle = (pi: number): void => {
    puzzleRef.current = pi;
    setPzSel(pi);
    if (screenRef.current === 'play') startGame(pi);
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
    background: 'rgba(10,20,40,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const mm = Math.floor(hud.time / 60);
  const ss = Math.floor(hud.time % 60).toString().padStart(2, '0');

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 620, overflow: 'hidden', borderRadius: 18, background: '#0c1830', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,20,40,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: '#fde047' }}>{hud.puzzle}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.92 }}>
            ❌ {hud.mistakes} &nbsp;💡 {hud.hints} &nbsp;⏱ {mm}:{ss}
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

      {(screen === 'play' || screen === 'pause') && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px 14px', display: 'flex', gap: 8, zIndex: 5 }}>
          <button onClick={() => setMode(mode === 1 ? 2 : 1)} style={{ ...toolBtn, flex: 1, background: mode === 1 ? 'linear-gradient(180deg,#fde047,#f59e0b)' : 'rgba(10,20,40,0.6)', color: mode === 1 ? '#3a2a00' : '#fff' }}>
            {mode === 1 ? '✏️ Mode: ISI' : '❌ Mode: SILANG'}
          </button>
          <button onClick={useHint} style={{ ...toolBtn, flex: 1, background: 'rgba(10,20,40,0.6)', color: '#fff' }}>💡 Bocoran</button>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>📐</div>
          <h2 style={h2}>BONGKAR GAMBAR</h2>
          <p style={p}>
            Ungkap <b>pixel-art alat proyek</b> dari petunjuk angka baris &amp; kolom —
            seperti baca denah! Ketuk kotak untuk <b>mengisi</b>, ganti mode untuk <b>menyilang</b>
            yang pasti kosong. Salah isi = <b>teguran mandor</b> ❌
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            {PUZZLES.map((pz, i) => (
              <button key={pz.id} onClick={() => selectPuzzle(i)} style={{ ...pzBtn, outline: pzSel === i ? '2px solid #fde047' : 'none' }}>
                <div style={{ fontSize: 26 }}>{pz.emoji}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#fef3c7' }}>{pz.name}</div>
                <div style={{ fontSize: 10, opacity: 0.7, color: '#fef3c7' }}>{pz.difficulty}</div>
              </button>
            ))}
          </div>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best}</b></p>}
          <button style={primaryBtn} onClick={() => startGame(puzzleRef.current)}>Mulai Menggambar</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Denahnya ditutup dulu. Kopi mandor jangan sampai dingin.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>{PUZZLES[puzzleRef.current].emoji}</div>
          <h2 style={h2}>{PUZZLES[puzzleRef.current].name.toUpperCase()} TERUNGKAP!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Salah" value={String(hud.mistakes)} />
            <Stat label="Waktu" value={`${mm}:${ss}`} />
            <Stat label="Terbaik" value={String(hud.best)} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
            {PUZZLES.map((pz, i) => (
              i !== puzzleRef.current && (
                <button key={pz.id} onClick={() => startGame(i)} style={pzBtnSm}>{pz.emoji} {pz.name}</button>
              )
            ))}
          </div>
          <button style={primaryBtn} onClick={() => startGame(puzzleRef.current)}>Main Lagi</button>
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
const toolBtn: React.CSSProperties = {
  padding: '12px 10px', borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
  fontFamily: FONT, fontWeight: 900, fontSize: 14, cursor: 'pointer', backdropFilter: 'blur(6px)',
};
const pzBtn: React.CSSProperties = {
  flex: 1, padding: '10px 6px', borderRadius: 13, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
};
const pzBtnSm: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.06)', cursor: 'pointer', color: '#fff', fontFamily: FONT, fontSize: 12, fontWeight: 800,
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,14,30,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1b2f5c,#0b1526)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)', maxHeight: '92%', overflowY: 'auto' }}>
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
