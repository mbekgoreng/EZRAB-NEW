/**
 * Katalog 180 — HOTEL_HOSPITALITY (+4), KESEHATAN (+4), PENDIDIKAN (+4), INDUSTRI (+5).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { G, num, comp, tpl, ASUMSI_BANGUNAN, EKSKLUSI_BANGUNAN } from './builders';

export const BUILDING_TEMPLATES_B: RabTemplate[] = [
  // =======================================================================
  // HOTEL & HOSPITALITY
  // =======================================================================
  tpl({
    id: 'BLD-HOTEL-CITY',
    name: 'City Hotel Bisnis 7 Lantai (60 Kamar)',
    category: 'HOTEL_HOSPITALITY',
    subcategory: 'City Hotel',
    description: 'Hotel bisnis perkotaan 7 lantai: kamar standar & deluxe, lobby, restoran, ruang meeting, dan back-of-house. Finishing setara bintang 4 dengan koridor berkarpet dan bathroom pod keramik.',
    badge: 'Bintang 4',
    icon: 'Hotel',
    parameters: [
      num('num_rooms', 'Jumlah Kamar', 60, { min: 20, max: 300, group: 'specifications' }),
      num('room_area', 'Luas Rata-rata per Kamar', 32, { min: 21, max: 60, unit: 'm²', group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 7, { min: 3, max: 20 }),
      num('lobby_area', 'Luas Lobby & Restoran', 450, { min: 150, max: 1500, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'num_rooms * room_area * 0.3', ['num_rooms', 'room_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'num_rooms * room_area * 0.22', ['num_rooms', 'room_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'num_rooms * room_area * 0.16', ['num_rooms', 'room_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'num_rooms * room_area * 0.15', ['num_rooms', 'room_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'num_rooms * room_area * 12.5', ['num_rooms', 'room_area'], { code: '2.2.1.1.4' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'num_rooms * room_area * 1.5', ['num_rooms', 'room_area'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'num_rooms * room_area * 3', ['num_rooms', 'room_area'], { code: '3.7.4', price: 68500 }),
      comp('aci', 'Acian Dinding', G.DINDING, 'm2', 'num_rooms * room_area * 3', ['num_rooms', 'room_area'], { code: '3.7.8', level: 'PROFESSIONAL' }),
      comp('lantai-kamar', 'Lantai Ubin Granit 60x60 Kamar', G.LANTAI, 'm2', 'num_rooms * room_area * 0.85', ['num_rooms', 'room_area'], { code: '3.9.5.3' }),
      comp('marmer-lobby', 'Lantai Marmer 100x100 Lobby & Restoran', G.LANTAI, 'm2', 'lobby_area', ['lobby_area'], { code: '3.9.9.1', level: 'PROFESSIONAL' }),
      comp('karpet', 'Karpet Tile Koridor Kamar + Underlayer', G.LANTAI, 'm2', 'num_floors * 130', ['num_floors'], { code: '3.9.9.2', level: 'PROFESSIONAL' }),
      comp('keramik-km', 'Dinding Keramik Artistik 10x20 Kamar Mandi', G.DINDING, 'm2', 'num_rooms * 11', ['num_rooms'], { code: '3.10.1.3', level: 'PROFESSIONAL' }),
      comp('sanitair', 'Paket Sanitair Kamar (Kloset Duduk Monoblok, Wastafel, Bathtub/Shower)', G.SANITASI, 'unit', 'num_rooms', ['num_rooms'], { price: 8950000, priceNote: 'Referensi paket sanitair hotel bintang 4 terpasang.' }),
      comp('shower', 'Shower Set Stainless per Kamar', G.SANITASI, 'buah', 'num_rooms', ['num_rooms'], { code: '3.18.6.9', level: 'COMPREHENSIVE' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'num_rooms * room_area * 2.5', ['num_rooms', 'room_area'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('ac', 'AC Wall Mounted per Kamar', G.MEKANIKAL, 'unit', 'num_rooms', ['num_rooms'], { code: '5.5.1.1', level: 'COMPREHENSIVE', optional: true }),
      comp('listrik', 'Instalasi Titik Lampu Kamar & Umum', G.ELEKTRIKAL, 'titik', 'num_rooms * 6 + num_floors * 12', ['num_rooms', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('gtrap', 'Grease Trap Portable Stainless kap. 30 L (Dapur)', G.SANITASI, 'unit', '2', [], { code: '6.2.3.2', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Satu kamar mandi per kamar; koridor diasumsikan 130 m² per lantai.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk furniture kamar, peralatan dapur komersial, lift, kolam renang, dan sistem manajemen properti hotel.']
  }),

  tpl({
    id: 'BLD-HOTEL-BUDGET',
    name: 'Budget Hotel / Hotel Transit 4 Lantai',
    category: 'HOTEL_HOSPITALITY',
    subcategory: 'Budget Hotel',
    description: 'Hotel ekonomis 4 lantai dengan kamar kompak efisien, bathroom pod, dan lobi minimalis. Material ekonomis tahan pakai untuk okupansi tinggi dekat bandara/stasiun/terminal.',
    badge: 'Budget',
    icon: 'Hotel',
    parameters: [
      num('num_rooms', 'Jumlah Kamar', 48, { min: 16, max: 160, group: 'specifications' }),
      num('room_area', 'Luas Rata-rata per Kamar', 21, { min: 16, max: 32, unit: 'm²', group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 4, { min: 2, max: 10 })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'num_rooms * room_area * 0.42', ['num_rooms', 'room_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'num_rooms * room_area * 0.3', ['num_rooms', 'room_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'num_rooms * room_area * 0.21', ['num_rooms', 'room_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'num_rooms * room_area * 0.145', ['num_rooms', 'room_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'num_rooms * room_area * 10.5', ['num_rooms', 'room_area'], { code: '2.2.1.1.3' }),
      comp('dinding', 'Dinding Bata Ringan t=7,5 cm (Antar Ruang Non-Struktural)', G.DINDING, 'm2', 'num_rooms * room_area * 1.15', ['num_rooms', 'room_area'], { code: '3.6.4.1' }),
      comp('dinding-10', 'Dinding Bata Ringan t=10 cm (Antar Unit)', G.DINDING, 'm2', 'num_rooms * room_area * 0.55', ['num_rooms', 'room_area'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'num_rooms * room_area * 3.2', ['num_rooms', 'room_area'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Ubin PC 60x60 Kamar & Koridor', G.LANTAI, 'm2', 'num_rooms * room_area * 1.14', ['num_rooms', 'room_area'], { code: '3.9.1.4' }),
      comp('keramik-km', 'Dinding Keramik 20x20 Kamar Mandi', G.DINDING, 'm2', 'num_rooms * 8.5', ['num_rooms'], { code: '3.10.1.4', level: 'PROFESSIONAL' }),
      comp('sanitair', 'Paket Sanitair Ekonomis (Kloset Duduk, Wastafel, Shower)', G.SANITASI, 'unit', 'num_rooms', ['num_rooms'], { price: 4950000, priceNote: 'Referensi paket sanitair kelas budget terpasang.' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'num_rooms * room_area * 2.7', ['num_rooms', 'room_area'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('ac', 'AC Wall Mounted per Kamar', G.MEKANIKAL, 'unit', 'num_rooms', ['num_rooms'], { code: '5.5.1.1', level: 'COMPREHENSIVE', optional: true }),
      comp('listrik', 'Instalasi Titik Lampu', G.ELEKTRIKAL, 'titik', 'num_rooms * 4 + num_floors * 8', ['num_rooms', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('toren', 'Roof Tank Fiberglass kap. 4 m³', G.SANITASI, 'unit', 'Math.ceil(num_rooms / 40)', ['num_rooms'], { code: '6.1.1.2', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Kamar kompak tanpa bathtub; shower only. Lift diasumsikan ada di luar lingkup untuk ≤ 4 lantai (opsional terpisah).'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk furniture, lift, signage neon box, dan peralatan laundry.']
  }),

  tpl({
    id: 'BLD-VILLA-CLUSTER',
    name: 'Klaster Villa Private Pool (per Unit 2 Lantai)',
    category: 'HOTEL_HOSPITALITY',
    subcategory: 'Villa Resort',
    description: 'Template per unit villa resort 2 lantai dengan kolam renang pribadi, deck kayu, dan taman tropis. Dikalikan jumlah unit untuk estimasi klaster; pekerjaan infrastruktur kawasan tidak termasuk.',
    badge: 'Per Unit Villa',
    icon: 'Palmtree',
    parameters: [
      num('building_area', 'Luas Bangunan Villa', 120, { min: 60, max: 400, unit: 'm²' }),
      num('pool_area', 'Luas Kolam Renang Pribadi', 24, { min: 12, max: 80, unit: 'm²', group: 'specifications' }),
      num('deck_area', 'Luas Deck & Teras', 30, { min: 10, max: 120, unit: 'm²', group: 'specifications' }),
      num('num_bathrooms', 'Jumlah Kamar Mandi', 2, { min: 1, max: 6, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'building_area * 1.5', ['building_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi & Kolam', G.TANAH, 'm3', 'building_area * 0.4 + pool_area * 1.5', ['building_area', 'pool_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'building_area * 0.3', ['building_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Termasuk Dinding Kolam)', G.STRUKTUR, 'm3', 'building_area * 0.16 + pool_area * 0.42', ['building_area', 'pool_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('beton-kedap', 'Beton Kedap Air dengan Aditif (Badan Kolam)', G.STRUKTUR, 'm3', 'pool_area * 0.3', ['pool_area'], { code: '2.2.1.5.11', price: 1565000, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi beton kedap air terpasang.' }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'building_area * 11 + pool_area * 16', ['building_area', 'pool_area'], { code: '2.2.1.1.3' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'building_area * 1.9', ['building_area'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'building_area * 3.8', ['building_area'], { code: '3.7.4', price: 68500 }),
      comp('wp-kolam', 'Waterproofing Semen Base Badan Kolam', G.ATAP, 'm2', 'pool_area * 1.55', ['pool_area'], { code: '3.4.3', level: 'PROFESSIONAL' }),
      comp('mozaik', 'Finishing Mozaik Kolam Renang', G.LANTAI, 'm2', 'pool_area * 1.5', ['pool_area'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi mozaik kolam impor terpasang termasuk nat epoxy.' }),
      comp('panel-kolam', 'Panel Kontrol Pompa Kolam & Water Treatment', G.MEKANIKAL, 'unit', '1', [], { code: '5.1.2.11', level: 'PROFESSIONAL' }),
      comp('lantai', 'Lantai Ubin Granit 60x60 Ruang Utama', G.LANTAI, 'm2', 'building_area * 0.85', ['building_area'], { code: '3.9.5.3' }),
      comp('deck', 'Deck Kayu Ulin/Bangkirai Area Kolam', G.LANTAI, 'm2', 'deck_area', ['deck_area'], { price: 895000, level: 'COMPREHENSIVE', priceNote: 'Referensi deck kayu keras + struktur balok terpasang.' }),
      comp('atap', 'Rangka Atap Pelana Baja Ringan C75 + Genteng Beton', G.ATAP, 'm2', 'building_area * 0.72', ['building_area'], { code: '2.1.1.1' }),
      comp('genteng', 'Penutup Atap Genteng Beton', G.ATAP, 'm2', 'building_area * 0.72', ['building_area'], { code: '3.1.1.4', level: 'PROFESSIONAL' }),
      comp('sanitair', 'Paket Sanitair Villa (Kloset, Wastafel, Shower Rain)', G.SANITASI, 'unit', 'num_bathrooms', ['num_bathrooms'], { price: 7850000, priceNote: 'Referensi paket sanitair villa terpasang.' }),
      comp('cat', 'Pengecatan Eksterior Tembok Baru (Weathercoat setara)', G.FINISHING, 'm2', 'building_area * 1.6', ['building_area'], { code: '3.8.10.2', level: 'PROFESSIONAL' }),
      comp('taman', 'Penanaman Rumput & Taman Tropis Sekeliling Villa', G.LANSKAP, 'm2', 'building_area * 0.8', ['building_area'], { price: 118000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi paket softscape tropis termasuk media tanam & tanaman awal.' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Template dihitung per 1 unit villa; kalikan dengan jumlah unit untuk klaster. Kolam diasumsikan kedalaman 1,4 m dinding beton kedap air.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk infrastruktur kawasan (jalan, drainase utama, jaringan listrik/air kawasan), furniture, dan peralatan mekanikal kolam di luar panel kontrol (pompa & filter oleh vendor kolam).']
  }),

  tpl({
    id: 'BLD-BALLROOM',
    name: 'Ballroom & Wedding Venue Bentang Lebar',
    category: 'HOTEL_HOSPITALITY',
    subcategory: 'Ballroom & Venue',
    description: 'Gedung serbaguna premium bentang lebar 24–30 m tanpa kolom tengah: struktur baja space frame, plafon akustik tinggi, lantai marmer foyer, dan dapur catering. Untuk ballroom hotel/gedung pernikahan mandiri.',
    badge: 'Bentang Lebar',
    icon: 'Sparkles',
    parameters: [
      num('hall_area', 'Luas Ruang Ballroom Utama', 1200, { min: 400, max: 4000, unit: 'm²' }),
      num('foyer_area', 'Luas Foyer & Pre-Function', 350, { min: 100, max: 1200, unit: 'm²' }),
      num('ceiling_height', 'Tinggi Plafon Ballroom', 8, { min: 5, max: 14, unit: 'm', group: 'specifications' }),
      num('capacity', 'Kapasitas Tamu (Orang)', 800, { min: 200, max: 3000, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', '(hall_area + foyer_area) * 1.3', ['hall_area', 'foyer_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', '(hall_area + foyer_area) * 0.45', ['hall_area', 'foyer_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Semi Mekanis', G.PONDASI, 'm3', '(hall_area + foyer_area) * 0.28', ['hall_area', 'foyer_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Kolom Perimeter & Balok)', G.STRUKTUR, 'm3', '(hall_area + foyer_area) * 0.13', ['hall_area', 'foyer_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', '(hall_area + foyer_area) * 11', ['hall_area', 'foyer_area'], { code: '2.2.1.1.4' }),
      comp('baja', 'Struktur Atap Baja Profil Bentang Lebar (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'hall_area * 38', ['hall_area'], { code: '2.3.1.1', price: 39800, priceNote: 'Komposisi resolver PARTIAL — fallback referensi baja fabrikasi terpasang.' }),
      comp('cat-baja', 'Pengecatan Baja Meni Besi (Zinc Chromate)', G.FINISHING, 'm2', 'hall_area * 0.9', ['hall_area'], { code: '3.8.16', level: 'PROFESSIONAL' }),
      comp('atap', 'Penutup Atap UPVC Atap Ballroom', G.ATAP, 'm2', 'hall_area * 1.12', ['hall_area'], { code: '3.1.3.5', level: 'PROFESSIONAL' }),
      comp('insulasi', 'Lembaran Insulasi Atap (Peredam Panas & Suara Hujan)', G.ATAP, 'm2', 'hall_area * 1.12', ['hall_area'], { code: '3.2.1', level: 'PROFESSIONAL' }),
      comp('plafon', 'Plafon Akustik 60x120 Profil Aluminium', G.ATAP, 'm2', 'hall_area * 0.96', ['hall_area'], { code: '3.5.1.4' }),
      comp('marmer', 'Lantai Marmer 100x100 Foyer', G.LANTAI, 'm2', 'foyer_area', ['foyer_area'], { code: '3.9.9.1' }),
      comp('karpet', 'Karpet Tile Ballroom + Underlayer (Area Acara)', G.LANTAI, 'm2', 'hall_area * 0.97', ['hall_area'], { code: '3.9.9.2', level: 'PROFESSIONAL' }),
      comp('dinding-akustik', 'Panel Akustik Dinding Ballroom (Fabrikasi Lokal)', G.DINDING, 'm2', 'hall_area * 0.42 * ceiling_height / 8', ['hall_area', 'ceiling_height'], { price: 685000, level: 'COMPREHENSIVE', priceNote: 'Referensi panel akustik fabric wrap + rockwool terpasang.' }),
      comp('partisi-lipat', 'Partisi Lipat Peredam Suara Ballroom (Movable Wall)', G.DINDING, 'm2', 'hall_area * 0.16 * ceiling_height / 8', ['hall_area', 'ceiling_height'], { price: 2450000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi movable partition STC 45 terpasang termasuk rel & struktur gantung.' }),
      comp('pintu', 'Pintu Kaca Rangka Aluminium Akses Utama', G.KUSEN, 'm2', 'foyer_area * 0.14', ['foyer_area'], { code: '3.11.1.5', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Ballroom & Foyer', G.ELEKTRIKAL, 'titik', 'Math.ceil((hall_area + foyer_area) / 10)', ['hall_area', 'foyer_area'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('exit', 'Lampu Exit LED + Baterai (Jalur Evakuasi)', G.ELEKTRIKAL, 'unit', 'Math.ceil(capacity / 100)', ['capacity'], { code: '5.3.1.12', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Bentang bebas kolom diasumsikan ≤ 30 m dengan rangka atap baja profil; tinggi plafon memengaruhi luas panel akustik & partisi secara proporsional.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk sistem tata suara & lighting panggung, HVAC sentral (chiller/AHU oleh vendor), dapur catering equipment, dan dekorasi acara.']
  }),

  // =======================================================================
  // KESEHATAN
  // =======================================================================
  tpl({
    id: 'BLD-HEALTH-PUSKESMAS',
    name: 'Puskesmas Rawat Inap 2 Lantai',
    category: 'KESEHATAN',
    subcategory: 'Puskesmas',
    description: 'Puskesmas dengan UGD, poli umum/gigi/KIA, ruang rawat inap dasar, persalinan, dan apotek. Finishing higienis: lantai homogeneous, dinding keramik area basah, pintu lebar akses brankar.',
    badge: 'Faskes Primer',
    icon: 'HeartPulse',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 650, { min: 300, max: 1600, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 4 }),
      num('num_beds', 'Jumlah Tempat Tidur Rawat Inap', 10, { min: 4, max: 40, group: 'specifications' }),
      num('num_poli', 'Jumlah Ruang Poli', 6, { min: 3, max: 20, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.3', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.46', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.3', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.15', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 12', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'floor_area * num_floors * 1.5', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 3', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Vinyl Homogeneous Medis (Anti Bakteri, Welded Seam)', G.LANTAI, 'm2', 'floor_area * num_floors * 0.9', ['floor_area', 'num_floors'], { price: 268000, priceNote: 'Harga referensi vinyl homogeneous medis terpasang. Kode kanonis 3.10.2.1 sengaja TIDAK dipakai: item itu pekerjaan DINDING homogeneous tile, bukan lantai — memakai kodenya akan menyesatkan pemetaan AHSP.' }),
      comp('keramik-basah', 'Dinding Keramik 20x20 Area Basah & Steril', G.DINDING, 'm2', 'num_poli * 10 + num_beds * 3', ['num_poli', 'num_beds'], { code: '3.10.1.4', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru (Cat Antimikroba setara)', G.FINISHING, 'm2', 'floor_area * num_floors * 2.5', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('wastafel', 'Wastafel Ruang Periksa & Poli', G.SANITASI, 'buah', 'num_poli + num_beds', ['num_poli', 'num_beds'], { code: '3.18.1.1', price: 1450000, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi wastafel keramik + kran terpasang.' }),
      comp('kloset', 'Paket Kloset Duduk Pasien & Staf', G.SANITASI, 'unit', 'num_poli + 6', ['num_poli'], { price: 2650000, priceNote: 'Referensi kloset duduk + aksesoris grab bar difabel terpasang.' }),
      comp('pintu-lebar', 'Pintu Panel Kayu Lebar 120 cm Akses Brankar', G.KUSEN, 'm2', 'num_beds * 2.6 + num_poli * 2.2', ['num_beds', 'num_poli'], { code: '3.11.1.11', level: 'PROFESSIONAL' }),
      comp('railing', 'Railing & Handrail Koridor Pasien', G.FINISHING, 'm1', 'floor_area * 0.55', ['floor_area'], { code: '3.13.5', level: 'COMPREHENSIVE' }),
      comp('listrik', 'Instalasi Titik Lampu Faskes', G.ELEKTRIKAL, 'titik', 'Math.ceil(floor_area * num_floors / 8)', ['floor_area', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('genset', 'Genset Silent 35 kVA Backup UGD & Cold Chain', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.3.7', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Standar ruang mengacu pedoman teknis puskesmas; gas medis tidak termasuk (belum wajib untuk puskesmas).'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk peralatan medis, ambulans, IPAL medis khusus (limbah B3 oleh pihak ketiga), dan perizinan operasional faskes.']
  }),

  tpl({
    id: 'BLD-HEALTH-DENTAL',
    name: 'Klinik Gigi & Estetika 2 Lantai',
    category: 'KESEHATAN',
    subcategory: 'Klinik Gigi',
    description: 'Klinik gigi modern dengan ruang dental unit, ruang rontgen panoramik berlapis timbal, sterilisasi, dan ruang tunggu premium. Proteksi radiasi dinding Pb dan pintu berlapis timbal termasuk.',
    badge: 'Klinik Gigi',
    icon: 'Stethoscope',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 220, { min: 100, max: 700, unit: 'm²' }),
      num('num_chairs', 'Jumlah Dental Chair', 5, { min: 2, max: 20, group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 4 })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.3', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.44', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.29', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.15', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 11', ['floor_area', 'num_floors'], { code: '2.2.1.1.3' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'floor_area * num_floors * 1.6', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('pb', 'Proteksi Radiasi: Pelapisan Timbal Pb 2 mm Dinding Rontgen', G.KHUSUS, 'm2', '38', [], { price: 2150000, level: 'PROFESSIONAL', priceNote: 'Referensi pelapis timbal Pb ekivalen 2 mm terpasang termasuk uji kebocoran radiasi dasar.' }),
      comp('pintu-pb', 'Pintu Panel Kayu Lapis Timbal Ruang Rontgen', G.KUSEN, 'm2', '2.2', [], { code: '3.11.1.14', price: 11812174, level: 'PROFESSIONAL', priceNote: 'Harga item kanonis per m2 sangat tinggi (paket per buah dalam data sumber); diperlakukan referensi — verifikasi ulang sebelum kontrak.' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 3.2', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Ubin Granit 60x60 Klinik', G.LANTAI, 'm2', 'floor_area * num_floors * 0.92', ['floor_area', 'num_floors'], { code: '3.9.5.3' }),
      comp('plafon', 'Plafon Gypsum 9 mm', G.ATAP, 'm2', 'floor_area * num_floors * 0.9', ['floor_area', 'num_floors'], { code: '3.5.2.1', level: 'PROFESSIONAL' }),
      comp('dental-plumbing', 'Instalasi Air & Drainase per Dental Chair (Pipa PPR + Tanah)', G.SANITASI, 'unit', 'num_chairs', ['num_chairs'], { price: 4850000, priceNote: 'Referensi paket plumbing dental unit: air bersih, drainase, dan suction line per chair.' }),
      comp('pipa-ppr', 'Pipa PPR PN10 DN 1/2" Distribusi Klinik', G.SANITASI, 'm1', 'floor_area * 0.5', ['floor_area'], { code: '6.4.3.1', level: 'PROFESSIONAL' }),
      comp('wastafel', 'Wastafel Ruang Sterilisasi & Periksa', G.SANITASI, 'buah', 'num_chairs + 2', ['num_chairs'], { code: '3.18.1.1', price: 1450000, level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 2.7', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('ac', 'AC Wall Mounted Ruang Periksa', G.MEKANIKAL, 'unit', 'num_chairs + 2', ['num_chairs'], { code: '5.5.1.1', level: 'COMPREHENSIVE', optional: true }),
      comp('listrik', 'Instalasi Titik Lampu Klinik', G.ELEKTRIKAL, 'titik', 'Math.ceil(floor_area * num_floors / 7)', ['floor_area', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Ruang rontgen diasumsikan 3x4 m dengan pelapis Pb ekivalen 2 mm pada dinding & pintu sesuai kebutuhan proteksi radiasi dasar.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk dental unit/chair, alat rontgen & CBCT, kompresor dental sentral, dan perizinan radiasi (BAPETEN).']
  }),

  tpl({
    id: 'BLD-HEALTH-LAB',
    name: 'Laboratorium Klinik & Radiologi 2 Lantai',
    category: 'KESEHATAN',
    subcategory: 'Laboratorium Medis',
    description: 'Gedung laboratorium patologi klinik & radiologi: ruang sampling, ruang analisa bertekanan negatif, ruang X-ray/CT berproteksi timbal, dan ruang tunggu. Instalasi khusus lab termasuk meja beton lab dan exhaust asam.',
    badge: 'Lab & Radiologi',
    icon: 'Microscope',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 380, { min: 150, max: 1200, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 5 }),
      num('num_exam', 'Jumlah Ruang Pemeriksaan/Modalitas', 5, { min: 2, max: 16, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.3', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.45', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.29', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Slab Diperkuat Area CT/MRI)', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.17', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 13', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'floor_area * num_floors * 1.45', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('pb', 'Pelapisan Timbal Pb Ruang Radiologi (per Ruang Modalitas)', G.KHUSUS, 'm2', 'num_exam * 22', ['num_exam'], { price: 2150000, level: 'PROFESSIONAL', priceNote: 'Referensi pelapis timbal ekivalen 2 mm terpasang.' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 2.9', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Vinyl Homogeneous Area Lab & Radiologi', G.LANTAI, 'm2', 'floor_area * num_floors * 0.9', ['floor_area', 'num_floors'], { price: 268000, priceNote: 'Harga referensi vinyl homogeneous lab terpasang. Kode kanonis 3.10.2.1 sengaja TIDAK dipakai: item itu pekerjaan DINDING homogeneous tile, bukan lantai.' }),
      comp('meja-lab', 'Meja Beton Laboratorium Finishing Keramik + Bak Cuci Asam', G.KHUSUS, 'm1', 'num_exam * 7', ['num_exam'], { price: 1895000, level: 'PROFESSIONAL', priceNote: 'Referensi meja lab beton + top keramik tahan asam per meter.' }),
      comp('exhaust', 'Titik Power Exhaust Fan Ruang Lab (NYY 3x2,5)', G.MEKANIKAL, 'unit', 'num_exam * 2', ['num_exam'], { code: '5.5.2.49', level: 'PROFESSIONAL' }),
      comp('wastafel', 'Wastafel Lab & Ruang Sampling', G.SANITASI, 'buah', 'num_exam + 3', ['num_exam'], { code: '3.18.1.1', price: 1450000, level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 2.5', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Lab', G.ELEKTRIKAL, 'titik', 'Math.ceil(floor_area * num_floors / 7.5)', ['floor_area', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('genset', 'Genset Silent 75 kVA Backup Alat Medis', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.3.1', level: 'COMPREHENSIVE', optional: true }),
      comp('air-vent', 'Air Vent Ø 3" Sistem Plumbing Lab', G.SANITASI, 'buah', 'num_floors * 2', ['num_floors'], { code: '9.7.4.1', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Proteksi radiasi per ruang modalitas diasumsikan setara X-ray konvensional; CT scan memerlukan kajian proteksi & struktur khusus.', 'MRI tidak termasuk (memerlukan RF shielding & quench pipe khusus).'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk peralatan lab & radiologi, fume hood bersertifikat, gas medis, dan perizinan BAPETEN & Kemenkes.']
  }),

  tpl({
    id: 'BLD-HEALTH-MATERNITY',
    name: 'Klinik Pratama & Rumah Bersalin 2 Lantai',
    category: 'KESEHATAN',
    subcategory: 'Klinik Bersalin',
    description: 'Klinik pratama dengan fokus persalinan: ruang bersalin, nifas, poli KIA/umum, IGD kecil, dan ruang tindakan. Finishing higienis ekonomis dengan akses ambulans & ramp.',
    badge: 'Bersalin',
    icon: 'Baby',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 420, { min: 180, max: 1000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 3 }),
      num('num_beds', 'Jumlah Tempat Tidur (Nifas & Rawat)', 12, { min: 4, max: 40, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.3', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.45', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.29', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.15', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 11', ['floor_area', 'num_floors'], { code: '2.2.1.1.3' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'floor_area * num_floors * 1.55', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 3.1', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Ubin Granit 60x60 Area Klinik', G.LANTAI, 'm2', 'floor_area * num_floors * 0.92', ['floor_area', 'num_floors'], { code: '3.9.5.3' }),
      comp('keramik-basah', 'Dinding Keramik 20x20 Ruang Bersalin & KM', G.DINDING, 'm2', 'num_beds * 6 + 40', ['num_beds'], { code: '3.10.1.4', level: 'PROFESSIONAL' }),
      comp('bak', 'Bak Mandi Pasangan Bata Ruang Nifas', G.SANITASI, 'buah', 'Math.ceil(num_beds / 2)', ['num_beds'], { code: '3.18.5.2', level: 'PROFESSIONAL' }),
      comp('kloset', 'Paket Kloset Duduk + Grab Bar', G.SANITASI, 'unit', 'num_beds + 4', ['num_beds'], { price: 2650000, priceNote: 'Referensi paket kloset duduk aksesibel terpasang.' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 2.6', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('railing', 'Railing Ramp Akses Ambulans & Difabel', G.FINISHING, 'm1', '26', [], { code: '3.13.5', level: 'COMPREHENSIVE' }),
      comp('listrik', 'Instalasi Titik Lampu Klinik', G.ELEKTRIKAL, 'titik', 'Math.ceil(floor_area * num_floors / 8)', ['floor_area', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('genset', 'Genset Silent 35 kVA Backup Ruang Bersalin', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.3.7', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Ruang bersalin diasumsikan 2 ruang dengan kamar mandi dalam; ramp akses dihitung 26 m linier.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk peralatan medis (bed partus, inkubator), ambulans, dan perizinan klinik.']
  }),

  // =======================================================================
  // PENDIDIKAN
  // =======================================================================
  tpl({
    id: 'BLD-EDU-VOCATIONAL',
    name: 'Gedung SMK / Sekolah Kejuruan + Bengkel Praktik',
    category: 'PENDIDIKAN',
    subcategory: 'Sekolah Kejuruan',
    description: 'Kompleks SMK per blok: ruang kelas teori, bengkel praktik (lantai floor hardener, daya 3 fase), dan ruang guru. Template per blok gedung 2 lantai dengan koridor terbuka.',
    badge: 'SMK',
    icon: 'GraduationCap',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai per Blok', 560, { min: 250, max: 1400, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 4 }),
      num('num_classrooms', 'Jumlah Ruang Kelas per Blok', 8, { min: 3, max: 24, group: 'specifications' }),
      num('workshop_area', 'Luas Bengkel Praktik', 300, { min: 0, max: 1500, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.35', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.44', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.29', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.145', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 10.5', ['floor_area', 'num_floors'], { code: '2.2.1.1.3' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'floor_area * num_floors * 1.6', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 3.2', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('lantai-kelas', 'Lantai Ubin PC 40x40 Kelas & Koridor', G.LANTAI, 'm2', 'floor_area * num_floors * 0.95', ['floor_area', 'num_floors'], { code: '3.9.1.3' }),
      comp('lantai-bengkel', 'Floor Hardener Lantai Bengkel Praktik', G.LANTAI, 'm2', 'workshop_area', ['workshop_area'], { code: '3.9.9.9', condition: 'workshop_area > 0' }),
      comp('papan', 'Papan Tulis & Whiteboard per Kelas (Pekerjaan Kayu Lapis Formika)', G.FINISHING, 'm2', 'num_classrooms * 5.4', ['num_classrooms'], { code: '3.14.2', level: 'PROFESSIONAL', priceNote: 'Item kanonis plywood lapis formika dipakai sebagai dasar papan tulis kelas.' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 2.7', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('cat-eks', 'Pengecatan Eksterior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 0.8', ['floor_area', 'num_floors'], { code: '3.8.10.2', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Kelas', G.ELEKTRIKAL, 'titik', 'num_classrooms * 6 + num_floors * 6', ['num_classrooms', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('stopkontak', 'Instalasi Titik Stop Kontak Bengkel & Kelas', G.ELEKTRIKAL, 'unit', 'num_classrooms * 4 + 12', ['num_classrooms'], { code: '5.1.5.13', level: 'COMPREHENSIVE' }),
      comp('kloset', 'Paket Toilet Siswa (Kloset Jongkok per Unit WC)', G.SANITASI, 'unit', 'num_floors * 6', ['num_floors'], { price: 1185000, level: 'PROFESSIONAL', priceNote: 'Referensi paket WC siswa ekonomis terpasang.' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Template per blok gedung; bengkel praktik diasumsikan menyatu di lantai dasar blok yang sama.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk mesin & peralatan praktik, furniture kelas, lapangan upacara, dan pagar keliling sekolah.']
  }),

  tpl({
    id: 'BLD-EDU-KINDERGARTEN',
    name: 'Gedung TK / PAUD & Sekolah Dasar 2 Lantai',
    category: 'PENDIDIKAN',
    subcategory: 'TK & SD',
    description: 'Sekolah anak usia dini & dasar dengan kelas cerah, toilet anak skala kecil, area bermain indoor, dan detail aman anak (sudut tumpul, railing ganda). Finishing warna ceria tahan coretan.',
    badge: 'PAUD/SD',
    icon: 'Shapes',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 480, { min: 200, max: 1200, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 3 }),
      num('num_classrooms', 'Jumlah Ruang Kelas', 10, { min: 4, max: 30, group: 'specifications' }),
      num('num_child_toilets', 'Jumlah WC Anak', 12, { min: 4, max: 40, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.35', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.44', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.29', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.145', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 10.5', ['floor_area', 'num_floors'], { code: '2.2.1.1.3' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'floor_area * num_floors * 1.6', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 3.2', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Keramik Artistik 30x30 Kelas (Warna Cerah)', G.LANTAI, 'm2', 'floor_area * num_floors * 0.92', ['floor_area', 'num_floors'], { code: '3.9.7.4' }),
      comp('keramik-wc', 'Dinding Keramik 20x20 WC Anak', G.DINDING, 'm2', 'num_child_toilets * 5.5', ['num_child_toilets'], { code: '3.10.1.4', level: 'PROFESSIONAL' }),
      comp('wc-anak', 'Paket WC Anak (Kloset Jongkok Anak + Kran)', G.SANITASI, 'unit', 'num_child_toilets', ['num_child_toilets'], { price: 985000, priceNote: 'Referensi paket WC anak skala kecil terpasang.' }),
      comp('wastafel', 'Wastafel Anak & Guru', G.SANITASI, 'buah', 'num_child_toilets', ['num_child_toilets'], { code: '3.18.1.1', price: 1250000, level: 'PROFESSIONAL' }),
      comp('railing', 'Railing Tangga Dua Level Tinggi (Anak & Dewasa)', G.FINISHING, 'm1', 'num_floors * 22', ['num_floors'], { code: '3.13.5', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru (Warna Cerah)', G.FINISHING, 'm2', 'floor_area * num_floors * 2.7', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('cat-eks', 'Pengecatan Eksterior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 0.8', ['floor_area', 'num_floors'], { code: '3.8.10.2', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Kelas', G.ELEKTRIKAL, 'titik', 'num_classrooms * 5 + num_floors * 6', ['num_classrooms', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('taman-bermain', 'Area Bermain Luar: Rubber Safety Tile & Rumput Sintetis Anak', G.LANSKAP, 'm2', 'floor_area * 0.22', ['floor_area'], { price: 425000, level: 'COMPREHENSIVE', priceNote: 'Referensi permukaan aman anak (rubber tile/rumput sintetis playground) terpasang; peralatan main besar di luar paket.' }),
      comp('naungan-bermain', 'Naungan Area Bermain (Canopy Membrane Kecil) & Pagar Pengaman Anak', G.LANSKAP, 'm2', 'floor_area * 0.1', ['floor_area'], { price: 685000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi naungan tensile kecil + pagar aman anak proporsional area bermain utama.' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Tinggi wastafel & WC disesuaikan anak (di luar perhitungan volume — pekerjaan sipil standar).'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk alat permainan outdoor, furniture kelas, dan pagar pengaman halaman.']
  }),

  tpl({
    id: 'BLD-EDU-TRAINING',
    name: 'Gedung Diklat / Training Center + Asrama Peserta',
    category: 'PENDIDIKAN',
    subcategory: 'Pusat Diklat',
    description: 'Pusat pelatihan dengan ruang kelas seminar, auditorium kecil, asrama peserta, dan ruang makan komunal. Satu template terpadu untuk kompleks diklat instansi/perusahaan.',
    badge: 'Diklat',
    icon: 'Presentation',
    parameters: [
      num('class_area', 'Luas Blok Kelas & Auditorium', 900, { min: 300, max: 3000, unit: 'm²' }),
      num('num_dorm_rooms', 'Jumlah Kamar Asrama Peserta', 40, { min: 10, max: 160, group: 'specifications' }),
      num('auditorium_seats', 'Kapasitas Auditorium (Kursi)', 150, { min: 50, max: 600, group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai Blok Kelas', 3, { min: 1, max: 6 })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Kompleks', G.PERSIAPAN, 'm2', 'class_area * 1.6', ['class_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'class_area * 0.5', ['class_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'class_area * 0.3', ['class_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Kelas + Asrama)', G.STRUKTUR, 'm3', 'class_area * 0.32', ['class_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'class_area * 26', ['class_area'], { code: '2.2.1.1.4' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'class_area * 3.4', ['class_area'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'class_area * 6.6', ['class_area'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Ubin Granit 60x60 Kelas & Lobi', G.LANTAI, 'm2', 'class_area * 1.9', ['class_area'], { code: '3.9.5.3' }),
      comp('lantai-asrama', 'Lantai Ubin PC 60x60 Kamar Asrama', G.LANTAI, 'm2', 'num_dorm_rooms * 21', ['num_dorm_rooms'], { code: '3.9.1.4', level: 'PROFESSIONAL' }),
      comp('plafon-akustik', 'Plafon Akustik 30x60 Auditorium & Kelas Seminar', G.ATAP, 'm2', 'auditorium_seats * 1.6 + class_area * 0.4', ['auditorium_seats', 'class_area'], { code: '3.5.1.2', level: 'PROFESSIONAL' }),
      comp('sanitair-asrama', 'Paket Sanitair Kamar Asrama (Kloset, Wastafel, Shower)', G.SANITASI, 'unit', 'num_dorm_rooms', ['num_dorm_rooms'], { price: 5450000, priceNote: 'Referensi paket sanitair kamar asrama terpasang.' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'class_area * 5.4', ['class_area'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Kompleks', G.ELEKTRIKAL, 'titik', 'Math.ceil(class_area / 6) + num_dorm_rooms * 2', ['class_area', 'num_dorm_rooms'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('data', 'Kabel UTP CAT 6 Kelas & Auditorium', G.ELEKTRIKAL, 'm1', 'class_area * 0.8', ['class_area'], { code: '5.1.1.10.1', level: 'COMPREHENSIVE' }),
      comp('wifi', 'Wireless Access Point Area Komunal', G.ELEKTRIKAL, 'unit', 'num_floors * 2', ['num_floors'], { code: '5.4.5.20', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Blok asrama diasumsikan menempel blok kelas (satu kompleks, struktur sejenis) dengan kamar 21 m² per unit.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk furniture kelas & asrama, peralatan AV auditorium, dapur komersial, dan kendaraan operasional.']
  }),

  tpl({
    id: 'BLD-EDU-LIBRARY',
    name: 'Perpustakaan & Learning Commons 3 Lantai',
    category: 'PENDIDIKAN',
    subcategory: 'Perpustakaan',
    description: 'Gedung perpustakaan modern: ruang koleksi rak beban berat, ruang baca terbuka, ruang diskusi kaca, dan co-learning space. Slab diperkuat untuk beban rak buku 7,5 kN/m².',
    badge: 'Perpustakaan',
    icon: 'BookOpen',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 700, { min: 300, max: 2000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 3, { min: 1, max: 6 }),
      num('stack_area', 'Luas Area Koleksi (Rak Buku)', 800, { min: 200, max: 3000, unit: 'm²', group: 'specifications' }),
      num('num_discussion', 'Jumlah Ruang Diskusi', 8, { min: 2, max: 30, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.3', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.46', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.3', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Slab Beban Rak Diperkuat)', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.17', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 14 + stack_area * 2', ['floor_area', 'num_floors', 'stack_area'], { code: '2.2.1.1.4' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'floor_area * num_floors * 1.2', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 2.4', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('karpet', 'Karpet Tile Ruang Baca + Underlayer (Redam Suara)', G.LANTAI, 'm2', 'floor_area * num_floors * 0.72', ['floor_area', 'num_floors'], { code: '3.9.9.2', level: 'PROFESSIONAL' }),
      comp('parquet', 'Lantai Parquet Kayu Solid Ruang Baca Premium', G.LANTAI, 'm2', 'floor_area * 0.5', ['floor_area'], { code: '3.9.9.4', level: 'COMPREHENSIVE', optional: true }),
      comp('partisi-kaca', 'Partisi Kaca Ruang Diskusi', G.DINDING, 'm2', 'num_discussion * 11', ['num_discussion'], { code: '3.11.1.5', level: 'PROFESSIONAL' }),
      comp('plafon', 'Plafon Akustik 60x120', G.ATAP, 'm2', 'floor_area * num_floors * 0.85', ['floor_area', 'num_floors'], { code: '3.5.1.3', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 2', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Baca (TLED Balk)', G.ELEKTRIKAL, 'unit', 'Math.ceil(floor_area * num_floors / 9)', ['floor_area', 'num_floors'], { code: '5.3.1.14', level: 'PROFESSIONAL' }),
      comp('data', 'Kabel UTP CAT 6 Meja Baca & OPAC', G.ELEKTRIKAL, 'm1', 'floor_area * num_floors * 0.35', ['floor_area', 'num_floors'], { code: '5.1.1.10.1', level: 'COMPREHENSIVE' }),
      comp('deteksi', 'Terminal Box Fire Alarm Lengkap Modul per Lantai', G.MEKANIKAL, 'unit', 'num_floors * 2', ['num_floors'], { code: '5.4.1.6', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Area koleksi diasumsikan memerlukan slab lebih tebal/kaku; penulangan tambahan dihitung proporsional terhadap luas area rak.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk rak buku & furniture baca, sistem RFID/sirkulasi, koleksi buku, dan server perpustakaan digital.']
  }),

  // =======================================================================
  // INDUSTRI (+5; 2 legacy: warehouse & workshop sudah ada)
  // =======================================================================
  tpl({
    id: 'BLD-IND-FOODFACTORY',
    name: 'Pabrik Makanan & Minuman (Higienis Food-Grade)',
    category: 'INDUSTRI',
    subcategory: 'Pabrik F&B',
    description: 'Pabrik pengolahan makanan standar higienis: lantai epoxy food-grade, dinding panel sandwich cuci, drainase stainless, dan ruang produksi bertekanan positif. Struktur baja portal frame.',
    badge: 'Food-Grade',
    icon: 'Factory',
    parameters: [
      num('production_area', 'Luas Area Produksi', 1600, { min: 400, max: 8000, unit: 'm²' }),
      num('building_length', 'Panjang Bangunan', 80, { min: 30, max: 300, unit: 'm' }),
      num('building_width', 'Lebar Bangunan', 25, { min: 12, max: 80, unit: 'm' }),
      num('office_area', 'Luas Kantor & Laboratorium QC', 300, { min: 100, max: 1500, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'production_area * 1.4', ['production_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'production_area * 0.38', ['production_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Semi Mekanis', G.PONDASI, 'm3', 'production_area * 0.24', ['production_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Struktur & Slab Lantai Produksi fc 15 MPa', G.STRUKTUR, 'm3', 'production_area * 0.24', ['production_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'production_area * 13', ['production_area'], { code: '2.2.1.1.4' }),
      comp('baja', 'Struktur Baja Portal Frame (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'production_area * 30', ['production_area'], { code: '2.3.1.1', price: 39800, priceNote: 'Komposisi resolver PARTIAL — fallback referensi baja fabrikasi terpasang.' }),
      comp('hardener', 'Floor Hardener Slab Produksi (Base Epoxy)', G.LANTAI, 'm2', 'production_area * 0.97', ['production_area'], { code: '3.9.9.9' }),
      comp('epoxy', 'Epoxy Food-Grade Lantai Produksi 3 mm Self-Leveling', G.LANTAI, 'm2', 'production_area * 0.97', ['production_area'], { price: 285000, level: 'PROFESSIONAL', priceNote: 'Referensi epoxy food-grade 3 mm terpasang termasuk cove skirting.' }),
      comp('panel', 'Dinding Panel Sandwich PU Area Produksi (Cuci Berkala)', G.DINDING, 'm2', '(building_length + building_width) * 2 * 4.2 * 0.7', ['building_length', 'building_width'], { price: 685000, level: 'PROFESSIONAL', priceNote: 'Referensi panel sandwich PU 75 mm terpasang.' }),
      comp('drainase-ss', 'Saluran Drainase Stainless + Grating Area Produksi', G.DRAINASE, 'm1', 'production_area * 0.22', ['production_area'], { price: 895000, level: 'PROFESSIONAL', priceNote: 'Referensi drainase stainless 304 + grating terpasang.' }),
      comp('gtrap', 'Grease Trap Central Fiberglass kap. 5 m³', G.SANITASI, 'unit', '1', [], { code: '6.2.3.3', level: 'PROFESSIONAL' }),
      comp('atap', 'Penutup Atap UPVC + Insulasi Foam', G.ATAP, 'm2', 'production_area * 1.1', ['production_area'], { code: '3.1.3.5', level: 'PROFESSIONAL' }),
      comp('foam', 'Foam Insulasi Atap Produksi', G.ATAP, 'm2', 'production_area * 1.1', ['production_area'], { code: '3.2.3', level: 'COMPREHENSIVE' }),
      comp('rolling', 'Rolling Door Besi Loading Dock', G.KUSEN, 'm2', '48', [], { code: '3.11.1.1', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Highbay Produksi (Lampu Sorot LED setara)', G.ELEKTRIKAL, 'unit', 'Math.ceil(production_area / 45)', ['production_area'], { code: '5.3.1.9', level: 'PROFESSIONAL' }),
      comp('panel-ahu', 'Panel Power AHU & Ventilasi Produksi', G.ELEKTRIKAL, 'unit', '2', [], { code: '5.1.2.18', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Tinggi dinding produksi diasumsikan 4,2 m area panel sandwich; slab produksi 20 cm dengan hardener + epoxy.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk mesin produksi, cold room, boiler & utilitas proses, IPAL industri, dan sertifikasi BPOM/HACCP.']
  }),

  tpl({
    id: 'BLD-IND-COLDSTORAGE',
    name: 'Gudang Pendingin (Cold Storage) Panel Insulasi',
    category: 'INDUSTRI',
    subcategory: 'Cold Storage',
    description: 'Fasilitas cold storage dengan panel insulasi PU tebal untuk chiller & freezer, lantai beton insulasi + vapor barrier, dan anteroom. Mesin refrigerasi oleh vendor (di luar lingkup).',
    badge: 'Cold Storage',
    icon: 'Snowflake',
    parameters: [
      num('storage_area', 'Luas Ruang Simpan Dingin', 900, { min: 200, max: 5000, unit: 'm²' }),
      num('wall_height', 'Tinggi Dinding Panel', 6, { min: 4, max: 12, unit: 'm', group: 'specifications' }),
      num('building_length', 'Panjang Bangunan', 45, { min: 15, max: 200, unit: 'm' }),
      num('building_width', 'Lebar Bangunan', 20, { min: 10, max: 80, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'storage_area * 1.35', ['storage_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'storage_area * 0.36', ['storage_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Semi Mekanis', G.PONDASI, 'm3', 'storage_area * 0.23', ['storage_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Slab & Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'storage_area * 0.26', ['storage_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'storage_area * 14', ['storage_area'], { code: '2.2.1.1.4' }),
      comp('baja', 'Struktur Baja Portal (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'storage_area * 27', ['storage_area'], { code: '2.3.1.1', price: 39800 }),
      comp('panel-dinding', 'Panel Insulasi PU 100 mm Dinding Cold Room', G.DINDING, 'm2', '(building_length + building_width) * 2 * wall_height', ['building_length', 'building_width', 'wall_height'], { price: 845000, priceNote: 'Referensi panel PU 100 mm food-safe terpasang termasuk flashing & sealant.' }),
      comp('panel-plafon', 'Panel Insulasi PU 100 mm Plafon Cold Room', G.ATAP, 'm2', 'storage_area * 1.02', ['storage_area'], { price: 825000, level: 'PROFESSIONAL' }),
      comp('lantai-insulasi', 'Lantai Beton Insulasi XPS + Vapor Barrier + Heating Wire Grid', G.LANTAI, 'm2', 'storage_area', ['storage_area'], { price: 565000, level: 'PROFESSIONAL', priceNote: 'Referensi paket lantai freezer anti frost-heave terpasang.' }),
      comp('hardener', 'Floor Hardener Permukaan Lantai Simpan', G.LANTAI, 'm2', 'storage_area * 0.98', ['storage_area'], { code: '3.9.9.9' }),
      comp('pintu-cold', 'Pintu Sliding Cold Room Insulasi (per Pintu 1,2x2,4 m)', G.KUSEN, 'unit', 'Math.ceil(storage_area / 220)', ['storage_area'], { price: 24500000, level: 'PROFESSIONAL', priceNote: 'Referensi pintu geser cold room + heater frame terpasang.' }),
      comp('dock', 'Dock Leveler & Seal Area Bongkar Muat', G.KHUSUS, 'unit', 'Math.ceil(storage_area / 300)', ['storage_area'], { price: 38500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi dock leveler hidrolik + dock seal terpasang.' }),
      comp('listrik', 'Instalasi Lampu TLED Dust Proof Ruang Simpan', G.ELEKTRIKAL, 'unit', 'Math.ceil(storage_area / 28)', ['storage_area'], { code: '5.3.1.13', level: 'PROFESSIONAL' }),
      comp('genset', 'Genset Silent 100 kVA Backup Refrigerasi', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.3.2', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Suhu simpan diasumsikan chiller 0–4°C & freezer −18°C campuran; ketebalan panel 100 mm.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk mesin refrigerasi (kompresor, evaporator, kondensor), racking pallet, forklift, dan sistem monitoring suhu.']
  }),

  tpl({
    id: 'BLD-IND-WORKSHOP-FAB',
    name: 'Workshop Fabrikasi Baja & Perbengkelan Berat',
    category: 'INDUSTRI',
    subcategory: 'Workshop Fabrikasi',
    description: 'Bengkel fabrikasi baja dengan rel crane overhead (pekerjaan sipil rel & kolom corbel), area pengelasan, dan lantai beton beban berat. Berbeda dari workshop legacy: fokus fabrikasi baja berat + crane.',
    badge: 'Fabrikasi Baja',
    icon: 'Wrench',
    parameters: [
      num('workshop_area', 'Luas Area Workshop', 1200, { min: 300, max: 6000, unit: 'm²' }),
      num('crane_capacity', 'Kapasitas Overhead Crane (ton)', 10, { min: 3, max: 32, unit: 'ton', group: 'specifications' }),
      num('building_length', 'Panjang Bangunan', 60, { min: 24, max: 240, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'workshop_area * 1.35', ['workshop_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'workshop_area * 0.4', ['workshop_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Semi Mekanis', G.PONDASI, 'm3', 'workshop_area * 0.25', ['workshop_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Struktur & Slab Beban Berat fc 15 MPa', G.STRUKTUR, 'm3', 'workshop_area * 0.3', ['workshop_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'workshop_area * 15', ['workshop_area'], { code: '2.2.1.1.4' }),
      comp('wiremesh', 'Wiremesh M6–M10 Slab Workshop', G.STRUKTUR, 'kg', 'workshop_area * 7.8', ['workshop_area'], { code: '2.2.1.1.5', level: 'PROFESSIONAL' }),
      comp('baja', 'Struktur Baja Utama + Kolom Corbel Crane (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'workshop_area * 34', ['workshop_area'], { code: '2.3.1.1', price: 39800 }),
      comp('rel-crane', 'Rel & Girder Crane Runway (Baja Pelat Semi Mekanis)', G.STRUKTUR, 'kg', 'building_length * 2 * crane_capacity * 4.4', ['building_length', 'crane_capacity'], { code: '2.3.1.4', level: 'PROFESSIONAL' }),
      comp('baut', 'Pemasangan Mur & Baut Struktur', G.STRUKTUR, 'kg', 'workshop_area * 0.85', ['workshop_area'], { code: '2.3.1.3', level: 'PROFESSIONAL' }),
      comp('cat-baja', 'Pengecatan Baja Meni Besi', G.FINISHING, 'm2', 'workshop_area * 1.15', ['workshop_area'], { code: '3.8.16', level: 'PROFESSIONAL' }),
      comp('hardener', 'Floor Hardener Lantai Workshop', G.LANTAI, 'm2', 'workshop_area * 0.97', ['workshop_area'], { code: '3.9.9.9' }),
      comp('atap', 'Penutup Atap UPVC + Skylight Sebagian', G.ATAP, 'm2', 'workshop_area * 1.08', ['workshop_area'], { code: '3.1.3.5', level: 'PROFESSIONAL' }),
      comp('rolling', 'Rolling Door Besi Akses Material', G.KUSEN, 'm2', '60', [], { code: '3.11.1.1', level: 'PROFESSIONAL' }),
      comp('las', 'Pengelasan Listrik Sambungan Lapangan', G.KHUSUS, 'm1', 'workshop_area * 0.3', ['workshop_area'], { code: '3.13.3', level: 'COMPREHENSIVE' }),
      comp('listrik', 'Lampu Sorot LED 100 W Area Kerja', G.ELEKTRIKAL, 'unit', 'Math.ceil(workshop_area / 60)', ['workshop_area'], { code: '5.3.1.9', level: 'PROFESSIONAL' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Crane runway diasumsikan 2 sisi sepanjang bangunan; berat girder proporsional terhadap kapasitas crane.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk unit crane & hoist, mesin las & peralatan fabrikasi, dust collector, dan instalasi gas industri.']
  }),

  tpl({
    id: 'BLD-IND-MULTITENANT',
    name: 'Gudang Multi-Tenant Logistik (Big Box)',
    category: 'INDUSTRI',
    subcategory: 'Gudang Logistik',
    description: 'Gudang logistik modern tinggi 9–12 m dengan dock leveler multi-pintu, sprinkler ESFR dasar, dan kantor mezzanine. Untuk kawasan logistik & e-commerce fulfillment.',
    badge: 'Big Box',
    icon: 'Warehouse',
    parameters: [
      num('warehouse_area', 'Luas Area Gudang', 5000, { min: 1500, max: 30000, unit: 'm²' }),
      num('num_docks', 'Jumlah Pintu Dock', 8, { min: 2, max: 40, group: 'specifications' }),
      num('clear_height', 'Tinggi Bersih Gudang', 10, { min: 7, max: 14, unit: 'm', group: 'specifications' }),
      num('office_area', 'Luas Kantor Mezzanine', 400, { min: 100, max: 2000, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'warehouse_area * 1.3', ['warehouse_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'warehouse_area * 0.3', ['warehouse_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Semi Mekanis', G.PONDASI, 'm3', 'warehouse_area * 0.19', ['warehouse_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Slab Gudang & Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'warehouse_area * 0.23', ['warehouse_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'warehouse_area * 12', ['warehouse_area'], { code: '2.2.1.1.4' }),
      comp('baja', 'Struktur Baja Portal Gudang (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'warehouse_area * (22 + clear_height)', ['warehouse_area', 'clear_height'], { code: '2.3.1.1', price: 39800, priceNote: 'Berat baja proporsional terhadap tinggi bersih (asumsi rekayasa dinyatakan).' }),
      comp('hardener', 'Floor Hardener Slab Gudang (Superflat dasar)', G.LANTAI, 'm2', 'warehouse_area * 0.98', ['warehouse_area'], { code: '3.9.9.9' }),
      comp('dinding-metal', 'Dinding Metal Cladding Keliling Gudang', G.DINDING, 'm2', 'warehouse_area * 0.62 * clear_height / 10', ['warehouse_area', 'clear_height'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi cladding metal sheet + rangka terpasang.' }),
      comp('atap', 'Penutup Atap UPVC Atap Gudang', G.ATAP, 'm2', 'warehouse_area * 1.06', ['warehouse_area'], { code: '3.1.3.5', level: 'PROFESSIONAL' }),
      comp('insulasi', 'Foam Insulasi Atap Gudang', G.ATAP, 'm2', 'warehouse_area * 1.06', ['warehouse_area'], { code: '3.2.3', level: 'COMPREHENSIVE' }),
      comp('dock-door', 'Pintu Dock Sectional + Leveler per Pintu', G.KUSEN, 'unit', 'num_docks', ['num_docks'], { price: 68500000, level: 'PROFESSIONAL', priceNote: 'Referensi paket pintu sectional insulated + dock leveler + seal terpasang.' }),
      comp('sprinkler', 'Sprinkler Head Upright Area Gudang', G.MEKANIKAL, 'unit', 'warehouse_area / 9', ['warehouse_area'], { code: '5.6.2.2', level: 'PROFESSIONAL' }),
      comp('lampu', 'Lampu TLED Dust Proof Gudang (Highbay setara)', G.ELEKTRIKAL, 'unit', 'Math.ceil(warehouse_area / 42)', ['warehouse_area'], { code: '5.3.1.13', level: 'PROFESSIONAL' }),
      comp('kantor', 'Fit-Out Kantor Mezzanine (Partisi Gypsum + Plafon + Cat)', G.FINISHING, 'm2', 'office_area', ['office_area'], { price: 1485000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi paket fit-out kantor standar terpasang.' }),
      comp('apar', 'Fire Extinguisher 25 kg Area Gudang', G.MEKANIKAL, 'unit', 'Math.ceil(warehouse_area / 800)', ['warehouse_area'], { code: '5.6.3.3', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Berat baja diasumsikan naik proporsional dengan tinggi bersih; slab gudang 20 cm untuk beban racking & forklift standar.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk racking, forklift & MHE, sistem WMS, pompa & tangki fire fighting utama, dan pekerjaan tanah kawasan.']
  }),

  tpl({
    id: 'BLD-IND-POULTRY',
    name: 'Kandang Ayam Closed House Modern',
    category: 'INDUSTRI',
    subcategory: 'Peternakan Modern',
    description: 'Kandang ayam broiler closed house dengan tunnel ventilation: struktur baja ringan, dinding tirai/insulasi, lantai beton, dan area service. Peralatan kandang (fan, cooling pad, feeder line) oleh vendor.',
    badge: 'Closed House',
    icon: 'Egg',
    parameters: [
      num('house_length', 'Panjang Kandang', 100, { min: 40, max: 200, unit: 'm' }),
      num('house_width', 'Lebar Kandang', 12, { min: 8, max: 20, unit: 'm' }),
      num('num_floors', 'Jumlah Lantai Kandang (Postal)', 2, { min: 1, max: 4, group: 'specifications' }),
      num('capacity', 'Kapasitas Populasi (ekor)', 40000, { min: 5000, max: 200000, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'house_length * house_width * 1.3', ['house_length', 'house_width'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'house_length * house_width * 0.3', ['house_length', 'house_width'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'house_length * house_width * 0.2', ['house_length', 'house_width'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Slab Lantai Kandang & Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'house_length * house_width * num_floors * 0.14', ['house_length', 'house_width', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'house_length * house_width * num_floors * 8', ['house_length', 'house_width', 'num_floors'], { code: '2.2.1.1.3' }),
      comp('baja-ringan', 'Rangka Atap Pelana Baja Ringan C75', G.ATAP, 'm2', 'house_length * house_width * 1.15', ['house_length', 'house_width'], { code: '2.1.1.1' }),
      comp('atap', 'Penutup Atap Serat Semen Gelombang', G.ATAP, 'm2', 'house_length * house_width * 1.15', ['house_length', 'house_width'], { code: '3.1.2.1', level: 'PROFESSIONAL' }),
      comp('insulasi', 'Lembaran Insulasi Atap Kandang (Kontrol Suhu)', G.ATAP, 'm2', 'house_length * house_width * 1.15', ['house_length', 'house_width'], { code: '3.2.1', level: 'PROFESSIONAL' }),
      comp('tirai', 'Dinding Tirai Plastik & Panel Ujung Kandang', G.DINDING, 'm2', 'house_length * 2 * 1.6 * num_floors', ['house_length', 'num_floors'], { price: 148000, level: 'PROFESSIONAL', priceNote: 'Referensi tirai kandang + mekanisme winch manual terpasang.' }),
      comp('lantai-kerja', 'Lantai Kerja Beton Mutu Rendah Area Servis', G.LANTAI, 'm2', 'house_length * 3', ['house_length'], { price: 265000, priceNote: 'Referensi rabat beton t=8 cm area servis & gudang pakan.' }),
      comp('listrik', 'Instalasi Titik Lampu Kandang (LED Kuning)', G.ELEKTRIKAL, 'titik', 'house_length * num_floors * 0.8', ['house_length', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('panel', 'Panel Kontrol Kandang (Ventilasi & Penerangan)', G.ELEKTRIKAL, 'unit', 'num_floors', ['num_floors'], { price: 18500000, level: 'COMPREHENSIVE', priceNote: 'Referensi panel kontrol kandang semi-otomatis terpasang; controller iklim oleh vendor.' }),
      comp('genset', 'Genset Silent 75 kVA Backup Kandang (Kritis Ventilasi)', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.3.1', level: 'COMPREHENSIVE', optional: true }),
      comp('sumur', 'Pengeboran Sumur Bor Air Tanah Dangkal (Sumber Air Kandang)', G.SANITASI, 'm1', '36', [], { code: 'A.3.08.1a.1', price: 685000, level: 'COMPREHENSIVE', priceNote: 'Komposisi resolver PARTIAL & item kanonis hanya pengeboran — fallback referensi paket sumur bor + casing per meter.' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Kandang postal 2 lantai diasumsikan struktur kolom beton + slab; peralatan iklim (fan, cooling pad, heater) oleh vendor kandang.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk peralatan kandang (feeder/drinker line, fan, cooling pad, controller), silo pakan, dan instalasi gas pemanas.']
  }),
];
