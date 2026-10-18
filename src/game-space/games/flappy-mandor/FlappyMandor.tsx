/**
 * Flappy Mandor — mandor berhelm terbang melewati crane & tumpukan balok.
 * Fisika & tabrakan murni di logic.ts; file ini render + juice + UI.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  createState, flap, updateState, difficulty, medalFor, MEDAL_LABEL,
  GATE_W,
  type FlapState, type Gate, type DeathCause,
} from './logic';

const SLUG = 'flappy-mandor';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

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

function drawCraneMast(ctx: CanvasRenderingContext2D, g: Gate): void {
  const topH = g.gapY - g.gapH / 2;
  if (topH <= 0) return;
  const x = g.x;
  // tiang baja
  const grad = ctx.createLinearGradient(x, 0, x + g.w, 0);
  grad.addColorStop(0, '#7d8a97');
  grad.addColorStop(0.5, '#a7b3bf');
  grad.addColorStop(1, '#6b7683');
  ctx.fillStyle = grad;
  ctx.fillRect(x, -20, g.w, topH + 20);
  // lattice
  ctx.strokeStyle = 'rgba(40,50,60,0.5)';
  ctx.lineWidth = 2.5;
  for (let y = 0; y < topH; y += 26) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + g.w, y + 26);
    ctx.moveTo(x + g.w, y);
    ctx.lineTo(x, y + 26);
    ctx.stroke();
  }
  // highlight kiri
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, -20, 8, topH + 20);
  // outline
  ctx.strokeStyle = '#3d4854';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, -20, g.w - 3, topH + 20);
  // lengan crane di atas
  ctx.fillStyle = '#5b6d7f';
  ctx.fillRect(x - 26, -8, g.w + 78, 22);
  ctx.strokeStyle = '#3d4854';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x - 26, -8, g.w + 78, 22);
  // kabin gantung
  ctx.fillStyle = '#e8eef4';
  ctx.fillRect(x + g.w + 8, 2, 30, 24);
  ctx.strokeStyle = '#3d4854';
  ctx.strokeRect(x + g.w + 8, 2, 30, 24);
  ctx.fillStyle = '#9fd4f5';
  ctx.fillRect(x + g.w + 12, 6, 22, 10);
  // strip bahaya di tepi celah
  hazardStripes(ctx, x, topH - 12, g.w, 12);
}

function drawBeamStack(ctx: CanvasRenderingContext2D, g: Gate, groundY: number): void {
  const botY = g.gapY + g.gapH / 2;
  const x = g.x;
  if (botY >= groundY) return;
  // strip bahaya di tepi celah
  hazardStripes(ctx, x, botY, g.w, 12);
  let y = botY + 12;
  let i = 0;
  while (y < groundY) {
    const bh = Math.min(26, groundY - y);
    // balok kayu
    ctx.fillStyle = i % 2 === 0 ? '#9c6633' : '#8f5c2c';
    ctx.fillRect(x, y, g.w, bh);
    // serat
    ctx.strokeStyle = 'rgba(90,55,25,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + bh * 0.35);
    ctx.quadraticCurveTo(x + g.w / 2, y + bh * 0.45, x + g.w - 3, y + bh * 0.3);
    ctx.moveTo(x + 3, y + bh * 0.7);
    ctx.quadraticCurveTo(x + g.w / 2, y + bh * 0.6, x + g.w - 3, y + bh * 0.75);
    ctx.stroke();
    // highlight atas tiap balok
    ctx.fillStyle = 'rgba(255,235,200,0.28)';
    ctx.fillRect(x, y, g.w, 3);
    // tali pengikat vertikal
    ctx.fillStyle = 'rgba(40,28,15,0.55)';
    ctx.fillRect(x + g.w * 0.3, y, 5, bh);
    ctx.fillRect(x + g.w * 0.65, y, 5, bh);
    // outline
    ctx.strokeStyle = '#5d3a1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, g.w - 2, bh - 1);
    y += 26;
    i += 1;
  }
}

function drawMandor(ctx: CanvasRenderingContext2D, b: { x: number; y: number; rot: number }, t: number): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);

  // syal berkibar (belakang)
  const w1 = Math.sin(t * 14) * 4;
  const w2 = Math.sin(t * 14 + 1.2) * 7;
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.quadraticCurveTo(-22, -2 + w1, -34, 3 + w2);
  ctx.lineTo(-31, 11 + w2);
  ctx.quadraticCurveTo(-20, 8 + w1, -7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b91f2e';
  ctx.fillRect(-11, -1, 5, 10);

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

  // mata
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(5.5, -0.5, 4.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(7, -0.5, 2.1, 0, TAU);
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
  // outline kepala
  ctx.strokeStyle = 'rgba(120,70,30,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0.3, Math.PI - 0.3);
  ctx.stroke();

  ctx.restore();
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
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [muted, setMuted] = useState(false);
  const [deathCause, setDeathCause] = useState<DeathCause>(null);
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(bestKey(SLUG, 'best')) });

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
    setDeathCause(cause);
    setBest(bestKey(SLUG, 'best'), st.passed);
    api.sfx.fail();
    api.shake.add(0.6);
    api.particles.spawn(st.bird.x, st.bird.y, {
      count: 30, colors: ['#f5b301', '#e63946', '#ffd9a8', '#ffffff'],
      speed: [100, 380], gravity: 500, life: [0.5, 1.1], size: [2.5, 6],
      shape: 'rect', rotation: true,
    });
    // helm mental!
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
    setDeathCause(null);
    pushHudFor(stRef.current);
    setScreen('play');
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

    const doFlap = (): void => {
      const st = stRef.current;
      if (!st || screenRef.current !== 'play' || !st.alive) return;
      flap(st.bird);
      api.sfx.pop(1.2);
      api.particles.spawn(st.bird.x - 12, st.bird.y + 8, {
        count: 5, colors: ['#ffffff', '#e8f4ff'],
        speed: [40, 140], angle: Math.PI, spread: 1.2, up: 40,
        life: [0.25, 0.5], size: [2, 4],
      });
    };

    api.input.onDown = () => {
      api.sfx.ensure();
      doFlap();
    };

    api.setUpdate((dt) => {
      const st = stRef.current;
      if (!st) return;
      if (api.input.wasPressed('Space')) {
        api.sfx.ensure();
        doFlap();
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
      if (screenRef.current !== 'play' || !st.alive) return;
      const res = updateState(st, dt, Math.random);
      if (res.scored) {
        api.sfx.pop(1 + Math.min(0.6, st.passed * 0.02));
        api.scores.add(st.bird.x + 30, st.bird.y - 34, '+1', { color: '#ffd166', size: 24 });
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
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = st.t;
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

      // awan parallax (2 lapis)
      drawClouds(ctx, t, 0.5, 0.75);
      drawClouds(ctx, t * 1.7 + 200, 0.9, 1);

      // siluet gedung (2 lapis parallax)
      ctx.fillStyle = 'rgba(110,145,175,0.4)';
      for (let i = 0; i < 7; i += 1) {
        const bx = ((i * 97 - t * 12) % (LW + 80) + LW + 80) % (LW + 80) - 40;
        const bh = 70 + ((i * 53) % 60);
        ctx.fillRect(bx, st.groundY - bh, 52, bh);
      }
      ctx.fillStyle = 'rgba(85,115,150,0.55)';
      for (let i = 0; i < 5; i += 1) {
        const bx = ((i * 149 - t * 24) % (LW + 100) + LW + 100) % (LW + 100) - 50;
        const bh = 45 + ((i * 71) % 50);
        ctx.fillRect(bx, st.groundY - bh, 66, bh);
      }

      // gate
      for (const g of st.gates) {
        if (g.x + g.w < -40 || g.x > LW + 40) continue;
        drawCraneMast(ctx, g);
        drawBeamStack(ctx, g, st.groundY);
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
      ctx.fillStyle = 'rgba(70,50,30,0.4)';
      for (let px = -((t * 60) % 40); px < LW; px += 40) {
        ctx.fillRect(px, gy + 22, 18, 5);
        ctx.fillRect(px + 20, gy + 40, 12, 4);
      }

      // bayangan mandor
      const shScale = Math.max(0.3, 1 - (gy - st.bird.y) / 500);
      ctx.fillStyle = 'rgba(15,23,42,0.22)';
      ctx.beginPath();
      ctx.ellipse(st.bird.x, gy + 12, 16 * shScale, 5 * shScale, 0, 0, TAU);
      ctx.fill();

      // mandor
      if (st.alive || screenRef.current !== 'over') drawMandor(ctx, st.bird, t);

      ctx.restore();
    });

    api.loop.start();
    return () => {
      apiRef.current = null;
    };
  });

  const startGame = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.sfx.click();
    restart();
  };
  const doPause = (): void => {
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
        <button style={btn} onClick={doPause} aria-label="Jeda">⏸</button>
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>👷</div>
          <h2 style={titleStyle}>FLAPPY MANDOR</h2>
          <p style={textStyle}>
            Mandor disuruh lembur tanpa uang lembur. Satu-satunya jalan pulang: terbang melewati
            <b> crane</b> dan <b>tumpukan balok</b>.
          </p>
          <p style={textStyle}>
            <b>Ketuk layar / Spasi</b> untuk mengepak. Lewati 10 gate untuk medali. Jangan nabrak — helm tidak melindungi dari PHK.
          </p>
          <button style={primaryBtn} onClick={startGame}>Mulai Terbang</button>
        </Overlay>
      )}

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

function drawClouds(ctx: CanvasRenderingContext2D, t: number, alpha: number, sc: number): void {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (let i = 0; i < 4; i += 1) {
    const cx = ((i * 137 - t * (10 + i * 4)) % (LW + 160) + LW + 160) % (LW + 160) - 80;
    const cy = 60 + ((i * 67) % 130);
    const s = sc * (0.7 + (i % 3) * 0.25);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34 * s, 13 * s, 0, 0, TAU);
    ctx.ellipse(cx - 22 * s, cy + 4 * s, 20 * s, 9 * s, 0, 0, TAU);
    ctx.ellipse(cx + 24 * s, cy + 4 * s, 22 * s, 10 * s, 0, 0, TAU);
    ctx.fill();
  }
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
