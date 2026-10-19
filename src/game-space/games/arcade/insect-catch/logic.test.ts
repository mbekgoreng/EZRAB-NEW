/**
 * ArcadeInsectCatch ("Tangkap Perkakas") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/insect-catch/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  nextTool, fallSpeedAt, spawnDelayAt, tapPoints, gradeFor,
  GOLD_CHANCE, TOOL_META,
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

console.log('\n[1] nextTool');
test('semua perkakas bisa muncul', () => {
  const seen = new Set<string>();
  let s = 7;
  for (let i = 0; i < 300; i += 1) {
    seen.add(nextTool(() => { s = (s * 9301 + 49297) % 233280; return s / 233280; }));
  }
  for (const k of ['palu', 'obeng', 'kunci', 'meteran', 'bor-emas']) {
    assert.ok(seen.has(k), `${k} tak pernah muncul`);
  }
});
test('batas deterministik bor emas', () => {
  assert.equal(nextTool(() => 0.01), 'bor-emas');
  assert.equal(nextTool(() => 0.2), 'palu');
  assert.ok(GOLD_CHANCE > 0 && GOLD_CHANCE < 0.2);
});
test('meta lengkap', () => {
  for (const k of Object.keys(TOOL_META) as Array<keyof typeof TOOL_META>) {
    assert.ok(TOOL_META[k].icon.length > 0 && TOOL_META[k].name.length > 0);
  }
});

console.log('\n[2] fallSpeedAt & spawnDelayAt');
test('jatuh makin cepat', () => {
  assert.ok(fallSpeedAt(55, () => 0.5) > fallSpeedAt(5, () => 0.5));
});
test('spawn makin rapat', () => {
  assert.ok(spawnDelayAt(55, () => 0.5) < spawnDelayAt(5, () => 0.5));
  assert.ok(spawnDelayAt(60, () => 0.01) > 0);
});

console.log('\n[3] tapPoints');
test('base + kombo×2', () => {
  assert.equal(tapPoints('palu', 0), 10);
  assert.equal(tapPoints('palu', 5), 20);
  assert.equal(tapPoints('kunci', 3), 21);
  assert.equal(tapPoints('bor-emas', 0), 50);
  assert.equal(tapPoints('bor-emas', 4), 58);
});

console.log('\n[4] gradeFor');
test('grade S..D', () => {
  assert.equal(gradeFor(1500), 'S');
  assert.equal(gradeFor(1000), 'A');
  assert.equal(gradeFor(650), 'B');
  assert.equal(gradeFor(350), 'C');
  assert.equal(gradeFor(10), 'D');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
