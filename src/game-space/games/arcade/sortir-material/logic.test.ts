/**
 * ArcadeSortirMaterial ("Sortir Material") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/sortir-material/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  fallSpeed, spawnInterval, pickKind, spawnItem, sortResult,
  scoreFor, levelAt, BINS, MAT_WEIGHTS, MAX_LIVES, START_FALL, START_SPAWN,
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

console.log('\n[1] fallSpeed & spawnInterval');
test('jatuh makin cepat', () => {
  assert.equal(fallSpeed(0), START_FALL);
  assert.ok(fallSpeed(60) > fallSpeed(0));
  assert.ok(fallSpeed(9999) > START_FALL);
});
test('spawn makin rapat tapi dijepit', () => {
  assert.equal(spawnInterval(0), START_SPAWN);
  assert.ok(spawnInterval(60) < START_SPAWN);
  const late = spawnInterval(9999);
  assert.ok(late >= 0.55 && late < START_SPAWN, `late=${late}`);
});

console.log('\n[2] pickKind & spawnItem');
test('semua jenis muncul', () => {
  let seed = 3;
  const rng = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const seen = new Set<string>();
  for (let i = 0; i < 500; i += 1) seen.add(pickKind(rng));
  for (const k of Object.keys(MAT_WEIGHTS)) assert.ok(seen.has(k), k);
});
test('spawnItem di salah satu lajur', () => {
  const lanes = [80, 195, 310];
  const it = spawnItem(() => 0.5, 9, lanes, -30);
  assert.ok(lanes.includes(it.x));
  assert.equal(it.id, 9);
  assert.equal(it.y, -30);
  assert.ok(it.variant >= 0 && it.variant <= 2);
});

console.log('\n[3] sortResult & scoreFor');
test('bin benar = correct', () => {
  assert.equal(sortResult('bata', 'bata'), 'correct');
  assert.equal(sortResult('kayu', 'kayu'), 'correct');
  assert.equal(sortResult('besi', 'besi'), 'correct');
});
test('bin salah = wrong', () => {
  assert.equal(sortResult('bata', 'kayu'), 'wrong');
  assert.equal(sortResult('besi', 'bata'), 'wrong');
});
test('skor naik dengan streak, dijepit', () => {
  assert.equal(scoreFor(1), 20);
  assert.ok(scoreFor(5) > scoreFor(1));
  assert.equal(scoreFor(999), 60);
});

console.log('\n[4] levelAt & konstanta');
test('level 1..5', () => {
  assert.equal(levelAt(0), 1);
  assert.equal(levelAt(24), 1);
  assert.equal(levelAt(25), 2);
  assert.equal(levelAt(999), 5);
});
test('3 bin terdefinisi & 3 nyawa', () => {
  assert.equal(Object.keys(BINS).length, 3);
  assert.equal(MAX_LIVES, 3);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed > 0 ? `: ${failures.join(', ')}` : ''}`);
process.exit(failed > 0 ? 1 : 0);
