# EZRAB — RENCANA PENGUJIAN AKSEPTANSI (ACCEPTANCE TEST PLAN)
**Dokumen:** `docs/interactive-rab-wizard/08-test-plan.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. SUITE PENGUJIAN AKSEPTANSI (14 SKENARIO)

1. **Test 1:** "Buatkan RAB Rumah" -> Muncul pilihan tipe rumah (T36, T45, T70, T36 2Lt, Custom).
2. **Test 2:** "Buatkan RAB Jalan" -> Muncul pilihan jenis perkerasan (Aspal, Beton, Paving, Makadam).
3. **Test 3:** "Buatkan RAB Bangunan Air" -> Muncul pilihan jenis bangunan air (Saluran, Embung, dsb).
4. **Test 4:** User klik Rumah Type 36 -> Template `HOUSE-T36-1FL` terpilih dan pertanyaan spesifikasi muncul.
5. **Test 5:** Natural Language Partial Input ("Buatkan RAB rumah type 36 di Bojonegoro, luas 6x12") -> Ekstrak parameter yang ada dan hanya tanyakan yang belum lengkap.
6. **Test 6:** User mengisi semua parameter -> Tampilkan summary kartu preview sebelum kalkulasi.
7. **Test 7:** User belum klik konfirmasi -> Nol mutasi ke database proyek/spreadsheet.
8. **Test 8:** User klik "Hitung Preview RAB" -> `CalculationService` menghasilkan breakdown direct cost, overhead, profit, PPN 11%, dan grand total.
9. **Test 9:** User mengubah parameter -> Preview lama ditandai stale dan dihitung ulang.
10. **Test 10:** User klik "Batalkan" -> Sesi wizard dihapus tanpa efek samping.
11. **Test 11:** Percobaan akses session wizard milik workspace lain -> Ditolak backend dengan kode `AI_PERMISSION_DENIED`.
12. **Test 12:** Parameter di luar batas (misal: luas rumah = 0 atau 50000 m²) -> Pesan validasi muncul jelas.
13. **Test 13:** Pilihan "Bendungan" -> Status `ENGINEERING_REVIEW_REQUIRED` muncul tanpa kalkulasi sembarangan.
14. **Test 14:** Regression test seluruh test suite 28 skenario lama tetap lulus 100%.
