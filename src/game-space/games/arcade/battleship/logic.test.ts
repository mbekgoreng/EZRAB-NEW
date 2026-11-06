/**
 * Perang Crane (Battleship) logic tests. Run: npx tsx src/game-space/games/arcade/battleship/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  SIZE, FLEET, emptyBoard, canPlace, placeShip, placeFleetRandom, fireAt, allSunk,
  sunkShips, shipAt, key, createAi, aiChooseShot, aiRegister, mulberry32,
  placementCells, aiLineTargets,
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

test('REGRESI pratinjau: placementCells mengikuti jangkar, bukan origin (0,0)', () => {
  // Bug lama: ghost penempatan selalu digambar & divalidasi di (0,0).
  // Helper murni harus mengembalikan sel tepat di jangkar yang diminta.
  assert.deepEqual(
    placementCells(FLEET[0], 4, 4, true),
    [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 4 }],
    'mendatar: sel mulai di jangkar (4,4)',
  );
  assert.deepEqual(
    placementCells(FLEET[4], 7, 2, false),
    [{ x: 7, y: 2 }, { x: 7, y: 3 }],
    'tegak: sel turun dari jangkar (7,2)',
  );
  // Validitas bergantung posisi: origin terisi tidak boleh meracuni titik lain.
  const b = emptyBoard();
  placeShip(b, FLEET[4], 0, 0, true); // origin kini terisi
  assert.equal(canPlace(b, FLEET[4], 0, 0, true), false, 'origin memang tidak valid');
  assert.equal(canPlace(b, FLEET[4], 5, 5, true), true, 'jangkar (5,5) tetap valid');
  // placementCells murni: tidak mengubah papan
  const before = b.ships.length;
  placementCells(FLEET[0], 2, 2, true);
  assert.equal(b.ships.length, before, 'tanpa efek samping');
});

test('AI garis: dua hit segaris mendatar -> tembakan SELALU di ujung garis', () => {
  // Diskriminatif: AI lama mengundi 6 tetangga (4 di antaranya tegak-lurus);
  // AI garis hanya boleh memilih (4,5) atau (7,5).
  for (let seed = 1; seed <= 40; seed += 1) {
    const mem = createAi();
    aiRegister(mem, 5, 5, true, null);
    aiRegister(mem, 6, 5, true, null);
    const s = aiChooseShot(mem, mulberry32(seed));
    assert.ok(
      (s.x === 4 && s.y === 5) || (s.x === 7 && s.y === 5),
      `seed ${seed}: (${s.x},${s.y}) harus ujung garis, bukan tegak-lurus`,
    );
  }
});

test('AI garis: dua hit segaris tegak -> tembakan SELALU di ujung garis', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const mem = createAi();
    aiRegister(mem, 3, 3, true, null);
    aiRegister(mem, 3, 4, true, null);
    const s = aiChooseShot(mem, mulberry32(seed + 1000));
    assert.ok(
      (s.x === 3 && s.y === 2) || (s.x === 3 && s.y === 5),
      `seed ${seed}: (${s.x},${s.y}) harus ujung garis tegak`,
    );
  }
});

test('AI garis: aiLineTargets — ujung tertutup/tepi papan & tanpa garis', () => {
  const edge = createAi();
  aiRegister(edge, 0, 5, true, null);
  aiRegister(edge, 1, 5, true, null);
  assert.deepEqual(aiLineTargets(edge), [{ x: 2, y: 5 }], 'tepi kiri: hanya ujung kanan');
  const blocked = createAi();
  aiRegister(blocked, 5, 5, true, null);
  aiRegister(blocked, 6, 5, true, null);
  aiRegister(blocked, 4, 5, false, null); // ujung kiri sudah ditembak (meleset)
  assert.deepEqual(aiLineTargets(blocked), [{ x: 7, y: 5 }], 'ujung tertutup tersingkir');
  const single = createAi();
  aiRegister(single, 5, 5, true, null);
  assert.deepEqual(aiLineTargets(single), [], 'satu hit belum membentuk garis');
  const scattered = createAi();
  aiRegister(scattered, 1, 1, true, null);
  aiRegister(scattered, 3, 1, true, null); // sebaris tapi tidak bersebelahan
  assert.deepEqual(aiLineTargets(scattered), [], 'hit tidak bersebelahan bukan garis');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
