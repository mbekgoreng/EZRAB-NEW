/**
 * chatContinuityApproval.test.ts — W11 §11 Conversational Continuity +
 * Approval (Program Universal Construction Intelligence, S1-R5 + celah
 * S1-4). Gaya plain-tsx: `npx --yes tsx src/test/chatContinuityApproval.test.ts`
 *
 * Yang diuji (deterministik, tanpa provider):
 *  A. Pratinjau + binding push direct (directRabPush.ts): tanpa
 *     konfirmasi tidak ada tulis (gerbang NO_BINDING); dengan
 *     konfirmasi menulis; klik ganda tidak duplikasi (binding sekali
 *     pakai); sidik berubah / proyek berganti / kedaluwarsa ditolak.
 *  B. Konfirmasi 6 perintah langsung (actionRegistry.ts): rename,
 *     buat, arsip, duplikat proyek, ubah settings, buat/sinkron QTO —
 *     pemanggilan pertama HANYA bertanya (callback tidak dipanggil),
 *     KLIK TOMBOL konfirmasi (executeDirectConfirmation) mengeksekusi
 *     tepat sekali, pemanggilan ketiga bertanya lagi (idempotensi).
 *     P1-C (direktif owner 2026-11-24, D6 O-5): kirim-ulang TEKS
 *     perintah yang sama TIDAK PERNAH mengeksekusi — eksekusi hanya
 *     lewat dispatch tombol. Input tidak valid tetap fail-closed
 *     tanpa menyimpan konfirmasi. DELETE_PROJECT tidak berubah.
 *     P1-B: seksi B berjalan sebagai Estimator (writesEnabled: true —
 *     setAssistantOperationContext) karena gerbang kapabilitas kini
 *     menolak tanpa konteks operasi.
 *  C. Persistensi state rumah (draftPersistence.ts): RabNeeds +
 *     RabIntentSpec + pendingChoice survive simulasi reload (persist +
 *     hydrate); kartu dibangun ulang dari rawText; record basi
 *     tertimpa all-null; skema tak dikenal fail-closed.
 *  D. RabIntentSpec ke konteks kanonis LLM (canonicalContext.ts):
 *     tampil di blok data dalam anggaran total 16.000 karakter;
 *     tanpa spek, perilaku persis seperti sebelumnya.
 *
 * Provider nyata: NOT RUN (0 panggilan).
 */
import {
  buildDirectRab,
  findDirectTemplate,
} from '../ai-tools/ezrab-ai/directRab';
import {
  mapDirectRabPushItems,
  buildDirectPushPreview,
  formatDirectPushPreviewMessage,
  createDirectPushApprovalBinding,
  checkDirectPushApprovalBinding,
  DIRECT_PUSH_APPROVAL_TTL_MS,
} from '../ai-tools/ezrab-ai/directRabPush';
import {
  executeIntent,
  executeDirectConfirmation,
  clearPendingDirectConfirmations,
  getLastRabNeeds,
  setLastRabNeeds,
  getPendingRabChoice,
  setPendingRabChoice,
  clearPendingRabChoice,
  type ChatActionContext,
  type PendingRabChoice,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { setAssistantOperationContext } from '../ai-tools/ezrab-ai/operations';
import {
  getLastRabIntentSpec,
  setLastRabIntentSpec,
} from '../ai-tools/ezrab-ai/rabIntentFlow';
import { extractRabNeeds } from '../ai-tools/ezrab-ai/rabNeeds';
import { extractRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import { extractUniversalContext } from '../ai-tools/ezrab-ai/universalIntake';
import {
  saveHomeState,
  loadHomeState,
  clearHomeState,
  peekHomeState,
  AI_HOME_STATE_STORAGE_KEY,
} from '../ai-tools/ezrab-ai/draftPersistence';
import {
  buildCanonicalContext,
  CANONICAL_TOTAL_PROMPT_BUDGET,
} from '../ai-tools/ezrab-ai/canonicalContext';
import { saveVersioned } from '../engine/storage/hardenedStorage';
import type { QtoChatItem } from '../ai-tools/ezrab-ai/commands/qtoCommands';

/* ---------------- localStorage shim (pola draftPersistenceHardening) - */
const store: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
const eq = (a: unknown, b: unknown, name: string): void => {
  assert(JSON.stringify(a) === JSON.stringify(b), `${name}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
};

/* ================================================================== */
/* A. Pratinjau + binding push direct                                  */
/* ================================================================== */

const direct = buildDirectRab('buatkan rab rumah type 70 2 lantai');
assert(direct !== null, 'A0: buildDirectRab T70 2 lantai menghasilkan hasil');
if (direct) {
  const preview = buildDirectPushPreview(direct, new Set<string>());
  assert(preview.itemCount > 0, 'A1: preview itemCount > 0');
  assert(preview.newCount === preview.itemCount, 'A2: tanpa kode existing, semua item baru');
  assert(preview.dupCount === 0, 'A3: tanpa kode existing, dupCount 0');
  assert(
    preview.resolved + preview.estimated + preview.unresolved === preview.itemCount,
    'A4: resolved+estimated+unresolved == itemCount',
  );
  assert(preview.estimatedTotal > 0, 'A5: estimatedTotal > 0 (ada item berharga)');
  assert(preview.blocked === false && preview.blockReasons.length === 0, 'A6: hasil ber-item tidak BLOCKED');

  // Semua kode sudah ada → semua duplikat, tapi BUKAN blocked (cermin
  // transfer universal: all-dup dilaporkan saat konfirmasi, bukan blokir).
  const codes = new Set(mapDirectRabPushItems(direct).map((it) => it.code));
  const previewAllDup = buildDirectPushPreview(direct, codes);
  assert(previewAllDup.newCount === 0, 'A7: semua kode existing → newCount 0');
  assert(previewAllDup.dupCount === previewAllDup.itemCount, 'A8: semua kode existing → dupCount == itemCount');
  assert(previewAllDup.blocked === false, 'A9: all-dup bukan BLOCKED');

  const msg = formatDirectPushPreviewMessage(direct, preview, 'Rumah Demo');
  assert(msg.includes(direct.displayLabel), 'A10: pesan preview mengutip label hasil');
  assert(msg.includes('Rumah Demo'), 'A11: pesan preview mengutip proyek tujuan');
  assert(msg.includes('Konfirmasi Push'), 'A12: pesan preview menyebut tombol konfirmasi');

  // Binding: tanpa pratinjau → NO_BINDING (tidak menulis).
  const noBinding = checkDirectPushApprovalBinding(null, direct, 'p1');
  assert(!noBinding.ok && noBinding.reason === 'NO_BINDING', 'A13: tanpa binding → NO_BINDING (konfirmasi ditolak)');

  // Dengan pratinjau segar → ok.
  const binding = createDirectPushApprovalBinding(direct, 'p1', 1_000_000);
  const okCheck = checkDirectPushApprovalBinding(binding, direct, 'p1', 1_000_000);
  assert(okCheck.ok, 'A14: binding segar dari pratinjau → ok (boleh menulis)');

  // Batas TTL: tepat di TTL masih ok; 1 ms sesudahnya EXPIRED.
  const atTtl = checkDirectPushApprovalBinding(binding, direct, 'p1', 1_000_000 + DIRECT_PUSH_APPROVAL_TTL_MS);
  assert(atTtl.ok, 'A15: tepat di batas TTL masih ok');
  const expired = checkDirectPushApprovalBinding(binding, direct, 'p1', 1_000_000 + DIRECT_PUSH_APPROVAL_TTL_MS + 1);
  assert(!expired.ok && expired.reason === 'EXPIRED', 'A16: lewat TTL → EXPIRED');

  // Proyek berganti → PROJECT_CHANGED.
  const wrongProject = checkDirectPushApprovalBinding(binding, direct, 'p2', 1_000_000);
  assert(!wrongProject.ok && wrongProject.reason === 'PROJECT_CHANGED', 'A17: proyek berganti → PROJECT_CHANGED');

  // Hasil berubah sesudah pratinjau → RESULT_CHANGED.
  const direct45 = buildDirectRab('buatkan rab rumah type 45 1 lantai');
  assert(direct45 !== null, 'A18: buildDirectRab T45 1 lantai menghasilkan hasil');
  if (direct45) {
    const changed = checkDirectPushApprovalBinding(binding, direct45, 'p1', 1_000_000);
    assert(!changed.ok && changed.reason === 'RESULT_CHANGED', 'A19: hasil berubah sesudah pratinjau → RESULT_CHANGED');
  }

  // Idempotensi klik ganda: binding sekali pakai — sesudah dipakai,
  // view mengosongkan slot sehingga klik kedua mendapat NO_BINDING.
  const usedOnce = checkDirectPushApprovalBinding(binding, direct, 'p1', 1_000_000);
  assert(usedOnce.ok, 'A20: klik konfirmasi pertama lolos gerbang');
  const secondClick = checkDirectPushApprovalBinding(null, direct, 'p1', 1_000_000);
  assert(!secondClick.ok && secondClick.reason === 'NO_BINDING', 'A21: klik kedua (slot sudah dikosongkan) → NO_BINDING, tidak menulis dua kali');
}

/* ================================================================== */
/* B. Konfirmasi 6 perintah langsung                                   */
/* ================================================================== */

const PROJECTS = [
  { id: 'p1', name: 'Rumah Demo' },
  { id: 'p2', name: 'Gedung Sekolah' },
];
function baseCtx(): ChatActionContext {
  return {
    navigate: () => {},
    currentMenu: '',
    activeProject: { id: 'p1', name: 'Rumah Demo' },
    projects: PROJECTS.map((p) => ({ ...p })),
    projectTotal: null,
  };
}

/* --- B1. RENAME_PROJECT --- */
// P1-B: seksi B berjalan sebagai Estimator (gerbang kapabilitas
// menolak tanpa konteks operasi / tanpa edit-estimate).
setAssistantOperationContext({ actor: 'Penguji', writesEnabled: true });
{
  clearPendingDirectConfirmations();
  const calls: Array<{ id: string; name: string }> = [];
  const ctx = baseCtx();
  ctx.renameProject = (id, name) => { calls.push({ id, name }); return true; };
  const ask = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(calls.length === 0, 'B1a: rename panggilan pertama → callback TIDAK dipanggil');
  assert(ask.ok && ask.message.includes('Rumah Impian'), 'B1b: rename panggilan pertama → bertanya + mengutip nama baru');
  assert((ask.actions?.length ?? 0) === 1 && ask.actions![0].label === 'Ubah nama proyek menjadi Rumah Impian', 'B1c: rename bertanya dengan tombol konfirmasi berlabel perintah');
  // P1-C (O-5): kirim-ulang TEKS tidak mengeksekusi — hanya tombol.
  const retext = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(calls.length === 0, 'B1d: rename kirim-ulang teks → TIDAK mengeksekusi (O-5)');
  assert(retext.message.includes('mengonfirmasi'), 'B1d2: rename kirim-ulang teks → bertanya lagi');
  const exec = executeDirectConfirmation('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(calls.length === 1 && calls[0].id === 'p1' && calls[0].name === 'Rumah Impian', 'B1e: rename klik tombol konfirmasi → callback dipanggil tepat sekali');
  assert(exec.message.includes('diubah dari'), 'B1e2: rename klik tombol konfirmasi → pesan sukses');
  const again = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(calls.length === 1, 'B1f: rename panggilan ketiga → TIDAK mengeksekusi lagi (idempotensi)');
  assert(again.message.includes('mengonfirmasi'), 'B1g: rename panggilan ketiga → bertanya lagi');
}

/* --- B2. CREATE_PROJECT --- */
{
  clearPendingDirectConfirmations();
  const created: string[] = [];
  const ctx = baseCtx();
  ctx.createProject = (name) => { created.push(name); return { id: 'p9', name }; };
  const ask = executeIntent('CREATE_PROJECT', 'Rumah Impian', ctx);
  assert(created.length === 0, 'B2a: create panggilan pertama → TIDAK membuat proyek');
  assert(ask.ok && ask.actions?.[0]?.label === 'Buat proyek Rumah Impian', 'B2b: create bertanya dengan tombol konfirmasi');
  const exec = executeDirectConfirmation('CREATE_PROJECT', 'Rumah Impian', ctx);
  assert(created.length === 1 && created[0] === 'Rumah Impian', 'B2c: create klik tombol konfirmasi → membuat tepat sekali');
  assert(exec.message.includes('dibuat'), 'B2d: create klik tombol konfirmasi → pesan sukses');
  executeIntent('CREATE_PROJECT', 'Rumah Impian', ctx);
  assert(created.length === 1, 'B2e: create panggilan ketiga → TIDAK membuat lagi');
  // 'baru' bukan nama — tetap navigasi, tanpa menyimpan konfirmasi.
  const navigated: string[] = [];
  const ctx2 = baseCtx();
  ctx2.navigate = (m) => { navigated.push(m); };
  ctx2.createProject = (name) => { created.push(name); return { id: 'p10', name }; };
  const baru = executeIntent('CREATE_PROJECT', 'baru', ctx2);
  assert(baru.message.includes('Membuka Daftar Proyek'), 'B2f: "buat proyek baru" tetap navigasi (bukan konfirmasi)');
  assert(created.length === 1, 'B2g: "buat proyek baru" tidak membuat proyek');
}

/* --- B3. ARCHIVE_PROJECT (+ drift) --- */
{
  clearPendingDirectConfirmations();
  const archived: string[] = [];
  const ctx = baseCtx();
  ctx.archiveProject = (id) => { archived.push(id); return true; };
  const ask = executeIntent('ARCHIVE_PROJECT', 'ini', ctx);
  assert(archived.length === 0, 'B3a: arsip panggilan pertama → TIDAK mengarsipkan');
  assert(ask.actions?.[0]?.label === 'Arsipkan proyek Rumah Demo', 'B3b: arsip bertanya dengan tombol konfirmasi bernamakan target ter-resolusi');
  const exec = executeDirectConfirmation('ARCHIVE_PROJECT', 'ini', ctx);
  assert(archived.length === 1 && archived[0] === 'p1', 'B3c: arsip klik tombol konfirmasi → mengarsipkan tepat sekali');
  assert(exec.message.includes('diarsipkan'), 'B3d: arsip klik tombol konfirmasi → pesan sukses');
  executeIntent('ARCHIVE_PROJECT', 'ini', ctx);
  assert(archived.length === 1, 'B3e: arsip panggilan ketiga → TIDAK mengarsipkan lagi');
  // Target tak ditemukan → fail-closed, tanpa konfirmasi tersimpan.
  const notFound = executeIntent('ARCHIVE_PROJECT', 'Tidak Ada', ctx);
  assert(notFound.message.includes('tidak ditemukan'), 'B3f: arsip target tak ada → jujur tanpa eksekusi');
  assert(archived.length === 1, 'B3g: arsip target tak ada → tidak ada eksekusi');
}
{
  // Drift: proyek berganti nama sesudah pratinjau → konfirmasi batal,
  // tanya ulang dengan nama segar; eksekusi hanya sesudah konfirmasi baru.
  clearPendingDirectConfirmations();
  const archived: string[] = [];
  const ctx = baseCtx();
  ctx.archiveProject = (id) => { archived.push(id); return true; };
  executeIntent('ARCHIVE_PROJECT', 'ini', ctx);
  const renamedCtx = baseCtx();
  renamedCtx.activeProject = { id: 'p1', name: 'Rumah Demo Baru' };
  renamedCtx.projects = [{ id: 'p1', name: 'Rumah Demo Baru' }, { id: 'p2', name: 'Gedung Sekolah' }];
  renamedCtx.archiveProject = (id) => { archived.push(id); return true; };
  const reask = executeIntent('ARCHIVE_PROJECT', 'ini', renamedCtx);
  assert(archived.length === 0, 'B3h: proyek berganti nama sesudah tanya → TIDAK dieksekusi');
  assert(reask.message.includes('Rumah Demo Baru'), 'B3i: proyek berganti nama → tanya ulang dengan nama segar');
  executeDirectConfirmation('ARCHIVE_PROJECT', 'ini', renamedCtx);
  assert(archived.length === 1, 'B3j: konfirmasi baru sesudah drift → mengeksekusi sekali');
}

/* --- B4. DUPLICATE_PROJECT --- */
{
  clearPendingDirectConfirmations();
  const duped: string[] = [];
  const ctx = baseCtx();
  ctx.duplicateProject = (id) => { duped.push(id); return { id: 'p9', name: 'Rumah Demo (Salinan)' }; };
  const ask = executeIntent('DUPLICATE_PROJECT', 'ini', ctx);
  assert(duped.length === 0, 'B4a: duplikat panggilan pertama → TIDAK menduplikat');
  assert(ask.actions?.[0]?.label === 'Duplikat proyek Rumah Demo', 'B4b: duplikat bertanya dengan tombol konfirmasi');
  const exec = executeDirectConfirmation('DUPLICATE_PROJECT', 'ini', ctx);
  assert(duped.length === 1 && duped[0] === 'p1', 'B4c: duplikat klik tombol konfirmasi → menduplikat tepat sekali');
  assert(exec.message.includes('duplikat'), 'B4d: duplikat klik tombol konfirmasi → pesan sukses');
  executeIntent('DUPLICATE_PROJECT', 'ini', ctx);
  assert(duped.length === 1, 'B4e: duplikat panggilan ketiga → TIDAK menduplikat lagi');
}

/* --- B5. UPDATE_PROJECT_SETTINGS --- */
{
  clearPendingDirectConfirmations();
  let seenPatch: Record<string, unknown> | null = null;
  let applyCount = 0;
  const ctx = baseCtx();
  ctx.updateProjectSettings = (_id, patch) => {
    applyCount++;
    seenPatch = patch as unknown as Record<string, unknown>;
    return true;
  };
  const ask = executeIntent('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(applyCount === 0 && seenPatch === null, 'B5a: settings panggilan pertama → TIDAK diterapkan');
  assert(ask.message.includes('Overhead') && ask.message.includes('10%'), 'B5b: settings bertanya dengan pratinjau perubahan');
  assert(ask.actions?.[0]?.label === 'Ubah Overhead jadi 10%', 'B5c: settings bertanya dengan tombol konfirmasi');
  // P1-C (O-5): kirim-ulang TEKS tidak mengeksekusi — hanya tombol.
  executeIntent('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(applyCount === 0, 'B5d: settings kirim-ulang teks → TIDAK diterapkan (O-5)');
  const exec = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(applyCount === 1, 'B5d2: settings klik tombol konfirmasi → diterapkan tepat sekali');
  assert(seenPatch !== null && Object.keys(seenPatch).length === 1 && (seenPatch as Record<string, unknown>).overheadPercent === 10, 'B5e: patch hanya field yang disebut');
  assert(exec.message.includes('diubah'), 'B5f: settings klik tombol konfirmasi → pesan sukses');
  executeIntent('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(applyCount === 1, 'B5g: settings panggilan ketiga → TIDAK diterapkan lagi');
  // 'pajak' ambigu → tanya PPN/PPh, tanpa konfirmasi tersimpan.
  const amb = executeIntent('UPDATE_PROJECT_SETTINGS', 'pajak jadi 11%', ctx);
  assert(amb.message.includes('PPN atau PPh'), 'B5h: pajak ambigu → tanya PPN/PPh (tidak ditebak)');
  assert(applyCount === 1, 'B5i: pajak ambigu → tidak ada eksekusi');
}

/* --- B6. CREATE_QTO_ITEM --- */
{
  clearPendingDirectConfirmations();
  const created: Array<{ uraian: string; quantity: number; unit: string }> = [];
  const ctx = baseCtx();
  ctx.createQtoItem = (input) => { created.push(input); return { id: 'q1', kode: 'Q-001' }; };
  const ask = executeIntent('CREATE_QTO_ITEM', 'galian tanah 10 m3', ctx);
  assert(created.length === 0, 'B6a: buat QTO panggilan pertama → TIDAK membuat item');
  assert(ask.actions?.[0]?.label === 'Buat item QTO galian tanah 10 m3', 'B6b: buat QTO bertanya dengan tombol konfirmasi');
  const exec = executeDirectConfirmation('CREATE_QTO_ITEM', 'galian tanah 10 m3', ctx);
  assert(created.length === 1 && created[0].uraian === 'galian tanah' && created[0].quantity === 10 && created[0].unit === 'm3', 'B6c: buat QTO klik tombol konfirmasi → membuat tepat sekali');
  assert(exec.message.includes('dibuat'), 'B6d: buat QTO klik tombol konfirmasi → pesan sukses');
  executeIntent('CREATE_QTO_ITEM', 'galian tanah 10 m3', ctx);
  assert(created.length === 1, 'B6e: buat QTO panggilan ketiga → TIDAK membuat lagi');
  // Tanpa volume → tanya volume, tanpa konfirmasi tersimpan.
  const noVol = executeIntent('CREATE_QTO_ITEM', 'galian tanah', ctx);
  assert(noVol.message.includes('volumenya berapa'), 'B6f: buat QTO tanpa volume → tanya volume (tidak default ke m³)');
  assert(created.length === 1, 'B6g: buat QTO tanpa volume → tidak ada eksekusi');
}

/* --- B7. SYNC_QTO (bernama + semua + drift) --- */
{
  clearPendingDirectConfirmations();
  const items: QtoChatItem[] = [
    { id: 'q1', uraian: 'galian tanah', quantity: 10, unit: 'm3', unitPrice: 50000, priceUnit: 'm3' },
  ];
  const synced: string[] = [];
  const ctx = baseCtx();
  ctx.listQtoItems = () => items;
  ctx.syncQtoItem = (id) => { synced.push(id); return true; };
  const ask = executeIntent('SYNC_QTO', 'galian ke rab', ctx);
  assert(synced.length === 0, 'B7a: sync bernama panggilan pertama → TIDAK menyinkron');
  assert(ask.actions?.[0]?.label === 'Sinkronkan QTO galian tanah ke RAB', 'B7b: sync bernama bertanya dengan tombol konfirmasi');
  const exec = executeDirectConfirmation('SYNC_QTO', 'galian ke rab', ctx);
  assert(synced.length === 1 && synced[0] === 'q1', 'B7c: sync bernama klik tombol konfirmasi → menyinkron tepat sekali');
  assert(exec.message.includes('disinkronkan'), 'B7d: sync bernama klik tombol konfirmasi → pesan sukses');
  executeIntent('SYNC_QTO', 'galian ke rab', ctx);
  assert(synced.length === 1, 'B7e: sync bernama panggilan ketiga → TIDAK menyinkron lagi');
}
{
  clearPendingDirectConfirmations();
  const items: QtoChatItem[] = [
    { id: 'q1', uraian: 'galian tanah', quantity: 10, unit: 'm3', unitPrice: 50000, priceUnit: 'm3' },
    { id: 'q2', uraian: 'urugan pasir', quantity: 5, unit: 'm3', unitPrice: 30000, priceUnit: 'm3' },
    { id: 'q3', uraian: 'pondasi batu', quantity: 2, unit: 'm3' },
  ];
  const synced: string[] = [];
  const ctx = baseCtx();
  ctx.listQtoItems = () => items;
  ctx.syncQtoItem = (id) => { synced.push(id); return true; };
  const ask = executeIntent('SYNC_QTO', 'semua qto', ctx);
  assert(synced.length === 0, 'B7f: sync semua panggilan pertama → TIDAK menyinkron');
  assert(ask.message.includes('2 item') && ask.message.includes('1 item tanpa harga'), 'B7g: sync semua bertanya dengan hitungan berharga vs tanpa harga');
  const exec = executeDirectConfirmation('SYNC_QTO', 'semua qto', ctx);
  assert(synced.length === 2 && synced.includes('q1') && synced.includes('q2'), 'B7h: sync semua klik tombol konfirmasi → hanya item berharga yang tersinkron');
  assert(!synced.includes('q3'), 'B7i: sync semua → item tanpa harga tidak disinkron diam-diam');
  assert(exec.message.includes('disinkronkan'), 'B7j: sync semua klik tombol konfirmasi → pesan sukses');
  executeIntent('SYNC_QTO', 'semua qto', ctx);
  assert(synced.length === 2, 'B7k: sync semua panggilan ketiga → TIDAK menyinkron lagi');
}
{
  // Drift: item berharga baru muncul sesudah pratinjau → konfirmasi
  // batal, tanya ulang dengan daftar segar.
  clearPendingDirectConfirmations();
  const items: QtoChatItem[] = [
    { id: 'q1', uraian: 'galian tanah', quantity: 10, unit: 'm3', unitPrice: 50000, priceUnit: 'm3' },
  ];
  const synced: string[] = [];
  const ctx = baseCtx();
  ctx.listQtoItems = () => items;
  ctx.syncQtoItem = (id) => { synced.push(id); return true; };
  executeIntent('SYNC_QTO', 'semua qto', ctx);
  items.push({ id: 'q2', uraian: 'urugan pasir', quantity: 5, unit: 'm3', unitPrice: 30000, priceUnit: 'm3' });
  const reask = executeIntent('SYNC_QTO', 'semua qto', ctx);
  assert(synced.length === 0, 'B7l: item berharga baru sesudah tanya → TIDAK dieksekusi');
  assert(reask.message.includes('2 item'), 'B7m: item baru → tanya ulang dengan daftar segar');
  executeDirectConfirmation('SYNC_QTO', 'semua qto', ctx);
  assert(synced.length === 2, 'B7n: konfirmasi baru sesudah drift → menyinkron kedua item');
}

/* --- B8. DELETE_PROJECT tidak berubah (sudah punya konfirmasi sendiri) --- */
{
  clearPendingDirectConfirmations();
  const deleted: string[] = [];
  const ctx = baseCtx();
  ctx.deleteProject = (id) => { deleted.push(id); return true; };
  const ask = executeIntent('DELETE_PROJECT', 'ini', ctx);
  assert(deleted.length === 0, 'B8a: hapus langkah 1 → TIDAK menghapus');
  assert((ask.actions?.length ?? 0) === 2 && ask.actions![0].label === 'Ya, hapus proyek', 'B8b: hapus langkah 1 → dua tombol konfirmasi (pola lama utuh)');
  const exec = executeIntent('DELETE_PROJECT_CONFIRM', 'p1', ctx);
  assert(deleted.length === 1 && deleted[0] === 'p1', 'B8c: hapus konfirmasi → menghapus tepat sekali');
  assert(exec.message.includes('dihapus'), 'B8d: hapus konfirmasi → pesan sukses');
}

/* ================================================================== */
/* C. Persistensi state rumah — simulasi reload                        */
/* ================================================================== */

const PID = 'PRJ-HOME-1';
{
  clearHomeState(PID);
  const needs = extractRabNeeds('rumah type 70 2 lantai 3 kamar tidur');
  const spec = extractRabIntentSpec('buatkan rab rumah type 70 2 lantai 3 kamar tidur');
  const match = findDirectTemplate('buatkan rab rumah type 70');
  assert(match !== null, 'C0: findDirectTemplate type 70 cocok (prasyarat kartu)');
  const choice: PendingRabChoice | null = match
    ? { rawText: 'buatkan rab rumah type 70', match, needs, floors: 2, floorsMentioned: true, landAreaM2: null, spec }
    : null;

  // Set state sesi seperti alur produksi, lalu simpan via getter
  // (cermin efek simpan view.tsx).
  setLastRabNeeds(needs, PID);
  setLastRabIntentSpec(spec);
  if (choice) setPendingRabChoice(choice);
  const s1 = saveHomeState(PID, {
    needs: getLastRabNeeds(PID),
    intentSpec: getLastRabIntentSpec(),
    pendingChoice: getPendingRabChoice(),
  });
  assert(s1.ok === true && s1.deduplicated === false, 'C1: save state rumah pertama → ok, menulis');
  const s2 = saveHomeState(PID, {
    needs: getLastRabNeeds(PID),
    intentSpec: getLastRabIntentSpec(),
    pendingChoice: getPendingRabChoice(),
  });
  assert(s2.ok === true && s2.deduplicated === true, 'C2: save isi sama → deduplicated (tanpa tulis ulang)');
  assert(peekHomeState(PID) !== null, 'C3: record state rumah terbaca mentah (peek)');

  // Simulasi reload: singleton in-memory dikosongkan TANPA menyentuh storage.
  setLastRabNeeds(null);
  setLastRabIntentSpec(null);
  clearPendingRabChoice();
  assert(getLastRabNeeds(PID) === null, 'C4: simulasi reload → needs kosong');
  assert(getLastRabIntentSpec() === null, 'C5: simulasi reload → spec kosong');
  assert(getPendingRabChoice() === null, 'C6: simulasi reload → pendingChoice kosong');

  // Load + hidrasi (cermin efek pemulihan view.tsx).
  const loaded = loadHomeState(PID);
  assert(loaded.ok === true, 'C7: load state rumah → ok');
  if (loaded.ok) {
    eq(loaded.state.needs, needs, 'C8: needs survive reload (identik)');
    eq(loaded.state.intentSpec, spec, 'C9: intentSpec survive reload (identik)');
    assert(loaded.state.pendingChoice !== null, 'C10: pendingChoice survive reload (tidak null)');
    assert(loaded.state.pendingChoiceDropped === false, 'C11: pendingChoice tidak dibuang (match berhasil dibangun ulang)');
    if (loaded.state.pendingChoice && match) {
      assert(
        loaded.state.pendingChoice.match.item.label === match.item.label,
        'C12: match kartu dibangun ulang dari rawText (label template sama)',
      );
      eq(loaded.state.pendingChoice.needs, needs, 'C13: needs kartu survive reload (identik)');
      assert(loaded.state.pendingChoice.floors === 2, 'C14: floors kartu survive reload');
    }
    // Hidrasi kembali ke singleton.
    if (loaded.state.needs) setLastRabNeeds(loaded.state.needs, PID);
    if (loaded.state.intentSpec) setLastRabIntentSpec(loaded.state.intentSpec);
    if (loaded.state.pendingChoice) setPendingRabChoice(loaded.state.pendingChoice);
    assert(getLastRabNeeds(PID) !== null, 'C15: hidrasi → needs kembali di singleton');
    assert(getLastRabIntentSpec() !== null, 'C16: hidrasi → spec kembali di singleton');
    assert(getPendingRabChoice() !== null, 'C17: hidrasi → pendingChoice kembali di singleton');
  }

  // Record all-null menimpa record basi (kartu yang dikonsumsi tidak bangkit).
  setLastRabNeeds(null);
  setLastRabIntentSpec(null);
  clearPendingRabChoice();
  const cleared = saveHomeState(PID, { needs: null, intentSpec: null, pendingChoice: null });
  assert(cleared.ok === true && cleared.deduplicated === false, 'C18: save all-null menimpa record basi');
  const reloaded = loadHomeState(PID);
  assert(
    reloaded.ok === true &&
      reloaded.state.needs === null &&
      reloaded.state.intentSpec === null &&
      reloaded.state.pendingChoice === null,
    'C19: sesudah all-null, load mengembalikan state kosong (kartu tidak bangkit)',
  );

  // Proyek tanpa record → DRAFT_NOT_FOUND.
  const missing = loadHomeState('PRJ-TIDAK-ADA');
  assert(!missing.ok && missing.error === 'DRAFT_NOT_FOUND', 'C20: proyek tanpa record → DRAFT_NOT_FOUND');

  // Skema tak dikenal → fail-closed.
  saveVersioned(AI_HOME_STATE_STORAGE_KEY, {
    [PID]: { schemaVersion: 99, updatedAt: new Date().toISOString(), needs: null, intentSpec: null, pendingChoice: null },
  });
  const badSchema = loadHomeState(PID);
  assert(!badSchema.ok && badSchema.error === 'DRAFT_SCHEMA_UNSUPPORTED', 'C21: skema v99 → DRAFT_SCHEMA_UNSUPPORTED (tidak ditebak)');
  clearHomeState(PID);
  assert(peekHomeState(PID) === null, 'C22: clearHomeState menghapus record');
}

/* ================================================================== */
/* D. RabIntentSpec ke konteks kanonis LLM                             */
/* ================================================================== */

{
  const spec = extractRabIntentSpec('buatkan rab rumah type 70 2 lantai 3 kamar tidur atap genteng budget 500 juta');
  const built = buildCanonicalContext({
    messages: [{ role: 'user', content: 'lanjutkan RAB-nya' }],
    rabIntentSpec: spec,
    reservedChars: 9000,
  });
  assert(built.dataBlock.includes('(spek RAB)'), 'D1: konteks kanonis memuat baris spek RAB');
  assert(built.dataBlock.includes('Budget (spek RAB): Rp500.000.000'), 'D2: budget spek tampil (Rp500.000.000)');
  assert(built.dataBlock.includes('Jumlah lantai (spek RAB): 2'), 'D3: lantai spek tampil (2)');
  assert(
    built.report.promptChars <= CANONICAL_TOTAL_PROMPT_BUDGET,
    `D4: prompt rakitan ≤ 16.000 karakter (aktual: ${built.report.promptChars})`,
  );
  assert(built.report.budget.total === CANONICAL_TOTAL_PROMPT_BUDGET, 'D5: anggaran total tetap 16.000');

  // Tanpa spek: perilaku persis seperti sebelumnya (tanpa baris spek).
  const without = buildCanonicalContext({
    messages: [{ role: 'user', content: 'lanjutkan RAB-nya' }],
    reservedChars: 9000,
  });
  assert(!without.dataBlock.includes('(spek RAB)'), 'D6: tanpa spek, tidak ada baris spek RAB (backward compat)');
  assert(
    without.report.promptChars <= CANONICAL_TOTAL_PROMPT_BUDGET,
    'D7: tanpa spek, prompt tetap ≤ 16.000',
  );

  // Intake universal + spek rumah hidup berdampingan.
  const intake = extractUniversalContext('buatkan RAB jalan paving 300 m2');
  const combined = buildCanonicalContext({
    messages: [{ role: 'user', content: 'lanjutkan' }],
    intakeContext: intake,
    rabIntentSpec: spec,
    reservedChars: 9000,
  });
  assert(combined.dataBlock.includes('Kategori proyek'), 'D8: intake + spek → baris intake tetap ada');
  assert(combined.dataBlock.includes('(spek RAB)'), 'D9: intake + spek → baris spek tetap ada');
  assert(
    combined.report.promptChars <= CANONICAL_TOTAL_PROMPT_BUDGET,
    `D10: intake + spek → prompt tetap ≤ 16.000 (aktual: ${combined.report.promptChars})`,
  );

  // Tekanan anggaran: spek raksasa (60 material panjang) → fakta
  // dipotong per baris, total tetap ≤ 16.000 (tidak pernah melampaui).
  const hugeSpec = {
    ...spec,
    materials: Array.from({ length: 60 }, (_, i) => `material-contoh-nomor-${i + 1}-dengan-nama-yang-sangat-panjang-sekali`),
  };
  const pressured = buildCanonicalContext({
    messages: Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `pesan riwayat nomor ${i + 1} tentang RAB rumah type 70 dengan berbagai detail spesifikasi teknis`,
    })),
    rabIntentSpec: hugeSpec,
    reservedChars: 9000,
  });
  assert(
    pressured.report.promptChars <= CANONICAL_TOTAL_PROMPT_BUDGET,
    `D11: spek raksasa + riwayat penuh → prompt tetap ≤ 16.000 (aktual: ${pressured.report.promptChars})`,
  );
  // Cap per baris 400 karakter (cermin formatIntakeLines): daftar
  // material raksasa dipotong berpenanda '…' di barisnya sendiri —
  // bukan menghilangkan fakta lain, bukan melampaui anggaran.
  assert(
    pressured.dataBlock.includes('material-contoh-nomor-1'),
    'D12a: spek raksasa → awal daftar material tetap tampil',
  );
  assert(
    !pressured.dataBlock.includes('material-contoh-nomor-60'),
    'D12b: spek raksasa → akhir daftar material dipotong (cap per baris 400)',
  );
  assert(
    pressured.dataBlock.includes('…'),
    'D12c: spek raksasa → pemotongan ditandai … (bukan hilang diam-diam)',
  );
  assert(
    pressured.dataBlock.includes('Jenis bangunan (spek RAB)'),
    'D13: spek raksasa → baris fakta awal (prioritas tertinggi) tetap selamat',
  );
}

/* ================================================================== */
/* E. Wiring ekstraksi → builder (koordinator, tindak lanjut W11)     */
/*    Membuktikan jalur view submit → extractRabIntentSpec → builder  */
/*    bekerja ujung-ke-ujung pada pesan nyata (bukan spek rakitan).    */
/* ================================================================== */

{
  // Prompt persis owner (20:55): "uang 120jt" harus terbaca sebagai budget.
  const ownerSpec = extractRabIntentSpec(
    'saya ada uang 120jt saya ingin kamu buatkan rab untuk rumah type 36, apa saja pekerjaan dan spek materialnya?',
  );
  const ownerBuilt = buildCanonicalContext({
    messages: [{ role: 'user', content: 'saya ada uang 120jt saya ingin kamu buatkan rab untuk rumah type 36' }],
    rabIntentSpec: ownerSpec,
    reservedChars: 9000,
  });
  assert(ownerBuilt.dataBlock.includes('Budget (spek RAB): Rp120.000.000'), 'E1: prompt owner → budget Rp120.000.000 di konteks');
  assert(ownerBuilt.dataBlock.includes('(spek RAB)'), 'E2: prompt owner → baris spek RAB ada');
  assert(
    ownerBuilt.report.promptChars <= CANONICAL_TOTAL_PROMPT_BUDGET,
    `E3: prompt owner → prompt tetap ≤ 16.000 (aktual: ${ownerBuilt.report.promptChars})`,
  );

  // Pesan non-RAB: tidak ada baris spek SUBSTANTIF (hanya bookkeeping
  // 'Sumber spek RAB: free' yang selalu ada — bukan fakta karangan).
  const helloSpec = extractRabIntentSpec('halo, apa kabar?');
  const helloBuilt = buildCanonicalContext({
    messages: [{ role: 'user', content: 'halo, apa kabar?' }],
    rabIntentSpec: helloSpec,
    reservedChars: 9000,
  });
  assert(!helloBuilt.dataBlock.includes('Budget (spek RAB)'), 'E4: pesan non-RAB → tanpa baris budget');
  assert(!helloBuilt.dataBlock.includes('Luas bangunan (spek RAB)'), 'E5: pesan non-RAB → tanpa baris luas');
  assert(!helloBuilt.dataBlock.includes('Jumlah lantai (spek RAB)'), 'E6: pesan non-RAB → tanpa baris lantai');

  // Kamar tidur ikut terbaca dari pesan.
  const ktSpec = extractRabIntentSpec('buatkan rab rumah 3 kamar tidur');
  const ktBuilt = buildCanonicalContext({
    messages: [{ role: 'user', content: 'buatkan rab rumah 3 kamar tidur' }],
    rabIntentSpec: ktSpec,
    reservedChars: 9000,
  });
  assert(ktBuilt.dataBlock.includes('Kamar tidur (spek RAB): 3'), 'E7: 3 kamar tidur → baris spek tampil');
}

console.log(`\nchatContinuityApproval: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
