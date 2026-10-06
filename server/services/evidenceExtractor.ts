/**
 * Evidence Extractor (Phase 6.3)
 *
 * Extracts granular EntityEvidence instances from DrawingGraph and DocumentSet.
 * Implements strict Source Hierarchy Priority:
 * Priority 1: STRUCTURAL_DETAIL
 * Priority 2: SECTION
 * Priority 3: STRUCTURAL_PLAN
 * Priority 4: ARCHITECTURAL_PLAN
 * Priority 5: TEXT_NOTE
 * Priority 6: AI_INFERENCE
 */

import {
  EntityEvidence,
  EvidenceSourceType
} from '../../src/domain/document/canonicalEntityTypes';
import { DrawingGraph, DrawingEntity } from '../../src/domain/document/drawingGraphTypes';
import { DocumentSet, DocumentPageInventoryItem } from '../../src/domain/document/documentSetTypes';

export class EvidenceExtractor {
  private static instance: EvidenceExtractor;

  private constructor() {}

  public static getInstance(): EvidenceExtractor {
    if (!EvidenceExtractor.instance) {
      EvidenceExtractor.instance = new EvidenceExtractor();
    }
    return EvidenceExtractor.instance;
  }

  /**
   * Determine evidence source type and numerical priority
   */
  public determineSourcePriority(dwg: DrawingEntity, pageText: string): { sourceType: EvidenceSourceType; priority: number } {
    const title = (dwg.title + ' ' + pageText).toLowerCase();

    if (title.includes('detail') || title.includes('rincian') || dwg.drawingNumber.startsWith('D-') || dwg.drawingNumber.startsWith('S-2') || dwg.drawingNumber.startsWith('S-3')) {
      return { sourceType: 'STRUCTURAL_DETAIL', priority: 1 };
    }
    if (title.includes('potongan') || title.includes('section') || dwg.drawingNumber.startsWith('A-3')) {
      return { sourceType: 'SECTION', priority: 2 };
    }
    if (dwg.discipline === 'STRUCTURAL' && (title.includes('denah') || title.includes('plan') || dwg.drawingNumber.startsWith('S-1'))) {
      return { sourceType: 'STRUCTURAL_PLAN', priority: 3 };
    }
    if (title.includes('jadwal') || title.includes('schedule') || title.includes('tabel')) {
      return { sourceType: 'SCHEDULE', priority: 4 };
    }
    if (dwg.discipline === 'ARCHITECTURAL' && (title.includes('denah') || title.includes('plan') || dwg.drawingNumber.startsWith('A-1'))) {
      return { sourceType: 'ARCHITECTURAL_PLAN', priority: 4 };
    }
    if (title.includes('spesifikasi') || title.includes('rks') || title.includes('catatan')) {
      return { sourceType: 'SPECIFICATION', priority: 5 };
    }
    if (title.includes('boq') || title.includes('rab')) {
      return { sourceType: 'BOQ_REFERENCE', priority: 5 };
    }
    return { sourceType: 'TEXT_NOTE', priority: 5 };
  }

  /**
   * Extract all evidence records from a Drawing and its associated pages
   */
  public extractEvidenceFromDrawing(
    dwg: DrawingEntity,
    pagesMap: Map<string, DocumentPageInventoryItem>
  ): EntityEvidence[] {
    const results: EntityEvidence[] = [];

    for (const pageId of dwg.pageIds) {
      const page = pagesMap.get(pageId);
      const text = page?.extractedText || dwg.title;
      const { sourceType, priority } = this.determineSourcePriority(dwg, text);

      // Extract each cross-reference as concrete evidence
      for (const xref of dwg.crossReferences) {
        // Extract quantity if present in the text snippet e.g. "12 unit", "12 bh", "14 buah", "qty: 12", "jumlah: 12"
        const qtyMatch = 
          xref.contextSnippet.match(/(?:jumlah|qty|kuantitas|total|volume)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:unit|bh|buah|titik|btg|m2|m3)?/i) ||
          xref.contextSnippet.match(/\b([0-9]+)\s*(?:unit|bh|buah|titik|btg)\b/i) ||
          text.match(new RegExp(`${xref.identifier}[^\\n\\r,;|]*?\\b([0-9]+)\\s*(?:unit|bh|buah|titik)\\b`, 'i'));

        let quantity: number | undefined = undefined;
        let unit: string = 'unit';
        if (qtyMatch && qtyMatch[1]) {
          quantity = parseFloat(qtyMatch[1]);
        }

        const gridMatch = xref.contextSnippet.match(/(?:as|grid|kolom\s*as)\s*([A-Z0-9\-\/]+)/i);
        const grid = gridMatch ? gridMatch[1] : undefined;

        results.push({
          evidenceId: `ev_${dwg.drawingId}_${xref.identifier}_${page?.pageNumber || 1}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          pageId,
          drawingId: dwg.drawingId,
          pageNumber: page?.pageNumber || 1,
          fileName: page?.fileName || dwg.title,
          sourceType,
          sourcePriority: priority,
          sourceText: xref.contextSnippet,
          extractedValue: {
            identifier: xref.identifier,
            dimensions: xref.parameters?.dimension,
            quantity,
            unit,
            material: xref.parameters?.material || xref.parameters?.concreteQuality,
            rebar: xref.parameters?.reinforcement,
            thickness: xref.parameters?.thickness,
            grid
          },
          confidence: xref.confidence,
          createdAt: new Date().toISOString()
        });
      }
    }

    return results;
  }
}
