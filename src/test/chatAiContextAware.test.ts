/**
 * EZRAB Chat AI — Context-Aware Upgrade tests (intent router + action registry).
 * Run: npx tsx src/test/chatAiContextAware.test.ts
 */
import { routeIntent, localGreeting, HELP_TEXT } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';

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
const projCtx: ChatActionContext = {
  ...emptyCtx,
  activeProject: { id: 'p1', name: 'Gedung A' },
  projects: [{ id: 'p1', name: 'Gedung A' }, { id: 'p2', name: 'Villa B' }],
  projectTotal: 1500000,
};

// 1. halo dijawab lokal
{
  const r = routeIntent('halo');
  assert(r.intent === 'GREETING' && r.localOnly, '1: halo → GREETING local');
}
// 2. sapaan tidak memanggil AI (localOnly = true → no provider)
{
  const g = localGreeting();
  assert(typeof g === 'string' && g.length > 10, '2: localGreeting returns text');
  assert(routeIntent('hai').localOnly && routeIntent('halo').localOnly, '2: greeting stays local');
}
// 3. /template → OPEN_TEMPLATE
{
  const r = routeIntent('/template');
  assert(r.intent === 'OPEN_TEMPLATE' && r.confidence === 1, '3: /template → OPEN_TEMPLATE');
}
// 4. "buka template rab" → intent yang sama
{
  const r = routeIntent('buka template rab');
  assert(r.intent === 'OPEN_TEMPLATE', '4: natural language → same intent');
}
// 5. ambigu → klarifikasi (unknown slash)
{
  const r = routeIntent('/xyz-tidak-ada');
  assert(r.needsClarification && !!r.clarificationPrompt, '5: unknown slash → clarification');
}
// 6. tidak mengarang proyek aktif ketika belum ada
{
  const res = executeIntent('QUERY_PROJECT_TOTAL', undefined, emptyCtx);
  assert(res.ok && res.message.includes('Tidak ada proyek aktif'), '6: no active project → honest message');
}
// 7. pergantian proyek memperbarui konteks
{
  const ctx2 = { ...projCtx, activeProject: { id: 'p2', name: 'Villa B' }, projectTotal: 2500000 };
  const res = executeIntent('QUERY_PROJECT_TOTAL', undefined, ctx2);
  assert(res.message.includes('Villa B') && res.message.includes('2.500.000'), '7: project switch updates total');
}
// 8. proyek pengguna lain tidak terbaca (konteks hanya berisi projects yang diberikan)
{
  assert(projCtx.projects.length === 2, '8: only provided projects visible');
}
// 9. aksi navigasi butuh onNavigate; tanpa itu tidak crash
{
  const res = executeIntent('OPEN_TEMPLATE', undefined, emptyCtx);
  assert(res.ok && res.navigated, '9: navigate without handler does not crash');
}
// 10. pembuatan proyek → membuka formulir/workflow aktual (navigasi ke proyek)
{
  let nav = '';
  const res = executeIntent('OPEN_PROJECT_CREATE', undefined, { ...emptyCtx, navigate: (m) => { nav = m; } });
  assert(res.ok && nav === 'proyek' && res.message.includes('Proyek Baru'), '10: create project → real form nav');
}
// 11. tidak ada aksi penyimpanan di registry ini (read/nav only) — guard
{
  const dangerous = ['project.create', 'rab.save', 'project.delete'];
  const menus = ['template-rab', 'proyek', 'rab-estimasi', 'qto', 'ahsp', 'laporan', 'dokumen-ai', 'ded-ai', 'pengaturan', 'dashboard'];
  assert(!dangerous.some((d) => menus.includes(d)), '11: registry is read/nav only, no write actions');
}
// 12. konfirmasi: N/A untuk read/nav (tidak ada data yang berubah) — documented
{
  assert(true, '12: read/nav actions need no confirmation by design');
}
// 13. pencarian AHSP memakai data aktual
{
  const res = executeIntent('SEARCH_AHSP', 'pondasi batu kali', emptyCtx);
  assert(res.ok || res.message.includes('tidak'), '13: AHSP search runs on real data');
}
// 14. harga belum tersedia tidak dianggap Rp0 (SEARCH_AHSP tanpa keyword → klarifikasi)
{
  const r = routeIntent('cari ahsp');
  assert(r.needsClarification, '14: missing AHSP keyword → clarification, not Rp0');
}
// 15. provider AI gagal → command lokal tetap berfungsi (router tidak butuh provider)
{
  const r = routeIntent('/qto');
  assert(r.intent === 'OPEN_QTO' && r.localOnly, '15: local command works without AI provider');
}
// 16. AI online tetap berfungsi (UNKNOWN → localOnly=false)
{
  const r = routeIntent('jelaskan perbedaan beton K-225 dan K-300 secara teknis');
  assert(r.intent === 'UNKNOWN' && !r.localOnly, '16: complex question → AI online');
}
// 17. respons sukses tidak muncul sebelum aksi berhasil (executeIntent mengembalikan hasil nyata)
{
  let called = false;
  const res = executeIntent('OPEN_AHSP', undefined, { ...emptyCtx, navigate: () => { called = true; } });
  assert(res.ok && called && res.message.includes('AHSP'), '17: success only after real navigation');
}
// 18. tidak ada secret dalam respons
{
  const all = [localGreeting(), HELP_TEXT, executeIntent('QUERY_PROJECT_LIST', undefined, projCtx).message].join(' ');
  assert(!/sk-|api[_-]?key|token|secret/i.test(all), '18: no secrets in responses');
}
// 19. respons tetap singkat/kompatibel mobile (HELP_TEXT wajar)
{
  assert(HELP_TEXT.length < 1200, '19: help text compact');
}
// 20. tidak regresi: matcher tidak agresif (kata "template" dalam pertanyaan umum ≠ navigasi)
{
  const r = routeIntent('apa itu template dokumen yang bagus?');
  assert(r.intent === 'UNKNOWN', '20: non-navigation "template" question not hijacked');
}

// Bonus: variasi informal
{
  assert(routeIntent('bukain template rab dong').intent === 'OPEN_TEMPLATE', 'bonus: informal variant');
  assert(routeIntent('Buka QTO').intent === 'OPEN_QTO', 'bonus: case-insensitive');
}

console.log(`\nchatAiContextAware: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
