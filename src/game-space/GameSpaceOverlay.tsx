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
import { CONSTRUCTION_GAMES } from './catalog';

/**
 * Ukuran desain acuan game (px). Stage mengecil/membesar agar game
 * selalu pas di ruang yang tersedia — tidak ada lagi yang ke-crop di
 * layar pendek.
 *
 * Default-nya portrait 390×700 (acuan desain mayoritas game). Game yang
 * memang dirancang landscape-native (arena/field menyamping) dan
 * square-native (papan persegi) punya acuan sendiri di STAGE_SPECS,
 * supaya panggungnya mengisi layar lebar secara maksimal dengan rasio
 * aspek asli game — tanpa distorsi dan tanpa terpotong. Game
 * portrait-native tetap portrait dan terpusat rapi.
 *
 * Yang diubah di sini HANYA ukuran tampil panggung (kotak CSS). Dimensi
 * logis, resolusi render internal, grafis, dan mekanik tiap game tidak
 * disentuh sama sekali.
 */
const STAGE_W = 390;
const STAGE_H = 700;
const STAGE_MAX_SCALE = 1.3;

interface StageSpec {
  w: number;
  h: number;
  max: number;
}

const STAGE_PORTRAIT: StageSpec = { w: STAGE_W, h: STAGE_H, max: STAGE_MAX_SCALE };
/** 16:9 — field/arena menyamping penuh (field difraksi W×H / runner / slicer). */
const LAND_WIDE: StageSpec = { w: 1120, h: 630, max: 2 };
/** 16:10 — adegan 3D/DOM menyamping (kanvas + palet/HUD horizontal). */
const LAND: StageSpec = { w: 1120, h: 700, max: 2 };
/** 10:7 — arena menyamping ringan (fraksi W×H, formasi, bin, target). */
const LAND_MILD: StageSpec = { w: 1000, h: 700, max: 2 };
/** 1:1 — papan persegi (board diskalakan min(W,H) atau aspect-ratio 1). */
const SQUARE: StageSpec = { w: 700, h: 700, max: 2 };

/**
 * Klasifikasi orientasi panggung per game, dari geometri desainnya:
 * dunia virtual tetap (WORLD/VW), papan cols×rows, board min(W,H),
 * atau komposisi adegan fraksi W×H. Game yang tidak terdaftar =
 * portrait-native (termasuk keluarga lebar-logis-tetap LW yang diskalakan
 * dari lebar, papan DOM bertumpuk vertikal, dan sumur/kolom vertikal).
 */
const STAGE_SPECS: Record<string, StageSpec> = {
  // ---- Landscape-native ----
  'bongkar-rumah': LAND, // adegan 3D + palet horizontal
  'build-challenge': LAND, // site 3D + palet komponen horizontal
  'head-soccer-mandor': LAND_WIDE, // field sepak bola fraksi W×H
  'ketapel-konstruksi': { w: 900, h: 700, max: 2 }, // dunia WORLD 900×700 persis
  'lari-proyek': LAND_WIDE, // endless runner menyamping (Three.js)
  'selamatkan-mandor': LAND_MILD, // adegan crane/bata fraksi W×H
  'tebas-material': LAND_WIDE, // slicer layar penuh
  'arcade-archery': LAND_MILD, // tembak horizontal, ruang virtual VH
  'arcade-breakout': LAND_MILD, // field bata 8 kolom fraksi W×H
  'arcade-capit-crane': LAND_MILD, // rel crane menyamping
  'arcade-dice-roll': LAND_MILD, // elips meja adegan fraksi W×H
  'arcade-emoji-catcher': LAND_MILD, // tangkap jatuh, keranjang menyamping
  'arcade-fruit-slicer': LAND_WIDE, // slicer layar penuh
  'arcade-hangman': LAND_MILD, // komposisi adegan menyamping fraksi W×H
  'arcade-insect-catch': LAND_MILD, // target menyebar fraksi W×H
  'arcade-ping-pong': { w: 1000, h: 600, max: 2 }, // dunia VW×VH 800×480 (5:3)
  'arcade-shape-clicker': LAND_MILD, // target menyebar fraksi W×H
  'arcade-sortir-material': LAND_MILD, // 3 bin membentang selebar W
  'arcade-space-invaders': LAND_MILD, // formasi 8 kolom menyamping
  // ---- Square-native ----
  'gabung-blok': SQUARE, // papan 2048: size = min(W,H)
  'sambung-kata': SQUARE, // roda huruf: komposisi persegi
  'sudoku-tukang': SQUARE, // papan 9×9: n = min(W,H)
  'arcade-candy-crush': SQUARE, // papan 8×8
  'arcade-checkers': SQUARE, // papan DOM aspect 1
  'arcade-chess': SQUARE, // papan DOM aspect 1
  'arcade-connect-four': SQUARE, // papan 7×6 di tengah bidang
  'arcade-crossy-road': SQUARE, // lajur menyamping, progres vertikal
  'arcade-lights-out': SQUARE, // grid 5×5, cell = min(W,H)
  'arcade-minesweeper': SQUARE, // level 9×9 / 16×16 / 30×16
  'arcade-nonogram': SQUARE, // grid 10×10 + petunjuk
  'arcade-pac-man': SQUARE, // labirin 19×17
  'arcade-simon-says': SQUARE, // 4 pad 2×2
  'arcade-sliding-puzzle': SQUARE, // papan DOM aspect 1
  'arcade-snake': SQUARE, // dunia logis 440×440
  'arcade-sudoku': SQUARE, // papan DOM aspect 1
  'arcade-tic-tac-toe': SQUARE, // papan: size = min(W,H)
  'arcade-whack-a-mole': SQUARE, // papan lubang persegi di tengah adegan
};

/** Pembungkus game aktif: ukur ruang, skala stage agar pas, tanpa crop. */
const GameStage: React.FC<{ spec: StageSpec; children: React.ReactNode }> = ({ spec, children }) => {
  const measRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = measRef.current;
    if (!el) return;
    const update = (): void => {
      const w = el.clientWidth - 16; // kurangi padding .gs-stage
      const h = el.clientHeight - 16;
      if (w > 0 && h > 0) {
        setScale(Math.min(w / spec.w, h / spec.h, spec.max));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [spec]);
  return (
    <div ref={measRef} className="gs-stage">
      <div
        className="gs-stage-box"
        style={{ width: Math.floor(spec.w * scale), height: Math.floor(spec.h * scale) }}
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

const CONSTRUCTION_COMPONENTS: Record<string, GameDef['component']> = {
  'bongkar-rumah': BongkarRumah,
  'flappy-mandor': FlappyMandor,
  'ketapel-konstruksi': KetapelKonstruksi,
  'lari-proyek': LariProyek,
  'sudoku-tukang': SudokuTukang,
  'selamatkan-mandor': SelamatkanMandor,
  'tebas-material': TebasMaterial,
  'sambung-kata': SambungKata,
  'gabung-blok': GabungBlok,
  'head-soccer-mandor': HeadSoccerMandor,
  'build-challenge': BuildChallenge,
};

const GAMES: GameDef[] = [
  // ---- Konstruksi: teks katalog dari sumber tunggal game-space/catalog.ts ----
  ...CONSTRUCTION_GAMES.map((g) => ({
    ...g,
    cat: 'construction' as const,
    component: CONSTRUCTION_COMPONENTS[g.id],
  })),
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
          <GameStage spec={STAGE_SPECS[activeGame.id] ?? STAGE_PORTRAIT}>
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
