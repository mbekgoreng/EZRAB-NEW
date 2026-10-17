/**
 * Parsing & rendering konten blog.
 *
 * - `parseBlogFile`: frontmatter (parser mini tanpa dependensi — aman di
 *   browser bundle) + body markdown → BlogArticle.
 * - `renderMarkdownSafe`: marked → DOMPurify. WAJIB dipakai untuk SEMUA
 *   HTML artikel sebelum disuntik via dangerouslySetInnerHTML.
 * - SSR-safe: tidak ada akses window/document di module scope. DOMPurify
 *   butuh DOM — di browser pakai window; di Node (prerender/test) teruskan
 *   `domWindow` dari jsdom.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  BLOG_CATEGORIES,
  type BlogArticle,
  type BlogStatus,
  type BlogTocItem,
} from './types';

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'artikel';

/** Parser frontmatter mini: `key: value`, list `[a, b]` atau `- item`. */
export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, fm, body] = match;
  const data: Record<string, unknown> = {};
  const lines = fm.split(/\r?\n/);
  let currentListKey: string | null = null;
  for (const line of lines) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentListKey) {
      (data[currentListKey] as unknown[]).push(parseScalar(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!kv) {
      currentListKey = null;
      continue;
    }
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value === '' || value === '~' || value.toLowerCase() === 'null') {
      data[key] = undefined;
      currentListKey = null;
    } else if (value === '|' || value === '>') {
      data[key] = '';
      currentListKey = null;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => parseScalar(s.trim()))
        .filter((s) => s !== '');
      currentListKey = null;
    } else if (value === '') {
      data[key] = [];
      currentListKey = key;
    } else {
      data[key] = parseScalar(value);
      currentListKey = null;
    }
  }
  return { data, body };
}

function parseScalar(value: string): unknown {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  const num = Number(v);
  if (v !== '' && !Number.isNaN(num)) return num;
  return v;
}

const VALID_STATUSES: BlogStatus[] = ['draft', 'review', 'scheduled', 'published', 'archived'];

const asString = (v: unknown, fallback = ''): string => {
  if (typeof v === 'string') return v;
  // gray-matter mengubah tanggal YAML tak dikutip menjadi Date.
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
};

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ');
  return text.split(/\s+/).filter(Boolean).length;
}

export const readingMinutes = (markdown: string): number =>
  Math.max(1, Math.round(countWords(markdown) / 200));

/** Ubah path file → slug default (nama file tanpa .md). */
export const slugFromPath = (path: string): string => {
  const base = path.split('/').pop() || path;
  return slugify(base.replace(/\.md$/i, ''));
};

/**
 * Bangun BlogArticle dari data frontmatter yang sudah diparse.
 * Dipakai parseBlogFile (parser mini) dan script Node (gray-matter) —
 * satu-satunya tempat mapping frontmatter → BlogArticle.
 */
export function buildArticle(
  path: string,
  data: Record<string, unknown>,
  body: string
): BlogArticle {
  const title = asString(data.title).trim();
  if (!title) {
    throw new Error(`[blog] ${path}: frontmatter 'title' wajib diisi`);
  }
  const statusRaw = asString(data.status, 'draft').trim().toLowerCase();
  const status: BlogStatus = (VALID_STATUSES as string[]).includes(statusRaw)
    ? (statusRaw as BlogStatus)
    : 'draft';
  const category = asString(data.category).trim() || 'Panduan RAB';
  const now = new Date().toISOString().slice(0, 10);
  const publishedAt = asString(data.publishedAt).trim() || undefined;
  const article: BlogArticle = {
    slug: asString(data.slug).trim() ? slugify(asString(data.slug)) : slugFromPath(path),
    title,
    excerpt: asString(data.excerpt).trim(),
    bodyMarkdown: body.trim(),
    category,
    tags: asStringArray(data.tags),
    author: {
      name: asString(data.author, 'Tim Editorial EZRAB').trim(),
      role: asString(data.authorRole, 'Editor').trim(),
      bio: asString(data.authorBio).trim() || undefined,
    },
    cover: asString(data.cover).trim() || undefined,
    status,
    publishedAt,
    updatedAt: asString(data.updatedAt).trim() || publishedAt || now,
    scheduledAt: asString(data.scheduledAt).trim() || undefined,
    seoTitle: asString(data.seoTitle).trim() || undefined,
    seoDescription: asString(data.seoDescription).trim() || undefined,
    canonical: asString(data.canonical).trim() || undefined,
    ogImage: asString(data.ogImage).trim() || undefined,
    featured: data.featured === true,
    cta: asString(data.cta).trim() || undefined,
    references: asStringArray(data.references).length > 0 ? asStringArray(data.references) : undefined,
    readingMinutes: readingMinutes(body),
  };
  return article;
}

/**
 * Parse satu file markdown blog → BlogArticle (parser mini, untuk client).
 * Dilempar jika field wajib (title) hilang.
 */
export function parseBlogFile(path: string, raw: string): BlogArticle {
  const { data, body } = parseFrontmatter(raw);
  return buildArticle(path, data, body);
}

// ---------------------------------------------------------------------------
// Rendering aman
// ---------------------------------------------------------------------------

type DomWindow = {
  document: unknown;
} & Record<string, unknown>;

let purifier: { sanitize: (html: string, opts?: unknown) => string } | null = null;

/**
 * Daftarkan DOM window untuk lingkungan Node (prerender/test via jsdom).
 * Dipanggil sekali oleh scripts/blog/prerender.ts sebelum render.
 */
let nodeDomWindow: DomWindow | undefined;
export function setNodeDomWindow(win: DomWindow | undefined): void {
  nodeDomWindow = win;
  purifier = null;
}

function getPurifier(domWindow?: DomWindow) {
  if (purifier) return purifier;
  const win =
    domWindow ??
    nodeDomWindow ??
    (typeof window !== 'undefined' ? (window as unknown as DomWindow) : undefined);
  if (!win) {
    throw new Error(
      '[blog] DOM tidak tersedia untuk sanitasi — teruskan domWindow (jsdom) di Node.'
    );
  }
  purifier = DOMPurify(win as never) as unknown as {
    sanitize: (html: string, opts?: unknown) => string;
  };
  return purifier;
}

/** Reset cache purifier — dipakai test agar tiap test bisa injeksi jsdom baru. */
export function resetPurifierForTest(): void {
  purifier = null;
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, '');

let markedConfigured = false;
function ensureMarkedConfigured(): void {
  if (markedConfigured) return;
  markedConfigured = true;
  marked.use({
    renderer: {
      // Tambah id anchor ke heading agar TOC bisa link ke bagian artikel.
      heading({ tokens, depth }: { tokens: unknown[]; depth: number }) {
        const inner = (this as { parser: { parseInline: (t: unknown[]) => string } }).parser.parseInline(tokens);
        const id = slugify(stripTags(inner));
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
    },
  });
}

/**
 * Render markdown → HTML yang sudah disanitasi DOMPurify.
 * Aman dipanggil di browser maupun Node (dengan domWindow dari jsdom).
 */
export function renderMarkdownSafe(markdown: string, domWindow?: DomWindow): string {
  ensureMarkedConfigured();
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return getPurifier(domWindow).sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });
}

/** Ambil daftar isi (h2/h3) dari markdown. */
export function extractToc(markdown: string): BlogTocItem[] {
  ensureMarkedConfigured();
  const tokens = marked.lexer(markdown);
  const items: BlogTocItem[] = [];
  for (const token of tokens) {
    if (token.type === 'heading' && (token.depth === 2 || token.depth === 3)) {
      const text = stripTags(token.text).trim();
      if (!text) continue;
      items.push({ id: slugify(text), text, depth: token.depth as 2 | 3 });
    }
  }
  return items;
}

/** Validasi kategori termasuk dalam 5 kategori editorial (peringatan saja). */
export function isKnownCategory(category: string): boolean {
  return (BLOG_CATEGORIES as readonly string[]).includes(category);
}
