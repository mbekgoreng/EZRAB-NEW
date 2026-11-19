/**
 * EZRAB Game Space — prompt "putar HP" untuk game landscape.
 * Run: npx tsx src/test/gameRotatePrompt.test.ts
 *
 * Perintah owner 2026-11-19: "bila game landscape kasih notif rotate hpmu".
 *
 * Covers (murni, tanpa browser — logika tampilan di stage.ts):
 *  - isLandscapeGame: 19 game landscape-native terdeteksi dari STAGE_SPECS,
 *    game portrait/square bukan landscape, dan ke-12 game PORTRAIT_LOCKED
 *    tidak pernah landscape (prompt tidak boleh mengganggu portrait-lock).
 *  - shouldShowRotatePrompt: muncul HANYA bila game landscape + HP
 *    portrait + perangkat ringkas + pointer kasar; tidak di desktop
 *    (pointer halus), tidak di landscape, tidak di tablet, tidak untuk
 *    game portrait/square; batas ambang COMPACT_SHORT_SIDE (520px).
 */

import { strict as assert } from 'node:assert';
import {
  COMPACT_SHORT_SIDE,
  LAND,
  PORTRAIT_LOCKED_IDS,
  SQUARE,
  STAGE_PORTRAIT,
  STAGE_SPECS,
  isLandscapeGame,
  shouldShowRotatePrompt,
} from '../game-space/stage';

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

/* ================= 1. Daftar game landscape ================= */
console.log('\n[1] isLandscapeGame — 19 game landscape-native');
const EXPECTED_LANDSCAPE = [
  // Konstruksi (7)
  'bongkar-rumah',
  'build-challenge',
  'head-soccer-mandor',
  'ketapel-konstruksi',
  'lari-proyek',
  'selamatkan-mandor',
  'tebas-material',
  // Arcade (12)
  'arcade-archery',
  'arcade-breakout',
  'arcade-capit-crane',
  'arcade-dice-roll',
  'arcade-emoji-catcher',
  'arcade-fruit-slicer',
  'arcade-hangman',
  'arcade-insect-catch',
  'arcade-ping-pong',
  'arcade-shape-clicker',
  'arcade-sortir-material',
  'arcade-space-invaders',
];
test('tepat 19 game landscape', () => assert.equal(EXPECTED_LANDSCAPE.length, 19));
EXPECTED_LANDSCAPE.forEach((id) =>
  test(`landscape: ${id}`, () => assert.equal(isLandscapeGame(id), true)),
);
// Anti-drift: tidak ada game landscape lain di STAGE_SPECS di luar daftar.
test('STAGE_SPECS tidak punya landscape di luar daftar', () => {
  const found = Object.entries(STAGE_SPECS)
    .filter(([, spec]) => spec.w > spec.h)
    .map(([id]) => id)
    .sort();
  assert.deepEqual(found, [...EXPECTED_LANDSCAPE].sort());
});

/* ================= 2. Bukan landscape ================= */
console.log('\n[2] isLandscapeGame — portrait & square bukan landscape');
const PORTRAIT_SAMPLE = [
  'flappy-mandor', // portrait-locked
  'arcade-tetris', // sumur vertikal (default portrait)
  'arcade-2048', // tumpukan DOM vertikal (default portrait)
  'arcade-memory-card', // papan DOM bertumpuk vertikal
  'arcade-doodle-jump', // gameplay vertikal
  'game-tidak-ada', // id tak dikenal = default portrait
];
PORTRAIT_SAMPLE.forEach((id) =>
  test(`bukan landscape (portrait): ${id}`, () => assert.equal(isLandscapeGame(id), false)),
);
const SQUARE_SAMPLE = [
  'gabung-blok',
  'sambung-kata',
  'sudoku-tukang',
  'arcade-pac-man',
  'arcade-chess',
  'arcade-snake',
];
SQUARE_SAMPLE.forEach((id) =>
  test(`bukan landscape (square): ${id}`, () => assert.equal(isLandscapeGame(id), false)),
);
test('ke-12 game PORTRAIT_LOCKED bukan landscape', () => {
  assert.equal(PORTRAIT_LOCKED_IDS.size, 12);
  for (const id of PORTRAIT_LOCKED_IDS) {
    assert.equal(isLandscapeGame(id), false, `${id} tidak boleh landscape`);
  }
});

/* ================= 3. Matriks keputusan prompt ================= */
console.log('\n[3] shouldShowRotatePrompt — matriks');
// HP portrait + pointer kasar + game landscape = MUNCUL
test('muncul: landscape + HP portrait 390×700 + sentuh', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 390, 700, true), true));
test('muncul: landscape + HP kecil 360×640 + sentuh', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 360, 640, true), true));
test('muncul: landscape + HP besar 430×932 + sentuh', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 430, 932, true), true));
test('muncul: landscape + sisi pendek 519 + sentuh', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 519, 900, true), true));
// TIDAK muncul: sudah landscape
test('tidak muncul: sudah landscape 700×390', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 700, 390, true), false));
test('tidak muncul: persegi 700×700 (bukan portrait)', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 700, 700, true), false));
// TIDAK muncul: desktop (pointer halus), walau jendelanya sempit-tinggi
test('tidak muncul: desktop pointer halus 390×700', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 390, 700, false), false));
test('tidak muncul: desktop 1200×800', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 1200, 800, false), false));
// TIDAK muncul: tablet (sisi pendek >= 520)
test('tidak muncul: tablet portrait 768×1024 + sentuh', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 768, 1024, true), false));
test('tidak muncul: batas ambang sisi pendek 520', () =>
  assert.equal(shouldShowRotatePrompt(LAND, 520, 900, true), false));
test('ambang COMPACT_SHORT_SIDE = 520', () => assert.equal(COMPACT_SHORT_SIDE, 520));
// TIDAK muncul: game portrait/square, walau HP portrait
test('tidak muncul: game portrait + HP portrait', () =>
  assert.equal(shouldShowRotatePrompt(STAGE_PORTRAIT, 390, 700, true), false));
test('tidak muncul: game square + HP portrait', () =>
  assert.equal(shouldShowRotatePrompt(SQUARE, 390, 700, true), false));

/* ================= Ringkasan ================= */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failures: ${failures.join(', ')}`);
  process.exit(1);
}
