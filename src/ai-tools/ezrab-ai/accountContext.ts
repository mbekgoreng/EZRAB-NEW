/**
 * accountContext.ts — Klien konteks akun server-backed (EZRAB Full Account
 * Intelligence, FASE B — 2026-11-20).
 * ============================================================================
 * Mengambil GET /api/credits/account-context (aksi di handler credits yang
 * sudah ada — BUKAN endpoint baru) dan memformatnya menjadi seksi ringkas
 * untuk blok DATA kanonis Chat AI.
 *
 * Pola yang dipakai ulang (bukan pola baru):
 * - fetch + token Bearer dari sesi Supabase, persis serverBalance.ts
 *   (fetchServerBalance); token diambil dari getSupabaseClient() di
 *   src/lib/supabase.ts — TIDAK PERNAH dari localStorage/body.
 * - `fetcher` disuntikkan (default fetch global) agar suite memakai tiruan.
 *
 * DEGRADASI JUJUR (tidak pernah mengarang, tidak pernah memblokir kirim):
 * - Tanpa sesi → TIDAK ADA seksi akun sama sekali (pengguna anonim/demo
 *   tidak dibebani label "tidak tersedia" di setiap prompt; identitas
 *   anonim sudah dinyatakan builder kanonis sebagai
 *   'anonymous-tanpa-identitas').
 * - Ada sesi tetapi server tidak terjangkau / respons tidak valid →
 *   seksi ringkas SATU BARIS berlabel tidak tersedia (saldo/paket/
 *   langganan dinyatakan TIDAK DIKETAHUI — model tidak boleh mengarang).
 * - Seksi server yang 'unavailable' diformat apa adanya dengan alasannya.
 *
 * CACHE — snapshot di-cache di memori selama ACCOUNT_CONTEXT_CACHE_TTL_MS
 * agar satu sesi chat tidak memanggil endpoint di setiap kirim. Snapshot
 * dari cache DILABELI 'cached' di SEMUA seksi live-nya (penanda ditulis
 * DI SINI, bukan oleh resolver server — resolver hanya menulis 'live' /
 * 'unavailable') dan header seksi menyebut umur cache.
 *
 * PRIVASI — userId mentah (UUID) TIDAK PERNAH masuk teks seksi (model
 * tidak membutuhkannya); ia hanya dipakai service.ts sebagai userId
 * scope builder kanonis. Email ditampilkan karena berguna bagi model
 * untuk menyapa/mengonfirmasi identitas.
 */
import { getSupabaseClient } from '../../lib/supabase';
import type { BalanceFetcher } from '../../ai-credits/serverBalance';

export type AccountFreshness = 'live' | 'unavailable' | 'cached';

export interface AccountIdentitySection {
  freshness: AccountFreshness;
  userId: string;
  email: string | null;
}

export interface AccountWorkspaceSection {
  freshness: AccountFreshness;
  reason?: string;
  workspaceId?: string | null;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  billingAdmin?: boolean;
}

export interface AccountSubscriptionState {
  planId: string | null;
  status: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  graceEndsAt: string | null;
  lastOrderId: string | null;
}

export interface AccountSubscriptionSection {
  freshness: AccountFreshness;
  reason?: string;
  subscription?: AccountSubscriptionState | null;
  entitlementPlanId?: string;
}

export interface AccountBalance {
  accountId?: string;
  subscriptionAvailable: number;
  topupAvailable: number;
  bonusAvailable: number;
  freeOnceAvailable: number;
  reserved: number;
  total: number;
}

export interface AccountCreditsSection {
  freshness: AccountFreshness;
  reason?: string | null;
  balance?: AccountBalance | null;
}

export interface AccountUsageOp {
  id?: string;
  feature?: string | null;
  model?: string | null;
  credits_charged?: number | null;
  status?: string | null;
  created_at?: number | null;
}

export interface AccountUsageSection {
  freshness: AccountFreshness;
  reason?: string;
  recent?: AccountUsageOp[];
  count?: number;
}

export interface AccountOrder {
  orderId: string;
  kind: string | null;
  itemId: string | null;
  planId: string | null;
  amountIdr: number | null;
  status: string | null;
  createdAt: string | null;
  paidAt: string | null;
}

export interface AccountOrdersSection {
  freshness: AccountFreshness;
  reason?: string;
  recent?: AccountOrder[];
  count?: number;
}

export interface AccountInvitation {
  email: string;
  role: string | null;
  status: string | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface AccountInvitationsSection {
  freshness: AccountFreshness;
  reason?: string;
  pending?: number;
  total?: number;
  recent?: AccountInvitation[];
}

/** Bentuk snapshot persis seperti yang dikembalikan resolver server. */
export interface AccountContextSnapshot {
  generatedAt: string;
  identity: AccountIdentitySection;
  workspace: AccountWorkspaceSection;
  subscription: AccountSubscriptionSection;
  credits: AccountCreditsSection;
  usage: AccountUsageSection;
  orders: AccountOrdersSection;
  invitations: AccountInvitationsSection;
}

export const ACCOUNT_CONTEXT_ENDPOINT = '/api/credits/account-context';
/** TTL cache snapshot di memori (2 menit — saldo/paket jarang berubah per kirim). */
export const ACCOUNT_CONTEXT_CACHE_TTL_MS = 120_000;

/** Seksi fallback bila ada sesi tetapi server tidak terjangkau / respons tak valid. */
export const ACCOUNT_UNAVAILABLE_SECTION =
  'Akun (server): data akun tidak tersedia saat ini (server tidak terjangkau) — saldo, paket, dan langganan tidak diketahui.';

/** Alasan 'unavailable' server → label singkat Bahasa Indonesia (kode tak dikenal tampil apa adanya). */
const REASON_LABELS: Record<string, string> = {
  BILLING_NOT_CONFIGURED: 'backend billing belum aktif',
  BILLING_BACKEND_ERROR: 'backend billing bermasalah',
  NOT_A_MEMBER: 'bukan anggota workspace mana pun',
  WORKSPACE_AMBIGUOUS: 'anggota beberapa workspace (pilih satu)',
  WORKSPACE_LOOKUP_FAILED: 'workspace tidak dapat dibaca',
  DEMO_RESTRICTED: 'mode demo tanpa hak billing',
  PERMISSION_DENIED: 'tanpa izin baca billing',
  MEMBERSHIP_INACTIVE: 'keanggotaan tidak aktif',
  NOT_WORKSPACE_ADMIN: 'hanya admin workspace',
  INVITATIONS_NOT_CONFIGURED: 'backend undangan belum aktif',
  INVITATION_LIST_FAILED: 'daftar undangan tidak dapat dibaca',
  SUBSCRIPTION_LOOKUP_FAILED: 'langganan tidak dapat dibaca',
  BALANCE_LOOKUP_FAILED: 'saldo tidak dapat dibaca',
  USAGE_LOOKUP_FAILED: 'riwayat pemakaian tidak dapat dibaca',
  ORDER_LIST_FAILED: 'daftar order tidak dapat dibaca',
  NO_BILLING_ACCOUNT: 'belum ada akun billing tercatat',
};

export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'tidak diketahui';
  return REASON_LABELS[reason] ?? reason;
}

function formatDateId(iso: string | number | null | undefined): string | null {
  if (iso == null || iso === '') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return typeof iso === 'string' ? iso.slice(0, 10) : null;
  try {
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function formatDateTimeId(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function formatInt(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '?';
  return Math.round(n).toLocaleString('id-ID');
}

function formatIdr(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '?';
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

function planLabel(planId: string | null | undefined): string {
  if (!planId) return 'Free';
  return planId.charAt(0).toUpperCase() + planId.slice(1);
}

function formatCacheAge(ageMs: number): string {
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 60) return `${s} dtk lalu`;
  return `${Math.floor(s / 60)} mnt lalu`;
}

const SECTION_KEYS = [
  'identity',
  'workspace',
  'subscription',
  'credits',
  'usage',
  'orders',
  'invitations',
] as const;

/**
 * Salin snapshot dengan semua seksi 'live' ditulis ulang menjadi 'cached'
 * ('unavailable' tetap). Dipakai HANYA saat menyajikan cache — resolver
 * server tidak pernah menulis label ini.
 */
export function markSnapshotCached(
  snapshot: AccountContextSnapshot,
): AccountContextSnapshot {
  const next = { ...snapshot } as AccountContextSnapshot;
  for (const key of SECTION_KEYS) {
    const section = snapshot[key];
    if (section && (section as { freshness: AccountFreshness }).freshness === 'live') {
      (next as unknown as Record<string, unknown>)[key] = { ...section, freshness: 'cached' as const };
    }
  }
  return next;
}

export type FetchAccountContextResult =
  | { ok: true; snapshot: AccountContextSnapshot }
  | { ok: false; error: string };

function isValidSection(v: unknown): v is { freshness: AccountFreshness } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { freshness: unknown }).freshness === 'string'
  );
}

function isValidSnapshot(v: unknown): v is AccountContextSnapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<AccountContextSnapshot>;
  if (!s.identity || typeof s.identity !== 'object') return false;
  if (typeof (s.identity as { userId: unknown }).userId !== 'string') return false;
  for (const key of SECTION_KEYS) {
    if (!isValidSection(s[key])) return false;
  }
  return true;
}

async function readJsonSafe(resp: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Ambil snapshot konteks akun dari server. Validasi fail-closed: respons
 * tanpa `success: true`, tanpa identitas, atau tanpa ketujuh seksi →
 * GAGAL (pemanggil memakai seksi 'tidak tersedia', bukan angka karangan).
 */
export async function fetchAccountContext(
  accessToken: string | null,
  fetcher: BalanceFetcher = fetch as unknown as BalanceFetcher,
): Promise<FetchAccountContextResult> {
  if (!accessToken) return { ok: false, error: 'NO_TOKEN' };
  let resp: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    resp = await fetcher(ACCOUNT_CONTEXT_ENDPOINT, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
  const data = (await readJsonSafe(resp)) as { success?: boolean; error?: string } | null;
  if (!resp.ok || !data || data.success !== true) {
    return { ok: false, error: data?.error || `ACCOUNT_CONTEXT_HTTP_${resp.status}` };
  }
  if (!isValidSnapshot(data)) return { ok: false, error: 'MALFORMED_ACCOUNT_CONTEXT' };
  return { ok: true, snapshot: data as unknown as AccountContextSnapshot };
}

/**
 * Format snapshot menjadi seksi ringkas untuk blok DATA kanonis. Target
 * < 1.000 karakter (cap builder CANONICAL_ACCOUNT_BUDGET = 1.200).
 * TIDAK PERNAH memuat userId mentah; angka yang tidak tersedia
 * dinyatakan tidak tersedia — tidak pernah diisi 0/nilai karangan.
 */
export function formatAccountSection(
  snapshot: AccountContextSnapshot,
  opts: { fromCache?: boolean; cacheAgeMs?: number } = {},
): string {
  const lines: string[] = [];
  const when = formatDateTimeId(snapshot.generatedAt);
  const source = opts.fromCache
    ? `cache ${formatCacheAge(opts.cacheAgeMs ?? 0)}`
    : 'live';
  lines.push(`Akun (server, ${source}${when ? ` — ${when}` : ''}):`);

  // Identitas — email saja (userId mentah tidak masuk prompt).
  lines.push(`- Pengguna: ${snapshot.identity.email ?? '(email tidak tercatat)'}`);

  // Workspace.
  const ws = snapshot.workspace;
  if (ws.freshness === 'live') {
    const namePart = ws.name ? `${ws.name} • ` : '';
    lines.push(`- Workspace: ${namePart}peran ${ws.role ?? 'tidak diketahui'}`);
  } else {
    lines.push(`- Workspace: tidak tersedia (${reasonLabel(ws.reason)})`);
  }

  // Langganan — laporkan fakta; entitlementPlanId adalah proyeksi mesin
  // status, BUKAN penegakan hak (D3 belum diputuskan).
  const sub = snapshot.subscription;
  if (sub.freshness === 'live') {
    if (sub.subscription) {
      const end = formatDateId(sub.subscription.periodEnd);
      lines.push(
        `- Paket: ${planLabel(sub.subscription.planId)} (${sub.subscription.status ?? '?'}` +
          `${end ? `, aktif s.d. ${end}` : ''})`,
      );
    } else {
      lines.push('- Paket: Free (tanpa langganan aktif)');
    }
  } else {
    lines.push(`- Paket: tidak tersedia (${reasonLabel(sub.reason)})`);
  }

  // Kredit.
  const cr = snapshot.credits;
  if (cr.freshness === 'live') {
    if (cr.balance) {
      const b = cr.balance;
      lines.push(
        `- Kredit: ${formatInt(b.total)} total (langganan ${formatInt(b.subscriptionAvailable)}` +
          ` • top-up ${formatInt(b.topupAvailable)} • bonus ${formatInt(b.bonusAvailable)}` +
          ` • Free-once ${formatInt(b.freeOnceAvailable)}; dicadangkan ${formatInt(b.reserved)})`,
      );
    } else {
      lines.push(`- Kredit: tidak tersedia (${reasonLabel(cr.reason)})`);
    }
  } else {
    lines.push(`- Kredit: tidak tersedia (${reasonLabel(cr.reason)})`);
  }

  // Pemakaian terakhir.
  const us = snapshot.usage;
  if (us.freshness === 'live') {
    const recent = us.recent ?? [];
    if (recent.length > 0) {
      const last = recent[0];
      const feature = last.feature ?? 'operasi';
      const credits = last.credits_charged != null ? `${formatInt(last.credits_charged)} kredit` : 'kredit tidak tercatat';
      const whenOp = formatDateId(last.created_at);
      lines.push(
        `- Pemakaian: ${recent.length} operasi terakhir; terbaru ${feature} ${credits}` +
          `${whenOp ? ` (${whenOp})` : ''}`,
      );
    } else {
      lines.push('- Pemakaian: belum ada operasi tercatat');
    }
  } else {
    lines.push(`- Pemakaian: tidak tersedia (${reasonLabel(us.reason)})`);
  }

  // Order terakhir.
  const od = snapshot.orders;
  if (od.freshness === 'live') {
    const recent = od.recent ?? [];
    if (recent.length > 0) {
      const o = recent[0];
      const what = o.planId ? planLabel(o.planId) : o.itemId ?? o.kind ?? 'order';
      const whenOrder = formatDateId(o.createdAt);
      lines.push(
        `- Order terakhir: ${o.orderId} ${what} ${formatIdr(o.amountIdr)} ${o.status ?? ''}`.trim() +
          `${whenOrder ? ` (${whenOrder})` : ''}`,
      );
    } else {
      lines.push('- Order: belum ada order tercatat');
    }
  } else {
    lines.push(`- Order: tidak tersedia (${reasonLabel(od.reason)})`);
  }

  // Undangan.
  const inv = snapshot.invitations;
  if (inv.freshness === 'live') {
    const pending = inv.pending ?? 0;
    const total = inv.total ?? (inv.recent ?? []).length;
    const newestPending = (inv.recent ?? []).find((i) => i.status === 'PENDING');
    lines.push(
      `- Undangan: ${pending} pending dari ${total} total` +
        (newestPending ? ` (terbaru: ${newestPending.email}, ${newestPending.role ?? '?'})` : ''),
    );
  } else {
    lines.push(`- Undangan: tidak tersedia (${reasonLabel(inv.reason)})`);
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Sesi + cache + orkestrasi untuk service.ts                          */
/* ------------------------------------------------------------------ */

export interface SessionToken {
  accessToken: string | null;
  userId: string | null;
}

export type SessionTokenProvider = () => Promise<SessionToken>;

/** Token + userId dari sesi Supabase browser (null bila tanpa sesi / tanpa konfigurasi). */
export async function getSessionTokenFromSupabase(): Promise<SessionToken> {
  try {
    const client = getSupabaseClient();
    if (!client) return { accessToken: null, userId: null };
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session) return { accessToken: null, userId: null };
    return {
      accessToken: data.session.access_token ?? null,
      userId: data.session.user?.id ?? null,
    };
  } catch {
    return { accessToken: null, userId: null };
  }
}

let cached: { snapshot: AccountContextSnapshot; fetchedAt: number } | null = null;

/** Kosongkan cache (tes + logout). */
export function clearAccountContextCache(): void {
  cached = null;
}

export type AccountSectionReason = 'OK' | 'CACHED' | 'NO_SESSION' | 'FETCH_FAILED';

export interface AccountSectionResolution {
  /** Seksi terformat untuk builder kanonis; null = tanpa sesi (tanpa seksi). */
  section: string | null;
  /** userId terverifikasi dari sesi (dipakai scope builder); null bila tanpa sesi. */
  userId: string | null;
  fromCache: boolean;
  reason: AccountSectionReason;
}

/**
 * Orkestrasi satu pintu untuk service.ts: cache → sesi → fetch → format.
 * TIDAK PERNAH melempar (semua kegagalan internal menjadi FETCH_FAILED /
 * NO_SESSION) dan TIDAK PERNAH memblokir kirim — pemanggil membungkus
 * dengan try/catch juga sebagai pertahanan kedua.
 */
export async function resolveAccountSectionForSend(deps: {
  fetcher?: BalanceFetcher;
  getSessionToken?: SessionTokenProvider;
  nowMs?: number;
} = {}): Promise<AccountSectionResolution> {
  const now = deps.nowMs ?? Date.now();

  if (cached && now - cached.fetchedAt < ACCOUNT_CONTEXT_CACHE_TTL_MS) {
    return {
      section: formatAccountSection(markSnapshotCached(cached.snapshot), {
        fromCache: true,
        cacheAgeMs: now - cached.fetchedAt,
      }),
      userId: cached.snapshot.identity.userId,
      fromCache: true,
      reason: 'CACHED',
    };
  }

  let session: SessionToken;
  try {
    session = await (deps.getSessionToken ?? getSessionTokenFromSupabase)();
  } catch {
    session = { accessToken: null, userId: null };
  }
  if (!session.accessToken) {
    return { section: null, userId: null, fromCache: false, reason: 'NO_SESSION' };
  }

  let fetched: FetchAccountContextResult;
  try {
    fetched = await fetchAccountContext(session.accessToken, deps.fetcher);
  } catch {
    fetched = { ok: false, error: 'FETCH_THREW' };
  }
  if (!fetched.ok) {
    // Identitas sesi diketahui (userId dari sesi terverifikasi), tetapi
    // data akun tidak bisa dibaca — seksi berlabel, bukan karangan.
    return {
      section: ACCOUNT_UNAVAILABLE_SECTION,
      userId: session.userId,
      fromCache: false,
      reason: 'FETCH_FAILED',
    };
  }

  cached = { snapshot: fetched.snapshot, fetchedAt: now };
  return {
    section: formatAccountSection(fetched.snapshot),
    userId: fetched.snapshot.identity.userId,
    fromCache: false,
    reason: 'OK',
  };
}
