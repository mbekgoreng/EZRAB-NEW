/**
 * Pasangan Material — logic tests. Run: npx tsx src/game-space/games/arcade/memory-card/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createDeck, createMemory, flipCard, closeMismatch, scoreFor, finalScore,
  comboBonusFor, mismatchPenaltyFor, materialById,
  pairsForMode, mulberry32, MATERIALS,
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

test('pairsForMode: 8 & 18', () => {
  assert.equal(pairsForMode('4x4'), 8);
  assert.equal(pairsForMode('6x6'), 18);
});

test('MATERIALS: 18 item unik bertema konstruksi, tanpa emoji (glif prosedural per id)', () => {
  assert.equal(MATERIALS.length, 18);
  assert.equal(new Set(MATERIALS.map((m) => m.id)).size, 18);
  assert.ok(MATERIALS.every((m) => m.name.length > 0 && /^#[0-9a-f]{6}$/i.test(m.color)));
  assert.ok(MATERIALS.every((m) => !('emoji' in m)), 'wajah kartu digambar prosedural, bukan emoji');
});

test('createDeck: tiap id tepat 2x, jumlah benar', () => {
  for (const mode of ['4x4', '6x6'] as const) {
    const d = createDeck(mode, mulberry32(11));
    assert.equal(d.length, pairsForMode(mode) * 2);
    const counts = new Map<string, number>();
    for (const id of d) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [, n] of counts) assert.equal(n, 2);
  }
});

test('createDeck: seed sama = deck sama; seed beda (umumnya) beda', () => {
  const a = createDeck('4x4', mulberry32(5));
  const b = createDeck('4x4', mulberry32(5));
  assert.deepEqual(a, b);
  const c = createDeck('4x4', mulberry32(6));
  assert.notDeepEqual(a, c);
});

test('flipCard: pasangan cocok -> match', () => {
  const st = createMemory('4x4', mulberry32(21));
  // cari pasangan pertama: occurrence pertama & kedua dari id yang sama
  const i = 0;
  const j = st.deck.indexOf(st.deck[i], i + 1);
  assert.equal(flipCard(st, i).kind, 'first');
  const r = flipCard(st, i);
  assert.equal(r.kind, 'ignored', 'kartu yang sama tidak bisa dibuka 2x');
  const r2 = flipCard(st, j);
  assert.equal(r2.kind, 'match');
  assert.equal(st.pairsFound, 1);
  assert.ok(st.matched[i] && st.matched[j]);
});

test('flipCard: beda -> mismatch + locked, lalu closeMismatch', () => {
  const st = createMemory('4x4', mulberry32(22));
  const i = 0;
  let j = 1;
  while (st.deck[j] === st.deck[i]) j += 1;
  flipCard(st, i);
  const r = flipCard(st, j);
  assert.equal(r.kind, 'mismatch');
  assert.equal(st.locked, true);
  assert.equal(flipCard(st, (j + 1) % st.deck.length).kind, 'ignored');
  closeMismatch(st);
  assert.equal(st.locked, false);
  assert.deepEqual(st.open, []);
});

test('flipCard: semua pasang cocok -> win', () => {
  const st = createMemory('4x4', mulberry32(23));
  const byId = new Map<string, number[]>();
  st.deck.forEach((id, i) => {
    const arr = byId.get(id) ?? [];
    arr.push(i);
    byId.set(id, arr);
  });
  let n = 0;
  for (const [, idxs] of byId) {
    assert.equal(flipCard(st, idxs[0]).kind, 'first');
    const r = flipCard(st, idxs[1]);
    n += 1;
    assert.equal(r.kind, n < st.totalPairs ? 'match' : 'win');
  }
  assert.equal(st.finished, true);
  assert.equal(st.pairsFound, st.totalPairs);
});

test('flipCard: setelah win semua flip diabaikan', () => {
  const st = createMemory('4x4', mulberry32(24));
  st.finished = true;
  assert.equal(flipCard(st, 0).kind, 'ignored');
});

test('scoreFor: makin sedikit langkah & cepat = skor lebih tinggi', () => {
  const good = scoreFor(10, 30, 8);
  const bad = scoreFor(40, 200, 8);
  assert.ok(good > bad, `good=${good} bad=${bad}`);
  assert.ok(scoreFor(8, 10, 8) > 0);
});

/** Indeks kedua kartu dari satu id di deck (untuk skenario kombo). */
function pairIdx(st: ReturnType<typeof createMemory>, id: string): [number, number] {
  const a = st.deck.indexOf(id);
  const b = st.deck.indexOf(id, a + 1);
  assert.ok(a >= 0 && b > a, `pasangan ${id} ada di deck`);
  return [a, b];
}

test('REGRESI closeMismatch: satu kartu terbuka TIDAK ikut tertutup', () => {
  const st = createMemory('4x4', mulberry32(31));
  assert.equal(flipCard(st, 3).kind, 'first');
  closeMismatch(st); // bug lama: open dibuang diam-diam walau belum mismatch
  assert.deepEqual(st.open, [3], 'kartu pertama harus tetap terbuka');
  assert.equal(st.locked, false);
  // dan kartu itu masih bisa dipasangkan normal dengan kembarannya
  const [p, q] = pairIdx(st, st.deck[3]);
  const other = p === 3 ? q : p;
  assert.equal(flipCard(st, other).kind, 'match');
});

test('closeMismatch: tetap menutup pasangan mismatch yang terkunci', () => {
  const st = createMemory('4x4', mulberry32(32));
  const i = 0;
  let j = 1;
  while (st.deck[j] === st.deck[i]) j += 1;
  flipCard(st, i);
  assert.equal(flipCard(st, j).kind, 'mismatch');
  closeMismatch(st);
  assert.deepEqual(st.open, []);
  assert.equal(st.locked, false);
});

test('comboBonusFor: 0 untuk streak 1, naik 20/rentetan, cap 100', () => {
  assert.equal(comboBonusFor(0), 0);
  assert.equal(comboBonusFor(1), 0);
  assert.equal(comboBonusFor(2), 20);
  assert.equal(comboBonusFor(3), 40);
  assert.equal(comboBonusFor(6), 100);
  assert.equal(comboBonusFor(12), 100);
});

test('mismatchPenaltyFor: 15 per salah, tak pernah negatif', () => {
  assert.equal(mismatchPenaltyFor(0), 0);
  assert.equal(mismatchPenaltyFor(3), 45);
  assert.equal(mismatchPenaltyFor(-2), 0);
});

test('kombo: pasangan beruntun menaikkan streak & bonus; salah mereset', () => {
  const st = createMemory('4x4', mulberry32(33));
  const ids = [...new Set(st.deck)];
  const [a1, a2] = pairIdx(st, ids[0]);
  flipCard(st, a1);
  const m1 = flipCard(st, a2);
  assert.equal(m1.kind, 'match');
  if (m1.kind === 'match') { assert.equal(m1.streak, 1); assert.equal(m1.bonus, 0); }
  const [b1, b2] = pairIdx(st, ids[1]);
  flipCard(st, b1);
  const m2 = flipCard(st, b2);
  assert.equal(m2.kind, 'match');
  if (m2.kind === 'match') { assert.equal(m2.streak, 2); assert.equal(m2.bonus, 20); }
  assert.equal(st.comboPoints, 20);
  assert.equal(st.bestStreak, 2);
  // sekarang sengaja meleset: ambil kartu dari dua id berbeda
  const rest = [...new Set(st.deck.filter((id) => !st.matched[st.deck.indexOf(id)]))];
  const open1 = st.deck.findIndex((id, idx) => id === rest[0] && !st.matched[idx]);
  const open2 = st.deck.findIndex((id, idx) => id === rest[1] && !st.matched[idx]);
  flipCard(st, open1);
  assert.equal(flipCard(st, open2).kind, 'mismatch');
  assert.equal(st.streak, 0, 'streak reset setelah salah');
  assert.equal(st.mismatches, 1);
  assert.equal(st.bestStreak, 2, 'rekor rentetan tidak ikut reset');
  closeMismatch(st);
  // pasangan berikutnya mulai dari streak 1 lagi (bonus 0)
  const [c1, c2] = pairIdx(st, rest[0]);
  flipCard(st, c1);
  const m3 = flipCard(st, c2);
  assert.equal(m3.kind, 'match');
  if (m3.kind === 'match') { assert.equal(m3.streak, 1); assert.equal(m3.bonus, 0); }
  assert.equal(st.comboPoints, 20, 'bonus lama tidak bertambah dari streak 1');
});

test('finalScore: dasar + bonus kombo - penalti salah, lantai 0', () => {
  const base = scoreFor(12, 40, 8);
  assert.equal(finalScore(12, 40, 8, 0, 0), base);
  assert.equal(finalScore(12, 40, 8, 60, 0), base + 60);
  assert.equal(finalScore(12, 40, 8, 60, 2), base + 60 - 30);
  assert.ok(finalScore(500, 5000, 8, 0, 40) >= 0);
});

test('kombo penuh: main sempurna tanpa salah mengumpulkan bonus maksimum pola', () => {
  const st = createMemory('4x4', mulberry32(34));
  const byId = new Map<string, number[]>();
  st.deck.forEach((id, i) => {
    const arr = byId.get(id) ?? [];
    arr.push(i);
    byId.set(id, arr);
  });
  for (const [, idxs] of byId) {
    flipCard(st, idxs[0]);
    flipCard(st, idxs[1]);
  }
  assert.equal(st.finished, true);
  assert.equal(st.mismatches, 0);
  assert.equal(st.bestStreak, 8);
  // bonus per streak 1..8: 0+20+40+60+80+100+100+100
  assert.equal(st.comboPoints, 500);
});

test('materialById: ketemu & error untuk id asing', () => {
  assert.equal(materialById('bata').name, 'Bata Merah');
  assert.throws(() => materialById('alien'), /tak dikenal/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
