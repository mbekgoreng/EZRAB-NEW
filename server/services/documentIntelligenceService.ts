/**
 * Document Intelligence Service (Phase 6)
 *
 * Ingests construction documents, classifies disciplines, extracts metadata & text/chunks,
 * handles lifecycle states, and prepares structured context for entity extraction and QTO draft.
 */

import {
  ProjectDocument,
  DocumentIngestRequest,
  DocumentIngestResult,
  DocumentDiscipline,
  DocumentType,
  DocumentFileType,
  DocumentChunk
} from '../../src/domain/document/types';
import { DocumentSecurityGuard } from '../security/documentSecurityGuard';
import { ProjectDocumentContext } from './projectDocumentContext';

export class DocumentIntelligenceService {
  private static instance: DocumentIntelligenceService;
  private readonly securityGuard = DocumentSecurityGuard.getInstance();
  private readonly projectDocContext = ProjectDocumentContext.getInstance();

  private constructor() {}

  public static getInstance(): DocumentIntelligenceService {
    if (!DocumentIntelligenceService.instance) {
      DocumentIntelligenceService.instance = new DocumentIntelligenceService();
    }
    return DocumentIntelligenceService.instance;
  }

  /**
   * Determine discipline from document filename, metadata, and content
   */
  public classifyDiscipline(fileName: string, contentSnippet: string = ''): {
    discipline: DocumentDiscipline;
    docType: DocumentType;
    confidence: number;
  } {
    const lowerName = fileName.toLowerCase();
    const lowerContent = contentSnippet.toLowerCase();

    // Structural clues
    if (
      lowerName.includes('struktur') ||
      lowerName.includes('str') ||
      lowerName.includes('pondasi') ||
      lowerName.includes('kolom') ||
      lowerName.includes('balok') ||
      lowerContent.includes('pembesian') ||
      lowerContent.includes('mutu beton')
    ) {
      return { discipline: 'STRUCTURE', docType: 'STRUCTURAL_DETAIL', confidence: 0.95 };
    }

    // Architectural clues
    if (
      lowerName.includes('arsitektur') ||
      lowerName.includes('ars') ||
      lowerName.includes('denah') ||
      lowerName.includes('tampak') ||
      lowerName.includes('potongan') ||
      lowerName.includes('siteplan') ||
      lowerContent.includes('lantai') ||
      lowerContent.includes('pintu')
    ) {
      const docType: DocumentType = lowerName.includes('siteplan')
        ? 'SITE_PLAN'
        : lowerName.includes('tampak') || lowerName.includes('potongan')
        ? 'ELEVATION_SECTION'
        : 'FLOOR_PLAN';
      return { discipline: 'ARCHITECTURE', docType, confidence: 0.94 };
    }

    // MEP clues
    if (
      lowerName.includes('mep') ||
      lowerName.includes('plumbing') ||
      lowerName.includes('listrik') ||
      lowerName.includes('sanitasi') ||
      lowerName.includes('mekanikal') ||
      lowerName.includes('elektrikal') ||
      lowerContent.includes('pipa') ||
      lowerContent.includes('kabel')
    ) {
      return { discipline: 'MEP', docType: 'MEP_SCHEMATIC', confidence: 0.92 };
    }

    // BOQ clues
    if (
      lowerName.includes('boq') ||
      lowerName.includes('rab') ||
      lowerName.includes('bill of quantities') ||
      lowerName.includes('estimasi') ||
      lowerContent.includes('harga satuan')
    ) {
      return { discipline: 'BOQ', docType: 'BOQ_EXCEL', confidence: 0.96 };
    }

    // Specifications / RKS
    if (
      lowerName.includes('rks') ||
      lowerName.includes('spesifikasi') ||
      lowerName.includes('spek') ||
      lowerName.includes('syarat teknis')
    ) {
      return { discipline: 'SPECIFICATION', docType: 'SPEC_DOC', confidence: 0.93 };
    }

    // Civil clues
    if (
      lowerName.includes('jalan') ||
      lowerName.includes('drainase') ||
      lowerName.includes('saluran') ||
      lowerName.includes('jembatan') ||
      lowerName.includes('cut and fill')
    ) {
      return { discipline: 'CIVIL', docType: 'DED_DRAWING', confidence: 0.91 };
    }

    // Default general drawing
    return { discipline: 'GENERAL', docType: 'DED_DRAWING', confidence: 0.75 };
  }

  /**
   * Ingest and process a construction document into the project context
   */
  public async ingestDocument(req: DocumentIngestRequest): Promise<DocumentIngestResult> {
    const { projectId, workspaceId, fileName, fileSizeBytes, mimeType, rawText, versionLabel, metadata } = req;

    // 1. Security scan & sanitization
    const rawContent = rawText || '';
    const scanResult = this.securityGuard.scanAndSanitizeText(rawContent);

    // 2. Classify
    const classification = this.classifyDiscipline(fileName, scanResult.sanitizedContent);

    // 3. Detect file type
    let fileType: DocumentFileType = req.fileType || 'PDF';
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) fileType = 'PDF';
    else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) fileType = 'EXCEL';
    else if (lower.endsWith('.docx') || lower.endsWith('.doc')) fileType = 'WORD';
    else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) fileType = 'IMAGE';
    else if (lower.endsWith('.dwg') || lower.endsWith('.dxf')) fileType = 'DWG';

    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const initialVersion = versionLabel || 'REV 00';

    // 4. Generate Chunks
    const chunks: DocumentChunk[] = [];
    const textLines = scanResult.sanitizedContent.split('\n\n').filter(Boolean);
    if (textLines.length > 0) {
      textLines.forEach((textChunk, idx) => {
        chunks.push({
          chunkId: `${documentId}_chk_${idx + 1}`,
          documentId,
          pageNumber: idx + 1,
          discipline: classification.discipline,
          content: textChunk,
          tablesDetected: textChunk.includes('|') ? 1 : 0,
          entitiesExtracted: 0,
          confidence: classification.confidence,
          boundingBox: { x: 50, y: 50 + idx * 100, width: 500, height: 80 }
        });
      });
    } else {
      // Default placeholder chunk for visual/drawing files
      chunks.push({
        chunkId: `${documentId}_chk_1`,
        documentId,
        pageNumber: 1,
        discipline: classification.discipline,
        content: `Document: ${fileName} [${classification.discipline}]`,
        tablesDetected: 0,
        entitiesExtracted: 0,
        confidence: classification.confidence,
        boundingBox: { x: 0, y: 0, width: 800, height: 600 }
      });
    }

    const document: ProjectDocument = {
      documentId,
      projectId,
      workspaceId,
      fileName,
      fileType,
      mimeType: mimeType || 'application/pdf',
      fileSizeBytes,
      checksumSha256: scanResult.checksumSha256,
      discipline: classification.discipline,
      docType: classification.docType,
      lifecycleStatus: 'PARSED',
      currentVersion: initialVersion,
      versionHistory: [
        {
          versionId: `ver_${Date.now()}`,
          versionLabel: initialVersion,
          checksumSha256: scanResult.checksumSha256,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.userId,
          fileSizeBytes,
          status: 'PARSED',
          changeSummary: 'Initial document upload & parsing.'
        }
      ],
      pageCount: Math.max(1, chunks.length),
      parsedChunks: chunks,
      metadata: {
        title: metadata?.title || fileName.replace(/\.[^/.]+$/, ''),
        scale: metadata?.scale || '1:100',
        projectName: metadata?.projectName || 'EZRAB Project',
        sheetNumber: metadata?.sheetNumber || 'A-101',
        date: new Date().toISOString().split('T')[0],
        customFields: metadata || {}
      },
      securityStatus: {
        scanned: true,
        isClean: scanResult.isClean,
        sanitized: !scanResult.isClean,
        scanTimestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 5. Store in project context
    this.projectDocContext.registerDocument({
      workspaceId,
      projectId,
      document
    });

    const warnings: string[] = [];
    if (!scanResult.isClean) {
      warnings.push(`Ditemukan ${scanResult.threatsDetected.length} potensi instruksi berbahaya pada dokumen yang telah disanitisasi secara aman.`);
    }

    return {
      document,
      extractedEntityCount: chunks.length,
      disciplinesDetected: [classification.discipline],
      isReadyForQto: true,
      warnings
    };
  }
}
