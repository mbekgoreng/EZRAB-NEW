/**
 * ArcadeSimonSays ("Ikuti Mandor") — hafalkan urutan aba-aba mandor lewat
 * 4 rambu proyek, lalu ulangi. Salah sekali → shift berakhir.
 * Urutan makin panjang & makin cepat tiap ronde.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { ABA_ABA, extendSequence, checkInput, tempoFor, hudSummary } from './logic';

/** Ikon SVG prosedural (pengganti emoji) untuk tombol & overlay DOM. */
function SvgIcon({ kind, size = 20 }: { kind: 'pause' | 'play' | 'sound' | 'mute' | 'close' | 'helmet' | 'coffee' | 'barrier'; size?: number }): React.JSX.Element {
  const s = size;
  if (kind === 'pause') return (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" /></svg>);
  if (kind === 'play') return (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15c0 1.2 1.3 1.9 2.3 1.3l11-7.5c0.9-0.6 0.9-1.9 0-2.5l-11-7.5C8.3 2.6 7 3.3 7 4.5z" fill="currentColor" /></svg>);
  if (kind === 'sound') return (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" /><path d="M16 9c1.2 1.6 1.2 4.4 0 6M18.5 6.5c2.4 3.2 2.4 7.8 0 11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>);
  if (kind === 'mute') return (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" /><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>);
  if (kind === 'close') return (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>);
  if (kind === 'coffee') return (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden><path d="M4 9h13v6a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5V9z" fill="#d6a05c" stroke="#78350f" strokeWidth="1.4" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M7 3.5c0 1.2 1 1.3 1 2.5M11 3.5c0 1.2 1 1.3 1 2.5" stroke="#78350f" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>);
  if (kind === 'barrier') return (<svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><rect x="4" y="16" width="40" height="10" rx="2" fill="#F97316" stroke="#7c2d12" strokeWidth="1.6" /><path d="M10 16l8 10M22 16l8 10M34 16l8 10" stroke="#fff" strokeWidth="4" /><rect x="10" y="26" width="5" height="14" fill="#78716c" /><rect x="33" y="26" width="5" height="14" fill="#78716c" /></svg>);
  // helmet
  return (<svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><path d="M10 30a14 13 0 0 1 11-12.8V12h6v5.2A14 13 0 0 1 38 30H10z" fill="#F5B301" stroke="#92400e" strokeWidth="2" /><rect x="6" y="29" width="36" height="6" rx="3" fill="#F97316" /><circle cx="17" cy="38" r="2.4" fill="#0A2540" /><circle cx="31" cy="38" r="2.4" fill="#0A2540" /><path d="M18 43c2 1.6 10 1.6 12 0" stroke="#0A2540" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>);
}

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('ikuti-mandor', 'best');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';
type Phase = 'watch' | 'input';

interface S {
  seq: number[];
  phase: Phase;
  playT: number;
  playStep: number; // langkah playback terakhir yang dibunyikan
  litPad: number; // -1 = tidak ada
  litT: number; // timer cahaya input
  inputPos: number;
  cleared: number;
  over: boolean;
  t: number;
  blink: number;
}

export default function ArcadeSimonSays({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ round: 0, best: getBest(BK, 0) });
  const [muted, setMuted] = useState(false);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);

    const s: S = {
      seq: [], phase: 'watch', playT: 0, playStep: -1,
      litPad: -1, litT: 0, inputPos: 0, cleared: 0, over: false, t: 0, blink: 0,
    };
    let rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    const rng = (): number => {
      rngState = (rngState + 0x6d2b79f5) | 0;
      return ((rngState >>> 0) % 100000) / 100000;
    };

    const push = (): void => {
      api.pushHud({ round: s.seq.length, best: getBest(BK, 0) });
    };

    const startRound = (): void => {
      s.seq = extendSequence(s.seq, rng);
      s.phase = 'watch';
      s.playT = 0;
      s.playStep = -1;
      s.litPad = -1;
      s.inputPos = 0;
      push();
    };

    const reset = (): void => {
      s.seq = [];
      s.cleared = 0;
      s.over = false;
      startRound();
    };

    const gameOver = (): void => {
      s.over = true;
      const nb = setBest(BK, s.cleared);
      api.sfx.fail();
      api.shake.add(0.4);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, 'Aba-aba salah!', { size: 28, color: '#f87171' });
      window.setTimeout(() => {
        api.pushHud({ round: s.seq.length, best: nb });
        setScreen('over');
      }, 1100);
    };

    const roundCleared = (): void => {
      s.cleared += 1;
      api.sfx.chime(3);
      const wrap = wrapRef.current;
      if (wrap) popText(wrap, `Ronde ${s.seq.length} lolos!`, { size: 22, color: '#4ade80' });
      api.particles.spawn(api.W / 2, api.H * 0.45, {
        count: 30, colors: ['#4ade80', '#22c55e', '#bbf7d0', '#fde047'],
        speed: [100, 340], life: [0.5, 1], size: [2, 5], gravity: 260, shape: 'spark',
      });
      push();
      window.setTimeout(() => {
        if (!s.over && screenRef.current === 'play') startRound();
      }, 900);
    };

    // geometri 4 rambu (2x2)
    const padRect = (i: number, W: number, H: number): { x: number; y: number; w: number; h: number } => {
      const col = i % 2; const row = Math.floor(i / 2);
      const top = H * 0.30;
      const w = Math.min(168, (W - 48) / 2);
      const h = Math.min(150, (H * 0.56) / 2);
      const gap = 14;
      const x = W / 2 + (col === 0 ? -w / 2 - gap / 2 : gap / 2 + w / 2) - w / 2;
      void row;
      const y = top + Math.floor(i / 2) * (h + gap);
      return { x, y, w, h };
    };

    api.input.onDown = (p) => {
      api.sfx.ensure();
      if (screenRef.current !== 'play' || s.over || s.phase !== 'input') return;
      for (let i = 0; i < 4; i += 1) {
        const r = padRect(i, api.W, api.H);
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          s.litPad = i;
          s.litT = 0.22;
          api.sfx.chime(1, ABA_ABA[i].freq);
          const res = checkInput(s.seq, s.inputPos, i);
          if (res === 'salah') {
            gameOver();
          } else if (res === 'ronde-selesai') {
            s.phase = 'watch'; // kunci input selama jeda
            roundCleared();
          } else {
            s.inputPos += 1;
          }
          break;
        }
      }
    };

    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      if (screenRef.current !== 'play' || s.over) return;
      s.t += dt;
      s.blink += dt;
      if (s.litT > 0) {
        s.litT -= dt;
        if (s.litT <= 0 && s.phase === 'input') s.litPad = -1;
      }
      if (s.phase === 'watch') {
        const round = s.seq.length;
        const tempo = tempoFor(round);
        const sd = api.reducedMotion ? Math.max(0.45, tempo.stepDuration) : tempo.stepDuration;
        const stepLen = sd + tempo.gap;
        s.playT += dt;
        const idx = Math.floor(s.playT / stepLen);
        if (idx >= s.seq.length) {
          s.phase = 'input';
          s.inputPos = 0;
          s.litPad = -1;
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, 'Giliranmu!', { size: 24, color: '#7dd3fc' });
        } else {
          const inStep = s.playT - idx * stepLen < sd;
          s.litPad = inStep ? s.seq[idx] : -1;
          if (inStep && s.playStep !== idx) {
            s.playStep = idx;
            api.sfx.chime(1, ABA_ABA[s.seq[idx]].freq);
          }
        }
      }
    });

    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1c2b1a');
      g.addColorStop(0.5, '#243420');
      g.addColorStop(1, '#121b11');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // pagar proyek di kejauhan
      ctx.fillStyle = 'rgba(180,200,170,0.10)';
      const fy = H * 0.24;
      for (let x = -20; x < W + 20; x += 44) {
        ctx.fillRect(x, fy - 26, 26, 26);
      }
      ctx.fillStyle = 'rgba(180,200,170,0.16)';
      ctx.fillRect(0, fy - 30, W, 5);
      // kerucut lalu lintas kecil
      for (let i = 0; i < 4; i += 1) {
        const cx = 30 + i * ((W - 60) / 3);
        const cy = H - 24;
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx, cy - 22); ctx.lineTo(cx + 10, cy);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 6, cy - 14, 12, 5);
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(cx - 13, cy - 3, 26, 4);
      }
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    };

    const drawMandor = (ctx: CanvasRenderingContext2D, W: number): void => {
      const cx = 64; const cy = 108;
      // bubble ucapan
      const txt = s.over ? 'Shift berakhir!' : s.phase === 'watch' ? 'Perhatikan…' : 'Giliranmu!';
      ctx.font = `800 14px ${FONT}`;
      const tw = ctx.measureText(txt).width + 28;
      const bx = 104; const by = 78;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, tw, 36, 12);
      else ctx.rect(bx, by, tw, 36);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + 6, by + 30); ctx.lineTo(cx + 18, cy - 6); ctx.lineTo(bx + 22, by + 34);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + 14, by + 19);
      // kepala mandor
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, TAU); ctx.fill();
      ctx.restore();
      // helm kuning
      const hg = ctx.createLinearGradient(0, cy - 44, 0, cy - 12);
      hg.addColorStop(0, '#fde047');
      hg.addColorStop(1, '#d97706');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 26, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(cx - 32, cy - 14, 64, 7);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(cx - 5, cy - 40, 10, 24);
      // mata (kedip)
      const eyeH = (s.blink % 3.4) < 0.12 ? 1.5 : 4;
      ctx.fillStyle = '#1f2937';
      ctx.beginPath(); ctx.ellipse(cx - 10, cy + 2, 3.4, eyeH, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 10, cy + 2, 3.4, eyeH, 0, 0, TAU); ctx.fill();
      // kumis
      ctx.strokeStyle = '#3f2d1c';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy + 14); ctx.quadraticCurveTo(cx, cy + 20, cx + 12, cy + 14);
      ctx.stroke();
    };

    const drawRambu = (ctx: CanvasRenderingContext2D, i: number, W: number, H: number): void => {
      const r = padRect(i, W, H);
      const a = ABA_ABA[i];
      const lit = s.litPad === i;
      const cx = r.x + r.w / 2; const cy = r.y + r.h / 2 - 8;
      const R = Math.min(r.w, r.h) * 0.34;
      ctx.save();
      if (lit) {
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 30;
      }
      // panel
      const pg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      pg.addColorStop(0, lit ? '#2b3a4a' : '#1a2432');
      pg.addColorStop(1, lit ? '#16202e' : '#0d1420');
      ctx.fillStyle = pg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(r.x, r.y, r.w, r.h, 18);
      else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.lineWidth = lit ? 3.5 : 2;
      ctx.strokeStyle = lit ? a.color : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(r.x, r.y, r.w, r.h, 18);
      else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.stroke();
      // Glif perkakas/isyarat prosedural per panel (bukan emoji):
      // 0 palu, 1 helm, 2 bendera aba-aba, 3 peluit — menyala mengikuti `lit`.
      const main = lit ? a.color : a.dark;
      const ink = lit ? '#ffffff' : 'rgba(226,232,240,0.85)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (a.glyph === 'palu') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.6);
        // gagang kayu
        ctx.fillStyle = lit ? '#d97706' : '#92400e';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-R * 0.13, -R * 0.15, R * 0.26, R * 1.15, R * 0.1);
        else ctx.rect(-R * 0.13, -R * 0.15, R * 0.26, R * 1.15);
        ctx.fill();
        // kepala palu baja + cakar
        ctx.fillStyle = lit ? '#e5e7eb' : '#6b7280';
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(-R * 0.85, -R * 0.78, R * 1.35, R * 0.55, R * 0.12);
        else ctx.rect(-R * 0.85, -R * 0.78, R * 1.35, R * 0.55);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(R * 0.5, -R * 0.78);
        ctx.quadraticCurveTo(R * 1.0, -R * 0.7, R * 0.95, -R * 0.2);
        ctx.lineTo(R * 0.5, -R * 0.35);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (a.glyph === 'helm') {
        // helm keselamatan: kubah kuning helm EZRAB + brim + rusuk tengah
        ctx.fillStyle = lit ? '#F5B301' : '#a16207';
        ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy + R * 0.25, R * 0.88, Math.PI, TAU);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = lit ? '#F97316' : '#9a3412';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(cx - R * 1.05, cy + R * 0.18, R * 2.1, R * 0.28, R * 0.12);
        else ctx.rect(cx - R * 1.05, cy + R * 0.18, R * 2.1, R * 0.28);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = lit ? '#fde047' : '#ca8a04';
        ctx.fillRect(cx - R * 0.14, cy - R * 0.82, R * 0.28, R * 0.95);
      } else if (a.glyph === 'bendera') {
        // bendera aba-aba: tiang + kain berkibar segitiga-gelombang
        ctx.strokeStyle = lit ? '#e5e7eb' : '#9ca3af';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.55, cy - R * 0.95);
        ctx.lineTo(cx - R * 0.55, cy + R * 0.95);
        ctx.stroke();
        ctx.fillStyle = main;
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.55, cy - R * 0.95);
        ctx.quadraticCurveTo(cx + R * 0.25, cy - R * 1.1, cx + R * 0.95, cy - R * 0.55);
        ctx.quadraticCurveTo(cx + R * 0.25, cy - R * 0.25, cx - R * 0.55, cy - R * 0.1);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = lit ? '#78350f' : '#57534e';
        ctx.beginPath(); ctx.arc(cx - R * 0.55, cy - R * 0.95, 4, 0, TAU); ctx.fill();
      } else {
        // peluit mandor: badan bulat + lubang bunyi + corong tiup
        ctx.fillStyle = main;
        ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx - R * 0.1, cy + R * 0.15, R * 0.68, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(cx - R * 0.15, cy - R * 0.72, R * 1.05, R * 0.42, R * 0.16);
        else ctx.rect(cx - R * 0.15, cy - R * 0.72, R * 1.05, R * 0.42);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = lit ? '#0A2540' : 'rgba(10,37,64,0.75)';
        ctx.beginPath(); ctx.arc(cx - R * 0.1, cy + R * 0.05, R * 0.26, 0, TAU); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx + R * 0.62, cy - R * 0.5, R * 0.14, 0, TAU); ctx.stroke();
      }
      // label aba-aba + nama glif di bawah panel glif
      ctx.fillStyle = lit ? '#ffffff' : 'rgba(226,232,240,0.75)';
      ctx.font = `900 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.label, cx, r.y + r.h - 30);
      ctx.fillStyle = lit ? a.color : 'rgba(148,163,184,0.8)';
      ctx.font = `700 11px ${FONT}`;
      ctx.fillText(a.glyphLabel, cx, r.y + r.h - 13);
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      drawMandor(ctx, W);
      // HUD eksplisit: ronde + panjang urutan + tempo + progres input
      const summary = hudSummary(s.seq.length, s.seq.length, s.phase, s.inputPos);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `900 16px ${FONT}`;
      ctx.fillText(summary.title, W - 16, 96);
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(226,232,240,0.78)';
      ctx.fillText(summary.detail, W - 16, 116);
      ctx.fillText(`lolos: ${s.cleared}`, W - 16, 134);
      for (let i = 0; i < 4; i += 1) drawRambu(ctx, i, W, H);
      // indikator progres urutan saat input
      if (s.phase === 'input' && !s.over) {
        const n = s.seq.length;
        const dw = Math.min(16, (W - 60) / Math.max(1, n));
        const y0 = H - 30;
        for (let k = 0; k < n; k += 1) {
          const x0 = W / 2 - (n * (dw + 4)) / 2 + k * (dw + 4);
          ctx.fillStyle = k < s.inputPos ? '#4ade80' : 'rgba(255,255,255,0.18)';
          ctx.beginPath();
          ctx.arc(x0 + dw / 2, y0, dw / 2.4, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
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
    background: 'rgba(15,25,18,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#1c2b1a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'flex-end', zIndex: 5 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(screen === 'play' || screen === 'pause') && (
            <button style={btn} onClick={togglePause} aria-label="Jeda"><SvgIcon kind={screen === 'play' ? 'pause' : 'play'} size={18} /></button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara"><SvgIcon kind={muted ? 'mute' : 'sound'} size={20} /></button>
          <button style={btn} onClick={onExit} aria-label="Keluar"><SvgIcon kind="close" size={18} /></button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SvgIcon kind="helmet" size={52} /></div>
          <h2 style={h2}>IKUTI MANDOR</h2>
          <p style={p}>
            Mandor memberi aba-aba lewat <b>4 panel berglif</b>: palu (BERHENTI), helm (AWAS),
            bendera (JALAN), peluit (BONGKAR). <b>Perhatikan urutannya</b>, lalu <b>ketuk panel</b>
            dengan urutan yang sama. Tiap ronde urutan bertambah dan <b>temponya makin cepat</b>.
            Salah sekali → shift berakhir!
          </p>
          {hud.best > 0 && <p style={p}>Ronde terbaik: <b style={{ color: '#fde047' }}>{hud.best}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Siap, Mandor!</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SvgIcon kind="coffee" size={44} /></div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Mandor ikut ngopi dulu. Urutannya dijamin tidak lupa.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ display: 'flex', justifyContent: 'center' }}><SvgIcon kind="barrier" size={52} /></div>
          <h2 style={h2}>SHIFT BERAKHIR</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.round > 0 ? hud.round - 1 : 0} ronde</div>
          <p style={p}>Terbaik: <b style={{ color: '#fde047' }}>{hud.best} ronde</b></p>
          <button style={primaryBtn} onClick={startGame}>Coba Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e2e8f0' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#a7b8a4', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,14,8,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#2a3d28,#141f13)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}
