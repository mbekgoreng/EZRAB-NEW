/**
 * EZRAB AHSP DOMAIN — CONTRACTS & TYPES
 * Strongly typed definitions for Indonesian Construction Analysis (AHSP).
 */

export type AHSPComponentType = 'labor' | 'material' | 'equipment';

export type AHSPVerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'REVIEW' | 'ACTIVE' | 'DEPRECATED';

export type AHSPDomain =
  | 'SUMBER_DAYA_AIR'
  | 'BINA_MARGA'
  | 'CIPTA_KARYA'
  | 'SMKK'
  | 'UMUM'
  | 'CUSTOM';

export interface AHSPProvenanceMetadata {
  sourceDocument: string;
  documentNumber?: string;
  documentYear?: number;
  version: string;
  sourcePage?: number;
  institution?: string;
  effectiveDate?: string;
  verificationStatus: AHSPVerificationStatus;
}

export interface AHSPComponentDefinition {
  id: string;
  type: AHSPComponentType;
  itemCode: string;
  itemName: string;
  unit: string;
  coefficient: number;
  specification?: string;
  sourceDocument?: string;
  notes?: string;
}

export interface AHSPDefinition {
  id: string;
  code: string;
  codeNormalized: string;
  name: string;
  unit: string;
  domain: AHSPDomain;
  category: string;
  subCategory?: string;
  version: string;
  year?: number;
  sourceDocument: string;
  laborComponents: AHSPComponentDefinition[];
  materialComponents: AHSPComponentDefinition[];
  equipmentComponents: AHSPComponentDefinition[];
  totalLaborCoefficient: number;
  totalMaterialCoefficient: number;
  totalEquipmentCoefficient: number;
  provenance: AHSPProvenanceMetadata;
  aliases?: string[];
  notes?: string;
}

export type AHSPResolutionStatus =
  | 'EXACT_MATCH'
  | 'NORMALIZED_MATCH'
  | 'ALIAS_MATCH'
  | 'AMBIGUOUS'
  | 'AMBIGUOUS_AHSP'
  | 'AHSP_NOT_FOUND'
  | 'AHSP_NOT_CONFIGURED';

export interface AHSPResolutionCandidate {
  ahsp: AHSPDefinition;
  matchScore: number;
  matchReason: string;
}

export interface AHSPResolutionResult {
  status: AHSPResolutionStatus;
  query: string;
  resolvedAHSP?: AHSPDefinition;
  candidates?: AHSPResolutionCandidate[];
  error?: string;
  warnings?: string[];
}

export interface AHSPQuery {
  code?: string;
  name?: string;
  category?: string;
  domain?: AHSPDomain;
  version?: string;
  unit?: string;
}
