/**
 * W1 (PHASE 2 — Prompt Integrity, 2026-11-19) — pemisahan dua budget prompt.
 *
 * Dua angka 16.000 / 20.000 di repo ini BUKAN satu budget yang sama:
 *
 *  1. Batas GATEWAY systemPrompt = 20.000 karakter
 *     (api/_lib/security.js: MAX_SYSTEM_PROMPT_CHARS; ditegakkan
 *     validateAiInput → 400 PAYLOAD_TOO_LARGE). Dinaikkan 16.000 →
 *     20.000 pada re-baseline prompt v2.3.0 (OA11, commit 77924d5)
 *     karena prompt kanonis v2.3.0 = 17.003 karakter.
 *
 *  2. Budget INTERNAL context-builder = 16.000 karakter
 *     (CANONICAL_TOTAL_PROMPT_BUDGET, canonicalContext.ts) untuk
 *     SELURUH field `prompt` rakitan (blok data + seksi alat + aturan
 *     bahasa). Budget ini SENGAJA dipertahankan 16.000 — kenaikan
 *     batas gateway TIDAK menaikkannya, dan sebaliknya.
 *
 * Suite ini mengunci pemisahan itu secara perilaku (bukan sekadar
 * komentar): systemPrompt 16.001 karakter LOLOS validasi gateway
 * (bukti batas gateway > budget konteks), sementara builder tetap
 * mengunci prompt rakitan ≤ 16.000. Edit masa depan yang mencampur
 * keduanya — menaikkan budget konteks mengikuti gateway, atau
 * menurunkan kembali batas gateway — gagal di sini.
 *
 * Konteks: re-baseline OA11 mengoreksi gatewayPromptIntegrity tetapi
 * melewatkan src/test/phase2GatewaySecurity.mjs:125, yang masih
 * menegaskan batas lama 16.000 dan kini GAGAL. File itu bukan milik
 * W1 (dilaporkan terpisah); suite ini adalah penjaga kontrak barunya.
 *
 * Jalankan: npx --yes tsx src/test/w1PromptBudgetSeparation.test.ts
 * (skrip asersi tsx polos, BUKAN vitest — pola gatewayPromptIntegrity).
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

import {
  EZRAB_AI_SYSTEM_PROMPT,
} from '../ai-tools/ezrab-ai/prompt';
import {
  CANONICAL_TOTAL_PROMPT_BUDGET,
  buildCanonicalContext,
} from '../ai-tools/ezrab-ai/canonicalContext';

const security = await import('../../api/_lib/security.js');
const { validateAiInput } = security as {
  validateAiInput: (body: Record<string, unknown>) => {
    errors: string[];
    errorCode: string | null;
    input: { systemPrompt: string; message: string };
  };
};

const canonical = EZRAB_AI_SYSTEM_PROMPT;

/* ------------------------------------------------------------------ */
/* A. Dua budget: nilai masing-masing + pemisahan perilaku             */
/* ------------------------------------------------------------------ */
console.log('\n[A] dua budget prompt — nilai & pemisahan');
check('budget INTERNAL konteks = 16.000 (dipertahankan, tidak ikut naik)',
  CANONICAL_TOTAL_PROMPT_BUDGET === 16_000, String(CANONICAL_TOTAL_PROMPT_BUDGET));
{
  const atLimit = validateAiInput({ prompt: 'halo', systemPrompt: 'y'.repeat(20000) });
  check('gateway: systemPrompt tepat 20.000 lolos (batas gateway = 20.000)',
    atLimit.errors.length === 0 && atLimit.input.systemPrompt.length === 20000,
    `errors=${atLimit.errors.length}`);
  const over = validateAiInput({ prompt: 'halo', systemPrompt: 'y'.repeat(20001) });
  check('gateway: systemPrompt 20.001 DITOLAK PAYLOAD_TOO_LARGE',
    over.errors.length > 0 && over.errorCode === 'PAYLOAD_TOO_LARGE' && over.input.systemPrompt === '',
    `errors=${over.errors.length} code=${over.errorCode}`);
  const between = validateAiInput({ prompt: 'halo', systemPrompt: 'y'.repeat(16001) });
  check('PEMISAHAN: systemPrompt 16.001 LOLOS gateway (batas gateway > budget konteks 16.000)',
    between.errors.length === 0 && between.input.systemPrompt.length === 16001,
    `errors=${between.errors.length} code=${between.errorCode}`);
}

/* ------------------------------------------------------------------ */
/* B. Prompt kanonis duduk DI ANTARA kedua budget                      */
/* ------------------------------------------------------------------ */
console.log('\n[B] prompt kanonis v2.3.0 di antara kedua budget');
check('kanonis 17.003 > budget konteks 16.000 — WAJAR (field systemPrompt, bukan field prompt)',
  canonical.length > CANONICAL_TOTAL_PROMPT_BUDGET, String(canonical.length));
check('kanonis 17.003 < batas gateway 20.000',
  canonical.length < 20000, String(canonical.length));
{
  const r = validateAiInput({ prompt: 'halo', systemPrompt: canonical });
  check('kanonis: lolos validasi gateway UTUH byte-for-byte',
    r.errors.length === 0 && r.input.systemPrompt === canonical,
    `errors=${r.errors.length} code=${r.errorCode}`);
}

/* ------------------------------------------------------------------ */
/* C. Builder tetap mengunci prompt rakitan pada budget internal       */
/* ------------------------------------------------------------------ */
console.log('\n[C] builder kanonis — prompt rakitan ≤ 16.000');
{
  const built = buildCanonicalContext({
    userId: null,
    projectId: null,
    conversationId: null,
    messages: [
      { role: 'user', content: 'Berapa total RAB proyek rumah 2 lantai saya?' },
      { role: 'assistant', content: 'Total RAB proyek Anda Rp 850.000.000 berdasarkan 12 item.' },
      { role: 'user', content: 'Rincikan 3 item termahal.' },
    ],
    reservedChars: 1000,
  });
  check('builder: budget.total yang dilaporkan = 16.000',
    built.report.budget.total === 16_000, String(built.report.budget.total));
  check('builder: prompt rakitan (promptChars) ≤ 16.000',
    built.report.promptChars <= CANONICAL_TOTAL_PROMPT_BUDGET,
    `promptChars=${built.report.promptChars}`);
  check('builder: tidak ada pelampauan cap yang tercatat',
    !built.report.truncations.some((t) => t.startsWith('cap prompt 16000 terlampaui')),
    built.report.truncations.join(' | '));
}

console.log(`\n${failed === 0 ? 'SEMUA TES PEMISAHAN BUDGET LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);
