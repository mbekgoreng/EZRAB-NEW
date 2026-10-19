/**
 * ArcadeMahjongMatch logic tests. Run: npx tsx src/game-space/games/arcade/mahjong-match/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  buildLayout, isFree, freePairs, remaining, isCleared,
  shuffleRemaining, mulberry, tileAt,
  type Tile,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}

test('buildLayout: jumlah genap & ada pasangan bebas di awal', () => {
  for (const seed of [1, 7, 99, 1234]) {
    const tiles = buildLayout(seed);
    assert.equal(remaining(tiles) % 2, 0, `seed ${seed}: harus genap`);
    assert.ok(freePairs(tiles).length > 0, `seed ${seed}: harus ada pasangan bebas`);
  }
});

test('ubin tertutup dari atas tidak bebas', () => {
  const tiles: Tile[] = [
    { id: 0, x: 2, y: 2, z: 0, kind: 0, alive: true },
    { id: 1, x: 2, y: 2, z: 1, kind: 1, alive: true },
  ];
  assert.ok(!isFree(tiles, tiles[0]));
  assert.ok(isFree(tiles, tiles[1]));
});

test('ubin terjepit kiri-kanan tidak bebas', () => {
  const tiles: Tile[] = [
    { id: 0, x: 3, y: 2, z: 0, kind: 0, alive: true },
    { id: 1, x: 2, y: 2, z: 0, kind: 1, alive: true },
    { id: 2, x: 4, y: 2, z: 0, kind: 2, alive: true },
  ];
  assert.ok(!isFree(tiles, tiles[0]));
  assert.ok(isFree(tiles, tiles[1])); // sisi kiri terbuka
});

test('freePairs hanya berisi ubin bebas berpasangan', () => {
  const tiles: Tile[] = [
    { id: 0, x: 0, y: 0, z: 0, kind: 5, alive: true },
    { id: 1, x: 7, y: 5, z: 0, kind: 5, alive: true },
    { id: 2, x: 1, y: 0, z: 0, kind: 6, alive: true }, // menutup sisi kanan id 0
    { id: 3, x: 0, y: 0, z: 1, kind: 6, alive: true }, // menutup atas id 0
  ];
  // id 0: tertutup atas -> tidak bebas. id 1 bebas, id 2 bebas, id 3 bebas.
  const pairs = freePairs(tiles);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0][0].kind, 6);
});

test('isCleared benar saat semua mati', () => {
  const tiles = buildLayout(5);
  assert.ok(!isCleared(tiles));
  for (const t of tiles) t.alive = false;
  assert.ok(isCleared(tiles));
});

test('shuffleRemaining: ubin mati tetap, jumlah sama, ada pasangan bebas', () => {
  const tiles = buildLayout(11);
  // bunuh 10 ubin
  let killed = 0;
  for (const t of tiles) {
    if (killed < 10) { t.alive = false; killed += 1; }
  }
  const before = remaining(tiles);
  const next = shuffleRemaining(tiles, mulberry(3));
  assert.equal(remaining(next), before);
  assert.ok(freePairs(next).length > 0);
});

test('tileAt menemukan ubin hidup di slot', () => {
  const tiles = buildLayout(21);
  const t = tiles[0];
  assert.equal(tileAt(tiles, t.x, t.y, t.z)?.id, t.id);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('failures:', failures.join(', ')); process.exit(1); }
