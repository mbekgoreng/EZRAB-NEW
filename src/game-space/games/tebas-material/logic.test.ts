/**
 * Tebas Material — logic tests. Run: npx tsx src/game-space/games/tebas-material/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  mulberry32, spawnItem, stepItems, sliceCheck, splitItem,
  waveFor, comboBonus, slicePoints, pickKind, SPLASH,
  GRAVITY, START_LIVES, COMBO_MIN,
  type FlyingItem, type Rng,
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

function mkItem(over: Partial<FlyingItem> = {}): FlyingItem {
  return {
    id: 1, kind: 'bata', x: 100, y: 300, vx: 0, vy: 0,
    rot: 0, vr: 0, r: 32, half: false, side: 0, life: Infinity,
    ...over,
  };
}

console.log('\n[1] spawn');
test('item spawn di bawah layar dengan vy negatif', () => {
  const it = spawnItem(mulberry32(1), W, H);
  assert.ok(it.y > H, `y=${it.y} harus > ${H}`);
  assert.ok(it.vy < 0, `vy=${it.vy} harus negatif`);
});
test('posisi x spawn di dalam layar', () => {
  for (let s = 0; s < 50; s += 1) {
    const it = spawnItem(mulberry32(s), W, H);
    assert.ok(it.x >= 0 && it.x <= W, `x=${it.x} di luar layar (seed ${s})`);
  }
});
test('apex cukup tinggi untuk terlihat (vy cukup besar)', () => {
  const it = spawnItem(mulberry32(7), W, H);
  const apexRise = (it.vy * it.vy) / (2 * GRAVITY);
  assert.ok(apexRise > H * 0.35, `apex rise=${apexRise} terlalu rendah`);
});
test('dinamit kadang muncul (distribusi)', () => {
  const rng = mulberry32(42);
  const kinds = new Set<string>();
  for (let i = 0; i < 300; i += 1) kinds.add(pickKind(rng));
  assert.ok(kinds.has('dinamit'), 'dinamit tidak pernah muncul dalam 300 spawn');
  assert.equal(kinds.size, 5, 'harus ada 5 jenis item');
});

console.log('\n[2] fisika');
test('gravitasi menambah vy dan item naik dulu lalu turun', () => {
  const it = spawnItem(mulberry32(3), W, H);
  const y0 = it.y;
  let r1 = stepItems([it], 0.1, W, H);
  assert.ok(r1.items[0].y < y0, 'item harus naik dulu');
  // biarkan terbang sampai jatuh kembali
  let cur = r1.items;
  for (let i = 0; i < 400 && cur.length > 0; i += 1) {
    const r = stepItems(cur, 1 / 60, W, H);
    cur = r.items;
    if (r.missed.length > 0) break;
  }
  assert.equal(cur.length, 0, 'item harus keluar sebagai missed');
});
test('item jatuh tanpa dislice masuk missed tanpa penalti', () => {
  const it = mkItem({ y: H + 59 + 32, vy: 500 }); // sudah di bawah ambang
  const { items, missed } = stepItems([it], 1 / 60, W, H);
  assert.equal(items.length, 0);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].id, it.id);
});
test('rotasi berubah seiring waktu', () => {
  const it = mkItem({ vr: 3 });
  stepItems([it], 0.5, W, H);
  assert.ok(Math.abs(it.rot - 1.5) < 1e-9, `rot=${it.rot}`);
});

console.log('\n[3] slice');
test('segmen menyentuh item → terdeteksi', () => {
  const it = mkItem({ x: 100, y: 300, r: 32 });
  const { hit, rest } = sliceCheck([it], 60, 300, 140, 300);
  assert.equal(hit.length, 1);
  assert.equal(rest.length, 0);
});
test('segmen jauh dari item → tidak terdeteksi', () => {
  const it = mkItem({ x: 100, y: 300, r: 32 });
  const { hit, rest } = sliceCheck([it], 200, 100, 300, 100);
  assert.equal(hit.length, 0);
  assert.equal(rest.length, 1);
});
test('tap (segmen nol) pada item → terdeteksi', () => {
  const it = mkItem({ x: 100, y: 300, r: 32 });
  const { hit } = sliceCheck([it], 110, 310, 110, 310);
  assert.equal(hit.length, 1);
});
test('dinamit terdeteksi sebagai hit (jenis dipertahankan)', () => {
  const it = mkItem({ kind: 'dinamit', x: 50, y: 50, r: 26 });
  const { hit } = sliceCheck([it], 0, 50, 100, 50);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].kind, 'dinamit');
});
test('belahan (half) tidak bisa dislice lagi', () => {
  const it = mkItem({ half: true, x: 100, y: 300, r: 32 });
  const { hit } = sliceCheck([it], 60, 300, 140, 300);
  assert.equal(hit.length, 0);
});
test('slice tepat di tepi radius masih kena', () => {
  const it = mkItem({ x: 100, y: 300, r: 32 });
  const { hit } = sliceCheck([it], 100 - 31, 200, 100 - 31, 400);
  assert.equal(hit.length, 1);
});

console.log('\n[4] belahan');
test('splitItem menghasilkan 2 half dengan velocity berlawanan', () => {
  const it = mkItem({ vx: 10, vy: -400 });
  const [a, b] = splitItem(it, mulberry32(9));
  assert.equal(a.half, true);
  assert.equal(b.half, true);
  assert.equal(a.side, 0);
  assert.equal(b.side, 1);
  assert.ok(a.vx < b.vx, `vx berlawanan: ${a.vx} vs ${b.vx}`);
  assert.ok(a.life > 0 && b.life > 0);
});
test('half kedaluwarsa sesuai life', () => {
  const it = mkItem({ vx: 0, vy: -400 });
  const halves = splitItem(it, mulberry32(9));
  const { items } = stepItems(halves, 2.0, W, H);
  assert.equal(items.length, 0, 'half harus hilang setelah life habis');
});

console.log('\n[5] wave & skor');
test('wave: interval menyusut 1.1 → 0.45, speed naik', () => {
  const w0 = waveFor(0);
  const wLate = waveFor(300);
  assert.ok(Math.abs(w0.interval - 1.1) < 1e-9, `interval awal=${w0.interval}`);
  assert.ok(Math.abs(wLate.interval - 0.45) < 1e-9, `interval akhir=${wLate.interval}`);
  assert.ok(wLate.speedMul > w0.speedMul, 'speed harus naik');
  assert.ok(wLate.speedMul <= 1.9 + 1e-9, 'speed dibatasi');
});
test('kombo: <3 slice tanpa bonus, ≥3 dapat N*5', () => {
  assert.equal(comboBonus(0), 0);
  assert.equal(comboBonus(2), 0);
  assert.equal(comboBonus(COMBO_MIN), COMBO_MIN * 5);
  assert.equal(comboBonus(5), 25);
});
test('slicePoints = 10', () => {
  assert.equal(slicePoints(), 10);
});
test('konstanta nyawa awal = 3', () => {
  assert.equal(START_LIVES, 3);
});
test('SPLASH punya palet untuk semua kind', () => {
  for (const k of ['bata', 'kayu', 'semangka', 'beton', 'dinamit'] as const) {
    assert.ok(SPLASH[k].length >= 3, `palet ${k} kurang`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
