import { defaultDatabaseAdapter, AiDatabaseAdapter } from '../database/dbAdapter';
import { CalculationService, CategoryBreakdown, RabCalculationResult } from './calculationService';
import { RabItem } from '../../src/types';

export interface RabSummaryResult {
  totalCost: number;
  totalRab: number;
  directCost: number;
  taxAmount: number;
  itemCount: number;
  categoryBreakdown: CategoryBreakdown[];
  categories: CategoryBreakdown[];
  largestCategory: CategoryBreakdown | null;
  highestCostItem: RabItem | null;
  missingVolumeItems: RabItem[];
  rabItems: RabItem[];
}

export interface SearchRabOptions {
  query?: string;
  category?: string;
  limit?: number;
}

export class RabDataService {
  constructor(private db: AiDatabaseAdapter = defaultDatabaseAdapter) {}

  public async getRabSummary(workspaceId: string, projectId: string): Promise<RabSummaryResult> {
    const items = await this.db.getRabItems(workspaceId, projectId);
    const calc = CalculationService.calculateRabSummary(items);

    // Find highest cost item & missing volume items
    let highestItem: RabItem | null = null;
    let maxAmount = -1;
    const missingVolume: RabItem[] = [];

    for (const item of items) {
      const amt = item.totalPrice || item.amount || (item.volume || 0) * (item.unitPrice || 0);
      if (amt > maxAmount) {
        maxAmount = amt;
        highestItem = item;
      }
      if (!item.volume || item.volume <= 0) {
        missingVolume.push(item);
      }
    }

    return {
      totalCost: calc.grandTotal,
      totalRab: calc.grandTotal,
      directCost: calc.directCost,
      taxAmount: calc.taxAmount,
      itemCount: items.length,
      categoryBreakdown: calc.categories,
      categories: calc.categories,
      largestCategory: calc.categories[0] || null,
      highestCostItem: highestItem,
      missingVolumeItems: missingVolume,
      rabItems: items
    };
  }

  public async searchRabItems(
    workspaceId: string,
    projectId: string,
    queryOrOptions?: string | SearchRabOptions,
    categoryParam?: string,
    limitParam = 20
  ): Promise<RabItem[]> {
    const items = await this.db.getRabItems(workspaceId, projectId);
    let q = '';
    let cat = '';
    let limit = limitParam;

    if (typeof queryOrOptions === 'object' && queryOrOptions !== null) {
      q = (queryOrOptions.query || '').toLowerCase().trim();
      cat = (queryOrOptions.category || '').toLowerCase().trim();
      limit = queryOrOptions.limit || limitParam;
    } else if (typeof queryOrOptions === 'string') {
      q = queryOrOptions.toLowerCase().trim();
      cat = (categoryParam || '').toLowerCase().trim();
    }

    return items
      .filter((item) => {
        const matchCat = !cat || (item.category || '').toLowerCase().includes(cat);
        const matchQuery =
          !q ||
          (item.description || item.name || '').toLowerCase().includes(q) ||
          (item.code || '').toLowerCase().includes(q) ||
          (item.ahspCode || '').toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q);
        return matchCat && matchQuery;
      })
      .slice(0, limit);
  }

  public async calculateRab(
    workspaceId: string,
    projectId: string,
    itemIds?: string[],
    category?: string
  ): Promise<RabCalculationResult> {
    let items = await this.db.getRabItems(workspaceId, projectId);
    if (itemIds && itemIds.length > 0) {
      const set = new Set(itemIds);
      items = items.filter((i) => set.has(i.id));
    }
    if (category) {
      const cat = category.toLowerCase().trim();
      items = items.filter((i) => (i.category || '').toLowerCase().includes(cat));
    }
    return CalculationService.calculateRabSummary(items);
  }

  public async addRabItem(
    workspaceId: string,
    projectId: string,
    item: { name?: string; description?: string; volume: number; unit: string; unitPrice: number; ahspCode?: string; category?: string },
    userId = 'AI_SYSTEM'
  ): Promise<RabItem> {
    const created = await this.db.addRabItem(workspaceId, projectId, {
      ...item,
      description: item.description || item.name || 'Pekerjaan Baru'
    });

    this.db.createAuditLog({
      workspaceId,
      projectId,
      userId,
      toolName: 'add_rab_item',
      actionType: 'CREATE',
      entityType: 'RAB_ITEM',
      entityId: created.id,
      afterState: created,
      ipAddress: 'internal'
    });

    return created;
  }

  public async updateRabItem(
    workspaceId: string,
    projectId: string,
    itemId: string,
    changes: Partial<RabItem>,
    userId = 'AI_SYSTEM'
  ): Promise<RabItem> {
    const updated = await this.db.updateRabItem(workspaceId, projectId, itemId, changes);

    this.db.createAuditLog({
      workspaceId,
      projectId,
      userId,
      toolName: 'update_rab_item',
      actionType: 'UPDATE',
      entityType: 'RAB_ITEM',
      entityId: itemId,
      afterState: updated,
      ipAddress: 'internal'
    });

    return updated;
  }

  public async deleteRabItem(
    workspaceId: string,
    projectId: string,
    itemId: string,
    userId = 'AI_SYSTEM'
  ): Promise<RabItem> {
    const deleted = await this.db.deleteRabItem(workspaceId, projectId, itemId);

    this.db.createAuditLog({
      workspaceId,
      projectId,
      userId,
      toolName: 'delete_rab_item',
      actionType: 'DELETE',
      entityType: 'RAB_ITEM',
      entityId: itemId,
      beforeState: deleted,
      ipAddress: 'internal'
    });

    return deleted;
  }
}

export const defaultRabDataService = new RabDataService();
export const rabDataService = defaultRabDataService;
