# EZRAB — DED → RAB AI-FIRST ARCHITECTURE
**Version:** 1.0  
**Mode:** Clean Baseline Rebuild (AI-First)  
**Agent Name:** `EZRAB DED → RAB AI`  
**Generated At:** 2026-10-01  

---

## 1. Konsep Dasar & Paradigma AI-First
Dalam arsitektur baru ini:
- **AI adalah Reasoning Layer:** AI bertindak sebagai Quantity Surveyor (QS) / Estimator cerdas yang membaca denah, potongan, tampak, detail konstruksi, schedule, legenda, spesifikasi teknis, dan menghubungkan informasi lintas halaman.
- **EZRAB Database & Tools adalah Source of Truth:** AI tidak boleh mengarang kode AHSP, tidak boleh mengarang koefisien analisa, tidak boleh mengarang material, dan tidak boleh mengarang harga. Semua data resmi bersumber dari database dan dihitung deterministik via SafeDecimalEngine.
- **Prioritas Utama:** `ACCURACY > COMPLETENESS > SPEED`. AI diperbolehkan menggunakan penalaran mendalam dan waktu yang cukup sebelum mengambil kesimpulan final.

---

## 2. Alur Kerja End-to-End

```
USER UPLOAD DED (PDF / Gambar)
        │
        ▼
DED PAGE & IMAGE RENDERER (PDF.js / Canvas)
        │
        ▼
EZRAB DED → RAB AI (Reasoning Agent)
  ├── 1. Membaca seluruh halaman secara menyeluruh
  ├── 2. Memahami konteks proyek & tipe gambar
  ├── 3. Mengidentifikasi SEMUA pekerjaan konstruksi nyata
  ├── 4. Membaca dimensi & spesifikasi (panjang, lebar, tinggi, tebal, mutu)
  ├── 5. Menghubungkan informasi antar halaman (Denah + Potongan + Detail + Schedule)
  ├── 6. Mencocokkan pekerjaan dengan AHSP Resmi EZRAB (PUPR 2026)
  ├── 7. Mengambil dekomposisi komponen material & upah dari AHSP EZRAB
  └── 8. Menyelesaikan harga (Hierarki 5-level, termasuk External Price Search jika missing)
        │
        ▼
EZRAB TOOLS & VALIDATION GATES
  ├── Tool: read_ded_page / read_ded_image
  ├── Tool: search_ahsp / get_ahsp_detail
  ├── Tool: search_material / get_material_detail
  ├── Tool: calculate_quantity / SafeDecimalEngine
  ├── Tool: get_price / search_external_price
  ├── Tool: create_rab_draft / validate_rab / apply_rab
  └── 12 Gerbang Validasi Deterministik (Fail-Closed)
        │
        ▼
DED ANALYSIS SUMMARY & REVIEW WORKSPACE
        │
        ▼ (Setelah Persetujuan Pengguna)
RAB SPREADSHEET EZRAB (9-Tab Workspace)
```

---

## 3. Canonical Work Item Structure
Setiap pekerjaan yang diidentifikasi oleh AI harus memiliki struktur data kanonikal:

```typescript
export interface CanonicalDedWorkItem {
  workItemId: string;
  category: 'STRUKTUR' | 'ARSITEKTUR' | 'MEP' | 'PERSIAPAN' | 'LAINNYA';
  workName: string;
  description: string;
  specification: string;
  materialSpecification?: string;
  dimensions: {
    length?: { value: number | null; unit: string; evidenceId?: string };
    width?: { value: number | null; unit: string; evidenceId?: string };
    height?: { value: number | null; unit: string; evidenceId?: string };
    thickness?: { value: number | null; unit: string; evidenceId?: string };
    count?: { value: number | null; unit: string; evidenceId?: string };
    diameter?: { value: number | null; unit: string; evidenceId?: string };
  };
  quantity: number | null;
  unit: string;
  sourceEvidence: {
    file: string;
    page: number;
    region?: { x: number; y: number; width: number; height: number };
    textEvidence: string;
    imageEvidenceUrl?: string;
  }[];
  confidence: number;
  ahspCandidates: {
    code: string;
    name: string;
    unit: string;
    unitPrice: number;
    matchType: 'EXACT' | 'SEMANTIC' | 'CLOSE';
    similarityScore: number;
  }[];
  selectedAhsp: {
    code: string;
    name: string;
    unit: string;
    unitPrice: number;
    source: 'OFFICIAL_PUPR_2026' | 'PROJECT_CATALOG' | 'COMPANY_CATALOG';
  } | null;
  resources: {
    code: string;
    name: string;
    type: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
    coefficient: number;
    unit: string;
    unitPrice: number;
    totalCost: number;
    priceSource: 'PROJECT' | 'USER' | 'REGIONAL' | 'OFFICIAL' | 'EXTERNAL';
  }[];
  price: {
    unitPrice: number | null;
    totalAmount: number | null;
    sourceType: 'PROJECT' | 'USER' | 'REGIONAL' | 'OFFICIAL' | 'EXTERNAL' | 'PRICE_NOT_FOUND';
    externalEvidence?: {
      sourceName: string;
      sourceUrl?: string;
      checkedAt: string;
      location?: string;
      notes?: string;
    };
  };
  status: 'READY' | 'NEEDS_REVIEW' | 'NO_AHSP' | 'NO_PRICE' | 'NO_RESOURCE' | 'AMBIGUOUS' | 'INCOMPLETE_EVIDENCE';
}
```

---

## 4. Prinsip Kunci & Aturan Ketat

### A. Material Bukan Pekerjaan (Section 7)
Material/resource adalah **komponen** dari suatu analisa pekerjaan (AHSP), bukan baris pekerjaan utama di RAB.
- **Benar:** 1 baris item "Pekerjaan Pasangan Pondasi Batu Kali 1:4" (Volume 10.40 m³). Komponen di dalam AHSP: Batu Kali, Semen, Pasir, Pekerja, Tukang, dsb.
- **Salah:** Memecah menjadi baris RAB terpisah "Batu kali", "Semen", "Pasir".

### B. Kalkulasi Volume & Dimensi (Section 9)
1. AI mengambil dimensi dari gambar atau tabel DED.
2. Jika dimensi tersedia (misal P = 32.50 m, L = 0.40 m, T = 0.80 m), volume dihitung matematis via SafeDecimalEngine: `32.50 × 0.40 × 0.80 = 10.40 m³`.
3. **Dilarang keras:** Mengarang dimensi, mengasumsikan volume default = 1, atau menebak angka tanpa bukti gambar.
4. Jika data dimensi tidak lengkap di DED: `quantity = null`, `status = NEEDS_REVIEW`.

### C. Matching AHSP & Larangan AHSP Palsu (Section 10 & 11)
1. Prioritas Matching:
   `EXACT SPECIFICATION > EXACT WORK TYPE > MATERIAL > QUALITY > METHOD > UNIT > CONTEXT`
2. **AI Dilarang Keras:** Membuat kode AHSP baru, membuat koefisien baru, mengarang kode `AI-CUSTOM-XXXX`.
3. Jika AHSP tidak ditemukan di database EZRAB: `status = NO_AHSP` / `NEEDS_REVIEW` dengan pesan jelas: *"AHSP resmi EZRAB belum ditemukan"*.

### D. Resolusi Harga & External Price Search (Section 13 & 14)
Urutan Sumber Harga:
1. **Project Price EZRAB** (Harga khusus proyek aktif)
2. **User Price EZRAB** (Harga kustom user)
3. **Regional Price EZRAB** (Harga survei regional 2026)
4. **Official EZRAB Price Database** (Database harga dasar nasional)
5. **External Price Search** (Pencarian referensi harga pasar eksternal riil)

Jika harga diambil dari pencarian eksternal:
- Wajib menyertakan metadata: `sourceType: "EXTERNAL"`, `sourceName`, `sourceUrl`, `checkedAt`, `price`, `unit`, `location`, `notes`.
- Tidak boleh menyamarkan harga eksternal sebagai harga resmi EZRAB.
- Tidak boleh menggunakan angka 0 sebagai fallback. Jika tidak ditemukan: `price = null`, `status = NO_PRICE` / `NEEDS_REVIEW`.

### E. Perhitungan Final Deterministik (Section 15)
Semua perkalian dan penjumlahan final:
$$\text{Jumlah Harga} = \text{Quantity} \times \text{Harga Satuan AHSP}$$
$$\text{Harga Satuan AHSP} = \sum (\text{Koefisien}_i \times \text{Harga Resource}_i)$$
Wajib dihitung menggunakan **SafeDecimalEngine** untuk mencegah floating-point rounding errors.

---

## 5. Tool Registry Integration (Section 23)
Agen `EZRAB DED → RAB AI` terhubung dengan Tool Registry EZRAB:
- `read_ded_page(documentId, pageNumber)`: Membaca teks, layer visual, dan anotasi halaman.
- `read_ded_image(documentId, pageNumber, region)`: Membaca potongan visual detail beresolusi tinggi.
- `search_ahsp(query, category, limit)`: Mencari kandidat AHSP resmi PUPR 2026.
- `get_ahsp_detail(code)`: Mengambil struktur analisa lengkap dan koefisien resource.
- `search_material(query, region)`: Mencari material di master database EZRAB.
- `get_material_detail(code)`: Mengambil spesifikasi dan harga master material.
- `calculate_quantity(shape, length, width, height, count)`: Menghitung volume deterministik.
- `get_price(code, name, projectId)`: Mengambil harga resmi melalui ladder 4-tingkat.
- `search_external_price(materialName, specification, unit, region)`: Melakukan pencarian harga eksternal.
- `create_rab_draft(projectId, items)`: Menyusun draft RAB berstruktur.
- `validate_rab(draftId)`: Menguji draft melalui 12 Gerbang Validasi.
- `apply_rab(projectId, confirmedItems)`: Menyimpan hasil ke Spreadsheet RAB EZRAB.

---

## 6. Penanganan DED Skala Besar (Cross-Page Reasoning)
1. **Page Batching & Caching:** Ingestion membagi dokumen PDF multi-halaman menjadi visual canvas beresolusi optimal dengan hashing SHA-256.
2. **Evidence Aggregation:** Informasi denah (dimensi garis/grid), schedule pintu/jendela (dimensi kusen & kaca), dan detail struktur (dimensi penampang beton & besi) diagregasikan ke satu Canonical Work Item.
3. **Fail-Closed Rule:** Jika terjadi kontradiksi antar lembar (misal denah menulis K-225 tapi RKS menulis K-300), item ditandai `CONFLICT` dan `NEEDS_REVIEW` untuk konfirmasi estimator.
