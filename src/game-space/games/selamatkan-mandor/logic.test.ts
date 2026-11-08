/**
 * Selamatkan Mandor — logic tests. Run: npx tsx src/game-space/games/selamatkan-mandor/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createState, step, setLine, clearLine, inkLeft, lineLength, smoothLine,
  starsFor, resetState, LEVELS, KIND_R, foremanPos, WARN_LEAD,
  FAIR_START, HEAD_ZONE, segGeom,
  type Body, type MandorState, type Vec,
} from './logic';
import { solveReference, solveNaive, REFERENCE_SOLUTIONS } from './solver';

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
  // Diperbarui (restrukturisasi): langkah terakhir dulu 1.1s sekaligus.
  // Mesin lama menelan seluruh jatuh 640px dalam SATU langkah itu dan
  // "mendaratkan" benda secara instan — artefak langkah raksasa, bukan
  // perilaku bermain nyata (loop UI melangkah 1/60s). Kini dipecah halus:
  stepN(s, 66); // t≈2.1 → sudah spawn: pending kosong, benda sedang jatuh
  assert.equal(s.pending.length, 0);
  assert.equal(s.bodies.length, 1);
  assert.equal(s.bodies[0].landed, false);
});

console.log('\n[7] ink fairness: atap kanonis menang di semua level');
// Desain: solusi nyaman/lega (margin 90px) → sisa 25-42% (2 bintang);
// garis presisi & hemat → 3 bintang. Tidak pelit, tidak berlebihan.
test('15 level: payung tunggal wajar menang KHUSUS level klasik; level fitur baru butuh struktur', () => {
  // Diperbarui untuk restrukturisasi: tes lama menuntut SATU payung lebar
  // menang di SEMUA level — itu persis gameplay "sketch payung" yang
  // dikeluhkan owner. Kini: payung lebar tetap sah untuk level klasik
  // (1–5, hujan vertikal), sedangkan level dengan mekanik baru (samping,
  // sakelar, dua orang, perancah runtuh) dibuktikan di suite solver:
  // solusi terstruktur menang, payung naif GAGAL (lihat [9]–[10]).
  const CLASSIC = 5;
  for (let i = 0; i < CLASSIC; i += 1) {
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

console.log('\n[8] mekanik baru: beam, patah, perancah, angin, samping');
const fullBody = (partial: Partial<Body>): Body => ({
  x: 0, y: 0, vx: 0, vy: 0, r: KIND_R.bata, kind: 'bata', rot: 0, spin: 0,
  landed: false, landT: 0, origin: 'top', drift: 0, fragile: false, puing: false,
  ...partial,
});
test('bentang datar panjang TANPA tumpuan tengah patah di bawah ember diam', () => {
  const s = mk();
  s.level = { ...s.level, spawns: [], gravity: 1500 };
  // payung datar 260px mengambang (kedua ujung jauh dari zona jangkar manapun)
  setLine(s, [{ x: 20, y: 350 }, { x: 150, y: 350 }, { x: 280, y: 350 }]);
  assert.ok(s.segs.length >= 4, 'beberapa segmen');
  assert.ok(s.segs.every((g) => !g.supported), 'semua segmen bebas (mengambang)');
  // ember diam tepat di tengah bentang
  const g0 = segGeom(s.segs[2]);
  s.bodies.push(fullBody({
    x: (g0.a.x + g0.b.x) / 2, y: (g0.a.y + g0.b.y) / 2 - KIND_R.ember - 1,
    kind: 'ember', r: KIND_R.ember, fragile: true,
  }));
  let snapped = false;
  for (let k = 0; k < 60 * 6 && s.status === 'play'; k += 1) {
    step(s, 1 / 60);
    if (s.breaks.length > 0) snapped = true;
  }
  assert.ok(snapped, 'bentang bebas harus patah di bawah beban ember');
  assert.ok(s.debris.length > 0 || s.segs.length < 6, 'ada puing/segmen hilang');
});
test('bentang yang sama DENGAN tumpuan (ujung menapak platform) tidak patah', () => {
  const s = createState(4, W, H); // L5: platform kokoh di xf 0.30
  s.level = { ...s.level, spawns: [] };
  const pl = s.platforms[0];
  // garis berujung tepat di atas platform & zona mandor
  setLine(s, [
    { x: pl.x, y: pl.y }, { x: 160, y: 480 }, { x: 195, y: 500 }, { x: 230, y: 520 },
  ]);
  assert.ok(s.segs.some((g) => g.supported), 'ada segmen tertumpu');
  s.bodies.push(fullBody({
    x: 170, y: 480 - KIND_R.ember - 1, kind: 'ember', r: KIND_R.ember, fragile: true,
  }));
  for (let k = 0; k < 60 * 5 && s.status === 'play'; k += 1) step(s, 1 / 60);
  assert.equal(s.breaks.length, 0, 'tidak boleh patah');
  assert.equal(s.status, 'play');
});
test('perancah runtuh: kontak terus-menerus membuatnya hilang & benda jatuh lagi', () => {
  const s = createState(6, W, H); // L7: perancah tengah crumble 2.6s
  s.level = { ...s.level, spawns: [], duration: 3.4 };
  const pl = s.platforms[0];
  assert.ok(pl.def.crumble);
  s.bodies.push(fullBody({ x: pl.x, y: pl.y - KIND_R.bata, kind: 'bata' }));
  let crumbled = false;
  for (let k = 0; k < 60 * 6 && s.status === 'play'; k += 1) {
    step(s, 1 / 60);
    if (s.crumbles.length > 0) crumbled = true;
  }
  assert.ok(crumbled, 'perancah harus runtuh');
  assert.ok(pl.gone, 'platform hilang');
  // benda yang menumpang ikut jatuh lagi setelah perancah hilang (tidak
  // lagi landed di dek) — dan karena perancah L7 berdiri tepat di atas
  // mandor, jatuhnya memang mematikan: itulah bahaya mekanik ini.
  assert.equal(s.status, 'dead');
  assert.equal(s.deathCause, 'mandor');
});
test('angin: pipa ringan melayang menyamping, bata tidak', () => {
  const s = createState(3, W, H); // L4 angin
  s.level = { ...s.level, spawns: [] };
  assert.ok(s.wind > 0);
  const pipa = fullBody({ x: 150, y: 100, vy: 60, kind: 'pipa', r: KIND_R.pipa, drift: 0.35 });
  const bata = fullBody({ x: 150, y: 100, vy: 60, kind: 'bata', drift: 0 });
  s.bodies.push(pipa, bata);
  stepN(s, 45);
  assert.ok(pipa.x > 150 + 12, `pipa terdorong angin: dx=${(pipa.x - 150).toFixed(0)}`);
  assert.ok(Math.abs(bata.x - 150) < 3, 'bata lurus');
});
test('spawn samping: benda masuk horizontal dari tepi & bisa membunuh tanpa dinding', () => {
  const s = createState(5, W, H); // L6 lemparan samping, tanpa garis sama sekali
  const maxSteps = Math.ceil((s.level.duration + 2) * 60);
  let sawHorizontal = false;
  for (let k = 0; k < maxSteps && s.status === 'play'; k += 1) {
    step(s, 1 / 60);
    for (const b of s.bodies) {
      if (b.origin !== 'top' && Math.abs(b.vx) > 150) sawHorizontal = true;
    }
  }
  assert.ok(sawHorizontal, 'ada benda terbang horizontal');
  assert.equal(s.status, 'dead', 'tanpa perlindungan apapun mandor harus tumbang');
});

console.log('\n[9] objektif ganda: dua protectee & sakelar');
test('level dua orang: protectees = mandor + tukang; tukang kena → dead(tukang)', () => {
  const s = createState(8, W, H); // L9
  assert.equal(s.protectees.length, 2);
  assert.equal(s.protectees[0].role, 'mandor');
  assert.equal(s.protectees[1].role, 'tukang');
  const t = s.protectees[1];
  s.level = { ...s.level, spawns: [] };
  s.bodies.push(fullBody({ x: t.x, y: t.y - 110, vy: 300 }));
  stepN(s, 50);
  assert.equal(s.status, 'dead');
  assert.equal(s.deathCause, 'tukang');
});
test('sakelar: benda cepat menyentuh sakelar → dead(sakelar); tanpa sakelar aman', () => {
  const s = createState(9, W, H); // L10
  assert.ok(s.switchBox, 'ada switchBox');
  s.level = { ...s.level, spawns: [] };
  const sw = s.switchBox!;
  s.bodies.push(fullBody({ x: sw.x - 90, y: sw.y, vx: 420, vy: 0, origin: 'right' }));
  let died = false;
  for (let k = 0; k < 40 && s.status === 'play'; k += 1) step(s, 1 / 60);
  if (s.status === 'dead') died = true;
  assert.ok(died, 'sakelar harus terpicu');
  assert.equal(s.deathCause, 'sakelar');
  assert.ok(s.switchHits.length > 0);
});
test('sakelar: puing yang SUDAH diam menempel sakelar TIDAK memicu', () => {
  const s = createState(9, W, H);
  s.level = { ...s.level, spawns: [] };
  const sw = s.switchBox!;
  // benda tergeletak (landed) di kaki tiang — bukan tumbukan
  s.bodies.push(fullBody({ x: sw.x, y: s.groundY - KIND_R.bata, vx: 0, vy: 0, landed: true }));
  stepN(s, 30);
  assert.equal(s.status, 'play');
});

console.log('\n[10] solver: 15/15 referensi menang; payung naif gugur di level fitur');
test('SOLVER: solusi referensi menamatkan 15/15 level & meraih bintang 3', () => {
  for (let i = 0; i < LEVELS.length; i += 1) {
    const r = solveReference(i);
    assert.equal(r.status, 'win', `L${i + 1} ${r.name}: ${r.status} (${r.deathCause ?? '-'})`);
    assert.equal(r.stars, 3, `L${i + 1} ${r.name}: bintang ${r.stars}, tinta ${r.inkUsed}/${r.inkMax}`);
    assert.ok(r.inkUsed <= r.inkMax, `L${i + 1}: tinta referensi melebihi anggaran`);
  }
});
test('BUKTI BALIK: payung datar naif GAGAL di semua level sakelar & penutup', () => {
  // Level yang objektifnya mustahil dipenuhi payung di atas mandor saja:
  // sakelar (10, 13, 14, 15) dan dua-orang terberat (12).
  for (const i of [9, 11, 12, 13, 14]) {
    const r = solveNaive(i);
    assert.equal(r.status, 'dead', `L${i + 1} ${r.name}: payung naif status=${r.status}`);
  }
});
test('solusi referensi memakai struktur (bukan payung polos) di level sangkar', () => {
  // L6 referensi adalah sangkar: ada titik di kedua sisi mandor yang turun
  // mendekati tanah (dinding), bukan sekadar busur di atas kepala.
  const pts = REFERENCE_SOLUTIONS[5](W, H);
  const fy = 610; // foreman.y pada W,H solver
  const leftLow = pts.some((p) => p.x < W * 0.36 && p.y > fy);
  const rightLow = pts.some((p) => p.x > W * 0.64 && p.y > fy);
  assert.ok(leftLow && rightLow, 'sangkar punya dua dinding turun');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
