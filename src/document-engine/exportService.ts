import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import type {
  DocumentDefinition,
  DocumentFormat,
  DocumentRecord,
  ValidationResult,
  ExportHistoryRecord,
} from './types';
import { buildDocumentData, DocumentSourceContext } from './documentData';
import { validateDocument } from './validationEngine';
import { renderDocument } from './renderer';
import { generatePdf } from './exporters/pdfGenerator';
import { generateDocx } from './exporters/docxGenerator';
import { generateXlsx } from './exporters/xlsxGenerator';
import { LocalDocumentRepository, DocumentRepository } from './repository';

export interface ExportOptions {
  definition: DocumentDefinition;
  context: DocumentSourceContext;
  format: DocumentFormat;
  documentRecord?: DocumentRecord;
  revision?: number;
  repository?: DocumentRepository;
  triggerDownload?: boolean;
}

export interface ExportResult {
  success: boolean;
  format: DocumentFormat;
  blob?: Blob;
  filename: string;
  validation?: ValidationResult;
  error?: string;
  exportHistoryId?: string;
}

/**
 * Canonical central export pipeline for EZRAB Document Engine.
 *
 * Flow:
 * 1. buildDocumentData(definition, context)
 * 2. validateDocument(definition, documentData)
 * 3. If ERROR -> Halt export, record failed history, return failure result
 * 4. renderDocument(definition, documentData)
 * 5. Generate format (PDF, DOCX, XLSX)
 * 6. Record successful export history
 * 7. Optionally trigger browser saveAs
 * 8. Return result
 */
export const sanitizeFilenamePart = (str: unknown): string => {
  if (typeof str !== 'string') {
    str = str != null ? String(str) : '';
  }
  return (str as string)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .trim();
};

export const getExportFilename = (
  arg1: string | undefined | DocumentDefinition,
  arg2: string | undefined | any,
  arg3?: string | number,
  arg4?: number | DocumentFormat | string,
  arg5?: DocumentFormat
): string => {
  let projectNumber = '';
  let projectName = '';
  let documentCode = '';
  let revision = 0;
  let format: DocumentFormat = 'PDF';

  // Check if first argument is a DocumentDefinition
  if (typeof arg1 === 'object' && arg1 !== null && 'code' in arg1) {
    documentCode = arg1.code;
    if (typeof arg2 === 'object' && arg2 !== null) {
      projectNumber = arg2.projectNumber || '';
      projectName = arg2.projectName || '';
    } else {
      projectName = String(arg2 || '');
    }
    if (typeof arg3 === 'number') {
      revision = arg3;
    } else if (typeof arg3 === 'string') {
      const match = arg3.match(/\d+/);
      revision = match ? parseInt(match[0], 10) : 0;
    }
    format = (arg4 as DocumentFormat) || 'PDF';
  } else {
    projectNumber = typeof arg1 === 'string' ? arg1 : '';
    projectName = typeof arg2 === 'string' ? arg2 : '';
    documentCode = typeof arg3 === 'string' ? arg3 : '';
    if (typeof arg4 === 'number') {
      revision = arg4;
    } else if (typeof arg4 === 'string') {
      const match = arg4.match(/\d+/);
      revision = match ? parseInt(match[0], 10) : 0;
    }
    format = arg5 || 'PDF';
  }

  const codePart = sanitizeFilenamePart(documentCode || 'DOC');
  const projPart = sanitizeFilenamePart(projectNumber || projectName || 'PROJECT');
  const revStr = `REV${String(revision).padStart(2, '0')}`;
  return `${codePart}_${projPart}_${revStr}.${format.toLowerCase()}`;
};

export async function exportDocument(options: ExportOptions): Promise<ExportResult> {
  const {
    definition,
    context,
    format,
    documentRecord,
    triggerDownload = true,
  } = options;

  const revNum =
    options.revision !== undefined
      ? options.revision
      : documentRecord?.revision !== undefined
      ? documentRecord.revision
      : context.revision !== undefined
      ? context.revision
      : 0;

  const filename = getExportFilename(
    context.master.projectNumber,
    context.master.projectName,
    definition.code,
    revNum,
    format
  );
  const exportHistoryId = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Default repository instance if not provided
  const repo = options.repository || new LocalDocumentRepository(context.master.projectNumber || undefined);

  // 1. Build DocumentData
  const documentData = buildDocumentData(definition, {
    ...context,
    revision: revNum,
  });

  // 2. Validate Document with sourceContext & userValues
  const userVals = (documentRecord as any)?.userValues || (documentRecord as any)?.userFieldValues || context.userFieldValues || {};
  const validation = validateDocument(definition, documentData, context, userVals);

  // 3. If ERROR -> halt export
  if (!validation.valid && validation.errors.length > 0) {
    const errorMsg = validation.errors.join('; ');

    // Record failed export
    const historyItem: ExportHistoryRecord = {
      id: exportHistoryId,
      documentId: definition.id,
      projectId: context.master.projectNumber || undefined,
      format,
      fileName: filename,
      revision: revNum,
      createdAt: new Date().toISOString(),
      status: 'FAILED',
      error: errorMsg,
    };
    repo.saveExportHistory(historyItem);

    return {
      success: false,
      format,
      filename,
      validation,
      error: errorMsg,
      exportHistoryId,
    };
  }

  // 4. Render Document
  const renderedDoc = renderDocument(definition, documentData);

  // 5. Generate target format
  let blob: Blob;
  try {
    switch (format) {
      case 'PDF':
        blob = generatePdf(definition, documentData, renderedDoc, revNum);
        break;
      case 'DOCX':
        blob = await generateDocx(definition, documentData, renderedDoc, revNum);
        break;
      case 'XLSX':
        blob = await generateXlsx(definition, documentData, renderedDoc, revNum);
        break;
      default:
        throw new Error(`Format tidak didukung: ${format}`);
    }
  } catch (genErr) {
    const errMsg = genErr instanceof Error ? genErr.message : String(genErr);
    const historyItem: ExportHistoryRecord = {
      id: exportHistoryId,
      documentId: definition.id,
      projectId: context.master.projectNumber || undefined,
      format,
      fileName: filename,
      revision: revNum,
      createdAt: new Date().toISOString(),
      status: 'FAILED',
      error: errMsg,
    };
    repo.saveExportHistory(historyItem);

    return {
      success: false,
      format,
      filename,
      validation,
      error: errMsg,
      exportHistoryId,
    };
  }

  // 6. Record successful export history
  const historyItem: ExportHistoryRecord = {
    id: exportHistoryId,
    documentId: definition.id,
    projectId: context.master.projectNumber || undefined,
    format,
    fileName: filename,
    revision: revNum,
    createdAt: new Date().toISOString(),
    status: 'SUCCESS',
  };
  repo.saveExportHistory(historyItem);

  // 7. Trigger browser download if enabled
  if (triggerDownload && typeof window !== 'undefined') {
    try {
      saveAs(blob, filename);
    } catch (saveErr) {
      console.warn('[exportService] saveAs failed:', saveErr);
    }
  }

  return {
    success: true,
    format,
    blob,
    filename,
    validation,
    exportHistoryId,
  };
}
