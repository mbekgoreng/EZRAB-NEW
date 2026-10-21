# EZRAB — UI/UX & Responsive Audit (2026-10-20)

Metode: sweep browser headless 11 route aplikasi + inspeksi section landing (termasuk verifikasi screenshot sesi yang sama) + temuan audit routing sesi ini. Tanpa redesign — hanya defect, usability, konsistensi.

## Hasil sweep (desktop 1280px, Chromium headless)
| Route | Error halaman | Catatan |
|---|---|---|
| /app/dashboard | 0 | Termuat penuh |
| /app/projects | 0 | — |
| /app/estimate | 0 | — |
| /app/ahsp | 0 | — |
| /app/kredit-ai | 0 | — |
| /app/ezrab-ai | 0 | — |
| /app/finance | 0 | — |
| /app/settings | 0 | — |
| /app/template-rab | 0 | — |
| /app/qto | 0 | — |
| /app/ded-ai | 0 | — |
2 error jaringan per route = resource eksternal gagal lewat proxy sandbox (artefak environment).

## Temuan

### UX-01 — Navigasi dashboard salah/tidak ada (DIPERBAIKI sesi ini, commit 9d60013) — P2 · CONFIRMED→FIXED
Tombol "Semua Proyek" tidak me-reset filter; 4 kartu statistik mati; RAB Generator mendarat di menu tak ter-render. Detail: `docs/EZRAB_NAVIGATION_AUDIT_REPORT.md`. Terverifikasi uji klik Playwright.

### UX-02 — Klik baris proyek tidak konsisten — P3 · CONFIRMED
Tabel Beranda membuka RAB Estimasi; daftar proyek & sidebar membuka Manajemen Proyek. Keduanya berfungsi; konsistensi target perlu satu keputusan owner.

### UX-03 — Anchor landing tercrop navbar (DIPERBAIKI sesi ini, commit dd81439) — P3 · CONFIRMED→FIXED
Klik "Harga" menutupi judul section di bawah navbar fixed; diperbaiki `scroll-margin-top: 84px` + padding section dipangkas 120→72px. Anchor lain (#fitur, #keunggulan) belum diberi perlakuan sama — risiko crop serupa (P3, LIKELY).

### UX-04 — Bundle awal sangat besar — P2 · CONFIRMED
Chunk canonical AHSP 16 MB masuk grafik awal aplikasi; mount headless membutuhkan 10–12 dtk. Pengguna HP/laptop lambat paling terdampak. Remediasi: lazy-load data canonical per kebutuhan (lihat INF-06).

### Konsistensi desain — status
- Seluruh view aplikasi mengikuti benchmark dashboard (arahan berdiri 2026-10-13): shell terang biru-abu, kartu radius besar, Plus Jakarta Sans. Tidak ditemukan view menyimpang besar pada route yang disapu.
- Kartu statistik kini gradasi pekat identik di mode terang/gelap (perbaikan sesi ini).
- Sidebar: toggle pill manual mengambang (sesuai keputusan owner; hover auto-expand pernah ditolak dan sudah di-revert).

## Yang tidak terverifikasi sesi ini
- Pengujian perangkat fisik & keyboard mobile terbuka: NOT_TESTED (hanya emulasi viewport pada audit sebelumnya).
- Screen reader end-to-end: NOT_TESTED. Fokus keyboard pada kartu yang baru dibuat clickable sudah ditambah (Enter/Spasi + tabIndex) untuk dashboard; audit a11y menyeluruh belum dilakukan.
- Perbandingan preview vs production: production ezrab.site terverifikasi MUTAKHIR pada 2026-10-20 (aset sesuai promosi hari yang sama; engine-status live) — QA visual terhadap live mewakili kode production saat ini, tetapi BUKAN dua commit lokal terakhir yang belum di-push (9d60013, dd81439).
