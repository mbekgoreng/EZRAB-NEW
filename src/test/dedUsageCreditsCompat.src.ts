/**
 * SPRINT 4 (Tugas E) — Kompatibilitas metadata usage DED dengan desain
 * lifecycle Unified Credits (createOperation → reserve → execute →
 * recordEvidence → settle | release; kontrak Sprint 3 di
 * api/_lib/aiMetering.js + api/_lib/dedBillingAdapter.js).
 *
 * Run: npx esbuild src/test/dedUsageCreditsCompat.src.ts --bundle
 *      --platform=node --format=cjs
 *      --outfile=~/workspace/.ded-sprint4-bundles/dedUsageCreditsCompat.cjs
 *      && node ~/workspace/.ded-sprint4-bundles/dedUsageCreditsCompat.cjs
 * (jalankan node dari root repo — tes membaca api/_lib/featureBillingMatrix.js)
 *
 * Yang diuji:
 * - E1: workflow standar & Full AI memuat SEMUA field bukti baru dengan
 *   null PERSIS untuk token/biaya (tidak ada estimasi token dari
 *   karakter, tidak ada konversi jumlah panggilan → token).
 * - E2: missingEvidenceReason terisi PERSIS saat token null (workflow &
 *   per panggilan); panggilan tak terkirim beralasan CALL_NOT_SENT.
 * - E3: bukti per panggilan: identitas pass/berkas, percobaan & retry,
 *   status sukses/gagal per panggilan, provider/model aktual yang
 *   ditangkap pass (Sprint 4) dan konsensus identitas workflow.
 * - E4: feature key yang dihasilkan builder ⊆ kunci matriks yang dibaca
 *   LANGSUNG dari berkas api/_lib/featureBillingMatrix.js (bukan daftar
 *   karangan tes); kompleksitas nyata kode = simple|medium|complex.
 * - E5: timestamp operasi dari konteks service diteruskan; tanpa
 *   konteks → startedAt null jujur, finishedAt = generatedAt.
 * - E6: jalur deterministik murni (penyelesaian harga/kuantitas
 *   completeDedBatch) TIDAK menghasilkan record usage dan tidak
 *   menambah modelCalls — operasi deterministik bukan record berbayar.
 * - E7: pricingPolicyVersion null (v1.1 LOCKED ada di server tetapi tak
 *   terikat per panggilan — tidak diklaim).
 * - E8: bentuk bukti per panggilan kompatibel dengan kontrak
 *   recordUsageEvidence Sprint 3: { provider, model, tokensIn,
 *   tokensOut, tokensCached } terbaca dari record tanpa transformasi
 *   nilai (null tetap null → bukti tidak lengkap, bukan nol).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  buildDedUsageFromStandard, buildDedUsageFromFullAi, dedStandardFeatureKey,
} from '../ai-tools/ded-ai-estimate/usageMetadata';
import { completeDedBatch, derivePlanContext } from '../ai-tools/ded-ai-estimate/priceCompletion';
import { executeDedPassAttempt } from '../ai-tools/ded-ai-estimate/service';
import type { DedAiItem, DedAiOutput } from '../ai-tools/ded-ai-estimate/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); }
}

async function main(): Promise<void> {
// ---------------------------------------------------------------------------
// Baca matriks dari berkas Sprint 3 yang sebenarnya (READ-ONLY).
// ---------------------------------------------------------------------------
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
const matrixText = readFileSync(join(findRepoRoot(), 'api/_lib/featureBillingMatrix.js'), 'utf8');
const matrixDedKeys = [...matrixText.matchAll(/'(ded-ai\/[a-z-]+)':/g)].map((m) => m[1]);
const matrixFreeKeys = [...matrixText.matchAll(/'(volume-calculation|rab-arithmetic|ahsp-lookup|ahsp-candidate-search|price-resolution|recalculation|export-pdf|export-excel|project-open|project-edit|document-review-local)':/g)].map((m) => m[1]);

console.log('== E4a: matriks terbaca dari berkas Sprint 3 ==');
check('matriks memuat ded-ai/simple|medium|complex|full-ai',
  ['ded-ai/simple', 'ded-ai/medium', 'ded-ai/complex', 'ded-ai/full-ai'].every((k) => matrixDedKeys.includes(k)));
check('matriks memuat kelas DETERMINISTIC_FREE (ahsp-lookup, price-resolution, recalculation, project-edit)',
  ['ahsp-lookup', 'price-resolution', 'recalculation', 'project-edit'].every((k) => matrixFreeKeys.includes(k)));

// ---------------------------------------------------------------------------
// Keluaran standar sintetis (jejak pass lengkap, termasuk identitas
// aktual per pass seperti yang kini ditangkap service Sprint 4).
// ---------------------------------------------------------------------------
const stdOutput = {
  jobId: 'dedai-sprint4-1', mode: 'DETAIL', policy: 'FULL_AI', partial: true,
  completionReport: { filledMarketReference: 2, filledAiEstimate: 1 },
  analysisTrace: {
    passes: [
      { passIndex: 0, clusterLabel: 'Arsitektur & Ruang', pageTypes: ['DENAH'], pages: [1, 2], productId: 'DED_AI_DETAIL', mode: 'DETAIL', maxTokens: 24000, status: 'OK', retryCount: 1, itemCount: 5, provider: 'gemini', model: 'gemini-actual-1', sourceFile: 'ded-a.pdf' },
      { passIndex: 1, clusterLabel: 'Struktur & Pondasi', pageTypes: ['STRUKTUR'], pages: [3], productId: 'DED_AI_DETAIL', mode: 'DETAIL', maxTokens: 24000, status: 'FAILED', errorCode: 'MODEL_TIMEOUT', retryCount: 0, itemCount: 0, provider: null, model: null, sourceFile: 'ded-a.pdf' },
      { passIndex: 2, clusterLabel: 'Atap', pageTypes: ['ATAP'], pages: [4], productId: 'DED_AI_DETAIL', mode: 'DETAIL', maxTokens: 24000, status: 'SKIPPED_BUDGET', retryCount: 0, itemCount: 0, sourceFile: 'ded-a.pdf' },
    ],
  },
} as unknown as DedAiOutput;

const START = '2026-11-10T00:00:00.000Z';
const END = '2026-11-10T00:01:30.000Z';
const u = buildDedUsageFromStandard(stdOutput, {
  projectId: 'PRJ-9', workspaceId: 'WS-9', actorUserId: 'user-9',
  startedAt: START, finishedAt: END, generatedAt: END, fileName: 'ded-a.pdf',
});

console.log('== E1: field wajib workflow standar ==');
check('workflowId/featureKey/pipeline/status',
  u.workflowId === 'dedai-sprint4-1' && u.featureKey === 'ded-ai/medium' && u.pipeline === 'STANDARD' && u.status === 'PARTIAL');
check('token & biaya null PERSIS (bukan 0, bukan estimasi karakter)',
  u.inputTokens === null && u.outputTokens === null && u.cachedTokens === null && u.providerCostIdr === null && u.cacheHits === null);
check('modelCalls hanya pass terkirim (2 dari 3); retries agregat dari jejak (1)',
  u.modelCalls === 2 && u.retries === 1);
check('identitas konteks diteruskan', u.projectId === 'PRJ-9' && u.workspaceId === 'WS-9' && u.actorUserId === 'user-9');

console.log('== E2: alasan bukti hilang eksplisit ==');
check('missingEvidenceReason workflow = GATEWAY_DOES_NOT_REPORT_TOKENS saat token null',
  u.missingEvidenceReason === 'GATEWAY_DOES_NOT_REPORT_TOKENS');
check('providerCostMissingReason = PROVIDER_COST_NOT_REPORTED saat biaya null',
  u.providerCostMissingReason === 'PROVIDER_COST_NOT_REPORTED');

console.log('== E3: bukti per panggilan ==');
check('satu record per pass (3)', Array.isArray(u.calls) && u.calls.length === 3);
const [c0, c1, c2] = u.calls!;
check('pass terkirim OK: attempts=1+retries(1)=2, status OK, identitas aktual tercatat',
  c0.callId === 'pass-0' && c0.attempts === 2 && c0.retries === 1 && c0.status === 'OK'
  && c0.provider === 'gemini' && c0.model === 'gemini-actual-1' && c0.productId === 'DED_AI_DETAIL');
check('pass terkirim OK: halaman & berkas tercatat', c0.pages.join(',') === '1,2' && c0.sourceFile === 'ded-a.pdf');
check('pass terkirim: token per panggilan null + alasan gateway',
  c0.inputTokens === null && c0.outputTokens === null && c0.cachedTokens === null
  && c0.missingEvidenceReason === 'GATEWAY_DOES_NOT_REPORT_TOKENS');
check('pass GAGAL tercatat sebagai gagal dengan errorCode, bukan hilang',
  c1.status === 'FAILED' && c1.errorCode === 'MODEL_TIMEOUT' && c1.attempts === 1 && c1.provider === null);
check('pass SKIPPED_BUDGET: attempts 0 + alasan CALL_NOT_SENT',
  c2.attempts === 0 && c2.retries === 0 && c2.missingEvidenceReason === 'CALL_NOT_SENT');
check('requestedProvider/requestedModel null jujur (registri tidak dibaca pipeline)',
  c0.requestedProvider === null && c0.requestedModel === null && u.requestedProvider === null && u.requestedModel === null);
check('timestamp per panggilan null jujur (pipeline tak menangkapnya)',
  c0.startedAt === null && c0.finishedAt === null);
check('konsensus identitas workflow: pass gagal tanpa identitas tidak mengarang provider workflow',
  u.provider === 'gemini' && u.model === 'gemini-actual-1');

console.log('== E5/E7: timestamp operasi & versi tarif ==');
check('startedAt/finishedAt dari service diteruskan apa adanya',
  u.startedAt === START && u.finishedAt === END);
check('pricingPolicyVersion null (v1.1 LOCKED tak terikat per panggilan — tidak diklaim)',
  u.pricingPolicyVersion === null);
{
  const bare = buildDedUsageFromStandard(stdOutput, {});
  check('tanpa konteks waktu: startedAt null jujur; finishedAt = generatedAt',
    bare.startedAt === null && bare.finishedAt === bare.generatedAt);
  // Jejak gaya lama (pass tanpa identitas aktual — bentuk sebelum Sprint 4):
  const legacy = buildDedUsageFromStandard({
    jobId: 'dedai-legacy', mode: 'FAST', policy: 'FULL_AI', partial: false,
    analysisTrace: {
      passes: [
        { passIndex: 0, clusterLabel: 'Semua Halaman', pageTypes: [], pages: [1], productId: 'DED_AI_FAST', mode: 'FAST', maxTokens: 16000, status: 'OK', retryCount: 0, itemCount: 3 },
      ],
    },
  } as unknown as DedAiOutput, {});
  check('jejak tanpa identitas per pass: provider/model workflow & panggilan null (perilaku lama utuh)',
    legacy.provider === null && legacy.model === null
    && legacy.calls![0].provider === null && legacy.calls![0].model === null
    && legacy.featureKey === 'ded-ai/simple');
}

console.log('== E4b: feature key builder vs matriks ==');
{
  const produced = [
    dedStandardFeatureKey('FAST'),
    dedStandardFeatureKey('DETAIL'),
    dedStandardFeatureKey('DETAIL', 'simple'),
    dedStandardFeatureKey('DETAIL', 'medium'),
    dedStandardFeatureKey('DETAIL', 'complex'),
    buildDedUsageFromFullAi({ provenance: { provider: null, model: null }, items: [] }, { workflowId: 'wf', policy: 'FULL_AI' }).featureKey,
  ];
  check('semua feature key yang dapat dihasilkan builder ada di matriks',
    produced.every((k) => matrixDedKeys.includes(k)));
  check('kompleksitas nyata kode tepat simple|medium|complex (tak ada kunci liar)',
    produced.filter((k) => k.startsWith('ded-ai/')).every((k) =>
      ['ded-ai/simple', 'ded-ai/medium', 'ded-ai/complex', 'ded-ai/full-ai'].includes(k)));
  check("TEMUAN tercatat: 'ded-ai/revision' ada di matriks tetapi TIDAK dihasilkan builder/pipeline DED mana pun",
    matrixDedKeys.includes('ded-ai/revision') && !produced.includes('ded-ai/revision'));
}

console.log('== E1b/E3b: workflow Full AI ==');
const uf = buildDedUsageFromFullAi(
  {
    provenance: { provider: 'atmorouter', model: 'ali/deepseek-v4.1-flash' },
    items: [{ price: { filledFromExternalRef: true } }, { price: {} }],
    isPartial: true, warnings: ['Sebagian halaman gagal dibaca'],
    fileName: 'ded-b.pdf', productId: 'DED_AI_DETAIL',
  },
  { workflowId: 'fullai-sprint4-1', policy: 'FULL_AI', startedAt: START, finishedAt: END, generatedAt: END });
check('Full AI: featureKey ded-ai/full-ai, 1 panggilan, status PARTIAL',
  uf.featureKey === 'ded-ai/full-ai' && uf.modelCalls === 1 && uf.status === 'PARTIAL' && uf.pipeline === 'FULL_AI');
check('Full AI: token/biaya null + alasan eksplisit',
  uf.inputTokens === null && uf.providerCostIdr === null
  && uf.missingEvidenceReason === 'GATEWAY_DOES_NOT_REPORT_TOKENS'
  && uf.providerCostMissingReason === 'PROVIDER_COST_NOT_REPORTED');
check('Full AI: tepat satu call record FULL_AI_MAIN dengan berkas & produk',
  uf.calls!.length === 1 && uf.calls![0].kind === 'FULL_AI_MAIN' && uf.calls![0].callId === 'full-ai-main'
  && uf.calls![0].sourceFile === 'ded-b.pdf' && uf.calls![0].productId === 'DED_AI_DETAIL'
  && uf.calls![0].attempts === 1 && uf.calls![0].retries === 0 && uf.calls![0].status === 'SUCCESS');
check('Full AI: identitas aktual dari provenance diteruskan ke record & workflow',
  uf.calls![0].provider === 'atmorouter' && uf.provider === 'atmorouter' && uf.model === 'ali/deepseek-v4.1-flash');
check('Full AI: timestamps & pricingPolicyVersion',
  uf.startedAt === START && uf.finishedAt === END && uf.pricingPolicyVersion === null);

console.log('== E8: bentuk bukti kompatibel kontrak recordUsageEvidence (Sprint 3) ==');
{
  // aiMetering.recordUsageEvidence membaca { provider, model, usage:
  // { tokensIn, tokensOut, tokensCached } } per panggilan dan menandai
  // bukti tidak lengkap bila ada yang null — record DED harus dapat
  // dipetakan 1:1 TANPA mengubah nilai (null tidak menjadi 0).
  const ev = uf.calls!.map((c) => ({
    provider: c.provider, model: c.model,
    usage: { tokensIn: c.inputTokens, tokensOut: c.outputTokens, tokensCached: c.cachedTokens },
  }));
  check('pemetaan bukti 1:1 tanpa transformasi nilai (null tetap null)',
    ev[0].provider === 'atmorouter' && ev[0].usage.tokensIn === null && ev[0].usage.tokensOut === null && ev[0].usage.tokensCached === null);
}

console.log('== E3c: executeDedPassAttempt menangkap identitas aktual percobaan final ==');
{
  const okResult: any = {
    success: true, content: '{"workItems":[]}', structured: { workItems: [] }, requestId: 'req-1',
    provider: 'gemini', model: 'gemini-actual-9',
  };
  const exec = await executeDedPassAttempt(async () => okResult);
  check('OUTCOME membawa provider/model aktual dari AiToolsSuccess',
    exec.kind === 'OUTCOME' && exec.provider === 'gemini' && exec.model === 'gemini-actual-9');
  const errResult: any = { success: false, errorCode: 'MODEL_ERROR', stage: 'x', message: 'gagal', retryable: false };
  const execErr = await executeDedPassAttempt(async () => errResult);
  check('PROVIDER_ERROR: identitas null jujur (error gateway tak membawa identitas)',
    execErr.kind === 'PROVIDER_ERROR' && execErr.provider === null && execErr.model === null);
  // Retry MALFORMED: identitas yang tercatat adalah percobaan FINAL.
  let n = 0;
  const seq = await executeDedPassAttempt(async () => {
    n += 1;
    return n === 1
      ? { success: true, content: 'bukan json sama sekali', structured: null, requestId: 'r1', provider: 'p-salah', model: 'm-salah' } as any
      : { success: true, content: '{"workItems":[]}', structured: { workItems: [] }, requestId: 'r2', provider: 'p-final', model: 'm-final' } as any;
  });
  check('retry MALFORMED: retries=1 dan identitas = percobaan final (bukan percobaan gagal)',
    seq.kind === 'OUTCOME' && seq.retries === 1 && seq.provider === 'p-final' && seq.model === 'm-final');
}

console.log('== E6: operasi deterministik TIDAK menghasilkan record berbayar ==');
{
  const NOW = new Date('2026-11-10T00:00:00Z');
  const items = [{
    id: 'det-1', name: 'Pasangan Bata Merah', category: 'Dinding', units: 'm2',
    quantity: 20, quantitySource: 'DERIVED', unitPrice: null,
    priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [], provenance: [], stage: 'PARSE',
  } as unknown as DedAiItem];
  const ctx = derivePlanContext(items as DedAiItem[]);
  const res = completeDedBatch(items as DedAiItem[], ctx, { policy: 'FULL_AI', now: NOW });
  check('penyelesaian deterministik berjalan (item diproses)',
    Array.isArray(res.items) && res.items.length === 1);
  check('hasil penyelesaian TIDAK memuat record usage apa pun',
    !('usage' in (res as any)) && res.items.every((it) => !('usage' in (it as any))));
  // Workflow tanpa pass terkirim: riset terapan tercatat TETAPI modelCalls 0.
  const detOnly = buildDedUsageFromStandard({
    jobId: 'dedai-det-0', mode: 'FAST', policy: 'FULL_AI', partial: false,
    completionReport: { filledMarketReference: 5, filledAiEstimate: 0 },
    analysisTrace: { passes: [] },
  } as unknown as DedAiOutput, {});
  check('0 pass terkirim → modelCalls 0 meski externalResearchApplications = 5 (deterministik ≠ berbayar)',
    detOnly.modelCalls === 0 && detOnly.externalResearchApplications === 5 && detOnly.calls!.length === 0);
}

console.log(`\nHASIL: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
}

void main();
