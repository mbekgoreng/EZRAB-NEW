/**
 * ArcadeSambungPipa ("Sambung Pipa") — sambungkan 4 segmen pipa sewarna
 * dalam satu garis melawan Mandor AI. Pipa biru (PVC) vs pipa oranye (HDPE).
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, sfx } from '../../../engine2d';
import { bestKey, getJson, setJson } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  createBoard, dropPiece, dropRow, isWinningMove, isFull, legalColumns,
  aiChooseColumn, COLS, ROWS, other, type Board, type Player, type Cell,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('sambung-pipa', 'tercepat'); // rekor: kemenangan dengan langkah paling sedikit
const P1 = '#3b82f6'; // pipa PVC biru
const P2 = '#f97316'; // pipa HDPE oranye

type Screen = 'tutorial' | 'play' | 'pause' | 'over';
type Phase = 'idle' | 'drop' | 'aiWait';

interface Fall { col: number; row: number; player: Player; y: number; vy: number; }
interface WinCell { c: number; r: number; }

interface S {
  board: Board;
  fall: Fall | null;
  turn: Player; // 1 = pemain, 2 = AI
  phase: Phase;
  aiWait: number;
  moves: number; // langkah pemain
  winner: Player | 'draw' | null;
  winCells: WinCell[];
  hoverCol: number;
  t: number;
}

/** Telusuri garis kemenangan dari langkah terakhir, kembalikan sel-selnya. */
function winCellsOf(board: Board, col: number, row: number, player: Player): WinCell[] {
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    const cells: WinCell[] = [{ c: col, r: row }];
    for (const s of [1, -1] as const) {
      let c = col + dx * s; let r = row + dy * s;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[r][c] === player) {
        cells.push({ c, r });
        c += dx * s; r += dy * s;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

export default function ArcadeSambungPipa({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ turn: 1 as Player, moves: 0, best: getJson<number>(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      board: createBoard(), fall: null, turn: 1, phase: 'idle', aiWait: 0,
      moves: 0, winner: null, winCells: [], hoverCol: -1, t: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const geom = (): { bx: number; by: number; cell: number } => {
      const cell = Math.min((api.W - 44) / COLS, (api.H * 0.62) / ROWS, 62);
      const bw = cell * COLS;
      const bx = (api.W - bw) / 2;
      const by = api.H * 0.30;
      return { bx, by, cell };
    };

    const push = (): void => {
      api.pushHud({ turn: s.turn, moves: s.moves, best: getJson<number>(BK, 0) });
    };

    const reset = (): void => {
      s.board = createBoard();
      s.fall = null; s.turn = 1; s.phase = 'idle'; s.aiWait = 0;
      s.moves = 0; s.winner = null; s.winCells = []; s.hoverCol = -1;
      push();
    };

    const finish = (winner: Player | 'draw', col: number, row: number, player: Player): void => {
      s.winner = winner;
      if (winner === 1) {
        s.winCells = winCellsOf(s.board, col, row, player);
        sfx.chime(4);
        api.shake.add(0.55);
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, '🚰 PIPA TERSAMBUNG!', { size: 30, color: '#7dd3fc' });
        const { bx, by, cell } = geom();
        api.particles.spawn(api.W / 2, by + cell * 2, {
          count: 70, colors: ['#7dd3fc', '#38bdf8', '#ffffff', '#0ea5e9'],
          speed: [120, 420], life: [0.5, 1.2], size: [2, 6], gravity: 500, shape: 'spark', rotation: true,
        });
        const prev = getJson<number>(BK, 0);
        if (prev === 0 || s.moves < prev) setJson(BK, s.moves);
        if (wrap) window.setTimeout(() => popText(wrap, `⏱ ${s.moves} langkah — rekor!`, { size: 18, color: '#fde047' }), 900);
      } else if (winner === 2) {
        s.winCells = winCellsOf(s.board, col, row, player);
        sfx.fail();
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, '😤 Mandor AI menang...', { size: 24, color: '#fb923c' });
        api.shake.add(0.7);
      } else {
        sfx.click();
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, '😐 Pipa buntu — seri!', { size: 24, color: '#e2e8f0' });
      }
      window.setTimeout(() => {
        push();
        setScreen('over');
      }, 1500);
    };

    /** Dipanggil saat keping mendarat. */
    const land = (): void => {
      const f = s.fall;
      if (!f) return;
      s.fall = null;
      sfx.thud(0.9);
      const { bx, by, cell } = geom();
      api.particles.spawn(bx + (f.col + 0.5) * cell, by + (f.row + 0.5) * cell, {
        count: 12, colors: f.player === 1 ? ['#7dd3fc', '#0ea5e9'] : ['#fdba74', '#ea580c'],
        speed: [60, 220], life: [0.25, 0.6], size: [2, 4], gravity: 420, shape: 'circle',
      });
      if (isWinningMove(s.board, f.col, f.row, f.player)) {
        s.phase = 'idle';
        finish(f.player, f.col, f.row, f.player);
        return;
      }
      if (isFull(s.board)) {
        s.phase = 'idle';
        finish('draw', f.col, f.row, f.player);
        return;
      }
      const next: Player = other(f.player);
      s.turn = next;
      if (next === 2) { s.phase = 'aiWait'; s.aiWait = 0.5 + rng() * 0.5; }
      else { s.phase = 'idle'; sfx.click(); }
      push();
    };

    const tryDrop = (col: number, player: Player): boolean => {
      if (s.phase !== 'idle' || s.fall || s.winner) return false;
      const res = dropPiece(s.board, col, player);
      if (!res) { sfx.click(); return false; }
      const { by, cell } = geom();
      s.fall = {
        col, row: res.row, player,
        y: by - cell * 0.9, vy: 0,
      };
      s.phase = 'drop';
      sfx.whoosh();
      if (player === 1) s.moves += 1;
      push();
      return true;
    };

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.winner) return;
      if (s.turn !== 1) return;
      const { bx, by, cell } = geom();
      const col = Math.floor((p.x - bx) / cell);
      if (p.y < by - cell * 1.4 || p.y > by + ROWS * cell) return;
      if (col >= 0 && col < COLS) tryDrop(col, 1);
    };

    api.input.onMove = (p) => {
      if (screenRef.current !== 'play') return;
      const { bx, cell } = geom();
      const col = Math.floor((p.x - bx) / cell);
      s.hoverCol = col >= 0 && col < COLS ? col : -1;
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play') return;
      s.t += dt;
      if (s.phase === 'drop' && s.fall) {
        const { by, cell } = geom();
        const target = by + (s.fall.row + 0.5) * cell;
        s.fall.vy += 3400 * dt;
        s.fall.y += s.fall.vy * dt;
        if (s.fall.y >= target) {
          s.fall.y = target;
          land();
        }
      } else if (s.phase === 'aiWait') {
        s.aiWait -= dt;
        if (s.aiWait <= 0) {
          s.phase = 'idle'; // tryDrop mensyaratkan phase 'idle'
          const col = aiChooseColumn(s.board, 2, rng);
          if (col < 0) finish('draw', 0, 0, 1);
          else if (!tryDrop(col, 2)) { s.turn = 1; push(); }
        }
      }
      push();
    });

    /* ---------------- rendering ---------------- */

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      // dinding blueprint proyek
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#16324f');
      g.addColorStop(0.55, '#10273d');
      g.addColorStop(1, '#0a1a2b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // grid blueprint
      ctx.strokeStyle = 'rgba(125,211,252,0.07)';
      ctx.lineWidth = 1;
      for (let x = 20; x < W; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 20; y < H; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // siluet pipa besar di belakang
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.moveTo(-20, H * 0.86); ctx.quadraticCurveTo(W * 0.4, H * 0.98, W * 0.7, H * 0.80); ctx.lineTo(W + 20, H * 0.84); ctx.stroke();
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(W + 20, H * 0.14); ctx.quadraticCurveTo(W * 0.6, H * 0.02, W * 0.25, H * 0.16); ctx.stroke();
      ctx.restore();
      // debu semen melayang
      ctx.fillStyle = 'rgba(186,230,253,0.16)';
      for (let i = 0; i < 14; i += 1) {
        const px = ((i * 97 + s.t * 12) % (W + 40)) - 20;
        const py = (i * 83 + s.t * 8) % H;
        ctx.beginPath(); ctx.arc(px, py, 1.7, 0, TAU); ctx.fill();
      }
    };

    const drawFrame = (ctx: CanvasRenderingContext2D): void => {
      const { bx, by, cell } = geom();
      const bw = cell * COLS; const bh = cell * ROWS;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 12;
      const metal = ctx.createLinearGradient(0, by, 0, by + bh);
      metal.addColorStop(0, '#475569');
      metal.addColorStop(0.5, '#334155');
      metal.addColorStop(1, '#1e293b');
      ctx.fillStyle = metal;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx - 10, by - 10, bw + 20, bh + 20, 20);
      else ctx.rect(bx - 10, by - 10, bw + 20, bh + 20);
      ctx.fill();
      ctx.restore();
      // baut di 4 sudut
      ctx.fillStyle = '#94a3b8';
      for (const [ox, oy] of [[-2, -2], [bw + 2, -2], [-2, bh + 2], [bw + 2, bh + 2]] as const) {
        ctx.beginPath(); ctx.arc(bx + ox, by + oy, 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx + ox - 3, by + oy); ctx.lineTo(bx + ox + 3, by + oy); ctx.stroke();
      }
    };

    /** Segmen pipa berlapis: ring baja + cakram berwarna + highlight. */
    const drawPipe = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, player: Player, glow: boolean): void => {
      ctx.save();
      if (glow) {
        const pulse = 0.6 + 0.4 * Math.sin(s.t * 8);
        ctx.shadowColor = player === 1 ? 'rgba(56,189,248,0.95)' : 'rgba(249,115,22,0.95)';
        ctx.shadowBlur = 26 * pulse;
      }
      // ring baja luar
      const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      ring.addColorStop(0, '#64748b');
      ring.addColorStop(0.45, '#cbd5e1');
      ring.addColorStop(0.6, '#94a3b8');
      ring.addColorStop(1, '#334155');
      ctx.fillStyle = ring;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      // alur ulir pada ring
      ctx.strokeStyle = 'rgba(15,23,42,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, TAU); ctx.stroke();
      // cakram pipa berwarna
      const ir = r * 0.72;
      const disc = ctx.createRadialGradient(x - ir * 0.35, y - ir * 0.4, ir * 0.15, x, y, ir);
      const c1 = player === 1 ? P1 : P2;
      disc.addColorStop(0, '#ffffff');
      disc.addColorStop(0.18, player === 1 ? '#bfdbfe' : '#fed7aa');
      disc.addColorStop(0.55, c1);
      disc.addColorStop(1, player === 1 ? '#1d4ed8' : '#c2410c');
      ctx.fillStyle = disc;
      ctx.beginPath(); ctx.arc(x, y, ir, 0, TAU); ctx.fill();
      // lubang pipa tengah
      const hole = ctx.createRadialGradient(x, y, 1, x, y, ir * 0.38);
      hole.addColorStop(0, '#020617');
      hole.addColorStop(0.8, '#0f172a');
      hole.addColorStop(1, 'rgba(15,23,42,0)');
      ctx.fillStyle = hole;
      ctx.beginPath(); ctx.arc(x, y, ir * 0.38, 0, TAU); ctx.fill();
      // kilau
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(x - ir * 0.32, y - ir * 0.42, ir * 0.26, ir * 0.13, -0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    const drawSocket = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
      // soket kosong tempat pipa akan masuk
      const sock = ctx.createRadialGradient(x, y, 2, x, y, r);
      sock.addColorStop(0, '#020617');
      sock.addColorStop(0.75, '#0f172a');
      sock.addColorStop(1, '#1e293b');
      ctx.fillStyle = sock;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.stroke();
    };

    api.setRender(() => {
      const { ctx, W } = api;
      const { bx, by, cell } = geom();
      ctx.save();

      drawBackground(ctx, W, api.H);
      drawFrame(ctx);
      // panah indikator kolom (giliran pemain)
      if (screenRef.current === 'play' && s.turn === 1 && !s.winner && s.hoverCol >= 0 && legalColumns(s.board).includes(s.hoverCol)) {
        const bob = Math.sin(s.t * 5) * 5;
        const ax = bx + (s.hoverCol + 0.5) * cell;
        ctx.fillStyle = 'rgba(125,211,252,0.9)';
        ctx.beginPath();
        ctx.moveTo(ax - 10, by - 34 + bob);
        ctx.lineTo(ax + 10, by - 34 + bob);
        ctx.lineTo(ax, by - 18 + bob);
        ctx.closePath(); ctx.fill();
        // bayangan hantu pipa
        ctx.save();
        ctx.globalAlpha = 0.45;
        drawPipe(ctx, ax, by - cell * 0.75, cell * 0.40, 1, false);
        ctx.restore();
      }
      // papan
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const x = bx + (c + 0.5) * cell;
          const y = by + (r + 0.5) * cell;
          const v: Cell = s.board[r][c];
          const isFallingCell = s.fall !== null && s.fall.col === c && s.fall.row === r;
          if (v === 0) {
            drawSocket(ctx, x, y, cell * 0.44);
          } else if (!isFallingCell) {
            const glow = s.winCells.some((w) => w.c === c && w.r === r);
            drawPipe(ctx, x, y, cell * 0.44, v as Player, glow);
          } else {
            drawSocket(ctx, x, y, cell * 0.44);
          }
        }
      }
      // keping yang sedang jatuh
      if (s.fall) {
        const f = s.fall;
        const x = bx + (f.col + 0.5) * cell;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;
        drawPipe(ctx, x, f.y, cell * 0.44, f.player, false);
        ctx.restore();
      }
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, api.H / 2, Math.min(W, api.H) * 0.42, W / 2, api.H / 2, Math.max(W, api.H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(2,6,23,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, api.H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    api?.sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
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
    if (api) sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (api && api.sfx.muted !== next) api.sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(8,20,35,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const best = hud.best;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0a1a2b', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(8,20,35,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 132 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {hud.turn === 1 ? '🔵 Giliranmu (PVC)' : '🟠 Mandor AI berpikir…'}
          </div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            Langkah: <b>{hud.moves}</b>
            {best > 0 && <span style={{ color: '#fde047' }}> • 🏆 {best}</span>}
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

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🚰</div>
          <h2 style={h2}>SAMBUNG PIPA</h2>
          <p style={p}>
            <b>Ketuk kolom</b> untuk menjatuhkan segmen pipa PVC birumu.
            <b> Sambungkan 4</b> dalam garis (mendatar, tegak, atau diagonal)
            sebelum Mandor AI menyambung pipa HDPE oranyenya!
          </p>
          {best > 0 && <p style={p}>Kemenangan tercepat: <b style={{ color: '#fde047' }}>{best} langkah</b></p>}
          <button style={primaryBtn} onClick={startGame}>Pasang Pipa</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Tukangnya ikut istirahat. Pipanya ditunggu mandor.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🚰</div>
          <h2 style={h2}>SELESAI</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#7dd3fc' }}>{hud.moves} langkah</div>
          {best > 0 && <p style={p}>Rekor tercepat: <b style={{ color: '#fde047' }}>{best} langkah</b></p>}
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#7dd3fc', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0f2fe' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#7dd3fc,#0284c7)', color: '#082f49', boxShadow: '0 8px 20px rgba(2,132,199,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#7dd3fc', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#16324f,#0a1a2b)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}


