/**
 * ArcadeSpaceInvaders ("Tembak Deadline") — tembak tanggal-tanggal deadline
 * & revisi yang berjatuhan sebelum mencapai mejamu!
 * Tameng = tumpukan RAB, nyawa 3, waspada Mandor lewat (bonus 200).
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  DEADLINES, waveSpec, scoreForRow, UFO_SCORE, speedFactor,
  rectsOverlap, makeShield, erodeShield, MAX_LIVES,
  type WaveSpec,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tembak-deadline', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface Bullet { x: number; y: number; vy: number }
interface Enemy { r: number; c: number; alive: boolean; wob: number }
interface Ufo { x: number; dir: number; active: boolean }
interface Shield { x: number; grid: boolean[][] }

interface S {
  spec: WaveSpec;
  wave: number;
  score: number;
  lives: number;
  px: number; // pemain x
  targetX: number;
  py: number;
  bullets: Bullet[];
  ebullets: Bullet[];
  enemies: Enemy[];
  total: number;
  fx: number; // formasi origin x
  fy: number;
  dir: number;
  fireT: number;
  fireCd: number;
  ufo: Ufo;
  ufoT: number;
  shields: Shield[];
  over: boolean;
  t: number;
  flash: number;
  waveMsg: number;
  papers: { x: number; y: number; r: number; v: number; rot: number }[];
}

const EW = 38; // lebar deadline chip (formasi harus muat di 390px)
const EH = 30;
const GAPX = 8;
const GAPY = 14;

export default function ArcadeSpaceInvaders({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, wave: 1, lives: MAX_LIVES, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      spec: waveSpec(1), wave: 1, score: 0, lives: MAX_LIVES,
      px: api.W / 2, targetX: api.W / 2, py: api.H - 70,
      bullets: [], ebullets: [], enemies: [], total: 1,
      fx: 0, fy: 120, dir: 1, fireT: 1.2, fireCd: 0.3,
      ufo: { x: -80, dir: 1, active: false }, ufoT: 12,
      shields: [], over: false, t: 0, flash: 0, waveMsg: 0,
      papers: Array.from({ length: 10 }, (_, i) => ({
        x: (i * 89) % 400, y: (i * 137) % 600, r: 8 + (i % 3) * 5, v: 12 + (i % 4) * 8, rot: i,
      })),
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, wave: s.wave, lives: s.lives, best: getBest(BK, 0) });
    };

    const formationW = (): number => s.spec.cols * EW + (s.spec.cols - 1) * GAPX;

    const newWave = (wave: number): void => {
      s.wave = wave;
      s.spec = waveSpec(wave);
      s.enemies = [];
      for (let r = 0; r < s.spec.rows; r += 1) {
        for (let c = 0; c < s.spec.cols; c += 1) {
          s.enemies.push({ r, c, alive: true, wob: rng() * TAU });
        }
      }
      s.total = s.enemies.length;
      s.fx = (api.W - formationW()) / 2;
      s.fy = 118;
      s.dir = 1;
      s.bullets = [];
      s.ebullets = [];
      s.ufo.active = false;
      s.ufoT = s.spec.ufoInterval * (0.6 + rng() * 0.5);
      // tameng RAB baru tiap wave
      const sw = 13; const sh = 7;
      s.shields = [0.18, 0.5, 0.82].map((f) => ({
        x: api.W * f - (sw * 6) / 2,
        grid: makeShield(sw, sh),
      }));
      s.waveMsg = 2.2;
      push();
    };

    const reset = (): void => {
      s.score = 0;
      s.lives = MAX_LIVES;
      s.px = api.W / 2;
      s.targetX = api.W / 2;
      s.py = api.H - 70;
      s.over = false;
      s.flash = 0;
      s.fireCd = 0.3;
      s.fireT = 1.4;
      newWave(1);
    };

    const gameOver = (): void => {
      s.over = true;
      const nb = setBest(BK, s.score);
      api.sfx.fail();
      api.shake.add(0.7);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'DEADLINE MENANG! 📅', { size: 30, color: '#f87171' });
      window.setTimeout(() => {
        api.pushHud({ score: s.score, wave: s.wave, lives: 0, best: nb });
        setScreen('over');
      }, 1300);
    };

    const enemyXY = (e: Enemy): { x: number; y: number } => ({
      x: s.fx + e.c * (EW + GAPX),
      y: s.fy + e.r * (EH + GAPY) + Math.sin(s.t * 3 + e.wob) * 3,
    });

    const killEnemy = (e: Enemy): void => {
      e.alive = false;
      const pts = scoreForRow(e.r);
      s.score += pts;
      const p = enemyXY(e);
      api.sfx.pop(1 + rng() * 0.3);
      api.particles.spawn(p.x + EW / 2, p.y + EH / 2, {
        count: 16, colors: ['#f87171', '#fb923c', '#fde047', '#ffffff'],
        speed: [80, 300], life: [0.35, 0.8], size: [2, 5], gravity: 380, shape: 'rect', rotation: true,
      });
      api.scores.add(p.x + EW / 2, p.y, `+${pts}`, { color: '#fef08a', size: 16 });
      push();
      const alive = s.enemies.filter((x) => x.alive).length;
      if (alive === 0) {
        s.score += 100 * s.wave;
        api.sfx.chime(4);
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, `WAVE ${s.wave} BERES!`, { size: 28, color: '#4ade80' });
        window.setTimeout(() => {
          if (!s.over && screenRef.current === 'play') newWave(s.wave + 1);
        }, 1300);
      }
    };

    const hitPlayer = (): void => {
      s.lives -= 1;
      s.flash = 0.4;
      api.sfx.thud(1);
      api.shake.add(0.5);
      api.particles.spawn(s.px, s.py, {
        count: 24, colors: ['#f87171', '#ef4444', '#fbbf24'],
        speed: [100, 340], life: [0.4, 0.9], size: [2, 6], gravity: 420, shape: 'rect', rotation: true,
      });
      push();
      if (s.lives <= 0) gameOver();
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      s.targetX = clamp(p.x, 30, api.W - 30);
    };
    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.over) return;
      s.targetX = clamp(p.x, 30, api.W - 30);
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.over) return;
      s.t += dt;
      if (s.flash > 0) s.flash -= dt;
      if (s.waveMsg > 0) s.waveMsg -= dt;

      // kertas melayang
      for (const pp of s.papers) {
        pp.y += pp.v * dt;
        pp.rot += dt * 0.4;
        if (pp.y > api.H + 20) { pp.y = -20; pp.x = rng() * api.W; }
      }

      // pemain
      const kbd = 380 * dt;
      if (api.input.down('ArrowLeft') || api.input.down('a')) s.targetX = clamp(s.targetX - kbd, 30, api.W - 30);
      if (api.input.down('ArrowRight') || api.input.down('d')) s.targetX = clamp(s.targetX + kbd, 30, api.W - 30);
      s.px += (s.targetX - s.px) * Math.min(1, dt * 12);

      // tembak otomatis
      s.fireCd -= dt;
      if (s.fireCd <= 0) {
        s.fireCd = 0.3;
        if (s.bullets.length < 4) {
          s.bullets.push({ x: s.px, y: s.py - 30, vy: -560 });
          api.sfx.click();
        }
      }

      // peluru pemain
      const aliveEnemies = s.enemies.filter((e) => e.alive);
      const nb: Bullet[] = [];
      for (const b of s.bullets) {
        b.y += b.vy * dt;
        if (b.y < -20) continue;
        const br = { x: b.x - 3, y: b.y - 10, w: 6, h: 18 };
        let consumed = false;
        for (const e of aliveEnemies) {
          if (!e.alive) continue;
          const p = enemyXY(e);
          if (rectsOverlap(br, { x: p.x, y: p.y, w: EW, h: EH })) {
            killEnemy(e);
            consumed = true;
            break;
          }
        }
        if (!consumed && s.ufo.active) {
          if (rectsOverlap(br, { x: s.ufo.x - 34, y: 66, w: 68, h: 26 })) {
            s.ufo.active = false;
            s.score += UFO_SCORE;
            api.sfx.chime(3);
            api.scores.add(s.ufo.x, 100, `+${UFO_SCORE} MANDOR!`, { color: '#fde047', size: 20 });
            const wrap = wrapRef.current;
            if (wrap) popText(wrap, 'Mandor kena! +200', { size: 20, color: '#fde047' });
            push();
            consumed = true;
          }
        }
        if (!consumed) nb.push(b);
      }
      s.bullets = nb;

      // formasi deadline
      const alive = s.enemies.filter((e) => e.alive);
      const spd = s.spec.xSpeed * speedFactor(alive.length, s.total);
      s.fx += s.dir * spd * dt;
      let minX = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (const e of alive) {
        const p = enemyXY(e);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x + EW);
        maxY = Math.max(maxY, p.y + EH);
      }
      if (alive.length > 0 && (minX < 8 || maxX > api.W - 8)) {
        s.dir *= -1;
        s.fy += s.spec.yDrop;
        s.fx = clamp(s.fx, 8 - (minX - s.fx), api.W - 8 - (maxX - s.fx));
        api.sfx.thud(0.4);
      }
      if (maxY > s.py - 24) {
        gameOver();
        return;
      }

      // tembakan musuh
      s.fireT -= dt;
      if (s.fireT <= 0 && alive.length > 0) {
        s.fireT = s.spec.fireInterval * (0.7 + rng() * 0.6);
        // pilih penembak: yang paling bawah per kolom
        const bottom = new Map<number, Enemy>();
        for (const e of alive) {
          const cur = bottom.get(e.c);
          if (!cur || e.r > cur.r) bottom.set(e.c, e);
        }
        const shooters = [...bottom.values()];
        const sh = shooters[Math.floor(rng() * shooters.length)];
        const p = enemyXY(sh);
        s.ebullets.push({ x: p.x + EW / 2, y: p.y + EH, vy: 200 + s.wave * 22 });
      }

      // peluru musuh
      const neb: Bullet[] = [];
      for (const b of s.ebullets) {
        b.y += b.vy * dt;
        if (b.y > api.H + 20) continue;
        let consumed = false;
        // tameng RAB
        for (const sh of s.shields) {
          const lx = b.x - sh.x;
          const ly = b.y - (s.py - 130);
          const gx = Math.floor(lx / 6);
          const gy = Math.floor(ly / 6);
          if (gx >= 0 && gx < 13 && gy >= 0 && gy < 7 && sh.grid[gy]?.[gx]) {
            erodeShield(sh.grid, gx, gy, 2.2);
            api.sfx.click();
            consumed = true;
            break;
          }
        }
        // pemain
        if (!consumed && Math.abs(b.x - s.px) < 20 && Math.abs(b.y - s.py) < 26) {
          hitPlayer();
          consumed = true;
          if (s.over) return;
        }
        if (!consumed) neb.push(b);
      }
      s.ebullets = neb;

      // mandor lewat (UFO)
      if (!s.ufo.active) {
        s.ufoT -= dt;
        if (s.ufoT <= 0) {
          s.ufo.active = true;
          s.ufo.dir = rng() < 0.5 ? 1 : -1;
          s.ufo.x = s.ufo.dir === 1 ? -60 : api.W + 60;
          s.ufoT = s.spec.ufoInterval;
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, '👷 Mandor lewat!', { size: 16, color: '#93c5fd' });
        }
      } else {
        s.ufo.x += s.ufo.dir * 130 * dt;
        if (s.ufo.x < -90 || s.ufo.x > api.W + 90) s.ufo.active = false;
      }
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0b1e3a');
      g.addColorStop(0.6, '#12294d');
      g.addColorStop(1, '#070f20');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // grid blueprint
      ctx.strokeStyle = 'rgba(125,180,240,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 24; x < W; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 24; y < H; y += 24) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // kertas melayang
      ctx.save();
      for (const pp of s.papers) {
        ctx.save();
        ctx.translate(pp.x, pp.y);
        ctx.rotate(pp.rot);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-pp.r / 2, -pp.r * 0.65, pp.r, pp.r * 1.3);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#94a3b8';
        for (let i = 0; i < 3; i += 1) {
          ctx.fillRect(-pp.r / 2 + 2, -pp.r * 0.4 + i * 5, pp.r - 4, 2);
        }
        ctx.restore();
      }
      ctx.restore();
      // meja bawah
      const dg = ctx.createLinearGradient(0, H - 44, 0, H);
      dg.addColorStop(0, '#3f2d1c');
      dg.addColorStop(1, '#241708');
      ctx.fillStyle = dg;
      ctx.fillRect(0, H - 44, W, 44);
      ctx.fillStyle = 'rgba(255,220,160,0.12)';
      ctx.fillRect(0, H - 44, W, 3);
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D): void => {
      const x = s.px; const y = s.py;
      ctx.save();
      // bayangan
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + 22, 22, 6, 0, 0, TAU);
      ctx.fill();
      // badan (rompi proyek)
      const bg = ctx.createLinearGradient(x - 14, y - 14, x + 14, y + 18);
      bg.addColorStop(0, '#fb923c');
      bg.addColorStop(1, '#c2410c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x - 14, y - 14, 14 * 2, 32, 8);
      else ctx.rect(x - 14, y - 14, 28, 32);
      ctx.fill();
      // strip reflektif
      ctx.fillStyle = 'rgba(253,224,71,0.85)';
      ctx.fillRect(x - 14, y - 4, 28, 5);
      ctx.fillRect(x - 14, y + 6, 28, 5);
      // kepala
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath();
      ctx.arc(x, y - 22, 11, 0, TAU);
      ctx.fill();
      // helm
      const hg = ctx.createLinearGradient(0, y - 44, 0, y - 26);
      hg.addColorStop(0, '#fde047');
      hg.addColorStop(1, '#d97706');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, y - 26, 11, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(x - 14, y - 29, 28, 4);
      // stempel penembak
      ctx.save();
      ctx.translate(x, y - 34);
      const pulse = 1 + Math.sin(s.t * 10) * 0.08;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, -14);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
    };

    const drawEnemy = (ctx: CanvasRenderingContext2D, e: Enemy): void => {
      const p = enemyXY(e);
      const label = DEADLINES[e.r % DEADLINES.length];
      const hot = e.r === 0;
      ctx.save();
      ctx.translate(p.x + EW / 2, p.y + EH / 2);
      ctx.rotate(Math.sin(s.t * 2.4 + e.wob) * 0.06);
      ctx.translate(-EW / 2, -EH / 2);
      if (hot) {
        ctx.shadowColor = 'rgba(248,113,113,0.8)';
        ctx.shadowBlur = 12;
      }
      // badan kalender
      const bg = ctx.createLinearGradient(0, 0, 0, EH);
      bg.addColorStop(0, hot ? '#fca5a5' : '#fdba74');
      bg.addColorStop(1, hot ? '#dc2626' : '#c2410c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, EW, EH, 7);
      else ctx.rect(0, 0, EW, EH);
      ctx.fill();
      ctx.shadowBlur = 0;
      // strip atas kalender
      ctx.fillStyle = hot ? '#7f1d1d' : '#7c2d12';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, EW, 9, [7, 7, 0, 0]);
      else ctx.rect(0, 0, EW, 9);
      ctx.fill();
      // label
      ctx.fillStyle = '#fff';
      ctx.font = `900 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, EW / 2, EH / 2 + 4);
      ctx.restore();
    };

    const drawShield = (ctx: CanvasRenderingContext2D, sh: Shield): void => {
      const y0 = s.py - 130;
      for (let r = 0; r < sh.grid.length; r += 1) {
        for (let c = 0; c < sh.grid[0].length; c += 1) {
          if (!sh.grid[r][c]) continue;
          const v = ((r * 13 + c * 7) % 20) / 20;
          ctx.fillStyle = `rgb(${225 + v * 20},${228 + v * 18},${235})`;
          ctx.fillRect(sh.x + c * 6, y0 + r * 6, 5.4, 5.4);
        }
      }
      ctx.fillStyle = 'rgba(226,232,240,0.6)';
      ctx.font = `700 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('RAB', sh.x + (13 * 6) / 2, y0 - 8);
    };

    const drawUfo = (ctx: CanvasRenderingContext2D): void => {
      if (!s.ufo.active) return;
      const x = s.ufo.x; const y = 80;
      ctx.save();
      // piring = helm raksasa
      const hg = ctx.createLinearGradient(0, y - 16, 0, y + 10);
      hg.addColorStop(0, '#fde047');
      hg.addColorStop(1, '#b45309');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(x, y, 34, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath();
      ctx.arc(x, y - 8, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, y - 10, 10, Math.PI, TAU);
      ctx.fill();
      // lampu kelip
      const on = Math.sin(s.t * 12) > 0;
      ctx.fillStyle = on ? '#f87171' : '#7f1d1d';
      for (const dx of [-22, 0, 22]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + 8, 3.5, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#451a03';
      ctx.font = `900 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('MANDOR', x, y + 2);
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      for (const sh of s.shields) drawShield(ctx, sh);
      drawUfo(ctx);
      for (const e of s.enemies) {
        if (e.alive) drawEnemy(ctx, e);
      }
      // peluru pemain: baut bercahaya
      for (const b of s.bullets) {
        ctx.save();
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10;
        const g = ctx.createLinearGradient(0, b.y - 12, 0, b.y + 6);
        g.addColorStop(0, '#a5f3fc');
        g.addColorStop(1, '#0891b2');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x - 3, b.y - 12, 6, 18, 3);
        else ctx.rect(b.x - 3, b.y - 12, 6, 18);
        ctx.fill();
        ctx.restore();
      }
      // peluru musuh: memo merah jatuh
      for (const b of s.ebullets) {
        ctx.save();
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `900 8px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', b.x, b.y + 0.5);
        ctx.restore();
      }
      drawPlayer(ctx);
      // banner wave
      if (s.waveMsg > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(s.waveMsg, 0, 1);
        ctx.fillStyle = '#fde047';
        ctx.font = `900 30px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`WAVE ${s.wave}`, W / 2, H * 0.45);
        ctx.font = `700 14px ${FONT}`;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText('Deadline makin galak!', W / 2, H * 0.45 + 28);
        ctx.restore();
      }
      ctx.restore();
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(220,38,38,${clamp(s.flash * 1.2, 0, 0.4)})`;
        ctx.fillRect(0, 0, W, H);
      }
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(3,6,14,0.5)');
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
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(10,20,38,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0b1e3a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,20,38,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fef08a' }}>{hud.score.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            {'❤️'.repeat(Math.max(0, hud.lives))}{'🤍'.repeat(Math.max(0, MAX_LIVES - hud.lives))} • Wave {hud.wave}
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
      <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: 'rgba(226,232,240,0.6)', fontWeight: 700, zIndex: 4, pointerEvents: 'none' }}>
        Geser untuk bergerak • tembakan otomatis 🔫
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>📅</div>
          <h2 style={h2}>TEMBAK DEADLINE</h2>
          <p style={p}>
            Tanggal-tanggal <b>deadline & revisi</b> berjatuhan dari atas!
            <b> Geser</b> tukangmu untuk bergerak — tembakan <b>otomatis</b>.
            Berlindung di balik <b>tumpukan RAB</b>!
          </p>
          <p style={p}>👷 <b>Mandor lewat</b> sesekali — tembak dia untuk <b>+200</b>!</p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Lembur</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Deadline ikut nunggu. Kopi dulu biar tidak panik.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>📅</div>
          <h2 style={h2}>DEADLINE MENANG!</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fef08a' }}>{hud.score.toLocaleString('id-ID')}</div>
          <p style={p}>Wave {hud.wave} • Terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>
          <button style={primaryBtn} onClick={startGame}>Lembur Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fef08a', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0f2fe' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#93c5fd', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,10,22,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1b3a5f,#0a1830)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
