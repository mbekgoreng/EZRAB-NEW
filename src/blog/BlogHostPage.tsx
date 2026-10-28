/**
 * Halaman blog untuk host blog.ezrab.site — fallback SPA.
 *
 * Bila rewrite statis /blog/* tidak tersaji (mis. domain menunjuk deployment
 * tanpa dist/blog), subdomain blog tetap menampilkan indeks/artikel dari data
 * markdown yang sama, bukan landing (audit A-1). Komponen ini di-lazy-load dari
 * App sehingga markdown blog tidak ikut bundle awal aplikasi utama.
 */
import React, { useMemo } from 'react';
import { getClientBlogRepository } from './repo';
import { BlogIndexPage } from './pages/BlogIndexPage';
import { BlogArticlePage } from './pages/BlogArticlePage';
import { BlogNotFound } from './pages/BlogNotFound';
import './blog.css';

interface Props {
  pathname: string;
}

export const BlogHostPage: React.FC<Props> = ({ pathname }) => {
  const repo = useMemo(() => getClientBlogRepository(), []);
  const slug = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, ''));
  if (!slug) return <BlogIndexPage repo={repo} />;
  const article = repo.getBySlug(slug);
  if (!article) return <BlogNotFound slug={slug} />;
  return <BlogArticlePage article={article} repo={repo} />;
};
