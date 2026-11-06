/**
 * ArcadeDiceRoll ("Dadu Proyek") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/dice-roll/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  FACES, rollDie, overUnderWins, playerWinsBet, aiSideFor, aiExactNumber,
  aiChoosesSide, aiStake, clampStake, resolveRound, START_COINS, MIN_STAKE,
  MATCH_ROUNDS, RISK_INFO, riskMultiplier, effectiveStake, previewRound,
  createMatch, matchWinnerFor, resolveMatchRound,
} from './logic';

function seqRng(values: number[]): () => number {
  let k = 0;
  return () => values[k++ % values.length];
}

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

console.log('\n[5] pertandingan: struktur ronde tetap');
test('MATCH_ROUNDS tetap = 10 & createMatch bersih', () => {
  assert.equal(MATCH_ROUNDS, 10);
  const m = createMatch();
  assert.equal(m.totalRounds, 10);
  assert.equal(m.roundsPlayed, 0);
  assert.equal(m.playerCoins, START_COINS);
  assert.equal(m.aiCoins, START_COINS);
  assert.equal(m.startCoins, START_COINS);
  assert.ok(!m.over);
  assert.equal(m.winner, null);
  assert.equal(m.bankrupt, null);
  assert.equal(m.history.length, 0);
});
test('resolveMatchRound murni: state masukan tidak berubah', () => {
  const m = createMatch();
  const out = resolveMatchRound(m, { side: 'atas', exact: null, stake: 20, risk: 'standar', aiStake: 17 }, () => 0.9);
  assert.equal(m.roundsPlayed, 0);
  assert.equal(m.playerCoins, START_COINS);
  assert.equal(out.state.roundsPlayed, 1);
  assert.notEqual(out.state, m);
});
test('ronde di luar pertandingan selesai ditolak (result null)', () => {
  let m = createMatch();
  const out1 = resolveMatchRound(m, { side: 'atas', exact: null, stake: 100, risk: 'standar', aiStake: 10 }, () => 0.0);
  m = out1.state;
  assert.ok(m.over);
  const out2 = resolveMatchRound(m, { side: 'atas', exact: null, stake: 10, risk: 'standar', aiStake: 10 }, () => 0.9);
  assert.equal(out2.result, null);
  assert.equal(out2.state.roundsPlayed, 1);
});

console.log('\n[6] pertandingan: risiko & pembayaran transparan');
test('pengali risiko: standar 1, berani 2', () => {
  assert.equal(riskMultiplier('standar'), 1);
  assert.equal(riskMultiplier('berani'), 2);
  assert.equal(RISK_INFO.berani.multiplier, 2);
  assert.equal(effectiveStake(20, 'standar'), 20);
  assert.equal(effectiveStake(20, 'berani'), 40);
});
test('previewRound standar: angka persis sebelum lempar', () => {
  const p = previewRound(20, 17, 'standar');
  assert.deepEqual(
    { pe: p.playerEffective, ae: p.aiEffective, pot: p.pot, win: p.winGain, lose: p.loseLoss },
    { pe: 20, ae: 17, pot: 37, win: 17, lose: 20 },
  );
});
test('previewRound berani: kedua pihak digandakan', () => {
  const p = previewRound(20, 17, 'berani');
  assert.deepEqual(
    { pe: p.playerEffective, ae: p.aiEffective, pot: p.pot, win: p.winGain, lose: p.loseLoss },
    { pe: 40, ae: 34, pot: 74, win: 34, lose: 40 },
  );
});
test('berani menang: delta = 2x taruhan Bandar', () => {
  const out = resolveMatchRound(createMatch(), { side: 'atas', exact: null, stake: 20, risk: 'berani', aiStake: 17 }, () => 0.9);
  assert.equal(out.result?.roll.value, 6);
  assert.equal(out.result?.player, 'menang');
  assert.equal(out.result?.playerDelta, 34);
  assert.equal(out.result?.aiDelta, -34);
  assert.equal(out.result?.pot, 74);
  assert.equal(out.state.playerCoins, START_COINS + 34);
  assert.equal(out.state.aiCoins, START_COINS - 34);
});
test('berani kalah: delta = -2x taruhan pemain', () => {
  const out = resolveMatchRound(createMatch(), { side: 'atas', exact: null, stake: 20, risk: 'berani', aiStake: 17 }, () => 0.0);
  assert.equal(out.result?.roll.value, 1);
  assert.equal(out.result?.player, 'kalah');
  assert.equal(out.result?.playerDelta, -40);
  assert.equal(out.state.playerCoins, START_COINS - 40);
});
test('taruhan efektif dijepit koin yang dimiliki', () => {
  // koin 30, pilih berani nominal 20 -> efektif seharusnya 40, dijepit 30
  const m = createMatch(10, 30);
  const out = resolveMatchRound(m, { side: 'atas', exact: null, stake: 20, risk: 'berani', aiStake: 10 }, () => 0.0);
  assert.equal(out.result?.playerEffective, 30);
  assert.equal(out.result?.playerDelta, -30);
  assert.equal(out.state.playerCoins, 0);
});

console.log('\n[7] pertandingan: akhir menang/kalah & bangkrut');
test('10 ronde penuh: unggul koin di akhir = menang', () => {
  let m = createMatch();
  for (let i = 0; i < MATCH_ROUNDS; i += 1) {
    const out = resolveMatchRound(m, { side: 'atas', exact: null, stake: 5, risk: 'standar', aiStake: 5 }, () => 0.9);
    m = out.state;
    if (i < MATCH_ROUNDS - 1) assert.ok(!m.over, `belum selesai di ronde ${i + 1}`);
  }
  assert.equal(m.roundsPlayed, 10);
  assert.ok(m.over);
  assert.equal(m.winner, 'pemain');
  assert.equal(m.bankrupt, null);
  assert.equal(m.playerCoins, START_COINS + 50);
  assert.equal(m.aiCoins, START_COINS - 50);
  assert.equal(m.history.length, 10);
});
test('10 ronde penuh: tertinggal koin di akhir = kalah', () => {
  let m = createMatch();
  for (let i = 0; i < MATCH_ROUNDS; i += 1) {
    m = resolveMatchRound(m, { side: 'atas', exact: null, stake: 5, risk: 'standar', aiStake: 5 }, () => 0.0).state;
  }
  assert.ok(m.over);
  assert.equal(m.winner, 'ai');
  assert.equal(m.bankrupt, null);
  assert.equal(m.playerCoins, START_COINS - 50);
});
test('10 ronde imbang terus = seri', () => {
  let m = createMatch();
  // pas: rng[0] untuk angka Bandar (0 -> pilih 2), rng[1] untuk roll (0.4 -> angka 3, tak ada yang pas)
  for (let i = 0; i < MATCH_ROUNDS; i += 1) {
    m = resolveMatchRound(m, { side: 'pas', exact: 1, stake: 5, risk: 'standar', aiStake: 5 }, seqRng([0, 0.4])).state;
  }
  assert.ok(m.over);
  assert.equal(m.winner, 'seri');
  assert.equal(m.playerCoins, START_COINS);
  assert.equal(matchWinnerFor(120, 100), 'pemain');
  assert.equal(matchWinnerFor(80, 100), 'ai');
  assert.equal(matchWinnerFor(100, 100), 'seri');
});
test('bangkrut sebelum ronde habis = kalah seketika', () => {
  const out = resolveMatchRound(createMatch(), { side: 'atas', exact: null, stake: 100, risk: 'standar', aiStake: 10 }, () => 0.0);
  assert.equal(out.state.playerCoins, 0);
  assert.ok(out.state.over);
  assert.equal(out.state.roundsPlayed, 1);
  assert.ok(out.state.roundsPlayed < MATCH_ROUNDS);
  assert.equal(out.state.winner, 'ai');
  assert.equal(out.state.bankrupt, 'pemain');
});
test('Bandar bangkrut sebelum ronde habis = pemain menang seketika', () => {
  const out = resolveMatchRound(createMatch(), { side: 'atas', exact: null, stake: 5, risk: 'standar', aiStake: 97 }, () => 0.9);
  assert.equal(out.state.aiCoins, 3);
  assert.ok(out.state.aiCoins < MIN_STAKE);
  assert.ok(out.state.over);
  assert.equal(out.state.winner, 'pemain');
  assert.equal(out.state.bankrupt, 'ai');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
