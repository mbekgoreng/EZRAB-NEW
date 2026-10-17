/** Halaman 404 blog — dipakai SPA (/blog/:slug tak dikenal) & prerender. */
import React from 'react';
import { BlogHeader, BlogFooter } from '../components/BlogHeader';

export const BlogNotFound: React.FC<{ slug?: string }> = ({ slug }) => (
  <div className="ezb-page">
    <BlogHeader />
    <div className="ezb-container">
      <div className="ezb-404" role="alert">
        <h1>404</h1>
        <h2>Artikel tidak ditemukan</h2>
        <p>
          {slug ? (
            <>
              Tidak ada artikel dengan slug <code>“{slug}”</code>. Mungkin URL salah ketik
              atau artikel sudah diarsipkan.
            </>
          ) : (
            'Halaman yang Anda cari tidak tersedia atau sudah diarsipkan.'
          )}
        </p>
        <a className="ezb-btn" href="/">
          Kembali ke Blog
        </a>
      </div>
    </div>
    <BlogFooter />
  </div>
);

export default BlogNotFound;
