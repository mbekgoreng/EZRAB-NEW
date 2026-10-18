/**
 * Bongkar Rumah — logic tests. Run: npx tsx src/game-space/games/bongkar-rumah/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createLevel, destroyBlock, createCombo, activeMultiplier, stepCollapse,
  progress, isWon, blockAt, LEVELS,
  GRAVITY, COMBO_WINDOW, WIN_PROGRESS, BASE_POINTS, MAX_MULTIPLIER,
  MAT_PARTICLE_COLORS,
  type Block,
} from './logic';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

const GROUND = 600;

function freshBlocks(): Block[] {
  return createLevel(0, GROUND).blocks;
}

/* ---------- level construction ---------- */
test('L1 Rumah Type 36 punya 18 blok', () => {
  const { blocks, total, meta } = createLevel(0, GROUND);
  assert.equal(blocks.length, 18);
  assert.equal(total, 18);
  assert.equal(meta.name, 'Rumah Type 36');
});

test('baris bawah menempel tanah & 4 level valid', () => {
  for (let i = 0; i < LEVELS.length; i += 1) {
    const { blocks } = createLevel(i, GROUND);
    assert.ok(blocks.length > 10, `level ${i} terlalu sedikit`);
    const maxY = Math.max(...blocks.map((b) => b.y + b.h));
    assert.equal(maxY, GROUND, `level ${i} tidak menempel tanah`);
  }
  assert.equal(LEVELS[3].hasCrane, true);
  assert.equal(LEVELS[0].hasCrane, false);
});

test('createLevel deterministik (tanpa random)', () => {
  const a = createLevel(2, GROUND).blocks;
  const b = createLevel(2, GROUND).blocks;
  assert.deepEqual(a.map((x) => [x.x, x.y, x.mat]), b.map((x) => [x.x, x.y, x.mat]));
});

test('L4 Tower lebih banyak blok dari L1', () => {
  assert.ok(createLevel(3, GROUND).blocks.length > createLevel(0, GROUND).blocks.length);
});

/* ---------- destroy & combo ---------- */
test('destroyBlock: blok intact -> gone, 10 poin, multiplier 1', () => {
  const blocks = freshBlocks();
  const combo = createCombo();
  const r = destroyBlock(blocks, blocks[0].id, combo, 100);
  assert.equal(r.ok, true);
  assert.equal(r.points, BASE_POINTS);
  assert.equal(r.multiplier, 1);
  assert.equal(blocks[0].state, 'gone');
});

test('destroyBlock: hancur beruntun < 1.5 dtk -> kombo naik', () => {
  const blocks = freshBlocks();
  const combo = createCombo();
  const ids = blocks.filter((b) => b.state === 'intact').slice(0, 3).map((b) => b.id);
  const r1 = destroyBlock(blocks, ids[0], combo, 100);
  const r2 = destroyBlock(blocks, ids[1], combo, 100.8);
  const r3 = destroyBlock(blocks, ids[2], combo, 101.5);
  assert.equal(r1.multiplier, 1);
  assert.equal(r2.multiplier, 2);
  assert.equal(r3.multiplier, 3);
  assert.equal(r3.points, BASE_POINTS * 3);
});

test('destroyBlock: jeda > 1.5 dtk me-reset kombo', () => {
  const blocks = freshBlocks();
  const combo = createCombo();
  const ids = blocks.filter((b) => b.state === 'intact').slice(0, 2).map((b) => b.id);
  destroyBlock(blocks, ids[0], combo, 100);
  const r = destroyBlock(blocks, ids[1], combo, 100 + COMBO_WINDOW + 0.1);
  assert.equal(r.multiplier, 1);
  assert.equal(r.points, BASE_POINTS);
});

test('multiplier dibatasi 5x', () => {
  const blocks = freshBlocks();
  const combo = createCombo();
  const ids = blocks.filter((b) => b.state === 'intact').map((b) => b.id);
  let last = 0;
  for (let i = 0; i < 8; i += 1) {
    last = destroyBlock(blocks, ids[i], combo, 100 + i * 0.2).multiplier;
  }
  assert.equal(last, MAX_MULTIPLIER);
});

test('destroyBlock: blok gone/rubble/id salah -> ok:false', () => {
  const blocks = freshBlocks();
  const combo = createCombo();
  destroyBlock(blocks, blocks[0].id, combo, 100);
  assert.equal(destroyBlock(blocks, blocks[0].id, combo, 100.1).ok, false);
  blocks[1].state = 'rubble';
  assert.equal(destroyBlock(blocks, blocks[1].id, combo, 100.2).ok, false);
  assert.equal(destroyBlock(blocks, 99999, combo, 100.3).ok, false);
});

test('activeMultiplier: 0 saat kombo kedaluwarsa', () => {
  const combo = createCombo();
  combo.count = 3;
  combo.lastAt = 50;
  assert.equal(activeMultiplier(combo, 51), 3);
  assert.equal(activeMultiplier(combo, 52), 0);
});

/* ---------- collapse physics ---------- */
test('stepCollapse: bangunan utuh tidak runtuh sendiri', () => {
  const blocks = freshBlocks();
  const ev = stepCollapse(blocks, 1 / 60, GROUND);
  assert.equal(ev.length, 0);
  assert.ok(blocks.every((b) => b.state === 'intact'));
});

test('stepCollapse: blok kehilangan penyangga -> falling -> rubble + event', () => {
  // menara 2 blok vertikal
  const blocks: Block[] = [
    { id: 0, x: 100, y: GROUND - 26, w: 34, h: 26, mat: 'bata', vy: 0, state: 'intact' },
    { id: 1, x: 100, y: GROUND - 52, w: 34, h: 26, mat: 'bata', vy: 0, state: 'intact' },
  ];
  blocks[0].state = 'gone'; // hancurkan penyangga
  let ev = stepCollapse(blocks, 1 / 60, GROUND);
  assert.equal(blocks[1].state, 'falling');
  // jatuhkan sampai mendarat
  for (let i = 0; i < 120 && blocks[1].state === 'falling'; i += 1) {
    ev = stepCollapse(blocks, 1 / 60, GROUND);
  }
  assert.equal(blocks[1].state, 'rubble');
  assert.equal(blocks[1].y + blocks[1].h, GROUND);
  assert.ok(ev.some((e) => e.kind === 'landed'));
});

test('stepCollapse: blok jatuh mendarat di atas blok intact lain', () => {
  const blocks: Block[] = [
    { id: 0, x: 100, y: GROUND - 26, w: 34, h: 26, mat: 'beton', vy: 0, state: 'intact' },
    { id: 1, x: 100, y: GROUND - 78, w: 34, h: 26, mat: 'kaca', vy: 0, state: 'falling' },
  ];
  for (let i = 0; i < 120 && blocks[1].state === 'falling'; i += 1) {
    stepCollapse(blocks, 1 / 60, GROUND);
  }
  assert.equal(blocks[1].state, 'rubble');
  assert.equal(blocks[1].y + blocks[1].h, GROUND - 26);
});

test('stepCollapse: overlap-x < 40% bukan penyangga', () => {
  const blocks: Block[] = [
    { id: 0, x: 100, y: GROUND - 26, w: 34, h: 26, mat: 'bata', vy: 0, state: 'intact' },
    // overlap hanya 10px dari 34px (~29%)
    { id: 1, x: 124, y: GROUND - 52, w: 34, h: 26, mat: 'bata', vy: 0, state: 'intact' },
  ];
  stepCollapse(blocks, 1 / 60, GROUND);
  assert.equal(blocks[1].state, 'falling');
});

test('gravitasi mempercepat blok jatuh', () => {
  const blocks: Block[] = [
    { id: 0, x: 100, y: 0, w: 34, h: 26, mat: 'bata', vy: 0, state: 'falling' },
  ];
  stepCollapse(blocks, 0.1, GROUND);
  assert.ok(blocks[0].vy > GRAVITY * 0.09, `vy=${blocks[0].vy}`);
});

/* ---------- progress & win ---------- */
test('progress: 0 saat utuh, naik saat hancur', () => {
  const blocks = freshBlocks();
  assert.equal(progress(blocks), 0);
  const combo = createCombo();
  destroyBlock(blocks, blocks[0].id, combo, 1);
  assert.ok(progress(blocks) > 0 && progress(blocks) < 1);
  assert.equal(isWon(blocks), false);
});

test('isWon: menang di >= 98%', () => {
  const blocks = freshBlocks();
  const combo = createCombo();
  const need = Math.ceil(blocks.length * WIN_PROGRESS);
  const ids = blocks.slice(0, need).map((b) => b.id);
  ids.forEach((id, i) => destroyBlock(blocks, id, combo, i * 10));
  assert.ok(progress(blocks) >= WIN_PROGRESS, `progress=${progress(blocks)}`);
  assert.equal(isWon(blocks), true);
});

test('blockAt: kena blok intact teratas, abaikan gone', () => {
  const blocks = freshBlocks();
  const b = blocks.find((x) => x.state === 'intact')!;
  const hit = blockAt(blocks, b.x + 2, b.y + 2);
  assert.ok(hit && hit.id === b.id);
  assert.equal(blockAt(blocks, -50, -50), null);
  b.state = 'gone';
  assert.notEqual(blockAt(blocks, b.x + 2, b.y + 2)?.id, b.id);
});

test('MAT_PARTICLE_COLORS lengkap untuk semua material', () => {
  for (const m of ['bata', 'kayu', 'kaca', 'beton'] as const) {
    assert.ok(MAT_PARTICLE_COLORS[m].length >= 3, m);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
