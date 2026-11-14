/**
 * Batch F (D-73) — builder daftar Analisa Harga Satuan untuk Laporan.
 *
 * Diekstrak VERBATIM dari `LaporanView.allAhspItems` (cabang snapshot /
 * master-match / baris-proyek-langsung dipertahankan apa adanya) agar
 * populasinya dapat diuji tanpa React — dengan DUA perbaikan D-73:
 *
 * 1. POPULASI = BARIS PROYEK SAJA. Sebelumnya builder mendedup per kode
 *    (116 kode unik demo) lalu MENAMBAH seluruh `MASTER_AHSP_DATABASE`
 *    yang belum terlihat (39 item legacy Permen PUPR 2022, tidak ada
 *    hubungannya dengan proyek) → 155, sementara tab Analisa Estimator
 *    menghitung 154 BARIS berkode. Kini populasinya
 *    `getProjectAhspRows` (aturan yang sama dengan EstimatorAhspView):
 *    satu baris = satu analisa, tanpa dedup, tanpa tambahan master.
 *    Kedua permukaan kini sepakat soal jumlah DAN himpunan item.
 * 2. ID UNIK PER BARIS. Tanpa dedup, dua baris bisa cocok ke master yang
 *    sama (atau berbagi `snap.ahspId`) — id entri kini selalu
 *    `proj-<rabItemId>` agar kunci React carousel tetap unik.
 *
 * Catatan: cabang `matchedMaster` tetap memperkaya detail baris PROYEK
 * dari master bila kode/deskripsinya cocok — itu pengayaan detail,
 * bukan penambahan populasi. Item master yang tidak dipakai proyek
 * tidak pernah tampil di sini (rumahnya Penjelajah AHSP).
 */
import type { RabItem } from '../../types';
import { MASTER_AHSP_DATABASE } from '../../data/indonesianAHSP';
import { getProjectAhspRows } from './ahspCounting';

// Standardized AHSP Item interface for LaporanView
// NOTE: price/total boleh null (harga komponen belum tersedia) — JANGAN
// fallback ke 0; render menampilkan label "Harga belum diisi".
export interface AhspDetailViewItem {
  id: string;
  code: string;
  category: string;
  name: string;
  unit: string;
  regulationSource?: string;
  overheadPct: number;
  materials: Array<{ code: string; name: string; unit: string; coeff: number; price: number | null; total: number | null }>;
  labors: Array<{ code: string; name: string; unit: string; coeff: number; price: number | null; total: number | null }>;
  equipments: Array<{ code: string; name: string; unit: string; coeff: number; price: number | null; total: number | null }>;
}

/**
 * Bangun daftar detail analisa untuk baris-baris RAB proyek.
 * Satu entri per baris berkode (D-73); urutan mengikuti urutan RAB.
 */
export function buildReportAhspDetails(rabItems: readonly RabItem[] | null | undefined): AhspDetailViewItem[] {
  const list: AhspDetailViewItem[] = [];
  if (!rabItems || rabItems.length === 0) return list;

  // D-73: populasi kanonis — baris berkode proyek saja (tanpa dedup,
  // tanpa tambahan master legacy).
  for (const rItem of getProjectAhspRows(rabItems)) {
    const itemCode = rItem.ahspCode || rItem.code;
    // Check if snapshot exists
    if (rItem.ahspSnapshot) {
      const snap = rItem.ahspSnapshot;
      list.push({
        id: `proj-${rItem.id}`,
        code: snap.code || itemCode,
        category: rItem.category || 'Pekerjaan Proyek',
        name: snap.name || rItem.description,
        unit: snap.unit || rItem.unit || 'm²',
        regulationSource: snap.sourceDocument || 'Permen PUPR No. 1/PRT/M/2022',
        overheadPct: rItem.overheadPercent ?? 10,
        materials: (snap.materialComponents || []).map((m) => ({
          code: m.code || 'M.00',
          name: m.name,
          unit: m.unit,
          coeff: m.coefficient || 0,
          // null = harga belum tersedia: teruskan apa adanya, JANGAN jadi 0.
          price: m.unitPrice ?? null,
          total: m.total ?? (m.unitPrice != null ? (m.coefficient || 0) * m.unitPrice : null),
        })),
        labors: (snap.laborComponents || []).map((l) => ({
          code: l.code || 'L.00',
          name: l.name,
          unit: l.unit,
          coeff: l.coefficient || 0,
          price: l.unitPrice ?? null,
          total: l.total ?? (l.unitPrice != null ? (l.coefficient || 0) * l.unitPrice : null),
        })),
        equipments: (snap.equipmentComponents || []).map((e) => ({
          code: e.code || 'E.00',
          name: e.name,
          unit: e.unit,
          coeff: e.coefficient || 0,
          price: e.unitPrice ?? null,
          total: e.total ?? (e.unitPrice != null ? (e.coefficient || 0) * e.unitPrice : null),
        })),
      });
      continue;
    }

    // Check if master database has matching code or description
    const matchedMaster = itemCode
      ? MASTER_AHSP_DATABASE.find(
          (m) => m.code.toLowerCase() === itemCode.toLowerCase() || m.name.toLowerCase() === rItem.description.toLowerCase()
        )
      : undefined;
    if (matchedMaster) {
      list.push({
        id: `proj-${rItem.id}`,
        code: matchedMaster.code,
        category: matchedMaster.category,
        name: matchedMaster.name,
        unit: matchedMaster.unit,
        regulationSource: matchedMaster.regulationSource,
        overheadPct: 10,
        materials: (matchedMaster.materialComponents || []).map((m) => ({
          code: m.code,
          name: m.name,
          unit: m.unit,
          coeff: m.coefficient,
          price: m.unitPrice,
          total: m.total,
        })),
        labors: (matchedMaster.laborComponents || []).map((l) => ({
          code: l.code,
          name: l.name,
          unit: l.unit,
          coeff: l.coefficient,
          price: l.unitPrice,
          total: l.total,
        })),
        equipments: (matchedMaster.equipmentComponents || []).map((e) => ({
          code: e.code,
          name: e.name,
          unit: e.unit,
          coeff: e.coefficient,
          price: e.unitPrice,
          total: e.total,
        })),
      });
      continue;
    }

    // Tanpa komponen langsung: pakai HANYA harga komponen yang terekam
    // di item. Sebelumnya kekurangan itu ditambal pecahan karangan
    // 60/30/10 dari unitPrice — fabrikasi yang dihapus; komponen yang
    // tidak terekam tampil sebagai seksi kosong yang jujur.
    const matPrice = rItem.materialPrice ?? 0;
    const labPrice = rItem.laborPrice ?? 0;
    const eqPrice = rItem.equipmentPrice ?? 0;
    list.push({
      id: `proj-${rItem.id}`,
      code: itemCode,
      category: rItem.category || 'Pekerjaan Proyek',
      name: rItem.description,
      unit: rItem.unit || 'ls',
      regulationSource: 'Analisa Harga Satuan Proyek',
      overheadPct: rItem.overheadPercent ?? 10,
      materials: matPrice > 0 ? [
        { code: 'M.PROJ', name: `Bahan Utama & Pendukung (${rItem.description})`, unit: rItem.unit || 'unit', coeff: 1.0, price: matPrice, total: matPrice }
      ] : [],
      labors: labPrice > 0 ? [
        { code: 'L.PROJ', name: `Tenaga Kerja Konstruksi & Tukang`, unit: 'OH', coeff: 1.0, price: labPrice, total: labPrice }
      ] : [],
      equipments: eqPrice > 0 ? [
        { code: 'E.PROJ', name: `Alat Kerja & Operasional`, unit: 'Ls', coeff: 1.0, price: eqPrice, total: eqPrice }
      ] : [],
    });
  }

  return list;
}
