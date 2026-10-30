/**
 * Kartu artikel untuk indeks & artikel terkait.
 * Cover: pakai `article.cover` bila ada, jika tidak gradien kategori.
 */
import React from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import type { BlogArticle } from '../types';
import { CategoryBadge, categoryStyle } from './categoryStyle';

export const formatBlogDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const BlogCard: React.FC<{ article: BlogArticle }> = ({ article }) => {
  const style = categoryStyle(article.category);
  // data-category & data-search: dipakai kontrol statis blog
  // (scripts/blog/client/blog-controls.js) untuk menyaring kartu di DOM
  // hasil prerender — haystack sama dengan filter React di BlogIndexPage.
  const searchHaystack =
    `${article.title} ${article.excerpt} ${article.category} ${article.tags.join(' ')}`.toLowerCase();
  // Link relatif (./slug): benar di subdomain (/) maupun path /blog/ (preview/domain utama).
  return (
    <a
      className="ezb-card"
      href={`./${article.slug}`}
      data-category={article.category}
      data-search={searchHaystack}
    >
      <div className="ezb-card-cover" role="img" aria-label={`Ilustrasi: ${article.category}`}>
        {article.cover ? (
          <img src={article.cover} alt="" loading="lazy" />
        ) : (
          <div className="ezb-card-cover-fallback" style={{ background: style.gradient }} aria-hidden="true" />
        )}
      </div>
      <div className="ezb-card-body">
        <CategoryBadge name={article.category} />
        <h3>{article.title}</h3>
        <p>{article.excerpt}</p>
        <div className="ezb-meta">
          <span className="ezb-meta-item">
            <CalendarDays size={13} aria-hidden="true" />
            {formatBlogDate(article.publishedAt)}
          </span>
          <span className="ezb-meta-item">
            <Clock3 size={13} aria-hidden="true" />
            {article.readingMinutes} menit baca
          </span>
        </div>
      </div>
    </a>
  );
};

export default BlogCard;
