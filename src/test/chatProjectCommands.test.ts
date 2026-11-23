/**
 * EZRAB Chat AI — Perintah deterministik proyek (Kelompok 1, 2026-11-17,
 * matriks A #2–#5 + gap P12 audit perintah Ezrab AI).
 * CREATE_PROJECT / DELETE_PROJECT (dua langkah + konfirmasi tombol) /
 * ARCHIVE_PROJECT / DUPLICATE_PROJECT — dijawab lapisan deterministik
 * tanpa LLM, tanpa kredit. Modul diuji mandiri (belum ter-wiring ke
 * intentRouter/actionRegistry/view); pola diuji lewat
 * matchProjectCommand (cermin routeIntent: deteksi pada teks
 * ternormalisasi, param dari teks asli).
 * Run: npx tsx src/test/chatProjectCommands.test.ts
 */
import {
  PROJECT_PATTERNS,
  PROJECT_COMMAND_INTENTS,
  matchProjectCommand,
  cleanProjectTarget,
  resolveProjectTarget,
  buildDeleteConfirmActions,
  handleProjectCommand,
  PROJECT_MAX_NAME_LENGTH,
  type ProjectCommandContext,
} from '../ai-tools/ezrab-ai/commands/projectCommands';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

const PROJECTS = [
  { id: 'p1', name: 'Rumah Tinggal 2 Lantai' },
  { id: 'p2', name: 'Rumah Impian' },
  { id: 'p3', name: 'Villa Samudra' },
];

function makeCtx(over: Partial<ProjectCommandContext> = {}): {
  ctx: ProjectCommandContext;
  calls: { create: string[]; del: string[]; arch: string[]; dup: string[]; nav: string[] };
  succeed: { v: boolean };
} {
  const calls = { create: [] as string[], del: [] as string[], arch: [] as string[], dup: [] as string[], nav: [] as string[] };
  const succeed = { v: true };
  const ctx: ProjectCommandContext = {
    activeProject: { id: 'p1', name: 'Rumah Tinggal 2 Lantai' },
    projects: [...PROJECTS],
    navigate: (menu: string) => { calls.nav.push(menu); },
    createProject: (name: string) => { calls.create.push(name); return succeed.v ? { id: 'p-new', name } : null; },
    deleteProject: (id: string) => { calls.del.push(id); return succeed.v; },
    archiveProject: (id: string) => { calls.arch.push(id); return succeed.v; },
    duplicateProject: (id: string) => {
      calls.dup.push(id);
      if (!succeed.v) return null;
      const src = PROJECTS.find((p) => p.id === id);
      return src ? { id: 'p-copy', name: `${src.name} (Salinan Draft)` } : null;
    },
    ...over,
  };
  return { ctx, calls, succeed };
}

/* --- A. Pola CREATE_PROJECT --- */

{
  const r = matchProjectCommand('buat proyek Rumah Impian');
  assert(r?.intent === 'CREATE_PROJECT' && r?.param === 'Rumah Impian', 'A1: buat proyek + nama → CREATE_PROJECT, param verbatim');
}
{
  const r = matchProjectCommand('buatkan proyek rumah 2 lantai');
  assert(r?.intent === 'CREATE_PROJECT' && r?.param === 'rumah 2 lantai', 'A2: buatkan proyek … → CREATE_PROJECT');
}
{
  const r = matchProjectCommand('buat proyek baru Rumah Impian');
  assert(r?.intent === 'CREATE_PROJECT' && r?.param === 'Rumah Impian', 'A3: "baru" di depan nama dikonsumsi, bukan nama');
}
{
  assert(matchProjectCommand('buat proyek baru') === null, 'A4: "buat proyek baru" → TIDAK cocok (jatuh ke OPEN_PROJECT_CREATE)');
}
{
  assert(matchProjectCommand('buat proyek') === null, 'A5: "buat proyek" tanpa nama → TIDAK cocok');
}
{
  assert(matchProjectCommand('buatkan RAB rumah 2 lantai') === null, 'A6: "buatkan RAB rumah 2 lantai" → BUKAN CREATE_PROJECT (tanpa kata proyek)');
}
{
  assert(matchProjectCommand('buatkan rab rumah type 70') === null, 'A7: rab rumah type 70 → BUKAN CREATE_PROJECT');
}
{
  assert(matchProjectCommand('tambah proyek baru') === null, 'A8: "tambah proyek baru" → TIDAK cocok (OPEN_PROJECT_CREATE)');
}
{
  const r = matchProjectCommand('bikin proyek Villa Teduh');
  assert(r?.intent === 'CREATE_PROJECT' && r?.param === 'Villa Teduh', 'A9: bikin proyek … → CREATE_PROJECT');
}

/* --- A10–A15. Penjaga anti-"rab" (Phase 2, 2026-11-23): permintaan RAB
 * yang mengandung kata "proyek" TIDAK BOLEH cocok CREATE_PROJECT — pola
 * lama membajaknya (regresi c96881c; P5A-01/03/06/24). --- */
{
  assert(matchProjectCommand('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta') === null, 'A10: RAB proyek 2 gedung → BUKAN CREATE_PROJECT');
}
{
  assert(matchProjectCommand('Buatkan RAB proyek kandang sapi 17 x 9 m') === null, 'A11: RAB proyek kandang → BUKAN CREATE_PROJECT');
}
{
  assert(matchProjectCommand('Buatkan RAB untuk proyek gedung kantor 3 lantai') === null, 'A12: RAB untuk proyek gedung → BUKAN CREATE_PROJECT');
}
{
  assert(matchProjectCommand('Buatkan RAB proyek renovasi dapur') === null, 'A13: RAB proyek renovasi → BUKAN CREATE_PROJECT');
}
{
  assert(matchProjectCommand('Buatkan RAB jalan beton 500 m proyek desa') === null, 'A14: RAB jalan … proyek desa → BUKAN CREATE_PROJECT');
}
{
  // Batas penjaga: "rab" SESUDAH "proyek" adalah bagian nama proyek.
  const r = matchProjectCommand('buat proyek RAB Gedung');
  assert(r?.intent === 'CREATE_PROJECT' && r?.param === 'RAB Gedung', 'A15: "rab" sesudah "proyek" = nama → CREATE_PROJECT');
}

/* --- B. Pola DELETE_PROJECT (+ non-hijack) --- */

{
  const r = matchProjectCommand('hapus proyek ini');
  assert(r?.intent === 'DELETE_PROJECT' && r?.param === 'ini', 'B1: hapus proyek ini → DELETE_PROJECT, param ini');
}
{
  const r = matchProjectCommand('hapus proyek Rumah Impian');
  assert(r?.intent === 'DELETE_PROJECT' && r?.param === 'Rumah Impian', 'B2: hapus proyek + nama → DELETE_PROJECT');
}
{
  const r = matchProjectCommand('tolong hapus proyek ini');
  assert(r?.intent === 'DELETE_PROJECT' && r?.param === 'ini', 'B3: tolong hapus proyek ini → DELETE_PROJECT');
}
{
  assert(matchProjectCommand('hapus item plesteran') === null, 'B4: "hapus item plesteran" → BUKAN DELETE_PROJECT (DELETE_ITEM)');
}
{
  assert(matchProjectCommand('hapus semua proyek') === null, 'B5: "hapus semua proyek" → TIDAK cocok (pagar massal di pola)');
}
{
  // "hapus proyek semua" cocok di pola (param "semua") — pertahanannya
  // gerbang MUTATION_INTENTS di router + penolakan bulk di handler (D8).
  const r = matchProjectCommand('hapus proyek semua');
  assert(r?.intent === 'DELETE_PROJECT' && r?.param === 'semua', 'B6: "hapus proyek semua" → pola cocok, param semua (ditolak handler)');
}
{
  const r = matchProjectCommand('hapus proyek');
  assert(r?.intent === 'DELETE_PROJECT' && r?.param === undefined, 'B7: "hapus proyek" tanpa target → DELETE_PROJECT tanpa param (klarifikasi)');
}
{
  assert(matchProjectCommand('ya, hapus proyek') === null, 'B8: "ya, hapus proyek" → TIDAK cocok (jangkar awal: afirmasi tidak memicu hapus)');
}
{
  assert(matchProjectCommand('buka daftar proyek') === null, 'B9: buka daftar proyek → BUKAN pola proyek-mutasi');
}

/* --- C. Pola ARCHIVE_PROJECT / DUPLICATE_PROJECT --- */

{
  const r = matchProjectCommand('arsipkan proyek ini');
  assert(r?.intent === 'ARCHIVE_PROJECT' && r?.param === 'ini', 'C1: arsipkan proyek ini → ARCHIVE_PROJECT');
}
{
  const r = matchProjectCommand('pindahkan proyek ini ke arsip');
  assert(r?.intent === 'ARCHIVE_PROJECT' && r?.param === 'ini', 'C2: pindahkan … ke arsip → ARCHIVE_PROJECT');
}
{
  const r = matchProjectCommand('arsipkan proyek');
  assert(r?.intent === 'ARCHIVE_PROJECT' && r?.param === undefined, 'C3: arsipkan proyek tanpa target → klarifikasi');
}
{
  const r = matchProjectCommand('duplikat proyek ini');
  assert(r?.intent === 'DUPLICATE_PROJECT' && r?.param === 'ini', 'C4: duplikat proyek ini → DUPLICATE_PROJECT');
}
{
  const r = matchProjectCommand('gandakan proyek Villa Samudra');
  assert(r?.intent === 'DUPLICATE_PROJECT' && r?.param === 'Villa Samudra', 'C5: gandakan proyek … → DUPLICATE_PROJECT');
}
{
  const r = matchProjectCommand('duplikat proyek');
  assert(r?.intent === 'DUPLICATE_PROJECT' && r?.param === undefined, 'C6: duplikat proyek tanpa target → klarifikasi');
}
{
  assert(PROJECT_PATTERNS.every((p) => !p.re.flags.includes('i')), 'C7: semua pola tanpa flag /i (teks ternormalisasi)');
  assert(PROJECT_COMMAND_INTENTS.has('DELETE_PROJECT_CONFIRM'), 'C8: DELETE_PROJECT_CONFIRM terdaftar sebagai intent kelompok');
  assert(!PROJECT_PATTERNS.some((p) => p.intent === 'DELETE_PROJECT_CONFIRM'), 'C9: DELETE_PROJECT_CONFIRM TIDAK punya pola router (hanya tombol)');
}

/* --- D. Helper: cleanProjectTarget + resolveProjectTarget --- */

{
  assert(cleanProjectTarget('ini.') === 'ini', 'D1: "ini." → "ini"');
  assert(cleanProjectTarget('ini dong') === 'ini', 'D2: "ini dong" → "ini"');
  assert(cleanProjectTarget('  Rumah Impian  ') === 'Rumah Impian', 'D3: spasi dipangkas');
  assert(cleanProjectTarget('') === '', 'D4: kosong → kosong');
}
{
  const { ctx } = makeCtx();
  const r = resolveProjectTarget('ini', ctx);
  assert(r.kind === 'found' && r.project.id === 'p1', 'D5: "ini" → proyek aktif');
  const r2 = resolveProjectTarget('rumah impian', ctx);
  assert(r2.kind === 'found' && r2.project.id === 'p2', 'D6: nama persis case-insensitive → ditemukan');
  const r3 = resolveProjectTarget('Samudra', ctx);
  assert(r3.kind === 'found' && r3.project.id === 'p3', 'D7: cocok sebagian unik → ditemukan');
  const r4 = resolveProjectTarget('semua', ctx);
  assert(r4.kind === 'bulk', 'D8: "semua" → bulk (ditolak handler)');
  const r5 = resolveProjectTarget('Rumah', ctx);
  assert(r5.kind === 'ambiguous' && r5.candidates.length === 2, 'D9: "Rumah" cocok 2 proyek → ambigu + 2 kandidat');
  const r6 = resolveProjectTarget('Gedung Sekolah', ctx);
  assert(r6.kind === 'not-found' && r6.name === 'Gedung Sekolah', 'D10: nama tidak ada → not-found');
  const r7 = resolveProjectTarget(undefined, ctx);
  assert(r7.kind === 'need-target', 'D11: param kosong → need-target');
}
{
  const { ctx } = makeCtx({ activeProject: null });
  assert(resolveProjectTarget('ini', ctx).kind === 'no-active', 'D12: "ini" tanpa proyek aktif → no-active');
}

/* --- E. Handler CREATE_PROJECT --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('CREATE_PROJECT', 'Rumah Impian', ctx);
  assert(res?.ok === true, 'E1: buat proyek sukses → ok');
  assert(calls.create.length === 1 && calls.create[0] === 'Rumah Impian', 'E2: callback dipanggil dengan nama');
  assert((res?.message ?? '').includes('Rumah Impian') && (res?.message ?? '').includes('p-new'), 'E3: balasan menyebut nama + id baru');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<ProjectCommandContext>).createProject;
  const res = handleProjectCommand('CREATE_PROJECT', 'Rumah Impian', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum bisa'), 'E4: tanpa callback → fail-closed jujur');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('CREATE_PROJECT', 'baru', ctx);
  assert(calls.create.length === 0, 'E5: param "baru" → callback TIDAK dipanggil');
  assert(calls.nav.length === 1 && calls.nav[0] === 'proyek', 'E6: param "baru" → navigasi ke proyek');
  assert(res?.navigated === true && res?.message === 'Membuka Daftar Proyek — klik "Proyek Baru" untuk membuat proyek.', 'E7: param "baru" → pesan OPEN_PROJECT_CREATE persis');
}
{
  const { ctx, calls } = makeCtx();
  delete (ctx as Partial<ProjectCommandContext>).navigate;
  const res = handleProjectCommand('CREATE_PROJECT', 'Baru', ctx);
  assert(calls.create.length === 0 && res?.navigated !== true, 'E8: param "Baru" tanpa navigate → tanpa klaim navigasi');
  assert((res?.message ?? '').includes('Daftar Proyek') && (res?.message ?? '').includes('Proyek Baru'), 'E9: … tapi tetap mengarahkan ke Daftar Proyek');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('CREATE_PROJECT', '   ', ctx);
  assert(calls.create.length === 0 && (res?.message ?? '').includes('nama apa'), 'E10: param kosong → diminta namanya');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('CREATE_PROJECT', 'A'.repeat(121), ctx);
  assert(calls.create.length === 0 && res?.ok === false && (res?.message ?? '').includes('120 karakter'), 'E11: nama >120 karakter → ditolak, callback tidak dipanggil');
}
{
  assert(PROJECT_MAX_NAME_LENGTH === 120, 'E12: batas nama = 120 karakter (sama seperti rename)');
}
{
  const { ctx, succeed } = makeCtx();
  succeed.v = false;
  const res = handleProjectCommand('CREATE_PROJECT', 'Rumah Impian', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum dibuat'), 'E13: callback null → ok false, tanpa klaim sukses');
}

/* --- F. Handler DELETE_PROJECT langkah 1 --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT', 'ini', ctx);
  assert(res?.ok === true, 'F1: hapus proyek ini → ok (langkah konfirmasi)');
  assert(calls.del.length === 0, 'F2: langkah 1 TIDAK memanggil deleteProject');
  assert((res?.message ?? '').includes('Rumah Tinggal 2 Lantai'), 'F3: pesan menyebut nama proyek target');
  assert(res?.actions?.length === 2, 'F4: dua tombol konfirmasi');
  const confirm = res?.actions?.[0];
  assert(
    confirm?.label === 'Ya, hapus proyek' &&
    confirm?.action.kind === 'intent' &&
    (confirm?.action as { intent: string }).intent === 'DELETE_PROJECT_CONFIRM' &&
    (confirm?.action as { param?: string }).param === 'p1',
    'F5: tombol 1 = kind intent DELETE_PROJECT_CONFIRM + param id proyek',
  );
  const cancel = res?.actions?.[1];
  assert(
    cancel?.label === 'Batal' && cancel?.action.kind === 'navigate' &&
    (cancel?.action as { menu: string }).menu === 'proyek',
    'F6: tombol 2 = Batal navigate ke daftar proyek',
  );
}
{
  const acts = buildDeleteConfirmActions('p9');
  assert(
    acts[0].action.kind === 'intent' && (acts[0].action as { param?: string }).param === 'p9',
    'F7: buildDeleteConfirmActions membawa id yang benar',
  );
}
{
  const { ctx } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT', 'Samudra', ctx);
  assert((res?.message ?? '').includes('Villa Samudra'), 'F8: nama sebagian unik → konfirmasi proyek yang benar');
}
{
  const { ctx } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT', 'Rumah', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('Rumah Tinggal 2 Lantai') && (res?.message ?? '').includes('Rumah Impian'), 'F9: nama ambigu → daftar kandidat, tanpa tombol');
  assert(!res?.actions, 'F10: ambigu → tanpa tombol konfirmasi');
}
{
  const { ctx } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT', 'Gedung Sekolah', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('tidak ditemukan') && !res?.actions, 'F11: nama tidak ada → jujur, tanpa tombol');
}
{
  const { ctx } = makeCtx({ activeProject: null });
  const res = handleProjectCommand('DELETE_PROJECT', 'ini', ctx);
  assert((res?.message ?? '').includes('Tidak ada proyek aktif') && !res?.actions, 'F12: "ini" tanpa proyek aktif → jujur, tanpa tombol');
}
{
  const { ctx } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT', 'semua', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('banyak proyek') && !res?.actions, 'F13: "semua" → ditolak massal, tanpa tombol');
}
{
  const { ctx } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT', undefined, ctx);
  assert(res?.ok === true && (res?.message ?? '').includes('yang mana'), 'F14: tanpa target → ditanya proyeknya');
}

/* --- G. Handler DELETE_PROJECT_CONFIRM (langkah 2) --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT_CONFIRM', 'p2', ctx);
  assert(res?.ok === true, 'G1: konfirmasi hapus → ok');
  assert(calls.del.length === 1 && calls.del[0] === 'p2', 'G2: deleteProject dipanggil dengan id');
  assert((res?.message ?? '').includes('Rumah Impian') && (res?.message ?? '').includes('dihapus'), 'G3: balasan menyebut nama proyek yang dihapus');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT_CONFIRM', 'p-tidak-ada', ctx);
  assert(calls.del.length === 0 && res?.ok === false && (res?.message ?? '').includes('sudah tidak ada'), 'G4: id tidak ada di daftar → callback tidak dipanggil, jujur');
}
{
  const { ctx, calls } = makeCtx({ projects: [] });
  const res = handleProjectCommand('DELETE_PROJECT_CONFIRM', 'p1', ctx);
  assert(calls.del.length === 0 && res?.ok === false, 'G5: daftar proyek kosong → langkah 2 ditolak, tanpa hapus');
}
{
  const { ctx, calls } = makeCtx();
  delete (ctx as Partial<ProjectCommandContext>).deleteProject;
  const res = handleProjectCommand('DELETE_PROJECT_CONFIRM', 'p1', ctx);
  assert(calls.del.length === 0 && res?.ok === false && (res?.message ?? '').includes('belum bisa'), 'G6: tanpa callback → fail-closed jujur');
}
{
  const { ctx, succeed } = makeCtx();
  succeed.v = false;
  const res = handleProjectCommand('DELETE_PROJECT_CONFIRM', 'p1', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum terhapus'), 'G7: callback false → ok false, tanpa klaim sukses');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('DELETE_PROJECT_CONFIRM', undefined, ctx);
  assert(calls.del.length === 0 && res?.ok === false, 'G8: konfirmasi tanpa id → ditolak, tanpa hapus');
}

/* --- H. Handler ARCHIVE_PROJECT --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('ARCHIVE_PROJECT', 'ini', ctx);
  assert(res?.ok === true && calls.arch.length === 1 && calls.arch[0] === 'p1', 'H1: arsipkan proyek ini → callback dengan id aktif');
  assert((res?.message ?? '').includes('Rumah Tinggal 2 Lantai') && (res?.message ?? '').includes('diarsipkan'), 'H2: balasan menyebut nama + diarsipkan');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<ProjectCommandContext>).archiveProject;
  const res = handleProjectCommand('ARCHIVE_PROJECT', 'ini', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum bisa'), 'H3: tanpa callback → fail-closed jujur');
}
{
  const { ctx } = makeCtx({ activeProject: null });
  const res = handleProjectCommand('ARCHIVE_PROJECT', 'ini', ctx);
  assert((res?.message ?? '').includes('Tidak ada proyek aktif'), 'H4: "ini" tanpa proyek aktif → jujur');
}
{
  const { ctx, succeed } = makeCtx();
  succeed.v = false;
  const res = handleProjectCommand('ARCHIVE_PROJECT', 'Villa Samudra', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum diarsipkan'), 'H5: callback false → ok false, tanpa klaim sukses');
}

/* --- I. Handler DUPLICATE_PROJECT --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleProjectCommand('DUPLICATE_PROJECT', 'ini', ctx);
  assert(res?.ok === true && calls.dup.length === 1 && calls.dup[0] === 'p1', 'I1: duplikat proyek ini → callback dengan id sumber');
  assert((res?.message ?? '').includes('Rumah Tinggal 2 Lantai (Salinan Draft)') && (res?.message ?? '').includes('p-copy'), 'I2: balasan menyebut nama baru + id duplikat');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<ProjectCommandContext>).duplicateProject;
  const res = handleProjectCommand('DUPLICATE_PROJECT', 'ini', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum bisa'), 'I3: tanpa callback → fail-closed jujur');
}
{
  const { ctx, succeed } = makeCtx();
  succeed.v = false;
  const res = handleProjectCommand('DUPLICATE_PROJECT', 'ini', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('belum diduplikat'), 'I4: callback null → ok false, tanpa klaim sukses');
}
{
  const { ctx } = makeCtx();
  const res = handleProjectCommand('DUPLICATE_PROJECT', 'Gedung Sekolah', ctx);
  assert(res?.ok === false && (res?.message ?? '').includes('tidak ditemukan'), 'I5: sumber tidak ada → jujur');
}

/* --- J. Dispatcher: null untuk intent luar kelompok --- */

{
  const { ctx } = makeCtx();
  assert(handleProjectCommand('RENAME_PROJECT', 'X', ctx) === null, 'J1: RENAME_PROJECT → null (bukan kelompok ini)');
  assert(handleProjectCommand('QUERY_PROJECT_TOTAL', undefined, ctx) === null, 'J2: QUERY_PROJECT_TOTAL → null');
  assert(handleProjectCommand('UNKNOWN', undefined, ctx) === null, 'J3: UNKNOWN → null');
  assert(handleProjectCommand('DELETE_PROJECT_CONFIRM', 'p1', ctx) !== null, 'J4: DELETE_PROJECT_CONFIRM ditangani (bukan null)');
}

console.log(`chatProjectCommands: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
