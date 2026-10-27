/**
 * DED-to-RAB — Work Classification Spec Tests (2026-10-28)
 * Mengunci integrasi spesifikasi klasifikasi WBS ke jalur runtime:
 *  - isi spesifikasi (keluarga proyek, katalog WBS, status bukti,
 *    larangan fabrikasi, tanpa tabel harga),
 *  - inklusi runtime di ketiga builder prompt (FAST, DETAIL, Full AI)
 *    untuk kedua kebijakan harga, tepat satu kali per prompt,
 *  - kebijakan harga & skema keluaran tidak berubah,
 *  - checklist bangunan-lama dihapus (digantikan spesifikasi),
 *  - tidak ada jejak prompt Chat AI / Dokumen AI di prompt DED,
 *  - koherensi sisi aplikasi: status bukti spesifikasi dipetakan
 *    classifier ke NEEDS_CONFIRM, dan kategori model bertahan melewati
 *    pengelompokan (termasuk domain yang belum ada di katalog aplikasi).
 *
 * Batasan yang diakui: perilaku model atas spesifikasi ini TIDAK bisa
 * diuji tanpa pemanggilan model live (tidak diizinkan di sini) — yang
 * diuji adalah teks prompt yang benar-benar dikirim ke model.
 */
import { createFastSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/fast';
import { createDetailSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/detail';
import { buildFullAiSystemPrompt } from '../ai-tools/ded-full-ai/prompts';
import { WORK_CLASSIFICATION_SPEC, WORK_CLASSIFICATION_SPEC_SHA256 } from '../ai-tools/ded-ai-estimate/prompts/work-classification.generated';
import { classifyToWbs, groupByWbs } from '../ai-tools/ded-ai-estimate/wbsClassifier';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

console.log('=== 1. Isi spesifikasi ===');
for (const tok of ['BANGUNAN', 'GEDUNG', 'INDUSTRI', 'JEMBATAN', 'BENDUNGAN', 'IRIGASI', 'BANGUNAN AIR', 'JALAN', 'PAVING']) {
  check(`token tipe proyek ${tok}`, WORK_CLASSIFICATION_SPEC.includes(`\`${tok}\``));
}
for (const grp of ['Pekerjaan Persiapan', 'Pekerjaan Pondasi', 'Pekerjaan Struktur', 'Pekerjaan Interior', 'Pekerjaan MEP', 'Pekerjaan Luar', 'Pengujian, Penyelesaian']) {
  check(`kelompok bangunan ${grp}`, WORK_CLASSIFICATION_SPEC.includes(grp));
}
for (const grp of ['cofferdam', 'Spillway', 'kolam olak', 'Galian saluran irigasi', 'Bangunan silang']) {
  check(`kelompok bendung/irigasi ${grp}`, WORK_CLASSIFICATION_SPEC.includes(grp));
}
for (const grp of ['Lapis fondasi', 'Marka, rambu', 'Drainase samping', 'Jangan mencampur susunan lentur dan kaku']) {
  check(`kelompok jalan ${grp}`, WORK_CLASSIFICATION_SPEC.includes(grp));
}
for (const grp of ['Drainase & pengendali banjir', 'Gorong-gorong & jembatan kecil', 'Dinding penahan & proteksi lereng', 'Air bersih & distribusi', 'Air limbah & sanitasi', 'Site development & koridor utilitas', 'Rehabilitasi & pemeliharaan']) {
  check(`keluarga sipil lain ${grp}`, WORK_CLASSIFICATION_SPEC.includes(grp));
}
check('multidisiplin diizinkan', WORK_CLASSIFICATION_SPEC.includes('multidisiplin'));
check('klasifikasi sementara bila bukti kurang', WORK_CLASSIFICATION_SPEC.includes('KLASIFIKASI SEMENTARA'));
for (const st of ['DRAWING_CONFIRMED', 'INFERRED_NEEDS_REVIEW', 'PROPOSED_NOT_IN_SOURCE']) {
  check(`status bukti ${st}`, WORK_CLASSIFICATION_SPEC.includes(st));
}
check('flag usulan persis', WORK_CLASSIFICATION_SPEC.includes('USULAN — TIDAK ADA DI DED'));
check('larangan pintu air karangan', WORK_CLASSIFICATION_SPEC.includes('jangan mengarang pintu air'));
check('larangan interior karangan', WORK_CLASSIFICATION_SPEC.includes('JANGAN mengarang kitchen set'));
check('larangan item sama sekali tidak ada', WORK_CLASSIFICATION_SPEC.includes('kolam renang di rumah type 36'));
check('larangan kode AHSP karangan', WORK_CLASSIFICATION_SPEC.includes('Jangan mengarang kode AHSP'));
check('pemetaan field mesin standar', WORK_CLASSIFICATION_SPEC.includes('DED_EXPLICIT') && WORK_CLASSIFICATION_SPEC.includes('sourceEvidence'));
check('pemetaan field Full AI', WORK_CLASSIFICATION_SPEC.includes('wbsGroup') && WORK_CLASSIFICATION_SPEC.includes('scopeSummary'));
check('tanpa tabel harga Jakarta', !WORK_CLASSIFICATION_SPEC.includes('HARGA JAKARTA 2026'));
check('tanpa perintah WAJIB isi harga', !WORK_CLASSIFICATION_SPEC.includes('WAJIB isi unitPrice'));
check('tanpa angka harga Rp', !/Rp\d/.test(WORK_CLASSIFICATION_SPEC));
check('tanpa klaim harga resmi', !WORK_CLASSIFICATION_SPEC.includes('harga resmi Rp'));
check('hash sha256 valid', /^[0-9a-f]{64}$/.test(WORK_CLASSIFICATION_SPEC_SHA256));

console.log('=== 2. Inklusi runtime (3 builder x 2 kebijakan) ===');
const prompts: Array<[string, string]> = [
  ['FAST/FULL_AI', createFastSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'FULL_AI' })],
  ['FAST/DATABASE', createFastSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'DATABASE' })],
  ['DETAIL/FULL_AI', createDetailSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'FULL_AI' })],
  ['DETAIL/DATABASE', createDetailSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'DATABASE' })],
  ['FULLAI/FULL_AI', buildFullAiSystemPrompt('BANGUNAN', 'FAST', 'FULL_AI')],
  ['FULLAI/DATABASE', buildFullAiSystemPrompt('BANGUNAN', 'ADVANCED', 'DATABASE')],
];
for (const [label, sys] of prompts) {
  check(`${label}: ada penanda spesifikasi`, sys.includes('SPESIFIKASI KLASIFIKASI & WBS DED–RAB'));
  check(`${label}: ada isi spesifikasi`, sys.includes('DRAWING_CONFIRMED') && sys.includes('PROPOSED_NOT_IN_SOURCE') && sys.includes('Pekerjaan Interior') && sys.includes('BENDUNGAN'));
  // Penanda wrapper (titik sisip) tepat satu kali; judul di dalam md
  // menambah satu kemunculan frasa yang sama, jadi yang dihitung adalah
  // baris wrapper persis, bukan frasa generik.
  check(`${label}: titik sisip spesifikasi tepat satu kali`, count(sys, 'SPESIFIKASI KLASIFIKASI & WBS DED–RAB (wajib diikuti') === 1, `got ${count(sys, 'SPESIFIKASI KLASIFIKASI & WBS DED–RAB (wajib diikuti')}`);
  check(`${label}: kebijakan harga mendahului spesifikasi`, sys.indexOf('KEBIJAKAN HARGA') !== -1 && sys.indexOf('KEBIJAKAN HARGA') < sys.indexOf('SPESIFIKASI KLASIFIKASI & WBS DED–RAB'));
  check(`${label}: tanpa jejak Chat/Dokumen AI`, !sys.includes('CORE_EZRAB_CHAT_AI') && !sys.includes('AI Document') && !sys.includes('Chat AI'));
}
console.log('=== 3. Kebijakan harga & skema tidak berubah ===');
for (const [label, sys] of prompts) {
  if (label.endsWith('DATABASE')) {
    check(`${label}: tanpa tabel harga pasar`, !sys.includes('HARGA JAKARTA 2026') && !sys.includes('Rp120.000'));
    check(`${label}: fallback Estimasi AI tetap ada`, sys.includes('Estimasi AI'));
  }
}
check('FAST/FULL_AI: tabel harga lama tetap ada', prompts[0][1].includes('Rp120.000'));
check('FAST/FULL_AI: field usulan tetap ada', prompts[0][1].includes('proposedSubtotal'));
check('FAST/DATABASE: larangan field usulan tetap ada', prompts[1][1].includes('JANGAN mengeluarkan field proposedSubtotal'));
check('DETAIL/DATABASE: larangan field usulan tetap ada', prompts[3][1].includes('JANGAN mengeluarkan field proposedSubtotal'));
check('FULLAI/DATABASE: larangan field usulan tetap ada', prompts[5][1].includes('JANGAN mengeluarkan proposedSubtotal'));
check('FAST: skema quantitySource tetap ada', prompts[0][1].includes('quantitySource'));
check('FULLAI: skema provenance tetap ada', prompts[4][1].includes('"provenance"'));
check('FAST: checklist bangunan-lama dihapus', !prompts[0][1].includes('CHECKLIST CAKUPAN'));
check('DETAIL: checklist bangunan-lama dihapus', !prompts[2][1].includes('CHECKLIST CAKUPAN'));
check('FAST: aturan khusus jalan (kuantitas) dipertahankan', prompts[0][1].includes('ATURAN KHUSUS PROYEK JALAN'));
check('DETAIL: aturan khusus jalan (kuantitas) dipertahankan', prompts[2][1].includes('ATURAN KHUSUS PROYEK JALAN'));

console.log('=== 4. Token tipe proyek & koherensi aplikasi ===');
check('FAST: token BENDUNGAN digemakan', createFastSystemPrompt({ projectType: 'BENDUNGAN', pricingPolicy: 'DATABASE' }).includes('"BENDUNGAN"'));
check('FULLAI: token IRIGASI digemakan', buildFullAiSystemPrompt('IRIGASI', 'FAST', 'FULL_AI').includes('"IRIGASI"'));
const mkItem = (over: Partial<DedAiItem>): DedAiItem => ({
  id: 't1', name: 'Test', category: 'Test', units: 'm3', quantity: 1,
  quantitySource: 'DED_GEOMETRIC', unitPrice: 100000, priceSource: 'AI_ESTIMATE',
  subtotal: 100000, sourcePages: [], provenance: [], stage: 'CALCULATED', ...over,
} as DedAiItem);
check('ASSUMPTION (usulan) → NEEDS_CONFIRM di classifier', classifyToWbs(mkItem({ quantitySource: 'ASSUMPTION' }), 'BANGUNAN').status === 'NEEDS_CONFIRM');
check('AI_INFERENCE → NEEDS_CONFIRM di classifier', classifyToWbs(mkItem({ quantitySource: 'AI_INFERENCE' }), 'BANGUNAN').status === 'NEEDS_CONFIRM');
const damItem = mkItem({ id: 'dam-1', name: 'Beton tubuh bendung', category: 'Struktur beton', quantitySource: 'DED_GEOMETRIC', quantity: 120, subtotal: null });
const { groups, unclassified } = groupByWbs([damItem], 'BENDUNGAN');
const allClassified = [...groups.flatMap((g) => g.items), ...unclassified];
check('kategori model bendung bertahan melewati grouping', allClassified.length === 1 && allClassified[0].category === 'Struktur beton' && allClassified[0].name === 'Beton tubuh bendung' && allClassified[0].quantity === 120);

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
