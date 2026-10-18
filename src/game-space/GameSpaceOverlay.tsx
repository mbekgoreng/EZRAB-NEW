/**
 * EZRAB Game Space — overlay panel (src/game-space/GameSpaceOverlay.tsx)
 *
 * Rendered inside the chat container when the `game` command is detected.
 * The game list and each game are lazy-loaded: opening the overlay pulls a
 * small menu chunk; the Three.js game chunk only loads when the user presses
 * "Main". Closing the overlay unmounts everything (engine.dispose runs).
 */

import React, { Suspense, useState } from 'react';
import { X, Gamepad2, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import './game-space.css';

// Lazy: game code (+ three.js scene) splits into its own chunk.
const BuildChallenge = React.lazy(() => import('./games/build-challenge/BuildChallenge'));

interface Props {
  onClose: () => void;
}

interface GameDef {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  meta: string;
  component: React.LazyExoticComponent<React.FC<{ onExit: () => void }>>;
}

const GAMES: GameDef[] = [
  {
    id: 'build-challenge',
    title: 'Build Challenge',
    tagline: 'Susun pondasi, kolom, balok & atap jadi bangunan 3D.',
    emoji: '🏗️',
    meta: '3 level • ±5 menit • mouse & sentuh',
    component: BuildChallenge,
  },
];

export const GameSpaceOverlay: React.FC<Props> = ({ onClose }) => {
  const [activeGame, setActiveGame] = useState<GameDef | null>(null);

  return (
    <div
      className="gs-overlay"
      role="dialog"
      aria-label="EZRAB Game Space"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="gs-shell">
        {/* ===== Header ===== */}
        <div className="gs-header">
          <div className="gs-header-left">
            {activeGame ? (
              <button className="gs-iconbtn" onClick={() => setActiveGame(null)} title="Kembali ke daftar game">
                <ArrowLeft size={17} />
              </button>
            ) : (
              <span className="gs-logo"><Gamepad2 size={20} /></span>
            )}
            <div>
              <div className="gs-title">EZRAB Game Space</div>
              <div className="gs-subtitle">
                {activeGame ? activeGame.title : 'Mini-game 3D di dalam chat — tanpa AI, tanpa kuota'}
              </div>
            </div>
          </div>
          <button className="gs-iconbtn" onClick={onClose} title="Tutup & kembali ke chat">
            <X size={17} />
          </button>
        </div>

        {/* ===== Body ===== */}
        {!activeGame ? (
          <div className="gs-menu">
            <p className="gs-menu-intro">
              Istirahat sebentar dari hitung-hitungan? Pilih game di bawah ini. Skor tersimpan
              lokal di perangkatmu — tidak memakai AI credits.
            </p>
            <div className="gs-cards">
              {GAMES.map((g) => (
                <button key={g.id} className="gs-card" onClick={() => setActiveGame(g)}>
                  <span className="gs-card-emoji">{g.emoji}</span>
                  <span className="gs-card-body">
                    <span className="gs-card-title">{g.title}</span>
                    <span className="gs-card-tagline">{g.tagline}</span>
                    <span className="gs-card-meta">{g.meta}</span>
                  </span>
                  <span className="gs-card-cta">Main <ChevronRight size={16} /></span>
                </button>
              ))}
            </div>
            <p className="gs-menu-note">🎮 Game lain segera hadir. Punya ide game? Ceritakan di chat.</p>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="gs-loading">
                <Loader2 size={28} className="spin" />
                <p>Memuat scene 3D…</p>
              </div>
            }
          >
            <activeGame.component onExit={() => setActiveGame(null)} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default GameSpaceOverlay;
