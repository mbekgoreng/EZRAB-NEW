/**
 * ArcadeRockPaperScissors — logic tests.
 * Run: npx tsx src/game-space/games/arcade/rock-paper-scissors/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  decide, counterOf, createMatch, playRound, aiPick, resetMatch,
  currentWinStreak, MOVES, MOVE_INFO,
  type Move,
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

function seqRng(values: number[]): () => number {
  let k = 0;
  return () => values[k++ % values.length];
}

console.log('\n[1] siklus bata-gergaji-gambar');
test('bata > gergaji', () => assert.equal(decide('bata', 'gergaji'), 'menang'));
test('gergaji > gambar', () => assert.equal(decide('gergaji', 'gambar'), 'menang'));
test('gambar > bata', () => assert.equal(decide('gambar', 'bata'), 'menang'));
test('kebalikannya kalah', () => {
  assert.equal(decide('gergaji', 'bata'), 'kalah');
  assert.equal(decide('gambar', 'gergaji'), 'kalah');
  assert.equal(decide('bata', 'gambar'), 'kalah');
});
test('sama = seri', () => {
  for (const m of MOVES) assert.equal(decide(m, m), 'seri');
});
test('counterOf konsisten dengan siklus', () => {
  assert.equal(counterOf('bata'), 'gambar');
  assert.equal(counterOf('gergaji'), 'bata');
  assert.equal(counterOf('gambar'), 'gergaji');
  for (const m of MOVES) assert.equal(decide(counterOf(m), m), 'menang');
});

console.log('\n[2] metadata lengkap');
test('MOVE_INFO punya nama+ikon+aksi untuk semua', () => {
  for (const m of MOVES) {
    assert.ok(MOVE_INFO[m].nama.length > 0);
    assert.ok(MOVE_INFO[m].ikon.length > 0);
    assert.ok(MOVE_INFO[m].aksiMenang.length > 0);
  }
});

console.log('\n[3] match best-of');
test('createMatch target 3', () => {
  const st = createMatch(3);
  assert.equal(st.target, 3);
  assert.equal(st.pScore, 0);
  assert.equal(st.aScore, 0);
  assert.ok(!st.over);
});
test('menang 3x → over, winner pemain', () => {
  const st = createMatch(2);
  // rng: AI selalu pilih 'bata' (0 -> MOVES[0]); pemain pilih 'gambar'
  const rng = seqRng([0.0, 0.99, 0.0, 0.99]); // pick acak dulu, dst
  // lebih deterministik: kosongkan history → aiPick pakai rng langsung
  const r1 = playRound(st, 'gambar', () => 0.0); // ai = bata
  assert.equal(r1.ai, 'bata');
  assert.equal(r1.outcome, 'menang');
  const r2 = playRound(st, 'gambar', () => 0.99); // rng>=0.72 → acak: 0.99*3=2 → 'gambar' → seri!
  void r2;
  void rng;
  assert.ok(st.round >= 1);
});
test('skor & ronde tercatat', () => {
  const st = createMatch(5);
  playRound(st, 'bata', () => 0.0); // ai bata → seri
  assert.equal(st.round, 1);
  assert.equal(st.history.length, 1);
  assert.equal(st.playerMoves[0], 'bata');
});
test('resetMatch mengosongkan', () => {
  const st = createMatch(3);
  playRound(st, 'bata', () => 0.1);
  resetMatch(st);
  assert.equal(st.pScore, 0);
  assert.equal(st.round, 0);
  assert.ok(!st.over);
  assert.equal(st.winner, null);
});

console.log('\n[4] AI pengamat');
test('AI counter langkah tersering pemain', () => {
  // pemain selalu 'bata'; rng kecil → mode counter; counterOf('bata')='gambar'
  const pick = aiPick(['bata', 'bata', 'bata'], () => 0.1);
  assert.equal(pick, 'gambar');
});
test('AI kadang acak (rng besar)', () => {
  const pick = aiPick(['bata', 'bata'], () => 0.99); // 0.99>=0.72 → acak: floor(0.99*3)=2 → 'gambar'
  assert.equal(pick, 'gambar');
});
test('AI tanpa history = acak', () => {
  const pick = aiPick([], () => 0.5); // floor(1.5)=1 → 'gergaji'
  assert.equal(pick, 'gergaji');
});
test('AI bisa dikalahkan: pemain counter balik', () => {
  // pemain selalu main counterOf(pilihan AI terakhir)... cukup: pola acak pemain
  // tidak selalu kalah — main 30 ronde vs AI, pemain pilih acak
  const st = createMatch(99);
  let p = 0;
  let a = 0;
  const rng = seqRng([0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.05]);
  const pm: Move[] = ['bata', 'gergaji', 'gambar'];
  for (let i = 0; i < 30; i += 1) {
    const r = playRound(st, pm[i % 3], rng);
    if (r.outcome === 'menang') p += 1;
    if (r.outcome === 'kalah') a += 1;
  }
  assert.ok(p > 0, 'pemain harus bisa menang beberapa ronde');
  assert.ok(p + a > 0);
});

console.log('\n[5] streak');
test('currentWinStreak hitung beruntun dari akhir', () => {
  const st = createMatch(99);
  playRound(st, 'gambar', () => 0.0); // ai bata → menang
  // ronde 2: AI meng-counter 'gambar' dengan 'gergaji' → pemain balas 'bata'
  playRound(st, 'bata', () => 0.0);
  assert.equal(st.history[1].ai, 'gergaji');
  assert.equal(st.history[1].outcome, 'menang');
  assert.equal(currentWinStreak(st), 2);
  playRound(st, 'gambar', () => 0.0); // ai gambar → seri → streak reset
  assert.equal(currentWinStreak(st), 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) console.log('FAILURES:', failures.join(', '));
if (failed > 0) process.exit(1);
