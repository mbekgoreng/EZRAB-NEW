/**
 * ArcadeSimonSays ("Ikuti Mandor") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/simon-says/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  ABA_ABA, extendSequence, stepDuration, checkInput, scoreFor, STEP_GAP,
  tempoFor, hudSummary, inputProgress,
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

console.log('\n[4b] glif panel + tempo eksplisit (Gelombang 5)');
test('4 panel punya glif perkakas unik: palu, helm, bendera, peluit', () => {
  const glyphs = ABA_ABA.map((a) => a.glyph);
  assert.deepEqual([...glyphs].sort(), ['bendera', 'helm', 'palu', 'peluit']);
  assert.equal(new Set(glyphs).size, 4);
  for (const a of ABA_ABA) assert.ok(a.glyphLabel.length > 0);
});
test('tempoFor: durasi menurun monoton & tidak di bawah lantai', () => {
  let prev = Infinity;
  for (let r = 1; r <= 14; r += 1) {
    const t = tempoFor(r);
    assert.ok(t.stepDuration <= prev + 1e-9, `ronde ${r} tidak monoton`);
    assert.ok(t.stepDuration >= 0.30);
    prev = t.stepDuration;
  }
  assert.equal(tempoFor(999).stepDuration, 0.30);
});
test('tempoFor konsisten dengan stepDuration + STEP_GAP', () => {
  for (const r of [1, 4, 8, 12]) {
    const t = tempoFor(r);
    assert.equal(t.stepDuration, stepDuration(r));
    assert.equal(t.gap, STEP_GAP);
    assert.equal(t.perStep, t.stepDuration + STEP_GAP);
    assert.ok(Math.abs(t.stepsPerSecond - 1 / t.perStep) < 1e-9);
    assert.equal(t.round, r);
  }
});
test('tempoFor: label bertingkat & ronde <= 0 dianggap ronde 1', () => {
  assert.equal(tempoFor(1).label, 'Santai');
  assert.equal(tempoFor(3).label, 'Santai');
  assert.equal(tempoFor(4).label, 'Sedang');
  assert.equal(tempoFor(7).label, 'Cepat');
  assert.equal(tempoFor(11).label, 'Kilat');
  assert.equal(tempoFor(0).round, 1);
  assert.equal(tempoFor(-5).stepDuration, tempoFor(1).stepDuration);
});
test('tempo makin cepat: total playback urutan sama lebih singkat di ronde tinggi', () => {
  const total = (r: number, len: number) => tempoFor(r).perStep * len;
  assert.ok(total(10, 8) < total(2, 8));
});
test('hudSummary memuat ronde, panjang urutan, tempo & progres input', () => {
  const w = hudSummary(5, 5, 'watch', 0);
  assert.ok(w.title.includes('Ronde 5'));
  assert.ok(w.title.includes('Urutan 5'));
  assert.ok(w.detail.includes('Tempo'));
  const i = hudSummary(5, 5, 'input', 3);
  assert.ok(i.detail.includes('3/5'));
});
test('inputProgress dijepit 0..1', () => {
  assert.equal(inputProgress(4, 0), 0);
  assert.equal(inputProgress(4, 2), 0.5);
  assert.equal(inputProgress(4, 4), 1);
  assert.equal(inputProgress(4, 99), 1);
  assert.equal(inputProgress(0, 3), 0);
});
test('BUKAN-BUG terbukti: stepDuration lama = tempoFor.stepDuration (kompatibilitas)', () => {
  for (let r = 1; r <= 20; r += 1) assert.equal(stepDuration(r), tempoFor(r).stepDuration);
});

console.log('\n[5] scoreFor');
test('skor = ronde diselesaikan', () => {
  assert.equal(scoreFor(0), 0);
  assert.equal(scoreFor(7), 7);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
