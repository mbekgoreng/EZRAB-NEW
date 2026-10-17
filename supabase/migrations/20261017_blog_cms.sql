-- ============================================================================
-- EZRAB Blog CMS — tabel articles, categories, tags, article_tags, authors,
-- article_revisions
-- ============================================================================
-- STATUS: NOT APPLIED to any live database. Review + apply manually.
-- Non-destructive by design (CREATE TABLE IF NOT EXISTS, no DROPs).
--
-- DEPENDENSI SEBELUM APPLY:
--   1. Approval eksplisit user (perintah: jangan aplikasikan migration
--      apapun ke database tanpa persetujuan).
--   2. Koneksi Supabase valid + service_role key (vault reconnect 2026-10-13
--      GAGAL — key ditolak; user perlu re-copy dari dashboard).
--   3. Tabel auth.users tersedia (FK created_by/updated_by).
--
-- KEBIJAKAN AKSES (RLS):
--   - Publik (anon): SELECT hanya artikel status='published' dengan
--     published_at <= now() — via view blog_public_articles.
--   - Write (INSERT/UPDATE/DELETE): hanya authenticated. Otorisasi
--     capability 'manage-blog' ditegakkan di application layer
--     (Belum ada tabel role mapping — TODO saat auth real aktif).
--   - Revisi: hanya authenticated.
-- ============================================================================

create table if not exists public.blog_authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Editor',
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) >= 3),
  excerpt text not null default '',
  body_markdown text not null check (char_length(body_markdown) >= 1),
  category_id uuid references public.blog_categories(id) on delete set null,
  author_id uuid references public.blog_authors(id) on delete set null,
  cover_url text,
  status text not null default 'draft'
    check (status in ('draft','review','scheduled','published','archived')),
  published_at timestamptz,
  scheduled_at timestamptz,
  seo_title text,
  seo_description text,
  canonical_url text check (canonical_url is null or canonical_url ~ '^https?://'),
  og_image_url text,
  featured boolean not null default false,
  cta_variant text not null default 'general'
    check (cta_variant in ('general','rab','ahsp','qto','ded')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- published & scheduled wajib punya published_at/scheduled_at yang konsisten
  check (status != 'published' or published_at is not null),
  check (status != 'scheduled' or scheduled_at is not null)
);

create table if not exists public.blog_article_tags (
  article_id uuid not null references public.blog_articles(id) on delete cascade,
  tag_id uuid not null references public.blog_tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create table if not exists public.blog_article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.blog_articles(id) on delete cascade,
  saved_by uuid references auth.users(id),
  note text not null default '',
  snapshot jsonb not null,
  saved_at timestamptz not null default now()
);

-- index
create index if not exists idx_blog_articles_status on public.blog_articles(status);
create index if not exists idx_blog_articles_published_at on public.blog_articles(published_at desc);
create index if not exists idx_blog_articles_category on public.blog_articles(category_id);
create index if not exists idx_blog_revisions_article on public.blog_article_revisions(article_id, saved_at desc);

-- view publik: hanya artikel yang boleh tampil
create or replace view public.blog_public_articles as
select a.*
from public.blog_articles a
where a.status = 'published'
  and a.published_at is not null
  and a.published_at <= now();

-- RLS
alter table public.blog_authors enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_articles enable row level security;
alter table public.blog_article_tags enable row level security;
alter table public.blog_article_revisions enable row level security;

-- Publik: baca kategori/tag/penulis (dimensi non-sensitif)
create policy blog_categories_public_read on public.blog_categories
  for select using (true);
create policy blog_tags_public_read on public.blog_tags
  for select using (true);
create policy blog_authors_public_read on public.blog_authors
  for select using (true);

-- Publik: baca artikel HANYA yang published & sudah waktunya
create policy blog_articles_public_read on public.blog_articles
  for select using (
    status = 'published' and published_at is not null and published_at <= now()
  );

-- Write: hanya authenticated (otorisasi manage-blog di application layer)
create policy blog_articles_auth_write on public.blog_articles
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
create policy blog_categories_auth_write on public.blog_categories
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
create policy blog_tags_auth_write on public.blog_tags
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
create policy blog_authors_auth_write on public.blog_authors
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
create policy blog_article_tags_auth_write on public.blog_article_tags
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
create policy blog_article_revisions_auth on public.blog_article_revisions
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed 5 kategori editorial tetap
insert into public.blog_categories (name, slug, sort_order) values
  ('Panduan RAB', 'panduan-rab', 1),
  ('AHSP 2026 & Harga Satuan', 'ahsp-2026-harga-satuan', 2),
  ('Teknik Sipil & Konstruksi', 'teknik-sipil-konstruksi', 3),
  ('Tutorial Software & AI', 'tutorial-software-ai', 4),
  ('Manajemen Proyek', 'manajemen-proyek', 5)
on conflict (slug) do nothing;
