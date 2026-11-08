/**
 * Ketapel Konstruksi — logic tests. Run: npx tsx src/game-space/games/ketapel-konstruksi/logic.test.ts
 * Semua deterministik (tanpa Math.random).
 *
 * Sistem v2: proyektil = kepala berhelm (4 warna, skill ketuk), target =
 * kepala Klien Revisi, damage berbasis momentum.
 */
import { strict as assert } from 'node:assert';
import {
  LEVELS, GROUND_Y, GRAV, DRAG_MAX,
  predict, launchVel, circleRectCollide, rectsOverlap,
  damageBlock, damageBlockAmount, impactDamage,
  createState, updateState, stepBall, ballShouldDie, toppleStep,
  allTargetsDead, allBerkasDead, remainingTargets, remainingBerkas,
  starFor, leftoverBonus, MAT_HP, HELMS,
  beginDrag, moveDrag, releaseDrag, activateSkill, skillBall, currentHead, explode,
  crackLevel, launchPowerFrac, launchPowerLabel,
  TARGET_W, TARGET_H, EXPLO_RADIUS, BOOST_FACTOR, SLAM_VY, MINI_R,
  type Ball, type Block, type KEvent, type KState,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}

const scoreRef = () => ({ v: 0 });
const ev = (): KEvent[] => [];

function mkBall(partial: Partial<Ball>): Ball {
  return {
    x: 300, y: 300, vx: 400, vy: -200, r: 23, color: 'putih', mini: false,
    dead: false, age: 0, slowT: 0, flightId: 1,
    skillUsed: false, boosted: false, slammed: false, spin: 0,
    ...partial,
  };
}

/** Tembak satu kepala dari state (jalur yang sama dengan input pemain). */
function shoot(s: KState, thetaDeg: number, frac: number, tapAt: number | null): void {
  const sling = s.level.sling;
  const th = (thetaDeg * Math.PI) / 180;
  const d = frac * DRAG_MAX;
  assert.equal(beginDrag(s, sling.x, sling.y), true, 'beginDrag');
  moveDrag(s, sling.x - Math.cos(th) * d, sling.y + Math.sin(th) * d);
  assert.equal(releaseDrag(s, []), true, 'releaseDrag');
  let t = 0;
  let tapped = false;
  const sr = { v: 0 };
  while ((s.phase === 'flying' || s.phase === 'settle') && t < 14) {
    updateState(s, 1 / 60);
    t += 1 / 60;
    if (tapAt !== null && !tapped && t >= tapAt) {
      activateSkill(s, [], sr);
      s.score += sr.v;
      sr.v = 0;
      tapped = true;
    }
  }
}

console.log('\n[1] predict — parabola konsisten dengan stepBall');
test('titik pertama bergerak searah kecepatan', () => {
  const pts = predict(100, 100, 300, -400);
  assert.ok(pts.length > 1);
  assert.ok(pts[0].x > 100);
  assert.ok(pts[0].y < 100);
});
test('berhenti di tanah & konsisten dengan integrasi manual', () => {
  const pts = predict(100, 600, 300, 100);
  assert.ok(pts[pts.length - 1].y >= GROUND_Y - 1);
  const dt = 1 / 22;
  const p2 = predict(150, 452, 500, -600, GRAV, 10, dt);
  let px = 150; let py = 452; let pvy = -600;
  for (let i = 0; i < 5; i += 1) { pvy += GRAV * dt; px += 500 * dt; py += pvy * dt; }
  assert.ok(Math.abs(p2[4].x - px) < 1e-9 && Math.abs(p2[4].y - py) < 1e-9);
});

console.log('\n[2] launchVel');
test('tarikan dijepit ke DRAG_MAX & arah berlawanan tarik', () => {
  const v = launchVel(150, 452, 150 - 500, 452);
  assert.ok(Math.hypot(v.vx, v.vy) <= DRAG_MAX * 7.4 + 1e-6);
  const v2 = launchVel(150, 452, 100, 500);
  assert.ok(v2.vx > 0 && v2.vy < 0);
  const v0 = launchVel(150, 452, 150, 452);
  assert.equal(v0.vx, 0); assert.equal(v0.vy, 0);
});

console.log('\n[3] circleRectCollide & rectsOverlap');
test('kena sisi, kena sudut, jauh tidak kena', () => {
  assert.equal(circleRectCollide(100, 100, 22, { x: 110, y: 90, w: 40, h: 40 }), true);
  assert.equal(circleRectCollide(100, 100, 20, { x: 112, y: 112, w: 40, h: 40 }), true);
  assert.equal(circleRectCollide(0, 0, 22, { x: 200, y: 200, w: 40, h: 40 }), false);
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), false);
});

console.log('\n[4] impactDamage & HP material');
test('ambang momentum: ringan 0, sedang 1, keras 2, sangat keras 3', () => {
  assert.equal(impactDamage(100, 1), 0);
  assert.equal(impactDamage(400, 1), 1);
  assert.equal(impactDamage(600, 1.6), 2);
  assert.equal(impactDamage(900, 1.6), 3);
  assert.equal(impactDamage(2000, 0.45), 2); // mini cepat tetap berbahaya
});
test('damageBlockAmount: kayu (HP2) pecah oleh dmg 2, beton (HP6) tidak oleh dmg 3', () => {
  const s = createState(0);
  const kayu = s.blocks.find((x) => x.mat === 'kayu')!;
  const sc = scoreRef();
  assert.equal(damageBlockAmount(kayu, 2, ev(), sc), true);
  assert.ok(sc.v > 0);
  const s6 = createState(5);
  const beton = s6.blocks.find((x) => x.mat === 'beton')!;
  assert.equal(beton.hp, MAT_HP.beton);
  assert.equal(damageBlockAmount(beton, 3, ev(), scoreRef()), false);
  assert.equal(beton.hp, 3);
  assert.equal(damageBlockAmount(beton, 3, ev(), scoreRef()), true);
});
test('damageBlock kompat: tepat 1 poin & blok mati no-op', () => {
  const s = createState(0);
  const kacaTarget = createState(1).blocks.find((x) => x.mat === 'kaca')!;
  assert.equal(damageBlock(kacaTarget, ev(), scoreRef()), true); // kaca HP1
  assert.equal(damageBlock(kacaTarget, ev(), scoreRef()), false);
});

console.log('\n[5] kepala berhelm: antrean, urutan perkenalan, luncur');
test('10 level: antrean kepala valid & perkenalan berurutan putih-merah-kuning-hijau', () => {
  assert.equal(LEVELS.length, 10);
  const introAt: Record<string, number> = {};
  LEVELS.forEach((l, i) => {
    assert.ok(l.queue.length > 0, `L${i + 1} queue`);
    assert.equal(l.balls, l.queue.length);
    assert.ok(l.targets.length > 0, `L${i + 1} ada target klien`);
    for (const c of l.queue) assert.ok(HELMS[c], `warna valid ${c}`);
    if (l.intro) introAt[l.intro] = i;
  });
  assert.equal(introAt.putih, 0);
  assert.equal(introAt.merah, 2);
  assert.equal(introAt.kuning, 4);
  assert.equal(introAt.hijau, 6);
});
test('releaseDrag membuat bola kepala sesuai antrean & mengurangi sisa', () => {
  const s = createState(2); // L3: putih, merah, ...
  assert.equal(currentHead(s), 'putih');
  assert.equal(beginDrag(s, s.level.sling.x, s.level.sling.y), true);
  moveDrag(s, s.level.sling.x - 100, s.level.sling.y + 50);
  assert.equal(releaseDrag(s, []), true);
  assert.equal(s.balls.length, 1);
  assert.equal(s.balls[0].color, 'putih');
  assert.equal(s.balls[0].r, HELMS.putih.radius);
  assert.equal(s.ballsLeft, s.level.queue.length - 1);
  assert.equal(s.phase, 'flying');
});
test('tarikan terlalu kecil batal, drag dari jauh ditolak', () => {
  const s = createState(0);
  assert.equal(beginDrag(s, s.level.sling.x + 400, s.level.sling.y), false);
  assert.equal(beginDrag(s, s.level.sling.x, s.level.sling.y), true);
  moveDrag(s, s.level.sling.x - 5, s.level.sling.y);
  assert.equal(releaseDrag(s, []), false);
  assert.equal(s.phase, 'aim');
  assert.equal(s.ballsLeft, s.level.queue.length);
});

console.log('\n[6] skill tiap warna helm');
test('PUTIH tumbuk: menghujam ke bawah, sekali pakai', () => {
  const s = createState(0);
  s.phase = 'flying';
  const b = mkBall({ color: 'putih', vx: 500, vy: -300 });
  s.balls = [b];
  const sr = scoreRef();
  assert.equal(activateSkill(s, [], sr), true);
  assert.ok(b.vy >= SLAM_VY - 1, `vy=${b.vy}`);
  assert.ok(Math.abs(b.vx) < 120, 'vx menyusut drastis');
  assert.equal(b.slammed, true);
  assert.equal(activateSkill(s, [], sr), false, 'skill hanya sekali');
});
test('MERAH ledak: bola hilang, blok dekat hancur, target dalam radius tumbang', () => {
  const s = createState(0);
  s.phase = 'flying';
  const target = s.targets[0];
  const b = mkBall({ color: 'merah', x: target.x + TARGET_W / 2, y: target.y - 60, vx: 100, vy: 0 });
  s.balls = [b];
  const events = ev(); const sr = scoreRef();
  assert.equal(activateSkill(s, events, sr), true);
  assert.equal(b.dead, true);
  assert.ok(events.some((e) => e.type === 'explode'));
  assert.equal(target.dead, true);
  assert.ok(sr.v >= 500, 'skor target masuk');
});
test('explode: falloff jarak — blok jauh di luar radius utuh', () => {
  const s = createState(0);
  const far = s.blocks[0];
  const sr = scoreRef();
  explode(s, far.x - EXPLO_RADIUS - 200, far.y, ev(), sr);
  assert.equal(far.dead, false);
  assert.equal(far.hp, MAT_HP[far.mat]);
});
test('KUNING boost: kecepatan x1.9 searah gerak & status boosted', () => {
  const s = createState(4);
  s.phase = 'flying';
  const b = mkBall({ color: 'kuning', vx: 300, vy: -120 });
  s.balls = [b];
  const before = Math.hypot(b.vx, b.vy);
  assert.equal(activateSkill(s, [], scoreRef()), true);
  const after = Math.hypot(b.vx, b.vy);
  assert.ok(Math.abs(after - before * BOOST_FACTOR) < 1e-6);
  assert.equal(b.boosted, true);
});
test('HIJAU belah: jadi 3 kepala, 2 mini menyebar, mini tanpa skill', () => {
  const s = createState(6);
  s.phase = 'flying';
  const b = mkBall({ color: 'hijau', vx: 500, vy: -260 });
  s.balls = [b];
  assert.equal(activateSkill(s, [], scoreRef()), true);
  assert.equal(s.balls.length, 3);
  const minis = s.balls.filter((x) => x.mini);
  assert.equal(minis.length, 2);
  assert.ok(minis.every((m) => m.r === MINI_R));
  const a0 = Math.atan2(b.vy, b.vx);
  const angs = minis.map((m) => Math.atan2(m.vy, m.vx)).sort((p, q) => p - q);
  assert.ok(angs[0] < a0 && angs[1] > a0, 'mini menyebar dua sisi');
  assert.equal(skillBall(s), null, 'tidak ada skill kedua');
});
test('skill tidak bisa dipakai saat fase aim', () => {
  const s = createState(0);
  assert.equal(activateSkill(s, [], scoreRef()), false);
});

console.log('\n[7] fisika blok & target');
test('struktur semua level stabil saat diam 4 detik (tidak bunuh diri)', () => {
  for (let li = 0; li < 10; li += 1) {
    const s = createState(li);
    s.phase = 'settle';
    s.settleT = 999;
    let bad = 0;
    for (let i = 0; i < 240; i += 1) {
      bad += updateState(s, 1 / 60).filter((e) => e.type === 'blockBreak' || e.type === 'targetDown').length;
    }
    assert.equal(bad, 0, `L${li + 1} ada ${bad} kejadian rusak saat diam`);
    assert.ok(s.targets.every((t) => !t.dead), `L${li + 1} target hidup semua`);
  }
});
test('blok melayang jatuh; mendarat keras merusak blok di bawahnya (rantai)', () => {
  const below: Block = {
    id: 1, mat: 'kayu', x: 400, y: GROUND_Y - 40, w: 80, h: 40, hp: MAT_HP.kayu,
    mass: 1, vx: 0, vy: 0, angle: 0, va: 0, dead: false, grounded: true, lastHitAt: {},
  };
  const faller: Block = {
    id: 2, mat: 'beton', x: 410, y: GROUND_Y - 40 - 84 - 260, w: 60, h: 84, hp: MAT_HP.beton,
    mass: 3.5, vx: 0, vy: 0, angle: 0, va: 0, dead: false, grounded: false, lastHitAt: {},
  };
  const sc = scoreRef();
  for (let i = 0; i < 240 && !below.dead && below.hp === MAT_HP.kayu; i += 1) {
    toppleStep([below, faller], 1 / 60, ev(), sc);
  }
  assert.ok(below.hp < MAT_HP.kayu, `blok bawah rusak tertimpa (hp=${below.hp})`);
});
test('target jatuh dari ketinggian mati, jatuh pendek selamat', () => {
  const tall = createState(0);
  const t1 = tall.targets[0];
  t1.x = 60; // pindah ke udara terbuka di atas tanah (bukan di atas struktur)
  t1.y = GROUND_Y - TARGET_H - 200; // diangkat 200px di udara
  t1.grounded = false;
  tall.phase = 'settle'; tall.settleT = 999;
  for (let i = 0; i < 180 && !t1.dead; i += 1) updateState(tall, 1 / 60);
  assert.equal(t1.dead, true, 'jatuh 200px harus tumbang');

  const low = createState(0);
  const t2 = low.targets[0];
  t2.x = 60;
  t2.y = GROUND_Y - TARGET_H - 40;
  t2.grounded = false;
  low.phase = 'settle'; low.settleT = 999;
  for (let i = 0; i < 180; i += 1) updateState(low, 1 / 60);
  assert.equal(t2.dead, false, 'jatuh 40px harus selamat');
  assert.equal(t2.grounded, true);
});
test('target tertimpa blok jatuh mati tertimpa', () => {
  const s = createState(0);
  const t = s.targets[0];
  t.x = 500; t.y = GROUND_Y - TARGET_H; t.grounded = true;
  const crusher: Block = {
    id: 777, mat: 'beton', x: 495, y: GROUND_Y - TARGET_H - 90 - 200, w: 50, h: 90, hp: MAT_HP.beton,
    mass: 3, vx: 0, vy: 0, angle: 0, va: 0, dead: false, grounded: false, lastHitAt: {},
  };
  s.blocks.push(crusher);
  s.phase = 'settle'; s.settleT = 999;
  let cause = '';
  for (let i = 0; i < 240 && !t.dead; i += 1) {
    for (const e of updateState(s, 1 / 60)) if (e.type === 'targetDown') cause = e.cause;
  }
  assert.equal(t.dead, true);
  assert.equal(cause, 'tertimpa');
});
test('bola mati: keluar layar / lambat berkepanjangan / terlalu tua', () => {
  assert.equal(ballShouldDie(mkBall({ x: 2000 })), true);
  assert.equal(ballShouldDie(mkBall({ age: 8 })), true);
  assert.equal(ballShouldDie(mkBall({ slowT: 0.6, age: 2 })), true);
  assert.equal(ballShouldDie(mkBall({ age: 0.5 })), false);
});
test('stepBall menerapkan gravitasi & spin', () => {
  const b = mkBall({ vx: 230, vy: 0, r: 23 });
  stepBall(b, 0.1);
  assert.ok(Math.abs(b.vy - GRAV * 0.1) < 1e-9);
  assert.ok(b.spin > 0);
});

console.log('\n[8] aliran state: menang/kalah & bintang');
test('menang: semua target tumbang -> done/won=true', () => {
  const s = createState(0);
  for (const t of s.targets) { t.dead = true; }
  assert.equal(allTargetsDead(s.targets), true);
  s.phase = 'settle'; s.settleT = 0.01;
  updateState(s, 0.05);
  assert.equal(s.phase, 'done');
  assert.equal(s.won, true);
});
test('kalah: antrean habis & target tersisa -> done/won=false', () => {
  const s = createState(0);
  s.nextIdx = s.level.queue.length;
  s.ballsLeft = 0;
  s.phase = 'settle'; s.settleT = 0.01;
  updateState(s, 0.05);
  assert.equal(s.phase, 'done');
  assert.equal(s.won, false);
});
test('starFor & leftoverBonus', () => {
  assert.equal(starFor(2, 4), 3);
  assert.equal(starFor(3, 4), 2);
  assert.equal(starFor(4, 4), 1);
  assert.equal(leftoverBonus(0), 0);
  assert.equal(leftoverBonus(3), 750);
});
test('kompat berkas: remainingBerkas/allBerkasDead atas blok material berkas', () => {
  const blocks = [
    { mat: 'berkas' as const, dead: false }, { mat: 'berkas' as const, dead: true },
  ] as unknown as Block[];
  assert.equal(remainingBerkas(blocks), 1);
  assert.equal(allBerkasDead(blocks), false);
  assert.equal(remainingTargets([{ dead: false }, { dead: true }]), 1);
});

console.log('\n[9] SOLVABILITY — replay garis solusi deterministik (jalur input pemain)');
/** Garis tembakan hasil solver rakus atas logic ini: [sudut°, daya, detik ketuk skill]. */
const SOLUTIONS: Record<number, Array<[number, number, number | null]>> = {
  0: [[14, 0.67, null]],
  1: [[14, 0.736, null]],
  2: [[42, 0.934, null]],
  3: [[30, 0.934, 0.85], [14, 0.34, 0.85]],
  4: [[30, 0.934, 0.3]],
  5: [[38, 0.802, 0.55]],
  6: [[14, 0.868, 0.3]],
  7: [[54, 0.802, 0.55]],
  8: [[34, 1, 0.3], [14, 0.736, 0.85]],
  9: [[38, 1, 0.85]],
};
for (let li = 0; li < 10; li += 1) {
  test(`L${li + 1} (${LEVELS[li].name}) bisa diselesaikan`, () => {
    const s = createState(li);
    for (const [theta, frac, tap] of SOLUTIONS[li]) {
      if (s.phase === 'done') break;
      shoot(s, theta, frac, tap);
    }
    assert.equal(s.won, true, `fase=${s.phase} sisa target=${remainingTargets(s.targets)}`);
    assert.ok(s.score > 0);
  });
}

console.log('\n[10] retak & meteran daya');
test('crackLevel mengikuti rasio HP', () => {
  assert.equal(crackLevel('beton', MAT_HP.beton), 0);
  assert.equal(crackLevel('beton', 5), 1);
  assert.equal(crackLevel('beton', 3), 2);
  assert.equal(crackLevel('bata', 3), 1);
  assert.equal(crackLevel('bata', 2), 2);
  assert.equal(crackLevel('kayu', 1), 2);
  assert.equal(crackLevel('kaca', 1), 0);
});
test('launchPowerFrac & label', () => {
  assert.equal(launchPowerFrac(0), 0);
  assert.equal(launchPowerFrac(DRAG_MAX), 1);
  assert.equal(launchPowerFrac(DRAG_MAX * 3), 1);
  assert.equal(launchPowerLabel(0.1), 'LEMAH');
  assert.equal(launchPowerLabel(0.5), 'SEDANG');
  assert.equal(launchPowerLabel(0.8), 'KUAT');
  assert.equal(launchPowerLabel(1), 'MAKSIMUM');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
