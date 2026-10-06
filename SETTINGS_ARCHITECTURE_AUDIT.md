# SETTINGS ARCHITECTURE AUDIT — EZRAB

## 1. Executive Summary
Audit komprehensif terhadap sistem **Pengaturan (Settings)** dan konfigurasi proyek pada platform EZRAB.
Audit ini mengidentifikasi kelemahan mendasar pada implementasi saat ini, memetakan seluruh file dan komponen terkait, serta merumuskan arsitektur target yang memisahkan **Account, Workspace, dan Project** dengan jelas, menghapus konfigurasi AI dari user-facing UI, dan menjaga single source-of-truth.

---

## 2. Existing Settings Components & Files
Berdasarkan audit direktori dan kode sumber:

| File | Tipe / Lokasi | Deskripsi & Peran Saat Ini | Temuan / Gap |
|---|---|---|---|
| `src/components/settings/PengaturanView.tsx` | View Wrapper | Menerima `initialTab` dan meneruskan ke `UnifiedSettingsView`. | Hanya wrapper tipis, belum menyediakan context switching antara Workspace vs Project Settings. |
| `src/components/settings/UnifiedSettingsView.tsx` | Master Settings Component (1.218 baris) | Menyediakan 12 tab dalam layout sidebar datar: `profile`, `general`, `workspace`, `users`, `notifications`, `ai`, `calculation`, `rab`, `export`, `security`, `subscription`, `help`. | 1. Terdapat tab `ai` yang mengekspos konfigurasi AI.<br>2. Tidak membedakan Level 1 (Account), Level 2 (Workspace), dan Level 3 (Project).<br>3. Konfigurasi proyek (seperti overhead, PPN proyek, format kalkulasi proyek) tercampur sebagai setting global.<br>4. Tidak ada search settings.<br>5. Belum memiliki audit trail perubahan konfigurasi. |
| `src/components/settings/AddUserModal.tsx` | Modal Component | Form penambahan pengguna baru ke workspace (nama, email, role, dsb). | Berfungsi baik untuk level Workspace, perlu diintegrasikan dengan permission matrix. |
| `src/components/estimator/EstimatorSettingsView.tsx` | Estimator Project Settings | Ditempatkan di dalam tab `pengaturan` pada `RabEstimasiView`. Mengatur overhead %, PPN %, pembulatan proyek. | Berdiri sendiri terpisah dari Pengaturan utama; perlu harmonisasi agar konfigurasi estimator proyek dapat diakses baik dari modul RAB maupun menu Pengaturan (Project Scope). |
| `src/components/layout/Sidebar.tsx` | Main Navigation | Menampilkan menu navigasi utama. Tombol `Pengaturan` di bagian bawah memanggil `onSelectMenu('pengaturan')`. | Belum menampilkan status aktif saat berada di sub-kategori pengaturan baru. |
| `src/components/navigation/TopBar.tsx` | Header Navigation | Menampilkan link cepat ke tab pengaturan (`profile`, `general`, `users`, `subscription`, `security`, `help`, `notifications`). | Perlu diselaraskan dengan arsitektur tab baru (backward-compatible). |
| `src/components/navigation/UnifiedBreadcrumb.tsx` | Breadcrumb Bar | Menampilkan label breadcrumb untuk pengaturan. | Perlu mendukung hierarki baru (misal: *Pengaturan > Akun > Profil*, *Pengaturan > Proyek > Estimator*). |
| `src/routing/routes.ts` | Routing Definition | Mendefinisikan `/app/settings`, `/app/settings/:section`, `/app/project/:projectId/settings`. | Route sudah mendukung pemisahan account/workspace vs project scope (`scope: 'account'` vs `scope: 'project'`), namun komponen view belum memanfaatkan scope proyek secara optimal. |

---

## 3. Problems Found

### Problem 1: Pelanggaran Prinsip "Settings ≠ Feature" & Hierarchy Datar
* Sebanyak 12 tab ditampilkan dalam satu daftar linear tanpa pengelompokan hierarkis.
* Pengguna kesulitan membedakan mana pengaturan pribadi (Akun), pengaturan kantor (Workspace/Perusahaan), dan pengaturan yang hanya berdampak pada proyek tertentu (Project).

### Problem 2: Terdapat Menu User-Facing "AI" (Pelanggaran Mandatory Rule)
* Tab `ai` (`EZRAB AI & Asisten`) menampilkan konfigurasi gaya respon AI, auto-matching AHSP, dan opsi internal engine.
* Sesuai requirement Section 6: **EZRAB sengaja menyembunyikan seluruh model/provider AI dari user**. AI adalah internal infrastructure. Tab ini harus dihapus dari UI navigasi pengguna.

### Problem 3: Pencampuran Konfigurasi Global dengan Konfigurasi Proyek
* Opsi seperti persentase Overhead, PPN, dan Pembulatan pada `UnifiedSettingsView` disimpan di state lokal yang tidak terhubung dengan `currentProject` dari `ProjectContext`.
* Padahal, setiap proyek memiliki tarif PPN dan margin overhead yang berbeda-beda tergantung jenis kontrak (kontrak pemerintah vs swasta).

### Problem 4: Tidak Adanya Mode "Project Settings" yang Jelas
* Pengguna yang sedang mengerjakan suatu proyek tidak memiliki tampilan terintegrasi untuk mengonfigurasi seluruh aspek proyeknya (Info Proyek, Estimator, DED & Volume, Dokumen, Schedule, Cost) dalam satu tempat yang aman tanpa risiko merusak master data.

### Problem 5: Ketiadaan Search Settings & Audit Log
* Tidak ada fitur pencarian konfigurasi untuk menemukan setting spesifik (misal: "pajak", "waste", "npwp").
* Perubahan konfigurasi sensitif (seperti tarif pajak, margin overhead, dan override harga) belum mencatat audit log (siapa, kapan, nilai lama, nilai baru).

---

## 4. Source-of-Truth & Data Lifecycle Alignment
EZRAB memiliki lifecycle:
`Gambar → DED → Volume → RAB → Dokumen → Schedule → Progress → Cost → Final Project`

Audit memastikan:
1. **Master Price → Project Override → Project RAB**:
   * Master price tetap immutable di `MaterialDatabaseService`, `LaborDatabaseService`, dan `EquipmentDatabaseService`.
   * Project override disimpan secara terisolasi via `projectPriceEngine` & `PriceRepository` dengan key `projectId`.
2. **Project Settings**:
   * Konfigurasi proyek tersimpan langsung di entitas `Project` dalam `ProjectContext` (`overheadPercent`, `ppnPercent`, `roundingScheme`, dsb.).
3. **Workspace Settings**:
   * Konfigurasi workspace tersimpan di level perusahaan/workspace via `ClientUserManagementService` dan storage workspace.
4. **Account Settings**:
   * Preferensi user disimpan di storage pengguna saat ini (`currentUser`).

---

## 5. Architectural Gap Closure Strategy
1. Bangun **Information Architecture** dengan 10 grup utama dan pemisahan **Account vs Workspace vs Project Settings**.
2. Sediakan **Scope Switcher**: Toggle antara **Global (Workspace/Akun)** dan **Khusus Proyek (Project Context)** dengan pemilih proyek aktif.
3. Hapus menu **AI** dari navigasi pengguna dan jaga agar AI routing tetap bekerja sebagai backend infrastructure layer.
4. Buat **Settings Search Engine**: Pencarian live yang dapat mengarahkan pengguna langsung ke grup & field pengaturan terkait.
5. Buat **Settings Audit Trail Service**: Menyimpan riwayat perubahan konfigurasi sensitif.
6. Sediakan **Settings Landing Page / Category Overview Cards** untuk kemudahan navigasi dan clarity visual.
