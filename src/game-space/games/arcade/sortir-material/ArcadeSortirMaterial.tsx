/**
 * ArcadeSortirMaterial ("Sortir Material") — material jatuh dari conveyor,
 * seret ke bin yang benar: BATA, KAYU, BESI. Salah bin atau lolos
 * = nyawa berkurang. Makin lama makin cepat! Streak 12 beruntun = nyawa +1.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  BINS, MAX_LIVES, fallSpeed, spawnInterval, spawnItem, sortResult,
  scoreFor, levelAt, lifeGainFor, type SortItem, type MatKind,
} from './logic';
import {
  drawMaterialSprite, preloadMaterialSprites, useSprite,
  MATERIAL_SPRITES, type MaterialSlug,
} from '../../../shared/materialSprites';

/** MatKind -> slug set ikon bersama; besi sortir digambar sebagai balok I. */
const SORTIR_SLUGS: Record<MatKind, MaterialSlug> = {
  bata: 'bata', kayu: 'kayu', besi: 'balok-besi',
};

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('sortir-material', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  items: SortItem[];
  dragId: number | null;
  dragDX: number;
  dragDY: number;
  spawnT: number;
  nextId: number;
  elapsed: number;
  score: number;
  streak: number;
  bestStreak: number;
  lives: number;
  sorted: number;
  level: number;
  over: boolean;
  t: number;
}

export default function ArcadeSortirMaterial({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, lives: MAX_LIVES, streak: 0, best: getBest(BK, 0), level: 1, bestStreak: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const binRect = (W: number, H: number, i: number): { x: number; y: number; w: number; h: number } => {
    const w = W / 3 - 14;
    const h = 108;
    const x = 7 + i * (W / 3);
    const y = H - h - 26;
    return { x, y, w, h };
  };
  const binAt = (W: number, H: number, px: number, py: number): number => {
    for (let i = 0; i < 3; i += 1) {
      const b = binRect(W, H, i);
      if (px >= b.x && px <= b.x + b.w && py >= b.y - 30 && py <= b.y + b.h) return i;
    }
    return -1;
  };
  const lanes = (W: number): number[] => [W * 0.2, W * 0.5, W * 0.8];

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    preloadMaterialSprites();
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      items: [], dragId: null, dragDX: 0, dragDY: 0, spawnT: 0.8, nextId: 1,
      elapsed: 0, score: 0, streak: 0, bestStreak: 0, lives: MAX_LIVES,
      sorted: 0, level: 1, over: false, t: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, lives: s.lives, streak: s.streak, best: getBest(BK, 0), level: s.level, bestStreak: s.bestStreak });
    };

    const reset = (): void => {
      s.items = []; s.dragId = null; s.spawnT = 0.8; s.nextId = 1;
      s.elapsed = 0; s.score = 0; s.streak = 0; s.bestStreak = 0;
      s.lives = MAX_LIVES; s.sorted = 0; s.level = 1; s.over = false;
      push();
    };

    const loseLife = (reason: string, x: number, y: number): void => {
      s.lives -= 1;
      s.streak = 0;
      sfx.fail();
      api.shake.add(0.5);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, reason, { size: 17, color: '#f87171' });
      api.scores.add(x, y, 'NYAWA -1', { color: '#f87171', size: 19 });
      if (s.lives <= 0) {
        s.over = true;
        const nb = setBest(BK, s.score);
        sfx.chime(2, 440);
        const w2 = wrapRef.current;
        if (w2) popText(w2, 'MATERIAL BERANTAKAN!', { size: 26, color: '#f87171' });
        api.pushHud({ score: s.score, lives: 0, streak: s.streak, best: nb, level: s.level, bestStreak: s.bestStreak });
        window.setTimeout(() => setScreen('over'), 1300);
      }
      push();
    };

    const BIN_ORDER: MatKind[] = ['bata', 'kayu', 'besi'];

    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      // cari item teratas dalam jangkauan jari
      for (let i = s.items.length - 1; i >= 0; i -= 1) {
        const it = s.items[i];
        if (Math.hypot(it.x - p.x, it.y - p.y) < 44) {
          s.dragId = it.id;
          s.dragDX = it.x - p.x;
          s.dragDY = it.y - p.y;
          // angkat ke atas tumpukan
          s.items.splice(i, 1);
          s.items.push(it);
          sfx.pop(1.2);
          return;
        }
      }
    };
    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.over || s.dragId === null) return;
      const it = s.items.find((v) => v.id === s.dragId);
      if (!it) return;
      it.x = clamp(p.x + s.dragDX, 24, api.W - 24);
      it.y = clamp(p.y + s.dragDY, 90, api.H - 40);
    };
    api.input.onUp = (p) => {
      if (screenRef.current !== 'play' || s.over || s.dragId === null) return;
      const idx = s.items.findIndex((v) => v.id === s.dragId);
      s.dragId = null;
      if (idx < 0) return;
      const it = s.items[idx];
      void p;
      // Jatuhkan dinilai dari PUSAT ITEM, bukan posisi pointer: offset
      // genggaman (dragDX/DY s.d. 44px) dulu bisa membuat item yang
      // terlihat di atas bin ditolak, atau sebaliknya diterima dari luar.
      const bi = binAt(api.W, api.H, it.x, it.y);
      if (bi < 0) return; // dilepas di udara: biarkan jatuh lagi
      const res = sortResult(it.kind, BIN_ORDER[bi]);
      const b = binRect(api.W, api.H, bi);
      const bx = b.x + b.w / 2;
      const by = b.y + 20;
      if (res === 'correct') {
        s.streak += 1;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        const pts = scoreFor(s.streak);
        s.score += pts;
        s.sorted += 1;
        sfx.pop(1 + Math.min(0.5, s.streak * 0.04));
        api.scores.add(bx, by - 44, `+${pts}`, { color: '#4ade80', size: 21 });
        api.particles.spawn(bx, by, {
          count: 12, colors: ['#4ade80', '#bbf7d0', '#ffffff'], speed: [60, 240],
          life: [0.3, 0.7], size: [2, 5], gravity: 420, shape: 'circle',
        });
        // Pemulihan nyawa: streak mencapai kelipatan baru → +1 nyawa.
        const gain = lifeGainFor(s.streak) - lifeGainFor(s.streak - 1);
        if (gain > 0 && s.lives < MAX_LIVES) {
          s.lives = Math.min(MAX_LIVES, s.lives + gain);
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, 'NYAWA +1', { size: 21, color: '#4ade80' });
          api.scores.add(bx, by - 76, 'NYAWA +1', { color: '#4ade80', size: 19 });
          sfx.chime(3);
        }
        if (s.streak > 0 && s.streak % 8 === 0) {
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, `STREAK x${s.streak}! Mandor bangga!`, { size: 18, color: '#fb923c' });
        }
        s.items.splice(idx, 1);
      } else {
        s.items.splice(idx, 1);
        loseLife(`SALAH BIN! Itu ${BINS[it.kind].name}, bukan ${BINS[BIN_ORDER[bi]].name}!`, bx, by - 40);
      }
      push();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (screenRef.current !== 'play' || s.over) return;
      s.elapsed += dt;

      const lv = levelAt(s.elapsed);
      if (lv > s.level) {
        s.level = lv;
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `LEVEL ${lv}: CONVEYOR NGEBUT!`, { size: 19, color: '#fde047' });
        sfx.chime(2);
      }

      // spawn
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = spawnInterval(s.elapsed);
        if (s.items.length < 9) {
          s.items.push(spawnItem(rng, s.nextId++, lanes(api.W), -30));
        }
      }
      // jatuh
      const vy = fallSpeed(s.elapsed);
      const binTop = api.H - 108 - 26;
      for (let i = s.items.length - 1; i >= 0; i -= 1) {
        const it = s.items[i];
        if (it.id === s.dragId) continue;
        it.y += vy * dt;
        it.x += Math.sin(s.t * 3 + it.id) * 8 * dt;
        if (it.y > binTop + 30) {
          s.items.splice(i, 1);
          loseLife('LOLOS! Material jatuh ke tanah!', it.x, binTop);
          if (s.over) return;
        }
      }
      push();
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#3b2f23');
      bg.addColorStop(0.55, '#2c2318');
      bg.addColorStop(1, '#1d160e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // dinding gudang: panel seng
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2;
      for (let x = 20; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, H); ctx.stroke(); }
      // lampu gantung
      for (const lx of [W * 0.25, W * 0.75]) {
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx, 80); ctx.lineTo(lx, 108); ctx.stroke();
        const gl = ctx.createRadialGradient(lx, 118, 2, lx, 118, 46);
        gl.addColorStop(0, 'rgba(253,224,71,0.35)');
        gl.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(lx, 118, 46, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(lx, 114, 7, 0, TAU); ctx.fill();
      }
    };

    const drawConveyor = (ctx: CanvasRenderingContext2D, W: number): void => {
      const y = 96;
      const bg = ctx.createLinearGradient(0, y, 0, y + 30);
      bg.addColorStop(0, '#52525b');
      bg.addColorStop(1, '#27272a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, y, W, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      const off = (s.t * 60) % 52;
      for (let x = -off; x < W; x += 52) ctx.fillRect(x, y, 26, 30);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, y + 30, W, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.font = `900 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('CONVEYOR MATERIAL — SERET KE BIN YANG BENAR!', W / 2, y + 52);
    };

    /** Glif prosedural per jenis material (untuk label bin). */
    const drawBinGlyph = (ctx: CanvasRenderingContext2D, kind: MatKind, cx: number, cy: number): void => {
      // Ikon bin = sprite generate-AI dari set bersama; prosedural = fallback.
      if (drawMaterialSprite(ctx, SORTIR_SLUGS[kind], cx, cy, 40, 40)) return;
      ctx.save();
      ctx.translate(cx, cy);
      if (kind === 'bata') {
        // tumpukan bata: 2 di bawah, 1 di atas
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        for (const [gx, gy] of [[-15, 2], [1, 2], [-7, -10]] as const) {
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(gx, gy, 14, 10, 2);
          else ctx.rect(gx, gy, 14, 10);
          ctx.fill(); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-8, -10); ctx.moveTo(8, 2); ctx.lineTo(8, 7); ctx.stroke();
      } else if (kind === 'kayu') {
        // balok kayu + lingkaran tahun di ujung
        const g = ctx.createLinearGradient(0, -8, 0, 8);
        g.addColorStop(0, '#d9a05b');
        g.addColorStop(1, '#92400e');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-18, -8, 30, 16, 3);
        else ctx.rect(-18, -8, 30, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,50,10,0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-15, -2); ctx.bezierCurveTo(-6, 0, 2, -4, 9, -1); ctx.stroke();
        ctx.fillStyle = '#e7c084';
        ctx.beginPath(); ctx.ellipse(13, 0, 6, 8, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.beginPath(); ctx.ellipse(13, 0, 3.5, 5, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(13, 0, 1.4, 2.2, 0, 0, TAU); ctx.stroke();
      } else {
        // balok besi I
        const g = ctx.createLinearGradient(-14, 0, 14, 0);
        g.addColorStop(0, '#64748b');
        g.addColorStop(0.5, '#e2e8f0');
        g.addColorStop(1, '#475569');
        ctx.fillStyle = g;
        ctx.fillRect(-15, -10, 30, 6);
        ctx.fillRect(-15, 4, 30, 6);
        ctx.fillRect(-3.5, -10, 7, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(-15, -10, 30, 2);
      }
      ctx.restore();
    };

    const drawBin = (ctx: CanvasRenderingContext2D, W: number, H: number, i: number): void => {
      const b = binRect(W, H, i);
      const kind = (['bata', 'kayu', 'besi'] as MatKind[])[i];
      const def = BINS[kind];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      // badan bin
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, '#6b5a44');
      g.addColorStop(1, '#3d3222');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x, b.y, b.w, b.h, 12);
      else ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill();
      ctx.restore();
      // aksen warna jenis
      ctx.fillStyle = def.color;
      ctx.fillRect(b.x, b.y, b.w, 10);
      // mulut bin (terbuka)
      const mouth = ctx.createLinearGradient(0, b.y + 10, 0, b.y + 34);
      mouth.addColorStop(0, '#0c0a06');
      mouth.addColorStop(1, '#241c10');
      ctx.fillStyle = mouth;
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + 18, b.w / 2 - 8, 12, 0, 0, TAU);
      ctx.fill();
      // glif jenis + label nama
      drawBinGlyph(ctx, kind, b.x + b.w / 2, b.y + 58);
      ctx.fillStyle = '#fff';
      ctx.font = `900 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(def.name, b.x + b.w / 2, b.y + b.h - 12);
      // papan kayu
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x + 6, b.y + 78); ctx.lineTo(b.x + b.w - 6, b.y + 78); ctx.stroke();
    };

    /** Satu bata prosedural dengan nat. */
    const oneBrick = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void => {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#f87171');
      g.addColorStop(1, '#b91c1c');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 3);
      else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x + 2, y + 1.5, w - 4, 3);
    };

    /** Satu balok kayu prosedural dengan alur serat. */
    const oneLog = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void => {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#d9a05b');
      g.addColorStop(0.5, '#b45309');
      g.addColorStop(1, '#7c3a06');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 3);
      else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,50,10,0.6)';
      ctx.lineWidth = 1.3;
      for (const oy of [0.3, 0.58, 0.8]) {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + h * oy + seed);
        ctx.bezierCurveTo(x + w * 0.3, y + h * oy + 1.5, x + w * 0.65, y + h * oy - 1.5, x + w - 3, y + h * oy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,235,190,0.3)';
      ctx.fillRect(x + 2, y + 1.5, w - 4, 3);
    };

    const drawItem = (ctx: CanvasRenderingContext2D, it: SortItem): void => {
      const dragged = it.id === s.dragId;
      // Item jatuh utama = sprite generate-AI dari set bersama (satu ikon per
      // jenis; varian prosedural menjadi FALLBACK bila sprite belum siap).
      if (drawMaterialSprite(ctx, SORTIR_SLUGS[it.kind], it.x, it.y, dragged ? 62 : 54, dragged ? 62 : 54)) {
        if (dragged) {
          ctx.save();
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.beginPath(); ctx.arc(it.x, it.y, 34 + Math.sin(s.t * 8) * 2, 0, TAU); ctx.stroke();
          ctx.restore();
        }
        return;
      }
      ctx.save();
      ctx.translate(it.x, it.y);
      if (dragged) ctx.scale(1.18, 1.18);
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = dragged ? 16 : 7;
      ctx.shadowOffsetY = dragged ? 8 : 4;
      const v = it.variant;
      if (it.kind === 'bata') {
        if (v === 0) {
          // varian 0: bata tunggal
          oneBrick(ctx, -22, -11, 44, 22);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-7, -11); ctx.lineTo(-7, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(7, 11); ctx.stroke();
        } else if (v === 1) {
          // varian 1: dua bata bertumpuk, nat bergeser
          oneBrick(ctx, -21, -14, 42, 13);
          oneBrick(ctx, -21, 1, 42, 13);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -1); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-10, 1); ctx.lineTo(-10, 14); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(11, 1); ctx.lineTo(11, 14); ctx.stroke();
        } else {
          // varian 2: piramida — 2 bata di bawah, 1 di atas
          oneBrick(ctx, -25, 2, 24, 12);
          oneBrick(ctx, 1, 2, 24, 12);
          oneBrick(ctx, -12, -11, 24, 12);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(120,20,20,0.6)';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(-13, 8); ctx.lineTo(-3, 8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(3, -5); ctx.lineTo(11, -5); ctx.stroke();
        }
      } else if (it.kind === 'kayu') {
        if (v === 0) {
          // varian 0: balok tunggal beralur
          oneLog(ctx, -26, -9, 52, 18, 0);
        } else if (v === 1) {
          // varian 1: dua balok bertumpuk
          oneLog(ctx, -25, -14, 50, 13, 0);
          oneLog(ctx, -25, 1, 50, 13, 1);
        } else {
          // varian 2: balok dengan potongan melintang (lingkaran tahun) di ujung
          oneLog(ctx, -24, -10, 48, 20, 0);
          ctx.shadowBlur = 0;
          for (const ex of [-24, 24]) {
            ctx.fillStyle = '#e7c084';
            ctx.beginPath(); ctx.ellipse(ex, 0, 5.5, 10, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#92400e';
            ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.ellipse(ex, 0, 3.4, 6.4, 0, 0, TAU); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(ex, 0, 1.4, 2.8, 0, 0, TAU); ctx.stroke();
          }
        }
        ctx.shadowBlur = 0;
      } else if (v === 0) {
        // besi varian 0: balok I
        const g = ctx.createLinearGradient(-8, 0, 8, 0);
        g.addColorStop(0, '#475569');
        g.addColorStop(0.5, '#cbd5e1');
        g.addColorStop(1, '#334155');
        ctx.fillStyle = g;
        ctx.fillRect(-22, -13, 44, 7);
        ctx.fillRect(-22, 6, 44, 7);
        ctx.fillRect(-5, -13, 10, 26);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-22, -13, 44, 2.5);
      } else if (v === 1) {
        // besi varian 1: bundel 3 pipa bundar + tali pengikat
        for (const px of [-15, 0, 15]) {
          const g = ctx.createRadialGradient(px - 3, -4, 2, px, 0, 10);
          g.addColorStop(0, '#e2e8f0');
          g.addColorStop(0.6, '#94a3b8');
          g.addColorStop(1, '#475569');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, 0, 9.5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1e293b';
          ctx.beginPath(); ctx.arc(px, 0, 4.6, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.arc(px - 3, -3.5, 2, 0, TAU); ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#b45309';
        ctx.fillRect(-25, -2.2, 50, 4.4);
      } else {
        // besi varian 2: tumpukan 3 plat + titik baut
        const g = ctx.createLinearGradient(0, -14, 0, 14);
        g.addColorStop(0, '#94a3b8');
        g.addColorStop(1, '#475569');
        ctx.fillStyle = g;
        for (const py of [-14, -4.5, 5]) {
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(-23, py, 46, 8, 2);
          else ctx.rect(-23, py, 46, 8);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1e293b';
        for (const py of [-10, -0.5, 9]) {
          for (const px of [-17, 17]) {
            ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill();
          }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-23, -14, 46, 2);
      }
      ctx.restore();
      // cincin saat diseret
      if (dragged) {
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(it.x, it.y, 34 + Math.sin(s.t * 8) * 2, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    };

    /** Hati prosedural untuk indikator nyawa di kanvas. */
    const drawHeart = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, filled: boolean): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(0, size * 0.85);
      ctx.bezierCurveTo(-size * 1.25, -size * 0.1, -size * 0.62, -size * 1.05, 0, -size * 0.38);
      ctx.bezierCurveTo(size * 0.62, -size * 1.05, size * 1.25, -size * 0.1, 0, size * 0.85);
      ctx.closePath();
      if (filled) {
        const g = ctx.createLinearGradient(0, -size, 0, size);
        g.addColorStop(0, '#f87171');
        g.addColorStop(1, '#dc2626');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.ellipse(-size * 0.34, -size * 0.34, size * 0.2, size * 0.13, -0.6, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawLives = (ctx: CanvasRenderingContext2D, W: number): void => {
      for (let i = 0; i < MAX_LIVES; i += 1) {
        drawHeart(ctx, W - 16 - (MAX_LIVES - 1 - i) * 25, 172, 9, i < s.lives);
      }
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      drawConveyor(ctx, W);
      for (const it of s.items) drawItem(ctx, it);
      for (let i = 0; i < 3; i += 1) drawBin(ctx, W, H, i);
      drawLives(ctx, W);
      ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,6,2,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    sfx.ensure();
    (apiRef.current as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
  };
  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    sfx.ensure();
    setMuted((m) => {
      const next = !m;
      if (sfx.muted !== next) sfx.toggleMute();
      return next;
    });
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(20,14,8,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 620, overflow: 'hidden', borderRadius: 18, background: '#2c2318', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(20,14,8,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            Level {hud.level} {hud.streak >= 2 && <span style={{ color: '#fb923c', fontWeight: 900 }}>• Streak x{hud.streak}</span>}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }} aria-label={`Nyawa ${hud.lives} dari ${MAX_LIVES}`}>
            {Array.from({ length: MAX_LIVES }, (_, i) => (
              <HeartIcon key={i} filled={i < hud.lives} size={15} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? <IconPause /> : <IconPlay />}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? <IconMuted /> : <IconSound />}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar"><IconClose /></button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <FactoryIcon />
          <h2 style={h2}>SORTIR MATERIAL</h2>
          <p style={p}>
            Material berjatuhan dari conveyor! <b>Seret</b> tiap material ke bin yang benar:
          </p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            <BinChip kind="bata" />
            <BinChip kind="kayu" />
            <BinChip kind="besi" />
          </div>
          <p style={p}>
            Salah bin atau material lolos jatuh = <b>nyawa berkurang</b> (3x = bubar!).
            Sortir benar <b>12x beruntun</b> memulihkan <b>+1 nyawa</b>. Conveyor makin ngebut tiap level!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Menyortir</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <PauseIcon />
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Conveyor dimatikan dulu. Materialnya antre rapi.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <BurstIcon />
          <h2 style={h2}>GUDANG BERANTAKAN!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Level" value={`${hud.level}`} />
            <Stat label="Streak max" value={`${hud.bestStreak}x`} />
            <Stat label="Terbaik" value={hud.best.toLocaleString('id-ID')} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#fef3c7' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fbbf24', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(24,16,6,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#4a3a24,#221a0e)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)', maxHeight: '92%', overflowY: 'auto' }}>
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

/* ---------- Ikon SVG prosedural (pengganti emoji HUD/overlay) ---------- */

function HeartIcon({ filled, size = 16 }: { filled: boolean; size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5C6 16 3 12.6 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 3.3-3 6.7-9 11.2z"
        fill={filled ? '#ef4444' : 'rgba(255,255,255,0.15)'}
        stroke={filled ? '#fca5a5' : 'rgba(255,255,255,0.4)'}
        strokeWidth="1.4"
      />
    </svg>
  );
}

function IconPause(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="4" width="4.6" height="16" rx="1.4" fill="#fff" />
      <rect x="13.9" y="4" width="4.6" height="16" rx="1.4" fill="#fff" />
    </svg>
  );
}

function IconPlay(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.8c0-.9 1-1.5 1.8-1L20 11c.8.5.8 1.6 0 2.1L8.8 20.2c-.8.5-1.8-.1-1.8-1V4.8z" fill="#fff" />
    </svg>
  );
}

function IconSound(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="#fff" stroke="none" />
      <path d="M15 9.5a4 4 0 0 1 0 5" />
      <path d="M17.5 7a7.5 7.5 0 0 1 0 10" />
    </svg>
  );
}

function IconMuted(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="#fff" stroke="none" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </svg>
  );
}

function IconClose(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

function FactoryIcon(): React.JSX.Element {
  return (
    <svg width="52" height="52" viewBox="0 0 48 48" aria-hidden="true" style={{ margin: '0 auto', display: 'block' }}>
      <path d="M6 42V22l10 6V22l10 6V14h8v28z" fill="#f59e0b" stroke="#fde047" strokeWidth="1.6" />
      <rect x="30" y="6" width="5" height="10" fill="#78716c" />
      <rect x="11" y="33" width="5" height="5" fill="#fef3c7" />
      <rect x="20" y="33" width="5" height="5" fill="#fef3c7" />
      <rect x="29" y="33" width="5" height="5" fill="#fef3c7" />
      <rect x="4" y="42" width="40" height="3" rx="1.5" fill="#fde047" />
    </svg>
  );
}

function PauseIcon(): React.JSX.Element {
  return (
    <svg width="52" height="52" viewBox="0 0 48 48" aria-hidden="true" style={{ margin: '0 auto', display: 'block' }}>
      <circle cx="24" cy="24" r="20" fill="rgba(253,224,71,0.14)" stroke="#fde047" strokeWidth="2" />
      <rect x="17" y="14" width="5.4" height="20" rx="1.8" fill="#fde047" />
      <rect x="25.6" y="14" width="5.4" height="20" rx="1.8" fill="#fde047" />
    </svg>
  );
}

function BurstIcon(): React.JSX.Element {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" aria-hidden="true" style={{ margin: '0 auto', display: 'block' }}>
      <path d="M24 3l3.2 8.4L35 6l-1.8 8.9L42 13l-4.6 7.6L45 24l-7.6 3.4L42 35l-8.8-1.9L35 42l-7.8-5.4L24 45l-3.2-8.4L13 42l1.8-8.9L6 35l4.6-7.6L3 24l7.6-3.4L6 13l8.8 1.9L13 6l7.8 5.4z" fill="#ef4444" stroke="#fca5a5" strokeWidth="1.4" />
      <circle cx="24" cy="24" r="6.5" fill="#fde047" />
    </svg>
  );
}

/** Chip tutorial: glif SVG mini per jenis material + nama bin. */
function BinChip({ kind }: { kind: MatKind }): React.JSX.Element {
  const def = BINS[kind];
  const img = useSprite(MATERIAL_SPRITES[SORTIR_SLUGS[kind]]);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: `1px solid ${def.color}`, borderRadius: 999, padding: '5px 11px 5px 7px', color: '#fff', fontWeight: 900, fontSize: 12.5 }}>
      {img && (
        <img src={img.src} alt="" aria-hidden="true" draggable={false} style={{ width: 22, height: 22, objectFit: 'contain', display: 'block', userSelect: 'none' }} />
      )}
      {!img && kind === 'bata' && (
        <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
          <rect x="1" y="8.5" width="9" height="6" rx="1" fill="#ef4444" />
          <rect x="12" y="8.5" width="9" height="6" rx="1" fill="#dc2626" />
          <rect x="6.5" y="1.5" width="9" height="6" rx="1" fill="#f87171" />
        </svg>
      )}
      {!img && kind === 'kayu' && (
        <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
          <rect x="1" y="3" width="16" height="10" rx="2" fill="#b45309" />
          <path d="M3 7c4-1.6 8 1.4 12 0" stroke="#7c3a06" strokeWidth="1.3" fill="none" />
          <ellipse cx="18.6" cy="8" rx="2.6" ry="4.6" fill="#e7c084" stroke="#92400e" strokeWidth="1" />
          <ellipse cx="18.6" cy="8" rx="1.2" ry="2.2" fill="none" stroke="#92400e" strokeWidth="0.9" />
        </svg>
      )}
      {!img && kind === 'besi' && (
        <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
          <rect x="2" y="1.5" width="18" height="3.6" fill="#94a3b8" />
          <rect x="2" y="10.9" width="18" height="3.6" fill="#64748b" />
          <rect x="9.2" y="1.5" width="3.6" height="13" fill="#cbd5e1" />
        </svg>
      )}
      {def.name}
    </span>
  );
}

void clamp;
