/**
 * DED-to-RAB — Resolusi AHSP kanonis (owner 2026-10-27, tindak lanjut §2-§7).
 *
 * Run: npx esbuild src/test/dedCanonicalPricing.src.ts --bundle --platform=node
 *      --format=cjs --outfile=/tmp/dedcanon.cjs && node /tmp/dedcanon.cjs
 *
 * Memetakan 17 kasus spesifikasi ke fungsi murni + layanan kanonis nyata
 * (in-memory, tanpa provider AI). Tidak mengubah data master; tidak ada
 * harga karangan — semua harga ekspektasi berasal dari komposisi kanonis
 * yang dieksekusi di sini (3.7.4 = Rp51.622 biaya langsung, dst).
 */
import {
  matchDedItemToAhsp, resolveCanonicalCode, resolveDedPriceWithCanonical,
  getDedPriceSourceLabel, checkSpecCompatibility,
  CANONICAL_SOURCE_DOCUMENT, CANONICAL_PERIOD,
} from '../ai-tools/ded-canonical/canonicalDedPricing';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { isQuarantined } from '../data/nationalCostDatabase/ahspQuarantine';
import { canonicalUnitRegistry } from '../engine/pricing/canonical/canonicalUnitRegistry';
import { DedAiCalculator, calcSubtotal, applyUnitChange } from '../ai-tools/ded-ai-estimate/calculator';
import { resolveDedPriceForPolicy } from '../ai-tools/ded-ai-estimate/pricing';
import { applyFullAiPricePolicy, resolveFullAiItemStatus } from '../ai-tools/ded-full-ai/service';
import { verifySubtotal } from '../ai-tools/ded-full-ai/validator';
import { classifyPassOutcome, decideNoItemsError } from '../ai-tools/ded-ai-estimate/service';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n== 1-2. Kode kanonis teratasi + harga tersedia (kasus 1, 2) ==');
const plaster = resolveCanonicalCode('3.7.4', 'm2');
check('1.1 3.7.4/m2 → RESOLVED', plaster.status === 'RESOLVED');
check('1.2 harga biaya langsung 51622 (bukan DHSP 56784)', plaster.unitPrice === 51622);
check('1.3 dokumen + periode kanonis', plaster.sourceDocument === CANONICAL_SOURCE_DOCUMENT && plaster.period === CANONICAL_PERIOD);
check('1.4 matchedCode + unit', plaster.matchedCode === '3.7.4' && plaster.unit === 'm2');

console.log('\n== 3. Komponen hilang → tidak dihargai parsial (kasus 3) ==');
const partial = resolveCanonicalCode('2.2.1.4.1', 'm3');
check('3.1 2.2.1.4.1 → INCOMPLETE_COMPONENTS', partial.status === 'INCOMPLETE_COMPONENTS');
check('3.2 harga null (jumlah parsial 843375 TIDAK dipakai)', partial.unitPrice === null);
check('3.3 daftar hilang memuat Batu split', partial.missingComponents.some((m) => m.name.includes('Batu split')));

console.log('\n== 4. Banyak kandidat → review, tanpa auto-pilih (kasus 4) ==');
const ceramic = matchDedItemToAhsp({ name: 'pasang keramik lantai', unit: 'm2' });
check('4.1 keramik → NEEDS_REVIEW (bukan RESOLVED)', ceramic.status === 'NEEDS_REVIEW');
check('4.2 kandidat ≥ 3, semua satuan m2', ceramic.candidates.length >= 3 && ceramic.candidates.every((c) => c.unit === 'm2'));
check('4.3 tidak ada harga auto (unitPrice null)', ceramic.unitPrice === null);

console.log('\n== 5. Satuan tak cocok (kasus 5) ==');
const unitBad = resolveCanonicalCode('3.7.4', 'm3');
check('5.1 3.7.4/m3 → UNIT_MISMATCH, harga null', unitBad.status === 'UNIT_MISMATCH' && unitBad.unitPrice === null);

console.log('\n== 6. Tanpa padanan (kasus 6) ==');
const nonsense = matchDedItemToAhsp({ name: 'pekerjaan fiktif tidak ada xyz', unit: 'm2' });
check('6.1 kueri fiktif → NO_MATCH, 0 kandidat', nonsense.status === 'NO_MATCH' && nonsense.candidates.length === 0);
const quarantined = resolveCanonicalCode('E.2', 'm3');
check('6.2 kode karantina E.2 → INVALID', quarantined.status === 'INVALID' && quarantined.unitPrice === null);
check('6.3 isQuarantined(E.2) + lookup katalog kosong', isQuarantined('E.2') && officialAhspRepository.getOfficialAhsp('E.2') === undefined);
const unknownCode = resolveCanonicalCode('9.9.9.9', 'm2');
check('6.4 kode tak dikenal → INVALID', unknownCode.status === 'INVALID');

console.log('\n== 7-8. Kebijakan DATABASE vs FULL_AI (kasus 7, 8, 16) ==');
const dbRefuse = resolveDedPriceWithCanonical('DATABASE', ceramic, { unitPrice: 850000, source: 'AI_ESTIMATE' });
check('7.1 DATABASE + NEEDS_REVIEW + estimasi wajar → AI_ESTIMATE fallback berlabel (keputusan owner 2026-10-27 malam)', dbRefuse.source === 'AI_ESTIMATE' && dbRefuse.unitPrice === 850000 && String(dbRefuse.notes || '').includes('tidak ditemukan di database'));
check('7.2 DATABASE + RESOLVED → AHSP_2026', resolveDedPriceWithCanonical('DATABASE', plaster, { unitPrice: 999999, source: 'AI_ESTIMATE' }).source === 'AHSP_2026');
check('7.3 DATABASE + NEEDS_REVIEW + estimasi tak wajar (50) → UNRESOLVED null', resolveDedPriceWithCanonical('DATABASE', ceramic, { unitPrice: 50, source: 'AI_ESTIMATE' }).source === 'UNRESOLVED');
check('7.4 DATABASE + NEEDS_REVIEW + harga hilang → UNRESOLVED null (bukan Rp0)', resolveDedPriceWithCanonical('DATABASE', ceramic, { unitPrice: null, source: 'UNRESOLVED' }).source === 'UNRESOLVED');
const fullKeep = resolveDedPriceWithCanonical('FULL_AI', ceramic, { unitPrice: 850000, source: 'AI_ESTIMATE' });
check('8.1 FULL_AI + NEEDS_REVIEW → estimasi dipertahankan + match terlampir', fullKeep.source === 'AI_ESTIMATE' && fullKeep.unitPrice === 850000 && fullKeep.ahspMatch.status === 'NEEDS_REVIEW');
check('8.2 FULL_AI + RESOLVED → upgrade ke kanonis', resolveDedPriceWithCanonical('FULL_AI', plaster, { unitPrice: 850000, source: 'AI_ESTIMATE' }).unitPrice === 51622);
check('16.1 gerbang standar DATABASE meneruskan estimasi sebagai fallback (adapter yang memutuskan)', resolveDedPriceForPolicy('DATABASE', 850000).priceSource === 'AI_ESTIMATE');
check('16.2 gerbang FullAI DATABASE meneruskan estimasi sebagai fallback (adapter yang memutuskan)', applyFullAiPricePolicy('DATABASE', { unitPrice: 850000, source: 'AI_ESTIMATE' }).source === 'AI_ESTIMATE');
check('16.3 USER_INPUT tidak pernah ditimpa', resolveDedPriceWithCanonical('DATABASE', plaster, { unitPrice: 777000, source: 'USER_INPUT' }).unitPrice === 777000);

console.log('\n== 9. Provenance kanonis lewat finalisasi (kasus 9) ==');
const out = DedAiCalculator.buildOutput({
  jobId: 'job-c', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Tes', pageCount: 1,
  items: [
    { id: 'a', name: 'Plesteran', category: 'X', units: 'm2', quantity: 10, quantitySource: 'DED_EXPLICIT', unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4', subtotal: null, sourcePages: [1], provenance: [], stage: 'PARSE' } as never,
    { id: 'b', name: 'Tanpa harga', category: 'X', units: 'm2', quantity: 5, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [1], provenance: [], stage: 'PARSE' } as never,
  ],
});
const itemA = (out.items as any[]).find((i: any) => i.id === 'a');
check('9.1 item kanonis lolos staging CALCULATED + subtotal', itemA.stage === 'CALCULATED' && itemA.subtotal === 516220);
check('9.2 provenance AHSP_2026 + kode bertahan', itemA.priceSource === 'AHSP_2026' && itemA.ahspCode === '3.7.4');
check('9.3 filter finalisasi hanya meloloskan item kanonis', (out.items as any[]).filter((i: any) => i.stage === 'CALCULATED' && i.subtotal != null && i.unitPrice != null).length === 1);
const v = verifySubtotal(10, 51622);
check('9.4 verifySubtotal kanonis terverifikasi', v.verified === true && v.subtotal === 516220);
const st = resolveFullAiItemStatus({ value: 10, unit: 'm2', provenance: 'EXPLICIT' }, { unitPrice: 51622, unit: 'm2', source: 'AHSP_2026' });
check('9.5 status FullAI item kanonis = READY', st.status === 'READY' && st.exclusionReason === null);

console.log('\n== 10. Klaim model + kode ≠ terverifikasi (kasus 10) ==');
const badClaim = resolveCanonicalCode('9.9.9.9', 'm2');
const downFull = resolveDedPriceWithCanonical('FULL_AI', badClaim, { unitPrice: 123456, source: 'VERIFIED_SOURCE', ahspCode: '9.9.9.9' });
check('10.1 FULL_AI: klaim gagal → AI_ESTIMATE (bukan VERIFIED)', downFull.source === 'AI_ESTIMATE' && downFull.unitPrice === 123456);
const downDb = resolveDedPriceWithCanonical('DATABASE', badClaim, { unitPrice: 123456, source: 'VERIFIED_SOURCE', ahspCode: '9.9.9.9' });
check('10.2 DATABASE: klaim gagal → AI_ESTIMATE perkiraan (bukan VERIFIED, bukan UNRESOLVED bila wajar)', downDb.source === 'AI_ESTIMATE' && downDb.unitPrice === 123456);

console.log('\n== 11. Draft lama tanpa korupsi provenance (kasus 11) ==');
const legacy = JSON.parse(JSON.stringify({
  id: 'fullai-1', name: 'Item lama',
  price: { unitPrice: 100000, unit: 'm2', source: 'VERIFIED_SOURCE', ahspCode: '3.7.4' },
}));
check('11.1 nilai VERIFIED_SOURCE lama utuh setelah round-trip', legacy.price.source === 'VERIFIED_SOURCE' && legacy.price.ahspCode === '3.7.4');
const legacyLabel = getDedPriceSourceLabel('VERIFIED_SOURCE').label;
check('11.2 label legacy netral (bukan "Terverifikasi")', legacyLabel !== 'Terverifikasi' && legacyLabel.toLowerCase().includes('belum terverifikasi'));
check('11.3 label kanonis baru', getDedPriceSourceLabel('AHSP_2026').label.includes('AHSP Kanonis'));

console.log('\n== 12. Total parsial + peringatan (kasus 12) ==');
check('12.1 grandTotal hanya item kanonis (parsial)', out.grandTotal === 516220);
check('12.2 coverage menandai item belum tuntas', out.coverage.itemsUnresolved === 1 && out.coverage.itemsFullyResolved === 1);
check('12.3 calcSubtotal null → null (bukan 0)', calcSubtotal(5, null) === null && calcSubtotal(null, 51622) === null);

console.log('\n== 13. Konfirmasi user bertahan (kasus 13) ==');
const confirmed = resolveCanonicalCode('3.7.4', 'm2');
const persisted = JSON.parse(JSON.stringify({ ahspMatch: confirmed, ahspCode: confirmed.matchedCode }));
check('13.1 match terkonfirmasi bertahan JSON', persisted.ahspMatch.status === 'RESOLVED' && persisted.ahspCode === '3.7.4');
check('13.2 konfirmasi ulang kode yang sama tetap RESOLVED', resolveCanonicalCode(persisted.ahspCode, 'm2').status === 'RESOLVED');

console.log('\n== 14. Normalisasi satuan + kalkulasi deterministik (kasus 14) ==');
check('14.1 m² dinormalisasi ke m2', canonicalUnitRegistry.normalize('m²') === 'm2');
check('14.2 m2 vs m3 tidak kompatibel dimensi', canonicalUnitRegistry.areDimensionallyCompatible('m2', 'm3') === false);
check('14.3 m2 vs m2 kompatibel', canonicalUnitRegistry.areDimensionallyCompatible('m2', 'm2') === true);
check('14.4 subtotal deterministik', calcSubtotal(10, 51622) === 516220);

console.log('\n== 15. Gagal provider tanpa fabrikasi (kasus 15) ==');
check('15.1 respons rusak → MALFORMED, 0 item', classifyPassOutcome(null, true).items.length === 0);
check('15.2 semua pass gagal → error tanpa item', !('items' in decideNoItemsError(['FAILED'], { errorCode: 'MODEL_ERROR', stage: 'ai', message: 'x', retryable: true })));

console.log('\n== 17. Master tidak berubah (kasus 17) ==');
const before = officialAhspRepository.getOfficialAhsp('3.7.4');
const cand = matchDedItemToAhsp({ name: 'pasang keramik lantai', unit: 'm2' }).candidates[0];
if (cand) (cand as any).name = 'DIUBAH';
const after = officialAhspRepository.getOfficialAhsp('3.7.4');
check('17.1 registry tidak termutasi lewat kandidat', after && after.name === before?.name);
check('17.2 ukuran katalog stabil', officialAhspRepository.size === 5742 && officialAhspRepository.getActiveOfficialAhsp().length === 5725);
check('17.3 karantina stabil', isQuarantined('E.2') && !isQuarantined('3.7.4'));

console.log('\n== Judul persis → auto-RESOLVED (aturan pengecualian) ==');
const exactTitle = matchDedItemToAhsp({ name: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm', unit: 'm2' });
check('X.1 judul katalog persis → RESOLVED 3.7.4', exactTitle.status === 'RESOLVED' && exactTitle.matchedCode === '3.7.4');

console.log('\n== QA Preview: draft & finalisasi mempertahankan identitas (kasus 10) ==');
// Kontrak data yang dipakai handler view.tsx (bukan komponen React-nya,
// yang tidak bisa di-mount di sini): handleSaveDraft menyimpan
// {...result, items} lewat JSON (localStorage), handleLoadDraft
// mengembalikan d.output apa adanya, handleFinalize menyaring stage
// CALCULATED + subtotal + unitPrice (standar) / READY + subtotal > 0 +
// unitPrice (Full AI). Tes ini mengunci kontrak tersebut.
const out2 = DedAiCalculator.buildOutput({
  jobId: 'job-d', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Tes Draft', pageCount: 1,
  items: [
    { id: 'a', name: 'Plesteran', category: 'X', units: 'm2', quantity: 10, quantitySource: 'DED_EXPLICIT', unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4', ahspMatch: plaster, subtotal: null, sourcePages: [1], provenance: [], stage: 'PARSE' } as never,
    { id: 'b', name: 'Tanpa harga', category: 'X', units: 'm2', quantity: 5, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [1], provenance: [], stage: 'PARSE' } as never,
  ],
});
const draftRoundTrip = JSON.parse(JSON.stringify({ ...out2, items: out2.items }));
const rtA = (draftRoundTrip.items as any[]).find((i: any) => i.id === 'a');
check('10.1 draft round-trip: policy + sumber + kode + match + stage utuh',
  draftRoundTrip.policy === 'DATABASE' && rtA.priceSource === 'AHSP_2026' && rtA.ahspCode === '3.7.4'
  && rtA.ahspMatch?.status === 'RESOLVED' && rtA.stage === 'CALCULATED' && rtA.subtotal === 516220);
check('10.2 filter finalisasi standar hanya meloloskan item kanonis',
  (draftRoundTrip.items as any[]).filter((i: any) => i.stage === 'CALCULATED' && i.subtotal != null && i.unitPrice != null).length === 1);
const fullAiDraftItem = {
  id: 'fullai-1', name: 'Plesteran',
  quantity: { value: 10, unit: 'm2', provenance: 'EXPLICIT' },
  price: { unitPrice: 51622, unit: 'm2', source: 'AHSP_2026', ahspCode: '3.7.4', ahspMatch: plaster },
  subtotal: 516220, status: 'READY',
};
const rtF = JSON.parse(JSON.stringify(fullAiDraftItem));
check('10.3 round-trip FullAI: sumber + kode + match utuh',
  rtF.price.source === 'AHSP_2026' && rtF.price.ahspCode === '3.7.4' && rtF.price.ahspMatch?.status === 'RESOLVED');
check('10.4 filter finalisasi FullAI meloloskan item kanonis READY',
  [rtF].filter((i: any) => i.status === 'READY' && i.subtotal != null && i.subtotal > 0 && i.price.unitPrice != null).length === 1);
const fullAiUnresolved = { ...rtF, status: 'NEEDS_CONFIRMATION', subtotal: null, price: { ...rtF.price, unitPrice: null, source: 'UNRESOLVED' } };
check('10.5 filter finalisasi FullAI menahan item tanpa harga',
  [fullAiUnresolved].filter((i: any) => i.status === 'READY' && i.subtotal != null && i.subtotal > 0 && i.price.unitPrice != null).length === 0);

console.log('\n== Audit QA: penjaga spesifikasi klaim kode (temuan §2) ==');
const ratioBad = matchDedItemToAhsp({ name: 'plesteran dinding 1:6', unit: 'm2', claimedAhspCode: '3.7.4' });
check('Q.1 rasio 1:6 + kode 1:4 → NEEDS_REVIEW, kode klaim kandidat pertama', ratioBad.status === 'NEEDS_REVIEW' && ratioBad.candidates[0]?.code === '3.7.4' && ratioBad.unitPrice === null);
const ratioGood = matchDedItemToAhsp({ name: 'plesteran dinding 1:4', unit: 'm2', claimedAhspCode: '3.7.4' });
check('Q.2 rasio 1:4 + kode 1:4 → RESOLVED 51622', ratioGood.status === 'RESOLVED' && ratioGood.unitPrice === 51622);
const thickBad = matchDedItemToAhsp({ name: 'plesteran tebal 15 cm', unit: 'm2', claimedAhspCode: '3.7.4' });
check('Q.3 tebal 15 cm + kode 15 mm → NEEDS_REVIEW', thickBad.status === 'NEEDS_REVIEW');
const thickGood = matchDedItemToAhsp({ name: 'plesteran tebal 1,5 cm', unit: 'm2', claimedAhspCode: '3.7.4' });
check('Q.4 tebal 1,5 cm (= 15 mm) + kode 15 mm → RESOLVED', thickGood.status === 'RESOLVED');
const sizeBad = matchDedItemToAhsp({ name: 'pasang keramik lantai 30x30', unit: 'm2', claimedAhspCode: '3.9.8.9' });
check('Q.5 keramik 30x30 + kode 20x20 → NEEDS_REVIEW, kode klaim pertama', sizeBad.status === 'NEEDS_REVIEW' && sizeBad.candidates[0]?.code === '3.9.8.9');
const vocabBad = matchDedItemToAhsp({ name: 'pekerjaan pembersihan lahan', unit: 'm2', claimedAhspCode: '3.7.4' });
check('Q.6 kosakata tak nyambung + kode plesteran → NEEDS_REVIEW', vocabBad.status === 'NEEDS_REVIEW');
const exactCmTrap = matchDedItemToAhsp({ name: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 cm', unit: 'm2' });
check('Q.7 judul persis kecuali mm/cm → TIDAK auto-RESOLVED', exactCmTrap.status !== 'RESOLVED');
check('Q.8 K-225 vs K-300 = konflik (helper langsung)', checkSpecCompatibility('beton K-225', 'beton K-300') !== null);
check('Q.9 K-225 vs K-225 = lolos', checkSpecCompatibility('beton K-225', 'beton K-225') === null);
check('Q.10 K-225 vs f\'c 20 = tidak dibandingkan (batas dokumentasi)', checkSpecCompatibility('beton K-225', 'beton f\'c 20 MPa') === null);
const quarantineClaim = matchDedItemToAhsp({ name: 'pekerjaan apa pun', unit: 'm3', claimedAhspCode: 'E.2' });
check('Q.11 klaim kode karantina → INVALID', quarantineClaim.status === 'INVALID' && quarantineClaim.unitPrice === null);

console.log('\n== Audit QA: edit satuan membatalkan harga kanonis (temuan §3) ==');
const canonItem = { id: 'a', name: 'Plesteran', category: 'X', units: 'm2', quantity: 10, quantitySource: 'DED_EXPLICIT', unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4', ahspMatch: plaster, subtotal: 516220, sourcePages: [1], provenance: [], stage: 'CALCULATED' } as never;
const changed = applyUnitChange(canonItem as never, 'm3');
check('Q.12 ganti satuan kanonis → UNRESOLVED, harga + kode hilang', (changed as any).priceSource === 'UNRESOLVED' && (changed as any).unitPrice === null && (changed as any).ahspCode === undefined && (changed as any).ahspMatch === undefined);
const unchanged = applyUnitChange(canonItem as never, 'm2');
check('Q.13 satuan sama → item utuh', unchanged === canonItem);
const aiItem = { ...(canonItem as any), priceSource: 'AI_ESTIMATE', unitPrice: 850000, ahspCode: undefined, ahspMatch: undefined };
const aiChanged = applyUnitChange(aiItem as never, 'm3');
check('Q.14 ganti satuan estimasi AI → harga dipertahankan (bukan klaim kanonis)', (aiChanged as any).unitPrice === 850000 && (aiChanged as any).priceSource === 'AI_ESTIMATE');

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
