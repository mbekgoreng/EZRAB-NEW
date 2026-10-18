/**
 * EZRAB Game Space v2 — Stack ("Stack Menara") React host
 * (src/game-space/games/stack/Stack.tsx)
 *
 * One-tap timing tower stacker. Tap anywhere to drop the sliding block.
 * Slice the overhang, chase perfects, climb from day into a starry night.
 * Game over only on a total miss.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, X, Trophy, Volume2, VolumeX, ChevronRight, Layers, Crown } from 'lucide-react';
import { StackEngine } from './StackEngine';
import { sfx } from '../../fx/audio';

interface Props {
  onExit: () => void;
  /** Test-only probe: receives the engine instance for automation. */
  engineProbe?: { current: StackEngine | null };
}

type Phase = 'tutorial' | 'playing' | 'gameover';

export const Stack: React.FC<Props> = ({ onExit, engineProbe }) => {
  const [phase, setPhase] = useState<Phase>('tutorial');
  const [paused, setPaused] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [best, setBest] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [muted, setMuted] = useState(sfx.muted);

  const engineRef = useRef<StackEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const handleGameOver = useCallback((s: number, b: number) => {
    setFinalScore(s);
    setBest(b);
    setPhase('gameover');
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) throw new Error('no-webgl');
    } catch {
      setWebglError(true);
      return;
    }
    let engine: StackEngine | null = null;
    try {
      engine = new StackEngine(canvas, {
        reducedMotion: reducedMotion.current,
        callbacks: {
          onScore: (s, c) => {
            setScore(s);
            setCombo(c);
          },
          onGameOver: handleGameOver,
          onAutoPause: () => setPaused(true),
        },
      });
      setBest(engine.getBest());
    } catch {
      setWebglError(true);
      return;
    }
    engineRef.current = engine;
    if (engineProbe) engineProbe.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
      if (engineProbe) engineProbe.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    engineRef.current?.setPaused(paused || phase !== 'playing');
  }, [paused, phase]);

  const start = useCallback(() => {
    sfx.ensure();
    setPaused(false);
    setPhase('playing');
  }, []);

  const restart = useCallback(() => {
    sfx.ensure();
    setScore(0);
    setCombo(0);
    setPaused(false);
    // engine was disposed on gameover unmount; remount by cycling phase
    setPhase('playing');
    // reset on the fresh engine right after mount
    window.setTimeout(() => engineRef.current?.reset(), 60);
  }, []);

  const toggleMute = useCallback(() => {
    sfx.ensure();
    setMuted(sfx.toggleMute());
  }, []);

  if (webglError) {
    return (
      <div className="gs-fallback" onKeyDown={(e) => e.stopPropagation()}>
        <div className="gs-fallback-card">
          <div className="gs-fallback-emoji">🖥️</div>
          <h3>Perangkat tidak mendukung 3D</h3>
          <p>Browser/perangkat ini tidak menyediakan WebGL, jadi scene 3D tidak bisa ditampilkan. Chat AI tetap berfungsi normal.</p>
          <button className="gs-btn primary" onClick={onExit}>Kembali ke chat</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gs-game" onKeyDown={(e) => e.stopPropagation()}>
      {/* ===== HUD ===== */}
      <div className="gs-hud">
        <div className="gs-hud-left">
          <span className="gs-level">Satu ketukan · tanpa ampun</span>
          <span className="gs-hud-title">Stack Menara</span>
        </div>
        <div className="gs-hud-stats">
          <span className="gs-stat" title="Skor"><Trophy size={14} /> {score}</span>
          {best > 0 && (
            <span className="gs-stat" title="Terbaik"><Crown size={14} /> {best}</span>
          )}
        </div>
        <div className="gs-hud-actions">
          <button className="gs-iconbtn" onClick={toggleMute} title={muted ? 'Nyalakan suara' : 'Bisukan'}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button className="gs-iconbtn" onClick={() => setPaused((p) => !p)} title={paused ? 'Lanjut' : 'Jeda'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="gs-iconbtn" onClick={restart} title="Ulangi">
            <RotateCcw size={16} />
          </button>
          <button className="gs-iconbtn" onClick={onExit} title="Tutup game">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ===== 3D canvas — tap anywhere to drop ===== */}
      <div className="gs-canvas-wrap gs-vignette">
        <canvas ref={canvasRef} className="gs-canvas" />
        {combo >= 2 && phase === 'playing' && (
          <div className="gs-combo-badge">✨ Perfect x{combo}</div>
        )}
        {paused && phase === 'playing' && (
          <div className="gs-pause-overlay">
            <div className="gs-modal">
              <h3>Jeda ⏸️</h3>
              <p>Menara menunggu ketukanmu.</p>
              <div className="gs-modal-actions">
                <button className="gs-btn primary" onClick={() => setPaused(false)}><Play size={15} /> Lanjutkan</button>
                <button className="gs-btn" onClick={restart}><RotateCcw size={15} /> Ulangi</button>
                <button className="gs-btn" onClick={onExit}><X size={15} /> Keluar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Hint bar ===== */}
      <div className="gs-hintbar">
        <Layers size={14} /> Ketuk layar saat balok tepat di atas menara — meleset total = tamat!
      </div>

      {/* ===== Tutorial ===== */}
      {phase === 'tutorial' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal wide">
            <h3>🗼 Stack Menara</h3>
            <p className="gs-brief">
              Balok meluncur kiri-kanan. <b>Ketuk layar</b> untuk menjatuhkannya tepat
              di atas menara. Kelebihan yang menggantung <b>terpotong dan jatuh</b> —
              menaramu makin ramping. Jatuhkan <b>persis</b> untuk Perfect + kombo.
            </p>
            <ol className="gs-rules">
              <li>👆 <b>Ketuk</b> saat balok sejajar menara.</li>
              <li>✨ <b>Perfect</b> = lebar penuh + bonus kombo + slow-mo.</li>
              <li>🌇 Makin tinggi, langit berubah: siang → senja → <b>malam berbintang</b>.</li>
              <li>💥 Meleset total = menara tamat. Satu nyawa!</li>
            </ol>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={start}>Mulai menumpuk <ChevronRight size={15} /></button>
              <button className="gs-btn" onClick={onExit}>Nanti saja</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Game over ===== */}
      {phase === 'gameover' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal">
            <h3>💥 Meleset!</h3>
            <p>Balok jatuh ke kehampaan. Menaramu runtuh dalam gaya.</p>
            <div className="gs-score-rows">
              <div><span>Skor</span><b>{finalScore}</b></div>
              {best > 0 && <div><span>Terbaik</span><b>{best}</b></div>}
            </div>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={restart}><RotateCcw size={15} /> Main lagi</button>
              <button className="gs-btn" onClick={onExit}>Kembali ke chat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stack;
