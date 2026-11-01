/**
 * ARCADE 50 — manifest kartu game arcade versi ENHANCED, reskin total tema konstruksi.
 * Dipakai parent (GameSpaceOverlay) untuk membangun menu/kartu; parent mengintegrasikan
 * komponen gamenya sendiri. JANGAN commit/push dari sini.
 *
 * Teks katalog (id/judul/deskripsi) berasal dari SUMBER TUNGGAL
 * src/game-space/catalog.ts (ARCADE_GAME_META) — file ini hanya memasangkan
 * art per id. Chat AI membaca katalog yang sama dari catalog.ts.
 */
import { ARCADE_GAME_META } from '../../catalog';
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

const ART_BY_ID: Record<string, string> = {
  'candy-crush': artCandyCrush,
  'pac-man': artPacMan,
  'chess': artChess,
  'doodle-jump': artDoodleJump,
  'solitaire': artSolitaire,
  'sudoku': artSudoku,
  'crossy-road': artCrossyRoad,
  'rock-paper-scissors': artRockPaperScissors,
  'flappy-bird': artFlappyBird,
  '2048': art2048,
  'wordle': artWordle,
  'hangman': artHangman,
  'tower-blocks': artTowerBlocks,
  'archery': artArchery,
  'tic-tac-toe': artTicTacToe,
  'minesweeper': artMinesweeper,
  'speed-typing': artSpeedTyping,
  'breakout': artBreakout,
  'ping-pong': artPingPong,
  'tetris': artTetris,
  'maze-drag': artMazeDrag,
  'memory-card': artMemoryCard,
  'number-guessing': artNumberGuessing,
  'snake': artSnake,
  'connect-four': artConnectFour,
  'insect-catch': artInsectCatch,
  'typing-game': artTypingGame,
  'dice-roll': artDiceRoll,
  'shape-clicker': artShapeClicker,
  'fruit-slicer': artFruitSlicer,
  'quiz': artQuiz,
  'emoji-catcher': artEmojiCatcher,
  'whack-a-mole': artWhackAMole,
  'simon-says': artSimonSays,
  'sliding-puzzle': artSlidingPuzzle,
  'mastermind': artMastermind,
  'blackjack': artBlackjack,
  'bubble-shooter': artBubbleShooter,
  'checkers': artCheckers,
  'space-invaders': artSpaceInvaders,
  'asteroids': artAsteroids,
  'reversi': artReversi,
  'mahjong-match': artMahjongMatch,
  'frogger': artFrogger,
  'video-poker': artVideoPoker,
  'battleship': artBattleship,
  'nonogram': artNonogram,
  'lights-out': artLightsOut,
  'capit-crane': artCapitCrane,
  'sortir-material': artSortirMaterial,
};

export const ARCADE_GAMES: ArcadeGameMeta[] = ARCADE_GAME_META.map((g) => ({
  ...g,
  art: ART_BY_ID[g.id],
}));
