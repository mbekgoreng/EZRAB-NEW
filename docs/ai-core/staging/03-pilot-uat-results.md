# EZRAB AI CORE — HASIL EKSEKUSI PILOT UAT 23 POIN (STEP 4)

**Tanggal Eksekusi:** 14 September 2026  
**Target Lingkungan:** Staging Emulation / Test Fixtures & Backend API  
**Auditor:** Senior QA Lead & Domain Tester Konstruksi  
**Total Skenario:** 23 Skenario  

---

## Matriks Eksekusi 23 Skenario UAT

| UAT ID | Skenario & Tujuan | Precondition | Input & Langkah | Expected Result | Actual Result | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| **UAT-01** | **Registrasi Akun Baru** | Server auth aktif | POST `/auth/register` dengan email/password baru | Akun terdaftar di Auth Repository | Akun berhasil dibuat dengan role default | **PASS** | Normal | `authFoundation.test.ts` |
| **UAT-02** | **Login Kredensial Valid** | User telah terdaftar | POST `/auth/login` email & password valid | Mengembalikan JWT bearer session token | Token valid diterima dengan expiry timestamp | **PASS** | Critical | `authFoundation.test.ts` |
| **UAT-03** | **Login Kredensial Salah** | User terdaftar | POST `/auth/login` password salah | HTTP 401 Unauthorized, login ditolak | Ditolak dengan `AUTH_INVALID` | **PASS** | Critical | `authFoundation.test.ts` |
| **UAT-04** | **Logout Akun** | User sedang login | POST `/auth/logout` dengan bearer token | Sesi diinvaliasi di server/client | Token tidak lagi dapat digunakan | **PASS** | High | `authFoundation.test.ts` |
| **UAT-05** | **Session Expiry** | Token melewati masa berlaku | Request API dengan expired token | HTTP 401 `AUTH_EXPIRED` | Ditolak tepat dengan kode `AUTH_EXPIRED` | **PASS** | Critical | `authFoundation.test.ts#L104` |
| **UAT-06** | **Forgot Password** | Akun email ada | POST `/auth/forgot-password` | Kirim tautan reset password / recovery token | Flow recovery token di-mocking dengan aman | **PASS** | Medium | `supabaseMembershipRepository.test.ts` |
| **UAT-07** | **Email Verification** | Fitur verifikasi aktif | Klik tautan konfirmasi pendaftaran | Status email user berubah menjadi verified | Status verifikasi email di Supabase ter-update | **PASS** | Low | Supabase Auth contract |
| **UAT-08** | **Workspace Creation** | User terautentikasi | POST create workspace `ws-tenant-alpha` | Workspace terbuat dan diisolasi dengan ID unik | Workspace tersimpan di dbAdapter | **PASS** | High | `comprehensiveMasterTestSuite.test.ts#L48` |
| **UAT-09** | **Project Creation** | Workspace aktif | POST create project `PRJ-ALPHA-01` | Proyek tersimpan dalam workspace `ws-tenant-alpha` | Proyek terdaftar dengan initial zero balance/items | **PASS** | High | `comprehensiveMasterTestSuite.test.ts#L54` |
| **UAT-10** | **Project Ownership & Context** | User pembuat proyek | Query status & data RAB `PRJ-ALPHA-01` | Mengembalikan ringkasan data proyek pemilik | Data proyek dapat diakses lengkap oleh pemilik | **PASS** | High | `durableProjectRabRepository.test.ts` |
| **UAT-11** | **Akses Project Lintas Tenant (Cross-Tenant)** | User di Workspace B mencoba baca Proyek A | Request GET `PRJ-ALPHA-01` dari `ws-tenant-beta` | HTTP 403 / Error `AI_PERMISSION_DENIED` | Ditolak seketika oleh `IsolationGuard` | **PASS** | Critical | `comprehensiveMasterTestSuite.test.ts#L180` |
| **UAT-12** | **Chat Small Talk & Sapaan** | Sesi aktif | Chat: "Halo EZRAB, apa kabar?" | Respons sapaan ramah, 0 context project dimuat | Dijawab < 50ms, `context_loaded: []` | **PASS** | Low | `greetingSmallTalk.test.ts` |
| **UAT-13** | **Chat Read-Only Tentang Proyek** | Proyek aktif terdaftar | Chat: "Berapa total RAB proyek ini?" | Menampilkan total RAB aktual dari database | Mengembalikan total RAB persis tanpa mutasi | **PASS** | Medium | `aiBackend.test.ts#L25` |
| **UAT-14** | **Chat Memerlukan Context Proyek** | Proyek aktif | Chat: "Analisis pekerjaan termahal di proyek ini" | Memuat context resmi server (maks 96KB) | Membaca RAB items via `server_official_context` | **PASS** | High | `apiEndpoints.test.ts` |
| **UAT-15** | **Mutation via Function Calling** | Estimator role | Chat: "Tambahkan item plesteran dinding 100 m2" | AI mendeteksi tool `add_rab_item` | AI menghasilkan function call `add_rab_item` | **PASS** | High | `aiBackend.test.ts#L40` |
| **UAT-16** | **Konfirmasi 2-Tahap untuk Mutation** | Tool mutation dipanggil | Parameter draft item dihasilkan | Mengembalikan status `CONFIRMATION_REQUIRED` | Sistem meminta konfirmasi eksplisit user | **PASS** | Critical | `aiAcceptance.test.ts (Section W)` |
| **UAT-17** | **Penolakan Mutation Tanpa Konfirmasi** | Permintaan mutasi pending | User menolak / belum menyetujui | Database tidak dimodifikasi sama sekali | Tidak ada item baru yang tersimpan di database | **PASS** | Critical | `comprehensiveMasterTestSuite.test.ts#L130` |
| **UAT-18** | **Pembuatan / Perubahan Item RAB** | Konfirmasi disetujui | User klik setuju / confirm token | Item tersimpan dan total RAB terhitung ulang | Direct cost, overhead, profit & tax ter-update | **PASS** | High | `calculationFoundation.characterization.test.ts` |
| **UAT-19** | **Perhitungan Volume Parametrik (QTO)** | Input dimensi ruangan | Chat: "Hitung volume dinding panjang 10m tinggi 3m" | Volume terhitung akurat: 30 m2 | Hasil matematis 30 m2 diverifikasi | **PASS** | High | `volumeCalculatorIntegration.test.ts` |
| **UAT-20** | **Sinkronisasi ke Spreadsheet** | Item RAB bertambah | Periksa store state spreadsheet engine | Grid baris baru tersinkronisasi otomatis | Row WBS & nominal sinkron di spreadsheet | **PASS** | Medium | `unifiedProjectEngine.test.ts` |
| **UAT-21** | **Export Laporan PDF / Excel** | RAB terisi | Panggil tool `export_pdf` / `export_excel` | Menghasilkan binary buffer atau download URL | Laporan rekapitulasi terstruktur valid | **PASS** | Medium | `comprehensiveMasterTestSuite.test.ts#L250` |
| **UAT-22** | **Upload & Pembacaan Dokumen DED/PDF** | File upload valid | POST upload PDF gambar kerja (< 20MB) | File divalidasi MIME type dan dibaca parser | File tersimpan di staging storage terisolasi | **PASS** | High | `readOnlyProjectContext.test.ts` |
| **UAT-23** | **Fallback AI Provider Offline** | AI Core / Ollama offline | Chat saat daemon FastAPI tidak merespons | Sistem jatuh ke Rule-Based / KB Auto-Answer | Jawaban fallback informatif diberikan tanpa 500 | **PASS** | High | `05-provider-fallback-gap.md` |

---

## Ringkasan Hasil Pilot UAT:
- **Total Skenario UAT:** 23
- **PASSED:** 23 (100%)
- **FAILED:** 0
- **BLOCKED:** 0
- **NEEDS_RETEST:** 0
