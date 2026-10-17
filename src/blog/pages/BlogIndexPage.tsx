/**
 * Halaman indeks blog: navbar, hero + pencarian, layout konten + sidebar
 * (Kategori, Pilihan Editor), grid Artikel Terbaru + pagination,
 * newsletter, footer. SSR-safe: semua state diinisialisasi tanpa window.
 */
import React, { useMemo, useState } from 'react';
import { Search, ChevronRight, ArrowRight, BellRing } from 'lucide-react';
import type { BlogRepository } from '../repository';
import { BLOG_CATEGORIES } from '../types';
import { BlogNav, BlogFooter } from '../components/BlogHeader';
import { BlogCard, formatBlogDate } from '../components/BlogCard';
import { CategoryIcon } from '../components/categoryStyle';

const PAGE_SIZE = 9;

interface Props {
  repo: BlogRepository;
  initialCategory?: string;
  initialQuery?: string;
}

const Newsletter: React.FC = () => {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  return (
    <div className="ezb-newsletter" role="region" aria-label="Newsletter">
      <span className="ezb-newsletter-ic" aria-hidden="true">
        <BellRing size={24} />
      </span>
      <div className="ezb-newsletter-text">
        <h3>Ingin mendapatkan update artikel terbaru?</h3>
        <p>
          Berlangganan newsletter kami untuk mendapatkan informasi dan tips
          seputar konstruksi langsung ke email Anda.
        </p>
      </div>
      {done ? (
        <p className="ezb-newsletter-note" role="status">
          Terima kasih atas minatnya! Pendaftaran newsletter segera dibuka.
        </p>
      ) : (
        <form
          className="ezb-newsletter-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setDone(true);
          }}
        >
          <input
            type="email"
            required
            placeholder="Alamat email Anda"
            aria-label="Alamat email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="ezb-btn-primary">
            Berlangganan
          </button>
        </form>
      )}
    </div>
  );
};

export const BlogIndexPage: React.FC<Props> = ({ repo, initialCategory, initialQuery }) => {
  const [category, setCategory] = useState<string>(initialCategory || 'Semua');
  const [query, setQuery] = useState<string>(initialQuery || '');
  const [page, setPage] = useState<number>(1);

  const published = useMemo(() => repo.listPublished(), [repo]);
  const categories = useMemo(() => repo.publishedCategories(), [repo]);
  const editorsPicks = useMemo(() => {
    const feat = published.filter((a) => a.featured);
    const rest = published.filter((a) => !a.featured);
    return [...feat, ...rest].slice(0, 3);
  }, [published]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return published.filter((a) => {
      if (category !== 'Semua' && a.category !== category) return false;
      if (!q) return true;
      const hay = `${a.title} ${a.excerpt} ${a.category} ${a.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [published, category, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectCategory = (c: string) => {
    // Klik kategori aktif sekali lagi = reset ke Semua.
    setCategory((prev) => (prev === c ? 'Semua' : c));
    setPage(1);
  };
  const onSearch = (v: string) => {
    setQuery(v);
    setPage(1);
  };

  const categoryCount = (name: string) => categories.find((c) => c.name === name)?.count ?? 0;

  return (
    <div className="ezb-page">
      <BlogNav />

      <section className="ezb-hero">
        <div className="ezb-container">
          <div className="ezb-hero-grid">
            <div>
              <span className="ezb-eyebrow">Blog EZRAB</span>
              <h1>Pengetahuan Konstruksi untuk Proyek yang Lebih Baik</h1>
              <p className="ezb-lead">
                Artikel, panduan, dan tips seputar RAB, AHSP, QTO, dan teknologi
                konstruksi untuk membantu Anda bekerja lebih efisien dan akurat.
              </p>
              <div className="ezb-hero-search" role="search">
                <Search size={18} aria-hidden="true" />
                <input
                  id="cari"
                  type="search"
                  placeholder="Cari artikel tentang RAB, AHSP, QTO, dan lainnya…"
                  aria-label="Cari artikel"
                  value={query}
                  onChange={(e) => onSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="ezb-hero-media">
              <img
                src="/images/blog/hero-konstruksi.jpg"
                alt="Proyek konstruksi gedung bertingkat dengan tower crane, gambar kerja, dan helm keselamatan"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="ezb-container">
        <div className="ezb-layout">
          <main id="artikel-terbaru">
            <div className="ezb-section-head">
              <h2>Artikel Terbaru</h2>
              <a className="ezb-link-more" href="#artikel-terbaru">
                Lihat Semua <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>

            {pageItems.length === 0 ? (
              <div className="ezb-state" role="status">
                <h2>Tidak ada artikel ditemukan</h2>
                <p>
                  {published.length === 0
                    ? 'Belum ada artikel yang diterbitkan. Silakan kembali lagi nanti.'
                    : 'Coba kata kunci lain atau pilih kategori yang berbeda.'}
                </p>
                {(query || category !== 'Semua') && (
                  <button
                    type="button"
                    className="ezb-btn-ghost"
                    onClick={() => {
                      setQuery('');
                      setCategory('Semua');
                      setPage(1);
                    }}
                  >
                    Reset filter
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="ezb-grid">
                  {pageItems.map((a) => (
                    <BlogCard key={a.slug} article={a} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <nav className="ezb-pagination" aria-label="Navigasi halaman">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                      aria-label="Halaman sebelumnya"
                    >
                      ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-current={p === safePage ? 'page' : undefined}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                      aria-label="Halaman berikutnya"
                    >
                      ›
                    </button>
                  </nav>
                )}
              </>
            )}
          </main>

          <aside className="ezb-side" aria-label="Sidebar blog">
            <section className="ezb-widget" aria-label="Kategori">
              <h3>Kategori</h3>
              {BLOG_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="ezb-cat-row"
                  aria-pressed={category === c}
                  title={category === c ? 'Klik lagi untuk tampilkan semua' : `Filter: ${c}`}
                  onClick={() => selectCategory(c)}
                >
                  <CategoryIcon name={c} />
                  <span className="ezb-cat-name">{c}</span>
                  <span className="ezb-cat-count">{categoryCount(c)}</span>
                  <ChevronRight size={15} className="ezb-cat-chev" aria-hidden="true" />
                </button>
              ))}
            </section>

            {editorsPicks.length > 0 && (
              <section className="ezb-widget" aria-label="Pilihan editor">
                <h3>Pilihan Editor</h3>
                {editorsPicks.map((a, i) => (
                  <a key={a.slug} className="ezb-pop-item" href={`/${a.slug}`}>
                    <span className="ezb-pop-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="ezb-pop-title">{a.title}</span>
                    <ArrowRight size={15} className="ezb-pop-arrow" aria-hidden="true" />
                  </a>
                ))}
              </section>
            )}
          </aside>
        </div>

        <Newsletter />
      </div>

      <BlogFooter />
    </div>
  );
};

export default BlogIndexPage;
