/**
 * EZRAB Game Space — command detection + Build Challenge logic tests.
 * Run: npx tsx src/test/gameSpace.test.ts
 *
 * Covers the mandatory test items that don't need a browser:
 *  - command `game` and all supported variants are detected (case/space-insensitive)
 *  - normal chat messages are NOT hijacked (still go to AI)
 *  - placement rules (valid + every invalid reason)
 *  - scoring: +100 valid, -25 invalid (floor 0), speed bonus
 *  - level completion, multi-level flow, win state
 */

import { strict as assert } from 'node:assert';
import { isGameCommand } from '../game-space/command';
import { ALL_GAMES } from '../game-space/catalog';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';
import {
  LEVELS, createGameState, tryPlace, canPlace, levelTargetMet,
  remainingTargets, levelBonus, resetForLevel, createBoard,
} from '../game-space/games/build-challenge/logic';

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

/* ================= 1. Command detection ================= */
console.log('\n[1] isGameCommand');
const shouldMatch = [
  'game', 'GAME', 'Game', '  game  ', 'game!', '/game', '/GAME',
  'main game', 'MAIN GAME', 'ayo main game', 'maen game',
  'buka game', 'bukain game', 'buka game dong', 'tampilkan game',
  'game space', 'GAME SPACE', 'buka game space',
];
shouldMatch.forEach((s) =>
  test(`match "${s}"`, () => assert.equal(isGameCommand(s), true)),
);
const shouldNotMatch = [
  '', '   ', 'gambarkan denah', 'bagaimana cara hitung RAB?',
  'apa itu game?', 'hitung volume beton', 'buka rab', '/rab',
  'game over', 'videogame', 'endgame', 'buka template rab',
];
shouldNotMatch.forEach((s) =>
  test(`no-match "${s || '(empty)'}"`, () => assert.equal(isGameCommand(s), false)),
);

/* ================= 2. Router integration ================= */
console.log('\n[2] routeIntent → OPEN_GAME_SPACE');
['game', '/game', 'main game', 'buka game', 'game space', '  GAME  '].forEach((s) =>
  test(`route "${s}"`, () => {
    const r = routeIntent(s);
    assert.equal(r.intent, 'OPEN_GAME_SPACE');
    assert.equal(r.localOnly, true, 'must not call AI provider');
    assert.equal(r.needsClarification, false);
  }),
);
// Probe "normal chat still goes to AI" memakai pertanyaan KONSEPTUAL
// (bukan hitungan): sejak 30b268e (2026-10-23, "routing intent
// diperluas") hitungan konstruksi yang polanya terparse PENUH dirutekan
// ke CALCULATE deterministik lokal (intentRouter langkah 4, Fase 4 QA
// kategori B) — tanpa LLM/kredit — sehingga probe lama 'hitung volume
// beton 10x8x0.12' kini benar CALCULATE, bukan UNKNOWN. Maksud tes ini
// (obrolan biasa tidak dibajak router game) dipertahankan dengan probe
// konseptual, DITAMBAH pin perilaku CALCULATE yang disengaja itu.
test('normal chat still goes to AI', () => {
  const r = routeIntent('apa itu beton bertulang?');
  assert.equal(r.intent, 'UNKNOWN');
  assert.equal(r.localOnly, false);
});
test('fully-parseable calculation routes to local CALCULATE (30b268e)', () => {
  const r = routeIntent('hitung volume beton 10x8x0.12');
  assert.equal(r.intent, 'CALCULATE');
  assert.equal(r.localOnly, true, 'deterministic local evaluator, no AI provider');
});
test('other commands unaffected', () => {
  assert.equal(routeIntent('/rab').intent, 'OPEN_RAB');
  assert.equal(routeIntent('buka template rab').intent, 'OPEN_TEMPLATE');
});
test('executeIntent returns openGameSpace flag + no navigation', () => {
  const res = executeIntent('OPEN_GAME_SPACE', undefined, {
    navigate: () => { throw new Error('must not navigate'); },
    currentMenu: 'ezrab-ai',
    activeProject: null,
    projects: [],
    projectTotal: null,
  });
  assert.equal(res.ok, true);
  assert.equal(res.openGameSpace, true);
  assert.equal(res.navigated, undefined);
  assert.ok(res.message.length > 0);
});

/* ================= 2b. Game questions → GAME_INFO ================= */
console.log('\n[2b] routeIntent → GAME_INFO (pertanyaan tentang game)');
['game apa saja?', 'ada game apa saja di ezrab?', 'game apa aja?', 'apa itu game?',
 'game bongkar rumah tentang apa?', 'jelaskan game yang ada di ezrab'].forEach((s) =>
  test(`route "${s}"`, () => {
    const r = routeIntent(s);
    assert.equal(r.intent, 'GAME_INFO');
    assert.equal(r.localOnly, true, 'jawaban katalog tidak boleh memanggil AI');
  }),
);
test('pernyataan tentang game (bukan pertanyaan) tetap ke AI', () => {
  // Tanpa verba perintah ("main game" = perintah panel, perilaku lama)
  // dan tanpa bingkai tanya → bukan GAME_INFO, mengalir ke AI.
  const r = routeIntent('saya suka game strategi');
  assert.equal(r.intent, 'UNKNOWN');
  assert.equal(r.localOnly, false);
});
test('katalog: 61 game (11 konstruksi + 50 arcade)', () => {
  assert.equal(ALL_GAMES.length, 61);
  assert.equal(ALL_GAMES.filter((g) => g.cat === 'construction').length, 11);
  assert.equal(ALL_GAMES.filter((g) => g.cat === 'arcade').length, 50);
});
const gameInfoCtx = (rawText: string) => ({
  navigate: () => { throw new Error('must not navigate'); },
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
  rawText,
});
test('jawaban "game apa saja?" memuat semua game + tombol buka', () => {
  const res = executeIntent('GAME_INFO', 'game apa saja?', gameInfoCtx('game apa saja?'));
  assert.equal(res.ok, true);
  assert.ok(res.message.includes('Ada!'), 'wajib menjawab ADA');
  assert.ok(res.message.includes('61 mini-game'));
  for (const title of ['Bongkar Rumah', 'Build Challenge', 'Pak Mandor', 'Catur Proyek', 'Sortir Material']) {
    assert.ok(res.message.includes(title), `jawaban harus memuat ${title}`);
  }
  assert.ok(res.actions?.some((a) => a.label === 'Buka Game Space'));
});
test('pertanyaan game spesifik menjawab game itu saja', () => {
  const res = executeIntent('GAME_INFO', 'game bongkar rumah tentang apa?',
    gameInfoCtx('game bongkar rumah tentang apa?'));
  assert.ok(res.message.includes('Bongkar Rumah'));
  assert.ok(res.message.includes('rata dengan tanah'), 'isi/deskripsi game ikut dijawab');
  assert.ok(!res.message.includes('Pak Mandor'), 'game lain tidak ikut ditumpahkan');
});

/* ================= 3. Placement rules ================= */
console.log('\n[3] placement rules');
test('pondasi on empty ground: ok +100', () => {
  const s = createGameState();
  const r = tryPlace(s, 'pondasi', 3, 3);
  assert.equal(r.ok, true);
  assert.equal(s.score, 100);
  assert.equal(s.counts.pondasi, 1);
});
test('pondasi on occupied: invalid (occupied)', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 3, 3);
  const r = tryPlace(s, 'pondasi', 3, 3);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'occupied');
});
test('kolom needs pondasi below', () => {
  const s = createGameState();
  const bad = tryPlace(s, 'kolom', 0, 0);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'need-pondasi');
  tryPlace(s, 'pondasi', 0, 0);
  const good = tryPlace(s, 'kolom', 0, 0);
  assert.equal(good.ok, true);
});
test('balok needs kolom below', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 1, 1);
  const bad = tryPlace(s, 'balok', 1, 1);
  assert.equal(bad.reason, 'need-kolom');
  tryPlace(s, 'kolom', 1, 1);
  assert.equal(tryPlace(s, 'balok', 1, 1).ok, true);
});
test('atap needs balok below', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 2, 2);
  tryPlace(s, 'kolom', 2, 2);
  const bad = tryPlace(s, 'atap', 2, 2);
  assert.equal(bad.reason, 'need-balok');
  tryPlace(s, 'balok', 2, 2);
  assert.equal(tryPlace(s, 'atap', 2, 2).ok, true);
});
test('dinding needs empty cell adjacent to pondasi', () => {
  const s = createGameState();
  const far = tryPlace(s, 'dinding', 7, 7);
  assert.equal(far.ok, false);
  assert.equal(far.reason, 'need-adjacent');
  tryPlace(s, 'pondasi', 4, 4);
  assert.equal(tryPlace(s, 'dinding', 5, 4).ok, true);
  const occupied = tryPlace(s, 'dinding', 4, 4);
  assert.equal(occupied.reason, 'occupied');
});
test('out of bounds rejected', () => {
  const s = createGameState();
  assert.equal(tryPlace(s, 'pondasi', -1, 0).reason, 'out');
  assert.equal(tryPlace(s, 'pondasi', 8, 8).reason, 'out');
});
test('invalid attempt: -25, score never below 0', () => {
  const s = createGameState();
  tryPlace(s, 'kolom', 0, 0); // -25 → floor 0
  assert.equal(s.score, 0);
  assert.equal(s.invalidAttempts, 1);
  tryPlace(s, 'pondasi', 0, 0); // +100
  tryPlace(s, 'kolom', 1, 1); // -25 → 75
  assert.equal(s.score, 75);
});
test('moves counted on every attempt', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 0, 0);
  tryPlace(s, 'kolom', 5, 5); // invalid
  assert.equal(s.moves, 2);
});

/* ================= 4. Levels & win ================= */
console.log('\n[4] levels & win');
function buildLevel1(s: ReturnType<typeof createGameState>): void {
  const cells: Array<[number, number]> = [[3, 3], [4, 3], [3, 4], [4, 4]];
  cells.forEach(([x, z]) => tryPlace(s, 'pondasi', x, z));
  cells.forEach(([x, z]) => tryPlace(s, 'kolom', x, z));
}
test('level 1 completes after 4 pondasi + 4 kolom', () => {
  const s = createGameState();
  assert.equal(levelTargetMet(s), false);
  buildLevel1(s);
  assert.equal(levelTargetMet(s), true);
  const rem = remainingTargets(s);
  assert.deepEqual(rem, { pondasi: 0, kolom: 0, balok: 0, dinding: 0, atap: 0 });
});
test('partial progress not complete', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 3, 3);
  tryPlace(s, 'kolom', 3, 3);
  assert.equal(levelTargetMet(s), false);
  assert.equal(remainingTargets(s).pondasi, 3);
});
test('level bonus: faster = bigger, never negative', () => {
  assert.ok(levelBonus(0, 30) > levelBonus(0, 80));
  assert.equal(levelBonus(0, 9999), 0);
  assert.equal(levelBonus(0, 90), 0);
});
test('resetForLevel clears board, keeps score', () => {
  const s = createGameState();
  buildLevel1(s);
  const scoreBefore = s.score;
  resetForLevel(s, 1);
  assert.equal(s.levelIdx, 1);
  assert.equal(s.score, scoreBefore);
  assert.equal(s.counts.pondasi, 0);
  assert.equal(levelTargetMet(s), false);
});
test('canPlace is pure (no mutation)', () => {
  const b = createBoard();
  const before = JSON.stringify(b);
  canPlace(b, 'kolom', 0, 0);
  canPlace(b, 'pondasi', 0, 0);
  assert.equal(JSON.stringify(b), before);
});
test('3 levels defined with sane targets', () => {
  assert.equal(LEVELS.length, 3);
  LEVELS.forEach((l) => {
    const total = Object.values(l.targets).reduce((a, v) => a + v, 0);
    assert.ok(total > 0, `level ${l.id} has targets`);
    assert.ok(l.parSec > 0, `level ${l.id} has par time`);
  });
});

/* ================= summary ================= */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
