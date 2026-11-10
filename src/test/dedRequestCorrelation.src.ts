/**
 * SPRINT 5 Workstream B (X3) + C (F-E2) — Korelasi request DED &
 * kontrak kompleksitas.
 *
 * Run: npx esbuild src/test/dedRequestCorrelation.src.ts --bundle
 *      --platform=node --format=cjs
 *      --outfile=~/workspace/.ded-sprint5-bundles/dedRequestCorrelation.cjs
 *      && node ~/workspace/.ded-sprint5-bundles/dedRequestCorrelation.cjs
 * (jalankan node dari root repo — tes membaca api/_lib/featureBillingMatrix.js)
 *
 * Yang diuji:
 * - B1: executeDedPassAttempt menangkap requestId & usage attempt FINAL;
 *   requestId '' (jalur Node) → null; provider error → requestId null.
 * - B2: retry MALFORMED mempertahankan korelasi attempt FINAL (bukan
 *   attempt pertama yang dibuang).
 * - B3: record usage per panggilan membawa requestId-nya sendiri;
 *   dua berkas/pass tidak berbagi ID; pass tak terkirim → requestId null.
 * - B4: token per panggilan terisi HANYA dari bukti usage nyata; total
 *   workflow hanya bila semua panggilan terkirim lengkap (tanpa total
 *   parsial); Full AI: requestId + token diteruskan, alasan konsisten.
 * - B5: normalizer klien (X2) — Node providerId/modelId menang atas
 *   target yang diminta; usage malformed tak menjadi angka.
 * - C1: kontrak kompleksitas SAAT INI terpin: FAST → ded-ai/simple;
 *   DETAIL tanpa kompleksitas eksplisit → ded-ai/medium (diskrepansi
 *   F-E2 terdokumentasi — pilihan kompleksitas view hanya tarif
 *   SIMULASI dan TIDAK mencapai service); fungsi murni dengan
 *   kompleksitas eksplisit menghasilkan key yang sah di matriks.
 * - C2: semua key yang bisa dihasilkan builder ada di matriks kanonis
 *   (dibaca dari berkas api/_lib/featureBillingMatrix.js, read-only).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  buildDedUsageFromStandard, buildDedUsageFromFullAi, dedStandardFeatureKey,
} from '../ai-tools/ded-ai-estimate/usageMetadata';
import { executeDedPassAttempt } from '../ai-tools/ded-ai-estimate/service';
import { normalizeAiUsage } from '../ai-tools/providerClient';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'api/_lib/featureBillingMatrix.js'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('featureBillingMatrix.js tidak ditemukan dari cwd — jalankan dari root repo');
}

const validStructured = { workItems: [{ name: 'Pekerjaan Uji', quantity: 1, unit: 'unit' }] };

function okResult(over: Record<string, unknown> = {}) {
  return {
    success: true as const, content: '{}', structured: validStructured,
    requestId: 'req-AAA', provider: 'gemini', model: 'gemini-x',
    usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140, cachedTokens: 10, reasoningTokens: null, source: 'gemini_usageMetadata' },
    usageStatus: 'measured' as const, ...over,
  };
}

async function main(): Promise<void> {
  console.log('== B1: executeDedPassAttempt menangkap requestId & usage attempt final ==');
  const exec = await executeDedPassAttempt(async () => okResult() as never);
  check('B1a requestId diteruskan', exec.kind === 'OUTCOME' && exec.requestId === 'req-AAA');
  check('B1b usage diteruskan', exec.kind === 'OUTCOME' && exec.usage?.inputTokens === 100 && exec.usage?.cachedTokens === 10);
  const execEmptyId = await executeDedPassAttempt(async () => okResult({ requestId: '' }) as never);
  check("B1c requestId '' (jalur Node) dinormalkan null", execEmptyId.kind === 'OUTCOME' && execEmptyId.requestId === null);
  const execErr = await executeDedPassAttempt(async () => ({ success: false, errorCode: 'MODEL_ERROR', stage: 'x', message: 'gagal', retryable: false }) as never);
  check('B1d provider error → requestId & usage null jujur', execErr.kind === 'PROVIDER_ERROR' && execErr.requestId === null && execErr.usage === null);

  console.log('== B2: retry MALFORMED — korelasi attempt FINAL yang dipertahankan ==');
  let n = 0;
  const execRetry = await executeDedPassAttempt(async () => {
    n++;
    if (n === 1) {
      return okResult({ requestId: 'req-FIRST-DIBUANG', structured: null, content: 'bukan json sama sekali' }) as never;
    }
    return okResult({ requestId: 'req-FINAL' }) as never;
  });
  check('B2a retry terjadi tepat 1x', execRetry.kind === 'OUTCOME' && execRetry.retries === 1);
  check('B2b requestId = attempt final, bukan attempt yang dibuang',
    execRetry.kind === 'OUTCOME' && execRetry.requestId === 'req-FINAL');

  console.log('== B3/B4: builder usage standar — requestId & token per panggilan ==');
  const mkPass = (over: Record<string, unknown>) => ({
    passIndex: 0, clusterLabel: 'Pass', pageTypes: ['DENAH'], pages: [1], productId: 'DED_AI_DETAIL',
    mode: 'DETAIL' as const, maxTokens: 24000, status: 'OK' as const, retryCount: 0, itemCount: 1,
    provider: 'gemini', model: 'gemini-x', sourceFile: 'berkas-a.pdf', ...over,
  });
  const outA = {
    jobId: 'job-A', mode: 'DETAIL' as const, policy: 'FULL_AI' as const, partial: false,
    completionReport: { filledMarketReference: 0, filledAiEstimate: 0 },
    analysisTrace: { passes: [
      mkPass({ passIndex: 0, requestId: 'req-A1', usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140, cachedTokens: 10, reasoningTokens: null, source: 'gemini_usageMetadata' } }),
      mkPass({ passIndex: 1, requestId: 'req-A2', sourceFile: 'berkas-b.pdf', usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70, cachedTokens: null, reasoningTokens: null, source: 'gemini_usageMetadata' } }),
      mkPass({ passIndex: 2, status: 'SKIPPED_BUDGET' as const, requestId: 'req-TIDAK-TERKIRIM' }),
    ] },
  };
  const uA = buildDedUsageFromStandard(outA as never, { fileName: 'berkas-a.pdf' });
  check('B3a setiap panggilan membawa requestId-nya sendiri',
    uA.calls?.[0]?.requestId === 'req-A1' && uA.calls?.[1]?.requestId === 'req-A2');
  check('B3b dua berkas tidak berbagi ID korelasi', uA.calls?.[0]?.requestId !== uA.calls?.[1]?.requestId);
  check('B3c pass tak terkirim → requestId null (bukan ID jejak)', uA.calls?.[2]?.requestId === null);
  check('B4a token per panggilan dari bukti nyata', uA.calls?.[0]?.inputTokens === 100 && uA.calls?.[1]?.outputTokens === 20);
  check('B4b field absen di dalam bukti tetap null (cached pass-2)', uA.calls?.[1]?.cachedTokens === null && uA.calls?.[1]?.missingEvidenceReason === null);
  check('B4c total workflow lengkap = jumlah panggilan terkirim',
    uA.inputTokens === 150 && uA.outputTokens === 60 && uA.missingEvidenceReason === null,
    `in=${uA.inputTokens} out=${uA.outputTokens} reason=${uA.missingEvidenceReason}`);

  const outPartial = {
    ...outA,
    analysisTrace: { passes: [
      mkPass({ passIndex: 0, requestId: 'req-P1', usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140, cachedTokens: 10, reasoningTokens: null, source: 'gemini_usageMetadata' } }),
      mkPass({ passIndex: 1, requestId: 'req-P2', usage: null }),
    ] },
  };
  const uP = buildDedUsageFromStandard(outPartial as never, {});
  check('B4d satu panggilan tanpa bukti → total workflow null (tanpa total parsial)',
    uP.inputTokens === null && uP.outputTokens === null && uP.missingEvidenceReason === 'GATEWAY_DOES_NOT_REPORT_TOKENS');
  check('B4e panggilan berbukti tetap menyimpan angkanya sendiri', uP.calls?.[0]?.inputTokens === 100 && uP.calls?.[0]?.missingEvidenceReason === null);
  check('B4f panggilan tanpa bukti: token null + requestId tetap tercatat',
    uP.calls?.[1]?.inputTokens === null && uP.calls?.[1]?.requestId === 'req-P2');

  console.log('== B4g: Full AI — requestId & token diteruskan ==');
  const uF = buildDedUsageFromFullAi(
    { provenance: { provider: 'gemini', model: 'gemini-x' }, items: [], fileName: 'f.pdf', productId: 'DED_AI_DETAIL', requestId: 'req-FA1', inputTokens: 900, outputTokens: 200, cachedTokens: 30 },
    { workflowId: 'wf-fa', policy: 'FULL_AI' },
  );
  check('B4g1 Full AI requestId tercatat', uF.calls?.[0]?.requestId === 'req-FA1');
  check('B4g2 Full AI token tercatat + alasan null', uF.inputTokens === 900 && uF.outputTokens === 200 && uF.calls?.[0]?.missingEvidenceReason === null && uF.missingEvidenceReason === null);
  const uFNone = buildDedUsageFromFullAi(
    { provenance: { provider: null, model: null }, items: [], fileName: 'f.pdf', productId: 'DED_AI_FAST' },
    { workflowId: 'wf-fa2', policy: 'FULL_AI' },
  );
  check('B4g3 Full AI tanpa bukti: requestId null, token null, alasan terisi',
    uFNone.calls?.[0]?.requestId === null && uFNone.inputTokens === null && uFNone.missingEvidenceReason === 'GATEWAY_DOES_NOT_REPORT_TOKENS');

  console.log('== B5: normalizer klien X2 ==');
  const malformed = normalizeAiUsage({ inputTokens: 'banyak' });
  check('B5a usage malformed → null + malformed', malformed.usage === null && malformed.usageStatus === 'malformed');
  const missing = normalizeAiUsage(null);
  check('B5b usage absen → null + missing (bukan nol)', missing.usage === null && missing.usageStatus === 'missing');
  const zero = normalizeAiUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: null, reasoningTokens: null, source: 'oai_usage' });
  check('B5c nol terukur → measured_zero, cached tetap null', zero.usageStatus === 'measured_zero' && zero.usage?.cachedTokens === null);
  const kept = normalizeAiUsage({ inputTokens: 7, outputTokens: 3, totalTokens: 10, cachedTokens: 2, reasoningTokens: 1, source: 'oai_usage' });
  check('B5d cached & reasoning tetap terbedakan', kept.usage?.cachedTokens === 2 && kept.usage?.reasoningTokens === 1 && kept.usageStatus === 'measured');

  console.log('== C1: kontrak kompleksitas SAAT INI (F-E2 terpin, diskrepansi terdokumentasi) ==');
  check('C1a FAST selalu ded-ai/simple', dedStandardFeatureKey('FAST') === 'ded-ai/simple');
  check('C1b DETAIL tanpa kompleksitas eksplisit → ded-ai/medium (perilaku saat ini; pilihan view TIDAK sampai ke service)',
    dedStandardFeatureKey('DETAIL') === 'ded-ai/medium');
  check('C1c fungsi murni: kompleksitas eksplisit menghasilkan key berbeda',
    dedStandardFeatureKey('DETAIL', 'simple') === 'ded-ai/simple'
    && dedStandardFeatureKey('DETAIL', 'complex') === 'ded-ai/complex'
    && dedStandardFeatureKey('DETAIL', 'medium') === 'ded-ai/medium');

  console.log('== C2: key builder ⊆ matriks kanonis (read-only) ==');
  const matrixText = readFileSync(join(findRepoRoot(), 'api/_lib/featureBillingMatrix.js'), 'utf8');
  const matrixKeys = new Set([...matrixText.matchAll(/'(ded-ai\/[a-z-]+)':/g)].map((m) => m[1]));
  const emitted = [dedStandardFeatureKey('FAST'), dedStandardFeatureKey('DETAIL'),
    dedStandardFeatureKey('DETAIL', 'simple'), dedStandardFeatureKey('DETAIL', 'medium'),
    dedStandardFeatureKey('DETAIL', 'complex'), 'ded-ai/full-ai'];
  check('C2 semua key yang dihasilkan ada di matriks', emitted.every((k) => matrixKeys.has(k)),
    `matriks=${[...matrixKeys].join(',')}`);

  console.log(`\nHASIL: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('SUITE ERROR', e); process.exit(2); });
