/**
 * AI DOKUMEN — Pin perbaikan audit DocAI 2026-11-22 (D1, D3, D4, D5).
 *
 * D1: tombol AI funnel langkah 3 kini memanggil AI SUNGGUHAN (ENHANCE_TEXT)
 *     dengan fallback deterministik — sebelumnya berlabel AI tetapi selalu
 *     deterministik. (Perilaku enhanceFunnelPrompt sendiri diuji
 *     docaiFunnel.test.ts §5, termasuk D1b: bingkai tidak memotong isi.)
 * D2: bahasa jawaban — diuji perilaku di docAiResponseLanguage.test.ts;
 *     pin wiring DocAnalyzer ada di sini (§2).
 * D3: cabang res.truncated mati di runTranslate dihapus.
 * D4: gerbang paket aiDocuments kini menutup SEMUA jalur AI (generate kedua
 *     mode, terjemahan, enhance, revisi) — sebelumnya mode form +
 *     terjemahan + enhance + revisi tanpa gerbang.
 * D5: generate/funnel/terjemahan/revisi/enhance kini memotong kredit
 *     simulasi — sebelumnya hanya analisis (DocAnalyzer) yang memotong.
 *
 * Pola pin sumber seperti docaiFunnel.test.ts §9 (baca file sebagai teks).
 * Jalankan: npx tsx src/test/docAiAuditFixes.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const count = (s: string, sub: string) => s.split(sub).length - 1;

const funnelSrc = read('../ai-tools/document-ai/components/DocFunnel.tsx');
const creatorSrc = read('../ai-tools/document-ai/components/DocCreator.tsx');
const analyzerSrc = read('../ai-tools/document-ai/components/DocAnalyzer.tsx');
const enhanceSrc = read('../ai-tools/document-ai/components/DocEnhance.tsx');
const reviewSrc = read('../ai-tools/document-ai/components/DocStudioReview.tsx');
const serviceSrc = read('../ai-tools/document-ai/service.ts');

console.log('\n[1] D1 — Tombol AI funnel memakai AI sungguhan (fallback deterministik):');
check('DocFunnel: prop onEnhancePrompt ada', funnelSrc.includes('onEnhancePrompt?: (prompt: string, docLabel: string) => Promise<FunnelEnhancePromptResult>'));
check('DocFunnel: handleEnhance memanggil onEnhancePrompt', funnelSrc.includes('await onEnhancePrompt(prompt.trim(), choice.label)'));
check('DocFunnel: fallback deterministik tetap ada', funnelSrc.includes('enhanceFunnelPrompt(prompt, choice.label)'));
check('DocFunnel: tombol AI nonaktif + spinner saat enhance berjalan', funnelSrc.includes('disabled={enhanceBusy}') && funnelSrc.includes('enhanceBusy ? <Loader2'));
check('DocFunnel: catatan fallback dirender saat AI gagal', funnelSrc.includes('enhanceNote') && funnelSrc.includes('prompt dibingkai otomatis'));
check('DocFunnel: tooltip klaim AI hanya bila jalur AI tersedia', funnelSrc.includes("onEnhancePrompt && docAiAllowed") && funnelSrc.includes("'Sempurnakan prompt ini dengan AI'"));
check('DocCreator: handler enhanceFunnelPromptAi lewat ENHANCE_TEXT', creatorSrc.includes('const enhanceFunnelPromptAi') && creatorSrc.includes("intent: 'ENHANCE_TEXT'") && creatorSrc.includes("transform: 'bebas'"));
check('DocCreator: handler memakai instruksi anti-karang + batas 600', creatorSrc.includes('jangan menambah fakta baru') && creatorSrc.includes('maksimal 600 karakter'));
check('DocCreator: onEnhancePrompt diteruskan ke DocFunnel', creatorSrc.includes('onEnhancePrompt={enhanceFunnelPromptAi}'));
check('DocCreator: handler enhance menghormati gerbang paket', creatorSrc.includes("if (!docAiAllowed) return { ok: false, error: docAiLockedMsg };"));

console.log('\n[2] D2 — Wiring bahasa jawaban (perilaku di docAiResponseLanguage.test.ts):');
check('DocAnalyzer: language diteruskan ke service (3 jalur)', count(analyzerSrc, 'language: lang') === 3);
check('Service: instruksi bahasa hanya mode analisis', serviceSrc.includes('LANGUAGE_FOLLOWING_MODES') && serviceSrc.includes("responseLanguageInstruction(request.language)"));
check("Service: DRAFT TIDAK termasuk mode pengikut bahasa", (() => {
  const setBlock = serviceSrc.slice(serviceSrc.indexOf('LANGUAGE_FOLLOWING_MODES'), serviceSrc.indexOf(']);', serviceSrc.indexOf('LANGUAGE_FOLLOWING_MODES')));
  return !setBlock.includes("'DRAFT'");
})());
check('Service: compareDocuments menerima opts.language', serviceSrc.includes("language?: DokumenAiChatRequest['language']"));

console.log('\n[3] D3 — Cabang truncated mati di runTranslate dihapus:');
check('DocCreator: pesan "sebagian isi sumber dipotong" SUDAH hilang', !creatorSrc.includes('Sebagian isi sumber dipotong karena batas karakter'));

console.log('\n[4] D4 — Gerbang paket menutup SEMUA jalur AI:');
check('DocCreator: gerbang generate tanpa syarat mode', creatorSrc.includes("if (!docAiAllowed) { setError(docAiLockedMsg); return; }") && !creatorSrc.includes("if (!docAiAllowed && createMode === 'ai')"));
check('DocCreator: gerbang generate + terjemahan (2 situs setError)', count(creatorSrc, "if (!docAiAllowed) { setError(docAiLockedMsg); return; }") === 2);
check('DocCreator: gerbang diteruskan ke panel Review + Enhance', (() => {
  // Mount DocFunnel juga meneruskan gerbang (sudah ada sebelumnya) —
  // periksa spesifik mount kedua panel editor.
  const reviewMount = creatorSrc.slice(creatorSrc.indexOf('<DocStudioReview'), creatorSrc.indexOf('/>', creatorSrc.indexOf('<DocStudioReview')));
  const enhanceMount = creatorSrc.slice(creatorSrc.indexOf('<DocEnhance'), creatorSrc.indexOf('/>', creatorSrc.indexOf('<DocEnhance')));
  return reviewMount.includes('docAiAllowed={docAiAllowed}') && reviewMount.includes('docAiLockedMsg={docAiLockedMsg}') &&
    enhanceMount.includes('docAiAllowed={docAiAllowed}') && enhanceMount.includes('docAiLockedMsg={docAiLockedMsg}');
})());
check('DocEnhance: prop gerbang + cek di runTransform', enhanceSrc.includes('docAiAllowed?: boolean') && enhanceSrc.includes('if (!docAiAllowed)') && enhanceSrc.includes("setError(docAiLockedMsg || 'Fitur AI Document terkunci untuk paket Anda.')"));
check('DocEnhance: tombol transformasi nonaktif bila terkunci', enhanceSrc.includes('|| !docAiAllowed') && enhanceSrc.includes("!docAiAllowed\n                ? docAiLockedMsg"));
check('DocStudioReview: prop gerbang + cek di requestRevision', reviewSrc.includes('docAiAllowed?: boolean') && reviewSrc.includes('if (!docAiAllowed)') && reviewSrc.includes("setReviewError(docAiLockedMsg || 'Fitur AI Document terkunci untuk paket Anda.')"));
check('DocStudioReview: tombol Perbaiki/Poles/Revisi nonaktif bila terkunci', count(reviewSrc, '|| !docAiAllowed') >= 3);
check('DocStudioReview: review DETERMINISTIK tidak digerbang', (() => {
  const runReview = reviewSrc.slice(reviewSrc.indexOf('const runReview'), reviewSrc.indexOf('/* ---------------- revisi AI'));
  return !runReview.includes('docAiAllowed');
})());
check('DocStudioReview: banding versi deterministik tidak digerbang', (() => {
  const runCompare = reviewSrc.slice(reviewSrc.indexOf('const runCompare'), reviewSrc.indexOf('/* ---------------- render satu temuan'));
  return !runCompare.includes('docAiAllowed');
})());

console.log('\n[5] D5 — Semua jalur AI memotong kredit simulasi:');
check('DocCreator: consume complex di generate + funnel + terjemahan (3x)', count(creatorSrc, "consume('ai-document', tariffFor('ai-document/complex').max") === 3);
check('DocEnhance: consume simple di runTransform (1x)', count(enhanceSrc, "consume('ai-document', tariffFor('ai-document/simple').max") === 1);
check('DocStudioReview: consume complex di requestRevision (1x)', count(reviewSrc, "consume('ai-document', tariffFor('ai-document/complex').max") === 1);
check('DocCreator: enhance prompt funnel TIDAK memotong kredit (masukan generate)', (() => {
  const handler = creatorSrc.slice(creatorSrc.indexOf('const enhanceFunnelPromptAi'), creatorSrc.indexOf('/* ---------------- generate via funnel'));
  return !handler.includes('consume(');
})());

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
console.log('SEMUA TEST DOCAI AUDIT FIXES LOLOS');
