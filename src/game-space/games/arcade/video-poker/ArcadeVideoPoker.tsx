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
  createState, placeDeal, placeDraw, refill, mulberry32,
  SUITS, RANK_LABEL, RANK_NAME,
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
  msg: string;
  msgT: number;
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
    runRef.current = { st: createState(), dealT: [0, 0, 0, 0, 0], winFlash: 0, winFx: 0, msg: '', msgT: 0 };
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
      api.scores.add(195, CARD_Y - 24, `+${run.st.lastWin} 🪙`, { color: '#ffd166', size: 22 });
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
      run.msg = 'Zonk — Boncos! Coba lagi 🎲';
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
    run.st.bet = Math.min(5, Math.max(1, run.st.bet + d));
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
          ctx.fillText(`${run.st.lastName}  +${run.st.lastWin} 🪙`, 0, 292);
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
        setBet(b: number) { const r = runRef.current; if (r) { r.st.bet = b; pushHud(r); } },
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
          🪙 {hud.credits}
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
          <div style={{ fontSize: 44 }}>🃏🏗️</div>
          <h2 style={titleStyle}>VIDEO POKER PROYEK</h2>
          <p style={textStyle}>Taruhan koin sak semen (koin mainan, bukan uang beneran!). Ketuk kartu untuk TAHAN yang bagus, lalu tekan AMBIL. Kombinasi mulai dari "Tukang ke Atas" dibayar!</p>
          <button style={primaryBtn} onClick={startGame}>Duduk di Meja 🎰</button>
          {best > 0 && (
            <p style={{ ...textStyle, marginTop: 10, fontSize: 13 }}>🏅 Kemenangan terbesar: {best} 🪙</p>
          )}
        </Overlay>
      )}

      {screen === 'play' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6, padding: '10px 14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <button style={betBtn} onClick={() => changeBet(-1)} disabled={inHold} aria-label="Kurangi taruhan">−</button>
          <div style={{ color: '#ffd166', fontWeight: 900, fontSize: 18, minWidth: 90, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#a7f3d0', fontWeight: 700 }}>TARUHAN</div>
            {hud.bet} 🪙
          </div>
          <button style={betBtn} onClick={() => changeBet(1)} disabled={inHold} aria-label="Tambah taruhan">+</button>
          <button
            style={{ ...primaryBtn, minWidth: 150, opacity: inHold ? 1 : 1 }}
            onClick={inHold ? doDraw : doDeal}
          >
            {inHold ? '🎯 AMBIL' : '🃏 BAGIKAN'}
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
          <div style={{ fontSize: 44 }}>🪙</div>
          <h2 style={titleStyle}>KOIN HABIS!</h2>
          <p style={textStyle}>Sak semennya kosong, mandor. Isi ulang koin mainan gratis — tanpa uang beneran.</p>
          <button style={primaryBtn} onClick={doRefill}>Isi Ulang 100 🪙</button>
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

function drawVpCard(
  ctx: CanvasRenderingContext2D, i: number, c: { rank: number; suit: number },
  run: Run, t: number, rm: boolean,
): void {
  const { x, y } = cardRect(i);
  const at = run.dealT[i];
  const ease = at < 1 && !rm ? 1 - Math.pow(1 - at, 3) : 1;
  const yy = y - (1 - ease) * 120;
  const held = run.st.held[i];
  const lift = held ? -14 : 0;
  const suit = SUITS[c.suit];
  const red = c.suit === 0 || c.suit === 3;

  ctx.save();
  ctx.translate(x, yy + lift);
  // bayangan berlapis
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(3, 5, CARD_W, CARD_H, 10);
  else ctx.rect(3, 5, CARD_W, CARD_H);
  ctx.fill();
  // badan kartu
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, held ? '#dcfce7' : '#e8edf5');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, CARD_W, CARD_H, 10);
  else ctx.rect(0, 0, CARD_W, CARD_H);
  ctx.fill();
  ctx.strokeStyle = held ? '#22c55e' : 'rgba(15,23,42,0.25)';
  ctx.lineWidth = held ? 3 : 1.5;
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
  // emoji material besar
  ctx.font = '34px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suit.symbol, CARD_W / 2, CARD_H / 2 + 2);
  // nama material + pangkat
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
