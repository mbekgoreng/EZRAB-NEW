/**
 * P0-A REGRESSION TEST — Undo/redo harus terisolasi per proyek.
 *
 * Skenario wajib master prompt:
 *  1. Edit A, pindah ke B, undo di B -> B TIDAK berubah (return null).
 *  2. Edit A, pindah ke B, redo di B -> B TIDAK berubah (return null).
 *  3. Undo dan redo dalam A tetap benar.
 *  4. Undo dan redo dalam B tetap benar.
 *  5. Pergantian proyek berulang tidak mencampur history.
 *  6. History dokumen berbeda (docKey) tidak saling menimpa.
 *  7. Perubahan tersimpan tidak terhapus oleh snapshot proyek lain.
 *
 * Plus: simulasi logika LAMA (flat array tanpa projectId, seperti
 * RabEstimasiView sebelum fix) untuk membuktikan bug benar-benar ada
 * sebelum perbaikan — test ini HARUS menunjukkan overwrite silang.
 *
 * Jalankan: npx tsx src/test/projectHistory.test.ts
 */

import { ProjectHistory } from '../lib/projectHistory';

interface Item {
  id: string;
  projectId: string;
  description: string;
  volume: number;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function items(pid: string, descs: string[]): Item[] {
  return descs.map((d, i) => ({ id: `${pid}-item-${i}`, projectId: pid, description: d, volume: (i + 1) * 10 }));
}

const DOC = 'rab-items';

// ---------------------------------------------------------------------------
// BAGIAN 1: Bukti bug pada logika LAMA (sebelum fix)
// ---------------------------------------------------------------------------
console.log('\n[1] Simulasi logika LAMA (flat array tanpa projectId) — bug harus terlihat:');

function simulateOldLogic(): { projectBOverwritten: boolean } {
  // Meniru RabEstimasiView sebelum fix: history = RabItem[][], tanpa projectId.
  const history: Item[][] = [];
  let historyIndex = -1;
  const pushOld = (snapshot: Item[]) => {
    history.push(JSON.parse(JSON.stringify(snapshot)));
    historyIndex = history.length - 1;
  };
  const undoOld = (): Item[] | null => {
    if (historyIndex <= 0) return null;
    historyIndex -= 1;
    return history[historyIndex];
  };

  // Edit di proyek A (2x edit -> 2 snapshot)
  pushOld(items('A', ['Pondasi A']));
  pushOld(items('A', ['Pondasi A', 'Dinding A']));

  // Pindah ke proyek B, edit 1x
  pushOld(items('B', ['Atap B']));

  // Ctrl+Z saat proyek B aktif -> mengambil snapshot milik A!
  const undone = undoOld();
  const projectBOverwritten =
    !!undone && undone.some((it) => it.projectId === 'A' || it.description.includes(' A'));
  return { projectBOverwritten };
}

const oldResult = simulateOldLogic();
check(
  'BUG LAMA terbukti: undo di proyek B mengembalikan snapshot proyek A',
  oldResult.projectBOverwritten === true,
  'simulasi tidak menunjukkan overwrite — periksa ulang model bug'
);

// ---------------------------------------------------------------------------
// BAGIAN 2: Logika BARU (ProjectHistory) — semua skenario wajib lolos
// ---------------------------------------------------------------------------
console.log('\n[2] ProjectHistory baru — skenario regresi P0-A:');

const h = new ProjectHistory<Item>();

// --- Skenario 1 & 2: edit A, pindah ke B, undo/redo di B -> B tidak berubah ---
h.push('A', DOC, items('A', ['Pondasi A']));
h.push('A', DOC, items('A', ['Pondasi A', 'Dinding A']));
h.push('B', DOC, items('B', ['Atap B']));

const undoInB = h.undo('B', DOC);
check('S1: undo di proyek B (1 entry) -> null, B tidak berubah', undoInB === null);
check('S1b: canUndo(B) false setelah 1 entry', h.canUndo('B', DOC) === false);

const redoInB = h.redo('B', DOC);
check('S2: redo di proyek B -> null, B tidak berubah', redoInB === null);

// --- Skenario 3: undo/redo dalam A tetap benar ---
const undoA1 = h.undo('A', DOC);
check(
  'S3a: undo di A mengembalikan snapshot pertama A',
  !!undoA1 && undoA1.length === 1 && undoA1[0].description === 'Pondasi A'
);
const redoA1 = h.redo('A', DOC);
check(
  'S3b: redo di A mengembalikan snapshot kedua A',
  !!redoA1 && redoA1.length === 2 && redoA1[1].description === 'Dinding A'
);

// --- Skenario 4: undo/redo dalam B tetap benar (setelah edit ke-2 di B) ---
h.push('B', DOC, items('B', ['Atap B', 'Plafon B']));
const undoB1 = h.undo('B', DOC);
check(
  'S4a: undo di B mengembalikan snapshot pertama B',
  !!undoB1 && undoB1.length === 1 && undoB1[0].description === 'Atap B'
);
const redoB1 = h.redo('B', DOC);
check(
  'S4b: redo di B mengembalikan snapshot kedua B',
  !!redoB1 && redoB1.length === 2 && redoB1[1].description === 'Plafon B'
);

// --- Skenario 5: pergantian proyek berulang tidak mencampur ---
for (let i = 0; i < 5; i++) {
  h.push('A', DOC, items('A', [`Pondasi A rev${i}`]));
  h.push('B', DOC, items('B', [`Atap B rev${i}`]));
}
let mixed = false;
for (let i = 0; i < 5; i++) {
  const u = h.undo('A', DOC);
  if (u && u.some((it) => it.projectId !== 'A')) mixed = true;
}
for (let i = 0; i < 5; i++) {
  const u = h.undo('B', DOC);
  if (u && u.some((it) => it.projectId !== 'B')) mixed = true;
}
check('S5: 5x pindah proyek + undo berulang — tidak ada snapshot silang', mixed === false);

// --- Skenario 6: docKey berbeda tidak saling menimpa ---
const h2 = new ProjectHistory<Item>();
h2.push('A', 'rab-items', items('A', ['RAB A']));
h2.push('A', 'qto-items', items('A', ['QTO A']));
const undoQto = h2.undo('A', 'qto-items');
check('S6a: undo qto-items (1 entry) -> null', undoQto === null);
const undoRab = h2.undo('A', 'rab-items');
check('S6b: undo rab-items (1 entry) -> null, tidak tertukar dengan qto', undoRab === null);
check('S6c: kedua docKey tetap punya 1 entry masing-masing', h2.size('A', 'rab-items') === 1 && h2.size('A', 'qto-items') === 1);

// --- Skenario 7: snapshot proyek lain tidak menghapus perubahan tersimpan ---
const h3 = new ProjectHistory<Item>();
h3.push('A', DOC, items('A', ['Pondasi A v1']));
h3.push('A', DOC, items('A', ['Pondasi A v2'])); // perubahan tersimpan terakhir
h3.push('B', DOC, items('B', ['Atap B'])); // proyek lain men-push
const backToA = h3.undo('A', DOC);
check(
  'S7: history A utuh setelah B men-push — undo A kembalikan v1',
  !!backToA && backToA.length === 1 && backToA[0].description === 'Pondasi A v1'
);
check('S7b: entry count A tetap 2', h3.size('A', DOC) === 2);

// --- Keamanan tambahan: guard projectId/docKey kosong ---
const h4 = new ProjectHistory<Item>();
h4.push('', DOC, items('X', ['Junk']));
check('S8a: push tanpa projectId ditolak', h4.size('', DOC) === 0);
check('S8b: undo tanpa projectId -> null', h4.undo('', DOC) === null);
check('S8c: undo proyek yang tidak dikenal -> null', h4.undo('GHOST', DOC) === null);

// --- Isolasi referensi: snapshot adalah deep copy ---
const h5 = new ProjectHistory<Item>();
const live = items('A', ['Live']);
h5.push('A', DOC, live);
live[0].description = 'DIMUTASI';
const restored = h5.undo('A', DOC); // 1 entry -> null; push 1 lagi dulu
h5.push('A', DOC, items('A', ['Live v2']));
const r2 = h5.undo('A', DOC);
check(
  'S9: mutasi array asli tidak merusak snapshot tersimpan',
  !!r2 && r2[0].description === 'Live'
);

// ---------------------------------------------------------------------------
console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(' | '));
  process.exit(1);
} else {
  console.log('SEMUA TEST P0-A LOLOS');
}
