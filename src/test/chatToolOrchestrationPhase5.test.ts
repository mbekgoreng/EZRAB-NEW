/**
 * EZRAB — AI INTELLIGENCE OVERHAUL, FASE 5: TOOL ORCHESTRATION
 * — TEST SUITE T5 (pemetaan matriks direktif Part 16 B/D/E:
 * AGT-05/08/09/10, NAV-09, adversarial E).
 *
 * Membuktikan registry tool tunggal + eksekusi terorkestrasi di atas
 * fondasi yang ADA (tools.ts, actionRegistry, executionRuntime,
 * agentOrchestrator, relevanceGate, universalRab, memory, canonical
 * context, dedUnderstanding, qtoBridge): skema + izin + idempotensi
 * terdokumentasi; validasi input sebelum eksekusi; validasi output
 * sesudah eksekusi; permission gate (model tidak pernah memberi
 * dirinya izin); idempotensi; scope proyek; audit trail; penutupan
 * ARS-03/04/05/06; wiring DED/QTO.
 *
 * Kelas bukti: mock terkendali (localStorage shim; provider nyata
 * NOT RUN — 0 panggilan; UI browser dibuktikan E2E terpisah).
 * Jalankan: npx --yes tsx src/test/chatToolOrchestrationPhase5.test.ts
 */

import { strict as assert } from 'assert';
import {
  TOOL_REGISTRY_VERSION,
  getToolDefinition,
  listToolDefinitions,
  listAvailableTools,
  COPILOT_ALLOWED_TOOLS,
  executeTool,
  cancelToolExecution,
  listToolExecutions,
  getToolExecutionTrail,
  getToolExecution,
  recordTransferReceipt,
  runPlanStepWithRegistry,
  PLAN_STEP_TOOL_MAP,
  __resetToolRegistryForTests,
} from '../ai-tools/ezrab-ai/toolRegistry';
import { EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';
import {
  buildUniversalDraft,
  reviseUniversalDraft,
  getLastUniversalDraft,
  setLastUniversalDraft,
  applyRelevanceGateToPart,
  gateProjectIdFor,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import { buildDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { classifyItemRelevance } from '../ai-tools/ezrab-ai/relevanceGate';
import {
  extractUniversalContext,
  serializeUniversalIntakeContext,
  rehydrateUniversalIntakeContext,
} from '../ai-tools/ezrab-ai/universalIntake';
import { buildCanonicalContext } from '../ai-tools/ezrab-ai/canonicalContext';
import {
  buildDedSection,
  recordDedUnderstandingToMemory,
  type DedAiOutput,
} from '../ai-tools/ezrab-ai/dedUnderstanding';
import { buildQtoSection, checkQtoAgainstUserDimensions } from '../ai-tools/ezrab-ai/qtoBridge';
import { retrieveMemories, type MemoryScope } from '../ai-tools/ezrab-ai/memory';
import { aiApiClient, WIZARD_SERVER_NOT_IMPLEMENTED } from '../services/aiApiClient';

/* ---------------- localStorage shim (pola Fase 2/3/4) ---------------- */
const store: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as { window?: unknown }).window = globalThis;

const PROJ = 'proj-t5';
const PROJ_B = 'proj-t5-b';
const CONV = 'conv-t5';
const scope: MemoryScope = { userId: null, projectId: PROJ, conversationId: CONV };

function resetAll(): void {
  for (const k of Object.keys(store)) delete store[k];
  __resetToolRegistryForTests();
  setLastUniversalDraft(null);
}

/* ---------------- runner (pola C4) ---------------- */
let passed = 0;
let failed = 0;
const failedNames: string[] = [];
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((e) => {
      failed += 1;
      failedNames.push(name);
      console.log(`  ✗ ${name} — ${(e as Error).message}`);
    });
}

const HOUSE_TEXT = 'Buatkan RAB rumah 2 lantai 10 x 8 m';
// Fixture draft universal: 'rumah' generik SENGAJA mengembalikan
// needs-spec di buildUniversalDraft (klarifikasi terpandu §4) —
// teks kandang ini yang terbukti menghasilkan draft (dipakai suite
// Fase 3/4) dan punya part bergaris gerbang terkalibrasi ('pertanian'
// → 'kandang').
const DRAFT_TEXT = 'Buatkan RAB kandang sapi 20 ekor ukuran 17 x 9 m atap Galvalum budget 300 juta';

function houseDraft(projectId: string | null = PROJ): UniversalDraft {
  const res = buildUniversalDraft(DRAFT_TEXT, undefined, { projectId });
  assert.equal(res.kind, 'draft', 'fixture kandang harus menghasilkan draft');
  return (res as { draft: UniversalDraft }).draft;
}

function dedFixture(): DedAiOutput {
  return {
    success: true,
    jobId: 'ded-t5-001',
    projectType: 'BANGUNAN',
    mode: 'FAST',
    policy: 'FULL_AI',
    projectName: 'Rumah T5',
    pageCount: 2,
    grandTotal: 150_000_000,
    items: [
      { id: 'd1', name: 'Pekerjaan beton K-300', category: 'Struktur', units: 'm3', quantity: 12, quantitySource: 'DED' },
      { id: 'd2', name: 'Pekerjaan atap genteng', category: 'Atap', units: 'm2', quantity: null, quantitySource: 'UNRESOLVED' },
    ],
  } as unknown as DedAiOutput;
}

async function main(): Promise<void> {
  console.log('\n[T5] TOOL ORCHESTRATION — FASE 5');

  await test('T5-01 [AGT-05] tiap tool terdaftar: skema + izin + idempotensi terdokumentasi', () => {
    resetAll();
    assert.equal(TOOL_REGISTRY_VERSION, 1, 'versi registry 1');
    assert.ok(EZRAB_AI_TOOLS.length >= 24, `tools.ts membawa >=24 tool (aktual ${EZRAB_AI_TOOLS.length})`);
    for (const t of EZRAB_AI_TOOLS) {
      const def = getToolDefinition(t.name);
      assert.ok(def, `tool ${t.name} terdaftar di registry`);
      assert.ok(Array.isArray(def!.inputSchema.fields), `${t.name}: punya skema input (array fields)`);
      // Tool tanpa argumen (mis. get_project_total) sah berskema kosong —
      // dinyatakan eksplisit di deskripsinya; sisanya wajib punya field.
      const noArgs = /tanpa argumen/i.test(t.description);
      assert.ok(def!.inputSchema.fields.length > 0 || noArgs, `${t.name}: punya skema input`);
      assert.ok(['read-only', 'draft', 'consequential'].includes(def!.permission), `${t.name}: punya permission`);
      assert.equal(typeof def!.idempotent, 'boolean', `${t.name}: perilaku idempotensi terdokumentasi`);
      assert.ok(def!.timeoutMs > 0, `${t.name}: timeout > 0`);
      assert.ok(def!.description.length > 20, `${t.name}: deskripsi bermakna`);
      if (def!.available) assert.equal(typeof def!.invoke, 'function', `${t.name}: tersedia → punya invoke`);
    }
    for (const def of listToolDefinitions()) {
      assert.ok(def.description.length > 0, `${def.name}: deskripsi ada`);
      assert.ok(def.source.length > 0, `${def.name}: sumber implementasi dicatat`);
      if (!def.available) assert.ok(def.unavailableReason, `${def.name}: tidak tersedia → alasan dicatat`);
    }
    assert.ok(listAvailableTools().length >= 30, `tool tersedia >= 30 (aktual ${listAvailableTools().length})`);
    assert.ok(COPILOT_ALLOWED_TOOLS.length > 0, 'subset Copilot tidak kosong');
    assert.ok(COPILOT_ALLOWED_TOOLS.every((n) => getToolDefinition(n)?.permission === 'read-only'), 'subset Copilot hanya read-only');
  });

  await test('T5-02 [AGT-08] input tak valid ditolak SEBELUM eksekusi (runner tidak jalan)', async () => {
    resetAll();
    const missing = await executeTool({ toolName: 'subtotal', args: { unitPrice: 100000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(missing.ok, false, 'field wajib hilang → tidak ok');
    assert.equal(missing.errorCode, 'INPUT_VALIDATION_FAILED', 'kode validasi input');
    assert.equal(missing.output, null, 'tidak ada output');
    assert.equal(missing.record.status, 'blocked', 'status blocked, bukan failed/running');
    const trail = getToolExecutionTrail(missing.record.executionId);
    assert.ok(!trail.some((r) => r.status === 'running' || r.status === 'succeeded'), 'tidak ada event running/succeeded — runner tidak dipanggil');
    const wrongType = await executeTool({ toolName: 'subtotal', args: { volume: 'abc', unitPrice: 100000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(wrongType.errorCode, 'INPUT_VALIDATION_FAILED', 'tipe salah → ditolak');
    const numericString = await executeTool({ toolName: 'subtotal', args: { volume: '2', unitPrice: 100000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(numericString.ok, true, 'string numerik diterima sebagai angka (konvensi validator)');
  });

  await test('T5-03 [AGT-08] hasil tak valid → failed/partial, bukan sukses', async () => {
    resetAll();
    const badDed = await executeTool({ toolName: 'extract_ded_specs', args: { dedOutput: {} }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(badDed.ok, false, 'dedOutput tanpa items → tidak ok');
    assert.equal(badDed.errorCode, 'OUTPUT_VALIDATION_FAILED', 'kode validasi output');
    assert.equal(badDed.record.status, 'failed', 'status failed');
    const badDraft = await executeTool({ toolName: 'build_universal_draft', args: { text: 'asdf qwer zxcv' }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(badDraft.ok, false, 'teks tanpa spek → draft gagal disusun');
    assert.equal(badDraft.errorCode, 'OUTPUT_VALIDATION_FAILED', 'ERROR: dari invoke → validasi output gagal');
    const partial = await executeTool({
      toolName: 'analyze_draft_costs',
      args: { items: [{ description: 'Item belum berharga', totalPrice: 1000, priceStatus: 'PRICE_UNRESOLVED' }] },
      projectId: PROJ, actor: 'model', channel: 'chat-ai',
    });
    assert.equal(partial.ok, true, 'analisis item tak berharga tetap ok');
    assert.equal(partial.record.status, 'partially-succeeded', 'status partially-succeeded (bukan succeeded penuh)');
  });

  await test('T5-04 [AGT-09] tool konsekwensial tanpa persetujuan → tidak dijalankan (awaiting-approval)', async () => {
    resetAll();
    const r = await executeTool({ toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(r.ok, false, 'tanpa approval → tidak ok');
    assert.equal(r.errorCode, 'APPROVAL_REQUIRED', 'kode approval');
    assert.equal(r.record.status, 'awaiting-approval', 'status awaiting-approval');
    const receipts = listToolExecutions(PROJ, 50).filter((e) => e.toolName === 'transfer_draft' && e.status === 'succeeded');
    assert.equal(receipts.length, 0, 'tidak ada receipt transfer — runner tidak jalan');
  });

  await test('T5-05 [AGT-09] approval model/system ditolak; hanya user yang menyetujui', async () => {
    resetAll();
    const byModel = await executeTool({
      toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: PROJ, actor: 'model',
      approval: { actor: 'model', approvedAt: new Date().toISOString() }, channel: 'chat-ai',
    });
    assert.equal(byModel.errorCode, 'APPROVAL_SELF_GRANT_DENIED', 'model tidak boleh memberi dirinya izin');
    assert.equal(byModel.record.status, 'failed', 'self-grant → failed');
    const bySystem = await executeTool({
      toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: PROJ, actor: 'model',
      approval: { actor: 'system', approvedAt: new Date().toISOString() }, channel: 'chat-ai',
    });
    assert.equal(bySystem.errorCode, 'APPROVAL_SELF_GRANT_DENIED', 'system juga bukan user');
    // Persetujuan user membuka gate (draft belum ada → invoke mengembalikan
    // ERROR kesiapan, BUKAN penolakan izin — izinnya lolos).
    const byUser = await executeTool({
      toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: PROJ, actor: 'user',
      approval: { actor: 'user', approvedAt: new Date().toISOString() }, channel: 'chat-ai',
    });
    assert.notEqual(byUser.errorCode, 'APPROVAL_REQUIRED', 'approval user tidak ditolak izin');
    assert.notEqual(byUser.errorCode, 'APPROVAL_SELF_GRANT_DENIED', 'approval user bukan self-grant');
  });

  await test('T5-06 [AGT-10] retry idempoten: efek samping tepat sekali (replay, tanpa invoke ulang)', async () => {
    resetAll();
    const key = 't5-06-subtotal';
    const args = { volume: 2, unitPrice: 100000 };
    const first = await executeTool({ toolName: 'subtotal', args, projectId: PROJ, actor: 'model', channel: 'chat-ai', idempotencyKey: key });
    assert.equal(first.ok, true, 'eksekusi pertama ok');
    assert.equal(first.record.replayed, false, 'pertama bukan replay');
    const second = await executeTool({ toolName: 'subtotal', args, projectId: PROJ, actor: 'model', channel: 'chat-ai', idempotencyKey: key });
    assert.equal(second.ok, true, 'retry ok');
    assert.equal(second.record.replayed, true, 'retry ditandai replayed');
    assert.equal(second.output, first.output, 'output replay identik');
    const runningEvents = listToolExecutions(PROJ, 200)
      .flatMap((e) => getToolExecutionTrail(e.executionId))
      .filter((r) => r.idempotencyKey === key && r.status === 'running');
    assert.equal(runningEvents.length, 1, 'hanya SATU event running untuk kunci ini — invoke tidak diulang');
    // Kunci turunan (tanpa kunci eksplisit) juga deterministik.
    const a = await executeTool({ toolName: 'subtotal', args: { volume: 3, unitPrice: 50000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    const b = await executeTool({ toolName: 'subtotal', args: { volume: 3, unitPrice: 50000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(b.record.replayed, true, 'kunci turunan sama → replay');
    assert.equal(a.output, b.output, 'output kunci turunan identik');
  });

  await test('T5-07 [NAV-09] eksekusi lintas-proyek ditolak; tool proyek tanpa projectId diblokir', async () => {
    resetAll();
    const cross = await executeTool({
      toolName: 'subtotal', args: { volume: 1, unitPrice: 1, projectId: PROJ_B }, projectId: PROJ, actor: 'model', channel: 'chat-ai',
    });
    assert.equal(cross.errorCode, 'PROJECT_SCOPE_MISMATCH', 'argumen proyek B vs scope A ditolak');
    assert.equal(cross.record.status, 'blocked', 'status blocked');
    const noProject = await executeTool({
      toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: null, actor: 'user',
      approval: { actor: 'user', approvedAt: new Date().toISOString() }, channel: 'chat-ai',
    });
    // args membawa projectId PROJ → effectiveProjectId terisi (bukan
    // PROJECT_REQUIRED di sini); izin lolos, invoke gagal kesiapan
    // karena belum ada draft — itu BUKAN penolakan scope.
    assert.notEqual(noProject.errorCode, 'PROJECT_REQUIRED', 'args.projectId mengisi scope');
    const noProjectAtAll = await executeTool({
      toolName: 'transfer_draft', args: { draftVersion: 1 }, projectId: null, actor: 'user',
      approval: { actor: 'user', approvedAt: new Date().toISOString() }, channel: 'chat-ai',
    });
    assert.equal(noProjectAtAll.errorCode, 'PROJECT_REQUIRED', 'tanpa projectId di mana pun → diblokir');
  });

  await test('T5-08 audit trail mencatat tiap eksekusi + dapat dibaca balik', async () => {
    resetAll();
    const s1 = await executeTool({ toolName: 'subtotal', args: { volume: 2, unitPrice: 100000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    const s2 = await executeTool({ toolName: 'navigate', args: { command: 'buka dashboard' }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(s1.ok, true, 'subtotal ok');
    assert.equal(s2.ok, true, 'navigate ok');
    const list = listToolExecutions(PROJ, 50);
    assert.ok(list.length >= 2, `trail proyek memuat >=2 eksekusi (aktual ${list.length})`);
    assert.ok(list.some((e) => e.toolName === 'subtotal'), 'trail memuat subtotal');
    assert.ok(list.some((e) => e.toolName === 'navigate'), 'trail memuat navigate');
    const trail1 = getToolExecutionTrail(s1.record.executionId);
    assert.ok(trail1.length >= 2, 'jejak satu eksekusi memuat running + selesai');
    assert.equal(trail1[0].status, 'running', 'jejak dimulai running');
    assert.equal(trail1[trail1.length - 1].status, 'succeeded', 'jejak berakhir succeeded');
    const latest = getToolExecution(s1.record.executionId);
    assert.equal(latest?.status, 'succeeded', 'getToolExecution mengembalikan status akhir');
    assert.ok(!JSON.stringify(trail1).includes('sk-'), 'trail tidak mengandung pola secret');
    const receipt = recordTransferReceipt({ projectId: PROJ, draftVersion: 1, draftTitle: 'Draft T5', pushed: 3, skipped: 1, conversationId: CONV });
    assert.equal(receipt.status, 'succeeded', 'receipt transfer tercatat succeeded');
    assert.ok(listToolExecutions(PROJ, 50).some((e) => e.executionId === receipt.executionId), 'receipt terbaca balik dari trail');
  });

  await test('T5-09 [ARS-04] pemanggilan wizard mati tidak mencapai endpoint (gagal tegas, tanpa fetch)', async () => {
    resetAll();
    let fetchCalled = 0;
    (globalThis as unknown as { fetch: unknown }).fetch = async () => {
      fetchCalled += 1;
      throw new Error('fetch tidak boleh dipanggil jalur wizard');
    };
    const methods: Array<() => Promise<unknown>> = [
      () => aiApiClient.startWizard(PROJ),
      () => aiApiClient.answerWizard('sess-1', 'c1'),
      () => aiApiClient.goBackWizard('sess-1'),
      () => aiApiClient.cancelWizard('sess-1'),
      () => aiApiClient.confirmWizard('sess-1', PROJ),
    ];
    for (const m of methods) {
      await assert.rejects(m(), (e: unknown) => (e as Error).message.includes('Wizard server tidak tersedia'), 'wizard melempar WIZARD_SERVER_NOT_IMPLEMENTED');
    }
    assert.equal(fetchCalled, 0, 'nol panggilan fetch ke /api/assistant/wizard/*');
    assert.ok(WIZARD_SERVER_NOT_IMPLEMENTED.includes('/api/assistant/wizard/*'), 'pesan menyebut endpoint mati');
    const viaRegistry = await executeTool({ toolName: 'wizard_server', args: {}, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(viaRegistry.errorCode, 'TOOL_UNAVAILABLE', 'registry memblokir wizard_server');
    assert.equal(viaRegistry.record.status, 'blocked', 'status blocked');
  });

  await test('T5-10 [ARS-05 TERTUTUP GATE 5] gerbang relevansi di jalur revisi menolak kontaminan (+ kalibrasi lantai kerja; direct/spec kini digerbang)', () => {
    resetAll();
    const draft = houseDraft(PROJ);
    const gated = draft.parts.find((p) => gateProjectIdFor(p.scope, draft.spec.rawText) != null);
    assert.ok(gated, 'draft kandang punya part dengan gerbang terkalibrasi');
    const gateId = gateProjectIdFor(gated!.scope, draft.spec.rawText)!;
    const before = gated!.generation.items.length;
    assert.ok(before > 0, 'part berisi item sebelum penyaringan');
    // Pilih kontaminan yang gerbang ini memang TOLAK (kalibrasi Wave E
    // berbeda per keluarga — jangan asumsikan satu frasa untuk semua).
    const candidates = ['Perkerasan aspal AC-WC', 'Pemasangan paving block', 'Perkerasan jalan beton', 'Pemasangan rambu lalu lintas'];
    const contaminants = candidates.filter((c) => classifyItemRelevance(c, gateId, draft.spec.scopes.map((s) => s.id)).level === 'REJECTED');
    assert.ok(contaminants.length >= 1, `ada kontaminan yang ditolak gerbang ${gateId}`);
    gated!.generation.items.push(...contaminants.map((c) => ({ description: c }) as never));
    const applied = applyRelevanceGateToPart(draft, gated!);
    assert.ok(applied.removed >= 1, `kontaminan gugur (>=1, aktual ${applied.removed})`);
    assert.ok(draft.warnings.some((w) => w.includes('Gerbang relevansi')), 'penyaringan tercatat di draft.warnings');
    assert.ok(!gated!.generation.items.some((i) => contaminants.includes(i.description)), 'kontaminan tidak tersisa di part');
    assert.ok(gated!.generation.items.length > 0, 'item sah tidak ikut terhapus');
    // DIPERBARUI TERBUKA (GATE 5 / 5E, 2026-11-12 — gelombang kalibrasi
    // yang tertunda dari Overhaul Fase 5): ARS-05 TERTUTUP. Signature
    // ROAD_ITEM_RE dikalibrasi (pengecualian "lantai kerja", dibuktikan
    // panen katalog: satu-satunya "rabat beton" lain adalah jalan
    // inspeksi tanggul yang tetap REJECTED) dan gerbang relevansi kini
    // DITEGAKKAN pada buildDirectRab/buildSpecRab (directRabGate).
    // Pin lama ("gerbang mentah menolak item sah itu") adalah pin
    // FALSE POSITIVE — diganti pin perilaku benar ini.
    // buildDirectRab butuh tipe rumah eksplisit ('type 70'); teks 'rumah
    // 10 x 8 m' tanpa tipe mengembalikan null (bukan bukti gerbang).
    const direct = buildDirectRab('Buatkan RAB rumah type 70 2 lantai');
    assert.ok(direct, 'buildDirectRab menghasilkan RAB rumah');
    // Item RAB direct ada di `calc.items` (hasil parametricVolumeEngine)
    // — bukan `items`/`generation.items` tingkat atas.
    const directItems = ((direct as unknown as { calc?: { items?: Array<{ name?: string; description?: string }> } }).calc?.items
      ?? (direct as unknown as { items?: Array<{ name?: string; description?: string }> }).items
      ?? []) as Array<{ name?: string; description?: string }>;
    const rabat = directItems.find((i) => /rabat beton/i.test(i.name ?? i.description ?? ''));
    assert.ok(rabat, 'RAB rumah direct MASIH memuat "Rabat Beton Lantai Kerja" (gerbang tidak membuang item sah)');
    assert.ok(
      !(direct as unknown as { warnings?: string[] }).warnings?.some((w) => w.includes('Gerbang relevansi')),
      'RAB rumah direct sah: NOL catatan gerbang',
    );
    const verdict = classifyItemRelevance('Rabat Beton Lantai Kerja Tebal 5 cm', 'rumah', []);
    assert.ok(
      verdict.level !== 'REJECTED' && verdict.level !== 'LOW',
      `kalibrasi Gate 5: gerbang mentah TIDAK BOLEH lagi menolak "Rabat Beton Lantai Kerja" (dapat ${verdict.level})`,
    );
    // Kalibrasi tidak membuka jalan kontaminan jalan yang sesungguhnya.
    assert.equal(
      classifyItemRelevance('Jalan Inspeksi Rabat Beton Sempit Sepanjang Tanggul', 'rumah', []).level,
      'REJECTED',
      'kalibrasi Gate 5: jalan inspeksi rabat beton TETAP ditolak untuk rumah',
    );
  });

  await test('T5-11 [ARS-06] draft tidak bocor lintas proyek (build + revise + persistensi intake)', () => {
    resetAll();
    const draft = houseDraft(PROJ);
    assert.equal(getLastUniversalDraft(PROJ_B), null, 'draft proyek A tidak terlihat dari proyek B');
    assert.equal(getLastUniversalDraft(PROJ)?.title, draft.title, 'draft terlihat dari proyek pemiliknya');
    const rev = reviseUniversalDraft(draft, 'ubah luas menjadi 800 m2', PROJ);
    assert.ok(rev, 'revisi dikenali');
    assert.equal(getLastUniversalDraft(PROJ_B), null, 'revisi tidak membocorkan draft ke proyek B');
    assert.equal(getLastUniversalDraft(PROJ)?.title, draft.title, 'revisi mempertahankan ikatan proyek A');
    // Konteks intake membawa projectId dan selamat dari serialize/rehydrate.
    const ctx = extractUniversalContext(HOUSE_TEXT);
    ctx.projectId = PROJ;
    const rehydrated = rehydrateUniversalIntakeContext(serializeUniversalIntakeContext(ctx));
    assert.equal(rehydrated?.projectId, PROJ, 'projectId intake bertahan lintas persistensi');
  });

  await test('T5-12 [ARS-03] Copilot mengeksekusi tool lewat registry yang sama (jejak identik)', async () => {
    resetAll();
    // 'navigate' adalah tool read-only native yang ADA di subset Copilot;
    // tool kalkulasi tools.ts (mis. subtotal) dapat dieksekusi semua kanal
    // (channels undefined = tanpa pembatasan) tetapi TIDAK masuk daftar
    // Copilot — batasan itu disengaja dan dicatat di laporan.
    const args = { command: 'buka dashboard' };
    const viaChat = await executeTool({ toolName: 'navigate', args, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    const viaCopilot = await executeTool({ toolName: 'navigate', args, projectId: PROJ, actor: 'model', channel: 'copilot' });
    assert.equal(viaChat.ok, true, 'Chat AI ok');
    assert.equal(viaCopilot.ok, true, 'Copilot ok');
    assert.equal(viaCopilot.output, viaChat.output, 'output identik lintas kanal');
    assert.equal(viaCopilot.record.channel, 'copilot', 'jejak mencatat kanal copilot');
    assert.equal(viaChat.record.channel, 'chat-ai', 'jejak mencatat kanal chat-ai');
    assert.equal(viaCopilot.record.status, viaChat.record.status, 'status identik');
    const blocked = await executeTool({ toolName: 'propose_add_item', args: {}, projectId: PROJ, actor: 'model', channel: 'copilot' });
    assert.equal(blocked.errorCode, 'TOOL_NOT_ALLOWED_ON_CHANNEL', 'tool tulis diblokir di kanal Copilot');
    assert.equal(blocked.record.status, 'blocked', 'status blocked');
    // Sumber yang sama: daftar Copilot berasal dari registry (bukan daftar kedua).
    assert.ok(COPILOT_ALLOWED_TOOLS.includes('navigate'), 'navigate ada di subset Copilot');
    assert.ok(!COPILOT_ALLOWED_TOOLS.includes('propose_add_item'), 'propose_add_item tidak ada di subset Copilot');
  });

  await test('T5-13 siklus eksekusi lengkap terlacak + langkah rencana berjalan lewat registry', async () => {
    resetAll();
    // blocked (validasi) + awaiting-approval + cancelled + failed + succeeded + partially-succeeded
    const blocked = await executeTool({ toolName: 'subtotal', args: {}, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(blocked.record.status, 'blocked', 'blocked tercapai');
    const awaiting = await executeTool({ toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(awaiting.record.status, 'awaiting-approval', 'awaiting-approval tercapai');
    const cancelled = cancelToolExecution(awaiting.record.executionId);
    assert.equal(cancelled?.status, 'cancelled', 'awaiting-approval dapat dibatalkan → cancelled');
    const failedRun = await executeTool({ toolName: 'extract_ded_specs', args: { dedOutput: {} }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(failedRun.record.status, 'failed', 'failed tercapai');
    const okRun = await executeTool({ toolName: 'subtotal', args: { volume: 1, unitPrice: 5000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(okRun.record.status, 'succeeded', 'succeeded tercapai');
    const okTrail = getToolExecutionTrail(okRun.record.executionId);
    assert.deepEqual(okTrail.map((r) => r.status), ['running', 'succeeded'], 'jejak succeeded = running → succeeded');
    const partialRun = await executeTool({
      toolName: 'analyze_draft_costs',
      args: { items: [{ description: 'X', totalPrice: 1, priceStatus: 'PRICE_UNRESOLVED' }] },
      projectId: PROJ, actor: 'model', channel: 'chat-ai',
    });
    assert.equal(partialRun.record.status, 'partially-succeeded', 'partially-succeeded tercapai');
    const doneAgain = cancelToolExecution(okRun.record.executionId);
    assert.equal(doneAgain?.status, 'succeeded', 'eksekusi selesai tidak dapat dibatalkan');
    // planned/ready: status cadangan di union ToolExecutionStatus untuk
    // orkestrator async masa depan — eksekutor sinkron ini langsung ke
    // 'running', sehingga keduanya TIDAK diemisikan di sini (dicatat di
    // laporan sebagai batasan, bukan diklaim tercapai).
    // Langkah rencana → registry (jembatan Fase 3 → Fase 5).
    const draft = houseDraft(PROJ);
    const stepRun = await runPlanStepWithRegistry(
      'validate-spec-chain',
      { projectId: PROJ, conversationId: CONV, planId: 'plan-t5', stepId: 'step-t5-1' },
      { draft, structuredSpecs: draft.structuredSpecs ?? [] },
      { actor: 'user', approval: { actor: 'user', approvedAt: new Date().toISOString() }, channel: 'orchestrator' },
    );
    assert.equal(stepRun.ok, true, 'langkah validate-spec-chain berjalan lewat registry');
    assert.ok(stepRun.output?.includes('Validasi rantai spek'), 'output langkah validasi tampil');
    const unmapped = await runPlanStepWithRegistry(
      'understand-objective',
      { projectId: PROJ, conversationId: CONV, planId: 'plan-t5', stepId: 'step-t5-0' },
      {},
      { actor: 'user', channel: 'orchestrator' },
    );
    assert.equal(unmapped.errorCode, 'STEP_HAS_NO_REGISTRY_RUNNER', 'langkah tanpa runner diblokir jujur (bukan ditebak tool lain)');
    assert.ok(PLAN_STEP_TOOL_MAP['validate-spec-chain'] === 'validate_spec_chain', 'peta langkah→tool tercatat');
  });

  await test('T5-14 [DED/QTO] reader DED + bridge QTO ter-wire (tool, seksi kanonis, memori)', async () => {
    resetAll();
    const ded = dedFixture();
    const extracted = await executeTool({ toolName: 'extract_ded_specs', args: { dedOutput: ded }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(extracted.ok, true, 'extract_ded_specs ok');
    assert.ok(extracted.output?.includes('Pemahaman DED'), 'output memuat pemahaman DED');
    assert.ok(extracted.output?.includes('DATA HILANG'), 'data hilang dinyatakan eksplisit');
    const checks = checkQtoAgainstUserDimensions(
      [{ description: 'Beton K-300', quantity: 12, unit: 'm3' }],
      { buildingAreaM2: 80 },
    );
    const qto = await executeTool({
      toolName: 'check_qto',
      args: { items: [{ description: 'Beton K-300', quantity: 12, unit: 'm3' }], dimensions: { buildingAreaM2: 80 } },
      projectId: PROJ, actor: 'model', channel: 'chat-ai',
    });
    assert.equal(qto.ok, true, 'check_qto ok');
    assert.equal(qto.output, buildQtoSection(checks), 'seksi QTO = baris pemeriksaan yang sama');
    // Seksi DED/QTO di builder kanonis.
    const dedSection = buildDedSection(ded);
    const qtoSection = buildQtoSection(checks);
    const built = buildCanonicalContext({
      userId: null, projectId: PROJ, conversationId: CONV,
      messages: [{ role: 'user', content: 'Berapa spek beton dari DED?' }],
      dedSection, qtoSection,
    });
    assert.ok(built.dataBlock.includes('PEMAHAMAN DED'), 'builder memuat seksi DED');
    assert.ok(built.dataBlock.includes('PEMERIKSAAN QTO'), 'builder memuat seksi QTO');
    assert.equal(built.report.sections.ded.included, 1, 'laporan: seksi DED termasuk');
    assert.equal(built.report.sections.qto.included, 1, 'laporan: seksi QTO termasuk');
    assert.equal(built.report.budget.ded, 800, 'anggaran DED 800 saat seksi ada');
    const builtEmpty = buildCanonicalContext({
      userId: null, projectId: PROJ, conversationId: CONV,
      messages: [{ role: 'user', content: 'Halo' }],
    });
    assert.equal(builtEmpty.report.budget.ded, 0, 'tanpa seksi DED anggaran 0 (pin Fase 1 tidak berubah)');
    assert.equal(builtEmpty.report.budget.qto, 0, 'tanpa seksi QTO anggaran 0');
    // Hasil DED → memori proyek Fase 2 (dapat dibaca balik).
    const recorded = recordDedUnderstandingToMemory(scope, ded);
    assert.equal(recorded.ok, true, `DED direkam ke memori: ${recorded.message}`);
    const mems = retrieveMemories(scope, 'DED').selected;
    assert.ok(mems.some((m) => m.memoryKey === 'ded:understanding'), 'memori ded:understanding terbaca balik');
    const again = recordDedUnderstandingToMemory(scope, ded);
    assert.equal(again.ok, true, 'analisis ulang menggantikan record lama (explicitReplacement), bukan konflik');
  });

  console.log(`\nTOOL ORCHESTRATION (FASE 5): ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log(`Gagal: ${failedNames.join(' | ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('T5 fatal:', e);
  process.exit(1);
});
