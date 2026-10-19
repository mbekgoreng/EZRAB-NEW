/**
 * Lari Proyek 3D — logic tests. Run: npx tsx src/game-space/games/lari-proyek/logic.test.ts
 * Deterministik via mulberry32. Logika 3D: 3 lajur, lompat/roll state machine,
 * spawn pola rintangan (jaminan lajur lolos), tabrakan AABB, grace period.
 */
import { strict as assert } from 'node:assert';
import {
  mulberry32, LANES, createPlayer, stepPlayer, playerBox, playerHeight, jumpHeight,
  speedFor, gapFor, spawnRow, spawnHelmRow, obstacleBox, boxesOverlap,
  checkHits, stepWorld, checkBataLanding, scoreFor,
  GRAV, JUMP_V, JUMP_BUFFER_T, ROLL_T, STAND_H, ROLL_H, GRACE_T,
  BATA_FALL_T, type Obstacle, type Player,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}
const idle = { left: false, right: false, jump: false, roll: false };
const step = (p: Player, n: number, inp = idle, dt = 1 / 60) => {
  let ev: string[] = [];
  for (let i = 0; i < n; i += 1) ev = stepPlayer(p, dt, inp);
  return ev;
};
/** Kumpulkan SEMUA event selama n frame (step() hanya kembalikan frame terakhir). */
const stepAll = (p: Player, n: number, inp = idle, dt = 1 / 60) => {
  const all: string[] = [];
  for (let i = 0; i < n; i += 1) all.push(...stepPlayer(p, dt, inp));
  return all;
};

console.log('\n[1] mulberry32 deterministik');
test('seed sama -> urutan sama', () => {
  const a = mulberry32(42); const b = mulberry32(42);
  for (let i = 0; i < 10; i += 1) assert.equal(a(), b());
});
test('nilai di [0,1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 100; i += 1) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

console.log('\n[2] stepPlayer — pindah lajur');
test('3 lajur di x = -2, 0, 2; mulai di tengah', () => {
  assert.deepEqual([...LANES], [-2, 0, 2]);
  const p = createPlayer();
  assert.equal(p.lane, 1);
  assert.equal(p.laneX, 0);
});
test('kiri/kanan pindah lajur logika, clamp di tepi', () => {
  const p = createPlayer();
  let ev = stepPlayer(p, 1 / 60, { ...idle, left: true });
  assert.ok(ev.includes('lane'));
  assert.equal(p.lane, 0);
  ev = stepPlayer(p, 1 / 60, { ...idle, left: true });
  assert.equal(p.lane, 0, 'tidak bisa keluar lajur kiri');
  stepPlayer(p, 1 / 60, { ...idle, right: true });
  stepPlayer(p, 1 / 60, { ...idle, right: true });
  assert.equal(p.lane, 2);
  stepPlayer(p, 1 / 60, { ...idle, right: true });
  assert.equal(p.lane, 2, 'tidak bisa keluar lajur kanan');
});
test('laneX lerp halus ke target (bukan teleport)', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, right: true });
  assert.ok(p.laneX > 0 && p.laneX < 2, `laneX=${p.laneX} harus di antara 0 dan 2`);
  step(p, 60);
  assert.ok(Math.abs(p.laneX - 2) < 0.05, `laneX=${p.laneX} harus nyaris 2 setelah 1 dtk`);
});

console.log('\n[3] stepPlayer — lompat + buffer 100ms');
test('lompat: vy = JUMP_V, tidak grounded', () => {
  const p = createPlayer();
  const ev = stepPlayer(p, 1 / 60, { ...idle, jump: true });
  assert.ok(ev.includes('jump'));
  assert.ok(Math.abs(p.vy - (JUMP_V - GRAV / 60)) < 1e-9, `vy=${p.vy}`);
  assert.equal(p.grounded, false);
});
test('lompat mencapai tinggi teoritis vy^2/2g', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, jump: true });
  let maxY = 0;
  for (let i = 0; i < 300 && !p.grounded; i += 1) {
    stepPlayer(p, 1 / 60, idle);
    maxY = Math.max(maxY, p.y);
  }
  const theory = jumpHeight();
  assert.ok(Math.abs(maxY - theory) / theory < 0.06, `maxY=${maxY} theory=${theory}`);
  assert.equal(p.grounded, true, 'mendarat kembali');
});
test('tidak bisa double-jump', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, jump: true });
  const vy1 = p.vy;
  const ev = stepPlayer(p, 1 / 60, { ...idle, jump: true });
  assert.ok(!ev.includes('jump'), 'tidak boleh ada event jump kedua');
  assert.ok(p.vy < vy1, 'gravitasi tetap jalan (vy berkurang), bukan reset lompatan');
});
test('buffer: lompat ditekan <=100ms sebelum mendarat tetap jalan', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, jump: true });
  // terbang sampai nyaris mendarat (turun, y kecil)
  let guard = 0;
  while ((p.y > 0.4 || p.vy > 0) && guard++ < 400) stepPlayer(p, 1 / 60, idle);
  assert.equal(p.grounded, false, 'masih di udara');
  stepPlayer(p, 1 / 60, { ...idle, jump: true }); // buffer diset
  assert.ok(p.bufferT > 0, 'buffer aktif');
  const ev = stepAll(p, 10);
  assert.ok(ev.includes('jump'), 'buffered jump harus fire saat mendarat');
  assert.equal(p.grounded, false, 'langsung lompat lagi');
});
test('buffer kedaluwarsa setelah 100ms', () => {
  const p = createPlayer();
  p.grounded = false; p.y = 3; p.vy = 0; // lompatan tinggi buatan
  stepPlayer(p, 1 / 60, { ...idle, jump: true }); // buffer diset
  assert.ok(p.bufferT > 0 && p.bufferT <= JUMP_BUFFER_T);
  step(p, 30); // 0.5 dtk di udara
  assert.equal(p.bufferT, 0, 'buffer habis sebelum mendarat');
});

console.log('\n[4] stepPlayer — roll 0.6 dtk + slam');
test('roll mengecilkan hitbox & selesai setelah ROLL_T', () => {
  const p = createPlayer();
  assert.equal(playerHeight(p), STAND_H);
  const ev = stepPlayer(p, 1 / 60, { ...idle, roll: true });
  assert.ok(ev.includes('roll'));
  assert.equal(p.rolling, true);
  assert.equal(playerHeight(p), ROLL_H);
  assert.ok(ROLL_H < STAND_H);
  step(p, Math.ceil((ROLL_T + 0.05) * 60));
  assert.equal(p.rolling, false);
  assert.equal(playerHeight(p), STAND_H);
});
test('roll saat di udara = slam (jatuh cepat) + roll saat mendarat', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, jump: true });
  step(p, 5);
  const ev = stepPlayer(p, 1 / 60, { ...idle, roll: true });
  assert.ok(ev.includes('slam'));
  assert.ok(p.vy <= -20, `vy=${p.vy} harus jatuh cepat`);
  assert.equal(p.pendingRoll, true);
  const ev2 = stepAll(p, 120);
  assert.ok(ev2.includes('roll'), 'roll jalan otomatis saat mendarat');
  // verifikasi state rolling tepat setelah mendarat (bukan setelah roll kedaluwarsa)
  const q = createPlayer();
  stepPlayer(q, 1 / 60, { ...idle, jump: true });
  step(q, 5);
  stepPlayer(q, 1 / 60, { ...idle, roll: true });
  let sawRoll = false;
  for (let i = 0; i < 60 && !sawRoll; i += 1) {
    if (stepPlayer(q, 1 / 60, idle).includes('roll')) sawRoll = true;
  }
  assert.ok(sawRoll && q.rolling, 'tepat setelah mendarat harus rolling');
});
test('lompat membatalkan roll', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, roll: true });
  assert.equal(p.rolling, true);
  stepPlayer(p, 1 / 60, { ...idle, jump: true });
  assert.equal(p.rolling, false);
});

console.log('\n[5] speedFor & gapFor');
test('kecepatan 8 -> 22 m/s, naik dengan jarak', () => {
  assert.equal(speedFor(0), 8);
  assert.ok(speedFor(1000) > speedFor(0));
  assert.equal(speedFor(1e9), 22);
});
test('gap adil: >= 14m, menyempit saat cepat, longgar di awal', () => {
  const rng = mulberry32(3);
  const gSlow = gapFor(8, 1000, rng);
  const gFast = gapFor(22, 1000, rng);
  assert.ok(gSlow >= 14 && gFast >= 14, `gSlow=${gSlow} gFast=${gFast}`);
  assert.ok(gFast <= gSlow + 8, 'gap cepat tidak jauh lebih besar');
  const gEarly = gapFor(8, 0, rng);
  assert.ok(gEarly > gSlow, `awal ${gEarly} > normal ${gSlow}`);
});

console.log('\n[6] spawnRow — pola adil & deterministik');
test('seed sama -> pola sama', () => {
  const a = spawnRow({ rng: mulberry32(99), distanceM: 500, lastHard: false });
  const b = spawnRow({ rng: mulberry32(99), distanceM: 500, lastHard: false });
  assert.deepEqual(a, b);
});
test('barikade: SELALU ada lajur lolos (maks 2 lajur)', () => {
  const rng = mulberry32(1234);
  for (let i = 0; i < 500; i += 1) {
    const { obstacles } = spawnRow({ rng, distanceM: 2000, lastHard: false });
    const bk = obstacles.filter((o) => o.kind === 'barikade');
    assert.ok(bk.length <= 2, `barikade ${bk.length} lajur!`);
    const lanes = new Set(bk.map((o) => o.lane));
    assert.ok(lanes.size <= 2);
  }
});
test('setelah baris berat -> baris ringan (1 rintangan)', () => {
  const rng = mulberry32(77);
  for (let i = 0; i < 200; i += 1) {
    const row = spawnRow({ rng, distanceM: 2000, lastHard: true });
    assert.equal(row.obstacles.length, 1, 'baris setelah hard harus ringan');
    assert.equal(row.hard, false);
  }
});
test('kurva kesulitan: barikade & bata terkunci di awal', () => {
  const rng = mulberry32(55);
  for (let i = 0; i < 200; i += 1) {
    const { obstacles } = spawnRow({ rng, distanceM: 50, lastHard: false });
    for (const o of obstacles) {
      assert.ok(o.kind !== 'barikade', 'barikade belum boleh < 150m');
      assert.ok(o.kind !== 'bata', 'bata belum boleh < 300m');
    }
  }
});
test('spawnHelmRow: 3 helm segaris satu lajur', () => {
  const hs = spawnHelmRow(mulberry32(5));
  assert.equal(hs.length, 3);
  assert.ok(hs.every((h) => h.kind === 'helm'));
  assert.ok(hs.every((h) => h.lane === hs[0].lane));
});

console.log('\n[7] checkHits — AABB 3D + grace period');
const T = GRACE_T + 1; // runTime di luar grace
function barierAt(lane: number, z: number): Obstacle {
  return { kind: 'barier', lane, z, w: 1.7, h: 0.95, d: 0.5, yOff: 0, dead: false };
}
test('GRACE: tidak ada kematian di 2 detik pertama', () => {
  const p = createPlayer();
  const hit = checkHits(p, [barierAt(1, 0)], GRACE_T - 0.01);
  assert.equal(hit, null, 'grace period harus null');
  const hit2 = checkHits(p, [barierAt(1, 0)], GRACE_T);
  assert.ok(hit2 && hit2.kind === 'hit', 'setelah grace boleh kena');
});
test('barier: kena saat berdiri, lolos saat lompat', () => {
  const p = createPlayer();
  assert.equal(checkHits(p, [barierAt(1, 0)], T)?.kind, 'hit');
  const p2 = createPlayer();
  stepPlayer(p2, 1 / 60, { ...idle, jump: true });
  for (let i = 0; i < 20 && p2.y < 1.0; i += 1) stepPlayer(p2, 1 / 60, idle);
  assert.ok(p2.y > 0.95, `y=${p2.y}`);
  assert.equal(checkHits(p2, [barierAt(1, 0)], T), null, 'lompat melewati barier');
});
test('barier di lajur lain tidak kena', () => {
  const p = createPlayer();
  assert.equal(checkHits(p, [barierAt(0, 0)], T), null);
});
test('balok gantung: kena saat berdiri, lolos saat roll', () => {
  const balok: Obstacle = { kind: 'balok', lane: 1, z: 0, w: 1.8, h: 0.7, d: 0.5, yOff: 1.05, dead: false };
  const p = createPlayer();
  assert.equal(checkHits(p, [balok], T)?.kind, 'hit');
  const p2 = createPlayer();
  stepPlayer(p2, 1 / 60, { ...idle, roll: true });
  assert.equal(checkHits(p2, [{ ...balok }], T), null, 'roll lolos dari balok gantung');
  const p3 = createPlayer();
  stepPlayer(p3, 1 / 60, { ...idle, jump: true });
  for (let i = 0; i < 25; i += 1) stepPlayer(p3, 1 / 60, idle);
  assert.equal(checkHits(p3, [{ ...balok }], T)?.kind, 'hit', 'lompat ke balok = kena');
});
test('barikade: tidak bisa dilompati', () => {
  const bk: Obstacle = { kind: 'barikade', lane: 1, z: 0, w: 1.8, h: 2.4, d: 0.6, yOff: 0, dead: false };
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, jump: true });
  let maxY = 0;
  for (let i = 0; i < 120; i += 1) { stepPlayer(p, 1 / 60, idle); maxY = Math.max(maxY, p.y); if (p.grounded && i > 5) break; }
  assert.ok(maxY < 2.4, `lompat maks ${maxY} < 2.4`);
});
test('helm: magnet + collect, bukan hit', () => {
  const helm: Obstacle = { kind: 'helm', lane: 1, z: -2.0, w: 0.6, h: 0.6, d: 0.6, yOff: 1.1, dead: false };
  const p = createPlayer();
  let r = null as ReturnType<typeof checkHits>;
  for (let i = 0; i < 12 && !r; i += 1) r = checkHits(p, [helm], T); // magnet konvergen per frame
  assert.ok(r && r.kind === 'helm', 'helm dekat ketarik & keambil');
  assert.equal(helm.dead, true);
});
test('helm di lajur lain tidak ketarik', () => {
  const helm: Obstacle = { kind: 'helm', lane: 0, z: -0.2, w: 0.6, h: 0.6, d: 0.6, yOff: 1.1, dead: false };
  const p = createPlayer();
  assert.equal(checkHits(p, [helm], T), null);
});
test('boxesOverlap dasar', () => {
  const b = (x: number): ReturnType<typeof playerBox> => ({ x0: x, y0: 0, z0: 0, x1: x + 1, y1: 1, z1: 1 });
  assert.equal(boxesOverlap(b(0), b(0.5)), true);
  assert.equal(boxesOverlap(b(0), b(5)), false);
});
test('playerBox mengikuti laneX & roll', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, { ...idle, right: true });
  step(p, 120);
  const pb = playerBox(p);
  assert.ok(Math.abs((pb.x0 + pb.x1) / 2 - 2) < 0.05, 'box di lajur kanan');
  stepPlayer(p, 1 / 60, { ...idle, roll: true });
  const pb2 = playerBox(p);
  assert.ok(Math.abs((pb2.y1 - pb2.y0) - ROLL_H) < 1e-9);
});

console.log('\n[8] bata jatuh — telegraph adil & ketiban');
test('bata: approach -> warn -> fall -> rubble, mendarat di z ~= 0', () => {
  const o: Obstacle = {
    kind: 'bata', lane: 1, z: -30, w: 1.0, h: 0.4, d: 1.0, yOff: 0,
    phase: 'approach', t: 0, brickY: 6, dead: false,
  };
  const speed = 10;
  let warned = false; let landed = false;
  for (let i = 0; i < 1200 && o.phase !== 'rubble'; i += 1) {
    for (const e of stepWorld([o], 1 / 60, speed)) {
      if (e.kind === 'bataWarn') warned = true;
      if (e.kind === 'bataLand') landed = true;
    }
  }
  assert.equal(o.phase, 'rubble');
  assert.ok(warned && landed, 'event warn & land harus ada');
  assert.ok(Math.abs(o.z) < 1.5, `bata mendarat di z=${o.z} (harus ~= 0)`);
});
test('telegraph adil di kecepatan tinggi', () => {
  for (const speed of [8, 15, 22]) {
    const o: Obstacle = {
      kind: 'bata', lane: 1, z: -30, w: 1.0, h: 0.4, d: 1.0, yOff: 0,
      phase: 'approach', t: 0, brickY: 6, dead: false,
    };
    for (let i = 0; i < 1200 && o.phase !== 'rubble'; i += 1) stepWorld([o], 1 / 60, speed);
    assert.ok(Math.abs(o.z) < 2.0, `speed=${speed}: z=${o.z}`);
  }
});
test('ketiban: napak di lajur bata saat mendarat', () => {
  const p = createPlayer();
  const o: Obstacle = { kind: 'bata', lane: 1, z: 0, w: 1, h: 0.4, d: 1, yOff: 0, phase: 'rubble', dead: false };
  assert.equal(checkBataLanding(p, o), true);
  const p2 = createPlayer();
  stepPlayer(p2, 1 / 60, { ...idle, jump: true });
  for (let i = 0; i < 15; i += 1) stepPlayer(p2, 1 / 60, idle);
  assert.equal(checkBataLanding(p2, o), false, 'melompat -> selamat');
  const p3 = createPlayer();
  stepPlayer(p3, 1 / 60, { ...idle, left: true });
  assert.equal(checkBataLanding(p3, o), false, 'pindah lajur -> selamat');
});
test('rubble rendah: kena saat napak, lolos saat lompat', () => {
  const o: Obstacle = { kind: 'bata', lane: 1, z: 0, w: 1, h: 0.4, d: 1, yOff: 0, phase: 'rubble', dead: false };
  const b = obstacleBox(o)!;
  assert.equal(b.y1, 0.4);
  const p = createPlayer();
  assert.equal(checkHits(p, [o], T)?.kind, 'hit');
});

console.log('\n[9] scoreFor');
test('skor = meter + helm*50', () => {
  assert.equal(scoreFor(100, 0), 100);
  assert.equal(scoreFor(100, 2), 200);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
