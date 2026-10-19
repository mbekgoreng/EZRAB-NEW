/**
 * ArcadeTebasBambu ("Tebas Bambu") — swipe untuk menebas bambu, kayu & triplek
 * yang beterbangan dari bawah. JANGAN tebas dinamit! Helm emas = bonus.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  nextKind, spawnDelayAt, slicePoints, nextCombo, gradeFor,
  GAME_DURATION, MAX_LIVES, COMBO_WINDOW, KIND_META, type SliceKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tebas-bambu', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Item {
  id: number;
  kind: SliceKind;
  x: number; y: number;
  vx: number; vy: number;
  rot: number; vr: number;
  r: number;
  sliced: boolean;
}

interface Half { x: number; y: number; vx: number; vy: number; rot: number; vr: number; age: number; kind: SliceKind; side: number; }
interface SwipePt { x: number; y: number; t: number; }
interface Flash { age: number; }

interface S {
  items: Item[];
  halves: Half[];
  swipe: SwipePt[];
  spawnT: number;
  elapsed: number;
  score: number;
  lives: number;
  combo: number;
  lastSliceT: number;
  over: boolean;
  t: number;
  flash: Flash | null;
  nextId: number;
}

const KIND_COLORS: Record<SliceKind, string[]> = {
  bambu: ['#4ade80', '#16a34a', '#dcfce7'],
  kayu: ['#d6a05c', '#8a5a28', '#fef3c7'],
  triplek: ['#fbbf24', '#b45309', '#fef9c3'],
  emas: ['#fde047', '#f59e0b', '#fff7d6'],
  dinamit: ['#ef4444', '#7f1d1d', '#fecaca'],
};

export default function ArcadeTebasBambu({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, timeLeft: GAME_DURATION, lives: MAX_LIVES, combo: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      items: [], halves: [], swipe: [], spawnT: 0.5,
      elapsed: 0, score: 0, lives: MAX_LIVES, combo: 0, lastSliceT: -99,
      over: false, t: 0, flash: null, nextId: 1,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({
        score: s.score, timeLeft: Math.max(0, GAME_DURATION - s.elapsed),
        lives: s.lives, combo: s.combo, best: getBest(BK, 0),
      });
    };

    const reset = (): void => {
      s.items = []; s.halves = []; s.swipe = []; s.spawnT = 0.5;
      s.elapsed = 0; s.score = 0; s.lives = MAX_LIVES; s.combo = 0;
      s.lastSliceT = -99; s.over = false; s.flash = null;
      push();
    };

    const endGame = (reason: 'time' | 'boom'): void => {
      if (s.over) return;
      s.over = true;
      const nb = setBest(BK, s.score);
      if (reason === 'boom') sfx.crumble(1.2);
      else sfx.chime(3);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, reason === 'boom' ? '💥 MELEDAK!' : '⏱ WAKTU HABIS!', { size: 30, color: '#fde047' });
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 70, colors: ['#4ade80', '#fbbf24', '#fde047', '#dcfce7'],
        speed: [100, 400], life: [0.6, 1.2], size: [2, 6], gravity: 420, shape: 'rect', rotation: true,
      });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, timeLeft: 0, lives: s.lives, combo: s.combo, best: nb });
        setScreen('over');
      }, 1300);
    };

    const spawnItem = (): void => {
      const kind = nextKind(s.elapsed, rng);
      const r = kind === 'dinamit' ? 34 : kind === 'emas' ? 30 : 26 + rng() * 10;
      const x = 40 + rng() * (api.W - 80);
      const y = api.H + 50;
      const upV = api.H * (0.95 + rng() * 0.35);
      s.items.push({
        id: s.nextId++,
        kind, x, y,
        vx: (rng() - 0.5) * api.W * 0.5,
        vy: -upV,
        rot: rng() * TAU, vr: (rng() - 0.5) * 6,
        r, sliced: false,
      });
    };

    /** Jarak titik ke segmen garis (untuk deteksi tebasan). */
    const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
      const dx = bx - ax; const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = clamp(t, 0, 1);
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };

    const sliceItem = (it: Item): void => {
      it.sliced = true;
      const secsSince = s.t - s.lastSliceT;
      if (it.kind === 'dinamit') {
        // 💥 KABOOM
        s.lives -= 1;
        s.combo = 0;
        s.flash = { age: 0 };
        sfx.crumble(1.4);
        api.shake.add(0.85);
        api.particles.spawn(it.x, it.y, {
          count: 46, colors: ['#ef4444', '#f97316', '#fde047', '#7f1d1d'],
          speed: [120, 520], life: [0.4, 1], size: [3, 8], gravity: 300, shape: 'spark', rotation: true,
        });
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, '💥 DINAMIT! −1 nyawa', { size: 22, color: '#fca5a5' });
        if (s.lives <= 0) { endGame('boom'); return; }
        push();
        return;
      }
      s.combo = nextCombo(s.combo, secsSince);
      s.lastSliceT = s.t;
      const pts = slicePoints(it.kind, s.combo);
      s.score += pts;
      sfx.pop(it.kind === 'emas' ? 1.4 : 1);
      if (it.kind === 'emas') sfx.chime(2, 880);
      // belahan beterbangan
      const ang = Math.atan2(it.vy, it.vx);
      for (const side of [-1, 1]) {
        s.halves.push({
          x: it.x, y: it.y,
          vx: it.vx * 0.4 + Math.cos(ang + side * 1.2) * 160,
          vy: it.vy * 0.4 + Math.sin(ang + side * 1.2) * 160 - 60,
          rot: it.rot, vr: it.vr + side * 6,
          age: 0, kind: it.kind, side,
        });
      }
      api.particles.spawn(it.x, it.y, {
        count: it.kind === 'emas' ? 30 : 16,
        colors: KIND_COLORS[it.kind],
        speed: [80, 320], life: [0.3, 0.8], size: [2, 5], gravity: 700, shape: 'rect', rotation: true,
      });
      api.scores.add(it.x, it.y - 40, `+${pts}`, {
        color: it.kind === 'emas' ? '#fde047' : '#ffffff', size: it.kind === 'emas' ? 26 : 20,
      });
      if (s.combo >= 3) {
        const wrap = wrapRef.current;
        const mult = s.combo >= 6 ? 'x3' : 'x2';
        if (wrap && (s.combo === 3 || s.combo === 6 || s.combo % 10 === 0)) {
          popText(wrap, `⚡ KOMBO ${s.combo}! (${mult})`, { size: 22, color: '#fde047' });
        }
        if (s.combo % 5 === 0) sfx.chime(2, 760);
      }
      push();
    };

    const checkSlices = (): void => {
      if (s.swipe.length < 2) return;
      const a = s.swipe[s.swipe.length - 2];
      const b = s.swipe[s.swipe.length - 1];
      for (const it of s.items) {
        if (it.sliced) continue;
        if (segDist(it.x, it.y, a.x, a.y, b.x, b.y) < it.r + 6) {
          sliceItem(it);
          if (s.over) return;
        }
      }
      s.items = s.items.filter((i) => !i.sliced);
    };

    const recordSwipe = (p: { x: number; y: number }): void => {
      s.swipe.push({ x: p.x, y: p.y, t: s.t });
      if (s.swipe.length > 14) s.swipe.shift();
      checkSlices();
    };

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      s.swipe = [{ x: p.x, y: p.y, t: s.t }];
      sfx.whoosh();
    };
    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.over) return;
      recordSwipe(p);
    };
    api.input.onUp = () => {
      s.swipe = [];
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.over) return;
      s.t += dt;
      s.elapsed += dt;
      if (s.elapsed >= GAME_DURATION) { endGame('time'); return; }
      // kombo kedaluwarsa
      if (s.t - s.lastSliceT > COMBO_WINDOW && s.combo > 0) s.combo = 0;

      // spawn
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = spawnDelayAt(s.elapsed, rng);
        spawnItem();
      }
      // fisika item
      const grav = api.H * 1.35;
      for (const it of s.items) {
        it.vy += grav * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += it.vr * dt;
      }
      // item yang jatuh ke bawah hilang
      s.items = s.items.filter((it) => it.y < api.H + 90);
      // belahan
      for (const h of s.halves) {
        h.age += dt;
        h.vy += grav * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
      }
      s.halves = s.halves.filter((h) => h.age < 1.1 && h.y < api.H + 90);
      // swipe menua
      s.swipe = s.swipe.filter((p) => s.t - p.t < 0.18);
      if (s.flash) {
        s.flash.age += dt;
        if (s.flash.age > 0.35) s.flash = null;
      }
      push();
    });

    /* ---------------- rendering ---------------- */

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      // gudang material saat senja
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#7c2d12');
      g.addColorStop(0.45, '#9a3412');
      g.addColorStop(0.75, '#431407');
      g.addColorStop(1, '#1c0a03');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // matahari terbenam
      const sun = ctx.createRadialGradient(W * 0.78, H * 0.22, 4, W * 0.78, H * 0.22, 90);
      sun.addColorStop(0, 'rgba(253,224,71,0.9)');
      sun.addColorStop(0.4, 'rgba(251,146,60,0.45)');
      sun.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(W * 0.78 - 90, H * 0.22 - 90, 180, 180);
      // siluet gudang & crane
      ctx.fillStyle = 'rgba(28,10,3,0.85)';
      ctx.fillRect(0, H * 0.72, W * 0.42, H * 0.28);
      ctx.beginPath();
      ctx.moveTo(0, H * 0.72); ctx.lineTo(W * 0.21, H * 0.62); ctx.lineTo(W * 0.42, H * 0.72);
      ctx.closePath(); ctx.fill();
      // tower crane siluet
      ctx.strokeStyle = 'rgba(28,10,3,0.9)';
      ctx.lineWidth = 8;
      const cxp = W * 0.8;
      ctx.beginPath(); ctx.moveTo(cxp, H); ctx.lineTo(cxp, H * 0.18); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cxp - W * 0.22, H * 0.22); ctx.lineTo(cxp + W * 0.14, H * 0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxp - W * 0.06, H * 0.22); ctx.lineTo(cxp - W * 0.06, H * 0.34); ctx.stroke();
      // tumpukan bambu siluet kiri
      ctx.fillStyle = 'rgba(20,40,20,0.8)';
      for (let i = 0; i < 5; i += 1) {
        ctx.save();
        ctx.translate(20 + i * 12, H);
        ctx.rotate(-0.35);
        ctx.fillRect(-4, -H * 0.34, 8, H * 0.34);
        ctx.restore();
      }
    };

    const drawItem = (ctx: CanvasRenderingContext2D, it: Item): void => {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      const r = it.r;
      const cols = KIND_COLORS[it.kind];
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 6;
      if (it.kind === 'bambu') {
        // batang bambu beruas
        const w = r * 0.9;
        const bg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        bg.addColorStop(0, '#15803d');
        bg.addColorStop(0.45, cols[0]);
        bg.addColorStop(0.6, '#bbf7d0');
        bg.addColorStop(1, '#166534');
        ctx.fillStyle = bg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -r * 1.15, w, r * 2.3, w / 2);
        else ctx.rect(-w / 2, -r * 1.15, w, r * 2.3);
        ctx.fill();
        // ruas bambu
        ctx.strokeStyle = 'rgba(20,83,45,0.8)';
        ctx.lineWidth = 3;
        for (const yy of [-r * 0.55, 0, r * 0.55]) {
          ctx.beginPath(); ctx.moveTo(-w / 2, yy); ctx.lineTo(w / 2, yy); ctx.stroke();
        }
        // daun
        ctx.fillStyle = 'rgba(74,222,128,0.9)';
        ctx.beginPath();
        ctx.ellipse(w * 0.7, -r * 0.8, w * 0.5, w * 0.22, 0.6, 0, TAU);
        ctx.fill();
      } else if (it.kind === 'kayu') {
        // gelondongan kayu
        const w = r * 1.5;
        const bg = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
        bg.addColorStop(0, cols[0]);
        bg.addColorStop(0.5, '#b45309');
        bg.addColorStop(1, '#78350f');
        ctx.fillStyle = bg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -r * 0.7, w, r * 1.4, r * 0.5);
        else ctx.rect(-w / 2, -r * 0.7, w, r * 1.4);
        ctx.fill();
        // lingkaran tahun di ujung
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath(); ctx.ellipse(w / 2 - 2, 0, r * 0.32, r * 0.62, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.5;
        for (const rr of [0.5, 0.75]) {
          ctx.beginPath(); ctx.ellipse(w / 2 - 2, 0, r * 0.32 * rr, r * 0.62 * rr, 0, 0, TAU); ctx.stroke();
        }
      } else if (it.kind === 'triplek') {
        // lembaran triplek
        const w = r * 1.7; const h = r * 1.15;
        const bg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        bg.addColorStop(0, cols[2]);
        bg.addColorStop(0.5, cols[0]);
        bg.addColorStop(1, cols[1]);
        ctx.fillStyle = bg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -h / 2, w, h, 6);
        else ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,53,15,0.6)'; ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath(); ctx.moveTo(-w / 2 + 8, i * h * 0.28); ctx.lineTo(w / 2 - 8, i * h * 0.28); ctx.stroke();
        }
      } else if (it.kind === 'emas') {
        // helm emas
        if (true) {
          ctx.shadowColor = 'rgba(253,224,71,0.9)';
          ctx.shadowBlur = 22;
        }
        const hg = ctx.createLinearGradient(0, -r, 0, r * 0.4);
        hg.addColorStop(0, '#fef08a');
        hg.addColorStop(0.6, cols[0]);
        hg.addColorStop(1, '#b45309');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(0, r * 0.1, r * 0.95, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(-r * 1.02, r * 0.02, r * 2.04, r * 0.22);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-r * 0.14, -r * 1.02, r * 0.28, r * 0.55);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.3, r * 0.18, -0.5, 0, TAU); ctx.fill();
      } else {
        // dinamit
        if (true) {
          ctx.shadowColor = 'rgba(239,68,68,0.9)';
          ctx.shadowBlur = 22;
        }
        const bg = ctx.createLinearGradient(-r * 0.4, 0, r * 0.4, 0);
        bg.addColorStop(0, '#991b1b');
        bg.addColorStop(0.5, '#ef4444');
        bg.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = bg;
        const w = r * 0.8;
        for (const ox of [-w * 0.7, 0, w * 0.7]) {
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(ox - w * 0.3, -r * 0.9, w * 0.6, r * 1.8, 6);
          else ctx.rect(ox - w * 0.3, -r * 0.9, w * 0.6, r * 1.8);
          ctx.fill();
        }
        // sumbu + percikan
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.quadraticCurveTo(r * 0.4, -r * 1.3, r * 0.7, -r * 1.1); ctx.stroke();
        const sp = 4 + Math.sin(s.t * 25) * 2.5;
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(r * 0.7, -r * 1.1, sp, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.arc(r * 0.7, -r * 1.1, sp * 0.55, 0, TAU); ctx.fill();
        // label bahaya
        ctx.fillStyle = '#fecaca';
        ctx.font = `900 ${Math.floor(r * 0.5)}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('☠', 0, 0);
      }
      ctx.restore();
    };

    const drawHalf = (ctx: CanvasRenderingContext2D, h: Half): void => {
      ctx.save();
      ctx.globalAlpha = clamp(1 - h.age / 1.1, 0, 1);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      const r = 24;
      const cols = KIND_COLORS[h.kind];
      const g = ctx.createLinearGradient(-r, 0, r, 0);
      g.addColorStop(0, cols[1]);
      g.addColorStop(1, cols[0]);
      ctx.fillStyle = g;
      ctx.beginPath();
      if (h.side < 0) ctx.arc(0, 0, r * 0.9, Math.PI / 2, (3 * Math.PI) / 2);
      else ctx.arc(0, 0, r * 0.9, -Math.PI / 2, Math.PI / 2);
      ctx.closePath(); ctx.fill();
      // permukaan potongan segar
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(-2, -r * 0.9, 4, r * 1.8);
      ctx.restore();
    };

    const drawSwipe = (ctx: CanvasRenderingContext2D): void => {
      if (s.swipe.length < 2) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 1; i < s.swipe.length; i += 1) {
          const p0 = s.swipe[i - 1]; const p1 = s.swipe[i];
          const age = s.t - p1.t;
          const alpha = clamp(1 - age / 0.18, 0, 1);
          ctx.strokeStyle = pass === 0
            ? `rgba(253,224,71,${alpha * 0.9})`
            : `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = pass === 0 ? 14 : 5;
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
      }
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();

      drawBackground(ctx, W, H);
      for (const h of s.halves) drawHalf(ctx, h);
      for (const it of s.items) drawItem(ctx, it);
      drawSwipe(ctx);
      ctx.restore();
      // kombo meter di atas
      if (s.combo >= 2 && screenRef.current === 'play') {
        const frac = clamp((s.t - s.lastSliceT) / COMBO_WINDOW, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(W / 2 - 70, 64, 140, 10, 5);
        else ctx.rect(W / 2 - 70, 64, 140, 10);
        ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(W / 2 - 70, 64, 140 * (1 - frac), 10, 5);
        else ctx.rect(W / 2 - 70, 64, 140 * (1 - frac), 10);
        ctx.fill();
      }
      // flash ledakan
      if (s.flash) {
        const a = clamp(1 - s.flash.age / 0.35, 0, 1);
        ctx.fillStyle = `rgba(239,68,68,${a * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,4,2,0.45)');
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
    background: 'rgba(28,10,3,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const grade = gradeFor(hud.score);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#431407', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(28,10,3,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 132 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#4ade80' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.95 }}>
            {'❤️'.repeat(Math.max(0, hud.lives))}{'🖤'.repeat(Math.max(0, MAX_LIVES - hud.lives))}
            <span style={{ marginLeft: 6 }}>⏱ {Math.ceil(hud.timeLeft)}s</span>
          </div>
          {hud.combo >= 2 && <div style={{ fontSize: 12, color: '#fde047', fontWeight: 900 }}>⚡ KOMBO x{hud.combo}</div>}
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
          <div style={{ fontSize: 42 }}>🎋</div>
          <h2 style={h2}>TEBAS BAMBU</h2>
          <p style={p}>
            <b>Swipe / usap layar</b> untuk menebas bambu, kayu & triplek yang beterbangan.
            <b> JANGAN tebas dinamit</b> 🧨 (nyawa −1)! 🪖 <b>Helm emas</b> = bonus besar.
            Tebasan beruntun = <b>kombo</b>!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Menebas</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Pisaunya diasah dulu. Bambunya nunggu.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{grade === 'S' ? '🏆' : '🎋'}</div>
          <h2 style={h2}>SELESAI MENEBAS</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#4ade80' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Grade" value={grade} />
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Tebas Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#4ade80', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#fef3c7' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#4ade80,#16a34a)', color: '#052e16', boxShadow: '0 8px 20px rgba(22,163,74,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#4ade80', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,8,2,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#7c2d12,#1c0a03)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
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
