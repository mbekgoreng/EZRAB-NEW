/**
 * chatPersistentExecution.test — Eksekusi AI persisten & siklus navigasi
 * (Lifecycle Fix 2026-11-12, direktif master owner 2026-11-12 01:58 WIB).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPersistentExecution.test.ts`
 *
 * Pemetaan transport (direktif §11): aplikasi ini TIDAK memakai stream
 * token — providerClient adalah satu fetch + resp.json() utuh, lalu hasil
 * ditampilkan sesudah gerbang minimum (waitForMinimum/waitForRabMinimum).
 * Maka "streaming" diuji pada ekuivalen nyatanya:
 * - STR-01/02/04: kontinuitas fetch (signal runtime mencapai fetch;
 *   abort eksplisit membatalkan fetch; abort satu request tidak
 *   meng-abort request lain).
 * - STR-03: gerbang minimum (waitForMinimum) memakai signal runtime:
 *   dibatalkan hanya oleh abort eksplisit, BUKAN oleh unmount.
 * - STR-05/06/07: identitas & keaktualan request (idempotencyKey,
 *   isCurrent, finish idempotent).
 * NAV/CAN/PER diuji pada executionRuntime (registry modul yang tidak
 * unmount) + asersi sumber pada view.tsx (kepemilikan eksekusi pindah
 * dari komponen ke runtime; tidak ada cleanup abort saat unmount).
 *
 * Yang TIDAK diuji di sini (kelas bukti terpisah, lihat LAPORAN-AKHIR):
 * - E2E browser nyata (navigasi menu saat generasi berjalan).
 * - Provider nyata (pola Wave D, ≤15 panggilan).
 * - Server-side resume sesudah reload (gateway stateless — jaminan B
 *   adalah INTERRUPTED + Coba Lagi manual, bukan kelanjutan provider).
 */

import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS ${name}`);
    })
    .catch((e: any) => {
      failed += 1;
      console.log(`  FAIL ${name}: ${e?.message ?? e}`);
    });
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log('chatPersistentExecution.test');
  const rt = await import('../ai-tools/ezrab-ai/executionRuntime');
  const { waitForMinimum } = await import('../ai-tools/aiResponseTiming');

  // ================= NAV — siklus navigasi =================
  await check('NAV-01 unmount (unsubscribe) TIDAK membatalkan eksekusi aktif', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    let calls = 0;
    const unsub = rt.subscribeExecution('conv-a', () => { calls += 1; });
    calls = 0;
    unsub(); // = komponen dilepas saat navigasi
    assert(rt.getActiveExecution('conv-a') !== null, 'eksekusi tetap aktif sesudah unsubscribe');
    assert(rt.getExecution(h.record.requestId)?.status === 'generating', 'status tetap generating');
    assert(h.signal.aborted === false, 'signal TIDAK aborted oleh unsubscribe');
    rt.finishExecution(h.record.requestId, 'completed');
  });

  await check('NAV-02 dua percakapan berbeda berjalan independen', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    const b = rt.beginExecution('conv-b', 'proj-1');
    assert(rt.getActiveExecution('conv-a')?.requestId === a.record.requestId, 'A aktif');
    assert(rt.getActiveExecution('conv-b')?.requestId === b.record.requestId, 'B aktif');
    rt.finishExecution(a.record.requestId, 'completed');
    assert(rt.getActiveExecution('conv-b') !== null, 'B tetap aktif sesudah A selesai');
    rt.finishExecution(b.record.requestId, 'completed');
  });

  await check('NAV-03 submit baru menggantikan (supersede) yang lama tanpa membatalkannya paksa', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    const b = rt.beginExecution('conv-a', 'proj-1');
    assert(rt.getExecution(a.record.requestId)?.superseded === true, 'A ditandai superseded');
    assert(a.signal.aborted === false, 'A TIDAK di-abort paksa (pekerjaannya boleh selesai diam-diam)');
    assert(rt.getActiveExecution('conv-a')?.requestId === b.record.requestId, 'B yang aktif');
    assert(a.isCurrent() === false, 'handle A bukan current');
    assert(b.isCurrent() === true, 'handle B current');
    rt.finishExecution(b.record.requestId, 'completed');
  });

  await check('NAV-04 hasil lama yang selesai sesudah digantikan tidak menimpa yang baru', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    const b = rt.beginExecution('conv-a', 'proj-1');
    const finA = rt.finishExecution(a.record.requestId, 'completed');
    assert(finA?.status === 'completed', 'finish A tercatat pada record A');
    assert(rt.getLastExecution('conv-a')?.requestId === b.record.requestId, 'latest tetap B');
    assert(rt.getActiveExecution('conv-a')?.requestId === b.record.requestId, 'B tetap aktif');
    rt.finishExecution(b.record.requestId, 'completed');
  });

  await check('NAV-05 langganan menerima status generating lalu completed; unsubscribe tidak membunuh eksekusi', () => {
    rt.__resetExecutionRuntimeForTests();
    const seen: string[] = [];
    const unsub = rt.subscribeExecution('conv-a', (rec) => { if (rec) seen.push(rec.status); });
    const h = rt.beginExecution('conv-a', 'proj-1');
    assert(seen.includes('generating'), `langganan menerima generating (dapat: ${seen.join(',')})`);
    unsub();
    rt.finishExecution(h.record.requestId, 'completed');
    assert(rt.getLastExecution('conv-a')?.status === 'completed', 'eksekusi selesai walau tanpa langganan');
  });

  await check('NAV-06 hanya eksekusi terbaru yang aktif per percakapan', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    rt.beginExecution('conv-a', 'proj-1');
    rt.beginExecution('conv-a', 'proj-1');
    const active = rt.getActiveExecution('conv-a');
    assert(active !== null && active.requestId !== a.record.requestId, 'aktif = yang terbaru, bukan A');
    assert(rt.getExecution(a.record.requestId)?.superseded === true, 'A superseded');
  });

  await check('NAV-07 record terakhir tetap terbaca sesudah selesai (untuk remount)', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.finishExecution(h.record.requestId, 'completed');
    const last = rt.getLastExecution('conv-a');
    assert(last?.status === 'completed', 'last = completed');
    assert(last?.requestId === h.record.requestId, 'last = request yang sama');
    assert(rt.getActiveExecution('conv-a') === null, 'tidak ada yang aktif');
    assert(rt.getExecution(h.record.requestId)?.status === 'completed', 'getExecution per requestId tetap bisa');
  });

  await check('NAV-08 request tetap terikat proyek asalnya', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-A');
    const b = rt.beginExecution('conv-b', 'proj-B');
    assert(rt.getExecution(a.record.requestId)?.projectId === 'proj-A', 'A terikat proj-A');
    assert(rt.getExecution(b.record.requestId)?.projectId === 'proj-B', 'B terikat proj-B');
    rt.finishExecution(a.record.requestId, 'completed');
    rt.finishExecution(b.record.requestId, 'completed');
  });

  await check('NAV-09 releaseConversation menolak menghapus eksekusi yang masih berjalan', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.releaseConversation('conv-a');
    assert(rt.getActiveExecution('conv-a') !== null, 'record dipertahankan selama berjalan');
    rt.finishExecution(h.record.requestId, 'completed');
    rt.releaseConversation('conv-a');
    assert(rt.getLastExecution('conv-a') === null, 'record dilepas sesudah terminal');
  });

  await check('NAV-10 request cancelled TIDAK menjadi completed oleh finish yang terlambat', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.cancelExecution(h.record.requestId);
    const fin = rt.finishExecution(h.record.requestId, 'completed');
    assert(fin?.status === 'cancelled', `status tetap cancelled (dapat: ${fin?.status})`);
    assert(rt.getLastExecution('conv-a')?.status === 'cancelled', 'last tetap cancelled');
  });

  // ================= STR — kontinuitas transport =================
  await check('STR-01 cancel eksplisit meng-abort signal yang dilihat fetch', async () => {
    rt.__resetExecutionRuntimeForTests();
    (globalThis as any).window = {};
    let seenSignal: AbortSignal | null = null;
    let fetchCalls = 0;
    (globalThis as any).fetch = (_url: string, opts: any) => {
      fetchCalls += 1;
      seenSignal = opts?.signal ?? null;
      return new Promise((_resolve, reject) => {
        const sig: AbortSignal | undefined = opts?.signal;
        if (sig?.aborted) {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
          return;
        }
        sig?.addEventListener('abort', () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        }, { once: true });
      });
    };
    const { AiToolsProviderClient } = await import('../ai-tools/providerClient');
    const client = new AiToolsProviderClient();
    const h = rt.beginExecution('conv-a', 'proj-1');
    const pending = client.execute({
      productId: 'EZRAB_AI', prompt: 'halo', timeoutMs: 60000, signal: h.signal,
    });
    await sleep(30);
    assert(fetchCalls === 1, 'fetch dipanggil 1x');
    assert(seenSignal !== null && seenSignal.aborted === false, 'signal fetch hidup sebelum cancel');
    const cancelled = rt.cancelExecution(h.record.requestId);
    assert(cancelled?.status === 'cancelled', 'record = cancelled');
    const result = await pending;
    assert(seenSignal!.aborted === true, 'cancel runtime meng-abort signal fetch');
    assert(result.success === false, 'hasil abort BUKAN sukses');
  });

  await check('STR-02 hasil yang tiba sesudah cancel tidak mengubah status cancelled', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.cancelExecution(h.record.requestId);
    const fin = rt.finishExecution(h.record.requestId, 'failed', 'late error');
    assert(fin?.status === 'cancelled', 'tetap cancelled walau ada finish terlambat');
    assert(fin?.error === null, 'error terlambat tidak menimpa record cancelled');
  });

  await check('STR-03 gerbang minimum hanya dibatalkan abort eksplisit (ekuivalen stream: signal runtime)', async () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    // Tanpa abort: gerbang menunggu minimum lalu selesai.
    const ok = await waitForMinimum(Date.now(), 60, Promise.resolve('x'), h.signal);
    assert(ok === 'x', 'waitForMinimum selesai tanpa abort');
    // Dengan abort eksplisit: gerbang menolak (AbortedTimingError).
    const h2 = rt.beginExecution('conv-a', 'proj-1');
    const pending = waitForMinimum(Date.now(), 5000, Promise.resolve('y'), h2.signal);
    rt.cancelExecution(h2.record.requestId);
    let threw = false;
    try {
      await pending;
    } catch (e: any) {
      threw = true;
      // Nama kelas = 'AbortedTiming' (lihat aiResponseTiming.ts:132).
      assert(e?.name === 'AbortedTiming' || /abort/i.test(e?.message ?? ''), `error abort terstruktur (dapat: ${e?.name})`);
    }
    assert(threw, 'waitForMinimum harus menolak sesudah cancel');
  });

  await check('STR-04 abort satu request tidak meng-abort request lain', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    const b = rt.beginExecution('conv-b', 'proj-1');
    rt.cancelExecution(a.record.requestId);
    assert(a.signal.aborted === true, 'A aborted');
    assert(b.signal.aborted === false, 'B TIDAK aborted');
    assert(rt.getActiveExecution('conv-b') !== null, 'B tetap aktif');
    rt.finishExecution(b.record.requestId, 'completed');
  });

  await check('STR-05 setiap request punya idempotencyKey unik & stabil', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    const b = rt.beginExecution('conv-a', 'proj-1');
    assert(a.record.idempotencyKey.length > 0, 'kunci ada');
    assert(a.record.idempotencyKey !== b.record.idempotencyKey, 'kunci berbeda antar request');
    assert(rt.getExecution(a.record.requestId)?.idempotencyKey === a.record.idempotencyKey, 'kunci stabil saat dibaca ulang');
    assert(a.record.requestId !== b.record.requestId, 'requestId berbeda');
    rt.finishExecution(b.record.requestId, 'completed');
  });

  await check('STR-06 isCurrent membedakan request lama vs baru (callback basi)', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    assert(a.isCurrent() === true, 'A current sebelum digantikan');
    rt.beginExecution('conv-a', 'proj-1');
    assert(a.isCurrent() === false, 'A bukan current sesudah digantikan');
  });

  await check('STR-07 finishExecution idempotent', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    const first = rt.finishExecution(h.record.requestId, 'completed');
    const second = rt.finishExecution(h.record.requestId, 'failed', 'x');
    assert(first?.status === 'completed', 'finish pertama = completed');
    assert(second?.status === 'completed', 'finish kedua tidak mengubah status');
    assert(second?.completedAt === first?.completedAt, 'completedAt tidak berubah');
  });

  // ================= CAN — pembatalan eksplisit =================
  await check('CAN-01 cancel hanya menghentikan operasi itu (request lain tak terpengaruh)', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    const b = rt.beginExecution('conv-b', 'proj-1');
    const c = rt.cancelExecution(a.record.requestId);
    assert(c?.status === 'cancelled', 'A cancelled');
    assert(rt.getExecution(b.record.requestId)?.status === 'generating', 'B tetap generating');
    rt.finishExecution(b.record.requestId, 'completed');
  });

  await check('CAN-02 cancel pada record terminal = no-op', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.finishExecution(h.record.requestId, 'completed');
    const again = rt.cancelExecution(h.record.requestId);
    assert(again?.status === 'completed', 'completed tidak berubah menjadi cancelled');
  });

  await check('CAN-03 cancel pada requestId tak dikenal = null (tidak melempar)', () => {
    rt.__resetExecutionRuntimeForTests();
    assert(rt.cancelExecution('req-tidak-ada') === null, 'null untuk request tak dikenal');
    assert(rt.finishExecution('req-tidak-ada', 'completed') === null, 'finish tak dikenal = null');
    assert(rt.getExecution('req-tidak-ada') === null, 'get tak dikenal = null');
  });

  await check('CAN-04 langganan menerima status cancelled', () => {
    rt.__resetExecutionRuntimeForTests();
    const seen: string[] = [];
    rt.subscribeExecution('conv-a', (rec) => { if (rec) seen.push(rec.status); });
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.cancelExecution(h.record.requestId);
    assert(seen.includes('cancelled'), `langganan menerima cancelled (dapat: ${seen.join(',')})`);
  });

  // ================= PER — performa / kebersihan =================
  await check('PER-01 langganan ganda menerima notifikasi; unsubscribe menghentikan satu saja', () => {
    rt.__resetExecutionRuntimeForTests();
    let a = 0;
    let b = 0;
    const unA = rt.subscribeExecution('conv-a', () => { a += 1; });
    rt.subscribeExecution('conv-a', () => { b += 1; });
    a = 0; b = 0;
    const h = rt.beginExecution('conv-a', 'proj-1');
    assert(a === 1 && b === 1, `kedua langganan menerima begin (a=${a}, b=${b})`);
    unA();
    a = 0; b = 0;
    rt.finishExecution(h.record.requestId, 'completed');
    assert(a === 0 && b === 1, `hanya langganan tersisa menerima finish (a=${a}, b=${b})`);
  });

  await check('PER-02 record terminal lama dibersihkan saat eksekusi baru dimulai', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    rt.finishExecution(a.record.requestId, 'completed');
    const b = rt.beginExecution('conv-a', 'proj-1');
    rt.finishExecution(b.record.requestId, 'completed');
    // A masih dipertahankan sebagai "previous" saat B dimulai; C membersihkannya.
    assert(rt.getExecution(a.record.requestId) !== null, 'A masih ada saat B dimulai (previous dipertahankan)');
    const c = rt.beginExecution('conv-a', 'proj-1');
    assert(rt.getExecution(a.record.requestId) === null, 'A dibersihkan saat C dimulai');
    assert(rt.getExecution(b.record.requestId) !== null, 'B (previous) masih ada');
    rt.finishExecution(c.record.requestId, 'completed');
  });

  await check('PER-03 releaseConversation menghapus record terminal', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.finishExecution(h.record.requestId, 'failed', 'x');
    rt.releaseConversation('conv-a');
    assert(rt.getExecution(h.record.requestId) === null, 'record dilepas');
    assert(rt.getLastExecution('conv-a') === null, 'last dilepas');
  });

  await check('PER-04 urutan finish tidak tertukar antar request', () => {
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('conv-a', 'proj-1');
    const b = rt.beginExecution('conv-a', 'proj-1');
    rt.finishExecution(b.record.requestId, 'failed', 'err-b');
    rt.finishExecution(a.record.requestId, 'completed');
    assert(rt.getExecution(b.record.requestId)?.status === 'failed', 'B failed');
    assert(rt.getExecution(b.record.requestId)?.error === 'err-b', 'error B tercatat pada B');
    assert(rt.getExecution(a.record.requestId)?.status === 'completed', 'A completed');
    assert(rt.getExecution(a.record.requestId)?.error === null, 'A tanpa error');
  });

  await check('PER-05 reset membersihkan seluruh registry', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-a', 'proj-1');
    rt.__resetExecutionRuntimeForTests();
    assert(rt.getExecution(h.record.requestId) === null, 'record hilang sesudah reset');
    assert(rt.getLastExecution('conv-a') === null, 'last hilang sesudah reset');
    assert(rt.getActiveExecution('conv-a') === null, 'aktif hilang sesudah reset');
  });

  await check('PER-06 100 submit berurutan (finish) tidak menumpuk record terminal', () => {
    rt.__resetExecutionRuntimeForTests();
    let firstId = '';
    for (let i = 0; i < 100; i++) {
      const h = rt.beginExecution('conv-a', 'proj-1');
      if (i === 0) firstId = h.record.requestId;
      rt.finishExecution(h.record.requestId, 'completed');
    }
    assert(rt.getExecution(firstId) === null, 'record pertama dibersihkan');
    assert(rt.getLastExecution('conv-a')?.status === 'completed', 'last tetap terbaca');
    assert(rt.getActiveExecution('conv-a') === null, 'tidak ada yang menggantung');
  });

  // ================= S — asersi sumber view.tsx =================
  await check('S-01 view TIDAK punya cleanup abort saat unmount (tidak ada submitAbortRef)', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(!view.includes('submitAbortRef'), 'submitAbortRef hilang dari view');
    assert(!view.includes('timingCoordinatorRef'), 'timingCoordinatorRef hilang dari view');
  });

  await check('S-02 view memakai executionRuntime untuk eksekusi submit', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes("from './executionRuntime'"), 'import executionRuntime ada');
    assert(view.includes('beginExecution('), 'beginExecution dipakai');
    assert(view.includes('finishExecution('), 'finishExecution dipakai');
    assert(view.includes('cancelExecution('), 'cancelExecution dipakai');
    assert(view.includes('subscribeExecution('), 'subscribeExecution dipakai');
  });

  await check('S-03 signal yang diteruskan ke service adalah signal runtime (bukan komponen)', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('signal: llmExec.signal'), 'view meneruskan llmExec.signal ke send');
    assert(!view.includes('signal: submitAbort.signal'), 'submitAbort.signal tidak lagi dipakai');
  });

  await check('S-04 tombol Berhenti eksplisit ada & menargetkan eksekusi aktif', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('Berhenti'), 'label Berhenti ada');
    assert(view.includes('stopActiveExecution'), 'handler stopActiveExecution ada');
    assert(view.includes('getActiveExecution('), 'stop membaca eksekusi aktif dari runtime');
  });

  await check('S-05 banner INTERRUPTED + Coba Lagi manual ada; tidak ada auto-resubmit', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('interruptedPrompt'), 'state interruptedPrompt ada');
    assert(view.includes('terputus sebelum selesai'), 'teks banner interrupted ada');
    assert(view.includes('getRetryPrompt'), 'pemulihan prompt dari riwayat ada');
    // Tidak ada pemanggilan submit otomatis di efek interrupted.
    const idx = view.indexOf('interruptedPrompt');
    const section = view.slice(idx, idx + 2000);
    assert(!section.includes('void submit('), 'tidak ada auto-submit di penanda interrupted');
  });

  await check('S-06 cabang abort mencatat pembatalan (bukan diam) & finally selalu menutup eksekusi', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('noteCancelledIfNeeded()'), 'penanda cancelled dipanggil');
    assert(view.includes('Permintaan dibatalkan.'), 'teks penanda cancelled ada');
    const submitSection = view.slice(view.indexOf('const sendPromise = ezrabAiService.send'));
    assert(submitSection.includes('endExec();'), 'finally/akhir menutup eksekusi');
    assert(submitSection.includes('} finally {'), 'finally ada pada jalur LLM');
  });

  await check('S-07 hasil basi dicek lewat isCurrent runtime (bukan koordinator komponen)', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('llmExec.isCurrent()'), 'cek keaslian memakai handle runtime');
    assert(!view.includes('isLatest(timingRequestId)'), 'cek koordinator komponen hilang');
  });

  await check('S-08 gateway tetap stateless (tidak ada pengamatan disconnect — batasan §8 tercatat)', () => {
    const gw = read('api/ai/tools/execute.js');
    const lib = read('api/_lib/aiGateway.js');
    assert(!gw.includes("req.on('close')") && !gw.includes('req.on("close")'), 'execute.js tidak mengamati disconnect');
    assert(!lib.includes("req.on('close')") && !lib.includes('req.on("close")'), 'aiGateway.js tidak mengamati disconnect');
  });

  rt.__resetExecutionRuntimeForTests();
  console.log(`\nchatPersistentExecution: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
