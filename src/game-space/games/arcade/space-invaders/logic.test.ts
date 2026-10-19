/**
 * ArcadeSpaceInvaders ("Tembak Deadline") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/space-invaders/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  DEADLINES, waveSpec, scoreForRow, UFO_SCORE, speedFactor,
  rectsOverlap, makeShield, erodeShield, shieldAlive, MAX_LIVES,
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

console.log('\n[1] waveSpec');
test('wave 1: 3 baris, 8 kolom', () => {
  const w = waveSpec(1);
  assert.equal(w.rows, 3);
  assert.equal(w.cols, 8);
});
test('makin tinggi wave: baris & kecepatan naik, fire makin rapat', () => {
  const a = waveSpec(1);
  const b = waveSpec(6);
  assert.ok(b.rows >= a.rows);
  assert.ok(b.xSpeed > a.xSpeed);
  assert.ok(b.fireInterval < a.fireInterval);
  assert.ok(b.rows <= 5);
});
test('ada 5 label deadline', () => {
  assert.equal(DEADLINES.length, 5);
  assert.ok(new Set(DEADLINES).size === 5);
});

console.log('\n[2] skor');
test('scoreForRow: atas 30, lalu 20, sisanya 10', () => {
  assert.equal(scoreForRow(0), 30);
  assert.equal(scoreForRow(1), 20);
  assert.equal(scoreForRow(2), 10);
  assert.equal(scoreForRow(4), 10);
});
test('UFO_SCORE = 200', () => {
  assert.equal(UFO_SCORE, 200);
});

console.log('\n[3] speedFactor');
test('penuh = 1, sekarat > 1', () => {
  assert.equal(speedFactor(40, 40), 1);
  assert.ok(speedFactor(5, 40) > 1.5);
  assert.equal(speedFactor(10, 0), 1);
});

console.log('\n[4] rectsOverlap');
test('tumpang tindih & tidak', () => {
  assert.ok(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 }));
  assert.ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 11, w: 10, h: 10 }));
});

console.log('\n[5] shield');
test('makeShield penuh true', () => {
  const sh = makeShield(6, 4);
  assert.equal(sh.length, 4);
  assert.ok(sh.every((r) => r.every((v) => v)));
});
test('erodeShield melubangi lingkaran', () => {
  const sh = makeShield(9, 7);
  erodeShield(sh, 4, 3, 2);
  assert.equal(sh[3][4], false);
  assert.equal(sh[0][0], true); // jauh → utuh
});
test('shieldAlive', () => {
  const sh = makeShield(3, 2);
  assert.ok(shieldAlive(sh));
  erodeShield(sh, 1, 1, 10);
  assert.ok(!shieldAlive(sh));
});

console.log('\n[6] nyawa');
test('MAX_LIVES = 3', () => {
  assert.equal(MAX_LIVES, 3);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
