/**
 * Phase 6.5: Deterministic RAB Draft Engine
 *
 * Formulates structured RAB Draft from Deterministic QTO items, Authoritative AHSP, and Price DB.
 * Guarantees mathematical precision using SafeDecimalEngine.
 * Enforces Source Traceability and Validation Gates.
 */

import {
  DeterministicQuantityItem,
  DeterministicRabDraftItem,
  DeterministicRabDraftSummary,
  WbsSubtotalGroup,
  ItemValidationStatus,
  SourceTraceabilityRecord
} from '../../src/domain/document/deterministicRabTypes';
import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';
import { TemplateMappingContext, ProjectTemplateSnapshot } from '../../src/domain/document/templateMappingTypes';
import { DeterministicQtoEngine } from './deterministicQtoEngine';
import { AuthoritativeAhspPriceBridge } from './authoritativeAhspPriceBridge';
import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';

export interface GenerateRabDraftInput {
  projectId: string;
  projectName?: string;
  templateContext?: TemplateMappingContext;
  entities?: CanonicalEntity[];
  qtoItems?: DeterministicQuantityItem[];
  ppnPercent?: number;
  allowAiEstimatedPrice?: boolean;
}

export class DeterministicRabDraftEngine {
  private static instance: DeterministicRabDraftEngine;

  private constructor() {}

  public static getInstance(): DeterministicRabDraftEngine {
    if (!DeterministicRabDraftEngine.instance) {
      DeterministicRabDraftEngine.instance = new DeterministicRabDraftEngine();
    }
    return DeterministicRabDraftEngine.instance;
  }

  /**
   * Formulate deterministic RAB Draft.
   */
  public generateRabDraft(input: GenerateRabDraftInput): DeterministicRabDraftSummary {
    const {
      projectId,
      projectName = 'Proyek Konstruksi',
      templateContext,
      entities = [],
      ppnPercent = 11,
      allowAiEstimatedPrice = false
    } = input;

    // 1. Get or compute deterministic QTO items
    let qtoItems = input.qtoItems;
    if (!qtoItems || qtoItems.length === 0) {
      qtoItems = DeterministicQtoEngine.getInstance().calculateQto({
        projectId,
        entities,
        templateContext
      });
    }

    const ahspBridge = AuthoritativeAhspPriceBridge.getInstance();
    const draftItems: DeterministicRabDraftItem[] = [];
    const validationFindings: string[] = [];

    let mappedCount = 0;
    let unmappedCount = 0;
    let missingAhspCount = 0;
    let missingPriceCount = 0;
    let conflictsCount = 0;
    let needsReviewCount = 0;

    const seenItemKeys = new Set<string>();

    for (const qto of qtoItems) {
      // Find matching entity
      const entity = entities.find(e => e.entityId === qto.entityId);

      // Search official AHSP
      const suggestedAhsp = entity?.elementType || undefined;
      const ahspResult = ahspBridge.searchAhsp(qto.name, suggestedAhsp, qto.wbsTitle);

      // Lookup official Price
      const priceResult = ahspBridge.lookupPrice(ahspResult, allowAiEstimatedPrice);

      // §43: no `|| 0` silent fallback. An unresolved price stays NULL and the row is
      // flagged; a NULL price must never be indistinguishable from a real Rp 0.
      const unitPrice = priceResult.unitPrice;
      const volume = qto.volume;
      const totalPrice = unitPrice === null ? null : SafeDecimalEngine.safeMultiply(volume, unitPrice);

      // Source Traceability Record
      const sourceTrace: SourceTraceabilityRecord = {
        entityIdentifier: entity?.identifier || 'ITEM',
        entityType: entity?.elementType || 'ELEMENT',
        sourceDrawings: entity?.drawingReferences || (qto.sourceEvidence.map(e => e.drawingId)),
        sourcePages: qto.sourceEvidence.map(e => e.pageNumber),
        evidenceCount: qto.sourceEvidence.length,
        primaryPageNumber: qto.sourceEvidence[0]?.pageNumber || 1,
        primaryDrawingNumber: qto.sourceEvidence[0]?.drawingId || 'DWG-001'
      };

      // Item Validation
      const itemNotes: string[] = [];
      let itemValStatus: ItemValidationStatus = 'VALID';

      if (volume <= 0) {
        itemValStatus = 'INVALID';
        itemNotes.push('Volume harus bernilai lebih besar dari 0.');
        validationFindings.push(`[${qto.wbsCode}] ${qto.name}: Volume tidak valid (${volume}).`);
      }

      if (!qto.unit || qto.unit === '') {
        itemValStatus = 'INVALID';
        itemNotes.push('Satuan pekerjaan tidak boleh kosong.');
      }

      if (ahspResult.matchStatus === 'NOT_FOUND') {
        missingAhspCount++;
        itemValStatus = itemValStatus === 'INVALID' ? 'INVALID' : 'NEEDS_REVIEW';
        itemNotes.push('AHSP resmi belum ditemukan (null). Memerlukan peninjauan manual.');
      }

      if (priceResult.priceStatus === 'PRICE_NOT_FOUND' || unitPrice === null) {
        missingPriceCount++;
        itemValStatus = itemValStatus === 'INVALID' ? 'INVALID' : 'NEEDS_REVIEW';
        itemNotes.push('Harga satuan belum tersedia di database harga daerah (harga = NULL, bukan Rp 0).');
      } else if (priceResult.priceStatus === 'AI_ESTIMATED') {
        itemValStatus = itemValStatus === 'INVALID' ? 'INVALID' : 'WARNING';
        itemNotes.push('Harga satuan merupakan estimasi statistik pasar (AI_ESTIMATE).');
      }

      if (qto.status === 'CONFLICT') {
        conflictsCount++;
        itemValStatus = itemValStatus === 'INVALID' ? 'INVALID' : 'NEEDS_REVIEW';
        itemNotes.push('Kuantitas entitas memiliki konflik antar gambar DED.');
        validationFindings.push(`[${qto.wbsCode}] ${qto.name}: Terdapat konflik dimensi drawing.`);
      }

      // Check duplicate work
      const itemKey = `${qto.wbsCode}:${qto.name}:${qto.unit}`;
      if (seenItemKeys.has(itemKey)) {
        itemValStatus = itemValStatus === 'INVALID' ? 'INVALID' : 'WARNING';
        itemNotes.push('Potensi item pekerjaan duplikat pada kode WBS yang sama.');
        validationFindings.push(`[${qto.wbsCode}] ${qto.name}: Terdeteksi duplikasi item pekerjaan.`);
      }
      seenItemKeys.add(itemKey);

      if (qto.wbsCode !== '00') {
        mappedCount++;
      } else {
        unmappedCount++;
      }

      if (itemValStatus === 'NEEDS_REVIEW' || itemValStatus === 'WARNING') {
        needsReviewCount++;
      }

      draftItems.push({
        rabDraftItemId: `rab_${qto.quantityId}`,
        projectId,
        workItemId: qto.workItemId,
        entityId: qto.entityId,
        wbsCode: qto.wbsCode,
        wbsTitle: qto.wbsTitle,
        description: qto.name,
        ahspCode: ahspResult.ahspCode,
        ahspTitle: ahspResult.ahspTitle,
        unit: qto.unit,
        volume,
        unitPrice,
        totalPrice,
        quantityProvenance: qto,
        ahspMatch: ahspResult,
        priceLookup: priceResult,
        sourceTrace,
        validationStatus: itemValStatus,
        validationNotes: itemNotes
      });
    }

    // Group Subtotals per WBS code
    const wbsSubtotals: Record<string, WbsSubtotalGroup> = {};
    let calculatedSubtotal = 0;

    for (const item of draftItems) {
      const wCode = item.wbsCode;
      if (!wbsSubtotals[wCode]) {
        wbsSubtotals[wCode] = {
          wbsCode: wCode,
          wbsTitle: item.wbsTitle,
          subtotal: 0,
          itemsCount: 0,
          unpricedItemsCount: 0,
          items: []
        };
      }
      wbsSubtotals[wCode].items.push(item);
      wbsSubtotals[wCode].itemsCount += 1;
      // Unpriced rows contribute nothing and are counted separately, so a subtotal is
      // never inflated by a fabricated 0 and the caller can see that it is incomplete.
      if (item.totalPrice === null) {
        wbsSubtotals[wCode].unpricedItemsCount += 1;
      } else {
        wbsSubtotals[wCode].subtotal = SafeDecimalEngine.safeAdd(wbsSubtotals[wCode].subtotal, item.totalPrice);
        calculatedSubtotal = SafeDecimalEngine.safeAdd(calculatedSubtotal, item.totalPrice);
      }
    }

    // Calculate PPN and Grand Total
    const ppnAmount = SafeDecimalEngine.safeRound(
      SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeMultiply(calculatedSubtotal, ppnPercent), 100),
      0
    );
    const grandTotal = SafeDecimalEngine.safeAdd(calculatedSubtotal, ppnAmount);

    // Total Consistency Assertion Check
    const sumWbsSubtotals = Object.values(wbsSubtotals).reduce((sum, g) => SafeDecimalEngine.safeAdd(sum, g.subtotal), 0);
    if (Math.abs(sumWbsSubtotals - calculatedSubtotal) > 0.01) {
      validationFindings.push(`Ketidakkonsistenan matematis terdeteksi antara Subtotal WBS (${sumWbsSubtotals}) dan Total Item (${calculatedSubtotal}).`);
    }

    const templateSnapshot: ProjectTemplateSnapshot = templateContext?.templateSnapshot || {
      templateId: 'tmpl-building-residential',
      templateVersion: '1.0.0',
      templateName: 'Standard Construction Template',
      category: 'BUILDING',
      type: 'residential',
      snapshotAt: new Date().toISOString(),
      parameters: [],
      wbsHierarchy: []
    };

    return {
      rabDraftId: `draft_${projectId}_${Date.now()}`,
      projectId,
      projectName,
      templateSnapshot,
      totalItems: draftItems.length,
      mappedItemsCount: mappedCount,
      unmappedItemsCount: unmappedCount,
      missingAhspCount,
      missingPriceCount,
      conflictsCount,
      needsReviewCount,
      wbsSubtotals,
      subtotal: calculatedSubtotal,
      ppnPercent,
      ppnAmount,
      grandTotal,
      items: draftItems,
      validationFindings,
      isFinalized: false,
      generatedAt: new Date().toISOString()
    };
  }
}
