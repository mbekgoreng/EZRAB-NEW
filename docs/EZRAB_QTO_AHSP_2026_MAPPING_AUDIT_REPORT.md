# EZRAB QTO → AHSP 2026 MAPPING AUDIT REPORT

**Tanggal:** 2026-10-19
**Acuan:** `docs/EZRAB_DESIGN_WORKFLOW_VERIFICATION_REPORT.md`, `docs/EZRAB_PRICE_INTEGRITY_AUDIT_REPORT.md`
**Branch:** `integrasi/unified-ui-engine`
**Batasan dipatuhi:** audit saja; tidak ada perubahan canonical AHSP, harga, koefisien, gates, atau Git remote.

## 1. Ringkasan Eksekutif

**Status: PASS WITH GAPS**

Registry AHSP 2026 terverifikasi: **5.742 item** (SDA 1.556, CK 2.859, BM 1.137, SMKK 190), **4.478** dengan harga > 0. Mekanisme mapping yang ada (`ahsp2026PriceIntegration.ts`, identity safety gate) sudah benar secara arsitektur.

**Evaluasi 3 item generik Design-to-RAB:**
| Item Desain | Status | Alasan |
|-------------|--------|--------|
| DSN-W-001 "Dinding bata perimeter" (m³) | **REVIEW_REQUIRED** | 80 kandidat "Pas. Bata Merah" m³ ada, tapi tipe mortar & metode tidak dispesifikasi desain |
| DSN-F-001 "Pelat lantai dasar" (m³) | **REVIEW_REQUIRED** | Kandidat beton fc' 10/15/20 MPa ada, tapi grade tidak dispesifikasi desain |
| DSN-F-002 "Lantai keramik" (m²) | **REVIEW_REQUIRED** | Kandidat 3.9.7.1–4 ada, tapi ukuran keramik tidak dispesifikasi |

**Keputusan: TIDAK ADA auto-mapping.** Semua item generik tetap generik hingga user memilih kandidat secara eksplisit. Ini sesuai aturan integritas.

## 2. Inventarisasi Sumber

### Item Generik Design-to-RAB (3)
| Kode | Uraian | Volume | Satuan | Harga | AHSP |
|------|--------|--------|--------|-------|------|
| DSN-W-001 | Dinding bata perimeter | 20.16 | m³ | null (UNRESOLVED) | null |
| DSN-F-001 | Pelat lantai dasar | 10.8 | m³ | null (UNRESOLVED) | null |
| DSN-F-002 | Lantai keramik | 90 | m² | null (UNRESOLVED) | null |

Sumber: `src/ai-design/DesignSpreadsheet.tsx` → `specToSpreadsheetRows()` → `designToRabBridge.ts`.

### Registry AHSP 2026
| Domain | Jumlah | Dengan Harga > 0 |
|--------|--------|------------------|
| SUMBER_DAYA_AIR | 1.556 | — |
| CIPTA_KARYA | 2.859 | — |
| BINA_MARGA | 1.137 | — |
| SMKK | 190 | — |
| **Total** | **5.742** | **4.478** |

Sumber: `src/data/nationalCostDatabase/masterRegistry.ts` → `ALL_OFFICIAL_AHSP_ITEMS`.

### Mekanisme Mapping yang Ada
1. **`ahsp2026PriceIntegration.ts`**: `toRabPriceStatus()` — mapping status harga; `PRICE_INCOMPLETE` tanpa harga → `PRICE_UNRESOLVED`.
2. **Identity safety gate** (`ahspDisplayPolicy.ts`): `checkAhspIdentitySafety()` — blokir 17 item parsing-problematik.
3. **QTO calculators**: 24 kalkulator dengan mapping teraudit (~5% dari ~462).

## 3. Evaluasi Kandidat per Item

### DSN-W-001 "Dinding bata perimeter" (m³) → REVIEW_REQUIRED
- **KOREKSI 2026-10-19:** Audit awal salah menyatakan NO_MATCH. Pencarian ulang menemukan **80 kandidat** "1 m3 Pas. Bata Merah dengan Mortar..." di m³.
- Kandidat bervariasi: tipe mortar (M/S), metode (manual), beda tinggi.
- **Masalah:** Desain tidak menspesifikasi tipe mortar atau metode pelaksanaan.
- **Butuh keputusan user:** pilih tipe mortar + metode.

### DSN-F-001 "Pelat lantai dasar" (m³) → REVIEW_REQUIRED
- Kandidat: `A.1.03.1a.1` (fc' 10 MPa), `A.1.03.1a.2` (fc' 15 MPa), dst. — beton m³.
- **Masalah:** Desain tidak menspesifikasi mutu beton. Pelat lantai vs lantai kerja vs rabat — lingkup tidak jelas.
- Identity: SAFE (terverifikasi).
- **Butuh keputusan user:** pilih mutu beton + konfirmasi lingkup.

### DSN-F-002 "Lantai keramik" (m²) → REVIEW_REQUIRED
- Kandidat: `3.9.7.1` (8x8cm), `3.9.7.2` (10x10cm), `3.9.7.3` (20x20cm), `3.9.7.4` (30x30cm) — "lantai keramik artistik".
- **Masalah:** Desain tidak menspesifikasi ukuran. Kualifikasi "artistik" mungkin tidak cocok untuk keramik standar.
- Identity: SAFE (terverifikasi untuk 3.9.7.1 dan 3.9.7.4).
- **Butuh keputusan user:** pilih ukuran + konfirmasi jenis.

## 4. Konflik Satuan dan Spesifikasi

| Konflik | Detail |
|---------|--------|
| Dinding m³ vs m² | 0 item konstruksi dinding di m³; 55 di m². Tidak ada konversi yang diizinkan (volume vs luas). **Fail-closed.** |
| Beton grade | Multiple kandidat (fc' 10/15/20). Tidak bisa auto-pilih tanpa spesifikasi. |
| Keramik size | 4 varian ukuran. Tidak bisa auto-pilih tanpa spesifikasi. |
| "Artistik" qualifier | 7 varian artistik vs 26 standar. Spesifikasi desain tidak menyebut "artistik". |

## 5. Item yang Membutuhkan Keputusan Pengguna

1. **Pilih mutu beton** untuk pelat lantai (fc' 10/15/20 MPa atau lainnya).
2. **Pilih ukuran keramik** (8x8/10x10/20x20/30x30 cm) + konfirmasi "artistik" vs standar.
3. **Dinding bata:** tidak ada kandidat konstruksi — user harus input manual atau pilih dari 55 item dinding m² dengan penyesuaian satuan (tidak otomatis).

## 6. Hasil Pengujian (9/9 PASS)

| # | Fixture | Hasil |
|---|---------|-------|
| 1 | Exact match by code (3.9.7.4) | ✅ |
| 1b | Identity SAFE untuk kandidat | ✅ |
| 2 | Varian artistik (7) vs standar (26) → tidak auto-pilih | ✅ |
| 3 | Dinding m³: 0 konstruksi → unit conflict | ✅ |
| 4 | Multiple beton → REVIEW_REQUIRED | ✅ |
| 5 | Bata konstruksi spesifik → NO_MATCH untuk generik | ✅ |
| 6 | Item mapped: ahspCode preserved; generic: null | ✅ |
| 7 | Mapping audit-only (tidak ubah priceStatus) | ✅ |

**Metode:** Registry produksi asli di-bundle → query langsung → 9 assertions.

## 7. Rekomendasi Implementasi Bertahap

**Fase 1 (UI):** Tampilkan kandidat REVIEW_REQUIRED di Design Studio dengan tombol "Pilih" per item. User memilih → `ahspCode` diisi → harga di-resolve via `priceResolver2026`.

**Fase 2 (Validasi):** Saat user memilih kandidat, jalankan `checkAhspIdentitySafety()` + cek kesesuaian satuan. Tolak jika UNIT_CONFLICT.

**Fase 3 (NO_MATCH):** Untuk dinding bata, sediakan alur "Cari AHSP manual" atau "Input harga manual" (sudah ada via SmartAdd).

**Tidak direkomendasikan:** Auto-mapping berdasarkan kemiripan nama. Risiko salah pemetaan terlalu tinggi.

## 8. Risiko yang Belum Terselesaikan

| Risiko | Mitigasi |
|--------|----------|
| User memilih kandidat yang salah | Tampilkan detail spesifikasi + warning; butuh konfirmasi eksplisit |
| 438 kalkulator QTO tanpa mapping AHSP | Di luar scope sprint ini; butuh audit terpisah |
| Item "artistik" vs standar | Butuh klarifikasi domain; jangan asumsikan setara |
| Perubahan canonical di masa depan | Mapping harus re-validasi jika canonical berubah |

## 9. Aturan Integritas Dipatuhi

- ✅ Tidak ada auto-mapping item generik ke kandidat belum terverifikasi
- ✅ Tidak ada perubahan harga null → nol
- ✅ Tidak ada kandidat AI yang ditetapkan sebagai resmi
- ✅ Item generik tidak dihapus
- ✅ Provenance terjaga (`volumeSource: AI_GENERATED`, `ahspCode: null`)
- ✅ Konflik satuan fail-closed
- ✅ Mapping dan pricing diperlakukan sebagai keputusan terpisah
- ✅ Tidak ada perubahan canonical untuk meningkatkan coverage
