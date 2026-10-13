/**
 * EZRAB Price Assumption Store
 * ==============================
 * In-memory store for price assumptions with full audit trail.
 * Persist to Supabase in production (see migration notes below).
 *
 * Rules:
 * - A user cannot approve their own assumption (enforced in approve()).
 * - Status transitions are validated.
 * - Every transition appends to history.
 */

import type {
  PriceAssumption,
  AssumptionStatus,
  CreateAssumptionInput,
  AssumptionHistoryEntry,
} from './types';

function newId(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ASM-${t}-${r}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Valid status transitions. */
const TRANSITIONS: Record<AssumptionStatus, AssumptionStatus[]> = {
  DRAFT: ['PENDING', 'DISABLED'],
  PENDING: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['EXPIRED', 'DISABLED'],
  EXPIRED: ['DRAFT'], // re-draft to renew
  REJECTED: ['DRAFT'],
  DISABLED: ['DRAFT'],
};

export class AssumptionStore {
  private items = new Map<string, PriceAssumption>();

  create(input: CreateAssumptionInput, createdBy: string): PriceAssumption {
    if (!input.resourceCode?.trim()) throw new Error('resourceCode required');
    if (!input.resourceName?.trim()) throw new Error('resourceName required');
    if (!(input.price > 0)) throw new Error('price must be > 0');
    if (!input.unit?.trim()) throw new Error('unit required');
    if (!input.sourceNote?.trim()) throw new Error('sourceNote (basis) required');
    if (!input.validFrom) throw new Error('validFrom required');

    const now = nowIso();
    const item: PriceAssumption = {
      id: newId(),
      resourceCode: input.resourceCode.trim(),
      resourceName: input.resourceName.trim(),
      resourceType: input.resourceType,
      canonicalResourceId: input.canonicalResourceId ?? null,
      price: input.price,
      unit: input.unit.trim(),
      currency: 'IDR',
      region: input.region?.trim() || null,
      validFrom: input.validFrom,
      validUntil: input.validUntil || null,
      sourceNote: input.sourceNote.trim(),
      referenceDocument: input.referenceDocument?.trim() || null,
      referenceDate: input.referenceDate || null,
      status: 'DRAFT',
      createdBy,
      createdAt: now,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      version: 1,
      history: [
        {
          at: now,
          by: createdBy,
          action: 'CREATED',
          note: null,
          previousStatus: null,
          newStatus: 'DRAFT',
        },
      ],
      notes: input.notes?.trim() || null,
    };
    this.items.set(item.id, item);
    return item;
  }

  get(id: string): PriceAssumption | null {
    return this.items.get(id) ?? null;
  }

  list(filter?: {
    status?: AssumptionStatus | AssumptionStatus[];
    resourceType?: string;
    search?: string;
  }): PriceAssumption[] {
    let out = [...this.items.values()];
    if (filter?.status) {
      const ss = Array.isArray(filter.status) ? filter.status : [filter.status];
      out = out.filter((x) => ss.includes(x.status));
    }
    if (filter?.resourceType) {
      out = out.filter((x) => x.resourceType === filter.resourceType);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      out = out.filter(
        (x) =>
          x.resourceCode.toLowerCase().includes(q) ||
          x.resourceName.toLowerCase().includes(q)
      );
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Find approved, usable assumptions for a resource code + unit. */
  findUsable(resourceCode: string, unit: string, now: Date = new Date()): PriceAssumption[] {
    const code = resourceCode.trim().toLowerCase();
    const u = unit.trim().toLowerCase();
    return [...this.items.values()].filter((x) => {
      if (x.resourceCode.trim().toLowerCase() !== code) return false;
      if (x.unit.trim().toLowerCase() !== u) return false;
      if (x.status !== 'APPROVED') return false;
      // validity period
      if (x.validUntil) {
        const until = new Date(x.validUntil + 'T23:59:59');
        if (now > until) return false;
      }
      const from = new Date(x.validFrom + 'T00:00:00');
      if (now < from) return false;
      return true;
    });
  }

  private transition(
    id: string,
    to: AssumptionStatus,
    by: string,
    action: AssumptionHistoryEntry['action'],
    note: string | null = null
  ): PriceAssumption {
    const item = this.items.get(id);
    if (!item) throw new Error(`Assumption ${id} not found`);
    const allowed = TRANSITIONS[item.status] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid transition ${item.status} → ${to}`);
    }
    const prev = item.status;
    item.status = to;
    item.version += 1;
    item.history.push({
      at: nowIso(),
      by,
      action,
      note,
      previousStatus: prev,
      newStatus: to,
    });
    return item;
  }

  submit(id: string, by: string): PriceAssumption {
    return this.transition(id, 'PENDING', by, 'SUBMITTED');
  }

  approve(id: string, by: string): PriceAssumption {
    const item = this.items.get(id);
    if (!item) throw new Error(`Assumption ${id} not found`);
    if (item.createdBy === by) {
      throw new Error('Approver cannot be the creator (self-approval blocked)');
    }
    const out = this.transition(id, 'APPROVED', by, 'APPROVED');
    out.approvedBy = by;
    out.approvedAt = nowIso();
    out.rejectedBy = null;
    out.rejectedAt = null;
    out.rejectionReason = null;
    return out;
  }

  reject(id: string, by: string, reason: string): PriceAssumption {
    if (!reason?.trim()) throw new Error('Rejection reason required');
    const item = this.items.get(id);
    if (!item) throw new Error(`Assumption ${id} not found`);
    if (item.createdBy === by) {
      throw new Error('Rejector cannot be the creator');
    }
    const out = this.transition(id, 'REJECTED', by, 'REJECTED', reason.trim());
    out.rejectedBy = by;
    out.rejectedAt = nowIso();
    out.rejectionReason = reason.trim();
    return out;
  }

  disable(id: string, by: string, note?: string): PriceAssumption {
    return this.transition(id, 'DISABLED', by, 'DISABLED', note ?? null);
  }

  backToDraft(id: string, by: string): PriceAssumption {
    const item = this.transition(id, 'DRAFT', by, 'UPDATED');
    // clear approval fields when going back to draft
    item.approvedBy = null;
    item.approvedAt = null;
    item.rejectedBy = null;
    item.rejectedAt = null;
    item.rejectionReason = null;
    return item;
  }

  /** Mark expired items (call periodically). Returns count expired. */
  sweepExpiry(now: Date = new Date()): number {
    let n = 0;
    for (const item of this.items.values()) {
      if (item.status === 'APPROVED' && item.validUntil) {
        const until = new Date(item.validUntil + 'T23:59:59');
        if (now > until) {
          this.transition(item.id, 'EXPIRED', 'system', 'EXPIRED', 'Validity period ended');
          n++;
        }
      }
    }
    return n;
  }

  clear(): void {
    this.items.clear();
  }

  size(): number {
    return this.items.size;
  }
}

/** Singleton for app-wide use. Replace with Supabase-backed store in production. */
export const assumptionStore = new AssumptionStore();
