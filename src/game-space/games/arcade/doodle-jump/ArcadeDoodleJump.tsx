/**
 * ArcadeDoodleJump ("Lompat Scaffolding") — pantulkan tukang setinggi mungkin
 * di atas perancah. Awas papan lapuk! Dongkrak = lantingan super.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, lerp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  createWorld, stepWorld, WORLD_W, zoneFor, platformStyleFor,
  type World, type Platform,
} from './logic';

/** Ikon helm proyek prosedural (SVG) — pengganti emoji di layar menu. */
function HelmIcon({ size = 40 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 15a8 8 0 0 1 6-7.8V5h4v2.2a8 8 0 0 1 6 7.8z" fill="#facc15" stroke="#a16207" strokeWidth="1.2" />
      <rect x="2" y="15" width="20" height="3" rx="1.5" fill="#eab308" stroke="#a16207" strokeWidth="1" />
    </svg>
  );
}

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('lompat-scaffolding', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  w: World;
  camY: number; // kamera render yang dihaluskan
  squash: number; // efek pantul
  tilt: number;
}

export default function ArcadeDoodleJump({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({
    score: 0, best: getBest(BK, 0),
    zoneName: 'Fondasi', zoneNext: 'Kolom · 150 m lagi', zoneProgress: 0,
  });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = { w: createWorld((Date.now() % 100000) | 0), camY: 0, squash: 0, tilt: 0 };
    let touchSide = 0; // -1 kiri, 1 kanan, 0 lepas

    const push = (): void => {
      const zp = zoneFor(s.w.score);
      api.pushHud({
        score: s.w.score, best: getBest(BK, 0),
        zoneName: zp.zone.name,
        zoneNext: zp.next ? `${zp.next.name} · ${zp.toNext} m lagi` : 'Zona teratas',
        zoneProgress: zp.progress,
      });
    };

    const reset = (): void => {
      s.w = createWorld((Date.now() % 100000) | 0, api.H);
      s.camY = 0;
      s.squash = 0;
      touchSide = 0;
      push();
    };

    const endGame = (): void => {
      const nb = setBest(BK, s.w.score);
      api.sfx.fail();
      api.shake.add(0.6);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'JATUH! Butuh safety harness!', { size: 22, color: '#f87171' });
      window.setTimeout(() => {
        const zp = zoneFor(s.w.score);
        api.pushHud({
          score: s.w.score, best: nb,
          zoneName: zp.zone.name,
          zoneNext: zp.next ? `${zp.next.name} · ${zp.toNext} m lagi` : 'Zona teratas',
          zoneProgress: zp.progress,
        });
        setScreen('over');
      }, 1100);
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.w.over) return;
      touchSide = p.x < api.W / 2 ? -1 : 1;
    };
    api.input.onUp = () => { touchSide = 0; };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.w.over) return;
      const input = {
        left: api.input.down('ArrowLeft') || api.input.down('KeyA') || touchSide < 0,
        right: api.input.down('ArrowRight') || api.input.down('KeyD') || touchSide > 0,
      };
      const ev = stepWorld(s.w, dt, input);
      s.camY = lerp(s.camY, s.w.cameraY, Math.min(1, dt * 8));
      s.squash = Math.max(0, s.squash - dt * 4);
      s.tilt = lerp(s.tilt, input.left ? -0.16 : input.right ? 0.16 : 0, Math.min(1, dt * 10));

      if (ev.bounced) {
        s.squash = 1;
        const sx = (ev.bounced.x / WORLD_W) * api.W;
        api.particles.spawn(sx, api.H - 90, {
          count: ev.super ? 22 : 8,
          colors: ['#d9a05b', '#a16207', '#fef3c7'],
          speed: [60, 220], life: [0.3, 0.6], size: [2, 4], gravity: 500, shape: 'rect', rotation: true,
        });
        if (ev.super) {
          api.shake.add(0.35);
          api.sfx.whoosh();
          api.scores.add(sx, api.H * 0.5, 'DONGKRAK!', { color: '#fde047', size: 22 });
        } else {
          api.sfx.pop(0.8 + Math.random() * 0.25);
        }
      }
      if (ev.broke) {
        const sx = (ev.broke.x / WORLD_W) * api.W;
        api.particles.spawn(sx, api.H - 100, {
          count: 16, colors: ['#78716c', '#57534e', '#a8a29e'],
          speed: [80, 300], life: [0.4, 0.8], size: [2, 5], gravity: 700, shape: 'rect', rotation: true,
        });
        api.sfx.crumble(1);
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, 'Papan lapuk patah!', { size: 15, color: '#fbbf24' });
      }
      if (ev.zoneUp) {
        // progresi ketinggian terukur: popup nama zona + meter saat zona naik
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `ZONA ${ev.zoneUp.name.toUpperCase()} — ${s.w.score} m!`, { size: 20, color: '#7dd3fc' });
        api.sfx.chime(2);
      }
      push();
      if (s.w.over) endGame();
    });

    /* ---------------- render ---------------- */

    const worldToScreen = (wx: number, wy: number, W: number, H: number): { x: number; y: number } => ({
      x: (wx / WORLD_W) * W,
      y: H - (wy - s.camY) - 96,
    });

    const drawPlatform = (ctx: CanvasRenderingContext2D, p: Platform, W: number, H: number): void => {
      if (p.broken) return;
      const { x, y } = worldToScreen(p.x, p.y, W, H);
      const wpx = (p.w / WORLD_W) * W;
      if (y < -40 || y > H + 40) return;
      const ph = Math.max(10, W * 0.028);
      // gaya dari deskriptor murni logic.ts — kokoh vs rapuh terbaca tanpa emoji
      const style = platformStyleFor(p);
      ctx.save();
      // papan lapuk digambar miring (sudah rapuh sebelum patah)
      if (style.tiltDeg !== 0) {
        ctx.translate(x + wpx / 2, y + ph / 2);
        ctx.rotate((style.tiltDeg * Math.PI) / 180);
        ctx.translate(-(x + wpx / 2), -(y + ph / 2));
      }
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      // tiang perancah (gerobak tidak bertiang — ia beroda)
      if (style.marking !== 'roda-baja') {
        ctx.strokeStyle = 'rgba(120,130,150,0.85)';
        ctx.lineWidth = Math.max(3, W * 0.012);
        const legL = x + 6;
        const legR = x + wpx - 6;
        ctx.beginPath();
        ctx.moveTo(legL, y + ph); ctx.lineTo(legL, y + ph + 34);
        ctx.moveTo(legR, y + ph); ctx.lineTo(legR, y + ph + 34);
        ctx.stroke();
      }
      // papan: gradasi per deskriptor + tepi rangka tegas di bawah
      const g = ctx.createLinearGradient(0, y, 0, y + ph);
      g.addColorStop(0, style.fill[0]);
      g.addColorStop(1, style.fill[1]);
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, wpx, ph, 5);
      else ctx.rect(x, y, wpx, ph);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = style.edge;
      ctx.fillRect(x + 2, y + ph - 3, wpx - 4, 3);
      // detail per marking (di-clip ke papan)
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, wpx, ph, 5);
      else ctx.rect(x, y, wpx, ph);
      ctx.clip();
      if (style.marking === 'retak') {
        // retakan bercabang + serpihan menggantung di tepi bawah
        ctx.strokeStyle = 'rgba(15,10,5,0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + wpx * 0.28, y);
        ctx.lineTo(x + wpx * 0.4, y + ph * 0.45); ctx.lineTo(x + wpx * 0.36, y + ph);
        ctx.moveTo(x + wpx * 0.4, y + ph * 0.45); ctx.lineTo(x + wpx * 0.58, y + ph * 0.6);
        ctx.moveTo(x + wpx * 0.66, y); ctx.lineTo(x + wpx * 0.58, y + ph * 0.6); ctx.lineTo(x + wpx * 0.63, y + ph);
        ctx.stroke();
        ctx.fillStyle = 'rgba(15,10,5,0.5)';
        ctx.beginPath();
        ctx.arc(x + wpx * 0.5, y + ph * 0.5, 2.2, 0, TAU);
        ctx.arc(x + wpx * 0.82, y + ph * 0.4, 1.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = style.fill[1];
        ctx.beginPath();
        ctx.moveTo(x + wpx * 0.12, y + ph); ctx.lineTo(x + wpx * 0.2, y + ph); ctx.lineTo(x + wpx * 0.15, y + ph + 6);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + wpx * 0.74, y + ph); ctx.lineTo(x + wpx * 0.84, y + ph); ctx.lineTo(x + wpx * 0.8, y + ph + 5);
        ctx.closePath(); ctx.fill();
      } else if (style.marking === 'roda-baja') {
        // pelat baja: rivet di sudut + chevron arah gerak
        ctx.fillStyle = 'rgba(15,23,42,0.55)';
        for (const rx of [x + 6, x + wpx - 6]) {
          for (const ry of [y + 3.5, y + ph - 3.5]) {
            ctx.beginPath(); ctx.arc(rx, ry, 1.8, 0, TAU); ctx.fill();
          }
        }
        const dir = p.vx >= 0 ? 1 : -1;
        ctx.strokeStyle = 'rgba(254,240,138,0.9)';
        ctx.lineWidth = 2;
        for (let cix = 0; cix < 2; cix += 1) {
          const cx0 = x + wpx / 2 + dir * (cix * 11 - 5);
          ctx.beginPath();
          ctx.moveTo(cx0 - dir * 4, y + 3);
          ctx.lineTo(cx0 + dir * 4, y + ph / 2);
          ctx.lineTo(cx0 - dir * 4, y + ph - 3);
          ctx.stroke();
        }
      } else if (style.marking === 'pegas') {
        // papan baja merah: rivet + garis las
        ctx.fillStyle = 'rgba(69,10,10,0.6)';
        for (const rx of [x + 6, x + wpx - 6]) {
          ctx.beginPath(); ctx.arc(rx, y + ph / 2, 1.8, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + ph * 0.5); ctx.lineTo(x + wpx - 4, y + ph * 0.5);
        ctx.stroke();
      } else {
        // serat kayu kokoh: serat melengkung + sambungan papan + paku
        ctx.strokeStyle = 'rgba(90,50,10,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + ph * 0.55);
        ctx.bezierCurveTo(x + wpx * 0.3, y + ph * 0.7, x + wpx * 0.6, y + ph * 0.4, x + wpx - 4, y + ph * 0.6);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,50,10,0.35)';
        ctx.beginPath();
        ctx.moveTo(x + wpx * 0.5, y + 1); ctx.lineTo(x + wpx * 0.5, y + ph - 1);
        ctx.stroke();
        ctx.fillStyle = 'rgba(60,35,5,0.7)';
        for (const nx of [x + 6, x + wpx - 6]) {
          ctx.beginPath(); ctx.arc(nx, y + ph / 2, 1.7, 0, TAU); ctx.fill();
        }
      }
      // kilau atas
      const gl = ctx.createLinearGradient(0, y, 0, y + ph * 0.5);
      gl.addColorStop(0, 'rgba(255,255,255,0.28)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x, y, wpx, ph * 0.5);
      ctx.restore();
      // di luar clip: roda gerobak / pegas dongkrak
      if (style.marking === 'roda-baja') {
        for (const wx of [x + wpx * 0.25, x + wpx * 0.75]) {
          ctx.fillStyle = '#1f2937';
          ctx.beginPath(); ctx.arc(wx, y + ph + 7, 7, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(wx - 5, y + ph + 7); ctx.lineTo(wx + 5, y + ph + 7);
          ctx.moveTo(wx, y + ph + 2); ctx.lineTo(wx, y + ph + 12);
          ctx.stroke();
          ctx.fillStyle = '#d1d5db';
          ctx.beginPath(); ctx.arc(wx, y + ph + 7, 2.2, 0, TAU); ctx.fill();
        }
      }
      if (style.marking === 'pegas') {
        // pegas koil zigzag di atas papan + pelat injak — lantingan super terbaca
        const jx = x + wpx / 2;
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(jx - 9, y);
        const coils = 4;
        for (let ci = 0; ci < coils; ci += 1) {
          ctx.lineTo(jx + 9, y - 4 - ci * 4);
          ctx.lineTo(jx - 9, y - 8 - ci * 4);
        }
        ctx.lineTo(jx + 9, y - 4 - coils * 4);
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(jx - 15, y - 22, 30, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(jx - 15, y - 22, 30, 2);
      }
      ctx.restore();
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const { x, y } = worldToScreen(s.w.px, s.w.py, W, H);
      const u = W / 400; // unit skala
      const sq = s.squash;
      const stretchY = 1 + sq * 0.25 - clamp(-s.w.vy / 1500, 0, 0.2);
      const squashX = 1 - sq * 0.18;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.tilt);
      ctx.scale(squashX, Math.max(0.6, stretchY));
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      // badan (wearpack oranye)
      const bg = ctx.createLinearGradient(0, -44 * u, 0, 0);
      bg.addColorStop(0, '#fb923c');
      bg.addColorStop(1, '#c2410c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-11 * u, -44 * u, 22 * u, 44 * u, 8 * u);
      else ctx.rect(-11 * u, -44 * u, 22 * u, 44 * u);
      ctx.fill();
      // rompi reflektor
      ctx.fillStyle = 'rgba(253,224,71,0.9)';
      ctx.fillRect(-11 * u, -32 * u, 22 * u, 5 * u);
      ctx.fillRect(-11 * u, -20 * u, 22 * u, 5 * u);
      // safety harness: dua tali menyilang navy + gesper perak di dada
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 3.2 * u;
      ctx.beginPath();
      ctx.moveTo(-9 * u, -42 * u); ctx.lineTo(9 * u, -13 * u);
      ctx.moveTo(9 * u, -42 * u); ctx.lineTo(-9 * u, -13 * u);
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-2.6 * u, -30 * u, 5.2 * u, 5.2 * u);
      // sepatu bot kerja yang menendang bergantian mengikuti irama lompatan
      const kick = Math.sin(performance.now() / 130) * 2.6 * u;
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-13 * u, -6.5 * u + Math.max(0, kick), 12 * u, 6.5 * u, 2.5 * u);
        ctx.roundRect(1 * u, -6.5 * u + Math.max(0, -kick), 12 * u, 6.5 * u, 2.5 * u);
      } else {
        ctx.rect(-13 * u, -6.5 * u, 12 * u, 6.5 * u);
        ctx.rect(1 * u, -6.5 * u, 12 * u, 6.5 * u);
      }
      ctx.fill();
      // kepala
      ctx.fillStyle = '#f2c79b';
      ctx.beginPath(); ctx.arc(0, -54 * u, 11 * u, 0, TAU); ctx.fill();
      // mata
      ctx.fillStyle = '#1f2937';
      const look = clamp(s.w.vx / 300, -1, 1) * 2.5 * u;
      ctx.beginPath(); ctx.arc(-4 * u + look, -55 * u, 1.8 * u, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4 * u + look, -55 * u, 1.8 * u, 0, TAU); ctx.fill();
      // helm kuning
      const hg = ctx.createLinearGradient(0, -78 * u, 0, -58 * u);
      hg.addColorStop(0, '#fde047');
      hg.addColorStop(1, '#d97706');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, -58 * u, 12.5 * u, Math.PI, 0); ctx.fill();
      ctx.fillRect(-15 * u, -60 * u, 30 * u, 4 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(-4 * u, -66 * u, 4 * u, 0, TAU); ctx.fill();
      // tangan
      ctx.fillStyle = '#f2c79b';
      const wave = Math.sin(performance.now() / 160) * 3 * u;
      ctx.beginPath(); ctx.arc(-14 * u, -36 * u, 5 * u, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(14 * u, -36 * u + wave, 5 * u, 0, TAU); ctx.fill();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      // langit mengikuti ZONA ketinggian yang sama dengan HUD (logic.zoneFor)
      const zp = zoneFor(s.w.score);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, zp.zone.sky[0]);
      bg.addColorStop(1, zp.zone.sky[1]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // matahari/bulan
      const night = zp.zone.night;
      ctx.save();
      ctx.globalAlpha = 0.9;
      const sunX = W * 0.8;
      const sunY = H * 0.16;
      const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 60);
      sg.addColorStop(0, night ? '#e0e7ff' : '#fef9c3');
      sg.addColorStop(1, 'rgba(254,249,195,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sunX, sunY, 60, 0, TAU); ctx.fill();
      ctx.restore();
      // bintang (malam)
      if (night) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 40; i += 1) {
          const sx = (i * 97) % W;
          const sy = (i * 61 + s.camY * 0.05) % H;
          ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(i * 3 + performance.now() / 900));
          ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      // gedung parallax (2 lapis)
      const drawBuildings = (par: number, color: string, baseH: number): void => {
        ctx.fillStyle = color;
        const off = (s.camY * par) % 240;
        for (let bx = -240; bx < W + 240; bx += 120) {
          const bh = baseH + ((Math.abs(Math.sin(bx * 12.9898) * 43758.5453) % 1) * baseH * 0.7);
          const x = bx - off;
          const yTop = H - ((s.camY * par * 0.35) % (H + 400)) - bh + 200;
          ctx.fillRect(x, yTop, 96, bh);
          // jendela
          ctx.fillStyle = night ? 'rgba(253,224,71,0.5)' : 'rgba(255,255,255,0.25)';
          for (let wy = yTop + 12; wy < yTop + bh - 8; wy += 18) {
            for (let wx = x + 10; wx < x + 86; wx += 20) {
              ctx.fillRect(wx, wy, 10, 8);
            }
          }
          ctx.fillStyle = color;
        }
      };
      drawBuildings(0.12, night ? 'rgba(20,24,60,0.85)' : 'rgba(100,116,139,0.5)', 220);
      drawBuildings(0.25, night ? 'rgba(12,15,40,0.95)' : 'rgba(71,85,105,0.65)', 150);
      // awan
      ctx.fillStyle = night ? 'rgba(60,70,120,0.5)' : 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 6; i += 1) {
        const cx = ((i * 173 + 40) % (W + 160)) - 80;
        const cy = ((i * 211 + s.camY * 0.4) % (H + 120)) - 60;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 46, 16, 0, 0, TAU);
        ctx.ellipse(cx + 30, cy + 4, 34, 13, 0, 0, TAU);
        ctx.fill();
      }
      // platform & pemain
      for (const p of s.w.platforms) drawPlatform(ctx, p, W, H);
      if (!s.w.over) drawPlayer(ctx, W, H);
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,10,30,0.4)');
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
    background: 'rgba(12,20,40,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600, overflow: 'hidden', borderRadius: 18, background: '#38bdf8', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(12,20,40,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')} m</div>
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.9 }}>
            Zona <b>{hud.zoneName}</b> · {hud.zoneNext}
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.25)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(hud.zoneProgress * 100)}%`, background: '#f5b301', borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>Terbaik: <b>{hud.best.toLocaleString('id-ID')} m</b></div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>
      {/* indikator sentuh kiri/kanan: segitiga CSS prosedural (bukan emoji) */}
      {screen === 'play' && (
        <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 18px', zIndex: 4, pointerEvents: 'none', opacity: 0.55 }}>
          <div style={{ width: 0, height: 0, borderTop: '14px solid transparent', borderBottom: '14px solid transparent', borderRight: '22px solid #fff' }} />
          <div style={{ width: 0, height: 0, borderTop: '14px solid transparent', borderBottom: '14px solid transparent', borderLeft: '22px solid #fff' }} />
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><HelmIcon size={42} /></div>
          <h2 style={h2}>LOMPAT SCAFFOLDING</h2>
          <p style={p}>
            <b>Tahan kiri / kanan layar</b> (atau tombol ← →) untuk bergerak.
            Pantulkan tukang dari perancah ke perancah setinggi mungkin!
            Awas <b>papan lapuk</b> (kusam, retak, miring — patah sekali injak),
            kejar <b>dongkrak merah berpegas</b> untuk lantingan super!
            Naiki zona <b>Fondasi → Kolom → Balok → Atap</b> (800 m).
          </p>
          {hud.best > 0 && <p style={p}>Rekor: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Memanjat</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Tukang istirahat ngopi dulu.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <h2 style={h2}>JATUH!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')} m</div>
          <p style={p}>Berhenti di zona <b>{hud.zoneName}</b> · Ketinggian terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')} m</b></p>
          <button style={primaryBtn} onClick={startGame}>Panjat Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0f2fe' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#bae6fd', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,20,40,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1e3a5f,#0d1c33)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
