# EZRAB — PARAMETRIC COMPONENT LIBRARY DESIGN
## Reusable Modular Building Blocks for Multi-Disciplinary Construction

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** Principal Software Architect, BIM/Parametric Engineer  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Arsitektur Reusable Component Library

Daripada menuliskan formula perhitungan berulang di setiap template, EZRAB Phase 5+ mengadopsi pola **Composable Parametric Component Library**. 

Sebuah *Project Template* (misal: `BLD-HOSPITAL` atau `ROAD-ASPHALT`) bertindak sebagai *Orchestrator* yang merangkai komponen-komponen mandiri (*autonomous components*) berikut:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PROJECT TEMPLATE (e.g. BLD-HOTEL)                    │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
      ┌─────────────▼─────────────┐    ┌─────────────▼─────────────┐
      │   Pondasi & Struktur Bawah │    │   Struktur Atas & Lantai  │
      │  (DeepFoundationComp)     │    │  (FrameSuperstructureComp)│
      └─────────────┬─────────────┘    └─────────────┬─────────────┘
                    │                                │
      ┌─────────────▼─────────────┐    ┌─────────────▼─────────────┐
      │   Arsitektur & Dinding    │    │   MEP & Utilitas          │
      │  (WallFinishingComp)      │    │  (HotelPlumbingMepComp)   │
      └───────────────────────────┘    └───────────────────────────┘
```

---

## 2. Definisi Antarmuka Komponen (Component Contract)

Setiap komponen mengimplementasikan kontrak standar:

```typescript
export interface IParametricComponent<TParams, TAssumptions> {
  readonly componentId: string;
  readonly componentName: string;
  readonly discipline: 'BUILDING' | 'ROAD' | 'WATER_RESOURCES' | 'DRAINAGE' | 'CIVIL';
  
  // Validasi parameter internal komponen
  validate(params: Partial<TParams>): { valid: boolean; errors: string[]; warnings: string[] };
  
  // Eksekusi kalkulasi deterministik volume item-item pekerjaan
  calculate(
    params: TParams,
    assumptions?: Partial<TAssumptions>,
    context?: { region?: string; elevation?: number }
  ): ComponentCalculationResult;
  
  // Pemetaan geometri 3D (jika didukung)
  to3dGeometryNodes?(params: TParams): GeometryNode3D[];
  
  // Pemetaan key ekstrasi Vision OCR DED
  getVisionKeyMappings(): Record<string, string>;
}
```

---

## 3. Katalog Komponen Reusable (17 Komponen Inti)

### A. Substruktur & Tanah
1. **`EarthworkCutFillComponent` (Pekerjaan Tanah Masif & Galian)**
   - *Input:* Panjang, lebar dasar, kedalaman rata-rata, slope kemiringan talud ($1:m$), tipe tanah (biasa/keras/badas), faktor kembang susut ($F_s$).
   - *Output Item:* Galian tanah biasa/keras ($m^3$), urugan kembali ($m^3$), pemadatan tanah per layer ($m^3$), buangan tanah sisa keluar tapak ($m^3$).
   - *Digunakan oleh:* Semua template gedung, jalan, bendungan, saluran, jembatan.

2. **`ContinuousFootingComponent` (Pondasi Dangkal Menerus Batu Belah)**
   - *Input:* Total panjang pondasi ($L$), lebar atas ($b_1$), lebar bawah ($b_2$), tinggi trapesium ($h$), tebal aanstamping ($t_a$), tebal pasir urug ($t_p$).
   - *Output Item:* Galian tanah pondasi ($m^3$), pasir urug ($m^3$), batu kosong/aanstamping ($m^3$), pasangan batu belah 1:5 ($m^3$).
   - *Digunakan oleh:* `HOUSE-*`, `BLD-SCHOOL`, `BLD-OFFICE`, `CIV-RET-WALL`.

3. **`DeepFoundationComponent` (Pondasi Dalam: Tiang Pancang / Bore Pile)**
   - *Input:* Jumlah titik tiang ($N$), diameter/dimensi tiang ($D$), kedalaman rata-rata ($H$), tipe tiang (Spun Pile/Bore Pile/Mini Pile).
   - *Output Item:* Pengadaan tiang pancang / pengeboran ($m$), pemancangan/mobilisasi alat drop/hydraulic hammer ($m$), pemotongan kepala tiang (*chipping* unit), beton pile cap ($m^3$), pembesian pile cap (kg).
   - *Digunakan oleh:* `BLD-HOTEL`, `BLD-HOSPITAL`, `CIV-BRG-CONC`, `BLD-PARK`.

---

### B. Struktur Rangka & Plat
4. **`ConcreteFrameComponent` (Balok, Kolom, Plat Lantai Beton Bertulang)**
   - *Input:* Dimensi kolom ($b_k \times h_k \times H \times N$), dimensi balok ($b_b \times h_b \times L$), tebal pelat ($t_s$), rasio pembesian ($kg/m^3$), mutu beton (f'c / K-250 s/d K-350).
   - *Output Item:* Bekisting pelat/balok/kolom ($m^2$), pembesian besi ulir BJTS 420B (kg), pengecoran ready mix ($m^3$).
   - *Digunakan oleh:* Semua template Building, `CIV-BRG-SMALL`.

5. **`SteelPortalFrameComponent` (Rangka Baja WF / H-Beam Bentang Lebar)**
   - *Input:* Bentang bersih (*span* $L$), jarak antar portal ($S$), tinggi kolom ($H$), profil WF kolom & rafter, berat gording per meter ($q$).
   - *Output Item:* Fabrikasi & ereksi baja profil WF (kg), base plate & anchor bolt (kg), baut HTB Grade 8.8 (buah), gording kanal C (kg), ikatan angin & tie rod (kg), cat zinkromate/epoxy ($m^2$).
   - *Digunakan oleh:* `BLD-WAREHOUSE`, `BLD-HALL`, `BLD-MARKET`, `CIV-STEEL-STRUCT`.

---

### C. Dinding, Finis, & Arsitektur
6. **`WallFinishingComponent` (Dinding Pasangan, Plesteran, Acian, Cat)**
   - *Input:* Luas kotor dinding ($A_{gross}$), total luas bukaan pintu/jendela ($A_{open}$), tebal dinding (10cm/15cm), tipe bata (hebel/merah).
   - *Output Item:* Pasangan bata hebel/merah ($m^2$), plesteran 1:5 tebal 15mm 2 sisi ($m^2$), acian semen instan ($m^2$), cat dasar + interior/eksterior 2 lapis ($m^2$).
   - *Digunakan oleh:* Semua template Building.

7. **`OpeningEnvelopeComponent` (Pintu, Jendela, Curtain Wall)**
   - *Input:* Jumlah modul pintu per tipe (P1, P2, PJ1), kusen aluminium (m'), daun pintu solid/kaca (unit), jendela swing/sliding (unit), aksesoris kunci & engsel (set).
   - *Output Item:* Kusen aluminium 4" (m'), daun pintu kayu/kaca (unit), aksesoris pintu/jendela (set), sealant kaca (m').
   - *Digunakan oleh:* Semua template Building.

8. **`RoofTrussCoverComponent` (Rangka Atap Baja Ringan / Genteng)**
   - *Input:* Luas denah atap ($A_{plan}$), kemiringan sudut ($\alpha^\circ$), overhang teritisan ($e$), tipe penutup (genteng metal/keramik/bitumen/spandek).
   - *Output Item:* Luas bidang atap miring ($m^2$), rangka atap baja ringan C75/0.75 ($m^2$), penutup atap ($m^2$), nok/wuwungan genteng (m'), lisplank GRC (m'), talang jurai seng/galvalum (m').
   - *Digunakan oleh:* Semua template Building.

---

### D. Jalan, Perkerasan, & Trotoar
9. **`AsphaltLayerComponent` (Struktur Perkerasan Aspal Fleksibel)**
   - *Input:* Panjang trase ($L$), lebar perkerasan ($W$), tebal LPB Klas B ($t_b$), tebal LPA Klas A ($t_a$), tebal AC-BC ($t_{bc}$), tebal AC-WC ($t_{wc}$).
   - *Output Item:* Lapis pondasi agregat kelas B ($m^3$), lapis pondasi agregat kelas A ($m^3$), lapis resap pengikat / Prime Coat ($L$), Asphalt Concrete Binder Course / AC-BC (ton), lapis perekat / Tack Coat ($L$), Asphalt Concrete Wearing Course / AC-WC (ton).
   - *Digunakan oleh:* `ROAD-ASPHALT`, `ROAD-FLEX-PAVE`, `ROAD-REHAB`.

10. **`PavingBlockLayerComponent` (Perkerasan Blok Beton Interlocking)**
    - *Input:* Luas area paving ($A$), tipe paving (persegi/holland/cacing), ketebalan (6cm/8cm), mutu beton (K-300/K-400), panjang keliling kanstin ($L_{kanstin}$).
    - *Output Item:* Subbase agregat/pasir padat ($m^3$), bedding sand t=4cm ($m^3$), pasang paving block ($m^2$), kanstin pembatas beton dipasang dudukan mortar ($m'$), joint filling sand ($m^2$).
    - *Digunakan oleh:* `ROAD-PAVING`, `ROAD-SIDEWALK`, `BLD-PARK`, `BLD-MARKET`.

---

### E. Hidrolika, Saluran, & Gorong-Gorong
11. **`DrainageChannelComponent` (Saluran Terbuka Pasangan Batu / Beton)**
    - *Input:* Panjang saluran ($L$), lebar dasar ($b$), tinggi jagaan ($w$), tinggi basah ($h$), kemiringan talud ($m$), tipe lining (pasangan batu / beton K-225).
    - *Output Item:* Galian tanah saluran ($m^3$), pasangan batu kali 1:4 ($m^3$) atau cor dinding beton ($m^3$), plesteran siar ($m^2$), lantai kerja Bo ($m^3$), urugan tanah kembali ($m^3$).
    - *Digunakan oleh:* `DRN-OPEN-CHAN`, `DRN-TRAP-CHAN`, `SDA-CANAL-IRR`, `ROAD-ASPHALT`.

12. **`BoxCulvertComponent` (Gorong-Gorong Persegi Precast)**
    - *Input:* Panjang trase lintasan ($L$), lebar dalam ($W_{inner}$), tinggi dalam ($H_{inner}$), tebal dinding ($t_w$), jumlah lajur (single/double).
    - *Output Item:* Galian gorong-gorong ($m^3$), pasir alas t=10cm ($m^3$), lantai kerja Bo t=5cm ($m^3$), pasang unit precast box culvert ($m'$), grouting sambungan (titik), urugan tanah kembali dan pemadatan ($m^3$), wingwall/headwall beton pasangan batu ($m^3$).
    - *Digunakan oleh:* `DRN-BOX-CULV`, `ROAD-ASPHALT`, `ROAD-RIGID-PAVE`.

---

### F. Geoteknik, Dinding Penahan, & Proteksi Lereng
13. **`RetainingWallComponent` (Dinding Penahan Tanah Gravitasi / Kantilever)**
    - *Input:* Panjang dinding ($L$), tinggi dinding ($H$), lebar atas ($b_{top}$), lebar dasar ($b_{base}$), kemiringan muka depan/belakang, material (batu belah/beton bertulang).
    - *Output Item:* Galian pondasi dinding ($m^3$), pasangan batu belah 1:3 ($m^3$) atau beton bertulang ($m^3$), pipa weep hole PVC 2" per $2\text{ m}^2$ (titik), lapisan filter ijuk & kerikil ($m^3$), urugan pasir di belakang dinding ($m^3$).
    - *Digunakan oleh:* `CIV-RET-WALL`, `SDA-RIVER-PROT`, `CIV-BRG-SMALL`.

14. **`GabionComponent` (Bronjong Kawat Anyam Isi Batu Belah)**
    - *Input:* Jumlah susunan trap tingkatan, dimensi kotak bronjong ($2\times1\times0.5\text{ m}$ atau $2\times1\times1\text{ m}$), tipe kawat (galvanis/PVC), total volume susunan ($V_{tot}$).
    - *Output Item:* Pengadaan kawat bronjong pabrikasi (unit), batu belah pengisi bronjong ($m^3$), pemasangan kawat pengikat/diafragma (kg), galian dudukan bronjong ($m^3$), geotekstil non-woven pemisah tanah ($m^2$).
    - *Digunakan oleh:* `CIV-GABION`, `SDA-RIVER-PROT`, `CIV-SLOPE-PROT`.

15. **`RiprapComponent` (Hamparan Batu Pelindung Erosi / Scour Protection)**
    - *Input:* Luas lereng/dasar yang dilindungi ($A$), ketebalan lapisan riprap ($t$), diameter batu rata-rata ($D_{50}$).
    - *Output Item:* Batu belah keras/batu boulder ($m^3$), geotekstil separator non-woven ($m^2$), perataan dan penataan manual/ekskavator ($m^3$).
    - *Digunakan oleh:* `CIV-RIPRAP`, `SDA-DAM-EMBANK`, `SDA-RIVER-PROT`, `CIV-BRG-CONC`.

---

### G. Bangunan Air Khusus & Jembatan
16. **`BridgeDeckComponent` (Gelagar & Lantai Jembatan)**
    - *Input:* Bentang ($L$), lebar jembatan ($W$), jumlah gelagar ($N_g$), tipe gelagar (I-Girder Beton Bertulang / PCI Prategang / Baja Komposit), tebal lantai ($t_{slab}$).
    - *Output Item:* Pengadaan & ereksi girder (m'/batang), elastomer bearing pad (buah), diafragma beton ($m^3$), pelat lantai beton mutu tinggi K-350 ($m^3$), pembesian ulir (kg), expansion joint asphaltic plug / strip seal (m'), pipa drainase jembatan (titik), railing baja galvanis (m').
    - *Digunakan oleh:* `CIV-BRG-SMALL`, `CIV-BRG-CONC`.

17. **`SpillwayHydraulicComponent` (Pelimpah & Kolom Olak Peredam Energi)**
    - *Input:* Lebar ambang ($B$), tinggi ambang pelimpah ($H_{crest}$), panjang saluran luncur ($L_{chute}$), panjang kolam olak ($L_{basin}$), tebal dinding samping beton ($t$).
    - *Output Item:* Galian batu/tanah luncuran ($m^3$), beton masif K-250 ambang & kolam olak ($m^3$), pembesian bertulang (kg), bekisting permukaan licin ($m^2$), waterstop PVC sambungan kontraksi (m'), pipa suling drainase dasar pelimpah (titik).
    - *Digunakan oleh:* `SDA-SPILLWAY`, `SDA-DAM-GRAVITY`, `SDA-DAM-EMBANK`, `SDA-EMBUNG`.

---

## 4. Keuntungan Desain Komponen

1. **Anti-Duplikasi**: Setiap formula diuji dan dipelihara di satu titik terpusat.
2. **Backward Compatibility**: 7 template lama Phase 1-4 tetap berjalan tanpa distorsi karena komponen baru dirancang modular dan non-breaking.
3. **Auditability**: Quantity Surveyor dapat menguji trace kalkulasi komponen secara terisolasi dengan unit test spesifik.
