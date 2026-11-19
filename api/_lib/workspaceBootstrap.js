/**
 * api/_lib/workspaceBootstrap.js — Bootstrap workspace server-side pasca-signup.
 * ============================================================================
 * MENUTUP TEMUAN KRITIS FASE 5 (2026-11-19): pengguna baru yang mendaftar
 * mendapat akun auth + profil TETAPI nol keanggotaan workspace, sehingga
 * semua endpoint billing menolaknya 403 NOT_A_MEMBER. Satu-satunya kode
 * yang membuat workspace adalah migrateLocalStorageToSupabase()
 * (src/services/supabaseMigration.ts) — tanpa pemanggil, dan ia
 * meng-assign SUPER_ADMIN dari BROWSER (pola yang dilarang).
 *
 * Mekanisme ini adalah SATU-SATUNYA jalur bootstrap yang sah:
 *
 *   POST /api/credits/bootstrap  (aksi di api/credits/[action].js)
 *     → authenticateRequest (JWT terverifikasi server-side)
 *     → bootstrapWorkspace({ userId, email }) — modul ini
 *
 * JAMINAN KEAMANAN (tidak ada yang dinegosiasikan):
 * - TIDAK ADA auto-promosi first-user ke SUPER_ADMIN. Peran SUPER_ADMIN
 *   HANYA untuk email yang ada di allowlist server-side
 *   (env EZRAB_BOOTSTRAP_OWNER_EMAILS). Pengguna biasa mendapat ESTIMATOR
 *   di workspace-nya sendiri — cukup untuk billing:read/billing:use
 *   (billingAuthorization.js), bukan peran owner-level.
 * - TIDAK ADA email hardcoded di mana pun. Identitas owner berasal dari
 *   env server saja; bila env tidak diset, TIDAK ADA yang bisa menjadi
 *   SUPER_ADMIN lewat jalur ini (fail-closed pada hak istimewa) dan
 *   respons membawa ownerAllowlistConfigured:false agar keadaan ini
 *   terlihat — bukan gagal diam-diam.
 * - TIDAK ADA penugasan peran dari klien. Service ini TIDAK menerima
 *   parameter role/workspaceId; body request bootstrap diabaikan total.
 *   Identitas (userId + email) HANYA dari JWT yang sudah diverifikasi.
 * - Kepemilikan ditegakkan RLS + otorisasi server-side seperti biasa:
 *   modul ini memakai service-role HANYA untuk menulis baris workspace/
 *   membership/profil milik principal yang terverifikasi; semua akses
 *   baca/tulis berikutnya tetap lewat authorizeWorkspaceAccess.
 * - Provisioning akun billing + Free-once HANYA sesudah keanggotaan
 *   terkonfirmasi ada (getOrCreateBillingAccount + ensureFreeOnceGrant
 *   dari billingAccountService.js). Bila repo billing belum terkonfigurasi,
 *   bootstrap tetap berhasil dengan flag jujur billingNotConfigured:true
 *   — provisioning ditunda ke panggilan balance pertama (jalur lazy yang
 *   sudah ada), bukan gagal palsu.
 *
 * IDEMPOTENSI + KEAMANAN BALAPAN:
 * - Id workspace DETERMINISTIK: UUIDv5(namespace tetap, userId). Dua
 *   bootstrap konkuren untuk user yang sama — bahkan dari DUA instance
 *   serverless berbeda — menabrak PRIMARY KEY yang sama; yang kalah
 *   menangkap 23505 lalu membaca ulang keanggotaan (loop retry terbatas).
 *   Tanpa ini, workspaces tidak punya constraint unik per pemilik dan
 *   balapan lintas-instance akan membuat workspace ganda.
 * - Serialisasi per-user IN-PROCESS (rantai promise per userId, pola yang
 *   sama dengan withLedger di billingStore.js): pemanggilan kedua dalam
 *   satu instance menunggu yang pertama selesai, lalu menemukan
 *   keanggotaan yang sudah ada dan menjadi no-op.
 * - Insert membership mengandalkan PRIMARY KEY (workspace_id, user_id)
 *   sebagai pagar kedua; konflik 23505 di sini juga ditangani lewat
 *   baca-ulang, bukan error.
 * - Insert membership HANYA mengirim (workspace_id, user_id, role):
 *   status/billing_admin memakai DEFAULT DB ('ACTIVE'/false, migration
 *   20261102_phase53). Ini sengaja — bootstrap tetap bekerja walau kolom
 *   Phase 5.3 belum ada di DB live.
 * - Profil dipastikan dulu (upsert ignoreDuplicates): FK
 *   workspace_members.user_id → profiles(id) akan gagal bila trigger
 *   handle_new_auth_user belum berjalan / tidak live.
 *
 * KONFIGURASI (server saja, OWNER ACTION REQUIRED):
 * - EZRAB_BOOTSTRAP_OWNER_EMAILS — daftar email owner dipisah koma,
 *   mis. "owner@contoh.id, admin@contoh.id". Perbandingan case-insensitive,
 *   spasi diabaikan. KOSONG/tidak diset = tidak ada yang bisa SUPER_ADMIN.
 * - SUPABASE_URL + SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY)
 *   — sama seperti repo billing; tanpa keduanya bootstrap menjawab 503
 *   BOOTSTRAP_NOT_CONFIGURED.
 *
 * BATAS JUJUR: loop retry memakai jeda singkat; bila DB tidak pernah
 * konvergen (mis. replikasi tertunda ekstrem), bootstrap mengembalikan
 * 503 BOOTSTRAP_RETRY_EXHAUSTED dan klien boleh mencoba lagi — tidak ada
 * workspace ganda yang dibuat dalam keadaan itu karena id deterministik.
 */

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceConfig } from './invitations/repository.js';
import {
  ensureFreeOnceGrant,
  getOrCreateBillingAccount,
} from './billingAccountService.js';

export const BOOTSTRAP_OWNER_ENV = 'EZRAB_BOOTSTRAP_OWNER_EMAILS';
export const WORKSPACE_BOOTSTRAP_NAME = 'Workspace Utama';
export const BOOTSTRAP_MEMBER_ROLE = 'ESTIMATOR';
export const BOOTSTRAP_OWNER_ROLE = 'SUPER_ADMIN';

/** Namespace UUID tetap untuk UUIDv5 id workspace — JANGAN DIUBAH (id deterministik bergantung padanya). */
export const BOOTSTRAP_NAMESPACE_UUID = '2af27e1f-cdb0-439f-aeb1-24a351ba9992';

const MAX_BOOTSTRAP_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// UUIDv5 (RFC 4122) — tanpa dependensi baru.
// ---------------------------------------------------------------------------

export function uuidv5(namespaceUuid, name) {
  const ns = Buffer.from(String(namespaceUuid).replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(String(name), 'utf8').digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Id workspace deterministik per pengguna — fondasi idempotensi lintas-instance. */
export function deterministicWorkspaceId(userId) {
  return uuidv5(BOOTSTRAP_NAMESPACE_UUID, `ezrab-bootstrap-workspace:${userId}`);
}

// ---------------------------------------------------------------------------
// Allowlist owner (env server-side saja).
// ---------------------------------------------------------------------------

/** Parse env allowlist → Set email lowercase. Env kosong/tidak ada → Set kosong (fail-closed). */
export function parseBootstrapAllowlist(env = process.env) {
  const raw = String((env && env[BOOTSTRAP_OWNER_ENV]) || '');
  const out = new Set();
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (email) out.add(email);
  }
  return out;
}

export function isOwnerEmail(email, allowlist) {
  if (!email || typeof email !== 'string') return false;
  if (!allowlist || typeof allowlist.has !== 'function') return false;
  return allowlist.has(email.trim().toLowerCase());
}

/** Status konfigurasi bootstrap (untuk handler: fail-closed 503 bila service belum ada). */
export function getBootstrapServiceConfig(env = process.env) {
  const service = getSupabaseServiceConfig(env);
  const ownerAllowlist = parseBootstrapAllowlist(env);
  return {
    serviceConfigured: Boolean(service),
    ownerAllowlist,
    ownerAllowlistConfigured: ownerAllowlist.size > 0,
  };
}

// ---------------------------------------------------------------------------
// Repository workspace — Supabase service-role (produksi).
// ---------------------------------------------------------------------------

function codedError(message, pgError) {
  const err = new Error(message);
  if (pgError && pgError.code) err.code = String(pgError.code);
  return err;
}

export class SupabaseWorkspaceRepository {
  constructor(env = process.env) {
    const cfg = getSupabaseServiceConfig(env);
    if (!cfg) throw new Error('supabase_service_not_configured');
    this.client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listMembershipsForUser(userId) {
    // HANYA kolom fondasi (workspace_id, user_id, role): status/billing_admin
    // adalah kolom Phase 5.3 — bootstrap tidak boleh gagal bila kolom itu
    // belum ada. Status yang hilang diperlakukan 'ACTIVE' oleh pemanggil,
    // mengikuti normalizeMembership di billingAuthorization.js.
    const { data, error } = await this.client
      .from('workspace_members')
      .select('workspace_id, user_id, role')
      .eq('user_id', userId);
    if (error) throw codedError('membership_list_failed', error);
    return data || [];
  }

  async ensureProfile(userId, displayName) {
    const { error } = await this.client
      .from('profiles')
      .upsert(
        { id: userId, display_name: displayName ?? null },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (error) throw codedError('profile_ensure_failed', error);
    return true;
  }

  async createWorkspace(id, name) {
    const { data, error } = await this.client
      .from('workspaces')
      .insert({ id, name })
      .select('id')
      .single();
    if (error) throw codedError('workspace_create_failed', error);
    return data;
  }

  async insertMembership(row) {
    const { data, error } = await this.client
      .from('workspace_members')
      .insert({ workspace_id: row.workspace_id, user_id: row.user_id, role: row.role })
      .select('workspace_id, user_id, role')
      .single();
    if (error) throw codedError('membership_insert_failed', error);
    return data;
  }
}

/** Factory jalur produksi: null bila backend Supabase server-side belum dikonfigurasi. */
export function getWorkspaceRepository(env = process.env) {
  if (!getSupabaseServiceConfig(env)) return null;
  return new SupabaseWorkspaceRepository(env);
}

// ---------------------------------------------------------------------------
// Repository workspace — InMemory (tes lokal; BUKAN persistensi produksi).
// Meniru konflik UNIQUE 23505 agar jalur retry teruji.
// ---------------------------------------------------------------------------

function conflictError(message) {
  const err = new Error(message);
  err.code = '23505';
  return err;
}

export class InMemoryWorkspaceRepository {
  constructor(opts = {}) {
    this.workspaces = new Map(); // id -> { id, name }
    this.memberships = new Map(); // `${workspaceId}:${userId}` -> row
    this.profiles = new Map(); // userId -> { id, display_name }
    this.delayMs = opts.delayMs || 0;
  }

  async #tick() {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
  }

  // --- fixture helper (tes) ---
  seedMembership(workspaceId, userId, role) {
    const row = { workspace_id: workspaceId, user_id: userId, role, status: 'ACTIVE', billing_admin: false };
    this.memberships.set(`${workspaceId}:${userId}`, row);
    return row;
  }

  async listMembershipsForUser(userId) {
    await this.#tick();
    return [...this.memberships.values()].filter((m) => m.user_id === userId);
  }

  async ensureProfile(userId, displayName) {
    await this.#tick();
    if (!this.profiles.has(userId)) {
      this.profiles.set(userId, { id: userId, display_name: displayName ?? null });
    }
    return true;
  }

  async createWorkspace(id, name) {
    await this.#tick();
    if (this.workspaces.has(id)) throw conflictError('workspace_create_failed');
    const row = { id, name };
    this.workspaces.set(id, row);
    return row;
  }

  async insertMembership(row) {
    await this.#tick();
    const key = `${row.workspace_id}:${row.user_id}`;
    if (this.memberships.has(key)) throw conflictError('membership_insert_failed');
    const full = { workspace_id: row.workspace_id, user_id: row.user_id, role: row.role, status: 'ACTIVE', billing_admin: false };
    this.memberships.set(key, full);
    return full;
  }
}

// ---------------------------------------------------------------------------
// Serialisasi per-user IN-PROCESS (pola yang sama dengan withLedger).
// Rantai promise per userId: pemanggil kedua menunggu yang pertama selesai
// penuh sebelum membaca keanggotaan — snapshot tidak pernah basi di dalam
// satu proses. BATAS: tidak lintas instance serverless; pagar lintas-instance
// adalah id workspace deterministik + retry 23505 (lihat header).
// ---------------------------------------------------------------------------

const bootstrapUserChains = new Map();

function acquireBootstrapUser(userId) {
  const key = String(userId);
  const previous = bootstrapUserChains.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  bootstrapUserChains.set(key, chain);
  return {
    ready: previous,
    release() {
      release();
      if (bootstrapUserChains.get(key) === chain) bootstrapUserChains.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Service bootstrap.
// ---------------------------------------------------------------------------

function fail(status, errorCode) {
  return { ok: false, status, error: errorCode, errorCode };
}

const isActive = (m) => String(m.status || 'ACTIVE').toUpperCase() === 'ACTIVE';

export function createBootstrapService(deps = {}) {
  const workspaceRepo = deps.workspaceRepo ?? null;
  const billingRepo = deps.billingRepo ?? null;
  const allowlist = deps.allowlist instanceof Set ? deps.allowlist : parseBootstrapAllowlist(deps.env);
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const maxAttempts = deps.maxAttempts ?? MAX_BOOTSTRAP_ATTEMPTS;
  const ownerAllowlistConfigured = allowlist.size > 0;

  /**
   * Provisioning akun billing + Free-once — HANYA dipanggil sesudah
   * keanggotaan terkonfirmasi. Kegagalan di sini TIDAK menggagalkan
   * bootstrap (jalur lazy balance akan mencoba lagi); hasilnya dilaporkan
   * jujur lewat flag, bukan ditelan diam-diam.
   */
  async function provisionBilling(workspaceId, userId) {
    if (!billingRepo) {
      return { billingProvisioned: false, billingNotConfigured: true, freeOnceGranted: false };
    }
    try {
      const account = await getOrCreateBillingAccount(billingRepo, workspaceId, userId);
      const grant = await ensureFreeOnceGrant(billingRepo, account, {
        actorUserId: userId,
        workspaceId,
      });
      if (!grant.ok) {
        return { billingProvisioned: false, billingError: 'FREE_ONCE_GRANT_FAILED', freeOnceGranted: false };
      }
      return { billingProvisioned: true, freeOnceGranted: grant.granted === true };
    } catch {
      return { billingProvisioned: false, billingError: 'BILLING_PROVISION_FAILED', freeOnceGranted: false };
    }
  }

  /**
   * Inti bootstrap TANPA kunci per-user. Dipakai oleh bootstrap() yang
   * terkunci, dan diekspor agar tes dapat mensimulasikan balapan
   * lintas-instance (dua pemanggil konkuren tanpa rantai bersama).
   * Input HANYA { userId, email } dari JWT terverifikasi — TIDAK ADA
   * parameter role/workspace: peran diputuskan server-side dari allowlist.
   */
  async function bootstrapCore(input) {
    const userId = input?.userId;
    const email = input?.email ?? null;
    if (!workspaceRepo) return fail(503, 'BOOTSTRAP_NOT_CONFIGURED');
    if (!userId || typeof userId !== 'string') return fail(401, 'AUTH_REQUIRED');

    // 1. Sudah punya keanggotaan? → no-op idempoten (tanpa workspace baru).
    let memberships;
    try {
      memberships = await workspaceRepo.listMembershipsForUser(userId);
    } catch {
      return fail(503, 'BOOTSTRAP_BACKEND_ERROR');
    }
    const active = (memberships || []).filter(isActive);
    if (active.length > 0) {
      const existing = active[0];
      const billing = await provisionBilling(existing.workspace_id, userId);
      return {
        ok: true,
        created: false,
        workspaceId: existing.workspace_id,
        role: existing.role,
        ownerAllowlistConfigured,
        ...billing,
      };
    }

    // 2. Profil wajib ada (FK workspace_members.user_id → profiles.id).
    try {
      await workspaceRepo.ensureProfile(userId, null);
    } catch {
      return fail(503, 'BOOTSTRAP_BACKEND_ERROR');
    }

    // 3. Peran diputuskan SERVER-SIDE dari allowlist env — tidak pernah
    //    dari input klien. Tanpa allowlist, tidak ada yang menjadi owner.
    const role = isOwnerEmail(email, allowlist) ? BOOTSTRAP_OWNER_ROLE : BOOTSTRAP_MEMBER_ROLE;
    const workspaceId = deterministicWorkspaceId(userId);

    // 4. Buat workspace + membership; konflik 23505 → baca ulang (konvergen).
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let createdByUs = false;
      try {
        await workspaceRepo.createWorkspace(workspaceId, WORKSPACE_BOOTSTRAP_NAME);
      } catch (err) {
        if (!err || err.code !== '23505') return fail(503, 'BOOTSTRAP_BACKEND_ERROR');
        // Workspace deterministik sudah ada (pesaing menang) — lanjut ke membership.
      }
      try {
        await workspaceRepo.insertMembership({ workspace_id: workspaceId, user_id: userId, role });
        createdByUs = true;
      } catch (err) {
        if (!err || err.code !== '23505') return fail(503, 'BOOTSTRAP_BACKEND_ERROR');
        // Membership sudah ada (pesaing menang) — lanjut ke baca ulang.
      }
      let current;
      try {
        current = await workspaceRepo.listMembershipsForUser(userId);
      } catch {
        return fail(503, 'BOOTSTRAP_BACKEND_ERROR');
      }
      const mine = (current || []).filter(isActive);
      if (mine.length > 0) {
        const found = mine.find((m) => m.workspace_id === workspaceId) || mine[0];
        const billing = await provisionBilling(found.workspace_id, userId);
        return {
          ok: true,
          created: createdByUs && found.workspace_id === workspaceId,
          workspaceId: found.workspace_id,
          role: found.role,
          ownerAllowlistConfigured,
          ...billing,
        };
      }
      // Insert tanpa konflik tapi baca-ulang kosong (store tidak konsisten
      // / replikasi tertunda): jeda lalu coba lagi, dibatasi maxAttempts.
      await sleep(100 * (attempt + 1));
    }
    return fail(503, 'BOOTSTRAP_RETRY_EXHAUSTED');
  }

  /** Jalur produksi: inti bootstrap + serialisasi per-user in-process. */
  async function bootstrap(input) {
    if (!workspaceRepo) return fail(503, 'BOOTSTRAP_NOT_CONFIGURED');
    const userId = input?.userId;
    if (!userId || typeof userId !== 'string') return fail(401, 'AUTH_REQUIRED');
    const lock = acquireBootstrapUser(userId);
    await lock.ready;
    try {
      return await bootstrapCore(input);
    } finally {
      lock.release();
    }
  }

  return { bootstrap, bootstrapCore, allowlistConfigured: ownerAllowlistConfigured };
}
