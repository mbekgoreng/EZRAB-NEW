/**
 * Menara Lantai — logic tests. Run: npx tsx src/game-space/games/arcade/tower-blocks/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  dropBlock, slabHue, slideSpeed, scoreForDrop, SLIDE_RANGE,
  PERFECT_TOL, MIN_SIZE, regrowSize, regrowSlab,
  REGROW_STREAK_MIN, REGROW_STEP, type Slab,
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

console.log('\n[tower] drop ukuran tak sama (regresi regrow)');
test('moving lebih besar: irisan memakai ukuran prev, bukan moving', () => {
  // prev w=2 (-1..1), moving w=3 di cx=0.8 (-0.7..2.3) -> irisan -0.7..1 (w=1.7, cx=0.15)
  // kode lama (interval prev dari ukuran moving) menghasilkan w=2.2 yang menggantung.
  const r = dropBlock({ prev: base(0, 0, 2, 4), moving: base(0.8, 0, 3, 4), axis: 'x' });
  assert.ok(!r.perfect && !r.gameOver);
  assert.ok(Math.abs((r.placed?.w ?? 0) - 1.7) < 1e-9, `placed w=${r.placed?.w}`);
  assert.ok(Math.abs((r.placed?.cx ?? 0) - 0.15) < 1e-9, `placed cx=${r.placed?.cx}`);
  assert.ok(Math.abs((r.debris?.w ?? 0) - 1.3) < 1e-9, 'debris = overhang kanan 1.3');
});
test('moving lebih besar melingkupi prev: bertahan selebar prev, debris sisi terbesar', () => {
  // prev w=2 (-1..1), moving w=3 di cz=0.5 pada sumbu z (-1..2) -> irisan -1..1
  const r = dropBlock({ prev: base(0, 0, 4, 2), moving: base(0, 0.5, 4, 3), axis: 'z' });
  assert.ok(!r.gameOver);
  assert.ok(Math.abs((r.placed?.d ?? 0) - 2) < 1e-9);
  assert.ok(Math.abs((r.placed?.cz ?? 9) - 0) < 1e-9);
  assert.ok(Math.abs((r.debris?.d ?? 0) - 1) < 1e-9);
  assert.ok(Math.abs((r.debris?.cz ?? 0) - 1.5) < 1e-9);
});
test('moving regrow jatuh perfect: ukuran penuh dipertahankan & tersnap', () => {
  const r = dropBlock({ prev: base(0, 0, 2, 4), moving: base(0.1, 0, 3, 4), axis: 'x' });
  assert.ok(r.perfect && !r.gameOver);
  assert.equal(r.placed?.w, 3);
  assert.equal(r.placed?.cx, 0);
  assert.equal(r.debris, null);
});
test('moving lebih kecil di dalam prev: tanpa debris, ukuran moving bertahan', () => {
  const r = dropBlock({ prev: base(0, 0, 4, 4), moving: base(0.5, 0, 2, 4), axis: 'x' });
  assert.ok(!r.perfect && !r.gameOver);
  assert.equal(r.placed?.w, 2);
  assert.equal(r.debris, null);
});

console.log('\n[tower] regrow');
test('regrow: di bawah ambang tidak tumbuh', () => {
  assert.equal(REGROW_STREAK_MIN, 3);
  assert.ok(REGROW_STEP > 0);
  for (const s of [0, 1, REGROW_STREAK_MIN - 1]) {
    assert.equal(regrowSize(2, 3.4, s), 2, `streak ${s}`);
  }
});
test('regrow: pada ambang tumbuh tepat satu langkah', () => {
  assert.ok(Math.abs(regrowSize(2, 3.4, REGROW_STREAK_MIN) - (2 + REGROW_STEP)) < 1e-9);
  assert.ok(Math.abs(regrowSize(2, 3.4, REGROW_STREAK_MIN + 5) - (2 + REGROW_STEP)) < 1e-9,
    'satu langkah per pemanggilan, bukan sekaligus');
});
test('regrow: tidak pernah melebihi ukuran awal', () => {
  assert.equal(regrowSize(3.4 - REGROW_STEP / 2, 3.4, REGROW_STREAK_MIN), 3.4);
  assert.equal(regrowSize(3.4, 3.4, 9), 3.4);
});
test('regrow: tidak pernah mengecilkan', () => {
  assert.equal(regrowSize(3.6, 3.4, 9), 3.6, 'sudah di atas base -> apa adanya');
  assert.equal(regrowSize(2, 3.4, 0), 2);
  assert.equal(regrowSize(0, 3.4, 9), 0, 'ukuran mati tidak dibangkitkan');
});
test('regrow: penerapan berulang mencapai ukuran awal lalu berhenti', () => {
  let size = 2;
  for (let i = 0; i < 40; i += 1) size = regrowSize(size, 3.4, REGROW_STREAK_MIN + i);
  assert.equal(size, 3.4);
  assert.equal(regrowSize(size, 3.4, 99), 3.4);
});
test('regrowSlab: hanya dimensi sumbu gerak yang tumbuh', () => {
  const prev = base(1, -1, 2, 2.5);
  const grownX = regrowSlab(prev, base(0, 0, 3.4, 3.4), 'x', REGROW_STREAK_MIN);
  assert.ok(Math.abs(grownX.w - (2 + REGROW_STEP)) < 1e-9);
  assert.equal(grownX.d, 2.5);
  assert.equal(grownX.cx, 1); assert.equal(grownX.cz, -1);
  const grownZ = regrowSlab(prev, base(0, 0, 3.4, 3.4), 'z', REGROW_STREAK_MIN);
  assert.equal(grownZ.w, 2);
  assert.ok(Math.abs(grownZ.d - (2.5 + REGROW_STEP)) < 1e-9);
  const idle = regrowSlab(prev, base(0, 0, 3.4, 3.4), 'x', 1);
  assert.deepEqual(idle, prev, 'streak di bawah ambang -> slab sama');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` (${failures.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
