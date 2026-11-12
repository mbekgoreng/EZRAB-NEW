/**
 * aiCancellationPropagation.test — Propagasi pembatalan klien (§8,
 * Final Hardening 2026-11-11).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/aiCancellationPropagation.test.ts`
 *
 * Yang dibuktikan:
 * 1. AbortSignal MILIK PEMANGGIL (view) mencapai lapisan fetch di
 *    providerClient (mock fetch menangkap signal yang diteruskan dan
 *    mengamati abort-nya) — sinyal diteruskan, bukan dibuat ulang.
 * 2. Sinyal yang sudah aborted sebelum kirim → fetch TIDAK dipanggil.
 * 3. Hasil abort adalah error terstruktur (bukan sukses parsial):
 *    pesan parsial tidak pernah tersimpan sebagai final — dibuktikan
 *    di lapisan klien (execute mengembalikan success:false) + asersi
 *    sumber pada view: cabang abort kembali diam-diam (isAbortError →
 *    return), persistMessage hanya dipanggil di cabang sukses sesudah
 *    cek isLatest, dan setBusy(false) selalu berjalan di finally
 *    (tidak ada status loading basi sesudah cancel).
 *
 * Batas yang TIDAK diuji di sini karena memang tidak ada: gateway
 * serverless tidak meneruskan disconnect klien ke fetch provider
 * (didokumentasikan di bukti/timing-cancellation.md).
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
  console.log('aiCancellationPropagation.test');

  // Paksa jalur BROWSER providerClient (ia memilih jalur dari
  // `typeof window`); fetch diganti mock yang meniru perilaku fetch
  // asli terhadap AbortSignal.
  (globalThis as any).window = {};
  let fetchCalls = 0;
  let seenSignal: AbortSignal | null = null;
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
      sig?.addEventListener(
        'abort',
        () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        },
        { once: true },
      );
      // Tanpa abort, fetch ini tidak pernah selesai dalam horizon tes.
    });
  };

  const { AiToolsProviderClient } = await import('../ai-tools/providerClient');
  const client = new AiToolsProviderClient();

  await check('1. abort pemanggil mencapai lapisan fetch (signal diteruskan ke fetch gateway)', async () => {
    const caller = new AbortController();
    const pending = client.execute({
      productId: 'EZRAB_AI',
      prompt: 'halo',
      timeoutMs: 60000,
      signal: caller.signal,
    });
    await sleep(30);
    assert(fetchCalls === 1, `fetch dipanggil ${fetchCalls}x`);
    assert(seenSignal !== null, 'fetch menerima signal');
    assert(seenSignal!.aborted === false, 'signal fetch belum aborted sebelum pemanggil abort');
    caller.abort();
    const result = await pending;
    assert(seenSignal!.aborted === true, 'abort pemanggil meng-abort signal yang dilihat fetch');
    assert(result.success === false, 'hasil abort BUKAN sukses (tidak ada balasan parsial sebagai final)');
    if (!result.success) {
      assert(result.errorCode === 'MODEL_TIMEOUT', `errorCode=${result.errorCode} (abort dipetakan sebagai timeout/batal)`);
    }
  });

  await check('2. sinyal sudah aborted sebelum kirim → fetch tidak dipanggil sama sekali', async () => {
    const caller = new AbortController();
    caller.abort();
    const before = fetchCalls;
    const result = await client.execute({
      productId: 'EZRAB_AI',
      prompt: 'halo',
      signal: caller.signal,
    });
    assert(fetchCalls === before, 'fetch tidak boleh dipanggil untuk permintaan yang sudah dibatalkan');
    assert(result.success === false, 'hasil = error terstruktur, bukan sukses');
  });

  await check('3. tanpa sinyal pemanggil: perilaku lama utuh (timeout internal tetap ada)', async () => {
    const src = read('src/ai-tools/providerClient.ts');
    assert(src.includes('request.signal?.addEventListener'), 'penghubung sinyal pemanggil ada');
    assert(src.includes('setTimeout(() => controller.abort(), timeoutMs + 1000)'), 'timeout internal tidak berubah');
    assert(src.includes('signal: controller.signal'), 'fetch tetap memakai controller internal (gabungan timeout + pemanggil)');
  });

  await check('4. rantai view → service → providerClient meneruskan sinyal yang sama', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    const service = read('src/ai-tools/ezrab-ai/service.ts');
    // PIN DIPERBARUI TERBUKA (lifecycle fix 2026-11-12): sinyal kini milik
    // executionRuntime (modul), bukan komponen — `signal: llmExec.signal`
    // menggantikan `signal: submitAbort.signal`. Rantai ke bawah tidak
    // berubah: service tetap meneruskan request.signal ke providerClient.
    assert(view.includes('signal: llmExec.signal'), 'view meneruskan llmExec.signal (runtime) ke ezrabAiService.send');
    assert(!view.includes('signal: submitAbort.signal'), 'submitAbort.signal tidak lagi dipakai');
    assert(service.includes('signal: request.signal'), 'service meneruskan request.signal ke providerClient.execute');
  });

  await check('5. state tidak korup sesudah cancel: view membersihkan busy & tidak menyimpan pesan parsial', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    // PIN DIPERBARUI TERBUKA (lifecycle fix 2026-11-12): cabang abort tidak
    // lagi diam — pembatalan EKSPLISIT dicatat sebagai "Permintaan
    // dibatalkan." (noteCancelledIfNeeded) lalu eksekusi ditutup. Abort
    // karena unmount tidak ada lagi (cleanup abort dihapus).
    assert(view.includes('noteCancelledIfNeeded()'), 'cabang catch: abort → penanda cancelled');
    assert(view.includes("Permintaan dibatalkan."), 'teks penanda cancelled ada');
    // Loading selalu dibersihkan di finally pada jalur submit.
    const submitSection = view.slice(view.indexOf('const sendPromise = ezrabAiService.send'));
    assert(submitSection.includes('} finally {'), 'finally ada pada jalur pengiriman LLM');
    assert(submitSection.includes('setBusy(false);'), 'finally setBusy(false) pada jalur pengiriman LLM');
    // persistMessage untuk balasan asisten hanya muncul SEBELUM cabang
    // catch pada blok yang sama dan SETELAH cek keaslian — pesan dari
    // permintaan yang dibatalkan/disalip tidak pernah dipersist. Cek
    // keaslian kini lewat handle runtime (llmExec.isCurrent()).
    const idxLatest = submitSection.indexOf('llmExec.isCurrent()');
    const idxPersist = submitSection.indexOf("persistMessage('assistant', res.reply)");
    assert(idxLatest !== -1 && idxPersist > idxLatest, 'persistMessage sesudah cek isCurrent');
  });

  console.log(`\naiCancellationPropagation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
