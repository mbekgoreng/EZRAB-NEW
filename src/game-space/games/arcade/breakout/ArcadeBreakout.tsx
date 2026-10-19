/**
 * ArcadeBreakout ("Bobok Tembok") — hancurkan susunan bata pakai bola kerikil.
 * Papan = papan bekisting. Powerup: papan lebar, multibola, semen beku (bola lambat), helm (nyawa).
 */
import React, { useRef, useState } from 'react';
import {
  useGameCanvas, type GameApi, TAU, clamp, sfx,
} from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  createLevel, stepBall, circleRectHit, reflect, bouncePaddle, powerForBrick,
  ballSpeed, KIND_HP, KIND_SCORE,
  type Brick, type Ball, type PowerKind,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('bobok-tembok', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Pw {
  x: number; y: number; vy: number; kind: PowerKind; id: number;
}

interface S {
  bricks: Brick[];
  balls: Ball[];
  pws: Pw[];
  paddleX: number; // tengah papan (px)
  paddleW: number;
  frozen: number; // sisa waktu semen beku
  shield: boolean;
  lives: number;
  level: number;
  score: number;
  levelScore: number;
  t: number;
  over: boolean;
  win: boolean;
  launched: boolean;
}

const POWER_LABEL: Record<PowerKind, string> = {
  panjang: '📏 Bekisting Lebar!', multibola: '⚽ Multibola!', semenbeku: '🧊 Semen Beku!', helm: '⛑️ Helm Nyawa!',
};
const POWER_COLOR: Record<PowerKind, string> = {
  panjang: '#4ade80', multibola: '#fbbf24', semenbeku: '#7dd3fc', helm: '#fb923c',
};

export default function ArcadeBreakout({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(sfx.muted);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);
    const COLS = 8;
    const ROWS = 5;
    let pwId = 0;

    const s: S = {
      bricks: [], balls: [], pws: [],
      paddleX: api.W / 2, paddleW: 96, frozen: 0, shield: false,
      lives: 3, level: 0, score: 0, levelScore: 0, t: 0, over: false, win: false, launched: false,
    };

    const gridToPx = (b: Brick): { x: number; y: number; w: number; h: number } => {
      const top = 96;
      const gw = api.W - 32;
      const cw = gw / COLS;
      const ch = 30;
      return { x: 16 + b.x * cw + 2, y: top + b.y * (ch + 5), w: cw - 4, h: ch };
    };

    const push = (): void => {
      api.pushHud({ score: s.score + s.levelScore, lives: s.lives, level: s.level + 1, best: getBest(BK, 0) });
    };

    const launchBalls = (): void => {
      const sp = ballSpeed(s.level);
      s.balls = [{
        x: s.paddleX, y: api.H - 120, r: 8,
        vx: sp * 0.35 * (Math.random() < 0.5 ? -1 : 1), vy: -sp * 0.9,
      }];
      s.launched = true;
    };

    const startLevel = (lvl: number): void => {
      s.bricks = createLevel(lvl, COLS, ROWS);
      s.pws = [];
      s.paddleX = api.W / 2;
      s.paddleW = 96;
      s.frozen = 0;
      s.launched = false;
      s.levelScore = 0;
      push();
    };

    const reset = (): void => {
      s.lives = 3; s.level = 0; s.score = 0;
      s.shield = false;
      s.over = false; s.win = false;
      startLevel(0);
    };

    const endGame = (win: boolean): void => {
      s.over = true; s.win = win;
      const total = s.score + s.levelScore;
      const nb = setBest(BK, total);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, win ? '🏗️ TEMBOK RATA!' : '💥 KERIKIL HABIS!', { size: 30, color: '#fde047' });
      if (win) sfx.chime(3); else sfx.fail();
      window.setTimeout(() => {
        api.pushHud({ score: total, lives: s.lives, level: s.level + 1, best: nb });
        setScreen('over');
      }, 1300);
    };

    const applyPower = (kind: PowerKind): void => {
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, POWER_LABEL[kind], { size: 20, color: POWER_COLOR[kind] });
      sfx.pop(1.2);
      if (kind === 'panjang') s.paddleW = Math.min(170, s.paddleW + 46);
      else if (kind === 'multibola') {
        const extra: Ball[] = [];
        for (const b of s.balls) {
          for (let i = 0; i < 2; i += 1) {
            const ang = Math.random() * Math.PI * 2;
            const sp = Math.hypot(b.vx, b.vy);
            extra.push({ ...b, vx: Math.cos(ang) * sp, vy: -Math.abs(Math.sin(ang) * sp) - 60 });
          }
        }
        s.balls = s.balls.concat(extra).slice(0, 12);
      } else if (kind === 'semenbeku') s.frozen = 8;
      else if (kind === 'helm') {
        if (s.shield) { s.lives += 1; } else s.shield = true;
      }
    };

    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.over) return;
      s.paddleX = clamp(p.x, s.paddleW / 2 + 8, api.W - s.paddleW / 2 - 8);
    };
    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      s.paddleX = clamp(p.x, s.paddleW / 2 + 8, api.W - s.paddleW / 2 - 8);
      if (!s.launched) launchBalls();
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (screenRef.current !== 'play' || s.over) return;
      if (s.frozen > 0) s.frozen = Math.max(0, s.frozen - dt);

      const paddleY = api.H - 96;
      const spScale = s.frozen > 0 ? 0.55 : 1;

      // powerup jatuh
      for (const pw of s.pws) pw.y += pw.vy * dt;
      const caught: Pw[] = [];
      s.pws = s.pws.filter((pw) => {
        if (pw.y > api.H + 20) return false;
        if (pw.y > paddleY - 14 && pw.y < paddleY + 14 && Math.abs(pw.x - s.paddleX) < s.paddleW / 2 + 12) {
          caught.push(pw);
          return false;
        }
        return true;
      });
      for (const pw of caught) applyPower(pw.kind);

      // bola
      if (!s.launched) return;
      const nextBalls: Ball[] = [];
      let lostAny = false;
      for (const b0 of s.balls) {
        let b = { ...b0 };
        // semen beku memperlambat
        const sb = { ...b, vx: b.vx, vy: b.vy };
        let nb = stepBall(sb, dt * spScale);
        // dinding
        if (nb.x < nb.r + 6) { nb.x = nb.r + 6; nb.vx = Math.abs(nb.vx); sfx.click(); }
        if (nb.x > api.W - nb.r - 6) { nb.x = api.W - nb.r - 6; nb.vx = -Math.abs(nb.vx); sfx.click(); }
        if (nb.y < nb.r + 56) { nb.y = nb.r + 56; nb.vy = Math.abs(nb.vy); sfx.click(); }
        // papan bekisting
        const pr = { x: s.paddleX - s.paddleW / 2, y: paddleY - 10, w: s.paddleW, h: 20 };
        const side = circleRectHit(nb, pr);
        if (side && nb.vy > 0) {
          nb = bouncePaddle(nb, { x: pr.x, y: pr.y, w: pr.w });
          sfx.thud(0.5);
        }
        // bata
        let brickHit: Brick | null = null;
        let hitSide: ReturnType<typeof circleRectHit> = null;
        for (const br of s.bricks) {
          const bp = gridToPx(br);
          const hs = circleRectHit(nb, bp);
          if (hs) { brickHit = br; hitSide = hs; break; }
        }
        if (brickHit && hitSide) {
          nb = reflect(nb, hitSide);
          brickHit.hp -= 1;
          if (brickHit.hp <= 0) {
            s.levelScore += KIND_SCORE[brickHit.kind];
            const bp = gridToPx(brickHit);
            const colors = brickHit.kind === 'bata'
              ? ['#f87171', '#dc2626', '#fca5a5']
              : brickHit.kind === 'hebel'
                ? ['#e2e8f0', '#94a3b8', '#cbd5e1']
                : ['#a8a29e', '#57534e', '#d6d3d1'];
            api.particles.spawn(bp.x + bp.w / 2, bp.y + bp.h / 2, {
              count: 16, colors, speed: [80, 300], life: [0.3, 0.8], size: [2, 6],
              gravity: 600, shape: 'rect', rotation: true,
            });
            api.scores.add(bp.x + bp.w / 2, bp.y - 6, `+${KIND_SCORE[brickHit.kind]}`, { color: '#fff7d6', size: 16 });
            sfx.crumble(0.6);
            const pw = powerForBrick(Math.random);
            if (pw) s.pws.push({ x: bp.x + bp.w / 2, y: bp.y + bp.h / 2, vy: 130, kind: pw, id: pwId++ });
            s.bricks = s.bricks.filter((x) => x !== brickHit);
          } else {
            sfx.thud(0.4);
          }
          push();
        }
        b = nb;
        if (b.y > api.H + 30) { lostAny = true; continue; }
        nextBalls.push(b);
      }
      s.balls = nextBalls;
      if (s.bricks.length === 0) {
        // level selesai
        s.score += s.levelScore;
        sfx.chime(2);
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, '🧱 Dinding bobok!', { size: 22, color: '#4ade80' });
        if (s.level >= 4) { endGame(true); return; }
        s.level += 1;
        window.setTimeout(() => { if (!s.over) startLevel(s.level); }, 900);
        s.balls = [];
        s.launched = false;
        return;
      }
      if (lostAny && s.balls.length === 0) {
        if (s.shield) {
          s.shield = false;
          sfx.pop(0.7);
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, '⛑️ Helm menyelamatkanmu!', { size: 18, color: '#fb923c' });
          launchBalls();
        } else {
          s.lives -= 1;
          sfx.fail();
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, 'Bola kerikil jatuh!', { size: 18, color: '#fca5a5' });
          push();
          if (s.lives <= 0) { endGame(false); return; }
          s.launched = false;
        }
      }
    });

    // ---------- gambar ----------
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#101a30');
      g.addColorStop(0.5, '#1d2b4d');
      g.addColorStop(1, '#0c1222');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // blueprint grid
      ctx.strokeStyle = 'rgba(120,160,220,0.10)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // siluet gedung di kejauhan
      ctx.fillStyle = 'rgba(30,45,80,0.7)';
      const blds = [0.08, 0.22, 0.68, 0.85];
      for (let i = 0; i < blds.length; i += 1) {
        const bx = W * blds[i];
        const bw = 52 + (i % 2) * 26;
        const bh = H * (0.3 + (i % 3) * 0.12);
        ctx.fillRect(bx, H * 0.72 - bh, bw, bh);
        ctx.fillStyle = 'rgba(250,220,120,0.35)';
        for (let wy = H * 0.72 - bh + 12; wy < H * 0.72 - 10; wy += 22) {
          for (let wx = bx + 8; wx < bx + bw - 8; wx += 18) ctx.fillRect(wx, wy, 9, 12);
        }
        ctx.fillStyle = 'rgba(30,45,80,0.7)';
      }
      // tanah proyek
      const tg = ctx.createLinearGradient(0, H * 0.9, 0, H);
      tg.addColorStop(0, '#4a3826');
      tg.addColorStop(1, '#2e2115');
      ctx.fillStyle = tg;
      ctx.fillRect(0, H * 0.9, W, H * 0.1);
    };

    const drawBrick = (ctx: CanvasRenderingContext2D, br: Brick): void => {
      const p = gridToPx(br);
      const dmg = br.hp / KIND_HP[br.kind];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      let g: CanvasGradient;
      if (br.kind === 'bata') {
        g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        g.addColorStop(0, '#f87171'); g.addColorStop(0.55, '#dc2626'); g.addColorStop(1, '#991b1b');
      } else if (br.kind === 'hebel') {
        g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        g.addColorStop(0, '#f1f5f9'); g.addColorStop(0.55, '#cbd5e1'); g.addColorStop(1, '#94a3b8');
      } else {
        g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        g.addColorStop(0, '#d6d3d1'); g.addColorStop(0.55, '#a8a29e'); g.addColorStop(1, '#57534e');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(p.x, p.y, p.w, p.h, 5);
      else ctx.rect(p.x, p.y, p.w, p.h);
      ctx.fill();
      ctx.restore();
      // garis adukan semen
      ctx.strokeStyle = 'rgba(60,40,20,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3, 4);
      else ctx.rect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
      ctx.stroke();
      // tekstur bata merah
      if (br.kind === 'bata') {
        ctx.fillStyle = 'rgba(120,20,20,0.35)';
        for (let i = 0; i < 3; i += 1) ctx.fillRect(p.x + 6 + i * ((p.w - 12) / 3), p.y + 5, 3, p.h - 10);
      }
      if (br.kind === 'hebel') {
        ctx.fillStyle = 'rgba(100,116,139,0.4)';
        for (let i = 0; i < 4; i += 1) ctx.fillRect(p.x + 5, p.y + 6 + i * 6, p.w - 10, 2);
      }
      // highlight atas
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(p.x + 3, p.y + 2, p.w - 6, 4);
      // retakan bila rusak
      if (dmg < 1) {
        ctx.strokeStyle = 'rgba(20,10,5,0.75)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x + p.w * 0.3, p.y);
        ctx.lineTo(p.x + p.w * 0.55, p.y + p.h * 0.5);
        ctx.lineTo(p.x + p.w * 0.4, p.y + p.h);
        ctx.stroke();
      }
      // label kecil
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `800 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(br.kind === 'bata' ? 'BATA' : br.kind === 'hebel' ? 'HEBEL' : 'BETON', p.x + p.w / 2, p.y + p.h / 2);
    };

    const drawPaddle = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const y = H - 96;
      const w = s.paddleW;
      const x = s.paddleX - w / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      const g = ctx.createLinearGradient(0, y - 10, 0, y + 10);
      g.addColorStop(0, '#d9a45b');
      g.addColorStop(0.5, '#a06a35');
      g.addColorStop(1, '#6b4420');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y - 10, w, 20, 8);
      else ctx.rect(x, y - 10, w, 20);
      ctx.fill();
      ctx.restore();
      // papan bekisting: papan-papan kayu
      ctx.strokeStyle = 'rgba(60,35,12,0.55)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 5; i += 1) {
        const lx = x + (w / 5) * i;
        ctx.beginPath(); ctx.moveTo(lx, y - 9); ctx.lineTo(lx, y + 9); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,235,190,0.25)';
      ctx.fillRect(x + 3, y - 8, w - 6, 5);
      // helm pelindung di atas papan
      if (s.shield) {
        const hx = s.paddleX;
        const hg = ctx.createLinearGradient(hx - 14, y - 30, hx + 14, y - 10);
        hg.addColorStop(0, '#fde047');
        hg.addColorStop(1, '#f59e0b');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(hx, y - 8, 15, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(hx - 18, y - 10, 36, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.ellipse(hx - 5, y - 20, 4, 6, -0.4, 0, TAU); ctx.fill();
      }
    };

    const drawBall = (ctx: CanvasRenderingContext2D, b: Ball): void => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 8;
      const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#e7e5e4');
      g.addColorStop(0.6, '#a8a29e');
      g.addColorStop(1, '#57534e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      // tekstur kerikil
      ctx.fillStyle = 'rgba(68,64,60,0.6)';
      ctx.beginPath(); ctx.arc(b.x - 2, b.y + 2, 1.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x + 3, b.y - 1, 1.3, 0, TAU); ctx.fill();
      ctx.restore();
    };

    const drawPowerup = (ctx: CanvasRenderingContext2D, pw: Pw): void => {
      const bob = Math.sin(s.t * 6 + pw.id) * 3;
      ctx.save();
      ctx.translate(pw.x, pw.y + bob);
      ctx.shadowColor = POWER_COLOR[pw.kind];
      ctx.shadowBlur = 14;
      ctx.fillStyle = POWER_COLOR[pw.kind];
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#0c1222';
      ctx.font = `900 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pw.kind === 'panjang' ? '↔' : pw.kind === 'multibola' ? '✸' : pw.kind === 'semenbeku' ? '❄' : '⛑', 0, 1);
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      drawBackground(ctx, W, H);
      for (const br of s.bricks) drawBrick(ctx, br);
      for (const pw of s.pws) drawPowerup(ctx, pw);
      drawPaddle(ctx, W, H);
      if (!s.launched && !s.over && screenRef.current === 'play') {
        const g = ctx.createRadialGradient(s.paddleX - 3, H - 128, 1, s.paddleX, H - 120, 9);
        g.addColorStop(0, '#e7e5e4'); g.addColorStop(1, '#57534e');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.paddleX, H - 120, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `800 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('👆 ketuk untuk meluncurkan', s.paddleX, H - 140);
      }
      for (const b of s.balls) drawBall(ctx, b);
      if (s.frozen > 0) {
        ctx.fillStyle = 'rgba(125,211,252,0.08)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = `800 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`🧊 Semen beku ${Math.ceil(s.frozen)}s`, W / 2, H - 60);
      }
      // nyawa sebagai helm
      ctx.font = `20px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('⛑️'.repeat(Math.max(0, s.lives)), 12, H - 30);
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(5,8,18,0.5)');
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
    sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
    setScreen('play');
  };
  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    sfx.ensure();
    if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
  };
  const toggleMute = (): void => {
    sfx.ensure();
    sfx.toggleMute();
    setMuted(sfx.muted);
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(10,15,30,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#101a30', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,15,30,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 140 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>🧱 Dinding {hud.level}/5</div>
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
          <div style={{ fontSize: 42 }}>🧱</div>
          <h2 style={h2}>BOBOK TEMBOK</h2>
          <p style={p}>
            Hancurkan susunan <b>bata, hebel, dan beton</b> pakai bola kerikil!
            <b> Geser jari</b> untuk menggerakkan papan bekisting.
            Tangkap <b>powerup</b>: papan lebar 📏, multibola ✸, semen beku ❄, helm nyawa ⛑.
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Membobok</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Temboknya nungguin, santai dulu.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{hud.lives > 0 ? '🏗️' : '💥'}</div>
          <h2 style={h2}>{hud.lives > 0 ? 'SEMUA TEMBOK RATA!' : 'KERIKIL HABIS!'}</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
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
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0e7ff' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fde047', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,12,26,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1d2b4d,#0c1222)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e0e7ff' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
