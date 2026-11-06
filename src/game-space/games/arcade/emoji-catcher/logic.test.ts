/**
 * ArcadeEmojiCatcher ("Tangkap Helm") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/emoji-catcher/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  levelFor, fallSpeed, spawnInterval, kindFor, pointsFor,
  spawnItem, hitsBasket, isMissed, CATCHES_PER_LEVEL, MAX_LIVES,
  progressInLevel, catchesToNextLevel, levelProgressFraction,
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
  kind: 'helm', emoji: '⛑️', variant: 0, x, y, vy: 100, r: 15, points: 10, wobble: 0, born: 0,
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

console.log('\n[8] progres level eksplisit & varian prosedural (Gelombang 5)');
test('progressInLevel berputar tiap CATCHES_PER_LEVEL', () => {
  assert.equal(progressInLevel(0), 0);
  assert.equal(progressInLevel(5), 5);
  assert.equal(progressInLevel(CATCHES_PER_LEVEL - 1), CATCHES_PER_LEVEL - 1);
  assert.equal(progressInLevel(CATCHES_PER_LEVEL), 0);
  assert.equal(progressInLevel(CATCHES_PER_LEVEL + 3), 3);
  assert.equal(progressInLevel(-4), 0);
});
test('catchesToNextLevel konsisten dengan levelFor', () => {
  assert.equal(catchesToNextLevel(0), CATCHES_PER_LEVEL);
  assert.equal(catchesToNextLevel(CATCHES_PER_LEVEL - 1), 1);
  // tepat di ambang: level sudah naik, sisa dihitung dari level BARU
  assert.equal(catchesToNextLevel(CATCHES_PER_LEVEL), CATCHES_PER_LEVEL);
  for (const c of [0, 1, 7, 11, 12, 23, 24, 40]) {
    assert.equal(progressInLevel(c) + catchesToNextLevel(c), CATCHES_PER_LEVEL, `c=${c}`);
    assert.equal(levelFor(c + catchesToNextLevel(c)), levelFor(c) + 1, `c=${c}`);
  }
});
test('levelProgressFraction 0..1', () => {
  assert.equal(levelProgressFraction(0), 0);
  assert.ok(Math.abs(levelProgressFraction(6) - 0.5) < 1e-9);
  assert.ok(levelProgressFraction(CATCHES_PER_LEVEL - 1) < 1);
});
test('BUKAN-BUG: progres 0 tepat di ambang bukan reset yang salah', () => {
  // Kandidat: HUD bisa terlihat "progres hilang" saat tangkapan ke-12.
  // Buktinya: di titik yang sama levelFor naik 1->2, jadi progres 0 adalah
  // awal level baru yang benar, bukan kehilangan progres.
  const c = CATCHES_PER_LEVEL;
  assert.equal(levelFor(c - 1), 1);
  assert.equal(levelFor(c), 2);
  assert.equal(progressInLevel(c), 0);
});
test('spawnItem memberi variant dalam rentang per kind', () => {
  const bata = spawnItem(seqRng([0.01, 0.5, 0.5, 0.5]), 1, 390, -30, 0);
  assert.equal(bata.kind, 'bata');
  assert.equal(bata.variant, 0);
  for (let i = 0; i < 40; i += 1) {
    const it = spawnItem(() => ((i * 37) % 100) / 100, 2, 390, -30, 0);
    assert.ok(it.variant >= 0 && it.variant <= 4, `variant=${it.variant}`);
    if (it.kind === 'bonus') assert.ok(it.variant <= 1);
    if (it.kind === 'bata') assert.equal(it.variant, 0);
  }
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
