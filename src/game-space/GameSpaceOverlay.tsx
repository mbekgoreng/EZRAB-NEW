/**
 * EZRAB Game Space — overlay panel (src/game-space/GameSpaceOverlay.tsx)
 *
 * Rendered inside the chat container when the `game` command is detected.
 * The game list and each game are lazy-loaded: opening the overlay pulls a
 * small menu chunk; each 2D game chunk only loads when the user presses
 * "Main". Closing the overlay unmounts everything.
 */

import React, { Suspense, useState } from 'react';
import { X, Gamepad2, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import './game-space.css';

// Lazy: each game splits into its own chunk (2D canvas, no three.js).
const BongkarRumah = React.lazy(() => import('./games/bongkar-rumah/BongkarRumah'));
const FlappyMandor = React.lazy(() => import('./games/flappy-mandor/FlappyMandor'));
const KetapelKonstruksi = React.lazy(() => import('./games/ketapel-konstruksi/KetapelKonstruksi'));
const LariProyek = React.lazy(() => import('./games/lari-proyek/LariProyek'));
const SudokuTukang = React.lazy(() => import('./games/sudoku-tukang/SudokuTukang'));
const SelamatkanMandor = React.lazy(() => import('./games/selamatkan-mandor/SelamatkanMandor'));
const TebasMaterial = React.lazy(() => import('./games/tebas-material/TebasMaterial'));
const SambungKata = React.lazy(() => import('./games/sambung-kata/SambungKata'));
const GabungBlok = React.lazy(() => import('./games/gabung-blok/GabungBlok'));
const HeadSoccerMandor = React.lazy(() => import('./games/head-soccer-mandor/HeadSoccerMandor'));
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
  theme: string;
  badge?: string;
  component: React.LazyExoticComponent<React.FC<{ onExit: () => void }>>;
}

const GAMES: GameDef[] = [
  {
    id: 'bongkar-rumah',
    title: 'Bongkar Rumah',
    tagline: 'Ketuk rumahnya sampai rata dengan tanah. 4 level: rumah, ruko, apartemen, tower.',
    emoji: '💥',
    meta: '4 level · kombo runtuh · pelepas stres',
    theme: 'gs-card-bongkar',
    badge: 'PELEPAS STRES',
    component: BongkarRumah,
  },
  {
    id: 'flappy-mandor',
    title: 'Flappy Mandor',
    tagline: 'Terbangkan mandor berhelm lewati crane & balok. Jangan sampai jatuh!',
    emoji: '🪖',
    meta: 'Medali tiap 10 gate · best score',
    theme: 'gs-card-flappy',
    component: FlappyMandor,
  },
  {
    id: 'ketapel-konstruksi',
    title: 'Ketapel Konstruksi',
    tagline: 'Luncurkan wrecking ball, robohkan struktur & berkas revisi. 10 level.',
    emoji: '🎯',
    meta: '10 level · bintang 1–3',
    theme: 'gs-card-ketapel',
    component: KetapelKonstruksi,
  },
  {
    id: 'lari-proyek',
    title: 'Lari Proyek',
    tagline: 'Endless runner: lompat & nunduk hindari barier, lubang & bata jatuh.',
    emoji: '🏃',
    meta: 'Endless · kumpulkan helm',
    theme: 'gs-card-lari',
    component: LariProyek,
  },
  {
    id: 'sudoku-tukang',
    title: 'Sudoku Tukang',
    tagline: 'Sudoku 9×9 klasik. 4 tingkat kesulitan, mode catatan, timer.',
    emoji: '🧩',
    meta: '4 difficulty · best time',
    theme: 'gs-card-sudoku',
    component: SudokuTukang,
  },
  {
    id: 'selamatkan-mandor',
    title: 'Selamatkan Mandor',
    tagline: 'Gambar garis pelindung, selamatkan mandor dari hujan bata. 15 level.',
    emoji: '✏️',
    meta: '15 level · fisika garis',
    theme: 'gs-card-selamat',
    component: SelamatkanMandor,
  },
  {
    id: 'tebas-material',
    title: 'Tebas Material',
    tagline: 'Swipe tebas material beterbangan. Kombo swipe, awas dinamit!',
    emoji: '🍉',
    meta: 'Kombo · 3 nyawa',
    theme: 'gs-card-tebas',
    component: TebasMaterial,
  },
  {
    id: 'sambung-kata',
    title: 'Sambung Kata',
    tagline: 'Susun istilah konstruksi dari roda huruf. 3 pack × 20 level.',
    emoji: '🔤',
    meta: '60 level · kosakata proyek',
    theme: 'gs-card-kata',
    component: SambungKata,
  },
  {
    id: 'gabung-blok',
    title: 'Gabung Blok',
    tagline: '2048 ala kontraktor: BATA → BATAKO → … → MENARA.',
    emoji: '🧱',
    meta: '8 tier · best score',
    theme: 'gs-card-gabung',
    component: GabungBlok,
  },
  {
    id: 'head-soccer-mandor',
    title: 'Head Soccer Mandor',
    tagline: 'Sundul & tendang bola, kalahkan 5 level AI dalam turnamen.',
    emoji: '⚽',
    meta: 'Turnamen 5 level',
    theme: 'gs-card-soccer',
    component: HeadSoccerMandor,
  },
  {
    id: 'build-challenge',
    title: 'Build Challenge',
    tagline: 'Susun pondasi, kolom, balok & atap jadi bangunan 3D.',
    emoji: '🏗️',
    meta: '3 level • ±5 menit • mouse & sentuh',
    theme: 'gs-card-build',
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
                {activeGame ? activeGame.title : 'Mini-game 2D di dalam chat — tanpa AI, tanpa kuota'}
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
                <button key={g.id} className={`gs-card ${g.theme}`} onClick={() => setActiveGame(g)}>
                  <span className="gs-card-emoji">{g.emoji}</span>
                  <span className="gs-card-body">
                    <span className="gs-card-title-row">
                      <span className="gs-card-title">{g.title}</span>
                      {g.badge && <span className="gs-card-badge">{g.badge}</span>}
                    </span>
                    <span className="gs-card-tagline">{g.tagline}</span>
                    <span className="gs-card-meta">{g.meta}</span>
                  </span>
                  <span className="gs-card-cta">Main <ChevronRight size={16} /></span>
                </button>
              ))}
            </div>
            <p className="gs-menu-note">🎮 Berjalan 100% lokal di perangkatmu — tanpa AI, tanpa kuota.</p>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="gs-loading">
                <Loader2 size={28} className="spin" />
                <p>Memuat game…</p>
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
