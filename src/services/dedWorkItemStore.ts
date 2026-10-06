/**
 * EZRAB DED Work Item Store (Section 5 & 24)
 *
 * Dedicated repository for discovered DEDWorkItem candidates.
 * Tracks item provenance, status transitions, dimension links, and user overrides.
 */

import { DEDWorkItem, DEDWorkItemStatus } from '../domain/ded/dedPipelineTypes';

export class DEDWorkItemStore {
  private static instance: DEDWorkItemStore;
  // Map<projectId, Map<workItemId, DEDWorkItem>>
  private projectWorkItemsMap: Map<string, Map<string, DEDWorkItem>> = new Map();

  private constructor() {}

  public static getInstance(): DEDWorkItemStore {
    if (!DEDWorkItemStore.instance) {
      DEDWorkItemStore.instance = new DEDWorkItemStore();
    }
    return DEDWorkItemStore.instance;
  }

  public addWorkItem(projectId: string, item: DEDWorkItem): void {
    if (!this.projectWorkItemsMap.has(projectId)) {
      this.projectWorkItemsMap.set(projectId, new Map());
    }
    this.projectWorkItemsMap.get(projectId)!.set(item.id, item);
  }

  public addWorkItems(projectId: string, items: DEDWorkItem[]): void {
    for (const item of items) {
      this.addWorkItem(projectId, item);
    }
  }

  public getWorkItemById(id: string): DEDWorkItem | undefined {
    for (const store of this.projectWorkItemsMap.values()) {
      if (store.has(id)) {
        return store.get(id);
      }
    }
    return undefined;
  }

  public getWorkItemsByProject(projectId: string): DEDWorkItem[] {
    const store = this.projectWorkItemsMap.get(projectId);
    if (!store) return [];
    return Array.from(store.values());
  }

  public updateWorkItemStatus(id: string, status: DEDWorkItemStatus): boolean {
    const item = this.getWorkItemById(id);
    if (item) {
      item.status = status;
      return true;
    }
    return false;
  }

  public updateWorkItemOverride(id: string, override: Partial<DEDWorkItem>): boolean {
    const item = this.getWorkItemById(id);
    if (!item) return false;

    if (!item.isUserOverridden) {
      item.originalAiValue = {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        ahspCode: item.ahspCode,
        unitPrice: item.unitPrice,
        specification: item.specification,
      };
    }

    Object.assign(item, override, {
      isUserOverridden: true,
      status: 'USER_OVERRIDDEN',
    });

    return true;
  }

  public clearProjectWorkItems(projectId: string): void {
    this.projectWorkItemsMap.delete(projectId);
  }

  public clearAll(): void {
    this.projectWorkItemsMap.clear();
  }
}

export const dedWorkItemStore = DEDWorkItemStore.getInstance();
