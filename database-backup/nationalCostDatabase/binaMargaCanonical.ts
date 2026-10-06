/**
 * BINA MARGA AHSP 2026 — CANONICAL VIEW
 * =====================================
 *
 * Presents the canonical Bina Marga slice of the AHSP 2026 catalog in the
 * `OfficialAHSPItem` shape expected by the cost/pricing pipeline
 * (CostPolicyEngine, ScopeBasedCostCalculator).
 *
 * This is a DERIVED, PURE PROJECTION of `AHSP_2026_CANONICAL`:
 *   - no price is invented (unitPrice / totals are null — price-free master);
 *   - no coefficient is changed;
 *   - readability is a deterministic function of the coefficient values;
 *   - warnings are the pipeline validation issues, verbatim.
 *
 * Source: Lampiran **V** SE DJBK No. 47/SE/Dk/2026 (Bina Marga).
 */

import { AHSP_2026_CANONICAL } from './ahsp2026Canonical.generated';
import { NationalAHSPItem } from './types';
import {
  OfficialAHSPItem,
  OfficialAHSPComponent,
  CoefficientReadability,
  ItemReadability,
} from './binaMargaOfficialTypes';
import { AHSPComponent } from '../../types';

function componentReadability(coefficient: number): CoefficientReadability {
  if (!Number.isFinite(coefficient) || coefficient === 0) return 'LOST_COEF';
  if (Math.abs(coefficient) < 0.001) return 'TINY_COEF';
  return 'OK';
}

function toOfficialComponent(
  c: AHSPComponent,
  index: number,
  componentType: 'TENAGA' | 'BAHAN' | 'PERALATAN'
): OfficialAHSPComponent {
  return {
    ...c,
    index,
    componentType,
    readability: componentReadability(c.coefficient),
    raw: c.rawLine ?? '',
  };
}

function toOfficialItem(item: NationalAHSPItem): OfficialAHSPItem {
  const labor = (item.laborComponents || []).map((c, i) => toOfficialComponent(c, i + 1, 'TENAGA'));
  const material = (item.materialComponents || []).map((c, i) => toOfficialComponent(c, i + 1, 'BAHAN'));
  const equipment = (item.equipmentComponents || []).map((c, i) => toOfficialComponent(c, i + 1, 'PERALATAN'));

  const hasAnalisa = labor.length + material.length + equipment.length > 0;
  const readability: ItemReadability =
    item.coefficientReadability === 'OK' ? 'OK'
      : item.coefficientReadability === 'DEGRADED' ? 'DEGRADED'
        : 'UNREADABLE';

  return {
    id: item.id,
    code: item.code,
    codeNormalized: item.codeNormalized,
    name: item.name,
    unit: item.unit,
    domain: item.domain,
    category: item.category,
    version: item.version,
    year: item.year,
    normativeStatus: item.normativeStatus,
    method: item.method,
    sourceDocument: item.sourceDocument,
    headerPage: item.sourcePage ?? item.provenance?.page ?? 0,
    analisaPage: hasAnalisa ? (item.sourcePage ?? item.provenance?.page ?? null) : null,
    numberFormat: null,
    status: item.status,
    laborComponents: labor,
    materialComponents: material,
    equipmentComponents: equipment,
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    totalABC: null,
    overheadProfitPercent: null,
    overheadProfitAmount: null,
    unitPrice: null,
    readability,
    warnings: item.validationIssues ?? [],
    lastUpdated: item.lastUpdated,
    dataQualityScore: item.dataQualityScore,
  };
}

/** Canonical Bina Marga items (Lampiran V), projected to the OfficialAHSPItem shape. */
export const BINA_MARGA_AHSP_2026_OFFICIAL: OfficialAHSPItem[] =
  AHSP_2026_CANONICAL.filter((i) => i.domain === 'BINA_MARGA').map(toOfficialItem);

/** All canonical items projected to the OfficialAHSPItem shape (any field). */
export const ALL_CANONICAL_OFFICIAL_VIEW: OfficialAHSPItem[] =
  AHSP_2026_CANONICAL.map(toOfficialItem);
