/**
 * Selamatkan Mandor — save-the-dog 2D rasa proyek.
 * Benda jatuh dari atas (bata, palu, ember semen). Gambar SATU garis spidol
 * sebagai perisai, selamatkan mandor sampai timer habis.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useGameCanvas } from '../../engine2d';
import type { GameApi } from '../../engine2d';
import { bestKey, getJson, setJson } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import { clamp, TAU } from '../../engine2d/helpers';
import {
  createState, step, setLine, clearLine, inkLeft,
  starsFor, resetState, LEVELS,
  type MandorState, type Vec, type Body, type FallKind,
} from './logic';

type Screen = 'menu' | 'intro' | 'play' | 'win' | 'dead';

interface Rt {
  state: MandorState | null;
  drawing: boolean;
  pts: Vec[];
  t: number;
  levelIndex: number;
  lastStatus: string;
  hudT: number;
}

const STARS_KEY = bestKey('selamatkan-mandor', 'stars');
const UNLOCK_KEY = bestKey('selamatkan-mandor', 'unlocked');

const KIND_COLORS: Record<FallKind, string[]> = {
  bata: ['#fdba74', '#ea580c', '#9a3412'],
  palu: ['#cbd5e1', '#64748b', '#92400e'],
  ember: ['#cbd5e1', '#64748b', '#a8a29e'],
};

export default function SelamatkanMandor({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>('menu');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState({ timeLeft: 0, inkFrac: 1, drawing: false });
  const [stars, setStars] = useState<number[]>(() => getJson<number[]>(STARS_KEY, []));
  const [unlocked, setUnlocked] = useState<number>(() => getJson<number>(UNLOCK_KEY, 1));
  const [winStars, setWinStars] = useState(0);

  const apiRef = useRef<GameApi | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rt = useRef<Rt>({
    state: null, drawing: false, pts: [], t: 0,
    levelIndex: 0, lastStatus: 'play', hudT: 0,
  });
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const syncMeta = () => {
    setStars(getJson<number[]>(STARS_KEY, []));
    setUnlocked(getJson<number>(UNLOCK_KEY, 1));
  };

  const beginLevel = (idx: number) => {
    const api = apiRef.current;
    rt.current.levelIndex = idx;
    const W = api ? api.W : 390;
    const H = api ? api.H : 620;
    rt.current.state = createState(idx, W, H);
    rt.current.drawing = false;
    rt.current.pts = [];
    rt.current.lastStatus = 'play';
    setPaused(false);
    api?.loop.setPaused(false);
    setScreen('intro');
  };

  const startPlay = () => {
    const api = apiRef.current;
    if (!api || !rt.current.state) return;
    api.sfx.ensure();
    api.sfx.whoosh();
    try {
      api.loop.start();
    } catch {
      /* already started */
    }
    api.loop.setPaused(false);
    setPaused(false);
    setScreen('play');
  };

  const doWin = () => {
    const api = apiRef.current;
    const s = rt.current.state;
    if (!s) return;
    const n = starsFor(s);
    setWinStars(n);
    const idx = rt.current.levelIndex;
    const arr = getJson<number[]>(STARS_KEY, []);
    arr[idx] = Math.max(arr[idx] ?? 0, n);
    setJson(STARS_KEY, arr);
    if (idx + 1 < LEVELS.length) {
      setJson(UNLOCK_KEY, Math.max(getJson<number>(UNLOCK_KEY, 1), idx + 2));
    }
    syncMeta();
    setScreen('win');
    if (api) {
      api.sfx.chime(4, 720);
      if (wrapRef.current) popText(wrapRef.current, 'MANDOR SELAMAT! 🎉', { size: 30, color: '#4ade80' });
      for (let k = 0; k < 3; k += 1) {
        window.setTimeout(() => {
          api.particles.spawn(api.W * (0.25 + 0.25 * k), api.H * 0.3, {
            count: 40, colors: ['#fbbf24', '#4ade80', '#60a5fa', '#ffffff'],
            speed: [100, 380], angle: -Math.PI / 2, spread: Math.PI * 1.6,
            gravity: 450, life: [0.8, 1.5], size: [3, 6], shape: 'rect',
          });
        }, k * 220);
      }
    }
  };

  const doDead = () => {
    const api = apiRef.current;
    const s = rt.current.state;
    setScreen('dead');
    if (api && s) {
      api.sfx.fail();
      api.shake.add(0.65);
      api.particles.spawn(s.foreman.x, s.foreman.y - 10, {
        count: 45, colors: ['#f87171', '#ef4444', '#fbbf24', '#fde047'],
        speed: [120, 420], life: [0.6, 1.2], size: [3, 7], gravity: 600,
      });
      api.scores.add(s.foreman.x, s.foreman.y - 60, 'DUAKH!', { color: '#ef4444', size: 26 });
    }
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    setMuted(api.sfx.muted);

    api.setUpdate((dt) => {
      const r = rt.current;
      r.t += dt;
      const s = r.state;
      if (!s || screenRef.current !== 'play') return;
      step(s, dt);

      // consume events → juice
      for (const th of s.thuds) {
        api.particles.spawn(th.x, th.y, {
          count: Math.round(6 + th.strength * 14),
          colors: ['#e2e8f0', '#94a3b8', '#ffffff'],
          speed: [60, 200 + th.strength * 200], life: [0.3, 0.7], size: [2, 4],
          gravity: 700,
        });
        if (th.strength > 0.15) api.sfx.thud(0.4 + th.strength * 0.6);
      }
      for (const ld of s.lands) {
        api.particles.spawn(ld.x, ld.y - 4, {
          count: 10, colors: ['#d6c9b8', '#b8a88f'], speed: [40, 160],
          angle: -Math.PI / 2, spread: Math.PI, life: [0.4, 0.8], size: [2, 5],
        });
      }

      if (s.status !== r.lastStatus) {
        r.lastStatus = s.status;
        if (s.status === 'win') doWin();
        else if (s.status === 'dead') doDead();
      }

      r.hudT += dt;
      if (r.hudT > 0.12) {
        r.hudT = 0;
        setHud({
          timeLeft: Math.max(0, s.level.duration - s.time),
          inkFrac: s.inkMax > 0 ? inkLeft(s) / s.inkMax : 1,
          drawing: r.drawing,
        });
      }
    });

    api.setRender(() => drawScene(api, rt.current));

    api.input.onDown = (p) => {
      const r = rt.current;
      if (screenRef.current !== 'play' || pausedRef.current || !r.state) return;
      api.sfx.ensure();
      r.drawing = true;
      r.pts = [{ x: p.x, y: p.y }];
      setLine(r.state, []);
      setHud((h) => ({ ...h, drawing: true }));
    };
    api.input.onMove = (p) => {
      const r = rt.current;
      if (!r.drawing || !r.state || screenRef.current !== 'play' || pausedRef.current) return;
      const last = r.pts[r.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 7) {
        r.pts.push({ x: p.x, y: p.y });
        setLine(r.state, r.pts);
      }
    };
    api.input.onUp = () => {
      const r = rt.current;
      if (!r.drawing) return;
      r.drawing = false;
      if (r.state && r.pts.length < 2) setLine(r.state, []);
      else api.sfx.pop(0.8);
      setHud((h) => ({ ...h, drawing: false }));
    };

    api.onResize((w, h) => {
      const r = rt.current;
      if (r.state && screenRef.current === 'play') {
        // keep it simple: fresh level state on rotate/resize
        const idx = r.levelIndex;
        r.state = createState(idx, w, h);
        r.drawing = false;
        r.pts = [];
        r.lastStatus = 'play';
      }
    });

    return () => {
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /* keep canvas painted behind menu/intro: start loop lazily on first mount */
  useEffect(() => {
    const api = apiRef.current;
    if (api && !rt.current.state) {
      rt.current.state = createState(0, api.W || 390, api.H || 620);
      try {
        api.loop.start();
      } catch {
        /* noop */
      }
      api.loop.setPaused(true); // render-only backdrop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePause = () => {
    const api = apiRef.current;
    if (!api || screen !== 'play') return;
    const next = !pausedRef.current;
    api.loop.setPaused(next);
    setPaused(next);
    api.sfx.click();
  };

  const toggleMute = () => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    setMuted(api.sfx.toggleMute());
  };

  const eraseLine = () => {
    const s = rt.current.state;
    if (!s) return;
    clearLine(s);
    rt.current.pts = [];
    apiRef.current?.sfx.click();
  };

  const retry = () => {
    const s = rt.current.state;
    if (!s) return;
    apiRef.current?.sfx.click();
    resetState(s);
    rt.current.drawing = false;
    rt.current.pts = [];
    rt.current.lastStatus = 'play';
    setPaused(false);
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };

  const backToMenu = () => {
    apiRef.current?.sfx.click();
    apiRef.current?.loop.setPaused(true);
    setPaused(false);
    syncMeta();
    setScreen('menu');
  };

  const lvl = LEVELS[rt.current.levelIndex];
  const lvlStars = stars[rt.current.levelIndex] ?? 0;

  return (
    <div ref={wrapRef} style={styles.wrap}>
      <div style={styles.topbar}>
        <button style={styles.iconBtn} onClick={screen === 'menu' ? onExit : backToMenu} title="Kembali">✕</button>
        <div style={styles.title}>🦺 Selamatkan Mandor</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {screen === 'play' && (
            <button style={styles.iconBtn} onClick={togglePause} title={paused ? 'Lanjut' : 'Jeda'}>
              {paused ? '▶' : '⏸'}
            </button>
          )}
          <button style={styles.iconBtn} onClick={toggleMute} title="Suara">{muted ? '🔇' : '🔊'}</button>
        </div>
      </div>

      {(screen === 'play' || screen === 'win' || screen === 'dead') && (
        <div style={styles.hud}>
          <div style={styles.hudItem}>⏱ <b>{hud.timeLeft.toFixed(0)}s</b></div>
          <div style={{ flex: 1 }}>
            <div style={styles.inkLabel}>🖊️ Tinta spidol</div>
            <div style={styles.inkTrack}>
              <div
                style={{
                  ...styles.inkFill,
                  width: `${Math.round(hud.inkFrac * 100)}%`,
                  background: hud.inkFrac > 0.25
                    ? 'linear-gradient(90deg,#38bdf8,#0ea5e9)'
                    : 'linear-gradient(90deg,#f87171,#ef4444)',
                }}
              />
            </div>
          </div>
          {screen === 'play' && !paused && (
            <button style={styles.eraseBtn} onClick={eraseLine}>🧽 Hapus garis</button>
          )}
        </div>
      )}

      <div style={styles.canvasBox}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
      {screen === 'play' && !paused && (
        <div style={styles.hint}>
          {hud.drawing ? 'Lepas untuk mengunci garis…' : '👆 Gambar SATU garis pelindung di atas mandor!'}
        </div>
      )}

      {screen === 'menu' && (
        <Overlay>
          <div style={styles.cardTitle}>🦺 Selamatkan Mandor</div>
          <p style={styles.cardText}>
            Bata, palu, dan ember semen berjatuhan dari langit proyek.
            Gambar <b>satu garis spidol</b> sebagai perisai — mandor harus selamat sampai timer habis!
          </p>
          <p style={{ ...styles.cardText, fontSize: 12, color: '#64748b' }}>
            *"Mandor kabur pas hujan. Seperti biasa." — tapi tidak hari ini.*
          </p>
          <div style={styles.levelGrid}>
            {LEVELS.map((l, i) => {
              const locked = i + 1 > unlocked;
              const st = stars[i] ?? 0;
              return (
                <button
                  key={l.name}
                  disabled={locked}
                  onClick={() => beginLevel(i)}
                  style={{ ...styles.levelBtn, opacity: locked ? 0.45 : 1 }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{locked ? '🔒' : `${i + 1}`}</div>
                  <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.2 }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: '#b45309' }}>
                    {'★'.repeat(st)}{'☆'.repeat(3 - st)}
                  </div>
                </button>
              );
            })}
          </div>
        </Overlay>
      )}

      {screen === 'intro' && (
        <Overlay>
          <div style={styles.levelTag}>LEVEL {rt.current.levelIndex + 1}/15</div>
          <div style={styles.cardTitle}>{lvl.name}</div>
          <p style={styles.cardText}>{lvl.sub}</p>
          <div style={styles.chipRow}>
            <span style={styles.chip}>⏱ {lvl.duration}s</span>
            <span style={styles.chip}>📦 {lvl.spawns.length} benda</span>
            <span style={styles.chip}>🖊️ {lvl.ink}px tinta</span>
            {lvlStars > 0 && <span style={styles.chip}>🏆 {'★'.repeat(lvlStars)}</span>}
          </div>
          <p style={{ ...styles.cardText, fontSize: 12, color: '#64748b' }}>
            Gambar garis dengan jari/mouse. Tinta terbatas — garis hemat = bintang 3!
          </p>
          <div style={styles.btnRow}>
            <button style={styles.primaryBtn} onClick={startPlay}>Mulai 🦺</button>
            <button style={styles.ghostBtn} onClick={backToMenu}>Pilih Level</button>
          </div>
        </Overlay>
      )}

      {screen === 'play' && paused && (
        <Overlay>
          <div style={styles.cardTitle}>⏸ Istirahat Ngopi</div>
          <p style={styles.cardText}>Benda-benda berhenti di udara. Fisika pun butuh kopi.</p>
          <div style={styles.btnRow}>
            <button style={styles.primaryBtn} onClick={togglePause}>Lanjut ▶</button>
            <button style={styles.ghostBtn} onClick={retry}>Ulangi Level 🔄</button>
            <button style={styles.ghostBtn} onClick={backToMenu}>Pilih Level</button>
          </div>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 46 }}>🦺🎉</div>
          <div style={styles.cardTitle}>Mandor selamat!</div>
          <div style={{ fontSize: 30, color: '#b45309', letterSpacing: 4 }}>
            {'★'.repeat(winStars)}{'☆'.repeat(3 - winStars)}
          </div>
          <p style={styles.cardText}>APD hari ini: helm + spidol.</p>
          <p style={{ ...styles.cardText, fontSize: 12, color: '#64748b' }}>
            *"Berita acara serah terima: nihil korban, nihil revisi. Ajaib."*
          </p>
          <div style={styles.btnRow}>
            {rt.current.levelIndex + 1 < LEVELS.length ? (
              <button style={styles.primaryBtn} onClick={() => beginLevel(rt.current.levelIndex + 1)}>
                Level {rt.current.levelIndex + 2} ▶
              </button>
            ) : (
              <button style={styles.primaryBtn} onClick={backToMenu}>Tamat! Pilih Level 🏁</button>
            )}
            <button style={styles.ghostBtn} onClick={retry}>Ulangi 🔄</button>
            <button style={styles.ghostBtn} onClick={backToMenu}>Pilih Level</button>
          </div>
        </Overlay>
      )}

      {screen === 'dead' && (
        <Overlay>
          <div style={{ fontSize: 46 }}>🪖💥</div>
          <div style={styles.cardTitle}>ADUH!</div>
          <p style={styles.cardText}>
            <b>Bata jatuh tepat di helm. Helmnya KW.</b>
          </p>
          <p style={{ ...styles.cardText, fontSize: 12, color: '#64748b' }}>
            *"AHSP bilang helm cukup. Harga pasar bilang tidak."*
          </p>
          <div style={styles.btnRow}>
            <button style={styles.primaryBtn} onClick={retry}>Coba Lagi 💪</button>
            <button style={styles.ghostBtn} onClick={backToMenu}>Pilih Level</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ================= drawing ================= */

function drawScene(api: GameApi, r: Rt): void {
  const { ctx, W, H } = api;
  const s = r.state;
  const t = r.t;

  // --- sky: 3-stop gradient ---
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#38bdf8');
  sky.addColorStop(0.55, '#a5dcf5');
  sky.addColorStop(0.8, '#fdf0d5');
  sky.addColorStop(1, '#fde9c8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // --- sun with glow ---
  const sunX = W * 0.82;
  const sunY = H * 0.14;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 90);
  glow.addColorStop(0, 'rgba(254,240,138,0.95)');
  glow.addColorStop(0.35, 'rgba(253,224,71,0.55)');
  glow.addColorStop(1, 'rgba(253,224,71,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 30, 0, TAU);
  ctx.fill();

  // --- clouds: 2 parallax layers ---
  drawClouds(ctx, W, H, t, 0.45, 8, 0.75);
  // --- buildings back layer ---
  drawBuildings(ctx, W, H, '#b8c9dd', 0.42, 60, 7);
  // --- buildings front layer ---
  drawBuildings(ctx, W, H, '#8ba3bd', 0.58, 110, 13);
  drawClouds(ctx, W, H, t, 0.62, 15, 1);

  const groundY = s ? s.groundY : H - 64;

  // --- ground / platform ---
  const gr = ctx.createLinearGradient(0, groundY, 0, H);
  gr.addColorStop(0, '#d8cfc0');
  gr.addColorStop(0.12, '#c9bda9');
  gr.addColorStop(1, '#a89a83');
  ctx.fillStyle = gr;
  ctx.fillRect(0, groundY, W, H - groundY);
  // concrete edge
  ctx.fillStyle = '#8f8471';
  ctx.fillRect(0, groundY, W, 8);
  // hazard stripes
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, groundY + 8, W, 12);
  ctx.clip();
  for (let x = -20; x < W + 20; x += 28) {
    ctx.fillStyle = (x / 28) % 2 === 0 ? '#fbbf24' : '#1f2937';
    ctx.beginPath();
    ctx.moveTo(x, groundY + 8);
    ctx.lineTo(x + 14, groundY + 8);
    ctx.lineTo(x + 6, groundY + 20);
    ctx.lineTo(x - 8, groundY + 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (!s) return;

  // --- shadows + bodies ---
  for (const b of s.bodies) {
    const hFrac = clamp(1 - (groundY - b.y) / (H * 0.8), 0, 1);
    ctx.fillStyle = `rgba(15,23,42,${0.08 + 0.22 * hFrac})`;
    ctx.beginPath();
    ctx.ellipse(b.x, groundY + 26, b.r * (1.3 - 0.5 * hFrac), 6, 0, 0, TAU);
    ctx.fill();
  }
  for (const b of s.bodies) {
    drawBody(ctx, b, groundY);
  }

  // --- foreman ---
  drawForeman(ctx, s.foreman.x, s.foreman.y, s.foreman.r, t, s.status === 'dead');

  // --- player line: marker stroke + outline ---
  const pts = r.drawing ? r.pts : s.line;
  if (pts.length >= 2) {
    for (const [lw, color] of [[12, '#0f172a'], [6.5, '#38bdf8']] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    // marker highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y - 1.5);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y - 1.5);
    ctx.stroke();
  }

  // --- vignette ---
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(15,23,42,0)');
  vg.addColorStop(1, 'rgba(15,23,42,0.14)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawClouds(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  t: number, yFrac: number, speed: number, alpha: number,
): void {
  const baseY = H * yFrac;
  const span = W + 320;
  for (let i = 0; i < 4; i += 1) {
    const x = ((i * 260 + t * speed + 140) % span) - 160;
    const y = baseY + Math.sin(i * 2.1 + t * 0.4) * 8;
    const sc = 0.7 + (i % 3) * 0.3;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 26 * sc, 0, TAU);
    ctx.arc(x + 24 * sc, y - 10 * sc, 20 * sc, 0, TAU);
    ctx.arc(x + 48 * sc, y, 24 * sc, 0, TAU);
    ctx.arc(x + 24 * sc, y + 8 * sc, 22 * sc, 0, TAU);
    ctx.fill();
  }
}

function drawBuildings(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  color: string, baseFrac: number, maxH: number, stepX: number,
): void {
  const baseY = H * baseFrac + 120;
  ctx.fillStyle = color;
  let i = 0;
  for (let x = -20; x < W + 40; x += stepX) {
    const h = 50 + ((i * 53 + 17) % maxH);
    const w = stepX - 14;
    ctx.fillRect(x, baseY - h, w, h);
    // rooftop details
    if (i % 3 === 0) ctx.fillRect(x + w * 0.3, baseY - h - 12, 6, 12);
    // windows
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let wy = baseY - h + 10; wy < baseY - 12; wy += 18) {
      for (let wx = x + 6; wx < x + w - 8; wx += 14) {
        if ((wx * 7 + wy * 13 + i) % 5 !== 0) ctx.fillRect(wx, wy, 8, 10);
      }
    }
    ctx.fillStyle = color;
    i += 1;
  }
}

function drawBody(ctx: CanvasRenderingContext2D, b: Body, groundY: number): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  ctx.lineWidth = 2.5;
  if (b.kind === 'bata') {
    const w = 38;
    const h = 24;
    ctx.fillStyle = '#ea580c';
    ctx.strokeStyle = '#7c2d12';
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.stroke();
    // mortar lines
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, 0);
    ctx.lineTo(w / 2 - 3, 0);
    ctx.moveTo(0, -h / 2 + 3);
    ctx.lineTo(0, h / 2 - 3);
    ctx.stroke();
    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRectPath(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, 6, 3);
    ctx.fill();
  } else if (b.kind === 'palu') {
    // handle
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#451a03';
    roundRectPath(ctx, -4, -22, 8, 34, 3);
    ctx.fill();
    ctx.stroke();
    // head
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#334155';
    roundRectPath(ctx, -16, -32, 32, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-13, -30, 26, 4);
  } else {
    // ember semen: trapezoid bucket
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#1f2937';
    ctx.beginPath();
    ctx.moveTo(-15, -13);
    ctx.lineTo(15, -13);
    ctx.lineTo(10, 13);
    ctx.lineTo(-10, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // cement surface
    ctx.fillStyle = '#a8a29e';
    ctx.beginPath();
    ctx.ellipse(0, -13, 15, 5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#57534e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // rim highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-15, -11, 30, 4);
    // handle arc
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -8, 17, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  ctx.restore();
  void groundY;
}

function drawForeman(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  t: number, dead: boolean,
): void {
  const bob = dead ? 0 : Math.sin(t * 3.2) * 1.6;
  ctx.save();
  ctx.translate(x, y + bob);

  // shadow
  ctx.fillStyle = 'rgba(15,23,42,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, r + 22 - bob, 26, 7, 0, 0, TAU);
  ctx.fill();

  // legs
  ctx.fillStyle = '#1e3a5f';
  roundRectPath(ctx, -13, r + 2, 11, 20, 4);
  ctx.fill();
  roundRectPath(ctx, 2, r + 2, 11, 20, 4);
  ctx.fill();
  // boots
  ctx.fillStyle = '#451a03';
  roundRectPath(ctx, -15, r + 18, 15, 7, 3);
  ctx.fill();
  roundRectPath(ctx, 0, r + 18, 15, 7, 3);
  ctx.fill();

  // body: blue coverall
  const bodyGrad = ctx.createLinearGradient(0, -r - 6, 0, r + 4);
  bodyGrad.addColorStop(0, '#3b82f6');
  bodyGrad.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#172554';
  ctx.lineWidth = 2;
  roundRectPath(ctx, -16, -r - 4, 32, r + 10, 10);
  ctx.fill();
  ctx.stroke();
  // pocket + buttons
  ctx.strokeStyle = '#172554';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-9, -r + 8, 18, 12);
  ctx.fillStyle = '#dbeafe';
  ctx.beginPath();
  ctx.arc(0, -r + 2, 2.2, 0, TAU);
  ctx.fill();

  // arms
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  const wave = dead ? 0.5 : Math.sin(t * 3.2) * 0.12;
  ctx.beginPath();
  ctx.moveTo(-15, -r + 6);
  ctx.lineTo(-24, -r + 16 + wave * 20);
  ctx.moveTo(15, -r + 6);
  ctx.lineTo(24, -r + 16 - wave * 20);
  ctx.stroke();

  // head
  ctx.fillStyle = '#fcd9b8';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -r - 16, r * 0.85, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // face
  ctx.fillStyle = '#1f2937';
  if (dead) {
    // X eyes
    for (const ex of [-6, 6]) {
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex - 4, -r - 20);
      ctx.lineTo(ex + 4, -r - 12);
      ctx.moveTo(ex + 4, -r - 20);
      ctx.lineTo(ex - 4, -r - 12);
      ctx.stroke();
    }
  } else {
    // worried eyes: white + pupil up
    for (const ex of [-6, 6]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, -r - 16, 4.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(ex, -r - 17.5, 2.2, 0, TAU);
      ctx.fill();
    }
    // worried brows
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-10, -r - 24);
    ctx.lineTo(-3, -r - 22);
    ctx.moveTo(10, -r - 24);
    ctx.lineTo(3, -r - 22);
    ctx.stroke();
    // small frown
    ctx.beginPath();
    ctx.arc(0, -r - 4, 4, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  // helmet: yellow dome + brim + highlight
  const hy = -r - 22;
  const helmGrad = ctx.createLinearGradient(0, hy - 18, 0, hy + 4);
  helmGrad.addColorStop(0, '#fde047');
  helmGrad.addColorStop(1, '#eab308');
  ctx.fillStyle = helmGrad;
  ctx.strokeStyle = '#854d0e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, hy, 17, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // brim
  roundRectPath(ctx, -22, hy - 2, 44, 7, 3.5);
  ctx.fillStyle = '#eab308';
  ctx.fill();
  ctx.stroke();
  // dome highlight
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-6, hy - 9, 5, 7, -0.4, 0, TAU);
  ctx.fill();
  // helmet ridge
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, hy - 17);
  ctx.lineTo(0, hy - 2);
  ctx.stroke();

  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = clamp(r, 0, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ================= styles ================= */

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative', display: 'flex', flexDirection: 'column',
    width: '100%', height: '100%', minHeight: 560,
    background: '#0ea5e9', overflow: 'hidden',
    fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
  },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', background: '#0f172a', color: '#fff', zIndex: 5,
  },
  title: { fontWeight: 900, fontSize: 16 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(255,255,255,.25)',
    background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 17,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  hud: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
    background: 'rgba(255,255,255,.94)', borderBottom: '1px solid #e2e8f0',
    fontSize: 14, zIndex: 4,
  },
  hudItem: { display: 'flex', alignItems: 'center', gap: 4, color: '#0f172a', whiteSpace: 'nowrap' },
  inkLabel: { fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 2 },
  inkTrack: { height: 10, borderRadius: 6, background: '#e2e8f0', overflow: 'hidden' },
  inkFill: { height: '100%', borderRadius: 6, transition: 'width .15s' },
  eraseBtn: {
    height: 40, padding: '0 10px', borderRadius: 10, border: '1px solid #cbd5e1',
    background: '#fff', fontSize: 12, fontWeight: 700, color: '#334155',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  canvasBox: { flex: 1, display: 'flex', minHeight: 0, padding: 0 },
  canvas: { width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' },
  hint: {
    padding: '8px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700,
    color: '#0c4a6e', background: 'rgba(255,255,255,.9)',
  },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 10,
    background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
  },
  card: {
    background: '#ffffff', borderRadius: 20, padding: 20, maxWidth: 340, width: '100%',
    textAlign: 'center', boxShadow: '0 24px 60px rgba(15,23,42,.35)',
    maxHeight: '92%', overflowY: 'auto',
  },
  cardTitle: { fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 8 },
  cardText: { fontSize: 14, color: '#334155', lineHeight: 1.55, margin: '6px 0' },
  levelTag: {
    display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#0ea5e9',
    background: '#e0f2fe', borderRadius: 999, padding: '4px 12px', marginBottom: 8,
    letterSpacing: 1,
  },
  chipRow: { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0' },
  chip: {
    fontSize: 12, fontWeight: 700, color: '#0c4a6e', background: '#e0f2fe',
    borderRadius: 999, padding: '5px 10px',
  },
  levelGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12,
  },
  levelBtn: {
    borderRadius: 12, border: '2px solid #e2e8f0', background: '#f8fafc',
    padding: '10px 4px', cursor: 'pointer', display: 'flex',
    flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  primaryBtn: {
    marginTop: 12, width: '100%', height: 50, borderRadius: 14, border: 'none',
    background: '#0ea5e9', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
  },
  ghostBtn: {
    marginTop: 8, height: 44, borderRadius: 12, border: '1px solid #cbd5e1',
    background: '#fff', color: '#334155', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', padding: '0 14px',
  },
  btnRow: { display: 'flex', flexDirection: 'column', gap: 2 },
};

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>{children}</div>
    </div>
  );
}

export { KIND_COLORS };
