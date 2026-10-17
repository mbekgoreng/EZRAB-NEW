/**
 * Sitemap XML + robots.txt build-time untuk blog EZRAB.
 *
 * Blog tinggal di SUBDOMAIN (blog.ezrab.site) — output:
 *   dist/blog/sitemap.xml   (disajikan di blog.ezrab.site/sitemap.xml
 *                            via rewrite host di vercel.json)
 *   dist/blog/robots.txt    (disajikan di blog.ezrab.site/robots.txt)
 *
 * Sitemap HANYA memuat:
 *   - {blogBase}/          (indeks)
 *   - {blogBase}/<slug>    untuk artikel status 'published' dengan
 *     publishedAt <= now
 *
 * TIDAK PERNAH memuat: draft, review, scheduled (belum waktunya),
 * archived, halaman CMS (/app/blog), URL preview, atau URL pencarian.
 *
 * Dijalankan via `npm run build:blog` (setelah prerender).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MarkdownBlogRepository } from '../../src/blog/repository';
import { articleCanonical } from '../../src/blog/seo';
import { getBlogBaseUrl, SITE_NAME } from '../../src/blog/site';
import { loadAllArticles } from './loader';

const escapeXml = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

/**
 * Bangun daftar URL sitemap — HANYA artikel published & sudah waktunya.
 * Diekspor agar bisa diuji unit.
 */
export function buildSitemapEntries(
  repo: MarkdownBlogRepository,
  base: string,
  now: Date = new Date()
): SitemapEntry[] {
  const published = repo.listPublished(now);
  return [
    { loc: `${base}/`, changefreq: 'daily', priority: '0.8' },
    ...published.map((a) => ({
      loc: articleCanonical(a, base),
      lastmod: (a.updatedAt || a.publishedAt || '').slice(0, 10) || undefined,
      changefreq: 'weekly',
      priority: '0.7',
    })),
  ];
}

/** robots.txt khusus subdomain blog — disallow area non-publik. */
export function blogRobotsTxt(base: string): string {
  return (
    `# EZRAB Blog — robots.txt (subdomain ${base})\n` +
    `# Artikel publik BOLEH di-crawl. Sitemap absolut mengikuti VITE_BLOG_URL.\n\n` +
    `User-agent: *\n` +
    `Allow: /\n\n` +
    `Sitemap: ${base}/sitemap.xml\n`
  );
}

export function sitemapXml(entries: SitemapEntry[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (u) =>
          `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n` : '') +
          `    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n') +
    `\n</urlset>\n`
  );
}

function main(): void {
  const base = getBlogBaseUrl();
  const repo = new MarkdownBlogRepository(loadAllArticles());
  const entries = buildSitemapEntries(repo, base, new Date());
  const outDir = join(process.cwd(), 'dist', 'blog');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml(entries), 'utf8');
  writeFileSync(join(outDir, 'robots.txt'), blogRobotsTxt(base), 'utf8');
  console.log(
    `[blog:sitemap] OK — ${entries.length} URL (${entries.length - 1} artikel published) → dist/blog/sitemap.xml + dist/blog/robots.txt [${SITE_NAME}] [${base}]`
  );
}

main();
