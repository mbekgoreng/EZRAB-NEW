/**
 * ArcadeSpeedTyping ("Ketik Cepat Estimator") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/speed-typing/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  DURATION_SEC, TERMS, sampleTerms, newTypeState, typeChar, wpm, accuracy, rankFor,
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

function typeWord(st: ReturnType<typeof newTypeState>, word: string): ReturnType<typeof newTypeState> {
  let cur = st;
  for (const ch of word) cur = typeChar(cur, ch).state;
  cur = typeChar(cur, ' ').state;
  return cur;
}

console.log('\n[1] TERMS & sampleTerms');
test('durasi 60 detik', () => {
  assert.equal(DURATION_SEC, 60);
});
test('istilah huruf kecil tanpa spasi', () => {
  assert.ok(TERMS.length > 40);
  for (const t of TERMS) assert.ok(/^[a-z0-9]+$/.test(t), `istilah tidak valid: ${t}`);
});
test('sampleTerms mengembalikan n istilah', () => {
  const s = sampleTerms(20, () => 0.3);
  assert.equal(s.length, 20);
  assert.ok(s.every((x) => TERMS.includes(x)));
});

console.log('\n[2] typeChar');
test('ketik kata lengkap + spasi -> kata selesai', () => {
  let st = newTypeState(['semen']);
  st = typeWord(st, 'semen');
  assert.equal(st.wordsDone, 1);
  assert.equal(st.typed, '');
  assert.equal(st.correctChars, 6); // 5 huruf + 1 spasi
});
test('huruf salah: error, buffer tidak maju', () => {
  let st = newTypeState(['semen']);
  const r = typeChar(st, 'x');
  assert.equal(r.res, 'wrong');
  assert.equal(r.state.errors, 1);
  assert.equal(r.state.typed, '');
});
test('spasi prematur diabaikan', () => {
  const st = newTypeState(['semen']);
  const r = typeChar(st, ' ');
  assert.equal(r.res, 'ignored');
  assert.equal(r.state.wordsDone, 0);
});
test('karakter non-alfanumerik diabaikan', () => {
  const st = newTypeState(['semen']);
  assert.equal(typeChar(st, '!').res, 'ignored');
  assert.equal(typeChar(st, 'S').res, 'ignored');
});
test('kata habis -> daftar diperpanjang otomatis', () => {
  let st = newTypeState(['ab']);
  st = typeWord(st, 'ab');
  assert.ok(st.words.length > 1);
  assert.equal(st.wi, 1);
});

console.log('\n[3] wpm & accuracy');
test('wpm standar (chars/5 per menit)', () => {
  assert.equal(wpm(300, 60), 60);
  assert.equal(wpm(150, 30), 60);
  assert.equal(wpm(0, 60), 0);
  assert.equal(wpm(100, 0), 0);
});
test('akurasi', () => {
  assert.equal(accuracy(90, 100), 90);
  assert.equal(accuracy(0, 0), 100);
  assert.equal(accuracy(100, 100), 100);
});

console.log('\n[4] rankFor');
test('peringkat sesuai WPM', () => {
  assert.ok(rankFor(60).includes('Kilat'));
  assert.ok(rankFor(40).includes('Mandor'));
  assert.ok(rankFor(25).includes('Tukang'));
  assert.ok(rankFor(5).includes('Kuli'));
});
test('batas tepat', () => {
  assert.notEqual(rankFor(50), rankFor(49));
  assert.notEqual(rankFor(35), rankFor(34));
  assert.notEqual(rankFor(20), rankFor(19));
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
