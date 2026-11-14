/**
 * dashboardInsight — hitungan "EZRAB Insight" yang JUJUR: diturunkan dari
 * item RAB nyata lintas proyek, bukan angka hardcode. Item dihitung bila
 * belum memiliki harga resmi: harga belum terisi (null), berstatus
 * PRICE_UNRESOLVED, atau sumber harganya masih referensi pasar / asumsi /
 * unresolved (bukan OFFICIAL_AHSP).
 */

import type { RabItem } from '../types';

export function isUnpricedOrReferenceItem(item: RabItem): boolean {
  if (item.unitPrice == null) return true;
  if (item.priceStatus === 'PRICE_UNRESOLVED') return true;
  const kind = item.priceSourceKind;
  return kind === 'MARKET_REFERENCE' || kind === 'EZRAB_ASSUMPTION' || kind === 'UNRESOLVED';
}

export function countUnpricedRabItems(items: RabItem[]): number {
  return items.reduce((acc, item) => acc + (isUnpricedOrReferenceItem(item) ? 1 : 0), 0);
}

/** Kalimat insight per bahasa antarmuka, selalu memakai hitungan nyata. */
export function unpricedInsightText(count: number, lang: string): string {
  switch (lang) {
    case 'en':
      return `${count} RAB items across your projects do not have an official price yet — still reference prices or unfilled.`;
    case 'zh':
      return `您所有项目中共有 ${count} 个 RAB 条目尚无正式价格——仍为参考价格或未填写。`;
    case 'ms':
      return `${count} item RAB merentas projek anda belum mempunyai harga rasmi — masih harga rujukan atau belum diisi.`;
    default:
      return `${count} item RAB di proyek Anda belum memiliki harga resmi — masih harga referensi atau belum terisi.`;
  }
}

/**
 * D-30 (Batch G2): prompt prefill untuk tombol "Lihat Analisis".
 * Membawa konteks hitungan nyata ke Chat AI (diisi sebagai initialPrompt
 * — TIDAK autosend; user meninjau & mengirim sendiri). Wording lintas
 * proyek (tanpa nama proyek) karena hitungannya mencakup semua proyek.
 * Hanya dipanggil bila count > 0 — tombolnya tidak dirender bila tidak
 * ada item tanpa harga resmi.
 */
export function unpricedAnalysisPrompt(count: number, lang: string): string {
  switch (lang) {
    case 'en':
      return `${count} RAB items across my projects do not have an official price yet — still reference prices or unfilled. Analyze which items have the biggest impact on the total estimate and suggest price-verification steps for each.`;
    case 'zh':
      return `我所有项目中共有 ${count} 个 RAB 条目尚无正式价格——仍为参考价格或未填写。请分析哪些条目对总估算影响最大，并为每条目建议价格核实步骤。`;
    case 'ms':
      return `${count} item RAB merentas projek saya belum mempunyai harga rasmi — masih harga rujukan atau belum diisi. Analisis item mana yang paling memberi kesan kepada jumlah anggaran dan cadangkan langkah pengesahan harga untuk setiap satu.`;
    default:
      return `${count} item RAB di proyek saya belum memiliki harga resmi — masih harga referensi atau belum terisi. Analisis item mana yang paling berdampak pada total estimasi dan sarankan langkah verifikasi harga untuk masing-masing.`;
  }
}
