/**
 * ArcadeFlappyBird — logic tests.
 * Run: npx tsx src/game-space/games/arcade/flappy-bird/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createState, startRun, flap, updateState, updateReady, inGrace,
  spawnGate, gapHeightFor, speedFor, medalFor, GRACE_T, BIRD_R,
  type FlapState,
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

const rng = () => 0.5;
const DT = 1 / 60;

function runFrames(st: FlapState, n: number): void {
  for (let i = 0; i < n; i += 1) updateState(st, DT, rng);
}

console.log('\n[1] createState');
test('state awal: ready, hidup, belum ada gate', () => {
  const st = createState(7, 390, 700);
  assert.equal(st.phase, 'ready');
  assert.ok(st.alive);
  assert.equal(st.gates.length, 0);
  assert.equal(st.passed, 0);
  assert.ok(st.bird.y > 0 && st.bird.y < st.groundY);
});

console.log('\n[2] startRun + flap');
test('startRun mengubah fase ke play & reset waktu', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  assert.equal(st.phase, 'play');
  assert.equal(st.t, 0);
});
test('flap memberi kecepatan ke atas', () => {
  const st = createState(7, 390, 700);
  flap(st.bird);
  assert.ok(st.bird.vy < 0);
});

console.log('\n[3] grace period adil');
test('inGrace true selama 1 detik pertama', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  assert.ok(inGrace(st));
  runFrames(st, 70); // >1.16 detik
  assert.ok(!inGrace(st));
});
test('TIDAK mati oleh gate selama grace (gate tepat di burung)', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  // gate yang pasti menabrak: celah jauh dari burung
  st.gates.push({ x: st.bird.x - 30, w: 66, gapY: 60, gapH: 100, passed: false });
  const res = updateState(st, DT, rng);
  assert.equal(res.died, null);
  assert.ok(st.alive);
});
test('mati oleh gate SETELAH grace habis', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  st.t = GRACE_T + 0.1;
  st.gates.push({ x: st.bird.x - 30, w: 66, gapY: 60, gapH: 100, passed: false });
  st.bird.vy = 0;
  const res = updateState(st, DT, rng);
  assert.equal(res.died, 'gate');
  assert.ok(!st.alive);
});

console.log('\n[4] fisika & skor');
test('gravitasi menarik burung ke bawah', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  const y0 = st.bird.y;
  runFrames(st, 10);
  assert.ok(st.bird.y > y0);
});
test('flap mengangkat burung', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  runFrames(st, 20);
  const y0 = st.bird.y;
  flap(st.bird);
  runFrames(st, 5);
  assert.ok(st.bird.y < y0);
});
test('melewati gate menambah skor', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  st.t = GRACE_T + 0.1;
  // celah lebar tepat di posisi burung; burung dikunci di tengah celah
  const gy = st.bird.y;
  st.gates.push({
    x: st.bird.x + 100, w: 66,
    gapY: gy, gapH: 400, passed: false,
  });
  let scored = false;
  for (let i = 0; i < 200 && !scored; i += 1) {
    st.bird.y = gy; // kunci ketinggian (fokus uji logika passing)
    st.bird.vy = 0;
    const r = updateState(st, DT, rng);
    if (r.scored) scored = true;
    if (!st.alive) break;
  }
  assert.ok(scored, 'gate harus terlewati');
  assert.equal(st.passed, 1);
});
test('jatuh ke tanah = mati (ground)', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  st.t = GRACE_T + 0.1;
  st.bird.y = st.groundY - BIRD_R - 2;
  st.bird.vy = 500;
  const res = updateState(st, DT, rng);
  assert.equal(res.died, 'ground');
});
test('langit-langit tidak membunuh', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  st.t = GRACE_T + 0.1;
  st.bird.y = 2;
  flap(st.bird);
  const res = updateState(st, DT, rng);
  assert.equal(res.died, null);
  assert.ok(st.bird.y >= BIRD_R);
});

console.log('\n[5] spawn & difficulty');
test('gate ter-spawn otomatis dengan jarak wajar', () => {
  const st = createState(7, 390, 700);
  startRun(st);
  st.t = GRACE_T + 0.1;
  runFrames(st, 120);
  assert.ok(st.gates.length >= 1);
  for (const g of st.gates) {
    assert.ok(g.gapY - g.gapH / 2 > 40, 'celah tidak terlalu atas');
    assert.ok(g.gapY + g.gapH / 2 < st.groundY - 40, 'celah tidak terlalu bawah');
  }
});
test('gap menyempit & kecepatan naik seiring skor', () => {
  assert.ok(gapHeightFor(0) > gapHeightFor(40));
  assert.ok(speedFor(0) < speedFor(40));
  assert.ok(speedFor(1000) <= 300);
});

console.log('\n[6] medali');
test('medalFor thresholds', () => {
  assert.equal(medalFor(0), null);
  assert.equal(medalFor(6), 'C');
  assert.equal(medalFor(12), 'B');
  assert.equal(medalFor(20), 'A');
  assert.equal(medalFor(30), 'S');
});

console.log('\n[7] updateReady tidak menggerakkan gate');
test('ready: gate diam, burung bobbing', () => {
  const st = createState(7, 390, 700);
  spawnGate(st, rng, 300);
  const x0 = st.gates[0].x;
  updateReady(st, DT);
  assert.equal(st.gates[0].x, x0);
  assert.equal(st.phase, 'ready');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) console.log('FAILURES:', failures.join(', '));
if (failed > 0) process.exit(1);
