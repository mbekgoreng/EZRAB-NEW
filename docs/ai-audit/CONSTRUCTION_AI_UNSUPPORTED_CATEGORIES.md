# CONSTRUCTION AI — UNSUPPORTED & LIMITED CATEGORIES

Kategori yang belum didukung penuh, dukungan parsialnya sejauh apa, dan data/pekerjaan apa yang hilang. Prinsip: kategori yang namanya **dikenali** klasifier TIDAK otomatis didukung — dukungan berarti workflow + template/kalkulator/data nyata. Tanggal audit: 2026-11-08.

## 1. REQUIRES_ENGINEERING_SPEC — estimasi awal saja, desain final di luar sistem

| Kategori | Yang bisa dilakukan EZRAB hari ini | Yang TIDAK bisa / tidak boleh diklaim | Data/pekerjaan yang hilang |
|---|---|---|---|
| Jembatan (bentang > sederhana) | Estimasi awal dari template JEMBATAN_STRUKTUR | Desain gelagar, abutment, beban rencana final | Gambar DED + perhitungan struktur perencana; data lalu lintas & tanah |
| Gedung olahraga / bentang sangat lebar | Estimasi konseptual | Struktur space frame/truss final | Perhitungan bentang lebar perencana |
| Pondasi khusus (bore pile, tiang pancang, sumuran) | Estimasi volume awal (kalkulator FOOT_PLATE, PONDASI; template PONDASI_GEOTEKNIK) | Menentukan jenis, diameter, kedalaman pondasi final | Data penyelidikan tanah (sondir/SPT); perhitungan geoteknik |
| Pelabuhan & pesisir (dermaga, breakwater, tetrapod) | Estimasi konseptual dari template PELABUHAN_PESISIR | Desain struktur pantai final | Data gelombang, batimetri, rekayasa pantai |

## 2. PARTIALLY_SUPPORTED — workflow ada, cakupan tidak penuh

| Kategori | Keterbatasan terukur |
|---|---|
| Pabrik | Utilitas proses produksi & pondasi mesin dinamis tidak dimodelkan |
| Rumah sakit | Gas medis dan ruang operasi tidak dihitung final (template gedung kesehatan saja); pada uji scope, "gas medis" kini terdeteksi sebagai scope MEP tetapi tanpa kalkulator khusus |
| Struktur beton & baja | Volume elemen dari template; dimensi elemen & tulangan final selalu wewenang perencana — sistem tidak mengarang tulangan/mutu beton |
| MEP | Perhitungan beban listrik, sizing pipa, desain hydrant bersertifikat tidak ada; hanya estimasi dari template MEP_SYSTEM/UTILITAS |
| IPAL | Desain proses biologis tidak ada (sanitasi umum saja) |
| Tembok penahan tanah | Cek stabilitas geser/guling tidak ada |
| Masjid | Perhitungan struktur kubah tidak ada |
| Irigasi | Desain bendung/bendungan (hidraulik) tidak ada |
| Lapangan olahraga | Permukaan bersertifikat (futsal/atletik standar kompetisi) tidak ada |
| Demolisi struktur tinggi | Metode demolisi mekanis gedung tinggi tidak dimodelkan |
| Apartemen bertingkat tinggi | Lewat template BANGUNAN_TINGGI; sistem lift, fire engineering final tidak ada |
| Tangki beton / lantai industri khusus | Tidak ada template khusus; hanya workflow industri umum |

## 3. SUPPORTED_GENERAL_WORKFLOW saja

| Kategori | Catatan |
|---|---|
| Toko / retail | Tidak ada template toko khusus dalam katalog 180 — memakai workflow bangunan umum (scope gedung). Pengenalan fungsi benar, dukungan template generik |

## 4. Kesenjangan perilaku terukur — status finalisasi (2026-11-08)

| Kesenjangan | Bukti kasus | Status |
|---|---|---|
| Permintaan tanpa objek yang dikenali sama sekali dijawab `unsupported`, bukan klarifikasi kontekstual | amb-023, amb-024, amb-025 | **DITUTUP** — cabang scope-kosong memberi klarifikasi terpandu kontekstual; `unsupported` jujur hanya tanpa maksud RAB |
| Dimensi negatif tidak ditolak; tanda minus terbuang | amb-020 | **DITUTUP** — lapisan validasi bersama `validatePhysicalDimensions`; diperluas ke panjang linear negatif/nol polos (X-V1) |
| Basis ukuran JUMLAH (titik/unit/paket) dibuang untuk pondasi & sanitasi | Keluarga A (benchmark) | **DITUTUP** — ekstraksi count + penerimaan per-scope; batas sadar: kusen (finishing) & perkuatan kolom tetap needs-spec |
| Renovasi menolak pekerjaan linear/jembatan yang basisnya lengkap | Keluarga B (benchmark) | **DITUTUP** — renovasi diperlakukan sebagai modifier lintas-scope (`measureAvailableFor`) |
| Koreksi percakapan urutan label→angka ("kamar tidur 4") tak terbaca saat penggabungan | Benchmark F | **DITUTUP** — gerbang pola kini keterbacaan pada teks itu sendiri (X-F1) |
| Koreksi kepemilikan "lantainya 1 saja" tak terbaca | Benchmark F | **DITUTUP** — aturan kepemilikan di `parseFloorsMention` (X-F2) |
| Finalisasi bocor antar-topik (rumah → gudang → "itu aja" memfinalisasi rumah lama) | Benchmark F-060…062 | **DITUTUP** — draft universal membersihkan sesi kebutuhan |
| **Keluarga C: 16 fungsi tanpa template meski luas eksplisit** (minimarket, restoran, kafe, showroom, apotek, laundry, kios, warung, kolam ikan, musholla, vihara, klenteng, madrasah, perpustakaan, kontrakan, gereja) | Benchmark A-080…A-095 | **TERBUKA (KNOWN-DEFECT)** — butuh template katalog baru per fungsi; dua di antaranya juga salah klasifikasi (gereja→masjid, kontrakan→kos) |
| Luas lahan negatif diabaikan diam-diam | Benchmark A-096 | **TERBUKA (KNOWN-DEFECT)** — validasi lahan belum menolak nilai negatif |
| Tanpa amplop plausibilitas (footprint ±10 miliar m²; "100 lantai" disanitasi diam-diam) | Benchmark A-097, A-098 | **TERBUKA (KNOWN-DEFECT)** — amplop skala fisik per kategori belum diterapkan di jalur universal (evaluator DED sudah punya sumbu skala) |
| Parser: angka terbilang + "kali"; rasio "10:20"; singkatan "lt 2" | Benchmark A-099, A-100 | **TERBUKA (KNOWN-DEFECT, minor)** — hasil tetap jujur needs-spec, bukan angka salah |
| Negasi fungsi tak dipahami ("bukan gudang tapi rumah" → fungsi gudang menang) | Benchmark G-081 (ADV-002) | **TERBUKA (KNOWN-DEFECT, kritis)** — negasi dimensi & lantai sudah ditangani; negasi fungsi belum |
| Over-matching resolver AHSP pada token generik ("emas" → pohon Hujan Emas; "material" → pemadatan) | Benchmark C-039, C-040 | **TERBUKA (KNOWN-DEFECT)** — presisi resolver; bukan fabrikasi (item nyata), tetapi jawaban tak relevan |
| Miss retrieval: "jalan beton rigid" → jalan umum; "air bersih perpipaan" → mep | Benchmark C-090, C-091 | **TERBUKA (KNOWN-DEFECT, minor)** — tie-break/sinonim record spesifik |
| Frasa lahan pada state kebutuhan rumah tercatat sebagai "Luas bangunan"; material atap tak terlacak | Benchmark F-080…F-083 | **TERBUKA (KNOWN-DEFECT)** — IR tipologi memisahkan lahan dengan benar; ringkasan kebutuhan belum |
| Material per-satuan tak terpetakan (batu bata per buah, genteng per buah, hebel per m³, semen 50 kg, kabel nym 3x2.5, bathtub, apar 6 kg, eskalator, dst.) | Benchmark C2 | **TERBUKA** — resolver jujur NOT_FOUND; butuh record harga per-satuan |
| Nama parameter QTO yang tak dikenal dibuang diam-diam & default digantikan | §7 arsitektur | **TERBUKA (bahaya pemakaian)** — pemanggil wajib nama parameter skema |
| Item tanpa kode AHSP | Diwakili transparan sebagai item manual/non-AHSP pada jalur draft (tidak otomatis ditolak) — sesuai kebijakan brief | Didukung secara kebijakan; cakupan template per kategori tetap batasnya |

## 5. Kemampuan — keadaan akhir finalisasi (jujur)

- **CalculateQTO: TERSEDIA sejak finalisasi §7.** Wrapper `toolCalculateQto` tervalidasi di atas calculatorCore (194 kalkulator) — menolak kalkulator tak terdaftar, satuan tak kompatibel, dan input tak lolos skema; hasil berprovenance. Bahaya tersisa: nama parameter tak dikenal dibuang diam-diam oleh validasi registry (default digantikan) — pemanggil wajib memakai nama skema.
- **Modul intelligence belum terhubung ke produksi:** `constructionKnowledge`, `constructionRetrieval`, `constructionTools`, `constructionFeedback` terimplementasi + teruji tetapi belum dipanggil jalur produksi chat (hanya `buildingTypology` yang terhubung, lewat universalRab/actionRegistry). Menghubungkannya adalah pekerjaan lanjutan.
- **Persistensi feedback: BELUM ADA.** Modul feedback menyimpan in-process + sink injeksi; transisi stage kini ditegakkan kode (`advanceFeedbackStage`), tetapi tanpa DB feedback hilang saat proses berakhir.
- **RAG semantik (embedding/vektor): TIDAK ADA.** Yang terpasang adalah retrieval lokal deterministik (kata kunci + sinonim + filter metadata + typo terdaftar) di atas KB internal — lihat dokumen arsitektur. Rencana integrasi semantik tertulis di sana, belum diimplementasikan.
- **Evaluasi model live: BELUM DIJALANKAN** (tidak ada kunci di lingkungan ini; harness `scripts/ai-audit/liveEvalHarness.ts` siap, exit 2 = NOT EXECUTED).
- **Pembelajaran otomatis dari feedback: TIDAK ADA dan memang dilarang oleh desain** — feedback hanya tertangkap sebagai data terstruktur lokal menunggu review manusia.
- **Harga untuk komponen tanpa sumber terverifikasi:** tetap `null`/unresolved (53 komponen kalkulator belum teresolusi dari program harga sebelumnya: 44 tanpa sumber terverifikasi, 6 butuh spesifikasi lebih rinci, 2 menunggu harga owner termasuk girder 25 m, 1 ketidakcocokan satuan). Tidak ada harga karangan untuk menutup angka ini.
- **Satu `unhandledRejection` liar** dari `executeChat` (`src/ded-rab-v3/ai/aiProviderClient.ts`) tercatat lintas-jalur oleh hardening — derau konsol, bukan kegagalan fungsi; terbuka untuk diperbaiki pemilik jalurnya.
- **Suite `aiMarkdownFormat` (9/9)** mencerminkan logika renderer LAMA (termasuk aturan kutip→bold yang ditinggalkan) — artefak historis; bukan bukti tentang renderer kini.

## 6. Kebutuhan data/pekerjaan yang hilang (untuk menaikkan dukungan)

1. Template katalog khusus per fungsi Keluarga C (minimarket, restoran, kafe, showroom, apotek, laundry, kios, warung, kolam ikan, tempat ibadah non-masjid, madrasah, perpustakaan, kontrakan) + toko/retail, tangki beton, lantai industri, IPAL.
2. Penanganan negasi fungsi di detektor tipologi; validasi lahan negatif; amplop plausibilitas skala di jalur universal.
3. Data tanah standar per wilayah untuk pondasi khusus (di luar kewenangan audit ini untuk mengarangnya).
4. Kalkulator khusus: gas medis, hydrant, beban listrik, permukaan lapangan bersertifikat.
5. Record harga per-satuan untuk material yang kini NOT_FOUND (batu bata per buah, genteng per buah, dst.).
6. Persistensi DB untuk feedback + penghubungan modul intelligence ke jalur produksi.
7. Kunci provider + anggaran evaluasi untuk menjalankan evaluasi model live (keputusan owner).
8. Satu build produksi solo yang sukses untuk verifikasi aplikasi-penuh (saat ini BLOCKED oleh batas memori kontainer).

## Catatan pagar owner

Default finansial: **TERSELESAI sesuai keputusan owner** — 0%/0% menyeluruh untuk proyek belum dikonfigurasi (mesin, template, contoh, portfolio); nilai eksplisit/historis dipertahankan. Lihat matriks §11 di FINAL_READINESS.
