/**
 * accountApiClient — klien baca-saja domain akun server untuk Chat AI
 * (Full Account Intelligence Fase B §12.2 item 3).
 *
 * Lima tool akun (`get_credit_balance`, `get_subscription`,
 * `get_usage_history`, `list_invitations`, `get_account_summary`)
 * membaca API server yang SUDAH ADA — tanpa endpoint baru:
 *   - GET /api/credits/balance      (saldo ledger batch gen-2)
 *   - GET /api/credits/subscription (status langganan + plan efektif)
 *   - GET /api/credits/usage        (riwayat pemakaian ledger)
 *   - GET /api/invitations/list     (daftar undangan workspace)
 *
 * Pola autentikasi = pola UI yang sudah ada (jangan karang jalur baru):
 * token akses diambil dari sesi Supabase browser (`getSupabaseClient()`,
 * sama seperti `invitationClient.accessToken()` dan
 * `useCreditSimulation` → `auth.getAccessToken()`), dikirim sebagai
 * header `Authorization: Bearer`. Saldo dibaca lewat
 * `fetchServerBalance` yang sudah teruji (menolak respons simulasi /
 * malformed secara fail-closed).
 *
 * Aturan kejujuran (mengikuti serverBalance.ts + audit Fase 0):
 * - Identitas TIDAK PERNAH berasal dari argumen LLM — tool-tool ini
 *   tidak menerima argumen identitas apa pun; identitas hanya dari
 *   token sesi. Argumen identitas yang diselundupkan model diabaikan.
 * - Tanpa sesi → hasil NO_SESSION; pemanggil menampilkan "belum masuk",
 *   TIDAK PERNAH angka simulasi atau angka karangan.
 * - Respons tanpa `success: true` / bentuk tak dikenal → gagal jujur
 *   (bukan nilai default yang disamarkan).
 * - Langganan dilaporkan APA ADANYA dari server (planId + status).
 *   Billing masih dormant — modul ini TIDAK PERNAH mengklaim hak
 *   paket ditegakkan atau fitur terkunci/terbuka berdasarkan paket.
 * - `list_invitations` butuh workspaceId (server menolak tanpa itu,
 *   400 VALIDATION) dan keanggotaan SUPER_ADMIN (403 bila bukan admin).
 *   WorkspaceId diselesaikan lewat `ensureWorkspaceBootstrap()` yang
 *   idempoten — fungsi yang sama yang dipanggil AuthContext pada tiap
 *   login pertama; untuk akun yang sudah ter-bootstrap ini hanya
 *   mengembalikan keanggotaan yang ada. Tidak ada workspaceId yang
 *   disimpan di klien di tempat lain.
 * - Semua output berlabel kesegaran: "data live server" vs alasan
 *   tidak tersedia. Pesan kegagalan TIDAK diawali 'ERROR:' agar
 *   registry mencatatnya sebagai jawaban jujur (succeeded), bukan
 *   kegagalan eksekusi — ketiadaan data bukan kegagalan tool.
 *
 * Dependensi dapat disuntikkan (fetcher / token / resolver workspace)
 * lewat `setAccountApiDeps` — seam untuk suite (pola yang sama dengan
 * `setActiveProjectSnapshot` di tools.ts). Produksi tidak pernah
 * memanggilnya; default = fetch global + sesi Supabase nyata.
 */
import { getSupabaseClient } from '../../lib/supabase';
import { ensureWorkspaceBootstrap } from '../../services/workspaceBootstrap';
import {
  fetchServerBalance,
  type BalanceFetcher,
  type ServerSubscriptionResponse,
} from '../../ai-credits/serverBalance';
import type { CreditBalance, CreditPlan } from '../../ai-credits/types';

/* ------------------------------------------------------------------ */
/* Dependensi (default nyata; dapat diganti suite)                     */
/* ------------------------------------------------------------------ */

export interface AccountApiDeps {
  fetcher?: BalanceFetcher;
  getAccessToken?: () => Promise<string | null>;
  resolveWorkspaceId?: () => Promise<string | null>;
}

let testDeps: AccountApiDeps | null = null;

/** Seam injeksi untuk suite — produksi memakai default (jangan panggil). */
export function setAccountApiDeps(deps: AccountApiDeps | null): void {
  testDeps = deps;
}

async function defaultAccessToken(): Promise<string | null> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function defaultResolveWorkspaceId(): Promise<string | null> {
  try {
    const r = await ensureWorkspaceBootstrap();
    return r.ok ? (r.workspaceId ?? null) : null;
  } catch {
    return null;
  }
}

function deps(): Required<AccountApiDeps> {
  return {
    fetcher: testDeps?.fetcher ?? (fetch as unknown as BalanceFetcher),
    getAccessToken: testDeps?.getAccessToken ?? defaultAccessToken,
    resolveWorkspaceId: testDeps?.resolveWorkspaceId ?? defaultResolveWorkspaceId,
  };
}

/* ------------------------------------------------------------------ */
/* Bentuk hasil                                                        */
/* ------------------------------------------------------------------ */

export type AccountApiErrorCode =
  | 'NO_SESSION'
  | 'NETWORK_ERROR'
  | 'NOT_CONFIGURED'
  | 'FORBIDDEN'
  | 'WORKSPACE_REQUIRED'
  | 'MALFORMED_RESPONSE'
  | 'HTTP_ERROR';

export interface AccountApiError {
  code: AccountApiErrorCode;
  /** Kode server apa adanya (bila ada) — untuk diagnosis, bukan untuk LLM. */
  serverCode?: string;
  status?: number;
}

export type AccountReadResult<T> =
  | { ok: true; data: T; fetchedAt: string }
  | { ok: false; error: AccountApiError };

export interface AccountSubscription {
  planId: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  graceEndsAt: string | null;
  lastOrderId: string | null;
}

export interface AccountSubscriptionData {
  subscription: AccountSubscription | null;
  entitlementPlanId: string;
}

export interface AccountUsageRow {
  id: string | null;
  feature: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  creditsCharged: number | null;
  status: 'actual' | 'failed' | 'pending';
  createdAt: number | null;
}

export interface AccountInvitationRow {
  email: string;
  inviteeName: string;
  role: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
}

export interface AccountSummaryData {
  balance: AccountReadResult<{ balance: CreditBalance; freeOnceGranted: boolean }>;
  subscription: AccountReadResult<AccountSubscriptionData>;
  usage: AccountReadResult<AccountUsageRow[]>;
}

/* ------------------------------------------------------------------ */
/* Helper fetch                                                        */
/* ------------------------------------------------------------------ */

async function readJsonSafe(resp: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function asNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNullableNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function authedGet(
  path: string,
  d: Required<AccountApiDeps>,
): Promise<
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'error'; error: AccountApiError }
> {
  const token = await d.getAccessToken();
  if (!token) return { kind: 'error', error: { code: 'NO_SESSION' } };
  let resp: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    resp = await d.fetcher(path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { kind: 'error', error: { code: 'NETWORK_ERROR' } };
  }
  const body = (await readJsonSafe(resp)) as Record<string, unknown> | null;
  if (!resp.ok || !body || body.success !== true) {
    const serverCode = typeof body?.error === 'string' ? body.error : undefined;
    if (resp.status === 503 || serverCode === 'CREDITS_NOT_CONFIGURED' || serverCode === 'NOT_CONFIGURED') {
      return { kind: 'error', error: { code: 'NOT_CONFIGURED', serverCode, status: resp.status } };
    }
    if (resp.status === 403 || serverCode === 'FORBIDDEN' || serverCode === 'DEMO_RESTRICTED') {
      return { kind: 'error', error: { code: 'FORBIDDEN', serverCode, status: resp.status } };
    }
    if (resp.status === 401) {
      return { kind: 'error', error: { code: 'NO_SESSION', serverCode, status: resp.status } };
    }
    return { kind: 'error', error: { code: 'HTTP_ERROR', serverCode, status: resp.status } };
  }
  return { kind: 'ok', body };
}

/* ------------------------------------------------------------------ */
/* Pembaca domain                                                      */
/* ------------------------------------------------------------------ */

/** Saldo kredit via fetchServerBalance (fail-closed, menolak simulasi). */
export async function readCreditBalance(
  d: Required<AccountApiDeps> = deps(),
): Promise<AccountReadResult<{ balance: CreditBalance; freeOnceGranted: boolean }>> {
  const token = await d.getAccessToken();
  if (!token) return { ok: false, error: { code: 'NO_SESSION' } };
  const r = await fetchServerBalance(token, d.fetcher);
  if (!r.ok) {
    if (r.error === 'NETWORK_ERROR') return { ok: false, error: { code: 'NETWORK_ERROR' } };
    if (r.error === 'CREDITS_NOT_CONFIGURED') return { ok: false, error: { code: 'NOT_CONFIGURED', serverCode: r.error } };
    if (r.error === 'MALFORMED_BALANCE' || r.error === 'SIMULATED_RESPONSE_REJECTED') {
      return { ok: false, error: { code: 'MALFORMED_RESPONSE', serverCode: r.error } };
    }
    if (r.error === 'DEMO_RESTRICTED' || r.error === 'FORBIDDEN') {
      return { ok: false, error: { code: 'FORBIDDEN', serverCode: r.error } };
    }
    if (r.error === 'AUTH_REQUIRED' || r.error === 'AUTH_CONTEXT_REQUIRED') {
      return { ok: false, error: { code: 'NO_SESSION', serverCode: r.error } };
    }
    if (r.error === 'NOT_A_MEMBER' || r.error === 'WORKSPACE_AMBIGUOUS') {
      return { ok: false, error: { code: 'WORKSPACE_REQUIRED', serverCode: r.error } };
    }
    return { ok: false, error: { code: 'HTTP_ERROR', serverCode: r.error } };
  }
  return { ok: true, data: { balance: r.balance, freeOnceGranted: r.freeOnceGranted }, fetchedAt: new Date().toISOString() };
}

/** Status langganan mentah dari server (planId + status apa adanya). */
export async function readSubscription(
  d: Required<AccountApiDeps> = deps(),
): Promise<AccountReadResult<AccountSubscriptionData>> {
  const res = await authedGet('/api/credits/subscription', d);
  if (res.kind === 'error') return { ok: false, error: res.error };
  const body = res.body as unknown as ServerSubscriptionResponse & {
    subscription?: {
      planId?: unknown;
      status?: unknown;
      periodStart?: unknown;
      periodEnd?: unknown;
      graceEndsAt?: unknown;
      lastOrderId?: unknown;
    } | null;
  };
  const entitlementPlanId = asNonEmptyString(body.entitlementPlanId);
  if (!entitlementPlanId) {
    return { ok: false, error: { code: 'MALFORMED_RESPONSE', serverCode: 'MISSING_ENTITLEMENT_PLAN' } };
  }
  let subscription: AccountSubscription | null = null;
  if (body.subscription !== null && body.subscription !== undefined) {
    const planId = asNonEmptyString(body.subscription.planId);
    const status = asNonEmptyString(body.subscription.status);
    if (!planId || !status) {
      return { ok: false, error: { code: 'MALFORMED_RESPONSE', serverCode: 'MALFORMED_SUBSCRIPTION' } };
    }
    subscription = {
      planId,
      status,
      periodStart: asNullableString(body.subscription.periodStart),
      periodEnd: asNullableString(body.subscription.periodEnd),
      graceEndsAt: asNullableString(body.subscription.graceEndsAt),
      lastOrderId: asNullableString(body.subscription.lastOrderId),
    };
  }
  return { ok: true, data: { subscription, entitlementPlanId }, fetchedAt: new Date().toISOString() };
}

/** Riwayat pemakaian kredit, terbaru dulu (maks 100 di server; tool memakai ≤20). */
export async function readUsageHistory(
  limit = 10,
  d: Required<AccountApiDeps> = deps(),
): Promise<AccountReadResult<AccountUsageRow[]>> {
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 10));
  const res = await authedGet(`/api/credits/usage?limit=${n}`, d);
  if (res.kind === 'error') return { ok: false, error: res.error };
  const raw = (res.body as { usage?: unknown }).usage;
  if (!Array.isArray(raw)) {
    return { ok: false, error: { code: 'MALFORMED_RESPONSE', serverCode: 'USAGE_NOT_ARRAY' } };
  }
  const rows: AccountUsageRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const status = o.status === 'actual' || o.status === 'failed' ? o.status : 'pending';
    rows.push({
      id: asNullableString(o.id),
      feature: asNullableString(o.feature),
      model: asNullableString(o.model),
      tokensIn: asNullableNumber(o.tokens_in),
      tokensOut: asNullableNumber(o.tokens_out),
      creditsCharged: asNullableNumber(o.credits_charged),
      status,
      createdAt: asNullableNumber(o.created_at),
    });
  }
  return { ok: true, data: rows, fetchedAt: new Date().toISOString() };
}

/**
 * Daftar undangan workspace. WorkspaceId diselesaikan dari bootstrap
 * idempoten (lihat header); server tetap memverifikasi SUPER_ADMIN.
 */
export async function readInvitations(
  d: Required<AccountApiDeps> = deps(),
): Promise<AccountReadResult<AccountInvitationRow[]>> {
  const token = await d.getAccessToken();
  if (!token) return { ok: false, error: { code: 'NO_SESSION' } };
  const workspaceId = await d.resolveWorkspaceId();
  if (!workspaceId) return { ok: false, error: { code: 'WORKSPACE_REQUIRED' } };
  const res = await authedGet(
    `/api/invitations/list?workspaceId=${encodeURIComponent(workspaceId)}&filter=ALL`,
    d,
  );
  if (res.kind === 'error') return { ok: false, error: res.error };
  const raw = (res.body as { invitations?: unknown }).invitations;
  if (!Array.isArray(raw)) {
    return { ok: false, error: { code: 'MALFORMED_RESPONSE', serverCode: 'INVITATIONS_NOT_ARRAY' } };
  }
  const rows: AccountInvitationRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const email = asNonEmptyString(o.email);
    const status = o.status;
    if (!email) continue;
    if (status !== 'PENDING' && status !== 'ACCEPTED' && status !== 'EXPIRED' && status !== 'REVOKED') continue;
    rows.push({
      email,
      inviteeName: asNullableString(o.inviteeName) ?? '',
      role: asNullableString(o.role) ?? '',
      status,
      createdAt: asNullableString(o.createdAt) ?? '',
      expiresAt: asNullableString(o.expiresAt) ?? '',
    });
  }
  return { ok: true, data: rows, fetchedAt: new Date().toISOString() };
}

/**
 * Ringkasan akun: agregasi SISI KLIEN dari balance + subscription +
 * usage — tanpa endpoint baru. Tiap domain dilaporkan terpisah
 * (sukses/gagal sendiri-sendiri) agar kegagalan satu domain tidak
 * menyembunyikan data domain lain.
 */
export async function readAccountSummary(
  d: Required<AccountApiDeps> = deps(),
): Promise<AccountSummaryData> {
  const [balance, subscription, usage] = await Promise.all([
    readCreditBalance(d),
    readSubscription(d),
    readUsageHistory(10, d),
  ]);
  return { balance, subscription, usage };
}

/* ------------------------------------------------------------------ */
/* Format output (teks untuk LLM — ringkas, berlabel kesegaran)        */
/* ------------------------------------------------------------------ */

/** Nama paket kanonis untuk tampilan (CreditPlan 'pro' = Professional). */
const PLAN_DISPLAY: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Professional',
  professional: 'Professional',
  business: 'Business',
};

function planDisplay(plan: CreditPlan | string): string {
  return PLAN_DISPLAY[String(plan).toLowerCase()] ?? String(plan);
}

function fmtDate(value: string | number | null): string | null {
  if (value === null || value === undefined || value === '') return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString('id-ID');
}

/**
 * Pesan kegagalan jujur — TIDAK diawali 'ERROR:' (lihat header).
 * Tidak pernah mengarang angka; alasan dinyatakan apa adanya.
 */
function accountErrorReason(error: AccountApiError): string {
  switch (error.code) {
    case 'NO_SESSION':
      return 'Anda belum masuk dengan akun EZRAB (belum ada sesi). Masuk dulu, lalu tanyakan lagi.';
    case 'NETWORK_ERROR':
      return 'server tidak dapat dihubungi saat ini. Coba lagi nanti.';
    case 'NOT_CONFIGURED':
      return 'backend akun server belum aktif.';
    case 'FORBIDDEN':
      return 'akun ini tidak memiliki izin untuk melihat data tersebut.';
    case 'WORKSPACE_REQUIRED':
      return 'workspace akun belum dapat ditentukan (bootstrap workspace belum berhasil).';
    case 'MALFORMED_RESPONSE':
      return 'respons server tidak dapat dibaca.';
    default:
      return 'coba lagi nanti.';
  }
}

export function formatAccountError(what: string, error: AccountApiError): string {
  return `${what} tidak tersedia: ${accountErrorReason(error)}`;
}

export function formatCreditBalance(
  result: AccountReadResult<{ balance: CreditBalance; freeOnceGranted: boolean }>,
): string {
  if (!result.ok) return formatAccountError('Saldo kredit', result.error);
  const b = result.data.balance;
  const lines = [
    `Saldo kredit AI — data live server (paket: ${planDisplay(b.plan)}):`,
    `- Total tersedia: ${b.total.toLocaleString('id-ID')} kredit`,
    `- Langganan: ${b.subscription.toLocaleString('id-ID')} · Top-up: ${b.topup.toLocaleString('id-ID')} · Bonus: ${b.bonus.toLocaleString('id-ID')} · Gratis awal: ${b.freeOnce === undefined ? 'tidak diketahui' : b.freeOnce.toLocaleString('id-ID')}`,
  ];
  if (result.data.freeOnceGranted) lines.push('- Bonus gratis awal 100 kredit sudah pernah diberikan ke akun ini.');
  return lines.join('\n');
}

export function formatSubscription(result: AccountReadResult<AccountSubscriptionData>): string {
  if (!result.ok) return formatAccountError('Status langganan', result.error);
  const { subscription, entitlementPlanId } = result.data;
  if (!subscription) {
    return `Langganan — data live server: tidak ada langganan aktif. Paket efektif menurut server: ${planDisplay(entitlementPlanId)}.`;
  }
  const lines = [
    `Langganan — data live server: paket ${planDisplay(subscription.planId)}, status ${subscription.status}.`,
  ];
  const periodEnd = fmtDate(subscription.periodEnd);
  if (periodEnd) lines.push(`- Masa berlaku sampai: ${periodEnd}`);
  const grace = fmtDate(subscription.graceEndsAt);
  if (grace) lines.push(`- Masa tenggang sampai: ${grace}`);
  if (planDisplay(entitlementPlanId) !== planDisplay(subscription.planId)) {
    lines.push(`- Paket efektif menurut server: ${planDisplay(entitlementPlanId)}.`);
  }
  return lines.join('\n');
}

const USAGE_STATUS_LABEL: Record<AccountUsageRow['status'], string> = {
  actual: 'tercatat',
  failed: 'gagal',
  pending: 'menunggu rekonsiliasi',
};

export function formatUsageHistory(
  result: AccountReadResult<AccountUsageRow[]>,
  limit = 10,
): string {
  if (!result.ok) return formatAccountError('Riwayat pemakaian kredit', result.error);
  const rows = result.data;
  if (rows.length === 0) {
    return 'Riwayat pemakaian kredit — data live server: belum ada pemakaian kredit yang tercatat.';
  }
  const lines = [`Riwayat pemakaian kredit — data live server (${rows.length} terbaru):`];
  for (const r of rows.slice(0, limit)) {
    const when = fmtDate(r.createdAt);
    const credits = r.creditsCharged !== null ? `${r.creditsCharged.toLocaleString('id-ID')} kredit` : 'kredit belum ditentukan';
    const feature = r.feature ?? 'fitur tidak dicatat';
    lines.push(`- ${when ?? 'waktu tidak dicatat'} — ${feature} — ${credits} — ${USAGE_STATUS_LABEL[r.status]}`);
  }
  lines.push('Catatan: biaya provider tidak disimpan di ledger, jadi biaya rupiah per pemakaian tidak tersedia.');
  return lines.join('\n');
}

const INVITATION_STATUS_LABEL: Record<AccountInvitationRow['status'], string> = {
  PENDING: 'menunggu',
  ACCEPTED: 'diterima',
  EXPIRED: 'kedaluwarsa',
  REVOKED: 'dibatalkan',
};

export function formatInvitations(result: AccountReadResult<AccountInvitationRow[]>): string {
  if (!result.ok) {
    if (result.error.code === 'FORBIDDEN') {
      return 'Daftar undangan tidak tersedia: hanya admin workspace (SUPER_ADMIN) yang dapat melihat undangan tim.';
    }
    return formatAccountError('Daftar undangan', result.error);
  }
  const rows = result.data;
  if (rows.length === 0) {
    return 'Undangan tim — data live server: belum ada undangan di workspace ini.';
  }
  const counts = { PENDING: 0, ACCEPTED: 0, EXPIRED: 0, REVOKED: 0 };
  for (const r of rows) counts[r.status] += 1;
  const lines = [
    `Undangan tim — data live server (${rows.length} undangan: ${counts.PENDING} menunggu, ${counts.ACCEPTED} diterima, ${counts.EXPIRED} kedaluwarsa, ${counts.REVOKED} dibatalkan):`,
  ];
  for (const r of rows.slice(0, 10)) {
    const exp = fmtDate(r.expiresAt);
    const name = r.inviteeName ? ` (${r.inviteeName})` : '';
    lines.push(`- ${r.email}${name} — peran ${r.role || 'tidak dicatat'} — ${INVITATION_STATUS_LABEL[r.status]}${exp ? ` — kedaluwarsa ${exp}` : ''}`);
  }
  if (rows.length > 10) lines.push(`…dan ${rows.length - 10} undangan lainnya.`);
  return lines.join('\n');
}

export function formatAccountSummary(summary: AccountSummaryData): string {
  const lines = ['Ringkasan akun — data live server:'];
  if (summary.balance.ok) {
    const b = summary.balance.data.balance;
    lines.push(`- Saldo kredit: ${b.total.toLocaleString('id-ID')} kredit tersedia (langganan ${b.subscription.toLocaleString('id-ID')} · top-up ${b.topup.toLocaleString('id-ID')} · bonus ${b.bonus.toLocaleString('id-ID')} · gratis awal ${b.freeOnce === undefined ? 'tidak diketahui' : b.freeOnce.toLocaleString('id-ID')}).`);
  } else {
    lines.push(`- Saldo kredit tidak tersedia: ${accountErrorReason(summary.balance.error)}`);
  }
  if (summary.subscription.ok) {
    const { subscription, entitlementPlanId } = summary.subscription.data;
    if (subscription) {
      lines.push(`- Langganan: paket ${planDisplay(subscription.planId)}, status ${subscription.status}${fmtDate(subscription.periodEnd) ? `, berlaku sampai ${fmtDate(subscription.periodEnd)}` : ''}.`);
    } else {
      lines.push(`- Langganan: tidak ada langganan aktif (paket efektif menurut server: ${planDisplay(entitlementPlanId)}).`);
    }
  } else {
    lines.push(`- Langganan tidak tersedia: ${accountErrorReason(summary.subscription.error)}`);
  }
  if (summary.usage.ok) {
    const rows = summary.usage.data;
    if (rows.length === 0) {
      lines.push('- Pemakaian: belum ada pemakaian kredit yang tercatat.');
    } else {
      const charged = rows.reduce((acc, r) => acc + (r.creditsCharged ?? 0), 0);
      const known = rows.filter((r) => r.creditsCharged !== null).length;
      lines.push(
        `- Pemakaian: ${rows.length} operasi terakhir tercatat${known > 0 ? `, total ${charged.toLocaleString('id-ID')} kredit pada ${known} operasi yang biayanya sudah ditentukan` : ''} (jendela 10 operasi terakhir, bukan total seumur akun).`,
      );
    }
  } else {
    lines.push(`- Pemakaian tidak tersedia: ${accountErrorReason(summary.usage.error)}`);
  }
  return lines.join('\n');
}