/**
 * Tes regresi: kontrol blog statis & perbaikan navigasi (audit 2026-10-29).
 *
 * Mencakup:
 *  F2 — halaman indeks hasil prerender (renderToString + renderAllItems)
 *       dioperasikan oleh scripts/blog/client/blog-controls.js di JSDOM:
 *       filter kategori, pencarian (termasuk kata yang hanya ada di tag),
 *       pagination 12 artikel, empty-state + reset, newsletter jujur.
 *       Mode SPA (tanpa renderAllItems) tetap mem-slice 9 kartu pertama.
 *  F3 — ExactFooter memakai href '/#fitur' & '/#harga' (bukan '#…' polos).
 *  F5 — ikon cari BlogNav menuju './#cari'; kedatangan dengan #cari
 *       memfokuskan kolom cari indeks.
 *  F7 — label 'Lihat Semua' diganti 'Ke artikel terbaru'.
 *
 * Pola sama dengan blog.test.ts: export runBlogStaticControlsTestSuite()
 * + direct runner via tsx.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { MarkdownBlogRepository } from '../blog/repository';
import type { BlogArticle } from '../blog/types';
import { BlogIndexPage } from '../blog/pages/BlogIndexPage';
import { BlogNav } from '../blog/components/BlogHeader';
import { ExactFooter } from '../components/landing/exact/ExactFooter';

interface TestResult {
  success: boolean;
  logs: string[];
}

const makeArticle = (i: number, category: string, extra?: Partial<BlogArticle>): BlogArticle => ({
  slug: `artikel-uji-${String(i).padStart(2, '0')}`,
  title: `Artikel Uji ${String(i).padStart(2, '0')}`,
  excerpt: `Ringkasan artikel uji nomor ${i}.`,
  bodyMarkdown: '',
  category,
  tags: ['uji'],
  author: { name: 'Tim EZRAB', role: 'Editor' },
  status: 'published',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  readingMinutes: 5,
  ...extra,
});

function buildRepo(): MarkdownBlogRepository {
  const articles: BlogArticle[] = [];
  for (let i = 1; i <= 5; i++) articles.push(makeArticle(i, 'Panduan RAB'));
  for (let i = 6; i <= 9; i++) articles.push(makeArticle(i, 'AHSP 2026 & Harga Satuan'));
  for (let i = 10; i <= 12; i++) articles.push(makeArticle(i, 'Teknik Sipil & Konstruksi'));
  // Kata unik hanya di judul (untuk tes pencarian teks).
  articles[0] = makeArticle(1, 'Panduan RAB', { title: 'Panduan Sloof Beton Bertulang' });
  // Kata unik hanya di tag (membuktikan data-search setara haystack React).
  articles[5] = makeArticle(6, 'AHSP 2026 & Harga Satuan', { tags: ['koefisien-xyz'] });
  return new MarkdownBlogRepository(articles);
}

export async function runBlogStaticControlsTestSuite(): Promise<TestResult> {
  const logs: string[] = [];
  let pass = 0;
  let fail = 0;
  const assert = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(msg);
  };
  const check = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
    try {
      await fn();
      pass += 1;
      logs.push(`  ✓ ${name}`);
    } catch (err) {
      fail += 1;
      logs.push(`  ✗ ${name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const repo = buildRepo();
  const controlsSrc = readFileSync(
    join(process.cwd(), 'scripts', 'blog', 'client', 'blog-controls.js'),
    'utf8'
  );

  const renderIndex = (renderAll: boolean): string =>
    renderToString(
      React.createElement(BlogIndexPage, { repo, renderAllItems: renderAll })
    );

  const loadStaticIndex = async (url: string): Promise<JSDOM> => {
    const dom = new JSDOM(`<!doctype html><html><body>${renderIndex(true)}</body></html>`, {
      url,
      pretendToBeVisual: true,
      runScripts: 'dangerously',
    });
    // Tunggu readyState 'complete' agar init script berjalan tepat sekali.
    await new Promise((r) => setTimeout(r, 30));
    const script = dom.window.document.createElement('script');
    script.textContent = controlsSrc;
    dom.window.document.body.appendChild(script);
    return dom;
  };

  const visibleCards = (dom: JSDOM): number =>
    Array.from(dom.window.document.querySelectorAll('.ezb-card')).filter(
      (c) => !(c as HTMLElement).hidden
    ).length;

  const clickCategory = (dom: JSDOM, name: string): void => {
    const row = Array.from(dom.window.document.querySelectorAll('.ezb-cat-row')).find(
      (b) => b.querySelector('.ezb-cat-name')?.textContent?.trim() === name
    ) as HTMLElement | undefined;
    assert(!!row, `baris kategori tidak ditemukan: ${name}`);
    row!.click();
  };

  const setSearch = (dom: JSDOM, value: string): void => {
    const input = dom.window.document.getElementById('cari') as HTMLInputElement;
    assert(!!input, 'kolom cari #cari tidak ditemukan');
    input.value = value;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };

  // --- Markup prerender ---
  await check('F2: renderAllItems me-render semua 12 kartu; mode SPA tetap 9', () => {
    const all = renderIndex(true);
    const spa = renderIndex(false);
    assert((all.match(/ezb-card"/g) || []).length >= 12, 'renderAll harus ≥12 kartu');
    assert((spa.match(/ezb-card"/g) || []).length === 9, 'SPA harus tepat 9 kartu (halaman 1)');
    assert(all.includes('data-category="Panduan RAB"'), 'data-category hilang');
    assert(all.includes('koefisien-xyz'), 'data-search harus memuat tag');
  });

  // --- Perilaku kontrol statis ---
  await check('F2: pagination statis — halaman 1 = 9 kartu, halaman 2 = 3 kartu', async () => {
    const dom = await loadStaticIndex('https://blog.ezrab.site/blog/');
    assert(visibleCards(dom) === 9, `halaman 1 harus 9, dapat ${visibleCards(dom)}`);
    const nav = dom.window.document.querySelector('.ezb-pagination') as HTMLElement;
    assert(!!nav && !nav.hidden, 'pagination harus terlihat untuk 12 artikel');
    const page2 = Array.from(nav.querySelectorAll('button')).find(
      (b) => b.textContent === '2'
    ) as HTMLElement;
    assert(!!page2, 'tombol halaman 2 tidak ada');
    page2.click();
    assert(visibleCards(dom) === 3, `halaman 2 harus 3, dapat ${visibleCards(dom)}`);
  });

  await check('F2: filter kategori statis menyaring + toggle reset + aria-pressed', async () => {
    const dom = await loadStaticIndex('https://blog.ezrab.site/blog/');
    clickCategory(dom, 'Panduan RAB');
    assert(visibleCards(dom) === 5, `Panduan RAB harus 5, dapat ${visibleCards(dom)}`);
    const row = Array.from(dom.window.document.querySelectorAll('.ezb-cat-row')).find(
      (b) => b.querySelector('.ezb-cat-name')?.textContent?.trim() === 'Panduan RAB'
    );
    assert(row?.getAttribute('aria-pressed') === 'true', 'aria-pressed aktif harus true');
    const nav = dom.window.document.querySelector('.ezb-pagination') as HTMLElement;
    assert(nav.hidden, 'pagination harus sembunyi saat hasil ≤ 1 halaman');
    clickCategory(dom, 'Panduan RAB');
    assert(visibleCards(dom) === 9, 'klik ulang kategori aktif harus reset ke Semua');
  });

  await check('F2: pencarian statis — teks judul & kata khusus tag', async () => {
    const dom = await loadStaticIndex('https://blog.ezrab.site/blog/');
    setSearch(dom, 'sloof');
    assert(visibleCards(dom) === 1, `cari 'sloof' harus 1, dapat ${visibleCards(dom)}`);
    setSearch(dom, 'koefisien-xyz');
    assert(visibleCards(dom) === 1, `cari tag harus 1, dapat ${visibleCards(dom)}`);
  });

  await check('F2: empty-state muncul saat tak ada hasil + tombol Reset bekerja', async () => {
    const dom = await loadStaticIndex('https://blog.ezrab.site/blog/');
    setSearch(dom, 'kata-yang-pasti-tidak-ada');
    assert(visibleCards(dom) === 0, 'semua kartu harus tersembunyi');
    const state = dom.window.document.querySelector('.ezb-state') as HTMLElement | null;
    assert(!!state && !state.hidden, 'empty-state harus tampil');
    const reset = state!.querySelector('button') as HTMLElement;
    assert(!!reset, 'tombol Reset filter harus ada');
    reset.click();
    assert(visibleCards(dom) === 9, 'setelah reset harus kembali 9 kartu');
  });

  await check('F2: newsletter statis — submit menampilkan pesan jujur, tanpa klaim sukses', async () => {
    const dom = await loadStaticIndex('https://blog.ezrab.site/blog/');
    const form = dom.window.document.querySelector('.ezb-newsletter-form') as HTMLFormElement;
    assert(!!form, 'form newsletter tidak ditemukan');
    const email = form.querySelector('input[type="email"]') as HTMLInputElement;
    email.value = 'uji@contoh.id';
    form.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true })
    );
    const note = dom.window.document.querySelector('.ezb-newsletter-note');
    assert(!!note, 'pesan status newsletter harus muncul');
    assert(
      (note!.textContent || '').includes('Pendaftaran newsletter segera dibuka'),
      'pesan harus jujur (segera dibuka)'
    );
    assert(
      !(note!.textContent || '').toLowerCase().includes('berhasil'),
      'pesan tidak boleh mengklaim berhasil'
    );
  });

  await check('F5: tiba di indeks dengan #cari memfokuskan kolom cari', async () => {
    const dom = await loadStaticIndex('https://blog.ezrab.site/blog/#cari');
    assert(
      dom.window.document.activeElement?.id === 'cari',
      `#cari harus fokus, aktif: ${dom.window.document.activeElement?.id || '(tidak ada)'}`
    );
  });

  // --- Markup navigasi ---
  await check("F5: ikon cari BlogNav memakai './#cari', bukan '#cari' polos", () => {
    const html = renderToString(React.createElement(BlogNav));
    assert(html.includes('href="./#cari"'), "href harus './#cari'");
    assert(!html.includes('href="#cari"'), "href '#cari' polos tidak boleh ada");
  });

  await check("F3: footer memakai '/#fitur' & '/#harga' dengan handler, bukan '#…' polos", () => {
    const html = renderToString(React.createElement(ExactFooter));
    assert(html.includes('href="/#fitur"'), "href '/#fitur' harus ada");
    assert(html.includes('href="/#harga"'), "href '/#harga' harus ada");
    assert(!html.includes('href="#fitur"'), "href '#fitur' polos tidak boleh ada");
    assert(!html.includes('href="#harga"'), "href '#harga' polos tidak boleh ada");
  });

  await check("F7: label 'Lihat Semua' diganti 'Ke artikel terbaru'", () => {
    const html = renderIndex(true);
    assert(html.includes('Ke artikel terbaru'), 'label baru harus ada');
    assert(!html.includes('Lihat Semua'), "label 'Lihat Semua' tidak boleh ada");
  });

  await check('F2: prerender menyalin blog-controls.js & menyuntik ./blog.js ke indeks', () => {
    const src = readFileSync(join(process.cwd(), 'scripts', 'blog', 'prerender.ts'), 'utf8');
    assert(src.includes('blog-controls.js'), 'prerender harus menyalin blog-controls.js');
    assert(src.includes("'./blog.js'"), "shell indeks harus memuat './blog.js'");
    assert(src.includes('renderAllItems: true'), 'prerender indeks harus renderAllItems');
  });

  logs.unshift(`[blog-static] ${pass} passed, ${fail} failed`);
  return { success: fail === 0, logs };
}

// Direct runner bila dieksekusi via tsx
const runtimeProcess =
  typeof globalThis !== 'undefined'
    ? (globalThis as { process?: { argv?: string[]; exit?: (c: number) => void } }).process
    : undefined;
if (runtimeProcess?.argv && runtimeProcess.argv[1]?.includes('blogStaticControls.test')) {
  void runBlogStaticControlsTestSuite().then((result) => {
    console.log(result.logs.join('\n'));
    if (!result.success) runtimeProcess.exit?.(1);
  });
}
