/**
 * Helper SEO blog: canonical, meta, Open Graph, JSON-LD.
 *
 * Blog tinggal di SUBDOMAIN (blog.ezrab.site) — semua URL publik memakai
 * getBlogBaseUrl(): indeks di `${base}/`, artikel di `${base}/${slug}`.
 *
 * Aturan:
 * - Canonical SELALU absolut, dari getBlogBaseUrl() kecuali artikel
 *   menetapkan `canonical` sendiri (harus absolut & http/https).
 * - JSON-LD hanya berisi data nyata dari artikel (tanpa rating/review
 *   karangan — sesuai kebijakan integritas).
 * - Semua fungsi murni & SSR-safe.
 */
import { getBlogBaseUrl, SITE_NAME } from './site';
import type { BlogArticle } from './types';

export const blogIndexUrl = (base: string = getBlogBaseUrl()) => `${base}/`;
export const articleUrl = (slug: string, base: string = getBlogBaseUrl()) =>
  `${base}/${slug}`;

export function articleCanonical(article: BlogArticle, base: string = getBlogBaseUrl()): string {
  const custom = (article.canonical || '').trim();
  if (/^https?:\/\//i.test(custom)) return custom;
  return articleUrl(article.slug, base);
}

export interface ArticleMeta {
  title: string;
  description: string;
  canonical: string;
  ogType: 'article';
  ogImage?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags: string[];
}

export function buildArticleMeta(article: BlogArticle, base: string = getBlogBaseUrl()): ArticleMeta {
  return {
    title: (article.seoTitle || article.title).trim(),
    description: (article.seoDescription || article.excerpt || article.title).trim().slice(0, 160),
    canonical: articleCanonical(article, base),
    ogType: 'article',
    ogImage: article.ogImage || article.cover || undefined,
    publishedTime: article.publishedAt || undefined,
    modifiedTime: article.updatedAt || undefined,
    section: article.category,
    tags: article.tags,
  };
}

/** JSON-LD BlogPosting — hanya data nyata dari artikel. */
export function blogPostingJsonLd(article: BlogArticle, base: string = getBlogBaseUrl()): Record<string, unknown> {
  const url = articleCanonical(article, base);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.excerpt,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: {
      '@type': 'Person',
      name: article.author.name,
      jobTitle: article.author.role,
    },
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    ...(article.cover || article.ogImage
      ? { image: [article.ogImage || article.cover] }
      : {}),
    inLanguage: 'id-ID',
    publisher: {
      '@type': 'Organization',
      name: 'EZRAB',
      url: base,
    },
  };
}

/**
 * JSON-LD BreadcrumbList untuk halaman artikel.
 * Di subdomain, breadcrumb cukup: indeks blog → artikel.
 */
export function breadcrumbJsonLd(article: BlogArticle, base: string = getBlogBaseUrl()): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: blogIndexUrl(base) },
      {
        '@type': 'ListItem',
        position: 2,
        name: article.title,
        item: articleCanonical(article, base),
      },
    ],
  };
}

/** Escape untuk penyisipan aman ke atribut/isi <head>. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Bangun string <head> lengkap untuk halaman artikel (dipakai prerender). */
export function articleHeadHtml(article: BlogArticle, base: string = getBlogBaseUrl()): string {
  const meta = buildArticleMeta(article, base);
  const e = escapeHtmlAttr;
  // Hindari duplikasi brand bila seoTitle sudah memuat "EZRAB".
  const fullTitle = /ezrab/i.test(meta.title) ? meta.title : `${meta.title} — ${SITE_NAME}`;
  const tags: string[] = [
    `<title>${e(fullTitle)}</title>`,
    `<meta name="description" content="${e(meta.description)}" />`,
    `<link rel="canonical" href="${e(meta.canonical)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${e(SITE_NAME)}" />`,
    `<meta property="og:title" content="${e(meta.title)}" />`,
    `<meta property="og:description" content="${e(meta.description)}" />`,
    `<meta property="og:url" content="${e(meta.canonical)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(meta.title)}" />`,
    `<meta name="twitter:description" content="${e(meta.description)}" />`,
  ];
  if (meta.ogImage) {
    tags.push(`<meta property="og:image" content="${e(meta.ogImage)}" />`);
  }
  if (meta.publishedTime) {
    tags.push(`<meta property="article:published_time" content="${e(meta.publishedTime)}" />`);
  }
  if (meta.modifiedTime) {
    tags.push(`<meta property="article:modified_time" content="${e(meta.modifiedTime)}" />`);
  }
  if (meta.section) {
    tags.push(`<meta property="article:section" content="${e(meta.section)}" />`);
  }
  for (const tag of meta.tags) {
    tags.push(`<meta property="article:tag" content="${e(tag)}" />`);
  }
  const jsonLd = [blogPostingJsonLd(article, base), breadcrumbJsonLd(article, base)]
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`)
    .join('\n');
  return `${tags.join('\n')}\n${jsonLd}`;
}

/** <head> untuk halaman indeks blog. */
export function blogIndexHeadHtml(base: string = getBlogBaseUrl()): string {
  const e = escapeHtmlAttr;
  const title = `${SITE_NAME} — Pengetahuan RAB & Estimasi Konstruksi`;
  const description =
    'Artikel panduan RAB, AHSP 2026 & harga satuan, teknik sipil, tutorial software & AI, dan manajemen proyek konstruksi dari tim EZRAB.';
  const url = blogIndexUrl(base);
  return [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(description)}" />`,
    `<link rel="canonical" href="${e(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(SITE_NAME)}" />`,
    `<meta property="og:title" content="${e(title)}" />`,
    `<meta property="og:description" content="${e(description)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
  ].join('\n');
}
