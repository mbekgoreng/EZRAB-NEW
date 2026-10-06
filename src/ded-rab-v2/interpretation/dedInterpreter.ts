/**
 * DED Interpreter & Building Model Builder (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Assemble canonical DedWorkItem entities from Pass 2 candidate extractions.
 * - Build the intermediate representation layer: DedBuildingModel (Levels, Spaces, Elements, Dimensions, References).
 * - Perform cross-page evidence resolution using EvidenceResolver (linking floor plans, sections, elevations, schedules).
 * - Normalize items using ConstructionNormalizer to standard category, material, and unit.
 * - Generate logically required secondary construction items via ConstructionCompletenessEngine (sourceType: CONSTRUCTION_RULE).
 * - Enforce granular missing data classification:
 *   - MISSING_DIMENSION, MISSING_QUANTITY, MISSING_MATERIAL, MISSING_SPECIFICATION, MISSING_AHSP, MISSING_PRICE.
 */

import {
  DedWorkItem,
  RawPageAnalysisPass2,
  EvidenceRecord,
  WorkItemStatus,
  ElementCategory,
  DedWorkItemDimensions,
  DedBuildingModel,
  DedSpace,
  DedLevel,
  DedConstructionElement,
  DedMaterialSpecification,
  MissingDataCategory,
  ResolvedDimension,
  DedFact,
  DedFactModel,
  DedObjectModel,
  ConstructionWorkModel,
  CanonicalWorkCategory,
  CanonicalObjectType,
  QuantitySource,
} from '../types';
import { evidenceService } from '../evidence/evidenceService';
import { evidenceResolver } from './evidenceResolver';
import { constructionNormalizer } from './constructionNormalizer';
import { constructionCompletenessEngine } from './constructionCompletenessEngine';
import { semanticClassifier } from '../semantic/semanticClassifier';

export interface InterpretationResult {
  workItems: DedWorkItem[];
  buildingModel: DedBuildingModel;
}

export class DedInterpreter {
  private static instance: DedInterpreter;

  private constructor() {}

  public static getInstance(): DedInterpreter {
    if (!DedInterpreter.instance) {
      DedInterpreter.instance = new DedInterpreter();
    }
    return DedInterpreter.instance;
  }

  /**
   * Main interpretation entry point returning both work items and the canonical DedBuildingModel.
   */
  public interpretWithBuildingModel(
    projectId: string,
    sourceDocumentId: string,
    pageExtractions: RawPageAnalysisPass2[]
  ): InterpretationResult {
    const rawItems: RawPageAnalysisPass2['candidateItems'] = [];
    const allEvidences: EvidenceRecord[] = [];

    for (const pageExt of pageExtractions) {
      for (const ev of pageExt.evidences) {
        allEvidences.push({
          id: ev.id,
          sourceDocumentId,
          sourceFileName: sourceDocumentId,
          pageNumber: pageExt.pageNumber,
          type: ev.type,
          content: ev.content,
          unit: ev.unit,
          confidence: ev.confidence,
          boundingBox: ev.bbox,
          references: ev.references,
        });
      }
      for (const it of pageExt.candidateItems) {
        rawItems.push(it);
      }
    }

    // Register all evidences in evidence service
    evidenceService.addEvidences(projectId, allEvidences);

    // 1. Resolve cross-page correlations & extract architectural spaces
    const correlations = evidenceResolver.resolveCorrelations(allEvidences);
    const spaces = correlations.spaces;

    // 2. Build Levels
    const levels: DedLevel[] = [
      {
        id: 'LVL-1',
        name: 'Lantai 1',
        elevationMeters: 0.0,
        heightMeters: correlations.sectionHeights.get('FLOOR_TO_CEILING_L1')?.height || 3.0,
        sourcePages: correlations.sectionHeights.get('FLOOR_TO_CEILING_L1')?.pageNumber ? [correlations.sectionHeights.get('FLOOR_TO_CEILING_L1')!.pageNumber] : [1],
        evidenceIds: correlations.sectionHeights.get('FLOOR_TO_CEILING_L1')?.evidenceId ? [correlations.sectionHeights.get('FLOOR_TO_CEILING_L1')!.evidenceId] : [],
      },
    ];

    const elements: DedConstructionElement[] = [];
    const materials: DedMaterialSpecification[] = [];
    const resolvedDimensionsList: ResolvedDimension[] = Array.from(correlations.resolvedDimensions.values());

    // 3. Canonicalize OCR occurrences before creating any work item. A drawing
    // commonly repeats the same work label on plan/detail/schedule pages; those
    // occurrences are evidence for one work, not independent RAB rows.
    const canonicalRawItems = this.groupRawWorkOccurrences(rawItems, allEvidences);

    // 4. Assemble canonical DedWorkItem instances
    const workItems: DedWorkItem[] = [];
    let itemSeq = 1;
    let currentRoomContext: string | undefined = undefined;

    for (const item of canonicalRawItems) {
      const sourcePages = item.evidenceIds
        .map(eid => {
          const ev = allEvidences.find(e => e.id === eid);
          return ev ? ev.pageNumber : 1;
        })
        .filter((v, i, a) => a.indexOf(v) === i);
      const pageNum = sourcePages[0] || 1;

      // Semantic Classification: Filter non-construction elements BEFORE AHSP matching
      const classification = semanticClassifier.classify(item.name, item.category, pageNum);
      const entityType = classification.fact.entityType;

      // Intermediate representation: DedFact
      const fact: DedFact = {
        ...classification.fact,
        context: {
          ...classification.fact.context,
          room: currentRoomContext,
          level: 'Lantai 1',
        },
      };

      // A. Room Labels: Store as spatial context, NEVER become RAB work items!
      if (entityType === 'ROOM_LABEL') {
        currentRoomContext = item.name.trim();
        const roomName = item.name.trim();
        if (!spaces.some(s => s.name.toLowerCase() === roomName.toLowerCase())) {
          spaces.push({
            id: `SPC-${String(spaces.length + 1).padStart(3, '0')}`,
            name: roomName,
            level: 'Lantai 1',
            sourcePages: sourcePages.length > 0 ? sourcePages : [pageNum],
            evidenceIds: item.evidenceIds.length > 0 ? item.evidenceIds : ['EV-ROOM'],
            confidence: classification.fact.confidence ?? 0.95,
          });
        }
        continue;
      }

      // B. Metadata, Titles, Notes, Legends, Grid/Axis: Ignore as work items
      if (
        entityType === 'TITLE_HEADER' ||
        entityType === 'NOTE' ||
        entityType === 'DRAWING_ANNOTATION' ||
        entityType === 'LEGEND' ||
        entityType === 'GRID_AXIS' ||
        entityType === 'DIMENSION' ||
        entityType === 'ELEVATION' ||
        entityType === 'UNKNOWN'
      ) {
        continue;
      }

      // C. Reference Codes & Symbols (P1, P2, J1, J2, BV1, K1, B1, etc.):
      const isRefCode = (
        entityType === 'SYMBOL' ||
        entityType === 'STRUCTURAL_LABEL' ||
        entityType === 'DOOR_REFERENCE' ||
        entityType === 'WINDOW_REFERENCE' ||
        entityType === 'STRUCTURAL_REFERENCE' ||
        entityType === 'DETAIL_REFERENCE' ||
        semanticClassifier.isRawSymbol(item.name)
      );

      let resolvedWorkName = item.name;
      let resolvedCategory = item.category;
      let resolvedSpec = item.materialSpec;
      let isPromotedToWork = false;
      const upperName = item.name.trim().toUpperCase();

      if (isRefCode) {
        const scheduleItem = correlations.scheduleItems.get(upperName);
        if (scheduleItem) {
          isPromotedToWork = true;
          const isDoor = upperName.startsWith('P') || entityType === 'DOOR_REFERENCE';
          const isWin = upperName.startsWith('J') || upperName.startsWith('BV') || entityType === 'WINDOW_REFERENCE';
          resolvedCategory = isDoor || isWin ? 'DOOR_WINDOW' : 'STRUCTURE_COLUMN';
          resolvedWorkName = isDoor ? `Pintu ${upperName}` : isWin ? (upperName.startsWith('BV') ? `Bovenlicht ${upperName}` : `Jendela ${upperName}`) : `Kolom ${upperName}`;
          resolvedSpec = resolvedSpec || `${resolvedWorkName} (${scheduleItem.width} x ${scheduleItem.height} m)`;
          item.dimensions = {
            width: { value: scheduleItem.width, unit: 'm', evidenceId: scheduleItem.evidenceId },
            height: { value: scheduleItem.height, unit: 'm', evidenceId: scheduleItem.evidenceId },
            count: { value: scheduleItem.count, unit: 'unit', evidenceId: scheduleItem.evidenceId },
          };
          item.unit = 'unit';
        } else {
          // Unresolved reference: keep as NEEDS_REVIEW, rabEligible: false
          const itemId = `DED-${String(itemSeq++).padStart(3, '0')}`;
          workItems.push({
            id: itemId,
            projectId,
            sourceDocumentId,
            name: item.name,
            category: 'OTHER',
            workCategory: 'OTHER',
            workPackage: 'Referensi Belum Terdefinisi',
            workItem: item.name,
            status: 'AMBIGUOUS',
            sourceType: 'DED_VERIFIED',
            evidenceIds: item.evidenceIds,
            sourcePages: sourcePages.length > 0 ? sourcePages : [pageNum],
            dimensions: {},
            geometry: { shape: 'COUNT', notes: 'Simbol / kode referensi gambar terdeteksi' },
            unit: 'unit',
            calculationInputs: {},
            confidence: 0.35,
            assumptions: [],
            warnings: [`Kode referensi "${item.name}" belum terdefinisi dalam schedule atau legenda gambar. Perlu review manual.`],
            entityType: entityType,
            rabEligible: false,
            validationStatus: 'NEEDS_REVIEW',
            validationErrors: [`Kode referensi "${item.name}" belum terasosiasi dengan spesifikasi teknis dan schedule yang sah.`],
            roomContext: currentRoomContext,
            dedFact: fact,
          });
          continue;
        }
      }

      // D. True Construction Work:
      const itemId = `DED-${String(itemSeq++).padStart(3, '0')}`;
      const dimensions: DedWorkItemDimensions = {};
      const calculationInputs: Record<string, number | null> = {};
      const warnings: string[] = [];
      const assumptions: string[] = [];
      const missingCategories: MissingDataCategory[] = [];
      const itemResolvedDims: Record<string, ResolvedDimension> = {};

      // Normalize item through ConstructionNormalizer
      const normalized = constructionNormalizer.normalize(item.name, item.category, item.materialSpec);

      // Extract raw dimensions
      const rawDims = item.dimensions || {};
      for (const [key, dimObj] of Object.entries(rawDims)) {
        if (dimObj && typeof dimObj === 'object') {
          const val = dimObj.value !== undefined ? dimObj.value : null;
          dimensions[key as keyof DedWorkItemDimensions] = {
            value: val,
            unit: dimObj.unit || 'm',
            evidenceId: dimObj.evidenceId || item.evidenceIds[0],
            isMissing: val === null || val === undefined,
          };
          calculationInputs[key] = val;
        }
      }

      // Check cross-page resolution for missing dimensions
      // Height resolution for walls / columns
      if (calculationInputs.height === null || calculationInputs.height === undefined) {
        const resolvedH = evidenceResolver.resolveMissingDimension(item.name, 'height', correlations, 'Lantai 1');
        if (resolvedH) {
          dimensions.height = {
            value: resolvedH.value,
            unit: resolvedH.unit,
            evidenceId: resolvedH.evidenceId,
            isMissing: false,
          };
          calculationInputs.height = resolvedH.value;
          itemResolvedDims.height = resolvedH;
          resolvedDimensionsList.push(resolvedH);
          assumptions.push(resolvedH.notes || 'Tinggi diselesaikan via relasi potongan gambar');
        }
      }

      // Door / Window count and dimensions resolution via schedules
      if (item.category === 'DOOR_WINDOW') {
        if (!calculationInputs.count) {
          const resolvedCount = evidenceResolver.resolveMissingDimension(item.name, 'count', correlations);
          if (resolvedCount) {
            dimensions.count = {
              value: resolvedCount.value,
              unit: 'unit',
              evidenceId: resolvedCount.evidenceId,
              isMissing: false,
            };
            calculationInputs.count = resolvedCount.value;
            itemResolvedDims.count = resolvedCount;
          }
        }
      }

      // Determine completeness & status
      let status: WorkItemStatus = item.status || 'CONFIRMED';

      if (normalized.category === 'FOUNDATION') {
        const hasLength = dimensions.length?.value !== null && dimensions.length?.value !== undefined && dimensions.length.value > 0;
        const hasWidth = dimensions.width?.value !== null && dimensions.width?.value !== undefined && dimensions.width.value > 0;
        const hasHeight = dimensions.height?.value !== null && dimensions.height?.value !== undefined && dimensions.height.value > 0;

        if (!hasLength) {
          dimensions.length = { value: null, unit: 'm', isMissing: true };
          calculationInputs.length = null;
          warnings.push('Panjang total pondasi belum ditemukan pada gambar detail.');
          missingCategories.push('MISSING_DIMENSION');
          status = 'MISSING_DATA';
        }
        if (!hasWidth || !hasHeight) {
          status = 'MISSING_DATA';
          missingCategories.push('MISSING_DIMENSION');
          warnings.push('Dimensi penampang pondasi (lebar/tinggi) belum lengkap.');
        }
      } else if (normalized.category === 'STRUCTURE_COLUMN') {
        const hasHeight = dimensions.height?.value !== null && dimensions.height?.value !== undefined;
        const hasCount = dimensions.count?.value !== null && dimensions.count?.value !== undefined;
        if (!hasHeight) {
          dimensions.height = { value: null, unit: 'm', isMissing: true };
          calculationInputs.height = null;
          warnings.push('Tinggi kolom belum teridentifikasi.');
          missingCategories.push('MISSING_DIMENSION');
          status = 'MISSING_DATA';
        }
        if (!hasCount) {
          dimensions.count = { value: null, unit: 'titik', isMissing: true };
          calculationInputs.count = null;
        }
      } else if (normalized.category === 'WALL') {
        const hasLength = dimensions.length?.value !== null && dimensions.length?.value !== undefined;
        const hasHeight = dimensions.height?.value !== null && dimensions.height?.value !== undefined;
        if (!hasLength || !hasHeight) {
          status = 'MISSING_DATA';
          missingCategories.push('MISSING_DIMENSION');
          warnings.push('Dimensi dinding (panjang atau tinggi) belum lengkap.');
        }
      }

      const canonicalWorkId = `WRK-${projectId}-${this.canonicalKey(item.name, item.category)}`;
      const workItem: DedWorkItem = {
        id: itemId,
        canonicalWorkId,
        projectId,
        sourceDocumentId,
        name: item.name,
        category: normalized.category,
        status,
        sourceType: 'DED_VERIFIED', // Explicit verified DED extraction
        evidenceIds: item.evidenceIds,
        sourcePages: sourcePages.length > 0 ? sourcePages : [1],
        dimensions,
        geometry: {
          shape: item.shape,
          notes: item.notes,
        },
        unit: normalized.standardUnit || item.unit || 'unit',
        calculationInputs,
        confidence: normalized.confidence >= 0.9 ? 0.95 : 0.88,
        assumptions,
        warnings,
        materialSpec: item.materialSpec || normalized.specification,
        missingDataCategories: missingCategories.length > 0 ? missingCategories : undefined,
        resolvedDimensions: Object.keys(itemResolvedDims).length > 0 ? itemResolvedDims : undefined,
        // Root-cause V2.0 provenance & eligibility
        entityType: 'CONSTRUCTION_WORK',
        rabEligible: false,
        validationStatus: 'EXTRACTED',
        roomContext: currentRoomContext,
        dedFact: fact,
        workCategory: constructionNormalizer.resolveWbs(item.name, normalized.category).canonicalCategory,
        workPackage: constructionNormalizer.resolveWbs(item.name, normalized.category).workPackage,
        workItem: constructionNormalizer.resolveWbs(item.name, normalized.category).workItem,
        quantitySource: 'DED_DIMENSION',
        dedObject: {
          objectId: `OBJ-${itemId}`,
          canonicalType: 'CONSTRUCTION_WORK',
          label: item.name,
          pageNumber: sourcePages[0] || 1,
          evidenceId: item.evidenceIds[0] || 'EV-001',
          location: currentRoomContext || 'Lantai 1',
          dimensions: calculationInputs,
          specification: item.materialSpec || normalized.specification,
        },
        constructionWork: {
          workId: canonicalWorkId,
          canonicalWorkId,
          objectId: `OBJ-${itemId}`,
          wbsCategory: constructionNormalizer.resolveWbs(item.name, normalized.category).canonicalCategory,
          workPackage: constructionNormalizer.resolveWbs(item.name, normalized.category).workPackage,
          description: constructionNormalizer.resolveWbs(item.name, normalized.category).workItem,
          unit: normalized.standardUnit || item.unit || 'unit',
          quantitySource: 'DED_DIMENSION',
          isDerived: false,
        },
      };

      workItems.push(workItem);

      // Add to DedBuildingModel elements
      elements.push({
        id: `EL-${String(elements.length + 1).padStart(3, '0')}`,
        type: normalized.constructionType,
        category: normalized.category,
        name: item.name,
        level: 'Lantai 1',
        material: normalized.material,
        specification: item.materialSpec || normalized.specification,
        dimensions: calculationInputs,
        sourcePages: workItem.sourcePages,
        evidenceIds: workItem.evidenceIds,
        isDerived: false,
      });

      // Add material spec if present
      if (item.materialSpec) {
        materials.push({
          category: normalized.category,
          name: item.name,
          specification: item.materialSpec,
          sourcePage: sourcePages[0] || 1,
          evidenceId: item.evidenceIds[0] || 'EV-001',
        });
      }
    }

    // 5. Generate derived construction requirements via ConstructionCompletenessEngine
    const derivedItems = constructionCompletenessEngine.generateDerivedWorkItems(
      projectId,
      sourceDocumentId,
      workItems,
      spaces,
      itemSeq
    );

    // Merge derived items into workItems and elements
    for (const derived of derivedItems) {
      workItems.push(derived);
      elements.push({
        id: `EL-${String(elements.length + 1).padStart(3, '0')}`,
        type: derived.name,
        category: derived.category,
        name: derived.name,
        level: 'Lantai 1',
        specification: derived.materialSpec,
        dimensions: derived.calculationInputs,
        sourcePages: derived.sourcePages,
        evidenceIds: derived.evidenceIds,
        isDerived: true,
      });
    }

    // 5. Construct final DedBuildingModel
    const buildingModel: DedBuildingModel = {
      projectId,
      buildingInfo: {
        type: 'Bangunan Hunian 1 Lantai',
        totalEstimatedArea: spaces.reduce((acc, s) => acc + (s.area || 0), 0) || undefined,
        levelsCount: levels.length,
        foundationType: workItems.find(i => i.category === 'FOUNDATION')?.name,
        structureType: 'Struktur Beton Bertulang Praktis',
      },
      levels,
      spaces,
      dimensions: resolvedDimensionsList,
      elements,
      materials,
      specifications: materials.map(m => `${m.name}: ${m.specification}`),
      references: correlations.references,
      evidences: allEvidences,
      createdAt: new Date().toISOString(),
    };

    return {
      workItems,
      buildingModel,
    };
  }

  /**
   * Backward-compatible helper method returning DedWorkItem array.
   */
  public interpretWorkItems(
    projectId: string,
    sourceDocumentId: string,
    pageExtractions: RawPageAnalysisPass2[]
  ): DedWorkItem[] {
    return this.interpretWithBuildingModel(projectId, sourceDocumentId, pageExtractions).workItems;
  }

  /** Merge repeated OCR candidates while retaining every supporting evidence. */
  private groupRawWorkOccurrences(
    items: RawPageAnalysisPass2['candidateItems'],
    evidences: EvidenceRecord[],
  ): RawPageAnalysisPass2['candidateItems'] {
    const groups = new Map<string, RawPageAnalysisPass2['candidateItems'][number]>();
    const evidenceById = new Map(evidences.map((e) => [e.id, e]));

    for (const item of items) {
      const normalized = constructionNormalizer.normalize(item.name, item.category, item.materialSpec);
      const key = `${normalized.constructionType}|${normalized.material}|${normalized.standardUnit}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          ...item,
          evidenceIds: [...new Set(item.evidenceIds)],
          dimensions: { ...item.dimensions },
        });
        continue;
      }

      existing.evidenceIds = [...new Set([...existing.evidenceIds, ...item.evidenceIds])];
      existing.name = existing.name.length >= item.name.length ? existing.name : item.name;
      existing.materialSpec = existing.materialSpec || item.materialSpec;
      for (const [dimension, value] of Object.entries(item.dimensions || {})) {
        const current = existing.dimensions[dimension];
        if (!current || (current.value === null && value.value !== null)) {
          existing.dimensions[dimension] = value;
        }
      }

    }

    // Contextual association also runs for singleton groups. A dimension
    // annotation may be OCR'd separately from the work label; associate it
    // only on a shared page when that page has one work, or when the text
    // explicitly names the canonical work.
    for (const existing of groups.values()) {
      const pages = new Set(existing.evidenceIds.map((id) => evidenceById.get(id)?.pageNumber));
      const workWords = this.canonicalKey(existing.name, existing.category).split('-').filter(Boolean);
      for (const ev of evidences) {
        if (!pages.has(ev.pageNumber) || ev.type !== 'DIMENSION' || existing.evidenceIds.includes(ev.id)) continue;
        const text = ev.content.toLowerCase();
        const samePageWorkCount = items.filter((candidate) => candidate.evidenceIds.some((id) => evidenceById.get(id)?.pageNumber === ev.pageNumber)).length;
        const explicitlyRelated = workWords.some((word) => word.length > 3 && text.includes(word));
        if (!explicitlyRelated && samePageWorkCount > 1) continue;
        const extracted = this.extractDimensionEvidence(ev);
        if (Object.keys(extracted).length === 0) continue;
        existing.evidenceIds.push(ev.id);
        for (const [dimension, value] of Object.entries(extracted)) {
          if (!existing.dimensions[dimension] || existing.dimensions[dimension].value === null) existing.dimensions[dimension] = value;
        }
      }
    }
    return [...groups.values()];
  }

  private extractDimensionEvidence(ev: EvidenceRecord): RawPageAnalysisPass2['candidateItems'][number]['dimensions'] {
    const text = ev.content.toLowerCase().replace(',', '.');
    const numbers = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:m|meter|cm)?/g)].map((m) => Number(m[1]));
    const result: RawPageAnalysisPass2['candidateItems'][number]['dimensions'] = {};
    const add = (key: string, value: number) => {
      const unit = /cm\b/.test(text) ? 'cm' : 'm';
      result[key] = { value: unit === 'cm' ? value / 100 : value, unit, evidenceId: ev.id };
    };
    if (/(panjang|length|\bp\b)/.test(text) && numbers[0] !== undefined) add('length', numbers[0]);
    if (/(lebar|width|\bl\b)/.test(text) && numbers[0] !== undefined) add('width', numbers[0]);
    if (/(tinggi|height|tebal|thickness|\bt\b)/.test(text) && numbers[0] !== undefined) add('height', numbers[0]);
    return result;
  }

  private canonicalKey(name: string, category: ElementCategory): string {
    return `${category}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  }
}

export const dedInterpreter = DedInterpreter.getInstance();
