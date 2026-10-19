/**
 * ArcadePingPong ("Tenis Sendok Semen") — bet = sendok semen, bola = bola beton.
 * Pemain (kiri) vs AI "Tukang Beton" (kanan). AI adil: kecepatan dibatasi,
 * bidikan meleset acak. Best-of: pertama capai 7 poin menang.
 */
import React, { useRef, useState } from 'react';
import {
  useGameCanvas, type GameApi, TAU, clamp, sfx,
} from '../../../engine2d';
import { bestKey, getBest, setBest } from '../../../engine2d/best';
import { popText } from '../../../engine2d/juice2d';
import {
  VW, VH, PADDLE_W, PADDLE_H, PLAYER_X, AI_X, WIN_SCORE,
  newMatch, placeServe, serve, step, aiMove, type PPState, type AISense,
} from './logic';

const FONT = "'Plus Jakarta Sans','Inter',system-ui,sans-serif";
const BK = bestKey('tenis-sendok-semen', 'wins');
const BK_RALLY = bestKey('tenis-sendok-semen', 'rally');

type Screen = 'tutorial' | 'play' | 'pause' | 'over';

interface S {
  st: PPState;
  sense: AISense;
  errT: number;
  targetPY: number;
  t: number;
  trail: Array<{ x: number; y: number; age: number }>;
}

export default function ArcadePingPong({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GameApi | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [hud, setHud] = useState({ p: 0, a: 0, rally: 0, wins: getBest(BK, 0), bestRally: getBest(BK_RALLY, 0) });
  const [muted, setMuted] = useState(sfx.muted);

  const setScreen = (s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  };

  const canvasRef = useGameCanvas((api) => {
    apiRef.current = api;
    api.pushHud = (h) => setHud(h as typeof hud);
    const s: S = {
      st: newMatch(), sense: { err: 0 }, errT: 0, targetPY: VH / 2, t: 0, trail: [],
    };

    // skala: ruang virtual 800×480 → canvas
    const sc = (): number => Math.min(api.W / VW, api.H / VH);
    const ox = (): number => (api.W - VW * sc()) / 2;
    const oy = (): number => (api.H - VH * sc()) / 2;
    const X = (x: number): number => ox() + x * sc();
    const Y = (y: number): number => oy() + y * sc();
    const S2 = (v: number): number => v * sc();

    const push = (): void => {
      api.pushHud({ p: s.st.p, a: s.st.a, rally: s.st.rally, wins: getBest(BK, 0), bestRally: getBest(BK_RALLY, 0) });
    };

    const reset = (): void => {
      s.st = placeServe(newMatch(), 'p');
      s.sense = { err: 0 };
      s.errT = 0;
      s.targetPY = VH / 2;
      s.trail = [];
      s.t = 0;
      push();
    };

    const endMatch = (): void => {
      s.st = { ...s.st, over: true };
      const win = s.st.winner === 'p';
      const wrap = wrapRef.current;
      if (win) {
        const nb = setBest(BK, getBest(BK, 0) + 1);
        setBest(BK_RALLY, 0); // rally best di-update per rally
        sfx.chime(3);
        if (wrap) popText(wrap, '🏆 KAMU MENANG!', { size: 30, color: '#fde047' });
        api.particles.spawn(api.W / 2, api.H * 0.4, {
          count: 80, colors: ['#fde047', '#fbbf24', '#fff7d6', '#4ade80'],
          speed: [120, 420], life: [0.6, 1.2], size: [2, 6], gravity: 320, shape: 'rect', rotation: true,
        });
        void nb;
      } else {
        sfx.fail();
        if (wrap) popText(wrap, '😤 Tukang Beton menang...', { size: 24, color: '#fca5a5' });
      }
      window.setTimeout(() => {
        push();
        setScreen('over');
      }, 1400);
    };

    api.input.onMove = (p) => {
      if (screenRef.current !== 'play' || s.st.over) return;
      // peta balik dari canvas ke ruang virtual
      s.targetPY = clamp((p.y - oy()) / sc(), PADDLE_H / 2, VH - PADDLE_H / 2);
    };
    api.input.onDown = (p) => {
      sfx.ensure();
      if (screenRef.current !== 'play' || s.st.over) return;
      s.targetPY = clamp((p.y - oy()) / sc(), PADDLE_H / 2, VH - PADDLE_H / 2);
      if (s.st.serving === 'p') {
        s.st = serve(s.st);
        sfx.whoosh();
      }
    };
    api.setUpdate((dt) => {
      if (api.input.wasPressed('Escape')) {
        if (screenRef.current === 'play') { api.loop.setPaused(true); setScreen('pause'); }
        else if (screenRef.current === 'pause') { api.loop.setPaused(false); setScreen('play'); }
      }
      s.t += dt;
      if (screenRef.current !== 'play' || s.st.over) return;

      // AI: acak galat bidikan tiap ~0.45 dtk (adil)
      s.errT -= dt;
      if (s.errT <= 0) {
        s.errT = 0.45;
        s.sense.err = (Math.random() * 2 - 1) * 55;
      }

      // serve otomatis untuk AI
      if (s.st.serving === 'a' && s.t % 1 < dt) {
        // tunda sedikit biar dramatis
      }

      const aiY = aiMove(s.st, dt, s.sense);
      const res = step(s.st, s.targetPY, aiY, dt);
      const prevP = s.st.p;
      const prevA = s.st.a;
      const prevOver = s.st.over;
      s.st = res.state;
      for (const ev of res.events) {
        if (ev === 'pHit' || ev === 'aHit') {
          sfx.thud(0.5);
          setBest(BK_RALLY, s.st.rally);
          api.shake.add(0.25);
          for (let i = 0; i < 6; i += 1) {
            api.particles.spawn(X(s.st.ball.x), Y(s.st.ball.y), {
              count: 5, colors: ['#d6d3d1', '#a8a29e', '#fde047'],
              speed: [40, 160], life: [0.15, 0.4], size: [1.5, 3.5], gravity: 300, shape: 'circle',
            });
          }
        } else if (ev === 'wall') {
          sfx.click();
        } else if (ev === 'pScore' || ev === 'aScore') {
          if (ev === 'pScore') sfx.pop(1.2); else sfx.fail();
          const wrap = wrapRef.current;
          if (wrap) popText(wrap, ev === 'pScore' ? '✅ Poin!' : '❌ Kebobolan', {
            size: 18, color: ev === 'pScore' ? '#4ade80' : '#fca5a5',
          });
        }
      }
      if ((s.st.p !== prevP || s.st.a !== prevA) || s.st.over !== prevOver) push();
      if (s.st.over && !prevOver) { endMatch(); return; }

      // jejak bola
      if (!s.st.serving) {
        s.trail.push({ x: s.st.ball.x, y: s.st.ball.y, age: 0 });
        if (s.trail.length > 14) s.trail.shift();
      } else {
        s.trail = [];
      }
      for (const tr of s.trail) tr.age += dt;
      s.trail = s.trail.filter((tr) => tr.age < 0.22);

      // serve otomatis AI setelah jeda
      if (s.st.serving === 'a') {
        (s as { serveT?: number }).serveT = ((s as { serveT?: number }).serveT ?? 0) + dt;
        if ((s as { serveT?: number }).serveT! > 0.9) {
          (s as { serveT?: number }).serveT = 0;
          s.st = serve(s.st);
          sfx.whoosh();
        }
      } else {
        (s as { serveT?: number }).serveT = 0;
      }
    });

    // ---------- gambar ----------
    const drawBackground = (ctx: CanvasRenderingContext2D, W: number, H: number): void => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#10243a');
      g.addColorStop(1, '#0a1526');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // garis meja beton (meja = area virtual)
      ctx.save();
      // meja
      const mg = ctx.createLinearGradient(0, Y(0), 0, Y(VH));
      mg.addColorStop(0, '#3f6212');
      mg.addColorStop(0.5, '#365314');
      mg.addColorStop(1, '#1a2e05');
      ctx.fillStyle = mg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(X(0), Y(0), S2(VW), S2(VH), 14);
      else ctx.rect(X(0), Y(0), S2(VW), S2(VH));
      ctx.fill();
      // garis tengah (net semen)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(2, S2(4));
      ctx.setLineDash([S2(14), S2(10)]);
      ctx.beginPath();
      ctx.moveTo(X(VW / 2), Y(0));
      ctx.lineTo(X(VW / 2), Y(VH));
      ctx.stroke();
      ctx.setLineDash([]);
      // net: jaring kawat
      ctx.strokeStyle = 'rgba(200,200,200,0.35)';
      ctx.lineWidth = 1;
      for (let yy = Y(0); yy < Y(VH); yy += 8) {
        ctx.beginPath(); ctx.moveTo(X(VW / 2) - 3, yy); ctx.lineTo(X(VW / 2) + 3, yy); ctx.stroke();
      }
      // bingkai meja
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = Math.max(3, S2(6));
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(X(0), Y(0), S2(VW), S2(VH), 14);
      else ctx.rect(X(0), Y(0), S2(VW), S2(VH));
      ctx.stroke();
      ctx.restore();
      // penonton: helm-helm di kejauhan
      ctx.font = `${Math.max(12, S2(22))}px ${FONT}`;
      for (let i = 0; i < 8; i += 1) {
        const hx = X(40 + i * 100);
        const hy = Y(0) - Math.max(18, S2(30)) - (i % 2) * 6;
        ctx.fillText('⛑️', hx, hy);
      }
      // sorot lampu arena
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#fef9c3';
      for (const fx of [0.25, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(W * fx - 30, 0);
        ctx.lineTo(W * fx + 30, 0);
        ctx.lineTo(X(VW * fx) + 60, Y(VH / 2));
        ctx.lineTo(X(VW * fx) - 60, Y(VH / 2));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // spanduk arena
      ctx.fillStyle = 'rgba(253,224,71,0.85)';
      ctx.font = `900 ${Math.max(11, S2(15))}px ${FONT}`;
      ctx.textAlign = 'center';
      const bannerY = Y(0) - Math.max(44, S2(58));
      if (bannerY > 76) ctx.fillText('★ ARENA SENDOK SEMEN ★', W / 2, bannerY);
      // barisan tukang nonton di bawah
      ctx.font = `${Math.max(14, S2(24))}px ${FONT}`;
      ctx.textAlign = 'center';
      const crowdY = Y(VH) + Math.max(52, S2(64));
      if (crowdY < H - 12) {
        const faces = ['👷', '👷‍♀️', '🧑‍🔧', '👨‍🏭', '👷', '🧑‍🔧', '👷‍♀️', '👨‍🏭'];
        faces.forEach((f, i) => {
          const bx = X(60 + i * 100);
          const bob = Math.sin(s.t * 2.4 + i * 1.3) * S2(4);
          ctx.fillText(f, bx, crowdY + bob);
        });
      }
    };

    /** Sendok semen sebagai bet. */
    const drawSpoon = (ctx: CanvasRenderingContext2D, px: number, py: number, facing: 1 | -1, color: string): void => {
      const w = S2(PADDLE_W);
      const h = S2(PADDLE_H);
      ctx.save();
      ctx.translate(X(px), Y(py));
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      // daun sendok (segitiga khas sendok semen)
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, color);
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, '#8a8a8a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2 + 6);
      ctx.lineTo(w / 2, h / 2 - 6);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // gagang
      ctx.fillStyle = '#7c2d12';
      const hg = ctx.createLinearGradient(0, 0, facing * w, 0);
      hg.addColorStop(0, '#9a3412');
      hg.addColorStop(1, '#431407');
      ctx.fillStyle = hg;
      ctx.fillRect(facing === 1 ? -w / 2 - S2(34) : w / 2, -S2(7), S2(34), S2(14));
      // kilau logam
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, -h / 4, w * 0.22, h * 0.1, -0.5, 0, TAU);
      ctx.fill();
      // noda semen
      ctx.fillStyle = 'rgba(160,160,150,0.5)';
      ctx.beginPath(); ctx.arc(w * 0.1, h * 0.25, S2(7), 0, TAU); ctx.fill();
      ctx.restore();
    };

    const drawBall = (ctx: CanvasRenderingContext2D): void => {
      const b = s.st.ball;
      // jejak
      for (const tr of s.trail) {
        const a = 1 - tr.age / 0.22;
        ctx.fillStyle = `rgba(180,170,160,${(a * 0.35).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(X(tr.x), Y(tr.y), S2(8) * a, 0, TAU); ctx.fill();
      }
      const r = S2(9);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      const g = ctx.createRadialGradient(X(b.x) - 3, Y(b.y) - 3, 1, X(b.x), Y(b.y), r);
      g.addColorStop(0, '#e7e5e4');
      g.addColorStop(0.55, '#a8a29e');
      g.addColorStop(1, '#44403c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(60,55,50,0.55)';
      ctx.beginPath(); ctx.arc(X(b.x) - 2, Y(b.y) + 3, S2(2.4), 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(X(b.x) + 4, Y(b.y) - 2, S2(1.8), 0, TAU); ctx.fill();
      ctx.restore();
    };

    api.setRender(() => {
      const { ctx, W, H } = api;
      drawBackground(ctx, W, H);
      drawSpoon(ctx, PLAYER_X + PADDLE_W / 2, s.st.pY, -1, '#cbd5e1');
      drawSpoon(ctx, AI_X + PADDLE_W / 2, s.st.aY, 1, '#fbbf24');
      // label pemain
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `800 ${Math.max(11, S2(16))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('🧑‍🔧 KAMU', X(PLAYER_X + 40), Y(VH) + Math.max(16, S2(26)));
      ctx.textAlign = 'right';
      ctx.fillText('🤖 TUKANG BETON', X(VW - 8), Y(VH) + Math.max(16, S2(26)));
      ctx.textAlign = 'center';
      if (s.st.serving === 'p' && screenRef.current === 'play' && !s.st.over) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `800 ${Math.max(12, S2(18))}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('👆 ketuk untuk serve', X(VW / 2), Y(VH / 2) - S2(40));
      }
      drawBall(ctx);
      // skor besar
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `900 ${Math.max(28, S2(52))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${s.st.p} : ${s.st.a}`, X(VW / 2), Y(0) + Math.max(30, S2(56)));
      // rally
      if (s.st.rally >= 4) {
        ctx.fillStyle = '#fde047';
        ctx.font = `800 ${Math.max(11, S2(17))}px ${FONT}`;
        ctx.fillText(`🔥 Rally x${s.st.rally}`, X(VW / 2), Y(VH) - Math.max(10, S2(18)));
      }
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(4,8,16,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    });

    reset();
    api.loop.start();
    return () => { apiRef.current = null; };
  });

  const startGame = (): void => {
    const api = apiRef.current;
    sfx.ensure();
    (api as unknown as { __reset?: () => void } | null)?.__reset?.();
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

  const btn: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(8,14,26,0.55)', color: '#fff', fontSize: 19,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, overflow: 'hidden', borderRadius: 18, background: '#10243a', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(8,14,26,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '7px 12px', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 150 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: '#fde047' }}>{hud.p} : {hud.a}</div>
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.9 }}>
            🏆 Menang {hud.wins}x {hud.bestRally > 0 && <span>• 🔥x{hud.bestRally}</span>}
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
          <div style={{ fontSize: 42 }}>🥄</div>
          <h2 style={h2}>TENIS SENDOK SEMEN</h2>
          <p style={p}>
            Bet-mu <b>sendok semen</b>, bolanya <b>bola beton</b>! <b>Geser jari / mouse</b>
            untuk menggerakkan sendok, ketuk untuk <b>serve</b>. Lawanmu <b>Tukang Beton</b> —
            cepat tapi bisa dikalahkan. Pertama capai <b>{WIN_SCORE} poin</b> menang!
          </p>
          {hud.wins > 0 && <p style={p}>Kemenangan: <b style={{ color: '#fde047' }}>{hud.wins}x</b></p>}
          <button style={primaryBtn} onClick={startGame}>Mulai Bertanding</button>
        </Overlay>
      )}
      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>☕</div>
          <h2 style={h2}>JEDA</h2>
          <p style={p}>Semennya jangan sampai kering.</p>
          <button style={primaryBtn} onClick={togglePause}>Lanjutkan</button>
        </Overlay>
      )}
      {screen === 'over' && (
        <Overlay>
          <div style={{ fontSize: 42 }}>{hud.p >= WIN_SCORE ? '🏆' : '😤'}</div>
          <h2 style={h2}>{hud.p >= WIN_SCORE ? 'KAMU MENANG!' : 'KALAH TIPIS!'}</h2>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fde047' }}>{hud.p} : {hud.a}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
            <Stat label="Kemenangan" value={`${hud.wins}x`} />
            <Stat label="Rally max" value={`${hud.bestRally}`} />
          </div>
          <button style={primaryBtn} onClick={startGame}>Tanding Lagi</button>
          <button style={ghostBtn} onClick={onExit}>Keluar</button>
        </Overlay>
      )}
    </div>
  );
}

const h2: React.CSSProperties = { margin: '8px 0 4px', fontWeight: 900, fontSize: 22, color: '#fde047', letterSpacing: 1 };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, opacity: 0.95, margin: '8px 0', color: '#e0e7ff' };
const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 14, border: 'none',
  fontFamily: FONT, fontWeight: 900, fontSize: 16, cursor: 'pointer',
  background: 'linear-gradient(180deg,#fde047,#f59e0b)', color: '#3a2a00', boxShadow: '0 8px 20px rgba(245,158,11,0.4)',
};
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: 'transparent', color: '#fde047', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.25)' };

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,10,22,0.62)', backdropFilter: 'blur(5px)', zIndex: 10, padding: 20 }}>
      <div style={{ background: 'linear-gradient(160deg,#1d3350,#0a1526)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 20, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 14px' }}>
      <div style={{ fontSize: 11, opacity: 0.7, color: '#e0e7ff' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{value}</div>
    </div>
  );
}
