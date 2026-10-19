/**
 * Nyebrang Proyek — logic tests. Run: npx tsx src/game-space/games/arcade/crossy-road/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createState, hop, step, checkCollision, genLane, getLane, COLS,
  type State,
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

const DT = 1 / 60;

test('hop: maju & skor = baris terjauh', () => {
  const st = createState(1);
  hop(st, 0, 1); hop(st, 0, 1); hop(st, 1, 1);
  assert.equal(st.py, 3);
  assert.equal(st.px, 5);
  assert.equal(st.score, 3);
  assert.equal(st.hops, 3);
});

test('hop: mundur tak mengurangi skor, tak di bawah 0', () => {
  const st = createState(2);
  hop(st, 0, 1); hop(st, 0, 1);
  hop(st, 0, -1); hop(st, 0, -5);
  assert.equal(st.py, 0);
  assert.equal(st.score, 2, 'skor tetap baris terjauh');
});

test('hop: tepi kiri-kanan dijaga', () => {
  const st = createState(3);
  hop(st, -99, 0);
  assert.equal(st.px, 0);
  hop(st, 99, 0);
  assert.equal(st.px, COLS - 1);
});

test('baris 0 & kelipatan 7-1 selalu aman', () => {
  for (const row of [0, 6, 13, 20]) {
    const lane = genLane(42, row);
    assert.equal(lane.kind, 'aman', `baris ${row} harus aman`);
  }
});

test('genLane deterministik', () => {
  const a = JSON.stringify(genLane(7, 15));
  const b = JSON.stringify(genLane(7, 15));
  assert.equal(a, b);
  const c = JSON.stringify(genLane(8, 15));
  assert.notEqual(a, c, 'seed beda -> lajur beda');
});

test('kendaraan bergerak sesuai arah & kecepatan', () => {
  const st = createState(4);
  // cari lajur jalan di dekat awal
  let row = -1;
  for (let r = 1; r < 12; r += 1) {
    if (getLane(st, r).kind === 'jalan') { row = r; break; }
  }
  assert.ok(row > 0, 'ada lajur jalan');
  const lane = getLane(st, row);
  const x0 = lane.vehicles[0].x;
  st.py = row; // aktifkan lajur
  step(st, 1);
  const dx = lane.vehicles[0].x - x0;
  assert.ok(Math.abs(dx) > 0.1, 'kendaraan harus bergerak');
  assert.equal(Math.sign(dx), lane.dir, 'arah gerak sesuai dir');
  assert.ok(Math.abs(Math.abs(dx) - lane.speed) < 0.01, `jarak=${dx}, speed=${lane.speed}`);
});

test('kendaraan wrap di tepi', () => {
  const st = createState(5);
  const lane = getLane(st, 3);
  lane.kind = 'jalan'; lane.dir = 1; lane.speed = 5;
  lane.vehicles = [{ x: COLS + 0.95, w: 2, kind: 'molen' }];
  st.py = 3;
  for (let i = 0; i < 10; i += 1) step(st, DT);
  const v = lane.vehicles[0];
  assert.ok(v.x < 0, `harus wrap ke kiri, x=${v.x}`);
});

test('tabrakan -> over + cause tabrak', () => {
  const st = createState(6);
  const lane = getLane(st, 2);
  lane.kind = 'jalan'; lane.dir = 1; lane.speed = 0;
  lane.vehicles = [{ x: 3.5, w: 2, kind: 'molen' }];
  st.px = 4; st.py = 2;
  step(st, DT);
  assert.ok(st.over, 'harus over');
  assert.equal(st.cause, 'tabrak');
});

test('tak tabrakan bila kendaraan jauh', () => {
  const st = createState(7);
  const lane = getLane(st, 2);
  lane.kind = 'jalan'; lane.dir = 1; lane.speed = 0;
  lane.vehicles = [{ x: 0, w: 1, kind: 'pickup' }];
  st.px = 8; st.py = 2;
  assert.ok(!checkCollision(st), 'tak boleh tabrakan');
  step(st, DT);
  assert.ok(!st.over);
});

test('lajur aman tak pernah tabrakan', () => {
  const st = createState(8);
  st.py = 6; // zona aman
  for (let i = 0; i < 300; i += 1) step(st, DT);
  assert.ok(!st.over, 'di zona aman tak boleh mati');
});

test('simulasi: hop acak 200x, state konsisten', () => {
  const st = createState(99);
  let seed = 1234;
  const rnd = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    return ((seed >>> 0) % 1000) / 1000;
  };
  for (let i = 0; i < 200 && !st.over; i += 1) {
    const r = rnd();
    if (r < 0.6) hop(st, 0, 1);
    else if (r < 0.75) hop(st, -1, 0);
    else if (r < 0.9) hop(st, 1, 0);
    else hop(st, 0, -1);
    step(st, DT * 4);
  }
  assert.ok(st.score === st.maxRow, 'skor = maxRow');
  assert.ok(st.score >= 0);
  assert.ok(st.hops === 200 || st.over, 'konsisten');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAILURES:', failures.join(', '));
  process.exit(1);
}
