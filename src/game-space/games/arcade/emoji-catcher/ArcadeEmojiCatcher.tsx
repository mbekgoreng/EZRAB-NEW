/**
 * ArcadeEmojiCatcher ("Tangkap Helm") — tangkap helm & APD jatuh dengan
 * keranjang proyek, hindari bata yang jatuh dari lantai atas.
 * Level naik tiap 12 tangkapan: makin cepat & makin banyak bata.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  spawnItem, hitsBasket, isMissed, levelFor, spawnInterval, pointsFor,
  progressInLevel, catchesToNextLevel, levelProgressFraction, CATCHES_PER_LEVEL,
  MAX_LIVES, type FallingItem,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('emoji-catcher', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  items: FallingItem[];
  basketX: number;
  targetX: number;
  score: number;
  lives: number;
  caught: number;
  level: number;
  spawnT: number;
  over: boolean;
  flash: number; // red flash timer saat kena bom
  clouds: { x: number; y: number; s: number; v: number }[];
  t: number;
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export default function ArcadeEmojiCatcher({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, lives: MAX_LIVES, level: 1, caught: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      items: [],
      basketX: api.W / 2,
      targetX: api.W / 2,
      score: 0,
      lives: MAX_LIVES,
      caught: 0,
      level: 1,
      spawnT: 0,
      over: false,
      flash: 0,
      clouds: Array.from({ length: 5 }, (_, i) => ({
        x: (i * 97) % 420, y: 30 + (i * 53) % 160, s: 0.6 + (i % 3) * 0.35, v: 8 + (i % 3) * 6,
      })),
      t: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, lives: s.lives, level: s.level, caught: s.caught, best: getBest(BK, 0) });
    };

    const reset = (): void => {
      s.items = [];
      s.basketX = api.W / 2;
      s.targetX = api.W / 2;
      s.score = 0;
      s.lives = MAX_LIVES;
      s.caught = 0;
      s.level = 1;
      s.spawnT = 0;
      s.over = false;
      s.flash = 0;
      push();
    };

    const gameOver = (): void => {
      s.over = true;
      const nb = setBest(BK, s.score);
      api.sfx.fail();
      api.shake.add(0.6);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'GAME OVER', { size: 34, color: '#f87171' });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, lives: 0, level: s.level, caught: s.caught, best: nb });
        setScreen('over');
      }, 1200);
    };

    const catchItem = (it: FallingItem, bx: number, bw: number, by: number, bh: number): void => {
      if (it.kind === 'bata') {
        s.lives -= 1;
        s.flash = 0.45;
        api.sfx.thud(1);
        api.shake.add(0.55);
        api.particles.spawn(it.x, it.y, {
          count: 26, colors: ['#f87171', '#ef4444', '#7f1d1d', '#fbbf24'],
          speed: [120, 380], life: [0.4, 0.9], size: [3, 7], gravity: 500, shape: 'rect', rotation: true,
        });
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, 'Kena bata! -1 nyawa', { size: 22, color: '#f87171' });
        if (s.lives <= 0) gameOver();
        else push();
        return;
      }
      const pts = pointsFor(it.kind);
      s.score += pts;
      s.caught += 1;
      const nl = levelFor(s.caught);
      api.sfx.pop(it.kind === 'bonus' ? 1.6 : 1 + rng() * 0.2);
      api.particles.spawn(it.x, by - 10, {
        count: it.kind === 'bonus' ? 30 : 14,
        colors: it.kind === 'bonus' ? ['#fde047', '#fbbf24', '#fff7d6'] : ['#bae6fd', '#7dd3fc', '#ffffff'],
        speed: [60, 260], life: [0.35, 0.8], size: [2, 5], gravity: 350, shape: 'spark',
      });
      api.scores.add(it.x, by - 40, `+${pts}`, { color: it.kind === 'bonus' ? '#fde047' : '#e0f2fe', size: it.kind === 'bonus' ? 24 : 18 });
      if (nl !== s.level) {
        s.level = nl;
        api.sfx.chime(3);
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `LEVEL ${nl}!`, { size: 30, color: '#fde047' });
      }
      push();
      void bx; void bw; void bh;
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      s.targetX = clamp(p.x, 50, api.W - 50);
    };
    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.over) return;
      s.targetX = clamp(p.x, 50, api.W - 50);
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.over) return;
      s.t += dt;
      if (s.flash > 0) s.flash -= dt;

      // keyboard
      const kbd = 320 * dt;
      if (api.input.down('ArrowLeft') || api.input.down('a')) s.targetX = clamp(s.targetX - kbd, 50, api.W - 50);
      if (api.input.down('ArrowRight') || api.input.down('d')) s.targetX = clamp(s.targetX + kbd, 50, api.W - 50);
      // basket easing menuju target
      s.basketX += (s.targetX - s.basketX) * Math.min(1, dt * 14);

      // spawn
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = spawnInterval(s.level) * (0.75 + rng() * 0.5);
        s.items.push(spawnItem(rng, s.level, api.W, -34, nowMs()));
      }

      const basketY = api.H - 92;
      const basketW = 96;
      const basketH = 56;
      const next: FallingItem[] = [];
      for (const it of s.items) {
        it.y += it.vy * dt;
        it.x += Math.sin(s.t * 3 + it.wobble) * 22 * dt;
        if (hitsBasket(it, s.basketX, basketW, basketY, basketH)) {
          catchItem(it, s.basketX, basketW, basketY, basketH);
        } else if (isMissed(it, api.H)) {
          // buah jatuh = combo putus (tidak ada penalti nyawa), bom jatuh = lega
          if (it.kind === 'bata') {
            api.scores.add(it.x, api.H - 130, 'Untung lolos!', { color: '#94a3b8', size: 14 });
          }
        } else {
          next.push(it);
        }
      }
      s.items = next;

      // awan
      for (const c of s.clouds) {
        c.x += c.v * dt;
        if (c.x - 70 * c.s > api.W) c.x = -70 * c.s;
      }
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#7dd3fc');
      sky.addColorStop(0.55, '#bae6fd');
      sky.addColorStop(0.78, '#fef9c3');
      sky.addColorStop(1, '#86efac');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // matahari
      const sx = W - 64; const sy = 76;
      const sun = ctx.createRadialGradient(sx, sy, 8, sx, sy, 60);
      sun.addColorStop(0, 'rgba(254,240,138,0.95)');
      sun.addColorStop(0.4, 'rgba(253,224,71,0.55)');
      sun.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = sun;
      ctx.beginPath(); ctx.arc(sx, sy, 60, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath(); ctx.arc(sx, sy, 26, 0, TAU); ctx.fill();
      // awan berlapis
      for (const c of s.clouds) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        const { x, y } = c; const k = c.s;
        ctx.beginPath();
        ctx.arc(x, y, 22 * k, 0, TAU);
        ctx.arc(x + 20 * k, y - 8 * k, 26 * k, 0, TAU);
        ctx.arc(x + 44 * k, y, 20 * k, 0, TAU);
        ctx.arc(x + 22 * k, y + 8 * k, 24 * k, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.ellipse(x + 22 * k, y + 12 * k, 34 * k, 10 * k, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // bukit jauh & dekat
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.ellipse(W * 0.15, H - 60, W * 0.5, 130, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(W * 0.9, H - 40, W * 0.55, 110, 0, Math.PI, TAU);
      ctx.fill();
      // tanah
      const g = ctx.createLinearGradient(0, H - 110, 0, H);
      g.addColorStop(0, '#65a30d');
      g.addColorStop(1, '#3f6212');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 110, W, 110);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, H - 110, W, 4);
      // rumput: segitiga kecil deterministik
      ctx.fillStyle = 'rgba(30,80,20,0.5)';
      for (let i = 0; i < 26; i += 1) {
        const gx = ((i * 53 + 11) % W);
        const gy = H - 100 + ((i * 29) % 90);
        const gh = 6 + (i % 3) * 3;
        ctx.beginPath();
        ctx.moveTo(gx, gy); ctx.lineTo(gx + 3, gy - gh); ctx.lineTo(gx + 6, gy);
        ctx.closePath(); ctx.fill();
      }
    };

    /* ---- Gambar prosedural item jatuh (Gelombang 5) ----
     * kind 'helm' -> APD per variant: 0 helm kuning, 1 rompi, 2 sarung
     * tangan, 3 sepatu boot, 4 palu. kind 'bonus' -> 0 bintang proyek,
     * 1 medali mandor. kind 'bata' -> bata merah prosedural. */
    const drawFallingItem = (ctx: CanvasRenderingContext2D, it: FallingItem, R: number): void => {
      ctx.save();
      ctx.translate(it.x, it.y);
      if (it.kind === 'bata') {
        // bata: balok merah bata + garis nat + bintik + retakan
        const w = R * 2; const h = R * 1.15;
        const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        g.addColorStop(0, '#dc2626'); g.addColorStop(0.55, '#b91c1c'); g.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 3); ctx.fill();
        ctx.strokeStyle = '#450a0a'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.strokeStyle = 'rgba(69,10,10,0.65)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-w / 2 + 3, 0); ctx.lineTo(w / 2 - 3, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -h / 2 + 2); ctx.lineTo(0, -1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w * 0.22, 1); ctx.lineTo(-w * 0.22, h / 2 - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * 0.26, 1); ctx.lineTo(w * 0.26, h / 2 - 2); ctx.stroke();
        // retakan peringatan
        ctx.strokeStyle = 'rgba(254,226,226,0.85)'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(w * 0.18, -h / 2 + 2); ctx.lineTo(w * 0.08, -h * 0.1);
        ctx.lineTo(w * 0.2, h * 0.18); ctx.lineTo(w * 0.12, h / 2 - 3);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-w / 2 + 3, -h / 2 + 2, w * 0.5, 3);
      } else if (it.kind === 'bonus' && it.variant === 1) {
        // medali mandor: pita biru-merah + lingkaran emas
        ctx.fillStyle = '#2563EB';
        ctx.beginPath();
        ctx.moveTo(-R * 0.5, -R); ctx.lineTo(-R * 0.08, -R); ctx.lineTo(-R * 0.2, -R * 0.25); ctx.lineTo(-R * 0.62, -R * 0.25);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(R * 0.5, -R); ctx.lineTo(R * 0.08, -R); ctx.lineTo(R * 0.2, -R * 0.25); ctx.lineTo(R * 0.62, -R * 0.25);
        ctx.closePath(); ctx.fill();
        const g = ctx.createRadialGradient(-R * 0.25, -R * 0.1, 2, 0, R * 0.2, R * 0.95);
        g.addColorStop(0, '#fef9c3'); g.addColorStop(0.55, '#fbbf24'); g.addColorStop(1, '#b45309');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, R * 0.22, R * 0.72, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#92400e';
        ctx.font = `900 ${Math.round(R * 0.8)}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('1', 0, R * 0.26);
      } else if (it.kind === 'bonus') {
        // bintang proyek emas (poligon 5 titik)
        const g = ctx.createLinearGradient(0, -R, 0, R);
        g.addColorStop(0, '#fef08a'); g.addColorStop(0.55, '#facc15'); g.addColorStop(1, '#d97706');
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 10; i += 1) {
          const rr = i % 2 === 0 ? R : R * 0.45;
          const a = -Math.PI / 2 + (i / 10) * TAU;
          const px = Math.cos(a) * rr; const py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(-R * 0.22, -R * 0.34, R * 0.2, R * 0.09, -0.5, 0, TAU); ctx.fill();
      } else if (it.variant === 1) {
        // rompi keselamatan oranye + garis reflektif perak
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.moveTo(-R * 0.34, -R);
        ctx.lineTo(-R * 0.78, -R * 0.72); ctx.lineTo(-R * 0.72, R * 0.95);
        ctx.lineTo(R * 0.72, R * 0.95);
        ctx.lineTo(R * 0.78, -R * 0.72); ctx.lineTo(R * 0.34, -R);
        ctx.quadraticCurveTo(0, -R * 0.55, -R * 0.34, -R);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(-R * 0.73, -R * 0.05, R * 1.46, R * 0.2);
        ctx.fillRect(-R * 0.72, R * 0.5, R * 1.44, R * 0.2);
        ctx.fillStyle = 'rgba(124,45,18,0.8)';
        ctx.fillRect(-R * 0.06, -R * 0.5, R * 0.12, R * 1.45);
      } else if (it.variant === 2) {
        // sarung tangan kerja: telapak + ibu jari + 3 garis jari
        const g = ctx.createLinearGradient(-R, 0, R, 0);
        g.addColorStop(0, '#fbbf24'); g.addColorStop(1, '#d97706');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(-R * 0.62, -R * 0.72, R * 1.15, R * 1.5, R * 0.42); ctx.fill();
        ctx.beginPath(); ctx.ellipse(R * 0.62, R * 0.08, R * 0.3, R * 0.44, 0.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.roundRect(-R * 0.62, -R * 0.72, R * 1.15, R * 1.5, R * 0.42); ctx.stroke();
        ctx.beginPath();
        for (const fx of [-R * 0.3, 0, R * 0.3]) { ctx.moveTo(fx, -R * 0.7); ctx.lineTo(fx, -R * 0.18); }
        ctx.stroke();
        ctx.fillStyle = '#2563EB';
        ctx.fillRect(-R * 0.62, R * 0.52, R * 1.15, R * 0.26);
      } else if (it.variant === 3) {
        // sepatu boot keselamatan: profil L + sol + ujung baja
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.moveTo(-R * 0.55, -R * 0.95);
        ctx.lineTo(R * 0.18, -R * 0.95); ctx.lineTo(R * 0.18, R * 0.28);
        ctx.lineTo(R * 0.88, R * 0.42); ctx.lineTo(R * 0.88, R * 0.8);
        ctx.lineTo(-R * 0.55, R * 0.8);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#451a03'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath(); ctx.ellipse(R * 0.62, R * 0.55, R * 0.28, R * 0.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(-R * 0.62, R * 0.8, R * 1.58, R * 0.18);
        ctx.strokeStyle = 'rgba(254,243,199,0.8)'; ctx.lineWidth = 1.4;
        for (const ly of [-R * 0.45, -R * 0.15]) {
          ctx.beginPath(); ctx.moveTo(-R * 0.4, ly); ctx.lineTo(R * 0.05, ly); ctx.stroke();
        }
      } else if (it.variant === 4) {
        // palu kecil: gagang kayu + kepala baja
        ctx.save();
        ctx.rotate(0.6);
        const hg = ctx.createLinearGradient(-R * 0.14, 0, R * 0.14, 0);
        hg.addColorStop(0, '#92400e'); hg.addColorStop(0.5, '#d97706'); hg.addColorStop(1, '#78350f');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.roundRect(-R * 0.14, -R * 0.3, R * 0.28, R * 1.25, R * 0.12); ctx.fill();
        const mg = ctx.createLinearGradient(-R, 0, R, 0);
        mg.addColorStop(0, '#e5e7eb'); mg.addColorStop(0.5, '#9ca3af'); mg.addColorStop(1, '#4b5563');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.roundRect(-R * 0.92, -R * 0.95, R * 1.84, R * 0.66, R * 0.16); ctx.fill();
        ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(-R * 0.92, -R * 0.95, R * 1.84, R * 0.18);
        ctx.restore();
      } else {
        // helm proyek kuning #F5B301: kubah + brim + rusuk tengah + tali dagu
        const g = ctx.createLinearGradient(0, -R, 0, R * 0.4);
        g.addColorStop(0, '#fcd34d'); g.addColorStop(0.6, '#F5B301'); g.addColorStop(1, '#d97706');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, R * 0.18, R * 0.82, Math.PI, TAU);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.6; ctx.stroke();
        // rusuk tengah helm
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.roundRect(-R * 0.14, -R * 0.78, R * 0.28, R * 0.62, R * 0.1); ctx.fill();
        ctx.strokeStyle = 'rgba(146,64,14,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
        // brim
        const bg = ctx.createLinearGradient(0, 0, 0, R * 0.3);
        bg.addColorStop(0, '#fbbf24'); bg.addColorStop(1, '#b45309');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.roundRect(-R * 1.02, R * 0.1, R * 2.04, R * 0.26, R * 0.12); ctx.fill();
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.6; ctx.stroke();
        // tali dagu + kilau
        ctx.strokeStyle = '#0A2540'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-R * 0.55, R * 0.36); ctx.quadraticCurveTo(0, R * 0.72, R * 0.55, R * 0.36); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.ellipse(-R * 0.42, -R * 0.34, R * 0.26, R * 0.11, -0.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    };

    const drawBasket = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
      const w = 96; const h = 52;
      ctx.save();
      // bayangan
      ctx.fillStyle = 'rgba(20,40,20,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y + h / 2 + 8, w * 0.55, 10, 0, 0, TAU);
      ctx.fill();
      // badan keranjang (anyaman)
      const body = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
      body.addColorStop(0, '#d97706');
      body.addColorStop(0.5, '#b45309');
      body.addColorStop(1, '#92400e');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h / 2);
      ctx.lineTo(x + w / 2, y - h / 2);
      ctx.lineTo(x + w / 2 - 10, y + h / 2);
      ctx.lineTo(x - w / 2 + 10, y + h / 2);
      ctx.closePath();
      ctx.fill();
      // anyaman horizontal
      ctx.strokeStyle = 'rgba(60,30,5,0.55)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i += 1) {
        const yy = y - h / 2 + (h / 4) * i;
        const inset = 10 * (i / 4);
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + inset, yy);
        ctx.lineTo(x + w / 2 - inset, yy);
        ctx.stroke();
      }
      // bibir keranjang
      const rim = ctx.createLinearGradient(0, y - h / 2 - 10, 0, y - h / 2 + 10);
      rim.addColorStop(0, '#fbbf24');
      rim.addColorStop(1, '#b45309');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.ellipse(x, y - h / 2, w / 2 + 4, 12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,30,5,0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y - h / 2, w / 2 - 6, 7, 0, 0, TAU);
      ctx.fill();
      // gloss
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(x - w * 0.22, y - h / 2 - 2, 16, 4, -0.3, 0, TAU);
      ctx.fill();
      // troli material: gagang dorong baja + dua roda (Gelombang 5)
      ctx.strokeStyle = '#0A2540';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 12, y - h / 2 + 6); ctx.lineTo(x - w / 2 - 10, y - h / 2 - 14);
      ctx.moveTo(x + w / 2 - 12, y - h / 2 + 6); ctx.lineTo(x + w / 2 + 10, y - h / 2 - 14);
      ctx.stroke();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 - 12, y - h / 2 - 15); ctx.lineTo(x + w / 2 + 12, y - h / 2 - 15);
      ctx.stroke();
      for (const wx of [x - w * 0.3, x + w * 0.3]) {
        ctx.fillStyle = '#1f2937';
        ctx.beginPath(); ctx.arc(wx, y + h / 2 + 7, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath(); ctx.arc(wx, y + h / 2 + 7, 3.6, 0, TAU); ctx.fill();
      }
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      const basketY = H - 92;
      // item jatuh — digambar prosedural per kind+variant (bukan emoji)
      for (const it of s.items) {
        const pulse = 1 + Math.sin(s.t * 6 + it.wobble) * 0.06;
        const R = it.r * 1.25 * pulse;
        ctx.save();
        if (it.kind === 'bonus') {
          ctx.shadowColor = 'rgba(253,224,71,0.9)';
          ctx.shadowBlur = 18;
        } else if (it.kind === 'bata') {
          // bata berkedip sebagai peringatan bahaya
          ctx.globalAlpha = Math.sin(s.t * 10 + it.wobble) > 0 ? 1 : 0.82;
        }
        drawFallingItem(ctx, it, R);
        ctx.restore();
      }
      drawBasket(ctx, s.basketX, basketY);
      ctx.restore();
      // flash merah saat kena bom
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(220,38,38,${clamp(s.flash * 1.4, 0, 0.45)})`;
        ctx.fillRect(0, 0, W, H);
      }
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,25,15,0.30)');
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
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(20,50,30,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#7dd3fc', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(20,50,30,0.6)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 168 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fef08a' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, opacity: 0.95 }}>
            Nyawa{' '}
            {Array.from({ length: MAX_LIVES }, (_, i) => (
              <span key={i} style={{ color: i < hud.lives ? '#f87171' : 'rgba(255,255,255,0.35)', fontSize: 14 }}>{'\u25CF'}</span>
            ))}{' '}• Lv {hud.level}
          </div>
          <div style={{ marginTop: 5 }}>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${levelProgressFraction(hud.caught) * 100}%`, background: 'linear-gradient(90deg,#fde047,#f59e0b)', borderRadius: 999 }} />
            </div>
            <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>
              Progres level: {progressInLevel(hud.caught)}/{CATCHES_PER_LEVEL} — {catchesToNextLevel(hud.caught)} lagi ke Lv {hud.level + 1}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? 'II' : '>'}</button>
          )}
          <button style={{ ...btn, fontSize: 11, fontWeight: 800 }} onClick={toggleMute} aria-label="Suara">{muted ? 'OFF' : 'ON'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">X</button>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: 'rgba(20,50,20,0.75)', fontWeight: 700, zIndex: 4, pointerEvents: 'none' }}>
        Geser untuk menggerakkan troli material — awas bata jatuh!
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#052e16', background: '#F5B301', borderRadius: 999, padding: '6px 14px', display: 'inline-block' }}>HELM PROYEK</div>
          <h2 style={h2}>TANGKAP HELM</h2>
          <p style={p}>
            <b>Geser</b> troli material untuk menangkap <b>helm & APD</b> yang jatuh dari
            lantai atas. <b>Hindari bata jatuh</b> — kena 3x permainan selesai!
            Bonus mandor (bintang/medali) = <b>50 poin</b>. Tiap {CATCHES_PER_LEVEL} tangkapan naik level.
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Menangkap</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#fef08a', letterSpacing: 4 }}>II</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Helm-nya ikut nunggu. Santai dulu, jangan sampai ketiban bata.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', background: '#b91c1c', borderRadius: 999, padding: '6px 14px', display: 'inline-block' }}>BATA JATUH</div>
          <h2 style={h2}>KETIBAN BATA!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fef08a' }}>{hud.score.toLocaleString('id-ID')}</div>
          <p style={p}>Level {hud.level} • Terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fef08a', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#f0fdf4' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#bbf7d0', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.3)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,30,18,0.6)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#14532d,#052e16)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
