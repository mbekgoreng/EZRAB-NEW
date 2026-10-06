/**
 * EZRAB Document AI Orchestrator Service
 * 
 * Bridges DeepSeek Copilot with EZRAB's authoritative Document Engine:
 * - Reads document set definitions and requirements from DOCUMENT_REGISTRY
 * - Evaluates completeness, missing fields, and dependency checks via completenessEngine
 * - Inspects template structure and variables via BUILTIN_TEMPLATES
 * - Creates document draft proposals with explicit user approval gate
 */

import { DOCUMENT_REGISTRY } from '../../src/document-engine/registry';
import { BUILTIN_TEMPLATES } from '../../src/document-engine/templateRepository';
import { calculateCompletenessForDocument, getDocumentStatusFromRecord } from '../../src/document-engine/completenessEngine';
import { classifyDocumentFields } from '../../src/document-engine/templateEngine';
import type { DocumentDefinition, DocumentStatus, RequirementLevel } from '../../src/document-engine/types';

export interface DocumentStatusItem {
  id: string;
  code: string;
  name: string;
  category: string;
  requirement: RequirementLevel;
  status: DocumentStatus;
  completenessPercent: number;
  missingFieldsCount: number;
  dependencies: string[];
}

export interface DocumentCompletenessReport {
  projectId: string;
  coreDocumentsCount: number;
  coreCompletedCount: number;
  overallPercentage: number;
  documents: DocumentStatusItem[];
  missingRequiredFields: Array<{
    documentId: string;
    documentName: string;
    missingFields: string[];
  }>;
  readinessSummary: string;
}

export class DocumentAiOrchestratorService {
  private static instance: DocumentAiOrchestratorService;

  public static getInstance(): DocumentAiOrchestratorService {
    if (!DocumentAiOrchestratorService.instance) {
      DocumentAiOrchestratorService.instance = new DocumentAiOrchestratorService();
    }
    return DocumentAiOrchestratorService.instance;
  }

  /**
   * Get all registered documents and their status for a project
   */
  public getDocumentStatus(projectId: string): { projectId: string; count: number; documents: DocumentStatusItem[] } {
    const documents: DocumentStatusItem[] = DOCUMENT_REGISTRY.map((def) => {
      // In server runtime without active user session DB for docs, evaluate baseline completeness
      const completeness = calculateCompletenessForDocument(def, undefined);
      const userFields = classifyDocumentFields(def).userFields;

      return {
        id: def.id,
        code: def.code,
        name: def.name,
        category: def.category,
        requirement: def.requirement,
        status: 'NOT_STARTED',
        completenessPercent: completeness.completenessPercentage,
        missingFieldsCount: userFields.length,
        dependencies: def.dependencies || [],
      };
    });

    return {
      projectId,
      count: documents.length,
      documents,
    };
  }

  /**
   * Calculate project document completeness with detailed missing field breakdowns
   */
  public getDocumentCompleteness(projectId: string, documentId?: string): DocumentCompletenessReport {
    let targetDefs = DOCUMENT_REGISTRY;
    if (documentId) {
      targetDefs = DOCUMENT_REGISTRY.filter(d => d.id === documentId || d.code === documentId);
    }

    const docItems: DocumentStatusItem[] = [];
    const missingRequired: Array<{ documentId: string; documentName: string; missingFields: string[] }> = [];

    let coreCount = 0;
    let coreCompleted = 0;
    let totalScore = 0;

    for (const def of targetDefs) {
      const completeness = calculateCompletenessForDocument(def, undefined);
      const userFields = classifyDocumentFields(def).userFields;
      const missingFieldLabels = userFields.map(f => f.label || f.id);

      if (def.requirement === 'CORE') {
        coreCount++;
        if (completeness.completenessPercentage >= 100) coreCompleted++;
      }

      totalScore += completeness.completenessPercentage;

      docItems.push({
        id: def.id,
        code: def.code,
        name: def.name,
        category: def.category,
        requirement: def.requirement,
        status: 'NOT_STARTED',
        completenessPercent: completeness.completenessPercentage,
        missingFieldsCount: missingFieldLabels.length,
        dependencies: def.dependencies || [],
      });

      if (missingFieldLabels.length > 0) {
        missingRequired.push({
          documentId: def.id,
          documentName: def.name,
          missingFields: missingFieldLabels,
        });
      }
    }

    const overallPercentage = targetDefs.length > 0 ? Math.round(totalScore / targetDefs.length) : 0;
    const readinessSummary = coreCount > 0 && coreCompleted === coreCount
      ? 'Seluruh dokumen inti (Core) telah lengkap dan siap diekspor.'
      : `Terdapat ${coreCount - coreCompleted} dokumen inti yang masih memerlukan input data sebelum tender/pengajuan.`;

    return {
      projectId,
      coreDocumentsCount: coreCount,
      coreCompletedCount: coreCompleted,
      overallPercentage,
      documents: docItems,
      missingRequiredFields: missingRequired,
      readinessSummary,
    };
  }

  /**
   * Retrieve template layout and field schemas for a specific document template
   */
  public getDocumentTemplate(templateIdOrType: string): { found: boolean; template?: any } {
    const cleanId = templateIdOrType.toLowerCase().trim();
    const template = BUILTIN_TEMPLATES.find(
      t => t.id.toLowerCase() === cleanId || t.documentType.toLowerCase() === cleanId
    );

    if (!template) {
      return { found: false };
    }

    return {
      found: true,
      template: {
        id: template.id,
        name: template.name,
        documentType: template.documentType,
        description: template.description,
        category: template.category,
        fields: template.fields,
        bodyPreview: template.body ? template.body.slice(0, 500) + '...' : undefined,
      },
    };
  }

  /**
   * Propose a document draft creation
   */
  public proposeDocumentDraft(params: {
    projectId: string;
    templateId: string;
    customFields?: Record<string, any>;
  }): { proposal: any; requiresConfirmation: boolean } {
    const { templateId, customFields = {} } = params;
    const templateInfo = this.getDocumentTemplate(templateId);

    return {
      requiresConfirmation: true,
      proposal: {
        action: 'CREATE_DOCUMENT_DRAFT',
        templateId,
        templateName: templateInfo.template?.name || templateId,
        customFields,
        description: `Pembuatan draf dokumen resmi "${templateInfo.template?.name || templateId}" untuk proyek.`,
      },
    };
  }
}

export const documentAiOrchestratorService = DocumentAiOrchestratorService.getInstance();
