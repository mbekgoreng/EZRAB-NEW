/**
 * EZRAB CALCULATOR CORE — PROVENANCE ENGINE
 * Immutable formula lineage, workbook source mapping, and verification status tracking.
 */

import { FormulaProvenance, ReadinessStatus, FormulaSourceType } from '../contracts/types';

export const MASTER_WORKBOOK_NAME = 'EZRAB_VOLUME_CALCULATOR_MASTER.xlsx';
export const MASTER_WORKBOOK_SHA256 = 'BC350C1E9D7CF298FCD4C865A7A35F359C0BA71444647A593F98E37B239B7C28';

export class ProvenanceEngine {
  /**
   * Create a standard formula provenance record for an Excel workbook reference.
   */
  public static createExcelProvenance(options: {
    calculatorId: string;
    calculatorVersion: string;
    formulaId: string;
    mathematicalExpression: string;
    sheet: string;
    cell?: string;
    status?: ReadinessStatus;
    testVectorIds?: string[];
    notes?: string;
  }): FormulaProvenance {
    return {
      calculatorId: options.calculatorId,
      calculatorVersion: options.calculatorVersion,
      formulaId: options.formulaId,
      mathematicalExpression: options.mathematicalExpression,
      sourceType: 'excel_reference',
      workbook: MASTER_WORKBOOK_NAME,
      sheet: options.sheet,
      cell: options.cell,
      sourceHash: MASTER_WORKBOOK_SHA256,
      testVectorIds: options.testVectorIds || [],
      status: options.status || 'PARTIALLY_VERIFIED',
      notes: options.notes,
    };
  }

  /**
   * Create an unverified or implementation-only provenance record.
   */
  public static createImplementationProvenance(options: {
    calculatorId: string;
    calculatorVersion: string;
    formulaId: string;
    mathematicalExpression: string;
    status?: ReadinessStatus;
    notes?: string;
  }): FormulaProvenance {
    return {
      calculatorId: options.calculatorId,
      calculatorVersion: options.calculatorVersion,
      formulaId: options.formulaId,
      mathematicalExpression: options.mathematicalExpression,
      sourceType: 'implementation_only',
      status: options.status || 'UNVERIFIED',
      notes: options.notes || 'Implementation derived from standard geometric rules, pending Excel vector evaluation.',
    };
  }

  /**
   * Create a verified reference provenance record (e.g. SNI, Bina Marga, standard geometric textbook).
   */
  public static createVerifiedReferenceProvenance(options: {
    calculatorId: string;
    calculatorVersion: string;
    formulaId: string;
    mathematicalExpression: string;
    referenceName: string;
    sectionOrClause?: string;
    status?: ReadinessStatus;
    notes?: string;
  }): FormulaProvenance {
    return {
      calculatorId: options.calculatorId,
      calculatorVersion: options.calculatorVersion,
      formulaId: options.formulaId,
      mathematicalExpression: options.mathematicalExpression,
      sourceType: 'verified_reference',
      workbook: options.referenceName,
      sheet: options.sectionOrClause,
      status: options.status || 'VERIFIED',
      notes: options.notes,
    };
  }
}
