/**
 * Ular Kabel — ular kabel listrik merayap di area proyek.
 * Makan konektor 🔌 untuk memanjang (makin banyak = makin cepat!).
 * Jangan menabrak pagar proyek atau menggigit kabel sendiri.
 * Konektor emas ⭐ = bonus 25, muncul sebentar saja!
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, sfx, type GameApi } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import {
  COLS, ROWS, DIRS, createGame, turn, step, stepInterval, gradeFor,
  type SnakeState, type DirName,
} from './logic';

const SLUG = 'snake';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;
const LW = 440;
const LH = 440;
const CELL = LW / COLS;
const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';
interface Hud { score: number; eaten: number; best: number; speed: number }

export default function ArcadeSnake({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const rngRef = useRef<() => number>(() => Math.random());
  const screenRef = useRef<Screen>('ready');
  const stRef = useRef<SnakeState | null>(null);
  const accRef = useRef(0);
  const fxRef = useRef({ t: 0, deathAt: -9 });
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const [screen, setScreen] = useState<Screen>('ready');
  const [hud, setHud] = useState<Hud>({ score: 0, eaten: 0, best: getBest(bestKey(SLUG, 'best')), speed: 1 });
  const [muted, setMuted] = useState(false);
  const [isTouch] = useState(() => typeof window !== 'undefined' && 'ontouchstart' in window);

  const pushHud = (): void => {
    const st = stRef.current;
    if (!st) return;
    setHud({
      score: st.score,
      eaten: st.eaten,
      best: getBest(bestKey(SLUG, 'best')),
      speed: st.eaten + 1,
    });
  };

  const gameOver = (api: GameApi): void => {
    const st = stRef.current;
    if (!st) return;
    const nb = setBest(bestKey(SLUG, 'best'), st.score);
    void nb;
    sfx.fail();
    pushHud();
    window.setTimeout(() => { screenRef.current = 'over'; setScreen('over'); }, 850);
  };

  const restart = (): void => {
    stRef.current = createGame(rngRef.current);
    accRef.current = 0;
    pushHud();
    screenRef.current = 'ready';
    setScreen('ready');
  };

  const startPlay = (): void => {
    sfx.ensure();
    if (!stRef.current || stRef.current.dead) stRef.current = createGame(rngRef.current);
    accRef.current = 0;
    screenRef.current = 'play';
    setScreen('play');
  };

  const doTurn = (d: DirName): void => {
    const st = stRef.current;
    if (st && screenRef.current === 'play') turn(st, DIRS[d]);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    setMuted(sfx.muted);
    rngRef.current = mulberry32((Date.now() % 100000) | 0);
    stRef.current = createGame(rngRef.current);
    pushHud();

    api.setUpdate((dt) => {
      const fx = fxRef.current;
      fx.t += dt;
      const st = stRef.current;
      if (!st || screenRef.current !== 'play' || st.dead) return;
      // konektor emas kedaluwarsa
      if (st.gold) {
        st.goldT -= dt;
        if (st.goldT <= 0) { st.gold = null; st.goldT = 0; }
      }
      accRef.current += dt;
      const iv = stepInterval(st.eaten);
      let guard = 8;
      while (accRef.current >= iv && guard > 0) {
        guard -= 1;
        accRef.current -= iv;
        const ev = step(st, rngRef.current);
        if (ev === 'ate') {
          const hx = (st.snake[0].x + 0.5) * CELL;
          const hy = (st.snake[0].y + 0.5) * CELL;
          if (!api.reducedMotion) {
            api.particles.spawn(hx, hy, {
              count: 16, colors: ['#fde047', '#f59e0b', '#fef9c3', '#38bdf8'],
              speed: [60, 260], life: [0.3, 0.8], size: [2, 5], shape: 'circle',
            });
          }
          api.scores.add(hx, hy - 14, '+10', { color: '#fde047', size: 18 });
          sfx.pop(1.0 + Math.min(0.8, st.eaten * 0.03));
          pushHud();
        } else if (ev === 'ate-gold') {
          const hx = (st.snake[0].x + 0.5) * CELL;
          const hy = (st.snake[0].y + 0.5) * CELL;
          if (!api.reducedMotion) {
            api.particles.spawn(hx, hy, {
              count: 30, colors: ['#fef08a', '#fbbf24', '#fff', '#f59e0b'],
              speed: [80, 380], life: [0.4, 1.1], size: [2, 6], shape: 'rect', rotation: true,
            });
          }
          api.scores.add(hx, hy - 16, '+25 ⭐', { color: '#fbbf24', size: 20 });
          sfx.chime(3, 880);
          pushHud();
        } else if (ev === 'died') {
          const hx = (st.snake[0].x + 0.5) * CELL;
          const hy = (st.snake[0].y + 0.5) * CELL;
          api.shake.add(0.9);
          if (!api.reducedMotion) {
            api.particles.spawn(hx, hy, {
              count: 30, colors: ['#ef4444', '#f97316', '#78350f', '#fbbf24'],
              speed: [80, 400], life: [0.4, 1.1], size: [2, 6], shape: 'rect', rotation: true,
            });
          }
          sfx.crumble(1.2);
          fx.deathAt = fx.t;
          gameOver(api);
        }
      }
    });

    api.setRender(() => {
      const st = stRef.current;
      if (!st) return;
      const { ctx } = api;
      const s = api.W / LW;
      ctx.save();
      ctx.scale(s, s);
      const t = fxRef.current.t;
      drawFloor(ctx, t);
      drawFood(ctx, st, t);
      drawSnake(ctx, st, t, screenRef.current);
      drawFence(ctx, t);
      if (screenRef.current === 'ready') {
        ctx.save();
        ctx.fillStyle = 'rgba(2,6,23,0.55)'; ctx.fillRect(0, 0, LW, LH);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.font = `900 28px ${FONT}`;
        ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 16;
        ctx.fillText('🐍 ULAR KABEL', LW / 2, LH * 0.32);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#bae6fd'; ctx.font = `700 14px ${FONT}`;
        ctx.fillText('Makan konektor 🔌 biar kabelmu memanjang.', LW / 2, LH * 0.32 + 34);
        ctx.fillText('Jangan tabrak pagar proyek atau gigit kabel sendiri!', LW / 2, LH * 0.32 + 56);
        ctx.fillStyle = '#fde68a'; ctx.font = `600 13px ${FONT}`;
        ctx.fillText('Konektor emas ⭐ = bonus 25 • makin kenyang makin ngebut ⚡', LW / 2, LH * 0.32 + 78);
        ctx.fillStyle = '#e2e8f0'; ctx.font = `700 13px ${FONT}`;
        ctx.fillText(isTouch ? 'Geser (swipe) untuk belok' : '← ↑ ↓ → / WASD untuk belok', LW / 2, LH * 0.32 + 102);
        const pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fde68a'; ctx.font = `900 17px ${FONT}`;
        ctx.fillText(isTouch ? 'KETUK UNTUK MULAI' : 'TEKAN SPASI / KETUK UNTUK MULAI', LW / 2, LH * 0.32 + 140);
        ctx.restore();
      }
      ctx.restore();
    });

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current === 'ready') { startPlay(); return; }
      if (screenRef.current !== 'play') return;
      swipeRef.current = { x: p.x, y: p.y };
    };
    api.input.onUp = (p) => {
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start || screenRef.current !== 'play') return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) doTurn(dx > 0 ? 'right' : 'left');
      else doTurn(dy > 0 ? 'down' : 'up');
    };

    const kd = (e: KeyboardEvent): void => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (screenRef.current === 'play') { api.loop.setPaused(true); screenRef.current = 'pause'; setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); screenRef.current = 'play'; setScreen('play'); }
        return;
      }
      if (screenRef.current === 'ready' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault(); startPlay(); return;
      }
      if (screenRef.current !== 'play') return;
      const map: Record<string, DirName> = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
      };
      const d = map[e.code];
      if (d) { e.preventDefault(); doTurn(d); }
    };
    window.addEventListener('keydown', kd);
    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__snake = {
        get screen() { return screenRef.current; },
        get score() { return stRef.current?.score ?? 0; },
        get dead() { return stRef.current?.dead ?? false; },
        get eaten() { return stRef.current?.eaten ?? 0; },
        get head() { const h = stRef.current?.snake[0]; return h ? { ...h } : null; },
        get food() { const f = stRef.current?.food; return f ? { ...f } : null; },
        start: () => startPlay(),
        turn: (d: DirName) => doTurn(d),
        stepOnce: () => { const st = stRef.current; return st ? step(st, rngRef.current) : 'died'; },
        state: () => stRef.current,
      };
    }
    return () => {
      window.removeEventListener('keydown', kd);
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__snake;
    };
  });

  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    screenRef.current = 'pause'; setScreen('pause');
  };
  const doResume = (): void => {
    sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    screenRef.current = 'play'; setScreen('play');
  };
  const toggleMute = (): void => { sfx.ensure(); setMuted(sfx.toggleMute()); };
  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: FONT,
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0d1420', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 560, aspectRatio: '1 / 1', maxHeight: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
          <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 12px', color: '#fde68a', fontWeight: 800, fontSize: 14 }}>⭐ {hud.score}</div>
          <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 10px', color: '#7dd3fc', fontWeight: 800, fontSize: 13 }}>🔌 {hud.eaten}</div>
          <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#c4b5fd', fontWeight: 800, fontSize: 13 }}>⚡x{hud.speed}</div>
          <div style={{ flex: 1 }} />
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
        </div>
        {screen === 'pause' && (
          <Overlay>
            <div style={{ fontSize: 44 }}>🔌</div>
            <h2 style={titleStyle}>JEDA</h2>
            <p style={textStyle}>Kabelnya ikut istirahat. Jangan sampai korslet ya!</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
              <button style={secondaryBtn} onClick={restart}>Ulangi</button>
            </div>
          </Overlay>
        )}
        {screen === 'over' && (
          <Overlay>
            <div style={{ fontSize: 44 }}>⚡</div>
            <h2 style={titleStyle}>KORSLET!</h2>
            <p style={{ ...textStyle, fontSize: 16 }}>
              Skor: <b>{hud.score}</b> • Konektor: <b>{hud.eaten}</b> 🔌<br />
              Grade: <b>{gradeFor(hud.score)}</b> • Terbaik: <b>{hud.best}</b>
              {hud.score > 0 && hud.score >= hud.best && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={primaryBtn} onClick={() => { sfx.ensure(); restart(); }}>Main Lagi 🔁</button>
              <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lantai site: beton bertekstur + grid samar + noda. */
function drawFloor(ctx: CanvasRenderingContext2D, t: number): void {
  const g = ctx.createLinearGradient(0, 0, LW, LH);
  g.addColorStop(0, '#b8a888'); g.addColorStop(0.5, '#a89880'); g.addColorStop(1, '#96866e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  // ubin beton
  ctx.strokeStyle = 'rgba(70,55,40,0.28)'; ctx.lineWidth = 1.5;
  for (let x = 0; x <= LW; x += CELL * 2) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LH); ctx.stroke();
  }
  for (let y = 0; y <= LH; y += CELL * 2) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LW, y); ctx.stroke();
  }
  // noda oli & debu
  ctx.fillStyle = 'rgba(60,45,30,0.18)';
  const spots: Array<[number, number, number]> = [[90, 120, 16], [330, 300, 22], [200, 380, 12], [380, 90, 10], [150, 220, 8]];
  for (const [sx, sy, sr] of spots) {
    ctx.beginPath(); ctx.ellipse(sx, sy, sr, sr * 0.6, 0.4, 0, TAU); ctx.fill();
  }
  // garis marka kuning site
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 2);
  ctx.strokeStyle = '#eab308'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
  ctx.strokeRect(28, 28, LW - 56, LH - 56);
  ctx.restore();
}

/** Pagar proyek: bingkai garis kuning-hitam di tepi arena. */
function drawFence(ctx: CanvasRenderingContext2D, t: number): void {
  const band = 12;
  ctx.save();
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(0, 0, LW, band); ctx.fillRect(0, LH - band, LW, band);
  ctx.fillRect(0, 0, band, LH); ctx.fillRect(LW - band, 0, band, LH);
  ctx.fillStyle = '#1c1917';
  const off = (t * 30) % 32;
  for (let x = -32 + off; x < LW + 32; x += 32) {
    stripe(ctx, x, 0, band); stripe(ctx, x, LH - band, band);
  }
  for (let y = -32 + off; y < LH + 32; y += 32) {
    stripeV(ctx, 0, y, band); stripeV(ctx, LW - band, y, band);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  ctx.strokeRect(band, band, LW - band * 2, LH - band * 2);
  ctx.restore();
}

function stripe(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + h); ctx.lineTo(x + 16, y + h); ctx.lineTo(x + 32, y); ctx.lineTo(x + 16, y);
  ctx.closePath(); ctx.fill();
}
function stripeV(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + 16); ctx.lineTo(x, y + 32);
  ctx.closePath(); ctx.fill();
}

/** Konektor: stopkontak biru + varian emas bonus. */
function drawFood(ctx: CanvasRenderingContext2D, st: SnakeState, t: number): void {
  drawSocket(ctx, st.food.x, st.food.y, false, t);
  if (st.gold) drawSocket(ctx, st.gold.x, st.gold.y, true, t);
}

function drawSocket(ctx: CanvasRenderingContext2D, gx: number, gy: number, gold: boolean, t: number): void {
  const cx = (gx + 0.5) * CELL;
  const cy = (gy + 0.5) * CELL;
  const pulse = 1 + 0.08 * Math.sin(t * (gold ? 9 : 5));
  const r = CELL * 0.42 * pulse;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = gold ? '#fbbf24' : '#38bdf8';
  ctx.shadowBlur = gold ? 18 : 12;
  // pelat stopkontak
  const g = ctx.createLinearGradient(-r, -r, r, r);
  if (gold) { g.addColorStop(0, '#fef3c7'); g.addColorStop(0.5, '#fbbf24'); g.addColorStop(1, '#b45309'); }
  else { g.addColorStop(0, '#e0f2fe'); g.addColorStop(0.5, '#7dd3fc'); g.addColorStop(1, '#0284c7'); }
  ctx.fillStyle = g;
  roundRect(ctx, -r, -r, r * 2, r * 2, 5); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = gold ? '#92400e' : '#0c4a6e'; ctx.lineWidth = 2;
  roundRect(ctx, -r, -r, r * 2, r * 2, 5); ctx.stroke();
  // dua lubang colokan
  ctx.fillStyle = gold ? '#78350f' : '#0c4a6e';
  roundRect(ctx, -r * 0.55, -r * 0.28, r * 0.32, r * 0.56, 3); ctx.fill();
  roundRect(ctx, r * 0.23, -r * 0.28, r * 0.32, r * 0.56, 3); ctx.fill();
  // kilau
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-r * 0.8, -r * 0.8, r * 1.2, r * 0.25);
  if (gold) {
    // bintang berputar
    ctx.fillStyle = '#fffbeb';
    for (let i = 0; i < 4; i += 1) {
      const a = t * 3 + (i / 4) * TAU;
      ctx.beginPath(); ctx.arc(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7), 2.2, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

/** Ular kabel: badan kabel tembaga + kepala steker bermata. */
function drawSnake(ctx: CanvasRenderingContext2D, st: SnakeState, t: number, screen: string): void {
  const segs = st.snake;
  if (segs.length === 0) return;
  const pts = segs.map((p) => ({ x: (p.x + 0.5) * CELL, y: (p.y + 0.5) * CELL }));
  const wBody = CELL * 0.74;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // lapisan luar: isolasi gelap
  ctx.strokeStyle = st.dead ? '#57534e' : '#7c2d12';
  ctx.lineWidth = wBody;
  strokePath(ctx, pts);
  // lapisan tengah: tembaga
  const cg = ctx.createLinearGradient(0, 0, LW, LH);
  cg.addColorStop(0, '#fdba74'); cg.addColorStop(0.5, '#f59e0b'); cg.addColorStop(1, '#ea580c');
  ctx.strokeStyle = st.dead ? '#a8a29e' : cg;
  ctx.lineWidth = wBody * 0.68;
  strokePath(ctx, pts);
  // highlight atas
  ctx.strokeStyle = st.dead ? 'rgba(255,255,255,0.25)' : 'rgba(255,237,213,0.55)';
  ctx.lineWidth = wBody * 0.22;
  const hi = pts.map((p) => ({ x: p.x, y: p.y - wBody * 0.18 }));
  strokePath(ctx, hi);
  // garis isolasi tiap segmen
  ctx.strokeStyle = st.dead ? 'rgba(0,0,0,0.15)' : 'rgba(124,45,18,0.5)';
  ctx.lineWidth = 2;
  for (let i = 2; i < pts.length - 1; i += 2) {
    const a = pts[i]; const b = pts[i + 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(a.x + Math.cos(ang) * wBody * 0.3, a.y + Math.sin(ang) * wBody * 0.3);
    ctx.lineTo(a.x - Math.cos(ang) * wBody * 0.3, a.y - Math.sin(ang) * wBody * 0.3);
    ctx.stroke();
  }
  // kepala = steker
  const h = pts[0];
  const n = pts[1] ?? { x: h.x - CELL, y: h.y };
  const ang = Math.atan2(h.y - n.y, h.x - n.x);
  ctx.translate(h.x, h.y); ctx.rotate(ang);
  const hr = wBody * 0.62;
  // dua pin steker di depan
  ctx.fillStyle = st.dead ? '#78716c' : '#e7e5e4';
  ctx.strokeStyle = '#44403c'; ctx.lineWidth = 1.5;
  for (const oy of [-hr * 0.42, hr * 0.42]) {
    roundRect(ctx, hr * 0.7, oy - 3, 12, 6, 2); ctx.fill(); ctx.stroke();
  }
  // badan steker
  const hg = ctx.createLinearGradient(0, -hr, 0, hr);
  hg.addColorStop(0, '#fcd34d'); hg.addColorStop(1, '#d97706');
  ctx.fillStyle = st.dead ? '#a8a29e' : hg;
  roundRect(ctx, -hr, -hr * 0.9, hr * 1.7, hr * 1.8, 7); ctx.fill();
  ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2;
  roundRect(ctx, -hr, -hr * 0.9, hr * 1.7, hr * 1.8, 7); ctx.stroke();
  // mata (kedip)
  const blink = Math.sin(t * 2.3) > -0.96;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(hr * 0.1, -hr * 0.38, 5.4, blink ? 5.4 : 1, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hr * 0.1, hr * 0.38, 5.4, blink ? 5.4 : 1, 0, 0, TAU); ctx.fill();
  if (blink) {
    ctx.fillStyle = st.dead ? '#57534e' : '#0f172a';
    ctx.beginPath(); ctx.arc(hr * 0.1 + 1.6, -hr * 0.38, 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hr * 0.1 + 1.6, hr * 0.38, 2.6, 0, TAU); ctx.fill();
  }
  // mulut: senyum / X_X saat mati
  ctx.strokeStyle = '#451a03'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  if (st.dead || screen === 'over') {
    ctx.moveTo(hr * 0.28, -hr * 0.05); ctx.lineTo(hr * 0.52, hr * 0.12);
    ctx.moveTo(hr * 0.52, -hr * 0.05); ctx.lineTo(hr * 0.28, hr * 0.12);
  } else {
    ctx.arc(hr * 0.32, 0, hr * 0.34, -0.7, 0.7);
  }
  ctx.stroke();
  ctx.restore();
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0', textShadow: '0 2px 12px rgba(245,158,11,0.6)', letterSpacing: 1 };
const textStyle: React.CSSProperties = { color: '#e2e8f0', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 320 };
const primaryBtn: React.CSSProperties = { background: 'linear-gradient(135deg,#fbbf24,#f97316)', color: '#431407', fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14, padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT, boxShadow: '0 6px 20px rgba(251,146,60,0.4)' };
const secondaryBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT };
function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(7,11,26,0.72)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      {children}
    </div>
  );
}
