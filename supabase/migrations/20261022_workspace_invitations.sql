-- ============================================================================
-- EZRAB — Secure Workspace Invitations (Fase G, master prompt 2026-10-22)
-- ============================================================================
-- NON-DESTRUCTIVE, ADDITIVE ONLY. Belum diterapkan ke database mana pun;
-- file ini hanya disiapkan dan divalidasi sintaksnya secara lokal.
--
-- Bergantung pada fondasi yang sudah ada:
--   20260913_auth_membership_foundation.sql
--   (public.profiles, public.workspaces, public.workspace_members,
--    public.project_members, public.audit_logs)
--
-- Prinsip keamanan:
-- - Hanya HASH token (SHA-256 hex) yang disimpan; token mentah tidak pernah
--   masuk database, log, atau audit.
-- - Role undangan TIDAK PERNAH bisa SUPER_ADMIN (dicek di CHECK constraint
--   DAN di service backend) — undangan biasa tidak dapat memberi hak
--   istimewa platform/workspace.
-- - RLS aktif TANPA policy baca/tulis untuk role `authenticated` biasa:
--   seluruh operasi undangan berjalan lewat backend tepercaya
--   (service role) atau fungsi SECURITY DEFINER yang sempit di bawah ini.
-- - Penebusan atomik: satu UPDATE bersyarat di dalam fungsi
--   accept_workspace_invitation (satu transaksi bersama pembuatan
--   keanggotaan workspace + akses proyek + audit log).
-- ============================================================================

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Email selalu disimpan ternormalisasi (lowercase, trim) oleh backend.
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  invitee_name text check (char_length(invitee_name) <= 160),
  -- SUPER_ADMIN sengaja TIDAK ada di daftar ini.
  role text not null check (role in ('ESTIMATOR','DIREKSI','CLIENT','EDITOR')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  status text not null default 'PENDING'
    check (status in ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  -- Status pengiriman email yang JUJUR: 'not_sent' sampai provider
  -- benar-benar mengonfirmasi; tidak pernah diisi 'sent' hanya karena
  -- undangan berhasil disimpan.
  email_status text not null default 'not_sent'
    check (email_status in ('not_sent','sent','failed')),
  email_provider text,
  project_ids text[] not null default '{}',
  resend_of uuid references public.workspace_invitations(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Konsistensi: maksimum SATU undangan PENDING per (workspace, email).
create unique index if not exists workspace_invitations_one_pending_per_email
  on public.workspace_invitations (workspace_id, email)
  where status = 'PENDING';

create index if not exists workspace_invitations_token_hash_idx
  on public.workspace_invitations (token_hash);
create index if not exists workspace_invitations_workspace_status_idx
  on public.workspace_invitations (workspace_id, status, created_at desc);
create index if not exists workspace_invitations_email_idx
  on public.workspace_invitations (email);

alter table public.workspace_invitations enable row level security;

-- SENGAJA tidak ada policy untuk role authenticated/anon:
-- tabel ini hanya dapat diakses service role (backend) dan fungsi
-- SECURITY DEFINER di bawah. Pengguna biasa tidak dapat membaca undangan
-- workspace mana pun lewat PostgREST.

-- ---------------------------------------------------------------------------
-- Penebusan undangan yang ATOMIK.
-- Dipanggil backend SETELAH JWT penerima diverifikasi server-side; email
-- dari JWT harus sama dengan email undangan (dicek lagi di sini dari data
-- otoritatif yang tersimpan — role/workspace tidak pernah diambil dari
-- request).
-- Mengembalikan status teks:
--   'accepted' | 'invalid' | 'expired' | 'already_used' | 'revoked'
--   | 'email_mismatch' | 'already_member_other_role'
-- ---------------------------------------------------------------------------
create or replace function public.accept_workspace_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.workspace_invitations%rowtype;
  v_existing_role text;
begin
  -- Kunci baris undangan: dua request bersamaan ter-serialisasi di sini.
  select * into v_inv
  from public.workspace_invitations
  where token_hash = p_token_hash
  for update;

  if not found then
    return 'invalid';
  end if;

  if v_inv.status = 'ACCEPTED' then
    return 'already_used';
  end if;
  if v_inv.status = 'REVOKED' then
    return 'revoked';
  end if;
  if v_inv.status = 'EXPIRED' or v_inv.expires_at <= now() then
    -- Tandai kedaluwarsa secara persisten bila masih PENDING.
    if v_inv.status = 'PENDING' then
      update public.workspace_invitations
        set status = 'EXPIRED', updated_at = now()
        where id = v_inv.id;
    end if;
    return 'expired';
  end if;
  if v_inv.status <> 'PENDING' then
    return 'invalid';
  end if;

  -- Email dari identity terverifikasi harus sama dengan email undangan.
  if lower(p_email) <> v_inv.email then
    return 'email_mismatch';
  end if;

  -- Sudah menjadi anggota dengan role lain? Jangan timpa role yang ada.
  select role into v_existing_role
  from public.workspace_members
  where workspace_id = v_inv.workspace_id and user_id = p_user_id;

  if v_existing_role is not null and v_existing_role <> v_inv.role then
    return 'already_member_other_role';
  end if;

  -- Semua perubahan dalam SATU transaksi fungsi ini:
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, p_user_id, v_inv.role)
  on conflict (workspace_id, user_id) do nothing;

  if array_length(v_inv.project_ids, 1) is not null then
    insert into public.project_members (project_id, workspace_id, user_id)
    select pid, v_inv.workspace_id, p_user_id
    from unnest(v_inv.project_ids) as pid
    on conflict (project_id, user_id) do nothing;
  end if;

  update public.workspace_invitations
    set status = 'ACCEPTED',
        accepted_by = p_user_id,
        accepted_at = now(),
        updated_at = now()
    where id = v_inv.id and status = 'PENDING';

  insert into public.audit_logs (user_id, workspace_id, event_code)
  values (p_user_id, v_inv.workspace_id, 'invitation.accepted');

  return 'accepted';
end;
$$;

-- Fungsi di atas hanya untuk backend tepercaya (service role).
revoke all on function public.accept_workspace_invitation(text, uuid, text) from public;
revoke all on function public.accept_workspace_invitation(text, uuid, text) from authenticated;
revoke all on function public.accept_workspace_invitation(text, uuid, text) from anon;
