/**
 * Tests: EZRAB Blog (SEO Knowledge Hub & Blog CMS).
 *
 * Mencakup:
 *  1. Parsing frontmatter + validasi field wajib.
 *  2. Slug valid/tidak valid & 404 (getPublishedBySlug tak dikenal → undefined).
 *  3. Visibilitas status: draft / review / scheduled (belum & sudah waktunya)
 *     / published / archived.
 *  4. Otorisasi CMS: capability 'manage-blog' tidak dimiliki role demo manapun.
 *  5. Slug duplikat ditolak (repository & store).
 *  6. Sanitasi XSS pada render markdown (DOMPurify).
 *  7. Canonical & metadata (absolut, custom canonical, JSON-LD tanpa rating karangan).
 *  8. Sitemap hanya memuat artikel published yang sudah waktunya.
 *  9. TOC & waktu baca.
 * 10. Route /app/blog terdaftar; CTA mengarah ke paths.* yang valid.
 *
 * Pola tsx seperti test existing: export runBlogTestSuite() + direct runner.
 */
import { JSDOM } from 'jsdom';
import {
  buildArticle,
  extractToc,
  parseBlogFile,
  parseFrontmatter,
  readingMinutes,
  renderMarkdownSafe,
  resetPurifierForTest,
  setNodeDomWindow,
  slugify,
} from '../blog/markdown';
import { MarkdownBlogRepository } from '../blog/repository';
import {
  articleCanonical,
  articleHeadHtml,
  blogPostingJsonLd,
  buildArticleMeta,
} from '../blog/seo';
import { getBlogBaseUrl, getCanonicalBase } from '../blog/site';
import { isPubliclyVisible, type BlogArticle } from '../blog/types';
import { parseWorkspaceRoute, paths, routeLabel } from '../routing/routes';
import { ROLE_ACCOUNTS, roleHasCapability } from '../auth/roleAccounts';
import {
  ALLOWED_TRANSITIONS,
  BlogAdminValidationError,
  InMemoryBlogAdminStore,
  type ArticleInput,
} from '../blog/cms/store';
import { buildSitemapEntries, sitemapXml } from '../../scripts/blog/sitemap';

interface TestResult {
  success: boolean;
  logs: string[];
}

const NOW = new Date('2026-10-17T10:00:00+07:00');

function makeArticle(overrides: Partial<BlogArticle> = {}): BlogArticle {
  return {
    slug: 'artikel-contoh',
    title: 'Artikel Contoh',
    excerpt: 'Ringkasan contoh.',
    bodyMarkdown: '# Halo\n\nIsi artikel contoh.',
    category: 'Panduan RAB',
    tags: ['rab'],
    author: { name: 'Tim Editorial EZRAB', role: 'Editor' },
    status: 'published',
    publishedAt: '2026-10-10',
    updatedAt: '2026-10-12',
    readingMinutes: 3,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ArticleInput> = {}): ArticleInput {
  return {
    title: 'Judul Uji',
    slug: 'judul-uji',
    excerpt: 'Ringkasan.',
    bodyMarkdown: 'Isi **artikel** uji.',
    category: 'Panduan RAB',
    tags: ['rab'],
    authorName: 'Tester',
    authorRole: 'Editor',
    ...overrides,
  };
}

export function runBlogTestSuite(): TestResult {
  const logs: string[] = [];
  let pass = 0;
  let fail = 0;

  // DOM untuk DOMPurify di Node.
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  resetPurifierForTest();
  setNodeDomWindow(dom.window as never);

  const check = (name: string, fn: () => void) => {
    try {
      fn();
      pass++;
      logs.push(`PASS: ${name}`);
    } catch (e) {
      fail++;
      logs.push(`FAIL: ${name} — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const assert = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  // --- 1. Parsing frontmatter ---
  check('parseFrontmatter: key/value, list, boolean', () => {
    const { data, body } = parseFrontmatter(
      `---\ntitle: "Judul"\ntags: [a, b]\nfeatured: true\n---\n\nIsi body.`
    );
    assert(data.title === 'Judul', 'title');
    assert(Array.isArray(data.tags) && (data.tags as string[]).length === 2, 'tags');
    assert(data.featured === true, 'featured');
    assert(body.trim() === 'Isi body.', 'body');
  });

  check('parseBlogFile: field lengkap → BlogArticle', () => {
    const a = parseBlogFile(
      'cara-x.md',
      `---\ntitle: Cara X\nstatus: published\npublishedAt: "2026-10-10"\ncategory: Panduan RAB\ntags: [rab]\n---\n\n# Halo dunia`
    );
    assert(a.slug === 'cara-x', `slug=${a.slug}`);
    assert(a.status === 'published', 'status');
    assert(a.readingMinutes >= 1, 'readingMinutes');
  });

  check('parseBlogFile: tanpa title → throw', () => {
    let threw = false;
    try {
      parseBlogFile('rusak.md', `---\nstatus: draft\n---\n\nIsi`);
    } catch {
      threw = true;
    }
    assert(threw, 'harus throw untuk title kosong');
  });

  check('parseBlogFile: status tak dikenal → draft', () => {
    const a = parseBlogFile('s.md', `---\ntitle: T\nstatus: ngawur\n---\n\nIsi`);
    assert(a.status === 'draft', `status=${a.status}`);
  });

  check('buildArticle: Date dari gray-matter → string ISO', () => {
    const a = buildArticle('f.md', { title: 'T', publishedAt: new Date('2026-10-10T00:00:00Z') }, 'Isi');
    assert(a.publishedAt === '2026-10-10', `publishedAt=${a.publishedAt}`);
  });

  // --- 2. Slug ---
  check('slugify: normalisasi ID', () => {
    assert(slugify('Panduan RAB Rumah Tinggal!') === 'panduan-rab-rumah-tinggal', slugify('Panduan RAB Rumah Tinggal!'));
  });

  check('getPublishedBySlug: slug tak dikenal → undefined (404)', () => {
    const repo = new MarkdownBlogRepository([makeArticle()]);
    assert(repo.getPublishedBySlug('tidak-ada-slug-ini', NOW) === undefined, 'harus undefined');
  });

  check('getPublishedBySlug: case-insensitive', () => {
    const repo = new MarkdownBlogRepository([makeArticle({ slug: 'artikel-contoh' })]);
    assert(repo.getPublishedBySlug('Artikel-Contoh', NOW)?.slug === 'artikel-contoh', 'case-insensitive');
  });

  // --- 3. Visibilitas status ---
  check('visibility: published tampil', () => {
    assert(isPubliclyVisible(makeArticle({ status: 'published', publishedAt: '2026-10-10' }), NOW), 'published tampil');
  });
  check('visibility: draft/review/archived TIDAK tampil', () => {
    for (const s of ['draft', 'review', 'archived'] as const) {
      assert(!isPubliclyVisible(makeArticle({ status: s, publishedAt: '2026-10-10' }), NOW), `${s} bocor`);
    }
  });
  check('visibility: scheduled masa depan TIDAK tampil; lewat waktunya tetap butuh published', () => {
    const future = makeArticle({ status: 'scheduled', publishedAt: '2026-12-01', scheduledAt: '2026-12-01' });
    assert(!isPubliclyVisible(future, NOW), 'scheduled future bocor');
  });
  check('visibility: published tanpa publishedAt TIDAK tampil', () => {
    assert(!isPubliclyVisible(makeArticle({ status: 'published', publishedAt: undefined }), NOW), 'tanpa publishedAt bocor');
  });
  check('listPublished: hanya yang boleh publik', () => {
    const repo = new MarkdownBlogRepository([
      makeArticle({ slug: 'a-pub', status: 'published', publishedAt: '2026-10-10' }),
      makeArticle({ slug: 'a-draft', status: 'draft' }),
      makeArticle({ slug: 'a-sched', status: 'scheduled', scheduledAt: '2026-12-01', publishedAt: '2026-12-01' }),
      makeArticle({ slug: 'a-arch', status: 'archived', publishedAt: '2026-09-01' }),
    ]);
    const slugs = repo.listPublished(NOW).map((a) => a.slug);
    assert(slugs.length === 1 && slugs[0] === 'a-pub', `slugs=${JSON.stringify(slugs)}`);
  });

  // --- 4. Otorisasi CMS ---
  check("capability 'manage-blog' tidak dimiliki role demo manapun", () => {
    for (const role of ROLE_ACCOUNTS) {
      assert(!roleHasCapability(role.id, 'manage-blog'), `role ${role.id} punya manage-blog`);
    }
  });
  check("roleHasCapability: role tak dikenal → false", () => {
    assert(!roleHasCapability('bukan-role', 'manage-blog'), 'harus false');
  });

  // --- 5. Slug duplikat ---
  check('repository.isSlugTaken mendeteksi duplikat', () => {
    const repo = new MarkdownBlogRepository([makeArticle({ slug: 'sama' })]);
    assert(repo.isSlugTaken('sama'), 'duplikat tak terdeteksi');
    assert(!repo.isSlugTaken('beda'), 'false positive');
    assert(!repo.isSlugTaken('sama', 'sama'), 'exceptSlug gagal');
  });
  check('store.create: slug duplikat → BlogAdminValidationError', () => {
    const store = new InMemoryBlogAdminStore();
    store.create(makeInput({ slug: 'duplikat' }), 'tester');
    let threw = false;
    try {
      store.create(makeInput({ slug: 'Duplikat' }), 'tester');
    } catch (e) {
      threw = e instanceof BlogAdminValidationError;
    }
    assert(threw, 'duplikat harus ditolak');
  });
  check('store.create: field wajib kosong → error', () => {
    const store = new InMemoryBlogAdminStore();
    let threw = false;
    try {
      store.create(makeInput({ title: '', bodyMarkdown: '' }), 'tester');
    } catch (e) {
      threw = e instanceof BlogAdminValidationError && (e as BlogAdminValidationError).fields.includes('title');
    }
    assert(threw, 'validasi wajib gagal');
  });
  check('store: workflow draft→published butuh konfirmasi UI; transisi tercatat di revisi', () => {
    const store = new InMemoryBlogAdminStore();
    store.create(makeInput({ slug: 'wf-uji' }), 'tester');
    store.setStatus('wf-uji', 'review', 'tester');
    store.setStatus('wf-uji', 'published', 'tester');
    const a = store.get('wf-uji');
    assert(a?.status === 'published', 'status published');
    assert(!!a?.publishedAt, 'publishedAt terisi');
    assert(store.revisions('wf-uji').length >= 3, 'revisi tercatat');
  });
  check('store: transisi ilegal ditolak (published→review)', () => {
    const store = new InMemoryBlogAdminStore();
    store.create(makeInput({ slug: 'ilegal' }), 'tester');
    store.setStatus('ilegal', 'published', 'tester');
    let threw = false;
    try {
      store.setStatus('ilegal', 'review', 'tester');
    } catch (e) {
      threw = e instanceof BlogAdminValidationError;
    }
    assert(threw, 'transisi ilegal harus ditolak');
    assert(ALLOWED_TRANSITIONS.published.includes('archived'), 'published→archived diizinkan');
  });
  check('store: scheduled tanpa tanggal masa depan ditolak', () => {
    const store = new InMemoryBlogAdminStore();
    store.create(makeInput({ slug: 'sched-uji' }), 'tester');
    let threw = false;
    try {
      store.setStatus('sched-uji', 'scheduled', 'tester', { scheduledAt: '2020-01-01T00:00' });
    } catch {
      threw = true;
    }
    assert(threw, 'jadwal masa lalu harus ditolak');
  });

  // --- 6. Sanitasi XSS ---
  check('renderMarkdownSafe: <script> & event handler dihapus', () => {
    const html = renderMarkdownSafe(
      `# Judul\n\n<script>alert("xss")</script>\n\n<img src="x" onerror="alert(1)" />\n\n[klik](javascript:alert(2))`
    );
    assert(!/<script/i.test(html), 'script lolos');
    assert(!/onerror/i.test(html), 'onerror lolos');
    assert(!/javascript:/i.test(html), 'javascript: URL lolos');
    assert(/<h1/.test(html), 'heading hilang');
  });
  check('renderMarkdownSafe: markdown valid tetap dirender (tabel, link aman)', () => {
    const html = renderMarkdownSafe(`| A | B |\n|---|---|\n| 1 | 2 |\n\n[EZRAB](/app/estimate)`);
    assert(/<table/i.test(html), 'tabel hilang');
    assert(/href="\/app\/estimate"/.test(html), 'link internal hilang');
  });

  // --- 7. Canonical & metadata ---
  check('canonical: absolut dari base default', () => {
    const base = getCanonicalBase();
    assert(/^https?:\/\//.test(base), `base=${base}`);
    const c = articleCanonical(makeArticle({ slug: 'abc' }), 'https://contoh.id');
    assert(c === 'https://contoh.id/abc', `canonical=${c}`);
  });
  check('getBlogBaseUrl: default subdomain + override env', () => {
    assert(getBlogBaseUrl() === 'https://blog.ezrab.site', `default=${getBlogBaseUrl()}`);
    process.env.VITE_BLOG_URL = 'https://blog.contoh.id/';
    assert(getBlogBaseUrl() === 'https://blog.contoh.id', `override=${getBlogBaseUrl()}`);
    delete process.env.VITE_BLOG_URL;
    assert(getBlogBaseUrl() === 'https://blog.ezrab.site', 'fallback kembali');
  });
  check('canonical: custom absolut dihormati; relatif diabaikan', () => {
    assert(
      articleCanonical(makeArticle({ canonical: 'https://lain.id/x' }), 'https://b.id') === 'https://lain.id/x',
      'custom absolut'
    );
    assert(
      articleCanonical(makeArticle({ canonical: '/relatif' }), 'https://b.id') === 'https://b.id/artikel-contoh',
      'relatif harus diabaikan'
    );
  });
  check('buildArticleMeta: title/description terisi, description ≤160', () => {
    const m = buildArticleMeta(makeArticle({ seoTitle: '', seoDescription: '' }), 'https://b.id');
    assert(m.title === 'Artikel Contoh', 'title fallback');
    assert(m.description.length <= 160, 'description kepanjangan');
    assert(m.ogType === 'article', 'ogType');
  });
  check('JSON-LD BlogPosting: tanpa rating/review karangan', () => {
    const ld = blogPostingJsonLd(makeArticle(), 'https://b.id');
    const json = JSON.stringify(ld);
    assert(!/aggregateRating/i.test(json), 'aggregateRating karangan');
    assert(!/review/i.test(json), 'review karangan');
    assert((ld as { headline: string }).headline === 'Artikel Contoh', 'headline');
  });
  check('articleHeadHtml: judul tak duplikasi brand bila seoTitle sudah memuat EZRAB', () => {
    const head = articleHeadHtml(
      makeArticle({ slug: 'abc', seoTitle: 'Judul Kustom | EZRAB' }),
      'https://b.id'
    );
    const titleTag = head.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
    assert(titleTag === 'Judul Kustom | EZRAB', `title=${titleTag}`);
    const head2 = articleHeadHtml(makeArticle({ slug: 'abc', seoTitle: '' }), 'https://b.id');
    const titleTag2 = head2.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
    assert(titleTag2 === 'Artikel Contoh — EZRAB Blog', `title2=${titleTag2}`);
  });
  check('articleHeadHtml: memuat canonical + JSON-LD', () => {
    const head = articleHeadHtml(makeArticle({ slug: 'abc' }), 'https://b.id');
    assert(head.includes('<link rel="canonical" href="https://b.id/abc"'), 'canonical hilang');
    assert(head.includes('application/ld+json'), 'JSON-LD hilang');
    assert(head.includes('<meta property="og:type" content="article"'), 'OG hilang');
  });

  // --- 8. Sitemap ---
  check('sitemap: hanya published & sudah waktunya; tanpa draft/scheduled/archived', () => {
    const repo = new MarkdownBlogRepository([
      makeArticle({ slug: 'ok-1', status: 'published', publishedAt: '2026-10-10', updatedAt: '2026-10-12' }),
      makeArticle({ slug: 'draf', status: 'draft' }),
      makeArticle({ slug: 'jadwal', status: 'scheduled', scheduledAt: '2026-12-01', publishedAt: '2026-12-01' }),
      makeArticle({ slug: 'arsip', status: 'archived', publishedAt: '2026-09-01' }),
    ]);
    const entries = buildSitemapEntries(repo, 'https://b.id', NOW);
    const locs = entries.map((e) => e.loc);
    assert(locs.includes('https://b.id/'), 'indeks hilang');
    assert(locs.includes('https://b.id/ok-1'), 'artikel published hilang');
    assert(!locs.some((l) => l.includes('draf') || l.includes('jadwal') || l.includes('arsip')), 'non-published bocor');
    assert(!locs.some((l) => l.includes('/app/blog')), 'URL CMS bocor');
    const xml = sitemapXml(entries);
    assert(xml.includes('<urlset'), 'xml rusak');
  });

  // --- 9. TOC & waktu baca ---
  check('extractToc: h2/h3 dengan id', () => {
    const toc = extractToc(`# Abaikan\n\n## Bagian Satu\n\n### Sub Bagian\n\n## Bagian Dua`);
    assert(toc.length === 3, `toc=${toc.length}`);
    assert(toc[0].id === 'bagian-satu' && toc[0].depth === 2, 'id h2');
    assert(toc[1].depth === 3, 'h3');
  });
  check('readingMinutes: minimal 1', () => {
    assert(readingMinutes('hai') === 1, 'minimal 1');
    assert(readingMinutes('kata '.repeat(400)) === 2, '400 kata = 2 mnt');
  });

  // --- 10. Route & CTA ---
  check("parseWorkspaceRoute('/app/blog') → menu blog-admin", () => {
    const r = parseWorkspaceRoute('/app/blog');
    assert(r.menu === 'blog-admin' && r.status === 'ok', JSON.stringify(r));
    assert(paths.blogAdmin() === '/app/blog', 'paths.blogAdmin');
    assert(routeLabel(r) === 'Blog CMS', 'label');
  });
  check('CTA: paths fitur valid & diawali /app/', () => {
    for (const p of [paths.estimate(), paths.ahsp(), paths.qto(), paths.dedAiEstimate()]) {
      assert(p.startsWith('/app/'), `path tidak valid: ${p}`);
    }
  });

  logs.unshift(`[blog] ${pass} passed, ${fail} failed`);
  return { success: fail === 0, logs };
}

// Direct runner bila dieksekusi via tsx
const runtimeProcess =
  typeof globalThis !== 'undefined' ? (globalThis as { process?: { argv?: string[]; exit?: (c: number) => void } }).process : undefined;
if (runtimeProcess?.argv && runtimeProcess.argv[1]?.includes('blog.test')) {
  const result = runBlogTestSuite();
  console.log(result.logs.join('\n'));
  if (!result.success) {
    runtimeProcess.exit?.(1);
  }
}
