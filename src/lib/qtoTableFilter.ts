/**
 * D-70 (Batch D, 2026-11-14) — Real filter for the QTO recap table.
 *
 * The toolbar "Filter" button used to open the Column Settings modal
 * (identical handler to the "Columns" button); no filter UI existed at
 * all. This module is the pure, testable filter model behind the real
 * filter panel: filter by sync status, by source (calculator vs manual),
 * and by calculator. It composes with the view's existing category-tab
 * + search filtering (`filteredQtoItems` applies category, then search,
 * then this filter).
 *
 * Status vocabulary: the 'BELUM_SYNC' pseudo-status means "not synced
 * to RAB yet" (status !== 'SYNCED_TO_RAB') — the view's group-by already
 * uses the same two-way split ('Terhubung RAB' vs 'Belum Terhubung RAB').
 * Source uses `isManualQtoItem` (Batch B's single source of truth) so
 * legacy manual items (no calculatorId) filter correctly too.
 */
import { isManualQtoItem, QtoSourceLike } from './qtoItemSource';
import type { QTOItemStatus } from '../types';

/** 'BELUM_SYNC' = any status other than SYNCED_TO_RAB. */
export type QtoFilterStatus = 'semua' | QTOItemStatus | 'BELUM_SYNC';
export type QtoFilterSource = 'semua' | 'CALCULATOR' | 'MANUAL';

export interface QtoTableFilter {
  status: QtoFilterStatus;
  source: QtoFilterSource;
  /** 'semua' or a calculator id (e.g. 'BOWPLANK'). */
  calculatorId: string;
}

export const DEFAULT_QTO_TABLE_FILTER: QtoTableFilter = {
  status: 'semua',
  source: 'semua',
  calculatorId: 'semua',
};

/** Minimal shape the filter needs from a QTO item. */
export interface QtoFilterableItem extends QtoSourceLike {
  status?: QTOItemStatus | string | null;
}

export function isQtoFilterActive(filter: QtoTableFilter): boolean {
  return (
    filter.status !== 'semua' ||
    filter.source !== 'semua' ||
    filter.calculatorId !== 'semua'
  );
}

export function countActiveQtoFilters(filter: QtoTableFilter): number {
  let n = 0;
  if (filter.status !== 'semua') n++;
  if (filter.source !== 'semua') n++;
  if (filter.calculatorId !== 'semua') n++;
  return n;
}

export function qtoItemMatchesFilter(item: QtoFilterableItem, filter: QtoTableFilter): boolean {
  if (filter.status !== 'semua') {
    if (filter.status === 'BELUM_SYNC') {
      if (item.status === 'SYNCED_TO_RAB') return false;
    } else if (item.status !== filter.status) {
      return false;
    }
  }
  if (filter.source !== 'semua') {
    const manual = isManualQtoItem(item);
    if (filter.source === 'MANUAL' && !manual) return false;
    if (filter.source === 'CALCULATOR' && manual) return false;
  }
  if (filter.calculatorId !== 'semua' && item.calculatorId !== filter.calculatorId) {
    return false;
  }
  return true;
}

export function applyQtoTableFilter<T extends QtoFilterableItem>(items: T[], filter: QtoTableFilter): T[] {
  if (!isQtoFilterActive(filter)) return items;
  return items.filter((item) => qtoItemMatchesFilter(item, filter));
}
