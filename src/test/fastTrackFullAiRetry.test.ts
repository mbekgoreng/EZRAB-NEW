/**
 * fastTrackFullAiRetry.test.ts — O-07: SATU retry transport terbatas
 * (Fast Track Completion, 2026-11-24).
 *
 * Celah yang ditutup (audit): di Full AI service, satu panggilan AI per
 * kelompok halaman. JSON invalid / rencana kosong -> kelompok DIPECAH
 * dan dicoba ulang (kedalaman <= 2). Tetapi kegagalan TRANSPORT
 * (NETWORK_ERROR dari providerClient: TypeError fetch / connection
 * reset / stream terputus) langsung masuk failedGroups TANPA retry —
 * pengguna harus sadar dan menjalankan ulang manual. Failover per-leg
 * gateway hanya menutup kegagalan provider, bukan gangguan transport
 * pada leg yang sehat.
 *
 * Perbaikan (src/ai-tools/ded-full-ai/service.ts, loop kelompok):
 * kelompok yang gagal NETWORK_ERROR dicoba SATU kali lagi (kelompok
 * yang sama, prompt yang sama, tanpa pecah, jeda tetap 1 detik —
 * FULL_AI_TRANSPORT_RETRY_DELAY_MS). Bila retry juga gagal transport,
 * kelompok masuk failedGroups seperti dulu (tepat 2 upaya). Kegagalan
 * provider/model (MODEL_ERROR, MODEL_TIMEOUT, 400-an) TIDAK di-retry
 * lewat jalur ini; JSON malformed tetap lewat jalur split-retry.
 *
 * MODEL_TIMEOUT SENGAJA TIDAK di-retry: providerClient memakainya juga
 * untuk model yang benar-benar lambat dan timeout auth (AbortError ->
 * MODEL_TIMEOUT), sehingga kode itu bukan bukti kegagalan transport
 * murni. Membedakannya butuh perubahan providerClient (di luar cakupan
 * O-07 — didokumentasikan, tidak diperbaiki).
 *
 * Suite ini skrip asersi tsx polos (pola dedEmptyPlanRetry.src.ts):
 * PDF sintetis minimal dibangun di dalam tes, aiToolsProviderClient
 * di-stub per skenario — TANPA panggilan AI berbayar, tanpa jaringan.
 * Jalankan dari ROOT repo: npx --yes tsx src/test/fastTrackFullAiRetry.test.ts
 * (setiap execute() Full AI memakai minimum ~4 detik — total ~25 detik.)
 */
import {
  fullAiDedService,
  isFullAiTransportFailure,
  FULL_AI_TRANSPORT_RETRY_DELAY_MS,
} from '../ai-tools/ded-full-ai/service';
import { aiToolsProviderClient } from '../ai-tools/providerClient';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------------------------------------------------------------------------
// PDF sintetis minimal (generator yang sama dengan dedEmptyPlanRetry.src.ts)
// ---------------------------------------------------------------------------
function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(pageTexts: string[]): Buffer {
  const objects: string[] = [];
  const n = pageTexts.length;
  const fontObj = 3 + n;
  const contentStart = fontObj + 1;
  const kids = pageTexts.map((_, i) => `${3 + i} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  for (let i = 0; i < n; i++) {
    objects[3 + i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentStart + i} 0 R >>`;
  }
  objects[fontObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let i = 0; i < n; i++) {
    const stream = `BT /F1 12 Tf 72 720 Td (${escapePdfText(pageTexts[i])}) Tj ET`;
    objects[contentStart + i] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  const total = contentStart + n;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < total; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// ---------------------------------------------------------------------------
// Mock client: aiToolsProviderClient.execute di-stub per skenario.
// Bentuk sukses mengikuti AiToolsSuccess; bentuk gagal mengikuti
// AIToolsStructuredError (providerClient.ts) — service hanya membaca
// success / errorCode / message, ketiganya dibuat setia pada bentuk asli.
// Harga mock = nilai CONTOH skema di prompts.ts — fixture tes semata,
// bukan harga pasar, bukan harga AHSP.
// ---------------------------------------------------------------------------
const M1 = 'MARKER-HALAMAN-SATU';
const M2 = 'MARKER-HALAMAN-DUA';

const itemPondasi = {
  no: 1, name: 'Galian tanah pondasi', category: 'Tanah', wbsGroup: 'Pekerjaan Tanah dan Pondasi',
  qty: 9.6, unit: 'm3', formula: '30 x 0.32', provenance: 'DERIVED',
  assumptions: 'panjang pondasi 30m dari keliling', price: 85000, priceUnit: 'm3', priceSource: 'AI_ESTIMATE',
};
const itemDinding = {
  no: 2, name: 'Dinding bata merah', category: 'Dinding', wbsGroup: 'Pekerjaan Dinding',
  qty: 42, unit: 'm2', formula: '60 x 0.7', provenance: 'DERIVED',
  assumptions: 'keliling dinding 60m', price: 95000, priceUnit: 'm2', priceSource: 'AI_ESTIMATE',
};

type Behavior = (prompt: string, callIndex: number) => unknown;
let behavior: Behavior = () => ({ items: [] });
let callCount = 0;
let callPrompts: string[] = [];

const transportFailure = (code: string) => ({
  success: false,
  errorCode: code,
  message: code === 'NETWORK_ERROR'
    ? 'Tidak dapat terhubung ke layanan AI.'
    : code === 'MODEL_TIMEOUT'
      ? 'Proses AI memakan waktu terlalu lama dan dibatalkan.'
      : 'Penyedia layanan AI menolak permintaan.',
  retryable: true,
});

const successWith = (payload: unknown) => ({
  success: true,
  content: typeof payload === 'string' ? payload : JSON.stringify(payload),
  structured: null,
  requestId: `mock-req-${callCount}`,
  provider: 'mock',
  model: 'mock-model',
  usage: { inputTokens: 10, outputTokens: 20, cachedTokens: null },
});

const origExecute = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
(aiToolsProviderClient as any).execute = async (request: any) => {
  callCount++;
  callPrompts.push(String(request?.prompt || ''));
  const payload = behavior(String(request?.prompt || ''), callCount);
  if (payload && typeof payload === 'object' && (payload as any).__fail) {
    return transportFailure((payload as any).__fail);
  }
  return successWith(payload);
};

function resetMock(next: Behavior) {
  behavior = next;
  callCount = 0;
  callPrompts = [];
}

async function runDed(buffer: Buffer, fileName: string): Promise<any> {
  return fullAiDedService.execute({
    fileName,
    buffer,
    projectType: 'Rumah Tinggal',
    mode: 'FAST',
    policy: 'FULL_AI',
    rabMode: 'FULL_AI',
  });
}

const hasWarning = (out: any, needle: string) =>
  (out.warnings || []).some((w: string) => w.includes(needle));

async function main() {
  try {
    // =======================================================================
    // A. Transport gagal sekali, lalu sukses -> kelompok selesai, tepat
    //    satu entri hasil, TIDAK di failedGroups. (Pin a)
    // =======================================================================
    console.log('== A. NETWORK_ERROR lalu sukses -> retry 1x, selesai ==');
    resetMock((_prompt, callIndex) =>
      callIndex === 1 ? { __fail: 'NETWORK_ERROR' } : { items: [itemPondasi], projectInfo: { scopeSummary: 'pondasi' } },
    );
    const pdfA = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah.`]);
    const outA: any = await runDed(pdfA, 'a-transport-retry-sukses.pdf');
    check('A1 sukses (bukan error)', outA.success === true);
    check('A2 tepat 1 item (retry tidak menggandakan hasil)', outA.items.length === 1, `items=${outA.items.length}`);
    check('A3 nama item hadir tepat sekali',
      outA.items.filter((i: any) => i.name === 'Galian tanah pondasi').length === 1,
      JSON.stringify(outA.items.map((i: any) => i.name)));
    check('A4 execute dipanggil tepat 2x (1 gagal + 1 retry)', callCount === 2, `calls=${callCount}`);
    check('A5 retry memakai prompt yang SAMA (kelompok sama, tanpa pecah)',
      callPrompts.length === 2 && callPrompts[0] === callPrompts[1]);
    check('A6 warning retry transport tercatat jujur',
      hasWarning(outA, 'NETWORK_ERROR') && hasWarning(outA, 'mencoba sekali lagi'),
      JSON.stringify(outA.warnings));
    check('A7 TIDAK ada warning failedGroups NETWORK_ERROR',
      !hasWarning(outA, 'gagal diproses (NETWORK_ERROR'),
      JSON.stringify(outA.warnings));
    check('A8 tanpa warning pecah-grup (bukan jalur split-retry)',
      !hasWarning(outA, 'dipecah dua'));

    // =======================================================================
    // B. Transport gagal DUA kali -> failedGroups, tepat 2 upaya, tidak
    //    ada upaya ketiga. (Pin b)
    // =======================================================================
    console.log('== B. NETWORK_ERROR dua kali -> gagal, tepat 2 upaya ==');
    resetMock(() => ({ __fail: 'NETWORK_ERROR' }));
    const pdfB = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah.`]);
    const outB: any = await runDed(pdfB, 'b-transport-gagal-dua-kali.pdf');
    check('B1 execute dipanggil tepat 2x (tidak ada upaya ketiga)', callCount === 2, `calls=${callCount}`);
    check('B2 hasil error (semua kelompok gagal)', outB.success === false, `success=${outB.success}`);
    check('B3 kode error NETWORK_ERROR', outB.error?.code === 'NETWORK_ERROR', `code=${outB.error?.code}`);
    check('B4 error ditandai retryable (retry manual tetap tersedia)',
      outB.error?.retryable === true, `retryable=${outB.error?.retryable}`);
    check('B5 0 item', outB.items.length === 0, `items=${outB.items.length}`);

    // =======================================================================
    // C. Kegagalan provider (MODEL_ERROR) -> TIDAK ada retry transport.
    //    (Pin c)
    // =======================================================================
    console.log('== C. MODEL_ERROR -> tanpa retry transport ==');
    resetMock(() => ({ __fail: 'MODEL_ERROR' }));
    const pdfC = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah.`]);
    const outC: any = await runDed(pdfC, 'c-provider-error.pdf');
    check('C1 execute dipanggil tepat 1x (tanpa retry)', callCount === 1, `calls=${callCount}`);
    check('C2 hasil error kode MODEL_ERROR', outC.success === false && outC.error?.code === 'MODEL_ERROR',
      `success=${outC.success} code=${outC.error?.code}`);
    check('C3 tanpa warning retry transport', !hasWarning(outC, 'mencoba sekali lagi'));

    // =======================================================================
    // C2. MODEL_TIMEOUT -> TIDAK ada retry transport (pengecualian yang
    //     disengaja: kode ini juga dipakai untuk model lambat / timeout
    //     auth di providerClient, bukan bukti transport murni).
    // =======================================================================
    console.log('== C2. MODEL_TIMEOUT -> tanpa retry transport ==');
    resetMock(() => ({ __fail: 'MODEL_TIMEOUT' }));
    const pdfC2 = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah.`]);
    const outC2: any = await runDed(pdfC2, 'c2-model-timeout.pdf');
    check('C2-1 execute dipanggil tepat 1x (tanpa retry)', callCount === 1, `calls=${callCount}`);
    check('C2-2 hasil error kode MODEL_TIMEOUT', outC2.success === false && outC2.error?.code === 'MODEL_TIMEOUT',
      `success=${outC2.success} code=${outC2.error?.code}`);
    check('C2-3 tanpa warning retry transport', !hasWarning(outC2, 'mencoba sekali lagi'));

    // =======================================================================
    // D. JSON malformed -> tetap jalur split-retry, BUKAN retry transport.
    //    (Pin d)
    // =======================================================================
    console.log('== D. JSON malformed -> split-retry, bukan retry transport ==');
    resetMock((prompt) => {
      const has1 = prompt.includes(M1);
      const has2 = prompt.includes(M2);
      if (has1 && has2) return 'Ini bukan JSON, hanya prosa model tanpa kurung kurawal sama sekali.';
      if (has1) return { items: [itemPondasi], projectInfo: { scopeSummary: 'pondasi' } };
      if (has2) return { items: [itemDinding], projectInfo: { scopeSummary: 'dinding' } };
      return { items: [] };
    });
    const pdfD = buildPdf([
      `${M1} Pekerjaan pondasi batu kali galian tanah.`,
      `${M2} Pekerjaan dinding bata merah plesteran.`,
    ]);
    const outD: any = await runDed(pdfD, 'd-json-malformed.pdf');
    check('D1 sukses dengan 2 item anak-anak', outD.success === true && outD.items.length === 2,
      `success=${outD.success} items=${outD.items.length}`);
    check('D2 execute dipanggil 3x (1 induk + 2 anak)', callCount === 3, `calls=${callCount}`);
    check('D3 warning split-retry tercatat',
      hasWarning(outD, 'bukan JSON valid') && hasWarning(outD, 'dipecah dua'),
      JSON.stringify(outD.warnings));
    check('D4 TANPA warning retry transport', !hasWarning(outD, 'mencoba sekali lagi'),
      JSON.stringify(outD.warnings));

    // =======================================================================
    // E. Pin murni: klasifikasi transport + batas delay (tanpa run service).
    // =======================================================================
    console.log('== E. Pin klasifikasi + konstanta delay ==');
    check('E1 NETWORK_ERROR = transport',
      isFullAiTransportFailure({ success: false, errorCode: 'NETWORK_ERROR' }) === true);
    check('E2 MODEL_ERROR bukan transport',
      isFullAiTransportFailure({ success: false, errorCode: 'MODEL_ERROR' }) === false);
    check('E3 MODEL_TIMEOUT bukan transport',
      isFullAiTransportFailure({ success: false, errorCode: 'MODEL_TIMEOUT' }) === false);
    check('E4 MALFORMED_JSON bukan transport',
      isFullAiTransportFailure({ success: false, errorCode: 'MALFORMED_JSON' }) === false);
    check('E5 sukses bukan kegagalan transport',
      isFullAiTransportFailure({ success: true, errorCode: null }) === false);
    check('E6 errorCode absen bukan transport',
      isFullAiTransportFailure({ success: false }) === false);
    check('E7 delay retry 1000 ms, terbatas (0 < d <= 5000)',
      FULL_AI_TRANSPORT_RETRY_DELAY_MS === 1000 &&
      FULL_AI_TRANSPORT_RETRY_DELAY_MS > 0 &&
      FULL_AI_TRANSPORT_RETRY_DELAY_MS <= 5000,
      `delay=${FULL_AI_TRANSPORT_RETRY_DELAY_MS}`);
  } finally {
    // Pulihkan client asli — jangan biarkan stub bocor ke proses lain.
    (aiToolsProviderClient as any).execute = origExecute;
  }

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
