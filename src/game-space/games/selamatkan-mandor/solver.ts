/**
 * Selamatkan Mandor — reference solutions + headless solver proof.
 *
 * Each level ships with ONE hand-designed reference polyline (the shape a
 * good player would draw). The solver feeds that polyline through the
 * REAL input path (setLine → smoothing → ink trim → beam segments) and
 * steps the real simulation to the end, recording: win/dead, death cause,
 * ink used vs budget and the star rating the reference earns.
 *
 * Also provides the naive flat-umbrella shape used to prove that the old
 * "sketch an umbrella and wait" strategy now FAILS on feature levels.
 *
 * Pure module (no DOM) so tests and tooling can import it directly.
 */
import {
  createState, step, setLine, inkLeft, starsFor, LEVELS,
  type MandorState, type Vec,
} from './logic';

export const SOLVER_W = 390;
export const SOLVER_H = 700;

export interface SolutionResult {
  levelIndex: number;
  name: string;
  status: 'win' | 'dead' | 'play';
  deathCause: string | null;
  inkUsed: number;
  inkMax: number;
  inkLeftFrac: number;
  stars: number;
  segsTotal: number;
  segsBroken: number;
  timeDied: number | null;
}

/** Polyline builders — coordinates in fractions, converted per canvas. */
type Pt = [number, number];
function P(W: number, H: number, pts: Pt[]): Vec[] {
  return pts.map(([fx, fy]) => ({ x: fx * W, y: fy * H }));
}

/** y of the protectee head-top zone (roof line) at solver resolution */
const HEAD = 0.795; // just above the helmets (foreman.y - r - ~55px)
/** cage wall bottom (near the ground) */
const FOOT = 0.885;

/**
 * Reference solution per level index. Design language:
 *  - classic levels: a modest peaked roof (short spans, ends anchored in
 *    the protectee zone / near scaffold tops).
 *  - platform levels: roof ENDS land on the scaffold tops (support), with
 *    pillars where a scaffold crumbles.
 *  - side levels: CAGE (roof + both walls down) around the protectee.
 *  - switch levels: cage for the foreman + a small guard roof/wall for
 *    the switch box on the right.
 *  - two-protectee levels: wide roof with a centre pillar between the
 *    two workers (mid-support!), or twin cages when side hazards fly.
 */
export const REFERENCE_SOLUTIONS: Record<number, (W: number, H: number) => Vec[]> = {
  // L1 Apel Pagi — small peaked roof
  0: (W, H) => P(W, H, [[0.30, 0.83], [0.42, HEAD], [0.58, HEAD], [0.70, 0.83]]),
  // L2 Shift Pagi
  1: (W, H) => P(W, H, [[0.28, 0.83], [0.40, HEAD], [0.60, HEAD], [0.72, 0.83]]),
  // L3 Tukang Lupa Helm
  2: (W, H) => P(W, H, [[0.26, 0.84], [0.38, HEAD], [0.62, HEAD], [0.74, 0.84]]),
  // L4 Angin Kencang — sloped ramp roof sheds drifting pipes sideways
  3: (W, H) => P(W, H, [[0.24, 0.845], [0.38, HEAD], [0.55, 0.815], [0.68, 0.845], [0.80, 0.875]]),
  // L5 Perancah Tua — ends rest on both scaffold tops; right scaffold
  // crumbles, but by then its rain has passed / roof sags onto pillar zone
  4: (W, H) => P(W, H, [[0.24, 0.845], [0.30, 0.735], [0.44, 0.715], [0.58, 0.735], [0.70, 0.735], [0.76, 0.845]]),
  // L6 Tetangga Melempar — full cage
  5: (W, H) => P(W, H, [[0.30, FOOT], [0.30, 0.815], [0.40, HEAD], [0.60, HEAD], [0.70, 0.815], [0.70, FOOT]]),
  // L7 Jembatan Darurat — roof over centre scaffold + pillars both sides
  // (when the scaffold crumbles, the pillars keep the spans short)
  6: (W, H) => P(W, H, [[0.30, FOOT], [0.31, 0.80], [0.42, 0.705], [0.58, 0.705], [0.69, 0.80], [0.70, FOOT]]),
  // L8 Badai Samping — cage, slightly wider
  7: (W, H) => P(W, H, [[0.28, FOOT], [0.28, 0.815], [0.40, HEAD], [0.60, HEAD], [0.72, 0.815], [0.72, FOOT]]),
  // L9 Dua Kepala — wide roof, centre pillar between the workers, ends
  // propped in each worker's anchor zone
  8: (W, H) => P(W, H, [
    [0.10, 0.845], [0.16, HEAD], [0.30, HEAD], [0.36, 0.815], [0.365, FOOT],
    [0.37, 0.815], [0.44, HEAD], [0.60, HEAD], [0.68, 0.845],
  ]),
  // L10 Sakelar Merah — foreman cage + guard over the switch
  9: (W, H) => P(W, H, [
    [0.32, FOOT], [0.32, 0.815], [0.42, HEAD], [0.58, HEAD], [0.66, 0.83],
    [0.74, 0.845], [0.79, 0.79], [0.86, 0.765], [0.93, 0.79], [0.965, 0.85],
  ]),
  // L11 Perancah Runtuh — pillars next to the foreman, NO reliance on
  // the crumbling scaffolds; short steep roof
  10: (W, H) => P(W, H, [[0.33, FOOT], [0.34, 0.815], [0.42, 0.765], [0.58, 0.765], [0.66, 0.815], [0.67, FOOT]]),
  // L12 Pasukan Dua Baris — twin cages joined by a short bridge
  11: (W, H) => P(W, H, [
    [0.08, FOOT], [0.08, 0.825], [0.15, HEAD], [0.29, HEAD], [0.335, 0.83],
    [0.40, HEAD], [0.56, HEAD], [0.63, 0.83], [0.68, FOOT],
  ]),
  // L13 Genset Terancam — big cage roof over foreman + long guard to the
  // switch, right wall at the switch
  12: (W, H) => P(W, H, [
    [0.30, FOOT], [0.30, 0.81], [0.40, HEAD], [0.58, HEAD], [0.68, 0.815],
    [0.78, 0.79], [0.86, 0.765], [0.93, 0.795], [0.945, FOOT],
  ]),
  // L14 Badai Total — twin cages + switch guard, one continuous line
  13: (W, H) => P(W, H, [
    [0.08, FOOT], [0.08, 0.825], [0.15, HEAD], [0.29, HEAD], [0.335, 0.83],
    [0.40, HEAD], [0.56, HEAD], [0.64, 0.815], [0.74, 0.79], [0.86, 0.765],
    [0.93, 0.795], [0.945, FOOT],
  ]),
  // L15 Serah Terima Akbar — like L14, roof slightly higher (heavier rain)
  14: (W, H) => P(W, H, [
    [0.08, FOOT], [0.08, 0.82], [0.15, 0.785], [0.29, 0.785], [0.335, 0.82],
    [0.40, 0.785], [0.56, 0.785], [0.64, 0.81], [0.74, 0.785], [0.86, 0.76],
    [0.93, 0.79], [0.945, FOOT],
  ]),
};

/** The old winning move: one wide flat umbrella above the foreman only. */
export function naiveUmbrella(W: number, H: number): Vec[] {
  const pts: Vec[] = [];
  const N = 25;
  const minX = 0.08 * W;
  const maxX = 0.92 * W;
  const fy = 0.878 * H; // foreman.y at solver resolution
  for (let k = 0; k < N; k += 1) {
    const t = k / (N - 1);
    pts.push({
      x: minX + (maxX - minX) * t,
      y: fy - 110 - 60 * (1 - Math.pow(2 * t - 1, 2)),
    });
  }
  return pts;
}

export function runSolution(
  levelIndex: number,
  linePts: Vec[],
  W: number = SOLVER_W,
  H: number = SOLVER_H,
): SolutionResult {
  const s: MandorState = createState(levelIndex, W, H);
  setLine(s, linePts);
  const segsTotal = s.segs.length;
  let timeDied: number | null = null;
  const maxSteps = Math.ceil((s.level.duration + 2) * 60);
  for (let k = 0; k < maxSteps; k += 1) {
    const st: MandorState['status'] = s.status;
    if (st !== 'play') break;
    step(s, 1 / 60);
    if (s.status === 'dead' && timeDied === null) timeDied = s.time;
  }
  const broken = segsTotal - s.segs.length;
  return {
    levelIndex,
    name: LEVELS[levelIndex].name,
    status: s.status,
    deathCause: s.deathCause,
    inkUsed: Math.round(s.inkUsed),
    inkMax: s.inkMax,
    inkLeftFrac: s.inkMax > 0 ? inkLeft(s) / s.inkMax : 0,
    stars: s.status === 'win' ? starsFor(s) : 0,
    segsTotal,
    segsBroken: Math.max(0, broken),
    timeDied,
  };
}

export function solveReference(levelIndex: number): SolutionResult {
  const build = REFERENCE_SOLUTIONS[levelIndex];
  if (!build) throw new Error(`no reference solution for level ${levelIndex + 1}`);
  return runSolution(levelIndex, build(SOLVER_W, SOLVER_H));
}

export function solveNaive(levelIndex: number): SolutionResult {
  return runSolution(levelIndex, naiveUmbrella(SOLVER_W, SOLVER_H));
}
