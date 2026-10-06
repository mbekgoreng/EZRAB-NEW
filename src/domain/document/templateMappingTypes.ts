/**
 * Phase 6.4: EZRAB DED -> RAB: Template-Driven Construction Mapping Types
 *
 * Core Principles:
 * 1. TEMPLATE FIRST: User-selected template is the authoritative context.
 * 2. TEMPLATE SNAPSHOT: Historical projects preserve template version and rules.
 * 3. ADAPTIVE WBS: WBS branches are conditional based on verified evidence (Basement, Lift, Pool, etc.).
 * 4. KNOWLEDGE GRAPH: Entity -> Element -> Construction Method -> Work Item -> WBS.
 * 5. UNMAPPED INTEGRITY: Never force-fit an entity into the wrong WBS.
 * 6. COVERAGE NOT ACCURACY: Display Mapped, Unmapped, Needs Review, Conflict as Coverage.
 */

import { CanonicalEntity, CanonicalWorkItem } from './canonicalEntityTypes';
import { ConstructionProjectTemplate, WbsNode, ParameterDefinition, QuantityCalculationRule, AssumptionRule, ValidationRule } from '../../engine/templateEngine/types';

export type ParameterConfidenceStatus = 'CONFIRMED' | 'INFERRED' | 'MISSING' | 'CONFLICT';

export type ParameterSourceType =
  | 'USER_INPUT'
  | 'DED_EXTRACTED'
  | 'TEMPLATE_DEFAULT'
  | 'ASSUMPTION'
  | 'AI_INFERENCE';

export type EntityMappingStatus =
  | 'MAPPED'
  | 'UNMAPPED'
  | 'AMBIGUOUS'
  | 'NEEDS_REVIEW'
  | 'CONFLICT';

export type WbsActivationReason =
  | 'MANDATORY'
  | 'EVIDENCE_TRIGGERED'
  | 'USER_SELECTED'
  | 'DEFAULT'
  | 'INACTIVE';

export interface ExtractedConstructionParameter {
  parameterId: string;
  name: string;
  group: 'dimensions' | 'structure' | 'architectural' | 'mep' | 'external' | 'specialty' | 'general';
  value: any;
  unit?: string;
  source: ParameterSourceType;
  confidence: number;
  status: ParameterConfidenceStatus;
  extractedFrom?: string; // Drawing number or Page reference
  reasoning?: string;
}

export interface ProjectTemplateSnapshot {
  templateId: string;
  templateVersion: string;
  templateName: string;
  category: 'BUILDING' | 'INFRASTRUCTURE';
  type: string; // e.g. "residential", "hotel", "road", "bridge", etc.
  variant?: string;
  standardAgency?: 'PU' | 'CIPTA_KARYA' | 'BINA_MARGA' | 'SDA' | 'STANDARD';
  snapshotAt: string;
  parameters: ParameterDefinition[];
  wbsHierarchy: WbsNode[];
  optionalWbsNodes?: WbsNode[];
  quantityRules?: QuantityCalculationRule[];
  assumptionRules?: AssumptionRule[];
  validationRules?: ValidationRule[];
}

export interface AdaptiveWbsNode {
  code: string;
  title: string;
  level: 1 | 2 | 3;
  unit?: string;
  category?: string;
  description?: string;
  isActive: boolean;
  isOptional: boolean;
  activationReason: WbsActivationReason;
  triggerEvidence?: string;
  mappedEntityCount: number;
  mappedWorkItemCount: number;
  children?: AdaptiveWbsNode[];
  ahspCode?: string;
}

export interface ConstructionKnowledgeLink {
  elementType: string; // e.g. "COLUMN", "BEAM", "SLAB", "FOOTING", "WALL", "DOOR", "ELEVATOR"
  materialType: string; // e.g. "REINFORCED_CONCRETE", "STEEL", "BRICK_MASONRY", "LIGHTWEIGHT_CONCRETE"
  constructionMethod: string; // e.g. "CAST_IN_PLACE", "PRECAST", "MORTAR_JOINED", "MECHANICAL_FASTENED"
  targetWbsCategory: string;
  suggestedWbsCodePrefix: string;
  defaultAhspCode?: string;
}

export interface EntityWbsMapping {
  mappingId: string;
  entityId: string;
  entityIdentifier: string;
  entityName: string;
  elementType: string;
  floor: string;
  building: string;
  wbsCode?: string;
  wbsTitle?: string;
  workCategory: string;
  status: EntityMappingStatus;
  confidence: number;
  constructionMethod?: string;
  suggestedAhspCode?: string;
  reasoning: string;
  sourceDrawings: string[];
}

export interface MappingCoverageSummary {
  totalEntities: number;
  mappedCount: number;
  unmappedCount: number;
  ambiguousCount: number;
  needsReviewCount: number;
  conflictCount: number;
  coveragePercentage: number; // Mapped / Total * 100
  unmappedEntityIds: string[];
  needsReviewEntityIds: string[];
}

export interface TemplateValidationFinding {
  findingId: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  category:
    | 'MISSING_REQUIRED_PARAMETER'
    | 'CONDITIONAL_WBS_MISMATCH'
    | 'IRRELEVANT_WORK_DETECTED'
    | 'MISSING_EXPECTED_WORK'
    | 'UNMAPPED_ENTITY'
    | 'PARAMETER_CONFLICT';
  title: string;
  description: string;
  affectedWbsCode?: string;
  affectedEntityId?: string;
  suggestedAction: string;
}

export interface TemplateMappingContext {
  projectId: string;
  templateSnapshot: ProjectTemplateSnapshot;
  parameterSet: Record<string, ExtractedConstructionParameter>;
  adaptiveWBS: AdaptiveWbsNode[];
  mappedEntities: EntityWbsMapping[];
  unmappedEntities: EntityWbsMapping[];
  conditionalWorkActivated: {
    wbsCode: string;
    wbsTitle: string;
    trigger: string;
    evidence: string;
  }[];
  assumptionsApplied: Record<string, {
    parameterId: string;
    assumedValue: any;
    unit?: string;
    reasoning: string;
    confidence: number;
  }>;
  coverage: MappingCoverageSummary;
  validationFindings: TemplateValidationFinding[];
  generatedAt: string;
}
