/**
 * Cross-Reference Detector (Phase 6.2)
 *
 * Scans drawing and page text to detect structural & architectural entity identifiers
 * (K1, K2, S1, B1, P1, D1, J1, W1, etc.) and their contextual parameters.
 *
 * STRICT PRINCIPLE:
 * Identifier is only EVIDENCE, NOT automatically the same physical entity!
 * Preserves Floor Awareness (e.g. Column K1 on Floor 1 vs Column K1 on Floor 2).
 */

import { CrossReferenceEvidence, CrossReferenceCategory } from '../../src/domain/document/drawingGraphTypes';
import { DocumentPageInventoryItem } from '../../src/domain/document/documentSetTypes';

export class CrossReferenceDetector {
  private static instance: CrossReferenceDetector;

  private constructor() {}

  public static getInstance(): CrossReferenceDetector {
    if (!CrossReferenceDetector.instance) {
      CrossReferenceDetector.instance = new CrossReferenceDetector();
    }
    return CrossReferenceDetector.instance;
  }

  /**
   * Extract cross references from a page or drawing text
   */
  public detectCrossReferences(params: {
    drawingId: string;
    page: DocumentPageInventoryItem;
    building: string;
    floor: string;
    zone: string | null;
  }): CrossReferenceEvidence[] {
    const { drawingId, page, building, floor, zone } = params;
    const text = page.extractedText || '';
    const results: CrossReferenceEvidence[] = [];
    const seenKeys = new Set<string>();

    // 1. Structural Column Patterns: K1, K2, K-1, K1A, Kolom Praktis KP1, etc.
    const columnRegex = /\b(?:kolom\s*praktis\s*|kolom\s*struktur\s*|kolom\s*|pedestal\s*|)(\b(?:KP|K|COL)[-_]?[0-9]{1,3}[A-Z]?\b)/gi;
    let match: RegExpExecArray | null;
    while ((match = columnRegex.exec(text)) !== null) {
      const id = match[1].toUpperCase().replace(/[-_]/g, '');
      if (id.length < 2 || id.length > 6) continue;
      const key = `${id}_COLUMN_${floor}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const snippet = this.extractSnippet(text, match.index, 60);
        const params = this.extractParameters(snippet, 'COLUMN');
        results.push({
          referenceId: `xref_${drawingId}_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          identifier: id,
          category: 'COLUMN',
          building,
          floor,
          zone,
          sourceDrawingId: drawingId,
          sourcePageId: page.pageId,
          contextSnippet: snippet,
          parameters: params,
          confidence: 0.92
        });
      }
    }

    // 2. Structural Beam Patterns: B1, B2, TB1, RB1, Sloof S1, SL1, Balok B1, etc.
    const beamRegex = /\b(?:balok\s*induk\s*|balok\s*anak\s*|balok\s*|sloof\s*|ring\s*balk\s*|tie\s*beam\s*)(\b(?:BI|BA|RB|TB|SL|SB|S|B)[-_]?[0-9]{1,3}[A-Z]?\b)/gi;
    while ((match = beamRegex.exec(text)) !== null) {
      const id = match[1].toUpperCase().replace(/[-_]/g, '');
      if (id.length < 2 || id.length > 6) continue;
      const key = `${id}_BEAM_${floor}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const snippet = this.extractSnippet(text, match.index, 60);
        const params = this.extractParameters(snippet, 'BEAM');
        results.push({
          referenceId: `xref_${drawingId}_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          identifier: id,
          category: id.startsWith('S') || id.startsWith('SL') ? 'FOUNDATION' : 'BEAM',
          building,
          floor,
          zone,
          sourceDrawingId: drawingId,
          sourcePageId: page.pageId,
          contextSnippet: snippet,
          parameters: params,
          confidence: 0.90
        });
      }
    }

    // 3. Foundation / Footing Patterns: P1, P2, F1, F2, Poer P1, Footplate FP1
    const foundationRegex = /\b(?:pondasi\s*telapak\s*|pondasi\s*batu\s*kali|pondasi\s*|poer\s*|footplate\s*|pile\s*cap\s*)(\b(?:FP|PC|POER|P|F)[-_]?[0-9]{1,3}[A-Z]?\b)/gi;
    while ((match = foundationRegex.exec(text)) !== null) {
      const id = match[1].toUpperCase().replace(/[-_]/g, '');
      if (id.length < 2 || id.length > 6) continue;
      const key = `${id}_FOUNDATION_${floor}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const snippet = this.extractSnippet(text, match.index, 60);
        const params = this.extractParameters(snippet, 'FOUNDATION');
        results.push({
          referenceId: `xref_${drawingId}_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          identifier: id,
          category: 'FOUNDATION',
          building,
          floor,
          zone,
          sourceDrawingId: drawingId,
          sourcePageId: page.pageId,
          contextSnippet: snippet,
          parameters: params,
          confidence: 0.91
        });
      }
    }

    // 4. Door & Window Patterns: P1, P2, PJ1, D1, D2 (Pintu / Door) and J1, J2, W1, W2 (Jendela / Window)
    const doorRegex = /\b(?:pintu\s*(?:utama|kamar|toilet|depan|belakang|geser|lipat)?\s*|pintu\s*dan\s*jendela\s*|door\s*|kuseng?\s*pintu\s*)(\b(?:PJ|PT|P|D)[-_]?[0-9]{1,3}[A-Z]?\b)/gi;
    while ((match = doorRegex.exec(text)) !== null) {
      const id = match[1].toUpperCase().replace(/[-_]/g, '');
      if (id.length < 2 || id.length > 6) continue;
      const key = `${id}_DOOR_${floor}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const snippet = this.extractSnippet(text, match.index, 60);
        const params = this.extractParameters(snippet, 'DOOR');
        results.push({
          referenceId: `xref_${drawingId}_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          identifier: id,
          category: 'DOOR',
          building,
          floor,
          zone,
          sourceDrawingId: drawingId,
          sourcePageId: page.pageId,
          contextSnippet: snippet,
          parameters: params,
          confidence: 0.88
        });
      }
    }

    const windowRegex = /\b(?:jendela\s*|window\s*|ventilasi\s*|boven\s*|bv\s*)(\b(?:BV|VEN|J|W)[-_]?[0-9]{1,3}[A-Z]?\b)/gi;
    while ((match = windowRegex.exec(text)) !== null) {
      const id = match[1].toUpperCase().replace(/[-_]/g, '');
      if (id.length < 2 || id.length > 6) continue;
      const key = `${id}_WINDOW_${floor}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const snippet = this.extractSnippet(text, match.index, 60);
        const params = this.extractParameters(snippet, 'WINDOW');
        results.push({
          referenceId: `xref_${drawingId}_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          identifier: id,
          category: 'WINDOW',
          building,
          floor,
          zone,
          sourceDrawingId: drawingId,
          sourcePageId: page.pageId,
          contextSnippet: snippet,
          parameters: params,
          confidence: 0.88
        });
      }
    }

    // 5. Floor Slab Patterns: Plat Lantai PL1, S1, S2, t=12cm
    const slabRegex = /\b(?:plat\s*lantai\s*|pelat\s*lantai\s*|floor\s*slab\s*|slab\s*)(\b(?:PL|SLAB|S)[-_]?[0-9]{1,3}[A-Z]?\b)/gi;
    while ((match = slabRegex.exec(text)) !== null) {
      const id = match[1].toUpperCase().replace(/[-_]/g, '');
      if (id.length < 2 || id.length > 6) continue;
      const key = `${id}_SLAB_${floor}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const snippet = this.extractSnippet(text, match.index, 60);
        const params = this.extractParameters(snippet, 'SLAB');
        results.push({
          referenceId: `xref_${drawingId}_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          identifier: id,
          category: 'SLAB',
          building,
          floor,
          zone,
          sourceDrawingId: drawingId,
          sourcePageId: page.pageId,
          contextSnippet: snippet,
          parameters: params,
          confidence: 0.87
        });
      }
    }

    return results;
  }

  private extractSnippet(text: string, index: number, radius: number): string {
    const start = Math.max(0, index - radius / 2);
    const end = Math.min(text.length, index + radius);
    return text.substring(start, end).replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract dimension and specification parameters from local context snippet
   */
  public extractParameters(snippet: string, category: CrossReferenceCategory): Record<string, any> {
    const params: Record<string, any> = {};

    // Dimensions e.g. 25x25, 30/30, 20x40, 15/20 cm, 80x80x30
    const dimMatch = snippet.match(/([0-9]{2,4}\s*(?:x|\/|\*)\s*[0-9]{2,4}(?:\s*(?:x|\/|\*)\s*[0-9]{2,4})?)\s*(?:cm|mm)?/i);
    if (dimMatch) {
      params.dimension = dimMatch[1].replace(/\s+/g, '');
    }

    // Thickness e.g. t=12cm, tebal 15 cm
    const thickMatch = snippet.match(/(?:t|tebal|d)\s*[:=]?\s*([0-9]{1,3})\s*(?:cm|mm)/i);
    if (thickMatch) {
      params.thickness = `${thickMatch[1]} cm`;
    }

    // Concrete quality e.g. fc' 25, K-250, K-300
    const concreteMatch = snippet.match(/(?:fc'?\s*[:=]?\s*([0-9]{2,3})\s*(?:MPa)?|K[- ]?([0-9]{3}))/i);
    if (concreteMatch) {
      params.concreteQuality = concreteMatch[0];
    }

    // Rebar / Reinforcement e.g. 8 D16, 4 D13, D10-150, 6 dia 16
    const rebarMatch = snippet.match(/(?:([0-9]{1,2})\s*(?:D|dia|Ø)\s*([0-9]{1,2})|(?:D|Ø)\s*([0-9]{1,2})\s*[-@]\s*([0-9]{2,3}))/i);
    if (rebarMatch) {
      params.reinforcement = rebarMatch[0];
    }

    // Material spec e.g. Kayu Kamper, Kusen Aluminium 4", UPVC, Kaca 5mm
    const matMatch = snippet.match(/(?:aluminium\s*[0-9]"|kayu\s*[a-z]+|upvc|kaca\s*[0-9]+\s*mm|baja\s*wf|spandek)/i);
    if (matMatch) {
      params.material = matMatch[0];
    }

    return params;
  }
}
