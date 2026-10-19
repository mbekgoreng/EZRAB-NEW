/**
 * ArcadeCapitCrane ("Capit Material") — mesin capit versi proyek: troli crane
 * mengayun otomatis, pemain menurunkan capit untuk mencapit material
 * (helm, bata, pipa, semen, kunci emas mandor) lalu mengantarnya ke gudang.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, lerp } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  ITEM_DEFS, trolleyAt, swayAt, descendSpeed, spawnItem, grabCheck,
  scoreFor, comboBonus, GAME_DURATION, DROP_X_FRAC,
  type CraneItem, type CranePhase, type ItemKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('capit-material', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface DropAnim { kind: ItemKind; x: number; y: number; vy: number; age: number; }

interface S {
  phase: CranePhase;
  t: number;
  sweepT: number; // waktu ayunan troli — hanya maju saat fase sweep
  swayNow: number; // sudut ayunan efektif frame ini (rad)
  elapsed: number;
  rope: number; // panjang tali px
  clawX: number; // posisi capit (px, dari troli + ayunan)
  carryX: number | null; // posisi troli eksplisit saat fase carry (fraksi)
  carryFrom: number;
  carryT: number;
  carried: CraneItem | null;
  items: CraneItem[];
  nextId: number;
  score: number;
  streak: number;
  bestStreak: number;
  grabs: number;
  misses: number;
  drops: DropAnim[];
  over: boolean;
}

const ROPE_MIN = 46;
const MAX_ITEMS = 5;

export default function ArcadeCapitCrane({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, timeLeft: GAME_DURATION, streak: 0, best: getBest(BK, 0), bestStreak: 0 });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const railY = 92;
  const itemY = (H: number): number => H * 0.80;
  const whGeom = (W: number, H: number): { gx: number; top: number; w: number; h: number } => {
    const w = 96; const h = 74;
    const gx = W * DROP_X_FRAC;
    const top = H * 0.94 - h;
    return { gx, top, w, h };
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      phase: 'sweep', t: 0, sweepT: 0, swayNow: 0, elapsed: 0, rope: ROPE_MIN, clawX: 0,
      carryX: null, carryFrom: 0, carryT: 0,
      carried: null, items: [], nextId: 1, score: 0, streak: 0, bestStreak: 0,
      grabs: 0, misses: 0, drops: [], over: false,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, timeLeft: Math.max(0, GAME_DURATION - s.elapsed), streak: s.streak, best: getBest(BK, 0), bestStreak: s.bestStreak });
    };

    const reset = (): void => {
      s.phase = 'sweep';
      s.t = 0; s.sweepT = 0; s.swayNow = 0; s.elapsed = 0; s.rope = ROPE_MIN;
      s.carryX = null; s.carryFrom = 0; s.carryT = 0;
      s.carried = null; s.items = []; s.nextId = 1;
      s.score = 0; s.streak = 0; s.bestStreak = 0;
      s.grabs = 0; s.misses = 0; s.drops = []; s.over = false;
      for (let i = 0; i < MAX_ITEMS; i += 1) {
        s.items.push(spawnItem(rng, s.nextId++, api.W * 0.06, api.W * (DROP_X_FRAC - 0.12)));
      }
      push();
    };

    const endGame = (): void => {
      s.over = true;
      const nb = setBest(BK, s.score);
      sfx.chime(3);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'SHIFT SELESAI!', { size: 30, color: '#fde047' });
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 60, colors: ['#fde047', '#fb923c', '#fff7d6', '#4ade80'],
        speed: [100, 380], life: [0.6, 1.1], size: [2, 6], gravity: 300, shape: 'rect', rotation: true,
      });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, timeLeft: 0, streak: s.streak, best: nb, bestStreak: s.bestStreak });
        setScreen('over');
      }, 1200);
    };

    const startDescend = (): void => {
      if (screenRef.current !== 'play' || s.over || s.phase !== 'sweep') return;
      s.phase = 'descend';
      sfx.whoosh();
    };

    const trolleyX = (): number => (s.carryX !== null ? s.carryX : trolleyAt(s.sweepT)) * api.W;

    api.input.onDown = (p) => {
      sfx.ensure();
      // ketuk area bawah tombol HTML menangani; ketuk canvas = turunkan capit
      if (p.y > api.H - 120) return;
      startDescend();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (screenRef.current !== 'play' || s.over) return;
      s.elapsed += dt;
      if (s.elapsed >= GAME_DURATION) { endGame(); return; }

      // troli hanya mengayun saat fase sweep (berhenti saat capit turun)
      if (s.phase === 'sweep') s.sweepT += dt;
      // ayunan capit diredam saat tali panjang agar bisa dibidik
      const damp = s.phase === 'sweep' ? 1 : 0.25;
      s.swayNow = swayAt(s.t) * damp;

      const tx = trolleyX();
      const clawPivotX = tx + Math.sin(s.swayNow) * s.rope;
      s.clawX = clawPivotX;

      // conveyor: item bergeser pelan ke kanan, wrap ke kiri
      const beltV = 14 + s.elapsed * 0.25;
      const beltEnd = api.W * DROP_X_FRAC - 96 / 2 - 14;
      for (const it of s.items) {
        it.x += beltV * dt;
        if (it.x > beltEnd) it.x = api.W * 0.02;
      }

      const targetRope = itemY(api.H) - railY - 12;
      if (s.phase === 'descend') {
        s.rope += descendSpeed(s.elapsed) * dt;
        if (s.rope >= targetRope) {
          s.rope = targetRope;
          const got = grabCheck(s.clawX, railY + s.rope, s.items, itemY(api.H));
          if (got) {
            s.carried = got;
            s.items = s.items.filter((it) => it !== got);
            sfx.thud(1.1);
            api.particles.spawn(s.clawX, railY + s.rope, {
              count: 10, colors: ['#fde047', '#fff7d6'], speed: [60, 200],
              life: [0.3, 0.6], size: [2, 4], gravity: 300, shape: 'circle',
            });
          } else {
            s.misses += 1;
            s.streak = 0;
            sfx.fail();
            const wrap = wrapRef.current;
            if (wrap) popText(wrap, 'MELESET! Capitnya kegedean goyang.', { size: 15, color: '#f87171' });
            api.shake.add(0.3);
          }
          s.phase = 'ascend';
        }
      } else if (s.phase === 'ascend') {
        s.rope -= descendSpeed(s.elapsed) * 1.35 * dt;
        if (s.rope <= ROPE_MIN) {
          s.rope = ROPE_MIN;
          if (s.carried) {
            s.phase = 'carry';
            s.carryFrom = trolleyAt(s.sweepT);
            s.carryX = s.carryFrom;
            s.carryT = 0;
          } else {
            s.phase = 'sweep';
            s.carryX = null;
          }
        }
      } else if (s.phase === 'carry') {
        // troli digerakkan mulus menuju gudang
        s.carryT += dt;
        const k = clamp(s.carryT / 1.0, 0, 1);
        const e = k * k * (3 - 2 * k); // smoothstep
        s.carryX = lerp(s.carryFrom, DROP_X_FRAC, e);
        if (k >= 1) {
          s.phase = 'drop';
          if (s.carried) {
            s.drops.push({ kind: s.carried.kind, x: api.W * DROP_X_FRAC, y: railY + s.rope + 26, vy: 60, age: 0 });
            s.carried = null;
          }
        }
      } else if (s.phase === 'drop') {
        let done = true;
        const landY = whGeom(api.W, api.H).top + 14;
        for (const d of s.drops) {
          d.age += dt;
          d.vy += 900 * dt;
          d.y += d.vy * dt;
          if (d.y < landY) done = false;
          else if (d.age < 99) {
            d.age = 99;
            // mendarat di gudang → skor
            const pts = scoreFor(d.kind);
            s.streak += 1;
            s.bestStreak = Math.max(s.bestStreak, s.streak);
            const bonus = comboBonus(s.streak);
            s.score += pts + bonus;
            s.grabs += 1;
            sfx.pop(d.kind === 'kunci-emas' ? 1.5 : 1.1);
            const gx = api.W * DROP_X_FRAC;
            api.scores.add(gx, api.H * 0.80, `+${pts}${bonus > 0 ? ` (+${bonus} kombo!)` : ''}`, {
              color: d.kind === 'kunci-emas' ? '#fde047' : '#fef3c7', size: d.kind === 'kunci-emas' ? 24 : 19,
            });
            api.particles.spawn(gx, api.H * 0.88, {
              count: d.kind === 'kunci-emas' ? 26 : 12,
              colors: d.kind === 'kunci-emas' ? ['#fde047', '#fbbf24', '#fff7d6'] : ['#d6a05c', '#a16207', '#fef3c7'],
              speed: [80, 300], life: [0.35, 0.8], size: [2, 5], gravity: 500, shape: 'rect', rotation: true,
            });
            if (d.kind === 'kunci-emas') {
              const wrap = wrapRef.current;
              if (wrap) popText(wrap, '🔑 KUNCI GUDANG MANDOR!', { size: 20, color: '#fde047' });
              sfx.chime(3);
            }
            // respawn item baru
            s.items.push(spawnItem(rng, s.nextId++, api.W * 0.02, api.W * 0.3));
            while (s.items.length > MAX_ITEMS) s.items.shift();
          }
        }
        s.drops = s.drops.filter((d) => d.age < 0.4 || d.y < whGeom(api.W, api.H).top + 14);
        if (done) { s.phase = 'sweep'; s.carryX = null; }
      }
      push();
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#7cc4f2');
      sky.addColorStop(0.65, '#c9e8fb');
      sky.addColorStop(1, '#e8f3d8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // awan
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i += 1) {
        const cx = ((i * 173 + s.t * 9) % (W + 160)) - 80;
        const cy = 40 + (i * 37) % 60;
        for (const [ox, oy, r] of [[0, 0, 20], [22, -6, 26], [48, 0, 19]] as const) {
          ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, TAU); ctx.fill();
        }
      }
      // gedung jauh
      ctx.fillStyle = 'rgba(148,180,205,0.55)';
      let bx = 0;
      const bw2 = [52, 68, 44, 78, 58, 66];
      for (const w of bw2) {
        const bh = 90 + ((bx * 53) % 70 + 70) % 70;
        ctx.fillRect(bx, H * 0.72 - bh, w, bh);
        bx += w + 10;
      }
      // tanah proyek
      const gr = ctx.createLinearGradient(0, H * 0.72, 0, H);
      gr.addColorStop(0, '#c9a06a');
      gr.addColorStop(1, '#8a5f36');
      ctx.fillStyle = gr;
      ctx.fillRect(0, H * 0.72, W, H * 0.28);
      // tekstur tanah
      ctx.fillStyle = 'rgba(90,60,30,0.25)';
      for (let i = 0; i < 26; i += 1) {
        const px = (i * 97.3) % W;
        const py = H * 0.75 + ((i * 61.7) % (H * 0.22));
        ctx.beginPath(); ctx.ellipse(px, py, 7, 3.4, 0, 0, TAU); ctx.fill();
      }
    };

    const drawGantry = (ctx: CanvasRenderingContext2D, W: number): void => {
      const y = railY;
      // tiang penyangga kiri-kanan
      for (const px of [18, W - 18]) {
        const lg = ctx.createLinearGradient(px - 10, 0, px + 10, 0);
        lg.addColorStop(0, '#5b6672');
        lg.addColorStop(0.5, '#aeb8c4');
        lg.addColorStop(1, '#454e5a');
        ctx.fillStyle = lg;
        ctx.fillRect(px - 10, 20, 20, y - 20 + 8);
        ctx.fillStyle = '#39414d';
        ctx.fillRect(px - 16, y - 6, 32, 12);
      }
      // balok rel
      const beam = ctx.createLinearGradient(0, y - 16, 0, y + 16);
      beam.addColorStop(0, '#f59e0b');
      beam.addColorStop(0.45, '#d97706');
      beam.addColorStop(1, '#92400e');
      ctx.fillStyle = beam;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(8, y - 16, W - 16, 32, 8);
      else ctx.rect(8, y - 16, W - 16, 32);
      ctx.fill();
      // baut-baut
      ctx.fillStyle = 'rgba(60,30,5,0.7)';
      for (let x = 30; x < W - 20; x += 46) {
        ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,235,180,0.5)';
        ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.4, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(60,30,5,0.7)';
      }
      // garis peringatan (di bawah balok agar tak tertutup HUD)
      ctx.fillStyle = 'rgba(60,35,8,0.75)';
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ AREA CAPIT — MANDOR BERTUGAS', W / 2, y + 30);
    };

    const drawTrolleyAndClaw = (ctx: CanvasRenderingContext2D): void => {
      const tx = trolleyX();
      const y = railY;
      // troli
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      const tg = ctx.createLinearGradient(0, y - 4, 0, y + 26);
      tg.addColorStop(0, '#475569');
      tg.addColorStop(1, '#1e293b');
      ctx.fillStyle = tg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(tx - 26, y - 2, 52, 28, 8);
      else ctx.rect(tx - 26, y - 2, 52, 28);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(tx - 14, y + 12, 4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(tx + 14, y + 12, 4, 0, TAU); ctx.fill();
      // tali + capit (berayun di titik troli)
      const sway = s.swayNow;
      ctx.save();
      ctx.translate(tx, y + 26);
      ctx.rotate(sway);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s.rope); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(-1, s.rope); ctx.stroke();
      // kepala capit
      const cy = s.rope;
      ctx.translate(0, cy);
      const cg = ctx.createLinearGradient(-10, 0, 10, 0);
      cg.addColorStop(0, '#78716c');
      cg.addColorStop(0.5, '#d6d3d1');
      cg.addColorStop(1, '#57534e');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      // dua cakar
      const open = s.phase === 'descend' || s.phase === 'ascend' ? 0.5 : 0.9;
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * 6, 4);
        ctx.quadraticCurveTo(dir * (10 + open * 14), 20, dir * (open * 16), 34);
        ctx.stroke();
      }
      // item yang dicapit
      if (s.carried) {
        ctx.save();
        ctx.rotate(-sway);
        drawItem(ctx, s.carried.kind, 0, 46, 1);
        ctx.restore();
      }
      ctx.restore();
    };

    const drawItem = (ctx: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number, sc: number): void => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      if (kind === 'helm') {
        const g = ctx.createLinearGradient(0, -18, 0, 4);
        g.addColorStop(0, '#fde047');
        g.addColorStop(1, '#d97706');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 15, Math.PI, 0); ctx.fill();
        ctx.fillRect(-21, -2, 42, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(-5, -10, 5, Math.PI * 0.9, Math.PI * 1.7); ctx.fill();
        ctx.fillStyle = '#b45309';
        ctx.fillRect(-3, -22, 6, 8);
      } else if (kind === 'bata') {
        const g = ctx.createLinearGradient(0, -10, 0, 10);
        g.addColorStop(0, '#f87171');
        g.addColorStop(1, '#b91c1c');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-18, -10, 36, 20, 3);
        else ctx.rect(-18, -10, 36, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-6, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6, 10); ctx.stroke();
      } else if (kind === 'pipa') {
        const g = ctx.createLinearGradient(0, -9, 0, 9);
        g.addColorStop(0, '#e2e8f0');
        g.addColorStop(0.5, '#94a3b8');
        g.addColorStop(1, '#475569');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-20, -9, 40, 18, 9);
        else ctx.rect(-20, -9, 40, 18);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.ellipse(-20, 0, 4, 9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.ellipse(-20, 0, 2.2, 6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,41,59,0.6)';
        ctx.lineWidth = 2;
        for (const rx of [-6, 6]) { ctx.beginPath(); ctx.moveTo(rx, -9); ctx.lineTo(rx, 9); ctx.stroke(); }
      } else if (kind === 'semen') {
        const g = ctx.createLinearGradient(0, -16, 0, 14);
        g.addColorStop(0, '#e7e0cf');
        g.addColorStop(1, '#b8ab8d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-6, -16);
        ctx.quadraticCurveTo(0, -22, 6, -16);
        ctx.lineTo(14, 6);
        ctx.quadraticCurveTo(14, 14, 6, 14);
        ctx.lineTo(-6, 14);
        ctx.quadraticCurveTo(-14, 14, -14, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7c6f52';
        ctx.font = '900 8px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('SEMEN', 0, 4);
      } else {
        // kunci-emas
        ctx.shadowColor = 'rgba(253,224,71,0.9)';
        ctx.shadowBlur = 14;
        const g = ctx.createLinearGradient(0, -14, 0, 14);
        g.addColorStop(0, '#fef08a');
        g.addColorStop(1, '#d97706');
        ctx.strokeStyle = g;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(-8, -6, 8, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(14, 10); ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(8, 6); ctx.lineTo(8, 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(13, 9); ctx.lineTo(13, 15); ctx.stroke();
      }
      ctx.restore();
    };

    const drawBelt = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const y = itemY(H);
      const wg = whGeom(W, H);
      const endX = wg.gx - wg.w / 2 - 14;
      // sabuk conveyor (berhenti sebelum gudang)
      const bg = ctx.createLinearGradient(0, y + 8, 0, y + 34);
      bg.addColorStop(0, '#3f3f46');
      bg.addColorStop(1, '#18181b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, y + 8, endX, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let x = -((s.t * 40) % 44); x < endX; x += 44) {
        ctx.fillRect(x, y + 8, 22, 26);
      }
      ctx.fillStyle = '#27272a';
      ctx.fillRect(0, y + 34, endX, 6);
      // rol ujung
      ctx.fillStyle = '#52525b';
      ctx.beginPath(); ctx.arc(endX, y + 21, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#27272a';
      ctx.beginPath(); ctx.arc(endX, y + 21, 6, 0, TAU); ctx.fill();
      // kaki conveyor
      ctx.fillStyle = '#3f3f46';
      for (const lx of [W * 0.2, W * 0.5]) ctx.fillRect(lx - 5, y + 40, 10, H - y - 40);
      // item di atas sabuk
      for (const it of s.items) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(it.x, y + 10, 22, 5, 0, 0, TAU); ctx.fill();
        ctx.restore();
        drawItem(ctx, it.kind, it.x, y - 6, 1);
      }
      // item yang jatuh ke gudang
      for (const d of s.drops) drawItem(ctx, d.kind, d.x, d.y, 1);
    };

    const drawWarehouse = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const { gx, top, w, h } = whGeom(W, H);
      const gy = top + h;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 8;
      const wood = ctx.createLinearGradient(0, gy - h, 0, gy);
      wood.addColorStop(0, '#d9a05b');
      wood.addColorStop(1, '#8a5a28');
      ctx.fillStyle = wood;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(gx - w / 2, gy - h, w, h, 10);
      else ctx.rect(gx - w / 2, gy - h, w, h);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(80,45,15,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(gx - w / 2 + 8, gy - h + 8); ctx.lineTo(gx + w / 2 - 8, gy - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx + w / 2 - 8, gy - h + 8); ctx.lineTo(gx - w / 2 + 8, gy - 8); ctx.stroke();
      ctx.fillStyle = 'rgba(50,28,10,0.9)';
      ctx.font = `900 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('🏚️ GUDANG', gx, gy - h - 12);
      // panah penanda
      const bob = Math.sin(s.t * 3) * 5;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(gx - 12, gy - h - 34 + bob);
      ctx.lineTo(gx + 12, gy - h - 34 + bob);
      ctx.lineTo(gx, gy - h - 20 + bob);
      ctx.closePath();
      ctx.fill();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      drawBelt(ctx, W, H);
      drawWarehouse(ctx, W, H);
      drawGantry(ctx, W);
      drawTrolleyAndClaw(ctx);
      ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(20,30,50,0.35)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: () => void }).__reset = reset;
    (api as unknown as { __drop: () => void }).__drop = startDescend;
    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    sfx.ensure();
    (apiRef.current as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
  };
  const dropClaw = (): void => {
    sfx.ensure();
    (apiRef.current as unknown as { __drop?: () => void } | null)?.__drop?.();
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
    background: 'rgba(20,30,50,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 620, overflow: 'hidden', borderRadius: 18, background: '#7cc4f2', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(20,30,50,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(hud.timeLeft / GAME_DURATION) * 100}%`, background: 'linear-gradient(90deg,#4ade80,#22c55e)', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            ⏱ {Math.ceil(hud.timeLeft)}s {hud.streak >= 2 && <span style={{ color: '#fb923c', fontWeight: 900 }}>• 🔥x{hud.streak}</span>}
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

      {screen === 'play' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 16px', zIndex: 5, display: 'flex', justifyContent: 'center' }}>
          <button onClick={dropClaw} style={dropBtn}>⬇ TURUNKAN CAPIT</button>
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🏗️</div>
          <h2 style={h2}>CAPIT MATERIAL</h2>
          <p style={p}>
            Troli crane <b>mengayun sendiri</b> — tekan <b>⬇ TURUNKAN CAPIT</b> (atau ketuk layar)
            saat capit pas di atas material! Capit mengantar barang ke <b>🏚️ GUDANG</b>.
            Capit beruntun tanpa meleset = <b>bonus kombo</b>. Awas: <b>🔑 Kunci Gudang Mandor</b> langka = 150 poin!
          </p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
            {(Object.keys(ITEM_DEFS) as ItemKind[]).map((k) => (
              <span key={k} style={chip}>{ITEM_DEFS[k].emoji} {ITEM_DEFS[k].points}</span>
            ))}
          </div>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Mencapit</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Crane-nya diparkir dulu. Materialnya ditungguin satpam.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>🏚️</div>
          <h2 style={h2}>GUDANG PENUH!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Streak max" value={`🔥${hud.bestStreak}x`} />
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
const dropBtn: React.CSSProperties = {
  padding: '15px 44px', borderRadius: 999, border: 'none', fontFamily: FONT, fontWeight: 900, fontSize: 17,
  cursor: 'pointer', background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00',
  boxShadow: '0 10px 26px rgba(245,158,11,0.45)',
};
const chip: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: '#fef3c7', background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 10px',
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,22,8,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#4a3220,#241708)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)', maxHeight: '92%', overflowY: 'auto' }}>
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

void clamp;
