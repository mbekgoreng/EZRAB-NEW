/**
 * Bongkar Rumah 3D — hancurkan fasad, interior, lalu struktur sampai runtuh.
 * Render Three.js via engine3d.ts; file ini hanya UI (HUD/overlay) + wiring.
 * Export default kompatibel dengan GameSpaceOverlay (lazy import).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bongkar3DEngine, type Hud3D, type EngineEvent } from './engine3d';
import { bestKey, getBest, setBest } from '../../engine2d/best';
import { popText } from '../../engine2d/juice2d';
import { sfx } from '../../engine2d/audio';
import { LEVELS } from './logic';

const SLUG = 'bongkar-rumah';
const FONT = `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`;

type Screen = 'tutorial' | 'play' | 'pause' | 'win';

interface ScorePop { id: number; x: number; y: number; text: string; big: boolean; }

let popId = 1;

export default function BongkarRumah({ onExit }: { onExit: () => void }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Bongkar3DEngine | null>(null);
  const screenRef = useRef<Screen>('tutorial');
  const [screen, setScreenState] = useState<Screen>('tutorial');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud3D>({
    score: 0, pct: 0, mult: 0, levelName: LEVELS[0].name,
    layers: {
      facade: { total: 0, left: 0 },
      interior: { total: 0, left: 0 },
      structure: { total: 0, left: 0 },
    },
    grace: true,
  });
  const [pops, setPops] = useState<ScorePop[]>([]);
  const [best, setBestState] = useState(0);
  const winTimer = useRef<number | null>(null);

  const setScreen = useCallback((s: Screen): void => {
    screenRef.current = s;
    setScreenState(s);
  }, []);

  const addPop = useCallback((x: number, y: number, text: string, big: boolean): void => {
    const id = popId++;
    setPops((p) => [...p.slice(-11), { id, x, y, text, big }]);
    window.setTimeout(() => {
      setPops((p) => p.filter((q) => q.id !== id));
    }, 950);
  }, []);

  const handleEvent = useCallback((e: EngineEvent): void => {
    const wrap = wrapRef.current;
    if (e.type === 'win') {
      const lv = engineRef.current?.levelIndex ?? 0;
      const prevBest = getBest(bestKey(SLUG, `score${lv}`), 0);
      if (e.score > prevBest) setBest(bestKey(SLUG, `score${lv}`), e.score);
      setBestState(getBest(bestKey(SLUG, `score${lv}`), e.score));
      if (wrap) popText(wrap, 'RATA DENGAN TANAH!', { size: 34, color: '#ffd166' });
      winTimer.current = window.setTimeout(() => setScreen('win'), 1100);
    } else if (e.type === 'combo') {
      if (wrap) popText(wrap, `KOMBO x${e.mult}!`, { size: 26, color: '#ffd166' });
    } else if (e.type === 'quip') {
      if (wrap) popText(wrap, e.text, { size: 20, color: '#fef08a' });
    } else if (e.type === 'scorePop') {
      addPop(e.x, e.y, e.text, e.big);
    }
  }, [addPop, setScreen]);

  const startLevel = useCallback((idx: number): void => {
    const eng = engineRef.current;
    if (!eng) return;
    sfx.ensure();
    if (winTimer.current) window.clearTimeout(winTimer.current);
    setPops([]);
    eng.loadLevel(idx, 1);
    eng.setPaused(false);
    setBestState(getBest(bestKey(SLUG, `score${idx}`), 0));
    setScreen('play');
    if (wrapRef.current) popText(wrapRef.current, `${LEVELS[idx].name}`, { size: 24 });
  }, [setScreen]);

  // engine lifecycle: dibuat sekali, dispose saat unmount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) throw new Error('no-webgl');
    } catch {
      setScreen('tutorial');
      return;
    }
    let engine: Bongkar3DEngine | null = null;
    try {
      engine = new Bongkar3DEngine(canvas, {
        onHud: (h) => setHud(h),
        onEvent: handleEvent,
        onAutoPause: () => {
          if (screenRef.current === 'play') {
            engineRef.current?.setPaused(true);
            setScreen('pause');
          }
        },
      });
    } catch {
      return;
    }
    engineRef.current = engine;
    setMuted(sfx.muted);
    // hook untuk harness Playwright
    (window as unknown as { __br3?: unknown }).__br3 = {
      tap: (id: number) => engine.debugTap(id),
      blocks: () => engine.debugBlocks(),
      screenPos: (id: number) => engine.debugBlockScreen(id),
      reload: (facadeHp: number) => engine.debugReload(facadeHp),
      level: () => engine.levelIndex,
    };
    return () => {
      if (winTimer.current) window.clearTimeout(winTimer.current);
      engine.dispose();
      engineRef.current = null;
      (window as unknown as { __br3?: unknown }).__br3 = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doPause = (): void => {
    engineRef.current?.setPaused(true);
    sfx.click();
    setScreen('pause');
  };
  const doResume = (): void => {
    sfx.ensure();
    engineRef.current?.setPaused(false);
    setScreen('play');
  };
  const toggleMute = (): void => {
    sfx.ensure();
    setMuted(sfx.toggleMute());
  };

  const lv = engineRef.current?.levelIndex ?? 0;
  const L = hud.layers;

  const btn: React.CSSProperties = {
    minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none',
    background: 'rgba(15,23,42,0.55)', color: '#fff', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: FONT, fontWeight: 700, padding: '0 10px',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0b1526', fontFamily: FONT }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* popup skor mengambang */}
      {pops.map((p) => (
        <div key={p.id} className="br3-pop" style={{
          left: p.x, top: p.y,
          fontSize: p.big ? 26 : 19, color: p.big ? '#ffd166' : '#fff',
        }}>
          {p.text}
        </div>
      ))}
      <style>{`
        .br3-pop { position:absolute; transform:translate(-50%,-50%); z-index:6; pointer-events:none;
          font-weight:900; text-shadow:0 2px 8px rgba(0,0,0,.6); animation:br3pop .95s ease-out forwards; }
        @keyframes br3pop { 0% { opacity:0; transform:translate(-50%,-30%) scale(.6); }
          18% { opacity:1; transform:translate(-50%,-60%) scale(1.15); }
          100% { opacity:0; transform:translate(-50%,-190%) scale(1); } }
        .br3-tap-hint { animation: br3tap 1.1s ease-in-out infinite; }
        @keyframes br3tap { 0%,100% { transform:translateY(0) scale(1); opacity:.95; }
          50% { transform:translateY(14px) scale(.92); opacity:.7; } }
      `}</style>

      {/* HUD atas */}
      {(screen === 'play' || screen === 'pause') && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
          <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 12px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
            ⭐ {hud.score}
          </div>
          <div style={{ flex: 1, background: 'rgba(15,23,42,0.35)', borderRadius: 10, height: 14, overflow: 'hidden' }}>
            <div style={{ width: `${hud.pct}%`, height: '100%', background: 'linear-gradient(90deg,#f5b301,#ff7847)', borderRadius: 10, transition: 'width .25s' }} />
          </div>
          <div style={{ background: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: '6px 10px', color: '#ffd166', fontWeight: 800, fontSize: 13, minWidth: 52, textAlign: 'center' }}>
            {hud.pct}%
          </div>
          <button style={btn} onClick={doPause} aria-label="Jeda">⏸</button>
          <button style={btn} onClick={toggleMute} aria-label="Bisukan">{muted ? '🔇' : '🔊'}</button>
          <button style={btn} onClick={onExit} aria-label="Tutup">✕</button>
        </div>
      )}

      {/* label level + lapis + kombo */}
      {(screen === 'play') && (
        <div style={{ position: 'absolute', top: 62, left: 12, zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.45)', color: '#fff', borderRadius: 10, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
            🏚 {hud.levelName}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Chip label="🧱 Fasad" left={L.facade.left} total={L.facade.total} />
            <Chip label="🛋 Interior" left={L.interior.left} total={L.interior.total} />
            <Chip label="🏛 Struktur" left={L.structure.left} total={L.structure.total} />
          </div>
          {hud.mult >= 2 && (
            <div style={{ marginTop: 6, background: '#ffd166', color: '#7a2f12', borderRadius: 10, padding: '4px 10px', fontSize: 13, fontWeight: 900, display: 'inline-block' }}>
              🔥 KOMBO x{hud.mult}
            </div>
          )}
        </div>
      )}

      {screen === 'tutorial' && (
        <Overlay>
          <div className="br3-tap-hint" style={{ fontSize: 52 }}>👆</div>
          <h2 style={titleStyle}>BONGKAR RUMAH 3D</h2>
          <p style={textStyle}>
            <b>Ketuk bangunan sampai rata dengan tanah</b> — kupas fasadnya, lalu hancurkan kolom betonnya biar runtuh berantai!
          </p>
          <button style={primaryBtn} onClick={() => startLevel(0)}>Mulai Menghancurkan</button>
        </Overlay>
      )}

      {screen === 'pause' && (
        <Overlay>
          <div style={{ fontSize: 40 }}>☕</div>
          <h2 style={titleStyle}>ISTIRAHAT DULU</h2>
          <p style={textStyle}>Mandor lagi ngopi. Godam aman di tanganmu.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={doResume}>Lanjutkan</button>
            <button style={secondaryBtn} onClick={() => startLevel(lv)}>Ulangi Level</button>
          </div>
        </Overlay>
      )}

      {screen === 'win' && (
        <Overlay>
          <div style={{ fontSize: 44 }}>🏆</div>
          <h2 style={titleStyle}>RATA DENGAN TANAH!</h2>
          <p style={textStyle}>
            {LEVELS[lv]?.tagline ?? ''} Bangunan <b>{LEVELS[lv]?.name}</b> tinggal kenangan.
          </p>
          <p style={{ ...textStyle, fontSize: 15 }}>
            ⭐ Skor: <b>{hud.score}</b> &nbsp;•&nbsp; 🏅 Terbaik: <b>{best}</b>
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {lv < LEVELS.length - 1 && (
              <button style={primaryBtn} onClick={() => startLevel(lv + 1)}>Level Berikutnya ▶</button>
            )}
            <button style={secondaryBtn} onClick={() => startLevel(lv)}>Ulangi</button>
            <button style={secondaryBtn} onClick={onExit}>Tutup ✕</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Chip({ label, left, total }: { label: string; left: number; total: number }): React.JSX.Element {
  const done = total - left;
  return (
    <div style={{
      background: left === 0 ? 'rgba(74,222,128,0.85)' : 'rgba(15,23,42,0.45)',
      color: '#fff', borderRadius: 10, padding: '3px 8px', fontSize: 11, fontWeight: 700,
    }}>
      {label} {done}/{total}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  color: '#fff', fontSize: 26, fontWeight: 900, margin: '8px 0',
  textShadow: '0 2px 12px rgba(15,23,42,0.5)', letterSpacing: 1,
};
const textStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: 14, lineHeight: 1.55, margin: '6px 0 12px', maxWidth: 300,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#f5b301,#ff7847)', color: '#3b1d05',
  fontWeight: 900, fontSize: 16, border: 'none', borderRadius: 14,
  padding: '14px 26px', cursor: 'pointer', minHeight: 52, fontFamily: FONT,
  boxShadow: '0 6px 20px rgba(245,179,1,0.4)',
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
      background: 'rgba(10,18,32,0.62)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
