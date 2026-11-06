/**
 * Maze Drag — logic tests. Run: npx tsx src/game-space/games/arcade/maze-drag/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  generateMaze, bfsPath, collideWalls, moveBall, cellCenter, isWall,
  mazeSizeForLevel, mulberry32, SLAM_SPEED,
  parSecondsFor, starsFor, checkpointsPassed, furthestCheckpointIndex,
  improvedBestTime, PAR_CELLS_PER_SEC,
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

test('mulberry32 deterministik', () => {
  const a = mulberry32(9);
  const b = mulberry32(9);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test('generateMaze: dimensi ganjil & border dinding', () => {
  const m = generateMaze(10, 8, mulberry32(1));
  assert.equal(m.cols % 2, 1);
  assert.equal(m.rows % 2, 1);
  for (let c = 0; c < m.cols; c += 1) {
    assert.ok(isWall(m, c, 0));
    assert.ok(isWall(m, c, m.rows - 1));
  }
  assert.equal(isWall(m, 1, 1), false, 'start harus jalan');
});

test('generateMaze: selalu solvable (BFS path ada)', () => {
  for (let s = 1; s <= 12; s += 1) {
    const m = generateMaze(9, 9, mulberry32(s));
    const p = bfsPath(m);
    assert.ok(p.length > 0, `seed ${s}: path kosong`);
    assert.deepEqual(p[0], m.start);
    assert.deepEqual(p[p.length - 1], m.goal);
  }
});

test('generateMaze: checkpoint di atas path & bukan start/goal', () => {
  const m = generateMaze(11, 11, mulberry32(3));
  assert.ok(m.checkpoints.length >= 1);
  for (const cp of m.checkpoints) {
    assert.ok(!isWall(m, cp.c, cp.r), 'checkpoint harus di jalan');
    assert.ok(m.path.some((p) => p.c === cp.c && p.r === cp.r), 'checkpoint harus di path');
    assert.notDeepEqual(cp, m.start);
    assert.notDeepEqual(cp, m.goal);
  }
});

test('mazeSizeForLevel: membesar per level', () => {
  const a = mazeSizeForLevel(1);
  const b = mazeSizeForLevel(4);
  assert.ok(b.cols >= a.cols);
  assert.equal(a.cols % 2, 1);
  assert.equal(mazeSizeForLevel(50).cols, 19, 'capped');
});

test('collideWalls: bola di koridor tidak tersentuh', () => {
  const m = generateMaze(9, 9, mulberry32(5));
  const cell = 30;
  const c = cellCenter(m, cell, m.start);
  const r = collideWalls(m, cell, c.x, c.y, 8);
  assert.equal(r.hit, false);
  assert.ok(Math.abs(r.x - c.x) < 1e-6);
});

test('collideWalls: bola yang menembus dinding didorong keluar', () => {
  const m = generateMaze(9, 9, mulberry32(5));
  const cell = 30;
  // sel (0,1) pasti dinding (border)
  const r = collideWalls(m, cell, 0 * cell + 15, 1 * cell + 15, 10);
  assert.equal(r.hit, true);
  // setelah koreksi tidak boleh overlap dinding lagi
  const r2 = collideWalls(m, cell, r.x, r.y, 10);
  assert.equal(r2.hit, false);
});

test('moveBall: pointer lambat menyentuh dinding = TIDAK slam', () => {
  const m = generateMaze(9, 9, mulberry32(5));
  const cell = 30;
  const c = cellCenter(m, cell, m.start);
  // arahkan ke dinding border kiri dengan kecepatan pointer rendah
  const res = moveBall(m, cell, c.x, c.y, c.x - 500, c.y, 8, 1 / 60, 60);
  assert.equal(res.slammed, false);
  // bola tidak boleh menembus border
  assert.ok(res.x >= 8 - 1e-6, `x=${res.x}`);
});

test('moveBall: pointer cepat menabrak dinding = slam', () => {
  const m = generateMaze(9, 9, mulberry32(5));
  const cell = 30;
  const c = cellCenter(m, cell, m.start);
  const res = moveBall(m, cell, c.x, c.y, c.x - 500, c.y, 8, 1 / 60, SLAM_SPEED + 100);
  assert.equal(res.hit, true);
  assert.equal(res.slammed, true);
});

test('moveBall: bola mengikuti pointer di koridor terbuka', () => {
  const m = generateMaze(9, 9, mulberry32(5));
  const cell = 30;
  const c = cellCenter(m, cell, m.start);
  const res = moveBall(m, cell, c.x, c.y, c.x + 5, c.y, 8, 1 / 60, 0);
  assert.equal(res.hit, false);
  assert.ok(res.x > c.x, 'bola harus bergerak ke target');
});

test('cellCenter: tengah sel yang benar', () => {
  const m = generateMaze(7, 7, mulberry32(2));
  const c = cellCenter(m, 20, { c: 2, r: 3 });
  assert.equal(c.x, 50);
  assert.equal(c.y, 70);
});

test('parSecondsFor: diturunkan dari panjang path BFS / PAR_CELLS_PER_SEC', () => {
  const m = generateMaze(11, 11, mulberry32(7));
  assert.ok(m.path.length > 1);
  const par = parSecondsFor(m);
  assert.ok(Math.abs(par - (m.path.length - 1) / PAR_CELLS_PER_SEC) < 1e-9, `par=${par}`);
  assert.equal(PAR_CELLS_PER_SEC, 3);
});

test('parSecondsFor: path kosong -> 0', () => {
  const m = generateMaze(9, 9, mulberry32(5));
  const empty = { ...m, path: [] };
  assert.equal(parSecondsFor(empty), 0);
});

test('starsFor: batas 3 / 2 / 1 bintang terhadap par', () => {
  assert.equal(starsFor(10, 10), 3, 'tepat par = 3');
  assert.equal(starsFor(9.9, 10), 3);
  assert.equal(starsFor(10.1, 10), 2);
  assert.equal(starsFor(15, 10), 2, 'tepat 1,5x par = 2');
  assert.equal(starsFor(15.1, 10), 1);
  assert.equal(starsFor(60, 10), 1);
});

test('starsFor: par tidak valid -> 1 bintang (selesai saja)', () => {
  assert.equal(starsFor(5, 0), 1);
  assert.equal(starsFor(5, -3), 1);
});

test('checkpointsPassed: bola di pusat checkpoint terhitung', () => {
  const m = generateMaze(11, 11, mulberry32(3));
  assert.ok(m.checkpoints.length >= 1);
  const cp = m.checkpoints[0];
  const n = checkpointsPassed(m, cp.c + 0.5, cp.r + 0.5, 0.55);
  assert.ok(n >= 1, `n=${n}`);
  assert.equal(furthestCheckpointIndex(m, cp.c + 0.5, cp.r + 0.5, 0.55), 0);
});

test('checkpointsPassed: bola jauh dari semua checkpoint -> 0 / -1', () => {
  const m = generateMaze(11, 11, mulberry32(3));
  // sudut start (1.5, 1.5) jauh dari checkpoint yang ada di tengah path
  assert.equal(checkpointsPassed(m, 1.5, 1.5, 0.55), 0);
  assert.equal(furthestCheckpointIndex(m, 1.5, 1.5, 0.55), -1);
  // radius sangat besar mencakup semua checkpoint
  assert.equal(checkpointsPassed(m, 1.5, 1.5, 100), m.checkpoints.length);
});

test('improvedBestTime: regresi — waktu terbaik memakai min, bukan max', () => {
  assert.equal(improvedBestTime(20, 12), 12, 'waktu lebih cepat harus menggantikan');
  assert.equal(improvedBestTime(20, 25), 20, 'waktu lebih lambat TIDAK boleh menimpa rekor');
  assert.equal(improvedBestTime(0, 9), 9, 'belum ada catatan -> pakai waktu pertama');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
