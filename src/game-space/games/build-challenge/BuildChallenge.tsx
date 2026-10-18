/**
 * EZRAB Build Challenge — React host (src/game-space/games/build-challenge/BuildChallenge.tsx)
 *
 * Owns gameplay UI: tutorial, HUD (score/timer/targets), component palette,
 * pause/restart, level-complete and victory screens. The Three.js engine is
 * created once per level and disposed on unmount/level change/close.
 * All rules live in logic.ts; this file only wires state to the engine.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, X, Trophy, Clock, MousePointerClick, ChevronRight, Flag } from 'lucide-react';
import { BuildChallengeEngine } from './BuildChallengeEngine';
import {
  LEVELS, COMP_ORDER, COMP_META, createGameState, resetForLevel, tryPlace,
  canPlace, levelTargetMet, remainingTargets, levelBonus, REASON_TEXT,
  type CompType, type GameState, type Targets,
} from './logic';

interface Props {
  /** Back to the Game Space menu (or close to chat). */
  onExit: () => void;
}

type Phase = 'tutorial' | 'playing' | 'levelDone' | 'victory';

const fmtTime = (s: number): string =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const COMP_ICON: Record<CompType, string> = {
  pondasi: '🧱',
  kolom: '🏛️',
  balok: '➖',
  dinding: '🧱',
  atap: '🔺',
};

export const BuildChallenge: React.FC<Props> = ({ onExit }) => {
  const [phase, setPhase] = useState<Phase>('tutorial');
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<CompType>('pondasi');
  const [webglError, setWebglError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levelScore, setLevelScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [counts, setCounts] = useState<Targets>({ pondasi: 0, kolom: 0, balok: 0, dinding: 0, atap: 0 });
  const [bonus, setBonus] = useState(0);

  const stateRef = useRef<GameState>(createGameState());
  const engineRef = useRef<BuildChallengeEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const elapsedRef = useRef(0);
  const selectedRef = useRef<CompType>('pondasi');
  const pausedRef = useRef(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const toastTimer = useRef<number | null>(null);

  const levelIdx = stateRef.current.levelIdx;
  const level = LEVELS[levelIdx];

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    setCounts({ ...s.counts });
    setTotalScore(s.score);
  }, []);

  /* ---------- engine lifecycle: one engine per level, disposed on change/unmount ---------- */
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // WebGL availability check with a friendly fallback.
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) throw new Error('no-webgl');
    } catch {
      setWebglError(true);
      return;
    }
    let engine: BuildChallengeEngine | null = null;
    try {
      engine = new BuildChallengeEngine(canvas, {
        reducedMotion: reducedMotion.current,
        callbacks: {
          onPick: (x, z) => handlePick(x, z),
          onHover: (x, z) => {
            const eng = engineRef.current;
            if (!eng || pausedRef.current) {
              eng?.setGhost(null, null);
              return;
            }
            if (x < 0 || z === null) {
              eng.setGhost(null, null);
              return;
            }
            const check = canPlace(stateRef.current.board, selectedRef.current, x, z);
            eng.setGhost(selectedRef.current, check.ok, x, z);
          },
          onAutoPause: () => setPaused(true),
        },
      });
    } catch {
      setWebglError(true);
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, levelIdx]);

  selectedRef.current = selected;
  pausedRef.current = paused;

  useEffect(() => {
    engineRef.current?.setPaused(paused || phase !== 'playing');
  }, [paused, phase]);

  /* ---------- timer ---------- */
  useEffect(() => {
    if (phase !== 'playing' || paused) return;
    const id = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, paused, levelIdx]);

  /* ---------- gameplay ---------- */
  const handlePick = useCallback((x: number, z: number) => {
    const st = stateRef.current;
    const res = tryPlace(st, selectedRef.current, x, z);
    syncHud();
    if (!res.ok) {
      showToast(res.reason ? REASON_TEXT[res.reason] : 'Tidak bisa ditaruh di sini.');
      return;
    }
    engineRef.current?.place(selectedRef.current, x, z);
    engineRef.current?.setGhost(null, null);
    if (levelTargetMet(st)) {
      const b = levelBonus(st.levelIdx, elapsedRef.current + 1);
      st.score += b;
      setBonus(b);
      setLevelScore(st.score);
      syncHud();
      setPhase(st.levelIdx + 1 >= LEVELS.length ? 'victory' : 'levelDone');
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: ['#2563EB', '#38BDF8', '#F59E0B', '#22C55E'] });
      }).catch(() => { /* confetti is decorative */ });
      // Auto-advance the palette to the next unfinished component for the next level.
    } else {
      // Smart palette: auto-select the first component type that still has remaining target.
      const rem = remainingTargets(st);
      const next = COMP_ORDER.find((c) => rem[c] > 0);
      if (next && next !== selectedRef.current) setSelected(next);
    }
  }, [showToast, syncHud]);

  const startLevel = useCallback((idx: number) => {
    resetForLevel(stateRef.current, idx);
    elapsedRef.current = 0;
    setElapsed(0);
    setBonus(0);
    setPaused(false);
    setToast(null);
    const rem = remainingTargets(stateRef.current);
    setSelected(COMP_ORDER.find((c) => rem[c] > 0) ?? 'pondasi');
    syncHud();
    setPhase('playing');
  }, [syncHud]);

  const restartAll = useCallback(() => {
    stateRef.current = createGameState();
    startLevel(0);
  }, [startLevel]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const remaining = remainingTargets(stateRef.current);
  const totalTargets = (Object.keys(level.targets) as CompType[]).reduce((s, k) => s + level.targets[k], 0);
  const doneTargets = (Object.keys(level.targets) as CompType[]).reduce(
    (s, k) => s + Math.min(stateRef.current.counts[k], level.targets[k]), 0,
  );

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
          <span className="gs-level">Level {level.id}/3</span>
          <span className="gs-hud-title">{level.name}</span>
        </div>
        <div className="gs-hud-stats">
          <span className="gs-stat" title="Skor"><Trophy size={14} /> {totalScore}</span>
          <span className="gs-stat" title="Waktu"><Clock size={14} /> {fmtTime(elapsed)}</span>
          <span className="gs-stat" title="Progres"><Flag size={14} /> {doneTargets}/{totalTargets}</span>
        </div>
        <div className="gs-hud-actions">
          <button className="gs-iconbtn" onClick={togglePause} title={paused ? 'Lanjut' : 'Jeda'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="gs-iconbtn" onClick={() => startLevel(levelIdx)} title="Ulangi level">
            <RotateCcw size={16} />
          </button>
          <button className="gs-iconbtn" onClick={onExit} title="Tutup game">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ===== Target checklist ===== */}
      <div className="gs-targets">
        {COMP_ORDER.filter((c) => level.targets[c] > 0).map((c) => {
          const need = level.targets[c];
          const have = Math.min(stateRef.current.counts[c], need);
          return (
            <span key={c} className={`gs-target ${have >= need ? 'done' : ''}`}>
              {COMP_ICON[c]} {COMP_META[c].label} {have}/{need}
            </span>
          );
        })}
      </div>

      {/* ===== 3D canvas ===== */}
      <div className="gs-canvas-wrap">
        <canvas ref={canvasRef} className="gs-canvas" />
        {toast && <div className="gs-toast">{toast}</div>}
        {paused && phase === 'playing' && (
          <div className="gs-pause-overlay">
            <div className="gs-modal">
              <h3>Jeda ⏸️</h3>
              <p>Game dihentikan sementara. Timer ikut berhenti.</p>
              <div className="gs-modal-actions">
                <button className="gs-btn primary" onClick={togglePause}><Play size={15} /> Lanjutkan</button>
                <button className="gs-btn" onClick={() => startLevel(levelIdx)}><RotateCcw size={15} /> Ulangi</button>
                <button className="gs-btn" onClick={onExit}><X size={15} /> Keluar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Palette ===== */}
      <div className="gs-palette">
        <div className="gs-palette-label"><MousePointerClick size={13} /> Pilih komponen, lalu ketuk petak site:</div>
        <div className="gs-palette-row">
          {COMP_ORDER.map((c) => {
            const rem = remaining[c];
            const disabled = rem <= 0;
            return (
              <button
                key={c}
                className={`gs-comp ${selected === c ? 'active' : ''} ${disabled ? 'done' : ''}`}
                onClick={() => !disabled && setSelected(c)}
                disabled={disabled}
                title={COMP_META[c].hint}
              >
                <span className="gs-comp-icon">{COMP_ICON[c]}</span>
                <span className="gs-comp-name">{COMP_META[c].label}</span>
                <span className="gs-comp-count">{disabled ? '✓' : `×${rem}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Tutorial ===== */}
      {phase === 'tutorial' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal wide">
            <h3>🏗️ EZRAB Build Challenge</h3>
            <p className="gs-brief">{level.briefing}</p>
            <ol className="gs-rules">
              <li><b>Pondasi</b> 🧱 — hanya di tanah kosong.</li>
              <li><b>Kolom</b> 🏛️ — hanya di atas pondasi.</li>
              <li><b>Balok</b> ➖ — hanya di atas kolom.</li>
              <li><b>Dinding</b> 🧱 — tanah kosong yang <b>menempel</b> pondasi.</li>
              <li><b>Atap</b> 🔺 — hanya di atas balok.</li>
            </ol>
            <p className="gs-rules-note">Penempatan benar <b>+100 poin</b>. Salah tempat <b>−25 poin</b>. Selesaikan sebelum waktu par untuk <b>bonus kecepatan</b>. Ada 3 level.</p>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={() => startLevel(0)}>Mulai main <ChevronRight size={15} /></button>
              <button className="gs-btn" onClick={onExit}>Nanti saja</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Level complete ===== */}
      {phase === 'levelDone' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal">
            <h3>🎉 Level {level.id} selesai!</h3>
            <div className="gs-score-rows">
              <div><span>Waktu</span><b>{fmtTime(elapsed)}</b></div>
              <div><span>Bonus kecepatan</span><b>+{bonus}</b></div>
              <div><span>Total skor</span><b>{levelScore}</b></div>
            </div>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={() => startLevel(levelIdx + 1)}>
                Level {levelIdx + 2} <ChevronRight size={15} />
              </button>
              <button className="gs-btn" onClick={() => startLevel(levelIdx)}><RotateCcw size={15} /> Ulangi</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Victory ===== */}
      {phase === 'victory' && (
        <div className="gs-overlay-modal">
          <div className="gs-modal">
            <h3>🏆 Bangunan selesai!</h3>
            <p>Kamu menyelesaikan 3 level EZRAB Build Challenge.</p>
            <div className="gs-score-rows">
              <div><span>Skor akhir</span><b>{totalScore}</b></div>
              <div><span>Total langkah</span><b>{stateRef.current.moves}</b></div>
              <div><span>Salah tempat</span><b>{stateRef.current.invalidAttempts}×</b></div>
            </div>
            <div className="gs-modal-actions">
              <button className="gs-btn primary" onClick={restartAll}><RotateCcw size={15} /> Main lagi</button>
              <button className="gs-btn" onClick={onExit}>Kembali ke chat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildChallenge;
