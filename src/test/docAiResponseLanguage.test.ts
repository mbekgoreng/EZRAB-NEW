/**
 * AI DOKUMEN — Bahasa jawaban AI mengikuti bahasa antarmuka (audit DocAI 2026-11-22, D2).
 *
 * Cacat: pengaturan "Bahasa Dokumen & Hasil" di DocLibrary menjanjikan
 * "ringkasan dan jawaban AI memakai bahasa yang sama" dengan bahasa
 * antarmuka (id/en/zh/ms), tetapi bahasa TIDAK PERNAH dikirim ke AI —
 * system prompt selalu berbahasa Indonesia. Perbaikan: request.language
 * diteruskan DocAnalyzer → service → instruksi bahasa pada system prompt
 * untuk mode ANALISIS saja (DRAFT tetap Indonesia — dokumen resmi).
 *
 * Transport AI di-mock: tidak ada panggilan jaringan. Setiap chat() dikenai
 * minimum delay complex (4 dtk) — total suite ±25 dtk.
 * Jalankan: npx tsx src/test/docAiResponseLanguage.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

import { DokumenAiService } from '../ai-tools/document-ai/service';
import { responseLanguageInstruction } from '../ai-tools/document-ai/prompt';
import type { AiToolsRequest } from '../ai-tools/providerClient';

type CapturedCall = { productId: string; systemPrompt?: string; prompt: string };

async function main() {
  console.log('\n[1] Helper responseLanguageInstruction (prompt.ts):');
  check("en → menyebut 'Bahasa Inggris'", responseLanguageInstruction('en').includes('Bahasa Inggris'));
  check("zh → menyebut 'Mandarin'", responseLanguageInstruction('zh').includes('Mandarin'));
  check("ms → menyebut 'Melayu'", responseLanguageInstruction('ms').includes('Melayu'));
  check("id → string kosong (perilaku lama)", responseLanguageInstruction('id') === '');
  check('undefined → string kosong', responseLanguageInstruction(undefined) === '');

  console.log('\n[2] Service meneruskan bahasa ke system prompt (klien AI mock):');
  const calls: CapturedCall[] = [];
  const mockClient = {
    execute: async (req: AiToolsRequest) => {
      calls.push({ productId: req.productId, systemPrompt: req.systemPrompt, prompt: req.prompt });
      return { success: true as const, content: 'Hasil mock dari AI.', structured: null, requestId: 'test-1' };
    },
  };
  const service = new DokumenAiService(mockClient as never);
  const docText = '[Halaman 1]\nPekerjaan pengecoran balok lantai dua menggunakan beton K-300. Volume pengecoran 12 meter kubik.';

  // SUMMARY + en: map + reduce, KEDUANYA membawa instruksi Inggris.
  calls.length = 0;
  const sumEn = await service.chat({ documentText: docText, fileName: 'Dokumen Uji.pdf', mode: 'SUMMARY', language: 'en' });
  check('SUMMARY+en sukses', sumEn.success === true);
  check('SUMMARY+en memanggil AI', calls.length >= 1, `calls=${calls.length}`);
  check(
    'SUMMARY+en: SEMUA panggilan membawa instruksi Bahasa Inggris',
    calls.length >= 1 && calls.every((c) => (c.systemPrompt || '').includes('Bahasa Inggris')),
  );
  check(
    'SUMMARY+en: productId tetap DOKUMEN_AI',
    calls.every((c) => c.productId === 'DOKUMEN_AI'),
  );

  // SUMMARY + id: tanpa instruksi bahasa (perilaku lama).
  calls.length = 0;
  await service.chat({ documentText: docText, fileName: 'Dokumen Uji.pdf', mode: 'SUMMARY', language: 'id' });
  check(
    'SUMMARY+id: TANPA instruksi bahasa',
    calls.length >= 1 && calls.every((c) => !(c.systemPrompt || '').includes('BAHASA JAWABAN')),
  );

  // SUMMARY tanpa language: tanpa instruksi bahasa.
  calls.length = 0;
  await service.chat({ documentText: docText, fileName: 'Dokumen Uji.pdf', mode: 'SUMMARY' });
  check(
    'SUMMARY tanpa language: TANPA instruksi bahasa',
    calls.length >= 1 && calls.every((c) => !(c.systemPrompt || '').includes('BAHASA JAWABAN')),
  );

  // DRAFT + en: TIDAK membawa instruksi (dokumen resmi tetap Indonesia).
  calls.length = 0;
  const draftEn = await service.chat({
    documentText: docText,
    fileName: 'Dokumen Uji.pdf',
    mode: 'DRAFT',
    draftMode: 'create',
    prompt: 'Buatkan draf surat pemberitahuan.',
    language: 'en',
  });
  check('DRAFT+en sukses', draftEn.success === true);
  check(
    'DRAFT+en: TANPA instruksi bahasa (dokumen resmi tetap Indonesia)',
    calls.length >= 1 && calls.every((c) => !(c.systemPrompt || '').includes('BAHASA JAWABAN')),
  );

  // QA + zh: satu panggilan retrieval membawa instruksi Mandarin.
  calls.length = 0;
  const qaZh = await service.chat({
    documentText: docText,
    fileName: 'Dokumen Uji.pdf',
    mode: 'QA',
    prompt: 'Beton apa yang dipakai untuk pengecoran balok?',
    language: 'zh',
  });
  check('QA+zh sukses', qaZh.success === true);
  check(
    'QA+zh: panggilan membawa instruksi Mandarin',
    calls.length === 1 && (calls[0].systemPrompt || '').includes('Mandarin'),
    `calls=${calls.length}`,
  );

  // compareDocuments + ms: map kedua dokumen + reduce membawa instruksi Melayu.
  calls.length = 0;
  const cmpMs = await service.compareDocuments(
    { fileName: 'A.pdf', text: docText },
    { fileName: 'B.pdf', text: '[Halaman 1]\nPekerjaan pengecoran kolom lantai tiga menggunakan beton K-350.' },
    { language: 'ms' },
  );
  check('COMPARE+ms sukses', cmpMs.success === true);
  check(
    'COMPARE+ms: SEMUA panggilan membawa instruksi Melayu',
    calls.length >= 1 && calls.every((c) => (c.systemPrompt || '').includes('Melayu')),
    `calls=${calls.length}`,
  );

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
  console.log('SEMUA TEST DOCAI RESPONSE LANGUAGE LOLOS');
}

main().catch((e) => { console.error(e); process.exit(1); });
