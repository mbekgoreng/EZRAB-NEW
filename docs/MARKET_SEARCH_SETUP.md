# Market Search Provider — Setup

## Ringkasan
EZRAB menggunakan **Serper API** (Google SERP) untuk pencarian harga pasar.
Tidak ada API marketplace publik (Tokopedia/Shopee) yang sah untuk pencarian
produk pihak ketiga — API resmi mereka hanya untuk seller.

## Setup (memerlukan persetujuan manusia)

1. Daftar di https://serper.dev (2.500 query gratis/bulan)
2. Dapatkan API key dari dashboard
3. Set environment variable di server (Vercel/hosting):
   ```
   SERPER_API_KEY=xxxx
   ```
4. **Jangan** taruh key di kode frontend atau commit ke repo.

## Biaya (per 2026)
- Gratis: 2.500 query/bulan
- Berbayar: $1 per 1.000 query

## Perilaku tanpa key
`UnavailableSearchProvider` aktif — UI menampilkan pesan jujur
"pencarian belum dikonfigurasi", bukan data palsu.

## Batasan
- Snippet SERP bukan harga terverifikasi; buka halaman produk untuk verifikasi.
- Rate limit 429 → pesan "kuota habis".
- Timeout 15 detik.
- Hanya halaman produk (tokopedia.com, shopee.co.id, dll.) yang diproses;
  artikel/blog difilter.
