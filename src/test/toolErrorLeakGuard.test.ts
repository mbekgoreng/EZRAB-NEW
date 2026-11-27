/**
 * D3 — Error tool mentah tidak pernah bocor ke pengguna (lapisan bersama).
 *
 * Akar masalah (2026-11-26, kasus live landscape): `get_project_items`
 * (requiresProject) dipanggil model saat chat berada di scope global
 * (tanpa proyek aktif) → registry mengembalikan ok:false
 * PROJECT_REQUIRED ("Tool get_project_items butuh proyek aktif
 * (projectId) — tidak ada proyek dalam scope eksekusi.") — lalu
 * `service.ts` mendorong `exec.output ?? exec.error` ke jawaban TANPA
 * memeriksa `exec.ok`, dan tetap success:true, sehingga quality gate
 * (prosa-only) dan formatAiFailureMessage tidak pernah berjalan.
 *
 * Perbaikan (lapisan presentasi; kontrak registry TIDAK berubah):
 *  1. `service.ts` tool loop: cabang `exec.ok` — ok → output seperti
 *     semula; !ok → error mentah TIDAK PERNAH didorong; PROJECT_REQUIRED
 *     / PROJECT_SCOPE_MISMATCH → prosa model bila ada, kalau tidak
 *     pesan kaleng + aksi (RAB_PROJECT_PREVIEW); semua tool gagal karena
 *     alasan lain → success:false + balasan aman (jalur "Coba Lagi").
 *     Kegagalan TETAP tercatat di toolResults (ok:false).
 *  2. `coAssistantService.ts`: cermin yang sama. Catatan: di kanal
 *     Copilot TIDAK ADA tool requiresProject yang model-callable
 *     (COPILOT_ALLOWED_TOOLS hanya 8 tool read-only non-proyek) —
 *     panggilan model di sana gagal TOOL_NOT_MODEL_CALLABLE dan jatuh
 *     ke balasan aman generik; cabang PROJECT_REQUIRED Copilot adalah
 *     pertahanan lapis kedua untuk pemanggil internal.
 *  3. `view.tsx` (gerbang kualitas, :3785): penjaga balasan tool —
 *     balasan APA PUN (termasuk balasan tool) yang memuat token
 *     internal diganti pesan kaleng.
 *  4. `prompt.ts` aturan 6/8: tool proyek hanya bila DATA menyebut
 *     proyek aktif dengan item; "tidak ada proyek aktif" tidak boleh
 *     disampaikan mentah-mentah.
 *  5. Celah intake (§b.5) TIDAK diimplementasi — TERBUKA (lihat §8):
 *     `generateFromProjectContext` tetap men-null-kan projectCtx
 *     (actionRegistry.ts:1204); jawaban kondisi lahan sesudah draft
 *     tetap jatuh ke LLM dan hanya diamankan lapisan presentasi D3.
 *
 * Jalankan: npx --yes tsx src/test/toolErrorLeakGuard.test.ts
 * (skrip asersi tsx polos — BUKAN vitest; provider di-stub, tanpa AI live.)
 */
import { aiToolsProviderClient, AiToolsResult } from '../ai-tools/providerClient';
import { ezrabAiService, PROJECT_SCOPE_CANNED_REPLY } from '../ai-tools/ezrab-ai/service';
import { EZRAB_AI_SYSTEM_PROMPT } from '../ai-tools/ezrab-ai/prompt';
import { executeTool } from '../ai-tools/ezrab-ai/toolRegistry';
import { buildProjectSnapshot } from '../ai-tools/ezrab-ai/projectContext';
import { coAssistantService } from '../services/coAssistantService';
import {
  executeIntent, tryContinueProjectContext, clearProjectContext,
} from '../ai-tools/ezrab-ai/actionRegistry';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else {
    failed++; failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
/** Substring mentah yang TIDAK BOLEH muncul di balasan mana pun. */
const FORBIDDEN = ['get_project_items', 'projectId', 'dalam scope eksekusi', 'PROJECT_REQUIRED', 'Tool ', 'scope eksekusi'];
const hasForbidden = (text: string, extra: string[] = []) =>
  [...FORBIDDEN, ...extra].some((s) => text.includes(s));

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;

const ORIGINAL_EXECUTE = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
function stubProvider(content: string): void {
  (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> => ({
    success: true,
    content,
    structured: null,
    requestId: 'stub',
  });
}
function restoreProvider(): void {
  (aiToolsProviderClient as any).execute = ORIGINAL_EXECUTE;
}

const LANDSCAPE_HISTORY: Array<{ role: 'user' | 'assistant'; content: string }> = [
  { role: 'user', content: 'Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar' },
  { role: 'assistant', content: 'Draf RAB taman publik tersusun sebagai draf sementara.' },
  { role: 'user', content: 'kan budget saya 50jt' },
  { role: 'assistant', content: 'Bagaimana kondisi lahan eksistingnya?' },
  { role: 'user', content: 'lahan kosong' },
];
const HOUSE_HISTORY: Array<{ role: 'user' | 'assistant'; content: string }> = [
  { role: 'user', content: 'Buatkan RAB rumah 2 lantai luas bangunan 180 m2' },
  { role: 'assistant', content: 'Draf RAB rumah tersusun sebagai draf sementara.' },
  { role: 'user', content: 'tolong periksa item-itemnya satu per satu' },
];
const DRAFT_SUMMARY = { title: 'Taman publik', version: 1, itemCount: 7 };

async function main(): Promise<void> {
  /* -------------------------------------------------------------- */
  /* 1 — Kasus live: Chat AI, get_project_items tanpa proyek aktif   */
  /* -------------------------------------------------------------- */
  console.log('== 1 — Chat AI: tool proyek tanpa proyek aktif ==');
  {
    stubProvider('{"tool": "get_project_items", "args": {}}');
    try {
      const res = await ezrabAiService.send({
        messages: LANDSCAPE_HISTORY,
        draftSummary: DRAFT_SUMMARY,
      } as never);
      check('1.1 reply TIDAK memuat substring mentah', !hasForbidden(res.reply), res.reply.slice(0, 200));
      check('1.2 reply mengakui kondisi lahan ("lahan kosong")', res.reply.includes('lahan kosong'), res.reply.slice(0, 200));
      check('1.3 reply menawarkan kelanjutan ("pratinjau")', res.reply.includes('pratinjau'), res.reply.slice(0, 200));
      check('1.4 reply = pesan kaleng scope-proyek', res.reply === PROJECT_SCOPE_CANNED_REPLY, res.reply.slice(0, 120));
      check('1.5 giliran TIDAK digagalkan (success:true)', res.success === true, res.success);
      check('1.6 toolResults mencatat panggilan ok:false', (res.toolResults ?? []).some((t) => t.toolName === 'get_project_items' && t.ok === false), JSON.stringify(res.toolResults));
      check('1.7 toolResults TIDAK memuat error mentah', !(res.toolResults ?? []).some((t) => hasForbidden(t.output)), JSON.stringify(res.toolResults));
      check('1.8 aksi RAB_PROJECT_PREVIEW dilampirkan',
        (res.actions ?? []).some((a) => a.action.intent === 'RAB_PROJECT_PREVIEW'),
        JSON.stringify(res.actions));
    } finally { restoreProvider(); }
  }

  /* -------------------------------------------------------------- */
  /* 2 — Parameterisasi: SEMUA tool requiresProject (chat-ai)        */
  /* -------------------------------------------------------------- */
  console.log('== 2 — Semua tool requiresProject: tidak ada kebocoran ==');
  {
    const tools: Array<[string, Record<string, unknown>]> = [
      ['get_project_total', {}],
      ['get_project_items', {}],
      ['get_item_detail', { nama: 'x' }],
      ['get_project_labor', {}],
      ['get_project_sections', {}],
      ['get_project_costliest', {}],
      ['get_project_materials', {}],
      ['get_unresolved_items', {}],
      ['propose_add_item', { nama: 'x', volume: 1, satuan: 'm2' }],
    ];
    for (const [tool, args] of tools) {
      stubProvider(JSON.stringify({ tool, args }));
      try {
        const res = await ezrabAiService.send({
          messages: LANDSCAPE_HISTORY,
          draftSummary: DRAFT_SUMMARY,
        } as never);
        check(`2.${tool} reply tanpa substring mentah`, !hasForbidden(res.reply, [tool]), res.reply.slice(0, 160));
        check(`2.${tool} toolResults ok:false`, (res.toolResults ?? []).some((t) => t.toolName === tool && t.ok === false), JSON.stringify(res.toolResults));
      } finally { restoreProvider(); }
    }
    // Unit registry (kontrak TIDAK berubah): executeTool tetap
    // mengembalikan PROJECT_REQUIRED.
    const unit = await executeTool({ toolName: 'get_project_items', args: {}, projectId: null, actor: 'user', channel: 'chat-ai' } as never) as { ok: boolean; errorCode?: string };
    check('2.unit executeTool(projectId:null) → PROJECT_REQUIRED', unit.ok === false && unit.errorCode === 'PROJECT_REQUIRED', unit.errorCode);
  }

  /* -------------------------------------------------------------- */
  /* 3 — Non-landscape (rumah): kebocoran yang sama dicegah          */
  /* -------------------------------------------------------------- */
  console.log('== 3 — Rumah (non-landscape): tidak ada kebocoran ==');
  {
    stubProvider('{"tool": "get_project_items", "args": {}}');
    try {
      const res = await ezrabAiService.send({
        messages: HOUSE_HISTORY,
        draftSummary: { title: 'Rumah tinggal', version: 1, itemCount: 10 },
      } as never);
      check('3.1 reply rumah tanpa substring mentah', !hasForbidden(res.reply), res.reply.slice(0, 200));
      check('3.2 reply rumah menawarkan pratinjau', res.reply.includes('pratinjau'), res.reply.slice(0, 200));
      check('3.3 toolResults rumah ok:false', (res.toolResults ?? []).some((t) => t.toolName === 'get_project_items' && t.ok === false), JSON.stringify(res.toolResults));
    } finally { restoreProvider(); }
  }

  /* -------------------------------------------------------------- */
  /* 4 — Kontrol negatif: proyek aktif → item lines (bukan error)    */
  /* -------------------------------------------------------------- */
  console.log('== 4 — Kontrol negatif: proyek aktif tetap berfungsi ==');
  {
    const snap = buildProjectSnapshot({ id: 'proj-1', name: 'Rumah Tes' }, [
      { id: 'i1', code: 'A.1', description: 'Pembersihan lahan', unit: 'm2', volume: 100, unitPrice: 6000, totalPrice: 600000, priceStatus: 'PRICE_RESOLVED' },
      { id: 'i2', code: 'B.2', description: 'Galian tanah', unit: 'm3', volume: 50, unitPrice: 85000, totalPrice: 4250000, priceStatus: 'PRICE_RESOLVED' },
    ]);
    stubProvider('{"tool": "get_project_items", "args": {}}');
    try {
      const res = await ezrabAiService.send({
        messages: [{ role: 'user', content: 'tolong periksa item-itemnya' }],
        projectId: 'proj-1',
        projectSnapshot: snap,
      } as never);
      check('4.1 reply memuat baris item proyek', res.reply.includes('Pembersihan lahan') && res.reply.includes('Galian tanah'), res.reply.slice(0, 200));
      check('4.2 toolResults ok:true', (res.toolResults ?? []).some((t) => t.toolName === 'get_project_items' && t.ok === true), JSON.stringify(res.toolResults));
    } finally { restoreProvider(); }
  }

  /* -------------------------------------------------------------- */
  /* 5 — Cermin Copilot: tanpa proyek aktif, tanpa kebocoran          */
  /* -------------------------------------------------------------- */
  console.log('== 5 — Copilot: tanpa proyek aktif, tanpa kebocoran ==');
  {
    coAssistantService.resetSession();
    stubProvider('{"tool": "get_project_items", "args": {}}');
    try {
      const co = await coAssistantService.sendMessage({ message: 'lahan kosong', currentProject: null } as never) as { message: { text: string; isError?: boolean } };
      check('5.1 teks Copilot tanpa substring mentah', !hasForbidden(co.message.text), co.message.text.slice(0, 200));
      check('5.2 teks Copilot = balasan aman generik (bukti loop tool jalan: gateway stub terpanggil, tool gagal TOOL_NOT_MODEL_CALLABLE di kanal Copilot → bukan kaleng scope-proyek)',
        co.message.text.includes('belum bisa menjalankan pemeriksaan itu'), co.message.text.slice(0, 200));
    } finally { restoreProvider(); }
  }

  /* -------------------------------------------------------------- */
  /* 6 — Tindak lanjut pratinjau: menghasilkan draf, bukan error     */
  /* -------------------------------------------------------------- */
  console.log('== 6 — Tindak lanjut: pratinjau menghasilkan draf ==');
  {
    clearProjectContext();
    executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar'));
    tryContinueProjectContext('Taman publik');
    tryContinueProjectContext('jogging track, playground, dan area parkir');
    tryContinueProjectContext('lahan perlu dibongkar, jadi termasuk revitalisasi');
    tryContinueProjectContext('revisi ternyata untuk luas hanya 895 m2');
    tryContinueProjectContext('itu aja');
    const prev = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor(''));
    check('6.1 pratinjau menghasilkan pesan draf', (prev?.message ?? '').includes('Lanskap') || (prev?.message ?? '').includes('RAB'), (prev?.message ?? '').slice(0, 200));
    check('6.2 pesan draf tanpa substring mentah', !hasForbidden(prev?.message ?? ''), (prev?.message ?? '').slice(0, 200));
    check('6.3 draf memakai luas revisi 895 m²', (prev?.message ?? '').includes('895 m²'), (prev?.message ?? '').slice(0, 300));
  }

  /* -------------------------------------------------------------- */
  /* 7 — Prompt: aturan 6/8 diamendemen                             */
  /* -------------------------------------------------------------- */
  console.log('== 7 — Prompt aturan 6/8 ==');
  {
    check('7.1 aturan 6: tool proyek hanya bila DATA menyebut proyek aktif',
      EZRAB_AI_SYSTEM_PROMPT.includes('HANYA panggil tool proyek bila konteks DATA menyebut proyek aktif dengan item'), 'aturan 6 tidak ditemukan');
    check('7.2 aturan 6: draf sementara → jawab dari konteks chat/draf',
      EZRAB_AI_SYSTEM_PROMPT.includes('JANGAN panggil tool proyek'), 'aturan 6 (larangan) tidak ditemukan');
    check('7.3 aturan 8: "tidak ada proyek aktif" tidak disampaikan mentah-mentah',
      EZRAB_AI_SYSTEM_PROMPT.includes('JANGAN menyampaikan kalimat itu mentah-mentah'), 'aturan 8 tidak ditemukan');
    check('7.4 aturan 8: tawarkan pratinjau draf',
      EZRAB_AI_SYSTEM_PROMPT.includes('tawarkan pratinjau draf'), 'aturan 8 (pratinjau) tidak ditemukan');
  }

  /* -------------------------------------------------------------- */
  /* 8 — TERBUKA (§b.5): celah intake tidak diimplementasi           */
  /* -------------------------------------------------------------- */
  console.log('== 8 — Celah intake (§b.5) = TERBUKA (didokumentasi) ==');
  {
    // BUKTI: generateFromProjectContext men-null-kan projectCtx
    // (actionRegistry.ts:1204) — jawaban kondisi lahan sesudah draft
    // tetap jatuh ke LLM. D3 hanya mengamankan presentasinya.
    // Cek ini sengaja TIDAK digagalkan: ia mendokumentasikan status
    // terbuka, bukan perilaku yang dipin.
    check('8.1 (info) celah intake dilaporkan TERBUKA di laporan D3', true, 'lihat laporan: actionRegistry.ts:1204 projectCtx = null');
  }

  console.log(`\ntoolErrorLeakGuard: ${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join('; ')}` : ''}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
