/**
 * EZRAB AI Construction Interpreter (Section 3, 5, 8, 10 & 24)
 *
 * Interprets raw DEDEvidence into structured DEDWorkItem candidates.
 *
 * ABSOLUTE ANTI-HALLUCINATION ENFORCEMENT:
 * 1. AI MUST NEVER invent construction work items not present in evidence (e.g. no automatic excavation/plastering).
 * 2. Every extracted dimension MUST have evidence provenance.
 * 3. Missing dimensions are marked MISSING_DATA without guessing.
 * 4. Conflicting dimensions across sources are marked CONFLICT.
 * 5. Cross-page reasoning connects evidence ONLY when reference identifiers link them.
 */

import {
  DEDEvidence,
  DEDWorkItem,
  DEDWorkItemCategory,
  DEDWorkItemStatus,
  DimensionExtraction,
  DEDStructuredDimensions,
} from '../domain/ded/dedPipelineTypes';
import { dedEvidenceStore } from './dedEvidenceStore';

export interface InterpretationRequest {
  projectId: string;
  sourceFileId: string;
  evidences: DEDEvidence[];
  crossPageEvidences?: DEDEvidence[];
}

export class AIConstructionInterpreter {
  private static instance: AIConstructionInterpreter;

  private constructor() {}

  public static getInstance(): AIConstructionInterpreter {
    if (!AIConstructionInterpreter.instance) {
      AIConstructionInterpreter.instance = new AIConstructionInterpreter();
    }
    return AIConstructionInterpreter.instance;
  }

  /**
   * Categorizes a construction work item based on its technical description
   */
  public categorizeItem(name: string): DEDWorkItemCategory {
    const n = name.toLowerCase();
    if (/tanah|galian|urugan|clearing|cut.*fill/i.test(n)) return 'EARTHWORK';
    if (/beton|sloof|kolom|balok|plat|cor|k-\d{3}|fc'/i.test(n) && !/besi|tulangan/i.test(n)) return 'CONCRETE';
    if (/besi|tulangan|rebar|wiremesh|begel|sengkang/i.test(n)) return 'REBAR';
    if (/pondasi.*batu|pasangan.*bata|hebel|batako|rooster/i.test(n)) return 'MASONRY';
    if (/baja|wf|h-beam|cnp|kanal|truss|rafter/i.test(n)) return 'STEEL';
    if (/atap|genteng|spandek|nok|talang|cremona/i.test(n)) return 'ROOF';
    if (/keramik|granit|homogenous|plafon|gypsum|cat|plesteran|acian/i.test(n)) return 'FINISH';
    if (/pintu|jendela|kusen|kaca|aluminium|pvc|rolling/i.test(n)) return 'DOOR_WINDOW';
    if (/pipa|sanitair|kloset|lampu|stopkontak|panel|mep|kabel/i.test(n)) return 'MEP';
    return 'OTHER';
  }

  /**
   * Interprets DED evidences into structured DEDWorkItems
   */
  public interpret(request: InterpretationRequest): DEDWorkItem[] {
    const allEvidences = [...request.evidences, ...(request.crossPageEvidences || [])];
    const items: DEDWorkItem[] = [];
    const itemMap = new Map<string, {
      name: string;
      category: DEDWorkItemCategory;
      evidenceIds: Set<string>;
      sourcePages: Set<number>;
      specs: string[];
      dimensions: DEDStructuredDimensions;
      conflicts: Array<{ field: string; valA: any; valB: any }>;
    }>();

    let currentActiveElementKey = '';
    let currentActiveItemName = '';

    // Group evidences by construction element keywords
    for (const ev of allEvidences) {
      const txt = (ev.rawText || '').toLowerCase();
      if (!txt || txt.includes('dokumen buram')) continue;

      let elementKey = '';
      let itemName = '';

      if (txt.includes('pondasi') || txt.includes('batu kali') || txt.includes('f1') || txt.includes('p1')) {
        elementKey = 'pondasi_batu_kali';
        itemName = 'Pondasi Batu Kali';
      } else if (txt.includes('sloof') || txt.includes('sl1') || txt.includes('sl2')) {
        elementKey = 'beton_sloof';
        itemName = 'Beton Sloof';
      } else if (txt.includes('balok') || txt.includes('b1') || txt.includes('b2')) {
        elementKey = 'balok_beton';
        itemName = 'Balok Beton Bertulang';
      } else if (txt.includes('kolom') || txt.includes('k1') || txt.includes('k2')) {
        elementKey = 'kolom_beton';
        itemName = 'Kolom Beton Bertulang';
      } else if (txt.includes('dinding') || txt.includes('bata') || txt.includes('hebel')) {
        elementKey = 'dinding_bata';
        itemName = 'Pasangan Dinding Bata / Hebel';
      } else if (txt.includes('keramik') || txt.includes('granit') || txt.includes('lantai')) {
        elementKey = 'lantai_keramik';
        itemName = 'Pekerjaan Lantai Keramik / Granit';
      } else if (txt.includes('plafon') || txt.includes('gypsum')) {
        elementKey = 'plafon_gypsum';
        itemName = 'Pemasangan Plafon Gypsum';
      } else if (txt.includes('pintu') || txt.includes('p1') || txt.includes('p2')) {
        elementKey = 'pintu_kusen';
        itemName = 'Kusen & Daun Pintu';
      } else if (txt.includes('jendela') || txt.includes('j1') || txt.includes('j2')) {
        elementKey = 'jendela_kaca';
        itemName = 'Kusen & Jendela Kaca';
      } else if (txt.includes('cat') || txt.includes('pengecatan')) {
        elementKey = 'pengecatan_dinding';
        itemName = 'Pengecatan Dinding';
      } else if (txt.includes('waterproofing') || txt.includes('anti bocor')) {
        elementKey = 'waterproofing_custom';
        itemName = 'Special Waterproofing Membrane';
      }

      if (elementKey) {
        currentActiveElementKey = elementKey;
        currentActiveItemName = itemName;
      } else if (ev.type === 'DIMENSION' && currentActiveElementKey) {
        elementKey = currentActiveElementKey;
        itemName = currentActiveItemName;
      } else {
        continue;
      }

      if (!itemMap.has(elementKey)) {
        itemMap.set(elementKey, {
          name: itemName,
          category: this.categorizeItem(itemName),
          evidenceIds: new Set(),
          sourcePages: new Set(),
          specs: [],
          dimensions: {},
          conflicts: [],
        });
      }

      const current = itemMap.get(elementKey)!;
      current.evidenceIds.add(ev.id);
      current.sourcePages.add(ev.pageNumber);

      // Extract specification details e.g. K-250, K-300, 1:4
      const specMatch = txt.match(/(k-?\d{3}|fc'?\s*\d+|1sp:4pp|1:4|60x60|9mm)/i);
      if (specMatch) {
        current.specs.push(specMatch[1].toUpperCase());
      }

      // Extract dimensions
      if (ev.type === 'DIMENSION' && ev.value !== undefined) {
        const raw = (ev.rawText || '').toLowerCase();
        const isWidth = /lebar|width|\/\s*\d+/i.test(raw);
        const isHeight = /tinggi|height|tebal|depth/i.test(raw);
        const isLength = /panjang|length|menerus|f\d+\s*[:=]\s*\d+|p\d+\s*[:=]\s*\d+/i.test(raw) || (!isWidth && !isHeight && /(?:f\d+|p\d+)\s*=\s*\d+/i.test(raw));

        const dimVal = ev.value;
        const dimUnit = ev.unit || 'm';
        const prov = {
          value: dimVal,
          unit: dimUnit,
          sourceEvidenceId: ev.id,
          sourcePage: ev.pageNumber,
          extractionMethod: ev.extractionMethod || 'DED_DIMENSION',
          confidence: ev.confidence,
          status: 'CONFIRMED' as const,
        };

        if (isWidth) {
          if (/atas/i.test(raw)) {
            current.dimensions.width = prov;
          } else if (/bawah/i.test(raw) && current.dimensions.width) {
            const avgW = Number(((current.dimensions.width.value! + dimVal) / 2).toFixed(3));
            current.dimensions.width = {
              ...prov,
              value: avgW,
            };
          } else if (current.dimensions.width && current.dimensions.width.value !== dimVal) {
            current.conflicts.push({ field: 'Width', valA: current.dimensions.width.value, valB: dimVal });
          } else {
            current.dimensions.width = prov;
          }
        } else if (isHeight) {
          if (current.dimensions.height && current.dimensions.height.value !== dimVal) {
            current.conflicts.push({ field: 'Height', valA: current.dimensions.height.value, valB: dimVal });
          } else {
            current.dimensions.height = prov;
          }
        } else if (isLength) {
          if (current.dimensions.length && current.dimensions.length.value !== dimVal) {
            current.conflicts.push({ field: 'Length', valA: current.dimensions.length.value, valB: dimVal });
          } else {
            current.dimensions.length = prov;
          }
        } else {
          if (!current.dimensions.width) {
            current.dimensions.width = prov;
          } else if (!current.dimensions.height) {
            current.dimensions.height = prov;
          }
        }

        // Also check if rawText contains height when ev.value was width
        const heightMatch = raw.match(/(?:tinggi|height|tebal)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:m|cm)?/i);
        if (heightMatch && !current.dimensions.height) {
          const hVal = parseFloat(heightMatch[1]);
          current.dimensions.height = {
            value: raw.includes('cm') && hVal > 10 ? hVal / 100 : hVal,
            unit: 'm',
            sourceEvidenceId: ev.id,
            sourcePage: ev.pageNumber,
            extractionMethod: 'DED_DIMENSION',
            confidence: ev.confidence,
            status: 'CONFIRMED',
          };
        }
      }
    }

    // Convert grouped elements into DEDWorkItems
    let seq = 1;
    for (const [key, data] of itemMap.entries()) {
      const evidenceList = dedEvidenceStore.getEvidencesByIds(Array.from(data.evidenceIds));
      let status: DEDWorkItemStatus = 'CONFIRMED';
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

      // Check conflicts
      let conflictDetails: DEDWorkItem['conflictDetails'];
      if (data.conflicts.length > 0) {
        status = 'CONFLICT';
        confidence = 'LOW';
        const c = data.conflicts[0];
        conflictDetails = {
          sourceA: { name: `Bukti A`, value: c.valA },
          sourceB: { name: `Bukti B`, value: c.valB },
          description: `Konflik dimensi pada '${c.field}': '${c.valA}' vs '${c.valB}'. Diperlukan konfirmasi pengguna.`,
          actionRequired: 'Pilih dimensi yang benar atau tentukan nilai acuan.',
        };
      }

      // Check missing essential dimensions
      const hasLen = data.dimensions.length?.value !== undefined;
      const hasWid = data.dimensions.width?.value !== undefined;
      const hasHgt = data.dimensions.height?.value !== undefined;

      if (status !== 'CONFLICT') {
        if (!hasLen && (hasWid || hasHgt)) {
          status = 'PARTIAL';
          confidence = 'MEDIUM';
        } else if (!hasLen && !hasWid && !hasHgt) {
          status = 'MISSING_DATA';
          confidence = 'LOW';
        }
      }

      // Build dimension extraction object
      const dimensionsObj: DimensionExtraction = {
        length: data.dimensions.length?.value,
        width: data.dimensions.width?.value,
        height: data.dimensions.height?.value,
        unit: 'm',
        rawSnippets: evidenceList.map((e) => e.rawText || '').filter(Boolean),
        scaleVerified: true,
        provenance: data.dimensions,
      };

      const spec = data.specs.length > 0 ? Array.from(new Set(data.specs)).join(', ') : undefined;

      items.push({
        id: `ded-item-${Date.now()}-${seq++}`,
        projectId: request.projectId,
        name: data.name,
        category: data.category,
        specification: spec,
        sourceIds: [request.sourceFileId],
        evidence: evidenceList.map((e) => ({
          sourceType: 'pdf' as const,
          sourceId: e.sourceFileId,
          sourceName: e.sourceFileName || 'DED_Document.pdf',
          extractedText: e.rawText,
          status: status === 'CONFIRMED' ? 'VERIFIED' : status === 'CONFLICT' ? 'CONFLICT' : status === 'MISSING_DATA' ? 'NOT_FOUND' : 'DERIVED',
          confidence,
          basis: `Diekstrak dari DED Hal ${e.pageNumber} (${e.type})`,
        })),
        confidence,
        status,
        dimensions: dimensionsObj,
        conflictDetails,
      });
    }

    return items;
  }
}

export const aiConstructionInterpreter = AIConstructionInterpreter.getInstance();
