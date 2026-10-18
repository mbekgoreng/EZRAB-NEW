/**
 * Bongkar Rumah — tap untuk menghancurkan bangunan blok per blok.
 * Fisika runtuh murni di logic.ts; file ini hanya render + juice + UI.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  createLevel, destroyBlock, createCombo, activeMultiplier, stepCollapse,
  progress, isWon, blockAt, LEVELS,
  MAT_PARTICLE_COLORS,
  type Block, type Combo, type Material,
} from './logic';

const SLUG = 'bongkar-rumah';
const LW = 390; // lebar logis; skala mengikuti canvas
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;

interface Hud {
  score: number;
  best: number;
  pct: number;
  mult: number;
  levelName: string;
}

type Screen = 'tutorial' | 'play' | 'pause' | 'win';

interface GState {
  levelIdx: number;
  blocks: Block[];
  total: number;
  combo: Combo;
  score: number;
  scoreAtLevelStart: number;
  won: boolean;
  groundY: number;
  t: number;
  clouds: { x: number; y: number; s: number; v: number }[];
}

/* ================= texture helpers ================= */

function hash01(id: number, salt: number): number {
  let h = (id * 2654435761 + salt * 40503) >>> 0;
  h ^= h >> 13;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function drawBlock(ctx: CanvasRenderingContext2D, b: Block): void {
  const rubble = b.state === 'rubble';
  const hh = rubble ? b.h * 0.45 : b.h;
  const yy = rubble ? b.y + b.h - hh : b.y;
  const { x, w, mat } = b;

  // bayangan
  ctx.fillStyle = 'rgba(15,23,42,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, yy + hh + 3, w * 0.46, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const outline: Record<Material, string> = {
    bata: '#7a2f12', kayu: '#5d3a1a', kaca: '#2c6e9e', beton: '#5f666d',
  };

  if (mat === 'bata') {
    ctx.fillStyle = '#d95f2b';
    ctx.fillRect(x, yy, w, hh);
    // garis mortar
    ctx.strokeStyle = '#a03f16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yy + hh / 2);
    ctx.lineTo(x + w, yy + hh / 2);
    ctx.moveTo(x + w / 2, yy);
    ctx.lineTo(x + w / 2, yy + hh / 2);
    ctx.moveTo(x + w / 4, yy + hh / 2);
    ctx.lineTo(x + w / 4, yy + hh);
    ctx.moveTo(x + (w * 3) / 4, yy + hh / 2);
    ctx.lineTo(x + (w * 3) / 4, yy + hh);
    ctx.stroke();
    // highlight atas
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x, yy, w, 4);
  } else if (mat === 'kayu') {
    ctx.fillStyle = '#9c6633';
    ctx.fillRect(x, yy, w, hh);
    ctx.strokeStyle = '#6f4420';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i += 1) {
      const gy = yy + hh * (0.25 + i * 0.25) + (hash01(b.id, i) - 0.5) * 4;
      ctx.beginPath();
      ctx.moveTo(x + 2, gy);
      ctx.quadraticCurveTo(x + w / 2, gy + 3, x + w - 2, gy - 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,235,200,0.25)';
    ctx.fillRect(x, yy, w, 4);
  } else if (mat === 'kaca') {
    const g = ctx.createLinearGradient(x, yy, x + w, yy + hh);
    g.addColorStop(0, '#d8efff');
    g.addColorStop(0.5, '#a5d6f5');
    g.addColorStop(1, '#7cbde9');
    ctx.fillStyle = g;
    ctx.fillRect(x, yy, w, hh);
    // kilau diagonal
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, yy);
    ctx.lineTo(x + w * 0.38, yy);
    ctx.lineTo(x + w * 0.2, yy + hh);
    ctx.lineTo(x, yy + hh);
    ctx.closePath();
    ctx.fill();
    // frame
    ctx.strokeStyle = '#2c6e9e';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, yy + 1.5, w - 3, hh - 3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, yy);
    ctx.lineTo(x + w / 2, yy + hh);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#98a1ab';
    ctx.fillRect(x, yy, w, hh);
    // speckle
    for (let i = 0; i < 9; i += 1) {
      const sx = x + 3 + hash01(b.id, i * 2) * (w - 6);
      const sy = yy + 3 + hash01(b.id, i * 2 + 1) * (hh - 6);
      ctx.fillStyle = hash01(b.id, i * 3) > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(40,48,56,0.25)';
      ctx.fillRect(sx, sy, 2.2, 2.2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, yy, w, 4);
  }

  // retak bila rubble
  if (rubble) {
    ctx.strokeStyle = 'rgba(30,25,20,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, yy + 2);
    ctx.lineTo(x + w * 0.45, yy + hh * 0.5);
    ctx.lineTo(x + w * 0.35, yy + hh - 2);
    ctx.moveTo(x + w * 0.7, yy + 3);
    ctx.lineTo(x + w * 0.6, yy + hh - 3);
    ctx.stroke();
  }

  // outline
  ctx.strokeStyle = outline[mat];
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, yy + 1, w - 2, hh - 2);
}

function drawCrane(ctx: CanvasRenderingContext2D, cx: number, groundY: number): void {
  // crane dekorasi di kiri bangunan: tiang terlihat, lengan di atas tower
  const bx = cx - 185;
  const top = groundY - 360;
  ctx.strokeStyle = '#4a5a6a';
  ctx.fillStyle = '#5b6d7f';
  ctx.lineWidth = 7;
  // tiang
  ctx.beginPath();
  ctx.moveTo(bx, groundY);
  ctx.lineTo(bx, top);
  ctx.stroke();
  // lattice tiang
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3a4754';
  for (let y = groundY - 12; y > top + 10; y -= 24) {
    ctx.beginPath();
    ctx.moveTo(bx - 9, y);
    ctx.lineTo(bx + 9, y - 18);
    ctx.moveTo(bx + 9, y);
    ctx.lineTo(bx - 9, y - 18);
    ctx.stroke();
  }
  // lengan
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#4a5a6a';
  ctx.beginPath();
  ctx.moveTo(bx - 70, top);
  ctx.lineTo(bx + 130, top);
  ctx.stroke();
  // kabel + hook
  const sway = Math.sin(Date.now() / 900) * 6;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#2e3a46';
  ctx.beginPath();
  ctx.moveTo(bx + 100 + sway * 0.3, top);
  ctx.lineTo(bx + 100 + sway, top + 74);
  ctx.stroke();
  ctx.fillStyle = '#f5b301';
  ctx.fillRect(bx + 100 + sway - 7, top + 74, 14, 16);
  ctx.strokeStyle = '#8a6300';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 100 + sway - 7, top + 74, 14, 16);
  // kabin
  ctx.fillStyle = '#e8eef4';
  ctx.fillRect(bx - 16, top - 4, 32, 26);
  ctx.strokeStyle = '#3a4754';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx - 16, top - 4, 32, 26);
  ctx.fillStyle = '#9fd4f5';
  ctx.fillRect(bx - 12, top, 24, 12);
}

/* ================= component ================= */

export default function BongkarRumah({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const stRef = useRef<GState | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({
    score: 0, best: getBest(bestKey(SLUG, 'score')), pct: 0, mult: 0, levelName: LEVELS[0].name,
  });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHudFor = (st: GState): void => {
    apiRef.current?.pushHud({
      score: st.score,
      best: getBest(bestKey(SLUG, 'score')),
      pct: Math.round(progress(st.blocks) * 100),
      mult: activeMultiplier(st.combo, st.t),
      levelName: LEVELS[st.levelIdx].name,
    } as Hud);
  };

  const loadLevel = (idx: number, keepScore: boolean): void => {
    const api = apiRef.current;
    if (!api) return;
    const sx = api.W / LW;
    const logicalH = api.H / sx;
    const groundY = logicalH - 64;
    const lv = createLevel(idx, groundY, LW / 2);
    const prev = stRef.current;
    stRef.current = {
      levelIdx: idx,
      blocks: lv.blocks,
      total: lv.total,
      combo: createCombo(),
      score: keepScore && prev ? prev.score : 0,
      scoreAtLevelStart: keepScore && prev ? prev.score : 0,
      won: false,
      groundY,
      t: prev?.t ?? 0,
      clouds: prev?.clouds ?? makeClouds(),
    };
    pushHudFor(stRef.current);
    if (wrapRef.current) {
      popText(wrapRef.current, `LEVEL ${idx + 1}: ${LEVELS[idx].name}`, { size: 24 });
    }
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);

    const sx = api.W / LW;
    const logicalH = api.H / sx;
    const groundY = logicalH - 64;
    const lv = createLevel(0, groundY, LW / 2);
    stRef.current = {
      levelIdx: 0, blocks: lv.blocks, total: lv.total,
      combo: createCombo(), score: 0, scoreAtLevelStart: 0,
      won: false, groundY, t: 0, clouds: makeClouds(),
    };
    pushHudFor(stRef.current);

    api.onResize((w, h) => {
      const st = stRef.current;
      if (!st) return;
      const nsx = w / LW;
      const ngy = h / nsx - 64;
      const dy = ngy - st.groundY;
      st.groundY = ngy;
      for (const b of st.blocks) b.y += dy;
    });

    api.setUpdate((dt) => {
      const st = stRef.current;
      if (!st) return;
      st.t += dt;
      // awan selalu bergerak (di balik overlay pun)
      for (const c of st.clouds) {
        c.x -= c.v * dt;
        if (c.x < -90) c.x = LW + 90;
      }
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') doPause();
        else if (screenRef.current === 'pause') doResume();
      }
      if (screenRef.current !== 'play' || st.won) return;

      const events = stepCollapse(st.blocks, dt, st.groundY);
      for (const e of events) {
        const b = e.block;
        api.particles.spawn(b.x + b.w / 2, b.y + b.h - 4, {
          count: 10, colors: ['#c9b8a3', '#a89478', '#e8dcc8'],
          speed: [40, 160], up: 60, gravity: 320, life: [0.4, 0.8], size: [2, 5],
        });
        api.sfx.thud(0.4);
      }
      // kombo kedaluwarsa -> refresh HUD
      const m = activeMultiplier(st.combo, st.t);
      if (m === 0 && hudRef.current.mult > 0) pushHudFor(st);

      if (isWon(st.blocks)) {
        st.won = true;
        const pct = Math.round(progress(st.blocks) * 100);
        setBest(bestKey(SLUG, `pct${st.levelIdx}`), pct);
        setBest(bestKey(SLUG, 'score'), st.score);
        api.sfx.chime(3);
        if (!api.reducedMotion) {
          for (let i = 0; i < 3; i += 1) {
            api.particles.spawn(60 + Math.random() * 270, 140 + Math.random() * 160, {
              count: 26, colors: ['#f5b301', '#ff7847', '#4ade80', '#60a5fa'],
              speed: [120, 340], gravity: 420, life: [0.7, 1.3], size: [3, 6], shape: 'rect', rotation: true,
            });
          }
        }
        if (wrapRef.current) popText(wrapRef.current, 'RATA DENGAN TANAH!', { size: 34, color: '#ffd166' });
        pushHudFor(st);
        window.setTimeout(() => setScreen('win'), 900);
      }
    });

    const handleTap = (px: number, py: number): void => {
      const st = stRef.current;
      if (!st || screenRef.current !== 'play' || st.won) return;
      const sx2 = api.W / LW;
      const lx = px / sx2;
      const ly = py / sx2;
      const b = blockAt(st.blocks, lx, ly);
      if (!b) return;
      const r = destroyBlock(st.blocks, b.id, st.combo, st.t);
      if (!r.ok) return;
      st.score += r.points;
      api.sfx.crumble(0.8);
      api.shake.add(0.25);
      api.particles.spawn(b.x + b.w / 2, b.y + b.h / 2, {
        count: 22, colors: MAT_PARTICLE_COLORS[b.mat],
        speed: [80, 300], up: 120, gravity: 520,
        life: [0.4, 0.9], size: [2.5, 6], shape: 'rect', rotation: true,
      });
      api.scores.add(b.x + b.w / 2, b.y, `+${r.points}`, {
        color: r.multiplier >= 2 ? '#ffd166' : '#ffffff',
        size: r.multiplier >= 2 ? 26 : 20,
      });
      if (r.multiplier >= 2 && wrapRef.current) {
        popText(wrapRef.current, `KOMBO x${r.multiplier}!`, { size: 26, color: '#ffd166' });
        api.sfx.pop(1 + r.multiplier * 0.12);
      }
      pushHudFor(st);
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      handleTap(p.x, p.y);
    };

    api.setRender(() => {
      const st = stRef.current;
      if (!st) return;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      ctx.save();
      ctx.scale(s, s);

      // langit
      const sky = ctx.createLinearGradient(0, 0, 0, lh);
      sky.addColorStop(0, '#7ec8f2');
      sky.addColorStop(0.55, '#bfe6fb');
      sky.addColorStop(1, '#fdeecb');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, LW, lh);

      // matahari
      ctx.fillStyle = 'rgba(255,236,170,0.9)';
      ctx.beginPath();
      ctx.arc(320, 84, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,236,170,0.25)';
      ctx.beginPath();
      ctx.arc(320, 84, 46, 0, Math.PI * 2);
      ctx.fill();

      // awan parallax
      for (const c of st.clouds) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 34 * c.s, 13 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x - 22 * c.s, c.y + 4 * c.s, 20 * c.s, 9 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 24 * c.s, c.y + 4 * c.s, 22 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // siluet gedung jauh
      ctx.fillStyle = 'rgba(120,150,180,0.45)';
      const sil = [0, 46, 92, 150, 210, 268, 330];
      for (let i = 0; i < sil.length; i += 1) {
        const bw = 44;
        const bh = 60 + ((i * 37) % 70);
        ctx.fillRect(sil[i], st.groundY - bh, bw, bh);
      }

      // crane dekorasi (L4)
      if (LEVELS[st.levelIdx].hasCrane) drawCrane(ctx, LW / 2, st.groundY);

      // tanah
      const gr = ctx.createLinearGradient(0, st.groundY, 0, lh);
      gr.addColorStop(0, '#8a6a48');
      gr.addColorStop(1, '#5d442e');
      ctx.fillStyle = gr;
      ctx.fillRect(0, st.groundY, LW, lh - st.groundY);
      ctx.fillStyle = '#5da24a';
      ctx.fillRect(0, st.groundY, LW, 9);
      ctx.fillStyle = '#4b8a3c';
      for (let gx = 6; gx < LW; gx += 18) {
        ctx.fillRect(gx, st.groundY + 2, 3, 7);
      }

      // blok (belakang -> depan)
      const order = [...st.blocks].sort((a, b) => a.y - b.y);
      for (const b of order) {
        if (b.state === 'gone') continue;
        drawBlock(ctx, b);
      }

      ctx.restore();
    });

    api.loop.start();
    return () => {
      apiRef.current = null;
    };
  });

  // mirror HUD untuk cek kombo di update loop
  const hudRef = useRef(hud);
  hudRef.current = hud;

  const doPause = (): void => {
    apiRef.current?.loop.setPaused(true);
    setScreen('pause');
  };
  const doResume = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };
  const startGame = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.sfx.click();
    setScreen('play');
  };

  const bestPct = getBest(bestKey(SLUG, `pct${stRef.current?.levelIdx ?? 0}`), 0);

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#7ec8f2', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* HUD atas */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          ⭐ {hud.score}
        </div>
        <div style={{ flex: 1, background: 'rgba(15,23,42,0.35)', borderRadius: 10, height: 14, overflow: 'hidden' }}>
          <div style={{ width: `${hud.pct}%`, height: '100%', background: 'linear-gradient(90deg,#f5b301,#ff7847)', borderRadius: 10, transition: 'width .25s' }} />
        </div>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13, minWidth: 52, textAlign: 'center' }}>
          {hud.pct}%
        </div>
        <button style={btn} onClick={doPause} aria-label="Jeda">⏸</button>
        <button style={btn} onClick={() => { apiRef.current?.sfx.ensure(); setMuted(apiRef.current?.sfx.toggleMute() ?? false); }} aria-label="Bisukan">
          {muted ? '🔇' : '🔊'}
        </button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {/* label level + kombo */}
      <div style={{ position: 'absolute', top: 62, left: 12, zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(15,23,42,0.45)', color: '#fff', borderRadius: 10, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
          🏚 {hud.levelName}
        </div>
        {hud.mult >= 2 && (
          <div style={{ marginTop: 6, background: '#ffd166', color: '#7a2f12', borderRadius: 10, padding: '4px 10px', fontSize: 13, fontWeight: 900, display: 'inline-block' }}>
            🔥 KOMBO x{hud.mult}
          </div>
        )}
      </div>

      {/* overlay tutorial */}
      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🔨</div>
          <h2 style={titleStyle}>BONGKAR RUMAH</h2>
          <p style={textStyle}>
            Kontraktor kabur bawa uang muka. Tersisa kamu, palu godam, dan dendam kesumat.
          </p>
          <p style={textStyle}>
            <b>Ketuk blok</b> untuk menghancurkan! Hancurkan beruntun &lt; 1,5 detik untuk <b>KOMBO sampai 5x</b>.
            Runtuhkan <b>≥ 98%</b> bangunan untuk menang. Blok yang kehilangan penyangga akan runtuh sendiri!
          </p>
          <button style={primaryBtn} onClick={startGame}>Mulai Menghancurkan</button>
        </Overlay>
      )}

      {/* overlay pause */}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>ISTIRAHAT DULU</h2>
          <p style={textStyle}>Mandor lagi ngopi. Palu godam aman di tanganmu.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={() => { const st = stRef.current; if (st) { loadLevel(st.levelIdx, false); } doResume(); }}>Ulangi Level</button>
          </div>
        </Overlay>
      )}

      {/* overlay menang */}
      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🏆</div>
          <h2 style={titleStyle}>RATA DENGAN TANAH!</h2>
          <p style={textStyle}>
            Estimator menangis melihat RAB-nya, tapi kamu puas. Bangunan <b>{LEVELS[stRef.current?.levelIdx ?? 0].name}</b> tinggal kenangan.
          </p>
          <p style={{ ...textStyle, fontSize: 15 }}>
            ⭐ Skor: <b>{hud.score}</b> &nbsp;•&nbsp; 🏅 Terbaik level: <b>{bestPct}%</b>
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(stRef.current?.levelIdx ?? 0) < LEVELS.length - 1 && (
              <button style={primaryBtn} onClick={() => { loadLevel((stRef.current?.levelIdx ?? 0) + 1, true); doResume(); }}>
                Level Berikutnya ▶
              </button>
            )}
            <button style={secondaryBtn} onClick={() => { const st = stRef.current; if (st) { loadLevel(st.levelIdx, false); } doResume(); }}>Ulangi</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function makeClouds(): { x: number; y: number; s: number; v: number }[] {
  const arr: { x: number; y: number; s: number; v: number }[] = [];
  for (let i = 0; i < 5; i += 1) {
    arr.push({
      x: 20 + i * 85 + (i % 2) * 30,
      y: 50 + ((i * 53) % 120),
      s: 0.7 + (i % 3) * 0.3,
      v: 8 + (i % 3) * 6,
    });
  }
  return arr;
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
