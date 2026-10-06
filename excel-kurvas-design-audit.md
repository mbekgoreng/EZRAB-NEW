# Laporan Audit Desain: Sistem Export Excel, Time Schedule, dan Kurva-S EZRAB AI

**Tanggal**: 16 September 2026  
**Auditor**: Senior Excel Workbook Designer, Spreadsheet Engineer, Project Control Engineer, Quantity Surveyor, Cost Engineer, UI/UX Designer, QA Engineer  
**Status**: AUDIT SELESAI — DIREKOMENDASIKAN REFACTOR TINGKAT TINGGI  
**Folder Backup**: `backups/pre-excel-kurvas-design-refactor-2026-09-16/`  

---

## 1. Latar Belakang & Analisis Gambar Referensi
Gambar referensi memperlihatkan format standar spreadsheet konstruksi Indonesia yang sangat diakui:
1. **Bagian Kiri (Identitas & Biaya)**:
   - Kolom No.
   - Kolom Uraian Pekerjaan (Divisi / Item).
   - Kolom Jumlah Harga (Rp).
   - Kolom Bobot Pekerjaan (%).
2. **Bagian Kanan (Kalender Waktu & Gantt Bar)**:
   - Header Hierarkis 2-3 Tingkat: Bulan (Januari, Februari, Maret, April, dst.), Minggu (1, 2, 3, 4 per bulan).
   - Sel Durasi (Bar Pekerjaan): Ditandai sel warna merah/aksen berisi angka bobot mingguan (misal: 3.5%, 5.8%, 8.1%).
   - Kurva-S Garis Kumulatif terhampar di atas area bar jadwal.
3. **Bagian Bawah (Rekapitulasi Progres Proyek)**:
   - Baris Total: Jumlah Biaya (Rp) & Bobot (100.00%).
   - Baris Rencana Progres Mingguan (%): Jumlah bobot pekerjaan per kolom minggu (`SUM`).
   - Baris Kumulatif Progres Mingguan (%): Akumulasi progres bertahap hingga mencapai 100.00% pada minggu terakhir.

---

## 2. Temuan Audit pada Sistem Saat Ini

### A. Lembar `12_Schedule` (Time Schedule Saat Ini)
- **Kekurangan**:
  - Kolom minggu bersifat statis (hanya W1 s/d W8) tanpa pengelompokan nama Bulan (Januari, Februari, dll.).
  - Di dalam sel bar hanya diisi simbol titik `●` tanpa menampilkan nilai kontribusi bobot mingguan pekerjaan tersebut.
  - Belum memiliki baris footer rekapitulasi: Total Bobot, Rencana Progres Mingguan (%), dan Kumulatif Progres Mingguan (%).
  - Belum mengintegrasikan data durasi dinamis berdasarkan rentang tanggal riil proyek (`project.startDate` s/d `project.targetDate`).

### B. Lembar `13_Kurva_S` (Kurva-S Saat Ini)
- **Kekurangan**:
  - Tabel berorientasi vertikal (baris = minggu). Sangat bagus untuk data audit EVM, namun pengguna di industri konstruksi juga membutuhkan visualisasi grid gabungan Time Schedule + Kurva S horizontal terpadu seperti pada gambar referensi.
  - Diperlukan perpaduan:
    1. **Tabel Master Time Schedule & Kurva-S Terpadu** (seperti gambar referensi: WBS + Bobot + Kalender Bulanan/Mingguan + Bar Bobot per Minggu + Baris Progres Mingguan & Kumulatif + Grafik Garis Kurva-S).
    2. **Tabel Tracking EVM Lengkap** (Planned Value, Earned Value, Deviasi Nilai, Deviasi Bobot).

### C. Konsistensi Dasar Perhitungan Bobot
- **Dasar Bobot**:
  - Menggunakan **Total Biaya Langsung (Direct Cost)** proyek atau **Nilai Kontrak / Grand Total**.
  - Standar teknik konstruksi Indonesia menggunakan Total Biaya Langsung (`Direct Cost`) untuk pembobotan fisik pekerjaan, atau Grand Total jika disepakati bersama.
  - Untuk EZRAB AI, bobot dihitung terhadap Direct Cost (`itm.totalPrice / directCost * 100%`) sehingga total seluruh divisi WBS dan item pekerjaan tepat bernilai **100.00%**.
  - Konsistensi 1:1 dijamin di seluruh sistem (UI, Excel, dan PDF).

### D. Penanganan Jadwal Tidak Lengkap (DATA INCOMPLETE)
- Jika proyek belum memiliki konfigurasi tanggal atau jadwal tahapan (`scheduleTasks`), sistem tidak boleh mengarang jadwal fiktif atau tanggal acak.
- Menampilkan pesan teknis yang jelas dengan badge status `DATA INCOMPLETE`.

---

## 3. Rencana Arsitektur & Perbaikan Visual (Refactor Plan)

1. **Penyempurnaan Sheet `12_Schedule` (Time Schedule & Kurva-S Gabungan Berstandar Nasional)**:
   - Mengadopsi tata letak gambar referensi dengan sentuhan identitas visual **EZRAB Technical Premium**:
     - Kolom Kiri: No, Kode WBS, Uraian Pekerjaan, Jumlah Harga (Rp), Bobot (%).
     - Header Kanan Dinamis: Bulan Proyek (Januari, Februari, Maret, ...) dan Minggu (1, 2, 3, 4, ...).
     - Sel Grid Waktu: Bar warna biru EZRAB bergradasi/aksen yang memuat angka persentase bobot mingguan pekerjaan tersebut.
     - Footer Rekapitulasi:
       - **JUMLAH BIAYA & TOTAL BOBOT**: `=SUM(...)` = 100.00%.
       - **RENCANA PROGRES MINGGUAN (%)**: `=SUM(kolom minggu)` per minggu.
       - **RENCANA PROGRES KUMULATIF (%)**: `=F_prev + W_cur` (menuju 100.00%).
       - **AKTUAL PROGRES MINGGUAN (%)**: Dilengkapi baris aktual (jika ada data atau disiapkan untuk input lapangan).
       - **AKTUAL PROGRES KUMULATIF (%)**.
       - **DEVIASI PROGRES (%)**: Aktual Kumulatif - Rencana Kumulatif.
2. **Penyempurnaan Sheet `13_Kurva_S` (EVM & S-Curve Distribution Detail)**:
   - Mempertahankan tabel analitik EVM mendalam (Minggu, Tanggal Mulai-Selesai, Bobot Rencana, Bobot Kumulatif, Planned Value Rp, Earned Value Rp, Deviasi Bobot %, Deviasi Nilai Rp, dan In-Cell Bar Visual).
3. **Penyelarasan Desain Visual di Seluruh 16 Sheets**:
   - Skema warna: Navy Gelap (`#0F172A`), Biru Elektrik (`#2563EB`), Aksen Biru Muda (`#EFF6FF`), Border Halus (`#CBD5E1`), Status Hijau (`#15803D`).
   - Freeze panes pada setiap tabel agar header dan uraian pekerjaan tidak hilang saat digulir (*scroll*).
   - Format angka konsisten: Rupiah (`"Rp"#,##0;("Rp"#,##0);"-"`), Persen (`0.00%`), Kuantitas (`#,##0.00`).
