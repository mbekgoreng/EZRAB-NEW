/**
 * CANONICAL RESOURCE REGISTRY — Fase 1 & 4 Master Repair (2026-11-06)
 * ====================================================================
 * Identitas sumber daya kanonis untuk komponen kalkulator volume.
 *
 * Aturan main (tidak bisa ditawar):
 * - Identitas TIDAK bergantung pada nama tampilan. Jembatan nama→identitas
 *   HANYA lewat entri registry ini: `aliases` adalah daftar nama komponen
 *   yang SUDAH diverifikasi setara secara teknis (komoditas, spesifikasi,
 *   satuan) dengan identitasnya. Pencocokan `includes()` TIDAK dipakai.
 * - Satu nama yang cocok ke >1 identitas = AMBIGUOUS — tidak ada kandidat
 *   pertama yang dipilih diam-diam.
 * - `masterPriceItemId` = tautan referensi PASAR (MASTER_PRICE_ITEMS).
 *   Itu BUKAN harga resmi AHSP dan tidak pernah dilabeli resmi.
 * - `officialResourceName/Code` = nama/kode resource pada resolver resmi
 *   2026 (priceResolver2026). Harga resmi hanya diakui bila resolver
 *   mengembalikan tier OFFICIAL_GOVERNMENT + status VERIFIED + satuan
 *   kompatibel (diputuskan di componentPriceResolution.ts).
 * - Komoditas yang speknya berbeda TIDAK digabung: pasir beton ≠ pasir
 *   pasang ≠ pasir urug; beton kedap air ≠ ready mix biasa; diameter dan
 *   mutu baja yang berbeda tetap identitas sendiri.
 * - Entri tanpa sumber (tanpa masterPriceItemId & tanpa official) tetap
 *   berguna: komponen mendapat identitas & status remediasi eksplisit
 *   (NO_VERIFIED_SOURCE), bukan hilang dari audit.
 */

export type ResourceCategory = 'MATERIAL' | 'LABOR' | 'EQUIPMENT';

export interface CanonicalResource {
  /** Kode identitas stabil, mis. 'CEMENT_BAGGED_50KG'. */
  code: string;
  canonicalName: string;
  category: ResourceCategory;
  /** Satuan kanonis identitas. */
  unit: string;
  /** Nama komponen (persis, setelah normalisasi) yang terverifikasi setara. */
  aliases: string[];
  /** Tautan referensi pasar terverifikasi (MASTER_PRICE_ITEMS.id). */
  masterPriceItemId?: string;
  /** Nama resource resmi untuk priceResolver2026 (percobaan terverifikasi). */
  officialResourceName?: string;
  /** Kode resource resmi untuk priceResolver2026 bila diketahui pasti. */
  officialResourceCode?: string;
  /** Dasar kesetaraan / batas spesifikasi identitas ini. */
  specNote: string;
}

export const CANONICAL_RESOURCES: CanonicalResource[] = [
  // ---------------------------------------------------------------- LABOR
  { code: 'LABOR_PEKERJA', canonicalName: 'Pekerja (tenaga kerja umum)', category: 'LABOR', unit: 'OH',
    aliases: ['Pekerja', 'Pekerja Konstruksi'], masterPriceItemId: 'LAB-001',
    specNote: 'Peran umum "Pekerja" = record pasar Pekerja Konstruksi (Laborer), satuan OH sama.' },
  { code: 'LABOR_MANDOR', canonicalName: 'Mandor', category: 'LABOR', unit: 'OH',
    aliases: ['Mandor', 'Mandor Lapangan'], masterPriceItemId: 'LAB-009',
    specNote: '"Mandor" generik = Mandor Lapangan (Foreman). Mandor spesialisasi (aspal/jalan/bangunan air) TIDAK termasuk — recordnya berbeda.' },
  { code: 'LABOR_KEPALA_TUKANG', canonicalName: 'Kepala Tukang', category: 'LABOR', unit: 'OH',
    aliases: ['Kepala Tukang'], masterPriceItemId: 'LAB-008',
    specNote: '"Kepala Tukang" generik = Lead Artisan. "Kepala Tukang Fabrikasi" adalah spesialisasi lain, tidak termasuk.' },
  { code: 'LABOR_TUKANG_BATU', canonicalName: 'Tukang Batu', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Batu'], masterPriceItemId: 'LAB-002', specNote: 'Tukang batu (mason) generik.' },
  { code: 'LABOR_TUKANG_KAYU', canonicalName: 'Tukang Kayu', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Kayu'], masterPriceItemId: 'LAB-003', specNote: 'Tukang kayu (carpenter) generik. "Tukang Kayu / Aluminium" (gabungan dua keahlian) tidak termasuk.' },
  { code: 'LABOR_TUKANG_BESI', canonicalName: 'Tukang Besi', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Besi'], masterPriceItemId: 'LAB-004', specNote: 'Tukang besi (rebar worker) generik. "Tukang Besi & Kayu" (gabungan) tidak termasuk.' },
  { code: 'LABOR_TUKANG_CAT', canonicalName: 'Tukang Cat', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Cat'], masterPriceItemId: 'LAB-005', specNote: 'Tukang cat generik.' },
  { code: 'LABOR_TUKANG_LISTRIK', canonicalName: 'Tukang Listrik', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Listrik'], masterPriceItemId: 'LAB-006',
    specNote: 'Tukang listrik generik. "Tukang Listrik Bersertifikat" TIDAK termasuk (syarat sertifikasi berbeda).' },
  { code: 'LABOR_TUKANG_PIPA', canonicalName: 'Tukang Pipa / Plumbing', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Pipa', 'Tukang Plumbing', 'Tukang Plumbing / Pipa'], masterPriceItemId: 'LAB-007',
    specNote: 'Satu keahlian yang sama (pipa/plumbing) dengan ejaan berbeda antar kalkulator.' },
  { code: 'LABOR_TUKANG_KERAMIK_GRANIT', canonicalName: 'Tukang Keramik & Granit', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Keramik', 'Tukang Keramik Dinding', 'Tukang Pasang Granit'], masterPriceItemId: 'LAB-011',
    specNote: 'Record pasar LAB-011 secara eksplisit mencakup pemasangan keramik & granit (tile setter), satuan OH sama.' },
  { code: 'LABOR_OPERATOR_ALAT_BERAT', canonicalName: 'Operator Alat Berat', category: 'LABOR', unit: 'OH',
    aliases: ['Operator Alat Berat'], masterPriceItemId: 'LAB-010', specNote: 'Operator alat berat generik.' },
  { code: 'LABOR_TUKANG_PASANG_PRECAST', canonicalName: 'Tukang Pasang Precast', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Pasang Saluran Precast'], masterPriceItemId: 'LAB-025',
    specNote: 'Record LAB-025 spesifik pemasangan precast U-Ditch & Box Culvert — konteks komponennya memang saluran precast.' },

  // ------------------------- Putaran 2 (2026-11-06): upah HSPK daerah —
  // Harga TIDAK disimpan di sini; tautan HSPK Surabaya/Bandung ada di
  // regionalPrices.ts. Upah spesialisasi (fabrikasi/las, ereksi, rigger,
  // baja ringan, plester, listrik bersertifikat, sanitair, paving,
  // trowel, aspal) SENGAJA tidak diberi identitas berharga: riset tidak
  // menemukan sumber yang menamai spesialisasi itu pada tarif OH, dan
  // tarif Tukang generik TIDAK boleh ditempelkan ke peran spesialis.
  { code: 'LABOR_TUKANG_GENERIC', canonicalName: 'Tukang (generik)', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang'],
    specNote: 'Peran "Tukang" tanpa perdagangan spesifik (dipakai FOOT_PLATE/SLOOF/KOLOM/BATA_RINGAN). HSPK Surabaya memuat Tukang Besi/Kayu/Batu terpisah SEMUANYA Rp150.000/OH; HSPK Bandung memakai satu kode L.02 untuk ketiganya Rp157.500/OH — keduanya tarif generik yang sah untuk identitas ini (regionalPrices.ts).' },
  { code: 'LABOR_TUKANG_BESI_KAYU', canonicalName: 'Tukang Besi & Kayu (gabungan)', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Besi & Kayu'],
    specNote: 'Baris gabungan dua perdagangan. Ekuivalensi SAH karena kedua sumber menarifkan kedua perdagangan SAMA (Surabaya: Besi 150.000 = Kayu 150.000; Bandung: satu kode L.02) — bukan harga satu bagian untuk bundel. Berbeda dari LABOR_TUKANG_KAYU_ALUMINIUM yang tarifnya tidak sama.' },
  { code: 'LABOR_TUKANG_KAYU_ALUMINIUM', canonicalName: 'Tukang Kayu / Aluminium (gabungan)', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Kayu / Aluminium'],
    specNote: 'Baris gabungan dua perdagangan dengan tarif BERBEDA di sumber yang sama (Surabaya: Kayu 150.000, Aluminium 175.000). Tautan di regionalPrices.ts memakai tarif Aluminium dengan catatan eksplisit — keputusan remediasi putaran 2, dapat diaudit dari catatan tautannya.' },

  // ------------------------------------------------------------- MATERIAL
  { code: 'CEMENT_BAGGED_50KG', canonicalName: 'Semen Portland/PCC kemasan 50 kg', category: 'MATERIAL', unit: 'sak',
    aliases: ['Semen Portland (50 kg)', 'Semen Portland (PC)', 'Semen Portland (50kg)', 'Semen Portland PC (Sak 50 kg)'],
    masterPriceItemId: 'SM-001', officialResourceName: 'Semen Portland (PC)',
    specNote: 'Semua varian nama menunjuk komoditas yang sama: semen kemasan 50 kg untuk pasangan/plester/beton site-mix. Referensi pasarnya SM-001 (PCC 50 kg, satuan zak=sak). Jalur resmi dicoba per nama resource AHSP; satuan resmi per kg akan ditolak gerbang satuan dan jatuh ke referensi pasar ini.' },
  { code: 'READYMIX_K225', canonicalName: 'Beton Ready Mix K-225', category: 'MATERIAL', unit: 'm³',
    aliases: ['Beton Ready Mix Mutu K-225', 'Beton Mutu K-225', 'Beton K-225 Plat Tebing', 'Beton K-225 Selimut Pipa Conduit'],
    masterPriceItemId: 'SM-007', officialResourceName: 'Adukan beton K-225 ready mix',
    specNote: 'Varian nama adalah konteks pemakaian beton K-225 yang sama. Lean concrete B-0/f\'c 10 TIDAK termasuk (mutu berbeda jauh).' },
  { code: 'READYMIX_K250', canonicalName: 'Beton Ready Mix K-250', category: 'MATERIAL', unit: 'm³',
    aliases: ['Beton Ready Mix Mutu K-250', 'Beton Mutu K-250 (f\'c 19.3 MPa)', 'Beton Struktur K-250',
      'Beton Struktur K-250 Manhole', 'Beton Struktur K-250 Outlet', 'Beton Struktur K-250 Pelimpah Embung',
      'Beton Struktur K-250 Rumah Pompa', 'Beton K-250 Valve Chamber', 'Beton Rabat Apron K-250',
      'Beton Cor Saluran K-250', 'Beton Bertulang K-250 Menara Sadap'],
    masterPriceItemId: 'SM-008', officialResourceName: 'Adukan beton K-250 ready mix',
    specNote: 'Sufiks nama adalah lokasi/elemen pemakaian, komoditasnya satu: ready mix K-250 per m³.' },
  { code: 'READYMIX_K300', canonicalName: 'Beton Ready Mix K-300', category: 'MATERIAL', unit: 'm³',
    aliases: ['Beton Ready Mix Mutu K-300', 'Beton Mutu K-300', 'Beton Plat Injak K-300 / fc 25 MPa', 'Beton K-300 Struktur Galeri Grouting'],
    masterPriceItemId: 'SM-009', officialResourceName: 'Adukan beton K-300 ready mix',
    specNote: 'Hanya K-300 polos. Beton KEDAP AIR K-300 dan nama dwimut "K-300 / K-350" TIDAK termasuk (spek berbeda/ambigu).' },
  { code: 'READYMIX_K350', canonicalName: 'Beton Ready Mix K-350', category: 'MATERIAL', unit: 'm³',
    aliases: ['Beton Struktur K-350 / fc 30 MPa', 'Beton Struktur K-350 / fc 30 MPa Pilar', 'Beton Struktur Jembatan fc 30 MPa',
      'Beton Struktur K-350 Pile Cap', 'Beton Struktur K-350 Menara Intake', 'Beton Struktur K-350 Pelimpah Tahan Kavitasi',
      'Beton Barrier Jembatan K-350', 'Beton Lining Terowongan K-350'],
    officialResourceName: 'Adukan beton K-350 ready mix',
    specNote: 'Katalog pasar tidak punya record K-350; jalur RESMI CK punya "Adukan beton K-350 ready mix" (kelas (a) peta Fase 1/2/5). Tidak pernah diganti K-300.' },
  { code: 'CONCRETE_WATERPROOF_K300', canonicalName: 'Beton Kedap Air K-300', category: 'MATERIAL', unit: 'm³',
    aliases: ['Beton Kedap Air K-300 / Water Tight', 'Beton Kedap Air K-300 Bak Pengendap'],
    specNote: 'Memakai admixture waterproofing — komoditas berbeda dari ready mix K-300 polos; tidak boleh dihargai dengan SM-009. PUTARAN 3: varian waterproof kini tertaut dari halaman ready mix WATERPROOFING supplier (K300 Rp1.000.000/m³, INDEX_ONLY) — lihat regionalPrices.ts.' },
  { code: 'WIREMESH_M8_SHEET', canonicalName: 'Wiremesh M8 lembar 2.1×5.4 m', category: 'MATERIAL', unit: 'lembar',
    aliases: ['Wiremesh Ulir M8 Standar SNI (Lembar 2.1 x 5.4 m)'],
    masterPriceItemId: 'BJ-010',
    specNote: 'Spek persis sama dengan BJ-010 (M8 ulir, lembar 2.1×5.4 m). M6 adalah identitas berbeda.' },
  { code: 'REBAR_PLAIN_8MM_KG', canonicalName: 'Besi Beton Polos Ø8 (per kg)', category: 'MATERIAL', unit: 'kg',
    aliases: ['Besi Begel Sengkang Ø8'],
    masterPriceItemId: 'BJ-002',
    specNote: 'Begel/sengkang Ø8 adalah bentuk dari batang polos Ø8 yang sama; komoditas per kg-nya identik dengan BJ-002. Diameter lain tidak termasuk.' },
  { code: 'STEEL_WF_PROFILE_KG', canonicalName: 'Baja Profil WF SS400 (per kg)', category: 'MATERIAL', unit: 'kg',
    aliases: ['Baja Profil WF 200x100x5.5x8 mm (21.3 kg/m)'],
    masterPriceItemId: 'BJ-007',
    specNote: 'Profil WF SS400 dihargai per kg; ukuran penampang tidak mengubah harga per kg pada record BJ-007. Pelat baja (plate) adalah produk berbeda, tidak termasuk.' },
  { code: 'GYPSUM_BOARD_9MM', canonicalName: 'Gypsum Board 9 mm', category: 'MATERIAL', unit: 'lembar',
    aliases: ['Gypsum Board Tebal 9 mm (120x240 cm)', 'Gypsum Board 9 mm'],
    masterPriceItemId: 'PF-001', officialResourceName: 'Gypsum board (120 cm x 240 cm x 9 mm)',
    specNote: 'Ketebalan sama (9 mm), satuan lembar sama. Gypsum 12 mm berbeda.' },
  { code: 'THINBED_MORTAR_40KG', canonicalName: 'Mortar Thinbed Bata Ringan 40 kg', category: 'MATERIAL', unit: 'sak',
    aliases: ['Mortar (40 kg/sak)'],
    masterPriceItemId: 'SM-003',
    specNote: 'Komponen berasal dari kalkulator BATA_RINGAN; record SM-003 adalah mortar pasangan bata ringan (thinbed) 40 kg — komoditas & konteks sama.' },
  { code: 'TOILET_MONOBLOCK', canonicalName: 'Kloset Duduk Monoblok', category: 'MATERIAL', unit: 'unit',
    aliases: ['Kloset Duduk Monoblok Dual Flush (TOTO / American Standard)'],
    masterPriceItemId: 'SN-001',
    specNote: 'Kelas produk & merek sama dengan SN-001 (monoblok one-piece TOTO/American Standard).' },
  { code: 'PVC_PIPE_AW_05', canonicalName: 'Pipa PVC AW 1/2" panjang 4 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Pipa PVC Tipe AW 1/2" (Panjang 4 m)'],
    masterPriceItemId: 'SN-004', officialResourceName: 'Pipa PVC AW Ø 1/2"',
    specNote: 'Diameter & kelas persis (AW 1/2", 4 m). Pipa 3/4" dan pipa D (buangan) adalah identitas berbeda.' },
  { code: 'SAND_CONCRETE', canonicalName: 'Pasir Beton', category: 'MATERIAL', unit: 'm³',
    aliases: ['Pasir beton'], officialResourceName: 'Pasir Beton',
    specNote: 'Pasir untuk campuran beton — TIDAK sama dengan pasir pasang/pasir urug. Harga hanya dari resource resmi bernama sama bila resolver memverifikasinya.' },
  { code: 'SAND_MASONRY', canonicalName: 'Pasir Pasang', category: 'MATERIAL', unit: 'm³',
    aliases: ['Pasir Pasang'], officialResourceName: 'Pasir pasang',
    specNote: 'Pasir pasangan/plester. Varian "Pasir Pasang Ayak" (sudah diayak) identitas terpisah tanpa sumber terverifikasi.' },
  { code: 'SAND_FILL', canonicalName: 'Pasir Urug', category: 'MATERIAL', unit: 'm³',
    aliases: ['Pasir uruk', 'Pasir Urug Landasan', 'Pasir Urug Landasan Bawah', 'Pasir Urug Selimut Pipa', 'Pasir Urug Alas', 'Pasir Uruk Alas'],
    officialResourceName: 'Pasir urug (quarry - lokasi pekerjaan)',
    specNote: 'Sufiks nama adalah konteks urugan (landasan/selimut/alas); komoditasnya pasir urug yang sama. Sumber resmi hanya punya varian lokasi — registry menunjuk SATU baseline eksplisit: varian terkirim ke lokasi pekerjaan (keputusan tercatat Fase 1/2/5), bukan dipilih diam-diam oleh resolver.' },

  // ------------------------------------------------------------ EQUIPMENT
  { code: 'EQUIP_STAMPER_PLATE_COMPACTOR', canonicalName: 'Stamper Kodok / Plate Compactor', category: 'EQUIPMENT', unit: 'sewa-hari',
    aliases: ['Stamper Kodok / Plate Compactor (Pemadat Paving)'],
    masterPriceItemId: 'EQ-005', officialResourceName: 'Stamper Kodok 150 kg',
    specNote: 'Mesin yang sama dengan EQ-005, satuan sewa-hari sama. Konteks "pemadat paving" vs "pemadat tanah" tidak mengubah mesinnya.' },
  { code: 'EQUIP_PNEUMATIC_TIRE_ROLLER', canonicalName: 'Pneumatic Tire Roller', category: 'EQUIPMENT', unit: 'sewa-hari',
    aliases: ['Pneumatic Tire Roller (PTR 10 Ton)'],
    masterPriceItemId: 'EQ-017',
    specNote: 'Record EQ-017 bersatuan JAM tetap DITOLAK gerbang satuan untuk komponen sewa-hari. PUTARAN 3 (2026-11-06): tarif harian PTR kini tertaut dari dua daftar rental 2026 yang sepakat (Rp1.800.000/hari, INDEX_ONLY) — lihat regionalPrices.ts. Batas: kapasitas 10 ton tidak tertulis di daftar harian; kelas PTR komponen ini 8–15 ton.' },

  { code: 'LABOR_TUKANG_PLAFON', canonicalName: 'Tukang Plafon & Partisi', category: 'LABOR', unit: 'OH',
    aliases: ['Tukang Plafon'], masterPriceItemId: 'LAB-012',
    specNote: 'Record LAB-012 adalah Tukang Plafon & Partisi (Gypsum/GRC) — keahlian yang sama dengan komponen "Tukang Plafon" di kalkulator plafon residensial.' },
  { code: 'BRICK_RED_STANDARD', canonicalName: 'Bata Merah Bakar Standar 5x11x22', category: 'MATERIAL', unit: 'buah',
    aliases: ['Bata Merah Bakar Standar (5x11x22 cm)'], masterPriceItemId: 'BB-001',
    specNote: 'Komponen menyebut ukuran baku bata merah (5x11x22 cm) yang sama dengan record BB-001 "Bata Merah Bakar Standar" (buah).' },
  { code: 'BATAKO_PRESS', canonicalName: 'Batako Press Semen 10x20x40', category: 'MATERIAL', unit: 'buah',
    aliases: ['Batako Press Semen (10x20x40 cm)'], masterPriceItemId: 'BB-004',
    specNote: 'Ukuran 10x20x40 cm adalah ukuran baku batako press pada record BB-004 (buah).' },

  // ------------------------------------- Kelas (a) resmi CK (Fase 1/2/5)
  { code: 'AGGREGATE_SPLIT_23', canonicalName: 'Batu Split 2/3', category: 'MATERIAL', unit: 'm³',
    aliases: ['Batu split 2/3'], officialResourceName: 'Batu split 2/3',
    specNote: 'Gradasi dinyatakan eksplisit (2/3) dan record resmi bernama sama ada. "Batu split" generik TANPA gradasi tidak dimapping (dua gradasi resmi berbeda harga).' },
  { code: 'LEAN_CONCRETE_B0', canonicalName: 'Beton Kurus / Lean Concrete B0 (f\'c 10 MPa)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Beton Kurus Lean Concrete Mutu B-0 / f\'c 10 MPa (Lantai Kerja 5 cm)'],
    officialResourceName: "Beton Ready Mixed f'c 10 MPa",
    specNote: 'Lantai kerja B0 setara f\'c 10 MPa di sumber resmi CK. DILARANG memakai K-225 (SM-007): mutu jauh berbeda (temuan kelas (b) peta Fase 1/2/5).' },

  { code: 'TIMBER_BEAM_612_K2', canonicalName: 'Kayu Balok 6/12 Kelas II', category: 'MATERIAL', unit: 'm³',
    aliases: ['Kayu balok 6/12 kelas II'], officialResourceName: 'Kayu balok 6/12 kelas II',
    specNote: 'Dimensi + kelas + satuan persis dengan record resmi.' },
  { code: 'TIMBER_BOARD_K3', canonicalName: 'Kayu Papan Kelas III', category: 'MATERIAL', unit: 'm³',
    aliases: ['Kayu papan kelas III'], officialResourceName: 'Kayu papan kelas III',
    specNote: 'Kelas + satuan persis. Kayu Meranti/Borneo (5/7, 3/20) TIDAK termasuk — jenis kayu tidak dinyatakan record resmi.' },
  { code: 'DOLKEN_810_4M', canonicalName: 'Dolken Kayu Ø8-10 cm Panjang 4 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Dolken kayu ϕ 8-10 (4m)'], officialResourceName: 'Dolken kayu φ 8-10 panjang 400 cm',
    specNote: 'Audit sempat menggolongkan "tidak ada record" karena hanya memeriksa katalog pasar; record resmi CK ada dengan satuan batang yang sama (varian resmi bersatuan m\' tidak dipakai).' },
  { code: 'FORMWORK_OIL', canonicalName: 'Minyak Bekisting', category: 'MATERIAL', unit: 'liter',
    aliases: ['Minyak Bekisting'], officialResourceName: 'Minyak bekisting',
    specNote: 'Nama + satuan persis di sumber resmi.' },
  { code: 'NAIL_4IN', canonicalName: 'Paku 4 Inch', category: 'MATERIAL', unit: 'kg',
    aliases: ['Paku 4 inch'], officialResourceName: 'Paku 4 inch', specNote: 'Ukuran + satuan persis.' },
  { code: 'NAIL_5_10CM', canonicalName: 'Paku 5-10 cm', category: 'MATERIAL', unit: 'kg',
    aliases: ['Paku 5 cm - 10 cm'], officialResourceName: 'Paku 5 dan 10 cm',
    specNote: 'Rentang ukuran sama dengan record resmi. "Paku 12 cm" TIDAK termasuk (record resminya bersatuan buah — gerbang menolak).' },
  { code: 'PLYWOOD_12MM', canonicalName: 'Plywood 12 mm', category: 'MATERIAL', unit: 'lembar',
    aliases: ['Plywood 12 mm'], officialResourceName: 'Plywood 12 mm',
    specNote: 'Ketebalan + satuan persis. Plywood dari KY-003 adalah 18 mm (pasar) — bukan padanan.' },
  { code: 'WIRE_BENDRAT', canonicalName: 'Kawat Bendrat (termasuk Ø1,2 mm)', category: 'MATERIAL', unit: 'kg',
    aliases: ['Kawat Bendrat', 'Kawat beton Ø, 1.2 mm', 'Kawat Beton, 1.2 mm', 'Kawat beton: 1.2 mm'],
    officialResourceName: 'Kawat bendrat',
    specNote: 'KEPUTUSAN ALIAS TERCATAT: kawat pengikat Ø1,2 mm adalah bendrat baku AHSP — ketiga ejaan "Kawat beton … 1.2 mm" menunjuk komoditas yang sama dengan record resmi "Kawat bendrat" (kg). Bukan hasil pencocokan includes.' },
  { code: 'AAC_BLOCK_75', canonicalName: 'Bata Ringan Tebal 7,5 cm (per buah)', category: 'MATERIAL', unit: 'buah',
    aliases: ['Bata ringan tebal 7.5 cm'], officialResourceName: 'Bata ringan tebal 7,5 cm',
    specNote: 'Record resmi persis (7,5 cm, buah). Kandidat pasar BB-003 DITOLAK: tebal 10 cm dan satuan m³ (kelas (b)).' },

  // ------------------------- Remediasi sumber terpercaya (2026-11-06) —
  // Identitas untuk komponen yang sebelumnya tak terdaftar. Harga TIDAK
  // disimpan di sini: harga ber-provenance ada di regionalPrices.ts
  // (tautan OFFICIAL_HSPK_REGIONAL / pasar per identitas). Identitas
  // tanpa tautan harga tetap UNRESOLVED dengan identitas eksplisit.
  { code: 'NAIL_8_12CM', canonicalName: 'Paku 8 s/d 12 cm', category: 'MATERIAL', unit: 'kg',
    aliases: ['Paku 12 cm'],
    specNote: 'KEPUTUSAN ALIAS TERCATAT (riset 2026-11-06): HSPK Gunungkidul menilai SATU baris "Paku 8 s/d 12 cm" per kg. "Paku 12 cm" adalah ujung atas rentang itu; "Paku 4 inch" ≈ 10,16 cm juga di dalam rentang — keduanya menunjuk komoditas paku yang sama dengan baris sumber. NAIL_4IN (jalur resmi CK Rp19.000) tetap berlaku untuk nama persis "Paku 4 inch"; identitas ini menanggung "Paku 12 cm" dan menjadi jalur regional DIY untuk keduanya. TIDAK ada harga 4 inch yang dibuat terpisah dari rentang sumber.' },
  { code: 'AGGREGATE_CRUSHED_UNSPEC', canonicalName: 'Batu Split (gradasi tidak dinyatakan)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Batu split'],
    specNote: 'Komponen FOOT_PLATE tidak menyatakan gradasi; identitas tetap terpisah dari AGGREGATE_SPLIT_23. DIPERBARUI putaran 2 (kebijakan cakupan praktis owner): HSPK Surabaya memuat "Batu Pecah Mesin 2/3" sebagai baris batu pecah mesin bakunya — tautan itu kini DIPAKAI untuk komponen tanpa gradasi ini dengan catatan ekuivalensi eksplisit di regionalPrices.ts (keputusan putaran 1 yang menahannya telah digantikan perintah owner 2026-11-06).' },
  { code: 'ABU_BATU_JOINT_FILLER', canonicalName: 'Abu Batu (pengisi celah / joint filler)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Abu Batu Pengisi Celah (Joint Filler)'],
    specNote: 'Komoditasnya adalah material Abu Batu per m³ (pemakaian dinyatakan di nama: pengisi celah paving). Harga HSPK daerah untuk material Abu Batu ada (Tegal & Sikka, regionalPrices.ts); tidak ada sumber yang mengikat harga ke aplikasi joint-filler secara khusus — yang dihargai adalah materialnya, sesuai satuan komponen.' },
  { code: 'UDITCH_40X40', canonicalName: 'U-Ditch Precast 40×40×120 cm', category: 'MATERIAL', unit: 'unit',
    aliases: ['U-Ditch Precast 40x40 cm (Panjang 1.20 m)'],
    specNote: 'Dimensi persis 40×40 dengan panjang unit 1,20 m. HSPK Pamekasan menilai U-Ditch 40×40×120 per buah (regionalPrices.ts). U-Ditch 60×60 adalah identitas/produk berbeda (tanpa sumber di riset ini).' },
  { code: 'COVER_UDITCH_40_LD', canonicalName: 'Cover U-Ditch 40 Light Duty (panjang 0,60 m)', category: 'MATERIAL', unit: 'unit',
    aliases: ['Cover U-Ditch 40 cm Light Duty (Panjang 0.60 m)'],
    specNote: 'Spek persis: tutup LD ukuran 40 (53×60×8 cm di HSPK Pamekasan). Sumber resmi daerah + pasar Jatim ada di regionalPrices.ts.' },
  { code: 'MANHOLE_COVER_PRECAST', canonicalName: 'Cover Manhole Pracetak (beton)', category: 'MATERIAL', unit: 'buah',
    aliases: ['Cover Manhole Ductile / Precast'],
    specNote: 'PERINGATAN SPEK: nama komponen menggabungkan DUA material berbeda — "Ductile / Precast". Tautan harga di regionalPrices.ts (HSPK Pamekasan, Tutup Manhole Box Culvert Precast 100×100×30) HANYA menanggung varian beton pracetak. Varian ductile iron TIDAK punya sumber (riset: tidak ditemukan; kelas beban seperti D400 juga tak dinyatakan komponen) — penjelasan hasil resolusi menyebut batas ini secara eksplisit.' },
  { code: 'PAINT_ZINCROMATE_PRIMER', canonicalName: 'Cat Primer Antikarat Zincromate', category: 'MATERIAL', unit: 'kg',
    aliases: ['Cat Primer Antikarat Zinkromate / Epoxy Primer Baja'],
    specNote: 'Nama komponen adalah baris gabungan dua produk primer berbeda. Tautan HSPK (Cat Zyncromate, regionalPrices.ts) hanya menanggung porsi ZINCROMATE; epoxy primer baja tidak punya harga terpisah yang membedakan primer dari topcoat di sumber mana pun (riset) — penjelasan hasil menyebut batas ini. Kelas remediasi komponen induk tetap dicatat sebagai parsial di laporan.' },
  { code: 'ASPHALT_ACWC_TON', canonicalName: 'Aspal Hotmix Laston AC-WC (per ton)', category: 'MATERIAL', unit: 'ton',
    aliases: ['Aspal Hotmix Laston Lapis Aus (AC-WC)'],
    specNote: 'Laston lapis aus AC-WC per ton. Tidak ada harga resmi HSPK/AHSP per ton (riset) — hanya daftar supplier; entri pasar Semarang ada di regionalPrices.ts (wilayah Jawa Tengah).' },
  { code: 'EQUIP_ASPHALT_FINISHER', canonicalName: 'Sewa Asphalt Finisher (per hari)', category: 'EQUIPMENT', unit: 'sewa-hari',
    aliases: [],
    specNote: 'Identitas mandiri untuk alat finisher. Komponen kalkulator JALAN_ASPAL saat ini berbentuk BUNDEL "[ALAT] Asphalt Finisher & Tandem Roller" (dua alat, satu baris) yang TIDAK dipetakan ke identitas ini — memaksa harga satu alat ke baris bundel adalah fabrikasi. Identitas ini menunggu komposisi dipecah (atau dipakai pemanggil berkode eksplisit); tautan pasar per hari ada di regionalPrices.ts.' },
  { code: 'EQUIP_TANDEM_ROLLER', canonicalName: 'Sewa Tandem Roller (per hari)', category: 'EQUIPMENT', unit: 'sewa-hari',
    aliases: [],
    specNote: 'Identitas mandiri tandem roller per hari; alasan tidak dipetakan dari baris bundel sama dengan EQUIP_ASPHALT_FINISHER. Tautan pasar per hari ada di regionalPrices.ts.' },
  { code: 'GIRDER_PRECAST_L25', canonicalName: 'Balok Girder Precast L=25 m', category: 'MATERIAL', unit: 'buah',
    aliases: ['Balok Girder Precast L=25m'],
    specNote: 'SENGAJA tanpa sumber harga: riset tidak menemukan harga per buah untuk bentang 25 m (studi UGM hanya total per jembatan untuk bentang 30–50 m; ekstrapolasi dilarang). Tetap USER_PRICE_REQUIRED — penawaran proyek per kasus.' },
  { code: 'REBAR_BJTS_UNSPEC', canonicalName: 'Besi Tulangan BJTS-420B (diameter tidak dinyatakan)', category: 'MATERIAL', unit: 'kg',
    aliases: ['Besi Tulangan Ulir BJTS-420B', 'Baja Tulangan Sirip BJTS-420B'],
    specNote: 'PUTARAN 3 (2026-11-06) menutup status TECHNICAL_SPECIFICATION_REQUIRED ini SEBAGIAN: distributor (Jayasteel) menilai BJTS 420B secara per-kg yang konsisten lintas diameter (±Rp10.400/kg pada tiga diameter di daftar yang sama) — dasar per-kg itu yang dipakai, BUKAN meminjam record satu diameter. Kelas resmi BjTS yang terbelah menurut diameter tetap tidak dipakai. Detail & konflik di regionalPrices.ts.' },
  { code: 'FOUNDATION_STONE_FILL', canonicalName: 'Batu Belah Landasan Pondasi (aanstamping)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Batu Belah Aanstamping (Batu Kosong)', 'Batu Belah Pasangan (1SP : 4PP)'],
    specNote: 'Lapisan landasan dari material batu belah lepas (aanstamping/batu kosong); keterangan "(1SP : 4PP)" pada alias kedua adalah pekerjaan pasangan di atas landasan, bukan materialnya. Identitas SENGAJA tanpa jalur resmi nasional: record nasional "Batu kali" menilai batu pasangan (beda konteks) dan "Pasir urug" adalah material berbeda — keduanya ditolak sebagai jalur. Satu-satunya sumber: HSPK Sikka "Batu Belah Pondasi (terima di tempat)" di regionalPrices.ts, berlaku NTT saja; di provinsi lain tetap UNRESOLVED (NO_VERIFIED_SOURCE) dengan catatan wilayah.' },
  { code: 'COVER_PLAT_80X60X10', canonicalName: 'Cover Plat Beton 80×60×10 cm', category: 'MATERIAL', unit: 'buah',
    aliases: ['Cover Plat Beton 80x60x10 cm'],
    specNote: 'SENGAJA tanpa sumber harga pasti: padanan pasar terdekat adalah cover U-Ditch LD 80×60×10 K300 berupa RENTANG harga (Rp280.000–340.000, Artha Panel) — arsitektur tidak punya konsep rentang berlabel, dan spek "plat polos" vs "cover LD K300" belum terkonfirmasi sama. Padanan resmi 95×60×10 lebarnya berbeda. Tetap unresolved sampai spek dikonfirmasi.' },

  // ------------------------- Putaran 2 (2026-11-06) — Master Price
  // Coverage Completion. Harga ber-provenance ada di regionalPrices.ts;
  // identitas di sini hanya menyatakan kesetaraan spek yang diverifikasi.
  { code: 'TIMBER_BEAM_57_MERANTI', canonicalName: 'Kayu Balok 5/7 Meranti/Borneo', category: 'MATERIAL', unit: 'm³',
    aliases: ['Kayu Balok 5/7 (Meranti/Borneo)'],
    specNote: 'HSPK Surabaya: "Kayu Meranti Usuk 4/6, 5/7" per m³ — jenis kayu (Meranti) dan ukuran 5/7 dinyatakan sumber. Borneo adalah asal dagang Meranti yang sama pada nama komponen.' },
  { code: 'TIMBER_BOARD_320_MERANTI', canonicalName: 'Kayu Papan 3/20 Meranti/Borneo', category: 'MATERIAL', unit: 'm³',
    aliases: ['Kayu Papan 3/20 (Meranti/Borneo)'],
    specNote: 'ASUMSI TERCATAT: HSPK Surabaya memuat papan Meranti 2/20 (bukan 3/20) pada tarif m³ yang sama untuk kayu papan Meranti. Ekuivalensi ketebalan dinyatakan sebagai asumsi di tautan harganya — bukan spek persis.' },
  { code: 'FORMWORK_TIMBER_M3', canonicalName: 'Kayu Bekisting per m³ (baris papan bekisting + dolken)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Papan Bekisting + Kayu Dolken Penyangga'],
    specNote: 'KEPUTUSAN EKUIVALENSI TERCATAT (putaran 2): baris ini dihitung kalkulator per m³ volume kayu bekisting; HSPK Surabaya memuat "Kayu Meranti Bekisting" per m³. Nilai tautannya adalah tarif kayu bekisting (material dominan baris ini); dolken penyangga tidak dihargai terpisah di dalamnya (dolken per batang bersatuan berbeda — tidak digabung). Label "kelas III" tidak dipakai sumber.' },
  { code: 'SAND_MASONRY_SIEVED', canonicalName: 'Pasir Pasang Ayak', category: 'MATERIAL', unit: 'm³',
    aliases: ['Pasir Pasang Ayak'],
    specNote: 'Identitas terpisah dari SAND_MASONRY karena komponen menyatakan pasir yang SUDAH diayak. Sumber HSPK (Surabaya & Bandung) menarifkan "Pasir Pasang" tanpa kata "Ayak" — asumsi dicatat di tautan. "Pasir Pasang Ayak HALUS" adalah komponen lain yang tetap tanpa sumber (tidak ditemukan harga "halus" terpisah).' },
  { code: 'REBAR_BAR_16MM', canonicalName: 'Besi Beton Ø16 per batang 12 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Besi utama, dia: 16 mm', 'Besi support, dia: 16 mm'],
    specNote: 'Peran utama/support adalah FUNGSI batang di dalam elemen, bukan produk berbeda: komoditasnya besi beton Ø16 panjang 12 m per batang (Jayasteel, regionalPrices.ts). Diameter lain = identitas lain.' },
  { code: 'REBAR_BAR_13MM', canonicalName: 'Besi Beton Ø13 per batang 12 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Besi alas, dia: 13 mm', 'Besi pembentuk, dia: 13 mm'],
    specNote: 'Komoditas besi beton Ø13 per batang 12 m. Pada daftar Jayasteel Ø13 hanya tersedia ULIR — catatan itu ada di tautan harganya.' },
  { code: 'REBAR_BAR_10MM', canonicalName: 'Besi Beton Ø10 per batang 12 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Besi sengkang, dia: 10 mm', 'Besi Kait, dia: 10 mm', 'Besi diameter: 10 mm', 'Besi support Ø, 10 mm'],
    specNote: 'Empat ejaan peran (sengkang/kait/support/generik) dari tiga kalkulator menunjuk komoditas yang sama: besi beton Ø10 per batang 12 m. Sengkang/kait adalah bentuk potongan dari batang yang sama — harga per batangnya identik.' },
  { code: 'REBAR_BAR_8MM', canonicalName: 'Besi Beton Ø8 per batang 12 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Besi diameter: 8 mm', 'Besi sengkang Ø, 8 mm'],
    specNote: 'Komoditas besi beton Ø8 per batang 12 m (peran generik & sengkang).' },
  { code: 'REBAR_BAR_6MM', canonicalName: 'Besi Beton Ø6 per batang 12 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Besi diameter: 6 mm'],
    specNote: 'Komoditas besi beton Ø6 per batang 12 m.' },
  { code: 'REBAR_BAR_12MM', canonicalName: 'Besi Beton Ø12 per batang 12 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Besi utama Ø, 12 mm'],
    specNote: 'Komoditas besi beton Ø12 per batang 12 m. Berbeda dari REBAR_MAIN_D12_KG (komponen BALOK yang bersatuan kg).' },
  { code: 'REBAR_MAIN_D12_KG', canonicalName: 'Besi Tulangan Utama Ø12 (per kg)', category: 'MATERIAL', unit: 'kg',
    aliases: ['Besi Tulangan Utama Ø12'],
    specNote: 'Komponen BALOK bersatuan kg. Dua tautan dengan KONFLIK tercatat di regionalPrices.ts: HSPK Surabaya Rp13.500/kg (resmi daerah — menang) vs Jayasteel Rp8.550/kg (pasar) — tidak dirata-rata.' },
  { code: 'LIGHTSTEEL_C75_6M', canonicalName: 'Kanal Baja Ringan C75.75 Panjang 6 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Kanal Baja Ringan C75.75 (Panjang 6 m)'],
    specNote: 'Spek persis sumber pasar: Truss C75.75 TASO 0,75 TCT panjang 6 m per batang.' },
  { code: 'LIGHTSTEEL_RENG_6M', canonicalName: 'Reng Baja Ringan U30 Panjang 6 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Reng Baja Ringan U30 (Panjang 6 m)'],
    specNote: 'ASUMSI PROFIL TERCATAT: sumber menyebut "Reng 30.45" (tinggi 30 mm) — penafsiran U30 ↔ reng tinggi 30 mm dinyatakan di tautan harganya.' },
  { code: 'SDS_ROOFING', canonicalName: 'Self Drilling Screw / Baut Roofing', category: 'MATERIAL', unit: 'buah',
    aliases: ['Self Drilling Screw / Baut Roofing'],
    specNote: 'Komponen tidak menetapkan panjang sekrup; tautan pasar memakai SDS #12×60 mm (ukuran roofing baku) dengan asumsi tercatat.' },
  { code: 'GROUT_COLOR_CEMENT', canonicalName: 'Semen Warna / Tile Grout', category: 'MATERIAL', unit: 'kg',
    aliases: ['Semen Warna / Tile Grout (Nat Keramik)'],
    specNote: 'HSPK Surabaya: "Semen Berwarna" per kg. "Semen Nat Anti Jamur" adalah komponen berbeda (klaim anti-jamur tak dinyatakan sumber) — tidak termasuk.' },
  { code: 'GLASS_PLAIN_5MM', canonicalName: 'Kaca Polos 5 mm', category: 'MATERIAL', unit: 'm²',
    aliases: ['Kaca Polos Tebal 5 mm'],
    specNote: 'Dua wilayah HSPK dengan sebaran besar (Surabaya 87.000 vs Bandung 200.500 per m²) — provinsi proyek menentukan; tidak dirata-rata.' },
  { code: 'KUSEN_4IN', canonicalName: 'Kusen 4 inch (baris gabungan Kayu Kamper / Aluminium)', category: 'MATERIAL', unit: "m'",
    aliases: ['Kusen Kayu Kamper / Aluminium 4 inch'],
    specNote: 'BATAS EKUIVALENSI: tautan HSPK Surabaya hanya menanggung varian ALUMINIUM (profil 4") sebagai harga MATERIAL PROFIL per m\' — varian kayu kamper dan harga pekerjaan kusen jadi TIDAK termasuk. Mengikuti preseden baris gabungan putaran 1 (manhole/zincromate) dengan batas yang dinyatakan eksplisit.' },
  { code: 'CABLE_NYM_COMBINED', canonicalName: 'Kabel NYM (baris gabungan 3x2,5 / 2x1,5)', category: 'MATERIAL', unit: "m'",
    aliases: ['Kabel NYM 3x2.5 mm² / 2x1.5 mm² Standar SNI'],
    specNote: 'BATAS EKUIVALENSI: satu baris komponen menggabungkan dua ukuran kabel. Tautan HSPK Surabaya hanya menanggung NYM 3x2,5 (Rp15.600/m\'); ukuran 2x1,5 tidak ada di sumber (NYM 2x2,5 yang ada adalah ukuran berbeda dan tidak dipakai). Komposisi idealnya dipecah per ukuran — di luar cakupan remediasi harga ini.' },
  { code: 'GYPSUM_LIST_PROFILE', canonicalName: 'List Profil Gypsum', category: 'MATERIAL', unit: "m'",
    aliases: ['List Profil Gypsum Lebar 7-10 cm'],
    specNote: 'HSPK Surabaya: "List Gypsum" per m\' — lebar 7–10 cm komponen tidak dinyatakan sumber (asumsi tercatat di tautan).' },
  { code: 'FLOOR_DRAIN', canonicalName: 'Floor Drain', category: 'MATERIAL', unit: 'unit',
    aliases: ['Floor Drain Stainless Steel Anti Bau 4"'],
    specNote: 'HSPK Surabaya: "Floor drain" per unit — material stainless & ukuran 4" komponen tidak dinyatakan pada baris sumber (asumsi tercatat di tautan).' },
  { code: 'PVC_PIPE_AW_34', canonicalName: 'Pipa PVC AW 3/4" panjang 4 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Pipa PVC Tipe AW 3/4" (Panjang 4 m)'],
    specNote: 'Spek persis daftar manufacturer Rucika (AW 3/4", DN20, 4 m, termasuk PPN) + pembanding generik HSPK Surabaya. Identitas terpisah dari PVC_PIPE_AW_05 (1/2").' },
  { code: 'LPA_CLASS_A', canonicalName: 'Lapis Pondasi Agregat Kelas A (Bina Marga)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Lapis Pondasi Agregat Kelas A Standar Bina Marga'],
    specNote: 'Item PEKERJAAN Bina Marga (lapis pondasi terpasang), bukan material lepas. Tautan HSPK Pesisir Selatan 2024 adalah harga pokok pekerjaan per m³ dengan basis terpasang yang sama konteksnya; keyakinan INDEX_ONLY dinyatakan di tautan.' },
  { code: 'LPB_CLASS_B', canonicalName: 'Lapis Pondasi Agregat Kelas B (Bina Marga)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Lapis Pondasi Agregat Kelas B Standar Bina Marga'],
    specNote: 'Item pekerjaan Bina Marga kelas B — pasangan kelas A di atas; basis & keyakinan sama.' },
  { code: 'PRIME_COAT', canonicalName: 'Lapis Resap Pengikat / Prime Coat', category: 'MATERIAL', unit: 'liter',
    aliases: ['Lapis Resap Pengikat (Prime Coat Emulsi Aspal)'],
    specNote: '"Prime coat" dalam pemakaian Bina Marga = lapis resap pengikat (aspal cair/emulsi); tabel HSPK Pesisir Selatan menilainya per liter — satuan sama dengan komponen.' },
  { code: 'UDITCH_60X60', canonicalName: 'U-Ditch Precast 60×60×120 cm', category: 'MATERIAL', unit: 'buah',
    aliases: ['U-Ditch Precast 60x60x120 cm'],
    specNote: 'Produk berbeda dari UDITCH_40X40. Tautan pasar Jabodetabek INDEX_ONLY tetapi terkoroborasi tiga sumber pada angka yang sama (lihat tautan di regionalPrices.ts).' },
  { code: 'PAVING_BLOCK_K300_6CM', canonicalName: 'Paving Block K-300 Tebal 6 cm Natural', category: 'MATERIAL', unit: 'm²',
    aliases: ['Paving Block K-300 Tebal 6 cm (Warna Natural/Abu)'],
    specNote: 'Sumber pasar menyatakan mutu sebagai rentang "K-250/K-300" untuk produk bata natural 6 cm yang sama — catatan mutu ada di tautan (INDEX_ONLY).' },
  { code: 'GABION_BASKET_2X1X05', canonicalName: 'Keranjang Bronjong Galvanis 2×1×0,5 m', category: 'MATERIAL', unit: 'unit',
    aliases: ['Keranjang Bronjong Galvanis 2x1x0.5 m'],
    specNote: 'Keranjang bronjong SAJA (belum termasuk batu isian — "Batu Kali Isi Bronjong 15–25 cm" adalah komponen terpisah yang tetap tanpa sumber). Diameter kawat/anyaman tidak dinyatakan halaman sumber (INDEX_ONLY).' },
  { code: 'GEOMEMBRANE_HDPE', canonicalName: 'Geomembran HDPE 1,0–1,5 mm', category: 'MATERIAL', unit: 'm²',
    aliases: ['Geomembran HDPE Tebal 1.0 - 1.5 mm'],
    specNote: 'KEPUTUSAN SUB-HARGA TERCATAT: komponen menyatakan RENTANG ketebalan 1,0–1,5 mm. Registry menyimpan DUA sub-harga per ketebalan dari daftar yang sama (1,0 mm Rp15.000/m²; 1,5 mm Rp20.000/m²) — resolver memakai sub-harga 1,0 mm untuk komponen rentang ini dan penjelasannya menyebut kedua nilai. TIDAK ada angka gabungan/rata-rata yang dikarang.' },
  { code: 'EQUIP_CONCRETE_CUTTER', canonicalName: 'Sewa Concrete Cutter Machine (per hari)', category: 'EQUIPMENT', unit: 'sewa-hari',
    aliases: ['Concrete Cutter Machine (Pemotong Sambungan)'],
    specNote: 'Tarif rental per hari / 8 jam dari daftar rental (Buana Alat, Balikpapan) — satuan persis komponen; bukan konversi per jam.' },

  // ------------------------------------- Kelas (c) pasar saja (Fase 1/2/5)
  { code: 'TILE_ADHESIVE_MORTAR', canonicalName: 'Mortar Perekat Keramik/Granit', category: 'MATERIAL', unit: 'sak',
    aliases: ['Mortar Perekat Keramik Dinding', 'Semen Perekat Ubin / Mortar Perekat Granit'],
    masterPriceItemId: 'SM-006',
    specNote: 'Fungsi perekat cocok dengan SM-006 (25 kg). Audit lama menunjuk SM-005 (acian) — fungsi salah, dikoreksi. Berat sak komponen tidak dinyatakan → referensi pasar berlabel, bukan terverifikasi.' },
  { code: 'ELEC_SWITCH_SOCKET', canonicalName: 'Stop Kontak & Saklar', category: 'MATERIAL', unit: 'buah',
    aliases: ['Stop Kontak & Saklar Panasonic / Broco'], masterPriceItemId: 'EL-002',
    specNote: 'Bundel fungsi yang sama di kedua sisi (saklar + stop kontak). Merek campuran (Panasonic/Broco vs Schneider/Panasonic) → referensi pasar saja. Satuan buah↔unit lolos aturan ekuivalensi hitung terdokumentasi.' },
  { code: 'BASIN_SET', canonicalName: 'Wastafel Gantung/Meja + Siphon', category: 'MATERIAL', unit: 'unit',
    aliases: ['Wastafel Gantung / Meja Komplit Kran Dingin & Siphon P-Trap'], masterPriceItemId: 'SN-002',
    specNote: 'Record resmi hanya wastafel polos per buah (spek + satuan beda, kelas (b)); SN-002 adalah referensi pasar terdekat untuk set ini.' },
  { code: 'SHOWER_SET', canonicalName: 'Hand Shower Set + Kran Mixer', category: 'MATERIAL', unit: 'set',
    aliases: ['Hand Shower Set + Kran Cabang Mixer'], masterPriceItemId: 'SN-003',
    specNote: 'Hanya ada di katalog pasar (SN-003 Kran Shower Set Panas/Dingin, satuan set sama).' },
  { code: 'PAINT_INTERIOR_PAIL', canonicalName: 'Cat Tembok Interior (Pail 20 kg)', category: 'MATERIAL', unit: 'pail',
    aliases: ['Cat Tembok Interior Standar Premium (Pail 20 kg)'], masterPriceItemId: 'CT-001',
    specNote: 'Record pasar CT-001 bersatuan KG sedangkan komponen per PAIL → gerbang satuan menolak (UNIT_MISMATCH) sampai ada faktor isi kemasan per-resource yang terdokumentasi. Nama komponen menyatakan 20 kg/pail — kandidat konversi per-resource masa depan, TIDAK diterapkan diam-diam.' },
  { code: 'PAINT_EXTERIOR_GALON', canonicalName: 'Cat Tembok Eksterior (Galon 2,5 L)', category: 'MATERIAL', unit: 'galon',
    aliases: ['Cat Tembok Eksterior Weatherproof (Galon 2.5 Liter)'], masterPriceItemId: 'CT-002',
    specNote: 'Record pasar per kg vs komponen per galon (volume) → UNIT_MISMATCH; konversi butuh massa jenis cat terdokumentasi.' },
  { code: 'WATERPROOFING_APPLICATION', canonicalName: 'Waterproofing Cementitious (aplikasi per m²)', category: 'MATERIAL', unit: 'm²',
    aliases: ['Waterproofing Cementitious / Epoxy Food Grade'], masterPriceItemId: 'WP-001',
    specNote: 'Komponen adalah aplikasi per m²; record WP-001 per set bahan dan tanpa varian food-grade → gerbang satuan menolak (UNIT_MISMATCH). Tautan dipertahankan agar status terbaca eksplisit.' },

  // ---------------- Putaran 3 (2026-11-06): identitas baru remediasi bersumber.
  // Semua tautan harga ada di regionalPrices.ts dengan provenance penuh;
  // SEMUA tautan putaran 3 ber-confidence INDEX_ONLY (browser.open mati
  // selama riset — nilai dibaca dari teks indeks atas sumber teridentifikasi).
  { code: 'FILL_SOIL_MATERIAL', canonicalName: 'Tanah Uruk (Material Lepas)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Tanah Uruk Biasa / Peninggian Lantai'],
    specNote: 'Bahan tanah urug lepas per m³ (SHS Gunungkidul TA 2025). Berbeda dari pekerjaan urugan — harga pekerjaan tidak dipakai untuk baris bahan ini.' },
  { code: 'FILL_BACKFILL_WORK', canonicalName: 'Urugan Tanah Kembali (Pekerjaan)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Tanah Timbunan Kembali Dipadatkan'],
    specNote: 'Harga PEKERJAAN urugan kembali (HSPK Bantul TA 2026) — komponen ini memang baris pekerjaan pada kalkulator SDA. Kata "dipadatkan" tidak tertulis di baris sumber; batas dinyatakan di tautan.' },
  { code: 'SELECTED_FILL_WORK', canonicalName: 'Timbunan Pilihan (Pekerjaan)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Timbunan Pilihan Berbutir (Selected Embankment)'],
    specNote: 'Harga pekerjaan pengurugan tanah timbunan pilihan (HSPK Sambas TA 2026). Kata "Berbutir" tidak tertulis di sumber — dinyatakan di tautan.' },
  { code: 'STONE_MASONRY_14', canonicalName: 'Pasangan Batu Kali 1:4 (Pekerjaan Terpasang)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Pasangan Batu Kali 1:4', 'Pasangan Batu Kali Campuran 1:4 (Dinding Penahan Drainase)', 'Pasangan Batu Kali Campuran 1:4 (Revetment Saluran)', 'Pasangan Batu Kali Campuran 1:4 (Kaki Tebing & Blok Beton)', 'Pasangan Batu Kali 1:4 Revetment', 'Pasangan Batu Kali 1:4 Kaki Tebing / Blok Beton'],
    specNote: 'Menutup penundaan putaran 2: dokumen yang dipakai kini HSPK resmi TA 2026 (Perbup Sleman 104/2025) — harga pekerjaan pasangan pondasi batu kali 1:4 per m³ sebelum PPN. Bukan dokumen 2017, bukan hitungan blog.' },
  { code: 'JOINT_POINTING_12', canonicalName: 'Siaran Mortar Setara 1 PC : 2 PP (Pekerjaan)', category: 'MATERIAL', unit: 'm²',
    aliases: ['Plesteran Dinding Siar 1:2'],
    specNote: 'Komponen bernama "Plesteran Dinding Siar 1:2" adalah pekerjaan SIARAN campuran 1:2 pada dinding pasangan SDA. HSPK Gunungkidul TA 2026 seksi SDA: siaran mortar jenis M2 (= tipe M, setara 1 PC : 2 PP) Rp50.957,27/m². Bukan plesteran dinding biasa.' },
  { code: 'SAND_FILL_SDA', canonicalName: 'Pasir Isi [SDA]', category: 'MATERIAL', unit: 'm³',
    aliases: ['Pasir Pasang Alas Bedding Saluran (Tebal 10 cm)'],
    specNote: 'SHS Gunungkidul TA 2025 memuat baris bahan "Pasir Isi [SDA] (pasir urug)" — dipakai untuk fungsi alas bedding saluran. Batas: sumber tidak menulis "bedding"; dinyatakan di tautan.' },
  { code: 'SAND_BEDDING_PAVING', canonicalName: 'Pasir Pasang Alas Paving (Bedding)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Pasir Ekstra Beton / Pasir Pasang Alas Paving'],
    specNote: 'Fungsi komponen = pasir alas paving → bahan pasir pasang (SSH Cianjur TA 2026). Klaim "Ekstra Beton" tidak dihargai terpisah; pasir beton adalah SAND_CONCRETE.' },
  { code: 'GRAVEL_GENERIC', canonicalName: 'Gravel (Bahan Lepas)', category: 'MATERIAL', unit: 'm³',
    aliases: ['Batu Pecah / Gravel Porous Toe Drain'],
    specNote: 'Baris bahan "Gravel" SHS Gunungkidul TA 2025. Material komponen adalah gravel; toe drain adalah aplikasinya. Berbeda dari AGGREGATE_SPLIT_23 (batu pecah mesin 2/3).' },
  { code: 'STEEL_PLATE_BJ37', canonicalName: 'Pelat Baja', category: 'MATERIAL', unit: 'kg',
    aliases: ['Pelat Baja Sambungan & Baseplate (BJ 37 / SS400)'],
    specNote: 'Baris "Pelat Baja" per kg SSH Makassar 2024 (salinan Scribd — authenticityNote di tautan). Mutu BJ37/SS400 tidak tertulis di baris sumber; dinyatakan.' },
  { code: 'WELDING_WIRE_E6013', canonicalName: 'Kawat Las E6013', category: 'MATERIAL', unit: 'kg',
    aliases: ['Kawat Las / Elektroda Las Baja E7018 / E6013', 'Kawat Las / Elektroda E7018 / E6013'],
    specNote: 'Hanya varian E6013 yang berharga (Nikko Steel RD-460 per kg, marketplace bertanggal). E7018 belum ada sumber per kg yang sah — dinyatakan di tautan.' },
  { code: 'DOOR_LEAF_TIMBER', canonicalName: 'Daun Pintu Panel Kayu', category: 'MATERIAL', unit: 'm²',
    aliases: ['Daun Pintu Solid Wood / Engineering Door'],
    specNote: 'Harga supplier per m² untuk daun pintu panel kayu kamper. Rentang antar-jenis kayu pada sumber yang sama dinyatakan di tautan, tidak dirata-rata.' },
  { code: 'METAL_ROOF_TILE', canonicalName: 'Genteng Metal Pasir', category: 'MATERIAL', unit: 'm²',
    aliases: ['Genteng Metal Pasir / Genteng Beton'],
    specNote: 'Harga turunan terdokumentasi: Rp38.000/lembar × kebutuhan 1,62 lembar/m² (keduanya dinyatakan daftar supplier yang sama). Varian genteng beton tidak tercakup.' },
  { code: 'GRANITE_TILE_60_DUS', canonicalName: 'Granit 60×60 per Dus (Model Tertentu)', category: 'MATERIAL', unit: 'dus',
    aliases: ['Homogeneous Tile / Granit 60x60 cm'],
    specNote: 'Harga per dus SATU model bernama (Infiniti Rugao Grey 60×60, 4 pcs = 1,44 m²/dus) — komponen tidak menyebut model; batas model dinyatakan di tautan sesuai izin putaran 3.' },
  { code: 'CERAMIC_WALL_30X60_DUS', canonicalName: 'Keramik Dinding 30×60 per Dus (Model Tertentu)', category: 'MATERIAL', unit: 'dus',
    aliases: ['Keramik Dinding 30x60 cm / Homogeneous Tile'],
    specNote: 'Harga per dus SATU model bernama (Roman dWeave W63470R 30×60, 5 pcs = 0,9 m²/dus). Batas model dinyatakan di tautan.' },
  { code: 'GRANITE_PLINTH', canonicalName: 'Plint Granit 10×60 cm', category: 'MATERIAL', unit: "m'",
    aliases: ['Plint Granit 10x60 cm'],
    specNote: 'Harga turunan terdokumentasi: Rp15.500/pcs untuk pcs 10×60 (0,6 m) → per m\'. Aritmetika penuh di tautan.' },
  { code: 'GROUT_ANTIFUNGAL', canonicalName: 'Semen Nat Anti Jamur', category: 'MATERIAL', unit: 'kg',
    aliases: ['Semen Nat Anti Jamur'],
    specNote: 'Produk anti jamur bernama (MU-408 PowerPLUS 1 kg). Terpisah dari GROUT_COLOR_CEMENT (nat warna generik).' },
  { code: 'HOLLOW_BUNDLE_4M', canonicalName: 'Besi Hollow Galvanis 4×4 & 2×4 Panjang 4 m (Sepasang)', category: 'MATERIAL', unit: 'batang',
    aliases: ['Besi Hollow Galvanis 4x4 & 2x4 (Panjang 4 m)'],
    specNote: 'Jumlah bundel TERDOKUMENTASI dari satu daftar supplier: 40×40 4M Rp27.000 + 20×40 4M Rp20.000 = Rp47.000. Menutup penolakan putaran 2 (dulu hanya varian 4×4 yang tersumber). Kelas hollow plafon; ketebalan tak dinyatakan kedua sisi.' },
  { code: 'WALL_PUTTY_PAIL', canonicalName: 'Plamir Tembok Siap Pakai (Pail 20 kg)', category: 'MATERIAL', unit: 'pail',
    aliases: ['Plamir Tembok Siap Pakai (Pail 20 kg)'],
    specNote: 'Kemasan persis: Nippon Matex Putty pail 20 kg (marketplace bertanggal).' },
  { code: 'PAINT_TOOL_SET', canonicalName: 'Set Alat Cat', category: 'MATERIAL', unit: 'set',
    aliases: ['Rol Cat, Kuas, Ampelas & Lakban Kertas'],
    specNote: 'Set supplier 7 pcs yang memuat keempat isi komponen + bak cat & kape (dinyatakan di tautan).' },
  { code: 'WALL_TAP_SS', canonicalName: 'Kran Dinding Stainless 1/2"', category: 'MATERIAL', unit: 'buah',
    aliases: ['Kran Dinding Stainless Steel 1/2 Inch'],
    specNote: 'Produk bernama sesuai spek: Waterplus CTL 211 BS SS-304 1/2".' },
  { code: 'RCP_800', canonicalName: 'Pipa Beton RCP Dia 800 mm', category: 'MATERIAL', unit: 'm',
    aliases: ['Pipa Beton Bertulang RCP Dia 800 mm'],
    specNote: 'Harga turunan terdokumentasi: Rp1.270.000/pcs modul Leff 1,25 m (dinyatakan daftar produsen) → per m. Ketergantungan panjang modul dinyatakan di tautan.' },
  { code: 'READYMIX_FS45', canonicalName: 'Beton Ready Mix FS-45', category: 'MATERIAL', unit: 'm³',
    aliases: ["Beton Ready Mix Kelas FS-45 / f'c 25 MPa", "Beton Ready Mix Rigid FS-45 / Mutu f'c 25 MPa (Tebal 15 cm)"],
    specNote: 'FS-45 = kuat LENTUR 45 kg/cm² (perkerasan kaku). Label "/ f\'c 25 MPa" pada nama komponen TIDAK setara FS-45 — peringatan spek ada di tautan; harga berlaku untuk FS-45.' },
  { code: 'CONCRETE_WATERPROOF_K350', canonicalName: 'Beton Kedap Air K-350', category: 'MATERIAL', unit: 'm³',
    aliases: ['Beton Kedap Air K-350 / Reservoir Kedap Air (Water Tight)', 'Beton Kedap Air K-350 / fc 30 MPa Reservoir'],
    specNote: 'Varian waterproof eksplisit dari halaman ready mix waterproofing supplier (bukan K-350 polos). Pasangan K-300: CONCRETE_WATERPROOF_K300.' },
  { code: 'EXPANSION_JOINT_AP', canonicalName: 'Expansion Joint Asphaltic Plug', category: 'MATERIAL', unit: 'm',
    aliases: ['Expansion Joint Asphaltic Plug / Baja Modular', 'Expansion Joint Tipe Asphaltic Plug / Baja Modular'],
    specNote: 'Biaya pemasangan asphaltic plug per meter dari jurnal terbit 2025. Varian baja modular TIDAK dihargai dari angka ini (beda jauh — dinyatakan di tautan).' },
  { code: 'CCSP_W500_L12', canonicalName: 'Sheet Pile Beton CCSP W500 L=12 m', category: 'MATERIAL', unit: 'batang',
    aliases: ['Corrugated Concrete Sheet Pile (CCSP) L=12m, We=50cm', 'CCSP / Sheet Pile L=12m We=50cm'],
    specNote: 'Harga turunan terdokumentasi: Rp1.250.000/m (W.500, lebar efektif 50 cm) × panjang komponen 12 m. Aritmetika di tautan.' },
  { code: 'GALV_PIPE_3IN', canonicalName: 'Pipa Baja Galvanis Dia 3"', category: 'MATERIAL', unit: 'm',
    aliases: ['Pipa Baja Galvanis Dia 3 Inch (Railing Jembatan)', 'Pipa Baja Galvanis Dia 3" Railing'],
    specNote: 'Konversi panjang batang yang DINYATAKAN sumber (6 m) — diizinkan eksplisit oleh perintah putaran 3. Basis tebal 3,75 mm dinyatakan di tautan.' },
  { code: 'HDPE_PIPE_400', canonicalName: 'Pipa HDPE Dia 400 mm', category: 'MATERIAL', unit: 'm',
    aliases: ['Pipa Baja / HDPE Dia 400 mm (Outlet Conduit)', 'Pipa Baja / HDPE Dia 400 mm Outlet'],
    specNote: 'Vinilon PE100 OD 400 PN10 per daftar 2026. Varian pipa baja pada nama komponen tidak dihargai dari daftar HDPE.' },
  { code: 'HDPE_PIPE_ND150', canonicalName: 'Pipa HDPE ND 150 mm', category: 'MATERIAL', unit: 'm',
    aliases: ['Pipa HDPE / DIP / PVC ND 150 mm', 'Pipa Air Bersih HDPE/DIP/PVC ND 150 mm'],
    specNote: 'Konvensi HDPE: ND 150 = OD 160 mm (6"). Harga OD 160 PN10, belum PPN. Varian DIP/PVC tidak dihargai dari daftar ini.' },
  { code: 'FRP_TANK_50M3', canonicalName: 'Tangki Air Panel FRP 50 m³', category: 'MATERIAL', unit: 'unit',
    aliases: ['Tangki Air Panel FRP / Fiberglass Kap. 50 m3', 'Tangki Air Bersih Kapasitas 50 m³'],
    specNote: 'Harga listing per unit kapasitas persis 50 m³. Nama komponen generik ("Tangki Air Bersih Kapasitas 50 m³"); produk yang dihargai adalah tangki PANEL FRP — konstruksi standar untuk kapasitas ini; tangki bahan lain (stainless/beton) tidak dihargai dari tautan ini. Konflik dengan kisaran per-m³ produsen dinyatakan di tautan, tidak dirata-rata.' },
  { code: 'MANHOLE_HATCH_SS', canonicalName: 'Pintu Akses Stainless Steel', category: 'MATERIAL', unit: 'unit',
    aliases: ['Pintu Akses Stainless Steel (Manhole Hatch)'],
    specNote: 'Manhole tangki sanitary SS304 435×335 mm bernama (Serinox). Ukuran sumber dinyatakan di tautan; komponen tidak menyatakan ukuran.' },
];

/** Normalisasi nama untuk pencocokan alias: ejaan saja, bukan kemiripan. */
export function normalizeComponentName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')          // buang tag seperti [ALAT]
    .replace(/[ϕø]/g, '')
    .replace(/[.,;:()"'/\\|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BY_CODE = new Map(CANONICAL_RESOURCES.map((r) => [r.code, r]));
const BY_ALIAS = new Map<string, CanonicalResource[]>();
for (const r of CANONICAL_RESOURCES) {
  const keys = new Set([normalizeComponentName(r.canonicalName), ...r.aliases.map(normalizeComponentName)]);
  for (const k of keys) {
    const list = BY_ALIAS.get(k) ?? [];
    list.push(r);
    BY_ALIAS.set(k, list);
  }
}

export type CanonicalIdentityMatch =
  | { kind: 'FOUND'; resource: CanonicalResource; via: 'CODE' | 'NAME' }
  | { kind: 'AMBIGUOUS'; candidates: CanonicalResource[] }
  | { kind: 'NONE' };

/**
 * Resolusi identitas kanonis. Deterministik & ketat:
 * kode eksplisit → pencocokan nama PERSIS (setelah normalisasi) terhadap
 * alias terdaftar dalam kategori yang sama. Tidak ada fuzzy/includes.
 */
export function resolveCanonicalIdentity(input: {
  name: string;
  unit: string;
  category: ResourceCategory;
  resourceCode?: string;
}): CanonicalIdentityMatch {
  if (input.resourceCode) {
    const byCode = BY_CODE.get(input.resourceCode);
    if (byCode && byCode.category === input.category) {
      return { kind: 'FOUND', resource: byCode, via: 'CODE' };
    }
    return { kind: 'NONE' };
  }
  const key = normalizeComponentName(input.name);
  const candidates = (BY_ALIAS.get(key) ?? []).filter((r) => r.category === input.category);
  if (candidates.length === 1) return { kind: 'FOUND', resource: candidates[0], via: 'NAME' };
  if (candidates.length > 1) return { kind: 'AMBIGUOUS', candidates };
  return { kind: 'NONE' };
}

export function getCanonicalResource(code: string): CanonicalResource | undefined {
  return BY_CODE.get(code);
}
