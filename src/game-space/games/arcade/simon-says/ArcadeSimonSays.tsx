/**
 * ArcadeSimonSays ("Ikuti Mandor") — hafalkan urutan aba-aba mandor lewat
 * 4 rambu proyek, lalu ulangi. Salah sekali → shift berakhir.
 * Urutan makin panjang & makin cepat tiap ronde.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi, TAU, clamp } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import { ABA_ABA, extendSequence, stepDuration, checkInput, STEP_GAP } from './logic';

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
        const sd = api.reducedMotion ? Math.max(0.45, stepDuration(round)) : stepDuration(round);
        const stepLen = sd + STEP_GAP;
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
      // bentuk rambu
      const fill = lit ? a.color : a.dark;
      ctx.fillStyle = fill;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      if (i === 0) {
        // oktagon BERHENTI
        ctx.beginPath();
        for (let k = 0; k < 8; k += 1) {
          const ang = (k / 8) * TAU + Math.PI / 8;
          const px = cx + Math.cos(ang) * R;
          const py = cy + Math.sin(ang) * R;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (i === 1) {
        // segitiga AWAS
        ctx.beginPath();
        ctx.moveTo(cx, cy - R);
        ctx.lineTo(cx + R * 0.95, cy + R * 0.75);
        ctx.lineTo(cx - R * 0.95, cy + R * 0.75);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = lit ? '#451a03' : '#fef3c7';
        ctx.font = `900 ${Math.round(R * 0.7)}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy + R * 0.22);
      } else if (i === 2) {
        // lingkaran JALAN
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.92, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = lit ? '#052e12' : '#d1fae5';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.45, cy);
        ctx.lineTo(cx + R * 0.45, cy);
        ctx.moveTo(cx + R * 0.15, cy - R * 0.3);
        ctx.lineTo(cx + R * 0.45, cy);
        ctx.lineTo(cx + R * 0.15, cy + R * 0.3);
        ctx.stroke();
      } else {
        // kotak retak BONGKAR
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(cx - R * 0.85, cy - R * 0.85, R * 1.7, R * 1.7, 8);
        else ctx.rect(cx - R * 0.85, cy - R * 0.85, R * 1.7, R * 1.7);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = lit ? '#1e3a8a' : '#bfdbfe';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.4, cy - R * 0.7);
        ctx.lineTo(cx - R * 0.1, cy - R * 0.2);
        ctx.lineTo(cx - R * 0.35, cy + R * 0.1);
        ctx.lineTo(cx + R * 0.1, cy + R * 0.6);
        ctx.stroke();
      }
      // label
      ctx.fillStyle = lit ? '#ffffff' : 'rgba(226,232,240,0.75)';
      ctx.font = `900 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.label, cx, r.y + r.h - 20);
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.translate(api.shake.x, api.shake.y);
      drawBackground(ctx, W, H);
      drawMandor(ctx, W);
      // info ronde
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `900 16px ${FONT}`;
      ctx.fillText(`Ronde ${s.seq.length}`, W - 16, 100);
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(226,232,240,0.7)';
      ctx.fillText(`lolos: ${s.cleared}`, W - 16, 120);
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
            <button style={btn} onClick={togglePause} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
          )}
          <button style={btn} onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Keluar">✕</button>
        </div>
      </div>

      {screen === 'tutorial' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>👷</div>
          <h2 style={h2}>IKUTI MANDOR</h2>
          <p style={p}>
            Mandor memberi aba-aba lewat <b>4 rambu</b>: BERHENTI, AWAS, JALAN, BONGKAR.
            <b> Perhatikan urutannya</b>, lalu <b>ketuk rambu</b> dengan urutan yang sama.
            Salah sekali → shift berakhir!
          </p>
          {hud.best > 0 && <p style={p}>Ronde terbaik: <b style={{ color: '#fde047' }}>{hud.best}</b></p>}
          <button style={primaryBtn} onClick={startGame}>Siap, Mandor!</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Mandor ikut ngopi dulu. Urutannya dijamin tidak lupa.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>🚧</div>
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
