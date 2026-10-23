/**
 * DOCUMENT STUDIO — tes klaster F2 (format keluaran AI).
 * Jalankan: npx tsx src/test/docStudioMarkdown.test.ts
 *
 * Kontrak yang dijaga:
 * - markdownToHtml: markdown model → HTML editor aman (escape-first,
 *   heading/bold/list/hr, tabel pipa → <table> sungguhan).
 * - htmlToMarkdownLite: HTML editor → markdown-lite untuk jalur REVISI
 *   (struktur bertahan melewati model).
 * - Prompt DRAFT doc-draft-v3 menyatakan FORMAT KELUARAN markdown —
 *   prompt & konverter sepakat.
 * - Orchestrator meneruskan flag truncated service → UI (CREATE).
 * - Wiring sumber: DocCreator memakai markdownToHtml pada jalur AI,
 *   DocStudioReview mengirim markdown-lite untuk REVISE, DocAnalyzer
 *   meneruskan history QA + anggaran COMPARE per dokumen + render format.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

import { markdownToHtml, htmlToMarkdownLite } from '../ai-tools/document-ai/markdownHtml';
import { DocumentStudioOrchestrator, type DocAiTransport } from '../ai-tools/document-ai/orchestrator';
import { DRAFT_PROMPT_VERSION, systemForMode } from '../ai-tools/document-ai/prompt';
import { emptyProfile, kopHtml } from '../ai-tools/document-ai/companyProfile';
import type { DokumenAiChatRequest, DokumenAiChatResponse } from '../ai-tools/document-ai/types';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

async function main(): Promise<void> {
  console.log('\n[1] markdownToHtml — blok:');
  check('# → <h1>', markdownToHtml('# Berita Acara') === '<h1>Berita Acara</h1>');
  check('## → <h2>', markdownToHtml('## I. Pembuka') === '<h2>I. Pembuka</h2>');
  check('### → <h3>', markdownToHtml('### Detail') === '<h3>Detail</h3>');
  check('#### dijepit ke <h3>', markdownToHtml('#### Dalam') === '<h3>Dalam</h3>');
  check('paragraf dua baris → <br>', markdownToHtml('Baris satu\nBaris dua') === '<p>Baris satu<br>Baris dua</p>');
  check('paragraf dipisah baris kosong', markdownToHtml('Satu.\n\nDua.') === '<p>Satu.</p><p>Dua.</p>');
  check('daftar - → <ul>', markdownToHtml('- Satu\n- Dua') === '<ul><li>Satu</li><li>Dua</li></ul>');
  check('daftar • → <ul>', markdownToHtml('• Satu\n• Dua').includes('<ul><li>Satu</li>'));
  check('daftar 1. → <ol>', markdownToHtml('1. Satu\n2. Dua') === '<ol><li>Satu</li><li>Dua</li></ol>');
  check('--- → <hr>', markdownToHtml('A\n\n---\n\nB') === '<p>A</p><hr><p>B</p>');
  check('kosong → <p></p>', markdownToHtml('') === '<p></p>' && markdownToHtml('   ') === '<p></p>');

  console.log('\n[2] markdownToHtml — inline:');
  check('**tebal** → <strong>', markdownToHtml('Nilai **Rp 5.000** disetujui').includes('<strong>Rp 5.000</strong>'));
  check('*miring* → <em>', markdownToHtml('catatan *penting* ini').includes('<em>penting</em>'));
  check('`kode` → <code>', markdownToHtml('pakai `A.4.1` ini').includes('<code>A.4.1</code>'));
  check('baris **DRAF** utuh → paragraf tebal', markdownToHtml('**DRAF**') === '<p><strong>DRAF</strong></p>');
  check('tebal di dalam item daftar', markdownToHtml('- **Wajib** hadir').includes('<li><strong>Wajib</strong> hadir</li>'));

  console.log('\n[3] markdownToHtml — tabel pipa:');
  const tbl = markdownToHtml('| No | Item |\n|---|---|\n| 1 | Pondasi batu kali |\n| 2 | Sloof beton |');
  check('tabel → <table>', tbl.startsWith('<table>'), tbl);
  check('header → <th>', tbl.includes('<th>No</th>') && tbl.includes('<th>Item</th>'));
  check('baris data → <td>', tbl.includes('<td>Pondasi batu kali</td>') && tbl.includes('<td>Sloof beton</td>'));
  check('baris pemisah tidak bocor sebagai teks', !tbl.includes('|---'));
  const tblNoEdge = markdownToHtml('No | Item\n--- | ---\n1 | Pondasi');
  check('tabel tanpa pipa tepi tetap jadi tabel', tblNoEdge.startsWith('<table>') && tblNoEdge.includes('<td>Pondasi</td>'), tblNoEdge);
  const tblBold = markdownToHtml('| Item | Status |\n|---|---|\n| Sloof | **Selesai** |');
  check('inline di dalam sel tabel', tblBold.includes('<td><strong>Selesai</strong></td>'), tblBold);

  console.log('\n[4] markdownToHtml — keamanan (escape-first, tanpa passthrough):');
  const evil = markdownToHtml('Teks <script>alert(1)</script> berbahaya');
  check('<script> tidak lolos', !evil.includes('<script>') && evil.includes('&lt;script&gt;'), evil);
  const rawB = markdownToHtml('teks <b>mentah</b> model');
  check('HTML mentah model tidak diteruskan', !rawB.includes('<b>mentah</b>') && rawB.includes('&lt;b&gt;'), rawB);
  const inj = markdownToHtml('"><img src=x onerror=alert(1)>');
  // onerror= hanya tersisa sebagai TEKS inert di dalam tag yang sudah
  // di-escape (&lt;img) — tidak ada elemen/atribut hidup yang terbentuk.
  check('injeksi atribut/img tidak lolos', !inj.includes('<img') && inj.includes('&lt;img'), inj);
  const link = markdownToHtml('[klik](javascript:alert(1))');
  check('tautan markdown tidak menjadi <a>', !link.includes('<a '), link);

  console.log('\n[5] htmlToMarkdownLite — struktur bertahan:');
  const md1 = htmlToMarkdownLite('<h1>Berita Acara</h1><p>Isi <strong>penting</strong> dan <em>miring</em>.</p>');
  check('h1 → #', md1.includes('# Berita Acara'), md1);
  check('strong → **', md1.includes('**penting**'), md1);
  check('em → *', md1.includes('*miring*'), md1);
  const mdList = htmlToMarkdownLite('<ul><li>Satu</li><li>Dua</li></ul>');
  check('ul → - ', mdList.includes('- Satu') && mdList.includes('- Dua'), mdList);
  const mdOl = htmlToMarkdownLite('<ol><li>Pertama</li><li>Kedua</li></ol>');
  check('ol → 1. 2.', mdOl.includes('1. Pertama') && mdOl.includes('2. Kedua'), mdOl);
  const mdTbl = htmlToMarkdownLite(
    '<table><tbody><tr><th>No</th><th>Item</th></tr><tr><td>1</td><td>Pondasi</td></tr></tbody></table>',
  );
  check('tabel → baris pipa', mdTbl.includes('| No | Item |') && mdTbl.includes('| 1 | Pondasi |'), mdTbl);
  check('tabel → baris pemisah', mdTbl.includes('| --- | --- |'), mdTbl);

  console.log('\n[6] roundtrip markdown → HTML → markdown-lite → HTML:');
  const srcMd = '# Laporan\n\nProgres **75%** minggu ini.\n\n| Item | Status |\n|---|---|\n| Sloof | Selesai |\n\n- Catatan satu\n- Catatan dua';
  const rtMd = htmlToMarkdownLite(markdownToHtml(srcMd));
  check('heading bertahan', rtMd.includes('# Laporan'), rtMd);
  check('tebal bertahan', rtMd.includes('**75%**'), rtMd);
  check('tabel bertahan', rtMd.includes('| Item | Status |') && rtMd.includes('| Sloof | Selesai |'), rtMd);
  check('daftar bertahan', rtMd.includes('- Catatan satu'), rtMd);
  const rtHtml = markdownToHtml(rtMd);
  check('HTML hasil roundtrip memuat <table> & <h1>', rtHtml.includes('<table>') && rtHtml.includes('<h1>Laporan</h1>'), rtHtml);

  console.log('\n[7] prompt & versi (kesepakatan format):');
  check('DRAFT_PROMPT_VERSION = doc-draft-v3', DRAFT_PROMPT_VERSION === 'doc-draft-v3');
  const draftSys = systemForMode('DRAFT');
  check('system DRAFT menyatakan FORMAT KELUARAN', draftSys.includes('FORMAT KELUARAN'));
  check('system DRAFT menyebut markdown + tabel pipa', draftSys.includes('markdown terstruktur') && draftSys.includes('tabel pipa'));
  check('system DRAFT melarang HTML mentah', draftSys.includes('Jangan menulis HTML mentah'));
  check('disiplin [ISI:] tetap ada', draftSys.includes('[ISI:'));

  console.log('\n[8] orchestrator — flag truncated diteruskan (CREATE):');
  class MockTransport implements DocAiTransport {
    calls: DokumenAiChatRequest[] = [];
    constructor(private responder: (req: DokumenAiChatRequest) => DokumenAiChatResponse) {}
    async chat(req: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
      this.calls.push(req);
      return this.responder(req);
    }
  }
  const tTrunc = new MockTransport((req) => ({ success: true, mode: req.mode, reply: '# Draf\n\nIsi.', truncated: true }));
  const rTrunc = await new DocumentStudioOrchestrator(tTrunc).handle({ intent: 'CREATE_DOCUMENT', instruction: 'buat dokumen' });
  check('CREATE sukses + truncated=true diteruskan', rTrunc.success === true && rTrunc.truncated === true);
  const tFull = new MockTransport((req) => ({ success: true, mode: req.mode, reply: 'Isi penuh.' }));
  const rFull = await new DocumentStudioOrchestrator(tFull).handle({ intent: 'CREATE_DOCUMENT', instruction: 'buat dokumen' });
  check('tanpa pemotongan → truncated tidak true', rFull.success === true && rFull.truncated !== true);
  const tRev = new MockTransport((req) => ({ success: true, mode: req.mode, reply: req.documentText }));
  await new DocumentStudioOrchestrator(tRev).handle({
    intent: 'REVISE_DOCUMENT', documentText: '# Judul\n\n| A | B |\n|---|---|\n| 1 | 2 |', instruction: 'perbaiki',
  });
  check('prompt REVISE memerintahkan mempertahankan struktur markdown',
    (tRev.calls[0]?.prompt ?? '').includes('markdown terstruktur'));

  console.log('\n[9] kopHtml — src di-escape seperti field lain:');
  const evilUrl = 'data:image/png;base64,AA" onerror="alert(1)';
  const kopEvil = kopHtml(emptyProfile({ name: 'PT Uji', logoDataUrl: evilUrl }));
  check('logoDataUrl tidak dapat memecah atribut src', !kopEvil.includes('AA" onerror') && kopEvil.includes('&quot;'), kopEvil);
  const kopFullEvil = kopHtml(emptyProfile({ kopMode: 'full', fullKopDataUrl: evilUrl }));
  check('fullKopDataUrl tidak dapat memecah atribut src', !kopFullEvil.includes('AA" onerror') && kopFullEvil.includes('&quot;'), kopFullEvil);
  const kopOk = kopHtml(emptyProfile({ name: 'PT Uji', logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }));
  check('data URL sah tetap utuh di src', kopOk.includes('src="data:image/png;base64,iVBORw0KGgo="'), kopOk);

  console.log('\n[10] wiring sumber komponen:');
  const creatorSrc = read('../ai-tools/document-ai/components/DocCreator.tsx');
  check('DocCreator: generate memakai markdownToHtml', creatorSrc.includes('markdownToHtml(reply)'));
  check('DocCreator: kandidat revisi memakai markdownToHtml', creatorSrc.includes('markdownToHtml(candidateMarkdown)'));
  check('DocCreator: enhance memakai markdownToHtml', creatorSrc.includes('markdownToHtml(candidateText)'));
  check('DocCreator: jalur AI tidak lagi plainToHtml(...)', !creatorSrc.includes('= plainToHtml('));
  check('DocCreator: flag truncated ditampilkan', creatorSrc.includes('setGenTruncated(res.truncated') && creatorSrc.includes('genTruncated &&'));
  check('DocCreator: petunjuk kop kosong di luar lembar', creatorSrc.includes('docai-kophint') && creatorSrc.includes('belum memiliki kop surat'));
  const reviewSrc = read('../ai-tools/document-ai/components/DocStudioReview.tsx');
  check('DocStudioReview: revisi mengirim markdown-lite', reviewSrc.includes('htmlToMarkdownLite(html)') && reviewSrc.includes('documentText: currentMarkdown()'));
  check('DocStudioReview: review tetap teks polos', reviewSrc.includes('documentText: currentPlain()'));
  const anaSrc = read('../ai-tools/document-ai/components/DocAnalyzer.tsx');
  check('DocAnalyzer: QA meneruskan history', anaSrc.includes('history: chat.map'));
  check('DocAnalyzer: COMPARE anggaran per dokumen', anaSrc.includes('halfBudget') && anaSrc.includes('slice(0, halfBudget)'));
  check('DocAnalyzer: peringatan menyebut dokumen terpotong', anaSrc.includes('Yang dipotong:'));
  check('DocAnalyzer: hasil dirender terformat', anaSrc.includes('markdownToHtml(result)') && anaSrc.includes('markdownToHtml(m.text)'));
  check('DocAnalyzer: truncated dari respons service', anaSrc.includes('res.truncated'));

  console.log(`\n=== HASIL: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    console.log('Gagal: ' + failures.join(' | '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
