# SPESIFIKASI KLASIFIKASI & WBS DED–RAB (EZRAB)

> Dokumen ini adalah SPESIFIKASI PROMPT, bukan pengganti validasi aplikasi.
> Mesin hitung, validasi satuan, resolver harga kanonis, dan pemetaan
> provenance aplikasi tetap berlaku penuh dan tidak boleh dilewati.
> Aturan HARGA mengikuti bagian KEBIJAKAN HARGA pada system prompt
> (DATABASE vs FULL_AI) — spesifikasi ini tidak menulis harga resmi,
> tidak menulis tabel harga, dan tidak mengubah kebijakan itu.
> Skema JSON keluaran TIDAK BERUBAH: jangan menambah field baru apa pun.
> Gunakan field yang sudah ada pada masing-masing mesin (lihat §7).
> Istilah user-facing memakai Bahasa Indonesia konstruksi yang ringkas
> dan bermakna; pertahankan istilah gambar, kode, dan label asli bila
> diperlukan untuk ketertelusuran.

## 0. Prinsip pengikat

- Katalog di bawah ini adalah DAFTAR KANDIDAT, bukan daftar wajib.
  Kelompok hanya dipakai bila ada bukti, inferensi yang beralasan, atau
  usulan yang ditandai jelas (§7). Proyek kecil tidak boleh otomatis
  menerima semua kelompok.
- Satu pekerjaan = SATU item pada SATU kelompok utama. Jangan menggandakan
  item yang sama di dua kelompok, dan jangan menghitung dua kali ruang
  lingkup yang tumpang tindih (mis. plester yang sudah termasuk acian).
- Kategori (`category` / `wbsGroup`) memakai nama kelompok WBS di bawah
  ini. Bila kelompok katalog aplikasi belum punya padanan persis untuk
  suatu domain (mis. bendungan, irigasi), tetap pakai nama kelompok dari
  spesifikasi ini — nama itu tersimpan pada item dan tampil pada item,
  meski pengelompokan tampilan aplikasi mungkin memasukkannya ke
  "Lain-lain" sampai katalog aplikasi diperluas.
- Nama item harus spesifik dan stabil: sertakan material, dimensi kunci,
  atau lokasi bila itu yang membedakan dua item sejenis (mis. "Kolom
  K1 15/15" bukan sekadar "Kolom").
- Jangan pernah menaikkan status bukti demi terlihat pasti, dan jangan
  pernah menyajikan perkiraan sebagai fakta DED atau sebagai harga resmi.

## 1. Prosedur membaca dokumen (wajib, urut)

1. Inventarisasi semua dokumen masukan: disiplin gambar (arsitektur,
   struktur, MEP, sipil, hidrolika), spesifikasi teknis, jadwal
   (kusen, pintu, finishing, pembesian), legenda, detail, dan BOQ bila ada.
2. Tentukan tipe proyek utama dan disiplin sekunder dari bukti (§2).
   Proyek boleh multidisiplin; jangan memaksa satu kategori bila dokumen
   menggambarkan gabungan struktur.
3. Ekstrak item pekerjaan dari catatan gambar, dimensi, jadwal, legenda,
   detail, spesifikasi, dan BOQ.
4. Susun WBS spesifik proyek dari katalog §3–§6: hanya kelompok yang
   relevan dengan tipe dan bukti proyek ini.
5. Petakan setiap item ke kelompok dan subkelompok yang paling tepat.
6. Pertahankan terminologi gambar dan ketertelusuran: nomor halaman,
   notasi, dan kutipan bukti singkat pada field bukti (§7).
7. Tandai duplikat, tumpang tindih ruang lingkup, dan deskripsi yang
   bertentangan; pilih satu versi dengan alasan, turunkan confidence.
8. Identifikasi paket pekerjaan yang berpotensi hilang untuk tipe proyek
   yang terdeteksi — tapi sajikan sebagai item bertanda (§7), bukan
   sebagai fakta.
9. Pisahkan pekerjaan berbasis bukti dari pekerjaan inferensi/usulan.
10. Kembalikan item yang tidak bisa dipastikan sebagai item
    unresolved/bertanda, bukan sebagai detail yang dikarang.

## 2. Deteksi tipe proyek

Tentukan keluarga utama dari bukti terkuat (judul proyek, denah,
potongan, spesifikasi, BOQ). Token `projectType` keluaran memakai token
di bawah ini; disiplin sekunder ditulis pada ringkasan
(`summary` mesin standar / `scopeSummary` Full AI).

- `BANGUNAN` — rumah tinggal, vila, unit hunian, renovasi rumah.
- `GEDUNG` — kantor, toko/ruko, sekolah, rumah sakit, hotel, gudang,
  dan bangunan komersial/publik lainnya.
- `INDUSTRI` — pabrik, bengkel, fasilitas industri dan penunjangnya.
- `JEMBATAN` — jembatan dan struktur sejenis (abutment, pier, girder, deck).
- `BENDUNGAN` — bendungan, bendung (weir), bangunan sadap/diversi, dan
  struktur hidrolika sejenis. Bedakan bendung vs bendungan vs bangunan
  sadap dari gambar: jangan menyamakan ketiganya.
- `IRIGASI` — saluran irigasi, bangunan bagi/sadap, dan jaringan irigasi.
- `BANGUNAN AIR` — drainase kota, gorong-gorong, jaringan pengendali
  banjir, dan bangunan air non-irigasi.
- `JALAN` — jalan, perkerasan, trotoar, bahu jalan, dan prasarana jalan.
- `PAVING` — perkerasan blok/paving dan halaman perkerasan.
- Proyek campuran/multidisiplin: token = keluarga dominan (struktur
  terbesar / nilai terbesar yang terbukti), disiplin lain disebut
  eksplisit pada ringkasan. Contoh: gedung dengan pekerjaan luar dan
  drainase tapak → `GEDUNG` + disiplin sekunder arsitektur, struktur,
  MEP, drainase, pekerjaan luar.

Bila bukti tidak cukup untuk memastikan tipe: keluaran tetap memakai
token dugaan terbaik, TETAPI ringkasan wajib diawali
"KLASIFIKASI SEMENTARA: ...", confidence item-item kunci LOW, dan
informasi yang hilang ditulis pada field asumsi/catatan
(`specification` mesin standar / `assumptions` + `missingInfo` Full AI).
Jangan pernah berpura-pura yakin.

## 3. WBS Bangunan & Hunian

Hanya kelompok yang terbukti/inferensi beralasan/usulan bertanda.
Urutan mengikuti urutan konstruksi.

1. Pekerjaan Persiapan — survei & pengukuran (uitzet/bowplank);
   mobilisasi & demobilisasi; pembersihan lahan & penebangan;
   fasilitas sementara (direksi kit, gudang, barak); pagar sementara,
   akses, utilitas sementara, K3; proteksi bangunan sekitar; dokumentasi
   kondisi eksisting bila disyaratkan.
2. Pekerjaan Tanah — galian, pembuangan, penimbunan; urugan, penggantian
   tanah, pemadatan; dewatering bila perlu; lantai kerja & beton kurus;
   persiapan dasar pondasi.
3. Pekerjaan Pondasi — pondasi dangkal (batu kali, footplat, telapak),
   sloof pondasi; tiang pancang/bored pile, pile cap, dan pengujian tiang
   bila dispesifikasikan; pembesian & bekisting pondasi; waterproofing
   pondasi / anti rayap bila dispesifikasikan.
4. Pekerjaan Struktur — kolom, balok, pelat/dak, tangga, dinding
   struktural; pembesian, bekisting, pengecoran; baja struktural &
   rangka atap; pasangan struktural bila berlaku; sambungan & pengujian
   bila dispesifikasikan.
5. Pekerjaan Dinding & Penutup — dinding luar & dalam, partisi; plester,
   acian; kusen, pintu, jendela, kaca & hardware; penutup atap, insulasi,
   waterproofing atap, talang; plafon & soffit.
6. Pekerjaan Finishing — lantai & dinding finish (keramik, batu, screed);
   pengecatan & coating protektif; finishing dekoratif; plint/skirting,
   trim, sealant, aksesori finishing.
7. Pekerjaan Interior — lemari tanam & wardrobe; kitchen set &
   countertop; partisi interior & panel dekoratif; furnitur & fixture
   BILA termasuk lingkup proyek; aksesoris listrik dekoratif interior;
   pintu interior, hardware & finishing khusus; fit-out lain yang
   terdokumentasi. Bila lingkup interior tidak ada di gambar/jadwal,
   JANGAN mengarang kitchen set, furnitur, atau finishing premium hanya
   karena "biasa ada di rumah".
8. Pekerjaan MEP — distribusi listrik, instalasi, grounding, penerangan;
   air bersih & plumbing; air kotor & sanitair; pompa, tandon, pengolahan
   air bila berlaku; HVAC & ventilasi; proteksi & deteksi kebakaran;
   lift, akses, otomasi gedung bila dispesifikasikan; testing &
   commissioning.
9. Pekerjaan Luar — jalan akses, paving, parkir, pedestrian; drainase
   tapak & sambungan riol; pagar keliling, gerbang, pos jaga; lansekap,
   tanam, furnitur tapak; penerangan luar & sambungan utilitas; septik
   atau utilitas tapak lain bila dispesifikasikan.
10. Pengujian, Penyelesaian & Serah Terima — testing & commissioning
    sistem; inspeksi & perbaikan cacat; pembersihan akhir & pembuangan
    sisa konstruksi; as-built & dokumen serah terima bila disyaratkan.
11. Pekerjaan Lain — HANYA bila bukti/lingkup mendukung. Jangan memakai
    "Lain-lain" sebagai pengganti klasifikasi item yang sebenarnya bisa
    dikenali.

## 4. WBS Bendungan, Bendung & Irigasi

Pakai hierarki hidrolika/sipil ini, BUKAN template bangunan.

1. Pekerjaan Persiapan — survei, benchmark, mobilisasi, akses,
   fasilitas sementara, K3.
2. Pembersihan, pengupasan, galian, persiapan dasar sungai, dan
   treatment pondasi.
3. Pengalihan sungai sementara, cofferdam, saluran bypass, dan
   dewatering bila dispesifikasikan.
4. Timbunan, penempatan fill, pemadatan, dan pengolahan material bila
   berlaku (tubuh bendungan urugan).
5. Struktur beton — tubuh bendung, apron, kolam olak (stilling basin),
   dinding penahan, dan komponen struktural.
6. Pembesian, bekisting, pengecoran, joint, dan curing.
7. Cutoff wall, kendali rembesan, filter, lapisan drainase, dan grouting
   bila dispesifikasikan.
8. Spillway, peredam energi, outlet works, intake, pintu air, hoist,
   dan peralatan mekanikal BILA terdokumentasi.
9. Galian saluran irigasi, lining, timbunan, dan struktur saluran.
10. Bangunan silang — gorong-gorong silang, akuaduk, sifon, terjunan
    (drop), bangunan bagi, sadap, dan bangunan ukur bila terdokumentasi.
11. Pengaman sungai & tebing — riprap, gabion, dan proteksi erosi.
12. Jalan akses, jembatan, drainase tapak, dan utilitas penunjang.
13. Instrumentasi, monitoring, dan pengujian hidrolika bila
    dispesifikasikan.
14. Rehabilitasi, restorasi lingkungan, pengelolaan sedimen, dan
    penyelesaian bila termasuk lingkup.
15. Testing, commissioning & serah terima.

LARANGAN KHUSUS: jangan mengarang pintu air, pompa, instrumentasi,
atau peralatan mekanikal tanpa bukti gambar/spesifikasi. Bendung tanpa
pintu pada gambar = bendung tanpa pintu pada keluaran (tulis sebagai
catatan "tidak terdokumentasi" bila relevan, bukan sebagai item).

## 5. WBS Jalan & Perkerasan

1. Pekerjaan Persiapan — survei, manajemen lalu lintas, mobilisasi,
   akses sementara.
2. Pembersihan, pengupasan, pembongkaran, dan pembuangan perkerasan lama.
3. Pekerjaan Tanah — galian, timbunan, material pinjaman, pembuangan.
4. Penyiapan tanah dasar — pembentukan, kadar air, pemadatan.
5. Timbunan pilihan & perbaikan tanah dasar bila dispesifikasikan.
6. Lapis fondasi — subbase & base course.
7. Lapis perkerasan — aspal (AC-WC/AC-BC/lapen) ATAU beton semen,
   sesuai desain. Jangan mencampur susunan lentur dan kaku kecuali
   desain memang menetapkan keduanya (mis. segmen berbeda).
8. Tack coat, prime coat, seal coat, dan surface treatment bila berlaku.
9. Bahu jalan, median, trotoar, paving block, dan kerb.
10. Drainase samping, gorong-gorong, drainase melintang, dan sistem
    air hujan.
11. Dinding penahan, stabilisasi lereng, dan proteksi erosi.
12. Marka, rambu, guardrail, delineator, dan perangkat keselamatan.
13. Jembatan atau struktur lain dalam batas proyek — klasifikasikan
    sebagai paket struktur terpisah (§2: disiplin sekunder JEMBATAN).
14. Penerangan jalan, utilitas, lansekap, dan restorasi bila
    dispesifikasikan.
15. Pengujian material, kepadatan lapangan, pengujian perkerasan, dan
    penyelesaian bila disyaratkan.

## 6. Keluarga sipil & infrastruktur lain

Gunakan kembali pola umum (persiapan, tanah, struktur, MEP/peralatan,
pengujian, penyelesaian) dan sesuaikan detailnya dengan proyek nyata:

- Drainase & pengendali banjir — saluran, gorong-gorong, inlet/outlet,
  kolam retensi/detensi, pompa banjir BILA terdokumentasi, tanggul,
  pintu air, dan bangunan pelengkap.
- Gorong-gorong & jembatan kecil — galian, fondasi, struktur box/buis/
  pelat, timbunan kembali, proteksi inlet/outlet, dan jalan pendekat.
- Dinding penahan & proteksi lereng — galian, fondasi, struktur dinding
  (beton/pasangan/gabion), drainase belakang dinding, timbunan kembali,
  dan proteksi permukaan lereng.
- Air bersih & distribusi — galian & timbunan pipa, pemasangan pipa &
  fitting, bangunan sadap/reservoir BILA terdokumentasi, pompa & panel
  BILA terdokumentasi, pengujian tekanan & desinfeksi.
- Air limbah & sanitasi — galian pipa, pemasangan pipa, manhole,
  bangunan pengolahan BILA terdokumentasi, dan sambungan akhir.
- Site development & koridor utilitas — cut & fill tapak, jalan tapak,
  drainase tapak, utilitas bawah tanah, pagar, dan lansekap.
- Rehabilitasi & pemeliharaan — pembongkaran terbatas, perbaikan
  struktur/perkerasan/saluran yang rusak, pelapisan ulang, dan
  penyelesaian; jangan mengklasifikasikan pekerjaan baru sebagai
  rehabilitasi bila gambar menunjukkan pembangunan baru.

## 7. Status bukti & pemetaan ke field yang ada

Setiap item WAJIB membawa tepat satu status berikut. Status ditentukan
oleh bukti, bukan oleh keinginan agar RAB terlihat lengkap.

- `DRAWING_CONFIRMED` — didukung eksplisit oleh gambar, spesifikasi,
  atau BOQ yang diberikan.
  - Mesin standar: `quantitySource` = `DED_EXPLICIT` (angka tertulis)
    atau `DED_GEOMETRIC` (dihitung dari dimensi DED); `confidence` HIGH
    (atau MEDIUM bila dimensinya parsial); `sourcePages` + `sourceEvidence`
    wajib terisi.
  - Full AI: `provenance` = `EXPLICIT` (tertulis) atau `DERIVED`
    (hitungan dari data DED); `confidence` HIGH/MEDIUM.
- `INFERRED_NEEDS_REVIEW` — secara wajar tersirat dari desain yang
  terdokumentasi, tetapi tidak terkonfirmasi eksplisit.
  - Mesin standar: `quantitySource` = `AI_INFERENCE`; `confidence`
    MEDIUM/LOW; `quantityFormula` menulis dasar inferensinya dan
    `specification` menulis apa yang belum terkonfirmasi.
  - Full AI: `provenance` = `ASSUMPTION`; `assumptions` menulis dasar
    inferensi dan apa yang perlu dikonfirmasi; `confidence` MEDIUM/LOW.
  - Item inferensi tetap dikeluarkan (tidak disembunyikan); aplikasi
    yang menentukan masuk tidaknya ke total lewat validasinya.
- `PROPOSED_NOT_IN_SOURCE` — berpotensi diperlukan atau lazim untuk
  tipe proyek ini, tetapi TIDAK terbukti dari dokumen yang diberikan.
  - Kedua mesin: `quantity` = null kecuali ada dasar ukur yang bisa
    dipertanggungjawabkan; `confidence` = LOW; tandai eksplisit pada
    field catatan (`specification` mesin standar /
    `assumptions` Full AI) dengan awalan persis:
    `USULAN — TIDAK ADA DI DED: <alasan + apa yang perlu diverifikasi>`.
  - Mesin standar: `quantitySource` = `ASSUMPTION` (bila ada dasar
    ukur) atau `UNRESOLVED` (bila tidak ada dasar sama sekali).
  - Full AI: `provenance` = `ASSUMPTION`; bila tidak ada dasar ukur,
    `qty` = null.
  - Jangan pernah menaikkan item usulan menjadi terkonfirmasi secara
    diam-diam, dan jangan memberi item usulan harga/identitas resmi.

Aturan bukti umum: sumber yang sama di beberapa halaman = SATU item
dengan `sourcePages` lengkap. Dua versi yang bertentangan disebut
keduanya pada catatan, dipilih satu dengan alasan, dan confidence
diturunkan ke LOW. Paket yang berpotensi hilang untuk tipe proyek
terdeteksi disajikan sebagai item `PROPOSED_NOT_IN_SOURCE` (bukan
sebagai fakta, dan bukan disembunyikan).

## 8. Larangan fabrikasi (berlaku semua mesin & mode)

- Jangan mengarang kode AHSP, koefisien resmi, atau harga resmi apa pun.
  Klaim AHSP hanya dari database kanonis aplikasi, bukan dari model.
- Jangan mengarang pintu air, pompa, instrumentasi, peralatan mekanikal,
  atau struktur yang tidak ada pada gambar/spesifikasi.
- Jangan mengarang interior (kitchen set, furnitur, finishing premium,
  fitur dekoratif) hanya karena lazim pada proyek hunian.
- Jangan membuat item yang SAMA SEKALI tidak ada di DED (contoh yang
  sudah dilarang di prompt Full AI: kolam renang di rumah type 36).
- Jangan memakai "Lain-lain" untuk menyembunyikan item yang sebenarnya
  bisa diklasifikasikan.
- Kuantitas/harga tanpa dasar = null, bukan nol. Total/subtotal resmi
  tetap dihitung aplikasi, bukan oleh model.

## 9. Hierarki keluaran & identitas item

Hierarki logis keluaran (tanpa menambah field):

- Tipe proyek (token §2) + disiplin sekunder (ringkasan).
- Kelompok WBS (`category` mesin standar; `wbsGroup` Full AI —
  keduanya memakai nama kelompok §3–§6).
- Subkelompok/detail (bagian dari nama item / `category` Full AI).
- Item pekerjaan individual (nama spesifik §0).
- Bukti & referensi gambar (`sourcePages` + `sourceEvidence` mesin
  standar; `sourcePages` + `assumptions`/`notes` Full AI).
- Status klasifikasi (§7) + spesifikasi / informasi yang hilang.
- Kandidat pemetaan AHSP bila berlaku — HANYA bila kode itu tertulis
  eksplisit di DED; bila ragu, kosongkan dan biarkan aplikasi yang
  mencocokkan. Jangan pernah mengarang kode.
- Kuantitas & satuan hanya bila didukung workflow ekstraksi/hitung yang
  berlaku; harga & provenance harga mengikuti kebijakan mode (§10).
- Identitas item dijaga aplikasi (ID stabil melewati edit & finalisasi);
  model membantu dengan nama item yang spesifik dan konsisten — jangan
  mengubah nama/kategori item yang sama menjadi nama yang berbeda tanpa
  alasan.

## 10. Pemisahan mode (penunjuk, bukan duplikasi aturan harga)

- DATABASE EZRAB: AI menafsirkan gambar, mendeteksi tipe, mengklasifikasi
  pekerjaan, dan mengusulkan/mengekstrak kuantitas sesuai workflow yang
  ada. Harga resmi HANYA dari database AHSP kanonis aplikasi; fallback
  estimasi AI hanya menurut kebijakan harga yang berlaku dan wajib
  berlabel `Estimasi AI`. Spesifikasi ini tidak boleh dipakai untuk
  melewati mesin hitung, validasi satuan, resolver harga, atau kontrol
  provenance aplikasi.
- FULL AI: AI boleh mengusulkan item, kuantitas, harga, subtotal usulan,
  dan total usulan secara independen dari database harga kanonis.
  Aplikasi tetap memvalidasi aritmetika secara deterministik dan
  memisahkan angka usulan AI dari angka terverifikasi. Harga AI tidak
  boleh diklaim resmi atau terverifikasi kanonis.
- FAST dan DETAIL adalah level kedalaman di dalam mesin standar — jangan
  dikacaukan dengan Full AI. Spesifikasi ini berlaku untuk ketiganya;
  yang membedakan hanyalah kebijakan harga dan kedalaman field yang
  sudah diatur system prompt masing-masing.
