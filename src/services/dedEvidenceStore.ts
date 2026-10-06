/**
 * EZRAB DED Evidence Store (Section 4 & 24)
 *
 * Dedicated repository for DEDEvidence records.
 * Ensures every extracted construction fact links back to verifiable evidence in the uploaded DED.
 */

import { DEDEvidence } from '../domain/ded/dedPipelineTypes';

export class DEDEvidenceStore {
  private static instance: DEDEvidenceStore;
  // Map<projectId, Map<evidenceId, DEDEvidence>>
  private projectEvidenceMap: Map<string, Map<string, DEDEvidence>> = new Map();

  private constructor() {}

  public static getInstance(): DEDEvidenceStore {
    if (!DEDEvidenceStore.instance) {
      DEDEvidenceStore.instance = new DEDEvidenceStore();
    }
    return DEDEvidenceStore.instance;
  }

  public addEvidence(projectId: string, evidenceOrArray: DEDEvidence | DEDEvidence[]): void {
    if (!this.projectEvidenceMap.has(projectId)) {
      this.projectEvidenceMap.set(projectId, new Map());
    }
    const store = this.projectEvidenceMap.get(projectId)!;
    const array = Array.isArray(evidenceOrArray) ? evidenceOrArray : [evidenceOrArray];

    for (const ev of array) {
      store.set(ev.id, {
        ...ev,
        createdAt: ev.createdAt || new Date().toISOString(),
      });
    }
  }

  public addEvidences(projectId: string, evidences: DEDEvidence[]): void {
    this.addEvidence(projectId, evidences);
  }

  public getEvidenceById(id: string): DEDEvidence | undefined {
    for (const store of this.projectEvidenceMap.values()) {
      if (store.has(id)) {
        return store.get(id);
      }
    }
    return undefined;
  }

  public getEvidencesByIds(ids: string[]): DEDEvidence[] {
    const results: DEDEvidence[] = [];
    for (const id of ids) {
      const found = this.getEvidenceById(id);
      if (found) {
        results.push(found);
      }
    }
    return results;
  }

  public getEvidencesByFile(projectId: string, sourceFileId: string): DEDEvidence[] {
    const store = this.projectEvidenceMap.get(projectId);
    if (!store) return [];
    return Array.from(store.values()).filter((e) => e.sourceFileId === sourceFileId);
  }

  public getEvidencesByProject(projectId: string): DEDEvidence[] {
    const store = this.projectEvidenceMap.get(projectId);
    if (!store) return [];
    return Array.from(store.values());
  }

  public clearProjectEvidences(projectId: string): void {
    this.projectEvidenceMap.delete(projectId);
  }

  public clearAll(): void {
    this.projectEvidenceMap.clear();
  }
}

export const dedEvidenceStore = DEDEvidenceStore.getInstance();
