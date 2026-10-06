/**
 * Phase 6.4: Template Mapping Coordinator
 *
 * Coordinates the full Template-Driven Construction Mapping Pipeline:
 * - Template First Authoritative Context & Versioned Snapshots
 * - Parameter Extraction from Canonical Entities
 * - Adaptive Conditional WBS Generation
 * - Entity -> WBS Mapping & Coverage Calculation
 * - Construction Knowledge Graph Resolution
 * - Template Consistency Validation
 * - Tenant & Project Isolation
 */

import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';
import { DrawingGraph } from '../../src/domain/document/drawingGraphTypes';
import { TemplateRegistry } from '../../src/engine/templateEngine/TemplateRegistry';
import { ConstructionProjectTemplate } from '../../src/engine/templateEngine/types';
import {
  TemplateMappingContext,
  ProjectTemplateSnapshot
} from '../../src/domain/document/templateMappingTypes';
import { ParameterExtractionEngine } from './parameterExtractionEngine';
import { AdaptiveWbsEngine } from './adaptiveWbsEngine';
import { TemplateEntityMappingEngine } from './templateEntityMappingEngine';
import { TemplateValidationEngine } from './templateValidationEngine';

export interface RunTemplateMappingInput {
  projectId: string;
  tenantId?: string;
  templateId: string;
  entities: CanonicalEntity[];
  drawingGraph?: DrawingGraph;
  userParameters?: Record<string, any>;
  existingSnapshot?: ProjectTemplateSnapshot;
}

export class TemplateMappingCoordinator {
  private static instance: TemplateMappingCoordinator;
  private cache: Map<string, TemplateMappingContext> = new Map();

  private constructor() {}

  public static getInstance(): TemplateMappingCoordinator {
    if (!TemplateMappingCoordinator.instance) {
      TemplateMappingCoordinator.instance = new TemplateMappingCoordinator();
    }
    return TemplateMappingCoordinator.instance;
  }

  /**
   * Run the complete Phase 6.4 pipeline for a project.
   */
  public async processProjectTemplateMapping(input: RunTemplateMappingInput): Promise<TemplateMappingContext> {
    const { projectId, tenantId = 'default_tenant', templateId, entities, drawingGraph, userParameters, existingSnapshot } = input;
    const cacheKey = `${tenantId}:${projectId}:${templateId}`;

    // 1. Resolve Template (Authoritative Context & Snapshot)
    let template: ConstructionProjectTemplate | undefined;
    let templateSnapshot: ProjectTemplateSnapshot;

    if (existingSnapshot && existingSnapshot.templateId === templateId) {
      templateSnapshot = existingSnapshot;
      template = {
        id: existingSnapshot.templateId,
        name: existingSnapshot.templateName,
        code: existingSnapshot.templateId,
        category: existingSnapshot.category,
        type: existingSnapshot.type,
        variant: existingSnapshot.variant,
        version: existingSnapshot.templateVersion,
        description: `Snapshot of ${existingSnapshot.templateName}`,
        aliases: [],
        keywords: [],
        parameters: existingSnapshot.parameters,
        wbsHierarchy: existingSnapshot.wbsHierarchy,
        optionalWbsNodes: existingSnapshot.optionalWbsNodes,
        quantityRules: existingSnapshot.quantityRules,
        assumptionRules: existingSnapshot.assumptionRules,
        validationRules: existingSnapshot.validationRules,
        created_at: existingSnapshot.snapshotAt,
        updated_at: existingSnapshot.snapshotAt
      };
    } else {
      const registry = TemplateRegistry.getInstance();
      template = registry.getById(templateId);
      if (!template) {
        template = registry.getByType(templateId);
      }
      if (!template) {
        const idLower = templateId.toLowerCase();
        template = registry.getAll().find(t =>
          t.id.toLowerCase() === idLower ||
          t.type.toLowerCase() === idLower ||
          t.aliases.some(a => a.toLowerCase() === idLower) ||
          t.id.toLowerCase().includes(idLower) ||
          idLower.includes(t.type.toLowerCase())
        );
      }
      if (!template) {
        template = registry.getById('tmpl-building-residential') || registry.getAll()[0];
      }

      if (!template) {
        throw new Error(`Template with id or type '${templateId}' not found in Template Registry.`);
      }

      // Create immutable snapshot
      templateSnapshot = {
        templateId: template.id,
        templateVersion: template.version || '1.0.0',
        templateName: template.name,
        category: template.category,
        type: template.type,
        variant: template.variant,
        snapshotAt: new Date().toISOString(),
        parameters: JSON.parse(JSON.stringify(template.parameters || [])),
        wbsHierarchy: JSON.parse(JSON.stringify(template.wbsHierarchy || [])),
        optionalWbsNodes: JSON.parse(JSON.stringify(template.optionalWbsNodes || [])),
        quantityRules: JSON.parse(JSON.stringify(template.quantityRules || [])),
        assumptionRules: JSON.parse(JSON.stringify(template.assumptionRules || [])),
        validationRules: JSON.parse(JSON.stringify(template.validationRules || []))
      };
    }

    // 2. Extract Construction Parameters
    const parameterSet = ParameterExtractionEngine.extractParameters({
      projectId,
      template,
      entities,
      drawingGraph,
      userParameters
    });

    // 3. Build Adaptive WBS
    const { adaptiveWBS, activatedConditionalNodes } = AdaptiveWbsEngine.buildAdaptiveWBS({
      template,
      parameters: parameterSet,
      entities
    });

    // 4. Map Canonical Entities to WBS Nodes
    const { mappedEntities, unmappedEntities, coverage, updatedWBS } = TemplateEntityMappingEngine.mapEntitiesToWBS({
      projectId,
      entities,
      adaptiveWBS
    });

    // 5. Gather Applied Assumptions
    const assumptionsApplied: Record<string, any> = {};
    for (const [k, v] of Object.entries(parameterSet)) {
      if (v.source === 'ASSUMPTION' || v.source === 'TEMPLATE_DEFAULT') {
        assumptionsApplied[k] = {
          parameterId: k,
          assumedValue: v.value,
          unit: v.unit,
          reasoning: v.reasoning || 'Standard template default assumption applied.',
          confidence: v.confidence
        };
      }
    }

    // 6. Run Template Validation Engine
    const validationFindings = TemplateValidationEngine.validate({
      template,
      parameters: parameterSet,
      adaptiveWBS: updatedWBS,
      mappedEntities,
      unmappedEntities,
      coverage
    });

    // 7. Assemble Final Context
    const resultContext: TemplateMappingContext = {
      projectId,
      templateSnapshot,
      parameterSet,
      adaptiveWBS: updatedWBS,
      mappedEntities,
      unmappedEntities,
      conditionalWorkActivated: activatedConditionalNodes,
      assumptionsApplied,
      coverage,
      validationFindings,
      generatedAt: new Date().toISOString()
    };

    this.cache.set(cacheKey, resultContext);
    return resultContext;
  }

  public getCachedContext(projectId: string, tenantId: string = 'default_tenant', templateId: string): TemplateMappingContext | undefined {
    return this.cache.get(`${tenantId}:${projectId}:${templateId}`);
  }

  public clearCache(tenantId?: string): void {
    if (!tenantId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
