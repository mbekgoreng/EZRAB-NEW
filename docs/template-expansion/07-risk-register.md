# EZRAB — TECHNICAL RISK REGISTER & MITIGATION STRATEGY
## Multi-Disciplinary Template Expansion Risk Management

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** Principal Software Architect, Senior Geotechnical & Cost Estimator  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Matriks Penilaian Risiko Keteknikan

| ID Risiko | Area Risiko | Deskripsi Potensi Kegagalan | Dampak | Probabilitas | Tingkat Keparahan | Strategi Mitigasi Wajib |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | **Dam & Embung** | Kesalahan penaksiran volume tubuh bendungan akibat pengabaian kontur topografi lembah sungai non-simetris. | Sangat Tinggi | Tinggi | **CRITICAL** | Wajib mewajibkan input cross-section minimal pada 5 stationing elevasi. Tandai status `NEEDS_REVIEW` jika kontur tidak lengkap. |
| **RSK-02** | **Hospital (Rumah Sakit)** | Estimasi biaya meleset drastis (>50%) karena mengabaikan spesifikasi khusus ruang operasi (HVAC laminar flow, timbal anti-radiasi, gas medis, limbah B3). | Sangat Tinggi | Tinggi | **CRITICAL** | Pisahkan MEP rumah sakit menjadi modul biaya terisolasi (*Specialized Hospital MEP Cost Driver*). Jangan memakai rasio MEP gedung biasa. |
| **RSK-03** | **Earthwork (Tanah)** | Volume urugan padat kurang dari estimasi akibat salah menghitung faktor kembang-susut (*bulking/shrinkage*) tanah lempung/berpasir. | Tinggi | Tinggi | **HIGH** | Terapkan faktor empiris $F_{swell}$ dan $F_{shrink}$ eksplisit sesuai klasifikasi tanah Unified Soil Classification System (USCS). |
| **RSK-04** | **Road & Pavement** | Pengabaian tebal perkerasan struktural berlapis (Prime Coat, AC-BC, Tack Coat, AC-WC) menghasilkan deviasi material aspal signifikan. | Tinggi | Sedang | **HIGH** | Gunakan `LinearPavementCalculator` dengan pemisahan formula masing-masing lapisan aspal dan density $2.32\text{ ton/m}^3$. |
| **RSK-05** | **Paving Block** | Pengabaian waste pemotongan pola paving di tepi kanstin ($3\text{--}7\%$) dan pasir alas (*bedding sand*). | Sedang | Tinggi | **MEDIUM** | Sertakan asumsi *cutting waste allowance* $5\%$ dan volume pasir bedding tebal 4cm secara otomatis. |
| **RSK-06** | **Bridge & Girder** | Salah penaksiran jumlah balok gelagar dan pengabaian elastomer bearing pad, expansion joint, dan pengujian beban statis/dinamis. | Sangat Tinggi | Sedang | **HIGH** | Formula jembatan wajib mensyaratkan jarak antar girder standar ($1.5\text{--}2.1\text{ m}$) dan jumlah bearing pad ($2 \times N_{girder}$). |
| **RSK-07** | **Hotel Guestrooms** | Duplikasi volume berlebih pada pengulangan kamar tipikal jika parameter koridor dan ruang publik dihitung ganda. | Sedang | Sedang | **MEDIUM** | Pisahkan kalkulasi *Typical Floor Zone* dan *Podium / Public Area Zone* pada template hotel. |
| **RSK-08** | **Hall (Bentang Lebar)**| Mengasumsikan rangka atap kayu/baja ringan untuk bentang $> 20\text{ m}$ alih-alih struktur baja profil berat WF / Space Truss. | Tinggi | Rendah | **HIGH** | Terapkan *boundary rule*: jika bentang $\ge 15\text{ m}$, sistem otomatis mengunci pilihan material ke Baja Profil WF / Space Frame. |
| **RSK-09** | **Drainage Channel** | Kapasitas hidrolis saluran tidak mencukupi karena mengabaikan kemiringan dasar saluran ($S_0$) dan tinggi jagaan (*freeboard*). | Sedang | Sedang | **MEDIUM** | Implementasikan verifikasi hidrolika Manning untuk memastikan dimensi penampang mampu menampung debit rencana $Q_{design}$. |
| **RSK-10** | **Vision OCR Mismatch** | Vision AI salah membaca dimensi milimeter (mm) sebagai sentimeter (cm) atau meter (m) pada gambar DED lama. | Sangat Tinggi | Sedang | **CRITICAL** | Wajibkan unit verification dan *Sanity Check Bounding Box* (contoh: lebar kamar tidak mungkin 300 meter). |

---

## 2. Rincian Penanganan Risiko Khusus

### A. Risiko Rumah Sakit (`BLD-HOSPITAL`)
Biaya konstruksi fisik gedung rumah sakit umumnya hanya menyumbang $40\text{--}50\%$ dari total biaya, sedangkan $50\text{--}60\%$ lainnya didominasi oleh MEP dan kelengkapan spesialisasi:
- **Mitigasi Teknis**: Template `BLD-HOSPITAL` mengunci breakdown WBS khusus:
  1. *WBS-04.08: Ruang Isolasi Bertekanan Negatif*
  2. *WBS-04.09: Dinding & Pintu Pelindung Radiasi Timbal (Pb 2mm)*
  3. *WBS-13.04: Instalasi Sentral Gas Medis (O2, N2O, Vacuum)*
  4. *WBS-14.06: Uninterruptible Power Supply (UPS) & Isolation Transformer Ruang Bedah*
  5. *WBS-18.01: Instalasi Pengolahan Air Limbah Medis (IPAL B3)*

### B. Risiko Pekerjaan Tanah Masif (`CIV-EARTHWORK`)
- **Tabel Koreksi Faktor Tanah Default**:
  - Tanah Pasir / Berbutir: $F_{swell} = 1.10$, $F_{shrinkage} = 0.95$
  - Tanah Lempung Biasa: $F_{swell} = 1.25$, $F_{shrinkage} = 0.88$
  - Tanah Cadas / Berbatu: $F_{swell} = 1.50$, $F_{shrinkage} = 1.20$
  - Tanah Gambut / Organik: **BLOCKED / WARNING: Membutuhkan penyelidikan tanah geoteknik khusus.**

---

## 3. Kebijakan Keamanan Eksekusi (Fail-Safe Policy)

1. **Mandatory Human Verification on High-Risk Flags**:  
   Semua template dengan keparahan `CRITICAL` atau `HIGH` yang memiliki ketidaklengkapan data parameter tidak dapat langsung diaplikasikan ke tabel spreadsheet tanpa konfirmasi manual dari pengguna.
2. **Deterministic Fallback Only**:  
   Jika data tanah atau topografi tidak tersedia, sistem menampilkan nilai acuan SNI terendah yang aman (*conservative baseline*) disertai catatan peringatan terbuka (*transparent assumption note*).
