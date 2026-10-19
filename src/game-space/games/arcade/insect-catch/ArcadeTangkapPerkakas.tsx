/**
 * ArcadeTangkapPerkakas ("Tangkap Perkakas") — perkakas jatuh dari lantai atas
 * proyek. Ketuk sebelum menyentuh tanah! Ketukan beruntun = kombo.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  nextTool, fallSpeedAt, spawnDelayAt, tapPoints, gradeFor,
  GAME_DURATION, COMBO_STEP, TOOL_META, type ToolKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tangkap-perkakas', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Tool {
  id: number;
  kind: ToolKind;
  x: number; y: number;
  vy: number;
  rot: number; vr: number;
  r: number;
  sway: number;
}

interface S {
  tools: Tool[];
  spawnT: number;
  elapsed: number;
  score: number;
  combo: number;
  bestCombo: number;
  caught: number;
  missed: number;
  over: boolean;
  t: number;
  nextId: number;
}

const TOOL_COLORS: Record<ToolKind, string[]> = {
  palu: ['#d6a05c', '#8a5a28', '#9ca3af'],
  obeng: ['#ef4444', '#991b1b', '#d1d5db'],
  kunci: ['#9ca3af', '#4b5563', '#e5e7eb'],
  meteran: ['#fbbf24', '#b45309', '#fef9c3'],
  'bor-emas': ['#fde047', '#f59e0b', '#fff7d6'],
};

export default function ArcadeTangkapPerkakas({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, timeLeft: GAME_DURATION, combo: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      tools: [], spawnT: 0.4, elapsed: 0, score: 0, combo: 0,
      bestCombo: 0, caught: 0, missed: 0, over: false, t: 0, nextId: 1,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({
        score: s.score, timeLeft: Math.max(0, GAME_DURATION - s.elapsed),
        combo: s.combo, best: getBest(BK, 0),
      });
    };

    const reset = (): void => {
      s.tools = []; s.spawnT = 0.4; s.elapsed = 0; s.score = 0; s.combo = 0;
      s.bestCombo = 0; s.caught = 0; s.missed = 0; s.over = false;
      push();
    };

    const groundY = (): number => api.H * 0.88;

    const endGame = (): void => {
      if (s.over) return;
      s.over = true;
      const nb = setBest(BK, s.score);
      sfx.chime(3);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '⏱ SHIFT SELESAI!', { size: 30, color: '#fde047' });
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 60, colors: ['#fde047', '#fbbf24', '#fdba74', '#fff7d6'],
        speed: [100, 380], life: [0.6, 1.1], size: [2, 6], gravity: 420, shape: 'rect', rotation: true,
      });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, timeLeft: 0, combo: s.combo, best: nb });
        setScreen('over');
      }, 1300);
    };

    const spawnTool = (): void => {
      const kind = nextTool(rng);
      s.tools.push({
        id: s.nextId++,
        kind,
        x: 36 + rng() * (api.W - 72),
        y: -50,
        vy: fallSpeedAt(s.elapsed, rng),
        rot: (rng() - 0.5) * 0.8,
        vr: (rng() - 0.5) * 3,
        r: kind === 'bor-emas' ? 34 : 30,
        sway: rng() * TAU,
      });
    };

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      // cari perkakas terdekat yang kena ketuk
      let best: Tool | null = null;
      let bestD = 46;
      for (const t of s.tools) {
        const d = Math.hypot(p.x - t.x, p.y - t.y);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) {
        s.tools = s.tools.filter((t) => t !== best);
        s.combo += 1;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
        const pts = tapPoints(best.kind, s.combo);
        s.score += pts;
        s.caught += 1;
        sfx.pop(best.kind === 'bor-emas' ? 1.5 : 1);
        if (best.kind === 'bor-emas') sfx.chime(2, 880);
        api.particles.spawn(best.x, best.y, {
          count: best.kind === 'bor-emas' ? 28 : 14,
          colors: TOOL_COLORS[best.kind],
          speed: [80, 320], life: [0.3, 0.7], size: [2, 5], gravity: 500, shape: 'spark', rotation: true,
        });
        api.scores.add(best.x, best.y - 36, `+${pts}`, {
          color: best.kind === 'bor-emas' ? '#fde047' : '#ffffff',
          size: best.kind === 'bor-emas' ? 26 : 19,
        });
        const wrap = wrapRef.current;
        if (s.combo > 0 && s.combo % COMBO_STEP === 0 && wrap) {
          popText(wrap, `🔧 Kombo x${s.combo}!`, { size: 22, color: '#fdba74' });
          sfx.chime(2, 760);
        }
        if (best.kind === 'bor-emas' && wrap) popText(wrap, '✨ BOR EMAS!', { size: 22, color: '#fde047' });
      } else {
        // ketuk angin: kombo putus
        if (s.combo >= 3) {
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, 'Meleset!', { size: 15, color: '#94a3b8' });
        }
        s.combo = 0;
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
      s.elapsed += dt;
      if (s.elapsed >= GAME_DURATION) { endGame(); return; }

      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = spawnDelayAt(s.elapsed, rng);
        spawnTool();
      }
      const gy = groundY();
      for (const t of s.tools) {
        t.y += t.vy * dt;
        t.rot += t.vr * dt;
        t.sway += dt * 2;
        t.x += Math.sin(t.sway) * 18 * dt;
      }
      // perkakas menyentuh tanah = meleset
      const landed = s.tools.filter((t) => t.y >= gy);
      for (const t of landed) {
        s.missed += 1;
        if (s.combo >= 3) {
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `💥 ${TOOL_META[t.kind].name} jatuh!`, { size: 15, color: '#fca5a5' });
        }
        s.combo = 0;
        sfx.thud(0.7);
        api.particles.spawn(t.x, gy, {
          count: 10, colors: ['#a16207', '#78350f', '#d6a05c'],
          speed: [60, 220], life: [0.3, 0.6], size: [2, 4], gravity: 600, shape: 'circle',
        });
      }
      s.tools = s.tools.filter((t) => t.y < gy + 20);
      push();
    });

    /* ---------------- rendering ---------------- */

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      // langit proyek pagi hari
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#7dd3fc');
      g.addColorStop(0.55, '#bae6fd');
      g.addColorStop(0.8, '#fef3c7');
      g.addColorStop(1, '#fde68a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // awan
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i += 1) {
        const ax = ((i * 160 + s.t * 9) % (W + 200)) - 100;
        const ay = 40 + i * 34;
        ctx.beginPath();
        ctx.ellipse(ax, ay, 44, 16, 0, 0, TAU);
        ctx.ellipse(ax + 30, ay + 4, 30, 12, 0, 0, TAU);
        ctx.fill();
      }
      // lantai atas (tempat perkakas jatuh)
      const fy = H * 0.10;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, fy - 14, W, 14);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(0, fy - 14, W, 4);
      // papan "LANTAI 2" + perancah
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 6;
      for (const px of [W * 0.12, W * 0.5, W * 0.88]) {
        ctx.beginPath(); ctx.moveTo(px, fy - 14); ctx.lineTo(px, H * 0.88); ctx.stroke();
      }
      // label lantai digeser ke kanan agar tidak tertutup panel HUD kiri
      const lx = W * 0.66;
      ctx.fillStyle = 'rgba(28,25,23,0.55)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(lx - 108, fy - 40, 216, 24, 12);
      else ctx.rect(lx - 108, fy - 40, 216, 24);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.font = `900 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('🏗️ AWAS BARANG JATUH', lx, fy - 23);
      // gedung setengah jadi di kejauhan
      ctx.fillStyle = 'rgba(120,113,108,0.5)';
      ctx.fillRect(W * 0.05, H * 0.45, W * 0.2, H * 0.43);
      ctx.fillRect(W * 0.72, H * 0.52, W * 0.22, H * 0.36);
      ctx.fillStyle = 'rgba(68,64,60,0.5)';
      for (let wy = H * 0.48; wy < H * 0.84; wy += 34) {
        for (const wx of [W * 0.09, W * 0.15, W * 0.76, W * 0.84]) {
          ctx.fillRect(wx, wy, 16, 20);
        }
      }
      // tanah proyek
      const gy = H * 0.88;
      const dg = ctx.createLinearGradient(0, gy, 0, H);
      dg.addColorStop(0, '#b45309');
      dg.addColorStop(0.4, '#92400e');
      dg.addColorStop(1, '#451a03');
      ctx.fillStyle = dg;
      ctx.fillRect(0, gy, W, H - gy);
      // kerikil & garis bahaya
      ctx.fillStyle = 'rgba(60,30,5,0.5)';
      for (let i = 0; i < 26; i += 1) {
        const px = (i * 53 + 17) % W;
        const py = gy + 12 + ((i * 29) % (H - gy - 18));
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#fde047';
      for (let x = 0; x < W; x += 36) {
        ctx.save();
        ctx.translate(x + 18, gy + 4);
        ctx.rotate(x % 72 === 0 ? 0.5 : -0.5);
        ctx.fillRect(-9, -3, 18, 6);
        ctx.restore();
      }
    };

    const drawTool = (ctx: CanvasRenderingContext2D, t: Tool): void => {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);
      const gold = t.kind === 'bor-emas';
      if (gold) {
        ctx.shadowColor = 'rgba(253,224,71,0.9)';
        ctx.shadowBlur = 20;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 5;
      }
      const cols = TOOL_COLORS[t.kind];
      const metal = (x0: number, x1: number): CanvasGradient => {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, cols[2]);
        g.addColorStop(0.5, cols[0]);
        g.addColorStop(1, cols[1]);
        return g;
      };
      if (t.kind === 'palu') {
        // gagang
        const hg = ctx.createLinearGradient(-5, 0, 5, 0);
        hg.addColorStop(0, '#78350f'); hg.addColorStop(0.5, '#d97706'); hg.addColorStop(1, '#451a03');
        ctx.fillStyle = hg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-5, -8, 10, 46, 5);
        else ctx.rect(-5, -8, 10, 46);
        ctx.fill();
        // kepala palu
        ctx.fillStyle = metal(-24, 24);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-24, -30, 48, 24, 7);
        else ctx.rect(-24, -30, 48, 24);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-24, -30, 48, 7);
      } else if (t.kind === 'obeng') {
        // gagang merah
        const rg = ctx.createLinearGradient(-8, 0, 8, 0);
        rg.addColorStop(0, '#991b1b'); rg.addColorStop(0.5, '#ef4444'); rg.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = rg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-8, -6, 16, 34, 8);
        else ctx.rect(-8, -6, 16, 34);
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,29,29,0.7)'; ctx.lineWidth = 2;
        for (const yy of [2, 12, 22]) {
          ctx.beginPath(); ctx.moveTo(-8, yy); ctx.lineTo(8, yy); ctx.stroke();
        }
        // batang baja
        ctx.fillStyle = metal(-4, 4);
        ctx.fillRect(-4, -38, 8, 32);
        // ujung pipih
        ctx.beginPath();
        ctx.moveTo(-4, -38); ctx.lineTo(4, -38); ctx.lineTo(7, -46); ctx.lineTo(-7, -46);
        ctx.closePath(); ctx.fill();
      } else if (t.kind === 'kunci') {
        // kunci pas: ring + gagang
        ctx.strokeStyle = metal(-7, 7);
        ctx.lineWidth = 13;
        ctx.beginPath(); ctx.arc(0, -22, 13, 0.6, TAU - 0.6); ctx.stroke();
        ctx.lineWidth = 11;
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 34); ctx.stroke();
        ctx.fillStyle = cols[2];
        ctx.beginPath(); ctx.arc(0, -22, 4, 0, TAU); ctx.fill();
      } else if (t.kind === 'meteran') {
        // meteran: kotak kuning + pita
        const yg = ctx.createLinearGradient(-20, 0, 20, 0);
        yg.addColorStop(0, '#b45309'); yg.addColorStop(0.5, '#fbbf24'); yg.addColorStop(1, '#92400e');
        ctx.fillStyle = yg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-20, -16, 40, 32, 9);
        else ctx.rect(-20, -16, 40, 32);
        ctx.fill();
        ctx.fillStyle = '#fef9c3';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
        // pita keluar
        ctx.fillStyle = '#fefce8';
        ctx.fillRect(12, -4, 26, 8);
        ctx.strokeStyle = '#a16207'; ctx.lineWidth = 1;
        for (const xx of [18, 24, 30]) {
          ctx.beginPath(); ctx.moveTo(xx, -4); ctx.lineTo(xx, 4); ctx.stroke();
        }
      } else {
        // bor emas
        ctx.fillStyle = metal(-9, 9);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-9, -14, 34, 26, 8);
        else ctx.rect(-9, -14, 34, 26);
        ctx.fill();
        ctx.fillStyle = '#fff7d6';
        ctx.fillRect(-14, -8, 8, 6);
        // mata bor bergigi
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(25, -8);
        for (let i = 0; i < 4; i += 1) {
          ctx.lineTo(25 + 7, -8 + 4 + i * 4);
          ctx.lineTo(25, -8 + 8 + i * 4);
        }
        ctx.lineTo(25, 8);
        ctx.closePath(); ctx.fill();
        // kilau
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(-2, -8, 10, 3.5, -0.3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();

      drawBackground(ctx, W, H);
      for (const t of s.tools) drawTool(ctx, t);
      ctx.restore();
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(30,20,5,0.35)');
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
    background: 'rgba(30,20,5,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const grade = gradeFor(hud.score);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#7dd3fc', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(30,20,5,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 132 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fdba74' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(hud.timeLeft / GAME_DURATION) * 100}%`, background: 'linear-gradient(90deg,#fdba74,#f97316)', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            ⏱ {Math.ceil(hud.timeLeft)}s {hud.combo >= 2 && <span style={{ color: '#fde047', fontWeight: 900 }}>• 🔧x{hud.combo}</span>}
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
          <h2 style={h2}>TANGKAP PERKAKAS</h2>
          <p style={p}>
            Perkakas jatuh dari <b>lantai 2</b> — <b>ketuk</b> sebelum menyentuh tanah!
            Yang jatuh = kombo putus. ✨ <b>Bor emas</b> = bonus besar.
            Shift-mu <b>60 detik</b>!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Shift</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Tukangnya istirahat, perkakasnya melayang dulu.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{grade === 'S' ? '🏆' : '🧰'}</div>
          <h2 style={h2}>SHIFT SELESAI</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fdba74' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Grade" value={grade} />
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Shift Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fdba74', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#ffedd5' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fdba74,#f97316)', color: '#431407', boxShadow: '0 8px 20px rgba(249,115,22,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fdba74', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,20,5,0.55)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#7c4a1e,#2b1a08)', border: '1px solid rgba(253,186,116,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#ffedd5' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
