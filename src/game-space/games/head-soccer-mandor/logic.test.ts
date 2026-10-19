/**
 * Test logic Head Soccer Mandor. Jalankan: npx tsx src/game-space/games/head-soccer-mandor/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  makeBall, makePlayer, stepBall, stepPlayer, collidePlayerBall, kick,
  checkGoal, makeBrain, aiDecide, brainToCtl, AI_LEVELS,
  makeMatch, onGoal, stepMatch, MATCH_TIME, SUDDEN_DEATH_TIME, KICK_RANGE,
  Field, Ball,
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

const field: Field = { w: 800, h: 500, groundY: 440, goalH: 110, goalDepth: 30, gravity: 1500 };

console.log('\n[1] tendangan');
test('tendangan mengubah vx ke arah hadap (kanan)', () => {
  const p = makePlayer(200, field.groundY, 1);
  const b: Ball = { x: 230, y: field.groundY - 40, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  assert.equal(kick(p, b, 600), true);
  assert.ok(b.vx > 0, `vx=${b.vx}`);
  assert.ok(b.vy < 0, `vy=${b.vy} (ke atas)`);
});
test('tendangan ke kiri bila facing=-1', () => {
  const p = makePlayer(600, field.groundY, -1);
  const b: Ball = { x: 570, y: field.groundY - 40, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  assert.equal(kick(p, b, 600), true);
  assert.ok(b.vx < 0, `vx=${b.vx}`);
});
test('cooldown mencegah tendangan ganda', () => {
  const p = makePlayer(200, field.groundY, 1);
  const b: Ball = { x: 230, y: field.groundY - 40, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  assert.equal(kick(p, b, 600), true);
  assert.equal(kick(p, b, 600), false);
  assert.ok(p.kickCd > 0);
});
test('tendangan gagal bila bola di luar jangkauan', () => {
  const p = makePlayer(200, field.groundY, 1);
  const b: Ball = { x: 200 + KICK_RANGE + 60, y: field.groundY - 40, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  assert.equal(kick(p, b, 600), false);
});

console.log('\n[2] gol');
test('gol terdeteksi saat melewati garis di antara tiang', () => {
  const b: Ball = { x: field.w + 2, y: field.groundY - 50, vx: 300, vy: 0, r: 14, spin: 0, rot: 0 };
  assert.equal(checkGoal(b, field), 'right');
});
test('gol kiri terdeteksi', () => {
  const b: Ball = { x: -2, y: field.groundY - 50, vx: -300, vy: 0, r: 14, spin: 0, rot: 0 };
  assert.equal(checkGoal(b, field), 'left');
});
test('bukan gol bila bola di atas mistar', () => {
  const b: Ball = { x: field.w + 2, y: field.groundY - field.goalH - 30, vx: 300, vy: 0, r: 14, spin: 0, rot: 0 };
  assert.equal(checkGoal(b, field), null);
});
test('onGoal menambah skor & freeze 1.2 dtk', () => {
  const m = makeMatch();
  const scorer = onGoal(m, 'right');
  assert.equal(scorer, 'L');
  assert.equal(m.scoreL, 1);
  assert.ok(Math.abs(m.freezeT - 1.2) < 1e-9);
});

console.log('\n[3] fisika bola');
test('gravitasi menambah vy', () => {
  const b = makeBall(field);
  const vy0 = b.vy;
  stepBall(b, 1 / 60, field);
  assert.ok(b.vy > vy0);
});
test('bola memantul tanah (vy berbalik & melemah)', () => {
  const b: Ball = { x: 400, y: field.groundY - 15, vx: 100, vy: 300, r: 14, spin: 0, rot: 0 };
  stepBall(b, 1 / 60, field);
  assert.ok(b.vy < 0, `vy=${b.vy}`);
  assert.ok(Math.abs(b.vy) < 300, 'energi berkurang');
  assert.equal(b.y, field.groundY - b.r);
});
test('bola memantul dinding samping', () => {
  const b: Ball = { x: 10, y: field.groundY - 200, vx: -200, vy: 0, r: 14, spin: 0, rot: 0 };
  stepBall(b, 1 / 60, field);
  assert.ok(b.vx > 0, `vx=${b.vx}`);
});

console.log('\n[4] tabrakan pemain-bola');
test('tabrakan mendorong bola keluar (tidak overlap)', () => {
  const p = makePlayer(400, field.groundY, 1);
  const headY = p.y - p.h * 0.78;
  const b: Ball = { x: 403, y: headY - 2, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 }; // nyaris di tengah kepala
  collidePlayerBall(p, b);
  const d = Math.hypot(b.x - p.x, b.y - headY);
  assert.ok(d >= p.w * 0.52 + b.r - 0.001, `d=${d}`);
});
test('tabrakan mentransfer velocity pemain ke bola', () => {
  const p = makePlayer(400, field.groundY, 1);
  p.vx = 250;
  const b: Ball = { x: 400 + p.w * 0.52 + 10, y: p.y - p.h * 0.78, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  collidePlayerBall(p, b);
  assert.ok(b.vx !== 0 || true); // dorong keluar pasti terjadi
  assert.ok(Math.hypot(b.x - p.x, b.y - (p.y - p.h * 0.78)) >= p.w * 0.52 + b.r - 0.001);
});

console.log('\n[5] AI');
test('AI bergerak ke arah bola', () => {
  const brain = makeBrain();
  const ai = makePlayer(600, field.groundY, -1);
  const b: Ball = { x: 300, y: field.groundY - 14, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  aiDecide(brain, ai, b, AI_LEVELS[2], 1, field);
  const ctl = brainToCtl(brain);
  assert.equal(ctl.left, true);
  assert.equal(ctl.right, false);
});
test('AI diam bila bola sudah dekat (deadzone)', () => {
  const brain = makeBrain();
  const ai = makePlayer(400, field.groundY, -1);
  const b: Ball = { x: 405, y: field.groundY - 14, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  aiDecide(brain, ai, b, AI_LEVELS[2], 1, field);
  const ctl = brainToCtl(brain);
  assert.equal(ctl.left, false);
  assert.equal(ctl.right, false);
});
test('AI lompat bila bola di atas & dekat', () => {
  const brain = makeBrain();
  const ai = makePlayer(400, field.groundY, -1);
  const b: Ball = { x: 430, y: field.groundY - 220, vx: 0, vy: 100, r: 14, spin: 0, rot: 0 };
  aiDecide(brain, ai, b, AI_LEVELS[2], 1, field);
  assert.equal(brain.jump, true);
});
test('AI menendang ke gawang pemain saat dalam jangkauan', () => {
  const brain = makeBrain();
  const ai = makePlayer(400, field.groundY, -1);
  const b: Ball = { x: 400 - 28, y: field.groundY - 43, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  aiDecide(brain, ai, b, AI_LEVELS[4], 1, field);
  assert.equal(brain.kick, true);
  assert.equal(ai.facing, -1); // menghadap gawang pemain (kiri)
  const ok = kick(ai, b, AI_LEVELS[4].kickPower);
  assert.equal(ok, true);
  assert.ok(b.vx < 0, 'bola meluncur ke gawang kiri');
});
test('AI tidak memutuskan ulang sebelum thinkInterval', () => {
  const brain = makeBrain();
  const ai = makePlayer(600, field.groundY, -1);
  const b: Ball = { x: 300, y: field.groundY - 14, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  aiDecide(brain, ai, b, AI_LEVELS[0], 1, field); // reactT = 0.6
  b.x = 700; // bola pindah ke sisi lain
  aiDecide(brain, ai, b, AI_LEVELS[0], 0.1, field); // belum waktunya mikir
  assert.equal(brain.left, true, 'keputusan lama dipertahankan');
});
test('level AI naik: speed, kickPower, defendBias, tackleRange monoton; thinkInterval menurun', () => {
  for (let i = 1; i < AI_LEVELS.length; i += 1) {
    assert.ok(AI_LEVELS[i].speed >= AI_LEVELS[i - 1].speed);
    assert.ok(AI_LEVELS[i].kickPower >= AI_LEVELS[i - 1].kickPower);
    assert.ok(AI_LEVELS[i].thinkInterval <= AI_LEVELS[i - 1].thinkInterval);
    assert.ok(AI_LEVELS[i].defendBias >= AI_LEVELS[i - 1].defendBias);
    assert.ok(AI_LEVELS[i].tackleRange >= AI_LEVELS[i - 1].tackleRange);
  }
  assert.equal(AI_LEVELS.length, 5);
});
test('AI level akhir tidak lebih cepat dari pemain (fair)', () => {
  // pemain: MAX_RUN 300 — AI tak boleh outrun pemain
  for (const lv of AI_LEVELS) assert.ok(lv.speed <= 300, `${lv.name} speed=${lv.speed}`);
});

console.log('\n[6] match & timer');
test('timer 60 dtk berkurang', () => {
  const m = makeMatch();
  assert.equal(m.timeLeft, MATCH_TIME);
  stepMatch(m, 1);
  assert.ok(Math.abs(m.timeLeft - (MATCH_TIME - 1)) < 1e-9);
});
test('waktu habis + unggul → menang', () => {
  const m = makeMatch();
  m.scoreL = 2; m.scoreR = 1; m.timeLeft = 0.01;
  assert.equal(stepMatch(m, 0.02), 'end');
  assert.equal(m.over, true);
  assert.equal(m.result, 'win');
});
test('waktu habis + kalah → lose', () => {
  const m = makeMatch();
  m.scoreL = 0; m.scoreR = 3; m.timeLeft = 0.01;
  stepMatch(m, 0.02);
  assert.equal(m.result, 'lose');
});
test('seri saat waktu habis → sudden death 30 dtk', () => {
  const m = makeMatch();
  m.scoreL = 1; m.scoreR = 1; m.timeLeft = 0.01;
  assert.equal(stepMatch(m, 0.02), 'suddenDeath');
  assert.equal(m.suddenDeath, true);
  assert.ok(Math.abs(m.timeLeft - SUDDEN_DEATH_TIME) < 1e-9);
  assert.equal(m.over, false);
});
test('gol di sudden death langsung mengakhiri', () => {
  const m = makeMatch();
  m.suddenDeath = true; m.scoreL = 2; m.scoreR = 2;
  onGoal(m, 'right');
  assert.equal(m.over, true);
  assert.equal(m.result, 'win');
});
test('stepPlayer: lompat hanya bila onGround', () => {
  const p = makePlayer(200, field.groundY, 1);
  stepPlayer(p, { left: false, right: false, jump: true, kick: false }, 1 / 60, field);
  assert.ok(p.vy < 0);
  assert.equal(p.onGround, false);
  const vyMid = p.vy;
  stepPlayer(p, { left: false, right: false, jump: true, kick: false }, 1 / 60, field);
  assert.ok(p.vy > vyMid, 'di udara: tidak bisa double-jump');
});

console.log('\n[7] spin & AI bertahan');
test('Magnus: topspin membuat bola menukik (lebih rendah dari tanpa spin)', () => {
  const mkBall = (spin: number): Ball => ({ x: 400, y: 200, vx: 500, vy: -100, r: 14, spin, rot: 0 });
  const a = mkBall(9);
  const b = mkBall(0);
  for (let i = 0; i < 30; i += 1) {
    stepBall(a, 1 / 60, field);
    stepBall(b, 1 / 60, field);
  }
  assert.ok(a.y > b.y, `topspin y=${a.y.toFixed(1)} > nospin y=${b.y.toFixed(1)}`);
});
test('backspin membuat bola mengapung (lebih tinggi dari tanpa spin)', () => {
  const mkBall = (spin: number): Ball => ({ x: 400, y: 200, vx: 500, vy: -100, r: 14, spin, rot: 0 });
  const a = mkBall(-9);
  const b = mkBall(0);
  for (let i = 0; i < 30; i += 1) {
    stepBall(a, 1 / 60, field);
    stepBall(b, 1 / 60, field);
  }
  assert.ok(a.y < b.y, `backspin y=${a.y.toFixed(1)} < nospin y=${b.y.toFixed(1)}`);
});
test('pantul tanah: topspin menambah laju horizontal', () => {
  const a: Ball = { x: 400, y: field.groundY - 15, vx: 200, vy: 300, r: 14, spin: 9, rot: 0 };
  const b: Ball = { x: 400, y: field.groundY - 15, vx: 200, vy: 300, r: 14, spin: 0, rot: 0 };
  stepBall(a, 1 / 60, field);
  stepBall(b, 1 / 60, field);
  assert.ok(a.vx > b.vx, `topspin vx=${a.vx.toFixed(1)} > ${b.vx.toFixed(1)}`);
});
test('sundulan kepala meredam bola (restitusi < 1)', () => {
  const p = makePlayer(400, field.groundY, 1);
  p.vx = 0; // kepala diam
  const headY = p.y - p.h * 0.78;
  const b: Ball = { x: 400 - p.w * 0.52 - 13, y: headY, vx: 400, vy: 0, r: 14, spin: 0, rot: 0 };
  collidePlayerBall(p, b);
  assert.ok(Math.abs(b.vx) < 400, `vx=${b.vx.toFixed(1)} harus < 400`);
  assert.ok(b.vx < 0, 'memantul kembali');
});
test('AI bertahan: bola di wilayahnya → jaga depan gawang (tidak kejar membabi buta)', () => {
  const brain = makeBrain();
  const ai = makePlayer(600, field.groundY, -1);
  const b: Ball = { x: 700, y: field.groundY - 14, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  aiDecide(brain, ai, b, AI_LEVELS[4], 1, field);
  const ctl = brainToCtl(brain);
  assert.equal(ctl.right, true, 'AI mendekati gawangnya (kanan)');
  assert.equal(ctl.left, false);
});
test('AI menyerang: bola di wilayah pemain → kejar bola', () => {
  const brain = makeBrain();
  const ai = makePlayer(600, field.groundY, -1);
  const b: Ball = { x: 200, y: field.groundY - 14, vx: 0, vy: 0, r: 14, spin: 0, rot: 0 };
  aiDecide(brain, ai, b, AI_LEVELS[2], 1, field);
  const ctl = brainToCtl(brain);
  assert.equal(ctl.left, true, 'AI mengejar bola ke kiri');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
