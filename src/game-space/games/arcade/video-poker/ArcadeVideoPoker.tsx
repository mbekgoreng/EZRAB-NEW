/**
 * VIDEO POKER PROYEK — Jacks or Better reskin konstruksi.
 * Corak = material (Bata/Kayu/Besi/Cat), pangkat = Tukang/Mandor/Arsitek/Direktur.
 * Taruhan koin sak semen (koin mainan, bukan uang), tahan kartu bagus lalu ambil.
 */
import React, { useRef, useState } from 'react';
import { useGameCanvas, type GameApi } from '../../../engine2d';
import { sfx } from '../../../engine2d';
import { bestKey, setJson, getJson } from '../../../engine2d/best';
import {
  createState, placeDeal, placeDraw, refill, mulberry32, winningIndices,
  SUITS, RANK_LABEL, RANK_NAME, MAX_BET,
  type VPState, type HandResult,
} from './logic';

const SLUG = 'video-poker';
const LW = 390;
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;
const TAU = Math.PI * 2;

const ARCADE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('arcade');

type Screen = 'ready' | 'play' | 'pause' | 'over';

interface Hud {
  credits: number;
  bet: number;
  phase: string;
  lastName: string;
  lastWin: number;
}

interface Run {
  st: VPState;
  dealT: number[]; // 0..1 animasi kartu masuk
  winFlash: number;
  winFx: number;
  winCards: boolean[]; // sorotan kartu pembentuk bayaran (winningIndices)
  msg: string;
  msgT: number;
}

/** Koin sak semen prosedural (SVG): cakram emas berdenominasi huruf S. */
function SemenCoin({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ display: 'inline-block', verticalAlign: -3, flexShrink: 0 }}>
      <circle cx="20" cy="20" r="17.5" fill="#fbbf24" stroke="#b45309" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="11.5" fill="#f59e0b" stroke="#92400e" strokeWidth="1.4" />
      <text x="20" y="25.5" textAnchor="middle" fontSize="14" fontWeight="900" fill="#78350f" fontFamily={FONT}>S</text>
    </svg>
  );
}

/** Chip taruhan prosedural (SVG): cakram biru tepi putih putus-putus, denominasi = nilai taruhan. */
function BetChip({ value, size = 30 }: { value: number; size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`Taruhan ${value}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="20" cy="20" r="16.5" fill="#1d4ed8" stroke="#f8fafc" strokeWidth="4" strokeDasharray="6.5 4.2" />
      <circle cx="20" cy="20" r="11.5" fill="#eff6ff" />
      <text x="20" y="26" textAnchor="middle" fontSize="15" fontWeight="900" fill="#1e3a8a" fontFamily={FONT}>{value}</text>
    </svg>
  );
}

/** Pahlawan menu prosedural (SVG): punggung kartu blueprint + crane, kartu depan berglif bata, koin semen. */
function CardsHero(): React.JSX.Element {
  return (
    <svg width="104" height="72" viewBox="0 0 104 72" aria-hidden>
      <g transform="rotate(-8 30 36)">
        <rect x="8" y="8" width="44" height="56" rx="6" fill="#1e3a8a" stroke="#bfdbfe" strokeWidth="2" />
        <path d="M19 9v54M30 9v54M41 9v54M9 19h42M9 30h42M9 41h42M9 52h42" stroke="rgba(147,197,253,0.4)" strokeWidth="1" />
        <path d="M30 14v34M14 17h32M30 14l16 3M30 14L14 17M42 17v8" stroke="#dbeafe" strokeWidth="1.7" fill="none" />
        <rect x="39.5" y="25" width="6" height="4.5" fill="#dbeafe" />
      </g>
      <g transform="rotate(6 72 36)">
        <rect x="50" y="8" width="44" height="56" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
        <rect x="50" y="8" width="44" height="6" fill="#dc2626" />
        <text x="56" y="27" fontSize="13" fontWeight="900" fill="#b91c1c" fontFamily={FONT}>D</text>
        <rect x="62" y="30" width="20" height="12" rx="1.5" fill="#c4502e" stroke="#7e2f16" strokeWidth="1.4" />
        <path d="M62 36h20M72 30v6M67 36v6M77 36v6" stroke="#7e2f16" strokeWidth="1.4" />
        <text x="72" y="54" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#334155" fontFamily={FONT}>BATA</text>
      </g>
      <circle cx="90" cy="60" r="10" fill="#fbbf24" stroke="#b45309" strokeWidth="2" />
      <text x="90" y="64.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#78350f" fontFamily={FONT}>S</text>
    </svg>
  );
}

const PAYTABLE: { key: string; name: string; pay: number }[] = [
  { key: 'royal', name: 'ROYAL PROYEK!', pay: 250 },
  { key: 'straightFlush', name: 'Borongan Lurus', pay: 50 },
  { key: 'four', name: 'Kuartet Mandor', pay: 25 },
  { key: 'fullHouse', name: 'Rumah Penuh', pay: 9 },
  { key: 'flush', name: 'Siram Rata', pay: 6 },
  { key: 'straight', name: 'Antre Lurus', pay: 4 },
  { key: 'three', name: 'Trio Tukang', pay: 3 },
  { key: 'twoPair', name: 'Dua Pasang', pay: 2 },
  { key: 'jacks', name: 'Tukang ke Atas', pay: 1 },
];

const CARD_W = 66;
const CARD_H = 96;
const CARD_Y = 330;
const CARD_X0 = (LW - (CARD_W * 5 + 6 * 4)) / 2;

function cardRect(i: number): { x: number; y: number } {
  return { x: CARD_X0 + i * (CARD_W + 6), y: CARD_Y };
}

export default function ArcadeVideoPoker({ onExit }: { onExit: () => void }): React.JSX.Element {
  const apiRef = useRef<GameApi | null>(null);
  const runRef = useRef<Run | null>(null);
  const screenRef = useRef<Screen>('ready');
  const [screen, setScreenState] = useState<Screen>('ready');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ credits: 100, bet: 1, phase: 'deal', lastName: '', lastWin: 0 });

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };
  const pushHud = (run: Run): void => {
    apiRef.current?.pushHud({
      credits: run.st.credits, bet: run.st.bet, phase: run.st.phase,
      lastName: run.st.lastName, lastWin: run.st.lastWin,
    } as Hud);
  };

  const maxWinKey = bestKey(SLUG, 'maxwin');

  const startGame = (): void => {
    const api = apiRef.current;
    if (!api) return;
    runRef.current = { st: createState(), dealT: [0, 0, 0, 0, 0], winFlash: 0, winFx: 0, winCards: [false, false, false, false, false], msg: '', msgT: 0 };
    setScreen('play');
    api.sfx.ensure();
    api.sfx.click();
    pushHud(runRef.current);
  };

  const doDeal = (): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.st.phase !== 'deal') return;
    api.sfx.ensure();
    if (!placeDeal(run.st, mulberry32((Date.now() % 100000) | 0))) {
      setScreen('over');
      return;
    }
    run.dealT = [0, 0, 0, 0, 0];
    run.winFlash = 0;
    run.winCards = [false, false, false, false, false];
    api.sfx.whoosh();
    for (let i = 0; i < 5; i += 1) {
      const { x, y } = cardRect(i);
      api.particles.spawn(x + CARD_W / 2, y + CARD_H / 2, {
        count: 4, colors: ['#fde68a', '#fff'], speed: [30, 90],
        gravity: 0, life: [0.2, 0.4], size: [2, 3.5], shape: 'circle',
      });
    }
    pushHud(run);
  };

  const doToggleHold = (i: number): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.st.phase !== 'hold') return;
    api.sfx.ensure();
    run.st.held[i] = !run.st.held[i];
    if (run.st.held[i]) api.sfx.pop(1.2);
    else api.sfx.click();
    pushHud(run);
  };

  const doDraw = (): void => {
    const api = apiRef.current;
    const run = runRef.current;
    if (!api || !run || screenRef.current !== 'play' || run.st.phase !== 'hold') return;
    api.sfx.ensure();
    const res: HandResult | null = placeDraw(run.st);
    if (!res) return;
    run.winCards = winningIndices(run.st.hand);
    if (run.st.lastWin > 0) {
      run.winFlash = 2;
      run.winFx = res.key === 'royal' ? 3 : 1;
      const prev = getJson<number>(maxWinKey, 0);
      if (run.st.lastWin > prev) setJson(maxWinKey, run.st.lastWin);
      api.sfx.chime(res.pay >= 25 ? 5 : 3);
      for (let k = 0; k < 3; k += 1) {
        api.particles.spawn(CARD_X0 + (CARD_W + 6) * (1 + k), CARD_Y + 20, {
          count: 22, colors: ['#ffd166', '#fbbf24', '#fff7d6', '#f59e0b'],
          speed: [80, 300], gravity: 420, life: [0.6, 1.4], size: [2.5, 6], shape: 'circle',
        });
      }
      api.scores.add(195, CARD_Y - 24, `+${run.st.lastWin}`, { color: '#ffd166', size: 22 });
      if (res.key === 'royal') {
        api.shake.add(0.5);
        for (let k = 0; k < 4; k += 1) {
          api.particles.spawn(50 + k * 95, 120, {
            count: 24, colors: ['#ffd166', '#4ade80', '#7dd3fc', '#f472b6'],
            speed: [80, 300], gravity: 420, life: [0.8, 1.8], size: [3, 7], shape: 'rect', rotation: true,
          });
        }
      }
    } else {
      api.sfx.thud(0.35);
      run.msg = 'Zonk — Boncos! Coba lagi';
      run.msgT = 1.4;
    }
    if (run.st.credits < run.st.bet) {
      window.setTimeout(() => {
        if (runRef.current && runRef.current.st.credits < runRef.current.st.bet) setScreen('over');
      }, 1400);
    }
    pushHud(run);
  };

  const changeBet = (d: number): void => {
    const run = runRef.current;
    if (!run || screenRef.current !== 'play' || run.st.phase !== 'deal') return;
    sfx.ensure();
    run.st.bet = Math.min(MAX_BET, Math.max(1, run.st.bet + d));
    sfx.click();
    pushHud(run);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as Hud);
    setMuted(api.sfx.muted);

    const toLogical = (px: number, py: number): { x: number; y: number } => {
      const s = api.W / LW;
      return { x: px / s, y: py / s };
    };

    api.input.onDown = (p) => {
      const run = runRef.current;
      if (!run || screenRef.current !== 'play') return;
      const lp = toLogical(p.x, p.y);
      for (let i = 0; i < 5; i += 1) {
        const { x, y } = cardRect(i);
        if (lp.x >= x - 3 && lp.x <= x + CARD_W + 3 && lp.y >= y - 20 && lp.y <= y + CARD_H + 3) {
          doToggleHold(i);
          return;
        }
      }
    };

    api.setUpdate((dt) => {
      const run = runRef.current;
      if (!run) return;
      for (let i = 0; i < 5; i += 1) {
        if (run.dealT[i] < 1) run.dealT[i] = Math.min(1, run.dealT[i] + dt * 4);
      }
      if (run.winFlash > 0) run.winFlash -= dt;
      if (run.winFx > 0) run.winFx -= dt;
      if (run.msgT > 0) run.msgT -= dt;
    });

    api.setRender(() => {
      const run = runRef.current;
      const { ctx } = api;
      const s = api.W / LW;
      const lh = api.H / s;
      const t = performance.now() / 1000;
      ctx.save();
      ctx.scale(s, s);
      drawTable(ctx, t, lh, api.reducedMotion);
      if (run) {
        drawPaytable(ctx, run.st.lastName || '', t);
        const rm = api.reducedMotion;
        for (let i = 0; i < 5; i += 1) {
          const c = run.st.hand[i];
          if (c) drawVpCard(ctx, i, c, run, t, rm);
        }
        if (run.msgT > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, run.msgT);
          ctx.font = `900 16px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(run.msg, 195, CARD_Y + CARD_H + 52);
          ctx.restore();
        }
        if (run.winFlash > 0 && run.st.lastName) {
          const pulse = rm ? 1 : 1 + 0.06 * Math.sin(t * 8);
          ctx.save();
          ctx.translate(195, 0);
          ctx.scale(pulse, pulse);
          ctx.font = `900 24px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffd166';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 18;
          const winText = `${run.st.lastName}  +${run.st.lastWin}`;
          ctx.fillText(winText, 0, 292);
          drawCoin(ctx, ctx.measureText(winText).width / 2 + 16, 285, 9);
          ctx.restore();
        }
      }
      ctx.restore();
    });

    api.loop.start();

    if (ARCADE) {
      (window as unknown as Record<string, unknown>).__videopoker = {
        get screen() { return screenRef.current; },
        get credits() { return runRef.current?.st.credits ?? 0; },
        get phase() { return runRef.current?.st.phase ?? 'deal'; },
        get hand() { return runRef.current ? runRef.current.st.hand.map((c) => ({ ...c })) : []; },
        get held() { return runRef.current ? [...runRef.current.st.held] : []; },
        start() { startGame(); },
        deal() { doDeal(); },
        draw() { doDraw(); },
        hold(i: number) { doToggleHold(i); },
        setBet(b: number) { const r = runRef.current; if (r) { r.st.bet = Math.min(MAX_BET, Math.max(1, Math.floor(b))); pushHud(r); } },
      };
    }
    return () => {
      apiRef.current = null;
      if (ARCADE) delete (window as unknown as Record<string, unknown>).__videopoker;
    };
  });

  const doPause = (): void => {
    if (screenRef.current !== 'play') return;
    apiRef.current?.loop.setPaused(true);
    setScreen('pause');
  };
  const doResume = (): void => {
    sfx.ensure();
    apiRef.current?.loop.setPaused(false);
    setScreen('play');
  };
  const toggleMute = (): void => {
    sfx.ensure();
    setMuted(sfx.toggleMute());
  };
  const doRefill = (): void => {
    const run = runRef.current;
    if (run) {
      refill(run.st);
      setScreen('play');
      sfx.ensure();
      sfx.chime(2);
      pushHud(run);
    }
  };

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };
  const inHold = hud.phase === 'hold';
  const best = getJson<number>(maxWinKey, 0);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a1f16', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
        <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#ffd166', fontWeight: 900, fontSize: 15 }}>
          <SemenCoin size={17} /> {hud.credits}
        </div>
        <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 12, padding: '6px 10px', color: '#7dd3fc', fontWeight: 800, fontSize: 13 }}>
          Taruhan: {hud.bet}
        </div>
        <div style={{ flex: 1 }} />
        {(screen === 'play' || screen === 'pause') && (
          <button style={btn} onClick={screen === 'play' ? doPause : doResume} aria-label="Jeda">{screen === 'play' ? '⏸' : '▶'}</button>
        )}
        <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
        <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
      </div>

      {screen === 'ready' && (
        <Overlay>
          <CardsHero />
          <h2 style={titleStyle}>VIDEO POKER PROYEK</h2>
          <p style={textStyle}>Taruhan koin sak semen (koin mainan, bukan uang beneran!). Ketuk kartu untuk TAHAN yang bagus, lalu tekan AMBIL. Kombinasi mulai dari "Tukang ke Atas" dibayar!</p>
          <button style={primaryBtn} onClick={startGame}>Duduk di Meja</button>
          {best > 0 && (
            <p style={{ ...textStyle, marginTop: 10, fontSize: 13 }}>Kemenangan terbesar: {best} <SemenCoin size={15} /></p>
          )}
        </Overlay>
      )}

      {screen === 'play' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6, padding: '10px 14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <button style={betBtn} onClick={() => changeBet(-1)} disabled={inHold} aria-label="Kurangi taruhan">−</button>
          <div style={{ color: '#ffd166', fontWeight: 900, fontSize: 18, minWidth: 90, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#a7f3d0', fontWeight: 700 }}>TARUHAN</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
              <BetChip value={hud.bet} size={30} />
            </div>
          </div>
          <button style={betBtn} onClick={() => changeBet(1)} disabled={inHold} aria-label="Tambah taruhan">+</button>
          <button
            style={{ ...primaryBtn, minWidth: 150, opacity: inHold ? 1 : 1 }}
            onClick={inHold ? doDraw : doDeal}
          >
            {inHold ? 'AMBIL' : 'BAGIKAN'}
          </button>
        </div>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>⏸</div>
          <h2 style={titleStyle}>JEDA</h2>
          <p style={textStyle}>Bandar ikut istirahat.</p>
          <button style={primaryBtn} onClick={doResume}>Lanjut</button>
        </Overlay>
      )}

      {screen === 'over' && (
        <Overlay>
          <SemenCoin size={52} />
          <h2 style={titleStyle}>KOIN HABIS!</h2>
          <p style={textStyle}>Sak semennya kosong, mandor. Isi ulang koin mainan gratis — tanpa uang beneran.</p>
          <button style={primaryBtn} onClick={doRefill}>Isi Ulang 100 <SemenCoin size={16} /></button>
        </Overlay>
      )}
    </div>
  );
}

function drawTable(ctx: CanvasRenderingContext2D, t: number, lh: number, rm: boolean): void {
  // meja kayu + felt hijau berlapis
  const wood = ctx.createLinearGradient(0, 0, 0, lh);
  wood.addColorStop(0, '#4a2f1d');
  wood.addColorStop(1, '#2c1c10');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, LW, lh);
  const felt = ctx.createRadialGradient(195, lh * 0.55, 40, 195, lh * 0.55, 300);
  felt.addColorStop(0, '#1f7a4d');
  felt.addColorStop(1, '#0f4d2e');
  ctx.fillStyle = felt;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(14, 70, LW - 28, lh - 180, 40);
  else ctx.rect(14, 70, LW - 28, lh - 180);
  ctx.fill();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 6;
  ctx.stroke();
  // garis dekor felt
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(30, 86, LW - 60, lh - 212, 28);
  else ctx.rect(30, 86, LW - 60, lh - 212);
  ctx.stroke();
  // lampu gantung berayun lembut
  if (!rm) {
    const sway = Math.sin(t * 1.2) * 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(195, 0); ctx.lineTo(195 + sway, 44); ctx.stroke();
    const lg = ctx.createRadialGradient(195 + sway, 60, 2, 195 + sway, 60, 40);
    lg.addColorStop(0, 'rgba(255,240,180,0.85)');
    lg.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(195 + sway, 60, 40, 0, TAU); ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(175 + sway, 44); ctx.lineTo(215 + sway, 44); ctx.lineTo(205 + sway, 66); ctx.lineTo(185 + sway, 66);
    ctx.closePath(); ctx.fill();
  }
}

function drawPaytable(ctx: CanvasRenderingContext2D, lastName: string, t: number): void {
  ctx.textAlign = 'left';
  ctx.font = `800 11.5px ${FONT}`;
  const x0 = 30;
  const cols = 2;
  const perCol = Math.ceil(PAYTABLE.length / cols);
  PAYTABLE.forEach((p, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const x = x0 + col * 172;
    const y = 118 + row * 20;
    const hot = lastName === p.name && lastName !== '';
    if (hot) {
      const pulse = 0.5 + 0.3 * Math.sin(t * 8);
      ctx.fillStyle = `rgba(255,209,102,${pulse})`;
      ctx.fillRect(x - 6, y - 13, x + 160 - x + 6, 17);
    }
    ctx.fillStyle = hot ? '#0f172a' : '#fef9c3';
    ctx.fillText(`${p.name}`, x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = hot ? '#0f172a' : '#a7f3d0';
    ctx.fillText(`${p.pay}×`, x + 158, y);
    ctx.textAlign = 'left';
  });
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = '#a7f3d0';
  ctx.fillText('Bayaran × taruhan per putaran', x0, 118 + perCol * 20 + 2);
}

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * Glif material prosedural (vektor canvas, pola SuitMaterial pilot Blackjack
 * & glif Solitaire Gelombang 1) — menggantikan emoji suit di wajah kartu.
 * suit VP: 0 Bata (balok + nat), 1 Kayu (papan + serat), 2 Besi (mur
 * heksagon), 3 Cat (rol cat + gagang). `s` = setengah lebar glif.
 */
function drawSuitGlyph(ctx: CanvasRenderingContext2D, suit: number, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.16);
  if (suit === 0) {
    // Bata: balok + garis nat
    const w = s * 2;
    const h = s * 1.3;
    rrPath(ctx, cx - s, cy - h / 2, w, h, s * 0.18);
    ctx.fillStyle = '#c4502e';
    ctx.fill();
    ctx.strokeStyle = '#7e2f16';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
    ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx, cy);
    ctx.moveTo(cx - s * 0.5, cy); ctx.lineTo(cx - s * 0.5, cy + h / 2);
    ctx.moveTo(cx + s * 0.5, cy); ctx.lineTo(cx + s * 0.5, cy + h / 2);
    ctx.strokeStyle = '#7e2f16';
    ctx.stroke();
  } else if (suit === 1) {
    // Kayu: papan + serat + mata kayu
    const w = s * 2;
    const h = s * 1.5;
    rrPath(ctx, cx - s, cy - h / 2, w, h, s * 0.14);
    ctx.fillStyle = '#b07f42';
    ctx.fill();
    ctx.strokeStyle = '#5d3a1a';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - h * 0.18); ctx.lineTo(cx + s, cy - h * 0.18);
    ctx.moveTo(cx - s, cy + h * 0.22); ctx.lineTo(cx + s, cy + h * 0.22);
    ctx.strokeStyle = 'rgba(93,58,26,0.65)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 0.45, cy + h * 0.02, s * 0.16, 0, TAU);
    ctx.stroke();
  } else if (suit === 2) {
    // Besi: mur baut heksagon + lubang ulir
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = cx + Math.cos(a) * s;
      const py = cy + Math.sin(a) * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.42, 0, TAU);
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.28, cy + s * 0.28);
    ctx.lineTo(cx + s * 0.28, cy - s * 0.28);
    ctx.strokeStyle = '#64748b';
    ctx.stroke();
  } else {
    // Cat: rol cat + gagang
    const w = s * 1.9;
    const h = s * 0.62;
    rrPath(ctx, cx - s * 0.95, cy - s * 0.85, w, h, s * 0.2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.strokeStyle = '#7f1d1d';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.2);
    ctx.lineTo(cx, cy + s * 0.25);
    ctx.lineTo(cx + s * 0.55, cy + s * 0.25);
    ctx.strokeStyle = '#374151';
    ctx.stroke();
    rrPath(ctx, cx + s * 0.42, cy + s * 0.25, s * 0.28, s * 0.75, s * 0.1);
    ctx.fillStyle = '#78350f';
    ctx.fill();
  }
  ctx.restore();
}

/** Koin sak semen prosedural di canvas: cakram emas bergradasi + huruf S. */
function drawCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
  g.addColorStop(0, '#fde68a');
  g.addColorStop(1, '#f59e0b');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.strokeStyle = '#b45309';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, TAU);
  ctx.lineWidth = Math.max(0.8, r * 0.1);
  ctx.strokeStyle = 'rgba(146,64,14,0.7)';
  ctx.stroke();
  ctx.fillStyle = '#78350f';
  ctx.font = `900 ${r * 1.05}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', cx, cy + r * 0.05);
  ctx.restore();
}

function drawVpCard(
  ctx: CanvasRenderingContext2D, i: number, c: { rank: number; suit: number },
  run: Run, t: number, rm: boolean,
): void {
  const { x, y } = cardRect(i);
  const at = run.dealT[i];
  const ease = at < 1 && !rm ? 1 - Math.pow(1 - at, 3) : 1;
  const yy = y - (1 - ease) * 120;
  const held = run.st.held[i];
  const isWin = run.st.phase === 'deal' && run.winCards[i];
  const lift = held ? -14 : isWin ? -8 : 0;
  const suit = SUITS[c.suit];
  const red = c.suit === 0 || c.suit === 3;

  ctx.save();
  ctx.translate(x, yy + lift);
  // bayangan berlapis (+ pendaran emas untuk kartu pembentuk bayaran)
  if (isWin) {
    ctx.save();
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = rm ? 14 : 14 + 8 * (0.5 + 0.5 * Math.sin(t * 8));
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, CARD_W, CARD_H, 10);
    else ctx.rect(0, 0, CARD_W, CARD_H);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(3, 5, CARD_W, CARD_H, 10);
  else ctx.rect(3, 5, CARD_W, CARD_H);
  ctx.fill();
  // badan kartu
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, isWin ? '#fef3c7' : held ? '#dcfce7' : '#e8edf5');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, CARD_W, CARD_H, 10);
  else ctx.rect(0, 0, CARD_W, CARD_H);
  ctx.fill();
  ctx.strokeStyle = isWin ? '#f59e0b' : held ? '#22c55e' : 'rgba(15,23,42,0.25)';
  ctx.lineWidth = isWin ? 3.5 : held ? 3 : 1.5;
  ctx.stroke();
  // pita corak material
  ctx.fillStyle = red ? '#dc2626' : '#1d4ed8';
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, CARD_W, 7);
  ctx.globalAlpha = 1;
  // label pangkat
  ctx.fillStyle = red ? '#b91c1c' : '#1e3a8a';
  ctx.font = `900 17px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(RANK_LABEL[c.rank], 6, 10);
  // glif material prosedural: kecil di sudut + besar di tengah kartu
  drawSuitGlyph(ctx, c.suit, 14, 36, 5.5);
  drawSuitGlyph(ctx, c.suit, CARD_W / 2, CARD_H / 2 + 2, 15);
  // lencana pemenang prosedural: cakram emas + tanda centang vektor
  if (isWin) {
    ctx.beginPath();
    ctx.arc(CARD_W - 3, 3, 9, 0, TAU);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(CARD_W - 7, 3);
    ctx.lineTo(CARD_W - 4.5, 5.5);
    ctx.lineTo(CARD_W + 1, -2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // nama material + pangkat
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#334155';
  ctx.font = `800 8.5px ${FONT}`;
  ctx.fillText(suit.name.toUpperCase(), CARD_W / 2, CARD_H - 22);
  ctx.font = `700 8px ${FONT}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText(RANK_NAME[c.rank], CARD_W / 2, CARD_H - 11);
  // pita TAHAN
  if (held) {
    const bob = rm ? 0 : Math.sin(t * 6) * 1.5;
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(-4, -16 + bob, CARD_W + 8, 22, 8);
    else ctx.rect(-4, -16 + bob, CARD_W + 8, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `900 11px ${FONT}`;
    ctx.fillText('TAHAN', CARD_W / 2, -5 + bob);
  }
  ctx.restore();
}

const betBtn: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 14, border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 24, fontWeight: 900,
  cursor: 'pointer', fontFamily: FONT,
};
const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(15,23,42,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: 14, lineHeight: 1.6, margin: '6px 0 14px', maxWidth: 300,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: '#fff',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(245,158,11,0.4)',
};

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(10,18,32,0.66)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
