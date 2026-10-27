/**
 * DED-to-RAB — Final WBS Readiness Tests (2026-10-28)
 *
 * PENEGASAN PENTING: ini adalah tes DETERMINISTIK atas kode (klasifikasi,
 * pemetaan, finalisasi) memakai fixture sintetis — BUKAN tes kualitas
 * model. Tidak ada panggilan model live yang diotorisasi maupun dieksekusi
 * di sini, jadi tidak ada klaim apa pun tentang kualitas keluaran model
 * sesungguhnya. Fixture di bawah mensimulasikan item SEOLAH-OLEH model
 * mengeluarkannya, untuk menguji apakah KODE menangani item-item itu
 * dengan benar.
 *
 * Cakupan:
 *  Task 1 — tipe proyek eksplisit BENDUNGAN/IRIGASI: gate validasi,
 *    label i18n 4 bahasa, prompt, konteks classifier, divisi, legacy.
 *  Task 2 — kontrak persistensi: label kategori cukup (wbsCode adalah
 *    derivasi render-time; factory TIDAK menulis wbsCode — dikunci di
 *    sini agar tidak berubah diam-diam), sumbu status bukti vs
 *    provenance harga terpisah, label tak dikenal utuh.
 *  Task 3 — 5 fixture: rumah 2 lantai, bendung+irigasi, jalan aspal,
 *    campuran, gambar tak lengkap.
 */
import { createFastSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/fast';
import { createDetailSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/detail';
import { buildFullAiSystemPrompt } from '../ai-tools/ded-full-ai/prompts';
import { getWbsCatalog } from '../ai-tools/ded-ai-estimate/wbsCatalog';
import { classifyToWbs, groupByWbs } from '../ai-tools/ded-ai-estimate/wbsClassifier';
import { buildDivisionCoverage } from '../ai-tools/ded-ai-estimate/divisions';
import { isProjectTypeSupported } from '../ai-tools/ded-ai-estimate/service';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { dictionaries } from '../i18n/dictionaries';
import { aiModelRegistry } from '../ai-tools/aiModelRegistry';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const mkItem = (over: Partial<DedAiItem>): DedAiItem => ({
  id: 't1', name: 'Test', category: 'Test', units: 'm3', quantity: 1,
  quantitySource: 'DED_GEOMETRIC', unitPrice: 100000, priceSource: 'AI_ESTIMATE',
  subtotal: 100000, sourcePages: [], provenance: [], stage: 'CALCULATED', ...over,
} as DedAiItem);
// Grup induk (parent) dari hasil grouping, bukan simpul mentah.
const parentCodes = (items: DedAiItem[], pt: string) =>
  groupByWbs(items, pt).groups.map((g) => g.node.code);
const noDupes = (items: DedAiItem[], pt: string) => {
  const r = groupByWbs(items, pt);
  const ids = [...r.groups.flatMap((g) => g.items), ...r.unclassified].map((i) => i.id);
  return ids.length === items.length && new Set(ids).size === ids.length;
};

console.log('=== Task 1: tipe eksplisit ===');
for (const t of ['BANGUNAN', 'GEDUNG', 'BANGUNAN AIR', 'JALAN', 'PAVING', 'BENDUNGAN', 'IRIGASI']) {
  check(`gate validasi menerima ${t}`, isProjectTypeSupported(t));
}
check('gate menolak tipe tak dikenal', !isProjectTypeSupported('UNKNOWN_XYZ') && !isProjectTypeSupported(''));
const dict = (lang: 'id' | 'en' | 'zh' | 'ms', key: string) =>
  (dictionaries as any)[lang]?.ai?.ded?.input?.[key];
check('i18n id bendungan/irigasi', dict('id', 'type_bendungan') === 'Bendungan / Bendung' && dict('id', 'type_irigasi') === 'Irigasi');
check('i18n en bendungan/irigasi', dict('en', 'type_bendungan') === 'Dam / Weir' && dict('en', 'type_irigasi') === 'Irrigation');
check('i18n zh bendungan/irigasi', dict('zh', 'type_bendungan') === '水坝 / 堰' && dict('zh', 'type_irigasi') === '灌溉');
check('i18n ms bendungan/irigasi', dict('ms', 'type_bendungan') === 'Empangan' && dict('ms', 'type_irigasi') === 'Pengairan');
check('label registry bendungan/irigasi', aiModelRegistry.projectTypeLabel('BENDUNGAN') === 'Bendungan' && aiModelRegistry.projectTypeLabel('IRIGASI') === 'Irigasi');
check('label registry tak dikenal = apa adanya', aiModelRegistry.projectTypeLabel('CAMPURAN') === 'CAMPURAN');
const fastBdm = createFastSystemPrompt({ projectType: 'BENDUNGAN', pricingPolicy: 'DATABASE' });
check('prompt FAST: tipe BENDUNGAN sampai ke prompt', fastBdm.includes('"BENDUNGAN"'));
check('prompt FAST BENDUNGAN/DATABASE: fallback Estimasi AI, tanpa tabel harga',
  fastBdm.includes('Estimasi AI') && !fastBdm.includes('HARGA JAKARTA 2026'));
check('prompt FAST BENDUNGAN/FULL_AI: tabel harga tetap dari kebijakan (bukan tipe)',
  createFastSystemPrompt({ projectType: 'BENDUNGAN', pricingPolicy: 'FULL_AI' }).includes('Rp120.000'));
const detIrg = createDetailSystemPrompt({ projectType: 'IRIGASI', pricingPolicy: 'DATABASE' });
check('prompt DETAIL: tipe IRIGASI sampai ke prompt + spesifikasi WBS', detIrg.includes('"IRIGASI"') && detIrg.includes('SPESIFIKASI KLASIFIKASI & WBS'));
check('prompt Full AI: tipe BENDUNGAN sampai ke prompt',
  buildFullAiSystemPrompt('BENDUNGAN', 'FAST', 'FULL_AI').includes('"BENDUNGAN"'));
check('katalog BENDUNGAN/IRIGASI langsung tersedia',
  getWbsCatalog('BENDUNGAN').some((n) => n.code === 'BDM-05-A') && getWbsCatalog('IRIGASI').some((n) => n.code === 'IRG-04'));
check('legacy: PAVING tetap memetakan ke katalog JALAN', getWbsCatalog('PAVING').some((n) => n.code === 'JLN-01'));
check('legacy: tipe tak dikenal tetap fallback BANGUNAN',
  getWbsCatalog('CAMPURAN').length === getWbsCatalog('BANGUNAN').length);
check('divisi: proyek BENDUNGAN murni → semua NOT_APPLICABLE', (() => {
  const items = [mkItem({ name: 'Beton tubuh bendung', category: 'Struktur beton' })];
  const g = groupByWbs(items, 'BENDUNGAN');
  const cov = buildDivisionCoverage({
    classifiedItems: [...g.groups.flatMap((x) => x.items), ...g.unclassified],
    pages: [], projectType: 'BENDUNGAN',
  });
  return cov.length === 12 && cov.every((d) => d.status === 'NOT_APPLICABLE');
})());

console.log('=== Task 2: kontrak persistensi ===');
const draftItem = mkItem({
  id: 'd1', name: 'Beton tubuh bendung', category: 'Struktur beton',
  quantitySource: 'ASSUMPTION', priceSource: 'AI_ESTIMATE',
  priceAssumptionNote: 'Estimasi AI — contoh fixture.',
});
const reloaded = JSON.parse(JSON.stringify(draftItem));
check('draft JSON: kategori + quantitySource + priceSource + note utuh',
  reloaded.category === 'Struktur beton' && reloaded.quantitySource === 'ASSUMPTION'
  && reloaded.priceSource === 'AI_ESTIMATE' && reloaded.priceAssumptionNote === 'Estimasi AI — contoh fixture.');
check('re-derivasi sesudah reload = sebelum reload (wbsCode derivasi, bukan fakta tersimpan)',
  classifyToWbs(draftItem, 'BENDUNGAN').node?.code === classifyToWbs(reloaded, 'BENDUNGAN').node?.code
  && classifyToWbs(draftItem, 'BENDUNGAN').node?.code === 'BDM-05-A');
// Sumbu terpisah: status bukti (dari quantitySource) vs status verifikasi harga (dari priceSource).
const canonAssumed = mkItem({
  name: 'Kolom praktis', category: 'Struktur', quantitySource: 'ASSUMPTION',
  priceSource: 'AHSP_2026', ahspCode: 'FIXTURE-AHSP-001', unitPrice: 500000,
});
check('sumbu terpisah: harga kanonis + bukti asumsi → classifier NEEDS_CONFIRM, finalisasi VERIFIED',
  classifyToWbs(canonAssumed, 'BANGUNAN').status === 'NEEDS_CONFIRM'
  && mapDedAiItemToRabInput(canonAssumed, 'DATABASE')?.verificationStatus === 'VERIFIED'
  && mapDedAiItemToRabInput(canonAssumed, 'DATABASE')?.ahspCode === 'FIXTURE-AHSP-001');
const aiExplicit = mkItem({
  name: 'Kitchen set dapur', category: 'Pekerjaan Interior', quantitySource: 'DED_EXPLICIT',
  priceSource: 'AI_ESTIMATE', unitPrice: 15000000,
});
check('sumbu terpisah: bukti eksplisit + harga AI → classifier IDENTIFIED, finalisasi NEEDS_VERIFICATION',
  classifyToWbs(aiExplicit, 'BANGUNAN').status === 'IDENTIFIED'
  && mapDedAiItemToRabInput(aiExplicit, 'DATABASE')?.verificationStatus === 'NEEDS_VERIFICATION');
const weird = mkItem({ name: 'Pekerjaan aneh tak dikenal xyz', category: 'Kategori Aneh XYZ' });
const weirdInput = mapDedAiItemToRabInput(weird, 'DATABASE');
const weirdRecord = weirdInput ? createRabItemRecord(weirdInput) : null;
check('label tak dikenal utuh lewat finalisasi + factory (bukan default pabrik)',
  weirdInput?.category === 'Kategori Aneh XYZ'
  && (weirdRecord as any)?.category === 'Kategori Aneh XYZ'
  && (weirdRecord as any)?.sectionName === 'Kategori Aneh XYZ');
check('kontrak saat ini: factory TIDAK menulis wbsCode (kunci grup spreadsheet = category/sectionName)',
  (weirdRecord as any)?.wbsCode === undefined);

console.log('=== Task 3a: rumah 2 lantai ===');
const house: DedAiItem[] = [
  mkItem({ id: 'h1', name: 'Pembersihan lahan & bowplank', category: 'Pekerjaan Persiapan', quantitySource: 'DED_EXPLICIT' }),
  mkItem({ id: 'h2', name: 'Galian tanah pondasi', category: 'Pekerjaan Tanah' }),
  mkItem({ id: 'h3', name: 'Pondasi batu kali', category: 'Pondasi' }),
  mkItem({ id: 'h4', name: 'Kolom praktis 15/15', category: 'Struktur' }),
  mkItem({ id: 'h5', name: 'Dinding bata merah', category: 'Dinding' }),
  mkItem({ id: 'h6', name: 'Rangka atap baja ringan', category: 'Atap' }),
  mkItem({ id: 'h7', name: 'Lantai keramik 40x40', category: 'Lantai' }),
  mkItem({ id: 'h8', name: 'Pintu panel kayu', category: 'Kusen' }),
  mkItem({ id: 'h9', name: 'Pengecatan dinding interior', category: 'Finishing' }),
  mkItem({ id: 'h10', name: 'Instalasi titik lampu & stop kontak', category: 'MEP' }),
  mkItem({ id: 'h11', name: 'Instalasi air bersih PVC', category: 'MEP' }),
  mkItem({ id: 'h12', name: 'Pagar keliling', category: 'Luar' }),
  mkItem({ id: 'h13', name: 'Kitchen set dapur', category: 'Pekerjaan Interior' }),
  mkItem({ id: 'h14', name: 'Lemari pakaian', category: 'Pekerjaan Interior' }),
];
{
  const r = groupByWbs(house, 'BANGUNAN');
  const parents = new Set(r.groups.map((g) => g.node.code));
  check('rumah: 0 tak terkategorisasi', r.unclassified.length === 0, `got ${r.unclassified.map((i) => i.name).join(',')}`);
  check('rumah: semua kelompok BGN-01..12 terwakili (arsitektur+struktur+MEP+interior)',
    ['BGN-01', 'BGN-02', 'BGN-03', 'BGN-04', 'BGN-05', 'BGN-06', 'BGN-07', 'BGN-08', 'BGN-09', 'BGN-10', 'BGN-11', 'BGN-12'].every((c) => parents.has(c)),
    `got ${[...parents].join(',')}`);
  check('rumah: tanpa duplikasi (tiap id tepat satu kelompok)', noDupes(house, 'BANGUNAN'));
}

console.log('=== Task 3b: bendung + irigasi ===');
const weir: DedAiItem[] = [
  mkItem({ id: 'w1', name: 'Cofferdam sungai', category: 'Pengalihan Sungai' }),
  mkItem({ id: 'w2', name: 'Galian dasar sungai', category: 'Galian' }),
  mkItem({ id: 'w3', name: 'Beton tubuh bendung', category: 'Struktur beton' }),
  mkItem({ id: 'w4', name: 'Apron & kolam olak', category: 'Struktur beton' }),
  mkItem({ id: 'w5', name: 'Spillway beton', category: 'Spillway' }),
  mkItem({ id: 'w6', name: 'Pintu air & hoist', category: 'Spillway' }),
  mkItem({ id: 'w7', name: 'Saluran irigasi primer', category: 'Saluran Irigasi' }),
  mkItem({ id: 'w8', name: 'Bangunan bagi tersier', category: 'Bangunan Bagi' }),
  mkItem({ id: 'w9', name: 'Bangunan sadap', category: 'Bangunan Sadap' }),
  mkItem({ id: 'w10', name: 'Bangunan ukur debit', category: 'Bangunan Ukur' }),
  mkItem({ id: 'w11', name: 'Sifon beton', category: 'Sifon' }),
  mkItem({ id: 'w12', name: 'Pasangan riprap tebing', category: 'Pengaman Tebing' }),
  mkItem({ id: 'w13', name: 'Jalan inspeksi bendung', category: 'Jalan Akses' }),
];
{
  const r = groupByWbs(weir, 'BENDUNGAN');
  const parents = new Set(r.groups.map((g) => g.node.code));
  check('bendung: 0 tak terkategorisasi', r.unclassified.length === 0, `got ${r.unclassified.map((i) => i.name).join(',')}`);
  check('bendung: kelompok bendung + irigasi terwakili',
    ['BDM-02', 'BDM-03', 'BDM-05', 'BDM-08', 'BDM-11', 'BDM-12', 'IRG-03', 'IRG-04', 'IRG-05'].every((c) => parents.has(c)),
    `got ${[...parents].join(',')}`);
  check('bendung: sifon di proyek bendung = kelompok silang bendung (BDM-10)',
    parents.has('BDM-10'));
  check('bendung: tanpa duplikasi', noDupes(weir, 'BENDUNGAN'));
}

console.log('=== Task 3c: jalan aspal ===');
const road: DedAiItem[] = [
  mkItem({ id: 'r1', name: 'Pembersihan & pengukuran', category: 'Persiapan', units: 'm2' }),
  mkItem({ id: 'r2', name: 'Galian tanah jalan', category: 'Tanah' }),
  mkItem({ id: 'r3', name: 'Lapis fondasi agregat kelas A', category: 'Fondasi', units: 'm2' }),
  mkItem({ id: 'r4', name: 'Lapis Aus AC-WC', category: 'Perkerasan', units: 'm2' }),
  mkItem({ id: 'r5', name: 'Lapis Antara AC-BC', category: 'Perkerasan', units: 'm2' }),
  mkItem({ id: 'r6', name: 'Bahu jalan & trotoar', category: 'Perlengkapan Jalan', units: 'm2' }),
  mkItem({ id: 'r7', name: 'Saluran drainase samping', category: 'Drainase', units: 'm' }),
  mkItem({ id: 'r8', name: 'Gorong-gorong beton', category: 'Drainase', units: 'm' }),
  mkItem({ id: 'r9', name: 'Marka jalan thermoplastic', category: 'Perlengkapan Jalan', units: 'm2' }),
  mkItem({ id: 'r10', name: 'Rambu peringatan', category: 'Perlengkapan Jalan', units: 'bh' }),
  mkItem({ id: 'r11', name: 'Guardrail baja', category: 'Perlengkapan Jalan', units: 'm' }),
  mkItem({ id: 'r12', name: 'Lampu jalan LED', category: 'Perlengkapan Jalan', units: 'titik' }),
  mkItem({ id: 'r13', name: 'Dinding penahan tanah', category: 'Struktur Pelengkap' }),
  mkItem({ id: 'r14', name: 'Pengujian kepadatan lapangan', category: 'Pengujian', units: 'titik' }),
];
{
  const r = groupByWbs(road, 'JALAN');
  const parents = new Set(r.groups.map((g) => g.node.code));
  check('jalan: 0 tak terkategorisasi', r.unclassified.length === 0, `got ${r.unclassified.map((i) => i.name).join(',')}`);
  check('jalan: semua kelompok JLN-01..08 terwakili',
    ['JLN-01', 'JLN-02', 'JLN-03', 'JLN-04', 'JLN-05', 'JLN-06', 'JLN-07', 'JLN-08'].every((c) => parents.has(c)),
    `got ${[...parents].join(',')}`);
  check('jalan: AC-WC vs AC-BC tidak digabung (subkelompok berbeda)',
    classifyToWbs(road[3], 'JALAN').node?.code !== classifyToWbs(road[4], 'JALAN').node?.code);
  check('jalan: tanpa duplikasi', noDupes(road, 'JALAN'));
  // Paritas kata kunci persiapan: kata generik 'pembersihan/pengukuran'
  // tidak boleh menarik item persiapan proyek lain ke BGN-01.
  check('persiapan: item yang sama tetap di katalog proyeknya sendiri', (() => {
    const prep = (pt: string) => classifyToWbs(mkItem({ name: 'Pembersihan & pengukuran', category: 'Persiapan' }), pt).node?.code;
    return prep('JALAN') === 'JLN-01' && prep('BANGUNAN AIR') === 'DRN-01' && prep('JEMBATAN') === 'JMB-01'
      && prep('BENDUNGAN') === 'BDM-01' && prep('IRIGASI') === 'IRG-01' && prep('BANGUNAN') === 'BGN-01';
  })());
}

console.log('=== Task 3d: campuran ===');
const mixed: DedAiItem[] = [
  mkItem({ id: 'x1', name: 'Kolom praktis', category: 'Struktur' }),
  mkItem({ id: 'x2', name: 'Beton tubuh bendung', category: 'Struktur beton' }),
  mkItem({ id: 'x3', name: 'Saluran irigasi sekunder', category: 'Saluran Irigasi' }),
  mkItem({ id: 'x4', name: 'Lapis Aus AC-WC', category: 'Perkerasan', units: 'm2' }),
  mkItem({ id: 'x5', name: 'Pipa distribusi air', category: 'Jaringan Pipa' }),
  mkItem({ id: 'x6', name: 'Kitchen set dapur', category: 'Pekerjaan Interior' }),
];
{
  const r = groupByWbs(mixed, 'CAMPURAN');
  const prefixes = new Set(r.groups.map((g) => g.node.code.split('-')[0]));
  check('campuran: kelompok dari ≥4 katalog berbeda', prefixes.size >= 4, `got ${[...prefixes].join(',')}`);
  check('campuran: 0 tak terkategorisasi', r.unclassified.length === 0);
  check('campuran: tanpa duplikasi + kategori tiap item utuh', noDupes(mixed, 'CAMPURAN')
    && [...r.groups.flatMap((g) => g.items)].every((it) => mixed.some((m) => m.id === it.id && m.category === it.category)));
}

console.log('=== Task 3e: gambar tak lengkap (usulan) ===');
const incompleteA = mkItem({
  id: 'u1', name: 'Pekerjaan struktur usulan', category: 'Struktur', quantity: null,
  quantitySource: 'UNRESOLVED', unitPrice: null, subtotal: null,
  specification: 'USULAN — TIDAK ADA DI DED: belum ada gambar struktur; verifikasi ke perencana.',
});
const incompleteB = mkItem({
  id: 'u2', name: 'Kitchen set premium (asumsi)', category: 'Pekerjaan Interior', quantity: 1,
  quantitySource: 'ASSUMPTION', priceSource: 'AI_ESTIMATE', unitPrice: 15000000,
  specification: 'USULAN — TIDAK ADA DI DED: interior tidak ada di gambar; estimasi pasar.',
});
const incompleteD = mkItem({
  id: 'u4', name: 'Pasang keramik KM', category: 'Lantai', quantity: 10,
  quantitySource: 'AI_INFERENCE', priceSource: 'AI_ESTIMATE', unitPrice: 200000,
});
check('usulan: qty null + UNRESOLVED → NEEDS_CONFIRM + finalisasi null (bukan baris berharga)',
  classifyToWbs(incompleteA, 'BANGUNAN').status === 'NEEDS_CONFIRM'
  && mapDedAiItemToRabInput(incompleteA, 'DATABASE') === null);
check('usulan: asumsi + Estimasi AI → NEEDS_CONFIRM + NEEDS_VERIFICATION + tanpa kode AHSP',
  classifyToWbs(incompleteB, 'BANGUNAN').status === 'NEEDS_CONFIRM'
  && mapDedAiItemToRabInput(incompleteB, 'DATABASE')?.verificationStatus === 'NEEDS_VERIFICATION'
  && mapDedAiItemToRabInput(incompleteB, 'DATABASE')?.priceSourceLabel === 'Estimasi AI'
  && mapDedAiItemToRabInput(incompleteB, 'DATABASE')?.ahspCode === undefined);
check('usulan: AI tanpa kode → tidak ada kode AHSP yang dikarang di output finalisasi',
  mapDedAiItemToRabInput(incompleteD, 'DATABASE')?.ahspCode === undefined);
check('duplikat nama: dua Kolom praktis berbeda id → satu kelompok, itemCount 2 (tidak dilebur)',
  (() => {
    const dup = [mkItem({ id: 'd1', name: 'Kolom praktis', category: 'Struktur' }), mkItem({ id: 'd2', name: 'Kolom praktis', category: 'Struktur' })];
    const r = groupByWbs(dup, 'BANGUNAN');
    return r.groups.length === 1 && r.groups[0].itemCount === 2 && r.unclassified.length === 0;
  })());

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
