/**
 * DOCUMENT STUDIO — F8 terjemahan dokumen (orchestrator TRANSLATE_DOCUMENT +
 * service mode TRANSLATE + prompt preservasi + buildTranslatedDraft).
 * Transport AI di-mock: tidak ada panggilan jaringan. Pola docStudioEngine
 * (tsx + check()).
 * Jalankan: npx tsx src/test/docStudioTranslate.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mock localStorage untuk node (store.ts)
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

import { readFileSync } from 'node:fs';
import { DocumentStudioOrchestrator, type DocAiTransport } from '../ai-tools/document-ai/orchestrator';
import { dokumenAiService } from '../ai-tools/document-ai/service';
import {
  TRANSLATE_PROMPT_VERSION, TRANSLATE_LANGUAGE_NAMES, systemForMode,
} from '../ai-tools/document-ai/prompt';
import { markdownToHtml } from '../ai-tools/document-ai/markdownHtml';
import { buildTranslatedDraft, draftStore, type DraftRecord } from '../ai-tools/document-ai/store';
import {
  TRANSLATE_LANGUAGE_CODES, isTranslateLanguage,
  type DokumenAiChatRequest, type DokumenAiChatResponse,
} from '../ai-tools/document-ai/types';

class MockTransport implements DocAiTransport {
  calls: DokumenAiChatRequest[] = [];
  constructor(private responder: (req: DokumenAiChatRequest) => DokumenAiChatResponse) {}
  async chat(req: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    this.calls.push(req);
    return this.responder(req);
  }
}

/* Fixture: HTML draf BAST seperti isi editor (heading, tebal, daftar, tabel
   pipa setelah serialisasi, nomor dokumen, tanggal, nilai uang). */
const SOURCE_HTML = [
  '<h1>BERITA ACARA SERAH TERIMA PEKERJAAN</h1>',
  '<p>Nomor: <strong>BAST/PRJ-2026-001/IX/2026</strong></p>',
  '<p>Pada hari ini, tanggal <strong>12 September 2026</strong>, kami yang bertanda tangan di bawah ini:</p>',
  '<ul><li>Nama: Ir. Hendra Kusuma</li><li>Perusahaan: PT Contoh Konstruksi</li></ul>',
  '<table><tbody><tr><th>Uraian</th><th>Nilai</th></tr>' +
    '<tr><td>Nilai Kontrak</td><td>Rp 850.000.000</td></tr>' +
    '<tr><td>Progres</td><td>100%</td></tr></tbody></table>',
  '<p>Total nilai pekerjaan sebesar Rp 850.000.000 (delapan ratus lima puluh juta rupiah).</p>',
].join('\n');

/* Balasan model tiruan: struktur & angka dipertahankan persis. */
const REPLY_MD = [
  '# CERTIFICATE OF HANDOVER OF WORK',
  '',
  'Number: **BAST/PRJ-2026-001/IX/2026**',
  '',
  'On this day, **12 September 2026**, we the undersigned:',
  '',
  '- Name: Ir. Hendra Kusuma',
  '- Company: PT Contoh Konstruksi',
  '',
  '| Description | Value |',
  '| --- | --- |',
  '| Contract Value | Rp 850.000.000 |',
  '| Progress | 100% |',
  '',
  'The total value of the work is Rp 850.000.000 (eight hundred fifty million rupiah).',
].join('\n');

async function main(): Promise<void> {
  console.log('\n[1] pemetaan bahasa target:');
  check('8 bahasa didukung', TRANSLATE_LANGUAGE_CODES.length === 8);
  check(
    'kode sesuai spesifikasi (en/zh/ja/ko/ar/es/fr/de)',
    ['en', 'zh', 'ja', 'ko', 'ar', 'es', 'fr', 'de'].every((c) => isTranslateLanguage(c)),
  );
  check("isTranslateLanguage menolak 'id' (bahasa sumber) & 'xx'", !isTranslateLanguage('id') && !isTranslateLanguage('xx'));
  check(
    'setiap kode punya label UI + nama Inggris',
    TRANSLATE_LANGUAGE_CODES.every((c) => TRANSLATE_LANGUAGE_NAMES[c].label.length > 0 && TRANSLATE_LANGUAGE_NAMES[c].english.length > 0),
  );
  check("label UI: en=Inggris, zh=Mandarin, ja=Jepang", TRANSLATE_LANGUAGE_NAMES.en.label === 'Inggris' && TRANSLATE_LANGUAGE_NAMES.zh.label === 'Mandarin' && TRANSLATE_LANGUAGE_NAMES.ja.label === 'Jepang');

  console.log('\n[2] prompt terjemahan — aturan preservasi wajib:');
  const sys = systemForMode('TRANSLATE');
  check('versi prompt doc-translate-v1', TRANSLATE_PROMPT_VERSION === 'doc-translate-v1');
  check('identitas Document Translator', sys.includes('EZRAB Document Translator'));
  check('struktur markdown dipertahankan persis', sys.includes('Pertahankan struktur markdown'));
  check('nama/nomor/tanggal/angka TIDAK diterjemahkan', sys.includes('JANGAN terjemahkan') && sys.includes('nomor dokumen') && sys.includes('nilai uang'));
  check('penanda [ISI: ...] dipertahankan', sys.includes('[ISI:'));
  check('keluaran HANYA dokumen terjemahan', sys.includes('HANYA dokumen hasil terjemahan'));
  check('istilah konstruksi → padanan baku', sys.includes('padanan baku'));

  console.log('\n[3] orchestrator TRANSLATE_DOCUMENT — alur & serialisasi markdown-lite:');
  const transport = new MockTransport((req) => ({
    success: true, mode: req.mode, reply: REPLY_MD, truncated: false, provider: 'gemini', model: 'gemini-test-x',
  }));
  const orch = new DocumentStudioOrchestrator(transport);
  const res = await orch.handle({
    intent: 'TRANSLATE_DOCUMENT',
    documentText: SOURCE_HTML,
    fileName: 'BAST Rumah 2 Lantai',
    targetLanguage: 'en',
  });
  check('sukses', res.success === true, res.message);
  check('satu panggilan transport, mode TRANSLATE', transport.calls.length === 1 && transport.calls[0].mode === 'TRANSLATE');
  check('targetLanguage diteruskan ke service', transport.calls[0].targetLanguage === 'en');
  const sentMd = transport.calls[0].documentText;
  check('HTML diserialisasi: heading menjadi #', sentMd.includes('# BERITA ACARA SERAH TERIMA PEKERJAAN'));
  check('HTML diserialisasi: tebal menjadi **', sentMd.includes('**BAST/PRJ-2026-001/IX/2026**'));
  check('HTML diserialisasi: daftar menjadi - ', sentMd.includes('- Nama: Ir. Hendra Kusuma'));
  check('HTML diserialisasi: tabel menjadi pipa + baris pemisah', sentMd.includes('| Uraian | Nilai |') && sentMd.includes('| --- | --- |'));
  check('angka sumber utuh di teks terkirim', sentMd.includes('Rp 850.000.000'));
  check('konten = markdown balasan model', res.content === REPLY_MD);
  check('promptVersion doc-translate-v1', res.promptVersion === 'doc-translate-v1');
  check('provenance provider/model diteruskan dari respons', res.provider === 'gemini' && res.model === 'gemini-test-x');
  check('truncated diteruskan (false)', res.truncated === false);

  console.log('\n[4] hasil terjemahan → HTML editor: struktur & angka bertahan:');
  const html = markdownToHtml(res.content || '');
  check('judul menjadi <h1>', html.includes('<h1'));
  check('tabel pipa menjadi <table> sungguhan', html.includes('<table'));
  check('nomor dokumen persis', html.includes('BAST/PRJ-2026-001/IX/2026'));
  check('tanggal persis', html.includes('12 September 2026'));
  check('nilai uang persis (2 kemunculan)', (html.match(/850\.000\.000/g) ?? []).length === 2);
  check('nama orang/perusahaan persis', html.includes('Ir. Hendra Kusuma') && html.includes('PT Contoh Konstruksi'));

  console.log('\n[5] validasi & kegagalan terstruktur:');
  const tUnknown = new MockTransport(() => ({ success: true, mode: 'TRANSLATE', reply: 'x' }));
  const rUnknown = await new DocumentStudioOrchestrator(tUnknown).handle({
    intent: 'TRANSLATE_DOCUMENT', documentText: SOURCE_HTML, targetLanguage: 'xx',
  });
  check('bahasa tak dikenal → UNKNOWN_LANGUAGE', rUnknown.success === false && rUnknown.errorCode === 'UNKNOWN_LANGUAGE');
  check('bahasa tak dikenal → transport TIDAK dipanggil', tUnknown.calls.length === 0);
  const rEmpty = await orch.handle({ intent: 'TRANSLATE_DOCUMENT', documentText: '   ', targetLanguage: 'en' });
  check('dokumen kosong → NO_DATA', rEmpty.success === false && rEmpty.errorCode === 'NO_DATA');
  const tEmptyReply = new MockTransport((req) => ({ success: true, mode: req.mode, reply: '  ' }));
  const rEmptyReply = await new DocumentStudioOrchestrator(tEmptyReply).handle({
    intent: 'TRANSLATE_DOCUMENT', documentText: SOURCE_HTML, targetLanguage: 'ja',
  });
  check('balasan kosong → EMPTY_RESPONSE', rEmptyReply.success === false && rEmptyReply.errorCode === 'EMPTY_RESPONSE');
  const tFail = new MockTransport((req) => ({
    success: false, mode: req.mode, errorCode: 'AUTH_REQUIRED', stage: 'http', message: 'Gerbang menolak.',
  }));
  const rFail = await new DocumentStudioOrchestrator(tFail).handle({
    intent: 'TRANSLATE_DOCUMENT', documentText: SOURCE_HTML, targetLanguage: 'de',
  });
  check('kegagalan provider diteruskan apa adanya', rFail.success === false && rFail.errorCode === 'AUTH_REQUIRED' && rFail.message === 'Gerbang menolak.');
  const tTrunc = new MockTransport((req) => ({ success: true, mode: req.mode, reply: REPLY_MD, truncated: true }));
  const rTrunc = await new DocumentStudioOrchestrator(tTrunc).handle({
    intent: 'TRANSLATE_DOCUMENT', documentText: SOURCE_HTML, targetLanguage: 'zh',
  });
  check('truncated=true diteruskan ke hasil', rTrunc.success === true && rTrunc.truncated === true);
  const tNoProv = new MockTransport((req) => ({ success: true, mode: req.mode, reply: REPLY_MD }));
  const rNoProv = await new DocumentStudioOrchestrator(tNoProv).handle({
    intent: 'TRANSLATE_DOCUMENT', documentText: SOURCE_HTML, targetLanguage: 'ko',
  });
  check('tanpa identitas provider → null (tidak dikarang)', rNoProv.provider === null && rNoProv.model === null);

  console.log('\n[6] service TRANSLATE — validasi pra-jaringan (tanpa panggilan provider):');
  const sBadLang = await dokumenAiService.chat({ mode: 'TRANSLATE', targetLanguage: 'xx', documentText: '# Halo', fileName: 'D' });
  check('service: bahasa tak dikenal → UNKNOWN_LANGUAGE', sBadLang.success === false && sBadLang.errorCode === 'UNKNOWN_LANGUAGE');
  const sEmpty = await dokumenAiService.chat({ mode: 'TRANSLATE', targetLanguage: 'en', documentText: '   ', fileName: 'D' });
  check('service: dokumen kosong → NO_DATA', sEmpty.success === false && sEmpty.errorCode === 'NO_DATA');

  console.log('\n[7] buildTranslatedDraft — warisan & gerbang final:');
  const source: DraftRecord = {
    id: 'draft_sumber',
    templateId: 'berita-acara',
    templateName: 'Berita Acara',
    title: 'BAST Rumah 2 Lantai',
    content: SOURCE_HTML,
    contentFormat: 'html',
    projectId: 'prj_9',
    projectName: 'Rumah 2 Lantai',
    status: 'final',
    createdAt: 100,
    updatedAt: 200,
    companyProfileId: 'prof_1',
    approvedBy: 'Budi Santoso',
    approvedAt: 150,
  };
  const translated = buildTranslatedDraft(source, {
    content: html, targetLanguage: 'en', modelLabel: 'gemini-test-x', promptVersion: TRANSLATE_PROMPT_VERSION, now: 999,
  });
  check('record baru (id berbeda)', translated.id !== source.id);
  check('judul + penanda bahasa (EN)', translated.title === 'BAST Rumah 2 Lantai (EN)');
  check('status SELALU draft — final sumber tidak diwarisi', translated.status === 'draft');
  check('persetujuan sumber TIDAK ikut (approvedBy/At kosong)', translated.approvedBy === undefined && translated.approvedAt === undefined);
  check('companyProfileId (kop) diwarisi', translated.companyProfileId === 'prof_1');
  check('projectId/projectName diwarisi', translated.projectId === 'prj_9' && translated.projectName === 'Rumah 2 Lantai');
  check('templateId/templateName diwarisi', translated.templateId === 'berita-acara' && translated.templateName === 'Berita Acara');
  check('provenance: sourceDraftId menunjuk sumber', translated.sourceDraftId === 'draft_sumber');
  check("provenance: sourceLanguage 'id' → language 'en'", translated.sourceLanguage === 'id' && translated.language === 'en');
  check('provenance: modelLabel dari respons provider', translated.modelLabel === 'gemini-test-x');
  check('provenance: promptVersion terjemahan', translated.promptVersion === 'doc-translate-v1');
  check('sumber tidak diubah (tetap final)', source.status === 'final' && source.approvedBy === 'Budi Santoso');
  const chained = buildTranslatedDraft(translated, { content: html, targetLanguage: 'ja', now: 1000 });
  check('terjemahan dari terjemahan: sourceLanguage mengikuti sumber (en)', chained.sourceLanguage === 'en' && chained.language === 'ja');
  draftStore.upsert(translated);
  const stored = draftStore.get(translated.id);
  check('tersimpan & terbaca kembali dari store', !!stored && stored.language === 'en' && stored.sourceDraftId === 'draft_sumber');

  console.log('\n[8] wiring UI DocCreator:');
  const ui = readFileSync('src/ai-tools/document-ai/components/DocCreator.tsx', 'utf8');
  check("menu Terjemahkan ada", ui.includes('Terjemahkan…'));
  check("memanggil intent TRANSLATE_DOCUMENT", ui.includes("intent: 'TRANSLATE_DOCUMENT'"));
  check('memakai buildTranslatedDraft', ui.includes('buildTranslatedDraft'));
  check('pemilih bahasa dari TRANSLATE_LANGUAGE_CODES', ui.includes('TRANSLATE_LANGUAGE_CODES'));
  check('tombol nonaktif saat isi kosong', ui.includes("!toPlainText(html, 'html').trim()"));

  console.log(`\nHASIL docStudioTranslate: ${passed} lulus, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Suite error:', e);
  process.exit(1);
});
