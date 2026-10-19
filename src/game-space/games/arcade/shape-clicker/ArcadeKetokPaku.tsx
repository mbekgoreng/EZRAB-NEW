/**
 * ArcadeKetokPaku ("Ketok Paku") — paku-paku menonjol di atas gambar kerja
 * (blueprint). Ketok secepatnya sebelum tenggelam lagi! Level naik → makin
 * ramai & cepat. Paku emas = bonus. Salah ketok = streak putus.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, easeOutBack, sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  levelFor, maxActiveAt, spawnDelayAt, upTimeAt, nextKind, tapPoints, gradeFor,
  type NailKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('ketok-paku', 'best');
const MAX_LIVES = 3;

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Nail {
  id: number;
  kind: NailKind;
  x: number; y: number;
  age: number;
  upTime: number;
  r: number;
}

interface Ring { x: number; y: number; age: number; gold: boolean; }

interface S {
  nails: Nail[];
  rings: Ring[];
  spawnT: number;
  score: number;
  streak: number;
  bestStreak: number;
  hits: number;
  lives: number;
  level: number;
  over: boolean;
  t: number;
  nextId: number;
  lastLevel: number;
}

export default function ArcadeKetokPaku({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, level: 1, lives: MAX_LIVES, streak: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      nails: [], rings: [], spawnT: 0.5, score: 0, streak: 0,
      bestStreak: 0, hits: 0, lives: MAX_LIVES, level: 1, over: false,
      t: 0, nextId: 1, lastLevel: 1,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, level: s.level, lives: s.lives, streak: s.streak, best: getBest(BK, 0) });
    };

    const reset = (): void => {
      s.nails = []; s.rings = []; s.spawnT = 0.5; s.score = 0; s.streak = 0;
      s.bestStreak = 0; s.hits = 0; s.lives = MAX_LIVES; s.level = 1;
      s.over = false; s.lastLevel = 1;
      push();
    };

    const endGame = (): void => {
      if (s.over) return;
      s.over = true;
      const nb = setBest(BK, s.score);
      sfx.fail();
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '🔩 PAKU LEPAS SEMUA!', { size: 26, color: '#fca5a5' });
      api.shake.add(0.7);
      window.setTimeout(() => {
        api.pushHud({ score: s.score, level: s.level, lives: s.lives, streak: s.streak, best: nb });
        setScreen('over');
      }, 1300);
    };

    const playArea = (): { x0: number; y0: number; x1: number; y1: number } => ({
      x0: 30, y0: api.H * 0.20, x1: api.W - 30, y1: api.H * 0.92,
    });

    const spawnNail = (): void => {
      const pa = playArea();
      const kind = nextKind(rng);
      // cari posisi yang tidak menumpuk paku lain
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const x = pa.x0 + 40 + rng() * (pa.x1 - pa.x0 - 80);
        const y = pa.y0 + 50 + rng() * (pa.y1 - pa.y0 - 100);
        const clash = s.nails.some((n) => Math.hypot(n.x - x, n.y - y) < 84);
        if (!clash || attempt === 11) {
          s.nails.push({
            id: s.nextId++, kind, x, y,
            age: 0, upTime: upTimeAt(s.level, rng),
            r: kind === 'emas' ? 30 : 26,
          });
          sfx.whoosh();
          return;
        }
      }
    };

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      // paku aktif terdekat yang kena ketuk
      let best: Nail | null = null;
      let bestD = 52;
      for (const n of s.nails) {
        const d = Math.hypot(p.x - n.x, p.y - (n.y - n.r * 1.4));
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best) {
        s.nails = s.nails.filter((n) => n !== best);
        const res = tapPoints(best.kind, s.streak);
        s.streak = res.newStreak;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        s.score += res.points;
        s.hits += 1;
        const gold = best.kind === 'emas';
        sfx.thud(gold ? 1.3 : 0.9);
        if (gold) sfx.chime(2, 880);
        s.rings.push({ x: best.x, y: best.y - best.r, age: 0, gold });
        api.particles.spawn(best.x, best.y - best.r * 1.6, {
          count: gold ? 26 : 14,
          colors: gold ? ['#fde047', '#fbbf24', '#fff7d6'] : ['#d1d5db', '#6b7280', '#fef3c7'],
          speed: [80, 320], life: [0.3, 0.7], size: [2, 5], gravity: 620, shape: 'spark', rotation: true,
        });
        api.scores.add(best.x, best.y - best.r * 2.6, `+${res.points}${gold ? ' ✨' : ''}`, {
          color: gold ? '#fde047' : '#ffffff', size: gold ? 24 : 19,
        });
        // naik level?
        const lv = levelFor(s.hits);
        if (lv > s.level) {
          s.level = lv;
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `📐 LEVEL ${lv} — MAKIN RAMAI!`, { size: 22, color: '#7dd3fc' });
          sfx.chime(3, 660);
        }
        const wrap2 = wrapRef.current;
        if (s.streak > 0 && s.streak % 8 === 0 && wrap2) {
          popText(wrap2, `🔨 Streak x${s.streak}!`, { size: 20, color: '#fdba74' });
        }
      } else {
        // salah ketok: streak putus
        if (s.streak >= 3) {
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, 'Meleset!', { size: 15, color: '#94a3b8' });
        }
        s.streak = 0;
        sfx.click();
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

      // spawn
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = spawnDelayAt(s.level, rng);
        if (s.nails.length < maxActiveAt(s.level)) spawnNail();
      }
      // paku menua; yang tenggelam tanpa diketok = nyawa -1
      for (const n of s.nails) n.age += dt;
      const escaped = s.nails.filter((n) => n.age >= n.upTime + 0.18);
      for (const n of escaped) {
        s.lives -= 1;
        s.streak = 0;
        sfx.thud(0.6);
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, '🔩 Paku lepas! −1 nyawa', { size: 15, color: '#fca5a5' });
        api.particles.spawn(n.x, n.y, {
          count: 8, colors: ['#6b7280', '#374151'],
          speed: [40, 160], life: [0.3, 0.5], size: [2, 4], gravity: 500, shape: 'circle',
        });
        if (s.lives <= 0) {
          s.nails = [];
          endGame();
          return;
        }
      }
      s.nails = s.nails.filter((n) => n.age < n.upTime + 0.18);
      // ring ketokan
      for (const r of s.rings) r.age += dt;
      s.rings = s.rings.filter((r) => r.age < 0.4);
      push();
    });

    /* ---------------- rendering ---------------- */

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      // gambar kerja (blueprint)
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1e3a5f');
      g.addColorStop(0.5, '#16324f');
      g.addColorStop(1, '#0d2138');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // grid blueprint berlapis
      ctx.strokeStyle = 'rgba(125,211,252,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 28) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 28) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(125,211,252,0.16)';
      for (let x = 0; x < W; x += 140) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 140) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // sketsa denah samar
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2;
      ctx.strokeRect(W * 0.12, H * 0.3, W * 0.3, H * 0.22);
      ctx.strokeRect(W * 0.58, H * 0.55, W * 0.3, H * 0.26);
      ctx.beginPath(); ctx.arc(W * 0.7, H * 0.36, 44, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W * 0.12, H * 0.41); ctx.lineTo(W * 0.42, H * 0.41);
      ctx.moveTo(W * 0.27, H * 0.3); ctx.lineTo(W * 0.27, H * 0.52);
      ctx.stroke();
      // garis dimensi
      ctx.font = `800 11px ${FONT}`;
      ctx.fillStyle = '#bae6fd';
      ctx.textAlign = 'center';
      ctx.fillText('6.000', W * 0.27, H * 0.3 - 8);
      ctx.fillText('Ø 8', W * 0.7, H * 0.36 - 50);
      ctx.restore();
      // kop gambar di bawah
      ctx.fillStyle = 'rgba(224,242,254,0.85)';
      ctx.font = `900 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('📐 GAMBAR KERJA — DENAH PAKU LANTAI 1', W / 2, H - 14);
    };

    const drawNailHole = (ctx: CanvasRenderingContext2D, n: Nail): void => {
      // lubang di blueprint
      const hg = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, n.r * 1.05);
      hg.addColorStop(0, '#020617');
      hg.addColorStop(0.7, '#0a1830');
      hg.addColorStop(1, 'rgba(10,24,48,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(n.x, n.y, n.r * 1.05, n.r * 0.45, 0, 0, TAU); ctx.fill();
    };

    const drawNail = (ctx: CanvasRenderingContext2D, n: Nail): void => {
      const grow = easeOutBack(clamp(n.age / 0.16, 0, 1));
      const sinkStart = n.upTime;
      const sink = n.age > sinkStart ? clamp(1 - (n.age - sinkStart) / 0.18, 0, 1) : 1;
      const pop = grow * sink;
      if (pop <= 0.01) return;
      const nh = (n.r * 2.2) * pop;
      const wob = Math.sin(n.age * 9 + n.x) * 0.06 * (1 - grow * 0.5);
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(wob);
      if (n.kind === 'emas') {
        ctx.shadowColor = 'rgba(253,224,71,0.95)';
        ctx.shadowBlur = 22;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 6;
      }
      const bw2 = n.r * 0.52;
      // badan paku baja berlapis
      const steel = ctx.createLinearGradient(-bw2 / 2, 0, bw2 / 2, 0);
      if (n.kind === 'emas') {
        steel.addColorStop(0, '#b45309');
        steel.addColorStop(0.4, '#fde047');
        steel.addColorStop(0.6, '#fbbf24');
        steel.addColorStop(1, '#92400e');
      } else {
        steel.addColorStop(0, '#4b5563');
        steel.addColorStop(0.4, '#e5e7eb');
        steel.addColorStop(0.6, '#9ca3af');
        steel.addColorStop(1, '#374151');
      }
      ctx.fillStyle = steel;
      const top = -nh;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-bw2 / 2, top + 10, bw2, nh - 10, 5);
      else ctx.rect(-bw2 / 2, top + 10, bw2, nh - 10);
      ctx.fill();
      // ulir
      ctx.strokeStyle = n.kind === 'emas' ? 'rgba(120,53,15,0.6)' : 'rgba(30,35,45,0.55)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i += 1) {
        const yy = top + 18 + i * 10;
        if (yy < -2) {
          ctx.beginPath(); ctx.moveTo(-bw2 / 2 + 1, yy); ctx.lineTo(bw2 / 2 - 1, yy); ctx.stroke();
        }
      }
      // kepala paku
      const hg = ctx.createLinearGradient(0, top - 9, 0, top + 9);
      if (n.kind === 'emas') {
        hg.addColorStop(0, '#fef08a');
        hg.addColorStop(0.5, '#f59e0b');
        hg.addColorStop(1, '#b45309');
      } else {
        hg.addColorStop(0, '#f3f4f6');
        hg.addColorStop(0.5, '#9ca3af');
        hg.addColorStop(1, '#4b5563');
      }
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(0, top + 5, n.r * 0.66, n.r * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(-n.r * 0.2, top + 2, n.r * 0.26, n.r * 0.11, -0.25, 0, TAU);
      ctx.fill();
      // timer tenggelam: cincin menyusut
      const frac = clamp(1 - n.age / n.upTime, 0, 1);
      ctx.strokeStyle = frac > 0.4 ? 'rgba(125,211,252,0.8)' : 'rgba(248,113,113,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 2, n.r * 1.15, n.r * 0.5, 0, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
      ctx.restore();
    };

    const drawRing = (ctx: CanvasRenderingContext2D, r: Ring): void => {
      const k = r.age / 0.4;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.gold ? '#fde047' : '#e0f2fe';
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, 20 + k * 44, 10 + k * 22, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();

      drawBackground(ctx, W, H);
      for (const n of s.nails) drawNailHole(ctx, n);
      for (const n of s.nails) drawNail(ctx, n);
      for (const r of s.rings) drawRing(ctx, r);
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(2,6,23,0.45)');
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
    if (api) sfx.ensure();
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
    if (api) sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (api && api.sfx.muted !== next) api.sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(8,20,35,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const grade = gradeFor(hud.score);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0d2138', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(8,20,35,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 132 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#7dd3fc' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.95 }}>
            {'❤️'.repeat(Math.max(0, hud.lives))}{'🖤'.repeat(Math.max(0, MAX_LIVES - hud.lives))}
            <span style={{ marginLeft: 6 }}>📐 Lv.{hud.level}</span>
          </div>
          {hud.streak >= 2 && <div style={{ fontSize: 12, color: '#fdba74', fontWeight: 900 }}>🔨 Streak x{hud.streak}</div>}
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
          <div style={{ fontSize: 42 }}>🔩</div>
          <h2 style={h2}>KETOK PAKU</h2>
          <p style={p}>
            Paku-paku <b>menonjol</b> di atas gambar kerja — <b>ketuk</b> secepatnya
            sebelum tenggelam lagi! Tiap <b>8 ketokan = naik level</b> (makin ramai & cepat).
            ✨ <b>Paku emas</b> = bonus. Paku yang lolos = <b>−1 nyawa</b>!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Mengetok</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Paku-pakunya ikut ngopi. Gambar kerjanya dijaga.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{grade === 'S' ? '🏆' : '🔩'}</div>
          <h2 style={h2}>PAKU HABIS!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#7dd3fc' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Grade" value={grade} />
            <Stat label="Level" value={String(hud.level)} />
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Ketok Lagi</button>
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
  background: 'linear-gradient(180deg,#7dd3fc,#0284c7)', color: '#082f49', boxShadow: '0 8px 20px rgba(2,132,199,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#7dd3fc', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1e3a5f,#0d2138)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
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
