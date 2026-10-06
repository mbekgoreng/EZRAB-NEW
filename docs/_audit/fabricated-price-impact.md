# LAPORAN DAMPAK HARGA KARANGAN — PHASE 1

**Dibuat:** 2026-09-27T07:27:21.846Z
**Calculator disapu:** 194 (dari CoreCalculatorRegistry)
**Sifat:** pengukuran. Tidak ada nilai pada RAB yang diubah.

---

## 1. Ringkasan dampak

| Metrik | Nilai |
|---|---|
| Total pemakaian konstanta karangan | **517** |
| Total nilai terdampak | **Rp 316.280.119.400** |
| KRITIS | 302 pemakaian · Rp 316.205.470.350 |
| TINGGI | 215 pemakaian · Rp 74.649.050 |
| SEDANG | 0 pemakaian · Rp 0 |
| Peringatan bentrok satuan | **0** (mode peringatan, tidak ada yang ditolak) |

## 2. Status kelengkapan harga per calculator

Penanda `priceStatus` baru (Phase 1 langkah 1.1). Tidak ada angka yang berubah.

| Status | Calculator | Arti |
|---|---|---|
| `RESOLVED` | 0 | Semua baris berasal dari sumber harga nyata |
| `REFERENCE_ESTIMATE` | 194 | Ada baris karangan atau estimasi calculator |
| `INCOMPLETE` | 0 | Ada baris tanpa harga sama sekali |

## 3. Pemakaian per lokasi fallback

| Lokasi | Konstanta | Severitas | Pemakaian | Nilai terdampak |
|---|---|---|---|---|
| `src/components/qto/QtoCalculatorView.tsx:945` | (kondisional) | CRITICAL | 88 | Rp 233.005.380.545 |
| `src/components/qto/QtoCalculatorView.tsx:899` | Rp 50.000 | CRITICAL | 152 | Rp 82.923.803.560 |
| `src/components/qto/QtoCalculatorView.tsx:888` | (kondisional) | CRITICAL | 62 | Rp 276.286.245 |
| `src/components/qto/QtoCalculatorView.tsx:865` | (kondisional) | HIGH | 18 | Rp 65.514.050 |
| `src/components/qto/QtoCalculatorView.tsx:918` | Rp 45.000 | HIGH | 189 | Rp 8.505.000 |
| `src/components/qto/QtoCalculatorView.tsx:925` | Rp 45.000 | HIGH | 8 | Rp 630.000 |

## 4. Calculator paling terdampak

| Calculator | Pemakaian | Nilai terdampak |
|---|---|---|
| `dam.body` | 2 | Rp 197.121.138.750 |
| `dam.embankment` | 2 | Rp 39.000.045.000 |
| `dam.rockfill` | 2 | Rp 32.500.045.000 |
| `dam.excavation` | 2 | Rp 11.475.045.000 |
| `dam.fill` | 2 | Rp 4.250.045.000 |
| `embung.reservoir` | 2 | Rp 4.064.854.500 |
| `road.material_hauling` | 2 | Rp 3.468.795.000 |
| `embung.excavation` | 2 | Rp 2.109.720.095 |
| `dam.filter` | 2 | Rp 1.518.795.000 |
| `road.subgrade` | 2 | Rp 1.480.045.000 |
| `road.embankment` | 2 | Rp 1.387.545.000 |
| `road.geotextile` | 2 | Rp 1.320.045.000 |
| `road.rigid_pavement` | 2 | Rp 1.050.045.000 |
| `road.prime_coat` | 2 | Rp 1.050.045.000 |
| `road.tack_coat` | 2 | Rp 1.050.045.000 |
| `dam.protection` | 2 | Rp 1.050.045.000 |
| `road.kerb` | 2 | Rp 960.045.000 |
| `river.excavation` | 2 | Rp 956.295.000 |
| `embung.embankment` | 2 | Rp 919.732.500 |
| `bridge.reinforcement` | 2 | Rp 750.045.000 |
| `road.geogrid` | 2 | Rp 603.795.000 |
| `road.lean_concrete` | 2 | Rp 518.445.000 |
| `river.backfill` | 2 | Rp 500.045.000 |
| `embung.protection` | 2 | Rp 467.545.000 |
| `road.traffic_barrier` | 2 | Rp 360.045.000 |
| `river.segment` | 2 | Rp 360.045.000 |
| `dam.spillway` | 2 | Rp 350.045.000 |
| `road.excavation` | 2 | Rp 272.045.000 |
| `irrigation.canal` | 2 | Rp 243.045.000 |
| `ATAP_BAJA_RINGAN` | 6 | Rp 208.661.450 |

## 5. Verifikasi kasus Weir Body

Kasus acuan dari Phase 0: L=25, H=3,5, Wc=2, Wb=6 → 350 m³.

| Field | Nilai |
|---|---|
| Quantity | 350 m³ |
| Grand total | Rp 17.500.000 |
| Implied unit price | Rp 50.000 / m³ |
| priceStatus | `REFERENCE_ESTIMATE` |
| Baris karangan | 1 |

Peristiwa telemetri untuk `weir.body`: **2**
- `qto.material.last-resort` · Rp 50.000 × 350 m³ = Rp 17.500.000 · item "Beton Siklop K-225 / Pasangan Batu Kali 1:3 Tubuh Bendung"
- `qto.equipment.implicit-default` · Rp 45.000 × 1 ls = Rp 45.000 · item "Alat Bantu Konstruksi & Pengadukan"

## 6. Peringatan bentrok satuan (unit guard, mode peringatan)

Total peringatan: **0**

| Jenis | Jumlah |
|---|---|
| `UNIT_MISMATCH` | 0 |
| `SUBSTRING_ONLY_MATCH` | 0 |
| `REGION_DEFAULTED` | 0 |

> Catatan: resolver harga (`priceResolver`) tidak dijalankan oleh jalur UI QTO,
> sehingga peringatan di atas hanya muncul dari jalur yang memang memakai resolver.
> Angka 0 di sini bukan berarti bug satuan tidak ada — artinya jalur tersebut tidak menyentuh resolver.

## 7. Katalog lengkap lokasi konstanta

| ID | Berkas:baris | Konstanta | Severitas |
|---|---|---|---|
| `qto.material.keyword-branch` | `src/components/qto/QtoCalculatorView.tsx:888` | (kondisional) | CRITICAL |
| `qto.material.last-resort` | `src/components/qto/QtoCalculatorView.tsx:899` | Rp 50.000 | CRITICAL |
| `qto.labor.role-default` | `src/components/qto/QtoCalculatorView.tsx:865` | (kondisional) | HIGH |
| `qto.equipment.implicit-default` | `src/components/qto/QtoCalculatorView.tsx:918` | Rp 45.000 | HIGH |
| `qto.equipment.last-resort` | `src/components/qto/QtoCalculatorView.tsx:925` | Rp 45.000 | HIGH |
| `qto.borongan.title-keyword` | `src/components/qto/QtoCalculatorView.tsx:945` | (kondisional) | CRITICAL |
| `bridge.ahsp.fabricated-unit-price` | `server/services/authoritativeAhspPriceBridge.ts:183` | Rp 1.150.000 | CRITICAL |
| `rabdraft.borongan.default` | `server/services/automaticRabDraftEngine.ts:133` | Rp 150.000 | HIGH |
| `projectprice.material.default` | `src/engine/pricing/projectPriceEngine.ts:851` | Rp 74.000 | CRITICAL |
| `projectprice.material.default-fallback` | `src/engine/pricing/projectPriceEngine.ts:988` | Rp 74.000 | CRITICAL |
| `parametric.borongan.default` | `src/engine/parametricVolumeEngine/parametricVolumeEngine.ts:242` | Rp 150.000 | HIGH |
| `ahspcalc.zero-as-estimate` | `src/engine/ahspCalculationEngine.ts:45` | (kondisional) | MEDIUM |

## 8. Gerbang keluar Phase 1

| Syarat | Status |
|---|---|
| Laporan dampak tersedia | ✅ dokumen ini |
| Tidak ada perubahan angka RAB existing | ✅ hanya penambahan metadata `priceSource`/`priceStatus` |
| Telemetri aktif pada 5 sistem harga | ✅ UI QTO, bridge AHSP, RAB draft, project price, parametric, AHSP calc |
| Unit guard dipasang dalam mode peringatan | ✅ `priceResolver` |
| Default overhead/profit/PPN disatukan | ✅ `costPolicyDefaults.ts` (pdfExporter kini 5%, bukan 10%) |
| `tsc --noEmit` | ✅ exit 0 |
