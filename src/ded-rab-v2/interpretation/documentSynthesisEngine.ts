/**
 * EZRAB DED -> RAB V2: Document Synthesis Engine
 *
 * STEP 4: RAW DED EXTRACTION & DOCUMENT SYNTHESIS
 *
 * Responsibilities:
 * - Runs AFTER all pages have been individually analyzed.
 * - Combines observations, tags, dimensions, and specifications across all pages.
 * - Resolves cross-page relationships (e.g. Page 1: Sloof SL1 on plan + Page 3: SL1 = 15x20 cm K-225 -> combined: Sloof SL1 15x20 cm K-225).
 * - Ensures zero information loss between drawing sheets.
 */

import { PageObservationModel, EvidenceRecord } from '../types';

export interface SynthesizedEntity {
  key: string;
  name: string;
  category: string;
  specification?: string;
  material?: string;
  sourcePages: number[];
  dimensions: Record<string, { value: number | null; unit: string; sourcePage: number }>;
  tags: string[];
  evidenceText: string[];
  rawEvidences: EvidenceRecord[];
}

export class DocumentSynthesisEngine {
  private static instance: DocumentSynthesisEngine;

  private constructor() {}

  public static getInstance(): DocumentSynthesisEngine {
    if (!DocumentSynthesisEngine.instance) {
      DocumentSynthesisEngine.instance = new DocumentSynthesisEngine();
    }
    return DocumentSynthesisEngine.instance;
  }

  /**
   * Synthesizes page observations across all pages into consolidated entities.
   */
  public synthesize(pageObservations: PageObservationModel[]): SynthesizedEntity[] {
    const entityMap = new Map<string, SynthesizedEntity>();

    // 1. Build lookup for detail tags and schedule specifications across all pages
    const tagDetailLookup = new Map<string, {
      specification?: string;
      material?: string;
      dimensions?: Record<string, { value: number | null; unit: string }>;
      sourcePage: number;
    }>();

    for (const page of pageObservations) {
      for (const el of page.constructionElements) {
        const normKey = this.normalizeTag(el.name);
        if (normKey) {
          const dims: Record<string, { value: number | null; unit: string }> = {};
          if (el.dimensions) {
            for (const [k, v] of Object.entries(el.dimensions)) {
              dims[k] = { value: v, unit: k === 'area' ? 'm²' : k === 'count' ? 'unit' : 'm' };
            }
          }
          tagDetailLookup.set(normKey, {
            specification: el.specification,
            material: el.material,
            dimensions: dims,
            sourcePage: page.pageNumber,
          });
        }
      }

      for (const ref of page.referencesToOtherPages) {
        if (ref.tag) {
          const normKey = this.normalizeTag(ref.tag);
          if (normKey && !tagDetailLookup.has(normKey)) {
            tagDetailLookup.set(normKey, {
              specification: ref.targetDrawing,
              sourcePage: page.pageNumber,
            });
          }
        }
      }
    }

    // 2. Synthesize elements across pages
    for (const page of pageObservations) {
      for (const el of page.constructionElements) {
        const canonicalKey = this.canonicalKey(el.name, el.category);
        const normTag = this.normalizeTag(el.name);
        const detailMatch = normTag ? tagDetailLookup.get(normTag) : undefined;

        let existing = entityMap.get(canonicalKey);
        if (!existing) {
          // Check if there is an existing entity with matching tag
          for (const ent of entityMap.values()) {
            if (normTag && ent.tags.includes(normTag)) {
              existing = ent;
              break;
            }
          }
        }

        const dims: Record<string, { value: number | null; unit: string; sourcePage: number }> = {};
        if (el.dimensions) {
          for (const [k, v] of Object.entries(el.dimensions)) {
            dims[k] = {
              value: v,
              unit: k === 'area' ? 'm²' : k === 'count' ? 'unit' : 'm',
              sourcePage: page.pageNumber,
            };
          }
        }

        // Merge detail dimensions if missing
        if (detailMatch?.dimensions) {
          for (const [k, d] of Object.entries(detailMatch.dimensions)) {
            if (!dims[k] || dims[k].value === null) {
              dims[k] = {
                value: d.value,
                unit: d.unit,
                sourcePage: detailMatch.sourcePage,
              };
            }
          }
        }

        const resolvedSpec = el.specification || detailMatch?.specification;
        const resolvedMat = el.material || detailMatch?.material;

        if (existing) {
          // Merge information
          if (!existing.sourcePages.includes(page.pageNumber)) {
            existing.sourcePages.push(page.pageNumber);
          }
          if (resolvedSpec && (!existing.specification || resolvedSpec.length > existing.specification.length)) {
            existing.specification = resolvedSpec;
          }
          if (resolvedMat && !existing.material) {
            existing.material = resolvedMat;
          }
          // Merge dimensions
          for (const [k, dim] of Object.entries(dims)) {
            if (!existing.dimensions[k] || existing.dimensions[k].value === null) {
              existing.dimensions[k] = dim;
            }
          }
          if (normTag && !existing.tags.includes(normTag)) {
            existing.tags.push(normTag);
          }
          existing.rawEvidences.push(...page.rawEvidence);
        } else {
          // Create new entity
          entityMap.set(canonicalKey, {
            key: canonicalKey,
            name: el.name,
            category: el.category,
            specification: resolvedSpec,
            material: resolvedMat,
            sourcePages: detailMatch?.sourcePage && detailMatch.sourcePage !== page.pageNumber
              ? [page.pageNumber, detailMatch.sourcePage]
              : [page.pageNumber],
            dimensions: dims,
            tags: normTag ? [normTag] : [],
            evidenceText: [`Halaman ${page.pageNumber}: ${el.name} ${resolvedSpec || ''}`],
            rawEvidences: [...page.rawEvidence],
          });
        }
      }
    }

    return Array.from(entityMap.values());
  }

  private normalizeTag(name: string): string {
    const match = name.match(/\b(SL[\d]+|K[\d]+|B[\d]+|P[\d]+|J[\d]+|BV[\d]+)\b/i);
    return match ? match[1].toUpperCase() : '';
  }

  private canonicalKey(name: string, category: string): string {
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${category}_${clean}`;
  }
}

export const documentSynthesisEngine = DocumentSynthesisEngine.getInstance();
