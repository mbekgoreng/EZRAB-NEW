/**
 * api/_lib/invitations/repository.js — lapisan persistensi undangan.
 *
 * Dua adapter dengan interface yang sama:
 *
 * 1. SupabaseInvitationRepository — JALUR PRODUKSI. Menggunakan service key
 *    server-side (SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY, pola
 *    yang sama dengan server/repositories/*) terhadap tabel
 *    public.workspace_invitations (migration 20261022). Penebusan atomik
 *    didelegasikan ke fungsi DB accept_workspace_invitation (satu
 *    transaksi). Service key TIDAK PERNAH dikirim ke browser.
 *
 * 2. InMemoryInvitationRepository — HANYA untuk tes lokal dan pengembangan
 *    tanpa database. Bukan identitas/persistensi produksi; jangan pakai di
 *    deployment. Penebusan "atomik" di sini dijamin oleh seksi
 *    check-and-set sinkron (tanpa await di antaranya) — di Supabase
 *    jaminan yang setara datang dari transaksi + row lock fungsi DB.
 *
 * getInvitationRepository() mengembalikan null bila Supabase server-side
 * belum dikonfigurasi → endpoint menjawab 503 NOT_CONFIGURED secara jujur
 * (fail-closed, mengikuti pola api/access/verify.js).
 */
import { createClient } from '@supabase/supabase-js';
import { effectiveStatus } from './core.js';

export function getSupabaseServiceConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

export class SupabaseInvitationRepository {
  constructor(env = process.env) {
    const cfg = getSupabaseServiceConfig(env);
    if (!cfg) throw new Error('supabase_service_not_configured');
    this.client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getWorkspace(workspaceId) {
    const { data, error } = await this.client
      .from('workspaces').select('id, name').eq('id', workspaceId).maybeSingle();
    if (error) throw new Error('workspace_lookup_failed');
    return data || null;
  }

  async getMembership(workspaceId, userId) {
    const { data, error } = await this.client
      .from('workspace_members').select('workspace_id, user_id, role')
      .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
    if (error) throw new Error('membership_lookup_failed');
    return data || null;
  }

  async findActiveMemberByEmail() {
    // Keanggotaan berbasis user_id (auth.users), bukan email — pemeriksaan
    // "email sudah menjadi anggota" dilakukan service lewat profil auth
    // bila tersedia; di jalur DB murni langkah ini dilewati (undangan untuk
    // email yang sudah punya akun tetap aman: redeem mencocokkan email JWT
    // dan fungsi DB menolak penimpaan role anggota yang sudah ada).
    return null;
  }

  async findPendingByEmail(workspaceId, email) {
    const { data, error } = await this.client
      .from('workspace_invitations').select('*')
      .eq('workspace_id', workspaceId).eq('email', email).eq('status', 'PENDING')
      .order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error('invitation_lookup_failed');
    return (data && data[0]) || null;
  }

  async insertInvitation(row) {
    const { data, error } = await this.client
      .from('workspace_invitations').insert(row).select('*').single();
    if (error) {
      if (String(error.code) === '23505') {
        const dup = new Error('duplicate_pending_invitation');
        dup.code = 'DUPLICATE_PENDING';
        throw dup;
      }
      throw new Error('invitation_insert_failed');
    }
    return data;
  }

  async findByTokenHash(tokenHash) {
    const { data, error } = await this.client
      .from('workspace_invitations').select('*').eq('token_hash', tokenHash).maybeSingle();
    if (error) throw new Error('invitation_lookup_failed');
    return data || null;
  }

  async findById(id) {
    const { data, error } = await this.client
      .from('workspace_invitations').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('invitation_lookup_failed');
    return data || null;
  }

  async listByWorkspace(workspaceId) {
    const { data, error } = await this.client
      .from('workspace_invitations').select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error('invitation_list_failed');
    return data || [];
  }

  async updateInvitation(id, patch) {
    const { data, error } = await this.client
      .from('workspace_invitations').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error) throw new Error('invitation_update_failed');
    return data;
  }

  /** Penebusan atomik via fungsi DB (satu transaksi, row lock). */
  async acceptAtomic({ tokenHash, userId, email }) {
    const { data, error } = await this.client.rpc('accept_workspace_invitation', {
      p_token_hash: tokenHash,
      p_user_id: userId,
      p_email: email,
    });
    if (error) throw new Error('invitation_accept_failed');
    return String(data || 'invalid');
  }

  async insertAudit({ userId, workspaceId, eventCode }) {
    // Best-effort: kegagalan audit tidak menggagalkan operasi utama, tapi
    // tidak pernah menulis token/password (hanya kode event + aktor).
    try {
      await this.client.from('audit_logs').insert({
        user_id: userId || null,
        workspace_id: workspaceId || null,
        event_code: eventCode,
      });
    } catch {
      /* best-effort */
    }
  }
}

// --------------------------------------------------------------------------

let memCounter = 0;

export class InMemoryInvitationRepository {
  constructor() {
    this.invitations = new Map(); // id -> row
    this.workspaces = new Map(); // id -> {id, name}
    this.memberships = new Map(); // `${workspaceId}:${userId}` -> {workspace_id, user_id, role}
    this.projects = new Map(); // id -> {id, workspace_id}
    this.projectMembers = new Set(); // `${projectId}:${userId}`
    this.audits = [];
  }

  // --- fixture helpers (tes) ---
  seedWorkspace(id, name) { this.workspaces.set(id, { id, name }); }
  seedMembership(workspaceId, userId, role) {
    this.memberships.set(`${workspaceId}:${userId}`, { workspace_id: workspaceId, user_id: userId, role });
  }
  seedProject(id, workspaceId) { this.projects.set(id, { id, workspace_id: workspaceId }); }

  async getWorkspace(workspaceId) { return this.workspaces.get(workspaceId) || null; }

  async getMembership(workspaceId, userId) {
    return this.memberships.get(`${workspaceId}:${userId}`) || null;
  }

  async findActiveMemberByEmail() { return null; }

  async findPendingByEmail(workspaceId, email) {
    for (const inv of this.invitations.values()) {
      if (inv.workspace_id === workspaceId && inv.email === email && inv.status === 'PENDING') return inv;
    }
    return null;
  }

  async insertInvitation(row) {
    const clash = await this.findPendingByEmail(row.workspace_id, row.email);
    if (clash && row.status === 'PENDING') {
      const dup = new Error('duplicate_pending_invitation');
      dup.code = 'DUPLICATE_PENDING';
      throw dup;
    }
    memCounter += 1;
    const full = {
      id: `inv-mem-${memCounter}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      accepted_by: null,
      accepted_at: null,
      resend_of: null,
      email_status: 'not_sent',
      email_provider: null,
      project_ids: [],
      ...row,
    };
    this.invitations.set(full.id, full);
    return full;
  }

  async findByTokenHash(tokenHash) {
    for (const inv of this.invitations.values()) {
      if (inv.token_hash === tokenHash) return inv;
    }
    return null;
  }

  async findById(id) { return this.invitations.get(id) || null; }

  async listByWorkspace(workspaceId) {
    return [...this.invitations.values()]
      .filter((i) => i.workspace_id === workspaceId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async updateInvitation(id, patch) {
    const cur = this.invitations.get(id);
    if (!cur) throw new Error('invitation_not_found');
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    this.invitations.set(id, next);
    return next;
  }

  /**
   * Penebusan atomik (in-memory): seluruh check-and-set SINkRON — tidak ada
   * await di antara pemeriksaan status dan penandaan ACCEPTED, sehingga dua
   * pemanggilan bersamaan tidak dapat sama-sama berhasil.
   */
  async acceptAtomic({ tokenHash, userId, email, nowMs }) {
    const found = await this.findByTokenHash(tokenHash);
    if (!found) return 'invalid';
    // === seksi kritis sinkron mulai ===
    // WAJIB baca ulang baris TERKINI dari map di dalam seksi kritis: dua
    // pemanggilan bersamaan sama-sama memegang referensi objek lama dari
    // findByTokenHash; tanpa baca ulang, keduanya melihat status PENDING
    // yang basi dan sama-sama berhasil. (Di jalur Supabase, jaminan yang
    // setara datang dari SELECT ... FOR UPDATE di fungsi DB.)
    const inv = this.invitations.get(found.id);
    if (!inv) return 'invalid';
    if (inv.status === 'ACCEPTED') return 'already_used';
    if (inv.status === 'REVOKED') return 'revoked';
    const eff = effectiveStatus(inv, nowMs ?? Date.now());
    if (eff === 'EXPIRED') {
      if (inv.status === 'PENDING') {
        this.invitations.set(inv.id, { ...inv, status: 'EXPIRED', updated_at: new Date().toISOString() });
      }
      return 'expired';
    }
    if (inv.status !== 'PENDING') return 'invalid';
    if (String(email || '').trim().toLowerCase() !== inv.email) return 'email_mismatch';
    const key = `${inv.workspace_id}:${userId}`;
    const existing = this.memberships.get(key);
    if (existing && existing.role !== inv.role) return 'already_member_other_role';
    if (!existing) this.memberships.set(key, { workspace_id: inv.workspace_id, user_id: userId, role: inv.role });
    for (const pid of inv.project_ids || []) this.projectMembers.add(`${pid}:${userId}`);
    this.invitations.set(inv.id, {
      ...inv, status: 'ACCEPTED', accepted_by: userId,
      accepted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    // === seksi kritis sinkron selesai ===
    return 'accepted';
  }

  async insertAudit({ userId, workspaceId, eventCode }) {
    this.audits.push({ user_id: userId || null, workspace_id: workspaceId || null, event_code: eventCode, at: new Date().toISOString() });
  }
}

/** Factory jalur produksi: null bila backend belum dikonfigurasi. */
export function getInvitationRepository(env = process.env) {
  if (!getSupabaseServiceConfig(env)) return null;
  return new SupabaseInvitationRepository(env);
}
