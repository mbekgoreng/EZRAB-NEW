/**
 * api/_lib/modelMasking.js — SATU sumber kebenaran untuk alias tampil
 * model/provider AI EZRAB (program masking nama model, 2026-11-16).
 *
 * Keputusan koordinator (jangan diubah tanpa keputusan baru):
 * - mode 'fast' / 'chat' / 'vision' -> `Ezrab-flash-v1`
 * - mode 'advanced' / 'ded'         -> `Ezrab-pro`
 * - field provider di respons klien -> nilai netral `ezrab`
 *
 * Nama model/provider ASLI hanya hidup di sisi server (rantai failover,
 * log, ledger, metering) — TIDAK PERNAH melewati batas HTTP ke klien.
 * Modul ini tanpa dependensi agar bisa diimpor dari handler mana pun
 * tanpa risiko siklus impor.
 */

export const EZRAB_MODEL_FLASH = 'Ezrab-flash-v1';
export const EZRAB_MODEL_PRO = 'Ezrab-pro';
export const EZRAB_PROVIDER_DISPLAY = 'ezrab';

/**
 * Alias tampil untuk satu mode rantai gateway. Mode tak dikenal jatuh
 * ke alias flash (mode liar sudah di-clamp ke 'fast' oleh validator
 * input; default ini hanya jaring pengaman, bukan jalur normal).
 */
export function modelAliasForMode(mode) {
  return mode === 'advanced' || mode === 'ded' ? EZRAB_MODEL_PRO : EZRAB_MODEL_FLASH;
}

/**
 * Alias tampil untuk satu baris riwayat pemakaian (GET /api/credits/usage).
 * Data tersimpan di ledger TETAP nama asli (untuk debugging/audit) —
 * yang disamarkan hanya nilai yang dikembalikan ke klien.
 *
 * Urutan pemetaan:
 * 1. Kunci fitur operasi (sinyal tier paling tepercaya — ditulis adapter
 *    metering server-side saat operasi dibuat):
 *    - 'chat-ai/fast'            -> Ezrab-flash-v1
 *    - 'chat-ai/advanced'        -> Ezrab-pro
 *    - 'ded-ai/simple'           -> Ezrab-flash-v1 (DED FAST -> mode 'fast';
 *                                   usageMetadata.ts:107 memetakan FAST ke simple)
 *    - 'ded-ai/medium|complex|full-ai' -> Ezrab-pro (DED DETAIL -> mode 'ded')
 *    - 'ai-document/*'           -> Ezrab-flash-v1 (Document AI via mode 'fast';
 *                                   kunci nyata 'ai-document/analysis')
 *    Kunci bare legacy 'ded-ai'/'ai-document' AMBIGU (LEGACY_AMBIGUOUS_FEATURE_KEYS
 *    di aiMetering.js) — TIDAK dipetakan di sini, jatuh ke fallback nama model.
 * 2. Fallback peta balik nama model (hanya bila fitur absen/tak dikenal —
 *    operasi legacy atau dibuat manual tanpa fitur):
 *    - model yang HANYA melayani rantai pro -> Ezrab-pro
 *    - model yang HANYA melayani rantai flash -> Ezrab-flash-v1
 *    - model AMBIGU (melayani kedua tier, mis. model Crown/ArxPay) atau
 *      nama tak dikenal -> null (jujur "tier tak dapat ditentukan dari
 *      nama saja"; JANGAN menebak tier — aturan tanpa-fabrikasi).
 */
// Sengaja TIDAK di sini: 'cx/gpt-6-luna' + 'ag/gemini-3.8-flash-high'
// (Atmo advanced dipakai rantai chat/flash JUGA advanced/ded/pro) dan
// 'gemini-3.5-flash-lite' (FAST_MODEL — fallback di SEMUA mode) — ketiganya
// AMBIGU, jadi jatuh ke null.
const PRO_ONLY_MODELS = new Set([
  'gpt-6-luna',
  'muse-spark-1.3-contributor',
  'wz/gpt-6-luna',
  'wz/deepseek-v4.1-flash',
]);

const FLASH_ONLY_MODELS = new Set([
  'weizerouter-v2',
  'kimi-k2.7',
  'kimi-k2.6',
  'atmo/deepseek-v4.1-flash',
  'ali/deepseek-v4.1-flash',
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4',
  // Ekor chat + fast saja (keduanya tier flash) — tidak pernah di pro:
  'Atria-Dawn-Preview',
  'gemini-3.8-flash',
]);

export function maskUsageHistoryModel({ feature, model } = {}) {
  const f = typeof feature === 'string' ? feature : '';
  if (f === 'chat-ai/advanced') return EZRAB_MODEL_PRO;
  if (f === 'chat-ai/fast') return EZRAB_MODEL_FLASH;
  if (f === 'ded-ai/simple') return EZRAB_MODEL_FLASH;
  if (f === 'ded-ai/medium' || f === 'ded-ai/complex' || f === 'ded-ai/full-ai') return EZRAB_MODEL_PRO;
  if (f.startsWith('ai-document/')) return EZRAB_MODEL_FLASH;
  const m = typeof model === 'string' ? model : '';
  if (!m) return null;
  if (PRO_ONLY_MODELS.has(m)) return EZRAB_MODEL_PRO;
  if (FLASH_ONLY_MODELS.has(m)) return EZRAB_MODEL_FLASH;
  return null;
}
