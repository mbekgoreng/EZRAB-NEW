/**
 * ArcadeSortirMaterial ("Sortir Material") — material jatuh dari conveyor,
 * seret ke bin yang benar: 🧱 BATA, 🪵 KAYU, 🔩 BESI. Salah bin atau lolos
 * = nyawa berkurang. Makin lama makin cepat!
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  BINS, MAX_LIVES, fallSpeed, spawnInterval, spawnItem, sortResult,
  scoreFor, levelAt, type SortItem, type MatKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('sortir-material', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  items: SortItem[];
  dragId: number | null;
  dragDX: number;
  dragDY: number;
  spawnT: number;
  nextId: number;
  elapsed: number;
  score: number;
  streak: number;
  bestStreak: number;
  lives: number;
  sorted: number;
  level: number;
  over: boolean;
  t: number;
}

export default function ArcadeSortirMaterial({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, lives: MAX_LIVES, streak: 0, best: getBest(BK, 0), level: 1, bestStreak: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const binRect = (W: number, H: number, i: number): { x: number; y: number; w: number; h: number } => {
    const w = W / 3 - 14;
    const h = 108;
    const x = 7 + i * (W / 3);
    const y = H - h - 26;
    return { x, y, w, h };
  };
  const binAt = (W: number, H: number, px: number, py: number): number => {
    for (let i = 0; i < 3; i += 1) {
      const b = binRect(W, H, i);
      if (px >= b.x && px <= b.x + b.w && py >= b.y - 30 && py <= b.y + b.h) return i;
    }
    return -1;
  };
  const lanes = (W: number): number[] => [W * 0.2, W * 0.5, W * 0.8];

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      items: [], dragId: null, dragDX: 0, dragDY: 0, spawnT: 0.8, nextId: 1,
      elapsed: 0, score: 0, streak: 0, bestStreak: 0, lives: MAX_LIVES,
      sorted: 0, level: 1, over: false, t: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, lives: s.lives, streak: s.streak, best: getBest(BK, 0), level: s.level, bestStreak: s.bestStreak });
    };

    const reset = (): void => {
      s.items = []; s.dragId = null; s.spawnT = 0.8; s.nextId = 1;
      s.elapsed = 0; s.score = 0; s.streak = 0; s.bestStreak = 0;
      s.lives = MAX_LIVES; s.sorted = 0; s.level = 1; s.over = false;
      push();
    };

    const loseLife = (reason: string, x: number, y: number): void => {
      s.lives -= 1;
      s.streak = 0;
      sfx.fail();
      api.shake.add(0.5);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, reason, { size: 17, color: '#f87171' });
      api.scores.add(x, y, '💔 -1', { color: '#f87171', size: 20 });
      if (s.lives <= 0) {
        s.over = true;
        const nb = setBest(BK, s.score);
        sfx.chime(2, 440);
        const w2 = wrapRef.current;
        if (w2) popText(w2, 'MATERIAL BERANTAKAN!', { size: 26, color: '#f87171' });
        api.pushHud({ score: s.score, lives: 0, streak: s.streak, best: nb, level: s.level, bestStreak: s.bestStreak });
        window.setTimeout(() => setScreen('over'), 1300);
      }
      push();
    };

    const BIN_ORDER: MatKind[] = ['bata', 'kayu', 'besi'];

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      // cari item teratas dalam jangkauan jari
      for (let i = s.items.length - 1; i >= 0; i -= 1) {
        const it = s.items[i];
        if (Math.hypot(it.x - p.x, it.y - p.y) < 44) {
          s.dragId = it.id;
          s.dragDX = it.x - p.x;
          s.dragDY = it.y - p.y;
          // angkat ke atas tumpukan
          s.items.splice(i, 1);
          s.items.push(it);
          sfx.pop(1.2);
          return;
        }
      }
    };
    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.over || s.dragId === null) return;
      const it = s.items.find((v) => v.id === s.dragId);
      if (!it) return;
      it.x = clamp(p.x + s.dragDX, 24, api.W - 24);
      it.y = clamp(p.y + s.dragDY, 90, api.H - 40);
    };
    api.input.onUp = (p) => {
      if (screenRef.current !== 'play' || s.over || s.dragId === null) return;
      const idx = s.items.findIndex((v) => v.id === s.dragId);
      s.dragId = null;
      if (idx < 0) return;
      const it = s.items[idx];
      const bi = binAt(api.W, api.H, p.x, p.y);
      if (bi < 0) return; // dilepas di udara: biarkan jatuh lagi
      const res = sortResult(it.kind, BIN_ORDER[bi]);
      const b = binRect(api.W, api.H, bi);
      const bx = b.x + b.w / 2;
      const by = b.y + 20;
      if (res === 'correct') {
        s.streak += 1;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        const pts = scoreFor(s.streak);
        s.score += pts;
        s.sorted += 1;
        sfx.pop(1 + Math.min(0.5, s.streak * 0.04));
        api.scores.add(bx, by - 44, `+${pts}`, { color: '#4ade80', size: 21 });
        api.particles.spawn(bx, by, {
          count: 12, colors: ['#4ade80', '#bbf7d0', '#ffffff'], speed: [60, 240],
          life: [0.3, 0.7], size: [2, 5], gravity: 420, shape: 'circle',
        });
        if (s.streak > 0 && s.streak % 8 === 0) {
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `🔥 STREAK x${s.streak}! Mandor bangga!`, { size: 18, color: '#fb923c' });
        }
        s.items.splice(idx, 1);
      } else {
        s.items.splice(idx, 1);
        loseLife(`SALAH BIN! Itu ${BINS[it.kind].name}, bukan ${BINS[BIN_ORDER[bi]].name}!`, bx, by - 40);
      }
      push();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (screenRef.current !== 'play' || s.over) return;
      s.elapsed += dt;

      const lv = levelAt(s.elapsed);
      if (lv > s.level) {
        s.level = lv;
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `⚡ LEVEL ${lv}: CONVEYOR NGEBUT!`, { size: 19, color: '#fde047' });
        sfx.chime(2);
      }

      // spawn
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = spawnInterval(s.elapsed);
        if (s.items.length < 9) {
          s.items.push(spawnItem(rng, s.nextId++, lanes(api.W), -30));
        }
      }
      // jatuh
      const vy = fallSpeed(s.elapsed);
      const binTop = api.H - 108 - 26;
      for (let i = s.items.length - 1; i >= 0; i -= 1) {
        const it = s.items[i];
        if (it.id === s.dragId) continue;
        it.y += vy * dt;
        it.x += Math.sin(s.t * 3 + it.id) * 8 * dt;
        if (it.y > binTop + 30) {
          s.items.splice(i, 1);
          loseLife('LOLOS! Material jatuh ke tanah!', it.x, binTop);
          if (s.over) return;
        }
      }
      push();
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#3b2f23');
      bg.addColorStop(0.55, '#2c2318');
      bg.addColorStop(1, '#1d160e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // dinding gudang: panel seng
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2;
      for (let x = 20; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, H); ctx.stroke(); }
      // lampu gantung
      for (const lx of [W * 0.25, W * 0.75]) {
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx, 80); ctx.lineTo(lx, 108); ctx.stroke();
        const gl = ctx.createRadialGradient(lx, 118, 2, lx, 118, 46);
        gl.addColorStop(0, 'rgba(253,224,71,0.35)');
        gl.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(lx, 118, 46, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(lx, 114, 7, 0, TAU); ctx.fill();
      }
    };

    const drawConveyor = (ctx: CanvasRenderingContext2D, W: number): void => {
      const y = 96;
      const bg = ctx.createLinearGradient(0, y, 0, y + 30);
      bg.addColorStop(0, '#52525b');
      bg.addColorStop(1, '#27272a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, y, W, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      const off = (s.t * 60) % 52;
      for (let x = -off; x < W; x += 52) ctx.fillRect(x, y, 26, 30);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, y + 30, W, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.font = `900 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('🏭 CONVEYOR MATERIAL — SERET KE BIN YANG BENAR!', W / 2, y + 52);
    };

    const drawBin = (ctx: CanvasRenderingContext2D, W: number, H: number, i: number): void => {
      const b = binRect(W, H, i);
      const kind = (['bata', 'kayu', 'besi'] as MatKind[])[i];
      const def = BINS[kind];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      // badan bin
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, '#6b5a44');
      g.addColorStop(1, '#3d3222');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x, b.y, b.w, b.h, 12);
      else ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill();
      ctx.restore();
      // aksen warna jenis
      ctx.fillStyle = def.color;
      ctx.fillRect(b.x, b.y, b.w, 10);
      // mulut bin (terbuka)
      const mouth = ctx.createLinearGradient(0, b.y + 10, 0, b.y + 34);
      mouth.addColorStop(0, '#0c0a06');
      mouth.addColorStop(1, '#241c10');
      ctx.fillStyle = mouth;
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + 18, b.w / 2 - 8, 12, 0, 0, TAU);
      ctx.fill();
      // label
      ctx.fillStyle = '#fff';
      ctx.font = `900 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${def.emoji} ${def.name}`, b.x + b.w / 2, b.y + b.h - 16);
      // papan kayu
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x + 6, b.y + 52); ctx.lineTo(b.x + b.w - 6, b.y + 52); ctx.stroke();
    };

    const drawItem = (ctx: CanvasRenderingContext2D, it: SortItem): void => {
      const dragged = it.id === s.dragId;
      ctx.save();
      ctx.translate(it.x, it.y);
      if (dragged) ctx.scale(1.18, 1.18);
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = dragged ? 16 : 7;
      ctx.shadowOffsetY = dragged ? 8 : 4;
      const v = it.variant;
      if (it.kind === 'bata') {
        const w = 44 - v * 4;
        const g = ctx.createLinearGradient(0, -11, 0, 11);
        g.addColorStop(0, '#f87171');
        g.addColorStop(1, '#b91c1c');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -11, w, 22, 4);
        else ctx.rect(-w / 2, -11, w, 22);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-w / 2 + 2, 0); ctx.lineTo(w / 2 - 2, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w / 6, -11); ctx.lineTo(-w / 6, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 6, 0); ctx.lineTo(w / 6, 11); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-w / 2 + 3, -11 + 2, w - 6, 5);
      } else if (it.kind === 'kayu') {
        const w = 52 - v * 5;
        const g = ctx.createLinearGradient(0, -9, 0, 9);
        g.addColorStop(0, '#d9a05b');
        g.addColorStop(0.5, '#b45309');
        g.addColorStop(1, '#7c3a06');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -9, w, 18, 4);
        else ctx.rect(-w / 2, -9, w, 18);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(90,50,10,0.6)';
        ctx.lineWidth = 1.5;
        for (const oy of [-4, 1, 5]) {
          ctx.beginPath();
          ctx.moveTo(-w / 2 + 4, oy);
          ctx.bezierCurveTo(-w / 6, oy + 2, w / 6, oy - 2, w / 2 - 4, oy + 1);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,235,190,0.35)';
        ctx.fillRect(-w / 2 + 3, -9 + 2, w - 6, 4);
      } else {
        // besi: balok I
        const g = ctx.createLinearGradient(-8, 0, 8, 0);
        g.addColorStop(0, '#475569');
        g.addColorStop(0.5, '#cbd5e1');
        g.addColorStop(1, '#334155');
        ctx.fillStyle = g;
        ctx.fillRect(-22, -13, 44, 7);
        ctx.fillRect(-22, 6, 44, 7);
        ctx.fillRect(-5, -13, 10, 26);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-22, -13, 44, 2.5);
      }
      ctx.restore();
      // cincin saat diseret
      if (dragged) {
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(it.x, it.y, 34 + Math.sin(s.t * 8) * 2, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    };

    const drawLives = (ctx: CanvasRenderingContext2D, W: number): void => {
      ctx.font = '18px ' + FONT;
      ctx.textAlign = 'right';
      let hearts = '';
      for (let i = 0; i < MAX_LIVES; i += 1) hearts += i < s.lives ? '❤️' : '🖤';
      ctx.fillText(hearts, W - 14, 178);
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      drawConveyor(ctx, W);
      for (const it of s.items) drawItem(ctx, it);
      for (let i = 0; i < 3; i += 1) drawBin(ctx, W, H, i);
      drawLives(ctx, W);
      ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,6,2,0.5)');
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
    (apiRef.current as unknown as { __reset?: () => void } | null)?.__reset?.();
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
    background: 'rgba(20,14,8,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 620, overflow: 'hidden', borderRadius: 18, background: '#2c2318', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(20,14,8,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            ⚡ Level {hud.level} {hud.streak >= 2 && <span style={{ color: '#fb923c', fontWeight: 900 }}>• 🔥x{hud.streak}</span>}
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
          <div style={{ fontSize: 42 }}>🏭</div>
          <h2 style={h2}>SORTIR MATERIAL</h2>
          <p style={p}>
            Material berjatuhan dari conveyor! <b>Seret</b> tiap material ke bin yang benar:
            🧱 <b>BATA</b>, 🪵 <b>KAYU</b>, 🔩 <b>BESI</b>. Salah bin atau material
            lolos jatuh = <b>❤️ nyawa berkurang</b> (3x = bubar!). Conveyor makin ngebut tiap level!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Menyortir</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Conveyor dimatikan dulu. Materialnya antre rapi.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>💥</div>
          <h2 style={h2}>GUDANG BERANTAKAN!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Level" value={`⚡${hud.level}`} />
            <Stat label="Streak max" value={`🔥${hud.bestStreak}x`} />
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#fef3c7' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fbbf24', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(24,16,6,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#4a3a24,#221a0e)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)', maxHeight: '92%', overflowY: 'auto' }}>
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

void clamp;
