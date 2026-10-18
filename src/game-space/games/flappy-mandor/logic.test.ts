/**
 * Flappy Mandor — logic tests. Run: npx tsx src/game-space/games/flappy-mandor/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createState, createBird, flap, stepBird, circleVsRect, createGate,
  updateState, difficulty, medalFor, mulberry32,
  GRAVITY, FLAP_V, BIRD_R, GATE_W,
  type FlapState,
} from './logic';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

const W = 390;
const H = 700;
const rng = () => mulberry32(1234);

/* ---------- bird physics ---------- */
test('flap: vy menjadi -FLAP_V (ke atas)', () => {
  const b = createBird(100, 300);
  b.vy = 200;
  flap(b);
  assert.equal(b.vy, -FLAP_V);
});

test('gravitasi: vy & y bertambah saat jatuh', () => {
  const b = createBird(100, 300);
  stepBird(b, 0.1);
  assert.ok(b.vy > GRAVITY * 0.09, `vy=${b.vy}`);
  assert.ok(b.y > 300, `y=${b.y}`);
});

test('rotasi: menukik saat jatuh, mendongak saat flap', () => {
  const down = createBird(100, 300);
  down.vy = 600;
  stepBird(down, 0.5);
  assert.ok(down.rot > 0.3, `rot=${down.rot}`);
  const up = createBird(100, 300);
  flap(up);
  stepBird(up, 0.2);
  assert.ok(up.rot < 0, `rot=${up.rot}`);
});

test('bird radius konsisten BIRD_R', () => {
  assert.equal(createBird(0, 0).r, BIRD_R);
});

/* ---------- difficulty ---------- */
test('difficulty: gap menyempit dengan level, min 150', () => {
  assert.equal(difficulty(0).gapH, 210);
  assert.equal(difficulty(30).gapH, 150);
  assert.equal(difficulty(200).gapH, 150);
});

test('difficulty: speed naik dengan level', () => {
  assert.equal(difficulty(0).speed, 180);
  assert.equal(difficulty(10).speed, 210);
  assert.ok(difficulty(50).speed > difficulty(10).speed);
});

/* ---------- collision ---------- */
test('circleVsRect: kena & tidak kena', () => {
  assert.equal(circleVsRect(50, 50, 10, 40, 40, 30, 30), true);
  assert.equal(circleVsRect(0, 0, 10, 40, 40, 30, 30), false);
  // menyentuh tepi
  assert.equal(circleVsRect(35, 50, 10, 40, 40, 30, 30), true);
});

test('tabrakan gate atas -> mati', () => {
  const s = createState(7, W, H);
  const g = s.gates[0];
  g.x = s.bird.x - GATE_W / 2;
  s.bird.y = g.gapY - g.gapH / 2 - 10; // di dalam tiang crane
  s.bird.vy = 0;
  const r = updateState(s, 0.001, rng());
  assert.equal(r.died, 'gate');
  assert.equal(s.alive, false);
});

test('tabrakan tumpukan balok bawah -> mati', () => {
  const s = createState(7, W, H);
  const g = s.gates[0];
  g.x = s.bird.x - GATE_W / 2;
  s.bird.y = g.gapY + g.gapH / 2 + 10; // di dalam balok
  s.bird.vy = 0;
  const r = updateState(s, 0.001, rng());
  assert.equal(r.died, 'gate');
});

test('lewat celah dengan aman -> skor +1', () => {
  const s = createState(7, W, H);
  const g = s.gates[0];
  g.x = s.bird.x - GATE_W - s.bird.r - 1; // sudah lewat
  g.passed = false;
  s.bird.y = g.gapY;
  s.bird.vy = 0;
  const before = s.passed;
  const r = updateState(s, 0.001, rng());
  assert.equal(r.scored, true);
  assert.equal(s.passed, before + 1);
  assert.equal(s.alive, true);
});

test('menyentuh tanah -> mati (ground)', () => {
  const s = createState(7, W, H);
  s.bird.y = s.groundY - s.bird.r + 1;
  s.bird.vy = 300;
  const r = updateState(s, 0.05, rng());
  assert.equal(r.died, 'ground');
  assert.equal(s.alive, false);
});

test('mentok langit-langit tidak mati', () => {
  const s = createState(7, W, H);
  s.bird.y = 5;
  s.bird.vy = -500;
  const r = updateState(s, 0.05, rng());
  assert.equal(r.died, null);
  assert.equal(s.alive, true);
  assert.ok(s.bird.y >= s.bird.r);
});

/* ---------- gates ---------- */
test('createGate: gapY dalam batas aman', () => {
  const r = mulberry32(99);
  for (let i = 0; i < 50; i += 1) {
    const g = createGate(r, 500, 180, H, H - 64);
    assert.ok(g.gapY - g.gapH / 2 >= 60, `gapY=${g.gapY}`);
    assert.ok(g.gapY + g.gapH / 2 <= H - 64 - 60, `gapY=${g.gapY}`);
    assert.equal(g.w, GATE_W);
  }
});

test('gate deterministik dengan seed sama', () => {
  const a = createState(42, W, H);
  const b = createState(42, W, H);
  assert.deepEqual(
    a.gates.map((g) => g.gapY),
    b.gates.map((g) => g.gapY),
  );
  const c = createState(43, W, H);
  assert.notDeepEqual(
    a.gates.map((g) => g.gapY),
    c.gates.map((g) => g.gapY),
  );
});

test('gate baru spawn di kanan saat yang lama lewat', () => {
  const s: FlapState = createState(5, W, H);
  const r = mulberry32(5);
  // paksa semua gate ke kiri layar
  for (const g of s.gates) g.x = -100;
  updateState(s, 1 / 60, r);
  assert.ok(s.gates.length >= 1, `gates=${s.gates.length}`);
  const spawned = s.gates[s.gates.length - 1];
  assert.ok(spawned.x >= W, `spawn x=${spawned.x}`);
  assert.ok(s.gates.every((g) => g.x + g.w >= -20));
});

/* ---------- medals ---------- */
test('medalFor: ambang tiap 10 gate', () => {
  assert.equal(medalFor(0), null);
  assert.equal(medalFor(9), null);
  assert.equal(medalFor(10), 'perunggu');
  assert.equal(medalFor(20), 'perak');
  assert.equal(medalFor(30), 'emas');
  assert.equal(medalFor(40), 'platinum');
  assert.equal(medalFor(99), 'platinum');
});

test('mulberry32 deterministik', () => {
  const a = mulberry32(1);
  const b = mulberry32(1);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
