/**
 * dedContractComparison.test — Tes komparatif KONTRAK DED BERSAMA
 * (Final Hardening §6, 2026-11-11).
 *
 * Gaya plain-tsx (mengikuti aiResponseTiming.test.ts):
 *   npx --yes tsx src/test/dedContractComparison.test.ts
 *
 * FIXTURE REPRESENTASIONAL — bukan dokumen nyata: satu dokumen sumber
 * yang sama ("DED-REP-01", rumah 1 lantai, 4 item) direpresentasikan
 * sebagai keluaran kedua pipeline. Sisi ded-ai dibangun lewat
 * DedAiCalculator.buildOutput ASLI (finalizer nyata); sisi legacy
 * dibangun lewat QuantitySanityGate.evaluateAll +
 * AiEstimateCalculator ASLI — jadi perbedaan yang teramati adalah
 * perbedaan semantik gerbang yang nyata, bukan karangan fixture:
 * - Item kolom 5.000 m³: evaluator ded-ai hanya MENGANNOTASI
 *   (quantityReview NEEDS_REVIEW) → item TETAP masuk total ded-ai.
 *   QuantitySanityGate legacy MEMBLOKIR (5.000 > 10× batas katastrofik
 *   kolom 60 m³) → item KELUAR dari total legacy.
 * Perbedaan total DILAPORKAN apa adanya — TIDAK diselaraskan, dan tes
 * ini MENGGAGALKAN bila kedua total menjadi sama karena salah satu
 * pipeline diubah agar angkanya cocok.
 */

import {
  mapDedAiOutputToContract,
  mapLegacyEstimateToContract,
  validateDedOutputContract,
  type DedOutputContract,
} from '../services/dedOutputContract';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import type { DedAiItem, DedAiOutput } from '../ai-tools/ded-ai-estimate/types';
import { QuantitySanityGate } from '../ai-estimate/quantitySanityGate';
import { AiEstimateCalculator } from '../ai-estimate/aiEstimateCalculator';
import type { AiEstimateOutput, AiEstimateWorkItem } from '../ai-estimate/types';

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: any) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e?.message ?? e}`);
  }
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

// ---------------------------------------------------------------------------
// Fixture representasional — dokumen yang sama, dua representasi pipeline.
// ---------------------------------------------------------------------------

function buildDedAiOutput(): DedAiOutput {
  const items: DedAiItem[] = [
    {
      id: 'ded-1', name: 'Galian Tanah Pondasi', category: 'Pekerjaan Tanah',
      units: 'm³', quantity: 40, quantitySource: 'DED_GEOMETRIC',
      unitPrice: 75000, priceSource: 'AI_ESTIMATE', subtotal: null,
      sourcePages: [2], provenance: ['fixture-representasional'], stage: 'PARSE',
    },
    {
      id: 'ded-2', name: 'Beton Kolom', category: 'Struktur',
      units: 'm³', quantity: 5000, quantitySource: 'DED_GEOMETRIC',
      unitPrice: 1000000, priceSource: 'AI_ESTIMATE', subtotal: null,
      sourcePages: [5], provenance: ['fixture-representasional'], stage: 'PARSE',
      // Anotasi evaluator kewajaran (reasonableness.ts) — anotasi murni.
      quantityReview: {
        outcome: 'NEEDS_REVIEW',
        reasonCode: 'SCALE_OUT_OF_ENVELOPE',
        explanation: 'Volume kolom 5.000 m³ jauh di luar amplop skala rumah tinggal — perlu tinjauan manusia.',
        severity: 'HIGH',
        originalQuantity: 5000,
      },
    },
    {
      id: 'ded-3', name: 'Pasangan Dinding Bata Merah', category: 'Dinding',
      units: 'm²', quantity: 120, quantitySource: 'AI_INFERENCE',
      unitPrice: 150000, priceSource: 'AI_ESTIMATE', subtotal: null,
      sourcePages: [3], provenance: ['fixture-representasional'], stage: 'PARSE',
    },
    {
      id: 'ded-4', name: 'Lantai Keramik 40x40', category: 'Lantai',
      units: 'm²', quantity: null, quantitySource: 'UNRESOLVED',
      unitPrice: 120000, priceSource: 'AI_ESTIMATE', subtotal: null,
      sourcePages: [4], provenance: ['fixture-representasional'], stage: 'PARSE',
    },
  ];
  return DedAiCalculator.buildOutput({
    jobId: 'job-rep-01', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
    projectName: 'Rumah 1 Lantai (fixture representasional)', fileName: 'DED-REP-01.pdf',
    pageCount: 6, items,
  });
}

function buildLegacyOutput(): AiEstimateOutput {
  const workItems: AiEstimateWorkItem[] = [
    {
      id: 'leg-1', category: 'Pekerjaan Tanah', workName: 'Galian Tanah Pondasi',
      quantity: 40, unit: 'm³', quantitySource: 'DED_GEOMETRIC',
      priceSource: 'AI_ESTIMATE', estimatedUnitPrice: 75000, confidence: 'MEDIUM',
      sourcePages: [2], assumptions: [], warnings: [],
    },
    {
      id: 'leg-2', category: 'Struktur', workName: 'Beton Kolom',
      quantity: 5000, unit: 'm³', quantitySource: 'DED_GEOMETRIC',
      priceSource: 'AI_ESTIMATE', estimatedUnitPrice: 1000000, confidence: 'HIGH',
      sourcePages: [5], assumptions: [], warnings: [],
    },
    {
      id: 'leg-3', category: 'Dinding', workName: 'Pasangan Dinding Bata Merah',
      quantity: 120, unit: 'm²', quantitySource: 'AI_INFERENCE',
      priceSource: 'AI_ESTIMATE', estimatedUnitPrice: 150000, confidence: 'MEDIUM',
      sourcePages: [3], assumptions: [], warnings: [],
    },
    {
      id: 'leg-4', category: 'Lantai', workName: 'Lantai Keramik 40x40',
      quantity: null, unit: 'm²', quantitySource: 'UNRESOLVED',
      priceSource: 'AI_ESTIMATE', estimatedUnitPrice: 120000, confidence: 'LOW',
      sourcePages: [4], assumptions: [], warnings: [],
    },
  ];
  // Gerbang + kalkulator ASLI pipeline legacy.
  QuantitySanityGate.evaluateAll(workItems);
  AiEstimateCalculator.calculateAllSubtotals(workItems);
  const summary = AiEstimateCalculator.buildSummary(workItems);
  return {
    success: true, jobId: 'job-rep-01', projectId: 'proj-rep-01',
    projectName: 'Rumah 1 Lantai (fixture representasional)', analysisMode: 'FAST',
    executionDurationSec: 0, workItems, summary,
    categoryBreakdown: AiEstimateCalculator.buildCategoryBreakdown(workItems),
    warnings: [], stats: AiEstimateCalculator.buildStats(workItems), totalPagesRead: 6,
  };
}

// ---------------------------------------------------------------------------

function main(): void {
  console.log('dedContractComparison.test (fixture REPRESENTASIONAL — bukan dokumen nyata)');

  const dedContract = mapDedAiOutputToContract(buildDedAiOutput());
  const legacyContract = mapLegacyEstimateToContract(buildLegacyOutput());

  check('1. kontrak ded-ai lolos validator fail-closed', () => {
    const v = validateDedOutputContract(dedContract);
    assert(v.ok, `errors: ${v.errors.join('; ')}`);
  });

  check('2. kontrak legacy lolos validator fail-closed', () => {
    const v = validateDedOutputContract(legacyContract);
    assert(v.ok, `errors: ${v.errors.join('; ')}`);
  });

  check('3. validator menolak field wajib hilang (description dikosongkan)', () => {
    const broken = JSON.parse(JSON.stringify(dedContract)) as DedOutputContract;
    (broken.items[0] as any).description = '';
    const v = validateDedOutputContract(broken);
    assert(!v.ok && v.errors.some((e) => e.includes('description')), 'harus gagal dengan error description');
  });

  check('4. validator menolak EXCLUDED_FROM_TOTAL yang ikut total', () => {
    const broken = JSON.parse(JSON.stringify(legacyContract)) as DedOutputContract;
    const blocked = broken.items.find((i) => i.quantityKind === 'EXCLUDED_FROM_TOTAL')!;
    (blocked as any).includedInTotal = true;
    const v = validateDedOutputContract(broken);
    assert(!v.ok && v.errors.some((e) => e.includes('EXCLUDED_FROM_TOTAL')), 'inkonsistensi gerbang harus tertangkap');
  });

  check('5. validator menolak nilai quantityKind asing & priceProvenance hilang', () => {
    const broken = JSON.parse(JSON.stringify(dedContract)) as DedOutputContract;
    (broken.items[0] as any).quantityKind = 'TEBAKAN';
    delete (broken.items[1] as any).priceProvenance;
    const v = validateDedOutputContract(broken);
    assert(!v.ok && v.errors.length >= 2, `errors=${v.errors.join('; ')}`);
  });

  const dedByName = new Map(dedContract.items.map((i) => [i.description, i]));
  const legByName = new Map(legacyContract.items.map((i) => [i.description, i]));

  check('6. pemetaan quantityKind ded-ai jujur (annotasi tetap masuk total)', () => {
    assert(dedByName.get('Galian Tanah Pondasi')!.quantityKind === 'CALCULATED', 'galian geometrik = CALCULATED');
    const kolom = dedByName.get('Beton Kolom')!;
    assert(kolom.quantityKind === 'CALCULATED', `kolom kind=${kolom.quantityKind}`);
    assert(kolom.validationStatus === 'REASONABLENESS:NEEDS_REVIEW', `kolom status=${kolom.validationStatus}`);
    assert(kolom.includedInTotal === true, 'item terannotasi ded-ai HARUS tetap masuk total');
    assert(dedByName.get('Pasangan Dinding Bata Merah')!.quantityKind === 'AI_EXTRACTED', 'inferensi AI = AI_EXTRACTED');
    const keramik = dedByName.get('Lantai Keramik 40x40')!;
    assert(keramik.quantityKind === 'NEEDS_HUMAN_REVIEW' && keramik.includedInTotal === false, 'kuantitas hilang = NEEDS_HUMAN_REVIEW, di luar total');
  });

  check('7. pemetaan quantityKind legacy jujur (gerbang MEMBLOKIR dari total)', () => {
    assert(legByName.get('Galian Tanah Pondasi')!.quantityKind === 'CALCULATED', 'galian lolos gerbang geometrik = CALCULATED');
    const kolom = legByName.get('Beton Kolom')!;
    assert(kolom.quantityKind === 'EXCLUDED_FROM_TOTAL', `kolom kind=${kolom.quantityKind}`);
    assert(kolom.includedInTotal === false && kolom.subtotal === null, 'item tergerbang: subtotal null, di luar total');
    assert(kolom.unresolvedReasons.some((r) => r.includes('batas fisik maksimum')), 'alasan pemblokiran terbawa');
    assert(legByName.get('Pasangan Dinding Bata Merah')!.quantityKind === 'ACCEPTED_AFTER_VALIDATION', 'dinding lolos gerbang = ACCEPTED_AFTER_VALIDATION');
    const keramik = legByName.get('Lantai Keramik 40x40')!;
    assert(keramik.quantityKind === 'NEEDS_HUMAN_REVIEW' && keramik.includedInTotal === false, 'keramik unresolved di luar total');
  });

  check('8. ahspMappingStatus jujur: ded-ai NOT_MAPPED, legacy NOT_APPLICABLE', () => {
    assert(dedContract.items.every((i) => i.ahspMappingStatus === 'NOT_MAPPED'), 'fixture ded-ai tanpa kode AHSP = NOT_MAPPED');
    assert(legacyContract.items.every((i) => i.ahspMappingStatus === 'NOT_APPLICABLE'), 'legacy tidak punya pemetaan AHSP');
  });

  check('9. includedTotal kontrak == pipelineTotal masing-masing (rekonsiliasi)', () => {
    assert(dedContract.includedTotal === dedContract.pipelineTotal, `ded ${dedContract.includedTotal} vs ${dedContract.pipelineTotal}`);
    assert(legacyContract.includedTotal === legacyContract.pipelineTotal, `legacy ${legacyContract.includedTotal} vs ${legacyContract.pipelineTotal}`);
  });

  check('10. TOTAL kedua pipeline BERBEDA persis sebesar item kolom yang digerbang legacy', () => {
    assert(dedContract.pipelineTotal === 5021000000, `ded total=${dedContract.pipelineTotal}`);
    assert(legacyContract.pipelineTotal === 21000000, `legacy total=${legacyContract.pipelineTotal}`);
    const diff = dedContract.pipelineTotal - legacyContract.pipelineTotal;
    assert(diff === 5000000000, `selisih=${diff} (harus = subtotal kolom 5.000 m³ × Rp1.000.000)`);
  });

  check('11. pageRefs gabungan kedua kontrak sama (dokumen yang sama)', () => {
    assert(JSON.stringify(dedContract.pageRefs) === '[2,3,4,5]', `ded pageRefs=${dedContract.pageRefs}`);
    assert(JSON.stringify(legacyContract.pageRefs) === '[2,3,4,5]', `legacy pageRefs=${legacyContract.pageRefs}`);
    assert(dedContract.sourceDocument.hash === null && legacyContract.sourceDocument.hash === null, 'hash tidak tersedia → null jujur di kedua sisi');
  });

  // --- Laporan perbedaan apa adanya (struktur hasil tes) -------------------
  console.log('\n  === LAPORAN PERBEDAAN (dilaporkan, TIDAK diselaraskan) ===');
  console.log(`  Dokumen: ${dedContract.sourceDocument.name} (DED-REP-01, representasional)`);
  for (const d of dedContract.items) {
    const l = legByName.get(d.description)!;
    const mark = d.quantityKind !== l.quantityKind || d.includedInTotal !== l.includedInTotal ? '  <-- BEDA' : '';
    console.log(
      `  - ${d.description}: qty ded=${d.quantity} ${d.unit} / legacy=${l.quantity} ${l.unit}; ` +
      `kind ded=${d.quantityKind} / legacy=${l.quantityKind}; ` +
      `masuk-total ded=${d.includedInTotal} / legacy=${l.includedInTotal}; ` +
      `subtotal ded=${d.subtotal === null ? 'null' : rp(d.subtotal)} / legacy=${l.subtotal === null ? 'null' : rp(l.subtotal)}${mark}`,
    );
  }
  console.log(`  TOTAL ded-ai : ${rp(dedContract.pipelineTotal)} (finalizationState=${dedContract.finalizationState})`);
  console.log(`  TOTAL legacy : ${rp(legacyContract.pipelineTotal)} (finalizationState=${legacyContract.finalizationState})`);
  console.log(`  SELISIH      : ${rp(dedContract.pipelineTotal - legacyContract.pipelineTotal)} — seluruhnya dari "Beton Kolom" 5.000 m³: ded-ai mengannotasi (NEEDS_REVIEW) dan tetap menghitung; legacy QuantitySanityGate memblokir dari total.`);

  console.log(`\ndedContractComparison: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
