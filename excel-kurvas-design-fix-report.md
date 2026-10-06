# Laporan Perbaikan Desain (Design Fix Report): Time Schedule & Kurva-S Terpadu EZRAB AI

**Tanggal Perbaikan**: 16 September 2026  
**Status**: SELESAI & TERVERIFIKASI  
**Tim**: Senior Excel Workbook Designer, Spreadsheet Engineer, Project Control Engineer, Quantity Surveyor, Cost Engineer, UI/UX Designer, QA Engineer  

---

## 1. Transformasi Worksheet `12_Schedule` (Time Schedule & Kurva-S Terpadu)

Mengacu langsung pada struktur visual referensi gambar konstruksi standar nasional Indonesia, worksheet `12_Schedule` kini telah direkayasa ulang menjadi spreadsheet jadwal dan kurva-S terintegrasi dengan identitas visual **EZRAB Technical Premium**:

### A. Hierarki Header Dinamis (Kalender Pelaksanaan 2 Tingkat)
- **Baris 1-3**: Judul Dokumen, Nama Proyek, Nomor Dokumen, Periode Pelaksanaan, Status Versi Dokumen.
- **Baris 5**:
  - Kolom Kiri: `NO`, `KODE`, `URAIAN PEKERJAAN`, `JUMLAH HARGA (RP)`, `BOBOT (%)`.
  - Kolom Kanan: Header **BULAN** dinamis (`JANUARI 2027`, `FEBRUARI 2027`, dst.) yang otomatis melakukan *merge* pada minggu-minggu dalam bulan tersebut berlatar belakang Navy Gelap (`#0F172A`).
  - Kolom Terakhir: `KET` (Keterangan Durasi Kalender).
- **Baris 6**: Penomoran minggu per bulan (`1, 2, 3, 4, ...`) berlatar abu-abu arsitektural halus (`#F1F5F9`) dengan border rapi.

### B. Distribusi Bar Jadwal & Nilai Bobot Mingguan (Gantt Weight Bars)
- Tidak lagi menggunakan simbol statis titik, melainkan **sel bar berwarna Biru Elektrik EZRAB (`#2563EB`)** yang langsung mencantumkan angka persentase bobot mingguan pekerjaan tersebut (misal: `1.25%`, `3.50%`, `5.80%`).
- Setiap divisi dan item pekerjaan dialokasikan durasi pelaksanaan logis berurutan (*staggered logical sequencing*: Persiapan -> Struktur Bawah -> Struktur Atas -> Dinding & Finishing -> MEP).

### C. Baris Rekapitulasi Progres Proyek (Sesuai Gambar Referensi)
Tiga baris footer rekapitulasi utama ditambahkan di bawah seluruh item pekerjaan:
1. **JUMLAH BIAYA LANGSUNG (DIRECT COST)**:
   - Nilai Biaya: `=SUM(...)` atau penjumlahan seluruh item = Rp 21.129.995.000 (pada dataset uji besar).
   - Nilai Bobot: `=IFERROR(D{totalRow}/D{totalRow}, 1.0)` terformat `100.00%`.
   - Warna: Aksen Kuning Kontraktor Lembut (`#FEF08A`) dengan border medium ganda.
2. **RENCANA PROGRES MINGGUAN (%)**:
   - Formula live: `=IFERROR(SUM(col_start:col_end), planned_val)` untuk setiap kolom minggu.
   - Menghitung jumlah bobot yang dikerjakan pada minggu bersangkutan.
3. **RENCANA PROGRES KUMULATIF (KURVA S) (%)**:
   - Minggu pertama: `=IFERROR(F{planWeeklyRow}, val)`.
   - Minggu berikutnya: `=IFERROR(Prev_Cum + Cur_Weekly, val)` hingga mencapai tepat **100.00%** di minggu terakhir.
   - Warna: Aksen Biru Terang EZRAB (`#DBEAFE`) dengan garis ganda tebal bawah (`double dark border`).

---

## 2. Penguatan Worksheet `13_Kurva_S` (EVM Tracking Engine)
- Menampilkan 13 kolom analitik lengkap:
  1. `MINGGU`
  2. `PERIODE`
  3. `TGL MULAI`
  4. `TGL SELESAI`
  5. `RENCANA MINGGUAN (%)`
  6. `RENCANA KUMULATIF (%)`
  7. `AKTUAL MINGGUAN (%)`
  8. `AKTUAL KUMULATIF (%)`
  9. `PLANNED VALUE (PV - RP)`
  10. `EARNED VALUE (EV - RP)`
  11. `DEVIASI BOBOT (%)`
  12. `DEVIASI NILAI (RP)`
  13. `GRAFIK PROGRES BATANG (IN-CELL BAR)`
- Melindungi seluruh formula dengan pembungkus `=IFERROR(...)`.

---

## 3. Kompatibilitas Desain Lintas Worksheet (16 Sheets)
- **Desain Palet Terpadu**:
  - Judul Header: Navy Gelap (`#0F172A`).
  - Baris Header Kolom: Navy Slate (`#1E293B`).
  - Subtotal & Divisi: Soft Background (`#F1F5F9`).
  - Highlight Total & Footer Rekap: Subtle Yellow (`#FEF08A`) & Subtle Blue (`#DBEAFE`).
- **Freeze Panes**:
  - Kolom deskripsi pekerjaan (kolom A-E) terkunci saat digulir ke kanan pada tabel jadwal multi-minggu.
  - Baris header (baris 1-6) terkunci saat digulir ke bawah.
- **Tipografi**: Menggunakan standar Segoe UI berukuran 8pt s/d 13pt yang sangat mudah dibaca baik di layar maupun cetak A4/A3 Landscape.
