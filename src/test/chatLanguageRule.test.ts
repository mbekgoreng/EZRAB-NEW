/**
 * Test aturan bahasa jawaban Chat AI (keputusan owner 2026-11-06):
 * AI menjawab dalam bahasa pesan terakhir pengguna. Menjaga agar
 * paksaan lama "Jawab dalam Bahasa Indonesia" tidak kembali ke jalur
 * chat mana pun (prompt sistem EZRAB AI, service EZRAB AI, co-assistant).
 * Via tsx.
 */
import { readFileSync } from 'node:fs';
import { EZRAB_AI_SYSTEM_PROMPT, RESPONSE_LANGUAGE_RULE } from '../ai-tools/ezrab-ai/prompt';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}`); }
}

console.log('== Aturan bahasa cermin ==');
check('aturan menyebut bahasa yang sama dengan pesan terakhir pengguna',
  RESPONSE_LANGUAGE_RULE.includes('bahasa yang sama dengan pesan terakhir pengguna'));
check('aturan menyebut Inggris dibalas Inggris',
  RESPONSE_LANGUAGE_RULE.includes('Bahasa Inggris'));
check('aturan mengikuti pergantian bahasa di tengah percakapan',
  RESPONSE_LANGUAGE_RULE.includes('berganti bahasa'));
check('system prompt EZRAB AI memuat aturan bahasa', EZRAB_AI_SYSTEM_PROMPT.includes(RESPONSE_LANGUAGE_RULE));

console.log('== Tidak ada paksaan Bahasa Indonesia di jalur chat ==');
const chatFiles: Array<[string, string]> = [
  ['prompt EZRAB AI', 'src/ai-tools/ezrab-ai/prompt.ts'],
  ['service EZRAB AI', 'src/ai-tools/ezrab-ai/service.ts'],
  ['co-assistant', 'src/services/coAssistantService.ts'],
];
for (const [label, path] of chatFiles) {
  const src = readFileSync(path, 'utf8');
  check(`${label}: tanpa "Jawab dalam Bahasa Indonesia"`, !src.includes('Jawab dalam Bahasa Indonesia'));
  check(`${label}: tanpa "menjawab dalam Bahasa Indonesia"`, !src.includes('menjawab dalam Bahasa Indonesia'));
}
const coSrc = readFileSync('src/services/coAssistantService.ts', 'utf8');
check('co-assistant memakai RESPONSE_LANGUAGE_RULE bersama', coSrc.includes('RESPONSE_LANGUAGE_RULE'));
const svcSrc = readFileSync('src/ai-tools/ezrab-ai/service.ts', 'utf8');
const canonSrc = readFileSync('src/ai-tools/ezrab-ai/canonicalContext.ts', 'utf8');
// Service EZRAB AI memakai aturan bahasa BERSAMA secara TRANSITIF —
// bukan dengan menyebut identifier-nya di service.ts, melainkan lewat
// dua jalur yang keduanya menyematkan konstanta bersama itu:
//  (1) system prompt = EZRAB_AI_SYSTEM_PROMPT, yang menyematkan
//      ${RESPONSE_LANGUAGE_RULE} (prompt.ts — sudah dipin cek ke-4 di
//      atas, 'system prompt EZRAB AI memuat aturan bahasa');
//  (2) prompt pengguna dirakit assembleChatPrompt, yang mengakhiri
//      rakitan dengan ${RESPONSE_LANGUAGE_RULE} (canonicalContext.ts).
// Cek substring tunggal 'service.ts memuat RESPONSE_LANGUAGE_RULE'
// adalah proxy yang tidak lengkap untuk properti ini: service
// mendelegasikan perakitan prompt ke assembler bersama, sehingga
// identifier itu memang tidak muncul di service.ts — padahal perilaku
// (aturan bahasa terkirim di kedua prompt) terpenuhi. Pin di bawah
// memin RANTAI pemakaiannya (2 cek konjungsi, 5 syarat) — lebih kuat
// daripada 1 substring, karena memverifikasi wiring-nya, bukan hanya
// kemunculan teks.
check('service EZRAB AI memakai RESPONSE_LANGUAGE_RULE bersama (system prompt)',
  svcSrc.includes('EZRAB_AI_SYSTEM_PROMPT') && svcSrc.includes('systemPrompt: EZRAB_AI_SYSTEM_PROMPT'));
check('service EZRAB AI memakai RESPONSE_LANGUAGE_RULE bersama (prompt rakitan)',
  svcSrc.includes('assembleChatPrompt(')
  && canonSrc.includes('export function assembleChatPrompt')
  && canonSrc.includes('${RESPONSE_LANGUAGE_RULE}'));

console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
