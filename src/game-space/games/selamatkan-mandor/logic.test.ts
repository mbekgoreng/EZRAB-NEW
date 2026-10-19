/**
 * Selamatkan Mandor — logic tests. Run: npx tsx src/game-space/games/selamatkan-mandor/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createState, step, setLine, clearLine, inkLeft, lineLength, smoothLine,
  starsFor, resetState, LEVELS, KIND_R, foremanPos, WARN_LEAD,
  FAIR_START, HEAD_ZONE,
  type MandorState, type Vec,
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

const W = 390;
const H = 700;
const mk = (level = 0): MandorState => createState(level, W, H);
const stepN = (s: MandorState, n: number, dt = 1 / 60): void => {
  for (let i = 0; i < n; i += 1) step(s, dt);
};

console.log('\n[1] level data');
test('15 level terdefinisi', () => {
  assert.equal(LEVELS.length, 15);
});
test('setiap level punya spawn terurut & durasi valid', () => {
  for (const lv of LEVELS) {
    assert.ok(lv.duration > 0, lv.name);
    assert.ok(lv.spawns.length > 0, lv.name);
    assert.ok(lv.ink > 0, lv.name);
    for (let i = 1; i < lv.spawns.length; i += 1) {
      assert.ok(lv.spawns[i].at >= lv.spawns[i - 1].at, `${lv.name} spawn order`);
    }
    assert.ok(lv.spawns[lv.spawns.length - 1].at < lv.duration, `${lv.name} spawn < durasi`);
  }
});
test('mandor berdiri di atas tanah', () => {
  const s = mk();
  assert.ok(s.foreman.y + s.foreman.r <= s.groundY + 1);
  assert.equal(s.foreman.x, W / 2);
});

console.log('\n[2] fisika pantulan');
test('segmen horizontal memantulkan benda jatuh (vy berbalik)', () => {
  const s = mk();
  s.level = { ...s.level, spawns: [] };
  // garis horizontal di y=300, benda jatuh dari atas tepat di atasnya
  setLine(s, [{ x: 100, y: 300 }, { x: 290, y: 300 }]);
  s.bodies.push({
    x: 195, y: 200, vx: 0, vy: 300, r: KIND_R.bata,
    kind: 'bata', rot: 0, spin: 0, landed: false, landT: 0,
  });
  let sawThud = false;
  let vyAfter = 0;
  for (let i = 0; i < 60 && !sawThud; i += 1) {
    step(s, 1 / 60);
    if (s.thuds.length > 0) {
      sawThud = true;
      vyAfter = s.bodies[0].vy;
    }
  }
  assert.ok(sawThud, 'pantulan harus tercatat sebagai thud');
  assert.ok(vyAfter < 0, `vy=${vyAfter.toFixed(1)} harus berbalik ke atas`);
  assert.equal(s.status, 'play');
});
test('segmen miring membelokkan benda ke samping (vx ≠ 0)', () => {
  const s = mk();
  // garis miring turun ke kanan; benda jatuh vertikal di tengah
  setLine(s, [{ x: 95, y: 250 }, { x: 295, y: 350 }]);
  s.bodies.push({
    x: 195, y: 120, vx: 0, vy: 320, r: KIND_R.bata,
    kind: 'bata', rot: 0, spin: 0, landed: false, landT: 0,
  });
  stepN(s, 60);
  const b = s.bodies[0];
  assert.ok(Math.abs(b.vx) > 30, `vx=${b.vx.toFixed(1)} harus terbelokkan`);
  assert.ok(b.x < 195 - 10 || b.x > 195 + 10, 'posisi x bergeser');
});
test('tanpa garis, benda jatuh lurus & mendarat di tanah', () => {
  const s = mk();
  s.level = { ...s.level, spawns: [] };
  setLine(s, []);
  s.bodies.push({
    x: 100, y: 100, vx: 0, vy: 100, r: KIND_R.bata,
    kind: 'bata', rot: 0, spin: 0, landed: false, landT: 0,
  });
  let sawLanded = false;
  let landY = 0;
  let xDrift = 0;
  for (let i = 0; i < 300 && !sawLanded; i += 1) {
    step(s, 1 / 60);
    const b = s.bodies[0];
    if (b && b.landed) {
      sawLanded = true;
      landY = b.y + b.r;
      xDrift = Math.abs(b.x - 100);
    }
  }
  assert.ok(sawLanded, 'benda harus mendarat');
  assert.ok(Math.abs(landY - s.groundY) < 2, `landY=${landY} vs groundY=${s.groundY}`);
  assert.ok(xDrift < 2, 'jatuh lurus tanpa garis: x tidak bergeser');
  assert.equal(s.status, 'play');
});
test('benda menabrak mandor → dead', () => {
  const s = mk();
  const f = foremanPos(W, H);
  s.bodies.push({
    x: f.x, y: f.y - 120, vx: 0, vy: 300, r: KIND_R.bata,
    kind: 'bata', rot: 0, spin: 0, landed: false, landT: 0,
  });
  stepN(s, 60);
  assert.equal(s.status, 'dead');
  assert.ok(s.hits.length > 0);
});
test('garis pelindung di atas mandor menyelamatkan dari bata', () => {
  const s = mk();
  const f = foremanPos(W, H);
  // atap spidol tepat di atas mandor
  setLine(s, [
    { x: f.x - 90, y: f.y - 70 },
    { x: f.x, y: f.y - 100 },
    { x: f.x + 90, y: f.y - 70 },
  ]);
  s.bodies.push({
    x: f.x, y: 60, vx: 0, vy: 260, r: KIND_R.bata,
    kind: 'bata', rot: 0, spin: 0, landed: false, landT: 0,
  });
  stepN(s, 400);
  assert.equal(s.status, 'play', 'mandor harus selamat');
});

console.log('\n[3] ink meter');
test('lineLength menghitung total panjang', () => {
  const pts: Vec[] = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }];
  assert.equal(lineLength(pts), 15);
});
test('ink membatasi panjang garis (trim)', () => {
  const s = mk();
  const long: Vec[] = [];
  for (let x = 0; x <= 1000; x += 10) long.push({ x, y: 100 });
  setLine(s, long);
  assert.ok(s.inkUsed <= s.inkMax + 1e-6, `inkUsed=${s.inkUsed} > max=${s.inkMax}`);
  assert.ok(lineLength(s.line) <= s.inkMax + 1e-6);
  assert.ok(s.line.length < long.length, 'titik berlebih dipotong');
});
test('clearLine mengembalikan ink penuh', () => {
  const s = mk();
  setLine(s, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  assert.ok(s.inkUsed > 0);
  clearLine(s);
  assert.equal(s.inkUsed, 0);
  assert.equal(s.line.length, 0);
  assert.equal(inkLeft(s), s.inkMax);
});

console.log('\n[4] menang / kalah / bintang');
test('timer habis & mandor selamat → win', () => {
  const s = mk();
  s.level = { ...s.level, duration: 1, spawns: [] };
  stepN(s, 70);
  assert.equal(s.status, 'win');
});
test('setelah dead, step tidak mengubah status', () => {
  const s = mk();
  s.status = 'dead';
  step(s, 1);
  assert.equal(s.status, 'dead');
});
test('bintang 3 bila ink sisa ≥ 50%', () => {
  const s = mk();
  assert.equal(starsFor(s), 3);
});
test('bintang 1 bila ink hampir habis', () => {
  const s = mk();
  const long: Vec[] = [];
  for (let x = 0; x <= 1000; x += 5) long.push({ x, y: 100 });
  setLine(s, long);
  assert.ok(inkLeft(s) / s.inkMax < 0.22);
  assert.equal(starsFor(s), 1);
});
test('resetState mengulang level dari awal', () => {
  const s = mk();
  stepN(s, 120);
  s.status = 'dead';
  resetState(s);
  assert.equal(s.status, 'play');
  assert.equal(s.time, 0);
  assert.equal(s.bodies.length, 0);
  assert.equal(s.spawnIdx, 0);
});

console.log('\n[5] smoothing garis');
test('smoothLine menghaluskan zigzag: panjang menyusut, deviasi kecil', () => {
  // zigzag kasar di sekitar garis lurus y=100, amplitudo 12px
  const raw: Vec[] = [];
  for (let x = 0; x <= 200; x += 8) raw.push({ x, y: 100 + (x / 8 % 2 === 0 ? 12 : -12) });
  const sm = smoothLine(raw);
  assert.ok(lineLength(sm) < lineLength(raw), 'lebih pendek setelah smoothing');
  assert.ok(lineLength(sm) > 190, `tetap membentang: ${lineLength(sm).toFixed(1)}`);
  // titik ujung dipertahankan (niat user); interior harus halus
  for (let i = 1; i < sm.length - 1; i += 1) {
    assert.ok(Math.abs(sm[i].y - 100) < 8, `deviasi interior ${Math.abs(sm[i].y - 100).toFixed(1)} < 8px`);
  }
  // spacing seragam ~8px
  for (let i = 1; i < sm.length; i += 1) {
    const d = Math.hypot(sm[i].x - sm[i - 1].x, sm[i].y - sm[i - 1].y);
    assert.ok(d <= 9.5, `spacing ${d.toFixed(1)} <= 9.5`);
  }
});
test('garis hasil smoothing tetap jadi collider believable', () => {
  const s = mk();
  s.level = { ...s.level, spawns: [] };
  const raw: Vec[] = [];
  for (let x = 100; x <= 290; x += 7) raw.push({ x, y: 300 + ((x % 14 === 0) ? 10 : -10) });
  setLine(s, raw); // smoothing terjadi di dalam setLine
  assert.ok(s.line.length >= 3, 'garis tersimpan');
  s.bodies.push({
    x: 195, y: 180, vx: 0, vy: 320, r: KIND_R.bata,
    kind: 'bata', rot: 0, spin: 0, landed: false, landT: 0,
  });
  let sawThud = false;
  for (let i = 0; i < 90 && !sawThud; i += 1) {
    step(s, 1 / 60);
    if (s.thuds.length > 0) sawThud = true;
  }
  assert.ok(sawThud, 'benda memantul di garis yang dihaluskan');
  assert.equal(s.status, 'play');
});
test('smoothLine < 3 titik: kembalikan apa adanya', () => {
  assert.deepEqual(smoothLine([]), []);
  assert.deepEqual(smoothLine([{ x: 1, y: 2 }]), [{ x: 1, y: 2 }]);
});

console.log('\n[6] fairness & telegraph');
test('tidak ada spawn tepat di atas mandor di 2 detik pertama (15 level)', () => {
  for (let i = 0; i < LEVELS.length; i += 1) {
    for (const ev of LEVELS[i].spawns) {
      assert.ok(
        !(ev.at < FAIR_START && Math.abs(ev.xf - 0.5) < HEAD_ZONE),
        `L${i + 1} ${LEVELS[i].name}: at=${ev.at} xf=${ev.xf}`,
      );
    }
  }
});
test('pending: telegraph muncul WARN_LEAD detik sebelum spawn', () => {
  const s = mk();
  s.level = {
    ...s.level,
    spawns: [{ at: 2.0, xf: 0.3, kind: 'bata', vy0: 120 }],
  };
  step(s, 0.5); // t=0.5 → 1.5s sebelum spawn: belum pending
  assert.equal(s.pending.length, 0);
  step(s, 0.5); // t=1.0 → 1.0s sebelum spawn: pending
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].xf, 0.3);
  step(s, 1.1); // t=2.1 → sudah spawn: pending kosong
  assert.equal(s.pending.length, 0);
  assert.equal(s.bodies.length, 1);
});

console.log('\n[7] ink fairness: atap kanonis menang di semua level');
// Desain: solusi nyaman/lega (margin 90px) → sisa 25-42% (2 bintang);
// garis presisi & hemat → 3 bintang. Tidak pelit, tidak berlebihan.
test('15 level: solusi wajar menang & sisa tinta ≥ 25%', () => {
  for (let i = 0; i < LEVELS.length; i += 1) {
    const s = createState(i, W, H);
    const xfs = s.level.spawns.map((e) => e.xf);
    const minX = Math.max(12, Math.min(...xfs) * W - 90);
    const maxX = Math.min(W - 12, Math.max(...xfs) * W + 90);
    const fy = s.foreman.y;
    const pts: Vec[] = [];
    const N = 25;
    for (let k = 0; k < N; k += 1) {
      const t = k / (N - 1);
      pts.push({
        x: minX + (maxX - minX) * t,
        y: fy - 110 - 60 * (1 - Math.pow(2 * t - 1, 2)),
      });
    }
    setLine(s, pts);
    const maxSteps = Math.ceil((s.level.duration + 2) * 60);
    for (let k = 0; k < maxSteps && s.status === 'play'; k += 1) step(s, 1 / 60);
    const leftFrac = inkLeft(s) / s.inkMax;
    assert.equal(s.status, 'win', `L${i + 1} ${s.level.name}: status=${s.status}`);
    assert.ok(leftFrac >= 0.25, `L${i + 1}: sisa tinta ${(leftFrac * 100).toFixed(0)}% < 25%`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
