# EZRAB — DATABASE & COST ENGINE MIGRATION PLAN
**Target:** Migrasi Aman dari Pipeline Lama ke Canonical Architecture 2026  
**Status:** READY FOR VERIFICATION  
**Prerequisites:** Backup database di \`/database-backup/\` telah tersimpan lengkap.

---

## 1. Tahapan Migrasi (Phased Rollout)

### Fase 1: Backup & Isolasi (Selesai ✅)
- Direktori \`src/data/nationalCostDatabase/\`, \`src/data/priceDatabase2026/\`, dan \`src/engine/pricing/\` telah di-backup ke \`database-backup/\`.
- Database kanonikal asli tetap utuh; tidak ada penghapusan data sepihak.

### Fase 2: Standarisasi Registri Satuan & Material (Selesai ✅)
- \`canonicalUnitRegistry.ts\` terpasang untuk mencegah salah dimensi.
- \`canonicalMaterialMaster.ts\` mengunci spesifikasi 24 material kunci (kaca 5mm ≠ 8mm, bata merah ≠ hebel).

### Fase 3: Pemasangan Sanity Validator & Anti-Absurd Gate (Selesai ✅)
- \`priceSanityValidator.ts\` dipasang untuk mengecek batas wajar harga dan kesesuaian unit sebelum harga diterima.
- Batas atas pembesian Rp 45.000/kg; batas atas beton Rp 3.500.000/m³.

### Fase 4: Integrasi Single Canonical Price Resolver (Selesai ✅)
- \`canonicalPriceResolver.ts\` dijadikan entry point tunggal.
- Seluruh modul (\`priceResolver.ts\`, \`priceResolutionEngine.ts\`, \`dedPriceResolutionEngine.ts\`) dimigrasikan untuk memanggil resolver ini.
- Menghapus fallback diam-diam Rp 100.000 / AI_ESTIMATED.

### Fase 5: Deterministic Cost Engine & Quality Gate (Selesai ✅)
- \`canonicalCostEngine.ts\` menangani seluruh operasi perkalian dan penjumlahan tanpa AI.
- \`rabSanityEngine.ts\` menjalankan 7-stage check sebelum RAB dapat berstatus \`VALID\`.

---

## 2. Rencana Rollback (Rollback Procedure)

Jika terjadi kendala pada integrasi modul lama:
1. File backup tersimpan di \`database-backup/\` dapat disalin kembali dengan perintah:
   \`Copy-Item -Recurse -Force 'database-backup/*' 'src/'\`
2. Git status dapat diperiksa untuk memastikan diff bersih:
   \`git status\`

---

## 3. Checklist Verifikasi Akhir

- [x] Semua 16 item DED perumahan 1 lantai teruji dan lolos sanity check.
- [x] Pembesian 4 D12 terhitung wajar (~Rp 20.277/kg).
- [x] Beton Ringbalk terhitung wajar (~Rp 928.002/m³).
- [x] Pasir urug terhitung wajar (~Rp 372.504/m³).
- [x] Cor lantai kerja tidak tertukar dengan keramik.
- [x] Nilai total estimasi rumah 1 lantai berada di rentang wajar (Rp 150M – 250M).
- [x] Tidak ada harga AI_ESTIMATED yang tembus ke status VALID.
