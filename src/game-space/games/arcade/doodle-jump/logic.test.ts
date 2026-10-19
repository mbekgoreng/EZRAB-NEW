/**
 * Lompat Scaffolding — logic tests. Run: npx tsx src/game-space/games/arcade/doodle-jump/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createWorld, stepWorld, maxJumpHeight, GRAVITY, BOUNCE_V, SUPER_V, WORLD_W,
  type World,
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

const DT = 1 / 60;
const idle = { left: false, right: false };

function clone(w: World): World {
  return { ...w, platforms: w.platforms.map((p) => ({ ...p })) };
}

test('createWorld: pemain di atas platform awal', () => {
  const w = createWorld(1);
  assert.ok(w.platforms.length > 5, `platform=${w.platforms.length}`);
  const p0 = w.platforms[0];
  assert.ok(w.px > p0.x && w.px < p0.x + p0.w, 'pemain di atas platform pertama');
});

test('mendarat di kayu -> vy = BOUNCE_V', () => {
  const w = createWorld(2);
  // letakkan pemain tepat di atas sebuah platform kayu, sedang jatuh
  const p = w.platforms.find((x) => x.kind === 'kayu' && x.y > 200)!;
  assert.ok(p, 'ada platform kayu');
  w.px = p.x + p.w / 2;
  w.py = p.y + 1.2;
  w.vy = -300;
  const ev = stepWorld(w, DT, idle);
  assert.ok(ev.bounced, 'harus memantul');
  assert.equal(w.vy, BOUNCE_V);
  assert.equal(w.bounces, 1);
});

test('lapuk: patah sekali injak', () => {
  const w = createWorld(3);
  w.platforms.push({ x: 150, y: 300, w: 90, kind: 'lapuk', vx: 0, broken: false, id: 999 });
  w.px = 195; w.py = 301.2; w.vy = -300;
  const ev = stepWorld(w, DT, idle);
  assert.ok(ev.broke, 'harus patah');
  assert.ok(ev.broke!.broken);
  // injak lagi -> tak memantul (sudah patah)
  w.py = 304; w.vy = -100;
  const ev2 = stepWorld(w, DT, idle);
  assert.ok(!ev2.bounced || ev2.bounced.id !== 999, 'platform patah tak bisa diinjak');
});

test('dongkrak: lantingan super', () => {
  const w = createWorld(4);
  w.platforms.push({ x: 150, y: 300, w: 64, kind: 'dongkrak', vx: 0, broken: false, id: 998 });
  w.px = 182; w.py = 301.2; w.vy = -300;
  const ev = stepWorld(w, DT, idle);
  assert.ok(ev.super, 'harus super');
  assert.equal(w.vy, SUPER_V);
  assert.ok(SUPER_V > BOUNCE_V);
});

test('gerobak bergerak & memantul di tepi', () => {
  const w = createWorld(5);
  const g = w.platforms.find((x) => x.kind === 'gerobak');
  assert.ok(g, 'ada gerobak');
  const x0 = g!.x;
  stepWorld(w, 0.5, idle);
  assert.notEqual(g!.x, x0, 'gerobak harus bergerak');
  // paksa ke tepi
  g!.x = -5; g!.vx = -100;
  stepWorld(w, DT, idle);
  assert.ok(g!.vx > 0, 'vx harus berbalik di tepi kiri');
});

test('gerak horizontal & tembus dinding', () => {
  const w = createWorld(6);
  w.px = 200; w.py = 500; w.vy = 300;
  stepWorld(w, 0.05, { left: true, right: false });
  assert.ok(w.px < 200, 'bergerak ke kiri');
  w.px = -30;
  stepWorld(w, DT, idle);
  assert.ok(w.px > WORLD_W - 50, `tembus ke kanan, px=${w.px}`);
});

test('jarak antar platform selalu terjangkau', () => {
  const maxH = maxJumpHeight();
  assert.ok(maxH > 130, `maxJump=${maxH}`);
  const w = createWorld(7);
  const ys = [...w.platforms].map((p) => p.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i += 1) {
    assert.ok(ys[i] - ys[i - 1] < maxH * 0.9, `gap ${ys[i] - ys[i - 1]} terlalu jauh`);
  }
});

test('skor naik saat naik & kamera mengikuti', () => {
  const w = createWorld(8);
  const cam0 = w.cameraY;
  w.py = 2000; w.vy = 100;
  stepWorld(w, DT, idle);
  assert.ok(w.cameraY > cam0, 'kamera naik');
  assert.ok(w.score > 0, `skor=${w.score}`);
});

test('jatuh di bawah kamera -> over', () => {
  const w = createWorld(9);
  w.cameraY = 1000;
  w.py = 800; w.vy = -500;
  stepWorld(w, DT, idle);
  assert.ok(w.over, 'harus game over');
});

test('simulasi 20 detik: tak over instan & platform terus terisi', () => {
  const w = createWorld(42, 700);
  const maxH = maxJumpHeight();
  // auto-pilot: saat naik bidik platform di atas yg terdekat horizontal;
  // saat jatuh bidik platform di bawah yg terdekat.
  for (let i = 0; i < 1200; i += 1) {
    let target = w.px;
    let bestScore = Infinity;
    for (const p of w.platforms) {
      if (p.broken || p.kind === 'lapuk') continue;
      const dy = p.y - w.py;
      const cx = p.x + p.w / 2;
      if (w.vy >= 0 && dy > 10 && dy < maxH * 0.85) {
        const s = Math.abs(cx - w.px) + dy * 0.4;
        if (s < bestScore) { bestScore = s; target = cx; }
      } else if (w.vy < 0 && dy < -4 && dy > -maxH) {
        const s = Math.abs(cx - w.px) + Math.abs(dy) * 0.4;
        if (s < bestScore) { bestScore = s; target = cx; }
      }
    }
    const input = { left: target < w.px - 10, right: target > w.px + 10 };
    stepWorld(w, DT, input);
    if (w.over) break;
  }
  assert.ok(w.bounces > 5, `bounces=${w.bounces}`);
  assert.ok(w.score > 25, `skor autopilot=${w.score}, over=${w.over}`);
  const top = Math.max(...w.platforms.map((p) => p.y));
  assert.ok(top > w.cameraY + w.viewH, 'platform terisi di atas kamera');
});

test('deterministik: seed sama -> dunia sama', () => {
  const a = createWorld(123);
  const b = createWorld(123);
  assert.deepEqual(
    a.platforms.map((p) => [p.x, p.y, p.kind]),
    b.platforms.map((p) => [p.x, p.y, p.kind]),
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAILURES:', failures.join(', '));
  process.exit(1);
}
