/**
 * ArcadeSimonSays ("Ikuti Mandor") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/simon-says/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { ABA_ABA, extendSequence, stepDuration, checkInput, scoreFor, STEP_GAP } from './logic';

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

console.log('\n[1] ABA_ABA');
test('4 rambu unik dengan nada berbeda', () => {
  assert.equal(ABA_ABA.length, 4);
  const labels = new Set(ABA_ABA.map((a) => a.label));
  assert.equal(labels.size, 4);
  const freqs = new Set(ABA_ABA.map((a) => a.freq));
  assert.equal(freqs.size, 4);
  for (const a of ABA_ABA) assert.ok(a.freq > 0);
});

console.log('\n[2] extendSequence');
test('menambah tepat 1 langkah valid (0..3)', () => {
  const s = extendSequence([0, 2], () => 0.99);
  assert.equal(s.length, 3);
  assert.deepEqual(s.slice(0, 2), [0, 2]);
  assert.equal(s[2], 3);
});
test('urutan lama tidak dimutasi', () => {
  const orig = [1];
  extendSequence(orig, () => 0.1);
  assert.deepEqual(orig, [1]);
});

console.log('\n[3] stepDuration');
test('makin cepat tiap ronde, floor 0.30', () => {
  assert.ok(stepDuration(5) < stepDuration(1));
  assert.equal(stepDuration(999), 0.30);
  assert.ok(stepDuration(1) > 0);
});
test('STEP_GAP positif', () => {
  assert.ok(STEP_GAP > 0);
});

console.log('\n[4] checkInput');
test('benar tapi belum selesai → lanjut', () => {
  assert.equal(checkInput([0, 2, 1], 0, 0), 'lanjut');
  assert.equal(checkInput([0, 2, 1], 1, 2), 'lanjut');
});
test('langkah terakhir benar → ronde-selesai', () => {
  assert.equal(checkInput([0, 2, 1], 2, 1), 'ronde-selesai');
  assert.equal(checkInput([3], 0, 3), 'ronde-selesai');
});
test('salah → salah', () => {
  assert.equal(checkInput([0, 2, 1], 0, 1), 'salah');
  assert.equal(checkInput([0, 2, 1], 2, 0), 'salah');
});

console.log('\n[5] scoreFor');
test('skor = ronde diselesaikan', () => {
  assert.equal(scoreFor(0), 0);
  assert.equal(scoreFor(7), 7);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
