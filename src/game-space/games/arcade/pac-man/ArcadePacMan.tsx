/**
 * ArcadePacMan ("Pak Mandor") — Pak Mandor memakan helm proyek di labirin,
 * dikejar para "Klien Revisi". Kopi Tubruk membuat klien setuju sesaat!
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  createGame, step, setInput, tileAt,
  COLS, ROWS, T_WALL, T_DOT, T_PELLET, T_DOOR,
  UP, DOWN, LEFT, RIGHT,
  type GameState, type GhostInfo,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('pak-mandor', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

const GHOST_LABEL: Record<string, string> = {
  denah: 'Revisi Denah',
  rab: 'Revisi RAB',
  desain: 'Revisi Desain',
  spek: 'Revisi Spek',
};

export default function ArcadePacMan({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    let st: GameState = createGame((Date.now() % 100000) | 0);
    let tile = 20;
    let ox = 0;
    let oy = 0;
    let chomp = 0;
    let deathT = 0; // animasi mati
    let prevLives = 3;
    let prevScore = 0;
    let levelToast = 0;
    let swipeStart: { x: number; y: number } | null = null;

    const layout = (): void => {
      tile = Math.min(api.W / COLS, (api.H * 0.72) / ROWS);
      ox = (api.W - tile * COLS) / 2;
      oy = (api.H - tile * ROWS) / 2 + 6;
    };
    layout();
    api.onResize(() => layout());

    const px = (tx: number): number => ox + (tx + 0.5) * tile;
    const py = (ty: number): number => oy + (ty + 0.5) * tile;

    const push = (): void => {
      api.pushHud({ score: st.score, lives: st.lives, level: st.level, best: getBest(BK, 0) });
    };

    const reset = (): void => {
      st = createGame((Date.now() % 100000) | 0);
      deathT = 0;
      prevLives = 3;
      prevScore = 0;
      levelToast = 0;
      push();
    };

    const endGame = (): void => {
      const nb = setBest(BK, st.score);
      api.sfx.fail();
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, '📋 PROYEK DIBATALKAN KLIEN!', { size: 22, color: '#f87171' });
      window.setTimeout(() => {
        api.pushHud({ score: st.score, lives: 0, level: st.level, best: nb });
        setScreen('over');
      }, 1200);
    };

    // input: swipe + keyboard
    api.input.onDown = (p) => {
      api.sfx.ensure();
      swipeStart = { x: p.x, y: p.y };
    };
    api.input.onUp = (p) => {
      if (!swipeStart || screenRef.current !== 'play' || st.over) { swipeStart = null; return; }
      const dx = p.x - swipeStart.x;
      const dy = p.y - swipeStart.y;
      if (Math.hypot(dx, dy) > 18) {
        if (Math.abs(dx) > Math.abs(dy)) setInput(st, dx > 0 ? RIGHT : LEFT);
        else setInput(st, dy > 0 ? DOWN : UP);
      }
      swipeStart = null;
    };

    const keyDir = (): void => {
      if (api.input.wasPressed('ArrowUp') || api.input.wasPressed('KeyW')) setInput(st, UP);
      if (api.input.wasPressed('ArrowDown') || api.input.wasPressed('KeyS')) setInput(st, DOWN);
      if (api.input.wasPressed('ArrowLeft') || api.input.wasPressed('KeyA')) setInput(st, LEFT);
      if (api.input.wasPressed('ArrowRight') || api.input.wasPressed('KeyD')) setInput(st, RIGHT);
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || st.over) return;
      keyDir();

      const livesBefore = st.lives;
      const scoreBefore = st.score;
      const wasClear = st.levelClear;
      step(st, dt);
      chomp += dt * (st.player.dir.x !== 0 || st.player.dir.y !== 0 ? 10 : 2);

      // efek makan helm: partikel kecil di posisi pemain
      if (st.score > prevScore) {
        const gained = st.score - scoreBefore;
        if (gained >= 200) {
          api.scores.add(px(st.player.x), py(st.player.y) - tile, `+${gained}`, { color: '#7dd3fc', size: 18 });
          api.sfx.chime(2);
          api.shake.add(0.25);
        } else if (gained >= 50) {
          api.sfx.pop(1.4);
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, '☕ KOPI TUBRUK! Klien setuju!', { size: 17, color: '#7dd3fc' });
        } else {
          api.sfx.pop(0.7 + Math.random() * 0.2);
        }
        prevScore = st.score;
      }
      if (st.lives < livesBefore) {
        prevLives = st.lives;
        deathT = 1.1;
        api.shake.add(0.7);
        api.sfx.fail();
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, '🚧 KETABRAK REVISI!', { size: 20, color: '#f87171' });
      }
      if (deathT > 0) deathT -= dt;
      if (st.levelClear && !wasClear) {
        levelToast = 2.2;
        api.sfx.chime(3);
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `🎉 LANTAI ${st.level} BERES!`, { size: 24, color: '#4ade80' });
        api.particles.spawn(api.W / 2, api.H * 0.5, {
          count: 50, colors: ['#4ade80', '#fde047', '#ffffff'],
          speed: [100, 380], life: [0.6, 1.1], size: [2, 6], gravity: 260, shape: 'rect', rotation: true,
        });
      }
      if (levelToast > 0) levelToast -= dt;
      push();
      if (st.over) endGame();
    });

    /* ---------------- render ---------------- */

    const drawMaze = (ctx: CanvasRenderingContext2D): void => {
      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          const t = tileAt(st.grid, x, y);
          const cx = px(x);
          const cy = py(y);
          if (t === T_WALL) {
            // beton + garis hazard
            const g = ctx.createLinearGradient(cx - tile / 2, cy - tile / 2, cx + tile / 2, cy + tile / 2);
            g.addColorStop(0, '#3a4a6e');
            g.addColorStop(1, '#1d2745');
            ctx.fillStyle = g;
            ctx.fillRect(cx - tile / 2, cy - tile / 2, tile, tile);
            // sambungan tetangga: hanya gambar hazard di tepi yang berbatasan jalan
            const open = (dx: number, dy: number): boolean => tileAt(st.grid, x + dx, y + dy) !== T_WALL;
            if (open(0, -1) || open(0, 1) || open(-1, 0) || open(1, 0)) {
              ctx.strokeStyle = 'rgba(251,191,36,0.5)';
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 4]);
              ctx.strokeRect(cx - tile / 2 + 2, cy - tile / 2 + 2, tile - 4, tile - 4);
              ctx.setLineDash([]);
            }
          } else if (t === T_DOT) {
            // helm proyek mini
            const r = tile * 0.16;
            ctx.fillStyle = '#fde047';
            ctx.beginPath(); ctx.arc(cx, cy - r * 0.3, r, Math.PI, 0); ctx.fill();
            ctx.fillRect(cx - r * 1.35, cy - r * 0.35, r * 2.7, r * 0.5);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.55, r * 0.3, 0, TAU); ctx.fill();
          } else if (t === T_PELLET) {
            // kopi tubruk
            const pulse = 1 + 0.12 * Math.sin(performance.now() / 240);
            const w = tile * 0.34 * pulse;
            const h = tile * 0.42 * pulse;
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(cx - w / 2, cy - h / 2, w, h * 0.85, 3);
            else ctx.rect(cx - w / 2, cy - h / 2, w, h * 0.85);
            ctx.fill();
            ctx.fillStyle = '#92400e';
            ctx.fillRect(cx - w / 2, cy - h * 0.05, w, h * 0.32);
            ctx.strokeStyle = 'rgba(146,64,14,0.6)';
            ctx.lineWidth = 1.5;
            for (let si = 0; si < 2; si += 1) {
              ctx.beginPath();
              ctx.moveTo(cx - 4 + si * 8, cy - h / 2 - 2);
              ctx.quadraticCurveTo(cx - 6 + si * 8, cy - h / 2 - 8, cx - 2 + si * 8, cy - h / 2 - 12);
              ctx.stroke();
            }
          } else if (t === T_DOOR) {
            ctx.fillStyle = '#0ea5e9';
            ctx.fillRect(cx - tile / 2, cy - 2, tile, 4);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = `800 ${Math.max(7, tile * 0.32)}px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('RAPAT', cx, cy - tile * 0.32);
          }
        }
      }
    };

    const drawMandor = (ctx: CanvasRenderingContext2D): void => {
      const p = st.player;
      const cx = px(p.x);
      const cy = py(p.y);
      const r = tile * 0.62;
      let scale = 1;
      let alpha = 1;
      if (deathT > 0) {
        const k = deathT / 1.1;
        scale = 0.3 + 0.7 * k;
        alpha = k;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.rotate((1 - k) * 6);
        ctx.translate(-cx, -cy);
      }
      const mouth = Math.abs(Math.sin(chomp)) * 0.55;
      // badan kuning
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r * scale, mouth, TAU - mouth);
      ctx.closePath();
      ctx.fill();
      // helm proyek di atas
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      const hg = ctx.createLinearGradient(0, -r, 0, -r * 0.3);
      hg.addColorStop(0, '#fef08a');
      hg.addColorStop(1, '#eab308');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.62, Math.PI * 1.02, -Math.PI * 0.02); ctx.fill();
      ctx.fillRect(-r * 0.78, -r * 0.22, r * 1.56, r * 0.16);
      // mata
      ctx.fillStyle = '#1f2937';
      const lookX = p.dir.x * 2;
      const lookY = p.dir.y * 2;
      ctx.beginPath(); ctx.arc(-r * 0.22 + lookX, -r * 0.05 + lookY, r * 0.11, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.28 + lookX, -r * 0.05 + lookY, r * 0.11, 0, TAU); ctx.fill();
      ctx.restore();
      if (deathT > 0) ctx.restore();
      void alpha;
    };

    const drawGhost = (ctx: CanvasRenderingContext2D, g: GhostInfo): void => {
      if (g.state === 'house' || g.state === 'exit') {
        // di ruang rapat: gambar mini
        const cx = px(g.x);
        const cy = py(g.y);
        ctx.globalAlpha = 0.85;
        ctx.font = `${tile * 0.7}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👔', cx, cy);
        ctx.globalAlpha = 1;
        return;
      }
      const cx = px(g.x);
      const cy = py(g.y);
      const r = tile * 0.58;
      const frightened = st.frightT > 0;
      const flash = frightened && st.frightT < 2 && Math.floor(performance.now() / 200) % 2 === 0;
      const bodyColor = g.state === 'eaten' ? null : frightened ? (flash ? '#f8fafc' : '#3b82f6') : g.color;
      const bob = Math.sin(performance.now() / 280 + cx) * tile * 0.04;
      ctx.save();
      ctx.translate(cx, cy + bob);
      if (bodyColor) {
        const gg = ctx.createLinearGradient(0, -r, 0, r);
        gg.addColorStop(0, bodyColor);
        gg.addColorStop(1, shade(bodyColor, -30));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(0, -r * 0.1, r * 0.85, Math.PI, 0);
        const waves = 4;
        const w0 = -r * 0.85;
        ctx.lineTo(r * 0.85, r * 0.55);
        for (let i = 0; i < waves; i += 1) {
          const x1 = r * 0.85 - ((i + 0.5) / waves) * r * 1.7;
          const x2 = r * 0.85 - ((i + 1) / waves) * r * 1.7;
          ctx.quadraticCurveTo(x1, r * 0.85, x2, r * 0.55);
        }
        ctx.closePath();
        ctx.fill();
        // dasi klien
        if (!frightened) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(-r * 0.16, r * 0.05); ctx.lineTo(r * 0.16, r * 0.05); ctx.lineTo(0, r * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(-r * 0.05, r * 0.02, r * 0.1, r * 0.3);
        }
      }
      // mata
      const lookX = clamp(g.dir.x * 3, -3, 3);
      const lookY = clamp(g.dir.y * 3, -3, 3);
      if (frightened && g.state !== 'eaten') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.2, r * 0.16, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.2, r * 0.16, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, r * 0.12, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      } else {
        for (const ex of [-0.3, 0.3]) {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(ex * r + lookX, -r * 0.22 + lookY, r * 0.2, r * 0.26, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = g.state === 'eaten' ? '#3b82f6' : '#dc2626';
          ctx.beginPath(); ctx.arc(ex * r + lookX * 1.6, -r * 0.2 + lookY * 1.6, r * 0.1, 0, TAU); ctx.fill();
        }
        if (g.state !== 'eaten') {
          // alis marah (klien revisi!)
          ctx.strokeStyle = 'rgba(0,0,0,0.65)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.52); ctx.lineTo(-r * 0.12, -r * 0.38); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.52); ctx.lineTo(r * 0.12, -r * 0.38); ctx.stroke();
        }
      }
      ctx.restore();
      // label nama kecil
      if (!frightened && g.state === 'active') {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = `700 ${Math.max(7, tile * 0.26)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(GHOST_LABEL[g.kind], cx, cy + r + tile * 0.28);
      }
      if (frightened && g.state === 'active') {
        ctx.fillStyle = '#bfdbfe';
        ctx.font = `800 ${Math.max(7, tile * 0.26)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('SETUJU 👍', cx, cy + r + tile * 0.28);
      }
    };

    const shade = (hex: string, amt: number): string => {
      const n = parseInt(hex.slice(1), 16);
      const r = clamp(((n >> 16) & 255) + amt, 0, 255);
      const g = clamp(((n >> 8) & 255) + amt, 0, 255);
      const b = clamp((n & 255) + amt, 0, 255);
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#101a33');
      bg.addColorStop(1, '#0a0f22');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // judul area
      ctx.fillStyle = 'rgba(186,205,235,0.55)';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏗️ SITE PLAN — MAKAN SEMUA HELM, HINDARI KLIEN!', W / 2, oy - 26);
      // kopi tubruk aktif: border biru berdenyut
      if (st.frightT > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(59,130,246,${0.4 + 0.3 * Math.sin(performance.now() / 200)})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(ox - 6, oy - 6, tile * COLS + 12, tile * ROWS + 12);
        ctx.restore();
      }
      drawMaze(ctx);
      for (const g of st.ghosts) drawGhost(ctx, g);
      if (!(st.over && st.lives <= 0)) drawMandor(ctx);
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(5,8,20,0.5)');
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
    background: 'rgba(10,16,34,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600, overflow: 'hidden', borderRadius: 18, background: '#0a0f22', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,16,34,0.62)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>
            {'🪖'.repeat(Math.max(0, hud.lives))}<span style={{ opacity: 0.6 }}>{'🪖'.repeat(Math.max(0, 3 - hud.lives))}</span>
            <span style={{ opacity: 0.8, marginLeft: 8 }}>Lt.{hud.level}</span>
          </div>
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>Terbaik: <b>{hud.best.toLocaleString('id-ID')}</b></div>
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
          <div style={{ fontSize: 42 }}>👷</div>
          <h2 style={h2}>PAK MANDOR</h2>
          <p style={p}>
            <b>Geser layar / tombol panah</b> untuk menggerakkan Pak Mandor.
            Makan semua <b>🪖 helm</b>! Hindari para <b>Klien Revisi</b> 👔 —
            tapi rebut <b>☕ Kopi Tubruk</b> agar mereka <i>setuju</i> dan bisa dimakan!
          </p>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.9, margin: '6px 0' }}>
            🔴 Revisi Denah • 🌸 Revisi RAB<br />🔵 Revisi Desain • 🟠 Revisi Spek
          </div>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Keliling Site</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Mandor ngopi dulu. Klien ikut nunggu.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>📋</div>
          <h2 style={h2}>KLIEN MENANG</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <p style={p}>Lantai {hud.level} • Terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>
          <button style={primaryBtn} onClick={startGame}>Coba Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#dbe7ff' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#93b4e8', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,28,0.68)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#24345c,#101a36)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
