import JSZip from 'jszip';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import type { DocumentDefinition, DocumentFormat } from './types';
import { exportDocument, sanitizeFilenamePart } from './exportService';
import type { DocumentSourceContext } from './documentData';
import type { DocumentRepository } from './repository';

const folderByCategory: Record<string, string> = {
  ADMINISTRATION: '01_ADMINISTRATION',
  TECHNICAL: '02_TECHNICAL',
  COMMERCIAL: '03_COMMERCIAL',
  SCHEDULE: '04_SCHEDULE',
  HSE: '05_HSE',
  PBG: '06_PBG',
  CUSTOM: '07_CUSTOM',
};

export interface PackageExportOptions {
  definitions?: DocumentDefinition[];
  context?: DocumentSourceContext;
  formats?: Array<DocumentFormat>;
  repository?: DocumentRepository;
  revision?: string | number;
  triggerDownload?: boolean;
}

export interface PackageItemResult {
  code: string;
  name: string;
  format: DocumentFormat;
  status: 'SUCCESS' | 'FAILED';
  filename?: string;
  revision: string;
  error?: string;
}

export interface PackageExportResult {
  success: boolean;
  blob: Blob;
  filename: string;
  generatedCount: number;
  failedCount: number;
  totalCount: number;
  manifestText: string;
  items: PackageItemResult[];
}

export const downloadTenderPackage = async (
  definitions: DocumentDefinition[],
  contextOrMaster: DocumentSourceContext | any,
  formats: Array<DocumentFormat> = ['PDF', 'DOCX', 'XLSX'],
  options?: PackageExportOptions
): Promise<PackageExportResult> => {
  // Normalize context
  const context: DocumentSourceContext =
    'master' in contextOrMaster
      ? (contextOrMaster as DocumentSourceContext)
      : { master: contextOrMaster };

  const zip = new JSZip();
  const dateStr = new Date().toISOString().split('T')[0];
  const repository = options?.repository;

  let generatedCount = 0;
  let failedCount = 0;
  const items: PackageItemResult[] = [];
  const itemizedManifestBlocks: string[] = [];

  for (const d of definitions) {
    const docSupported = d.supportedFormats || ['PDF', 'DOCX'];
    const supportedFormatsForDoc = formats.filter((fmt) => docSupported.includes(fmt));

    // Determine revision for this document
    let docRevisionStr = 'REV 00';
    if (options?.revision !== undefined) {
      docRevisionStr = typeof options.revision === 'number' 
        ? `REV ${String(options.revision).padStart(2, '0')}`
        : String(options.revision);
    } else if (repository) {
      try {
        const rec = repository.getDocument(d.id);
        if (rec?.revision !== undefined) {
          docRevisionStr = `REV ${String(rec.revision).padStart(2, '0')}`;
        }
      } catch {
        // Fallback
      }
    }

    const docRec = repository ? repository.getDocument(d.id) : undefined;

    for (const f of supportedFormatsForDoc) {
      // Process through central export pipeline without direct download
      const result = await exportDocument({
        definition: d,
        context,
        format: f,
        documentRecord: docRec,
        triggerDownload: false,
        repository,
      });

      if (result.success && result.blob) {
        const targetFolder = folderByCategory[d.category] || '08_OTHER';
        const folderZip = zip.folder(targetFolder)!;
        folderZip.file(result.filename, result.blob);
        generatedCount++;
        items.push({
          code: d.code,
          name: d.name,
          format: f,
          status: 'SUCCESS',
          filename: result.filename,
          revision: docRevisionStr,
        });

        itemizedManifestBlocks.push(
          [
            `Document: ${d.name} (${d.code})`,
            `Status: SUCCESS`,
            `Format: ${f}`,
            `Revision: ${docRevisionStr}`,
            `Filename: ${result.filename}`,
          ].join('\n')
        );
      } else {
        failedCount++;
        const reason = result.error || 'Validation error';
        items.push({
          code: d.code,
          name: d.name,
          format: f,
          status: 'FAILED',
          revision: docRevisionStr,
          error: reason,
        });

        itemizedManifestBlocks.push(
          [
            `Document: ${d.name} (${d.code})`,
            `Status: FAILED`,
            `Format: ${f}`,
            `Revision: ${docRevisionStr}`,
            `Reason: ${reason}`,
          ].join('\n')
        );
      }
    }
  }

  const totalCount = generatedCount + failedCount;
  const packageSuccess = failedCount === 0 && generatedCount > 0;

  // Exact Section 11 MANIFEST structure:
  // Project, Project Number, Export Date, Document Count, Successful Documents, Failed Documents, Revision
  const manifestLines: string[] = [
    '================================================================',
    'EZRAB TENDER PACKAGE MANIFEST',
    '================================================================',
    `Project: ${context.master?.projectName || '—'}`,
    `Project Number: ${context.master?.projectNumber || '—'}`,
    `Export Date: ${dateStr}`,
    `Document Count: ${totalCount}`,
    `Successful Documents: ${generatedCount}`,
    `Failed Documents: ${failedCount}`,
    `Revision: ${options?.revision !== undefined ? String(options.revision) : 'REV 00'}`,
    `Package Status: ${packageSuccess ? 'SUCCESS' : 'INCOMPLETE / HAS FAILURES'}`,
    '================================================================',
    '',
    'ITEMIZED EXPORT STATUS:',
    '----------------------------------------------------------------',
  ];

  for (const block of itemizedManifestBlocks) {
    manifestLines.push(block);
    manifestLines.push('----------------------------------------------------------------');
  }

  manifestLines.push('');
  manifestLines.push('PACKAGE SUMMARY:');
  manifestLines.push(`Generated: ${generatedCount}`);
  manifestLines.push(`Failed   : ${failedCount}`);
  manifestLines.push(`Total    : ${totalCount}`);
  manifestLines.push('');
  manifestLines.push('================================================================');

  const manifestText = manifestLines.join('\n');
  zip.file('MANIFEST.txt', manifestText);

  const cleanProject = sanitizeFilenamePart(context.master?.projectName || 'PROJECT');
  const cleanProjectNum = sanitizeFilenamePart(context.master?.projectNumber || '');
  const prefix = cleanProjectNum ? `${cleanProjectNum}_` : '';
  const zipFilename = `EZRAB_TENDER_PACKAGE_${prefix}${cleanProject}.zip`;

  const zipBlob = await zip.generateAsync({ type: 'blob' });

  if (typeof window !== 'undefined' && options?.triggerDownload !== false) {
    saveAs(zipBlob, zipFilename);
  }

  return {
    success: packageSuccess,
    blob: zipBlob,
    filename: zipFilename,
    generatedCount,
    failedCount,
    totalCount,
    manifestText,
    items,
  };
};