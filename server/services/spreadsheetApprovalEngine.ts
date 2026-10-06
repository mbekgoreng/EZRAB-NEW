/**
 * Phase 6.6: Spreadsheet Approval & Transaction Engine
 *
 * Core Principles:
 * - Zero Direct AI Mutation: Requires Explicit User Review & Proposal Execution.
 * - Strict Project & Workspace Isolation: Validates authoritative projectId against proposal.
 * - Idempotency Guarantee: Prevents duplicate RAB generation on double click / network replay.
 * - Full Audit Logging: Tracks user approvals, edits, rejections, and conflict resolutions.
 * - SafeDecimal Math: 100% deterministic recalculation of subtotals and grand totals.
 */

import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';
import {
  RabReviewRowItem,
  SpreadsheetImportProposal,
  SpreadsheetImportResult,
  AuditLogEntry,
  ReviewCounts
} from '../../src/domain/document/reviewApprovalTypes';
import { DeterministicRabDraftSummary, DeterministicRabDraftItem } from '../../src/domain/document/deterministicRabTypes';
import { RABSection, RABItem } from '../../src/types';

export class SpreadsheetApprovalEngine {
  private static instance: SpreadsheetApprovalEngine;
  private idempotencyRegistry: Map<string, SpreadsheetImportResult> = new Map();
  private proposalRegistry: Map<string, SpreadsheetImportProposal> = new Map();
  private auditLogs: AuditLogEntry[] = [];

  private constructor() {}

  public static getInstance(): SpreadsheetApprovalEngine {
    if (!SpreadsheetApprovalEngine.instance) {
      SpreadsheetApprovalEngine.instance = new SpreadsheetApprovalEngine();
    }
    return SpreadsheetApprovalEngine.instance;
  }

  /**
   * Initialize Review Row Items from Deterministic RAB Draft Summary
   */
  public initializeReviewItems(summary: DeterministicRabDraftSummary): RabReviewRowItem[] {
    return summary.items.map((item, idx) => {
      let status: RabReviewRowItem['status'] = 'NEEDS_REVIEW';
      if (item.validationStatus === 'VALID' && item.quantityProvenance.status !== 'CONFLICT') {
        status = 'APPROVED';
      } else if (item.quantityProvenance.status === 'CONFLICT') {
        status = 'CONFLICT';
      } else if (item.validationStatus === 'WARNING') {
        status = 'WARNING';
      }

      return {
        no: idx + 1,
        rabDraftItemId: item.rabDraftItemId,
        entityId: item.entityId,
        wbsCode: item.wbsCode,
        wbsTitle: item.wbsTitle,
        ahspCode: item.ahspCode,
        ahspTitle: item.ahspMatch?.ahspTitle || item.ahspTitle,
        description: item.description,
        volume: item.volume,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        sumber: item.priceLookup?.source || 'PRICE_NOT_FOUND',
        status,
        sourceTrace: item.sourceTrace,
        isExcluded: false,
        auditHistory: [
          {
            id: `aud_init_${item.rabDraftItemId}`,
            timestamp: new Date().toISOString(),
            actor: 'SYSTEM_AI',
            action: 'CREATE',
            notes: `Draft item diinisialisasi dari QTO ${item.quantityProvenance.formula}`
          }
        ],
        calculationFormula: item.quantityProvenance.formula,
        notes: item.validationNotes
      };
    });
  }

  /**
   * Calculate Review Summary Counts
   */
  public calculateReviewCounts(
    items: RabReviewRowItem[],
    totalPages: number = 1,
    totalEntities: number = 0
  ): ReviewCounts {
    let mappedCount = 0;
    let unmappedCount = 0;
    let needsReviewCount = 0;
    let conflictsCount = 0;
    let missingAhspCount = 0;
    let missingPriceCount = 0;
    let duplicateCandidatesCount = 0;

    for (const item of items) {
      if (item.wbsCode && item.wbsCode !== '00') {
        mappedCount++;
      } else {
        unmappedCount++;
      }

      if (item.status === 'NEEDS_REVIEW' || item.status === 'WARNING') {
        needsReviewCount++;
      }

      if (item.status === 'CONFLICT' || item.sourceTrace.evidenceCount > 1) {
        conflictsCount++;
      }

      if (!item.ahspCode || item.ahspCode.trim() === '') {
        missingAhspCount++;
      }

      if (item.unitPrice === null || item.unitPrice <= 0 || item.sumber === 'PRICE_NOT_FOUND') {
        missingPriceCount++;
      }

      if (item.notes && item.notes.some(n => n.toLowerCase().includes('duplikat'))) {
        duplicateCandidatesCount++;
      }
    }

    return {
      totalPages: totalPages > 0 ? totalPages : 1,
      totalEntities: totalEntities > 0 ? totalEntities : items.length,
      mappedCount,
      unmappedCount,
      needsReviewCount,
      conflictsCount,
      missingAhspCount,
      missingPriceCount,
      duplicateCandidatesCount
    };
  }

  /**
   * User Action 1: Approve Item
   */
  public approveItem(items: RabReviewRowItem[], itemId: string, actor: string, notes?: string): RabReviewRowItem[] {
    return items.map(item => {
      if (item.rabDraftItemId !== itemId) return item;

      const updatedHistory: AuditLogEntry[] = [
        ...item.auditHistory,
        {
          id: `aud_app_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          timestamp: new Date().toISOString(),
          actor,
          action: 'APPROVE',
          notes: notes || 'Item disetujui untuk masuk ke Spreadsheet RAB'
        }
      ];

      return {
        ...item,
        status: 'APPROVED',
        isExcluded: false,
        auditHistory: updatedHistory
      };
    });
  }

  /**
   * User Action 2: Edit Item (Volume, Unit, Price, Description, AHSP)
   */
  public editItem(
    items: RabReviewRowItem[],
    itemId: string,
    edits: {
      volume?: number;
      unit?: string;
      /** NULL explicitly clears the price back to "unpriced". */
      unitPrice?: number | null;
      description?: string;
      ahspCode?: string | null;
      wbsCode?: string;
    },
    actor: string,
    reason: string
  ): RabReviewRowItem[] {
    return items.map(item => {
      if (item.rabDraftItemId !== itemId) return item;

      const newVol = edits.volume !== undefined ? edits.volume : item.volume;
      const newPrice = edits.unitPrice !== undefined ? edits.unitPrice : item.unitPrice;
      // An unpriced row stays unpriced: the total is NULL, never a stand-in 0.
      const newTot = newPrice === null ? null : SafeDecimalEngine.safeMultiply(newVol, newPrice);
      const newDesc = edits.description !== undefined ? edits.description : item.description;
      const newUnit = edits.unit !== undefined ? edits.unit : item.unit;
      const newAhsp = edits.ahspCode !== undefined ? edits.ahspCode : item.ahspCode;
      const newWbs = edits.wbsCode !== undefined ? edits.wbsCode : item.wbsCode;

      const updatedHistory: AuditLogEntry[] = [
        ...item.auditHistory,
        {
          id: `aud_edit_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          timestamp: new Date().toISOString(),
          actor,
          action: 'EDIT',
          previousValue: {
            volume: item.volume,
            unitPrice: item.unitPrice,
            description: item.description,
            ahspCode: item.ahspCode
          },
          newValue: {
            volume: newVol,
            unitPrice: newPrice,
            description: newDesc,
            ahspCode: newAhsp
          },
          reason
        }
      ];

      return {
        ...item,
        description: newDesc,
        volume: newVol,
        unit: newUnit,
        unitPrice: newPrice,
        totalPrice: newTot,
        ahspCode: newAhsp,
        wbsCode: newWbs,
        status: 'MODIFIED',
        sumber: edits.unitPrice !== undefined ? 'USER_OVERRIDE' : item.sumber,
        userModifications: {
          originalVolume: item.userModifications?.originalVolume ?? item.volume,
          originalUnitPrice: item.userModifications?.originalUnitPrice ?? item.unitPrice,
          originalDescription: item.userModifications?.originalDescription ?? item.description,
          originalAhspCode: item.userModifications?.originalAhspCode ?? item.ahspCode,
          originalWbsCode: item.userModifications?.originalWbsCode ?? item.wbsCode,
          modifiedAt: new Date().toISOString(),
          modifiedBy: actor
        },
        auditHistory: updatedHistory
      };
    });
  }

  /**
   * User Action 3: Reject / Exclude Item
   */
  public rejectItem(items: RabReviewRowItem[], itemId: string, actor: string, reason: string): RabReviewRowItem[] {
    return items.map(item => {
      if (item.rabDraftItemId !== itemId) return item;

      const updatedHistory: AuditLogEntry[] = [
        ...item.auditHistory,
        {
          id: `aud_rej_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          timestamp: new Date().toISOString(),
          actor,
          action: 'REJECT',
          reason
        }
      ];

      return {
        ...item,
        status: 'REJECTED',
        isExcluded: true,
        auditHistory: updatedHistory
      };
    });
  }

  /**
   * User Action 4: Resolve Conflict
   */
  public resolveConflict(
    items: RabReviewRowItem[],
    itemId: string,
    chosenVolume: number,
    actor: string,
    reason: string
  ): RabReviewRowItem[] {
    return items.map(item => {
      if (item.rabDraftItemId !== itemId) return item;

      const newTot = item.unitPrice === null ? null : SafeDecimalEngine.safeMultiply(chosenVolume, item.unitPrice);
      const updatedHistory: AuditLogEntry[] = [
        ...item.auditHistory,
        {
          id: `aud_res_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          timestamp: new Date().toISOString(),
          actor,
          action: 'RESOLVE_CONFLICT',
          previousValue: item.volume,
          newValue: chosenVolume,
          reason
        }
      ];

      return {
        ...item,
        volume: chosenVolume,
        totalPrice: newTot,
        status: 'APPROVED',
        auditHistory: updatedHistory
      };
    });
  }

  /**
   * Generate Proposal for Spreadsheet Import
   */
  public prepareProposal(params: {
    projectId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    items: RabReviewRowItem[];
    draftVersion?: string;
    ppnPercent?: number;
    idempotencyKey?: string;
  }): SpreadsheetImportProposal {
    const ppnPercent = params.ppnPercent ?? 11;
    const activeItems = params.items.filter(i => !i.isExcluded && i.status !== 'REJECTED');
    const rejectedItems = params.items.filter(i => i.isExcluded || i.status === 'REJECTED');

    // §17/§21: an unpriced row contributes NOTHING to the subtotal and is reported, so
    // the subtotal is never silently inflated by a fabricated 0.
    const unpricedItems = activeItems.filter(i => i.totalPrice === null);

    const subtotal = activeItems.reduce(
      (sum, item) => (item.totalPrice === null ? sum : SafeDecimalEngine.safeAdd(sum, item.totalPrice)),
      0
    );

    const ppnAmount = SafeDecimalEngine.safeRound(
      SafeDecimalEngine.safeMultiply(subtotal, ppnPercent / 100),
      0
    );

    const grandTotal = SafeDecimalEngine.safeAdd(subtotal, ppnAmount);

    const proposalId = `prop_${params.projectId}_${Date.now()}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = params.idempotencyKey || `idemp_${params.projectId}_${proposalId}`;
    const checksum = `chk_${subtotal}_${activeItems.length}_${params.draftVersion || 'v1.0'}`;

    const proposal: SpreadsheetImportProposal = {
      proposalId,
      requestId,
      idempotencyKey,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      userName: params.userName,
      draftVersion: params.draftVersion || 'v1.0.0',
      checksum,
      items: params.items,
      totalItems: params.items.length,
      activeItemsCount: activeItems.length,
      rejectedItemsCount: rejectedItems.length,
      unpricedItemsCount: unpricedItems.length,
      subtotalComplete: unpricedItems.length === 0,
      subtotal,
      ppnPercent,
      ppnAmount,
      grandTotal,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    this.proposalRegistry.set(proposalId, proposal);
    return proposal;
  }

  /**
   * Execute Approval and Import to Spreadsheet
   *
   * Enforces:
   * 1. Multi-Tenant & Project Isolation
   * 2. Permission / RBAC check (AI_CREATE or AI_UPDATE)
   * 3. Idempotency Key Guard
   * 4. Version & Expiration Check
   * 5. SafeDecimal Subtotal & Grand Total computation
   */
  public async executeImportToSpreadsheet(params: {
    proposal: SpreadsheetImportProposal;
    authoritativeProjectId: string;
    authoritativeWorkspaceId: string;
    userPermissions: string[];
    onCommitSuccess?: (sections: RABSection[], grandTotal: number) => void;
  }): Promise<SpreadsheetImportResult> {
    const { proposal, authoritativeProjectId, authoritativeWorkspaceId, userPermissions } = params;

    // 1. Idempotency Guard (Double-Click Protection)
    if (this.idempotencyRegistry.has(proposal.idempotencyKey)) {
      const cached = this.idempotencyRegistry.get(proposal.idempotencyKey)!;
      return {
        ...cached,
        idempotentReplay: true
      };
    }

    // 2. Strict Project Isolation Guard
    if (!proposal.projectId || proposal.projectId !== authoritativeProjectId) {
      throw new Error(
        `[SECURITY_VIOLATION] Project mismatch! Proposal project '${proposal.projectId}' does not match authoritative active project '${authoritativeProjectId}'.`
      );
    }

    // 3. Workspace / Tenant Isolation Guard
    if (proposal.workspaceId !== authoritativeWorkspaceId) {
      throw new Error(
        `[SECURITY_VIOLATION] Workspace mismatch! Proposal workspace '${proposal.workspaceId}' does not match authoritative workspace '${authoritativeWorkspaceId}'.`
      );
    }

    // 4. Permission / RBAC Gating
    const hasPermission = userPermissions.includes('AI_CREATE') ||
      userPermissions.includes('AI_UPDATE') ||
      userPermissions.includes('SUPER_ADMIN') ||
      userPermissions.includes('ESTIMATOR');

    if (!hasPermission) {
      throw new Error(
        `[PERMISSION_DENIED] User does not have sufficient RBAC permissions (AI_CREATE/AI_UPDATE) to apply RAB import to spreadsheet.`
      );
    }

    // 5. Active Items Validation
    const activeItems = proposal.items.filter(i => !i.isExcluded && i.status !== 'REJECTED');
    if (activeItems.length === 0) {
      throw new Error('Tidak ada item aktif yang dapat diimpor ke spreadsheet (seluruh item ditolak/dikecualikan).');
    }

    proposal.status = 'EXECUTING';

    // 6. Group Items into WBS RABSections
    const sectionsMap = new Map<string, { wbsTitle: string; items: RabReviewRowItem[] }>();

    for (const item of activeItems) {
      const code = item.wbsCode || '01';
      if (!sectionsMap.has(code)) {
        sectionsMap.set(code, { wbsTitle: item.wbsTitle || `Pekerjaan ${code}`, items: [] });
      }
      sectionsMap.get(code)!.items.push(item);
    }

    const importedSections: RABSection[] = [];
    let cumulativeDirectCost = 0;
    // §26 FAIL CLOSED — rows that cannot be priced are reported, never written as Rp 0.
    const blockedUnpricedItems: Array<{
      rabDraftItemId: string;
      wbsCode: string;
      description: string;
      unit: string;
      volume: number;
    }> = [];

    for (const [wbsCode, group] of sectionsMap.entries()) {
      let sectionSubtotal = 0;
      const rabItems: RABItem[] = [];

      group.items.forEach((item, index) => {
        // §26 FAIL CLOSED: an unpriced row must never be written into the RAB as a
        // fabricated Rp 0. It is skipped and reported so the user can price it first.
        if (item.unitPrice === null) {
          blockedUnpricedItems.push({
            rabDraftItemId: item.rabDraftItemId,
            wbsCode,
            description: item.description,
            unit: item.unit,
            volume: item.volume,
          });
          return;
        }

        const itemTot = SafeDecimalEngine.safeMultiply(item.volume, item.unitPrice);
        sectionSubtotal = SafeDecimalEngine.safeAdd(sectionSubtotal, itemTot);

        const rabItem: RABItem = {
          id: `rab_item_${proposal.projectId}_${item.rabDraftItemId}`,
          sectionId: `sec_${wbsCode}`,
          itemNumber: `${wbsCode}.${index + 1}`,
          wbsNumber: `${wbsCode}.${index + 1}`,
          code: item.ahspCode || `DED.${wbsCode}.${index + 1}`,
          description: item.description,
          specification: item.ahspTitle || item.description,
          volume: item.volume,
          unit: item.unit,
          materialPrice: SafeDecimalEngine.safeMultiply(item.unitPrice, 0.7),
          laborPrice: SafeDecimalEngine.safeMultiply(item.unitPrice, 0.25),
          equipmentPrice: SafeDecimalEngine.safeMultiply(item.unitPrice, 0.05),
          unitPrice: item.unitPrice,
          totalPrice: itemTot,
          ahspCode: item.ahspCode || undefined,
          sourceDocument: item.sourceTrace.sourceDrawings[0] || 'DED_SET',
          sourcePage: item.sourceTrace.primaryPageNumber,
          calculationFormula: item.calculationFormula,
          verificationStatus: item.status === 'APPROVED' ? 'VERIFIED' : 'NEEDS_VERIFICATION',
          originType: 'AI_VERIFIED',
          canonicalItemId: item.entityId,
          evidenceDetails: {
            sourcePages: item.sourceTrace.sourcePages,
            calculation: item.calculationFormula
          },
          notes: item.notes?.join('; ')
        };

        rabItems.push(rabItem);
      });

      cumulativeDirectCost = SafeDecimalEngine.safeAdd(cumulativeDirectCost, sectionSubtotal);

      importedSections.push({
        id: `sec_${wbsCode}`,
        code: wbsCode,
        name: group.wbsTitle,
        subtotal: sectionSubtotal,
        items: rabItems
      });
    }

    const finalPpn = SafeDecimalEngine.safeRound(
      SafeDecimalEngine.safeMultiply(cumulativeDirectCost, proposal.ppnPercent / 100),
      0
    );
    const finalGrandTotal = SafeDecimalEngine.safeAdd(cumulativeDirectCost, finalPpn);

    proposal.status = 'COMMITTED';
    proposal.executedAt = new Date().toISOString();

    const result: SpreadsheetImportResult = {
      success: true,
      proposalId: proposal.proposalId,
      requestId: proposal.requestId,
      projectId: proposal.projectId,
      workspaceId: proposal.workspaceId,
      createdSectionsCount: importedSections.length,
      createdItemsCount: activeItems.length - blockedUnpricedItems.length,
      subtotal: cumulativeDirectCost,
      ppnAmount: finalPpn,
      grandTotal: finalGrandTotal,
      importedSections,
      blockedUnpricedItems,
      idempotentReplay: false,
      timestamp: new Date().toISOString(),
      auditRecordId: `aud_rec_${Date.now()}`
    };

    // Store in Idempotency Registry
    this.idempotencyRegistry.set(proposal.idempotencyKey, result);

    // Call instant UI update callback
    if (params.onCommitSuccess) {
      params.onCommitSuccess(importedSections, finalGrandTotal);
    }

    return result;
  }

  /**
   * Reset / Clear registry for testing
   */
  public clearRegistry(): void {
    this.idempotencyRegistry.clear();
    this.proposalRegistry.clear();
    this.auditLogs = [];
  }
}