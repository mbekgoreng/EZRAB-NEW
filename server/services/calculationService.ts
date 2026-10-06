import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';
import { RabItem } from '../../src/types';

export type CalculationValidationStatus =
  | 'READY'
  | 'NEEDS_REVIEW'
  | 'DATA_MISSING'
  | 'CONFLICT'
  | 'AHSP_NOT_FOUND'
  | 'PRICE_NOT_FOUND'
  | 'CALCULATION_ERROR';

export interface CategoryBreakdown {
  category: string;
  subtotal: number;
  weightPercent: number;
  itemCount: number;
}

export interface RabCalculationResult {
  directCost: number;
  overheadPercent: number;
  overheadAmount: number;
  profitPercent: number;
  profitAmount: number;
  subtotalBeforeTax: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  categories: CategoryBreakdown[];
  status: CalculationValidationStatus;
}

export interface AuditItemFinding {
  itemId: string;
  description: string;
  category: string;
  volume: number;
  unitPrice: number;
  subtotal: number;
  status: CalculationValidationStatus;
  issues: string[];
  recommendation: string;
}

export interface RabAuditReport {
  totalItems: number;
  totalCost: number;
  overallStatus: CalculationValidationStatus;
  summary: {
    cleanItemsCount: number;
    issuesCount: number;
    missingVolumeCount: number;
    zeroPriceCount: number;
    duplicateCount: number;
    highCostConcentrationCount: number;
  };
  findings: AuditItemFinding[];
}

export class CalculationService {
  /**
   * Calculate line item subtotal: volume * unitPrice with zero floating drift
   */
  public calculateItemSubtotal(volume: number, unitPrice: number): number {
    return SafeDecimalEngine.safeMultiply(volume, unitPrice);
  }

  /**
   * Safely calculate total of given items
   */
  public static calculateSubtotal(items: { volume?: number; unitPrice?: number; totalPrice?: number; amount?: number }[]): number {
    let sum = 0;
    for (const item of items) {
      const itemTotal = item.totalPrice ?? item.amount ?? SafeDecimalEngine.safeMultiply(item.volume || 0, item.unitPrice || 0);
      sum = SafeDecimalEngine.safeAdd(sum, itemTotal);
    }
    return sum;
  }

  public calculateSubtotal(items: { volume?: number; unitPrice?: number; totalPrice?: number; amount?: number }[]): number {
    return CalculationService.calculateSubtotal(items);
  }

  /**
   * Safe percentage calculation: (part / total) * 100
   */
  public static calculatePercentage(part: number, total: number, decimals = 2): number {
    if (!total || total === 0) return 0;
    const ratio = SafeDecimalEngine.safeDivide(part, total, 6);
    return SafeDecimalEngine.safeRound(ratio * 100, decimals);
  }

  public calculatePercentage(part: number, total: number, decimals = 2): number {
    return CalculationService.calculatePercentage(part, total, decimals);
  }

  /**
   * Calculate deviation: actual - planned
   */
  public static calculateProgressDeviation(actualProgress: number, plannedProgress: number): number {
    const act = SafeDecimalEngine.sanitize(actualProgress);
    const plan = SafeDecimalEngine.sanitize(plannedProgress);
    return SafeDecimalEngine.safeSubtract(act, plan);
  }

  public calculateDeviation(actual: number, planned: number): {
    deviation: number;
    status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE';
    statusLabel: string;
  } {
    const diff = CalculationService.calculateProgressDeviation(actual, planned);
    let status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE' = 'ON_TRACK';
    let statusLabel = 'Sesuai Rencana (On Track)';

    if (diff > 1.5) {
      status = 'AHEAD_OF_SCHEDULE';
      statusLabel = 'Lebih Cepat Dari Jadwal';
    } else if (diff < -1.5) {
      status = 'BEHIND_SCHEDULE';
      statusLabel = 'Keterlambatan Proyek (Delayed)';
    }

    return {
      deviation: diff,
      status,
      statusLabel
    };
  }

  /**
   * Calculate weighted progress from work items
   */
  public static calculateWeightedProgress(
    items: { progressPercent?: number; weightPercent?: number }[]
  ): number {
    let totalWeighted = 0;
    for (const item of items) {
      const prog = item.progressPercent || 0;
      const wt = item.weightPercent || 0;
      const contribution = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeMultiply(prog, wt), 100);
      totalWeighted = SafeDecimalEngine.safeAdd(totalWeighted, contribution);
    }
    return SafeDecimalEngine.safeRound(totalWeighted, 2);
  }

  /**
   * Run custom calculation for a set of items with volume and unit price
   */
  public calculateRabItems(items: { volume: number; unitPrice: number; description?: string }[]): {
    totalCost: number;
    itemCount: number;
    items: { volume: number; unitPrice: number; subtotal: number; status: CalculationValidationStatus }[];
  } {
    let sum = 0;
    const computedItems = items.map(i => {
      const subtotal = this.calculateItemSubtotal(i.volume, i.unitPrice);
      sum = SafeDecimalEngine.safeAdd(sum, subtotal);
      const status: CalculationValidationStatus = (i.volume <= 0 || i.unitPrice <= 0) ? 'DATA_MISSING' : 'READY';
      return {
        volume: i.volume,
        unitPrice: i.unitPrice,
        subtotal,
        status
      };
    });

    return {
      totalCost: sum,
      itemCount: items.length,
      items: computedItems
    };
  }

  /**
   * Full RAB calculation with overhead, profit, and 11% PPN tax
   */
  public static calculateRabSummary(
    items: RabItem[],
    overheadPercent = 5,
    profitPercent = 5,
    taxPercent = 11
  ): RabCalculationResult {
    const directCost = this.calculateSubtotal(items);
    const overheadAmount = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeMultiply(directCost, overheadPercent), 100);
    const profitAmount = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeMultiply(directCost, profitPercent), 100);
    const subtotalBeforeTax = SafeDecimalEngine.safeAdd(directCost, SafeDecimalEngine.safeAdd(overheadAmount, profitAmount));
    const taxAmount = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeMultiply(subtotalBeforeTax, taxPercent), 100);
    const grandTotal = SafeDecimalEngine.safeAdd(subtotalBeforeTax, taxAmount);

    // Group items by category
    const categoryMap = new Map<string, { subtotal: number; count: number }>();
    for (const item of items) {
      const cat = item.category || 'Pekerjaan Lainnya';
      const itemTotal = item.totalPrice ?? item.amount ?? SafeDecimalEngine.safeMultiply(item.volume || 0, item.unitPrice || 0);
      const current = categoryMap.get(cat) || { subtotal: 0, count: 0 };
      categoryMap.set(cat, {
        subtotal: SafeDecimalEngine.safeAdd(current.subtotal, itemTotal),
        count: current.count + 1,
      });
    }

    const categories: CategoryBreakdown[] = [];
    for (const [cat, data] of categoryMap.entries()) {
      categories.push({
        category: cat,
        subtotal: data.subtotal,
        weightPercent: this.calculatePercentage(data.subtotal, directCost),
        itemCount: data.count,
      });
    }

    categories.sort((a, b) => b.subtotal - a.subtotal);

    const hasIncomplete = items.some(i => (i.volume || 0) <= 0 || (i.unitPrice || 0) <= 0);

    return {
      directCost,
      overheadPercent,
      overheadAmount,
      profitPercent,
      profitAmount,
      subtotalBeforeTax,
      taxPercent,
      taxAmount,
      grandTotal,
      categories,
      status: hasIncomplete ? 'NEEDS_REVIEW' : 'READY',
    };
  }

  public calculateRabSummary(
    items: RabItem[],
    overheadPercent = 5,
    profitPercent = 5,
    taxPercent = 11
  ): RabCalculationResult {
    return CalculationService.calculateRabSummary(items, overheadPercent, profitPercent, taxPercent);
  }

  /**
   * Deterministic Unit Price Breakdown from AHSP coefficients & prices
   */
  public calculateAhspUnitPrice(
    coefficients: { name: string; type: 'material' | 'labor' | 'equipment'; coefficient: number; unitPrice: number }[]
  ): {
    unitPrice: number;
    materialTotal: number;
    laborTotal: number;
    equipmentTotal: number;
    breakdown: { name: string; subtotal: number }[];
  } {
    let materialTotal = 0;
    let laborTotal = 0;
    let equipmentTotal = 0;
    const breakdown = coefficients.map(c => {
      const subtotal = SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice);
      if (c.type === 'material') materialTotal = SafeDecimalEngine.safeAdd(materialTotal, subtotal);
      if (c.type === 'labor') laborTotal = SafeDecimalEngine.safeAdd(laborTotal, subtotal);
      if (c.type === 'equipment') equipmentTotal = SafeDecimalEngine.safeAdd(equipmentTotal, subtotal);
      return { name: c.name, subtotal };
    });

    const unitPrice = SafeDecimalEngine.safeAdd(materialTotal, SafeDecimalEngine.safeAdd(laborTotal, equipmentTotal));
    return {
      unitPrice,
      materialTotal,
      laborTotal,
      equipmentTotal,
      breakdown
    };
  }

  /**
   * Comprehensive RAB Audit Rule Engine
   */
  public auditRab(items: RabItem[]): RabAuditReport {
    const directCost = CalculationService.calculateSubtotal(items);
    const findings: AuditItemFinding[] = [];
    const seenDescriptions = new Map<string, number>();

    let missingVolumeCount = 0;
    let zeroPriceCount = 0;
    let duplicateCount = 0;
    let highCostConcentrationCount = 0;

    for (const item of items) {
      const issues: string[] = [];
      let status: CalculationValidationStatus = 'READY';
      const vol = item.volume || 0;
      const price = item.unitPrice || 0;
      const subtotal = item.totalPrice ?? item.amount ?? (vol * price);

      // 1. Missing volume check
      if (vol <= 0) {
        issues.push('Volume belum diisi atau bernilai 0');
        status = 'DATA_MISSING';
        missingVolumeCount++;
      }

      // 2. Zero price check
      if (price <= 0) {
        issues.push('Harga satuan 0 atau belum ditentukan');
        status = 'DATA_MISSING';
        zeroPriceCount++;
      }

      // 3. Duplication check
      const descKey = (item.description || '').trim().toLowerCase();
      if (descKey) {
        const count = seenDescriptions.get(descKey) || 0;
        seenDescriptions.set(descKey, count + 1);
        if (count >= 1) {
          issues.push(`Kemungkinan duplikasi uraian pekerjaan (${count + 1}x muncul)`);
          status = 'CONFLICT';
          duplicateCount++;
        }
      }

      // 4. High cost concentration check (> 25% of entire project budget)
      if (directCost > 0 && (subtotal / directCost) >= 0.25) {
        issues.push(`Konsentrasi biaya sangat tinggi: ${( (subtotal / directCost) * 100 ).toFixed(1)}% dari total anggaran`);
        if (status === 'READY') status = 'NEEDS_REVIEW';
        highCostConcentrationCount++;
      }

      if (issues.length > 0) {
        findings.push({
          itemId: item.id,
          description: item.description || 'Pekerjaan Tanpa Judul',
          category: item.category || 'Umum',
          volume: vol,
          unitPrice: price,
          subtotal,
          status,
          issues,
          recommendation: issues[0].includes('Volume')
            ? 'Lakukan pengukuran QTO atau input volume terukur dari gambar kerja.'
            : issues[0].includes('Harga')
            ? 'Cari acuan harga pada database AHSP 2026 atau master harga material.'
            : 'Periksa kembali konsistensi struktur WBS dan koefisien pekerjaan.'
        });
      }
    }

    const issuesCount = findings.length;
    const overallStatus: CalculationValidationStatus =
      issuesCount === 0 ? 'READY' : missingVolumeCount > 0 || zeroPriceCount > 0 ? 'DATA_MISSING' : 'NEEDS_REVIEW';

    return {
      totalItems: items.length,
      totalCost: directCost,
      overallStatus,
      summary: {
        cleanItemsCount: items.length - issuesCount,
        issuesCount,
        missingVolumeCount,
        zeroPriceCount,
        duplicateCount,
        highCostConcentrationCount
      },
      findings
    };
  }
}

export const calculationService = new CalculationService();
export const defaultCalculationService = calculationService;
