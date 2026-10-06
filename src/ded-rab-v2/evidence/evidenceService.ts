/**
 * Evidence Service (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - In-memory and project-isolated evidence catalog.
 * - Link every dimension and material specification to exact source page & evidence ID.
 * - Detect conflicts between evidence from different pages.
 * - Format evidence payloads for the interactive Evidence Viewer modal.
 */

import { EvidenceRecord, SourceDocument } from '../types';

export interface EvidenceConflict {
  fieldName: string;
  evidenceA: EvidenceRecord;
  evidenceB: EvidenceRecord;
  description: string;
}

export class EvidenceService {
  private static instance: EvidenceService;
  private evidenceStore: Map<string, EvidenceRecord[]> = new Map(); // projectId -> EvidenceRecord[]

  private constructor() {}

  public static getInstance(): EvidenceService {
    if (!EvidenceService.instance) {
      EvidenceService.instance = new EvidenceService();
    }
    return EvidenceService.instance;
  }

  public clearEvidence(projectId: string): void {
    this.evidenceStore.delete(projectId);
  }

  public addEvidence(projectId: string, evidence: Omit<EvidenceRecord, 'id'> & { id?: string }): EvidenceRecord {
    const current = this.evidenceStore.get(projectId) || [];
    const id = evidence.id || `EV-${String(current.length + 1).padStart(3, '0')}`;
    const record: EvidenceRecord = { ...evidence, id };
    this.addEvidences(projectId, [record]);
    return record;
  }

  public addEvidences(projectId: string, evidences: EvidenceRecord[]): void {
    const current = this.evidenceStore.get(projectId) || [];
    const existingIds = new Set(current.map(e => e.id));
    const toAdd = evidences.filter(e => !existingIds.has(e.id));
    this.evidenceStore.set(projectId, [...current, ...toAdd]);
  }

  public getEvidences(projectId: string): EvidenceRecord[] {
    return this.evidenceStore.get(projectId) || [];
  }

  public getEvidenceById(projectId: string, evidenceId: string): EvidenceRecord | undefined {
    const list = this.evidenceStore.get(projectId) || [];
    return list.find(e => e.id === evidenceId);
  }

  public getEvidencesByIds(projectId: string, ids: string[]): EvidenceRecord[] {
    const idSet = new Set(ids);
    const list = this.evidenceStore.get(projectId) || [];
    return list.filter(e => idSet.has(e.id));
  }

  /**
   * Cross-page conflict detection:
   * Compares evidence records that share a common reference or topic but report differing values.
   */
  public detectConflicts(projectId: string): EvidenceConflict[] {
    const conflicts: EvidenceConflict[] = [];
    const list = this.getEvidences(projectId);

    // Group evidences by reference tag (e.g. "K1", "P1", "Pondasi", "Mutu Beton")
    const refMap: Map<string, EvidenceRecord[]> = new Map();
    for (const ev of list) {
      const refs = ev.references || [];
      for (const r of refs) {
        const key = r.trim().toUpperCase();
        if (!refMap.has(key)) refMap.set(key, []);
        refMap.get(key)!.push(ev);
      }

      // Check concrete grade annotations
      const concreteMatch = ev.content.match(/\b(k-?\d{3}|fc'?\s*\d+)\b/i);
      if (concreteMatch) {
        const key = 'CONCRETE_GRADE';
        if (!refMap.has(key)) refMap.set(key, []);
        refMap.get(key)!.push(ev);
      }
    }

    for (const [key, evList] of refMap.entries()) {
      if (evList.length >= 2) {
        for (let i = 0; i < evList.length; i++) {
          for (let j = i + 1; j < evList.length; j++) {
            const evA = evList[i];
            const evB = evList[j];
            if (evA.pageNumber !== evB.pageNumber && this.hasDiscrepancy(evA.content, evB.content)) {
              conflicts.push({
                fieldName: key,
                evidenceA: evA,
                evidenceB: evB,
                description: `Perbedaan spesifikasi pada ${key}: Halaman ${evA.pageNumber} (${evA.content}) vs Halaman ${evB.pageNumber} (${evB.content}).`,
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  private hasDiscrepancy(textA: string, textB: string): boolean {
    const gradeA = textA.match(/\b(k-?\d{3})\b/i)?.[1]?.toUpperCase();
    const gradeB = textB.match(/\b(k-?\d{3})\b/i)?.[1]?.toUpperCase();
    if (gradeA && gradeB && gradeA !== gradeB) return true;

    return false;
  }
}

export const evidenceService = EvidenceService.getInstance();
