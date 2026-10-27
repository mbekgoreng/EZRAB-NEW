/**
 * DED-to-RAB — Mode Separation Tests (misi 2026-10-27)
 * SYNTHETIC fixtures only — no real DED, no AI call, no canonical DB write.
 *
 * Keputusan owner yang dipertahankan (bukan bagian misi yang dibatalkan):
 * mode DATABASE memakai estimasi AI HANYA sebagai fallback berlabel
 * "Estimasi AI" bila item tidak ada di database; harga kanonis selalu
 * menang bila cocok. Tes di sini menegaskan fallback itu TIDAK PERNAH
 * berlabel/berstatus kanonis (AHSP_2026) dan tidak pernah menyamar
 * sebagai harga resmi — bukan menguji larangan total fallback, karena
 * larangan total itu sengaja TIDAK diterapkan atas pilihan owner.
 */
import { buildFastPrompt, createFastSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/fast';
import { buildDetailPrompt, createDetailSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/detail';
import { buildFullAiPrompt, buildFullAiSystemPrompt } from '../ai-tools/ded-full-ai/prompts';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import { resolveDedPriceWithCanonical } from '../ai-tools/ded-canonical/canonicalDedPricing';
import { describeProposedDiscrepancy } from '../ai-tools/ded-full-ai/validator';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; fails.push(name); console.log(`  ✗ ${name}`); }
}
const pages = [{ page: 1, title: 'Denah', text: 'Kolom 15x20cm, dinding bata' }];

console.log('=== DED Prompt Mode Separation ===');

// 1. FAST — FULL_AI: estimasi + usulan total diizinkan, bukan klaim resmi.
const fastFull = createFastSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'FULL_AI' });
check('FAST FULL_AI meminta proposedSubtotal', fastFull.includes('proposedSubtotal'));
check('FAST FULL_AI meminta proposedGrandTotal', fastFull.includes('proposedGrandTotal'));
check('FAST FULL_AI melarang klaim resmi AHSP', /bukan data resmi AHSP/.test(fastFull));
check('FAST FULL_AI menyebut usulan disimpan terpisah', /DISIMPAN terpisah/.test(fastFull));

// 2. FAST — DATABASE: larang kode/harga resmi, wajib bahan pencocokan, fallback berlabel.
const fastDb = createFastSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'DATABASE' });
check('FAST DATABASE melarang kode AHSP', fastDb.includes('DILARANG menulis kode AHSP'));
check('FAST DATABASE melarang harga resmi', fastDb.includes('harga material resmi'));
check('FAST DATABASE meminta bahan pencocokan', fastDb.includes('bahan pencocokan'));
check('FAST DATABASE menyebut fallback Estimasi AI', fastDb.includes('fallback berlabel "Estimasi AI"'));
check('FAST DATABASE kanonis menang bila cocok', fastDb.includes('harga kanonis selalu menang'));
check('FAST DATABASE melarang field proposed (bukan memintanya)', fastDb.includes('JANGAN mengeluarkan field proposedSubtotal') && !fastDb.includes('FIELD TAMBAHAN MODE FULL_AI'));

// 3. DETAIL — kebijakan sama dengan FAST (tidak bocor antar mode/kedalaman).
const detFull = createDetailSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'FULL_AI' });
const detDb = createDetailSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: 'DATABASE' });
check('DETAIL FULL_AI meminta proposedSubtotal', detFull.includes('proposedSubtotal'));
check('DETAIL DATABASE melarang kode AHSP', detDb.includes('DILARANG menulis kode AHSP'));
check('DETAIL DATABASE melarang field proposed (bukan memintanya)', detDb.includes('JANGAN mengeluarkan field proposedSubtotal') && !detDb.includes('FIELD TAMBAHAN MODE FULL_AI'));
check('DETAIL menyebut ambiguitas & duplikat', detDb.includes('DUPLIKAT') || detDb.includes('digandakan'));

// 4. Builder default = FULL_AI (kompatibilitas konsumen lama tanpa policy).
const fastDefault = buildFastPrompt({ projectType: 'BANGUNAN', buildingType: 'RUMAH', pageSummaries: pages });
check('FAST default = FULL_AI (proposed diminta)', fastDefault.system.includes('proposedSubtotal'));
const detDefault = buildDetailPrompt({ projectType: 'BANGUNAN', buildingType: 'RUMAH', pageSummaries: pages });
check('DETAIL default = FULL_AI (proposed diminta)', detDefault.system.includes('proposedSubtotal'));
const fullDefault = buildFullAiPrompt({ projectType: 'BANGUNAN', documentText: 'x', pageCount: 1, mode: 'FAST' });
check('FullAI default = FULL_AI (proposed diminta)', fullDefault.system.includes('proposedSubtotal'));

// 5. FullAI prompts.ts — pemisahan mode + kedalaman tetap berbeda.
const fullAiFull = buildFullAiSystemPrompt('BANGUNAN', 'FAST', 'FULL_AI');
const fullAiDb = buildFullAiSystemPrompt('BANGUNAN', 'FAST', 'DATABASE');
const fullAiAdv = buildFullAiSystemPrompt('BANGUNAN', 'ADVANCED', 'FULL_AI');
check('FullAI FULL_AI meminta breakdown material/upah/alat', fullAiFull.includes('material, tenaga kerja, dan peralatan'));
check('FullAI FULL_AI meminta proposedGrandTotal', fullAiFull.includes('proposedGrandTotal'));
check('FullAI DATABASE melarang kode AHSP', fullAiDb.includes('DILARANG menulis kode AHSP'));
check('FullAI DATABASE melarang field proposed (bukan memintanya)', fullAiDb.includes('JANGAN mengeluarkan proposedSubtotal/proposedGrandTotal'));
check('FullAI FAST vs ADVANCED tetap berbeda', fullAiFull !== fullAiAdv);
check('FullAI DATABASE tidak mengklaim harga Jakarta sebagai resmi', !/harga resmi Jakarta/.test(fullAiDb));

// 6. DATABASE: fallback AI tidak pernah naik status jadi kanonis (adapter, kedua mode).
const noMatch = resolveDedPriceWithCanonical('DATABASE', { status: 'NO_MATCH', unitPrice: null } as never, { unitPrice: 850000, source: 'AI_ESTIMATE' });
check('DATABASE no-match + fallback AI = AI_ESTIMATE (bukan AHSP_2026)', (noMatch as any).source === 'AI_ESTIMATE' && (noMatch as any).ahspCode === undefined);
const dbInsane = resolveDedPriceWithCanonical('DATABASE', { status: 'NO_MATCH', unitPrice: null } as never, { unitPrice: 50, source: 'AI_ESTIMATE' });
check('DATABASE fallback tidak wajar = UNRESOLVED (bukan Rp0)', (dbInsane as any).source === 'UNRESOLVED' && (dbInsane as any).unitPrice === null);

// 7. Kalkulator standar: total usulan AI tersimpan terpisah + selisih ditandai.
const mkItem = (id: string, qty: number, price: number, proposed: number | null): DedAiItem => ({
  id, name: `Item ${id}`, category: 'Struktur', units: 'm3', quantity: qty,
  quantitySource: 'DED_GEOMETRIC', unitPrice: price, priceSource: 'AI_ESTIMATE',
  subtotal: null, aiProposedSubtotal: proposed, sourcePages: [1], provenance: [], stage: 'PARSE',
});
const out = DedAiCalculator.buildOutput({
  jobId: 't', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
  projectName: 'Tes', pageCount: 1,
  items: [mkItem('1', 2, 100000, 250000), mkItem('2', 1, 50000, 50000)],
});
check('Kalkulator grandTotal terverifikasi = 250000', out.grandTotal === 250000);
check('Kalkulator aiProposedGrandTotal = 300000', out.aiProposedGrandTotal === 300000);
check('Kalkulator selisih ditandai (bukan diam-diam)', typeof out.totalDiscrepancyNote === 'string' && out.totalDiscrepancyNote.includes('berbeda'));
const outSame = DedAiCalculator.buildOutput({
  jobId: 't', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
  projectName: 'Tes', pageCount: 1, items: [mkItem('1', 2, 100000, 200000)],
});
check('Kalkulator tanpa selisih = tanpa catatan selisih', outSame.totalDiscrepancyNote === undefined);
const outDb = DedAiCalculator.buildOutput({
  jobId: 't', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Tes', pageCount: 1, items: [mkItem('1', 2, 100000, null)],
});
check('Kalkulator tanpa usulan = aiProposedGrandTotal null', outDb.aiProposedGrandTotal === null);

// 8. Helper selisih Full AI: murni, tidak menimpa, tidak klaim cocok.
check('Selisih sama setelah pembulatan = null', describeProposedDiscrepancy(100000, 100000) === null);
check('Selisih berbeda = string penjelasan', (describeProposedDiscrepancy(300000, 250000) || '').includes('berbeda'));
check('Selisih tak bisa dibanding = null', describeProposedDiscrepancy(null, 250000) === null && describeProposedDiscrepancy(300000, null) === null);

console.log('=== Prompt kondisional per mode (perbaikan audit P1) ===');
// Tabel harga pasar + perintah wajib HANYA di FULL_AI; DATABASE bersih darinya.
check('FAST DATABASE tanpa tabel Rp120.000', !fastDb.includes('Rp120.000'));
check('FAST DATABASE tanpa perintah WAJIB isi harga', !fastDb.includes('WAJIB isi estimatedUnitPrice'));
check('FAST DATABASE menyatakan tanpa tabel harga pasar', fastDb.includes('TIDAK ADA tabel harga pasar'));
check('FAST FULL_AI mempertahankan tabel + WAJIB', fastFull.includes('Rp120.000') && fastFull.includes('WAJIB isi estimatedUnitPrice'));
check('DETAIL DATABASE tanpa referensi Rp120-180rb', !detDb.includes('Rp120-180rb'));
check('DETAIL DATABASE tanpa perintah WAJIB diisi semua', !detDb.includes('WAJIB diisi untuk semua item'));
check('DETAIL FULL_AI mempertahankan referensi', detFull.includes('Rp120-180rb'));
check('FullAI DATABASE tanpa tabel HARGA JAKARTA 2026', !fullAiDb.includes('HARGA JAKARTA 2026'));
check('FullAI DATABASE tanpa item referensi Galian tanah', !fullAiDb.includes('Galian tanah biasa'));
check('FullAI DATABASE tanpa perintah WAJIB isi unitPrice', !fullAiDb.includes('WAJIB isi unitPrice'));
check('FullAI DATABASE menyatakan tanpa tabel referensi', fullAiDb.includes('tidak ada tabel referensi harga'));
check('FullAI FULL_AI mempertahankan tabel + WAJIB', fullAiFull.includes('HARGA JAKARTA 2026') && fullAiFull.includes('WAJIB isi unitPrice'));

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
