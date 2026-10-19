/**
 * Catur Proyek — logic tests. Run: npx tsx src/game-space/games/arcade/chess/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  startState, stateFromRows, genMoves, legalMovesFor, allLegal, applyMove,
  inCheck, gameStatus, insufficientMaterial, aiBestMove, evaluate, squareName,
  type State, type Move,
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

function perft(s: State, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of allLegal(s)) n += perft(applyMove(s, m), depth - 1);
  return n;
}

/* ---------- perft: validasi generator ---------- */
test('perft(1) posisi awal = 20', () => {
  assert.equal(perft(startState(), 1), 20);
});
test('perft(2) posisi awal = 400', () => {
  assert.equal(perft(startState(), 2), 400);
});
test('perft(3) posisi awal = 8902', () => {
  assert.equal(perft(startState(), 3), 8902);
});
test('perft kiwipete depth 2 = 2039', () => {
  const s = stateFromRows([
    'r...k..r',
    'p.ppqpb.',
    'bn..pnp.',
    '...PN...',
    '.p..P...',
    '..N..Q.p',
    'PPPBBPPP',
    'R...K..R',
  ]);
  assert.equal(perft(s, 2), 2039);
});

/* ---------- aturan khusus ---------- */
test('fool mate -> skakmat hitam menang', () => {
  let s = startState();
  const play = (uci: string): void => {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const ms = allLegal(s).filter(
      (m) => squareName(m.from) === from && squareName(m.to) === to,
    );
    assert.ok(ms.length > 0, `langkah ${uci} tidak legal`);
    s = applyMove(s, ms[0]);
  };
  play('f2f3'); play('e7e5'); play('g2g4'); play('d8h4');
  const st = gameStatus(s);
  assert.ok(st.over, 'harus over');
  assert.equal(st.result, 'b');
  assert.equal(st.reason, 'checkmate');
  assert.ok(inCheck(s, 'w'));
});

test('rokade pendek & panjang legal saat jalur bersih', () => {
  const s = stateFromRows([
    'r...k..r',
    'pppppppp',
    '........',
    '........',
    '........',
    '........',
    'PPPPPPPP',
    'R...K..R',
  ]);
  const king = 7 * 8 + 4;
  const mv = legalMovesFor(s, king).map((m) => m.castle);
  assert.ok(mv.includes('K'), 'rokade pendek harus legal');
  assert.ok(mv.includes('Q'), 'rokade panjang harus legal');
  // terapkan rokade pendek: raja ke g1, benteng ke f1
  const m = legalMovesFor(s, king).find((x) => x.castle === 'K')!;
  const ns = applyMove(s, m);
  assert.equal(squareName(m.to), 'g1');
  assert.equal(ns.board[7 * 8 + 5]?.t, 'r');
  assert.equal(ns.wk, false);
  assert.equal(ns.wq, false);
});

test('rokade ilegal saat melewati petak diserang', () => {
  // benteng hitam di f8 (tanpa pion f7/f2) menyerang f1
  const s = stateFromRows([
    '....kr..',
    'ppppp.pp',
    '........',
    '........',
    '........',
    '........',
    'PPPPP.PP',
    'R...K..R',
  ]);
  const king = 7 * 8 + 4;
  const mv = legalMovesFor(s, king).map((m) => m.castle);
  assert.ok(!mv.includes('K'), 'rokade pendek harus ILEGAL (f1 diserang)');
});

test('en passant: ambil & pion hilang', () => {
  // putih pion e5, hitam baru double-push d7-d5
  let s = stateFromRows([
    'rnbqkbnr',
    'ppp.pppp',
    '........',
    '...pP...',
    '........',
    '........',
    'PPPPPPPP',
    'RNBQKBNR',
  ]);
  s = { ...s, turn: 'b' };
  // hitam d7-d5 sudah di papan; set ep manual ke d6
  s.ep = 2 * 8 + 3; // d6
  s.turn = 'w';
  const from = 3 * 8 + 4; // e5
  const eps = legalMovesFor(s, from).filter((m) => m.ep);
  assert.equal(eps.length, 1, 'harus ada 1 en passant');
  const ns = applyMove(s, eps[0]);
  assert.equal(ns.board[2 * 8 + 3]?.t, 'p'); // pion putih kini di d6
  assert.equal(ns.board[3 * 8 + 3], null); // pion hitam di d5 hilang
});

test('stalemate klasik -> seri', () => {
  // raja hitam h8, raja putih f7, menteri putih g6... pakai posisi stalemate standar:
  // hitam: Kh8; putih: Kf7, Qg5 -> hitam tak bisa jalan & tak skak? Qg5 menutup? pakai yg pasti:
  const s = stateFromRows([
    '.......k',
    '.....K..',
    '......Q.',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);
  const st = { ...s, turn: 'b' };
  const res = gameStatus(st);
  assert.ok(res.over, `over? moves=${allLegal(st).length}`);
  assert.equal(res.result, 'draw');
  assert.equal(res.reason, 'stalemate');
});

test('promosi: 4 pilihan & pion berubah', () => {
  const s = stateFromRows([
    '........',
    '...P....',
    '........',
    '........',
    '........',
    '........',
    '.k......',
    '.......K',
  ]);
  const from = 1 * 8 + 3; // d7
  const promos = legalMovesFor(s, from).filter((m) => m.promo);
  assert.equal(promos.length, 4, `promosi=${promos.length}`);
  const ns = applyMove(s, promos.find((m) => m.promo === 'q')!);
  assert.equal(ns.board[0 * 8 + 3]?.t, 'q');
});

test('material tak cukup: K vs K -> seri', () => {
  const s = stateFromRows([
    '....k...',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '....K...',
  ]);
  assert.ok(insufficientMaterial(s.board));
  assert.equal(gameStatus(s).reason, 'material');
});

test('aturan 50 langkah -> seri', () => {
  const s = { ...startState(), half: 100 };
  assert.equal(gameStatus(s).reason, 'fifty');
});

test('pion terkunci tak boleh buka skak (pinned)', () => {
  // raja putih e1, pion putih e2, benteng hitam e8 -> pion e2 tak boleh maju 2 (buka skak)? maju 1/2 tetap di file e -> tetap legal
  // pakai pion d2: d2-d3 membuka diagonal? benteng di e8 menyerang file e; pion d2 bebas. Gunakan: raja e1, gajah hitam b4 menyerang e1 via d2? b4-c3-d2-e1: pion d2 maju d3 tetap menutup? d3 masih di diagonal b4-e1? diagonal b4: c3,d2,e1. d3 tidak di diagonal -> ilegal.
  const s = stateFromRows([
    '....r...',
    '........',
    '........',
    '........',
    '.b......',
    '........',
    '...P....',
    '....K...',
  ]);
  const from = 6 * 8 + 3; // d2
  const mv = legalMovesFor(s, from);
  assert.equal(mv.length, 0, `pion pinned harus 0 langkah, dapat ${mv.length}`);
});

/* ---------- AI ---------- */
test('AI: selalu langkah legal', () => {
  const s = startState();
  const r = aiBestMove(s, 'w', 2, () => 0.5);
  assert.ok(r, 'AI harus mengembalikan langkah');
  assert.ok(allLegal(s).some((m) => m.from === r!.move.from && m.to === r!.move.to && m.promo === r!.move.promo));
});

test('AI: menemukan skakmat dalam 1 langkah', () => {
  // putih: Kh6? pakai back-rank mate: hitam Kg8, pion g7/h7, putih Qg6? Sederhana: Qg7# didukung Kg6
  const s = stateFromRows([
    '......k.',
    '......pp',
    '....KQ..',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);
  const r = aiBestMove(s, 'w', 2, () => 0);
  assert.ok(r, 'AI harus jalan');
  const ns = applyMove(s, r!.move);
  const st = gameStatus(ns);
  assert.ok(st.over && st.result === 'w' && st.reason === 'checkmate', `AI main ${squareName(r!.move.from)}${squareName(r!.move.to)} -> ${st.reason}`);
});

test('AI: tidak membuang menteri gratis (menolak blunder)', () => {
  // posisi: menteri putih d1 diserang? buat sederhana: AI hitam tak boleh main Qx?? yang digantung.
  // Uji deterministik: dari posisi awal depth 2, skor AI untuk hitam harus dalam batas wajar
  let s = startState();
  const first = aiBestMove(s, 'w', 2, () => 0.99);
  assert.ok(first);
  s = applyMove(s, first!.move);
  const r = aiBestMove(s, 'b', 2, () => 0.99);
  assert.ok(r, 'AI hitam harus jalan');
  const ev = evaluate(applyMove(s, r!.move));
  assert.ok(ev < 400, `AI hitam tak boleh blunder besar, eval=${ev}`);
});

test('evaluate: material awal seimbang', () => {
  assert.equal(evaluate(startState()), 0);
});

test('moveToUci format', () => {
  const m: Move = { from: 6 * 8 + 4, to: 4 * 8 + 4 };
  assert.equal(squareName(m.from), 'e2');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAILURES:', failures.join(', '));
  process.exit(1);
}
