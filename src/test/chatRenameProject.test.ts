/**
 * EZRAB Chat AI — Rename proyek dari chat (intent RENAME_PROJECT).
 * Regresi 2026-11-17: perintah "ubah nama proyek menjadi ..." jatuh UNKNOWN
 * ke LLM, yang lalu mengklaim rename berhasil tanpa tool apa pun.
 * Run: npx tsx src/test/chatRenameProject.test.ts
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';
import { EZRAB_AI_SYSTEM_PROMPT, EZRAB_AI_PROMPT_VERSION } from '../ai-tools/ezrab-ai/prompt';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

const noop = () => {};
const emptyCtx: ChatActionContext = {
  navigate: noop, currentMenu: 'ezrab-ai', activeProject: null, projects: [], projectTotal: null,
};

// --- Router: perintah rename dikenali deterministik (lokal, tanpa AI) ---

// 1. Perintah persis dari laporan user
{
  const r = routeIntent('ubah nama proyek menjadi Rumah tercinta dan kekasihku sekarang');
  assert(r.intent === 'RENAME_PROJECT', '1: perintah user → RENAME_PROJECT');
  assert(r.localOnly, '1: rename berjalan lokal (tanpa AI/kredit)');
  assert(r.param === 'Rumah tercinta dan kekasihku sekarang', '1: nama diambil verbatim sebagai param');
}
// 2. Varian "ganti ... jadi"
{
  const r = routeIntent('ganti nama proyek jadi Villa Impian');
  assert(r.intent === 'RENAME_PROJECT' && r.param === 'Villa Impian', '2: ganti ... jadi → param Villa Impian');
}
// 3. Varian tanpa kata penghubung + bentuk informal "gantiin"
{
  const r = routeIntent('gantiin nama proyek Rumah Baru');
  assert(r.intent === 'RENAME_PROJECT' && r.param === 'Rumah Baru', '3: gantiin tanpa menjadi → param Rumah Baru');
}
// 4. "tolong" tidak membajak ke HELP (lookahead proyek sudah ada)
{
  const r = routeIntent('tolong ubah nama proyek menjadi Rumah Sederhana');
  assert(r.intent === 'RENAME_PROJECT' && r.param === 'Rumah Sederhana', '4: tolong ubah ... → RENAME_PROJECT');
}
// 5. Tanpa nama → klarifikasi, bukan UNKNOWN ke LLM
{
  const r = routeIntent('ubah nama proyek');
  assert(r.intent === 'RENAME_PROJECT' && r.needsClarification === true, '5: tanpa nama → klarifikasi');
  assert((r.clarificationPrompt ?? '').includes('nama apa'), '5: prompt klarifikasi menanyakan nama baru');
}
// 6. "menjadi" tanpa nama → klarifikasi juga
{
  const r = routeIntent('ubah nama proyek menjadi');
  assert(r.intent === 'RENAME_PROJECT' && r.needsClarification === true, '6: menjadi tanpa nama → klarifikasi');
}
// 7. Varian Inggris
{
  const r = routeIntent('rename project to My House');
  assert(r.intent === 'RENAME_PROJECT' && r.param === 'My House', '7: rename project to → param My House');
}
// 8. Perintah proyek lain TIDAK dibajak rename
{
  assert(routeIntent('buka daftar proyek').intent === 'OPEN_PROJECTS', '8: buka daftar proyek tetap OPEN_PROJECTS');
  assert(routeIntent('berapa total proyek saya?').intent === 'QUERY_PROJECT_TOTAL', '8: total proyek tetap QUERY_PROJECT_TOTAL');
  // "daftar proyek ..." mengandung verba daftar → navigasi (perilaku lama);
  // bentuk tanpa verba-lah yang masuk QUERY_PROJECT_LIST.
  assert(routeIntent('proyek saya apa saja?').intent === 'QUERY_PROJECT_LIST', '8: proyek saya apa saja tetap QUERY_PROJECT_LIST');
  assert(routeIntent('buatkan rab rumah type 70').intent === 'CREATE_RAB_DIRECT', '8: rab rumah tetap CREATE_RAB_DIRECT');
}

// --- Registry: eksekusi rename jujur (hanya klaim bila callback true) ---

function makeCtx(over: Partial<ChatActionContext> = {}): { ctx: ChatActionContext; calls: Array<{ id: string; name: string }>; succeed: { v: boolean } } {
  const calls: Array<{ id: string; name: string }> = [];
  const succeed = { v: true };
  const ctx: ChatActionContext = {
    ...emptyCtx,
    activeProject: { id: 'p1', name: 'Rumah Tinggal 2 Lantai' },
    projects: [{ id: 'p1', name: 'Rumah Tinggal 2 Lantai' }],
    renameProject: (id: string, name: string) => {
      calls.push({ id, name });
      return succeed.v;
    },
    ...over,
  };
  return { ctx, calls, succeed };
}

// 9. Rename berhasil: callback dipanggil, pesan mengutip lama → baru
{
  const { ctx, calls } = makeCtx();
  const res = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(res.ok === true, '9: rename berhasil → ok');
  assert(calls.length === 1 && calls[0].id === 'p1' && calls[0].name === 'Rumah Impian', '9: callback dipanggil dengan id + nama baru');
  assert(res.message.includes('Rumah Tinggal 2 Lantai') && res.message.includes('Rumah Impian'), '9: pesan mengutip nama lama → baru');
}
// 10. Tanpa proyek aktif: jujur, callback TIDAK dipanggil
{
  const { ctx, calls } = makeCtx({ activeProject: null });
  const res = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(calls.length === 0, '10: tanpa proyek aktif → callback tidak dipanggil');
  assert(res.message.includes('Tidak ada proyek aktif'), '10: pesan jujur tanpa proyek aktif');
  assert(!res.message.includes('diubah dari'), '10: tidak ada klaim berhasil');
}
// 11. Tanpa callback renameProject (fail-closed): jujur "belum bisa"
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<ChatActionContext>).renameProject;
  const res = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(res.ok === false, '11: tanpa callback → ok false');
  assert(res.message.includes('belum bisa'), '11: pesan jujur belum bisa dari chat');
}
// 12. Nama sama dengan nama lama: no-op, callback TIDAK dipanggil
{
  const { ctx, calls } = makeCtx();
  const res = executeIntent('RENAME_PROJECT', 'Rumah Tinggal 2 Lantai', ctx);
  assert(calls.length === 0, '12: nama sama → callback tidak dipanggil');
  assert(res.message.includes('tidak ada yang berubah'), '12: pesan no-op jujur');
}
// 13. Param kosong: minta nama, callback TIDAK dipanggil
{
  const { ctx, calls } = makeCtx();
  const res = executeIntent('RENAME_PROJECT', '   ', ctx);
  assert(calls.length === 0, '13: param kosong → callback tidak dipanggil');
  assert(res.message.includes('nama apa'), '13: pesan meminta nama baru');
}
// 14. Nama > 120 karakter: ditolak jelas
{
  const { ctx, calls } = makeCtx();
  const res = executeIntent('RENAME_PROJECT', 'A'.repeat(121), ctx);
  assert(calls.length === 0, '14: nama terlalu panjang → callback tidak dipanggil');
  assert(res.ok === false && res.message.includes('120 karakter'), '14: pesan menyebut batas 120 karakter');
}
// 15. Callback false (id tidak ditemukan): TIDAK mengklaim berhasil
{
  const { ctx, succeed } = makeCtx();
  succeed.v = false;
  const res = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
  assert(res.ok === false, '15: callback false → ok false');
  assert(res.message.includes('belum berubah'), '15: pesan jujur belum berubah');
  assert(!res.message.includes('diubah dari'), '15: tidak ada klaim berhasil');
}

// --- Prompt: aturan anti-klaim-palsu + versi naik ---

// 16. System prompt memuat aturan 27 (rename tanpa tool = jangan klaim)
{
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('PERUBAHAN NAMA/DATA PROYEK'), '16: prompt memuat aturan perubahan nama proyek');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('JANGAN PERNAH mengklaim perubahan semacam itu sudah terjadi'), '16: prompt melarang klaim perubahan tanpa tool');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('ubah nama proyek menjadi <nama baru>'), '16: prompt mengarahkan ke perintah chat yang berlaku');
}
// 17. Versi prompt naik (perubahan prompt wajib tercatat; 2.3.0 =
// aturan 29 daftar kemampuan resmi, 2026-11-17)
{
  assert(EZRAB_AI_PROMPT_VERSION === '2.3.0', '17: EZRAB_AI_PROMPT_VERSION = 2.3.0');
}

console.log(`chatRenameProject: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
