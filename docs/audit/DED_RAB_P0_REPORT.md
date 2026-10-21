# EZRAB DED–RAB AI — Laporan FASE P0: Klasifikasi PDF & Cakupan 12 Divisi

Tanggal: 2026-10-21 · Repo: `ezrab-unified` @ `ae25c64` (branch `integrasi/unified-ui-engine`)
Mode: audit → implementasi terbatas → tes regresi. **Tidak ada commit/push/deploy** — menunggu persetujuan terpisah.
Fixture verifikasi: PDF rumah 1 lantai 32 halaman (`~/workspace/user/files/pdf-gambar-rumah-1-lantai_compress.pdf`, file milik pengguna, TIDAK disalin ke repo).

---

## 1. Pipeline yang benar-benar live (bukti entry point)

| Flow | Menu | Rantai kode | Status |
|---|---|---|---|
| **A — DED Estimate AI** | `ded-ai` | `WorkspaceView.tsx` (import baris 45, render 492–494) → `DedAiEstimateView` (`src/ai-tools/ded-ai-estimate/view.tsx`) → `dedAiEstimateService` (`src/ai-tools/ded-ai-estimate/service.ts`) → parser/prompts/calculator/wbsClassifier/wbsCatalog di direktori yang sama | **LIVE — inilah yang diperbaiki P0** |
| **B — Magic AI / DED RAB** | `magic-ai`, `ded-rab`, `ai-assistant` | `MagicAiSuperView` → `DedAnalysisDashboard` → `aiEstimatePipeline` (`src/ai-estimate/`) yang di dalamnya memakai `src/ded-rab-v3/*` sebagai ruang mesin | LIVE — **tidak disentuh P0** (sesuai batas tugas); tidak memakai `classifyPageTitle` |
| Turunan A | — | `src/ai-tools/ded-full-ai/service.ts` memakai ulang `parseDedPdf` dari ded-ai-estimate tetapi hanya memakai **teks** halaman, bukan `pageType` | Ikut menerima perbaikan klasifikasi; dampak perilaku nihil |
| Lain | — | `src/ded-rab-v2/` memakai validator v3 | Di luar cakupan P0 |

Temuan audit kunci sebelum implementasi:

- `classifyPageTitle` hanya ada di `src/ai-tools/ded-ai-estimate/parser.ts`, tidak diekspor, satu-satunya pemanggil internal. Urutan lama memeriksa `denah` **sebelum** kekhususan kusen/instalasi, sehingga DENAH KUSEN dan semua DENAH INSTALASI jatuh ke DENAH. Ada pula jebakan substring: `'site'` cocok di dalam "ar**site**ktur" → halaman cover terklasifikasi SITUASI.
- Pemilihan halaman di service memakai prioritas inline; halaman yang gugur karena budget teks (FAST 45.000 / DETAIL 90.000 karakter) hilang **diam-diam** (loop `break` tanpa jejak), dan pass AI yang gagal juga dilewati diam-diam (`continue`) — error hanya muncul bila total item nol.
- Output dikelompokkan menurut string `category` bebas dari AI, **bukan** divisi. `groupByWbs` hanya dipakai di ResultView dan tes — tidak pernah masuk struktur hasil service.
- Katalog WBS (`wbsCatalog.ts`, kode BGN) punya **11 grup campuran**, bukan 12 divisi pengguna: Plafon adalah subgrup Atap (BGN-06-C), Pengecatan adalah subgrup Finishing (BGN-09-A), Listrik + Plumbing tergabung dalam satu grup MEP (BGN-10).
- `houseType36Template.ts` berisi **25 item** (bukan 27 seperti catatan audit lama), 13 kategori bernomor 01–14 (**kategori 13 tidak ada**), dan **tidak dipakai sama sekali** oleh pipeline DED (0 referensi dari service/parser).

## 2. File yang diubah + alasan

| File | Jenis | Alasan |
|---|---|---|
| `src/ai-tools/ded-ai-estimate/parser.ts` | diubah | `classifyPageTitle` ditulis ulang + diekspor (untuk tes). Urutan baru: (1) judul terjangkar — kualifikasi harus menempel pada kata kunci judul (`DENAH KUSEN`, `DENAH INSTALASI AIR BERSIH`, `DETAIL ATAP`); (2) aturan isi dokumen lama dipertahankan sebagai fallback. Tipe halaman baru (aditif, string lama tetap valid): `DETAIL_KUSEN`, `PLAFOND`, `LANTAI`, `MEP_PLUMBING`, `MEP_ELECTRICAL`, `SANITAIR`. Jebakan `'site'` dihapus (SITUASI hanya dari "situasi"/"site plan"). |
| `src/ai-tools/ded-ai-estimate/divisions.ts` | **baru** | Kontrak 12 divisi + pemetaan eksplisit dari kode WBS lama dan kategori template + builder cakupan murni (`buildDivisionCoverage`). Kode WBS lama tidak diubah — divisi adalah lapisan di atasnya. |
| `src/ai-tools/ded-ai-estimate/analysisTrace.ts` | **baru** | `selectPagesWithTrace`: seleksi halaman sesuai budget dengan jejak lengkap untuk **semua** halaman (terkirim / terlewat + alasan), mempertahankan semantik seleksi lama. |
| `src/ai-tools/ded-ai-estimate/types.ts` | diubah | Tipe kontrak aditif: `DedDivisionCoverage`, `DedDivisionAssumptionCandidate` (sengaja **tanpa** field quantity/harga), `DedAnalysisTrace`, `DedPageTraceEntry`, `DedPassTraceEntry`; `DedAiOutput` mendapat dua field opsional `divisionCoverage?` dan `analysisTrace?` — draft lama di localStorage tetap bisa dimuat. |
| `src/ai-tools/ded-ai-estimate/service.ts` | diubah | Memakai `selectPagesWithTrace`; pengelompokan pass menjadi 8 klaster berlabel (Arsitektur & Ruang; Struktur & Pondasi; Atap; Plafond & Lantai; Kusen, Pintu & Jendela; Sanitair & Plambing; Instalasi Listrik; Spesifikasi & Lainnya); setiap pass dicatat statusnya (OK / FAILED + errorCode / EMPTY_RESPONSE); di akhir, `divisionCoverage` dihitung dari item output yang sama (diklasifikasi WBS oleh classifier yang sudah ada) dan `analysisTrace` dilampirkan beserta warnings yang terbaca pengguna. |
| `src/ai-tools/ded-ai-estimate/DedAiResultView.tsx` | diubah (+43 baris) | Panel "Cakupan 12 Divisi Rumah" + ringkasan jejak analisis (halaman terkirim/terlewat + semua warning) agar alasan halaman terlewat **terlihat pengguna**, bukan hanya ada di struktur data. Digunakan hanya bila field tersedia (guard opsional). |
| `src/test/dedP0Regression.src.ts` | **baru** | 91 pemeriksaan regresi (pola yang sama dengan `dedWbs.src.ts`: bundle esbuild → node, exit code). Perintah jalan terdokumentasi di header file. |

Tidak disentuh sama sekali: file Batch 0B, Batch 0C, file Chat-to-RAB, aturan `ambiguousUnit`, konversi satuan, price resolver, klasifikasi harga resmi. Tidak ada harga/volume yang dikarang di mana pun dalam perubahan ini.

## 3. Klasifikasi halaman: sebelum vs sesudah

Diukur dengan parser asli (`parseDedPdf`, pdfjs) terhadap fixture 32 halaman yang sama.

| Jenis halaman | SEBELUM | SESUDAH |
|---|---:|---:|
| DENAH | **16** | **1** |
| TAMPAK | 5 | 5 |
| POTONGAN | 2 | 2 |
| STRUKTUR | 3 | **10** |
| ATAP | 2 | 2 |
| MEP (total) | **0** | **6** (MEP 1, MEP_PLUMBING 3, MEP_ELECTRICAL 2) |
| JADWAL_KUSEN | **0** | **1** |
| DETAIL_KUSEN | 0 (tidak ada tipenya) | **2** |
| LANTAI | 0 | **1** |
| PLAFOND | 0 | **1** |
| HALAMAN | 3 | 1 |
| SITUASI | 1 | **0** |
| **Total** | 32 | 32 |

Per halaman yang berubah (judul nyata dari PDF):

| Hal. | Judul terbaca | Sebelum | Sesudah |
|---:|---|---|---|
| 1 | GAMBAR ARSITEKTUR (cover) | SITUASI ❌ (jebakan substring "site") | HALAMAN ✔ |
| 9 | DENAH KUSEN | DENAH ❌ | JADWAL_KUSEN ✔ |
| 10 | (detail potongan kusen aluminium) | HALAMAN ❌ | DETAIL_KUSEN ✔ |
| 11 | (rangka jendela/kusen aluminium) | HALAMAN ❌ | DETAIL_KUSEN ✔ |
| 12 | DENAH KERAMIK | DENAH ❌ | LANTAI ✔ |
| 13 | DENAH PLAFOND | DENAH ❌ | PLAFOND ✔ |
| 20–21 | DENAH SLOOF | DENAH ❌ | STRUKTUR ✔ |
| 22–24 | DENAH RINGBALK | DENAH ❌ | STRUKTUR ✔ |
| 25–26 | DENAH PELAT | DENAH ❌ | STRUKTUR ✔ |
| 27 | GAMBAR MEKANIKAL & ELEKTRIKAL | HALAMAN ❌ | MEP ✔ |
| 28 | DENAH INSTALASI AIR BERSIH | DENAH ❌ | MEP_PLUMBING ✔ |
| 29–30 | DENAH INSTALASI AIR KOTOR | DENAH ❌ | MEP_PLUMBING ✔ |
| 31–32 | DENAH INSTALASI LISTRIK | DENAH ❌ | MEP_ELECTRICAL ✔ |

Halaman yang sudah benar dan tetap benar: 2 (DENAH), 3–6 & 16 (TAMPAK), 7–8 (POTONGAN), 14–15 (ATAP), 17–19 (STRUKTUR).

Catatan desain penting: kualifikasi judul harus **menempel** pada kata kunci judul. Uji awal menunjukkan kata di tengah jendela judul 60 karakter (mis. label "Plafond +3.20" di dalam gambar POTONGAN, atau "KM/WC" pada denah ruang) membajak klasifikasi — karena itu aturan judul dijangkarkan ke awal frasa, dan kata yang sama di isi dokumen hanya dipakai oleh aturan fallback lama.

## 4. Cakupan 12 divisi: sebelum vs sesudah

**Sebelum:** tidak ada konsep divisi di hasil. Item dikelompokkan menurut string kategori bebas dari AI; katalog WBS 11 grup mencampur Plafon ke Atap, Pengecatan ke Finishing, dan Listrik+Sanitair ke satu grup MEP. Template rumah tipe 36 tidak dipakai pipeline sama sekali. Divisi yang kosong dari gambar hilang **tanpa keterangan apa pun**.

**Sesudah:** setiap hasil Flow A membawa `divisionCoverage` — tepat 12 entri berurutan dengan nama kontrak pengguna:

| Kode | Divisi | Sumber WBS | Bukti halaman |
|---|---|---|---|
| DIV-01 | Pekerjaan Persiapan | BGN-01* | SITUASI |
| DIV-02 | Pekerjaan Tanah dan Pondasi | BGN-02*, BGN-03* | STRUKTUR, POTONGAN |
| DIV-03 | Pekerjaan Struktur Beton | BGN-04* | STRUKTUR, POTONGAN |
| DIV-04 | Pekerjaan Dinding dan Plesteran | BGN-05* (termasuk 05-B Plesteran) | — |
| DIV-05 | Pekerjaan Atap | BGN-06, 06-A, 06-B (**bukan** 06-C) | ATAP |
| DIV-06 | Pekerjaan Plafond | BGN-06-C saja | PLAFOND |
| DIV-07 | Pekerjaan Lantai dan Dinding Keramik | BGN-07 | LANTAI |
| DIV-08 | Pekerjaan Kusen, Pintu dan Jendela | BGN-08* | JADWAL_KUSEN, DETAIL_KUSEN |
| DIV-09 | Pekerjaan Pengecatan | BGN-09, 09-A | — |
| DIV-10 | Pekerjaan Sanitair dan Plambing | BGN-10-B saja | MEP_PLUMBING, SANITAIR, MEP |
| DIV-11 | Pekerjaan Instalasi Listrik | BGN-10-A saja | MEP_ELECTRICAL, MEP |
| DIV-12 | Pekerjaan Finishing dan Pembersihan | — (disengaja kosong) | — |

Status per divisi, salah satu dari empat nilai kontrak:

- `IDENTIFIED` — ada item hasil DED yang volumenya terdukung bukti (status WBS IDENTIFIED/DERIVED), atau ada item NEEDS_CONFIRM yang tercampur;
- `ASSUMPTION_REQUIRES_CONFIRMATION` — hanya ada item inferensi, **atau** divisi kosong tetapi template rumah punya kandidat: kandidat ditampilkan sebagai *kandidat asumsi* berisi nama + satuan + kode template saja, berlabel sumber `TEMPLATE_RUMAH_TIPE36`, **tanpa volume dan tanpa harga** — tidak pernah menjadi item RAB;
- `INSUFFICIENT_DATA` — ada halaman bukti untuk divisi itu tetapi model tidak menghasilkan item, atau tidak ada bukti maupun scaffold;
- `NOT_APPLICABLE` — tipe proyek bukan bangunan/gedung dan tidak ada item teridentifikasi.

Keputusan yang disengaja dan terdokumentasi di kode: (a) item MEP generik tingkat grup (BGN-10 tanpa subkelompok) **tidak diklaim** ke DIV-10 maupun DIV-11 (`divisionCodeForWbs('BGN-10') → null`) — menebak listrik-vs-plambing akan mengarang cakupan; (b) BGN-11 "Pekerjaan Luar" **tidak** dipetakan ke DIV-12 karena pekerjaan luar (pagar, taman, carport) bukan finishing/pembersihan interior — akibat jujurnya: untuk rumah, DIV-12 berstatus `INSUFFICIENT_DATA` (template pun tidak punya kategorinya), bukan ditutup-tutupi dengan pemetaan yang salah.

**Jejak analisis (Langkah 5):** tidak ada lagi halaman yang hilang diam-diam. `analysisTrace` mencatat untuk **setiap** halaman: jenis, total karakter, karakter terkirim, status `SENT`/`SKIPPED_BUDGET` + alasan; untuk setiap pass: klaster, halaman, status `OK`/`FAILED` (+errorCode) / `EMPTY_RESPONSE`, jumlah item; plus daftar `warnings` berbahasa pengguna yang juga dirender di ResultView bersama daftar halaman terlewat budget.

## Proposal Teknis Vision (Langkah 6 — proposal saja, TIDAK diimplementasikan)

Kondisi saat ini: Flow A berjalan permanen `withImages: false` (temuan audit sebelumnya) — model hanya menerima teks hasil ekstraksi pdfjs yang miskin (±12 ribu karakter untuk 32 halaman; glyph dimensi CAD terbaca acak; halaman Tampak nyaris tanpa teks). Klasifikasi P0 memperbaiki *pemilihan* halaman, tetapi isi gambar tetap tidak terlihat model.

Proposal:

1. **Halaman prioritas vision** (bukan semua halaman): urutan nilai-informasi per token gambar — (1) DENAH (dimensi ruang), (2) POTONGAN (ketinggian, elevasi plafon/atap), (3) JADWAL_KUSEN/DETAIL_KUSEN (ukuran bukaan), (4) DENAH PLAFOND & DENAH KERAMIK (pola/material), (5) TAMPAK (material fasad). Halaman STRUKTUR teks (sloof/ringbalk/pelat) bernilai lebih rendah untuk vision karena isinya tabel/tulangan yang sudah cukup terbaca sebagai teks.
2. **Render & kompresi:** render halaman PDF ke canvas pada skala ±150 DPI (cukup untuk membaca dimensi, jauh di bawah 300 DPI yang boros token), ekspor JPEG kualitas ±0.8; target ≤ ±350 KB per halaman. Jangan kirim PNG mentah.
3. **Batas per request:** maksimum 4–6 gambar per panggilan model, dikelompokkan mengikuti klaster pass yang sudah ada (satu klaster = satu panggilan, gambar + teks halaman yang sama). Budget karakter teks tetap berlaku; gambar tidak menggantikan teks, melengkapinya.
4. **Fallback berlapis:** bila model/provider tidak mendukung vision atau panggilan vision gagal → turun ke teks saja untuk klaster itu, dicatat di `analysisTrace.passes` sebagai status terpisah (mis. `TEXT_ONLY_FALLBACK`), **bukan** gagal total dan bukan diam-diam.
5. **Pelaporan kejujuran:** halaman yang dianalisis hanya dari teks harus tertera sebagai teks-saja di hasil (perluasan `DedPageTraceEntry` dengan field mode analisis), agar pengguna tahu cakupan mana yang berbasis penglihatan dan mana yang berbasis teks.
6. **Urutan implementasi yang disarankan:** pilot satu klaster (DENAH) di belakang flag, ukur perubahan cakupan DIV-04/07/08 dan biaya token per dokumen, baru perluas. Estimasi biaya dan pilihan model vision adalah keputusan terpisah pemilik — proposal ini tidak mengunci keduanya.

## 5. Tes yang dijalankan + hasil aktual

| Tes | Hasil | Catatan |
|---|---|---|
| `tsc --noEmit --skipLibCheck` (NODE_OPTIONS 6144) | **0 error** | |
| Regresi P0 baru `src/test/dedP0Regression.src.ts` | **91 PASS / 0 FAIL** | 32 halaman fixture (judul nyata) + distribusi agregat; variasi kapital/istilah gabungan/ambigu (DENAH LANTAI 1 tetap DENAH, DENAH WC → SANITAIR, "arsitektur" bukan SITUASI); pemetaan WBS→divisi (termasuk BGN-06-C → DIV-06, BGN-10 → null); 13 skenario coverage; seleksi halaman + jejak |
| Verifikasi fixture nyata (parser asli pada PDF 32 hal.) | **Distribusi SESUDAH persis target** (lihat §3) | dijalankan lokal via `npx tsx`, PDF tidak disalin ke repo |
| `npm run test:ded-rab` | **PASS** (suite akhir 9/9) | sama dengan baseline |
| `npm run test:ai-estimate` | **ALL PASSED** | sama dengan baseline |
| `npm run test:core` | **74/74 PASS** | sama dengan baseline |
| `src/test/dedWbs.src.ts` (bundle esbuild) | **26 PASS / 0 FAIL** | sama dengan baseline |
| `npm run test:price` | **69 PASS / 2 FAIL** | **baseline lama yang sama** (RAB-01 rounding + invariant AHSP-01) — area tidak disentuh P0, bukan regresi |

Baseline yang sudah gagal sebelum P0 dan tetap sama sesudahnya dilaporkan terpisah di atas; tidak ada tes lama yang dihapus atau dilonggarkan. Build vite penuh **tidak** dijalankan (RAM VM ±7,9 GB dan ada pekerjaan paralel) — verifikasi mengandalkan tsc + seluruh suite di atas; ini dinyatakan apa adanya.

## 6. Risiko & bagian yang belum teruji

- **NOT_TESTED — provider AI live:** tidak ada panggilan model sungguhan dalam fase ini; perilaku pass/cluster baru diverifikasi lewat struktur kode + tes unit, bukan run end-to-end dengan kredit/provider.
- **NOT_TESTED — browser/UI:** panel coverage/trace di ResultView belum diverifikasi visual di browser; hanya lolos tsc.
- **NOT_TESTED — run ulang fixture oleh pengguna di Preview:** klasifikasi terverifikasi lokal lewat parser asli, tetapi apakah cakupan item hasil model membaik pada PDF yang sama hanya bisa dibuktikan dengan run DED AI sungguhan oleh pengguna.
- **Residual:** penggabungan multi-file di `view.tsx` membangun ulang output via `DedAiCalculator.buildOutput`, sehingga `divisionCoverage`/`analysisTrace` dari run multi-file **hilang** (run satu file utuh). Perbaikan kecil terpisah, di luar langkah P0 ini.
- **Residual:** classifier WBS kata-kunci punya celah lama yang ditemukan saat menulis tes — item bernama "Instalasi Titik Lampu" (tanpa kata "listrik"/"elektrikal") tidak terklasifikasi ke node mana pun. Di luar cakupan P0 (mengubah classifier item berisiko mengubah perilaku harga), dicatat sebagai temuan.
- `ded-full-ai` ikut menerima classifier baru tetapi hanya memakai teks — tidak ada perubahan perilaku yang diharapkan, tetap dicatat.
- Flow B (Magic AI / `ai-estimate` / `ded-rab-v3`) tidak menerima kontrak 12 divisi maupun perbaikan klasifikasi pada fase ini — penyatuan kedua flow adalah pekerjaan terpisah bila pemilik menghendaki.

## 7. Persetujuan yang masih dibutuhkan

- **Commit batch P0 ini** (7 file: 4 diubah, 2 modul baru, 1 tes baru, + laporan ini) adalah keputusan terpisah pemilik. Sesuai batas tugas: berhenti di sini, tidak ada commit/push/deploy, tidak ada perubahan konfigurasi/secret/produksi, tidak ada migrasi DB, tidak ada perubahan billing.
- Keputusan lanjutan yang juga menunggu pemilik: (a) menjalankan run DED AI sungguhan pada fixture di Preview untuk bukti end-to-end; (b) menyetujui pilot vision §Proposal; (c) apakah kontrak 12 divisi juga diterapkan ke Flow B.

## 8. Rekomendasi langkah berikutnya

1. Commit batch P0 sebagai satu commit terpisah (mengikuti pola batch bernama seperti 0A) setelah review pemilik.
2. Uji nyata pertama: jalankan ulang PDF 32 halaman yang sama di menu DED Estimate AI (Preview) dan bandingkan panel cakupan 12 divisi + daftar item terhadap distribusi halaman baru di §3 — terutama DIV-06 (Plafond), DIV-08 (Kusen), DIV-10/11 (Sanitair & Listrik) yang sebelumnya mustahil terisi benar.
3. Perbaikan kecil lanjutan (satu batch mini): pertahankan `divisionCoverage`/`analysisTrace` pada jalur multi-file di `view.tsx`, dan tambahkan kata kunci "lampu"/"stop kontak" ke classifier WBS BGN-10-A dengan tes regresi.
4. Pilot vision sesuai proposal (satu klaster DENAH, di belakang flag), ukur delta cakupan dan biaya sebelum memperluas.

---

# Final Review (Tugas A–E) — 2026-10-21

Melanjutkan laporan P0 di atas. Batas kewenangan sama: **tidak ada commit/push/merge/deploy**, tidak ada `git add -A`, Batch 0B/0C/Chat-to-RAB/billing/resolver/konversi satuan/`ambiguousUnit` tidak disentuh, fixture PDF tidak disalin ke repo. State awal diverifikasi: HEAD `ae25c64`, batch P0 belum ter-commit, semua pekerjaan lain di tree dipertahankan apa adanya.

## Tugas A — Metadata multi-file dipertahankan

**Temuan audit:** jalur standar di `view.tsx` menjalankan service per file lalu membangun ulang output gabungan via `DedAiCalculator.buildOutput` — yang tidak membawa `divisionCoverage`/`analysisTrace`. Karena pembangunan ulang terjadi untuk semua run (termasuk satu file), metadata P0 hilang di semua hasil yang lewat view ini.

**Perbaikan (tanpa metadata sintetis):**
- `analysisTrace.ts` — fungsi murni baru `mergeAnalysisTraces(files, totalPages)`: agregasi jejak NYATA per file. Nomor halaman dioffset global (skema sama dengan `sourcePages` item), `passIndex` direnumber global (termasuk `passIndex` pada entri halaman), warning per file diberi prefiks `[nama file]`, dan setiap entri membawa `sourceFile`. File yang jejaknya tidak tersedia **tidak dikarang** — dicatat sebagai warning keterbatasan eksplisit yang menyebut nama file.
- `types.ts` — field aditif opsional `sourceFile?: string` pada `DedPageTraceEntry` dan `DedPassTraceEntry`.
- `view.tsx` — mengumpulkan `FileTraceInput` + bukti halaman (dari jejak nyata tiap file, offset yang sama) selama loop; setelah `buildOutput`, memasang `merged.analysisTrace = mergeAnalysisTraces(...)` dan menghitung ulang `merged.divisionCoverage` dari item gabungan final memakai builder yang sama persis seperti service (`groupByWbs` + `buildDivisionCoverage`) — sehingga `itemIds` pada coverage cocok dengan id item gabungan (`dedai-f<file>-<n>`).
- `DedAiResultView.tsx` — daftar "Halaman terlewat budget" kini menyertakan nama file sumber bila tersedia (`hal. 33 (MEP_ELECTRICAL, gambar-b.pdf)`).

## Tugas B — Klasifikasi item listrik

**Temuan audit:** `classifyToWbs` adalah classifier WBS Flow A (konsumen: `service.ts`, `DedAiResultView.tsx`, tes). BGN-10-A hanya ber-keyword `listrik`/`elektrikal`, sehingga "Instalasi Titik Lampu" tidak terklasifikasi ke node mana pun.

**Perbaikan (di `wbsClassifier.ts`, hanya klasifikasi — quantity/provenance/harga tidak disentuh):** override konservatif yang hanya berjalan untuk BANGUNAN/GEDUNG:
- Frasa majemuk pekerjaan instalasi — `titik lampu`, `stop kontak`, `saklar` — memetakan ke BGN-10-A, kecuali teks berkonteks non-pekerjaan (`pengadaan`, `pembelian`, `pengiriman`, `sewa`, `katalog`, `brosur`, `dekorasi`, `hiasan`, `pajangan`).
- Kata `lampu` sendirian wajib disertai konteks pekerjaan (`instalasi`/`pemasangan`/`listrik`/`elektrikal`) dan bukan `lampu jalan`.
- Item yang sudah menang ke plumbing (BGN-10-B) tidak pernah dibajak; kelompok MEP generik BGN-10 tetap kelompok (`divisionCodeForWbs('BGN-10') === null` — tidak dipaksa ke DIV-10/DIV-11); katalog JALAN tidak terpengaruh (penerangan jalan tetap JLN-07-B).

## Tugas C — Hasil tes aktual

| Perintah | Hasil |
|---|---|
| `tsc --noEmit --skipLibCheck` (NODE_OPTIONS 6144) | **0 error** |
| Regresi baru `src/test/dedFinalReview.src.ts` (bundle esbuild → node) | **37 PASS / 0 FAIL** — A1–A3 merge jejak (satu file, multi-file offset/renumber, file tanpa jejak), A4 coverage dari item gabungan (DIV-11 IDENTIFIED, itemIds id gabungan, evidence halaman global 33), B1–B12 listrik (positif + negatif + generik tidak dipaksa + plumbing tidak dibajak + JALAN utuh) |
| `npm run test:ded-rab` | **9 PASSED / 0 FAILED** (kriteria 15/15) |
| `npm run test:ai-estimate` | **ALL PASSED** (15/15) |
| `npm run test:core` | **74 PASSED / 0 FAILED** |
| `src/test/dedWbs.src.ts` | **26 PASS / 0 FAIL** (= baseline) |
| `src/test/dedP0Regression.src.ts` | **91 PASS / 0 FAIL** (= hasil P0, tidak berubah) |
| `npm run test:price` | **69 PASSED / 2 FAILED** — **baseline lama yang sama persis**: (1) RAB-01 rounding `A.1.02.4a.1.d: unitPrice=219791 sum=219790.5`; (2) invarian AHSP-01 "no price is written into the canonical source". Area harga tidak disentuh tugas ini — **bukan regresi baru** |

Tidak ada tes lama yang diubah atau dihapus. Regresi baru: **tidak ada**.

## Tugas D — Validasi Preview: NOT_TESTED

Tidak dijalankan, dan tidak disimulasikan. Penghalang persisnya: deployment Preview branch ini berada di balik access gate proyek (kode hanya diketahui pemilik) dan run provider live tidak dapat dieksekusi dari sandbox ini. Vision **tidak** diaktifkan.

Yang perlu dijalankan pemilik untuk validasi (menu DED Estimate AI di Preview, PDF rumah 1 lantai 32 halaman yang sama): bandingkan panel "Cakupan 12 Divisi Rumah" dan "Jejak Analisis" terhadap distribusi klasifikasi lokal yang sudah terverifikasi parser asli — DENAH 1, TAMPAK 5, POTONGAN 2, STRUKTUR 10, ATAP 2, MEP 6 (plumbing 3, elektrikal 2, umum 1), JADWAL_KUSEN 1, DETAIL_KUSEN 2, LANTAI 1, PLAFOND 1, HALAMAN 1 — dan periksa: item dari DENAH KUSEN masuk DIV-08, PLAFOND masuk DIV-06, instalasi air masuk DIV-10, instalasi listrik masuk DIV-11; halaman/pass yang gagal tampil sebagai warning, bukan hilang; catat kredit terpakai dan waktu proses.

## Tugas E — Review UI: browser NOT_TESTED, sebagian terverifikasi kode

Browser tidak dijalankan: panel "Cakupan 12 Divisi Rumah" dan "Jejak Analisis" hanya dirender setelah ada hasil analisis (`output.divisionCoverage` terisi), dan menghasilkan hasil nyata memerlukan run provider live yang tidak tersedia di sandbox (alasan sama dengan Tugas D). Hasil render sintetis tidak dipakai sebagai bukti UI.

Terverifikasi dari kode (`DedAiResultView.tsx`):
- Status divisi ditampilkan sebagai **teks penuh**, bukan warna saja: "Teridentifikasi dari DED" / "Asumsi — perlu konfirmasi" / "Tidak berlaku" / "Data belum cukup", masing-masing disertai `note` penjelasan dan jumlah item.
- Warning jejak dirender sebagai daftar teks berprefiks ⚠; halaman terlewat budget dirinci per halaman (nomor + jenis + file sumber setelah Tugas A).
- Grid panel memakai `repeat(auto-fill, minmax(230px, 1fr))` — pada lebar 320/390 px kolaps menjadi satu kolom secara konstruksi CSS.

Yang tetap NOT_TESTED untuk E: keterbacaan aktual pada 390 px/320 px di browser, kontras terukur, dan perilaku scroll halaman hasil yang panjang.

## Risiko & belum teruji (tambahan di luar §6 laporan P0)

- Merge metadata multi-file terverifikasi pada level fungsi murni + pola hitung ulang coverage; **belum** dibuktikan end-to-end lewat UI dengan dua file sungguhan (membutuhkan provider live — Tugas D).
- Override listrik Tugas B bersifat heuristik kata kunci berkonteks: frasa instalasi listrik dengan istilah di luar daftar (mis. "fitting", "armatur" tanpa kata "lampu"/konteks) tetap tidak tertangkap — disengaja konservatif; memperluas daftar adalah keputusan lanjutan berbasis contoh nyata, bukan tebakan.
- Status `sourceFile` hanya tampil di daftar halaman terlewat pada ResultView; daftar pass gabungan belum dirender per-file di UI (data tersedia di `analysisTrace.passes[].sourceFile`).

## Status Git akhir

HEAD tetap `ae25c64` (branch `integrasi/unified-ui-engine`); **0 staged**; working tree membawa batch P0 + perbaikan final-review ini + pekerjaan paralel lain yang sudah ada sebelumnya (tidak diubah/dihapus). File yang diubah tugas final-review ini: `types.ts`, `analysisTrace.ts`, `wbsClassifier.ts`, `view.tsx`, `DedAiResultView.tsx` (semua di `src/ai-tools/ded-ai-estimate/`), baru: `src/test/dedFinalReview.src.ts`, dan laporan ini. **Konfirmasi: tidak ada commit, push, merge, atau deploy yang dilakukan.** Berhenti di sini — menunggu persetujuan pemilik sebelum operasi Git apa pun.
