/**
 * ArcadeFruitSlicer ("Tebas Bambu") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/fruit-slicer/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  bombChanceAt, spawnDelayAt, nextKind, slicePoints, nextCombo,
  gradeFor, GAME_DURATION, KIND_META,
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

console.log('\n[1] bombChanceAt & spawnDelayAt');
test('dinamit makin sering di akhir', () => {
  assert.ok(bombChanceAt(55) > bombChanceAt(5));
  assert.ok(bombChanceAt(0) >= 0.05 && bombChanceAt(GAME_DURATION) <= 0.25);
});
test('spawn makin rapat', () => {
  assert.ok(spawnDelayAt(55, () => 0.5) < spawnDelayAt(5, () => 0.5));
  assert.ok(spawnDelayAt(0, () => 0.5) > 0);
});

console.log('\n[2] nextKind');
test('semua jenis bisa muncul', () => {
  const seen = new Set<string>();
  let s = 0;
  for (let i = 0; i < 400; i += 1) {
    seen.add(nextKind(10, () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }));
  }
  for (const k of ['bambu', 'kayu', 'triplek', 'emas', 'dinamit']) {
    assert.ok(seen.has(k), `jenis ${k} tak pernah muncul`);
  }
});
test('batas deterministik: rng kecil → dinamit', () => {
  assert.equal(nextKind(10, () => 0.001), 'dinamit');
});
test('meta lengkap untuk semua jenis', () => {
  for (const k of Object.keys(KIND_META) as Array<keyof typeof KIND_META>) {
    assert.ok(KIND_META[k].icon.length > 0);
    assert.ok(KIND_META[k].name.length > 0);
  }
});

console.log('\n[3] slicePoints & nextCombo');
test('poin dasar sesuai jenis', () => {
  assert.equal(slicePoints('bambu', 0), 10);
  assert.equal(slicePoints('kayu', 0), 15);
  assert.equal(slicePoints('triplek', 0), 20);
  assert.equal(slicePoints('emas', 0), 50);
});
test('kombo ≥3 → ×2, ≥6 → ×3', () => {
  assert.equal(slicePoints('bambu', 3), 20);
  assert.equal(slicePoints('bambu', 6), 30);
  assert.equal(slicePoints('bambu', 2), 10);
});
test('kombo lanjut bila cepat, reset bila lambat', () => {
  assert.equal(nextCombo(4, 1.0), 5);
  assert.equal(nextCombo(4, 1.6), 5);
  assert.equal(nextCombo(4, 2.5), 1);
});

console.log('\n[4] gradeFor');
test('grade S..D', () => {
  assert.equal(gradeFor(1600), 'S');
  assert.equal(gradeFor(1100), 'A');
  assert.equal(gradeFor(700), 'B');
  assert.equal(gradeFor(400), 'C');
  assert.equal(gradeFor(50), 'D');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
