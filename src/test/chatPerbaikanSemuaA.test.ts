/**
 * chatPerbaikanSemuaA.test.ts — GELOMBANG "PERBAIKI SEMUA", klaster view.tsx
 * (direktif koordinator 2026-11-13, LOCAL ONLY).
 *
 * Membuktikan 5 butir klaster A:
 *  1. CHAT-08 — wajah kegagalan UI Chat AI (pesan jujur + panduan + Coba Lagi)
 *  2. F-6B    — retry menggantikan error di STORE tersimpan (bukan hanya tampilan)
 *  3. Temuan Fase 6 §11.5 — langkah kuesioner mencapai `succeeded`
 *  4. F3-R2   — `opts` diteruskan ke `detectHandoffNeed`
 *  5. Emoji 🎤 — 0 emoji pada string status voice-input di view.tsx
 *
 * Gaya plain-tsx (pola suite Fase 5/6):
 *   npx --yes tsx src/test/chatPerbaikanSemuaA.test.ts
 *
 * view.tsx tidak dapat di-mount di Node (komponen React + impor CSS),
 * jadi wiring view dibuktikan asersi sumber (pola S-01..S-08 lifecycle /
 * F6-S15) — sementara perilaku yang dapat dieksekusi diuji pada jalur
 * NYATA: markQuestionnaireStepCompleted (agentOrchestrator murni),
 * detectHandoffNeed (magicHandoff murni), dan unifiedConversationStore
 * (append/update + simulasi reload lewat resetInstance atas storage
 * yang sama). Replay F-6B memanggil API store yang PERSIS SAMA dengan
 * yang dipanggil persistMessage baru di view.tsx (appendMessage lalu
 * updateMessage pada id yang sama).
 *
 * Provider nyata: NOT RUN (0 panggilan). Tanpa tsc/build/E2E di sini.
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS ${name}`);
    })
    .catch((e: unknown) => {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(name);
      console.log(`  FAIL ${name}: ${msg}`);
    });
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');

/* ---------- localStorage shim (node) — pola chatPhase5Persistence ---------- */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    __dump: () => new Map(map),
  };
}
const storage = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;
/* Store hanya membaca/menulis storage bila `window` ada (pola Fase 6:
 * chatPersistentRuntimePhase6.test.ts:83) — tanpa ini save/load
 * early-return dan simulasi reload tidak menguji apa pun. */
(globalThis as { window?: unknown }).window = globalThis;

const PROJECT = 'proj-perbaikan-semua-a';
const ERR_TEXT = 'Layanan AI gagal memproses permintaan. [MARKER-ERROR-F6B]';
const SUCCESS_TEXT = 'Jawaban sukses sesudah retry. [MARKER-SUKSES-F6B]';

async function main() {
  console.log('chatPerbaikanSemuaA — GELOMBANG PERBAIKI SEMUA, klaster view.tsx');

  const view = read('src/ai-tools/ezrab-ai/view.tsx');
  const orch = read('src/ai-tools/ezrab-ai/agentOrchestrator.ts');

  const {
    deriveObjective,
    buildPlanForObjective,
    markQuestionnaireStepCompleted,
  } = await import('../ai-tools/ezrab-ai/agentOrchestrator');
  const { detectHandoffNeed } = await import('../ai-tools/ezrab-ai/magicHandoff');
  const { UnifiedConversationStore } = await import(
    '../services/ai/conversation/unifiedConversationStore'
  );

  /* ================= 3. KUESIONER → succeeded ================= */

  await check('Q-01 langkah kuesioner running → succeeded (+completedAt, +result, saudara utuh)', () => {
    const objective = deriveObjective('buatkan rab gudang 12x20 meter', 'CREATE_RAB_DIRECT');
    assert(objective.goal === 'build-rab', `goal harus build-rab, dapat ${objective.goal}`);
    const plan = buildPlanForObjective(objective, { userId: null, projectId: PROJECT, conversationId: 'conv-q' });
    const q = plan.steps.find((s: { kind: string }) => s.kind === 'collect-specs-questionnaire');
    assert(q, 'rencana build-rab harus punya langkah collect-specs-questionnaire');
    // Keadaan Fase 6: kartu tampil → running (view.tsx postAssistant).
    const running = {
      ...plan,
      steps: plan.steps.map((s: { kind: string }) =>
        s.kind === 'collect-specs-questionnaire'
          ? { ...s, status: 'running', startedAt: new Date().toISOString() }
          : s,
      ),
    };
    const next = markQuestionnaireStepCompleted(running, 'Kuesioner spesifikasi dijawab — spek terkumpul.');
    const step = next.steps.find((s: { kind: string }) => s.kind === 'collect-specs-questionnaire');
    assert(step.status === 'succeeded', `status harus succeeded, dapat ${step.status}`);
    assert(typeof step.completedAt === 'string' && step.completedAt.length > 0, 'completedAt harus terisi');
    assert(step.result === 'Kuesioner spesifikasi dijawab — spek terkumpul.', 'result harus mencatat jawaban diterima');
    assert(step.error === null, 'error harus bersih');
    const others = next.steps.filter((s: { kind: string }) => s.kind !== 'collect-specs-questionnaire');
    assert(others.every((s: { status: string }) => s.status !== 'succeeded' || s.kind === 'understand-objective'), 'langkah lain tidak ikut berubah');
  });

  await check('Q-02 no-op bila tak ada langkah kuesioner; langkah terminal tidak ditimpa', () => {
    const objective = deriveObjective('halo', 'GREETING');
    const plan = buildPlanForObjective(objective, { userId: null, projectId: PROJECT, conversationId: 'conv-q2' });
    assert(!plan.steps.some((s: { kind: string }) => s.kind === 'collect-specs-questionnaire'), 'rencana greeting tidak punya langkah kuesioner');
    const same = markQuestionnaireStepCompleted(plan, 'x');
    assert(same === plan, 'tanpa langkah kuesioner harus no-op (objek sama)');

    const rab = buildPlanForObjective(
      deriveObjective('buatkan rab gudang 12x20 meter', 'CREATE_RAB_DIRECT'),
      { userId: null, projectId: PROJECT, conversationId: 'conv-q3' },
    );
    const done = {
      ...rab,
      steps: rab.steps.map((s: { kind: string }) =>
        s.kind === 'collect-specs-questionnaire'
          ? { ...s, status: 'succeeded', completedAt: '2026-11-13T00:00:00.000Z', result: 'lama' }
          : s,
      ),
    };
    const kept = markQuestionnaireStepCompleted(done, 'hasil terlambat');
    const step = kept.steps.find((s: { kind: string }) => s.kind === 'collect-specs-questionnaire');
    assert(step.completedAt === '2026-11-13T00:00:00.000Z', 'completedAt terminal tidak boleh ditimpa');
    assert(step.result === 'lama', 'result terminal tidak boleh ditimpa');
  });

  await check('Q-03 view: handleQuestionnaireSubmit menandai succeeded hanya bila jawaban DITERIMA', () => {
    assert(orch.includes('export function markQuestionnaireStepCompleted'), 'helper harus ada di agentOrchestrator.ts');
    assert(view.includes('markQuestionnaireStepCompleted,'), 'view harus mengimpor markQuestionnaireStepCompleted');
    assert(view.includes('markQuestionnaireStepCompleted(p,'), 'view harus memanggil helper pada rencana');
    // Penanda hanya bila ok + tanpa kartu tanya-ulang (penolakan validasi
    // membawa questionnaire; konteks-hilang membawa ok:false).
    assert(view.includes('if (res.ok && !res.questionnaire)'), 'penanda harus digerbang res.ok && !res.questionnaire');
    const idxHandler = view.indexOf('const handleQuestionnaireSubmit');
    const idxMark = view.indexOf('markQuestionnaireStepCompleted(p,');
    assert(idxHandler !== -1 && idxMark > idxHandler, 'pemanggilan harus di dalam handleQuestionnaireSubmit');
    assert(idxMark - idxHandler < 2500, 'pemanggilan harus dekat di dalam handler yang sama');
  });

  /* ================= 4. F3-R2 — opts ke detectHandoffNeed ================= */

  await check('H-01 detectHandoffNeed: opts benar-benar mengubah hasil (lantai & lampiran)', () => {
    const plain = detectHandoffNeed('tolong buatkan denah rumah tinggal sederhana');
    assert(!plain.needed, 'teks polos tanpa opts tidak boleh memicu handoff');
    const tall = detectHandoffNeed('tolong buatkan denah rumah tinggal sederhana', { floors: 6 });
    assert(tall.needed, 'floors=6 harus memicu handoff');
    assert(tall.signals.includes('bangunan 6 lantai'), `sinyal harus memuat 'bangunan 6 lantai', dapat ${JSON.stringify(tall.signals)}`);
    assert(typeof tall.reason === 'string' && tall.reason.length > 0, 'reason harus terisi');
    const files = detectHandoffNeed('tolong buatkan denah rumah tinggal sederhana', { attachmentCount: 2 });
    assert(files.needed, 'attachmentCount=2 harus memicu handoff');
    assert(files.signals.includes('banyak dokumen'), `sinyal harus memuat 'banyak dokumen', dapat ${JSON.stringify(files.signals)}`);
    const low = detectHandoffNeed('tolong buatkan denah rumah tinggal sederhana', { floors: 2, attachmentCount: 0 });
    assert(!low.needed, 'floors=2 + 0 lampiran tidak boleh memicu handoff');
  });

  await check('H-02 view: call site meneruskan opts { floors, attachmentCount }', () => {
    assert(!view.includes('detectHandoffNeed(msg);'), 'call site lama tanpa opts harus hilang');
    assert(view.includes('detectHandoffNeed(msg, {'), 'call site harus meneruskan opts');
    assert(view.includes('parseFloorsMention(msg)'), 'floors harus dari penyebutan di pesan ini');
    assert(view.includes('getUniversalContextState()'), 'floors fallback harus dari konteks intake yang hidup');
    assert(view.includes('attachmentCount: attached ? 1 : 0'), 'attachmentCount harus dari slot lampiran sesi ini');
    assert(view.includes('parseFloorsMention'), 'parseFloorsMention harus diimpor view');
    // Signature magicHandoff.ts TIDAK berubah (pagar tugas).
    const handoff = read('src/ai-tools/ezrab-ai/magicHandoff.ts');
    assert(
      handoff.includes('opts?: { floors?: number | null; attachmentCount?: number }'),
      'signature detectHandoffNeed di magicHandoff.ts harus tetap seperti semula',
    );
  });

  /* ================= 5. EMOJI 🎤 ================= */

  await check('E-01 view.tsx bebas emoji 🎤 (0 kemunculan)', () => {
    assert(!view.includes('🎤'), 'view.tsx masih memuat 🎤');
  });

  await check('E-02 keempat string voice-input tetap ada sebagai teks polos setara', () => {
    assert(view.includes('Browser ini tidak mendukung voice input. Coba buka di Chrome Android/desktop ya.'), 'pesan browser-tak-dukung harus tetap ada tanpa emoji');
    assert(view.includes('Izin mikrofon ditolak. Izinkan akses mic di pengaturan browser ya.'), 'pesan izin-ditolak harus tetap ada tanpa emoji');
    assert(view.includes('Voice input gagal. Coba ketik manual ya.'), 'pesan voice-gagal harus tetap ada tanpa emoji');
    assert(view.includes('Mendengarkan… bicara sekarang'), 'indikator mendengarkan harus tetap ada tanpa emoji');
  });

  await check('E-03 tidak ada emoji baru yang diselipkan pada wajah kegagalan (🥺 hilang)', () => {
    assert(!view.includes('🥺'), 'view.tsx masih memuat 🥺 (fallback catch lama)');
    assert(!view.includes('Ups! Ada gangguan'), 'fallback catch generik lama harus hilang');
  });

  /* ================= 1. CHAT-08 — wajah kegagalan ================= */

  await check('C-01 formatter kegagalan ada + dipakai di KEDUA situs kegagalan LLM', () => {
    assert(view.includes('function formatAiFailureMessage('), 'formatAiFailureMessage harus didefinisikan di view.tsx');
    // Situs 1: service mengembalikan !success (res.reply generik).
    assert(view.includes('res.reply = formatAiFailureMessage(res.reply,'), 'cabang !success harus memperkaya res.reply sebelum ditampilkan');
    // Situs 2: catch (throw / abort non-eksplisit).
    assert(view.includes("formatAiFailureMessage(err?.message"), 'cabang catch harus memakai formatter yang sama');
    // Pesan layanan dipertahankan sebagai baris pertama (tidak dikarang ulang).
    const fmt = view.slice(view.indexOf('function formatAiFailureMessage('));
    assert(fmt.includes("let base = (serviceMessage || '').trim();"), 'formatter harus memakai pesan layanan sebagai basis');
    assert(fmt.includes("if (!base) base = 'Layanan AI gagal memproses permintaan.';"), 'formatter harus punya fallback generik bila pesan kosong');
  });

  await check('C-02 panduan ada: Coba Lagi + persingkat/percabapan baru + data tersimpan', () => {
    const fmt = view.slice(view.indexOf('function formatAiFailureMessage('), view.indexOf('interface EzrabAiViewProps'));
    assert(fmt.includes('Coba Lagi'), 'panduan harus menyebut tombol Coba Lagi');
    assert(fmt.includes('persingkat pesan atau mulai percakapan baru'), 'panduan harus menawarkan persingkat / percakapan baru');
    assert(fmt.includes('Pesan dan draft Anda tetap tersimpan'), 'panduan harus meyakinkan data tidak hilang');
    assert(fmt.includes('CONTEXT_BUDGET_EXCEEDED'), 'formatter harus membedakan kode konteks/validasi (persingkat dulu)');
    assert(fmt.includes('CONTENT_REJECTED'), 'formatter harus membedakan penolakan konten');
  });

  await check('C-03 tombol/aksi Coba Lagi tetap utuh + lewat jalur retry lifecycle yang sama', () => {
    assert(
      view.includes('m.isError && m.fromAi && i === messages.length - 1 && getRetryPrompt()'),
      'kondisi tombol Coba Lagi pada gelembung error AI harus utuh',
    );
    assert(view.includes('onClick={retryLastAi}'), 'tombol Coba Lagi harus memanggil retryLastAi');
    assert(view.includes('void submit(prompt, { echo: false })'), 'retryLastAi harus memakai submit echo=false (jalur lifecycle, tanpa jalur retry baru)');
    // Banner INTERRUPTED + Coba Lagi-nya tidak disentuh.
    assert(view.includes('interruptedPrompt && !busy'), 'banner INTERRUPTED harus tetap ada');
  });

  await check('C-04 pin aiCancellationPropagation #5 selamat: persist sesudah isCurrent', () => {
    const submitSection = view.slice(view.indexOf('const sendPromise = ezrabAiService.send'));
    const idxLatest = submitSection.indexOf('llmExec.isCurrent()');
    const idxPersist = submitSection.indexOf("persistMessage('assistant', res.reply)");
    assert(idxLatest !== -1, 'cek isCurrent harus ada pada jalur pengiriman LLM');
    assert(idxPersist > idxLatest, 'persistMessage(res.reply) harus tetap sesudah cek isCurrent');
  });

  /* ================= 2. F-6B — retry menggantikan record tersimpan ================= */

  await check('F-01 store: retry mengganti isi error tersimpan; riwayat sukses utuh; reload bersih', () => {
    storage.clear();
    UnifiedConversationStore.resetInstance();
    const store = UnifiedConversationStore.getInstance();
    const conv = store.getOrCreateActiveConversation(PROJECT);
    // Riwayat sukses SEBELUM kegagalan (harus selamat dari retry).
    store.appendMessage(conv.id, PROJECT, { role: 'user', content: 'Jelaskan pondasi foot plat' });
    store.appendMessage(conv.id, PROJECT, { role: 'assistant', content: 'Foot plat adalah pondasi tapak beton. [SUKSES-LAMA]' });
    // Giliran gagal: pesan user + error AI (persistMessage baru
    // mengembalikan id — di sini appendMessage mengembalikan AIMessage).
    store.appendMessage(conv.id, PROJECT, { role: 'user', content: 'Jelaskan perbedaan sloof dan balok' });
    const errMsg = store.appendMessage(conv.id, PROJECT, { role: 'assistant', content: ERR_TEXT });
    assert(typeof errMsg.id === 'string' && errMsg.id.length > 0, 'appendMessage harus mengembalikan id (dipakai pelacak F-6B)');

    // --- RETRY: persis yang dilakukan persistMessage baru di view.tsx
    // (updateMessage pada id error, bukan append baru). ---
    store.updateMessage(conv.id, PROJECT, errMsg.id, { content: SUCCESS_TEXT });

    const after = store.getConversation(conv.id, PROJECT);
    assert(after !== null, 'percakapan harus terbaca sesudah retry');
    const msgs = after!.messages;
    assert(msgs.length === 4, `harus tetap 4 pesan (tanpa duplikasi), dapat ${msgs.length}`);
    assert(msgs[0].content === 'Jelaskan pondasi foot plat', 'pesan user lama utuh');
    assert(msgs[1].content.includes('[SUKSES-LAMA]'), 'balasan sukses lama TIDAK BOLEH disentuh retry');
    assert(msgs[2].content === 'Jelaskan perbedaan sloof dan balok', 'pesan user giliran gagal utuh (tanpa duplikat)');
    assert(msgs[3].content === SUCCESS_TEXT, 'entry error harus diganti balasan sukses retry');
    assert(msgs[3].id === errMsg.id, 'penggantian memakai slot record yang sama (id utuh)');
    assert(!msgs.some((m: { content: string }) => m.content.includes('[MARKER-ERROR-F6B]')), 'teks error tidak boleh tersisa di store');

    // --- RELOAD: instance baru atas storage yang sama (proses browser
    // baru) — inilah repro F-6B: error lama bangkit di samping sukses. ---
    UnifiedConversationStore.resetInstance();
    const reloaded = UnifiedConversationStore.getInstance().getConversation(conv.id, PROJECT);
    assert(reloaded !== null, 'percakapan harus pulih sesudah reload');
    assert(reloaded!.messages.length === 4, `sesudah reload harus tetap 4 pesan, dapat ${reloaded!.messages.length}`);
    assert(!reloaded!.messages.some((m: { content: string }) => m.content.includes('[MARKER-ERROR-F6B]')), 'sesudah reload: error lama TIDAK BOLEH bangkit lagi');
    assert(reloaded!.messages[3].content === SUCCESS_TEXT, 'sesudah reload: balasan sukses tetap di tempatnya');
    // Bukti mentah: JSON storage sendiri tidak memuat teks error.
    const raw = storage.getItem('ezrab_unified_conversations_v2') ?? '';
    assert(!raw.includes('[MARKER-ERROR-F6B]'), 'JSON storage mentah tidak boleh memuat teks error');
    assert(raw.includes('[MARKER-SUKSES-F6B]'), 'JSON storage mentah harus memuat balasan sukses');
  });

  await check('F-02 retry gagal lagi: error baru mengganti error lama (tetap 1 entry, tanpa akumulasi)', () => {
    storage.clear();
    UnifiedConversationStore.resetInstance();
    const store = UnifiedConversationStore.getInstance();
    const conv = store.getOrCreateActiveConversation(PROJECT);
    store.appendMessage(conv.id, PROJECT, { role: 'user', content: 'Tanya X' });
    const e1 = store.appendMessage(conv.id, PROJECT, { role: 'assistant', content: 'Gagal percobaan 1 [E1]' });
    // Retry 1 gagal lagi → ganti isi slot yang sama.
    store.updateMessage(conv.id, PROJECT, e1.id, { content: 'Gagal percobaan 2 [E2]' });
    // Retry 2 sukses → ganti lagi slot yang sama.
    store.updateMessage(conv.id, PROJECT, e1.id, { content: 'Sukses percobaan 3 [S3]' });
    const msgs = store.getConversation(conv.id, PROJECT)!.messages;
    assert(msgs.length === 2, `tiga percobaan harus tetap 2 pesan, dapat ${msgs.length}`);
    assert(msgs[1].content === 'Sukses percobaan 3 [S3]', 'slot harus memuat hasil terakhir');
    assert(!msgs.some((m: { content: string }) => m.content.includes('[E1]') || m.content.includes('[E2]')), 'error percobaan lama tidak boleh menumpuk');
  });

  await check('F-03 updateMessage id tak dikenal melempar (jalur fallback append view terjangkau)', () => {
    storage.clear();
    UnifiedConversationStore.resetInstance();
    const store = UnifiedConversationStore.getInstance();
    const conv = store.getOrCreateActiveConversation(PROJECT);
    let threw = false;
    try {
      store.updateMessage(conv.id, PROJECT, 'msg-tidak-ada', { content: 'x' });
    } catch {
      threw = true;
    }
    assert(threw, 'updateMessage id tak dikenal harus melempar agar fallback view terpanggil');
  });

  await check('F-04 view: wiring penggantian record tersimpan lengkap', () => {
    // persistMessage mengembalikan id + memakai updateMessage sekali pakai.
    assert(view.includes('const persistMessage = (role: \'user\' | \'assistant\', content: string): string | null =>'), 'persistMessage harus mengembalikan id tersimpan');
    assert(view.includes('unifiedConversationStore.updateMessage(convId, storeProjectId, replacesId, { content })'), 'persistMessage harus memanggil updateMessage pada id error');
    assert(view.includes('retryReplacesMessageIdRef.current = null;'), 'penanda penggantian harus sekali-pakai (dibersihkan saat dipakai)');
    // Pelacak error diisi di kedua situs kegagalan.
    assert(view.includes('lastAiErrorMessageIdRef.current = res.success ? null : persistedReplyId;'), 'cabang LLM harus melacak id error tersimpan');
    assert(view.includes('lastAiErrorMessageIdRef.current = persistedErrId;'), 'cabang catch harus melacak id error tersimpan');
    // Cabang retry mengisi penanda hanya bila yang dibersihkan error AI.
    assert(view.includes('removedAiError = cleaned[i].fromAi === true;'), 'retry harus membedakan error AI dari error lokal');
    assert(view.includes('if (removedAiError && lastAiErrorMessageIdRef.current)'), 'penggantian hanya bila error AI yang dibersihkan');
    // Penanda dibersihkan di awal setiap submit (anti-bocor).
    const submitHead = view.slice(view.indexOf('const submit = async'), view.indexOf('const submit = async') + 1200);
    assert(submitHead.includes('retryReplacesMessageIdRef.current = null;'), 'penanda harus dibersihkan di awal submit');
  });

  await check('F-05 pagar: executionRuntime.ts tidak disentuh klaster ini', () => {
    // Klaster ini tidak membutuhkan perubahan runtime: penggantian
    // record adalah urusan store + view, bukan registry eksekusi.
    const runtime = read('src/ai-tools/ezrab-ai/executionRuntime.ts');
    assert(!runtime.includes('retryReplaces') && !runtime.includes('lastAiErrorMessageId'), 'executionRuntime.ts tidak boleh memuat logika F-6B klaster ini');
  });

  console.log(`\nchatPerbaikanSemuaA: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`Gagal: ${failures.join(', ')}`);
    process.exit(1);
  }
}

void main();
