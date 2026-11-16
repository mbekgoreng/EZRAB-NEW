/**
 * EZRAB — SOURCE IDENTITY REGISTRY (MASTER PRICING §3.2, M-2)
 * ===========================================================
 *
 * Runtime reader over the generated projection
 * (`sourceIdentityRegistry.generated.ts`). One canonical entity (RES-xxx)
 * may have MANY source references; this module answers "which sources
 * refer to this entity?" — the reverse lookup the price records alone
 * cannot answer (a price record knows its own source, not its siblings).
 *
 * A binding is an IDENTITY link, not a price. Nothing here resolves,
 * selects, or computes a price — that stays with priceResolver2026.
 * Unbound references are NOT projected here (validated JSON only).
 */

import {
  SOURCE_IDENTITY_BINDINGS,
  SOURCE_IDENTITY_BINDING_COUNT,
  SOURCE_IDENTITY_ENTITY_COUNT,
} from './sourceIdentityRegistry.generated';
import type { SourceIdentityBinding } from './types';

export { SOURCE_IDENTITY_BINDING_COUNT, SOURCE_IDENTITY_ENTITY_COUNT };

/** Registry version (matches the validated JSON `version`). */
export const SOURCE_IDENTITY_REGISTRY_VERSION = '2026.1';

let byEntity: Map<string, SourceIdentityBinding[]> | null = null;
let byDataset: Map<string, SourceIdentityBinding[]> | null = null;

function ensureIndex(): void {
  if (byEntity && byDataset) return;
  byEntity = new Map();
  byDataset = new Map();
  for (const b of SOURCE_IDENTITY_BINDINGS) {
    if (!byEntity.has(b.resourceId)) byEntity.set(b.resourceId, []);
    byEntity.get(b.resourceId)!.push(b);
    if (!byDataset.has(b.sourceDataset)) byDataset.set(b.sourceDataset, []);
    byDataset.get(b.sourceDataset)!.push(b);
  }
}

/** All source references for one canonical entity (RES-xxx). Empty array when the entity has no proven source binding. */
export function getSourceBindings(resourceId: string): SourceIdentityBinding[] {
  ensureIndex();
  return [...(byEntity!.get(resourceId) || [])];
}

/** Distinct source datasets bound to one canonical entity. */
export function getSourceDatasets(resourceId: string): string[] {
  return [...new Set(getSourceBindings(resourceId).map((b) => b.sourceDataset))].sort();
}

/** All bindings from one source dataset (e.g. HSD_2026, CK_HSD_2026). */
export function getBindingsByDataset(sourceDataset: string): SourceIdentityBinding[] {
  ensureIndex();
  return [...(byDataset!.get(sourceDataset) || [])];
}

/** True when the entity has at least one VERIFIED binding. */
export function hasVerifiedBinding(resourceId: string): boolean {
  return getSourceBindings(resourceId).some((b) => b.verificationStatus === 'VERIFIED');
}

/** All bindings (read-only copy). */
export function getAllSourceBindings(): SourceIdentityBinding[] {
  return [...SOURCE_IDENTITY_BINDINGS];
}

/** Registry totals (projection counts). */
export function getRegistryCounts(): { bindings: number; entities: number } {
  return {
    bindings: SOURCE_IDENTITY_BINDING_COUNT,
    entities: SOURCE_IDENTITY_ENTITY_COUNT,
  };
}
