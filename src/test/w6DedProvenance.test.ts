/**
 * W6 — DED-RAB AI DUAL MODE §8: provenance DED ↔ RAB (G-PV-1/2/3).
 *
 * Membuktikan, lewat JALUR KODE NYATA (bukan mock atas hal yang diuji):
 *  [0] tabel pemetaan kanonis 5 label directive lengkap
 *      (dedProvenance.ts — G-PV-1);
 *  [1] round-trip label → RAB → label untuk kelima label, plus
 *      DED → label dan RAB → label;
 *  [2] klaim transfer per sumber DED (dedTransferClaim) + kontrak bukti
 *      S2 (hasResolvedPriceEvidence);
 *  [3] kontrak transfer S2 BERLAKU di jalur finalisasi DED
 *      (finalizeMapping — G-PV-2): kanonis RESOLVED, AI ESTIMATED,
 *      manual MANUAL, warisan plafon ESTIMATED; harga AI TIDAK PERNAH
 *      RESOLVED/VERIFIED;
 *  [4] harga manual berkind jujur USER_MANUAL (G-PV-3) dan provenance
 *      bertahan lewat factory (createRabItemRecord);
 *  [5] provenance bertahan lewat normalizeSections (persistensi);
 *  [6] provenance bertahan lewat ekspor 5 sheet (freezeRabSnapshot +
 *      buildFiveSheetWorkbook, ExcelJS write + reload);
 *  [7] helper badge UI (satu sumber — dipakai kedua result view).
 *
 * Jalankan: npx --yes tsx src/test/w6DedProvenance.test.ts
 * (Skrip tsx mandiri — pola dedFinalizeProvenance / s2ProvenanceTransfer.)
 */
import ExcelJS from 'exceljs';
import { strict as assert } from 'node:assert';
import {
  DED_PROVENANCE_LABELS,
  DED_PROVENANCE_MAP,
  dedSourceToLabel,
  dedTransferClaim,
  labelToRabProvenance,
  provenanceBadgeForDedSource,
  provenanceBadgeForLabel,
  provenanceExplanationForDedSource,
  rabProvenanceToLabel,
  type DedProvenanceLabel,
} from '../ai-tools/ded-ai-estimate/dedProvenance';
import {
  mapDedAiItemToRabInput,
  mapFullAiItemToRabInput,
  mapMagicAiItemToRabInput,
} from '../ai-tools/ded-ai-estimate/finalizeMapping';
import {
  hasResolvedPriceEvidence,
  transferPriceStatus,
  transferVerificationStatus,
} from '../ai-tools/ezrab-ai/universalRab';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import {
  FIVE_SHEET_NAMES,
  buildFiveSheetWorkbook,
  freezeRabSnapshot,
} from '../export/fiveSheetPreset';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';
import type { AiEstimateWorkItem } from '../ai-estimate/types';
import type { Project, Company } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `aktual=${JSON.stringify(actual)} harap=${JSON.stringify(expected)}`);
}

/* ================================================================== */
/* [0] Tabel pemetaan kanonis — 5 label directive lengkap (G-PV-1)      */
/* ================================================================== */
function testMappingTable(): void {
  console.log('\n[0] Tabel pemetaan kanonis DED_PROVENANCE_MAP (5 label directive):');
  eq('tepat 5 label directive', DED_PROVENANCE_LABELS.length, 5);
  for (const label of ['AI_GENERATED', 'AI_ESTIMATED', 'USER_PROVIDED', 'EXTERNALLY_VERIFIED', 'UNRESOLVED'] as const) {
    check(`label ${label} ada di tabel`, DED_PROVENANCE_MAP[label] !== undefined);
  }

  const aiGen = DED_PROVENANCE_MAP.AI_GENERATED;
  eq('AI_GENERATED: dedPriceSource AI_ESTIMATE', aiGen.dedPriceSource, 'AI_ESTIMATE');
  eq('AI_GENERATED: dedPriceSourceKind AI_ESTIMATE', aiGen.dedPriceSourceKind, 'AI_ESTIMATE');
  eq('AI_GENERATED: dedClassification AI_ESTIMATE', aiGen.dedClassification, 'AI_ESTIMATE');
  eq('AI_GENERATED: rabKind EZRAB_ASSUMPTION', aiGen.rabPriceSourceKind, 'EZRAB_ASSUMPTION');
  eq('AI_GENERATED: priceStatus PRICE_ESTIMATED', aiGen.priceStatus, 'PRICE_ESTIMATED');
  eq('AI_GENERATED: verificationStatus AI_GENERATED', aiGen.verificationStatus, 'AI_GENERATED');

  const aiEst = DED_PROVENANCE_MAP.AI_ESTIMATED;
  eq('AI_ESTIMATED: dedPriceSource AI_ESTIMATE', aiEst.dedPriceSource, 'AI_ESTIMATE');
  eq('AI_ESTIMATED: dedPriceSourceKind AI_ESTIMATE', aiEst.dedPriceSourceKind, 'AI_ESTIMATE');
  eq('AI_ESTIMATED: dedClassification AI_ESTIMATE', aiEst.dedClassification, 'AI_ESTIMATE');
  eq('AI_ESTIMATED: rabKind EZRAB_ASSUMPTION', aiEst.rabPriceSourceKind, 'EZRAB_ASSUMPTION');
  eq('AI_ESTIMATED: priceStatus PRICE_ESTIMATED', aiEst.priceStatus, 'PRICE_ESTIMATED');
  eq('AI_ESTIMATED: verificationStatus NEEDS_VERIFICATION', aiEst.verificationStatus, 'NEEDS_VERIFICATION');

  const user = DED_PROVENANCE_MAP.USER_PROVIDED;
  eq('USER_PROVIDED: dedPriceSource USER_INPUT', user.dedPriceSource, 'USER_INPUT');
  eq('USER_PROVIDED: dedPriceSourceKind USER_MANUAL', user.dedPriceSourceKind, 'USER_MANUAL');
  eq('USER_PROVIDED: dedClassification MANUAL_PRICE', user.dedClassification, 'MANUAL_PRICE');
  eq('USER_PROVIDED: rabKind USER_MANUAL (aditif G-PV-3)', user.rabPriceSourceKind, 'USER_MANUAL');
  eq('USER_PROVIDED: priceStatus PRICE_MANUAL', user.priceStatus, 'PRICE_MANUAL');
  eq('USER_PROVIDED: verificationStatus NEEDS_VERIFICATION', user.verificationStatus, 'NEEDS_VERIFICATION');

  const ext = DED_PROVENANCE_MAP.EXTERNALLY_VERIFIED;
  eq('EXTERNALLY_VERIFIED: dedPriceSource null (tak ada padanan DED)', ext.dedPriceSource, null);
  eq('EXTERNALLY_VERIFIED: dedPriceSourceKind VERIFIED_SUPPLIER', ext.dedPriceSourceKind, 'VERIFIED_SUPPLIER');
  eq('EXTERNALLY_VERIFIED: dedClassification MARKET_REFERENCE', ext.dedClassification, 'MARKET_REFERENCE');
  eq('EXTERNALLY_VERIFIED: rabKind MARKET_REFERENCE (terdekat)', ext.rabPriceSourceKind, 'MARKET_REFERENCE');
  eq('EXTERNALLY_VERIFIED: priceStatus PRICE_RESOLVED', ext.priceStatus, 'PRICE_RESOLVED');
  eq('EXTERNALLY_VERIFIED: verificationStatus VERIFIED', ext.verificationStatus, 'VERIFIED');
  check('EXTERNALLY_VERIFIED: catatan nearest-match terdokumentasi',
    (ext.nearestMatchNote || '').includes('MARKET_REFERENCE'));

  const unres = DED_PROVENANCE_MAP.UNRESOLVED;
  eq('UNRESOLVED: dedPriceSource UNRESOLVED', unres.dedPriceSource, 'UNRESOLVED');
  eq('UNRESOLVED: dedPriceSourceKind UNRESOLVED', unres.dedPriceSourceKind, 'UNRESOLVED');
  eq('UNRESOLVED: dedClassification PRICE_UNRESOLVED', unres.dedClassification, 'PRICE_UNRESOLVED');
  eq('UNRESOLVED: rabKind UNRESOLVED', unres.rabPriceSourceKind, 'UNRESOLVED');
  eq('UNRESOLVED: priceStatus PRICE_UNRESOLVED', unres.priceStatus, 'PRICE_UNRESOLVED');
  eq('UNRESOLVED: verificationStatus NEEDS_VERIFICATION', unres.verificationStatus, 'NEEDS_VERIFICATION');

  // AI_GENERATED vs AI_ESTIMATED: satu-satunya pembeda adalah
  // VerificationStatus — yang membuat round-trip keduanya tetap utuh.
  check('AI_GENERATED vs AI_ESTIMATED: hanya verificationStatus yang beda',
    aiGen.dedPriceSource === aiEst.dedPriceSource &&
    aiGen.rabPriceSourceKind === aiEst.rabPriceSourceKind &&
    aiGen.priceStatus === aiEst.priceStatus &&
    aiGen.verificationStatus !== aiEst.verificationStatus);
  // Setiap label punya label UI + penjelasan non-kosong.
  for (const label of DED_PROVENANCE_LABELS) {
    const m = DED_PROVENANCE_MAP[label];
    check(`label ${label}: uiLabel + explanation non-kosong`,
      m.uiLabel.trim() !== '' && m.explanation.trim() !== '');
  }
}

/* ================================================================== */
/* [1] Round-trip label ↔ RAB, DED → label, RAB → label                 */
/* ================================================================== */
function testRoundTrip(): void {
  console.log('\n[1] Round-trip label → RAB → label + derivasi DED/RAB:');
  for (const label of DED_PROVENANCE_LABELS) {
    const rab = labelToRabProvenance(label);
    eq(`round-trip ${label}`, rabProvenanceToLabel(rab), label);
  }
  // Arah DED → label.
  eq('DED AHSP_2026 → EXTERNALLY_VERIFIED', dedSourceToLabel('AHSP_2026'), 'EXTERNALLY_VERIFIED');
  eq('DED AI_ESTIMATE → AI_ESTIMATED', dedSourceToLabel('AI_ESTIMATE'), 'AI_ESTIMATED');
  eq('DED USER_INPUT → USER_PROVIDED', dedSourceToLabel('USER_INPUT'), 'USER_PROVIDED');
  eq('DED UNRESOLVED → UNRESOLVED', dedSourceToLabel('UNRESOLVED'), 'UNRESOLVED');
  eq('DED VERIFIED_SOURCE warisan → AI_ESTIMATED (plafon jujur)', dedSourceToLabel('VERIFIED_SOURCE'), 'AI_ESTIMATED');
  eq('DED sumber tak dikenal → UNRESOLVED (fail-closed)', dedSourceToLabel('SESUATU_YANG_TAK_ADA'), 'UNRESOLVED');
  eq('DED sumber null → UNRESOLVED (fail-closed)', dedSourceToLabel(null), 'UNRESOLVED');
  // Arah RAB → label (precedence).
  eq('RAB OFFICIAL_AHSP + RESOLVED → EXTERNALLY_VERIFIED',
    rabProvenanceToLabel({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', verificationStatus: 'VERIFIED' }),
    'EXTERNALLY_VERIFIED');
  eq('RAB MARKET_REFERENCE → EXTERNALLY_VERIFIED',
    rabProvenanceToLabel({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' }),
    'EXTERNALLY_VERIFIED');
  eq('RAB USER_MANUAL + MANUAL → USER_PROVIDED',
    rabProvenanceToLabel({ priceStatus: 'PRICE_MANUAL', priceSourceKind: 'USER_MANUAL' }),
    'USER_PROVIDED');
  eq('RAB EZRAB_ASSUMPTION + ESTIMATED + AI_GENERATED → AI_GENERATED',
    rabProvenanceToLabel({ priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION', verificationStatus: 'AI_GENERATED' }),
    'AI_GENERATED');
  eq('RAB kosong → UNRESOLVED (fail-closed)', rabProvenanceToLabel({}), 'UNRESOLVED');
  // Round-trip DED → label → RAB → label untuk semua sumber DED.
  const dedSources = ['AHSP_2026', 'AI_ESTIMATE', 'USER_INPUT', 'UNRESOLVED', 'VERIFIED_SOURCE'] as const;
  for (const src of dedSources) {
    const label = dedSourceToLabel(src);
    const back = rabProvenanceToLabel(labelToRabProvenance(label));
    eq(`round-trip DED ${src} → ${label} → RAB → label`, back, label);
  }
}

/* ================================================================== */
/* [2] Klaim transfer + kontrak bukti S2                                */
/* ================================================================== */
function testTransferClaims(): void {
  console.log('\n[2] Klaim transfer dedTransferClaim + bukti S2:');
  const canon = dedTransferClaim('AHSP_2026');
  eq('klaim kanonis: PRICE_RESOLVED', canon.claimedPriceStatus, 'PRICE_RESOLVED');
  eq('klaim kanonis: kind OFFICIAL_AHSP', canon.priceSourceKind, 'OFFICIAL_AHSP');
  eq('klaim kanonis: VERIFIED', canon.claimedVerificationStatus, 'VERIFIED');
  eq('klaim kanonis: label EXTERNALLY_VERIFIED', canon.label, 'EXTERNALLY_VERIFIED');
  const ai = dedTransferClaim('AI_ESTIMATE');
  eq('klaim AI: PRICE_ESTIMATED', ai.claimedPriceStatus, 'PRICE_ESTIMATED');
  eq('klaim AI: kind EZRAB_ASSUMPTION', ai.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('klaim AI: NEEDS_VERIFICATION', ai.claimedVerificationStatus, 'NEEDS_VERIFICATION');
  eq('klaim AI: label AI_ESTIMATED', ai.label, 'AI_ESTIMATED');
  const man = dedTransferClaim('USER_INPUT');
  eq('klaim manual: PRICE_MANUAL', man.claimedPriceStatus, 'PRICE_MANUAL');
  eq('klaim manual: kind USER_MANUAL', man.priceSourceKind, 'USER_MANUAL');
  eq('klaim manual: NEEDS_VERIFICATION', man.claimedVerificationStatus, 'NEEDS_VERIFICATION');
  eq('klaim manual: label USER_PROVIDED', man.label, 'USER_PROVIDED');
  const leg = dedTransferClaim('VERIFIED_SOURCE');
  eq('klaim warisan: TANPA klaim status', leg.claimedPriceStatus, undefined);
  eq('klaim warisan: TANPA kind', leg.priceSourceKind, undefined);
  eq('klaim warisan: NEEDS_VERIFICATION', leg.claimedVerificationStatus, 'NEEDS_VERIFICATION');
  eq('klaim warisan: label AI_ESTIMATED', leg.label, 'AI_ESTIMATED');

  // Kontrak bukti S2 (fungsi yang SAMA dengan jalur Chat AI).
  check('bukti S2: OFFICIAL_AHSP = bukti', hasResolvedPriceEvidence({ priceSourceKind: 'OFFICIAL_AHSP' }));
  check('bukti S2: MARKET_REFERENCE = bukti', hasResolvedPriceEvidence({ priceSourceKind: 'MARKET_REFERENCE' }));
  check('bukti S2: USER_MANUAL BUKAN bukti', !hasResolvedPriceEvidence({ priceSourceKind: 'USER_MANUAL' }));
  check('bukti S2: EZRAB_ASSUMPTION BUKAN bukti', !hasResolvedPriceEvidence({ priceSourceKind: 'EZRAB_ASSUMPTION' }));
  check('bukti S2: UNRESOLVED BUKAN bukti', !hasResolvedPriceEvidence({ priceSourceKind: 'UNRESOLVED' }));
  // S2 langsung: klaim RESOLVED tanpa bukti diturunkan (plafon jujur).
  eq('S2: RESOLVED tanpa bukti → ESTIMATED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, priceSourceKind: 'EZRAB_ASSUMPTION' }),
    'PRICE_ESTIMATED');
  eq('S2: RESOLVED + OFFICIAL_AHSP → RESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, priceSourceKind: 'OFFICIAL_AHSP' }),
    'PRICE_RESOLVED');
  eq('S2: tanpa klaim + harga valid → ESTIMATED',
    transferPriceStatus({ unitPrice: 100000 }),
    'PRICE_ESTIMATED');
  eq('S2: MANUAL dipertahankan',
    transferPriceStatus({ priceStatus: 'PRICE_MANUAL', unitPrice: 100000, priceSourceKind: 'USER_MANUAL' }),
    'PRICE_MANUAL');
  eq('S2: verifikasi UNRESOLVED selalu NEEDS_VERIFICATION',
    transferVerificationStatus({ verificationStatus: 'VERIFIED' }, 'PRICE_UNRESOLVED'),
    'NEEDS_VERIFICATION');
}

/* ================================================================== */
/* Fixture DED (kode kanonis 3.7.4 / 2.2.1.4.1 = yang dipakai suite    */
/* dedFinalizeProvenance — terbukti SAFE di katalog kanonis)            */
/* ================================================================== */
const stdBase = {
  id: 'dedai-1', category: 'Dinding', units: 'm2',
  quantitySource: 'DED_GEOMETRIC', subtotal: null, sourcePages: [1],
  provenance: [], stage: 'CALCULATED',
} as const;
const stdCanon = {
  ...stdBase, name: 'Plesteran Dinding', quantity: 10, unitPrice: 51622,
  priceSource: 'AHSP_2026', ahspCode: '3.7.4',
  priceAssumptionNote: 'AHSP kanonis 3.7.4 (SE 47/2026, biaya langsung)',
} as unknown as DedAiItem;
const stdAi = {
  ...stdBase, name: 'Pengecatan Dinding', quantity: 5, unitPrice: 850000,
  priceSource: 'AI_ESTIMATE',
  priceAssumptionNote: 'Estimasi AI — tidak ditemukan di database AHSP EZRAB: NO_MATCH (perkiraan, bukan harga database).',
  ahspMatch: { status: 'NEEDS_REVIEW', reason: 'x' },
} as unknown as DedAiItem;
const stdManual = {
  ...stdBase, name: 'Pembersihan Lahan', category: 'Persiapan', quantity: 2,
  unitPrice: 100000, priceSource: 'USER_INPUT',
} as unknown as DedAiItem;
const stdUnresolved = {
  ...stdBase, name: 'Tanpa Harga', quantity: 3, unitPrice: null, priceSource: 'UNRESOLVED',
} as unknown as DedAiItem;

const fullBase = {
  id: 'fullai-1', no: 1, subtotal: 100000, subtotalVerified: true,
  status: 'READY', exclusionReason: null,
} as const;
const fullCanon = {
  ...fullBase, name: 'Kolom Praktis', category: 'Struktur',
  quantity: { value: 2, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 4500000, unit: 'm3', source: 'AHSP_2026', region: 'Nasional', period: '2026', ahspCode: '2.2.1.4.1', notes: 'AHSP kanonis 2.2.1.4.1' },
} as unknown as FullAiItem;
const fullAi = {
  ...fullBase, name: 'Balok Ring', category: 'Struktur',
  quantity: { value: 2, unit: 'm3', provenance: 'ASSUMPTION', confidence: 'MEDIUM' },
  price: { unitPrice: 4000000, unit: 'm3', source: 'AI_ESTIMATE', region: 'Jakarta', period: '2026', notes: 'Estimasi AI — tidak ditemukan di database AHSP EZRAB: NO_MATCH (perkiraan, bukan harga database).', ahspMatch: { status: 'NEEDS_REVIEW', reason: 'x' } },
} as unknown as FullAiItem;
const fullManual = {
  ...fullBase, name: 'Urugan Pasir', category: 'Persiapan',
  quantity: { value: 1, unit: 'm3', provenance: 'USER_INPUT', confidence: 'HIGH' },
  price: { unitPrice: 3000000, unit: 'm3', source: 'USER_INPUT', notes: 'x [Diedit user: harga asli 4000000 (AI_ESTIMATE)]' },
} as unknown as FullAiItem;
const fullLegacy = {
  ...fullBase, name: 'Pasangan Bata Ringan', category: 'Dinding',
  quantity: { value: 1, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 2000000, unit: 'm3', source: 'VERIFIED_SOURCE' },
} as unknown as FullAiItem;

const magicAi = {
  item: 'Pekerjaan Bekisting', workName: 'Pekerjaan Bekisting',
  category: 'Struktur', quantity: 3, unit: 'm2',
  unitPrice: 150000, priceSource: 'AI_ESTIMATE', priceStatus: 'PRICE_ESTIMATED',
  status: 'OK', formula: '3 m2 × Rp150.000', assumptions: [],
} as unknown as AiEstimateWorkItem;

/* ================================================================== */
/* [3] Kontrak S2 berlaku di jalur finalisasi DED (G-PV-2)              */
/* ================================================================== */
function testFinalizeS2(): ReturnType<typeof mapDedAiItemToRabInput>[] {
  console.log('\n[3] Kontrak S2 di jalur finalisasi DED (finalizeMapping):');
  const mCanon = mapDedAiItemToRabInput(stdCanon, 'DATABASE');
  eq('std kanonis: PRICE_RESOLVED (S2)', mCanon?.priceStatus, 'PRICE_RESOLVED');
  eq('std kanonis: kind OFFICIAL_AHSP', mCanon?.priceSourceKind, 'OFFICIAL_AHSP');
  eq('std kanonis: VERIFIED', mCanon?.verificationStatus, 'VERIFIED');
  eq('std kanonis: kode dipertahankan', mCanon?.ahspCode, '3.7.4');
  eq('std kanonis: basis DIRECT_COST', mCanon?.priceCostBasis, 'DIRECT_COST');

  const mAi = mapDedAiItemToRabInput(stdAi, 'DATABASE');
  eq('std AI: PRICE_ESTIMATED (S2, bukan RESOLVED)', mAi?.priceStatus, 'PRICE_ESTIMATED');
  eq('std AI: kind EZRAB_ASSUMPTION', mAi?.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('std AI: NEEDS_VERIFICATION', mAi?.verificationStatus, 'NEEDS_VERIFICATION');
  eq('std AI: label Estimasi AI', mAi?.priceSourceLabel, 'Estimasi AI');
  eq('std AI: tanpa kode AHSP', mAi?.ahspCode, undefined);

  const mMan = mapDedAiItemToRabInput(stdManual, 'DATABASE');
  eq('std manual: PRICE_MANUAL (S2)', mMan?.priceStatus, 'PRICE_MANUAL');
  eq('std manual: kind USER_MANUAL — jujur, bukan kosong (G-PV-3)', mMan?.priceSourceKind, 'USER_MANUAL');
  eq('std manual: NEEDS_VERIFICATION', mMan?.verificationStatus, 'NEEDS_VERIFICATION');
  eq('std manual: label Input User', mMan?.priceSourceLabel, 'Input User');
  eq('std manual: tanpa kode AHSP', mMan?.ahspCode, undefined);

  check('std unresolved: tidak jadi baris', mapDedAiItemToRabInput(stdUnresolved, 'DATABASE') === null);

  const fCanon = mapFullAiItemToRabInput(fullCanon, 'DATABASE');
  eq('full kanonis: PRICE_RESOLVED (S2)', fCanon?.priceStatus, 'PRICE_RESOLVED');
  eq('full kanonis: OFFICIAL_AHSP + kode + VERIFIED',
    fCanon?.priceSourceKind === 'OFFICIAL_AHSP' && fCanon?.ahspCode === '2.2.1.4.1' && fCanon?.verificationStatus === 'VERIFIED', true);
  const fAi = mapFullAiItemToRabInput(fullAi, 'FULL_AI');
  eq('full AI: PRICE_ESTIMATED (S2)', fAi?.priceStatus, 'PRICE_ESTIMATED');
  eq('full AI: Estimasi AI + NEEDS_VERIFICATION + tanpa kode',
    fAi?.priceSourceLabel === 'Estimasi AI' && fAi?.verificationStatus === 'NEEDS_VERIFICATION' && fAi?.ahspCode === undefined, true);
  const fMan = mapFullAiItemToRabInput(fullManual, 'FULL_AI');
  eq('full manual: PRICE_MANUAL (S2)', fMan?.priceStatus, 'PRICE_MANUAL');
  eq('full manual: kind USER_MANUAL (G-PV-3)', fMan?.priceSourceKind, 'USER_MANUAL');
  const fLeg = mapFullAiItemToRabInput(fullLegacy, 'DATABASE');
  eq('full warisan: PRICE_ESTIMATED — plafon jujur S2 (tanpa klaim)', fLeg?.priceStatus, 'PRICE_ESTIMATED');
  eq('full warisan: NEEDS_VERIFICATION + tanpa kind + tanpa kode',
    fLeg?.verificationStatus === 'NEEDS_VERIFICATION' && fLeg?.priceSourceKind === undefined && fLeg?.ahspCode === undefined, true);
  check('full warisan: label netral Belum terverifikasi',
    (fLeg?.priceSourceLabel || '').includes('Belum terverifikasi'));

  const mMagic = mapMagicAiItemToRabInput(magicAi);
  eq('magic AI: PRICE_ESTIMATED (S2)', mMagic?.priceStatus, 'PRICE_ESTIMATED');
  eq('magic AI: EZRAB_ASSUMPTION + NEEDS_VERIFICATION',
    mMagic?.priceSourceKind === 'EZRAB_ASSUMPTION' && mMagic?.verificationStatus === 'NEEDS_VERIFICATION', true);

  // Sapuan: TIDAK SATU PUN harga AI (std / full / magic / warisan)
  // yang RESOLVED atau VERIFIED.
  const aiOutputs = [mAi, fAi, mMagic, fLeg];
  check('AI tidak pernah PRICE_RESOLVED',
    aiOutputs.every((o) => o?.priceStatus !== 'PRICE_RESOLVED'));
  check('AI tidak pernah VERIFIED',
    aiOutputs.every((o) => o?.verificationStatus !== 'VERIFIED'));
  check('AI tidak pernah berkind OFFICIAL_AHSP',
    aiOutputs.every((o) => o?.priceSourceKind !== 'OFFICIAL_AHSP'));
  check('AI tidak pernah membawa ahspCode',
    aiOutputs.every((o) => o?.ahspCode === undefined));

  // Label directive dari hasil finalisasi (round-trip ujung-ke-ujung
  // pada level label).
  eq('label hasil std kanonis = EXTERNALLY_VERIFIED',
    rabProvenanceToLabel(mCanon as never), 'EXTERNALLY_VERIFIED');
  eq('label hasil std AI = AI_ESTIMATED',
    rabProvenanceToLabel(mAi as never), 'AI_ESTIMATED');
  eq('label hasil std manual = USER_PROVIDED',
    rabProvenanceToLabel(mMan as never), 'USER_PROVIDED');
  eq('label hasil full warisan = AI_ESTIMATED',
    rabProvenanceToLabel(fLeg as never), 'AI_ESTIMATED');

  return [mCanon, mAi, mMan, fCanon, fAi, fMan, fLeg, mMagic];
}

/* ================================================================== */
/* [4] Factory: provenance bertahan menjadi RabItem                     */
/* ================================================================== */
function testFactory(mapped: ReturnType<typeof mapDedAiItemToRabInput>[]): any[] {
  console.log('\n[4] Factory createRabItemRecord (jalur bulkAddRabItems):');
  // Cerminan bulkAddRabItems (ProjectContext): defaultVolumeSource
  // AI_GENERATED, defaultUnit ls, index per item.
  const records = mapped.map((m, idx) =>
    createRabItemRecord(m as never, 'proj-w6', {
      defaultVolumeSource: 'AI_GENERATED',
      defaultUnit: 'ls',
      index: idx,
    }),
  );
  eq('factory: 8 record tercipta', records.length, 8);
  const byDesc = (d: string) => records.find((r) => r.description === d) as any;

  const rCanon = byDesc('Plesteran Dinding');
  eq('factory kanonis: PRICE_RESOLVED bertahan', rCanon.priceStatus, 'PRICE_RESOLVED');
  eq('factory kanonis: kind OFFICIAL_AHSP bertahan (G1 SAFE)', rCanon.priceSourceKind, 'OFFICIAL_AHSP');
  eq('factory kanonis: VERIFIED bertahan', rCanon.verificationStatus, 'VERIFIED');
  eq('factory kanonis: kode bertahan', rCanon.ahspCode, '3.7.4');
  eq('factory kanonis: basis DIRECT_COST bertahan', rCanon.priceCostBasis, 'DIRECT_COST');

  const rAi = byDesc('Pengecatan Dinding');
  eq('factory AI: PRICE_ESTIMATED bertahan (BUKAN RESOLVED)', rAi.priceStatus, 'PRICE_ESTIMATED');
  eq('factory AI: kind EZRAB_ASSUMPTION bertahan', rAi.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('factory AI: NEEDS_VERIFICATION bertahan', rAi.verificationStatus, 'NEEDS_VERIFICATION');
  eq('factory AI: label Estimasi AI bertahan', rAi.priceSourceLabel, 'Estimasi AI');
  check('factory AI: explanation bertahan',
    (rAi.priceSourceExplanation || '').includes('bukan harga database'));

  const rMan = byDesc('Pembersihan Lahan');
  eq('factory manual: PRICE_MANUAL bertahan', rMan.priceStatus, 'PRICE_MANUAL');
  eq('factory manual: kind USER_MANUAL bertahan (tidak diturunkan G1)', rMan.priceSourceKind, 'USER_MANUAL');
  eq('factory manual: NEEDS_VERIFICATION bertahan', rMan.verificationStatus, 'NEEDS_VERIFICATION');
  eq('factory manual: label Input User bertahan', rMan.priceSourceLabel, 'Input User');

  const rLeg = byDesc('Pasangan Bata Ringan');
  eq('factory warisan: PRICE_ESTIMATED bertahan', rLeg.priceStatus, 'PRICE_ESTIMATED');
  eq('factory warisan: NEEDS_VERIFICATION bertahan', rLeg.verificationStatus, 'NEEDS_VERIFICATION');
  eq('factory warisan: tanpa kind (tetap)', rLeg.priceSourceKind, undefined);

  const rMagic = byDesc('Pekerjaan Bekisting');
  eq('factory magic: PRICE_ESTIMATED bertahan', rMagic.priceStatus, 'PRICE_ESTIMATED');
  eq('factory magic: kind EZRAB_ASSUMPTION bertahan', rMagic.priceSourceKind, 'EZRAB_ASSUMPTION');

  // Sapuan factory: tidak satu pun harga AI yang RESOLVED/VERIFIED.
  const aiDescs = ['Pengecatan Dinding', 'Balok Ring', 'Pekerjaan Bekisting', 'Pasangan Bata Ringan'];
  check('factory: AI tidak pernah PRICE_RESOLVED',
    aiDescs.every((d) => byDesc(d).priceStatus !== 'PRICE_RESOLVED'));
  check('factory: AI tidak pernah VERIFIED',
    aiDescs.every((d) => byDesc(d).verificationStatus !== 'VERIFIED'));
  return records;
}

/* ================================================================== */
/* [5] normalizeSections: provenance bertahan (persistensi)             */
/* ================================================================== */
function testNormalize(records: any[]): { project: Project; sections: any[] } {
  console.log('\n[5] Persistence normalization (normalizeSections nyata):');
  const project = {
    id: 'proj-w6',
    name: 'Proyek Uji W6',
    currentVersion: 'Rev 01',
    sections: [],
    rabItems: records,
    costSummary: {},
  } as unknown as Project;
  // Rekonstruksi dari rabItems (sections kosong) — jalur pemetaan field
  // eksplisit, BUKAN pengembalian sections tersimpan.
  const sections = UnifiedProjectEngine.normalizeSections(project, records as never);
  const flat = sections.flatMap((s) => (s.items || []) as any[]);
  eq('normalisasi: 8 item hadir (tidak ada yang hilang)', flat.length, 8);
  const byDesc = (d: string) => flat.find((x) => x.description === d)!;

  const nAi = byDesc('Pengecatan Dinding');
  eq('normalisasi AI: PRICE_ESTIMATED bertahan', nAi.priceStatus, 'PRICE_ESTIMATED');
  eq('normalisasi AI: kind bertahan', nAi.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('normalisasi AI: label bertahan', nAi.priceSourceLabel, 'Estimasi AI');
  eq('normalisasi AI: NEEDS_VERIFICATION bertahan', nAi.verificationStatus, 'NEEDS_VERIFICATION');
  const nMan = byDesc('Pembersihan Lahan');
  eq('normalisasi MANUAL: PRICE_MANUAL bertahan', nMan.priceStatus, 'PRICE_MANUAL');
  eq('normalisasi MANUAL: kind USER_MANUAL bertahan', nMan.priceSourceKind, 'USER_MANUAL');
  eq('normalisasi MANUAL: NEEDS_VERIFICATION bertahan', nMan.verificationStatus, 'NEEDS_VERIFICATION');
  const nCanon = byDesc('Plesteran Dinding');
  eq('normalisasi OFFICIAL: PRICE_RESOLVED bertahan', nCanon.priceStatus, 'PRICE_RESOLVED');
  eq('normalisasi OFFICIAL: kind bertahan', nCanon.priceSourceKind, 'OFFICIAL_AHSP');
  eq('normalisasi OFFICIAL: VERIFIED bertahan', nCanon.verificationStatus, 'VERIFIED');
  eq('normalisasi OFFICIAL: priceCostBasis DIRECT_COST bertahan', nCanon.priceCostBasis, 'DIRECT_COST');
  const nLeg = byDesc('Pasangan Bata Ringan');
  eq('normalisasi WARISAN: PRICE_ESTIMATED bertahan', nLeg.priceStatus, 'PRICE_ESTIMATED');
  eq('normalisasi WARISAN: label netral bertahan', nLeg.priceSourceLabel, 'Belum terverifikasi independen (data lama)');

  // Total TIDAK berubah oleh S2: ESTIMATED + MANUAL + RESOLVED
  // sama-sama masuk total (hanya UNRESOLVED yang dikecualikan).
  const subtotalSum = sections.reduce((a, s) => a + (s.subtotal || 0), 0);
  const expectedTotal = 10 * 51622 + 5 * 850000 + 2 * 100000 + 2 * 4500000
    + 2 * 4000000 + 1 * 3000000 + 1 * 2000000 + 3 * 150000;
  eq('Σ subtotal seksi == Σ qty × harga fixture', subtotalSum, expectedTotal);
  const engine = UnifiedProjectEngine.recalculateCostSummary(records as never, {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  } as never);
  eq('Σ subtotal seksi == directCost engine', subtotalSum, engine.directCost);
  const fromSections = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  eq('seksi menghitung 0 item unresolved', fromSections.unresolvedItems, 0);
  return { project, sections };
}

/* ================================================================== */
/* [6] Ekspor 5 sheet: provenance bertahan sampai workbook              */
/* ================================================================== */
async function testExport(project: Project, sections: any[]): Promise<void> {
  console.log('\n[6] Spreadsheet export nyata (5 sheet):');
  const { summarizeExportSections } = await import('../export/priceIntegrity');
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  const summary = summarizeExportSections(sections as any);
  const snapshot = freezeRabSnapshot(project, sections as never, costs, summary, {
    actor: 'demo/anonim',
    createdAt: '2026-11-13T10:00:00.000Z',
  });
  const snapItems = snapshot.sections.flatMap((s) => (s.items || []) as any[]);
  eq('snapshot: 4 item PRICE_ESTIMATED', snapItems.filter((i) => i.priceStatus === 'PRICE_ESTIMATED').length, 4);
  eq('snapshot: 2 item PRICE_RESOLVED', snapItems.filter((i) => i.priceStatus === 'PRICE_RESOLVED').length, 2);
  eq('snapshot: 2 item PRICE_MANUAL', snapItems.filter((i) => i.priceStatus === 'PRICE_MANUAL').length, 2);
  eq('snapshot: 2 item kind USER_MANUAL', snapItems.filter((i) => i.priceSourceKind === 'USER_MANUAL').length, 2);
  eq('snapshot: manualTotal == Rp3.200.000 (2 item manual)',
    summary.manualTotal, 2 * 100000 + 1 * 3000000);

  const company = {
    id: 'comp-w6', name: 'PT Uji W6', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 0, defaultProfitPercent: 0,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
  const wb = new ExcelJS.Workbook();
  buildFiveSheetWorkbook(wb, snapshot, company, {});
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as any);

  const findRowByText = (ws: ExcelJS.Worksheet, text: string, col: number): number => {
    let found = -1;
    ws.eachRow((row, rowNumber) => {
      const v = row.getCell(col).value;
      if (typeof v === 'string' && v.includes(text)) found = rowNumber;
    });
    return found;
  };
  const cellText = (c: ExcelJS.Cell): string => {
    const v = c.value;
    return typeof v === 'string' ? v : v == null ? '' : String(v);
  };

  // Sheet 1 — hitungan estimasi.
  const ws1 = wb2.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const estRow = findRowByText(ws1, 'Item Estimasi AI (PRICE_ESTIMATED)', 1);
  check('Sheet 1: baris Item Estimasi AI ada', estRow > 0);
  eq('Sheet 1: 4 item estimasi', cellText(ws1.getCell(`B${estRow}`)), '4 item');

  // Sheet 5 — provenance per item (kolom C deskripsi, D sumber,
  // F label, G verifikasi).
  const ws5 = wb2.getWorksheet(FIVE_SHEET_NAMES.sources)!;
  const row5 = (desc: string): number => {
    const r = findRowByText(ws5, desc, 3);
    assert.ok(r > 0, `baris Sheet 5 untuk ${desc} ada`);
    return r;
  };
  const rAi = row5('Pengecatan Dinding');
  eq('Sheet 5 AI: sumber = ASUMSI — PERLU VERIFIKASI', cellText(ws5.getCell(`D${rAi}`)), 'ASUMSI — PERLU VERIFIKASI');
  eq('Sheet 5 AI: label = Estimasi AI', cellText(ws5.getCell(`F${rAi}`)), 'Estimasi AI');
  eq('Sheet 5 AI: verifikasi = PERLU VERIFIKASI (NEEDS_VERIFICATION)', cellText(ws5.getCell(`G${rAi}`)), 'PERLU VERIFIKASI (NEEDS_VERIFICATION)');
  const rMan = row5('Pembersihan Lahan');
  eq('Sheet 5 MANUAL: sumber = INPUT MANUAL', cellText(ws5.getCell(`D${rMan}`)), 'INPUT MANUAL');
  eq('Sheet 5 MANUAL: label = Input User', cellText(ws5.getCell(`F${rMan}`)), 'Input User');
  eq('Sheet 5 MANUAL: verifikasi = PERLU VERIFIKASI (NEEDS_VERIFICATION)', cellText(ws5.getCell(`G${rMan}`)), 'PERLU VERIFIKASI (NEEDS_VERIFICATION)');
  const rCanon = row5('Plesteran Dinding');
  eq('Sheet 5 OFFICIAL: label = AHSP Kanonis (SE 47/2026)', cellText(ws5.getCell(`F${rCanon}`)), 'AHSP Kanonis (SE 47/2026)');
  eq('Sheet 5 OFFICIAL: verifikasi = TERVERIFIKASI (VERIFIED)', cellText(ws5.getCell(`G${rCanon}`)), 'TERVERIFIKASI (VERIFIED)');
  const rLeg = row5('Pasangan Bata Ringan');
  eq('Sheet 5 WARISAN: sumber = label netral (tanpa kind)', cellText(ws5.getCell(`D${rLeg}`)), 'Belum terverifikasi independen (data lama)');
  eq('Sheet 5 WARISAN: verifikasi = PERLU VERIFIKASI (NEEDS_VERIFICATION)', cellText(ws5.getCell(`G${rLeg}`)), 'PERLU VERIFIKASI (NEEDS_VERIFICATION)');
}

/* ================================================================== */
/* [7] Helper badge UI                                                 */
/* ================================================================== */
function testBadges(): void {
  console.log('\n[7] Helper badge UI (provenanceBadge*):');
  eq('badge AHSP_2026: teks AHSP Kanonis', provenanceBadgeForDedSource('AHSP_2026').text, 'AHSP Kanonis');
  eq('badge AI_ESTIMATE: teks Estimasi AI', provenanceBadgeForDedSource('AI_ESTIMATE').text, 'Estimasi AI');
  eq('badge USER_INPUT: teks Input User', provenanceBadgeForDedSource('USER_INPUT').text, 'Input User');
  eq('badge VERIFIED_SOURCE: teks Belum terverifikasi', provenanceBadgeForDedSource('VERIFIED_SOURCE').text, 'Belum terverifikasi');
  eq('badge UNRESOLVED: teks Tanpa Harga', provenanceBadgeForDedSource('UNRESOLVED').text, 'Tanpa Harga');
  const aiBg = provenanceBadgeForDedSource('AI_ESTIMATE').bg;
  const canonBg = provenanceBadgeForDedSource('AHSP_2026').bg;
  const manBg = provenanceBadgeForDedSource('USER_INPUT').bg;
  check('badge: AI ≠ kanonis ≠ manual (warna latar berbeda)',
    aiBg !== canonBg && aiBg !== manBg && canonBg !== manBg);
  for (const label of DED_PROVENANCE_LABELS) {
    const b = provenanceBadgeForLabel(label);
    check(`badge label ${label}: teks non-kosong`, b.text.trim() !== '');
  }
  for (const src of ['AHSP_2026', 'AI_ESTIMATE', 'USER_INPUT', 'VERIFIED_SOURCE', 'UNRESOLVED']) {
    check(`explanation ${src}: non-kosong`,
      provenanceExplanationForDedSource(src).trim() !== '');
  }
  check('explanation AI menyebut bukan harga database',
    provenanceExplanationForDedSource('AI_ESTIMATE').includes('bukan harga database'));
  check('explanation kanonis menyebut tervalidasi',
    provenanceExplanationForDedSource('AHSP_2026').includes('tervalidasi'));
}

/* ================================================================== */
/* main                                                                */
/* ================================================================== */
async function main(): Promise<void> {
  testMappingTable();
  testRoundTrip();
  testTransferClaims();
  const mapped = testFinalizeS2();
  const records = testFactory(mapped);
  const { project, sections } = testNormalize(records);
  await testExport(project, sections);
  testBadges();

  console.log(`\n=== HASIL W6: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) {
    console.log('Gagal:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('W6 run error:', err);
  process.exit(1);
});
