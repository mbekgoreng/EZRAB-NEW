/**
 * ArcadeTicTacToe ("Bata vs Semen") — X = Bata, O = Semen (karung).
 * Mode: vs AI Sedang (bisa dikalahkan) atau 2 Pemain lokal.
 *
 * Grafis: token pemain = sprite generate-AI (set token papan bersama,
 * Kelompok 2) — bata oranye-merah dan karung semen krem — di Canvas
 * maupun SVG DOM; glif prosedural lama (drawBrick/drawCement Canvas +
 * BrickGlyph/CementGlyph DOM) menjadi FALLBACK bila sprite belum siap.
 * Bukan emoji. Sisa simbol di file hanya tombol fungsional shell
 * (jeda/suara/keluar).
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, sfx, TAU, clamp, easeOutBack } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { emptyBoard, winner, isFull, place, aiOpening, type Board, type Mark } from './logic';
import { TTT_TOKENS, drawBoardToken, loadSprite, useSprite } from '../../../shared/boardTokenSprites';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('bata-vs-semen', 'streak');

type Screen = 'tutorial' | 'play' | 'pause' | 'round';
type Mode = 'ai' | '2p';

interface S {
  board: Board;
  turn: Mark;
  mode: Mode;
  placedAt: number[];   // waktu animasi per sel (-1 = kosong)
  win: { mark: Mark; line: number[] } | null;
  /** waktu (s.t) saat ronde diputuskan — untuk animasi garis menang */
  winAt: number;
  draw: boolean;
  round: number;
  xWins: number;
  oWins: number;
  draws: number;
  streak: number;       // rentetan menang vs AI
  aiThinking: number;   // countdown detik sebelum AI jalan, -1 = tidak
  t: number;
}

export default function ArcadeTicTacToe({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const modeRef = useRef<Mode>('ai');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [mode, setModeState] = useState<Mode>('ai');
  const [hud, setHud] = useState({ x: 0, o: 0, d: 0, turn: 'X' as Mark, streak: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const setMode = (m: Mode): void => {
    modeRef.current = m;
    setModeState(m);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    void loadSprite(TTT_TOKENS.X);
    void loadSprite(TTT_TOKENS.O);
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      board: emptyBoard(), turn: 'X', mode: 'ai',
      placedAt: Array(9).fill(-1), win: null, winAt: 0, draw: false,
      round: 0, xWins: 0, oWins: 0, draws: 0, streak: 0, aiThinking: -1, t: 0,
    };
    // auto-pause saat tab disembunyikan (pola pilot: api.onHidden)
    api.onHidden = () => {
      if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
    };

    const push = (): void => {
      api.pushHud({ x: s.xWins, o: s.oWins, d: s.draws, turn: s.turn, streak: s.streak, best: getBest(BK, 0) });
    };

    const newRound = (first: Mark = 'X'): void => {
      s.board = emptyBoard();
      s.placedAt = Array(9).fill(-1);
      s.turn = first;
      s.win = null;
      s.winAt = 0;
      s.draw = false;
      s.aiThinking = -1;
      s.round += 1;
      push();
    };

    const resetAll = (): void => {
      s.xWins = 0; s.oWins = 0; s.draws = 0; s.streak = 0; s.round = 0;
      newRound();
    };

    const finishRound = (): void => {
      const w = winner(s.board);
      s.win = w;
      if (w) s.winAt = s.t;
      if (w) {
        if (w.mark === 'X') {
          s.xWins += 1;
          api.sfx.chime(3, 620);
          const label = s.mode === 'ai' ? 'BATA MENANG!' : 'BATA (P1) MENANG!';
          if (wrapRef.current) popText(wrapRef.current, label, { size: 26, color: '#fdba74' });
          if (s.mode === 'ai') {
            s.streak += 1;
            const nb = setBest(BK, s.streak);
            api.pushHud({ x: s.xWins, o: s.oWins, d: s.draws, turn: s.turn, streak: s.streak, best: nb });
          }
        } else {
          s.oWins += 1;
          api.sfx.thud(0.9);
          const label = s.mode === 'ai' ? 'SEMEN MENANG!' : 'SEMEN (P2) MENANG!';
          if (wrapRef.current) popText(wrapRef.current, label, { size: 26, color: '#d1d5db' });
          if (s.mode === 'ai') s.streak = 0;
        }
        const { x, y } = cellCenter(w.line[1], api.W, api.H);
        api.particles.spawn(x, y, {
          count: 46, colors: w.mark === 'X' ? ['#fdba74', '#fde047', '#c2410c'] : ['#e5e7eb', '#9ca3af', '#f8fafc'],
          speed: [80, 300], life: [0.5, 1.1], size: [2, 6], gravity: 420, shape: 'rect', rotation: true,
        });
        api.shake.add(4);
      } else if (isFull(s.board)) {
        s.draw = true;
        s.draws += 1;
        api.sfx.click();
        if (wrapRef.current) popText(wrapRef.current, 'SERI! Adukan rata.', { size: 24, color: '#e2e8f0' });
      }
      push();
      window.setTimeout(() => {
        if (screenRef.current === 'play') setScreen('round');
      }, 1400);
    };

    const humanMove = (i: number): void => {
      if (s.win || s.draw || s.aiThinking >= 0) return;
      if (s.mode === 'ai' && s.turn !== 'X') return;
      const nb = place(s.board, i, s.turn);
      if (!nb) { api.sfx.click(); return; }
      s.board = nb;
      s.placedAt[i] = s.t;
      api.sfx.pop(s.turn === 'X' ? 1 : 0.75);
      const w = winner(s.board);
      if (w || isFull(s.board)) { finishRound(); return; }
      s.turn = s.turn === 'X' ? 'O' : 'X';
      if (s.mode === 'ai' && s.turn === 'O') s.aiThinking = 0.5;
      push();
    };

    // geometri papan
    const boardGeom = (W: number, H: number): { x: number; y: number; cell: number } => {
      const topPad = 84;
      const botPad = 84;
      const size = Math.min(W - 48, H - topPad - botPad, 420);
      const cell = size / 3;
      return { x: (W - size) / 2, y: topPad + (H - topPad - botPad - size) / 2, cell };
    };
    const cellCenter = (i: number, W: number, H: number): { x: number; y: number } => {
      const g = boardGeom(W, H);
      const cx = i % 3; const cy = Math.floor(i / 3);
      return { x: g.x + (cx + 0.5) * g.cell, y: g.y + (cy + 0.5) * g.cell };
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play') return;
      const g = boardGeom(api.W, api.H);
      const cx = Math.floor((p.x - g.x) / g.cell);
      const cy = Math.floor((p.y - g.y) / g.cell);
      if (cx < 0 || cx > 2 || cy < 0 || cy > 2) return;
      humanMove(cy * 3 + cx);
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape') || api.input.wasPressed('KeyP')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      // keyboard 1-9
      for (let k = 1; k <= 9; k += 1) {
        if (api.input.wasPressed(`Digit${k}`) || api.input.wasPressed(`Numpad${k}`)) {
          if (screenRef.current === 'play') humanMove(k - 1);
        }
      }
      if (screenRef.current !== 'play') return;
      s.t += dt;
      if (s.aiThinking >= 0 && !s.win && !s.draw) {
        s.aiThinking -= dt;
        if (s.aiThinking < 0) {
          const mv = aiOpening(s.board);
          const nb = place(s.board, mv, 'O');
          if (nb) {
            s.board = nb;
            s.placedAt[mv] = s.t;
            api.sfx.pop(0.7);
          }
          const w = winner(s.board);
          if (w || isFull(s.board)) { finishRound(); return; }
          s.turn = 'X';
          push();
        }
      }
    });

    /* ---------- render ---------- */
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1c130a');
      g.addColorStop(0.5, '#241a0e');
      g.addColorStop(1, '#120c05');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(253,186,116,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // tumpukan karung semen di pojok
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i += 1) {
        const sx = 48 + i * 8; const sy = H - 40 - i * 26;
        const sg = ctx.createLinearGradient(sx, sy - 22, sx, sy);
        sg.addColorStop(0, '#d6d3d1'); sg.addColorStop(1, '#78716c');
        ctx.fillStyle = sg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(sx - 34, sy - 22, 68, 24, 8);
        else ctx.rect(sx - 34, sy - 22, 68, 24);
        ctx.fill();
        ctx.fillStyle = 'rgba(68,64,60,0.8)';
        ctx.font = '900 9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('SEMEN', sx, sy - 8);
      }
      ctx.restore();
    };

    const drawGrid = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = boardGeom(W, H);
      // alas papan adukan
      const bg = ctx.createLinearGradient(0, g.y, 0, g.y + g.cell * 3);
      bg.addColorStop(0, '#3d3a35'); bg.addColorStop(1, '#2b2925');
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(g.x - 10, g.y - 10, g.cell * 3 + 20, g.cell * 3 + 20, 18);
      else ctx.rect(g.x - 10, g.y - 10, g.cell * 3 + 20, g.cell * 3 + 20);
      ctx.fill();
      // garis balok baja
      for (let i = 1; i < 3; i += 1) {
        for (const [x1, y1, x2, y2] of [
          [g.x + i * g.cell, g.y - 6, g.x + i * g.cell, g.y + g.cell * 3 + 6],
          [g.x - 6, g.y + i * g.cell, g.x + g.cell * 3 + 6, g.y + i * g.cell],
        ] as number[][]) {
          const steel = ctx.createLinearGradient(x1, y1, x2, y2);
          steel.addColorStop(0, '#6b7280'); steel.addColorStop(0.5, '#d1d5db'); steel.addColorStop(1, '#4b5563');
          ctx.strokeStyle = steel; ctx.lineWidth = 9; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x1 - 2, y1); ctx.lineTo(x2 - 2, y2); ctx.stroke();
        }
      }
    };

    /**
     * Glif BATA prosedural (Canvas, digambar kode): satu bata oranye-merah
     * terdesain — badan bergradasi, garis nat pasangan bata, kilau atas,
     * garis tepi gelap, bayangan kontak. Menggantikan gambar bata ganda
     * lama yang kabur bacanya. `age` menggerakkan animasi pop penempatan.
     */
    const drawBrick = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, age: number): void => {
      // Sprite bata generate-AI (Kelompok 2) dengan animasi pop yang sama;
      // gambar prosedural di bawah = fallback bila sprite belum siap.
      const popS = easeOutBack(clamp(age / 0.22, 0, 1));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(Math.max(0.01, popS), Math.max(0.01, popS));
      ctx.rotate(-0.1);
      if (drawBoardToken(ctx, TTT_TOKENS.X, 0, 0, r * 2.35, r * 2.35)) { ctx.restore(); return; }
      ctx.restore();
      const pop = easeOutBack(clamp(age / 0.22, 0, 1));
      const sc = Math.max(0.01, pop);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.rotate(-0.1);
      const w = r * 1.02; const h = r * 0.62;
      // bayangan kontak
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(2, h + 4, w * 0.95, 4.5, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(0, -h, 0, h);
      g.addColorStop(0, '#fb923c'); g.addColorStop(0.5, '#ea580c'); g.addColorStop(1, '#9a3412');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-w, -h, w * 2, h * 2, 6);
      else ctx.rect(-w, -h, w * 2, h * 2);
      ctx.fill();
      ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 2.2; ctx.stroke();
      // garis nat: horizontal tengah + vertikal berselang (pasangan bata)
      ctx.strokeStyle = 'rgba(67,20,7,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-w + 3, 0); ctx.lineTo(w - 3, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -h + 3); ctx.lineTo(0, -3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w / 2, 3); ctx.lineTo(-w / 2, h - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w / 2, 3); ctx.lineTo(w / 2, h - 3); ctx.stroke();
      // kilau atas + tekstur bintik bata
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(-w + 4, -h + 3, w * 2 - 8, 4);
      ctx.fillStyle = 'rgba(67,20,7,0.25)';
      for (const [dx, dy] of [[-w * 0.6, -h * 0.45], [w * 0.35, -h * 0.5], [-w * 0.2, h * 0.5], [w * 0.65, h * 0.42]] as number[][]) {
        ctx.beginPath(); ctx.arc(dx, dy, 1.7, 0, TAU); ctx.fill();
      }
      ctx.restore();
    };

    /**
     * Glif KARUNG SEMEN prosedural (Canvas, digambar kode): karung krem
     * terdesain — badan krem bergradasi, lipatan atas terikat, jahitan
     * samping, cap kotak biru EZRAB (bentuk saja, tanpa teks terbaca,
     * sesuai arah seni), bayangan kontak. Menggantikan cincin semen lama.
     */
    const drawCement = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, age: number): void => {
      // Sprite karung semen generate-AI (Kelompok 2), pop yang sama;
      // gambar prosedural di bawah = fallback bila sprite belum siap.
      const popS = easeOutBack(clamp(age / 0.22, 0, 1));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(Math.max(0.01, popS), Math.max(0.01, popS));
      ctx.rotate(0.07);
      if (drawBoardToken(ctx, TTT_TOKENS.O, 0, 0, r * 2.35, r * 2.35)) { ctx.restore(); return; }
      ctx.restore();
      const pop = easeOutBack(clamp(age / 0.22, 0, 1));
      const sc = Math.max(0.01, pop);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.rotate(0.07);
      const w = r * 0.82; const h = r * 0.95;
      // bayangan kontak
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(2, h + 3, w * 0.95, 4.5, 0, 0, TAU); ctx.fill();
      // badan karung krem
      const g = ctx.createLinearGradient(0, -h, 0, h);
      g.addColorStop(0, '#f7f1de'); g.addColorStop(0.6, '#e7dcc0'); g.addColorStop(1, '#cbbd97');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-w, -h * 0.72, w * 2, h * 1.72, 8);
      else ctx.rect(-w, -h * 0.72, w * 2, h * 1.72);
      ctx.fill();
      ctx.strokeStyle = '#8a7a52'; ctx.lineWidth = 2.2; ctx.stroke();
      // lipatan atas + ikatan
      ctx.fillStyle = '#d9cba6';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-w * 0.82, -h, w * 1.64, h * 0.34, 5);
      else ctx.rect(-w * 0.82, -h, w * 1.64, h * 0.34);
      ctx.fill();
      ctx.strokeStyle = '#8a7a52'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = '#78716c';
      ctx.fillRect(-w * 0.82, -h * 0.68, w * 1.64, 3.4);
      // jahitan samping putus-putus
      ctx.strokeStyle = 'rgba(120,104,66,0.6)'; ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(-w + 5, -h * 0.6); ctx.lineTo(-w + 5, h * 0.88); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w - 5, -h * 0.6); ctx.lineTo(w - 5, h * 0.88); ctx.stroke();
      ctx.setLineDash([]);
      // cap kotak biru EZRAB (bentuk, tanpa teks) + garis label
      ctx.fillStyle = '#2563EB';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(-w * 0.34, -h * 0.18, w * 0.68, h * 0.5, 3);
      else ctx.rect(-w * 0.34, -h * 0.18, w * 0.68, h * 0.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-w * 0.22, h * 0.02, w * 0.44, 3);
      ctx.fillStyle = 'rgba(120,104,66,0.55)';
      ctx.fillRect(-w * 0.5, h * 0.5, w, 2.6);
      ctx.fillRect(-w * 0.38, h * 0.64, w * 0.76, 2.6);
      ctx.restore();
    };

    const drawWinLine = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      if (!s.win) return;
      const a = cellCenter(s.win.line[0], W, H);
      const b2 = cellCenter(s.win.line[2], W, H);
      const ang = Math.atan2(b2.y - a.y, b2.x - a.x);
      const fullLen = Math.hypot(b2.x - a.x, b2.y - a.y);
      // garis TUMBUH dari sel pertama ke sel terakhir dalam 0.35 dtk —
      // arah kemenangan langsung terbaca, bukan muncul sekejap utuh
      const grow = clamp((s.t - s.winAt) / 0.35, 0, 1);
      const eased = 1 - (1 - grow) * (1 - grow);
      const len = fullLen * eased;
      const ext = 26 * eased;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(ang);
      // pita ukur kuning-hitam berjalan
      ctx.fillStyle = 'rgba(253,224,71,0.22)';
      ctx.fillRect(-ext, -14, len + ext * 2, 28);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-ext, -9, len + ext * 2, 18);
      ctx.save();
      ctx.beginPath(); ctx.rect(-ext, -9, len + ext * 2, 18); ctx.clip();
      ctx.fillStyle = '#1c1917';
      const off = (s.t * 70) % 36;
      for (let x = -ext - 36 + off; x < len + ext; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 9); ctx.lineTo(x + 18, 9); ctx.lineTo(x + 9, -9); ctx.lineTo(x - 9, -9);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      // shake sudah di-apply otomatis oleh useGameCanvas — jangan double
      drawBackground(ctx, W, H);
      drawGrid(ctx, W, H);
      const g = boardGeom(W, H);
      for (let i = 0; i < 9; i += 1) {
        const m = s.board[i];
        if (!m) continue;
        const cx = i % 3; const cy = Math.floor(i / 3);
        const x = g.x + (cx + 0.5) * g.cell;
        const y = g.y + (cy + 0.5) * g.cell;
        // sorot sel garis menang: pijar berdenyut di belakang glif pemenang
        if (s.win && s.win.line.includes(i)) {
          const pulse = 0.3 + Math.sin(s.t * 6) * 0.12;
          ctx.save();
          ctx.fillStyle = s.win.mark === 'X' ? `rgba(249,115,22,${pulse.toFixed(2)})` : `rgba(231,229,228,${pulse.toFixed(2)})`;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(x - g.cell * 0.44, y - g.cell * 0.44, g.cell * 0.88, g.cell * 0.88, 12);
          else ctx.rect(x - g.cell * 0.44, y - g.cell * 0.44, g.cell * 0.88, g.cell * 0.88);
          ctx.fill();
          ctx.restore();
        }
        const age = s.placedAt[i] < 0 ? 9 : s.t - s.placedAt[i];
        const r = g.cell * 0.30;
        if (m === 'X') drawBrick(ctx, x, y, r, age);
        else drawCement(ctx, x, y, r, age);
      }
      drawWinLine(ctx, W, H);
      // spanduk SERI tegas di tengah papan (sebelumnya hanya teks melayang)
      if (s.draw) {
        const cxp = W / 2; const cyp = g.y + g.cell * 1.5;
        ctx.save();
        ctx.fillStyle = 'rgba(20,12,5,0.82)';
        ctx.font = `900 17px ${FONT}`;
        const label = 'SERI — ADUKAN RATA';
        const tw = ctx.measureText(label).width;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(cxp - tw / 2 - 16, cyp - 20, tw + 32, 40, 12);
        else ctx.rect(cxp - tw / 2 - 16, cyp - 20, tw + 32, 40);
        ctx.fill();
        ctx.strokeStyle = 'rgba(253,186,116,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText(label, cxp, cyp + 6);
        ctx.restore();
      }
      ctx.restore();
      // giliran siapa — di bawah papan: glif mini prosedural + teks
      if (screenRef.current === 'play' && !s.win && !s.draw) {
        const g2 = boardGeom(W, H);
        ctx.font = `800 13px ${FONT}`;
        const label = s.mode === 'ai'
          ? (s.turn === 'X' ? 'Giliranmu (Bata)' : 'Semen sedang berpikir…')
          : (s.turn === 'X' ? 'Giliran Bata (P1)' : 'Giliran Semen (P2)');
        const tw = ctx.measureText(label).width;
        const ly = g2.y + g2.cell * 3 + 34;
        const gx = W / 2 - tw / 2 - 16;
        if (s.turn === 'X') drawBrick(ctx, gx, ly - 5, 11, 9);
        else drawCement(ctx, gx, ly - 5, 11, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText(label, W / 2, ly);
      }
    });

    (api as unknown as { __reset: () => void }).__reset = resetAll;
    // PERBAIKAN LOOP: ronde berikutnya yang sungguhan (papan dikosongkan,
    // skor antar ronde DIPERTAHANKAN — newRound tidak menyentuh
    // xWins/oWins/draws/streak). Sebelumnya tombol Ronde Berikutnya hanya
    // mengganti layar tanpa memanggil ini, sehingga papan tetap berisi
    // tanda pemenang, s.win tidak null, dan semua klik ditolak (macet).
    (api as unknown as { __newRound: () => void }).__newRound = () => { newRound(); };
    (api as unknown as { __mode: (m: Mode) => void }).__mode = (m: Mode) => { s.mode = m; resetAll(); };
    resetAll();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (m: Mode): void => {
    sfx.ensure();
    setMode(m);
    const api = apiRef.current;
    (api as unknown as { __mode?: (x: Mode) => void } | null)?.__mode?.(m);
    setScreen('play');
  };
  const nextRound = (): void => {
    sfx.ensure();
    const api = apiRef.current;
    (api as unknown as { __newRound?: () => void } | null)?.__newRound?.();
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
    background: 'rgba(20,12,5,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#1c130a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(20,12,5,0.62)', border: '1px solid rgba(253,186,116,0.3)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BrickGlyph size={16} /><span style={{ color: '#fdba74' }}>{hud.x}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <CementGlyph size={16} /><span style={{ color: '#d6d3d1' }}>{hud.o}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span style={{ opacity: 0.7 }}>Seri {hud.d}</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            {mode === 'ai' ? `Streak: ${hud.streak} • Terbaik ${hud.best}` : '2 Pemain'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {screen === 'play' && (
            <button style={btn} onClick={togglePause} aria-label="Jeda">⏸</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}><BrickGlyph size={42} /><CementGlyph size={42} /></div>
          <h2 style={h2}>BATA vs SEMEN</h2>
          <p style={p}>
            Kamu <b>Bata</b>, lawanmu <b>Semen</b> (karung krem). Buat <b>3 sejajar</b> duluan — baris, kolom, atau diagonal!
            AI <b>Sedang</b> kadang lengah, jadi bisa dikalahkan. Ketuk petak atau tekan 1–9.
          </p>
          <button style={{ ...primaryBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => startGame('ai')}><BrickGlyph size={18} /> Lawan Semen (AI Sedang)</button>
          <button style={ghostBtn} onClick={() => startGame('2p')}>2 Pemain (1 HP)</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><CoffeeGlyph size={44} /></div>
          <h2 style={h2}>ISTIRAHAT</h2>
          <p style={p}>Adukan semennya ditutup plastik dulu biar tidak kering.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'round' && (
        <Overlay>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}><BrickGlyph size={38} /><CementGlyph size={38} /></div>
          <h2 style={h2}>RONDE SELESAI</h2>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Bata" value={`${hud.x}`} />
            <Stat label="Semen" value={`${hud.o}`} />
            <Stat label="Seri" value={`${hud.d}`} />
          </div>
          {mode === 'ai' && hud.streak >= 2 && (
            <p style={p}>Rentetan menang: <b style={{ color: '#fde047' }}>{hud.streak}x</b> — mandor bangga!</p>
          )}
          <button style={primaryBtn} onClick={nextRound}>Ronde Berikutnya</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fdba74', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#fef3c7' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fdba74,#ea580c)', color: '#431407', boxShadow: '0 8px 20px rgba(234,88,12,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fdba74', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,9,3,0.66)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#2c2010,#140d05)', border: '1px solid rgba(253,186,116,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Glif DOM: sprite generate-AI (set token papan bersama, Kelompok 2)
 * bila siap; SVG prosedural di bawah = fallback. Bahasa visualnya sama
 * dengan token di papan: bata oranye-merah bergaris nat, karung semen
 * krem berlipat dengan cap kotak biru.
 */
function BrickGlyph({ size = 24 }: { size?: number }): React.JSX.Element {
  const img = useSprite(TTT_TOKENS.X);
  const s = { width: size, height: size, display: 'block', flexShrink: 0 } as React.CSSProperties;
  if (img) return <img src={img.src} alt="Bata" draggable={false} style={{ ...s, objectFit: 'contain' }} />;
  return (
    <svg style={s} viewBox="0 0 40 40" aria-label="Bata">
      <rect x="4" y="11" width="32" height="19" rx="3.5" fill="#ea580c" stroke="#7c2d12" strokeWidth="2" />
      <rect x="4" y="11" width="32" height="5" rx="2.5" fill="#fb923c" opacity="0.8" />
      <line x1="4" y1="20.5" x2="36" y2="20.5" stroke="#7c2d12" strokeWidth="1.8" />
      <line x1="20" y1="11" x2="20" y2="20.5" stroke="#7c2d12" strokeWidth="1.8" />
      <line x1="12" y1="20.5" x2="12" y2="30" stroke="#7c2d12" strokeWidth="1.8" />
      <line x1="28" y1="20.5" x2="28" y2="30" stroke="#7c2d12" strokeWidth="1.8" />
    </svg>
  );
}

function CementGlyph({ size = 24 }: { size?: number }): React.JSX.Element {
  const img = useSprite(TTT_TOKENS.O);
  const s = { width: size, height: size, display: 'block', flexShrink: 0 } as React.CSSProperties;
  if (img) return <img src={img.src} alt="Karung semen" draggable={false} style={{ ...s, objectFit: 'contain' }} />;
  return (
    <svg style={s} viewBox="0 0 40 40" aria-label="Karung semen">
      <path d="M9 12 h22 a3 3 0 0 1 3 3 v17 a3 3 0 0 1 -3 3 H9 a3 3 0 0 1 -3 -3 V15 a3 3 0 0 1 3 -3 Z" fill="#e7dcc0" stroke="#8a7a52" strokeWidth="2" />
      <rect x="9" y="6" width="22" height="7" rx="2.5" fill="#d9cba6" stroke="#8a7a52" strokeWidth="1.8" />
      <rect x="9" y="12.4" width="22" height="2" fill="#78716c" />
      <rect x="15" y="19" width="10" height="8" rx="1.5" fill="#2563EB" />
      <line x1="17.5" y1="23" x2="22.5" y2="23" stroke="#ffffff" strokeWidth="1.6" />
      <line x1="12" y1="30.5" x2="28" y2="30.5" stroke="#8a7a52" strokeWidth="1.4" opacity="0.6" />
    </svg>
  );
}

function CoffeeGlyph({ size = 44 }: { size?: number }): React.JSX.Element {
  const s = { width: size, height: size, display: 'block' } as React.CSSProperties;
  return (
    <svg style={s} viewBox="0 0 48 48" aria-label="Kopi">
      <path d="M17 6 c-2 3 2 4 0 7 M25 6 c-2 3 2 4 0 7" fill="none" stroke="#a8a29e" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 18 h24 v10 a8 8 0 0 1 -8 8 h-8 a8 8 0 0 1 -8 -8 Z" fill="#e7e5e4" stroke="#78716c" strokeWidth="2" />
      <path d="M34 21 c5 -1 7 2 6 5 c-1 3 -4 4 -7 3" fill="none" stroke="#78716c" strokeWidth="2.2" />
      <ellipse cx="22" cy="19" rx="11" ry="2" fill="#78350f" />
      <rect x="8" y="40" width="30" height="3" rx="1.5" fill="#a8a29e" />
    </svg>
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
