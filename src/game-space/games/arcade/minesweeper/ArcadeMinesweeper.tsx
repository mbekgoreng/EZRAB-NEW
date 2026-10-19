/**
 * ArcadeMinesweeper ("Cari Pipa Bocor") — minesweeper bertema proyek.
 * Petak berisi "pipa bocor" (bukan ranjau). Angka = tekanan rembesan
 * (jumlah pipa bocor di sekitar). Klik pertama selalu aman.
 * Katup (flag) menandai dugaan pipa. 3 tingkat kesulitan.
 */
import React, { useRef, useState } from 'react';
import {
  useGameCanvas, type GameApi, TAU, clamp, sfx,
} from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  DIFFS, createBoard, openCell, toggleFlag, chord, checkWin, countFlags,
  type Diff, type Board,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = (d: Diff): string => bestKey('cari-pipa-bocor', `best-${d}`);

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  diff: Diff;
  board: Board | null;
  started: boolean;
  elapsed: number;
  over: boolean;
  win: boolean;
  exploded: [number, number] | null;
  flagMode: boolean;
  shake: number;
  t: number;
  deadCells: Set<string>;
}

const NUM_COLORS = ['', '#3b82f6', '#16a34a', '#dc2626', '#7c3aed', '#b45309', '#0891b2', '#111827', '#6b7280'];

export default function ArcadeMinesweeper({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ elapsed: 0, left: 10, best: 0, flagMode: false });
  const [muted, setMuted] = useState(sfx.muted);
  const [diff, setDiff] = useState<Diff>('mudah');

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);
    const s: S = {
      diff: 'mudah', board: null, started: false, elapsed: 0,
      over: false, win: false, exploded: null, flagMode: false, shake: 0, t: 0,
      deadCells: new Set(),
    };

    const spec = (): { w: number; h: number; pipes: number } => DIFFS[s.diff];

    const cellGeom = (): { cs: number; ox: number; oy: number } => {
      const { w, h } = spec();
      const topHud = 108;
      const botHud = 64;
      const cs = Math.floor(Math.min((api.W - 20) / w, (api.H - topHud - botHud) / h));
      const ox = Math.round((api.W - cs * w) / 2);
      const oy = Math.round(topHud + (api.H - topHud - botHud - cs * h) / 2);
      return { cs, ox, oy };
    };

    const push = (): void => {
      const pipes = spec().pipes;
      const flags = s.board ? countFlags(s.board) : 0;
      api.pushHud({ elapsed: Math.floor(s.elapsed), left: pipes - flags, best: getBest(BK(s.diff), 0), flagMode: s.flagMode });
    };

    const reset = (d: Diff): void => {
      s.diff = d;
      s.board = null;
      s.started = false;
      s.elapsed = 0;
      s.over = false; s.win = false;
      s.exploded = null;
      s.shake = 0;
      s.deadCells = new Set();
      push();
    };

    const cellAt = (px: number, py: number): [number, number] | null => {
      const { cs, ox, oy } = cellGeom();
      const { w, h } = spec();
      const x = Math.floor((px - ox) / cs);
      const y = Math.floor((py - oy) / cs);
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      return [x, y];
    };

    const endGame = (win: boolean): void => {
      s.over = true;
      s.win = win;
      const wrap = wrapRef.current;
      if (win) {
        const nb = setBest(BK(s.diff), Math.floor(s.elapsed));
        sfx.chime(3);
        if (wrap) popText(wrap, '🔧 SEMUA PIPA KETEMU!', { size: 26, color: '#4ade80' });
        api.particles.spawn(api.W / 2, api.H * 0.4, {
          count: 80, colors: ['#4ade80', '#7dd3fc', '#fff7d6', '#fde047'],
          speed: [120, 420], life: [0.6, 1.2], size: [2, 6], gravity: 320, shape: 'rect', rotation: true,
        });
        window.setTimeout(() => {
          api.pushHud({ elapsed: Math.floor(s.elapsed), left: 0, best: nb, flagMode: s.flagMode });
          setScreen('over');
        }, 1400);
      } else {
        s.shake = 0.5;
        sfx.fail();
        sfx.crumble(1);
        if (wrap) popText(wrap, '💦 PIPA PECAH! BANJIR!', { size: 26, color: '#f87171' });
        // tunjukkan semua pipa
        if (s.board) {
          for (let y = 0; y < s.board.length; y += 1) {
            for (let x = 0; x < s.board[0].length; x += 1) {
              if (s.board[y][x].pipe) s.board[y][x].open = true;
            }
          }
        }
        window.setTimeout(() => { setScreen('over'); }, 1600);
      }
    };

    const doOpen = (x: number, y: number): void => {
      if (!s.board) {
        // klik pertama: buat papan, zona aman di klik
        const { w, h, pipes } = spec();
        s.board = createBoard(w, h, pipes, x, y, Math.random);
        s.started = true;
        sfx.ensure();
      }
      const before = s.board[y][x];
      if (before.open) {
        // chord
        const r = chord(s.board, x, y);
        s.board = r.board;
        if (r.result.opened > 0) sfx.pop(0.8);
        if (r.result.hitPipe) { endGame(false); return; }
      } else {
        const r = openCell(s.board, x, y);
        s.board = r.board;
        if (r.result.hitPipe) { s.exploded = [x, y]; endGame(false); return; }
        if (r.result.opened > 0) {
          sfx.pop(r.result.opened > 6 ? 1.3 : 0.9);
          const { cs, ox, oy } = cellGeom();
          if (r.result.opened >= 4) {
            api.particles.spawn(ox + x * cs + cs / 2, oy + y * cs + cs / 2, {
              count: Math.min(20, r.result.opened * 2),
              colors: ['#7dd3fc', '#38bdf8', '#bae6fd'],
              speed: [40, 180], life: [0.25, 0.6], size: [1.5, 4], gravity: 240, shape: 'circle',
            });
          }
        }
      }
      if (checkWin(s.board)) { endGame(true); return; }
      push();
    };

    const doFlag = (x: number, y: number): void => {
      if (!s.board) return;
      s.board = toggleFlag(s.board, x, y);
      const c = s.board[y][x];
      sfx.click();
      if (c.flag) {
        const { cs, ox, oy } = cellGeom();
        api.particles.spawn(ox + x * cs + cs / 2, oy + y * cs, {
          count: 6, colors: ['#fbbf24', '#f59e0b'],
          speed: [40, 140], life: [0.2, 0.5], size: [1.5, 3], gravity: 200, shape: 'circle',
        });
      }
      push();
    };

    // tap vs long-press (katup)
    let downPos: { x: number; y: number; t: number } | null = null;
    let longFired = false;
    let longTimer = 0;
    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      downPos = { x: p.x, y: p.y, t: performance.now() };
      longFired = false;
      window.clearTimeout(longTimer);
      longTimer = window.setTimeout(() => {
        if (downPos && !longFired && screenRef.current === 'play' && !s.over) {
          const c = cellAt(downPos.x, downPos.y);
          if (c) {
            longFired = true;
            if (s.board) doFlag(c[0], c[1]);
            else {
              // long-press pertama = buka (aman)
              doOpen(c[0], c[1]);
            }
            const wrap = wrapRef.current;
            if (wrap) popText(wrap, '🔩 Katup!', { size: 14, color: '#fbbf24' });
          }
        }
      }, 450);
    };
    api.input.onUp = (p) => {
      window.clearTimeout(longTimer);
      if (screenRef.current !== 'play' || s.over) { downPos = null; return; }
      if (downPos && !longFired) {
        const moved = Math.hypot(p.x - downPos.x, p.y - downPos.y);
        if (moved < 24) {
          const c = cellAt(p.x, p.y);
          if (c) {
            if (s.flagMode && s.board) doFlag(c[0], c[1]);
            else doOpen(c[0], c[1]);
          }
        }
      }
      downPos = null;
    };
    (api as unknown as { __flagMode: () => void }).__flagMode = () => {
      s.flagMode = !s.flagMode;
      push();
    };
    (api as unknown as { __reset: (d: Diff) => void }).__reset = reset;

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);
      if (screenRef.current !== 'play' || s.over) return;
      if (s.started) s.elapsed += dt;
      if (Math.floor(s.elapsed * 2) !== Math.floor((s.elapsed - dt) * 2)) push();
    });

    // ---------- gambar ----------
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0e1c2e');
      g.addColorStop(0.6, '#14304a');
      g.addColorStop(1, '#0a1420');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // blueprint
      ctx.strokeStyle = 'rgba(120,170,220,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 28) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 28) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // gelembung air melayang
      ctx.fillStyle = 'rgba(125,211,252,0.25)';
      for (let i = 0; i < 10; i += 1) {
        const px = ((i * 137 + s.t * 12) % (W + 30)) - 15;
        const py = H - ((i * 89 + s.t * 26) % (H + 60));
        ctx.beginPath(); ctx.arc(px, py, 2 + (i % 3), 0, TAU); ctx.fill();
      }
    };

    const drawCell = (ctx: CanvasRenderingContext2D, x: number, y: number, cs: number, ox: number, oy: number): void => {
      const c = s.board?.[y]?.[x];
      const px = ox + x * cs;
      const py = oy + y * cs;
      if (!c) return;
      if (c.open) {
        // petak terbuka — lantai beton
        const g = ctx.createLinearGradient(px, py, px, py + cs);
        g.addColorStop(0, '#334155');
        g.addColorStop(1, '#1e293b');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, cs, cs);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
        if (c.pipe) {
          // PIPA BOCOR!
          const isBoom = s.exploded !== null && s.exploded[0] === x && s.exploded[1] === y;
          if (isBoom) {
            ctx.fillStyle = 'rgba(220,38,38,0.55)';
            ctx.fillRect(px, py, cs, cs);
          }
          const cx = px + cs / 2;
          const cy = py + cs / 2;
          const r = cs * 0.32;
          const pg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
          pg.addColorStop(0, '#94a3b8');
          pg.addColorStop(0.5, '#64748b');
          pg.addColorStop(1, '#334155');
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, TAU); ctx.fill();
          // retakan + semburan
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = Math.max(1.5, cs * 0.05);
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.8, cy - r * 0.4);
          ctx.lineTo(cx - r * 0.2, cy);
          ctx.lineTo(cx + r * 0.5, cy - r * 0.7);
          ctx.stroke();
          ctx.fillStyle = 'rgba(125,211,252,0.9)';
          for (let i = 0; i < 4; i += 1) {
            const a = s.t * 4 + i * 1.7;
            const dx = Math.cos(a) * r * 1.3;
            const dy = Math.sin(a) * r * 1.3 - r * 0.5;
            ctx.beginPath(); ctx.arc(cx + dx, cy + dy, Math.max(1.2, cs * 0.05), 0, TAU); ctx.fill();
          }
        } else if (c.n > 0) {
          ctx.fillStyle = NUM_COLORS[Math.min(c.n, 8)];
          ctx.font = `900 ${Math.floor(cs * 0.55)}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(c.n), px + cs / 2, py + cs / 2 + 1);
          // ikon tetesan kecil untuk n>=3
          if (c.n >= 3) {
            ctx.fillStyle = 'rgba(125,211,252,0.7)';
            ctx.font = `${Math.floor(cs * 0.22)}px ${FONT}`;
            ctx.fillText('💧', px + cs * 0.78, py + cs * 0.2);
          }
        }
      } else {
        // petak tertutup — panel tanah/paving
        const g = ctx.createLinearGradient(px, py, px, py + cs);
        g.addColorStop(0, '#64748b');
        g.addColorStop(0.5, '#475569');
        g.addColorStop(1, '#334155');
        ctx.fillStyle = g;
        ctx.beginPath();
        const rad = Math.max(2, cs * 0.12);
        if (typeof ctx.roundRect === 'function') ctx.roundRect(px + 1, py + 1, cs - 2, cs - 2, rad);
        else ctx.rect(px + 1, py + 1, cs - 2, cs - 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(px + 3, py + 3, cs - 6, Math.max(2, cs * 0.1));
        if (c.flag) {
          // KATUP
          const cx = px + cs / 2;
          const cy = py + cs / 2;
          const r = cs * 0.3;
          const rot = s.t * 0.8;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = Math.max(2, cs * 0.07);
          for (let i = 0; i < 3; i += 1) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos((i * TAU) / 3) * r, Math.sin((i * TAU) / 3) * r);
            ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
          ctx.restore();
          ctx.fillStyle = '#b45309';
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(cx - r * 0.1, cy - r * 0.1, r * 0.12, 0, TAU); ctx.fill();
        } else {
          // tekstur paving halus
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(px + cs * 0.2, py + cs * 0.45, cs * 0.6, 1.5);
        }
      }
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      if (s.shake > 0) {
        const k = s.shake / 0.5;
        ctx.translate((Math.random() - 0.5) * 14 * k, (Math.random() - 0.5) * 14 * k);
      }
      drawBackground(ctx, W, H);
      const { w, h } = spec();
      const { cs, ox, oy } = cellGeom();
      if (!s.board) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = `800 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('👆 Ketuk petak mana pun untuk mulai', W / 2, oy + (cs * h) / 2);
        ctx.font = `13px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Klik pertama selalu aman ✓', W / 2, oy + (cs * h) / 2 + 24);
      } else {
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) drawCell(ctx, x, y, cs, ox, oy);
        }
      }
      // label bawah
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(s.flagMode ? '🔩 Mode KATUP aktif — ketuk untuk pasang/lepas katup' : 'Tahan 450ms untuk pasang katup • ketuk angka berkatup pas = chord', W / 2, H - 22);
      ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,10,18,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    reset(s.diff);
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (d: Diff): void => {
    const api = apiRef.current;
    sfx.ensure();
    setDiff(d);
    (api as unknown as { __reset?: (dd: Diff) => void } | null)?.__reset?.(d);
    setScreen('play');
  };
  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    sfx.ensure();
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    sfx.ensure();
    sfx.toggleMute();
    setMuted(sfx.muted);
  };
  const toggleFlagMode = (): void => {
    (apiRef.current as unknown as { __flagMode?: () => void } | null)?.__flagMode?.();
    setHud((h) => ({ ...h, flagMode: !h.flagMode }));
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(8,16,28,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const fmtT = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0e1c2e', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(8,16,28,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#7dd3fc' }}>⏱ {fmtT(hud.elapsed)}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            💧 {hud.left} pipa {hud.best > 0 && <span style={{ color: '#4ade80' }}>• ⚡{fmtT(hud.best)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {screen === 'play' && (
            <button
              style={{ ...btn, background: hud.flagMode ? 'rgba(251,191,36,0.75)' : btn.background, color: hud.flagMode ? '#3a2a00' : '#fff' }}
              onClick={toggleFlagMode} aria-label="Mode katup"
            >
              🔩
            </button>
          )}
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🔧</div>
          <h2 style={h2}>CARI PIPA BOCOR</h2>
          <p style={p}>
            Ada <b>pipa bocor</b> tersembunyi di bawah paving! Angka = <b>tekanan rembesan</b>
            (jumlah pipa bocor di sekitarnya). <b>Ketuk</b> untuk membuka, <b>tahan</b> untuk
            pasang <b>🔩 katup</b> penanda. Klik pertama <b>selalu aman</b>!
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {(['mudah', 'sedang', 'sulit'] as Diff[]).map((d) => (
              <button
                key={d}
                onClick={() => startGame(d)}
                style={{
                  flex: 1, padding: '12px 6px', borderRadius: 12, border: '1px solid rgba(125,211,252,0.4)',
                  background: 'rgba(14,42,67,0.8)', color: '#fff', fontFamily: FONT, cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>{DIFFS[d].label}</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{DIFFS[d].desc}</div>
              </button>
            ))}
          </div>
          {hud.best > 0 && <p style={p}>Tercepat {DIFFS[diff].label}: <b style={{ color: '#4ade80' }}>{fmtT(hud.best)}</b></p>}
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Pipanya nunggu diperbaiki.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{hud.left === 0 ? '🔧' : '💦'}</div>
          <h2 style={h2}>{hud.left === 0 ? 'PIPA TERATASI!' : 'KEBANJIRAN!'}</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#7dd3fc' }}>⏱ {fmtT(hud.elapsed)}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Proyek" value={DIFFS[diff].label} />
            <Stat label="Tercepat" value={hud.best > 0 ? fmtT(hud.best) : '-'} />
          </div>
          <button style={primaryBtn} onClick={() => startGame(diff)}>Main Lagi</button>
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
  background: 'linear-gradient(180deg,#7dd3fc,#0284c7)', color: '#06263b', boxShadow: '0 8px 20px rgba(2,132,199,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#7dd3fc', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,14,24,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20, overflowY: 'auto' }}>
      <div style={{ background: 'linear-gradient(160deg,#14304a,#0a1420)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 20, padding: 24, maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e0f2fe' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
