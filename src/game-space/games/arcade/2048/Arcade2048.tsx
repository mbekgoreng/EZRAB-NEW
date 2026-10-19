/**
 * Arcade2048 — "Cor 2048".
 * Gabungkan material proyek: 🧱 Bata → … → 🌆 Pencakar Langit (2048).
 * Swipe + keyboard + tombol arah, undo, best, juice pengecoran.
 * Logika murni di logic.ts; file ini render + input + juice.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d';
import {
  createGame, move, undo, canMove, cloneGrid, tierOf, tileName, tileIcon,
  TIERS, TIER_COLORS, MAX_TIER, WIN_VALUE, N,
  type G2048, type Dir,
} from './logic';

const SLUG = '2048';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const BOARD_M = 12;
const BOARD_S = LW - BOARD_M * 2;
const GAPV = 10;
const CELL = (BOARD_S - GAPV * (N - 1)) / N;

const A2TEST =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('a2test');

type Screen = 'tutorial' | 'play' | 'pause' | 'over' | 'win';

interface Hud {
  score: number;
  best: number;
  moves: number;
  canUndo: boolean;
}

interface TileAnim {
  key: string; // "r,c"
  bornAt: number; // jam animT
  kind: 'spawn' | 'merge';
  tier: number;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function drawTile(
  ctx: CanvasRenderingContext2D, x: number, y: number, value: number,
  anim: TileAnim | null, t: number,
): void {
  const tier = tierOf(value);
  const base = TIER_COLORS[Math.max(0, Math.min(MAX_TIER - 1, tier - 1))];
  let scale = 1;
  if (anim) {
    const age = t - anim.bornAt;
    if (age < 0.22) {
      const k = age / 0.22;
      scale = anim.kind === 'spawn' ? 0.3 + 0.7 * k : 1 + 0.28 * Math.sin(k * Math.PI);
    }
  }
  ctx.save();
  ctx.translate(x + CELL / 2, y + CELL / 2);
  ctx.scale(scale, scale);
  ctx.translate(-CELL / 2, -CELL / 2);

  const r = 12;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, CELL, CELL, r);
  else ctx.rect(0, 0, CELL, CELL);
  const g = ctx.createLinearGradient(0, 0, 0, CELL);
  g.addColorStop(0, shade(base, 42));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -38));
  ctx.fillStyle = g;
  ctx.fill();
  // highlight atas
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 4, CELL - 8, CELL * 0.34, 8);
  else ctx.rect(4, 4, CELL - 8, CELL * 0.34);
  ctx.fill();
  // outline
  ctx.strokeStyle = shade(base, -70);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(1.5, 1.5, CELL - 3, CELL - 3, r - 1);
  else ctx.rect(1.5, 1.5, CELL - 3, CELL - 3);
  ctx.stroke();
  // glow untuk tier tinggi
  if (tier >= 8) {
    ctx.save();
    ctx.shadowColor = base;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 4, CELL - 8, CELL - 8, r - 3);
    else ctx.rect(4, 4, CELL - 8, CELL - 8);
    ctx.stroke();
    ctx.restore();
  }

  // ikon + nama + nilai
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4;
  ctx.font = `${tier >= 9 ? 34 : 30}px system-ui`;
  ctx.fillText(tileIcon(value), CELL / 2, CELL / 2 - 10);
  ctx.shadowBlur = 0;
  ctx.font = `800 ${tier >= 9 ? 10 : 9}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  const nm = tileName(value);
  ctx.fillText(nm.length > 12 ? nm.slice(0, 12) : nm, CELL / 2, CELL / 2 + 16, CELL - 10);
  ctx.font = `700 10px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(String(value), CELL / 2, CELL / 2 + 29);
  ctx.restore();
}

export default function Arcade2048({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const stRef = useRef<G2048 | null>(null);
  const animRef = useRef<TileAnim[]>([]);
  const animTRef = useRef(0);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(bestKey(SLUG, 'best')), moves: 0, canUndo: false });
  const [wonTier] = useState(WIN_VALUE);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHud = (): void => {
    const st = stRef.current;
    if (!st) return;
    apiRef.current?.pushHud({
      score: st.score,
      best: getBest(bestKey(SLUG, 'best')),
      moves: st.moves,
      canUndo: st.undoStack.length > 0,
    } as Hud);
  };

  const doMove = (dir: Dir): void => {
    const api = apiRef.current;
    const st = stRef.current;
    if (!api || !st || screenRef.current !== 'play' || st.over) return;
    const prev = cloneGrid(st.grid);
    const res = move(st, dir, Math.random);
    if (!res.moved) {
      api.sfx.click();
      return;
    }
    const t = animTRef.current;
    // animasi: sel gabungan + sel spawn
    for (let mi = 0; mi < res.mergedCells.length; mi += 1) {
      const m = res.mergedCells[mi];
      animRef.current.push({ key: `${m.r},${m.c}`, bornAt: t, kind: 'merge', tier: m.tier });
      const cx = BOARD_M + m.c * (CELL + GAPV) + CELL / 2;
      const cy = boardTop() + m.r * (CELL + GAPV) + CELL / 2;
      if (mi === 0 && res.gained > 0) {
        api.scores.add(cx * (api.W / LW), cy * (api.W / LW), `+${res.gained}`, {
          color: '#ffd166', size: 20,
        });
      }
      api.particles.spawn(cx * (api.W / LW), cy * (api.W / LW), {
        count: m.tier >= 5 ? 22 : 10,
        colors: [TIER_COLORS[Math.min(MAX_TIER - 1, m.tier - 1)], '#ffffff', '#ffd166'],
        speed: [80, 260], life: [0.35, 0.7], size: [2.5, 5.5], shape: 'rect', rotation: true,
      });
      if (m.tier >= 6) api.shake.add(0.22);
    }
    for (let r = 0; r < N; r += 1) {
      for (let c = 0; c < N; c += 1) {
        if (prev[r][c] === 0 && st.grid[r][c] !== 0 &&
          !res.mergedCells.some((m) => m.r === r && m.c === c)) {
          animRef.current.push({ key: `${r},${c}`, bornAt: t, kind: 'spawn', tier: tierOf(st.grid[r][c]) });
        }
      }
    }
    if (animRef.current.length > 40) animRef.current.splice(0, animRef.current.length - 40);

    // suara: pitch naik seiring tier gabungan tertinggi
    const topTier = res.mergedCells.reduce((m, x) => Math.max(m, x.tier), 0);
    if (topTier > 0) api.sfx.pop(0.8 + topTier * 0.09);
    else api.sfx.whoosh();

    const best = setBest(bestKey(SLUG, 'best'), st.score);
    void best;
    pushHud();

    if (res.won && !st.keepGoing) {
      api.sfx.chime(4);
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 80, colors: ['#ffd166', '#4ade80', '#ffffff', '#ffbe0b'],
        speed: [120, 420], up: 160, gravity: 420, life: [0.8, 1.6],
        size: [3, 7], shape: 'rect', rotation: true,
      });
      window.setTimeout(() => setScreen('win'), 800);
    } else if (res.over) {
      api.sfx.fail();
      api.shake.add(0.4);
      window.setTimeout(() => setScreen('over'), 700);
    }
  };

  const boardTop = (): number => 118;

  const newGame = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    stRef.current = createGame(Math.random);
    animRef.current = [];
    pushHud();
    setScreen('play');
  };

  const doUndo = (): void => {
    const api = apiRef.current;
    const st = stRef.current;
    if (!api || !st || st.undoStack.length === 0) return;
    api.sfx.ensure();
    api.sfx.click();
    undo(st);
    animRef.current = [];
    pushHud();
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);
    stRef.current = createGame(Math.random);
    pushHud();

    const toGame = (p: { x: number; y: number }): { x: number; y: number } => {
      const s = api.W / LW;
      return { x: p.x / s, y: p.y / s };
    };
    let swipeStart: { x: number; y: number } | null = null;

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play') return;
      swipeStart = toGame(p);
    };
    api.input.onUp = (p) => {
      if (!swipeStart || screenRef.current !== 'play') {
        swipeStart = null;
        return;
      }
      const g = toGame(p);
      const dx = g.x - swipeStart.x;
      const dy = g.y - swipeStart.y;
      swipeStart = null;
      if (Math.hypot(dx, dy) < 24) return; // tap: abaikan
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      doMove(dir);
    };

    api.setUpdate((dt) => {
      animTRef.current += dt;
      // bersihkan animasi lama
      const t = animTRef.current;
      animRef.current = animRef.current.filter((a) => t - a.bornAt < 0.3);

      const keyDir = (k: string): Dir | null => {
        if (k === 'ArrowLeft' || k === 'KeyA') return 'left';
        if (k === 'ArrowRight' || k === 'KeyD') return 'right';
        if (k === 'ArrowUp' || k === 'KeyW') return 'up';
        if (k === 'ArrowDown' || k === 'KeyS') return 'down';
        return null;
      };
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS']) {
        if (api.input.wasPressed(k)) {
          const d = keyDir(k);
          if (d && screenRef.current === 'play') {
            api.sfx.ensure();
            doMove(d);
          }
        }
      }
      if (api.input.wasPressed('KeyZ')) doUndo();
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') {
          api.loop.setPaused(true);
          setScreen('pause');
        } else if (screenRef.current === 'pause') {
          api.loop.setPaused(false);
          setScreen('play');
        }
      }
    });

    api.setRender(() => {
      const st = stRef.current;
      if (!st) return;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = animTRef.current;
      ctx.save();
      ctx.scale(s, s);

      // latar: beton + blueprint grid
      const bg = ctx.createLinearGradient(0, 0, 0, lh);
      bg.addColorStop(0, '#3a4356');
      bg.addColorStop(0.55, '#2b3242');
      bg.addColorStop(1, '#1f2530');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, LW, lh);
      ctx.strokeStyle = 'rgba(147,197,253,0.07)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < LW; gx += 26) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, lh); ctx.stroke();
      }
      for (let gy = 0; gy < lh; gy += 26) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(LW, gy); ctx.stroke();
      }
      // siluet crane
      ctx.strokeStyle = 'rgba(10,14,22,0.5)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(340, 0); ctx.lineTo(340, 90);
      ctx.moveTo(280, 14); ctx.lineTo(370, 14);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(10,14,22,0.4)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(300, 14); ctx.lineTo(300, 52);
      ctx.stroke();
      ctx.fillStyle = 'rgba(10,14,22,0.5)';
      ctx.fillRect(292, 52, 16, 12);

      // papan
      const bt = boardTop();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#171d29';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(BOARD_M - 8, bt - 8, BOARD_S + 16, BOARD_S + 16, 18);
      else ctx.rect(BOARD_M - 8, bt - 8, BOARD_S + 16, BOARD_S + 16);
      ctx.fill();
      ctx.restore();
      // sel kosong
      for (let r = 0; r < N; r += 1) {
        for (let c = 0; c < N; c += 1) {
          const x = BOARD_M + c * (CELL + GAPV);
          const y = bt + r * (CELL + GAPV);
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, CELL, CELL, 12);
          else ctx.rect(x, y, CELL, CELL);
          ctx.fill();
        }
      }
      // ubin
      for (let r = 0; r < N; r += 1) {
        for (let c = 0; c < N; c += 1) {
          const v = st.grid[r][c];
          if (v === 0) continue;
          const x = BOARD_M + c * (CELL + GAPV);
          const y = bt + r * (CELL + GAPV);
          const anim = animRef.current.find((a) => a.key === `${r},${c}`) ?? null;
          drawTile(ctx, x, y, v, anim, t);
        }
      }

      // progres ke pencakar langit (di atas papan, di bawah HUD)
      const maxV = Math.max(...st.grid.flat());
      const maxTier = tierOf(maxV);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `800 12.5px ${FONT}`;
      ctx.textAlign = 'center';
      const nextName = maxTier < MAX_TIER ? TIERS[maxTier].nama : 'SEMPURNA';
      const nextIcon = maxTier < MAX_TIER ? TIERS[maxTier].ikon : '🌆';
      ctx.fillText(`🎯 Target: ${nextIcon} ${nextName}`, LW / 2, bt - 22);

      ctx.restore();
    });

    api.loop.start();

    if (A2TEST) {
      (window as unknown as Record<string, unknown>).__g2048 = {
        getState: () => ({
          screen: screenRef.current,
          score: stRef.current?.score ?? 0,
          moves: stRef.current?.moves ?? 0,
          over: stRef.current?.over ?? false,
          won: stRef.current?.won ?? false,
          grid: stRef.current ? cloneGrid(stRef.current.grid) : [],
          canMove: stRef.current ? canMove(stRef.current.grid) : false,
        }),
        start: () => setScreen('play'),
        move: (d: Dir) => doMove(d),
        undo: doUndo,
        newGame,
      };
    }

    return () => {
      apiRef.current = null;
      if (A2TEST) delete (window as unknown as Record<string, unknown>).__g2048;
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
    apiRef.current?.sfx.ensure();
    setMuted(apiRef.current?.sfx.toggleMute() ?? false);
  };
  const keepGoing = (): void => {
    const st = stRef.current;
    if (st) st.keepGoing = true;
    apiRef.current?.sfx.ensure();
    setScreen('play');
  };

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(10,14,22,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };

  const arrowBtn: React.CSSProperties = {
    width: 56, height: 56, borderRadius: 16, border: '2px solid rgba(255,255,255,0.22)',
    background: 'linear-gradient(160deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05))',
    color: '#fff', fontSize: 24, cursor: 'pointer', fontFamily: FONT,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#2b3242', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* HUD atas */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(10,14,22,0.6)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          ⭐ {hud.score}
        </div>
        <div style={{ background: 'rgba(10,14,22,0.45)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13 }}>
          🏅 {hud.best}
        </div>
        <div style={{ flex: 1 }} />
        <button style={btn} onClick={doUndo} aria-label="Urungkan" title="Urungkan (Z)" disabled={!hud.canUndo} >
          ↩️
        </button>
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">
            {screen === 'play' ? '⏸' : '▶'}
          </button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {/* D-pad */}
      {screen === 'play' && (
        <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gridTemplateRows: 'repeat(3, 56px)', gap: 6 }}>
            <div />
            <button style={arrowBtn} onClick={() => doMove('up')} aria-label="Atas">▲</button>
            <div />
            <button style={arrowBtn} onClick={() => doMove('left')} aria-label="Kiri">◀</button>
            <button style={arrowBtn} onClick={() => doMove('down')} aria-label="Bawah">▼</button>
            <button style={arrowBtn} onClick={() => doMove('right')} aria-label="Kanan">▶</button>
          </div>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 46 }}>🧱🏢</div>
          <h2 style={titleStyle}>COR 2048</h2>
          <p style={textStyle}>
            Geser untuk menggabungkan material yang sama: 🧱 Bata → … → 🌆 Pencakar Langit (2048)!
            Tiap gabungan menaikkan nilai cor. Papan penuh & tak bisa gabung = proyek mangkrak.
          </p>
          <button style={primaryBtn} onClick={() => { apiRef.current?.sfx.ensure(); apiRef.current?.sfx.click(); setScreen('play'); }}>Mulai Mengecor 🏗️</button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>ISTIRAHAT</h2>
          <p style={textStyle}>Corannya ditutup terpal dulu. Jangan sampai kehujanan.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={newGame}>Ulangi</button>
          </div>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>🌆</div>
          <h2 style={titleStyle}>PENCAR LANGIT!</h2>
          <p style={textStyle}>
            Dari bata jadi pencakar langit {wonTier}! Kontraktor lain cuma bisa melongo.
          </p>
          <p style={{ ...textStyle, fontSize: 16 }}>
            ⭐ Skor: <b>{hud.score}</b> • 🏅 Terbaik: <b>{hud.best}</b> • 👆 {hud.moves} langkah
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={keepGoing}>Lanjut Bangun 🚀</button>
            <button style={secondaryBtn} onClick={newGame}>Ulangi 🔁</button>
          </div>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>🚧</div>
          <h2 style={titleStyle}>PROYEK MANGKRAK!</h2>
          <p style={textStyle}>
            Papan penuh, tak ada yang bisa digabung. Seperti RAB yang tak kunjung disetujui.
          </p>
          <p style={{ ...textStyle, fontSize: 16 }}>
            ⭐ Skor: <b>{hud.score}</b> • 🏅 Terbaik: <b>{hud.best}</b>
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={newGame}>Cor Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(0,0,0,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#e2e8f0', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 310,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#ffd166,#ff7847)', color: '#3b1d05',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(255,120,71,0.4)',
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
      background: 'rgba(12,16,26,0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
