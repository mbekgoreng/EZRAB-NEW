/**
 * Tebak Volume — Mandor butuh beton sekian m³ untuk pengecoran hari ini.
 * Tebak volumenya (1–50 m³) lewat kolom input teks (tanpa mic!).
 * Petunjuk PANAS/DINGIN memandumu makin dekat. 8x kesempatan!
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, sfx, type GameApi } from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import {
  MIN_VOL, MAX_VOL, MAX_ATTEMPTS, newTarget, heatFor, heatLabel,
  directionHint, scoreFor, parseGuess, type Heat,
} from './logic';

const SLUG = 'number-guessing';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;
const LW = 480;
const LH = 360; // kanvas adegan (panel DOM di bawahnya)
const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'over';
interface GuessRec { g: number; heat: Heat }
interface Hud { attempts: number; best: number; won: boolean | null; score: number; lastHeat: Heat | null }

const HEAT_COLOR: Record<Heat, string> = {
  tepat: '#4ade80', panas: '#ef4444', hangat: '#f59e0b', dingin: '#38bdf8', beku: '#a5b4fc',
};

export default function ArcadeNumberGuessing({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const rngRef = useRef<() => number>(() => Math.random());
  const screenRef = useRef<Screen>('ready');
  const targetRef = useRef(25);
  const guessesRef = useRef<GuessRec[]>([]);
  const fxRef = useRef({ t: 0, pourT: 0, confettiT: 0, shakeMsg: 0, revealed: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [screen, setScreen] = useState<Screen>('ready');
  const [hud, setHud] = useState<Hud>({ attempts: 0, best: getBest(bestKey(SLUG, 'best')), won: null, score: 0, lastHeat: null });
  const [history, setHistory] = useState<GuessRec[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [raw, setRaw] = useState('');
  const rawRef = useRef('');
  const setRawBoth = (v: string): void => { rawRef.current = v; setRaw(v); };
  const [muted, setMuted] = useState(false);
  const [isTouch] = useState(() => typeof window !== 'undefined' && 'ontouchstart' in window);

  const pushHud = (): void => {
    const g = guessesRef.current;
    setHud({
      attempts: g.length,
      best: getBest(bestKey(SLUG, 'best')),
      won: hudRef.current.won,
      score: hudRef.current.score,
      lastHeat: g.length > 0 ? g[g.length - 1].heat : null,
    });
  };
  const hudRef = useRef({ won: null as boolean | null, score: 0 });
  hudRef.current = { won: hud.won, score: hud.score };

  const startRound = (): void => {
    targetRef.current = newTarget(rngRef.current);
    guessesRef.current = [];
    setHistory([]);
    setErr(''); setMsg('');
    setRawBoth('');
    hudRef.current = { won: null, score: 0 };
    setHud({ attempts: 0, best: getBest(bestKey(SLUG, 'best')), won: null, score: 0, lastHeat: null });
    screenRef.current = 'play';
    setScreen('play');
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
  };

  const submit = (): void => {
    const api = apiRef.current;
    if (screenRef.current !== 'play') return;
    sfx.ensure();
    const parsed = parseGuess(rawRef.current);
    if (!parsed.ok) {
      setErr(parsed.error);
      fxRef.current.shakeMsg = 0.4;
      sfx.thud(0.5);
      return;
    }
    setErr('');
    const v = parsed.value;
    const heat = heatFor(v, targetRef.current);
    guessesRef.current.push({ g: v, heat });
    setHistory([...guessesRef.current]);
    setRawBoth('');
    fxRef.current.pourT = 1.1; // animasi cor dari molen
    if (heat === 'tepat') {
      const sc = scoreFor(guessesRef.current.length);
      const nb = setBest(bestKey(SLUG, 'best'), sc);
      hudRef.current = { won: true, score: sc };
      fxRef.current.confettiT = 2.2;
      sfx.chime(5, 523);
      if (api && !api.reducedMotion) {
        api.particles.spawn(LW / 2, 120, {
          count: 60, colors: ['#4ade80', '#fde68a', '#f472b6', '#67e8f9', '#fff'],
          speed: [100, 420], life: [0.6, 1.6], size: [2, 6], shape: 'rect', rotation: true,
        });
      }
      setMsg(`🎯 TEPAT! ${v} m³ — coran hari ini aman, Bos!`);
      pushHud();
      window.setTimeout(() => { screenRef.current = 'over'; setScreen('over'); }, 1400);
      void nb;
      return;
    }
    // belum tepat
    if (heat === 'panas') sfx.chime(2, 880);
    else if (heat === 'hangat') sfx.pop(1.1);
    else sfx.thud(0.6);
    const dir = directionHint(v, targetRef.current);
    setMsg(`${heatLabel(heat)} ${dir}`);
    if (guessesRef.current.length >= MAX_ATTEMPTS) {
      hudRef.current = { won: false, score: 0 };
      fxRef.current.revealed = targetRef.current;
      sfx.fail();
      setMsg(`😅 Habis! Mandor butuh ${targetRef.current} m³. Besok coba lagi ya!`);
      pushHud();
      window.setTimeout(() => { screenRef.current = 'over'; setScreen('over'); }, 1600);
      return;
    }
    pushHud();
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    setMuted(sfx.muted);
    rngRef.current = mulberry32((Date.now() % 100000) | 0);
    targetRef.current = newTarget(rngRef.current);

    api.setUpdate((dt) => {
      const fx = fxRef.current;
      fx.t += dt;
      if (fx.pourT > 0) fx.pourT -= dt;
      if (fx.confettiT > 0) fx.confettiT -= dt;
      if (fx.shakeMsg > 0) fx.shakeMsg -= dt;
      // debu site ambient
      if (!api.reducedMotion && Math.random() < dt * 3) {
        api.particles.spawn(Math.random() * LW, LH - 30, {
          count: 1, colors: ['rgba(214,188,150,0.7)'], speed: [10, 40], life: [0.8, 1.6], size: [2, 5],
        });
      }
    });

    api.setRender(() => {
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = fxRef.current.t;
      ctx.save();
      ctx.scale(s, s);
      drawScene(ctx, t, fxRef.current, guessesRef.current, screenRef.current, lh);
      if (screenRef.current === 'ready') {
        ctx.save();
        ctx.fillStyle = 'rgba(2,6,23,0.6)'; ctx.fillRect(0, 0, LW, lh);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.font = `900 28px ${FONT}`;
        ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 16;
        ctx.fillText('🚧 TEBAK VOLUME', LW / 2, lh * 0.34);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#bae6fd'; ctx.font = `700 14px ${FONT}`;
        ctx.fillText('Mandor butuh beton untuk cor hari ini.', LW / 2, lh * 0.34 + 34);
        ctx.fillText(`Tebak volumenya (${MIN_VOL}–${MAX_VOL} m³) lewat kolom input.`, LW / 2, lh * 0.34 + 56);
        ctx.fillText('Ikuti petunjuk PANAS 🔥 / DINGIN 🧊 — makin panas makin dekat!', LW / 2, lh * 0.34 + 78);
        ctx.fillStyle = '#fde68a'; ctx.font = `600 13px ${FONT}`;
        ctx.fillText(`Kamu punya ${MAX_ATTEMPTS} kesempatan.`, LW / 2, lh * 0.34 + 100);
        const pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fde68a'; ctx.font = `900 17px ${FONT}`;
        ctx.fillText(isTouch ? 'KETUK UNTUK MULAI' : 'TEKAN SPASI / KETUK UNTUK MULAI', LW / 2, lh * 0.34 + 140);
        ctx.restore();
      }
      ctx.restore();
    });

    api.input.onDown = () => {
      sfx.ensure();
      if (screenRef.current === 'ready') startRound();
    };

    const kd = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && screenRef.current === 'ready') { e.preventDefault(); sfx.ensure(); startRound(); }
    };
    window.addEventListener('keydown', kd);
    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__guessing = {
        get screen() { return screenRef.current; },
        get target() { return targetRef.current; },
        get attempts() { return guessesRef.current.length; },
        get won() { return hudRef.current.won; },
        start: () => startRound(),
        guess: (v: number) => { setRawBoth(String(v)); window.setTimeout(() => submit(), 0); },
        setRawDirect: (v: string) => setRawBoth(v),
      };
    }
    return () => {
      window.removeEventListener('keydown', kd);
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__guessing;
    };
  });

  const toggleMute = (): void => { sfx.ensure(); setMuted(sfx.toggleMute()); };
  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: FONT,
  };
  const lastHeat = hud.lastHeat;
  const remaining = MAX_ATTEMPTS - hud.attempts;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#101728', fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: '0 0 42%', minHeight: 220 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
          <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 12px', color: '#fde68a', fontWeight: 800, fontSize: 14 }}>🏆 {hud.best}</div>
          <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '6px 10px', color: '#bae6fd', fontWeight: 800, fontSize: 13 }}>
            {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
              <span key={i} style={{ opacity: i < hud.attempts ? 0.25 : 1, marginRight: 2 }}>🪖</span>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 16px', background: 'linear-gradient(180deg,#16202f,#0d1420)', color: '#e2e8f0' }}>
        {screen === 'play' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: '#fff' }}>🚧 Berapa m³ cor hari ini?</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: remaining <= 2 ? '#f87171' : '#94a3b8' }}>Sisa: {remaining} tebak</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.07)', border: '2px solid #f59e0b', borderRadius: 14, padding: '4px 12px' }}>
                <input
                  ref={inputRef}
                  value={raw}
                  onChange={(e) => setRawBoth(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  placeholder={`${MIN_VOL}–${MAX_VOL}`}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Tebakan volume m3"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 20, fontWeight: 800, fontFamily: FONT, minHeight: 48, width: '100%' }}
                />
                <span style={{ color: '#94a3b8', fontWeight: 800 }}>m³</span>
              </div>
              <button onClick={submit} style={{ ...primaryBtn, minHeight: 56, padding: '10px 22px' }}>COR! 🧱</button>
            </div>
            {err && (
              <div style={{
                color: '#fecaca', background: 'rgba(127,29,29,0.45)', border: '1px solid #ef4444',
                borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, marginBottom: 6,
                transform: fxRef.current.shakeMsg > 0 ? `translateX(${Math.sin(fxRef.current.shakeMsg * 60) * 6}px)` : undefined,
              }}>⚠️ {err}</div>
            )}
            {msg && !err && (
              <div style={{
                color: '#fff', background: lastHeat ? `${HEAT_COLOR[lastHeat]}33` : 'rgba(255,255,255,0.06)',
                border: `1px solid ${lastHeat ? HEAT_COLOR[lastHeat] : '#475569'}`,
                borderRadius: 10, padding: '8px 12px', fontSize: 14, fontWeight: 800, marginBottom: 6,
              }}>{msg}</div>
            )}
            {history.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 6, letterSpacing: 1 }}>RIWAYAT TEBAKAN</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {history.map((h, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.06)', border: `2px solid ${HEAT_COLOR[h.heat]}`,
                      borderRadius: 12, padding: '8px 12px', fontSize: 14, fontWeight: 800, color: '#fff',
                    }}>
                      {h.g} m³ <span style={{ fontWeight: 700, fontSize: 12 }}>{heatLabel(h.heat)}</span>
                    </div>
                  ))}
                </div>
                {/* baris petunjuk visual panas/dingin */}
                <div style={{ marginTop: 10, height: 14, borderRadius: 8, background: 'linear-gradient(90deg,#38bdf8,#a5b4fc,#f59e0b,#ef4444)', position: 'relative', overflow: 'hidden' }}>
                  {history.map((h, i) => {
                    return <div key={i} style={{ position: 'absolute', left: `${(i / MAX_ATTEMPTS) * 100}%`, top: 0, bottom: 0, width: `${100 / MAX_ATTEMPTS}%`, background: 'rgba(2,6,23,0.55)', borderRight: '1px solid rgba(255,255,255,0.4)' }} title={`${h.g}`} />;
                  })}
                  {lastHeat && (
                    <div style={{ position: 'absolute', top: -2, bottom: -2, width: 4, borderRadius: 2, background: '#fff', boxShadow: `0 0 8px ${HEAT_COLOR[lastHeat]}`, left: `calc(${heatPos(lastHeat)}% - 2px)` }} />
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  <span>🧊 dingin</span><span>🔥 panas</span>
                </div>
              </div>
            )}
          </>
        )}
        {screen === 'over' && (
          <Overlay>
            <div style={{ fontSize: 48 }}>{hud.won ? '🎉' : '😅'}</div>
            <h2 style={titleStyle}>{hud.won ? 'CORAN AMAN, BOS!' : 'MOLEN PULANG DULU'}</h2>
            <p style={{ ...textStyle, fontSize: 16 }}>
              {hud.won
                ? <>Tebakan tepat dalam <b>{hud.attempts}x</b> percobaan — skor <b>{hud.score}</b>!<br />Terbaik: <b>{hud.best}</b>
                  {hud.score > 0 && hud.score >= hud.best && <span style={{ color: '#4ade80', fontWeight: 900 }}> — REKOR BARU!</span>}</>
                : <>Volume yang benar: <b>{fxRef.current.revealed} m³</b>.<br />Mandor: "Besok bawa kalkulator ya!" 😄</>}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={primaryBtn} onClick={() => { sfx.ensure(); startRound(); }}>Main Lagi 🔁</button>
              <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}

function heatPos(h: Heat): number {
  switch (h) {
    case 'tepat': return 100;
    case 'panas': return 85;
    case 'hangat': return 65;
    case 'dingin': return 32;
    case 'beku': return 12;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adegan: molen + termometer panas/dingin + cor yang dituang. */
function drawScene(
  ctx: CanvasRenderingContext2D, t: number,
  fx: { t: number; pourT: number; confettiT: number; revealed: number },
  guesses: { g: number; heat: Heat }[],
  screen: string, lh: number,
): void {
  const last: Heat | null = guesses.length > 0 ? guesses[guesses.length - 1].heat : null;
  // langit senja site
  const bg = ctx.createLinearGradient(0, 0, 0, lh);
  bg.addColorStop(0, '#312e81'); bg.addColorStop(0.55, '#7c3aed'); bg.addColorStop(0.8, '#f59e0b'); bg.addColorStop(1, '#fbbf24');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, lh);
  // cahaya panas/dingin di belakang molen
  if (last) {
    const hc = last === 'tepat' ? '#4ade80' : last === 'panas' ? '#ef4444' : last === 'hangat' ? '#f59e0b' : last === 'dingin' ? '#38bdf8' : '#818cf8';
    const glow = ctx.createRadialGradient(LW / 2, 200, 20, LW / 2, 200, 220);
    glow.addColorStop(0, hexA(hc, 0.5)); glow.addColorStop(1, hexA(hc, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, LW, lh);
  }
  // tanah
  const gy = lh - 60;
  const gr = ctx.createLinearGradient(0, gy, 0, lh);
  gr.addColorStop(0, '#8a6a48'); gr.addColorStop(1, '#5d442e');
  ctx.fillStyle = gr; ctx.fillRect(0, gy, LW, gy + 60 > lh ? lh - gy : 60);
  ctx.fillRect(0, gy, LW, lh - gy);

  drawMixerTruck(ctx, t, gy, fx.pourT);

  // bekisting + cor yang dituang (di kanan, di bawah ujung chute)
  const bx = 300;
  ctx.fillStyle = '#92400e';
  ctx.fillRect(bx, gy - 44, 90, 44);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(bx, gy - 44, 90, 8);
  if (fx.pourT > 0) {
    // aliran beton dari ujung chute ke bekisting
    const cx0 = 296; const cy0 = gy - 40;
    const cx1 = bx + 45;
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.moveTo(cx0 - 5, cy0); ctx.lineTo(cx0 + 5, cy0);
    ctx.lineTo(cx1 + 9, gy - 44); ctx.lineTo(cx1 - 9, gy - 44);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b7280';
    const ch = 8 + (1 - Math.max(0, fx.pourT)) * 10;
    ctx.fillRect(bx + 6, gy - 44 - ch + 8, 78, ch);
    // cipratan
    for (let i = 0; i < 5; i += 1) {
      const a = Math.random() * TAU;
      ctx.fillStyle = '#d1d5db';
      ctx.beginPath(); ctx.arc(cx1 + Math.cos(a) * 30 * Math.random(), gy - 48 + Math.random() * -18, 2.5, 0, TAU); ctx.fill();
    }
  }

  // termometer panas/dingin
  const tx = 36; const ty = 60; const th = 190; const tw = 26;
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  roundRect(ctx, tx - 8, ty - 26, tw + 16, th + 52, 14); ctx.fill();
  const fillFrac = last ? (last === 'tepat' ? 1 : last === 'panas' ? 0.82 : last === 'hangat' ? 0.6 : last === 'dingin' ? 0.34 : 0.14) : 0.06;
  const tg = ctx.createLinearGradient(0, ty + th, 0, ty);
  tg.addColorStop(0, '#38bdf8'); tg.addColorStop(0.5, '#f59e0b'); tg.addColorStop(1, '#ef4444');
  ctx.fillStyle = '#1e293b';
  roundRect(ctx, tx, ty, tw, th, 12); ctx.fill();
  const fh = th * fillFrac;
  if (fh > 2) {
    ctx.fillStyle = tg;
    roundRect(ctx, tx + 3, ty + th - fh + 0, tw - 6, fh - 0, 8); ctx.fill();
  }
  // bohlam termometer
  ctx.fillStyle = last ? '#ef4444' : '#64748b';
  ctx.beginPath(); ctx.arc(tx + tw / 2, ty + th + 14, 14, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(tx + tw / 2 - 4, ty + th + 10, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('🌡️', tx + tw / 2, ty - 10);
  if (last) {
    ctx.font = `900 13px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(heatLabel(last).split(' ')[0], tx + tw / 2, ty + th + 44);
  }
  void screen;
}

/** Truk molen kartun menghadap kanan: kabin kiri + drum berputar + chute ke bekisting. */
function drawMixerTruck(ctx: CanvasRenderingContext2D, t: number, gy: number, pourT: number): void {
  const bx = 56; const by = gy; // area truk
  ctx.save();
  // bayangan
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(bx + 110, by + 6, 110, 12, 0, 0, TAU); ctx.fill();
  // sasis
  ctx.fillStyle = '#374151';
  roundRect(ctx, bx, by - 46, 210, 16, 6); ctx.fill();
  // kabin (kiri)
  const cg = ctx.createLinearGradient(0, by - 110, 0, by - 40);
  cg.addColorStop(0, '#fdba74'); cg.addColorStop(1, '#ea580c');
  ctx.fillStyle = cg;
  roundRect(ctx, bx, by - 104, 64, 62, 10); ctx.fill();
  ctx.strokeStyle = '#9a3412'; ctx.lineWidth = 3;
  roundRect(ctx, bx, by - 104, 64, 62, 10); ctx.stroke();
  // kaca
  ctx.fillStyle = '#bae6fd';
  roundRect(ctx, bx + 26, by - 96, 30, 28, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(bx + 30, by - 92, 10, 20);
  // lampu depan
  ctx.fillStyle = '#fef08a';
  ctx.beginPath(); ctx.arc(bx + 6, by - 56, 5, 0, TAU); ctx.fill();
  // drum molen (badan berputar)
  const dx = bx + 132; const dy = by - 88;
  ctx.save();
  ctx.translate(dx, dy); ctx.rotate(0.18);
  const dg = ctx.createLinearGradient(0, -34, 0, 34);
  dg.addColorStop(0, '#fde68a'); dg.addColorStop(0.5, '#f59e0b'); dg.addColorStop(1, '#b45309');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.ellipse(0, 0, 66, 34, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#92400e'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, 0, 66, 34, 0, 0, TAU); ctx.stroke();
  // strip spiral berputar
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 62, 30, 0, 0, TAU); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 9;
  const off = (t * 40) % 48;
  for (let sx = -80 + off; sx < 90; sx += 48) {
    ctx.beginPath(); ctx.moveTo(sx, -36); ctx.lineTo(sx + 26, 36); ctx.stroke();
  }
  ctx.restore();
  // mulut drum (kanan)
  ctx.fillStyle = '#78350f';
  ctx.beginPath(); ctx.ellipse(66, 0, 10, 22, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // tulisan di drum
  ctx.fillStyle = '#451a03'; ctx.font = `900 13px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('MOLEN', dx, dy + 5);
  // chute (talang cor) ke kanan-bawah menuju bekisting
  ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx + 196, by - 78); ctx.lineTo(bx + 240, by - 40); ctx.stroke();
  ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(bx + 196, by - 78); ctx.lineTo(bx + 240, by - 40); ctx.stroke();
  // roda
  for (const wx of [bx + 40, bx + 110, bx + 170]) {
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(wx, by - 6, 20, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b7280';
    ctx.beginPath(); ctx.arc(wx, by - 6, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d1d5db';
    ctx.beginPath(); ctx.arc(wx, by - 6, 3.5, 0, TAU); ctx.fill();
  }
  // asap knalpot saat menuang
  if (pourT > 0 && Math.random() < 0.5) {
    ctx.fillStyle = 'rgba(75,85,99,0.5)';
    ctx.beginPath(); ctx.arc(bx + 66, by - 110 - Math.random() * 20, 5 + Math.random() * 4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0', textShadow: '0 2px 12px rgba(245,158,11,0.6)', letterSpacing: 1 };
const textStyle: React.CSSProperties = { color: '#e2e8f0', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 320 };
const primaryBtn: React.CSSProperties = { background: 'linear-gradient(135deg,#fbbf24,#f97316)', color: '#431407', fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14, padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT, boxShadow: '0 6px 20px rgba(251,146,60,0.4)' };
const secondaryBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 800, fontSize: 15, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 14, padding: '12px 20px', cursor: 'pointer', minHeight: 52, fontFamily: FONT };
function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(7,11,26,0.72)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      {children}
    </div>
  );
}
