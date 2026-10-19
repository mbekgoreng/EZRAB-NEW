/**
 * Material Match — logic tests. Run: npx tsx src/game-space/games/arcade/candy-crush/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createBoard, findMatches, trySwap, resolveBoard, detonate, triggerArea,
  hasPossibleMove, shuffleBoard, levelConfig, cloneBoard,
  ROWS, COLS, NTYPES,
  type Board, type Cell,
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

/** Board kosong terkontrol dari string: '0'-'4' tipe, '.' diabaikan. */
function boardFrom(rows: string[]): Board {
  let id = 1;
  return rows.map((line) =>
    line.split('').map((ch) => ({
      t: Number(ch),
      s: 'none' as const,
      id: id++,
    })),
  );
}

function withSpecial(b: Board, r: number, c: number, s: Cell['s']): Board {
  const nb = cloneBoard(b);
  nb[r][c].s = s;
  return nb;
}

/* ---------- createBoard ---------- */
test('createBoard: 8x8, tanpa match awal, ada langkah', () => {
  for (const seed of [1, 42, 999, 123456]) {
    const b = createBoard(seed);
    assert.equal(b.length, ROWS);
    assert.equal(b[0].length, COLS);
    assert.equal(findMatches(b).length, 0, `seed ${seed}: match awal!`);
    assert.ok(hasPossibleMove(b), `seed ${seed}: tak ada langkah!`);
    for (const row of b) for (const cell of row) {
      assert.ok(cell.t >= 0 && cell.t < NTYPES);
      assert.equal(cell.s, 'none');
    }
  }
});

test('createBoard: id unik', () => {
  const b = createBoard(7);
  const ids = new Set<number>();
  for (const row of b) for (const cell of row) ids.add(cell.id);
  assert.equal(ids.size, ROWS * COLS);
});

/* ---------- findMatches ---------- */
test('findMatches: horizontal 3', () => {
  const b = boardFrom([
    '000.....'.replace(/\./g, '1').split('').map((c, i) => (i < 3 ? '0' : String((i + 1) % 5))).join(''),
    '12340123',
    '23401234',
    '34012340',
    '40123401',
    '01234012',
    '12340123',
    '23401234',
  ]);
  const m = findMatches(b);
  assert.ok(m.some((x) => x.dir === 'h' && x.cells.length === 3), JSON.stringify(m.map(x => x.cells.length)));
});

test('findMatches: vertikal 4 terdeteksi', () => {
  const b = boardFrom([
    '01234012',
    '01234012',
    '01234012',
    '01234012',
    '12340123',
    '23401234',
    '34012340',
    '40123401',
  ]);
  const m = findMatches(b).filter((x) => x.dir === 'v' && x.cells.length === 4);
  assert.equal(m.length, 8, `ditemukan ${m.length}`);
});

/* ---------- trySwap ---------- */
test('trySwap: swap valid yang membentuk match', () => {
  // baris 0: 0 1 0 0 -> swap c0 & c1 -> 1 0 0 0? tidak. Buat: 1 0 0 2 0...
  const b = boardFrom([
    '10020341',
    '12340123',
    '23401234',
    '34012340',
    '40123401',
    '01234012',
    '12340123',
    '23401234',
  ]);
  // swap (0,0) dengan (1,0): kolom 0 menjadi 1,1,2,3,... ; baris 0: 1 0 0 2... -> "0 0" saja. Coba swap (0,1)-(0,2)? sama.
  // Skenario pasti: baris0 "0 0 1 0 ..." swap c2<->c3 -> "0 0 0 1" match!
  const b2 = boardFrom([
    '00102341',
    '12340123',
    '23401234',
    '34012340',
    '40123401',
    '01234012',
    '12340123',
    '23401234',
  ]);
  const res = trySwap(b2, { r: 0, c: 2 }, { r: 0, c: 3 });
  assert.ok(res, 'seharusnya valid');
  assert.equal(findMatches(res!.board).length > 0, true);
  assert.equal(findMatches(b2).length, 0, 'papan asli tak boleh berubah');
});

test('trySwap: swap tak-valid (tak membentuk match) -> null', () => {
  const b = createBoard(5);
  // cari pasangan yang pasti tak valid dengan brute force kecil
  let foundNull = false;
  outer: for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS - 1; c += 1) {
      if (trySwap(b, { r, c }, { r, c: c + 1 }) === null) {
        foundNull = true;
        break outer;
      }
    }
  }
  assert.ok(foundNull, 'harusnya ada swap tak-valid di papan acak');
});

test('trySwap: tak-bersebelahan -> null', () => {
  const b = createBoard(5);
  assert.equal(trySwap(b, { r: 0, c: 0 }, { r: 0, c: 2 }), null);
});

test('trySwap: swap dengan special selalu valid + detonated terisi', () => {
  const b = withSpecial(createBoard(11), 3, 3, 'dinamit');
  const res = trySwap(b, { r: 3, c: 3 }, { r: 3, c: 4 });
  assert.ok(res, 'swap special harus valid');
  assert.ok(res!.detonated, 'detonated harus terisi');
});

/* ---------- resolveBoard ---------- */
test('resolveBoard: 3-match hancur, skor 180, cascade selesai', () => {
  const b = boardFrom([
    '00012341',
    '12340123',
    '23401234',
    '34012340',
    '40123401',
    '01234012',
    '12340123',
    '23401234',
  ]);
  const res = resolveBoard(b, null, 77);
  assert.ok(res.steps.length >= 1, 'minimal 1 langkah crush');
  assert.equal(findMatches(res.board).length, 0, 'tak ada match tersisa');
  assert.ok(res.gained >= 180, `gained=${res.gained}`);
  // semua sel terisi penuh lagi
  for (const row of res.board) for (const cell of row) assert.ok(cell);
});

test('resolveBoard: 4-match melahirkan baja', () => {
  const b = boardFrom([
    '00001234',
    '12340123',
    '23401234',
    '34012340',
    '40123401',
    '01234012',
    '12340123',
    '23401234',
  ]);
  const res = resolveBoard(b, { r: 0, c: 1 }, 78);
  const spawned = res.steps[0].spawned;
  assert.equal(spawned.length, 1, `spawned=${JSON.stringify(spawned)}`);
  assert.equal(spawned[0].s, 'bajaH', `s=${spawned[0].s}`);
  assert.deepEqual({ r: spawned[0].r, c: spawned[0].c }, { r: 0, c: 1 });
});

test('resolveBoard: 5-match melahirkan dinamit', () => {
  const b = boardFrom([
    '00000123',
    '12340123',
    '23401234',
    '34012340',
    '40123401',
    '01234012',
    '12340123',
    '23401234',
  ]);
  const res = resolveBoard(b, null, 79);
  const spawned = res.steps.flatMap((s) => s.spawned);
  assert.ok(spawned.some((s) => s.s === 'dinamit'), 'dinamit lahir');
});

/* ---------- triggerArea / detonate ---------- */
test('triggerArea: bajaH menghapus 1 baris penuh', () => {
  const b = withSpecial(createBoard(21), 2, 5, 'bajaH');
  const area = triggerArea(b, { r: 2, c: 5 });
  assert.equal(area.length, COLS);
  assert.ok(area.every((p) => p.r === 2));
});

test('triggerArea: dinamit = 3x3', () => {
  const b = withSpecial(createBoard(22), 4, 4, 'dinamit');
  const area = triggerArea(b, { r: 4, c: 4 });
  assert.equal(area.length, 9);
});

test('detonate: dinamit menghancurkan 9 sel & papan penuh kembali', () => {
  const b = withSpecial(createBoard(23), 4, 4, 'dinamit');
  const res = detonate(b, { r: 4, c: 4 }, 80);
  assert.ok(res.steps[0].cleared.length >= 9, `cleared=${res.steps[0].cleared.length}`);
  assert.equal(findMatches(res.board).length, 0);
});

/* ---------- hasPossibleMove & shuffle ---------- */
test('shuffleBoard: papan valid (tanpa match, ada langkah)', () => {
  const b = shuffleBoard(createBoard(31), 99);
  assert.equal(findMatches(b).length, 0);
  assert.ok(hasPossibleMove(b));
});

/* ---------- levelConfig ---------- */
test('levelConfig: target naik per level, moves 30', () => {
  const l1 = levelConfig(1);
  const l3 = levelConfig(3);
  assert.equal(l1.moves, 30);
  assert.ok(l3.target > l1.target, `${l3.target} > ${l1.target}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAILURES:', failures.join(', '));
  process.exit(1);
}
