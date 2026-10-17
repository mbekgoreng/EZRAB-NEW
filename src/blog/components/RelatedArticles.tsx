/** Blok artikel terkait di akhir halaman artikel. */
import React from 'react';
import type { BlogArticle } from '../types';
import { BlogCard } from './BlogCard';

export const RelatedArticles: React.FC<{ articles: BlogArticle[] }> = ({ articles }) => {
  if (articles.length === 0) return null;
  return (
    <section className="ezb-related" aria-label="Artikel terkait">
      <h2>Artikel Terkait</h2>
      <div className="ezb-grid">
        {articles.map((a) => (
          <BlogCard key={a.slug} article={a} />
        ))}
      </div>
    </section>
  );
};

export default RelatedArticles;
