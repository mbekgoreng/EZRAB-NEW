/**
 * Build Challenge — logic tests (tes PERTAMA game ini).
 * Run: npx tsx src/game-space/games/build-challenge/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  GRID, COMP_ORDER, COMP_META, LEVELS, INVALID_PENALTY, BONUS_PER_SEC,
  createBoard, canPlace, createGameState, tryPlace,
  levelTargetMet, remainingTargets, levelBonus, resetForLevel,
  totalPlacementsAllLevels,
  type Board, type CompType, type GameState,
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

/** Board kosong dengan tumpukan yang disiapkan manual di beberapa sel. */
function boardWith(cells: Partial<Record<string, CompType[]>>): Board {
  const b = createBoard();
  for (const [key, stack] of Object.entries(cells)) {
    const [x, z] = key.split(',').map(Number);
    b[x][z] = [...(stack as CompType[])];
  }
  return b;
}

/** Susunan site untuk playthrough: 4 kolom struktur + sel dinding di antaranya. */
const PONDASI_CELLS: Array<[number, number]> = [[2, 2], [2, 4], [4, 2], [4, 4]];
const DINDING_CELLS_4: Array<[number, number]> = [[2, 3], [3, 2], [3, 4], [4, 3]];
const DINDING_CELLS_6: Array<[number, number]> = [...DINDING_CELLS_4, [2, 1], [5, 2]];

function placeAll(state: GameState, type: CompType, cells: Array<[number, number]>): void {
  for (const [x, z] of cells) {
    const r = tryPlace(state, type, x, z);
    assert.equal(r.ok, true, `${type} di (${x},${z}) harus valid, dapat: ${r.reason ?? '?'}`);
    assert.equal(r.delta, 100);
  }
}

/* ------------------------------------------------------------------ */
console.log('\n[1] createBoard / createGameState');
test('createBoard: 8x8 semua sel kosong', () => {
  const b = createBoard();
  assert.equal(b.length, GRID);
  for (const col of b) {
    assert.equal(col.length, GRID);
    for (const cell of col) assert.deepEqual(cell, []);
  }
});
test('createGameState: level 0, skor/langkah 0, counts bersih', () => {
  const s = createGameState();
  assert.equal(s.levelIdx, 0);
  assert.equal(s.score, 0);
  assert.equal(s.moves, 0);
  assert.equal(s.invalidAttempts, 0);
  assert.deepEqual(s.counts, { pondasi: 0, kolom: 0, balok: 0, dinding: 0, atap: 0 });
});
test('semua komponen bernilai 100 poin (COMP_META)', () => {
  for (const c of COMP_ORDER) assert.equal(COMP_META[c].points, 100, c);
  assert.equal(INVALID_PENALTY, 25);
});

/* ------------------------------------------------------------------ */
console.log('\n[2] canPlace — jalur valid kelima komponen (+100)');
test('pondasi valid di tanah kosong', () => {
  assert.deepEqual(canPlace(createBoard(), 'pondasi', 0, 0), { ok: true, delta: 100 });
  assert.deepEqual(canPlace(createBoard(), 'pondasi', 7, 7), { ok: true, delta: 100 });
});
test('kolom valid di atas pondasi', () => {
  const b = boardWith({ '3,3': ['pondasi'] });
  assert.deepEqual(canPlace(b, 'kolom', 3, 3), { ok: true, delta: 100 });
});
test('balok valid di atas kolom', () => {
  const b = boardWith({ '3,3': ['pondasi', 'kolom'] });
  assert.deepEqual(canPlace(b, 'balok', 3, 3), { ok: true, delta: 100 });
});
test('dinding valid di tanah kosong menempel pondasi (4 arah)', () => {
  const b = boardWith({ '3,3': ['pondasi'] });
  for (const [x, z] of [[4, 3], [2, 3], [3, 4], [3, 2]] as Array<[number, number]>) {
    assert.deepEqual(canPlace(b, 'dinding', x, z), { ok: true, delta: 100 }, `(${x},${z})`);
  }
});
test('dinding tetap valid walau pondasi tetangga sudah bertumpuk kolom/balok', () => {
  const b = boardWith({ '3,3': ['pondasi', 'kolom', 'balok'] });
  assert.deepEqual(canPlace(b, 'dinding', 3, 4), { ok: true, delta: 100 });
});
test('atap valid di atas balok', () => {
  const b = boardWith({ '3,3': ['pondasi', 'kolom', 'balok'] });
  assert.deepEqual(canPlace(b, 'atap', 3, 3), { ok: true, delta: 100 });
});

/* ------------------------------------------------------------------ */
console.log('\n[3] canPlace — semua InvalidReason (delta −25)');
test("'out': di luar grid untuk semua komponen", () => {
  const b = createBoard();
  for (const c of COMP_ORDER) {
    for (const [x, z] of [[-1, 0], [0, -1], [GRID, 0], [0, GRID], [99, 99]] as Array<[number, number]>) {
      assert.deepEqual(canPlace(b, c, x, z), { ok: false, reason: 'out', delta: -25 }, `${c} (${x},${z})`);
    }
  }
});
test("'occupied': pondasi di sel yang sudah terisi", () => {
  const b = boardWith({ '1,1': ['pondasi'] });
  assert.deepEqual(canPlace(b, 'pondasi', 1, 1), { ok: false, reason: 'occupied', delta: -25 });
});
test("'occupied': pondasi di atas tumpukan lengkap tetap occupied", () => {
  const b = boardWith({ '1,1': ['pondasi', 'kolom', 'balok', 'atap'] });
  assert.deepEqual(canPlace(b, 'pondasi', 1, 1), { ok: false, reason: 'occupied', delta: -25 });
});
test("'occupied': dinding di sel yang sudah terisi", () => {
  const b = boardWith({ '1,1': ['pondasi'], '1,2': ['dinding'] });
  assert.deepEqual(canPlace(b, 'dinding', 1, 2), { ok: false, reason: 'occupied', delta: -25 });
});
test("'need-pondasi': kolom di tanah kosong", () => {
  assert.deepEqual(canPlace(createBoard(), 'kolom', 2, 2), { ok: false, reason: 'need-pondasi', delta: -25 });
});
test("'need-pondasi': kolom di atas kolom (puncak bukan pondasi)", () => {
  const b = boardWith({ '2,2': ['pondasi', 'kolom'] });
  assert.deepEqual(canPlace(b, 'kolom', 2, 2), { ok: false, reason: 'need-pondasi', delta: -25 });
});
test("'need-kolom': balok di tanah kosong", () => {
  assert.deepEqual(canPlace(createBoard(), 'balok', 2, 2), { ok: false, reason: 'need-kolom', delta: -25 });
});
test("'need-kolom': balok langsung di atas pondasi", () => {
  const b = boardWith({ '2,2': ['pondasi'] });
  assert.deepEqual(canPlace(b, 'balok', 2, 2), { ok: false, reason: 'need-kolom', delta: -25 });
});
test("'need-balok': atap di tanah kosong", () => {
  assert.deepEqual(canPlace(createBoard(), 'atap', 2, 2), { ok: false, reason: 'need-balok', delta: -25 });
});
test("'need-balok': atap di atas kolom (belum ada balok)", () => {
  const b = boardWith({ '2,2': ['pondasi', 'kolom'] });
  assert.deepEqual(canPlace(b, 'atap', 2, 2), { ok: false, reason: 'need-balok', delta: -25 });
});
test("'need-adjacent': dinding jauh dari pondasi mana pun", () => {
  const b = boardWith({ '0,0': ['pondasi'] });
  assert.deepEqual(canPlace(b, 'dinding', 5, 5), { ok: false, reason: 'need-adjacent', delta: -25 });
});
test("'need-adjacent': dinding diagonal terhadap pondasi TIDAK dihitung menempel", () => {
  const b = boardWith({ '3,3': ['pondasi'] });
  assert.deepEqual(canPlace(b, 'dinding', 4, 4), { ok: false, reason: 'need-adjacent', delta: -25 });
  assert.deepEqual(canPlace(b, 'dinding', 2, 2), { ok: false, reason: 'need-adjacent', delta: -25 });
});
test("'need-adjacent': dinding di board yang sama sekali kosong", () => {
  assert.deepEqual(canPlace(createBoard(), 'dinding', 0, 0), { ok: false, reason: 'need-adjacent', delta: -25 });
});

/* ------------------------------------------------------------------ */
console.log('\n[4] tryPlace — skor, penghitung, mutasi state');
test('penempatan valid: +100, board & counts berubah, moves +1', () => {
  const s = createGameState();
  const r = tryPlace(s, 'pondasi', 2, 2);
  assert.deepEqual(r, { ok: true, delta: 100 });
  assert.equal(s.score, 100);
  assert.equal(s.moves, 1);
  assert.equal(s.invalidAttempts, 0);
  assert.deepEqual(s.board[2][2], ['pondasi']);
  assert.equal(s.counts.pondasi, 1);
});
test('tumpukan valid berurutan: pondasi→kolom→balok→atap = +400', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 1, 1);
  tryPlace(s, 'kolom', 1, 1);
  tryPlace(s, 'balok', 1, 1);
  const r = tryPlace(s, 'atap', 1, 1);
  assert.equal(r.ok, true);
  assert.equal(s.score, 400);
  assert.equal(s.moves, 4);
  assert.deepEqual(s.board[1][1], ['pondasi', 'kolom', 'balok', 'atap']);
  assert.deepEqual(s.counts, { pondasi: 1, kolom: 1, balok: 1, dinding: 0, atap: 1 });
});
test('penempatan invalid: −25, moves & invalidAttempts +1, board/counts TIDAK berubah', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 2, 2); // skor 100
  const boardBefore = JSON.stringify(s.board);
  const countsBefore = { ...s.counts };
  const r = tryPlace(s, 'kolom', 5, 5); // need-pondasi
  assert.deepEqual(r, { ok: false, reason: 'need-pondasi', delta: -25 });
  assert.equal(s.score, 75);
  assert.equal(s.moves, 2);
  assert.equal(s.invalidAttempts, 1);
  assert.equal(JSON.stringify(s.board), boardBefore);
  assert.deepEqual(s.counts, countsBefore);
});
test('penalti tidak menembus lantai skor 0', () => {
  const s = createGameState();
  const r1 = tryPlace(s, 'atap', 0, 0); // invalid dari skor 0
  assert.equal(r1.ok, false);
  assert.equal(s.score, 0);
  tryPlace(s, 'pondasi', 0, 0); // +100 → 100
  tryPlace(s, 'atap', 1, 1); // −25 → 75
  tryPlace(s, 'atap', 1, 1); // −25 → 50
  tryPlace(s, 'atap', 1, 1); // −25 → 25
  tryPlace(s, 'atap', 1, 1); // −25 → 0
  const rLast = tryPlace(s, 'atap', 1, 1); // tetap 0, bukan negatif
  assert.equal(rLast.ok, false);
  assert.equal(s.score, 0);
  assert.equal(s.invalidAttempts, 6); // 1 awal + 4 penguras + 1 di lantai 0
  assert.equal(s.moves, 7);
});
test('penempatan out-of-bounds lewat tryPlace juga kena penalti & tercatat', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 0, 0); // skor 100
  const r = tryPlace(s, 'pondasi', -1, 3);
  assert.deepEqual(r, { ok: false, reason: 'out', delta: -25 });
  assert.equal(s.score, 75);
  assert.equal(s.invalidAttempts, 1);
});

/* ------------------------------------------------------------------ */
console.log('\n[5] levelTargetMet & remainingTargets');
test('state baru: target level 1 belum terpenuhi, remaining = target penuh', () => {
  const s = createGameState();
  assert.equal(levelTargetMet(s), false);
  assert.deepEqual(remainingTargets(s), { pondasi: 4, kolom: 4, balok: 0, dinding: 0, atap: 0 });
});
test('remaining berkurang tepat mengikuti penempatan', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 0, 0);
  tryPlace(s, 'pondasi', 0, 1);
  tryPlace(s, 'kolom', 0, 0);
  assert.deepEqual(remainingTargets(s), { pondasi: 2, kolom: 3, balok: 0, dinding: 0, atap: 0 });
  assert.equal(levelTargetMet(s), false);
});
test('remaining ter-clamp di 0 bila counts melebihi target', () => {
  const s = createGameState(); // level 1: target pondasi 4, balok 0
  for (const [x, z] of [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] as Array<[number, number]>) {
    tryPlace(s, 'pondasi', x, z);
  }
  assert.equal(s.counts.pondasi, 5);
  assert.equal(remainingTargets(s).pondasi, 0);
  assert.equal(remainingTargets(s).balok, 0);
});
test('levelTargetMet true tepat saat semua target level terpenuhi', () => {
  const s = createGameState();
  placeAll(s, 'pondasi', PONDASI_CELLS);
  assert.equal(levelTargetMet(s), false); // kolom belum
  placeAll(s, 'kolom', PONDASI_CELLS.slice(0, 3));
  assert.equal(levelTargetMet(s), false);
  placeAll(s, 'kolom', PONDASI_CELLS.slice(3));
  assert.equal(levelTargetMet(s), true);
});

/* ------------------------------------------------------------------ */
console.log('\n[6] levelBonus');
test('di bawah par: bonus = sisa detik × 5', () => {
  assert.equal(levelBonus(0, 0), LEVELS[0].parSec * BONUS_PER_SEC); // 90×5 = 450
  assert.equal(levelBonus(0, 30), 300);
  assert.equal(levelBonus(1, 100), 250); // par 150
  assert.equal(levelBonus(2, 100), 400); // par 180
});
test('tepat par: bonus 0', () => {
  for (let i = 0; i < LEVELS.length; i += 1) {
    assert.equal(levelBonus(i, LEVELS[i].parSec), 0, `level ${i}`);
  }
});
test('di atas par: bonus 0 (tidak negatif)', () => {
  assert.equal(levelBonus(0, 91), 0);
  assert.equal(levelBonus(0, 9999), 0);
  assert.equal(levelBonus(2, 181), 0);
});
test('sisa pecahan detik dibulatkan (Math.round)', () => {
  assert.equal(levelBonus(0, 89.4), 5); // round(0.6) = 1 detik
  assert.equal(levelBonus(0, 89.6), 0); // round(0.4) = 0 detik
});

/* ------------------------------------------------------------------ */
console.log('\n[7] resetForLevel');
test('board & counts bersih, levelIdx berganti, skor/moves/invalid dipertahankan', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 2, 2);
  tryPlace(s, 'kolom', 2, 2);
  tryPlace(s, 'atap', 7, 7); // invalid → invalidAttempts 1, skor 175
  const scoreBefore = s.score;
  const movesBefore = s.moves;
  resetForLevel(s, 1);
  assert.equal(s.levelIdx, 1);
  assert.deepEqual(s.counts, { pondasi: 0, kolom: 0, balok: 0, dinding: 0, atap: 0 });
  for (const col of s.board) for (const cell of col) assert.deepEqual(cell, []);
  assert.equal(s.score, scoreBefore);
  assert.equal(s.moves, movesBefore);
  assert.equal(s.invalidAttempts, 1);
  assert.equal(levelTargetMet(s), false);
  assert.deepEqual(remainingTargets(s), LEVELS[1].targets);
});
test('reset ke level yang sama pun membersihkan board', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 0, 0);
  resetForLevel(s, 0);
  assert.deepEqual(s.board[0][0], []);
  assert.equal(s.counts.pondasi, 0);
});

/* ------------------------------------------------------------------ */
console.log('\n[8] totalPlacementsAllLevels');
test('sama dengan jumlah target ketiga level yang dihitung dari LEVELS', () => {
  const fromData = LEVELS.reduce(
    (sum, l) => sum + (Object.keys(l.targets) as CompType[]).reduce((acc, k) => acc + l.targets[k], 0),
    0,
  );
  assert.equal(totalPlacementsAllLevels(), fromData);
});
test('rincian per level dari data: 8 + 16 + 22 = 46', () => {
  const perLevel = LEVELS.map((l) =>
    (Object.keys(l.targets) as CompType[]).reduce((acc, k) => acc + l.targets[k], 0));
  assert.deepEqual(perLevel, [8, 16, 22]);
  assert.equal(totalPlacementsAllLevels(), 46);
});

/* ------------------------------------------------------------------ */
console.log('\n[9] SIMULASI PLAYTHROUGH PENUH — ketiga level terselesaikan');
test('level 1 selesai: 4 pondasi → 4 kolom (8 penempatan)', () => {
  const s = createGameState();
  placeAll(s, 'pondasi', PONDASI_CELLS);
  assert.equal(levelTargetMet(s), false);
  placeAll(s, 'kolom', PONDASI_CELLS);
  assert.equal(levelTargetMet(s), true);
  assert.deepEqual(s.counts, LEVELS[0].targets);
  assert.equal(s.score, 800);
  assert.equal(s.moves, 8);
});
test('level 2 selesai: pondasi → kolom → balok → 4 dinding menempel (16 penempatan)', () => {
  const s = createGameState();
  resetForLevel(s, 1);
  placeAll(s, 'pondasi', PONDASI_CELLS);
  placeAll(s, 'kolom', PONDASI_CELLS);
  placeAll(s, 'balok', PONDASI_CELLS);
  assert.equal(levelTargetMet(s), false); // dinding belum
  placeAll(s, 'dinding', DINDING_CELLS_4);
  assert.equal(levelTargetMet(s), true);
  assert.deepEqual(s.counts, LEVELS[1].targets);
  assert.equal(s.moves, 16);
});
test('level 3 selesai: + 6 dinding + 4 atap di atas balok (22 penempatan)', () => {
  const s = createGameState();
  resetForLevel(s, 2);
  placeAll(s, 'pondasi', PONDASI_CELLS);
  placeAll(s, 'kolom', PONDASI_CELLS);
  placeAll(s, 'balok', PONDASI_CELLS);
  placeAll(s, 'dinding', DINDING_CELLS_6);
  assert.equal(levelTargetMet(s), false); // atap belum
  placeAll(s, 'atap', PONDASI_CELLS);
  assert.equal(levelTargetMet(s), true);
  assert.deepEqual(s.counts, LEVELS[2].targets);
  assert.equal(s.moves, 22);
});
test('playthrough berurutan 3 level dalam satu state: 46 penempatan valid, skor 4600, 0 invalid', () => {
  const s = createGameState();
  // Level 1
  placeAll(s, 'pondasi', PONDASI_CELLS);
  placeAll(s, 'kolom', PONDASI_CELLS);
  assert.equal(levelTargetMet(s), true, 'level 1 harus selesai');
  // Level 2
  resetForLevel(s, 1);
  placeAll(s, 'pondasi', PONDASI_CELLS);
  placeAll(s, 'kolom', PONDASI_CELLS);
  placeAll(s, 'balok', PONDASI_CELLS);
  placeAll(s, 'dinding', DINDING_CELLS_4);
  assert.equal(levelTargetMet(s), true, 'level 2 harus selesai');
  // Level 3
  resetForLevel(s, 2);
  placeAll(s, 'pondasi', PONDASI_CELLS);
  placeAll(s, 'kolom', PONDASI_CELLS);
  placeAll(s, 'balok', PONDASI_CELLS);
  placeAll(s, 'dinding', DINDING_CELLS_6);
  placeAll(s, 'atap', PONDASI_CELLS);
  assert.equal(levelTargetMet(s), true, 'level 3 harus selesai');
  // Bukti keseluruhan: setiap target di ketiga level tercapai tanpa satu pun invalid.
  assert.equal(s.moves, totalPlacementsAllLevels());
  assert.equal(s.moves, 46);
  assert.equal(s.invalidAttempts, 0);
  assert.equal(s.score, 46 * 100);
});

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
