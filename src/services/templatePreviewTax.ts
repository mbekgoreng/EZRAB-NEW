/**
 * templatePreviewTax — pajak untuk preview template (katalog & konfigurator).
 *
 * Kebijakan pajak opt-in (owner 2026-10-27) berlaku juga untuk preview
 * template: pajak HANYA dihitung bila `taxEnabled === true` pada setting
 * estimasi global. Persentase yang tersimpan (termasuk 11) bukan bukti
 * pajak aktif. Bila tidak aktif, pajak = 0 dan total = basis pajak.
 *
 * Dipisahkan dari komponen agar bisa diuji tanpa me-mount React.
 */
export interface TemplateTaxSettings {
  taxEnabled?: boolean;
  taxPercent?: number;
}

export function templatePreviewTax(taxBase: number, settings: TemplateTaxSettings | null | undefined): number {
  if (settings?.taxEnabled !== true) return 0;
  return Math.round(taxBase * ((settings.taxPercent ?? 11) / 100));
}
