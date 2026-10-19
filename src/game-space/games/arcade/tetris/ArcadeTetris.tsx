/**
 * ArcadeTetris ("Susun Bata") — tetromino ber-texture material bangunan.
 * Susun baris penuh jadi dinding kokoh; level naik -> gravitasi makin cepat.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, sfx, TAU } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  COLS, ROWS, MATERIALS, bag7, collides, clearLines, emptyBoard,
  gravityMs, levelFor, merge, rotate, scoreFor, spawnPiece,
  type ActivePiece, type Board, type PieceKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('susun-bata', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  board: Board;
  cur: ActivePiece;
  bag: PieceKind[];
  ghostY: number;
  score: number;
  lines: number;
  level: number;
  acc: number;      // akumulasi gravitasi (ms)
  dasT: number;     // delay auto shift
  repT: number;     // repeat timer
  dir: -1 | 0 | 1;  // arah tahan
  over: boolean;
  t: number;
}

const ACTIONS = ['left', 'right', 'rotate', 'soft', 'hard'] as const;
type Action = typeof ACTIONS[number];

export default function ArcadeTetris({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, lines: 0, level: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      board: emptyBoard(), cur: spawnPiece('T'), bag: [],
      ghostY: 0, score: 0, lines: 0, level: 0,
      acc: 0, dasT: 0, repT: 0, dir: 0, over: false, t: 0,
    };

    const push = (): void => {
      api.pushHud({ score: s.score, lines: s.lines, level: s.level, best: getBest(BK, 0) });
    };

    const refill = (): PieceKind => {
      if (s.bag.length === 0) s.bag = bag7();
      return s.bag.pop() as PieceKind;
    };

    const newPiece = (): boolean => {
      const kind = refill();
      s.cur = spawnPiece(kind);
      s.ghostY = dropY(s.board, s.cur);
      if (collides(s.board, s.cur.shape, s.cur.x, s.cur.y)) { endGame(); return false; }
      return true;
    };

    const reset = (): void => {
      s.board = emptyBoard();
      s.bag = bag7();
      s.score = 0; s.lines = 0; s.level = 0;
      s.acc = 0; s.dasT = 0; s.repT = 0; s.dir = 0;
      s.over = false;
      newPiece();
      push();
    };

    const endGame = (): void => {
      s.over = true;
      const nb = setBest(BK, s.score);
      api.sfx.thud(1.2);
      api.shake.add(10);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '🧱 DINDING ROBOH!', { size: 30, color: '#fca5a5' });
      api.particles.spawn(api.W / 2, api.H * 0.3, {
        count: 70, colors: ['#fca5a5', '#fdba74', '#d6d3d1', '#92400e'],
        speed: [80, 360], life: [0.7, 1.4], size: [3, 8], gravity: 500, shape: 'rect', rotation: true,
      });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, lines: s.lines, level: s.level, best: nb });
        setScreen('over');
      }, 1300);
    };

    const lockPiece = (): void => {
      s.board = merge(s.board, s.cur.shape, s.cur.x, s.cur.y, s.cur.kind);
      api.sfx.thud(0.55);
      const { board, cleared } = clearLines(s.board);
      s.board = board;
      if (cleared > 0) {
        const pts = scoreFor(cleared, s.level);
        s.score += pts;
        s.lines += cleared;
        const nl = levelFor(s.lines);
        api.sfx.chime(Math.min(cleared + 1, 4), 520 + s.level * 30);
        api.scores.add(api.W / 2, api.H * 0.4, `+${pts}`, {
          color: cleared >= 4 ? '#fde047' : '#fef3c7', size: cleared >= 4 ? 30 : 22,
        });
        api.particles.spawn(api.W / 2, api.H * 0.45, {
          count: cleared * 14, colors: ['#fde047', '#fdba74', '#fff7d6', '#f59e0b'],
          speed: [90, 320], life: [0.5, 1.0], size: [2, 6], gravity: 380, shape: 'rect', rotation: true,
        });
        if (cleared >= 4 && wrapRef.current) popText(wrapRef.current, '🏗️ DINDING KOKOH!', { size: 24, color: '#fde047' });
        if (nl > s.level) {
          s.level = nl;
          if (wrapRef.current) popText(wrapRef.current, `⚡ LEVEL ${nl + 1} — MAKIN CEPAT!`, { size: 20, color: '#7dd3fc' });
          api.sfx.whoosh();
        }
      }
      newPiece();
      push();
    };

    const tryMove = (dx: number): void => {
      if (!collides(s.board, s.cur.shape, s.cur.x + dx, s.cur.y)) {
        s.cur.x += dx;
        s.ghostY = dropY(s.board, s.cur);
        api.sfx.click();
      }
    };

    const tryRotate = (): void => {
      const r = rotate(s.cur.shape);
      // wall kick sederhana
      for (const dx of [0, -1, 1, -2, 2]) {
        if (!collides(s.board, r, s.cur.x + dx, s.cur.y)) {
          s.cur.shape = r; s.cur.x += dx;
          s.ghostY = dropY(s.board, s.cur);
          api.sfx.pop(0.9);
          return;
        }
      }
    };

    const doAction = (a: Action): void => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      if (a === 'left') tryMove(-1);
      else if (a === 'right') tryMove(1);
      else if (a === 'rotate') tryRotate();
      else if (a === 'soft') {
        if (!collides(s.board, s.cur.shape, s.cur.x, s.cur.y + 1)) { s.cur.y += 1; s.score += 1; }
        else lockPiece();
      } else if (a === 'hard') {
        const dist = s.ghostY - s.cur.y;
        s.cur.y = s.ghostY;
        s.score += dist * 2;
        api.shake.add(3);
        lockPiece();
      }
    };

    (api as unknown as { __do: (a: Action) => void }).__do = doAction;

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape') || api.input.wasPressed('KeyP')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.over) return;
      s.t += dt;

      // keyboard: tekan sekali
      if (api.input.wasPressed('ArrowLeft')) { tryMove(-1); s.dir = -1; s.dasT = 0; s.repT = 0; }
      if (api.input.wasPressed('ArrowRight')) { tryMove(1); s.dir = 1; s.dasT = 0; s.repT = 0; }
      if (api.input.wasPressed('ArrowUp') || api.input.wasPressed('KeyX')) tryRotate();
      if (api.input.wasPressed('Space')) doAction('hard');
      // auto-repeat kiri/kanan
      const leftHeld = api.input.down('ArrowLeft');
      const rightHeld = api.input.down('ArrowRight');
      const held: -1 | 0 | 1 = leftHeld && !rightHeld ? -1 : rightHeld && !leftHeld ? 1 : 0;
      if (held !== 0 && held === s.dir) {
        s.dasT += dt;
        if (s.dasT > 0.17) {
          s.repT += dt;
          if (s.repT > 0.05) { s.repT = 0; tryMove(held); }
        }
      } else { s.dir = held; s.dasT = 0; s.repT = 0; }
      // soft drop tahan
      if (api.input.down('ArrowDown')) {
        s.acc += dt * 1000 * 12;
      } else {
        s.acc += dt * 1000;
      }
      const step = gravityMs(s.level);
      while (s.acc >= step && !s.over) {
        s.acc -= step;
        if (!collides(s.board, s.cur.shape, s.cur.x, s.cur.y + 1)) {
          s.cur.y += 1;
          if (api.input.down('ArrowDown')) s.score += 1;
        } else {
          lockPiece();
          break;
        }
      }
      push();
    });

    /* ---------- render ---------- */
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#101c33');
      g.addColorStop(0.55, '#16263f');
      g.addColorStop(1, '#0b1322');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // blueprint grid
      ctx.strokeStyle = 'rgba(125,211,252,0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // siluet tower crane
      ctx.strokeStyle = 'rgba(2,6,16,0.55)';
      ctx.lineWidth = 7;
      const cxp = W - 44;
      ctx.beginPath(); ctx.moveTo(cxp, H); ctx.lineTo(cxp, 70); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cxp - 70, 92); ctx.lineTo(cxp + 78, 92); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxp + 78, 92); ctx.lineTo(cxp + 78, 150); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2,6,16,0.4)';
      ctx.beginPath(); ctx.moveTo(cxp, 70); ctx.lineTo(cxp + 78, 92); ctx.stroke();
      // kabel + hook bergoyang
      const sw = Math.sin(s.t * 0.8) * 10;
      ctx.beginPath(); ctx.moveTo(cxp + 78 + sw * 0.3, 150); ctx.lineTo(cxp + 78 + sw, 210); ctx.stroke();
      ctx.fillStyle = 'rgba(253,224,71,0.5)';
      ctx.fillRect(cxp + 78 + sw - 5, 210, 10, 12);
      // debu
      ctx.fillStyle = 'rgba(255,235,200,0.16)';
      for (let i = 0; i < 14; i += 1) {
        const px = ((i * 97 + s.t * 12) % (W + 30)) - 15;
        const py = (i * 61 + s.t * 7) % H;
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, TAU); ctx.fill();
      }
    };

    /** Gambar satu sel material ber-texture. */
    const drawCell = (ctx: CanvasRenderingContext2D, x: number, y: number, cs: number, kind: PieceKind, ghost: boolean): void => {
      const m = MATERIALS[kind];
      if (ghost) {
        ctx.strokeStyle = m.c1;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
        ctx.globalAlpha = 1;
        return;
      }
      const g = ctx.createLinearGradient(x, y, x, y + cs);
      g.addColorStop(0, m.c1);
      g.addColorStop(1, m.c2);
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      // texture per material
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 1, y + 1, cs - 2, cs - 2); ctx.clip();
      if (kind === 'J' || kind === 'O' || kind === 'T') {
        // bata: garis adukan
        ctx.strokeStyle = 'rgba(60,25,5,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 1, y + cs / 2); ctx.lineTo(x + cs - 1, y + cs / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + cs / 2, y + 1); ctx.lineTo(x + cs / 2, y + cs / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + cs / 4, y + cs / 2); ctx.lineTo(x + cs / 4, y + cs - 1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + (3 * cs) / 4, y + cs / 2); ctx.lineTo(x + (3 * cs) / 4, y + cs - 1); ctx.stroke();
      } else if (kind === 'I') {
        // besi beton: ulir diagonal
        ctx.strokeStyle = 'rgba(8,47,73,0.55)';
        ctx.lineWidth = 2;
        for (let i = -1; i < 3; i += 1) {
          ctx.beginPath();
          ctx.moveTo(x + i * (cs / 2), y + cs - 1);
          ctx.lineTo(x + i * (cs / 2) + cs, y + 1);
          ctx.stroke();
        }
      } else if (kind === 'L') {
        // kayu bekisting: serat
        ctx.strokeStyle = 'rgba(120,53,15,0.4)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i += 1) {
          const yy = y + 6 + i * ((cs - 12) / 2);
          ctx.beginPath();
          ctx.moveTo(x + 3, yy);
          ctx.quadraticCurveTo(x + cs / 2, yy + 3, x + cs - 3, yy - 1);
          ctx.stroke();
        }
      } else {
        // genteng/paving: titik roster
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2, cs * 0.14, 0, TAU); ctx.fill();
      }
      // highlight atas
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x + 1, y + 1, cs - 2, 3);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, cs - 3, cs - 3);
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      if (api.shake.active) ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);

      const hudH = 66;
      const btnH = 74;
      const availW = W - 20;
      const availH = H - hudH - btnH - 16;
      const cs = Math.max(14, Math.floor(Math.min(availW / COLS, availH / ROWS)));
      const bw = cs * COLS; const bh = cs * ROWS;
      const bx = Math.round((W - bw) / 2);
      const by = Math.round(hudH + (availH - bh) / 2);

      // bingkai area proyek (scaffolding frame)
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 5;
      ctx.strokeRect(bx - 8, by - 8, bw + 16, bh + 16);
      ctx.strokeStyle = 'rgba(253,224,71,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(bx - 8, by - 8, bw + 16, bh + 16);
      ctx.setLineDash([]);
      // isi papan gelap
      const pg = ctx.createLinearGradient(0, by, 0, by + bh);
      pg.addColorStop(0, 'rgba(8,14,26,0.92)');
      pg.addColorStop(1, 'rgba(8,14,26,0.78)');
      ctx.fillStyle = pg;
      ctx.fillRect(bx, by, bw, bh);

      if (screenRef.current === 'play' || screenRef.current === 'pause') {
        // ghost
        const gp = s.cur;
        for (let yy = 0; yy < gp.shape.length; yy += 1)
          for (let xx = 0; xx < gp.shape[yy].length; xx += 1)
            if (gp.shape[yy][xx]) drawCell(ctx, bx + (gp.x + xx) * cs, by + (s.ghostY + yy) * cs, cs, gp.kind, true);
        // tumpukan
        for (let yy = 0; yy < ROWS; yy += 1)
          for (let xx = 0; xx < COLS; xx += 1) {
            const c = s.board[yy][xx];
            if (c !== 0) drawCell(ctx, bx + xx * cs, by + yy * cs, cs, c, false);
          }
        // piece aktif
        for (let yy = 0; yy < gp.shape.length; yy += 1)
          for (let xx = 0; xx < gp.shape[yy].length; xx += 1)
            if (gp.shape[yy][xx]) drawCell(ctx, bx + (gp.x + xx) * cs, by + (gp.y + yy) * cs, cs, gp.kind, false);
        // garis bahaya
        ctx.strokeStyle = 'rgba(248,113,113,0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(bx, by + 2 * cs); ctx.lineTo(bx + bw, by + 2 * cs); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    sfx.ensure();
    const api = apiRef.current;
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
  };
  const doAct = (a: Action): void => {
    (apiRef.current as unknown as { __do?: (x: Action) => void } | null)?.__do?.(a);
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
    background: 'rgba(10,18,32,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const padBtn: React.CSSProperties = {
    width: 58, height: 58, borderRadius: 16, border: '1px solid rgba(253,224,71,0.4)',
    background: 'rgba(20,30,50,0.72)', color: '#fde047', fontSize: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    backdropFilter: 'blur(6px)', touchAction: 'manipulation', userSelect: 'none',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0b1322', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />

      {/* HUD atas */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,18,32,0.62)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>🧱 {hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 2, opacity: 0.92 }}>
            Lv.{hud.level + 1} • {hud.lines} baris
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>⭐ Terbaik: {hud.best.toLocaleString('id-ID')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {/* kontrol sentuh */}
      {(screen === 'play') && (
        <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, zIndex: 5 }}>
          <button style={padBtn} onPointerDown={(e) => { e.preventDefault(); doAct('left'); }} aria-label="Kiri">◀</button>
          <button style={padBtn} onPointerDown={(e) => { e.preventDefault(); doAct('rotate'); }} aria-label="Putar">🔄</button>
          <button style={padBtn} onPointerDown={(e) => { e.preventDefault(); doAct('soft'); }} aria-label="Turun">⬇</button>
          <button style={padBtn} onPointerDown={(e) => { e.preventDefault(); doAct('right'); }} aria-label="Kanan">▶</button>
          <button style={{ ...padBtn, borderColor: 'rgba(248,113,113,0.5)', color: '#fca5a5' }} onPointerDown={(e) => { e.preventDefault(); doAct('hard'); }} aria-label="Jatuhkan">⏬</button>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🧱</div>
          <h2 style={h2}>SUSUN BATA</h2>
          <p style={p}>
            Susun balok <b>material bangunan</b> jadi <b>baris penuh</b> — baris penuh berubah jadi dinding kokoh!
            Tiap naik level, balok <b>makin cepat</b> turunnya. Jangan sampai menara material roboh!
          </p>
          <p style={{ ...p, fontSize: 12, opacity: 0.8 }}>← → geser • ↑ putar • Spasi jatuhkan • P jeda</p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Menyusun</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>ISTIRAHAT</h2>
          <p style={p}>Mandornya ngopi dulu. Baloknya aman tidak ke mana-mana.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏚️</div>
          <h2 style={h2}>DINDING ROBOH!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Level" value={`Lv.${hud.level + 1}`} />
            <Stat label="Baris" value={`${hud.lines}`} />
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Susun Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

function dropY(board: Board, p: ActivePiece): number {
  let y = p.y;
  while (!collides(board, p.shape, p.x, y + 1)) y += 1;
  return y;
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e2e8f0' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#94a3b8', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,10,20,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#16263f,#0a1220)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e2e8f0' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
