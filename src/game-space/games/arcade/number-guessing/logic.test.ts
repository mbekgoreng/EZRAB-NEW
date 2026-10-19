/**
 * ArcadeNumberGuessing ("Tebak Volume") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/number-guessing/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  newTarget, heatFor, heatLabel, directionHint, scoreFor, parseGuess,
  MIN_VOL, MAX_VOL, MAX_ATTEMPTS,
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

console.log('\n[1] newTarget');
test('target dalam 1..50', () => {
  for (let i = 0; i < 100; i += 1) {
    const t = newTarget(() => i / 100);
    assert.ok(t >= MIN_VOL && t <= MAX_VOL, `target ${t} di luar batas`);
    assert.ok(Number.isInteger(t));
  }
  assert.equal(newTarget(() => 0), MIN_VOL);
  assert.equal(newTarget(() => 0.9999), MAX_VOL);
});

console.log('\n[2] heatFor');
test('batas panas/dingin', () => {
  assert.equal(heatFor(20, 20), 'tepat');
  assert.equal(heatFor(22, 20), 'panas');
  assert.equal(heatFor(18, 20), 'panas');
  assert.equal(heatFor(25, 20), 'hangat');
  assert.equal(heatFor(15, 20), 'hangat');
  assert.equal(heatFor(32, 20), 'dingin');
  assert.equal(heatFor(8, 20), 'dingin');
  assert.equal(heatFor(40, 20), 'beku');
  assert.equal(heatFor(1, 50), 'beku');
});
test('label berisi Bahasa Indonesia', () => {
  assert.ok(heatLabel('panas').includes('PANAS'));
  assert.ok(heatLabel('beku').includes('BEKU'));
  assert.ok(heatLabel('tepat').includes('TEPAT'));
});

console.log('\n[3] directionHint');
test('arah kurang/lebih', () => {
  assert.ok(directionHint(10, 20).includes('Kurang'));
  assert.ok(directionHint(30, 20).includes('Kelebihan'));
  assert.equal(directionHint(20, 20), '');
});

console.log('\n[4] scoreFor');
test('makin sedikit tebakan makin besar', () => {
  assert.ok(scoreFor(1) > scoreFor(8));
  assert.equal(scoreFor(1), 100);
  assert.ok(scoreFor(99) >= 10);
});

console.log('\n[5] parseGuess');
test('input valid', () => {
  const r = parseGuess(' 25 ');
  assert.ok(r.ok && r.value === 25);
});
test('input ditolak dengan pesan Indonesia', () => {
  const e1 = parseGuess('');
  assert.ok(!e1.ok && (e1 as { error: string }).error.length > 0);
  const e2 = parseGuess('abc');
  assert.ok(!e2.ok);
  const e3 = parseGuess('99');
  assert.ok(!e3.ok && (e3 as { error: string }).error.includes('50'));
  const e4 = parseGuess('12.5');
  assert.ok(!e4.ok);
  const e5 = parseGuess('0');
  assert.ok(!e5.ok);
});
test('koma desimal Indonesia ditolak (harus bulat)', () => {
  const r = parseGuess('12,5');
  assert.ok(!r.ok);
});

console.log(`\n[6] konstanta`);
test('8 kesempatan', () => {
  assert.equal(MAX_ATTEMPTS, 8);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
