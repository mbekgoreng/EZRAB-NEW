/**
 * dedModePersistence.ts — Persistensi pilihan mode DED (D-45, Batch E).
 *
 * Satu kunci localStorage (`ezrab_dedai_mode`) lewat lapisan safe-storage
 * — model persistensi yang sama dengan store percakapan (tidak pernah
 * mengklaim sukses saat tulis gagal, tidak pernah menghapus data lama
 * untuk membebaskan ruang).
 *
 * Sengaja modul terpisah (bukan di dedMode.ts — modul itu TANPA IMPOR
 * dari `src` menurut doktrin headernya — dan bukan di dedModeUi.ts —
 * modul itu logika MURNI pemilih mode): I/O storage tinggal di sini.
 *
 * Nilai divalidasi lewat `isDedRabAiMode` (dedMode.ts): nilai tak
 * dikenal/absen → default C2 (`EZRAB_AI`). Tepat dua mode tetap
 * berlaku — persistensi tidak pernah memperkenalkan mode ketiga.
 */

import {
  DEFAULT_DED_RAB_AI_MODE,
  isDedRabAiMode,
  type DedRabAiMode,
} from './dedMode';
import { safeGetItem, safeSetItem } from '../../utils/safeStorage';

/** D-45 — localStorage key for the selected DED analysis mode. */
export const DED_AI_MODE_STORAGE_KEY = 'ezrab_dedai_mode';

export function loadPersistedDedMode(): DedRabAiMode {
  const raw = safeGetItem(DED_AI_MODE_STORAGE_KEY);
  return isDedRabAiMode(raw) ? raw : DEFAULT_DED_RAB_AI_MODE;
}

export function savePersistedDedMode(mode: DedRabAiMode): boolean {
  return safeSetItem(DED_AI_MODE_STORAGE_KEY, mode).ok;
}
