# PHASE 5 — VISION AI DED EXTRACTION: VALIDATION & CONFLICT POLICY
**Date:** 14 September 2026  
**Status:** **APPROVED VALIDATION POLICY**  

---

## 1. Dimensional Validation Rules

1. **Physical Plausibility Boundaries:**
   - Lebar/Panjang Bangunan: $2.0\text{m} \le W, L \le 200.0\text{m}$.
   - Tinggi Lantai / Dinding: $2.0\text{m} \le H \le 6.0\text{m}$ per lantai.
   - Tebal Dinding: $0.07\text{m} \le t \le 0.35\text{m}$.
   - Tebal Sloof / Balok: $0.10\text{m} \le b \le 1.00\text{m}$.
   - Lebar Pintu: $0.60\text{m} \le W_{\text{pintu}} \le 3.00\text{m}$.
   - Kemiringan Atap: $5^\circ \le \theta \le 60^\circ$.

2. **Sum-of-Parts Consistency:**
   $$\sum \text{Lebar Ruangan Interior} + \sum \text{Tebal Dinding} \approx \text{Lebar Total Bangunan}$$
   Toleransi perbedaan diizinkan maksimal $3\%$. Jika selisih $> 3\%$, sistem memberikan warning `DIMENSIONAL_SUM_MISMATCH`.

---

## 2. Cross-Page Conflict Detection Engine

| Jenis Konflik | Skenario Nyata | Kebijakan Sistem EZRAB |
|---|---|---|
| **Denah vs Potongan** | Denah menunjukkan $W=6.0\text{m}$, Potongan A-A menunjukkan $W=6.5\text{m}$. | Tandai sebagai `CONFLICT (DIMENSION_MISMATCH)`. Jangan memilih angka terbesar/terkecil secara diam-diam. Minta konfirmasi user di UI Review. |
| **OCR Typos vs Visual Grid** | OCR membaca $8.00\text{m}$ padahal grid struktur $3.00\text{m}$. | Confidence score diturunkan $< 0.50$. Tandai `NEEDS_REVIEW`. |
| **Perbedaan Kolom Denah vs Detail** | Denah arsitektur memuat 12 kolom praktis, detail struktur mencantumkan 14 kolom. | Tandai `CONFLICT (COLUMN_COUNT_MISMATCH)`. Tampilkan daftar lokasi kolom yang berbeda. |
| **Bukaan di Luar Dinding** | Pintu terdeteksi pada koordinat $x = 7.5\text{m}$ pada dinding dengan panjang $6.0\text{m}$. | Tandai `INVALID_GEOMETRY_LOCATION`. Cegah rendering ke 3D viewer sampai diperbaiki. |

---

## 3. Strict Conflict Resolution Hierarchy

1. **User Overrides Always Win:** Jika pengguna mengoreksi nilai di UI Review, nilai tersebut menjadi `USER_CORRECTION` dengan confidence $1.00$.
2. **Detail Struktural > Gambar Umum (Default Suggestion Only):** Untuk dimensi penampang (misal sloof 15/20), detail struktur disarankan sebagai opsi rekomendasi, namun tetap membutuhkan konfirmasi klik oleh pengguna.
3. **No Automatic Heuristic Override:** Sistem dilarang menghapus peringatan konflik tanpa rekaman `resolvedValue` dan `resolutionNote`.
