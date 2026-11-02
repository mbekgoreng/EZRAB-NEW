import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { ExactNavbar } from '../components/landing/exact/ExactNavbar';
import { ExactFooter } from '../components/landing/exact/ExactFooter';
import { FaqAccordion } from './FaqAccordion';
import {
  FAQ_CATEGORIES,
  FAQ_ITEMS,
  searchFaqs,
  buildFaqPageJsonLd,
} from './faqData';
import '../styles/faq.css';

interface FaqPageProps {
  onOpenAuth: (tab: 'masuk' | 'daftar') => void;
  onBackToLanding?: () => void;
  onOpenAbout?: () => void;
  onOpenAdvantages?: () => void;
}

const FAQ_PAGE_URL = 'https://ezrab.site/faq';
const FAQ_PAGE_DESCRIPTION =
  'Jawaban resmi EZRAB tentang RAB, AHSP 2026, Magic AI, QTO, ekspor laporan, paket, dan keamanan data — ditulis sesuai kondisi produk yang sebenarnya, termasuk status ketersediaan aplikasi saat ini.';
function upsertMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  const prev = el.getAttribute('content');
  el.setAttribute('content', content);
  return () => {
    if (prev === null) el?.remove();
    else el?.setAttribute('content', prev);
  };
}

/**
 * Halaman FAQ lengkap (/faq): hero + pencarian real-time + filter kategori
 * + akordeon aksesibel, seluruhnya dari dataset kanonis faqData.ts.
 * SEO: meta description, canonical, OG, dan JSON-LD FAQPage dipasang saat
 * halaman aktif dan dibersihkan saat keluar (SPA tanpa SSR).
 */
export const FaqPage: React.FC<FaqPageProps> = ({
  onOpenAuth,
  onBackToLanding,
  onOpenAbout,
  onOpenAdvantages,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('semua');

  useEffect(() => {
    const restores: Array<() => void> = [];
    restores.push(
      upsertMeta(
        'meta[name="description"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('name', 'description');
          return m;
        },
        FAQ_PAGE_DESCRIPTION
      )
    );
    restores.push(
      upsertMeta(
        'meta[property="og:title"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:title');
          return m;
        },
        'Pertanyaan Umum (FAQ) — EZRAB'
      )
    );
    restores.push(
      upsertMeta(
        'meta[property="og:description"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:description');
          return m;
        },
        FAQ_PAGE_DESCRIPTION
      )
    );
    restores.push(
      upsertMeta(
        'meta[property="og:url"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:url');
          return m;
        },
        FAQ_PAGE_URL
      )
    );

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const createdCanonical = !canonical;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    const prevCanonical = canonical.getAttribute('href');
    canonical.setAttribute('href', FAQ_PAGE_URL);

    const jsonLd = document.createElement('script');
    jsonLd.setAttribute('type', 'application/ld+json');
    jsonLd.id = 'faq-jsonld';
    jsonLd.textContent = JSON.stringify(buildFaqPageJsonLd(FAQ_ITEMS));
    document.head.appendChild(jsonLd);

    return () => {
      restores.forEach((fn) => fn());
      if (createdCanonical) canonical?.remove();
      else if (prevCanonical) canonical?.setAttribute('href', prevCanonical);
      jsonLd.remove();
    };
  }, []);

  const results = useMemo(() => searchFaqs(query, category), [query, category]);
  const searching = query.trim().length > 0;

  const groups = useMemo(
    () =>
      FAQ_CATEGORIES.map((cat) => ({
        cat,
        items: results.filter((f) => f.category === cat.id),
      })).filter((g) => g.items.length > 0),
    [results]
  );

  const resetSearch = () => {
    setQuery('');
    setCategory('semua');
  };

  return (
    <div className="faq-page">
      <ExactNavbar
        onOpenAuth={onOpenAuth}
        onBackToLanding={onBackToLanding}
        onOpenAbout={onOpenAbout}
        onOpenAdvantages={onOpenAdvantages}
      />
      <main className="faq-main">
        <section className="faq-hero">
          <span className="faq-eyebrow">Pusat Bantuan</span>
          <h1>Ada yang ingin kamu ketahui tentang EZRAB?</h1>
          <p className="faq-sub">
            Cari jawaban tentang RAB, AHSP 2026, Magic AI, sampai keamanan data. Semua
            jawaban ditulis sesuai kondisi EZRAB yang sebenarnya — termasuk fitur yang
            masih dalam tahap persiapan.
          </p>
          <form
            className="faq-search"
            role="search"
            onSubmit={(e) => e.preventDefault()}
          >
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari pertanyaan… misalnya: AHSP, ekspor PDF, harga"
              aria-label="Cari pertanyaan umum EZRAB"
            />
            {searching && (
              <button type="button" className="faq-clear" onClick={() => setQuery('')}>
                <X size={14} aria-hidden="true" /> Hapus
              </button>
            )}
          </form>
          <p className="faq-count" role="status">
            {searching || category !== 'semua'
              ? `Menampilkan ${results.length} dari ${FAQ_ITEMS.length} pertanyaan`
              : `${FAQ_ITEMS.length} pertanyaan dalam ${FAQ_CATEGORIES.length} kategori`}
          </p>
        </section>

        <nav className="faq-cats" aria-label="Kategori pertanyaan">
          <button
            type="button"
            className={`faq-chip${category === 'semua' ? ' on' : ''}`}
            aria-pressed={category === 'semua'}
            onClick={() => setCategory('semua')}
          >
            Semua Pertanyaan
          </button>
          {FAQ_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`faq-chip${category === cat.id ? ' on' : ''}`}
              aria-pressed={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </nav>

        {groups.map(({ cat, items }) => (
          <section className="faq-group" key={cat.id} aria-labelledby={`faq-cat-${cat.id}`}>
            <h2 id={`faq-cat-${cat.id}`}>{cat.label}</h2>
            <p className="faq-group-count">{items.length} pertanyaan</p>
            <FaqAccordion items={items} idPrefix={`faq-${cat.id}`} />
          </section>
        ))}

        {results.length === 0 && (
          <div className="faq-empty">
            <h2>Tidak ada pertanyaan yang cocok</h2>
            <p>
              Coba kata kunci yang lebih umum — misalnya "RAB", "AHSP", atau "AI" — atau
              jelajahi semua kategori dari awal.
            </p>
            <button type="button" className="faq-clear" onClick={resetSearch}>
              <X size={14} aria-hidden="true" /> Hapus pencarian &amp; filter
            </button>
          </div>
        )}

        <section className="faq-cta">
          <h2>Masih belum menemukan jawaban?</h2>
          <p>
            Hubungi tim EZRAB melalui kanal komunikasi resmi kami. Pengumuman fitur dan
            pembukaan akses diterbitkan pertama kali di Blog EZRAB.
          </p>
          <div className="faq-cta-row">
            <a
              className="primary"
              href="https://blog.ezrab.site"
              target="_blank"
              rel="noreferrer"
            >
              Baca Blog EZRAB <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a className="ghost" href="/fitur">
              Pelajari Fitur EZRAB
            </a>
          </div>
        </section>
      </main>
      <ExactFooter />
    </div>
  );
};
