/**
 * Konfigurasi situs untuk SEO blog.
 *
 * Blog publik tinggal di SUBDOMAIN sendiri: blog.ezrab.site (keputusan user
 * 2026-10-17). Arsitektur:
 *   - `getBlogBaseUrl()`    → https://blog.ezrab.site — canonical, OG,
 *     JSON-LD, sitemap, dan semua URL artikel.
 *   - `getCanonicalBase()`  → domain utama aplikasi (link "Buka Aplikasi",
 *     CTA /app/*, link silang ke landing).
 *
 * Env (tanpa trailing slash):
 *   VITE_BLOG_URL      — override domain blog (Vercel env / process.env)
 *   VITE_CANONICAL_URL — override domain utama
 * TODO(user): (1) pastikan DNS `blog` → CNAME cname.vercel-dns.com di panel
 * domain ezrab.site; (2) daftarkan domain blog.ezrab.site di proyek Vercel;
 * (3) tetapkan domain utama final di VITE_CANONICAL_URL sebelum go-live.
 */
export const SITE_NAME = 'EZRAB Blog';
export const SITE_TAGLINE = 'Pengetahuan RAB, AHSP & estimasi konstruksi';

/** Domain utama aplikasi — fallback placeholder, JANGAN jadikan final tanpa keputusan user. */
export const DEFAULT_CANONICAL_BASE = 'https://www.ezrab.id';

/** Subdomain publik blog — keputusan user 2026-10-17 ("misal blog.ezrab.site"). */
export const DEFAULT_BLOG_BASE = 'https://blog.ezrab.site';

function readEnvVar(viteKey: string): string | undefined {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    const fromVite = env?.[viteKey];
    if (fromVite) return fromVite.replace(/\/+$/, '');
  } catch {
    /* abaikan — lanjut ke process.env */
  }
  try {
    const fromNode = typeof process !== 'undefined' ? process.env?.[viteKey] : undefined;
    if (fromNode) return fromNode.replace(/\/+$/, '');
  } catch {
    /* abaikan */
  }
  return undefined;
}

export function getCanonicalBase(): string {
  return readEnvVar('VITE_CANONICAL_URL') ?? DEFAULT_CANONICAL_BASE;
}

/** Base URL absolut untuk seluruh URL publik blog (canonical, sitemap, OG). */
export function getBlogBaseUrl(): string {
  return readEnvVar('VITE_BLOG_URL') ?? DEFAULT_BLOG_BASE;
}
