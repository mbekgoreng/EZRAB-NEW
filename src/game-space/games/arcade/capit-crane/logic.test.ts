/**
 * ArcadeCapitCrane ("Capit Material") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/capit-crane/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  trolleyAt, swayAt, descendSpeed, pickKind, spawnItem, grabCheck,
  scoreFor, comboBonus, ITEM_DEFS, TROLLEY_MIN, TROLLEY_MAX,
  GAME_DURATION, GRAB_RADIUS,
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

console.log('\n[1] trolleyAt');
test('selalu dalam batas', () => {
  for (let t = 0; t < 20; t += 0.1) {
    const x = trolleyAt(t);
    assert.ok(x >= TROLLEY_MIN - 1e-9 && x <= TROLLEY_MAX + 1e-9, `t=${t} x=${x}`);
  }
});
test('periodik: t dan t+period sama', () => {
  assert.ok(Math.abs(trolleyAt(1.7) - trolleyAt(1.7 + 3.4)) < 1e-9);
});

console.log('\n[2] swayAt & descendSpeed');
test('ayunan terbatas ±0.25 rad', () => {
  for (let t = 0; t < 20; t += 0.13) {
    assert.ok(Math.abs(swayAt(t)) < 0.25, `t=${t}`);
  }
});
test('turun makin cepat seiring waktu', () => {
  assert.ok(descendSpeed(GAME_DURATION) > descendSpeed(0));
  assert.ok(descendSpeed(0) > 0);
});

console.log('\n[3] pickKind & spawnItem');
test('distribusi mencakup semua jenis', () => {
  let seed = 7;
  const rng = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i += 1) seen.add(pickKind(rng));
  for (const k of Object.keys(ITEM_DEFS)) assert.ok(seen.has(k), `tak pernah muncul: ${k}`);
});
test('kunci-emas jarang (bobot kecil)', () => {
  let seed = 42;
  const rng = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let gold = 0;
  for (let i = 0; i < 1000; i += 1) if (pickKind(rng) === 'kunci-emas') gold += 1;
  assert.ok(gold < 100, `emas ${gold}/1000 terlalu sering`);
});
test('spawnItem dalam rentang x', () => {
  const it = spawnItem(() => 0.5, 1, 50, 300);
  assert.ok(it.x >= 50 && it.x <= 300);
  assert.equal(it.id, 1);
});

console.log('\n[4] grabCheck & skor');
test('capit kena item terdekat dalam radius', () => {
  const items = [
    { id: 1, kind: 'bata' as const, x: 100 },
    { id: 2, kind: 'helm' as const, x: 200 },
  ];
  const got = grabCheck(105, 400, items, 400);
  assert.ok(got && got.id === 1);
});
test('di luar radius = meleset', () => {
  const items = [{ id: 1, kind: 'bata' as const, x: 100 }];
  assert.equal(grabCheck(100 + GRAB_RADIUS + 5, 400, items, 400), null);
});
test('item terdekat menang bila dua-duanya dalam radius', () => {
  const items = [
    { id: 1, kind: 'bata' as const, x: 100 },
    { id: 2, kind: 'helm' as const, x: 110 },
  ];
  const got = grabCheck(112, 400, items, 400);
  assert.ok(got && got.id === 2);
});
test('scoreFor sesuai definisi', () => {
  assert.equal(scoreFor('kunci-emas'), 150);
  assert.equal(scoreFor('bata'), ITEM_DEFS.bata.points);
});
test('comboBonus: <3 = 0, naik, dijepit 100', () => {
  assert.equal(comboBonus(0), 0);
  assert.equal(comboBonus(2), 0);
  assert.ok(comboBonus(5) > comboBonus(3));
  assert.equal(comboBonus(999), 100);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed > 0 ? `: ${failures.join(', ')}` : ''}`);
process.exit(failed > 0 ? 1 : 0);
