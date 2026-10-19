/**
 * ArcadeBreakout ("Bobok Tembok") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/breakout/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createLevel, stepBall, circleRectHit, reflect, bouncePaddle, powerForBrick,
  ballSpeed, KIND_HP, KIND_SCORE,
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

console.log('\n[1] createLevel');
test('jumlah bata = cols*rows, hp sesuai kind', () => {
  const bricks = createLevel(0, 8, 5, () => 0.9);
  assert.equal(bricks.length, 40);
  for (const b of bricks) assert.equal(b.hp, KIND_HP[b.kind]);
});
test('level tinggi lebih banyak bata keras', () => {
  let hard0 = 0;
  let hard9 = 0;
  for (const b of createLevel(0, 8, 5, () => 0.5)) if (b.kind !== 'bata') hard0 += 1;
  for (const b of createLevel(9, 8, 5, () => 0.5)) if (b.kind !== 'bata') hard9 += 1;
  assert.ok(hard9 >= hard0);
});
test('id unik', () => {
  const ids = createLevel(3, 8, 5, Math.random).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

console.log('\n[2] stepBall');
test('bergerak sesuai kecepatan*dt', () => {
  const b = stepBall({ x: 0, y: 0, vx: 100, vy: -50, r: 5 }, 0.5);
  assert.equal(b.x, 50);
  assert.equal(b.y, -25);
  assert.equal(b.r, 5);
});

console.log('\n[3] circleRectHit');
test('kena dari atas', () => {
  const r = circleRectHit({ x: 50, y: 44, vx: 0, vy: 10, r: 8 }, { x: 0, y: 50, w: 100, h: 20 });
  assert.equal(r, 'top');
});
test('kena dari kiri', () => {
  const r = circleRectHit({ x: 44, y: 60, vx: 10, vy: 0, r: 8 }, { x: 50, y: 50, w: 100, h: 20 });
  assert.equal(r, 'left');
});
test('tidak kena -> null', () => {
  const r = circleRectHit({ x: 200, y: 200, vx: 0, vy: 0, r: 5 }, { x: 0, y: 0, w: 10, h: 10 });
  assert.equal(r, null);
});

console.log('\n[4] reflect');
test('pantulan atas membalik vy', () => {
  const b = reflect({ x: 0, y: 0, vx: 3, vy: 5, r: 5 }, 'top');
  assert.equal(b.vy, -5);
  assert.equal(b.vx, 3);
});
test('pantulan kiri membalik vx', () => {
  const b = reflect({ x: 0, y: 0, vx: 3, vy: 5, r: 5 }, 'left');
  assert.equal(b.vx, -3);
  assert.equal(b.vy, 5);
});

console.log('\n[5] bouncePaddle');
test('kena tengah -> hampir vertikal', () => {
  const b = bouncePaddle({ x: 50, y: 0, vx: 0, vy: 100, r: 5 }, { x: 0, y: 100, w: 100 });
  assert.ok(Math.abs(b.vx) < 1e-9);
  assert.ok(b.vy < 0);
});
test('kena ujung -> menyamping', () => {
  const b = bouncePaddle({ x: 95, y: 0, vx: 0, vy: 100, r: 5 }, { x: 0, y: 100, w: 100 });
  assert.ok(Math.abs(b.vx) > 50);
  assert.ok(b.vy < 0);
});
test('kecepatan dipertahankan', () => {
  const b = bouncePaddle({ x: 50, y: 0, vx: 60, vy: 80, r: 5 }, { x: 0, y: 100, w: 100 });
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 100) < 1e-9);
});

console.log('\n[6] powerForBrick & ballSpeed');
test('22% peluang powerup', () => {
  assert.equal(powerForBrick(() => 0.5), null);
  assert.ok(powerForBrick(() => 0.1) !== null);
});
test('bola makin cepat tiap level', () => {
  assert.ok(ballSpeed(3) > ballSpeed(0));
  assert.ok(ballSpeed(0) > 0);
});
test('skor kind konsisten', () => {
  assert.ok(KIND_SCORE.beton > KIND_SCORE.hebel && KIND_SCORE.hebel > KIND_SCORE.bata);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
