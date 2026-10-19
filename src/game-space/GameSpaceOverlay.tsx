/**
 * EZRAB Game Space — overlay panel (src/game-space/GameSpaceOverlay.tsx)
 *
 * Rendered inside the chat container when the `game` command is detected.
 * The game list and each game are lazy-loaded: opening the overlay pulls a
 * small menu chunk; each 2D game chunk only loads when the user presses
 * "Main". Closing the overlay unmounts everything.
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { X, Gamepad2, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import './game-space.css';
import { ARCADE_GAMES } from './games/arcade/manifest';

/**
 * Ukuran desain acuan semua game (px). Stage mengecil/membesar agar game
 * selalu pas di ruang yang tersedia — tidak ada lagi yang ke-crop di
 * layar pendek.
 */
const STAGE_W = 390;
const STAGE_H = 700;
const STAGE_MAX_SCALE = 1.3;

/** Pembungkus game aktif: ukur ruang, skala stage agar pas, tanpa crop. */
const GameStage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const measRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = measRef.current;
    if (!el) return;
    const update = (): void => {
      const w = el.clientWidth - 16; // kurangi padding .gs-stage
      const h = el.clientHeight - 16;
      if (w > 0 && h > 0) {
        setScale(Math.min(w / STAGE_W, h / STAGE_H, STAGE_MAX_SCALE));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={measRef} className="gs-stage">
      <div
        className="gs-stage-box"
        style={{ width: Math.floor(STAGE_W * scale), height: Math.floor(STAGE_H * scale) }}
      >
        {children}
      </div>
    </div>
  );
};

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

// Arcade 50: komponen per game, tetap lazy per chunk.
// 5 game memakai nama komponen Indonesia (reskin) — dipetakan eksplisit.
const ARCADE_COMP: Record<string, string> = {
  'connect-four': 'ArcadeSambungPipa',
  'dice-roll': 'ArcadeDaduProyek',
  'fruit-slicer': 'ArcadeTebasBambu',
  'insect-catch': 'ArcadeTangkapPerkakas',
  'shape-clicker': 'ArcadeKetokPaku',
};
function pascal(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
const arcadeComp = (id: string): React.LazyExoticComponent<React.FC<{ onExit: () => void }>> => {
  const name = ARCADE_COMP[id] ?? `Arcade${pascal(id)}`;
  return React.lazy(() => import(`./games/arcade/${id}/${name}.tsx`)) as React.LazyExoticComponent<
    React.FC<{ onExit: () => void }>
  >;
};

interface Props {
  onClose: () => void;
}

interface GameDef {
  id: string;
  title: string;
  tagline: string;
  emoji?: string;
  art?: string;
  meta: string;
  theme: string;
  badge?: string;
  cat: 'construction' | 'arcade';
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
    cat: 'construction',
    component: BongkarRumah,
  },
  {
    id: 'flappy-mandor',
    title: 'Flappy Mandor',
    tagline: 'Terbangkan mandor berhelm lewati crane & balok. Jangan sampai jatuh!',
    emoji: '🪖',
    meta: 'Medali tiap 10 gate · best score',
    theme: 'gs-card-flappy',
    cat: 'construction',
    component: FlappyMandor,
  },
  {
    id: 'ketapel-konstruksi',
    title: 'Ketapel Konstruksi',
    tagline: 'Luncurkan wrecking ball, robohkan struktur & berkas revisi. 10 level.',
    emoji: '🎯',
    meta: '10 level · bintang 1–3',
    theme: 'gs-card-ketapel',
    cat: 'construction',
    component: KetapelKonstruksi,
  },
  {
    id: 'lari-proyek',
    title: 'Lari Proyek',
    tagline: 'Endless runner: lompat & nunduk hindari barier, lubang & bata jatuh.',
    emoji: '🏃',
    meta: 'Endless · kumpulkan helm',
    theme: 'gs-card-lari',
    cat: 'construction',
    component: LariProyek,
  },
  {
    id: 'sudoku-tukang',
    title: 'Sudoku Tukang',
    tagline: 'Sudoku 9×9 klasik. 4 tingkat kesulitan, mode catatan, timer.',
    emoji: '🧩',
    meta: '4 difficulty · best time',
    theme: 'gs-card-sudoku',
    cat: 'construction',
    component: SudokuTukang,
  },
  {
    id: 'selamatkan-mandor',
    title: 'Selamatkan Mandor',
    tagline: 'Gambar garis pelindung, selamatkan mandor dari hujan bata. 15 level.',
    emoji: '✏️',
    meta: '15 level · fisika garis',
    theme: 'gs-card-selamat',
    cat: 'construction',
    component: SelamatkanMandor,
  },
  {
    id: 'tebas-material',
    title: 'Tebas Material',
    tagline: 'Swipe tebas material beterbangan. Kombo swipe, awas dinamit!',
    emoji: '🍉',
    meta: 'Kombo · 3 nyawa',
    theme: 'gs-card-tebas',
    cat: 'construction',
    component: TebasMaterial,
  },
  {
    id: 'sambung-kata',
    title: 'Sambung Kata',
    tagline: 'Susun istilah konstruksi dari roda huruf. 3 pack × 20 level.',
    emoji: '🔤',
    meta: '60 level · kosakata proyek',
    theme: 'gs-card-kata',
    cat: 'construction',
    component: SambungKata,
  },
  {
    id: 'gabung-blok',
    title: 'Gabung Blok',
    tagline: '2048 ala kontraktor: BATA → BATAKO → … → MENARA.',
    emoji: '🧱',
    meta: '8 tier · best score',
    theme: 'gs-card-gabung',
    cat: 'construction',
    component: GabungBlok,
  },
  {
    id: 'head-soccer-mandor',
    title: 'Head Soccer Mandor',
    tagline: 'Sundul & tendang bola, kalahkan 5 level AI dalam turnamen.',
    emoji: '⚽',
    meta: 'Turnamen 5 level',
    theme: 'gs-card-soccer',
    cat: 'construction',
    component: HeadSoccerMandor,
  },
  {
    id: 'build-challenge',
    title: 'Build Challenge',
    tagline: 'Susun pondasi, kolom, balok & atap jadi bangunan 3D.',
    emoji: '🏗️',
    meta: '3 level • ±5 menit • mouse & sentuh',
    theme: 'gs-card-build',
    cat: 'construction',
    component: BuildChallenge,
  },
  // ---- Arcade 50 (reskin total tema konstruksi, dari manifest) ----
  ...ARCADE_GAMES.map((g) => ({
    id: `arcade-${g.id}`,
    title: g.title,
    tagline: g.desc,
    art: g.art,
    meta: 'Arcade · best score tersimpan',
    theme: 'gs-card-arcade',
    cat: 'arcade' as const,
    component: arcadeComp(g.id),
  })),
];

type Tab = 'all' | 'construction' | 'arcade';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'construction', label: 'Konstruksi' },
  { id: 'arcade', label: 'Arcade' },
];

export const GameSpaceOverlay: React.FC<Props> = ({ onClose }) => {
  const [activeGame, setActiveGame] = useState<GameDef | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = GAMES.filter(
    (g) =>
      (tab === 'all' || g.cat === tab) &&
      (!q || g.title.toLowerCase().includes(q) || g.tagline.toLowerCase().includes(q)),
  );

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
              Istirahat sebentar dari hitung-hitungan? {GAMES.length} game menunggu.
              Skor tersimpan lokal di perangkatmu — tidak memakai AI credits.
            </p>
            <div className="gs-tabs" role="tablist" aria-label="Kategori game">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`gs-tab${tab === t.id ? ' gs-tab-active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  <span className="gs-tab-count">
                    {t.id === 'all' ? GAMES.length : GAMES.filter((g) => g.cat === t.id).length}
                  </span>
                </button>
              ))}
            </div>
            <input
              className="gs-search"
              type="search"
              placeholder="Cari game… (mis. mandor, bata, puzzle)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cari game"
            />
            <div className="gs-cards">
              {visible.map((g) => (
                <button key={g.id} className={`gs-card ${g.theme}`} onClick={() => setActiveGame(g)}>
                  {g.art ? (
                    <img className="gs-card-art" src={g.art} alt="" loading="lazy" />
                  ) : (
                    <span className="gs-card-emoji">{g.emoji}</span>
                  )}
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
              {visible.length === 0 && (
                <p className="gs-empty">Tidak ketemu — coba kata kunci lain.</p>
              )}
            </div>
            <p className="gs-menu-note">🎮 Berjalan 100% lokal di perangkatmu — tanpa AI, tanpa kuota.</p>
          </div>
        ) : (
          <GameStage>
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
          </GameStage>
        )}
      </div>
    </div>
  );
};

export default GameSpaceOverlay;
