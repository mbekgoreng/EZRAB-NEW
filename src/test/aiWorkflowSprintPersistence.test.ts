/**
 * EZRAB AI & WORKFLOW COMPLETION SPRINT — WORKER E (2026-11-26).
 * Workflow & Persistence + Export Integrity (direktif §3F, LOCAL ONLY).
 *
 * Jejak alur lengkap di level modul (TANPA browser live — verifikasi
 * UI browser TIDAK diuji di sini, lihat §7):
 *   permintaan bahasa alami → klarifikasi → retensi konteks → draft
 *   proyek → work item → QTO → pencocokan AHSP → validasi harga →
 *   hitung biaya → review → edit → simpan → buka ulang → ekspor.
 *
 * Yang diuji terhadap kode ASLI (tanpa stub mesin):
 *  1. Jejak alur (buildUniversalDraft / reviseUniversalDraft /
 *     evaluateRabIntent / draftReadiness / totalsFromItems).
 *  2. Persistensi draft tahan-refresh (saveDraft / loadDraft round-trip,
 *     dedupe, konflik tulisan basi, isolasi lintas-proyek, home state).
 *  3. Gerbang transfer (validateTransfer / buildPushPayload /
 *     applyTransferReceipt / approval binding) — termasuk draft BLOCKED
 *     yang menolak transfer secara jujur, dan item tanpa harga yang
 *     TIDAK PERNAH membawa unitPrice (bukan Rp0 fabrikasi).
 *  4. Backup/restore (createBackup / validateBackup / restoreBackup) —
 *     round-trip memulihkan draft; file rusak ditolak tanpa menulis.
 *  5. Integritas ekspor: total kanonis engine vs Excel nyata vs PDF
 *     nyata (angka Rp eksak); item tanpa harga → exportItemAmount null;
 *     pin emas Premium Demo PRJ-DEMO-PREMIUM-01 Rp1.089.879.733.
 *  6. Permintaan tak didukung (stasiun luar angkasa) — dikenali jujur
 *     sebagai needs-spec, tanpa RAB karangan.
 *  7. Indikator status simpan — cek kontrak sumber STATIS saja
 *     (SaveStatusIndicator + ProjectContext + TopBar); tampilan live
 *     di browser TIDAK diuji (butuh browser).
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowSprintPersistence.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import ExcelJS from 'exceljs';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import {
  buildUniversalDraft,
  reviseUniversalDraft,
  effectiveItems,
  totalsFromItems,
  draftReadiness,
  validateTransfer,
  buildPushPayload,
  applyTransferReceipt,
  isPriceValidForTotal,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  saveDraft,
  loadDraft,
  peekPersistedDraft,
  saveHomeState,
  loadHomeState,
  createTransferApprovalBinding,
  checkTransferApprovalBinding,
  TRANSFER_APPROVAL_TTL_MS,
} from '../ai-tools/ezrab-ai/draftPersistence';
import { evaluateRabIntent, runRabIntentFlow } from '../ai-tools/ezrab-ai/rabIntentFlow';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import { exportProjectToPDF } from '../export/pdfExporter';
import { exportItemAmount } from '../export/priceIntegrity';
import { createBackup, validateBackup, restoreBackup } from '../engine/storage/backupRestore';
import { PREMIUM_DEMO_PROJECT } from '../data/premiumDemoData';
import { AI_DRAFTS_STORAGE_KEY } from '../ai-tools/ezrab-ai/draftPersistence';

/* ---------------- localStorage shim (in-memory, isolasi tes) --------- */
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
};

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function approx(name: string, actual: number, expected: number, tol = 0.01): void {
  check(name, Math.abs(actual - expected) <= tol, `harap ${expected}, dapat ${actual}`);
}

const REQ = 'buatkan rab rumah 2 lantai luas bangunan 120 m2 pondasi foot plat lengkap dari pondasi sampai atap';
const REQ_NOFND = 'buatkan rab rumah 2 lantai luas bangunan 120 m2 lengkap dari pondasi sampai atap';
const REQ2 = 'buatkan rab rumah 1 lantai luas bangunan 150 m2 pondasi foot plat lengkap dari pondasi sampai atap';
const NONSENSE = 'buatkan rab stasiun luar angkasa di bulan dengan kubah kaca anti radiasi';
const PROJ_A = 'PROJ-E-A';
const PROJ_B = 'PROJ-E-B';
const IDR = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

/** Ekstrak teks PDF jsPDF: inflate stream FlateDecode (pola pdfHonesty). */
function extractPdfText(raw: string): string {
  const parts: string[] = [raw];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    try { parts.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); } catch { /* bukan Flate */ }
  }
  return parts.join('\n');
}

/** Proyek ekspor dari item efektif draft (overhead/profit/pajak 0 agar
 *  grandTotal engine == total kanonis draft — perbandingan apel-ke-apel). */
function projectFromDraftItems(items: Array<Record<string, unknown>>, projectId: string): Record<string, unknown> {
  const bySection = new Map<string, Array<Record<string, unknown>>>();
  for (const it of items) {
    const key = String(it.__partScope ?? it.sectionName ?? 'Umum');
    if (!bySection.has(key)) bySection.set(key, []);
    const unitPrice = typeof it.unitPrice === 'number' ? (it.unitPrice as number) : 0;
    bySection.get(key)!.push({
      id: it.id, projectId, code: it.code ?? '', description: it.description,
      volume: it.volume, unit: it.unit, unitPrice,
      amount: (it.volume as number) * unitPrice, totalPrice: (it.volume as number) * unitPrice,
      priceStatus: it.priceStatus ?? null, priceSourceKind: it.priceSourceKind ?? null,
      priceSourceLabel: it.priceSourceLabel ?? null, ahspCode: it.ahspCode ?? '',
    });
  }
  const sections = [...bySection.entries()].map(([name, its], i) => ({ code: String(i + 1), name, items: its }));
  return {
    id: projectId, projectNumber: 'PRJ-E-TEST-001', name: 'Proyek Uji Worker E', location: 'Jakarta',
    status: 'draft', sections, rabItems: [], overheadPercent: 0, profitPercent: 0, ppnEnabled: false,
  };
}

function emptyCompany(): Record<string, unknown> {
  return {
    id: 'comp-1', name: '', address: '', phone: '', email: '', website: '',
    taxNumber: '', directorName: '', leadEstimatorName: '',
    defaultOverheadPercent: 0, defaultProfitPercent: 0, defaultContingencyPercent: 0, defaultTaxPercent: 0,
  };
}

async function main(): Promise<void> {
  /* ------------------------------------------------------------------ */
  /* 1 — Jejak alur: bahasa alami → klarifikasi → draft → QTO/AHSP →    */
  /*     total → edit → review                                           */
  /* ------------------------------------------------------------------ */
  console.log('== 1 — Jejak alur (modul asli, tanpa browser) ==');
  const evBare = evaluateRabIntent('buatkan rab rumah');
  check('1.1 permintaan tanpa ukuran → rute klarifikasi', evBare.route === 'clarify', `dapat ${evBare.route}`);
  check('1.2 klarifikasi menanyakan luas bangunan', (evBare.clarification ?? '').includes('luas bangunan'),
    `dapat ${JSON.stringify(evBare.clarification)}`);
  check('1.3 missing memuat buildingAreaM2 + floors', evBare.missing.includes('buildingAreaM2') && evBare.missing.includes('floors'),
    `dapat ${JSON.stringify(evBare.missing)}`);

  const evFull = evaluateRabIntent(REQ);
  check('1.4 spek: luas bangunan 120 m² dipertahankan', evFull.spec.buildingAreaM2 === 120, `dapat ${evFull.spec.buildingAreaM2}`);
  check('1.5 spek: 2 lantai dipertahankan', evFull.spec.floors === 2, `dapat ${evFull.spec.floors}`);

  const built = buildUniversalDraft(REQ);
  check('1.6 permintaan lengkap → draft (bukan needs-spec)', built.kind === 'draft', `dapat ${built.kind}`);
  if (built.kind !== 'draft') throw new Error('prasyarat §1 gagal: bukan draft');
  const draft = built.draft;
  const items = effectiveItems(draft) as Array<Record<string, unknown>>;
  check('1.7 draft punya 13 work item', items.length === 13, `dapat ${items.length}`);
  const withQto = items.filter((i) => (i as { qtoTrace?: { formula?: string } }).qtoTrace?.formula);
  check('1.8 QTO: item membawa jejak rumus volume', withQto.length > 0, `dapat ${withQto.length}/${items.length}`);
  check('1.9 QTO: rumus memakai luas bangunan (building_area)', String((withQto[0] as { qtoTrace: { formula: string } } | undefined)?.qtoTrace?.formula ?? '').includes('building_area'),
    `dapat ${JSON.stringify((withQto[0] as { qtoTrace?: unknown } | undefined)?.qtoTrace)}`);
  const ahspCount = items.filter((i) => typeof i.ahspCode === 'string' && (i.ahspCode as string).length > 0).length;
  const officialCount = items.filter((i) => i.priceSourceKind === 'OFFICIAL_AHSP').length;
  check('1.10 AHSP: 10 item terpeta kode AHSP', ahspCount === 10, `dapat ${ahspCount}`);
  check('1.11 AHSP: 8 item berharga RESMI AHSP', officialCount === 8, `dapat ${officialCount}`);
  const t0 = totalsFromItems(items as never);
  approx('1.12 total terverifikasi (RESMI) Rp136.795.452', t0.verifiedTotal, 136795451.64);
  approx('1.13 total referensi pasar Rp138.362.976', t0.marketTotal, 138362976);
  approx('1.14 total estimasi kanonis Rp275.158.428', t0.estimatedTotal, 275158427.64);
  check('1.15 status PARSIAL: 1 item belum berharga', t0.unpricedCount === 1 && t0.status === 'PARSIAL',
    `dapat ${t0.unpricedCount}/${t0.status}`);

  const rev = reviseUniversalDraft(draft, 'luas bangunan jadi 150 m2') as { ok?: boolean; changed?: boolean } | null;
  check('1.16 edit/revisi: ok + changed', rev?.ok === true && rev?.changed === true, `dapat ${JSON.stringify(rev)}`);
  check('1.17 edit: versi naik 1 → 2', draft.version === 2, `dapat ${draft.version}`);
  const t1 = totalsFromItems(effectiveItems(draft) as never);
  check('1.18 edit: total terverifikasi BERUBAH sesudah revisi luas', Math.abs(t1.verifiedTotal - t0.verifiedTotal) > 1000,
    `sebelum ${IDR(t0.verifiedTotal)}, sesudah ${IDR(t1.verifiedTotal)}`);
  check('1.19 edit: total pasar TAK berubah (bukan luas-tergantung di sini)', t1.marketTotal === t0.marketTotal,
    `dapat ${IDR(t1.marketTotal)}`);
  const readiness = draftReadiness(draft);
  check('1.20 review: NEEDS_SPEC (bukan BLOCKED) — siap ditinjau', readiness.status === 'NEEDS_SPEC',
    `dapat ${readiness.status}`);
  check('1.21 review: tanpa alasan blokir', readiness.blockedReasons.length === 0,
    `dapat ${JSON.stringify(readiness.blockedReasons)}`);

  /* ------------------------------------------------------------------ */
  /* 2 — Persistensi draft: simpan → muat ulang → buka ulang            */
  /* ------------------------------------------------------------------ */
  console.log('== 2 — Persistensi draft (save → reload → reopen) ==');
  const saved = saveDraft({ draft, projectId: PROJ_A, savedBy: 'manual' });
  check('2.1 saveDraft manual ok', saved.ok === true, `dapat ${JSON.stringify(saved)}`);
  const loaded = loadDraft(PROJ_A);
  check('2.2 loadDraft ok', loaded.ok === true, `dapat ${JSON.stringify(loaded).slice(0, 200)}`);
  if (loaded.ok) {
    check('2.3 reopen: id draft sama', loaded.draft.id === draft.id);
    const tReload = totalsFromItems(effectiveItems(loaded.draft) as never);
    check('2.4 reopen: total IDENTIK (JSON totals sama)', JSON.stringify(tReload) === JSON.stringify(t1),
      `sebelum ${JSON.stringify(t1)}, sesudah ${JSON.stringify(tReload)}`);
    const firstBefore = effectiveItems(draft)[0];
    const firstAfter = effectiveItems(loaded.draft)[0];
    check('2.5 reopen: volume item pertama sama', firstAfter.volume === firstBefore.volume,
      `dapat ${firstAfter.volume} vs ${firstBefore.volume}`);
    check('2.6 reopen: unitPrice item pertama sama', firstAfter.unitPrice === firstBefore.unitPrice,
      `dapat ${firstAfter.unitPrice} vs ${firstBefore.unitPrice}`);
    check('2.7 reopen: priceStatus item pertama sama', firstAfter.priceStatus === firstBefore.priceStatus,
      `dapat ${firstAfter.priceStatus} vs ${firstBefore.priceStatus}`);
    check('2.8 reopen: provenance item pertama sama', firstAfter.priceSourceKind === firstBefore.priceSourceKind,
      `dapat ${firstAfter.priceSourceKind} vs ${firstBefore.priceSourceKind}`);
    check('2.9 reopen: savedCount tercatat', loaded.meta.savedCount >= 1, `dapat ${loaded.meta.savedCount}`);
  }
  const peeked = peekPersistedDraft(PROJ_A);
  check('2.10 record tersimpan: provenance per item lengkap', !!peeked && peeked.priceProvenance.length === items.length,
    `dapat ${peeked?.priceProvenance.length} vs ${items.length}`);
  check('2.11 record tersimpan: 1 item unresolved terdaftar (bukan Rp0)',
    !!peeked && peeked.unresolvedItems.length === 1, `dapat ${peeked?.unresolvedItems.length}`);
  const savedAgain = saveDraft({ draft, projectId: PROJ_A, savedBy: 'manual' });
  check('2.12 simpan ulang isi sama → dedupe (tanpa tulis ulang)',
    savedAgain.ok === true && (savedAgain as { deduplicated?: boolean }).deduplicated === true &&
    (savedAgain as { updatedAt?: string }).updatedAt === (saved as { updatedAt?: string }).updatedAt,
    `dapat ${JSON.stringify(savedAgain)}`);
  const stale = saveDraft({ draft, projectId: PROJ_A, savedBy: 'manual', expectedUpdatedAt: '2000-01-01T00:00:00.000Z' });
  check('2.13 tulisan basi antar-tab DITOLAK (DRAFT_VERSION_CONFLICT)',
    stale.ok === false && (stale as { error?: string }).error === 'DRAFT_VERSION_CONFLICT',
    `dapat ${JSON.stringify(stale)}`);
  const builtB = buildUniversalDraft(REQ2);
  check('2.14 draft proyek B terbentuk', builtB.kind === 'draft', `dapat ${builtB.kind}`);
  if (builtB.kind === 'draft') {
    const savedB = saveDraft({ draft: builtB.draft, projectId: PROJ_B, savedBy: 'manual' });
    check('2.15 draft B tersimpan di proyek B', savedB.ok === true);
    check('2.16 draft baru TIDAK menimpa draft proyek A',
      peekPersistedDraft(PROJ_A)?.draftId === draft.id, `dapat ${peekPersistedDraft(PROJ_A)?.draftId}`);
    const loadedB = loadDraft(PROJ_B);
    check('2.17 reopen B: id draft B (bukan A)',
      loadedB.ok === true && loadedB.draft.id === builtB.draft.id,
      `dapat ${loadedB.ok ? loadedB.draft.id : JSON.stringify(loadedB)}`);
    const loadedA2 = loadDraft(PROJ_A);
    check('2.18 reopen A sesudah B disimpan: tetap draft A',
      loadedA2.ok === true && loadedA2.draft.id === draft.id);
  }
  const unknown = loadDraft('PROJ-TIDAK-ADA');
  check('2.19 proyek tanpa draft → DRAFT_NOT_FOUND (bukan draft karangan)',
    unknown.ok === false && (unknown as { error?: string }).error === 'DRAFT_NOT_FOUND');
  const hs = saveHomeState(PROJ_A, { needs: null, intentSpec: evFull.spec, pendingChoice: null });
  check('2.20 konteks intake (home state) tersimpan', hs.ok === true, `dapat ${JSON.stringify(hs)}`);
  const lh = loadHomeState(PROJ_A);
  check('2.21 konteks bertahan reload: luas 120 + 2 lantai',
    lh.ok === true && lh.state.intentSpec?.buildingAreaM2 === 120 && lh.state.intentSpec?.floors === 2,
    `dapat ${lh.ok ? JSON.stringify(lh.state.intentSpec) : JSON.stringify(lh)}`);
  check('2.22 home state: kartu pilihan tidak dibuang diam-diam',
    lh.ok === true && lh.state.pendingChoiceDropped === false);

  /* ------------------------------------------------------------------ */
  /* 3 — Gerbang transfer: validasi, payload, receipt, approval binding */
  /* ------------------------------------------------------------------ */
  console.log('== 3 — Gerbang transfer (push-to-spreadsheet) ==');
  const fresh = buildUniversalDraft(REQ);
  if (fresh.kind !== 'draft') throw new Error('prasyarat §3 gagal: bukan draft');
  const fd = fresh.draft;
  const noProj = validateTransfer(fd, null);
  check('3.1 transfer tanpa proyek tujuan DITOLAK', noProj.allowed === false &&
    noProj.reasons.some((r) => r.includes('projectId kosong')), `dapat ${JSON.stringify(noProj.reasons)}`);
  const okTransfer = validateTransfer(fd, PROJ_A);
  check('3.2 transfer ke proyek tujuan DIIZINKAN (draft NEEDS_SPEC)', okTransfer.allowed === true && okTransfer.duplicate === false,
    `dapat ${JSON.stringify(okTransfer)}`);
  const payload = buildPushPayload(fd) as Array<Record<string, unknown>>;
  check('3.3 payload: 13 item', payload.length === 13, `dapat ${payload.length}`);
  const unpricedPayload = payload.filter((p) => p.priceStatus === 'PRICE_UNRESOLVED');
  check('3.4 payload: 1 item unresolved', unpricedPayload.length === 1, `dapat ${unpricedPayload.length}`);
  check('3.5 payload: item unresolved TIDAK membawa unitPrice (bukan Rp0)',
    unpricedPayload.every((p) => !('unitPrice' in p)), `dapat ${JSON.stringify(unpricedPayload.map((p) => Object.keys(p)))}`);
  check('3.6 payload: item berharga membawa unitPrice > 0',
    payload.filter((p) => p.priceStatus !== 'PRICE_UNRESOLVED').every((p) => typeof p.unitPrice === 'number' && (p.unitPrice as number) > 0));
  const blockedBuilt = buildUniversalDraft(REQ_NOFND);
  if (blockedBuilt.kind === 'draft') {
    const bd = blockedBuilt.draft;
    const bReadiness = draftReadiness(bd);
    check('3.7 draft tanpa jenis pondasi → BLOCKED (jujur, bukan diam-diam)',
      bReadiness.status === 'BLOCKED' && bReadiness.blockedReasons.some((r) => r.includes('pondasi')),
      `dapat ${bReadiness.status}: ${JSON.stringify(bReadiness.blockedReasons)}`);
    check('3.8 draft BLOCKED → validateTransfer menolak',
      validateTransfer(bd, PROJ_A).allowed === false);
    let threw = '';
    try { buildPushPayload(bd); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    check('3.9 draft BLOCKED → buildPushPayload melempar (tanpa penulisan)',
      threw.includes('diblokir'), `dapat ${threw.slice(0, 160)}`);
  } else {
    check('3.7 draft tanpa jenis pondasi terbentuk (prasyarat)', false, `dapat ${blockedBuilt.kind}`);
    check('3.8 (prasyarat gagal)', false);
    check('3.9 (prasyarat gagal)', false);
  }
  const receipt = applyTransferReceipt(fd, PROJ_A, payload.length, unpricedPayload.length);
  check('3.10 receipt transfer tercatat (13 pushed, 1 skipped)',
    receipt.projectId === PROJ_A && receipt.pushed === 13 && receipt.skipped === 1, `dapat ${JSON.stringify(receipt)}`);
  const dup = validateTransfer(fd, PROJ_A);
  check('3.11 transfer ulang versi sama DITOLAK (duplicate, tanpa tulis ganda)',
    dup.allowed === false && dup.duplicate === true, `dapat ${JSON.stringify(dup.reasons)}`);
  const binding = createTransferApprovalBinding(fd, PROJ_A);
  check('3.12 approval binding segar → ok', checkTransferApprovalBinding(binding, fd, PROJ_A).ok === true);
  const wrongProj = checkTransferApprovalBinding(binding, fd, PROJ_B);
  check('3.13 binding: proyek berganti → PROJECT_CHANGED (transfer dibatalkan)',
    wrongProj.ok === false && (wrongProj as { reason?: string }).reason === 'PROJECT_CHANGED');
  const expired = checkTransferApprovalBinding(binding, fd, PROJ_A, binding.createdAt + TRANSFER_APPROVAL_TTL_MS + 1000);
  check('3.14 binding: lewat TTL 10 mnt → EXPIRED',
    expired.ok === false && (expired as { reason?: string }).reason === 'EXPIRED');
  const noBinding = checkTransferApprovalBinding(null, fd, PROJ_A);
  check('3.15 binding: tanpa pratinjau → NO_BINDING',
    noBinding.ok === false && (noBinding as { reason?: string }).reason === 'NO_BINDING');
  const otherDraft = (buildUniversalDraft(REQ) as { draft: typeof fd }).draft;
  const changed = checkTransferApprovalBinding(binding, otherDraft, PROJ_A);
  check('3.16 binding: draft berganti → DRAFT_CHANGED',
    changed.ok === false && (changed as { reason?: string }).reason === 'DRAFT_CHANGED');

  /* ------------------------------------------------------------------ */
  /* 4 — Backup / restore                                                */
  /* ------------------------------------------------------------------ */
  console.log('== 4 — Backup / restore ==');
  store['ezrab.adminMasterPriceOverlay.v1'] = JSON.stringify([{ id: 'local-admin', x: 1 }]);
  const bk = createBackup();
  check('4.1 createBackup ok', bk.ok === true, `dapat ${bk.ok ? '' : (bk as { error?: string }).error}`);
  if (!bk.ok) throw new Error('prasyarat §4 gagal: backup');
  const bkContent = (bk as { content: string }).content;
  const bkParsed = JSON.parse(bkContent) as { datasets: Record<string, unknown> };
  const bkDrafts = bkParsed.datasets[AI_DRAFTS_STORAGE_KEY] as Record<string, unknown> | undefined;
  check('4.2 backup memuat draf AI (kunci PROJ-E-A ada)',
    !!bkDrafts && PROJ_A in bkDrafts, `dapat kunci: ${bkDrafts ? Object.keys(bkDrafts).join(',') : '—'}`);
  check('4.3 validateBackup ok', validateBackup(bkContent).ok === true);
  delete store[AI_DRAFTS_STORAGE_KEY];
  const wiped = loadDraft(PROJ_A);
  check('4.4 sesudah kunci draft dihapus → DRAFT_NOT_FOUND',
    wiped.ok === false && (wiped as { error?: string }).error === 'DRAFT_NOT_FOUND');
  const rb = restoreBackup(bkContent);
  check('4.5 restoreBackup ok', rb.ok === true, `dapat ${JSON.stringify(rb).slice(0, 300)}`);
  check('4.6 restore: kunci admin dilewati (skippedKeys memuat overlay)',
    rb.ok === true && (rb as { skippedKeys?: string[] }).skippedKeys?.includes('ezrab.adminMasterPriceOverlay.v1') === true,
    `dapat ${JSON.stringify((rb as { skippedKeys?: string[] }).skippedKeys)}`);
  store['ezrab.adminMasterPriceOverlay.v1'] = JSON.stringify([{ id: 'local-admin', x: 2 }]);
  const rb2 = restoreBackup(bkContent);
  check('4.7 restore TIDAK PERNAH menimpa overlay admin lokal',
    rb2.ok === true && store['ezrab.adminMasterPriceOverlay.v1'] === JSON.stringify([{ id: 'local-admin', x: 2 }]),
    `dapat ${store['ezrab.adminMasterPriceOverlay.v1']}`);
  const restored = loadDraft(PROJ_A);
  check('4.8 sesudah restore: draft A terbaca lagi', restored.ok === true);
  if (restored.ok) {
    const tRestored = totalsFromItems(effectiveItems(restored.draft) as never);
    check('4.9 sesudah restore: total IDENTIK dengan sebelum backup',
      JSON.stringify(tRestored) === JSON.stringify(t1), `dapat ${JSON.stringify(tRestored)}`);
  }
  const badValidate = validateBackup('bukan json');
  check('4.10 file rusak → validateBackup menolak',
    badValidate.ok === false, `dapat ${JSON.stringify(badValidate).slice(0, 120)}`);
  const badRestore = restoreBackup('bukan json');
  check('4.11 file rusak → restoreBackup menolak TANPA menulis apa pun',
    badRestore.ok === false && (badRestore as { restoredKeys?: string[] }).restoredKeys?.length === 0,
    `dapat ${JSON.stringify(badRestore).slice(0, 160)}`);

  /* ------------------------------------------------------------------ */
  /* 5 — Integritas ekspor: kanonis vs Excel nyata vs PDF nyata         */
  /* ------------------------------------------------------------------ */
  console.log('== 5 — Integritas ekspor (Excel + PDF nyata) ==');
  const expItems = effectiveItems(fd) as Array<Record<string, unknown>>;
  const expTotals = totalsFromItems(expItems as never);
  const project = projectFromDraftItems(expItems, PROJ_A) as never;
  const normSections = UnifiedProjectEngine.normalizeSections(project as never);
  const cs = UnifiedProjectEngine.computeCostSummaryFromSections(project as never, normSections) as Record<string, unknown>;
  approx('5.1 engine grandTotal == total kanonis draft', cs.grandTotal as number, expTotals.estimatedTotal);
  approx('5.2 engine directCost == total kanonis draft', cs.directCost as number, expTotals.estimatedTotal);
  check('5.3 engine menghitung 1 item unresolved', (cs.unresolvedItems as number) === 1, `dapat ${cs.unresolvedItems}`);
  const unpricedItem = expItems.find((i) => !isPriceValidForTotal(i as never));
  check('5.4 exportItemAmount(item unresolved) == null (bukan 0)',
    !!unpricedItem && exportItemAmount(unpricedItem as never) === null,
    `dapat ${unpricedItem ? exportItemAmount(unpricedItem as never) : 'tidak ada item unresolved'}`);
  const blob = await exportRABToProfessionalExcel(project as never, emptyCompany() as never, { preset: 'COMPLETE_PACKAGE' } as never);
  check('5.5 Excel: blob nyata > 0 byte', blob instanceof Blob && blob.size > 0, `size=${blob.size}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const sheetNames = wb.worksheets.map((w) => w.name);
  check('5.6 Excel: sheet rekap + detail ada', sheetNames.includes('04_RAB_Recapitulation') && sheetNames.includes('05_RAB_Detail'),
    `dapat ${sheetNames.join(', ')}`);
  const grandTotal = cs.grandTotal as number;
  const findGtInSheet = (name: string): { nums: number[]; rawRow: unknown[] } | null => {
    const ws = wb.getWorksheet(name);
    if (!ws) return null;
    let found: { nums: number[]; rawRow: unknown[] } | null = null;
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        if (typeof v === 'string' && /grand total/i.test(v)) {
          const nums: number[] = [];
          const rawRow: unknown[] = [];
          row.eachCell((c) => {
            const cv = c.value;
            rawRow.push(typeof cv === 'object' && cv !== null ? JSON.stringify(cv).slice(0, 120) : cv);
            if (typeof cv === 'number') nums.push(cv);
            if (cv && typeof cv === 'object' && 'result' in (cv as Record<string, unknown>) && typeof (cv as { result?: unknown }).result === 'number') nums.push((cv as { result: number }).result);
          });
          found = { nums, rawRow };
        }
      });
    });
    return found;
  };
  const gt04 = findGtInSheet('04_RAB_Recapitulation');
  check('5.7 Excel 04_RAB_Recapitulation: GRAND TOTAL == kanonis',
    !!gt04 && gt04.nums.some((n) => Math.abs(n - grandTotal) <= 0.01),
    `dapat nums=${JSON.stringify(gt04?.nums)} vs kanonis ${grandTotal}`);
  const gt05 = findGtInSheet('05_RAB_Detail');
  check('5.8 Excel 05_RAB_Detail: GRAND TOTAL == kanonis',
    !!gt05 && gt05.nums.some((n) => Math.abs(n - grandTotal) <= 0.01),
    `dapat nums=${JSON.stringify(gt05?.nums)} vs kanonis ${grandTotal}`);
  const gt03ws = wb.getWorksheet('03_Estimate_Summary');
  let gt03val: unknown = undefined;
  let gt03addr = '';
  if (gt03ws) {
    gt03ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && /grand total/i.test(cell.value)) {
          // Tata letak sheet 03: label di satu baris, NILAI di baris
          // tepat di bawahnya pada kolom yang sama (terbukti probe:
          // label E4, nilai E5 = 275.158.427,64).
          const below = gt03ws.getRow(row.number + 1).getCell(cell.col);
          gt03val = below.value;
          gt03addr = below.address;
          if (gt03val && typeof gt03val === 'object' && 'result' in (gt03val as Record<string, unknown>)) {
            gt03val = (gt03val as { result: unknown }).result;
          }
        }
      });
    });
  }
  check('5.9 Excel 03_Estimate_Summary: nilai di bawah label GRAND TOTAL == kanonis',
    typeof gt03val === 'number' && Math.abs(gt03val - grandTotal) <= 0.01,
    `dapat ${gt03addr}=${JSON.stringify(gt03val)} vs kanonis ${grandTotal}`);

  const doc = (await exportProjectToPDF(project as never, emptyCompany() as never, { subscriptionPlan: 'free' } as never)) as { output: (kind: string) => string };
  const datauri: string = doc.output('datauristring');
  const pdfText = extractPdfText(Buffer.from((datauri.split(',')[1] || ''), 'base64').toString('latin1'));
  check('5.10 PDF: dokumen dihasilkan (konten terekstrak)', pdfText.length > 1000, `text len=${pdfText.length}`);
  check('5.11 PDF: memuat grand total kanonis terformat (id-ID)',
    pdfText.includes(IDR(grandTotal).replace('Rp', '').trim()) || pdfText.includes(Math.round(grandTotal).toLocaleString('id-ID')),
    `cari "${Math.round(grandTotal).toLocaleString('id-ID')}"`);
  check('5.12 PDF: item tanpa harga dilabeli BELUM TERSEDIA', /belum tersedia/i.test(pdfText));
  check('5.13 PDF: TIDAK ada "Rp 0" fabrikasi', !pdfText.includes('Rp 0'));
  const demoGrand = (PREMIUM_DEMO_PROJECT as { costSummary?: { grandTotal?: number }; totalRab?: number }).costSummary?.grandTotal;
  const demoTotalRab = (PREMIUM_DEMO_PROJECT as { totalRab?: number }).totalRab;
  check('5.14 PIN EMAS: Premium Demo PRJ-DEMO-PREMIUM-01 grandTotal Rp1.089.879.733',
    demoGrand === 1089879733, `dapat ${demoGrand}`);
  check('5.15 PIN EMAS: Premium Demo totalRab Rp1.089.879.733',
    demoTotalRab === 1089879733, `dapat ${demoTotalRab}`);

  /* ------------------------------------------------------------------ */
  /* 6 — Permintaan tak didukung: dikenali jujur, tanpa RAB karangan    */
  /* ------------------------------------------------------------------ */
  console.log('== 6 — Kategori tak didukung ==');
  const nonsenseBuilt = buildUniversalDraft(NONSENSE);
  check('6.1 stasiun luar angkasa → needs-spec (bukan draft)',
    nonsenseBuilt.kind === 'needs-spec', `dapat ${nonsenseBuilt.kind}`);
  if (nonsenseBuilt.kind === 'needs-spec') {
    check('6.2 alasan jujur: objek pekerjaan belum dikenali',
      nonsenseBuilt.reason.includes('objek'), `dapat ${nonsenseBuilt.reason.slice(0, 200)}`);
    check('6.3 missing menyebut objek/pekerjaan konstruksi',
      nonsenseBuilt.missing.some((m) => m.includes('objek')), `dapat ${JSON.stringify(nonsenseBuilt.missing)}`);
  }
  const nonsenseEv = evaluateRabIntent(NONSENSE);
  check('6.4 evaluasi: rute custom (tanpa template)', nonsenseEv.route === 'custom', `dapat ${nonsenseEv.route}`);
  check('6.5 evaluasi: alasan menyebut tidak ada kategori/template yang dikenali',
    (nonsenseEv.recommendation?.reasons ?? []).some((r) => r.includes('Tidak ada kategori pekerjaan yang dikenali')),
    `dapat ${JSON.stringify(nonsenseEv.recommendation?.reasons)}`);
  const nonsenseFlow = runRabIntentFlow(NONSENSE);
  check('6.6 alur intent: TIDAK membangun RAB (built null)',
    nonsenseFlow.built === null, `dapat ${nonsenseFlow.built ? 'built!' : 'null'}`);

  /* ------------------------------------------------------------------ */
  /* 7 — Indikator status simpan (cek kontrak sumber STATIS; UI live    */
  /*     di browser TIDAK diuji — butuh browser)                         */
  /* ------------------------------------------------------------------ */
  console.log('== 7 — Indikator status simpan (kontrak sumber statis) ==');
  const indicatorSrc = readFileSync('src/components/storage/SaveStatusIndicator.tsx', 'utf8');
  const ctxSrc = readFileSync('src/context/ProjectContext.tsx', 'utf8');
  const topBarSrc = readFileSync('src/components/navigation/TopBar.tsx', 'utf8');
  check('7.1 indikator membaca saveStatus dari useProject()', indicatorSrc.includes('useProject()') && indicatorSrc.includes('saveStatus'));
  check('7.2 indikator punya 4 keadaan: saving/saved/dirty/error',
    ['Menyimpan...', 'Tersimpan', 'Belum tersimpan', 'Gagal menyimpan'].every((s) => indicatorSrc.includes(s)));
  check('7.3 indikator TIDAK pernah klaim "Tersimpan" tanpa tulis sukses (dok header)',
    indicatorSrc.includes('Never shows "saved" unless the write actually succeeded'));
  check('7.4 TopBar me-mount <SaveStatusIndicator', topBarSrc.includes('<SaveStatusIndicator'));
  check('7.5 ProjectContext mengekspos saveStatus di context',
    ctxSrc.includes("saveStatus: 'saved' | 'saving' | 'dirty' | 'error'"));
  check('7.6 ProjectContext: transisi saving → saved/error ter-wiring',
    ctxSrc.includes("setSaveStatus('saving')") && ctxSrc.includes("setSaveStatus('saved')") && ctxSrc.includes("setSaveStatus('error')"));
  check('7.7 ProjectContext: flush debounce 400 ms sebelum tulis',
    ctxSrc.includes('setTimeout(flushToStorage, 400)'));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  } else {
    console.log('SEMUA TEST AI WORKFLOW SPRINT PERSISTENCE LOLOS');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
