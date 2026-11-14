/**
 * S2 — FINAL INTEGRITY REPAIR §2: provenance harga bertahan saat transfer (P6-O2).
 *
 * Cacat (pra-ada, LAPORAN-AKHIR §6/§13): `buildPushPayload` melipat SEMUA
 * item berharga non-manual ke PRICE_RESOLVED saat transfer — provenance P1
 * hilang di batas transfer; estimasi AI yang sudah diputuskan user tampil
 * sebagai harga resmi di spreadsheet.
 *
 * Suite ini membuktikan provenance bertahan di 7 tahap, lewat JALUR KODE
 * NYATA (bukan mock atas hal yang diuji — stub hanya untuk lookup AHSP
 * remap, pola P6; tanpa panggilan provider):
 *   (1) draft generation — buildUniversalDraft nyata (jembatan beton 12 m);
 *   (2) review edits — editDraftItem / setDraftItemManualPrice /
 *       remapDraftItemAhsp nyata (draftReview.ts);
 *   (3) user assumption decisions — decideDraftItemAssumption +
 *       verifyDraftItemPrice nyata;
 *   (4) approval — buildPushPreview + validateTransfer +
 *       create/checkTransferApprovalBinding nyata (G1);
 *   (5) project transfer — buildPushPayload + dedupePushPayload +
 *       createRabItemRecord nyata (panggilan yang sama dengan
 *       bulkAddRabItems di ProjectContext);
 *   (6) persistence normalization — UnifiedProjectEngine.normalizeSections
 *       nyata (rekonstruksi dari rabItems, pemetaan field eksplisit);
 *   (7) spreadsheet export — freezeRabSnapshot + buildFiveSheetWorkbook
 *       nyata (ExcelJS write + reload; nilai priceStatus/source di workbook).
 *
 * Kosakata yang dipakai adalah yang SUDAH ADA di repo (PriceStatus,
 * priceSourceKind, VerificationStatus, UserDecisionStatus) — tanpa
 * taxonomy pengganti.
 *
 * Fixture estimasi: generasi template nyata tidak menghasilkan item
 * PRICE_ESTIMATED (probe: 40/40 item berharga dari 5 prompt adalah
 * RESOLVED resmi/pasar) — ESTIMATED di produksi berasal dari jalur
 * estimasi AI (aiEstimatePipeline.ts:693/746, P1 modal). Dua item draft
 * nyata dimutasi menjadi ESTIMATED + EZRAB_ASSUMPTION persis seperti
 * klasifikasi P1 (label 'Estimasi AI', NEEDS_VERIFICATION) untuk
 * mensimulasikan item itu; SEMUA fungsi yang diuji (review, approval,
 * payload, factory, normalisasi, ekspor) adalah kode nyata.
 *
 * Batas yang disengaja (bukan kelalaian):
 * - verificationDate / userDecisionStatus di Sheet 5 TIDAK diasersi —
 *   itu P6-O1, cakupan §4 (worker paralel). Suite ini hanya mengasersi
 *   keduanya bertahan sampai PAYLOAD (P6) dan tidak hilang oleh S2.
 * - Golden multi-gedung (Rp924.102.500), kandang (Rp125.837.348,49), dan
 *   DED (Rp149.023.200) dibuktikan lewat rerun suite pemiliknya
 *   (chatPhase5MultiBuilding, dedPriceCompletion) — lihat LAPORAN-S2.md.
 *   Suite ini mem-pin golden Premium Demo (Rp1.089.879.733) langsung.
 *
 * Jalankan: npx --yes tsx src/test/s2ProvenanceTransfer.test.ts
 * (Skrip tsx mandiri dengan assert — pola p5FiveSheetExport; repo ini
 * tidak punya paket vitest.)
 */
import ExcelJS from 'exceljs';
import { strict as assert } from 'node:assert';
import {
  buildUniversalDraft,
  effectiveItems,
  computeTotals,
  draftReadiness,
  buildPushPreview,
  buildPushPayload,
  dedupePushPayload,
  validateTransfer,
  transferPriceStatus,
  transferVerificationStatus,
  hasResolvedPriceEvidence,
  type UniversalDraft,
  type UniversalPushItem,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  editDraftItem,
  setDraftItemManualPrice,
  remapDraftItemAhsp,
  verifyDraftItemPrice,
  decideDraftItemAssumption,
  itemHasDecidableAssumption,
  type AhspPriceLookup,
} from '../ai-tools/ezrab-ai/draftReview';
import {
  createTransferApprovalBinding,
  checkTransferApprovalBinding,
} from '../ai-tools/ezrab-ai/draftPersistence';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import {
  FIVE_SHEET_NAMES,
  buildFiveSheetWorkbook,
  freezeRabSnapshot,
} from '../export/fiveSheetPreset';
import { computeRekapSummary } from '../components/estimator/rekapSummary';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
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

const PID = 'proj-s2';
const T0 = 1794000000000; // fixed, deterministik (bukan Date.now)
const VERIFY_AT = '2026-11-13T10:00:00.000Z';

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

/** Item generasi mentah untuk satu ID efektif (`templateId::id`). */
function genItem(draft: UniversalDraft, effId: string): any {
  for (const part of draft.parts) {
    for (const raw of part.generation.items as any[]) {
      if (`${part.template.id}::${raw.id}` === effId) return raw;
    }
  }
  throw new Error(`item generasi tidak ditemukan untuk ${effId}`);
}

function byCode(items: any[], code: string): any {
  const it = items.find((i) => i.code === code);
  assert.ok(it, `item kode ${code} ada`);
  return it;
}

function company(): Company {
  return {
    id: 'comp-s2', name: 'PT Uji S2', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 0, defaultProfitPercent: 0,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

/** Cari baris berisi teks di kolom tertentu (pola P5). */
function findRowByText(ws: ExcelJS.Worksheet, text: string, col: number): number {
  let found = -1;
  ws.eachRow((row, rowNumber) => {
    const v = row.getCell(col).value;
    if (typeof v === 'string' && v.includes(text)) found = rowNumber;
  });
  return found;
}
function cellText(c: ExcelJS.Cell): string {
  const v = c.value;
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/* ================================================================== */
/* [0] Kontrak transfer — unit atas helper murni                       */
/* ================================================================== */
function testContractHelpers(): void {
  console.log('\n[0] Kontrak transferPriceStatus / transferVerificationStatus:');
  // ESTIMATED dipertahankan (inti P6-O2).
  eq('ESTIMATED + EZRAB_ASSUMPTION → ESTIMATED',
    transferPriceStatus({ priceStatus: 'PRICE_ESTIMATED', unitPrice: 150000, priceSourceKind: 'EZRAB_ASSUMPTION' }),
    'PRICE_ESTIMATED');
  eq('ESTIMATED + VERIFIED eksplisit → tetap ESTIMATED (verifikasi bukan bukti resmi)',
    transferPriceStatus({ priceStatus: 'PRICE_ESTIMATED', unitPrice: 150000, priceSourceKind: 'EZRAB_ASSUMPTION', verificationStatus: 'VERIFIED', verificationDate: VERIFY_AT }),
    'PRICE_ESTIMATED');
  // MANUAL dipertahankan.
  eq('MANUAL → MANUAL',
    transferPriceStatus({ priceStatus: 'PRICE_MANUAL', unitPrice: 900000 }),
    'PRICE_MANUAL');
  // RESOLVED berbukti dipertahankan — tiga bentuk bukti.
  eq('RESOLVED + OFFICIAL_AHSP → RESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, priceSourceKind: 'OFFICIAL_AHSP' }),
    'PRICE_RESOLVED');
  eq('RESOLVED + MARKET_REFERENCE → RESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, priceSourceKind: 'MARKET_REFERENCE' }),
    'PRICE_RESOLVED');
  eq('RESOLVED + mapping VERIFIED (tanpa kind) → RESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, ahspMappingStatus: 'VERIFIED' }),
    'PRICE_RESOLVED');
  eq('RESOLVED + verifikasi eksplisit user → RESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, verificationStatus: 'VERIFIED', verificationDate: VERIFY_AT }),
    'PRICE_RESOLVED');
  // RESOLVED tanpa bukti → ESTIMATED (plafon jujur, total tidak berubah).
  eq('RESOLVED tanpa kind/mapping/verifikasi → ESTIMATED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000 }),
    'PRICE_ESTIMATED');
  eq('RESOLVED + kind EZRAB_ASSUMPTION (kontradiksi) → ESTIMATED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, priceSourceKind: 'EZRAB_ASSUMPTION' }),
    'PRICE_ESTIMATED');
  eq('RESOLVED + kind UNRESOLVED → ESTIMATED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, priceSourceKind: 'UNRESOLVED' }),
    'PRICE_ESTIMATED');
  eq('RESOLVED + VERIFIED tanpa tanggal → ESTIMATED (verifikasi tak lengkap)',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000, verificationStatus: 'VERIFIED' }),
    'PRICE_ESTIMATED');
  eq('label saja BUKAN bukti → ESTIMATED',
    hasResolvedPriceEvidence({ priceStatus: 'PRICE_RESOLVED', unitPrice: 100000 } as any),
    false);
  // Status hilang/tak dikenal + harga valid → ESTIMATED (bukan RESOLVED).
  eq('tanpa status + harga valid → ESTIMATED',
    transferPriceStatus({ unitPrice: 100000 }),
    'PRICE_ESTIMATED');
  // UNRESOLVED dipertahankan.
  eq('UNRESOLVED + null → UNRESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_UNRESOLVED', unitPrice: null }),
    'PRICE_UNRESOLVED');
  eq('harga NaN → UNRESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: NaN }),
    'PRICE_UNRESOLVED');
  // Sentinel 0.
  eq('sentinel 0 tanpa status → UNRESOLVED (bukan RESOLVED Rp0)',
    transferPriceStatus({ unitPrice: 0 }),
    'PRICE_UNRESOLVED');
  eq('sentinel 0 + UNRESOLVED → UNRESOLVED',
    transferPriceStatus({ priceStatus: 'PRICE_UNRESOLVED', unitPrice: 0 }),
    'PRICE_UNRESOLVED');
  eq('nol eksplisit RESOLVED + bukti → RESOLVED (kontrak factory: 0 eksplisit = harga nyata)',
    transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: 0, priceSourceKind: 'OFFICIAL_AHSP' }),
    'PRICE_RESOLVED');
  eq('nol eksplisit MANUAL → MANUAL',
    transferPriceStatus({ priceStatus: 'PRICE_MANUAL', unitPrice: 0 }),
    'PRICE_MANUAL');
  eq('nol model ESTIMATED → ESTIMATED (P1)',
    transferPriceStatus({ priceStatus: 'PRICE_ESTIMATED', unitPrice: 0, priceSourceKind: 'EZRAB_ASSUMPTION' }),
    'PRICE_ESTIMATED');

  // Status verifikasi transfer.
  eq('UNRESOLVED → NEEDS_VERIFICATION (klaim VERIFIED pun diturunkan)',
    transferVerificationStatus({ verificationStatus: 'VERIFIED', verificationDate: VERIFY_AT }, 'PRICE_UNRESOLVED'),
    'NEEDS_VERIFICATION');
  eq('VERIFIED eksplisit pada ESTIMATED dipertahankan (sumbu berbeda)',
    transferVerificationStatus({ verificationStatus: 'VERIFIED', verificationDate: VERIFY_AT }, 'PRICE_ESTIMATED'),
    'VERIFIED');
  eq('NEEDS_VERIFICATION eksplisit dipertahankan',
    transferVerificationStatus({ verificationStatus: 'NEEDS_VERIFICATION' }, 'PRICE_MANUAL'),
    'NEEDS_VERIFICATION');
  eq('tanpa status eksplisit + RESOLVED berbukti → VERIFIED',
    transferVerificationStatus({}, 'PRICE_RESOLVED'),
    'VERIFIED');
  eq('tanpa status eksplisit + ESTIMATED → NEEDS_VERIFICATION (bukan simpulan dari angka)',
    transferVerificationStatus({}, 'PRICE_ESTIMATED'),
    'NEEDS_VERIFICATION');
  eq('tanpa status eksplisit + MANUAL → NEEDS_VERIFICATION (P6)',
    transferVerificationStatus({}, 'PRICE_MANUAL'),
    'NEEDS_VERIFICATION');
}

/* ================================================================== */
/* [1] Tahap 1 — draft generation (nyata) + fixture estimasi           */
/* ================================================================== */
function testStage1(): { draft: UniversalDraft; ids: Record<string, string> } {
  console.log('\n[1] Tahap 1 — draft generation nyata + fixture estimasi:');
  const draft = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const items = effectiveItems(draft);
  eq('draft jembatan: 11 item', items.length, 11);
  check('readiness bukan BLOCKED (dapat ditransfer)', draftReadiness(draft).status !== 'BLOCKED',
    `readiness=${draftReadiness(draft).status}`);
  const official = items.filter((i) => i.priceSourceKind === 'OFFICIAL_AHSP');
  const market = items.filter((i) => i.priceSourceKind === 'MARKET_REFERENCE');
  const unpriced = items.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED');
  eq('4 item resmi OFFICIAL_AHSP', official.length, 4);
  eq('6 item pasar MARKET_REFERENCE', market.length, 6);
  eq('1 item UNRESOLVED', unpriced.length, 1);
  check('semua item berharga hasil generasi membawa bukti RESOLVED (kind resmi/pasar)',
    items.filter((i) => i.priceStatus === 'PRICE_RESOLVED').every((i) => hasResolvedPriceEvidence(i as any)));
  check('generasi tidak pernah mengisi verificationStatus (fakta draftReview.ts)',
    items.every((i) => (i as any).verificationStatus == null));

  // Fixture estimasi (mutasi item nyata → klasifikasi P1 persis):
  // EST#1 = kode 4 (MARKET), EST#2 = kode 6 (MARKET).
  const ids: Record<string, string> = {};
  for (const [code, key] of [['1', 'official'], ['2', 'manualTarget'], ['4', 'est1'], ['6', 'est2'], ['7', 'market'], ['9', 'noevid'], ['11', 'unresolved']] as const) {
    ids[key] = byCode(items, code).id;
  }
  const estText = 'Harga saran model AI — perkiraan, belum terverifikasi terhadap database AHSP EZRAB.';
  for (const key of ['est1', 'est2'] as const) {
    const raw = genItem(draft, ids[key]);
    raw.priceStatus = 'PRICE_ESTIMATED';
    raw.priceSourceKind = 'EZRAB_ASSUMPTION';
    raw.priceSourceLabel = 'Estimasi AI';
    raw.priceSourceExplanation = estText;
    delete raw.verificationStatus;
    delete raw.verificationDate;
  }
  // NOEVID = kode 9: klaim RESOLVED tanpa bukti apa pun.
  const noevid = genItem(draft, ids.noevid);
  delete noevid.priceSourceKind;
  delete noevid.priceSourceLabel;
  delete noevid.priceSourceExplanation;
  delete noevid.ahspMappingStatus;
  delete noevid.verificationStatus;
  delete noevid.priceSourceName;
  delete noevid.priceSourceSupplier;
  delete noevid.priceSourceDate;
  delete noevid.priceSourceRegion;
  delete noevid.priceCostBasis;
  // Metadata sumber pasar (nilai fixture sintetis, jelas bukan data nyata)
  // pada kontrol MARKET — membuktikan threading supplier/date/region.
  const mkt = genItem(draft, ids.market);
  mkt.priceSourceSupplier = 'SUPPLIER-FIXTURE-S2';
  mkt.priceSourceDate = '2026-11-13';
  mkt.priceSourceRegion = 'REGION-FIXTURE-S2';
  // SENTINEL: klon kode 8, unitPrice 0 TANPA status/kind apa pun.
  const src8 = byCode(items, '8');
  const sentinelRaw = {
    ...structuredClone(genItem(draft, src8.id)),
    id: `${src8.id}-s2-sentinel`,
    description: 'Item sentinel nol (uji S2)',
    unitPrice: 0, amount: 0, totalPrice: 0,
  };
  for (const k of ['priceStatus', 'priceSourceKind', 'priceSourceLabel', 'priceSourceExplanation', 'ahspMappingStatus', 'verificationStatus', 'priceCostBasis', 'priceSourceName', 'priceSourceSupplier', 'priceSourceDate', 'priceSourceRegion', 'ahspCode'] as const) {
    delete (sentinelRaw as any)[k];
  }
  draft.parts[0].generation.items.push(sentinelRaw as never);
  ids.sentinel = `${draft.parts[0].template.id}::${sentinelRaw.id}`;

  const eff = effectiveItems(draft);
  eq('sesudah fixture: 12 item efektif', eff.length, 12);
  eq('EST#1 = PRICE_ESTIMATED di draft', eff.find((i) => i.id === ids.est1)!.priceStatus, 'PRICE_ESTIMATED');
  eq('EST#2 = PRICE_ESTIMATED di draft', eff.find((i) => i.id === ids.est2)!.priceStatus, 'PRICE_ESTIMATED');
  check('EST#1 membawa asumsi yang dapat diputuskan', itemHasDecidableAssumption(eff.find((i) => i.id === ids.est1)!));
  eq('NOEVID masih mengklaim RESOLVED di draft (pra-transfer)',
    eff.find((i) => i.id === ids.noevid)!.priceStatus, 'PRICE_RESOLVED');
  const sent = eff.find((i) => i.id === ids.sentinel)!;
  eq('SENTINEL: unitPrice 0 tanpa status di draft', sent.unitPrice, 0);
  eq('SENTINEL: priceStatus absen di draft', (sent as any).priceStatus, undefined);
  return { draft, ids };
}

/* ================================================================== */
/* [2] Tahap 2 — review edits (fungsi review nyata)                    */
/* ================================================================== */
function testStage2(draft: UniversalDraft, ids: Record<string, string>): UniversalDraft {
  console.log('\n[2] Tahap 2 — review edits nyata:');
  // Edit volume EST#1: provenance tidak boleh berubah oleh edit.
  const est1Before = effectiveItems(draft).find((i) => i.id === ids.est1)!;
  const edited = editDraftItem(draft, ids.est1, { volume: est1Before.volume + 1 });
  assert.ok(edited.ok && edited.draft, `edit volume gagal: ${edited.message}`);
  let d = edited.draft;
  const est1After = effectiveItems(d).find((i) => i.id === ids.est1)!;
  eq('edit volume EST#1 diterapkan', est1After.volume, est1Before.volume + 1);
  eq('edit volume TIDAK mengubah priceStatus ESTIMATED', est1After.priceStatus, 'PRICE_ESTIMATED');
  eq('edit volume TIDAK mengubah kind EZRAB_ASSUMPTION', est1After.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('edit volume TIDAK mengubah label Estimasi AI', est1After.priceSourceLabel, 'Estimasi AI');

  // Harga manual pada item resmi (kode 2) — jalur review nyata.
  const manual = setDraftItemManualPrice(d, ids.manualTarget, 900000, 'Harga manual review S2');
  assert.ok(manual.ok && manual.draft, `harga manual gagal: ${manual.message}`);
  d = manual.draft;
  const man = effectiveItems(d).find((i) => i.id === ids.manualTarget)!;
  eq('harga manual → PRICE_MANUAL', man.priceStatus, 'PRICE_MANUAL');
  eq('harga manual → unitPrice 900000', man.unitPrice, 900000);
  eq('harga manual → NEEDS_VERIFICATION (P6)', (man as any).verificationStatus, 'NEEDS_VERIFICATION');
  eq('harga manual → label Harga manual pengguna', man.priceSourceLabel, 'Harga manual pengguna');

  // Remap FULL (stub lookup pola P6) pada salinan terpisah: RESOLVED
  // berbukti dari review bertahan sampai payload. (Sengaja TIDAK masuk
  // rantai utama: kode stub 'STUB-FULL' bukan kode kanonis sehingga
  // factory akan menurunkan kind-nya lewat aturan G1 — perilaku
  // pra-ada yang benar, di luar cakupan S2.)
  const stubLookup: AhspPriceLookup = (code, itemUnit) => {
    if (code === 'STUB-FULL') {
      return { found: true, catalogUnit: itemUnit, pricingStatus: 'FULL', resolvedComponents: 7, totalComponents: 7, unitPrice: 50000 };
    }
    return { found: false };
  };
  const draftCopy = structuredClone(d);
  const unresId = ids.unresolved;
  const remapped = remapDraftItemAhsp(draftCopy, unresId, 'STUB-FULL', { priceLookup: stubLookup });
  assert.ok(remapped.ok && remapped.draft, `remap gagal: ${remapped.message}`);
  const rp = buildPushPayload(remapped.draft);
  const remappedPayload = rp.find((p) => p.description.includes('Sambungan Siar Muai'))!;
  eq('remap FULL → payload PRICE_RESOLVED', remappedPayload.priceStatus, 'PRICE_RESOLVED');
  eq('remap FULL → payload kind OFFICIAL_AHSP', remappedPayload.priceSourceKind, 'OFFICIAL_AHSP');
  eq('remap FULL → payload unitPrice 50000', remappedPayload.unitPrice, 50000);
  return d;
}

/* ================================================================== */
/* [3] Tahap 3 — user assumption decisions (fungsi review nyata)       */
/* ================================================================== */
function testStage3(draft: UniversalDraft, ids: Record<string, string>): UniversalDraft {
  console.log('\n[3] Tahap 3 — putusan asumsi + verifikasi eksplisit nyata:');
  // Negatif: item resmi tidak punya asumsi untuk diputuskan.
  const noAssumption = decideDraftItemAssumption(draft, ids.official, 'DISETUJUI');
  check('putusan atas item resmi DITOLAK (tidak ada asumsi)', !noAssumption.ok, noAssumption.message);
  // Negatif: item tanpa harga tidak dapat diverifikasi.
  const noPrice = verifyDraftItemPrice(draft, ids.unresolved, { at: VERIFY_AT });
  check('verifikasi item tanpa harga DITOLAK', !noPrice.ok, noPrice.message);

  // EST#1: DISETUJUI + verifikasi eksplisit — status HARGA tetap ESTIMATED.
  const dec1 = decideDraftItemAssumption(draft, ids.est1, 'DISETUJUI');
  assert.ok(dec1.ok && dec1.draft, `putusan EST#1 gagal: ${dec1.message}`);
  let d = dec1.draft;
  const ver1 = verifyDraftItemPrice(d, ids.est1, { at: VERIFY_AT });
  assert.ok(ver1.ok && ver1.draft, `verifikasi EST#1 gagal: ${ver1.message}`);
  d = ver1.draft;
  const e1 = effectiveItems(d).find((i) => i.id === ids.est1)!;
  eq('EST#1: putusan tercatat DISETUJUI', (e1 as any).userDecisionStatus, 'DISETUJUI');
  eq('EST#1: verificationDate tercatat', (e1 as any).verificationDate, VERIFY_AT);
  eq('EST#1: verificationStatus VERIFIED', (e1 as any).verificationStatus, 'VERIFIED');
  eq('EST#1: priceStatus TETAP ESTIMATED sesudah putusan+verifikasi (persetujuan ≠ harga resmi)',
    e1.priceStatus, 'PRICE_ESTIMATED');
  eq('EST#1: kind TETAP EZRAB_ASSUMPTION', e1.priceSourceKind, 'EZRAB_ASSUMPTION');

  // EST#2: DISETUJUI tanpa verifikasi.
  const dec2 = decideDraftItemAssumption(d, ids.est2, 'DISETUJUI');
  assert.ok(dec2.ok && dec2.draft, `putusan EST#2 gagal: ${dec2.message}`);
  d = dec2.draft;
  const e2 = effectiveItems(d).find((i) => i.id === ids.est2)!;
  eq('EST#2: putusan tercatat DISETUJUI', (e2 as any).userDecisionStatus, 'DISETUJUI');
  eq('EST#2: priceStatus TETAP ESTIMATED', e2.priceStatus, 'PRICE_ESTIMATED');
  eq('EST#2: tanpa verifikasi eksplisit → verificationStatus absen', (e2 as any).verificationStatus, undefined);
  return d;
}

/* ================================================================== */
/* [4] Tahap 4 — approval (preview + validasi + binding G1 nyata)      */
/* ================================================================== */
function testStage4(draft: UniversalDraft): void {
  console.log('\n[4] Tahap 4 — approval nyata:');
  const pv = buildPushPreview(draft);
  eq('preview: 12 item', pv.itemCount, 12);
  check('preview: tidak diblokir transfer', !pv.transferBlocked, pv.blockReasons.join('; '));
  const v = validateTransfer(draft, PID);
  check('validateTransfer: diizinkan', v.allowed, v.reasons.join('; '));
  const binding = createTransferApprovalBinding(draft, PID, T0);
  check('binding approval: cek ok', checkTransferApprovalBinding(binding, draft, PID, T0).ok === true);
  // Negatif: draft berubah sesudah approval → binding batal (gate nyata).
  const mutated = structuredClone(draft);
  (mutated.parts[0].generation.items[0] as any).description += ' (diubah sesudah approval)';
  const stale = checkTransferApprovalBinding(binding, mutated, PID, T0);
  check('binding batal bila draft berubah sesudah approval', !stale.ok);
  const expired = checkTransferApprovalBinding(binding, draft, PID, T0 + 11 * 60 * 1000);
  check('binding batal sesudah TTL 10 menit', !expired.ok);
}

/* ================================================================== */
/* [5] Tahap 5 — project transfer (payload + factory nyata)            */
/* ================================================================== */
function testStage5(draft: UniversalDraft, ids: Record<string, string>): { payload: UniversalPushItem[]; records: any[] } {
  console.log('\n[5] Tahap 5 — project transfer nyata (payload + factory):');
  const payload = buildPushPayload(draft);
  eq('payload: 12 item', payload.length, 12);
  const byId = (effId: string) => {
    const eff = effectiveItems(draft).find((i) => i.id === effId)!;
    const p = payload.find((x) => x.description === `[Chat AI] ${eff.description}`)!;
    assert.ok(p, `payload untuk ${eff.description} ada`);
    return p;
  };

  // — Payload: status + provenance + verifikasi. —
  const pEst1 = byId(ids.est1);
  eq('payload EST#1: PRICE_ESTIMATED (BUKAN lipatan RESOLVED)', pEst1.priceStatus, 'PRICE_ESTIMATED');
  eq('payload EST#1: kind EZRAB_ASSUMPTION', pEst1.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('payload EST#1: label Estimasi AI', pEst1.priceSourceLabel, 'Estimasi AI');
  check('payload EST#1: explanation dipertahankan',
    (pEst1.priceSourceExplanation || '').includes('belum terverifikasi terhadap database AHSP EZRAB'));
  eq('payload EST#1: verificationStatus VERIFIED (eksplisit user)', pEst1.verificationStatus, 'VERIFIED');
  eq('payload EST#1: verificationDate dibawa (P6)', pEst1.verificationDate, VERIFY_AT);
  eq('payload EST#1: userDecisionStatus DISETUJUI dibawa (P6)', pEst1.userDecisionStatus, 'DISETUJUI');

  const pEst2 = byId(ids.est2);
  eq('payload EST#2: PRICE_ESTIMATED', pEst2.priceStatus, 'PRICE_ESTIMATED');
  eq('payload EST#2: NEEDS_VERIFICATION (tanpa verifikasi eksplisit)', pEst2.verificationStatus, 'NEEDS_VERIFICATION');
  eq('payload EST#2: userDecisionStatus DISETUJUI dibawa', pEst2.userDecisionStatus, 'DISETUJUI');

  const pMan = byId(ids.manualTarget);
  eq('payload MANUAL: PRICE_MANUAL', pMan.priceStatus, 'PRICE_MANUAL');
  eq('payload MANUAL: unitPrice 900000', pMan.unitPrice, 900000);
  eq('payload MANUAL: kind resmi lama TIDAK ikut', pMan.priceSourceKind, undefined);
  eq('payload MANUAL: NEEDS_VERIFICATION', pMan.verificationStatus, 'NEEDS_VERIFICATION');
  eq('payload MANUAL: label Harga manual pengguna', pMan.priceSourceLabel, 'Harga manual pengguna');

  const pOff = byId(ids.official);
  eq('payload OFFICIAL: PRICE_RESOLVED dipertahankan (berbukti)', pOff.priceStatus, 'PRICE_RESOLVED');
  eq('payload OFFICIAL: kind OFFICIAL_AHSP', pOff.priceSourceKind, 'OFFICIAL_AHSP');
  eq('payload OFFICIAL: label Harga Resmi AHSP 2026', pOff.priceSourceLabel, 'Harga Resmi AHSP 2026');
  eq('payload OFFICIAL: VERIFIED (klaim berbukti)', pOff.verificationStatus, 'VERIFIED');
  eq('payload OFFICIAL: priceCostBasis HSP dibawa', pOff.priceCostBasis, 'HSP');

  const pMkt = byId(ids.market);
  eq('payload MARKET: PRICE_RESOLVED dipertahankan (berbukti)', pMkt.priceStatus, 'PRICE_RESOLVED');
  eq('payload MARKET: kind MARKET_REFERENCE', pMkt.priceSourceKind, 'MARKET_REFERENCE');
  eq('payload MARKET: VERIFIED (klaim berbukti)', pMkt.verificationStatus, 'VERIFIED');
  eq('payload MARKET: supplier fixture dibawa', pMkt.priceSourceSupplier, 'SUPPLIER-FIXTURE-S2');
  eq('payload MARKET: date fixture dibawa', pMkt.priceSourceDate, '2026-11-13');
  eq('payload MARKET: region fixture dibawa', pMkt.priceSourceRegion, 'REGION-FIXTURE-S2');

  const pNoevid = byId(ids.noevid);
  eq('payload NOEVID: RESOLVED tanpa bukti → ESTIMATED', pNoevid.priceStatus, 'PRICE_ESTIMATED');
  eq('payload NOEVID: NEEDS_VERIFICATION', pNoevid.verificationStatus, 'NEEDS_VERIFICATION');
  check('payload NOEVID: harga tetap dibawa (tetap masuk total)', typeof pNoevid.unitPrice === 'number' && (pNoevid.unitPrice as number) > 0);

  const pSent = byId(ids.sentinel);
  eq('payload SENTINEL: unitPrice 0 tanpa status → UNRESOLVED', pSent.priceStatus, 'PRICE_UNRESOLVED');
  eq('payload SENTINEL: unitPrice TIDAK dibawa', pSent.unitPrice, undefined);
  eq('payload SENTINEL: NEEDS_VERIFICATION', pSent.verificationStatus, 'NEEDS_VERIFICATION');

  const pUnres = byId(ids.unresolved);
  eq('payload UNRESOLVED: tetap UNRESOLVED', pUnres.priceStatus, 'PRICE_UNRESOLVED');
  eq('payload UNRESOLVED: unitPrice TIDAK dibawa', pUnres.unitPrice, undefined);
  eq('payload UNRESOLVED: NEEDS_VERIFICATION', pUnres.verificationStatus, 'NEEDS_VERIFICATION');

  // Pesan konfirmasi view.tsx menghitung estimasi dari record pasca-transfer —
  // sebelum S2 hitungan ini selalu 0 karena lipatan.
  eq('payload: 3 item ESTIMATED (2 fixture + 1 downgrade)',
    payload.filter((p) => p.priceStatus === 'PRICE_ESTIMATED').length, 3);

  // Dedup terhadap spreadsheet kosong: tidak ada yang hilang.
  const { newItems, dupCount } = dedupePushPayload(payload, []);
  eq('dedup vs spreadsheet kosong: 0 duplikat', dupCount, 0);
  eq('dedup vs spreadsheet kosong: 12 item baru', newItems.length, 12);

  // — Factory nyata (panggilan yang sama dengan bulkAddRabItems). —
  const records = payload.map((p, i) => createRabItemRecord(p as never, PID, { index: i }));
  const recByDesc = (effId: string) => {
    const eff = effectiveItems(draft).find((i) => i.id === effId)!;
    return records.find((r) => r.description === `[Chat AI] ${eff.description}`)!;
  };
  const rEst1 = recByDesc(ids.est1);
  eq('factory EST#1: PRICE_ESTIMATED bertahan', rEst1.priceStatus, 'PRICE_ESTIMATED');
  eq('factory EST#1: kind EZRAB_ASSUMPTION bertahan', rEst1.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('factory EST#1: label Estimasi AI bertahan', rEst1.priceSourceLabel, 'Estimasi AI');
  check('factory EST#1: explanation bertahan',
    (rEst1.priceSourceExplanation || '').includes('belum terverifikasi terhadap database AHSP EZRAB'));
  eq('factory EST#1: VERIFIED bertahan (identitas AHSP SAFE)', rEst1.verificationStatus, 'VERIFIED');
  eq('factory EST#1: amount = volume × harga', rEst1.amount, rEst1.volume * rEst1.unitPrice);
  const rEst2 = recByDesc(ids.est2);
  eq('factory EST#2: PRICE_ESTIMATED bertahan', rEst2.priceStatus, 'PRICE_ESTIMATED');
  eq('factory EST#2: NEEDS_VERIFICATION bertahan', rEst2.verificationStatus, 'NEEDS_VERIFICATION');
  const rMan = recByDesc(ids.manualTarget);
  eq('factory MANUAL: PRICE_MANUAL bertahan', rMan.priceStatus, 'PRICE_MANUAL');
  eq('factory MANUAL: NEEDS_VERIFICATION bertahan', rMan.verificationStatus, 'NEEDS_VERIFICATION');
  const rOff = recByDesc(ids.official);
  eq('factory OFFICIAL: PRICE_RESOLVED bertahan', rOff.priceStatus, 'PRICE_RESOLVED');
  eq('factory OFFICIAL: kind OFFICIAL_AHSP bertahan (identitas SAFE)', rOff.priceSourceKind, 'OFFICIAL_AHSP');
  eq('factory OFFICIAL: VERIFIED bertahan', rOff.verificationStatus, 'VERIFIED');
  eq('factory OFFICIAL: priceCostBasis HSP bertahan', rOff.priceCostBasis, 'HSP');
  const rMkt = recByDesc(ids.market);
  eq('factory MARKET: PRICE_RESOLVED bertahan', rMkt.priceStatus, 'PRICE_RESOLVED');
  eq('factory MARKET: supplier bertahan', rMkt.priceSourceSupplier, 'SUPPLIER-FIXTURE-S2');
  eq('factory MARKET: date bertahan', rMkt.priceSourceDate, '2026-11-13');
  eq('factory MARKET: region bertahan', rMkt.priceSourceRegion, 'REGION-FIXTURE-S2');
  const rNoevid = recByDesc(ids.noevid);
  eq('factory NOEVID: ESTIMATED bertahan', rNoevid.priceStatus, 'PRICE_ESTIMATED');
  const rSent = recByDesc(ids.sentinel);
  eq('factory SENTINEL: UNRESOLVED bertahan', rSent.priceStatus, 'PRICE_UNRESOLVED');
  eq('factory SENTINEL: unitPrice sentinel 0', rSent.unitPrice, 0);
  eq('factory SENTINEL: amount 0', rSent.amount, 0);
  eq('factory SENTINEL: NEEDS_VERIFICATION', rSent.verificationStatus, 'NEEDS_VERIFICATION');
  const rUnres = recByDesc(ids.unresolved);
  eq('factory UNRESOLVED: UNRESOLVED bertahan', rUnres.priceStatus, 'PRICE_UNRESOLVED');
  eq('factory UNRESOLVED: unitPrice sentinel 0', rUnres.unitPrice, 0);

  // — Total TIDAK berubah oleh preservasi provenance. —
  const draftTotals = computeTotals(draft);
  const summary = UnifiedProjectEngine.recalculateCostSummary(records as never, {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  } as never);
  // P3B mem-pin kesetaraan ini pada fixture bernilai bulat. Draft nyata
  // memakai harga pecahan (mis. Rp17.648,16) sehingga estimatedTotal
  // adalah jumlah FLOAT mentah, sedangkan factory membulatkan tiap
  // amount item ke rupiah bulat (SafeDecimalEngine — perilaku pra-ada,
  // bukan S2): selisih yang diamati Rp0,332 (348.559.769 vs
  // 348.559.768,668). Yang diasersi: directCost == PEMBULATAN total
  // draft, dan selisihnya di dalam batas pembulatan per item (±Rp1 ×
  // jumlah item berharga). Bukti kuat "S2 tidak mengubah total" adalah
  // perbandingan lipatan di bawah (delta Rp0 persis).
  eq('engine directCost == pembulatan estimatedTotal pratinjau draft',
    summary.directCost, Math.round(draftTotals.estimatedTotal));
  check('selisih float vs engine di dalam batas pembulatan per item',
    Math.abs(summary.directCost - draftTotals.estimatedTotal) < payload.filter((p) => p.priceStatus !== 'PRICE_UNRESOLVED').length,
    `selisih=${Math.abs(summary.directCost - draftTotals.estimatedTotal)}`);
  // Simulasi lipatan lama (semua ESTIMATED → RESOLVED): total harus SAMA.
  const folded = records.map((r) => (r.priceStatus === 'PRICE_ESTIMATED' ? { ...r, priceStatus: 'PRICE_RESOLVED' } : r));
  const foldedSummary = UnifiedProjectEngine.recalculateCostSummary(folded as never, {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  } as never);
  eq('grand total SAMA dengan/tanpa lipatan lama (delta Rp0)', summary.grandTotal, foldedSummary.grandTotal);
  eq('directCost SAMA dengan/tanpa lipatan lama (delta Rp0)', summary.directCost, foldedSummary.directCost);
  eq('engine menghitung 2 item unresolved (sentinel + unpriced)', summary.unresolvedItems, 2);
  return { payload, records };
}

/* ================================================================== */
/* [6] Tahap 6 — persistence normalization (normalizeSections nyata)   */
/* ================================================================== */
function testStage6(draft: UniversalDraft, ids: Record<string, string>, records: any[]): { project: Project; sections: any[] } {
  console.log('\n[6] Tahap 6 — persistence normalization nyata:');
  const project = {
    id: PID,
    name: 'Proyek Uji S2',
    currentVersion: 'Rev 01',
    sections: [],
    rabItems: records,
    costSummary: {},
  } as unknown as Project;
  // Rekonstruksi dari rabItems (sections kosong) — jalur pemetaan field
  // eksplisit, BUKAN pengembalian sections tersimpan.
  const sections = UnifiedProjectEngine.normalizeSections(project, records as never);
  const flat = sections.flatMap((s) => (s.items || []) as any[]);
  eq('normalisasi: 12 item hadir (tidak ada yang hilang)', flat.length, 12);
  const normByDesc = (effId: string) => {
    const eff = effectiveItems(draft).find((i) => i.id === effId)!;
    return flat.find((x) => x.description === `[Chat AI] ${eff.description}`)!;
  };
  const nEst1 = normByDesc(ids.est1);
  eq('normalisasi EST#1: PRICE_ESTIMATED bertahan', nEst1.priceStatus, 'PRICE_ESTIMATED');
  eq('normalisasi EST#1: kind bertahan', nEst1.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('normalisasi EST#1: label bertahan', nEst1.priceSourceLabel, 'Estimasi AI');
  check('normalisasi EST#1: explanation bertahan',
    (nEst1.priceSourceExplanation || '').includes('belum terverifikasi terhadap database AHSP EZRAB'));
  eq('normalisasi EST#1: VERIFIED bertahan', nEst1.verificationStatus, 'VERIFIED');
  const nEst2 = normByDesc(ids.est2);
  eq('normalisasi EST#2: PRICE_ESTIMATED bertahan', nEst2.priceStatus, 'PRICE_ESTIMATED');
  eq('normalisasi EST#2: NEEDS_VERIFICATION bertahan', nEst2.verificationStatus, 'NEEDS_VERIFICATION');
  const nMan = normByDesc(ids.manualTarget);
  eq('normalisasi MANUAL: PRICE_MANUAL bertahan', nMan.priceStatus, 'PRICE_MANUAL');
  eq('normalisasi MANUAL: NEEDS_VERIFICATION bertahan', nMan.verificationStatus, 'NEEDS_VERIFICATION');
  const nOff = normByDesc(ids.official);
  eq('normalisasi OFFICIAL: PRICE_RESOLVED bertahan', nOff.priceStatus, 'PRICE_RESOLVED');
  eq('normalisasi OFFICIAL: kind bertahan', nOff.priceSourceKind, 'OFFICIAL_AHSP');
  eq('normalisasi OFFICIAL: VERIFIED bertahan', nOff.verificationStatus, 'VERIFIED');
  eq('normalisasi OFFICIAL: priceCostBasis HSP bertahan', nOff.priceCostBasis, 'HSP');
  const nMkt = normByDesc(ids.market);
  eq('normalisasi MARKET: PRICE_RESOLVED bertahan', nMkt.priceStatus, 'PRICE_RESOLVED');
  eq('normalisasi MARKET: supplier bertahan (S2)', nMkt.priceSourceSupplier, 'SUPPLIER-FIXTURE-S2');
  eq('normalisasi MARKET: date bertahan (S2)', nMkt.priceSourceDate, '2026-11-13');
  eq('normalisasi MARKET: region bertahan (S2)', nMkt.priceSourceRegion, 'REGION-FIXTURE-S2');
  const nNoevid = normByDesc(ids.noevid);
  eq('normalisasi NOEVID: ESTIMATED bertahan', nNoevid.priceStatus, 'PRICE_ESTIMATED');
  const nSent = normByDesc(ids.sentinel);
  eq('normalisasi SENTINEL: UNRESOLVED bertahan', nSent.priceStatus, 'PRICE_UNRESOLVED');
  eq('normalisasi SENTINEL: unitPrice 0 (sentinel, bukan harga)', nSent.unitPrice, 0);
  const nUnres = normByDesc(ids.unresolved);
  eq('normalisasi UNRESOLVED: UNRESOLVED bertahan', nUnres.priceStatus, 'PRICE_UNRESOLVED');

  // Subtotal seksi (digating status) == directCost engine.
  const subtotalSum = sections.reduce((a, s) => a + (s.subtotal || 0), 0);
  const engine = UnifiedProjectEngine.recalculateCostSummary(records as never, {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  } as never);
  eq('Σ subtotal seksi == directCost engine', subtotalSum, engine.directCost);
  const fromSections = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  eq('grand dari seksi == grand engine (0/0, tanpa pajak)', fromSections.grandTotal, engine.grandTotal);
  eq('seksi menghitung 2 item unresolved', fromSections.unresolvedItems, 2);
  return { project, sections };
}

/* ================================================================== */
/* [7] Tahap 7 — spreadsheet export (fiveSheetPreset nyata)            */
/* ================================================================== */
async function testStage7(project: Project, sections: any[], draft: UniversalDraft, ids: Record<string, string>): Promise<void> {
  console.log('\n[7] Tahap 7 — spreadsheet export nyata (5 sheet):');
  const { summarizeExportSections } = await import('../export/priceIntegrity');
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  const summary = summarizeExportSections(sections as any);
  const snapshot = freezeRabSnapshot(project, sections as never, costs, summary, {
    actor: 'demo/anonim',
    createdAt: '2026-11-13T10:00:00.000Z',
  });
  const snapItems = snapshot.sections.flatMap((s) => (s.items || []) as any[]);
  eq('snapshot: 3 item PRICE_ESTIMATED', snapItems.filter((i) => i.priceStatus === 'PRICE_ESTIMATED').length, 3);
  const descOf = (effId: string) => `[Chat AI] ${effectiveItems(draft).find((i) => i.id === effId)!.description}`;
  const snapEst1 = snapItems.find((i) => i.description === descOf(ids.est1))!;
  eq('snapshot EST#1: kind EZRAB_ASSUMPTION', snapEst1.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('snapshot EST#1: label Estimasi AI', snapEst1.priceSourceLabel, 'Estimasi AI');
  eq('snapshot EST#1: VERIFIED', snapEst1.verificationStatus, 'VERIFIED');

  const wb = new ExcelJS.Workbook();
  buildFiveSheetWorkbook(wb, snapshot, company(), {});
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as any);

  // Sheet 1 — hitungan estimasi.
  const ws1 = wb2.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const estRow = findRowByText(ws1, 'Item Estimasi AI (PRICE_ESTIMATED)', 1);
  check('Sheet 1: baris Item Estimasi AI ada', estRow > 0);
  eq('Sheet 1: 3 item estimasi (bukan 0 seperti sebelum S2)', cellText(ws1.getCell(`B${estRow}`)), '3 item');

  // Sheet 5 — provenance per item.
  const ws5 = wb2.getWorksheet(FIVE_SHEET_NAMES.sources)!;
  const row5 = (effId: string) => {
    const r = findRowByText(ws5, descOf(effId), 3);
    assert.ok(r > 0, `baris Sheet 5 untuk ${effId} ada`);
    return r;
  };
  const rEst1 = row5(ids.est1);
  eq('Sheet 5 EST#1: sumber = ASUMSI — PERLU VERIFIKASI', cellText(ws5.getCell(`D${rEst1}`)), 'ASUMSI — PERLU VERIFIKASI');
  eq('Sheet 5 EST#1: label = Estimasi AI', cellText(ws5.getCell(`F${rEst1}`)), 'Estimasi AI');
  eq('Sheet 5 EST#1: verifikasi = TERVERIFIKASI (VERIFIED)', cellText(ws5.getCell(`G${rEst1}`)), 'TERVERIFIKASI (VERIFIED)');
  const rEst2 = row5(ids.est2);
  eq('Sheet 5 EST#2: verifikasi = PERLU VERIFIKASI (NEEDS_VERIFICATION)',
    cellText(ws5.getCell(`G${rEst2}`)), 'PERLU VERIFIKASI (NEEDS_VERIFICATION)');
  const rOff = row5(ids.official);
  eq('Sheet 5 OFFICIAL: label = Harga Resmi AHSP 2026', cellText(ws5.getCell(`F${rOff}`)), 'Harga Resmi AHSP 2026');
  eq('Sheet 5 OFFICIAL: verifikasi = TERVERIFIKASI (VERIFIED)', cellText(ws5.getCell(`G${rOff}`)), 'TERVERIFIKASI (VERIFIED)');
  const rMan = row5(ids.manualTarget);
  eq('Sheet 5 MANUAL: sumber = INPUT MANUAL', cellText(ws5.getCell(`D${rMan}`)), 'INPUT MANUAL');
  const rUnres = row5(ids.unresolved);
  eq('Sheet 5 UNRESOLVED: sumber = HARGA BELUM TERSEDIA', cellText(ws5.getCell(`D${rUnres}`)), 'HARGA BELUM TERSEDIA');

  // Sheet 2 — kolom Status Verifikasi (kolom 11).
  const ws2 = wb2.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  const row2 = (effId: string) => {
    const r = findRowByText(ws2, descOf(effId), 3);
    assert.ok(r > 0, `baris Sheet 2 untuk ${effId} ada`);
    return r;
  };
  eq('Sheet 2 EST#1: verifikasi = TERVERIFIKASI (VERIFIED)',
    cellText(ws2.getCell(`K${row2(ids.est1)}`)), 'TERVERIFIKASI (VERIFIED)');
  eq('Sheet 2 EST#2: verifikasi = PERLU VERIFIKASI (NEEDS_VERIFICATION)',
    cellText(ws2.getCell(`K${row2(ids.est2)}`)), 'PERLU VERIFIKASI (NEEDS_VERIFICATION)');
  eq('Sheet 2 OFFICIAL: verifikasi = TERVERIFIKASI (VERIFIED)',
    cellText(ws2.getCell(`K${row2(ids.official)}`)), 'TERVERIFIKASI (VERIFIED)');
  eq('Sheet 2 EST#1: sumber = ASUMSI — PERLU VERIFIKASI',
    cellText(ws2.getCell(`J${row2(ids.est1)}`)), 'ASUMSI — PERLU VERIFIKASI');
  eq('Sheet 2 SENTINEL: harga = HARGA BELUM TERSEDIA',
    cellText(ws2.getCell(`G${row2(ids.sentinel)}`)), 'HARGA BELUM TERSEDIA');
}

/* ================================================================== */
/* Golden totals — Premium Demo (pin langsung; sisanya via rerun)      */
/* ================================================================== */
function testGoldenTotals(): void {
  console.log('\n[8] Golden totals — Premium Demo:');
  const r = computeRekapSummary(PREMIUM_DEMO_RAB_ITEMS as never, PREMIUM_DEMO_PROJECT as never);
  eq('Premium Demo directCost 892.612.393', r.directCost, 892612393);
  eq('Premium Demo overhead 44.630.620', r.overheadNominal, 44630620);
  eq('Premium Demo profit 44.630.620', r.profitNominal, 44630620);
  eq('Premium Demo PPN 108.006.100', r.ppnNominal, 108006100);
  eq('Premium Demo grand Rp1.089.879.733 (TIDAK BERUBAH)', r.grandTotal, 1089879733);
  eq('Premium Demo grand == costSummary tersimpan', r.grandTotal, PREMIUM_DEMO_PROJECT.costSummary!.grandTotal);
}

async function main(): Promise<void> {
  console.log('S2 — Provenance harga bertahan saat transfer (P6-O2, 7 tahap)');
  testContractHelpers();
  const { draft: d1, ids } = testStage1();
  const d2 = testStage2(d1, ids);
  const d3 = testStage3(d2, ids);
  testStage4(d3);
  const { records } = testStage5(d3, ids);
  const { project, sections } = testStage6(d3, ids, records);
  await testStage7(project, sections, d3, ids);
  testGoldenTotals();
  console.log(`\nS2: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Gagal:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('S2 run error:', err);
  process.exit(1);
});
