/**
 * api/_lib/learning/memoryValidation.js — Validasi record memori yang
 * deterministik (Phase B).
 * ============================================================================
 * Semua fungsi MURNI dan deterministik: input yang sama selalu menghasilkan
 * outcome yang sama, dengan kode machine-readable dari memoryContracts.js.
 * Urutan pemeriksaan validateMemoryRecord tetap (scope → kepemilikan →
 * kategori → lifecycle → provenance → confidence → timestamp →
 * klasifikasi) agar kegagalan pertama selalu dapat diprediksi pengujian.
 *
 * Pesan hasil TIDAK PERNAH memuat isi record/sumber — hanya kode, field,
 * dan rule. Konten mentah percakapan tidak disimpan oleh kontrak ini dan
 * tidak boleh bocor lewat pesan error.
 */
import {
  DATA_CLASSIFICATIONS,
  SOURCE_VALIDATION_STATUSES,
  canTransitionStatus,
  failResult,
  isCategory,
  isLifecycle,
  isRetrievableStatus,
  isScope,
  isSourceType,
  isStatusAllowedForScope,
  isValidTimestamp,
  normalizeId,
  okResult,
  validateOwnership,
} from './memoryContracts.js';

/** Confidence sah: angka finite dalam rentang [0, 1]. NaN/Infinity ditolak. */
export function validateConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return failResult('INVALID_CONFIDENCE', 'Confidence harus angka antara 0 dan 1.', 'confidence', 'CONFIDENCE_RANGE');
  }
  return okResult();
}

/**
 * Validasi provenance (prompt §7.5). Provenance WAJIB ada dan dapat
 * ditelusuri: tipe sumber dari himpunan tertutup, sourceId non-kosong,
 * capturedAt valid. Isi sumber mentah tidak diperiksa dan tidak disimpan
 * di sini — hanya metadata referensinya.
 */
export function validateProvenance(source) {
  if (!source || typeof source !== 'object') {
    return failResult('SOURCE_NOT_VERIFIABLE', 'Provenance sumber tidak ada.', 'source', 'PROVENANCE_REQUIRED');
  }
  if (!isSourceType(source.sourceType)) {
    return failResult('INVALID_PROVENANCE', 'Tipe sumber tidak dikenal.', 'source.sourceType', 'SOURCE_TYPE_UNKNOWN');
  }
  if (!normalizeId(source.sourceId)) {
    return failResult('SOURCE_NOT_VERIFIABLE', 'Referensi sumber tidak dapat diverifikasi.', 'source.sourceId', 'SOURCE_ID_REQUIRED');
  }
  if (!isValidTimestamp(source.capturedAt)) {
    return failResult('INVALID_TIMESTAMP', 'Waktu penangkapan sumber tidak valid.', 'source.capturedAt', 'TIMESTAMP_INVALID');
  }
  if (source.sourceCreatedAt != null && !isValidTimestamp(source.sourceCreatedAt)) {
    return failResult('INVALID_TIMESTAMP', 'Waktu pembuatan sumber tidak valid.', 'source.sourceCreatedAt', 'TIMESTAMP_INVALID');
  }
  if (source.validationStatus != null && !SOURCE_VALIDATION_STATUSES.includes(source.validationStatus)) {
    return failResult('INVALID_PROVENANCE', 'Status validasi sumber tidak dikenal.', 'source.validationStatus', 'SOURCE_VALIDATION_STATUS_UNKNOWN');
  }
  if (source.origin != null && !normalizeId(source.origin)) {
    return failResult('INVALID_PROVENANCE', 'Origin sumber tidak valid.', 'source.origin', 'SOURCE_ORIGIN_INVALID');
  }
  return okResult();
}

/**
 * Validasi satu transisi lifecycle untuk sebuah record: matriks transisi
 * global DAN kesesuaian status tujuan dengan scope record. Keduanya harus
 * lulus — mis. transisi APPROVED → PUBLISHED sah secara matriks, tetapi
 * PUBLISHED bukan status milik scope PERSONAL sehingga tetap ditolak.
 */
export function validateLifecycleTransition(record, toStatus) {
  if (!record || typeof record !== 'object' || !isScope(record.scope)) {
    return failResult('INVALID', 'Record atau scope tidak valid.', 'scope', 'SCOPE_UNKNOWN');
  }
  if (!isLifecycle(record.status) || !isStatusAllowedForScope(record.scope, record.status)) {
    return failResult('INVALID_TRANSITION', 'Status asal tidak sah untuk scope ini.', 'status', 'STATUS_NOT_ALLOWED_FOR_SCOPE');
  }
  if (!isLifecycle(toStatus) || !isStatusAllowedForScope(record.scope, toStatus)) {
    return failResult('INVALID_TRANSITION', 'Status tujuan tidak sah untuk scope ini.', 'status', 'STATUS_NOT_ALLOWED_FOR_SCOPE');
  }
  if (!canTransitionStatus(record.status, toStatus)) {
    return failResult('INVALID_TRANSITION', 'Transisi lifecycle tidak diizinkan.', 'status', 'TRANSITION_NOT_ALLOWED');
  }
  return okResult();
}

/** Apakah record ini boleh diambil (retrievable) menurut scope + statusnya? */
export function isRetrievableRecord(record) {
  if (!record || typeof record !== 'object') return false;
  return isRetrievableStatus(record.scope, record.status);
}

/**
 * Validasi penuh satu record memori. Mengembalikan kegagalan PERTAMA
 * menurut urutan tetap yang didokumentasikan di header file.
 */
export function validateMemoryRecord(record) {
  if (!record || typeof record !== 'object') {
    return failResult('INVALID', 'Record memori tidak ada.', 'record', 'RECORD_REQUIRED');
  }
  if (!isScope(record.scope)) {
    return failResult('INVALID', 'Scope record tidak dikenal.', 'scope', 'SCOPE_UNKNOWN');
  }
  const ownership = validateOwnership(record.scope, record.ownership);
  if (!ownership.ok) return ownership;
  if (!isCategory(record.category)) {
    return failResult('INVALID', 'Kategori record tidak dikenal.', 'category', 'CATEGORY_UNKNOWN');
  }
  if (!isLifecycle(record.status) || !isStatusAllowedForScope(record.scope, record.status)) {
    return failResult('INVALID_TRANSITION', 'Status lifecycle tidak sah untuk scope ini.', 'status', 'STATUS_NOT_ALLOWED_FOR_SCOPE');
  }
  const provenance = validateProvenance(record.source);
  if (!provenance.ok) return provenance;
  if (record.confidence != null) {
    const confidence = validateConfidence(record.confidence);
    if (!confidence.ok) return confidence;
  }
  if (!isValidTimestamp(record.createdAt)) {
    return failResult('INVALID_TIMESTAMP', 'createdAt tidak valid.', 'createdAt', 'TIMESTAMP_INVALID');
  }
  if (!isValidTimestamp(record.updatedAt) || record.updatedAt < record.createdAt) {
    return failResult('INVALID_TIMESTAMP', 'updatedAt tidak valid atau mendahului createdAt.', 'updatedAt', 'TIMESTAMP_INVALID');
  }
  if (record.expiresAt != null && (!isValidTimestamp(record.expiresAt) || record.expiresAt <= record.createdAt)) {
    return failResult('INVALID_TIMESTAMP', 'expiresAt tidak valid.', 'expiresAt', 'TIMESTAMP_INVALID');
  }
  if (record.dataClassification != null && !DATA_CLASSIFICATIONS.includes(record.dataClassification)) {
    return failResult('INVALID', 'Klasifikasi data tidak dikenal.', 'dataClassification', 'CLASSIFICATION_UNKNOWN');
  }
  if (typeof record.content !== 'string' || record.content.trim().length === 0) {
    return failResult('INVALID', 'Konten record kosong.', 'content', 'CONTENT_REQUIRED');
  }
  return okResult();
}
