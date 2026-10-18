/**
 * EZRAB Game Space v2 — Zen Build ("Mode Bebas") React host
 * (src/game-space/games/zen-build/ZenBuild.tsx)
 *
 * Pure calm: no timer, no score, no fail state. Unlimited pieces, undo,
 * clear-all. Sunset ambience with fireflies.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Undo2, Trash2, X, Volume2, VolumeX, ChevronRight, Pause, Play, Sparkles } from 'lucide-react';
import { ZenEngine } from './ZenEngine';
import { ZEN_PIECES, ZEN_META, type ZenPiece } from './logic';
import { sfx } from '../../fx/audio';

interface Props {
  onExit: () => void;
  /** Test-only probe: receives the engine instance for automation. */
  engineProbe?: { current: ZenEngine | null };
}

type Phase = 'tutorial' | 'playing';

export const ZenBuild: React.FC<Props> = ({ onExit, engineProbe }) => {
  const [phase, setPhase] = useState<Phase>('tutorial');
  const [paused, setPaused] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [selected, setSelected] = useState<ZenPiece>('beton');
  const [count, setCount] = useState(0);
  const [muted, setMuted] = useState(sfx.muted);

  const engineRef = useRef<ZenEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

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
    let engine: ZenEngine | null = null;
    try {
      engine = new ZenEngine(canvas, {
        reducedMotion: reducedMotion.current,
        callbacks: {
          onCount: (c) => setCount(c),
          onAutoPause: () => setPaused(true),
        },
      });
    } catch {
      setWebglError(true);
      return;
    }
    engine.setSelected(selected);
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

  const pick = useCallback((p: ZenPiece) => {
    sfx.ensure();
    sfx.click();
    setSelected(p);
    engineRef.current?.setSelected(p);
  }, []);

  const undo = useCallback(() => {
    engineRef.current?.undo();
  }, []);

  const clearAll = useCallback(() => {
    engineRef.current?.clearAll();
  }, []);

  const toggleMute = useCallback(() => {
    sfx.ensure();
    setMuted(sfx.toggleMute());
  }, []);

  const start = useCallback(() => {
    sfx.ensure();
    setPhase('playing');
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
          <span className="gs-level">Mode bebas · tanpa timer</span>
          <span className="gs-hud-title">Zen Build 🌅</span>
        </div>
        <div className="gs-hud-stats">
          <span className="gs-stat" title="Potongan terpasang"><Sparkles size={14} /> {count}</span>
        </div>
        <div className="gs-hud-actions">
          <button className="gs-iconbtn" onClick={toggleMute} title={muted ? 'Nyalakan suara' : 'Bisukan'}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button className="gs-iconbtn" onClick={() => setPaused((p) => !p)} title={paused ? 'Lanjut' : 'Jeda'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="gs-iconbtn" onClick={undo} title="Urungkan">
            <Undo2 size={16} />
          </button>
          <button className="gs-iconbtn" onClick={clearAll} title="Bersihkan semua">
            <Trash2 size={16} />
          </button>
          <button className="gs-iconbtn" onClick={onExit} title="Tutup game">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ===== 3D canvas ===== */}
      <div className="gs-canvas-wrap gs-vignette">
        <canvas ref={canvasRef} className="gs-canvas" />
        {paused && phase === 'playing' && (
          <div className="gs-pause-overlay">
            <div className="gs-modal">
              <h3>Jeda 🌅</h3>
              <p>Senja menunggu. Tarik napas dulu.</p>
              <div className="gs-modal-actions">
                <button className="gs-btn primary" onClick={() => setPaused(false)}><Play size={15} /> Lanjutkan</button>
                <button className="gs-btn" onClick={onExit}><X size={15} /> Keluar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Palette (unlimited) ===== */}
      <div className="gs-palette">
        <div className="gs-palette-label">Pilih potongan (tak terbatas), lalu ketuk petak:</div>
        <div className="gs-palette-row">
          {ZEN_PIECES.map((p) => (
            <button
              key={p}
              className={`gs-comp ${selected === p ? 'active' : ''}`}
              onClick={() => pick(p)}
              title={ZEN_META[p].hint}
            >
              <span className="gs-comp-icon">{ZEN_META[p].icon}</span>
              <span className="gs-comp-name">{ZEN_META[p].label}</span>
              <span className="gs-comp-count">∞</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== Tutorial ===== */}
      {phase === 'tutorial' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal wide">
            <h3>🌅 Zen Build — Mode Bebas</h3>
            <p className="gs-brief">
              Tidak ada timer. Tidak ada skor. Tidak ada salah.
              Susun beton, kayu, bata, kaca, dan atap sesukamu di bawah langit
              senja — sekadar untuk menenangkan pikiran.
            </p>
            <ol className="gs-rules">
              <li>👆 <b>Ketuk petak</b> untuk menaruh potongan, bertumpuk bebas.</li>
              <li>↩️ <b>Urungkan</b> kalau berubah pikiran, atau <b>bersihkan</b> semua.</li>
              <li>🎧 Suara bisa <b>dibisukan</b> dari ikon speaker.</li>
            </ol>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={start}>Mulai bersantai <ChevronRight size={15} /></button>
              <button className="gs-btn" onClick={onExit}>Nanti saja</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZenBuild;
