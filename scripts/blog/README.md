# EZRAB Blog — pipeline build & operasional

## Arsitektur: subdomain

Blog publik tinggal di **subdomain `blog.ezrab.site`** (keputusan user 2026-10-17),
BUKAN di path `/blog` domain utama.

1. Konten: Markdown + frontmatter di `content/blog/` (slug = nama file).
2. `npm run build` → `tsc && vite build` (TIDAK diubah — dipakai Vercel).
3. `npm run build:blog` → `scripts/blog/prerender.ts` + `scripts/blog/sitemap.ts`:
   - `dist/blog/index.html` + `dist/blog/<slug>/index.html` (HTML penuh per-halaman:
     title, meta description, canonical absolut `https://blog.ezrab.site/...`,
     OG, JSON-LD BlogPosting + BreadcrumbList, blog.css di-inline).
     Hanya artikel `published` dengan `publishedAt <= now`.
   - `dist/blog/sitemap.xml` (hanya `{blog}/` + artikel published yang sudah
     waktunya; TIDAK PERNAH: draft/review/scheduled/archived/CMS/preview/pencarian).
   - `dist/blog/robots.txt` (Allow /, Sitemap absolut subdomain).
4. `npm run build:full` = `npm run build && npm run build:blog`.

Routing (`vercel.json`): request dengan Host `blog.ezrab.site` di-rewrite ke
`/blog/...` SEBELUM rewrite SPA — `/` → indeks, `/<slug>` → artikel,
`/sitemap.xml` dan `/robots.txt` → file blog. File statis `dist/` didahulukan
Vercel atas rewrite → crawler dapat HTML asli tanpa JavaScript.

Link silang: halaman blog menautkan aplikasi utama (`/app/*`, `/fitur`,
landing) via URL ABSOLUT domain utama (`getCanonicalBase()`), dan sebaliknya
navbar/footer landing menautkan blog via URL absolut subdomain
(`getBlogBaseUrl()`). Jangan pakai path relatif lintas-host.

## Yang harus diubah/diatur sebelum go-live

- **Build Command** proyek Vercel: `npm run build:full`
  (atau `npm run build && npm run build:blog`). Tanpa ini, blog hanya
  dirender client-side (SEO lemah).
- **DNS** (panel domain ezrab.site — aksi user): CNAME `blog` →
  `cname.vercel-dns.com`.
- **Domain di Vercel** (aksi user): tambahkan `blog.ezrab.site` ke proyek
  `ezrab-site`.
- **Env `VITE_BLOG_URL`**: override domain blog bila berbeda dari
  `https://blog.ezrab.site` (fallback saat ini — dari keputusan user).
- **Env `VITE_CANONICAL_URL`**: domain kanonis final APLIKASI UTAMA
  (fallback: `https://www.ezrab.id` — PLACEHOLDER, butuh keputusan user).
  Dipakai untuk link CTA/aplikasi dari halaman blog.

Catatan: selama DNS belum aktif, `/blog/*` di domain utama tetap dapat dibuka
(canonical menunjuk subdomain sehingga tidak ada penalti duplikat). Setelah
DNS live, pertimbangkan redirect 301 `/blog/:path*` → subdomain.

## Batasan yang disengaja

- SPA + prerender statis (bukan SSR).
- Slug artikel tak dikenal (`/<slug-asing>` di subdomain) → halaman 404
  client-side (rewrite statis tidak bisa set status HTTP 404; crawler hanya
  menemukan slug valid via sitemap/internal link).
- Komponen blog SSR-safe & tanpa import `.css` langsung (agar bisa diimport
  tsx di Node untuk prerender).

## CMS (`/app/blog` — tetap di domain utama)

- Gate: wajib sesi role AKTIF dengan capability `manage-blog`
  (`src/auth/roleAccounts.ts`). TIDAK diberikan ke role demo manapun secara
  default — berikan manual bila diperlukan.
- Persistence saat ini: `InMemoryBlogAdminStore` — NON-PRODUKSI (hilang saat
  refresh, bukan localStorage). Produksi: Supabase via
  `supabase/migrations/20261017_blog_cms.sql`.

## Dependensi sebelum CMS produksi

1. Approval eksplisit user untuk mengaplikasikan migration.
2. Koneksi Supabase valid + `service_role` key (vault reconnect 2026-10-13
   GAGAL — user perlu re-copy dari dashboard).
3. Setiap artikel published WAJIB review manusia; contoh angka WAJIB berlabel
   "Ilustrasi"; tidak ada angka AHSP/HSPK karangan.
