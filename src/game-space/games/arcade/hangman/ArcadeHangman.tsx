/**
 * SELAMATKAN TUKANG — tebak kata konstruksi per kategori.
 * Tiap tebakan salah merobohkan satu bagian perancah (6 nyawa).
 * Pure rules di ./logic.ts.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGameCanvas, type GameApi, sfx, TAU } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import {
  CATEGORIES, MAX_WRONG, newGame, guessLetter, maskedWord,
  isWon, isLost, livesLeft, hintLetter, collapsedPart, type Category, type Game,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('selamatkan-tukang', 'best');
const HINTS = 3;

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

/* ---------- gambar perancah yang roboh bertahap ---------- */
function steelPipe(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number): void {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, '#8b95a3'); g.addColorStop(0.5, '#d7dde5'); g.addColorStop(1, '#5b6470');
  ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, w * 0.25);
  ctx.beginPath(); ctx.moveTo(x1 - w * 0.18, y1); ctx.lineTo(x2 - w * 0.18, y2); ctx.stroke();
}

function woodPlank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#c68b4e'); g.addColorStop(0.5, '#a06a35'); g.addColorStop(1, '#7c4f24');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80,45,15,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i += 1) {
    const yy = y + 4 + i * ((h - 8) / 2);
    ctx.beginPath(); ctx.moveTo(x + 2, yy); ctx.quadraticCurveTo(x + w / 2, yy + 3, x + w - 2, yy - 1); ctx.stroke();
  }
  ctx.strokeStyle = '#4a2e12'; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

/** Pak Tukang: helm kuning, rompi oranye. pose: tenang | panik | pusing. */
function drawWorker(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number, pose: 'calm' | 'panic' | 'dazed', t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  const bob = pose === 'calm' ? Math.sin(t * 2) * 1.5 : 0;
  ctx.translate(0, bob);
  // kaki
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  const spread = pose === 'dazed' ? 14 : 8;
  ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(-spread, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(spread, 0); ctx.stroke();
  // badan + rompi
  const bg = ctx.createLinearGradient(-9, -58, 9, -26);
  bg.addColorStop(0, '#fb923c'); bg.addColorStop(1, '#c2410c');
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(-10, -58, 20, 34, 6);
  else ctx.rect(-10, -58, 20, 34);
  ctx.fill();
  ctx.fillStyle = 'rgba(253,224,71,0.85)';
  ctx.fillRect(-10, -48, 20, 4);
  // tangan
  ctx.strokeStyle = '#d9a75f'; ctx.lineWidth = 6;
  if (pose === 'panic') {
    ctx.beginPath(); ctx.moveTo(-9, -52); ctx.lineTo(-20, -72); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, -52); ctx.lineTo(20, -72); ctx.stroke();
  } else if (pose === 'dazed') {
    ctx.beginPath(); ctx.moveTo(-9, -52); ctx.lineTo(-16, -30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, -52); ctx.lineTo(16, -30); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-9, -52); ctx.lineTo(-16, -34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, -52); ctx.lineTo(16, -34); ctx.stroke();
  }
  // kepala
  const fg = ctx.createRadialGradient(-4, -68, 3, 0, -64, 14);
  fg.addColorStop(0, '#ffe9c4'); fg.addColorStop(1, '#d9a75f');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.arc(0, -64, 11, 0, TAU); ctx.fill();
  if (pose === 'dazed') {
    // mata X
    ctx.strokeStyle = '#7a2d12'; ctx.lineWidth = 2;
    for (const ex of [-4, 4]) {
      ctx.beginPath(); ctx.moveTo(ex - 2.5, -67); ctx.lineTo(ex + 2.5, -62); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + 2.5, -67); ctx.lineTo(ex - 2.5, -62); ctx.stroke();
    }
    // bintang pusing
    ctx.fillStyle = '#fde047';
    for (let i = 0; i < 3; i += 1) {
      const a = t * 2 + (i * TAU) / 3;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 20, -84 + Math.sin(a) * 5, 2.5, 0, TAU); ctx.fill();
    }
  } else {
    ctx.fillStyle = '#3a2410';
    ctx.beginPath(); ctx.arc(-4, -65, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -65, 1.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -61, 4, pose === 'panic' ? Math.PI + 0.4 : 0.3, Math.PI - 0.3); ctx.stroke();
  }
  // helm kuning
  const hg = ctx.createLinearGradient(0, -84, 0, -70);
  hg.addColorStop(0, '#fde047'); hg.addColorStop(1, '#d97706');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, -70, 12, Math.PI, 0); ctx.fill();
  ctx.fillRect(-14, -72, 28, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(-4, -77, 4, 2, -0.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawScaffold(ctx: CanvasRenderingContext2D, wrong: number, W: number, H: number, t: number): void {
  const cx = W / 2;
  const groundY = H * 0.96;
  const platY = H * 0.42;
  const half = Math.min(95, W * 0.24);
  const legL = cx - half; const legR = cx + half;

  // tanah proyek
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, groundY + 8, half + 60, 12, 0, 0, TAU); ctx.fill();

  if (wrong >= 6) {
    // ROBOH TOTAL: puing di tanah
    const dust = Math.min(1, (performance.now() % 3000) / 900);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 0.5 - dust * 0.5);
    ctx.fillStyle = '#a8a29e';
    for (let i = 0; i < 8; i += 1) {
      const px = cx + Math.sin(i * 2.3) * (30 + dust * 90);
      const py = groundY - 20 - dust * 70 + Math.cos(i * 1.7) * 14;
      ctx.beginPath(); ctx.arc(px, py, 10 + dust * 14, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // rangka ambruk miring
    ctx.save();
    ctx.translate(cx, groundY - 6);
    ctx.rotate(-0.28);
    steelPipe(ctx, -half, 0, -half + 20, -70, 9);
    steelPipe(ctx, half, 0, half - 30, -60, 9);
    woodPlank(ctx, -half - 14, -92, half * 2 + 28, 20);
    steelPipe(ctx, -half, -60, half, -20, 6);
    ctx.restore();
    // tukang duduk pusing di samping
    drawWorker(ctx, cx + half + 52, groundY, 1.05, 'dazed', t);
    // papan peringatan
    ctx.save();
    ctx.translate(cx - half - 58, groundY - 60);
    ctx.rotate(-0.06);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-34, -24, 68, 48);
    ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 4;
    ctx.strokeRect(-34, -24, 68, 48);
    ctx.fillStyle = '#1c1917';
    ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('AWAS', 0, -4);
    ctx.fillText('ROBOH!', 0, 14);
    ctx.restore();
    return;
  }

  const tilt = [0, -0.02, -0.06, -0.11, -0.17, -0.26][wrong];
  const wobble = wrong >= 3 ? Math.sin(t * (2 + wrong)) * 0.012 * wrong : 0;

  ctx.save();
  ctx.translate(cx, platY);
  ctx.rotate(tilt + wobble);

  // kaki-kaki (wrong>=2: kiri patah; wrong>=5: kanan patah)
  const legLen = groundY - platY;
  if (wrong >= 2) {
    steelPipe(ctx, -half, 6, -half + 26, legLen * 0.55, 10); // patahan kiri
    ctx.fillStyle = '#57534e';
    ctx.beginPath(); ctx.arc(-half + 26, legLen * 0.55, 7, 0, TAU); ctx.fill();
  } else {
    steelPipe(ctx, -half, 0, -half, legLen, 10);
  }
  if (wrong >= 5) {
    steelPipe(ctx, half, 6, half - 30, legLen * 0.5, 10);
    ctx.fillStyle = '#57534e';
    ctx.beginPath(); ctx.arc(half - 30, legLen * 0.5, 7, 0, TAU); ctx.fill();
  } else {
    steelPipe(ctx, half, 0, half, legLen, 10);
  }
  // pengaku silang (wrong>=1: satu lepas -> digambar jatuh di tanah)
  if (wrong >= 1) {
    steelPipe(ctx, -half, 10, half, legLen * 0.45, 6);
  } else {
    steelPipe(ctx, -half, 10, half, legLen * 0.45, 6);
    steelPipe(ctx, half, 10, -half, legLen * 0.45, 6);
  }
  // papan lantai (wrong>=3: melorot / bergeser)
  const shift = wrong >= 3 ? 16 : 0;
  woodPlank(ctx, -half - 12 + shift, -16, half + 8, 15);
  woodPlank(ctx, 4 + shift, -16, half + 8, 15);
  if (wrong >= 3) {
    ctx.strokeStyle = 'rgba(248,113,113,0.9)'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(-half - 12 + shift, -16, half * 2 + 20, 15);
    ctx.setLineDash([]);
  }
  // palang pengaman atas
  steelPipe(ctx, -half, -16, -half, -52, 7);
  steelPipe(ctx, half, -16, half, -52, 7);
  steelPipe(ctx, -half, -52, half, -52, 7);

  // tukang berdiri di atas papan
  const pose = wrong >= 4 ? 'panic' : 'calm';
  drawWorker(ctx, wrong >= 4 ? 14 : 0, -16, 1.0, pose, t);
  ctx.restore();

  // pengaku yang lepas tergeletak di tanah
  if (wrong >= 1 && wrong < 6) {
    ctx.save();
    ctx.translate(cx - half - 30, groundY - 4);
    ctx.rotate(0.12 + Math.sin(t * 0.5) * 0.01);
    steelPipe(ctx, 0, 0, 60, -8, 6);
    ctx.restore();
  }
  // debu saat goyang
  if (wrong >= 3) {
    ctx.fillStyle = 'rgba(168,162,158,0.35)';
    for (let i = 0; i < 5; i += 1) {
      const px = cx + Math.sin(t * 1.3 + i * 2.1) * (half + 20);
      const py = groundY - 10 - ((t * 30 + i * 47) % 90);
      ctx.beginPath(); ctx.arc(px, py, 4 + (i % 3) * 2, 0, TAU); ctx.fill();
    }
  }
}

export default function ArcadeHangman({ onExit }: { onExit: () => void }): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [cat, setCat] = useState<Category>(CATEGORIES[0]);
  const [game, setGame] = useState<Game>(() => newGame(CATEGORIES[0]));
  const [tick, setTick] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(HINTS);
  const [best, setBestState] = useState(() => getBest(BK, 0));
  const [muted, setMuted] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  const apiRef = useRef<GameApi | null>(null);

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.setUpdate(() => {});
    api.setRender(() => {
      const { ctx, W, H } = api;
      const t = performance.now() / 1000;
      // langit senja proyek berlapis
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#141b36'); g.addColorStop(0.5, '#3c2c55'); g.addColorStop(0.78, '#7a4a3c'); g.addColorStop(1, '#2a1e22');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // matahari terbenam
      const sg = ctx.createRadialGradient(W * 0.78, H * 0.66, 4, W * 0.78, H * 0.66, 90);
      sg.addColorStop(0, 'rgba(253,186,116,0.9)'); sg.addColorStop(0.4, 'rgba(251,146,60,0.35)'); sg.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fdba74';
      ctx.beginPath(); ctx.arc(W * 0.78, H * 0.66, 20, 0, TAU); ctx.fill();
      // siluet tower crane
      ctx.strokeStyle = 'rgba(10,8,18,0.75)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      const kx = W * 0.16;
      ctx.beginPath(); ctx.moveTo(kx, H * 0.92); ctx.lineTo(kx, H * 0.2); ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(kx - 60, H * 0.26); ctx.lineTo(kx + 80, H * 0.26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx + 80, H * 0.26); ctx.lineTo(kx + 80, H * 0.4); ctx.stroke();
      const ksw = Math.sin(t * 0.7) * 8;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(kx + 80 + ksw * 0.3, H * 0.4); ctx.lineTo(kx + 80 + ksw, H * 0.52); ctx.stroke();
      ctx.fillStyle = 'rgba(10,8,18,0.75)';
      ctx.fillRect(kx + 80 + ksw - 6, H * 0.52, 12, 10);
      // tanah
      const tg = ctx.createLinearGradient(0, H * 0.86, 0, H);
      tg.addColorStop(0, '#3a2c20'); tg.addColorStop(1, '#211812');
      ctx.fillStyle = tg; ctx.fillRect(0, H * 0.86, W, H * 0.14);
      // cone lalu lintas
      for (let i = 0; i < 3; i += 1) {
        const coneX = W * 0.06 + i * 34;
        const coneY = H * 0.94;
        ctx.fillStyle = '#ea580c';
        ctx.beginPath(); ctx.moveTo(coneX - 9, coneY); ctx.lineTo(coneX + 9, coneY); ctx.lineTo(coneX, coneY - 22); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(coneX - 5.5, coneY - 14, 11, 5);
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(coneX - 12, coneY - 2, 24, 4);
      }

      drawScaffold(ctx, gameRef.current.wrong, W, H * 0.60, t);
      const vg = ctx.createRadialGradient(W / 2, H / 2, 140, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(3,6,14,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    });
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  const startRound = useCallback((c: Category) => {
    gameRef.current = newGame(c);
    setGame(gameRef.current);
    setCat(c);
    setHintsLeft(HINTS);
    refresh();
  }, [refresh]);

  const doGuess = useCallback((ch: string) => {
    if (screenRef.current !== 'play') return;
    const g = gameRef.current;
    const r = guessLetter(g, ch);
    if (r === 'repeat' || r === 'done') return;
    sfx.ensure();
    if (r === 'hit') {
      sfx.pop(1.3);
      const api = apiRef.current;
      if (api) api.particles.spawn(api.W / 2, api.H * 0.4, { count: 14, colors: ['#4ade80', '#fbbf24'], speed: [60, 200], life: [0.4, 0.8], size: [2, 5] });
    } else {
      sfx.thud(0.8);
      apiRef.current?.shake.add(7);
      const api = apiRef.current;
      if (api) api.particles.spawn(api.W / 2, api.H * 0.35, { count: 22, colors: ['#a8a29e', '#78716c', '#d6d3d1'], speed: [60, 240], life: [0.5, 1], size: [3, 7], gravity: 500, shape: 'rect', rotation: true });
    }
    refresh();
    if (isWon(g)) {
      sfx.chime(4);
      const score = livesLeft(g) * 100 + g.word.length * 20;
      const nb = setBest(BK, score);
      setBestState(nb);
      const api = apiRef.current;
      if (api) {
        for (let i = 0; i < 4; i += 1) {
          api.particles.spawn(api.W * (0.2 + i * 0.2), -10, {
            count: 26, colors: ['#4ade80', '#fbbf24', '#60a5fa'], speed: [120, 300],
            angle: Math.PI / 2, spread: 1, gravity: 400, life: [1, 2], size: [3, 6], shape: 'rect', rotation: true,
          });
        }
      }
      window.setTimeout(() => { if (screenRef.current === 'play') setScreen('over'); }, 1300);
    } else if (isLost(g)) {
      sfx.fail();
      window.setTimeout(() => { if (screenRef.current === 'play') setScreen('over'); }, 1500);
    }
  }, [refresh]);

  const useHint = useCallback(() => {
    if (screenRef.current !== 'play' || hintsLeft <= 0) return;
    const g = gameRef.current;
    const h = hintLetter(g);
    if (!h) return;
    setHintsLeft((x) => x - 1);
    doGuess(h);
  }, [doGuess, hintsLeft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screenRef.current === 'play') {
        if (/^[a-zA-Z]$/.test(e.key)) doGuess(e.key.toUpperCase());
        else if (e.key === 'Escape') { apiRef.current?.loop.setPaused(true); setScreen('pause'); }
      } else if (screenRef.current === 'pause' && e.key === 'Escape') {
        apiRef.current?.loop.setPaused(false); setScreen('play');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doGuess]);

  const startGame = (): void => {
    sfx.ensure(); sfx.whoosh();
    startRound(CATEGORIES[0]);
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };
  const togglePause = (): void => {
    if (screenRef.current === 'play') { apiRef.current?.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { apiRef.current?.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    setMuted((m) => {
      const next = !m;
      if (apiRef.current && apiRef.current.sfx.muted !== next) apiRef.current.sfx.toggleMute();
      return next;
    });
  };

  void tick;
  const g = game;
  const masked = maskedWord(g);
  const won = isWon(g);
  const lost = isLost(g);
  void lost;
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const inGame = screen === 'play' || screen === 'pause';

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(14,16,34,0.6)', color: '#fff', fontSize: 19, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
  };
  const card: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(6,8,20,0.66)', backdropFilter: 'blur(5px)', zIndex: 20, padding: 18,
  };
  const panel: React.CSSProperties = {
    background: 'linear-gradient(165deg,#3a2c1e,#1c130b)', border: '1px solid rgba(251,191,36,0.3)',
    borderRadius: 22, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center',
    color: '#f1eefb', boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
  };
  const bigBtn: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: 10, padding: '13px 16px', borderRadius: 14,
    border: 'none', fontFamily: FONT, fontWeight: 900, fontSize: 15, cursor: 'pointer',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 640, overflow: 'hidden', borderRadius: 18, fontFamily: FONT, userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(14,16,34,0.6)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14, padding: '8px 14px', color: '#fff', backdropFilter: 'blur(6px)', maxWidth: 230 }}>
          <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 1, color: '#fbbf24' }}>🪜 SELAMATKAN TUKANG</div>
          <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
            {cat.icon} {cat.label} • {'🟢'.repeat(livesLeft(g))}{'⚪'.repeat(g.wrong)} • ⭐ {best}
          </div>
          {g.wrong > 0 && !won && (
            <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>💥 {collapsedPart(g.wrong)}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {inGame && <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {/* kata */}
      <div style={{ position: 'absolute', top: '47%', left: 0, right: 0, zIndex: 8, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', padding: '0 16px' }}>
        {masked.map((ch, i) => (
          <div key={i} style={{
            width: 34, height: 46, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 22, color: ch === '_' ? 'transparent' : '#fff',
            background: ch === '_' ? 'rgba(10,12,28,0.55)' : 'linear-gradient(160deg,#4ade80,#15803d)',
            border: '2px solid rgba(255,255,255,0.2)',
            boxShadow: ch === '_' ? 'inset 0 3px 8px rgba(0,0,0,0.5)' : '0 4px 12px rgba(74,222,128,0.4)',
            textShadow: ch === '_' ? 'none' : '0 2px 4px rgba(0,0,0,0.4)',
          }}>
            {ch === '_' ? '•' : ch}
          </div>
        ))}
      </div>

      {/* hint */}
      {screen === 'play' && (
        <div style={{ position: 'absolute', top: '47%', right: 12, zIndex: 9, transform: 'translateY(-92px)' }}>
          <button onClick={useHint} disabled={hintsLeft <= 0} aria-label="Hint"
            style={{ ...btn, opacity: hintsLeft <= 0 ? 0.4 : 1, fontSize: 16 }}>
            💡{hintsLeft}
          </button>
        </div>
      )}

      {/* keyboard huruf */}
      {inGame && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 10px 14px', zIndex: 10, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', background: 'linear-gradient(180deg,transparent,rgba(5,7,16,0.75))' }}>
          {ALPHA.map((ch) => {
            const used = g.guessed.has(ch);
            const hit = used && g.word.includes(ch);
            return (
              <button key={ch} onClick={() => doGuess(ch)} disabled={used}
                style={{
                  width: 38, height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)',
                  background: used ? (hit ? 'linear-gradient(160deg,#4ade80,#15803d)' : 'rgba(60,60,80,0.4)') : 'linear-gradient(160deg,#4a3a28,#2a2013)',
                  color: used ? (hit ? '#052e12' : '#8a8aa0') : '#fff',
                  fontWeight: 800, fontSize: 15, cursor: used ? 'default' : 'pointer', fontFamily: FONT,
                  opacity: used && !hit ? 0.5 : 1,
                }}>
                {ch}
              </button>
            );
          })}
        </div>
      )}

      {screen === 'tutorial' && (
        <div style={card}><div style={panel}>
          <div style={{ fontSize: 42 }}>🪜</div>
          <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fbbf24', letterSpacing: 1 }}>SELAMATKAN TUKANG</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.92 }}>
            Tebak <b>kata konstruksi</b> huruf per huruf! Tiap salah tebak, <b>satu bagian perancah roboh</b> —
            <b> 6x salah</b>, Pak Tukang ikut jatuh! 🧑‍🔧
          </p>
          <div style={{ textAlign: 'left', fontSize: 13, lineHeight: 2, background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '10px 14px', margin: '8px 0' }}>
            <div>🟢 <b>6 nyawa</b> — tiap salah, perancah makin oleng</div>
            <div>🗂️ 4 kategori: material, alat, tukang & tim, proyek</div>
            <div>💡 3 hint per ronde (membuka huruf)</div>
            <div>⌨️ Bisa pakai keyboard fisik juga</div>
          </div>
          <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={startGame}>Mulai Menyelamatkan</button>
        </div></div>
      )}

      {screen === 'pause' && (
        <div style={card}><div style={panel}>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22 }}>JEDA</h2>
          <p style={{ fontSize: 13, opacity: 0.85 }}>Perancahnya berhenti roboh. Pak Tukang ikut ngopi dulu.</p>
          <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={togglePause}>Lanjutkan</button>
          <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
        </div></div>
      )}

      {screen === 'over' && (
        <div style={card}><div style={panel}>
          <div style={{ fontSize: 42 }}>{won ? '🎉' : '💥'}</div>
          <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: won ? '#4ade80' : '#f87171' }}>
            {won ? 'TUKANG SELAMAT!' : 'PERANCAH ROBOH!'}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.9 }}>
            Kata: <b style={{ letterSpacing: 3, fontSize: 18, color: '#fde047' }}>{g.word}</b><br />
            {won ? `Skor ronde: ${livesLeft(g) * 100 + g.word.length * 20} — mandor kasih bonus!` : 'Pak Tukang selamat dari reruntuhan. Coba kata lain!'}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
            {CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => { startRound(c); }}
                style={{ padding: '8px 10px', borderRadius: 10, border: cat.id === c.id ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#4ade80,#16a34a)', color: '#052e12' }} onClick={() => { sfx.ensure(); startRound(cat); setScreen('play'); }}>Main Lagi 🔁</button>
          <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
        </div></div>
      )}
    </div>
  );
}
