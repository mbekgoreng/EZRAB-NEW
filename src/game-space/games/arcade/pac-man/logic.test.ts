/**
 * Pak Mandor — logic tests. Run: npx tsx src/game-space/games/arcade/pac-man/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createGame, step, setInput, tileAt, MAP, COLS, ROWS,
  T_WALL, T_DOT, T_PELLET, T_EMPTY, T_HOUSE, T_DOOR,
  UP, DOWN, LEFT, RIGHT,
  type GameState,
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

/** Maju n langkah. */
function run(st: GameState, n: number, dt = DT): void {
  for (let i = 0; i < n; i += 1) step(st, dt);
}

test('peta: semua baris 19 kolom & 17 baris', () => {
  assert.equal(MAP.length, ROWS);
  for (const row of MAP) assert.equal(row.length, COLS, row);
});

test('peta: semua helm terjangkau dari start (flood fill)', () => {
  const st = createGame(1);
  const seen = new Set<number>();
  const q: [number, number][] = [[Math.round(st.player.x), Math.round(st.player.y)]];
  const walk = (x: number, y: number): boolean => {
    const t = tileAt(st.grid, x, y);
    return t !== T_WALL && t !== T_HOUSE && t !== T_DOOR;
  };
  while (q.length > 0) {
    const [x, y] = q.pop()!;
    const k = y * COLS + x;
    if (seen.has(k) || !walk(x, y)) continue;
    seen.add(k);
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  let unreachable = 0;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const t = tileAt(st.grid, x, y);
      if ((t === T_DOT || t === T_PELLET) && !seen.has(y * COLS + x)) unreachable += 1;
    }
  }
  assert.equal(unreachable, 0, `${unreachable} helm tak terjangkau`);
  assert.ok(st.dotsLeft > 150, `dots=${st.dotsLeft}`);
});

test('pemain bergerak & memakan helm (+10)', () => {
  const st = createGame(2);
  const dots0 = st.dotsLeft;
  const score0 = st.score;
  setInput(st, LEFT);
  run(st, 120);
  assert.ok(st.dotsLeft < dots0, `dots ${dots0} -> ${st.dotsLeft}`);
  assert.ok(st.score > score0, `skor ${score0} -> ${st.score}`);
});

test('dinding menghentikan pemain', () => {
  const st = createGame(3);
  // hadapkan ke dinding: dari start (9,12), ke kiri mentok di x=6 (dinding x=5)
  setInput(st, LEFT);
  run(st, 600);
  const x = st.player.x;
  assert.ok(x >= 5.9 && x <= 6.1, `pemain harus berhenti di x=6, x=${x}`);
  assert.ok(st.player.dir.x === 0 && st.player.dir.y === 0, 'dir harus STOP');
});

test('kopi tubruk -> klien setuju (frightT)', () => {
  const st = createGame(4);
  // teleport pemain ke dekat pellet kiri-atas (1,2): mulai dari (1,1)
  st.player.x = 1; st.player.y = 1; st.player.tx = 1; st.player.ty = 1;
  st.player.dir = { x: 0, y: 0 }; st.player.queued = { x: 0, y: 1 };
  run(st, 120);
  assert.ok(st.frightT > 0, `frightT=${st.frightT}`);
  assert.ok(st.score >= 50, `skor=${st.score}`);
});

test('hantu ketakutan dimakan -> +200 & jadi mata', () => {
  const st = createGame(5);
  st.frightT = 5;
  const g = st.ghosts[0];
  g.state = 'active';
  g.x = st.player.x; g.y = st.player.y; g.tx = g.x; g.ty = g.y;
  g.dir = { x: 0, y: 0 };
  const s0 = st.score;
  step(st, DT);
  assert.equal(g.state, 'eaten', `state=${g.state}`);
  assert.equal(st.score, s0 + 200);
});

test('hantu normal menabrak -> nyawa -1 & posisi reset', () => {
  const st = createGame(6);
  const g = st.ghosts[0];
  g.state = 'active';
  g.exitT = 99;
  g.x = st.player.x; g.y = st.player.y; g.tx = g.x; g.ty = g.y;
  g.dir = { x: 0, y: 0 };
  const lives0 = st.lives;
  step(st, DT);
  assert.equal(st.lives, lives0 - 1);
  assert.equal(st.ghosts[0].state, 'house', 'hantu kembali ke rumah');
});

test('nyawa habis -> over', () => {
  const st = createGame(7);
  st.lives = 1;
  const g = st.ghosts[0];
  g.state = 'active';
  g.x = st.player.x; g.y = st.player.y; g.tx = g.x; g.ty = g.y;
  g.dir = { x: 0, y: 0 };
  step(st, DT);
  assert.ok(st.over, 'harus game over');
});

test('semua helm habis -> level clear -> level 2', () => {
  const st = createGame(8);
  st.dotsLeft = 1;
  // taruh 1 dot di depan pemain
  const px = Math.round(st.player.x);
  const py = Math.round(st.player.y);
  st.grid[py * COLS + px - 1] = T_DOT;
  setInput(st, LEFT);
  run(st, 120);
  assert.ok(st.levelClear, 'harus levelClear');
  run(st, 200);
  assert.equal(st.level, 2, `level=${st.level}`);
  assert.ok(st.dotsLeft > 100, 'helm diisi ulang');
});

test('hantu tak pernah masuk dinding (simulasi 30 dtk)', () => {
  const st = createGame(9);
  const dirs = [UP, DOWN, LEFT, RIGHT];
  for (let i = 0; i < 1800; i += 1) {
    if (i % 90 === 0) setInput(st, dirs[(i / 90) % 4 | 0]);
    step(st, DT);
    if (st.over) break;
    for (const g of st.ghosts) {
      if (g.state === 'house' || g.state === 'exit') continue;
      const t = tileAt(st.grid, Math.round(g.x), Math.round(g.y));
      assert.ok(t !== T_WALL, `hantu ${g.kind} di dinding (${g.x.toFixed(2)},${g.y.toFixed(2)})`);
    }
  }
});

test('pemain tak bisa masuk rumah hantu', () => {
  const st = createGame(10);
  // bekukan hantu di rumah agar tak menabrak pemain idle
  for (const g of st.ghosts) { g.state = 'house'; g.exitT = 9999; }
  // paksa pemain ke depan pintu (9,5) lalu ke bawah
  st.player.x = 9; st.player.y = 5; st.player.tx = 9; st.player.ty = 5;
  st.player.dir = { x: 0, y: 0 }; st.player.queued = { x: 0, y: 1 };
  run(st, 120);
  const t = tileAt(st.grid, Math.round(st.player.x), Math.round(st.player.y));
  assert.ok(t !== T_HOUSE && t !== T_DOOR, `pemain di tile rumah! t=${t}`);
  assert.ok(st.player.y < 6.5, `pemain menembus pintu? y=${st.player.y}`);
});

test('balik arah mid-tile langsung berbalik', () => {
  const st = createGame(11);
  setInput(st, RIGHT);
  run(st, 20); // bergerak ke kanan
  const x0 = st.player.x;
  assert.ok(st.player.dir.x === 1, 'harus ke kanan');
  setInput(st, LEFT); // balik
  assert.ok(st.player.dir.x === -1, 'harus langsung balik');
  run(st, 10);
  assert.ok(st.player.x < x0, 'posisi harus berkurang');
});

test('deterministik: seed sama -> skor sama (tanpa input acak)', () => {
  const runSeed = (seed: number): number => {
    const st = createGame(seed);
    setInput(st, LEFT);
    run(st, 300);
    return st.score;
  };
  assert.equal(runSeed(77), runSeed(77));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAILURES:', failures.join(', '));
  process.exit(1);
}
