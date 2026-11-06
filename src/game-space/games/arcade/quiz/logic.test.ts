/**
 * ArcadeQuiz — logic tests. Run: npx tsx src/game-space/games/arcade/quiz/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  QUESTIONS, buildRound, scoreAnswer, gradeFor, mulberry32,
  QUESTIONS_PER_ROUND, TIME_PER_QUESTION, CATEGORIES,
  pickQuestionsForRound, tierPlanForRound, tierLabel, validateQuestionBank,
  ROUND_TIER_PLAN,
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

console.log('\n[1] bank soal');
test('bank ≥ 90 soal (Gelombang 5)', () => {
  assert.ok(QUESTIONS.length >= 90, `hanya ${QUESTIONS.length}`);
});
test('bank tepat 96 soal saat ini', () => {
  assert.equal(QUESTIONS.length, 96);
});
test('validateQuestionBank: bank lolos tanpa error', () => {
  assert.deepEqual(validateQuestionBank(), []);
});
test('tidak ada pertanyaan duplikat (case-insensitive)', () => {
  const keys = QUESTIONS.map((q) => q.q.trim().toLowerCase());
  assert.equal(new Set(keys).size, keys.length);
});
test('tiap tier terwakili ≥ 20 soal & tier sah', () => {
  for (const t of [1, 2, 3] as const) {
    const n = QUESTIONS.filter((q) => q.tier === t).length;
    assert.ok(n >= 20, `tier ${t} hanya ${n}`);
  }
  for (const q of QUESTIONS) assert.ok([1, 2, 3].includes(q.tier), `tier asing: ${q.q}`);
});
test('tierLabel memetakan 1/2/3', () => {
  assert.equal(tierLabel(1), 'Dasar');
  assert.equal(tierLabel(2), 'Menengah');
  assert.equal(tierLabel(3), 'Lanjutan');
});
test('validateQuestionBank menangkap bank rusak (regresi validator)', () => {
  const bad = [
    { q: 'Soal A?', options: ['a', 'a', 'b', 'c'], answer: 9, cat: 'Material', tier: 1 as const },
    { q: 'Soal A?', options: ['a', 'b', 'c', 'd'], answer: 0, cat: 'Material', tier: 1 as const },
  ];
  const errs = validateQuestionBank(bad);
  assert.ok(errs.length >= 3, `errors: ${errs.join('; ')}`);
});
test('tiap soal: 4 opsi, answer valid, kategori dikenal', () => {
  for (const q of QUESTIONS) {
    assert.equal(q.options.length, 4, `opsi bukan 4: ${q.q}`);
    assert.ok(q.answer >= 0 && q.answer <= 3, `answer invalid: ${q.q}`);
    assert.ok((CATEGORIES as readonly string[]).includes(q.cat), `kategori asing: ${q.cat}`);
    assert.ok(new Set(q.options).size === 4, `opsi duplikat: ${q.q}`);
  }
});
test('minimal 6 kategori terwakili', () => {
  const cats = new Set(QUESTIONS.map((q) => q.cat));
  assert.ok(cats.size >= 6, `hanya ${cats.size} kategori`);
});

console.log('\n[2] buildRound');
test('ronde berisi 10 soal', () => {
  assert.equal(buildRound(123).length, QUESTIONS_PER_ROUND);
});
test('seed sama → ronde identik (deterministik)', () => {
  const a = JSON.stringify(buildRound(777));
  const b = JSON.stringify(buildRound(777));
  assert.equal(a, b);
});
test('seed beda → ronde (umumnya) beda', () => {
  const a = JSON.stringify(buildRound(1));
  const b = JSON.stringify(buildRound(2));
  assert.notEqual(a, b);
});
test('jawaban benar ikut teracak tapi konsisten', () => {
  for (const seed of [1, 2, 3]) {
    for (const q of buildRound(seed)) {
      assert.ok(q.answer >= 0 && q.answer <= 3);
    }
  }
});
test('jawaban teracak valid: opsi pada index answer adalah opsi benar asli', () => {
  // verifikasi: mapping answer menunjuk ke opsi yang benar dari bank
  const round = buildRound(42);
  for (const rq of round) {
    const orig = QUESTIONS.find((q) => q.q === rq.q);
    assert.ok(orig, 'soal ronde tidak ada di bank');
    assert.equal(rq.options[rq.answer], orig.options[orig.answer]);
  }
});
test('tierPlanForRound: pola menanjak 3 dasar, 4 menengah, 3 lanjutan', () => {
  assert.deepEqual(tierPlanForRound(10), [...ROUND_TIER_PLAN]);
  assert.deepEqual(tierPlanForRound(0), []);
  const plan = tierPlanForRound(10);
  assert.equal(plan.filter((t) => t === 1).length, 3);
  assert.equal(plan.filter((t) => t === 2).length, 4);
  assert.equal(plan.filter((t) => t === 3).length, 3);
});
test('pickQuestionsForRound mengikuti rencana tier per posisi', () => {
  for (const seed of [1, 7, 42, 99]) {
    const picked = pickQuestionsForRound(seed);
    assert.equal(picked.length, QUESTIONS_PER_ROUND);
    assert.deepEqual(picked.map((q) => q.tier), tierPlanForRound(10));
    assert.equal(new Set(picked.map((q) => q.q)).size, picked.length, 'soal berulang dalam ronde');
  }
});
test('buildRound mempertahankan tier soal asli', () => {
  for (const rq of buildRound(5)) {
    const orig = QUESTIONS.find((q) => q.q === rq.q);
    assert.ok(orig);
    assert.equal(rq.tier, orig.tier);
  }
});
test('fakta kunci terverifikasi: konversi & APD & campuran', () => {
  const byQ = (frag: string) => QUESTIONS.find((q) => q.q.includes(frag));
  const m = byQ('Satu meter sama dengan');
  assert.ok(m); assert.equal(m.options[m.answer], '100 cm');
  const ton = byQ('Satu ton sama dengan');
  assert.ok(ton); assert.equal(ton.options[ton.answer], '1.000 kg');
  const helm = byQ('safety helmet');
  assert.ok(helm); assert.ok(helm.options[helm.answer].includes('kepala'));
  const vol = byQ('Volume beton untuk plat');
  assert.ok(vol); assert.equal(vol.options[vol.answer], '2,4 m³');
});

console.log('\n[3] scoreAnswer');
test('jawaban benar: 100 + timeLeft*5 + streak*15', () => {
  const r = scoreAnswer(true, 10, 2);
  assert.equal(r.correct, true);
  assert.equal(r.newStreak, 3);
  assert.equal(r.points, 100 + 10 * 5 + 3 * 15);
});
test('jawaban salah: 0 poin, streak reset', () => {
  const r = scoreAnswer(false, 10, 5);
  assert.equal(r.points, 0);
  assert.equal(r.newStreak, 0);
});
test('waktu habis (timeLeft 0) tetap dapat 100 + streak', () => {
  const r = scoreAnswer(true, 0, 0);
  assert.equal(r.points, 115);
});
test('timeLeft tidak boleh negatif', () => {
  const r = scoreAnswer(true, -3, 0);
  assert.equal(r.points, 115);
});

console.log('\n[4] gradeFor');
test('grade S/A/B/C/D sesuai rasio', () => {
  assert.equal(gradeFor(95, 100), 'S');
  assert.equal(gradeFor(80, 100), 'A');
  assert.equal(gradeFor(60, 100), 'B');
  assert.equal(gradeFor(40, 100), 'C');
  assert.equal(gradeFor(10, 100), 'D');
  assert.equal(gradeFor(0, 0), 'D');
});

console.log('\n[5] mulberry32');
test('deterministik & dalam [0,1)', () => {
  const r1 = mulberry32(9);
  const r2 = mulberry32(9);
  for (let i = 0; i < 5; i += 1) {
    const v = r1();
    assert.equal(v, r2());
    assert.ok(v >= 0 && v < 1);
  }
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
