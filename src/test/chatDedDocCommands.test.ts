/**
 * EZRAB Chat AI — Perintah deterministik DED & AI DOCUMENT (Kelompok 3,
 * 2026-11-17, matriks G #35–#36 + H #37–#38 audit perintah Ezrab AI).
 *
 * Menguji modul mandiri SEBELUM wiring (intentRouter/actionRegistry/view
 * belum disambung koordinator):
 * - A/B: matcher pola (positif tiap intent + non-hijack).
 * - C: navRegistry + routeIntent tidak membajak perintah ini; bila pola
 *   SUDAH ter-wiring, positif routeIntent ikut terverifikasi otomatis.
 * - D/E: holder (sesi DED, sinyal autorun + kedaluwarsa, dokumen aktif,
 *   handoff, baca library localStorage).
 * - F/G: handler dengan ctx stub + holder stub (gerbang, tanpa sesi,
 *   sesi proyek lain, sedang berjalan, headless vs handoff, gate).
 * - H: helper pembersih petunjuk nama + resolusi nama dokumen.
 * - I (2026-11-17, perbaikan susulan draft): builder sesi DED murni
 *   (dedSessionBuilder) + rantai draft → holder → handler → consume
 *   autorun. Efek React (DedAiInputView memanggil onSessionChange;
 *   view induk memanggil setDedSession/clearDedSession) TIDAK bisa
 *   diuji headless dengan tsx — bagian itu hanya terverifikasi via
 *   tsc + baca kode; yang diuji di sini adalah rantai yang BISA
 *   diuji (builder → holder → handler → consume).
 *
 * Tes TIDAK memanggil gateway AI / provider (tanpa panggilan jaringan):
 * callback ringkasan di-stub, DokumenAiService tidak diimpor.
 * Run: npx tsx src/test/chatDedDocCommands.test.ts
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { resolveNavCommand } from '../ai-tools/ezrab-ai/navRegistry';
import {
  cleanDocNameHint,
  handleDedDocCommand,
  matchDedDocPatterns,
  resolveDocByName,
  type DedDocCommandContext,
} from '../ai-tools/ezrab-ai/commands/dedDocCommands';
import {
  DOC_LIBRARY_STORAGE_KEY,
  clearAllDedDocHolderState,
  clearDedSession,
  consumeDedAutorun,
  consumeDocAnalyzeHandoff,
  getActiveDocDescriptor,
  getDedSession,
  getDedSessionDescriptor,
  getDocFromLibrary,
  isDedRunFresh,
  peekDedAutorun,
  peekDocAnalyzeHandoff,
  readDocLibraryFromStorage,
  requestDedAutorun,
  requestDocAnalyzeHandoff,
  setActiveDocDescriptor,
  setDedSession,
  type ActiveDocDescriptor,
  type DedSessionSnapshot,
  type StoredDocRecord,
} from '../ai-tools/ezrab-ai/dedDocSessionHolder';
import {
  buildDedAiSession,
  type DedSessionBuildInput,
} from '../ai-tools/ded-ai-estimate/dedSessionBuilder';
import { policyForMode } from '../ai-tools/ded-ai-estimate/dedMode';
import type { DedAiFileItem } from '../ai-tools/ded-ai-estimate/DedAiInputView';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

/* --- Stub --- */

function fakeSession(over: Partial<DedSessionSnapshot> = {}): DedSessionSnapshot {
  return {
    files: [{ file: { name: 'DED Rumah.pdf', size: 123456 }, id: 'f1' }],
    targetProjectId: 'p1',
    projectName: 'Rumah Tinggal',
    ...over,
  };
}

function fakeDoc(over: Partial<StoredDocRecord> = {}): StoredDocRecord {
  return {
    id: 'd1', fileName: 'Kontrak Kerja.pdf', kind: 'pdf', sizeBytes: 1000,
    text: 'Isi kontrak kerja sama pembangunan rumah tinggal.',
    charCount: 50, status: 'ready', createdAt: 1, updatedAt: 2,
    ...over,
  };
}

function installFakeLocalStorage(initial: Record<string, string>): void {
  const store = new Map(Object.entries(initial));
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}
function uninstallFakeLocalStorage(): void {
  delete (globalThis as Record<string, unknown>).localStorage;
}
function installLibrary(docs: StoredDocRecord[]): void {
  installFakeLocalStorage({ [DOC_LIBRARY_STORAGE_KEY]: JSON.stringify(docs) });
}

function makeCtx(over: Partial<DedDocCommandContext> = {}): {
  ctx: DedDocCommandContext;
  nav: string[];
  summaryCalls: Array<{ id: string; name: string }>;
} {
  const nav: string[] = [];
  const summaryCalls: Array<{ id: string; name: string }> = [];
  const ctx: DedDocCommandContext = {
    navigate: (menu: string) => { nav.push(menu); },
    activeProject: { id: 'p1', name: 'Rumah Tinggal' },
    projects: [
      { id: 'p1', name: 'Rumah Tinggal' },
      { id: 'p2', name: 'Ruko Sudirman' },
    ],
    dedAiAvailable: true,
    docAiAvailable: true,
    requestDocSummary: (id: string, name: string) => { summaryCalls.push({ id, name }); },
    ...over,
  };
  return { ctx, nav, summaryCalls };
}

function reset(): void {
  clearAllDedDocHolderState();
  uninstallFakeLocalStorage();
}

/* --- A. Matcher: pola tiap intent --- */

{
  const m = matchDedDocPatterns('jalankan analisis ded');
  assert(m?.intent === 'RUN_DED_ANALYSIS', 'A1: jalankan analisis ded → RUN_DED_ANALYSIS');
}
{
  const m = matchDedDocPatterns('jalankan analisis DED dari PDF ini');
  assert(m?.intent === 'RUN_DED_ANALYSIS', 'A2: jalankan analisis DED dari PDF ini → RUN_DED_ANALYSIS');
}
{
  const m = matchDedDocPatterns('tolong jalankan analisis ded');
  assert(m?.intent === 'RUN_DED_ANALYSIS', 'A3: tolong jalankan … → RUN_DED_ANALYSIS (wajib sebelum HELP)');
}
{
  assert(matchDedDocPatterns('mulai ded')?.intent === 'RUN_DED_ANALYSIS', 'A4: mulai ded → RUN_DED_ANALYSIS');
  assert(matchDedDocPatterns('analisis ded dari pdf ini')?.intent === 'RUN_DED_ANALYSIS', 'A4: analisis ded dari pdf ini → RUN_DED_ANALYSIS');
  assert(matchDedDocPatterns('ded-nya jalankan')?.intent === 'RUN_DED_ANALYSIS', 'A4: ded-nya jalankan → RUN_DED_ANALYSIS');
  assert(matchDedDocPatterns('ulangi analisis ded')?.intent === 'RUN_DED_ANALYSIS', 'A4: ulangi analisis ded → RUN_DED_ANALYSIS');
  assert(matchDedDocPatterns('jalankan estimasi ded')?.intent === 'RUN_DED_ANALYSIS', 'A4: jalankan estimasi ded → RUN_DED_ANALYSIS');
  assert(matchDedDocPatterns('proses pdf ded ini')?.intent === 'RUN_DED_ANALYSIS', 'A4: proses pdf ded ini → RUN_DED_ANALYSIS');
}
{
  const m = matchDedDocPatterns('ringkas dokumen ini');
  assert(m?.intent === 'SUMMARIZE_DOCUMENT' && m?.param === 'ini', 'A5: ringkas dokumen ini → SUMMARIZE_DOCUMENT + param ini');
}
{
  const m = matchDedDocPatterns('ringkas dokumen');
  assert(m?.intent === 'SUMMARIZE_DOCUMENT' && m?.param === undefined, 'A6: ringkas dokumen → SUMMARIZE_DOCUMENT tanpa param');
}
{
  const m = matchDedDocPatterns('buatkan ringkasan dokumen ini');
  assert(m?.intent === 'SUMMARIZE_DOCUMENT' && m?.param === 'ini', 'A7: buatkan ringkasan dokumen ini → SUMMARIZE_DOCUMENT');
}
{
  const m = matchDedDocPatterns('buat ringkasan dokumen kontrak');
  assert(m?.intent === 'SUMMARIZE_DOCUMENT' && m?.param === 'kontrak', 'A8: buat ringkasan dokumen kontrak → param kontrak');
}
{
  const m = matchDedDocPatterns('ringkas dokumen Kontrak Kerja');
  assert(m?.intent === 'SUMMARIZE_DOCUMENT' && m?.param === 'Kontrak Kerja', 'A9: param nama dokumen menjaga huruf besar/kecil teks asli');
}
{
  assert(matchDedDocPatterns('ringkasan dokumen ini')?.intent === 'SUMMARIZE_DOCUMENT', 'A10: ringkasan dokumen ini (tanpa verba) → SUMMARIZE_DOCUMENT');
  assert(matchDedDocPatterns('tolong ringkas dokumen ini')?.intent === 'SUMMARIZE_DOCUMENT', 'A10: tolong ringkas … → SUMMARIZE_DOCUMENT');
  assert(matchDedDocPatterns('rangkum dokumen ini')?.intent === 'SUMMARIZE_DOCUMENT', 'A10: rangkum dokumen ini → SUMMARIZE_DOCUMENT');
}

/* --- B. Matcher: non-hijack --- */

{
  assert(matchDedDocPatterns('buka ded ai') === null, 'B1: buka ded ai bukan perintah jalankan (tetap OPEN_DED_ESTIMATE)');
  assert(matchDedDocPatterns('apa itu ded') === null, 'B1: apa itu ded bukan perintah jalankan');
  assert(matchDedDocPatterns('jelaskan ded') === null, 'B1: jelaskan ded bukan perintah jalankan');
  assert(matchDedDocPatterns('bagaimana cara menjalankan analisis ded') === null, 'B2: pertanyaan how-to "menjalankan" bukan perintah jalankan');
  assert(matchDedDocPatterns('jalankan analisis') === null, 'B2: jalankan analisis (tanpa ded) bukan perintah DED');
  assert(matchDedDocPatterns('buka ai document') === null, 'B3: buka ai document bukan perintah ringkas');
  assert(matchDedDocPatterns('buat dokumen perjanjian') === null, 'B3: buat dokumen (bukan ringkasan) bukan perintah ringkas');
  assert(matchDedDocPatterns('apa ringkasan dokumen ini') === null, 'B4: apa ringkasan dokumen ini (pertanyaan) bukan perintah ringkas');
  assert(matchDedDocPatterns('ringkasan dokumen ini apa?') === null, 'B4: ringkasan dokumen ini apa? bukan perintah ringkas');
  assert(matchDedDocPatterns('buka dokumen proyek') === null, 'B4: buka dokumen proyek bukan perintah ringkas');
}

/* --- C. Lapisan luar: navRegistry + routeIntent --- */

{
  assert(resolveNavCommand('jalankan analisis ded').mode === 'none', 'C1: navRegistry tidak membajak "jalankan analisis ded"');
  assert(resolveNavCommand('tolong jalankan analisis ded').mode === 'none', 'C1: navRegistry tidak membajak "tolong jalankan analisis ded"');
  assert(resolveNavCommand('ringkas dokumen ini').mode === 'none', 'C2: navRegistry tidak membajak "ringkas dokumen ini"');
  assert(resolveNavCommand('buatkan ringkasan dokumen ini').mode === 'none', 'C2: navRegistry tidak membajak "buatkan ringkasan dokumen ini"');
}
{
  assert(routeIntent('buka ded ai').intent === 'OPEN_DED_ESTIMATE', 'C3: buka ded ai tetap OPEN_DED_ESTIMATE (sebelum & sesudah wiring)');
  assert(routeIntent('buka ai document').intent === 'OPEN_AI_DOCUMENTS', 'C3: buka ai document tetap OPEN_AI_DOCUMENTS');
  assert(routeIntent('apa itu ded').intent !== 'RUN_DED_ANALYSIS', 'C4: apa itu ded tidak pernah menjadi RUN_DED_ANALYSIS');
  assert(routeIntent('buat dokumen perjanjian').intent !== 'SUMMARIZE_DOCUMENT', 'C4: buat dokumen perjanjian tidak pernah menjadi SUMMARIZE_DOCUMENT');
}
// Cek wiring otomatis: bila koordinator SUDAH menempel pola ke PATTERNS,
// positif routeIntent ikut terverifikasi; bila belum, dilewati (bukan gagal).
{
  const dedWired = routeIntent('jalankan analisis ded').intent === 'RUN_DED_ANALYSIS';
  const docWired = routeIntent('ringkas dokumen ini').intent === 'SUMMARIZE_DOCUMENT';
  if (dedWired && docWired) {
    assert(routeIntent('tolong jalankan analisis ded').intent === 'RUN_DED_ANALYSIS', 'C5-wired: tolong jalankan … menang atas HELP');
    assert(routeIntent('ringkas dokumen Kontrak Kerja').param === 'Kontrak Kerja', 'C5-wired: param nama dokumen dari teks asli');
    console.log('  (wiring check: pola Kelompok 3 TERPASANG di PATTERNS — positif terverifikasi)');
  } else {
    console.log('  (wiring check dilewati: pola Kelompok 3 belum ditempel di PATTERNS — koordinator)');
  }
}

/* --- D. Holder DED --- */

reset();
{
  assert(getDedSessionDescriptor() === null, 'D1: holder kosong pada awalnya');
  assert(consumeDedAutorun().ok === false && consumeDedAutorun().reason === 'none', 'D1: tanpa sinyal → consume none');
}
{
  setDedSession(fakeSession(), false, 1000);
  const d = getDedSessionDescriptor();
  assert(d?.fileCount === 1 && d?.fileNames[0] === 'DED Rumah.pdf', 'D2: deskriptor membawa nama + jumlah berkas');
  assert(d?.fingerprint === 'DED Rumah.pdf:123456', 'D2: sidik jari = nama:ukuran');
  assert(d?.projectId === 'p1' && d?.projectName === 'Rumah Tinggal', 'D2: deskriptor membawa proyek target');
  assert(d?.running === false && d?.runningSince === null, 'D2: tidak running → runningSince null');
}
{
  // running + kebasian penanda
  setDedSession(fakeSession(), true, 2000);
  const d = getDedSessionDescriptor();
  assert(d?.running === true && d?.runningSince === 2000, 'D3: running=true mencatat runningSince');
  assert(isDedRunFresh(d, 2000 + 60_000), 'D3: running segar dalam 15 menit');
  assert(!isDedRunFresh(d, 2000 + 16 * 60_000), 'D3: running basi sesudah 15 menit tanpa pembaruan');
  setDedSession(fakeSession(), false, 3000);
  assert(getDedSessionDescriptor()?.running === false, 'D3: running=false membersihkan penanda');
  assert(getDedSessionDescriptor()?.runningSince === null, 'D3: running=false membersihkan runningSince');
}
{
  // autorun: pasang → konsumsi sukses sekali-pakai
  const fp = getDedSessionDescriptor()!.fingerprint;
  requestDedAutorun(fp, 'p1', 5000);
  assert(peekDedAutorun()?.fingerprint === fp, 'D4: sinyal autorun terpasang dengan sidik jari sesi');
  const res = consumeDedAutorun(6000);
  assert(res.ok === true, 'D4: consume sinyal valid → ok');
  if (res.ok) {
    assert(res.session.files[0].file.name === 'DED Rumah.pdf', 'D4: consume mengembalikan sesi utuh (dengan berkas)');
    assert(res.descriptor.fileCount === 1, 'D4: consume mengembalikan deskriptor');
  }
  assert(consumeDedAutorun(7000).reason === 'none', 'D4: sinyal sekali-pakai — consume kedua → none');
}
{
  // kedaluwarsa 60 detik
  requestDedAutorun(getDedSessionDescriptor()!.fingerprint, 'p1', 10000);
  const res = consumeDedAutorun(10000 + 61_000);
  assert(!res.ok && res.reason === 'expired', 'D5: sinyal kedaluwarsa sesudah 60 detik');
}
{
  // mismatch sidik jari (berkas berubah sejak perintah)
  requestDedAutorun('DED Lain.pdf:999', 'p1', 20000);
  const res = consumeDedAutorun(21000);
  assert(!res.ok && res.reason === 'mismatch', 'D6: sidik jari beda → mismatch, tidak boleh jalan');
}
{
  // tanpa berkas → no-files
  setDedSession(fakeSession({ files: [] }), false, 30000);
  requestDedAutorun('', 'p1', 30000);
  const res = consumeDedAutorun(31000);
  assert(!res.ok && res.reason === 'no-files', 'D7: sesi tanpa berkas → no-files');
  clearDedSession();
  assert(getDedSessionDescriptor() === null, 'D7: clearDedSession mengosongkan holder');
}

/* --- E. Holder AI DOCUMENT --- */

reset();
{
  assert(getActiveDocDescriptor() === null, 'E1: tidak ada dokumen aktif pada awalnya');
  const desc: ActiveDocDescriptor = { id: 'd1', fileName: 'Kontrak Kerja.pdf', status: 'ready', charCount: 50, updatedAt: 5 };
  setActiveDocDescriptor(desc);
  assert(getActiveDocDescriptor()?.fileName === 'Kontrak Kerja.pdf', 'E1: deskriptor dokumen aktif tersimpan');
  setActiveDocDescriptor(null);
  assert(getActiveDocDescriptor() === null, 'E1: dokumen aktif bisa dibersihkan');
}
{
  assert(consumeDocAnalyzeHandoff() === null, 'E2: tanpa handoff → null');
  requestDocAnalyzeHandoff('d1', 'Kontrak Kerja.pdf', 1000);
  assert(peekDocAnalyzeHandoff()?.docId === 'd1', 'E2: sinyal handoff terpasang');
  const h = consumeDocAnalyzeHandoff(2000);
  assert(h?.docId === 'd1' && h?.tab === 'summary', 'E2: consume handoff mengembalikan docId + tab summary');
  assert(consumeDocAnalyzeHandoff(3000) === null, 'E2: handoff sekali-pakai');
  requestDocAnalyzeHandoff('d1', 'Kontrak Kerja.pdf', 4000);
  assert(consumeDocAnalyzeHandoff(4000 + 61_000) === null, 'E2: handoff kedaluwarsa sesudah 60 detik');
}
{
  // baca library: tanpa localStorage → []
  uninstallFakeLocalStorage();
  assert(readDocLibraryFromStorage().length === 0, 'E3: tanpa localStorage → library kosong');
  // JSON rusak / bukan array → []
  installFakeLocalStorage({ [DOC_LIBRARY_STORAGE_KEY]: '{bukan json' });
  assert(readDocLibraryFromStorage().length === 0, 'E3: JSON rusak → library kosong');
  installFakeLocalStorage({ [DOC_LIBRARY_STORAGE_KEY]: JSON.stringify({ a: 1 }) });
  assert(readDocLibraryFromStorage().length === 0, 'E3: bukan array → library kosong');
  // record tak valid dilewati; yang valid terbaca
  installLibrary([
    fakeDoc(),
    fakeDoc({ id: 'd2', fileName: 'RAB 2026.xlsx', kind: 'xlsx', text: 'angka rab', charCount: 9 }),
    { id: 'rusak' } as unknown as StoredDocRecord,
  ]);
  const lib = readDocLibraryFromStorage();
  assert(lib.length === 2, 'E3: 2 record valid terbaca, 1 record rusak dilewati');
  assert(getDocFromLibrary('d2')?.fileName === 'RAB 2026.xlsx', 'E3: getDocFromLibrary menemukan berdasarkan id');
  assert(getDocFromLibrary('tidak-ada') === null, 'E3: id tak dikenal → null');
}

/* --- F. Handler DED --- */

reset();
{
  // F1: tanpa sesi → pesan jujur + tombol, TANPA navigasi & sinyal
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(res !== null && res.message.includes('Belum ada sesi DED'), 'F1: tanpa sesi → pesan jujur belum ada sesi');
  assert(!(res?.message ?? '').includes('pindah menu'), 'F1: klaim lama "unggahan hilang saat pindah menu" SUDAH TIDAK ADA — draft kini bertahan di holder melewati navigasi menu');
  assert((res?.message ?? '').includes('upload PDF'), 'F1: pesan mengarahkan upload PDF di DED');
  assert(nav.length === 0, 'F1: tanpa sesi → tidak auto-navigasi');
  assert(peekDedAutorun() === null, 'F1: tanpa sesi → sinyal tidak dipasang');
  assert(res?.actions?.[0]?.action.kind === 'navigate' && (res?.actions?.[0]?.action as { menu: string }).menu === 'ded-ai', 'F1: tombol navigasi ke DED AI ditawarkan');
}
{
  // F2: gerbang menolak (Free) → pesan gate apa adanya
  const { ctx } = makeCtx({ dedAiAvailable: false, dedAiLockedMessage: 'DED AI tidak tersedia untuk paket Free (Gratis).' });
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('tidak tersedia untuk paket Free'), 'F2: gate menolak → pesan gate apa adanya');
  assert(peekDedAutorun() === null, 'F2: gate menolak → sinyal tidak dipasang');
}
{
  // F3: gerbang tak diketahui → fail-closed
  const { ctx } = makeCtx({ dedAiAvailable: undefined });
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum bisa memastikan'), 'F3: gate tak diketahui → fail-closed, bukan autorun buta');
}
{
  // F4: ada sesi → sinyal terpasang + navigasi + pesan menyebut berkas
  setDedSession(fakeSession(), false);
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(peekDedAutorun()?.fingerprint === 'DED Rumah.pdf:123456', 'F4: ada sesi → sinyal autorun terpasang');
  assert(nav.length === 1 && nav[0] === 'ded-ai', 'F4: ada sesi → navigasi ke ded-ai');
  assert(res?.navigated === true && (res?.message ?? '').includes('DED Rumah.pdf'), 'F4: pesan menyebut berkas yang dijalankan');
  assert((res?.message ?? '').includes('pengaturan terakhir'), 'F4: pesan jujur memakai pengaturan terakhir sesi');
  reset();
}
{
  // F5: sesi untuk proyek lain → jujur menyebut kedua proyek
  setDedSession(fakeSession({ targetProjectId: 'p2' }), false);
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert((res?.message ?? '').includes('Ruko Sudirman') && (res?.message ?? '').includes('Rumah Tinggal'), 'F5: sesi proyek lain → pesan menyebut proyek sesi + proyek aktif');
  assert(peekDedAutorun() === null && nav.length === 0, 'F5: sesi proyek lain → tidak ada sinyal & navigasi');
  reset();
}
{
  // F6: analisis sedang berjalan (segar) → tidak menjalankan kedua
  setDedSession(fakeSession(), true, Date.now());
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert((res?.message ?? '').includes('masih berjalan'), 'F6: sedang berjalan → pesan jujur masih berjalan');
  assert(peekDedAutorun() === null && nav.length === 0, 'F6: sedang berjalan → tidak ada sinyal & navigasi');
  reset();
}
{
  // F7: penanda running basi (>15 menit) → boleh jalan lagi
  setDedSession(fakeSession(), true, Date.now() - 16 * 60_000);
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(peekDedAutorun() !== null && nav[0] === 'ded-ai', 'F7: running basi → dianggap selesai, autorun dipasang');
  assert(res?.navigated === true, 'F7: running basi → navigasi jalan');
  reset();
}
{
  // F8: intent lain → null (bukan milik kelompok ini)
  const { ctx } = makeCtx();
  assert(handleDedDocCommand('RENAME_PROJECT', 'X', ctx) === null, 'F8: intent lain → null');
  assert(handleDedDocCommand('UNKNOWN', undefined, ctx) === null, 'F8: UNKNOWN → null');
}

/* --- G. Handler AI DOCUMENT --- */

reset();
{
  // G1: gerbang menolak (Free/Starter) → pesan gate apa adanya
  const { ctx, summaryCalls } = makeCtx({ docAiAvailable: false, docAiLockedMessage: 'AI Document tidak tersedia untuk paket Starter.' });
  setActiveDocDescriptor({ id: 'd1', fileName: 'Kontrak Kerja.pdf', status: 'ready', charCount: 50, updatedAt: 5 });
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('tidak tersedia untuk paket Starter'), 'G1: gate menolak → pesan gate apa adanya');
  assert(summaryCalls.length === 0, 'G1: gate menolak → callback tidak dipanggil');
  reset();
}
{
  // G2: gerbang tak diketahui → fail-closed
  const { ctx } = makeCtx({ docAiAvailable: undefined });
  setActiveDocDescriptor({ id: 'd1', fileName: 'Kontrak Kerja.pdf', status: 'ready', charCount: 50, updatedAt: 5 });
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum bisa memastikan'), 'G2: gate tak diketahui → fail-closed');
  reset();
}
{
  // G3: tanpa dokumen aktif + library kosong → jujur + tombol
  installLibrary([]);
  const { ctx, nav, summaryCalls } = makeCtx();
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert((res?.message ?? '').includes('Belum ada dokumen'), 'G3: tanpa dokumen → pesan jujur belum ada dokumen');
  assert(summaryCalls.length === 0 && nav.length === 0, 'G3: tanpa dokumen → tidak ada callback & navigasi');
  assert((res?.actions?.[0]?.action as { menu?: string }).menu === 'dokumen-ai', 'G3: tombol navigasi ke AI Document ditawarkan');
  reset();
}
{
  // G4: dokumen aktif + callback → headless dipicu, hasil TIDAK diklaim
  setActiveDocDescriptor({ id: 'd1', fileName: 'Kontrak Kerja.pdf', status: 'ready', charCount: 50, updatedAt: 5 });
  const { ctx, nav, summaryCalls } = makeCtx();
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert(summaryCalls.length === 1 && summaryCalls[0].id === 'd1' && summaryCalls[0].name === 'Kontrak Kerja.pdf', 'G4: headless → callback dipanggil dengan id + nama dokumen');
  assert((res?.message ?? '').includes('Memproses ringkasan'), 'G4: pesan "memproses…" — hasil tidak diklaim sebelum ada');
  assert((res?.message ?? '').includes('akan muncul di chat ini'), 'G4: pesan menjelaskan hasil muncul belakangan di chat');
  assert(nav.length === 0 && res?.navigated !== true, 'G4: headless → tidak navigasi (hasil datang ke chat)');
  assert(!((res?.message ?? '').includes('berhasil') || (res?.message ?? '').includes('Ringkasan selesai')), 'G4: tidak ada klaim berhasil/selesai ("setelah selesai" adalah klausa waktu, bukan klaim)');
  reset();
}
{
  // G5: dokumen aktif TANPA callback → handoff (navigasi + sinyal)
  setActiveDocDescriptor({ id: 'd1', fileName: 'Kontrak Kerja.pdf', status: 'ready', charCount: 50, updatedAt: 5 });
  const { ctx, nav } = makeCtx({ requestDocSummary: undefined });
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert(peekDocAnalyzeHandoff()?.docId === 'd1', 'G5: tanpa callback → sinyal handoff terpasang');
  assert(nav[0] === 'dokumen-ai' && res?.navigated === true, 'G5: tanpa callback → navigasi ke dokumen-ai');
  assert((res?.message ?? '').includes('tab Ringkasan') && (res?.message ?? '').includes('klik tombol analisis'), 'G5: pesan jujur — ringkasan belum berjalan, pengguna menekan tombol di sana');
  reset();
}
{
  // G6: nama dokumen disebut → resolusi nama di library
  installLibrary([
    fakeDoc(),
    fakeDoc({ id: 'd2', fileName: 'RAB 2026.xlsx', kind: 'xlsx', text: 'angka rab', charCount: 9 }),
  ]);
  const { ctx, summaryCalls } = makeCtx();
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'kontrak', ctx);
  assert(summaryCalls.length === 1 && summaryCalls[0].id === 'd1', 'G6: nama "kontrak" → dokumen yang cocok diringkas');
  assert((res?.message ?? '').includes('Kontrak Kerja.pdf'), 'G6: pesan menyebut dokumen yang dipilih');
  reset();
}
{
  // G7: nama ambigu → daftar kecocokan, tanpa eksekusi
  installLibrary([
    fakeDoc(),
    fakeDoc({ id: 'd2', fileName: 'Kontrak Material.pdf', text: 'kontrak material', charCount: 16 }),
  ]);
  const { ctx, summaryCalls } = makeCtx();
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'kontrak', ctx);
  assert((res?.message ?? '').includes('beberapa dokumen'), 'G7: nama ambigu → pesan jujur beberapa dokumen cocok');
  assert(summaryCalls.length === 0, 'G7: nama ambigu → tidak ada dokumen yang diringkas');
  reset();
}
{
  // G8: nama tak ditemukan → jujur
  installLibrary([fakeDoc()]);
  const { ctx, summaryCalls } = makeCtx();
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'sertifikat', ctx);
  assert((res?.message ?? '').includes('Tidak menemukan dokumen bernama "sertifikat"'), 'G8: nama tak ditemukan → pesan jujur menyebut nama yang dicari');
  assert(summaryCalls.length === 0, 'G8: nama tak ditemukan → tidak ada callback');
  reset();
}
{
  // G9/G10: status belum siap → jujur per status
  setActiveDocDescriptor({ id: 'd1', fileName: 'Scan.pdf', status: 'failed', charCount: 0, updatedAt: 5 });
  const g9 = makeCtx();
  const r9 = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', g9.ctx);
  assert((r9?.message ?? '').includes('gagal diproses'), 'G9: dokumen gagal → pesan jujur gagal diproses');
  assert(g9.summaryCalls.length === 0, 'G9: dokumen gagal → callback tidak dipanggil');
  reset();
  setActiveDocDescriptor({ id: 'd1', fileName: 'Besar.pdf', status: 'processing', charCount: 10, updatedAt: 5 });
  const g10 = makeCtx();
  const r10 = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', g10.ctx);
  assert((r10?.message ?? '').includes('masih diproses'), 'G10: dokumen diproses → pesan jujur masih diproses');
  assert(g10.summaryCalls.length === 0, 'G10: dokumen diproses → callback tidak dipanggil');
  reset();
}
{
  // G11: tanpa dokumen aktif + SATU dokumen di library → dipakai (tak ambigu)
  installLibrary([fakeDoc()]);
  const { ctx, summaryCalls } = makeCtx();
  handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert(summaryCalls.length === 1 && summaryCalls[0].id === 'd1', 'G11: satu-satunya dokumen di library dipakai saat tidak ada yang aktif');
  reset();
}
{
  // G12: tanpa dokumen aktif + BANYAK dokumen → minta buka dulu
  installLibrary([fakeDoc(), fakeDoc({ id: 'd2', fileName: 'RAB 2026.xlsx', kind: 'xlsx', text: 'x', charCount: 1 })]);
  const { ctx, summaryCalls } = makeCtx();
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert((res?.message ?? '').includes('Ada 2 dokumen'), 'G12: banyak dokumen tanpa yang aktif → pesan menyebut jumlahnya');
  assert(summaryCalls.length === 0, 'G12: banyak dokumen tanpa yang aktif → tidak menebak dokumen');
  reset();
}
{
  // G13: dokumen tanpa teks (charCount 0) → jujur
  setActiveDocDescriptor({ id: 'd1', fileName: 'Scan Kosong.pdf', status: 'ready', charCount: 0, updatedAt: 5 });
  const { ctx, summaryCalls } = makeCtx();
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert((res?.message ?? '').includes('tidak punya teks'), 'G13: dokumen tanpa teks → pesan jujur tidak punya teks');
  assert(summaryCalls.length === 0, 'G13: dokumen tanpa teks → callback tidak dipanggil');
  reset();
}
{
  // G14: callback melempar → gagal jujur + tombol, tanpa klaim
  setActiveDocDescriptor({ id: 'd1', fileName: 'Kontrak Kerja.pdf', status: 'ready', charCount: 50, updatedAt: 5 });
  const { ctx } = makeCtx({
    requestDocSummary: () => { throw new Error('layanan sibuk'); },
  });
  const res = handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('gagal dimulai'), 'G14: callback melempar → pesan gagal dimulai');
  reset();
}
{
  // G15: petunjuk "ini dong" → dokumen aktif (bukan nama "dong")
  setActiveDocDescriptor({ id: 'd1', fileName: 'Kontrak Kerja.pdf', status: 'ready', charCount: 50, updatedAt: 5 });
  const m = makeCtx();
  handleDedDocCommand('SUMMARIZE_DOCUMENT', 'ini dong', m.ctx);
  assert(m.summaryCalls.length === 1 && m.summaryCalls[0].id === 'd1', 'G15: "ini dong" → dokumen aktif, bukan pencarian nama');
  reset();
}

/* --- H. Helper --- */

{
  assert(cleanDocNameHint(undefined) === '', 'H1: petunjuk kosong → kosong');
  assert(cleanDocNameHint('ini') === '', 'H1: "ini" → kosong (dokumen aktif)');
  assert(cleanDocNameHint('ini dong') === '', 'H1: "ini dong" → kosong');
  assert(cleanDocNameHint('kontrak ini') === 'kontrak', 'H1: "kontrak ini" → kontrak');
  assert(cleanDocNameHint('Kontrak Kerja.') === 'kontrak kerja', 'H1: huruf + titik dibersihkan');
  assert(cleanDocNameHint('kontrak kerja') === 'kontrak kerja', 'H1: nama biasa dipertahankan');
}
{
  const lib = [
    fakeDoc(),
    fakeDoc({ id: 'd2', fileName: 'Kontrak Material.pdf', text: 'x', charCount: 1 }),
    fakeDoc({ id: 'd3', fileName: 'RAB 2026.xlsx', kind: 'xlsx', text: 'x', charCount: 1 }),
  ];
  const exact = resolveDocByName(lib, 'kontrak kerja');
  assert(exact.kind === 'found' && exact.doc.id === 'd1', 'H2: kecocokan persis nama dasar menang');
  const sub = resolveDocByName(lib, 'rab');
  assert(sub.kind === 'found' && sub.doc.id === 'd3', 'H2: substring tunggal → ditemukan');
  const amb = resolveDocByName(lib, 'kontrak');
  assert(amb.kind === 'ambiguous' && amb.matches.length === 2, 'H2: substring ganda → ambigu dengan 2 kecocokan');
  assert(resolveDocByName(lib, 'sertifikat').kind === 'not-found', 'H2: tidak ada → not-found');
  assert(resolveDocByName(lib, '').kind === 'not-found', 'H2: petunjuk kosong → not-found');
}

/* --- I. Draft DED: builder sesi + publish holder + autorun (2026-11-17) --- */

function fakeDraftFile(name = 'DED Rumah.pdf', size = 123456, id = 'f1'): DedAiFileItem {
  return { file: { name, size } as unknown as File, id };
}

function draftInput(over: Partial<DedSessionBuildInput> = {}): DedSessionBuildInput {
  return {
    files: [fakeDraftFile()],
    description: '  Rumah 2 lantai  ',
    projectName: '',
    projectType: 'BANGUNAN',
    mode: 'FAST',
    dedMode: 'EZRAB_AI',
    useExisting: false,
    targetProjectId: null,
    projects: [
      { id: 'p1', name: 'Rumah Tinggal' },
      { id: 'p2', name: 'Ruko Sudirman' },
    ],
    complexity: 'simple',
    complexityLabel: 'Sederhana',
    creditTarget: 500,
    scopeKind: 'ALL',
    scopeSpec: '',
    fileProbes: { f1: { pages: 32 } },
    outputPrefs: { detailRab: true, volume: true, priceAnalysis: true, unresolvedReport: true },
    ...over,
  };
}

{
  // I1: derivasi nama — ketikan > proyek existing > nama berkas > ''
  assert(buildDedAiSession(draftInput({ projectName: '  Rumah Impian  ' })).projectName === 'Rumah Impian', 'I1: nama ketikan menang (di-trim)');
  assert(buildDedAiSession(draftInput({ useExisting: true, targetProjectId: 'p2' })).projectName === 'Ruko Sudirman', 'I1: tanpa ketikan + proyek existing → nama proyek itu');
  assert(buildDedAiSession(draftInput({ useExisting: true, targetProjectId: 'pX' })).projectName === 'DED Rumah', 'I1: proyek existing tak ditemukan → jatuh ke nama berkas');
  assert(buildDedAiSession(draftInput()).projectName === 'DED Rumah', 'I1: tanpa nama & tanpa proyek → nama berkas tanpa .pdf');
  assert(buildDedAiSession(draftInput({ files: [] })).projectName === '', 'I1: tanpa berkas → nama kosong (bukan crash)');
}
{
  // I2: targetProjectId hanya bila simpan ke proyek existing
  assert(buildDedAiSession(draftInput({ useExisting: false, targetProjectId: 'p1' })).targetProjectId === null, 'I2: proyek baru → targetProjectId null meski ada pilihan tersimpan');
  assert(buildDedAiSession(draftInput({ useExisting: true, targetProjectId: 'p2' })).targetProjectId === 'p2', 'I2: proyek existing → targetProjectId dipakai');
}
{
  // I3: cakupan halaman — SELECTED di-trim, ALL tanpa spec
  const sel = buildDedAiSession(draftInput({ scopeKind: 'SELECTED', scopeSpec: ' 1-5, 8 ' }));
  assert(sel.pageScope?.kind === 'SELECTED' && (sel.pageScope as { spec: string }).spec === '1-5, 8', 'I3: cakupan SELECTED memakai spec yang di-trim');
  assert(buildDedAiSession(draftInput()).pageScope?.kind === 'ALL', 'I3: default → cakupan ALL');
}
{
  // I4: filePageCounts hanya dari berkas terprobe (error/belum probe dilewati)
  const s = buildDedAiSession(draftInput({
    files: [fakeDraftFile('A.pdf', 100, 'f1'), fakeDraftFile('B.pdf', 200, 'f2'), fakeDraftFile('C.pdf', 300, 'f3')],
    fileProbes: { f1: { pages: 32 }, f2: 'error' },
  }));
  assert(s.filePageCounts?.f1 === 32 && s.filePageCounts?.f2 === undefined && s.filePageCounts?.f3 === undefined, 'I4: hanya berkas terprobe masuk filePageCounts');
}
{
  // I5: policy/fullAi DITURUNKAN dari dedMode (bukan diisi manual)
  const ez = buildDedAiSession(draftInput({ dedMode: 'EZRAB_AI' }));
  assert(ez.dedMode === 'EZRAB_AI' && ez.policy === policyForMode('EZRAB_AI') && ez.fullAi === false, 'I5: EZRAB_AI → policy DATABASE + fullAi false');
  const full = buildDedAiSession(draftInput({ dedMode: 'FULL_AI' }));
  assert(full.dedMode === 'FULL_AI' && full.policy === policyForMode('FULL_AI') && full.fullAi === true, 'I5: FULL_AI → policy FULL_AI + fullAi true');
}
{
  // I6: field lain diteruskan apa adanya (deskripsi di-trim)
  const prefs = { detailRab: false, volume: true, priceAnalysis: false, unresolvedReport: true };
  const s = buildDedAiSession(draftInput({ complexity: 'medium', complexityLabel: 'Menengah', creditTarget: 750, outputPrefs: prefs }));
  assert(s.description === 'Rumah 2 lantai', 'I6: deskripsi di-trim');
  assert(s.creditEstimate?.category === 'Menengah' && s.creditEstimate?.credits === 750, 'I6: creditEstimate memakai label + target kategori');
  assert(s.complexity === 'medium' && s.outputPrefs === prefs, 'I6: kompleksitas mentah + outputPrefs diteruskan');
  assert(s.files.length === 1 && s.files[0].file.name === 'DED Rumah.pdf', 'I6: berkas valid diteruskan ke sesi');
}
reset();
{
  // I7 (uji c): RUN_DED_ANALYSIS menemukan sesi DRAFT dan meminta autorun.
  // setDedSession(draft, false) = persis yang dilakukan handler induk
  // handleDedSessionChange saat menerima draft dari DedAiInputView.
  const draft = buildDedAiSession(draftInput());
  setDedSession(draft, false);
  const d = getDedSessionDescriptor();
  assert(d?.fileCount === 1 && d?.fileNames[0] === 'DED Rumah.pdf', 'I7: draft terpublikasi — deskriptor membawa berkas draft');
  assert(d?.fingerprint === 'DED Rumah.pdf:123456', 'I7: sidik jari draft dari berkasnya');
  assert(d?.running === false && !isDedRunFresh(d), 'I7: draft tidak running — gerbang "sedang berjalan" tidak terpicu');
  assert(getDedSession()?.files[0].file.name === 'DED Rumah.pdf', 'I7: holder menyimpan sesi draft utuh (dengan berkas)');
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(peekDedAutorun()?.fingerprint === 'DED Rumah.pdf:123456', 'I7: draft ditemukan → sinyal autorun terpasang');
  assert(nav.length === 1 && nav[0] === 'ded-ai' && res?.navigated === true, 'I7: draft ditemukan → navigasi ke ded-ai');
  assert((res?.message ?? '').includes('DED Rumah.pdf'), 'I7: pesan menyebut berkas draft yang dijalankan');
  // Konsumsi mount (view): draft diperlakukan sebagai sesi baru yang sah.
  const consumed = consumeDedAutorun();
  assert(consumed.ok === true, 'I7: consume sinyal draft → ok');
  if (consumed.ok) {
    assert(consumed.session.files[0].file.name === 'DED Rumah.pdf', 'I7: consume mengembalikan sesi draft utuh');
    assert(consumed.descriptor.fileCount === 1, 'I7: consume mengembalikan deskriptor draft');
  }
  reset();
}
{
  // I8 (uji b): berkas dihapus → holder dikosongkan (publish null).
  setDedSession(buildDedAiSession(draftInput()), false);
  assert(getDedSessionDescriptor()?.fileCount === 1, 'I8: pra-kondisi — draft ada di holder');
  // setDedSession(null) = persis yang dilakukan handleDedSessionChange
  // saat menerima null (draft kosong sesudah berkas terakhir dihapus).
  setDedSession(null, false);
  assert(getDedSessionDescriptor() === null && getDedSession() === null, 'I8: publish null → holder kosong');
  clearDedSession();
  assert(getDedSessionDescriptor() === null, 'I8: clearDedSession idempotent pada holder kosong');
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert((res?.message ?? '').includes('Belum ada sesi DED'), 'I8: sesudah berkas dihapus → pesan jujur belum ada sesi');
  assert(peekDedAutorun() === null && nav.length === 0, 'I8: sesudah berkas dihapus → tanpa sinyal & navigasi');
  reset();
}
{
  // I9 (uji d): tanpa sesi apa pun → pesan jujur tanpa autorun.
  const { ctx, nav } = makeCtx();
  const res = handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(res !== null && res.message.includes('Belum ada sesi DED'), 'I9: tanpa sesi → pesan jujur belum ada sesi');
  assert(!(res?.message ?? '').includes('pindah menu'), 'I9: tanpa klaim "unggahan hilang saat pindah menu" (sudah tidak benar)');
  assert(res?.actions?.[0]?.action.kind === 'navigate' && (res?.actions?.[0]?.action as { menu: string }).menu === 'ded-ai', 'I9: tombol navigasi ke DED AI ditawarkan');
  assert(peekDedAutorun() === null && nav.length === 0, 'I9: tanpa sesi → sinyal tidak dipasang, tidak auto-navigasi');
  reset();
}
{
  // I10: draft berubah sesudah sinyal dipasang → mismatch (view tidak
  // boleh menjalankan analisis pada berkas yang berbeda dari perintah).
  setDedSession(buildDedAiSession(draftInput()), false);
  const { ctx } = makeCtx();
  handleDedDocCommand('RUN_DED_ANALYSIS', undefined, ctx);
  assert(peekDedAutorun()?.fingerprint === 'DED Rumah.pdf:123456', 'I10: pra-kondisi — sinyal terpasang untuk draft v1');
  // Pengguna mengganti berkas di menu DED sebelum mount mengonsumsi.
  setDedSession(buildDedAiSession(draftInput({ files: [fakeDraftFile('DED Baru.pdf', 999, 'f9')], fileProbes: { f9: { pages: 5 } } })), false);
  const res = consumeDedAutorun();
  assert(!res.ok && res.reason === 'mismatch', 'I10: berkas berubah sejak perintah → mismatch, tidak boleh jalan');
  assert(consumeDedAutorun().reason === 'none', 'I10: sinyal sekali-pakai — consume kedua → none');
  reset();
}

reset();
console.log(`chatDedDocCommands: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
