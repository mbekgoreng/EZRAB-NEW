/**
 * Navigasi & footer publik blog — SSR-safe (tanpa window di render path).
 *
 * Blog tinggal di subdomain (blog.ezrab.site): link ke aplikasi utama
 * (Beranda, Fitur, Harga, Masuk, Coba Gratis) memakai URL absolut domain
 * utama via getCanonicalBase().
 */
import React from 'react';
import { Search } from 'lucide-react';
import { getCanonicalBase } from '../site';

export const BlogNav: React.FC = () => {
  const main = getCanonicalBase();
  return (
    <header className="ezb-nav">
      <div className="ezb-nav-inner">
        <a className="ezb-nav-brand" href="/" aria-label="EZRAB Blog — Beranda">
          <span className="ezb-nav-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 20V8l8-4 8 4v12h-5v-6H9v6H4z"
                fill="currentColor"
                opacity="0.95"
              />
            </svg>
          </span>
          <span>EZRAB</span>
        </a>
        <nav className="ezb-nav-links" aria-label="Navigasi utama">
          <a href={main}>Beranda</a>
          <a href={`${main}/fitur`}>Fitur</a>
          <a href={`${main}/#harga`}>Harga</a>
          <a href="/" aria-current="page">
            Blog
          </a>
        </nav>
        <div className="ezb-nav-actions">
          <a className="ezb-nav-search" href="#cari" aria-label="Cari artikel">
            <Search size={18} />
          </a>
          <a className="ezb-btn-outline" href={`${main}/masuk`}>
            Masuk
          </a>
          <a className="ezb-btn-primary" href={`${main}/daftar`}>
            Coba Gratis
          </a>
        </div>
      </div>
    </header>
  );
};

/** Alias lama — dipertahankan agar impor existing tidak rusak. */
export const BlogHeader: React.FC = BlogNav;

export const BlogFooter: React.FC = () => {
  const main = getCanonicalBase();
  return (
    <footer className="ezb-footer">
      <div className="ezb-footer-inner">
        <span>© 2026 EZRAB — Platform AI untuk RAB &amp; estimasi konstruksi.</span>
        <span>
          <a href="/">Blog</a>
          <a href={`${main}/fitur`}>Fitur</a>
          <a href={main}>Beranda</a>
        </span>
      </div>
    </footer>
  );
};

export default BlogNav;
