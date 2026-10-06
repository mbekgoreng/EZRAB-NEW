/**
 * Phase 6.6: Domain Types for Review, Approval, and Spreadsheet Integration
 *
 * Provides strong types for:
 * - Review Workspace Metric Counts
 * - 12-Column RAB Review Table Rows
 * - Interactive User Modifications & Audit History
 * - Spreadsheet Import Proposals & Idempotency Transactions
 */

import { SourceTraceabilityRecord } from './deterministicRabTypes';
import { RABSection, RABItem } from '../../types';

export interface ReviewCounts {
  totalPages: number;
  totalEntities: number;
  mappedCount: number;
  unmappedCount: number;
  needsReviewCount: number;
  conflictsCount: number;
  missingAhspCount: number;
  missingPriceCount: number;
  duplicateCandidatesCount: number;
}

export type ReviewItemStatus =
  | 'APPROVED'
  | 'NEEDS_REVIEW'
  | 'WARNING'
  | 'CONFLICT'
  | 'REJECTED'
  | 'MODIFIED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: 'CREATE' | 'APPROVE' | 'EDIT' | 'REJECT' | 'RESOLVE_CONFLICT' | 'MAP_WBS' | 'SELECT_AHSP' | 'SET_PRICE' | 'RESTORE';
  field?: string;
  previousValue?: any;
  newValue?: any;
  reason?: string;
  notes?: string;
}

export interface RabReviewRowItem {
  no: number;
  rabDraftItemId: string;
  entityId: string;
  wbsCode: string;
  wbsTitle: string;
  ahspCode: string | null;
  ahspTitle?: string | null;
  description: string;
  volume: number;
  unit: string;
  /** NULL when the row could not be priced — never a stand-in 0. */
  unitPrice: number | null;
  /** volume × unitPrice, or NULL when unpriced. */
  totalPrice: number | null;
  sumber: string; // e.g. 'OFFICIAL_REGIONAL_DB' | 'AI_ESTIMATE' | 'USER_OVERRIDE' | 'PRICE_NOT_FOUND'
  status: ReviewItemStatus;
  sourceTrace: SourceTraceabilityRecord;
  isExcluded: boolean;
  userModifications?: {
    originalVolume?: number;
    originalUnitPrice?: number | null;
    originalDescription?: string;
    originalAhspCode?: string | null;
    originalWbsCode?: string;
    modifiedAt?: string;
    modifiedBy?: string;
  };
  auditHistory: AuditLogEntry[];
  calculationFormula: string;
  notes?: string[];
}

export interface SpreadsheetImportProposal {
  proposalId: string;
  requestId: string;
  idempotencyKey: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  userName: string;
  draftVersion: string;
  checksum: string;
  items: RabReviewRowItem[];
  totalItems: number;
  activeItemsCount: number;
  rejectedItemsCount: number;
  /** Active rows that carry NO resolvable price — the subtotal is incomplete. */
  unpricedItemsCount: number;
  /** True only when every active row is priced. */
  subtotalComplete: boolean;
  subtotal: number;
  ppnPercent: number;
  ppnAmount: number;
  grandTotal: number;
  status: 'PENDING' | 'EXECUTING' | 'COMMITTED' | 'FAILED' | 'EXPIRED';
  createdAt: string;
  executedAt?: string;
  error?: string;
}

export interface SpreadsheetImportResult {
  success: boolean;
  proposalId: string;
  requestId: string;
  projectId: string;
  workspaceId: string;
  createdSectionsCount: number;
  createdItemsCount: number;
  subtotal: number;
  ppnAmount: number;
  grandTotal: number;
  importedSections: RABSection[];
  /** Rows excluded from the RAB because they carry no resolvable price (fail closed). */
  blockedUnpricedItems?: Array<{
    rabDraftItemId: string;
    wbsCode: string;
    description: string;
    unit: string;
    volume: number;
  }>;
  idempotentReplay: boolean;
  timestamp: string;
  auditRecordId: string;
  error?: string;
}