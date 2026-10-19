/**
 * ArcadePingPong ("Tenis Sendok Semen") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/ping-pong/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  VW, VH, PADDLE_W, PADDLE_H, PLAYER_X, AI_X, WIN_SCORE, AI_MAX_SPEED,
  newMatch, placeServe, serve, step, aiMove, predictY,
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

console.log('\n[1] newMatch & serve');
test('match baru: skor 0, serve pemain', () => {
  const s = newMatch();
  assert.equal(s.p, 0);
  assert.equal(s.a, 0);
  assert.equal(s.serving, 'p');
  assert.equal(s.over, false);
});
test('placeServe menaruh bola di sisi penyaji', () => {
  let s = placeServe(newMatch(), 'p');
  assert.ok(Math.abs(s.ball.x - (PLAYER_X + PADDLE_W + 12)) < 1e-9);
  s = placeServe(newMatch(), 'a');
  assert.ok(Math.abs(s.ball.x - (AI_X - 12)) < 1e-9);
});
test('serve meluncurkan bola ke arah lawan', () => {
  let s = serve(placeServe(newMatch(), 'p'));
  assert.equal(s.serving, null);
  assert.ok(s.ball.vx > 0);
  s = serve(placeServe(newMatch(), 'a'));
  assert.ok(s.ball.vx < 0);
});

console.log('\n[2] step — pantulan & gol');
test('pantulan dinding atas', () => {
  let s = serve(placeServe(newMatch(), 'p'));
  s = { ...s, ball: { x: VW / 2, y: 4, vx: 100, vy: -200 } };
  const r = step(s, VH / 2, VH / 2, 0.016);
  assert.ok(r.state.ball.vy > 0);
  assert.ok(r.events.includes('wall'));
});
test('bet pemain memantulkan bola', () => {
  let s = serve(placeServe(newMatch(), 'p'));
  s = { ...s, pY: VH / 2, ball: { x: PLAYER_X + PADDLE_W + 4, y: VH / 2, vx: -300, vy: 0 } };
  const r = step(s, VH / 2, VH / 2, 0.016);
  assert.ok(r.events.includes('pHit'));
  assert.ok(r.state.ball.vx > 0);
});
test('gol ke gawang pemain -> poin AI', () => {
  let s = serve(placeServe(newMatch(), 'p'));
  s = { ...s, ball: { x: -25, y: VH / 2, vx: -400, vy: 0 } };
  const r = step(s, VH / 2, VH / 2, 0.016);
  assert.ok(r.events.includes('aScore'));
  assert.equal(r.state.a, 1);
  assert.equal(r.state.serving, 'a');
});
test('skor 7 -> match selesai', () => {
  let s = serve(placeServe(newMatch(), 'p'));
  s = { ...s, p: WIN_SCORE - 1, ball: { x: VW + 25, y: VH / 2, vx: 400, vy: 0 } };
  const r = step(s, VH / 2, VH / 2, 0.016);
  assert.equal(r.state.p, WIN_SCORE);
  assert.equal(r.state.over, true);
  assert.equal(r.state.winner, 'p');
});

console.log('\n[3] predictY & aiMove (AI adil)');
test('predictY lurus tanpa pantulan', () => {
  const y = predictY({ x: 100, y: 200, vx: 200, vy: 0 }, 500);
  assert.ok(Math.abs(y - 200) < 1e-9);
});
test('predictY memantulkan prediksi dalam [0, VH]', () => {
  const y = predictY({ x: 100, y: 100, vx: 200, vy: 500 }, 900);
  assert.ok(y >= 0 && y <= VH);
});
test('AI dibatasi kecepatannya', () => {
  let s = serve(placeServe(newMatch(), 'p'));
  s = { ...s, aY: VH / 2, ball: { x: VW / 2, y: 40, vx: 500, vy: 0 } };
  const y1 = aiMove(s, 1, { err: 0 });
  assert.ok(Math.abs(y1 - VH / 2) <= AI_MAX_SPEED);
});
test('AI siaga di tengah saat bola menjauh', () => {
  let s = serve(placeServe(newMatch(), 'p'));
  s = { ...s, aY: VH / 2, ball: { x: VW / 2, y: VH / 2, vx: -500, vy: 0 } };
  const y = aiMove(s, 0.016, { err: 0 });
  assert.ok(Math.abs(y - VH / 2) < AI_MAX_SPEED * 0.016 + 50);
});
test('konstanta: AI lebih lambat dari bola', () => {
  assert.ok(AI_MAX_SPEED < 760);
  assert.equal(WIN_SCORE, 7);
  assert.ok(PADDLE_H > 0 && PLAYER_X < AI_X);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
