/**
 * EZRAB — UNIVERSAL DIRECT RAB AI — HARDENING SUITE FASE 2+3 (2026-10-26)
 *
 * Menguji penguatan di src/ai-tools/ezrab-ai/universalRab.ts TANPA mengubah
 * kontrak penyimpanan lama (rabItemFactory tidak diubah: sentinel
 * unitPrice 0 untuk PRICE_UNRESOLVED dipertahankan, digating status).
 *
 * Cakupan:
 *  1. Provenance: metadata pasar yang hilang (D1a = keputusan owner, bukan
 *     karangan), label diteruskan payload, manual tidak membawa kind resmi,
 *     round-trip factory.
 *  2. Sentinel nol: PRICE_UNRESOLVED + unitPrice 0 tidak pernah tampil /
 *     terhitung sebagai harga valid (display, computeTotals, ekspor-level).
 *  3. Scoring: kata yang tidak disebut tidak berbobot nama; skor
 *     berdekatan dicatat sebagai asumsi; konflik jenis bangunan dipenalti;
 *     parameter di luar batas → peringatan + BLOCKED (kritis).
 *  4. Spesifikasi kritis: jembatan tanpa material / pondasi generik /
 *     struktur di luar batas → BLOCKED + payload melempar; revisi yang
 *     melengkapi membuka blokir.
 *  5. Multi-cakupan: tumpang tindih, box culvert + jembatan, dedup template
 *     sama (forced id).
 *  6. Revisi: manual bertahan saat ukuran diubah; ganti template menyatakan
 *     reset manual/hapus; tambah donor berulang tidak menggandakan.
 *  7. Transfer: preview memisah subtotal + nilai belum dapat dihitung;
 *     validateTransfer (tanpa proyek / blokir / receipt / pindah proyek);
 *     dedup kunci spesifik; simulasi retry sesudah partial write.
 *  8. Kompatibilitas: rumah typed tetap bukan universal (directRab/specRab
 *     tidak disentuh).
 *
 * Yang TIDAK dibuktikan suite ini (butuh UI/backend live): klik ganda
 * tombol di browser, bulkAddRabItems yang gagal DI TENGAH penulisan
 * (hanya simulasi retry-nya di level dedup), Supabase/RLS, dan tampilan
 * spreadsheet/ekspor (view.tsx di luar pagar — helper summarizeStoredItems
 * disediakan untuk jalur itu).
 *
 * Jalankan: npx --yes tsx src/test/universalRabHardening.test.ts
 */

import { strict as assert } from 'assert';
import {
  buildUniversalDraft,
  draftReadiness,
  partIssues,
  pickTemplateForScope,
  extractUniversalSpec,
  computeTotals,
  effectiveItems,
  displayPriceStatus,
  formatUniversalDraftMessage,
  reviseUniversalDraft,
  buildPushPreview,
  buildPushPayload,
  formatPushPreviewMessage,
  dedupePushPayload,
  validateTransfer,
  applyTransferReceipt,
  isPriceValidForTotal,
  pricedAmount,
  summarizeStoredItems,
  type UniversalDraft,
  type UniversalDraftItem,
} from '../ai-tools/ezrab-ai/universalRab';
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

function draftOf(text: string, forcedTemplateId?: string): UniversalDraft {
  const res = buildUniversalDraft(text, forcedTemplateId);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

console.log('== 1. Provenance: metadata hilang, label payload, manual, round-trip ==');

test('D1a: item MARKET_REFERENCE paving priceSourceName null; pesan menyatakan ketiadaan tanggal/wilayah, tanpa "harga terkini" karangan', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const market = effectiveItems(d).filter((i) => i.priceSourceKind === 'MARKET_REFERENCE');
  assert.ok(market.length >= 1);
  assert.ok(market.every((i) => i.priceSourceName == null), 'katalog memang tidak membawa nama sumber pasar');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('TIDAK mencatat nama, tanggal, atau wilayah'), 'ketiadaan metadata dinyatakan eksplisit');
  // Frasa "harga terkini" hanya boleh muncul dalam bentuk negasi yang
  // dikutip ("bukan \"harga terkini\"), bukan sebagai klaim.
  assert.ok(!/harga terkini(?!")/i.test(msg), 'tidak boleh ada klaim harga terkini (di luar negasi yang dikutip)');
  assert.ok(!/28 Sep 2026/.test(msg), 'tidak boleh ada tanggal karangan');
});

test('D1: payload meneruskan priceSourceLabel untuk item resmi (payload lama membuangnya)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  const official = payload.find((p) => p.priceSourceKind === 'OFFICIAL_AHSP');
  assert.ok(official, 'ada item resmi di payload');
  assert.equal(official.priceSourceLabel, 'Harga Resmi AHSP 2026');
});

test('D1b: revisi manual pada item RESMI → payload PRICE_MANUAL TANPA kind OFFICIAL (tidak naik jadi resmi)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const items0 = effectiveItems(d);
  const officialBefore = items0.find((i) => i.priceSourceKind === 'OFFICIAL_AHSP');
  assert.ok(officialBefore, 'draft jembatan punya item resmi');
  const idx = items0.findIndex((i) => i.description === officialBefore.description);
  const rev = reviseUniversalDraft(d, `gunakan harga manual Rp 900.000 untuk item ${idx + 1}`);
  assert.ok(rev && rev.ok);
  const payload = buildPushPayload(d);
  const manual = payload.find((p) => p.description.includes(officialBefore.description));
  assert.ok(manual, 'item manual ada di payload');
  assert.equal(manual.priceStatus, 'PRICE_MANUAL');
  assert.equal(manual.priceSourceKind, undefined, 'kind resmi lama tidak boleh ikut bersama status manual');
  assert.equal(manual.priceSourceLabel, 'Harga manual pengguna');
  assert.equal(displayPriceStatus(effectiveItems(d).find((i) => i.description === officialBefore.description)!).label, 'HARGA MANUAL');
});

test('D1: round-trip factory — provenance payload bertahan; unpriced jadi sentinel + NEEDS_VERIFICATION', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  const records = payload.map((p, i) => createRabItemRecord(p as never, 'proj-test', { index: i }));
  const official = records.find((r) => (r as { priceSourceKind?: string }).priceSourceKind === 'OFFICIAL_AHSP');
  assert.ok(official, 'kind resmi bertahan lewat factory');
  assert.equal((official as { priceSourceName?: string | null }).priceSourceName, (payload.find((p) => p.priceSourceKind === 'OFFICIAL_AHSP') as { priceSourceName?: string | null }).priceSourceName);
  const unresolved = records.filter((r) => r.priceStatus === 'PRICE_UNRESOLVED');
  assert.ok(unresolved.length >= 1, 'ada record unresolved pasca-transfer');
  for (const r of unresolved) {
    assert.equal(r.unitPrice, 0, 'sentinel lama dipertahankan di penyimpanan');
    assert.equal(r.verificationStatus, 'NEEDS_VERIFICATION');
  }
});

console.log('== 2. Sentinel nol: tidak pernah tampil/hitung sebagai harga valid ==');

test('AUDIT SENTINEL: record unresolved (unitPrice 0 + kind OFFICIAL usang) tampil BELUM TERSEDIA, bukan RESMI', () => {
  const rec = createRabItemRecord({
    code: 'X', description: 'Item usang', volume: 10, unit: 'm2',
    unitPrice: 0, priceStatus: 'PRICE_UNRESOLVED',
    priceSourceKind: 'OFFICIAL_AHSP',
  } as never, 'proj-test');
  assert.equal(rec.unitPrice, 0);
  assert.equal(displayPriceStatus(rec).label, 'BELUM TERSEDIA');
});

test('AUDIT SENTINEL: computeTotals menggating status — item diubah jadi UNRESOLVED+0 dihitung belum berharga', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const before = computeTotals(d);
  const priced = d.parts[0].generation.items.find((i) => i.unitPrice != null)!;
  const amountBefore = priced.volume * (priced.unitPrice as number);
  priced.unitPrice = 0;
  (priced as { priceStatus?: string }).priceStatus = 'PRICE_UNRESOLVED';
  const after = computeTotals(d);
  assert.equal(after.unpricedCount, before.unpricedCount + 1);
  assert.ok(Math.abs(after.estimatedTotal - (before.estimatedTotal - amountBefore)) < 1, 'total berkurang sebesar jumlah item itu, bukan diam-diam nol');
  assert.equal(isPriceValidForTotal(priced), false);
  assert.equal(pricedAmount(priced), null);
});

test('AUDIT SENTINEL: summarizeStoredItems (level ekspor) mengecualikan sentinel dari total', () => {
  const summary = summarizeStoredItems([
    { volume: 10, priceStatus: 'PRICE_RESOLVED', unitPrice: 1000, priceSourceKind: 'OFFICIAL_AHSP' },
    { volume: 5, priceStatus: 'PRICE_UNRESOLVED', unitPrice: 0, priceSourceKind: 'OFFICIAL_AHSP' },
    { volume: 2, priceStatus: 'PRICE_RESOLVED', unitPrice: 500, priceSourceKind: 'MARKET_REFERENCE' },
  ]);
  assert.equal(summary.pricedTotal, 11000, '10×1000 + 2×500; sentinel 0 tidak menambah, tapi juga tidak dihitung sebagai harga');
  assert.equal(summary.unpricedCount, 1);
  assert.equal(summary.status, 'PARSIAL');
  assert.equal(summary.verifiedTotal, 10000);
  assert.equal(summary.marketTotal, 1000);
});

console.log('== 3. Scoring: nama hanya dari kata pengguna, skor berdekatan, konflik jenis ==');

test('D2: kata cakupan yang TIDAK disebut tidak berbobot nama — paving tetap KOMPLEK, bukan ASPHALT', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  assert.equal(d.parts[0].template.id, 'PAV-KOMPLEK-6CM');
  const d2 = draftOf('Buat RAB jalan aspal sepanjang 500 meter');
  assert.equal(d2.parts[0].template.id, 'INFRA-ROAD-ASPHALT');
});

test('D2: material disebut menentukan — atap baja ringan → METAL, bukan genteng', () => {
  const d = draftOf('Buat RAB atap baja ringan luas 120 m2');
  assert.equal(d.parts[0].template.id, 'ROOF-METAL-STANDING');
  const d2 = draftOf('Buat RAB atap genteng luas 120 m2');
  assert.equal(d2.parts[0].template.id, 'ROOF-TILE-PREMIUM');
});

test('D2: skor berdekatan dicatat — paving closeCall margin 0 + alternatif di asumsi', () => {
  const spec = extractUniversalSpec('Buatkan RAB jalan paving 300 m2');
  const res = pickTemplateForScope(spec, spec.scopes[0]);
  assert.equal(res.pick?.template.id, 'PAV-KOMPLEK-6CM');
  assert.equal(res.closeCall, true, 'tiga paving seri — pilihan diakui tidak tegas');
  assert.equal(res.scoreMargin, 0);
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  assert.ok(d.assumptions.some((a) => a.includes('alternatif') && a.includes('Heavy Duty')), 'alternatif (template industri) tercantum di asumsi');
});

test('D2: drainase U-Ditch kini menang jelas (margin > 3), bukan seri', () => {
  const spec = extractUniversalSpec('Buat RAB saluran drainase U-Ditch sepanjang 500 meter');
  const res = pickTemplateForScope(spec, spec.scopes[0]);
  assert.equal(res.pick?.template.id, 'SDA-DRAIN-UDITCH');
  assert.equal(res.closeCall, false);
  assert.ok(res.scoreMargin >= 4);
});

test('D2: konflik jenis bangunan dipenalti — gedung sekolah bukan template kantor', () => {
  const d = draftOf('Buat RAB gedung sekolah 3 lantai');
  assert.ok(!/kantor|perkantoran/i.test(d.parts[0].template.name), 'template kantor tidak boleh menang untuk sekolah');
  assert.ok(/sekolah|edu/i.test(d.parts[0].template.id), 'template sekolah yang menang');
  const kantor = draftOf('Buat RAB gedung kantor 3 lantai');
  assert.equal(kantor.parts[0].template.id, 'BLD-OFFICE-MULTI');
});

console.log('== 4. Spesifikasi kritis & batas parameter: BLOCKED + buka blokir lewat revisi ==');

test('D2: struktur luas 200 m2 di luar batas (min 300) → BLOCKED, payload melempar, preview memblokir', () => {
  const d = draftOf('Buat RAB struktur beton luas 200 m2');
  const issues = partIssues(d.parts[0], d.spec);
  assert.ok(issues.criticalOutOfRange.length >= 1, 'out-of-range pada ukuran relevan tercatat');
  assert.ok(issues.criticalOutOfRange[0].includes('300'));
  const readiness = draftReadiness(d);
  assert.equal(readiness.status, 'BLOCKED');
  assert.throws(() => buildPushPayload(d), /diblokir untuk transfer/i);
  assert.equal(validateTransfer(d, 'proj-1').allowed, false);
  const pv = buildPushPreview(d);
  assert.equal(pv.transferBlocked, true);
  assert.ok(pv.blockReasons.length >= 1);
  const msg = formatPushPreviewMessage(d, pv, 'Proyek Tes');
  assert.ok(msg.includes('DIBLOKIR'));
  assert.ok(!msg.includes('Tekan **Konfirmasi Transfer**'), 'tombol konfirmasi tidak ditawarkan untuk draft blokir');
});

test('D2: revisi yang melengkapi membuka blokir — struktur 200 → 800 m2 jadi READY + payload lolos', () => {
  const d = draftOf('Buat RAB struktur beton luas 200 m2');
  assert.equal(draftReadiness(d).status, 'BLOCKED');
  const rev = reviseUniversalDraft(d, 'ubah luas menjadi 800 m2');
  assert.ok(rev && rev.ok);
  assert.equal(draftReadiness(d).status, 'READY');
  const payload = buildPushPayload(d);
  assert.ok(payload.length > 0);
});

test('D2: jembatan tanpa material → BLOCKED (bukan draft generik yang bisa transfer)', () => {
  const d = draftOf('Buat RAB jembatan bentang 12 meter');
  assert.equal(draftReadiness(d).status, 'BLOCKED');
  assert.ok(draftReadiness(d).blockedReasons.some((r) => r.includes('Material struktur jembatan')));
  assert.throws(() => buildPushPayload(d), /diblokir untuk transfer/i);
});

test('D2: pondasi generik tanpa jenis → BLOCKED (bukan desain geoteknik final)', () => {
  const d = draftOf('Buat RAB pondasi luas 200 m2');
  assert.equal(draftReadiness(d).status, 'BLOCKED');
  assert.ok(draftReadiness(d).blockedReasons.some((r) => r.includes('Jenis pondasi')));
});

test('D2: jembatan beton 50 m tetap needs-spec (penjaga bentang tidak didemosi)', () => {
  const res = buildUniversalDraft('Buat RAB jembatan beton bentang 50 meter');
  assert.equal(res.kind, 'needs-spec');
});

console.log('== 5. Multi-cakupan: tumpang tindih, box culvert, dedup template ==');

test('D2: drainase + sanitasi U-Ditch → peringatan tumpang tindih (bukan diam-diam ganda)', () => {
  const d = draftOf('Buat RAB pekerjaan drainase dan sanitasi sepanjang 500 meter');
  assert.equal(d.parts.length, 2);
  assert.ok(d.warnings.some((w) => w.includes('tumpang tindih') && w.includes('uditch')), 'peringatan menyebut token bersama');
});

test('D2: box culvert jembatan → peringatan dua part (jembatan DAN gorong-gorong)', () => {
  const d = draftOf('Buat RAB box culvert jembatan bentang 8 meter');
  assert.ok(d.warnings.some((w) => w.includes('box culvert') && w.includes('jembatan')), 'peringatan frasa majemuk ada');
});

test('D2: dua cakupan satu template (forced id) → part digabung, bukan digandakan', () => {
  const d = draftOf('Buat RAB pekerjaan pondasi, struktur beton luas 200 m2', 'STR-PRECAST-FRAME');
  assert.equal(d.parts.length, 1, 'part kedua dengan template sama digabung');
  assert.ok(d.warnings.some((w) => w.includes('digabung agar tidak ganda')));
});

console.log('== 6. Revisi: provenance bertahan, reset dinyatakan, donor tidak ganda ==');

test('D4: harga manual bertahan saat ukuran diubah (revisi berulang tidak menghapus provenance)', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const firstDesc = effectiveItems(d)[0].description;
  const rev1 = reviseUniversalDraft(d, 'gunakan harga manual Rp 500.000 untuk item 1');
  assert.ok(rev1 && rev1.ok);
  const rev2 = reviseUniversalDraft(d, 'ubah luas menjadi 600 m2');
  assert.ok(rev2 && rev2.ok);
  const kept = effectiveItems(d).find((i) => i.description === firstDesc);
  assert.ok(kept, 'item masih ada sesudah revisi ukuran');
  assert.equal(kept.priceStatus, 'PRICE_MANUAL');
  assert.equal(kept.unitPrice, 500_000);
  assert.equal(d.version, 3, 'dua revisi = versi 3');
});

test('D4: ganti template menyatakan reset manual/hapus secara eksplisit + id draft dipertahankan', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const idBefore = d.id;
  const rev1 = reviseUniversalDraft(d, 'gunakan harga manual Rp 500.000 untuk item 1');
  assert.ok(rev1 && rev1.ok);
  const rev2 = reviseUniversalDraft(d, 'ganti paving menjadi industri');
  assert.ok(rev2 && rev2.ok);
  assert.ok(d.changes.some((c) => c.includes('TIDAK diteruskan')), 'reset dicatat di riwayat');
  assert.equal(computeTotals(d).manualCount, 0, 'manual lama tidak menempel di template baru');
  assert.equal(d.id, idBefore, 'id draft dipertahankan melintasi ganti template');
});

test('D4: tambah donor berulang tidak menggandakan item (versi tidak naik pada penolakan)', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const rev1 = reviseUniversalDraft(d, 'tambah kanstin');
  assert.ok(rev1 && rev1.ok);
  const countAfterFirst = effectiveItems(d).length;
  const versionAfterFirst = d.version;
  const rev2 = reviseUniversalDraft(d, 'tambah kanstin');
  assert.ok(rev2 && !rev2.ok, 'tambah kedua ditolak');
  assert.equal(rev2.changed, false);
  assert.equal(effectiveItems(d).length, countAfterFirst);
  assert.equal(d.version, versionAfterFirst, 'penolakan tidak menaikkan versi');
});

console.log('== 7. Preview & transfer: subtotal terpisah, receipt, dedup spesifik ==');

test('FASE 3: preview memisah subtotal resmi/pasar/database/manual + nilai belum dapat dihitung', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const pv = buildPushPreview(d);
  const t = computeTotals(d);
  assert.equal(pv.verifiedTotal, t.verifiedTotal);
  assert.equal(pv.marketTotal, t.marketTotal);
  assert.ok(pv.marketTotal > 0 && pv.verifiedTotal > 0, 'campuran resmi+pasar benar-benar terpisah');
  assert.equal(pv.unpricedCount, t.unpricedCount);
  assert.ok(pv.unpricedCount >= 1);
  assert.equal(pv.totalsStatus, 'PARSIAL');
  const msg = formatPushPreviewMessage(d, pv, 'Proyek Tes');
  assert.ok(msg.includes('BELUM DAPAT DIHITUNG'));
  assert.ok(msg.includes('Total referensi pasar'));
  assert.ok(!msg.includes('Rp0'), 'tidak ada literal Rp0 di preview');
});

test('FASE 3: validateTransfer — tanpa proyek ditolak; draft siap + proyek diizinkan', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  assert.equal(validateTransfer(d, null).allowed, false);
  assert.equal(validateTransfer(d, '').allowed, false);
  const ok = validateTransfer(d, 'proj-1');
  assert.equal(ok.allowed, true);
  assert.equal(ok.duplicate, false);
});

test('FASE 3: receipt mengikat projectId+versi — klik ganda ditolak, pindah proyek diizinkan', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  applyTransferReceipt(d, 'proj-1', 6, 0);
  const same = validateTransfer(d, 'proj-1');
  assert.equal(same.allowed, false);
  assert.equal(same.duplicate, true);
  const other = validateTransfer(d, 'proj-2');
  assert.equal(other.allowed, true, 'proyek berbeda bukan duplikat — receipt mengikat per proyek');
  assert.equal(other.duplicate, false);
});

test('FASE 3: dedup kunci spesifik — beda satuan/volume bukan duplikat; sama persis duplikat; legacy fallback tetap jalan', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const payload = buildPushPayload(d);
  const first = payload[0];
  const exactExisting = [{ code: first.code, description: first.description.replace(/^\[Chat AI\] /, ''), unit: first.unit, volume: first.volume }];
  const r1 = dedupePushPayload(payload, exactExisting);
  assert.equal(r1.dupCount, 1);
  assert.equal(r1.newItems.length, payload.length - 1);
  const diffUnit = [{ code: first.code, description: first.description.replace(/^\[Chat AI\] /, ''), unit: 'unit', volume: first.volume }];
  const r2 = dedupePushPayload(payload, diffUnit);
  assert.equal(r2.dupCount, 0, 'satuan berbeda = item berbeda, tidak boleh dihapus');
  const diffVol = [{ code: first.code, description: first.description.replace(/^\[Chat AI\] /, ''), unit: first.unit, volume: (first.volume as number) + 10 }];
  const r3 = dedupePushPayload(payload, diffVol);
  assert.equal(r3.dupCount, 0, 'volume berbeda = item berbeda, tidak boleh dihapus');
  const legacy = [{ code: first.code, description: first.description.replace(/^\[Chat AI\] /, '') }];
  const r4 = dedupePushPayload(payload, legacy);
  assert.equal(r4.dupCount, 1, 'pemanggil lama tanpa satuan/volume tetap memakai kunci lama');
});

test('FASE 3: dedup internal payload + simulasi retry sesudah partial write', () => {
  const d = draftOf('Buatkan RAB jalan paving 300 m2');
  const payload = buildPushPayload(d);
  const doubled = [payload[0], ...payload];
  const rIntra = dedupePushPayload(doubled, []);
  assert.equal(rIntra.dupCount, 1, 'duplikat di dalam payload sendiri dihitung');
  assert.equal(rIntra.newItems.length, payload.length);
  // Simulasi: 3 item pertama sudah tertulis sebelum gagal → retry hanya menulis sisanya.
  const written = payload.slice(0, 3).map((p) => ({
    code: p.code, description: p.description.replace(/^\[Chat AI\] /, ''), unit: p.unit, volume: p.volume,
  }));
  const retry = dedupePushPayload(payload, written);
  assert.equal(retry.dupCount, 3);
  assert.equal(retry.newItems.length, payload.length - 3);
});

console.log('== 8. Pesan draft jujur & kompatibilitas jalur rumah ==');

test('D3: pesan draft memuat template terpilih, status kesiapan, pemisah subtotal, dan arti ESTIMASI', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('Template terpilih'));
  assert.ok(msg.includes('Jembatan Gelagar Beton Pratekan'));
  assert.ok(msg.includes('PERLU SPESIFIKASI') || msg.includes('SIAP DITINJAU') || msg.includes('DIBLOKIR'));
  assert.ok(msg.includes('Total referensi pasar'));
  assert.ok(msg.includes('Total terverifikasi'));
  assert.ok(msg.includes('bukan harga yang dihitung atau diverifikasi AI per item'), 'ESTIMASI tidak menyiratkan verifikasi AI per item');
  assert.ok(!msg.includes('Rp0'), 'tidak ada literal Rp0 di pesan draft');
});

test('D3: draft blokir menampilkan alasan blokir di pesan (bukan sekadar catatan)', () => {
  const d = draftOf('Buat RAB struktur beton luas 200 m2');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('DIBLOKIR UNTUK TRANSFER'));
  assert.ok(msg.includes('Alasan blokir transfer'));
});

test('Kompatibilitas: rumah typed tetap unsupported di universal (jalur directRab/specRab tidak disentuh)', () => {
  const res = buildUniversalDraft('Buatkan RAB rumah type 70 2 lantai');
  assert.equal(res.kind, 'unsupported');
  const item: UniversalDraftItem = {
    id: 'x', description: 'Uji', volume: 1, unit: 'm2', unitPrice: 1000,
    priceStatus: 'PRICE_RESOLVED', ahspCode: null, ahspMappingStatus: 'NEEDS_MAPPING',
  };
  assert.equal(displayPriceStatus({ ...item, priceSourceKind: 'OFFICIAL_AHSP' }).label, 'RESMI AHSP');
});

console.log(`\nUNIVERSAL RAB HARDENING: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
