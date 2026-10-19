/**
 * Tukang Nyebrang (Frogger) logic tests. Run: npx tsx src/game-space/games/arcade/frogger/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  COLS, ROWS, HOME_COLS, START_LIVES, ATTEMPT_TIME, HOME_SCORE, ROW_SCORE,
  createGame, move, update, obstacleCells, homesFilled, mulberry32,
  type Game,
} from './logic';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}

test('spawn di tengah bawah, nyawa 3', () => {
  const g = createGame(1);
  assert.equal(g.lives, START_LIVES);
  assert.equal(g.y, ROWS - 1);
  assert.equal(Math.round(g.fx), (COLS - 1) / 2);
  assert.equal(g.status, 'playing');
  assert.equal(g.lanes.length, ROWS);
  assert.equal(g.lanes[1].kind, 'river');
  assert.equal(g.lanes[5].kind, 'safe');
  assert.equal(g.lanes[6].kind, 'road');
});

test('bergerak dalam batas & skor progres', () => {
  const g = createGame(2);
  const s0 = g.score;
  assert.equal(move(g, -1, 0), 'moved');
  assert.equal(move(g, 1, 0), 'moved');
  assert.equal(move(g, 0, 1), 'blocked', 'tidak bisa turun dari start');
  assert.equal(move(g, -10, 0), 'blocked', 'tidak bisa keluar kiri');
  // lompat ke tepi kiri lalu coba keluar
  for (let i = 0; i < 5; i += 1) move(g, -1, 0);
  assert.equal(Math.round(g.fx), 0);
  assert.equal(move(g, -1, 0), 'blocked');
  void s0;
});

test('maju ke atas dapat skor ROW_SCORE per baris', () => {
  const g = createGame(3);
  // matikan rintangan jalan agar fokus ke skor
  for (const lane of g.lanes) lane.obstacles = [];
  move(g, 0, -1); // baris 9
  assert.equal(g.score, ROW_SCORE);
  move(g, 0, 1); // mundur, tidak dapat skor
  assert.equal(g.score, ROW_SCORE, 'mundur tidak menambah skor');
  move(g, 0, -1); // kembali ke 9, tidak dobel
  assert.equal(g.score, ROW_SCORE, 'baris lama tidak dihitung ulang');
  move(g, 0, -1); // baris 8
  assert.equal(g.score, ROW_SCORE * 2);
});

test('kelindas kendaraan = mati, nyawa berkurang, respawn', () => {
  const g = createGame(4);
  // paksa kendaraan menutupi sel tukang di baris 9 (jalan)
  const lane = g.lanes[9];
  lane.obstacles = [{ start: 4, len: 2 }];
  lane.speed = 0;
  g.fx = 4; g.y = 9;
  update(g, 0.1);
  assert.equal(g.lives, START_LIVES - 1);
  assert.equal(g.y, ROWS - 1, 'respawn di start');
  assert.equal(g.status, 'playing');
});

test('sungai tanpa balok = tenggelam', () => {
  const g = createGame(5);
  const lane = g.lanes[1];
  lane.obstacles = [{ start: 0, len: 1 }];
  lane.speed = 0;
  g.fx = 5; g.y = 1;
  update(g, 0.1);
  assert.equal(g.lives, START_LIVES - 1, 'tenggelam mengurangi nyawa');
});

test('balok membawa tukang searah laju', () => {
  const g = createGame(6);
  const lane = g.lanes[2];
  lane.dir = 1; lane.speed = 2;
  lane.obstacles = [{ start: 4, len: 9 }]; // menutupi semua sel
  g.fx = 4; g.y = 2;
  const x0 = g.fx;
  update(g, 0.5);
  assert.ok(g.fx > x0, 'tukang terbawa balok ke kanan');
  assert.equal(g.lives, START_LIVES, 'tidak mati di atas balok');
});

test('terbawa arus keluar layar = mati', () => {
  const g = createGame(7);
  const lane = g.lanes[2];
  lane.dir = 1; lane.speed = 5;
  lane.obstacles = [{ start: 0, len: 9 }];
  g.fx = COLS - 0.5; g.y = 2;
  update(g, 1.0);
  assert.equal(g.lives, START_LIVES - 1);
});

test('sampai rumah kosong: skor + hunian', () => {
  const g = createGame(8);
  for (const lane of g.lanes) lane.obstacles = [];
  g.timeLeft = 50;
  // teleport dekat rumah lalu lompat ke kolom rumah 4
  g.fx = 4; g.y = 1; g.bestY = 1;
  const before = g.score;
  assert.equal(move(g, 0, -1), 'home');
  assert.ok(g.homes[2], 'rumah tengah dihuni');
  assert.equal(g.score, before + HOME_SCORE + 50, 'skor rumah + bonus waktu');
  assert.equal(g.y, ROWS - 1, 'respawn setelah sampai rumah');
  // rumah yg sudah dihuni tidak bisa dimasuki
  g.fx = 4; g.y = 1;
  assert.equal(move(g, 0, -1), 'blocked', 'rumah terisi diblokir');
  // bukan kolom rumah
  g.fx = 1; g.y = 1;
  assert.equal(move(g, 0, -1), 'blocked', 'kolom non-rumah diblokir');
});

test('5 rumah terisi = menang', () => {
  const g = createGame(9);
  for (const lane of g.lanes) lane.obstacles = [];
  for (let h = 0; h < 5; h += 1) {
    g.fx = HOME_COLS[h]; g.y = 1; g.bestY = 1; g.timeLeft = 50;
    const r = move(g, 0, -1);
    if (h < 4) assert.equal(r, 'home');
  }
  assert.equal(homesFilled(g), 5);
  assert.equal(g.status, 'won');
});

test('nyawa habis = kalah', () => {
  const g = createGame(10);
  const lane = g.lanes[6];
  lane.obstacles = [{ start: 0, len: 9 }];
  lane.speed = 0;
  for (let i = 0; i < START_LIVES; i += 1) {
    g.fx = 4; g.y = 6;
    update(g, 0.1);
  }
  assert.equal(g.lives, 0);
  assert.equal(g.status, 'lost');
  assert.equal(move(g, 0, -1), 'blocked', 'tidak bisa gerak setelah kalah');
});

test('timer habis = mati', () => {
  const g = createGame(11);
  g.timeLeft = 0.05;
  update(g, 0.1);
  assert.equal(g.lives, START_LIVES - 1);
  assert.equal(g.timeLeft, ATTEMPT_TIME, 'timer reset setelah respawn');
});

test('obstacleCells deterministik & melingkar', () => {
  const rng = mulberry32(12);
  const g = createGame(12);
  void rng;
  const lane = g.lanes[6];
  lane.obstacles = [{ start: 8, len: 3 }]; // 8,0,1 (wrap)
  lane.dir = 1; lane.speed = 0;
  const cells = obstacleCells(lane, 0);
  assert.deepEqual([...cells].sort((a, b) => a - b), [0, 1, 8]);
  // bergerak 1 sel
  lane.speed = 1;
  const cells2 = obstacleCells(lane, 1);
  assert.deepEqual([...cells2].sort((a, b) => a - b), [0, 1, 2]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
