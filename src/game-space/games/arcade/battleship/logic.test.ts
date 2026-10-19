/**
 * Perang Crane (Battleship) logic tests. Run: npx tsx src/game-space/games/arcade/battleship/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  SIZE, FLEET, emptyBoard, canPlace, placeShip, placeFleetRandom, fireAt, allSunk,
  sunkShips, shipAt, key, createAi, aiChooseShot, aiRegister, mulberry32,
} from './logic';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}

test('rng deterministik', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 10; i += 1) assert.equal(a(), b());
});

test('fleet: 5 kapal, ukuran sesuai, tidak tumpang tindih, di dalam grid', () => {
  for (const seed of [1, 7, 99, 1234, 77777]) {
    const b = emptyBoard();
    const rng = mulberry32(seed);
    assert.ok(placeFleetRandom(b, rng), `seed ${seed} harus sukses`);
    assert.equal(b.ships.length, FLEET.length);
    const seen = new Set<string>();
    for (let i = 0; i < FLEET.length; i += 1) {
      const s = b.ships[i];
      assert.equal(s.cells.length, FLEET[i].size, `seed ${seed} kapal ${i} ukuran`);
      for (const c of s.cells) {
        assert.ok(c.x >= 0 && c.x < SIZE && c.y >= 0 && c.y < SIZE, `seed ${seed} di dalam grid`);
        const k = key(c.x, c.y);
        assert.ok(!seen.has(k), `seed ${seed} tidak tumpang tindih`);
        seen.add(k);
      }
    }
  }
});

test('canPlace/placeShip menolak tabrakan & keluar grid', () => {
  const b = emptyBoard();
  assert.ok(placeShip(b, FLEET[0], 0, 0, true));
  assert.equal(placeShip(b, FLEET[4], 0, 0, false), null, 'tabrakan ditolak');
  assert.equal(canPlace(b, FLEET[4], 9, 9, true), false, 'keluar kanan ditolak');
  assert.equal(canPlace(b, FLEET[0], 0, 5, false), true, 'vertikal ujung bawah ok');
  assert.equal(canPlace(b, FLEET[0], 0, 6, false), false, 'vertikal keluar bawah ditolak');
});

test('fireAt: miss, hit, repeat, tenggelam, allSunk', () => {
  const b = emptyBoard();
  placeShip(b, FLEET[4], 3, 3, true); // Pickup 2 sel: (3,3),(4,3)
  let r = fireAt(b, 0, 0);
  assert.equal(r.result, 'miss');
  assert.equal(r.sunk, null);
  r = fireAt(b, 0, 0);
  assert.equal(r.result, 'repeat', 'tembak ulang sel sama = repeat');
  r = fireAt(b, 3, 3);
  assert.equal(r.result, 'hit');
  assert.equal(r.sunk, null, 'belum tenggelam');
  assert.equal(allSunk(b), false);
  r = fireAt(b, 4, 3);
  assert.equal(r.result, 'hit');
  assert.ok(r.sunk && r.sunk.def.name === 'Pickup', 'tenggelam terdeteksi');
  assert.ok(allSunk(b));
  assert.equal(sunkShips(b).length, 1);
  assert.ok(shipAt(b, 3, 3), 'shipAt menemukan kapal');
  assert.equal(shipAt(b, 0, 0), undefined, 'shipAt kosong di sel kosong');
  // di luar grid
  assert.equal(fireAt(b, -1, 0).result, 'repeat');
  assert.equal(fireAt(b, SIZE, 0).result, 'repeat');
});

test('AI: tidak pernah tembak sel yang sama', () => {
  const mem = createAi();
  const rng = mulberry32(5);
  const seen = new Set<string>();
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const s = aiChooseShot(mem, rng);
    const k = key(s.x, s.y);
    assert.ok(!seen.has(k), `langkah ${i}: sel unik`);
    seen.add(k);
    aiRegister(mem, s.x, s.y, false, null);
  }
  assert.equal(seen.size, SIZE * SIZE);
});

test('AI: mode target memburu tetangga hit', () => {
  const mem = createAi();
  const rng = mulberry32(9);
  aiRegister(mem, 5, 5, true, null);
  assert.equal(mem.openHits.length, 1);
  let neighborHit = false;
  for (let i = 0; i < 4; i += 1) {
    const s = aiChooseShot(mem, rng);
    if (Math.abs(s.x - 5) + Math.abs(s.y - 5) === 1) neighborHit = true;
    aiRegister(mem, s.x, s.y, false, null);
  }
  assert.ok(neighborHit, 'AI menembak tetangga sel hit');
});

test('AI: openHits dibersihkan saat kapal tenggelam', () => {
  const mem = createAi();
  aiRegister(mem, 2, 2, true, null);
  aiRegister(mem, 3, 2, true, null);
  assert.equal(mem.openHits.length, 2);
  aiRegister(mem, 4, 2, true, [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
  assert.equal(mem.openHits.length, 0, 'openHits bersih setelah tenggelam');
});

test('simulasi penuh: AI menenggelamkan armada < 100 tembakan', () => {
  const b = emptyBoard();
  placeFleetRandom(b, mulberry32(31337));
  const mem = createAi();
  const rng = mulberry32(4242);
  let shots = 0;
  while (!allSunk(b) && shots < 100) {
    const s = aiChooseShot(mem, rng);
    const out = fireAt(b, s.x, s.y);
    assert.notEqual(out.result, 'repeat', 'tidak ada repeat');
    aiRegister(mem, s.x, s.y, out.result === 'hit', out.sunk ? out.sunk.cells : null);
    shots += 1;
  }
  assert.ok(allSunk(b), 'AI menenggelamkan semua kapal');
  console.log(`    (AI menang dalam ${shots} tembakan)`);
  assert.ok(shots < 100, 'AI menang sebelum 100 tembakan (bisa dikalahkan tapi kompeten)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
