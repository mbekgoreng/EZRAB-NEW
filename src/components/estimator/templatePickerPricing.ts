/**
 * Harga + volume untuk tab "Dari Template" di SmartAddWorkItemModal.
 *
 * Masalah yang diperbaiki (audit picker template 2026-10-26):
 * - Picker lama membaca harga HANYA dari `ahspCandidates[0].unitPriceEstimate`
 *   — field yang tidak pernah diisi di ketujuh template master (0 kemunculan)
 *   — sehingga semua item tampil "Belum ada harga".
 * - Volume lama dipatok 1 (defaultVol), mengabaikan quantityRule template.
 * - Item yang ditambahkan dicap VERIFIED + volumeSource 'AHSP 2026' padahal
 *   harga kosong dan volume cuma angka 1.
 *
 * Perilaku baru: satu sumber kebenaran = ParametricVolumeEngine (mesin yang
 * sama dengan jalur katalog Template RAB). Mesin menghitung volume dari
 * quantityRule + parameter default template, dan menyelesaikan harga lewat
 * resolveUnitPrice: katalog resmi dulu, lalu benchmark fallback, lalu null.
 *
 * KEJUJURAN HARGA (jangan dilonggarkan):
 * - Harga BENCHMARK adalah estimasi indikatif, BUKAN harga resmi AHSP 2026
 *   (mesin sendiri menandainya isFabricated: true) → priceStatus
 *   PRICE_ESTIMATED + label "(est.)" di UI, dan verificationStatus
 *   NEEDS_VERIFICATION (bukan VERIFIED).
 * - Kode yang tidak terpetakan di mesin TETAP null = "Belum ada harga",
 *   bukan karangan. Yang sudah dikoreksi ke padanan resmi 2026 di file
 *   template (2026-10-26): plesteran 1:4 → 3.7.4, keramik lantai KM 20x20
 *   → 3.9.8.9 (Unpolished), jalan: clearing → C.37, agregat kelas A →
 *   E.1, rigid fs 4,5 → E.11. Yang masih tanpa padanan dan tetap kosong:
 *   sloof/kolom/ring balok (A.4.1.1.28/35/36 — item komposit, perlu
 *   rakitan beton+bekisting+pembesian), kloset (A.5.1.1.2 — ambigu
 *   jongkok/duduk dalam satu item), wiremesh jalan (BM.5.3.1.5) dan
 *   joint sealant jalan (BM.5.3.1.8 — tidak ada item mandiri padanannya
 *   di master Bina Marga). Memetakan sisanya adalah pekerjaan pemetaan
 *   terpisah, bukan bagian dari helper ini.
 * - Volume dari parameter DEFAULT template (mis. T36 = 6×6 m). Bukan volume
 *   proyek pengguna — UI wajib menampilkan catatan itu, dan spreadsheet
 *   tetap tempat penyesuaiannya.
 * - Bila mesin gagal (template tak dikenal, dsb.), helper mengembalikan
 *   fallback perilaku lama (volume 1, harga baked/null) agar tab tidak crash.
 */

import { ParametricVolumeEngine } from '../../engine/parametricVolumeEngine/parametricVolumeEngine';
import type {
  MasterBuildingTemplate,
  TemplateWorkItem,
} from '../../data/buildingTemplates/schema/types';
import type { PriceStatus } from '../../types';

export type TemplatePickerPriceKind = 'OFFICIAL' | 'BENCHMARK' | 'UNAVAILABLE';

export interface TemplatePickerItemPricing {
  /** Volume hitung mesin, atau 1 bila mesin gagal (fallback perilaku lama). */
  volume: number;
  /** Harga satuan, atau null bila tidak terpetakan. */
  unitPrice: number | null;
  priceStatus: PriceStatus;
  priceKind: TemplatePickerPriceKind;
  /** false = fallback (mesin gagal), bukan hasil hitung mesin. */
  engineOk: boolean;
}

function fallbackPricing(item: TemplateWorkItem): TemplatePickerItemPricing {
  const baked = item.ahspCandidates?.[0]?.unitPriceEstimate ?? null;
  return {
    volume: 1,
    unitPrice: baked,
    priceStatus: baked == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED',
    priceKind: 'UNAVAILABLE',
    engineOk: false,
  };
}

export function resolveTemplatePickerPricing(
  template: MasterBuildingTemplate | null | undefined,
): Map<string, TemplatePickerItemPricing> {
  const out = new Map<string, TemplatePickerItemPricing>();
  const workItems = template?.workItems ?? [];
  if (workItems.length === 0) return out;

  for (const item of workItems) out.set(item.stableId, fallbackPricing(item));

  try {
    const engine = new ParametricVolumeEngine();
    const result = engine.generateRABFromTemplate({
      templateId: template!.id,
      parameters: {},
    });
    const engineItems: any[] = Array.isArray((result as any)?.workItems)
      ? (result as any).workItems
      : [];
    if (engineItems.length === 0) return out;

    // Padanan: kode AHSP dulu (unik di T36), lalu posisi sebagai fallback.
    const byCode = new Map<string, any>();
    for (const eng of engineItems) {
      if (eng?.ahspCode && !byCode.has(eng.ahspCode)) byCode.set(eng.ahspCode, eng);
    }

    workItems.forEach((item, idx) => {
      const code =
        item.defaultAhspCode ?? item.ahspCandidates?.[0]?.ahspCode ?? '';
      const eng = (code ? byCode.get(code) : undefined) ?? engineItems[idx];
      if (!eng) return;
      const volume =
        typeof eng.quantity === 'number' && Number.isFinite(eng.quantity) && eng.quantity > 0
          ? eng.quantity
          : 1;
      const unitPrice =
        typeof eng.unitPrice === 'number' && Number.isFinite(eng.unitPrice) && eng.unitPrice > 0
          ? eng.unitPrice
          : null;
      const kind: TemplatePickerPriceKind =
        eng.priceStatus === 'BENCHMARK'
          ? 'BENCHMARK'
          : eng.priceStatus === 'OFFICIAL'
            ? 'OFFICIAL'
            : 'UNAVAILABLE';
      out.set(item.stableId, {
        volume,
        unitPrice,
        priceStatus:
          unitPrice == null
            ? 'PRICE_UNRESOLVED'
            : kind === 'BENCHMARK'
              ? 'PRICE_ESTIMATED'
              : 'PRICE_RESOLVED',
        priceKind: kind,
        engineOk: true,
      });
    });
  } catch {
    // Fallback perilaku lama sudah terisi di atas — tab tetap jalan.
  }
  return out;
}
