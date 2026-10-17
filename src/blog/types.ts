/**
 * Tipe inti EZRAB Blog.
 *
 * Catatan integritas data: BlogArticle TIDAK menyimpan angka harga AHSP/HSPK.
 * Seluruh contoh angka di body markdown wajib berlabel "Ilustrasi".
 */

export type BlogStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'archived';

/** 5 kategori editorial tetap (string persis — dipakai filter & sitemap). */
export const BLOG_CATEGORIES = [
  'Panduan RAB',
  'AHSP 2026 & Harga Satuan',
  'Teknik Sipil & Konstruksi',
  'Tutorial Software & AI',
  'Manajemen Proyek',
] as const;

export type BlogCategoryName = (typeof BLOG_CATEGORIES)[number];

export interface BlogAuthor {
  name: string;
  role: string;
  bio?: string;
}

export interface BlogArticle {
  /** Slug URL — unik, lowercase, tanpa spasi. */
  slug: string;
  title: string;
  excerpt: string;
  /** Body dalam Markdown (dirender aman via renderMarkdownSafe). */
  bodyMarkdown: string;
  category: string;
  tags: string[];
  author: BlogAuthor;
  cover?: string;
  status: BlogStatus;
  /** ISO date/datetime. publishedAt menentukan visibilitas publik. */
  publishedAt?: string;
  updatedAt: string;
  /** Tanggal jadwal terbit untuk status 'scheduled'. */
  scheduledAt?: string;
  /** SEO — default: seoTitle=title, seoDescription=excerpt bila kosong. */
  seoTitle?: string;
  seoDescription?: string;
  /** Canonical absolut opsional; default = canonical URL artikel. */
  canonical?: string;
  ogImage?: string;
  featured?: boolean;
  /** Varian CTA: 'rab' | 'ahsp' | 'qto' | 'ded' | 'general' (default). */
  cta?: string;
  /** Daftar sumber referensi artikel. */
  references?: string[];
  /** Menit baca — dihitung saat parse, bukan dari frontmatter. */
  readingMinutes: number;
}

export interface BlogTocItem {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** Satu revisi artikel di CMS (in-memory / DB kelak). */
export interface ArticleRevision {
  id: string;
  slug: string;
  savedAt: string;
  savedBy: string;
  note: string;
  snapshot: Omit<BlogArticle, 'readingMinutes'>;
}

/** True bila artikel boleh tampil di permukaan publik SEKARANG. */
export function isPubliclyVisible(article: BlogArticle, now: Date = new Date()): boolean {
  if (article.status !== 'published') return false;
  if (!article.publishedAt) return false;
  return new Date(article.publishedAt).getTime() <= now.getTime();
}
