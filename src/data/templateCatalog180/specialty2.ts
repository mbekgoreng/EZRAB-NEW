/**
 * Katalog 180 — FINISHING_INTERIOR (6 baru), ATAP_WATERPROOFING (5 baru),
 * LANDSCAPE_SITE (+4), MEP_SYSTEM (+7).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { G, num, sel, comp, tpl } from './builders';

const ASUMSI = [
  'Nilai default parameter adalah asumsi awal berlabel untuk estimasi, bukan data pengukuran lapangan.',
  'Harga resmi hanya untuk komponen berkode AHSP 2026 kanonis yang lolos gerbang resolver; sisanya harga referensi pasar 2026.'
];
const EKSKLUSI = [
  'Tidak termasuk loose furniture, peralatan operasional & artwork (FF&E lepas) kecuali dinyatakan.',
  'Tidak termasuk perizinan & biaya utilitas penyambungan baru.'
];

export const SPECIALTY_TEMPLATES_B: RabTemplate[] = [
  // =======================================================================
  // FINISHING & INTERIOR (6)
  // =======================================================================
  tpl({
    id: 'FIN-OFFICE-FITOUT',
    name: 'Fit-Out Kantor (Interior Corporate per Lantai)',
    category: 'FINISHING_INTERIOR',
    subcategory: 'Fit-Out Kantor',
    description: 'Paket fit-out interior kantor modern: partisi gypsum & kaca, plafon akustik, lantai vinyl/karpet tile, cat, pintu kantor, dan pencahayaan kerja. Di gedung shell & core eksisting.',
    badge: 'Fit-Out',
    icon: 'Briefcase',
    parameters: [
      num('floor_area', 'Luas Lantai Fit-Out', 650, { min: 100, max: 5000, unit: 'm²' }),
      num('partition_ratio', 'Rasio Partisi Ruangan (%)', 22, { min: 5, max: 60, unit: '%', group: 'specifications' }),
      num('num_meeting', 'Jumlah Ruang Meeting', 4, { min: 0, max: 30, group: 'specifications' })
    ],
    components: [
      comp('partisi-gypsum', 'Partisi Gypsum 1 Muka + Plester + Rangka Semi Mekanis', G.DINDING, 'm2', 'floor_area * partition_ratio / 100 * 2.9 * 0.62', ['floor_area', 'partition_ratio'], { code: '3.7.3' }),
      comp('partisi-kaca', 'Partisi Kaca Frame Aluminium (Meeting & Manager)', G.DINDING, 'm2', 'floor_area * partition_ratio / 100 * 2.9 * 0.38', ['floor_area', 'partition_ratio'], { price: 1085000, priceNote: 'Referensi partisi kaca tempered 10 mm + frame aluminium anodized terpasang.' }),
      comp('plafon', 'Plafon Akustik Tile + Rangka', G.DINDING, 'm2', 'floor_area * 0.94', ['floor_area'], { code: '3.9.6' }),
      comp('list-plafon', 'List Profil Gypsum Keliling Plafon', G.DINDING, 'm1', 'floor_area * 0.5', ['floor_area'], { code: '3.9.9', level: 'COMPREHENSIVE' }),
      comp('vinyl', 'Lantai Vinyl Sheet Premium Work Area', G.LANTAI, 'm2', 'floor_area * 0.55', ['floor_area'], { code: '3.10.4' }),
      comp('karpet', 'Karpet Tile Ruang Meeting & Direksi (Paket per m²)', G.LANTAI, 'm2', 'floor_area * 0.3', ['floor_area'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi karpet tile nylon terpasang termasuk underlay & pola.' }),
      comp('keramik', 'Lantai Keramik Pantry & Toilet', G.LANTAI, 'm2', 'floor_area * 0.1', ['floor_area'], { code: '3.10.1.4' }),
      comp('cat', 'Cat Interior Dinding & Partisi', G.FINISHING, 'm2', 'floor_area * partition_ratio / 100 * 2.9 * 1.24 + floor_area * 0.18', ['floor_area', 'partition_ratio'], { code: '3.8.10.1' }),
      comp('pintu', 'Pintu Kantor Engineering + Kusen Aluminium', G.KUSEN, 'buah', 'num_meeting + floor_area / 85', ['num_meeting', 'floor_area'], { price: 3850000, level: 'PROFESSIONAL', priceNote: 'Referensi pintu HPL/engineering setara kusen aluminium + handle & kunci.' }),
      comp('lampu', 'Titik Lampu Kerja LED Panel (Instalasi)', G.ELEKTRIKAL, 'titik', 'floor_area / 9', ['floor_area'], { code: '5.3.1.24', level: 'PROFESSIONAL' }),
      comp('roller', 'Roller Blind Kantor (Paket Interior)', G.DINDING, 'm2', 'floor_area * 0.16', ['floor_area'], { price: 325000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi roller blind blackout/sheer terpasang.' }),
      comp('plint', 'Plint & Proteksi Sudut Ruang (Paket per m² Lantai)', G.FINISHING, 'm2', 'floor_area', ['floor_area'], { price: 22500, level: 'COMPREHENSIVE', priceNote: 'Referensi plint vinyl/PVC + corner guard jalur sirkulasi.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk pekerjaan MEP utama (di template MEP), furniture meja/kursi, dan branding signage.']
  }),

  tpl({
    id: 'FIN-RETAIL-FITOUT',
    name: 'Fit-Out Retail & F&B (Tenant Mall/Shophouse)',
    category: 'FINISHING_INTERIOR',
    subcategory: 'Fit-Out Retail',
    description: 'Paket fit-out tenant retail/kafe: fasad toko kaca, lantai polished, plafon terbuka cat hitam sebagian, dapur F&B dasar (grease trap, water), dan signage dasar. Menyesuaikan manual fit-out mall.',
    badge: 'Retail',
    icon: 'Store',
    parameters: [
      num('unit_area', 'Luas Unit Tenant', 180, { min: 40, max: 1500, unit: 'm²' }),
      sel('tenant_type', 'Tipe Tenant', [{ label: 'Retail Fashion', value: 'retail' }, { label: 'F&B / Kafe / Resto', value: 'fnb' }], 'fnb')
    ],
    components: [
      comp('fasad', 'Fasad Toko Kaca Tempered + Frame (Lebar Acuan 10 m per Unit)', G.DINDING, 'm2', '30', [], { price: 1285000, priceNote: 'Referensi fasad toko kaca + pintu geser manual (luas acuan tetap 30 m² — sesuaikan lebar toko aktual).' }),
      comp('lantai-polish', 'Screed & Poles Beton Lantai Retail (Pekerjaan Pemasangan Keramik setara Paket Poles)', G.LANTAI, 'm2', 'unit_area * 0.9', ['unit_area'], { price: 245000, priceNote: 'Referensi screed + poles beton dekoratif terpasang (bukan harga item kanonis).' }),
      comp('plafon-terbuka', 'Plafon Terbuka Cat Hitam Ducting & Cat Semprot Struktur', G.DINDING, 'm2', 'unit_area * 0.85', ['unit_area'], { code: '3.8.13' }),
      comp('plafon-gypsum', 'Plafon Gypsum Area Kasir & Dapur', G.DINDING, 'm2', 'unit_area * 0.3', ['unit_area'], { code: '3.9.3' }),
      comp('partisi', 'Partisi Gypsum Dapur & Gudang 1 Muka', G.DINDING, 'm2', 'unit_area * 0.22', ['unit_area'], { code: '3.7.3' }),
      comp('keramik-dapur', 'Keramik Dinding Dapur & Area Basah', G.LANTAI, 'm2', 'unit_area * 0.18', ['unit_area'], { code: '3.10.2.9', level: 'PROFESSIONAL' }),
      comp('grease', 'Grease Trap Bawah Tanah Stainless/Komposit (Paket F&B)', G.SANITASI, 'unit', '1', [], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi grease trap termasuk galian & sambungan buangan dapur.' }),
      comp('bak-cuci', 'Bak Cuci Stainless Dapur Komersial per Meter', G.SANITASI, 'm1', '4', [], { code: '6.3.4', level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis bak cuci porselen per m.' }),
      comp('meja', 'Meja Beton Kasir & Bar + Finishing', G.DINDING, 'm1', 'unit_area * 0.06', ['unit_area'], { code: '3.7.10', level: 'COMPREHENSIVE' }),
      comp('signage', 'Signage Huruf Timbul Dasar Toko (Paket)', G.KHUSUS, 'unit', '1', [], { price: 12500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi huruf timbul akrilik + LED dasar (desain brand di luar paket).' }),
      comp('lampu', 'Titik Lampu Track & Accent Retail (Instalasi)', G.ELEKTRIKAL, 'titik', 'unit_area / 7', ['unit_area'], { code: '5.3.1.24', level: 'PROFESSIONAL' })
    ],
    assumptions: [...ASUMSI, 'Lebar fasad toko diasumsikan 10 m × tinggi 3 m; luas fasad aktual mengikuti denah tenant.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk peralatan dapur komersial, kitchen exhaust khusus (template MEP), dan biaya retribusi fit-out mall.']
  }),

  tpl({
    id: 'FIN-ACOUSTIC-HALL',
    name: 'Interior Akustik Aula, Studio & Ruang Serbaguna',
    category: 'FINISHING_INTERIOR',
    subcategory: 'Akustik',
    description: 'Paket treatment akustik aula/studio: panel absorber dinding & plafon (padanan plafon akustik), panggung kayu, lantai parket area performa, peredam pintu akustik, dan finishing cat interior.',
    badge: 'Akustik',
    icon: 'AudioLines',
    parameters: [
      num('hall_area', 'Luas Lantai Aula', 420, { min: 100, max: 2000, unit: 'm²' }),
      num('wall_area', 'Luas Dinding Ditreatment', 520, { min: 150, max: 3000, unit: 'm²', group: 'specifications' })
    ],
    components: [
      comp('panel-dinding', 'Panel Akustik Dinding (Plafon Akustik Fiber setara sebagai Absorber)', G.DINDING, 'm2', 'wall_area * 0.7', ['wall_area'], { code: '3.9.5', priceNote: 'Item kanonis plafon akustik fiber dipakai sebagai padanan material absorber terpasang; panel diffuser kayu dihitung referensi.' }),
      comp('diffuser', 'Panel Diffuser Kayu Dinding Belakang (Paket per m²)', G.DINDING, 'm2', 'wall_area * 0.2', ['wall_area'], { price: 685000, level: 'PROFESSIONAL', priceNote: 'Referensi diffuser kayu QRD/slot terpasang.' }),
      comp('plafon', 'Plafon Akustik Tile Aula', G.DINDING, 'm2', 'hall_area * 0.95', ['hall_area'], { code: '3.9.6' }),
      comp('panggung', 'Panggung Kayu & Substruktur (Paket per m² Panggung)', G.LANTAI, 'm2', 'hall_area * 0.22', ['hall_area'], { price: 1285000, level: 'PROFESSIONAL', priceNote: 'Referensi panggung rangka baja/kayu + decking + finishing karpet/parket.' }),
      comp('parket', 'Lantai Parket Kayu Solid Area Performa & Depan Panggung', G.LANTAI, 'm2', 'hall_area * 0.4', ['hall_area'], { code: '3.10.6.1' }),
      comp('vinyl', 'Vinyl Sheet Area Penonton', G.LANTAI, 'm2', 'hall_area * 0.55', ['hall_area'], { code: '3.10.4', level: 'PROFESSIONAL' }),
      comp('pintu-akustik', 'Pintu Akustik Dobel Seal (Paket per Unit)', G.KUSEN, 'unit', '4', [], { price: 8850000, level: 'PROFESSIONAL', priceNote: 'Referensi pintu akustik STC 35+ terpasang (jumlah acuan 4 — sesuaikan denah).' }),
      comp('partisi-gypsum', 'Partisi Gypsum Ruang Kontrol & Backstage', G.DINDING, 'm2', 'hall_area * 0.18', ['hall_area'], { code: '3.7.3' }),
      comp('cat', 'Cat Interior Aula', G.FINISHING, 'm2', 'wall_area * 0.45 + hall_area * 0.1', ['wall_area', 'hall_area'], { code: '3.8.10.1', level: 'COMPREHENSIVE' }),
      comp('karpet', 'Karpet Area Penonton Bertingkat (Paket per m²)', G.LANTAI, 'm2', 'hall_area * 0.3', ['hall_area'], { price: 365000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi karpet broadloom area penonton.' })
    ],
    assumptions: [...ASUMSI, 'Target waktu dengung desain (RT60) ditentukan konsultan akustik; template menyediakan kuantitas treatment tipikal aula serbaguna.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk sistem audio/video/pencahayaan panggung (FF&E khusus), kursi penonton, dan sertifikasi akustik.']
  }),

  tpl({
    id: 'FIN-FACADE-SYSTEM',
    name: 'Sistem Fasad Gedung Baru (ACP + Curtain Wall + Louvre)',
    category: 'FINISHING_INTERIOR',
    subcategory: 'Fasad Gedung',
    description: 'Paket fasad gedung baru di atas struktur utama: panel ACP, curtain wall kaca sebagian, louvre sirip aluminium, dan cladding batu alam aksen. Berbeda dari renovasi fasad (bangunan baru, rangka dari awal).',
    badge: 'Fasad Baru',
    icon: 'Building',
    parameters: [
      num('facade_area', 'Luas Total Fasad', 2600, { min: 400, max: 20000, unit: 'm²' }),
      num('glass_ratio', 'Rasio Curtain Wall Kaca (%)', 35, { min: 10, max: 80, unit: '%', group: 'specifications' }),
      num('stone_ratio', 'Rasio Aksen Batu Alam (%)', 8, { min: 0, max: 30, unit: '%', group: 'specifications' })
    ],
    components: [
      comp('acp', 'Cladding ACP 4 mm + Rangka Aluminium (Paket per m²)', G.DINDING, 'm2', 'facade_area * (100 - glass_ratio - stone_ratio) / 100 * 0.92', ['facade_area', 'glass_ratio', 'stone_ratio'], { price: 885000, priceNote: 'Referensi ACP PVDF + rangka + sealant terpasang termasuk scaffolding proporsional.' }),
      comp('curtain', 'Curtain Wall Kaca Low-E Unitized/Stick (Paket per m²)', G.DINDING, 'm2', 'facade_area * glass_ratio / 100', ['facade_area', 'glass_ratio'], { price: 2485000, priceNote: 'Referensi curtain wall kaca double low-E terpasang (sistem stick; unitized konfirmasi pabrikan).' }),
      comp('batu', 'Aksen Batu Alam Andesit/Bakar Fasad', G.DINDING, 'm2', 'facade_area * stone_ratio / 100', ['facade_area', 'stone_ratio'], { code: '3.7.14', condition: 'stone_ratio > 0', level: 'PROFESSIONAL' }),
      comp('kabel-atap', 'Sling & Pipa Antena Pelengkap Atap (Pekerjaan Baja Pelat setara Akses Fasad)', G.STRUKTUR, 'kg', 'facade_area * 0.35', ['facade_area'], { code: '2.3.1.4', level: 'COMPREHENSIVE', priceNote: 'Padanan baja pelat untuk angkur & dudukan gondola/BMU sederhana.' }),
      comp('louvre', 'Louvre Sirip Aluminium Horizontal (Paket per m²)', G.DINDING, 'm2', 'facade_area * 0.18', ['facade_area'], { price: 685000, level: 'PROFESSIONAL', priceNote: 'Referensi louvre aluminium powder-coat terpasang di zona mekanikal/aksen.' }),
      comp('canopy', 'Kanopi Kaca/ACP Pintu Masuk (Paket)', G.DINDING, 'unit', '1', [], { price: 48500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi kanopi entrance utama termasuk rangka baja & kaca laminated.' }),
      comp('sealant', 'Sealant & Backer Rod Sambungan Fasad (Paket per m² Fasad)', G.DINDING, 'm2', 'facade_area', ['facade_area'], { price: 38500, level: 'COMPREHENSIVE', priceNote: 'Referensi pekerjaan sealant sambungan panel & kaca.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk struktur utama, gondola/BMU elektrik, pengujian mock-up fasad, dan pembersihan fasad berkala.']
  }),

  tpl({
    id: 'FIN-KITCHEN-BATH',
    name: 'Paket Finishing Dapur & Kamar Mandi Premium (per Unit)',
    category: 'FINISHING_INTERIOR',
    subcategory: 'Kitchen & Bath',
    description: 'Paket finishing per unit hunian premium (apartemen/vila/hotel): kitchen set custom, kamar mandi lengkap saniter premium, waterproofing area basah, dan backsplash batu. Per unit, dapat digandakan sesuai jumlah unit.',
    badge: 'Premium Unit',
    icon: 'Bath',
    parameters: [
      num('num_units', 'Jumlah Unit (Dapur + Kamar Mandi)', 12, { min: 1, max: 300, group: 'specifications' }),
      num('bathrooms_per_unit', 'Kamar Mandi per Unit', 2, { min: 1, max: 5, group: 'specifications' })
    ],
    components: [
      comp('wp', 'Waterproofing Coating Area Basah per Kamar Mandi', G.ATAP, 'm2', 'num_units * bathrooms_per_unit * 7.5', ['num_units', 'bathrooms_per_unit'], { code: '3.4.2' }),
      comp('lantai-km', 'Granit Homogen Kamar Mandi', G.LANTAI, 'm2', 'num_units * bathrooms_per_unit * 4.2', ['num_units', 'bathrooms_per_unit'], { code: '3.10.2.6' }),
      comp('dinding-km', 'Granit Dinding Kamar Mandi Semi Kering', G.LANTAI, 'm2', 'num_units * bathrooms_per_unit * 6.8', ['num_units', 'bathrooms_per_unit'], { code: '3.10.2.10', level: 'PROFESSIONAL' }),
      comp('kloset', 'Kloset Duduk Monoblok per Kamar Mandi', G.SANITASI, 'buah', 'num_units * bathrooms_per_unit', ['num_units', 'bathrooms_per_unit'], { code: '6.4.1.1', price: 3426999 }),
      comp('wastafel', 'Wastafel Meja + Kabinet Kecil per Kamar Mandi', G.SANITASI, 'buah', 'num_units * bathrooms_per_unit', ['num_units', 'bathrooms_per_unit'], { code: '6.4.4.1', level: 'PROFESSIONAL' }),
      comp('shower', 'Shower Set Tanam Premium (Paket per Kamar Mandi)', G.SANITASI, 'unit', 'num_units * bathrooms_per_unit', ['num_units', 'bathrooms_per_unit'], { price: 4850000, level: 'PROFESSIONAL', priceNote: 'Referensi shower set concealed + rain shower kelas menengah-atas.' }),
      comp('kitchen', 'Kitchen Set Custom per Unit (Kabinet Bawah + Atas + Top Granit)', G.DINDING, 'unit', 'num_units', ['num_units'], { price: 42500000, priceNote: 'Referensi kitchen set HMR/duco + top granit lokal termasuk sink & keran (panjang acuan ±4 m).' }),
      comp('backsplash', 'Backsplash Batu Alam/Keramik Dapur per Unit', G.DINDING, 'm2', 'num_units * 2.4', ['num_units'], { code: '3.10.2.9', level: 'COMPREHENSIVE' }),
      comp('pintu-km', 'Pintu Kamar Mandi UPVC/Aluminium per Unit KM', G.KUSEN, 'buah', 'num_units * bathrooms_per_unit', ['num_units', 'bathrooms_per_unit'], { price: 1850000, level: 'PROFESSIONAL', priceNote: 'Referensi pintu KM tahan air terpasang.' }),
      comp('exhaust', 'Exhaust Fan Plafon Kamar Mandi (Sambungan Instalasi)', G.ELEKTRIKAL, 'titik', 'num_units * bathrooms_per_unit', ['num_units', 'bathrooms_per_unit'], { code: '5.3.1.24', level: 'COMPREHENSIVE' }),
      comp('aksesoris', 'Aksesoris KM Premium (Tempat Sabun, Gantungan, Cermin LED) per Unit', G.SANITASI, 'unit', 'num_units * bathrooms_per_unit', ['num_units', 'bathrooms_per_unit'], { price: 2850000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi paket aksesoris kamar mandi kelas premium.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk peralatan dapur built-in (kompor tanam, oven, kulkas), water heater (template MEP/utilitas), dan pekerjaan plumbing kasar.']
  }),

  tpl({
    id: 'FIN-FLOORING-PACKAGE',
    name: 'Paket Lantai Premium Gedung (Marmer, Parket, Terrazzo)',
    category: 'FINISHING_INTERIOR',
    subcategory: 'Paket Lantai',
    description: 'Paket peningkatan lantai area premium gedung (lobi, koridor, ruang utama): screed, marmer lokal area utama, parket kayu koridor premium, terrazzo area layanan, dan poles akhir. Untuk gedung dalam tahap finishing.',
    badge: 'Lantai Premium',
    icon: 'Grid2x2',
    parameters: [
      num('floor_area', 'Luas Area Lantai Premium', 1200, { min: 200, max: 8000, unit: 'm²' }),
      num('marble_ratio', 'Rasio Marmer (%)', 40, { min: 0, max: 90, unit: '%', group: 'specifications' }),
      num('wood_ratio', 'Rasio Parket Kayu (%)', 35, { min: 0, max: 90, unit: '%', group: 'specifications' })
    ],
    components: [
      comp('screed', 'Perata Lantai (Screed) Semen Pasir 1:3 t=3 cm', G.LANTAI, 'm2', 'floor_area', ['floor_area'], { code: '3.10.14', price: 95000 }),
      comp('marmer', 'Lantai Marmer Lokal 60x60 Area Utama', G.LANTAI, 'm2', 'floor_area * marble_ratio / 100', ['floor_area', 'marble_ratio'], { code: '3.10.3.1', price: 499282, condition: 'marble_ratio > 0' }),
      comp('parket', 'Parket Kayu Solid Koridor Premium', G.LANTAI, 'm2', 'floor_area * wood_ratio / 100', ['floor_area', 'wood_ratio'], { code: '3.10.6.1', condition: 'wood_ratio > 0', level: 'PROFESSIONAL' }),
      comp('terrazzo', 'Terrazzo Cor di Tempat Area Layanan & Belakang', G.LANTAI, 'm2', 'floor_area * (100 - marble_ratio - wood_ratio) / 100', ['floor_area', 'marble_ratio', 'wood_ratio'], { code: '3.10.7', condition: 'marble_ratio + wood_ratio < 100', level: 'PROFESSIONAL' }),
      comp('granit', 'Granit Homogen Tangga & Border', G.LANTAI, 'm2', 'floor_area * 0.06', ['floor_area'], { code: '3.10.2.6', level: 'COMPREHENSIVE' }),
      comp('poles', 'Kristalisasi & Poles Akhir Marmer/Terrazzo (Paket per m² Keras)', G.LANTAI, 'm2', 'floor_area * (marble_ratio + (100 - marble_ratio - wood_ratio)) / 100', ['floor_area', 'marble_ratio', 'wood_ratio'], { price: 58500, level: 'COMPREHENSIVE', priceNote: 'Referensi poles kristalisasi akhir lantai batu.' }),
      comp('plint-batu', 'Plint Batu Alam Keliling Area Premium (Pemasangan setara Dinding Batu)', G.DINDING, 'm1', 'floor_area * 0.22', ['floor_area'], { price: 185000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi plint batu alam h=10 cm terpasang.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk pembongkaran lantai lama, waterproofing lantai basah, dan pola inlay khusus/border artistik di luar border standar.']
  }),

  // =======================================================================
  // ATAP & WATERPROOFING (5)
  // =======================================================================
  tpl({
    id: 'ROOF-METAL-STANDING',
    name: 'Sistem Atap Metal Standing Seam + Insulasi (Bangunan Komersial)',
    category: 'ATAP_WATERPROOFING',
    subcategory: 'Standing Seam',
    description: 'Paket atap metal komersial lengkap: rangka baja ringan, insulasi aluminium foil/foam, penutup zincalume standing seam, dan flashing lengkap. Untuk gudang, ritel, dan gedung komersial bentang menengah.',
    badge: 'Standing Seam',
    icon: 'Warehouse',
    parameters: [
      num('roof_area', 'Luas Bidang Atap', 1500, { min: 200, max: 12000, unit: 'm²' }),
      num('building_length', 'Panjang Bangunan (Arah Bubungan)', 60, { min: 15, max: 250, unit: 'm' })
    ],
    components: [
      comp('rangka', 'Rangka Atap Seng/Aluminium Baja Ringan C75', G.ATAP, 'm2', 'roof_area', ['roof_area'], { code: '2.1.1.2' }),
      comp('insulasi-foil', 'Insulasi Aluminium Foil 1 Sisi Atap Metal', G.ATAP, 'm2', 'roof_area * 1.05', ['roof_area'], { code: '3.2.2' }),
      comp('insulasi-foam', 'Foam Insulasi Atap (Zona Ber-AC)', G.ATAP, 'm2', 'roof_area * 0.6', ['roof_area'], { code: '3.2.3', level: 'PROFESSIONAL' }),
      comp('penutup', 'Penutup Atap Zincalume Standing Seam', G.ATAP, 'm2', 'roof_area * 1.04', ['roof_area'], { code: '3.1.3.1' }),
      comp('nok', 'Nok/Bubungan Atap Zincalume di Atas Atap Kayu', G.ATAP, 'm1', 'building_length', ['building_length'], { code: '3.1.2.4', level: 'PROFESSIONAL' }),
      comp('flashing', 'Flashing & Karpus Tepi Atap (Paket per m Keliling)', G.ATAP, 'm1', 'building_length * 2.2', ['building_length'], { price: 145000, level: 'COMPREHENSIVE', priceNote: 'Referensi flashing galvalume tepi & pertemuan dinding terpasang.' }),
      comp('talang', 'Talang Galvanis & Downpipe Atap Komersial', G.ATAP, 'm1', 'building_length * 2', ['building_length'], { price: 265000, level: 'COMPREHENSIVE', priceNote: 'Referensi talang kotak galvanis besar + pipa buangan terpasang.' }),
      comp('petir', 'Penangkal Petir Atap Metal', G.ELEKTRIKAL, 'buah', 'Math.ceil(roof_area / 1200)', ['roof_area'], { code: 'SMKK.0173', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: EKSKLUSI
  }),

  tpl({
    id: 'ROOF-TILE-PREMIUM',
    name: 'Atap Genteng Keramik Premium + Rangka Kayu Kelas I',
    category: 'ATAP_WATERPROOFING',
    subcategory: 'Genteng Keramik',
    description: 'Paket atap premium rumah/vila kelas atas: kuda-kuda kayu kelas I, rangka genteng keramik, penutup genteng keramik glazur, dan lisplank kayu lebar. Karakter tradisional premium dengan material terbaik.',
    badge: 'Keramik Premium',
    icon: 'Home',
    parameters: [
      num('roof_area', 'Luas Bidang Atap', 260, { min: 80, max: 1500, unit: 'm²' }),
      num('building_perimeter', 'Keliling Bangunan (Lisplank)', 64, { min: 25, max: 300, unit: 'm' })
    ],
    components: [
      comp('kuda', 'Konstruksi Kuda-Kuda Konvensional Kayu Kelas I–III Bentang s.d. 6 m', G.ATAP, 'm3', 'roof_area * 0.028', ['roof_area'], { code: '2.1.2.1', price: 17265490, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis per m³ kayu terpasang.' }),
      comp('rangka', 'Rangka Atap Genteng Keramik Kayu Kelas II (Usuk Reng)', G.ATAP, 'm2', 'roof_area', ['roof_area'], { code: '2.1.2.4' }),
      comp('genteng', 'Penutup Atap Genteng Keramik Glazur', G.ATAP, 'm2', 'roof_area * 1.05', ['roof_area'], { code: '3.1.1.2' }),
      comp('nok', 'Nok Genteng Keramik per Meter Bubungan (Penutup Keramik setara Karpus)', G.ATAP, 'm1', 'roof_area * 0.055', ['roof_area'], { price: 185000, level: 'PROFESSIONAL', priceNote: 'Referensi nok genteng keramik terpasang (panjang bubungan diasumsikan dari luas atap).' }),
      comp('lisplank', 'Lisplank Kayu 3x30 Kelas I/II', G.ATAP, 'm1', 'building_perimeter * 1.06', ['building_perimeter'], { code: '3.3.4', level: 'PROFESSIONAL' }),
      comp('plafon-teras', 'Plafon & Soffit Teras Kayu/Akrilik (Paket Proporsional)', G.ATAP, 'm2', 'roof_area * 0.12', ['roof_area'], { code: '3.9.1', level: 'COMPREHENSIVE' }),
      comp('pengawet', 'Pengawetan Kayu Anti Rayap Seluruh Rangka', G.ATAP, 'm2', 'roof_area', ['roof_area'], { price: 38500, level: 'COMPREHENSIVE', priceNote: 'Referensi aplikasi pengawet kayu rangka atap.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk atap sirap ulin, ornamen nok tradisional ukiran, dan struktur joglo pendopo khusus.']
  }),

  tpl({
    id: 'ROOF-GREEN-GARDEN',
    name: 'Atap Hijau (Green Roof) & Roof Garden',
    category: 'ATAP_WATERPROOFING',
    subcategory: 'Green Roof',
    description: 'Sistem atap hijau ekstensif di atas dak beton: waterproofing membran anti-akar, lapisan drainase & filter, media tanam ringan, dan tanaman penutup tahan kering + irigasi tetes atap.',
    badge: 'Green Roof',
    icon: 'Leaf',
    parameters: [
      num('roof_area', 'Luas Atap Hijau', 380, { min: 50, max: 3000, unit: 'm²' }),
      num('media_depth', 'Kedalaman Media Tanam', 0.15, { min: 0.1, max: 0.35, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('screed', 'Screed Kemiringan & Perata Dak (Kelandaian Semen 5 cm)', G.ATAP, 'm2', 'roof_area', ['roof_area'], { code: '1.3.3.2', price: 148000, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis kelandaian semen.' }),
      comp('wp', 'Waterproofing Membran Bakar Anti-Akar Dak', G.ATAP, 'm2', 'roof_area * 1.12', ['roof_area'], { code: '3.4.1', price: 207102, priceNote: 'Komposisi resolver PARTIAL — membran spesifikasi anti-akar dikonfirmasi pemasok; fallback komposisi kanonis membran.' }),
      comp('proteksi', 'Lapisan Proteksi & Drainase HDPE (Drainage Cell) per m²', G.ATAP, 'm2', 'roof_area', ['roof_area'], { price: 145000, level: 'PROFESSIONAL', priceNote: 'Referensi drainage cell + proteksi membran terpasang.' }),
      comp('geotekstil', 'Geotekstil Filter Semi Mekanis di Atas Drainage Cell', G.ATAP, 'm2', 'roof_area * 1.05', ['roof_area'], { code: '1.5.4', level: 'PROFESSIONAL' }),
      comp('media', 'Media Tanam Ringan (Kompos + Perlit + Tanah) per m³', G.LANSKAP, 'm3', 'roof_area * media_depth', ['roof_area', 'media_depth'], { price: 685000, level: 'PROFESSIONAL', priceNote: 'Referensi media tanam ringan atap termasuk pengangkutan ke atap.' }),
      comp('tanaman', 'Tanaman Penutup Tanah Atap (Sedum/Rumput Tahan Kering) per m²', G.LANSKAP, 'm2', 'roof_area * 0.92', ['roof_area'], { price: 125000, priceNote: 'Referensi penanaman penutup atap termasuk pemupukan awal.' }),
      comp('irigasi', 'Irigasi Tetes Atap (Sprinkler Kecil setara) per Titik Zona', G.LANSKAP, 'titik', 'roof_area / 55', ['roof_area'], { code: '4.2.1.2', level: 'COMPREHENSIVE', priceNote: 'Item siram sprinkler kanonis dipakai sebagai padanan zona irigasi tetes atap.' }),
      comp('kerikil', 'Strip Kerikil Batas & Jalur Inspeksi Atap (Hamparan Agregat)', G.ATAP, 'm2', 'roof_area * 0.08', ['roof_area'], { price: 95000, level: 'COMPREHENSIVE', priceNote: 'Referensi jalur kerikil batas bebas tanaman untuk inspeksi drainase.' })
    ],
    assumptions: [...ASUMSI, 'Kapasitas struktur dak wajib diverifikasi terhadap beban media jenuh air (±180–250 kg/m² untuk 15 cm media) sebelum pelaksanaan.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk pekerjaan struktur dak itu sendiri, taman intensif pohon besar, dan perawatan tanaman berkala.']
  }),

  tpl({
    id: 'ROOF-SKYLIGHT-ATRIUM',
    name: 'Skylight & Atap Kaca Atrium (Polycarbonate/Kaca Laminated)',
    category: 'ATAP_WATERPROOFING',
    subcategory: 'Skylight Atrium',
    description: 'Paket atap transparan atrium/lobi: rangka baja/aluminium skylight, penutup polycarbonate solid atau kaca laminated, dan flashing kedap khusus. Untuk mal, lobi hotel, dan atrium kantor.',
    badge: 'Skylight',
    icon: 'Sun',
    parameters: [
      num('skylight_area', 'Luas Skylight/Atap Kaca', 240, { min: 30, max: 2000, unit: 'm²' }),
      num('perimeter', 'Keliling Bukaan Skylight', 64, { min: 20, max: 400, unit: 'm' })
    ],
    components: [
      comp('rangka-baja', 'Rangka Baja Skylight Profil Semi Mekanis', G.STRUKTUR, 'kg', 'skylight_area * 14', ['skylight_area'], { code: '2.3.1.4' }),
      comp('cat-baja', 'Pengecatan Baja Galvanis Semprot Rangka Skylight', G.FINISHING, 'm2', 'skylight_area * 0.55', ['skylight_area'], { code: '3.8.14', level: 'PROFESSIONAL' }),
      comp('penutup', 'Penutup Polycarbonate Solid/Kaca Laminated (Paket per m²)', G.ATAP, 'm2', 'skylight_area * 1.05', ['skylight_area'], { price: 985000, priceNote: 'Referensi penutup skylight polycarbonate solid 6–10 mm / kaca laminated terpasang termasuk gasket & sealant struktural.' }),
      comp('flashing', 'Curb & Flashing Kedap Keliling Bukaan (Paket per m)', G.ATAP, 'm1', 'perimeter', ['perimeter'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi upstand beton kecil + flashing membran keliling skylight.' }),
      comp('wp-curb', 'Waterproofing Coating Curb Skylight', G.ATAP, 'm2', 'perimeter * 0.6', ['perimeter'], { code: '3.4.2', level: 'COMPREHENSIVE' }),
      comp('motor', 'Ventilasi Skylight Terbuka Bermotor (Paket per Unit Bukaan)', G.MEKANIKAL, 'unit', 'Math.ceil(skylight_area / 160)', ['skylight_area'], { price: 18500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi panel skylight buka-tutup bermotor termasuk kontrol dasar.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk struktur utama atrium, smoke vent bersertifikat kebakaran, dan sistem pembersih kaca atap.']
  }),

  tpl({
    id: 'ROOF-WP-DECK-AUDIT',
    name: 'Paket Waterproofing Menyeluruh: Dak, Balkon & Area Basah Gedung',
    category: 'ATAP_WATERPROOFING',
    subcategory: 'Waterproofing Gedung',
    description: 'Paket waterproofing gedung bertingkat sebagai pekerjaan mandiri (gedung baru/existing tanpa renovasi lain): membran bakar dak utama, coating balkon & area basah, injeksi retak titik bocor, dan proteksi screed.',
    badge: 'WP Menyeluruh',
    icon: 'Droplets',
    parameters: [
      num('roof_deck_area', 'Luas Dak Atap Utama', 900, { min: 100, max: 8000, unit: 'm²' }),
      num('wet_area', 'Luas Balkon & Area Basah Lain', 260, { min: 40, max: 3000, unit: 'm²', group: 'specifications' }),
      num('leak_points', 'Jumlah Titik Injeksi Bocor Eksisting', 8, { min: 0, max: 100, group: 'specifications' })
    ],
    components: [
      comp('prep-dak', 'Pembersihan & Perbaikan Permukaan Dak (Perata Screed Sebagian)', G.ATAP, 'm2', 'roof_deck_area * 0.4', ['roof_deck_area'], { code: '3.10.14', price: 95000 }),
      comp('membran', 'Waterproofing Membran Bakar Dak Utama', G.ATAP, 'm2', 'roof_deck_area * 1.08', ['roof_deck_area'], { code: '3.4.1', price: 207102, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis membran bakar.' }),
      comp('coating', 'Waterproofing Coating Semen Balkon & Area Basah', G.ATAP, 'm2', 'wet_area * 1.1', ['wet_area'], { code: '3.4.2' }),
      comp('sheet', 'Waterproofing Sheet Toilet & Dapur Basah Terpusat', G.ATAP, 'm2', 'wet_area * 0.35', ['wet_area'], { code: '3.4.3', level: 'PROFESSIONAL' }),
      comp('injeksi', 'Injeksi PU Retak/Bocor per Titik', G.ATAP, 'unit', 'leak_points', ['leak_points'], { price: 685000, condition: 'leak_points > 0', level: 'PROFESSIONAL', priceNote: 'Referensi injeksi polyurethane per titik bocor termasuk packer & material.' }),
      comp('screed-proteksi', 'Screed Proteksi di Atas Membran Dak Lalu-Lintas Ringan', G.ATAP, 'm2', 'roof_deck_area * 0.55', ['roof_deck_area'], { code: '3.10.14', price: 95000, level: 'PROFESSIONAL', priceNote: 'Hanya pada zona dak dengan lalu lintas pemeliharaan.' }),
      comp('flood-test', 'Uji Rendam (Flood Test) & Laporan per Zona Dak', G.KHUSUS, 'unit', 'Math.ceil(roof_deck_area / 450)', ['roof_deck_area'], { price: 2500000, level: 'COMPREHENSIVE', priceNote: 'Referensi flood test 48 jam + dokumentasi per zona.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk pembongkaran finishing lama skala besar, penggantian pipa drainase dak, dan garansi kebocoran di luar area dikerjakan.']
  }),

  // =======================================================================
  // LANDSCAPE & SITE (+4)
  // =======================================================================
  tpl({
    id: 'LAND-URBAN-PARK',
    name: 'Taman Kota & Plaza Hijau (Urban Park)',
    category: 'LANDSCAPE_SITE',
    subcategory: 'Taman Kota',
    description: 'Pembangunan taman kota skala kelurahan: perataan & tanah taman, jalur pejalan paving, penanaman pohon peneduh & semak, lampu taman, dan perabot taman dasar. Ruang publik terbuka hijau.',
    badge: 'Urban Park',
    icon: 'Trees',
    parameters: [
      num('park_area', 'Luas Taman', 3500, { min: 500, max: 30000, unit: 'm²' }),
      num('num_trees', 'Jumlah Pohon Peneduh Baru', 45, { min: 5, max: 500, unit: 'pohon', group: 'specifications' }),
      num('path_length', 'Panjang Jalur Pejalan', 380, { min: 60, max: 3000, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Taman', G.PERSIAPAN, 'm2', 'park_area', ['park_area'], { code: 'A.1.01.a.1' }),
      comp('tanah-taman', 'Pengolahan Tanah Luar & Perataan Halus Area Tanam', G.LANSKAP, 'm2', 'park_area * 0.75', ['park_area'], { code: '4.1.8.1', price: 29500 }),
      comp('media', 'Media Tanam & Pupuk Dasar Area Semak (per m³)', G.LANSKAP, 'm3', 'park_area * 0.08', ['park_area'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi campuran tanah subur + kompos terhampar.' }),
      comp('jalur', 'Jalur Pejalan Beton Cetak Semi Mekanis Lebar 2 m setara Pelat 10 cm', G.PERKERASAN, 'm3', 'path_length * 2 * 0.1', ['path_length'], { code: '2.2.1.4.2', price: 1125500, level: 'PROFESSIONAL', priceNote: 'Beton jalur pejalan dicor di tempat pola sederhana; pola stamped dekoratif di luar padanan ini.' }),
      comp('pohon', 'Penanaman Pohon Peneduh dia. 8–10 cm + Ajir', G.LANSKAP, 'pohon', 'num_trees', ['num_trees'], { price: 1850000, priceNote: 'Referensi pohon peneduh lokal (tanjung/trembesi muda) terpasang termasuk ajir & pupuk awal.' }),
      comp('siram-pohon', 'Penyiraman Perawatan Pohon (Pemeliharaan Awal, Paket Proporsional)', G.LANSKAP, 'm2', 'park_area * 0.5', ['park_area'], { code: '4.1.11.1', price: 1184, level: 'COMPREHENSIVE', priceNote: 'Item kanonis penyiraman pohon per m² dipakai proporsional untuk masa pemeliharaan awal.' }),
      comp('lampu-1', 'Lampu Taman Dekoratif 4 W (Titik Kecil Plaza)', G.ELEKTRIKAL, 'titik', 'path_length / 12', ['path_length'], { code: '5.3.1.20', level: 'PROFESSIONAL' }),
      comp('lampu-2', 'Lampu Taman Utama 20 W (Plaza & Amphitheater)', G.ELEKTRIKAL, 'titik', 'park_area / 450', ['park_area'], { code: '5.3.1.56', level: 'PROFESSIONAL' }),
      comp('perabot', 'Perabot Taman: Bangku, Tempat Sampah, Bollard (Paket per 500 m²)', G.LANSKAP, 'unit', 'park_area / 500', ['park_area'], { price: 18500000, level: 'COMPREHENSIVE', priceNote: 'Referensi paket perabot taman beton/kayu per zona 500 m².' }),
      comp('drainase', 'Drainase Taman & Sumur Resapan Kecil (Bak Kontrol)', G.DRAINASE, 'buah', 'park_area / 700', ['park_area'], { code: '6.3.1', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk playground bersertifikat, air mancur musikal, dan pemeliharaan taman jangka panjang.']
  }),

  tpl({
    id: 'LAND-POOL-WATERFEATURE',
    name: 'Kolam Renang Resort & Waterfeature (Sipil + Finishing)',
    category: 'LANDSCAPE_SITE',
    subcategory: 'Kolam & Waterfeature',
    description: 'Pembangunan kolam renang resort bentuk bebas & waterfeature: galian, struktur beton kolam kedap, waterproofing, finishing mozaik, dan decking kayu/batu. Peralatan filtrasi di luar paket sipil (disebut terpisah).',
    badge: 'Kolam Resort',
    icon: 'Waves',
    parameters: [
      num('pool_area', 'Luas Permukaan Kolam', 180, { min: 40, max: 1200, unit: 'm²' }),
      num('pool_depth', 'Kedalaman Rata-rata Kolam', 1.35, { min: 0.9, max: 2.2, unit: 'm', group: 'specifications' }),
      num('deck_area', 'Luas Dek Kolam', 140, { min: 30, max: 1000, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Kolam', G.PERSIAPAN, 'm2', '(pool_area + deck_area) * 1.15', ['pool_area', 'deck_area'], { code: 'C.37' }),
      comp('galian', 'Galian Kolam Tanah Berbatu', G.TANAH, 'm3', 'pool_area * (pool_depth + 0.35)', ['pool_area', 'pool_depth'], { code: '1.2.3.1.1' }),
      comp('lantai-kerja', 'Beton Mutu Rendah Dasar Kolam', G.PONDASI, 'm3', 'pool_area * 0.07', ['pool_area'], { code: '2.2.1.4.1', price: 928002 }),
      comp('struktur', 'Beton Kedap Air Struktur Kolam (Aditif Integral)', G.STRUKTUR, 'm3', 'pool_area * 0.24 + pool_area * pool_depth * 0.18', ['pool_area', 'pool_depth'], { code: '2.2.1.5.11', price: 1565000 }),
      comp('besi', 'Penulangan Struktur Kolam BjTP ≥ 12 mm', G.STRUKTUR, 'kg', '(pool_area * 0.24 + pool_area * pool_depth * 0.18) * 96', ['pool_area', 'pool_depth'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('waterstop', 'PVC Waterstop 230 mm Sambungan Struktur Kolam', G.STRUKTUR, 'm1', 'pool_area * 0.35', ['pool_area'], { code: '2.2.1.2.4', price: 89825, level: 'PROFESSIONAL', priceNote: 'Fallback diselaraskan komposisi kanonis waterstop.' }),
      comp('wp', 'Waterproofing Coating Kolam (Kristalin/Cementitious)', G.ATAP, 'm2', 'pool_area * (1 + pool_depth * 0.55)', ['pool_area', 'pool_depth'], { code: '3.4.2', level: 'PROFESSIONAL' }),
      comp('mozaik', 'Finishing Mozaik Kaca Kolam & Waterline', G.LANTAI, 'm2', 'pool_area * (1 + pool_depth * 0.55)', ['pool_area', 'pool_depth'], { price: 485000, priceNote: 'Referensi mozaik kaca kolam terpasang termasuk nat epoxy area waterline.' }),
      comp('deck-batu', 'Deking Batu Alam Area Kolam Terpasang', G.LANSKAP, 'm2', 'deck_area * 0.7', ['deck_area'], { code: '3.7.14', level: 'PROFESSIONAL' }),
      comp('deck-kayu', 'Deking Kayu Ulin/Bengkirai Tepi Kolam (Paket per m²)', G.LANSKAP, 'm2', 'deck_area * 0.3', ['deck_area'], { price: 1085000, level: 'COMPREHENSIVE', priceNote: 'Referensi decking kayu keras outdoor termasuk struktur penyangga.' }),
      comp('gutter', 'Saluran Overflow & Balance Tank Kecil (Bak Kontrol setara)', G.DRAINASE, 'buah', 'pool_area / 45', ['pool_area'], { code: '6.3.1', level: 'COMPREHENSIVE', priceNote: 'Padanan bak kontrol; balance tank beton masuk struktur kolam.' })
    ],
    assumptions: [...ASUMSI, 'Sistem filtrasi, pompa sirkulasi, dan pemanas kolam adalah paket peralatan terpisah (mekanikal) — tidak termasuk di sini.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk peralatan filtrasi/sirkulasi, water slide, dan sertifikasi keselamatan kolam publik.']
  }),

  tpl({
    id: 'LAND-IRRIGATION-SYSTEM',
    name: 'Sistem Irigasi Taman Kawasan (Sprinkler + Drip + Pompa)',
    category: 'LANDSCAPE_SITE',
    subcategory: 'Irigasi Taman',
    description: 'Paket irigasi otomatis taman kawasan perumahan/kampus: pipa distribusi, sprinkler pop-up zona rumput, drip line semak, pompa & tangki, dan panel kontrol timer dasar.',
    badge: 'Irigasi Otomatis',
    icon: 'Sprout',
    parameters: [
      num('landscape_area', 'Luas Area Lanskap Teririgasi', 6000, { min: 500, max: 50000, unit: 'm²' }),
      num('num_zones', 'Jumlah Zona Irigasi', 10, { min: 2, max: 60, group: 'specifications' })
    ],
    components: [
      comp('galian-pipa', 'Galian Parit Pipa Irigasi Tanah Biasa (Kecil)', G.TANAH, 'm3', 'landscape_area * 0.028', ['landscape_area'], { code: '1.2.1.1.2' }),
      comp('pipa-utama', 'Pipa Distribusi Utama PVC/HDPE Terkubur (Paket per m² Lanskap)', G.SANITASI, 'm2', 'landscape_area', ['landscape_area'], { price: 28500, priceNote: 'Referensi jaringan pipa utama+sekunder proporsional luas lanskap (desain hidrolik final oleh spesialis irigasi).' }),
      comp('sprinkler', 'Sprinkler Pop-Up Zona Rumput per Titik', G.LANSKAP, 'titik', 'landscape_area * 0.55 / 28', ['landscape_area'], { code: '4.2.1.2', priceNote: 'Item kanonis penyiraman sprinkler per titik; kepala sprinkler pop-up modern konfirmasi pemasok.' }),
      comp('drip', 'Drip Line Zona Semak & Pohon (Paket per m² Zona Semak)', G.LANSKAP, 'm2', 'landscape_area * 0.4', ['landscape_area'], { price: 18500, level: 'PROFESSIONAL', priceNote: 'Referensi drip line + emitter terpasang zona semak.' }),
      comp('katup', 'Katup Zona & Solenoid per Zona (Sambungan Pipa setara Paket Katup)', G.SANITASI, 'unit', 'num_zones', ['num_zones'], { price: 2850000, level: 'PROFESSIONAL', priceNote: 'Referensi paket electric valve + valve box per zona.' }),
      comp('pompa', 'Pompa Booster Irigasi Sentrifugal 250 LPM', G.MEKANIKAL, 'unit', 'Math.ceil(landscape_area / 9000)', ['landscape_area'], { code: '6.2.2.5', level: 'PROFESSIONAL' }),
      comp('tangki', 'Tangki Air Fiberglass Penampung Irigasi', G.SANITASI, 'buah', '1', [], { code: '6.1.1.1', level: 'COMPREHENSIVE' }),
      comp('kontrol', 'Panel Kontrol Timer Irigasi & Sensor Hujan (Paket)', G.ELEKTRIKAL, 'unit', '1', [], { price: 12500000, level: 'COMPREHENSIVE', priceNote: 'Referensi controller irigasi multi-zona + rain sensor terpasang.' }),
      comp('urugan', 'Urugan Kembali Parit Pipa', G.TANAH, 'm3', 'landscape_area * 0.026', ['landscape_area'], { code: '1.3.1.1', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk sumber air (sumur/PDAM), penanaman itu sendiri, dan pemeliharaan irigasi berkala.']
  }),

  tpl({
    id: 'LAND-HARDSCAPE-STREETSCAPE',
    name: 'Hardscape & Street Furniture Koridor Jalan/Kawasan',
    category: 'LANDSCAPE_SITE',
    subcategory: 'Streetscape',
    description: 'Peningkatan koridor jalan kawasan: trotoar paving & guiding block, planter beton, bangku & bollard, dan lampu koridor. Streetscape untuk jalan utama perumahan/kampus/kawasan industri.',
    badge: 'Streetscape',
    icon: 'Lamp',
    parameters: [
      num('corridor_length', 'Panjang Koridor (Kedua Sisi)', 800, { min: 100, max: 6000, unit: 'm' }),
      num('sidewalk_width', 'Lebar Trotoar', 2.2, { min: 1.5, max: 5, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Trotoar', G.PERSIAPAN, 'm2', 'corridor_length * sidewalk_width * 2', ['corridor_length', 'sidewalk_width'], { code: 'C.37' }),
      comp('dasar', 'Lapis Pondasi Agregat Trotoar & Pemadatan', G.PERKERASAN, 'm3', 'corridor_length * sidewalk_width * 2 * 0.12', ['corridor_length', 'sidewalk_width'], { price: 325000, priceNote: 'Referensi lapis agregat dasar trotoar terhampar padat.' }),
      comp('paving', 'Paving Blok Trotoar Pola + Kanstin (Paket per m²)', G.PERKERASAN, 'm2', 'corridor_length * sidewalk_width * 2 * 0.96', ['corridor_length', 'sidewalk_width'], { price: 285000, priceNote: 'Referensi paving block K-300 + kanstin terpasang pola standar.' }),
      comp('guiding', 'Guiding Block Difabel Jalur Trotoar (Paket per m)', G.PERKERASAN, 'm1', 'corridor_length * 2', ['corridor_length'], { price: 185000, level: 'PROFESSIONAL', priceNote: 'Referensi ubin pemandu tunanetra terpasang kontinu.' }),
      comp('planter', 'Planter Beton + Tanah Tanam per Segmen 3 m', G.LANSKAP, 'unit', 'corridor_length * 2 / 24', ['corridor_length'], { price: 3850000, level: 'PROFESSIONAL', priceNote: 'Referensi planter beton menerus per segmen termasuk media tanam (tanaman terpisah).' }),
      comp('bangku', 'Bangku & Bollard Koridor (Paket per 100 m Sisi)', G.LANSKAP, 'unit', 'corridor_length * 2 / 100', ['corridor_length'], { price: 12500000, level: 'COMPREHENSIVE', priceNote: 'Referensi paket street furniture per 100 m (bangku beton-kayu + bollard + tempat sampah).' }),
      comp('lampu', 'Lampu Koridor Taman 50 W (Titik Penerangan Jalur)', G.ELEKTRIKAL, 'titik', 'corridor_length * 2 / 24', ['corridor_length'], { code: '5.3.1.9', level: 'PROFESSIONAL' }),
      comp('drain', 'Grating & Saluran Tepi Trotoar (Pemasangan U-Ditch Kecil Sebagian)', G.DRAINASE, 'm1', 'corridor_length * 2 * 0.3', ['corridor_length'], { code: '8.1.1.1', price: 465000, level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk tanaman dalam planter, pemindahan utilitas bawah tanah eksisting, dan perkerasan jalan kendaraan.']
  }),

  // =======================================================================
  // MEP & SISTEM (+7)
  // =======================================================================
  tpl({
    id: 'MEP-HVAC-VRF',
    name: 'Sistem HVAC VRF/VRV Gedung (Peralatan + Instalasi)',
    category: 'MEP_SYSTEM',
    subcategory: 'HVAC VRF',
    description: 'Paket pendingin udara VRF gedung perkantoran/hotel: unit outdoor & indoor, pipa tembaga berinsulasi, drainase kondensat, dan kontrol terpusat dasar. Kapasitas dihitung dari luas ber-AC.',
    badge: 'VRF',
    icon: 'AirVent',
    parameters: [
      num('ac_area', 'Luas Area Ber-AC', 2400, { min: 200, max: 20000, unit: 'm²' }),
      num('num_indoor', 'Jumlah Unit Indoor', 55, { min: 8, max: 400, unit: 'unit', group: 'specifications' }),
      num('capacity_pk', 'Kapasitas Total (PK)', 180, { min: 20, max: 1500, unit: 'PK', group: 'specifications' })
    ],
    components: [
      comp('outdoor', 'Unit Outdoor VRF per PK Terpasang (Paket)', G.MEKANIKAL, 'unit', 'capacity_pk', ['capacity_pk'], { price: 6850000, priceNote: 'Referensi outdoor VRF termasuk instalasi & komisioning dasar per PK (sangat tergantung merk).' }),
      comp('indoor', 'Unit Indoor VRF Cassette/Ducted per Unit (Instalasi Pipa)', G.MEKANIKAL, 'unit', 'num_indoor', ['num_indoor'], { code: '5.5.4.1', price: 125933, priceNote: 'Item kanonis pipa tembaga per unit AC dipakai sebagai komponen instalasi indoor; unit indoor itu sendiri pada paket peralatan di bawah.' }),
      comp('indoor-unit', 'Pengadaan Unit Indoor VRF per Unit', G.MEKANIKAL, 'unit', 'num_indoor', ['num_indoor'], { price: 4850000, level: 'PROFESSIONAL', priceNote: 'Referensi indoor cassette/ducted kelas menengah per unit.' }),
      comp('pipa', 'Pipa Tembaga Refrigeran Tambahan Antar Lantai (per m Pasangan)', G.MEKANIKAL, 'm1', 'ac_area * 0.32', ['ac_area'], { code: '5.5.4.1', price: 125933, level: 'PROFESSIONAL', priceNote: 'Fallback diselaraskan komposisi kanonis pipa tembaga AC.' }),
      comp('drain', 'Pipa Drainase Kondensat PVC (Pipa PVC 3/4–1" setara Instalasi)', G.SANITASI, 'm1', 'num_indoor * 3.4', ['num_indoor'], { price: 48500, level: 'COMPREHENSIVE', priceNote: 'Referensi pipa kondensat berinsulasi terpasang.' }),
      comp('kontrol', 'Kontrol Terpusat & Remote Zona (Paket per Indoor)', G.MEKANIKAL, 'unit', 'num_indoor', ['num_indoor'], { price: 685000, level: 'COMPREHENSIVE', priceNote: 'Referensi wired controller per indoor + gateway sentral proporsional.' }),
      comp('ducting', 'Ducting Distribusi Udara Segar (Paket per m² Ber-AC)', G.MEKANIKAL, 'm2', 'ac_area', ['ac_area'], { price: 68500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi ducting fresh air & exhaust toilet proporsional.' })
    ],
    assumptions: [...ASUMSI, 'Kapasitas acuan ±1 PK per 13–15 m² kantor; perhitungan beban pendinginan (cooling load) final oleh engineer mekanikal.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk chiller/AHU sistem sentral air (sistem berbeda), pekerjaan sipil dudukan outdoor berat, dan garansi kompresor pabrikan.']
  }),

  tpl({
    id: 'MEP-FIRE-PROTECTION',
    name: 'Proteksi Kebakaran Gedung (Sprinkler, Hydrant, Alarm)',
    category: 'MEP_SYSTEM',
    subcategory: 'Fire Protection',
    description: 'Paket proteksi kebakaran aktif gedung bertingkat: jaringan sprinkler, hydrant gedung & pilar, pompa kebakaran, tangki, dan deteksi alarm dasar. Mengacu kebutuhan izin & rekomendasi damkar.',
    badge: 'Fire Protection',
    icon: 'Flame',
    parameters: [
      num('building_area', 'Luas Bangunan Dilindungi', 5200, { min: 800, max: 40000, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 6, { min: 2, max: 40 }),
      num('num_hydrant_pillar', 'Jumlah Hydrant Pilar Halaman', 4, { min: 1, max: 30, group: 'specifications' })
    ],
    components: [
      comp('sprinkler-head', 'Kepala Sprinkler per Titik', G.MEKANIKAL, 'unit', 'building_area / 12', ['building_area'], { code: '5.6.2.1', price: 312361 }),
      comp('pipa-sprinkler', 'Pipa Sprinkler Baja per Meter Rata-rata Jaringan', G.MEKANIKAL, 'm1', 'building_area * 0.42', ['building_area'], { code: '5.6.1.2', level: 'PROFESSIONAL' }),
      comp('klep', 'Katup & Aksesoris Zona Sprinkler per Lantai (Paket)', G.MEKANIKAL, 'unit', 'num_floors', ['num_floors'], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi alarm check valve set + flow switch per zona lantai.' }),
      comp('hydrant-gedung', 'Hydrant Gedung Box + Selang per Titik Lantai', G.MEKANIKAL, 'unit', 'num_floors * 2', ['num_floors'], { price: 4850000, level: 'PROFESSIONAL', priceNote: 'Referensi hydrant box indoor lengkap per titik.' }),
      comp('hydrant-pilar', 'Hydrant Pilar Halaman per Unit', G.MEKANIKAL, 'unit', 'num_hydrant_pillar', ['num_hydrant_pillar'], { price: 9850000 }),
      comp('pompa', 'Pompa Kebakaran Utama Diesel/Elektrik + Jockey (Paket)', G.MEKANIKAL, 'unit', '1', [], { price: 285000000, priceNote: 'Referensi paket pompa kebakaran gedung menengah termasuk panel & instalasi ruang pompa.' }),
      comp('apar', 'APAR 6 kg per Titik Area', G.MEKANIKAL, 'unit', 'building_area / 220', ['building_area'], { code: '5.6.3.1', price: 1647374, level: 'COMPREHENSIVE', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis APAR.' }),
      comp('detektor', 'Detektor Asap & Alarm Titik (Instalasi per Titik)', G.ELEKTRIKAL, 'titik', 'building_area / 65', ['building_area'], { code: '5.3.1.24', level: 'COMPREHENSIVE', priceNote: 'Item instalasi titik lampu kanonis dipakai sebagai padanan instalasi titik detektor; panel MCFA di luar paket.' }),
      comp('tanda', 'Tanda Exit & Lampu Darurat (Paket per Lantai)', G.ELEKTRIKAL, 'unit', 'num_floors', ['num_floors'], { price: 3850000, level: 'COMPREHENSIVE', priceNote: 'Referensi exit sign + emergency light per lantai.' })
    ],
    assumptions: [...ASUMSI, 'Kepadatan sprinkler acuan 1 head/12 m² (bahaya ringan-sedang); klasifikasi bahaya & perhitungan hidrolik final oleh konsultan proteksi kebakaran.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk panel MCFA terprogram penuh & integrasi BMS, tangki bawah tanah besar, dan biaya pengujian/sertifikasi damkar.']
  }),

  tpl({
    id: 'MEP-ELECTRICAL-DIST',
    name: 'Distribusi Elektrikal Gedung (Trafo, MDP, Busduct, Panel Lantai)',
    category: 'MEP_SYSTEM',
    subcategory: 'Distribusi Elektrikal',
    description: 'Paket distribusi daya gedung bertingkat dari gardu ke panel lantai: trafo & kubikel, MDP, busduct riser, panel lantai, dan kabel feeder. Untuk gedung kantor/apartemen/hotel menengah.',
    badge: 'Power Distribution',
    icon: 'Zap',
    parameters: [
      num('installed_kva', 'Daya Terpasang (kVA)', 800, { min: 100, max: 5000, unit: 'kVA', group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 8, { min: 2, max: 40 }),
      num('riser_height', 'Tinggi Riser Busduct Total', 30, { min: 6, max: 160, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('gardu', 'Pemasangan Gardu Trafo & Kubikel (Jasa Pasang per Unit)', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.4.1', price: 25250000, priceNote: 'Item kanonis pemasangan gardu (jasa); peralatan trafo & kubikel pada komponen peralatan.' }),
      comp('trafo', 'Pengadaan Trafo Distribusi per kVA (Paket Proporsional)', G.ELEKTRIKAL, 'unit', 'installed_kva', ['installed_kva'], { price: 685000, priceNote: 'Referensi trafo cast-resin/oil per kVA terpasang termasuk kubikel TM dasar proporsional.' }),
      comp('mdp', 'Panel MDP Utama Gedung (Paket)', G.ELEKTRIKAL, 'unit', '1', [], { price: 185000000, priceNote: 'Referensi MDP termasuk ACB utama & metering dasar.' }),
      comp('busduct', 'Busduct Riser per Meter', G.ELEKTRIKAL, 'm1', 'riser_height', ['riser_height'], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi busduct 1600–2500 A per meter termasuk tap-off per lantai proporsional.' }),
      comp('panel-lantai', 'Panel Distribusi per Lantai (DPP) dengan MCB 4 A Dasar Zona', G.ELEKTRIKAL, 'unit', 'num_floors', ['num_floors'], { code: '5.1.2.1', price: 716250, level: 'PROFESSIONAL', priceNote: 'Item kanonis MCB dipakai sebagai padanan dasar panel lantai; panel lengkap dikonfirmasi beban per lantai.' }),
      comp('panel-lengkap', 'Selisih Panel Lantai Lengkap (Busbar, MCCB, Metering)', G.ELEKTRIKAL, 'unit', 'num_floors', ['num_floors'], { price: 14850000, level: 'PROFESSIONAL', priceNote: 'Referensi selisih menuju panel lantai lengkap siap distribusi.' }),
      comp('feeder', 'Kabel Feeder Panel Lantai (Proporsional per Lantai)', G.ELEKTRIKAL, 'unit', 'num_floors', ['num_floors'], { code: '5.1.1.5', price: 812633, level: 'COMPREHENSIVE', priceNote: 'Item kanonis kabel tanah dipakai sebagai padanan feeder (PARTIAL pada resolver).' }),
      comp('grounding', 'Grounding Sistem Gedung & Penangkal Petir Atap', G.ELEKTRIKAL, 'buah', '2', [], { code: 'SMKK.0173', level: 'COMPREHENSIVE' }),
      comp('genset-pad', 'Dudukan & Rumah Genset (Pondasi Batu + Kanopi Baja Ringan, Paket)', G.PONDASI, 'unit', '1', [], { price: 38500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi pekerjaan sipil pendukung genset (genset di template utilitas/MEP lain).' })
    ],
    assumptions: [...ASUMSI, 'Tarif peralatan elektrikal sangat tergantung merk & kapasitas final; hitungan beban & single-line diagram oleh engineer elektrikal menentukan RAB final.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk biaya penyambungan PLN & gardu milik PLN, genset (paket terpisah), dan instalasi titik akhir (template MEP lengkap).']
  }),

  tpl({
    id: 'MEP-PLUMBING-TOWER',
    name: 'Sistem Plumbing Gedung Bertingkat (Air Bersih, Kotor, Vent, Hujan)',
    category: 'MEP_SYSTEM',
    subcategory: 'Plumbing Tower',
    description: 'Paket plumbing gedung bertingkat: ground tank & roof tank, pompa transfer & booster, riser air bersih, pipa air kotor & vent, dan pipa air hujan. Saniter fixture dihitung pada paket finishing.',
    badge: 'Plumbing',
    icon: 'Droplets',
    parameters: [
      num('num_floors', 'Jumlah Lantai', 9, { min: 3, max: 40 }),
      num('num_units', 'Jumlah Unit Hunian/Ruang Basah Setara', 90, { min: 10, max: 600, group: 'specifications' }),
      num('tower_height', 'Tinggi Gedung (Tekanan Riser)', 32, { min: 10, max: 160, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('ground-tank', 'Ground Water Tank Fiberglass Modular (per Unit Setara 10 m³)', G.SANITASI, 'buah', '4', [], { code: '6.1.1.1', priceNote: 'Jumlah tangki acuan 4 unit modular — sesuaikan kebutuhan cadangan air desain.' }),
      comp('roof-tank', 'Roof Tank & Dudukan di Atap (per Unit)', G.SANITASI, 'buah', '2', [], { code: '6.1.1.1', level: 'PROFESSIONAL', priceNote: 'Item tangki kanonis; dudukan baja di luar padanan (konfirmasi struktur atap).' }),
      comp('pompa-transfer', 'Pompa Transfer Sentrifugal 500 LPM', G.MEKANIKAL, 'unit', '2', [], { code: '6.2.2.4' }),
      comp('pompa-booster', 'Pompa Booster Sentrifugal 250 LPM', G.MEKANIKAL, 'unit', '2', [], { code: '6.2.2.5', level: 'PROFESSIONAL' }),
      comp('riser-bersih', 'Riser & Distribusi Air Bersih (Paket per Lantai)', G.SANITASI, 'unit', 'num_floors', ['num_floors'], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi pipa PPR/ galvanis riser + cabang per lantai termasuk valve zona.' }),
      comp('riser-kotor', 'Riser Air Kotor & Vent PVC (Paket per Lantai)', G.SANITASI, 'unit', 'num_floors', ['num_floors'], { price: 5850000, level: 'PROFESSIONAL', priceNote: 'Referensi stack air kotor + vent + cleanout per lantai.' }),
      comp('cabang-unit', 'Pipa Cabang ke Unit (Sambungan Instalasi per Unit Basah)', G.SANITASI, 'unit', 'num_units', ['num_units'], { price: 1850000, level: 'COMPREHENSIVE', priceNote: 'Referensi cabang air bersih+kotor menuju titik fixture per unit.' }),
      comp('hujan', 'Pipa Air Hujan Atap & Balkon (Paket per Lantai)', G.SANITASI, 'unit', 'num_floors', ['num_floors'], { price: 2450000, level: 'COMPREHENSIVE', priceNote: 'Referensi downpipe PVC/HDPE + roof drain proporsional.' }),
      comp('pressure-test', 'Uji Tekan & Disinfeksi Jaringan (Paket per Gedung)', G.SANITASI, 'unit', '1', [], { price: 18500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi pressure test + flushing + uji kualitas air dasar.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk fixture saniter (paket finishing), STP/IPAL (template utilitas), dan ground tank beton cor skala besar.']
  }),

  tpl({
    id: 'MEP-SMART-LIGHTING',
    name: 'Pencahayaan Arsitektural & Kontrol Smart Building',
    category: 'MEP_SYSTEM',
    subcategory: 'Smart Lighting',
    description: 'Paket pencahayaan tingkat lanjut: titik lampu arsitektural LED, pencahayaan fasad, sensor gerak & daylight, dan kontrol DALI/KNX dasar per zona. Untuk gedung yang menargetkan efisiensi energi.',
    badge: 'Smart Lighting',
    icon: 'Lightbulb',
    parameters: [
      num('building_area', 'Luas Area Terkontrol', 3600, { min: 300, max: 25000, unit: 'm²' }),
      num('num_zones', 'Jumlah Zona Kontrol', 14, { min: 2, max: 80, group: 'specifications' })
    ],
    components: [
      comp('titik-kerja', 'Titik Lampu Kerja LED (Instalasi)', G.ELEKTRIKAL, 'titik', 'building_area / 9', ['building_area'], { code: '5.3.1.24' }),
      comp('titik-dekor', 'Armatur Downlight Full 20 W Area Publik', G.ELEKTRIKAL, 'titik', 'building_area / 26', ['building_area'], { code: '5.3.1.56', level: 'PROFESSIONAL' }),
      comp('armatur', 'Pengadaan Armatur LED Premium per Titik Kerja (Paket)', G.ELEKTRIKAL, 'titik', 'building_area / 9', ['building_area'], { price: 685000, level: 'PROFESSIONAL', priceNote: 'Referensi armatur panel/downlight LED kelas komersial per titik.' }),
      comp('fasad', 'Pencahayaan Fasad (Titik Sorot Outdoor)', G.ELEKTRIKAL, 'titik', 'building_area / 200', ['building_area'], { code: '5.3.1.9', level: 'COMPREHENSIVE' }),
      comp('sensor', 'Sensor Gerak & Daylight per Zona (Paket Kontrol)', G.ELEKTRIKAL, 'unit', 'num_zones * 3', ['num_zones'], { price: 485000, level: 'PROFESSIONAL', priceNote: 'Referensi sensor PIR/daylight terpasang per titik zona.' }),
      comp('kontrol', 'Kontrol DALI/KNX per Zona (Controller & Pemrograman)', G.ELEKTRIKAL, 'unit', 'num_zones', ['num_zones'], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi controller zona + programming adegan dasar.' }),
      comp('kabel', 'Kabel Kontrol & Tray Tambahan (Paket per m²)', G.ELEKTRIKAL, 'm2', 'building_area', ['building_area'], { price: 18500, level: 'COMPREHENSIVE', priceNote: 'Referensi kabel bus kontrol + tray proporsional.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk BMS menyeluruh (HVAC/akses), lampu dekoratif custom desainer, dan lisensi software tahunan.']
  }),

  tpl({
    id: 'MEP-DATA-NETWORK',
    name: 'Jaringan Data & Komunikasi Terstruktur (Structured Cabling)',
    category: 'MEP_SYSTEM',
    subcategory: 'Data & Komunikasi',
    description: 'Paket infrastruktur TI gedung: kabel data Cat6A per titik, rak & patch panel, backbone fiber antar lantai, dan titik akses WiFi dasar. Untuk kantor, kampus, dan hotel.',
    badge: 'Data Network',
    icon: 'Network',
    parameters: [
      num('num_points', 'Jumlah Titik Data', 220, { min: 20, max: 3000, unit: 'titik', group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 5, { min: 1, max: 40 }),
      num('num_racks', 'Jumlah Rak Server/Distribusi', 4, { min: 1, max: 40, group: 'specifications' })
    ],
    components: [
      comp('titik-data', 'Titik Data Cat6A Lengkap (Kabel, Outlet, Uji) per Titik', G.ELEKTRIKAL, 'titik', 'num_points', ['num_points'], { price: 885000, priceNote: 'Referensi titik data terpasang termasuk sertifikasi uji kabel dasar.' }),
      comp('rak', 'Rak Server 42U + Patch Panel + Manajemen Kabel per Rak', G.ELEKTRIKAL, 'unit', 'num_racks', ['num_racks'], { price: 18500000, level: 'PROFESSIONAL', priceNote: 'Referensi rak + panel + cable management (switch aktif di luar paket pasif).' }),
      comp('fiber', 'Backbone Fiber Optik Antar Lantai per Lantai', G.ELEKTRIKAL, 'unit', 'num_floors', ['num_floors'], { price: 6850000, level: 'PROFESSIONAL', priceNote: 'Referensi tarikan fiber OM4 + terminasi per lantai.' }),
      comp('tray', 'Cable Tray & Conduit Distribusi (Paket per Titik)', G.ELEKTRIKAL, 'titik', 'num_points', ['num_points'], { price: 285000, level: 'COMPREHENSIVE', priceNote: 'Referensi tray/conduit proporsional per titik data.' }),
      comp('wifi', 'Titik Akses WiFi (Pasang + Titik Daya/Data)', G.ELEKTRIKAL, 'unit', 'num_points / 9', ['num_points'], { price: 2850000, level: 'COMPREHENSIVE', priceNote: 'Referensi access point enterprise terpasang per titik (jumlah diturunkan dari kepadatan titik data).' }),
      comp('ups', 'UPS Rack & Distribusi Daya TI (Paket per Rak)', G.ELEKTRIKAL, 'unit', 'num_racks', ['num_racks'], { price: 14850000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi UPS rackmount 3 kVA class per rak distribusi.' })
    ],
    assumptions: ASUMSI,
    exclusions: [...EKSKLUSI, 'Tidak termasuk perangkat aktif (switch, server, lisensi), instalasi CCTV & akses kontrol (paket keamanan terpisah), dan langganan internet.']
  }),

  tpl({
    id: 'MEP-MEDICAL-GAS',
    name: 'Instalasi Gas Medis Rumah Sakit (O₂, Vakum, Udara Medis)',
    category: 'MEP_SYSTEM',
    subcategory: 'Gas Medis',
    description: 'Paket gas medis fasilitas kesehatan: sumber sentral (manifold O₂ & kompresor udara medis), jaringan pipa tembaga medis, outlet gas per tempat tidur, dan alarm gas medis zona.',
    badge: 'Gas Medis',
    icon: 'HeartPulse',
    parameters: [
      num('num_beds', 'Jumlah Tempat Tidur Terlayani', 60, { min: 8, max: 500, unit: 'bed', group: 'specifications' }),
      num('num_zones', 'Jumlah Zona Layanan', 5, { min: 1, max: 30, group: 'specifications' })
    ],
    components: [
      comp('outlet', 'Outlet Gas Medis per Bedhead (O₂ + Vakum + Udara)', G.MEKANIKAL, 'unit', 'num_beds', ['num_beds'], { price: 4850000, priceNote: 'Referensi bedhead unit + 3 outlet gas terpasang per tempat tidur.' }),
      comp('pipa', 'Pipa Tembaga Medis Jaringan (Pipa Tembaga AC setara per Meter)', G.MEKANIKAL, 'm1', 'num_beds * 4.2', ['num_beds'], { code: '5.5.4.1', price: 125933, level: 'PROFESSIONAL', priceNote: 'Pipa gas medis wajib tembaga degreased standar medis — item kanonis pipa tembaga dipakai sebagai padanan dasar tarif.' }),
      comp('manifold', 'Manifold O₂ Sentral + Regulator (Paket Sumber)', G.MEKANIKAL, 'unit', '1', [], { price: 185000000, priceNote: 'Referensi manifold otomatis + bank tabung awal (tabung isi ulang di luar paket).' }),
      comp('kompresor', 'Kompresor Udara Medis + Dryer (Paket Sumber)', G.MEKANIKAL, 'unit', '1', [], { price: 285000000, level: 'PROFESSIONAL', priceNote: 'Referensi plant udara medis bebas oli + pengering + filter bakteri.' }),
      comp('vakum', 'Pompa Vakum Medis Sentral (Paket Sumber)', G.MEKANIKAL, 'unit', '1', [], { price: 165000000, level: 'PROFESSIONAL', priceNote: 'Referensi plant vakum medis duplex.' }),
      comp('alarm', 'Alarm Gas Medis & Katup Zona per Zona', G.MEKANIKAL, 'unit', 'num_zones', ['num_zones'], { price: 14850000, level: 'COMPREHENSIVE', priceNote: 'Referensi area valve service unit + alarm tekanan per zona.' }),
      comp('uji', 'Uji Kemurnian & Tekanan Gas Medis + Sertifikasi Awal (Paket)', G.KHUSUS, 'unit', '1', [], { price: 38500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi pengujian pihak ketiga & dokumentasi serah terima gas medis.' })
    ],
    assumptions: [...ASUMSI, 'Standar gas medis mengikuti regulasi fasilitas kesehatan berlaku; desain & sertifikasi oleh instalator gas medis berizin adalah syarat mutlak pelaksanaan.'],
    exclusions: [...EKSKLUSI, 'Tidak termasuk tabung gas isi & kontrak pasok gas, generator oksigen PSA skala besar, dan perizinan operasional RS.']
  })
];
