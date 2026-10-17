/**
 * Repository blog untuk SPA (client).
 *
 * Memuat semua markdown di content/blog/ via Vite import.meta.glob (?raw,
 * eager) lalu parse dengan parseBlogFile. Modul ini HANYA dipakai di
 * browser — JANGAN diimport dari scripts/blog/* (tsx tidak mengenal
 * import.meta.glob); script Node memakai loader fs sendiri.
 */
import { MarkdownBlogRepository, type BlogRepository } from './repository';
import { parseBlogFile } from './markdown';

let cached: BlogRepository | null = null;

export function getClientBlogRepository(): BlogRepository {
  if (cached) return cached;
  const modules = import.meta.glob('../../content/blog/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const articles = Object.entries(modules).map(([path, raw]) => parseBlogFile(path, raw));
  cached = new MarkdownBlogRepository(articles);
  return cached;
}

/** Reset cache — dipakai test. */
export function resetClientBlogRepositoryForTest(): void {
  cached = null;
}
