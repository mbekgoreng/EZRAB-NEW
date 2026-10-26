/**
 * EZRAB — UNIVERSAL DIRECT RAB AI — TEST SUITE (2026-10-26)
 *
 * Menguji modul src/ai-tools/ezrab-ai/universalRab.ts (draft RAB lintas
 * cakupan dari katalog template 180 + engine generate yang sudah ada),
 * wiring registry-nya, dan perbaikan provenance di rabItemFactory.
 *
 * Cakupan:
 *  1. Intent/ekstraksi: paving 300 m2, jalan beton 1 km, jembatan 12 m,
 *     drainase U-Ditch 500 m, gedung kantor 3 lantai, renovasi beranggaran
 *     Rp150 juta, irigasi tanpa ukuran (needs-spec), permintaan ambigu,
 *     rumah typed (TETAP jalur rumah, bukan universal), multi-cakupan.
 *  2. Data/kalkulasi: harga resmi vs database vs manual vs belum
 *     tersedia; pasar TIDAK pernah diklaim tanpa bukti; unpriced tidak
 *     pernah Rp0; total PARSIAL vs ESTIMASI; unit mismatch; tanpa
 *     duplikat; revisi parameter menghitung ulang.
 *  3. Transfer: preview (dengan/tanpa proyek), payload (satuan, kode,
 *     mapping, provenance), dedup, provenance factory.
 *  4. Registry: CREATE_RAB_SUMMARY non-rumah mengembalikan tombol
 *     push-universal; rumah tetap ringkasan; revisi dikenali.
 *
 * Yang TIDAK dibuktikan suite ini (perlu browser/QA manual): rendering
 * 390 px, klik ganda tombol Push di UI, konflik spreadsheet live,
 * Supabase/RLS, dan fetch pasar live (tidak ada — lihat §7 laporan).
 *
 * Jalankan: npx --yes tsx src/test/universalRab.test.ts
 */

import { strict as assert } from 'assert';
import {
  buildUniversalDraft,
  detectScopes,
  extractUniversalSpec,
  computeTotals,
  effectiveItems,
  displayPriceStatus,
  formatUniversalDraftMessage,
  formatUncertainItemsMessage,
  looksLikeUniversalRevision,
  reviseUniversalDraft,
  buildPushPreview,
  buildPushPayload,
  formatPushPreviewMessage,
  dedupePushPayload,
  type UniversalDraft,
  type UniversalDraftItem,
} from '../ai-tools/ezrab-ai/universalRab';
import { executeIntent, type ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';

// Mock localStorage for Node test environment (pola templateCatalog180.test.ts)
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
  },
};
(global as any).localStorage = (global as any).window.localStorage;

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

function ctxFor(rawText: string): ChatActionContext {
  return {
    navigate: () => undefined,
    rawText,
    currentMenu: 'chat-ai',
    activeProject: null,
    projects: [],
    projectTotal: null,
  } as unknown as ChatActionContext;
}

console.log('== 1. Intent / ekstraksi ==');

test('paving 300 m2 → draft PAV-KOMPLEK-6CM, luas 300, TANPA geometri terkaan', () => {
  const spec = extractUniversalSpec('Buatkan RAB jalan paving 300 m2');
  assert.equal(spec.areaM2, 300);
  assert.equal(spec.lengthM, null, 'panjang TIDAK boleh ditebak dari luas');
  assert.deepEqual(spec.scopes.map((s) => s.id), ['jalan']);
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  assert.equal(d.parts[0].template.id, 'PAV-KOMPLEK-6CM');
  assert.ok(effectiveItems(d).length >= 4, 'paving punya beberapa item, bukan 1');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(!/panjang\s+100\s*m/i.test(msg), 'pesan tidak boleh mengklaim panjang 100 m');
  assert.ok(!/keliling\s+kanstin\s+206/i.test(msg), 'pesan tidak boleh mengklaim keliling kanstin turunan');
});

test('jalan beton 1 km → panjang 1000 m, template INFRA-ROAD-RIGID', () => {
  const spec = extractUniversalSpec('Buat RAB jalan beton sepanjang 1 km');
  assert.equal(spec.lengthM, 1000);
  const d = draftOf('Buat RAB jalan beton sepanjang 1 km');
  assert.equal(d.parts[0].template.id, 'INFRA-ROAD-RIGID');
});

test('jembatan beton bentang 12 m → span 12, template BRG-GIRDER-20M', () => {
  const spec = extractUniversalSpec('Buat RAB jembatan beton bentang 12 meter');
  assert.equal(spec.spanM, 12);
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  assert.equal(d.parts[0].template.id, 'BRG-GIRDER-20M');
});

test('jembatan beton bentang 50 m → needs-spec (bukan substitusi baja diam-diam)', () => {
  const res = buildUniversalDraft('Buat RAB jembatan beton bentang 50 meter');
  assert.equal(res.kind, 'needs-spec');
  if (res.kind === 'needs-spec') assert.ok(res.missing.join(' ').includes('DED'));
});

test('drainase U-Ditch 500 m → panjang 500, template SDA-DRAIN-UDITCH', () => {
  const spec = extractUniversalSpec('Buat RAB saluran drainase U-Ditch sepanjang 500 meter');
  assert.equal(spec.lengthM, 500);
  const d = draftOf('Buat RAB saluran drainase U-Ditch sepanjang 500 meter');
  assert.equal(d.parts[0].template.id, 'SDA-DRAIN-UDITCH');
});

test('gedung kantor 3 lantai → lantai 3, template BLD-OFFICE-MULTI', () => {
  const spec = extractUniversalSpec('Buat RAB gedung kantor 3 lantai');
  assert.equal(spec.floors, 3);
  const d = draftOf('Buat RAB gedung kantor 3 lantai');
  assert.equal(d.parts[0].template.id, 'BLD-OFFICE-MULTI');
});

test('renovasi anggaran Rp150 juta → budgetCap 150.000.000 + perbandingan DI BAWAH', () => {
  const spec = extractUniversalSpec('Buat RAB renovasi rumah dengan anggaran Rp150 juta');
  assert.equal(spec.budgetCap, 150_000_000);
  const d = draftOf('Buat RAB renovasi rumah dengan anggaran Rp150 juta');
  assert.equal(d.spec.budgetCap, 150_000_000);
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('Rp 150.000.000'), 'pesan menampilkan anggaran');
  assert.ok(msg.includes('DI BAWAH'), 'estimasi di bawah anggaran harus dinyatakan');
});

test('irigasi tanpa ukuran → needs-spec dengan SATU pertanyaan ukuran utama', () => {
  const res = buildUniversalDraft('Buat RAB pekerjaan irigasi');
  assert.equal(res.kind, 'needs-spec');
  if (res.kind === 'needs-spec') {
    assert.equal(res.missing.length, 1, 'satu pertanyaan paling penting saja');
    assert.ok(res.missing[0].includes('panjang') || res.missing[0].includes('luas'));
  }
});

test('permintaan terlalu ambigu → unsupported (jalur klarifikasi lama yang memiliki)', () => {
  const res = buildUniversalDraft('Buatkan RAB');
  assert.equal(res.kind, 'unsupported');
});

test('rumah typed T70 2 lantai → unsupported (TETAP jalur rumah directRab/specRab)', () => {
  const res = buildUniversalDraft('Buatkan RAB rumah type 70 2 lantai');
  assert.equal(res.kind, 'unsupported');
  assert.deepEqual(detectScopes('Buatkan RAB rumah type 70 2 lantai').map((s) => s.id), []);
});

test('multi-cakupan pondasi+struktur+atap+finishing → 4 part, 1 draft', () => {
  const d = draftOf('Buat RAB pekerjaan pondasi, struktur beton, atap, dan finishing luas 200 m2');
  assert.equal(d.parts.length, 4);
  assert.ok(effectiveItems(d).length > 20, 'multi-cakupan menghasilkan banyak item');
});

console.log('== 2. Data / kalkulasi / provenance harga ==');

test('harga resmi tersedia: draft jembatan punya verifiedTotal > 0 dan officialCount > 0', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const t = computeTotals(d);
  assert.ok(t.officialCount > 0, 'setidaknya satu item OFFICIAL');
  assert.ok(t.verifiedTotal > 0);
});

test('harga non-resmi paving = REFERENSI PASAR (bukan database): marketCount > 0, verifiedTotal = 0, status ESTIMASI', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const t = computeTotals(d);
  assert.ok(t.marketCount > 0, 'draft paving mengandung harga referensi pasar dari tabel tersimpan');
  assert.equal(t.verifiedTotal, 0, 'tidak ada harga pasar yang masuk total terverifikasi');
  assert.ok(t.estimatedTotal > 0);
  assert.equal(t.status, 'ESTIMASI', 'draft tanpa item resmi = ESTIMASI, bukan FINAL/RESMI');
  // Ember database murni (asumsi/legacy) kosong pada draft ini — ditegaskan,
  // bukan disembunyikan: semua harga non-resmi di sini adalah pasar.
  assert.equal(t.databaseCount, 0);
});

test('referensi pasar: item MARKET_REFERENCE dilabeli REFERENSI PASAR, masuk ember pasar, TIDAK PERNAH terverifikasi', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const market = effectiveItems(d).filter((i) => i.priceSourceKind === 'MARKET_REFERENCE');
  assert.ok(market.length >= 1, 'draft paving mengandung item referensi pasar dari tabel tersimpan');
  const t = computeTotals(d);
  assert.equal(t.marketCount, market.length);
  assert.ok(t.marketTotal > 0);
  for (const it of market) {
    assert.equal(displayPriceStatus(it).label, 'REFERENSI PASAR');
    assert.notEqual(it.priceSourceKind, 'OFFICIAL_AHSP');
  }
  // Total terverifikasi hanya menjumlah OFFICIAL — pasar tidak menggelembungkannya.
  const verifiedSum = effectiveItems(d)
    .filter((i) => i.priceSourceKind === 'OFFICIAL_AHSP' && i.unitPrice != null)
    .reduce((acc, i) => acc + i.volume * (i.unitPrice as number), 0);
  assert.ok(Math.abs(t.verifiedTotal - verifiedSum) < 1);
});

test('harga tidak ditemukan: jembatan punya item unpriced, status PARSIAL, "Harga belum tersedia"', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const t = computeTotals(d);
  assert.ok(t.unpricedCount >= 1);
  assert.equal(t.status, 'PARSIAL');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('Harga belum tersedia'));
  assert.ok(!msg.includes('Rp0'), 'tidak boleh ada Rp0 untuk item tanpa harga');
});

test('total hanya menjumlah item berharga: estimatedTotal = Σ volume × harga item berharga', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const t = computeTotals(d);
  const sum = effectiveItems(d).reduce(
    (acc, i) => acc + (i.unitPrice != null ? i.volume * i.unitPrice : 0), 0
  );
  assert.ok(Math.abs(t.estimatedTotal - sum) < 1, `estimatedTotal ${t.estimatedTotal} ≠ Σ ${sum}`);
});

test('label harga: RESMI / DATABASE / MANUAL / BELUM TERSEDIA terpisah dengan benar', () => {
  const base: UniversalDraftItem = {
    id: 'x', description: 'Uji', volume: 1, unit: 'm2', unitPrice: 1000,
    priceStatus: 'PRICE_RESOLVED', ahspCode: null, ahspMappingStatus: 'NEEDS_MAPPING',
  };
  assert.equal(displayPriceStatus({ ...base, priceSourceKind: 'OFFICIAL_AHSP' }).label, 'RESMI AHSP');
  assert.equal(displayPriceStatus({ ...base, priceSourceKind: 'EZRAB_ASSUMPTION' }).label, 'HARGA DATABASE');
  assert.equal(displayPriceStatus({ ...base, priceSourceKind: 'MARKET_REFERENCE' }).label, 'REFERENSI PASAR');
  assert.equal(displayPriceStatus({ ...base, unitPrice: 1000, priceStatus: 'PRICE_MANUAL' }).label, 'HARGA MANUAL');
  assert.equal(displayPriceStatus({ ...base, unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' }).label, 'BELUM TERSEDIA');
});

test('unit mismatch → HARGA DATABASE, tidak pernah RESMI AHSP', () => {
  const item: UniversalDraftItem = {
    id: 'x', description: 'Uji mismatch', volume: 1, unit: 'm2', unitPrice: 1000,
    priceStatus: 'PRICE_RESOLVED', ahspCode: '3.7.4', ahspMappingStatus: 'UNIT_MISMATCH',
    priceSourceKind: 'EZRAB_ASSUMPTION',
  };
  const disp = displayPriceStatus(item);
  assert.equal(disp.label, 'HARGA DATABASE');
  assert.ok(disp.detail.includes('UNIT_MISMATCH'));
});

test('tanpa duplikat: id item unik di dalam draft (jembatan & multi-cakupan)', () => {
  for (const text of [
    'Buat RAB jembatan beton bentang 12 meter',
    'Buat RAB pekerjaan pondasi, struktur beton, atap, dan finishing luas 200 m2',
  ]) {
    const d = draftOf(text);
    const ids = effectiveItems(d).map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, `duplikat id pada "${text}"`);
  }
});

console.log('== 3. Revisi interaktif ==');

test('revisi luas 300 → 600 m2: total berubah naik, versi +1, id draft sama', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const before = computeTotals(d).estimatedTotal;
  const idBefore = d.id;
  const rev = reviseUniversalDraft(d, 'ubah luas menjadi 600 m2');
  assert.ok(rev, 'revisi dikenali');
  assert.equal(rev.ok, true);
  assert.equal(d.version, 2, 'revisi memutasi draft in-place dan menaikkan versi');
  assert.equal(d.id, idBefore);
  assert.equal(d.spec.areaM2, 600);
  assert.ok(computeTotals(d).estimatedTotal > before, 'total harus naik saat luas digandakan');
});

test('revisi hapus item 1: jumlah item berkurang 1, versi +1', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const before = effectiveItems(d).length;
  const rev = reviseUniversalDraft(d, 'hapus item 1');
  assert.ok(rev && rev.ok);
  assert.equal(effectiveItems(d).length, before - 1);
  assert.equal(d.version, 2);
});

test('revisi harga manual: item 1 menjadi PRICE_MANUAL Rp500.000, masuk manualTotal', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const rev = reviseUniversalDraft(d, 'gunakan harga manual Rp 500.000 untuk item 1');
  assert.ok(rev && rev.ok);
  const first = effectiveItems(d)[0];
  assert.equal(first.unitPrice, 500_000);
  assert.equal(first.priceStatus, 'PRICE_MANUAL');
  assert.ok(computeTotals(d).manualTotal >= 500_000);
});

test('revisi ganti varian: paving → industri mengganti template part', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const rev = reviseUniversalDraft(d, 'ganti paving menjadi industri');
  assert.ok(rev && rev.ok);
  assert.equal(d.parts[0].template.id, 'PAV-INDUSTRI-8CM');
});

test('tampilkan item belum pasti: pesan memuat daftar + kata "belum pasti"', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const rev = reviseUniversalDraft(d, 'tampilkan item yang belum pasti');
  assert.ok(rev && rev.ok);
  assert.ok(rev.message.includes('belum pasti'));
  assert.ok(rev.message.length > 50);
});

test('hitung ulang total: versi +1 dan pesan konfirmasi', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const rev = reviseUniversalDraft(d, 'hitung ulang total');
  assert.ok(rev && rev.ok);
  assert.equal(d.version, 2);
  assert.ok(rev.message.includes('dihitung ulang'));
});

test('deteksi revisi: revisi dikenali, permintaan RAB baru & navigasi tidak', () => {
  assert.equal(looksLikeUniversalRevision('ubah luas menjadi 120 m2'), true);
  assert.equal(looksLikeUniversalRevision('hapus item 3'), true);
  assert.equal(looksLikeUniversalRevision('buatkan RAB jalan baru'), false);
  assert.equal(looksLikeUniversalRevision('buka spreadsheet'), false);
});

test('formatUncertainItemsMessage memuat item tanpa harga draft jembatan', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUncertainItemsMessage(d);
  assert.ok(msg.includes('belum pasti') || msg.includes('Harga belum tersedia'));
});

console.log('== 4. Transfer: preview, payload, dedup, provenance factory ==');

test('preview: jumlah item & total cocok dengan draft; tanpa proyek → "belum ada proyek aktif"', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const pv = buildPushPreview(d);
  assert.equal(pv.itemCount, effectiveItems(d).length);
  assert.equal(pv.unpricedItems.length, computeTotals(d).unpricedCount);
  const msg = formatPushPreviewMessage(d, pv, null);
  assert.ok(msg.includes('belum ada proyek aktif'));
  assert.ok(msg.includes('Konfirmasi Transfer') || msg.includes('konfirmasi'));
});

test('payload mempertahankan satuan, kode, mapping, provenance; unpriced → PRICE_UNRESOLVED tanpa unitPrice', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  assert.equal(payload.length, effectiveItems(d).length);
  const unpriced = payload.filter((p) => p.priceStatus === 'PRICE_UNRESOLVED');
  assert.ok(unpriced.length >= 1);
  for (const p of unpriced) assert.equal(p.unitPrice, undefined, 'unpriced tidak boleh membawa unitPrice');
  const priced = payload.find((p) => p.priceStatus === 'PRICE_RESOLVED');
  assert.ok(priced, 'ada item berharga');
  assert.ok(priced.unit && priced.description);
  assert.ok('ahspCode' in priced || 'code' in priced, 'payload membawa kode');
  assert.ok('ahspMappingStatus' in priced, 'payload membawa status pemetaan');
  assert.ok('priceSourceName' in priced || 'priceSourceKind' in priced, 'payload membawa provenance');
});

test('payload harga manual mempertahankan PRICE_MANUAL', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const rev = reviseUniversalDraft(d, 'gunakan harga manual Rp 500.000 untuk item 1');
  assert.ok(rev && rev.ok);
  const payload = buildPushPayload(d);
  assert.equal(payload[0].priceStatus, 'PRICE_MANUAL');
  assert.equal(payload[0].unitPrice, 500_000);
});

test('dedup: item yang sudah ada di spreadsheet dilewati (kode+uraian)', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const payload = buildPushPayload(d);
  const existing = [{ code: payload[0].code, description: payload[0].description.replace(/^\[Chat AI\] /, '') }];
  const { newItems, dupCount } = dedupePushPayload(payload, existing);
  assert.equal(dupCount, 1);
  assert.equal(newItems.length, payload.length - 1);
});

test('factory: provenance diteruskan ke record; PRICE_UNRESOLVED tetap menolkan harga', () => {
  const rec = createRabItemRecord({
    code: 'TEST-1', description: 'Uji provenance', volume: 10, unit: 'm2',
    unitPrice: 12345, priceStatus: 'PRICE_RESOLVED',
    priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: 'RESMI AHSP',
    priceSourceName: 'AHSP 2026', ahspMappingStatus: 'VERIFIED',
  } as never);
  assert.equal((rec as { priceSourceKind?: string }).priceSourceKind, 'OFFICIAL_AHSP');
  assert.equal((rec as { priceSourceName?: string | null }).priceSourceName, 'AHSP 2026');
  assert.equal((rec as { ahspMappingStatus?: string }).ahspMappingStatus, 'VERIFIED');
  const unpriced = createRabItemRecord({
    code: 'TEST-2', description: 'Tanpa harga', volume: 5, unit: 'm2',
    unitPrice: 9999, priceStatus: 'PRICE_UNRESOLVED',
  } as never);
  assert.equal(unpriced.unitPrice, 0, 'PRICE_UNRESOLVED menolkan harga di record (sentinel lama dipertahankan)');
});

console.log('== 5. Registry wiring ==');

test('CREATE_RAB_SUMMARY jalan beton → draft + tombol push-universal', () => {
  const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Buat RAB jalan beton sepanjang 1 km'));
  assert.equal(res.ok, true);
  assert.ok(res.message.includes('| No |'), 'pesan memuat tabel markdown');
  assert.ok(res.actions?.some((a) => a.action.kind === 'push-universal'), 'tombol push-universal ada');
  assert.ok(res.actions?.some((a) => a.action.kind === 'push-universal-confirm') === false, 'konfirmasi TIDAK langsung tampil (preview dulu)');
});

test('CREATE_RAB_SUMMARY rumah → ringkasan, TANPA tombol push-universal (jalur rumah utuh)', () => {
  const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab rumah tinggal di bogor'));
  assert.equal(res.ok, true);
  assert.ok(!res.actions?.some((a) => a.action.kind === 'push-universal'));
});

test('CREATE_RAB_DIRECT rumah typed → choice card, TANPA push-universal', () => {
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('Buatkan RAB rumah type 70 2 lantai'));
  assert.equal(res.ok, true);
  assert.ok(!res.actions?.some((a) => a.action.kind === 'push-universal'));
});

test('pesan draft memuat header (judul, tipe proyek, status) + footer (total terverifikasi/estimasi)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes(d.title));
  assert.ok(msg.includes('Total terverifikasi'));
  assert.ok(msg.includes('Total estimasi'));
  assert.ok(msg.includes('| No |'));
});

console.log(`\nUNIVERSAL RAB: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
