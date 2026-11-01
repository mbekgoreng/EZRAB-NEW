/**
 * SPRINT 1 — Document AI Analyzer chunking + gateway error contract.
 *
 * Membuktikan perbaikan P0:
 *  - validateAiInput (gateway ASLI, api/_lib/security.js) mengembalikan
 *    errorCode PAYLOAD_TOO_LARGE untuk kegagalan ukuran dan INVALID_REQUEST
 *    untuk kegagalan validasi lain — tanpa mengubah pesan/batas yang ada.
 *  - providerClient + aiProviderRouter memetakan kedua kode itu secara
 *    berbeda (bukan MODEL_ERROR generik); pemetaan lama tidak berubah.
 *  - Analyzer SUMMARY memotong dokumen besar menjadi potongan berhalaman,
 *    SETIAP request terukur (system + prompt) ≤ 19.500 karakter, kegagalan
 *    sebagian → hasil SEBAGIAN berlabel, semua gagal → error nyata.
 *  - Tanya Dokumen memakai retrieval kata kunci deterministik: potongan
 *    relevan terpilih, yang tidak relevan tidak dikirim, dan pertanyaan
 *    tanpa tumpang-tindih → jalur jujur tanpa panggilan AI.
 *
 * Jalankan: esbuild bundle + node (alias vitest tidak dipakai suite ini).
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

import {
  DOC_CHUNK_TEXT_BUDGET,
  MAX_AI_REQUEST_CHARS,
  MAX_DOC_CHUNKS,
  buildDocumentChunks,
  condenseTextsProportionally,
  fitTextWithinRequest,
  measureAiRequestChars,
  selectChunksForQuestion,
  splitDocumentPages,
} from '../ai-tools/document-ai/chunking';
import { DokumenAiService } from '../ai-tools/document-ai/service';
import { systemForMode } from '../ai-tools/document-ai/prompt';
import { mapGatewayHttpError } from '../ai-tools/providerClient';
import { mapRouterGatewayError } from '../services/aiProviderRouter';
import { aiToolsError } from '../ai-tools/types';

const security = await import('../../api/_lib/security.js');
const { validateAiInput } = security;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeDoc(pages: number, charsPerPage: number, fillers: Record<number, string> = {}): string {
  const out: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const filler = fillers[p] || '';
    const body = (filler + ' ' + 'teks pengisi dokumen konstruksi nomor pasal dan ketentuan umum '.repeat(
      Math.max(1, Math.floor((charsPerPage - filler.length) / 60)),
    )).slice(0, charsPerPage);
    out.push(`[Halaman ${p}]\n${body}`);
  }
  return out.join('\n\n');
}

interface RecordedCall { systemPrompt?: string; prompt: string }
function fakeClient(handler: (call: RecordedCall, idx: number) => any) {
  const calls: RecordedCall[] = [];
  const client = {
    calls,
    execute: async (req: any) => {
      const call: RecordedCall = { systemPrompt: req.systemPrompt, prompt: req.prompt };
      calls.push(call);
      return handler(call, calls.length - 1);
    },
  };
  return client as any;
}
const okReply = (content: string) => ({
  success: true, content, structured: null, requestId: 'test', provider: 'fake', model: 'fake',
});
const allWithinBudget = (calls: RecordedCall[]) =>
  calls.every((c) => measureAiRequestChars(c.systemPrompt || '', c.prompt) <= MAX_AI_REQUEST_CHARS)
  && calls.every((c) => c.prompt.length <= 20_000);

/* ------------------------------------------------------------------ */
console.log('\n[1] chunking murni: halaman, batas, cakupan');
{
  const text = makeDoc(30, 5000);
  const pages = splitDocumentPages(text);
  check('30 halaman terpisah dengan nomor lestari', pages.length === 30 && pages[0].page === 1 && pages[29].page === 30);
  const chunks = buildDocumentChunks(pages);
  check('setiap potongan ≤ anggaran teks', chunks.every((c) => c.charCount <= DOC_CHUNK_TEXT_BUDGET),
    chunks.map((c) => c.charCount).join(','));
  check('rentang halaman kontigu menutup 1..30',
    chunks[0].startPage === 1 && chunks[chunks.length - 1].endPage === 30
    && chunks.every((c, i) => i === 0 || c.startPage === chunks[i - 1].endPage + 1));
  check('penanda halaman lestari di teks potongan', chunks.every((c) => c.text.includes('[Halaman ')));

  const giant = splitDocumentPages(`[Halaman 1]\n${'x'.repeat(50_000)}`);
  const gChunks = buildDocumentChunks(giant);
  check('halaman raksasa dipecah, tetap halaman 1, tetap ≤ anggaran',
    gChunks.length >= 4 && gChunks.every((c) => c.startPage === 1 && c.endPage === 1 && c.charCount <= DOC_CHUNK_TEXT_BUDGET));

  const noMarker = splitDocumentPages('Paragraf satu tentang beton.\n\nParagraf dua tentang bekisting.');
  check('teks tanpa penanda → pseudo-halaman', noMarker.length >= 1 && noMarker[0].page === 1);

  const fit = fitTextWithinRequest('S'.repeat(1000), 500, 'y'.repeat(30_000));
  check('fitTextWithinRequest memotong ke anggaran terukur',
    fit.truncated && measureAiRequestChars('S'.repeat(1000), 'y'.repeat(500) + fit.text) <= MAX_AI_REQUEST_CHARS);
  const fitOk = fitTextWithinRequest('s', 10, 'pendek');
  check('fitTextWithinRequest tidak memotong teks pendek', !fitOk.truncated && fitOk.text === 'pendek');

  const condensed = condenseTextsProportionally(['a'.repeat(5000), 'b'.repeat(5000), 'c'.repeat(5000)], 6000);
  check('condense proporsional ≤ anggaran', condensed.condensed
    && condensed.texts.reduce((a, t) => a + t.length, 0) <= 6000);
  const untouched = condenseTextsProportionally(['kecil'], 6000);
  check('condense tidak menyentuh yang sudah muat', !untouched.condensed && untouched.texts[0] === 'kecil');
}

/* ------------------------------------------------------------------ */
console.log('\n[2] gateway validateAiInput: kontrak errorCode');
{
  const empty = validateAiInput({});
  check('body kosong → INVALID_REQUEST', empty.errors.length > 0 && empty.errorCode === 'INVALID_REQUEST',
    JSON.stringify(empty));
  const oversize = validateAiInput({ prompt: 'x'.repeat(20_001) });
  check('prompt 20.001 char → PAYLOAD_TOO_LARGE', oversize.errorCode === 'PAYLOAD_TOO_LARGE'
    && oversize.errors.join(' ').includes('maksimal 20000'), JSON.stringify(oversize.errorCode));
  const atLimit = validateAiInput({ prompt: 'x'.repeat(20_000) });
  check('prompt tepat 20.000 char → lolos, errorCode null', atLimit.errors.length === 0 && atLimit.errorCode === null);
  const mediaBig = validateAiInput({ prompt: 'halo', imageDataBase64: 'A'.repeat(3_600_000), imageMimeType: 'image/png' });
  check('media base64 3,6jt char → PAYLOAD_TOO_LARGE', mediaBig.errorCode === 'PAYLOAD_TOO_LARGE');
  const mediaBad = validateAiInput({ prompt: 'halo', imageDataBase64: '!!!bukan-base64!!!', imageMimeType: 'image/png' });
  check('media bukan base64 → INVALID_REQUEST', mediaBad.errorCode === 'INVALID_REQUEST');
}

/* ------------------------------------------------------------------ */
console.log('\n[3] pemetaan error klien (providerClient + router)');
{
  const p = mapGatewayHttpError(400, 'PAYLOAD_TOO_LARGE');
  check('400 PAYLOAD_TOO_LARGE → kode khusus, tidak retryable', p.code === 'PAYLOAD_TOO_LARGE' && p.retryable === false);
  const inv = mapGatewayHttpError(400, 'INVALID_REQUEST');
  check('400 INVALID_REQUEST → kode khusus', inv.code === 'INVALID_REQUEST' && inv.retryable === false);
  check('CONTENT_REJECTED tidak berubah', mapGatewayHttpError(400, 'CONTENT_REJECTED').code === 'CONTENT_REJECTED');
  check('AI_BAD_REQUEST tidak berubah', mapGatewayHttpError(400, 'AI_BAD_REQUEST').code === 'AI_BAD_REQUEST');
  check('401 tetap AUTH_REQUIRED', mapGatewayHttpError(401, '').code === 'AUTH_REQUIRED');
  const r429 = mapGatewayHttpError(429, '');
  check('429 tetap MODEL_ERROR retryable', r429.code === 'MODEL_ERROR' && r429.retryable === true);

  check('router: PAYLOAD_TOO_LARGE terpetakan', mapRouterGatewayError({ status: 400, serverErrorCode: 'PAYLOAD_TOO_LARGE' }).code === 'PAYLOAD_TOO_LARGE');
  check('router: INVALID_REQUEST terpetakan', mapRouterGatewayError({ status: 400, serverErrorCode: 'INVALID_REQUEST' }).code === 'INVALID_REQUEST');
  check('router: 500 tetap SERVICE_UNAVAILABLE', mapRouterGatewayError({ status: 500 }).code === 'SERVICE_UNAVAILABLE');
}

/* ------------------------------------------------------------------ */
console.log('\n[4] SUMMARY berpotongan lewat service (klien AI palsu)');
{
  // Dokumen besar yang dulu selalu 400: 30 halaman × 5.000 char.
  const doc = makeDoc(30, 5000);
  const client = fakeClient((call: RecordedCall) =>
    call.prompt.includes('Ekstrak temuan faktual')
      ? okReply('- Fakta: nilai pekerjaan tercatat pada potongan ini.')
      : okReply('Ringkasan akhir dokumen.'));
  const svc = new DokumenAiService(client);
  const res = await svc.chat({ documentText: doc, fileName: 'RKS.pdf', mode: 'SUMMARY' });
  const pages = splitDocumentPages(doc);
  const nChunks = buildDocumentChunks(pages).length;
  check('dokumen 150rb char berhasil diringkas', res.success === true, res.message);
  check('panggilan = potongan + 1 sintesis', client.calls.length === nChunks + 1,
    `${client.calls.length} vs ${nChunks + 1}`);
  check('SETIAP request terukur ≤ 19.500 (dan prompt ≤ 20.000)', allWithinBudget(client.calls),
    client.calls.map((c: RecordedCall) => measureAiRequestChars(c.systemPrompt || '', c.prompt)).join(','));
  check('cakupan penuh: 30/30 halaman, tidak parsial',
    res.coverage?.totalPages === 30 && res.coverage?.processedPages === 30 && res.partial === false);
  check('balasan memuat baris cakupan', (res.reply || '').includes('Cakupan analisis'));

  // Dokumen kecil tetap satu potongan.
  const small = fakeClient(() => okReply('temuan'));
  const svcSmall = new DokumenAiService(small);
  const resSmall = await svcSmall.chat({ documentText: makeDoc(2, 800), fileName: 'kecil.pdf', mode: 'SUMMARY' });
  check('dokumen kecil: 1 potongan + sintesis', resSmall.success && small.calls.length === 2);

  // Kegagalan sebagian → hasil SEBAGIAN berlabel dengan rentang gagal.
  const partialClient = fakeClient((call: RecordedCall, idx: number) =>
    idx === 1 ? aiToolsError('MODEL_ERROR', 'fake:http', 'provider gagal') : okReply('temuan / ringkasan'));
  const svcPartial = new DokumenAiService(partialClient);
  const resPartial = await svcPartial.chat({ documentText: makeDoc(6, 5000), fileName: 'p.pdf', mode: 'SUMMARY' });
  check('satu potongan gagal → tetap sukses tetapi SEBAGIAN',
    resPartial.success === true && resPartial.partial === true && resPartial.coverage?.failedChunks === 1,
    JSON.stringify(resPartial.coverage));
  check('rentang halaman gagal tercatat', (resPartial.coverage?.failedPageRanges.length || 0) === 1);
  check('balasan menyatakan SEBAGIAN secara eksplisit', (resPartial.reply || '').includes('SEBAGIAN'));

  // Semua potongan gagal → error nyata, bukan ringkasan palsu.
  const failClient = fakeClient(() => aiToolsError('MODEL_ERROR', 'fake:http', 'provider mati'));
  const svcFail = new DokumenAiService(failClient);
  const resFail = await svcFail.chat({ documentText: makeDoc(4, 4000), fileName: 'f.pdf', mode: 'SUMMARY' });
  check('semua potongan gagal → success:false berkode', resFail.success === false && resFail.errorCode === 'MODEL_ERROR' && !resFail.reply);

  // Batas jumlah potongan: 100 halaman → potongan > 24 → diproses 24, parsial.
  const capClient = fakeClient(() => okReply('temuan'));
  const svcCap = new DokumenAiService(capClient);
  const bigDoc = makeDoc(100, 5000);
  const resCap = await svcCap.chat({ documentText: bigDoc, fileName: 'besar.pdf', mode: 'SUMMARY' });
  check('potongan dibatasi MAX_DOC_CHUNKS dan ditandai parsial',
    resCap.coverage?.processedChunks === MAX_DOC_CHUNKS && resCap.coverage?.partial === true
    && (resCap.coverage?.totalChunks || 0) > MAX_DOC_CHUNKS,
    JSON.stringify(resCap.coverage));
  check('sintesis dari temuan besar tetap ≤ anggaran', allWithinBudget(capClient.calls));
}

/* ------------------------------------------------------------------ */
console.log('\n[5] Tanya Dokumen: retrieval deterministik');
{
  const doc = makeDoc(12, 3000, {
    2: 'Spesifikasi bronjong kawat galvanis untuk tebing sungai.',
    11: 'Lampiran memuat kata unik kacangmede sebagai penanda halaman jauh.',
  });
  const qaClient = fakeClient(() => okReply('Jawaban dari kutipan.'));
  const svcQa = new DokumenAiService(qaClient);
  const resQa = await svcQa.chat({
    documentText: doc, fileName: 'q.pdf', mode: 'QA',
    prompt: 'Apa spesifikasi bronjong pada dokumen ini?',
  });
  check('jawaban QA berhasil', resQa.success === true, resQa.message);
  check('tepat satu panggilan AI untuk QA', qaClient.calls.length === 1);
  const sent = qaClient.calls[0]?.prompt || '';
  check('kutipan relevan (bronjong) terkirim', sent.includes('bronjong'));
  check('potongan tidak relevan (kacangmede) TIDAK terkirim', !sent.includes('kacangmede'));
  check('kutipan berlabel halaman', /\[Halaman \d+–\d+\]/.test(sent));
  check('request QA ≤ anggaran', allWithinBudget(qaClient.calls));

  // Seleksi murni: potongan berisi kata unik terpilih, yang lain tidak.
  const chunks = buildDocumentChunks(splitDocumentPages(doc));
  const sel = selectChunksForQuestion(chunks, 'Apa spesifikasi bronjong pada dokumen ini?', 2);
  check('selectChunksForQuestion memilih potongan bronjong saja',
    sel.bestScore > 0 && sel.selected.length >= 1 && sel.selected.every((s) => s.chunk.text.includes('bronjong') || s.score < sel.bestScore),
    JSON.stringify(sel.selected.map((s) => s.chunk.index)));

  // Nol tumpang-tindih → jalur jujur TANPA panggilan AI.
  const noCallClient = fakeClient(() => okReply('tidak boleh terpanggil'));
  const svcNo = new DokumenAiService(noCallClient);
  const resNo = await svcNo.chat({
    documentText: doc, fileName: 'q.pdf', mode: 'QA',
    prompt: 'Siapa nama kucing direktur dan warna bulunya?',
  });
  check('nol tumpang-tindih → contextInsufficient, sukses jujur',
    resNo.success === true && resNo.contextInsufficient === true);
  check('nol tumpang-tindih → TIDAK ada panggilan AI', noCallClient.calls.length === 0);
  check('pesan batas menyebut tidak tercantum', (resNo.reply || '').includes('tidak ditemukan'));

  // Kegagalan provider pada QA diteruskan berkode (bukan menggantung).
  const qaFail = fakeClient(() => aiToolsError('PAYLOAD_TOO_LARGE', 'DOKUMEN_AI:http', 'terlalu besar'));
  const svcQaFail = new DokumenAiService(qaFail);
  const resQaFail = await svcQaFail.chat({
    documentText: doc, fileName: 'q.pdf', mode: 'QA', prompt: 'Apa spesifikasi bronjong?',
  });
  check('kegagalan QA diteruskan dengan kodenya', resQaFail.success === false && resQaFail.errorCode === 'PAYLOAD_TOO_LARGE');
}

/* ------------------------------------------------------------------ */
console.log('\n[6] regresi jalur lain: DRAFT kecil tetap utuh');
{
  const draftClient = fakeClient(() => okReply('# Draf Surat\nIsi draf.'));
  const svcDraft = new DokumenAiService(draftClient);
  const resDraft = await svcDraft.chat({
    documentText: 'Konteks proyek: pembangunan rumah tinggal.', fileName: 'Draf',
    mode: 'DRAFT', prompt: 'Buatkan surat penawaran.',
  });
  check('DRAFT kecil berhasil seperti sebelumnya', resDraft.success === true && (resDraft.reply || '').includes('Draf Surat'));
  check('system prompt SUMMARY tidak kosong (sanity)', systemForMode('SUMMARY').length > 100);
}

/* ------------------------------------------------------------------ */
console.log(`\n=== documentAnalyzerChunking: ${passed} passed, ${failed} failed ===`);
if (failed) {
  console.log('FAILED: ' + failures.join(' | '));
  process.exitCode = 1;
}
