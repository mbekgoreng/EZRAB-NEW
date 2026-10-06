/**
 * Phase 6.4: Adaptive WBS Engine
 *
 * Computes an adaptive, conditional WBS hierarchy based on template definitions
 * and verified construction evidence (Basement, Lift, Pool, Multi-story, etc.).
 */

import { ConstructionProjectTemplate, WbsNode } from '../../src/engine/templateEngine/types';
import {
  AdaptiveWbsNode,
  ExtractedConstructionParameter,
  WbsActivationReason
} from '../../src/domain/document/templateMappingTypes';
import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';

export interface AdaptiveWbsInput {
  template: ConstructionProjectTemplate;
  parameters: Record<string, ExtractedConstructionParameter>;
  entities: CanonicalEntity[];
}

export class AdaptiveWbsEngine {
  /**
   * Build adaptive WBS hierarchy.
   */
  public static buildAdaptiveWBS(input: AdaptiveWbsInput): {
    adaptiveWBS: AdaptiveWbsNode[];
    activatedConditionalNodes: { wbsCode: string; wbsTitle: string; trigger: string; evidence: string }[];
  } {
    const { template, parameters, entities } = input;
    const activatedConditionalNodes: { wbsCode: string; wbsTitle: string; trigger: string; evidence: string }[] = [];

    // Combine standard wbsHierarchy with optionalWbsNodes
    const baseNodes = template.wbsHierarchy || [];
    const optionalNodes = template.optionalWbsNodes || [];

    // Check evidence flags from parameters
    const hasBasement = Boolean(parameters['has_basement']?.value);
    const hasLift = Boolean(parameters['has_lift']?.value) || (Number(parameters['has_lift']?.value) > 0) || (Number(parameters['elevator_count']?.value) > 0);
    const hasPool = Boolean(parameters['has_pool']?.value) || Boolean(parameters['has_swimming_pool']?.value);
    const floorCount = Number(parameters['floors']?.value || parameters['floor_count']?.value || 1);

    // Map base nodes
    const adaptiveNodes: AdaptiveWbsNode[] = baseNodes.map(node => {
      return this.transformNode(node, false, parameters, entities, activatedConditionalNodes);
    });

    // Process optional nodes dynamically
    for (const optNode of optionalNodes) {
      const codeLower = (optNode.code || '').toLowerCase();
      const titleLower = (optNode.title || '').toLowerCase();

      let shouldActivate = false;
      let trigger = '';
      let evidence = '';

      if (titleLower.includes('basement') || codeLower.includes('base')) {
        if (hasBasement) {
          shouldActivate = true;
          trigger = 'has_basement = true';
          evidence = parameters['has_basement']?.extractedFrom || 'Basement structural levels identified in DED.';
        }
      } else if (titleLower.includes('lift') || titleLower.includes('elevator')) {
        if (hasLift) {
          shouldActivate = true;
          trigger = 'has_lift = true';
          evidence = parameters['has_lift']?.extractedFrom || 'Elevator hoistway/cabin detected in DED.';
        }
      } else if (titleLower.includes('kolam') || titleLower.includes('pool')) {
        if (hasPool) {
          shouldActivate = true;
          trigger = 'has_pool = true';
          evidence = parameters['has_pool']?.extractedFrom || 'Swimming pool structural basin detected in DED.';
        }
      } else if (titleLower.includes('tangga') || titleLower.includes('stair')) {
        if (floorCount > 1) {
          shouldActivate = true;
          trigger = 'floors > 1';
          evidence = `Building has ${floorCount} floors, requiring inter-floor stairs.`;
        }
      } else if (optNode.conditionalRule) {
        const rule = optNode.conditionalRule;
        const paramVal = parameters[rule.parameterId]?.value;
        if (paramVal !== undefined) {
          if (rule.operator === '==' && paramVal == rule.value) shouldActivate = true;
          else if (rule.operator === '!=' && paramVal != rule.value) shouldActivate = true;
          else if (rule.operator === '>' && paramVal > rule.value) shouldActivate = true;
          else if (rule.operator === '>=' && paramVal >= rule.value) shouldActivate = true;
          else if (rule.operator === '<' && paramVal < rule.value) shouldActivate = true;
          else if (rule.operator === '<=' && paramVal <= rule.value) shouldActivate = true;

          if (shouldActivate) {
            trigger = `${rule.parameterId} ${rule.operator} ${rule.value}`;
            evidence = `Condition met by project parameter '${rule.parameterId}'.`;
          }
        }
      }

      if (shouldActivate) {
        activatedConditionalNodes.push({
          wbsCode: optNode.code,
          wbsTitle: optNode.title,
          trigger,
          evidence
        });

        const activeNode = this.transformNode(optNode, true, parameters, entities, activatedConditionalNodes);
        activeNode.isActive = true;
        activeNode.activationReason = 'EVIDENCE_TRIGGERED';
        activeNode.triggerEvidence = evidence;

        // Check if node should be merged into hierarchy or appended
        const parentCode = optNode.code.substring(0, optNode.code.lastIndexOf('.'));
        let parentFound = false;
        if (parentCode) {
          for (const node of adaptiveNodes) {
            if (node.code === parentCode) {
              if (!node.children) node.children = [];
              node.children.push(activeNode);
              parentFound = true;
              break;
            }
          }
        }
        if (!parentFound) {
          adaptiveNodes.push(activeNode);
        }
      }
    }

    // Dynamic standard fallback activation for Basement, Lift, Pool if not explicitly in optionalWbsNodes
    const hasBasementInOptional = optionalNodes.some(n => n.title.toLowerCase().includes('basement'));
    if (hasBasement && !hasBasementInOptional) {
      const basementNode: AdaptiveWbsNode = {
        code: '02.05',
        title: 'PEKERJAAN STRUKTUR BASEMENT & DPT',
        level: 2,
        isActive: true,
        isOptional: true,
        activationReason: 'EVIDENCE_TRIGGERED',
        triggerEvidence: parameters['has_basement']?.extractedFrom || 'Basement structural levels identified in DED.',
        mappedEntityCount: 0,
        mappedWorkItemCount: 0
      };
      activatedConditionalNodes.push({
        wbsCode: '02.05',
        wbsTitle: 'PEKERJAAN STRUKTUR BASEMENT & DPT',
        trigger: 'has_basement = true',
        evidence: basementNode.triggerEvidence!
      });
      const p02 = adaptiveNodes.find(n => n.code === '02');
      if (p02) {
        if (!p02.children) p02.children = [];
        p02.children.push(basementNode);
      } else {
        adaptiveNodes.push(basementNode);
      }
    }

    const hasLiftInOptional = optionalNodes.some(n => n.title.toLowerCase().includes('lift') || n.title.toLowerCase().includes('elevator'));
    if (hasLift && !hasLiftInOptional) {
      const liftNode: AdaptiveWbsNode = {
        code: '09.05',
        title: 'PEKERJAAN LIFT / ELEVATOR',
        level: 2,
        isActive: true,
        isOptional: true,
        activationReason: 'EVIDENCE_TRIGGERED',
        triggerEvidence: parameters['has_lift']?.extractedFrom || 'Elevator hoistway/cabin detected in DED.',
        mappedEntityCount: 0,
        mappedWorkItemCount: 0
      };
      activatedConditionalNodes.push({
        wbsCode: '09.05',
        wbsTitle: 'PEKERJAAN LIFT / ELEVATOR',
        trigger: 'has_lift = true',
        evidence: liftNode.triggerEvidence!
      });
      const p09 = adaptiveNodes.find(n => n.code === '09' || n.code === '11' || n.code === '04');
      if (p09) {
        if (!p09.children) p09.children = [];
        p09.children.push(liftNode);
      } else {
        adaptiveNodes.push(liftNode);
      }
    }

    const hasPoolInOptional = optionalNodes.some(n => n.title.toLowerCase().includes('kolam') || n.title.toLowerCase().includes('pool'));
    if (hasPool && !hasPoolInOptional) {
      const poolNode: AdaptiveWbsNode = {
        code: '12.04',
        title: 'PEKERJAAN KOLAM RENANG & MEP',
        level: 2,
        isActive: true,
        isOptional: true,
        activationReason: 'EVIDENCE_TRIGGERED',
        triggerEvidence: parameters['has_pool']?.extractedFrom || 'Swimming pool structural basin detected in DED.',
        mappedEntityCount: 0,
        mappedWorkItemCount: 0
      };
      activatedConditionalNodes.push({
        wbsCode: '12.04',
        wbsTitle: 'PEKERJAAN KOLAM RENANG & MEP',
        trigger: 'has_pool = true',
        evidence: poolNode.triggerEvidence!
      });
      const p12 = adaptiveNodes.find(n => n.code === '12' || n.code === '13' || n.code === '04');
      if (p12) {
        if (!p12.children) p12.children = [];
        p12.children.push(poolNode);
      } else {
        adaptiveNodes.push(poolNode);
      }
    }

    return {
      adaptiveWBS: adaptiveNodes,
      activatedConditionalNodes
    };
  }

  private static transformNode(
    node: WbsNode,
    isOptional: boolean,
    parameters: Record<string, ExtractedConstructionParameter>,
    entities: CanonicalEntity[],
    activatedConditionalNodes: any[]
  ): AdaptiveWbsNode {
    const childNodes: AdaptiveWbsNode[] = [];
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        childNodes.push(this.transformNode(child, isOptional, parameters, entities, activatedConditionalNodes));
      }
    }

    return {
      code: node.code,
      title: node.title,
      level: node.level,
      unit: node.unit,
      category: node.category,
      description: node.description,
      isActive: true,
      isOptional: Boolean(isOptional || node.isOptional),
      activationReason: isOptional ? 'EVIDENCE_TRIGGERED' : 'MANDATORY',
      mappedEntityCount: 0,
      mappedWorkItemCount: 0,
      children: childNodes.length > 0 ? childNodes : undefined,
      ahspCode: node.ahspCode
    };
  }
}
