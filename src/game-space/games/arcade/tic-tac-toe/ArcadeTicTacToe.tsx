/**
 * ArcadeTicTacToe ("Bata vs Semen") — X = Bata 🧱, O = Semen.
 * Mode: vs AI Sedang (bisa dikalahkan) atau 2 Pemain lokal.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, sfx, TAU, clamp, easeOutBack } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { emptyBoard, winner, isFull, place, aiOpening, type Board, type Mark } from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('bata-vs-semen', 'streak');

type Screen = 'tutorial' | 'play' | 'pause' | 'round';
type Mode = 'ai' | '2p';

interface S {
  board: Board;
  turn: Mark;
  mode: Mode;
  placedAt: number[];   // waktu animasi per sel (-1 = kosong)
  win: { mark: Mark; line: number[] } | null;
  draw: boolean;
  round: number;
  xWins: number;
  oWins: number;
  draws: number;
  streak: number;       // rentetan menang vs AI
  aiThinking: number;   // countdown detik sebelum AI jalan, -1 = tidak
  t: number;
}

export default function ArcadeTicTacToe({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const modeRef = useRef<Mode>('ai');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [mode, setModeState] = useState<Mode>('ai');
  const [hud, setHud] = useState({ x: 0, o: 0, d: 0, turn: 'X' as Mark, streak: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const setMode = (m: Mode): void => {
    modeRef.current = m;
    setModeState(m);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      board: emptyBoard(), turn: 'X', mode: 'ai',
      placedAt: Array(9).fill(-1), win: null, draw: false,
      round: 0, xWins: 0, oWins: 0, draws: 0, streak: 0, aiThinking: -1, t: 0,
    };

    const push = (): void => {
      api.pushHud({ x: s.xWins, o: s.oWins, d: s.draws, turn: s.turn, streak: s.streak, best: getBest(BK, 0) });
    };

    const newRound = (first: Mark = 'X'): void => {
      s.board = emptyBoard();
      s.placedAt = Array(9).fill(-1);
      s.turn = first;
      s.win = null;
      s.draw = false;
      s.aiThinking = -1;
      s.round += 1;
      push();
    };

    const resetAll = (): void => {
      s.xWins = 0; s.oWins = 0; s.draws = 0; s.streak = 0; s.round = 0;
      newRound();
    };

    const finishRound = (): void => {
      const w = winner(s.board);
      s.win = w;
      if (w) {
        if (w.mark === 'X') {
          s.xWins += 1;
          api.sfx.chime(3, 620);
          const label = s.mode === 'ai' ? '🧱 BATA MENANG!' : '🧱 BATA (P1) MENANG!';
          if (wrapRef.current) popText(wrapRef.current, label, { size: 26, color: '#fdba74' });
          if (s.mode === 'ai') {
            s.streak += 1;
            const nb = setBest(BK, s.streak);
            api.pushHud({ x: s.xWins, o: s.oWins, d: s.draws, turn: s.turn, streak: s.streak, best: nb });
          }
        } else {
          s.oWins += 1;
          api.sfx.thud(0.9);
          const label = s.mode === 'ai' ? 'SEMEN MENANG! 😅' : 'SEMEN (P2) MENANG!';
          if (wrapRef.current) popText(wrapRef.current, label, { size: 26, color: '#d1d5db' });
          if (s.mode === 'ai') s.streak = 0;
        }
        const { x, y } = cellCenter(w.line[1], api.W, api.H);
        api.particles.spawn(x, y, {
          count: 46, colors: w.mark === 'X' ? ['#fdba74', '#fde047', '#c2410c'] : ['#e5e7eb', '#9ca3af', '#f8fafc'],
          speed: [80, 300], life: [0.5, 1.1], size: [2, 6], gravity: 420, shape: 'rect', rotation: true,
        });
        api.shake.add(4);
      } else if (isFull(s.board)) {
        s.draw = true;
        s.draws += 1;
        api.sfx.click();
        if (wrapRef.current) popText(wrapRef.current, '🤝 SERI! Adukan rata.', { size: 24, color: '#e2e8f0' });
      }
      push();
      window.setTimeout(() => {
        if (screenRef.current === 'play') setScreen('round');
      }, 1400);
    };

    const humanMove = (i: number): void => {
      if (s.win || s.draw || s.aiThinking >= 0) return;
      if (s.mode === 'ai' && s.turn !== 'X') return;
      const nb = place(s.board, i, s.turn);
      if (!nb) { api.sfx.click(); return; }
      s.board = nb;
      s.placedAt[i] = s.t;
      api.sfx.pop(s.turn === 'X' ? 1 : 0.75);
      const w = winner(s.board);
      if (w || isFull(s.board)) { finishRound(); return; }
      s.turn = s.turn === 'X' ? 'O' : 'X';
      if (s.mode === 'ai' && s.turn === 'O') s.aiThinking = 0.5;
      push();
    };

    // geometri papan
    const boardGeom = (W: number, H: number): { x: number; y: number; cell: number } => {
      const topPad = 84;
      const botPad = 84;
      const size = Math.min(W - 48, H - topPad - botPad, 420);
      const cell = size / 3;
      return { x: (W - size) / 2, y: topPad + (H - topPad - botPad - size) / 2, cell };
    };
    const cellCenter = (i: number, W: number, H: number): { x: number; y: number } => {
      const g = boardGeom(W, H);
      const cx = i % 3; const cy = Math.floor(i / 3);
      return { x: g.x + (cx + 0.5) * g.cell, y: g.y + (cy + 0.5) * g.cell };
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play') return;
      const g = boardGeom(api.W, api.H);
      const cx = Math.floor((p.x - g.x) / g.cell);
      const cy = Math.floor((p.y - g.y) / g.cell);
      if (cx < 0 || cx > 2 || cy < 0 || cy > 2) return;
      humanMove(cy * 3 + cx);
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape') || api.input.wasPressed('KeyP')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      // keyboard 1-9
      for (let k = 1; k <= 9; k += 1) {
        if (api.input.wasPressed(`Digit${k}`) || api.input.wasPressed(`Numpad${k}`)) {
          if (screenRef.current === 'play') humanMove(k - 1);
        }
      }
      if (screenRef.current !== 'play') return;
      s.t += dt;
      if (s.aiThinking >= 0 && !s.win && !s.draw) {
        s.aiThinking -= dt;
        if (s.aiThinking < 0) {
          const mv = aiOpening(s.board);
          const nb = place(s.board, mv, 'O');
          if (nb) {
            s.board = nb;
            s.placedAt[mv] = s.t;
            api.sfx.pop(0.7);
          }
          const w = winner(s.board);
          if (w || isFull(s.board)) { finishRound(); return; }
          s.turn = 'X';
          push();
        }
      }
    });

    /* ---------- render ---------- */
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1c130a');
      g.addColorStop(0.5, '#241a0e');
      g.addColorStop(1, '#120c05');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(253,186,116,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // tumpukan karung semen di pojok
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i += 1) {
        const sx = 26 + i * 8; const sy = H - 40 - i * 26;
        const sg = ctx.createLinearGradient(sx, sy - 22, sx, sy);
        sg.addColorStop(0, '#d6d3d1'); sg.addColorStop(1, '#78716c');
        ctx.fillStyle = sg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(sx - 34, sy - 22, 68, 24, 8);
        else ctx.rect(sx - 34, sy - 22, 68, 24);
        ctx.fill();
        ctx.fillStyle = 'rgba(68,64,60,0.8)';
        ctx.font = '900 9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('SEMEN', sx, sy - 8);
      }
      ctx.restore();
    };

    const drawGrid = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = boardGeom(W, H);
      // alas papan adukan
      const bg = ctx.createLinearGradient(0, g.y, 0, g.y + g.cell * 3);
      bg.addColorStop(0, '#3d3a35'); bg.addColorStop(1, '#2b2925');
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(g.x - 10, g.y - 10, g.cell * 3 + 20, g.cell * 3 + 20, 18);
      else ctx.rect(g.x - 10, g.y - 10, g.cell * 3 + 20, g.cell * 3 + 20);
      ctx.fill();
      // garis balok baja
      for (let i = 1; i < 3; i += 1) {
        for (const [x1, y1, x2, y2] of [
          [g.x + i * g.cell, g.y - 6, g.x + i * g.cell, g.y + g.cell * 3 + 6],
          [g.x - 6, g.y + i * g.cell, g.x + g.cell * 3 + 6, g.y + i * g.cell],
        ] as number[][]) {
          const steel = ctx.createLinearGradient(x1, y1, x2, y2);
          steel.addColorStop(0, '#6b7280'); steel.addColorStop(0.5, '#d1d5db'); steel.addColorStop(1, '#4b5563');
          ctx.strokeStyle = steel; ctx.lineWidth = 9; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x1 - 2, y1); ctx.lineTo(x2 - 2, y2); ctx.stroke();
        }
      }
    };

    const drawBrick = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, age: number): void => {
      const pop = easeOutBack(clamp(age / 0.22, 0, 1));
      const sc = Math.max(0.01, pop);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.rotate(-Math.PI / 4);
      const w = r * 1.15; const h = r * 1.15;
      const g = ctx.createLinearGradient(-w, -h, w, h);
      g.addColorStop(0, '#fdba74'); g.addColorStop(0.5, '#ea580c'); g.addColorStop(1, '#9a3412');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-w, -h / 2.6, w * 2, h / 1.3, 7);
      else ctx.rect(-w, -h / 2.6, w * 2, h / 1.3);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-w, -h / 2.6, w * 2, h / 1.3, 7);
      else ctx.rect(-w, -h / 2.6, w * 2, h / 1.3);
      ctx.clip();
      ctx.strokeStyle = 'rgba(67,20,7,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -h / 2.6); ctx.lineTo(0, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, h / 2.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h / 2.6); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-w, -h / 2.6, w * 2, 5);
      ctx.restore();
      ctx.rotate(Math.PI / 2);
      const g2 = ctx.createLinearGradient(-w, -h, w, h);
      g2.addColorStop(0, '#fdba74'); g2.addColorStop(0.5, '#ea580c'); g2.addColorStop(1, '#9a3412');
      ctx.fillStyle = g2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-w, -h / 2.6, w * 2, h / 1.3, 7);
      else ctx.rect(-w, -h / 2.6, w * 2, h / 1.3);
      ctx.fill();
      ctx.restore();
    };

    const drawCement = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, age: number): void => {
      const pop = easeOutBack(clamp(age / 0.22, 0, 1));
      const sc = Math.max(0.01, pop);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
      g.addColorStop(0, '#f5f5f4'); g.addColorStop(0.55, '#d6d3d1'); g.addColorStop(1, '#78716c');
      ctx.strokeStyle = g; ctx.lineWidth = r * 0.42;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.stroke();
      // bintik semen
      ctx.fillStyle = 'rgba(87,83,78,0.5)';
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * TAU + 0.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, -2.4, -1.2); ctx.stroke();
      ctx.restore();
    };

    const drawWinLine = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      if (!s.win) return;
      const a = cellCenter(s.win.line[0], W, H);
      const b2 = cellCenter(s.win.line[2], W, H);
      const ang = Math.atan2(b2.y - a.y, b2.x - a.x);
      const len = Math.hypot(b2.x - a.x, b2.y - a.y);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(ang);
      const ext = 26;
      // pita ukur kuning-hitam berjalan
      ctx.fillStyle = 'rgba(253,224,71,0.22)';
      ctx.fillRect(-ext, -14, len + ext * 2, 28);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-ext, -9, len + ext * 2, 18);
      ctx.save();
      ctx.beginPath(); ctx.rect(-ext, -9, len + ext * 2, 18); ctx.clip();
      ctx.fillStyle = '#1c1917';
      const off = (s.t * 70) % 36;
      for (let x = -ext - 36 + off; x < len + ext; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 9); ctx.lineTo(x + 18, 9); ctx.lineTo(x + 9, -9); ctx.lineTo(x - 9, -9);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      // shake sudah di-apply otomatis oleh useGameCanvas — jangan double
      drawBackground(ctx, W, H);
      drawGrid(ctx, W, H);
      const g = boardGeom(W, H);
      for (let i = 0; i < 9; i += 1) {
        const m = s.board[i];
        if (!m) continue;
        const cx = i % 3; const cy = Math.floor(i / 3);
        const x = g.x + (cx + 0.5) * g.cell;
        const y = g.y + (cy + 0.5) * g.cell;
        const age = s.placedAt[i] < 0 ? 9 : s.t - s.placedAt[i];
        const r = g.cell * 0.30;
        if (m === 'X') drawBrick(ctx, x, y, r, age);
        else drawCement(ctx, x, y, r, age);
      }
      drawWinLine(ctx, W, H);
      ctx.restore();
      // giliran siapa — di bawah papan
      if (screenRef.current === 'play' && !s.win && !s.draw) {
        const g2 = boardGeom(W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `800 13px ${FONT}`;
        ctx.textAlign = 'center';
        const label = s.mode === 'ai'
          ? (s.turn === 'X' ? '🧱 Giliranmu (Bata)' : '⏳ Semen mikir…')
          : (s.turn === 'X' ? '🧱 Giliran Bata (P1)' : '⚪ Giliran Semen (P2)');
        ctx.fillText(label, W / 2, g2.y + g2.cell * 3 + 34);
      }
    });

    (api as unknown as { __reset: () => void }).__reset = resetAll;
    (api as unknown as { __mode: (m: Mode) => void }).__mode = (m: Mode) => { s.mode = m; resetAll(); };
    resetAll();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (m: Mode): void => {
    sfx.ensure();
    setMode(m);
    const api = apiRef.current;
    (api as unknown as { __mode?: (x: Mode) => void } | null)?.__mode?.(m);
    setScreen('play');
  };
  const nextRound = (): void => {
    sfx.ensure();
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
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(20,12,5,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#1c130a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(20,12,5,0.62)', border: '1px solid rgba(253,186,116,0.3)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>
            <span style={{ color: '#fdba74' }}>🧱 {hud.x}</span>
            <span style={{ opacity: 0.5, margin: '0 6px' }}>•</span>
            <span style={{ color: '#d6d3d1' }}>⚪ {hud.o}</span>
            <span style={{ opacity: 0.5, margin: '0 6px' }}>•</span>
            <span style={{ opacity: 0.7 }}>🤝 {hud.d}</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            {mode === 'ai' ? `🔥 Streak: ${hud.streak} • ⭐ ${hud.best}` : '👥 2 Pemain'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {screen === 'play' && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">⏸</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🧱⚪</div>
          <h2 style={h2}>BATA vs SEMEN</h2>
          <p style={p}>
            Kamu <b>🧱 Bata</b>, lawanmu <b>⚪ Semen</b>. Buat <b>3 sejajar</b> duluan — baris, kolom, atau diagonal!
            AI <b>Sedang</b> kadang lengah, jadi bisa dikalahkan. Ketuk petak atau tekan 1–9.
          </p>
          <button style={primaryBtn} onClick={() => startGame('ai')}>🧱 Lawan Semen (AI Sedang)</button>
          <button style={ghostBtn} onClick={() => startGame('2p')}>👥 2 Pemain (1 HP)</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>ISTIRAHAT</h2>
          <p style={p}>Adukan semennya ditutup plastik dulu biar tidak kering.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'round' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏗️</div>
          <h2 style={h2}>RONDE SELESAI</h2>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="🧱 Bata" value={`${hud.x}`} />
            <Stat label="⚪ Semen" value={`${hud.o}`} />
            <Stat label="🤝 Seri" value={`${hud.d}`} />
          </div>
          {mode === 'ai' && hud.streak >= 2 && (
            <p style={p}>🔥 Rentetan menang: <b style={{ color: '#fde047' }}>{hud.streak}x</b> — mandor bangga!</p>
          )}
          <button style={primaryBtn} onClick={nextRound}>Ronde Berikutnya</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fdba74', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#fef3c7' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fdba74,#ea580c)', color: '#431407', boxShadow: '0 8px 20px rgba(234,88,12,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fdba74', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,9,3,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#2c2010,#140d05)', border: '1px solid rgba(253,186,116,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#fef3c7' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
