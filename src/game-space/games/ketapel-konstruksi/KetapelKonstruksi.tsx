/**
 * Ketapel Konstruksi — Angry-Birds-like 2D.
 * Tarik wrecking ball dari ketapel, hancurkan semua BERKAS REVISI.
 */
import React, { useState, useRef, useCallback } from 'react';
import { useGameCanvas, GameApi, clamp } from '../../engine2d';
import { bestKey, getJson, setJson } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  LEVELS, WORLD_W, WORLD_H, GROUND_Y, BALL_R, DRAG_MAX,
  predict, launchVel, createState, updateState,
  starFor, leftoverBonus, MAT_SCORE,
  type KState, type Mat,
} from './logic';

type Screen = 'tutorial' | 'levels' | 'play' | 'win' | 'lose';

interface Hud { score: number; balls: number; level: number; best: number; }

const SLUG = 'ketapel-konstruksi';
const STARS_KEY = bestKey(SLUG, 'stars'); // { [levelIndex]: 1|2|3 }
const SCORE_KEY = bestKey(SLUG, 'best');

const DEBRIS: Record<Mat, string[]> = {
  kayu: ['#b07a45', '#8a5a2e', '#d9a86c'],
  kaca: ['#bfe3f5', '#e8f7ff', '#7fb3d5'],
  bata: ['#c65b3a', '#96421f', '#e08a5f'],
  beton: ['#9aa0a8', '#6e747c', '#c3c9d1'],
  berkas: ['#ffffff', '#f1f5f9', '#fca5a5'],
};

const QUIP_WIN = [
  'Revisi lunas! Estimator bisa tidur nyenyak malam ini.',
  'Berkas revisi rata dengan tanah. Kayak revisi harga satuan.',
  'Klien: "coba revisi sekali lagi ya." Kamu: sudah tidak ada yang bisa direvisi.',
];
const QUIP_LOSE = [
  'Berkas revisi selamat… kayak deadline yang selalu lolos dari RAB.',
  'Bola habis, berkas masih utuh. Mirip nasib estimator akhir bulan.',
  'Ketapelnya lelah. Istirahat dulu, kayak mandor pas hujan.',
];

export default function KetapelKonstruksi({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [hud, setHud] = useState<Hud>({ score: 0, balls: 3, level: 1, best: 0 });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stars, setStars] = useState<Record<string, number>>(() => getJson(STARS_KEY, {}));
  const [quip, setQuip] = useState('');
  const [winStars, setWinStars] = useState(0);
  const apiRef = useRef<GameApi | null>(null);
  const sRef = useRef<KState | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const doneHandled = useRef(false);
  const lastHud = useRef('');

  const startLevel = useCallback((idx: number) => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    sRef.current = createState(idx);
    doneHandled.current = false;
    const s = sRef.current;
    api.loop.setPaused(false);
    setPaused(false);
    setScreen('play');
    api.loop.start();
    const h = JSON.stringify({ score: 0, balls: s.ballsLeft, level: idx + 1, best: 0 });
    lastHud.current = h;
    api.pushHud({ score: 0, balls: s.ballsLeft, level: idx + 1, best: 0 });
  }, []);

  const togglePause = useCallback(() => {
    const api = apiRef.current;
    if (!api || screen !== 'play') return;
    const p = !api.loop.isPaused;
    api.loop.setPaused(p);
    setPaused(p);
    api.sfx.click();
  }, [screen]);

  const toggleMute = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    setMuted(api.sfx.toggleMute());
  }, []);

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);

    /** Letterbox: dunia 900x700 selalu utuh, rata tengah. */
    const view = () => {
      const W = api.W; const H = api.H;
      const sc = Math.min(W / WORLD_W, H / WORLD_H);
      return { sc, ox: (W - WORLD_W * sc) / 2, oy: (H - WORLD_H * sc) / 2 };
    };
    const toWorld = (px: number, py: number) => {
      const v = view();
      return { x: (px - v.ox) / v.sc, y: (py - v.oy) / v.sc };
    };

    const pocket = (s: KState) => {
      if (s.drag) return s.drag;
      return { x: s.level.sling.x, y: s.level.sling.y };
    };

    api.setUpdate((dt) => {
      const s = sRef.current;
      if (!s) return;
      if (api.input.wasPressed('Escape')) {
        togglePauseRef.current();
      }
      if (api.loop.isPaused) return;

      const events = updateState(s, dt);
      for (const e of events) {
        if (e.type === 'launch') {
          api.sfx.whoosh();
          api.shake.add(0.12);
        } else if (e.type === 'ballHit') {
          api.sfx.thud(e.hard ? 1 : 0.55);
          if (e.hard) api.shake.add(0.22);
          api.particles.spawn(e.x, e.y, {
            count: e.hard ? 14 : 7, colors: DEBRIS[e.mat],
            speed: [90, 320], life: [0.35, 0.8], size: [2, 6],
            gravity: 900, shape: 'rect', rotation: true,
          });
        } else if (e.type === 'blockBreak') {
          api.sfx.crumble(e.mat === 'berkas' ? 0.7 : 1);
          api.shake.add(e.mat === 'berkas' ? 0.3 : 0.16);
          api.particles.spawn(e.x, e.y, {
            count: 22, colors: DEBRIS[e.mat],
            speed: [120, 420], life: [0.4, 1], size: [2, 8],
            gravity: 1100, shape: 'rect', rotation: true,
          });
          api.scores.add(e.x, e.y - 10, `+${MAT_SCORE[e.mat]}`, {
            color: e.mat === 'berkas' ? '#fde047' : '#ffffff', size: e.mat === 'berkas' ? 26 : 19,
          });
          if (e.mat === 'berkas' && wrapRef.current) {
            popText(wrapRef.current, 'BERKAS HANCUR!', { size: 26, color: '#fde047' });
          }
        } else if (e.type === 'blockLand') {
          if (e.hard) {
            api.sfx.thud(0.8);
            api.shake.add(0.14);
          }
          api.particles.spawn(e.x, e.y - 4, {
            count: e.hard ? 12 : 6, colors: ['#cbb59a', '#a98f6f', '#e5d6bd'],
            speed: [40, 160], angle: -Math.PI / 2, spread: 1.6,
            life: [0.3, 0.7], size: [2, 5], gravity: 300, shape: 'circle',
          });
        }
      }

      // HUD push saat berubah
      const key = `${s.score}|${s.ballsLeft}|${s.levelIndex}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        api.pushHud({ score: s.score, balls: s.ballsLeft, level: s.levelIndex + 1, best: 0 });
      }

      // done -> layar menang/kalah
      if (s.phase === 'done' && !doneHandled.current) {
        doneHandled.current = true;
        const used = s.level.balls - s.ballsLeft;
        if (s.won) {
          const st = starFor(Math.max(1, used), s.level.balls);
          const bonus = leftoverBonus(s.ballsLeft);
          s.score += bonus;
          setWinStars(st);
          setQuip(QUIP_WIN[(s.levelIndex + used) % QUIP_WIN.length]);
          setStars((prev) => {
            const next = { ...prev, [String(s.levelIndex)]: Math.max(prev[String(s.levelIndex)] ?? 0, st) };
            setJson(STARS_KEY, next);
            return next;
          });
          api.sfx.chime(3);
          if (wrapRef.current) popText(wrapRef.current, '🎉 REVISI LUNAS!', { size: 34, color: '#4ade80' });
          api.pushHud({ score: s.score, balls: s.ballsLeft, level: s.levelIndex + 1, best: 0 });
          window.setTimeout(() => setScreen('win'), 900);
        } else {
          setQuip(QUIP_LOSE[s.levelIndex % QUIP_LOSE.length]);
          api.sfx.fail();
          window.setTimeout(() => setScreen('lose'), 900);
        }
      }
    });

    api.setRender(() => {
      const s = sRef.current;
      const { ctx } = api;
      const v = view();
      ctx.save();
      ctx.translate(v.ox, v.oy);
      ctx.scale(v.sc, v.sc);
      drawWorld(ctx, api, s, pocket, v.ox / v.sc, v.oy / v.sc);
      ctx.restore();
    });

    // ---- input: drag ketapel ----
    api.input.onDown = (p) => {
      const s = sRef.current;
      if (!s || s.phase !== 'aim' || api.loop.isPaused) return;
      const w = toWorld(p.x, p.y);
      const dx = w.x - s.level.sling.x;
      const dy = w.y - s.level.sling.y;
      if (Math.hypot(dx, dy) < 90) {
        api.sfx.ensure();
        s.drag = { x: w.x, y: w.y };
      }
    };
    api.input.onMove = (p) => {
      const s = sRef.current;
      if (!s || !s.drag || s.phase !== 'aim') return;
      const w = toWorld(p.x, p.y);
      let dx = w.x - s.level.sling.x;
      let dy = w.y - s.level.sling.y;
      const d = Math.hypot(dx, dy);
      if (d > DRAG_MAX) { dx = (dx / d) * DRAG_MAX; dy = (dy / d) * DRAG_MAX; }
      s.drag = { x: s.level.sling.x + dx, y: s.level.sling.y + dy };
    };
    api.input.onUp = () => {
      const s = sRef.current;
      if (!s || !s.drag || s.phase !== 'aim') return;
      const dx = s.level.sling.x - s.drag.x;
      const dy = s.level.sling.y - s.drag.y;
      const dist = Math.hypot(dx, dy);
      s.drag = null;
      if (dist < 18) return; // tarikan terlalu kecil -> batal
      const v = launchVel(s.level.sling.x, s.level.sling.y, s.level.sling.x - dx, s.level.sling.y - dy);
      s.ball = {
        x: s.level.sling.x, y: s.level.sling.y,
        vx: v.vx, vy: v.vy,
        flying: true, dead: false, age: 0, flightId: Date.now() % 100000,
      };
      s.ballsLeft -= 1;
      s.phase = 'flying';
      api.sfx.whoosh();
      api.shake.add(0.12);
    };

    return () => { apiRef.current = null; };
  });

  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;

  return (
    <div ref={wrapRef} className="gs2d-wrap" style={{ position: 'relative' }}>
      <style>{`
        .kk-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(10,18,32,.72); backdrop-filter: blur(3px); z-index:10; padding:16px; }
        .kk-card { background:linear-gradient(160deg,#1e293b,#0f172a); border:1px solid rgba(148,163,184,.25);
          border-radius:20px; padding:22px 20px; max-width:340px; width:100%; text-align:center; color:#f1f5f9;
          box-shadow:0 18px 50px rgba(0,0,0,.5); }
        .kk-title { font-weight:900; font-size:24px; margin:0 0 6px; }
        .kk-sub { color:#94a3b8; font-size:13px; line-height:1.55; margin:0 0 14px; }
        .kk-btn { display:block; width:100%; border:0; border-radius:14px; padding:13px; margin-top:10px;
          font-weight:800; font-size:16px; cursor:pointer; color:#fff;
          background:linear-gradient(180deg,#3b82f6,#1d4ed8); box-shadow:0 6px 18px rgba(37,99,235,.4); }
        .kk-btn:active { transform:translateY(1px); }
        .kk-btn.ghost { background:rgba(148,163,184,.15); box-shadow:none; border:1px solid rgba(148,163,184,.3); }
        .kk-stars { font-size:34px; letter-spacing:6px; margin:4px 0 8px; }
        .kk-stars .on { color:#fbbf24; text-shadow:0 0 14px rgba(251,191,36,.7); animation:kkpop .5s cubic-bezier(.2,1.6,.4,1) backwards; }
        .kk-stars .off { color:#475569; }
        @keyframes kkpop { from { transform:scale(0) rotate(-40deg); } to { transform:scale(1) rotate(0); } }
        .kk-lvlgrid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin:12px 0 4px; }
        .kk-lvl { border:1px solid rgba(148,163,184,.3); background:rgba(148,163,184,.12); color:#f1f5f9;
          border-radius:12px; padding:10px 4px; font-weight:800; font-size:15px; cursor:pointer; }
        .kk-lvl small { display:block; font-size:10px; color:#fbbf24; margin-top:2px; min-height:12px; }
        .kk-lvl:active { transform:scale(.94); }
        .kk-quip { font-style:italic; color:#cbd5e1; font-size:13px; line-height:1.5; margin:8px 0 4px; }
        @media (prefers-reduced-motion: reduce) { .kk-stars .on { animation:none; } }
      `}</style>
      <canvas ref={canvasRef} className="gs2d-canvas" />

      {/* HUD atas */}
      {(screen === 'play') && (
        <div className="gs2d-hud" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="gs2d-iconbtn" onClick={onExit} aria-label="Keluar" style={iconBtn}>✕</button>
            <button className="gs2d-iconbtn" onClick={togglePause} aria-label="Pause" style={iconBtn}>{paused ? '▶' : '⏸'}</button>
            <button className="gs2d-iconbtn" onClick={toggleMute} aria-label="Suara" style={iconBtn}>{muted ? '🔇' : '🔊'}</button>
          </div>
          <div style={{ textAlign: 'center', color: '#fff', fontWeight: 800 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Level {hud.level} · {LEVELS[hud.level - 1]?.name}</div>
            <div style={{ fontSize: 20 }}>⭐ {hud.score}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, fontSize: 18 }} aria-label={`Sisa bola ${hud.balls}`}>
            {Array.from({ length: LEVELS[hud.level - 1]?.balls ?? 3 }).map((_, i) => (
              <span key={i} style={{ opacity: i < hud.balls ? 1 : 0.22, filter: i < hud.balls ? 'none' : 'grayscale(1)' }}>⚫</span>
            ))}
          </div>
        </div>
      )}

      {screen === 'tutorial' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">🎯 Ketapel Konstruksi</h2>
            <p className="kk-sub">
              Klien sudah revisi gambar <b>13 kali</b>. Berkas revisinya numpuk di site.
              <br /><br />
              👆 <b>Tarik bola besi</b> ke belakang, <b>lepas</b> untuk meluncurkan.
              Hancurkan <b>semua BERKAS REVISI</b> 📄 (kertas putih) untuk menang.
              <br />
              🪵 Kayu & 🪟 kaca rapuh · 🧱 bata 2x pukul · 🏗️ beton 3x pukul.
              <br /><br />
              <i>Tenang, ini cuma game. Jangan beneran lempar berkas ke klien.</i>
            </p>
            <button className="kk-btn" onClick={() => { apiRef.current?.sfx.ensure(); apiRef.current?.sfx.click(); setScreen('levels'); }}>
              Pilih Level →
            </button>
          </div>
        </div>
      )}

      {screen === 'levels' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">Pilih Level</h2>
            <p className="kk-sub">Makin hemat bola, makin banyak ⭐. Estimator yang baik tidak buang-buang resource.</p>
            <div className="kk-lvlgrid">
              {LEVELS.map((l, i) => (
                <button key={i} className="kk-lvl" onClick={() => startLevel(i)}>
                  {i + 1}
                  <small>{'★'.repeat(stars[String(i)] ?? 0)}</small>
                </button>
              ))}
            </div>
            <button className="kk-btn ghost" onClick={onExit}>← Kembali</button>
          </div>
        </div>
      )}

      {screen === 'play' && paused && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">⏸ Jeda</h2>
            <p className="kk-sub">Istirahat dulu. Kayak mandor pas hujan — wajar.</p>
            <button className="kk-btn" onClick={togglePause}>Lanjutkan ▶</button>
            <button className="kk-btn ghost" onClick={() => startLevel(sRef.current?.levelIndex ?? 0)}>↻ Ulangi Level</button>
            <button className="kk-btn ghost" onClick={() => { apiRef.current?.loop.setPaused(false); setPaused(false); setScreen('levels'); }}>Pilih Level</button>
          </div>
        </div>
      )}

      {screen === 'win' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <div className="kk-stars">
              {[1, 2, 3].map((i) => (
                <span key={i} className={i <= winStars ? 'on' : 'off'} style={{ animationDelay: `${i * 0.15}s` }}>★</span>
              ))}
            </div>
            <h2 className="kk-title">🎉 Level {hud.level} Lunas!</h2>
            <p className="kk-sub">Skor: <b>{hud.score}</b></p>
            <p className="kk-quip">"{quip}"</p>
            {hud.level < 10
              ? <button className="kk-btn" onClick={() => startLevel(hud.level)}>Level Berikutnya →</button>
              : <button className="kk-btn" onClick={() => startLevel(0)}>↻ Main Lagi dari Level 1</button>}
            <button className="kk-btn ghost" onClick={() => startLevel(hud.level - 1)}>↻ Ulangi Level Ini</button>
            <button className="kk-btn ghost" onClick={() => setScreen('levels')}>Pilih Level</button>
          </div>
        </div>
      )}

      {screen === 'lose' && (
        <div className="kk-overlay">
          <div className="kk-card">
            <h2 className="kk-title">💸 Berkas Selamat…</h2>
            <p className="kk-sub">Skor: <b>{hud.score}</b></p>
            <p className="kk-quip">"{quip}"</p>
            <button className="kk-btn" onClick={() => startLevel(sRef.current?.levelIndex ?? 0)}>🔨 Coba Lagi</button>
            <button className="kk-btn ghost" onClick={() => setScreen('levels')}>Pilih Level</button>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,.25)',
  background: 'rgba(15,23,42,.55)', color: '#fff', fontSize: 17, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
};

/* ============================== RENDER ============================== */

function drawWorld(
  ctx: CanvasRenderingContext2D, api: GameApi,
  s: KState | null,
  pocket: (s: KState) => { x: number; y: number },
  extX: number,
  extY: number,
): void {
  drawSky(ctx, api, extX, extY);
  drawGround(ctx, extX, extY);
  if (s) {
    drawSlingshot(ctx, s, pocket(s));
    for (const b of s.blocks) if (!b.dead) drawBlock(ctx, b);
    if (s.ball) drawBall(ctx, s.ball.x, s.ball.y);
    if (s.phase === 'aim') drawTrajectory(ctx, s, pocket(s));
  }
}

function drawSky(ctx: CanvasRenderingContext2D, api: GameApi, extX: number, extY: number): void {
  const t = (api.loop as unknown as { t?: number }).t ?? performance.now() / 1000;
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, '#2f7fc4');
  g.addColorStop(0.55, '#8ec9ef');
  g.addColorStop(0.82, '#f6e3bd');
  g.addColorStop(1, '#f2cf9a');
  ctx.fillStyle = g;
  ctx.fillRect(-extX - 60, -extY - 60, WORLD_W + 2 * (extX + 60), WORLD_H + 2 * (extY + 60));

  // matahari + glow
  const sx = 740; const sy = 130;
  const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 120);
  glow.addColorStop(0, 'rgba(255,244,200,.95)');
  glow.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 130, sy - 130, 260, 260);
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.fill();

  // awan 2 lapis parallax
  drawClouds(ctx, t * 6, 0.35, 0.5, ['rgba(255,255,255,.75)']);
  drawClouds(ctx, t * 14 + 300, 0.75, 0.75, ['rgba(255,255,255,.9)']);

  // siluet gedung jauh
  ctx.fillStyle = 'rgba(70,110,150,.35)';
  const bld = [40, 120, 210, 330, 470, 560, 700, 800];
  bld.forEach((x, i) => {
    const h = 90 + ((i * 53) % 70);
    ctx.fillRect(x, GROUND_Y - h, 64, h);
  });
  // crane silhouette
  ctx.strokeStyle = 'rgba(50,80,115,.5)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(880, GROUND_Y); ctx.lineTo(880, GROUND_Y - 230);
  ctx.moveTo(800, GROUND_Y - 215); ctx.lineTo(940, GROUND_Y - 215);
  ctx.moveTo(930, GROUND_Y - 215); ctx.lineTo(930, GROUND_Y - 160);
  ctx.stroke();
  ctx.fillStyle = 'rgba(50,80,115,.5)';
  ctx.fillRect(922, GROUND_Y - 150, 16, 22);
}

function drawClouds(ctx: CanvasRenderingContext2D, off: number, yFrac: number, scale: number, colors: string[]): void {
  ctx.fillStyle = colors[0];
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 260 + off) % (WORLD_W + 320)) - 160;
    const y = 60 + yFrac * 130 + (i % 3) * 26;
    cloud(ctx, x, y, scale);
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 28 * s, y - 10 * s, 32 * s, 0, Math.PI * 2);
  ctx.arc(x + 58 * s, y, 24 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y + 12 * s, 26 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround(ctx: CanvasRenderingContext2D, extX: number, extY: number): void {
  // tanah (diperpanjang ke bawah untuk letterbox)
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_H);
  g.addColorStop(0, '#8a5f3d');
  g.addColorStop(1, '#5e3f26');
  ctx.fillStyle = g;
  ctx.fillRect(-70, GROUND_Y, WORLD_W + 140, WORLD_H - GROUND_Y + extY + 70);
  // strip rumput
  const gr = ctx.createLinearGradient(0, GROUND_Y - 14, 0, GROUND_Y + 6);
  gr.addColorStop(0, '#86c95a');
  gr.addColorStop(1, '#5da23e');
  ctx.fillStyle = gr;
  ctx.fillRect(-extX - 60, GROUND_Y - 14, WORLD_W + 2 * (extX + 60), 20);
  ctx.fillStyle = 'rgba(30,60,20,.35)';
  ctx.fillRect(-extX - 60, GROUND_Y - 14, WORLD_W + 2 * (extX + 60), 3);
  // kerikil
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 97 + 13) % WORLD_W;
    const y = GROUND_Y + 18 + ((i * 41) % 52);
    ctx.beginPath(); ctx.ellipse(x, y, 3 + (i % 3), 2 + (i % 2), 0, 0, Math.PI * 2); ctx.fill();
  }
  // vignette halus
  const v = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 260, WORLD_W / 2, WORLD_H / 2, 620);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,20,40,.22)');
  ctx.fillStyle = v;
  ctx.fillRect(-extX - 60, -extY - 60, WORLD_W + 2 * (extX + 60), WORLD_H + 2 * (extY + 60));
}

function drawSlingshot(ctx: CanvasRenderingContext2D, s: KState, pk: { x: number; y: number }): void {
  const bx = s.level.sling.x;
  const baseY = GROUND_Y;
  // bayangan
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(bx, baseY + 8, 46, 10, 0, 0, Math.PI * 2); ctx.fill();

  const branch = (x1: number, y1: number, x2: number, y2: number, w: number) => {
    ctx.strokeStyle = '#5a3a1e';
    ctx.lineWidth = w + 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#8a5a2e';
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // serat kayu
    ctx.strokeStyle = 'rgba(60,35,12,.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1 + 2, y1); ctx.lineTo(x2 + 2, y2); ctx.stroke();
  };
  // batang + dua cabang Y
  branch(bx, baseY, bx, 510, 22);
  branch(bx, 520, bx - 30, 462, 15);
  branch(bx, 520, bx + 30, 462, 15);

  const tipL = { x: bx - 30, y: 462 };
  const tipR = { x: bx + 30, y: 462 };

  // karet (belakang bola)
  ctx.strokeStyle = '#3f2a18';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tipL.x, tipL.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tipR.x, tipR.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();

  // bola di pocket (saat aim) atau karet kendur
  if (s.phase === 'aim') {
    drawBall(ctx, pk.x, pk.y);
    // karet depan
    ctx.strokeStyle = 'rgba(63,42,24,.85)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tipL.x, tipL.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tipR.x, tipR.y); ctx.lineTo(pk.x, pk.y); ctx.stroke();
  }
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // bayangan saat terbang rendah
  if (y < GROUND_Y - 10) {
    const hgt = clamp(1 - (GROUND_Y - y) / 500, 0.15, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.28 * hgt})`;
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y + 6, BALL_R * (1.6 - hgt * 0.6), 7 * hgt + 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // gerigi
  ctx.fillStyle = '#2b3038';
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const x1 = x + Math.cos(a - 0.14) * BALL_R;
    const y1 = y + Math.sin(a - 0.14) * BALL_R;
    const x2 = x + Math.cos(a + 0.14) * BALL_R;
    const y2 = y + Math.sin(a + 0.14) * BALL_R;
    const x3 = x + Math.cos(a) * (BALL_R + 9);
    const y3 = y + Math.sin(a) * (BALL_R + 9);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x3, y3); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill();
  }
  // badan besi
  const g = ctx.createRadialGradient(x - 7, y - 8, 4, x, y, BALL_R);
  g.addColorStop(0, '#8b93a1');
  g.addColorStop(0.6, '#4a505c');
  g.addColorStop(1, '#23272e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#14171c';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.ellipse(x - 7, y - 9, 7, 4.5, -0.6, 0, Math.PI * 2); ctx.fill();
}

function drawTrajectory(ctx: CanvasRenderingContext2D, s: KState, pk: { x: number; y: number }): void {
  const dx = s.level.sling.x - pk.x;
  const dy = s.level.sling.y - pk.y;
  if (Math.hypot(dx, dy) < 18) return;
  const v = launchVel(s.level.sling.x, s.level.sling.y, pk.x, pk.y);
  const pts = predict(s.level.sling.x, s.level.sling.y, v.vx, v.vy);
  ctx.fillStyle = '#fff';
  const n = Math.min(pts.length, 16);
  for (let i = 0; i < n; i += 2) {
    const p = pts[i];
    ctx.globalAlpha = 0.85 - (i / n) * 0.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5 - (i / n) * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBlock(ctx: CanvasRenderingContext2D, b: { mat: Mat; x: number; y: number; w: number; h: number; angle: number }): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // drop shadow
  ctx.save();
  ctx.translate(3, 5);
  ctx.rotate(b.angle);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 3);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(b.angle);
  const w = b.w; const h = b.h;
  const x0 = -w / 2; const y0 = -h / 2;

  if (b.mat === 'kayu') {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#c08a4e'); g.addColorStop(1, '#8a5a2e');
    ctx.fillStyle = g;
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,15,.55)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i += 1) {
      const yy = y0 + (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(x0 + 3, yy); ctx.lineTo(x0 + w - 3, yy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,235,200,.25)';
    ctx.fillRect(x0 + 2, y0 + 2, w - 4, 5);
  } else if (b.mat === 'kaca') {
    ctx.fillStyle = 'rgba(200,232,248,.92)';
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y0 + h - 4); ctx.lineTo(x0 + w * 0.45, y0 + 4);
    ctx.lineTo(x0 + w * 0.62, y0 + 4); ctx.lineTo(x0 + 4, y0 + h - 4 + (w * 0.17));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,200,.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 + w / 2, y0 + 4); ctx.lineTo(x0 + w / 2, y0 + h - 4); ctx.stroke();
  } else if (b.mat === 'bata') {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#d4693f'); g.addColorStop(1, '#a34a26');
    ctx.fillStyle = g;
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(240,220,200,.7)'; ctx.lineWidth = 2;
    const rows = Math.max(2, Math.round(h / 26));
    for (let i = 1; i < rows; i += 1) {
      const yy = y0 + (h / rows) * i;
      ctx.beginPath(); ctx.moveTo(x0 + 2, yy); ctx.lineTo(x0 + w - 2, yy); ctx.stroke();
      const off = (i % 2) * (w / 4);
      ctx.beginPath(); ctx.moveTo(x0 + w / 2 + (off ? -w / 4 : 0), yy - h / rows);
      ctx.lineTo(x0 + w / 2 + (off ? -w / 4 : 0), yy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,180,.22)';
    ctx.fillRect(x0 + 2, y0 + 2, w - 4, 5);
  } else if (b.mat === 'beton') {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#aeb4bc'); g.addColorStop(1, '#7d838c');
    ctx.fillStyle = g;
    roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
    ctx.fillStyle = 'rgba(60,64,70,.35)';
    const n = Math.floor((w * h) / 260);
    for (let i = 0; i < n; i += 1) {
      const px = x0 + 4 + ((i * 37) % (w - 8));
      const py = y0 + 4 + ((i * 53) % (h - 8));
      ctx.fillRect(px, py, 2.4, 2.4);
    }
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(x0 + 2, y0 + 2, w - 4, 5);
  } else {
    // berkas revisi: kertas putih
    ctx.fillStyle = '#fdfdf8';
    roundRect(ctx, x0, y0, w, h, 2); ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x0 + 4, y0 + 4, w - 8, 10);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.min(9, w / 5)}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('REV-13', 0, y0 + 9);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i += 1) {
      const yy = y0 + 22 + i * 8;
      if (yy > y0 + h - 6) break;
      ctx.beginPath(); ctx.moveTo(x0 + 6, yy); ctx.lineTo(x0 + w - 6, yy); ctx.stroke();
    }
    // lipatan sudut
    ctx.fillStyle = 'rgba(148,163,184,.6)';
    ctx.beginPath(); ctx.moveTo(x0 + w, y0); ctx.lineTo(x0 + w - 9, y0); ctx.lineTo(x0 + w, y0 + 9); ctx.closePath(); ctx.fill();
  }

  ctx.strokeStyle = b.mat === 'berkas' ? '#94a3b8' : 'rgba(20,25,35,.65)';
  ctx.lineWidth = 2;
  roundRect(ctx, x0, y0, w, h, 3); ctx.stroke();
  ctx.restore();
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
