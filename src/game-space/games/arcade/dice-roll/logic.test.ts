/**
 * ArcadeDiceRoll ("Dadu Proyek") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/dice-roll/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  FACES, rollDie, overUnderWins, playerWinsBet, aiSideFor, aiExactNumber,
  aiChoosesSide, aiStake, clampStake, resolveRound, START_COINS, MIN_STAKE,
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

console.log('\n[1] FACES & rollDie');
test('6 sisi material unik', () => {
  assert.equal(FACES.length, 6);
  const vals = FACES.map((f) => f.value).sort();
  assert.deepEqual(vals, [1, 2, 3, 4, 5, 6]);
  assert.ok(FACES.every((f) => f.icon.length > 0 && f.name.length > 0));
});
test('rollDie dalam 1..6', () => {
  for (let i = 0; i < 50; i += 1) {
    const f = rollDie(() => i / 50);
    assert.ok(f.value >= 1 && f.value <= 6);
  }
  assert.equal(rollDie(() => 0).value, 1);
  assert.equal(rollDie(() => 0.999).value, 6);
});

console.log('\n[2] overUnderWins');
test('ATAS = 4..6', () => {
  assert.ok(overUnderWins('atas', 4));
  assert.ok(overUnderWins('atas', 6));
  assert.ok(!overUnderWins('atas', 3));
});
test('BAWAH = 1..3', () => {
  assert.ok(overUnderWins('bawah', 1));
  assert.ok(overUnderWins('bawah', 3));
  assert.ok(!overUnderWins('bawah', 4));
});
test('pas: cocok persis', () => {
  assert.ok(playerWinsBet('pas', 5, 5));
  assert.ok(!playerWinsBet('pas', 5, 4));
  assert.ok(!playerWinsBet('pas', null, 4));
});

console.log('\n[3] AI');
test('aiSideFor selalu berlawanan', () => {
  assert.equal(aiSideFor('atas'), 'bawah');
  assert.equal(aiSideFor('bawah'), 'atas');
  assert.equal(aiSideFor('pas'), 'pas');
});
test('aiExactNumber beda dari pemain', () => {
  for (let i = 0; i < 20; i += 1) {
    const n = aiExactNumber(3, () => i / 20);
    assert.notEqual(n, 3);
    assert.ok(n >= 1 && n <= 6);
  }
});
test('aiChoosesSide kadang blunder ikut pemain', () => {
  assert.equal(aiChoosesSide('atas', () => 0.5), 'bawah');
  assert.equal(aiChoosesSide('atas', () => 0.01), 'atas');
  assert.equal(aiChoosesSide('pas', () => 0.01), 'pas');
});
test('aiStake proporsional & min', () => {
  const s = aiStake(100, () => 0.5);
  assert.ok(s >= MIN_STAKE && s <= 100);
  assert.equal(aiStake(3, () => 0.5), 0);
  assert.ok(aiStake(START_COINS, () => 0.99) <= START_COINS);
});
test('clampStake dijepit koin', () => {
  assert.equal(clampStake(50, 30), 30);
  assert.equal(clampStake(2, 100), MIN_STAKE);
  assert.equal(clampStake(10, 3), 0);
});

console.log('\n[4] resolveRound');
test('pemenang meraup pot (atas vs bawah)', () => {
  // rng: aiStake pakai rng pertama, roll pakai rng kedua
  const seq = [0.5, 0.9]; // stake 17.5%→17? roll 0.9→value 6 (ATAS menang)
  let k = 0;
  const r = resolveRound('atas', null, 20, 'bawah', null, 100, () => seq[k++ % seq.length]);
  assert.equal(r.roll.value, 6);
  assert.equal(r.player, 'menang');
  assert.equal(r.ai, 'kalah');
  assert.ok(r.playerDelta > 0);
  assert.equal(r.aiDelta, -r.playerDelta);
});
test('imbang bila keduanya menang (AI blunder ikut sisi)', () => {
  const seq = [0.5, 0.1]; // roll 0.1→value 1
  let k = 0;
  const r = resolveRound('bawah', null, 20, 'bawah', null, 100, () => seq[k++ % seq.length]);
  assert.equal(r.player, 'imbang');
  assert.equal(r.playerDelta, 0);
  assert.equal(r.aiDelta, 0);
});
test('pas: angka pemain keluar → menang', () => {
  const seq = [0.5, 0.7]; // roll 0.7→value 5
  let k = 0;
  const r = resolveRound('pas', 5, 20, 'pas', 2, 100, () => seq[k++ % seq.length]);
  assert.equal(r.roll.value, 5);
  assert.equal(r.player, 'menang');
});
test('pot = stake pemain + stake AI', () => {
  const seq = [0.0, 0.5];
  let k = 0;
  const r = resolveRound('atas', null, 20, 'bawah', null, 100, () => seq[k++ % seq.length]);
  assert.ok(r.pot >= 20 + MIN_STAKE);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
