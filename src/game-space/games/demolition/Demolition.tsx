/**
 * EZRAB Game Space v2 — Demolition ("Bongkar Bangunan") React host
 * (src/game-space/games/demolition/Demolition.tsx)
 *
 * Stress-relief core: tap the building, watch it crumble with chain
 * reactions. HUD: % flattened, score, combo. Rebuild button, pause, mute,
 * tutorial, win celebration. All rules live in logic.ts.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, X, Trophy, Flame, Volume2, VolumeX, ChevronRight, Building2 } from 'lucide-react';
import { DemolitionEngine } from './DemolitionEngine';
import { sfx } from '../../fx/audio';

interface Props {
  onExit: () => void;
  /** Test-only probe: receives the engine instance for automation. */
  engineProbe?: { current: DemolitionEngine | null };
}

type Phase = 'tutorial' | 'playing' | 'won';

export const Demolition: React.FC<Props> = ({ onExit, engineProbe }) => {
  const [phase, setPhase] = useState<Phase>('tutorial');
  const [paused, setPaused] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [score, setScore] = useState(0);
  const [percent, setPercent] = useState(0);
  const [combo, setCombo] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [muted, setMuted] = useState(sfx.muted);
  const [builds, setBuilds] = useState(1);

  const engineRef = useRef<DemolitionEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const handleWin = useCallback(() => {
    setPhase('won');
  }, []);

  /* ---------- engine lifecycle: one engine per mount ---------- */
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
    let engine: DemolitionEngine | null = null;
    try {
      engine = new DemolitionEngine(canvas, {
        reducedMotion: reducedMotion.current,
        callbacks: {
          onScore: (s, p, c, r) => {
            setScore(s);
            setPercent(p);
            setCombo(c);
            setRemaining(r);
          },
          onWin: handleWin,
          onAutoPause: () => setPaused(true),
        },
      });
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

  pausedRef.current = paused;

  useEffect(() => {
    engineRef.current?.setPaused(paused || phase !== 'playing');
  }, [paused, phase]);

  const start = useCallback(() => {
    sfx.ensure();
    setPaused(false);
    setPhase('playing');
  }, []);

  const rebuild = useCallback(() => {
    sfx.ensure();
    engineRef.current?.rebuild();
    setBuilds((b) => b + 1);
    setPhase('playing');
    setPaused(false);
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
          <span className="gs-level">Pelepas stres</span>
          <span className="gs-hud-title">Bongkar Bangunan</span>
        </div>
        <div className="gs-hud-stats">
          <span className="gs-stat" title="Skor"><Trophy size={14} /> {score}</span>
          {combo >= 2 && (
            <span className="gs-stat gs-stat-hot" title="Kombo"><Flame size={14} /> x{combo}</span>
          )}
        </div>
        <div className="gs-hud-actions">
          <button className="gs-iconbtn" onClick={toggleMute} title={muted ? 'Nyalakan suara' : 'Bisukan'}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button className="gs-iconbtn" onClick={() => setPaused((p) => !p)} title={paused ? 'Lanjut' : 'Jeda'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="gs-iconbtn" onClick={rebuild} title="Bangun lagi">
            <RotateCcw size={16} />
          </button>
          <button className="gs-iconbtn" onClick={onExit} title="Tutup game">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ===== Destruction progress ===== */}
      <div className="gs-demo-progress">
        <div className="gs-demo-progress-bar">
          <div className="gs-demo-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="gs-demo-progress-label">{percent}% rata · {remaining} blok tersisa</span>
      </div>

      {/* ===== 3D canvas ===== */}
      <div className="gs-canvas-wrap gs-vignette">
        <canvas ref={canvasRef} className="gs-canvas" />
        {paused && phase === 'playing' && (
          <div className="gs-pause-overlay">
            <div className="gs-modal">
              <h3>Jeda ⏸️</h3>
              <p>Bangunan menunggu untuk dihancurkan. 😌</p>
              <div className="gs-modal-actions">
                <button className="gs-btn primary" onClick={() => setPaused(false)}><Play size={15} /> Lanjutkan</button>
                <button className="gs-btn" onClick={rebuild}><RotateCcw size={15} /> Bangun lagi</button>
                <button className="gs-btn" onClick={onExit}><X size={15} /> Keluar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Hint bar ===== */}
      <div className="gs-hintbar">
        <Building2 size={14} /> Ketuk blok mana pun untuk menghancurkannya — robohkan penyangganya biar runtuh berantai!
      </div>

      {/* ===== Tutorial ===== */}
      {phase === 'tutorial' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal wide">
            <h3>💥 Bongkar Bangunan</h3>
            <p className="gs-brief">
              Lagi penat? Salurkan ke sini. Ketuk blok gedung untuk menghancurkannya
              jadi puing — robohkan <b>kolom penyangga</b> dan saksikan lantai di atasnya
              runtuh berantai.
            </p>
            <ol className="gs-rules">
              <li>👆 <b>Ketuk blok</b> — hancur jadi puing + debu.</li>
              <li>🔥 <b>Ketuk cepat beruntun</b> — bangun kombo, skor berlipat.</li>
              <li>🏚️ Blok tanpa penyangga <b>runtuh sendiri</b> (efek domino).</li>
              <li>🎯 Ratakan <b>100%</b> gedung untuk selebrasi.</li>
            </ol>
            <p className="gs-rules-note">Tidak ada timer, tidak ada hukuman. Murni pelepas stres.</p>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={start}>Mulai menghancurkan <ChevronRight size={15} /></button>
              <button className="gs-btn" onClick={onExit}>Nanti saja</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Win ===== */}
      {phase === 'won' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal">
            <h3>🏆 Rata dengan tanah!</h3>
            <p>Stres ikut rata dengan gedungnya. Kerja bagus, mandor.</p>
            <div className="gs-score-rows">
              <div><span>Skor</span><b>{score}</b></div>
              <div><span>Gedung diratakan</span><b>{builds}</b></div>
            </div>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={rebuild}><RotateCcw size={15} /> Bangun lagi</button>
              <button className="gs-btn" onClick={onExit}>Kembali ke chat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Demolition;
