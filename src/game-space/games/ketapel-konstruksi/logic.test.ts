/**
 * Ketapel Konstruksi — logic tests. Run: npx tsx src/game-space/games/ketapel-konstruksi/logic.test.ts
 * Semua deterministik (tanpa Math.random).
 */
import { strict as assert } from 'node:assert';
import {
  LEVELS, GROUND_Y, GRAV, BALL_R, DRAG_MAX,
  predict, launchVel, circleRectCollide, damageBlock,
  createState, updateState, stepBall, ballShouldDie,
  toppleStep, allBerkasDead, starFor, leftoverBonus, MAT_HP,
  type Block, type KEvent,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}

const scoreRef = () => ({ v: 0 });
const ev = (): KEvent[] => [];

console.log('\n[1] predict — parabola konsisten dengan stepBall');
test('titik pertama bergerak searah kecepatan', () => {
  const pts = predict(100, 100, 300, -400);
  assert.ok(pts.length > 1);
  assert.ok(pts[0].x > 100, 'x maju');
  assert.ok(pts[0].y < 100, 'y naik dulu (vy negatif)');
});
test('lintasan akhirnya turun (gravitasi)', () => {
  const pts = predict(100, 100, 300, -400);
  const last = pts[pts.length - 1];
  assert.ok(last.y > pts[0].y, 'titik akhir lebih rendah dari titik awal');
});
test('berhenti di tanah', () => {
  const pts = predict(100, 600, 300, 100);
  const last = pts[pts.length - 1];
  assert.ok(last.y >= GROUND_Y - 1);
});
test('konsisten dengan stepBall: titik ke-N == integrasi manual', () => {
  const x0 = 150; const y0 = 452; const vx = 500; const vy = -600;
  const dt = 1 / 22;
  const pts = predict(x0, y0, vx, vy, GRAV, 10, dt);
  let px = x0; let py = y0; let pvx = vx; let pvy = vy;
  for (let i = 0; i < 5; i += 1) {
    pvy += GRAV * dt; px += pvx * dt; py += pvy * dt;
  }
  assert.ok(Math.abs(pts[4].x - px) < 1e-9);
  assert.ok(Math.abs(pts[4].y - py) < 1e-9);
});

console.log('\n[2] launchVel');
test('tarikan dijepit ke DRAG_MAX', () => {
  const v = launchVel(150, 452, 150 - 500, 452); // tarik 500px ke kiri
  assert.ok(Math.hypot(v.vx, v.vy) <= DRAG_MAX * 7.4 + 1e-6);
});
test('arah luncur berlawanan arah tarik', () => {
  const v = launchVel(150, 452, 100, 500); // tarik kiri-bawah
  assert.ok(v.vx > 0 && v.vy < 0, 'bola meluncur kanan-atas');
});
test('tanpa tarikan kecepatan nol', () => {
  const v = launchVel(150, 452, 150, 452);
  assert.equal(v.vx, 0); assert.equal(v.vy, 0);
});

console.log('\n[3] circleRectCollide');
test('kena: bola menyentuh sisi blok', () => {
  assert.equal(circleRectCollide(100, 100, BALL_R, { x: 110, y: 90, w: 40, h: 40 }), true);
});
test('tidak kena: jauh', () => {
  assert.equal(circleRectCollide(0, 0, BALL_R, { x: 200, y: 200, w: 40, h: 40 }), false);
});
test('kena: sudut blok', () => {
  assert.equal(circleRectCollide(100, 100, 20, { x: 112, y: 112, w: 40, h: 40 }), true);
});

console.log('\n[4] damageBlock & HP material');
test('kayu HP1: sekali pukul hancur + skor', () => {
  const s = createState(0);
  const b = s.blocks.find((x) => x.mat === 'kayu')!;
  const sc = scoreRef(); const events = ev();
  const broke = damageBlock(b, events, sc);
  assert.equal(broke, true);
  assert.equal(b.dead, true);
  assert.ok(sc.v > 0);
  assert.ok(events.some((e) => e.type === 'blockBreak'));
});
test('beton HP3: butuh 3x damage', () => {
  const s = createState(5); // L6 benteng beton
  const b = s.blocks.find((x) => x.mat === 'beton')!;
  assert.equal(b.hp, MAT_HP.beton);
  const sc = scoreRef();
  assert.equal(damageBlock(b, ev(), sc), false);
  assert.equal(damageBlock(b, ev(), sc), false);
  assert.equal(damageBlock(b, ev(), sc), true);
});
test('damage blok mati = no-op', () => {
  const s = createState(0);
  const b = s.blocks.find((x) => x.mat === 'kayu')!;
  const sc = scoreRef();
  damageBlock(b, ev(), sc);
  assert.equal(damageBlock(b, ev(), sc), false);
  assert.equal(sc.v, 60); // skor tidak nambah dua kali
});

console.log('\n[5] toppleStep — blok jatuh tanpa penyangga');
test('blok melayang jatuh karena gravitasi', () => {
  const s = createState(0);
  const b: Block = {
    id: 999, mat: 'kayu', x: 400, y: 100, w: 30, h: 96,
    hp: 1, vx: 0, vy: 0, angle: 0, va: 0, dead: false, grounded: false, lastHitBy: 0,
  };
  const y0 = b.y;
  toppleStep([b], 0.25, ev(), scoreRef());
  assert.ok(b.y > y0, 'blok turun');
  assert.ok(b.vy > 0);
});
test('mendarat keras di tanah = damage', () => {
  const s = createState(5);
  void s;
  const b: Block = {
    id: 998, mat: 'beton', x: 400, y: GROUND_Y - 84 - 300, w: 30, h: 84,
    hp: 3, vx: 0, vy: 0, angle: 0, va: 0, dead: false, grounded: false, lastHitBy: 0,
  };
  const events = ev(); const sc = scoreRef();
  for (let i = 0; i < 120 && b.hp === 3; i += 1) toppleStep([b], 1 / 60, events, sc);
  assert.ok(b.hp < 3, `beton rusak saat jatuh keras (hp=${b.hp})`);
  assert.ok(events.some((e) => e.type === 'blockLand'));
});
test('blok yang disangga tidak jatuh', () => {
  const s = createState(0);
  const col = s.blocks.filter((b) => b.mat === 'kayu' && b.h === 96);
  assert.ok(col.length >= 2);
  const y0 = col.map((b) => b.y);
  toppleStep(s.blocks, 0.5, ev(), scoreRef());
  col.forEach((b, i) => assert.equal(b.y, y0[i], 'blok berpenyangga diam'));
});
test('blok mental cepat menabrak blok lain = damage berantai', () => {
  const mk = (id: number, x: number): Block => ({
    id, mat: 'kaca', x, y: 300, w: 30, h: 96, hp: 1,
    vx: 0, vy: 0, angle: 0, va: 0, dead: false, grounded: false, lastHitBy: 0,
  });
  const a = mk(1, 400); const b = mk(2, 420); // overlap
  a.vx = 600; // mental kencang
  const events = ev(); const sc = scoreRef();
  toppleStep([a, b], 1 / 60, events, sc);
  assert.equal(b.dead, true, 'blok target hancur oleh tabrakan berantai');
});

console.log('\n[6] aliran state: aim -> flying -> settle -> done');
test('10 level terdefinisi, tiap level punya berkas & bola', () => {
  assert.equal(LEVELS.length, 10);
  LEVELS.forEach((l, i) => {
    assert.ok(l.balls > 0, `L${i + 1} balls`);
    assert.ok(l.defs.some((d) => d.mat === 'berkas'), `L${i + 1} ada berkas`);
  });
});
test('kalah: bola habis & berkas tersisa -> done/won=false', () => {
  const s = createState(0);
  s.ballsLeft = 0;
  s.phase = 'settle'; s.settleT = 0.01;
  updateState(s, 0.05);
  assert.equal(s.phase, 'done');
  assert.equal(s.won, false);
});
test('menang: semua berkas hancur -> done/won=true', () => {
  const s = createState(0);
  for (const b of s.blocks) if (b.mat === 'berkas') { b.dead = true; b.hp = 0; }
  assert.equal(allBerkasDead(s.blocks), true);
  s.phase = 'settle'; s.settleT = 0.01;
  updateState(s, 0.05);
  assert.equal(s.phase, 'done');
  assert.equal(s.won, true);
});
test('bola habis tapi berkas hancur -> tetap menang', () => {
  const s = createState(0);
  s.ballsLeft = 0;
  for (const b of s.blocks) if (b.mat === 'berkas') { b.dead = true; b.hp = 0; }
  s.phase = 'settle'; s.settleT = 0.01;
  updateState(s, 0.05);
  assert.equal(s.won, true);
});
test('ballShouldDie: keluar layar / terlalu lambat', () => {
  assert.equal(ballShouldDie({ x: 2000, y: 100, vx: 500, vy: 0, flying: true, dead: false, age: 2, flightId: 1 }), true);
  assert.equal(ballShouldDie({ x: 400, y: 300, vx: 500, vy: -200, flying: true, dead: false, age: 0.5, flightId: 1 }), false);
  assert.equal(ballShouldDie({ x: 400, y: 300, vx: 10, vy: 5, flying: true, dead: false, age: 2, flightId: 1 }), true);
});
test('stepBall menerapkan gravitasi', () => {
  const ball = { x: 0, y: 0, vx: 100, vy: 0, flying: true, dead: false, age: 0, flightId: 1 };
  stepBall(ball, 0.1);
  assert.ok(ball.vy > 0 && Math.abs(ball.vy - GRAV * 0.1) < 1e-9);
  assert.ok(Math.abs(ball.x - 10) < 1e-9);
});

console.log('\n[7] starFor & bonus');
test('hemat bola -> 3 bintang', () => {
  assert.equal(starFor(2, 4), 3);
  assert.equal(starFor(1, 3), 3);
});
test('sedang -> 2 bintang, boros -> 1 bintang', () => {
  assert.equal(starFor(3, 4), 2);
  assert.equal(starFor(4, 4), 1);
});
test('leftoverBonus proporsional', () => {
  assert.equal(leftoverBonus(0), 0);
  assert.ok(leftoverBonus(3) > leftoverBonus(1));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
