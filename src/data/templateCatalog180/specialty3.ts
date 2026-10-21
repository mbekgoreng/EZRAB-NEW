/**
 * Katalog 180 — RENOVASI_MAINTENANCE (+6), PERTANIAN_PERKEBUNAN (5 baru),
 * FASILITAS_OLAHRAGA (5 baru), DEMOLISI_REKONSTRUKSI (5 baru).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { G, num, comp, tpl } from './builders';

const ASUMSI = [
  'Nilai default parameter adalah asumsi awal berlabel untuk estimasi, bukan data pengukuran lapangan.',
  'Harga resmi hanya untuk komponen berkode AHSP 2026 kanonis yang lolos gerbang resolver; sisanya harga referensi pasar 2026.'
];
const EKSKLUSI = [
  'Tidak termasuk perizinan & pajak daerah yang berlaku untuk pekerjaan renovasi/demolisi.'
];

export const SPECIALTY_TEMPLATES_C: RabTemplate[] = [
  // =======================================================================
  // RENOVASI & MAINTENANCE (+6)
  // =======================================================================
  tpl({
    id: 'RENOV-STRUCTURAL-STRENGTHEN',
    name: 'Perkuatan Struktur Eksisting (Jacketing Beton/Baja & FRP)',
    category: 'RENOVASI_MAINTENANCE',
    subcategory: 'Perkuatan Struktur',
    description: 'Paket perkuatan elemen struktur gedung eksisting: jacketing kolom beton, pelat baja jacketing, dan laminasi FRP balok/pelat, termasuk persiapan permukaan & injeksi retak awal. Berdasarkan hasil asesmen struktur.',
    badge: 'Perkuatan',
    icon: 'ShieldPlus',
    parameters: [
      num('num_columns', 'Jumlah Kolom Diperkuat', 24, { min: 2, max: 300, group: 'specifications' }),
      num('column_height', 'Tinggi Kolom per Lantai', 3.4, { min: 2.6, max: 6, unit: 'm', group: 'specifications' }),
      num('beam_length_frp', 'Panjang Balok Diperkuat FRP', 120, { min: 0, max: 2000, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('bongkar-finish', 'Pembongkaran Finishing & Plester Sekitar Kolom (Pembersihan Kerusakan Cat setara)', G.BONGKAR, 'm2', 'num_columns * column_height * 1.5', ['num_columns', 'column_height'], { code: '1.6.36', price: 11715, priceNote: 'Item kanonis pembersihan permukaan (PARTIAL) dipakai untuk tahap awal; pembongkaran plester berat pada komponen persiapan permukaan.' }),
      comp('prep', 'Persiapan Permukaan Beton (Chipping, Sandblasting Ringan, Primer Bonding)', G.BONGKAR, 'm2', 'num_columns * column_height * 1.6', ['num_columns', 'column_height'], { price: 145000, priceNote: 'Referensi persiapan permukaan perkuatan termasuk bonding agent.' }),
      comp('injeksi-awal', 'Injeksi Epoxy Retak Struktur Awal (Paket per Kolom)', G.STRUKTUR, 'unit', 'num_columns', ['num_columns'], { price: 685000, priceNote: 'Referensi injeksi retak kolom sebelum jacketing.' }),
      comp('beton-jacket', 'Beton Jacketing Kolom fc 15 (Basis) t=10 cm', G.STRUKTUR, 'm3', 'num_columns * column_height * 0.17', ['num_columns', 'column_height'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi-jacket', 'Penulangan Jacketing BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'num_columns * column_height * 14.5', ['num_columns', 'column_height'], { code: '2.2.1.1.4' }),
      comp('bekisting', 'Bekisting Jacketing (Padanan Bekisting Kolom)', G.STRUKTUR, 'm2', 'num_columns * column_height * 1.7', ['num_columns', 'column_height'], { code: 'A.1.03.2e.1', price: 44275, level: 'PROFESSIONAL' }),
      comp('angkur', 'Angkur Kimia & Dowel Penghubung (Pekerjaan Baja Pelat setara per kg Setara)', G.STRUKTUR, 'kg', 'num_columns * 6.5', ['num_columns'], { code: '2.3.1.4', level: 'PROFESSIONAL', priceNote: 'Padanan baja pelat untuk angkur tanam & pelat penghubung jacketing.' }),
      comp('frp', 'Laminasi FRP Balok/Pelat (Paket per m Panjang Balok)', G.STRUKTUR, 'm1', 'beam_length_frp', ['beam_length_frp'], { price: 685000, condition: 'beam_length_frp > 0', level: 'PROFESSIONAL', priceNote: 'Referensi CFRP laminasi termasuk resin & persiapan (lebar strip acuan 10–15 cm).' }),
      comp('finishing', 'Plester & Cat Kembali Elemen Diperkuat', G.FINISHING, 'm2', 'num_columns * column_height * 1.6', ['num_columns', 'column_height'], { code: '3.7.8', level: 'COMPREHENSIVE' }),
      comp('sengkang-eksternal', 'Sengkang Eksternal Baja Profil Tambahan (Opsi Konfinemen)', G.STRUKTUR, 'kg', 'num_columns * 9', ['num_columns'], { code: '2.3.1.5', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI, 'Desain perkuatan wajib berdasarkan laporan asesmen & perhitungan struktur insinyur berlisensi; template menyediakan kuantitas tipikal jacketing 10 cm.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk biaya asesmen struktur & pengujian material (hammer/UPV/core drill), penyanggaan darurat, dan relokasi penghuni.']
  }),

  tpl({
    id: 'RENOV-ROOF-REPLACEMENT',
    name: 'Penggantian Atap Total (Bongkar & Pasang Baru Rumah/Gedung)',
    category: 'RENOVASI_MAINTENANCE',
    subcategory: 'Ganti Atap Total',
    description: 'Penggantian atap menyeluruh bangunan eksisting: bongkar penutup & rangka lama, perkuatan tumpuan, rangka baja ringan baru, penutup metal/genteng, dan lisplank baru. Untuk atap bocor struktural & rangka lapuk.',
    badge: 'Ganti Atap',
    icon: 'Home',
    parameters: [
      num('roof_area', 'Luas Bidang Atap', 180, { min: 50, max: 2000, unit: 'm²' }),
      num('building_perimeter', 'Keliling Bangunan', 56, { min: 20, max: 300, unit: 'm' })
    ],
    components: [
      comp('bongkar-penutup', 'Pembongkaran Penutup Atap Lama & Penurunan Material', G.BONGKAR, 'm2', 'roof_area', ['roof_area'], { price: 38500, priceNote: 'Referensi bongkar atap termasuk penurunan & penumpukan material bekas.' }),
      comp('bongkar-rangka', 'Pembongkaran Rangka & Plafon Rusak Sebagian (Kayu/Baja Ringan Lama)', G.BONGKAR, 'm2', 'roof_area * 0.7', ['roof_area'], { price: 32500, level: 'PROFESSIONAL', priceNote: 'Referensi bongkar rangka atap lama (70% diasumsikan tidak layak pakai ulang).' }),
      comp('proteksi', 'Proteksi Interior & Terpal Darurat Selama Ganti Atap (Paket per m²)', G.PERSIAPAN, 'm2', 'roof_area', ['roof_area'], { price: 18500, priceNote: 'Referensi proteksi hujan sementara & penutup interior.' }),
      comp('rangka-baru', 'Rangka Atap Baja Ringan C75 Baru', G.ATAP, 'm2', 'roof_area', ['roof_area'], { code: '2.1.1.2' }),
      comp('insulasi', 'Insulasi Aluminium Foil Atap Baru', G.ATAP, 'm2', 'roof_area * 1.04', ['roof_area'], { code: '3.2.2', level: 'PROFESSIONAL' }),
      comp('penutup-metal', 'Penutup Atap Zincalume Baru', G.ATAP, 'm2', 'roof_area * 0.72', ['roof_area'], { code: '3.1.3.1' }),
      comp('penutup-genteng', 'Penutup Atap Genteng Beton (Zona Lain)', G.ATAP, 'm2', 'roof_area * 0.28', ['roof_area'], { code: '3.1.1.4', level: 'PROFESSIONAL' }),
      comp('lisplank', 'Lisplank Semen Board Baru Keliling', G.ATAP, 'm1', 'building_perimeter * 1.05', ['building_perimeter'], { code: '3.3.2', level: 'PROFESSIONAL' }),
      comp('talang', 'Talang & Downpipe Baru (Paket per m Keliling)', G.ATAP, 'm1', 'building_perimeter * 0.5', ['building_perimeter'], { price: 225000, level: 'COMPREHENSIVE', priceNote: 'Referensi talang galvalume + downpipe PVC terpasang setengah keliling (sisi buangan).' }),
      comp('buang-puing', 'Pembuangan Puing Atap Lama (Angkut ≤ 10 m Dasar per m³ Puing)', G.BONGKAR, 'm3', 'roof_area * 0.09', ['roof_area'], { code: '1.4.1.1', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk penggantian struktur ring balok/plafon keseluruhan, nilai jual material bekas, dan perbaikan kerusakan interior akibat bocor lama.']
  }),

  tpl({
    id: 'RENOV-BATHROOM-TOTAL',
    name: 'Renovasi Kamar Mandi Total (per Kamar Mandi Hunian/Komersial)',
    category: 'RENOVASI_MAINTENANCE',
    subcategory: 'Renovasi Kamar Mandi',
    description: 'Renovasi kamar mandi menyeluruh per unit: bongkar keramik & saniter lama, perbaikan pipa titik, waterproofing baru, keramik baru, dan saniter baru kelas menengah.',
    badge: 'Renovasi KM',
    icon: 'Bath',
    parameters: [
      num('num_bathrooms', 'Jumlah Kamar Mandi', 2, { min: 1, max: 40, group: 'specifications' }),
      num('bath_area', 'Luas Rata-rata per Kamar Mandi', 4.5, { min: 2.5, max: 15, unit: 'm²', group: 'specifications' })
    ],
    components: [
      comp('bongkar', 'Pembongkaran Keramik & Saniter Lama per Kamar Mandi', G.BONGKAR, 'unit', 'num_bathrooms', ['num_bathrooms'], { price: 1850000, priceNote: 'Referensi bongkar total isi kamar mandi termasuk buang puing dalam tapak.' }),
      comp('wp', 'Waterproofing Coating Baru Lantai & Dinding Basah', G.ATAP, 'm2', 'num_bathrooms * (bath_area + 4.6)', ['num_bathrooms', 'bath_area'], { code: '3.4.2' }),
      comp('lantai', 'Granit Homogen Lantai KM Baru', G.LANTAI, 'm2', 'num_bathrooms * bath_area', ['num_bathrooms', 'bath_area'], { code: '3.10.2.6' }),
      comp('dinding', 'Keramik Dinding KM Baru Sebagian Granit', G.LANTAI, 'm2', 'num_bathrooms * bath_area * 1.5', ['num_bathrooms', 'bath_area'], { code: '3.10.2.9', level: 'PROFESSIONAL' }),
      comp('kloset', 'Kloset Duduk Ekonomi Baru per KM', G.SANITASI, 'buah', 'num_bathrooms', ['num_bathrooms'], { code: '6.4.1.3', price: 2158693, level: 'PROFESSIONAL', priceNote: 'Fallback diselaraskan komposisi kanonis kloset ekonomi.' }),
      comp('wastafel', 'Wastafel Kecil Baru per KM', G.SANITASI, 'buah', 'num_bathrooms', ['num_bathrooms'], { code: '6.4.5.1', level: 'PROFESSIONAL' }),
      comp('shower', 'Shower & Keran Set Baru (Paket per KM)', G.SANITASI, 'unit', 'num_bathrooms', ['num_bathrooms'], { price: 1850000, level: 'PROFESSIONAL', priceNote: 'Referensi shower set standar termasuk keran mixing.' }),
      comp('pipa', 'Perbaikan Pipa Titik Air Bersih & Kotor per KM (Pipa 1/2" setara)', G.SANITASI, 'm1', 'num_bathrooms * 5', ['num_bathrooms'], { code: '6.1.3.1', level: 'COMPREHENSIVE', priceNote: 'Item kanonis pipa 1/2 inci per meter; hanya perbaikan titik, bukan penggantian jaringan total.' }),
      comp('pintu', 'Pintu KM UPVC Baru per KM', G.KUSEN, 'buah', 'num_bathrooms', ['num_bathrooms'], { price: 1650000, level: 'COMPREHENSIVE', priceNote: 'Referensi pintu kamar mandi tahan air terpasang.' }),
      comp('plafon', 'Plafon Gypsum/UPVC KM & Cat Ulang', G.DINDING, 'm2', 'num_bathrooms * bath_area', ['num_bathrooms', 'bath_area'], { code: '3.9.3', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk perubahan layout plumbing besar, pemindahan titik septic, dan saniter premium (paket finishing premium terpisah).']
  }),

  tpl({
    id: 'RENOV-KITCHEN',
    name: 'Renovasi Dapur & Pantry (Hunian & Kantor)',
    category: 'RENOVASI_MAINTENANCE',
    subcategory: 'Renovasi Dapur',
    description: 'Renovasi dapur hunian/pantry kantor: bongkar kitchen lama, perbaikan titik air & listrik dapur, kitchen set baru standar, backsplash, dan lantai area dapur.',
    badge: 'Renovasi Dapur',
    icon: 'ChefHat',
    parameters: [
      num('kitchen_length', 'Panjang Kitchen Set (m)', 4.5, { min: 2, max: 20, unit: 'm', group: 'specifications' }),
      num('kitchen_area', 'Luas Area Dapur', 14, { min: 6, max: 80, unit: 'm²' })
    ],
    components: [
      comp('bongkar', 'Pembongkaran Kitchen Set & Peralatan Lama (Paket)', G.BONGKAR, 'unit', '1', [], { price: 1850000, priceNote: 'Referensi bongkar dapur lama per dapur termasuk buang puing.' }),
      comp('lantai', 'Keramik/Granit Lantai Dapur Baru', G.LANTAI, 'm2', 'kitchen_area', ['kitchen_area'], { code: '3.10.1.4' }),
      comp('wp-zona', 'Waterproofing Coating Zona Basah Dapur', G.ATAP, 'm2', 'kitchen_length * 1.1', ['kitchen_length'], { code: '3.4.2', level: 'PROFESSIONAL' }),
      comp('meja-beton', 'Meja Beton Dapur & Dudukan Sink', G.DINDING, 'm1', 'kitchen_length', ['kitchen_length'], { code: '3.7.10' }),
      comp('kitchen-set', 'Kitchen Set Baru per Meter (Blokboard Finishing Melamin/Duco + Top Granit Lokal)', G.DINDING, 'm1', 'kitchen_length', ['kitchen_length'], { price: 5850000, priceNote: 'Referensi kitchen set menengah per meter lari termasuk kabinet atas proporsional.' }),
      comp('backsplash', 'Backsplash Keramik Subway/Mozaik', G.DINDING, 'm2', 'kitchen_length * 0.6', ['kitchen_length'], { code: '3.10.2.9', level: 'PROFESSIONAL' }),
      comp('sink', 'Sink Dapur Stainless & Keran (Bak Cuci setara Paket)', G.SANITASI, 'unit', '1', [], { price: 2450000, level: 'PROFESSIONAL', priceNote: 'Referensi sink dapur 1–2 bak + keran fleksibel terpasang.' }),
      comp('titik-listrik', 'Titik Listrik Dapur Tambahan (Stop Kontak Peralatan)', G.ELEKTRIKAL, 'titik', '6', [], { code: '5.3.1.24', level: 'COMPREHENSIVE', priceNote: 'Jumlah titik acuan 6 per dapur — sesuaikan kebutuhan peralatan.' }),
      comp('cat', 'Cat Ulang Dinding & Plafon Dapur', G.FINISHING, 'm2', 'kitchen_area * 2.4', ['kitchen_area'], { code: '3.8.10.1', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk peralatan dapur (kompor, oven, hood branded), gas line baru, dan perubahan layout struktur.']
  }),

  tpl({
    id: 'RENOV-HERITAGE-RESTORE',
    name: 'Restorasi Bangunan Cagar Budaya / Heritage',
    category: 'RENOVASI_MAINTENANCE',
    subcategory: 'Restorasi Heritage',
    description: 'Paket restorasi bangunan bersejarah dengan pendekatan konservasi: dokumentasi awal, pembersihan permukaan historis, perbaikan plester kapur, restorasi kusen kayu, atap genteng kodok/sirap, dan cat mineral. Memerlukan pendampingan ahli cagar budaya.',
    badge: 'Heritage',
    icon: 'Landmark',
    parameters: [
      num('building_area', 'Luas Bangunan', 450, { min: 80, max: 3000, unit: 'm²' }),
      num('facade_area', 'Luas Fasad Ditangani', 520, { min: 100, max: 4000, unit: 'm²', group: 'specifications' }),
      num('roof_area', 'Luas Atap Direstorasi', 380, { min: 60, max: 2500, unit: 'm²' })
    ],
    components: [
      comp('dokumen', 'Dokumentasi & Pengukuran Awal (Paket per Bangunan)', G.KHUSUS, 'unit', '1', [], { price: 28500000, priceNote: 'Referensi dokumentasi foto terukur + gambar kondisi eksisting dasar (syarat umum pekerjaan heritage).' }),
      comp('cuci-sedang', 'Pencucian Tembok Lama (Metode Lembut Permukaan Historis)', G.BONGKAR, 'm2', 'facade_area * 0.85', ['facade_area'], { code: '3.8.2', priceNote: 'Item kanonis pencucian tembok; metode akhir (uap/kimia lembut) ditentukan ahli konservasi.' }),
      comp('kupasan-cat', 'Pembersihan Lapisan Cat Rusak Permukaan Historis (Padanan Kerusakan Ringan)', G.BONGKAR, 'm2', 'facade_area * 0.5', ['facade_area'], { code: '1.6.34', priceNote: 'Item kanonis perbaikan kerusakan berat dipakai hati-hati sebagai padanan kupas cat; teknik konservasi dapat berbeda tarif.' }),
      comp('plester-kapur', 'Plester Kapur Tradisional Perbaikan Fasad (Plesteran 1:2 setara)', G.DINDING, 'm2', 'facade_area * 0.4', ['facade_area'], { code: '3.7.7', level: 'PROFESSIONAL', priceNote: 'Komposisi plester kanonis sebagai padanan; adukan kapur autentik disesuaikan resep konservasi.' }),
      comp('kusen', 'Restorasi Kusen & Daun Pintu/Jendela Kayu Lama (Paket per m² Fasad)', G.KUSEN, 'm2', 'facade_area * 0.14', ['facade_area'], { price: 985000, level: 'PROFESSIONAL', priceNote: 'Referensi restorasi elemen kayu (tambal, sambung, konsolidasi) proporsional bukaan fasad.' }),
      comp('atap-kodok', 'Penutup Atap Genteng Kodok Restorasi', G.ATAP, 'm2', 'roof_area * 0.8', ['roof_area'], { code: '3.1.1.1', level: 'PROFESSIONAL' }),
      comp('rangka-kayu', 'Perbaikan Rangka Atap Kayu Kelas II (Bagian Lapuk)', G.ATAP, 'm2', 'roof_area * 0.35', ['roof_area'], { code: '2.1.2.4', level: 'PROFESSIONAL' }),
      comp('lantai-tegel', 'Restorasi Lantai Tegel/Ubin Pola Lama (Paket per m²)', G.LANTAI, 'm2', 'building_area * 0.45', ['building_area'], { price: 485000, level: 'COMPREHENSIVE', priceNote: 'Referensi perbaikan & penggantian sebagian tegel pola termasuk poles ulang.' }),
      comp('cat-mineral', 'Cat Mineral/Kapur Fasad Historis (Cat Tembok Lama setara 2 Lapis)', G.FINISHING, 'm2', 'facade_area * 0.8', ['facade_area'], { code: '3.8.11.2', level: 'COMPREHENSIVE', priceNote: 'Item kanonis cat tembok lama 2 lapis sebagai padanan pengecatan ulang permukaan historis.' }),
      comp('anti-rayap', 'Perlakuan Anti Rayap & Jamur Elemen Kayu (Paket per m² Bangunan)', G.ATAP, 'm2', 'building_area', ['building_area'], { price: 28500, level: 'COMPREHENSIVE', priceNote: 'Referensi perlakuan preventif elemen kayu heritage.' })
    ],
    assumptions: [...ASUMSI, 'Seluruh metode restorasi tunduk pada rekomendasi Tim Ahli Cagar Budaya & izin berjenjang; template ini kerangka estimasi awal, bukan dokumen pelaksanaan.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk biaya kajian heritage & perizinan cagar budaya, replikasi ornamen hilang oleh seniman khusus, dan penguatan struktur besar.']
  }),

  tpl({
    id: 'RENOV-INTERIOR-TOTAL',
    name: 'Renovasi Interior Total (Apartemen/Kantor Eksisting)',
    category: 'RENOVASI_MAINTENANCE',
    subcategory: 'Renovasi Interior',
    description: 'Renovasi interior menyeluruh unit eksisting: bongkar finishing lama, partisi baru, plafon & lantai baru, cat total, dan penggantian pintu. Untuk apartemen, kantor, dan ruang usaha yang berganti penyewa/fungsi.',
    badge: 'Interior Total',
    icon: 'PaintRoller',
    parameters: [
      num('unit_area', 'Luas Unit Direnovasi', 220, { min: 40, max: 2500, unit: 'm²' }),
      num('partition_area', 'Luas Partisi Baru', 95, { min: 0, max: 1500, unit: 'm²', group: 'specifications' })
    ],
    components: [
      comp('bongkar-partisi', 'Pemasangan & Pembongkaran Dinding Partisi Gypsum Lama (Padanan Pembongkaran Setara)', G.BONGKAR, 'm3', 'unit_area * 0.05', ['unit_area'], { code: '2.2.2.1.9', priceNote: 'Item kanonis pasangan batu dipakai terbalik sebagai padanan volume bongkar partisi ringan — metode hitung dinyatakan; tarif bongkar aktual mengikuti kondisi.' }),
      comp('strip-out', 'Strip-Out Finishing Lama (Plafon, Lantai Vinyl/Keramik Sebagian)', G.BONGKAR, 'm2', 'unit_area * 0.92', ['unit_area'], { price: 48500, priceNote: 'Referensi pembongkaran finishing interior termasuk pengumpulan puing dalam unit.' }),
      comp('partisi-baru', 'Partisi Gypsum 1 Muka + Rangka Baru', G.DINDING, 'm2', 'partition_area', ['partition_area'], { code: '3.7.3', condition: 'partition_area > 0' }),
      comp('plafon', 'Plafon Gypsum Baru + Rangka Hollow', G.DINDING, 'm2', 'unit_area * 0.95', ['unit_area'], { code: '3.9.3' }),
      comp('vinyl', 'Lantai Vinyl Sheet Baru', G.LANTAI, 'm2', 'unit_area * 0.7', ['unit_area'], { code: '3.10.4' }),
      comp('keramik', 'Keramik Area Basah & Pantry Baru', G.LANTAI, 'm2', 'unit_area * 0.18', ['unit_area'], { code: '3.10.1.4', level: 'PROFESSIONAL' }),
      comp('cat', 'Cat Interior Total 2 Lapis (Tembok Lama)', G.FINISHING, 'm2', 'unit_area * 1.9', ['unit_area'], { code: '3.8.11.2' }),
      comp('pintu', 'Penggantian Pintu Interior per Unit Ruang', G.KUSEN, 'buah', 'unit_area / 32', ['unit_area'], { code: '3.11.1.2', price: 1983073, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis pintu panil.' }),
      comp('listrik-baru', 'Titik Lampu & Saklar Interior Baru (Instalasi)', G.ELEKTRIKAL, 'titik', 'unit_area / 11', ['unit_area'], { code: '5.3.1.24', level: 'COMPREHENSIVE' }),
      comp('buang', 'Pembuangan Puing Renovasi (Angkut Dasar per m³)', G.BONGKAR, 'm3', 'unit_area * 0.07', ['unit_area'], { code: '1.4.1.1', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk pekerjaan struktur & fasad, kitchen/bathroom set baru (template renovasi dapur/KM), dan furniture.']
  }),

  // =======================================================================
  // PERTANIAN & PERKEBUNAN (5)
  // =======================================================================
  tpl({
    id: 'AGR-GREENHOUSE',
    name: 'Greenhouse Hidroponik Komersial (Rangka Galvanis + Plastik UV)',
    category: 'PERTANIAN_PERKEBUNAN',
    subcategory: 'Greenhouse',
    description: 'Pembangunan greenhouse hidroponik komersial: pondasi titik & lantai kerja, rangka galvanis lengkung, penutup plastik UV + insect net, sistem hidroponik NFT dasar, dan tangki nutrisi.',
    badge: 'Greenhouse',
    icon: 'Sprout',
    parameters: [
      num('greenhouse_area', 'Luas Greenhouse', 512, { min: 96, max: 5000, unit: 'm²' }),
      num('num_beds', 'Jumlah Meja/Rak Tanam NFT', 40, { min: 6, max: 400, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Greenhouse', G.PERSIAPAN, 'm2', 'greenhouse_area * 1.2', ['greenhouse_area'], { code: 'A.1.01.a.1' }),
      comp('perataan', 'Pengolahan & Perataan Tanah Lantai Greenhouse', G.TANAH, 'm2', 'greenhouse_area', ['greenhouse_area'], { code: '4.1.8.1', price: 29500 }),
      comp('pondasi-titik', 'Pondasi Batu Belah Titik Kolom Greenhouse (Mortar M)', G.PONDASI, 'm3', 'greenhouse_area * 0.045', ['greenhouse_area'], { code: '2.2.2.1.4' }),
      comp('rangka', 'Rangka Galvanis Greenhouse Terpasang (Paket per m²)', G.STRUKTUR, 'm2', 'greenhouse_area', ['greenhouse_area'], { price: 485000, priceNote: 'Referensi rangka pipa galvanis lengkung + gording + bracing terpasang.' }),
      comp('plastik-uv', 'Penutup Plastik UV + Insect Net (Paket per m² Permukaan)', G.ATAP, 'm2', 'greenhouse_area * 1.35', ['greenhouse_area'], { price: 125000, priceNote: 'Referensi plastik UV 200 mikron + net 40 mesh terpasang (permukaan lengkung ±1,35x luas lantai).' }),
      comp('lantai-kerja', 'Lantai Kerja Beton Tipis Gang Utama (Pasangan setara Lantai Beton 5 cm)', G.LANTAI, 'm2', 'greenhouse_area * 0.3', ['greenhouse_area'], { code: '3.10.10' }),
      comp('nft', 'Instalasi Hidroponik NFT per Meja Tanam (Gully, Pipa, Pompa Kecil)', G.SANITASI, 'unit', 'num_beds', ['num_beds'], { price: 2850000, level: 'PROFESSIONAL', priceNote: 'Referensi paket NFT per meja termasuk gully & distribusi nutrisi.' }),
      comp('tangki-nutrisi', 'Tangki Nutrisi & Air Baku Fiberglass', G.SANITASI, 'buah', '2', [], { code: '6.1.1.1', level: 'PROFESSIONAL', priceNote: 'Jumlah acuan 2 tangki (nutrisi + air baku) per greenhouse standar.' }),
      comp('pompa', 'Pompa Sirkulasi Nutrisi Submersible 100 LPM', G.MEKANIKAL, 'unit', '2', [], { code: '6.2.2.3', level: 'COMPREHENSIVE' }),
      comp('shading', 'Paranet/Shading Tambahan Atap (Paket per m²)', G.ATAP, 'm2', 'greenhouse_area * 0.8', ['greenhouse_area'], { price: 38500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi paranet 55–65% terpasang untuk tanaman sensitif panas.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk benih & nutrisi operasional, pendingin evaporative pad & fan skala besar, dan instalasi listrik utama kebun.']
  }),

  tpl({
    id: 'AGR-DRIP-IRRIGATION',
    name: 'Irigasi Tetes Perkebunan (Drip Irrigation per Hektar)',
    category: 'PERTANIAN_PERKEBUNAN',
    subcategory: 'Irigasi Tetes',
    description: 'Sistem irigasi tetes perkebunan buah/sayur skala hektar: sumber air & pompa, filter & fertigation dasar, pipa utama & lateral drip line, dan emiter per pohon/barisan.',
    badge: 'Drip Irrigation',
    icon: 'Droplets',
    parameters: [
      num('farm_area_ha', 'Luas Lahan Teririgasi (ha)', 5, { min: 0.5, max: 100, unit: 'ha', group: 'specifications' }),
      num('row_spacing', 'Jarak Antar Baris Lateral', 1.6, { min: 0.6, max: 4, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('survey', 'Pengolahan Tanah Awal Jalur Pipa & Stasiun Pompa', G.TANAH, 'm2', 'farm_area_ha * 220', ['farm_area_ha'], { code: '4.1.8.2', price: 30345, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis pengolahan tanah.' }),
      comp('pipa-utama', 'Pipa Utama & Sub-Utama HDPE Terkubur (Paket per ha)', G.SANITASI, 'unit', 'farm_area_ha', ['farm_area_ha'], { price: 18500000, priceNote: 'Referensi jaringan pipa utama per hektar termasuk galian parit & fiting utama.' }),
      comp('drip-line', 'Drip Line Lateral per Meter', G.SANITASI, 'm1', 'farm_area_ha * 10000 / row_spacing', ['farm_area_ha', 'row_spacing'], { price: 8500, priceNote: 'Referensi drip line 16 mm emitter terpasang termasuk konektor baris.' }),
      comp('filter', 'Stasiun Filter & Fertigasi Dasar (Paket per Sistem)', G.MEKANIKAL, 'unit', 'Math.ceil(farm_area_ha / 8)', ['farm_area_ha'], { price: 38500000, level: 'PROFESSIONAL', priceNote: 'Referensi filter disc/screen + venturi fertigasi + pressure regulator per blok ±8 ha.' }),
      comp('pompa', 'Pompa Sentrifugal Irigasi 500 LPM per Blok', G.MEKANIKAL, 'unit', 'Math.ceil(farm_area_ha / 8)', ['farm_area_ha'], { code: '6.2.2.4', level: 'PROFESSIONAL' }),
      comp('tangki', 'Tangki Penampung Air Irigasi Fiberglass per Blok', G.SANITASI, 'buah', 'Math.ceil(farm_area_ha / 4)', ['farm_area_ha'], { code: '6.1.1.1', level: 'COMPREHENSIVE' }),
      comp('katup', 'Katup Blok & Air Valve (Paket per ha)', G.SANITASI, 'unit', 'farm_area_ha', ['farm_area_ha'], { price: 2850000, level: 'COMPREHENSIVE', priceNote: 'Referensi katup blok manual + air release per hektar.' })
    ],
    assumptions: [...ASUMSI, 'Kebutuhan debit & tekanan dihitung dari topografi & jarak sumber air; template mengasumsikan sumber air tersedia di tepi lahan.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk sumur bor & sumber air (template utilitas), penanaman, dan otomatisasi berbasis sensor tanah penuh.']
  }),

  tpl({
    id: 'AGR-FARM-ROAD',
    name: 'Jalan Usaha Tani & Akses Kebun (Sirtu + Gorong + Jembatan Kecil)',
    category: 'PERTANIAN_PERKEBUNAN',
    subcategory: 'Jalan Kebun',
    description: 'Jalan akses kebun/usaha tani: pembentukan badan jalan tanah, lapis sirtu padat, gorong-gorong lintasan parit, dan jembatan kayu/beton kecil titik kritis. Untuk panen & angkutan hasil.',
    badge: 'Jalan Tani',
    icon: 'Tractor',
    parameters: [
      num('road_length', 'Panjang Jalan Kebun', 2200, { min: 300, max: 20000, unit: 'm' }),
      num('road_width', 'Lebar Jalan', 4, { min: 3, max: 6, unit: 'm' }),
      num('num_crossings', 'Jumlah Lintasan Parit/Sungai Kecil', 5, { min: 0, max: 40, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Jalan Kebun', G.PERSIAPAN, 'm2', 'road_length * (road_width + 2)', ['road_length', 'road_width'], { code: 'C.37' }),
      comp('galian-parit', 'Galian Parit Samping Jalan (Tanah Biasa)', G.DRAINASE, 'm3', 'road_length * 0.55', ['road_length'], { code: '1.2.1.1.3' }),
      comp('timbun', 'Timbunan Pilihan Badan Jalan Rendah (Urugan Liat setara)', G.TANAH, 'm3', 'road_length * road_width * 0.22', ['road_length', 'road_width'], { code: '1.3.1.5', price: 262900 }),
      comp('sirtu', 'Lapis Sirtu/Agregat Jalan Kebun t=15 cm Terhampar Padat', G.PERKERASAN, 'm3', 'road_length * road_width * 0.15', ['road_length', 'road_width'], { price: 285000, priceNote: 'Referensi sirtu lokal terhampar & dipadatkan (sumber material dekat kebun).' }),
      comp('padat', 'Pemadatan Badan Jalan (Pengolahan Tanah setara Pemadatan Mekanis)', G.TANAH, 'm2', 'road_length * road_width', ['road_length', 'road_width'], { code: '4.1.8.1', price: 29500, level: 'PROFESSIONAL', priceNote: 'Item kanonis pengolahan tanah dipakai padanan perataan+padat permukaan jalan tanah.' }),
      comp('gorong', 'Gorong-gorong Pipa Beton dia. 60–80 Lintasan Parit', G.DRAINASE, 'unit', 'num_crossings', ['num_crossings'], { price: 4850000, condition: 'num_crossings > 0', level: 'PROFESSIONAL', priceNote: 'Referensi gorong pipa beton + headwall batu sederhana per lintasan.' }),
      comp('jembatan', 'Jembatan Kebun Kecil Beton/Baja Bentang 4–6 m (Paket per Unit)', G.STRUKTUR, 'unit', 'Math.ceil(num_crossings / 3)', ['num_crossings'], { price: 38500000, condition: 'num_crossings > 0', level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi jembatan kebun sederhana untuk lintasan sungai kecil terpilih.' }),
      comp('rambu', 'Patok & Rambu Jalan Kebun (Pekerjaan Galian Tiang setara Paket Kecil)', G.PERSIAPAN, 'unit', 'road_length / 250', ['road_length'], { price: 385000, level: 'COMPREHENSIVE', priceNote: 'Referensi patok kilometer & rambu sederhana jalan kebun.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk pembebasan lahan, pengerasan aspal/beton, dan jembatan bentang > 6 m (perhitungan khusus).']
  }),

  tpl({
    id: 'AGR-LIVESTOCK-BARN',
    name: 'Kandang Ternak Modern Terbuka (Sapi/Kambing) + Lantai & Drainase',
    category: 'PERTANIAN_PERKEBUNAN',
    subcategory: 'Kandang Ternak',
    description: 'Pembangunan kandang ternak terbuka modern: struktur kolom & atap metal, lantai beton miring dengan drainase limbah, pagar pembatas kandang, dan tempat pakan/minum. Untuk penggemukan sapi/kambing kelompok tani.',
    badge: 'Kandang Modern',
    icon: 'Beef',
    parameters: [
      num('barn_area', 'Luas Kandang', 320, { min: 100, max: 2000, unit: 'm²' }),
      num('num_animals', 'Kapasitas Ternak (Ekor Sapi Setara)', 60, { min: 10, max: 500, unit: 'ekor', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Kandang', G.PERSIAPAN, 'm2', 'barn_area * 1.3', ['barn_area'], { code: 'A.1.01.a.1' }),
      comp('pondasi', 'Pondasi Batu Belah Kolom & Sloof Kandang', G.PONDASI, 'm3', 'barn_area * 0.09', ['barn_area'], { code: '2.2.2.1.4' }),
      comp('kolom-beton', 'Beton Kolom & Balok Kandang fc 15 MPa', G.STRUKTUR, 'm3', 'barn_area * 0.05', ['barn_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('rangka-atap', 'Rangka Atap Seng Baja Ringan Kandang', G.ATAP, 'm2', 'barn_area * 1.15', ['barn_area'], { code: '2.1.1.1' }),
      comp('atap', 'Penutup Atap Spandek Kandang', G.ATAP, 'm2', 'barn_area * 1.18', ['barn_area'], { code: 'G.190', price: 215375 }),
      comp('lantai', 'Lantai Beton Kandang Miring Drainase (Pasangan Lantai Beton 5 cm + Screed)', G.LANTAI, 'm2', 'barn_area * 0.92', ['barn_area'], { code: '3.10.10' }),
      comp('drain-limbah', 'Saluran Drainase Limbah Kandang (Pemasangan U-Ditch Kecil Sebagian)', G.DRAINASE, 'm1', 'barn_area * 0.24', ['barn_area'], { code: '8.1.1.1', price: 465000, level: 'PROFESSIONAL' }),
      comp('pagar-kandang', 'Pagar Pembatas Kandang Besi Pipa & Kayu (Paket per m)', G.DINDING, 'm1', 'barn_area * 0.42', ['barn_area'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi pagar kandang pipa galvanis + rel kayu per meter.' }),
      comp('pakan', 'Tempat Pakan & Minum Beton Sepanjang Kandang (Meja Beton setara)', G.DINDING, 'm1', 'barn_area * 0.3', ['barn_area'], { code: '3.7.10', level: 'COMPREHENSIVE' }),
      comp('penampungan', 'Bak Penampungan Limbah & Kompos (Bak Kontrol Besar setara)', G.DRAINASE, 'buah', 'num_animals / 30', ['num_animals'], { code: '6.3.1', level: 'COMPREHENSIVE', priceNote: 'Padanan bak kontrol; bak limbah beton penuh dihitung desain peternakan.' }),
      comp('listrik', 'Titik Lampu & Daya Kandang (Instalasi)', G.ELEKTRIKAL, 'titik', 'barn_area / 45', ['barn_area'], { code: '5.3.1.24', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk ternak & pakan, biogas digester, dan perizinan lingkungan peternakan.']
  }),

  tpl({
    id: 'AGR-POSTHARVEST',
    name: 'Fasilitas Pascapanen: Gudang Hasil, Lantai Jemur & Cold Room Kecil',
    category: 'PERTANIAN_PERKEBUNAN',
    subcategory: 'Pascapanen',
    description: 'Fasilitas pascapanen kelompok tani/koperasi: gudang hasil rangka baja ringan-bata, lantai jemur beton luas, dan ruang sortir. Untuk gabah, kopi, kakao, dan hasil kebun kering.',
    badge: 'Pascapanen',
    icon: 'Package',
    parameters: [
      num('warehouse_area', 'Luas Gudang Hasil', 240, { min: 60, max: 1500, unit: 'm²' }),
      num('drying_area', 'Luas Lantai Jemur', 600, { min: 100, max: 5000, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak Fasilitas', G.PERSIAPAN, 'm2', '(warehouse_area + drying_area) * 1.15', ['warehouse_area', 'drying_area'], { code: 'A.1.01.a.1' }),
      comp('pondasi', 'Pondasi Batu Belah Gudang Mortar M', G.PONDASI, 'm3', 'warehouse_area * 0.12', ['warehouse_area'], { code: '2.2.2.1.4' }),
      comp('lantai-gudang', 'Lantai Beton Gudang 5 cm + Plester Keras', G.LANTAI, 'm2', 'warehouse_area', ['warehouse_area'], { code: '3.10.10' }),
      comp('dinding', 'Dinding Bata Gudang Plester 2 Muka', G.DINDING, 'm2', 'warehouse_area * 0.62', ['warehouse_area'], { code: '3.7.1', price: 260714 }),
      comp('rangka-atap', 'Rangka Atap Baja Ringan Gudang', G.ATAP, 'm2', 'warehouse_area * 1.12', ['warehouse_area'], { code: '2.1.1.2' }),
      comp('atap', 'Penutup Atap Spandek Gudang', G.ATAP, 'm2', 'warehouse_area * 1.14', ['warehouse_area'], { code: 'G.190', price: 215375 }),
      comp('lantai-jemur', 'Lantai Jemur Beton (Pelat 10 cm setara Beton fc 10 MPa)', G.PERKERASAN, 'm3', 'drying_area * 0.1', ['drying_area'], { code: '2.2.1.4.2', price: 1125500 }),
      comp('drain-jemur', 'Drainase Keliling Lantai Jemur (Bak Kontrol & Saluran Kecil)', G.DRAINASE, 'buah', 'drying_area / 150', ['drying_area'], { code: '6.3.1', level: 'COMPREHENSIVE' }),
      comp('pintu-gudang', 'Pintu Geser Baja Gudang (Paket per Unit)', G.KUSEN, 'unit', '2', [], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi pintu geser plat baja gudang hasil (jumlah acuan 2).' }),
      comp('ventilasi', 'Ventilasi Gudang & Turbin Ventilator Atap (Paket per Unit Gudang)', G.MEKANIKAL, 'unit', 'Math.ceil(warehouse_area / 120)', ['warehouse_area'], { price: 2850000, level: 'COMPREHENSIVE', priceNote: 'Referensi turbine ventilator atap gudang hasil per unit zona.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk mesin pengering (dryer), cold storage aktif (template industri cold storage), dan timbangan truk.']
  }),

  // =======================================================================
  // FASILITAS OLAHRAGA (5)
  // =======================================================================
  tpl({
    id: 'SPT-FUTSAL-COURT',
    name: 'Lapangan Futsal (Indoor/Outdoor) — Perkerasan & Permukaan Sintetis',
    category: 'FASILITAS_OLAHRAGA',
    subcategory: 'Futsal',
    description: 'Pembangunan lapangan futsal standar 25x15 s.d. 42x25: perkerasan dasar, permukaan interlock/vinyl/rumput sintetis, jaring pengaman, dan pencahayaan lapangan malam.',
    badge: 'Futsal',
    icon: 'Goal',
    parameters: [
      num('court_length', 'Panjang Lapangan', 38, { min: 25, max: 45, unit: 'm' }),
      num('court_width', 'Lebar Lapangan', 20, { min: 15, max: 28, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak Lapangan', G.PERSIAPAN, 'm2', 'court_length * court_width * 1.25', ['court_length', 'court_width'], { code: 'C.37' }),
      comp('grading', 'Pembentukan & Pemadatan Tanah Dasar Lapangan (Pengolahan Tanah)', G.TANAH, 'm2', 'court_length * court_width * 1.1', ['court_length', 'court_width'], { code: '4.1.8.1', price: 29500 }),
      comp('base', 'Lapis Pondasi Agregat Bawah Lapangan', G.PERKERASAN, 'm3', 'court_length * court_width * 0.14', ['court_length', 'court_width'], { price: 325000 }),
      comp('pelat', 'Pelat Beton Dasar Lapangan K-175 (Beton fc 15 setara)', G.PERKERASAN, 'm3', 'court_length * court_width * 0.1', ['court_length', 'court_width'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('wiremesh', 'Wiremesh Pelat Lapangan', G.PERKERASAN, 'kg', 'court_length * court_width * 3.1', ['court_length', 'court_width'], { code: '2.2.1.1.5', level: 'PROFESSIONAL' }),
      comp('permukaan', 'Permukaan Sintetis Futsal (Interlock/Vinyl Sport) per m²', G.LANTAI, 'm2', 'court_length * court_width', ['court_length', 'court_width'], { price: 325000, priceNote: 'Referensi permukaan sport interlock PP / vinyl terpasang termasuk marking garis.' }),
      comp('jaring', 'Jaring Pengaman Keliling & Atas (Paket per m Keliling)', G.DINDING, 'm1', '(court_length + court_width) * 2', ['court_length', 'court_width'], { price: 185000, level: 'PROFESSIONAL', priceNote: 'Referensi jaring pengaman PE + tiang pipa terpasang tinggi 4–6 m.' }),
      comp('gawang', 'Gawang Futsal & Jaring (Paket 1 Pasang)', G.KHUSUS, 'unit', '1', [], { price: 6850000, level: 'COMPREHENSIVE', priceNote: 'Referensi gawang futsal standar sepasang.' }),
      comp('lampu', 'Penerangan Lapangan (Titik Sorot Lapangan Indoor setara)', G.ELEKTRIKAL, 'titik', '(court_length * court_width) / 95', ['court_length', 'court_width'], { code: '5.3.1.9', level: 'PROFESSIONAL' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk bangunan pendukung (tribun, toilet, kafe), atap indoor penuh (struktur terpisah), dan skor elektronik.']
  }),

  tpl({
    id: 'SPT-MULTICOURT',
    name: 'Lapangan Basket & Tenis Outdoor (Beton + Coating Akrilik)',
    category: 'FASILITAS_OLAHRAGA',
    subcategory: 'Basket & Tenis',
    description: 'Lapangan olahraga outdoor multifungsi: pelat beton lapangan, coating akrilik warna, ring basket & net tenis, pagar keliling lapangan, dan penerangan malam dasar.',
    badge: 'Multi Court',
    icon: 'Trophy',
    parameters: [
      num('court_area', 'Luas Total Lapangan', 1120, { min: 420, max: 3000, unit: 'm²' }),
      num('num_courts', 'Jumlah Lapangan', 2, { min: 1, max: 8, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak', G.PERSIAPAN, 'm2', 'court_area * 1.2', ['court_area'], { code: 'C.37' }),
      comp('base', 'Lapis Pondasi Agregat Lapangan', G.PERKERASAN, 'm3', 'court_area * 0.13', ['court_area'], { price: 325000 }),
      comp('pelat', 'Pelat Beton Lapangan (Beton fc 15 setara)', G.PERKERASAN, 'm3', 'court_area * 0.1', ['court_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('coating', 'Coating Akrilik Lapangan + Garis (Paket per m²)', G.LANTAI, 'm2', 'court_area', ['court_area'], { price: 165000, priceNote: 'Referensi sistem coating akrilik sport 3–5 lapis termasuk garis lapangan.' }),
      comp('ring-net', 'Ring Basket & Tiang Net Tenis per Lapangan (Paket)', G.KHUSUS, 'unit', 'num_courts', ['num_courts'], { price: 18500000, level: 'PROFESSIONAL', priceNote: 'Referensi paket peralatan lapangan per court (ring kompetisi lokal / tiang net + net).' }),
      comp('pagar', 'Pagar Lapangan Chainlink & Tiang (Paket per m Keliling)', G.DINDING, 'm1', 'court_area * 0.145', ['court_area'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi pagar kawat harmonika tinggi 3–4 m terpasang (keliling diturunkan proporsional luas).' }),
      comp('drain', 'Drainase Tepi Lapangan (Bak Kontrol Kecil)', G.DRAINASE, 'buah', 'court_area / 280', ['court_area'], { code: '6.3.1', level: 'COMPREHENSIVE' }),
      comp('lampu', 'Penerangan Lapangan Malam (Titik Sorot)', G.ELEKTRIKAL, 'titik', 'num_courts * 4', ['num_courts'], { code: '5.3.1.9', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk tribun penonton, atap lapangan, dan permukaan kayu indoor gymnasium.']
  }),

  tpl({
    id: 'SPT-FOOTBALL-FIELD',
    name: 'Lapangan Sepak Bola Rumput Alami + Drainase Subsurface',
    category: 'FASILITAS_OLAHRAGA',
    subcategory: 'Sepak Bola',
    description: 'Pembangunan/renovasi lapangan sepak bola standar: pembentukan profil lapangan, drainase bawah permukaan pipa perforasi, lapisan pasir-akar, dan penanaman rumput zoysia/bermuda termasuk pemeliharaan awal.',
    badge: 'Sepak Bola',
    icon: 'Volleyball',
    parameters: [
      num('field_length', 'Panjang Lapangan (termasuk Run-Off)', 110, { min: 95, max: 130, unit: 'm' }),
      num('field_width', 'Lebar Lapangan (termasuk Run-Off)', 72, { min: 60, max: 90, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lapangan Lama/Tapak', G.PERSIAPAN, 'm2', 'field_length * field_width', ['field_length', 'field_width'], { code: 'A.1.01.a.1' }),
      comp('grading', 'Pembentukan Profil Crown Lapangan (Pengolahan Tanah Mekanis)', G.TANAH, 'm2', 'field_length * field_width', ['field_length', 'field_width'], { code: '4.1.8.1', price: 29500 }),
      comp('drain-pipa', 'Pipa Drainase Perforasi Bawah Lapangan (Paket per m)', G.DRAINASE, 'm1', 'field_length * field_width / 5.2', ['field_length', 'field_width'], { price: 125000, priceNote: 'Referensi pipa perforasi HDPE + kerikil filter terpasang pola herringbone (jarak ±5 m).' }),
      comp('drain-utama', 'Saluran Utama Keliling & Outlet (Bak Kontrol setara per Titik Buang)', G.DRAINASE, 'buah', 'field_length / 18', ['field_length'], { code: '6.3.1', level: 'PROFESSIONAL', priceNote: 'Padanan bak kontrol untuk titik outlet drainase keliling.' }),
      comp('lapis-pasir', 'Lapisan Pasir Akar (Rootzone) 15 cm Terhampar Rata Laser', G.LANSKAP, 'm3', 'field_length * field_width * 0.15', ['field_length', 'field_width'], { price: 385000, priceNote: 'Referensi rootzone pasir medium tercuci termasuk perataan laser.' }),
      comp('rumput', 'Penanaman Rumput Lapangan (Stolon Zoysia/Bermuda) per m²', G.LANSKAP, 'm2', 'field_length * field_width', ['field_length', 'field_width'], { price: 68500, priceNote: 'Referensi penanaman stolon + topdress awal.' }),
      comp('siram-awal', 'Penyiraman Pemeliharaan Awal Lapangan (Siram Pohon/Taman setara Proporsional)', G.LANSKAP, 'm2', 'field_length * field_width * 0.5', ['field_length', 'field_width'], { code: '4.1.11.1', price: 1184, level: 'COMPREHENSIVE', priceNote: 'Item kanonis penyiraman dipakai proporsional masa tumbuh awal.' }),
      comp('sprinkler', 'Sprinkler Pop-Up Kepala Besar Lapangan (Zona Siram per Titik)', G.LANSKAP, 'titik', 'field_length * field_width / 420', ['field_length', 'field_width'], { code: '4.2.1.2', level: 'COMPREHENSIVE', priceNote: 'Item siram sprinkler kanonis sebagai padanan titik sprinkler lapangan.' }),
      comp('garis-gawang', 'Garis Lapangan, Gawang & Bendera Sudut (Paket)', G.KHUSUS, 'unit', '1', [], { price: 28500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi paket gawang aluminium standar + pengecatan garis awal.' })
    ],
    assumptions: [...ASUMSI, 'Ukuran acuan lapangan 105x68 m + run-off; standar kompetisi profesional memerlukan sertifikasi & sistem drainase lebih rinci.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk tribun & bangunan stadion, lampu sorot standar siaran, dan rumput sintetis FIFA (paket berbeda).']
  }),

  tpl({
    id: 'SPT-SWIMMING-POOL',
    name: 'Kolam Renang Publik/Klub (25 m) — Sipil, Finishing & Sirkulasi Dasar',
    category: 'FASILITAS_OLAHRAGA',
    subcategory: 'Kolam Renang',
    description: 'Pembangunan kolam renang 25 m publik/klub: galian, struktur beton kedap, waterproofing, keramik kolam, gutter overflow, dan ruang pompa + filtrasi dasar. Berbeda dari kolam resort (fungsi olahraga/publik).',
    badge: 'Kolam 25 m',
    icon: 'Waves',
    parameters: [
      num('pool_length', 'Panjang Kolam', 25, { min: 16, max: 50, unit: 'm' }),
      num('pool_width', 'Lebar Kolam', 12.5, { min: 8, max: 25, unit: 'm' }),
      num('pool_depth', 'Kedalaman Rata-rata', 1.5, { min: 1.1, max: 2.5, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Tapak Kolam', G.PERSIAPAN, 'm2', 'pool_length * pool_width * 1.5', ['pool_length', 'pool_width'], { code: 'C.37' }),
      comp('galian', 'Galian Kolam Tanah Berbatu', G.TANAH, 'm3', 'pool_length * pool_width * (pool_depth + 0.4)', ['pool_length', 'pool_width', 'pool_depth'], { code: '1.2.3.1.1' }),
      comp('lantai-kerja', 'Beton Mutu Rendah Dasar Kolam', G.PONDASI, 'm3', 'pool_length * pool_width * 0.07', ['pool_length', 'pool_width'], { code: '2.2.1.4.1', price: 928002 }),
      comp('struktur', 'Beton Kedap Air Struktur Kolam (Aditif)', G.STRUKTUR, 'm3', 'pool_length * pool_width * 0.22 + (pool_length + pool_width) * 2 * pool_depth * 0.2', ['pool_length', 'pool_width', 'pool_depth'], { code: '2.2.1.5.11', price: 1565000 }),
      comp('besi', 'Penulangan Struktur Kolam BjTP ≥ 12 mm', G.STRUKTUR, 'kg', '(pool_length * pool_width * 0.22 + (pool_length + pool_width) * 2 * pool_depth * 0.2) * 98', ['pool_length', 'pool_width', 'pool_depth'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('wp', 'Waterproofing Coating Dinding & Lantai Kolam', G.ATAP, 'm2', 'pool_length * pool_width + (pool_length + pool_width) * 2 * pool_depth', ['pool_length', 'pool_width', 'pool_depth'], { code: '3.4.2', level: 'PROFESSIONAL' }),
      comp('keramik', 'Keramik Kolam & Waterline (Pemasangan Keramik Dinding setara Paket Kolam)', G.LANTAI, 'm2', 'pool_length * pool_width + (pool_length + pool_width) * 2 * pool_depth', ['pool_length', 'pool_width', 'pool_depth'], { price: 385000, priceNote: 'Referensi keramik kolam anti-slip terpasang termasuk nat khusus.' }),
      comp('dek', 'Dek Kolam Batu Alam & Anti-Slip', G.LANSKAP, 'm2', '(pool_length + pool_width) * 2 * 1.6', ['pool_length', 'pool_width'], { code: '3.7.14', level: 'PROFESSIONAL' }),
      comp('filtrasi', 'Ruang Pompa, Filter Pasir & Pompa Sirkulasi (Paket Sistem Dasar)', G.MEKANIKAL, 'unit', '1', [], { price: 185000000, level: 'PROFESSIONAL', priceNote: 'Referensi sistem sirkulasi kolam 25 m (filter pasir, pompa, pipa) — kapasitas final oleh spesialis kolam.' }),
      comp('pompa-isi', 'Pompa Submersible Pengisian/Kuras Kolam 100 LPM (Cadangan)', G.MEKANIKAL, 'unit', '1', [], { code: '6.2.2.3', level: 'COMPREHENSIVE' }),
      comp('tangga-blok', 'Tangga Kolam, Blok Start & Garis Lintasan (Paket)', G.KHUSUS, 'unit', '1', [], { price: 38500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi tangga stainless + starting block sederhana + lane rope.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk bangunan pendukung (locker, tribun, kafe), pemanas kolam, dan sertifikasi kolam kompetisi resmi.']
  }),

  tpl({
    id: 'SPT-JOGGING-TRACK',
    name: 'Lintasan Lari & Jogging Track (Karet/EPDM + Drainase)',
    category: 'FASILITAS_OLAHRAGA',
    subcategory: 'Jogging Track',
    description: 'Pembangunan lintasan lari/jogging track taman & stadion mini: perkerasan dasar aspal/beton, lapisan karet EPDM, drainase keliling, dan marka lintasan.',
    badge: 'Running Track',
    icon: 'Footprints',
    parameters: [
      num('track_length', 'Panjang Lintasan (Loop)', 400, { min: 150, max: 1200, unit: 'm' }),
      num('track_width', 'Lebar Lintasan', 3, { min: 1.2, max: 9.3, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Lintasan', G.PERSIAPAN, 'm2', 'track_length * (track_width + 1.4)', ['track_length', 'track_width'], { code: 'C.37' }),
      comp('base', 'Lapis Pondasi Agregat & Pemadatan Jalur (Pengolahan Tanah)', G.PERKERASAN, 'm2', 'track_length * track_width', ['track_length', 'track_width'], { code: '4.1.8.1', price: 29500 }),
      comp('aspal-dasar', 'Lapis Aspal Dasar Lintasan (Prime & Tack Coat setara Paket Dasar)', G.PERKERASAN, 'm2', 'track_length * track_width', ['track_length', 'track_width'], { price: 145000, priceNote: 'Referensi lapis dasar aspal/ATB tipis lintasan termasuk prime coat.' }),
      comp('epdm', 'Lapisan Karet EPDM/SBR Lintasan (Paket per m²)', G.LANTAI, 'm2', 'track_length * track_width', ['track_length', 'track_width'], { price: 485000, priceNote: 'Referensi sistem karet lapangan lari 13 mm terpasang termasuk sealer & marka dasar.' }),
      comp('marka', 'Pengecatan Garis Lintasan (Cat Jalan setara per m Garis)', G.FINISHING, 'm1', 'track_length * (track_width / 1.22)', ['track_length', 'track_width'], { price: 28500, level: 'PROFESSIONAL', priceNote: 'Referensi garis lintasan per lajur (lebar lajur standar 1,22 m).' }),
      comp('drain', 'Drainase Keliling Lintasan (Pemasangan Saluran Kecil Sebagian U-Ditch)', G.DRAINASE, 'm1', 'track_length * 0.85', ['track_length'], { code: '8.1.1.1', price: 465000, level: 'PROFESSIONAL' }),
      comp('kanstin', 'Kanstin & Tepi Beton Lintasan (Meja Beton Jalur setara Paket Tepi)', G.PERKERASAN, 'm1', 'track_length * 2', ['track_length'], { price: 95000, level: 'COMPREHENSIVE', priceNote: 'Referensi tepi beton/kanstin lintasan terpasang.' }),
      comp('lampu', 'Penerangan Jalur Lari Taman (Lampu Taman Utama)', G.ELEKTRIKAL, 'titik', 'track_length / 28', ['track_length'], { code: '5.3.1.56', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk lintasan standar IAAF 8 lajur bersertifikat, tribun, dan sistem timing elektronik.']
  }),

  // =======================================================================
  // DEMOLISI & REKONSTRUKSI (5)
  // =======================================================================
  tpl({
    id: 'DEM-BUILDING-TOTAL',
    name: 'Pembongkaran Gedung Total (Bertingkat, Mekanis & Manual)',
    category: 'DEMOLISI_REKONSTRUKSI',
    subcategory: 'Demolisi Total',
    description: 'Pembongkaran gedung bertingkat menyeluruh: survei & pemutusan utilitas, soft strip, demolisi mekanis/manual lantai per lantai, pemilahan material, dan pembuangan puing hingga rata tanah.',
    badge: 'Demolisi Gedung',
    icon: 'Building2',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 600, { min: 100, max: 3000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 4, { min: 1, max: 30 }),
      num('structure_type_factor', 'Faktor Kesulitan Struktur (1=beton biasa)', 1, { min: 0.8, max: 1.8, group: 'specifications' })
    ],
    components: [
      comp('survei', 'Survei Kondisi & Metode Kerja Demolisi (Paket per Gedung)', G.KHUSUS, 'unit', '1', [], { price: 18500000, priceNote: 'Referensi survei struktur + rencana metode demolisi & K3 (tidak termasuk asesmen B3/asbes laboratorium).' }),
      comp('pagar', 'Pagar Pengaman Keliling Tapak (Pagar Seng Baja 1x Pakai)', G.PERSIAPAN, 'm1', '(floor_area * 0.14) * 4', ['floor_area'], { code: '1.1.1.4' }),
      comp('soft-strip', 'Soft Strip Interior (Pembersihan Isi & Finishing per m² Lantai)', G.BONGKAR, 'm2', 'floor_area * num_floors', ['floor_area', 'num_floors'], { price: 68500, priceNote: 'Referensi pelepasan interior & utilitas internal sebelum demolisi struktur.' }),
      comp('bongkar-dinding', 'Pembongkaran Dinding Bata Gedung (per m³ Dinding)', G.BONGKAR, 'm3', 'floor_area * num_floors * 0.14', ['floor_area', 'num_floors'], { code: 'G.205', priceNote: 'Item kanonis bongkar pasangan bata BM.' }),
      comp('bongkar-beton', 'Pembongkaran Struktur Beton Bertulang (per m³ Beton)', G.BONGKAR, 'm3', 'floor_area * num_floors * 0.16 * structure_type_factor', ['floor_area', 'num_floors', 'structure_type_factor'], { code: 'G.204', priceNote: 'Item kanonis bongkar beton bertulang BM.' }),
      comp('bongkar-pondasi', 'Pembongkaran Pondasi & Pile Cap (per m³)', G.BONGKAR, 'm3', 'floor_area * 0.3', ['floor_area'], { code: 'G.204', level: 'PROFESSIONAL' }),
      comp('pilah', 'Pemilahan & Penurunan Material Bernilai (Paket per m² Lantai)', G.BONGKAR, 'm2', 'floor_area * num_floors', ['floor_area', 'num_floors'], { price: 18500, level: 'COMPREHENSIVE', priceNote: 'Referensi pemilahan besi/kayu/kaca untuk nilai salvage (pendapatan salvage milik pemilik, di luar RAB).' }),
      comp('buang-puing', 'Pembuangan Puing Campuran ke TPA (Paket per m³ Puing Longgar)', G.BONGKAR, 'm3', 'floor_area * num_floors * 0.42', ['floor_area', 'num_floors'], { price: 145000, level: 'PROFESSIONAL', priceNote: 'Referensi angkut + retribusi buang puing campuran kawasan (jarak menengah).' }),
      comp('debu', 'Pengendalian Debu & Kebisingan (Penyemprotan & Net Debu, Paket per m² Tapak)', G.PERSIAPAN, 'm2', 'floor_area * 1.3', ['floor_area'], { price: 12500, level: 'COMPREHENSIVE', priceNote: 'Referensi pengendalian dampak lingkungan selama demolisi.' })
    ],
    assumptions: [...ASUMSI, 'Gedung diasumsikan bebas material B3 (asbes dsb.) — temuan B3 menghentikan pekerjaan & memerlukan penanganan khusus terpisah.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk penanganan material berbahaya (asbes, timbal), peledakan, dan perbaikan kerusakan bangunan tetangga.']
  }),

  tpl({
    id: 'DEM-INTERIOR-STRIPOUT',
    name: 'Strip-Out Interior Gedung (Kembali ke Shell)',
    category: 'DEMOLISI_REKONSTRUKSI',
    subcategory: 'Strip-Out',
    description: 'Pembongkaran interior gedung hingga kondisi shell: partisi, plafon, lantai finishing, MEP titik akhir, dan pintu interior — struktur & fasad dipertahankan untuk fit-out penyewa baru.',
    badge: 'Strip-Out',
    icon: 'PaintRoller',
    parameters: [
      num('floor_area', 'Luas Area Strip-Out', 850, { min: 100, max: 8000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 30 })
    ],
    components: [
      comp('bongkar-partisi', 'Pembongkaran Partisi & Dinding Ringan Interior (per m² Lantai Proporsional)', G.BONGKAR, 'm2', 'floor_area * 0.34', ['floor_area'], { price: 58500, priceNote: 'Referensi bongkar partisi gypsum/kaca termasuk penurunan material.' }),
      comp('bongkar-plafon', 'Pembongkaran Plafon & Rangka (per m²)', G.BONGKAR, 'm2', 'floor_area * 0.95', ['floor_area'], { price: 32500 }),
      comp('bongkar-lantai', 'Pembongkaran Finishing Lantai (Keramik/Vinyl/Karpet) per m²', G.BONGKAR, 'm2', 'floor_area * 0.9', ['floor_area'], { price: 42500 }),
      comp('bongkar-mep', 'Pelepasan MEP Titik Akhir (Armatur, Ducting Kecil, Saniter)', G.BONGKAR, 'm2', 'floor_area', ['floor_area'], { price: 38500, level: 'PROFESSIONAL', priceNote: 'Referensi strip-out MEP non-struktural (riser & panel utama dipertahankan).' }),
      comp('bongkar-pintu', 'Pelepasan Pintu & Kusen Interior (Pembersihan Setara Paket per m² Lantai)', G.BONGKAR, 'm2', 'floor_area * 0.1', ['floor_area'], { price: 45000, level: 'COMPREHENSIVE', priceNote: 'Referensi pelepasan pintu interior proporsional.' }),
      comp('proteksi', 'Proteksi Lift, Lobby & Area Bersama Selama Strip-Out (Paket per Lantai)', G.PERSIAPAN, 'unit', 'num_floors', ['num_floors'], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi proteksi jalur angkut puing & area bersama gedung aktif.' }),
      comp('buang', 'Pembuangan Puing Strip-Out (Paket per m³)', G.BONGKAR, 'm3', 'floor_area * 0.16', ['floor_area'], { price: 165000, level: 'PROFESSIONAL', priceNote: 'Referensi angkut puing interior termasuk retribusi buang.' }),
      comp('perataan', 'Pembersihan Akhir & Serah Terima Shell (Perata Screed Rusak Sebagian)', G.BONGKAR, 'm2', 'floor_area * 0.3', ['floor_area'], { code: '3.10.14', price: 95000, level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk pembongkaran struktur/riser utama, penanganan material B3, dan biaya denda manajemen gedung.']
  }),

  tpl({
    id: 'DEM-CONCRETE-CUTTING',
    name: 'Pembongkaran Beton Selektif & Pemotongan (Bukaan Baru)',
    category: 'DEMOLISI_REKONSTRUKSI',
    subcategory: 'Bongkar Selektif',
    description: 'Pembongkaran beton selektif untuk modifikasi struktur: pemotongan diamond saw bukaan lantai/dinding, core drill, pembongkaran elemen non-struktural, dan perkuatan tepi bukaan baru.',
    badge: 'Bongkar Selektif',
    icon: 'Scissors',
    parameters: [
      num('cut_length', 'Panjang Potong Bukaan (m)', 85, { min: 5, max: 1000, unit: 'm', group: 'specifications' }),
      num('concrete_volume', 'Volume Beton Dibongkar Selektif', 26, { min: 2, max: 500, unit: 'm³', group: 'specifications' }),
      num('core_points', 'Jumlah Titik Core Drill', 24, { min: 0, max: 300, group: 'specifications' })
    ],
    components: [
      comp('marking', 'Marking, Scan Tulangan & Persiapan (Paket per Titik Bukaan)', G.KHUSUS, 'unit', 'core_points / 2 + 2', ['core_points'], { price: 685000, priceNote: 'Referensi pemindaian tulangan (cover meter) & marking per area bukaan.' }),
      comp('saw-cut', 'Pemotongan Beton Diamond Saw per Meter Potong', G.BONGKAR, 'm1', 'cut_length', ['cut_length'], { price: 285000, priceNote: 'Referensi saw cutting beton bertulang tebal s.d. 20 cm termasuk pendingin air.' }),
      comp('core', 'Core Drill Beton per Titik', G.BONGKAR, 'unit', 'core_points', ['core_points'], { price: 385000, condition: 'core_points > 0', priceNote: 'Referensi core drill Ø50–150 per titik.' }),
      comp('bongkar-beton', 'Pembongkaran Beton Bertulang Selektif (Hydraulic Breaker Kecil)', G.BONGKAR, 'm3', 'concrete_volume', ['concrete_volume'], { code: 'G.204' }),
      comp('bongkar-bata', 'Pembongkaran Dinding Bata Bukaan', G.BONGKAR, 'm3', 'concrete_volume * 0.4', ['concrete_volume'], { code: 'G.205', level: 'PROFESSIONAL' }),
      comp('besi-tepi', 'Perkuatan Tepi Bukaan: Penulangan Tambahan BjTP ≥ 12', G.STRUKTUR, 'kg', 'cut_length * 6.2', ['cut_length'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('baja-tepi', 'Trimmer Baja Tepi Bukaan Pelat', G.STRUKTUR, 'kg', 'cut_length * 4.4', ['cut_length'], { code: '2.3.1.1', price: 39800, level: 'COMPREHENSIVE' }),
      comp('buang', 'Pembuangan Puing Selektif (Paket per m³)', G.BONGKAR, 'm3', 'concrete_volume * 1.3', ['concrete_volume'], { price: 165000, level: 'COMPREHENSIVE', priceNote: 'Referensi angkut puing bongkar selektif.' })
    ],
    assumptions: [...ASUMSI, 'Seluruh bukaan pada elemen struktur wajib disetujui insinyur struktur; lokasi tulangan utama diverifikasi scan sebelum potong.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk perkuatan struktur besar pasca-bukaan, penyanggaan sementara skala besar, dan pekerjaan malam hari.']
  }),

  tpl({
    id: 'DEM-ROOF-STRUCTURE',
    name: 'Pembongkaran Struktur Atap & Baja (Dismantling)',
    category: 'DEMOLISI_REKONSTRUKSI',
    subcategory: 'Dismantling Atap',
    description: 'Pembongkaran hati-hati struktur atap baja/kayu & penutup untuk dipakai kembali atau diganti: pelepasan penutup, pemotongan sambungan, penurunan rangka dengan crane kecil, dan penyimpanan material salvage.',
    badge: 'Dismantling',
    icon: 'Warehouse',
    parameters: [
      num('roof_area', 'Luas Atap Dibongkar', 950, { min: 100, max: 8000, unit: 'm²' }),
      num('steel_weight_ton', 'Berat Baja Struktur Atap (ton)', 22, { min: 1, max: 300, unit: 'ton', group: 'specifications' })
    ],
    components: [
      comp('akses', 'Scaffolding & Akses Kerja Atap (Pekerjaan Persiapan Paket per m² Atap)', G.PERSIAPAN, 'm2', 'roof_area * 0.4', ['roof_area'], { price: 48500, priceNote: 'Referensi akses kerja & pengaman tepi atap selama dismantling.' }),
      comp('lepas-penutup', 'Pelepasan Penutup Atap (Semi Mekanis Hati-hati)', G.BONGKAR, 'm2', 'roof_area', ['roof_area'], { price: 32500 }),
      comp('bongkar-dinding-penopang', 'Pembongkaran Pasangan Penopang Atap (Padanan Bongkar Bata Kecil)', G.BONGKAR, 'm3', 'roof_area * 0.02', ['roof_area'], { code: 'G.205', level: 'PROFESSIONAL' }),
      comp('turun-baja', 'Penurunan Rangka Baja Atap per kg (Dismantling Terencana)', G.BONGKAR, 'kg', 'steel_weight_ton * 1000', ['steel_weight_ton'], { price: 6850, priceNote: 'Referensi potong sambungan + penurunan crane/takel per kg baja.' }),
      comp('pembersihan-baja', 'Pembersihan Permukaan Baja Hasil Bongkar (Padanan Pembersihan Sedang)', G.BONGKAR, 'm2', 'steel_weight_ton * 9', ['steel_weight_ton'], { code: '1.6.35', level: 'COMPREHENSIVE', priceNote: 'Item kanonis pembersihan permukaan dipakai untuk baja salvage yang akan dipakai kembali.' }),
      comp('simpan', 'Penyimpanan & Penumpukan Material Salvage di Tapak (Paket per ton)', G.BONGKAR, 'unit', 'steel_weight_ton', ['steel_weight_ton'], { price: 285000, level: 'COMPREHENSIVE', priceNote: 'Referensi penumpukan rapi & perlindungan material pakai ulang.' }),
      comp('buang-sisa', 'Pembuangan Sisa Material Tak Terpakai (Paket per m³)', G.BONGKAR, 'm3', 'roof_area * 0.05', ['roof_area'], { price: 145000, level: 'COMPREHENSIVE', priceNote: 'Referensi angkut sisa bongkaran atap.' })
    ],
    assumptions: [...ASUMSI, 'Nilai salvage material menjadi milik pemilik & tidak mengurangi RAB kecuali disepakati tertulis.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk pembongkaran dinding & struktur di bawah atap, crane kapasitas besar, dan penyimpanan di luar tapak.']
  }),

  tpl({
    id: 'DEM-SITE-CLEARANCE',
    name: 'Pembongkaran & Pembersihan Lahan Pasca Bangunan (Site Clearance)',
    category: 'DEMOLISI_REKONSTRUKSI',
    subcategory: 'Site Clearance',
    description: 'Paket pembersihan lahan bekas bangunan untuk pembangunan baru: bongkar sisa pondasi & perkerasan lama, cabut utilitas tertanam dangkal, perataan awal, dan pembuangan seluruh puing hingga lahan siap ukur.',
    badge: 'Clearance',
    icon: 'Eraser',
    parameters: [
      num('site_area', 'Luas Lahan', 1800, { min: 200, max: 30000, unit: 'm²' }),
      num('old_footprint_ratio', 'Rasio Bekas Tapak Bangunan (%)', 45, { min: 5, max: 100, unit: '%', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan Permukaan & Pengupasan Awal Lahan', G.PERSIAPAN, 'm2', 'site_area', ['site_area'], { code: 'A.1.01.a.1' }),
      comp('bongkar-perkerasan', 'Pembongkaran Perkerasan & Pelat Lantai Lama (Beton Bertulang)', G.BONGKAR, 'm3', 'site_area * old_footprint_ratio / 100 * 0.12', ['site_area', 'old_footprint_ratio'], { code: 'G.204' }),
      comp('bongkar-pondasi', 'Pembongkaran Sisa Pondasi Dangkal (Beton/Batu setara Beton)', G.BONGKAR, 'm3', 'site_area * old_footprint_ratio / 100 * 0.1', ['site_area', 'old_footprint_ratio'], { code: 'G.204', level: 'PROFESSIONAL' }),
      comp('bongkar-dinding-sisa', 'Pembongkaran Sisa Dinding & Pagar Lama', G.BONGKAR, 'm3', 'site_area * 0.018', ['site_area'], { code: 'G.205', level: 'PROFESSIONAL' }),
      comp('cabut-utilitas', 'Pencabutan Utilitas Tertanam Dangkal & Septic Lama (Paket per m² Tapak Lama)', G.BONGKAR, 'm2', 'site_area * old_footprint_ratio / 100', ['site_area', 'old_footprint_ratio'], { price: 28500, level: 'COMPREHENSIVE', priceNote: 'Referensi cabut pipa/tangki dangkal termasuk penutupan aman (utilitas aktif wajib diputus penyedia terlebih dahulu).' }),
      comp('perataan', 'Perataan Awal Lahan Pasca Bongkar (Pengolahan Tanah)', G.TANAH, 'm2', 'site_area', ['site_area'], { code: '4.1.8.1', price: 29500 }),
      comp('buang', 'Pembuangan Seluruh Puing Lahan (Paket per m³ Longgar)', G.BONGKAR, 'm3', 'site_area * old_footprint_ratio / 100 * 0.3', ['site_area', 'old_footprint_ratio'], { price: 145000, level: 'PROFESSIONAL', priceNote: 'Referensi angkut puing campuran lahan termasuk retribusi.' }),
      comp('pagar-sementara', 'Pagar Pengaman Sementara Lahan Kosong (Seng Baja 1x)', G.PERSIAPAN, 'm1', 'site_area * 0.09', ['site_area'], { code: '1.1.1.4', level: 'COMPREHENSIVE', priceNote: 'Keliling lahan diturunkan proporsional akar luas (asumsi tapak mendekati bujur sangkar).' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk remediasi tanah terkontaminasi, pembongkaran basement dalam, dan pemindahan utilitas aktif milik penyedia layanan.']
  })
];
