/**
 * ahspItemDisplay — resolusi tampilan satu item RAB menjadi analisa AHSP
 * (snapshot item vs katalog resmi + resolver harga 2026).
 *
 * Diekstrak VERBATIM dari EstimatorAhspView (pola mobileV3Utils: fungsi
 * murni ke modul sendiri) agar presentasi native mobile (MobileAhspProyek)
 * memakai resolusi yang SAMA PERSIS — snapshot didahulukan, katalog resmi
 * jadi sandaran, badge status & penanda basi (F-11) tidak berubah.
 */
import type { RabItem } from "../../types";
import { officialAhspRepository } from "../../data/nationalCostDatabase/officialAhspRepository";
import { priceResolver2026 } from "../../data/priceDatabase2026/resolver";
import { getAhspDirectPrice } from "../../data/priceDatabase2026/ahspDisplayPolicy";

export interface AhspDisplayComponent {
  name: string;
  unit: string;
  coefficient: number;
  unitPrice: number | null;
}

export interface AhspItemDisplay {
  snap: RabItem["ahspSnapshot"];
  code: string;
  matchOfficial: ReturnType<typeof officialAhspRepository.getOfficialAhsp>;
  resolvedOfficial: ReturnType<typeof priceResolver2026.resolveAhspUnitPrice> | null;
  unitPrice: number | null;
  storedPrice: number | null;
  catalogPrice: number | null;
  statusBadge: string;
  isStale: boolean;
  materials: AhspDisplayComponent[];
  labors: AhspDisplayComponent[];
  equipments: AhspDisplayComponent[];
}

export function resolveAhspItemDisplay(item: RabItem): AhspItemDisplay {
  const snap = item.ahspSnapshot;
  const code = item.code || item.ahspCode || "A.HSP";

  const matchOfficial = officialAhspRepository.getOfficialAhsp(code);
  const resolvedOfficial = matchOfficial ? priceResolver2026.resolveAhspUnitPrice(matchOfficial) : null;
  const unitPrice = (item.unitPrice && item.unitPrice > 0) ? item.unitPrice : (resolvedOfficial?.unitPrice ?? (item.unitPrice ?? null));
  // F-11: badge status + sumber + penanda basi. Harga tampil TIDAK
  // diubah (tetap mengutamakan harga tersimpan item) — hanya diberi label.
  const storedPrice = (item.unitPrice && item.unitPrice > 0) ? item.unitPrice : null;
  const catalogPrice = resolvedOfficial ? (getAhspDirectPrice(resolvedOfficial) ?? resolvedOfficial.unitPrice ?? null) : null;
  const statusBadge = !matchOfficial ? 'MISSING' : (resolvedOfficial?.pricingStatus ?? 'MISSING');
  const isStale = storedPrice != null && catalogPrice != null && storedPrice !== catalogPrice;

  const materials = (snap?.materialComponents && snap.materialComponents.length > 0)
    ? snap.materialComponents
    : (resolvedOfficial ? resolvedOfficial.material.components.map((c) => ({ name: c.itemName, unit: c.unit, coefficient: c.coefficient, unitPrice: c.unitPrice })) : []);
  const labors = (snap?.laborComponents && snap.laborComponents.length > 0)
    ? snap.laborComponents
    : (resolvedOfficial ? resolvedOfficial.labor.components.map((c) => ({ name: c.itemName, unit: c.unit, coefficient: c.coefficient, unitPrice: c.unitPrice })) : []);
  const equipments = (snap?.equipmentComponents && snap.equipmentComponents.length > 0)
    ? snap.equipmentComponents
    : (resolvedOfficial ? resolvedOfficial.equipment.components.map((c) => ({ name: c.itemName, unit: c.unit, coefficient: c.coefficient, unitPrice: c.unitPrice })) : []);

  return {
    snap,
    code,
    matchOfficial,
    resolvedOfficial,
    unitPrice,
    storedPrice,
    catalogPrice,
    statusBadge,
    isStale,
    materials: materials as AhspDisplayComponent[],
    labors: labors as AhspDisplayComponent[],
    equipments: equipments as AhspDisplayComponent[],
  };
}
