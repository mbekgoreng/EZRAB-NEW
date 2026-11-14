/**
 * S4 — FINAL INTEGRITY REPAIR §4: keputusan review mengalir ke Sheet 5 (P6-O1).
 *
 * Cacat (LAPORAN-P6 §E/P6-O1; dikonfirmasi §2 S2-O1): field
 * `verificationDate` + `userDecisionStatus` ADA di RabItem/RABItem, diisi
 * alur review (draftReview.ts), dan dibawa `buildPushPayload` — tetapi
 * DIBUANG `createRabItemRecord` (allowlist) + `normalizeSections`
 * (pemetaan field eksplisit), sehingga Sheet 5 kolom TANGGAL VERIFIKASI +
 * STATUS KEPUTUSAN USER selalu 'tidak tercatat'.
 *
 * Suite ini membuktikan rantai PENUH lewat JALUR KODE NYATA (tanpa mock
 * atas hal yang diuji; tanpa panggilan provider):
 *   (1) draft generation — buildUniversalDraft nyata (jembatan beton 12 m)
 *       + fixture estimasi klasifikasi P1 (seperti S2);
 *   (2) review — decideDraftItemAssumption + verifyDraftItemPrice +
 *       editDraftItem + setDraftItemManualPrice nyata;
 *   (3) save/load — saveDraft → loadDraft nyata (localStorage shim pola P6);
 *   (4) approval — buildPushPreview + validateTransfer + binding G1 nyata;
 *   (5) project transfer — buildPushPayload + createRabItemRecord nyata;
 *   (6) persistence normalization — normalizeSections nyata;
 *   (7) spreadsheet export — freezeRabSnapshot + buildFiveSheetWorkbook
 *       nyata (ExcelJS write + reload; nilai kolom K/L Sheet 5).
 *   (F2) lanjutan §5 — calculationFormula: mapDedAiItemToRabInput →
 *       factory → normalize → snapshot → Sheet 4 kolom E (volumeFormulaOf).
 *
 * Semantik yang diuji (kontrak P6 §E, TIDAK diubah):
 * - Verifikasi dan putusan adalah dua sumbu independen: putusan tidak
 *   mengisi verificationDate; verifikasi tidak mengisi userDecisionStatus.
 * - verificationDate HANYA dari aksi verifikasi eksplisit (verifyDraftItemPrice):
 *   edit biasa dan harga manual TIDAK mengisinya.
 * - Tanpa keputusan = 'tidak tercatat' di Sheet 5 (tidak dikarang).
 * - Harga manual tetap PRICE_MANUAL melewati rantai.
 *
 * freezeRabSnapshot TIDAK perlu diedit: ia deep-clone seksi (JSON) tanpa
 * allowlist — dibuktikan tahap [7] (field bertahan di snapshot apa adanya).
 *
 * Jalankan: npx --yes tsx src/test/s4ReviewDecisionExport.test.ts
 * (Skrip tsx mandiri dengan assert — pola S2/P5; repo ini tidak punya
 * paket vitest.)
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
  validateTransfer,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  editDraftItem,
  setDraftItemManualPrice,
  verifyDraftItemPrice,
  decideDraftItemAssumption,
  itemHasDecidableAssumption,
} from '../ai-tools/ezrab-ai/draftReview';
import {
  saveDraft,
  loadDraft,
  createTransferApprovalBinding,
  checkTransferApprovalBinding,
} from '../ai-tools/ezrab-ai/draftPersistence';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import {
  FIVE_SHEET_NAMES,
  NOT_RECORDED,
  buildFiveSheetWorkbook,
  freezeRabSnapshot,
  volumeFormulaOf,
  type ExportItemLike,
} from '../export/fiveSheetPreset';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import type { Project, Company } from '../types';

/* ---------------- localStorage shim (pola G1 / P4 / P6) ---------------- */
const store: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

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

const PID = 'proj-s4';
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
    id: 'comp-s4', name: 'PT Uji S4', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 0, defaultProfitPercent: 0,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

/** Cari baris berisi teks di kolom tertentu (pola P5/S2). */
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
/* [1] Tahap 1 — draft generation (nyata) + fixture estimasi           */
/* ================================================================== */
function testStage1(): { draft: UniversalDraft; ids: Record<string, string> } {
  console.log('\n[1] Tahap 1 — draft generation nyata + fixture estimasi:');
  const draft = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const items = effectiveItems(draft);
  eq('draft jembatan: 11 item', items.length, 11);
  check('readiness bukan BLOCKED (dapat ditransfer)', draftReadiness(draft).status !== 'BLOCKED',
    `readiness=${draftReadiness(draft).status}`);
  check('generasi tidak pernah mengisi verificationDate (fakta P6)',
    items.every((i) => (i as any).verificationDate == null));
  check('generasi tidak pernah mengisi userDecisionStatus (fakta P6)',
    items.every((i) => (i as any).userDecisionStatus == null));

  // Fixture estimasi (mutasi item nyata → klasifikasi P1 persis, pola S2):
  // EST#1 = kode 4 (akan DISETUJUI + diverifikasi),
  // EST#2 = kode 6 (akan DITOLAK, tanpa verifikasi),
  // EST#3 = kode 8 (pending: tanpa putusan, tanpa verifikasi).
  const ids: Record<string, string> = {};
  for (const [code, key] of [['1', 'official'], ['2', 'manualTarget'], ['4', 'est1'], ['6', 'est2'], ['8', 'est3'], ['11', 'unresolved']] as const) {
    ids[key] = byCode(items, code).id;
  }
  const estText = 'Harga saran model AI — perkiraan, belum terverifikasi terhadap database AHSP EZRAB.';
  for (const key of ['est1', 'est2', 'est3'] as const) {
    const raw = genItem(draft, ids[key]);
    raw.priceStatus = 'PRICE_ESTIMATED';
    raw.priceSourceKind = 'EZRAB_ASSUMPTION';
    raw.priceSourceLabel = 'Estimasi AI';
    raw.priceSourceExplanation = estText;
    delete raw.verificationStatus;
    delete raw.verificationDate;
  }
  const eff = effectiveItems(draft);
  eq('EST#1 = PRICE_ESTIMATED di draft', eff.find((i) => i.id === ids.est1)!.priceStatus, 'PRICE_ESTIMATED');
  eq('EST#2 = PRICE_ESTIMATED di draft', eff.find((i) => i.id === ids.est2)!.priceStatus, 'PRICE_ESTIMATED');
  eq('EST#3 = PRICE_ESTIMATED di draft', eff.find((i) => i.id === ids.est3)!.priceStatus, 'PRICE_ESTIMATED');
  check('EST#1 membawa asumsi yang dapat diputuskan', itemHasDecidableAssumption(eff.find((i) => i.id === ids.est1)!));
  check('EST#2 membawa asumsi yang dapat diputuskan', itemHasDecidableAssumption(eff.find((i) => i.id === ids.est2)!));
  check('EST#3 membawa asumsi yang dapat diputuskan', itemHasDecidableAssumption(eff.find((i) => i.id === ids.est3)!));
  return { draft, ids };
}

/* ================================================================== */
/* [2] Tahap 2 — review nyata: putusan + verifikasi + edit + manual    */
/* ================================================================== */
function testStage2(draft: UniversalDraft, ids: Record<string, string>): UniversalDraft {
  console.log('\n[2] Tahap 2 — review nyata (putusan + verifikasi + edit + manual):');
  // Negatif: putusan atas item resmi ditolak; verifikasi item tanpa harga ditolak.
  const noAssumption = decideDraftItemAssumption(draft, ids.official, 'DISETUJUI');
  check('putusan atas item resmi DITOLAK (tidak ada asumsi)', !noAssumption.ok, noAssumption.message);
  const noPrice = verifyDraftItemPrice(draft, ids.unresolved, { at: VERIFY_AT });
  check('verifikasi item tanpa harga DITOLAK', !noPrice.ok, noPrice.message);

  // EST#1: DISETUJUI + verifikasi eksplisit.
  const dec1 = decideDraftItemAssumption(draft, ids.est1, 'DISETUJUI');
  assert.ok(dec1.ok && dec1.draft, `putusan EST#1 gagal: ${dec1.message}`);
  let d = dec1.draft;
  const e1dec = effectiveItems(d).find((i) => i.id === ids.est1)!;
  eq('EST#1: putusan DISETUJUI tercatat', (e1dec as any).userDecisionStatus, 'DISETUJUI');
  eq('EST#1: putusan TIDAK mengisi verificationDate (sumbu independen)',
    (e1dec as any).verificationDate, undefined);
  const ver1 = verifyDraftItemPrice(d, ids.est1, { at: VERIFY_AT });
  assert.ok(ver1.ok && ver1.draft, `verifikasi EST#1 gagal: ${ver1.message}`);
  d = ver1.draft;
  const e1 = effectiveItems(d).find((i) => i.id === ids.est1)!;
  eq('EST#1: verificationDate tercatat (aksi eksplisit)', (e1 as any).verificationDate, VERIFY_AT);
  eq('EST#1: verifikasi TIDAK mengubah putusan DISETUJUI', (e1 as any).userDecisionStatus, 'DISETUJUI');
  eq('EST#1: verificationStatus VERIFIED', (e1 as any).verificationStatus, 'VERIFIED');
  eq('EST#1: priceStatus TETAP ESTIMATED', e1.priceStatus, 'PRICE_ESTIMATED');

  // EST#2: DITOLAK, tanpa verifikasi.
  const dec2 = decideDraftItemAssumption(d, ids.est2, 'DITOLAK');
  assert.ok(dec2.ok && dec2.draft, `putusan EST#2 gagal: ${dec2.message}`);
  d = dec2.draft;
  const e2 = effectiveItems(d).find((i) => i.id === ids.est2)!;
  eq('EST#2: putusan DITOLAK tercatat', (e2 as any).userDecisionStatus, 'DITOLAK');
  eq('EST#2: tanpa verifikasi → verificationDate absen', (e2 as any).verificationDate, undefined);
  eq('EST#2: item DITOLAK tetap ada di draft (tidak dihapus)',
    effectiveItems(d).some((i) => i.id === ids.est2), true);

  // EST#3: pending — hanya edit volume (edit TIDAK boleh mengisi tanggal/putusan).
  const est3Before = effectiveItems(d).find((i) => i.id === ids.est3)!;
  const edited = editDraftItem(d, ids.est3, { volume: est3Before.volume + 1 });
  assert.ok(edited.ok && edited.draft, `edit EST#3 gagal: ${edited.message}`);
  d = edited.draft;
  const e3 = effectiveItems(d).find((i) => i.id === ids.est3)!;
  eq('EST#3: edit volume diterapkan', e3.volume, est3Before.volume + 1);
  eq('EST#3: edit TIDAK mengisi verificationDate', (e3 as any).verificationDate, undefined);
  eq('EST#3: edit TIDAK mengisi userDecisionStatus', (e3 as any).userDecisionStatus, undefined);
  eq('EST#3: edit TIDAK mengubah priceStatus ESTIMATED', e3.priceStatus, 'PRICE_ESTIMATED');

  // MANUAL: harga manual pada item resmi (kode 2) — TANPA verifikasi.
  const manual = setDraftItemManualPrice(d, ids.manualTarget, 900000, 'Harga manual review S4');
  assert.ok(manual.ok && manual.draft, `harga manual gagal: ${manual.message}`);
  d = manual.draft;
  const man = effectiveItems(d).find((i) => i.id === ids.manualTarget)!;
  eq('MANUAL: PRICE_MANUAL', man.priceStatus, 'PRICE_MANUAL');
  eq('MANUAL: unitPrice 900000', man.unitPrice, 900000);
  eq('MANUAL: harga manual TIDAK mengisi verificationDate', (man as any).verificationDate, undefined);
  eq('MANUAL: harga manual TIDAK mengisi userDecisionStatus', (man as any).userDecisionStatus, undefined);
  eq('MANUAL: NEEDS_VERIFICATION (P6)', (man as any).verificationStatus, 'NEEDS_VERIFICATION');
  return d;
}

/* ================================================================== */
/* [3] Tahap 3 — save/load round-trip (draftPersistence nyata)         */
/* ================================================================== */
function testStage3(draft: UniversalDraft, ids: Record<string, string>): UniversalDraft {
  console.log('\n[3] Tahap 3 — keputusan bertahan save/load:');
  expectSaveOk(saveDraft({ draft, projectId: PID }));
  const loaded = loadDraft(PID);
  assert.ok(loaded.ok, `loadDraft gagal: ${(loaded as any).message}`);
  if (!loaded.ok) throw new Error('unreachable');
  const back = loaded.draft;
  const b1 = effectiveItems(back).find((i) => i.id === ids.est1)!;
  eq('load EST#1: DISETUJUI bertahan', (b1 as any).userDecisionStatus, 'DISETUJUI');
  eq('load EST#1: verificationDate bertahan', (b1 as any).verificationDate, VERIFY_AT);
  const b2 = effectiveItems(back).find((i) => i.id === ids.est2)!;
  eq('load EST#2: DITOLAK bertahan', (b2 as any).userDecisionStatus, 'DITOLAK');
  eq('load EST#2: verificationDate tetap absen', (b2 as any).verificationDate, undefined);
  const b3 = effectiveItems(back).find((i) => i.id === ids.est3)!;
  eq('load EST#3: pending — putusan tetap absen', (b3 as any).userDecisionStatus, undefined);
  eq('load EST#3: pending — verificationDate tetap absen', (b3 as any).verificationDate, undefined);
  const bm = effectiveItems(back).find((i) => i.id === ids.manualTarget)!;
  eq('load MANUAL: PRICE_MANUAL bertahan', bm.priceStatus, 'PRICE_MANUAL');
  eq('load MANUAL: verificationDate tetap absen', (bm as any).verificationDate, undefined);
  return back;
}
function expectSaveOk(res: { ok: boolean; message?: string }): void {
  check('saveDraft ok', res.ok, res.message);
}

/* ================================================================== */
/* [4] Tahap 4 — approval (preview + validasi + binding G1 nyata)      */
/* ================================================================== */
function testStage4(draft: UniversalDraft): void {
  console.log('\n[4] Tahap 4 — approval nyata:');
  const pv = buildPushPreview(draft);
  eq('preview: 11 item', pv.itemCount, 11);
  check('preview: tidak diblokir transfer', !pv.transferBlocked, pv.blockReasons.join('; '));
  const v = validateTransfer(draft, PID);
  check('validateTransfer: diizinkan', v.allowed, v.reasons.join('; '));
  const binding = createTransferApprovalBinding(draft, PID, T0);
  check('binding approval: cek ok', checkTransferApprovalBinding(binding, draft, PID, T0).ok === true);
}

/* ================================================================== */
/* [5] Tahap 5 — project transfer (payload + factory nyata)            */
/* ================================================================== */
function testStage5(draft: UniversalDraft, ids: Record<string, string>): { records: any[] } {
  console.log('\n[5] Tahap 5 — project transfer nyata (payload + factory):');
  const payload = buildPushPayload(draft);
  eq('payload: 11 item', payload.length, 11);
  const byId = (effId: string) => {
    const eff = effectiveItems(draft).find((i) => i.id === effId)!;
    const p = payload.find((x) => x.description === `[Chat AI] ${eff.description}`)!;
    assert.ok(p, `payload untuk ${eff.description} ada`);
    return p;
  };

  // — Payload (P6, sudah benar — dipin ulang agar regresi ketahuan). —
  const pEst1 = byId(ids.est1);
  eq('payload EST#1: verificationDate dibawa', pEst1.verificationDate, VERIFY_AT);
  eq('payload EST#1: userDecisionStatus DISETUJUI dibawa', pEst1.userDecisionStatus, 'DISETUJUI');
  const pEst2 = byId(ids.est2);
  eq('payload EST#2: userDecisionStatus DITOLAK dibawa', pEst2.userDecisionStatus, 'DITOLAK');
  eq('payload EST#2: verificationDate TIDAK dibawa (tidak ada)', pEst2.verificationDate, undefined);
  const pEst3 = byId(ids.est3);
  eq('payload EST#3: userDecisionStatus TIDAK dibawa (pending)', pEst3.userDecisionStatus, undefined);
  eq('payload EST#3: verificationDate TIDAK dibawa (pending)', pEst3.verificationDate, undefined);
  const pMan = byId(ids.manualTarget);
  eq('payload MANUAL: PRICE_MANUAL', pMan.priceStatus, 'PRICE_MANUAL');
  eq('payload MANUAL: verificationDate TIDAK dibawa', pMan.verificationDate, undefined);

  // — Factory nyata (panggilan yang sama dengan bulkAddRabItems). —
  // INI INTI S4: sebelum perbaikan, kedua field hilang di sini.
  const records = payload.map((p, i) => createRabItemRecord(p as never, PID, { index: i }));
  const recByDesc = (effId: string) => {
    const eff = effectiveItems(draft).find((i) => i.id === effId)!;
    return records.find((r) => r.description === `[Chat AI] ${eff.description}`)!;
  };
  const rEst1 = recByDesc(ids.est1);
  eq('factory EST#1: verificationDate BERTAHAN (P6-O1)', (rEst1 as any).verificationDate, VERIFY_AT);
  eq('factory EST#1: DISETUJUI BERTAHAN (P6-O1)', (rEst1 as any).userDecisionStatus, 'DISETUJUI');
  eq('factory EST#1: VERIFIED bertahan', rEst1.verificationStatus, 'VERIFIED');
  eq('factory EST#1: PRICE_ESTIMATED bertahan', rEst1.priceStatus, 'PRICE_ESTIMATED');
  const rEst2 = recByDesc(ids.est2);
  eq('factory EST#2: DITOLAK BERTAHAN (P6-O1)', (rEst2 as any).userDecisionStatus, 'DITOLAK');
  eq('factory EST#2: verificationDate tetap absen (tidak dikarang)', (rEst2 as any).verificationDate, undefined);
  const rEst3 = recByDesc(ids.est3);
  eq('factory EST#3: userDecisionStatus tetap absen (pending)', (rEst3 as any).userDecisionStatus, undefined);
  eq('factory EST#3: verificationDate tetap absen (pending)', (rEst3 as any).verificationDate, undefined);
  const rMan = recByDesc(ids.manualTarget);
  eq('factory MANUAL: PRICE_MANUAL bertahan', rMan.priceStatus, 'PRICE_MANUAL');
  eq('factory MANUAL: verificationDate tetap absen', (rMan as any).verificationDate, undefined);
  eq('factory MANUAL: userDecisionStatus tetap absen', (rMan as any).userDecisionStatus, undefined);
  const rOff = recByDesc(ids.official);
  eq('factory OFFICIAL: verificationDate absen (tidak ada aksi)', (rOff as any).verificationDate, undefined);
  eq('factory OFFICIAL: userDecisionStatus absen', (rOff as any).userDecisionStatus, undefined);

  // Total tidak berubah oleh threading keputusan (field non-finansial).
  const draftTotals = computeTotals(draft);
  const summary = UnifiedProjectEngine.recalculateCostSummary(records as never, {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  } as never);
  eq('engine directCost == pembulatan estimatedTotal pratinjau draft',
    summary.directCost, Math.round(draftTotals.estimatedTotal));
  return { records };
}

/* ================================================================== */
/* [6] Tahap 6 — persistence normalization (normalizeSections nyata)   */
/* ================================================================== */
function testStage6(draft: UniversalDraft, ids: Record<string, string>, records: any[]): { project: Project; sections: any[] } {
  console.log('\n[6] Tahap 6 — persistence normalization nyata:');
  const project = {
    id: PID,
    name: 'Proyek Uji S4',
    currentVersion: 'Rev 01',
    sections: [],
    rabItems: records,
    costSummary: {},
  } as unknown as Project;
  // Rekonstruksi dari rabItems (sections kosong) — jalur pemetaan field
  // eksplisit, BUKAN pengembalian sections tersimpan.
  const sections = UnifiedProjectEngine.normalizeSections(project, records as never);
  const flat = sections.flatMap((s) => (s.items || []) as any[]);
  eq('normalisasi: 11 item hadir (tidak ada yang hilang)', flat.length, 11);
  const normByDesc = (effId: string) => {
    const eff = effectiveItems(draft).find((i) => i.id === effId)!;
    return flat.find((x) => x.description === `[Chat AI] ${eff.description}`)!;
  };
  const nEst1 = normByDesc(ids.est1);
  eq('normalisasi EST#1: verificationDate BERTAHAN (P6-O1)', nEst1.verificationDate, VERIFY_AT);
  eq('normalisasi EST#1: DISETUJUI BERTAHAN (P6-O1)', nEst1.userDecisionStatus, 'DISETUJUI');
  eq('normalisasi EST#1: VERIFIED bertahan', nEst1.verificationStatus, 'VERIFIED');
  const nEst2 = normByDesc(ids.est2);
  eq('normalisasi EST#2: DITOLAK BERTAHAN (P6-O1)', nEst2.userDecisionStatus, 'DITOLAK');
  eq('normalisasi EST#2: verificationDate tetap absen', nEst2.verificationDate, undefined);
  const nEst3 = normByDesc(ids.est3);
  eq('normalisasi EST#3: userDecisionStatus tetap absen (pending)', nEst3.userDecisionStatus, undefined);
  eq('normalisasi EST#3: verificationDate tetap absen (pending)', nEst3.verificationDate, undefined);
  const nMan = normByDesc(ids.manualTarget);
  eq('normalisasi MANUAL: PRICE_MANUAL bertahan', nMan.priceStatus, 'PRICE_MANUAL');
  eq('normalisasi MANUAL: verificationDate tetap absen', nMan.verificationDate, undefined);
  const nOff = normByDesc(ids.official);
  eq('normalisasi OFFICIAL: verificationDate absen', nOff.verificationDate, undefined);
  eq('normalisasi OFFICIAL: userDecisionStatus absen', nOff.userDecisionStatus, undefined);

  // Subtotal seksi (digating status) == directCost engine.
  const subtotalSum = sections.reduce((a, s) => a + (s.subtotal || 0), 0);
  const engine = UnifiedProjectEngine.recalculateCostSummary(records as never, {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  } as never);
  eq('Σ subtotal seksi == directCost engine', subtotalSum, engine.directCost);
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
  const descOf = (effId: string) => `[Chat AI] ${effectiveItems(draft).find((i) => i.id === effId)!.description}`;
  const snapEst1 = snapItems.find((i) => i.description === descOf(ids.est1))!;
  eq('snapshot EST#1: verificationDate BERTAHAN (deep clone, tanpa allowlist)',
    snapEst1.verificationDate, VERIFY_AT);
  eq('snapshot EST#1: DISETUJUI BERTAHAN', snapEst1.userDecisionStatus, 'DISETUJUI');
  const snapEst2 = snapItems.find((i) => i.description === descOf(ids.est2))!;
  eq('snapshot EST#2: DITOLAK BERTAHAN', snapEst2.userDecisionStatus, 'DITOLAK');
  eq('snapshot EST#2: verificationDate tetap absen', snapEst2.verificationDate, undefined);
  const snapEst3 = snapItems.find((i) => i.description === descOf(ids.est3))!;
  eq('snapshot EST#3: userDecisionStatus tetap absen (pending)', snapEst3.userDecisionStatus, undefined);

  const wb = new ExcelJS.Workbook();
  buildFiveSheetWorkbook(wb, snapshot, company(), {});
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as any);

  // Sheet 5 — kolom K (11) TANGGAL VERIFIKASI, L (12) STATUS KEPUTUSAN USER.
  const ws5 = wb2.getWorksheet(FIVE_SHEET_NAMES.sources)!;
  const row5 = (effId: string) => {
    const r = findRowByText(ws5, descOf(effId), 3);
    assert.ok(r > 0, `baris Sheet 5 untuk ${effId} ada`);
    return r;
  };
  const rEst1 = row5(ids.est1);
  eq('Sheet 5 EST#1: K = tanggal verifikasi nyata', cellText(ws5.getCell(`K${rEst1}`)), VERIFY_AT);
  eq('Sheet 5 EST#1: L = DISETUJUI', cellText(ws5.getCell(`L${rEst1}`)), 'DISETUJUI');
  check('Sheet 5 EST#1: INFO HILANG tidak lagi menyebut keputusan/tanggal',
    !cellText(ws5.getCell(`J${rEst1}`)).includes('keputusan user tidak tercatat') &&
    !cellText(ws5.getCell(`J${rEst1}`)).includes('tanggal verifikasi tidak tercatat'),
    cellText(ws5.getCell(`J${rEst1}`)));
  const rEst2 = row5(ids.est2);
  eq('Sheet 5 EST#2: K = tidak tercatat (tanpa verifikasi)', cellText(ws5.getCell(`K${rEst2}`)), NOT_RECORDED);
  eq('Sheet 5 EST#2: L = DITOLAK (terbedakan dari DISETUJUI)', cellText(ws5.getCell(`L${rEst2}`)), 'DITOLAK');
  check('Sheet 5 EST#2: INFO HILANG menyebut tanggal tapi BUKAN keputusan',
    cellText(ws5.getCell(`J${rEst2}`)).includes('tanggal verifikasi tidak tercatat') &&
    !cellText(ws5.getCell(`J${rEst2}`)).includes('keputusan user tidak tercatat'),
    cellText(ws5.getCell(`J${rEst2}`)));
  const rEst3 = row5(ids.est3);
  eq('Sheet 5 EST#3: K = tidak tercatat (pending)', cellText(ws5.getCell(`K${rEst3}`)), NOT_RECORDED);
  eq('Sheet 5 EST#3: L = tidak tercatat (pending)', cellText(ws5.getCell(`L${rEst3}`)), NOT_RECORDED);
  const rMan = row5(ids.manualTarget);
  eq('Sheet 5 MANUAL: K = tidak tercatat (harga manual bukan verifikasi)', cellText(ws5.getCell(`K${rMan}`)), NOT_RECORDED);
  eq('Sheet 5 MANUAL: L = tidak tercatat', cellText(ws5.getCell(`L${rMan}`)), NOT_RECORDED);
  eq('Sheet 5 MANUAL: kolom I = MANUAL', cellText(ws5.getCell(`I${rMan}`)), 'MANUAL');
  const rOff = row5(ids.official);
  eq('Sheet 5 OFFICIAL: K = tidak tercatat (tanpa aksi)', cellText(ws5.getCell(`K${rOff}`)), NOT_RECORDED);
  eq('Sheet 5 OFFICIAL: L = tidak tercatat (tanpa asumsi)', cellText(ws5.getCell(`L${rOff}`)), NOT_RECORDED);
}

/* ================================================================== */
/* [F2] Lanjutan §5 — calculationFormula sampai Sheet 4                */
/* ================================================================== */
async function testF2(): Promise<void> {
  console.log('\n[F2] Lanjutan §5 — calculationFormula (factory → normalize → Sheet 4):');
  const stdBase = {
    id: 'dedai-s4', name: 'Plesteran', category: 'Dinding', units: 'm2',
    quantitySource: 'DED_GEOMETRIC', subtotal: null, sourcePages: [1],
    provenance: [], stage: 'CALCULATED',
  } as const;
  const mapped = mapDedAiItemToRabInput(
    { ...stdBase, quantity: 10, unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4', quantityFormula: '10 × 0.15 × 0.3' } as unknown as DedAiItem,
    'DATABASE',
  );
  eq('F2 mapper: calculationFormula terisi dari rumus nyata', mapped?.calculationFormula, '10 × 0.15 × 0.3');
  const rec = createRabItemRecord(mapped as never, 'proj-s4-f2', {});
  eq('F2 factory: calculationFormula BERTAHAN (allowlist S4)',
    (rec as unknown as { calculationFormula?: string }).calculationFormula, '10 × 0.15 × 0.3');
  const project = {
    id: 'proj-s4-f2', name: 'Proyek Uji S4-F2', currentVersion: 'Rev 01',
    sections: [], rabItems: [rec], costSummary: {},
  } as unknown as Project;
  const sections = UnifiedProjectEngine.normalizeSections(project, [rec] as never);
  const norm = (sections[0].items as any[])[0];
  eq('F2 normalize: calculationFormula BERTAHAN', norm.calculationFormula, '10 × 0.15 × 0.3');
  const { summarizeExportSections } = await import('../export/priceIntegrity');
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
  const snapshot = freezeRabSnapshot(project, sections as never, costs, summarizeExportSections(sections as any), {
    actor: 'demo/anonim', createdAt: '2026-11-13T10:00:00.000Z',
  });
  const snapItem = (snapshot.sections[0].items as any[])[0];
  eq('F2 snapshot: calculationFormula BERTAHAN', snapItem.calculationFormula, '10 × 0.15 × 0.3');
  eq('F2 volumeFormulaOf: rumus tampil (bukan Tidak tersedia)',
    volumeFormulaOf(snapItem as ExportItemLike), '10 × 0.15 × 0.3');
  const wb = new ExcelJS.Workbook();
  buildFiveSheetWorkbook(wb, snapshot, company(), {});
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as any);
  const ws4 = wb2.getWorksheet(FIVE_SHEET_NAMES.volume)!;
  const r = findRowByText(ws4, 'Plesteran', 3);
  check('F2 Sheet 4: baris Plesteran ada', r > 0);
  eq('F2 Sheet 4: kolom E FORMULA = rumus nyata', cellText(ws4.getCell(`E${r}`)), '10 × 0.15 × 0.3');
  // Negatif: tanpa rumus → tetap 'Tidak tersedia' (tidak dikarang).
  const mappedEmpty = mapDedAiItemToRabInput(
    { ...stdBase, quantity: 10, unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4' } as unknown as DedAiItem,
    'DATABASE',
  );
  const recEmpty = createRabItemRecord(mappedEmpty as never, 'proj-s4-f2', {});
  eq('F2 tanpa rumus: factory tidak mengarang calculationFormula',
    (recEmpty as unknown as { calculationFormula?: string }).calculationFormula, undefined);
  eq('F2 tanpa rumus: volumeFormulaOf = Tidak tersedia',
    volumeFormulaOf(recEmpty as unknown as ExportItemLike), 'Tidak tersedia');
}

async function main(): Promise<void> {
  console.log('S4 — Keputusan review mengalir ke Sheet 5 (P6-O1) + F2 calculationFormula');
  const { draft: d1, ids } = testStage1();
  const d2 = testStage2(d1, ids);
  const d3 = testStage3(d2, ids);
  testStage4(d3);
  const { records } = testStage5(d3, ids);
  const { project, sections } = testStage6(d3, ids, records);
  await testStage7(project, sections, d3, ids);
  await testF2();
  console.log(`\nS4: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Gagal:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('S4 run error:', err);
  process.exit(1);
});
