/**
 * ArcadeSnake ("Ular Kabel") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/snake/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createGame, step, turn, freeCell, stepInterval, gradeFor,
  COLS, ROWS, DIRS, GOLD_DURATION,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

// rng deterministik berurutan
function seqRng(values: number[]): () => number {
  let k = 0;
  return () => values[k++ % values.length];
}

console.log('\n[1] createGame');
test('ular awal 3 segmen di tengah', () => {
  const st = createGame(() => 0.5);
  assert.equal(st.snake.length, 3);
  assert.deepEqual(st.dir, DIRS.right);
  assert.ok(!st.dead);
  assert.equal(st.score, 0);
});
test('makanan tidak menimpa ular', () => {
  const st = createGame(() => 0.1);
  assert.ok(!st.snake.some((s) => s.x === st.food.x && s.y === st.food.y));
});
test('freeCell hindari ular', () => {
  const st = createGame(() => 0.9);
  const c = freeCell(st.snake, () => 0.3);
  assert.ok(!st.snake.some((s) => s.x === c.x && s.y === c.y));
  assert.ok(c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS);
});

console.log('\n[2] step & turn');
test('maju satu sel', () => {
  const st = createGame(seqRng([0.5, 0.5]));
  st.food = { x: 0, y: 0 }; // jauh dari jalur
  const hx = st.snake[0].x;
  const ev = step(st, () => 0.5);
  assert.equal(ev, 'moved');
  assert.equal(st.snake[0].x, hx + 1);
  assert.equal(st.snake.length, 3);
});
test('belok valid, tolak 180°', () => {
  const st = createGame(() => 0.5);
  turn(st, DIRS.left); // 180° dari right → ditolak
  assert.equal(st.pendingDir, null);
  turn(st, DIRS.up);
  assert.deepEqual(st.pendingDir, DIRS.up);
});
test('makan konektor → tumbuh & +10', () => {
  const st = createGame(seqRng([0.5, 0.99, 0.99]));
  st.food = { x: st.snake[0].x + 1, y: st.snake[0].y }; // tepat di depan
  const ev = step(st, seqRng([0.99, 0.99]));
  assert.equal(ev, 'ate');
  assert.equal(st.snake.length, 4);
  assert.equal(st.score, 10);
  assert.equal(st.eaten, 1);
});
test('nabrak pagar → mati', () => {
  const st = createGame(() => 0.5);
  st.snake = [{ x: COLS - 1, y: 5 }, { x: COLS - 2, y: 5 }, { x: COLS - 3, y: 5 }];
  st.dir = { ...DIRS.right };
  st.food = { x: 0, y: 0 };
  const ev = step(st, () => 0.5);
  assert.equal(ev, 'died');
  assert.ok(st.dead);
});
test('gigit badan → mati', () => {
  const st = createGame(() => 0.5);
  // bentuk U: kepala akan menabrak badan saat belok kiri
  st.snake = [
    { x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 },
  ];
  st.dir = { ...DIRS.down };
  st.pendingDir = { ...DIRS.left };
  st.food = { x: 0, y: 0 };
  const ev = step(st, () => 0.5);
  assert.equal(ev, 'died');
});
test('makan konektor emas → +25', () => {
  const st = createGame(() => 0.5);
  st.gold = { x: st.snake[0].x + 1, y: st.snake[0].y };
  st.goldT = GOLD_DURATION;
  st.food = { x: 0, y: 0 };
  const ev = step(st, () => 0.5);
  assert.equal(ev, 'ate-gold');
  assert.equal(st.score, 25);
  assert.equal(st.gold, null);
});

console.log('\n[3] stepInterval & gradeFor');
test('makin cepat seiring makan', () => {
  assert.ok(stepInterval(30) < stepInterval(0));
  assert.ok(stepInterval(999) >= 0.08);
});
test('grade S..D', () => {
  assert.equal(gradeFor(450), 'S');
  assert.equal(gradeFor(300), 'A');
  assert.equal(gradeFor(200), 'B');
  assert.equal(gradeFor(100), 'C');
  assert.equal(gradeFor(0), 'D');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
