/**
 * ArcadeArchery ("Tembak Paku") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/archery/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  VH, NAIL_SPEED, GRAVITY, WIND_ACCEL, NAILS_PER_ROUND, MAX_ROUNDS,
  roundSpec, targetScale, flightTime, dropAt, fireShot,
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

const det = (): number => 0.5;

console.log('\n[1] roundSpec');
test('jarak makin jauh tiap level', () => {
  const a = roundSpec(0, det);
  const b = roundSpec(4, det);
  assert.ok(b.distance > a.distance);
  assert.equal(a.nails, NAILS_PER_ROUND);
  assert.ok(a.targetY >= VH * 0.3 && a.targetY <= VH * 0.7);
  assert.ok(Math.abs(a.wind) <= a.windMax);
});
test('angin dalam batas', () => {
  for (let i = 0; i < 20; i += 1) {
    const s = roundSpec(2, Math.random);
    assert.ok(Math.abs(s.wind) <= s.windMax);
  }
});

console.log('\n[2] targetScale & flightTime');
test('skala mengecil dengan jarak', () => {
  assert.ok(targetScale(300) > targetScale(580));
  assert.ok(targetScale(9999) >= 0.55);
});
test('flightTime konsisten dengan NAIL_SPEED', () => {
  assert.equal(flightTime(950), 1);
  assert.equal(flightTime(475), 0.5);
});
test('dropAt = 0.5*g*t^2', () => {
  const t = flightTime(950);
  assert.equal(dropAt(950), 0.5 * GRAVITY * t * t);
});

console.log('\n[3] fireShot');
test('bidik tepat tengah tanpa angin/gravitasi nol -> bullseye', () => {
  const spec = { level: 0, distance: 0.0001, targetY: 300, wind: 0, windMax: 0, nails: 5 };
  const r = fireShot(300, spec);
  assert.equal(r.ring, 4);
  assert.equal(r.bullseye, true);
  assert.equal(r.score, 100);
});
test('angin mendorong titik jatuh', () => {
  const base = { level: 0, distance: 400, targetY: 300, wind: 0, windMax: 2, nails: 5 };
  const noWind = fireShot(300, base);
  const withWind = fireShot(300, { ...base, wind: 2 });
  assert.ok(withWind.hitY > noWind.hitY, 'angin positif mendorong ke bawah');
});
test('meleset jauh -> ring 0', () => {
  const spec = { level: 0, distance: 400, targetY: 300, wind: 0, windMax: 2, nails: 5 };
  const r = fireShot(50, spec);
  assert.equal(r.ring, 0);
  assert.equal(r.score, 0);
  assert.equal(r.bullseye, false);
});
test('skor ring: makin dekat tengah makin besar', () => {
  // drop gravitasi dihitung mundur dari targetY agar bidikan pas di tengah
  const spec = { level: 0, distance: 300, targetY: 300, wind: 0, windMax: 1, nails: 5 };
  const t = 300 / 950;
  const drop = 0.5 * 640 * t * t;
  const scores = [50, 30, 20, 5].map((d) => fireShot(300 - drop + d, spec).score);
  // dy = 50 -> ring 1 (10), 30 -> ring 2 (30), 20 -> ring 3 (50), 5 -> ring 4 (100)
  assert.deepEqual(scores, [10, 30, 50, 100]);
});
test('ring 0 untuk meleset total', () => {
  const spec = { level: 0, distance: 300, targetY: 300, wind: 0, windMax: 1, nails: 5 };
  assert.equal(fireShot(300 - 500, spec).ring, 0);
});
test('konstanta waras', () => {
  assert.equal(NAILS_PER_ROUND, 5);
  assert.equal(MAX_ROUNDS, 5);
  assert.ok(NAIL_SPEED > 0 && GRAVITY > 0 && WIND_ACCEL > 0 && VH > 0);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
