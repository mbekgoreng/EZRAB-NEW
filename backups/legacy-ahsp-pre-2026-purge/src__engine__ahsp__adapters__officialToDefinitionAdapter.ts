/**
 * Adapter: OfficialAHSPItem → AHSPDefinition
 *
 * Bridges the official extraction dataset (binaMargaAHSP2026Official)
 * with the existing CostCompositionEngine which expects AHSPDefinition.
 *
 * Design decisions:
 * - Coefficients come from the official document (preserved as printed).
 * - Prices on components are the document's example prices (reference only).
 * - The adapter does NOT invent prices; consumers must resolve regional
 *   prices via PriceResolver at runtime.
 * - UNREADABLE items are rejected at adapter level (coefficients unreliable).
 * - DEGRADED items are allowed but carry a warning.
 */

import { AHSPDefinition, AHSPComponentDefinition, AHSPProvenanceMetadata } from '../contracts/types';
import { OfficialAHSPItem, OfficialAHSPComponent, ItemReadability } from '../../../data/nationalCostDatabase/binaMargaAHSP2026OfficialTypes';

export interface AdapterResult {
  definition: AHSPDefinition | null;
  warning?: string;
  error?: string;
}

function mapComponent(c: OfficialAHSPComponent): AHSPComponentDefinition {
  return {
    id: c.id,
    type: c.componentType === 'TENAGA' ? 'labor' : c.componentType === 'BAHAN' ? 'material' : 'equipment',
    itemCode: c.code || c.id,
    itemName: c.name,
    unit: c.unit,
    coefficient: c.coefficient,
    specification: undefined,
    sourceDocument: undefined,
    notes: `readability=${c.readability}; raw="${c.raw}"`,
  };
}

function buildProvenance(item: OfficialAHSPItem): AHSPProvenanceMetadata {
  return {
    sourceDocument: item.sourceDocument,
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026',
    documentYear: 2026,
    version: item.version,
    sourcePage: item.headerPage,
    institution: 'Kementerian PUPR — Direktorat Jenderal Bina Marga',
    effectiveDate: '2026-02-20',
    verificationStatus: item.status,
  };
}

export function adaptOfficialToDefinition(item: OfficialAHSPItem): AdapterResult {
  if (item.readability === 'UNREADABLE') {
    return {
      definition: null,
      error: `AHSP ${item.code} (${item.name}) is UNREADABLE — coefficients cannot be trusted.`,
    };
  }

  const laborComponents = item.laborComponents.map(mapComponent);
  const materialComponents = item.materialComponents.map(mapComponent);
  const equipmentComponents = item.equipmentComponents.map(mapComponent);

  const totalLaborCoefficient = laborComponents.reduce((s, c) => s + c.coefficient, 0);
  const totalMaterialCoefficient = materialComponents.reduce((s, c) => s + c.coefficient, 0);
  const totalEquipmentCoefficient = equipmentComponents.reduce((s, c) => s + c.coefficient, 0);

  const definition: AHSPDefinition = {
    id: item.id,
    code: item.code,
    codeNormalized: item.codeNormalized,
    name: item.name,
    unit: item.unit,
    domain: item.domain,
    category: item.category,
    subCategory: undefined,
    version: item.version,
    year: item.year,
    sourceDocument: item.sourceDocument,
    laborComponents,
    materialComponents,
    equipmentComponents,
    totalLaborCoefficient,
    totalMaterialCoefficient,
    totalEquipmentCoefficient,
    provenance: buildProvenance(item),
    aliases: [item.codeNormalized],
    notes: `readability=${item.readability}; analisaPage=${item.analisaPage}; numberFormat=${item.numberFormat}; warnings=[${item.warnings.join('; ')}]`,
  };

  const warning = item.readability === 'DEGRADED'
    ? `AHSP ${item.code} has DEGRADED readability — some coefficients are TINY_COEF (<0.001).`
    : undefined;

  return { definition, warning };
}
