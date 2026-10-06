# TOPBAR_UI_AUDIT.md — Audit UI & Navigasi Existing EZRAB

## 1. Executive Summary
Audit ini mendokumentasikan status terkini dari header, navigasi atas, menu profil, notifikasi, pengaturan tema, pengaturan sistem, dan role management pada aplikasi EZRAB.

---

## 2. Existing Component & Architecture Map

| Komponen / File | Lokasi | Peran Saat Ini | Temuan / Catatan Audit |
| :--- | :--- | :--- | :--- |
| `WorkspaceView.tsx` | `src/components/dashboard/` | Shell workspace utama yang menyatukan sidebar dan header | Header terintegrasi langsung di dalam `WorkspaceView` (inline), belum modular. Terdapat icon `Sun` (tema) dan notifikasi statis. |
| `Navbar.tsx` | `src/components/navigation/` | Navbar halaman landing page / public | Bersih dan fokus untuk pengunjung landing page. |
| `UnifiedBreadcrumb.tsx` | `src/components/navigation/` | Breadcrumb bar terpadu di bawah header | Berfungsi baik untuk navigasi hierarkis modul & proyek. |
| `PengaturanView.tsx` | `src/components/settings/` | Halaman pengaturan konfigurasi perusahaan & estimasi | Hanya mencakup 4 tab sederhana (perusahaan, estimasi, ai, keamanan). Belum terintegrasi penuh dengan profil user, manajemen pengguna per role, ekspor data, kalkulasi presisi, dan notifikasi. |
| `PricingSection.tsx` | `src/components/landing/` | Komponen paket langganan & subscription | Tersedia untuk modul `subscription`. |

---

## 3. Existing Actions & Buttons Audit di Header

1. **Global Search**:
   - Terdapat input search di tengah (`max-width: 380px`) dengan shortcut `⌘ K`.
   - Perlu dipertahankan dengan visual clean, rounded border, dan integrasi filter cepat.
2. **Notification Bell**:
   - Terdapat icon bell dengan badge angka merah (`3`).
   - *Status*: Belum memiliki popover dropdown interaktif untuk menampilkan event riil (Project, RAB, DED, AI, Export).
3. **Help Button (`HelpCircle`)**:
   - Berada di baris kanan desktop.
   - *Status*: Belum memiliki popover menu terstruktur (Panduan, Bantuan, Shortcut, Info Versi).
4. **Theme Toggle (`Sun`)**:
   - *Status*: **Dihapus total** sesuai instruksi (Light Mode Only, tidak ada dark mode).
5. **Profile / User Identity**:
   - Menampilkan avatar dan nama "Ahmad Yusuf" (Super Admin).
   - *Status*: Belum memiliki popover dropdown akun lengkap (Profil Saya, Pengaturan, Workspace, Paket & Penggunaan, Keamanan, Keluar).

---

## 4. Role Handling & State Management

- **Role yang Didukung**:
  - `SUPER_ADMIN` (Ahmad Yusuf - Akses Penuh, Manajemen Pengguna & Workspace).
  - `ESTIMATOR` (Penyusunan RAB, QTO, dan Analisa Harga Satuan).
  - `DIREKSI` (Review Proyek, Persetujuan, dan Monitoring Eksekutif).
  - `CLIENT` (Akses Tinjauan Proyek Khusus).
- **Audit Keamanan Role**:
  - Penetapan role harus dikontrol oleh backend otoritatif.
  - Role Super Admin tidak boleh dapat di-assign sembarangan oleh role lain.
  - Terdapat audit log `USER_CREATED` untuk setiap penambahan akun pengguna baru ke workspace.

---

## 5. Mobile & Responsive Behavior

- **Desktop (>= 1024px)**: Top bar 64px dengan brand/workspace info, global search terpusat, bell notifikasi, bantuan, dan avatar dropdown.
- **Tablet (768px - 1023px)**: Search bar menyusut secara fleksibel, tombol sekunder tetap proporsional.
- **Mobile (< 768px)**: Top bar 56px, hamburger drawer trigger di kiri, logo brand, notifikasi bell & avatar di kanan. Profile menu dapat dibuka sebagai sheet yang ramah sentuhan.

---

## 6. Action Items Rekomendasi

1. [x] Buat komponen terpisah `src/components/navigation/TopBar.tsx` yang modular, elegan, dan clean.
2. [x] Hapus semua tombol / icon dark mode (`Sun`, `Moon`, theme modal trigger).
3. [x] Implementasikan `NotificationPopover` dengan kategori event riil aplikasi.
4. [x] Implementasikan `HelpPopover` dengan tautan bantuan terarah dan info versi.
5. [x] Implementasikan `ProfileMenuDropdown` dengan avatar, badge role, workspace info, dan aksi akun.
6. [x] Bangun `UnifiedSettingsView.tsx` dengan left sidebar lengkap (12 section) mencakup Profil Saya, Pengguna & Tim, Workspace, AI, Notifikasi, Ekspor, dan Keamanan.
7. [x] Bangun service dan UI User Management (`AddUserModal.tsx`) untuk menambah user berdasarkan role (Estimator, Direksi, Client) dengan audit log otoritatif.
