# EZRAB — RAB & AHSP Integrity Audit (2026-10-20)

Metode: penelusuran kode engine + eksekusi test suite + recomputation independen (golden check) dari file canonical hasil generate. Branch `integrasi/unified-ui-engine` @ `dd81439`.

## Putusan: PASS WITH GAPS
Integritas perhitungan inti **terbukti kuat**: harga unresolved tidak pernah bocor menjadi Rp0 di total, recomputation cocok persis, dan gate satuan menolak item tak kompatibel dari total. Gap berada di data (antrean review) dan ekspor Excel.

## 1. Dataset AHSP canonical — CONFIRMED
File: `src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts`
- Total **5.801 item**: CK 2.859 · SDA 1.556 · BM 1.163 · SMKK 223.
- Status: VERIFIED 4.752 · NEEDS_REVIEW 1.048 · SOURCE_DEFECT 1.
- Harga tersimpan di file: 3.643 item berharga > 0; **2.158 item `unitPrice: null`**; **0 item** berharga literal 0 — tidak ada Rp0 tersembunyi. Di level komponen (33.011): 16.210 berharga, 16.801 null, **0 bernilai 0**. (Pada resolusi runtime via registry, 5.466 item memperoleh harga dan 335 tetap unresolved — lapisan resolusi, berbeda dari hitungan file mentah.)
- Temuan data (P3): 1 item SOURCE_DEFECT + 50 item SMKK berstatus AMBIGUOUS menunggu keputusan sumber resmi (SE DJBK 47/2026). Bukan cacat kode.

## 2. Golden recomputation — CONFIRMED (3/3 persis)
| Item | Hitung ulang | Tersimpan |
|---|---|---|
| CK `2.2.2.3` (Pondasi Batu Belah) | 42.297 | 42.297 |
| BM `G.74` (Dinding Penahan Beton Bertulang) | 5.695.974 | 5.695.974 |
| SDA `03.02.01.06.01` (Galian Tanah Biasa — Alat) | 1.668.160 | 1.668.160 |

## 3. Sentinel harga & total — CONFIRMED by design
- `src/engine/rab/rabItemFactory.ts`: harga belum terselesaikan = null → diterjemahkan menjadi sentinel `unitPrice: 0` + `priceStatus: 'PRICE_UNRESOLVED'`. **Ini desain disengaja, bukan bug.**
- `src/engine/rabTotals.ts:37-62`: akumulator grand total hanya menjumlahkan baris resolved & finite; baris unresolved/NaN berkontribusi 0 **dan** dihitung sebagai `unresolvedCount`/`unresolvedVolume` untuk peringatan UI.
- Semua jalur buat item (termasuk impor Excel & SmartAdd) melewati factory tunggal.

## 4. Gate satuan (UNIT_MISMATCH) — CONFIRMED
- `src/engine/pickCanonical.ts:37`, `src/engine/pickPrice.ts:50`: item satuan tak kompatibel ditandai `UNIT_MISMATCH`, dipaksa PRICE_UNRESOLVED, dikeluarkan dari total terverifikasi (ProjectContext:114-131; RabEstimasiView:391).
- Populasi terdampak kecil: 3 item `unitPriceAmbiguous` di canonical.

## 5. Undo/redo — CONFIRMED
- Satu-satunya implementasi: `ProjectHistory` di RabEstimasiView (implementasi duplikat di ProjectContext sudah dihapus sebelumnya).
- Guard input terverifikasi: Ctrl+Z di dalam input/textarea/contentEditable diabaikan (perbaikan commit 6b5ea57).

## 6. Temuan

### EXP-01 — Formula Excel rusak oleh awalan `=` ganda — **P1 · CONFIRMED**
- File: `src/export/excelExportEngine.ts`. **18 penetapan** memakai `` formula: `=IFERROR(...` `` (baris 1560, 1588, 1651, 1652, 1682, 1710, 1713, 1820–1828, 1830, 1831, 1923) — semua di builder sheet jadwal/Kurva-S/cashflow. ExcelJS mengharapkan TANPA `=`; pola benar dipakai 25 penetapan lain di file yang sama (mis. baris 548, 786, 951).
- Dampak: nilai cache tersimpan membuat file *tampak* benar saat pertama dibuka, tetapi formula bobot jadwal, kumulatif Kurva-S, dan cashflow-net **tidak menghitung ulang** — deliverable inti estimator terdegradasi diam-diam.
- Remediasi: hapus `=` di 18 titik + test regresi yang memastikan tidak ada string formula diawali `=`.

### RAB-01 — Kebijakan pembulatan resolver tidak konsisten — **P2 · CONFIRMED**
- `src/data/priceDatabase2026/resolver.ts:663-665`: harga satuan akhir dibulatkan ke rupiah penuh, subtotal kategori hanya 2 desimal → Σ subtotal ≠ harga satuan (selisih tepat Rp 0,5 pada item uji `A.1.02.4a.1.d`: 219.791 vs 219.790,5). Assertion `test:price` TEST 3 merah karenanya.
- Sapuan recomputation atas 1.866 item VERIFIED berharga lengkap: **1.531 cocok persis; 335 berbeda — seluruhnya sub-rupiah** dan 100% terjelaskan oleh pembulatan ini. Tidak ditemukan selisih harga yang tak terjelaskan.
- Remediasi: pilih satu kebijakan pembulatan (subtotal ikut rupiah penuh, atau harga satuan tidak dibulatkan) dan selaraskan test.

### AHSP-01 — Invariant test:price bertentangan dengan desain generator — **P2 · CONFIRMED**
- `src/test/priceDatabase2026.test.ts:262-271` menegaskan NOL komponen berharga di canonical; kenyataannya 16.210 dari 33.011 komponen membawa harga HSD **by design** (sesuai header file generate). Suite merah karena konflik keputusan arsitektur, bukan korupsi data. Putuskan arsitektur yang dimaksud, perbarui sisi yang kalah.

### AHSP-03 — Item VERIFIED berharga upah saja — **P3 · LIKELY**
- `A.1.02.4a.1.d` (VERIFIED): harga tersimpan = total upah saja; komponen material (Batu Kali, koefisien 1,25) ber-`unitPrice: null`. Resolver runtime mengklasifikasikannya PARTIAL (jujur), tetapi harga canonical + status VERIFIED patut dicek ke sumber SE DJBK 47/2026.

### AHSP-02 — Antrean review data — **P3 · CONFIRMED**
- 1.048 NEEDS_REVIEW + 335 harga unresolved + 50 SMKK AMBIGUOUS. Fail-closed sudah benar: semua tampil berlabel, tidak masuk total terverifikasi. Penutupan antrean menunggu verifikasi dokumen resmi, bukan perubahan kode.

## 7. Konsistensi UI ↔ engine ↔ ekspor
- UI dan total memakai resolver yang sama (priceStatus sebagai sumber kebenaran tunggal; audit integritas harga sesi sebelumnya 23/23 PASS).
- Ekspor Excel memakai data RAB yang sama; satu-satunya putus konsistensi adalah EXP-01 (formula), bukan angka sumber.
