/**
 * api/_lib/dedBillingAdapter.js — Adapter kompatibilitas billing DED (DORMANT)
 * ============================================================================
 * Sprint 3 Tugas 5. File BARU. TIDAK menyentuh, mengimpor, atau mengubah
 * satu pun berkas DED (src/ai-tools/ded-*, src/ded-rab-v2/**). Adapter ini
 * hanya berbicara ke batas metering bersama (aiMetering.js) di atas
 * ledger Gen-2, dan hanya aktif bila gerbang AI_METERING_ENABLED menyala
 * (default mati — ditegakkan oleh boundary, bukan diduplikasi di sini).
 *
 * KONTRAK (keputusan D11 / desain Phase 2 §6.2, sebagai kontrak dorman):
 * - Tarif flat 500/650/800 adalah ESTIMASI RESERVASI MAKSIMUM per run —
 *   TIDAK PERNAH tagihan final. Tagihan final selalu settlement token
 *   v1.1 (pricingPolicy) dari usage aktual.
 * - Konstanta flat dirujuk-silang ke DUA sumber yang sudah ada dan
 *   terverifikasi sama nilainya saat file ini ditulis:
 *     src/ai-credits/config.ts  TARIFFS['ded-ai/<complexity>'].target
 *     api/_lib/creditPricing.js EZRAB_DRAFT_TARIFFS.tariffs[...].target
 *   Statusnya DRAFT (isCalibratedDraft: true di kedua sumber).
 * - Agregasi: SATU operasi per BATCH/RUN DED (bukan per berkas) dengan
 *   estimasi agregat = nilai flat kategori. Pilihan ini mempertahankan
 *   kesederhanaan yang terlihat pengguna hari ini (satu debit per run,
 *   temuan H-3) sambil mengganti maknanya: satu RESERVASI yang
 *   di-settle dari akumulasi usage SEMUA berkas/pass dalam run.
 * - Berkas gagal sebagian: berkas yang menghasilkan hasil terpakai
 *   di-settle dari usage tercatatnya; berkas yang gagal TANPA usage
 *   provider (gagal sebelum panggilan) tidak menambah tagihan. Bila
 *   kegagalan berkas mungkin mengonsumsi usage yang TIDAK diketahui
 *   (error.usageKnown === false) → seluruh run ke REQUIRES_REVIEW.
 * - Kegagalan workflow penuh (nol berkas berhasil) → release PENUH.
 * - Timeout provider: tanpa hasil/usage terpakai → release PENUH;
 *   dengan hasil parsial terpakai → REQUIRES_REVIEW (total biaya tak
 *   dapat diketahui pasti).
 * - Usage tak dikenal → REQUIRES_REVIEW. Aktual > reservasi → overage
 *   ke review manual (ledger), TANPA debit otomatis.
 * - Retry/idempotensi: kunci sama per akun → satu operasi; executor
 *   tidak dijalankan ulang untuk operasi yang sudah terminal.
 *
 * INVARIAN: adapter ini tidak mengubah keluaran DED, provenans harga,
 * label kuantitas, atau perilaku review DED. Integrasi nyata ke pipeline
 * DED adalah pekerjaan lanjutan sesudah program DED Final Hardening
 * selesai — bukan bagian sprint ini.
 */
import { isTerminalStatus } from './aiMeteringLifecycle.js';

/**
 * Estimasi reservasi maksimum DED per kategori kompleksitas.
 * DRAFT — rujuk-silang src/ai-credits/config.ts + api/_lib/creditPricing.js.
 */
export const DED_FLAT_RESERVATION_CREDITS = Object.freeze({
  simple: 500,
  medium: 650,
  complex: 800,
});

export const DED_COMPLEXITIES = Object.freeze(Object.keys(DED_FLAT_RESERVATION_CREDITS));

/**
 * Estimasi reservasi agregat satu run DED.
 * File count TIDAK mengalikan estimasi: flat adalah plafon per run.
 */
export function dedReservationEstimate(complexity) {
  const value = DED_FLAT_RESERVATION_CREDITS[complexity];
  if (value == null) return { ok: false, error: 'UNKNOWN_DED_COMPLEXITY' };
  return { ok: true, estimatedCredits: value, basis: 'FLAT_DRAFT_MAXIMUM_PER_RUN' };
}

function isTimeoutError(e) {
  return Boolean(e && (e.code === 'PROVIDER_TIMEOUT' || e.code === 'ETIMEDOUT' || e.timeout === true));
}

/**
 * Buat adapter DED di atas boundary metering bersama.
 * deps: { boundary } — hasil createAiMeteringBoundary(...).
 */
export function createDedBillingAdapter(deps) {
  const boundary = deps && deps.boundary;
  if (!boundary) throw new Error('createDedBillingAdapter: boundary wajib disuntikkan');

  /**
   * Jalankan satu batch DED termeter.
   * args: {
   *   context,                // konteks terautentikasi abstrak
   *   complexity,             // 'simple'|'medium'|'complex' (dipilih server dari sesi, bukan tagihan)
   *   files: [{ id }],        // daftar berkas run ini
   *   idempotencyKey,         // satu kunci per run
   *   approvedMaxCredits?,    // batas persetujuan server (kontrak R-4)
   *   executor,               // async (file, { operationId }) =>
   *                           //   { provider, model, usage, result }
   *                           //   lempar Error untuk kegagalan berkas;
   *                           //   error.usage (opsional) = usage yang
   *                           //   terverifikasi terpakai sebelum gagal;
   *                           //   error.usageKnown === false = usage
   *                           //   mungkin terpakai tapi tak diketahui.
   * }
   */
  async function runDedBatch(args) {
    const a = args || {};
    const estimate = dedReservationEstimate(a.complexity);
    if (!estimate.ok) return { ok: false, error: estimate.error };
    if (!Array.isArray(a.files) || a.files.length === 0) {
      return { ok: false, error: 'NO_FILES' };
    }
    if (typeof a.executor !== 'function') return { ok: false, error: 'EXECUTOR_REQUIRED' };

    const begun = boundary.beginOperation(a.context, {
      featureKey: `ded-ai/${a.complexity}`,
      idempotencyKey: a.idempotencyKey,
      approvedMaxCredits: a.approvedMaxCredits,
    });
    if (!begun.ok) return begun;
    const operationId = begun.record.operationId;

    if (begun.duplicate) {
      const status = begun.record.status;
      if (isTerminalStatus(status)) {
        return { ok: true, duplicate: true, status, record: begun.record };
      }
      return { ok: false, error: 'OPERATION_IN_PROGRESS', record: begun.record };
    }

    boundary.markExecuting(operationId);

    let succeeded = 0;
    let failed = 0;
    let sawUnknownUsage = false;
    let sawTimeout = false;
    const perFile = [];

    for (const file of a.files) {
      try {
        const outcome = await a.executor(file, { operationId });
        boundary.recordUsageEvidence(operationId, outcome || {});
        succeeded += 1;
        perFile.push({ fileId: file && file.id, ok: true });
      } catch (e) {
        failed += 1;
        if (isTimeoutError(e)) sawTimeout = true;
        if (e && e.usageKnown === false) sawUnknownUsage = true;
        if (e && e.usage) {
          // Provider terverifikasi mengonsumsi usage sebelum gagal —
          // catat sebagai bukti agar settlement/review jujur.
          boundary.recordUsageEvidence(operationId, {
            provider: e.provider || 'unknown-provider',
            model: e.model || 'unknown-model',
            usage: e.usage,
          });
        }
        perFile.push({
          fileId: file && file.id,
          ok: false,
          error: (e && e.code) || 'FILE_FAILED',
          timeout: isTimeoutError(e),
        });
      }
    }

    // Kegagalan workflow penuh → release penuh (tidak ada hasil terpakai).
    if (succeeded === 0) {
      const rel = boundary.releaseCredits(operationId, sawTimeout ? 'PROVIDER_TIMEOUT' : 'WORKFLOW_FAILED');
      return {
        ok: false,
        status: 'RELEASED',
        releasedCredits: rel.releasedCredits,
        perFile,
        record: rel.record,
      };
    }

    // Timeout dengan hasil parsial, atau usage yang mungkin terpakai
    // tapi tak diketahui → review (total biaya tak dapat dipastikan).
    if (sawTimeout || sawUnknownUsage) {
      const rev = boundary.flagForReview(
        operationId,
        sawTimeout ? 'PROVIDER_TIMEOUT_WITH_PARTIAL_RESULT' : 'USAGE_UNKNOWN_FROM_FAILED_FILE',
      );
      return { ok: true, status: 'REQUIRES_REVIEW', perFile, record: rev.record };
    }

    boundary.markSucceeded(operationId);
    const settled = boundary.settleCredits(operationId);
    return { ...settled, perFile };
  }

  return { runDedBatch, dedReservationEstimate };
}
