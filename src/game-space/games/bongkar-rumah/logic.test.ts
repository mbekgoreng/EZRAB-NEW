/**
 * Bongkar Rumah 3D — logic tests.
 * Run: npx tsx src/game-space/games/bongkar-rumah/logic.test.ts
 * (atau: esbuild -> node, bila tsx tak tersedia)
 */
import { strict as assert } from 'node:assert';
import {
  createLevel, destroyBlock, createCombo, activeMultiplier,
  checkCollapse, stepPhysics, supportRatio,
  progress, isWon, layerCounts, LEVELS,
  GRAVITY, COMBO_WINDOW, WIN_PROGRESS, BASE_POINTS, MAX_MULTIPLIER,
  type Block3D,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}

/** Menara sintetis: kolom vertikal 1x1, n blok. */
function tower(n: number, h = 1): Block3D[] {
  const out: Block3D[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      id: i + 1, cx: 0, cz: 0, cw: 1, cd: 1, y0: i * h, h,
      layer: 'facade', mat: 'bata', shape: 'box',
      hp: 1, maxHp: 1, state: 'intact',
      px: 0.5, py: i * h, pz: 0.5,
      vx: 0, vy: 0, vz: 0, tilt: 0, vtilt: 0, tiltAxis: 0,
      slope: 0, rotY: 0, shakeT: 0, bounces: 0, seed: 7 + i,
      anchored: false, tint: 0xffffff,
    });
  }
  return out;
}

/** Settle: jalankan fisika sampai tak ada yang falling/shaking (maks 20 dtk sim). */
function settle(blocks: Block3D[]): void {
  for (let i = 0; i < 1200; i += 1) {
    const active = blocks.some((b) => b.state === 'falling' || b.state === 'shaking');
    if (!active) break;
    stepPhysics(blocks, 1 / 60);
  }
}

console.log('\n[1] konstruksi level');
test('4 level valid, blok bertambah per level', () => {
  const counts = [0, 1, 2, 3].map((i) => createLevel(i).blocks.length);
  console.log('    blok per level:', counts.join(', '));
  counts.forEach((c, i) => assert.ok(c > 40, `L${i + 1} terlalu sedikit (${c})`));
  for (let i = 1; i < 4; i += 1) {
    assert.ok(counts[i] > counts[i - 1], `L${i + 1} harus lebih besar dari L${i}`);
  }
  assert.equal(LEVELS.length, 4);
  assert.equal(LEVELS[0].name, 'Rumah Type 36');
  assert.equal(LEVELS[3].name, 'Tower');
});
test('deterministik: dua build identik', () => {
  const a = createLevel(2).blocks;
  const b = createLevel(2).blocks;
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((x) => [x.cx, x.cz, x.y0, x.mat, x.layer]), b.map((x) => [x.cx, x.cz, x.y0, x.mat, x.layer]));
});
test('STABIL saat mulai: tak ada runtuhan otomatis (grace)', () => {
  for (let i = 0; i < 4; i += 1) {
    const { blocks } = createLevel(i);
    const ev = checkCollapse(blocks);
    assert.equal(ev.length, 0, `L${i + 1} runtuh sendiri: ${ev.map((e) => e.block.id).join(',')}`);
    assert.ok(blocks.every((x) => x.state === 'intact'), `L${i + 1} ada blok tak intact`);
  }
});
test('setiap level punya 3 lapis (facade/interior/structure)', () => {
  for (let i = 0; i < 4; i += 1) {
    const lc = layerCounts(createLevel(i).blocks);
    assert.ok(lc.facade.total > 10, `L${i + 1} facade`);
    assert.ok(lc.interior.total > 3, `L${i + 1} interior`);
    assert.ok(lc.structure.total > 3, `L${i + 1} structure`);
  }
});
test('bounds kamera masuk akal', () => {
  const { bounds } = createLevel(3);
  assert.ok(bounds.top > 15, `tower top=${bounds.top}`);
  assert.ok(bounds.x1 - bounds.x0 >= 7);
});

console.log('\n[2] destroyBlock & kombo');
test('fasad HP1: sekali ketuk -> gone + 10 poin', () => {
  const { blocks } = createLevel(0, 1);
  const combo = createCombo();
  const target = blocks.find((b) => b.layer === 'facade' && b.state === 'intact')!;
  const r = destroyBlock(blocks, target.id, combo, 100);
  assert.equal(r.ok, true);
  assert.equal(r.points, BASE_POINTS);
  assert.equal(r.multiplier, 1);
  assert.equal(target.state, 'gone');
});
test('fasad HP2: ketuk1 retak, ketuk2 hancur', () => {
  const { blocks } = createLevel(0, 2);
  const combo = createCombo();
  const target = blocks.find((b) => b.layer === 'facade' && b.state === 'intact')!;
  const r1 = destroyBlock(blocks, target.id, combo, 100);
  assert.equal(r1.ok, true);
  assert.equal(target.state, 'cracked');
  assert.equal(r1.points, 0);
  const r2 = destroyBlock(blocks, target.id, combo, 100.4);
  assert.equal(target.state, 'gone');
  assert.ok(r2.points > 0);
});
test('struktur beton HP3: dua retak lalu hancur', () => {
  const { blocks } = createLevel(0, 1);
  const combo = createCombo();
  const col = blocks.find((b) => b.layer === 'structure' && b.mat === 'beton')!;
  assert.equal(col.hp, 3);
  destroyBlock(blocks, col.id, combo, 1);
  assert.equal(col.state, 'cracked');
  destroyBlock(blocks, col.id, combo, 1.2);
  assert.equal(col.state, 'cracked');
  const r = destroyBlock(blocks, col.id, combo, 1.4);
  assert.equal(col.state, 'gone');
  assert.equal(r.multiplier, 1); // kombo dihitung per hancur, bukan per ketuk
});
test('kombo: hancur beruntun < 1.5 dtk -> multiplier naik, maks 5x', () => {
  const { blocks } = createLevel(0, 1);
  const combo = createCombo();
  const ids = blocks.filter((b) => b.layer === 'facade').slice(0, 7).map((b) => b.id);
  const mults = ids.map((id, i) => destroyBlock(blocks, id, combo, 50 + i * 0.2).multiplier);
  assert.deepEqual(mults, [1, 2, 3, 4, 5, 5, 5]);
});
test('kombo reset bila jeda > 1.5 dtk', () => {
  const { blocks } = createLevel(0, 1);
  const combo = createCombo();
  const ids = blocks.filter((b) => b.layer === 'facade').slice(0, 2).map((b) => b.id);
  destroyBlock(blocks, ids[0], combo, 10);
  const r = destroyBlock(blocks, ids[1], combo, 10 + COMBO_WINDOW + 0.1);
  assert.equal(r.multiplier, 1);
});
test('destroyBlock id salah / blok gone -> ok:false', () => {
  const { blocks } = createLevel(0, 1);
  const combo = createCombo();
  assert.equal(destroyBlock(blocks, 99999, combo, 1).ok, false);
  const t = blocks.find((b) => b.layer === 'facade')!;
  destroyBlock(blocks, t.id, combo, 1);
  assert.equal(destroyBlock(blocks, t.id, combo, 1.1).ok, false);
});
test('activeMultiplier 0 saat kedaluwarsa', () => {
  const c = createCombo(); c.count = 4; c.lastAt = 20;
  assert.equal(activeMultiplier(c, 21), 4);
  assert.equal(activeMultiplier(c, 22), 0);
});

console.log('\n[3] penyangga & keruntuhan');
test('menara: hancurkan dasar -> runtuh beruntun berurutan (bukan serentak)', () => {
  const blocks = tower(3);
  const combo = createCombo();
  destroyBlock(blocks, 1, combo, 1);
  const ev = checkCollapse(blocks);
  // hanya blok 2 yang langsung kehilangan penyangga; blok 3 masih ditopang blok 2
  assert.equal(ev.length, 1, 'hanya 1 blok goyang dulu');
  assert.equal(blocks[1].state, 'shaking');
  assert.equal(blocks[2].state, 'intact');
  assert.ok(blocks[1].shakeT > 0, 'ada jeda goyang sebelum jatuh');
  settle(blocks);
  assert.equal(blocks[1].state, 'rubble');
  assert.equal(blocks[2].state, 'rubble');
  // menumpuk: blok 2 di atas blok 1
  assert.ok(blocks[2].py > blocks[1].py, 'blok atas menumpuk di atas blok bawah');
  assert.equal(progress(blocks), 1);
});
test('blok goyang dulu sebelum jatuh (terbaca beruntun)', () => {
  const blocks = tower(2);
  destroyBlock(blocks, 1, createCombo(), 1);
  checkCollapse(blocks);
  assert.equal(blocks[1].state, 'shaking');
  stepPhysics(blocks, 0.05);
  assert.equal(blocks[1].state, 'shaking', 'belum jatuh dalam 50ms');
});
test('ambang pintu L1: hancurkan pintu -> ambang jatuh', () => {
  const { blocks } = createLevel(0, 1);
  const door = blocks.find((b) => b.mat === 'pintu')!;
  const lintel = blocks.find((b) => b.mat === 'bata' && Math.abs(b.y0 - 2.6) < 0.01 && b.cx === door.cx)!;
  assert.ok(lintel, 'ambang ditemukan');
  destroyBlock(blocks, door.id, createCombo(), 1);
  const ev = checkCollapse(blocks);
  assert.ok(ev.some((e) => e.block.id === lintel.id), 'ambang kehilangan penyangga');
  settle(blocks);
  assert.equal(lintel.state, 'rubble');
});
test('tap pertama tak menghancurkan setengah rumah', () => {
  const { blocks } = createLevel(0, 1);
  const target = blocks.find((b) => b.layer === 'facade' && b.mat === 'bata' && b.y0 === 0)!;
  destroyBlock(blocks, target.id, createCombo(), 1);
  checkCollapse(blocks);
  settle(blocks);
  const p = progress(blocks);
  assert.ok(p < 0.2, `progress=${p} terlalu besar untuk 1 ketuk`);
  assert.equal(isWon(blocks), false);
});
test('gravitasi mempercepat benda jatuh', () => {
  const blocks = tower(1);
  blocks[0].state = 'falling';
  blocks[0].py = 10;
  const vy0 = blocks[0].vy;
  stepPhysics(blocks, 0.1);
  assert.ok(blocks[0].vy < vy0 - GRAVITY * 0.09);
});
test('benturan keras -> memantul dulu (bukan langsung rubble)', () => {
  const blocks = tower(1);
  const b = blocks[0];
  b.state = 'falling'; b.py = 6; b.vy = -20;
  let bounced = false;
  for (let i = 0; i < 200 && b.state === 'falling'; i += 1) {
    const ev = stepPhysics(blocks, 1 / 60);
    if (ev.some((e) => e.type === 'bounced')) bounced = true;
  }
  assert.ok(bounced, 'seharusnya memantul saat jatuh dari 6 unit');
  assert.equal(b.state, 'rubble');
});

console.log('\n[4] progress & menang');
test('progress 0 saat utuh; 98% -> menang', () => {
  const { blocks } = createLevel(0, 1);
  assert.equal(progress(blocks), 0);
  assert.equal(isWon(blocks), false);
  const combo = createCombo();
  const need = Math.ceil(blocks.length * WIN_PROGRESS);
  // hancurkan tuntas (blok HP>1 butuh beberapa ketuk)
  blocks.slice(0, need).forEach((b, i) => {
    for (let k = 0; k < 4 && (b.state === 'intact' || b.state === 'cracked'); k += 1) {
      destroyBlock(blocks, b.id, combo, i * 10 + k);
    }
  });
  checkCollapse(blocks);
  settle(blocks);
  assert.ok(progress(blocks) >= WIN_PROGRESS, `progress=${progress(blocks)}`);
  assert.equal(isWon(blocks), true);
});
test('rubble dihitung sebagai hancur (akurat)', () => {
  const blocks = tower(2);
  destroyBlock(blocks, 1, createCombo(), 1);
  checkCollapse(blocks);
  settle(blocks);
  assert.equal(progress(blocks), 1, '1 gone + 1 rubble = 100%');
});
test('layerCounts: left berkurang saat dihancurkan', () => {
  const { blocks } = createLevel(1, 1);
  const before = layerCounts(blocks).facade.left;
  const t = blocks.find((b) => b.layer === 'facade')!;
  destroyBlock(blocks, t.id, createCombo(), 1);
  const after = layerCounts(blocks).facade.left;
  assert.equal(after, before - 1);
});
test('REGRESI 2026-10-19: progress([]) = 0, bukan 1 (engine kirim win sebelum level di-load)', () => {
  assert.equal(progress([]), 0, 'daftar kosong bukan 100%');
  assert.equal(isWon([]), false, 'tidak boleh menang tanpa blok');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
