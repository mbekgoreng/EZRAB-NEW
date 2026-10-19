/**
 * Flappy Mandor — logic tests. Run: npx tsx src/game-space/games/flappy-mandor/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createState, createBird, flap, stepBird, circleVsRect, createGate,
  updateState, updateReady, startRun, readyBobOffset, inGrace,
  difficulty, medalFor, mulberry32,
  GRAVITY, FLAP_V, BIRD_R, GATE_W, GRACE_T, FLAP_BUFFER_S, FIRST_GATE_X,
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

const W = 390;
const H = 700;
const rng = () => mulberry32(1234);

/** State yang sudah running (lewat fase ready + grace). */
function running(seed = 7): FlapState {
  const s = createState(seed, W, H);
  startRun(s);
  s.t = GRACE_T + 0.5; // lewati grace
  return s;
}

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

/* ---------- fase ready: TAP UNTUK MULAI ---------- */
test('state awal SELALU phase ready (tidak langsung jatuh)', () => {
  const s = createState(7, W, H);
  assert.equal(s.phase, 'ready');
  assert.equal(s.t, 0);
  assert.equal(s.alive, true);
});

test('ready: burung TIDAK jatuh & gate TIDAK bergerak walau update jalan', () => {
  const s = createState(7, W, H);
  const y0 = s.bird.y;
  const gx0 = s.gates.map((g) => g.x);
  for (let i = 0; i < 120; i += 1) {
    updateReady(s, 1 / 60);
    const r = updateState(s, 1 / 60, rng());
    assert.equal(r.died, null);
  }
  assert.equal(s.bird.y, y0, 'burung harus tetap hover, bukan jatuh');
  assert.deepEqual(s.gates.map((g) => g.x), gx0, 'gate harus diam saat ready');
  assert.equal(s.passed, 0);
  assert.equal(s.alive, true);
});

test('readyBobOffset: osilasi halus untuk animasi bobbing', () => {
  const s = createState(7, W, H);
  updateReady(s, 0.25);
  const o1 = readyBobOffset(s);
  updateReady(s, 0.25);
  const o2 = readyBobOffset(s);
  assert.ok(Math.abs(o1) <= 10 && Math.abs(o2) <= 10, `offset=${o1},${o2}`);
  assert.notEqual(o1, o2, 'offset harus berubah (animasi hidup)');
});

test('startRun: tap PERTAMA = flap SEKALIGUS mulai run', () => {
  const s = createState(7, W, H);
  startRun(s);
  assert.equal(s.phase, 'play');
  assert.equal(s.bird.vy, -FLAP_V, 'tap pertama harus flap');
  assert.equal(s.t, 0);
});

test('startRun idempoten: tidak double-flap', () => {
  const s = createState(7, W, H);
  startRun(s);
  s.bird.vy = 123;
  startRun(s);
  assert.equal(s.bird.vy, 123, 'startRun kedua tidak boleh reset vy');
});

/* ---------- grace period: jangan bunuh di detik pertama ---------- */
test('grace: tabrakan gate dalam 1 detik pertama TIDAK membunuh', () => {
  const s = createState(7, W, H);
  startRun(s);
  const g = s.gates[0];
  g.x = s.bird.x - GATE_W / 2; // gate tepat di burung
  s.bird.y = g.gapY - g.gapH / 2 - 10; // jelas di dalam struktur atas
  s.bird.vy = 0;
  assert.ok(inGrace(s), 'harus dalam grace tepat setelah start');
  const r = updateState(s, 0.001, rng());
  assert.equal(r.died, null, 'grace: tabrakan gate diabaikan');
  assert.equal(s.alive, true);
});

test('setelah grace: tabrakan gate membunuh seperti biasa', () => {
  const s = running();
  const g = s.gates[0];
  g.x = s.bird.x - GATE_W / 2;
  s.bird.y = g.gapY - g.gapH / 2 - 10;
  s.bird.vy = 0;
  assert.ok(!inGrace(s));
  const r = updateState(s, 0.001, rng());
  assert.equal(r.died, 'gate');
  assert.equal(s.alive, false);
});

test('gate pertama mustahil mencapai burung sebelum ~2 detik', () => {
  const s = createState(7, W, H);
  const g0 = s.gates[0];
  // jarak tempuh sampai tepi gate menyentuh burung
  const dist = g0.x - (s.bird.x + s.bird.r);
  const d = difficulty(0);
  const eta = dist / d.speed;
  assert.ok(eta > 2.0, `gate pertama sampai dalam ${eta.toFixed(2)}s — terlalu cepat!`);
  assert.ok(g0.x >= W * FIRST_GATE_X - 1, `gate pertama x=${g0.x}`);
});

test('fairness: input masuk akal (aim ke celah) -> HIDUP 5 detik & skor ≥1', () => {
  const s = createState(7, W, H);
  startRun(s);
  const dt = 1 / 60;
  for (let t = 0; t < 5; t += dt) {
    // autopilot sederhana: flap agar tetap di tengah celah gate terdekat
    const g = s.gates.find((gg) => !gg.passed && gg.x + gg.w > s.bird.x - 20);
    const target = g ? g.gapY : H * 0.45;
    if (s.bird.y > target && s.bird.vy > -50) flap(s.bird);
    const r = updateState(s, dt, rng());
    if (!s.alive) break;
    assert.equal(r.died, null);
  }
  assert.equal(s.alive, true, 'burung mati padahal aim masuk akal — fisika tidak adil');
  assert.ok(s.passed >= 1, `skor=${s.passed}: gate pertama harus bisa dilewati`);
});

test('konstanta fairness terdokumentasi', () => {
  assert.equal(GRACE_T, 1.0);
  assert.equal(FLAP_BUFFER_S, 0.1);
});

/* ---------- difficulty: curve adil bertahap ---------- */
test('difficulty: gap menyempit BERTAHAP, min 150', () => {
  assert.equal(difficulty(0).gapH, 214);
  assert.ok(difficulty(1).gapH < difficulty(0).gapH, 'harus turun tiap gate');
  assert.ok(difficulty(0).gapH - difficulty(1).gapH <= 2, 'tidak boleh loncat');
  assert.equal(difficulty(100).gapH, 150);
  assert.equal(difficulty(1000).gapH, 150);
});

test('difficulty: speed naik BERTAHAP', () => {
  assert.equal(difficulty(0).speed, 172);
  assert.ok(difficulty(1).speed > difficulty(0).speed);
  assert.ok(difficulty(1).speed - difficulty(0).speed <= 3, 'tidak boleh loncat');
  assert.ok(difficulty(50).speed > difficulty(10).speed);
});

/* ---------- collision ---------- */
test('circleVsRect: kena & tidak kena', () => {
  assert.equal(circleVsRect(50, 50, 10, 40, 40, 30, 30), true);
  assert.equal(circleVsRect(0, 0, 10, 40, 40, 30, 30), false);
  assert.equal(circleVsRect(35, 50, 10, 40, 40, 30, 30), true);
});

test('lewat celah dengan aman -> skor +1', () => {
  const s = running();
  const g = s.gates[0];
  g.x = s.bird.x - GATE_W - s.bird.r - 1;
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
  const s = running();
  s.bird.y = s.groundY - s.bird.r + 1;
  s.bird.vy = 300;
  const r = updateState(s, 0.05, rng());
  assert.equal(r.died, 'ground');
  assert.equal(s.alive, false);
});

test('mentok langit-langit tidak mati', () => {
  const s = running();
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
  const s: FlapState = running();
  const r = mulberry32(5);
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
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
