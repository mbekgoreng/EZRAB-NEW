import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import Bhangman from '../__k7before__/src/game-space/games/arcade/hangman/ArcadeHangman';
import Blights from '../__k7before__/src/game-space/games/arcade/lights-out/ArcadeLightsOut';
import Bmaze from '../__k7before__/src/game-space/games/arcade/maze-drag/ArcadeMazeDrag';
import Bguess from '../__k7before__/src/game-space/games/arcade/number-guessing/ArcadeNumberGuessing';
import Bdice from '../__k7before__/src/game-space/games/arcade/dice-roll/ArcadeDaduProyek';
import Bslide from '../__k7before__/src/game-space/games/arcade/sliding-puzzle/ArcadeSlidingPuzzle';
import Bbubble from '../__k7before__/src/game-space/games/arcade/bubble-shooter/ArcadeBubbleShooter';
import Bquiz from '../__k7before__/src/game-space/games/arcade/quiz/ArcadeQuiz';
import Bsimon from '../__k7before__/src/game-space/games/arcade/simon-says/ArcadeSimonSays';
import Brps from '../__k7before__/src/game-space/games/arcade/rock-paper-scissors/ArcadeRockPaperScissors';

import Ahangman from '../../game-space/games/arcade/hangman/ArcadeHangman';
import Alights from '../../game-space/games/arcade/lights-out/ArcadeLightsOut';
import Amaze from '../../game-space/games/arcade/maze-drag/ArcadeMazeDrag';
import Aguess from '../../game-space/games/arcade/number-guessing/ArcadeNumberGuessing';
import Adice from '../../game-space/games/arcade/dice-roll/ArcadeDaduProyek';
import Aslide from '../../game-space/games/arcade/sliding-puzzle/ArcadeSlidingPuzzle';
import Abubble from '../../game-space/games/arcade/bubble-shooter/ArcadeBubbleShooter';
import Aquiz from '../../game-space/games/arcade/quiz/ArcadeQuiz';
import Asimon from '../../game-space/games/arcade/simon-says/ArcadeSimonSays';
import Arps from '../../game-space/games/arcade/rock-paper-scissors/ArcadeRockPaperScissors';

const GAMES: Record<string, { b: React.ComponentType<{ onExit: () => void }>; a: React.ComponentType<{ onExit: () => void }> }> = {
  hangman: { b: Bhangman, a: Ahangman },
  'lights-out': { b: Blights, a: Alights },
  'maze-drag': { b: Bmaze, a: Amaze },
  'number-guessing': { b: Bguess, a: Aguess },
  'dice-roll': { b: Bdice, a: Adice },
  'sliding-puzzle': { b: Bslide, a: Aslide },
  'bubble-shooter': { b: Bbubble, a: Abubble },
  quiz: { b: Bquiz, a: Aquiz },
  'simon-says': { b: Bsimon, a: Asimon },
  'rock-paper-scissors': { b: Brps, a: Arps },
};

function App(): React.JSX.Element {
  const q = new URLSearchParams(window.location.search);
  const name = q.get('game') ?? 'hangman';
  const side = q.get('side') ?? 'after';
  const entry = GAMES[name] ?? GAMES.hangman;
  const Comp = side === 'before' ? entry.b : entry.a;
  const [, setN] = useState(0);
  return (
    <div style={{ width: 480, height: 800, margin: '0 auto', background: '#0b1226' }}>
      <Comp onExit={() => setN((x) => x + 1)} />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
