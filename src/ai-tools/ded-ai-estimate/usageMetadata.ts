/**
 * DED AI ESTIMATE — Metadata usage workflow (HARDENING 2026-11-10,
 * Tahap 6: kesiapan Unified Credits; SPRINT 4 Tugas E: kelengkapan
 * bukti per panggilan untuk lifecycle masa depan).
 *
 * Satu batch analisis DED = satu workflow terlacak. Modul ini HANYA
 * membangun catatan metadata dari jejak yang sudah ada — ia TIDAK
 * menagih, TIDAK memotong kredit, dan TIDAK mengaktifkan billing apa
 * pun (matriks api/_lib/featureBillingMatrix.js tetap DORMANT;
 * debit server-side TIDAK diaktifkan oleh modul ini).
 *
 * Bentuk catatan ini diselaraskan — bukan diduplikasi — dengan adapter
 * Sprint 3 (api/_lib/dedBillingAdapter.js): satu operasi per
 * batch/run, feature key yang sama, dan bukti per panggilan yang kelak
 * dapat diserahkan ke recordUsageEvidence milik boundary metering
 * (api/_lib/aiMetering.js menerima { provider, model, usage:
 * { tokensIn, tokensOut, tokensCached } } per panggilan). Selama token
 * tidak dilaporkan gateway ke klien, bukti itu TIDAK lengkap — dan
 * ketidaklengkapan itu dinyatakan eksplisit lewat
 * `missingEvidenceReason`, bukan ditambal estimasi.
 *
 * Aturan kejujuran data:
 * - Token input/output/cache dicatat hanya bila gateway melaporkannya;
 *   SPRINT 5 (plumbing X1/X2 + X3): gateway kini meneruskan usage &
 *   requestId attempt final ke klien, jadi builder mengisi token dan
 *   requestId per panggilan DARI BUKTI ITU bila ada; tanpa bukti,
 *   nilainya null PERSIS — tidak ditebak, tidak diestimasi dari
 *   karakter, dan jumlah panggilan model TIDAK diubah menjadi token.
 *   Total tingkat workflow hanya dihitung bila setiap panggilan
 *   terkirim membawa angka untuk field itu (tanpa total parsial).
 * - Provider/model dicatat dari identitas AKTUAL gateway bila ada
 *   (ded-full-ai menyimpannya di provenance keluaran; pipeline standar
 *   menangkapnya per pass dari AiToolsSuccess sejak Sprint 4).
 *   Provider/model yang DIMINTA (registri produk) tidak dibaca
 *   pipeline, jadi requestedProvider/requestedModel = null.
 * - `pricingPolicyVersion` null: pricingPolicy v1.1 LOCKED ada di sisi
 *   server, tetapi tidak terikat per panggilan/per workflow ke
 *   metadata ini — mengisi versinya akan mengarang ikatan.
 * - Operasi deterministik (hitung kuantitas, hitung ulang kanonis,
 *   lookup AHSP, pencocokan referensi & cache lokal, tampil
 *   provenans, tinjau/setujui user, validasi lokal) BUKAN operasi
 *   berbayar dan tidak menghasilkan record berbayar dalam desain
 *   lifecycle ini: fungsi penyelesaian murni tidak membangun catatan
 *   usage sama sekali dan tidak menambah modelCalls.
 *   `externalResearchApplications` menghitung pengisian dari referensi
 *   terkurasi lokal — dicatat untuk transparansi, bukan untuk ditagih.
 * - Tidak ada saldo khusus DED dan tidak ada sistem billing kedua:
 *   catatan ini adalah metadata kesiapan untuk Unified Credits
 *   bersama, bukan ledger.
 */

import type { DedAiOutput, DedUsageCallRecord, DedWorkflowUsage } from './types';

export interface DedUsageContext {
  projectId?: string;
  workspaceId?: string;
  actorUserId?: string;
  generatedAt?: string;
  /** SPRINT 4: waktu mulai operasi (ISO) yang ditangkap service; absen = null jujur di catatan. */
  startedAt?: string;
  /** SPRINT 4: waktu selesai operasi (ISO); absen → builder memakai generatedAt sebagai selesai. */
  finishedAt?: string;
  /** SPRINT 4: nama berkas yang diproses workflow ini (satu workflow standar = satu berkas). */
  fileName?: string;
}

const TOKENS_NOT_REPORTED = 'GATEWAY_DOES_NOT_REPORT_TOKENS' as const;
const COST_NOT_REPORTED = 'PROVIDER_COST_NOT_REPORTED' as const;

/** Status pass yang berarti panggilan TIDAK pernah dikirim ke gateway. */
function passWasSent(status: string): boolean {
  return status !== 'SKIPPED_BUDGET' && status !== 'SKIPPED_UNSUPPORTED';
}

/**
 * Identitas aktual tingkat workflow dari bukti per panggilan: dipakai
 * hanya bila SEMUA panggilan terkirim yang membawa identitas sepakat
 * pada satu provider/model yang sama. Bila campuran atau tak ada yang
 * membawa identitas → null (tidak memilih salah satu secara diam-diam).
 */
function consensusIdentity(calls: DedUsageCallRecord[]): { provider: string | null; model: string | null } {
  const seen = new Map<string, { provider: string; model: string }>();
  for (const c of calls) {
    if (c.missingEvidenceReason === 'CALL_NOT_SENT') continue;
    if (c.provider && c.model) seen.set(`${c.provider} ${c.model}`, { provider: c.provider, model: c.model });
  }
  if (seen.size !== 1) return { provider: null, model: null };
  const [only] = [...seen.values()];
  return only;
}

/** Kunci fitur matriks Unified Credits untuk pipeline standar. */
export function dedStandardFeatureKey(mode: DedAiOutput['mode'], complexity?: 'simple' | 'medium' | 'complex'): string {
  // Matriks mendaftarkan ded-ai/simple|medium|complex (FLAT_DRAFT).
  // Mode FAST dipetakan ke simple; DETAIL memakai kompleksitas yang
  // dipilih pengguna bila diketahui, default medium.
  if (mode === 'FAST') return 'ded-ai/simple';
  return `ded-ai/${complexity ?? 'medium'}`;
}

/** Bangun catatan usage dari keluaran pipeline standar. */
export function buildDedUsageFromStandard(
  output: DedAiOutput,
  ctx: DedUsageContext = {},
): DedWorkflowUsage {
  const passes = output.analysisTrace?.passes ?? [];
  const sentPasses = passes.filter((p) => passWasSent(p.status));
  const errors: string[] = [];
  for (const p of passes) {
    if (p.status === 'FAILED' || p.status === 'MALFORMED_RESPONSE') {
      errors.push(`pass "${p.clusterLabel}": ${p.status}${p.errorCode ? ` (${p.errorCode})` : ''}`);
    }
  }
  // SPRINT 4: bukti per panggilan dari jejak pass. Token per panggilan
  // null PERSIS (gateway tidak melaporkannya ke klien); percobaan &
  // retry dari eksekusi pipeline nyata (retryCount jejak pass).
  const calls: DedUsageCallRecord[] = passes.map((p, idx) => {
    const sent = passWasSent(p.status);
    const retries = p.retryCount ?? 0;
    // SPRINT 5 (plumbing X1/X2): token per panggilan diisi dari usage
    // attempt final yang benar-benar dilaporkan gateway (jejak pass);
    // tanpa usage, ATAU usage yang field intinya semua null, token
    // tetap null + alasan — tidak pernah ditebak/dijumlahkan sebagian.
    const u = sent ? (p.usage ?? null) : null;
    const hasTokens = u != null && (u.inputTokens != null || u.outputTokens != null);
    return {
      callId: `pass-${p.passIndex ?? idx}`,
      kind: 'PASS',
      label: p.clusterLabel,
      sourceFile: p.sourceFile ?? ctx.fileName ?? null,
      pages: [...(p.pages ?? [])],
      productId: p.productId ?? null,
      requestedProvider: null,
      requestedModel: null,
      provider: p.provider ?? null,
      model: p.model ?? null,
      // SPRINT 5 (X3): requestId gateway per panggilan (korelasi persis
      // ke meter/log gateway); hanya untuk pass terkirim yang membawanya.
      requestId: sent ? (p.requestId ?? null) : null,
      attempts: sent ? 1 + retries : 0,
      retries: sent ? retries : 0,
      status: p.status,
      errorCode: p.errorCode ?? null,
      inputTokens: hasTokens ? u.inputTokens : null,
      outputTokens: hasTokens ? u.outputTokens : null,
      cachedTokens: hasTokens ? u.cachedTokens : null,
      missingEvidenceReason: !sent ? 'CALL_NOT_SENT' : hasTokens ? null : TOKENS_NOT_REPORTED,
      startedAt: null,
      finishedAt: null,
    };
  });
  // SPRINT 5: total token tingkat workflow hanya dihitung bila SETIAP
  // panggilan terkirim membawa angka untuk field itu — total parsial
  // akan menjadi bukti karangan. Per field dinilai terpisah.
  const sentCalls = calls.filter((c) => c.missingEvidenceReason !== 'CALL_NOT_SENT');
  const sumWhenComplete = (pick: (c: DedUsageCallRecord) => number | null): number | null => {
    if (sentCalls.length === 0) return null;
    let total = 0;
    for (const c of sentCalls) {
      const v = pick(c);
      if (v == null) return null;
      total += v;
    }
    return total;
  };
  const workflowInputTokens = sumWhenComplete((c) => c.inputTokens);
  const workflowOutputTokens = sumWhenComplete((c) => c.outputTokens);
  const workflowCachedTokens = sumWhenComplete((c) => c.cachedTokens);
  const workflowTokensComplete = workflowInputTokens != null && workflowOutputTokens != null;
  const identity = consensusIdentity(calls);
  const filledFromResearch = (output.completionReport?.filledMarketReference ?? 0)
    + (output.completionReport?.filledAiEstimate ?? 0);
  const generatedAt = ctx.generatedAt ?? new Date().toISOString();
  return {
    workflowId: output.jobId,
    featureKey: dedStandardFeatureKey(output.mode),
    pipeline: 'STANDARD',
    policy: output.policy,
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    // Identitas aktual tingkat workflow: provenance Full-AI-style hanya
    // diisi bila seluruh panggilan terkirim sepakat (lihat
    // consensusIdentity); bila pass tidak membawa identitas → null.
    provider: identity.provider,
    model: identity.model,
    modelCalls: sentPasses.length,
    inputTokens: workflowInputTokens,
    outputTokens: workflowOutputTokens,
    cachedTokens: workflowCachedTokens,
    externalResearchApplications: filledFromResearch,
    cacheHits: null,
    providerCostIdr: null,
    status: output.partial ? 'PARTIAL' : 'SUCCESS',
    retries: passes.reduce((acc, p) => acc + (p.retryCount ?? 0), 0),
    errors,
    generatedAt,
    requestedProvider: null,
    requestedModel: null,
    calls,
    // Alasan terisi PERSIS bila pasangan token inti workflow tidak
    // lengkap; null hanya bila input+output tercatat penuh (SPRINT 5).
    missingEvidenceReason: workflowTokensComplete ? null : TOKENS_NOT_REPORTED,
    providerCostMissingReason: COST_NOT_REPORTED,
    pricingPolicyVersion: null,
    startedAt: ctx.startedAt ?? null,
    finishedAt: ctx.finishedAt ?? generatedAt,
  };
}

export interface FullAiUsageSource {
  provenance: { provider: string | null; model: string | null };
  items: ReadonlyArray<{ price: { filledFromExternalRef?: boolean } }>;
  isPartial?: boolean;
  warnings?: string[];
  /** SPRINT 4: nama berkas yang diproses panggilan Full AI ini (satu panggilan per berkas). */
  fileName?: string;
  /** SPRINT 4: produk gateway yang diminta (DED_AI_FAST / DED_AI_DETAIL). */
  productId?: string;
  /** SPRINT 5 (X3): requestId gateway panggilan Full AI ini; null/absen = tidak disediakan. */
  requestId?: string | null;
  /** SPRINT 5 (plumbing X1/X2): token attempt final bila gateway melaporkannya; null = tidak dilaporkan. */
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
}

/** Bangun catatan usage dari keluaran ded-full-ai (1 panggilan model per berkas). */
export function buildDedUsageFromFullAi(
  output: FullAiUsageSource,
  ctx: DedUsageContext & { workflowId: string; policy: DedWorkflowUsage['policy'] },
): DedWorkflowUsage {
  const provider = output.provenance.provider ?? null;
  const model = output.provenance.model ?? null;
  const generatedAt = ctx.generatedAt ?? new Date().toISOString();
  // SPRINT 5: bukti panggilan tunggal Full AI — requestId & token hanya
  // dari nilai yang benar-benar diteruskan service (AiToolsSuccess);
  // pasangan inti lengkap → alasan hilang menjadi null.
  const fullAiHasTokens = output.inputTokens != null || output.outputTokens != null;
  const fullAiTokensComplete = output.inputTokens != null && output.outputTokens != null;
  const callInputTokens = fullAiHasTokens ? (output.inputTokens ?? null) : null;
  const callOutputTokens = fullAiHasTokens ? (output.outputTokens ?? null) : null;
  const callCachedTokens = fullAiHasTokens ? (output.cachedTokens ?? null) : null;
  // SPRINT 4: satu panggilan model per workflow Full AI (service
  // dipanggil per berkas oleh view; tidak ada retry di lapisan
  // pipeline Full AI — retries 0 adalah hitungan nyata, bukan asumsi).
  const calls: DedUsageCallRecord[] = [{
    callId: 'full-ai-main',
    kind: 'FULL_AI_MAIN',
    label: output.fileName ?? 'DED Full AI',
    sourceFile: output.fileName ?? null,
    pages: [],
    productId: output.productId ?? null,
    requestedProvider: null,
    requestedModel: null,
    provider,
    model,
    requestId: output.requestId ?? null,
    attempts: 1,
    retries: 0,
    status: 'SUCCESS',
    errorCode: null,
    inputTokens: callInputTokens,
    outputTokens: callOutputTokens,
    cachedTokens: callCachedTokens,
    missingEvidenceReason: fullAiHasTokens ? null : TOKENS_NOT_REPORTED,
    startedAt: null,
    finishedAt: null,
  }];
  return {
    workflowId: ctx.workflowId,
    featureKey: 'ded-ai/full-ai',
    pipeline: 'FULL_AI',
    policy: ctx.policy,
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    provider,
    model,
    modelCalls: 1,
    inputTokens: fullAiTokensComplete ? callInputTokens : null,
    outputTokens: fullAiTokensComplete ? callOutputTokens : null,
    cachedTokens: callCachedTokens,
    externalResearchApplications: output.items.filter((i) => i.price.filledFromExternalRef).length,
    cacheHits: null,
    providerCostIdr: null,
    status: output.isPartial ? 'PARTIAL' : 'SUCCESS',
    retries: 0,
    errors: (output.warnings ?? []).filter((w) => /gagal|error|malformed/i.test(w)),
    generatedAt,
    requestedProvider: null,
    requestedModel: null,
    calls,
    missingEvidenceReason: fullAiTokensComplete ? null : TOKENS_NOT_REPORTED,
    providerCostMissingReason: COST_NOT_REPORTED,
    pricingPolicyVersion: null,
    startedAt: ctx.startedAt ?? null,
    finishedAt: ctx.finishedAt ?? generatedAt,
  };
}
