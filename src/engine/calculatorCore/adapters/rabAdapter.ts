/**
 * EZRAB CALCULATOR CORE — RAB & PRICING ADAPTER
 * Connects QTO quantities with authoritative AHSP, pricing, and cost composition engines.
 * Fails explicitly when AHSP or Unit Price is missing; never creates silent default prices.
 */

import { QTOItem, RabItem } from '../../../types';
import { PrecisionEngine } from '../precision/precisionEngine';
import { AHSPRepository } from '../../ahsp/repository/ahspRepository';
import { AHSPResolver } from '../../ahsp/resolver/ahspResolver';
import { PRICE_SOURCE_LABELS } from '../../pricing/assumption/types';
import type { PriceSourceKind } from '../../pricing/assumption/types';

/**
 * Summarize component-level provenance into a single RabItem label.
 * Explicit rules (never guess from nominal price):
 *   - Any UNRESOLVED → UNRESOLVED (partial; not final)
 *   - Any EZRAB_ASSUMPTION → EZRAB_ASSUMPTION (must be labeled, never "fully official")
 *   - Any MARKET_REFERENCE → MARKET_REFERENCE
 *   - All OFFICIAL_AHSP → OFFICIAL_AHSP
 */
function summarizeProvenance(
  components: Array<{ fallbackSourceKind?: PriceSourceKind }>
): { kind: PriceSourceKind; label: string; explanation: string } {
  const kinds = new Set<PriceSourceKind>();
  for (const c of components) {
    kinds.add(c.fallbackSourceKind ?? 'UNRESOLVED');
  }
  let kind: PriceSourceKind;
  if (kinds.has('UNRESOLVED')) kind = 'UNRESOLVED';
  else if (kinds.has('EZRAB_ASSUMPTION')) kind = 'EZRAB_ASSUMPTION';
  else if (kinds.has('MARKET_REFERENCE')) kind = 'MARKET_REFERENCE';
  else kind = 'OFFICIAL_AHSP';

  const counts = [...kinds].join(', ');
  const explanation =
    kind === 'OFFICIAL_AHSP'
      ? 'Seluruh komponen memakai harga resmi.'
      : `Campuran sumber komponen: ${counts}. ` +
        (kind === 'EZRAB_ASSUMPTION'
          ? 'Mengandung harga asumsi — BUKAN harga resmi AHSP.'
          : kind === 'UNRESOLVED'
            ? 'Ada komponen tanpa harga valid — total belum final.'
            : 'Mengandung referensi pasar.');
  return { kind, label: PRICE_SOURCE_LABELS[kind], explanation };
}
import { CostCompositionEngine } from '../../cost/composition/costCompositionEngine';
import { PriceContext } from '../../pricing/contracts/types';
import { CostCompositionResult } from '../../cost/contracts/types';

export type RabSyncStatus =
  | 'SUCCESS'
  | 'AHSP_NOT_FOUND'
  | 'PRICE_NOT_FOUND'
  | 'PROJECT_INVALID'
  | 'COMPOSE_ERROR';

export interface AhspPriceLookupResult {
  found: boolean;
  ahspCode?: string;
  ahspName?: string;
  unitPrice?: number;
  currency?: string;
  priceSource?: string;
  error?: string;
}

export interface RabSyncResult {
  status: RabSyncStatus;
  rabItem?: RabItem;
  costComposition?: CostCompositionResult;
  error?: string;
}

export class RabAdapter {
  /**
   * Sync a QTO Item to a RAB Item using an authoritative pricing resolver.
   */
  public static syncToRabItem(
    qtoItem: QTOItem,
    pricingResolver: (ahspCode: string, projectId: string) => AhspPriceLookupResult,
    options: {
      ahspCode: string;
      category?: string;
      targetSectionName?: string;
      targetRabId?: string;
      itemNumber?: number;
    }
  ): RabSyncResult {
    // 1. Authoritative Project Check
    if (!qtoItem.projectId || qtoItem.projectId.trim() === '') {
      return {
        status: 'PROJECT_INVALID',
        error: 'QTO Item has no valid authoritative projectId. Fail closed.',
      };
    }

    if (!options.ahspCode || options.ahspCode.trim() === '') {
      return {
        status: 'AHSP_NOT_FOUND',
        error: 'AHSP code is required for RAB synchronization. No default AHSP assumed.',
      };
    }

    // 2. Authoritative Price Lookup
    const lookup = pricingResolver(options.ahspCode, qtoItem.projectId);

    if (!lookup.found) {
      return {
        status: 'AHSP_NOT_FOUND',
        error: `AHSP code "${options.ahspCode}" not found in authoritative database.`,
      };
    }

    if (lookup.unitPrice === undefined || !Number.isFinite(lookup.unitPrice) || lookup.unitPrice < 0) {
      return {
        status: 'PRICE_NOT_FOUND',
        error: `Authoritative unit price not found for AHSP "${options.ahspCode}". Received: ${lookup.unitPrice}`,
      };
    }

    // 3. Exact Multiplication for Total Amount
    const amount = PrecisionEngine.applyPolicy(
      PrecisionEngine.multiply(qtoItem.quantity, lookup.unitPrice),
      'INTEGER_ROUND'
    );

    const rabId = options.targetRabId || `RAB-${Date.now().toString().slice(-6)}`;

    const rabItem: RabItem = {
      id: rabId,
      projectId: qtoItem.projectId,
      no: options.itemNumber || 1,
      code: options.ahspCode,
      category: options.targetSectionName || options.category || qtoItem.category || 'Pekerjaan Struktur',
      description: lookup.ahspName || qtoItem.uraian,
      volume: qtoItem.quantity,
      unit: qtoItem.unit,
      unitPrice: lookup.unitPrice,
      amount,
      ahspCode: options.ahspCode,
      volumeSource: 'CALCULATOR',
      qtoItemId: qtoItem.id,
      calculationRunId: qtoItem.calculationRunId,
      calculatorId: qtoItem.calculatorId,
      notes: lookup.priceSource ? `Price source: ${lookup.priceSource}` : undefined,
    };

    return {
      status: 'SUCCESS',
      rabItem,
    };
  }

  /**
   * Compose a full RAB item with complete Labor, Material, and Equipment breakdown
   * using the authoritative AHSP and Cost Composition Engine.
   */
  public static composeRabItemWithBreakdown(
    qtoItem: QTOItem,
    options: {
      ahspCode: string;
      category?: string;
      targetSectionName?: string;
      targetRabId?: string;
      itemNumber?: number;
      priceContext?: Partial<PriceContext>;
    },
    costEngine: CostCompositionEngine = new CostCompositionEngine(),
    ahspResolver: AHSPResolver = new AHSPResolver()
  ): RabSyncResult {
    // 1. Authoritative Project Check
    if (!qtoItem.projectId || qtoItem.projectId.trim() === '') {
      return {
        status: 'PROJECT_INVALID',
        error: 'QTO Item has no valid authoritative projectId. Fail closed.',
      };
    }

    if (!options.ahspCode || options.ahspCode.trim() === '') {
      return {
        status: 'AHSP_NOT_FOUND',
        error: 'AHSP code is required for RAB composition.',
      };
    }

    // 2. Resolve AHSP definition
    const ahspRes = ahspResolver.resolve(options.ahspCode, qtoItem.projectId);
    if (ahspRes.status !== 'EXACT_MATCH' && ahspRes.status !== 'NORMALIZED_MATCH' && ahspRes.status !== 'ALIAS_MATCH') {
      return {
        status: 'AHSP_NOT_FOUND',
        error: ahspRes.error || `AHSP "${options.ahspCode}" could not be resolved.`,
      };
    }

    const ahspDef = ahspRes.resolvedAHSP!;

    // 3. Run Cost Composition
    const priceCtx: PriceContext = {
      projectId: qtoItem.projectId,
      location: options.priceContext?.location || 'Nasional',
      periodVersion: options.priceContext?.periodVersion || '2026-Q1',
      ...options.priceContext,
    };

    const costResult = costEngine.compose({
      quantity: qtoItem.quantity,
      quantityUnit: qtoItem.unit,
      ahspDefinition: ahspDef,
      priceContext: priceCtx,
    });

    if (costResult.status === 'PROJECT_INVALID') {
      return { status: 'PROJECT_INVALID', error: costResult.errors.join(', ') };
    }
    if (costResult.status === 'INVALID_INPUT') {
      return { status: 'COMPOSE_ERROR', error: costResult.errors.join(', ') };
    }

    const rabId = options.targetRabId || `RAB-${Date.now().toString().slice(-6)}`;

    // Provenance wiring: summarize component-level fallback kinds.
    const allComponents = [
      ...costResult.labor.components,
      ...costResult.material.components,
      ...costResult.equipment.components,
    ];
    const prov = summarizeProvenance(allComponents);

    const rabItem: RabItem = {
      id: rabId,
      projectId: qtoItem.projectId,
      no: options.itemNumber || 1,
      code: options.ahspCode,
      category: options.targetSectionName || options.category || qtoItem.category || 'Pekerjaan Struktur',
      description: ahspDef.name || qtoItem.uraian,
      volume: qtoItem.quantity,
      unit: qtoItem.unit,
      unitPrice: costResult.unitCost,
      amount: costResult.directCost,
      ahspCode: options.ahspCode,
      volumeSource: 'CALCULATOR',
      qtoItemId: qtoItem.id,
      calculationRunId: qtoItem.calculationRunId,
      calculatorId: qtoItem.calculatorId,
      notes: `Direct Cost: Rp ${costResult.directCost.toLocaleString('id-ID')} (Labor: Rp ${costResult.labor.totalSubtotal.toLocaleString('id-ID')}, Material: Rp ${costResult.material.totalSubtotal.toLocaleString('id-ID')}, Equip: Rp ${costResult.equipment.totalSubtotal.toLocaleString('id-ID')})`,
      // Price Fallback Layer provenance (wired from cost composition)
      priceSourceKind: prov.kind,
      priceSourceLabel: prov.label,
      priceSourceExplanation: prov.explanation,
    };

    return {
      status: 'SUCCESS',
      rabItem,
      costComposition: costResult,
    };
  }
}
