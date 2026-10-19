/**
 * ArcadeEmojiCatcher ("Tangkap Helm") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/emoji-catcher/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  levelFor, fallSpeed, spawnInterval, kindFor, pointsFor,
  spawnItem, hitsBasket, isMissed, CATCHES_PER_LEVEL, MAX_LIVES,
  type FallingItem,
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

// rng deterministik sederhana
function seqRng(vals: number[]): () => number {
  let i = 0;
  return () => vals[(i++) % vals.length] ?? 0.5;
}

console.log('\n[1] levelFor');
test('0–11 tangkapan = level 1', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(11), 1);
});
test(`tiap ${CATCHES_PER_LEVEL} tangkapan naik level`, () => {
  assert.equal(levelFor(12), 2);
  assert.equal(levelFor(24), 3);
  assert.equal(levelFor(36), 4);
});
test('negatif dijepit ke level 1', () => {
  assert.equal(levelFor(-5), 1);
});

console.log('\n[2] fallSpeed & spawnInterval');
test('kecepatan naik seiring level', () => {
  const rng = () => 0.5;
  assert.ok(fallSpeed(3, rng) > fallSpeed(1, rng));
});
test('kecepatan positif', () => {
  assert.ok(fallSpeed(1, () => 0) > 0);
  assert.ok(fallSpeed(10, () => 0.99) > 0);
});
test('interval spawn menyusut tapi ada floor 0.32', () => {
  assert.ok(spawnInterval(2) < spawnInterval(1));
  assert.equal(spawnInterval(99), 0.32);
});

console.log('\n[3] kindFor & pointsFor');
test('rng kecil → bata (di bawah brickP)', () => {
  assert.equal(kindFor(1, seqRng([0.01])), 'bata');
});
test('rng sedang → helm', () => {
  assert.equal(kindFor(1, seqRng([0.6])), 'helm');
});
test('bata tidak pernah > 28%', () => {
  assert.notEqual(kindFor(20, seqRng([0.29])), 'bata');
});
test('poin: bonus 50, helm 10, bata 0', () => {
  assert.equal(pointsFor('bonus'), 50);
  assert.equal(pointsFor('helm'), 10);
  assert.equal(pointsFor('bata'), 0);
});

console.log('\n[4] spawnItem');
test('item dalam batas lebar & punya emoji', () => {
  const it = spawnItem(() => 0.5, 1, 390, -30, 0);
  assert.ok(it.x >= it.r && it.x <= 390 - it.r, `x=${it.x}`);
  assert.ok(it.emoji.length > 0);
  assert.ok(it.vy > 0);
});
test('bata selalu emoji 🧱', () => {
  const it = spawnItem(seqRng([0.01, 0.5, 0.5, 0.5]), 1, 390, -30, 0);
  assert.equal(it.kind, 'bata');
  assert.equal(it.emoji, '🧱');
});

console.log('\n[5] hitsBasket');
const mk = (x: number, y: number): FallingItem => ({
  kind: 'helm', emoji: '⛑️', x, y, vy: 100, r: 15, points: 10, wobble: 0, born: 0,
});
test('tepat di keranjang → kena', () => {
  assert.ok(hitsBasket(mk(200, 500), 200, 90, 490, 40));
});
test('jauh horizontal → tidak kena', () => {
  assert.ok(!hitsBasket(mk(50, 500), 200, 90, 490, 40));
});
test('di atas keranjang → tidak kena', () => {
  assert.ok(!hitsBasket(mk(200, 400), 200, 90, 490, 40));
});

console.log('\n[6] isMissed');
test('di bawah layar → missed', () => {
  assert.ok(isMissed(mk(100, 700), 600));
});
test('masih di layar → belum missed', () => {
  assert.ok(!isMissed(mk(100, 500), 600));
});

console.log('\n[7] konstanta');
test('MAX_LIVES = 3', () => {
  assert.equal(MAX_LIVES, 3);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
