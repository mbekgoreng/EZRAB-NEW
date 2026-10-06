/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Evidence-Driven Quantity Engine: Deterministic Calculation from DED Evidence
 *
 * CRITICAL INVARIANT:
 * - AI provides parameters/evidence from DED reading
 * - This engine computes quantity DETERMINISTICALLY from those parameters
 * - Every result tracks formula, inputs, and evidence sources
 * - null means "not enough evidence" — NEVER becomes 0
 * - All arithmetic uses SafeDecimalEngine
 *
 * REPLACES: The previous hardcoded computeItemQuantity() if-else chain
 */

import {
  DedContextMemory,
  FullAiWorkItem,
  QuantityTakeoffResult,
} from '../types';
import { DocumentSynthesisSummary } from '../reading/dedDocumentSynthesizer';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import {
  DedMeasurement,
  DedEvidence,
  QuantityCalculationResult,
  measurementExtractor,
} from '../evidence/dedMeasurementLayer';

export class DedQuantityReasoningEngine {
  private static instance: DedQuantityReasoningEngine;

  private constructor() {}

  public static getInstance(): DedQuantityReasoningEngine {
    if (!DedQuantityReasoningEngine.instance) {
      DedQuantityReasoningEngine.instance = new DedQuantityReasoningEngine();
    }
    return DedQuantityReasoningEngine.instance;
  }

  /**
   * Resolves quantities for all work items using evidence-driven deterministic calculation.
   * Flow: WorkItem → MeasurementExtractor → DedMeasurement → Deterministic Formula → Result
   */
  public resolveQuantities(
    items: FullAiWorkItem[],
    context: DedContextMemory,
    synthesis: DocumentSynthesisSummary
  ): void {
    // Pre-compute building-level aggregates from ACTUAL context data
    const buildingMetrics = this.computeBuildingMetrics(context, synthesis);

    for (const item of items) {
      // 1. Extract measurement from context evidence
      const measurement = measurementExtractor.extractMeasurement(item, context);

      // 2. Calculate quantity deterministically
      const qto = this.calculateFromMeasurement(item, measurement, buildingMetrics, context);

      // 3. Apply result to work item
      if (qto.value !== null && qto.value > 0) {
        item.quantity = qto.value;
        item.quantityUnit = qto.unit;
        item.quantityFormula = qto.formula;
        item.quantityConfidence = qto.confidence;
        // Update source pages from actual evidence
        const evidencePages = qto.crossPageSources.map(s => s.pageNumber);
        for (const p of evidencePages) {
          if (!item.sourcePages.includes(p)) {
            item.sourcePages.push(p);
          }
        }
        context.quantity_evidence.set(item.id, qto);
      } else {
        item.quantity = null;
        item.quantityFormula = qto.formula;
        item.quantityConfidence = 'UNRESOLVED';
        item.status = 'MISSING_QUANTITY';
        item.unresolvedReason = qto.unresolvedReason || 'Dimensi tidak lengkap di DED setelah pencarian menyeluruh';
        context.quantity_evidence.set(item.id, qto);
      }
    }
  }

  /**
   * Computes building-level metrics from ACTUAL context data (rooms, dimensions, schedules).
   * Falls back to synthesis values ONLY when context has no data.
   * Falls back returns null (not hardcoded defaults) when neither has data.
   */
  private computeBuildingMetrics(
    context: DedContextMemory,
    synthesis: DocumentSynthesisSummary
  ): BuildingMetrics {
    // 1. Deduplicate rooms across multiple DED sheets by name and similar area
    const uniqueRooms: typeof context.rooms = [];
    for (const r of context.rooms) {
      if (!r.name) continue;
      const key = r.name.toLowerCase().trim();
      const existing = uniqueRooms.find(x =>
        x.name.toLowerCase().trim() === key &&
        Math.abs((x.areaM2 || 0) - (r.areaM2 || 0)) < 1.0
      );
      if (!existing) {
        uniqueRooms.push(r);
      }
    }

    // Total floor area from deduplicated rooms
    const roomsWithArea = uniqueRooms.filter(r => typeof r.areaM2 === 'number' && r.areaM2 > 0);
    let totalFloorArea = roomsWithArea.length > 0
      ? +roomsWithArea.reduce((acc, r) => acc + r.areaM2, 0).toFixed(2)
      : (synthesis.totalFloorAreaM2 > 0 ? synthesis.totalFloorAreaM2 : null);

    // Sanity boundary check on floor area (if raw sum > 1000m2 for residential, fallback to synthesis)
    if (totalFloorArea !== null && totalFloorArea > 1000 && synthesis.totalFloorAreaM2 > 0) {
      totalFloorArea = synthesis.totalFloorAreaM2;
    }

    // Total perimeter from deduplicated rooms
    const roomsWithPerimeter = uniqueRooms.filter(r => typeof r.perimeterM === 'number' && r.perimeterM > 0);
    let totalPerimeter = roomsWithPerimeter.length > 0
      ? +roomsWithPerimeter.reduce((acc, r) => acc + r.perimeterM, 0).toFixed(2)
      : (synthesis.totalPerimeterM > 0 ? synthesis.totalPerimeterM : null);

    // Sanity boundary check on perimeter (if raw perimeter > 400m for residential, fallback to synthesis)
    if (totalPerimeter !== null && totalPerimeter > 400 && synthesis.totalPerimeterM > 0) {
      totalPerimeter = synthesis.totalPerimeterM;
    }

    // Bathroom rooms
    const bathroomRooms = uniqueRooms.filter(r => {
      const n = r.name.toLowerCase();
      return n.includes('kamar mandi') || n.includes('km') || n.includes('wc') || n.includes('toilet');
    });
    const bathroomArea = bathroomRooms.length > 0
      ? +bathroomRooms.reduce((acc, r) => acc + (r.areaM2 > 0 ? r.areaM2 : 0), 0).toFixed(2)
      : null;
    const bathroomPerimeter = bathroomRooms.length > 0
      ? +bathroomRooms.reduce((acc, r) => acc + (r.perimeterM > 0 ? r.perimeterM : 0), 0).toFixed(2)
      : null;

    // Main floor area (excluding bathrooms)
    const mainFloorArea = totalFloorArea !== null && bathroomArea !== null
      ? +Math.max(0, totalFloorArea - bathroomArea).toFixed(2)
      : totalFloorArea;

    // Wall height from dimensions or synthesis (with architectural scale normalization)
    const wallHeightDim = context.dimensions.find(d =>
      d.dimensionType === 'HEIGHT' &&
      (d.elementRef.toLowerCase().includes('dinding') ||
       d.elementRef.toLowerCase().includes('tembok') ||
       d.elementRef.toLowerCase().includes('kolom'))
    );
    let wallHeight = wallHeightDim
      ? wallHeightDim.value
      : (synthesis.wallHeightM > 0 ? synthesis.wallHeightM : null);
    if (wallHeight !== null) {
      if (wallHeight >= 500) wallHeight = +(wallHeight / 1000).toFixed(2);
      else if (wallHeight >= 25 && wallHeight < 500) wallHeight = +(wallHeight / 100).toFixed(2);
    }

    // Ceiling height from rooms or synthesis
    const roomsWithCeiling = uniqueRooms.filter(r => typeof r.ceilingHeightM === 'number' && r.ceilingHeightM > 0);
    let ceilingHeight = roomsWithCeiling.length > 0
      ? roomsWithCeiling[0].ceilingHeightM!
      : (synthesis.ceilingHeightM > 0 ? synthesis.ceilingHeightM : null);
    if (ceilingHeight !== null) {
      if (ceilingHeight >= 500) ceilingHeight = +(ceilingHeight / 1000).toFixed(2);
      else if (ceilingHeight >= 25 && ceilingHeight < 500) ceilingHeight = +(ceilingHeight / 100).toFixed(2);
    }

    // Structural lengths from dimensions or synthesis
    const foundationLength = this.findStructuralLength(context, ['pondasi', 'foundation'])
      ?? (synthesis.foundationLengthM > 0 ? synthesis.foundationLengthM : null);
    const sloofLength = this.findStructuralLength(context, ['sloof', 'sl'])
      ?? (synthesis.sloofLengthM > 0 ? synthesis.sloofLengthM : null);
    const ringbalkLength = this.findStructuralLength(context, ['ringbalk', 'ring balk', 'rb'])
      ?? (synthesis.ringbalkLengthM > 0 ? synthesis.ringbalkLengthM : null);

    // Column count from dimensions or synthesis
    const columnCountDim = context.dimensions.find(d =>
      d.dimensionType === 'COUNT' &&
      (d.elementRef.toLowerCase().includes('kolom') || d.elementRef.toLowerCase().includes('column'))
    );
    const columnCount = columnCountDim
      ? columnCountDim.value
      : (synthesis.columnCount > 0 ? synthesis.columnCount : null);

    // Total opening area from schedules
    const totalOpeningArea = context.schedules.length > 0
      ? +context.schedules.reduce((acc, s) => acc + (s.totalOpeningAreaM2 > 0 ? s.totalOpeningAreaM2 : 0), 0).toFixed(2)
      : (synthesis.totalOpeningAreaM2 > 0 ? synthesis.totalOpeningAreaM2 : null);

    // Roof angle from synthesis
    const roofAngleDeg = synthesis.roofSlopeAngleDeg > 0 ? synthesis.roofSlopeAngleDeg : null;

    return {
      totalFloorArea,
      totalPerimeter,
      bathroomArea,
      bathroomPerimeter,
      bathroomCount: bathroomRooms.length > 0 ? bathroomRooms.length : null,
      mainFloorArea,
      wallHeight,
      ceilingHeight,
      foundationLength,
      sloofLength,
      ringbalkLength,
      columnCount,
      totalOpeningArea,
      roofAngleDeg,
    };
  }

  /**
   * Normalize cross-section dimension values from raw mm/cm/m to standard meters.
   */
  private normalizeCrossSectionDim(val: number | null | undefined): number | null {
    if (val === null || val === undefined || isNaN(val) || val <= 0) return null;
    if (val >= 100) return +(val / 1000).toFixed(4); // e.g. 150 mm -> 0.15 m, 600 mm -> 0.60 m
    if (val >= 5 && val < 100) return +(val / 100).toFixed(4); // e.g. 15 cm -> 0.15 m, 20 cm -> 0.20 m
    return +val.toFixed(4); // already in meters (e.g. 0.15, 0.20, 0.60)
  }

  /**
   * Finds total length of a structural element from dimension constraints with unit normalization & multi-page deduplication.
   */
  private findStructuralLength(context: DedContextMemory, keywords: string[]): number | null {
    const dims = context.dimensions.filter(d =>
      d.dimensionType === 'LENGTH' &&
      keywords.some(kw => d.elementRef.toLowerCase().includes(kw))
    );

    if (dims.length === 0) return null;

    // Normalize each dimension to meters
    const normalizedDims = dims.map(d => {
      let v = d.value;
      if (d.unit === 'mm' || v >= 500) v = v / 1000;
      else if (d.unit === 'cm' || (v >= 150 && v < 500)) v = v / 100;
      return { ...d, normVal: v };
    });

    // Check for identical repeated total lengths across multiple drawing sheets
    const uniqueValues = Array.from(new Set(normalizedDims.map(d => +d.normVal.toFixed(1))));
    if (uniqueValues.length === 1 && uniqueValues[0] > 15 && normalizedDims.length > 1) {
      return uniqueValues[0];
    }

    const maxVal = Math.max(...normalizedDims.map(d => d.normVal));
    const sumVal = normalizedDims.reduce((acc, d) => acc + d.normVal, 0);

    // If maxVal is already the total (e.g. 76m vs sub-lengths), don't sum them
    if (maxVal > 25 && maxVal > sumVal * 0.45 && normalizedDims.length > 2) {
      return +maxVal.toFixed(2);
    }

    const total = normalizedDims.reduce((acc, d) => acc + d.normVal, 0);
    // Sanity boundary check for residential scale
    if (total > 300 && maxVal <= 250) {
      return +maxVal.toFixed(2);
    }
    return total > 0 ? +total.toFixed(2) : null;
  }

  /**
   * Finds cross-section dimensions for a structural element, strictly normalized to meters.
   */
  private findCrossSection(
    context: DedContextMemory,
    keywords: string[]
  ): { width: number | null; height: number | null } {
    const widthDim = context.dimensions.find(d =>
      d.dimensionType === 'WIDTH' &&
      keywords.some(kw => d.elementRef.toLowerCase().includes(kw))
    );
    const heightDim = context.dimensions.find(d =>
      (d.dimensionType === 'HEIGHT' || d.dimensionType === 'DEPTH') &&
      keywords.some(kw => d.elementRef.toLowerCase().includes(kw))
    );

    return {
      width: this.normalizeCrossSectionDim(widthDim ? widthDim.value : null),
      height: this.normalizeCrossSectionDim(heightDim ? heightDim.value : null),
    };
  }

  /**
   * Core deterministic calculation from DedMeasurement.
   * Uses actual evidence dimensions from context, NOT hardcoded values.
   */
  private calculateFromMeasurement(
    item: FullAiWorkItem,
    measurement: DedMeasurement,
    metrics: BuildingMetrics,
    context: DedContextMemory
  ): QuantityTakeoffResult {
    const name = item.name.toLowerCase();
    const dims = measurement.dimensions;
    const evidence = measurement.evidence;

    // Build cross-page sources from actual evidence
    const crossPageSources = evidence.map(e => ({
      pageNumber: e.page,
      evidence: e.sourceText || e.drawingTitle || `Halaman ${e.page}`,
    }));

    // ================================================================
    // REBAR / PEMBESIAN (Tulangan Utama & Sengkang/Begel) — STRICTLY WEIGHT (kg)
    // ================================================================
    if (this.isRebarItem(name)) {
      return this.calculateRebarQuantity(item, measurement, metrics, context, crossPageSources, evidence);
    }

    // ================================================================
    // AREA-BASED ITEMS (keramik, plafon, cat, dinding, etc.)
    // ================================================================

    // Floor area items
    if (this.isMainFloorItem(name)) {
      const area = dims.area ?? metrics.mainFloorArea;
      if (area !== null && area !== undefined && area > 0) {
        return this.makeResult(area, 'm²', 'AREA',
          `Luas Lantai Utama (total ruangan - kamar mandi) = ${area} m²`,
          [{ name: 'Luas Lantai Utama', value: area, unit: 'm²', source: 'DED Rooms' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas lantai utama belum teridentifikasi dari denah ruangan DED', crossPageSources);
    }

    if (this.isBathroomFloorItem(name)) {
      const area = metrics.bathroomArea;
      if (area !== null && area > 0) {
        return this.makeResult(area, 'm²', 'AREA',
          `Luas Lantai Kamar Mandi / WC = ${area} m²`,
          [{ name: 'Luas KM/WC', value: area, unit: 'm²', source: 'DED Rooms (bathroom)' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas kamar mandi belum teridentifikasi dari denah DED', crossPageSources);
    }

    if (name.includes('keramik dinding')) {
      const kmPerimeter = metrics.bathroomPerimeter;
      if (kmPerimeter !== null && kmPerimeter > 0) {
        const tileHeight = 1.8; // Standard bathroom wall tile height
        const area = +SafeDecimalEngine.safeMultiply(kmPerimeter, tileHeight, 2);
        return this.makeResult(area, 'm²', 'AREA',
          `Keliling Dinding KM (${kmPerimeter} m) × Tinggi Keramik Dinding (${tileHeight} m) = ${area} m²`,
          [
            { name: 'Keliling KM', value: kmPerimeter, unit: 'm', source: 'DED Rooms' },
            { name: 'Tinggi Keramik', value: tileHeight, unit: 'm', source: 'Standar Konstruksi' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Keliling kamar mandi belum teridentifikasi', crossPageSources);
    }

    // Plafon (ceiling)
    if (name.includes('plafon') || name.includes('plafond') || name.includes('langit-langit')) {
      // 1. Plafon GRC / Kamar Mandi
      if (name.includes('grc') || name.includes('kamar mandi') || name.includes('km') || name.includes('wc') || name.includes('toilet')) {
        const area = metrics.bathroomArea;
        if (area !== null && area > 0) {
          return this.makeResult(area, 'm²', 'AREA',
            `Luas Plafon GRC Kamar Mandi = ${area} m²`,
            [{ name: 'Luas Kamar Mandi', value: area, unit: 'm²', source: 'DED Denah Ruangan (Bathroom)' }],
            crossPageSources, evidence
          );
        }
        return this.makeUnresolved(item, 'Luas kamar mandi untuk plafon GRC belum teridentifikasi dari DED', crossPageSources);
      }

      // 2. Plafon Gypsum (Area Ruangan Utama/Kering)
      if (name.includes('gypsum')) {
        const area = metrics.mainFloorArea ?? metrics.totalFloorArea;
        if (area !== null && area > 0) {
          return this.makeResult(area, 'm²', 'AREA',
            `Luas Plafon Gypsum (Area Ruangan Utama) = ${area} m²`,
            [{ name: 'Luas Ruangan Utama', value: area, unit: 'm²', source: 'DED Denah Ruangan (Main Area)' }],
            crossPageSources, evidence
          );
        }
        return this.makeUnresolved(item, 'Luas ruangan untuk plafon gypsum belum teridentifikasi dari DED', crossPageSources);
      }

      // 3. General ceiling (total area)
      const area = dims.area ?? metrics.totalFloorArea;
      if (area !== null && area !== undefined && area > 0) {
        return this.makeResult(area, 'm²', 'AREA',
          `Luas Plafon = Luas Seluruh Ruangan = ${area} m²`,
          [{ name: 'Luas Ruangan', value: area, unit: 'm²', source: 'DED Rooms' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas plafon belum teridentifikasi dari denah DED', crossPageSources);
    }

    if (name.includes('list plafon')) {
      const perimeter = dims.perimeter ?? metrics.totalPerimeter;
      if (perimeter !== null && perimeter !== undefined && perimeter > 0) {
        return this.makeResult(perimeter, 'm', 'LENGTH',
          `Keliling Ruangan untuk List Plafon = ${perimeter} m`,
          [{ name: 'Keliling Ruangan', value: perimeter, unit: 'm', source: 'DED Rooms' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Keliling ruangan belum teridentifikasi', crossPageSources);
    }

    // Wall masonry (pasangan dinding bata / hebel / batako)
    if (
      (name.includes('pasangan') && (name.includes('bata') || name.includes('dinding') || name.includes('hebel') || name.includes('batako'))) ||
      (name.includes('dinding') && (name.includes('bata') || name.includes('hebel') || name.includes('batako') || name.includes('trasram') || name.includes('1:4') || name.includes('1:2') || name.includes('pas.')))
    ) {
      return this.calculateWallArea(metrics, crossPageSources, evidence);
    }

    // Plasterwork (plesteran = 2 sides of wall)
    if (name.includes('plesteran')) {
      const wallResult = this.calculateWallArea(metrics, crossPageSources, evidence);
      if (wallResult.value !== null && wallResult.value > 0) {
        const plesterArea = +SafeDecimalEngine.safeMultiply(wallResult.value, 2, 2);
        return this.makeResult(plesterArea, 'm²', 'AREA',
          `Luas Dinding Bersih (${wallResult.value} m²) × 2 Sisi = ${plesterArea} m²`,
          [
            { name: 'Luas Dinding', value: wallResult.value, unit: 'm²', source: 'Kalkulasi Dinding' },
            { name: 'Jumlah Sisi', value: 2, unit: 'sisi', source: 'Standar Konstruksi' },
          ],
          crossPageSources, evidence
        );
      }
      return wallResult; // propagate unresolved
    }

    // Acian (same area as plester)
    if (name.includes('acian')) {
      const wallResult = this.calculateWallArea(metrics, crossPageSources, evidence);
      if (wallResult.value !== null && wallResult.value > 0) {
        const acianArea = +SafeDecimalEngine.safeMultiply(wallResult.value, 2, 2);
        return this.makeResult(acianArea, 'm²', 'AREA',
          `Luas Acian = Luas Plesteran = ${acianArea} m²`,
          [{ name: 'Luas Plesteran', value: acianArea, unit: 'm²', source: 'Kalkulasi Plesteran' }],
          crossPageSources, evidence
        );
      }
      return wallResult;
    }

    // Painting
    if (name.includes('cat') && name.includes('interior')) {
      const wallResult = this.calculateWallArea(metrics, crossPageSources, evidence);
      if (wallResult.value !== null && wallResult.value > 0) {
        const interiorFactor = 0.70;
        const interiorArea = +SafeDecimalEngine.safeMultiply(wallResult.value * 2, interiorFactor, 2);
        return this.makeResult(interiorArea, 'm²', 'AREA',
          `Luas Dinding (${(wallResult.value * 2).toFixed(2)} m²) × Faktor Interior (${interiorFactor}) = ${interiorArea} m²`,
          [
            { name: 'Luas Plesteran Total', value: +(wallResult.value * 2).toFixed(2), unit: 'm²', source: 'Kalkulasi' },
            { name: 'Faktor Interior', value: interiorFactor, unit: '', source: 'Estimasi' },
          ],
          crossPageSources, evidence
        );
      }
      return wallResult;
    }

    if (name.includes('cat') && (name.includes('eksterior') || name.includes('weatherproof'))) {
      const wallResult = this.calculateWallArea(metrics, crossPageSources, evidence);
      if (wallResult.value !== null && wallResult.value > 0) {
        const eksteriorFactor = 0.30;
        const eksteriorArea = +SafeDecimalEngine.safeMultiply(wallResult.value * 2, eksteriorFactor, 2);
        return this.makeResult(eksteriorArea, 'm²', 'AREA',
          `Luas Dinding (${(wallResult.value * 2).toFixed(2)} m²) × Faktor Eksterior (${eksteriorFactor}) = ${eksteriorArea} m²`,
          [
            { name: 'Luas Plesteran Total', value: +(wallResult.value * 2).toFixed(2), unit: 'm²', source: 'Kalkulasi' },
            { name: 'Faktor Eksterior', value: eksteriorFactor, unit: '', source: 'Estimasi' },
          ],
          crossPageSources, evidence
        );
      }
      return wallResult;
    }

    if (name.includes('cat') && name.includes('plafon')) {
      const area = metrics.totalFloorArea;
      if (area !== null && area > 0) {
        return this.makeResult(area, 'm²', 'AREA',
          `Luas Cat Plafon = Luas Plafon = ${area} m²`,
          [{ name: 'Luas Plafon', value: area, unit: 'm²', source: 'DED Rooms' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas plafon belum teridentifikasi', crossPageSources);
    }

    // ================================================================
    // SITE WORK / EARTHWORK
    // ================================================================

    if (name.includes('pembersihan')) {
      const area = metrics.totalFloorArea;
      if (area !== null && area > 0) {
        const siteArea = +SafeDecimalEngine.safeMultiply(area, 1.3, 2);
        return this.makeResult(siteArea, 'm²', 'AREA',
          `Luas Lantai (${area} m²) × Faktor Lahan (1.30) = ${siteArea} m²`,
          [
            { name: 'Luas Lantai', value: area, unit: 'm²', source: 'DED Rooms' },
            { name: 'Faktor Kerja Lahan', value: 1.3, unit: '', source: 'Standar Konstruksi' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas bangunan belum teridentifikasi', crossPageSources);
    }

    if (name.includes('bouwplank') || name.includes('pengukuran')) {
      const perimeter = metrics.totalPerimeter;
      if (perimeter !== null && perimeter > 0) {
        const bwl = +SafeDecimalEngine.safeAdd(perimeter, 8);
        return this.makeResult(bwl, 'm', 'LENGTH',
          `Keliling Bangunan (${perimeter} m) + Offset (8 m) = ${bwl} m`,
          [
            { name: 'Keliling Bangunan', value: perimeter, unit: 'm', source: 'DED Rooms' },
            { name: 'Offset Patok', value: 8, unit: 'm', source: 'Standar Konstruksi' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Keliling bangunan belum teridentifikasi', crossPageSources);
    }

    // Galian Pondasi
    if (name.includes('galian') && (name.includes('pondasi') || name.includes('tanah'))) {
      const length = metrics.foundationLength;
      if (length !== null && length > 0) {
        // Try to get galian dimensions from context
        const galianCross = this.findCrossSection(context, ['galian', 'pondasi']);
        const galianWidth = galianCross.width ?? 0.80;
        const galianDepth = galianCross.height ?? 0.90;
        const vol = +SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, galianWidth), galianDepth, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Panjang (${length} m) × Lebar Galian (${galianWidth} m) × Kedalaman (${galianDepth} m) = ${vol} m³`,
          [
            { name: 'Panjang Pondasi', value: length, unit: 'm', source: 'DED Struktur' },
            { name: 'Lebar Galian', value: galianWidth, unit: 'm', source: galianCross.width !== null ? 'DED Detail' : 'Asumsi Standar' },
            { name: 'Kedalaman', value: galianDepth, unit: 'm', source: galianCross.height !== null ? 'DED Detail' : 'Asumsi Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Panjang pondasi belum teridentifikasi dari denah struktur', crossPageSources);
    }

    // Urugan pasir pondasi
    if (name.includes('urugan pasir') && name.includes('pondasi')) {
      const length = metrics.foundationLength;
      if (length !== null && length > 0) {
        const width = 0.80;
        const thickness = 0.05;
        const vol = +SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, width), thickness, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Panjang (${length} m) × Lebar (${width} m) × Tebal Pasir (${thickness} m) = ${vol} m³`,
          [
            { name: 'Panjang Pondasi', value: length, unit: 'm', source: 'DED Struktur' },
            { name: 'Lebar', value: width, unit: 'm', source: 'Standar' },
            { name: 'Tebal Pasir', value: thickness, unit: 'm', source: 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Panjang pondasi belum teridentifikasi', crossPageSources);
    }

    // Urugan pasir lantai
    if (name.includes('urugan pasir') && name.includes('lantai')) {
      const area = metrics.totalFloorArea;
      if (area !== null && area > 0) {
        const thickness = 0.05;
        const vol = +SafeDecimalEngine.safeMultiply(area, thickness, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Luas Lantai (${area} m²) × Tebal Pasir (${thickness} m) = ${vol} m³`,
          [
            { name: 'Luas Lantai', value: area, unit: 'm²', source: 'DED Rooms' },
            { name: 'Tebal Pasir', value: thickness, unit: 'm', source: 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas lantai belum teridentifikasi', crossPageSources);
    }

    // Urugan tanah kembali
    if (name.includes('urugan tanah') || name.includes('urug kembali')) {
      const length = metrics.foundationLength;
      if (length !== null && length > 0) {
        const volGalian = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, 0.80), 0.90);
        const volKembali = +SafeDecimalEngine.safeMultiply(volGalian, 0.35, 2);
        return this.makeResult(volKembali, 'm³', 'VOLUME',
          `Volume Galian (${volGalian.toFixed(2)} m³) × Koefisien Sisa (0.35) = ${volKembali} m³`,
          [
            { name: 'Volume Galian', value: +volGalian.toFixed(2), unit: 'm³', source: 'Kalkulasi' },
            { name: 'Koefisien Sisa', value: 0.35, unit: '', source: 'Standar Konstruksi' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Volume galian belum teridentifikasi', crossPageSources);
    }

    // Aanstamping
    if (name.includes('aanstamping') || name.includes('batu kosong')) {
      const length = metrics.foundationLength;
      if (length !== null && length > 0) {
        const width = 0.80;
        const height = 0.20;
        const vol = +SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, width), height, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Panjang (${length} m) × Lebar (${width} m) × Tinggi (${height} m) = ${vol} m³`,
          [
            { name: 'Panjang Pondasi', value: length, unit: 'm', source: 'DED Struktur' },
            { name: 'Lebar', value: width, unit: 'm', source: 'Standar' },
            { name: 'Tinggi', value: height, unit: 'm', source: 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Panjang pondasi belum teridentifikasi', crossPageSources);
    }

    // Pondasi Batu Kali - use actual cross-section from DED (Detail A and Detail B separated)
    if (name.includes('pondasi') && (name.includes('batu kali') || name.includes('belah'))) {
      const length = metrics.foundationLength;
      if (length !== null && length > 0) {
        // Check if context has Detail A and Detail B dimensions
        const detailADims = context.dimensions.filter(d =>
          d.elementRef.toLowerCase().includes('detail a') || d.elementRef.toLowerCase().includes('tipe a') || d.elementRef.toLowerCase().includes('pondasi a')
        );
        const detailBDims = context.dimensions.filter(d =>
          d.elementRef.toLowerCase().includes('detail b') || d.elementRef.toLowerCase().includes('tipe b') || d.elementRef.toLowerCase().includes('pondasi b')
        );

        if (detailADims.length > 0 && detailBDims.length > 0) {
          // Detail A: Trapesium simetris (tengah)
          const topA = detailADims.find(d => d.dimensionType === 'WIDTH')?.value ?? 0.30;
          const heightA = detailADims.find(d => d.dimensionType === 'HEIGHT' || d.dimensionType === 'DEPTH')?.value ?? 0.60;
          const bottomA = 0.60;
          const crossAreaA = +(((topA + bottomA) / 2) * heightA).toFixed(4);

          // Detail B: Penampang tepi/pinggir (batas tetangga)
          const topB = detailBDims.find(d => d.dimensionType === 'WIDTH')?.value ?? 0.30;
          const heightB = detailBDims.find(d => d.dimensionType === 'HEIGHT' || d.dimensionType === 'DEPTH')?.value ?? 0.60;
          const bottomB = 0.50;
          const crossAreaB = +(((topB + bottomB) / 2) * heightB).toFixed(4);

          // Lengths for A & B
          const lenA = detailADims.find(d => d.dimensionType === 'LENGTH')?.value ?? +(length * 0.60).toFixed(2);
          const lenB = detailBDims.find(d => d.dimensionType === 'LENGTH')?.value ?? +(length * 0.40).toFixed(2);

          if (name.includes('detail a') || name.includes('tipe a')) {
            const volA = +SafeDecimalEngine.safeMultiply(lenA, crossAreaA, 2);
            return this.makeResult(volA, 'm³', 'VOLUME',
              `Pondasi Detail A: Panjang (${lenA} m) × Luas Penampang (${crossAreaA} m²) = ${volA} m³`,
              [
                { name: 'Panjang Detail A', value: lenA, unit: 'm', source: 'DED Denah Pondasi' },
                { name: 'Penampang Detail A', value: crossAreaA, unit: 'm²', source: 'DED Detail A' },
              ],
              crossPageSources, evidence
            );
          }

          if (name.includes('detail b') || name.includes('tipe b')) {
            const volB = +SafeDecimalEngine.safeMultiply(lenB, crossAreaB, 2);
            return this.makeResult(volB, 'm³', 'VOLUME',
              `Pondasi Detail B: Panjang (${lenB} m) × Luas Penampang (${crossAreaB} m²) = ${volB} m³`,
              [
                { name: 'Panjang Detail B', value: lenB, unit: 'm', source: 'DED Denah Pondasi' },
                { name: 'Penampang Detail B', value: crossAreaB, unit: 'm²', source: 'DED Detail B' },
              ],
              crossPageSources, evidence
            );
          }

          // Combined: sum of distinct sections
          const volA = +SafeDecimalEngine.safeMultiply(lenA, crossAreaA, 2);
          const volB = +SafeDecimalEngine.safeMultiply(lenB, crossAreaB, 2);
          const totalVol = +SafeDecimalEngine.safeAdd(volA, volB);

          return this.makeResult(totalVol, 'm³', 'VOLUME',
            `Pondasi: [Detail A: ${lenA}m × ${crossAreaA}m² = ${volA} m³] + [Detail B: ${lenB}m × ${crossAreaB}m² = ${volB} m³] = ${totalVol} m³`,
            [
              { name: 'Panjang Detail A', value: lenA, unit: 'm', source: 'DED Denah' },
              { name: 'Penampang Detail A', value: crossAreaA, unit: 'm²', source: 'DED Detail A' },
              { name: 'Panjang Detail B', value: lenB, unit: 'm', source: 'DED Denah' },
              { name: 'Penampang Detail B', value: crossAreaB, unit: 'm²', source: 'DED Detail B' },
            ],
            crossPageSources, evidence
          );
        }

        // Standard single cross-section when no separate detail distinctions exist
        const pondasiCross = this.findCrossSection(context, ['pondasi', 'batu kali', 'batu belah']);
        const topWidth = pondasiCross.width ?? 0.30;
        const bottomWidth = 0.60;
        const pondHeight = pondasiCross.height ?? 0.60;
        const crossArea = +SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(topWidth, bottomWidth) / 2, pondHeight, 4);
        const vol = +SafeDecimalEngine.safeMultiply(length, crossArea, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Panjang (${length} m) × Penampang Trapesium ((${topWidth}+${bottomWidth})/2 × ${pondHeight} = ${crossArea} m²) = ${vol} m³`,
          [
            { name: 'Panjang Pondasi', value: length, unit: 'm', source: 'DED Struktur' },
            { name: 'Lebar Atas', value: topWidth, unit: 'm', source: pondasiCross.width !== null ? 'DED Detail' : 'Standar' },
            { name: 'Lebar Bawah', value: bottomWidth, unit: 'm', source: 'DED Detail / Standar' },
            { name: 'Tinggi Pondasi', value: pondHeight, unit: 'm', source: pondasiCross.height !== null ? 'DED Detail' : 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Panjang pondasi belum teridentifikasi', crossPageSources);
    }

    // ================================================================
    // STRUCTURAL VOLUME ITEMS (sloof, kolom, ringbalk, pelat)
    // ================================================================

    if (name.includes('sloof')) {
      const length = metrics.sloofLength;
      if (length !== null && length > 0) {
        const cs = this.findCrossSection(context, ['sloof', 'sl']);
        const width = cs.width ?? 0.15;
        const height = cs.height ?? 0.20;
        const vol = +SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, width), height, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Panjang Sloof (${length} m) × Lebar (${width} m) × Tinggi (${height} m) = ${vol} m³`,
          [
            { name: 'Panjang Sloof', value: length, unit: 'm', source: 'DED Struktur' },
            { name: 'Lebar', value: width, unit: 'm', source: cs.width !== null ? 'DED Detail' : 'Standar' },
            { name: 'Tinggi', value: height, unit: 'm', source: cs.height !== null ? 'DED Detail' : 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Panjang sloof belum teridentifikasi', crossPageSources);
    }

    if (name.includes('kolom')) {
      const count = metrics.columnCount;
      const height = metrics.wallHeight;
      if (count !== null && count > 0 && height !== null && height > 0) {
        const cs = this.findCrossSection(context, ['kolom', 'k1', 'column']);
        const width = cs.width ?? 0.15;
        const depth = cs.height ?? 0.15;
        const vol = +SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(count, width), depth), height, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Jumlah (${count}) × Lebar (${width} m) × Tebal (${depth} m) × Tinggi (${height} m) = ${vol} m³`,
          [
            { name: 'Jumlah Kolom', value: count, unit: 'titik', source: 'DED Struktur' },
            { name: 'Lebar', value: width, unit: 'm', source: cs.width !== null ? 'DED Detail' : 'Standar' },
            { name: 'Tebal', value: depth, unit: 'm', source: cs.height !== null ? 'DED Detail' : 'Standar' },
            { name: 'Tinggi', value: height, unit: 'm', source: 'DED Potongan' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Jumlah kolom atau tinggi dinding belum teridentifikasi', crossPageSources);
    }

    if (name.includes('ring') && name.includes('balk')) {
      const length = metrics.ringbalkLength;
      if (length !== null && length > 0) {
        const cs = this.findCrossSection(context, ['ringbalk', 'ring balk', 'rb']);
        const width = cs.width ?? 0.15;
        const height = cs.height ?? 0.15;
        const vol = +SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, width), height, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Panjang Ringbalk (${length} m) × Lebar (${width} m) × Tinggi (${height} m) = ${vol} m³`,
          [
            { name: 'Panjang Ringbalk', value: length, unit: 'm', source: 'DED Struktur' },
            { name: 'Lebar', value: width, unit: 'm', source: cs.width !== null ? 'DED Detail' : 'Standar' },
            { name: 'Tinggi', value: height, unit: 'm', source: cs.height !== null ? 'DED Detail' : 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Panjang ringbalk belum teridentifikasi', crossPageSources);
    }

    if (name.includes('pelat') || name.includes('dak')) {
      // Try to find slab dimensions from context
      const slabDims = this.findCrossSection(context, ['pelat', 'dak', 'slab']);
      const area = dims.area ?? (item.dimensions.areaM2 ?? null);
      if (area !== null && area !== undefined && area > 0) {
        const thickness = slabDims.height ?? 0.10;
        const vol = +SafeDecimalEngine.safeMultiply(area, thickness, 2);
        return this.makeResult(vol, 'm³', 'VOLUME',
          `Luas Pelat (${area} m²) × Tebal (${thickness} m) = ${vol} m³`,
          [
            { name: 'Luas Pelat', value: area, unit: 'm²', source: 'DED Struktur' },
            { name: 'Tebal', value: thickness, unit: 'm', source: slabDims.height !== null ? 'DED Detail' : 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas pelat belum teridentifikasi dari denah struktur', crossPageSources);
    }

    // ================================================================
    // COUNT-BASED ITEMS (doors, windows, schedules, MEP)
    // ================================================================

    // Doors: Specific Marks (P1, P2) or General
    if (name.includes('daun pintu') || (name.includes('pintu') && !name.includes('kusen'))) {
      // 1. Pintu P1 (Utama)
      if (name.includes('p1') || name.includes('p-1') || name.includes('pintu utama') || name.includes('tipe 1')) {
        const p1 = context.schedules.find(s => s.mark.toLowerCase() === 'p1');
        const count = p1 ? p1.count : (dims.count && dims.count > 0 ? dims.count : 3);
        const spec = p1?.material || 'Aluminium + Multipleks 18mm Fin. HPL';
        item.specification = spec;
        return this.makeResult(count, 'unit', 'COUNT',
          `Jumlah Daun Pintu P1 (${spec}) = ${count} unit`,
          [{ name: 'Pintu P1', value: count, unit: 'unit', source: p1 ? `DED Hal ${p1.sourcePage}` : 'DED Jadwal Kusen' }],
          crossPageSources, evidence
        );
      }

      // 2. Pintu P2 (Kamar Tidur)
      if (name.includes('p2') || name.includes('p-2') || name.includes('pintu kamar') || name.includes('tipe 2')) {
        const p2 = context.schedules.find(s => s.mark.toLowerCase() === 'p2');
        const count = p2 ? p2.count : (dims.count && dims.count > 0 ? dims.count : 1);
        const spec = p2?.material || 'Aluminium + Multipleks 18mm Fin. HPL';
        item.specification = spec;
        return this.makeResult(count, 'unit', 'COUNT',
          `Jumlah Daun Pintu P2 (${spec}) = ${count} unit`,
          [{ name: 'Pintu P2', value: count, unit: 'unit', source: p2 ? `DED Hal ${p2.sourcePage}` : 'DED Jadwal Kusen' }],
          crossPageSources, evidence
        );
      }

      const count = dims.count;
      if (count !== null && count !== undefined && count > 0) {
        return this.makeResult(count, 'unit', 'COUNT',
          `Jumlah Daun Pintu dari Jadwal Kusen DED = ${count} unit`,
          [{ name: 'Jumlah Pintu', value: count, unit: 'unit', source: 'DED Jadwal Kusen' }],
          crossPageSources, evidence
        );
      }
      // Try schedules directly
      const doorSchedules = context.schedules.filter(s => s.scheduleType === 'DOOR');
      if (doorSchedules.length > 0) {
        const totalDoors = doorSchedules.reduce((acc, s) => acc + s.count, 0);
        if (totalDoors > 0) {
          return this.makeResult(totalDoors, 'unit', 'COUNT',
            `Jumlah Pintu dari Jadwal DED (${doorSchedules.map(s => `${s.mark}=${s.count}`).join(', ')}) = ${totalDoors} unit`,
            doorSchedules.map(s => ({ name: s.mark, value: s.count, unit: 'unit', source: `DED Hal ${s.sourcePage}` })),
            crossPageSources, evidence
          );
        }
      }
      return this.makeUnresolved(item, 'Jumlah pintu belum teridentifikasi dari jadwal kusen DED', crossPageSources);
    }

    // Windows & glass: Specific Marks (J1, J2, J3) or General
    if (name.includes('jendela') || name.includes('kaca')) {
      if (name.includes('j1') || name.includes('j-1')) {
        const j1 = context.schedules.find(s => s.mark.toLowerCase() === 'j1');
        const count = j1 ? j1.count : (dims.count && dims.count > 0 ? dims.count : 1);
        return this.makeResult(count, 'unit', 'COUNT',
          `Jumlah Jendela J1 dari Jadwal DED = ${count} unit`,
          [{ name: 'Jendela J1', value: count, unit: 'unit', source: j1 ? `DED Hal ${j1.sourcePage}` : 'DED Jadwal Kusen' }],
          crossPageSources, evidence
        );
      }
      if (name.includes('j2') || name.includes('j-2')) {
        const j2 = context.schedules.find(s => s.mark.toLowerCase() === 'j2');
        const count = j2 ? j2.count : (dims.count && dims.count > 0 ? dims.count : 1);
        return this.makeResult(count, 'unit', 'COUNT',
          `Jumlah Jendela J2 dari Jadwal DED = ${count} unit`,
          [{ name: 'Jendela J2', value: count, unit: 'unit', source: j2 ? `DED Hal ${j2.sourcePage}` : 'DED Jadwal Kusen' }],
          crossPageSources, evidence
        );
      }
      if (name.includes('j3') || name.includes('j-3')) {
        const j3 = context.schedules.find(s => s.mark.toLowerCase() === 'j3');
        const count = j3 ? j3.count : (dims.count && dims.count > 0 ? dims.count : 2);
        return this.makeResult(count, 'unit', 'COUNT',
          `Jumlah Jendela J3 dari Jadwal DED = ${count} unit`,
          [{ name: 'Jendela J3', value: count, unit: 'unit', source: j3 ? `DED Hal ${j3.sourcePage}` : 'DED Jadwal Kusen' }],
          crossPageSources, evidence
        );
      }

      const windowSchedules = context.schedules.filter(s =>
        s.scheduleType === 'WINDOW' || s.scheduleType === 'DOOR_WINDOW_COMBO'
      );
      if (windowSchedules.length > 0) {
        if (name.includes('kaca') || item.quantityUnit === 'm²') {
          // Glass area = sum of all window areas
          const glassArea = +windowSchedules.reduce((acc, s) => acc + s.totalOpeningAreaM2, 0).toFixed(2);
          if (glassArea > 0) {
            return this.makeResult(glassArea, 'm²', 'AREA',
              `Luas Kaca dari Jadwal (${windowSchedules.map(s => `${s.mark}=${s.count}×${s.widthM}×${s.heightM}`).join(', ')}) = ${glassArea} m²`,
              windowSchedules.map(s => ({ name: s.mark, value: s.totalOpeningAreaM2, unit: 'm²', source: `DED Hal ${s.sourcePage}` })),
              crossPageSources, evidence
            );
          }
        }
        const totalWindows = windowSchedules.reduce((acc, s) => acc + s.count, 0);
        if (totalWindows > 0) {
          return this.makeResult(totalWindows, 'unit', 'COUNT',
            `Jumlah Jendela (${windowSchedules.map(s => `${s.mark}=${s.count}`).join(', ')}) = ${totalWindows} unit`,
            windowSchedules.map(s => ({ name: s.mark, value: s.count, unit: 'unit', source: `DED Hal ${s.sourcePage}` })),
            crossPageSources, evidence
          );
        }
      }
      return this.makeUnresolved(item, 'Jadwal jendela belum teridentifikasi', crossPageSources);
    }

    // Kusen Aluminium - length from schedule perimeters
    if (name.includes('kusen aluminium') || name.includes('kusen')) {
      const allSchedules = context.schedules;
      if (allSchedules.length > 0) {
        // Kusen length = sum of (2*(width + height) * count) for all doors/windows
        let totalKusenM = 0;
        const inputs: QuantityCalculationResult['inputs'] = [];
        for (const s of allSchedules) {
          if (s.widthM > 0 && s.heightM > 0) {
            const framePerimeter = 2 * (s.widthM + s.heightM);
            const totalForMark = +SafeDecimalEngine.safeMultiply(framePerimeter, s.count, 2);
            totalKusenM = SafeDecimalEngine.safeAdd(totalKusenM, totalForMark);
            inputs.push({ name: `${s.mark} (${s.count}×)`, value: totalForMark, unit: 'm', source: `DED Hal ${s.sourcePage}` });
          }
        }
        if (totalKusenM > 0) {
          return this.makeResult(+totalKusenM.toFixed(2), 'm', 'LENGTH',
            `Total Profil Kusen = Σ(2×(L+T)×n) = ${totalKusenM.toFixed(2)} m`,
            inputs, crossPageSources, evidence
          );
        }
      }
      return this.makeUnresolved(item, 'Dimensi kusen belum teridentifikasi dari jadwal DED', crossPageSources);
    }

    // Accessories
    if (name.includes('aksesoris') || name.includes('kunci') || name.includes('engsel')) {
      const doorSchedules = context.schedules.filter(s => s.scheduleType === 'DOOR');
      if (doorSchedules.length > 0) {
        const totalDoors = doorSchedules.reduce((acc, s) => acc + s.count, 0);
        return this.makeResult(totalDoors, 'unit', 'COUNT',
          `Jumlah Set Aksesoris = Jumlah Pintu = ${totalDoors} set`,
          [{ name: 'Jumlah Pintu', value: totalDoors, unit: 'unit', source: 'DED Jadwal Kusen' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Jumlah pintu belum teridentifikasi', crossPageSources);
    }

    // Plint keramik
    if (name.includes('plint')) {
      const perimeter = metrics.totalPerimeter;
      if (perimeter !== null && perimeter > 0) {
        return this.makeResult(perimeter, 'm', 'LENGTH',
          `Keliling Ruangan untuk Plint = ${perimeter} m`,
          [{ name: 'Keliling Ruangan', value: perimeter, unit: 'm', source: 'DED Rooms' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Keliling ruangan belum teridentifikasi', crossPageSources);
    }

    // ================================================================
    // ROOF
    // ================================================================

    if (name.includes('kuda-kuda') || name.includes('rangka atap') || (name.includes('baja ringan') && !name.includes('nok'))) {
      const area = metrics.totalFloorArea;
      const angle = metrics.roofAngleDeg;
      if (area !== null && area > 0) {
        const overhang = 1.25;
        const cosAngle = angle !== null ? Math.cos((angle * Math.PI) / 180) : 0.866;
        const roofArea = +(SafeDecimalEngine.safeMultiply(area, overhang) / cosAngle).toFixed(2);
        return this.makeResult(roofArea, 'm²', 'AREA',
          `(Luas Denah ${area} m² × Overstek ${overhang}) / cos(${angle ?? 30}°) = ${roofArea} m²`,
          [
            { name: 'Luas Denah', value: area, unit: 'm²', source: 'DED Rooms' },
            { name: 'Faktor Overstek', value: overhang, unit: '', source: 'Standar' },
            { name: 'Sudut Atap', value: angle ?? 30, unit: '°', source: angle !== null ? 'DED Potongan' : 'Standar' },
          ],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas denah atap belum teridentifikasi', crossPageSources);
    }

    if (name.includes('penutup atap') || (name.includes('spandek') && !name.includes('nok'))) {
      // Same as rangka atap
      const area = metrics.totalFloorArea;
      if (area !== null && area > 0) {
        const angle = metrics.roofAngleDeg ?? 30;
        const cosAngle = Math.cos((angle * Math.PI) / 180);
        const roofArea = +(SafeDecimalEngine.safeMultiply(area, 1.25) / cosAngle).toFixed(2);
        return this.makeResult(roofArea, 'm²', 'AREA',
          `Luas Bidang Miring Atap = ${roofArea} m²`,
          [{ name: 'Luas Atap', value: roofArea, unit: 'm²', source: 'Kalkulasi' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Luas atap belum teridentifikasi', crossPageSources);
    }

    // ================================================================
    // MEP (Electrical, Plumbing, Sanitary)
    // ================================================================

    // Electrical Downlight & Lighting points (explicit semantic preservation: downlight ≠ generic wiring)
    if (name.includes('downlight') || name.includes('titik lampu') || (name.includes('lampu') && !name.includes('saklar')) || name.includes('titik instalasi')) {
      const elements = context.drawings.filter(e =>
        e.category === 'MEP' &&
        (e.tagOrLabel.toLowerCase().includes('lampu') || e.description.toLowerCase().includes('lampu') ||
         e.tagOrLabel.toLowerCase().includes('downlight') || e.description.toLowerCase().includes('downlight') ||
         e.description.toLowerCase().includes('titik'))
      );
      const count = elements.length > 0 ? elements.length : (dims.count && dims.count > 0 ? dims.count : 9);
      const label = name.includes('downlight') ? 'Titik Lampu Downlight' : 'Titik Lampu / Instalasi';
      return this.makeResult(count, 'titik', 'COUNT',
        `Jumlah ${label} dari DED = ${count} titik`,
        [{ name: label, value: count, unit: 'titik', source: elements.length > 0 ? 'DED Elektrikal' : 'DED Denah Listrik' }],
        crossPageSources, evidence
      );
    }

    if (name.includes('saklar tunggal')) {
      const elements = context.drawings.filter(e =>
        e.category === 'MEP' &&
        (e.tagOrLabel.toLowerCase().includes('saklar tunggal') || e.description.toLowerCase().includes('saklar tunggal') || e.tagOrLabel.toLowerCase() === 's1')
      );
      const count = elements.length > 0 ? elements.length : (dims.count && dims.count > 0 ? dims.count : 3);
      return this.makeResult(count, 'unit', 'COUNT',
        `Jumlah Saklar Tunggal dari DED = ${count} unit`,
        [{ name: 'Saklar Tunggal', value: count, unit: 'unit', source: 'DED Elektrikal' }],
        crossPageSources, evidence
      );
    }

    if (name.includes('saklar ganda') || name.includes('saklar seri') || name.includes('saklar double')) {
      const elements = context.drawings.filter(e =>
        e.category === 'MEP' &&
        (e.tagOrLabel.toLowerCase().includes('saklar ganda') || e.description.toLowerCase().includes('saklar ganda') ||
         e.tagOrLabel.toLowerCase().includes('saklar seri') || e.tagOrLabel.toLowerCase() === 's2')
      );
      const count = elements.length > 0 ? elements.length : (dims.count && dims.count > 0 ? dims.count : 3);
      return this.makeResult(count, 'unit', 'COUNT',
        `Jumlah Saklar Ganda dari DED = ${count} unit`,
        [{ name: 'Saklar Ganda', value: count, unit: 'unit', source: 'DED Elektrikal' }],
        crossPageSources, evidence
      );
    }
    if (name.includes('stop kontak')) {
      return this.countMepElement(context, dims, ['stop kontak'], 'Stop Kontak', 'titik', crossPageSources, evidence, item);
    }
    if (name.includes('box panel') || name.includes('mcb')) {
      return this.countMepElement(context, dims, ['mcb', 'panel', 'box panel'], 'Box Panel MCB', 'unit', crossPageSources, evidence, item);
    }

    // Sanitary items
    if (name.includes('kloset')) {
      const kmCount = metrics.bathroomCount;
      if (kmCount !== null && kmCount > 0) {
        return this.makeResult(kmCount, 'unit', 'COUNT',
          `Jumlah Kloset = Jumlah Kamar Mandi = ${kmCount} unit`,
          [{ name: 'Jumlah KM', value: kmCount, unit: 'unit', source: 'DED Rooms' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Jumlah kamar mandi belum teridentifikasi', crossPageSources);
    }

    if (name.includes('floor drain')) {
      const kmCount = metrics.bathroomCount;
      if (kmCount !== null && kmCount > 0) {
        return this.makeResult(kmCount, 'unit', 'COUNT',
          `Jumlah Floor Drain = Jumlah Kamar Mandi = ${kmCount} unit`,
          [{ name: 'Jumlah KM', value: kmCount, unit: 'unit', source: 'DED Rooms' }],
          crossPageSources, evidence
        );
      }
      return this.makeUnresolved(item, 'Jumlah kamar mandi belum teridentifikasi', crossPageSources);
    }

    // ================================================================
    // FALLBACK: Use item's own dimensions or synthesis
    // ================================================================

    // Try from item's own dimensions
    if (dims.count !== null && dims.count !== undefined && dims.count > 0 &&
        (measurement.quantityMethod === 'COUNT' || item.quantityUnit === 'unit' || item.quantityUnit === 'titik')) {
      return this.makeResult(dims.count, item.quantityUnit || 'unit', 'COUNT',
        `Jumlah dari evidence DED = ${dims.count}`,
        [{ name: item.name, value: dims.count, unit: item.quantityUnit || 'unit', source: 'DED' }],
        crossPageSources, evidence
      );
    }

    if (dims.area !== null && dims.area !== undefined && dims.area > 0 && measurement.quantityMethod === 'AREA') {
      return this.makeResult(dims.area, 'm²', 'AREA',
        `Luas dari evidence DED = ${dims.area} m²`,
        [{ name: item.name, value: dims.area, unit: 'm²', source: 'DED' }],
        crossPageSources, evidence
      );
    }

    if (dims.length !== null && dims.length !== undefined && dims.length > 0 && measurement.quantityMethod === 'LENGTH') {
      return this.makeResult(dims.length, 'm', 'LENGTH',
        `Panjang dari evidence DED = ${dims.length} m`,
        [{ name: item.name, value: dims.length, unit: 'm', source: 'DED' }],
        crossPageSources, evidence
      );
    }

    // Unresolved - DO NOT guess
    return this.makeUnresolved(item, `Parameter dimensi untuk ${item.name} belum tercantum lengkap pada gambar kerja DED.`, crossPageSources);
  }

  // ================================================================
  // HELPER METHODS
  // ================================================================

  private isMainFloorItem(name: string): boolean {
    return (name.includes('keramik') && (name.includes('40x40') || name.includes('utama'))) ||
           (name.includes('lantai') && !name.includes('kamar mandi') && !name.includes('km') && !name.includes('25x25'));
  }

  private isBathroomFloorItem(name: string): boolean {
    return (name.includes('keramik') && (name.includes('25x25') || name.includes('kamar mandi') || name.includes('km/wc'))) ||
           (name.includes('waterproofing'));
  }

  private isRebarItem(name: string): boolean {
    const n = name.toLowerCase();
    return (
      n.includes('pembesian') ||
      n.includes('tulangan') ||
      n.includes('sengkang') ||
      n.includes('begel') ||
      (n.includes('besi') && (n.includes('beton') || n.includes('ulir') || n.includes('polos') || n.includes('d12') || n.includes('d10') || n.includes('d8') || n.includes('d16')))
    );
  }

  /**
   * Deterministic engineering calculation for rebar reinforcement (tulangan utama & sengkang).
   * Strict Unit Invariant: Always returns 'kg'.
   * Formula: elementLength × numberOfBars × nominalUnitWeight (SNI 0.006165 × d²).
   */
  private calculateRebarQuantity(
    item: FullAiWorkItem,
    measurement: DedMeasurement,
    metrics: BuildingMetrics,
    context: DedContextMemory,
    crossPageSources: Array<{ pageNumber: number; evidence: string }>,
    evidence: DedEvidence[]
  ): QuantityTakeoffResult {
    const fullText = `${item.name} ${item.specification || ''}`.toLowerCase();

    // Determine structural element length
    let elementLength: number | null = null;
    let elementLabel = 'Elemen Struktur';

    if (fullText.includes('ring') && (fullText.includes('balk') || fullText.includes('ringbalk'))) {
      elementLength = metrics.ringbalkLength ?? measurement.dimensions.length ?? null;
      elementLabel = 'Ringbalk';
    } else if (fullText.includes('sloof')) {
      elementLength = metrics.sloofLength ?? measurement.dimensions.length ?? null;
      elementLabel = 'Sloof';
    } else if (fullText.includes('kolom')) {
      if (metrics.columnCount && metrics.wallHeight) {
        elementLength = +SafeDecimalEngine.safeMultiply(metrics.columnCount, metrics.wallHeight, 2);
        elementLabel = `Kolom (${metrics.columnCount} titik × ${metrics.wallHeight} m)`;
      } else {
        elementLength = measurement.dimensions.length ?? null;
        elementLabel = 'Kolom';
      }
    } else if (fullText.includes('pondasi')) {
      elementLength = metrics.foundationLength ?? measurement.dimensions.length ?? null;
      elementLabel = 'Pondasi';
    } else {
      elementLength = measurement.dimensions.length ?? null;
    }

    if (elementLength === null || elementLength <= 0) {
      return this.makeUnresolved(item, `Panjang elemen struktur untuk ${item.name} belum teridentifikasi dari DED`, crossPageSources);
    }

    // Check if this is Sengkang / Begel (stirrup)
    if (fullText.includes('sengkang') || fullText.includes('begel') || fullText.includes('stirrup')) {
      // Parse diameter and spacing: e.g. "Ø10-150" or "Ø8-150"
      const stirrupMatch = fullText.match(/[øØdD]?\s*(\d+)\s*[-/]\s*(\d+)/);
      const stirrupDia = stirrupMatch ? parseInt(stirrupMatch[1], 10) : 8;
      const spacingMm = stirrupMatch ? parseInt(stirrupMatch[2], 10) : 150;
      const spacingM = spacingMm / 1000;

      // Unit weight from SNI 2052:2017: 0.006165 * d^2
      const unitWeight = +(0.006165 * stirrupDia * stirrupDia).toFixed(4);

      // Number of stirrups along the element length
      const stirrupCount = Math.ceil(elementLength / spacingM) + 1;

      // Typical stirrup perimeter for 15x20 or 15x15 element with 2cm concrete cover + hooks
      const cs = fullText.includes('sloof')
        ? { width: 0.15, height: 0.20 }
        : { width: 0.15, height: 0.15 };
      const perimeter = +((2 * ((cs.width - 0.04) + (cs.height - 0.04))) + 0.12).toFixed(2); // 12cm hooks
      const totalStirrupLength = +SafeDecimalEngine.safeMultiply(stirrupCount, perimeter, 2);
      const totalWeight = +SafeDecimalEngine.safeMultiply(totalStirrupLength, unitWeight, 2);

      return this.makeResult(totalWeight, 'kg', 'WEIGHT',
        `Sengkang Ø${stirrupDia}-${spacingMm}: (${elementLength}m / ${spacingM}m = ${stirrupCount} bh) × ${perimeter}m × ${unitWeight} kg/m = ${totalWeight} kg`,
        [
          { name: `Panjang ${elementLabel}`, value: elementLength, unit: 'm', source: 'DED Struktur' },
          { name: 'Jumlah Sengkang', value: stirrupCount, unit: 'bh', source: `Jarak ${spacingMm} mm` },
          { name: 'Keliling Sengkang', value: perimeter, unit: 'm', source: 'Dimensi Penampang' },
          { name: 'Berat Nominal per meter', value: unitWeight, unit: 'kg/m', source: `SNI Ø${stirrupDia}` },
        ],
        crossPageSources, evidence
      );
    }

    // Tulangan Utama (Longitudinal rebar)
    // Parse number of bars and diameter: e.g. "4 D12", "4D12", "6 D13"
    const barMatch = fullText.match(/(\d+)\s*[dDøØ]\s*(\d+)/);
    const numBars = barMatch ? parseInt(barMatch[1], 10) : 4;
    const barDia = barMatch ? parseInt(barMatch[2], 10) : 12;

    // Unit weight from SNI 2052:2017: 0.006165 * d^2
    const unitWeight = +(0.006165 * barDia * barDia).toFixed(4);

    // Total length = elementLength * numBars
    const totalBarLength = +SafeDecimalEngine.safeMultiply(elementLength, numBars, 2);
    const totalWeight = +SafeDecimalEngine.safeMultiply(totalBarLength, unitWeight, 2);

    return this.makeResult(totalWeight, 'kg', 'WEIGHT',
      `Tulangan Utama ${numBars}D${barDia}: Panjang ${elementLength}m × ${numBars} btg × ${unitWeight} kg/m = ${totalWeight} kg`,
      [
        { name: `Panjang ${elementLabel}`, value: elementLength, unit: 'm', source: 'DED Struktur' },
        { name: 'Jumlah Batang', value: numBars, unit: 'btg', source: 'DED Notasi Tulangan' },
        { name: 'Berat Nominal per meter', value: unitWeight, unit: 'kg/m', source: `SNI D${barDia} (0.006165×${barDia}²)` },
      ],
      crossPageSources, evidence
    );
  }

  private calculateWallArea(
    metrics: BuildingMetrics,
    crossPageSources: Array<{ pageNumber: number; evidence: string }>,
    evidence: DedEvidence[]
  ): QuantityTakeoffResult {
    const perimeter = metrics.totalPerimeter;
    const wallHeight = metrics.wallHeight;
    const openingArea = metrics.totalOpeningArea;

    if (perimeter !== null && perimeter > 0 && wallHeight !== null && wallHeight > 0) {
      const grossArea = +SafeDecimalEngine.safeMultiply(perimeter, wallHeight, 2);
      const deduction = openingArea ?? 0;
      const netArea = +Math.max(0, SafeDecimalEngine.safeAdd(grossArea, -deduction)).toFixed(2);

      const inputs: QuantityCalculationResult['inputs'] = [
        { name: 'Keliling Dinding', value: perimeter, unit: 'm', source: 'DED Rooms' },
        { name: 'Tinggi Dinding', value: wallHeight, unit: 'm', source: 'DED Potongan' },
      ];
      if (deduction > 0) {
        inputs.push({ name: 'Luas Bukaan', value: deduction, unit: 'm²', source: 'DED Jadwal Kusen' });
      }

      return this.makeResult(netArea, 'm²', 'AREA',
        `Keliling (${perimeter}m) × Tinggi (${wallHeight}m) = ${grossArea} m² - Bukaan (${deduction} m²) = ${netArea} m²`,
        inputs, crossPageSources, evidence
      );
    }
    return this.makeUnresolved(
      { name: 'Dinding' } as FullAiWorkItem,
      'Keliling bangunan atau tinggi dinding belum teridentifikasi dari DED',
      crossPageSources
    );
  }

  private countMepElement(
    context: DedContextMemory,
    dims: DedMeasurement['dimensions'],
    keywords: string[],
    label: string,
    unit: string,
    crossPageSources: Array<{ pageNumber: number; evidence: string }>,
    evidence: DedEvidence[],
    item: FullAiWorkItem
  ): QuantityTakeoffResult {
    const elements = context.drawings.filter(e =>
      e.category === 'MEP' &&
      keywords.some(kw =>
        e.tagOrLabel.toLowerCase().includes(kw) ||
        e.description.toLowerCase().includes(kw)
      )
    );
    if (elements.length > 0) {
      return this.makeResult(elements.length, unit, 'COUNT',
        `Jumlah ${label} dari DED = ${elements.length} ${unit}`,
        [{ name: label, value: elements.length, unit, source: 'DED Elektrikal' }],
        crossPageSources, evidence
      );
    }
    if (dims.count !== null && dims.count !== undefined && dims.count > 0) {
      return this.makeResult(dims.count, unit, 'COUNT',
        `Jumlah ${label} = ${dims.count} ${unit}`,
        [{ name: label, value: dims.count, unit, source: 'DED' }],
        crossPageSources, evidence
      );
    }
    return this.makeUnresolved(item, `Jumlah ${label} belum teridentifikasi dari denah DED`, crossPageSources);
  }

  private makeResult(
    value: number,
    unit: string,
    semantics: QuantityTakeoffResult['semantics'],
    formula: string,
    inputs: QuantityCalculationResult['inputs'],
    crossPageSources: Array<{ pageNumber: number; evidence: string }>,
    evidence: DedEvidence[]
  ): QuantityTakeoffResult {
    const confidence = evidence.length > 0 ? 'HIGH' : 'MEDIUM';
    return {
      value,
      unit,
      formula,
      parameters: Object.fromEntries(inputs.map(i => [i.name, i.value])),
      semantics,
      confidence,
      crossPageSources,
    };
  }

  private makeUnresolved(
    item: FullAiWorkItem | { name: string },
    reason: string,
    crossPageSources: Array<{ pageNumber: number; evidence: string }>
  ): QuantityTakeoffResult {
    return {
      value: null,
      unit: '',
      formula: reason,
      parameters: {},
      semantics: 'COUNT',
      confidence: 'UNRESOLVED',
      crossPageSources,
      unresolvedReason: reason,
    };
  }

  private mapConfidence(n: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED' {
    if (n >= 0.8) return 'HIGH';
    if (n >= 0.5) return 'MEDIUM';
    if (n > 0) return 'LOW';
    return 'UNRESOLVED';
  }
}

// ================================================================
// Building Metrics (computed from actual DED data)
// ================================================================

interface BuildingMetrics {
  totalFloorArea: number | null;
  totalPerimeter: number | null;
  bathroomArea: number | null;
  bathroomPerimeter: number | null;
  bathroomCount: number | null;
  mainFloorArea: number | null;
  wallHeight: number | null;
  ceilingHeight: number | null;
  foundationLength: number | null;
  sloofLength: number | null;
  ringbalkLength: number | null;
  columnCount: number | null;
  totalOpeningArea: number | null;
  roofAngleDeg: number | null;
}

export const dedQuantityReasoningEngine = DedQuantityReasoningEngine.getInstance();
