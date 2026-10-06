# PHASE 1 — FREEZE FABRICATED PRICES (SELESAI)

**Tanggal:** 2026-09-27
**Dasar:** `docs/pricing-engine-audit.md` §16 — "Phase 1 — Bekukan harga karangan (non-breaking)"
**Sifat perubahan:** aditif + satu koreksi inkonsistensi default. **Tidak ada angka RAB yang diubah.**

---

## 1. Gerbang keluar Phase 1

| Syarat (dari §16) | Status | Bukti |
|---|---|---|
| Laporan dampak harga karangan tersedia | ✅ | `docs/_audit/fabricated-price-impact.md` |
| Tidak ada perubahan angka pada RAB yang sudah ada | ✅ | Hanya penambahan metadata; test non-breaking lulus |
| Telemetri aktif pada 5 sistem harga | ✅ | 6 modul disambungkan (A–E) |
| Unit guard dipasang dalam mode peringatan | ✅ | `priceResolver.ts` — tidak menolak apa pun |
| Default OH/profit/PPN disatukan | ✅ | `costPolicyDefaults.ts` (pdfExporter 10% → 5%) |
| `tsc --noEmit` | ✅ | exit 0 |
| `npm run test:all` | ✅ | exit 0, seluruh suite 0 FAILED |

---

## 2. Hasil pengukuran (inti Phase 1)

`npx tsx scripts/phase1FabricatedPriceImpact.ts` menyapu **194 calculator** melalui replika persis jalur harga UI, dengan telemetri terpasang.

| Metrik | Nilai |
|---|---|
| Total pemakaian konstanta karangan | **517** |
| Total nilai terdampak | **Rp 316.280.119.400** |
| KRITIS | 302 pemakaian · Rp 316.205.470.350 |
| TINGGI | 215 pemakaian · Rp 74.649.050 |
| Calculator berstatus `RESOLVED` | **0 / 194** |
| Calculator berstatus `REFERENCE_ESTIMATE` | **194 / 194 (100%)** |

**Kesimpulan yang tidak bisa dihindari:** tidak ada satu pun dari 194 calculator yang seluruh baris harganya berasal dari sumber harga nyata. Semuanya menyentuh minimal satu konstanta karangan.

### Verifikasi ulang kasus acuan Weir Body

| Field | Nilai | Status |
|---|---|---|
| Quantity | 350 m³ | sesuai formula |
| Grand total | Rp 17.500.000 | **tidak berubah** |
| Implied unit price | Rp 50.000 / m³ | **tidak berubah** |
| `priceStatus` | `REFERENCE_ESTIMATE` | penanda baru |
| Peristiwa telemetri | 2 (`qto.material.last-resort` 350 × Rp 50.000; `qto.equipment.implicit-default` 1 × Rp 45.000) | terbukti |

Angka Rp 17.500.000 yang direproduksi lewat jalur terinstrumentasi **sama persis** dengan hasil audit Phase 0. Ini membuktikan instrumentasi tidak menggeser perilaku.

### Pemakaian per lokasi fallback

| Lokasi | Konstanta | Severitas | Pemakaian | Nilai terdampak |
|---|---|---|---|---|
| `QtoCalculatorView.tsx:945` (borongan dari judul) | kondisional | KRITIS | 88 | Rp 233.005.380.545 |
| `QtoCalculatorView.tsx:899` (`\|\| 50000`) | Rp 50.000 | KRITIS | 152 | Rp 82.923.803.560 |
| `QtoCalculatorView.tsx:888` (cabang kata kunci) | kondisional | KRITIS | 62 | Rp 276.286.245 |
| `QtoCalculatorView.tsx:865` (upah dari peran) | kondisional | TINGGI | 18 | Rp 65.514.050 |
| `QtoCalculatorView.tsx:918` (alat implisit) | Rp 45.000 | TINGGI | 189 | Rp 8.505.000 |
| `QtoCalculatorView.tsx:925` (alat last-resort) | Rp 45.000 | TINGGI | 8 | Rp 630.000 |

**64% dari nilai terdampak berasal dari satu blok 34 baris** (`QtoCalculatorView.tsx:945-978`) yang memilih harga borongan dari kata kunci judul calculator.

### Catatan jujur tentang unit guard

Peringatan bentrok satuan yang terekam: **0**.

Ini bukan berarti bug `zak` ↔ `kg` tidak ada. Artinya **jalur UI QTO tidak pernah menyentuh `priceResolver`** — ia punya logika harganya sendiri. Guard sudah terpasang dan akan mulai melaporkan begitu Phase 2 mengalihkan UI QTO ke resolver. Laporan menuliskan hal ini secara eksplisit agar angka 0 tidak disalahartikan sebagai "aman".

---

## 3. Perubahan berkas

### Berkas baru

| Berkas | Isi |
|---|---|
| `src/engine/pricing/telemetry/fabricatedPriceTelemetry.ts` | Katalog 12 lokasi konstanta karangan + buffer peristiwa + agregasi + katalog `CostPriceSourceKind`/`CostPriceStatus` |
| `src/engine/pricing/telemetry/priceResolutionWarnings.ts` | Buffer peringatan resolusi harga + `normalizeUnitKey` (m³ → m3) |
| `src/engine/cost/policy/costPolicyDefaults.ts` | Satu sumber default OH/profit/PPN/kontingensi (audit C-10) |
| `scripts/phase1FabricatedPriceImpact.ts` | Script laporan dampak (read-only) |
| `src/test/phase1FabricatedPriceTelemetry.test.ts` | 8 test Phase 1 |
| `docs/_audit/fabricated-price-impact.md` | Laporan dampak (hasil) |

### Berkas yang diubah

| Berkas | Perubahan | Angka berubah? |
|---|---|---|
| `src/components/qto/QtoCalculatorView.tsx` | Telemetri di 6 titik; tambah `priceSource` per baris + `priceStatus` per panel; deps `useMemo` dilengkapi | ❌ tidak |
| `src/engine/pricing/resolver/priceResolver.ts` | Unit guard + peringatan pencocokan substring (warning-only) | ❌ tidak |
| `src/engine/pricing/projectPriceEngine.ts` | Telemetri untuk Rp 74.000 (2 lokasi) | ❌ tidak |
| `src/engine/parametricVolumeEngine/parametricVolumeEngine.ts` | Telemetri untuk Rp 150.000 | ❌ tidak |
| `src/engine/ahspCalculationEngine.ts` | Telemetri untuk `unitPrice = 0` berlabel "Estimasi Standar" | ❌ tidak |
| `server/services/authoritativeAhspPriceBridge.ts` | Telemetri untuk Rp 1.150.000 | ❌ tidak |
| `server/services/automaticRabDraftEngine.ts` | Telemetri untuk Rp 150.000 borongan | ❌ tidak |
| `src/export/pdfExporter.ts` | Profit default 10% → 5% via `costPolicyDefaults` | ⚠️ **ya, jika `costSummary.profitPercent` tidak ada** |
| `package.json` | Tambah `test:phase1`, dimasukkan ke `test:all` | ❌ tidak |

**Satu-satunya perubahan angka** ada di `pdfExporter.ts`. Itu memang tujuan langkah 1.5: menyamakan dokumen dengan layar. RAB existing menyimpan `profitPercent` eksplisit (5%), sehingga nilai yang tersimpan **tidak** terpengaruh; hanya kasus `profitPercent` hilang yang kini menghasilkan 5% alih-alih 10% — yaitu kondisi yang sebelumnya membuat PDF berbeda dari layar.

---

## 4. Kontrak invarian yang sekarang dijaga test

`src/test/phase1FabricatedPriceTelemetry.test.ts` (8 test, semua lulus):

1. `recordFabricatedPrice` mengembalikan `void` — telemetri **tidak bisa** dipakai sebagai sumber harga.
2. Site id tak dikenal diabaikan, bukan melempar error.
3. Agregasi benar per site, per calculator, per severitas.
4. Setiap entri katalog punya id unik, berkas, dan nomor baris.
5. `normalizeUnitKey` menyeragamkan `m³`/`m3`/` M3 `; recorder tidak menolak apa pun.
6. `resolvePolicyValue` mengembalikan nilai eksplisit apa pun (termasuk `0`), dan hanya memakai default bila nilai tidak ada.
7. **`weir.body` tetap 350 m³ dan Rp 17.500.000** — Phase 1 tidak "memperbaiki" angka secara diam-diam.
8. Semua suite lama tetap lulus (`npm run test:all` → exit 0).

Test nomor 7 adalah yang paling penting: ia mengunci perilaku sehingga Phase 2 tidak bisa diam-diam mengubah total ketika menghapus konstanta.

---

## 5. Yang **belum** dikerjakan (dan sengaja)

Phase 1 tidak menghapus satu pun konstanta karangan. Sesuai rencana, penghapusan ada di Phase 2 — dan hanya boleh dilakukan **setelah** data harga ber-region tersedia. Kalau konstanta dihapus lebih dulu, seluruh 194 calculator akan menampilkan "HARGA BELUM TERSEDIA" secara serentak (risiko R-01 di §13 laporan audit).

| Item | Phase |
|---|---|
| Hapus konstanta, alihkan UI QTO ke `PriceResolver` | 2 |
| `CostPolicyEngine` tunggal (menggantikan `costPolicyDefaults`) | 2 |
| Unit guard mode penegakan | 2 |
| `WorkItemRegistry` + pemetaan AHSP 194 calculator | 3 |
| Scope-based Bendung/Bendungan | 3 |
| Rekonsiliasi 1.943 item AHSP tidak konsisten | 4 |
| Impor harga e-HSD per kabupaten/kota | 5 |
| UI "HARGA BELUM TERSEDIA" + panel Audit Calculation | 6 |

---

## 6. Cara mereproduksi

```bash
npx tsx scripts/phase1FabricatedPriceImpact.ts   # → docs/_audit/fabricated-price-impact.md
npx tsx src/test/phase1FabricatedPriceTelemetry.test.ts
npx tsc --noEmit
npm run test:all
```

Verifikasi interaktif di browser: telemetri dipasang di `globalThis`:

```js
__EZRAB_FABRICATED_PRICE_TELEMETRY__.summarize()
__EZRAB_FABRICATED_PRICE_TELEMETRY__.events()
__EZRAB_PRICE_RESOLUTION_WARNINGS__.summarize()
```

---

## 7. Temuan tambahan di luar Phase 1

**Lampiran II SE DJBK No. 47/2026 sudah tersedia di workspace.**

```
Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf  (21,5 MB)
MD5 96e4a1b33f7b514ea785baf6086bcd80
```

Identik byte-per-byte dengan `bina_marga_downloaded.pdf`, dan `bina_marga_toc.txt` sudah memuat **7.775 baris** daftar isi AHSP Bina Marga hasil ekstraksi (halaman 4 dst).

Laporan audit sebelumnya menyatakan lampiran SE belum tersedia sehingga migrasi AHSP 2026 `BLOCKED`. Untuk **AHSP Bina Marga**, kondisi itu tidak lagi akurat — lampirannya ada dan TOC-nya sudah terbaca. Yang masih kurang: Lampiran III (SDA), IV (Cipta Karya), dan lampiran harga (e-HSD).

Konsekuensi: **Phase 4 (rekonsiliasi AHSP) dapat dimulai untuk domain Bina Marga tanpa menunggu unduhan tambahan.** Perlu keputusan Boss apakah ingin mulai dari sana.
