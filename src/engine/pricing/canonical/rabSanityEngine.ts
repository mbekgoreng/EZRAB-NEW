/**
 * EZRAB — RAB SANITY ENGINE & QUALITY GATE
 * =========================================
 * Phase 13, Phase 14, & Phase 20: Pre-Commit Quality & Anomaly Gate.
 *
 * Before any RAB can be marked VALID or committed to official spreadsheets,
 * it must pass the 7 Mandatory Audits:
 *   1. UNIT CHECK
 *   2. PRICE CHECK
 *   3. COEFFICIENT CHECK
 *   4. MAGNITUDE CHECK
 *   5. DUPLICATE CHECK
 *   6. SOURCE CHECK
 *   7. MISSING CHECK
 *
 * Anti-Absurd Gate:
 *   - Automatically detects absurd unit prices (e.g. rebar @ 3.8M/kg, girder @ 280M).
 *   - Enforces unit check BEFORE price acceptance.
 *   - BANS AI_ESTIMATED from achieving VALID status.
 *
 * Status Output:
 *   - VALID (Zero blockers, verified sources, sound engineering)
 *   - NEEDS_REVIEW (One or more engineering violations or unpriced items)
 *   - DRAFT (Preliminary / incomplete estimation)
 */

import { canonicalUnitRegistry } from './canonicalUnitRegistry';
import { priceSanityValidator } from './priceSanityValidator';
import { sourceGovernanceRegistry } from './sourceRegistry';

export type RabOverallStatus = 'DRAFT' | 'NEEDS_REVIEW' | 'VALID';

export interface RabSanityItem {
  id: string;
  name: string;
  code?: string;
  category?: string;
  volume: number;
  unit: string;
  unitPrice: number | null;
  totalCost: number | null;
  priceStatus?: string; // 'RESOLVED' | 'AI_ESTIMATED' | 'MISSING' | 'INVALID'
  source?: string;
  sourceDocument?: string;
  coefficients?: Array<{
    itemCode?: string;
    itemName: string;
    coefficient: number;
    unit: string;
  }>;
}

export interface SanityViolation {
  itemId?: string;
  itemName?: string;
  field?: string;
  issue: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface RabSanityCheckDetail {
  checkName: 'UNIT_CHECK' | 'PRICE_CHECK' | 'COEFFICIENT_CHECK' | 'MAGNITUDE_CHECK' | 'DUPLICATE_CHECK' | 'SOURCE_CHECK' | 'MISSING_CHECK';
  passed: boolean;
  violations: SanityViolation[];
}

export interface RabSanityAuditReport {
  overallStatus: RabOverallStatus;
  isValid: boolean;
  totalItems: number;
  totalRAB: number;
  checks: Record<string, RabSanityCheckDetail>;
  blockerCount: number;
  warningCount: number;
  summary: string;
}

export class RabSanityEngine {
  private static instance: RabSanityEngine;

  private constructor() {}

  public static getInstance(): RabSanityEngine {
    if (!RabSanityEngine.instance) {
      RabSanityEngine.instance = new RabSanityEngine();
    }
    return RabSanityEngine.instance;
  }

  /**
   * Run the 7 sanity checks against the candidate RAB items.
   */
  public auditRab(
    items: RabSanityItem[],
    options?: {
      projectType?: 'RESIDENTIAL_SINGLE_STOREY' | 'COMMERCIAL' | 'GENERAL';
      maxExpectedGrandTotal?: number;
    }
  ): RabSanityAuditReport {
    const isResidential = options?.projectType === 'RESIDENTIAL_SINGLE_STOREY' || true;
    const maxGrandTotal = options?.maxExpectedGrandTotal || (isResidential ? 600_000_000 : 50_000_000_000);

    const unitCheck: RabSanityCheckDetail = { checkName: 'UNIT_CHECK', passed: true, violations: [] };
    const priceCheck: RabSanityCheckDetail = { checkName: 'PRICE_CHECK', passed: true, violations: [] };
    const coeffCheck: RabSanityCheckDetail = { checkName: 'COEFFICIENT_CHECK', passed: true, violations: [] };
    const magCheck: RabSanityCheckDetail = { checkName: 'MAGNITUDE_CHECK', passed: true, violations: [] };
    const dupCheck: RabSanityCheckDetail = { checkName: 'DUPLICATE_CHECK', passed: true, violations: [] };
    const srcCheck: RabSanityCheckDetail = { checkName: 'SOURCE_CHECK', passed: true, violations: [] };
    const missCheck: RabSanityCheckDetail = { checkName: 'MISSING_CHECK', passed: true, violations: [] };

    let grandTotal = 0;
    const seenNames = new Map<string, string>(); // normalized name -> itemId

    for (const item of items) {
      const itemName = item.name || item.code || 'Item Tanpa Nama';
      const cleanUnit = (item.unit || '').trim();
      const normUnit = canonicalUnitRegistry.normalize(cleanUnit);
      const unitDim = canonicalUnitRegistry.getDimension(normUnit);

      // =======================================================================
      // 1. UNIT CHECK
      // =======================================================================
      if (!cleanUnit || cleanUnit === '-' || unitDim === 'UNKNOWN') {
        unitCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'unit',
          issue: `Satuan "${cleanUnit}" tidak terdaftar dalam Canonical Unit Registry.`,
          severity: 'BLOCKER',
        });
      }

      // Specific physical dimension rule checks
      const lowerName = itemName.toLowerCase();
      if (/tulangan|pembesian|besi beton/i.test(lowerName) && unitDim !== 'MASS') {
        unitCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'unit',
          issue: `Item pembesian/tulangan harus bersatuan massa (kg/ton), ditemukan: "${cleanUnit}".`,
          severity: 'BLOCKER',
        });
      }
      if (/pasir urug|urugan pasir|tanah urug/i.test(lowerName) && unitDim !== 'VOLUME') {
        unitCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'unit',
          issue: `Item urugan pasir/tanah harus bersatuan volume (m³), ditemukan: "${cleanUnit}".`,
          severity: 'BLOCKER',
        });
      }
      if (/beton|cor lantai|cor balok|cor kolom/i.test(lowerName) && unitDim !== 'VOLUME' && unitDim !== 'LENGTH') {
        unitCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'unit',
          issue: `Item pekerjaan beton harus bersatuan volume (m³) atau linier balok (m'), ditemukan: "${cleanUnit}".`,
          severity: 'BLOCKER',
        });
      }

      // =======================================================================
      // 2. PRICE CHECK (Anti-Absurd Anomaly Detection)
      // =======================================================================
      if (item.unitPrice === null || item.unitPrice === undefined) {
        priceCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'unitPrice',
          issue: 'Harga satuan kosong (null).',
          severity: 'BLOCKER',
        });
      } else {
        // Reject AI_ESTIMATED as final official price (§Phase 20)
        if (item.priceStatus === 'AI_ESTIMATED' || (item.source && item.source.toLowerCase().includes('ai-estimate'))) {
          priceCheck.violations.push({
            itemId: item.id,
            itemName,
            field: 'priceStatus',
            issue: 'Menggunakan harga AI_ESTIMATED yang belum divalidasi dengan sumber resmi/pasar.',
            severity: 'BLOCKER',
          });
        }

        const sanity = priceSanityValidator.validatePrice(itemName, item.unitPrice, cleanUnit);
        if (sanity.status === 'PRICE_INVALID') {
          priceCheck.violations.push({
            itemId: item.id,
            itemName,
            field: 'unitPrice',
            issue: sanity.rejectionReason || `Harga satuan Rp ${item.unitPrice.toLocaleString('id-ID')} tidak wajar.`,
            severity: 'BLOCKER',
          });
        } else if (sanity.status === 'SUSPICIOUS') {
          priceCheck.violations.push({
            itemId: item.id,
            itemName,
            field: 'unitPrice',
            issue: sanity.rejectionReason || 'Harga bernilai 0 atau mencurigakan.',
            severity: 'WARNING',
          });
        }
      }

      // =======================================================================
      // 3. COEFFICIENT CHECK
      // =======================================================================
      if (item.coefficients && item.coefficients.length > 0) {
        for (const c of item.coefficients) {
          if (c.coefficient === null || c.coefficient === undefined || isNaN(c.coefficient)) {
            coeffCheck.violations.push({
              itemId: item.id,
              itemName,
              field: 'coefficient',
              issue: `Koefisien untuk komponen "${c.itemName}" tidak valid (NaN/null).`,
              severity: 'BLOCKER',
            });
          } else if (c.coefficient < 0) {
            coeffCheck.violations.push({
              itemId: item.id,
              itemName,
              field: 'coefficient',
              issue: `Koefisien untuk komponen "${c.itemName}" negatif (${c.coefficient}).`,
              severity: 'BLOCKER',
            });
          } else if (c.coefficient === 0) {
            coeffCheck.violations.push({
              itemId: item.id,
              itemName,
              field: 'coefficient',
              issue: `Koefisien untuk komponen "${c.itemName}" bernilai 0.`,
              severity: 'WARNING',
            });
          }
        }
      }

      // =======================================================================
      // 4. MAGNITUDE CHECK (Per-Item Check)
      // =======================================================================
      const itemTotal = item.totalCost || (item.unitPrice && item.volume ? item.unitPrice * item.volume : 0);
      grandTotal += itemTotal;

      if (isResidential && itemTotal > 100_000_000) {
        // e.g. Single rebar item reaching Rp 687M in a residential house is an engineering impossibility
        magCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'totalCost',
          issue: `Subtotal pekerjaan Rp ${itemTotal.toLocaleString('id-ID')} melampaui batas wajar satu pekerjaan perumahan 1 lantai (Rp 100.000.000).`,
          severity: 'BLOCKER',
        });
      }

      // =======================================================================
      // 5. DUPLICATE CHECK
      // =======================================================================
      const normKey = `${item.category || 'WORK'}_${itemName.toLowerCase().replace(/\s+/g, ' ').trim()}`;
      if (seenNames.has(normKey)) {
        dupCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'name',
          issue: `Pekerjaan terindikasi duplikasi dengan item ID ${seenNames.get(normKey)}. Potensi double counting.`,
          severity: 'WARNING',
        });
      } else {
        seenNames.set(normKey, item.id);
      }

      // =======================================================================
      // 6. SOURCE CHECK
      // =======================================================================
      if (!item.source || item.source === 'UNKNOWN' || item.source === 'NONE') {
        srcCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'source',
          issue: 'Sumber harga/AHSP tidak tercantum (untraceable source).',
          severity: 'WARNING',
        });
      }

      // =======================================================================
      // 7. MISSING CHECK
      // =======================================================================
      if (item.volume <= 0 || isNaN(item.volume)) {
        missCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'volume',
          issue: `Volume pekerjaan tidak valid (${item.volume}).`,
          severity: 'BLOCKER',
        });
      }
      if (item.totalCost === null || item.totalCost === undefined || item.totalCost <= 0) {
        missCheck.violations.push({
          itemId: item.id,
          itemName,
          field: 'totalCost',
          issue: 'Total biaya pekerjaan bernilai 0 atau belum terhitung.',
          severity: 'BLOCKER',
        });
      }
    }

    // Grand total magnitude check
    if (grandTotal > maxGrandTotal) {
      magCheck.violations.push({
        field: 'grandTotal',
        issue: `Total RAB Rp ${grandTotal.toLocaleString('id-ID')} melampaui batas kewajaran proyek (${maxGrandTotal.toLocaleString('id-ID')}).`,
        severity: 'BLOCKER',
      });
    }

    // Set passed booleans
    unitCheck.passed = unitCheck.violations.every((v) => v.severity !== 'BLOCKER');
    priceCheck.passed = priceCheck.violations.every((v) => v.severity !== 'BLOCKER');
    coeffCheck.passed = coeffCheck.violations.every((v) => v.severity !== 'BLOCKER');
    magCheck.passed = magCheck.violations.every((v) => v.severity !== 'BLOCKER');
    dupCheck.passed = dupCheck.violations.every((v) => v.severity !== 'BLOCKER');
    srcCheck.passed = srcCheck.violations.every((v) => v.severity !== 'BLOCKER');
    missCheck.passed = missCheck.violations.every((v) => v.severity !== 'BLOCKER');

    const allViolations = [
      ...unitCheck.violations,
      ...priceCheck.violations,
      ...coeffCheck.violations,
      ...magCheck.violations,
      ...dupCheck.violations,
      ...srcCheck.violations,
      ...missCheck.violations,
    ];

    const blockerCount = allViolations.filter((v) => v.severity === 'BLOCKER').length;
    const warningCount = allViolations.filter((v) => v.severity === 'WARNING').length;

    let overallStatus: RabOverallStatus = 'VALID';
    if (blockerCount > 0) {
      overallStatus = 'NEEDS_REVIEW';
    } else if (warningCount > 0) {
      overallStatus = 'NEEDS_REVIEW';
    }

    const summary =
      blockerCount === 0
        ? `RAB VALID: ${items.length} item diperiksa, 7 tahap audit lolos. Total RAB: Rp ${grandTotal.toLocaleString('id-ID')}.`
        : `RAB NEEDS_REVIEW: Ditemukan ${blockerCount} blocker kritis dan ${warningCount} peringatan. RAB tidak dapat disetujui (ACC) sebelum diperbaiki.`;

    return {
      overallStatus,
      isValid: blockerCount === 0,
      totalItems: items.length,
      totalRAB: grandTotal,
      checks: {
        UNIT_CHECK: unitCheck,
        PRICE_CHECK: priceCheck,
        COEFFICIENT_CHECK: coeffCheck,
        MAGNITUDE_CHECK: magCheck,
        DUPLICATE_CHECK: dupCheck,
        SOURCE_CHECK: srcCheck,
        MISSING_CHECK: missCheck,
      },
      blockerCount,
      warningCount,
      summary,
    };
  }
}

export const rabSanityEngine = RabSanityEngine.getInstance();
