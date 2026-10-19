/**
 * Lari Proyek 3D — endless runner ala Subway Surfers (Three.js).
 * Mandor auto-lari di 3 lajur: geser/panah = pindah lajur, atas/spasi = lompat,
 * bawah = guling. Hindari barier, balok gantung, barikade & bata jatuh.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LariProyekEngine, type HudState, type GameOverInfo } from './LariProyekEngine';

type Screen = 'tutorial' | 'play' | 'over';

interface Popup { id: number; text: string; color: string; x: number; y: number; size: 'big' | 'small'; }

let popupId = 0;

export default function LariProyek({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>('tutorial');
  const [hud, setHud] = useState<HudState>({ score: 0, best: 0, helm: 0, meters: 0, kmh: 0 });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quip, setQuip] = useState('');
  const [over, setOver] = useState<GameOverInfo | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [glError, setGlError] = useState<string | null>(null);
  const [coarse] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LariProyekEngine | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: LariProyekEngine | null = null;
    try {
      engine = new LariProyekEngine(canvas, {
        onHud: (h) => { if (mountedRef.current) setHud(h); },
        onGameOver: (r) => {
          if (!mountedRef.current) return;
          setOver(r);
          setQuip(r.reason);
          setNewBest(r.newBest);
          setHud({ score: r.score, best: r.best, helm: r.helm, meters: r.meters, kmh: 0 });
          setScreen('over');
        },
        onPopup: (text, color, x, y, size = 'big') => {
          if (!mountedRef.current) return;
          const id = (popupId += 1);
          setPopups((ps) => [...ps.slice(-6), { id, text, color, x, y, size }]);
          window.setTimeout(() => {
            if (mountedRef.current) setPopups((ps) => ps.filter((p) => p.id !== id));
          }, 950);
        },
        onPauseChange: (p) => { if (mountedRef.current) setPaused(p); },
      });
    } catch (err) {
      setGlError(err instanceof Error ? err.message : 'WebGL tidak tersedia');
      return;
    }
    engineRef.current = engine;
    return () => {
      mountedRef.current = false;
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  const start = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setPopups([]);
    setNewBest(false);
    setOver(null);
    setPaused(false);
    setScreen('play');
    e.start();
  }, []);

  const togglePause = useCallback(() => {
    engineRef.current?.setPaused(!paused);
  }, [paused]);

  const toggleMute = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setMuted(e.toggleMute());
  }, []);

  const press = useCallback((fn: 'pressLeft' | 'pressRight' | 'pressJump' | 'pressRoll') => {
    engineRef.current?.[fn]();
  }, []);

  return (
    <div className="gs2d-wrap" style={{ position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .lr-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(10,18,32,.72); backdrop-filter: blur(3px); z-index:10; padding:16px; }
        .lr-card { background:linear-gradient(160deg,#1e293b,#0f172a); border:1px solid rgba(148,163,184,.25);
          border-radius:20px; padding:22px 20px; max-width:360px; width:100%; text-align:center; color:#f1f5f9;
          box-shadow:0 18px 50px rgba(0,0,0,.5); max-height:92%; overflow-y:auto; }
        .lr-title { font-weight:900; font-size:24px; margin:0 0 6px; }
        .lr-sub { color:#94a3b8; font-size:13px; line-height:1.7; margin:0 0 14px; }
        .lr-btn { display:block; width:100%; border:0; border-radius:14px; padding:13px; margin-top:10px;
          font-weight:800; font-size:16px; cursor:pointer; color:#fff;
          background:linear-gradient(180deg,#f59e0b,#d97706); box-shadow:0 6px 18px rgba(245,158,11,.4); }
        .lr-btn:active { transform:translateY(1px); }
        .lr-btn.ghost { background:rgba(148,163,184,.15); box-shadow:none; border:1px solid rgba(148,163,184,.3); }
        .lr-quip { font-style:italic; color:#cbd5e1; font-size:13px; line-height:1.5; margin:8px 0 4px; }
        .lr-score { font-size:44px; font-weight:900; margin:2px 0; color:#fde047; text-shadow:0 2px 12px rgba(0,0,0,.4); }
        .lr-best { font-size:13px; color:#94a3b8; }
        .lr-best b { color:#fbbf24; }
        .lr-newbest { display:inline-block; margin-top:6px; font-size:12px; font-weight:800; color:#0f172a;
          background:#fde047; border-radius:999px; padding:4px 12px; animation:lrwig .6s ease-in-out infinite alternate; }
        @keyframes lrwig { from { transform:rotate(-3deg) scale(1);} to { transform:rotate(3deg) scale(1.06);} }
        .lr-tutrow { display:flex; gap:8px; justify-content:center; margin:10px 0 2px; }
        .lr-tutkey { background:rgba(245,158,11,.14); border:1px solid rgba(245,158,11,.45); border-radius:12px;
          padding:8px 10px; font-size:12px; font-weight:800; color:#fde68a; line-height:1.5; flex:1; }
        .lr-tutkey span { font-size:20px; display:block; }
        .lr-ctl { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:8px;
          padding:8px 12px calc(10px + env(safe-area-inset-bottom)); }
        .lr-ctl button { border:0; border-radius:14px; padding:14px 4px; font-weight:900; font-size:15px;
          cursor:pointer; color:#fff; touch-action:none; user-select:none; -webkit-user-select:none; }
        .lr-ctl button:active { transform:scale(.94); }
        .lr-popup { position:absolute; transform:translate(-50%,-50%); font-weight:900; font-size:24px;
          pointer-events:none; z-index:5; text-shadow:0 2px 8px rgba(0,0,0,.55);
          animation:lrpop .95s ease-out forwards; white-space:nowrap; }
        .lr-popup.sub { font-size:14px; font-weight:700; animation-duration:1.4s; }
        @keyframes lrpop { 0% { opacity:0; margin-top:10px; transform:translate(-50%,-50%) scale(.6); }
          18% { opacity:1; transform:translate(-50%,-50%) scale(1.15); }
          100% { opacity:0; margin-top:-46px; transform:translate(-50%,-50%) scale(1); } }
        .lr-hint { position:absolute; left:0; right:0; bottom:8px; text-align:center; color:rgba(255,255,255,.75);
          font-size:12px; font-weight:600; pointer-events:none; z-index:4; text-shadow:0 1px 6px rgba(0,0,0,.6); }
        @media (prefers-reduced-motion: reduce) { .lr-newbest, .lr-popup { animation:none; } }
      `}</style>
      <canvas ref={canvasRef} className="gs2d-canvas" />

      {popups.map((p) => (
        <div key={p.id} className={`lr-popup${p.size === 'small' ? ' sub' : ''}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}>
          {p.text}
        </div>
      ))}

      {screen === 'play' && (
        <div className="gs2d-hud" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
          <div style={{ color: '#fff', fontWeight: 800 }}>
            <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 1 }}>SKOR</div>
            <div style={{ fontSize: 22 }}>{hud.score}</div>
          </div>
          <div style={{ color: '#fff', fontWeight: 800, textAlign: 'center' }}>
            <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 1 }}>KECEPATAN</div>
            <div style={{ fontSize: 15 }}>{hud.kmh} km/h</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ color: '#fde047', fontWeight: 800, fontSize: 14, marginRight: 4 }}>🪖 {hud.helm}</div>
            <button className="gs2d-iconbtn" onClick={togglePause} aria-label="Jeda">⏸</button>
            <button className="gs2d-iconbtn" onClick={toggleMute} aria-label="Suara">{muted ? '🔇' : '🔊'}</button>
            <button className="gs2d-iconbtn" onClick={onExit} aria-label="Keluar">✕</button>
          </div>
        </div>
      )}

      {screen === 'play' && !paused && !coarse && (
        <div className="lr-hint">← → / A D pindah lajur · ↑ / Spasi lompat · ↓ guling · P jeda</div>
      )}

      {screen === 'play' && !paused && coarse && (
        <div className="lr-ctl">
          <button aria-label="Kiri" onPointerDown={() => press('pressLeft')}
            style={{ background: 'linear-gradient(180deg,#64748b,#334155)' }}>◀</button>
          <button aria-label="Kanan" onPointerDown={() => press('pressRight')}
            style={{ background: 'linear-gradient(180deg,#64748b,#334155)' }}>▶</button>
          <button aria-label="Lompat" onPointerDown={() => press('pressJump')}
            style={{ background: 'linear-gradient(180deg,#4ade80,#16a34a)' }}>⤴</button>
          <button aria-label="Guling" onPointerDown={() => press('pressRoll')}
            style={{ background: 'linear-gradient(180deg,#38bdf8,#0284c7)' }}>⬇</button>
        </div>
      )}

      {screen === 'tutorial' && !glError && (
        <div className="lr-overlay">
          <div className="lr-card">
            <h2 className="lr-title">🏃 Lari Proyek 3D</h2>
            <p className="lr-sub">
              <b style={{ color: '#fde68a' }}>Geser / ← → untuk pindah lajur — ⤴ lompat, ⬇ guling, kumpulin 🪖 helm proyek!</b>
            </p>
            <div className="lr-tutrow">
              <div className="lr-tutkey"><span>◀ ▶</span>geser / panah<br />pindah lajur</div>
              <div className="lr-tutkey"><span>⤴</span>atas / tap<br />lompat barier</div>
              <div className="lr-tutkey"><span>⬇</span>bawah / swipe<br />guling 0,6 dtk</div>
            </div>
            <p className="lr-sub" style={{ marginTop: 10 }}>
              🧱 <b>Lingkaran merah</b> = bata mau jatuh, minggir atau lompat!
              🪖 Helm = <b>+50</b>. Makin jauh makin ngebut — kayak kejar deadline.
            </p>
            <button className="lr-btn" onClick={start}>Mulai Lari! 🏃</button>
            <button className="lr-btn ghost" onClick={onExit}>← Kembali</button>
          </div>
        </div>
      )}

      {glError && (
        <div className="lr-overlay">
          <div className="lr-card">
            <h2 className="lr-title">⚠️ WebGL bermasalah</h2>
            <p className="lr-sub">{glError}</p>
            <button className="lr-btn ghost" onClick={onExit}>← Kembali</button>
          </div>
        </div>
      )}

      {screen === 'play' && paused && (
        <div className="lr-overlay">
          <div className="lr-card">
            <h2 className="lr-title">⏸ Jeda</h2>
            <p className="lr-sub">Mandor istirahat. Deadline tetap jalan sih.</p>
            <button className="lr-btn" onClick={togglePause}>Lanjutkan ▶</button>
            <button className="lr-btn ghost" onClick={start}>↻ Ulangi</button>
          </div>
        </div>
      )}

      {screen === 'over' && over && (
        <div className="lr-overlay">
          <div className="lr-card">
            <h2 className="lr-title">💥 Aduh!</h2>
            <div className="lr-score">{over.score}</div>
            <div className="lr-best">
              {over.meters} m + 🪖 {over.helm}×50 · Terbaik: <b>{over.best}</b>
            </div>
            {newBest && <div><span className="lr-newbest">🏆 REKOR BARU!</span></div>}
            <p className="lr-quip">"{quip}"</p>
            <button className="lr-btn" onClick={start}>🏃 Lari Lagi</button>
            <button className="lr-btn ghost" onClick={onExit}>← Kembali</button>
          </div>
        </div>
      )}
    </div>
  );
}
