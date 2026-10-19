/**
 * ArcadeSolitaire — "Solitaire Proyek" (Klondike).
 * Susun 52 kartu material (🔩🧱🪵🎨) ke 4 Tower. Drag & drop + klik
 * (klik kartu = naik otomatis ke tower), undo, skor, timer.
 * Aturan murni di logic.ts; file ini render + interaksi + juice.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d';
import {
  deal, drawStock, moveWasteToTableau, moveWasteToFoundation,
  moveTableauToFoundation, moveTableauToTableau, moveFoundationToTableau,
  autoToFoundation, isWon, undo, canUndo, validSequence,
  SUIT_INFO, RANK_LABEL, RANK_NAME,
  type Card, type SolState,
} from './logic';

const SLUG = 'solitaire';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const CW = 48;
const CH = 68;
const GAP = 6;
const MX = 8;
const TOP_Y = 10;
const TAB_Y = 108;
const DOWN_OFF = 9;
const UP_OFF = 23;

const A2TEST =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('a2test');

type Screen = 'tutorial' | 'play' | 'pause' | 'win';

type DragFrom =
  | { kind: 'waste' }
  | { kind: 'tableau'; col: number; idx: number }
  | { kind: 'foundation'; fi: number };

interface Drag {
  cards: Card[];
  from: DragFrom;
  x: number;
  y: number;
  moved: boolean;
  downAt: number;
  downX: number;
  downY: number;
}

interface Hud {
  score: number;
  moves: number;
  time: number;
  stockCount: number;
  canUndo: boolean;
}

/* ================= geometry ================= */

const stockRect = () => ({ x: MX, y: TOP_Y, w: CW, h: CH });
const wasteRect = () => ({ x: MX + CW + GAP, y: TOP_Y, w: CW, h: CH });
const foundX = (i: number) => LW - MX - 4 * CW - 3 * GAP + i * (CW + GAP);
const foundRect = (i: number) => ({ x: foundX(i), y: TOP_Y, w: CW, h: CH });
const tabX = (i: number) => MX + i * (CW + GAP);

/** y tiap kartu di kolom tableau. */
function tabCardY(pile: Card[]): number[] {
  const ys: number[] = [];
  let y = TAB_Y;
  for (let i = 0; i < pile.length; i += 1) {
    ys.push(y);
    y += pile[i].faceUp ? UP_OFF : DOWN_OFF;
  }
  return ys;
}

function inRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/* ================= drawing ================= */

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, sub: string): void {
  rr(ctx, x, y, CW, CH, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `20px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + CW / 2, y + CH / 2 - 7);
  ctx.font = `700 8px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText(sub, x + CW / 2, y + CH / 2 + 12);
}

function drawCardBack(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  rr(ctx, x, y, CW, CH, 9);
  const g = ctx.createLinearGradient(x, y, x, y + CH);
  g.addColorStop(0, '#274b9b');
  g.addColorStop(1, '#16295e');
  ctx.fillStyle = g;
  ctx.fill();
  // motif blueprint: grid
  ctx.strokeStyle = 'rgba(147,197,253,0.35)';
  ctx.lineWidth = 1;
  ctx.save();
  rr(ctx, x + 3, y + 3, CW - 6, CH - 6, 6);
  ctx.clip();
  for (let gx = x + 3; gx < x + CW - 3; gx += 8) {
    ctx.beginPath(); ctx.moveTo(gx, y + 3); ctx.lineTo(gx, y + CH - 3); ctx.stroke();
  }
  for (let gy = y + 3; gy < y + CH - 3; gy += 8) {
    ctx.beginPath(); ctx.moveTo(x + 3, gy); ctx.lineTo(x + CW - 3, gy); ctx.stroke();
  }
  ctx.restore();
  ctx.font = `19px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏗️', x + CW / 2, y + CH / 2 - 4);
  ctx.font = `800 7.5px ${FONT}`;
  ctx.fillStyle = '#bfdbfe';
  ctx.fillText('EZRAB', x + CW / 2, y + CH / 2 + 13);
  ctx.strokeStyle = 'rgba(191,219,254,0.7)';
  ctx.lineWidth = 1.6;
  rr(ctx, x + 0.8, y + 0.8, CW - 1.6, CH - 1.6, 8);
  ctx.stroke();
}

function drawCardFace(ctx: CanvasRenderingContext2D, c: Card, x: number, y: number, opts?: { ghost?: boolean; dim?: boolean }): void {
  const info = SUIT_INFO[c.suit];
  ctx.save();
  if (opts?.ghost) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
  }
  if (opts?.dim) ctx.globalAlpha = 0.35;
  rr(ctx, x, y, CW, CH, 9);
  const g = ctx.createLinearGradient(x, y, x, y + CH);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#eef1f5');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = info.merah ? '#b91c1c' : '#1f2937';
  ctx.lineWidth = 1.6;
  rr(ctx, x + 0.8, y + 0.8, CW - 1.6, CH - 1.6, 8);
  ctx.stroke();

  const col = info.merah ? '#dc2626' : '#1f2937';
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // rank sudut
  ctx.font = `900 12px ${FONT}`;
  ctx.fillText(RANK_LABEL[c.rank], x + 10, y + 10);
  ctx.font = `11px system-ui`;
  ctx.fillText(info.ikon, x + 10, y + 23);
  // tengah: ikon suit besar / tokoh untuk J Q K
  const faceEmoji = c.rank === 11 ? '👷' : c.rank === 12 ? '🧑‍🎨' : c.rank === 13 ? '👨‍💼' : null;
  if (faceEmoji) {
    ctx.font = `24px system-ui`;
    ctx.fillText(faceEmoji, x + CW / 2, y + CH / 2 - 6);
    ctx.font = `800 7px ${FONT}`;
    ctx.fillStyle = info.merah ? '#b91c1c' : '#374151';
    ctx.fillText(RANK_NAME[c.rank].toUpperCase(), x + CW / 2, y + CH / 2 + 14);
  } else {
    ctx.font = c.rank === 1 ? `26px system-ui` : `24px system-ui`;
    ctx.fillText(info.ikon, x + CW / 2, y + CH / 2 + 1);
    if (c.rank === 1) {
      ctx.font = `800 7px ${FONT}`;
      ctx.fillStyle = info.merah ? '#b91c1c' : '#374151';
      ctx.fillText('HELM K3', x + CW / 2, y + CH / 2 + 18);
    }
  }
  // rank bawah (terbalik)
  ctx.save();
  ctx.translate(x + CW - 10, y + CH - 10);
  ctx.rotate(Math.PI);
  ctx.fillStyle = col;
  ctx.font = `900 12px ${FONT}`;
  ctx.fillText(RANK_LABEL[c.rank], 0, 0);
  ctx.restore();
  ctx.restore();
}

/* ================= component ================= */

export default function ArcadeSolitaire({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const stRef = useRef<SolState | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const timeRef = useRef(0);
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ score: 0, moves: 0, time: 0, stockCount: 24, canUndo: false });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const pushHud = (): void => {
    const st = stRef.current;
    if (!st) return;
    apiRef.current?.pushHud({
      score: st.score,
      moves: st.moves,
      time: Math.floor(timeRef.current),
      stockCount: st.stock.length,
      canUndo: canUndo(st),
    } as Hud);
  };

  const fmt = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const celebrateWin = (): void => {
    const api = apiRef.current;
    const st = stRef.current;
    if (!api || !st) return;
    const secs = Math.floor(timeRef.current);
    const best = getBest(bestKey(SLUG, 'time'), 0);
    if (best === 0 || secs < best) setBest(bestKey(SLUG, 'time'), secs);
    setBest(bestKey(SLUG, 'score'), st.score);
    api.sfx.chime(4);
    for (let i = 0; i < 5; i += 1) {
      window.setTimeout(() => {
        api.particles.spawn(60 + Math.random() * (api.W - 120), 80 + Math.random() * 160, {
          count: 40, colors: ['#ffd166', '#4ade80', '#f5b301', '#ffffff', '#fb923c'],
          speed: [100, 380], up: 180, gravity: 420, life: [0.8, 1.6],
          size: [3, 7], shape: 'rect', rotation: true,
        });
      }, i * 220);
    }
    window.setTimeout(() => setScreen('win'), 900);
  };

  const afterMove = (ok: boolean, kind: 'foundation' | 'tableau' | 'draw'): void => {
    const api = apiRef.current;
    const st = stRef.current;
    if (!ok || !api || !st) return;
    if (kind === 'foundation') {
      api.sfx.chime(1);
      api.scores.add(api.W / 2, 60, '+10', { color: '#4ade80', size: 22 });
    } else if (kind === 'tableau') {
      api.sfx.pop(1.1);
    } else {
      api.sfx.whoosh();
    }
    pushHud();
    if (isWon(st)) celebrateWin();
  };

  const newGame = (): void => {
    const api = apiRef.current;
    if (!api) return;
    api.sfx.ensure();
    stRef.current = deal(Math.random);
    dragRef.current = null;
    timeRef.current = 0;
    pushHud();
    setScreen('play');
  };

  const doUndo = (): void => {
    const st = stRef.current;
    if (!st || !canUndo(st)) return;
    apiRef.current?.sfx.ensure();
    apiRef.current?.sfx.click();
    undo(st);
    pushHud();
  };

  /** Cari kartu tableau pada titik (dari atas). */
  const hitTableau = (st: SolState, px: number, py: number): { col: number; idx: number } | null => {
    for (let col = 0; col < 7; col += 1) {
      const x = tabX(col);
      if (px < x || px > x + CW) continue;
      const pile = st.tableau[col];
      const ys = tabCardY(pile);
      for (let i = pile.length - 1; i >= 0; i -= 1) {
        if (py >= ys[i] && py <= ys[i] + CH) return { col, idx: i };
      }
    }
    return null;
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);
    stRef.current = deal(Math.random);
    pushHud();

    const toGame = (p: { x: number; y: number }): { x: number; y: number } => {
      const s = api.W / LW;
      return { x: p.x / s, y: p.y / s };
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      const st = stRef.current;
      if (!st || screenRef.current !== 'play') return;
      const g = toGame(p);
      const now = performance.now();

      // stock → ambil kartu
      if (inRect(g.x, g.y, stockRect())) {
        const r = drawStock(st);
        afterMove(r !== 'empty', 'draw');
        return;
      }

      // waste teratas
      const w = st.waste[st.waste.length - 1];
      if (w && inRect(g.x, g.y, wasteRect())) {
        dragRef.current = { cards: [w], from: { kind: 'waste' }, x: g.x, y: g.y, moved: false, downAt: now, downX: g.x, downY: g.y };
        return;
      }

      // foundation teratas
      for (let fi = 0; fi < 4; fi += 1) {
        const f = st.foundations[fi];
        const top = f[f.length - 1];
        if (top && inRect(g.x, g.y, foundRect(fi))) {
          dragRef.current = { cards: [top], from: { kind: 'foundation', fi }, x: g.x, y: g.y, moved: false, downAt: now, downX: g.x, downY: g.y };
          return;
        }
      }

      // tableau
      const hit = hitTableau(st, g.x, g.y);
      if (hit) {
        const pile = st.tableau[hit.col];
        const card = pile[hit.idx];
        if (!card.faceUp) return;
        const count = pile.length - hit.idx;
        if (!validSequence(pile, count)) return;
        dragRef.current = {
          cards: pile.slice(hit.idx),
          from: { kind: 'tableau', col: hit.col, idx: hit.idx },
          x: g.x, y: g.y, moved: false, downAt: now, downX: g.x, downY: g.y,
        };
      }
    };

    api.input.onMove = (p) => {
      const d = dragRef.current;
      if (!d) return;
      const g = toGame(p);
      if (Math.hypot(g.x - d.downX, g.y - d.downY) > 8) d.moved = true;
      d.x = g.x;
      d.y = g.y;
    };

    api.input.onUp = (p) => {
      const d = dragRef.current;
      const st = stRef.current;
      dragRef.current = null;
      if (!d || !st || screenRef.current !== 'play') return;
      const g = toGame(p);

      // KLIK (tanpa drag): coba naikkan ke tower / ambil dari stock sudah ditangani
      if (!d.moved && performance.now() - d.downAt < 400) {
        if (d.from.kind === 'waste') {
          afterMove(autoToFoundation(st, { kind: 'waste' }), 'foundation');
          return;
        }
        if (d.from.kind === 'tableau') {
          const pile = st.tableau[d.from.col];
          if (d.from.idx === pile.length - 1) {
            afterMove(autoToFoundation(st, { kind: 'tableau', col: d.from.col }), 'foundation');
            return;
          }
        }
        if (d.from.kind === 'foundation') return; // klik tower: tidak apa-apa
      }

      // DROP: coba foundation dulu, lalu tableau
      const cx = g.x;
      const cy = g.y;
      let done = false;
      let kind: 'foundation' | 'tableau' = 'tableau';

      if (d.cards.length === 1) {
        for (let fi = 0; fi < 4 && !done; fi += 1) {
          if (inRect(cx, cy, foundRect(fi))) {
            if (d.from.kind === 'waste') done = moveWasteToFoundation(st, fi);
            else if (d.from.kind === 'tableau' && d.from.idx === st.tableau[d.from.col].length - 1) {
              done = moveTableauToFoundation(st, d.from.col);
            } else if (d.from.kind === 'foundation' && d.from.fi !== fi) {
              // tower → tower tidak diizinkan
              done = false;
            }
            if (done) kind = 'foundation';
          }
        }
      }
      if (!done) {
        for (let col = 0; col < 7 && !done; col += 1) {
          const pile = st.tableau[col];
          const ys = tabCardY(pile);
          const topY = pile.length > 0 ? ys[ys.length - 1] : TAB_Y;
          const dropZone = { x: tabX(col), y: TAB_Y, w: CW, h: Math.max(CH, topY + CH - TAB_Y) };
          if (inRect(cx, cy, dropZone)) {
            if (d.from.kind === 'waste') done = moveWasteToTableau(st, col);
            else if (d.from.kind === 'tableau' && d.from.col !== col) {
              done = moveTableauToTableau(st, d.from.col, d.cards.length, col);
            } else if (d.from.kind === 'foundation') {
              done = moveFoundationToTableau(st, d.from.fi, col);
            }
            if (done) kind = 'tableau';
          }
        }
      }
      if (done) {
        afterMove(true, kind);
        // partikel debu kecil di titik drop
        api.particles.spawn(g.x * (api.W / LW), g.y * (api.W / LW), {
          count: 6, colors: ['#ffffff', '#dbeafe'],
          speed: [40, 140], life: [0.25, 0.5], size: [2, 4],
        });
      } else {
        api.sfx.click();
      }
    };

    api.setUpdate((dt) => {
      if (screenRef.current === 'play') {
        timeRef.current += dt;
        // push timer tiap detik
        const s = Math.floor(timeRef.current);
        if (s !== Math.floor(timeRef.current - dt)) pushHud();
      }
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') {
          api.loop.setPaused(true);
          setScreen('pause');
        } else if (screenRef.current === 'pause') {
          api.loop.setPaused(false);
          setScreen('play');
        }
      }
      if (api.input.wasPressed('KeyZ')) doUndo();
    });

    api.setRender(() => {
      const st = stRef.current;
      if (!st) return;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      ctx.save();
      ctx.scale(s, s);

      // felt hijau proyek berlapis
      const bg = ctx.createLinearGradient(0, 0, 0, lh);
      bg.addColorStop(0, '#1f6f4a');
      bg.addColorStop(0.6, '#185c3d');
      bg.addColorStop(1, '#124a31');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, LW, lh);
      // tekstur felt: titik halus
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 90; i += 1) {
        const px = (i * 53) % LW;
        const py = (i * 97) % lh;
        ctx.fillRect(px, py, 2, 2);
      }
      // vignette
      const vg = ctx.createRadialGradient(LW / 2, lh / 2, lh * 0.3, LW / 2, lh / 2, lh * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, LW, lh);

      const d = dragRef.current;
      const dragIds = new Set((d?.cards ?? []).map((c) => c.id));

      // stock
      if (st.stock.length > 0) {
        // tumpuk 3 lapis untuk kesan tebal
        for (let k = 2; k >= 1; k -= 1) drawCardBack(ctx, stockRect().x + k * 1.5, stockRect().y - k * 1.5);
        drawCardBack(ctx, stockRect().x, stockRect().y);
        ctx.fillStyle = '#fff';
        ctx.font = `900 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(st.stock.length), stockRect().x + CW / 2, stockRect().y + CH + 15);
      } else {
        drawSlot(ctx, stockRect().x, stockRect().y, '🔄', 'DAUR ULANG');
      }

      // waste
      if (st.waste.length > 0) {
        const w = st.waste[st.waste.length - 1];
        if (!dragIds.has(w.id)) drawCardFace(ctx, w, wasteRect().x, wasteRect().y);
      } else {
        drawSlot(ctx, wasteRect().x, wasteRect().y, '📥', 'SORTIR');
      }

      // foundations (4 tower)
      for (let fi = 0; fi < 4; fi += 1) {
        const f = st.foundations[fi];
        const r = foundRect(fi);
        if (f.length === 0) {
          drawSlot(ctx, r.x, r.y, '🏗️', `TOWER ${fi + 1}`);
        } else {
          const top = f[f.length - 1];
          if (!dragIds.has(top.id)) drawCardFace(ctx, top, r.x, r.y);
          ctx.fillStyle = 'rgba(15,23,42,0.55)';
          ctx.font = `800 10px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(`${f.length}/13`, r.x + CW / 2, r.y + CH + 13);
        }
      }

      // tableau
      for (let col = 0; col < 7; col += 1) {
        const pile = st.tableau[col];
        const x = tabX(col);
        if (pile.length === 0) drawSlot(ctx, x, TAB_Y, '🚧', 'LAHAN');
        const ys = tabCardY(pile);
        for (let i = 0; i < pile.length; i += 1) {
          const c = pile[i];
          if (dragIds.has(c.id)) continue;
          if (c.faceUp) drawCardFace(ctx, c, x, ys[i]);
          else drawCardBack(ctx, x, ys[i]);
        }
      }

      // ghost drag
      if (d) {
        const gx = d.x - CW / 2;
        let gy = d.y - CH / 2;
        // sembunyikan kartu asal saat drag (sudah via dragIds), gambar di pointer
        d.cards.forEach((c, i) => {
          drawCardFace(ctx, c, gx, gy + i * UP_OFF, { ghost: true, dim: false });
        });
        void gy;
      }

      ctx.restore();
    });

    api.loop.start();

    if (A2TEST) {
      (window as unknown as Record<string, unknown>).__solitaire = {
        get screen() { return screenRef.current; },
        get score() { return stRef.current?.score ?? 0; },
        get moves() { return stRef.current?.moves ?? 0; },
        get won() { return stRef.current ? isWon(stRef.current) : false; },
        get stockCount() { return stRef.current?.stock.length ?? 0; },
        get wasteTop() {
          const w = stRef.current?.waste;
          return w && w.length > 0 ? { suit: w[w.length - 1].suit, rank: w[w.length - 1].rank } : null;
        },
        start() { setScreen('play'); },
        draw() { const st = stRef.current; if (st) { const r = drawStock(st); afterMove(r !== 'empty', 'draw'); } },
        autoWaste() { const st = stRef.current; if (st) afterMove(autoToFoundation(st, { kind: 'waste' }), 'foundation'); },
        undo: doUndo,
        newGame,
      };
    }

    return () => {
      apiRef.current = null;
      if (A2TEST) delete (window as unknown as Record<string, unknown>).__solitaire;
    };
  });

  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    setScreen('pause');
  };
  const doResume = (): void => {
    apiRef.current?.sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };
  const toggleMute = (): void => {
    apiRef.current?.sfx.ensure();
    setMuted(apiRef.current?.sfx.toggleMute() ?? false);
  };

  const btn: React.CSSProperties = {
    minWidth: 40, minHeight: 40, borderRadius: 11, border: 'none',
    background: 'rgba(10,25,18,0.55)', color: '#fff', fontSize: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 8px',
  };

  const bestTime = getBest(bestKey(SLUG, 'time'), 0);
  const bestScore = getBest(bestKey(SLUG, 'score'), 0);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#185c3d', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '76px 10px 0', display: 'flex', alignItems: 'center', gap: 6, zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ background: 'rgba(10,25,18,0.55)', borderRadius: 11, padding: '5px 10px', color: '#fff', fontWeight: 800, fontSize: 13 }}>
            ⭐ {hud.score}
          </div>
          <div style={{ background: 'rgba(10,25,18,0.45)', borderRadius: 11, padding: '5px 10px', color: '#e2e8f0', fontWeight: 800, fontSize: 13 }}>
            ⏱️ {fmt(hud.time)}
          </div>
          <div style={{ background: 'rgba(10,25,18,0.45)', borderRadius: 11, padding: '5px 10px', color: '#e2e8f0', fontWeight: 800, fontSize: 13 }}>
            👆 {hud.moves}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: 6 }}>
          <button style={btn} onClick={doUndo} disabled={!hud.canUndo} aria-label="Urungkan" title="Urungkan (Z)">
            ↩️
          </button>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">
              {screen === 'play' ? '⏸' : '▶'}
            </button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 46 }}>🃏🏗️</div>
          <h2 style={titleStyle}>SOLITAIRE PROYEK</h2>
          <p style={textStyle}>
            Susun 52 kartu material ke 4 Tower (A→K per material).
            <b> Seret</b> kartu antar Lahan (turun & beda warna), <b>ketuk</b> kartu untuk menaikkannya otomatis, <b>ketuk tumpukan</b> untuk ambil kartu baru.
          </p>
          <button style={primaryBtn} onClick={() => { apiRef.current?.sfx.ensure(); apiRef.current?.sfx.click(); setScreen('play'); }}>Mulai Kerja 🃏</button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>ISTIRAHAT</h2>
          <p style={textStyle}>Kartu-kartunya ditinggal, tidak ke mana-mana. Kayak progres proyek.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={newGame}>Acak Baru</button>
          </div>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 48 }}>🏆</div>
          <h2 style={titleStyle}>PROYEK SELESAI!</h2>
          <p style={textStyle}>
            4 Tower berdiri megah. Serah terima tanpa revisi — keajaiban konstruksi!
          </p>
          <p style={{ ...textStyle, fontSize: 16 }}>
            ⏱️ Waktu: <b>{fmt(hud.time)}</b> {bestTime > 0 && <span>• 🏅 Terbaik: <b>{fmt(bestTime)}</b></span>}<br />
            ⭐ Skor: <b>{hud.score}</b> • 👆 Langkah: <b>{hud.moves}</b>
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={newGame}>Main Lagi 🔁</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(0,0,0,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#e2e8f0', fontSize: 14, lineHeight: 1.6, margin: '6px 0 12px', maxWidth: 320,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#4ade80,#22c55e)', color: '#052e16',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(74,222,128,0.4)',
};
const secondaryBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.16)', color: '#fff',
  fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(8,20,14,0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
