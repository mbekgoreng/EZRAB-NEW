/**
 * Halaman artikel (/blog/:slug): breadcrumb, TOC, waktu baca, profil
 * penulis, tanggal publikasi/pembaruan, referensi, artikel terkait, CTA.
 * SSR-safe.
 */
import React, { useMemo } from 'react';
import type { BlogArticle } from '../types';
import type { BlogRepository } from '../repository';
import { extractToc } from '../markdown';
import { BlogNav, BlogFooter } from '../components/BlogHeader';
import { Breadcrumb } from '../components/Breadcrumb';
import { MarkdownView } from '../components/MarkdownView';
import { Toc } from '../components/Toc';
import { AuthorCard } from '../components/AuthorCard';
import { RelatedArticles } from '../components/RelatedArticles';
import { CtaBlock } from '../components/CtaBlock';
import { formatBlogDate } from '../components/BlogCard';

interface Props {
  article: BlogArticle;
  repo: BlogRepository;
}

const formatUpdated = (article: BlogArticle): string => {
  const pub = formatBlogDate(article.publishedAt);
  const upd = formatBlogDate(article.updatedAt);
  if (upd && upd !== pub) return `Diperbarui ${upd}`;
  return '';
};

export const BlogArticlePage: React.FC<Props> = ({ article, repo }) => {
  const toc = useMemo(() => extractToc(article.bodyMarkdown), [article.bodyMarkdown]);
  const related = useMemo(() => repo.related(article, 3), [repo, article]);
  const updatedLabel = formatUpdated(article);

  return (
    <div className="ezb-page">
      <BlogNav />
      <section className="ezb-article-hero">
        <div className="ezb-container">
          <span className="ezb-tag">{article.category}</span>
          <h1>{article.title}</h1>
          {article.excerpt && <p className="ezb-excerpt">{article.excerpt}</p>}
        </div>
      </section>

      <div className="ezb-container">
        <Breadcrumb
          items={[
            { label: 'Blog', href: './' },
            { label: article.title },
          ]}
        />
      </div>

      <div className="ezb-article-layout">
        <article>
          <div className="ezb-article-meta">
            <span>
              Oleh <strong>{article.author.name}</strong>
            </span>
            <span className="ezb-dot">{formatBlogDate(article.publishedAt)}</span>
            {updatedLabel && <span className="ezb-dot">{updatedLabel}</span>}
            <span className="ezb-dot">{article.readingMinutes} menit baca</span>
          </div>

          <div className="ezb-article-body">
            <MarkdownView markdown={article.bodyMarkdown} className="ezb-prose" />
          </div>

          {article.tags.length > 0 && (
            <div className="ezb-meta" style={{ marginBottom: 24 }} aria-label="Tag artikel">
              {article.tags.map((t) => (
                <span key={t} className="ezb-tag">
                  {t}
                </span>
              ))}
            </div>
          )}

          <AuthorCard author={article.author} />

          {article.references && article.references.length > 0 && (
            <section className="ezb-references" aria-label="Referensi">
              <h2>Referensi</h2>
              <ol>
                {article.references.map((ref, i) => (
                  <li key={i}>{ref}</li>
                ))}
              </ol>
            </section>
          )}

          <RelatedArticles articles={related} />

          {/* Penutup halaman = marketing EZRAB (selalu terakhir, setelah konten & artikel terkait). */}
          <CtaBlock variant={article.cta} />
        </article>

        <Toc items={toc} />
      </div>

      <BlogFooter />
    </div>
  );
};

export default BlogArticlePage;
