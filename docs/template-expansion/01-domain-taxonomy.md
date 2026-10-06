# EZRAB — DOMAIN TAXONOMY & TEMPLATE CLASSIFICATION
## Master Template Expansion (Phase 5+ Extensibility Design)

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** Principal Software Architect, Quantity Surveyor  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Taksonomi Disiplin Konstruksi EZRAB

Untuk mengakomodasi 37+ tipe proyek konstruksi tanpa mencampuradukkan parameter keteknikan yang berbeda, sistem diklasifikasikan ke dalam **5 Disiplin Utama**:

```
EZRAB Master Domain Taxonomy
 ├── 1. BUILDING (Gedung & Arsitektur)
 │    ├── Hotel
 │    ├── Hospital (Rumah Sakit)
 │    ├── Multipurpose Hall (Gedung Serbaguna)
 │    ├── Office (Gedung Perkantoran)
 │    ├── School (Gedung Sekolah / Pendidikan)
 │    ├── Mosque (Masjid / Tempat Ibadah)
 │    ├── Warehouse (Gudang Logistik / Industri)
 │    ├── Market (Pasar Tradisional / Modern)
 │    └── Parking Building (Gedung Parkir Bertingkat)
 │
 ├── 2. ROAD AND PAVEMENT (Jalan & Perkerasan)
 │    ├── Asphalt Road (Jalan Aspal Standar)
 │    ├── Flexible Pavement (Perkerasan Lentur Multilapis)
 │    ├── Paving Block (Perkerasan Blok Beton Interlocking)
 │    ├── Rigid Concrete Pavement (Jalan Beton Semen Kaku)
 │    ├── Sidewalk (Trotoar & Fasilitas Pejalan Kaki)
 │    └── Road Rehabilitation (Overlay & Rekonstruksi Jalan)
 │
 ├── 3. WATER RESOURCES (Sumber Daya Air & Bangunan Air)
 │    ├── Gravity Dam (Bendungan Beton Gravitasi)
 │    ├── Embankment Dam (Bendungan Urugan Tanah/Batu Inti Lempung)
 │    ├── Embung / Reservoir (Kolam Retensi / Waduk Lapangan)
 │    ├── Irrigation Canal (Saluran Irigasi Primer/Sekunder)
 │    ├── Irrigation Structure (Bangunan Bagi/Sadar/Ukur)
 │    ├── Spillway (Pelimpah Banjir Bendungan)
 │    ├── Intake (Bangunan Pengambil Air Baku)
 │    ├── Outlet (Bangunan Pengeluaran / Bottom Outlet)
 │    └── River Protection (Perlindungan Tebing Sungai / Revetment)
 │
 ├── 4. DRAINAGE (Drainase Kawasan & Saluran Perkotaan)
 │    ├── Open Channel (Saluran Terbuka Pasangan Batu/Beton)
 │    ├── Trapezoidal Channel (Saluran Trapesium Tanah/Lining)
 │    ├── V-Shaped Channel (Saluran Segitiga Kemiringan Curam)
 │    ├── Box Culvert (Gorong-Gorong Persegi Precast/Cast-in-Place)
 │    ├── Circular Culvert (Gorong-Gorong Pipa Beton Bertulang RCP)
 │    ├── Road Drainage (Drainase Samping Jalan Terintegrasi)
 │    ├── Catchpit (Bak Kontrol Penangkap Sedimen)
 │    ├── Manhole (Sumur Pemeriksa Drainase)
 │    └── Sump Pit (Bak Penampung Pompa Banjir / Sumur Resapan)
 │
 └── 5. CIVIL AND STRUCTURE (Struktur Sipil Khusus & Geoteknik)
      ├── Small Bridge (Jembatan Bentang Pendek < 15m)
      ├── Concrete Bridge (Jembatan Gelagar Beton Bertulang/Prategang)
      ├── Retaining Wall (Dinding Penahan Tanah Gravitasi / Kantilever)
      ├── Deep Foundation (Pondasi Dalam: Tiang Pancang / Bore Pile)
      ├── Earthwork (Pekerjaan Tanah Masif: Cut & Fill / Stripping)
      ├── Riprap (Pasangan Batu Pelindung Erosi Terbuka)
      ├── Gabion (Bronjong Kawat Anyam Isi Batu Belah)
      ├── Steel Structure (Struktur Baja Bentang Lebar / Portal Frame)
      └── Slope Protection (Proteksi Lereng: Shotcrete / Geomat / Soil Nailing)
```

---

## 2. Rincian Taksonomi per Template

### Disiplin 1: BUILDING (Gedung)

| Kode Template | Nama Template | Karakteristik Utama | Kompleksitas Teknis | Review Requirement |
| :--- | :--- | :--- | :--- | :--- |
| `BLD-HOTEL` | Hotel | Multi-lantai, pengulangan unit kamar (*typical guestrooms*), koridor, lobi, ballroom, lift, genset, MEP plumbing intensif. | **Tinggi** | Multi-discipline review (Arsitektur + MEP + QS) |
| `BLD-HOSPITAL` | Rumah Sakit | Zonasi steril, ruang operasi (OK), ICU, radiologi (timbal Pb), gas medis, limbah B3, HVAC HEPA, genset sinkron. | **Sangat Tinggi** | Strict Healthcare Specialist Review |
| `BLD-HALL` | Gedung Serbaguna | Bentang lebar tanpa kolom tengah (*clear span*), rangka atap baja space-frame/truss, akustik ruang, lantai fleksibel. | **Menengah** | Structural Engineering Review |
| `BLD-OFFICE` | Gedung Perkantoran | Layout open space, partisi kaca/gypsum, raised floor data center, lift penumpang, facade curtain wall. | **Menengah** | Standard Estimator Review |
| `BLD-SCHOOL` | Gedung Sekolah | Modul ruang kelas standar, laboratorium, selasar terbuka, sanitasi kelompok, pencahayaan alami optimal. | **Rendah-Menengah** | Standard Estimator Review |
| `BLD-MOSQUE` | Masjid | Kubah utama/enamel, menara (*minaret*), mihrab, ornamen GRC krawangan, bentang bebas kolom, tempat wudhu masif. | **Menengah-Tinggi** | Architectural Specialist Review |
| `BLD-WAREHOUSE` | Gudang Logistik | Struktur baja portal frame/WF, atap galvalum/zincalume, lantai *hardener* beban berat, loading dock. | **Menengah** | Industrial Structural Review |
| `BLD-MARKET` | Pasar Tradisional/Modern | Los pedagang, kios permanen, drainase basah anti-mampet, pengolahan sampah/IPAL, instalasi hidran. | **Menengah** | Municipal Infrastructure Review |
| `BLD-PARK` | Gedung Parkir Bertingkat | Pelat lantai tanpa balok (*flat slab*), ramp melingkar, proteksi korosi karbonmonoksida, sprinkler parkir. | **Menengah-Tinggi** | Structural Dynamics Review |

---

### Disiplin 2: ROAD AND PAVEMENT (Jalan & Perkerasan)

| Kode Template | Nama Template | Karakteristik Utama | Spesifikasi Standar |
| :--- | :--- | :--- | :--- |
| `ROAD-ASPHALT` | Jalan Aspal Standar | Subgrade, Lapis Pondasi Bawah (LPB/Klas B), Lapis Pondasi Atas (LPA/Klas A), Prime Coat, AC-BC, Tack Coat, AC-WC. | Bina Marga Divisi 5 & 6 |
| `ROAD-FLEX-PAVE` | Flexible Pavement Khusus | Analisa modulus elastisitas tanah dasar (CBR), lalu lintas harian rata-rata (LHR), tebal struktural bertingkat. | MDPJ Bina Marga 2024 |
| `ROAD-PAVING` | Paving Block | Subbase pasir padat/agregat, bedding sand t=3-5cm, paving block mutu K-300 s/d K-400 t=6/8cm, kanstin pengunci. | SNI 03-0691 / Cipta Karya |
| `ROAD-RIGID-PAVE` | Rigid Concrete Pavement | Lean concrete Bo t=5-10cm, pelat beton semen fs 4.5 MPa, dowel bar, tie bar, joint sealant, curing compound. | Bina Marga Divisi 5 |
| `ROAD-SIDEWALK` | Trotoar & Fasilitas Pejalan | Kerb/kanstin, guiding block difabel (tactile tile), cor beton/andesit, bollard pengaman, inlet drainase. | Permen PUPR No. 02/PRT/M/2014 |
| `ROAD-REHAB` | Road Rehabilitation | Cold milling/scraping aspal lama, leveling course, patching lubang, tack coat, wearing course overlay. | Bina Marga Divisi 6 & 10 |

---

### Disiplin 3: WATER RESOURCES (Sumber Daya Air)

| Kode Template | Nama Template | Karakteristik Utama | Standar Desain |
| :--- | :--- | :--- | :--- |
| `SDA-DAM-GRAVITY` | Gravity Dam | Tubuh bendungan beton siklop/mass concrete, galeri inspeksi, fondasi grouting tirai (*curtain grout*), waterstop. | Kriteria Bendungan Dirjen SDA |
| `SDA-DAM-EMBANK` | Embankment Dam | Inti lempung kedap air (*impervious clay core*), zona filter halus/kasar, zona transisi, riprap batu belah luar. | SNI 8064 / RSNI SDA |
| `SDA-EMBUNG` | Embung / Kolam Retensi | Tanggul tanah urugan dipadatkan, geomembran HDPE pelapis dasar, inlet saluran intake, pelimpah darurat, kolam olak. | Pedoman Embung PUPR 2021 |
| `SDA-CANAL-IRR` | Saluran Irigasi | Galian trapesium, lining pasangan batu 1:3 / precast beton L-shape/U-shape, jalan inspeksi tanggul. | Kriteria Perencanaan KP-01 s/d KP-09 |
| `SDA-STRUCT-IRR` | Bangunan Bagi/Sadar/Ukur | Pintu air sorong baja (*sluice gate*), balok skot skat (*stoplog*), pelimpah ambang lebar/Cipoletti/Romijn. | Standar Perencanaan Bangunan KP-04 |
| `SDA-SPILLWAY` | Pelimpah Banjir Bendungan | Saluran pengarah, ambang pelimpah (*crest ogee*), saluran luncur (*chute*), peredam energi kolam olak (*stilling basin*). | Standar Bangunan Pelimpah SDA |
| `SDA-INTAKE` | Bangunan Pengambil Air | Trashrack saringan sampah, menara intake beton, pipa sadap hulu, katup pengatur (*butterfly/gate valve*). | Standar Bangunan Pengambil SDA |
| `SDA-OUTLET` | Bottom Outlet | Pipa tekan baja/konduit beton bawah bendungan, ruang katup, peredam turbulensi hilir. | Spesifikasi Outlet SDA |
| `SDA-RIVER-PROT` | Perlindungan Tebing Sungai | Revetment pasangan batu, sheet pile beton (CCSP), krib pengarah arus (*groin*), bantalan geotekstil non-woven. | Pedoman Sungai Ditjen SDA |

---

### Disiplin 4: DRAINAGE (Drainase)

| Kode Template | Nama Template | Karakteristik Utama | Modul Volume |
| :--- | :--- | :--- | :--- |
| `DRN-OPEN-CHAN` | Open Channel | Saluran persegi/trapesium, dinding batu belah 1:4 atau beton K-225 bertulang, plesteran siar 1:2. | Hidrolika Manning & Galian |
| `DRN-TRAP-CHAN` | Trapezoidal Channel | Kemiringan talud lereng ($m=1.0 \text{ s/d } 1.5$), lining beton porous / pasangan batu, saluran alami. | Geometri Talud & Hidrolika |
| `DRN-V-CHAN` | V-Shaped Channel | Saluran segitiga sudut $90^\circ / 120^\circ$, drainase lereng jalan pegunungan, kecepatan gerusan tinggi. | Aliran Saluran Curam |
| `DRN-BOX-CULV` | Box Culvert | Beton pracetak kotak tunggal (*single*) atau ganda (*double*), dimensi $1000\times1000$ s/d $3000\times3000\text{ mm}$, lantai kerja Bo. | Spesifikasi Precast Box PUPR |
| `DRN-PIPE-RCP` | Circular Culvert | Pipa beton bertulang (RCP) dia 40cm s/d 150cm, sambungan *spigot-socket* mortar, urugan pasir pengaman. | Standar RCP Bina Marga |
| `DRN-ROAD-SIDE` | Road Drainage Terintegrasi | Saluran samping U-ditch + cover grill besi / beton bertulang kuat beban gandar truk, bak penangkap berkala. | Standar Drainase Jalan |
| `DRN-CATCHPIT` | Catchpit Sedimen | Bak kontrol pasangan bata/beton $60\times60\text{ cm}$, saringan kotoran, dasar tampungan lumpur t=20cm. | Sanitasi & Drainase Perkotaan |
| `DRN-MANHOLE` | Manhole | Sumur pemeriksaan beton bulat/kotak, tutup besi cor (*ductile cast iron cover*), tangga pijakan besi rontgen. | Standar Utilitas Bawah Tanah |
| `DRN-SUMP-PIT` | Sump Pit & Rumah Pompa | Bak penampung bawah tanah, dinding beton kedap air (waterproofing kristalin), dudukan pompa submersible. | MEP Drainase & Pengendalian Banjir |

---

### Disiplin 5: CIVIL AND STRUCTURE (Struktur Sipil Khusus)

| Kode Template | Nama Template | Karakteristik Utama | Analisa AHSP Kunci |
| :--- | :--- | :--- | :--- |
| `CIV-BRG-SMALL` | Small Bridge | Jembatan bentang tunggal $L \le 15\text{ m}$, gelagar I-Girder / T-Beam beton bertulang, abutment gravitasi, expansion joint. | Bina Marga Divisi 7 (Struktur) |
| `CIV-BRG-CONC` | Concrete Bridge | Jembatan balok prategang (PCI Girder) $L=20-40\text{ m}$, elastomer bearing pad, diafragma, pier beton, railing baja. | Bina Marga Divisi 7 (Jembatan) |
| `CIV-RET-WALL` | Retaining Wall | Dinding penahan tanah gravitasi (batu belah) / kantilever (beton bertulang), pipa suling-suling (*weep holes*), ijuk filter. | SNI 8460:2017 Geoteknik |
| `CIV-DEEP-FOUND` | Deep Foundation | Tiang pancang spun pile dia 40-60cm / bore pile dia 60-120cm, pile cap beton masif, pengujian PDA/PIT. | AHSP Pondasi Dalam Bina Marga/CK |
| `CIV-EARTHWORK` | Earthwork Masif | Stripping humus, cut volume tanah biasa/berbatu, fill & compaction per layer 30cm, uji kepadatan Sand Cone. | Bina Marga Divisi 3 (Tanah) |
| `CIV-RIPRAP` | Riprap Batu Gajah | Hamparan batu belah besar ($D_{50}=30-50\text{ cm}$) pelindung kaki tanggul / abutment dari gerusan arus air (*scour*). | SDA / Bina Marga |
| `CIV-GABION` | Bronjong Kawat (Gabion) | Anyaman kawat galvanis / lapis PVC tebal 2.7-3.4mm ukuran $2\times1\times0.5\text{ m}$ diisi batu keras tidak lapuk. | SNI 03-0090 / SDA |
| `CIV-STEEL-STRUCT` | Struktur Baja Bentang Lebar | Kolom & rafter baja profil H-Beam / WF / Castellated, baut HTB grade 8.8, ikatan angin (*bracing*), cat zinkromate & intumescent. | AISC / SNI 1729 / Cipta Karya |
| `CIV-SLOPE-PROT` | Slope Protection | Geomat pengikat akar, wire mesh tebal, soil nailing batangan besi D25 grouting semen, shotcrete beton semprot t=7-10cm. | Pedoman Lereng Geoteknik PUPR |

---

## 3. Kesimpulan Taksonomi

Taksonomi ini menetapkan batasan disiplin yang tegas sehingga **tidak ada lagi asumsi bahwa semua proyek dapat dihitung menggunakan formula bangunan gedung**. Setiap disiplin akan memiliki *Calculation Module* dan *Component Library* independen.
