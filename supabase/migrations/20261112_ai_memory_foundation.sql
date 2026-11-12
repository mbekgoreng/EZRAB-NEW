-- ============================================================================
-- EZRAB — AI Memory Foundation (Fase 2, direktif owner 2026-11-12 Part 4)
-- ============================================================================
-- STATUS: PROPOSAL — TIDAK diterapkan ke database mana pun (bukan ke
-- produksi, bukan ke Supabase live proyek tjgadmctzwqgexdilekq).
-- Disiapkan & diuji LOKAL saja (pg-mem, lihat laporan Fase 2 §9):
-- eksekusi penuh di pg-mem + pemeriksaan struktural. Penerapan live
-- HANYA oleh owner, sesudah: (1) Supabase Auth aktif & sesi user nyata
-- berjalan, (2) eksekusi RLS migrasi kanonis terverifikasi di dashboard
-- (daftar tabel + pg_policies), (3) keputusan tipe project_id (lihat
-- catatan di bawah).
--
-- ISI: ai_memories (record memori 6 lapis) + ai_preferences (store
-- preferensi eksplisit) + ai_memory_events (audit append-only) +
-- ai_jobs (job store — prasyarat resume server-side, proposal
-- lifecycle §I.3). Aditif (CREATE TABLE IF NOT EXISTS, tanpa DROP).
--
-- KEPUTUSAN SKEMA (jujur, bukan tebakan):
--  * user_id UUID REFERENCES auth.users — identitas HANYA dari
--    auth.uid(); TIDAK PERNAH dari userId kiriman klien.
--  * project_id TEXT (tanpa FK ke public.projects): id proyek sisi
--    klien hari ini berupa string (legacy/seed), sementara skema
--    kanonis memakai UUID — FK akan gagal untuk id legacy. FK dapat
--    ditambahkan sesudah id proyek dikanonisasi ke UUID (keputusan
--    owner, Fase 6).
--  * RLS owner-only (user_id = auth.uid()): akses anggota workspace
--    SENGAJA belum diberikan sampai pertanyaan tipe project_id di atas
--    diputuskan — fail-closed, bukan akses diam-diam.
--  * ai_memory_events: deny-by-default (TIDAK ADA policy baca/tulis
--    untuk authenticated — hanya service_role; pola yang sama dengan
--    audit_logs di migrasi kanonis).
--  * Kunci preferensi dibatasi CHECK allowlist — TIDAK ADA kunci untuk
--    atribut personal sensitif (usia/gender/agama/kesehatan/dll.).
--    Preferensi semacam itu tidak punya tempat di skema ini.
--  * Retensi: fungsi purge_expired_ai_memories() (service_role) untuk
--    pekerjaan terjadwal; tidak ada penghapusan otomatis di sini.
-- ============================================================================

-- ---------------------------------------------------------------- tables --

CREATE TABLE IF NOT EXISTS public.ai_memories (
  memory_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id TEXT,
  conversation_id TEXT,
  memory_key TEXT NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('working', 'conversation', 'project', 'preference', 'long-term', 'knowledge')),
  memory_type TEXT NOT NULL CHECK (memory_type IN ('fact', 'decision', 'correction', 'preference', 'spec', 'task-result', 'reference')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_message_id TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('user-message', 'user-correction', 'structured-spec', 'tool-result', 'draft', 'official-reference', 'system-consolidation')),
  provenance TEXT NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('confirmed-fact', 'user-assumption', 'ai-suggestion', 'unverified-external', 'official-reference', 'superseded', 'contradictory', 'temporary-working-state')),
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  importance SMALLINT NOT NULL CHECK (importance IN (1, 2, 3)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiration_policy TEXT NOT NULL DEFAULT 'project-lifetime'
    CHECK (expiration_policy IN ('session', 'project-lifetime', 'until-changed', 'official-version') OR expiration_policy LIKE 'days:%'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded', 'contradictory')),
  supersedes TEXT REFERENCES public.ai_memories (memory_id) ON DELETE SET NULL,
  conflict_of TEXT REFERENCES public.ai_memories (memory_id) ON DELETE SET NULL
  -- TIDAK ADA UNIQUE (user, proyek, kunci, status) di sini: histori
  -- superseded menumpuk per kunci, jadi UNIQUE penuh akan menolak
  -- supersede kedua. Satu-nilai-current ditegakkan indeks parsial
  -- di bawah (idx_ai_memories_one_current).
);

CREATE TABLE IF NOT EXISTS public.ai_preferences (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key IN ('language', 'rabPresentation', 'workflowStyle', 'detailLevel', 'personalizationEnabled')),
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS public.ai_memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id TEXT,
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  project_id TEXT,
  event TEXT NOT NULL CHECK (event IN ('created', 'superseded', 'contradiction-flagged', 'corrected', 'deleted', 'expired', 'retrieved')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_jobs (
  job_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id TEXT,
  conversation_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'generating', 'completed', 'failed', 'cancelled', 'interrupted')),
  provider TEXT,
  model TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------- indexes --

-- Satu record current per (user, proyek, kunci). Histori superseded /
-- contradictory tidak dibatasi jumlahnya.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_memories_one_current
  ON public.ai_memories (user_id, project_id, memory_key) WHERE status = 'current';
CREATE INDEX IF NOT EXISTS idx_ai_memories_user_project
  ON public.ai_memories (user_id, project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memories_conversation
  ON public.ai_memories (conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_memories_key
  ON public.ai_memories (memory_key, status);
CREATE INDEX IF NOT EXISTS idx_ai_memory_events_memory
  ON public.ai_memory_events (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_created
  ON public.ai_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_idempotency
  ON public.ai_jobs (idempotency_key);

-- ------------------------------------------------------------------- RLS --

ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

-- ai_memories: pemilik saja (fail-closed; akses anggota workspace
-- menunggu keputusan tipe project_id — lihat header).
CREATE POLICY ai_memories_owner_select ON public.ai_memories
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ai_memories_owner_insert ON public.ai_memories
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_memories_owner_update ON public.ai_memories
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_memories_owner_delete ON public.ai_memories
  FOR DELETE USING (user_id = auth.uid());

-- ai_preferences: pemilik saja.
CREATE POLICY ai_preferences_owner_select ON public.ai_preferences
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ai_preferences_owner_insert ON public.ai_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_preferences_owner_update ON public.ai_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_preferences_owner_delete ON public.ai_preferences
  FOR DELETE USING (user_id = auth.uid());

-- ai_jobs: pemilik saja (status job milik pengguna yang memintanya).
CREATE POLICY ai_jobs_owner_select ON public.ai_jobs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ai_jobs_owner_insert ON public.ai_jobs
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_jobs_owner_update ON public.ai_jobs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_jobs_owner_delete ON public.ai_jobs
  FOR DELETE USING (user_id = auth.uid());

-- ai_memory_events: TIDAK ADA policy untuk authenticated (deny-by-default;
-- tulis hanya via service_role; baca hanya via service_role/audit).

-- ------------------------------------------------------- retention helper --

-- Hapus record memori kedaluwarsa (expiration_policy 'days:N' yang
-- sudah lewat). Dipanggil pekerjaan terjadwal dengan service_role;
-- BUKAN trigger otomatis. Mengembalikan jumlah baris yang dihapus.
CREATE OR REPLACE FUNCTION public.purge_expired_ai_memories()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expired AS (
    DELETE FROM public.ai_memories
    WHERE expiration_policy ~ '^days:[0-9]+$'
      AND created_at < now() - split_part(expiration_policy, ':', 2)::integer * interval '1 day'
    RETURNING memory_id
  )
  SELECT count(*)::integer FROM expired;
$$;
