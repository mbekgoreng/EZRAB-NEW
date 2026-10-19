/**
 * Gabung Blok — 2048 ala kontraktor (2D canvas).
 * Tier: BATA → BATAKO → DINDING → RUMAH → RUKO → APARTEMEN → GEDUNG → MENARA.
 */
import React, { useRef, useState, useCallback } from 'react';
import { useGameCanvas, GameApi, clamp } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import { drawNoise, hashRand } from './fx';
import {
  TIERS, MAX_TIER, Dir, move, spawnRandom, canMove, newBoard, tierScore,
  pushUndo, popUndo, type UndoEntry,
} from './logic';

type Screen = 'tutorial' | 'play' | 'pause' | 'win' | 'over';

interface Hud {
  score: number;
  best: number;
}

const BEST = bestKey('gabung-blok', 'best');
const SWIPE_MIN = 24;

const easeOutBack = (t: number): number => {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Lapisan tekstur material per tier (bata, beton, kayu, kaca) — prosedural, stabil. */
function drawTileTexture(
  ctx: CanvasRenderingContext2D, tier: number,
  x: number, y: number, s: number,
): void {
  const t = TIERS[tier];
  ctx.save();
  rr(ctx, x, y, s, s, 10);
  ctx.clip();
  ctx.strokeStyle = t.dark;
  ctx.fillStyle = t.dark;
  const R = hashRand(tier * 977 + 13);
  switch (tier) {
    case 0: { // BATA: susunan spesi horizontal
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1, s * 0.02);
      for (let k = 1; k < 4; k += 1) {
        const yy = y + (s * k) / 4;
        ctx.beginPath();
        ctx.moveTo(x + 4, yy);
        ctx.lineTo(x + s - 4, yy);
        ctx.stroke();
      }
      break;
    }
    case 1: // BATAKO: pori beton
      ctx.globalAlpha = 0.18;
      for (let k = 0; k < 10; k += 1) {
        ctx.beginPath();
        ctx.arc(
          x + s * (0.12 + R() * 0.76), y + s * (0.12 + R() * 0.76),
          Math.max(1, s * 0.03), 0, Math.PI * 2,
        );
        ctx.fill();
      }
      break;
    case 2: { // DINDING: bekas roskam acian
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = Math.max(1, s * 0.025);
      for (let k = 0; k < 3; k += 1) {
        const a0 = R() * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + s * R(), y + s * R(), s * (0.2 + R() * 0.25), a0, a0 + 2.2);
        ctx.stroke();
      }
      break;
    }
    case 3: { // RUMAH: papan kayu vertikal
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = Math.max(1, s * 0.02);
      for (let k = 1; k < 5; k += 1) {
        const xx = x + (s * k) / 5;
        ctx.beginPath();
        ctx.moveTo(xx, y + 4);
        ctx.lineTo(xx, y + s - 4);
        ctx.stroke();
      }
      break;
    }
    case 4: // RUKO: bintik beton
      ctx.globalAlpha = 0.15;
      for (let k = 0; k < 14; k += 1) {
        const d = Math.max(1.5, s * 0.025);
        ctx.fillRect(x + s * R(), y + s * R(), d, d);
      }
      break;
    case 5: { // APARTEMEN: kilau kaca diagonal
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.18, y);
      ctx.lineTo(x + s * 0.46, y);
      ctx.lineTo(x + s * 0.12, y + s);
      ctx.lineTo(x - s * 0.16, y + s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 6: { // GEDUNG: brushed metal vertikal
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 5; k += 1) {
        ctx.fillRect(x + s * (0.1 + k * 0.2), y + 4, s * 0.05, s - 8);
      }
      break;
    }
    default: { // MENARA: aura emas
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = Math.max(1.5, s * 0.03);
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s * 0.30, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // inner bottom shade: bobot di bawah
  ctx.globalAlpha = 1;
  const sh = ctx.createLinearGradient(0, y + s * 0.55, 0, y + s);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = sh;
  ctx.fillRect(x, y, s, s);
  ctx.restore();
}

/** Ikon mini tiap tier, digambar di dalam tile. cx,cy = tengah area ikon, s = ukuran. */
function drawTierIcon(ctx: CanvasRenderingContext2D, tier: number, cx: number, cy: number, s: number): void {
  const t = TIERS[tier];
  ctx.save();
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.strokeStyle = t.dark;
  switch (tier) {
    case 0: { // BATA — susunan bata 2x2 + garis mortar
      const bw = s / 2.2;
      const bh = s / 4.6;
      ctx.fillStyle = t.base;
      for (let rI = 0; rI < 2; rI += 1) {
        for (let cI = 0; cI < 2; cI += 1) {
          const bx = cx - bw + cI * bw - (rI % 2) * bw * 0.25;
          const by = cy - bh + rI * bh;
          ctx.fillRect(bx, by, bw - 2, bh - 2);
          ctx.strokeRect(bx, by, bw - 2, bh - 2);
        }
      }
      break;
    }
    case 1: { // BATAKO — blok + 2 lubang
      const w = s * 0.95;
      const h = s * 0.62;
      ctx.fillStyle = t.light;
      rr(ctx, cx - w / 2, cy - h / 2, w, h, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = t.dark;
      rr(ctx, cx - w * 0.32, cy - h * 0.22, w * 0.2, h * 0.44, 2); ctx.fill();
      rr(ctx, cx + w * 0.12, cy - h * 0.22, w * 0.2, h * 0.44, 2); ctx.fill();
      break;
    }
    case 2: { // DINDING — tembok diplester + highlight
      const w = s * 0.95;
      const h = s * 0.66;
      const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
      g.addColorStop(0, t.light);
      g.addColorStop(1, t.base);
      ctx.fillStyle = g;
      rr(ctx, cx - w / 2, cy - h / 2, w, h, 3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = t.dark;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 + 4, cy);
      ctx.lineTo(cx + w / 2 - 4, cy);
      ctx.stroke();
      break;
    }
    case 3: { // RUMAH — atap + kotak + pintu
      const w = s * 0.8;
      const h = s * 0.5;
      ctx.fillStyle = t.light;
      ctx.fillRect(cx - w / 2, cy - h / 2 + s * 0.08, w, h);
      ctx.strokeRect(cx - w / 2, cy - h / 2 + s * 0.08, w, h);
      ctx.fillStyle = '#B07E1C';
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 - s * 0.08, cy - h / 2 + s * 0.08);
      ctx.lineTo(cx, cy - h / 2 - s * 0.28);
      ctx.lineTo(cx + w / 2 + s * 0.08, cy - h / 2 + s * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = t.dark;
      ctx.fillRect(cx - s * 0.07, cy + h / 2 - s * 0.22 + s * 0.08, s * 0.14, s * 0.22);
      break;
    }
    case 4: { // RUKO — 2 lantai + jendela
      const w = s * 0.72;
      const fh = s * 0.34;
      for (let fI = 0; fI < 2; fI += 1) {
        const fy = cy - fh + fI * fh;
        ctx.fillStyle = fI === 0 ? t.light : t.base;
        ctx.fillRect(cx - w / 2, fy, w, fh - 2);
        ctx.strokeRect(cx - w / 2, fy, w, fh - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(cx - w * 0.3, fy + fh * 0.22, w * 0.2, fh * 0.4);
        ctx.fillRect(cx + w * 0.1, fy + fh * 0.22, w * 0.2, fh * 0.4);
      }
      break;
    }
    case 5: { // APARTEMEN — 3 lantai menyempit
      for (let fI = 0; fI < 3; fI += 1) {
        const w = s * (0.85 - fI * 0.16);
        const fh = s * 0.26;
        const fy = cy - s * 0.39 + fI * fh;
        ctx.fillStyle = fI % 2 === 0 ? t.base : t.light;
        ctx.fillRect(cx - w / 2, fy, w, fh - 2);
        ctx.strokeRect(cx - w / 2, fy, w, fh - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(cx - w * 0.32, fy + fh * 0.2, w * 0.18, fh * 0.45);
        ctx.fillRect(cx + w * 0.14, fy + fh * 0.2, w * 0.18, fh * 0.45);
      }
      break;
    }
    case 6: { // GEDUNG — pencakar + grid jendela
      const w = s * 0.55;
      const h = s * 0.95;
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, t.dark);
      g.addColorStop(0.5, t.light);
      g.addColorStop(1, t.dark);
      ctx.fillStyle = g;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillStyle = 'rgba(255,244,200,0.85)';
      for (let rI = 0; rI < 4; rI += 1) {
        for (let cI = 0; cI < 2; cI += 1) {
          ctx.fillRect(cx - w / 2 + 5 + cI * (w / 2 - 2), cy - h / 2 + 6 + rI * (h / 4.4), w / 2 - 9, h / 5.4);
        }
      }
      break;
    }
    default: { // MENARA — tower + antena + lampu
      const w = s * 0.6;
      const h = s * 0.78;
      ctx.fillStyle = t.base;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, cy + h / 2);
      ctx.lineTo(cx - w * 0.28, cy - h / 2 + s * 0.12);
      ctx.lineTo(cx + w * 0.28, cy - h / 2 + s * 0.12);
      ctx.lineTo(cx + w / 2, cy + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = t.dark;
      ctx.fillRect(cx - 1.5, cy - h / 2 - s * 0.22, 3, s * 0.34);
      ctx.fillStyle = '#FF5A5A';
      ctx.beginPath();
      ctx.arc(cx, cy - h / 2 - s * 0.24, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let rI = 0; rI < 3; rI += 1) {
        ctx.fillRect(cx - w * 0.18, cy - h / 2 + s * 0.2 + rI * s * 0.14, w * 0.36, s * 0.07);
      }
    }
  }
  ctx.restore();
}

interface GameState {
  board: number[];
  score: number;
  time: number;
  spawnAt: Map<number, number>;
  flashAt: Map<number, number>;
  won: boolean;
  over: boolean;
  history: UndoEntry[];
  /** token anti-balapan: timer layar game-over yang basi diabaikan */
  overToken: number;
}

export default function GabungBlok({ onExit }: { onExit: () => void }): React.ReactElement {
  // Hook visual-test: ?over=win|lose → langsung tampilkan layar akhir (tanpa gameplay).
  const debugOver = ((): 'win' | 'over' | null => {
    try {
      const q = new URLSearchParams(window.location.search).get('over');
      return q === 'win' || q === 'over' ? q : null;
    } catch {
      return null;
    }
  })();
  const [hud, setHud] = useState<Hud>(() => debugOver
    ? { score: 5240, best: 5240 }
    : { score: 0, best: getBest(BEST) });
  const [screen, setScreen] = useState<Screen>(debugOver ?? 'tutorial');
  const [muted, setMuted] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const apiRef = useRef<GameApi | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  screenRef.current = screen;
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  const pushScore = useCallback((score: number) => {
    const best = setBest(BEST, score);
    setHud({ score, best });
  }, []);

  const doMove = useCallback((dir: Dir) => {
    const api = apiRef.current;
    const st = stateRef.current;
    if (!api || !st || st.over || screenRef.current !== 'play') return;
    const old = st.board;
    const r = move(old, dir);
    if (!r.moved) {
      api.sfx.click();
      return;
    }
    // simpan snapshot SEBELUM gerakan untuk undo
    st.history = pushUndo(st.history, old, st.score);
    setCanUndo(true);
    st.board = r.board;
    st.score += r.gained;
    pushScore(st.score);

    // sel yang bergabung → flash + partikel
    for (let i = 0; i < 16; i += 1) {
      if (r.board[i] > old[i] && old[i] > 0) {
        st.flashAt.set(i, st.time);
      }
    }
    if (r.gained > 0) {
      api.sfx.pop(1 + Math.min(0.6, r.gained / 2000));
      api.shake.add(0.08);
      // partikel & popup di tengah tile yang bergabung
      const geo = boardGeo(api.W, api.H);
      for (let i = 0; i < 16; i += 1) {
        if (r.board[i] > old[i] && old[i] > 0) {
          const { cx, cy } = cellCenter(geo, i);
          const tier = r.board[i] - 1;
          api.particles.spawn(cx, cy, {
            count: 14, colors: [TIERS[tier].light, TIERS[tier].base, '#ffffff'],
            speed: [60, 220], life: [0.4, 0.8], size: [2, 5], gravity: 300, shape: 'rect',
          });
          api.scores.add(cx, cy - geo.cell * 0.3, `+${tierScore(tier)}`, {
            color: '#FFE08A', size: Math.max(14, geo.cell * 0.3),
          });
        }
      }
    }

    const idx = spawnRandom(st.board, Math.random);
    if (idx >= 0) st.spawnAt.set(idx, st.time);

    if (r.won && !st.won) {
      st.won = true;
      api.sfx.chime(4, 523);
      api.shake.add(0.3);
      if (wrapRef.current) {
        popText(wrapRef.current, 'MENARA SELESAI!', { size: 34, color: '#FFE08A' });
        window.setTimeout(() => {
          if (wrapRef.current) popText(wrapRef.current, 'Serah terima tanpa revisi!', { size: 18, color: '#ffffff' });
        }, 700);
      }
      for (let k = 0; k < 3; k += 1) {
        window.setTimeout(() => {
          api.particles.spawn(api.W / 2 + (Math.random() - 0.5) * 200, api.H * 0.4, {
            count: 26, colors: ['#F5D76E', '#D4A017', '#ffffff'],
            speed: [80, 320], life: [0.6, 1.2], size: [3, 7], gravity: 260,
          });
        }, k * 180);
      }
      api.loop.setPaused(true);
      setScreen('win');
      return;
    }

    if (!canMove(st.board)) {
      st.over = true;
      api.sfx.fail();
      api.shake.add(0.4);
      if (wrapRef.current) popText(wrapRef.current, 'Lahan habis!', { size: 32, color: '#FF8A8A' });
      const token = ++st.overToken;
      window.setTimeout(() => {
        if (st.overToken !== token || !st.over) return; // sudah di-undo
        api.loop.setPaused(true);
        setScreen('over');
      }, 900);
    }
  }, [pushScore]);

  const doUndo = useCallback(() => {
    const api = apiRef.current;
    const st = stateRef.current;
    if (!api || !st) return;
    const scr = screenRef.current;
    // undo boleh dipakai saat main; setelah game-over pun bisa (rescue)
    if (scr !== 'play' && scr !== 'over') return;
    const { entry, stack } = popUndo(st.history);
    if (!entry) {
      api.sfx.click();
      return;
    }
    st.history = stack;
    st.board = entry.board;
    st.score = entry.score;
    st.spawnAt.clear();
    st.flashAt.clear();
    const wasOver = st.over;
    st.over = false;
    st.overToken += 1; // batalkan timer layar game-over yang tertunda
    pushScore(st.score);
    setCanUndo(stack.length > 0);
    if (wasOver) {
      api.loop.setPaused(false);
      setScreen('play');
    }
    api.sfx.whoosh();
  }, [pushScore]);

  const resetGame = useCallback(() => {
    const st: GameState = {
      board: newBoard(Math.random), score: 0, time: 0,
      spawnAt: new Map(), flashAt: new Map(), won: false, over: false,
      history: [], overToken: 0,
    };
    for (let i = 0; i < 16; i += 1) {
      if (st.board[i] > 0) st.spawnAt.set(i, 0);
    }
    stateRef.current = st;
    setHud({ score: 0, best: getBest(BEST) });
    setCanUndo(false);
  }, []);

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    if (!debugOver) resetGame();
    // Hook visual-test: ?demo=1 → papan berisi semua 8 tier.
    try {
      if (new URLSearchParams(window.location.search).get('demo') === '1') {
        const st = stateRef.current;
        if (st) {
          st.board = [1, 2, 3, 4, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2, 1];
          st.score = 12345;
          st.spawnAt.clear();
          setHud({ score: 12345, best: getBest(BEST) });
          api.loop.start();
          setScreen('play');
        }
      }
    } catch {
      /* abaikan */
    }

    api.input.onDown = (p) => {
      api.sfx.ensure();
      swipeRef.current = { x: p.x, y: p.y };
    };
    api.input.onUp = (p) => {
      const s = swipeRef.current;
      swipeRef.current = null;
      if (!s || screenRef.current !== 'play') return;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    };

    api.setUpdate((dt) => {
      const st = stateRef.current;
      if (!st) return;
      st.time += dt;
      if (api.input.wasPressed('KeyZ') || api.input.wasPressed('KeyU')) doUndo();
      if (screenRef.current !== 'play') return;
      if (api.input.wasPressed('ArrowLeft') || api.input.wasPressed('KeyA')) doMove('left');
      else if (api.input.wasPressed('ArrowRight') || api.input.wasPressed('KeyD')) doMove('right');
      else if (api.input.wasPressed('ArrowUp') || api.input.wasPressed('KeyW')) doMove('up');
      else if (api.input.wasPressed('ArrowDown') || api.input.wasPressed('KeyS')) doMove('down');
      if (api.input.wasPressed('KeyP') || api.input.wasPressed('Escape')) {
        api.loop.setPaused(true);
        setScreen('pause');
      }
    });

    api.setRender(() => {
      const st = stateRef.current;
      if (st) drawGame(api, st);
    });

    return () => {
      apiRef.current = null;
    };
  });

  const start = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    api.sfx.click();
    resetGame();
    api.loop.setPaused(false);
    api.loop.start();
    setScreen('play');
  };

  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api || (screen !== 'play' && screen !== 'pause')) return;
    api.sfx.click();
    if (screen === 'play') {
      api.loop.setPaused(true);
      setScreen('pause');
    } else {
      api.loop.setPaused(false);
      setScreen('play');
    }
  };

  const toggleMute = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    setMuted(api.sfx.toggleMute());
  };

  const continueAfterWin = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.click();
    api.loop.setPaused(false);
    setScreen('play');
  };

  const btn: React.CSSProperties = {
    border: 'none', borderRadius: 12, padding: '10px 18px',
    fontWeight: 800, fontSize: 15, cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
  };

  return (
    <div ref={wrapRef} style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      height: '100%', background: '#0B1526', overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
    }}>
      {/* HUD */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', zIndex: 5 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>Gabung Blok</div>
          <div style={{ color: '#8EA2C7', fontSize: 11 }}>2048 ala kontraktor</div>
        </div>
        <div style={scoreBox}>SKOR<div style={scoreNum}>{hud.score}</div></div>
        <div style={scoreBox}>TERBAIK<div style={scoreNum}>{hud.best}</div></div>
        <button
          onClick={doUndo}
          style={{ ...iconBtn, opacity: canUndo ? 1 : 0.35 }}
          aria-label="Urungkan langkah terakhir"
          title="Urungkan (Z)"
        >
          ↩️
        </button>
        <button onClick={togglePause} style={iconBtn} aria-label="Jeda">
          {screen === 'pause' ? '▶' : '⏸'}
        </button>
        <button onClick={toggleMute} style={iconBtn} aria-label="Suara">
          {muted ? '🔇' : '🔊'}
        </button>
        <button onClick={onExit} style={iconBtn} aria-label="Keluar">✕</button>
      </div>

      <canvas ref={canvasRef} style={{ flex: 1, width: '100%', display: 'block', touchAction: 'none' }} />

      <div style={{ padding: '8px 12px 12px', color: '#8EA2C7', fontSize: 12, textAlign: 'center', zIndex: 5 }}>
        Swipe / Panah / WASD untuk geser blok • Z = undo
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <h2 style={h2}>🏗️ Gabung Blok</h2>
          <p style={p}>
            Geser blok bangunan untuk menggabungkan dua yang sama.
            Dari <b>BATA</b> sampai jadi <b>MENARA</b>!
          </p>
          <p style={{ ...p, fontSize: 13 }}>
            ↩️ Salah geser? <b>Undo</b> siap menyelamatkan — kayak revisi RAB yang bisa dibatalkan.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', margin: '10px 0' }}>
            {TIERS.map((t) => (
              <span key={t.name} style={{
                background: t.base, color: '#fff', fontSize: 10, fontWeight: 800,
                padding: '4px 8px', borderRadius: 8,
              }}>{t.name}</span>
            ))}
          </div>
          <p style={{ ...p, fontStyle: 'italic', color: '#9FB3D9' }}>
            "Kayak nyusun RAB: bata demi bata, ujung-ujungnya menara… atau revisi."
          </p>
          <button onClick={start} style={{ ...btn, background: '#F2B441', color: '#3A2A08' }}>Mulai</button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <h2 style={h2}>⏸️ Istirahat Dulu</h2>
          <p style={p}>Mandor lagi ngopi. Bloknya nggak ke mana-mana.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={togglePause} style={{ ...btn, background: '#F2B441', color: '#3A2A08' }}>Lanjut</button>
            <button onClick={start} style={{ ...btn, background: '#33456B', color: '#fff' }}>Ulangi</button>
          </div>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <h2 style={{ ...h2, color: '#FFE08A' }}>🎉 MENARA SELESAI!</h2>
          <p style={p}>Serah terima tanpa revisi! Klien sampai speechless.</p>
          <p style={p}>Skor: <b>{hud.score}</b></p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={continueAfterWin} style={{ ...btn, background: '#F2B441', color: '#3A2A08' }}>Lanjut Bangun</button>
            <button onClick={start} style={{ ...btn, background: '#33456B', color: '#fff' }}>Main Lagi</button>
          </div>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <h2 style={{ ...h2, color: '#FF8A8A' }}>🧱 Lahan Habis!</h2>
          <p style={p}>Kayak budget proyek — tiba-tiba nggak ada ruang gerak.</p>
          <p style={p}>Skor: <b>{hud.score}</b> • Terbaik: <b>{hud.best}</b></p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={doUndo} style={{ ...btn, background: '#4ade80', color: '#052e12' }}>↩️ Urungkan</button>
            <button onClick={start} style={{ ...btn, background: '#F2B441', color: '#3A2A08' }}>Main Lagi</button>
            <button onClick={onExit} style={{ ...btn, background: '#33456B', color: '#fff' }}>Keluar</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ---------------- styles ---------------- */
const scoreBox: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '6px 10px',
  color: '#8EA2C7', fontSize: 10, fontWeight: 800, textAlign: 'center', lineHeight: 1.2,
};
const scoreNum: React.CSSProperties = { color: '#fff', fontSize: 15, fontWeight: 900 };
const iconBtn: React.CSSProperties = {
  border: 'none', borderRadius: 10, width: 36, height: 36, fontSize: 16,
  background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer',
};
function Overlay({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7,12,24,0.82)', backdropFilter: 'blur(3px)',
      padding: 24, textAlign: 'center',
    }}>
      <div style={{
        background: '#141F38', borderRadius: 18, padding: 24, maxWidth: 340,
        border: '1px solid rgba(255,255,255,0.1)',
      }}>{children}</div>
    </div>
  );
}
const h2: React.CSSProperties = { color: '#fff', margin: '0 0 10px', fontSize: 24, fontWeight: 900 };
const p: React.CSSProperties = { color: '#C7D4EE', margin: '0 0 10px', fontSize: 14, lineHeight: 1.5 };

/* ---------------- render ---------------- */

interface BoardGeo {
  ox: number; oy: number; size: number; cell: number; gap: number; pad: number;
}

function boardGeo(W: number, H: number): BoardGeo {
  const size = Math.min(W - 24, H - 24);
  const pad = size * 0.045;
  const gap = size * 0.028;
  const cell = (size - pad * 2 - gap * 3) / 4;
  return { ox: (W - size) / 2, oy: (H - size) / 2, size, cell, gap, pad };
}

function cellCenter(geo: BoardGeo, i: number): { cx: number; cy: number } {
  const r = Math.floor(i / 4);
  const c = i % 4;
  return {
    cx: geo.ox + geo.pad + c * (geo.cell + geo.gap) + geo.cell / 2,
    cy: geo.oy + geo.pad + r * (geo.cell + geo.gap) + geo.cell / 2,
  };
}

function drawGame(api: GameApi, st: GameState): void {
  const { ctx, W, H } = api;
  const t = st.time;

  // --- langit malam proyek ---
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1B2F57');
  sky.addColorStop(0.55, '#101D3A');
  sky.addColorStop(1, '#0B1526');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // bintang
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 40; i += 1) {
    const bx = ((i * 97.3) % 1) * W;
    const by = ((i * 57.7) % 1) * H * 0.5;
    const tw = api.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(t * 2 + i);
    ctx.globalAlpha = 0.25 * tw;
    ctx.fillRect(bx, by, 2, 2);
  }
  ctx.globalAlpha = 1;

  // siluet gedung berlapis (parallax halus)
  const drift = api.reducedMotion ? 0 : Math.sin(t * 0.05) * 8;
  drawSkyline(ctx, W, H, 0.72, '#0E1A33', drift * 0.4, 0.5);
  drawSkyline(ctx, W, H, 0.86, '#0A1328', drift, 0.75);

  // --- papan ---
  const geo = boardGeo(W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = 'rgba(13,22,42,0.92)';
  rr(ctx, geo.ox, geo.oy, geo.size, geo.size, 16);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(140,170,220,0.25)';
  ctx.lineWidth = 2;
  rr(ctx, geo.ox, geo.oy, geo.size, geo.size, 16);
  ctx.stroke();

  // bevel + tekstur panel
  ctx.save();
  rr(ctx, geo.ox, geo.oy, geo.size, geo.size, 16);
  ctx.clip();
  const pb = ctx.createLinearGradient(0, geo.oy, 0, geo.oy + 60);
  pb.addColorStop(0, 'rgba(160,190,235,0.14)');
  pb.addColorStop(1, 'rgba(160,190,235,0)');
  ctx.fillStyle = pb;
  ctx.fillRect(geo.ox, geo.oy, geo.size, 60);
  drawNoise(ctx, W, H, '#9db8e8', 0.05);
  ctx.restore();

  // sel kosong
  for (let i = 0; i < 16; i += 1) {
    const { cx, cy } = cellCenter(geo, i);
    const x = cx - geo.cell / 2;
    const y = cy - geo.cell / 2;
    ctx.fillStyle = 'rgba(70,95,145,0.22)';
    rr(ctx, x, y, geo.cell, geo.cell, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    rr(ctx, x + 3, y + 3, geo.cell - 6, (geo.cell - 6) * 0.4, 7);
    ctx.fill();
  }

  // tile
  for (let i = 0; i < 16; i += 1) {
    const v = st.board[i];
    if (v <= 0) continue;
    const tier = Math.min(v - 1, MAX_TIER);
    const info = TIERS[tier];
    const { cx, cy } = cellCenter(geo, i);

    let scale = 1;
    const born = st.spawnAt.get(i);
    if (born !== undefined) {
      const age = clamp((t - born) / 0.25, 0, 1);
      scale = Math.max(0.01, easeOutBack(age));
    }

    const s = geo.cell * scale;
    const x = cx - s / 2;
    const y = cy - s / 2;

    ctx.save();
    // bayangan tile
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rr(ctx, x + 3, y + 5, s, s, 10 * scale);
    ctx.fill();

    // base gradien
    const g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, info.light);
    g.addColorStop(0.45, info.base);
    g.addColorStop(1, info.base);
    ctx.fillStyle = g;
    rr(ctx, x, y, s, s, 10 * scale);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2.5 * scale);
    ctx.strokeStyle = info.dark;
    ctx.stroke();

    // lapisan tekstur material per tier
    drawTileTexture(ctx, tier, x, y, s);

    // highlight atas
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rr(ctx, x + s * 0.08, y + s * 0.06, s * 0.84, s * 0.3, 8 * scale);
    ctx.fill();

    // ikon + label
    const labelH = s * 0.22;
    const iconS = s * 0.52;
    drawTierIcon(ctx, tier, cx, cy - s * 0.06, iconS);
    ctx.font = `900 ${Math.max(9, s * 0.15)}px 'Plus Jakarta Sans','Inter',system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ly = cy + s / 2 - labelH / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(info.name, cx, ly + 1);
    ctx.fillStyle = info.text;
    ctx.fillText(info.name, cx, ly);

    // flash gabungan
    const fl = st.flashAt.get(i);
    if (fl !== undefined) {
      const fa = clamp(1 - (t - fl) / 0.35, 0, 1);
      if (fa > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 * fa})`;
        rr(ctx, x, y, s, s, 10 * scale);
        ctx.fill();
      } else {
        st.flashAt.delete(i);
      }
    }
    ctx.restore();
  }

  // vignette + film grain
  drawNoise(ctx, W, H, '#cfe0ff', 0.045);
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawSkyline(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  baseY: number, color: string, drift: number, scale: number,
): void {
  ctx.fillStyle = color;
  const base = H * baseY;
  let x = -40 + drift;
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.beginPath();
  ctx.moveTo(x, H);
  ctx.lineTo(x, base);
  while (x < W + 40) {
    const w = (30 + rnd() * 60) * scale;
    const h = (30 + rnd() * 110) * scale;
    ctx.lineTo(x, base - h);
    // crane di beberapa gedung
    if (rnd() > 0.72) {
      ctx.lineTo(x + w * 0.5, base - h);
      ctx.lineTo(x + w * 0.5, base - h - 26 * scale);
      ctx.lineTo(x + w * 0.5 + 34 * scale, base - h - 26 * scale);
      ctx.lineTo(x + w * 0.5 + 34 * scale, base - h - 22 * scale);
      ctx.lineTo(x + w * 0.5, base - h - 22 * scale);
      ctx.lineTo(x + w * 0.5, base - h);
    }
    ctx.lineTo(x + w, base - h);
    ctx.lineTo(x + w, base);
    x += w + rnd() * 24;
  }
  ctx.lineTo(W + 40, H);
  ctx.closePath();
  ctx.fill();
}
