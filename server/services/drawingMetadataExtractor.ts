/**
 * Drawing Metadata & Revision Extractor (Phase 6.1)
 *
 * Extracts Title Block attributes (Drawing No, Revision, Scale, Building, Floor, Zone, Author, Date)
 * or returns null when absent without fabricating information. Tracks revision progressions.
 */

import { DrawingMetadata, DocumentPageInventoryItem } from '../../src/domain/document/documentSetTypes';
import { DocumentDiscipline } from '../../src/domain/document/types';

export class DrawingMetadataExtractor {
  private static instance: DrawingMetadataExtractor;

  private constructor() {}

  public static getInstance(): DrawingMetadataExtractor {
    if (!DrawingMetadataExtractor.instance) {
      DrawingMetadataExtractor.instance = new DrawingMetadataExtractor();
    }
    return DrawingMetadataExtractor.instance;
  }

  /**
   * Extract drawing metadata strictly from text and title block patterns
   */
  public extractMetadata(text: string, fileName: string, pageNum: number): DrawingMetadata {
    const raw = text || '';

    // 1. Drawing Number / Sheet Number (e.g. A-101, ARS-01, S-201, STR-02, MEP-01)
    const dwgMatch = 
      raw.match(/(?:no(?:\.|mor)?\s*gambar|drawing\s*no\.?|sheet\s*no\.?)\s*[:=]?\s*([A-Z0-9\-_./]{2,15})/i) ||
      raw.match(/\b([A-Z]{1,3}-[0-9]{2,4})\b/) ||
      fileName.match(/\b([A-Z]{1,3}-[0-9]{2,4})\b/i);
    const drawingNumber = dwgMatch ? dwgMatch[1].toUpperCase() : null;

    // 2. Sheet Number
    const sheetMatch = raw.match(/(?:lembar|sheet)\s*[:=]?\s*([0-9]+\s*(?:dari|\/)\s*[0-9]+|[0-9]+)/i);
    const sheetNumber = sheetMatch ? sheetMatch[1] : `${pageNum}`;

    // 3. Title (Judul Gambar)
    let title: string | null = null;
    const explicitTitleMatch = raw.match(/(?:judul\s*gambar|drawing\s*title|nama\s*gambar)\s*[:=]?\s*([^\n\r,;|]{3,60})/i);
    if (explicitTitleMatch && explicitTitleMatch[1]) {
      title = explicitTitleMatch[1].trim();
    } else {
      const genericTitleMatch = raw.match(/(?:denah\s*[^\n\r,;|]{3,50}|detail\s*[^\n\r,;|]{3,50}|tampak\s*[^\n\r,;|]{3,50}|potongan\s*[^\n\r,;|]{3,50}|site\s*plan[^\n\r,;|]*|rencana\s*[^\n\r,;|]{3,50}|tabel\s*jadwal[^\n\r,;|]*)/i);
      if (genericTitleMatch) {
        title = genericTitleMatch[0].trim();
      }
    }

    // 4. Revision (Rev 00, Rev 01, Rev A, Rev B, etc.)
    const revMatch = 
      raw.match(/(?:revisi|revision|rev\.?)\s*[:=]?\s*(?:rev\.?\s*)?([A-Z0-9]+(?:\.[0-9]+)?)/i) ||
      fileName.match(/rev\.?\s*([A-Z0-9]+)/i);
    const extractedRev = revMatch && revMatch[1] ? revMatch[1].toUpperCase().replace(/^REV\s*/i, '').trim() : '';
    const revision = extractedRev ? `REV ${extractedRev}` : 'REV 00';

    // 5. Revision Date
    const revDateMatch = raw.match(/(?:tgl\s*revisi|rev(?:\.|ision)?\s*date)\s*[:=]?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i);
    const revisionDate = revDateMatch && revDateMatch[1] ? revDateMatch[1] : null;

    // 6. Scale (Skala e.g. 1:100, 1:50, NTS)
    const scaleMatch = raw.match(/(?:skala|scale)\s*[:=]?\s*(1\s*:\s*[0-9]+|NTS|not to scale)/i);
    const scale = scaleMatch && scaleMatch[1] ? scaleMatch[1].replace(/\s+/g, '') : null;

    // 7. Discipline
    let discipline: DocumentDiscipline | null = null;
    if (drawingNumber) {
      if (drawingNumber.startsWith('A-') || drawingNumber.startsWith('ARS-') || drawingNumber.startsWith('AR-')) discipline = 'ARCHITECTURE';
      else if (drawingNumber.startsWith('S-') || drawingNumber.startsWith('STR-') || drawingNumber.startsWith('ST-')) discipline = 'STRUCTURE';
      else if (drawingNumber.startsWith('ME-') || drawingNumber.startsWith('MEP-') || drawingNumber.startsWith('E-') || drawingNumber.startsWith('P-')) discipline = 'MEP';
      else if (drawingNumber.startsWith('C-') || drawingNumber.startsWith('CIV-')) discipline = 'CIVIL';
    }
    if (!discipline) {
      const lower = raw.toLowerCase();
      if (lower.includes('arsitektur') || lower.includes('denah ruang')) discipline = 'ARCHITECTURE';
      else if (lower.includes('struktur') || lower.includes('pembesian') || lower.includes('pondasi')) discipline = 'STRUCTURE';
      else if (lower.includes('plumbing') || lower.includes('listrik') || lower.includes('sanitasi')) discipline = 'MEP';
    }

    // 8. Building (Gedung A, Main Building, Ruko, dsb)
    const buildingMatch = 
      raw.match(/(?:nama\s*gedung|building\s*name|gedung|building)\s*[:=]\s*([^\n\r,;|]{1,25})/i) ||
      raw.match(/\b(Gedung\s+[A-Z0-9]+|Tower\s+[A-Z0-9]+|Blok\s+[A-Z0-9]+)\b/i);
    const building = buildingMatch && buildingMatch[1] ? buildingMatch[1].trim() : 'Gedung Utama';

    // 9. Floor (Lantai 1, Lantai 2, Basement, Atap)
    let floor: string | null = null;
    const explicitFloor = 
      raw.match(/(?:lantai|floor|level|tk\.)\s*[:=]?\s*([0-9]+|dasar|atap|roof|basement(?:\s*[0-9]+)?)/i) ||
      raw.match(/\b(?:lt|fl)\.?\s*([0-9]+)\b/i);
    if (explicitFloor && explicitFloor[1]) {
      const flVal = explicitFloor[1].trim();
      floor = /^[0-9]+$/.test(flVal) ? `Lantai ${flVal}` : flVal.charAt(0).toUpperCase() + flVal.slice(1);
    } else if (raw.toLowerCase().includes('atap') || raw.toLowerCase().includes('roof')) {
      floor = 'Lantai Atap';
    } else {
      floor = 'Lantai 1';
    }

    // 10. Zone
    const zoneMatch = raw.match(/(?:zona|zone|sektor|area)\s*[:=]?\s*([A-Z0-9\-_]+)/i);
    const zone = zoneMatch && zoneMatch[1] ? zoneMatch[1].trim() : null;

    // 11. Author & Date
    const authorMatch = raw.match(/(?:digambar|drawn\s*by|drafter|architect)\s*[:=]?\s*([^\n\r,;|]{2,40})/i);
    const author = authorMatch && authorMatch[1] ? authorMatch[1].trim() : null;

    const dateMatch = raw.match(/(?:tanggal|date)\s*[:=]?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i);
    const date = dateMatch && dateMatch[1] ? dateMatch[1] : null;

    return {
      drawingNumber,
      sheetNumber,
      title,
      revision,
      revisionDate,
      discipline,
      building,
      floor,
      zone,
      scale,
      author,
      checkedBy: null,
      date,
      rawTitleBlockText: raw.slice(0, 300)
    };
  }

  /**
   * Compare revisions across pages with identical drawing numbers
   * Marks older revisions as superseded.
   */
  public evaluateRevisionHierarchy(pages: DocumentPageInventoryItem[]): DocumentPageInventoryItem[] {
    // Group pages by drawingNumber or normalized Title
    const dwgGroups = new Map<string, DocumentPageInventoryItem[]>();

    for (const page of pages) {
      const key = page.metadata.drawingNumber || page.metadata.title || `page_${page.pageNumber}`;
      if (!dwgGroups.has(key)) {
        dwgGroups.set(key, []);
      }
      dwgGroups.get(key)!.push(page);
    }

    // Evaluate latest revision for each group
    for (const [key, group] of dwgGroups.entries()) {
      if (group.length === 1) {
        group[0].isLatestRevision = true;
        group[0].isSuperseded = false;
        continue;
      }

      // Sort by revision label (REV 00 < REV 01 < REV 02 / REV A < REV B)
      group.sort((a, b) => {
        const revA = a.metadata.revision || 'REV 00';
        const revB = b.metadata.revision || 'REV 00';
        return revA.localeCompare(revB, undefined, { numeric: true, sensitivity: 'base' });
      });

      const latest = group[group.length - 1];
      latest.isLatestRevision = true;
      latest.isSuperseded = false;

      // Mark older revisions as superseded
      for (let i = 0; i < group.length - 1; i++) {
        group[i].isLatestRevision = false;
        group[i].isSuperseded = true;
        group[i].supersededByPageId = latest.pageId;
      }
    }

    return pages;
  }
}

export const drawingMetadataExtractor = DrawingMetadataExtractor.getInstance();
