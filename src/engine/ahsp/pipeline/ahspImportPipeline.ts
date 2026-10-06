/**
 * EZRAB AHSP IMPORT PIPELINE
 * Versioned, deterministic ingestion pipeline from document structures to verified AHSP master.
 *
 * Pipeline Flow:
 * DOCUMENT -> PARSER -> NORMALIZER -> VALIDATOR -> AHSP MASTER & COMPONENTS -> RESOURCE MASTER -> IMPORT REPORT
 */

import { AHSPDefinition, AHSPComponentDefinition, AHSPDomain } from '../contracts/types';
import { AHSPNormalizationEngine } from '../normalization/ahspNormalization';
import { AHSPValidationEngine, AHSPValidationIssue } from '../validation/ahspValidation';
import { UnitEngine } from '../../calculatorCore/unit/unitEngine';

export interface RawDocumentInput {
  documentId: string;
  documentTitle: string;
  standardVersion: string;
  institution?: string;
  effectiveDate?: string;
  sourcePage?: number;
  domain: AHSPDomain;
  items: RawAHSPItemInput[];
}

export interface RawAHSPItemInput {
  rawCode: string;
  rawName: string;
  rawUnit: string;
  category?: string;
  subCategory?: string;
  sourcePage?: number;
  components: RawAHSPComponentInput[];
}

export interface RawAHSPComponentInput {
  type: 'labor' | 'material' | 'equipment';
  rawCode?: string;
  rawName: string;
  rawUnit: string;
  coefficient: number;
  specification?: string;
}

export interface ResourceMasterItem {
  id: string;
  code: string;
  nameOriginal: string;
  nameNormalized: string;
  category: 'labor' | 'material' | 'equipment';
  unit: string;
  compatibleUnits: string[];
}

export interface ImportReportItem {
  code: string;
  originalName: string;
  normalizedName: string;
  unit: string;
  status: 'VALID' | 'WARNING' | 'REJECTED';
  issues: AHSPValidationIssue[];
  componentCount: number;
}

export interface ImportPipelineReport {
  documentId: string;
  totalParsed: number;
  totalValid: number;
  totalRejected: number;
  totalWarnings: number;
  importedItems: ImportReportItem[];
  resourceMasterEntries: ResourceMasterItem[];
  timestamp: string;
}

export class AHSPImportPipeline {
  /**
   * Process a raw document payload through the full validation and normalization pipeline.
   */
  public static processDocument(doc: RawDocumentInput): {
    masterDefinitions: AHSPDefinition[];
    resourceMaster: ResourceMasterItem[];
    report: ImportPipelineReport;
  } {
    const masterDefinitions: AHSPDefinition[] = [];
    const resourceMasterMap = new Map<string, ResourceMasterItem>();
    const reportItems: ImportReportItem[] = [];

    let totalValid = 0;
    let totalRejected = 0;
    let totalWarnings = 0;

    for (const rawItem of doc.items) {
      // 1. Normalization Step
      const normalizedCode = AHSPNormalizationEngine.normalizeCode(rawItem.rawCode);
      const normalizedName = AHSPNormalizationEngine.normalizeText(rawItem.rawName);
      const normalizedUnit = AHSPNormalizationEngine.normalizeUnit(rawItem.rawUnit);

      // 2. Component processing & Resource Master generation
      const laborComponents: AHSPComponentDefinition[] = [];
      const materialComponents: AHSPComponentDefinition[] = [];
      const equipmentComponents: AHSPComponentDefinition[] = [];

      for (let i = 0; i < rawItem.components.length; i++) {
        const rc = rawItem.components[i];
        const normCompUnit = AHSPNormalizationEngine.normalizeUnit(rc.rawUnit);
        const normCompName = AHSPNormalizationEngine.normalizeText(rc.rawName);
        const compCode = rc.rawCode?.trim() || `${rc.type}_${i + 1}`;

        const compDef: AHSPComponentDefinition = {
          id: `${normalizedCode}_comp_${i + 1}`,
          type: rc.type,
          itemCode: compCode,
          itemName: rc.rawName.trim(),
          unit: normCompUnit,
          coefficient: rc.coefficient,
          specification: rc.specification,
          sourceDocument: doc.documentTitle,
        };

        if (rc.type === 'labor') laborComponents.push(compDef);
        else if (rc.type === 'material') materialComponents.push(compDef);
        else if (rc.type === 'equipment') equipmentComponents.push(compDef);

        // Populate Resource Master deterministically
        const resourceKey = `${rc.type}:${normCompName}`;
        if (!resourceMasterMap.has(resourceKey)) {
          const compUnitDef = UnitEngine.getUnit(normCompUnit);
          const compatibleUnits = compUnitDef?.aliases || [normCompUnit];
          resourceMasterMap.set(resourceKey, {
            id: `RES_${resourceMasterMap.size + 1}`,
            code: compCode,
            nameOriginal: rc.rawName.trim(),
            nameNormalized: normCompName,
            category: rc.type,
            unit: normCompUnit,
            compatibleUnits,
          });
        }
      }

      // Build target AHSP Definition
      const definition: AHSPDefinition = {
        id: `AHSP_${normalizedCode.replace(/[^A-Za-z0-9_]/g, '_')}`,
        code: rawItem.rawCode.trim(),
        codeNormalized: normalizedCode,
        name: rawItem.rawName.trim(),
        unit: normalizedUnit,
        domain: doc.domain,
        category: rawItem.category || '',
        subCategory: rawItem.subCategory,
        version: doc.standardVersion,
        sourceDocument: doc.documentTitle,
        laborComponents,
        materialComponents,
        equipmentComponents,
        totalLaborCoefficient: AHSPNormalizationEngine.sumCoefficients(laborComponents),
        totalMaterialCoefficient: AHSPNormalizationEngine.sumCoefficients(materialComponents),
        totalEquipmentCoefficient: AHSPNormalizationEngine.sumCoefficients(equipmentComponents),
        provenance: {
          sourceDocument: doc.documentTitle,
          documentNumber: doc.documentId,
          version: doc.standardVersion,
          institution: doc.institution || 'Kementerian PUPR',
          effectiveDate: doc.effectiveDate || '2026-01-01',
          sourcePage: rawItem.sourcePage || doc.sourcePage,
          // §26 fail-closed: status is decided by the validation engine below,
          // never asserted up-front. Default to REVIEW until proven VERIFIED.
          verificationStatus: 'REVIEW',
        },
      };

      // 3. Validation Step
      const valResult = AHSPValidationEngine.validateDefinition(definition);

      const hasError = valResult.issues.some((i) => i.severity === 'ERROR');
      const hasWarn = valResult.issues.some((i) => i.severity === 'WARNING');

      if (hasError) {
        totalRejected++;
        reportItems.push({
          code: definition.code,
          originalName: definition.name,
          normalizedName,
          unit: definition.unit,
          status: 'REJECTED',
          issues: valResult.issues,
          componentCount: rawItem.components.length,
        });
      } else {
        totalValid++;
        if (hasWarn) totalWarnings++;
        masterDefinitions.push(definition);
        reportItems.push({
          code: definition.code,
          originalName: definition.name,
          normalizedName,
          unit: definition.unit,
          status: hasWarn ? 'WARNING' : 'VALID',
          issues: valResult.issues,
          componentCount: rawItem.components.length,
        });
      }
    }

    const report: ImportPipelineReport = {
      documentId: doc.documentId,
      totalParsed: doc.items.length,
      totalValid,
      totalRejected,
      totalWarnings,
      importedItems: reportItems,
      resourceMasterEntries: Array.from(resourceMasterMap.values()),
      timestamp: new Date().toISOString(),
    };

    return {
      masterDefinitions,
      resourceMaster: Array.from(resourceMasterMap.values()),
      report,
    };
  }
}
