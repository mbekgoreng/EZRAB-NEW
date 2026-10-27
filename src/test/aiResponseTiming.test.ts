/**
 * aiResponseTiming.test — pengujian kebijakan timing terpusat
 * (spesifikasi "UNIFIED AI RESPONSE TIMING" §8).
 *
 * Gaya plain-tsx (tanpa vitest — vitest tidak terinstal di sandbox):
 * jalankan dari ROOT repo: `npx --yes tsx src/test/aiResponseTiming.test.ts`
 *
 * Poin §8 yang diuji runtime di sini: 1, 2, 3, 4, 5 (modul bersama),
 * 7 (error diteruskan, bukan diubah jadi sukses), 8 (tanpa finalisasi
 * ganda), 9 (koordinator request terbaru), 10 (pembatalan), 11
 * (navigasi tanpa delay). Poin 6 (wizard setelah hasil valid) dan 12
 * (cakupan semua jalur) diuji sebagai asersi sumber — karena perilaku
 * tersebut hidup di komponen React yang tidak bisa di-mount di sandbox —
 * dan DIVERIFIKASI ULANG lewat QA browser di Preview setelah push.
 * Streaming provider (§8.8): tidak ada streaming di jalur ini
 * (providerClient memakai stream:false eksplisit); yang diuji adalah
 * tidak adanya finalisasi ganda dari promise hasil yang sama.
 */
import { readFileSync } from 'node:fs';
import {
  classifyRequest,
  minDelayFor,
  statusTextFor,
  waitForMinimum,
  createRequestCoordinator,
  isAbortError,
  AbortedTimingError,
  activityForRequest,
} from '../ai-tools/aiResponseTiming';

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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');

async function main(): Promise<void> {
  console.log('aiResponseTiming.test');

  // §8.1 — prompt sederhana menunggu minimum 1 detik (provider cepat).
  await check('1. simple: provider 0ms -> tampil >= 1000ms', async () => {
    const t0 = Date.now();
    const out = await waitForMinimum(t0, minDelayFor('simple'), Promise.resolve('ok'));
    const el = Date.now() - t0;
    assert(out === 'ok', 'hasil harus diteruskan');
    assert(el >= 950 && el < 2200, `elapsed=${el}ms`);
  });

  // §8.2 — prompt kompleks menunggu minimum 3 detik (provider cepat).
  await check('2. complex: provider 0ms -> tampil >= 3000ms', async () => {
    const t0 = Date.now();
    await waitForMinimum(t0, minDelayFor('complex'), Promise.resolve('ok'));
    const el = Date.now() - t0;
    assert(el >= 2950 && el < 4200, `elapsed=${el}ms`);
  });

  // §8.3 — provider lebih lambat dari minimum: tidak ada delay tambahan.
  await check('3. provider 1200ms + min 1000ms -> tampil ~1200ms (bukan ~2200)', async () => {
    const t0 = Date.now();
    const slow = sleep(1200).then(() => 'slow');
    await waitForMinimum(t0, minDelayFor('simple'), slow);
    const el = Date.now() - t0;
    assert(el >= 1150 && el < 2000, `elapsed=${el}ms`);
  });

  // §8.4 — provider lebih cepat: hasil menunggu sisa minimum.
  await check('4. medium: provider 0ms -> tampil >= 2000ms', async () => {
    const t0 = Date.now();
    await waitForMinimum(t0, minDelayFor('medium'), Promise.resolve('ok'));
    const el = Date.now() - t0;
    assert(el >= 1950 && el < 3200, `elapsed=${el}ms`);
  });

  // §8.5 — Chat AI dan Assistant AI memakai kebijakan yang sama.
  await check('5. klasifikasi + status: satu modul untuk kedua chat', () => {
    assert(classifyRequest('halo') === 'simple', 'sapaan = simple');
    assert(classifyRequest('buatkan rab rumah type 70') === 'complex', 'buat RAB = complex');
    assert(classifyRequest('tolong analisis DED gedung ini') === 'complex', 'analisis DED = complex');
    assert(minDelayFor('simple') === 1000 && minDelayFor('medium') === 2000 && minDelayFor('complex') === 3000, '1/2/3 detik');
    assert(statusTextFor('simple', 'chat') === 'EZRAB sedang berpikir…', 'status chat simple');
    assert(statusTextFor('complex', 'chat') === 'EZRAB sedang menganalisis permintaan…', 'status chat complex');
    assert(statusTextFor('complex', 'rab') === 'EZRAB sedang menyiapkan RAB…', 'status RAB');
    assert(statusTextFor('complex', 'ded') === 'EZRAB sedang membaca dokumen…', 'status DED');
    assert(activityForRequest('buatkan rab rumah') === 'rab', 'aktivitas RAB dari teks');
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    const co = read('src/services/coAssistantService.ts');
    assert(view.includes('aiResponseTiming'), 'view.tsx memakai modul bersama');
    assert(co.includes('aiResponseTiming'), 'coAssistantService memakai modul bersama');
  });

  // §8.6 — wizard dibuka SETELAH balasan (asersi urutan sumber).
  await check('6. wizard setelah balasan: urutan kode di view.tsx', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    const postIdx = view.indexOf('await postAssistant(reply, entryActions)');
    const timerIdx = view.indexOf('setTimeout(() => {', postIdx);
    const wizIdx = view.indexOf('setRabWizardOpen(true)', timerIdx);
    assert(postIdx > 0 && timerIdx > postIdx && wizIdx > timerIdx, 'urutan: balasan -> setTimeout -> buka wizard');
    const catchIdx = view.indexOf('} catch (err: any) {');
    const finallyIdx = view.indexOf('} finally {', catchIdx);
    const catchBody = view.slice(catchIdx, finallyIdx);
    assert(!catchBody.includes('setRabWizardOpen'), 'cabang error tidak membuka wizard RAB');
    assert(!catchBody.includes('setDesignStudioOpen'), 'cabang error tidak membuka studio desain');
  });

  // §8.7 — error provider diteruskan apa adanya (bukan diubah jadi sukses).
  await check('7. provider error -> waitForMinimum menolak dengan error yang sama', async () => {
    const boom = new Error('MODEL_ERROR');
    let caught: unknown = null;
    try {
      await waitForMinimum(Date.now(), minDelayFor('simple'), Promise.reject(boom));
    } catch (e) {
      caught = e;
    }
    assert(caught === boom, 'error harus diteruskan, bukan dibungkus');
  });

  // §8.8 — tidak ada finalisasi ganda dari satu hasil.
  await check('8. satu hasil -> satu efek samping, walau di-await dua kali', async () => {
    let calls = 0;
    const provider = (async () => {
      calls += 1;
      return 'hasil';
    })();
    const t0 = Date.now();
    const a = await waitForMinimum(t0, minDelayFor('simple'), provider);
    const b = await waitForMinimum(t0, minDelayFor('simple'), provider);
    assert(a === 'hasil' && b === 'hasil', 'hasil sama');
    assert(calls === 1, `efek samping harus 1x, dapat ${calls}x`);
  });

  // §8.9 — double-submit / permintaan basi: hanya yang terbaru berlaku.
  await check('9. koordinator: id lama disalip id baru', () => {
    const c = createRequestCoordinator();
    const id1 = c.next();
    const id2 = c.next();
    assert(!c.isLatest(id1) && c.isLatest(id2), 'hanya id terbaru yang latest');
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('if ((!msg && !attached) || busy) return;'), 'chat: guard busy cegah double-submit');
    const box = read('src/components/copilot/EzrabCoAssistantChatbox.tsx');
    assert(box.includes('if (!query || isThinking || isSendingRef.current) return;'), 'chatbox: guard isSending cegah double-submit');
  });

  // §8.10 — pembatalan: tidak ada respons lama yang muncul.
  await check('10. abort saat menunggu -> menolak AbortedTiming, hasil telat tidak sampai', async () => {
    const ctl = new AbortController();
    const t0 = Date.now();
    const late = sleep(2000).then(() => 'telat');
    const gated = waitForMinimum(t0, minDelayFor('complex'), late, ctl.signal);
    await sleep(100);
    ctl.abort();
    let rejected = false;
    try {
      await gated;
    } catch (e) {
      rejected = isAbortError(e) && e instanceof AbortedTimingError;
    }
    const el = Date.now() - t0;
    assert(rejected, 'gated harus menolak dengan AbortedTiming');
    assert(el < 1000, `abort harus cepat, elapsed=${el}ms`);
    assert((await late) === 'telat', 'provider tetap selesai di latar, tapi tidak disampaikan');
  });

  // §8.11 — navigasi menu biasa tidak terkena delay.
  await check('11. aiNavigation tidak memakai modul timing', () => {
    const nav = read('src/ai-tools/aiNavigation.ts');
    assert(!nav.includes('aiResponseTiming') && !nav.includes('waitForMinimum'), 'navigasi bebas delay');
  });

  // §8.12 — semua jalur tombol permintaan AI tercakup.
  await check('12. semua layanan AI memakai gerbang yang sama', () => {
    for (const f of [
      'src/ai-tools/ded-ai-estimate/service.ts',
      'src/ai-tools/ded-full-ai/service.ts',
      'src/ai-tools/document-ai/service.ts',
    ]) {
      assert(read(f).includes('aiResponseTiming'), `${f} memakai modul bersama`);
    }
    const panel = read('src/components/copilot/EstimatingCopilotPanel.tsx');
    assert(!panel.includes('coAssistantService') && !panel.includes('ezrabAiService'), 'panel copilot: simulasi deterministik, bukan permintaan AI');
  });

  console.log(`\naiResponseTiming.test: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
