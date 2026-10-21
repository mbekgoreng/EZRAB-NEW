/**
 * Katalog 180 — PONDASI_GEOTEKNIK (7 baru), PEKERJAAN_TANAH (6 baru),
 * STRUKTUR_BETON_BAJA (7 baru).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { G, num, comp, tpl } from './builders';

const ASUMSI = [
  'Nilai default parameter adalah asumsi awal berlabel — hasil penyelidikan tanah (sondir/boring) menentukan desain final.',
  'Harga resmi hanya untuk komponen berkode AHSP 2026 kanonis yang lolos gerbang resolver; sisanya harga referensi pasar 2026.'
];
const EKSKLUSI = [
  'Tidak termasuk jasa penyelidikan tanah & desain geoteknik/struktur (konsultan).',
  'Tidak termasuk penanganan kondisi tak terduga (batuan keras massif, air tanah artesis) di luar asumsi.'
];

export const SPECIALTY_TEMPLATES_A: RabTemplate[] = [
  // =======================================================================
  // PONDASI & GEOTEKNIK (7)
  // =======================================================================
  tpl({
    id: 'FND-BORED-PILE',
    name: 'Pondasi Bored Pile Gedung (per Titik Bor)',
    category: 'PONDASI_GEOTEKNIK',
    subcategory: 'Bored Pile',
    description: 'Paket pondasi bored pile gedung per titik: pengeboran, pembesian spiral, pengecoran ready-mix, dan pile cap bersama. Kedalaman & diameter mengikuti hasil sondir; template menyediakan kerangka kuantitas per titik.',
    badge: 'Bored Pile',
    icon: 'Drill',
    parameters: [
      num('num_piles', 'Jumlah Titik Bored Pile', 24, { min: 4, max: 300, group: 'specifications' }),
      num('pile_depth', 'Kedalaman Bor Rata-rata', 18, { min: 6, max: 45, unit: 'm', group: 'specifications' }),
      num('pile_diameter', 'Diameter Bor (cm)', 60, { min: 30, max: 120, unit: 'cm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Platform Kerja', G.PERSIAPAN, 'm2', 'num_piles * 9', ['num_piles'], { code: 'C.37' }),
      comp('bor-keras', 'Pengeboran Bored Pile Tanah Keras/Berbatu (per m, Padanan Ø20 Disesuaikan)', G.PONDASI, 'm1', 'num_piles * pile_depth * (pile_diameter / 20) * 0.28', ['num_piles', 'pile_depth', 'pile_diameter'], { code: '2.2.2.3.3', price: 131870, priceNote: 'Item kanonis pengeboran Ø20 cm; volume disesuaikan luas penampang relatif & faktor metode — harga bor diameter besar wajib konfirmasi kontraktor spesialis.' }),
      comp('casing', 'Casing & Lumpur Bentonite (Paket per m Bor)', G.PONDASI, 'm1', 'num_piles * pile_depth', ['num_piles', 'pile_depth'], { price: 185000, level: 'PROFESSIONAL', priceNote: 'Referensi casing baja sementara + sirkulasi bentonite per meter.' }),
      comp('besi', 'Pembesian Bored Pile (Penulangan Wiremesh & Spiral setara)', G.PONDASI, 'kg', 'num_piles * pile_depth * pile_diameter * 0.42', ['num_piles', 'pile_depth', 'pile_diameter'], { code: '2.2.1.1.5', level: 'PROFESSIONAL', priceNote: 'Berat besi diasumsikan proporsional diameter (asumsi dinyatakan); item kanonis wiremesh dipakai sebagai padanan tarif penulangan manual.' }),
      comp('cor', 'Pengecoran Bored Pile Ready Mix fc 10 (Basis) + Tremie', G.PONDASI, 'm3', 'num_piles * pile_depth * 3.1416 * pile_diameter * pile_diameter / 40000', ['num_piles', 'pile_depth', 'pile_diameter'], { code: '2.2.1.6.1', level: 'PROFESSIONAL' }),
      comp('cor-upgrade', 'Selisih Mutu Beton ke fc 25 & Aditif Retarder (per m³ Tiang)', G.PONDASI, 'm3', 'num_piles * pile_depth * 3.1416 * pile_diameter * pile_diameter / 40000', ['num_piles', 'pile_depth', 'pile_diameter'], { price: 265000, level: 'PROFESSIONAL', priceNote: 'Referensi selisih mutu beton tiang termasuk retarder & uji slump/flow.' }),
      comp('potong', 'Pemotongan Kepala Tiang & Pembobokan (per Titik setara Potong Pancang)', G.PONDASI, 'unit', 'num_piles', ['num_piles'], { price: 385000, level: 'COMPREHENSIVE', priceNote: 'Referensi chiping kepala tiang hingga elevasi pile cap termasuk pembuangan puing.' }),
      comp('pilecap', 'Beton Pile Cap & Tie Beam fc 15 MPa', G.PONDASI, 'm3', 'num_piles * 1.35', ['num_piles'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('pilecap-besi', 'Penulangan Pile Cap BjTP ≥ 12 mm', G.PONDASI, 'kg', 'num_piles * 92', ['num_piles'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('uji', 'Uji Beban Statik / PDA Test (Paket per Titik Uji)', G.KHUSUS, 'unit', 'Math.ceil(num_piles / 12)', ['num_piles'], { price: 18500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi PDA test termasuk laporan; uji beban statik penuh dihitung terpisah.' })
    ],
    assumptions: ASUMSI,
    exclusions: EKSKLUSI
  }),

  tpl({
    id: 'FND-DRIVEN-PILE',
    name: 'Pondasi Tiang Pancang Beton Pracetak (Driven Pile)',
    category: 'PONDASI_GEOTEKNIK',
    subcategory: 'Tiang Pancang',
    description: 'Pondasi tiang pancang beton pracetak segiempat dengan diesel/hydraulic hammer: pasok tiang, pemancangan, penyambungan, pemotongan kepala, dan pile cap. Untuk gedung bertingkat di tanah lunak.',
    badge: 'Driven Pile',
    icon: 'Hammer',
    parameters: [
      num('num_piles', 'Jumlah Titik Pancang', 60, { min: 10, max: 600, group: 'specifications' }),
      num('pile_depth', 'Kedalaman Pancang Rata-rata', 24, { min: 8, max: 45, unit: 'm', group: 'specifications' }),
      num('num_joints', 'Rata-rata Sambungan per Tiang', 1, { min: 0, max: 3, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Platform Pancang', G.PERSIAPAN, 'm2', 'num_piles * 7', ['num_piles'], { code: 'C.37' }),
      comp('supply', 'Pengadaan Tiang Pancang Beton 25x25 (per m Tiang)', G.PONDASI, 'm1', 'num_piles * pile_depth', ['num_piles', 'pile_depth'], { price: 545000, priceNote: 'Referensi pasok tiang pracetak K-500 termasuk angkut dalam kota.' }),
      comp('pancang', 'Penetrasi Tiang Pancang Beton 25x25 (Jasa Pancang)', G.PONDASI, 'm1', 'num_piles * pile_depth', ['num_piles', 'pile_depth'], { code: 'A.2.05.1c.3', price: 31250, priceNote: 'Item kanonis penetrasi (PARTIAL); fallback diselaraskan komposisi kanonis.' }),
      comp('sambung', 'Penyambungan Tiang (Las Pelat & Bevel) per Titik Sambung', G.PONDASI, 'unit', 'num_piles * num_joints', ['num_piles', 'num_joints'], { price: 485000, level: 'PROFESSIONAL', priceNote: 'Referensi sambungan las penuh termasuk pelat & pengujian visual.' }),
      comp('potong', 'Per-1x Potong Tiang Pancang Ø40/Persegi 40 (Padanan Potong Kepala)', G.PONDASI, 'unit', 'num_piles', ['num_piles'], { code: 'A.2.05.1g.1', price: 77000, level: 'PROFESSIONAL', priceNote: 'Item kanonis pemotongan tiang (PARTIAL); fallback diselaraskan komposisi kanonis.' }),
      comp('galian-cap', 'Galian Pile Cap Tanah Biasa', G.TANAH, 'm3', 'num_piles * 1.9', ['num_piles'], { code: '1.2.1.1.2' }),
      comp('pilecap', 'Beton Pile Cap fc 15 MPa', G.PONDASI, 'm3', 'num_piles * 1.15', ['num_piles'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('besi', 'Penulangan Pile Cap BjTP ≥ 12 mm', G.PONDASI, 'kg', 'num_piles * 84', ['num_piles'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('bekisting', 'Bekisting Pile Cap (Multiflex setara Kolom)', G.PONDASI, 'm2', 'num_piles * 2.4', ['num_piles'], { code: 'A.1.03.2e.1', price: 44275, level: 'COMPREHENSIVE' }),
      comp('uji', 'PDA Test & Laporan (per Titik Uji)', G.KHUSUS, 'unit', 'Math.ceil(num_piles / 15)', ['num_piles'], { price: 16500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi PDA test termasuk interpretasi CAPWAP dasar.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk penanganan tiang miring/patah & redrive, serta pengujian beban statik skala penuh.']
  }),

  tpl({
    id: 'FND-RAFT-BASEMENT',
    name: 'Raft Foundation + Basement 1 Lantai (Struktur Bawah)',
    category: 'PONDASI_GEOTEKNIK',
    subcategory: 'Raft & Basement',
    description: 'Struktur bawah gedung: galian basement terbuka dengan dewatering ringan, raft slab tebal, dinding basement beton kedap air + waterstop, dan waterproofing eksternal. Di atas tanah relatif kompeten tanpa tiang dalam.',
    badge: 'Raft Basement',
    icon: 'Layers',
    parameters: [
      num('footprint_area', 'Luas Tapak Basement', 900, { min: 200, max: 4000, unit: 'm²' }),
      num('basement_depth', 'Kedalaman Basement', 3.6, { min: 2.8, max: 5, unit: 'm', group: 'specifications' }),
      num('raft_thickness', 'Tebal Raft Slab', 0.6, { min: 0.4, max: 1.2, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak', G.PERSIAPAN, 'm2', 'footprint_area * 1.15', ['footprint_area'], { code: 'C.37' }),
      comp('galian', 'Galian Basement Tanah Berbatu (Bertahap)', G.TANAH, 'm3', 'footprint_area * basement_depth * 1.06', ['footprint_area', 'basement_depth'], { code: '1.2.3.1.1' }),
      comp('dewatering', 'Dewatering Sumur Pompa Sementara (Paket per m² Tapak)', G.TANAH, 'm2', 'footprint_area', ['footprint_area'], { price: 58500, priceNote: 'Referensi dewatering wellpoint/sump selama pekerjaan struktur bawah (±2 bulan).' }),
      comp('buang', 'Angkut Tanah Galian Berlebih s.d. 10 m', G.TANAH, 'm3', 'footprint_area * basement_depth * 0.7', ['footprint_area', 'basement_depth'], { code: '1.4.1.1', level: 'PROFESSIONAL' }),
      comp('lantai-kerja', 'Beton Mutu Rendah fc 7,5 Lantai Kerja Raft', G.PONDASI, 'm3', 'footprint_area * 0.08', ['footprint_area'], { code: '2.2.1.4.1', price: 928002 }),
      comp('wp-membran', 'Waterproofing Membran Bakar di Bawah Raft & Dinding Luar', G.ATAP, 'm2', 'footprint_area * 1.3 + footprint_area * 0.32', ['footprint_area'], { code: '3.4.1', price: 207102, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis membran bakar.' }),
      comp('raft', 'Beton Raft Slab fc 15 MPa (Basis) — Mutu Final Dikonfirmasi Desain', G.PONDASI, 'm3', 'footprint_area * raft_thickness', ['footprint_area', 'raft_thickness'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi-raft', 'Penulangan Raft BjTP ≥ 12 mm (Lapis Atas & Bawah)', G.PONDASI, 'kg', 'footprint_area * raft_thickness * 92', ['footprint_area', 'raft_thickness'], { code: '2.2.1.1.4' }),
      comp('dinding-basement', 'Beton Kedap Air Dinding Basement (Aditif)', G.STRUKTUR, 'm3', 'footprint_area * 0.34', ['footprint_area'], { code: '2.2.1.5.11', price: 1565000, level: 'PROFESSIONAL' }),
      comp('waterstop', 'PVC Waterstop lebar 230–320 mm Keliling Sambungan', G.STRUKTUR, 'm1', 'footprint_area * 0.16', ['footprint_area'], { code: '2.2.1.2.3', price: 174996, level: 'PROFESSIONAL', priceNote: 'Fallback diselaraskan komposisi kanonis waterstop.' }),
      comp('besi-dinding', 'Penulangan Dinding Basement BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'footprint_area * 30', ['footprint_area'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('curing', 'Perawatan Beton Raft (Penggenangan)', G.PONDASI, 'm2', 'footprint_area', ['footprint_area'], { code: '2.2.1.9.1', level: 'COMPREHENSIVE' }),
      comp('sump', 'Pompa Submersible Cutter 100 LPM Sump Pit Basement', G.MEKANIKAL, 'unit', '2', [], { code: '6.2.2.3', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI, 'Galian terbuka diasumsikan memungkinkan kemiringan aman tanpa dinding penahan permanen; kondisi rapat kota memerlukan template Soldier Pile terpisah.'],
    exclusions: EKSKLUSI
  }),

  tpl({
    id: 'FND-SOLDIER-PILE',
    name: 'Dinding Penahan Galian: Soldier Pile + Lagging + Strutting',
    category: 'PONDASI_GEOTEKNIK',
    subcategory: 'Penahan Galian',
    description: 'Sistem penahan galian basement di lahan rapat: soldier pile baja H/IWF dalam lubang bor, lagging kayu/beton, strutting baja bertingkat, dan monitoring dasar. Untuk galian 4–9 m di kawasan terbangun.',
    badge: 'Penahan Galian',
    icon: 'Shield',
    parameters: [
      num('wall_length', 'Panjang Dinding Penahan', 120, { min: 30, max: 600, unit: 'm' }),
      num('excavation_depth', 'Kedalaman Galian', 6, { min: 3, max: 10, unit: 'm', group: 'specifications' }),
      num('strut_levels', 'Jumlah Lapis Strutting', 2, { min: 1, max: 4, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Dinding', G.PERSIAPAN, 'm2', 'wall_length * 3.4', ['wall_length'], { code: 'C.37' }),
      comp('bor', 'Pengeboran Lubang Soldier Pile Tanah Keras (per m Padanan)', G.PONDASI, 'm1', 'wall_length / 1.2 * (excavation_depth + 2.5)', ['wall_length', 'excavation_depth'], { price: 385000, priceNote: 'Referensi bor auger Ø450–600 termasuk grout kaki tiang (item kanonis bor Ø20 tidak sebanding skala).' }),
      comp('soldier', 'Baja Profil Soldier Pile H/IWF (Pabrikasi & Ereksi)', G.PONDASI, 'kg', 'wall_length / 1.2 * (excavation_depth + 2.5) * 62', ['wall_length', 'excavation_depth'], { code: '2.3.1.1', price: 39800, level: 'PROFESSIONAL' }),
      comp('lagging', 'Lagging Kayu Kelas II di Antara Soldier Pile', G.PONDASI, 'm2', 'wall_length * excavation_depth * 0.92', ['wall_length', 'excavation_depth'], { price: 285000, level: 'PROFESSIONAL', priceNote: 'Referensi papan lagging kayu keras termasuk penahan tanah granular.' }),
      comp('waling', 'Waling & Strutting Baja Profil per Lapis', G.PONDASI, 'kg', 'wall_length * strut_levels * 88', ['wall_length', 'strut_levels'], { code: '2.3.1.1', price: 39800, level: 'PROFESSIONAL' }),
      comp('baut', 'Mur & Baut Sambungan Strutting', G.PONDASI, 'kg', 'wall_length * strut_levels * 2.4', ['wall_length', 'strut_levels'], { code: '2.3.1.3', level: 'COMPREHENSIVE' }),
      comp('galian-tahap', 'Galian Bertahap di Belakang Dinding (Tanah Berbatu)', G.TANAH, 'm3', 'wall_length * excavation_depth * 0.6', ['wall_length', 'excavation_depth'], { code: '1.2.3.1.1', level: 'PROFESSIONAL', priceNote: 'Hanya strip galian kerja dinding; galian massa basement dihitung pada template basement/raft.' }),
      comp('dewatering', 'Dewatering & Sumur Pantau (Paket per m Dinding)', G.TANAH, 'm1', 'wall_length', ['wall_length'], { price: 225000, level: 'COMPREHENSIVE', priceNote: 'Referensi paket dewatering + sumur observasi selama galian.' }),
      comp('monitoring', 'Monitoring Inclinometer & Settlement (Paket per m Dinding)', G.KHUSUS, 'm1', 'wall_length', ['wall_length'], { price: 165000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi monitoring deformasi dasar termasuk laporan berkala.' }),
      comp('cabut', 'Pencabutan Soldier Pile & Strutting (Akhir Pekerjaan, per kg Baja)', G.BONGKAR, 'kg', 'wall_length / 1.2 * (excavation_depth + 2.5) * 62 * 0.7', ['wall_length', 'excavation_depth'], { price: 8500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi biaya cabut & angkut baja sementara (70% baja diasumsikan dapat dicabut).' })
    ],
    assumptions: [...ASUMSI, 'Jarak soldier pile diasumsikan 1,2 m dengan kedalaman tanam 2,5 m di bawah dasar galian; desain final oleh ahli geoteknik.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk ground anchor permanen, jet grouting, dan perbaikan bangunan tetangga.']
  }),

  tpl({
    id: 'FND-MINI-PILE',
    name: 'Mini Pile Rumah Tinggal & Ruko (Tiang Segitiga)',
    category: 'PONDASI_GEOTEKNIK',
    subcategory: 'Mini Pile',
    description: 'Pondasi mini pile beton segitiga/persegi kecil untuk rumah 2–3 lantai & ruko di tanah lunak: pemancangan jack-in/diesel mini, pile cap kecil, dan sloof pengikat. Alternatif ekonomis pondasi batu kali untuk tanah lunak.',
    badge: 'Mini Pile',
    icon: 'Home',
    parameters: [
      num('num_piles', 'Jumlah Titik Mini Pile', 36, { min: 8, max: 200, group: 'specifications' }),
      num('pile_depth', 'Kedalaman Pancang Rata-rata', 12, { min: 6, max: 24, unit: 'm', group: 'specifications' }),
      num('building_area', 'Luas Bangunan', 180, { min: 60, max: 800, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak', G.PERSIAPAN, 'm2', 'building_area * 1.25', ['building_area'], { code: 'C.37' }),
      comp('supply', 'Pengadaan Mini Pile Beton Segitiga 28/32 (per m)', G.PONDASI, 'm1', 'num_piles * pile_depth', ['num_piles', 'pile_depth'], { price: 285000, priceNote: 'Referensi pasok mini pile pracetak termasuk angkut lokal.' }),
      comp('pancang', 'Penetrasi Tiang Pancang Beton 15x15 (Jasa Pancang Mini)', G.PONDASI, 'm1', 'num_piles * pile_depth', ['num_piles', 'pile_depth'], { code: 'A.2.05.1c.1', price: 22418, priceNote: 'Item kanonis penetrasi pancang 15x15 (PARTIAL); fallback diselaraskan komposisi kanonis.' }),
      comp('potong', 'Potong Kepala Tiang & Rapikan (per Titik)', G.PONDASI, 'unit', 'num_piles', ['num_piles'], { price: 125000, level: 'PROFESSIONAL', priceNote: 'Referensi potong & bobok kepala mini pile.' }),
      comp('galian', 'Galian Pile Cap & Sloof Tanah Biasa', G.TANAH, 'm3', 'num_piles * 0.85 + building_area * 0.12', ['num_piles', 'building_area'], { code: '1.2.1.1.1' }),
      comp('pasir', 'Urugan Pasir Alas Pile Cap (Bedding setara)', G.PONDASI, 'm3', 'num_piles * 0.12', ['num_piles'], { price: 245000, level: 'PROFESSIONAL' }),
      comp('pilecap', 'Beton Pile Cap Mini & Sloof fc 15 MPa', G.PONDASI, 'm3', 'num_piles * 0.42 + building_area * 0.045', ['num_piles', 'building_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Pile Cap & Sloof BjTP < 12 mm', G.PONDASI, 'kg', '(num_piles * 0.42 + building_area * 0.045) * 78', ['num_piles', 'building_area'], { code: '2.2.1.1.3', level: 'PROFESSIONAL' }),
      comp('bekisting', 'Bekisting Pile Cap & Sloof (Padanan Bekisting Pondasi)', G.PONDASI, 'm2', 'num_piles * 1.1', ['num_piles'], { price: 185000, level: 'COMPREHENSIVE', priceNote: 'Referensi bekisting kayu lapis pakai ulang (item kanonis bekisting fondasi berstatus MISSING pada resolver).' })
    ],
    assumptions: ASUMSI,
    exclusions: EKSKLUSI
  }),

  tpl({
    id: 'FND-SUMURAN-CAISSON',
    name: 'Pondasi Sumuran (Caisson) + Pile Cap untuk Tanah Sedang',
    category: 'PONDASI_GEOTEKNIK',
    subcategory: 'Sumuran',
    description: 'Pondasi sumuran cincin beton pracetak diturunkan bertahap untuk bangunan 2–4 lantai di tanah sedang dengan muka air tinggi: penggalian dalam cincin, pengecoran masif, dan pile cap. Metode klasik yang masih ekonomis di banyak daerah.',
    badge: 'Sumuran',
    icon: 'Circle',
    parameters: [
      num('num_wells', 'Jumlah Sumuran', 18, { min: 4, max: 120, group: 'specifications' }),
      num('well_depth', 'Kedalaman Sumuran', 5, { min: 3, max: 9, unit: 'm', group: 'specifications' }),
      num('well_diameter', 'Diameter Sumuran (cm)', 100, { min: 80, max: 150, unit: 'cm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak', G.PERSIAPAN, 'm2', 'num_wells * 8', ['num_wells'], { code: 'C.37' }),
      comp('galian', 'Galian Dalam Sumuran Tanah Berbatu (Manual Terlindung Cincin)', G.TANAH, 'm3', 'num_wells * well_depth * 3.1416 * well_diameter * well_diameter / 40000', ['num_wells', 'well_depth', 'well_diameter'], { code: '1.2.3.1.1' }),
      comp('cincin', 'Cincin Beton Pracetak Sumuran (Pasang Cetakan Komponen setara per Titik)', G.PONDASI, 'buah', 'num_wells * well_depth', ['num_wells', 'well_depth'], { price: 685000, priceNote: 'Referensi cincin sumuran Ø100 per meter kedalaman termasuk penurunan bertahap.' }),
      comp('sumuran-isi', 'Pembuatan Pondasi Sumuran dia. 100 cm Masif (Beton + Batu Isi)', G.PONDASI, 'm3', 'num_wells * well_depth * 3.1416 * well_diameter * well_diameter / 40000 * 0.92', ['num_wells', 'well_depth', 'well_diameter'], { code: '2.2.2.2.6', level: 'PROFESSIONAL' }),
      comp('lantai-kerja', 'Beton Mutu Rendah Dasar Sumuran & Pile Cap', G.PONDASI, 'm3', 'num_wells * 0.3', ['num_wells'], { code: '2.2.1.4.1', price: 928002, level: 'PROFESSIONAL' }),
      comp('pilecap', 'Beton Pile Cap Pengikat Sumuran fc 15 MPa', G.PONDASI, 'm3', 'num_wells * 0.85', ['num_wells'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('besi', 'Penulangan Pile Cap BjTP < 12 mm', G.PONDASI, 'kg', 'num_wells * 66', ['num_wells'], { code: '2.2.1.1.3', level: 'PROFESSIONAL' }),
      comp('dewatering', 'Pompa Celup Pengeringan Sumuran (Operasional per Titik)', G.TANAH, 'unit', 'num_wells', ['num_wells'], { price: 385000, level: 'COMPREHENSIVE', priceNote: 'Referensi operasional pompa kuras selama penurunan cincin.' })
    ],
    assumptions: [...ASUMSI, 'Diameter acuan item kanonis sumuran adalah 100 cm masif; diameter lain disesuaikan proporsional terhadap luas penampang.'],
    exclusions: EKSKLUSI
  }),

  tpl({
    id: 'FND-GROUND-IMPROVEMENT',
    name: 'Perbaikan Tanah: Preloading + Drainase Vertikal + Stone Column',
    category: 'PONDASI_GEOTEKNIK',
    subcategory: 'Perbaikan Tanah',
    description: 'Paket perbaikan tanah lunak kawasan sebelum konstruksi: timbunan preloading bertahap, prefabricated vertical drain (PVD), lapisan kerja agregat, dan stone column titik kritis. Untuk lahan reklamasi ringan & tanah lunak delta.',
    badge: 'Ground Improvement',
    icon: 'Layers',
    parameters: [
      num('site_area', 'Luas Area Perbaikan', 5000, { min: 500, max: 50000, unit: 'm²' }),
      num('preload_height', 'Tinggi Timbunan Preloading', 2.2, { min: 1, max: 5, unit: 'm', group: 'specifications' }),
      num('pvd_spacing', 'Jarak PVD (m)', 1.2, { min: 0.9, max: 2, unit: 'm', group: 'specifications' }),
      num('stone_column_area', 'Luas Zona Stone Column (Titik Kritis)', 600, { min: 0, max: 10000, unit: 'm²', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Lunak', G.PERSIAPAN, 'm2', 'site_area', ['site_area'], { code: 'A.1.01.a.1' }),
      comp('lapis-kerja', 'Lapis Kerja Agregat & Pasir Drainase Horizontal', G.TANAH, 'm3', 'site_area * 0.5', ['site_area'], { price: 325000, priceNote: 'Referensi lapis kerja batu pecah + pasir drainase terhampar.' }),
      comp('geotekstil', 'Geotekstil Tebal Sedang Semi Mekanis Separator Dasar', G.PONDASI, 'm2', 'site_area * 1.05', ['site_area'], { code: '1.5.4' }),
      comp('preload', 'Timbunan Preloading Bertahap (Urugan Tanah Liat setara Material Timbunan)', G.TANAH, 'm3', 'site_area * preload_height', ['site_area', 'preload_height'], { code: '1.3.1.5', price: 262900, priceNote: 'Item kanonis urugan tanah liat dipakai sebagai padanan material timbunan; pengangkutan jarak jauh dihitung terpisah bila borrow pit jauh.' }),
      comp('pvd', 'PVD (Prefabricated Vertical Drain) Terpasang per m Tusuk', G.PONDASI, 'm1', 'site_area / (pvd_spacing * pvd_spacing) * 14', ['site_area', 'pvd_spacing'], { price: 38500, level: 'PROFESSIONAL', priceNote: 'Referensi PVD + mandrel rig per meter tusuk kedalaman acuan 14 m.' }),
      comp('stone-column', 'Stone Column Ø600 (Bor + Isian Agregat) per m', G.PONDASI, 'm1', 'stone_column_area * 5.5', ['stone_column_area'], { price: 485000, condition: 'stone_column_area > 0', level: 'PROFESSIONAL', priceNote: 'Referensi stone column vibro-replacement per meter kedalaman.' }),
      comp('pemadatan', 'Pemadatan Lapis Kerja (Stamper Semi Mekanis)', G.TANAH, 'm3', 'site_area * 0.3', ['site_area'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('settlement', 'Monitoring Settlement Plate & Piezometer (Paket per 1.000 m²)', G.KHUSUS, 'unit', 'site_area / 1000', ['site_area'], { price: 12500000, level: 'COMPREHENSIVE', priceNote: 'Referensi instrumentasi + pembacaan berkala selama masa tunggu konsolidasi.' }),
      comp('bongkar-preload', 'Pembongkaran & Pemindahan Surcharge Akhir Konsolidasi (Angkut ≤ 10 m)', G.TANAH, 'm3', 'site_area * preload_height * 0.3', ['site_area', 'preload_height'], { code: '1.4.1.1', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI, 'Kedalaman PVD acuan 14 m; waktu tunggu konsolidasi tidak menimbulkan biaya langsung selain monitoring (biaya waktu proyek di luar template).'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk vacuum consolidation, deep cement mixing skala penuh, dan biaya keterlambatan akibat masa tunggu.']
  }),

  // =======================================================================
  // PEKERJAAN TANAH (6)
  // =======================================================================
  tpl({
    id: 'EARTH-CUT-FILL',
    name: 'Cut & Fill Kawasan Perumahan (Pembentukan Lahan)',
    category: 'PEKERJAAN_TANAH',
    subcategory: 'Pembentukan Lahan',
    description: 'Pembentukan lahan kawasan: pembersihan, galian cut area tinggi, timbunan fill area rendah dengan pemadatan berlapis, dan pembentukan kemiringan drainase awal. Basis pekerjaan tanah sebelum jalan & drainase kawasan.',
    badge: 'Cut & Fill',
    icon: 'Mountain',
    parameters: [
      num('site_area', 'Luas Lahan Kawasan', 12000, { min: 1000, max: 200000, unit: 'm²' }),
      num('avg_cut', 'Rata-rata Kedalaman Cut', 0.8, { min: 0.1, max: 4, unit: 'm', group: 'specifications' }),
      num('avg_fill', 'Rata-rata Tinggi Fill (Area Rendah 55%)', 1.1, { min: 0.1, max: 5, unit: 'm', group: 'specifications' }),
      num('haul_percent', 'Persentase Material Dibuang Keluar (%)', 15, { min: 0, max: 80, unit: '%', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan (Striping Tanaman Ø ≤ 2 cm)', G.PERSIAPAN, 'm2', 'site_area', ['site_area'], { code: 'A.1.01.a.1' }),
      comp('cabut', 'Gali & Cabut Tunggul Pohon dia. 15–30 cm (termasuk Buang)', G.PERSIAPAN, 'tgl', 'site_area / 220', ['site_area'], { code: '1.1.3.9', level: 'PROFESSIONAL' }),
      comp('cut', 'Penggalian Tanah Biasa Volume > 2.000 m³ (Cut, Manual/Mekanis setara)', G.TANAH, 'm3', 'site_area * 0.45 * avg_cut', ['site_area', 'avg_cut'], { code: '1.2.1.1.3' }),
      comp('cut-keras', 'Penggalian Cadas/Tanah Keras Zona Cut Sulit', G.TANAH, 'm3', 'site_area * 0.45 * avg_cut * 0.18', ['site_area', 'avg_cut'], { code: '1.2.4.1.2', level: 'PROFESSIONAL' }),
      comp('fill', 'Timbunan Fill dari Material Cut (Urugan Kembali setara)', G.TANAH, 'm3', 'site_area * 0.55 * avg_fill * 0.82', ['site_area', 'avg_fill'], { code: '1.3.1.1' }),
      comp('fill-impor', 'Timbunan Tanah Liat Impor (Kekurangan Material)', G.TANAH, 'm3', 'site_area * 0.55 * avg_fill * 0.18', ['site_area', 'avg_fill'], { code: '1.3.1.5', price: 262900, level: 'PROFESSIONAL', priceNote: 'Fallback diselaraskan komposisi kanonis urugan tanah liat (belum termasuk angkut jarak jauh).' }),
      comp('padat', 'Pemadatan Fill per 20 cm (Timbris/Sheepfoot setara)', G.TANAH, 'm3', 'site_area * 0.55 * avg_fill', ['site_area', 'avg_fill'], { code: '1.3.2.1' }),
      comp('buang', 'Angkut Material Berlebih Keluar (Porsi Buang, Angkut ≤ 10 m Dasar)', G.TANAH, 'm3', 'site_area * 0.45 * avg_cut * haul_percent / 100', ['site_area', 'avg_cut', 'haul_percent'], { code: '1.4.1.1', level: 'COMPREHENSIVE' }),
      comp('grading', 'Perataan Akhir & Pembentukan Kemiringan (Pengolahan Tanah setara)', G.TANAH, 'm2', 'site_area * 0.9', ['site_area'], { price: 12500, level: 'COMPREHENSIVE', priceNote: 'Referensi fine grading mekanis per m² termasuk pembentukan crown drainase awal.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk angkut buangan jarak > 10 m (dihitung per rit terpisah), retaining struktur, dan pekerjaan jalan/drainase kawasan.']
  }),

  tpl({
    id: 'EARTH-ROAD-EMBANKMENT',
    name: 'Timbunan Badan Jalan & Pelebaran (Road Embankment)',
    category: 'PEKERJAAN_TANAH',
    subcategory: 'Timbunan Jalan',
    description: 'Pembentukan badan jalan baru/pelebaran di atas tanah dasar bervariasi: pembersihan jalur, timbunan pilihan berlapis padat, perkuatan geotekstil zona lunak, dan pembentukan bahu. Sebelum lapis perkerasan.',
    badge: 'Embankment',
    icon: 'Milestone',
    parameters: [
      num('road_length', 'Panjang Badan Jalan', 1500, { min: 200, max: 20000, unit: 'm' }),
      num('embankment_width', 'Lebar Timbunan (Badan + Bahu)', 9, { min: 5, max: 20, unit: 'm' }),
      num('embankment_height', 'Tinggi Timbunan Rata-rata', 1.4, { min: 0.3, max: 5, unit: 'm', group: 'specifications' }),
      num('soft_percent', 'Persentase Zona Tanah Lunak (%)', 20, { min: 0, max: 100, unit: '%', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Timbunan', G.PERSIAPAN, 'm2', 'road_length * (embankment_width + 3)', ['road_length', 'embankment_width'], { code: 'C.37' }),
      comp('galian-dasar', 'Galian Pembuangan Tanah Lunak Permukaan Zona Lemah', G.TANAH, 'm3', 'road_length * embankment_width * 0.4 * soft_percent / 100', ['road_length', 'embankment_width', 'soft_percent'], { code: '1.2.1.1.2', condition: 'soft_percent > 0' }),
      comp('geotekstil', 'Geotekstil Tebal Sedang Manual Separator Zona Lunak', G.PONDASI, 'm2', 'road_length * embankment_width * soft_percent / 100 * 1.1', ['road_length', 'embankment_width', 'soft_percent'], { code: '1.5.3', condition: 'soft_percent > 0', level: 'PROFESSIONAL' }),
      comp('timbun-biasa', 'Timbunan Tanah Biasa Badan Jalan (Urugan Liat setara, Berlapis)', G.TANAH, 'm3', 'road_length * embankment_width * embankment_height * 0.8', ['road_length', 'embankment_width', 'embankment_height'], { code: '1.3.1.4', price: 239426, priceNote: 'Fallback diselaraskan komposisi kanonis urugan tanah biasa.' }),
      comp('timbun-pilihan', 'Timbunan Pilihan (Selected Fill) Lapis Atas Badan Jalan', G.TANAH, 'm3', 'road_length * embankment_width * 0.3', ['road_length', 'embankment_width'], { price: 285000, level: 'PROFESSIONAL', priceNote: 'Referensi material pilihan CBR ≥ 10 terhampar (tanpa angkut jauh).' }),
      comp('padat', 'Pemadatan Timbunan per 20 cm Timbris (Setara Sheepfoot/Vibro)', G.TANAH, 'm3', 'road_length * embankment_width * embankment_height', ['road_length', 'embankment_width', 'embankment_height'], { code: '1.3.2.1' }),
      comp('bahu', 'Pembentukan & Pemadatan Bahu Jalan (Pemadatan Stamper)', G.TANAH, 'm3', 'road_length * 1.6', ['road_length'], { code: '1.3.3.1', level: 'COMPREHENSIVE' }),
      comp('lereng', 'Perapian Lereng Timbunan & Proteksi Rumput Awal', G.LANSKAP, 'm2', 'road_length * embankment_height * 2.4', ['road_length', 'embankment_height'], { price: 34500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi hydroseed/rumput lereng awal terpasang.' })
    ],
    assumptions: ASUMSI,
    exclusions: EKSKLUSI
  }),

  tpl({
    id: 'EARTH-BASEMENT-EXCAVATION',
    name: 'Galian Basement Terbuka + Dewatering (Open Cut)',
    category: 'PEKERJAAN_TANAH',
    subcategory: 'Galian Basement',
    description: 'Pekerjaan galian basement metode open cut dengan lereng aman: galian bertahap berbatu, ramp akses sementara, dewatering sumur dalam sederhana, dan pembuangan tanah keluar tapak. Untuk lahan cukup luas tanpa bangunan rapat.',
    badge: 'Open Cut',
    icon: 'Construction',
    parameters: [
      num('footprint_area', 'Luas Tapak Galian', 1100, { min: 200, max: 6000, unit: 'm²' }),
      num('excavation_depth', 'Kedalaman Galian', 4.2, { min: 2.5, max: 8, unit: 'm', group: 'specifications' }),
      num('reuse_percent', 'Persentase Tanah Dipakai Kembali (%)', 20, { min: 0, max: 70, unit: '%', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak Galian', G.PERSIAPAN, 'm2', 'footprint_area * 1.3', ['footprint_area'], { code: 'C.37' }),
      comp('pagar', 'Pagar Pengaman Galian & Rambu (Pagar Seng Baja setara)', G.PERSIAPAN, 'm1', 'footprint_area * 0.16', ['footprint_area'], { code: '1.1.1.4', level: 'PROFESSIONAL' }),
      comp('galian', 'Galian Tanah Berbatu Bertahap (Kedalaman 1–2 m per Tahap)', G.TANAH, 'm3', 'footprint_area * excavation_depth * 0.55', ['footprint_area', 'excavation_depth'], { code: '1.2.3.1.2' }),
      comp('galian-cadas', 'Galian Cadas Zona Keras Bawah', G.TANAH, 'm3', 'footprint_area * excavation_depth * 0.2', ['footprint_area', 'excavation_depth'], { code: '1.2.4.1.4', level: 'PROFESSIONAL' }),
      comp('galian-biasa', 'Galian Tanah Biasa Lapisan Atas', G.TANAH, 'm3', 'footprint_area * excavation_depth * 0.25', ['footprint_area', 'excavation_depth'], { code: '1.2.1.1.4' }),
      comp('ramp', 'Ramp Akses Sementara & Jalan Kerja (Agregat Padat)', G.TANAH, 'm3', 'footprint_area * 0.22', ['footprint_area'], { price: 185000, level: 'PROFESSIONAL', priceNote: 'Referensi pembentukan ramp agregat termasuk perataan & pemadatan ulang selama galian.' }),
      comp('dewatering', 'Dewatering Sump & Pompa Selama Galian (Paket per m³ Galian Basah)', G.TANAH, 'm3', 'footprint_area * excavation_depth * 0.45', ['footprint_area', 'excavation_depth'], { price: 12500, level: 'PROFESSIONAL', priceNote: 'Referensi biaya operasional dewatering proporsional volume zona basah.' }),
      comp('buang', 'Angkut Tanah Buangan Keluar Tapak (Porsi Buang, Dasar ≤ 10 m)', G.TANAH, 'm3', 'footprint_area * excavation_depth * (100 - reuse_percent) / 100 * 0.8', ['footprint_area', 'excavation_depth', 'reuse_percent'], { code: '1.4.1.1' }),
      comp('stockpile', 'Penimbunan Sementara Tanah Pakai Ulang & Penutup Terpal (Paket)', G.TANAH, 'm3', 'footprint_area * excavation_depth * reuse_percent / 100', ['footprint_area', 'excavation_depth', 'reuse_percent'], { price: 18500, level: 'COMPREHENSIVE', condition: 'reuse_percent > 0' })
    ],
    assumptions: [...ASUMSI, 'Rasio volume antar jenis tanah (biasa/berbatu/cadas) adalah asumsi awal 25/55/20 — hasil boring log menggantikan asumsi ini.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk dinding penahan permanen/sementara (template Soldier Pile), angkut jarak jauh > 10 m, dan struktur basement itu sendiri.']
  }),

  tpl({
    id: 'EARTH-LAND-CLEARING',
    name: 'Land Clearing & Grubbing Lahan Industri/Perkebunan',
    category: 'PEKERJAAN_TANAH',
    subcategory: 'Land Clearing',
    description: 'Pembersihan lahan skala besar: tebas tebang pohon, cabut tunggul, pengupasan topsoil terpisah, dan pembentukan jalan kerja awal. Untuk persiapan kawasan industri, perkebunan, dan solar park.',
    badge: 'Clearing',
    icon: 'Trees',
    parameters: [
      num('site_area', 'Luas Lahan', 30000, { min: 2000, max: 500000, unit: 'm²' }),
      num('tree_density', 'Kerapatan Pohon per Hektar', 45, { min: 0, max: 300, unit: 'pohon/ha', group: 'specifications' }),
      num('topsoil_depth', 'Kedalaman Kupas Topsoil', 0.2, { min: 0.1, max: 0.4, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('tebas-sedang', 'Tebas Tebang Pohon dia. 50–75 cm', G.PERSIAPAN, 'btg', 'site_area / 10000 * tree_density * 0.55', ['site_area', 'tree_density'], { code: '1.1.3.6' }),
      comp('tebas-besar', 'Tebas Tebang Pohon dia. > 75 cm', G.PERSIAPAN, 'btg', 'site_area / 10000 * tree_density * 0.2', ['site_area', 'tree_density'], { code: '1.1.3.7', level: 'PROFESSIONAL' }),
      comp('cabut-kecil', 'Gali & Cabut Tunggul dia. 5–15 cm', G.PERSIAPAN, 'tgl', 'site_area / 10000 * tree_density * 0.6', ['site_area', 'tree_density'], { code: '1.1.3.8' }),
      comp('cabut-besar', 'Gali & Cabut Tunggul dia. 30–50 cm', G.PERSIAPAN, 'tgl', 'site_area / 10000 * tree_density * 0.3', ['site_area', 'tree_density'], { code: '1.1.3.10', level: 'PROFESSIONAL' }),
      comp('striping', 'Pengupasan Permukaan & Semak (Striping Mekanis setara)', G.PERSIAPAN, 'm2', 'site_area', ['site_area'], { code: 'A.1.01.a.1' }),
      comp('topsoil', 'Kupas & Stockpile Topsoil Terpisah (Galian Biasa setara)', G.TANAH, 'm3', 'site_area * topsoil_depth', ['site_area', 'topsoil_depth'], { code: '1.2.1.1.3', level: 'PROFESSIONAL' }),
      comp('bakar', 'Pengumpulan & Pembuangan Sisa Tebangan (Paket per Hektar)', G.PERSIAPAN, 'm2', 'site_area', ['site_area'], { price: 6850, level: 'COMPREHENSIVE', priceNote: 'Referensi windrowing & disposal sisa vegetasi (bukan pembakaran terbuka — mengikuti regulasi lingkungan setempat).' }),
      comp('jalan-kerja', 'Pembentukan Jalan Kerja Awal (Perataan + Agregat Tipis)', G.TANAH, 'm2', 'site_area * 0.06', ['site_area'], { price: 48500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi jalan kerja tanah padat + sebar agregat tipis.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk nilai kayu tebangan (potensi pendapatan pemilik), AMDAL/UKL-UPL, dan pembentukan lahan lanjutan (cut & fill terpisah).']
  }),

  tpl({
    id: 'EARTH-TERRACING',
    name: 'Terasering Lereng & Drainase Lereng Perbukitan',
    category: 'PEKERJAAN_TANAH',
    subcategory: 'Terasering',
    description: 'Pembentukan teras bertingkat di lereng untuk kebun/agrowisata/villa: cut & fill teras, dinding penahan batu antar teras, saluran drainase lereng, dan revegetasi penahan erosi.',
    badge: 'Terasering',
    icon: 'Layers',
    parameters: [
      num('slope_area', 'Luas Lereng Diteras', 4000, { min: 500, max: 40000, unit: 'm²' }),
      num('num_terraces', 'Jumlah Tingkat Teras', 6, { min: 2, max: 30, group: 'specifications' }),
      num('terrace_width', 'Lebar Rata-rata Teras', 6, { min: 3, max: 15, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lereng', G.PERSIAPAN, 'm2', 'slope_area', ['slope_area'], { code: 'A.1.01.a.1' }),
      comp('cut', 'Galian Cut Teras Tanah Berbatu', G.TANAH, 'm3', 'slope_area * 0.55', ['slope_area'], { code: '1.2.3.1.1' }),
      comp('fill', 'Timbunan Fill Teras (Urugan Kembali) + Pemadatan Stamper', G.TANAH, 'm3', 'slope_area * 0.4', ['slope_area'], { code: '1.3.3.1' }),
      comp('dinding-teras', 'Pasangan Batu Belah Dinding Antar Teras Mortar S', G.PONDASI, 'm3', 'num_terraces * (slope_area / (num_terraces * terrace_width)) * 0.85', ['num_terraces', 'slope_area', 'terrace_width'], { code: '2.2.2.1.5', level: 'PROFESSIONAL' }),
      comp('drain-puncak', 'Saluran Pengalih Puncak Lereng (U-Ditch 30x30 Sebagian)', G.DRAINASE, 'm1', 'slope_area / (num_terraces * terrace_width) * 1.1', ['slope_area', 'num_terraces', 'terrace_width'], { code: '8.1.1.1', price: 465000, level: 'PROFESSIONAL' }),
      comp('drain-teras', 'Saluran Kaki Teras & Gorong Lintasan (Bak Kontrol Kecil)', G.DRAINASE, 'buah', 'num_terraces * 2', ['num_terraces'], { code: '6.3.1', level: 'COMPREHENSIVE' }),
      comp('geotekstil', 'Geotekstil Tipis Manual Kaki Dinding Teras', G.PONDASI, 'm2', 'num_terraces * (slope_area / (num_terraces * terrace_width)) * 1.1', ['num_terraces', 'slope_area', 'terrace_width'], { code: '1.5.1', level: 'COMPREHENSIVE' }),
      comp('vegetasi', 'Penanaman Penutup Lereng & Vetiver (Paket per m²)', G.LANSKAP, 'm2', 'slope_area * 0.35', ['slope_area'], { price: 38500, level: 'COMPREHENSIVE', priceNote: 'Referensi revegetasi lereng termasuk bibit vetiver/rumput lokal.' }),
      comp('tangga', 'Tangga Batu Antar Teras & Jalur Inspeksi (Paket per Teras)', G.LANSKAP, 'unit', 'num_terraces', ['num_terraces'], { price: 1850000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi tangga batu + railing bambu/besi sederhana per tingkat teras.' })
    ],
    assumptions: ASUMSI,
    exclusions: EKSKLUSI
  }),

  tpl({
    id: 'EARTH-BORROW-HAUL',
    name: 'Borrow Pit & Pengangkutan Material Timbunan',
    category: 'PEKERJAAN_TANAH',
    subcategory: 'Borrow & Hauling',
    description: 'Paket pengadaan material timbunan dari borrow pit: penggalian borrow, pengangkutan jarak menengah (asumsi rit), penghamparan & perataan di lokasi timbun, dan rehabilitasi dasar borrow pit. Melengkapi template timbunan lain.',
    badge: 'Borrow Pit',
    icon: 'Truck',
    parameters: [
      num('fill_volume', 'Volume Timbunan Padat Dibutuhkan', 8000, { min: 500, max: 200000, unit: 'm³' }),
      num('haul_distance', 'Jarak Angkut Borrow (km)', 7, { min: 1, max: 60, unit: 'km', group: 'specifications' }),
      num('swell_factor', 'Faktor Kembang Material (loose/padat)', 1.25, { min: 1.1, max: 1.45, group: 'specifications' })
    ],
    components: [
      comp('galian-borrow', 'Penggalian Material Borrow Tanah Biasa (Volume Besar)', G.TANAH, 'm3', 'fill_volume * swell_factor', ['fill_volume', 'swell_factor'], { code: '1.2.1.1.3' }),
      comp('muat-angkut-dekat', 'Angkut Dasar s.d. 10 m (Pemuatan & Penumpahan di Pit)', G.TANAH, 'm3', 'fill_volume * swell_factor', ['fill_volume', 'swell_factor'], { code: '1.4.1.1' }),
      comp('angkut-jauh', 'Angkut Lanjutan per m³ per km (di Atas Jarak Dasar)', G.TANAH, 'm3', 'fill_volume * swell_factor * haul_distance', ['fill_volume', 'swell_factor', 'haul_distance'], { price: 6850, level: 'PROFESSIONAL', priceNote: 'Referensi tarif angkut dump truck per m³-km kawasan (sangat tergantung BBM & kondisi jalan).' }),
      comp('hampar', 'Penghamparan & Perataan Timbunan di Lokasi (Paket Mekanis per m³)', G.TANAH, 'm3', 'fill_volume', ['fill_volume'], { price: 14500, level: 'PROFESSIONAL', priceNote: 'Referensi dozing & spreading per m³ padat.' }),
      comp('padat', 'Pemadatan per 20 cm (Timbris/Sheepfoot setara)', G.TANAH, 'm3', 'fill_volume', ['fill_volume'], { code: '1.3.2.1' }),
      comp('uji-padat', 'Uji Kepadatan Lapangan (Sand Cone per Titik)', G.KHUSUS, 'unit', 'fill_volume / 750', ['fill_volume'], { price: 450000, level: 'COMPREHENSIVE', priceNote: 'Referensi uji sand cone termasuk laporan laboratorium tanah dasar.' }),
      comp('rehab-pit', 'Rehabilitasi Dasar Borrow Pit (Perataan & Topsoil Kembali)', G.TANAH, 'm2', 'fill_volume * 0.4', ['fill_volume'], { price: 9500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi reklamasi dasar borrow pit per m² permukaan pit.' })
    ],
    assumptions: [...ASUMSI, 'Tarif angkut per m³-km adalah asumsi kawasan umum — negosiasi angkutan lokal & harga BBM dapat mengubahnya signifikan.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk biaya sewa/pembebasan lahan borrow pit, retribusi galian C, dan perbaikan jalan desa akibat angkutan.']
  }),

  // =======================================================================
  // STRUKTUR BETON & BAJA (7)
  // =======================================================================
  tpl({
    id: 'STR-PRECAST-FRAME',
    name: 'Struktur Beton Pracetak (Kolom, Balok, Half-Slab)',
    category: 'STRUKTUR_BETON_BAJA',
    subcategory: 'Beton Pracetak',
    description: 'Sistem struktur pracetak gedung bertingkat: produksi komponen (bekisting pracetak, tuang), ereksi dengan tower crane, dan sambungan cor di tempat. Untuk proyek berulang & jadwal cepat.',
    badge: 'Pracetak',
    icon: 'Blocks',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 800, { min: 300, max: 3000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 6, { min: 2, max: 30 }),
      num('span', 'Bentang Tipikal Antar Kolom', 7.5, { min: 5, max: 12, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('bek-kolom', 'Bekisting Kolom Beton Pracetak (10–12x Pakai)', G.STRUKTUR, 'm2', 'floor_area * num_floors * 0.34', ['floor_area', 'num_floors'], { code: '2.4.1.3' }),
      comp('bek-balok', 'Bekisting Balok Beton Pracetak (10–12x Pakai)', G.STRUKTUR, 'm2', 'floor_area * num_floors * 0.3', ['floor_area', 'num_floors'], { code: '2.4.1.2' }),
      comp('tuang-kolom', 'Penuangan Beton Komponen Kolom Pracetak', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.05', ['floor_area', 'num_floors'], { code: '2.4.3.3' }),
      comp('tuang-balok', 'Penuangan Beton Komponen Balok Pracetak', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.055', ['floor_area', 'num_floors'], { code: '2.4.3.2' }),
      comp('beton-komponen', 'Beton Komponen Pracetak fc 15 (Material Cor Utama)', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.105', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL', priceNote: 'Material beton komponen; mutu pracetak final (fc 30+) dikonfirmasi desain — selisih mutu di luar padanan kanonis ini.' }),
      comp('besi', 'Penulangan Komponen BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 13.5', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('pasang-kolom', 'Pemasangan & Membuka Cetakan Komponen Kolom Pracetak', G.STRUKTUR, 'buah', 'floor_area * num_floors / span / span * 1.05', ['floor_area', 'num_floors', 'span'], { code: '2.4.2.3', level: 'PROFESSIONAL' }),
      comp('pasang-balok', 'Pemasangan & Membuka Cetakan Komponen Balok Pracetak', G.STRUKTUR, 'buah', 'floor_area * num_floors / span * 1.6', ['floor_area', 'num_floors', 'span'], { code: '2.4.2.2', level: 'PROFESSIONAL' }),
      comp('pasang-plat', 'Pemasangan Komponen Pelat Pracetak (Half-Slab)', G.STRUKTUR, 'buah', 'floor_area * num_floors / 6.2', ['floor_area', 'num_floors'], { code: '2.4.2.1', level: 'PROFESSIONAL' }),
      comp('topping', 'Beton Topping Half-Slab fc 15 MPa (Cor di Tempat)', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.055', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('grout', 'Grouting & Sambungan Komponen (Paket per m² Lantai)', G.STRUKTUR, 'm2', 'floor_area * num_floors', ['floor_area', 'num_floors'], { price: 68500, level: 'COMPREHENSIVE', priceNote: 'Referensi grout non-shrink sambungan + stek penulangan lapangan.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk tower crane (sewa alat terpisah), cetakan baja khusus proyek, dan transportasi komponen jarak jauh antar kota.']
  }),

  tpl({
    id: 'STR-STEEL-FRAME',
    name: 'Rangka Baja Gedung Bertingkat (Steel Frame + Bondek)',
    category: 'STRUKTUR_BETON_BAJA',
    subcategory: 'Rangka Baja',
    description: 'Struktur rangka baja gedung: kolom & balok WF fabrikasi, sambungan baut mutu tinggi, lantai komposit bondek + topping, dan proteksi api dasar. Untuk kantor, parkir bertingkat, dan gedung serbaguna cepat bangun.',
    badge: 'Steel Frame',
    icon: 'Building',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 900, { min: 300, max: 3000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 5, { min: 2, max: 25 }),
      num('steel_per_m2', 'Intensitas Baja (kg/m² Lantai)', 48, { min: 30, max: 85, unit: 'kg/m²', group: 'specifications' })
    ],
    components: [
      comp('baja', 'Fabrikasi & Ereksi Baja Profil Kolom-Balok', G.STRUKTUR, 'kg', 'floor_area * num_floors * steel_per_m2', ['floor_area', 'num_floors', 'steel_per_m2'], { code: '2.3.1.1', price: 39800 }),
      comp('pelat', 'Baja Pelat Semi Mekanis (Base Plate, Gusset, Stiffener)', G.STRUKTUR, 'kg', 'floor_area * num_floors * steel_per_m2 * 0.09', ['floor_area', 'num_floors', 'steel_per_m2'], { code: '2.3.1.4', level: 'PROFESSIONAL' }),
      comp('baut', 'Mur & Baut Mutu Tinggi Sambungan Momen', G.STRUKTUR, 'kg', 'floor_area * num_floors * steel_per_m2 * 0.028', ['floor_area', 'num_floors', 'steel_per_m2'], { code: '2.3.1.3', level: 'PROFESSIONAL' }),
      comp('ubolt', 'U-Bolt & Nut Aksesoris Sambungan Sekunder', G.STRUKTUR, 'kg', 'floor_area * num_floors * 0.6', ['floor_area', 'num_floors'], { code: '2.3.1.7', price: 285578, level: 'COMPREHENSIVE', priceNote: 'Item kanonis U-bolt berharga tinggi per kg (paket kecil) — volume dijaga kecil; verifikasi kebutuhan aktual.' }),
      comp('cat-meni', 'Pengecatan Baja Meni Besi (Primer)', G.FINISHING, 'm2', 'floor_area * num_floors * steel_per_m2 * 0.021', ['floor_area', 'num_floors', 'steel_per_m2'], { code: '3.8.16', level: 'PROFESSIONAL' }),
      comp('fireproof', 'Proteksi Api Spray Vermiculite Rangka Utama (Paket per m² Lantai)', G.STRUKTUR, 'm2', 'floor_area * num_floors * 0.4', ['floor_area', 'num_floors'], { price: 185000, level: 'COMPREHENSIVE', priceNote: 'Referensi fireproofing rating 2 jam pada elemen utama (40% luas lantai setara permukaan baja).' }),
      comp('bondek', 'Pelat Bondek + Shear Stud (Paket per m² Lantai)', G.STRUKTUR, 'm2', 'floor_area * num_floors * 0.97', ['floor_area', 'num_floors'], { price: 265000, level: 'PROFESSIONAL', priceNote: 'Referensi dek baja bergelombang + stud terpasang (material di luar padanan kanonis).' }),
      comp('topping', 'Beton Topping Komposit fc 15 MPa t=10 cm + Wiremesh', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.1', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('wiremesh', 'Wiremesh M6–M10 Topping Komposit', G.STRUKTUR, 'kg', 'floor_area * num_floors * 4.4', ['floor_area', 'num_floors'], { code: '2.2.1.1.5', level: 'PROFESSIONAL' }),
      comp('las', 'Pengelasan Lapangan Sambungan Pelat', G.STRUKTUR, 'm1', 'floor_area * num_floors * 0.14', ['floor_area', 'num_floors'], { code: '3.13.3', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk pondasi & pedestal beton, tangga baja (template finishing), dan cladding fasad.']
  }),

  tpl({
    id: 'STR-PT-SLAB',
    name: 'Pelat Pratekan Post-Tensioned (Bentang Besar)',
    category: 'STRUKTUR_BETON_BAJA',
    subcategory: 'Post-Tensioned',
    description: 'Lantai pelat pratekan pasca-tarik untuk bentang 8–12 m tanpa balok (flat slab PT): beton mutu tinggi, tendon & angkur, stressing & grouting, dengan kolom konvensional. Untuk parkir, mal, dan kantor bentang lebar.',
    badge: 'Post-Tensioned',
    icon: 'Layers',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 1200, { min: 400, max: 4000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai PT', 4, { min: 1, max: 30 }),
      num('slab_thickness', 'Tebal Pelat PT', 0.24, { min: 0.18, max: 0.35, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('beton', 'Beton Pelat & Kolom fc 15 (Basis Kanonis — Mutu PT Dikonfirmasi)', G.STRUKTUR, 'm3', 'floor_area * num_floors * (slab_thickness + 0.05)', ['floor_area', 'num_floors', 'slab_thickness'], { code: '2.2.1.4.3', price: 1355000, priceNote: 'Mutu beton PT aktual fc 30–40 MPa; selisih mutu dihitung pada komponen terpisah atau konfirmasi ready-mix.' }),
      comp('selisih-mutu', 'Selisih Mutu Beton PT ke fc 35 + Plasticizer (per m³ Pelat)', G.STRUKTUR, 'm3', 'floor_area * num_floors * slab_thickness', ['floor_area', 'num_floors', 'slab_thickness'], { price: 315000, level: 'PROFESSIONAL', priceNote: 'Referensi selisih mutu & admixture untuk pengecoran PT (termasuk siklus curing dipercepat).' }),
      comp('besi', 'Penulangan Lunak Pelat & Kolom BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 9.5', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('tendon', 'Kabel Prategang (Strand) Terpasang termasuk Duct & Angkur Hidup', G.STRUKTUR, 'kg', 'floor_area * num_floors * 4.6', ['floor_area', 'num_floors'], { code: '2.5.1', price: 93863, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis kabel prategang.' }),
      comp('stressing', 'Stressing, Elongasi & Grouting Tendon (Paket per m² Lantai)', G.STRUKTUR, 'm2', 'floor_area * num_floors', ['floor_area', 'num_floors'], { price: 58500, level: 'PROFESSIONAL', priceNote: 'Referensi jasa stressing + grouting + laporan elongasi oleh spesialis PT.' }),
      comp('bekisting', 'Bekisting Plat Meja (Table Form) Siklus Cepat', G.STRUKTUR, 'm2', 'floor_area * num_floors * 0.96', ['floor_area', 'num_floors'], { code: '2.2.1.3.5', level: 'PROFESSIONAL' }),
      comp('curing', 'Perawatan Beton Pelat (Penggenangan)', G.STRUKTUR, 'm2', 'floor_area * num_floors', ['floor_area', 'num_floors'], { code: '2.2.1.9.1', level: 'COMPREHENSIVE' }),
      comp('kolom-praktis', 'Kolom Praktis Beton Bertulang 11x11 (Elemen Sekunder)', G.STRUKTUR, 'm', 'num_floors * 24', ['num_floors'], { code: '2.2.1.10.1', price: 116740, level: 'COMPREHENSIVE', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis kolom praktis.' })
    ],
    assumptions: [...ASUMSI, 'Konsumsi tendon diasumsikan 4,6 kg/m² lantai untuk bentang ±9 m; desain PT final oleh spesialis berlisensi.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk desain PT & supervisi stressing (jasa spesialis), pondasi, dan pengujian beban lantai.']
  }),

  tpl({
    id: 'STR-CORE-WALL',
    name: 'Core Wall & Shear Wall Gedung Tinggi (Formwork Sistem)',
    category: 'STRUKTUR_BETON_BAJA',
    subcategory: 'Core & Shear Wall',
    description: 'Pekerjaan dinding geser & inti gedung sebagai paket struktur vertikal: bekisting sistem (padanan multiflex), beton volume besar, penulangan berat, dan curing. Melengkapi struktur lantai tipikal gedung tinggi.',
    badge: 'Core Wall',
    icon: 'Building2',
    parameters: [
      num('wall_area', 'Luas Permukaan Dinding Geser Total (2 Sisi)', 5200, { min: 800, max: 30000, unit: 'm²' }),
      num('wall_volume', 'Volume Beton Dinding Geser', 1250, { min: 200, max: 8000, unit: 'm³', group: 'specifications' }),
      num('num_lifts', 'Jumlah Pengecoran (Lift/Tahap)', 22, { min: 4, max: 80, group: 'specifications' })
    ],
    components: [
      comp('bekisting', 'Bekisting Dinding Sistem Multiflex 12/18 mm (Padanan Kolom)', G.STRUKTUR, 'm2', 'wall_area * 0.55', ['wall_area'], { code: 'A.1.03.2e.1', price: 44275, priceNote: 'Bekisting sistem dipakai ulang bertahap — volume adalah luas kontak efektif setelah faktor pakai ulang (asumsi dinyatakan).' }),
      comp('perancah', 'Perancah Bekisting Dinding Kaso 5/7 (Padanan Kolom)', G.STRUKTUR, 'm2', 'wall_area * 0.3', ['wall_area'], { price: 68425, level: 'PROFESSIONAL', priceNote: 'Fallback diselaraskan komposisi kanonis perancah kolom (PARTIAL pada resolver).' }),
      comp('beton', 'Beton Dinding Geser fc 15 (Basis) Volume Besar', G.STRUKTUR, 'm3', 'wall_volume', ['wall_volume'], { code: '2.2.1.4.3', price: 1355000, priceNote: 'Mutu aktual dinding geser fc 30–45; selisih mutu dikonfirmasi pada desain struktur.' }),
      comp('selisih', 'Selisih Mutu ke fc 40 + Superplasticizer (per m³)', G.STRUKTUR, 'm3', 'wall_volume', ['wall_volume'], { price: 365000, level: 'PROFESSIONAL', priceNote: 'Referensi selisih mutu beton dinding geser termasuk pompa & retarder.' }),
      comp('besi', 'Penulangan Dinding BjTP ≥ 12 mm (termasuk Shear Wall)', G.STRUKTUR, 'kg', 'wall_volume * 108', ['wall_volume'], { code: '2.2.1.1.4' }),
      comp('besi-ringan', 'Penulangan BjTP < 12 mm (Distribusi & Sengkang)', G.STRUKTUR, 'kg', 'wall_volume * 26', ['wall_volume'], { code: '2.2.1.1.3', level: 'PROFESSIONAL' }),
      comp('waterstop', 'PVC Waterstop 230 mm Sambungan Vertikal Antar Lift', G.STRUKTUR, 'm1', 'num_lifts * 14', ['num_lifts'], { code: '2.2.1.2.4', price: 89825, level: 'COMPREHENSIVE', priceNote: 'Fallback diselaraskan komposisi kanonis waterstop.' }),
      comp('curing', 'Perawatan Beton Dinding (Penggenangan/Penyiraman)', G.STRUKTUR, 'm2', 'wall_area * 0.5', ['wall_area'], { code: '2.2.1.9.1', level: 'COMPREHENSIVE' }),
      comp('embed', 'Pelat Tanam & Sleeve MEP pada Dinding (Pekerjaan Baja Pelat)', G.STRUKTUR, 'kg', 'num_lifts * 46', ['num_lifts'], { code: '2.3.1.4', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk climbing formwork hidrolik (sewa sistem), tower crane, dan struktur lantai (paket terpisah).']
  }),

  tpl({
    id: 'STR-TIMBER-ROOF',
    name: 'Struktur Atap Kayu Kelas I/II Konvensional (Kuda-Kuda Kayu)',
    category: 'STRUKTUR_BETON_BAJA',
    subcategory: 'Atap Kayu',
    description: 'Rangka atap kayu konvensional untuk bangunan heritage, joglo modern, dan vila: kuda-kuda kayu kelas I/II bentang s.d. 6–9 m, gording & usuk, dengan pengawetan. Berbeda dari baja ringan — karakter material alami.',
    badge: 'Kayu',
    icon: 'TreePine',
    parameters: [
      num('roof_area', 'Luas Bidang Atap', 220, { min: 60, max: 1200, unit: 'm²' }),
      num('span', 'Bentang Kuda-Kuda', 7, { min: 4, max: 12, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('kuda', 'Konstruksi Kuda-Kuda Konvensional Kayu Kelas I–III Bentang s.d. 6 m (Basis Volume Kayu)', G.ATAP, 'm3', 'roof_area * 0.028', ['roof_area'], { code: '2.1.2.1', price: 17265490, priceNote: 'Komposisi resolver PARTIAL — harga komposisi kanonis per m³ kayu terpasang dipakai sebagai fallback referensi (termasuk tenaga ahli kayu).' }),
      comp('kuda-ekspose', 'Tambahan Finishing Ekspose Kuda-Kuda Kayu Kelas I (Selisih per m³)', G.ATAP, 'm3', 'roof_area * 0.01', ['roof_area'], { price: 2850000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi selisih kualitas ekspose (perataan, amplas, coating natural) untuk elemen terlihat.' }),
      comp('rangka-genteng-keramik', 'Rangka Atap Genteng Keramik Kayu Kelas II (Usuk & Reng)', G.ATAP, 'm2', 'roof_area', ['roof_area'], { code: '2.1.2.4' }),
      comp('rangka-beton', 'Rangka Atap Genteng Beton Kayu Kelas II (Area Lain)', G.ATAP, 'm2', 'roof_area * 0.3', ['roof_area'], { code: '2.1.2.5', level: 'PROFESSIONAL' }),
      comp('genteng', 'Penutup Atap Genteng Beton', G.ATAP, 'm2', 'roof_area * 0.72', ['roof_area'], { code: '3.1.1.4' }),
      comp('nok', 'Nok/Bubungan Genteng Beton (per m Panjang Bubungan)', G.ATAP, 'm1', 'roof_area / span * 1.35', ['roof_area', 'span'], { price: 152713, level: 'PROFESSIONAL', priceNote: 'Harga diselaraskan item kanonis nok genteng beton (satuan sumber tertulis m2 namun uraian per m bubungan — diperlakukan referensi).' }),
      comp('lisplank', 'Lisplank Kayu 3x30 Kelas I/II', G.ATAP, 'm1', 'roof_area * 0.34', ['roof_area'], { code: '3.3.4', level: 'PROFESSIONAL' }),
      comp('pengawet', 'Pengawetan Kayu Anti Rayap & Jamur (Paket per m² Atap)', G.ATAP, 'm2', 'roof_area', ['roof_area'], { price: 38500, level: 'COMPREHENSIVE', priceNote: 'Referensi aplikasi pengawet rendam/semprot seluruh elemen kayu.' }),
      comp('baut', 'Mur & Baut Sambungan Kuda-Kuda', G.STRUKTUR, 'kg', 'roof_area * 0.22', ['roof_area'], { code: '2.3.1.3', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI, 'Volume kayu kuda-kuda diasumsikan 0,028 m³ per m² bidang atap untuk bentang ≤ 6 m; bentang lebih besar memerlukan desain khusus.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk kayu kelas khusus (ulin/bengkirai solid besar), ukiran tradisional, dan atap sirap kayu.']
  }),

  tpl({
    id: 'STR-SPACE-FRAME',
    name: 'Space Frame & Atap Bentang Besar (Stadion/Hangar/GOR)',
    category: 'STRUKTUR_BETON_BAJA',
    subcategory: 'Space Frame',
    description: 'Sistem atap space frame bola-baja untuk bentang 30–60 m: modul space frame, gording & penutup metal, dengan kolom beton/baja pendukung pada perimeter. Untuk GOR, hangar, terminal, dan aula besar.',
    badge: 'Bentang Besar',
    icon: 'Warehouse',
    parameters: [
      num('roof_area', 'Luas Atap Space Frame', 2400, { min: 600, max: 15000, unit: 'm²' }),
      num('perimeter', 'Keliling Bangunan (Kolom Pendukung)', 200, { min: 80, max: 800, unit: 'm' }),
      num('support_height', 'Tinggi Kolom Pendukung', 9, { min: 5, max: 20, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('kolom-beton', 'Beton Kolom Pendukung Perimeter fc 15 MPa', G.STRUKTUR, 'm3', 'perimeter * support_height * 0.16', ['perimeter', 'support_height'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi-kolom', 'Penulangan Kolom Pendukung BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'perimeter * support_height * 13', ['perimeter', 'support_height'], { code: '2.2.1.1.4' }),
      comp('space-frame', 'Space Frame Bola-Baja Terpasang (Paket per m² Atap)', G.STRUKTUR, 'm2', 'roof_area', ['roof_area'], { price: 895000, priceNote: 'Referensi paket space frame (member, ball joint, ereksi) bentang menengah — harga sangat tergantung bentang & beban; konfirmasi pabrikan.' }),
      comp('gording', 'Gording Baja Profil Siku Las di Atas Space Frame', G.STRUKTUR, 'kg', 'roof_area * 3.4', ['roof_area'], { code: '2.3.1.5', level: 'PROFESSIONAL' }),
      comp('penutup', 'Penutup Atap Aluminium Gelombang', G.ATAP, 'm2', 'roof_area * 1.06', ['roof_area'], { code: '3.1.3.2', level: 'PROFESSIONAL' }),
      comp('insulasi', 'Foam Insulasi Atap Bentang Besar', G.ATAP, 'm2', 'roof_area * 1.06', ['roof_area'], { code: '3.2.3', level: 'COMPREHENSIVE' }),
      comp('talang', 'Talang & Pipa Tegak Air Hujan Perimeter (Pipa Galvanis DN Besar setara)', G.ATAP, 'm1', 'perimeter * 0.8', ['perimeter'], { price: 385000, level: 'COMPREHENSIVE', priceNote: 'Referensi talang baja galvanis besar + downpipe terpasang.' }),
      comp('cat', 'Pengecatan Baja Galvanis Semprot (Kolom & Elemen Baja)', G.FINISHING, 'm2', 'perimeter * support_height * 0.5', ['perimeter', 'support_height'], { code: '3.8.14', level: 'COMPREHENSIVE' }),
      comp('petir', 'Penangkal Petir Atap Bentang Besar', G.ELEKTRIKAL, 'buah', 'Math.ceil(roof_area / 900)', ['roof_area'], { code: 'SMKK.0173', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI, 'Harga space frame bersifat indikatif untuk bentang 30–45 m beban atap ringan; analisis struktur & shop drawing pabrikan menentukan harga final.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk pondasi, dinding pengisi, sistem drainase atap internal kompleks, dan pengujian beban atap.']
  }),

  tpl({
    id: 'STR-RETAINING-RC',
    name: 'Dinding Penahan Tanah Beton Bertulang (Cantilever RC Wall)',
    category: 'STRUKTUR_BETON_BAJA',
    subcategory: 'Retaining Wall RC',
    description: 'Dinding penahan tanah beton bertulang tipe kantilever untuk perbedaan elevasi 2–6 m: pondasi telapak lebar, dinding & tumit, drainase belakang dinding (weep hole & granular), dan urugan kembali terpilih.',
    badge: 'RC Wall',
    icon: 'Shield',
    parameters: [
      num('wall_length', 'Panjang Dinding', 60, { min: 10, max: 1000, unit: 'm' }),
      num('wall_height', 'Tinggi Tanah Ditahan', 3.5, { min: 1.5, max: 7, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Dinding', G.PERSIAPAN, 'm2', 'wall_length * 4.6', ['wall_length'], { code: 'C.37' }),
      comp('galian', 'Galian Pondasi Dinding Tanah Berbatu', G.TANAH, 'm3', 'wall_length * wall_height * 0.75', ['wall_length', 'wall_height'], { code: '1.2.3.1.1' }),
      comp('lantai-kerja', 'Beton Mutu Rendah fc 7,5 Lantai Kerja', G.PONDASI, 'm3', 'wall_length * wall_height * 0.09', ['wall_length', 'wall_height'], { code: '2.2.1.4.1', price: 928002 }),
      comp('beton', 'Beton Dinding & Telapak fc 15 MPa', G.STRUKTUR, 'm3', 'wall_length * (wall_height * 0.32 + wall_height * wall_height * 0.055)', ['wall_length', 'wall_height'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Dinding BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'wall_length * (wall_height * 0.32 + wall_height * wall_height * 0.055) * 88', ['wall_length', 'wall_height'], { code: '2.2.1.1.4' }),
      comp('bekisting', 'Bekisting Dinding (Padanan Bekisting Kolom Multiflex)', G.STRUKTUR, 'm2', 'wall_length * wall_height * 1.85', ['wall_length', 'wall_height'], { code: 'A.1.03.2e.1', price: 44275, level: 'PROFESSIONAL' }),
      comp('waterstop', 'PVC Waterstop 150 mm Sambungan Susut Dinding', G.STRUKTUR, 'm1', 'wall_length * 0.34', ['wall_length'], { code: '2.2.1.2.1', level: 'COMPREHENSIVE' }),
      comp('drainase', 'Drainase Belakang Dinding: Agregat + Geotekstil + Pipa Perforasi (Paket per m)', G.DRAINASE, 'm1', 'wall_length', ['wall_length'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi paket drainase dinding (granular backfill, geotekstil, pipa HDPE perforasi, weep hole).' }),
      comp('urugan', 'Urugan Kembali Pilihan & Pemadatan Belakang Dinding', G.TANAH, 'm3', 'wall_length * wall_height * 0.55', ['wall_length', 'wall_height'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('finishing', 'Finishing Siar/Acian Permukaan Depan Dinding', G.DINDING, 'm2', 'wall_length * wall_height', ['wall_length', 'wall_height'], { code: '3.7.8', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI, 'Geometri penampang mengikuti kaidah praktis (lebar telapak ±0,6 tinggi) — stabilitas geser/guling wajib diverifikasi perhitungan geoteknik.'],
    exclusions: EKSKLUSI
  })
];
