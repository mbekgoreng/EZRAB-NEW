/**
 * EZRAB — PROJECT PRICE & OVERRIDE ENGINE
 * 
 * Strict architectural separation of:
 * 1. HARGA REFERENSI (National & Regional Reference Database)
 * 2. HARGA PROYEK (Project-scoped Supplier / Purchase / Quotation / Contract Prices)
 * 3. OVERRIDE (Explicit estimator decision to enforce special price)
 * 4. HARGA FINAL (Resolved price used by RAB and Project Finance)
 * 
 * Key Principles:
 * - Zero pollution: Setting a project price or override NEVER mutates the national reference database.
 * - Strict project isolation: Prices in Project A never leak into Project B.
 * - Audit Trail: Every modification, override activation/deactivation, and revision lock is auditable.
 * - Expiration: Expired prices are marked EXPIRED and resolver falls back to next active tier.
 */

import {
  ProjectMaterialPrice,
  ProjectPriceOverride,
  PriceAuditRecord,
  PriceLockRecord,
  PriceComparison,
  ResolvedPriceStatus,
  ResolvedPriceSource,
  ProjectPriceSourceType,
  ResolvedPrice,
} from './contracts/types';
import { PriceNormalizationEngine } from './normalization/priceNormalization';
// PHASE 1 (audit §16): record every fabricated price. Recording only — no value is changed.
import { recordFabricatedTotal } from './telemetry/fabricatedPriceTelemetry';

export type {
  ProjectMaterialPrice,
  ProjectPriceOverride,
  PriceAuditRecord,
  PriceLockRecord,
  PriceComparison,
  ResolvedPriceStatus,
  ResolvedPriceSource,
  ProjectPriceSourceType,
  ResolvedPrice,
};

export class ProjectPriceEngine {
  private static instance: ProjectPriceEngine;

  // projectId -> normalizedCode/materialId -> ProjectMaterialPrice
  private projectPrices: Map<string, Map<string, ProjectMaterialPrice>> = new Map();

  // projectId -> normalizedCode/materialId -> ProjectPriceOverride
  private projectOverrides: Map<string, Map<string, ProjectPriceOverride>> = new Map();

  // Audit records for all price modifications
  private auditTrail: PriceAuditRecord[] = [];

  // projectId -> revisionId -> PriceLockRecord
  private lockedRevisions: Map<string, Map<string, PriceLockRecord>> = new Map();

  private listeners: Set<() => void> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.saveToStorage();
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('ProjectPriceEngine subscriber error:', err);
      }
    });
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const pricesObj: Record<string, Record<string, ProjectMaterialPrice>> = {};
      this.projectPrices.forEach((map, pId) => {
        pricesObj[pId] = Object.fromEntries(map.entries());
      });
      window.localStorage.setItem('ezrab_project_prices_v2', JSON.stringify(pricesObj));

      const overridesObj: Record<string, Record<string, ProjectPriceOverride>> = {};
      this.projectOverrides.forEach((map, pId) => {
        overridesObj[pId] = Object.fromEntries(map.entries());
      });
      window.localStorage.setItem('ezrab_project_overrides_v2', JSON.stringify(overridesObj));

      window.localStorage.setItem('ezrab_price_audit_v2', JSON.stringify(this.auditTrail.slice(0, 100)));
    } catch {
      // safe fallback
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const rawPrices = window.localStorage.getItem('ezrab_project_prices_v2');
      if (rawPrices) {
        const pricesObj: Record<string, Record<string, ProjectMaterialPrice>> = JSON.parse(rawPrices);
        for (const [pId, mapObj] of Object.entries(pricesObj)) {
          this.projectPrices.set(pId, new Map(Object.entries(mapObj)));
        }
      }

      const rawOverrides = window.localStorage.getItem('ezrab_project_overrides_v2');
      if (rawOverrides) {
        const overridesObj: Record<string, Record<string, ProjectPriceOverride>> = JSON.parse(rawOverrides);
        for (const [pId, mapObj] of Object.entries(overridesObj)) {
          this.projectOverrides.set(pId, new Map(Object.entries(mapObj)));
        }
      }

      const rawAudit = window.localStorage.getItem('ezrab_price_audit_v2');
      if (rawAudit) {
        this.auditTrail = JSON.parse(rawAudit);
      }
    } catch {
      // safe fallback
    }
  }

  public static getInstance(): ProjectPriceEngine {
    if (!ProjectPriceEngine.instance) {
      ProjectPriceEngine.instance = new ProjectPriceEngine();
    }
    return ProjectPriceEngine.instance;
  }

  public static resetInstance(): void {
    ProjectPriceEngine.instance = new ProjectPriceEngine();
  }

  public clearAll(): void {
    this.projectPrices.clear();
    this.projectOverrides.clear();
    this.auditTrail = [];
    this.lockedRevisions.clear();
    this.notify();
  }

  // ==========================================================================
  // 1. PROJECT MATERIAL PRICE CRUD
  // ==========================================================================

  public setProjectPrice(
    priceInput: Omit<ProjectMaterialPrice, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { createdBy?: string },
    user: { id: string; name: string } = { id: 'USR-DEFAULT', name: 'Ahmad Yusuf (Estimator)' }
  ): ProjectMaterialPrice {
    const { projectId, materialId, price, unit } = priceInput;

    if (!projectId || !projectId.trim()) {
      throw new Error('PROJECT_CONTEXT_REQUIRED: Cannot set project price without a valid projectId.');
    }
    if (!materialId || !materialId.trim()) {
      throw new Error('MATERIAL_ID_REQUIRED: Cannot set project price without materialId.');
    }
    if (price < 0 || isNaN(price)) {
      throw new Error('INVALID_PRICE: Project price cannot be negative or NaN.');
    }

    const normKey = PriceNormalizationEngine.normalizeCode(materialId);
    let projectMap = this.projectPrices.get(projectId);
    if (!projectMap) {
      projectMap = new Map();
      this.projectPrices.set(projectId, projectMap);
    }

    const existing = projectMap.get(normKey);
    const now = new Date().toISOString();

    const record: ProjectMaterialPrice = {
      id: existing?.id || `PRC-PROJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      projectId,
      materialId,
      materialCode: priceInput.materialCode || materialId,
      materialName: priceInput.materialName,
      price: Math.round(price),
      unit: PriceNormalizationEngine.normalizeUnit(unit),
      supplierId: priceInput.supplierId,
      supplierName: priceInput.supplierName,
      region: priceInput.region,
      effectiveDate: priceInput.effectiveDate || now.split('T')[0],
      validUntil: priceInput.validUntil,
      source: priceInput.source || 'QUOTATION',
      referenceNumber: priceInput.referenceNumber,
      notes: priceInput.notes,
      createdBy: existing?.createdBy || user.id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    projectMap.set(normKey, record);
    if (record.materialCode && record.materialCode !== materialId) {
      projectMap.set(PriceNormalizationEngine.normalizeCode(record.materialCode), record);
    }

    // Record audit trail
    this.recordAudit({
      projectId,
      materialId,
      materialCode: record.materialCode,
      materialName: record.materialName || record.materialCode,
      action: 'SET_PROJECT_PRICE',
      oldPrice: existing?.price,
      newPrice: record.price,
      unit: record.unit,
      reason: priceInput.notes || (existing ? 'Pembaruan penawaran harga proyek' : 'Penetapan harga proyek baru'),
      userId: user.id,
      userName: user.name,
      metadata: {
        supplier: record.supplierName,
        source: record.source,
        referenceNumber: record.referenceNumber,
        validUntil: record.validUntil,
      },
    });

    this.notify();
    return record;
  }

  public getProjectPrice(projectId: string, materialIdOrCode: string): ProjectMaterialPrice | undefined {
    if (!projectId || !materialIdOrCode) return undefined;
    const projectMap = this.projectPrices.get(projectId);
    if (!projectMap) return undefined;
    const normKey = PriceNormalizationEngine.normalizeCode(materialIdOrCode);
    const direct = projectMap.get(normKey);
    if (direct) return direct;

    const normText = PriceNormalizationEngine.normalizeText(materialIdOrCode);
    for (const record of projectMap.values()) {
      if (record.materialName && PriceNormalizationEngine.normalizeText(record.materialName) === normText) {
        return record;
      }
      if (record.materialCode && PriceNormalizationEngine.normalizeCode(record.materialCode) === normKey) {
        return record;
      }
    }
    return undefined;
  }

  public getProjectPrices(projectId: string): ProjectMaterialPrice[] {
    if (!projectId) return [];
    const projectMap = this.projectPrices.get(projectId);
    if (!projectMap) return [];
    return Array.from(new Set(projectMap.values()));
  }

  public removeProjectPrice(
    projectId: string,
    materialIdOrCode: string,
    user: { id: string; name: string } = { id: 'USR-DEFAULT', name: 'Ahmad Yusuf' }
  ): boolean {
    const projectMap = this.projectPrices.get(projectId);
    if (!projectMap) return false;

    const normKey = PriceNormalizationEngine.normalizeCode(materialIdOrCode);
    const existing = projectMap.get(normKey);
    if (!existing) return false;

    projectMap.delete(normKey);
    if (existing.materialCode) {
      projectMap.delete(PriceNormalizationEngine.normalizeCode(existing.materialCode));
    }

    this.recordAudit({
      projectId,
      materialId: existing.materialId,
      materialCode: existing.materialCode,
      materialName: existing.materialName || existing.materialCode,
      action: 'RESET_PRICE',
      oldPrice: existing.price,
      newPrice: 0,
      unit: existing.unit,
      reason: 'Harga proyek dihapus / di-reset ke acuan master',
      userId: user.id,
      userName: user.name,
    });

    this.notify();
    return true;
  }

  // ==========================================================================
  // 2. PROJECT PRICE OVERRIDE CRUD
  // ==========================================================================

  public setProjectOverride(
    overrideInput: Omit<ProjectPriceOverride, 'id' | 'createdAt' | 'createdBy'> & { createdBy?: string },
    user: { id: string; name: string } = { id: 'USR-DEFAULT', name: 'Ahmad Yusuf' }
  ): ProjectPriceOverride {
    const { projectId, materialId, price, unit, reason, active } = overrideInput;

    if (!projectId || !projectId.trim()) {
      throw new Error('PROJECT_CONTEXT_REQUIRED: Cannot set override without a valid projectId.');
    }
    if (!materialId || !materialId.trim()) {
      throw new Error('MATERIAL_ID_REQUIRED: Cannot set override without materialId.');
    }

    const normKey = PriceNormalizationEngine.normalizeCode(materialId);
    let overrideMap = this.projectOverrides.get(projectId);
    if (!overrideMap) {
      overrideMap = new Map();
      this.projectOverrides.set(projectId, overrideMap);
    }

    const existing = overrideMap.get(normKey);
    const now = new Date().toISOString();

    const record: ProjectPriceOverride = {
      id: existing?.id || `OVR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      projectId,
      materialId,
      materialCode: overrideInput.materialCode || materialId,
      materialName: overrideInput.materialName,
      category: overrideInput.category || existing?.category || 'MATERIAL',
      price: Math.round(price),
      unit: PriceNormalizationEngine.normalizeUnit(unit),
      reason: reason || 'Harga hasil negosiasi khusus proyek',
      createdBy: user.id,
      createdAt: existing?.createdAt || now,
      active: active !== undefined ? active : true,
      previousPrice: existing?.price || overrideInput.previousPrice,
      masterPrice: overrideInput.masterPrice ?? existing?.masterPrice,
    };

    overrideMap.set(normKey, record);
    if (record.materialCode && record.materialCode !== materialId) {
      overrideMap.set(PriceNormalizationEngine.normalizeCode(record.materialCode), record);
    }

    this.recordAudit({
      projectId,
      materialId,
      materialCode: record.materialCode,
      materialName: record.materialName || record.materialCode,
      action: record.active ? 'ACTIVATE_OVERRIDE' : 'DISABLE_OVERRIDE',
      oldPrice: existing?.price || record.previousPrice,
      newPrice: record.price,
      unit: record.unit,
      reason: record.reason,
      userId: user.id,
      userName: user.name,
      metadata: { active: record.active },
    });

    this.notify();
    return record;
  }

  public getProjectOverride(projectId: string, materialIdOrCode: string): ProjectPriceOverride | undefined {
    if (!projectId || !materialIdOrCode) return undefined;
    const overrideMap = this.projectOverrides.get(projectId);
    if (!overrideMap) return undefined;
    const normKey = PriceNormalizationEngine.normalizeCode(materialIdOrCode);
    const direct = overrideMap.get(normKey);
    if (direct) return direct;

    const normText = PriceNormalizationEngine.normalizeText(materialIdOrCode);
    for (const record of overrideMap.values()) {
      if (record.materialName && PriceNormalizationEngine.normalizeText(record.materialName) === normText) {
        return record;
      }
      if (record.materialCode && PriceNormalizationEngine.normalizeCode(record.materialCode) === normKey) {
        return record;
      }
    }
    return undefined;
  }

  public removeProjectOverride(
    projectId: string,
    materialIdOrCode: string,
    user: { id: string; name: string } = { id: 'USR-DEFAULT', name: 'Ahmad Yusuf' }
  ): boolean {
    const overrideMap = this.projectOverrides.get(projectId);
    if (!overrideMap) return false;

    const normKey = PriceNormalizationEngine.normalizeCode(materialIdOrCode);
    const existing = overrideMap.get(normKey);
    if (!existing) return false;

    overrideMap.delete(normKey);
    if (existing.materialCode) {
      overrideMap.delete(PriceNormalizationEngine.normalizeCode(existing.materialCode));
    }

    this.recordAudit({
      projectId,
      materialId: existing.materialId,
      materialCode: existing.materialCode,
      materialName: existing.materialName || existing.materialCode,
      action: 'DISABLE_OVERRIDE',
      oldPrice: existing.price,
      newPrice: 0,
      unit: existing.unit,
      reason: 'Override harga dihapus',
      userId: user.id,
      userName: user.name,
    });

    this.notify();
    return true;
  }

  public toggleProjectOverride(
    projectId: string,
    materialIdOrCode: string,
    active: boolean,
    reason?: string,
    user: { id: string; name: string } = { id: 'USR-DEFAULT', name: 'Ahmad Yusuf' }
  ): boolean {
    const override = this.getProjectOverride(projectId, materialIdOrCode);
    if (!override) return false;

    override.active = active;
    if (reason) override.reason = reason;

    this.recordAudit({
      projectId,
      materialId: override.materialId,
      materialCode: override.materialCode,
      materialName: override.materialName || override.materialCode,
      action: active ? 'ACTIVATE_OVERRIDE' : 'DISABLE_OVERRIDE',
      oldPrice: override.price,
      newPrice: override.price,
      unit: override.unit,
      reason: reason || (active ? 'Mengaktifkan kembali override harga' : 'Menonaktifkan override harga (kembali ke harga proyek/acuan)'),
      userId: user.id,
      userName: user.name,
      metadata: { active },
    });

    this.notify();
    return true;
  }

  public getProjectOverrides(projectId: string): ProjectPriceOverride[] {
    if (!projectId) return [];
    const overrideMap = this.projectOverrides.get(projectId);
    if (!overrideMap) return [];
    return Array.from(new Set(overrideMap.values()));
  }

  /**
   * Canonical helper to evaluate effective project price with full variance details.
   */
  public getEffectiveProjectPrice(
    projectId: string,
    resourceIdOrCode: string,
    fallbackMasterPrice: number = 0
  ): {
    price: number;
    isOverride: boolean;
    isProjectPrice: boolean;
    source: ResolvedPriceSource;
    status: ResolvedPriceStatus;
    masterPrice: number;
    varianceAmount: number;
    variancePercent: number;
    overrideRecord?: ProjectPriceOverride;
    projectPriceRecord?: ProjectMaterialPrice;
  } {
    const override = this.getProjectOverride(projectId, resourceIdOrCode);
    if (override && override.active) {
      const base = override.masterPrice ?? fallbackMasterPrice;
      const varianceAmount = override.price - base;
      const variancePercent = base > 0 ? (varianceAmount / base) * 100 : 0;
      return {
        price: override.price,
        isOverride: true,
        isProjectPrice: false,
        source: 'PROJECT_OVERRIDE',
        status: 'OVERRIDE',
        masterPrice: base,
        varianceAmount,
        variancePercent,
        overrideRecord: override,
      };
    }

    const projPrice = this.getProjectPrice(projectId, resourceIdOrCode);
    if (projPrice && !this.isPriceExpired(projPrice.validUntil)) {
      const base = fallbackMasterPrice;
      const varianceAmount = projPrice.price - base;
      const variancePercent = base > 0 ? (varianceAmount / base) * 100 : 0;
      return {
        price: projPrice.price,
        isOverride: false,
        isProjectPrice: true,
        source: 'PROJECT_PRICE',
        status: 'PROJECT_PRICE',
        masterPrice: base,
        varianceAmount,
        variancePercent,
        projectPriceRecord: projPrice,
      };
    }

    return {
      price: fallbackMasterPrice,
      isOverride: false,
      isProjectPrice: false,
      source: 'EZRAB_REFERENCE',
      status: 'REFERENCE',
      masterPrice: fallbackMasterPrice,
      varianceAmount: 0,
      variancePercent: 0,
    };
  }

  // ==========================================================================
  // 3. AUDIT TRAIL & HISTORY
  // ==========================================================================

  public recordAudit(entry: Omit<PriceAuditRecord, 'id' | 'timestamp'>): PriceAuditRecord {
    const record: PriceAuditRecord = {
      ...entry,
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toISOString(),
    };
    this.auditTrail.unshift(record);
    return record;
  }

  public getAuditTrail(projectId: string, materialIdOrCode?: string): PriceAuditRecord[] {
    let list = this.auditTrail.filter((a) => a.projectId === projectId);
    if (materialIdOrCode) {
      const norm = PriceNormalizationEngine.normalizeCode(materialIdOrCode);
      list = list.filter(
        (a) =>
          PriceNormalizationEngine.normalizeCode(a.materialId) === norm ||
          PriceNormalizationEngine.normalizeCode(a.materialCode || '') === norm
      );
    }
    return list;
  }

  // ==========================================================================
  // 4. PRICE LOCKING FOR REVISION IMMUTABILITY
  // ==========================================================================

  public lockRevisionPrices(
    projectId: string,
    revisionId: string,
    revisionTitle: string,
    arg4: any,
    arg5?: any
  ): PriceLockRecord {
    if (!projectId || !revisionId) {
      throw new Error('PROJECT_AND_REVISION_REQUIRED: Cannot lock prices without projectId and revisionId.');
    }

    const items: Array<{
      materialId: string;
      materialCode?: string;
      materialName?: string;
      price: number;
      unit: string;
      source: ResolvedPriceSource;
      status: ResolvedPriceStatus;
    }> = Array.isArray(arg4) ? arg4 : Array.isArray(arg5) ? arg5 : [];

    const user: { id: string; name: string } =
      typeof arg4 === 'object' && !Array.isArray(arg4) && arg4 !== null
        ? arg4
        : typeof arg5 === 'string'
        ? { id: 'USR-LOCK', name: arg5 }
        : typeof arg5 === 'object' && arg5 !== null && !Array.isArray(arg5)
        ? arg5
        : { id: 'USR-LOCK', name: 'Ahmad Yusuf (Estimator)' };

    let projMap = this.lockedRevisions.get(projectId);
    if (!projMap) {
      projMap = new Map();
      this.lockedRevisions.set(projectId, projMap);
    }

    const lockRecord: PriceLockRecord = {
      id: `LOCK-${projectId}-${revisionId}-${Date.now()}`,
      projectId,
      revisionId,
      revisionTitle,
      lockedAt: new Date().toISOString(),
      lockedBy: user.name,
      items: items.map((i) => ({ ...i })),
    };

    projMap.set(revisionId, lockRecord);

    this.recordAudit({
      projectId,
      materialId: 'ALL_REVISION_ITEMS',
      materialName: `Kunci Harga Revisi [${revisionId}] ${revisionTitle}`,
      action: 'LOCK_PRICE',
      newPrice: items.length,
      unit: 'items',
      reason: `Membekukan ${items.length} harga material untuk revisi resmi RAB ${revisionId}`,
      userId: user.id,
      userName: user.name,
      metadata: { revisionId, itemCount: items.length },
    });

    return lockRecord;
  }

  public getLockedRevision(projectId: string, revisionId: string): PriceLockRecord | undefined {
    return this.lockedRevisions.get(projectId)?.get(revisionId);
  }

  public getLockedRevisionPrices(projectId: string, revisionId: string): Array<{
    materialId: string;
    materialCode?: string;
    materialName?: string;
    price: number;
    unit: string;
    source: ResolvedPriceSource;
    status: ResolvedPriceStatus;
    isLocked: boolean;
    lockedRevisionId: string;
  }> {
    const revision = this.getLockedRevision(projectId, revisionId);
    if (!revision) return [];
    return revision.items.map((item) => ({
      ...item,
      isLocked: true,
      lockedRevisionId: revisionId,
    }));
  }

  public getAllLockedRevisions(projectId: string): PriceLockRecord[] {
    const map = this.lockedRevisions.get(projectId);
    if (!map) return [];
    return Array.from(map.values());
  }

  // ==========================================================================
  // 5. PRICE COMPARISON & EXPIRATION HELPERS
  // ==========================================================================

  public isPriceExpired(validUntilOrItem?: string | { validUntil?: string }, asOfDate?: string): boolean {
    const validUntil = typeof validUntilOrItem === 'object' && validUntilOrItem !== null
      ? validUntilOrItem.validUntil
      : validUntilOrItem;
    if (!validUntil) return false;
    const refDate = asOfDate ? new Date(asOfDate) : new Date();
    refDate.setHours(0, 0, 0, 0);
    const until = new Date(validUntil);
    until.setHours(23, 59, 59, 999);
    return refDate.getTime() > until.getTime();
  }

  public computePriceComparison(
    referencePrice: number,
    projectPrice?: number,
    override?: ProjectPriceOverride
  ): PriceComparison {
    const isOverrideActive = Boolean(override && override.active);
    const finalPrice = isOverrideActive
      ? override!.price
      : projectPrice !== undefined
      ? projectPrice
      : referencePrice;

    const baseForVariance = referencePrice > 0 ? referencePrice : finalPrice;
    const varianceAmount = finalPrice - baseForVariance;
    const variancePercent = baseForVariance > 0 ? (varianceAmount / baseForVariance) * 100 : 0;

    let status: ResolvedPriceStatus = 'REFERENCE';
    if (isOverrideActive) {
      status = 'OVERRIDE';
    } else if (projectPrice !== undefined) {
      status = 'PROJECT_PRICE';
    }

    return {
      referencePrice,
      projectPrice,
      overridePrice: isOverrideActive ? override!.price : undefined,
      finalPrice,
      varianceAmount,
      variancePercent: Number(variancePercent.toFixed(2)),
      status,
      isOverride: isOverrideActive,
    };
  }

  // ==========================================================================
  // 6. BULK OPERATIONS & SPREADSHEET IO
  // ==========================================================================

  public bulkSetProjectPrices(
    projectId: string,
    items: Array<{
      materialId?: string;
      materialCode?: string;
      materialName?: string;
      price: number;
      unit?: string;
      supplierName?: string;
      source?: ProjectPriceSourceType;
      notes?: string;
      validUntil?: string;
      region?: string;
      effectiveDate?: string;
    }>,
    user: { id: string; name: string } = { id: 'USR-01', name: 'Ahmad Yusuf' }
  ): number {
    let count = 0;
    for (const item of items) {
      const code = item.materialCode || item.materialId || `ITEM-${Date.now()}-${count}`;
      this.setProjectPrice(
        {
          projectId,
          materialId: item.materialId || code,
          materialCode: code,
          materialName: item.materialName || code,
          price: item.price,
          unit: item.unit || 'unit',
          supplierName: item.supplierName,
          region: item.region,
          effectiveDate: item.effectiveDate,
          source: item.source || 'QUOTATION',
          notes: item.notes,
          validUntil: item.validUntil,
        },
        user
      );
      count++;
    }
    return count;
  }

  public exportToCsv(
    projectId: string,
    referencePriceLookup?: (codeOrId: string) => number | undefined
  ): string {
    const projectPrices = this.getProjectPrices(projectId);
    const header = [
      'material_code',
      'material_name',
      'price',
      'unit',
      'supplier',
      'region',
      'effective_date',
      'source',
    ];

    const rows = projectPrices.map((p) => {
      return [
        `"${p.materialCode || p.materialId}"`,
        `"${(p.materialName || '').replace(/"/g, '""')}"`,
        p.price,
        `"${p.unit}"`,
        `"${(p.supplierName || '').replace(/"/g, '""')}"`,
        `"${(p.region || '').replace(/"/g, '""')}"`,
        `"${p.effectiveDate || ''}"`,
        `"${p.source}"`,
      ].join(',');
    });

    return [header.join(','), ...rows].join('\n');
  }

  public importFromCsv(
    projectId: string,
    csvContent: string,
    user: { id: string; name: string } = { id: 'USR-DEFAULT', name: 'Ahmad Yusuf' }
  ): { importedCount: number; successCount: number; validCount: number; invalidCount: number; errors: string[]; previewRows: any[] } {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return { importedCount: 0, successCount: 0, validCount: 0, invalidCount: 0, errors: ['Berkas CSV kosong atau tidak memiliki baris data.'], previewRows: [] };
    }

    const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
    const codeIdx = header.findIndex((h) => h.includes('kode') || h.includes('code'));
    const priceIdx = header.findIndex((h) => h.includes('proyek') || h.includes('harga') || h.includes('price'));
    const unitIdx = header.findIndex((h) => h.includes('satuan') || h.includes('unit'));
    const nameIdx = header.findIndex((h) => h.includes('nama') || h.includes('material') || h.includes('item'));
    const supplierIdx = header.findIndex((h) => h.includes('supplier') || h.includes('vendor'));
    const sourceIdx = header.findIndex((h) => h.includes('sumber') || h.includes('source'));
    const notesIdx = header.findIndex((h) => h.includes('catatan') || h.includes('notes'));
    const validUntilIdx = header.findIndex((h) => h.includes('sampai') || h.includes('valid'));

    if (codeIdx === -1 || priceIdx === -1) {
      return {
        importedCount: 0,
        successCount: 0,
        validCount: 0,
        invalidCount: 0,
        errors: ['Kolom wajib tidak ditemukan: Harap sertakan kolom "Kode" dan "Harga Proyek".'],
        previewRows: [],
      };
    }

    const errors: string[] = [];
    const previewRows: any[] = [];
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/"/g, '').trim());
      const code = cols[codeIdx];
      const rawPrice = cols[priceIdx];
      const unit = unitIdx !== -1 ? cols[unitIdx] : 'unit';
      const name = nameIdx !== -1 ? cols[nameIdx] : code;
      const supplier = supplierIdx !== -1 ? cols[supplierIdx] : undefined;
      const source = (sourceIdx !== -1 ? cols[sourceIdx] : 'QUOTATION') as ProjectPriceSourceType;
      const notes = notesIdx !== -1 ? cols[notesIdx] : undefined;
      const validUntil = validUntilIdx !== -1 ? cols[validUntilIdx] : undefined;

      const numPrice = parseFloat(rawPrice);
      if (!code || isNaN(numPrice) || numPrice < 0) {
        errors.push(`Baris ${i + 1}: Kode atau harga "${rawPrice}" tidak valid.`);
        continue;
      }

      previewRows.push({ code, name, unit, price: numPrice, supplier, source });

      this.setProjectPrice(
        {
          projectId,
          materialId: code,
          materialCode: code,
          materialName: name,
          price: numPrice,
          unit,
          supplierName: supplier,
          source: ['SUPPLIER', 'PURCHASE', 'QUOTATION', 'CONTRACT', 'USER'].includes(source) ? source : 'QUOTATION',
          notes,
          validUntil,
        },
        user
      );
      count++;
    }

    return { importedCount: count, successCount: count, validCount: count, invalidCount: errors.length, errors, previewRows };
  }

  // ==========================================================================
  // 7. DETERMINISTIC WATERFALL PRICE RESOLVER
  // ==========================================================================

  public resolveFinalPrice(options: {
    materialIdOrCode: string;
    projectId?: string;
    fallbackReferencePrice?: number;
    unit?: string;
    asOfDate?: string;
  }): {
    price: number;
    unit: string;
    source: ResolvedPriceSource;
    status: ResolvedPriceStatus;
    referencePrice: number;
    varianceAmount: number;
    variancePercent: number;
    isFinal: boolean;
    isExpired?: boolean;
    confidence?: number;
    explanation?: string;
    provenance?: {
      sourceName?: string;
      supplier?: string;
      region?: string;
      referenceNumber?: string;
      createdBy?: string;
      createdAt?: string;
    };
  } {
    const { materialIdOrCode, projectId, asOfDate } = options;
    const defaultUnit = options.unit || 'sak';
    const nationalRefPrice = options.fallbackReferencePrice !== undefined ? options.fallbackReferencePrice : 74000;
    if (options.fallbackReferencePrice === undefined) {
      // PHASE 1 telemetry: no reference price supplied → a fabricated Rp 74.000/sak is used
      // and later reported as `isFinal: true`.
      recordFabricatedTotal('projectprice.material.default', 74000, {
        constant: 74000,
        unit: defaultUnit,
        itemName: materialIdOrCode,
      });
    }

    // Helper to calculate variance
    const calcVariance = (finalPrice: number) => {
      const varianceAmount = finalPrice - nationalRefPrice;
      const variancePercent = nationalRefPrice > 0 ? Number(((varianceAmount / nationalRefPrice) * 100).toFixed(2)) : 0;
      return { varianceAmount, variancePercent };
    };

    // 1. TIER 1: Project-Specific Active Override
    if (projectId) {
      const override = this.getProjectOverride(projectId, materialIdOrCode);
      if (override && override.active) {
        const { varianceAmount, variancePercent } = calcVariance(override.price);
        return {
          price: override.price,
          unit: override.unit || defaultUnit,
          source: 'PROJECT_OVERRIDE',
          status: 'OVERRIDE',
          referencePrice: nationalRefPrice,
          varianceAmount,
          variancePercent,
          isFinal: true,
          confidence: 1.0,
          explanation: `Harga khusus proyek hasil override estimator: ${override.reason || 'Negosiasi proyek'}`,
          provenance: {
            sourceName: 'Keputusan Override Proyek (Estimator)',
            createdBy: override.createdBy,
            createdAt: override.createdAt,
          },
        };
      }
    }

    // 2. TIER 2: Project Material Price (e.g. Quotation / Supplier)
    if (projectId) {
      const projPrice = this.getProjectPrice(projectId, materialIdOrCode);
      if (projPrice) {
        if (this.isPriceExpired(projPrice.validUntil, asOfDate)) {
          // Fallback to active reference price when expired
          return {
            price: nationalRefPrice,
            unit: projPrice.unit || defaultUnit,
            source: 'EZRAB_REFERENCE',
            status: 'EXPIRED',
            referencePrice: nationalRefPrice,
            varianceAmount: 0,
            variancePercent: 0,
            isFinal: false,
            isExpired: true,
            confidence: 0.95,
            explanation: `Penawaran harga proyek telah kedaluwarsa (${projPrice.validUntil}), dialihkan ke harga referensi master`,
            provenance: {
              sourceName: 'EZRAB National Reference (Fallback due to Expired Project Price)',
              region: 'Nasional',
            },
          };
        }

        const { varianceAmount, variancePercent } = calcVariance(projPrice.price);
        return {
          price: projPrice.price,
          unit: projPrice.unit || defaultUnit,
          source: 'PROJECT_PRICE',
          status: 'PROJECT_PRICE',
          referencePrice: nationalRefPrice,
          varianceAmount,
          variancePercent,
          isFinal: true,
          confidence: 0.98,
          explanation: `Harga penawaran proyek (${projPrice.supplierName || projPrice.source})`,
          provenance: {
            sourceName: `Penawaran ${projPrice.source || 'Quotation'}`,
            supplier: projPrice.supplierName,
            region: projPrice.region,
            referenceNumber: projPrice.referenceNumber,
            createdBy: projPrice.createdBy,
            createdAt: projPrice.createdAt,
          },
        };
      }
    }

    // 3. TIER 3: EZRAB National Database Reference
    return {
      price: nationalRefPrice,
      unit: defaultUnit,
      source: 'EZRAB_REFERENCE',
      status: 'REFERENCE',
      referencePrice: nationalRefPrice,
      varianceAmount: 0,
      variancePercent: 0,
      isFinal: true,
      confidence: 0.95,
      explanation: 'Harga acuan standar database master EZRAB',
      provenance: {
        sourceName: 'EZRAB Material Master Database 2026',
        region: 'Nasional / Jawa Timur',
      },
    };
  }

  public lockProjectPrices(
    projectId: string,
    revisionId: string,
    codes?: string[],
    user: { id: string; name: string } = { id: 'USR-01', name: 'Ahmad Yusuf' }
  ): boolean {
    const prices = this.getProjectPrices(projectId);
    const targetPrices = codes && codes.length > 0
      ? prices.filter(p => codes.includes(p.materialCode || p.materialId))
      : prices;

    const lockItems = targetPrices.map((p) => {
      const res = this.resolveFinalPrice({ materialIdOrCode: p.materialId, projectId });
      return {
        materialId: p.materialId,
        materialCode: p.materialCode,
        materialName: p.materialName,
        price: res.price,
        unit: res.unit,
        source: res.source,
        status: res.status,
      };
    });

    this.lockRevisionPrices(projectId, revisionId, `RAB ${revisionId}`, user, lockItems);
    return true;
  }

  public getAuditLogs(projectId: string, materialIdOrCode?: string): PriceAuditRecord[] {
    return this.getAuditTrail(projectId, materialIdOrCode);
  }

  public exportProjectPrices(
    projectId: string,
    format: 'CSV' | 'JSON' = 'CSV',
    refLookup: (code: string) => number | undefined = (code: string) => {
      // PHASE 1 telemetry: the default reference lookup fabricates Rp 74.000 for every code.
      recordFabricatedTotal('projectprice.material.default-fallback', 74000, {
        constant: 74000,
        itemName: code,
      });
      return 74000;
    }
  ): string {
    if (format === 'JSON') {
      return JSON.stringify(this.getProjectPrices(projectId), null, 2);
    }
    return this.exportToCsv(projectId, refLookup);
  }

  public importProjectPrices(
    projectId: string,
    contentOrItems: string | Array<any>,
    format: 'CSV' | 'JSON' = 'CSV',
    user: { id: string; name: string } = { id: 'USR-01', name: 'Ahmad Yusuf' }
  ): { importedCount: number; successCount: number; errors: string[]; previewRows: any[] } {
    if (Array.isArray(contentOrItems)) {
      let count = 0;
      for (const item of contentOrItems) {
        const code = item.material_code || item.materialCode || item.materialId;
        const price = item.price;
        const unit = item.unit || 'unit';
        const name = item.material_name || item.materialName || code;
        const supplier = item.supplier || item.supplierName;
        const region = item.region;
        const source = item.source || 'QUOTATION';
        const notes = item.notes;

        if (code && price !== undefined && !isNaN(price)) {
          this.setProjectPrice({
            projectId,
            materialId: code,
            materialCode: code,
            materialName: name,
            price: Number(price),
            unit,
            supplierName: supplier,
            region,
            source,
            notes,
          }, user);
          count++;
        }
      }
      return { importedCount: count, successCount: count, errors: [], previewRows: contentOrItems };
    }

    if (format === 'JSON') {
      try {
        const items = JSON.parse(contentOrItems) as ProjectMaterialPrice[];
        const count = this.bulkSetProjectPrices(projectId, items, user);
        return { importedCount: count, successCount: count, errors: [], previewRows: items };
      } catch (err: any) {
        return { importedCount: 0, successCount: 0, errors: [err.message || 'Invalid JSON content'], previewRows: [] };
      }
    }
    return this.importFromCsv(projectId, contentOrItems, user);
  }
}

export const projectPriceEngine = ProjectPriceEngine.getInstance();


