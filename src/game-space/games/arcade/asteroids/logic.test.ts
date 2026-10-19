/**
 * ArcadeAsteroids logic tests. Run: npx tsx src/game-space/games/arcade/asteroids/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createState, stepShip, fireBullet, updateState, splitRock, rockScore,
  makeRock, mulberry32, LW, LH,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}
const rng = mulberry32(42);

test('createState: kapal hidup, nyawa 3, batu > 0', () => {
  const st = createState(1);
  assert.ok(st.ship.alive);
  assert.equal(st.lives, 3);
  assert.ok(st.rocks.length >= 4);
});

test('thrust menambah kecepatan searah hidung', () => {
  const st = createState(1);
  const sp0 = Math.hypot(st.ship.vx, st.ship.vy);
  stepShip(st, 0.2, false, false, true);
  assert.ok(Math.hypot(st.ship.vx, st.ship.vy) > sp0);
});

test('putar kiri/kanan mengubah angle', () => {
  const st = createState(1);
  const a0 = st.ship.angle;
  stepShip(st, 0.2, true, false, false);
  assert.ok(st.ship.angle < a0);
  stepShip(st, 0.2, false, true, false);
  assert.ok(Math.abs(st.ship.angle - a0) < 1e-9);
});

test('wrap: kapal keluar kanan muncul di kiri', () => {
  const st = createState(1);
  st.ship.x = LW + 5; st.ship.vx = 0; st.ship.vy = 0;
  stepShip(st, 0.016, false, false, false);
  assert.ok(st.ship.x < LW, `x=${st.ship.x}`);
});

test('fireBullet: peluru lahir di depan kapal', () => {
  const st = createState(1);
  assert.ok(fireBullet(st));
  assert.equal(st.bullets.length, 1);
});

test('batas 6 peluru aktif', () => {
  const st = createState(1);
  for (let i = 0; i < 10; i += 1) fireBullet(st);
  assert.equal(st.bullets.length, 6);
});

test('peluru menghancurkan batu: skor + pecah jadi 2', () => {
  const st = createState(2);
  st.rocks = [makeRock(100, 100, 44, 0, rng)];
  st.rocks[0].vx = 0; st.rocks[0].vy = 0;
  st.bullets = [{ x: 100, y: 100, vx: 0, vy: 0, life: 1 }];
  const s0 = st.score;
  const ev = updateState(st, 0.016, rng);
  assert.equal(ev.rockHit.length, 1);
  assert.equal(st.score, s0 + 20);
  assert.equal(st.rocks.length, 2);
});

test('batu kecil hancur tanpa anak', () => {
  const kids = splitRock(makeRock(0, 0, 12, 0, rng), rng);
  assert.equal(kids.length, 0);
});

test('rockScore sesuai ukuran', () => {
  assert.equal(rockScore(44), 20);
  assert.equal(rockScore(20), 50);
  assert.equal(rockScore(12), 100);
});

test('tabrakan kapal-batu mengurangi nyawa & respawn', () => {
  const st = createState(3);
  st.ship.invuln = 0;
  st.rocks = [makeRock(st.ship.x, st.ship.y, 44, 0, rng)];
  st.rocks[0].vx = 0; st.rocks[0].vy = 0;
  const ev = updateState(st, 0.016, rng);
  assert.ok(ev.shipDied);
  assert.equal(st.lives, 2);
  assert.ok(st.ship.alive); // respawn langsung
  assert.ok(st.ship.invuln > 0);
});

test('invuln melindungi dari tabrakan', () => {
  const st = createState(3);
  st.rocks = [makeRock(st.ship.x, st.ship.y, 44, 0, rng)];
  st.rocks[0].vx = 0; st.rocks[0].vy = 0;
  const ev = updateState(st, 0.016, rng);
  assert.ok(!ev.shipDied);
  assert.equal(st.lives, 3);
});

test('nyawa habis -> over', () => {
  const st = createState(4);
  st.lives = 1;
  st.ship.invuln = 0;
  st.rocks = [makeRock(st.ship.x, st.ship.y, 44, 0, rng)];
  st.rocks[0].vx = 0; st.rocks[0].vy = 0;
  updateState(st, 0.016, rng);
  assert.ok(st.over);
});

test('level naik saat semua batu habis', () => {
  const st = createState(5);
  st.rocks = [];
  st.saucers = [];
  const ev = updateState(st, 0.016, rng);
  assert.ok(ev.leveledUp);
  assert.equal(st.level, 2);
  assert.ok(st.rocks.length > 0);
});

test('saucer spawn setelah countdown', () => {
  const st = createState(6);
  st.saucerT = 0.001;
  updateState(st, 0.02, rng);
  assert.equal(st.saucers.length, 1);
});

test('mulberry32 deterministik', () => {
  const a = mulberry32(9); const b = mulberry32(9);
  assert.equal(a(), b());
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('failures:', failures.join(', ')); process.exit(1); }
