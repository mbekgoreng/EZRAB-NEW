/**
 * assistantOperations — Fase B/D Asisten AI: lapisan operasi spreadsheet.
 *
 * Menguji modul operations.ts murni + tool propose_* lewat host palsu yang
 * meniru semantik mutator ProjectContext (update → hitung ulang amount,
 * hapus → filter, tambah → ID baru). Skenario mengikuti Fase F prompt:
 * target unik, ambiguitas, nilai invalid, pratinjau basi, ganti proyek,
 * persistensi gagal, undo aman, dan harga hilang yang tetap hilang.
 *
 * Jalankan: bundle esbuild (format esm, top-level await) lalu node.
 */
import {
  buildUpdateQuantityPlan, buildUpdateUnitPricePlan, buildDeletePlan, buildAddPlan,
  buildUndoPlan, executePlan, getLastUndoableRecord, listOperationRecords,
  hashProjectItems, setAssistantOperationContext,
  type OperationHost, type ChangePlan,
} from '../ai-tools/ezrab-ai/operations';
import { setActiveProjectSnapshot, EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';
import type { ProjectSnapshot, ProjectItemSnapshot } from '../ai-tools/ezrab-ai/projectContext';

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

let seq = 0;
function item(over: Partial<ProjectItemSnapshot>): ProjectItemSnapshot {
  seq += 1;
  return {
    id: `it-${seq}`, code: '', description: '', unit: 'm2', volume: 0, unitPrice: null,
    totalPrice: 0, priceStatus: 'PRICE_RESOLVED', sectionName: '',
    ahspCode: '', ahspMappingStatus: '', priceSourceKind: '', ...over,
  } as ProjectItemSnapshot;
}
function snapOf(items: ProjectItemSnapshot[], projectId = 'P-OPS'): ProjectSnapshot {
  return {
    projectId, projectName: 'Proyek Operasi', itemCount: items.length,
    totalDirect: items.reduce((s, i) => s + i.totalPrice, 0),
    unresolvedCount: items.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').length,
    unresolvedItems: items.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED'),
    items, truncated: false, costBreakdown: null,
  } as ProjectSnapshot;
}

/** Host palsu: state item + mutator bergaya ProjectContext + status simpan. */
class FakeHost implements OperationHost {
  items: ProjectItemSnapshot[];
  projectId: string;
  persistence: 'saved' | 'error' = 'saved';
  calls = { update: 0, price: 0, del: 0, add: 0, snap: 0 };
  private addSeq = 0;
  constructor(items: ProjectItemSnapshot[], projectId = 'P-OPS') {
    this.items = items;
    this.projectId = projectId;
  }
  readItems(): ProjectItemSnapshot[] { return this.items; }
  applyUpdateQuantity(itemId: string, volume: number): void {
    this.calls.update += 1;
    this.items = this.items.map((i) => i.id === itemId
      ? { ...i, volume, totalPrice: i.priceStatus === 'PRICE_UNRESOLVED' ? 0 : volume * (i.unitPrice ?? 0) }
      : i);
  }
  applyManualUnitPrice(itemId: string, price: number): void {
    this.calls.price += 1;
    this.items = this.items.map((i) => i.id === itemId
      ? { ...i, unitPrice: price, priceStatus: 'PRICE_RESOLVED', totalPrice: i.volume * price, priceSourceKind: '' }
      : i);
  }
  applyDelete(itemIds: string[]): void {
    this.calls.del += 1;
    this.items = this.items.filter((i) => !itemIds.includes(i.id));
  }
  applyAdd(itemData: Record<string, unknown>): string | null {
    this.calls.add += 1;
    this.addSeq += 1;
    const id = `created-${this.addSeq}`;
    const unitPrice = (itemData.unitPrice as number | null) ?? null;
    const volume = Number(itemData.volume ?? 0);
    this.items = [...this.items, item({
      id, code: String(itemData.code ?? ''), description: String(itemData.description ?? ''),
      unit: String(itemData.unit ?? ''), volume, unitPrice,
      priceStatus: (itemData.priceStatus as ProjectItemSnapshot['priceStatus']) ?? 'PRICE_UNRESOLVED',
      totalPrice: unitPrice != null ? volume * unitPrice : 0,
    })];
    return id;
  }
  createSafetySnapshot(): string | null { this.calls.snap += 1; return 'VER-TEST-1'; }
  persistenceStatus(): 'saved' | 'error' { return this.persistence; }
}

const ACTOR = 'Estimator Uji';

console.log('== Hash state deterministik ==');
{
  const a = [item({ volume: 5, unitPrice: 100, totalPrice: 500 })];
  ok(hashProjectItems(a) === hashProjectItems([...a]), 'hash sama untuk isi sama');
  ok(hashProjectItems(a) !== hashProjectItems([{ ...a[0], volume: 6 }]), 'hash berubah saat volume berubah');
}

console.log('== Ubah kuantitas target unik (F9/F14/F15) ==');
{
  const target = item({ description: 'Pekerjaan persiapan lahan', volume: 200, unitPrice: 50000, totalPrice: 10000000, sectionName: 'Persiapan' });
  const other = item({ description: 'Galian tanah', volume: 30, unitPrice: 75000, totalPrice: 2250000, sectionName: 'Tanah' });
  const broken = item({ description: 'Item tanpa harga', volume: 10, unitPrice: null, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED' });
  const host = new FakeHost([target, other, broken]);
  const built = buildUpdateQuantityPlan(snapOf(host.items), { nama: 'persiapan lahan' }, 150, ACTOR);
  ok(built.ok, 'plan kuantitas terbangun');
  if (built.ok) {
    ok(built.plan.previewText.includes('PRATINJAU OPERASI'), 'pratinjau berlabel belum dieksekusi');
    ok(built.plan.expectedTotalAfter === 9750000, 'total perkiraan = 7,5jt + 2,25jt + 0');
    const res = await executePlan(built.plan, host);
    ok(res.ok, 'eksekusi berhasil terverifikasi');
    const after = host.items.find((i) => i.id === target.id);
    ok(after?.volume === 150 && after?.totalPrice === 7500000, 'target berubah 200→150 dan subtotal terekalkulasi');
    ok(host.items.find((i) => i.id === other.id)?.volume === 30, 'baris lain tidak tersentuh');
    const un = host.items.find((i) => i.id === broken.id);
    ok(un?.unitPrice === null && un?.priceStatus === 'PRICE_UNRESOLVED', 'item belum berharga tetap null (tidak menjadi Rp0)');
    const rec = getLastUndoableRecord('P-OPS');
    ok(rec?.kind === 'update_quantity' && rec?.persistence === 'saved', 'record operasi tercatat dengan persistensi saved');
  }
}

console.log('== Ambiguitas & nilai invalid (F10/F16) ==');
{
  const d1 = item({ description: 'Pasangan bata merah', volume: 10, unitPrice: 1000, totalPrice: 10000 });
  const d2 = item({ description: 'Pasangan bata ringan', volume: 20, unitPrice: 2000, totalPrice: 40000 });
  const snap = snapOf([d1, d2]);
  const amb = buildUpdateQuantityPlan(snap, { nama: 'pasangan bata' }, 5, ACTOR);
  ok(!amb.ok && amb.message.includes('ambigu'), 'target ambigu ditolak dengan daftar kandidat');
  const bad = buildUpdateQuantityPlan(snap, { nama: 'bata merah' }, -5, ACTOR);
  ok(!bad.ok, 'volume negatif ditolak');
  const badPrice = buildUpdateUnitPricePlan(snap, { nama: 'bata merah' }, -100, ACTOR);
  ok(!badPrice.ok, 'harga negatif ditolak');
  const none = buildUpdateQuantityPlan(snap, { nama: 'tidak ada item ini' }, 5, ACTOR);
  ok(!none.ok, 'target tidak ditemukan ditolak');
}

console.log('== Pratinjau basi & ganti proyek (F17/F21) ==');
{
  const target = item({ description: 'Urugan pasir', volume: 40, unitPrice: 300000, totalPrice: 12000000 });
  const host = new FakeHost([target]);
  const built = buildUpdateQuantityPlan(snapOf(host.items), { nama: 'urugan' }, 25, ACTOR);
  ok(built.ok, 'plan terbangun');
  if (built.ok) {
    host.applyUpdateQuantity(target.id, 41); // edit manual sesudah pratinjau
    const callsBefore = host.calls.update;
    const res = await executePlan(built.plan, host);
    ok(!res.ok && res.message.includes('berubah sejak pratinjau'), 'pratinjau basi ditolak');
    ok(host.calls.update === callsBefore, 'mutator TIDAK dipanggil untuk plan basi');
    ok(host.items[0].volume === 41, 'nilai hasil edit manual tidak ditimpa');
  }
  const hostB = new FakeHost([item({ description: 'Urugan pasir', volume: 40, unitPrice: 300000, totalPrice: 12000000 })], 'P-LAIN');
  const built2 = buildUpdateQuantityPlan(snapOf(hostB.items, 'P-LAIN'), { nama: 'urugan' }, 25, ACTOR);
  if (built2.ok) {
    const wrongProjectHost = new FakeHost(hostB.items, 'P-OPS');
    const res2 = await executePlan(built2.plan, wrongProjectHost);
    ok(!res2.ok && res2.message.includes('berganti'), 'eksekusi pada proyek berbeda ditolak');
  }
}

console.log('== Hapus + undo pulih (F12/F20) & snapshot pengaman ==');
{
  const victim = item({ code: '3.7.4', description: 'Plesteran dinding', volume: 200, unitPrice: 51622, totalPrice: 10324400, sectionName: 'Dinding' });
  const keeper = item({ description: 'Cat dinding', volume: 200, unitPrice: 25000, totalPrice: 5000000 });
  const host = new FakeHost([victim, keeper]);
  const built = buildDeletePlan(snapOf(host.items), [{ nama: 'plesteran' }], ACTOR);
  ok(built.ok, 'plan hapus terbangun');
  if (built.ok) {
    const res = await executePlan(built.plan, host);
    ok(res.ok && host.items.length === 1 && host.items[0].id === keeper.id, 'item terhapus, item lain utuh');
    ok(host.calls.snap === 1, 'snapshot versi pengaman dibuat sebelum hapus');
    const rec = getLastUndoableRecord('P-OPS');
    ok(rec?.kind === 'delete_items' && (rec?.beforeItems?.length ?? 0) === 1, 'record hapus menyimpan baris asal untuk undo');
    if (rec) {
      const undoBuilt = buildUndoPlan(snapOf(host.items), rec, ACTOR);
      ok(undoBuilt.ok, 'plan undo hapus terbangun');
      if (undoBuilt.ok) {
        const ures = await executePlan(undoBuilt.plan, host);
        const restored = host.items.find((i) => i.description === 'Plesteran dinding');
        ok(ures.ok && restored?.volume === 200 && restored?.unitPrice === 51622, 'undo memulihkan isi item persis (ID baru dari aplikasi)');
      }
    }
  }
}

console.log('== Undo menolak menimpa perubahan lebih baru (F20) ==');
{
  const target = item({ description: 'Beton kolom', volume: 10, unitPrice: 1000000, totalPrice: 10000000 });
  const host = new FakeHost([target]);
  const built = buildUpdateQuantityPlan(snapOf(host.items), { nama: 'beton kolom' }, 12, ACTOR);
  if (built.ok) await executePlan(built.plan, host);
  host.applyUpdateQuantity(target.id, 99); // edit manual sesudah operasi asisten
  const rec = getLastUndoableRecord('P-OPS');
  ok(!!rec, 'record operasi update tersedia');
  if (rec) {
    const undoBuilt = buildUndoPlan(snapOf(host.items), rec, ACTOR);
    ok(!undoBuilt.ok, 'undo DITOLAK karena nilai sudah berubah lagi');
    ok(host.items[0].volume === 99, 'nilai terbaru tidak ditimpa undo');
  }
}

console.log('== Undo update jalur normal ==');
{
  const target = item({ description: 'Bekisting balok', volume: 50, unitPrice: 80000, totalPrice: 4000000 });
  const host = new FakeHost([target]);
  const built = buildUpdateUnitPricePlan(snapOf(host.items), { nama: 'bekisting' }, 95000, ACTOR);
  if (built.ok) {
    const res = await executePlan(built.plan, host);
    ok(res.ok && host.items[0].unitPrice === 95000, 'harga manual terapan 80.000→95.000');
  }
  const rec = getLastUndoableRecord('P-OPS');
  if (rec) {
    const undoBuilt = buildUndoPlan(snapOf(host.items), rec, ACTOR);
    ok(undoBuilt.ok, 'plan undo harga terbangun');
    if (undoBuilt.ok) {
      const ures = await executePlan(undoBuilt.plan, host);
      ok(ures.ok && host.items[0].unitPrice === 80000, 'undo mengembalikan harga asal');
      ok(getLastUndoableRecord('P-OPS')?.id !== rec.id, 'record yang sudah di-undo tidak ditawarkan lagi');
    }
  }
}

console.log('== Tambah item dari katalog (F11) ==');
{
  const host = new FakeHost([]);
  const built = buildAddPlan(snapOf(host.items), '1.1.4.2', 10, ACTOR);
  ok(built.ok, 'plan tambah kode valid terbangun');
  if (built.ok) {
    ok(built.plan.addItems?.[0]?.unitPrice === 155785, 'harga item baru dari resolver katalog (155.785)');
    const res = await executePlan(built.plan, host);
    ok(res.ok && host.items.length === 1 && host.items[0].code === '1.1.4.2', 'item baru masuk state dengan kode katalog');
    const rec = getLastUndoableRecord('P-OPS');
    ok((rec?.createdItemIds?.length ?? 0) === 1, 'ID item ciptaan tercatat untuk undo');
  }
  const bogus = buildAddPlan(snapOf(host.items), 'X.9.9.9', 1, ACTOR);
  ok(!bogus.ok && bogus.message.includes('tidak ditemukan di katalog'), 'kode karangan ditolak tanpa pemetaan');
}

console.log('== Persistensi gagal dilaporkan jujur (F19) ==');
{
  const target = item({ description: 'Pondasi batu kali', volume: 12, unitPrice: 450000, totalPrice: 5400000 });
  const host = new FakeHost([target]);
  host.persistence = 'error';
  const built = buildUpdateQuantityPlan(snapOf(host.items), { nama: 'pondasi' }, 15, ACTOR);
  if (built.ok) {
    const res = await executePlan(built.plan, host);
    ok(res.ok, 'perubahan state tetap terverifikasi');
    ok(res.message.includes('penyimpanan lokal melaporkan error'), 'kegagalan persistensi dinyatakan eksplisit di hasil');
    const rec = listOperationRecords('P-OPS').find((r) => r.summary.includes('Ubah kuantitas'));
    ok(rec?.persistence === 'error', 'record menandai persistence=error');
  }
}

console.log('== Gerbang peran pada tool propose_* (F-E) ==');
{
  const target = item({ description: 'Persiapan lahan', volume: 200, unitPrice: 50000, totalPrice: 10000000 });
  setActiveProjectSnapshot(snapOf([target]));
  setAssistantOperationContext(null);
  const denied = tool('propose_update_quantity')({ nama: 'persiapan', volume: 150 });
  ok(denied.includes('tidak aktif'), 'tanpa konteks peran: propose ditolak');
  setAssistantOperationContext({ actor: 'Klien', writesEnabled: false });
  const denied2 = tool('propose_update_quantity')({ nama: 'persiapan', volume: 150 });
  ok(denied2.includes('tidak aktif'), 'peran tanpa edit-estimate: propose ditolak');
  setAssistantOperationContext({ actor: ACTOR, writesEnabled: true });
  const preview = tool('propose_update_quantity')({ nama: 'persiapan', volume: 150 });
  ok(preview.includes('PRATINJAU OPERASI') && preview.includes('150'), 'peran berhak: pratinjau terbit');
  const hist = tool('get_operation_history')({});
  ok(hist.includes('Riwayat operasi Asisten AI') || hist.includes('Belum ada operasi'), 'tool riwayat menjawab dari log');
  setAssistantOperationContext(null);
  setActiveProjectSnapshot(null);
  const noSnap = tool('propose_update_quantity')({ nama: 'persiapan', volume: 150 });
  ok(noSnap.includes('Tidak ada proyek aktif'), 'tanpa snapshot: propose menolak dengan jujur');
}

console.log(`\nassistantOperations: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
