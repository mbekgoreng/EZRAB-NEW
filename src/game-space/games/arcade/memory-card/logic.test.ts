/**
 * Pasangan Material — logic tests. Run: npx tsx src/game-space/games/arcade/memory-card/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createDeck, createMemory, flipCard, closeMismatch, scoreFor, materialById,
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

test('MATERIALS: 18 item unik bertema konstruksi', () => {
  assert.equal(MATERIALS.length, 18);
  assert.equal(new Set(MATERIALS.map((m) => m.id)).size, 18);
  assert.ok(MATERIALS.every((m) => m.emoji.length > 0 && m.name.length > 0));
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

test('materialById: ketemu & error untuk id asing', () => {
  assert.equal(materialById('bata').name, 'Bata Merah');
  assert.throws(() => materialById('alien'), /tak dikenal/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
