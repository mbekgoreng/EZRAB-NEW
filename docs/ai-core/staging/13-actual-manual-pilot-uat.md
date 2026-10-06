# EZRAB AI CORE — PANDUAN & HASIL AUDIT MANUAL PILOT UAT 23 SKENARIO (PHASE 4)

**Tanggal:** 14 September 2026  
**Auditor:** QA Lead & Construction Domain Expert  
**Status Eksekusi Logika Sistem:** ✅ **VERIFIED_BY_AUTOMATED_TEST (23/23)**  
**Status Pengujian Interaktif Manual:** 🟡 **READY_FOR_MANUAL_PRACTITIONER_EXECUTION**  

---

## 1. Panduan Eksekusi Manual 23 Skenario

### Kelompok A: Authentication & Session
1. **UAT-01: Registrasi Akun Baru**  
   - *Tester:* QA Tester / Estimator Baru  
   - *Langkah:* Buka form registrasi, masukkan nama, email baru, password 8+ karakter.  
   - *Expected:* Akun terbuat di auth database, menerima notifikasi berhasil.  
   - *Status Logika:* `PASS` (diuji di `authFoundation.test.ts`).  
2. **UAT-02: Login Valid**  
   - *Langkah:* Masukkan email dan password yang benar, klik Login.  
   - *Expected:* Redirect ke Dashboard, bearer session token tersimpan di browser storage.  
   - *Status Logika:* `PASS`.  
3. **UAT-03: Login Salah**  
   - *Langkah:* Masukkan password salah 3 kali.  
   - *Expected:* Tampil pesan "Email atau kata sandi tidak sesuai", token tidak diterbitkan.  
   - *Status Logika:* `PASS`.  
4. **UAT-04: Logout**  
   - *Langkah:* Klik menu profil ➔ Logout.  
   - *Expected:* Token sesi diinvaliasi, redirect ke login, tombol back tidak dapat mengakses dashboard.  
   - *Status Logika:* `PASS`.  
5. **UAT-05: Token Expiry**  
   - *Langkah:* Biarkan sesi idle hingga token kadaluarsa, lakukan aksi reload / fetch data.  
   - *Expected:* Muncul modal "Sesi Anda telah berakhir", dialihkan ke halaman login.  
   - *Status Logika:* `PASS` (`AUTH_EXPIRED` handled).  
6. **UAT-06: Forgot Password**  
   - *Langkah:* Masukkan email di halaman lupa password, submit.  
   - *Expected:* Mengirim link reset password yang aman tanpa membocorkan eksistensi user lain.  
   - *Status Logika:* `PASS`.  
7. **UAT-07: Email Verification**  
   - *Langkah:* Klik link verifikasi email di inbox.  
   - *Expected:* Status akun terkonfirmasi, user dapat membuat workspace baru.  
   - *Status Logika:* `PASS`.  

---

### Kelompok B: Workspace & Multi-Tenancy
8. **UAT-08: Workspace Creation**  
   - *Tester:* Organisasi Admin  
   - *Langkah:* Buat workspace baru `"PT Bangun Persada"`.  
   - *Expected:* Workspace terdaftar dengan ID unik `ws-...`, user terpasang sebagai `SUPER_ADMIN`.  
   - *Status Logika:* `PASS`.  
9. **UAT-09: Project Ownership**  
   - *Langkah:* Buat proyek `"Pembangunan Gedung Ruko 3 Lantai"` di workspace tersebut.  
   - *Expected:* Proyek terikat pada workspace pemilik, tidak terlihat oleh organisasi lain.  
   - *Status Logika:* `PASS`.  
10. **UAT-10: Cross-Tenant Access Rejection**  
    - *Langkah:* Buka sesi browser kedua dengan user Workspace B, coba akses URL Proyek A secara langsung.  
    - *Expected:* Muncul halaman 403 Forbidden / "Anda tidak memiliki akses ke proyek ini".  
    - *Status Logika:* `PASS` (`IsolationGuard` block).  
11. **UAT-11: RBAC Role Permissions**  
    - *Langkah:* Login sebagai role `CLIENT`, coba edit item RAB.  
    - *Expected:* Tombol aksi edit non-aktif / read-only, request mutasi ditolak.  
    - *Status Logika:* `PASS`.  

---

### Kelompok C: AI & Intent Engine
12. **UAT-12: Small Talk Tanpa Context Berat**  
    - *Tester:* Estimator  
    - *Langkah:* Ketik "Selamat pagi EZRAB, kamu bisa bantu apa?".  
    - *Expected:* Respons instan (< 100ms) ramah, 0 payload proyek dibaca dari database.  
    - *Status Logika:* `PASS` (`greetingSmallTalk.test.ts`).  
13. **UAT-13: Read-Only Query Proyek**  
    - *Langkah:* Ketik "Berapa total nilai RAB saat ini?".  
    - *Expected:* Co Assistant menampilkan total nominal eksak sesuai data database.  
    - *Status Logika:* `PASS`.  
14. **UAT-14: Server-Side Context Loading**  
    - *Langkah:* Ketik "Analisis pekerjaan dengan bobot biaya terbesar".  
    - *Expected:* Co Assistant menganalisis item RAB resmi server (maks 96KB) dan menampilkan top 3 item termahal.  
    - *Status Logika:* `PASS`.  

---

### Kelompok D: Function Calling & AI Safety
15. **UAT-15: Deteksi Mutation Intent**  
    - *Langkah:* Ketik "Tolong tambahkan pekerjaan bekisting balok volume 50 m2".  
    - *Expected:* AI mendeteksi tool `add_rab_item` dan menyusun draft parameter.  
    - *Status Logika:* `PASS` (`aiBackend.test.ts`).  
16. **UAT-16: Konfirmasi Dua Tahap (2-Step Mutation)**  
    - *Langkah:* Periksa antarmuka saat AI selesai menyusun draf item.  
    - *Expected:* Muncul card dialog konfirmasi: "[Setuju] / [Batal]", status `CONFIRMATION_REQUIRED`, database belum berubah.  
    - *Status Logika:* `PASS`.  
17. **UAT-17: Pembatalan Mutasi Tanpa Efek Samping**  
    - *Langkah:* Klik tombol "[Batal]" pada dialog konfirmasi.  
    - *Expected:* Draft dibatalkan, total RAB dan daftar item tetap tidak berubah sama sekali.  
    - *Status Logika:* `PASS`.  

---

### Kelompok E: RAB & Construction Engineering
18. **UAT-18: Modifikasi Item RAB & Recalculate**  
    - *Langkah:* Klik tombol "[Setuju]" pada penambahan item bekisting.  
    - *Expected:* Item tersimpan di database, Direct Cost, Overhead 5%, Profit 5%, dan PPN 11% terhitung ulang secara instan.  
    - *Status Logika:* `PASS` (`calculationFoundation.characterization.test.ts`).  
19. **UAT-19: Parametric QTO Volume Calculation**  
    - *Langkah:* Ketik "Hitung volume pondasi batu kali panjang 40m, lebar atas 0.3m, lebar bawah 0.8m, tinggi 1m".  
    - *Expected:* Formula trapesium dihitung akurat: $(0.3 + 0.8)/2 \times 1 \times 40 = 22\text{ m}^3$.  
    - *Status Logika:* `PASS` (`volumeCalculatorIntegration.test.ts`).  
20. **UAT-20: Sinkronisasi Spreadsheet**  
    - *Langkah:* Buka tab "Spreadsheet Editor" pada proyek.  
    - *Expected:* Baris pekerjaan baru tampil serasi pada hierarki tabel WBS grid.  
    - *Status Logika:* `PASS`.  

---

### Kelompok F: Ekspor & Integrasi Resiliensi
21. **UAT-21: Export PDF Laporan Rekapitulasi**  
    - *Langkah:* Klik menu Export ➔ Download PDF.  
    - *Expected:* File PDF terunduh rapi, mencakup kop proyek, tabel item pekerjaan, subtotal, PPN, dan grand total.  
    - *Status Logika:* `PASS`.  
22. **UAT-22: Export Excel (.xlsx) Formula Live**  
    - *Langkah:* Klik menu Export ➔ Download Excel.  
    - *Expected:* File Excel terunduh, rumus SUM/perkalian aktif dan sesuai standar estimator.  
    - *Status Logika:* `PASS`.  
23. **UAT-23: AI Fallback Saat Daemon Offline**  
    - *Langkah:* Matikan sementara daemon AI Core/Ollama pada staging, ajukan pertanyaan tentang standar konstruksi.  
    - *Expected:* Co Assistant otomatis jatuh ke rule-based knowledge engine, menjawab secara informatif tanpa crash atau layar putih error 500.  
    - *Status Logika:* `PASS` (`05-provider-fallback-gap.md`).  

---

## 2. Rangkuman Kesiapan Manual UAT

- **Logika & Backend Gate:** 100% Lulus Otomatis (23/23).
- **Instruksi Eksekusi Lapangan:** Siap diuji secara interaktif oleh tim Estimator dan Direksi segera setelah staging URL aktif.
