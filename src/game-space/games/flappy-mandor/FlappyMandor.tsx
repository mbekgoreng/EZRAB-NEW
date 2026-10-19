/**
 * Flappy Mandor — mandor berhelm terbang melewati struktur crane kuning.
 * Fisika & tabrakan murni di logic.ts; file ini render + juice + UI.
 *
 * Fairness (hasil play-test):
 *  - 'ready': burung hover bobbing di tengah, gate diam. Tap PERTAMA =
 *    flap SEKALIGUS memulai run. Tidak ada kematian sebelum bereaksi.
 *  - Grace 1 detik setelah mulai: tidak ada tabrakan gate.
 *  - Input buffer 100ms: tap sedikit lebih awal tetap dihitung.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  createState, flap, updateState, updateReady, startRun, readyBobOffset,
  inGrace, difficulty, medalFor, MEDAL_LABEL,
  GRAVITY, FLAP_V, BIRD_R, GATE_W, GRACE_T, FLAP_BUFFER_S,
  type FlapState, type Gate, type DeathCause, type Bird,
} from './logic';

void GRAVITY;
void FLAP_V;
void BIRD_R;
void GRACE_T;

const SLUG = 'flappy-mandor';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

/** Arcade-test harness hook: aktif hanya bila URL mengandung ?arcade */
const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';

/* ================= drawing ================= */

function hazardStripes(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#f5b301';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1f2937';
  for (let sx = x - h; sx < x + w + h; sx += 16) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + 8, y + h);
    ctx.lineTo(sx + 8 + h, y);
    ctx.lineTo(sx + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Kolom girder crane KUNING bertekstur: lattice X, rivet, highlight,
 * edge beam gelap. Dari (x, yTop) setinggi h.
 */
function latticeColumn(
  ctx: CanvasRenderingContext2D, x: number, yTop: number, w: number, h: number,
): void {
  if (h <= 0) return;
  // badan kuning
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#d99a00');
  grad.addColorStop(0.28, '#ffd23e');
  grad.addColorStop(0.55, '#f5b301');
  grad.addColorStop(1, '#c78d00');
  ctx.fillStyle = grad;
  ctx.fillRect(x, yTop, w, h);
  // lattice X
  ctx.strokeStyle = 'rgba(122,82,0,0.75)';
  ctx.lineWidth = 3;
  const step = 26;
  for (let y = yTop; y < yTop + h; y += step) {
    ctx.beginPath();
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + w - 3, Math.min(y + step, yTop + h));
    ctx.moveTo(x + w - 3, y);
    ctx.lineTo(x + 3, Math.min(y + step, yTop + h));
    ctx.stroke();
  }
  // balok tepi vertikal
  ctx.fillStyle = '#a86f00';
  ctx.fillRect(x, yTop, 7, h);
  ctx.fillRect(x + w - 7, yTop, 7, h);
  // rivet di tiap simpul
  ctx.fillStyle = '#7a5200';
  for (let y = yTop + 4; y < yTop + h; y += step) {
    ctx.beginPath();
    ctx.arc(x + 7, y, 2.2, 0, TAU);
    ctx.arc(x + w - 7, y, 2.2, 0, TAU);
    ctx.fill();
  }
  // highlight kiri
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.fillRect(x + 8, yTop, 5, h);
  // outline
  ctx.strokeStyle = '#5c430a';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, yTop, w - 3, h);
}

/** Struktur crane atas (menggantung) + menara bawah (dari tanah). */
function drawCraneGate(ctx: CanvasRenderingContext2D, g: Gate, groundY: number): void {
  const x = g.x;
  const w = g.w;
  const topH = g.gapY - g.gapH / 2;
  const botY = g.gapY + g.gapH / 2;

  /* ---- atas: girder gantung + jib ---- */
  if (topH > 0) {
    latticeColumn(ctx, x, -24, w, topH + 24);
    // jib horizontal di puncak
    ctx.fillStyle = '#e0a400';
    ctx.fillRect(x - 34, -34, w + 92, 24);
    ctx.strokeStyle = '#5c430a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x - 34, -34, w + 92, 24);
    ctx.strokeStyle = 'rgba(122,82,0,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 34, -34);
    ctx.lineTo(x - 34 + 24, -10);
    ctx.moveTo(x + w + 58, -34);
    ctx.lineTo(x + w + 58 - 24, -10);
    ctx.stroke();
    // kabel + hook block di kanan
    const hx = x + w + 44;
    ctx.strokeStyle = '#3d2f05';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx, -10);
    ctx.lineTo(hx, 26);
    ctx.stroke();
    ctx.fillStyle = '#8a6a00';
    ctx.fillRect(hx - 9, 26, 18, 16);
    ctx.strokeStyle = '#5c430a';
    ctx.lineWidth = 2;
    ctx.strokeRect(hx - 9, 26, 18, 16);
    // strip bahaya di bibir celah
    hazardStripes(ctx, x, topH - 14, w, 14);
  }

  /* ---- bawah: menara lattice dari tanah + fondasi beton ---- */
  if (botY < groundY) {
    // fondasi beton
    const fh = 30;
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(x - 8, groundY - fh, w + 16, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - 8, groundY - fh, w + 16, 6);
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x - 8, groundY - fh, w + 16, fh);
    latticeColumn(ctx, x, botY + 14, w, groundY - fh - (botY + 14));
    // strip bahaya di bibir celah
    hazardStripes(ctx, x, botY, w, 14);
    // lampu peringatan di puncak menara
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
    ctx.fillStyle = `rgba(239,68,68,${0.55 + 0.45 * pulse})`;
    ctx.beginPath();
    ctx.arc(x + w / 2, botY + 22, 5, 0, TAU);
    ctx.fill();
  }
}

interface MandorDrawOpts {
  wing: number; // 0..1 seberapa terangkat sayap (animasi flap)
  squash: number; // 0..1 squash sesaat setelah flap
}

function drawMandor(
  ctx: CanvasRenderingContext2D, b: Bird, t: number, o: MandorDrawOpts,
): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  ctx.scale(1.15, 1.15);
  if (o.squash > 0) ctx.scale(1 + o.squash * 0.12, 1 - o.squash * 0.14);

  // SAYAP/lengan mengepak (di belakang badan, menempel di bahu)
  const wingA = -0.9 + o.wing * 1.5 + Math.sin(t * 16) * 0.12;
  ctx.save();
  ctx.translate(-8, 14);
  ctx.rotate(wingA);
  const wg = ctx.createLinearGradient(0, 0, -26, 0);
  wg.addColorStop(0, '#3b82f6');
  wg.addColorStop(0.6, '#2563eb');
  wg.addColorStop(1, '#1e40af');
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.ellipse(-14, 0, 15, 7.5, 0.25, 0, TAU);
  ctx.fill();
  // highlight lengan
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(-12, -2.6, 9, 2.6, 0.25, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#16295e';
  ctx.lineWidth = 2;
  ctx.stroke();
  // jari sayap
  ctx.strokeStyle = 'rgba(22,41,94,0.9)';
  ctx.beginPath();
  ctx.moveTo(-25, -2);
  ctx.lineTo(-31, -6);
  ctx.moveTo(-25, 2);
  ctx.lineTo(-32, 2);
  ctx.stroke();
  ctx.restore();

  // ROMPI PROYEK (tubuh): base + gradient + lipatan + strip reflektif
  const vg = ctx.createLinearGradient(0, 6, 0, 38);
  vg.addColorStop(0, '#fb923c');
  vg.addColorStop(0.55, '#f97316');
  vg.addColorStop(1, '#b45309');
  ctx.fillStyle = vg;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(-13, 6, 26, 32, 9);
  else ctx.rect(-13, 6, 26, 32);
  ctx.fill();
  // lipatan kain: highlight & shadow melengkung
  ctx.strokeStyle = 'rgba(255,235,200,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 10);
  ctx.quadraticCurveTo(-4, 22, -7, 34);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,50,5,0.55)';
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.quadraticCurveTo(5, 22, 8, 34);
  ctx.stroke();
  // strip reflektif perak (2 garis + kilau)
  for (const sy of [16, 27]) {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(-13, sy, 26, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-13, sy, 26, 1.8);
    ctx.fillStyle = 'rgba(100,116,139,0.6)';
    ctx.fillRect(-13, sy + 3.6, 26, 1.4);
  }
  // kerah
  ctx.fillStyle = '#1e3a5f';
  ctx.beginPath();
  ctx.ellipse(0, 7, 8, 3.6, 0, 0, TAU);
  ctx.fill();
  // outline lembut tubuh
  ctx.strokeStyle = 'rgba(124,45,18,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(-13, 6, 26, 32, 9);
  else ctx.rect(-13, 6, 26, 32);
  ctx.stroke();

  // syal berkibar (di leher, belakang kepala)
  const w1 = Math.sin(t * 14) * 4;
  const w2 = Math.sin(t * 14 + 1.2) * 7;
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.quadraticCurveTo(-22, 6 + w1, -34, 11 + w2);
  ctx.lineTo(-31, 19 + w2);
  ctx.quadraticCurveTo(-20, 16 + w1, -7, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-12, 8, 4, 8);
  ctx.fillStyle = '#b91f2e';
  ctx.fillRect(-11, 7, 5, 10);

  // kepala
  const skin = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15);
  skin.addColorStop(0, '#ffd9a8');
  skin.addColorStop(1, '#e8a96c');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, TAU);
  ctx.fill();

  // helm kuning (dome)
  ctx.fillStyle = '#f5b301';
  ctx.beginPath();
  ctx.arc(0, -3, 14.5, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // kilau helm
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-5, -11, 5, 3.4, -0.5, 0, TAU);
  ctx.fill();
  // strip helm
  ctx.fillStyle = '#d18f00';
  ctx.fillRect(-2.5, -17.5, 5, 13);
  // brim helm
  ctx.fillStyle = '#e0a400';
  ctx.beginPath();
  ctx.ellipse(0, -3, 17.5, 4.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f5b301';
  ctx.beginPath();
  ctx.ellipse(0, -4.2, 17.5, 4.2, 0, 0, TAU);
  ctx.fill();

  // mata (ekspresif: melotot saat jatuh)
  const scared = b.vy > 350 ? 1 : 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(5.5, -0.5, 4.2 + scared * 1.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(7, -0.5 + scared * 1.5, 2.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(7.7, -1.2, 0.8, 0, TAU);
  ctx.fill();
  // kumis mandor
  ctx.strokeStyle = '#4a2f18';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(2, 7);
  ctx.quadraticCurveTo(7, 9.5, 12, 7.5);
  ctx.stroke();
  // mulut: O saat jatuh cepat
  if (scared) {
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.ellipse(6, 10.5, 2.6, 3.4, 0, 0, TAU);
    ctx.fill();
  }
  // outline kepala
  ctx.strokeStyle = 'rgba(120,70,30,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0.3, Math.PI - 0.3);
  ctx.stroke();

  ctx.restore();
}

/** Awan bervolume: lapis bawah kebiruan + badan gradien + highlight atas. */
function drawClouds(ctx: CanvasRenderingContext2D, t: number, alpha: number, sc: number): void {
  for (let i = 0; i < 4; i += 1) {
    const cx = ((i * 137 - t * (10 + i * 4)) % (LW + 160) + LW + 160) % (LW + 160) - 80;
    const cy = 60 + ((i * 67) % 130);
    const s = sc * (0.7 + (i % 3) * 0.25);
    const puffs: Array<[number, number, number, number]> = [
      [0, 0, 34, 13], [-22, 4, 20, 9], [24, 4, 22, 10], [-6, -8, 24, 10],
    ];
    // lapis bayangan bawah (kebiruan)
    ctx.fillStyle = `rgba(170,200,230,${alpha * 0.85})`;
    for (const [ox, oy, rx, ry] of puffs) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * s, cy + (oy + 5) * s, rx * s, ry * s, 0, 0, TAU);
      ctx.fill();
    }
    // badan: gradien putih -> biru muda
    const cg = ctx.createLinearGradient(0, cy - 16 * s, 0, cy + 14 * s);
    cg.addColorStop(0, `rgba(255,255,255,${alpha})`);
    cg.addColorStop(1, `rgba(214,232,248,${alpha})`);
    ctx.fillStyle = cg;
    for (const [ox, oy, rx, ry] of puffs) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * s, cy + oy * s, rx * s, ry * s, 0, 0, TAU);
      ctx.fill();
    }
    // highlight atas
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`;
    ctx.beginPath();
    ctx.ellipse(cx - 4 * s, cy - 7 * s, 20 * s, 6.5 * s, -0.15, 0, TAU);
    ctx.fill();
  }
}

/** Siluet gedung berdetail: gradien + jendela + antena. */
function drawBuildings(
  ctx: CanvasRenderingContext2D, t: number, groundY: number, speed: number,
  color: string, winColor: string, seedOff: number,
): void {
  const n = 6;
  for (let i = 0; i < n; i += 1) {
    const span = LW + 120;
    const bx = ((i * 97 + seedOff - t * speed) % span + span) % span - 60;
    const bw = 44 + ((i * 53 + seedOff) % 26);
    const bh = 60 + ((i * 71 + seedOff) % 70);
    const g = ctx.createLinearGradient(0, groundY - bh, 0, groundY);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(60,80,105,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(bx, groundY - bh, bw, bh);
    // jendela berpola
    ctx.fillStyle = winColor;
    for (let wy = groundY - bh + 8; wy < groundY - 8; wy += 13) {
      for (let wx = bx + 6; wx < bx + bw - 8; wx += 12) {
        if (((wx * 7 + wy * 13 + seedOff) | 0) % 3 !== 0) ctx.fillRect(wx, wy, 5, 7);
      }
    }
    // antena pada sebagian gedung
    if (i % 2 === 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2, groundY - bh);
      ctx.lineTo(bx + bw / 2, groundY - bh - 16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(239,68,68,0.9)';
      ctx.beginPath();
      ctx.arc(bx + bw / 2, groundY - bh - 16, 2.6, 0, TAU);
      ctx.fill();
    }
  }
}

/* ================= component ================= */

interface Hud {
  score: number;
  best: number;
}

export default function FlappyMandor({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const stRef = useRef<FlapState | null>(null);
  const screenRef = useRef<Screen>('ready');
  const [screen, setScreenState] = useState<Screen>('ready');
  const [muted, setMuted] = useState(false);
  const [deathCause, setDeathCause] = useState<DeathCause>(null);
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(bestKey(SLUG, 'best')) });

  // mutable per-frame (tidak memicu render React)
  const fxRef = useRef({
    animT: 0,          // jam ambient (awan, teks pulse) — jalan terus
    flapAnim: 0,       // 1 -> 0 setelah flap (sayap + squash)
    squash: 0,
    hitStop: 0,        // detik freeze saat kena (60ms)
    bufferedAt: -1,    // timestamp tap yang di-buffer (detik, jam animT)
    overAt: 0,
  });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHudFor = (st: FlapState): void => {
    apiRef.current?.pushHud({
      score: st.passed,
      best: getBest(bestKey(SLUG, 'best')),
    } as Hud);
  };

  const doDie = (cause: DeathCause): void => {
    const api = apiRef.current;
    const st = stRef.current;
    if (!api || !st) return;
    fxRef.current.hitStop = 0.06; // hit-stop 60ms: dunia membeku sesaat
    fxRef.current.bufferedAt = -1;
    setDeathCause(cause);
    setBest(bestKey(SLUG, 'best'), st.passed);
    api.sfx.fail();
    api.shake.add(0.6);
    // ledakan bulu + serpihan helm
    api.particles.spawn(st.bird.x, st.bird.y, {
      count: 30, colors: ['#f5b301', '#e63946', '#ffd9a8', '#ffffff'],
      speed: [100, 380], gravity: 500, life: [0.5, 1.1], size: [2.5, 6],
      shape: 'rect', rotation: true,
    });
    api.particles.spawn(st.bird.x, st.bird.y - 10, {
      count: 8, colors: ['#f5b301', '#e0a400'],
      speed: [150, 420], up: 220, gravity: 700, life: [0.6, 1.2], size: [3, 6],
      shape: 'rect', rotation: true,
    });
    pushHudFor(st);
    window.setTimeout(() => setScreen('over'), 750);
  };

  const restart = (): void => {
    const api = apiRef.current;
    if (!api) return;
    stRef.current = createState((Date.now() % 100000) | 0, api.W, api.H);
    fxRef.current.bufferedAt = -1;
    fxRef.current.hitStop = 0;
    setDeathCause(null);
    pushHudFor(stRef.current);
    setScreen('ready');
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);
    stRef.current = createState((Date.now() % 100000) | 0, api.W, api.H);
    pushHudFor(stRef.current);

    api.onResize((w, h) => {
      const st = stRef.current;
      if (!st) return;
      st.W = w;
      st.H = h;
      st.groundY = h - 64;
    });

    /** Flap dengan juice: semburan bulu + screen nudge + animasi sayap. */
    const doFlap = (st: FlapState): void => {
      flap(st.bird);
      api.sfx.pop(1.2);
      fxRef.current.flapAnim = 1;
      fxRef.current.squash = 1;
      api.shake.add(0.07); // screen nudge halus
      api.particles.spawn(st.bird.x - 14, st.bird.y + 10, {
        count: 9, colors: ['#ffffff', '#ffe9c4', '#f5b301', '#e63946'],
        speed: [60, 200], angle: Math.PI * 0.75, spread: 1.4, up: 60,
        life: [0.3, 0.65], size: [2, 4.5], shape: 'rect', rotation: true,
      });
    };

    api.input.onDown = () => {
      api.sfx.ensure();
      const st = stRef.current;
      const fx = fxRef.current;
      if (!st || !st.alive) return;
      if (screenRef.current === 'ready') {
        // Tap PERTAMA = flap SEKALIGUS memulai run. Tanpa jeda, tanpa overlay.
        startRun(st);
        doFlap(st);
        setScreen('play');
      } else if (screenRef.current === 'play') {
        // Buffer 100ms: tap dicatat, dikonsumsi di update loop.
        fx.bufferedAt = fx.animT;
      }
    };

    api.setUpdate((dt) => {
      const st = stRef.current;
      const fx = fxRef.current;
      if (!st) return;
      fx.animT += dt;
      fx.flapAnim = Math.max(0, fx.flapAnim - dt * 5);
      fx.squash = Math.max(0, fx.squash - dt * 7);

      if (api.input.wasPressed('Space')) {
        api.sfx.ensure();
        if (screenRef.current === 'ready') {
          startRun(st);
          doFlap(st);
          setScreen('play');
        } else if (screenRef.current === 'play' && st.alive) {
          fx.bufferedAt = fx.animT;
        }
      }
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') {
          api.loop.setPaused(true);
          setScreen('pause');
        } else if (screenRef.current === 'pause') {
          api.loop.setPaused(false);
          setScreen('play');
        }
      }

      if (screenRef.current === 'ready') {
        updateReady(st, dt);
        return;
      }
      if (screenRef.current !== 'play' || !st.alive) return;

      // hit-stop: bekukan dunia 60ms saat kena (particles/shake tetap jalan)
      if (fx.hitStop > 0) {
        fx.hitStop -= dt;
        return;
      }

      // konsumsi buffer flap (100ms)
      if (fx.bufferedAt >= 0 && fx.animT - fx.bufferedAt <= FLAP_BUFFER_S) {
        fx.bufferedAt = -1;
        doFlap(st);
      } else if (fx.bufferedAt >= 0 && fx.animT - fx.bufferedAt > FLAP_BUFFER_S) {
        fx.bufferedAt = -1; // kedaluwarsa
      }

      const res = updateState(st, dt, Math.random);
      if (res.scored) {
        api.sfx.pop(1 + Math.min(0.6, st.passed * 0.02));
        api.scores.add(st.bird.x + 30, st.bird.y - 34, '+1', { color: '#ffd166', size: 26 });
        if (st.passed % 10 === 0 && st.passed > 0 && wrapRef.current) {
          const m = medalFor(st.passed);
          popText(wrapRef.current, m ? `MEDALI ${MEDAL_LABEL[m]}!` : `${st.passed} GATE!`, { size: 26, color: '#ffd166' });
          api.sfx.chime(2);
        }
        pushHudFor(st);
      }
      if (res.died) doDie(res.died);
    });

    api.setRender(() => {
      const st = stRef.current;
      if (!st) return;
      const fx = fxRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = fx.animT;
      ctx.save();
      ctx.scale(s, s);

      // langit siang
      const sky = ctx.createLinearGradient(0, 0, 0, lh);
      sky.addColorStop(0, '#5fb6ef');
      sky.addColorStop(0.55, '#a8dcf9');
      sky.addColorStop(1, '#fdf3d0');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, LW, lh);

      // matahari
      ctx.fillStyle = 'rgba(255,240,180,0.95)';
      ctx.beginPath();
      ctx.arc(310, 90, 28, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,180,0.25)';
      ctx.beginPath();
      ctx.arc(310, 90, 44, 0, TAU);
      ctx.fill();

      // awan parallax (2 lapis, pakai jam ambient agar hidup saat ready)
      drawClouds(ctx, t, 0.5, 0.75);
      drawClouds(ctx, t * 1.7 + 200, 0.9, 1);

      // siluet crane jauh (lapis paling belakang) + gedung 2 lapis parallax
      const driftBase = screenRef.current === 'ready' ? t : st.t;
      ctx.strokeStyle = 'rgba(120,150,180,0.35)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 3; i += 1) {
        const span = LW + 160;
        const cxp = ((i * 211 - driftBase * 8) % span + span) % span - 80;
        const ch = 150 + (i % 2) * 40;
        ctx.beginPath();
        ctx.moveTo(cxp, st.groundY);
        ctx.lineTo(cxp, st.groundY - ch);
        ctx.moveTo(cxp - 55, st.groundY - ch + 12);
        ctx.lineTo(cxp + 55, st.groundY - ch + 12);
        ctx.stroke();
      }
      drawBuildings(ctx, driftBase, st.groundY, 12, 'rgba(110,145,175,0.42)', 'rgba(220,235,250,0.35)', 31);
      drawBuildings(ctx, driftBase, st.groundY, 24, 'rgba(85,115,150,0.6)', 'rgba(255,244,200,0.5)', 137);

      // gate crane kuning
      for (const g of st.gates) {
        if (g.x + g.w < -60 || g.x > LW + 60) continue;
        drawCraneGate(ctx, g, st.groundY);
      }

      // tanah
      const gy = st.groundY;
      const gr = ctx.createLinearGradient(0, gy, 0, lh);
      gr.addColorStop(0, '#8a6a48');
      gr.addColorStop(1, '#5d442e');
      ctx.fillStyle = gr;
      ctx.fillRect(0, gy, LW, lh - gy);
      ctx.fillStyle = '#5da24a';
      ctx.fillRect(0, gy, LW, 10);
      const stripeDrift = screenRef.current === 'ready' ? 0 : st.t * 60;
      ctx.fillStyle = 'rgba(70,50,30,0.4)';
      for (let px = -((stripeDrift) % 40); px < LW; px += 40) {
        ctx.fillRect(px, gy + 22, 18, 5);
        ctx.fillRect(px + 20, gy + 40, 12, 4);
      }

      // mandor (+ bobbing saat ready)
      const bob = st.phase === 'ready' ? readyBobOffset(st) : 0;
      const birdY = st.bird.y + bob;
      if (st.phase === 'ready' || st.alive || screenRef.current !== 'over') {
        // bayangan
        const shScale = Math.max(0.3, 1 - (gy - birdY) / 500);
        ctx.fillStyle = 'rgba(15,23,42,0.22)';
        ctx.beginPath();
        ctx.ellipse(st.bird.x, gy + 12, 16 * shScale, 5 * shScale, 0, 0, TAU);
        ctx.fill();

        const drawB: Bird = { ...st.bird, y: birdY };
        drawMandor(ctx, drawB, t, {
          wing: st.phase === 'ready' ? 0.55 + Math.sin(t * 6) * 0.25 : fx.flapAnim,
          squash: fx.squash,
        });

        // bubble "aman" selama grace period
        if (st.phase === 'play' && inGrace(st) && st.alive) {
          const gp = 1 - st.t / 1.0;
          ctx.strokeStyle = `rgba(125,211,252,${0.35 + 0.45 * gp})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -t * 40;
          ctx.beginPath();
          ctx.arc(st.bird.x, birdY, 30, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ---- layar READY: tap untuk mulai (digambar di canvas, bukan overlay) ----
      if (screenRef.current === 'ready') {
        const pulse = 0.75 + 0.25 * Math.sin(t * 5);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fff';
        ctx.font = `900 26px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(15,23,42,0.55)';
        ctx.shadowBlur = 12;
        // jari menunjuk animasi naik-turun (di atas burung agar tak menutupi)
        const fy = lh * 0.20 + Math.sin(t * 5) * -8;
        ctx.font = '44px system-ui';
        ctx.fillText('👆', LW / 2, fy);
        ctx.font = `900 26px ${FONT}`;
        ctx.fillText('KETUK UNTUK MULAI', LW / 2, fy + 48);
        ctx.restore();
        // tutorial 1 kalimat
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.62)';
        const tw = 330;
        const ty = fy + 74;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(LW / 2 - tw / 2, ty, tw, 52, 14);
        else ctx.rect(LW / 2 - tw / 2, ty, tw, 52);
        ctx.fill();
        ctx.fillStyle = '#fef9c3';
        ctx.font = `700 14.5px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Ketuk = kepakan pertama.', LW / 2, ty + 16);
        ctx.fillText('Selipkan mandor lewat celah crane kuning!', LW / 2, ty + 36);
        ctx.restore();
        // best
        const best = getBest(bestKey(SLUG, 'best'));
        if (best > 0) {
          ctx.save();
          ctx.fillStyle = 'rgba(15,23,42,0.55)';
          ctx.font = `800 15px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(`🏅 Terbaik: ${best}`, LW / 2, ty + 78);
          ctx.restore();
        }
      }

      ctx.restore();
    });

    api.loop.start();

    // Arcade-test hook (inert tanpa ?arcade di URL).
    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__flappy = {
        get screen() { return screenRef.current; },
        get score() { return stRef.current?.passed ?? 0; },
        get alive() { return stRef.current?.alive ?? true; },
        get birdY() { return stRef.current?.bird.y ?? 0; },
        get inGrace() { return stRef.current ? inGrace(stRef.current) : false; },
        get gates() {
          return (stRef.current?.gates ?? []).map((g) => ({
            x: g.x, gapY: g.gapY, gapH: g.gapH, w: g.w, passed: g.passed,
          }));
        },
        tap() {
          const st = stRef.current;
          if (!st) return;
          if (screenRef.current === 'ready') {
            startRun(st);
            flap(st.bird);
            setScreen('play');
          } else if (screenRef.current === 'play' && st.alive) {
            flap(st.bird);
          }
        },
      };
    }

    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__flappy;
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

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };

  const medal = medalFor(hud.score);
  const isBest = hud.score > 0 && hud.score >= hud.best;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#5fb6ef', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          🚧 {hud.score}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13 }}>
          🏅 {hud.best}
        </div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">
            {screen === 'play' ? '⏸' : '▶'}
          </button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>ISTIRAHAT DULU</h2>
          <p style={textStyle}>Mandor lagi ngopi di pos satpam. Jangan diganggu.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={() => { restart(); apiRef.current?.loop.setPaused(false); }}>Ulangi</button>
          </div>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>💥</div>
          <h2 style={titleStyle}>MANDOR JATUH!</h2>
          <p style={textStyle}>
            Lupa pakai safety harness. Seperti biasa.
            {deathCause === 'ground' ? ' Mendarat lebih cepat dari progres proyek.' : ' Crane tidak bisa diajak negosiasi.'}
          </p>
          {medal && (
            <div style={{ background: 'rgba(255,209,102,0.18)', border: '1px solid #ffd166', borderRadius: 14, padding: '8px 18px', marginBottom: 10, color: '#ffd166', fontWeight: 900, fontSize: 18 }}>
              {MEDAL_LABEL[medal]}
            </div>
          )}
          <p style={{ ...textStyle, fontSize: 16 }}>
            🚧 Gate: <b>{hud.score}</b> &nbsp;•&nbsp; 🏅 Terbaik: <b>{hud.best}</b>
            {isBest && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => { apiRef.current?.sfx.ensure(); restart(); }}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(15,23,42,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 300,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#f5b301,#ff7847)', color: '#3b1d05',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(245,179,1,0.4)',
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
      background: 'rgba(10,18,32,0.62)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
