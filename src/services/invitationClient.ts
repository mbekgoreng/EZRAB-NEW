/**
 * invitationClient — klien tipis untuk /api/invitations/* (Secure Invitation).
 *
 * Token akses diambil dari sesi Supabase yang ada (AuthContext/lib) — tidak
 * ada identitas yang dibuat di sini. Bila backend belum dikonfigurasi,
 * server menjawab 503 NOT_CONFIGURED dan UI menampilkannya secara jujur.
 */
import { getSupabaseClient } from '../lib/supabase';

export interface InvitationAdminView {
  id: string;
  workspaceId: string;
  email: string;
  inviteeName: string;
  role: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  emailStatus: 'not_sent' | 'sent' | 'failed';
  emailProvider: string | null;
  projectIds: string[];
  resendOf: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface InvitationSummary {
  company: string;
  role: string;
  inviteeName: string;
  emailMasked: string;
  status: string;
  expiresAt: string;
}

export type InvitationApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; message?: string; messages?: string[] };

async function accessToken(): Promise<string | null> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function call<T>(path: string, init: RequestInit): Promise<InvitationApiResult<T>> {
  try {
    const token = await accessToken();
    const res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      return {
        ok: false,
        status: res.status,
        error: body?.error || `HTTP_${res.status}`,
        message: body?.message,
        messages: body?.messages,
      };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch {
    return { ok: false, status: 0, error: 'NETWORK', message: 'Tidak dapat menghubungi server.' };
  }
}

export const invitationClient = {
  create(input: {
    name: string; email: string; role: string; workspaceId: string; expiryHours?: number; projectIds?: string[];
  }) {
    return call<{ invitation: InvitationAdminView; link: string; email: { status: string; provider: string | null } }>(
      '/api/invitations/create',
      { method: 'POST', body: JSON.stringify(input) }
    );
  },
  list(workspaceId: string, filter: string) {
    return call<{ invitations: InvitationAdminView[] }>(
      `/api/invitations/list?workspaceId=${encodeURIComponent(workspaceId)}&filter=${encodeURIComponent(filter)}`,
      { method: 'GET' }
    );
  },
  validate(token: string) {
    return call<{ summary: InvitationSummary }>('/api/invitations/validate', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },
  redeem(token: string) {
    return call<{ workspace: { id: string; name: string }; role: string }>('/api/invitations/redeem', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },
  revoke(invitationId: string) {
    return call<{ invitation: InvitationAdminView }>('/api/invitations/revoke', {
      method: 'POST',
      body: JSON.stringify({ invitationId }),
    });
  },
  resend(invitationId: string) {
    return call<{ invitation: InvitationAdminView; link: string; email: { status: string; provider: string | null } }>(
      '/api/invitations/resend',
      { method: 'POST', body: JSON.stringify({ invitationId }) }
    );
  },
};
