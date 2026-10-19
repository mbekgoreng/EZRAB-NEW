/**
 * Hujan Bata — drone proyek menembak paku ke bata-bata yang jatuh ke site,
 * sambil menghindari drone maling material. Reskin konstruksi dari Asteroids.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import {
  createState, stepShip, fireBullet, updateState, mulberry32,
  LW, LH, SHIP_R, RESPAWN_T,
  type AstroState, type Rock, type Saucer,
} from './logic';

const SLUG = 'asteroids';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;
const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';
interface Hud { score: number; lives: number; level: number; best: number }

interface Star { x: number; y: number; z: number; tw: number }
function makeStars(n: number, seed: number): Star[] {
  const r = mulberry32(seed);
  const out: Star[] = [];
  for (let i = 0; i < n; i += 1) out.push({ x: r() * LW, y: r() * LH, z: 0.3 + r() * 0.7, tw: r() * TAU });
  return out;
}

/** Drone proyek: badan kapsul + 4 lengan propeller yang berputar. */
function drawDrone(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, thrusting: boolean, t: number, ghost: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  if (ghost) ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 14);
  // semburan debu pendorong
  if (thrusting) {
    const fl = 14 + Math.random() * 10;
    const fg = ctx.createLinearGradient(0, 10, 0, 10 + fl);
    fg.addColorStop(0, 'rgba(255,244,214,0.95)');
    fg.addColorStop(0.5, 'rgba(251,191,36,0.7)');
    fg.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-6, 10); ctx.lineTo(0, 10 + fl); ctx.lineTo(6, 10);
    ctx.closePath(); ctx.fill();
  }
  const arm = 13;
  // lengan propeller
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-arm, -arm); ctx.lineTo(arm, -arm);
  ctx.moveTo(-arm, arm); ctx.lineTo(arm, arm);
  ctx.stroke();
  // propeller berputar (blur elips)
  ctx.fillStyle = 'rgba(203,213,225,0.55)';
  const pr = 9 + Math.sin(t * 40) * 1.5;
  for (const [px, py] of [[-arm, -arm], [arm, -arm], [-arm, arm], [arm, arm]]) {
    ctx.beginPath(); ctx.ellipse(px, py, pr, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(203,213,225,0.55)';
  }
  // badan kapsul kuning proyek
  ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 14;
  const bg = ctx.createLinearGradient(0, -SHIP_R - 2, 0, SHIP_R);
  bg.addColorStop(0, '#fde68a'); bg.addColorStop(0.55, '#f59e0b'); bg.addColorStop(1, '#b45309');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(0, 0, 8.5, SHIP_R + 2, 0, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, 0, 8.5, SHIP_R + 2, 0, 0, TAU); ctx.stroke();
  // kamera / mata drone
  ctx.beginPath(); ctx.arc(0, -4, 3.8, 0, TAU);
  const cg = ctx.createRadialGradient(-1, -5, 0.5, 0, -4, 4);
  cg.addColorStop(0, '#fef9c3'); cg.addColorStop(1, '#0369a1');
  ctx.fillStyle = cg; ctx.fill();
  // strip reflektif
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-6, 3, 12, 2.6);
  ctx.restore();
}

/** Bata merah jatuh: balok bertekstur bata + pecahan sudut. */
function drawBrick(ctx: CanvasRenderingContext2D, r: Rock): void {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.rot);
  const w = r.r * 1.7; const h = r.r * 1.05;
  ctx.beginPath();
  const n = r.verts.length;
  // poligon bata agak bergerigi
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * TAU;
    const rr = 0.5 * (w + h) * 0.5 * r.verts[i % n];
    const px = Math.cos(a) * rr * 1.35; const py = Math.sin(a) * rr * 0.85;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#f87171'); g.addColorStop(0.55, '#dc2626'); g.addColorStop(1, '#991b1b');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 2; ctx.stroke();
  // garis spesi bata
  ctx.strokeStyle = 'rgba(127,29,29,0.6)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-w * 0.4, 0); ctx.lineTo(w * 0.4, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -h * 0.4); ctx.lineTo(0, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w * 0.2, 0); ctx.lineTo(-w * 0.2, h * 0.4); ctx.stroke();
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.16);
  ctx.restore();
}

/** Drone maling material: merah menyala, menggotong karung semen curian. */
function drawRivalDrone(ctx: CanvasRenderingContext2D, sc: Saucer, t: number): void {
  ctx.save();
  ctx.translate(sc.x, sc.y);
  ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 16;
  // badan merah
  const g = ctx.createLinearGradient(0, -10, 0, 10);
  g.addColorStop(0, '#fca5a5'); g.addColorStop(0.55, '#dc2626'); g.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -4, 20, 8, 0, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  // propeller
  ctx.fillStyle = 'rgba(254,202,202,0.6)';
  for (const px of [-16, 16]) {
    ctx.beginPath(); ctx.ellipse(px, -10, 10, 3, 0, 0, TAU); ctx.fill();
  }
  // karung semen curian di bawah
  ctx.fillStyle = '#d6c9a8';
  ctx.beginPath();
  ctx.moveTo(-8, 4); ctx.lineTo(8, 4); ctx.lineTo(6, 16); ctx.lineTo(-6, 16);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#78716c'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#57534e'; ctx.font = '700 7px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SMN', 0, 10);
  // tali
  ctx.strokeStyle = '#44403c'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-5, 5); ctx.moveTo(5, 2); ctx.lineTo(5, 5); ctx.stroke();
  // lampu alarm keliling
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + t * 6;
    const on = Math.sin(t * 10 + i) > 0;
    ctx.fillStyle = on ? '#fde047' : '#713f12';
    ctx.beginPath(); ctx.arc(Math.cos(a) * 17, -4 + Math.sin(a) * 6, 2.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

interface TouchBtn { id: string; x: number; y: number; r: number; label: string }
const BTNS: TouchBtn[] = [
  { id: 'left', x: 46, y: 0, r: 30, label: '⟲' },
  { id: 'right', x: 122, y: 0, r: 30, label: '⟳' },
  { id: 'thrust', x: 0, y: 0, r: 30, label: '💨' },
  { id: 'fire', x: 0, y: 0, r: 30, label: '🔩' },
];

export default function ArcadeAsteroids({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const stRef = useRef<AstroState | null>(null);
  const rngRef = useRef(mulberry32((Date.now() % 100000) | 0));
  const screenRef = useRef<Screen>('ready');
  const keysRef = useRef({ left: false, right: false, thrust: false });
  const touchRef = useRef({ left: false, right: false, thrust: false });
  const starsRef = useRef<Star[]>(makeStars(110, 7));
  const fxRef = useRef({ t: 0, deathAt: -9 });
  const [screen, setScreen] = useState<Screen>('ready');
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 3, level: 1, best: getBest(bestKey(SLUG, 'best')) });
  const [muted, setMuted] = useState(false);
  const [isTouch] = useState(() => typeof window !== 'undefined' && 'ontouchstart' in window);

  const pushHudFor = (st: AstroState): void => {
    setHud({ score: st.score, lives: st.lives, level: st.level, best: getBest(bestKey(SLUG, 'best')) });
  };

  const restart = (): void => {
    rngRef.current = mulberry32((Date.now() % 100000) | 0);
    stRef.current = createState((Date.now() % 100000) | 0);
    pushHudFor(stRef.current);
    setScreen('ready');
    screenRef.current = 'ready';
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    setMuted(api.sfx.muted);
    stRef.current = createState((Date.now() % 100000) | 0);
    pushHudFor(stRef.current);

    const explode = (x: number, y: number, big: boolean): void => {
      api.particles.spawn(x, y, {
        count: big ? 26 : 14,
        colors: ['#fde68a', '#fb923c', '#e2e8f0', '#94a3b8'],
        speed: [80, 340], life: [0.5, 1.1], size: [2, 6], shape: 'rect', rotation: true,
      });
    };

    api.setUpdate((dt) => {
      const st = stRef.current;
      if (!st || screenRef.current !== 'play') return;
      const fx = fxRef.current;
      fx.t += dt;
      const k = keysRef.current;
      const tch = touchRef.current;
      const left = k.left || tch.left;
      const right = k.right || tch.right;
      const thrust = k.thrust || tch.thrust;
      stepShip(st, dt, left, right, thrust);
      const ev = updateState(st, dt, rngRef.current);
      for (const r of ev.rockHit) {
        explode(r.x, r.y, r.r > 30);
        api.sfx.pop(r.r > 30 ? 0.7 : 1.1);
        api.scores.add(r.x, r.y - 10, `+${r.r > 30 ? 20 : r.r > 16 ? 50 : 100}`, { color: '#fde68a', size: 18 });
      }
      for (const sc of ev.saucerHit) {
        explode(sc.x, sc.y, true);
        api.sfx.chime(3);
        api.scores.add(sc.x, sc.y - 14, '+200', { color: '#f0abfc', size: 20 });
      }
      if (ev.shipDied) {
        const s = st.ship;
        explode(s.x, s.y, true);
        api.shake.add(0.9);
        api.sfx.crumble(1.2);
        fx.deathAt = fx.t;
        pushHudFor(st);
      }
      if (ev.leveledUp) {
        api.sfx.chime(2);
        pushHudFor(st);
      }
      if (st.over) {
        setBest(bestKey(SLUG, 'best'), st.score);
        pushHudFor(st);
        api.sfx.fail();
        window.setTimeout(() => setScreen('over'), 800);
      }
    });

    api.setRender(() => {
      const st = stRef.current;
      if (!st) return;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = fxRef.current.t;
      ctx.save();
      ctx.scale(s, s);

      // latar: site konstruksi saat senja
      const bg = ctx.createLinearGradient(0, 0, 0, lh);
      bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(0.45, '#7c2d5a'); bg.addColorStop(0.72, '#ea7a3c'); bg.addColorStop(1, '#fbbf24');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, lh);
      // matahari terbenam
      ctx.fillStyle = 'rgba(255,237,180,0.9)';
      ctx.beginPath(); ctx.arc(300, lh - 170, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,237,180,0.25)';
      ctx.beginPath(); ctx.arc(300, lh - 170, 48, 0, TAU); ctx.fill();
      // siluet tower crane
      ctx.strokeStyle = 'rgba(30,20,40,0.85)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(70, lh - 60); ctx.lineTo(70, 120); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(10, 150); ctx.lineTo(150, 150); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(70, 120); ctx.lineTo(10, 150); ctx.moveTo(70, 120); ctx.lineTo(150, 150); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(130, 150); ctx.lineTo(130, 190); ctx.stroke();
      ctx.fillStyle = 'rgba(30,20,40,0.85)';
      ctx.fillRect(122, 190, 16, 12);
      // gedung setengah jadi
      ctx.fillStyle = 'rgba(40,28,50,0.9)';
      ctx.fillRect(230, 300, 120, lh - 360);
      ctx.fillStyle = 'rgba(251,191,36,0.5)';
      for (let wy = 320; wy < lh - 90; wy += 34) {
        for (let wx = 242; wx < 340; wx += 30) ctx.fillRect(wx, wy, 16, 20);
      }
      // tanah site
      const gy = lh - 60;
      const gr = ctx.createLinearGradient(0, gy, 0, lh);
      gr.addColorStop(0, '#8a6a48'); gr.addColorStop(1, '#5d442e');
      ctx.fillStyle = gr; ctx.fillRect(0, gy, LW, lh - gy);
      ctx.fillStyle = 'rgba(60,40,24,0.5)';
      for (let px = 10; px < LW; px += 46) ctx.fillRect(px, gy + 18, 20, 5);
      // pagar site
      ctx.strokeStyle = 'rgba(120,90,60,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, gy - 26); ctx.lineTo(LW, gy - 26); ctx.stroke();
      for (let px = 20; px < LW; px += 60) {
        ctx.beginPath(); ctx.moveTo(px, gy - 26); ctx.lineTo(px, gy); ctx.stroke();
      }
      // debu melayang (ganti bintang)
      for (const st2 of starsRef.current) {
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + st2.tw);
        ctx.fillStyle = `rgba(255,240,200,${(0.12 + 0.3 * tw) * st2.z})`;
        const sz = st2.z > 0.75 ? 2.4 : 1.5;
        ctx.beginPath(); ctx.arc(st2.x, st2.y, sz, 0, TAU); ctx.fill();
      }

      // paku tembak
      for (const b of st.bullets) {
        ctx.save();
        ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8;
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // kepala paku
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // kerikil yang dilempar drone maling
      for (const b of st.saucerBullets) {
        ctx.save();
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#b45309';
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.6, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      for (const r of st.rocks) drawBrick(ctx, r);
      for (const sc of st.saucers) drawRivalDrone(ctx, sc, t);

      const shp = st.ship;
      if (shp.alive && screenRef.current !== 'over') {
        drawDrone(ctx, shp.x, shp.y, shp.angle, shp.thrusting, t, shp.invuln > 0 && screenRef.current === 'play');
        if (shp.thrusting && Math.random() < 0.6) {
          api.particles.spawn(
            shp.x - Math.cos(shp.angle) * SHIP_R, shp.y - Math.sin(shp.angle) * SHIP_R,
            { count: 2, colors: ['#fdba74', '#fde68a'], speed: [40, 140], life: [0.25, 0.5], size: [2, 4] },
          );
        }
      }

      // tombol sentuh
      if (isTouch && screenRef.current === 'play') {
        const by = lh - 52;
        const cfg: Record<string, { x: number; y: number }> = {
          left: { x: 46, y: by }, right: { x: 122, y: by },
          thrust: { x: LW - 122, y: by }, fire: { x: LW - 46, y: by },
        };
        for (const b of BTNS) {
          const c = cfg[b.id];
          const active = touchRef.current[b.id as 'left' | 'right' | 'thrust'];
          ctx.save();
          ctx.globalAlpha = active ? 0.85 : 0.45;
          ctx.fillStyle = '#1e293b';
          ctx.beginPath(); ctx.arc(c.x, c.y, b.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#e0f2fe'; ctx.font = '22px system-ui';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(b.label, c.x, c.y + 1);
          ctx.restore();
        }
      }

      if (screenRef.current === 'ready') {
        ctx.save();
        ctx.fillStyle = 'rgba(2,6,23,0.55)'; ctx.fillRect(0, 0, LW, lh);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.font = `900 30px ${FONT}`;
        ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 18;
        ctx.fillText('🧱 HUJAN BATA', LW / 2, lh * 0.32);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#bae6fd'; ctx.font = `700 15px ${FONT}`;
        ctx.fillText(isTouch ? 'Tombol: putar • gas • paku' : '← → putar • ↑ gas • SPASI tembak paku', LW / 2, lh * 0.32 + 34);
        ctx.fillText('Tembak bata yang jatuh ke site!', LW / 2, lh * 0.32 + 58);
        const pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fde68a'; ctx.font = `900 18px ${FONT}`;
        ctx.fillText(isTouch ? 'KETUK UNTUK MULAI' : 'TEKAN SPASI / KETUK UNTUK MULAI', LW / 2, lh * 0.32 + 100);
        ctx.restore();
      }
      ctx.restore();
    });

    api.input.onDown = (p) => {
      api.sfx.ensure();
      const st = stRef.current;
      if (!st) return;
      const rect = api.canvas.getBoundingClientRect();
      void rect;
      if (screenRef.current === 'ready') {
        screenRef.current = 'play';
        setScreen('play');
        return;
      }
      if (screenRef.current !== 'play') return;
      if (!isTouch) return;
      // tombol sentuh (koordinat sudah CSS px; konversi ke ruang logis)
      const sx = api.W / LW;
      const ly = p.y / sx;
      const by = (api.H / sx) - 52;
      const hit = (cx: number): boolean => Math.hypot(p.x / sx - cx, ly - by) < 34;
      if (hit(46)) touchRef.current.left = true;
      else if (hit(122)) touchRef.current.right = true;
      else if (hit(LW - 122)) touchRef.current.thrust = true;
      else if (hit(LW - 46)) {
        if (fireBullet(st)) api.sfx.pop(1.4);
      }
    };
    api.input.onUp = () => {
      touchRef.current.left = false; touchRef.current.right = false; touchRef.current.thrust = false;
    };
    // keyboard di-poll tiap frame via keydown/keyup manual
    const kd = (e: KeyboardEvent): void => {
      const k = keysRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') k.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') k.thrust = true;
      if (e.code === 'Space') {
        e.preventDefault();
        api.sfx.ensure();
        const st = stRef.current;
        if (screenRef.current === 'ready') { screenRef.current = 'play'; setScreen('play'); }
        else if (st && screenRef.current === 'play' && !e.repeat) {
          if (fireBullet(st)) api.sfx.pop(1.4);
        }
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (screenRef.current === 'play') { api.loop.setPaused(true); screenRef.current = 'pause'; setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); screenRef.current = 'play'; setScreen('play'); }
      }
    };
    const ku = (e: KeyboardEvent): void => {
      const k = keysRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') k.right = false;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') k.thrust = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__asteroids = {
        get screen() { return screenRef.current; },
        get score() { return stRef.current?.score ?? 0; },
        get lives() { return stRef.current?.lives ?? 0; },
        get rocks() { return stRef.current?.rocks.length ?? 0; },
        start() { screenRef.current = 'play'; setScreen('play'); },
        thrust(sec = 0.5) { const st = stRef.current; if (st) { const n = Math.round(sec / 0.016); for (let i = 0; i < n; i += 1) { stepShip(st, 0.016, false, false, true); updateState(st, 0.016, mulberry32(1)); } } },
        fire() { const st = stRef.current; if (st) fireBullet(st); },
        aimAtNearestRock() {
          const st = stRef.current;
          if (!st || st.rocks.length === 0) return;
          let best: Rock | null = null; let bd = 1e9;
          for (const r of st.rocks) { const d = Math.hypot(r.x - st.ship.x, r.y - st.ship.y); if (d < bd) { bd = d; best = r; } }
          if (best) st.ship.angle = Math.atan2(best.y - st.ship.y, best.x - st.ship.x);
        },
      };
    }
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__asteroids;
    };
  });

  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    screenRef.current = 'pause'; setScreen('pause');
  };
  const doResume = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    screenRef.current = 'play'; setScreen('play');
  };
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
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#070b1a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 12px', color: '#fde68a', fontWeight: 800, fontSize: 14 }}>⭐ {hud.score}</div>
        <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 10px', color: '#67e8f9', fontWeight: 800, fontSize: 13 }}>🚁 {'❤'.repeat(Math.max(0, hud.lives)) || '—'}</div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#c4b5fd', fontWeight: 800, fontSize: 13 }}>Lv {hud.level}</div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🛸</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Bata tidak akan menunggumu. Mandor marah kalau site berantakan.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={restart}>Ulangi</button>
          </div>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>💥</div>
          <h2 style={titleStyle}>DRONE JATUH!</h2>
          <p style={{ ...textStyle, fontSize: 16 }}>
            Skor: <b>{hud.score}</b> • Level: <b>{hud.level}</b> • Terbaik: <b>{hud.best}</b>
            {hud.score > 0 && hud.score >= hud.best && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
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

const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0', textShadow: '0 2px 12px rgba(34,211,238,0.5)', letterSpacing: 1 };
const textStyle: React.CSSProperties = { color: '#e2e8f0', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 300 };
const primaryBtn: React.CSSProperties = { background: 'linear-gradient(135deg,#22d3ee,#818cf8)', color: '#0b1030', fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14, padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT, boxShadow: '0 6px 20px rgba(34,211,238,0.4)' };
const secondaryBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT };
function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(7,11,26,0.72)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      {children}
    </div>
  );
}
