/**
 * Sambung Kata — word-connect 2D: seret/ketuk huruf di roda jadi kata konstruksi.
 * Pure rules in ./logic.ts; this file is rendering + input + juice.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp, easeOutBack } from '../../engine2d';
import { bestKey, getBest, setBest, getJson, setJson } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import {
  mulberry32, shuffleSeeded, generateLevel, submitWord, revealHint,
  levelComplete, nextPosition, appendSelection, HINTS_PER_PACK, PACK_NAMES,
  type Level,
} from './logic';
import { drawNoise, hashRand } from './fx';

const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const BK = bestKey('sambung-kata', 'best');
const PROG_KEY = bestKey('sambung-kata', 'progress');

interface Hud {
  pack: number;
  level: number;
  found: number;
  total: number;
  hintsLeft: number;
}

interface S {
  level: Level;
  letters: string[];
  sel: number[];
  found: string[];
  foundTs: Record<string, number>;
  hints: Record<string, string>;
  hintsLeft: number;
  down: boolean;
  dragging: boolean;
  startPt: { x: number; y: number };
  pointer: { x: number; y: number };
  rngState: number;
  won: boolean;
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function loadProgress(): { pack: number; level: number } {
  const p = getJson<{ pack: number; level: number }>(PROG_KEY, { pack: 0, level: 0 });
  if (typeof p.pack !== 'number' || typeof p.level !== 'number' || p.pack < 0 || p.pack > 2 || p.level < 0 || p.level > 19) {
    return { pack: 0, level: 0 };
  }
  return p;
}

/* ---------- layout helpers (computed per frame from W/H) ---------- */

interface Layout {
  cx: number;
  cy: number;
  R: number;
  nr: number;
  nodePos: Array<{ x: number; y: number }>;
  okPos: { x: number; y: number };
  clrPos: { x: number; y: number };
  btnR: number;
  slotTop: number;
  bw: number;
}

function computeLayout(W: number, H: number, n: number, maxLen: number, wordCount: number): Layout {
  const cx = W / 2;
  const slotTop = 118;
  const bw = Math.min(34, (W - 48) / maxLen - 6);
  const slotH = (wordCount - 1) * (bw + 12) + bw * 1.06;
  // wheel gets whatever vertical space remains below the slots
  const wheelTop = slotTop + slotH + 12;
  const wheelAvail = Math.max(150, H - 10 - wheelTop);
  const btnR = 27;
  const nr = 30; // fixed node radius target; R adapts
  // width budget: wheel + nodes + side gap + buttons must fit on screen
  const sidePad = 40; // node-edge → button-center clearance (no overlap on 390px)
  const maxRWidth = Math.max(64, (W - 16) / 2 - nr - sidePad - btnR);
  const R = Math.max(64, Math.min(W * 0.30, wheelAvail / 2 - 36, maxRWidth));
  const cy = wheelTop + wheelAvail / 2;
  const nodeR = clamp(Math.min(30, (Math.PI * R) / Math.max(4, n) - 4), 18, 30);
  const nodePos = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * TAU) / n;
    return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
  });
  return {
    cx, cy, R, nr: nodeR, nodePos,
    okPos: { x: cx + R + nodeR + sidePad, y: cy },
    clrPos: { x: cx - R - nodeR - sidePad, y: cy },
    btnR,
    slotTop,
    bw,
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1f36');
  g.addColorStop(0.6, '#14456f');
  g.addColorStop(1, '#0a1a2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // blueprint grid
  ctx.strokeStyle = 'rgba(140,190,235,0.07)';
  ctx.lineWidth = 1;
  const step = 30;
  ctx.beginPath();
  for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // faint compass rings behind wheel area
  const cx = W / 2;
  const cy = H * 0.70;
  ctx.strokeStyle = 'rgba(140,190,235,0.10)';
  for (const r of [150, 185]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  // drifting dust
  ctx.fillStyle = 'rgba(180,215,245,0.25)';
  for (let i = 0; i < 14; i += 1) {
    const px = ((i * 97 + t * 12) % (W + 40)) - 20;
    const py = (i * 61) % H;
    ctx.beginPath();
    ctx.arc(px, py, 1.6, 0, TAU);
    ctx.fill();
  }
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4,8,16,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  drawNoise(ctx, W, H, '#bcd6f5', 0.05);
}

function drawNode(
  ctx: CanvasRenderingContext2D, x: number, y: number, nr: number,
  ch: string, selected: boolean, order: number,
): void {
  // selected: warm outer glow
  if (selected) {
    ctx.save();
    ctx.shadowColor = 'rgba(253,224,71,0.85)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(253,224,71,0.25)';
    ctx.beginPath();
    ctx.arc(x, y, nr + 6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // outer metal ring (brushed)
  const ring = ctx.createLinearGradient(x - nr, y - nr, x + nr, y + nr);
  ring.addColorStop(0, selected ? '#fde047' : '#9db2ca');
  ring.addColorStop(0.5, selected ? '#d97706' : '#5f748c');
  ring.addColorStop(1, selected ? '#b45309' : '#43566c');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(x, y, nr, 0, TAU);
  ctx.fill();
  // brushed-metal ticks around the ring (deterministic)
  ctx.save();
  ctx.strokeStyle = selected ? 'rgba(120,53,15,0.5)' : 'rgba(230,240,250,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k < 28; k += 1) {
    const a = (k / 28) * TAU + (ch.charCodeAt(0) % 7) * 0.05;
    const r1 = nr - 2.5;
    const r2 = nr - 7;
    ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
  }
  ctx.stroke();
  ctx.restore();
  // wooden face
  const face = ctx.createRadialGradient(x - nr * 0.3, y - nr * 0.35, nr * 0.2, x, y, nr * 0.85);
  face.addColorStop(0, selected ? '#ffe9a8' : '#f0e2c0');
  face.addColorStop(0.6, selected ? '#f5c452' : '#d9bd85');
  face.addColorStop(1, selected ? '#e0a83c' : '#b99a63');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, nr - 5, 0, TAU);
  ctx.fill();
  // wood grain: 3 faint arcs (stable per letter)
  ctx.save();
  ctx.strokeStyle = selected ? 'rgba(146,64,14,0.35)' : 'rgba(90,60,20,0.28)';
  ctx.lineWidth = 1.2;
  const gr = hashRand(ch.charCodeAt(0) * 131 + 7);
  for (let k = 0; k < 3; k += 1) {
    const rr2 = nr * (0.28 + k * 0.2);
    const a0 = gr() * TAU;
    ctx.beginPath();
    ctx.arc(x, y, rr2, a0, a0 + Math.PI * (0.7 + gr() * 0.6));
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(90,60,20,0.5)';
  ctx.beginPath();
  ctx.arc(x, y, nr - 5, 0, TAU);
  ctx.stroke();
  // top gloss crescent on the wood
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x - nr * 0.18, y - nr * 0.42, nr * 0.34, nr * 0.16, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  // embossed letter: light underlay, dark ink on top
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(nr * 0.95)}px ${FONT}`;
  ctx.fillStyle = selected ? 'rgba(255,248,225,0.9)' : 'rgba(255,250,235,0.55)';
  ctx.fillText(ch, x, y + 2.5);
  ctx.fillStyle = selected ? '#5b3a05' : '#3d2c12';
  ctx.fillText(ch, x, y + 1);
  if (selected) {
    // order badge with its own mini 3D
    const bx = x + nr * 0.62;
    const by = y - nr * 0.62;
    const bg2 = ctx.createLinearGradient(0, by - 10, 0, by + 10);
    bg2.addColorStop(0, '#fbbf24');
    bg2.addColorStop(1, '#b45309');
    ctx.fillStyle = bg2;
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `900 12px ${FONT}`;
    ctx.fillText(String(order + 1), bx, by + 1);
  }
}

function drawCircleBtn(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  bg1: string, bg2: string, label: string, labelColor: string,
): void {
  // drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, bg1);
  g.addColorStop(0.55, bg2);
  g.addColorStop(1, bg2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
  // rim light + bottom weight
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();
  const rim = ctx.createLinearGradient(0, y - r, 0, y + r);
  rim.addColorStop(0, 'rgba(255,255,255,0.35)');
  rim.addColorStop(0.35, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = rim;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  // top gloss crescent
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.52, r * 0.52, r * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = labelColor;
  if (label === 'back') {
    // backspace glyph drawn manually (font coverage for ⌫ is spotty)
    ctx.strokeStyle = labelColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const bw2 = r * 0.52;
    const bh2 = r * 0.36;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x - bw2, y - bh2, bw2 * 2, bh2 * 2, 5);
    else ctx.rect(x - bw2, y - bh2, bw2 * 2, bh2 * 2);
    ctx.stroke();
    const k = r * 0.16;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    ctx.stroke();
  } else {
    ctx.font = `900 ${Math.round(r * 0.9)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }
}

/* ---------------- component ---------------- */

type Screen = 'tutorial' | 'play' | 'pause' | 'win' | 'packdone' | 'alldone';

export default function SambungKata({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const ctlRef = useRef<{ load: (pack: number, level: number) => void; shuffle: () => void; hint: () => void } | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState<Hud>({ pack: 0, level: 0, found: 0, total: 0, hintsLeft: HINTS_PER_PACK });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);

    const s: S = {
      level: generateLevel(0, 0),
      letters: [],
      sel: [],
      found: [],
      foundTs: {},
      hints: {},
      hintsLeft: HINTS_PER_PACK,
      down: false,
      dragging: false,
      startPt: { x: 0, y: 0 },
      pointer: { x: 0, y: 0 },
      rngState: (Date.now() ^ (Math.random() * 1e9)) | 0,
      won: false,
    };
    const nextRng = (): number => {
      s.rngState = (s.rngState + 0x6d2b79f5) | 0;
      return ((s.rngState >>> 0) % 100000) / 100000;
    };

    const hudOf = (): Hud => ({
      pack: s.level.pack, level: s.level.level,
      found: s.found.length, total: s.level.words.length,
      hintsLeft: s.hintsLeft,
    });
    const hintKey = (pack: number): string => bestKey('sambung-kata', `hints-p${pack}`);

    const load = (pack: number, level: number): void => {
      s.level = generateLevel(pack, level);
      s.letters = [...s.level.letters];
      s.sel = [];
      s.found = [];
      s.foundTs = {};
      s.hints = getJson<Record<string, string>>(bestKey('sambung-kata', `revealed-p${pack}l${level}`), {});
      s.hintsLeft = getJson<number>(hintKey(pack), HINTS_PER_PACK);
      s.won = false;
      setBest(BK, Math.max(getBest(BK, 0), pack * 20 + level));
      api.pushHud(hudOf());
    };

    const doShuffle = (): void => {
      s.rngState = (s.rngState + 0x9e3779b9) | 0;
      s.letters = shuffleSeeded(s.letters, mulberry32(s.rngState));
      s.sel = [];
      api.sfx.whoosh();
    };

    const doHint = (): void => {
      if (s.won || screenRef.current !== 'play') return;
      if (s.hintsLeft <= 0) {
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, 'Hint habis! Minta ke mandor… eh, sudah habis.', { size: 18, color: '#fca5a5' });
        api.sfx.click();
        return;
      }
      const h = revealHint(s.level, s.found);
      if (!h) {
        const wrap = wrapRef.current;
        if (wrap) popText(wrap, 'Semua kata sudah ketemu!', { size: 18, color: '#bae6fd' });
        return;
      }
      s.hints[h.word] = h.ch;
      s.hintsLeft -= 1;
      setJson(hintKey(s.level.pack), s.hintsLeft);
      setJson(bestKey('sambung-kata', `revealed-p${s.level.pack}l${s.level.level}`), s.hints);
      api.sfx.chime(2);
      api.particles.spawn(api.W / 2, 150, {
        count: 16, colors: ['#fde047', '#fbbf24', '#fff7d6'],
        speed: [60, 200], life: [0.4, 0.8], size: [2, 5], shape: 'spark',
      });
      api.pushHud(hudOf());
    };

    const winLevel = (): void => {
      s.won = true;
      const { pack, level } = s.level;
      const progVal = pack * 20 + level + 1;
      const prevBest = getBest(BK, 0);
      if (progVal > prevBest) setBest(BK, progVal);
      const nxt = nextPosition(pack, level);
      if (nxt) setJson(PROG_KEY, nxt);
      api.sfx.chime(4);
      api.particles.spawn(api.W / 2, api.H * 0.4, {
        count: 70, colors: ['#fde047', '#fbbf24', '#fff7d6', '#4ade80'],
        speed: [120, 420], life: [0.6, 1.2], size: [2, 6], gravity: 300, shape: 'rect', rotation: true,
      });
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'RAB disetujui tanpa revisi!', { size: 30, color: '#4ade80' });
      window.setTimeout(() => {
        if (!nxt) {
          setScreen('alldone');
        } else if (nxt.pack !== pack) {
          setScreen('packdone');
        } else {
          setScreen('win');
        }
      }, 1100);
    };

    const submitSel = (): void => {
      if (s.sel.length === 0 || s.won || screenRef.current !== 'play') {
        s.sel = [];
        return;
      }
      const word = s.sel.map((i) => s.letters[i]).join('');
      s.sel = [];
      const res = submitWord(s.level, s.found, word);
      const wrap = wrapRef.current;
      if (res.status === 'target') {
        s.found = [...s.found, res.word];
        s.foundTs[res.word] = nowMs();
        api.sfx.pop(1 + nextRng() * 0.3);
        // burst at the word's slot row
        const idx = s.level.words.indexOf(res.word);
        const maxLen = Math.max(...s.level.words.map((w) => w.length));
        const bw = Math.min(34, (api.W - 48) / maxLen - 6);
        const rowY = 118 + idx * (bw + 10) + bw / 2;
        api.particles.spawn(api.W / 2, rowY, {
          count: 24, colors: ['#fde047', '#fbbf24', '#fff7d6'],
          speed: [80, 300], life: [0.4, 0.9], size: [2, 5], gravity: 400, shape: 'spark',
        });
        api.scores.add(api.W / 2, rowY - 24, '+1 KATA', { color: '#4ade80', size: 20 });
        api.pushHud(hudOf());
        if (levelComplete(s.level, s.found)) winLevel();
      } else if (res.status === 'already') {
        api.scores.add(api.W / 2, 92, 'Sudah ketemu!', { color: '#cbd5e1', size: 18 });
        api.sfx.click();
      } else if (res.status === 'other') {
        if (wrap) popText(wrap, `"${res.word}" — bukan kata level ini`, { size: 17, color: '#fcd34d' });
        api.sfx.click();
      } else {
        api.shake.add(0.28);
        api.sfx.click();
        api.scores.add(api.W / 2, 92, 'Bukan kata!', { color: '#f87171', size: 20 });
      }
    };

    const appendLetter = (idx: number): void => {
      // Letter reuse IS allowed (words like BATA need 'A' twice):
      // only a consecutive repeat is ignored (finger resting on one node).
      s.sel = appendSelection(s.sel, idx);
      api.sfx.click();
    };

    const nodeAt = (p: { x: number; y: number }, lay: Layout): number => {
      for (let i = 0; i < lay.nodePos.length; i += 1) {
        const n = lay.nodePos[i];
        if (Math.hypot(p.x - n.x, p.y - n.y) < lay.nr + 10) return i;
      }
      return -1;
    };

    const layOf = (): Layout => {
      const maxLen = Math.max(...s.level.words.map((w) => w.length));
      return computeLayout(api.W, api.H, s.letters.length, maxLen, s.level.words.length);
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.won) return;
      s.down = true;
      s.dragging = false;
      s.startPt = { x: p.x, y: p.y };
      s.pointer = { x: p.x, y: p.y };
      const lay = layOf();
      const ni = nodeAt(p, lay);
      if (ni >= 0) {
        appendLetter(ni);
        return;
      }
      if (Math.hypot(p.x - lay.okPos.x, p.y - lay.okPos.y) < lay.btnR + 8) {
        submitSel();
        s.down = false;
        return;
      }
      if (Math.hypot(p.x - lay.clrPos.x, p.y - lay.clrPos.y) < lay.btnR + 8) {
        s.sel = [];
        api.sfx.click();
        s.down = false;
      }
    };
    api.input.onMove = (p) => {
      s.pointer = { x: p.x, y: p.y };
      if (!s.down || screenRef.current !== 'play' || s.won) return;
      if (Math.hypot(p.x - s.startPt.x, p.y - s.startPt.y) > 14) s.dragging = true;
      if (!s.dragging) return;
      const ni = nodeAt(p, layOf());
      if (ni >= 0) appendLetter(ni);
    };
    api.input.onUp = () => {
      if (s.down && s.dragging && s.sel.length >= 2 && screenRef.current === 'play' && !s.won) {
        submitSel();
      }
      s.down = false;
      s.dragging = false;
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') {
          api.loop.setPaused(true);
          setScreen('pause');
        } else if (screenRef.current === 'pause') {
          api.loop.setPaused(false);
          setScreen('play');
        }
      }
      void dt;
    });

    api.setRender(() => {
      const { ctx, W, H } = api;
      const t = nowMs() / 1000;
      drawBackground(ctx, W, H, t);
      const lay = layOf();
      const maxLen = Math.max(...s.level.words.map((w) => w.length));

      // current forming word (only when non-empty; HUD lives at the top)
      const cur = s.sel.map((i) => s.letters[i]).join('');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (cur) {
        ctx.font = `900 30px ${FONT}`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(10,20,35,0.6)';
        ctx.strokeText(cur, W / 2, 66);
        ctx.fillStyle = '#fde047';
        ctx.fillText(cur, W / 2, 66);
      }

      // answer slots
      const bw = lay.bw;
      const bh = bw * 1.06;
      s.level.words.forEach((word, wi) => {
        const rowY = lay.slotTop + wi * (bw + 12);
        const rowW = word.length * (bw + 6) - 6;
        const x0 = W / 2 - rowW / 2;
        const isFound = s.found.includes(word);
        const age = isFound ? (nowMs() - (s.foundTs[word] ?? 0)) / 1000 : 99;
        const pop = isFound ? easeOutBack(clamp(age / 0.35, 0, 1)) : 1;
        for (let li = 0; li < word.length; li += 1) {
          const bx = x0 + li * (bw + 6);
          ctx.save();
          ctx.translate(bx + bw / 2, rowY + bh / 2);
          ctx.scale(pop, pop);
          ctx.translate(-(bx + bw / 2), -(rowY + bh / 2));
          if (isFound) {
            const gg = ctx.createLinearGradient(0, rowY, 0, rowY + bh);
            gg.addColorStop(0, '#fde047');
            gg.addColorStop(1, '#d97706');
            ctx.fillStyle = gg;
            ctx.strokeStyle = '#92400e';
          } else {
            ctx.fillStyle = 'rgba(20,40,65,0.85)';
            ctx.strokeStyle = 'rgba(150,190,230,0.4)';
          }
          const r = 8;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, rowY, bw, bh, r);
          else ctx.rect(bx, rowY, bw, bh);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.stroke();
          if (isFound) {
            // gloss strip clipped to the tile
            ctx.save();
            ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillRect(bx, rowY, bw, bh * 0.32);
            ctx.restore();
          }
          const ch = isFound ? word[li] : s.hints[word] && li === 0 ? s.hints[word] : '';
          if (ch) {
            ctx.font = `900 ${Math.round(bw * 0.62)}px ${FONT}`;
            if (isFound) {
              ctx.fillStyle = 'rgba(255,250,230,0.85)';
              ctx.fillText(ch, bx + bw / 2, rowY + bh / 2 + 2);
            }
            ctx.fillStyle = isFound ? '#4a2c00' : 'rgba(253,224,71,0.55)';
            ctx.fillText(ch, bx + bw / 2, rowY + bh / 2 + 1);
          } else if (!isFound) {
            ctx.fillStyle = 'rgba(150,190,230,0.25)';
            ctx.font = `700 ${Math.round(bw * 0.4)}px ${FONT}`;
            ctx.fillText('·', bx + bw / 2, rowY + bh / 2 + 1);
          }
          ctx.restore();
        }
      });

      // selection path
      if (s.sel.length > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(253,224,71,0.95)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(253,224,71,0.8)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        s.sel.forEach((ni, k) => {
          const n = lay.nodePos[ni];
          if (k === 0) ctx.moveTo(n.x, n.y);
          else ctx.lineTo(n.x, n.y);
        });
        if (s.down) {
          ctx.lineTo(s.pointer.x, s.pointer.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // wheel ring decoration
      ctx.strokeStyle = 'rgba(150,190,230,0.18)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(lay.cx, lay.cy, lay.R + lay.nr + 6, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // letter nodes
      s.letters.forEach((ch, i) => {
        const n = lay.nodePos[i];
        const order = s.sel.indexOf(i);
        drawNode(ctx, n.x, n.y, lay.nr, ch, order >= 0, order);
      });

      // center: found count
      ctx.fillStyle = 'rgba(220,235,250,0.85)';
      ctx.font = `900 20px ${FONT}`;
      ctx.fillText(`${s.found.length}/${s.level.words.length}`, lay.cx, lay.cy - 8);
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = 'rgba(200,220,240,0.6)';
      ctx.fillText('KATA', lay.cx, lay.cy + 14);

      // action buttons
      const hasSel = s.sel.length > 0;
      ctx.globalAlpha = hasSel ? 1 : 0.45;
      drawCircleBtn(ctx, lay.okPos.x, lay.okPos.y, lay.btnR, '#4ade80', '#15803d', '✓', '#052e12');
      ctx.globalAlpha = 1;
      drawCircleBtn(ctx, lay.clrPos.x, lay.clrPos.y, lay.btnR, '#94a3b8', '#475569', 'back', '#0f172a');
    });

    ctlRef.current = {
      load: (pack, level) => load(pack, level),
      shuffle: () => doShuffle(),
      hint: () => doHint(),
    };

    const prog = loadProgress();
    load(prog.pack, prog.level);
    api.loop.start();
    return () => { apiRef.current = null; ctlRef.current = null; };
  });

  const startGame = (): void => {
    apiRef.current?.sfx.ensure();
    setScreen('play');
  };

  const goLevel = (pack: number, level: number): void => {
    ctlRef.current?.load(pack, level);
    setScreen('play');
  };

  const togglePause = (): void => {
    const api = apiRef.current;
    if (!api) return;
    if (screenRef.current === 'play') {
      api.loop.setPaused(true);
      setScreen('pause');
    } else if (screenRef.current === 'pause') {
      api.loop.setPaused(false);
      setScreen('play');
    }
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
    width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(10,18,32,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    backdropFilter: 'blur(6px)', position: 'relative',
  };
  const card: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(6,12,24,0.62)', backdropFilter: 'blur(4px)', zIndex: 10, padding: 20,
  };
  const panel: React.CSSProperties = {
    background: 'linear-gradient(160deg, #10233d, #0a1628)',
    border: '1px solid rgba(253,224,71,0.25)', borderRadius: 20, padding: 24,
    maxWidth: 340, width: '100%', textAlign: 'center', color: '#e8eef7',
    boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
  };
  const bigBtn: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: 10, padding: '13px 16px', borderRadius: 14,
    border: 'none', fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  };

  const packName = PACK_NAMES[hud.pack] ?? '';
  const inGame = screen === 'play' || screen === 'pause';

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#0c1f36', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(10,18,32,0.55)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, padding: '8px 12px', color: '#fff', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: '#fde047' }}>{packName}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Level {hud.level + 1} • {hud.found}/{hud.total} kata</div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {inGame && (
            <>
              <button style={btn} onClick={() => ctlRef.current?.shuffle()} aria-label="Acak huruf">🔀</button>
              <button style={btn} onClick={() => ctlRef.current?.hint()} aria-label={`Hint (${hud.hintsLeft} tersisa)`}>
                💡
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#f59e0b', color: '#3a2a00', fontSize: 11, fontWeight: 900, borderRadius: 10, padding: '1px 6px' }}>{hud.hintsLeft}</span>
              </button>
              <button style={btn} onClick={togglePause} aria-label={screen === 'play' ? 'Jeda' : 'Lanjut'}>{screen === 'play' ? '⏸' : '▶'}</button>
            </>
          )}
          <button style={btn} onClick={toggleMute} aria-label={muted ? 'Nyalakan suara' : 'Bisukan'}>{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>🔤🏗️</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 24, color: '#fde047' }}>SAMBUNG KATA</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, opacity: 0.92, margin: '6px 0 10px' }}>
              <b>Seret jarimu</b> melewati huruf-huruf di roda secara berurutan, lalu <b>lepas</b> untuk
              submit. Atau <b>ketuk</b> huruf satu-satu lalu tekan <b>✓</b>.
            </p>
            <ul style={{ textAlign: 'left', fontSize: 13, lineHeight: 1.9, margin: '0 0 6px', paddingLeft: 20 }}>
              <li>🎯 Temukan semua kata target tiap level</li>
              <li>🔁 Huruf boleh dipakai berulang (BATA butuh dua A!)</li>
              <li>💡 Hint membuka huruf pertama (5 per pack)</li>
              <li>🤔 Kata benar tapi bukan target? "Bukan kata level ini" — seperti usulan harga yang masuk akal tapi bukan HSPK: ditampung, tidak dipakai.</li>
            </ul>
            <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={startGame}>
              Mulai Menyambung
            </button>
          </div>
        </div>
      )}

      {screen === 'pause' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>☕</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22 }}>JEDA</h2>
            <p style={{ fontSize: 13, opacity: 0.85 }}>Istirahat dulu. Huruf-hurufnya tidak akan kabur seperti mandor pas hujan.</p>
            <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={togglePause}>Lanjutkan</button>
            <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
          </div>
        </div>
      )}

      {screen === 'win' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#4ade80' }}>RAB DISETUJUI TANPA REVISI!</h2>
            <p style={{ fontSize: 13.5, opacity: 0.9 }}>Level {hud.level + 1} selesai. Konsultan tidak minta hitung ulang — keajaiban hari ini.</p>
            <button
              style={{ ...bigBtn, background: 'linear-gradient(180deg,#4ade80,#16a34a)', color: '#052e12' }}
              onClick={() => {
                const nxt = nextPosition(hud.pack, hud.level);
                if (nxt) goLevel(nxt.pack, nxt.level);
              }}
            >
              Level Berikutnya →
            </button>
            <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
          </div>
        </div>
      )}

      {screen === 'packdone' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>📦</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047' }}>PACK SELESAI!</h2>
            <p style={{ fontSize: 13.5, opacity: 0.9 }}>
              Pack "{packName}" tuntas 20/20. Naik jabatan: dari kuli kata jadi tukang kata.
              Gaji naik? Tanya mandor.
            </p>
            <button
              style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }}
              onClick={() => goLevel(hud.pack + 1, 0)}
            >
              Masuk Pack Berikutnya →
            </button>
            <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
          </div>
        </div>
      )}

      {screen === 'alldone' && (
        <div style={card}>
          <div style={panel}>
            <div style={{ fontSize: 40 }}>🏆</div>
            <h2 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047' }}>MANDOR BESAR!</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.92 }}>
              Semua 60 level, 3 pack — selesai tanpa satu pun revisi.
              AHSP bilang cukup, dan kali ini harga pasar setuju.
            </p>
            <button style={{ ...bigBtn, background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00' }} onClick={() => goLevel(0, 0)}>
              Main Lagi dari Awal
            </button>
            <button style={{ ...bigBtn, background: 'transparent', color: '#94a3b8' }} onClick={onExit}>Keluar</button>
          </div>
        </div>
      )}
    </div>
  );
}
