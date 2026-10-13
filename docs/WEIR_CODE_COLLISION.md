# WEIR_AHSP_DATABASE — Dokumentasi Tabrakan Kode

## Status: DIPERTAHANKAN TERPISAH (tidak digabung)

## Tabrakan Kode Kritis: `3.1.(1)`

| Aspek | WEIR | Katalog Nasional |
|---|---|---|
| Kode | `3.1.(1)` | `3.1.(1)` |
| Pekerjaan | Beton Siklop K-225 / fc 20 MPa Struktur Tubuh Bendung | Galian Biasa (pekerjaan tanah) |
| Domain | SUMBER_DAYA_AIR | BINA_MARGA |
| Sumber | KP-02 + SE DJBK 2026 | Lampiran V SE DJBK 47/2026 |
| Harga | Ada (WEIR Price DB, Jawa Timur) | null |

**Risiko:** Kode sama, pekerjaan completely berbeda. Jika tercampur, estimator bisa salah pakai harga.

## Struktur WEIR (5 item)

File: `src/engine/weir/weirAhspDatabase.ts`
Tipe: `Map<string, AHSPDefinition>` (exact lookup, no fuzzy)

1. `3.1.(1)` — Beton Siklop K-225 (SDA)
2. `BINA_MARGA_3.2.(1)` — Baja Tulangan BJTS 420B (BM)
3. `BINA_MARGA_3.3.(1)` — Acuan Bekisting (BM)
4. `SDA_JOINT_01` — Sambungan Dilatasi Bendung (SDA)
5. `SDA_WATERSTOP_01` — Waterstop PVC 200mm (SDA)

Price DB terpisah: `weirPriceDatabase.ts` (SE 12/SE/Db/2026, Jawa Timur)

## Konsumen

- `weirCostService.ts` — kalkulasi biaya bendung
- `QtoCalculatorView.tsx:952` — kalkulator QTO bendung (user-facing)
- `WeirAuditTrailPanel`, `WeirCostSummaryPanel` — UI
- 10 file test Phase 6A

## Keputusan

**PERTAHANKAN TERPISAH.** Alasan:
1. Tabrakan `3.1.(1)` blocker teknis
2. Sumber berbeda (KP-02 vs Lampiran IV)
3. Subsystem mandiri (DB + Price DB + Oracle + UI)
4. Mengisi celah (katalog nasional tidak punya item bendung)

## Rencana Masa Depan

Jika diperlukan namespace: `SDA_WEIR_3.1.(1)` dengan alias, migrasi referensi, dan tes pencarian. Membutuhkan persetujuan terpisah.

---
*Didokumentasikan: 2026-10-12 | Tahap 2 Target 6*
