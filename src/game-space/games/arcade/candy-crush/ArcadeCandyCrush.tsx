/**
 * ArcadeCandyCrush ("Material Match") — match-3 material konstruksi.
 * Tukar bata/semen/besi/kayu/kaca: 3+ sejajar hancur, 4 = Baja, 5 = Dinamit.
 * Memakai logic.ts yang sudah ada (resolveBoard/detonate/shuffleBoard).
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  createBoard, trySwap, resolveBoard, detonate, hasPossibleMove, shuffleBoard,
  levelConfig, MATERIALS,
  ROWS, COLS,
  type Board, type Pos, type ResolveResult, type Special,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('material-match', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';
type Phase = 'idle' | 'swapAnim' | 'crushAnim' | 'fallAnim';

interface RCell {
  id: number;
  t: number;
  s: Special;
  cx: number; cy: number; // posisi render saat ini (px)
  tx: number; ty: number; // target
  scale: number;
  dying: number; // >0 = sedang hancur (sisa waktu)
  born: number; // waktu pop-in
}

interface S {
  board: Board;
  cells: RCell[];
  sel: Pos | null;
  score: number;
  moves: number;
  level: number;
  target: number;
  phase: Phase;
  phaseT: number;
  resolve: ResolveResult | null;
  stepIdx: number;
  over: boolean;
  won: boolean;
  seed: number;
  invalidFlash: number; // timer tile invalid
  invalidA: Pos | null;
  invalidB: Pos | null;
  // layout
  bx: number; by: number; cell: number;
}

const MAT_COLORS: [string, string][] = [
  ['#f87171', '#991b1b'], // bata
  ['#d6d3d1', '#78716c'], // semen
  ['#94a3b8', '#334155'], // besi
  ['#d9a05b', '#8a5a24'], // kayu
  ['#a5e3fc', '#0369a1'], // kaca
];
const MAT_EMOJI = ['🧱', '🧺', '🔩', '🪵', '🪟'];

export default function ArcadeCandyCrush({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ score: 0, target: 2500, moves: 30, level: 1, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      board: createBoard((Date.now() % 100000) | 0),
      cells: [], sel: null, score: 0, moves: 30, level: 1, target: 2500,
      phase: 'idle', phaseT: 0, resolve: null, stepIdx: 0,
      over: false, won: false, seed: (Date.now() % 100000) | 0,
      invalidFlash: 0, invalidA: null, invalidB: null,
      bx: 0, by: 0, cell: 40,
    };

    const layout = (): void => {
      const W = api.W;
      const H = api.H;
      const cell = Math.min((W - 24) / COLS, (H * 0.62) / ROWS, 52);
      s.cell = cell;
      s.bx = W / 2 - (cell * COLS) / 2;
      s.by = H * 0.30;
    };
    layout();
    api.onResize(() => {
      layout();
      // hitung ulang target dari papan
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const cell = s.board[r][c];
          const rc = s.cells.find((x) => x.id === cell.id);
          if (rc) {
            const { x, y } = cellXY(r, c);
            rc.tx = x; rc.ty = y;
            if (rc.born <= 0 && rc.dying <= 0) { rc.cx = x; rc.cy = y; }
          }
        }
      }
    });

    const cellXY = (r: number, c: number): { x: number; y: number } => ({
      x: s.bx + c * s.cell,
      y: s.by + r * s.cell,
    });

    /** Sinkronkan render-cells dengan papan logika (animasi jatuh otomatis). */
    const reconcile = (board: Board): void => {
      const old = new Map<number, RCell>();
      for (const rc of s.cells) old.set(rc.id, rc);
      const next: RCell[] = [];
      const freshByCol = new Map<number, number>();
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const cell = board[r][c];
          const { x, y } = cellXY(r, c);
          const prev = old.get(cell.id);
          if (prev) {
            prev.t = cell.t; prev.s = cell.s;
            prev.tx = x; prev.ty = y;
            next.push(prev);
          } else {
            const k = (freshByCol.get(c) ?? 0) + 1;
            freshByCol.set(c, k);
            next.push({
              id: cell.id, t: cell.t, s: cell.s,
              cx: x, cy: y - k * s.cell * 1.6,
              tx: x, ty: y, scale: 1, dying: 0, born: 0.25,
            });
          }
        }
      }
      s.cells = next;
      s.board = board;
    };

    const push = (): void => {
      api.pushHud({ score: s.score, target: s.target, moves: s.moves, level: s.level, best: getBest(BK, 0) });
    };

    const reset = (level: number): void => {
      s.level = level;
      const cfg = levelConfig(level);
      s.target = cfg.target;
      s.moves = cfg.moves;
      s.score = 0;
      s.seed = (Date.now() % 100000) | 0;
      s.board = createBoard(s.seed);
      s.sel = null;
      s.phase = 'idle';
      s.resolve = null;
      s.over = false;
      s.won = false;
      // render cells langsung tanpa animasi jatuh
      s.cells = [];
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const cell = s.board[r][c];
          const { x, y } = cellXY(r, c);
          s.cells.push({ id: cell.id, t: cell.t, s: cell.s, cx: x, cy: y, tx: x, ty: y, scale: 1, dying: 0, born: 0 });
        }
      }
      push();
    };

    const burstAt = (r: number, c: number, t: number, big: boolean): void => {
      const { x, y } = cellXY(r, c);
      const colors = big
        ? ['#fde047', '#fbbf24', '#fff7d6', '#f97316']
        : [MAT_COLORS[t][0], MAT_COLORS[t][1], '#ffffff'];
      api.particles.spawn(x + s.cell / 2, y + s.cell / 2, {
        count: big ? 26 : 12,
        colors,
        speed: [80, big ? 420 : 300],
        life: [0.35, 0.8],
        size: [2, big ? 7 : 5],
        gravity: 500, shape: 'rect', rotation: true,
      });
    };

    const processStep = (idx: number): void => {
      const res = s.resolve!;
      if (idx >= res.steps.length) {
        // selesai: cek shuffle / menang / kalah
        s.phase = 'idle';
        s.resolve = null;
        s.sel = null;
        if (!hasPossibleMove(s.board)) {
          s.board = shuffleBoard(s.board, (s.seed + 7) | 0);
          reconcile(s.board);
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, '🔀 Material diacak!', { size: 20, color: '#7dd3fc' });
          api.sfx.whoosh();
        }
        if (s.score >= s.target && !s.over) {
          s.over = true;
          s.won = true;
          const nb = setBest(BK, s.score);
          api.sfx.chime(4);
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, '🎯 TARGET TERCAPAI!', { size: 30, color: '#4ade80' });
          api.particles.spawn(api.W / 2, api.H * 0.45, {
            count: 70, colors: ['#4ade80', '#bbf7d0', '#fde047', '#ffffff'],
            speed: [120, 420], life: [0.6, 1.2], size: [2, 6], gravity: 300, shape: 'rect', rotation: true,
          });
          window.setTimeout(() => {
            api.pushHud({ score: s.score, target: s.target, moves: s.moves, level: s.level, best: nb });
            setScreen('over');
          }, 1400);
        } else if (s.moves <= 0 && !s.over) {
          s.over = true;
          s.won = false;
          setBest(BK, s.score);
          api.sfx.fail();
          window.setTimeout(() => setScreen('over'), 900);
        }
        push();
        return;
      }
      const stp = res.steps[idx];
      s.stepIdx = idx;
      // tandai yang hancur
      const dyingIds = new Set(stp.cleared.map((cc) => cc.id));
      let big = false;
      for (const rc of s.cells) {
        if (dyingIds.has(rc.id)) {
          rc.dying = 0.3;
          const cl = stp.cleared.find((x) => x.id === rc.id)!;
          const isBig = cl.s !== 'none' || stp.spawned.length > 0;
          if (isBig) big = true;
          burstAt(cl.r, cl.c, cl.t, isBig);
        }
      }
      // skor mengambang
      if (stp.gained > 0) {
        const fc = stp.cleared[Math.floor(stp.cleared.length / 2)] ?? { r: 3, c: 3 };
        const { x, y } = cellXY(fc.r, fc.c);
        api.scores.add(x + s.cell / 2, y, `+${stp.gained}`, {
          color: big ? '#fde047' : '#fef3c7', size: big ? 24 : 17,
        });
      }
      s.score += stp.gained;
      if (big) {
        api.shake.add(0.45);
        api.sfx.thud(1.2);
      } else {
        api.sfx.pop(0.9 + Math.random() * 0.3);
      }
      // special baru: ledakan kecil perayaan
      for (const sp of stp.spawned) burstAt(sp.r, sp.c, sp.t, true);
      s.phase = 'crushAnim';
      s.phaseT = 0.32;
      push();
    };

    const doSwap = (a: Pos, b: Pos): void => {
      const info = trySwap(s.board, a, b);
      if (!info) {
        s.invalidA = a; s.invalidB = b; s.invalidFlash = 0.35;
        api.sfx.click();
        s.sel = null;
        return;
      }
      s.moves -= 1;
      s.sel = null;
      api.sfx.ensure();
      api.sfx.whoosh();
      reconcile(info.board);
      s.seed = (s.seed + 13) | 0;
      s.resolve = info.detonated
        ? detonate(info.board, info.detonated, s.seed)
        : resolveBoard(info.board, a, s.seed);
      if (info.detonated) api.shake.add(0.5);
      s.phase = 'swapAnim';
      s.phaseT = 0.16;
      push();
    };

    const tileFromPoint = (x: number, y: number): Pos | null => {
      const c = Math.floor((x - s.bx) / s.cell);
      const r = Math.floor((y - s.by) / s.cell);
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
      return { r, c };
    };

    let downPos: Pos | null = null;

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.over || s.phase !== 'idle') return;
      downPos = tileFromPoint(p.x, p.y);
    };

    api.input.onUp = (p) => {
      if (screenRef.current !== 'play' || s.over || s.phase !== 'idle' || !downPos) { downPos = null; return; }
      const up = tileFromPoint(p.x, p.y);
      if (!up) { s.sel = null; downPos = null; return; }
      if (downPos.r === up.r && downPos.c === up.c) {
        // tap: pilih / tukar dengan yang dipilih
        if (!s.sel) {
          s.sel = up;
          api.sfx.click();
        } else if (s.sel.r === up.r && s.sel.c === up.c) {
          s.sel = null;
        } else {
          const dr = Math.abs(s.sel.r - up.r) + Math.abs(s.sel.c - up.c);
          if (dr === 1) doSwap(s.sel, up);
          else { s.sel = up; api.sfx.click(); }
        }
      } else {
        // swipe antar tile bersebelahan
        const dr = Math.abs(downPos.r - up.r) + Math.abs(downPos.c - up.c);
        if (dr === 1) doSwap(downPos, up);
        else s.sel = null;
      }
      downPos = null;
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      // animasi render-cells selalu jalan (walau pause, biar halus)
      const k = api.reducedMotion ? 1 : Math.min(1, dt * 14);
      for (const rc of s.cells) {
        rc.cx += (rc.tx - rc.cx) * k;
        rc.cy += (rc.ty - rc.cy) * k;
        if (rc.born > 0) rc.born = Math.max(0, rc.born - dt);
        if (rc.dying > 0) {
          rc.dying -= dt;
          rc.scale = Math.max(0.01, rc.dying / 0.3);
        } else if (rc.born > 0) {
          const kk = 1 - rc.born / 0.25;
          rc.scale = 0.4 + 0.6 * Math.min(1, kk * 1.4);
        } else {
          rc.scale += (1 - rc.scale) * Math.min(1, dt * 10);
        }
      }
      s.cells = s.cells.filter((rc) => rc.dying <= 0 || rc.scale > 0.02);
      if (s.invalidFlash > 0) s.invalidFlash -= dt;

      if (screenRef.current !== 'play' || s.over) return;
      if (s.phase === 'swapAnim' || s.phase === 'crushAnim' || s.phase === 'fallAnim') {
        s.phaseT -= dt;
        if (s.phaseT <= 0) {
          if (s.phase === 'swapAnim') {
            processStep(0);
          } else if (s.phase === 'crushAnim') {
            // terapkan papan pasca-crush -> animasi jatuh
            const stp = s.resolve!.steps[s.stepIdx];
            reconcile(stp.board);
            s.phase = 'fallAnim';
            s.phaseT = 0.36;
          } else {
            processStep(s.stepIdx + 1);
          }
        }
      }
    });

    /* ---------------- render ---------------- */

    const drawTile = (ctx: CanvasRenderingContext2D, rc: RCell): void => {
      const sz = s.cell * 0.94 * rc.scale;
      if (sz < 2) return;
      const x = rc.cx + (s.cell - sz) / 2;
      const y = rc.cy + (s.cell - sz) / 2;
      const r = sz * 0.22;
      const [c0, c1] = MAT_COLORS[rc.t];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      const g = ctx.createLinearGradient(0, y, 0, y + sz);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, sz, sz, r);
      else ctx.rect(x, y, sz, sz);
      ctx.fill();
      ctx.restore();
      // bingkai dalam
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, sz, sz, r);
      else ctx.rect(x, y, sz, sz);
      ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(1.5, sz * 0.05);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x + 2, y + 2, sz - 4, sz - 4, r * 0.8);
      else ctx.rect(x + 2, y + 2, sz - 4, sz - 4);
      ctx.stroke();
      // detail material
      ctx.lineWidth = Math.max(1, sz * 0.045);
      if (rc.t === 0) {
        // bata: susunan bata
        ctx.strokeStyle = 'rgba(120,20,20,0.55)';
        for (let i = 1; i < 3; i += 1) {
          const yy = y + (sz / 3) * i;
          ctx.beginPath(); ctx.moveTo(x + 3, yy); ctx.lineTo(x + sz - 3, yy); ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(x + sz / 2, y + 3); ctx.lineTo(x + sz / 2, y + sz / 3);
        ctx.moveTo(x + sz / 4, y + sz / 3); ctx.lineTo(x + sz / 4, y + (2 * sz) / 3);
        ctx.moveTo((3 * sz) / 4, y + sz / 3); ctx.lineTo((3 * sz) / 4, y + (2 * sz) / 3);
        ctx.moveTo(x + sz / 2, y + (2 * sz) / 3); ctx.lineTo(x + sz / 2, y + sz - 3);
        ctx.stroke();
      } else if (rc.t === 1) {
        // semen: karung + lipatan
        ctx.strokeStyle = 'rgba(90,85,80,0.6)';
        ctx.beginPath(); ctx.moveTo(x + 4, y + sz * 0.3); ctx.lineTo(x + sz - 4, y + sz * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 4, y + sz * 0.62); ctx.lineTo(x + sz - 4, y + sz * 0.62); ctx.stroke();
        ctx.fillStyle = 'rgba(70,65,60,0.5)';
        ctx.beginPath(); ctx.arc(x + sz / 2, y + sz * 0.46, sz * 0.09, 0, TAU); ctx.fill();
      } else if (rc.t === 2) {
        // besi: 3 batang beton
        for (let i = 0; i < 3; i += 1) {
          const yy = y + sz * (0.25 + i * 0.25);
          const bg = ctx.createLinearGradient(x, yy - 3, x, yy + 3);
          bg.addColorStop(0, '#e2e8f0');
          bg.addColorStop(0.5, '#64748b');
          bg.addColorStop(1, '#1e293b');
          ctx.fillStyle = bg;
          ctx.fillRect(x + 4, yy - Math.max(2, sz * 0.05), sz - 8, Math.max(4, sz * 0.1));
        }
      } else if (rc.t === 3) {
        // kayu: serat
        ctx.strokeStyle = 'rgba(120,70,20,0.5)';
        for (let i = 0; i < 3; i += 1) {
          const yy = y + sz * (0.3 + i * 0.2);
          ctx.beginPath();
          ctx.moveTo(x + 4, yy);
          ctx.bezierCurveTo(x + sz * 0.35, yy + 3, x + sz * 0.65, yy - 3, x + sz - 4, yy + 2);
          ctx.stroke();
        }
      } else {
        // kaca: kilau diagonal + bingkai
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(2, sz * 0.07);
        ctx.beginPath();
        ctx.moveTo(x + sz * 0.28, y + sz * 0.85);
        ctx.lineTo(x + sz * 0.62, y + sz * 0.15);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(2,60,100,0.5)';
        ctx.lineWidth = Math.max(1.5, sz * 0.05);
        ctx.strokeRect(x + 4, y + 4, sz - 8, sz - 8);
      }
      // special overlay
      if (rc.s === 'bajaH' || rc.s === 'bajaV') {
        ctx.save();
        ctx.shadowColor = 'rgba(253,224,71,0.9)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = 'rgba(253,224,71,0.85)';
        if (rc.s === 'bajaH') {
          for (let i = 0; i < 3; i += 1) ctx.fillRect(x + 3, y + sz * (0.22 + i * 0.22), sz - 6, Math.max(2, sz * 0.09));
        } else {
          for (let i = 0; i < 3; i += 1) ctx.fillRect(x + sz * (0.22 + i * 0.22), y + 3, Math.max(2, sz * 0.09), sz - 6);
        }
        ctx.restore();
      } else if (rc.s === 'dinamit') {
        ctx.save();
        ctx.shadowColor = 'rgba(239,68,68,0.9)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#dc2626';
        const sw = sz * 0.16;
        for (let i = 0; i < 3; i += 1) {
          const sx = x + sz * 0.26 + i * sw * 1.15;
          ctx.fillRect(sx, y + sz * 0.2, sw, sz * 0.6);
          ctx.fillStyle = '#7f1d1d';
          ctx.fillRect(sx, y + sz * 0.2, sw, sz * 0.12);
          ctx.fillStyle = '#dc2626';
        }
        // sumbu
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + sz / 2, y + sz * 0.2);
        ctx.quadraticCurveTo(x + sz * 0.7, y - 2, x + sz * 0.85, y + 2);
        ctx.stroke();
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(x + sz * 0.85, y + 2, 3, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // kilau atas
      const gl = ctx.createLinearGradient(0, y, 0, y + sz * 0.4);
      gl.addColorStop(0, 'rgba(255,255,255,0.28)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, sz, sz * 0.4, [r, r, 0, 0]);
      else ctx.rect(x, y, sz, sz * 0.4);
      ctx.fill();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      // gudang: gradasi + grid blueprint
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#1c2b4a');
      bg.addColorStop(0.55, '#14203a');
      bg.addColorStop(1, '#0b1226');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(125,211,252,0.07)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 28) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += 28) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }
      // papan permainan
      const pw = s.cell * COLS + 16;
      const ph = s.cell * ROWS + 16;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      const pg = ctx.createLinearGradient(0, s.by - 8, 0, s.by + ph);
      pg.addColorStop(0, '#3b4a6b');
      pg.addColorStop(1, '#232f4d');
      ctx.fillStyle = pg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(s.bx - 8, s.by - 8, pw, ph, 18);
      else ctx.rect(s.bx - 8, s.by - 8, pw, ph);
      ctx.fill();
      ctx.restore();
      // label gudang
      ctx.fillStyle = 'rgba(186,205,235,0.5)';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏗️ GUDANG MATERIAL — GESER / KETUK UNTUK TUKAR', W / 2, s.by - 24);
      // sel dipilih
      if (s.sel && s.phase === 'idle') {
        const { x, y } = cellXY(s.sel.r, s.sel.c);
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 180);
        ctx.save();
        ctx.strokeStyle = `rgba(253,224,71,${0.65 + 0.35 * pulse})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = 'rgba(253,224,71,0.8)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(x - 2, y - 2, s.cell + 4, s.cell + 4, 10);
        else ctx.rect(x - 2, y - 2, s.cell + 4, s.cell + 4);
        ctx.stroke();
        ctx.restore();
      }
      // flash invalid
      if (s.invalidFlash > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(s.invalidFlash / 0.35, 0, 1) * 0.5;
        ctx.fillStyle = '#ef4444';
        for (const pp of [s.invalidA, s.invalidB]) {
          if (!pp) continue;
          const { x, y } = cellXY(pp.r, pp.c);
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, s.cell, s.cell, 8);
          else ctx.rect(x, y, s.cell, s.cell);
          ctx.fill();
        }
        ctx.restore();
      }
      // urutkan: yang sekarat digambar belakangan (di atas)
      const sorted = [...s.cells].sort((a, b) => (a.dying > 0 ? 1 : 0) - (b.dying > 0 ? 1 : 0));
      for (const rc of sorted) drawTile(ctx, rc);
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,8,20,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    (api as unknown as { __reset: (level: number) => void }).__reset = (level: number) => reset(level);
    reset(1);
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    api?.sfx.ensure();
    (api as unknown as { __reset?: (level: number) => void } | null)?.__reset?.(1);
    setScreen('play');
  };

  const nextLevel = (): void => {
    const api = apiRef.current;
    api?.sfx.ensure();
    const lv = hud.level + 1;
    (api as unknown as { __reset?: (level: number) => void } | null)?.__reset?.(lv);
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
    background: 'rgba(10,18,38,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const progress = clamp(hud.score / Math.max(1, hud.target), 0, 1);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600, overflow: 'hidden', borderRadius: 18, background: '#14203a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,18,38,0.62)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '8px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 168 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Lv.{hud.level}</div>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg,#4ade80,#22c55e)', borderRadius: 999, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
            🎯 {hud.target.toLocaleString('id-ID')} &nbsp;•&nbsp; 👣 {hud.moves} langkah
          </div>
          <div style={{ fontSize: 13, marginTop: 2, opacity: 0.9, letterSpacing: 2 }}>
            {MAT_EMOJI.map((e, i) => (
              <span key={i} title={MATERIALS[i]} style={{ marginRight: 6 }}>{e}</span>
            ))}
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

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🧱</div>
          <h2 style={h2}>MATERIAL MATCH</h2>
          <p style={p}>
            <b>Ketuk / geser</b> 2 material bersebelahan untuk menukar — buat <b>3+ sejajar</b> agar hancur!
            4 sejajar jadi <b>⚡ Baja</b>, 5 sejajar jadi <b>🧨 Dinamit</b>.
            Capai target skor sebelum langkah habis!
          </p>
          {hud.best > 0 && <p style={p}>Skor terbaik: <b style={{ color: '#fde047' }}>{hud.best.toLocaleString('id-ID')}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Menyusun</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Materialnya ditutup terpal dulu. Santai...</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{hud.score >= hud.target ? '🏆' : '🧱'}</div>
          <h2 style={h2}>{hud.score >= hud.target ? 'GUDANG RAPI!' : 'LANGKAH HABIS'}</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.score.toLocaleString('id-ID')}</div>
          <p style={p}>Target: {hud.target.toLocaleString('id-ID')} • Level {hud.level}</p>
          {hud.score >= hud.target ? (
            <button style={primaryBtn} onClick={nextLevel}>Level {hud.level + 1} ➜</button>
          ) : (
            <button style={primaryBtn} onClick={startGame}>Coba Lagi</button>
          )}
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
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,14,30,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#24345c,#101a36)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
