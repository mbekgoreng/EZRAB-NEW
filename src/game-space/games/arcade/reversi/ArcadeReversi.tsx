/**
 * ArcadeReversi — 'Balik Triplek': Othello 8x8 melawan AI SEDANG (cukup pintar, bisa dikalahkan).
 * Ketuk sel yang berdenyut untuk menaruh keping triplek terang.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import {
  emptyBoard, legalMoves, applyMove, count, isGameOver,
  aiPickMove, BLACK, WHITE, N,
  type Board, type Move, type Cell,
} from './logic';

const SLUG = 'reversi';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;
const LW = 390;
const BOARD_PAD = 18;
const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'over';
interface Hud { black: number; white: number; turn: 'Kamu' | 'AI'; best: number; result: string }

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Anim { r: number; c: number; t: number } // flip animation progress 0..1

export default function ArcadeReversi({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const stRef = useRef<{ board: Board; moves: Move[]; turn: Cell; anims: Anim[]; last: Move | null; over: boolean; winner: string }>({
    board: emptyBoard(), moves: legalMoves(emptyBoard(), BLACK), turn: BLACK, anims: [], last: null, over: false, winner: '',
  });
  const screenRef = useRef<Screen>('ready');
  const fxRef = useRef({ t: 0 });
  const rngRef = useRef(mulberry((Date.now() % 100000) | 0));
  const [screen, setScreen] = useState<Screen>('ready');
  const [hud, setHud] = useState<Hud>({ black: 2, white: 2, turn: 'Kamu', best: getBest(bestKey(SLUG, 'best')), result: '' });
  const [muted, setMuted] = useState(false);

  const pushHudFor = (st: typeof stRef.current): void => {
    const { black, white } = count(st.board);
    setHud({
      black, white,
      turn: st.turn === BLACK ? 'Kamu' : 'AI',
      best: getBest(bestKey(SLUG, 'best')),
      result: st.winner,
    });
  };

  const cellSize = (W: number): number => (W - BOARD_PAD * 2) / N;
  const boardTop = (H: number): number => (H - N * cellSize(390)) / 2 + 10;

  const doAiTurn = (): void => {
    const api = apiRef.current;
    const st = stRef.current;
    if (st.turn !== WHITE || st.over || screenRef.current !== 'play') return;
    window.setTimeout(() => {
      if (stRef.current.turn !== WHITE || stRef.current.over || screenRef.current !== 'play') return;
      const { move } = aiPickMove(stRef.current.board, WHITE, rngRef.current);
      if (move) {
        stRef.current.board = applyMove(stRef.current.board, move, WHITE);
        stRef.current.last = move;
        stRef.current.anims = move.flips.map((f) => ({ r: f[0], c: f[1], t: 0 }));
        api?.sfx.pop(0.9);
        advanceTurn();
      } else {
        advanceTurn(); // pass
      }
    }, 650);
  };

  const finishIfOver = (): boolean => {
    const st = stRef.current;
    if (!isGameOver(st.board)) return false;
    const { black, white } = count(st.board);
    st.over = true;
    const diff = black - white;
    st.winner = diff > 0 ? 'MENANG' : diff < 0 ? 'KALAH' : 'SERI';
    if (diff > 0) {
      const best = setBest(bestKey(SLUG, 'best'), diff);
      void best;
      apiRef.current?.sfx.chime(3);
    } else {
      apiRef.current?.sfx.fail();
    }
    pushHudFor(st);
    window.setTimeout(() => setScreen('over'), 900);
    return true;
  };

  const advanceTurn = (): void => {
    const st = stRef.current;
    const next = st.turn === BLACK ? WHITE : BLACK;
    const nm = legalMoves(st.board, next);
    if (nm.length === 0) {
      const back = legalMoves(st.board, st.turn);
      if (back.length === 0) { finishIfOver(); return; }
      st.moves = back; // lawan pass, giliran tetap
    } else {
      st.turn = next;
      st.moves = nm;
    }
    pushHudFor(st);
    if (!st.over && st.turn === WHITE) doAiTurn();
  };

  const tryPlayerMove = (r: number, c: number): void => {
    const st = stRef.current;
    if (st.turn !== BLACK || st.over || screenRef.current !== 'play') return;
    const m = st.moves.find((x) => x.r === r && x.c === c);
    if (!m) return;
    st.board = applyMove(st.board, m, BLACK);
    st.last = m;
    st.anims = m.flips.map((f) => ({ r: f[0], c: f[1], t: 0 }));
    const api = apiRef.current;
    api?.sfx.pop(1.1 + Math.min(0.4, m.flips.length * 0.03));
    if (m.flips.length >= 5) api?.scores.add(195, 120, `+${m.flips.length}`, { color: '#fde68a', size: 22 });
    api?.particles.spawn(195, 120, { count: 6, colors: ['#fde68a'], speed: [60, 180], life: [0.3, 0.6], size: [2, 4] });
    advanceTurn();
  };

  const restart = (): void => {
    const b = emptyBoard();
    stRef.current = { board: b, moves: legalMoves(b, BLACK), turn: BLACK, anims: [], last: null, over: false, winner: '' };
    pushHudFor(stRef.current);
    screenRef.current = 'play';
    setScreen('play');
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    setMuted(api.sfx.muted);
    pushHudFor(stRef.current);

    api.setUpdate((dt) => {
      fxRef.current.t += dt;
      for (const a of stRef.current.anims) a.t = Math.min(1, a.t + dt * 3.2);
      stRef.current.anims = stRef.current.anims.filter((a) => a.t < 1);
    });

    api.setRender(() => {
      const st = stRef.current;
      const { ctx } = api;
      const W = api.W; const H = api.H;
      const t = fxRef.current.t;
      const cs = cellSize(W);
      const bt = boardTop(H);
      const bx = BOARD_PAD;

      // latar kayu + felt
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#3f2d1e'); bg.addColorStop(1, '#241a10');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // papan felt hijau berlapis
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24;
      const pg = ctx.createLinearGradient(bx, bt, bx, bt + N * cs);
      pg.addColorStop(0, '#2f9e5f'); pg.addColorStop(0.5, '#27a35a'); pg.addColorStop(1, '#1e7f45');
      ctx.fillStyle = pg;
      roundRect(ctx, bx - 8, bt - 8, N * cs + 16, N * cs + 16, 18);
      ctx.fill();
      ctx.restore();
      // tekstur kain halus
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 40; i += 1) {
        const px = bx + ((i * 67) % (N * cs)); const py = bt + ((i * 41) % (N * cs));
        ctx.fillRect(px, py, 2, 2);
      }
      // grid
      ctx.strokeStyle = 'rgba(20,60,35,0.55)'; ctx.lineWidth = 1.4;
      for (let i = 0; i <= N; i += 1) {
        ctx.beginPath(); ctx.moveTo(bx, bt + i * cs); ctx.lineTo(bx + N * cs, bt + i * cs); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + i * cs, bt); ctx.lineTo(bx + i * cs, bt + N * cs); ctx.stroke();
      }
      // titik sudut klasik
      ctx.fillStyle = 'rgba(20,60,35,0.7)';
      for (const [gr, gc] of [[1, 1], [1, 6], [6, 1], [6, 6]]) {
        ctx.beginPath(); ctx.arc(bx + (gc + 1) * cs, bt + (gr + 1) * cs, 3.5, 0, TAU); ctx.fill();
      }
      // highlight langkah terakhir
      if (st.last) {
        ctx.fillStyle = 'rgba(253,224,71,0.22)';
        ctx.fillRect(bx + st.last.c * cs + 2, bt + st.last.r * cs + 2, cs - 4, cs - 4);
      }

      // bidak
      for (let r = 0; r < N; r += 1) {
        for (let c = 0; c < N; c += 1) {
          const v = st.board[r][c];
          if (v === 0) continue;
          const cx = bx + c * cs + cs / 2;
          const cy = bt + r * cs + cs / 2;
          const anim = st.anims.find((a) => a.r === r && a.c === c);
          const squash = anim ? Math.abs(Math.cos(anim.t * Math.PI)) : 1;
          drawDisk(ctx, cx, cy, (cs / 2 - 4) * squash, v, t + r + c);
        }
      }

      // petunjuk langkah legal (denyut)
      if (st.turn === BLACK && !st.over && screenRef.current === 'play') {
        const pulse = 0.45 + 0.3 * Math.sin(t * 5);
        for (const m of st.moves) {
          const cx = bx + m.c * cs + cs / 2;
          const cy = bt + m.r * cs + cs / 2;
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#fde68a';
          ctx.beginPath(); ctx.arc(cx, cy, cs * 0.14, 0, TAU); ctx.fill();
          ctx.globalAlpha = pulse * 0.35;
          ctx.beginPath(); ctx.arc(cx, cy, cs * 0.3, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }

      // judul di atas papan
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `900 17px ${FONT}`;
      ctx.fillText(screenRef.current === 'play' ? (st.turn === BLACK ? 'Giliranmu — pilih titik kuning' : 'AI sedang berpikir…') : 'BALIK TRIPLEK', W / 2, bt - 22);
      ctx.restore();

      if (screenRef.current === 'ready') {
        ctx.save();
        ctx.fillStyle = 'rgba(20,12,6,0.6)'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.font = `900 34px ${FONT}`;
        ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 18;
        ctx.fillText('🪵 BALIK TRIPLEK', W / 2, H * 0.3);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#d1fae5'; ctx.font = `700 15px ${FONT}`;
        ctx.fillText('Jepit bidak putih di antara bidakmu', W / 2, H * 0.3 + 36);
        ctx.fillText('untuk membaliknya. Kuasai sudut!', W / 2, H * 0.3 + 60);
        const pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fde68a'; ctx.font = `900 18px ${FONT}`;
        ctx.fillText('KETUK UNTUK MULAI', W / 2, H * 0.3 + 104);
        ctx.restore();
      }
    });

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current === 'ready') {
        restart();
        return;
      }
      if (screenRef.current !== 'play') return;
      const W = api.W; const H = api.H;
      const cs = cellSize(W);
      const bt = boardTop(H);
      const c = Math.floor((p.x - BOARD_PAD) / cs);
      const r = Math.floor((p.y - bt) / cs);
      if (r >= 0 && r < N && c >= 0 && c < N) tryPlayerMove(r, c);
    };

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__reversi = {
        get screen() { return screenRef.current; },
        get board() { return stRef.current.board.map((row) => [...row]); },
        get turn() { return stRef.current.turn; },
        get over() { return stRef.current.over; },
        get winner() { return stRef.current.winner; },
        start() { restart(); },
        playFirstLegal() {
          const st = stRef.current;
          const m = st.moves[0];
          if (m) tryPlayerMove(m.r, m.c);
        },
        autoPlay(maxMoves = 120) {
          let n = 0;
          const step = (): void => {
            const st = stRef.current;
            if (st.over || n >= maxMoves) return;
            if (st.turn === BLACK && st.moves.length > 0) {
              const m = st.moves[((Math.random() * st.moves.length) | 0)];
              tryPlayerMove(m.r, m.c);
            }
            n += 1;
            window.setTimeout(step, 700);
          };
          step();
        },
      };
    }
    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__reversi;
    };
  });

  const toggleMute = (): void => {
    apiRef.current?.sfx.ensure();
    setMuted(apiRef.current?.sfx.toggleMute() ?? false);
  };
  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: FONT,
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#241a10', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>🪵 {hud.black}</div>
        <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>🟫 {hud.white}</div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#fde68a', fontWeight: 800, fontSize: 13 }}>🏅 {hud.best}</div>
        <div style={{ flex: 1 }} />
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>{hud.result === 'MENANG' ? '🏆' : hud.result === 'SERI' ? '🤝' : '🤖'}</div>
          <h2 style={titleStyle}>{hud.result === 'MENANG' ? 'KAMU MENANG!' : hud.result === 'SERI' ? 'SERI!' : 'AI MENANG'}</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            🪵 {hud.black} — 🟫 {hud.white}
            {hud.result === 'MENANG' && hud.black - hud.white >= hud.best && hud.best > 0 && (
              <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>
            )}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={() => { apiRef.current?.sfx.ensure(); restart(); }}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/** Bidak 3D: gradasi radial + highlight + bayangan. */
function drawDisk(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: 1 | 2, t: number): void {
  if (r <= 1) return;
  ctx.save();
  // bayangan
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, r, r * 0.9, 0, 0, TAU); ctx.fill();
  // keping triplek (v1 = triplek terang milikmu, v2 = papan kayu gelap AI)
  const s = r * 1.7;
  const g = ctx.createLinearGradient(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2);
  if (v === 1) {
    g.addColorStop(0, '#f3d894'); g.addColorStop(0.55, '#e3b96a'); g.addColorStop(1, '#b98a3e');
  } else {
    g.addColorStop(0, '#8a613c'); g.addColorStop(0.55, '#64431f'); g.addColorStop(1, '#3c2510');
  }
  ctx.fillStyle = g;
  roundRect(ctx, cx - s / 2, cy - s / 2, s, s, 5);
  ctx.fill();
  // serat kayu
  ctx.strokeStyle = v === 1 ? 'rgba(120,75,25,0.35)' : 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx - s / 2 + 4, cy + i * s * 0.22);
    ctx.bezierCurveTo(cx - s * 0.15, cy + i * s * 0.22 - 3, cx + s * 0.15, cy + i * s * 0.22 + 3, cx + s / 2 - 4, cy + i * s * 0.22);
    ctx.stroke();
  }
  // paku di sudut
  ctx.fillStyle = v === 1 ? 'rgba(90,60,20,0.6)' : 'rgba(0,0,0,0.55)';
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath(); ctx.arc(cx + dx * (s / 2 - 5), cy + dy * (s / 2 - 5), 1.8, 0, TAU); ctx.fill();
  }
  // kilau
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(cx - s / 2 + 3, cy - s / 2 + 3, s - 6, 3);
  void t;
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0', textShadow: '0 2px 12px rgba(34,197,94,0.5)', letterSpacing: 1 };
const textStyle: React.CSSProperties = { color: '#e2e8f0', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 300 };
const primaryBtn: React.CSSProperties = { background: 'linear-gradient(135deg,#22c55e,#4ade80)', color: '#052e16', fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14, padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT, boxShadow: '0 6px 20px rgba(34,197,94,0.4)' };
const secondaryBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT };
function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(20,12,6,0.72)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      {children}
    </div>
  );
}
