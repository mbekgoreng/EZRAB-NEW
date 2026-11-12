/**
 * EZRAB — AI INTELLIGENCE OVERHAUL, FASE 4: CONSTRUCTION INTELLIGENCE
 * — TEST SUITE C4 (pemetaan matriks direktif Part 16 C: CON-01…12).
 *
 * Jalankan: npx --yes tsx src/test/chatConstructionIntelligencePhase4.test.ts
 * Gaya runner: sama seperti chatSpecChain.test.ts (self-runner, tanpa vitest).
 * Provider nyata NOT RUN (0 panggilan). Semua bukti di sini mock/unit
 * terkendali + integrasi lokal (resolver/katalog/builder asli repo).
 */

import { strict as assert } from 'assert';
import {
  extractUniversalContext,
  classifyUniversal,
  serializeUniversalIntakeContext,
  rehydrateUniversalIntakeContext,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  validateProjectTaxonomy,
  familySupportReport,
  gapSubcategories,
  PROJECT_FAMILIES,
} from '../ai-tools/ezrab-ai/projectTaxonomy';
import {
  parseBuildingsFromText,
  upsertBuilding,
  updateBuildingFloors,
  buildingSummaryLines,
  applyBuildingsToContext,
  emptyBuilding,
} from '../ai-tools/ezrab-ai/multiBuilding';
import {
  assessBudgetFeasibility,
  budgetCapFromContext,
  formatBudgetFeasibilityLine,
} from '../ai-tools/ezrab-ai/budgetFeasibility';
import {
  detectTechnicalConflicts,
  formatConflictLines,
} from '../ai-tools/ezrab-ai/technicalConflicts';
import {
  retrieveDomainCandidates,
  verifyAhspCandidate,
} from '../ai-tools/ezrab-ai/constructionDomainRetrieval';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import {
  checkQtoAgainstUserDimensions,
  formatQtoCheckLines,
} from '../ai-tools/ezrab-ai/qtoBridge';
import { extractSpecsFromDedOutput } from '../ai-tools/ezrab-ai/dedUnderstanding';
import { validateStructuredSpecs } from '../ai-tools/ezrab-ai/structuredSpec';
import type { StructuredSpec, SpecKind, SpecStatus } from '../ai-tools/ezrab-ai/structuredSpec';
import {
  buildUniversalDraft,
  formatUniversalDraftMessage,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import { extractRabNeeds } from '../ai-tools/ezrab-ai/rabNeeds';
import { specRabHijackGuard } from '../ai-tools/ezrab-ai/actionRegistry';
import { resolveDeterministicPick } from '../ai-tools/ezrab-ai/specChain';
import {
  selectQuestionnaireQuestions,
  isSpecSatisfiedAcrossSources,
} from '../ai-tools/ezrab-ai/questionnaire';
import { buildCanonicalContext } from '../ai-tools/ezrab-ai/canonicalContext';

const NOW = '2026-11-12T05:00:00.000Z';
function S(
  key: string, kind: SpecKind, label: string,
  value: StructuredSpec['value'],
  status: SpecStatus = 'CONFIRMED',
  source: StructuredSpec['source'] = 'kuesioner',
): StructuredSpec {
  return { key, kind, label, value, status, source, updatedAt: NOW, supersedes: null };
}

let passed = 0;
let failed = 0;
const failedNames: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    failedNames.push(name);
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

function draftOf(text: string, specs?: StructuredSpec[]): UniversalDraft {
  const res = buildUniversalDraft(text, undefined, specs ? { structuredSpecs: specs } : undefined);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

const KANDANG_TEXT =
  'buatkan RAB kandang sapi terbuka 17 x 9 m kapasitas 30 ekor penutup atap Galvalum lantai beton miring anggaran 300 juta anggaran 250 juta';
function kandangSpecs(): StructuredSpec[] {
  return [
    S('kandang-capacity', 'count', 'Kapasitas kandang', 30),
    S('kandang-roof-material', 'material', 'Material penutup atap kandang', 'Galvalum'),
    S('budget', 'condition', 'Anggaran', 250_000_000),
  ];
}

console.log('== C4-01 / CON-01 — kandang 20 ekor → intake adaptif relevan ==');
test('C4-01 kandang 20 ekor: primer kandang, count 20 ekor, kuesioner tidak menanyakan kapasitas lagi', () => {
  const ctx = extractUniversalContext('Buatkan RAB kandang sapi 20 ekor, 17 m x 9 m, atap Galvalum, budget 300 jt');
  assert.equal(ctx.primary?.id, 'kandang');
  assert.ok(ctx.counts.some((c) => c.value === 20 && c.unit === 'ekor'), 'count 20 ekor harus terekstrak');
  const qs = selectQuestionnaireQuestions(ctx);
  assert.ok(!qs.some((q) => q.key === 'kandang-capacity'), 'kapasitas sudah terkonfirmasi — jangan ditanya lagi');
  assert.ok(!qs.some((q) => q.key === 'kandang-roof-material'), 'atap Galvalum sudah disebut di percakapan — jangan ditanya lagi');
});

console.log('== C4-02 / CON-02 — gedung campuran → komponen fungsional terpisah ==');
test('C4-02 gedung campuran: multi-disiplin, primer kantor, sekunder gudang + kolam terpisah', () => {
  const cls = classifyUniversal('Buatkan RAB gedung perkantoran 3 lantai dengan gudang dan kolam renang');
  assert.equal(cls.isMulti, true);
  assert.equal(cls.primary?.id, 'kantor');
  const secondaryIds = cls.secondary.map((d) => d.id);
  assert.ok(secondaryIds.includes('gudang-industri'), `sekunder harus memuat gudang-industri, dapat: ${secondaryIds.join(',')}`);
  assert.ok(secondaryIds.includes('kolam'), `sekunder harus memuat kolam, dapat: ${secondaryIds.join(',')}`);
});

console.log('== C4-03 / CON-03 — multi-gedung: lantai per bangunan dipertahankan ==');
test('C4-03 parse 2 gedung: tiap bangunan menyimpan lantainya sendiri', () => {
  const buildings = parseBuildingsFromText('Buatkan RAB proyek 2 gedung: gedung A 3 lantai dan gedung B 2 lantai');
  assert.equal(buildings.length, 2);
  assert.equal(buildings[0].floors, 3);
  assert.equal(buildings[1].floors, 2);
});
test('C4-03 revisi gedung A (3→4 lantai) tidak merusak gedung B (tetap 2)', () => {
  const buildings = parseBuildingsFromText('gedung A 3 lantai dan gedung B 2 lantai');
  const revised = updateBuildingFloors(buildings, 'gedung-a', 4);
  assert.equal(revised.find((b) => b.id === 'gedung-a')?.floors, 4);
  assert.equal(revised.find((b) => b.id === 'gedung-b')?.floors, 2);
  assert.equal(revised.length, 2);
});
test('C4-03 intake + builder kanonis: ringkasan memuat kedua bangunan (bukan satu angka runtuh)', () => {
  const ctx = extractUniversalContext('Buatkan RAB proyek 2 gedung: gedung A 3 lantai dan gedung B 2 lantai');
  assert.equal(ctx.buildings.length, 2);
  assert.equal(ctx.floors, 3, 'floors warisan = lantai bangunan utama');
  const built = buildCanonicalContext({
    messages: [{ role: 'user', content: 'Buatkan RAB proyek 2 gedung: gedung A 3 lantai dan gedung B 2 lantai' }],
    intakeContext: ctx,
  });
  assert.ok(built.dataBlock.includes('Gedung A: 3 lantai'), 'builder harus memuat Gedung A 3 lantai');
  assert.ok(built.dataBlock.includes('Gedung B: 2 lantai'), 'builder harus memuat Gedung B 2 lantai');
  assert.ok(buildingSummaryLines(ctx.buildings).join('\n').includes('Gedung B'), 'ringkasan bangunan memuat Gedung B');
});
test('C4-03 upsert: patch satu bangunan tidak menimpa medan bangunan lain', () => {
  const base = [emptyBuilding('gedung-a', 'Gedung A'), emptyBuilding('gedung-b', 'Gedung B')];
  const withFloors = upsertBuilding(upsertBuilding(base, { id: 'gedung-a', floors: 5 }), { id: 'gedung-b', floors: 2 });
  const patched = upsertBuilding(withFloors, { id: 'gedung-a', lengthM: 20 });
  assert.equal(patched.find((b) => b.id === 'gedung-a')?.floors, 5, 'lantai A bertahan saat patch dimensi');
  assert.equal(patched.find((b) => b.id === 'gedung-a')?.lengthM, 20);
  assert.equal(patched.find((b) => b.id === 'gedung-b')?.floors, 2);
});
test('C4-03 serialisasi: bangunan selamat dari round-trip simpan/muat', () => {
  const ctx = extractUniversalContext('Buatkan RAB proyek 2 gedung: gedung A 3 lantai dan gedung B 2 lantai');
  const raw = serializeUniversalIntakeContext(ctx);
  const restored = rehydrateUniversalIntakeContext(raw);
  assert.ok(restored, 'rehidrasi harus berhasil');
  assert.equal(restored!.buildings.length, 2);
  assert.equal(restored!.buildings[1].floors, 2);
});

console.log('== C4-04 / CON-04 — proyek jalan: subtipe diklarifikasi, tanpa asumsi diam-diam ==');
test('C4-04 jalan tanpa spek perkerasan: pick deterministik null (tidak memaksa template)', () => {
  const pick = resolveDeterministicPick({ id: 'jalan' }, [], [{ template: { id: 'INFRA-ROAD-RIGID', name: 'x' }, score: 1 }]);
  assert.equal(pick, null, 'tanpa jawaban perkerasan, tidak boleh ada pick diam-diam');
});
test('C4-04 telford: AMBIGUOUS_PICK tercatat + pesan draft meminta klarifikasi eksplisit', () => {
  const draft = draftOf('buatkan RAB jalan telford sepanjang 1 km lebar 6 m', [
    S('road-pavement', 'material', 'Jenis perkerasan jalan', 'Telford'),
  ]);
  assert.ok(draft.chainValidation!.ambiguousPicks.some((a) => a.scope === 'jalan' && /telford/i.test(a.reason)));
  const msg = formatUniversalDraftMessage(draft);
  assert.ok(/Klarifikasi/.test(msg), 'pesan draft harus meminta klarifikasi eksplisit');
  assert.ok(/Makadam|Rigid/.test(msg), 'pesan klarifikasi harus menyebut kandidat');
});

console.log('== C4-05 / CON-05 — proyek kolam: klasifikasi mandiri ==');
test('C4-05 "kolam renang di halaman rumah" → primer kolam (bukan subordinat rumah)', () => {
  const cls = classifyUniversal('Buatkan RAB kolam renang di halaman rumah 10 x 5 m');
  assert.equal(cls.primary?.id, 'kolam');
});
test('C4-05 kontrol: "rumah dengan kolam renang" → primer rumah, kolam sekunder', () => {
  const cls = classifyUniversal('Buatkan RAB rumah dengan kolam renang');
  assert.equal(cls.primary?.id, 'rumah');
  assert.ok(cls.secondary.some((d) => d.id === 'kolam'), 'kolam tetap tercatat sebagai cakupan tambahan');
});
test('C4-05 kontrol: "kolam renang pribadi" (Wave B T10) tetap primer kolam', () => {
  const cls = classifyUniversal('Buatkan RAB kolam renang pribadi.');
  assert.equal(cls.primary?.id, 'kolam');
});

console.log('== C4-06 / CON-06 + E-T1 — frasa landscape/plaza tanpa kata kunci ajaib ==');
test('C4-06 "taman di depan rumah" → landscape (E-T1: tanpa kata landscape/lanskap)', () => {
  assert.equal(classifyUniversal('Buatkan taman di depan rumah 10 x 8 m').primary?.id, 'landscape-umum');
});
test('C4-06 "taman bermain anak" → playground (bukan menu generik)', () => {
  assert.equal(classifyUniversal('Buatkan RAB taman bermain anak 10 x 8 m').primary?.id, 'playground');
});
test('C4-06 "taman 20x10 m" → landscape-umum', () => {
  assert.equal(classifyUniversal('buatkan taman 20x10 m').primary?.id, 'landscape-umum');
});
test('C4-06 "plaza taman kota" → taman-kota', () => {
  assert.equal(classifyUniversal('Buatkan plaza taman kota 500 m2').primary?.id, 'taman-kota');
});
test('C4-06 kontrol (tanpa regresi): "sekolah lengkap dengan taman" tetap primer sekolah', () => {
  const cls = classifyUniversal('Buatkan RAB pembangunan sekolah lengkap dengan taman, pagar, dan drainase');
  assert.equal(cls.primary?.id, 'sekolah');
  assert.ok(cls.secondary.some((d) => d.id === 'landscape-umum' || d.family === 'landscape'), 'taman tetap tercatat sebagai cakupan tambahan');
});

console.log('== C4-07 / CON-07 — proyek budget-terbatas: kelayakan dinilai ==');
test('C4-07 UNDER / OVER / provisional-PARSIAL / CANNOT_ASSESS / NO_BUDGET + cap last-match', () => {
  assert.equal(assessBudgetFeasibility({ totalPriced: 125_837_348, unpricedCount: 0, budgetCap: 250_000_000 }).verdict, 'UNDER');
  assert.equal(assessBudgetFeasibility({ totalPriced: 300_000_000, unpricedCount: 0, budgetCap: 250_000_000 }).verdict, 'OVER');
  // Selaras rantai spek Fase 2: total parsial tetap diputuskan atas total
  // berharga, tetapi verdict ditandai SEMENTARA (provisional) + alasan.
  const partial = assessBudgetFeasibility({ totalPriced: 125_837_348, unpricedCount: 1, budgetCap: 250_000_000 });
  assert.equal(partial.verdict, 'UNDER');
  assert.equal(partial.provisional, true);
  assert.ok(partial.reason && /belum berharga/.test(partial.reason), 'alasan parsial harus dinyatakan');
  const cannot = assessBudgetFeasibility({ totalPriced: null, unpricedCount: 2, budgetCap: 250_000_000 });
  assert.equal(cannot.verdict, 'CANNOT_ASSESS');
  assert.ok(cannot.reason && /belum ada item berharga/.test(cannot.reason));
  const noBudget = assessBudgetFeasibility({ totalPriced: 100_000_000, unpricedCount: 0, budgetCap: null });
  assert.equal(noBudget.verdict, 'NO_BUDGET');
  assert.ok(noBudget.reason && /belum disebutkan/.test(noBudget.reason));
  // Cap = nilai terkini (250), BUKAN kemunculan pertama (300).
  assert.equal(budgetCapFromContext({ budget: { amount: 250_000_000 }, budgetHistory: [{ amount: 300_000_000 }] }), 250_000_000);
});
test('C4-07 pesan draft kandang: penilaian kelayakan TAMPIL (DI BAWAH 250 jt)', () => {
  const draft = draftOf(KANDANG_TEXT, kandangSpecs());
  const msg = formatUniversalDraftMessage(draft);
  assert.ok(/Penilaian kelayakan budget/.test(msg), 'penilaian kelayakan harus tampil di pesan draft');
  assert.ok(/DI BAWAH/.test(msg), 'verdict UNDER harus tampil');
});
test('C4-07 pesan draft tanpa budget: TIDAK DAPAT DINILAI + alasan (bukan hilang diam-diam)', () => {
  const draft = draftOf('buatkan RAB kandang sapi terbuka 17 x 9 m kapasitas 30 ekor penutup atap Galvalum', [
    S('kandang-capacity', 'count', 'Kapasitas kandang', 30),
    S('kandang-roof-material', 'material', 'Material penutup atap kandang', 'Galvalum'),
  ]);
  const msg = formatUniversalDraftMessage(draft);
  assert.ok(/Penilaian kelayakan budget: TIDAK DAPAT DINILAI/.test(msg));
  assert.ok(/Budget belum disebutkan/.test(msg));
});

console.log('== C4-08 / CON-08 — DED tak lengkap: data hilang dinyatakan eksplisit ==');
test('C4-08 DED tak lengkap: kuantitas/harga hilang masuk missingData; dimensi dari DED masuk spek', () => {
  const output = {
    success: true, jobId: 'job-1', projectType: 'BANGUNAN', mode: 'DETAIL', policy: 'FULL_AI',
    projectName: 'Rumah DED', pageCount: 4, grandTotal: 0, categorySummaries: [],
    coverage: { totalItems: 2, itemsWithQuantity: 1, itemsWithPrice: 0, itemsFullyResolved: 0, itemsUnresolved: 2 },
    partial: true,
    items: [
      {
        id: 'i1', name: 'Pondasi batu kali', category: 'Pondasi', units: 'm3', quantity: 12,
        quantitySource: 'DED_GEOMETRIC', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
        sourcePages: [1], provenance: ['DED p.1'], stage: 'QUANTITY',
        derivation: {
          formulaType: 'galian_volume', result: 12, resultUnit: 'm3', validationStatus: 'ok',
          inputs: [
            { name: 'panjang', value: 10, unit: 'm', source: 'DED' },
            { name: 'lebar', value: 8, unit: 'm', source: 'DED' },
            { name: 'tebal', value: 0.15, unit: 'm', source: 'ASSUMPTION' },
          ],
        },
      },
      {
        id: 'i2', name: 'Pekerjaan atap', category: 'Atap', units: 'm2', quantity: null,
        quantitySource: 'UNRESOLVED', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
        sourcePages: [2], provenance: ['DED p.2'], stage: 'PARSE',
      },
    ],
  } as unknown as Parameters<typeof extractSpecsFromDedOutput>[0];
  const result = extractSpecsFromDedOutput(output, NOW);
  // Dimensi DED masuk spek terstruktur (bukan teks bebas).
  assert.ok(result.specs.some((s) => s.key === 'ded-length' && s.value === 10 && s.status === 'CONFIRMED'));
  assert.ok(result.specs.some((s) => s.key === 'ded-width' && s.value === 8 && s.status === 'CONFIRMED'));
  // Spek DED valid menurut validator skema (kunci + sumber DED dikenal).
  assert.ok(validateStructuredSpecs(result.specs) !== null, 'spek hasil DED harus lolos validasi skema');
  // Data hilang dinyatakan eksplisit — kuantitas atap, harga, dan status parsial.
  assert.ok(result.missingData.some((m) => /Kuantitas hilang: "Pekerjaan atap"/.test(m)));
  assert.ok(result.missingData.some((m) => /Harga satuan hilang/.test(m)));
  assert.ok(result.missingData.some((m) => /PARSIAL/.test(m)));
  assert.equal(result.coverage.partial, true);
});

console.log('== C4-09 / CON-09 — tanpa kode AHSP: alur non-AHSP transparan ==');
test('C4-09 query tanpa kandidat resmi → unresolvedQueries + baris "tidak ditemukan, tidak dikarang"', () => {
  const res = retrieveDomainCandidates(['zorblax kwintara']);
  assert.ok(res.unresolvedQueries.includes('zorblax kwintara'));
  assert.ok(res.ahspCandidates.length === 0, 'tidak boleh ada kandidat karangan untuk query tak dikenal');
  assert.ok(res.kbHits.length === 0, 'tidak boleh ada hit KB untuk query tak dikenal');
});

console.log('== C4-10 / CON-10 — harga AHSP hilang: unresolved atau asumsi eksplisit ==');
test('C4-10 kandidat resmi 3.1.3.8 terverifikasi harga resolver (Rp135.600) + provenans', () => {
  const item = officialAhspRepository.getOfficialAhsp('3.1.3.8');
  assert.ok(item, 'kode 3.1.3.8 harus ada di katalog resmi');
  const cand = verifyAhspCandidate(item as never);
  assert.equal(cand.code, '3.1.3.8');
  assert.ok(cand.unitPrice != null && cand.unitPrice > 0, `harga harus ter-resolver, dapat: ${cand.unitPrice}`);
  assert.ok(/officialAhspRepository/.test(cand.provenance), 'provenans harus menyebut sumber resmi');
});
test('C4-10 kode tak dikenal → PRICE_UNRESOLVED (null, bukan Rp0, bukan karangan)', () => {
  const cand = verifyAhspCandidate({ code: 'X.9.9.9', name: 'Item khayalan', unit: 'm2', domain: 'CIPTA_KARYA' } as never);
  assert.equal(cand.unitPrice, null);
  assert.equal(cand.priceStatus, 'PRICE_UNRESOLVED');
  assert.ok(/bukan Rp0/.test(cand.provenance));
});
test('C4-10 retrieval "atap metal menerus" menemukan 3.1.3.8 dengan harga', () => {
  const res = retrieveDomainCandidates(['atap metal menerus']);
  const found = res.ahspCandidates.find((c) => c.code === '3.1.3.8');
  assert.ok(found, `3.1.3.8 harus ditemukan, kandidat: ${res.ahspCandidates.map((c) => c.code).join(',')}`);
  assert.ok(found!.unitPrice != null && found!.unitPrice > 0);
});

console.log('== C4-11 / CON-11 — unit mismatch: kalkulasi diblokir ==');
test('C4-11 verifyAhspCandidate unit mismatch → UNIT_MISMATCH + harga null', () => {
  const item = officialAhspRepository.getOfficialAhsp('3.1.3.8');
  assert.ok(item);
  const cand = verifyAhspCandidate(item as never, 'm3');
  assert.equal(cand.priceStatus, 'UNIT_MISMATCH');
  assert.equal(cand.unitPrice, null);
  assert.ok(/dihitung|diblokir/i.test(cand.provenance));
});
test('C4-11 QTO bridge unit mismatch → UNIT_MISMATCH (bukan OK, bukan koreksi diam-diam)', () => {
  const checks = checkQtoAgainstUserDimensions(
    [{ description: 'Beton kolom', quantity: 7.65, unit: 'm2' }],
    { lengthM: 17, widthM: 9, depthM: 0.15 },
    { requestedUnitByDescription: { 'Beton kolom': 'm3' } },
  );
  assert.equal(checks[0].verdict, 'UNIT_MISMATCH');
});

console.log('== C4-12 / CON-12 — revisi proyek: spek tak terkait dipertahankan ==');
test('C4-12 revisi lantai gedung A: budget + material atap + gedung B utuh', () => {
  const base = extractUniversalContext('Buatkan RAB proyek 2 gedung: gedung A 3 lantai dan gedung B 2 lantai, atap Galvalum, budget 500 juta');
  const revised = extractUniversalContext('gedung A jadi 4 lantai', base);
  assert.equal(revised.buildings.find((b) => b.id === 'gedung-a')?.floors, 4);
  assert.equal(revised.buildings.find((b) => b.id === 'gedung-b')?.floors, 2, 'gedung B tidak berubah oleh revisi A');
  assert.equal(revised.budget?.amount, 500_000_000, 'budget tidak hilang oleh revisi lantai');
  assert.ok(/galvalum/i.test(revised.materialPreference ?? '') || /galvalum/i.test(revised.combinedText), 'material atap tidak hilang oleh revisi lantai');
});

console.log('== Taksonomi (CON-01…12 pendukung) ==');
test('Taksonomi: 19 keluarga, valid sebagai DATA, tiap subkategori dimiliki ≥1 keluarga', () => {
  assert.equal(PROJECT_FAMILIES.length, 19);
  const problems = validateProjectTaxonomy();
  assert.deepEqual(problems, [], `taksonomi harus valid, masalah: ${problems.join('; ')}`);
});
test('Taksonomi: lift & playground tetap GAP jujur (0 template)', () => {
  const gaps = gapSubcategories().map((g) => g.subcategoryId);
  assert.ok(gaps.includes('lift'), `lift harus GAP, gap kini: ${gaps.join(',')}`);
  assert.ok(gaps.includes('playground'), `playground harus GAP, gap kini: ${gaps.join(',')}`);
  const report = familySupportReport();
  assert.ok(report.length === 19);
  assert.ok(report.some((r) => r.family.id === 'kolam' && r.support !== 'GAP'), 'kolam harus didukung/parsial, bukan GAP');
});

console.log('== Deteksi konflik teknis ==');
test('Konflik: luas bangunan > luas tanah; tinggi < lantai×2,4; volume vs dimensi; budget vs lingkup', () => {
  const conflicts = detectTechnicalConflicts({
    dimensions: { landAreaM2: 100, buildingAreaM2: 150, lengthM: 10, widthM: 8, depthM: 2, heightM: 4, floors: 2, volumeM3: 999 },
    budget: { totalPriced: 300_000_000, cap: 250_000_000 },
  });
  const kinds = conflicts.map((c) => c.kind);
  assert.ok(kinds.includes('area-exceeds-land'), `harus ada area-exceeds-land, dapat: ${kinds.join(',')}`);
  assert.ok(kinds.includes('height-vs-floors'), `harus ada height-vs-floors, dapat: ${kinds.join(',')}`);
  assert.ok(kinds.includes('volume-vs-dimensions'), `harus ada volume-vs-dimensions, dapat: ${kinds.join(',')}`);
  assert.ok(kinds.includes('budget-vs-scope'), `harus ada budget-vs-scope, dapat: ${kinds.join(',')}`);
  assert.ok(conflicts.every((c) => c.resolution === 'needs-user-decision'), 'semua konflik butuh keputusan pengguna');
  assert.ok(formatConflictLines(conflicts).length > 1);
});
test('Konflik: genteng + dak beton terkonfirmasi bersamaan → material-vs-structure', () => {
  const conflicts = detectTechnicalConflicts({
    specs: [S('building-roof-type', 'scope', 'Jenis atap', 'Genteng'), S('kandang-roof-material', 'material', 'Atap', 'Dak beton')],
  });
  assert.ok(conflicts.some((c) => c.kind === 'material-vs-structure'));
});
test('Konflik: tanpa pertentangan → daftar kosong (tidak ada positif-palsu)', () => {
  const conflicts = detectTechnicalConflicts({
    dimensions: { landAreaM2: 200, buildingAreaM2: 150, heightM: 7, floors: 2, lengthM: 10, widthM: 8, depthM: 2, volumeM3: 160 },
    budget: { totalPriced: 100_000_000, cap: 250_000_000 },
  });
  assert.deepEqual(conflicts, []);
});

console.log('== Integrasi QTO ==');
test('QTO: volume cocok → OK; volume menyimpang >10% → MISMATCH (dilaporkan, bukan dibungkam)', () => {
  const dims = { lengthM: 17, widthM: 9, depthM: 0.15 };
  const ok = checkQtoAgainstUserDimensions([{ description: 'Galian tanah pondasi', quantity: 22.95, unit: 'm3' }], dims);
  assert.equal(ok[0].verdict, 'OK');
  const bad = checkQtoAgainstUserDimensions([{ description: 'Galian tanah pondasi', quantity: 90, unit: 'm3' }], dims);
  assert.equal(bad[0].verdict, 'MISMATCH');
  assert.ok(/TIDAK COCOK/.test(bad[0].detail) && /90/.test(bad[0].detail));
});
test('QTO: kuantitas null → MISSING (bukan 0); asumsi derivasi ditandai', () => {
  const checks = checkQtoAgainstUserDimensions([
    { description: 'Pekerjaan atap', quantity: null, unit: 'm2' },
    { description: 'Beton kolom', quantity: 7.65, unit: 'm3', derivationInputs: [{ name: 'tebal', value: 0.15, unit: 'm', source: 'ASSUMPTION' }] },
  ], { lengthM: 17, widthM: 9 });
  assert.equal(checks[0].verdict, 'MISSING');
  assert.ok(checks[1].verdict === 'ASSUMPTION' || checks[1].verdict === 'CANNOT_CHECK', `derivasi asumsi harus ditandai, dapat: ${checks[1].verdict}`);
  assert.ok(formatQtoCheckLines(checks).some((l) => l.includes('MISSING')));
});

console.log('== CHAT-07 — predikat lintas sumber ==');
test('CHAT-07 jawaban percakapan menutup pertanyaan kuesioner yang sama (tidak redundan)', () => {
  // (a) Predikat lintas sumber: jawaban di ctx.answers menutup kunci itu.
  const ctxAnswered = extractUniversalContext('Buatkan RAB kandang sapi 20 ekor');
  ctxAnswered.answers['kandang-roof-material'] = 'Galvalum';
  assert.ok(isSpecSatisfiedAcrossSources(ctxAnswered, 'kandang-roof-material'), 'jawaban percakapan menutup kunci');
  // (b) Spek terstruktur CONFIRMED menutup kunci itu.
  const ctxSpec = extractUniversalContext('Buatkan RAB kandang sapi 20 ekor');
  ctxSpec.structuredSpecs = [S('kandang-roof-material', 'material', 'Material penutup atap kandang', 'Galvalum')];
  assert.ok(isSpecSatisfiedAcrossSources(ctxSpec, 'kandang-roof-material'), 'spek terstruktur CONFIRMED menutup kunci');
  // (c) Kunci tanpa jawaban di sumber mana pun tetap terbuka.
  assert.ok(!isSpecSatisfiedAcrossSources(ctxSpec, 'kandang-floor'), 'kunci tanpa jawaban tetap terbuka');
  // (d) End-to-end: teks menyebut atap + kapasitas → kuesioner tidak menanyakannya lagi.
  const ctx = extractUniversalContext('Buatkan RAB kandang sapi 20 ekor, atap Galvalum');
  const qs = selectQuestionnaireQuestions(ctx);
  assert.ok(!qs.some((q) => q.key === 'kandang-roof-material'), 'atap Galvalum sudah terkonfirmasi — jangan ditanya lagi');
  assert.ok(!qs.some((q) => q.key === 'kandang-capacity'), 'kapasitas 20 ekor sudah terkonfirmasi — jangan ditanya lagi');
});

console.log('== CHAT-09 — routing tidak sensitif kata (varian frasa) ==');
test('CHAT-09 varian frasa kolam → primer kolam semua', () => {
  for (const text of [
    'bikin rab kolam',
    'tolong buatkan RAB kolam renang',
    'kolam renang pribadi 10x5',
    'Buatkan RAB kolam renang di halaman rumah',
    'saya mau bikin kolam renang',
  ]) {
    assert.equal(classifyUniversal(text).primary?.id, 'kolam', `gagal untuk: "${text}"`);
  }
});
test('CHAT-09 varian frasa taman → landscape semua', () => {
  for (const text of [
    'buatkan rab taman',
    'taman bermain anak',
    'bikin taman di depan rumah',
    'saya mau buat taman 20x10',
  ]) {
    const primary = classifyUniversal(text).primary;
    assert.ok(primary && (primary.family === 'landscape'), `gagal untuk: "${text}" (dapat ${primary?.id ?? 'null'})`);
  }
});

console.log('== CHAT-02 — konteks budget tidak hilang dari prompt kanonis ==');
test('CHAT-02 builder kanonis: budget kini + riwayat + lantai bangunan tetap di prompt', () => {
  const ctx = extractUniversalContext('Buatkan RAB kandang sapi 17 x 9 m anggaran 300 juta anggaran 250 juta');
  const built = buildCanonicalContext({
    messages: [{ role: 'user', content: 'Buatkan RAB kandang sapi anggaran 250 juta' }],
    intakeContext: ctx,
  });
  assert.ok(built.dataBlock.includes('Rp250.000.000'), 'budget kini 250 jt harus ada di prompt');
  assert.ok(built.dataBlock.includes('Rp300.000.000'), 'riwayat 300 jt harus ada di prompt (bukan cap)');
  assert.ok(built.report.factsPresent, 'fakta harus hadir');
  assert.ok(built.report.promptChars <= 16_000, 'prompt tetap dalam anggaran');
});
test('CHAT-02 formatBudgetFeasibilityLine: UNDER/OVER/CANNOT_ASSESS/NO_BUDGET semua tampil + alasan', () => {
  assert.ok(/DI BAWAH/.test(formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: 100, unpricedCount: 0, budgetCap: 250 }))));
  assert.ok(/MELEBIHI/.test(formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: 300, unpricedCount: 0, budgetCap: 250 }))));
  const partial = formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: 100, unpricedCount: 2, budgetCap: 250 }));
  assert.ok(/DI BAWAH/.test(partial) && /SEMENTARA/.test(partial), 'verdict parsial harus tampil sebagai SEMENTARA');
  const cannot = formatBudgetFeasibilityLine(assessBudgetFeasibility({ totalPriced: null, unpricedCount: 2, budgetCap: 250 }));
  assert.ok(/TIDAK DAPAT DINILAI/.test(cannot) && /belum ada item berharga/.test(cannot));
});

console.log('== E2E-FOLLOW-UP — perbaikan dari bukti browser nyata (run 4) ==');
test('C4-41 CHAT-03 rabNeeds: dimensi kedua "15 x 10" bukan lantai — floors 2, bukan 15', () => {
  // Regresi E2E run 4: draft UI menulis "luas 240 m², 15 lantai" karena
  // extractFloorCount hanya melindungi kemunculan "A x B" PERTAMA.
  const needs = extractRabNeeds('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta');
  assert.equal(needs.floors, 2, 'lantai terakhir yang sah adalah 2 (gedung B); 15 adalah dimensi');
  const gudang = extractRabNeeds('Buatkan RAB gudang satu lantai 12 x 25 m');
  assert.equal(gudang.floors, 1, 'penjaga lama tetap: "satu lantai" = 1, 12/25 dimensi');
});
test('C4-42 CHAT-05 specRabHijackGuard: mesin rumah tidak mengklaim primer non-rumah', () => {
  assert.equal(specRabHijackGuard('Buatkan RAB kolam renang di halaman rumah 10 x 5 m'), true, 'kolam primer → specRab dilewati');
  assert.equal(specRabHijackGuard('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m'), true, 'gedung primer → specRab dilewati');
  assert.equal(specRabHijackGuard('Buatkan RAB gudang satu lantai 12 x 25 m'), true, 'gudang primer → specRab dilewati');
  assert.equal(specRabHijackGuard('Buatkan RAB rumah 2 lantai 10 x 8 m'), false, 'rumah primer → specRab tetap');
  assert.equal(specRabHijackGuard('Buatkan RAB rumah dengan kolam renang 10 x 5 m'), false, 'rumah primer + kolam sekunder → specRab tetap');
  assert.equal(specRabHijackGuard('lanjutkan'), false, 'tanpa primer → perilaku lama');
});
test('C4-43 CHAT-02 draft tanpa chainValidation: baris kelayakan tampil + lantai benar', () => {
  const res = buildUniversalDraft('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta');
  assert.equal(res.kind, 'draft', 'harus draft');
  const draft = (res as { draft: UniversalDraft }).draft;
  assert.equal(draft.spec.floors, 2, 'spec.floors 2 (bukan 15)');
  assert.equal(draft.chainValidation, undefined, 'kasus uji: tanpa chainValidation (jalur engine-template)');
  const msg = formatUniversalDraftMessage(draft);
  assert.ok(msg.includes('Penilaian kelayakan budget'), 'baris kelayakan kanonis harus tampil tanpa chainValidation');
  assert.ok(!/15 lantai/.test(msg), 'tidak ada "15 lantai" di pesan draft');
  assert.ok(/MELEBIHI/.test(msg), 'verdict OVER (total > 500 jt) harus tampil');
});
test('C4-44 CHAT-03 draft multi-gedung: konflik budget-vs-scope ikut tampil di pesan', () => {
  const res = buildUniversalDraft('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta');
  assert.equal(res.kind, 'draft');
  const msg = formatUniversalDraftMessage((res as { draft: UniversalDraft }).draft);
  assert.ok(msg.includes('[budget-vs-scope]'), 'konflik budget-vs-scope deterministik tampil di pesan draft');
  assert.ok(msg.includes('500.000.000'), 'cap budget tampil di pesan draft');
});
test('C4-45 CHAT-03 draft membawa model per-bangunan: lantai tiap gedung tampil di pesan', () => {
  const res = buildUniversalDraft('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta');
  assert.equal(res.kind, 'draft');
  const draft = (res as { draft: UniversalDraft }).draft;
  assert.equal(draft.buildings?.length, 2, 'draft membawa 2 bangunan');
  assert.equal(draft.buildings?.[0].floors, 3, 'Gedung A 3 lantai di draft');
  assert.equal(draft.buildings?.[1].floors, 2, 'Gedung B 2 lantai di draft');
  const msg = formatUniversalDraftMessage(draft);
  assert.ok(/Gedung A: 3 lantai/.test(msg), 'pesan draft menyebut Gedung A 3 lantai');
  assert.ok(/Gedung B: 2 lantai/.test(msg), 'pesan draft menyebut Gedung B 2 lantai');
  // Pesan rumah satu-bangunan tidak mendapat baris bangunan.
  const single = buildUniversalDraft('Buatkan RAB rumah 2 lantai 10 x 8 m');
  if (single.kind === 'draft') {
    assert.ok(!/per bangunan/.test(formatUniversalDraftMessage((single as { draft: UniversalDraft }).draft)), 'draft satu bangunan tanpa baris per-bangunan');
  }
});

console.log(`\nCONSTRUCTION INTELLIGENCE (FASE 4): ${passed} PASS, ${failed} FAIL`);
if (failed > 0) {
  console.log(`Gagal: ${failedNames.join(' | ')}`);
  process.exit(1);
}
