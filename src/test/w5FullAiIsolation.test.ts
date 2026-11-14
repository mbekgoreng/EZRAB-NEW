/**
 * W5 — ISOLASI DATA FULL AI (§7 directive, keputusan koordinator C3).
 *
 * Run: npx tsx src/test/w5FullAiIsolation.test.ts
 *
 * Membuktikan dengan asersi dependensi (spy/mock pada boundary) bahwa
 * generasi FULL_AI TIDAK memanggil resolver AHSP internal, resolver harga
 * material/upah/alat, katalog fallback, maupun externalPriceReferences —
 * DAN bahwa EZRAB_AI MODE tetap memakai layanan datanya.
 *
 * Batas pembuktian (jujur): runExecute end-to-end TIDAK dijalankan di
 * sini (butuh parse PDF + gateway AI; tidak ada satu pun suite di repo
 * ini yang menjalankan execute — semua suite menguji fungsi murni yang
 * diekspor). Yang dibuktikan: (1) fungsi gerbang resolveFullAiItemPrice
 * — satu-satunya jalan runExecute ke adapter — dengan spy; (2) pin
 * statis bahwa runExecute merute lewat fungsi gerbang itu dan tidak ada
 * panggilan adapter langsung tersisa di service.ts; (3) helper
 * penyelesaian + validator dengan mode eksplisit. Lihat LAPORAN-W5.md.
 */
import { readFileSync } from 'node:fs';
import { modeFromLegacy } from '../ai-tools/ded-ai-estimate/dedMode';
import {
  dataSourceAccessFor, modeFromPolicy, resolveDedRabAiMode,
  canUseCanonicalCatalog, canUseCanonicalPricing,
  canUseExternalPriceReferences, canConfirmCanonicalCandidate,
  canUseJakartaPriceTable,
} from '../ai-tools/ded-full-ai/dataSourcePolicy';
import {
  applyFullAiPricePolicy, resolveFullAiItemPrice,
  completeFullAiPrices, completeFullAiQuantities,
  buildFullAiPriceCompletion,
} from '../ai-tools/ded-full-ai/service';
import { validateFullAiItem } from '../ai-tools/ded-full-ai/validator';
import { EXTERNAL_PRICE_REFERENCES } from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-11-10T00:00:00Z');

const mk = (over: Partial<FullAiItem>): FullAiItem => ({
  id: 'w5', no: 1, name: 'Item', category: 'Uji',
  quantity: { value: 10, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
  price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
  subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_UNIT_PRICE',
  ...over,
} as FullAiItem);

// ===========================================================================
// A. Modul kebijakan data-source (murni)
// ===========================================================================
console.log('== A. dataSourcePolicy: peta akses per mode ==');
{
  const full = dataSourceAccessFor('FULL_AI');
  check('A1 FULL_AI: katalog AHSP kanonis TERTUTUP (D1/D3, I1–I5, J1–J5)', full.canonicalAhspCatalog === false);
  check('A2 FULL_AI: resolusi harga kanonis TERTUTUP (D2)', full.canonicalPricing === false);
  check('A3 FULL_AI: externalPriceReferences TERTUTUP (D4/D6/D8)', full.externalPriceReferences === false);
  check('A4 FULL_AI: tabel harga Jakarta TERTUTUP (D10)', full.jakartaPriceTable === false);
  check('A5 FULL_AI: layanan kuantitas TETAP (D5/D9, bukan katalog harga)', full.quantityServices === true);
  check('A6 FULL_AI: registry satuan + pita kewajaran + WBS + parser + kosakata TETAP',
    full.unitRegistry === true && full.sanityBand === true && full.wbsClassification === true
    && full.documentParser === true && full.priceSourceVocabulary === true);
  const ez = dataSourceAccessFor('EZRAB_AI');
  check('A7 EZRAB_AI: SEMUA sumber terbuka seperti hari ini',
    ez.canonicalAhspCatalog && ez.canonicalPricing && ez.externalPriceReferences
    && ez.jakartaPriceTable && ez.quantityServices && ez.unitRegistry && ez.sanityBand
    && ez.wbsClassification && ez.documentParser && ez.priceSourceVocabulary);
  check('A8 helper gerbang konsisten dengan peta akses',
    canUseCanonicalCatalog('FULL_AI') === false && canUseCanonicalPricing('FULL_AI') === false
    && canUseExternalPriceReferences('FULL_AI') === false && canConfirmCanonicalCandidate('FULL_AI') === false
    && canUseJakartaPriceTable('FULL_AI') === false
    && canUseCanonicalCatalog('EZRAB_AI') === true && canUseCanonicalPricing('EZRAB_AI') === true
    && canUseExternalPriceReferences('EZRAB_AI') === true && canConfirmCanonicalCandidate('EZRAB_AI') === true
    && canUseJakartaPriceTable('EZRAB_AI') === true);
  // REKONSILIASI (keputusan koordinator: MESIN-menang): pin A9/A10/B10 di
  // bawah menegaskan aturan lama POLICY-menang (DATABASE → EZRAB_AI) yang
  // kini disupersede — modeFromPolicy mendelegasikan ke modeFromLegacy
  // dengan sinyal mesin Full AI (konstanta modul ini), sehingga DATABASE
  // pun → FULL_AI. Justifikasi: satu aturan migrasi di seluruh program
  // (dedMode.ts satu-satunya sumber kebenaran); jalur produksi tak
  // berubah (view meneruskan rabMode eksplisit). Kekuatan SAMA/lebih:
  // A9 3 → 5 konjungsi (ditambah kesetaraan delegasi), A10 tetap 4,
  // B10 tetap 3.
  check('A9 modeFromPolicy MESIN-menang: FULL_AI→FULL_AI, DATABASE→FULL_AI, undefined→FULL_AI; ≡ modeFromLegacy({policy, fullAi:true})',
    modeFromPolicy('FULL_AI') === 'FULL_AI' && modeFromPolicy('DATABASE') === 'FULL_AI'
    && modeFromPolicy(undefined) === 'FULL_AI'
    && modeFromPolicy('DATABASE') === modeFromLegacy({ policy: 'DATABASE', fullAi: true })
    && modeFromPolicy('FULL_AI') === modeFromLegacy({ policy: 'FULL_AI', fullAi: true }));
  check('A10 resolveDedRabAiMode: eksplisit menang, bila absen fallback mesin-menang (selalu FULL_AI di mesin ini)',
    resolveDedRabAiMode('EZRAB_AI', 'FULL_AI') === 'EZRAB_AI'
    && resolveDedRabAiMode('FULL_AI', 'DATABASE') === 'FULL_AI'
    && resolveDedRabAiMode(undefined, 'DATABASE') === 'FULL_AI'
    && resolveDedRabAiMode(undefined, undefined) === 'FULL_AI');
  check('A11 dataSourceAccessFor mengembalikan objek baru (tidak termutasi antar panggilan)',
    dataSourceAccessFor('FULL_AI') !== dataSourceAccessFor('FULL_AI'));
}

// ===========================================================================
// B. Gerbang harga applyFullAiPricePolicy (G-IS-2, kini gerbang nyata)
// ===========================================================================
console.log('== B. applyFullAiPricePolicy ==');
{
  const claim = { unitPrice: 1150000, unit: 'm3', source: 'AHSP_2026', ahspCode: '3.7.4' };
  const gated = applyFullAiPricePolicy('FULL_AI', claim, 'FULL_AI');
  check('B1 FULL_AI: klaim AHSP_2026 diturunkan jadi AI_ESTIMATE, angka model dipertahankan',
    gated.source === 'AI_ESTIMATE' && gated.unitPrice === 1150000);
  check('B2 FULL_AI: kode AHSP dicabut + catatan alasan tercantum',
    gated.ahspCode === undefined && typeof gated.notes === 'string' && gated.notes.includes('tidak dikonfirmasi di mode Full AI'));
  check('B3 FULL_AI: gerbang tidak memutasi objek harga input',
    claim.source === 'AHSP_2026' && claim.ahspCode === '3.7.4' && gated !== claim);
  const legacy = applyFullAiPricePolicy('FULL_AI', { unitPrice: 1150000, unit: 'm3', source: 'VERIFIED_SOURCE', ahspCode: '3.7.4' }, 'FULL_AI');
  check('B4 FULL_AI: klaim VERIFIED_SOURCE legasi juga diturunkan',
    legacy.source === 'AI_ESTIMATE' && legacy.ahspCode === undefined);
  const est = { unitPrice: 1150000, unit: 'm3', source: 'AI_ESTIMATE' };
  check('B5 FULL_AI: AI_ESTIMATE diteruskan apa adanya',
    applyFullAiPricePolicy('FULL_AI', est, 'FULL_AI') === est);
  const user = { unitPrice: 900000, unit: 'm3', source: 'USER_INPUT' };
  check('B6 FULL_AI: USER_INPUT tidak pernah disentuh',
    applyFullAiPricePolicy('FULL_AI', user, 'FULL_AI') === user);
  const unresolved = { unitPrice: null, unit: 'm3', source: 'UNRESOLVED' };
  check('B7 FULL_AI: UNRESOLVED null diteruskan (bukan Rp0)',
    applyFullAiPricePolicy('FULL_AI', unresolved, 'FULL_AI') === unresolved);
  const dbClaim = { unitPrice: 1150000, unit: 'm3', source: 'VERIFIED_SOURCE', ahspCode: '3.7.4' };
  check('B8 EZRAB_AI: klaim diteruskan apa adanya (adapter yang memutuskan)',
    applyFullAiPricePolicy('DATABASE', dbClaim, 'EZRAB_AI') === dbClaim);
  const dbAhsp = { unitPrice: 1150000, unit: 'm3', source: 'AHSP_2026', ahspCode: '3.7.4' };
  check('B9 EZRAB_AI: klaim AHSP_2026 diteruskan apa adanya',
    applyFullAiPricePolicy('DATABASE', dbAhsp, 'EZRAB_AI') === dbAhsp);
  check('B10 pemanggil 2-argumen lama MESIN-menang: DATABASE pun menurunkan klaim (tanpa rabMode eksplisit → FULL_AI); AI_ESTIMATE tetap diteruskan',
    applyFullAiPricePolicy('DATABASE', { unitPrice: 1, source: 'VERIFIED_SOURCE' }).source === 'AI_ESTIMATE'
    && applyFullAiPricePolicy('FULL_AI', { unitPrice: 1, source: 'VERIFIED_SOURCE' }).source === 'AI_ESTIMATE'
    && applyFullAiPricePolicy('FULL_AI', { unitPrice: 1, source: 'AI_ESTIMATE' }).source === 'AI_ESTIMATE');
}

// ===========================================================================
// C. resolveFullAiItemPrice dengan spy pada boundary adapter (G-IS-1)
// ===========================================================================
console.log('== C. resolveFullAiItemPrice + spy adapter ==');
{
  const fakeMatch = {
    status: 'RESOLVED', matchedCode: '9.9.9', matchedName: 'Palsu',
    unitPrice: 999001, unit: 'm2', sourceDocument: 'SPY', period: '2026',
    candidates: [], reason: 'spy', missingComponents: [], resolutionPath: ['SPY'],
  } as never;
  const fakeDecision = {
    unitPrice: 999001, source: 'AHSP_2026', unit: 'm2',
    ahspCode: '9.9.9', notes: 'keputusan spy', ahspMatch: fakeMatch,
  } as never;

  let matchCalls = 0;
  let resolveCalls = 0;
  let seenInput: any = null;
  const spyDeps = {
    matchItem: (input: any) => { matchCalls++; seenInput = input; return fakeMatch; },
    resolvePrice: (_p: any, _m: any, _f: any) => { resolveCalls++; return fakeDecision; },
  };
  const base = {
    name: 'Pekerjaan Beton Bertulang',
    quantityUnit: 'm3',
    description: 'Beton K-300',
    claimedAhspCode: '3.7.4',
    price: { unitPrice: 85000, unit: 'm3', source: 'AI_ESTIMATE', region: 'Jakarta', period: '2026' },
  };

  // FULL_AI: spy TIDAK BOLEH dipanggil — walau nama cocok & kode diklaim.
  const fullAi = resolveFullAiItemPrice({ rabMode: 'FULL_AI', policy: 'FULL_AI', ...base, deps: spyDeps });
  check('C1 FULL_AI: matchDedItemToAhsp TIDAK dipanggil (spy 0)', matchCalls === 0);
  check('C2 FULL_AI: resolveDedPriceWithCanonical TIDAK dipanggil (spy 0)', resolveCalls === 0);
  check('C3 FULL_AI: estimasi AI dipertahankan (angka + sumber + wilayah/ periode model)',
    fullAi.finalPrice.unitPrice === 85000 && fullAi.finalPrice.source === 'AI_ESTIMATE'
    && fullAi.finalPrice.region === 'Jakarta' && fullAi.finalPrice.period === '2026');
  check('C4 FULL_AI: tanpa kode AHSP + tanpa ahspMatch (tidak ada kandidat review)',
    fullAi.finalPrice.ahspCode === undefined && fullAi.ahspMatch === undefined);

  // FULL_AI + klaim kanonis yang lolos gerbang: pertahanan kedua.
  const smuggled = resolveFullAiItemPrice({
    rabMode: 'FULL_AI', policy: 'FULL_AI', ...base,
    price: { unitPrice: 85000, unit: 'm3', source: 'AHSP_2026', ahspCode: '3.7.4' },
    deps: spyDeps,
  });
  check('C5 FULL_AI: klaim kanonis selundupan dinormalisasi jadi AI_ESTIMATE, spy tetap 0',
    smuggled.finalPrice.source === 'AI_ESTIMATE' && smuggled.finalPrice.ahspCode === undefined
    && smuggled.finalPrice.unitPrice === 85000 && matchCalls === 0 && resolveCalls === 0);

  // EZRAB_AI: spy DIPANGGIL, harga kanonis menang (perilaku lama).
  const ez = resolveFullAiItemPrice({ rabMode: 'EZRAB_AI', policy: 'DATABASE', ...base, deps: spyDeps });
  check('C6 EZRAB_AI: matchDedItemToAhsp dipanggil 1× dengan nama/satuan/kode klaim',
    matchCalls === 1 && seenInput?.name === 'Pekerjaan Beton Bertulang'
    && seenInput?.unit === 'm3' && seenInput?.claimedAhspCode === '3.7.4');
  check('C7 EZRAB_AI: resolveDedPriceWithCanonical dipanggil 1×', resolveCalls === 1);
  check('C8 EZRAB_AI: harga kanonis menang atas estimasi AI (perilaku lama utuh)',
    ez.finalPrice.unitPrice === 999001 && ez.finalPrice.source === 'AHSP_2026'
    && ez.finalPrice.ahspCode === '9.9.9' && ez.finalPrice.region === 'Nasional'
    && ez.finalPrice.period === '2026');
  check('C9 EZRAB_AI: ahspMatch terlampir untuk review', ez.ahspMatch === fakeMatch);

  // EZRAB_AI dengan adapter ASLI (tanpa deps): adapter benar-benar berjalan.
  const real = resolveFullAiItemPrice({
    rabMode: 'EZRAB_AI', policy: 'DATABASE',
    name: 'Pekerjaan Uji Tanpa Padanan W5 ZZZ', quantityUnit: 'm2',
    price: { unitPrice: 85000, unit: 'm2', source: 'AI_ESTIMATE' },
  });
  check('C10 EZRAB_AI (adapter asli): match berjalan (ahspMatch terisi), tanpa padanan → estimasi AI jadi fallback',
    real.ahspMatch !== undefined && real.ahspMatch.status === 'NO_MATCH'
    && real.finalPrice.unitPrice === 85000 && real.finalPrice.source === 'AI_ESTIMATE');
}

// ===========================================================================
// D. Penyelesaian harga/kuantitas (G-IS-5)
// ===========================================================================
console.log('== D. completeFullAiPrices / completeFullAiQuantities ==');
{
  const priceFixture = () => [mk({
    id: 'd1', name: 'Rangka Atap Baja Ringan',
    quantity: { value: 90, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
  })];

  const fullAiItems = priceFixture();
  const fullAiFilled = completeFullAiPrices(fullAiItems, { now: NOW, rabMode: 'FULL_AI' });
  check('D1 FULL_AI: completeFullAiPrices mengembalikan 0 (tanpa externalPriceReferences)',
    fullAiFilled === 0);
  check('D2 FULL_AI: item TIDAK disentuh (harga tetap null, tanpa blok, tanpa penanda isian)',
    fullAiItems[0].price.unitPrice === null && fullAiItems[0].price.priceCompletion === undefined
    && fullAiItems[0].priceCompletion === undefined && !fullAiItems[0].price.filledFromExternalRef);

  const ezItems = priceFixture();
  const ezFilled = completeFullAiPrices(ezItems, { now: NOW, rabMode: 'EZRAB_AI' });
  check('D3 EZRAB_AI: penyelesaian referensi TETAP berjalan (terisi Rp165.000 + blok terstruktur)',
    ezFilled === 1 && ezItems[0].price.unitPrice === 165000
    && ezItems[0].price.filledFromExternalRef === true
    && ezItems[0].price.priceCompletion?.referenceId !== undefined);

  const legacyItems = priceFixture();
  check('D4 tanpa rabMode: perilaku lama dipertahankan (terisi, untuk pemanggil/tes lama)',
    completeFullAiPrices(legacyItems, { now: NOW }) === 1 && legacyItems[0].price.unitPrice === 165000);

  // Kuantitas (D5/D9): BOLEH TETAP di kedua mode — buktikan jalurnya utuh.
  const qtyItems: FullAiItem[] = [
    mk({ id: 'q1', name: 'Pemasangan Keramik Lantai 40x40', quantity: { value: 48.5, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' }, subtotal: 4850000, subtotalVerified: true, status: 'READY', exclusionReason: null }),
    mk({ id: 'q2', name: 'Titik Penerangan', quantity: { value: null, unit: 'titik', provenance: 'UNRESOLVED', confidence: 'LOW' }, price: { unitPrice: 185000, unit: 'titik', source: 'AI_ESTIMATE' } }),
  ];
  const qtyFilled = completeFullAiQuantities(qtyItems);
  check('D5 layanan kuantitas bersama TETAP (isi konteks 6 + audit ESTIMATED_FROM_CONTEXT)',
    qtyFilled === 1 && qtyItems[1].quantity.value === 6
    && qtyItems[1].quantity.quantityAudit?.classification === 'ESTIMATED_FROM_CONTEXT');
}

// ===========================================================================
// E. Validator (G-IS-6: D8 ditutup, D7 dipertahankan)
// ===========================================================================
console.log('== E. Validator ==');
{
  const p1ref = EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-pintu-p1-double-hpl')!;
  const conflictRaw = {
    name: 'Pintu Double Kayu Kamper P1',
    quantity: { value: 1, unit: 'unit', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: {
      unitPrice: 3500000, unit: 'unit', source: 'AI_ESTIMATE', filledFromExternalRef: true,
      priceCompletion: buildFullAiPriceCompletion(p1ref, { originalUnitPrice: null, now: NOW }),
    },
  };
  const legacy = validateFullAiItem(conflictRaw, 0);
  check('E1 tanpa mode: konflik spesifikasi blok TETAP terdeteksi (perilaku lama)',
    legacy.warnings.some((w) => w.includes('konflik spesifikasi')));
  const ez = validateFullAiItem(conflictRaw, 0, { rabMode: 'EZRAB_AI' });
  check('E2 EZRAB_AI: konflik spesifikasi blok TETAP terdeteksi',
    ez.warnings.some((w) => w.includes('konflik spesifikasi')));
  const fullAi = validateFullAiItem(conflictRaw, 0, { rabMode: 'FULL_AI' });
  check('E3 FULL_AI: TIDAK ada pemeriksaan terhadap referensi internal (tanpa peringatan konflik)',
    !fullAi.warnings.some((w) => w.includes('konflik spesifikasi')));

  const insane = validateFullAiItem({
    name: 'Item Harga Aneh',
    quantity: { value: 1, unit: 'm2', provenance: 'DERIVED', confidence: 'HIGH' },
    price: { unitPrice: 50, unit: 'm2', source: 'AI_ESTIMATE' },
  }, 0, { rabMode: 'FULL_AI' });
  check('E4 FULL_AI: pita kewajaran isSaneEstimate TETAP (peringatan, D7 didokumentasikan bukan katalog)',
    insane.valid && insane.warnings.some((w) => w.includes('isSaneEstimate')));

  const badAudit = validateFullAiItem({
    name: 'Item Audit Aneh',
    quantity: { value: 5, unit: 'm2', provenance: 'ASSUMPTION', confidence: 'MEDIUM', quantityAudit: { classification: 'KARANGAN' } },
    price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' },
  }, 0, { rabMode: 'FULL_AI' });
  check('E5 FULL_AI: pemeriksaan enum blok TETAP berjalan (konsistensi internal, bukan katalog)',
    badAudit.warnings.some((w) => w.includes('bukan kelas DedQuantityClass')));

  const mismatch = validateFullAiItem({
    name: 'Item Selisih Blok',
    quantity: { value: 1, unit: 'unit', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: {
      unitPrice: 3500000, unit: 'unit', source: 'AI_ESTIMATE', filledFromExternalRef: true,
      priceCompletion: {
        ...buildFullAiPriceCompletion(p1ref, { originalUnitPrice: null, now: NOW }),
        recommendedPrice: 12345,
      },
    },
  }, 0, { rabMode: 'FULL_AI' });
  check('E6 FULL_AI: konsistensi recommendedPrice vs harga item TETAP diperiksa',
    mismatch.warnings.some((w) => w.includes('tidak sama dengan harga item')));
}

// ===========================================================================
// F. Pin wiring statis (gerbang terpasang di titik panggil yang benar)
// ===========================================================================
console.log('== F. Pin wiring statis ==');
{
  const serviceSrc = readFileSync(new URL('../ai-tools/ded-full-ai/service.ts', import.meta.url), 'utf8');
  const validatorSrc = readFileSync(new URL('../ai-tools/ded-full-ai/validator.ts', import.meta.url), 'utf8');
  const viewSrc = readFileSync(new URL('../ai-tools/ded-full-ai/FullAiResultView.tsx', import.meta.url), 'utf8');
  const policySrc = readFileSync(new URL('../ai-tools/ded-full-ai/dataSourcePolicy.ts', import.meta.url), 'utf8');

  check('F1 runExecute menurunkan mode dari options.rabMode + policy',
    serviceSrc.includes('resolveDedRabAiMode(options.rabMode, policy)'));
  check('F2 runExecute merute resolusi harga lewat resolveFullAiItemPrice',
    serviceSrc.includes('resolveFullAiItemPrice({'));
  check('F3 TIDAK ADA panggilan adapter langsung tersisa di service.ts (hanya referensi default deps)',
    !serviceSrc.includes('matchDedItemToAhsp(') && !serviceSrc.includes('resolveDedPriceWithCanonical(')
    && serviceSrc.includes('args.deps?.matchItem ?? matchDedItemToAhsp')
    && serviceSrc.includes('args.deps?.resolvePrice ?? resolveDedPriceWithCanonical'));
  check('F4 runExecute meneruskan rabMode ke validator + penyelesaian harga',
    serviceSrc.includes('validateFullAiItem(normalized, i, { rabMode })')
    && serviceSrc.includes('completeFullAiPrices(items, { rabMode })'));
  check('F5 gerbang kanonis memakai predikat kebijakan (bukan cabang policy mentah)',
    serviceSrc.includes('canUseCanonicalCatalog(rabMode)'));
  check('F6 validator menggerbang lookup referensi pada predikat kebijakan',
    validatorSrc.includes('canUseExternalPriceReferences(opts.rabMode)'));
  check('F7 view: handler konfirmasi kandidat dijaga + tombol Pilih kondisional + mode diteruskan ke kartu',
    viewSrc.includes('canConfirmCanonicalCandidate(rabMode)')
    && viewSrc.includes('if (!allowCanonicalConfirm)')
    && viewSrc.includes('{allowCanonicalConfirm && (')
    && viewSrc.includes('rabMode={rabMode}'));
  // Impor (termasuk yang multi-baris): kumpulkan modul sumbernya.
  const policyImportSources = [...policySrc.matchAll(/import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g)]
    .map((m) => m[1]);
  const hasRuntimeImport = /import\s+(?!type\b)/.test(policySrc);
  check('F8 dataSourcePolicy TANPA dependensi runtime ke katalog/harga (hanya type + dedMode murni)',
    policyImportSources.length > 0
    && policyImportSources.every((s) => s === './types' || s === '../ded-ai-estimate/dedMode')
    && hasRuntimeImport // impor runtime HANYA ke dedMode (modul murni tanpa impor) — diverifikasi baris di atas
    && !policyImportSources.some((s) => /ded-canonical|externalPriceReferences|priceCompletion|pricing|priceDatabase|officialAhsp/.test(s)));
}

console.log(`\nHASIL W5: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
