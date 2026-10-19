/**
 * EZRAB Design Workflow — Independent Verification (headless, no vitest)
 *
 * Verifies the gaps the completion report left open:
 *  1. XLSX byte-level readback: real workbook generated, parsed back with
 *     ExcelJS — sheets, headers, row counts, value types, price-null policy,
 *     yellow highlight.
 *  2. Persistence round-trip: save -> list -> get -> compare, two designs per
 *     project, Project A vs Project B isolation, corrupted/empty data handling.
 *  3. Spec -> RAB bridge: work items with null prices, approval summary.
 *
 * Run: npx tsx src/test/designWorkflowVerify.ts
 * Exit 0 = all checks PASS. Any failure prints FAIL and exits 1.
 *
 * Does NOT touch browser E2E (AiDesignStudio React flow) — that remains for
 * the browser leg of the verification sprint.
 */
import assert from 'node:assert';

// --- localStorage shim for Node ---
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

import { parseHousePrompt, validateSpec } from '../ai-design/specEngine';
import { specToSpreadsheetRows, rowsToCSV } from '../ai-design/DesignSpreadsheet';
import { spreadsheetToWorkItems, validateWorkItemsForRab, buildApprovalSummary } from '../ai-design/designToRabBridge';
import { exportDesignToExcel } from '../ai-design/designExcelExport';
import { saveDesign, listDesigns, getDesign, deleteDesign, verifyRoundTrip } from '../ai-design/designStorage';
import ExcelJS from 'exceljs';

let pass = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return (async () => {
    try { await fn(); pass++; console.log(`PASS  ${name}`); }
    catch (e: any) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
  })();
}

function num(v: any): number { return typeof v === 'number' ? v : NaN; }

async function main() {
  // ---- Build a real spec through the actual prompt parser ----
  const { spec, needsClarification } = parseHousePrompt(
    'Buatkan rumah 1 lantai luas bangunan 90 m2, ukuran 6 x 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.'
  );
  assert(spec, 'spec must parse');
  assert(needsClarification.length === 0, 'no clarification needed');
  const val = validateSpec(spec!);
  console.log(`      spec: ${spec!.buildingWidthM}x${spec!.buildingLengthM}m ${spec!.buildingAreaM2}m2, ${spec!.rooms.length} rooms, valid=${val.valid}, warnings=${val.warnings.length}`);

  // ================= SECTION 1: XLSX byte-level readback =================
  const { buffer, filename } = await exportDesignToExcel(spec!);
  assert(filename.endsWith('.xlsx'), 'filename ends .xlsx');
  assert(buffer.byteLength > 1000, `buffer has substance (${buffer.byteLength} bytes)`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const sheetNames = wb.worksheets.map(w => w.name);
  await check('xlsx: 4 sheets with exact names', () => {
    assert.deepStrictEqual(sheetNames, ['Ringkasan', 'Daftar Ruang', 'Dimensi', 'Data QTO']);
  });

  const ws1 = wb.getWorksheet('Ringkasan')!;
  const ws2 = wb.getWorksheet('Daftar Ruang')!;
  const ws3 = wb.getWorksheet('Dimensi')!;
  const ws4 = wb.getWorksheet('Data QTO')!;

  await check('xlsx Ringkasan: headers + 11 data rows, area=90 numeric', () => {
    assert(ws1.getRow(1).getCell(1).value === 'Item' && ws1.getRow(1).getCell(2).value === 'Nilai', 'headers');
    assert(ws1.rowCount === 12, `rowCount=${ws1.rowCount} (1 header + 11 data)`);
    const areaRow = ws1.getRow(5); // 'Luas Bangunan (m2)'
    assert(areaRow.getCell(1).value === 'Luas Bangunan (m²)', 'label');
    assert(num(areaRow.getCell(2).value) === 90, `area numeric 90, got ${areaRow.getCell(2).value}`);
    const roomRow = ws1.getRow(6);
    assert(num(roomRow.getCell(2).value) === spec!.rooms.length, 'room count matches spec');
  });

  await check('xlsx Daftar Ruang: row count = room count, area numeric', () => {
    assert(ws2.rowCount === 1 + spec!.rooms.length, `rowCount=${ws2.rowCount}`);
    assert(ws2.getRow(1).getCell(2).value === 'Nama Ruang', 'headers');
    const first = ws2.getRow(2);
    assert(typeof num(first.getCell(6).value) === 'number' && !Number.isNaN(num(first.getCell(6).value)), 'area numeric');
    assert(first.getCell(4).value !== null && first.getCell(5).value !== null, 'width/length present');
  });

  await check('xlsx Dimensi: headers Kode/Uraian/Panjang/Lebar/Tinggi/Satuan', () => {
    const h = [1,2,3,4,5,6].map(c => ws3.getRow(1).getCell(c).value);
    assert.deepStrictEqual(h, ['Kode','Uraian','Panjang','Lebar','Tinggi','Satuan']);
  });

  const qtoRows = specToSpreadsheetRows(spec!).filter(r => r.kategori === 'PEKERJAAN');
  await check('xlsx Data QTO: price cells empty (not 0/text), status BELUM TERSEDIA', () => {
    const h = [1,2,3,4,5,6,7,8].map(c => ws4.getRow(1).getCell(c).value);
    assert.deepStrictEqual(h, ['Kode','Uraian','Volume','Satuan','Harga Satuan','Status Harga','Sumber','Catatan']);
    assert(ws4.rowCount === 1 + qtoRows.length, `rowCount=${ws4.rowCount} vs ${qtoRows.length} PEKERJAAN rows`);
    for (let r = 2; r <= ws4.rowCount; r++) {
      const price = ws4.getRow(r).getCell(5).value;
      assert(price === null || price === undefined, `row ${r}: price must be empty, got ${JSON.stringify(price)}`);
      const st = ws4.getRow(r).getCell(6).value;
      assert(st === 'BELUM TERSEDIA', `row ${r}: status`);
    }
  });

  await check('xlsx Data QTO: yellow highlight on price column', () => {
    for (let r = 2; r <= ws4.rowCount; r++) {
      const fill: any = (ws4.getRow(r).getCell(5) as any).fill;
      assert(fill && fill.fgColor && fill.fgColor.argb === 'FFFFF3CD',
        `row ${r}: yellow fill, got ${JSON.stringify(fill)}`);
    }
  });

  await check('xlsx consistency: volume numeric, unit non-empty, matches spreadsheet rows', () => {
    const first = ws4.getRow(2);
    assert(typeof num(first.getCell(3).value) === 'number', 'volume numeric');
    assert(String(first.getCell(4).value).length > 0, 'unit present');
    assert(first.getCell(1).value === qtoRows[0].kode, 'kode matches source row');
  });

  await check('csv: legacy export still works', () => {
    const csv = rowsToCSV(specToSpreadsheetRows(spec!));
    assert(typeof csv === 'string' && csv.length > 100, 'csv non-trivial');
    assert(csv.includes('PEKERJAAN') || csv.includes('kode') || csv.split('\n').length > 2, 'csv has rows');
  });

  // ================= SECTION 2: persistence round-trip =================
  (globalThis as any).localStorage.clear();
  const A = 'proj-A', B = 'proj-B';
  const d1 = saveDesign(A, 'Desain 1', spec!);
  const d2 = saveDesign(A, 'Desain 2', spec!);

  await check('storage: unique IDs, nothing overwritten', () => {
    assert(d1.id !== d2.id, 'IDs unique');
    const list = listDesigns(A);
    assert(list.length === 2, `2 designs, got ${list.length}`);
  });

  await check('storage: save -> get -> compare spec identical', () => {
    const loaded = getDesign(A, d1.id)!;
    assert(loaded, 'found');
    const res = verifyRoundTrip(spec!, loaded.spec);
    assert(res.identical, `round-trip mismatch: ${JSON.stringify(res.diffs)}`);
  });

  await check('storage: Project A vs B isolation', () => {
    saveDesign(B, 'Desain B', spec!);
    assert(listDesigns(A).length === 2, 'A still 2');
    assert(listDesigns(B).length === 1, 'B has 1');
    assert(getDesign(A, 'nope') === null, 'unknown id -> null');
  });

  await check('storage: delete works', () => {
    assert(deleteDesign(A, d2.id) === true, 'delete returns true');
    assert(listDesigns(A).length === 1, '1 left');
    assert(deleteDesign(A, d2.id) === false, 'double delete false');
  });

  await check('storage: corrupted JSON + empty data handled gracefully', () => {
    (globalThis as any).localStorage.setItem('ezrab_designs', '{not-json');
    assert(listDesigns(A).length === 0, 'corrupt -> empty list');
    (globalThis as any).localStorage.removeItem('ezrab_designs');
    assert(getDesign(A, d1.id) === null, 'empty -> null');
  });

  // ================= SECTION 3: spec -> RAB bridge =================
  const items = spreadsheetToWorkItems(specToSpreadsheetRows(spec!));
  await check('bridge: work items carry null prices (never 0)', () => {
    assert(items.length > 0, 'items exist');
    for (const it of items) {
      assert(it.unitPrice === null || it.unitPrice === undefined,
        `item ${it.kode}: price must be null, got ${it.unitPrice}`);
    }
  });

  await check('bridge: validation + approval summary', () => {
    const v = validateWorkItemsForRab(items);
    assert(v.valid.length === items.length, `all valid: ${v.valid.length}/${items.length}`);
    assert(v.rejected.length === 0, 'none rejected');
    const s = buildApprovalSummary(spec!, items);
    assert(s.totalItems === items.length, 'summary count matches');
    assert(s.unresolvedPriceCount === items.length, 'all prices unresolved');
    assert(s.lines.length >= 4, 'summary lines');
  });

  console.log(`\n${pass} checks passed${process.exitCode ? ' WITH FAILURES' : ''}.`);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
