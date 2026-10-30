/**
 * assistantStabilization — stabilisasi pasca-implementasi Asisten AI.
 *
 * Fokus: (1) batas 25 item snapshot — tool & operasi harus menjangkau
 * SELURUH item proyek (25/26/50/100 item) sementara ringkasan prompt tetap
 * terbatas; (2) akurasi pratinjau & label total parsial; (3) undo hapus
 * fidelitas penuh via baris mentah (ID asal pulih) + jalur fallback;
 * (4) pratinjau kedaluwarsa; (5) persistensi log operasi lintas "refresh".
 *
 * Jalankan: bundle esbuild (format esm) lalu node.
 */
import { buildProjectSnapshot, snapshotAllItems } from '../ai-tools/ezrab-ai/projectContext';
import { setActiveProjectSnapshot, EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';
import {
  buildUpdateQuantityPlan, buildDeletePlan, buildUndoPlan, executePlan,
  appendOperationRecord, listOperationRecords, __resetOpsLogCacheForTests,
  type OperationHost,
} from '../ai-tools/ezrab-ai/operations';
import type { ProjectItemSnapshot } from '../ai-tools/ezrab-ai/projectContext';

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed += 1; console.log(`  PASS ${label}`); }
  else { failed += 1; console.error(`  FAIL ${label}`); }
}
function tool(name: string): (args: Record<string, unknown>) => string {
  const t = EZRAB_AI_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} tidak ditemukan`);
  return t.invoke as (args: Record<string, unknown>) => string;
}

/** Bangun snapshot ASLI dari N item mentah (menguji builder sungguhan). */
function bigProject(n: number, mutate?: (raw: Array<Record<string, unknown>>) => void) {
  const raw: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= n; i++) {
    raw.push({
      id: `item-${i}`, code: '', description: `Pekerjaan nomor ${i}`, unit: 'm2',
      volume: 10, unitPrice: 100000, totalPrice: 1000000, priceStatus: 'PRICE_RESOLVED',
      sectionName: i % 2 === 0 ? 'Seksi Genap' : 'Seksi Ganjil', category: i % 2 === 0 ? 'Seksi Genap' : 'Seksi Ganjil',
    });
  }
  if (mutate) mutate(raw);
  const snap = buildProjectSnapshot({ id: 'P-BIG', name: `Proyek ${n} Item` }, raw);
  if (!snap) throw new Error('snapshot gagal dibangun');
  return snap;
}

class FakeHost implements OperationHost {
  items: ProjectItemSnapshot[];
  projectId = 'P-BIG';
  rawRows: Array<Record<string, unknown>>;
  calls = { update: 0, del: 0, add: 0 };
  constructor(items: ProjectItemSnapshot[], rawRows: Array<Record<string, unknown>> = []) {
    this.items = items;
    this.rawRows = rawRows;
  }
  readItems(): ProjectItemSnapshot[] { return this.items; }
  applyUpdateQuantity(itemId: string, volume: number): void {
    this.calls.update += 1;
    this.items = this.items.map((i) => i.id === itemId
      ? { ...i, volume, totalPrice: i.priceStatus === 'PRICE_UNRESOLVED' ? 0 : volume * (i.unitPrice ?? 0) } : i);
  }
  applyManualUnitPrice(itemId: string, price: number): void {
    this.items = this.items.map((i) => i.id === itemId ? { ...i, unitPrice: price, totalPrice: i.volume * price } : i);
  }
  applyDelete(itemIds: string[]): void {
    this.calls.del += 1;
    this.items = this.items.filter((i) => !itemIds.includes(i.id));
  }
  applyAdd(itemData: Record<string, unknown>): string | null {
    this.calls.add += 1;
    // Meniru factory aplikasi: ID yang diberikan DIPERTAHANKAN.
    const id = String(itemData.id ?? `created-${this.calls.add}`);
    const unitPrice = (itemData.unitPrice as number | null) ?? null;
    const volume = Number(itemData.volume ?? 0);
    this.items = [...this.items, {
      id, code: String(itemData.code ?? ''), description: String(itemData.description ?? ''),
      unit: String(itemData.unit ?? ''), volume, unitPrice,
      totalPrice: unitPrice != null ? volume * unitPrice : 0,
      priceStatus: (itemData.priceStatus as ProjectItemSnapshot['priceStatus']) ?? 'PRICE_UNRESOLVED',
      sectionName: String(itemData.sectionName ?? itemData.category ?? ''),
      ahspCode: String(itemData.ahspCode ?? ''), ahspMappingStatus: String(itemData.ahspMappingStatus ?? ''),
      priceSourceKind: String(itemData.priceSourceKind ?? ''),
    } as ProjectItemSnapshot];
    this.rawRows = [...this.rawRows, { ...itemData, id }];
    return id;
  }
  readRawItem(itemId: string): Record<string, unknown> | null {
    const raw = this.rawRows.find((r) => r.id === itemId);
    return raw ? { ...raw } : null;
  }
  persistenceStatus(): 'saved' { return 'saved'; }
}

console.log('== Batas 25 item: kelengkapan tool pada 25/26/50/100 item ==');
for (const n of [25, 26, 50, 100]) {
  const snap = bigProject(n, (raw) => {
    raw[n - 1] = { ...raw[n - 1], code: '1.1.4.2', description: 'Pasangan bouwplank terakhir', unit: "m'", volume: 10, unitPrice: 155785, totalPrice: 1557850 };
  });
  ok(snap.items.length === 25, `${n} item: daftar prompt tetap terbatas 25`);
  ok(snapshotAllItems(snap).length === n, `${n} item: daftar alat lengkap (${n})`);
  ok(snap.totalDirect === (n - 1) * 1000000 + 1557850, `${n} item: totalDirect proyek lengkap`);
  setActiveProjectSnapshot(snap);
  const sections = tool('get_project_sections')({});
  ok(sections.includes('Rp' + ((n - 1) * 1000000 + 1557850).toLocaleString('id-ID')), `${n} item: total seksi = total proyek penuh`);
  const mats = tool('get_project_materials')({ nama: 'bouwplank terakhir' });
  ok(mats.includes('Paku 2 inch'), `${n} item: material item ke-${n} (di luar 25) terjangkau`);
}
{
  // Item termahal sengaja diletakkan di posisi 77 dari 100.
  const snap = bigProject(100, (raw) => {
    raw[76] = { ...raw[76], description: 'Pekerjaan termahal tersembunyi', unitPrice: 9999999, totalPrice: 99999990 };
  });
  setActiveProjectSnapshot(snap);
  const top = tool('get_project_costliest')({ jumlah: 1 });
  ok(top.includes('Pekerjaan termahal tersembunyi'), '100 item: item termahal di posisi 77 ditemukan');
}

console.log('== Operasi tulis menarget item di luar 25 pertama ==');
{
  const snap = bigProject(50);
  const host = new FakeHost(snapshotAllItems(snap));
  const built = buildUpdateQuantityPlan(snap, { nama: 'pekerjaan nomor 42' }, 99, 'Penguji');
  ok(built.ok, 'plan untuk item ke-42 terbangun');
  if (built.ok) {
    const res = await executePlan(built.plan, host);
    ok(res.ok, 'eksekusi item ke-42 berhasil');
    ok(host.items.find((i) => i.id === 'item-42')?.volume === 99, 'item ke-42 berubah');
    ok(host.items.filter((i) => i.volume === 99).length === 1, 'hanya item target yang berubah');
    // Hash mencakup seluruh daftar: mengutak-atik item ke-50 membatalkan plan baru.
    const built2 = buildUpdateQuantityPlan(snap, { nama: 'pekerjaan nomor 10' }, 5, 'Penguji');
    if (built2.ok) {
      host.applyUpdateQuantity('item-50', 12345);
      const res2 = await executePlan(built2.plan, host);
      ok(!res2.ok && res2.message.includes('berubah sejak pratinjau'), 'edit pada item ke-50 membatalkan plan (hash menyeluruh)');
    }
  }
}

console.log('== Akurasi pratinjau: lengkap vs parsial ==');
{
  const complete = bigProject(3);
  const b1 = buildUpdateQuantityPlan(complete, { nama: 'nomor 1' }, 20, 'Penguji');
  ok(b1.ok && !b1.plan.previewText.includes('PARSIAL'), 'proyek lengkap: pratinjau tanpa label parsial');
  ok(b1.ok && b1.plan.expectedTotalAfter === 4000000, 'proyek lengkap: total sesudah tepat (2×1jt + 20×100rb)');
  const partial = bigProject(3, (raw) => {
    raw[2] = { ...raw[2], unitPrice: null, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED' };
  });
  const b2 = buildUpdateQuantityPlan(partial, { nama: 'nomor 1' }, 20, 'Penguji');
  ok(b2.ok && b2.plan.previewText.includes('PARSIAL'), 'proyek parsial: pratinjau berlabel PARSIAL');
  ok(b2.ok && b2.plan.previewText.includes('1 item yang belum berharga'), 'label parsial menyebut jumlah item belum berharga');
  ok(b2.ok && b2.plan.expectedTotalBefore === 2000000, 'total parsial hanya menjumlah item ter-resolve (2jt, bukan 3jt)');
}

console.log('== Pratinjau kedaluwarsa ditolak ==');
{
  const snap = bigProject(3);
  const host = new FakeHost(snapshotAllItems(snap));
  const built = buildUpdateQuantityPlan(snap, { nama: 'nomor 2' }, 7, 'Penguji');
  ok(built.ok, 'plan terbangun');
  if (built.ok) {
    built.plan.expiresAt = Date.now() - 1000;
    const res = await executePlan(built.plan, host);
    ok(!res.ok && res.message.includes('kedaluwarsa'), 'plan kedaluwarsa ditolak');
    ok(host.calls.update === 0, 'mutator tidak dipanggil untuk plan kedaluwarsa');
  }
}

console.log('== Undo hapus: fidelitas penuh via baris mentah ==');
{
  const rawTarget: Record<string, unknown> = {
    id: 'item-2', code: '3.7.4', ahspCode: '3.7.4', ahspMappingStatus: 'VERIFIED',
    description: 'Plesteran dinding', unit: 'm2', volume: 200, unitPrice: 51622, totalPrice: 10324400,
    priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: 'SE 47/2026',
    sectionName: 'Dinding', category: 'Dinding', materialPrice: 30000, laborPrice: 21622,
  };
  const snap = bigProject(3, (raw) => { raw[1] = { ...rawTarget }; });
  const host = new FakeHost(snapshotAllItems(snap), [
    { id: 'item-1' }, rawTarget, { id: 'item-3' },
  ]);
  const built = buildDeletePlan(snap, [{ nama: 'plesteran' }], 'Penguji');
  ok(built.ok, 'plan hapus terbangun');
  if (built.ok) {
    const res = await executePlan(built.plan, host);
    ok(res.ok, 'hapus tereksekusi');
    const rec = listOperationRecords('P-BIG').find((r) => r.kind === 'delete_items');
    ok(!!rec?.beforeRawItems?.length, 'record menyimpan baris mentah penuh');
    if (rec) {
      const undoBuilt = buildUndoPlan({ ...snap, items: snapshotAllItems(snap).filter((i) => i.id !== 'item-2'), allItems: snapshotAllItems(snap).filter((i) => i.id !== 'item-2') } as never, rec, 'Penguji');
      ok(undoBuilt.ok, 'plan undo terbangun');
      if (undoBuilt.ok) {
        ok(undoBuilt.plan.previewText.includes('ID asal ikut pulih'), 'pratinjau undo menyatakan ID asal pulih');
        const ures = await executePlan(undoBuilt.plan, host);
        const restoredRaw = host.rawRows.find((r) => r.id === 'item-2');
        ok(ures.ok && !!restoredRaw, 'undo tereksekusi dan item kembali dengan ID asal');
        ok(restoredRaw?.priceSourceLabel === 'SE 47/2026' && restoredRaw?.materialPrice === 30000 && restoredRaw?.priceSourceKind === 'OFFICIAL_AHSP',
          'field provenance & rincian harga pulih utuh');
      }
    }
  }
}

console.log('== Undo hapus fallback (tanpa baris mentah): peringatan ID baru ==');
{
  const snap = bigProject(3);
  appendOperationRecord({
    id: 'op-fallback-1', ts: Date.now(), projectId: 'P-BIG', projectName: snap.projectName,
    actor: 'Penguji', kind: 'delete_items', summary: 'Hapus item', targetIds: ['item-2'],
    before: null, after: null, status: 'executed', persistence: 'saved',
    beforeItems: [snapshotAllItems(snap)[1]],
  });
  const rec = listOperationRecords('P-BIG').find((r) => r.id === 'op-fallback-1');
  ok(!!rec, 'record fallback tercatat');
  if (rec) {
    const afterDelete = { ...snap, allItems: snapshotAllItems(snap).filter((i) => i.id !== 'item-2') } as typeof snap;
    const undoBuilt = buildUndoPlan(afterDelete, rec, 'Penguji');
    ok(undoBuilt.ok && undoBuilt.plan.previewText.includes('ID baru'), 'tanpa baris mentah: pratinjau jujur soal ID baru');
  }
}

console.log('== Persistensi log operasi lintas refresh (simulasi) ==');
{
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  appendOperationRecord({
    id: 'op-persist-1', ts: Date.now(), projectId: 'P-PERSIST', projectName: 'Proyek Persist',
    actor: 'Penguji', kind: 'update_quantity', summary: 'Ubah kuantitas', targetIds: ['x'],
    before: { itemId: 'x', value: 1 }, after: { itemId: 'x', value: 2 },
    status: 'executed', persistence: 'saved',
  });
  __resetOpsLogCacheForTests(); // = muat ulang modul dari storage
  const rows = listOperationRecords('P-PERSIST');
  ok(rows.some((r) => r.id === 'op-persist-1'), 'record tetap terbaca setelah reset cache (tersimpan di storage)');
  delete (globalThis as Record<string, unknown>).localStorage;
  __resetOpsLogCacheForTests();
}

console.log('== Batas keras 1.000 item: tidak ada klaim cakupan penuh ==');
{
  const { setAssistantOperationContext } = await import('../ai-tools/ezrab-ai/operations');
  const snap = bigProject(1001, (raw) => {
    raw[1000] = { ...raw[1000], description: 'Item penutup unik zzz', unitPrice: null, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED' };
  });
  ok(snap.allTruncated === true, '1001 item: allTruncated terdeteksi');
  ok(snapshotAllItems(snap).length === 1000, '1001 item: daftar alat berhenti di batas keras 1.000');
  ok(snap.totalDirect === 1000 * 1000000, '1001 item: totalDirect tetap lengkap dari builder (1 M)');
  setActiveProjectSnapshot(snap);
  const sections = tool('get_project_sections')({});
  ok(sections.includes('batas 1.000 item'), 'seksi: catatan pemotongan tampil');
  const top = tool('get_project_costliest')({ jumlah: 3 });
  ok(top.includes('peringkat dihitung dari 1.000 item pertama'), 'termahal: catatan peringkat parsial tampil');
  const detail = tool('get_item_detail')({ nama: 'penutup unik zzz' });
  ok(detail.includes('tidak ditemukan') && detail.includes('mungkin berada di luar jangkauan'), 'detail: ketidakditemukan disertai caveat jangkauan');
  const unresolved = tool('get_unresolved_items')({});
  ok(unresolved.includes('1 item belum memiliki harga') && !unresolved.includes('sudah memiliki harga'), 'unresolved: hitungan penuh jujur walau daftar kosong');
  ok(unresolved.includes('di luar jangkauan daftar ini'), 'unresolved: catatan di luar jangkauan tampil');
  const items = tool('get_project_items')({ kata_kunci: 'penutup unik zzz' });
  ok(items.includes('hanya mencakup 1.000 item pertama'), 'pencarian item: catatan cakupan tampil');
  const total = tool('get_project_total')({});
  ok(total.includes('Rp1.000.000.000'), 'total proyek tetap lengkap (1 M) dari mesin builder');
  setAssistantOperationContext({ actor: 'Penguji', writesEnabled: true });
  const refused = tool('propose_update_quantity')({ nama: 'pekerjaan nomor 5', volume: 3 });
  ok(refused.includes('di luar batas dataset tervalidasi'), 'operasi tulis MENOLAK proyek >1.000 item');
  setAssistantOperationContext(null);
}

setActiveProjectSnapshot(null);
console.log(`\nassistantStabilization: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
