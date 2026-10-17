/**
 * Loader Node untuk konten blog (dipakai prerender.ts & sitemap.ts).
 * Membaca content/blog/*.md dari filesystem + gray-matter, lalu mapping
 * via buildArticle() — SATU sumber mapping dengan client.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { buildArticle } from '../../src/blog/markdown';
import type { BlogArticle } from '../../src/blog/types';

export function contentDir(): string {
  return join(process.cwd(), 'content', 'blog');
}

export function loadAllArticles(): BlogArticle[] {
  const dir = contentDir();
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md'));
  return files.map((file) => {
    const raw = readFileSync(join(dir, file), 'utf8');
    const parsed = matter(raw);
    return buildArticle(file, parsed.data as Record<string, unknown>, parsed.content);
  });
}
