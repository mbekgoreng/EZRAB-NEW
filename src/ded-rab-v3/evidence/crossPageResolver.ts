import { DedContextMemory, CrossReference } from '../types';

export interface ResolvedElement {
  elementId: string;
  marks: string[];
  count: number;
  widthM: number | null;
  heightM: number | null;
  areaM2: number | null;
  material: string;
  specification: string;
  sourcePages: number[];
  evidence: Array<{ page: number; description: string }>;
  elementType: 'door' | 'window' | 'structural' | 'mep' | 'finish' | 'other';
}

export interface CrossPageResolutionResult {
  resolvedScheduleElements: Map<string, ResolvedElement>;
  resolvedStructuralElements: Map<string, ResolvedElement>;
  resolvedMepElements: Map<string, ResolvedElement>;
  crossReferences: CrossReference[];
}

export class CrossPageResolver {
  private static instance: CrossPageResolver;

  private constructor() {}

  public static getInstance(): CrossPageResolver {
    if (!CrossPageResolver.instance) {
      CrossPageResolver.instance = new CrossPageResolver();
    }
    return CrossPageResolver.instance;
  }

  public resolve(context: DedContextMemory): CrossPageResolutionResult {
    const resolvedScheduleElements = new Map<string, ResolvedElement>();
    const resolvedStructuralElements = new Map<string, ResolvedElement>();
    const resolvedMepElements = new Map<string, ResolvedElement>();
    const crossReferences: CrossReference[] = context.cross_references ? [...context.cross_references] : [];

    // Group schedule items by their mark across pages
    if (context.schedules && Array.isArray(context.schedules)) {
      context.schedules.forEach(item => {
        const mark = item.mark;
        if (!mark) return;
        
        let resolved = resolvedScheduleElements.get(mark);
        if (!resolved) {
          resolved = {
            elementId: `sched_${mark}`,
            marks: [mark],
            count: 0,
            widthM: item.widthM !== undefined ? item.widthM : null,
            heightM: item.heightM !== undefined ? item.heightM : null,
            areaM2: item.totalOpeningAreaM2 !== undefined ? item.totalOpeningAreaM2 : null,
            material: item.material ? item.material : '',
            specification: '',
            sourcePages: [],
            evidence: [],
            elementType: item.scheduleType === 'DOOR' ? 'door' : item.scheduleType === 'WINDOW' ? 'window' : item.scheduleType === 'DOOR_WINDOW_COMBO' ? 'door' : 'other'
          };
          resolvedScheduleElements.set(mark, resolved);
        }

        if (item.count !== undefined) {
          resolved.count += item.count;
        }
        
        if (item.sourcePage !== undefined && !resolved.sourcePages.includes(item.sourcePage)) {
          resolved.sourcePages.push(item.sourcePage);
        }
        
        if (item.notes) {
          resolved.evidence.push({ page: item.sourcePage, description: `Schedule Note: ${item.notes}` });
        }
      });
    }

    // Group drawing elements by their tagOrLabel across pages
    if (context.drawings && Array.isArray(context.drawings)) {
      context.drawings.forEach(element => {
        const tag = element.tagOrLabel;
        if (!tag) return;

        // Try to cross-reference with schedule if it's architectural
        if (element.category === 'ARCHITECTURAL') {
          const scheduleMatch = resolvedScheduleElements.get(tag);
          if (scheduleMatch) {
            scheduleMatch.specification += scheduleMatch.specification && element.materialSpecification ? ` | ${element.materialSpecification}` : (element.materialSpecification ? element.materialSpecification : '');
            if (element.pageNumber !== undefined && !scheduleMatch.sourcePages.includes(element.pageNumber)) {
              scheduleMatch.sourcePages.push(element.pageNumber);
            }
            if (element.description) {
              scheduleMatch.evidence.push({ page: element.pageNumber, description: `Drawing Element: ${element.description}` });
            }
            return;
          }
        }

        const mapToUse = element.category === 'STRUCTURAL' ? resolvedStructuralElements : 
                         element.category === 'MEP' ? resolvedMepElements : null;
        
        if (mapToUse !== null) {
          let resolved = mapToUse.get(tag);
          if (!resolved) {
            resolved = {
              elementId: `draw_${tag}`,
              marks: [tag],
              count: 1, // Assume 1 unless count dimensions exist
              widthM: null,
              heightM: null,
              areaM2: null,
              material: element.materialSpecification ? element.materialSpecification : '',
              specification: element.materialSpecification ? element.materialSpecification : '',
              sourcePages: [],
              evidence: [],
              elementType: element.category === 'STRUCTURAL' ? 'structural' : element.category === 'MEP' ? 'mep' : 'other'
            };
            mapToUse.set(tag, resolved);
          } else {
            resolved.count += 1;
            if (element.materialSpecification && !resolved.specification.includes(element.materialSpecification)) {
              resolved.specification += resolved.specification ? ` | ${element.materialSpecification}` : element.materialSpecification;
            }
          }

          if (element.pageNumber !== undefined && !resolved.sourcePages.includes(element.pageNumber)) {
            resolved.sourcePages.push(element.pageNumber);
          }
          if (element.description) {
            resolved.evidence.push({ page: element.pageNumber, description: `Drawing Element: ${element.description}` });
          }
        }
      });
    }

    // Process Dimension Constraints to add missing information
    if (context.dimensions && Array.isArray(context.dimensions)) {
      context.dimensions.forEach(dim => {
        if (!dim.elementRef) return;
        
        // Find the element across all maps
        let targetElement: ResolvedElement | undefined = resolvedScheduleElements.get(dim.elementRef);
        if (!targetElement) targetElement = resolvedStructuralElements.get(dim.elementRef);
        if (!targetElement) targetElement = resolvedMepElements.get(dim.elementRef);
        
        if (targetElement) {
          if (dim.dimensionType === 'WIDTH' && dim.value !== undefined && targetElement.widthM === null) {
            targetElement.widthM = dim.value;
          } else if (dim.dimensionType === 'HEIGHT' && dim.value !== undefined && targetElement.heightM === null) {
            targetElement.heightM = dim.value;
          } else if (dim.dimensionType === 'AREA' && dim.value !== undefined && targetElement.areaM2 === null) {
            targetElement.areaM2 = dim.value;
          } else if (dim.dimensionType === 'COUNT' && dim.value !== undefined) {
            targetElement.count = dim.value;
          }
          if (dim.pageNumber !== undefined && !targetElement.sourcePages.includes(dim.pageNumber)) {
            targetElement.sourcePages.push(dim.pageNumber);
          }
          targetElement.evidence.push({ page: dim.pageNumber, description: `Dimension Constraint: ${dim.rawText}` });
        }
      });
    }

    return {
      resolvedScheduleElements,
      resolvedStructuralElements,
      resolvedMepElements,
      crossReferences
    };
  }
}

export const crossPageResolver = CrossPageResolver.getInstance();
