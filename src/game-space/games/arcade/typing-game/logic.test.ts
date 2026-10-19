/**
 * ArcadeTypingGame ("Ketik Proyek") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/typing-game/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  WORDS, levelFor, fallSpeedAt, spawnDelayAt, pickWord, wordPoints,
  matchesNext, gradeFor, WORDS_PER_LEVEL,
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

console.log('\n[1] WORDS');
test('bank kata: hanya huruf kapital, tanpa spasi', () => {
  assert.ok(WORDS.length >= 30);
  assert.ok(WORDS.every((w) => /^[A-Z]+$/.test(w)), 'semua kata huruf kapital tanpa spasi');
  assert.ok(new Set(WORDS).size === WORDS.length, 'tidak ada duplikat');
});

console.log('\n[2] levelFor, fallSpeedAt, spawnDelayAt');
test('level naik tiap 8 kata', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(WORDS_PER_LEVEL), 2);
});
test('jatuh makin cepat, spawn makin rapat', () => {
  assert.ok(fallSpeedAt(5) > fallSpeedAt(1));
  assert.ok(spawnDelayAt(5) < spawnDelayAt(1));
  assert.ok(spawnDelayAt(99) >= 1.0);
});

console.log('\n[3] pickWord');
test('tidak mengulang kata yang aktif', () => {
  const active = new Set(['SEMEN', 'BETON']);
  for (let i = 0; i < 20; i += 1) {
    const w = pickWord(() => 0.3, active);
    assert.ok(!active.has(w));
  }
});
test('kata valid dari bank', () => {
  const w = pickWord(() => 0.0, new Set());
  assert.ok(WORDS.includes(w));
});

console.log('\n[4] wordPoints & matchesNext');
test('poin: 5/huruf + bonus kecepatan', () => {
  assert.ok(wordPoints('SEMEN', 0) > wordPoints('SEMEN', 0.9));
  assert.equal(wordPoints('AB', 1), 10);
});
test('cocok huruf berikutnya', () => {
  assert.ok(matchesNext('SEMEN', 0, 'S'));
  assert.ok(matchesNext('SEMEN', 1, 'E'));
  assert.ok(!matchesNext('SEMEN', 0, 'E'));
  assert.ok(!matchesNext('SEMEN', 2, 's'));
});

console.log('\n[5] gradeFor');
test('grade S..D', () => {
  assert.equal(gradeFor(950), 'S');
  assert.equal(gradeFor(650), 'A');
  assert.equal(gradeFor(450), 'B');
  assert.equal(gradeFor(250), 'C');
  assert.equal(gradeFor(10), 'D');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
