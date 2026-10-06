/**
 * EZRAB DED → RAB Evidence-Driven Pipeline
 * DedMeasurement Layer: Canonical Intermediate Structure
 *
 * Purpose: Bridge between AI Vision evidence and Deterministic Quantity Engine.
 * AI reads → Evidence extracted → Measurements built → Quantity calculated deterministically.
 *
 * INVARIANT: AI NEVER calculates final quantity. AI provides parameters.
 *            Deterministic Engine computes quantity from parameters.
 */

// ============================================================================
// 1. DED EVIDENCE
// ============================================================================

export interface DedEvidence {
  page: number;
  drawingType?: string;
  drawingTitle?: string;
  sourceText?: string;
  region?: { x: number; y: number; w: number; h: number };
  dimensions?: Record<string, number | string>;
  confidence?: number;
}

// ============================================================================
// 2. DED MEASUREMENT
// ============================================================================

export type ElementType =
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'foundation'
  | 'beam'
  | 'column'
  | 'slab'
  | 'door'
  | 'window'
  | 'roof'
  | 'plumbing'
  | 'electrical'
  | 'earthwork'
  | 'finishing'
  | 'sanitary'
  | 'painting'
  | 'other';

export type QuantityMethod =
  | 'AREA'
  | 'LENGTH'
  | 'VOLUME'
  | 'COUNT'
  | 'WEIGHT';

export type MeasurementSource =
  | 'DED'             // Extracted from DED drawing
  | 'DED_CROSS_PAGE'  // Resolved by cross-page linking
  | 'PROJECT'         // From project metadata
  | 'USER'            // User-supplied
  | 'INFERENCE';      // Inferred from related measurements (e.g., plaster = 2×wall area)

export interface DedMeasurement {
  id: string;
  workItemId: string;
  workType: string;
  elementType: ElementType;
  quantityMethod: QuantityMethod;
  dimensions: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    thickness?: number | null;
    depth?: number | null;
    count?: number | null;
    perimeter?: number | null;
    area?: number | null;
    crossSectionArea?: number | null;
  };
  specification?: {
    material?: string;
    size?: string;
    reinforcement?: string;
    finish?: string;
    grade?: string;
    mixRatio?: string;
  };
  evidence: DedEvidence[];
  source: MeasurementSource;
  confidence: number; // 0-1
}

// ============================================================================
// 3. QUANTITY CALCULATION RESULT (Deterministic)
// ============================================================================

export interface QuantityCalculationInput {
  name: string;
  value: number | string;
  unit: string;
  source: string;
}

export interface QuantityCalculationResult {
  value: number | null;
  unit: string;
  formula: string;
  inputs: QuantityCalculationInput[];
  evidence: DedEvidence[];
  method: QuantityMethod;
  confidence: number; // 0-1
  source: 'DETERMINISTIC_ENGINE';
  unresolvedReason?: string;
}

// ============================================================================
// 4. PROVENANCE TRACKING
// ============================================================================

import { ItemProvenance, ItemProvenanceSource } from '../types';

export type ProvenanceSource = ItemProvenanceSource;
export type { ItemProvenance };

// ============================================================================
// 5. MEASUREMENT EXTRACTION FROM CONTEXT
// ============================================================================

import {
  DedContextMemory,
  FullAiWorkItem,
  RoomDefinition,
  DimensionConstraint,
  ScheduleItem,
  DrawingElement,
} from '../types';

/**
 * Extracts DedMeasurement objects from DedContextMemory for a given work item.
 * This is the canonical bridge between AI-extracted evidence and deterministic calculation.
 */
export class MeasurementExtractor {
  private static instance: MeasurementExtractor;

  private constructor() {}

  public static getInstance(): MeasurementExtractor {
    if (!MeasurementExtractor.instance) {
      MeasurementExtractor.instance = new MeasurementExtractor();
    }
    return MeasurementExtractor.instance;
  }

  /**
   * Build a DedMeasurement for a work item using actual evidence from DED context.
   */
  public extractMeasurement(
    item: FullAiWorkItem,
    context: DedContextMemory
  ): DedMeasurement {
    const name = item.name.toLowerCase();
    const cat = item.category.toLowerCase();

    // Determine element type
    const elementType = this.classifyElementType(name, cat);
    const quantityMethod = this.classifyQuantityMethod(item.quantityUnit, elementType, name);

    // Collect evidence from context
    const evidence = this.gatherEvidence(item, context);
    const dimensions = this.extractDimensions(item, context, elementType);
    const specification = this.extractSpecification(item, context);

    const confidence = this.calculateConfidence(dimensions, evidence);

    return {
      id: `meas-${item.id}`,
      workItemId: item.id,
      workType: item.name,
      elementType,
      quantityMethod,
      dimensions,
      specification,
      evidence,
      source: evidence.length > 0 ? 'DED' : 'INFERENCE',
      confidence,
    };
  }

  /**
   * Classifies element type from work item name and category.
   */
  private classifyElementType(name: string, cat: string): ElementType {
    if (name.includes('pondasi') || name.includes('galian') || name.includes('urugan') || name.includes('aanstamping')) return 'foundation';
    if (name.includes('sloof') || name.includes('ring') && name.includes('balk') || name.includes('balok')) return 'beam';
    if (name.includes('kolom')) return 'column';
    if (name.includes('pelat') || name.includes('dak')) return 'slab';
    if (name.includes('dinding') || name.includes('pasangan bata') || name.includes('plesteran') || name.includes('acian')) return 'wall';
    if (name.includes('keramik') && !name.includes('dinding') || name.includes('lantai')) return 'floor';
    if (name.includes('plafon') || name.includes('langit')) return 'ceiling';
    if (name.includes('pintu')) return 'door';
    if (name.includes('jendela') || name.includes('kaca')) return 'window';
    if (name.includes('atap') || name.includes('kuda') || name.includes('spandek') || name.includes('nok') || name.includes('lisplank')) return 'roof';
    if (name.includes('pipa') || name.includes('kloset') || name.includes('kran') || name.includes('floor drain') || name.includes('septic')) return 'plumbing';
    if (name.includes('listrik') || name.includes('lampu') || name.includes('saklar') || name.includes('stop kontak') || name.includes('mcb') || name.includes('panel')) return 'electrical';
    if (name.includes('cat') || name.includes('pengecatan')) return 'painting';
    if (name.includes('sanitair') || name.includes('sanitary')) return 'sanitary';
    if (cat.includes('persiapan') || cat.includes('tanah')) return 'earthwork';
    if (name.includes('kusen')) return 'door'; // kusen is part of door/window work
    return 'other';
  }

  /**
   * Determines quantity method from unit, element type, and item name.
   */
  private classifyQuantityMethod(unit: string, elementType: ElementType, itemName: string = ''): QuantityMethod {
    const name = itemName.toLowerCase();
    if (
      name.includes('pembesian') ||
      name.includes('tulangan') ||
      (name.includes('besi') && (name.includes('beton') || name.includes('ulir') || name.includes('polos') || name.includes('d12') || name.includes('d10') || name.includes('d8')))
    ) {
      return 'WEIGHT';
    }

    const u = (unit || '').toLowerCase().trim();
    if (u === 'm³' || u === 'm3' || u === 'kubik') return 'VOLUME';
    if (u === 'm²' || u === 'm2' || u === 'persegi') return 'AREA';
    if (u === 'm' || u === "m'" || u === 'meter' || u === 'ml') return 'LENGTH';
    if (u === 'kg' || u === 'kilogram' || u === 'ton') return 'WEIGHT';
    if (u === 'unit' || u === 'buah' || u === 'bh' || u === 'set' || u === 'titik' || u === 'ttk') return 'COUNT';
    if (u === 'ls') return 'COUNT';

    // Infer from element type if unit is ambiguous
    if (elementType === 'floor' || elementType === 'ceiling' || elementType === 'wall' || elementType === 'painting' || elementType === 'roof') return 'AREA';
    if (elementType === 'foundation' || elementType === 'beam' || elementType === 'column' || elementType === 'slab') return 'VOLUME';
    if (elementType === 'door' || elementType === 'window' || elementType === 'plumbing' || elementType === 'electrical' || elementType === 'sanitary') return 'COUNT';
    return 'AREA';
  }

  /**
   * Gathers evidence from context for a work item.
   * Uses actual page data, not hardcoded references.
   */
  private gatherEvidence(item: FullAiWorkItem, context: DedContextMemory): DedEvidence[] {
    const evidence: DedEvidence[] = [];

    // From item's own source pages
    for (const pageNum of item.sourcePages) {
      const page = context.pages.get(pageNum);
      if (page) {
        evidence.push({
          page: pageNum,
          drawingType: page.drawingType,
          drawingTitle: page.drawingTitle,
          sourceText: item.sourceEvidence.find(e => e.includes(`${pageNum}`)) || page.drawingTitle,
          confidence: page.readStatus === 'READ' ? 0.9 : 0.5,
        });
      }
    }

    // From dimensions that reference this item
    const relevantDims = this.findRelevantDimensions(item, context);
    for (const dim of relevantDims) {
      const page = context.pages.get(dim.pageNumber);
      evidence.push({
        page: dim.pageNumber,
        drawingType: page?.drawingType,
        drawingTitle: dim.drawingTitle,
        sourceText: `${dim.elementRef}: ${dim.rawText}`,
        dimensions: { [dim.dimensionType.toLowerCase()]: dim.value },
        confidence: dim.confidence === 'HIGH' ? 0.95 : dim.confidence === 'MEDIUM' ? 0.8 : 0.6,
      });
    }

    return evidence;
  }

  /**
   * Extracts actual dimensions from context for a work item.
   * Uses rooms, dimensions, schedules, and elements - NOT hardcoded values.
   */
  private extractDimensions(
    item: FullAiWorkItem,
    context: DedContextMemory,
    elementType: ElementType
  ): DedMeasurement['dimensions'] {
    const dims: DedMeasurement['dimensions'] = {};
    const name = item.name.toLowerCase();

    // 1. Use item's own extracted dimensions
    if (item.dimensions.lengthM !== undefined) dims.length = item.dimensions.lengthM;
    if (item.dimensions.widthM !== undefined) dims.width = item.dimensions.widthM;
    if (item.dimensions.heightM !== undefined) dims.height = item.dimensions.heightM;
    if (item.dimensions.thicknessM !== undefined) dims.thickness = item.dimensions.thicknessM;
    if (item.dimensions.depthM !== undefined) dims.depth = item.dimensions.depthM;
    if (item.dimensions.areaM2 !== undefined) dims.area = item.dimensions.areaM2;
    if (item.dimensions.count !== undefined) dims.count = item.dimensions.count;

    // 2. For floor/ceiling types, use room data
    if (elementType === 'floor' || elementType === 'ceiling' || elementType === 'painting') {
      const relevantRooms = this.findRelevantRooms(item, context);
      if (relevantRooms.length > 0) {
        const totalArea = relevantRooms.reduce((acc, r) => {
          if (typeof r.areaM2 === 'number' && r.areaM2 > 0) return acc + r.areaM2;
          return acc;
        }, 0);
        const totalPerimeter = relevantRooms.reduce((acc, r) => {
          if (typeof r.perimeterM === 'number' && r.perimeterM > 0) return acc + r.perimeterM;
          return acc;
        }, 0);
        if (totalArea > 0) dims.area = +totalArea.toFixed(2);
        if (totalPerimeter > 0) dims.perimeter = +totalPerimeter.toFixed(2);
      }
    }

    // 3. For wall types, calculate from perimeter and height
    if (elementType === 'wall') {
      const allRooms = context.rooms.filter(r => typeof r.perimeterM === 'number' && r.perimeterM > 0);
      if (allRooms.length > 0) {
        const totalPerimeter = allRooms.reduce((acc, r) => acc + r.perimeterM, 0);
        dims.perimeter = +totalPerimeter.toFixed(2);
      }
      // Get wall height from dimensions
      const wallHeightDim = context.dimensions.find(d =>
        d.dimensionType === 'HEIGHT' &&
        (d.elementRef.toLowerCase().includes('dinding') || d.elementRef.toLowerCase().includes('wall'))
      );
      if (wallHeightDim) dims.height = wallHeightDim.value;
    }

    // 4. For schedule-based items (doors, windows), use schedule data
    if (elementType === 'door' || elementType === 'window') {
      const relevantSchedules = this.findRelevantSchedules(item, context);
      if (relevantSchedules.length > 0) {
        dims.count = relevantSchedules.reduce((acc, s) => acc + s.count, 0);
        // Use first schedule for dimensions
        const first = relevantSchedules[0];
        if (first.widthM > 0) dims.width = first.widthM;
        if (first.heightM > 0) dims.height = first.heightM;
      }
    }

    // 5. For counted items (electrical, plumbing, sanitary), count from elements
    if (elementType === 'electrical' || elementType === 'sanitary') {
      const relevantElements = this.findRelevantElements(item, context);
      if (relevantElements.length > 0) {
        dims.count = relevantElements.length;
      }
    }

    // 6. For structural elements, look for dimension constraints
    if (elementType === 'foundation' || elementType === 'beam' || elementType === 'column') {
      const relevantDims = this.findRelevantDimensions(item, context);
      for (const dim of relevantDims) {
        switch (dim.dimensionType) {
          case 'LENGTH': dims.length = dim.value; break;
          case 'WIDTH': dims.width = dim.value; break;
          case 'HEIGHT': dims.height = dim.value; break;
          case 'DEPTH': dims.depth = dim.value; break;
          case 'THICKNESS': dims.thickness = dim.value; break;
          case 'AREA': dims.area = dim.value; break;
          case 'COUNT': dims.count = dim.value; break;
        }
      }
    }

    return dims;
  }

  /**
   * Extracts specification from context.
   */
  private extractSpecification(
    item: FullAiWorkItem,
    context: DedContextMemory
  ): DedMeasurement['specification'] {
    const spec: DedMeasurement['specification'] = {};

    // From item specification
    if (item.specification && item.specification !== '-') {
      spec.material = item.specification;
    }

    // From schedule material
    const schedules = this.findRelevantSchedules(item, context);
    if (schedules.length > 0 && schedules[0].material) {
      spec.material = schedules[0].material;
    }

    // From drawing elements
    const elements = this.findRelevantElements(item, context);
    for (const el of elements) {
      if (el.materialSpecification) {
        spec.material = el.materialSpecification;
        break;
      }
    }

    // Extract size from specification text
    const specText = item.specification.toLowerCase();
    const sizeMatch = specText.match(/(\d+)\s*[x×]\s*(\d+)/);
    if (sizeMatch) {
      spec.size = `${sizeMatch[1]}x${sizeMatch[2]}`;
    }

    // Extract reinforcement
    const rebarMatch = specText.match(/(\d+)\s*[dD]\s*(\d+)/);
    if (rebarMatch) {
      spec.reinforcement = `${rebarMatch[1]}D${rebarMatch[2]}`;
    }

    // Extract mix ratio
    const mixMatch = specText.match(/1\s*:\s*(\d+)/);
    if (mixMatch) {
      spec.mixRatio = `1:${mixMatch[1]}`;
    }

    // Extract grade
    const gradeMatch = specText.match(/[kK]-?\s*(\d{3})/);
    if (gradeMatch) {
      spec.grade = `K-${gradeMatch[1]}`;
    }

    return spec;
  }

  /**
   * Finds rooms relevant to a work item.
   */
  public findRelevantRooms(item: FullAiWorkItem, context: DedContextMemory): RoomDefinition[] {
    const name = item.name.toLowerCase();

    // Bathroom-specific items
    if (name.includes('kamar mandi') || name.includes('km/wc') || name.includes('wc') || name.includes('25x25') || name.includes('waterproofing')) {
      return context.rooms.filter(r => {
        const rName = r.name.toLowerCase();
        return rName.includes('kamar mandi') || rName.includes('km') || rName.includes('wc') || rName.includes('toilet');
      });
    }

    // Main floor area (excluding bathrooms)
    if (name.includes('keramik') && (name.includes('40x40') || name.includes('utama'))) {
      const bathroomRooms = context.rooms.filter(r => {
        const rName = r.name.toLowerCase();
        return rName.includes('kamar mandi') || rName.includes('km') || rName.includes('wc') || rName.includes('toilet');
      });
      const bathroomIds = new Set(bathroomRooms.map(r => r.id));
      return context.rooms.filter(r => !bathroomIds.has(r.id));
    }

    // Plafon, cat, etc. - all rooms
    return context.rooms;
  }

  /**
   * Finds schedules relevant to a work item.
   */
  private findRelevantSchedules(item: FullAiWorkItem, context: DedContextMemory): ScheduleItem[] {
    const name = item.name.toLowerCase();

    // Specific marks first
    if (name.includes('p1') || name.includes('p-1') || name.includes('pintu 1')) {
      const match = context.schedules.filter(s => s.mark.toLowerCase() === 'p1');
      if (match.length > 0) return match;
    }
    if (name.includes('p2') || name.includes('p-2') || name.includes('pintu 2')) {
      const match = context.schedules.filter(s => s.mark.toLowerCase() === 'p2');
      if (match.length > 0) return match;
    }
    if (name.includes('j1') || name.includes('j-1') || name.includes('jendela 1')) {
      const match = context.schedules.filter(s => s.mark.toLowerCase() === 'j1');
      if (match.length > 0) return match;
    }
    if (name.includes('j2') || name.includes('j-2') || name.includes('jendela 2')) {
      const match = context.schedules.filter(s => s.mark.toLowerCase() === 'j2');
      if (match.length > 0) return match;
    }
    if (name.includes('j3') || name.includes('j-3') || name.includes('jendela 3')) {
      const match = context.schedules.filter(s => s.mark.toLowerCase() === 'j3');
      if (match.length > 0) return match;
    }

    if (name.includes('pintu') && !name.includes('pvc') && !name.includes('kamar mandi')) {
      return context.schedules.filter(s => s.scheduleType === 'DOOR' && !s.mark.toLowerCase().includes('pvc'));
    }
    if (name.includes('pintu pvc') || (name.includes('pintu') && name.includes('kamar mandi'))) {
      return context.schedules.filter(s => s.scheduleType === 'DOOR' && (s.mark.toLowerCase().includes('pvc') || s.notes?.toLowerCase().includes('pvc')));
    }
    if (name.includes('jendela') || name.includes('kaca')) {
      return context.schedules.filter(s => s.scheduleType === 'WINDOW' || s.scheduleType === 'DOOR_WINDOW_COMBO');
    }
    if (name.includes('kusen')) {
      return context.schedules;
    }

    return [];
  }

  /**
   * Finds drawing elements relevant to a work item.
   */
  private findRelevantElements(item: FullAiWorkItem, context: DedContextMemory): DrawingElement[] {
    const name = item.name.toLowerCase();

    return context.drawings.filter(el => {
      const elDesc = (el.description || '').toLowerCase();
      const elTag = (el.tagOrLabel || '').toLowerCase();

      // Match by keyword overlap
      if (name.includes('lampu') || name.includes('titik instalasi')) {
        return elDesc.includes('lampu') || elDesc.includes('downlight') || elTag.includes('lampu');
      }
      if (name.includes('saklar tunggal')) {
        return elDesc.includes('saklar tunggal') || elTag.includes('saklar tunggal');
      }
      if (name.includes('saklar ganda') || name.includes('saklar seri')) {
        return elDesc.includes('saklar ganda') || elDesc.includes('saklar seri') || elTag.includes('saklar ganda');
      }
      if (name.includes('stop kontak')) {
        return elDesc.includes('stop kontak') || elTag.includes('stop kontak');
      }
      if (name.includes('kloset')) {
        return elDesc.includes('kloset') || elTag.includes('kloset');
      }

      return false;
    });
  }

  /**
   * Finds dimension constraints relevant to a work item.
   */
  private findRelevantDimensions(item: FullAiWorkItem, context: DedContextMemory): DimensionConstraint[] {
    const name = item.name.toLowerCase();

    return context.dimensions.filter(d => {
      const ref = d.elementRef.toLowerCase();

      if (name.includes('pondasi') && (ref.includes('pondasi') || ref.includes('foundation'))) return true;
      if (name.includes('sloof') && (ref.includes('sloof') || ref.includes('sl'))) return true;
      if (name.includes('kolom') && (ref.includes('kolom') || ref.includes('k1') || ref.includes('column'))) return true;
      if (name.includes('ring') && name.includes('balk') && (ref.includes('ring') || ref.includes('rb') || ref.includes('ringbalk'))) return true;
      if (name.includes('dinding') && (ref.includes('dinding') || ref.includes('wall'))) return true;
      if (name.includes('pelat') && (ref.includes('pelat') || ref.includes('slab') || ref.includes('dak'))) return true;

      return false;
    });
  }

  /**
   * Calculates confidence based on available dimensions and evidence.
   */
  private calculateConfidence(
    dims: DedMeasurement['dimensions'],
    evidence: DedEvidence[]
  ): number {
    let score = 0;
    let factors = 0;

    // Evidence availability
    if (evidence.length > 0) { score += 0.3; factors++; }
    if (evidence.length > 2) { score += 0.1; factors++; }

    // Dimension completeness
    const hasDims = Object.values(dims).some(v => v !== undefined && v !== null && v > 0);
    if (hasDims) { score += 0.3; factors++; }

    // Multiple dimension axes
    const dimCount = Object.values(dims).filter(v => v !== undefined && v !== null && v > 0).length;
    if (dimCount >= 2) { score += 0.2; factors++; }
    if (dimCount >= 3) { score += 0.1; factors++; }

    return factors > 0 ? Math.min(1, score) : 0;
  }
}

export const measurementExtractor = MeasurementExtractor.getInstance();
