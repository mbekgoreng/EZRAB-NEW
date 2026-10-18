/**
 * Lari Proyek — endless runner 2D. Mandor auto-lari, lompat & nunduk
 * menghindari rintangan proyek. Tap/Space = lompat, swipe-bawah = nunduk.
 */
import React, { useState, useRef, useCallback } from 'react';
import { useGameCanvas, GameApi, clamp, lerp } from '../../engine2d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  WORLD_W, WORLD_H, GROUND_Y, PLAYER_X,
  createPlayer, stepPlayer, playerRect,
  speedFor, gapFor, spawnObstacle, stepObstacles,
  checkHits, checkBataLanding, skyPhase, scoreFor,
  mulberry32,
  type Player, type Obstacle,
} from './logic';

type Screen = 'tutorial' | 'play' | 'over';

interface Hud { score: number; best: number; helm: number; meters: number; }

const SLUG = 'lari-proyek';
const BEST_KEY = bestKey(SLUG, 'best');

const QUIP_OVER = [
  'Kesandung barier! Mandor lupa lihat depan — kayak lupa baca gambar.',
  'Jatuh ke lubang galian. Untung bukan lubang anggaran.',
  'Ketiban bata! Helm proyeknya dipakai siapa?',
  'Balok gantung 1, mandor 0. Safety briefing besok pagi jam 7.',
  'Kakinya keseleo. BPJS-nya… eh, jangan sampai kayak gitu beneran.',
];

interface RunState {
  player: Player;
  obstacles: Obstacle[];
  distance: number; // px
  speed: number;
  nextGap: number; // px sampai spawn berikut
  helmTimer: number;
  helmCount: number;
  rng: () => number;
  runPhase: number; // animasi kaki
  dustT: number;
  over: boolean;
  overReason: string;
}

function createRun(): RunState {
  return {
    player: createPlayer(),
    obstacles: [],
    distance: 0,
    speed: speedFor(0),
    nextGap: 500,
    helmTimer: 5,
    helmCount: 0,
    rng: mulberry32((Date.now() % 100000) | 0),
    runPhase: 0,
    dustT: 0,
    over: false,
    overReason: '',
  };
}

export default function LariProyek({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [hud, setHud] = useState<Hud>({ score: 0, best: getBest(BEST_KEY, 0), helm: 0, meters: 0 });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quip, setQuip] = useState('');
  const [newBest, setNewBest] = useState(false);
  const apiRef = useRef<GameApi | null>(null);
  const runRef = useRef<RunState | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const touchJump = useRef(false);
  const touchSlide = useRef(false);
  const downY = useRef(0);
  const lastScore = useRef(-1);

  const start = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    runRef.current = createRun();
    lastScore.current = -1;
    setNewBest(false);
    api.loop.setPaused(false);
    setPaused(false);
    setScreen('play');
    api.loop.start();
    setHud({ score: 0, best: getBest(BEST_KEY, 0), helm: 0, meters: 0 });
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

  const doJump = useCallback(() => {
    if (screen === 'play' && !apiRef.current?.loop.isPaused) touchJump.current = true;
  }, [screen]);
  const doSlide = useCallback(() => {
    if (screen === 'play' && !apiRef.current?.loop.isPaused) touchSlide.current = true;
  }, [screen]);

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);

    api.setUpdate((dt) => {
      const r = runRef.current;
      if (!r || api.loop.isPaused) return;
      if (api.input.wasPressed('Escape')) { togglePauseRef.current(); return; }
      if (r.over) return;

      // input keyboard edge
      const kbJump = api.input.wasPressed('Space') || api.input.wasPressed('ArrowUp') || api.input.wasPressed('KeyW');
      const kbSlide = api.input.wasPressed('ArrowDown') || api.input.wasPressed('KeyS');
      const jump = kbJump || touchJump.current;
      const slide = kbSlide || touchSlide.current;
      touchJump.current = false;
      touchSlide.current = false;

      const evs = stepPlayer(r.player, dt, jump, slide);
      for (const e of evs) {
        if (e === 'jump') {
          api.sfx.pop(1.25);
          api.particles.spawn(PLAYER_X, GROUND_Y, {
            count: 6, colors: ['#d9c9a8', '#b8a888'], speed: [40, 140],
            angle: Math.PI / 2, spread: 1.2, life: [0.25, 0.5], size: [2, 4], shape: 'circle',
          });
        } else if (e === 'land') {
          api.particles.spawn(PLAYER_X, GROUND_Y, {
            count: 8, colors: ['#d9c9a8', '#a89878'], speed: [60, 200],
            angle: -Math.PI / 2, spread: 2.4, life: [0.25, 0.5], size: [2, 5], shape: 'circle',
          });
        }
      }

      r.speed = speedFor(r.distance);
      r.distance += r.speed * dt;
      r.runPhase += dt * (6 + r.speed / 90);
      if (r.player.grounded && !r.player.sliding) {
        r.dustT -= dt;
        if (r.dustT <= 0) {
          r.dustT = 0.16;
          api.particles.spawn(PLAYER_X - 18, GROUND_Y - 4, {
            count: 2, colors: ['#cbb894'], speed: [30, 90], angle: Math.PI,
            spread: 0.8, life: [0.3, 0.6], size: [2, 4], shape: 'circle',
          });
        }
      }

      // spawn rintangan
      r.nextGap -= r.speed * dt;
      if (r.nextGap <= 0) {
        r.obstacles.push(spawnObstacle(r.rng, r.speed, WORLD_W + 60));
        r.nextGap = gapFor(r.speed, r.rng);
      }
      // helm bonus berkala
      r.helmTimer -= dt;
      if (r.helmTimer <= 0) {
        r.helmTimer = 6 + r.rng() * 5;
        r.obstacles.push({
          kind: 'helm', x: WORLD_W + 60, w: 36, h: 30,
          yOff: 70 + r.rng() * 90, dead: false,
        });
      }

      const landEvs = stepObstacles(r.obstacles, dt, r.speed, WORLD_W);
      for (const le of landEvs) {
        const o = le.obstacle;
        api.sfx.thud(0.9);
        api.shake.add(0.18);
        api.particles.spawn((o.lockX ?? o.x) + o.w / 2, GROUND_Y - 10, {
          count: 16, colors: ['#c65b3a', '#96421f', '#d9c9a8'], speed: [80, 300],
          life: [0.3, 0.7], size: [2, 6], gravity: 1000, shape: 'rect', rotation: true,
        });
        if (checkBataLanding(r.player, o)) {
          return gameOver(r, api, 'Ketiban bata! Helm proyeknya dipakai siapa?');
        }
      }

      const hit = checkHits(r.player, r.obstacles);
      if (hit) {
        if (hit.kind === 'helm') {
          r.helmCount += 1;
          api.sfx.pop(1.6);
          const hx = hit.obstacle.x + 18;
          const hy = GROUND_Y - hit.obstacle.yOff - 15;
          api.scores.add(hx, hy, '+50', { color: '#fde047', size: 22 });
          api.particles.spawn(hx, hy, {
            count: 10, colors: ['#fde047', '#fbbf24', '#fff'], speed: [60, 220],
            life: [0.3, 0.6], size: [2, 5], shape: 'spark',
          });
        } else {
          const reason = hit.obstacle.kind === 'lubang'
            ? 'Jatuh ke lubang galian. Untung bukan lubang anggaran.'
            : hit.obstacle.kind === 'balok'
              ? 'Balok gantung 1, mandor 0. Safety briefing besok pagi jam 7.'
              : 'Kesandung barier! Mandor lupa lihat depan — kayak lupa baca gambar.';
          return gameOver(r, api, reason);
        }
      }

      const meters = Math.floor(r.distance / 50);
      const score = scoreFor(meters, r.helmCount);
      if (score !== lastScore.current) {
        lastScore.current = score;
        api.pushHud({ score, best: getBest(BEST_KEY, 0), helm: r.helmCount, meters });
      }
    });

    function gameOver(r: RunState, api: GameApi, reason: string): void {
      r.over = true;
      r.player.dead = true;
      const meters = Math.floor(r.distance / 50);
      const score = scoreFor(meters, r.helmCount);
      const prev = getBest(BEST_KEY, 0);
      const nb = setBest(BEST_KEY, score);
      setNewBest(score > prev && prev > 0);
      api.sfx.fail();
      api.shake.add(0.5);
      api.particles.spawn(PLAYER_X, GROUND_Y - 50, {
        count: 26, colors: ['#f87171', '#fbbf24', '#94a3b8'], speed: [100, 380],
        life: [0.4, 0.9], size: [2, 7], gravity: 900, shape: 'rect', rotation: true,
      });
      if (wrapRef.current) popText(wrapRef.current, '💥 ADUH!', { size: 34, color: '#f87171' });
      setQuip(reason);
      api.pushHud({ score, best: nb, helm: r.helmCount, meters });
      window.setTimeout(() => setScreen('over'), 850);
    }

    api.setRender(() => {
      const r = runRef.current;
      const { ctx } = api;
      const W = api.W; const H = api.H;
      const sc = Math.min(W / WORLD_W, H / WORLD_H);
      const ox = (W - WORLD_W * sc) / 2;
      const oy = (H - WORLD_H * sc) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(sc, sc);
      drawScene(ctx, api, r, ox / sc, oy / sc);
      ctx.restore();
    });

    // input sentuh: putuskan di onUp (tap = lompat, swipe bawah = nunduk)
    api.input.onDown = (p) => { downY.current = p.y; };
    api.input.onUp = (p) => {
      const r = runRef.current;
      if (!r || r.over || api.loop.isPaused) return;
      api.sfx.ensure();
      if (p.y - downY.current > 44) touchSlide.current = true;
      else touchJump.current = true;
    };

    return () => { apiRef.current = null; };
  });

  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;

  return (
    <div ref={wrapRef} className="gs2d-wrap" style={{ position: 'relative' }}>
      <style>{`
        .lr-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(10,18,32,.72); backdrop-filter: blur(3px); z-index:10; padding:16px; }
        .lr-card { background:linear-gradient(160deg,#1e293b,#0f172a); border:1px solid rgba(148,163,184,.25);
          border-radius:20px; padding:22px 20px; max-width:340px; width:100%; text-align:center; color:#f1f5f9;
          box-shadow:0 18px 50px rgba(0,0,0,.5); }
        .lr-title { font-weight:900; font-size:24px; margin:0 0 6px; }
        .lr-sub { color:#94a3b8; font-size:13px; line-height:1.6; margin:0 0 14px; }
        .lr-btn { display:block; width:100%; border:0; border-radius:14px; padding:13px; margin-top:10px;
          font-weight:800; font-size:16px; cursor:pointer; color:#fff;
          background:linear-gradient(180deg,#f59e0b,#d97706); box-shadow:0 6px 18px rgba(245,158,11,.4); }
        .lr-btn:active { transform:translateY(1px); }
        .lr-btn.ghost { background:rgba(148,163,184,.15); box-shadow:none; border:1px solid rgba(148,163,184,.3); }
        .lr-quip { font-style:italic; color:#cbd5e1; font-size:13px; line-height:1.5; margin:8px 0 4px; }
        .lr-score { font-size:44px; font-weight:900; margin:2px 0; color:#fde047; text-shadow:0 2px 12px rgba(0,0,0,.4); }
        .lr-best { font-size:13px; color:#94a3b8; }
        .lr-best b { color:#fbbf24; }
        .lr-newbest { display:inline-block; margin-top:6px; font-size:12px; font-weight:800; color:#0f172a;
          background:#fde047; border-radius:999px; padding:4px 12px; animation:lrwig .6s ease-in-out infinite alternate; }
        @keyframes lrwig { from { transform:rotate(-3deg) scale(1);} to { transform:rotate(3deg) scale(1.06);} }
        .lr-ctl { display:flex; gap:10px; padding:10px 14px calc(10px + env(safe-area-inset-bottom)); }
        .lr-ctl button { flex:1; border:0; border-radius:16px; padding:16px; font-weight:900; font-size:17px;
          cursor:pointer; color:#fff; }
        .lr-ctl button:active { transform:scale(.96); }
        @media (prefers-reduced-motion: reduce) { .lr-newbest { animation:none; } }
      `}</style>
      <canvas ref={canvasRef} className="gs2d-canvas" />

      {screen === 'play' && (
        <div className="gs2d-hud" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
          <div style={{ color: '#fff', fontWeight: 800 }}>
            <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 1 }}>SKOR</div>
            <div style={{ fontSize: 22 }}>{hud.score}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ color: '#fde047', fontWeight: 800, fontSize: 14, marginRight: 4 }}>🪖 {hud.helm}</div>
            <button className="gs2d-iconbtn" onClick={togglePause} aria-label="Pause" style={iconBtn}>{paused ? '▶' : '⏸'}</button>
            <button className="gs2d-iconbtn" onClick={toggleMute} aria-label="Suara" style={iconBtn}>{muted ? '🔇' : '🔊'}</button>
            <button className="gs2d-iconbtn" onClick={onExit} aria-label="Keluar" style={iconBtn}>✕</button>
          </div>
        </div>
      )}

      {screen === 'play' && !paused && (
        <div className="lr-ctl">
          <button onClick={doSlide} style={{ background: 'linear-gradient(180deg,#38bdf8,#0284c7)' }} aria-label="Nunduk">⬇ NUNDUK</button>
          <button onClick={doJump} style={{ background: 'linear-gradient(180deg,#4ade80,#16a34a)' }} aria-label="Lompat">⤴ LOMPAT</button>
        </div>
      )}

      {screen === 'tutorial' && (
        <div className="lr-overlay">
          <div className="lr-card">
            <h2 className="lr-title">🏃 Lari Proyek</h2>
            <p className="lr-sub">
              Mandor auto-lari kejar deadline! Tugasmu cuma dua:
              <br /><br />
              ⤴ <b>TAP / SPASI</b> = lompat (barier, lubang, puing bata)
              <br />
              ⬇ <b>SWIPE BAWAH / TOMBOL NUNDU</b> = nunduk 0,6 dtk (balok gantung)
              <br /><br />
              🧱 <b>Awas bata jatuh!</b> Lihat bayangan <span style={{ color: '#f87171' }}>merah</span> di tanah —
              lompat tepat sebelum bata mendarat.
              <br />🪖 Kumpulin helm proyek = <b>+50</b>.
              <br /><br />
              <i>Makin jauh makin cepat. Kayak revisi klien: makin malam makin ngaco.</i>
            </p>
            <button className="lr-btn" onClick={start}>Mulai Lari! 🏃</button>
            <button className="lr-btn ghost" onClick={onExit}>← Kembali</button>
          </div>
        </div>
      )}

      {screen === 'play' && paused && (
        <div className="lr-overlay">
          <div className="lr-card">
            <h2 className="lr-title">⏸ Jeda</h2>
            <p className="lr-sub">Mandor istirahat. Deadline tetap jalan sih.</p>
            <button className="lr-btn" onClick={togglePause}>Lanjutkan ▶</button>
            <button className="lr-btn ghost" onClick={start}>↻ Ulangi</button>
          </div>
        </div>
      )}

      {screen === 'over' && (
        <div className="lr-overlay">
          <div className="lr-card">
            <h2 className="lr-title">💥 Aduh!</h2>
            <div className="lr-score">{hud.score}</div>
            <div className="lr-best">Skor = {hud.meters} m + 🪖 {hud.helm}×50 · Terbaik: <b>{hud.best}</b></div>
            {newBest && <div><span className="lr-newbest">🏆 REKOR BARU!</span></div>}
            <p className="lr-quip">"{quip || QUIP_OVER[Math.floor(Math.random() * QUIP_OVER.length)]}"</p>
            <button className="lr-btn" onClick={start}>🏃 Lari Lagi</button>
            <button className="lr-btn ghost" onClick={onExit}>← Kembali</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Diekspor untuk verifikasi visual terisolasi (debug harness di /tmp). */
export { drawScene, drawPlayer, drawObstacle, drawWarnZone, drawHelmet, drawBrick };
export type { RunState };

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,.25)',
  background: 'rgba(15,23,42,.55)', color: '#fff', fontSize: 17, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
};

/* ============================== RENDER ============================== */

type RGB = [number, number, number];
const SKY: { top: RGB; hor: RGB }[] = [
  { top: [61, 143, 209], hor: [207, 234, 251] },   // siang
  { top: [74, 63, 120], hor: [255, 158, 94] },     // senja
  { top: [11, 16, 38], hor: [36, 48, 79] },        // malam
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t)),
];
const css = (c: RGB, al = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${al})`;

function drawScene(ctx: CanvasRenderingContext2D, api: GameApi, r: RunState | null, extX: number, extY: number): void {
  const dist = r?.distance ?? 0;
  const meters = dist / 50;
  const ph = skyPhase(meters);
  const seg = Math.floor(ph) % 3;
  const t = ph - Math.floor(ph);
  const top = mix(SKY[seg].top, SKY[(seg + 1) % 3].top, t);
  const hor = mix(SKY[seg].hor, SKY[(seg + 1) % 3].hor, t);
  const nightF = seg === 2 ? Math.min(1, t * 3) : seg === 1 ? clamp((t - 0.7) / 0.3, 0, 1) : 0;

  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, css(top));
  g.addColorStop(1, css(hor));
  ctx.fillStyle = g;
  ctx.fillRect(-extX - 60, -extY - 60, WORLD_W + 2 * (extX + 60), WORLD_H + 2 * (extY + 60));

  // bintang (malam)
  if (nightF > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${0.85 * nightF})`;
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 173 + 31) % WORLD_W;
      const y = (i * 97 + 17) % 320;
      const tw = 0.5 + 0.5 * Math.sin(performance.now() / 500 + i);
      ctx.globalAlpha = nightF * tw;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // matahari / bulan
  const sunT = clamp(1 - nightF, 0, 1);
  if (sunT > 0.05) {
    const sx = 720; const sy = lerp(120, 300, seg === 1 ? t : 0);
    ctx.fillStyle = `rgba(255,${seg === 1 ? 170 : 230},120,${0.9 * sunT})`;
    ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,220,150,${0.25 * sunT})`;
    ctx.beginPath(); ctx.arc(sx, sy, 52, 0, Math.PI * 2); ctx.fill();
  }
  if (nightF > 0.3) {
    ctx.fillStyle = `rgba(240,244,255,${nightF})`;
    ctx.beginPath(); ctx.arc(180, 110, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css(top, nightF);
    ctx.beginPath(); ctx.arc(192, 102, 22, 0, Math.PI * 2); ctx.fill();
  }

  // awan parallax
  ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - nightF * 0.7)})`;
  for (let i = 0; i < 6; i += 1) {
    const x = ((i * 300 - dist * 0.08) % (WORLD_W + 240) + WORLD_W + 240) % (WORLD_W + 240) - 120;
    const y = 60 + (i % 3) * 44;
    cloud(ctx, x, y, 0.8 + (i % 2) * 0.4);
  }

  // gedung jauh & dekat parallax
  drawBuildings(ctx, dist * 0.18, GROUND_Y, `rgba(90,120,160,${0.5 * (1 - nightF) + 0.12})`, 130, 90);
  drawBuildings(ctx, dist * 0.42, GROUND_Y, `rgba(60,85,120,${0.65 * (1 - nightF) + 0.15})`, 190, 150);
  // crane
  const crx = WORLD_W - 90 - ((dist * 0.42) % 1100);
  drawCrane(ctx, crx, nightF);

  drawGround(ctx, dist, nightF, extX, extY);

  if (!r) return;
  // zona peringatan bata (di belakang rintangan)
  for (const o of r.obstacles) {
    if (o.dead) continue;
    if (o.kind === 'bata' && (o.phase === 'warn' || o.phase === 'fall')) {
      drawWarnZone(ctx, o);
    }
  }
  for (const o of r.obstacles) {
    if (o.dead) continue;
    drawObstacle(ctx, o, dist);
  }
  drawPlayer(ctx, r, nightF);
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 24 * s, 0, Math.PI * 2);
  ctx.arc(x + 26 * s, y - 9 * s, 30 * s, 0, Math.PI * 2);
  ctx.arc(x + 54 * s, y, 22 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuildings(
  ctx: CanvasRenderingContext2D, off: number, base: number,
  color: string, maxH: number, w: number,
): void {
  ctx.fillStyle = color;
  const span = WORLD_W + w * 2;
  const start = -((off % span) + span) % span - w;
  let i = 0;
  for (let x = start; x < WORLD_W + w; x += w + 30) {
    const h = 60 + ((i * 67 + Math.floor(off / span) * 31) % maxH);
    ctx.fillRect(x, base - h, w, h);
    i += 1;
  }
}

function drawCrane(ctx: CanvasRenderingContext2D, x: number, nightF: number): void {
  ctx.strokeStyle = `rgba(40,55,80,${0.8 - nightF * 0.3})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, GROUND_Y - 260);
  ctx.moveTo(x - 70, GROUND_Y - 245); ctx.lineTo(x + 90, GROUND_Y - 245);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 80, GROUND_Y - 245); ctx.lineTo(x + 80, GROUND_Y - 190); ctx.stroke();
  ctx.fillStyle = `rgba(40,55,80,${0.8 - nightF * 0.3})`;
  ctx.fillRect(x + 72, GROUND_Y - 182, 16, 20);
}

function drawGround(ctx: CanvasRenderingContext2D, dist: number, nightF: number, extX: number, extY: number): void {
  const dark = nightF * 0.45;
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_H);
  g.addColorStop(0, `rgb(${150 - dark * 120},${110 - dark * 90},${75 - dark * 60})`);
  g.addColorStop(1, `rgb(${105 - dark * 85},${76 - dark * 60},${52 - dark * 42})`);
  ctx.fillStyle = g;
  ctx.fillRect(-extX - 60, GROUND_Y, WORLD_W + 2 * (extX + 60), WORLD_H - GROUND_Y + extY + 60);
  // strip hazard di tepi
  ctx.fillStyle = '#f5c518';
  ctx.fillRect(-extX - 60, GROUND_Y, WORLD_W + 2 * (extX + 60), 10);
  ctx.fillStyle = '#1f2937';
  const segW = 36;
  const off = -((dist % (segW * 2)) + segW * 2) % (segW * 2);
  for (let x = off - extX - 60; x < WORLD_W + extX + 60; x += segW * 2) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 18, GROUND_Y);
    ctx.lineTo(x + 10, GROUND_Y + 10); ctx.lineTo(x - 8, GROUND_Y + 10);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(-extX - 60, GROUND_Y + 10, WORLD_W + 2 * (extX + 60), 3);
  // kerikil scrolling
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  for (let i = 0; i < 46; i += 1) {
    const x = ((i * 89 + 13 - dist) % (WORLD_W + 40) + WORLD_W + 40) % (WORLD_W + 40) - 20;
    const y = GROUND_Y + 26 + ((i * 53) % 100);
    ctx.beginPath(); ctx.ellipse(x, y, 3 + (i % 3), 2, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawWarnZone(ctx: CanvasRenderingContext2D, o: Obstacle): void {
  const zx = (o.lockX ?? o.x) - 14;
  const zw = o.w + 28;
  const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 90);
  ctx.fillStyle = `rgba(239,68,68,${pulse})`;
  ctx.fillRect(zx, GROUND_Y - 4, zw, 10);
  ctx.strokeStyle = `rgba(239,68,68,${pulse + 0.3})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(zx, GROUND_Y - 46, zw, 46);
  ctx.setLineDash([]);
  // bayangan bata
  ctx.fillStyle = `rgba(0,0,0,${0.25 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.ellipse(zx + zw / 2, GROUND_Y + 4, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f87171';
  ctx.font = `900 15px 'Plus Jakarta Sans', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('⚠ AWAS', zx + zw / 2, GROUND_Y - 52);
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, _dist: number): void {
  if (o.kind === 'barier') {
    const x = o.x; const y = GROUND_Y;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(x + o.w / 2, y + 5, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
    // kaki A
    ctx.strokeStyle = '#7c4a21'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    for (const lx of [x + 8, x + o.w - 8]) {
      ctx.beginPath(); ctx.moveTo(lx, y - o.h); ctx.lineTo(lx - 8, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, y - o.h); ctx.lineTo(lx + 8, y); ctx.stroke();
    }
    // papan belang
    const bw = o.w + 26; const bx = x - 13; const by = y - o.h;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(bx, by, bw, 22);
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, 22); ctx.clip();
    ctx.fillStyle = '#f97316';
    for (let sx = bx - 22; sx < bx + bw; sx += 36) {
      ctx.beginPath();
      ctx.moveTo(sx, by + 22); ctx.lineTo(sx + 18, by); ctx.lineTo(sx + 30, by); ctx.lineTo(sx + 12, by + 22);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,25,35,.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 22);
  } else if (o.kind === 'balok') {
    const x = o.x; const topY = GROUND_Y - o.yOff - o.h;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(x + o.w / 2, GROUND_Y + 5, 44, 7, 0, 0, Math.PI * 2); ctx.fill();
    // tiang scaffold
    ctx.strokeStyle = '#5b6470'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x - 12, GROUND_Y); ctx.lineTo(x - 12, topY - 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + o.w + 12, GROUND_Y); ctx.lineTo(x + o.w + 12, topY - 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 12, topY - 26); ctx.lineTo(x + o.w + 12, topY - 26); ctx.stroke();
    // rantai
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 3;
    for (const cx of [x + 12, x + o.w - 12]) {
      ctx.beginPath(); ctx.moveTo(cx, topY - 26); ctx.lineTo(cx, topY); ctx.stroke();
    }
    // balok baja belang
    const g = ctx.createLinearGradient(0, topY, 0, topY + o.h);
    g.addColorStop(0, '#9aa3af'); g.addColorStop(1, '#5b6470');
    ctx.fillStyle = g;
    ctx.fillRect(x, topY, o.w, o.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, topY, o.w, o.h); ctx.clip();
    ctx.fillStyle = '#f5c518';
    for (let sx = x - o.h; sx < x + o.w; sx += 28) {
      ctx.beginPath();
      ctx.moveTo(sx, topY + o.h); ctx.lineTo(sx + 14, topY); ctx.lineTo(sx + 24, topY); ctx.lineTo(sx + 10, topY + o.h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,25,35,.65)'; ctx.lineWidth = 2;
    ctx.strokeRect(x, topY, o.w, o.h);
  } else if (o.kind === 'lubang') {
    const x = o.x; const y = GROUND_Y;
    // retakan
    ctx.strokeStyle = 'rgba(40,25,15,.6)'; ctx.lineWidth = 2.5;
    for (const [cx, len] of [[x - 14, 22], [x + o.w + 6, 26], [x + o.w / 2, 18]] as const) {
      ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx + (cx > x + o.w / 2 ? len : -len) * 0.4, y + 14); ctx.stroke();
    }
    const g = ctx.createRadialGradient(x + o.w / 2, y + 8, 4, x + o.w / 2, y + 8, o.w / 2);
    g.addColorStop(0, '#000');
    g.addColorStop(0.75, '#101418');
    g.addColorStop(1, 'rgba(16,20,24,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x + o.w / 2, y + 6, o.w / 2, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x + o.w / 2, y + 4, o.w / 2, 16, 0, 0.15, Math.PI - 0.15); ctx.stroke();
  } else if (o.kind === 'bata') {
    if (o.phase === 'warn' || o.phase === 'fall') {
      const bx = (o.lockX ?? o.x);
      const by = GROUND_Y - o.h + (o.brickY ?? -170); // -170 (langit) -> 0 (tanah)
      const shakeX = o.phase === 'warn' ? Math.sin(performance.now() / 40) * 3 : 0;
      drawBrick(ctx, bx + shakeX, by, o.w, o.h);
    } else if (o.phase === 'rubble') {
      const x = o.x;
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.ellipse(x + o.w / 2, GROUND_Y + 4, 36, 7, 0, 0, Math.PI * 2); ctx.fill();
      drawBrick(ctx, x + 4, GROUND_Y - 30, 48, 30);
      drawBrick(ctx, x + 22, GROUND_Y - 18, 40, 26);
    }
  } else if (o.kind === 'helm') {
    const hx = o.x + o.w / 2;
    const hy = GROUND_Y - o.yOff;
    const bob = Math.sin(performance.now() / 300 + o.x) * 5;
    const glow = ctx.createRadialGradient(hx, hy + bob, 4, hx, hy + bob, 34);
    glow.addColorStop(0, 'rgba(253,224,71,.55)');
    glow.addColorStop(1, 'rgba(253,224,71,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(hx - 34, hy + bob - 34, 68, 68);
    drawHelmet(ctx, hx, hy + bob, 1);
  }
}

function drawBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#d4693f'); g.addColorStop(1, '#96421f');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,220,180,.25)';
  ctx.fillRect(x + 2, y + 2, w - 4, 5);
  ctx.strokeStyle = 'rgba(20,25,35,.65)'; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawHelmet(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, -16, 0, 10);
  g.addColorStop(0, '#fde047'); g.addColorStop(1, '#d97706');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 2, 15, Math.PI, 0);
  ctx.quadraticCurveTo(0, -6, -15, 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b45309';
  ctx.fillRect(-20, 0, 40, 5);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(-5, -8, 4, 6, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(20,25,35,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 2, 15, Math.PI, 0); ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, r: RunState, nightF: number): void {
  const p = r.player;
  const pr = playerRect(p);
  const cx = pr.x + pr.w / 2;
  const feetY = GROUND_Y - p.y;

  // bayangan
  const hgt = clamp(1 - p.y / 420, 0.2, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * hgt})`;
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y + 6, 30 * (1.5 - hgt * 0.5), 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (p.dead) {
    // jatuh terlentang
    ctx.translate(cx, feetY - 20);
    ctx.rotate(-1.2);
    ctx.translate(-cx, -(feetY - 20));
  }

  const legSwing = p.grounded && !p.sliding ? Math.sin(r.runPhase) : 0;
  const skin = '#e8b88a';

  if (p.sliding) {
    // pose nunduk: badan rendah miring ke belakang
    const by = feetY - 26;
    // kaki lurus ke depan
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 6, by); ctx.lineTo(cx + 30, feetY - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 6, by); ctx.lineTo(cx + 24, feetY - 4); ctx.stroke();
    // badan miring
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 20;
    ctx.beginPath(); ctx.moveTo(cx - 10, by); ctx.lineTo(cx - 26, by - 26); ctx.stroke();
    ctx.strokeStyle = '#fde047'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx - 14, by - 8); ctx.lineTo(cx - 24, by - 24); ctx.stroke();
    // kepala + helm
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(cx - 30, by - 36, 11, 0, Math.PI * 2); ctx.fill();
    drawHelmet(ctx, cx - 30, by - 40, 0.85);
  } else {
    const hipY = feetY - 44;
    // kaki 2-frame
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    const l1 = p.grounded ? legSwing * 16 : 10;
    const l2 = p.grounded ? -legSwing * 16 : -6;
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx - 8 + l1, feetY - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx + 8 + l2, feetY - 4); ctx.stroke();
    // sepatu
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(cx - 14 + l1, feetY - 10, 16, 8);
    ctx.fillRect(cx + 2 + l2, feetY - 10, 16, 8);
    // badan rompi
    const lean = p.grounded ? 0.08 : -0.12;
    ctx.save();
    ctx.translate(cx, hipY); ctx.rotate(lean);
    const bg = ctx.createLinearGradient(0, -44, 0, 0);
    bg.addColorStop(0, '#fb923c'); bg.addColorStop(1, '#ea580c');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(-13, -46, 26, 48, 8);
    ctx.fill();
    // strip reflektif
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(-13, -30, 26, 7);
    ctx.fillRect(-13, -18, 26, 7);
    ctx.restore();
    // lengan ayun
    ctx.strokeStyle = skin; ctx.lineWidth = 9;
    const aSwing = p.grounded ? legSwing * 14 : 18;
    ctx.beginPath(); ctx.moveTo(cx + 2, hipY - 36); ctx.lineTo(cx + 10 - aSwing, hipY - 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 2, hipY - 36); ctx.lineTo(cx - 6 + aSwing, hipY - 16); ctx.stroke();
    // kepala
    const headY = hipY - 58;
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(cx + 2, headY, 12, 0, Math.PI * 2); ctx.fill();
    // mata (malam: tetap terlihat)
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(cx + 7, headY - 1, 2, 0, Math.PI * 2); ctx.fill();
    drawHelmet(ctx, cx + 2, headY - 4, 1);
  }
  ctx.restore();
  void nightF;
}
