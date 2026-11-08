# CONSTRUCTION AI COVERAGE MATRIX

Audit cakupan AI konstruksi EZRAB — 2026-11-08 (diperbarui finalisasi). Status dukungan dinyatakan **jujur**: dukungan = workflow + template/kalkulator/data NYATA di repo (katalog template resmi 180 template, registry kalkulator calculatorCore 194 kalkulator, mesin parametrik rumah), BUKAN sekadar nama dikenali oleh klasifier.

Sumber status per kategori: field `supportStatus` pada knowledge base `src/ai-tools/ezrab-ai/constructionKnowledge.ts` (**50 record**), diverifikasi terhadap registry nyata oleh `src/test/constructionIntelligence.test.ts` (**80 rujukan kalkulator, 0 tidak valid**) dan invarian benchmark Kategori C.

## Ringkasan status (50 record KB)

| Status | Jumlah | Arti |
|---|---|---|
| FULLY_SUPPORTED | 15 | Workflow + template/kalkulator nyata, teruji di suite regresi |
| PARTIALLY_SUPPORTED | 23 | Workflow/template ada, cakupan tidak penuh |
| SUPPORTED_GENERAL_WORKFLOW | 4 | Hanya workflow bangunan umum / template generik |
| REQUIRES_ENGINEERING_SPEC | 6 | Estimasi awal saja; desain final wajib spesifikasi/perhitungan perencana |
| NOT_YET_SUPPORTED | 2 | hvac, proteksi-kebakaran — dikenali & dijelaskan jujur, belum ada workflow |

## Matriks per kategori

### A. Residensial & Gedung

| Kategori | Record KB | Status | Bukti dukungan nyata |
|---|---|---|---|
| Rumah tinggal | rumah-tinggal | FULLY_SUPPORTED | Mesin parametrik rumah + template RUMAH_TINGGAL (18) + 8 kalkulator |
| Kos/kontrakan | kos | PARTIALLY_SUPPORTED | Template katalog ada; mesin parametrik tidak khusus kos |
| Villa | (fungsi villa → workflow rumah) | PARTIALLY_SUPPORTED | Template katalog; workflow rumah umum |
| Ruko | ruko | PARTIALLY_SUPPORTED | Template GEDUNG; kalkulator struktur dasar |
| Kantor | kantor | FULLY_SUPPORTED | Template GEDUNG/BANGUNAN_TINGGI; kasus regresi 3 lantai lulus |
| Gudang | gudang | FULLY_SUPPORTED | Template BLD-IND-WAREHOUSE (INDUSTRI); kasus penerimaan brief lulus |
| Pabrik | pabrik | PARTIALLY_SUPPORTED | Template INDUSTRI ada; utilitas proses & pondasi mesin dinamis tidak didukung |
| Workshop/bengkel | workshop | PARTIALLY_SUPPORTED | Template INDUSTRI; peralatan bengkel khusus tidak didukung |
| Sekolah | sekolah | FULLY_SUPPORTED | Template PENDIDIKAN (6) |
| Klinik/puskesmas | klinik | PARTIALLY_SUPPORTED | Template KESEHATAN; skala kecil-menengah |
| Rumah sakit | rumah-sakit | PARTIALLY_SUPPORTED | Template KESEHATAN (6); gas medis & ruang operasi final = spesifikasi medis khusus |
| Toko/retail | toko | SUPPORTED_GENERAL_WORKFLOW | Tidak ada template toko khusus — workflow bangunan umum |
| Masjid/rumah ibadah | masjid | PARTIALLY_SUPPORTED | Template katalog; perhitungan struktur kubah final tidak didukung |
| Aula/gedung serbaguna | (fungsi aula → gedung) | PARTIALLY_SUPPORTED | Template GEDUNG; bentang lebar = struktur khusus |
| Gedung olahraga (GOR) | gedung-olahraga | REQUIRES_ENGINEERING_SPEC | Struktur bentang lebar wajib perhitungan perencana |
| Hotel | hotel | FULLY_SUPPORTED | Template HOTEL_HOSPITALITY (6) |
| Apartemen/rusun | (fungsi apartemen → gedung) | PARTIALLY_SUPPORTED | Template BANGUNAN_TINGGI (6) |
| Bangunan pertanian (kandang, greenhouse, lumbung) | pertanian | PARTIALLY_SUPPORTED | Template PERTANIAN_PERKEBUNAN (5); kandang closed-house terotomasi tidak didukung |

### B. Sipil / Infrastruktur

| Kategori | Record KB | Status | Bukti |
|---|---|---|---|
| Jalan beton/aspal/paving | jalan | FULLY_SUPPORTED | Template JALAN_TRANSPORTASI (10) + PERKERASAN (7); kalkulator JALAN_ASPAL, JALAN_RIGID, PAVING_BLOCK |
| Drainase & saluran pasangan batu | drainase | FULLY_SUPPORTED | Template DRAINASE_SANITASI (7) + SDA_IRIGASI (10); kalkulator SALURAN_UDITCH |
| U-Ditch / box culvert / gorong-gorong | drainase | FULLY_SUPPORTED | Sama seperti di atas; kata kunci scope diperluas 2026-11-08 |
| Jembatan | jembatan | REQUIRES_ENGINEERING_SPEC | Template JEMBATAN_STRUKTUR (7) untuk estimasi awal; desain final wajib DED & perhitungan |
| Tembok penahan tanah / retaining wall | retaining-wall | PARTIALLY_SUPPORTED | Template LANDSCAPE_SITE; cek stabilitas final tidak didukung. Panjang eksplisit ("sepanjang 50 m") kini tertangkap untuk semua jenis pekerjaan |
| Irigasi & bangunan air | irigasi | PARTIALLY_SUPPORTED | Template SDA_IRIGASI (10); desain bendung = rekayasa hidraulik khusus |
| Pekerjaan tanah / cut & fill | pekerjaan-tanah | FULLY_SUPPORTED | Template PEKERJAAN_TANAH (6) + kalkulator galian/cut&fill |
| Pagar & lanskap | pagar | FULLY_SUPPORTED | Template LANDSCAPE_SITE (6); kalkulator building.fence |
| Lapangan olahraga | lapangan-olahraga | PARTIALLY_SUPPORTED | Template FASILITAS_OLAHRAGA (5); permukaan bersertifikat tidak didukung |
| Pelabuhan & pesisir | pelabuhan | REQUIRES_ENGINEERING_SPEC | Template PELABUHAN_PESISIR (5) estimasi konseptual saja |

### C. Renovasi

| Kategori | Record KB | Status | Bukti |
|---|---|---|---|
| Renovasi rumah/kantor, ganti atap, pengecatan, keramik, plafon, partisi, kanopi, waterproofing, fasad | renovasi (+ atap, finishing) | FULLY_SUPPORTED | Template RENOVASI_MAINTENANCE (8), ATAP_WATERPROOFING (5), FINISHING_INTERIOR (6); kanopi kini masuk scope renovasi dan menghasilkan draft dari template renovasi |

### D. MEP

| Kategori | Record KB | Status | Bukti |
|---|---|---|---|
| Listrik & panel, air bersih/kotor, pompa, AC, hydrant, plumbing, gas medis | mep | PARTIALLY_SUPPORTED | Template MEP_SYSTEM (9) + UTILITAS (8); kalkulator KELISTRIKAN, AIR_BERSIH, SANITAIR. Kata kunci scope ditambah 2026-11-08: 'instalasi ac', 'hydrant', 'gas medis'. Perhitungan beban & sizing final tidak didukung |
| Septic tank & IPAL | sanitasi | PARTIALLY_SUPPORTED | Template DRAINASE_SANITASI/UTILITAS; desain IPAL proses biologis tidak didukung |

### E. Struktur khusus

| Kategori | Record KB | Status | Bukti |
|---|---|---|---|
| Footplat, bore pile, tiang pancang | pondasi-khusus | REQUIRES_ENGINEERING_SPEC | Template PONDASI_GEOTEKNIK (7) + kalkulator FOOT_PLATE/PONDASI untuk estimasi; jenis/kedalaman final wajib data tanah |
| Beton bertulang & struktur baja | struktur-beton-baja | PARTIALLY_SUPPORTED | Template STRUKTUR_BETON_BAJA (7); dimensi elemen & tulangan final = perencana |
| Rangka atap bentang lebar | atap / gedung-olahraga | PARTIALLY_SUPPORTED / REQUIRES_ENGINEERING_SPEC | Estimasi awal saja |
| Tangki beton, lantai industri | — | PARTIALLY_SUPPORTED | Lewat workflow gedung/industri umum; tidak ada template khusus (lihat dokumen UNSUPPORTED) |

## Distribusi katalog resmi (bukti pendukung, dari registry)

180 template: RUMAH_TINGGAL 18, JALAN_TRANSPORTASI 10, SDA_IRIGASI 10, MEP_SYSTEM 9, GEDUNG 8, UTILITAS 8, RENOVASI_MAINTENANCE 8, PERKERASAN 7, INDUSTRI 7, DRAINASE_SANITASI 7, JEMBATAN_STRUKTUR 7, PONDASI_GEOTEKNIK 7, STRUKTUR_BETON_BAJA 7, BANGUNAN_TINGGI 6, HOTEL_HOSPITALITY 6, KESEHATAN 6, PENDIDIKAN 6, LANDSCAPE_SITE 6, PEKERJAAN_TANAH 6, FINISHING_INTERIOR 6, PELABUHAN_PESISIR 5, ATAP_WATERPROOFING 5, PERTANIAN_PERKEBUNAN 5, FASILITAS_OLAHRAGA 5, DEMOLISI_REKONSTRUKSI 5. Kalkulator terdaftar: 194.

## Catatan pagar owner

- Lantai tidak disebut = **asumsi 1 lantai TERLABEL** (aturan owner 2026-10-22) di semua kategori bangunan — bukan "bertingkat", bukan penolakan.
- **KONFLIK TERSELESAI (keputusan owner 2026-11-08 04:54 + 05:01):** default proyek baru kini 0% overhead / 0% profit menyeluruh — mesin, template katalog, generator contoh, dan literal portfolio; nilai eksplisit/historis dipertahankan (Premium Demo Rp1.089.879.733; flagship PRJ-2026-001). Terverifikasi financialMatrix9 20/20 + benchmark Kategori E 100/100.
- **Celah cakupan terukur baru (benchmark ekstrem Kategori A):** 16 fungsi tanpa template meski luas eksplisit (minimarket, restoran, kafe, showroom, apotek, laundry, kios, warung, kolam ikan, musholla, vihara, klenteng, madrasah, perpustakaan, kontrakan, gereja) berakhir needs-spec — dikodekan KNOWN-DEFECT A-080…A-095, bukan diklaim didukung. Rincian di dokumen UNSUPPORTED §4.
