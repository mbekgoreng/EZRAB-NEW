/**
 * ARCADE 50 — manifest kartu game arcade versi ENHANCED, reskin total tema konstruksi.
 * Dipakai parent (GameSpaceOverlay) untuk membangun menu/kartu; parent mengintegrasikan
 * komponen gamenya sendiri. JANGAN commit/push dari sini.
 */
import artCandyCrush from './candy-crush/art.jpg';
import artPacMan from './pac-man/art.jpg';
import artChess from './chess/art.jpg';
import artDoodleJump from './doodle-jump/art.jpg';
import artSolitaire from './solitaire/art.jpg';
import artSudoku from './sudoku/art.jpg';
import artCrossyRoad from './crossy-road/art.jpg';
import artRockPaperScissors from './rock-paper-scissors/art.jpg';
import artFlappyBird from './flappy-bird/art.jpg';
import art2048 from './2048/art.jpg';
import artWordle from './wordle/art.jpg';
import artHangman from './hangman/art.jpg';
import artTowerBlocks from './tower-blocks/art.jpg';
import artArchery from './archery/art.jpg';
import artTicTacToe from './tic-tac-toe/art.jpg';
import artMinesweeper from './minesweeper/art.jpg';
import artSpeedTyping from './speed-typing/art.jpg';
import artBreakout from './breakout/art.jpg';
import artPingPong from './ping-pong/art.jpg';
import artTetris from './tetris/art.jpg';
import artMazeDrag from './maze-drag/art.jpg';
import artMemoryCard from './memory-card/art.jpg';
import artNumberGuessing from './number-guessing/art.jpg';
import artSnake from './snake/art.jpg';
import artConnectFour from './connect-four/art.jpg';
import artInsectCatch from './insect-catch/art.jpg';
import artTypingGame from './typing-game/art.jpg';
import artDiceRoll from './dice-roll/art.jpg';
import artShapeClicker from './shape-clicker/art.jpg';
import artFruitSlicer from './fruit-slicer/art.jpg';
import artQuiz from './quiz/art.jpg';
import artEmojiCatcher from './emoji-catcher/art.jpg';
import artWhackAMole from './whack-a-mole/art.jpg';
import artSimonSays from './simon-says/art.jpg';
import artSlidingPuzzle from './sliding-puzzle/art.jpg';
import artMastermind from './mastermind/art.jpg';
import artBlackjack from './blackjack/art.jpg';
import artBubbleShooter from './bubble-shooter/art.jpg';
import artCheckers from './checkers/art.jpg';
import artSpaceInvaders from './space-invaders/art.jpg';
import artAsteroids from './asteroids/art.jpg';
import artReversi from './reversi/art.jpg';
import artMahjongMatch from './mahjong-match/art.jpg';
import artFrogger from './frogger/art.jpg';
import artVideoPoker from './video-poker/art.jpg';
import artBattleship from './battleship/art.jpg';
import artNonogram from './nonogram/art.jpg';
import artLightsOut from './lights-out/art.jpg';
import artCapitCrane from './capit-crane/art.jpg';
import artSortirMaterial from './sortir-material/art.jpg';

export interface ArcadeGameMeta {
  id: string;
  title: string;
  desc: string;
  art: string;
}

export const ARCADE_GAMES: ArcadeGameMeta[] = [
  // ---- W1 ----
  { id: 'candy-crush', title: 'Material Match', desc: 'Cocokkan 3+ material bangunan (bata, semen, besi, kayu, kaca) beruntun.', art: artCandyCrush },
  { id: 'pac-man', title: 'Pak Mandor', desc: 'Jadi kepala mandor: makan helm di labirin sambil kabur dari Klien Revisi.', art: artPacMan },
  { id: 'chess', title: 'Catur Proyek', desc: 'Catur klasik — buah jadi peran proyek: mandor, arsitek, tower crane. AI level sedang.', art: artChess },
  { id: 'doodle-jump', title: 'Lompat Scaffolding', desc: 'Lompat setinggi mungkin di perancah, awas papan rapuh.', art: artDoodleJump },
  { id: 'solitaire', title: 'Solitaire Proyek', desc: 'Solitaire klasik dengan kartu bermotif proyek konstruksi.', art: artSolitaire },
  { id: 'sudoku', title: 'Sudoku Material', desc: 'Sudoku 9×9 dengan ikon material, bukan angka.', art: artSudoku },
  { id: 'crossy-road', title: 'Nyebrang Proyek', desc: 'Tuntun tukang menyeberang jalan proyek, hindari truk molen.', art: artCrossyRoad },
  { id: 'rock-paper-scissors', title: 'Suit Kontraktor', desc: 'Suit Bata vs Gergaji vs Gambar Kerja melawan AI.', art: artRockPaperScissors },
  { id: 'flappy-bird', title: 'Mandor Terbang', desc: 'Terbangkan mandor melewati celah crane raksasa.', art: artFlappyBird },
  { id: '2048', title: 'Cor 2048', desc: 'Gabung material: BATA → BATAKO → … sampai 2048.', art: art2048 },
  // ---- W2 ----
  { id: 'wordle', title: 'Kata Proyek', desc: 'Tebak kata konstruksi 5 huruf dalam 6 percobaan.', art: artWordle },
  { id: 'hangman', title: 'Selamatkan Tukang', desc: 'Tebak kata proyek — salah tebak, perancah roboh bertahap!', art: artHangman },
  { id: 'tower-blocks', title: 'Menara Lantai', desc: 'Susun lantai gedung 3D setinggi mungkin, jangan sampai ambruk.', art: artTowerBlocks },
  { id: 'archery', title: 'Tembak Paku', desc: 'Tembak nail gun ke papan triplek — perhitungkan tiupan angin.', art: artArchery },
  { id: 'tic-tac-toe', title: 'Bata vs Semen', desc: 'Tic-tac-toe bata melawan semen. AI sedang atau 2 pemain lokal.', art: artTicTacToe },
  { id: 'minesweeper', title: 'Cari Pipa Bocor', desc: 'Minesweeper: temukan pipa bocor tanpa meledakkannya.', art: artMinesweeper },
  { id: 'speed-typing', title: 'Ketik Cepat Estimator', desc: 'Ketik istilah proyek secepat mungkin sebelum waktu habis.', art: artSpeedTyping },
  { id: 'breakout', title: 'Bobok Tembok', desc: 'Pantul bola, bobok dinding bata lapis demi lapis.', art: artBreakout },
  { id: 'ping-pong', title: 'Tenis Sendok Semen', desc: 'Ping-pong pakai bet sendok semen melawan AI.', art: artPingPong },
  { id: 'tetris', title: 'Susun Bata', desc: 'Tetris ber-texture bata/besi/kayu — baris penuh jadi dinding kokoh.', art: artTetris },
  // ---- W3 ----
  { id: 'maze-drag', title: 'Labirin Gudang', desc: 'Seret helm melewati labirin gudang material sampai ke pintu keluar.', art: artMazeDrag },
  { id: 'memory-card', title: 'Pasangan Material', desc: 'Kartu memori: temukan pasangan material bangunan.', art: artMemoryCard },
  { id: 'number-guessing', title: 'Tebak Volume', desc: 'Tebak volume cor (m³) yang disembunyikan molen.', art: artNumberGuessing },
  { id: 'snake', title: 'Ular Kabel', desc: 'Ular kabel makan konektor — jangan sampai korslet.', art: artSnake },
  { id: 'connect-four', title: 'Sambung Pipa', desc: 'Connect four: sambung 4 pipa sejalur melawan AI.', art: artConnectFour },
  { id: 'insect-catch', title: 'Tangkap Perkakas', desc: 'Tangkap perkakas yang jatuh dari rak gudang sebelum menyentuh lantai.', art: artInsectCatch },
  { id: 'typing-game', title: 'Ketik Proyek', desc: 'Ketik kata proyek yang berjatuhan sebelum deadline jebol.', art: artTypingGame },
  { id: 'dice-roll', title: 'Dadu Proyek', desc: 'Lempar dadu proyek, adu hoki melawan AI.', art: artDiceRoll },
  { id: 'shape-clicker', title: 'Ketok Paku', desc: 'Klik paku yang nongol secepat mungkin — uji refleks tukang.', art: artShapeClicker },
  { id: 'fruit-slicer', title: 'Tebas Bambu', desc: 'Swipe untuk menebas bambu & material yang beterbangan.', art: artFruitSlicer },
  // ---- W4 ----
  { id: 'quiz', title: 'Kuis Tukang', desc: 'Kuis pengetahuan umum & dunia proyek ala tukang.', art: artQuiz },
  { id: 'emoji-catcher', title: 'Tangkap Helm', desc: 'Tangkap helm yang jatuh, hindari bata melayang.', art: artEmojiCatcher },
  { id: 'whack-a-mole', title: 'Pukul Paku', desc: 'Pukul paku yang nongol dari triplek secepatnya.', art: artWhackAMole },
  { id: 'simon-says', title: 'Ikuti Mandor', desc: 'Ikuti urutan aba-aba mandor yang makin panjang.', art: artSimonSays },
  { id: 'sliding-puzzle', title: 'Geser Keramik', desc: 'Geser keramik untuk menyusun gambar blueprint.', art: artSlidingPuzzle },
  { id: 'mastermind', title: 'Tebak Campuran', desc: 'Tebak komposisi campuran cor yang tepat.', art: artMastermind },
  { id: 'blackjack', title: 'Blackjack Meja Proyek', desc: 'Blackjack 21 di meja proyek — kalahkan bandar.', art: artBlackjack },
  { id: 'bubble-shooter', title: 'Tembak Semen', desc: 'Tembak gelembung semen, cocokkan 3 warna sejenis.', art: artBubbleShooter },
  { id: 'checkers', title: 'Dam Bata', desc: 'Dam/checkers berbidak bata melawan AI level sedang.', art: artCheckers },
  { id: 'space-invaders', title: 'Tembak Deadline', desc: 'Tembak deadline yang berjatuhan dari langit sebelum mendarat.', art: artSpaceInvaders },
  // ---- W5 ----
  { id: 'asteroids', title: 'Hujan Bata', desc: 'Hindari dan hancurkan hujan bata di area proyek.', art: artAsteroids },
  { id: 'reversi', title: 'Balik Triplek', desc: 'Reversi 8×8 berbidak keping triplek melawan AI level sedang.', art: artReversi },
  { id: 'mahjong-match', title: 'Ubin Material', desc: 'Mahjong: pasangkan ubin material yang sama.', art: artMahjongMatch },
  { id: 'frogger', title: 'Tukang Nyebrang', desc: 'Tuntun tukang menyeberangi sungai & jalan proyek yang ramai.', art: artFrogger },
  { id: 'video-poker', title: 'Video Poker Proyek', desc: 'Video poker draw 5 kartu bertema proyek.', art: artVideoPoker },
  { id: 'battleship', title: 'Perang Crane', desc: 'Tempatkan alat berat di lahan, bombardir markas lawan.', art: artBattleship },
  { id: 'nonogram', title: 'Bongkar Gambar', desc: 'Nonogram: ungkap pixel-art alat proyek.', art: artNonogram },
  { id: 'lights-out', title: 'Matikan Lampu Proyek', desc: 'Padamkan semua lampu proyek dengan logika toggle.', art: artLightsOut },
  { id: 'capit-crane', title: 'Capit Material', desc: 'Mesin capit: ambil material dari boks sebanyak mungkin.', art: artCapitCrane },
  { id: 'sortir-material', title: 'Sortir Material', desc: 'Sortir material ke wadah yang benar secepat mungkin.', art: artSortirMaterial },
];
