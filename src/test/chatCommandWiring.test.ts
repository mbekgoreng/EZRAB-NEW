/**
 * EZRAB Chat AI — Tes wiring perintah deterministik kelompok 1–5
 * (2026-11-17, gap P2–P8 + P12 audit perintah Ezrab AI).
 *
 * Kelima modul commands/* dites unit oleh suite-nya masing-masing
 * (chatProjectCommands, chatQtoCommands, chatDedDocCommands,
 * chatExportCreditCommands, chatProjectSettingsCommands). Suite ini
 * membuktikan WIRING-nya: pola → routeIntent → case registry →
 * handler, termasuk penempatan pola yang menahan pembajakan
 * (HELP/ADD_ITEM/UPDATE_ITEM_*) dan pagar massal C11.
 * Run: npx tsx src/test/chatCommandWiring.test.ts
 */
import { routeIntent, HELP_TEXT } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, executeDirectConfirmation, type ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';
import { setAssistantOperationContext } from '../ai-tools/ezrab-ai/operations';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function routes(input: string, intent: string, name: string): void {
  const r = routeIntent(input);
  assert(r.intent === intent, `${name} — routeIntent(${JSON.stringify(input)}) = ${r.intent}, want ${intent}`);
}
function notRoutes(input: string, intent: string, name: string): void {
  const r = routeIntent(input);
  assert(r.intent !== intent, `${name} — routeIntent(${JSON.stringify(input)}) = ${r.intent}, must not be ${intent}`);
}

/* --- A. Positif: tiap intent baru dikenali router --- */
routes('buat proyek Rumah Impian', 'CREATE_PROJECT', 'A1 create project');
routes('hapus proyek ini', 'DELETE_PROJECT', 'A2 delete project');
routes('arsipkan proyek ini', 'ARCHIVE_PROJECT', 'A3 archive project');
routes('duplikat proyek ini', 'DUPLICATE_PROJECT', 'A4 duplicate project');
routes('buat item QTO galian tanah 10 m3', 'CREATE_QTO_ITEM', 'A5 create qto');
routes('sinkronkan QTO galian ke RAB', 'SYNC_QTO', 'A6 sync qto named');
routes('sinkronkan semua QTO', 'SYNC_QTO', 'A7 sync qto bulk');
routes('jalankan analisis ded', 'RUN_DED_ANALYSIS', 'A8 run ded');
routes('ringkas dokumen ini', 'SUMMARIZE_DOCUMENT', 'A9 summarize doc');
routes('ekspor ke Excel', 'EXPORT_PROJECT', 'A10 export excel');
routes('ekspor RAB ke PDF', 'EXPORT_PROJECT', 'A11 export pdf');
routes('buat revisi baru', 'CREATE_REVISION', 'A12 create revision');
routes('sisa kredit saya', 'CREDIT_BALANCE', 'A13 credit balance');
routes('top up 500 kredit', 'TOPUP_CREDIT', 'A14 topup');
routes('tambah kredit 1500', 'TOPUP_CREDIT', 'A15 topup tambah');
routes('ubah overhead jadi 10%', 'UPDATE_PROJECT_SETTINGS', 'A16 settings overhead');
routes('PPN 11%', 'UPDATE_PROJECT_SETTINGS', 'A17 settings ppn bare');

/* --- B. Penempatan pola: pembajakan yang ditahan --- */
routes('ubah volume overhead jadi 10 m2', 'UPDATE_ITEM_VOLUME', 'B1 volume overhead stays item');
routes('ubah harga overhead jadi 10%', 'UPDATE_ITEM_PRICE', 'B2 price overhead stays item');
routes('tolong ekspor ke Excel', 'EXPORT_PROJECT', 'B3 tolong ekspor not HELP');
routes('tolong jalankan analisis ded', 'RUN_DED_ANALYSIS', 'B4 tolong ded not HELP');
routes('tambah item QTO galian 10 m3', 'CREATE_QTO_ITEM', 'B5 tambah qto not ADD_ITEM');
routes('tolong buatkan item QTO galian 10 m3', 'CREATE_QTO_ITEM', 'B6 tolong qto not HELP');
routes('bagaimana cara ekspor ke Excel?', 'HOWTO_EXCEL_EXPORT', 'B7 howto stays howto');
// §4.1 (directive P1 2026-11-24 / OD-1): navigasi bahasa alami DIHAPUS —
// "buka ded ai" / "buat proyek baru" kini UNKNOWN ke AI (dulu
// OPEN_DED_ESTIMATE / OPEN_PROJECT_CREATE). Navigasi hanya lewat slash.
routes('buka ded ai', 'UNKNOWN', 'B8 buka ded now goes to AI (§4.1 slash-only)');
routes('buatkan rab rumah type 70 2 lantai', 'CREATE_RAB_DIRECT', 'B9 rab direct intact');
routes('buat proyek baru', 'UNKNOWN', 'B10 buat proyek baru now goes to AI (§4.1 slash-only)');
// Penjaga anti-"rab" (Phase 2, 2026-11-23 — regresi c96881c): permintaan
// RAB ber-"proyek" TIDAK BOLEH dibajak CREATE_PROJECT; "rab" sesudah
// "proyek" tetap bagian dari nama proyek (B16).
routes('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta', 'CREATE_RAB_SUMMARY', 'B11 rab proyek 2 gedung not CREATE_PROJECT');
routes('Buatkan RAB proyek kandang sapi 17 x 9 m', 'CREATE_RAB_SUMMARY', 'B12 rab proyek kandang not CREATE_PROJECT');
routes('Buatkan RAB untuk proyek gedung kantor 3 lantai', 'CREATE_RAB_SUMMARY', 'B13 rab untuk proyek gedung not CREATE_PROJECT');
routes('Buatkan RAB proyek renovasi dapur', 'CREATE_RAB_SUMMARY', 'B14 rab proyek renovasi not CREATE_PROJECT');
routes('Buatkan RAB jalan beton 500 m proyek desa', 'CREATE_RAB_SUMMARY', 'B15 rab jalan proyek desa not CREATE_PROJECT');
routes('buat proyek RAB Gedung', 'CREATE_PROJECT', 'B16 rab sesudah proyek = nama proyek');
routes('hapus item plesteran', 'DELETE_ITEM', 'B11 hapus item intact');
routes('berapa total proyek ini', 'QUERY_PROJECT_TOTAL', 'B12 total intact');
routes('ubah nama proyek menjadi Rumah Impian', 'RENAME_PROJECT', 'B13 rename intact');
routes('ubah volume plesteran jadi 25 m2', 'UPDATE_ITEM_VOLUME', 'B14 volume intact');
notRoutes('berapa overhead proyek ini?', 'UPDATE_PROJECT_SETTINGS', 'B15 tanya overhead not settings');
notRoutes('cara ekspor ke pdf gimana?', 'EXPORT_PROJECT', 'B16 tanya pdf not export');
notRoutes('ya, hapus proyek', 'DELETE_PROJECT_CONFIRM', 'B17 confirm is button-only');
notRoutes('ya, hapus proyek', 'DELETE_PROJECT', 'B18 confirm label not delete');

/* --- C. Pagar massal C11 --- */
routes('hapus semua proyek', 'UNKNOWN', 'C1 hapus semua proyek unknown');
notRoutes('hapus semua proyek', 'DELETE_PROJECT', 'C2 hapus semua not delete');

/* --- D. Klarifikasi (bentuk tanpa param) --- */
{
  const d = routeIntent('hapus proyek');
  assert(d.intent === 'DELETE_PROJECT' && d.needsClarification, 'D1 hapus proyek clarifies');
  const a = routeIntent('arsipkan proyek');
  assert(a.intent === 'ARCHIVE_PROJECT' && a.needsClarification, 'D2 arsipkan clarifies');
  const u = routeIntent('duplikat proyek');
  assert(u.intent === 'DUPLICATE_PROJECT' && u.needsClarification, 'D3 duplikat clarifies');
  const q = routeIntent('buat item qto');
  assert(q.intent === 'CREATE_QTO_ITEM' && q.needsClarification, 'D4 buat qto clarifies');
  const s = routeIntent('sinkronkan qto');
  assert(s.intent === 'SYNC_QTO' && s.needsClarification, 'D5 sinkron qto clarifies');
  const p = routeIntent('ubah overhead');
  assert(p.intent === 'UPDATE_PROJECT_SETTINGS' && p.needsClarification, 'D6 ubah overhead clarifies');
}

/* --- E. HELP_TEXT tetap ringkas --- */
assert(HELP_TEXT.length < 1200, `E1 HELP_TEXT compact (${HELP_TEXT.length} < 1200)`);
assert(HELP_TEXT.includes('buat proyek'), 'E2 HELP mentions proyek');
assert(HELP_TEXT.includes('sinkronkan qto'), 'E3 HELP mentions qto');
assert(HELP_TEXT.includes('sisa kredit saya'), 'E4 HELP mentions kredit');
assert(HELP_TEXT.includes('PPN 11%'), 'E5 HELP mentions settings');

/* --- F. Registry: case mendelegasikan ke handler --- */
// P1-B: seksi F berjalan sebagai Estimator (gerbang kapabilitas
// menolak tanpa konteks operasi / tanpa edit-estimate).
setAssistantOperationContext({ actor: 'Penguji', writesEnabled: true });
const baseCtx: ChatActionContext = {
  navigate: () => {},
  currentMenu: '',
  activeProject: { id: 'p1', name: 'Rumah Demo' },
  projects: [{ id: 'p1', name: 'Rumah Demo' }],
  projectTotal: null,
};
{
  // CREATE_PROJECT dua langkah (W11 §11, S1-R5 + P1-C): panggilan
  // pertama hanya bertanya (tidak membuat), KLIK TOMBOL konfirmasi
  // (executeDirectConfirmation) mengeksekusi. Kirim-ulang teks TIDAK
  // PERNAH mengeksekusi (D6 O-5, direktif owner 2026-11-24).
  const ask = executeIntent('CREATE_PROJECT', 'Rumah Impian', {
    ...baseCtx,
    createProject: (name) => ({ id: 'p2', name }),
  });
  assert(ask.ok && ask.message.includes('Rumah Impian') && (ask.actions?.length ?? 0) === 1, 'F1a create project asks first');
  const ok = executeDirectConfirmation('CREATE_PROJECT', 'Rumah Impian', {
    ...baseCtx,
    createProject: (name) => ({ id: 'p2', name }),
  });
  assert(ok.ok && ok.message.includes('dibuat') && ok.message.includes('Rumah Impian'), 'F1 create project executes');
  const noCb = executeIntent('CREATE_PROJECT', 'Rumah Impian', baseCtx);
  assert(!noCb.ok && noCb.message.includes('belum bisa'), 'F2 create project fail-closed');
  // DELETE_PROJECT_CONFIRM tanpa proyek di daftar → fail-closed
  const noProj = executeIntent('DELETE_PROJECT_CONFIRM', 'p9', {
    ...baseCtx,
    deleteProject: () => true,
  });
  assert(!noProj.ok, 'F3 delete confirm unknown id fails closed');
  // CREDIT_BALANCE simulasi + unavailable
  const bal = executeIntent('CREDIT_BALANCE', undefined, {
    ...baseCtx, creditBalance: 4500, creditSource: 'simulation',
  });
  assert(bal.ok && bal.message.includes('simulasi'), 'F4 credit balance simulation label');
  const unav = executeIntent('CREDIT_BALANCE', undefined, {
    ...baseCtx, creditBalance: 4500, creditSource: 'unavailable',
  });
  assert(!unav.ok && unav.message.includes('belum terhubung'), 'F5 credit unavailable honest');
  // UPDATE_PROJECT_SETTINGS dua langkah (W11 §11, S1-R5 + P1-C):
  // panggilan pertama hanya bertanya (patch tidak diterapkan), KLIK
  // TOMBOL konfirmasi menerapkan — patch hanya field yang disebut.
  let seenPatch: Record<string, unknown> | null = null;
  const setAsk = executeIntent('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', {
    ...baseCtx,
    updateProjectSettings: (_id, patch) => { seenPatch = patch as unknown as Record<string, unknown>; return true; },
  });
  assert(setAsk.ok && seenPatch === null, 'F6a settings asks first (patch not applied)');
  const set = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', {
    ...baseCtx,
    updateProjectSettings: (_id, patch) => { seenPatch = patch as unknown as Record<string, unknown>; return true; },
  });
  assert(set.ok && seenPatch !== null && Object.keys(seenPatch as object).length === 1
    && (seenPatch as Record<string, unknown>).overheadPercent === 10, 'F6 settings patch only mentioned field');
  // TOPUP_CREDIT: tier dikenal + fail-closed tanpa callback
  const top = executeIntent('TOPUP_CREDIT', '500', {
    ...baseCtx,
    topUpCredits: () => ({ ok: true, addedCredits: 500, newBalance: 5000 }),
  });
  assert(top.ok && top.message.toLowerCase().includes('simulasi'), 'F7 topup executes with simulasi label');
  const topNoCb = executeIntent('TOPUP_CREDIT', '500', baseCtx);
  assert(!topNoCb.ok && topNoCb.message.includes('belum bisa'), 'F8 topup fail-closed');
  // EXPORT_PROJECT tanpa callback → fail-closed
  const exp = executeIntent('EXPORT_PROJECT', 'excel', baseCtx);
  assert(!exp.ok && exp.message.includes('belum bisa'), 'F9 export fail-closed');
  // SUMMARIZE_DOCUMENT tanpa dokumen + gate tak diketahui → jujur, bukan klaim
  const doc = executeIntent('SUMMARIZE_DOCUMENT', 'dokumen ini', baseCtx);
  assert(doc.message.length > 0 && !doc.message.includes('Ringkasan "'), 'F10 summarize without doc never fabricates');
}

console.log(`\nchatCommandWiring: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
