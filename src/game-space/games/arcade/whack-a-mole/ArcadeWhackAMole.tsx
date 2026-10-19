/**
 * ArcadeWhackAMole ("Pukul Paku") — pukul paku yang menonjol dari papan kayu
 * sebelum masuk lagi. Paku emas = bonus. 60 detik, makin cepat di akhir.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, easeOutBack } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  nextSpawn, spawnDelay, scoreHit, gradeFor,
  GAME_DURATION, HOLE_COUNT, type NailKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('pukul-paku', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Nail {
  hole: number;
  kind: NailKind;
  age: number;
  upTime: number;
  hit: boolean;
}

interface Strike {
  x: number;
  y: number;
  age: number;
}

interface S {
  nails: Nail[];
  strikes: Strike[];
  spawnT: number;
  elapsed: number;
  score: number;
  streak: number;
  bestStreak: number;
  hits: number;
  golds: number;
  misses: number;
  over: boolean;
  t: number;
}

export default function ArcadeWhackAMole({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, timeLeft: GAME_DURATION, streak: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      nails: [], strikes: [], spawnT: 0.6, elapsed: 0,
      score: 0, streak: 0, bestStreak: 0, hits: 0, golds: 0, misses: 0,
      over: false, t: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, timeLeft: Math.max(0, GAME_DURATION - s.elapsed), streak: s.streak, best: getBest(BK, 0) });
    };

    const reset = (): void => {
      s.nails = []; s.strikes = []; s.spawnT = 0.6; s.elapsed = 0;
      s.score = 0; s.streak = 0; s.bestStreak = 0; s.hits = 0; s.golds = 0; s.misses = 0;
      s.over = false;
      push();
    };

    const endGame = (): void => {
      s.over = true;
      const nb = setBest(BK, s.score);
      api.sfx.chime(3);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'WAKTU HABIS!', { size: 32, color: '#fde047' });
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 60, colors: ['#fde047', '#fbbf24', '#fff7d6', '#d97706'],
        speed: [100, 380], life: [0.6, 1.1], size: [2, 6], gravity: 320, shape: 'rect', rotation: true,
      });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, timeLeft: 0, streak: s.streak, best: nb });
        setScreen('over');
      }, 1200);
    };

    // posisi lubang 3x3 di atas papan
    const holePos = (i: number, W: number, H: number): { x: number; y: number } => {
      const col = i % 3; const row = Math.floor(i / 3);
      const top = H * 0.30;
      const gapX = Math.min(120, (W - 80) / 2.4);
      const gapY = Math.min(128, (H * 0.52) / 2.4);
      return { x: W / 2 + (col - 1) * gapX, y: top + row * gapY };
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      s.strikes.push({ x: p.x, y: p.y, age: 0 });
      // cari paku aktif terdekat
      let best: Nail | null = null;
      let bestD = 64;
      for (const n of s.nails) {
        if (n.hit) continue;
        const hp = holePos(n.hole, api.W, api.H);
        const d = Math.hypot(p.x - hp.x, p.y - (hp.y - 24));
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best) {
        best.hit = true;
        const res = scoreHit(best.kind, s.streak);
        s.streak = res.newStreak;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        s.score += res.points;
        s.hits += 1;
        if (best.kind === 'emas') s.golds += 1;
        const hp = holePos(best.hole, api.W, api.H);
        api.sfx.thud(best.kind === 'emas' ? 1.3 : 0.9);
        api.particles.spawn(hp.x, hp.y - 30, {
          count: best.kind === 'emas' ? 26 : 14,
          colors: best.kind === 'emas' ? ['#fde047', '#fbbf24', '#fff7d6'] : ['#d6a05c', '#a16207', '#fef3c7'],
          speed: [90, 340], life: [0.35, 0.8], size: [2, 5], gravity: 600, shape: 'rect', rotation: true,
        });
        api.scores.add(hp.x, hp.y - 70, `+${res.points}${best.kind === 'emas' ? ' ✨' : ''}`, {
          color: best.kind === 'emas' ? '#fde047' : '#fef3c7', size: best.kind === 'emas' ? 24 : 19,
        });
        if (s.streak >= 5 && s.streak % 5 === 0) {
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `🔨 Streak x${s.streak}!`, { size: 22, color: '#fb923c' });
        }
        s.nails = s.nails.filter((n) => n !== best);
      } else {
        // meleset: streak putus
        if (s.streak > 0) {
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, 'Meleset!', { size: 16, color: '#94a3b8' });
        }
        s.streak = 0;
        s.misses += 1;
        api.sfx.click();
      }
      push();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.over) return;
      s.t += dt;
      s.elapsed += dt;
      if (s.elapsed >= GAME_DURATION) { endGame(); return; }

      // spawn paku baru
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = spawnDelay(s.elapsed, rng);
        const active = new Set(s.nails.map((n) => n.hole));
        if (active.size < HOLE_COUNT) {
          const sp = nextSpawn(rng, s.elapsed, active);
          s.nails.push({ hole: sp.hole, kind: sp.kind, age: 0, upTime: sp.upTime, hit: false });
        }
      }
      // paku yang kelamaan → masuk lagi (streak tidak putus, cuma hilang)
      for (const n of s.nails) n.age += dt;
      s.nails = s.nails.filter((n) => n.age < n.upTime + 0.15);
      for (const st of s.strikes) st.age += dt;
      s.strikes = s.strikes.filter((st) => st.age < 0.22);
      push();
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      // dinding bengkel
      const wall = ctx.createLinearGradient(0, 0, 0, H);
      wall.addColorStop(0, '#4a3220');
      wall.addColorStop(0.6, '#3a2718');
      wall.addColorStop(1, '#2a1c11');
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, W, H);
      // sambungan papan dinding
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      for (let y = 40; y < H; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,220,160,0.06)';
      ctx.lineWidth = 1;
      for (let y = 44; y < H; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // debu melayang
      ctx.fillStyle = 'rgba(255,225,170,0.20)';
      for (let i = 0; i < 12; i += 1) {
        const px = ((i * 113 + s.t * 14) % (W + 40)) - 20;
        const py = (i * 71 + s.t * 6) % H;
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill();
      }
    };

    const drawBoard = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const bw = Math.min(W - 32, 340);
      const bh = H * 0.62;
      const bx = W / 2 - bw / 2;
      const by = H * 0.24;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      const wood = ctx.createLinearGradient(0, by, 0, by + bh);
      wood.addColorStop(0, '#c68b4e');
      wood.addColorStop(0.5, '#a06a35');
      wood.addColorStop(1, '#7c4f24');
      ctx.fillStyle = wood;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, bw, bh, 22);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.restore();
      // serat kayu
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, bw, bh, 22);
      else ctx.rect(bx, by, bw, bh);
      ctx.clip();
      ctx.strokeStyle = 'rgba(80,45,15,0.30)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 9; i += 1) {
        const gy = by + 14 + i * (bh - 28) / 8;
        ctx.beginPath();
        ctx.moveTo(bx, gy);
        ctx.bezierCurveTo(bx + bw * 0.3, gy + 6, bx + bw * 0.6, gy - 6, bx + bw, gy + 3);
        ctx.stroke();
      }
      // bingkai dalam
      ctx.strokeStyle = 'rgba(60,35,12,0.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx + 8, by + 8, bw - 16, bh - 16, 14);
      else ctx.rect(bx + 8, by + 8, bw - 16, bh - 16);
      ctx.stroke();
      // gloss atas
      const gl = ctx.createLinearGradient(0, by, 0, by + 60);
      gl.addColorStop(0, 'rgba(255,235,190,0.25)');
      gl.addColorStop(1, 'rgba(255,235,190,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(bx, by, bw, 60);
      ctx.restore();
      // label papan
      ctx.fillStyle = 'rgba(50,28,10,0.85)';
      ctx.font = `900 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪵 PAPAN PAKU MANDOR', W / 2, by + bh - 22);
    };

    const drawHole = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
      // rim kayu
      const rim = ctx.createLinearGradient(x - 34, y - 14, x + 34, y + 14);
      rim.addColorStop(0, '#8a5a28');
      rim.addColorStop(1, '#5e3a16');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.ellipse(x, y, 34, 15, 0, 0, TAU);
      ctx.fill();
      // lubang gelap berlapis
      const dark = ctx.createRadialGradient(x, y - 2, 2, x, y, 27);
      dark.addColorStop(0, '#000000');
      dark.addColorStop(0.7, '#140b04');
      dark.addColorStop(1, '#2b1a0c');
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(x, y, 27, 11.5, 0, 0, TAU);
      ctx.fill();
    };

    const drawNail = (ctx: CanvasRenderingContext2D, x: number, y: number, kind: NailKind, age: number, upTime: number): void => {
      const grow = easeOutBack(clamp(age / 0.16, 0, 1));
      const sink = age > upTime ? clamp(1 - (age - upTime) / 0.15, 0, 1) : 1;
      const pop = grow * sink;
      if (pop <= 0.01) return;
      const nh = 52 * pop;
      const tilt = Math.sin(age * 2 + x) * 0.05;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      if (kind === 'emas') {
        ctx.shadowColor = 'rgba(253,224,71,0.9)';
        ctx.shadowBlur = 20;
      }
      // badan paku (baja berlapis)
      const bw2 = 13;
      const steel = ctx.createLinearGradient(-bw2 / 2, 0, bw2 / 2, 0);
      if (kind === 'emas') {
        steel.addColorStop(0, '#b45309');
        steel.addColorStop(0.4, '#fde047');
        steel.addColorStop(0.6, '#fbbf24');
        steel.addColorStop(1, '#92400e');
      } else {
        steel.addColorStop(0, '#4b5563');
        steel.addColorStop(0.4, '#d1d5db');
        steel.addColorStop(0.6, '#9ca3af');
        steel.addColorStop(1, '#374151');
      }
      ctx.fillStyle = steel;
      const top = -nh;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-bw2 / 2, top + 8, bw2, nh - 8, 5);
      else ctx.rect(-bw2 / 2, top + 8, bw2, nh - 8);
      ctx.fill();
      // ulir paku
      ctx.strokeStyle = kind === 'emas' ? 'rgba(120,53,15,0.6)' : 'rgba(30,35,45,0.55)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i += 1) {
        const yy = top + 16 + i * 9;
        if (yy < -2) {
          ctx.beginPath(); ctx.moveTo(-bw2 / 2 + 1, yy); ctx.lineTo(bw2 / 2 - 1, yy); ctx.stroke();
        }
      }
      // kepala paku
      const hg = ctx.createLinearGradient(0, top - 8, 0, top + 8);
      if (kind === 'emas') {
        hg.addColorStop(0, '#fef08a');
        hg.addColorStop(0.5, '#f59e0b');
        hg.addColorStop(1, '#b45309');
      } else {
        hg.addColorStop(0, '#e5e7eb');
        hg.addColorStop(0.5, '#9ca3af');
        hg.addColorStop(1, '#4b5563');
      }
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(0, top + 4, 17, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(-5, top + 1, 7, 3, -0.25, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    const drawStrike = (ctx: CanvasRenderingContext2D, st: Strike): void => {
      const k = st.age / 0.22;
      const ang = -0.9 + k * 1.1;
      ctx.save();
      ctx.translate(st.x, st.y - 10);
      ctx.rotate(ang);
      ctx.globalAlpha = 1 - k * 0.6;
      // gagang
      const hg = ctx.createLinearGradient(-6, 0, 6, 0);
      hg.addColorStop(0, '#92400e');
      hg.addColorStop(0.5, '#d97706');
      hg.addColorStop(1, '#78350f');
      ctx.fillStyle = hg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-6, -64, 12, 56, 6);
      else ctx.rect(-6, -64, 12, 56);
      ctx.fill();
      // kepala palu
      const mg = ctx.createLinearGradient(0, -86, 0, -58);
      mg.addColorStop(0, '#9ca3af');
      mg.addColorStop(0.5, '#6b7280');
      mg.addColorStop(1, '#374151');
      ctx.fillStyle = mg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-26, -86, 52, 28, 8);
      else ctx.rect(-26, -86, 52, 28);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-26, -86, 52, 8);
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      // shake sudah di-apply otomatis oleh useGameCanvas — jangan double
      drawBackground(ctx, W, H);
      drawBoard(ctx, W, H);
      for (let i = 0; i < HOLE_COUNT; i += 1) {
        const hp = holePos(i, W, H);
        drawHole(ctx, hp.x, hp.y);
      }
      for (const n of s.nails) {
        const hp = holePos(n.hole, W, H);
        drawNail(ctx, hp.x, hp.y, n.kind, n.age, n.upTime);
      }
      for (const st of s.strikes) drawStrike(ctx, st);
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(15,8,2,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    api?.sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
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
    background: 'rgba(30,18,8,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const grade = gradeFor(hud.score);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#3a2718', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(30,18,8,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 120 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(hud.timeLeft / GAME_DURATION) * 100}%`, background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            ⏱ {Math.ceil(hud.timeLeft)}s {hud.streak >= 2 && <span style={{ color: '#fb923c', fontWeight: 900 }}>• 🔨x{hud.streak}</span>}
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
          <div style={{ fontSize: 42 }}>🔨</div>
          <h2 style={h2}>PUKUL PAKU</h2>
          <p style={p}>
            Paku-paku menonjol dari papan — <b>ketuk</b> sebelum masuk lagi!
            <b> ✨ Paku emas</b> = bonus besar. Streak pukulan beruntun = <b>poin ekstra</b>.
            Waktumu <b>60 detik</b>!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Memaku</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Paku-pakunya ikut istirahat. Palunya jangan sampai hilang.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{grade === 'S' ? '🏆' : '🔨'}</div>
          <h2 style={h2}>PAPAN RATA!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Grade" value={grade} />
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
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#d6a05c', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,12,5,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#4a3220,#241708)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
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
