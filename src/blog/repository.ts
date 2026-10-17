/**
 * Abstraksi BlogRepository — sumber konten blog.
 *
 * Implementasi saat ini: MarkdownBlogRepository (markdown di content/blog/).
 * Kelak bisa diganti SupabaseBlogRepository tanpa mengubah halaman.
 *
 * Aturan visibilitas publik TERPUSAT di sini:
 * - hanya status 'published' + publishedAt <= now yang keluar dari
 *   metode *Published* (dipakai halaman publik, prerender, sitemap).
 * - draft / review / scheduled (belum waktunya) / archived TIDAK PERNAH
 *   bocor ke publik.
 */
import { isPubliclyVisible, type BlogArticle } from './types';

export interface BlogRepository {
  /** Semua artikel (termasuk non-publik) — untuk CMS/admin. */
  listAll(): BlogArticle[];
  /** Hanya artikel yang boleh tampil publik sekarang, terbaru dulu. */
  listPublished(now?: Date): BlogArticle[];
  /** Artikel apapun berdasarkan slug (CMS). */
  getBySlug(slug: string): BlogArticle | undefined;
  /** Artikel publik berdasarkan slug (halaman publik & prerender). */
  getPublishedBySlug(slug: string, now?: Date): BlogArticle | undefined;
  /** Artikel publik terkait: kategori sama dulu, lalu tag beririsan. */
  related(article: BlogArticle, limit?: number, now?: Date): BlogArticle[];
  /** Daftar kategori yang punya artikel publik + jumlahnya. */
  publishedCategories(now?: Date): { name: string; count: number }[];
  /** True bila slug sudah dipakai artikel lain (validasi CMS). */
  isSlugTaken(slug: string, exceptSlug?: string): boolean;
}

const normalizeSlug = (slug: string) => slug.trim().toLowerCase();

const byNewest = (a: BlogArticle, b: BlogArticle) =>
  new Date(b.publishedAt || b.updatedAt).getTime() - new Date(a.publishedAt || a.updatedAt).getTime();

export class MarkdownBlogRepository implements BlogRepository {
  private readonly articles: BlogArticle[];

  constructor(articles: BlogArticle[]) {
    // Pertahankan urutan deterministik: terbaru dulu.
    this.articles = [...articles].sort(byNewest);
  }

  listAll(): BlogArticle[] {
    return [...this.articles];
  }

  listPublished(now: Date = new Date()): BlogArticle[] {
    return this.articles.filter((a) => isPubliclyVisible(a, now));
  }

  getBySlug(slug: string): BlogArticle | undefined {
    const target = normalizeSlug(slug);
    return this.articles.find((a) => normalizeSlug(a.slug) === target);
  }

  getPublishedBySlug(slug: string, now: Date = new Date()): BlogArticle | undefined {
    const article = this.getBySlug(slug);
    return article && isPubliclyVisible(article, now) ? article : undefined;
  }

  related(article: BlogArticle, limit: number = 3, now: Date = new Date()): BlogArticle[] {
    const pool = this.listPublished(now).filter((a) => a.slug !== article.slug);
    const scored = pool.map((a) => {
      let score = 0;
      if (a.category === article.category) score += 10;
      const sharedTags = a.tags.filter((t) => article.tags.includes(t)).length;
      score += sharedTags * 3;
      return { a, score };
    });
    return scored
      .sort((x, y) => y.score - x.score || byNewest(x.a, y.a))
      .slice(0, limit)
      .map((s) => s.a);
  }

  publishedCategories(now: Date = new Date()): { name: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const a of this.listPublished(now)) {
      counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  }

  isSlugTaken(slug: string, exceptSlug?: string): boolean {
    const target = normalizeSlug(slug);
    return this.articles.some(
      (a) => normalizeSlug(a.slug) === target && (!exceptSlug || normalizeSlug(a.slug) !== normalizeSlug(exceptSlug))
    );
  }
}
