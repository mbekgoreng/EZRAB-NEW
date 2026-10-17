/**
 * BlogAdminStore — abstraksi persistence untuk CMS blog.
 *
 * Implementasi saat ini: InMemoryBlogAdminStore — JELAS NON-PRODUKSI
 * (data hilang saat refresh; BUKAN localStorage — sesuai aturan, CMS
 * produksi tidak boleh hanya mengandalkan localStorage).
 *
 * Jalur produksi: ganti dengan SupabaseBlogAdminStore memakai tabel di
 * supabase/migrations/20261017_blog_cms.sql (migration disiapkan, BELUM
 * diaplikasikan — butuh approval + service_role valid).
 */
import { readingMinutes, slugify } from '../markdown';
import type { ArticleRevision, BlogArticle, BlogStatus } from '../types';

export interface ArticleInput {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  category: string;
  tags: string[];
  authorName: string;
  authorRole: string;
  authorBio?: string;
  cover?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonical?: string;
  ogImage?: string;
  featured?: boolean;
  cta?: string;
  references?: string[];
  scheduledAt?: string;
}

export interface ListQuery {
  query?: string;
  status?: BlogStatus | 'all';
  page: number;
  pageSize: number;
}

export class BlogAdminValidationError extends Error {
  readonly fields: string[];
  constructor(message: string, fields: string[] = []) {
    super(message);
    this.name = 'BlogAdminValidationError';
    this.fields = fields;
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateInput(input: ArticleInput, isTaken: (slug: string) => boolean): void {
  const errors: string[] = [];
  const fields: string[] = [];
  if (!input.title.trim()) {
    errors.push('Judul wajib diisi.');
    fields.push('title');
  }
  const slug = input.slug.trim().toLowerCase();
  if (!slug) {
    errors.push('Slug wajib diisi.');
    fields.push('slug');
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.push('Slug hanya boleh huruf kecil, angka, dan strip (contoh: panduan-rab-rumah).');
    fields.push('slug');
  } else if (isTaken(slug)) {
    errors.push(`Slug "${slug}" sudah dipakai artikel lain.`);
    fields.push('slug');
  }
  if (!input.bodyMarkdown.trim()) {
    errors.push('Isi artikel wajib diisi.');
    fields.push('bodyMarkdown');
  }
  if (!input.category.trim()) {
    errors.push('Kategori wajib diisi.');
    fields.push('category');
  }
  if (input.canonical && !/^https?:\/\//i.test(input.canonical.trim())) {
    errors.push('Canonical harus URL absolut (https://…).');
    fields.push('canonical');
  }
  if (errors.length > 0) throw new BlogAdminValidationError(errors.join(' '), fields);
}

/** Transisi status yang diizinkan di workflow CMS. */
export const ALLOWED_TRANSITIONS: Record<BlogStatus, BlogStatus[]> = {
  draft: ['review', 'scheduled', 'published', 'archived'],
  review: ['draft', 'scheduled', 'published', 'archived'],
  scheduled: ['draft', 'review', 'published', 'archived'],
  published: ['archived', 'draft'],
  archived: ['draft'],
};

export interface BlogAdminStore {
  list(q: ListQuery): { items: BlogArticle[]; total: number };
  get(slug: string): BlogArticle | undefined;
  create(input: ArticleInput, author: string): BlogArticle;
  update(slug: string, input: ArticleInput, author: string, note?: string): BlogArticle;
  setStatus(slug: string, status: BlogStatus, author: string, opts?: { scheduledAt?: string }): BlogArticle;
  remove(slug: string): void;
  revisions(slug: string): ArticleRevision[];
  isSlugTaken(slug: string, exceptSlug?: string): boolean;
}

const toArticle = (input: ArticleInput, status: BlogStatus): BlogArticle => {
  const slug = slugify(input.slug.trim());
  const now = new Date().toISOString();
  return {
    slug,
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    bodyMarkdown: input.bodyMarkdown,
    category: input.category.trim(),
    tags: input.tags.map((t) => t.trim()).filter(Boolean),
    author: {
      name: input.authorName.trim() || 'Tim Editorial EZRAB',
      role: input.authorRole.trim() || 'Editor',
      bio: input.authorBio?.trim() || undefined,
    },
    cover: input.cover?.trim() || undefined,
    status,
    publishedAt: status === 'published' ? now : undefined,
    updatedAt: now,
    scheduledAt: input.scheduledAt?.trim() || undefined,
    seoTitle: input.seoTitle?.trim() || undefined,
    seoDescription: input.seoDescription?.trim() || undefined,
    canonical: input.canonical?.trim() || undefined,
    ogImage: input.ogImage?.trim() || undefined,
    featured: input.featured === true,
    cta: input.cta?.trim() || undefined,
    references: input.references && input.references.length > 0 ? input.references : undefined,
    readingMinutes: readingMinutes(input.bodyMarkdown),
  };
};

let revisionSeq = 0;

export class InMemoryBlogAdminStore implements BlogAdminStore {
  private articles = new Map<string, BlogArticle>();
  private revisionLog = new Map<string, ArticleRevision[]>();

  constructor(seed: BlogArticle[] = []) {
    for (const a of seed) this.articles.set(a.slug.toLowerCase(), { ...a });
  }

  private snapshot(slug: string, author: string, note: string): void {
    const current = this.articles.get(slug.toLowerCase());
    if (!current) return;
    const { readingMinutes: _rm, ...rest } = current;
    const entry: ArticleRevision = {
      id: `rev-${Date.now()}-${revisionSeq++}`,
      slug: current.slug,
      savedAt: new Date().toISOString(),
      savedBy: author,
      note,
      snapshot: rest,
    };
    const log = this.revisionLog.get(slug.toLowerCase()) ?? [];
    log.unshift(entry);
    this.revisionLog.set(slug.toLowerCase(), log);
  }

  list(q: ListQuery): { items: BlogArticle[]; total: number } {
    const query = (q.query || '').trim().toLowerCase();
    let items = [...this.articles.values()];
    if (q.status && q.status !== 'all') items = items.filter((a) => a.status === q.status);
    if (query) {
      items = items.filter((a) =>
        `${a.title} ${a.excerpt} ${a.category} ${a.tags.join(' ')}`.toLowerCase().includes(query)
      );
    }
    items.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    const total = items.length;
    const start = (Math.max(1, q.page) - 1) * q.pageSize;
    return { items: items.slice(start, start + q.pageSize), total };
  }

  get(slug: string): BlogArticle | undefined {
    return this.articles.get(slug.toLowerCase());
  }

  isSlugTaken(slug: string, exceptSlug?: string): boolean {
    const key = slug.trim().toLowerCase();
    if (exceptSlug && key === exceptSlug.trim().toLowerCase()) return false;
    return this.articles.has(key);
  }

  create(input: ArticleInput, author: string): BlogArticle {
    validateInput(input, (s) => this.isSlugTaken(s));
    const article = toArticle(input, 'draft');
    this.articles.set(article.slug.toLowerCase(), article);
    this.snapshot(article.slug, author, 'Artikel dibuat (draft)');
    return article;
  }

  update(slug: string, input: ArticleInput, author: string, note?: string): BlogArticle {
    const existing = this.get(slug);
    if (!existing) throw new BlogAdminValidationError(`Artikel "${slug}" tidak ditemukan.`);
    validateInput(input, (s) => this.isSlugTaken(s, existing.slug));
    // Slug tidak bisa diubah setelah dibuat (URL stabil) — abaikan input.slug bila beda.
    const article = { ...toArticle({ ...input, slug: existing.slug }, existing.status) };
    article.publishedAt = existing.publishedAt;
    article.updatedAt = new Date().toISOString();
    this.articles.set(existing.slug.toLowerCase(), article);
    this.snapshot(existing.slug, author, note || 'Artikel diubah');
    return article;
  }

  setStatus(slug: string, status: BlogStatus, author: string, opts?: { scheduledAt?: string }): BlogArticle {
    const existing = this.get(slug);
    if (!existing) throw new BlogAdminValidationError(`Artikel "${slug}" tidak ditemukan.`);
    if (!ALLOWED_TRANSITIONS[existing.status].includes(status)) {
      throw new BlogAdminValidationError(
        `Transisi ${existing.status} → ${status} tidak diizinkan.`
      );
    }
    if (status === 'scheduled') {
      const at = (opts?.scheduledAt || existing.scheduledAt || '').trim();
      if (!at) throw new BlogAdminValidationError('Artikel terjadwal wajib punya tanggal terbit.');
      if (new Date(at).getTime() <= Date.now()) {
        throw new BlogAdminValidationError('Jadwal terbit harus di masa depan.');
      }
      existing.scheduledAt = at;
    }
    if (status === 'published') {
      // scheduled yang waktunya tiba boleh terbit; validasi konten wajib tetap lolos.
      validateInput(
        {
          title: existing.title,
          slug: existing.slug,
          excerpt: existing.excerpt,
          bodyMarkdown: existing.bodyMarkdown,
          category: existing.category,
          tags: existing.tags,
          authorName: existing.author.name,
          authorRole: existing.author.role,
        },
        (s) => this.isSlugTaken(s, existing.slug)
      );
      if (!existing.publishedAt) existing.publishedAt = new Date().toISOString();
    }
    existing.status = status;
    existing.updatedAt = new Date().toISOString();
    this.snapshot(existing.slug, author, `Status → ${status}`);
    return { ...existing };
  }

  remove(slug: string): void {
    this.articles.delete(slug.toLowerCase());
    this.revisionLog.delete(slug.toLowerCase());
  }

  revisions(slug: string): ArticleRevision[] {
    return [...(this.revisionLog.get(slug.toLowerCase()) ?? [])];
  }
}
