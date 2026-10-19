/**
 * Menara Lantai — logic tests. Run: npx tsx src/game-space/games/arcade/tower-blocks/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  dropBlock, slabHue, slideSpeed, scoreForDrop, SLIDE_RANGE,
  PERFECT_TOL, MIN_SIZE, type Slab,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn(); passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1; failures.push(name);
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

const base = (cx = 0, cz = 0, w = 4, d = 4): Slab => ({ cx, cz, w, d });

console.log('\n[tower] drop');
test('perfect: snap tengah, tanpa debris', () => {
  const r = dropBlock({ prev: base(), moving: base(0.1, 0, 4, 4), axis: 'x' });
  assert.ok(r.perfect && !r.gameOver);
  assert.equal(r.placed?.cx, 0);
  assert.equal(r.placed?.w, 4);
  assert.equal(r.debris, null);
});
test('toleransi perfect di batas', () => {
  const r = dropBlock({ prev: base(), moving: base(PERFECT_TOL, 0, 4, 4), axis: 'x' });
  assert.ok(r.perfect);
  const r2 = dropBlock({ prev: base(), moving: base(PERFECT_TOL + 0.01, 0, 4, 4), axis: 'x' });
  assert.ok(!r2.perfect && !r2.gameOver);
});
test('overhang terpotong dua sisi', () => {
  const r1 = dropBlock({ prev: base(), moving: base(1, 0, 4, 4), axis: 'x' });
  assert.ok(!r1.perfect && !r1.gameOver);
  assert.ok(Math.abs((r1.placed?.w ?? 0) - 3) < 1e-9);
  assert.ok(Math.abs((r1.debris?.w ?? 0) - 1) < 1e-9);
  assert.ok((r1.debris?.cx ?? 0) > (r1.placed?.cx ?? 0), 'debris di sisi kanan');
  const r2 = dropBlock({ prev: base(), moving: base(-1.5, 0, 4, 4), axis: 'x' });
  assert.ok(Math.abs((r2.placed?.w ?? 0) - 2.5) < 1e-9);
  assert.ok((r2.debris?.cx ?? 0) < (r2.placed?.cx ?? 0), 'debris di sisi kiri');
});
test('sumbu z ikut terpotong', () => {
  const r = dropBlock({ prev: base(), moving: base(0, 1.2, 4, 4), axis: 'z' });
  assert.ok(!r.gameOver);
  assert.ok(Math.abs((r.placed?.d ?? 0) - 2.8) < 1e-9);
  assert.equal(r.placed?.w, 4);
});
test('meleset total -> game over', () => {
  const r = dropBlock({ prev: base(), moving: base(10, 0, 4, 4), axis: 'x' });
  assert.ok(r.gameOver && r.placed === null);
  assert.ok(r.debris !== null);
});
test('overlap di bawah MIN_SIZE -> game over', () => {
  const r = dropBlock({ prev: base(), moving: base(4 - MIN_SIZE / 2, 0, 4, 4), axis: 'x' });
  assert.ok(r.gameOver);
});

console.log('\n[tower] tuning');
test('slabHue bervariasi per level', () => {
  const hues = new Set([0, 1, 2, 3, 4, 5].map(slabHue));
  assert.ok(hues.size > 1);
  assert.ok(slabHue(0) >= 0 && slabHue(0) < 360);
});
test('slideSpeed naik lalu mentok', () => {
  assert.ok(slideSpeed(10) > slideSpeed(0));
  assert.equal(slideSpeed(1000), slideSpeed(200));
});
test('SLIDE_RANGE positif', () => {
  assert.ok(SLIDE_RANGE > 2);
});
test('scoreForDrop: perfect bonus combo dibatasi', () => {
  assert.equal(scoreForDrop(3, 0, false), 1);
  assert.equal(scoreForDrop(3, 0, true), 2);
  assert.equal(scoreForDrop(3, 5, true), 7);
  assert.equal(scoreForDrop(3, 100, true), 10, 'combo dibatasi 8');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` (${failures.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
