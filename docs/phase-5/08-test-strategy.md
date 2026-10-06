# PHASE 5 — VISION AI DED EXTRACTION: TEST STRATEGY
**Date:** 14 September 2026  
**Status:** **APPROVED TEST STRATEGY**  

---

## 1. Test Suite Categories & Coverage Plan

```
server/test/visionDedExtraction/
├── fileIntakeValidation.test.ts          # Validasi ukuran file, tipe MIME, checksum idempotency
├── pdfRasterizerPreprocessing.test.ts    # Uji rasterisasi PDF ke PNG 300 DPI, contrast, deskew
├── visionModelAdapterMultimodal.test.ts  # Uji parsing payload multimodal & response JSON schema
├── unitNormalizationScale.test.ts        # Uji normalisasi mm/cm/m dan kalkulasi skala 1:100
├── conflictDetectionEngine.test.ts       # Uji deteksi konflik dimensi lintas halaman
├── humanReviewParameterLocking.test.ts   # Uji transisi status NEEDS_REVIEW -> APPROVED
└── endToEndDedToRabIntegration.test.ts   # Uji integrasi DED -> Template -> Volume -> 3D Viewer
```

---

## 2. Synthetic Test Fixtures (Zero PII / Anonymized)

1. **`fixture-ded-house-t36.synthetic.json`**: Data synthetic denah rumah tipe 36 ($6 \times 6\text{m}$) dengan 6 ruangan dan 12 kolom.
2. **`fixture-ded-conflict-house-t45.synthetic.json`**: Data synthetic dokumen dengan konflik sengaja (Denah $6 \times 7.5\text{m}$ vs Potongan $6 \times 8.0\text{m}$) untuk memverifikasi `ConflictRecord`.
3. **`fixture-ded-road-500m.synthetic.json`**: Data synthetic trase jalan beton Bina Marga $500\text{m} \times 6.0\text{m}$.
4. **`fixture-ded-uditch-100m.synthetic.json`**: Data synthetic saluran U-Ditch $100\text{m} \times 40\times 40\text{cm}$.

---

## 3. Mocking Strategy & Cost Safety

- **Default Unit Testing:** Menggunakan in-memory `MockVisionAdapter` yang mengembalikan respon deterministik instan tanpa biaya token cloud dan tanpa ketergantungan koneksi internet.
- **Privacy Assurance:** Tidak ada dokumen rahasia milik pengguna yang diunggah ke layanan pihak ketiga selama fase pengujian otomatis.
