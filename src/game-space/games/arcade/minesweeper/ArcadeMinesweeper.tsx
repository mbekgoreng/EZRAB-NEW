/**
 * ArcadeMinesweeper ("Cari Pipa Bocor") — minesweeper bertema proyek.
 * Petak berisi "pipa bocor" (bukan ranjau). Angka = tekanan rembesan
 * (jumlah pipa bocor di sekitar). Klik pertama selalu aman.
 * Katup (flag) menandai dugaan pipa. 3 tingkat kesulitan.
 *
 * Grafis gameplay 100% PROSEDURAL (digambar, bukan emoji): segmen pipa
 * bocor + semburan air di canvas, penanda peringatan segitiga untuk
 * katup, ledakan air berdenyut, dan ikon SVG sebaris untuk HUD/overlay.
 * Tombol Petunjuk memakai deduksi logis murni (findHint di logic.ts).
 */
import React, { useRef, useState } from 'react';
import {
  useGameCanvas, type GameApi, TAU, clamp, sfx,
} from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  DIFFS, createBoard, openCell, toggleFlag, chord, checkWin, countFlags, findHint,
  type Diff, type Board, type Hint,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = (d: Diff): string => bestKey('cari-pipa-bocor', `best-${d}`);

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  diff: Diff;
  board: Board | null;
  started: boolean;
  elapsed: number;
  over: boolean;
  win: boolean;
  exploded: [number, number] | null;
  flagMode: boolean;
  shake: number;
  t: number;
  deadCells: Set<string>;
  hint: (Hint & { until: number }) | null;
  hintsLeft: number;
}

const NUM_COLORS = ['', '#3b82f6', '#16a34a', '#dc2626', '#7c3aed', '#b45309', '#0891b2', '#111827', '#6b7280'];

export default function ArcadeMinesweeper({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ elapsed: 0, left: 10, best: 0, flagMode: false, win: false, hints: 3 });
  const [muted, setMuted] = useState(sfx.muted);
  const [diff, setDiff] = useState<Diff>('mudah');

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);
    const s: S = {
      diff: 'mudah', board: null, started: false, elapsed: 0,
      over: false, win: false, exploded: null, flagMode: false, shake: 0, t: 0,
      deadCells: new Set(), hint: null, hintsLeft: 3,
    };

    const spec = (): { w: number; h: number; pipes: number } => DIFFS[s.diff];

    const cellGeom = (): { cs: number; ox: number; oy: number } => {
      const { w, h } = spec();
      const topHud = 108;
      const botHud = 64;
      const cs = Math.floor(Math.min((api.W - 20) / w, (api.H - topHud - botHud) / h));
      const ox = Math.round((api.W - cs * w) / 2);
      const oy = Math.round(topHud + (api.H - topHud - botHud - cs * h) / 2);
      return { cs, ox, oy };
    };

    const push = (): void => {
      const pipes = spec().pipes;
      const flags = s.board ? countFlags(s.board) : 0;
      api.pushHud({ elapsed: Math.floor(s.elapsed), left: pipes - flags, best: getBest(BK(s.diff), 0), flagMode: s.flagMode, win: s.win, hints: s.hintsLeft });
    };

    const reset = (d: Diff): void => {
      s.diff = d;
      s.board = null;
      s.started = false;
      s.elapsed = 0;
      s.over = false; s.win = false;
      s.exploded = null;
      s.shake = 0;
      s.deadCells = new Set();
      s.hint = null;
      s.hintsLeft = 3;
      push();
    };

    const cellAt = (px: number, py: number): [number, number] | null => {
      const { cs, ox, oy } = cellGeom();
      const { w, h } = spec();
      const x = Math.floor((px - ox) / cs);
      const y = Math.floor((py - oy) / cs);
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      return [x, y];
    };

    const endGame = (win: boolean): void => {
      s.over = true;
      s.win = win;
      const wrap = wrapRef.current;
      if (win) {
        const nb = setBest(BK(s.diff), Math.floor(s.elapsed));
        sfx.chime(3);
        if (wrap) popText(wrap, 'SEMUA PIPA KETEMU!', { size: 26, color: '#4ade80' });
        api.particles.spawn(api.W / 2, api.H * 0.4, {
          count: 80, colors: ['#4ade80', '#7dd3fc', '#fff7d6', '#fde047'],
          speed: [120, 420], life: [0.6, 1.2], size: [2, 6], gravity: 320, shape: 'rect', rotation: true,
        });
        window.setTimeout(() => {
          const flags = s.board ? countFlags(s.board) : 0;
          api.pushHud({ elapsed: Math.floor(s.elapsed), left: spec().pipes - flags, best: nb, flagMode: s.flagMode, win: true, hints: s.hintsLeft });
          setScreen('over');
        }, 1400);
      } else {
        s.shake = 0.5;
        sfx.fail();
        sfx.crumble(1);
        if (wrap) popText(wrap, 'PIPA PECAH! BANJIR!', { size: 26, color: '#f87171' });
        // tunjukkan semua pipa
        if (s.board) {
          for (let y = 0; y < s.board.length; y += 1) {
            for (let x = 0; x < s.board[0].length; x += 1) {
              if (s.board[y][x].pipe) s.board[y][x].open = true;
            }
          }
        }
        window.setTimeout(() => { push(); setScreen('over'); }, 1600);
      }
    };

    const doOpen = (x: number, y: number): void => {
      if (!s.board) {
        // klik pertama: buat papan, zona aman di klik
        const { w, h, pipes } = spec();
        s.board = createBoard(w, h, pipes, x, y, Math.random);
        s.started = true;
        sfx.ensure();
      }
      s.hint = null;
      const before = s.board[y][x];
      if (before.open) {
        // chord
        const r = chord(s.board, x, y);
        s.board = r.board;
        if (r.result.opened > 0) sfx.pop(0.8);
        if (r.result.hitPipe) { if (r.result.hitCell) s.exploded = r.result.hitCell; endGame(false); return; }
      } else {
        const r = openCell(s.board, x, y);
        s.board = r.board;
        if (r.result.hitPipe) { s.exploded = r.result.hitCell ?? [x, y]; endGame(false); return; }
        if (r.result.opened > 0) {
          sfx.pop(r.result.opened > 6 ? 1.3 : 0.9);
          const { cs, ox, oy } = cellGeom();
          if (r.result.opened >= 4) {
            api.particles.spawn(ox + x * cs + cs / 2, oy + y * cs + cs / 2, {
              count: Math.min(20, r.result.opened * 2),
              colors: ['#7dd3fc', '#38bdf8', '#bae6fd'],
              speed: [40, 180], life: [0.25, 0.6], size: [1.5, 4], gravity: 240, shape: 'circle',
            });
          }
        }
      }
      if (checkWin(s.board)) { endGame(true); return; }
      push();
    };

    const doFlag = (x: number, y: number): void => {
      if (!s.board) return;
      s.hint = null;
      s.board = toggleFlag(s.board, x, y);
      const c = s.board[y][x];
      sfx.click();
      if (c.flag) {
        const { cs, ox, oy } = cellGeom();
        api.particles.spawn(ox + x * cs + cs / 2, oy + y * cs, {
          count: 6, colors: ['#fbbf24', '#f59e0b'],
          speed: [40, 140], life: [0.2, 0.5], size: [1.5, 3], gravity: 200, shape: 'circle',
        });
      }
      push();
    };

    // tap vs long-press (katup)
    let downPos: { x: number; y: number; t: number } | null = null;
    let longFired = false;
    let longTimer = 0;
    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.over) return;
      downPos = { x: p.x, y: p.y, t: performance.now() };
      longFired = false;
      window.clearTimeout(longTimer);
      longTimer = window.setTimeout(() => {
        if (downPos && !longFired && screenRef.current === 'play' && !s.over) {
          const c = cellAt(downPos.x, downPos.y);
          if (c) {
            longFired = true;
            if (s.board) doFlag(c[0], c[1]);
            else {
              // long-press pertama = buka (aman)
              doOpen(c[0], c[1]);
            }
            const wrap = wrapRef.current;
            if (wrap) popText(wrap, 'Katup terpasang!', { size: 14, color: '#fbbf24' });
          }
        }
      }, 450);
    };
    api.input.onUp = (p) => {
      window.clearTimeout(longTimer);
      if (screenRef.current !== 'play' || s.over) { downPos = null; return; }
      if (downPos && !longFired) {
        const moved = Math.hypot(p.x - downPos.x, p.y - downPos.y);
        if (moved < 24) {
          const c = cellAt(p.x, p.y);
          if (c) {
            if (s.flagMode && s.board) doFlag(c[0], c[1]);
            else doOpen(c[0], c[1]);
          }
        }
      }
      downPos = null;
    };
    (api as unknown as { __flagMode: () => void }).__flagMode = () => {
      s.flagMode = !s.flagMode;
      push();
    };
    (api as unknown as { __hint: () => void }).__hint = () => {
      if (!s.board || s.over || screenRef.current !== 'play') return;
      const wrap = wrapRef.current;
      if (s.hintsLeft <= 0) {
        if (wrap) popText(wrap, 'Petunjuk habis!', { size: 14, color: '#f87171' });
        return;
      }
      const hint = findHint(s.board);
      if (!hint) {
        if (wrap) popText(wrap, 'Tak ada langkah pasti — perlu menebak', { size: 14, color: '#e0f2fe' });
        return;
      }
      s.hintsLeft -= 1;
      s.hint = { ...hint, until: s.t + 3.5 };
      sfx.click();
      if (wrap) {
        popText(wrap, hint.kind === 'safe' ? 'Petunjuk: petak berdenyut pasti aman' : 'Petunjuk: petak berdenyut pasti pipa bocor', { size: 14, color: hint.kind === 'safe' ? '#4ade80' : '#fbbf24' });
      }
      push();
    };
    (api as unknown as { __reset: (d: Diff) => void }).__reset = reset;

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);
      if (screenRef.current !== 'play' || s.over) return;
      if (s.started) s.elapsed += dt;
      if (Math.floor(s.elapsed * 2) !== Math.floor((s.elapsed - dt) * 2)) push();
    });

    // ---------- gambar ----------
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0e1c2e');
      g.addColorStop(0.6, '#14304a');
      g.addColorStop(1, '#0a1420');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // blueprint
      ctx.strokeStyle = 'rgba(120,170,220,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 28) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 28) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // gelembung air melayang
      ctx.fillStyle = 'rgba(125,211,252,0.25)';
      for (let i = 0; i < 10; i += 1) {
        const px = ((i * 137 + s.t * 12) % (W + 30)) - 15;
        const py = H - ((i * 89 + s.t * 26) % (H + 60));
        ctx.beginPath(); ctx.arc(px, py, 2 + (i % 3), 0, TAU); ctx.fill();
      }
    };

    const drawCell = (ctx: CanvasRenderingContext2D, x: number, y: number, cs: number, ox: number, oy: number): void => {
      const c = s.board?.[y]?.[x];
      const px = ox + x * cs;
      const py = oy + y * cs;
      if (!c) return;
      if (c.open) {
        // petak terbuka — lantai beton
        const g = ctx.createLinearGradient(px, py, px, py + cs);
        g.addColorStop(0, '#334155');
        g.addColorStop(1, '#1e293b');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, cs, cs);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
        if (c.pipe) {
          // PIPA BOCOR — gambar prosedural: segmen pipa baja horizontal
          // dengan flensa di kedua ujung, retakan di tengah, semburan air.
          const isBoom = s.exploded !== null && s.exploded[0] === x && s.exploded[1] === y;
          if (isBoom) {
            ctx.fillStyle = 'rgba(220,38,38,0.55)';
            ctx.fillRect(px, py, cs, cs);
          }
          const cx = px + cs / 2;
          const cy = py + cs / 2;
          const pipeH = cs * 0.34;
          const pipeW = cs * 0.92;
          const pg = ctx.createLinearGradient(px, cy - pipeH / 2, px, cy + pipeH / 2);
          pg.addColorStop(0, '#cbd5e1');
          pg.addColorStop(0.45, '#64748b');
          pg.addColorStop(1, '#1e293b');
          ctx.fillStyle = pg;
          ctx.fillRect(cx - pipeW / 2, cy - pipeH / 2, pipeW, pipeH);
          // flensa / sambungan ulir di ujung kiri-kanan
          ctx.fillStyle = '#94a3b8';
          const fw = Math.max(2, cs * 0.09);
          ctx.fillRect(cx - pipeW / 2, cy - pipeH * 0.62, fw, pipeH * 1.24);
          ctx.fillRect(cx + pipeW / 2 - fw, cy - pipeH * 0.62, fw, pipeH * 1.24);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(cx - pipeW / 2 + fw, cy - pipeH / 2 + 1, pipeW - fw * 2, Math.max(1, cs * 0.05));
          // retakan zigzag tepat di tengah segmen
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = Math.max(1.5, cs * 0.055);
          ctx.beginPath();
          ctx.moveTo(cx - cs * 0.07, cy - pipeH / 2);
          ctx.lineTo(cx + cs * 0.02, cy - pipeH * 0.12);
          ctx.lineTo(cx - cs * 0.03, cy + pipeH * 0.14);
          ctx.lineTo(cx + cs * 0.06, cy + pipeH / 2);
          ctx.stroke();
          // semburan air dari retakan: pancaran melengkung + tetes beterbangan
          ctx.strokeStyle = 'rgba(125,211,252,0.85)';
          ctx.lineWidth = Math.max(1.2, cs * 0.045);
          for (let i = -1; i <= 1; i += 1) {
            const sway = Math.sin(s.t * 9 + i * 1.4) * cs * 0.05;
            ctx.beginPath();
            ctx.moveTo(cx + i * cs * 0.03, cy - pipeH * 0.3);
            ctx.quadraticCurveTo(cx + i * cs * 0.16, cy - cs * 0.34, cx + i * cs * 0.22 + sway, cy - cs * (0.3 + ((i + 1) % 2) * 0.07));
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(186,230,253,0.95)';
          for (let i = 0; i < 5; i += 1) {
            const ph = (s.t * 1.6 + i * 0.37) % 1;
            const dx = Math.sin(i * 2.4) * cs * 0.26 * ph;
            const dy = -cs * 0.42 * ph + cs * 0.3 * ph * ph;
            ctx.beginPath(); ctx.arc(cx + dx, cy - cs * 0.1 + dy, Math.max(1.1, cs * 0.05 * (1 - ph * 0.5)), 0, TAU); ctx.fill();
          }
          // genangan memanjang di dasar petak
          ctx.fillStyle = 'rgba(56,189,248,0.4)';
          ctx.beginPath(); ctx.ellipse(cx, py + cs * 0.88, cs * (0.3 + 0.04 * Math.sin(s.t * 3)), cs * 0.07, 0, 0, TAU); ctx.fill();
          if (isBoom) {
            // LEDAKAN AIR prosedural: cincin mengembang + jari-jari semburan
            const ph = (s.t * 1.4) % 1;
            ctx.strokeStyle = `rgba(186,230,253,${0.75 * (1 - ph)})`;
            ctx.lineWidth = Math.max(1.5, cs * 0.06 * (1 - ph));
            ctx.beginPath(); ctx.arc(cx, cy, cs * (0.14 + 0.4 * ph), 0, TAU); ctx.stroke();
            ctx.strokeStyle = 'rgba(125,211,252,0.8)';
            ctx.lineWidth = Math.max(1.2, cs * 0.045);
            for (let i = 0; i < 8; i += 1) {
              const a = (i * TAU) / 8 + 0.4;
              const r1 = cs * 0.2;
              const r2 = cs * (0.34 + 0.1 * Math.sin(s.t * 10 + i * 1.7));
              ctx.beginPath();
              ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
              ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
              ctx.stroke();
            }
          }
        } else if (c.n > 0) {
          const col = NUM_COLORS[Math.min(c.n, 8)];
          ctx.fillStyle = col;
          ctx.font = `900 ${Math.floor(cs * 0.55)}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(c.n), px + cs / 2, py + cs / 2 + 1);
          // sambungan pipa prosedural: n hub pendek mengelilingi angka,
          // jumlahnya persis angka tekanan (angka tetap teks di tengah)
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = Math.max(1.4, cs * 0.055);
          ctx.lineCap = 'round';
          for (let i = 0; i < c.n; i += 1) {
            const a = (i * TAU) / 8 - TAU / 4;
            const r1 = cs * 0.36;
            const r2 = cs * 0.47;
            ctx.beginPath();
            ctx.moveTo(px + cs / 2 + Math.cos(a) * r1, py + cs / 2 + Math.sin(a) * r1);
            ctx.lineTo(px + cs / 2 + Math.cos(a) * r2, py + cs / 2 + Math.sin(a) * r2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.lineCap = 'butt';
        }
      } else {
        // petak tertutup — panel tanah/paving
        const g = ctx.createLinearGradient(px, py, px, py + cs);
        g.addColorStop(0, '#64748b');
        g.addColorStop(0.5, '#475569');
        g.addColorStop(1, '#334155');
        ctx.fillStyle = g;
        ctx.beginPath();
        const rad = Math.max(2, cs * 0.12);
        if (typeof ctx.roundRect === 'function') ctx.roundRect(px + 1, py + 1, cs - 2, cs - 2, rad);
        else ctx.rect(px + 1, py + 1, cs - 2, cs - 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(px + 3, py + 3, cs - 6, Math.max(2, cs * 0.1));
        if (c.flag) {
          // PENANDA PERINGATAN prosedural: rambu segitiga kuning di atas
          // tiang — tanda "awas, dugaan pipa bocor di sini".
          const cx = px + cs / 2;
          const topY = py + cs * 0.14;
          const baseY = py + cs * 0.66;
          const halfW = cs * 0.3;
          // tiang + kaki
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = Math.max(1.6, cs * 0.06);
          ctx.beginPath();
          ctx.moveTo(cx, baseY);
          ctx.lineTo(cx, py + cs * 0.9);
          ctx.moveTo(cx - cs * 0.14, py + cs * 0.9);
          ctx.lineTo(cx + cs * 0.14, py + cs * 0.9);
          ctx.stroke();
          // segitiga peringatan
          ctx.beginPath();
          ctx.moveTo(cx, topY);
          ctx.lineTo(cx + halfW, baseY);
          ctx.lineTo(cx - halfW, baseY);
          ctx.closePath();
          ctx.fillStyle = '#fbbf24';
          ctx.fill();
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = Math.max(1.4, cs * 0.05);
          ctx.stroke();
          // tanda seru di tengah segitiga
          ctx.fillStyle = '#78350f';
          const exW = Math.max(1.6, cs * 0.06);
          ctx.fillRect(cx - exW / 2, py + cs * 0.36, exW, cs * 0.16);
          ctx.beginPath(); ctx.arc(cx, py + cs * 0.58, exW * 0.62, 0, TAU); ctx.fill();
        } else {
          // tekstur paving halus
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(px + cs * 0.2, py + cs * 0.45, cs * 0.6, 1.5);
        }
      }
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      if (s.shake > 0) {
        const k = s.shake / 0.5;
        ctx.translate((Math.random() - 0.5) * 14 * k, (Math.random() - 0.5) * 14 * k);
      }
      drawBackground(ctx, W, H);
      const { w, h } = spec();
      const { cs, ox, oy } = cellGeom();
      if (!s.board) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = `800 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('Ketuk petak mana pun untuk mulai', W / 2, oy + (cs * h) / 2);
        ctx.font = `13px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Klik pertama selalu aman', W / 2, oy + (cs * h) / 2 + 24);
      } else {
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) drawCell(ctx, x, y, cs, ox, oy);
        }
        // sorotan petunjuk: bingkai berdenyut di petak hasil deduksi findHint
        if (s.hint && s.t < s.hint.until) {
          const hx = ox + s.hint.x * cs;
          const hy = oy + s.hint.y * cs;
          const pulse = 0.55 + 0.45 * Math.sin(s.t * 10);
          ctx.strokeStyle = s.hint.kind === 'safe' ? `rgba(74,222,128,${pulse})` : `rgba(251,191,36,${pulse})`;
          ctx.lineWidth = Math.max(2, cs * 0.09);
          ctx.strokeRect(hx + 2, hy + 2, cs - 4, cs - 4);
          ctx.fillStyle = s.hint.kind === 'safe' ? 'rgba(74,222,128,0.16)' : 'rgba(251,191,36,0.16)';
          ctx.fillRect(hx + 2, hy + 2, cs - 4, cs - 4);
        } else if (s.hint) {
          s.hint = null;
        }
      }
      // label bawah
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(s.flagMode ? 'Mode KATUP aktif — ketuk untuk pasang/lepas tanda peringatan' : 'Tahan 450ms untuk pasang tanda • ketuk angka bertanda pas = chord • Petunjuk = deduksi pasti', W / 2, H - 22);
      ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,10,18,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    reset(s.diff);
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (d: Diff): void => {
    const api = apiRef.current;
    sfx.ensure();
    setDiff(d);
    (api as unknown as { __reset?: (dd: Diff) => void } | null)?.__reset?.(d);
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
  const toggleFlagMode = (): void => {
    (apiRef.current as unknown as { __flagMode?: () => void } | null)?.__flagMode?.();
    setHud((h) => ({ ...h, flagMode: !h.flagMode }));
  };
  const askHint = (): void => {
    sfx.ensure();
    (apiRef.current as unknown as { __hint?: () => void } | null)?.__hint?.();
  };

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(8,16,28,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };
  const fmtT = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0e1c2e', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(8,16,28,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#7dd3fc', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconClock size={17} color="#7dd3fc" /> {fmtT(hud.elapsed)}
          </div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconDrop size={13} color="#38bdf8" /> {hud.left} pipa
            {hud.best > 0 && <span style={{ color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: 3 }}>• <IconBolt size={12} color="#4ade80" />{fmtT(hud.best)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {screen === 'play' && (
            <button
              style={{ ...btn, width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 800, fontFamily: FONT, gap: 6, opacity: hud.hints > 0 ? 1 : 0.45 }}
              onClick={askHint} aria-label="Petunjuk deduksi"
            >
              <IconBulb size={16} color="#fde047" /> Petunjuk {hud.hints}
            </button>
          )}
          {screen === 'play' && (
            <button
              style={{ ...btn, background: hud.flagMode ? 'rgba(251,191,36,0.75)' : btn.background, color: hud.flagMode ? '#3a2a00' : '#fff' }}
              onClick={toggleFlagMode} aria-label="Mode katup"
            >
              <IconValve size={20} color={hud.flagMode ? '#3a2a00' : '#fbbf24'} />
            </button>
          )}
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? <IconPause size={17} /> : <IconPlay size={17} />}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? <IconMute size={19} /> : <IconSound size={19} />}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar"><IconClose size={17} /></button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><IconWrench size={44} color="#7dd3fc" /></div>
          <h2 style={h2}>CARI PIPA BOCOR</h2>
          <p style={p}>
            Ada <b>pipa bocor</b> tersembunyi di bawah paving! Angka = <b>tekanan rembesan</b>
            (jumlah pipa bocor di sekitarnya). <b>Ketuk</b> untuk membuka, <b>tahan</b> untuk
            pasang <b>rambu peringatan</b> penanda. Klik pertama <b>selalu aman</b>! Tersedia
            <b> 3 Petunjuk</b> deduksi pasti per permainan.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {(['mudah', 'sedang', 'sulit'] as Diff[]).map((d) => (
              <button
                key={d}
                onClick={() => startGame(d)}
                style={{
                  flex: 1, padding: '12px 6px', borderRadius: 12, border: '1px solid rgba(125,211,252,0.4)',
                  background: 'rgba(14,42,67,0.8)', color: '#fff', fontFamily: FONT, cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>{DIFFS[d].label}</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{DIFFS[d].desc}</div>
              </button>
            ))}
          </div>
          {hud.best > 0 && <p style={p}>Tercepat {DIFFS[diff].label}: <b style={{ color: '#4ade80' }}>{fmtT(hud.best)}</b></p>}
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center', color: '#7dd3fc' }}><IconPause size={40} /></div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Pipanya nunggu diperbaiki.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {hud.win ? <IconWrench size={44} color="#4ade80" /> : <IconFlood size={44} color="#38bdf8" />}
          </div>
          <h2 style={h2}>{hud.win ? 'PIPA TERATASI!' : 'KEBANJIRAN!'}</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#7dd3fc', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <IconClock size={30} color="#7dd3fc" /> {fmtT(hud.elapsed)}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Proyek" value={DIFFS[diff].label} />
            <Stat label="Tercepat" value={hud.best > 0 ? fmtT(hud.best) : '-'} />
          </div>
          <button style={primaryBtn} onClick={() => startGame(diff)}>Main Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#7dd3fc', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0f2fe' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#7dd3fc,#0284c7)', color: '#06263b', boxShadow: '0 8px 20px rgba(2,132,199,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#7dd3fc', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,14,24,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20, overflowY: 'auto' }}>
      <div style={{ background: 'linear-gradient(160deg,#14304a,#0a1420)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 20, padding: 24, maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e0f2fe' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}

// ---------- Ikon SVG prosedural (pengganti emoji HUD/overlay) ----------
type IconProps = { size: number; color?: string };

function IconClock({ size, color = '#fff' }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function IconDrop({ size, color = '#38bdf8' }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2.7c3.2 4.3 6.5 8.9 6.5 12.3a6.5 6.5 0 1 1-13 0C5.5 11.6 8.8 7 12 2.7z" />
    </svg>
  );
}

function IconBolt({ size, color = '#fde047' }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M13.2 2 4.8 13.4h5L9.4 22l8.8-11.8h-5.2L13.2 2z" />
    </svg>
  );
}

function IconBulb({ size, color = '#fde047' }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9.5 18h5M10.5 21h3" />
      <path d="M12 3a6 6 0 0 1 3.3 10.9c-.7.5-1 1-1.1 2.1h-4.4c-.1-1.1-.4-1.6-1.1-2.1A6 6 0 0 1 12 3z" />
    </svg>
  );
}

function IconValve({ size, color = '#fbbf24' }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="9" r="6" />
      <path d="M12 3v12M6.8 6l10.4 6M17.2 6L6.8 12M12 15v6M8 21h8" />
    </svg>
  );
}

function IconPause({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4.4" height="16" rx="1.4" />
      <rect x="13.6" y="4" width="4.4" height="16" rx="1.4" />
    </svg>
  );
}

function IconPlay({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.2v13.6c0 .9 1 1.5 1.8 1L20 13a1.15 1.15 0 0 0 0-2L9.8 4.2C9 3.7 8 4.3 8 5.2z" />
    </svg>
  );
}

function IconSound({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.6V5.4L7.5 9.5H4z" fill="currentColor" stroke="none" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
    </svg>
  );
}

function IconMute({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.6V5.4L7.5 9.5H4z" fill="currentColor" stroke="none" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </svg>
  );
}

function IconClose({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

function IconWrench({ size, color = '#7dd3fc' }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M20.6 7.2a5.4 5.4 0 0 1-7.1 5L7 18.7a2.05 2.05 0 0 1-2.9-2.9l6.5-6.5a5.4 5.4 0 0 1 6.9-6.4l-2.7 2.7 2.4 2.4 2.7-2.7c.5.8.7 1.2.7 1.9z" />
    </svg>
  );
}

function IconFlood({ size, color = '#38bdf8' }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3c2.4 3.2 4.8 6.6 4.8 9.1a4.8 4.8 0 1 1-9.6 0C7.2 9.6 9.6 6.2 12 3z" fill={color} stroke="none" />
      <path d="M2.5 19.5c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M2.5 22.2c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
    </svg>
  );
}
