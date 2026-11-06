/**
 * ArcadeInsectCatch ("Tangkap Perkakas") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/insect-catch/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  nextTool, fallSpeedAt, spawnDelayAt, tapPoints, gradeFor,
  GOLD_CHANCE, TOOL_META,
  missionForRound, createMission, isTargetKind, remainingFor, totalRemaining,
  isMissionComplete, applyTapToMission, roundBonus, advanceMission,
  missTimePenalty, spawnKindForMission, MISSION_KINDS,
  TARGET_MISS_TIME_PENALTY, TARGET_SPAWN_BIAS,
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

console.log('\n[1] nextTool');
test('semua perkakas bisa muncul', () => {
  const seen = new Set<string>();
  let s = 7;
  for (let i = 0; i < 300; i += 1) {
    seen.add(nextTool(() => { s = (s * 9301 + 49297) % 233280; return s / 233280; }));
  }
  for (const k of ['palu', 'obeng', 'kunci', 'meteran', 'bor-emas']) {
    assert.ok(seen.has(k), `${k} tak pernah muncul`);
  }
});
test('batas deterministik bor emas', () => {
  assert.equal(nextTool(() => 0.01), 'bor-emas');
  assert.equal(nextTool(() => 0.2), 'palu');
  assert.ok(GOLD_CHANCE > 0 && GOLD_CHANCE < 0.2);
});
test('meta lengkap', () => {
  for (const k of Object.keys(TOOL_META) as Array<keyof typeof TOOL_META>) {
    assert.ok(TOOL_META[k].icon.length > 0 && TOOL_META[k].name.length > 0);
  }
});

console.log('\n[2] fallSpeedAt & spawnDelayAt');
test('jatuh makin cepat', () => {
  assert.ok(fallSpeedAt(55, () => 0.5) > fallSpeedAt(5, () => 0.5));
});
test('spawn makin rapat', () => {
  assert.ok(spawnDelayAt(55, () => 0.5) < spawnDelayAt(5, () => 0.5));
  assert.ok(spawnDelayAt(60, () => 0.01) > 0);
});

console.log('\n[3] tapPoints');
test('base + kombo×2', () => {
  assert.equal(tapPoints('palu', 0), 10);
  assert.equal(tapPoints('palu', 5), 20);
  assert.equal(tapPoints('kunci', 3), 21);
  assert.equal(tapPoints('bor-emas', 0), 50);
  assert.equal(tapPoints('bor-emas', 4), 58);
});

console.log('\n[4] gradeFor');
test('grade S..D', () => {
  assert.equal(gradeFor(1500), 'S');
  assert.equal(gradeFor(1000), 'A');
  assert.equal(gradeFor(650), 'B');
  assert.equal(gradeFor(350), 'C');
  assert.equal(gradeFor(10), 'D');
});

console.log('\n[5] MISI SET PERKAKAS — pembeda mekanik vs Tangkap Helm (Gelombang 5)');
test('missionForRound: R1 = 5 target dari 2 jenis, tumbuh per ronde', () => {
  const m1 = missionForRound(1);
  assert.equal(Object.values(m1).reduce((a, b) => a + (b ?? 0), 0), 5);
  assert.equal(Object.keys(m1).length, 2);
  const m2 = missionForRound(2);
  assert.equal(Object.values(m2).reduce((a, b) => a + (b ?? 0), 0), 7);
  assert.equal(Object.keys(m2).length, 3);
  const m3 = missionForRound(3);
  assert.equal(Object.values(m3).reduce((a, b) => a + (b ?? 0), 0), 9);
  assert.equal(Object.keys(m3).length, 4);
  assert.ok(!('bor-emas' in m1) && !('bor-emas' in m3)); // bor emas tak pernah target
  assert.ok(Object.keys(m1).every((k) => MISSION_KINDS.includes(k as never)));
});
test('DISKRIMINATIF: ketuk target mengisi misi, non-target TIDAK', () => {
  const st = createMission(1); // R1: palu x3, obeng x2
  assert.ok(isTargetKind(st, 'palu'));
  assert.ok(!isTargetKind(st, 'kunci')); // kunci bukan target R1
  const rTarget = applyTapToMission(st, 'palu');
  assert.equal(rTarget.outcome, 'target');
  assert.equal(remainingFor(rTarget.state, 'palu'), remainingFor(st, 'palu') - 1);
  const rNon = applyTapToMission(st, 'kunci');
  assert.equal(rNon.outcome, 'non-target');
  assert.equal(totalRemaining(rNon.state), totalRemaining(st)); // misi tak bergerak
  assert.equal(rNon.roundCompleted, false);
  // state masukan tidak dimutasi (murni)
  assert.equal(remainingFor(st, 'palu'), 3);
});
test('bor emas = bonus, tidak mengisi misi', () => {
  const st = createMission(1);
  const r = applyTapToMission(st, 'bor-emas');
  assert.equal(r.outcome, 'bonus');
  assert.equal(totalRemaining(r.state), totalRemaining(st));
});
test('jenis target yang sudah penuh berubah jadi non-target', () => {
  let st = createMission(1);
  for (let i = 0; i < 3; i += 1) st = applyTapToMission(st, 'palu').state;
  assert.ok(!isTargetKind(st, 'palu'));
  assert.equal(applyTapToMission(st, 'palu').outcome, 'non-target');
});
test('misi tuntas tepat di ketukan terakhir -> advanceMission naik ronde & set membesar', () => {
  let st = createMission(1);
  let completedAt = -1;
  const seq = ['palu', 'palu', 'palu', 'obeng', 'obeng'] as const;
  seq.forEach((k, i) => {
    const r = applyTapToMission(st, k);
    st = r.state;
    if (r.roundCompleted) completedAt = i;
  });
  assert.equal(completedAt, seq.length - 1); // bukan sebelumnya
  assert.ok(isMissionComplete(st));
  const next = advanceMission(st);
  assert.equal(next.round, 2);
  assert.equal(totalRemaining(next), 7);
  assert.ok(roundBonus(2) > roundBonus(1));
});
test('DISKRIMINATIF jatuh: target kena penalti waktu, non-target tidak', () => {
  const st = createMission(1);
  assert.equal(missTimePenalty(st, 'palu'), TARGET_MISS_TIME_PENALTY);
  assert.equal(missTimePenalty(st, 'kunci'), 0); // non-target jatuh: hanya kombo putus
  assert.equal(missTimePenalty(st, 'bor-emas'), 0);
  // target yang sudah penuh pun tidak lagi kena penalti
  let full = createMission(1);
  for (let i = 0; i < 3; i += 1) full = applyTapToMission(full, 'palu').state;
  assert.equal(missTimePenalty(full, 'palu'), 0);
});
test('spawn bias misi: cabang bias selalu menghasilkan target yang dibutuhkan', () => {
  const st = createMission(1);
  // rng pertama 0.1 < TARGET_SPAWN_BIAS -> jalur target
  for (let pick = 0; pick < 6; pick += 1) {
    const kind = spawnKindForMission(st, () => 0.1, pick);
    assert.ok(isTargetKind(st, kind), `pick=${pick} kind=${kind}`);
  }
  assert.ok(TARGET_SPAWN_BIAS > 0.5 && TARGET_SPAWN_BIAS < 0.8);
  // rng di atas bias -> jalur acak lama tetap bisa jalan (bor emas mungkin)
  assert.equal(spawnKindForMission(st, () => 0.99, 0), 'meteran'); // nextTool jalur lama
});
test('BUKAN-BUG: non-target tetap dapat poin ketukan dasar', () => {
  // Kandidat: "non-target seharusnya 0 poin" akan mengubah ekonomi skor
  // lama. Desain yang dipilih: non-target tidak menghukum & tetap dapat
  // poin dasar tapPoints; yang membedakan HANYA progres misi. Dibuktikan
  // tapPoints tidak bergantung pada status target sama sekali.
  assert.equal(tapPoints('kunci', 0), TOOL_META.kunci.base);
  assert.ok(tapPoints('kunci', 0) > 0);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
