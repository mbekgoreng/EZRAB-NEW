/**
 * Prerender build-time blog EZRAB.
 *
 * Dijalankan SETELAH `vite build` (lihat script npm `build:blog`):
 *   npm run build && npm run build:blog
 *
 * Menghasilkan:
 *   dist/blog/index.html            — halaman indeks (hanya artikel publik)
 *   dist/blog/<slug>/index.html     — tiap artikel publik
 *
 * Tiap file berisi HTML penuh hasil renderToString + <head> SEO per-halaman
 * (title, meta description, canonical, OG, JSON-LD) + blog.css di-inline.
 * File statis ini didahulukan Vercel atas rewrite SPA → crawler mendapat
 * konten asli tanpa JavaScript.
 *
 * Gagal eksplisit (exit 1) bila: konten tak bisa diparse, slug duplikat,
 * atau render gagal.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MarkdownBlogRepository } from '../../src/blog/repository';
import { setNodeDomWindow, slugify } from '../../src/blog/markdown';
import { articleHeadHtml, blogIndexHeadHtml } from '../../src/blog/seo';
import { getBlogBaseUrl, SITE_NAME } from '../../src/blog/site';
import { BlogIndexPage } from '../../src/blog/pages/BlogIndexPage';
import { BlogArticlePage } from '../../src/blog/pages/BlogArticlePage';
import type { BlogArticle } from '../../src/blog/types';
import { loadAllArticles } from './loader';

function shell(head: string, bodyHtml: string, css: string, langTitle: string): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="EZRAB Blog prerender" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@700;800&display=swap"
  rel="stylesheet"
/>
${head}
<style>${css}</style>
</head>
<body>
<div id="blog-root">${bodyHtml}</div>
<noscript><p style="font-family:system-ui;padding:24px">Aktifkan JavaScript untuk pengalaman interaktif penuh (${langTitle}).</p></noscript>
</body>
</html>
`;
}

function main(): void {
  // DOM untuk DOMPurify di Node.
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  setNodeDomWindow(dom.window as never);

  const articles = loadAllArticles();
  const seen = new Set<string>();
  for (const a of articles) {
    const key = a.slug.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`[blog:prerender] slug duplikat: "${a.slug}"`);
    }
    seen.add(key);
  }

  const repo = new MarkdownBlogRepository(articles);
  const now = new Date();
  const published = repo.listPublished(now);
  const base = getBlogBaseUrl();
  const css = readFileSync(join(process.cwd(), 'src', 'blog', 'blog.css'), 'utf8');
  const outDir = join(process.cwd(), 'dist', 'blog');

  // 1) Indeks
  const indexHtml = renderToString(React.createElement(BlogIndexPage, { repo }));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'index.html'),
    shell(blogIndexHeadHtml(base), indexHtml, css, SITE_NAME)
  );

  // 2) Tiap artikel publik
  let count = 0;
  for (const article of published) {
    const pageHtml = renderToString(
      React.createElement(BlogArticlePage, { article, repo })
    );
    const slugDir = join(outDir, slugify(article.slug));
    mkdirSync(slugDir, { recursive: true });
    writeFileSync(
      join(slugDir, 'index.html'),
      shell(articleHeadHtml(article, base), pageHtml, css, article.title)
    );
    count++;
  }

  // 3) Salin aset gambar blog → dist/blog/images/blog/ (cerminkan struktur
  //    public/). Di subdomain, rewrite host memetakan /images/blog/x →
  //    /blog/images/blog/x sehingga path absolut /images/… tetap valid.
  const imgSrc = join(process.cwd(), 'public', 'images', 'blog');
  if (existsSync(imgSrc)) {
    cpSync(imgSrc, join(outDir, 'images', 'blog'), { recursive: true });
  }

  // 4) Ringkasan untuk CI/log
  const summary = {
    base,
    generatedAt: now.toISOString(),
    totalArticles: articles.length,
    published,
    publishedCount: published.length,
    files: ['blog/index.html', ...published.map((a: BlogArticle) => `blog/${slugify(a.slug)}/index.html`)],
  };
  writeFileSync(join(outDir, 'prerender-summary.json'), JSON.stringify(summary, null, 2));

  console.log(
    `[blog:prerender] OK — ${articles.length} artikel total, ${count} published → dist/blog/`
  );
}

main();
