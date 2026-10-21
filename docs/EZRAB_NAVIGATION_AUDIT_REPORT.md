# LAPORAN AUDIT ROUTING & NAVIGASI — EZRAB

**Tanggal:** 2026-10-20 16:10 WIB
**Branch:** `integrasi/unified-ui-engine`
**Commit:** `9d60013` — `fix(nav): dashboard routing audit + saturated stat cards + modal icons` (BELUM PUSH)
**Validasi:** TypeScript 0 error; uji klik Playwright lulus.

---

## Temuan & Perbaikan

### 🔴 BUG 1 — Tombol "Semua Proyek" di Beranda tidak me-reset filter
- **Gejala:** Klik "Semua Proyek" di dashboard membuka menu Proyek dengan filter terakhir yang dipakai (mis. Draft), bukan Semua Proyek.
- **Penyebab:** Tombol hanya memanggil `onNavigateToTab('proyek')` tanpa menyetel filter, sedangkan sidebar menyetel filter + menu sekaligus.
- **Perbaikan:** Prop baru `onNavigateToProjects(filter)` diteruskan WorkspaceView → DashboardViewSwitcher → kedua view dashboard. Tombol kini menyetel filter `Semua Proyek` lalu membuka menu Proyek.

### 🔴 BUG 2 — Empat kartu statistik Beranda mati (tidak bisa diklik)
- **Gejala:** Kartu Total Proyek / Sedang Dikerjakan / Selesai / Draft di kedua tampilan dashboard (Modern & Klasik) tidak punya handler klik.
- **Perbaikan:** Semua kartu kini bisa diklik dan membuka menu Proyek dengan filter yang sesuai:
  - Total Proyek → Semua Proyek
  - Sedang Dikerjakan → Sedang Dikerjakan
  - Selesai → Selesai
  - Draft → Draft
- Mendukung keyboard (Enter/Spasi).

### 🔴 BUG 3 — RAB Generator mendarat di Dashboard, bukan Spreadsheet
- **Gejala:** Setelah item dari RAB Generator ditambahkan, aplikasi memanggil `setActiveMenu('estimate')`. Menu `estimate` tidak pernah dirender, sehingga jatuh ke tampilan default (Dashboard).
- **Perbaikan:** Diubah menjadi `setActiveMenu('rab-estimasi')`.

### 🟡 Catatan (tidak diubah)
- Klik baris proyek di tabel Beranda membuka RAB Estimasi, sedangkan daftar proyek membuka Manajemen Proyek. Keduanya berfungsi; hanya tidak konsisten. Dibiarkan agar tidak mengubah alur kerja tanpa persetujuan.

---

## Audit menyeluruh (cross-check otomatis)
- Semua target `setActiveMenu` / `onSelectMenu` / `onNavigateToTab` di seluruh `src/` dicocokkan dengan cabang render di `WorkspaceView` dan `routeForMenu`. Selain BUG 3, tidak ditemukan menu mati lain.
- Sidebar, bottom-nav mobile, Quick Actions (Buat RAB, Upload DED, Volume, Cari AHSP), dan tombol "Lihat Analisis" terverifikasi menunjuk menu yang benar.

## Uji aktual (Playwright, dev server)
- Klik kartu stat Draft → URL `/app/projects` dengan filter Draft aktif. ✅
- Klik tombol "Semua Proyek" → URL `/app/projects`. ✅
- Dashboard termuat tanpa error. ✅

---

## Pekerjaan terkait yang selesai pada commit yang sama
1. **Warna kartu statistik lebih pekat** (permintaan user): gradasi jenuh biru/amber/hijau/oranye dengan teks putih; variabel baru `--ez-stat-*` yang **identik di mode terang & gelap** (tidak lagi pudar transparan di mode gelap). Variabel pastel lama dipertahankan untuk badge AHSP agar tidak rusak.
2. **Modal "Tambah Pekerjaan"**: ikon emoji (📚 ✏️ 🤖 📋 📑) di tab dan kartu diganti ikon Lucide (BookOpen, PenTool, Sparkles, LayoutTemplate, Copy). Sebelumnya ikon tab didefinisikan tetapi tidak pernah dirender — kini dirender.

## Status: PASS — menunggu persetujuan push.
