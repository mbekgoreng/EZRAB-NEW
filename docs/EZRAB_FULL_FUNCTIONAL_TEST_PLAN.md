# EZRAB FULL FUNCTIONAL TEST PLAN

## Test ID Format: `FT-{MODUL}-{NOMOR}`

### FT-DASH: Dashboard
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-DASH-01 | Buka /app/dashboard | Halaman tampil tanpa crash |
| FT-DASH-02 | Kartu statistik tampil | Angka dari data aktual atau empty state |
| FT-DASH-03 | Sidebar collapse/expand | Berfungsi |
| FT-DASH-04 | Navigasi antar menu | Route berubah, konten sesuai |

### FT-PROJ: Proyek
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-PROJ-01 | Buat proyek baru | Proyek tersimpan, muncul di daftar |
| FT-PROJ-02 | Validasi field wajib | Error jelas jika kosong |
| FT-PROJ-03 | Edit proyek | Perubahan tersimpan |
| FT-PROJ-04 | Hapus proyek | Konfirmasi, lalu hilang |
| FT-PROJ-05 | Reload persistensi | Data bertahan (localStorage) |

### FT-RAB: RAB & Estimasi
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-RAB-01 | Tambah item manual | Item muncul di tabel |
| FT-RAB-02 | Edit volume/harga | Total terupdate |
| FT-RAB-03 | Hapus item | Item hilang, total terupdate |
| FT-RAB-04 | Harga kosong | Label "belum tersedia", bukan Rp0 |
| FT-RAB-05 | Harga manual | Label jelas |

### FT-QTO: Kalkulator
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-QTO-01 | Buka kalkulator | Form tampil |
| FT-QTO-02 | Input valid | Hasil benar |
| FT-QTO-03 | Input nol/negatif | Validasi atau hasil 0 |
| FT-QTO-04 | Kirim ke RAB | Item dibuat dengan identitas benar |

### FT-AHSP: Database Harga
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-AHSP-01 | Pencarian | Hasil relevan |
| FT-AHSP-02 | Filter domain | Filter berfungsi |
| FT-AHSP-03 | Detail item | Info lengkap |
| FT-AHSP-04 | Item tanpa harga | Status jujur |

### FT-EXP: Export
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-EXP-01 | Export Excel | File terunduh, dapat dibaca |
| FT-EXP-02 | Export PDF | File terunduh, dapat dibaca |

### FT-FIN: Keuangan
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-FIN-01 | Buka /app/finance | Halaman tampil |
| FT-FIN-02 | Grafik arus kas | Data dari proyek atau empty state |

### FT-AI: AI Features
| ID | Test Case | Expected |
|----|-----------|----------|
| FT-AI-01 | Buka Chat AI | UI tampil |
| FT-AI-02 | Provider unavailable | Status jelas, bukan error crash |
| FT-AI-03 | AI Credits | Label SIMULASI terlihat |
