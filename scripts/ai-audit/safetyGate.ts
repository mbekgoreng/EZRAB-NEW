/**
 * SAFETY GATE — klasifikasi risiko perubahan untuk sistem perbaikan otonom.
 *
 * Aturan (Phase 7 prompt Autonomous AI Engineering):
 * - Perubahan pada data resmi AHSP, mesin keuangan, aturan konversi,
 *   billing/langganan, pembayaran, auth, skema DB, dan deployment produksi
 *   WAJIB persetujuan manusia — agen otonom tidak pernah menerapkannya.
 * - Perubahan lain (prompt, intent, state percakapan, matching, format
 *   jawaban, cakupan tes, observabilitas) boleh disiapkan otonom sebagai
 *   kandidat patch terisolasi — tetap tanpa merge/push tanpa otorisasi.
 */

export type ChangeRisk = 'AUTO_CANDIDATE' | 'APPROVAL_REQUIRED' | 'FORBIDDEN_AUTONOMOUS';

const APPROVAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /src\/data\/ahsp2026|master.*\.json|officialAhsp/i, reason: 'Data resmi AHSP' },
  { re: /unifiedProjectEngine|SafeDecimal|formulaEngine|priceIntegrity|canonicalPriceResolver/i, reason: 'Mesin keuangan / aturan hitung' },
  { re: /unitConversion|konversi/i, reason: 'Aturan konversi satuan' },
  { re: /src\/billing|ai-credits\/(config|mockAdapter|tokenMetering)|creditLedger|plans\.ts/i, reason: 'Billing, langganan, atau metering kredit' },
  { re: /payment|midtrans|stripe|gateway.*pay/i, reason: 'Pemrosesan pembayaran' },
  { re: /auth|supabase|middleware\.ts|access.*gate/i, reason: 'Autentikasi / otorisasi / gerbang akses' },
  { re: /supabase\/|migrations?\//i, reason: 'Skema database / migrasi' },
  { re: /vercel\.json|production/i, reason: 'Konfigurasi deployment produksi' },
];

const FORBIDDEN_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /priceDatabase2026\/(data|master)/i, reason: 'Rekaman harga resmi tidak boleh diubah otonom' },
];

export function classifyChange(path: string): { risk: ChangeRisk; reason: string } {
  for (const p of FORBIDDEN_PATTERNS) {
    if (p.re.test(path)) return { risk: 'FORBIDDEN_AUTONOMOUS', reason: p.reason };
  }
  for (const p of APPROVAL_PATTERNS) {
    if (p.re.test(path)) return { risk: 'APPROVAL_REQUIRED', reason: p.reason };
  }
  return { risk: 'AUTO_CANDIDATE', reason: 'Di luar kategori persetujuan wajib' };
}

export function classifyChanges(paths: string[]): {
  overall: ChangeRisk;
  detail: Array<{ path: string; risk: ChangeRisk; reason: string }>;
} {
  const detail = paths.map((path) => ({ path, ...classifyChange(path) }));
  const overall: ChangeRisk = detail.some((d) => d.risk === 'FORBIDDEN_AUTONOMOUS')
    ? 'FORBIDDEN_AUTONOMOUS'
    : detail.some((d) => d.risk === 'APPROVAL_REQUIRED')
      ? 'APPROVAL_REQUIRED'
      : 'AUTO_CANDIDATE';
  return { overall, detail };
}
