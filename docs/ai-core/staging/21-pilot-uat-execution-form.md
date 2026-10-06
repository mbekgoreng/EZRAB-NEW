# EZRAB AI CORE — FORM & LEMBAR SIGN-OFF MANUAL PILOT UAT INTERAKTIF (PHASE 4)

**Tanggal:** 14 September 2026  
**Otoritas QA:** Senior QA Lead & Release Manager  
**Target Pengujian:** Staging Environment Web UI & API  

---

## 1. Template Formulir Eksekusi Manual 23 Skenario UAT

| Field Formulir | Spesifikasi Input Pengujian |
|---|---|
| **UAT ID** | `UAT-01` s.d. `UAT-23` |
| **Kategori UAT** | Authentication / Multi-Tenancy / AI Intent / Mutation Safety / Construction / Export |
| **Nama Tester & Role** | *Contoh:* Budi Santoso (Senior Estimator) / Ir. Hendra (Arsitek) |
| **Waktu Eksekusi** | Tanggal & Jam WIB |
| **Staging Environment URL**| `http://staging.ezrab.com` atau `http://127.0.0.1:3000` |
| **Preconditions** | Status user login, workspace aktif, atau data proyek prasyarat |
| **Test Steps** | Langkah-langkah interaktif manual yang dilakukan di browser UI |
| **Expected Result** | Perilaku sistem yang diharapkan sesuai spesifikasi fitur |
| **Actual Result** | Perilaku sistem nyata yang teramati di layar antarmuka |
| **Status Uji** | `[ ] PASS`  `[ ] FAIL`  `[ ] BLOCKED`  `[ ] NOT_EXECUTED` |
| **Evidence / Screenshot** | Nomor file tangkapan layar (misal: `evidence-uat-01.png`) |
| **Verifikasi Database** | Bukti record row di database staging (misal: row ID pada `public.rab_items`) |
| **Defect ID (Jika Fail)** | *Contoh:* `DEFECT-STG-001` (Deskripsi bug) |
| **Retest Status** | `[ ] PENDING RETEST`  `[ ] RETEST PASSED` |
| **Tanda Tangan Tester** | *Nama Jelas & Paraf* |

---

## 2. Lembar Persetujuan Akhir (Sign-Off Sheets)

### A. Lembar Sign-Off Lead Estimator
> "Saya telah menguji secara langsung fitur perhitungan volume QTO parametrik, pencarian kode AHSP PUPR 2026, penambahan item pekerjaan, formula perkalian spreadsheet, overhead 5%, profit 5%, PPN 11%, dan ekspor laporan Excel/PDF. Hasil matematis terverifikasi akurat dan konsisten."
- **Nama Lead Estimator:** ___________________________
- **Keputusan:** `[ ] SETUJU (APPROVED)`  `[ ] PERLU PERBAIKAN (REVISE)`
- **Tanda Tangan & Tanggal:** ___________________________

### B. Lembar Sign-Off Arsitek / Direksi Proyek
> "Saya telah menguji pembacaan ringkasan eksekutif proyek, pembagian hak akses multi-tenant, Kurva S mingguan, grafik deviasi progres rencana vs realisasi, dan perlindungan konfirmasi 2-langkah sebelum data RAB diubah oleh AI."
- **Nama Direksi / Arsitek:** ___________________________
- **Keputusan:** `[ ] SETUJU (APPROVED)`  `[ ] PERLU PERBAIKAN (REVISE)`
- **Tanda Tangan & Tanggal:** ___________________________

### C. Lembar Sign-Off Senior QA & Security Lead
> "Saya menyatakan bahwa seluruh 19 automated test suites lulus 100%, uji penetrasi 20 vektor keamanan lolos tanpa kerentanan Critical/High, isolasi cross-workspace terbukti fail-closed, dan tidak ada kebocoran secret pada log sistem."
- **Nama Senior QA Lead:** ___________________________
- **Keputusan:** `[ ] SETUJU (APPROVED)`  `[ ] DITOLAK (REJECTED)`
- **Tanda Tangan & Tanggal:** ___________________________

---

## 3. Daftar Blocker Pengujian UAT (UAT Blocker Log)

| No | Komponen Blocker | Deskripsi Kendala | Dampak ke Skenario UAT | Status Resolusi |
|---|---|---|---|---|
| **01** | **Akses Server Staging Fisik** | Menunggu penyalaan host staging dan alokasi domain/IP publik | UAT 01 - 23 tertahan di level manual UI (dapat diuji di runtime lokal) | ⏸️ **AWAITING HOSTING** |
| **02** | **Kredensial Supabase Staging** | Menunggu pembuatan project sandbox staging di Supabase | UAT 01 - 07 tertahan untuk live email dispatch | ⏸️ **AWAITING SUPABASE CONFIG** |
