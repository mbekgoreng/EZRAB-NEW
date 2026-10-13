/**
 * Supabase-backed Price Assumption Repository
 * ============================================
 * Production persistence for the assumption layer.
 * Falls back to in-memory store when Supabase is not configured.
 *
 * Security: RLS + DB trigger enforce transitions and block self-approval.
 * This client layer mirrors those rules for immediate UX feedback.
 */
import { getSupabaseClient, isSupabaseConfigured } from '../../../services/supabaseClient';
import { AssumptionStore } from './assumptionStore';
import type {
  PriceAssumption,
  AssumptionStatus,
  CreateAssumptionInput,
} from './types';

interface DbRow {
  id: string;
  resource_code: string;
  resource_name: string;
  resource_type: 'material' | 'labor' | 'equipment';
  canonical_resource_id: string | null;
  price: number;
  unit: string;
  currency: 'IDR';
  region: string | null;
  valid_from: string;
  valid_until: string | null;
  source_note: string;
  reference_document: string | null;
  reference_date: string | null;
  status: AssumptionStatus;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  version: number;
  notes: string | null;
}

function toDb(input: CreateAssumptionInput, createdBy: string, id: string): Omit<DbRow, 'created_at' | 'version'> {
  return {
    id,
    resource_code: input.resourceCode.trim(),
    resource_name: input.resourceName.trim(),
    resource_type: input.resourceType,
    canonical_resource_id: input.canonicalResourceId ?? null,
    price: input.price,
    unit: input.unit.trim(),
    currency: 'IDR',
    region: input.region?.trim() || null,
    valid_from: input.validFrom,
    valid_until: input.validUntil || null,
    source_note: input.sourceNote.trim(),
    reference_document: input.referenceDocument?.trim() || null,
    reference_date: input.referenceDate || null,
    status: 'DRAFT',
    created_by: createdBy,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    notes: input.notes?.trim() || null,
  };
}

function fromDb(row: DbRow): PriceAssumption {
  return {
    id: row.id,
    resourceCode: row.resource_code,
    resourceName: row.resource_name,
    resourceType: row.resource_type,
    canonicalResourceId: row.canonical_resource_id,
    price: Number(row.price),
    unit: row.unit,
    currency: 'IDR',
    region: row.region,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    sourceNote: row.source_note,
    referenceDocument: row.reference_document,
    referenceDate: row.reference_date,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    version: row.version,
    history: [], // loaded separately when needed
    notes: row.notes,
  };
}

function newId(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ASM-${t}-${r}`;
}

export class SupabaseAssumptionRepository {
  private memory = new AssumptionStore();

  get useSupabase(): boolean {
    return isSupabaseConfigured();
  }

  private client() {
    const c = getSupabaseClient();
    if (!c) throw new Error('Supabase not configured');
    return c;
  }

  private async currentUserId(): Promise<string> {
    const c = this.client();
    const { data } = await c.auth.getUser();
    const id = data.user?.id;
    if (!id) throw new Error('Not authenticated');
    return id;
  }

  async create(input: CreateAssumptionInput): Promise<PriceAssumption> {
    if (!this.useSupabase) {
      // dev/test fallback — createdBy 'local'
      return this.memory.create(input, 'local');
    }
    const uid = await this.currentUserId();
    const row = toDb(input, uid, newId());
    const { data, error } = await this.client()
      .from('price_assumptions')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(`Create failed: ${error.message}`);
    return fromDb(data as DbRow);
  }

  async get(id: string): Promise<PriceAssumption | null> {
    if (!this.useSupabase) return this.memory.get(id);
    const { data, error } = await this.client()
      .from('price_assumptions')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return fromDb(data as DbRow);
  }

  async list(filter?: {
    status?: AssumptionStatus | AssumptionStatus[];
    search?: string;
  }): Promise<PriceAssumption[]> {
    if (!this.useSupabase) {
      return this.memory.list({ status: filter?.status, search: filter?.search });
    }
    let q = this.client().from('price_assumptions').select('*').order('created_at', { ascending: false });
    if (filter?.status) {
      const ss = Array.isArray(filter.status) ? filter.status : [filter.status];
      q = q.in('status', ss);
    }
    if (filter?.search) {
      const s = filter.search.replace(/[%_]/g, '');
      q = q.or(`resource_code.ilike.%${s}%,resource_name.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`List failed: ${error.message}`);
    return (data as DbRow[]).map(fromDb);
  }

  async findUsable(resourceCode: string, unit: string, at?: Date): Promise<PriceAssumption[]> {
    const now = at ?? new Date();
    const today = now.toISOString().slice(0, 10);
    if (!this.useSupabase) {
      return this.memory.findUsable(resourceCode, unit, now);
    }
    const { data, error } = await this.client()
      .from('price_assumptions')
      .select('*')
      .eq('status', 'APPROVED')
      .ilike('resource_code', resourceCode.trim())
      .ilike('unit', unit.trim())
      .lte('valid_from', today)
      .or(`valid_until.is.null,valid_until.gte.${today}`);
    if (error) throw new Error(`Find usable failed: ${error.message}`);
    return (data as DbRow[]).map(fromDb);
  }

  private async setStatus(
    id: string,
    to: AssumptionStatus,
    extra: Partial<DbRow> = {}
  ): Promise<PriceAssumption> {
    if (!this.useSupabase) {
      const uid = 'local';
      switch (to) {
        case 'PENDING': return this.memory.submit(id, uid);
        case 'APPROVED': return this.memory.approve(id, 'approver');
        case 'REJECTED': return this.memory.reject(id, 'approver', extra.rejection_reason || 'rejected');
        case 'DISABLED': return this.memory.disable(id, uid);
        case 'DRAFT': return this.memory.backToDraft(id, uid);
        default: throw new Error(`Unsupported transition to ${to}`);
      }
    }
    const uid = await this.currentUserId();
    const patch: Record<string, unknown> = { status: to, ...extra };
    // stamp actor fields
    if (to === 'APPROVED') {
      patch.approved_by = uid;
      patch.approved_at = new Date().toISOString();
    }
    if (to === 'REJECTED') {
      patch.rejected_by = uid;
      patch.rejected_at = new Date().toISOString();
    }
    const { data, error } = await this.client()
      .from('price_assumptions')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Transition failed: ${error.message}`);
    return fromDb(data as DbRow);
  }

  submit(id: string) { return this.setStatus(id, 'PENDING'); }
  approve(id: string) { return this.setStatus(id, 'APPROVED'); }
  reject(id: string, reason: string) {
    return this.setStatus(id, 'REJECTED', { rejection_reason: reason });
  }
  disable(id: string) { return this.setStatus(id, 'DISABLED'); }
  backToDraft(id: string) { return this.setStatus(id, 'DRAFT'); }

  async sweepExpiry(): Promise<number> {
    if (!this.useSupabase) {
      return this.memory.sweepExpiry();
    }
    const { data, error } = await this.client().rpc('price_assumption_sweep_expiry');
    if (error) throw new Error(`Sweep failed: ${error.message}`);
    return (data as number) ?? 0;
  }
}

export const assumptionRepository = new SupabaseAssumptionRepository();
