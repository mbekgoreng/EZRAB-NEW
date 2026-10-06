import JSZip from 'jszip';
import type { DocumentBlock, ParagraphBlock, HeadingBlock, TableBlock } from './canonicalDocument';
import { generateBlockId } from './canonicalDocument';

export interface DocxImportResult {
  success: boolean;
  templateName: string;
  detectedBlocks: DocumentBlock[];
  detectedPlaceholders: string[];
  summary: {
    hasHeader: boolean;
    paragraphCount: number;
    tableCount: number;
    signatureDetected: boolean;
    hasFooter: boolean;
  };
  warnings: string[];
}

/**
 * Extract text within XML tags safely without XML parser dependencies
 */
function extractXmlText(xmlString: string): string {
  return xmlString
    .replace(/<w:p[ >]/g, '\n')
    .replace(/<w:br[^>]*>/g, '\n')
    .replace(/<w:tab[^>]*>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Detect placeholder variables in text like [NAMA PEKERJAAN] or {{project.name}}
 */
export function detectPlaceholders(text: string): string[] {
  const placeholders = new Set<string>();
  
  // 1. Bracket format: [NAMA PEKERJAAN], [NILAI RAB]
  const bracketMatches = text.match(/\[([A-Z0-9_\s\.\-]+)\]/g);
  if (bracketMatches) {
    for (const m of bracketMatches) {
      // Filter out short indices or numbers
      const inner = m.slice(1, -1).trim();
      if (inner.length > 2 && !/^\d+$/.test(inner)) {
        placeholders.add(m);
      }
    }
  }

  // 2. Mustache format: {{project.name}}, {{rab.grandTotal}}
  const mustacheMatches = text.match(/\{\{([a-zA-Z0-9_\.\-]+)\}\}/g);
  if (mustacheMatches) {
    for (const m of mustacheMatches) {
      placeholders.add(m);
    }
  }

  return Array.from(placeholders);
}

/**
 * Import and parse DOCX file buffer into canonical document blocks
 */
export async function importDocxTemplate(fileBuffer: ArrayBuffer | Uint8Array, fileName: string): Promise<DocxImportResult> {
  const warnings: string[] = [];
  const detectedBlocks: DocumentBlock[] = [];
  const detectedPlaceholders: string[] = [];

  let hasHeader = false;
  let hasFooter = false;
  let signatureDetected = false;
  let paragraphCount = 0;
  let tableCount = 0;

  try {
    const zip = await JSZip.loadAsync(fileBuffer);
    
    // Check for header/footer files
    const headerFile = zip.file(/word\/header\d*\.xml/);
    if (headerFile && headerFile.length > 0) {
      hasHeader = true;
    }

    const footerFile = zip.file(/word\/footer\d*\.xml/);
    if (footerFile && footerFile.length > 0) {
      hasFooter = true;
    }

    // Check for unsupported features
    if (zip.file(/word\/vbaProject\.bin/)) {
      warnings.push('Template mengandung Word Macro (VBA) yang dinonaktifkan demi keamanan.');
    }

    // Read main document
    const documentXmlFile = zip.file('word/document.xml');
    if (!documentXmlFile) {
      return {
        success: false,
        templateName: fileName.replace(/\.docx$/i, ''),
        detectedBlocks: [],
        detectedPlaceholders: [],
        summary: { hasHeader: false, paragraphCount: 0, tableCount: 0, signatureDetected: false, hasFooter: false },
        warnings: ['File bukan dokumen DOCX yang valid (word/document.xml tidak ditemukan).'],
      };
    }

    const documentXml = await documentXmlFile.async('text');

    // Parse paragraphs (<w:p>...</w:p>)
    const paragraphRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
    let match: RegExpExecArray | null;
    let order = 1;

    // Check if there are tables (<w:tbl>...</w:tbl>)
    const tableRegex = /<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/g;
    let tblMatch: RegExpExecArray | null;
    while ((tblMatch = tableRegex.exec(documentXml)) !== null) {
      tableCount++;
    }

    while ((match = paragraphRegex.exec(documentXml)) !== null) {
      const pXml = match[1];
      const text = extractXmlText(pXml);

      if (!text) continue;

      paragraphCount++;
      const placeholders = detectPlaceholders(text);
      for (const ph of placeholders) {
        if (!detectedPlaceholders.includes(ph)) {
          detectedPlaceholders.push(ph);
        }
      }

      // Detect signature patterns
      if (text.toLowerCase().includes('hormat kami') || 
          text.toLowerCase().includes('yang menyatakan') || 
          text.toLowerCase().includes('direktur') || 
          text.toLowerCase().includes('tanda tangan')) {
        signatureDetected = true;
      }

      // Check if heading (bold run or styled as heading)
      const isHeading = /<w:pStyle\s+w:val="(?:Heading\d|Judul\d*)"/i.test(pXml) || 
                        (text.length < 60 && text === text.toUpperCase() && !text.includes(':') && !text.includes('.'));

      if (isHeading) {
        detectedBlocks.push({
          id: generateBlockId(),
          type: 'heading',
          order: order++,
          text,
          level: 1,
          align: 'center',
        });
      } else {
        const isBold = /<w:b\/>/.test(pXml);
        const isItalic = /<w:i\/>/.test(pXml);
        const isCenter = /w:jc\s+w:val="center"/i.test(pXml);
        const isRight = /w:jc\s+w:val="right"/i.test(pXml);

        detectedBlocks.push({
          id: generateBlockId(),
          type: 'paragraph',
          order: order++,
          content: text,
          bold: isBold,
          italic: isItalic,
          align: isCenter ? 'center' : isRight ? 'right' : 'left',
        });
      }
    }

    return {
      success: true,
      templateName: fileName.replace(/\.docx$/i, ''),
      detectedBlocks,
      detectedPlaceholders,
      summary: {
        hasHeader,
        paragraphCount,
        tableCount,
        signatureDetected,
        hasFooter,
      },
      warnings,
    };
  } catch (err: any) {
    return {
      success: false,
      templateName: fileName.replace(/\.docx$/i, ''),
      detectedBlocks: [],
      detectedPlaceholders: [],
      summary: { hasHeader: false, paragraphCount: 0, tableCount: 0, signatureDetected: false, hasFooter: false },
      warnings: [`Gagal memproses file DOCX: ${err.message || 'Format tidak didukung'}`],
    };
  }
}
