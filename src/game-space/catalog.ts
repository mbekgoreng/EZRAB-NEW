/**
 * EZRAB Game Space — katalog teks game (src/game-space/catalog.ts)
 *
 * SUMBER TUNGGAL teks katalog game: judul + deskripsi isi tiap game.
 * - GameSpaceOverlay memakai daftar konstruksi di sini (ditambah komponen
 *   lazy-nya sendiri) untuk kartu menu.
 * - games/arcade/manifest.ts memakai daftar arcade di sini (ditambah art).
 * - Ezrab Chat AI memakai modul ini untuk MENJAWAB pertanyaan tentang game
 *   secara deterministik (intent GAME_INFO) — dari data nyata, bukan
 *   karangan model.
 *
 * Modul ini SENGAJA murni data tanpa impor aset (.jpg dsb.) dan tanpa
 * impor komponen game, agar aman diimpor jalur chat yang eager dan oleh
 * bundel tes Node (esbuild/tsx gagal pada impor .jpg — terbukti).
 * Bila menambah/mengubah game, ubah di sini; overlay & manifest mengikuti.
 */

export type GameCategory = 'construction' | 'arcade';

export interface ConstructionGameMeta {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  meta: string;
  theme: string;
  badge?: string;
}

export interface ArcadeGameMetaText {
  id: string;
  title: string;
  desc: string;
}

/** 11 game Konstruksi — teks persis kartu menu Game Space. */
export const CONSTRUCTION_GAMES: ConstructionGameMeta[] = [
  { id: 'bongkar-rumah', title: 'Bongkar Rumah', tagline: 'Ketuk rumahnya sampai rata dengan tanah. 4 level: rumah, ruko, apartemen, tower.', emoji: '💥', meta: '4 level · kombo runtuh · pelepas stres', theme: 'gs-card-bongkar', badge: 'PELEPAS STRES' },
  { id: 'flappy-mandor', title: 'Flappy Mandor', tagline: 'Terbangkan mandor berhelm lewati crane & balok. Jangan sampai jatuh!', emoji: '🪖', meta: 'Medali tiap 10 gate · best score', theme: 'gs-card-flappy' },
  { id: 'ketapel-konstruksi', title: 'Ketapel Konstruksi', tagline: 'Luncurkan wrecking ball, robohkan struktur & berkas revisi. 10 level.', emoji: '🎯', meta: '10 level · bintang 1–3', theme: 'gs-card-ketapel' },
  { id: 'lari-proyek', title: 'Lari Proyek', tagline: 'Endless runner: lompat & nunduk hindari barier, lubang & bata jatuh.', emoji: '🏃', meta: 'Endless · kumpulkan helm', theme: 'gs-card-lari' },
  { id: 'sudoku-tukang', title: 'Sudoku Tukang', tagline: 'Sudoku 9×9 klasik. 4 tingkat kesulitan, mode catatan, timer.', emoji: '🧩', meta: '4 difficulty · best time', theme: 'gs-card-sudoku' },
  { id: 'selamatkan-mandor', title: 'Selamatkan Mandor', tagline: 'Gambar garis pelindung, selamatkan mandor dari hujan bata. 15 level.', emoji: '✏️', meta: '15 level · fisika garis', theme: 'gs-card-selamat' },
  { id: 'tebas-material', title: 'Tebas Material', tagline: 'Swipe tebas material beterbangan. Kombo swipe, awas dinamit!', emoji: '🍉', meta: 'Kombo · 3 nyawa', theme: 'gs-card-tebas' },
  { id: 'sambung-kata', title: 'Sambung Kata', tagline: 'Susun istilah konstruksi dari roda huruf. 3 pack × 20 level.', emoji: '🔤', meta: '60 level · kosakata proyek', theme: 'gs-card-kata' },
  { id: 'gabung-blok', title: 'Gabung Blok', tagline: '2048 ala kontraktor: BATA → BATAKO → … → MENARA.', emoji: '🧱', meta: '8 tier · best score', theme: 'gs-card-gabung' },
  { id: 'head-soccer-mandor', title: 'Head Soccer Mandor', tagline: 'Sundul & tendang bola, kalahkan 5 level AI dalam turnamen.', emoji: '⚽', meta: 'Turnamen 5 level', theme: 'gs-card-soccer' },
  { id: 'build-challenge', title: 'Build Challenge', tagline: 'Susun pondasi, kolom, balok & atap jadi bangunan 3D.', emoji: '🏗️', meta: '3 level • ±5 menit • mouse & sentuh', theme: 'gs-card-build' },
];

/** 50 game Arcade (reskin tema konstruksi) — teks persis manifest arcade. */
export const ARCADE_GAME_META: ArcadeGameMetaText[] = [
  { id: 'candy-crush', title: 'Material Match', desc: 'Cocokkan 3+ material bangunan (bata, semen, besi, kayu, kaca) beruntun.' },
  { id: 'pac-man', title: 'Pak Mandor', desc: 'Jadi kepala mandor: makan helm di labirin sambil kabur dari Klien Revisi.' },
  { id: 'chess', title: 'Catur Proyek', desc: 'Catur klasik — buah jadi peran proyek: mandor, arsitek, tower crane. AI level sedang.' },
  { id: 'doodle-jump', title: 'Lompat Scaffolding', desc: 'Lompat setinggi mungkin di perancah, awas papan rapuh.' },
  { id: 'solitaire', title: 'Solitaire Proyek', desc: 'Solitaire klasik dengan kartu bermotif proyek konstruksi.' },
  { id: 'sudoku', title: 'Sudoku Material', desc: 'Sudoku 9×9 dengan ikon material, bukan angka.' },
  { id: 'crossy-road', title: 'Nyebrang Proyek', desc: 'Tuntun tukang menyeberang jalan proyek, hindari truk molen.' },
  { id: 'rock-paper-scissors', title: 'Suit Kontraktor', desc: 'Suit Bata vs Gergaji vs Gambar Kerja melawan AI.' },
  { id: 'flappy-bird', title: 'Mandor Terbang', desc: 'Terbangkan mandor melewati celah crane raksasa.' },
  { id: '2048', title: 'Cor 2048', desc: 'Gabung material: BATA → BATAKO → … sampai 2048.' },
  { id: 'wordle', title: 'Kata Proyek', desc: 'Tebak kata konstruksi 5 huruf dalam 6 percobaan.' },
  { id: 'hangman', title: 'Selamatkan Tukang', desc: 'Tebak kata proyek — salah tebak, perancah roboh bertahap!' },
  { id: 'tower-blocks', title: 'Menara Lantai', desc: 'Susun lantai gedung 3D setinggi mungkin, jangan sampai ambruk.' },
  { id: 'archery', title: 'Tembak Paku', desc: 'Tembak nail gun ke papan triplek — perhitungkan tiupan angin.' },
  { id: 'tic-tac-toe', title: 'Bata vs Semen', desc: 'Tic-tac-toe bata melawan semen. AI sedang atau 2 pemain lokal.' },
  { id: 'minesweeper', title: 'Cari Pipa Bocor', desc: 'Minesweeper: temukan pipa bocor tanpa meledakkannya.' },
  { id: 'speed-typing', title: 'Ketik Cepat Estimator', desc: 'Ketik istilah proyek secepat mungkin sebelum waktu habis.' },
  { id: 'breakout', title: 'Bobok Tembok', desc: 'Pantul bola, bobok dinding bata lapis demi lapis.' },
  { id: 'ping-pong', title: 'Tenis Sendok Semen', desc: 'Ping-pong pakai bet sendok semen melawan AI.' },
  { id: 'tetris', title: 'Susun Bata', desc: 'Tetris ber-texture bata/besi/kayu — baris penuh jadi dinding kokoh.' },
  { id: 'maze-drag', title: 'Labirin Gudang', desc: 'Seret helm melewati labirin gudang material sampai ke pintu keluar.' },
  { id: 'memory-card', title: 'Pasangan Material', desc: 'Kartu memori: temukan pasangan material bangunan.' },
  { id: 'number-guessing', title: 'Tebak Volume', desc: 'Tebak volume cor (m³) yang disembunyikan molen.' },
  { id: 'snake', title: 'Ular Kabel', desc: 'Ular kabel makan konektor — jangan sampai korslet.' },
  { id: 'connect-four', title: 'Sambung Pipa', desc: 'Connect four: sambung 4 pipa sejalur melawan AI.' },
  { id: 'insect-catch', title: 'Tangkap Perkakas', desc: 'Tangkap perkakas yang jatuh dari rak gudang sebelum menyentuh lantai.' },
  { id: 'typing-game', title: 'Ketik Proyek', desc: 'Ketik kata proyek yang berjatuhan sebelum deadline jebol.' },
  { id: 'dice-roll', title: 'Dadu Proyek', desc: 'Lempar dadu proyek, adu hoki melawan AI.' },
  { id: 'shape-clicker', title: 'Ketok Paku', desc: 'Klik paku yang nongol secepat mungkin — uji refleks tukang.' },
  { id: 'fruit-slicer', title: 'Tebas Bambu', desc: 'Swipe untuk menebas bambu & material yang beterbangan.' },
  { id: 'quiz', title: 'Kuis Tukang', desc: 'Kuis pengetahuan umum & dunia proyek ala tukang.' },
  { id: 'emoji-catcher', title: 'Tangkap Helm', desc: 'Tangkap helm yang jatuh, hindari bata melayang.' },
  { id: 'whack-a-mole', title: 'Pukul Paku', desc: 'Pukul paku yang nongol dari triplek secepatnya.' },
  { id: 'simon-says', title: 'Ikuti Mandor', desc: 'Ikuti urutan aba-aba mandor yang makin panjang.' },
  { id: 'sliding-puzzle', title: 'Geser Keramik', desc: 'Geser keramik untuk menyusun gambar blueprint.' },
  { id: 'mastermind', title: 'Tebak Campuran', desc: 'Tebak komposisi campuran cor yang tepat.' },
  { id: 'blackjack', title: 'Blackjack Meja Proyek', desc: 'Blackjack 21 di meja proyek — kalahkan bandar.' },
  { id: 'bubble-shooter', title: 'Tembak Semen', desc: 'Tembak gelembung semen, cocokkan 3 warna sejenis.' },
  { id: 'checkers', title: 'Dam Bata', desc: 'Dam/checkers berbidak bata melawan AI level sedang.' },
  { id: 'space-invaders', title: 'Tembak Deadline', desc: 'Tembak deadline yang berjatuhan dari langit sebelum mendarat.' },
  { id: 'asteroids', title: 'Hujan Bata', desc: 'Hindari dan hancurkan hujan bata di area proyek.' },
  { id: 'reversi', title: 'Balik Triplek', desc: 'Reversi 8×8 berbidak keping triplek melawan AI level sedang.' },
  { id: 'mahjong-match', title: 'Ubin Material', desc: 'Mahjong: pasangkan ubin material yang sama.' },
  { id: 'frogger', title: 'Tukang Nyebrang', desc: 'Tuntun tukang menyeberangi sungai & jalan proyek yang ramai.' },
  { id: 'video-poker', title: 'Video Poker Proyek', desc: 'Video poker draw 5 kartu bertema proyek.' },
  { id: 'battleship', title: 'Perang Crane', desc: 'Tempatkan alat berat di lahan, bombardir markas lawan.' },
  { id: 'nonogram', title: 'Bongkar Gambar', desc: 'Nonogram: ungkap pixel-art alat proyek.' },
  { id: 'lights-out', title: 'Matikan Lampu Proyek', desc: 'Padamkan semua lampu proyek dengan logika toggle.' },
  { id: 'capit-crane', title: 'Capit Material', desc: 'Mesin capit: ambil material dari boks sebanyak mungkin.' },
  { id: 'sortir-material', title: 'Sortir Material', desc: 'Sortir material ke wadah yang benar secepat mungkin.' },
];

/** Satu entri katalog terpadu untuk jawaban chat. */
export interface GameCatalogEntry {
  id: string;
  title: string;
  desc: string;
  cat: GameCategory;
  meta?: string;
}

export const ALL_GAMES: GameCatalogEntry[] = [
  ...CONSTRUCTION_GAMES.map((g) => ({
    id: g.id, title: g.title, desc: g.tagline, cat: 'construction' as const, meta: g.meta,
  })),
  ...ARCADE_GAME_META.map((g) => ({
    id: g.id, title: g.title, desc: g.desc, cat: 'arcade' as const,
  })),
];

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Game yang DISEBUT dalam teks user — dicocokkan dari judul tampil dan
 * dari slug id ("pac-man" → "pac man", "bongkar-rumah" → "bongkar rumah").
 */
export function findGamesMentioned(text: string): GameCatalogEntry[] {
  const input = norm(text);
  if (!input) return [];
  return ALL_GAMES.filter((g) => {
    const title = norm(g.title);
    const slug = g.id.replace(/-/g, ' ');
    return input.includes(title) || (slug !== title && input.includes(slug));
  });
}

const GAME_WORD = /\b(game|games|permainan|gim)\b/;
const QUESTION_FRAMING =
  /\b(apa|ada|daftar|list|sebutkan|jelaskan|ceritakan|tentang|bagaimana|gimana|macam|jenis|semua|tersedia|punya|punya\?|saja|aja)\b/;

/**
 * Apakah pesan ini PERTANYAAN tentang game (bukan perintah membuka panel
 * — itu wilayah isGameCommand — dan bukan pernyataan biasa)? Perintah
 * owner 2026-11-01: pertanyaan apa pun tentang game dijawab ADA +
 * penjelasan katalog, jadi deteksi ini sengaja luas selama ada kata
 * game/judul game DAN bingkai tanya/daftar/penjelasan.
 */
export function isGameQuestion(rawInput: string): boolean {
  const input = norm(rawInput);
  if (!input) return false;
  const hasGameWord = GAME_WORD.test(input);
  const mentioned = findGamesMentioned(input).length > 0;
  if (!hasGameWord && !mentioned) return false;
  return QUESTION_FRAMING.test(input) || input.includes('?');
}

/**
 * Teks jawaban chat untuk intent GAME_INFO. Bila user menyebut game
 * tertentu, jawab game itu saja; selain itu daftar LENGKAP semua game
 * beserta isinya. Semua teks berasal dari katalog di atas — tidak ada
 * judul/deskripsi karangan.
 */
export function buildGameInfoAnswer(mentioned: GameCatalogEntry[]): string {
  if (mentioned.length > 0) {
    const parts = mentioned.map((g) =>
      `**${g.title}** (${g.cat === 'construction' ? 'Konstruksi' : 'Arcade'}) — ${g.desc}` +
      (g.meta ? `\n${g.meta}.` : ''),
    );
    return (
      'Ada, itu game di **EZRAB Game Space** 🎮\n\n' +
      parts.join('\n\n') +
      '\n\nMainnya langsung di chat ini — tekan tombol **Buka Game Space** di bawah, atau ketik "game", lalu pilih gamenya. Gratis, tanpa AI credits.'
    );
  }
  const cons = ALL_GAMES.filter((g) => g.cat === 'construction');
  const arc = ALL_GAMES.filter((g) => g.cat === 'arcade');
  const list = (games: GameCatalogEntry[]): string =>
    games.map((g, i) => `${i + 1}. **${g.title}** — ${g.desc}`).join('\n');
  return (
    `Ada! 🎮 EZRAB punya **EZRAB Game Space** — ${ALL_GAMES.length} mini-game yang bisa dimainkan langsung di chat ini. Gratis, berjalan lokal di perangkatmu, tanpa AI credits dan tanpa kuota.\n\n` +
    `**Game Konstruksi (${cons.length})**\n${list(cons)}\n\n` +
    `**Game Arcade (${arc.length})** — game klasik yang di-reskin total ke tema konstruksi\n${list(arc)}\n\n` +
    'Mau main? Tekan tombol **Buka Game Space** di bawah, atau ketik "game" kapan saja. Mau tanya isi game tertentu juga bisa — sebut saja judulnya, misalnya "game Pak Mandor tentang apa?".'
  );
}
