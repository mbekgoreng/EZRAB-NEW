/**
 * Lari Proyek — logic tests. Run: npx tsx src/game-space/games/lari-proyek/logic.test.ts
 * Deterministik via mulberry32.
 */
import { strict as assert } from 'node:assert';
import {
  mulberry32, createPlayer, stepPlayer, playerRect, jumpHeight,
  speedFor, gapFor, spawnObstacle, obstacleRect, rectsOverlap,
  checkHits, stepObstacles, checkBataLanding, skyPhase, scoreFor,
  GRAV, JUMP_V, SLIDE_T, STAND_H, SLIDE_H, PLAYER_X, GROUND_Y,
  BATA_WARN_T, type Obstacle, type Player,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}

console.log('\n[1] mulberry32 deterministik');
test('seed sama -> urutan sama', () => {
  const a = mulberry32(42); const b = mulberry32(42);
  for (let i = 0; i < 10; i += 1) assert.equal(a(), b());
});
test('seed beda -> (kemungkinan besar) beda', () => {
  const a = mulberry32(1); const b = mulberry32(2);
  assert.ok(a() !== b() || a() !== b());
});
test('nilai di [0,1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 100; i += 1) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

console.log('\n[2] stepPlayer — lompat');
test('lompat: vy = -JUMP_V, tidak grounded', () => {
  const p = createPlayer();
  const ev = stepPlayer(p, 1 / 60, true, false);
  assert.ok(ev.includes('jump'));
  assert.ok(Math.abs(p.vy - (-JUMP_V + GRAV / 60)) < 1e-9, `vy=${p.vy} (jump + 1 frame gravitasi)`);
  assert.equal(p.grounded, false);
});
test('lompat mencapai tinggi teoritis vy^2/2g', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, true, false);
  let maxY = 0;
  for (let i = 0; i < 300 && !p.grounded; i += 1) {
    stepPlayer(p, 1 / 60, false, false);
    maxY = Math.max(maxY, p.y);
  }
  const theory = jumpHeight();
  assert.ok(Math.abs(maxY - theory) / theory < 0.06, `maxY=${maxY} theory=${theory}`);
  assert.equal(p.grounded, true, 'mendarat kembali');
});
test('tidak bisa double-jump', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, true, false);
  const vy1 = p.vy;
  stepPlayer(p, 1 / 60, true, false);
  assert.notEqual(p.vy, -JUMP_V);
  assert.ok(p.vy > vy1, 'gravitasi tetap jalan, bukan reset lompatan');
});
test('event land saat menyentuh tanah', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, true, false);
  let landed = false;
  for (let i = 0; i < 300; i += 1) {
    if (stepPlayer(p, 1 / 60, false, false).includes('land')) { landed = true; break; }
  }
  assert.equal(landed, true);
});

console.log('\n[3] stepPlayer — slide');
test('slide mengecilkan hitbox', () => {
  const p = createPlayer();
  const h0 = playerRect(p).h;
  assert.equal(h0, STAND_H);
  const ev = stepPlayer(p, 1 / 60, false, true);
  assert.ok(ev.includes('slide'));
  assert.equal(p.sliding, true);
  assert.equal(playerRect(p).h, SLIDE_H);
  assert.ok(SLIDE_H < STAND_H);
});
test('slide selesai setelah SLIDE_T', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, false, true);
  stepPlayer(p, SLIDE_T + 0.05, false, false);
  assert.equal(p.sliding, false);
  assert.equal(playerRect(p).h, STAND_H);
});
test('slide tidak bisa saat melompat', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, true, false);
  stepPlayer(p, 1 / 60, false, true);
  assert.equal(p.sliding, false);
});

console.log('\n[4] speedFor & gapFor');
test('kecepatan naik dengan jarak, cap 700', () => {
  assert.equal(speedFor(0), 260);
  assert.ok(speedFor(10000) > speedFor(0));
  assert.equal(speedFor(1e9), 700);
  assert.equal(speedFor(110000), 700); // 260+440 = 700 tepat di cap
});
test('gap menyempit saat cepat', () => {
  const rng = mulberry32(3);
  const g1 = gapFor(260, rng);
  const g2 = gapFor(700, rng);
  assert.ok(g2 <= g1, `gap700=${g2} <= gap260=${g1}`);
  assert.ok(g1 >= 380 && g2 >= 380);
});

console.log('\n[5] spawnObstacle deterministik');
test('seed sama -> jenis & posisi sama', () => {
  const a = spawnObstacle(mulberry32(99), 300, 950);
  const b = spawnObstacle(mulberry32(99), 300, 950);
  assert.deepEqual(a, b);
});
test('semua jenis valid & bata punya lockX', () => {
  const rng = mulberry32(1234);
  const kinds = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const o = spawnObstacle(rng, 400, 950);
    kinds.add(o.kind);
    assert.ok(['barier', 'balok', 'lubang', 'bata', 'helm'].includes(o.kind));
    if (o.kind === 'bata') {
      assert.ok(typeof o.lockX === 'number');
      assert.equal(o.phase, 'approach');
    }
  }
  assert.ok(kinds.size >= 4, `jenis ter-cover: ${[...kinds].join(',')}`);
});

console.log('\n[6] checkHits');
function barierAt(x: number): Obstacle {
  return { kind: 'barier', x, w: 34, h: 66, yOff: 0, dead: false };
}
test('tabrakan barier terdeteksi', () => {
  const p = createPlayer();
  const hit = checkHits(p, [barierAt(PLAYER_X - 10)]);
  assert.ok(hit && hit.kind === 'hit');
});
test('barier jauh tidak kena', () => {
  const p = createPlayer();
  assert.equal(checkHits(p, [barierAt(PLAYER_X + 300)]), null);
});
test('lompat menghindari barier', () => {
  const p = createPlayer();
  stepPlayer(p, 1 / 60, true, false);
  // naik sampai di atas barier (66px)
  for (let i = 0; i < 30 && p.y < 80; i += 1) stepPlayer(p, 1 / 60, false, false);
  assert.ok(p.y > 66);
  assert.equal(checkHits(p, [barierAt(PLAYER_X - 10)]), null);
});
test('balok gantung: kena saat berdiri, lolos saat slide', () => {
  const balok: Obstacle = { kind: 'balok', x: PLAYER_X - 20, w: 64, h: 34, yOff: 78, dead: false };
  const p = createPlayer();
  assert.ok(checkHits(p, [balok].map((o) => ({ ...o })))?.kind === 'hit');
  const p2 = createPlayer();
  stepPlayer(p2, 1 / 60, false, true);
  assert.equal(checkHits(p2, [{ ...balok }]), null, 'slide lolos dari balok gantung');
});
test('lubang: jatuh bila napak di atasnya', () => {
  const lubang: Obstacle = { kind: 'lubang', x: PLAYER_X - 40, w: 100, h: 0, yOff: 0, dead: false };
  const p = createPlayer();
  assert.equal(checkHits(p, [lubang])?.kind, 'hit');
  const p2 = createPlayer();
  stepPlayer(p2, 1 / 60, true, false);
  for (let i = 0; i < 20; i += 1) stepPlayer(p2, 1 / 60, false, false);
  assert.ok(!p2.grounded);
  assert.equal(checkHits(p2, [{ ...lubang }]), null, 'melompat melewati lubang');
});
test('helm: overlap -> collected, bukan hit', () => {
  const helm: Obstacle = { kind: 'helm', x: PLAYER_X - 10, w: 36, h: 30, yOff: 40, dead: false };
  const p = createPlayer();
  const r = checkHits(p, [helm]);
  assert.ok(r && r.kind === 'helm');
  assert.equal(helm.dead, true);
});

console.log('\n[7] bata jatuh — fase & ketiban');
test('bata: approach -> warn -> fall -> rubble', () => {
  const o: Obstacle = {
    kind: 'bata', x: 500, w: 56, h: 40, yOff: 0,
    phase: 'approach', t: 0, lockX: 300, brickY: -170, dead: false,
  };
  stepObstacles([o], 1, 400, 900); // approach: 500-400=100 <= 300 -> warn
  assert.equal(o.phase, 'warn');
  stepObstacles([o], BATA_WARN_T + 0.01, 400, 900);
  assert.equal(o.phase, 'fall');
  const ev = stepObstacles([o], 1, 400, 900);
  assert.equal(o.phase, 'rubble');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'bataLand');
});
test('ketiban: pemain napak di zona jatuh saat mendarat', () => {
  const p = createPlayer(); // di PLAYER_X, napak
  const o: Obstacle = { kind: 'bata', x: 0, w: 56, h: 40, yOff: 0, phase: 'rubble', lockX: PLAYER_X, dead: false };
  assert.equal(checkBataLanding(p, o), true);
  const p2 = createPlayer();
  stepPlayer(p2, 1 / 60, true, false);
  for (let i = 0; i < 15; i += 1) stepPlayer(p2, 1 / 60, false, false);
  assert.equal(checkBataLanding(p2, o), false, 'sedang melompat -> selamat');
});
test('rubble bisa dilompati (AABB rendah)', () => {
  const o: Obstacle = { kind: 'bata', x: PLAYER_X - 20, w: 56, h: 40, yOff: 0, phase: 'rubble', lockX: PLAYER_X, dead: false };
  const r = obstacleRect(o)!;
  assert.equal(r.h, 30);
  assert.equal(r.y, GROUND_Y - 30);
  const p = createPlayer();
  assert.equal(checkHits(p, [o])?.kind, 'hit', 'napak menabrak rubble');
});

console.log('\n[8] skyPhase & scoreFor');
test('siklus langit 0..3', () => {
  assert.equal(skyPhase(0), 0);
  assert.ok(skyPhase(200) > 0 && skyPhase(200) < 1);
  assert.ok(skyPhase(1200) < 0.01 || Math.abs(skyPhase(1200)) < 1e-9);
});
test('skor = meter + helm*50', () => {
  assert.equal(scoreFor(100, 0), 100);
  assert.equal(scoreFor(100, 2), 200);
});
test('rectsOverlap dasar', () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
