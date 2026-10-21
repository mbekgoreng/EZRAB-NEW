/**
 * Katalog 180 — DRAINASE_SANITASI (7 baru), JEMBATAN_STRUKTUR (7 baru),
 * PELABUHAN_PESISIR (5 baru).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { G, num, comp, tpl } from './builders';

const ASUMSI_INFRA = [
  'Nilai default parameter adalah asumsi awal berlabel — wajib disesuaikan dengan DED, data hidrologi, dan kondisi lapangan.',
  'Harga resmi hanya untuk komponen berkode AHSP 2026 kanonis yang lolos gerbang resolver; sisanya harga referensi pasar 2026.'
];
const EKSKLUSI_INFRA = [
  'Tidak termasuk pembebasan lahan dan relokasi utilitas pihak ketiga.',
  'Tidak termasuk desain detail struktur khusus (perlu perhitungan konsultan struktur/SDA).'
];

export const INFRA_TEMPLATES_B: RabTemplate[] = [
  // =======================================================================
  // DRAINASE & SANITASI (kategori baru, 7)
  // =======================================================================
  tpl({
    id: 'DRN-UDITCH-COVER',
    name: 'Saluran U-Ditch + Tutup Heavy Duty Jalan Kolektor',
    category: 'DRAINASE_SANITASI',
    subcategory: 'U-Ditch Tertutup',
    description: 'Drainase jalan tertutup untuk koridor komersial: U-ditch 50x50 & 60x60 dengan tutup beton heavy duty yang dapat dilalui kendaraan, bak kontrol berkala, dan koneksi inlet dari badan jalan.',
    badge: 'Drainase Kota',
    icon: 'Grip',
    parameters: [
      num('channel_length', 'Panjang Saluran (Total 2 Sisi)', 800, { min: 100, max: 10000, unit: 'm' }),
      num('num_inlets', 'Jumlah Inlet & Bak Kontrol', 16, { min: 2, max: 200, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Saluran', G.PERSIAPAN, 'm2', 'channel_length * 1.6', ['channel_length'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Biasa Jalur Drainase', G.TANAH, 'm3', 'channel_length * 0.85', ['channel_length'], { code: '1.2.1.1.2' }),
      comp('urugan', 'Urugan Kembali Samping Saluran', G.TANAH, 'm3', 'channel_length * 0.3', ['channel_length'], { code: '1.3.1.1', level: 'PROFESSIONAL' }),
      comp('uditch50', 'Saluran U-Ditch 50x50x120 + Lantai Kerja fc 10', G.DRAINASE, 'm1', 'channel_length * 0.6', ['channel_length'], { code: '8.1.1.4', price: 625000, priceNote: 'Komposisi resolver PARTIAL — fallback referensi U-ditch terpasang.' }),
      comp('uditch40', 'Saluran U-Ditch 40x40x120 + Lantai Kerja (Seksi Hulu)', G.DRAINASE, 'm1', 'channel_length * 0.4', ['channel_length'], { code: '8.1.1.3', price: 585000, level: 'PROFESSIONAL' }),
      comp('tutup', 'Tutup Beton U-Ditch Heavy Duty (per m Saluran Tertutup)', G.DRAINASE, 'm1', 'channel_length * 0.85', ['channel_length'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi tutup beton pracetak HD termasuk rangka angkur.' }),
      comp('bakkontrol', 'Bak Kontrol Pas. Bata 60x60 T=65 cm', G.DRAINASE, 'buah', 'num_inlets', ['num_inlets'], { code: '6.3.3', level: 'PROFESSIONAL' }),
      comp('inlet', 'Inlet Jalan & Grill Besi Cor (per Titik)', G.DRAINASE, 'unit', 'num_inlets', ['num_inlets'], { price: 1650000, level: 'COMPREHENSIVE', priceNote: 'Referensi inlet + grill ductile iron terpasang.' }),
      comp('outfall', 'Beton Kepala Outfall ke Saluran Penerima fc 15 MPa', G.STRUKTUR, 'm3', '6', [], { code: '2.2.1.4.3', price: 1355000, level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'DRN-FRENCH-DRAIN',
    name: 'French Drain & Drainase Resapan Geotekstil',
    category: 'DRAINASE_SANITASI',
    subcategory: 'Drainase Resapan',
    description: 'Drainase bawah permukaan untuk lapangan, taman, dan lereng: parit agregat dibungkus geotekstil dengan pipa perforasi HDPE dan bak inspeksi. Menurunkan muka air tanah dangkal & genangan.',
    badge: 'Subsurface',
    icon: 'Filter',
    parameters: [
      num('drain_length', 'Panjang French Drain', 300, { min: 50, max: 3000, unit: 'm' }),
      num('drain_depth', 'Kedalaman Parit', 0.9, { min: 0.5, max: 2, unit: 'm', group: 'specifications' }),
      num('num_inspection', 'Jumlah Bak Inspeksi', 6, { min: 1, max: 60, group: 'specifications' })
    ],
    components: [
      comp('galian', 'Galian Parit Drainase Tanah Biasa', G.TANAH, 'm3', 'drain_length * drain_depth * 0.55', ['drain_length', 'drain_depth'], { code: '1.2.1.1.2' }),
      comp('geotekstil', 'Geotekstil Tipis Manual Pembungkus Parit', G.PONDASI, 'm2', 'drain_length * (drain_depth * 2 + 0.8)', ['drain_length', 'drain_depth'], { code: '1.5.1' }),
      comp('agregat', 'Agregat Bersih 2/3 Isian Parit Resapan', G.DRAINASE, 'm3', 'drain_length * drain_depth * 0.42', ['drain_length', 'drain_depth'], { price: 385000, priceNote: 'Referensi batu pecah bersih terhampar tanpa pemadatan.' }),
      comp('pipa', 'Pipa HDPE Perforasi DN 4" Dasar Parit', G.DRAINASE, 'm', 'drain_length', ['drain_length'], { code: '9.3.1.2', level: 'PROFESSIONAL', priceNote: 'Item kanonis pipa HDPE polos dipakai sebagai padanan; versi perforasi diverifikasi saat pengadaan.' }),
      comp('tutup-tanah', 'Urugan Tanah Kembali & Perataan Permukaan', G.TANAH, 'm3', 'drain_length * 0.18', ['drain_length'], { code: '1.3.1.1', level: 'PROFESSIONAL' }),
      comp('bak', 'Bak Kontrol Pas. Bata 45x45 (Inspeksi)', G.DRAINASE, 'buah', 'num_inspection', ['num_inspection'], { code: '6.3.2', level: 'PROFESSIONAL' }),
      comp('rumput', 'Penanaman Rumput Penutup Jalur Drainase', G.LANSKAP, 'm2', 'drain_length * 0.7', ['drain_length'], { price: 38500, level: 'COMPREHENSIVE', priceNote: 'Referensi rumput gajah mini + media tanam.' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'DRN-DETENTION-TANK',
    name: 'Bak Detensi Bawah Tanah (Modular & Beton)',
    category: 'DRAINASE_SANITASI',
    subcategory: 'Detensi Air Hujan',
    description: 'Tampungan detensi air hujan bawah tanah untuk kewajiban zero-runoff gedung: galian dalam, struktur beton kedap air/modul geocellular, pipa inlet-outlet dengan orifice control, dan sumur pompa kuras.',
    badge: 'Zero Runoff',
    icon: 'Archive',
    parameters: [
      num('tank_volume', 'Volume Detensi Rencana', 150, { min: 20, max: 2000, unit: 'm³', group: 'specifications' }),
      num('tank_depth', 'Kedalaman Bak', 2.5, { min: 1.5, max: 5, unit: 'm', group: 'specifications' }),
      num('num_inlets', 'Jumlah Inlet & Manhole', 4, { min: 1, max: 30, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Bak', G.PERSIAPAN, 'm2', 'tank_volume / tank_depth * 1.5', ['tank_volume', 'tank_depth'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Berbatu Bak Detensi', G.TANAH, 'm3', 'tank_volume * 1.35', ['tank_volume'], { code: '1.2.3.1.1' }),
      comp('buang', 'Angkut Tanah Galian Berlebih s.d. 10 m', G.TANAH, 'm3', 'tank_volume * 0.75', ['tank_volume'], { code: '1.4.1.1', level: 'PROFESSIONAL' }),
      comp('lantai-kerja', 'Beton Mutu Rendah fc 7,5 Lantai Kerja Bak', G.STRUKTUR, 'm3', 'tank_volume / tank_depth * 0.08', ['tank_volume', 'tank_depth'], { code: '2.2.1.4.1', price: 928002 }),
      comp('beton', 'Beton Dinding & Plat Bak fc 15 MPa', G.STRUKTUR, 'm3', 'tank_volume * 0.34', ['tank_volume'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Bak BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'tank_volume * 11.5', ['tank_volume'], { code: '2.2.1.1.4' }),
      comp('waterstop', 'PVC Waterstop lebar 150 mm', G.STRUKTUR, 'm1', 'tank_volume / tank_depth * 0.9', ['tank_volume', 'tank_depth'], { code: '2.2.1.2.1', level: 'PROFESSIONAL' }),
      comp('wp', 'Waterproofing Cristalin Dinding Bak Dalam', G.ATAP, 'm2', 'tank_volume * 1.15', ['tank_volume'], { code: '3.4.2', price: 132500, level: 'PROFESSIONAL', priceNote: 'Item kanonis waterproofing kristalin; fallback referensi bila komposisi tidak FULL.' }),
      comp('modul', 'Modul Geocellular Tambahan (Bila Desain Modular)', G.KHUSUS, 'm3', 'tank_volume * 0.3', ['tank_volume'], { price: 1150000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi modul PP geocellular terpasang termasuk geotekstil pembungkus.' }),
      comp('pompa', 'Pompa Submersible Cutter 75 LPM Kuras Bak', G.MEKANIKAL, 'unit', '1', [], { code: '6.2.2.2', level: 'COMPREHENSIVE' }),
      comp('manhole', 'Bak Kontrol 60x60 untuk Manhole Bak', G.DRAINASE, 'buah', 'num_inlets', ['num_inlets'], { code: '6.3.3', level: 'PROFESSIONAL' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Volume struktur beton diasumsikan 34% dari volume tampung untuk bak beton konvensional; desain modular mengurangi beton secara signifikan (komponen opsional).'],
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'DRN-SEWER-LINE',
    name: 'Jaringan Pipa Air Limbah + Manhole (Kawasan)',
    category: 'DRAINASE_SANITASI',
    subcategory: 'Sewer Kawasan',
    description: 'Jaringan pengumpul air limbah kawasan perumahan/komersial: pipa PVC/HDPE diameter bertingkat, manhole beton berkala, sambungan persil, dan pengujian kemiringan. Menuju STP/IPAL atau sewer kota.',
    badge: 'Sewer',
    icon: 'Network',
    parameters: [
      num('pipe_length', 'Panjang Total Jaringan Pipa', 900, { min: 100, max: 10000, unit: 'm' }),
      num('num_manholes', 'Jumlah Manhole', 18, { min: 2, max: 200, group: 'specifications' }),
      num('num_connections', 'Jumlah Sambungan Persil', 60, { min: 5, max: 600, group: 'specifications' })
    ],
    components: [
      comp('galian', 'Galian Parit Pipa Tanah Biasa (Kedalaman bertingkat)', G.TANAH, 'm3', 'pipe_length * 0.95', ['pipe_length'], { code: '1.2.1.1.2' }),
      comp('urugan-pasir', 'Urugan Pasir Alas & Selimut Pipa (dari Beton Mutu Rendah setara bedding)', G.TANAH, 'm3', 'pipe_length * 0.16', ['pipe_length'], { price: 245000, priceNote: 'Referensi pasir urug bedding pipa terpasang & dipadatkan ringan.' }),
      comp('pipa-6', 'Pipa Air Limbah Tanah DN 6" Jalur Cabang', G.DRAINASE, 'm1', 'pipe_length * 0.55', ['pipe_length'], { code: '6.4.5.1' }),
      comp('pipa-8', 'Pipa Air Limbah Tanah DN 8" Kolektor Utama', G.DRAINASE, 'm1', 'pipe_length * 0.45', ['pipe_length'], { code: '6.4.5.2' }),
      comp('hdpe', 'Pipa HDPE DN 2-1/2" Sambungan Persil', G.DRAINASE, 'm', 'num_connections * 6', ['num_connections'], { code: '9.3.1.1', level: 'PROFESSIONAL' }),
      comp('manhole-beton', 'Beton Manhole & Bak Kontrol fc 15 MPa (Struktur)', G.STRUKTUR, 'm3', 'num_manholes * 1.15', ['num_manholes'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('tutup-mh', 'Tutup Manhole Besi Cor Heavy Duty per Unit', G.DRAINASE, 'unit', 'num_manholes', ['num_manholes'], { price: 2850000, level: 'PROFESSIONAL', priceNote: 'Referensi frame & cover ductile iron kelas D400 terpasang.' }),
      comp('sambungan', 'Sambungan Rumah Air Minum/Limbah dia. 2" (Padanan Sambungan Persil)', G.SANITASI, 'buah', 'num_connections', ['num_connections'], { code: '6.7.1.2', price: 19404, level: 'COMPREHENSIVE', priceNote: 'Item kanonis sambungan rumah dipakai sebagai padanan coupling persil; paket sambungan lengkap diverifikasi saat pengadaan.' }),
      comp('urugan', 'Urugan Kembali & Pemadatan Parit (Stamper)', G.TANAH, 'm3', 'pipe_length * 0.62', ['pipe_length'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('uji', 'Uji Kemiringan & Kebocoran Jaringan (Paket per 100 m)', G.KHUSUS, 'unit', 'pipe_length / 100', ['pipe_length'], { price: 1250000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi mandrel/air test per seksi jaringan.' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk STP/IPAL penerima, sambungan ke sewer kota (retribusi PDAM/pemkot), dan perizinan pembuangan.']
  }),

  tpl({
    id: 'DRN-STORM-CULVERT',
    name: 'Gorong-gorong & Cross Drain Jalan (RCP + Box)',
    category: 'DRAINASE_SANITASI',
    subcategory: 'Cross Drain',
    description: 'Pekerjaan cross drain jalan: gorong-gorong pipa beton bertulang (RCP) dan box culvert pracetak, headwall sayap beton, dan perbaikan perkerasan di atasnya. Per titik lintasan dengan panjang lintasan jalan.',
    badge: 'Cross Drain',
    icon: 'CircleArrowRight',
    parameters: [
      num('crossing_length', 'Panjang Lintasan (Lebar Jalan + Bahu)', 12, { min: 6, max: 40, unit: 'm' }),
      num('num_points', 'Jumlah Titik Cross Drain', 4, { min: 1, max: 40, group: 'specifications' }),
      num('headwall_sides', 'Jumlah Sisi Headwall per Titik', 2, { min: 1, max: 2, group: 'specifications' })
    ],
    components: [
      comp('galian', 'Galian Tanah Berbatu Jalur Gorong', G.TANAH, 'm3', 'crossing_length * num_points * 2.2', ['crossing_length', 'num_points'], { code: '1.2.3.1.1' }),
      comp('lantai-kerja', 'Beton Mutu Rendah fc 7,5 Lantai Kerja Culvert', G.STRUKTUR, 'm3', 'crossing_length * num_points * 0.22', ['crossing_length', 'num_points'], { code: '2.2.1.4.1', price: 928002 }),
      comp('box60', 'Box Culvert 60x60x100 Pracetak + Lantai Kerja', G.DRAINASE, 'm1', 'crossing_length * num_points * 0.6', ['crossing_length', 'num_points'], { code: '8.3.1.3', price: 2248234, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis box culvert.' }),
      comp('box80', 'Box Culvert 80x80x100 Pracetak (Seksi Dalam)', G.DRAINASE, 'm1', 'crossing_length * num_points * 0.4', ['crossing_length', 'num_points'], { code: '8.3.1.4', price: 3615744, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis.' }),
      comp('headwall', 'Beton Headwall & Sayap fc 15 MPa', G.STRUKTUR, 'm3', 'num_points * headwall_sides * 1.9', ['num_points', 'headwall_sides'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('besi', 'Penulangan Headwall BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'num_points * headwall_sides * 118', ['num_points', 'headwall_sides'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('batu-sayap', 'Pasangan Batu Belah Perkuatan Mulut Gorong', G.PONDASI, 'm3', 'num_points * headwall_sides * 1.2', ['num_points', 'headwall_sides'], { code: '2.2.2.1.3', level: 'COMPREHENSIVE' }),
      comp('urugan', 'Urugan Kembali & Pemadatan di Atas Culvert (Stamper)', G.TANAH, 'm3', 'crossing_length * num_points * 1.1', ['crossing_length', 'num_points'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('perkeras', 'Perkerasan Beton Pemulihan di Atas Cross Drain fc 25', G.PERKERASAN, 'm3', 'crossing_length * num_points * 0.55', ['crossing_length', 'num_points'], { code: '7.2.2.3', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'DRN-BIOFILTER-GARDEN',
    name: 'Biofilter Taman & Kolam Retensi Lanskap (Rain Garden)',
    category: 'DRAINASE_SANITASI',
    subcategory: 'Rain Garden',
    description: 'Rain garden & kolam retensi lanskap untuk kawasan perumahan/komersial: cekungan biofilter media berlapis, tanaman fitoremediasi, lapisan geomembran parsial, dan pelimpah aman ke drainase utama.',
    badge: 'Rain Garden',
    icon: 'Flower2',
    parameters: [
      num('garden_area', 'Luas Rain Garden / Kolam', 450, { min: 60, max: 5000, unit: 'm²' }),
      num('media_depth', 'Kedalaman Media Biofilter', 0.8, { min: 0.5, max: 1.2, unit: 'm', group: 'specifications' }),
      num('perimeter', 'Keliling Cekungan', 90, { min: 25, max: 600, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area', G.PERSIAPAN, 'm2', 'garden_area * 1.15', ['garden_area'], { code: 'A.1.01.a.1' }),
      comp('galian', 'Galian Cekungan Tanah Biasa', G.TANAH, 'm3', 'garden_area * (media_depth + 0.25)', ['garden_area', 'media_depth'], { code: '1.2.1.1.2' }),
      comp('geomembran', 'Geomembran 1,5 mm Zona Tampung Permanen (Parsial)', G.PONDASI, 'm2', 'garden_area * 0.4', ['garden_area'], { code: '1.5.7', level: 'PROFESSIONAL' }),
      comp('media', 'Media Biofilter Berlapis (Pasir, Kompos, Kerikil) Terhampar', G.LANSKAP, 'm3', 'garden_area * media_depth', ['garden_area', 'media_depth'], { price: 425000, priceNote: 'Referensi media engineered soil biofilter termasuk pengujian infiltrasi dasar.' }),
      comp('drain-bawah', 'Pipa HDPE DN 4" Underdrain Biofilter', G.DRAINASE, 'm', 'garden_area * 0.22', ['garden_area'], { code: '9.3.1.2', level: 'PROFESSIONAL' }),
      comp('tanaman', 'Penanaman Vegetasi Fitoremediasi & Semak Tepi', G.LANSKAP, 'm2', 'garden_area * 0.55', ['garden_area'], { price: 68500, level: 'PROFESSIONAL', priceNote: 'Referensi tanaman rawa lokal & semak penahan erosi terpasang.' }),
      comp('siram', 'Penyiraman Awal Tanaman (Sprinkler per Hari)', G.LANSKAP, 'm2', 'garden_area * 0.55', ['garden_area'], { code: '4.2.1.2', level: 'COMPREHENSIVE' }),
      comp('batu-tepi', 'Batu Kali Hias & Penahan Tepi Cekungan (Pasangan Batu setara)', G.LANSKAP, 'm3', 'perimeter * 0.28', ['perimeter'], { code: '2.2.2.1.4', level: 'COMPREHENSIVE' }),
      comp('pelimpah', 'Beton Pelimpah (Spillway Kecil) fc 15 MPa', G.STRUKTUR, 'm3', '4.5', [], { code: '2.2.1.4.3', price: 1355000, level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'DRN-SEPTIC-COMMUNAL',
    name: 'Tangki Septik Komunal & Bidang Resapan (Perumahan)',
    category: 'DRAINASE_SANITASI',
    subcategory: 'Septik Komunal',
    description: 'Pengolahan limbah domestik komunal untuk klaster perumahan: tangki septik beton bertingkat, anaerobic biofilter, bidang resapan, dan jaringan pengumpul pendek. Alternatif kawasan tanpa sewer kota.',
    badge: 'Komunal',
    icon: 'Container',
    parameters: [
      num('num_houses', 'Jumlah Rumah Terlayani', 40, { min: 8, max: 300, group: 'specifications' }),
      num('tank_volume', 'Volume Tangki Septik Komunal', 55, { min: 12, max: 400, unit: 'm³', group: 'specifications' }),
      num('field_area', 'Luas Bidang Resapan', 120, { min: 25, max: 1000, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area', G.PERSIAPAN, 'm2', 'tank_volume * 2.1', ['tank_volume'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Berbatu Bak Komunal', G.TANAH, 'm3', 'tank_volume * 1.3', ['tank_volume'], { code: '1.2.3.1.1' }),
      comp('beton-kedap', 'Beton Kedap Air Tangki Septik Komunal', G.STRUKTUR, 'm3', 'tank_volume * 0.42', ['tank_volume'], { code: '2.2.1.5.11', price: 1565000 }),
      comp('besi', 'Penulangan Tangki BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'tank_volume * 13', ['tank_volume'], { code: '2.2.1.1.4' }),
      comp('wp', 'Waterproofing Semen Base Tangki Dalam', G.ATAP, 'm2', 'tank_volume * 1.5', ['tank_volume'], { code: '3.4.3', level: 'PROFESSIONAL' }),
      comp('media-bio', 'Media Biofilter Anaerob (Honeycomb/Bio-ball) per m³ Tangki', G.KHUSUS, 'm3', 'tank_volume * 0.35', ['tank_volume'], { price: 1850000, level: 'PROFESSIONAL', priceNote: 'Referensi media biofilter plastik terpasang termasuk support grid.' }),
      comp('resapan-kerikil', 'Bidang Resapan: Lapis Kerikil & Pasir Bergradasi', G.DRAINASE, 'm3', 'field_area * 0.7', ['field_area'], { price: 345000, level: 'PROFESSIONAL', priceNote: 'Referensi material resapan terhampar termasuk pipa distribusi perforasi dasar.' }),
      comp('geotekstil', 'Geotekstil Tipis Mekanis Pembungkus Bidang Resapan', G.PONDASI, 'm2', 'field_area * 1.15', ['field_area'], { code: '1.5.2', level: 'PROFESSIONAL' }),
      comp('pipa-kumpul', 'Pipa Air Limbah Tanah DN 6" Pengumpul Klaster', G.DRAINASE, 'm1', 'num_houses * 5.5', ['num_houses'], { code: '6.4.5.1', level: 'PROFESSIONAL' }),
      comp('vent', 'Air Vent Ø 3" Ventilasi Tangki', G.SANITASI, 'buah', 'Math.ceil(num_houses / 12)', ['num_houses'], { code: '9.7.4.1', level: 'COMPREHENSIVE' }),
      comp('sumur-uji', 'Sumur Resapan Akhir dia. 80 cm (Polishing)', G.DRAINASE, 'unit', 'Math.ceil(num_houses / 15)', ['num_houses'], { code: '6.2.4.2', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Beban limbah diasumsikan 120 L/orang/hari & 4 orang/rumah; waktu tinggal tangki ≥ 2 hari.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk jaringan limbah di dalam rumah, pengurasan berkala, dan perizinan lingkungan komunal.']
  }),

  // =======================================================================
  // JEMBATAN & STRUKTUR (kategori baru, 7)
  // =======================================================================
  tpl({
    id: 'BRG-GIRDER-20M',
    name: 'Jembatan Gelagar Beton Pratekan Bentang 20 m',
    category: 'JEMBATAN_STRUKTUR',
    subcategory: 'Jembatan Gelagar',
    description: 'Jembatan jalan lokal bentang tunggal 20 m: abutment beton bertulang, gelagar pracetak pratekan (penyediaan & pemasangan), lantai kendaraan, trotoar & railing, serta oprit. Per unit jembatan lebar 7 m.',
    badge: 'Bentang 20 m',
    icon: 'Landmark',
    parameters: [
      num('span_length', 'Bentang Jembatan', 20, { min: 12, max: 40, unit: 'm', group: 'specifications' }),
      num('bridge_width', 'Lebar Jembatan (Lantai Kendaraan + Trotoar)', 7, { min: 4, max: 14, unit: 'm' }),
      num('abutment_height', 'Tinggi Abutment Rata-rata', 4.5, { min: 2, max: 9, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Jembatan & Oprit', G.PERSIAPAN, 'm2', 'span_length * bridge_width * 2.2', ['span_length', 'bridge_width'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Berbatu Kunci Abutment', G.TANAH, 'm3', 'bridge_width * abutment_height * 3.4', ['bridge_width', 'abutment_height'], { code: '1.2.3.1.1' }),
      comp('batu-kunci', 'Pasangan Batu Belah Perkuatan Kaki Abutment', G.PONDASI, 'm3', 'bridge_width * abutment_height * 0.8', ['bridge_width', 'abutment_height'], { code: '2.2.2.1.3' }),
      comp('beton-abut', 'Beton Abutment & Wing Wall fc 15 MPa', G.STRUKTUR, 'm3', 'bridge_width * abutment_height * 1.55', ['bridge_width', 'abutment_height'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Abutment BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'bridge_width * abutment_height * 88', ['bridge_width', 'abutment_height'], { code: '2.2.1.1.4' }),
      comp('bekisting-jbt', 'Bekisting Jembatan Pengecoran Abutment (3x Pakai)', G.STRUKTUR, 'm2', 'bridge_width * abutment_height * 2.6', ['bridge_width', 'abutment_height'], { code: '2.2.1.3.8', price: 121041, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis bekisting jembatan.' }),
      comp('girder-supply', 'Penyediaan Gelagar Pracetak Pratekan Tipe U Bentang ±32 m (Padanan Bentang)', G.STRUKTUR, 'unit', 'Math.ceil(bridge_width / 1.6)', ['bridge_width'], { price: 5997643, level: 'PROFESSIONAL', priceNote: 'Harga diselaraskan item kanonis G.37 (penyediaan gelagar); satuan kanonis tidak standar sehingga diperlakukan referensi terverifikasi-sumber.' }),
      comp('girder-erect', 'Pemasangan/Ereksi Gelagar Pratekan (Padanan Kanonis)', G.STRUKTUR, 'unit', 'Math.ceil(bridge_width / 1.6)', ['bridge_width'], { price: 4013839, level: 'PROFESSIONAL', priceNote: 'Diselaraskan item kanonis G.39 (pemasangan gelagar) sebagai referensi terverifikasi-sumber.' }),
      comp('strand', 'Kabel Prategang (Prestressed) Tambahan & Stressing Akhir', G.STRUKTUR, 'kg', 'span_length * bridge_width * 2.2', ['span_length', 'bridge_width'], { code: '2.5.1', price: 93863, level: 'COMPREHENSIVE', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis kabel prategang.' }),
      comp('lantai', 'Beton Lantai Kendaraan & Trotoar fc 15 MPa', G.STRUKTUR, 'm3', 'span_length * bridge_width * 0.22', ['span_length', 'bridge_width'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('bearing', 'Landasan Elastomerik (Bearing Pad) per Titik Tumpu', G.KHUSUS, 'unit', 'Math.ceil(bridge_width / 1.6) * 2', ['bridge_width'], { price: 1250000, level: 'PROFESSIONAL', priceNote: 'Referensi elastomeric bearing pad terpasang (item kanonis G.188 satuan deskriptif, tidak lolos unit-gate).' }),
      comp('joint', 'Sambungan Siar Muai Asphaltic Plug lebar 15 cm', G.KHUSUS, 'm1', 'bridge_width * 2', ['bridge_width'], { code: 'G.166', level: 'PROFESSIONAL' }),
      comp('railing', 'Railing & Handrail Jembatan (Railing Tangga setara)', G.FINISHING, 'm1', 'span_length * 2', ['span_length'], { code: '3.13.5', level: 'COMPREHENSIVE' }),
      comp('oprit', 'Perkerasan Beton Oprit fc 25 Semi Mekanis', G.PERKERASAN, 'm3', 'bridge_width * 7.5', ['bridge_width'], { code: '7.2.2.1', level: 'COMPREHENSIVE' }),
      comp('cat', 'Pengecatan Baja Galvanis Railing & Drainase Jembatan', G.FINISHING, 'm2', 'span_length * 1.4', ['span_length'], { code: '3.8.14', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_INFRA, 'Jumlah gelagar diasumsikan jarak antar gelagar 1,6 m; bentang acuan harga gelagar adalah bentang nominal kanonis ±32 m — untuk bentang lain wajib konfirmasi pabrikan pracetak.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pondasi dalam (tiang pancang/bored pile — template Pondasi & Geoteknik), pengujian beban jembatan, dan jalan pendekat di luar oprit 7,5 m.']
  }),

  tpl({
    id: 'BRG-BOX-BRIDGE',
    name: 'Jembatan Box Culvert Ganda (Lintasan Sungai Kecil)',
    category: 'JEMBATAN_STRUKTUR',
    subcategory: 'Box Culvert Bridge',
    description: 'Pengganti jembatan plat untuk sungai kecil & saluran besar: box culvert pracetak ganda 2x(2x2 m), lantai dasar beton, sayap & headwall, dan perkerasan di atasnya. Ekonomis untuk lebar jalan s.d. 9 m.',
    badge: 'Box Ganda',
    icon: 'Box',
    parameters: [
      num('crossing_length', 'Panjang Lintasan (Lebar Jalan + Bahu)', 11, { min: 7, max: 30, unit: 'm' }),
      num('num_cells', 'Jumlah Sel Box (Cell)', 2, { min: 1, max: 4, group: 'specifications' }),
      num('cell_size', 'Ukuran Sel (m, 1.5–3)', 2, { min: 1.5, max: 3, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Alur Lintasan', G.PERSIAPAN, 'm2', 'crossing_length * num_cells * cell_size * 1.8', ['crossing_length', 'num_cells', 'cell_size'], { code: 'A.1.01.a.1' }),
      comp('alih-alur', 'Pengalihan Alur Sementara & Kistdam (Paket Tanah)', G.TANAH, 'm3', 'crossing_length * 3.2', ['crossing_length'], { price: 145000 }),
      comp('galian', 'Galian Tanah Berbatu Dasar Box', G.TANAH, 'm3', 'crossing_length * num_cells * cell_size * 0.85', ['crossing_length', 'num_cells', 'cell_size'], { code: '1.2.3.1.1' }),
      comp('lantai-kerja', 'Beton Mutu Rendah fc 7,5 Lantai Kerja', G.STRUKTUR, 'm3', 'crossing_length * num_cells * cell_size * 0.1', ['crossing_length', 'num_cells', 'cell_size'], { code: '2.2.1.4.1', price: 928002 }),
      comp('box', 'Box Culvert 80x80 (Padanan Pracetak) — Disesuaikan Ukuran Sel', G.DRAINASE, 'm1', 'crossing_length * num_cells * (cell_size / 0.8) * 0.5', ['crossing_length', 'num_cells', 'cell_size'], { code: '8.3.1.4', price: 3615744, priceNote: 'Komposisi resolver PARTIAL — volume disesuaikan proporsional terhadap sel acuan 80 cm; konfirmasi harga pracetak ukuran besar ke pabrikan.' }),
      comp('headwall', 'Beton Headwall & Apron fc 15 MPa', G.STRUKTUR, 'm3', 'num_cells * cell_size * 2.2', ['num_cells', 'cell_size'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('besi', 'Penulangan Headwall BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'num_cells * cell_size * 132', ['num_cells', 'cell_size'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('batu-sayap', 'Pasangan Batu Belah Sayap & Perkuatan Tebing', G.PONDASI, 'm3', 'num_cells * cell_size * 1.6', ['num_cells', 'cell_size'], { code: '2.2.2.1.3', level: 'PROFESSIONAL' }),
      comp('urugan', 'Urugan Kembali & Pemadatan di Atas Box (Stamper)', G.TANAH, 'm3', 'crossing_length * num_cells * cell_size * 0.5', ['crossing_length', 'num_cells', 'cell_size'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('perkeras', 'Perkerasan Beton di Atas Box fc 25 Ready Mix', G.PERKERASAN, 'm3', 'crossing_length * num_cells * cell_size * 0.18', ['crossing_length', 'num_cells', 'cell_size'], { code: '7.2.2.3', level: 'COMPREHENSIVE' }),
      comp('railing', 'Railing Pengaman Tepi Lintasan', G.FINISHING, 'm1', 'crossing_length * 2', ['crossing_length'], { code: '3.13.5', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Harga box pracetak ukuran besar (> 1 m) sangat bervariasi; komponen box memakai padanan kanonis terdekat dengan penyesuaian proporsional dan wajib dikonfirmasi ke pabrikan.'],
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'BRG-STEEL-TRUSS',
    name: 'Jembatan Rangka Baja Bentang 30 m (Fabrikasi & Ereksi)',
    category: 'JEMBATAN_STRUKTUR',
    subcategory: 'Rangka Baja',
    description: 'Jembatan rangka baja kelas B bentang 30 m: abutment beton, fabrikasi & ereksi rangka baja, lantai beton komposit, dan pengecatan sistem 3 lapis. Untuk sungai lebar tanpa pilar tengah.',
    badge: 'Bentang 30 m',
    icon: 'Landmark',
    parameters: [
      num('span_length', 'Bentang Jembatan', 30, { min: 20, max: 60, unit: 'm', group: 'specifications' }),
      num('bridge_width', 'Lebar Jembatan', 6, { min: 4, max: 12, unit: 'm' }),
      num('steel_weight', 'Estimasi Berat Rangka Baja (ton)', 68, { min: 25, max: 250, unit: 'ton', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Jembatan', G.PERSIAPAN, 'm2', 'span_length * bridge_width * 2.2', ['span_length', 'bridge_width'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Berbatu Abutment', G.TANAH, 'm3', 'bridge_width * 16', ['bridge_width'], { code: '1.2.3.1.1' }),
      comp('beton-abut', 'Beton Abutment & Wing Wall fc 15 MPa', G.STRUKTUR, 'm3', 'bridge_width * 11.5', ['bridge_width'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Abutment BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'bridge_width * 640', ['bridge_width'], { code: '2.2.1.1.4' }),
      comp('baja', 'Fabrikasi & Ereksi Baja Profil Rangka Jembatan', G.STRUKTUR, 'kg', 'steel_weight * 1000', ['steel_weight'], { code: '2.3.1.1', price: 39800, priceNote: 'Komposisi resolver PARTIAL — fallback referensi baja fabrikasi jembatan terpasang.' }),
      comp('pelat', 'Pekerjaan Baja Pelat Semi Mekanis (Sambungan & Gusset)', G.STRUKTUR, 'kg', 'steel_weight * 90', ['steel_weight'], { code: '2.3.1.4', level: 'PROFESSIONAL' }),
      comp('baut', 'Pemasangan Mur & Baut Sambungan Rangka', G.STRUKTUR, 'kg', 'steel_weight * 26', ['steel_weight'], { code: '2.3.1.3', level: 'PROFESSIONAL' }),
      comp('las', 'Pengelasan Listrik Sambungan Lapangan', G.STRUKTUR, 'm1', 'span_length * 3.2', ['span_length'], { code: '3.13.3', level: 'PROFESSIONAL' }),
      comp('cat-sap', 'Pengecatan Baja Galvanis Semprot 3 Lapis', G.FINISHING, 'm2', 'steel_weight * 21', ['steel_weight'], { code: '3.8.14', level: 'PROFESSIONAL' }),
      comp('lantai', 'Beton Lantai Kendaraan Komposit fc 15 MPa', G.STRUKTUR, 'm3', 'span_length * bridge_width * 0.2', ['span_length', 'bridge_width'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('bearing', 'Bearing Pad Elastomerik per Titik', G.KHUSUS, 'unit', '8', [], { price: 1250000, level: 'PROFESSIONAL' }),
      comp('joint', 'Sambungan Siar Muai Asphaltic Plug lebar 30 cm', G.KHUSUS, 'm1', 'bridge_width * 2', ['bridge_width'], { code: 'G.167', level: 'PROFESSIONAL' }),
      comp('trotoar', 'Beton Trotoar & Kerb Jembatan (Tuang Beton Kolom setara)', G.STRUKTUR, 'm3', 'span_length * 0.42', ['span_length'], { code: '2.4.3.3', price: 68915, level: 'COMPREHENSIVE', priceNote: 'Item kanonis penuangan beton pracetak dipakai sebagai padanan pekerjaan tuang trotoar; material beton dihitung pada komponen lantai.' }),
      comp('railing', 'Railing Jembatan & Handrail', G.FINISHING, 'm1', 'span_length * 2', ['span_length'], { code: '3.13.5', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Berat rangka baja adalah parameter desain awal (±55–75 kg/m² lantai untuk bentang 30 m) — wajib diganti hasil desain struktur final.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pondasi dalam, launching gantry khusus, uji beban, dan jalan pendekat.']
  }),

  tpl({
    id: 'BRG-PEDESTRIAN-STEEL',
    name: 'JPO — Jembatan Penyeberangan Orang Baja + Ramp Difabel',
    category: 'JEMBATAN_STRUKTUR',
    subcategory: 'JPO',
    description: 'Jembatan penyeberangan orang baja melintasi jalan arteri: tangga & ramp landai difabel, struktur baja, atap sebagian, lantai anti-slip, dan pencahayaan. Per unit JPO bentang lintasan standar.',
    badge: 'JPO',
    icon: 'Footprints',
    parameters: [
      num('crossing_span', 'Bentang Lintasan JPO', 24, { min: 12, max: 45, unit: 'm', group: 'specifications' }),
      num('deck_width', 'Lebar Gelagar JPO', 2.5, { min: 2, max: 4, unit: 'm' }),
      num('ramp_length', 'Panjang Total Ramp & Tangga (2 Sisi)', 66, { min: 30, max: 160, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Kaki JPO', G.PERSIAPAN, 'm2', 'ramp_length * 4.4', ['ramp_length'], { code: 'C.37' }),
      comp('galian', 'Galian Pondasi Kaki JPO Tanah Berbatu', G.TANAH, 'm3', 'ramp_length * 1.1', ['ramp_length'], { code: '1.2.3.1.1' }),
      comp('beton', 'Beton Pondasi & Kolom Kaki fc 15 MPa', G.STRUKTUR, 'm3', 'ramp_length * 0.52', ['ramp_length'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Kaki BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'ramp_length * 34', ['ramp_length'], { code: '2.2.1.1.4' }),
      comp('baja', 'Fabrikasi & Ereksi Baja Gelagar & Ramp JPO', G.STRUKTUR, 'kg', '(crossing_span * deck_width + ramp_length * deck_width) * 42', ['crossing_span', 'deck_width', 'ramp_length'], { code: '2.3.1.1', price: 39800 }),
      comp('cat', 'Pengecatan Baja Meni Besi Struktur JPO', G.FINISHING, 'm2', '(crossing_span + ramp_length) * deck_width * 0.85', ['crossing_span', 'ramp_length', 'deck_width'], { code: '3.8.16', level: 'PROFESSIONAL' }),
      comp('lantai-jpo', 'Pelat Lantai JPO Anti-Slip (Beton Ringan + Coating setara hardener)', G.LANTAI, 'm2', '(crossing_span + ramp_length) * deck_width', ['crossing_span', 'ramp_length', 'deck_width'], { code: '3.9.9.9', level: 'PROFESSIONAL', priceNote: 'Floor hardener kanonis dipakai sebagai padanan finishing lantai gelagar; pelat baja lantai termasuk dalam berat struktur baja.' }),
      comp('atap', 'Atap UPVC Gelagar JPO (Opsional Sebagian)', G.ATAP, 'm2', 'crossing_span * deck_width * 1.1', ['crossing_span', 'deck_width'], { code: '3.1.3.5', level: 'COMPREHENSIVE', optional: true }),
      comp('railing', 'Railing & Handrail Ganda JPO (Anak & Dewasa)', G.FINISHING, 'm1', '(crossing_span + ramp_length) * 2', ['crossing_span', 'ramp_length'], { code: '3.13.5', level: 'PROFESSIONAL' }),
      comp('tactile', 'Paving Tactile Jalur Difabel Kaki JPO', G.PERKERASAN, 'm2', 'ramp_length * 0.5', ['ramp_length'], { code: '7.1.1.3', level: 'COMPREHENSIVE' }),
      comp('lampu', 'Instalasi Titik Lampu Luar/Taman Jalur JPO (NYFGBY)', G.ELEKTRIKAL, 'titik', 'Math.ceil((crossing_span + ramp_length) / 9)', ['crossing_span', 'ramp_length'], { code: '5.3.1.32', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Kemiringan ramp diasumsikan memenuhi aksesibilitas (≤ 1:12) dengan bordes; berat baja 42 kg/m² gelagar adalah asumsi awal.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk lift JPO, eskalator, CCTV, dan penutupan/pengalihan lalu lintas skala besar saat ereksi.']
  }),

  tpl({
    id: 'BRG-SLAB-CULVERT',
    name: 'Jembatan Plat Beton Bentang Pendek (Slab Bridge 6–10 m)',
    category: 'JEMBATAN_STRUKTUR',
    subcategory: 'Slab Bridge',
    description: 'Jembatan plat beton bertulang cor di tempat untuk sungai/saluran kecil: abutment pasangan batu & beton, plat lantai tebal, dan oprit. Solusi ekonomis bentang pendek tanpa gelagar pracetak.',
    badge: 'Bentang Pendek',
    icon: 'Landmark',
    parameters: [
      num('span_length', 'Bentang Bersih', 8, { min: 4, max: 12, unit: 'm', group: 'specifications' }),
      num('bridge_width', 'Lebar Jembatan', 5.5, { min: 3.5, max: 10, unit: 'm' }),
      num('abutment_height', 'Tinggi Abutment', 3, { min: 1.5, max: 6, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area', G.PERSIAPAN, 'm2', 'span_length * bridge_width * 2.4', ['span_length', 'bridge_width'], { code: 'A.1.01.a.1' }),
      comp('galian', 'Galian Kunci Abutment Tanah Berbatu', G.TANAH, 'm3', 'bridge_width * abutment_height * 2.6', ['bridge_width', 'abutment_height'], { code: '1.2.3.1.1' }),
      comp('batu', 'Pasangan Batu Belah Badan Abutment Mortar M', G.PONDASI, 'm3', 'bridge_width * abutment_height * 1.35', ['bridge_width', 'abutment_height'], { code: '2.2.2.1.2' }),
      comp('beton-kepala', 'Beton Kepala Abutment & Dudukan Plat fc 15 MPa', G.STRUKTUR, 'm3', 'bridge_width * 1.6', ['bridge_width'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('plat', 'Beton Plat Lantai Jembatan fc 15 MPa (t=35–45 cm)', G.STRUKTUR, 'm3', 'span_length * bridge_width * 0.4', ['span_length', 'bridge_width'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Plat & Kepala BjTP ≥ 12 mm', G.STRUKTUR, 'kg', '(span_length * bridge_width * 0.4 + bridge_width * 1.6) * 96', ['span_length', 'bridge_width'], { code: '2.2.1.1.4' }),
      comp('bekisting', 'Bekisting & Perancah Plat di Atas Alur (Multiflex setara)', G.STRUKTUR, 'm2', 'span_length * bridge_width * 1.05', ['span_length', 'bridge_width'], { code: 'A.1.03.2e.1', price: 44275, level: 'PROFESSIONAL' }),
      comp('siar', 'Finishing Siar Pasangan Batu Abutment', G.DINDING, 'm2', 'bridge_width * abutment_height * 1.5', ['bridge_width', 'abutment_height'], { code: '2.7.4', level: 'PROFESSIONAL' }),
      comp('railing', 'Railing & Kerb Jembatan Plat', G.FINISHING, 'm1', 'span_length * 2', ['span_length'], { code: '3.13.5', level: 'COMPREHENSIVE' }),
      comp('oprit', 'Perkerasan Beton Oprit fc 25 Semi Mekanis', G.PERKERASAN, 'm3', 'bridge_width * 5.5', ['bridge_width'], { code: '7.2.2.1', level: 'COMPREHENSIVE' }),
      comp('bronjong', 'Bronjong Perkuatan Kaki Abutment (Tidak Kontak Langsung)', G.PONDASI, 'm3', 'bridge_width * 1.2', ['bridge_width'], { code: '2.7.6', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'BRG-BAILEY-TEMP',
    name: 'Jembatan Darurat Tipe Bailey (Sementara, Panel Baja)',
    category: 'JEMBATAN_STRUKTUR',
    subcategory: 'Jembatan Darurat',
    description: 'Jembatan sementara panel baja tipe Bailey untuk darurat bencana & pengalihan lalu lintas selama perbaikan jembatan permanen: abutment sementara, perakitan panel, dan oprit agregat. Panel diasumsikan sewa/bantuan (biaya perakitan & logistik).',
    badge: 'Darurat',
    icon: 'Siren',
    parameters: [
      num('span_length', 'Bentang Bailey', 24, { min: 9, max: 45, unit: 'm', group: 'specifications' }),
      num('num_lanes', 'Jumlah Jalur Panel (1 = single, 2 = double)', 1, { min: 1, max: 2, group: 'specifications' }),
      num('duration_months', 'Durasi Pemasangan (bulan, untuk sewa panel)', 6, { min: 1, max: 24, unit: 'bulan', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Kedua Sisi Sungai', G.PERSIAPAN, 'm2', 'span_length * 14', ['span_length'], { code: 'C.37' }),
      comp('galian', 'Galian & Perataan Dudukan Abutment Sementara', G.TANAH, 'm3', 'span_length * 2.2', ['span_length'], { code: '1.2.1.1.2' }),
      comp('beton-abut', 'Beton Abutment Sementara & Bantalan fc 15 MPa', G.STRUKTUR, 'm3', '13.5', [], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Abutment Sementara', G.STRUKTUR, 'kg', '780', [], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('sewa-panel', 'Sewa Panel Bailey + Transom + Deck (per m Bentang per Bulan)', G.KHUSUS, 'm1', 'span_length * num_lanes * duration_months', ['span_length', 'num_lanes', 'duration_months'], { price: 685000, priceNote: 'Referensi tarif sewa panel Bailey kawasan (sangat tergantung ketersediaan stok BPBD/pemda & jarak angkut).' }),
      comp('ereksi', 'Perakitan & Peluncuran Panel (Pekerjaan Baja Pelat Semi Mekanis setara)', G.STRUKTUR, 'kg', 'span_length * num_lanes * 285', ['span_length', 'num_lanes'], { code: '2.3.1.4', level: 'PROFESSIONAL' }),
      comp('oprit-agregat', 'Lapis Pondasi Agregat Oprit Sementara t=20 cm', G.PERKERASAN, 'm3', 'span_length * 1.7', ['span_length'], { price: 385000, level: 'PROFESSIONAL' }),
      comp('bongkar-panel', 'Pembongkaran & Pengembalian Panel (Akhir Masa)', G.BONGKAR, 'm1', 'span_length * num_lanes', ['span_length', 'num_lanes'], { price: 425000, level: 'COMPREHENSIVE', priceNote: 'Referensi biaya demobilisasi panel termasuk angkut balik regional.' }),
      comp('rambu', 'Marka & Rambu Pengalihan Sementara (Paket)', G.KHUSUS, 'unit', '2', [], { price: 4500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi paket rambu & barikade sementara dua sisi.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Panel Bailey diasumsikan tersedia dari stok pemerintah/BPBD dengan tarif sewa kawasan; bila pengadaan baru, gunakan komponen terpisah di luar template.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pengadaan panel baru, jembatan permanen pengganti, dan penjagaan lalu lintas 24 jam.']
  }),

  tpl({
    id: 'BRG-JOINT-REHAB',
    name: 'Rehabilitasi Expansion Joint & Bearing Jembatan',
    category: 'JEMBATAN_STRUKTUR',
    subcategory: 'Rehabilitasi Jembatan',
    description: 'Paket pemeliharaan berkala jembatan eksisting: penggantian sambungan siar muai, penggantian bearing pad, pembersihan pilar, perbaikan railing & pengecatan baja. Per unit jembatan per siklus pemeliharaan.',
    badge: 'Pemeliharaan',
    icon: 'Wrench',
    parameters: [
      num('bridge_width', 'Lebar Jembatan', 8, { min: 4, max: 16, unit: 'm' }),
      num('num_joints', 'Jumlah Garis Expansion Joint', 2, { min: 1, max: 8, group: 'specifications' }),
      num('num_bearings', 'Jumlah Bearing Diganti', 12, { min: 4, max: 60, group: 'specifications' }),
      num('pier_height', 'Tinggi Pilar (Pembersihan & Inspeksi)', 8, { min: 0, max: 30, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('bongkar-joint', 'Pembongkaran Joint & Beton Rusak Sekitarnya (Bongkar Beton setara)', G.BONGKAR, 'm3', 'num_joints * bridge_width * 0.09', ['num_joints', 'bridge_width'], { code: 'G.204' }),
      comp('joint-baru', 'Sambungan Siar Muai Finger Plate lebar 60 mm', G.KHUSUS, 'm1', 'num_joints * bridge_width * 0.45', ['num_joints', 'bridge_width'], { price: 31156, priceNote: 'Harga diselaraskan item kanonis G.177 (finger plate); volume memakai panjang efektif garis joint per jalur roda.' }),
      comp('joint-plug', 'Sambungan Asphaltic Plug lebar 40 cm (Garis Sisa)', G.KHUSUS, 'm1', 'num_joints * bridge_width * 0.55', ['num_joints', 'bridge_width'], { code: 'G.168', level: 'PROFESSIONAL' }),
      comp('beton-perbaikan', 'Beton Perbaikan Kepala Pilar & Dudukan fc 15 MPa', G.STRUKTUR, 'm3', 'num_bearings * 0.32', ['num_bearings'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('bearing', 'Penggantian Bearing Pad Elastomerik (termasuk Jacking Sementara)', G.KHUSUS, 'unit', 'num_bearings', ['num_bearings'], { price: 2850000, level: 'PROFESSIONAL', priceNote: 'Referensi paket ganti bearing termasuk hydraulic jacking & monitoring lendutan.' }),
      comp('bersih-pilar', 'Pembersihan Pilar Jembatan Tinggi ≤ 5 m (per m Tinggi)', G.PERSIAPAN, 'm', 'pier_height', ['pier_height'], { code: 'J.60', condition: 'pier_height > 0', priceNote: 'Item kanonis pemeliharaan jembatan Bina Marga (J.60).' }),
      comp('cat-railing', 'Pengecatan Ulang Baja Railing (Meni Besi)', G.FINISHING, 'm2', 'bridge_width * 3.4', ['bridge_width'], { code: '3.8.16', level: 'PROFESSIONAL' }),
      comp('cat-3lapis', 'Pengecatan Baja Galvanis Manual 3 Lapis (Elemen Struktur)', G.FINISHING, 'm2', 'bridge_width * 2.2', ['bridge_width'], { code: '3.8.15', level: 'COMPREHENSIVE' }),
      comp('marka', 'Marka Ulang Pendekat Jembatan (Cat Penerapan Khusus)', G.PERKERASAN, 'm2', 'bridge_width * 4.5', ['bridge_width'], { code: 'I.43', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Kondisi struktur utama diasumsikan sehat (tidak termasuk perkuatan kapasitas beban); jacking bearing memerlukan penutupan lalu lintas parsial.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk perkuatan struktur, penggantian gelagar, dan manajemen lalu lintas jangka panjang.']
  }),

  // =======================================================================
  // PELABUHAN & PESISIR (kategori baru, 5)
  // =======================================================================
  tpl({
    id: 'CST-SEAWALL',
    name: 'Seawall & Revetmen Pantai Pasangan Batu + Beton',
    category: 'PELABUHAN_PESISIR',
    subcategory: 'Seawall',
    description: 'Dinding penahan gelombang tepi pantai permukiman: kaki turap beton, tubuh revetmen pasangan batu miring, mahkota beton, dan lapisan filter geotekstil. Per meter panjang pantai terlindungi.',
    badge: 'Seawall',
    icon: 'Waves',
    parameters: [
      num('wall_length', 'Panjang Seawall', 300, { min: 50, max: 5000, unit: 'm' }),
      num('wall_height', 'Tinggi Revetmen dari Kaki', 3.2, { min: 1.5, max: 6, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Pantai', G.PERSIAPAN, 'm2', 'wall_length * 7', ['wall_length'], { code: 'A.1.01.a.1' }),
      comp('galian', 'Galian Kaki Revetmen Tanah Berbatu (Zona Pasang)', G.TANAH, 'm3', 'wall_length * wall_height * 0.5', ['wall_length', 'wall_height'], { code: '1.2.3.1.1' }),
      comp('turap-kaki', 'Penetrasi Turap Beton Precast 15x40 Kaki Seawall', G.PONDASI, 'm1', 'wall_length * 3.2', ['wall_length'], { code: '2.2.2.5.2' }),
      comp('geotekstil', 'Geotekstil Sedang Semi Mekanis Filter Revetmen', G.PONDASI, 'm2', 'wall_length * (wall_height + 1.2)', ['wall_length', 'wall_height'], { code: '1.5.4', level: 'PROFESSIONAL' }),
      comp('batu-tubuh', 'Pasangan Batu Belah Tubuh Revetmen Mortar S Semi Mekanis', G.PONDASI, 'm3', 'wall_length * wall_height * 0.62', ['wall_length', 'wall_height'], { code: '2.2.2.1.5' }),
      comp('beton-mahkota', 'Beton Mahkota & Jalur Inspeksi fc 15 MPa', G.STRUKTUR, 'm3', 'wall_length * 0.55', ['wall_length'], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('besi', 'Penulangan Mahkota BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'wall_length * 26', ['wall_length'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('siar', 'Finishing Siar Pasangan Batu Permukaan Revetmen', G.DINDING, 'm2', 'wall_length * wall_height * 1.12', ['wall_length', 'wall_height'], { code: '2.7.4', level: 'PROFESSIONAL' }),
      comp('bronjong-kaki', 'Bronjong Apron Kaki Depan (Kontak Air)', G.PONDASI, 'm3', 'wall_length * 0.9', ['wall_length'], { code: '2.7.7', price: 693561, level: 'COMPREHENSIVE' }),
      comp('jalan-atas', 'Paving Block Jalur Pejalan di Atas Seawall', G.PERKERASAN, 'm2', 'wall_length * 2.2', ['wall_length'], { code: '7.1.1.1', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_INFRA, 'Elevasi mahkota mengikuti muka air pasang tertinggi + jagaan setempat; kajian gelombang menentukan kebutuhan lapis armor tambahan.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pemecah gelombang lepas pantai, reklamasi, dan pengerukan kolam pelabuhan.']
  }),

  tpl({
    id: 'CST-BREAKWATER',
    name: 'Pemecah Gelombang Kubus Beton & Tetrapod',
    category: 'PELABUHAN_PESISIR',
    subcategory: 'Breakwater',
    description: 'Breakwater rubble mound perlindungan pelabuhan/kolam labuh: inti batu, lapis antara, armor kubus beton/tetrapod, dan mahkota. Per meter panjang struktur dengan penampang tipikal perairan tenang-sedang.',
    badge: 'Breakwater',
    icon: 'Waves',
    parameters: [
      num('bw_length', 'Panjang Breakwater', 150, { min: 30, max: 3000, unit: 'm' }),
      num('bw_height', 'Tinggi Struktur dari Dasar Laut', 5, { min: 2.5, max: 10, unit: 'm', group: 'specifications' }),
      num('crest_width', 'Lebar Mahkota', 3, { min: 2, max: 8, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Dasar Jalur Struktur', G.PERSIAPAN, 'm2', 'bw_length * (bw_height * 1.6 + crest_width)', ['bw_length', 'bw_height', 'crest_width'], { code: 'A.1.01.a.1' }),
      comp('geotekstil', 'Geotekstil Tebal Sedang Manual Dasar Struktur Laut', G.PONDASI, 'm2', 'bw_length * (bw_height * 1.6 + crest_width)', ['bw_length', 'bw_height', 'crest_width'], { code: '1.5.3' }),
      comp('inti', 'Batu Inti (Core) 5–50 kg Terhampar Tongkang/Darat', G.PONDASI, 'm3', 'bw_length * bw_height * bw_height * 0.34', ['bw_length', 'bw_height'], { price: 385000, priceNote: 'Referensi batu inti terhampar termasuk angkut laut dekat.' }),
      comp('antara', 'Batu Lapis Antara 50–300 kg (Underlayer)', G.PONDASI, 'm3', 'bw_length * bw_height * 0.85', ['bw_length', 'bw_height'], { price: 465000, level: 'PROFESSIONAL', priceNote: 'Referensi batu underlayer terpasang dengan crane/tongkang.' }),
      comp('armor-batu', 'Batu Armor 1–3 Ton Lapis Utama (Spot Kritis)', G.PONDASI, 'm3', 'bw_length * bw_height * 0.4', ['bw_length', 'bw_height'], { price: 685000, level: 'PROFESSIONAL', priceNote: 'Referensi batu armor besar terpasang per titik kritis.' }),
      comp('beton-kubus', 'Beton Kubus Armor & Mahkota Ready Mix fc 10 (Pengecoran)', G.STRUKTUR, 'm3', 'bw_length * crest_width * 0.32', ['bw_length', 'crest_width'], { code: '2.2.1.6.1', level: 'PROFESSIONAL' }),
      comp('tetrapod', 'Penurunan & Pemasangan Tetrapod 2,5 Ton (per Unit)', G.KHUSUS, 'unit', 'bw_length * bw_height * 0.16', ['bw_length', 'bw_height'], { code: 'A.3.07.5b', price: 24500000, level: 'COMPREHENSIVE', priceNote: 'Item kanonis hanya jasa pasang per unit (PARTIAL) — fallback referensi mencakup pengadaan tetrapod pracetak + pasang crane tongkang.' }),
      comp('mahkota-beton', 'Beton Mahkota Jalur Inspeksi fc 15 MPa', G.STRUKTUR, 'm3', 'bw_length * crest_width * 0.25', ['bw_length', 'crest_width'], { code: '2.2.1.4.3', price: 1355000, level: 'COMPREHENSIVE' }),
      comp('navigasi', 'Lampu Navigasi & Rambu Suar Ujung Breakwater', G.ELEKTRIKAL, 'unit', '2', [], { price: 18500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi lampu suar tenaga surya terpasang.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Penampang rubble mound diasumsikan trapesoid kemiringan 1:1,5; tinggi gelombang desain menentukan ukuran armor final (rumus Hudson oleh perencana pantai).'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pengerukan alur, caisson beton, dan studi model fisik gelombang.']
  }),

  tpl({
    id: 'CST-JETTY-TIMBER',
    name: 'Dermaga Kayu Wisata & Nelayan (Jetty Apung Dasar)',
    category: 'PELABUHAN_PESISIR',
    subcategory: 'Dermaga Kayu',
    description: 'Dermaga kayu kelas II untuk wisata & perahu nelayan kecil: tiang pancang kayu/dolken, gelagar & lantai papan kayu keras, tangga turun, dan bollard sederhana. Untuk perairan tenang teluk & sungai lebar.',
    badge: 'Jetty Kayu',
    icon: 'Sailboat',
    parameters: [
      num('jetty_length', 'Panjang Dermaga dari Garis Pantai', 40, { min: 10, max: 200, unit: 'm' }),
      num('jetty_width', 'Lebar Lantai Dermaga', 2.5, { min: 1.8, max: 6, unit: 'm' }),
      num('pile_spacing', 'Jarak Antar Tiang (Bentangan)', 2.5, { min: 2, max: 4, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('pancang', 'Pemancangan Tiang Kayu Gelondongan dia. 18–20 cm', G.PONDASI, 'm', 'Math.ceil(jetty_length / pile_spacing) * 2 * 5.5', ['jetty_length', 'pile_spacing'], { code: '2.6.2.2' }),
      comp('pancang-kecil', 'Pemancangan Tiang Kayu/Dolken dia. 6–8 cm (Pengaku & Tangga)', G.PONDASI, 'm', 'jetty_length * 2.2', ['jetty_length'], { code: '2.6.2.1', level: 'PROFESSIONAL' }),
      comp('gelagar', 'Konstruksi Kuda-kuda & Gelagar Kayu Kelas II (Padanan Rangka Kayu)', G.STRUKTUR, 'm2', 'jetty_length * jetty_width', ['jetty_length', 'jetty_width'], { price: 685000, priceNote: 'Referensi struktur gelagar kayu kelas II terpasang termasuk baut & pelat sambung.' }),
      comp('lantai-kayu', 'Lantai Papan Kayu Keras Dermaga (Papan 3/20 setara Lisplank Kayu diperlebar)', G.LANTAI, 'm1', 'jetty_length * jetty_width * 4.4', ['jetty_length', 'jetty_width'], { price: 92500, level: 'PROFESSIONAL', priceNote: 'Referensi papan lantai kayu bangkirai per meter papan terpasang termasuk sekrup stainless.' }),
      comp('baut', 'Pemasangan Mur & Baut Galvanis Struktur Dermaga', G.STRUKTUR, 'kg', 'jetty_length * jetty_width * 0.9', ['jetty_length', 'jetty_width'], { code: '2.3.1.3', level: 'PROFESSIONAL' }),
      comp('cat-kayu', 'Pengecatan Bidang Kayu Dermaga (Plamir + Dasar + 3 Penutup)', G.FINISHING, 'm2', 'jetty_length * jetty_width * 1.7', ['jetty_length', 'jetty_width'], { code: '3.8.5', level: 'COMPREHENSIVE' }),
      comp('railing', 'Railing Kayu/Besi Sisi Dermaga Wisata', G.FINISHING, 'm1', 'jetty_length * 1.6', ['jetty_length'], { code: '3.13.5', level: 'COMPREHENSIVE', optional: true }),
      comp('bollard', 'Bollard Tambat Perahu Kecil & Cleat (per Titik)', G.KHUSUS, 'unit', 'Math.ceil(jetty_length / 8)', ['jetty_length'], { price: 1850000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi bollard baja cor kecil terpasang.' }),
      comp('lampu', 'Lampu Taman LED Dermaga + Tiang 3,8 m', G.ELEKTRIKAL, 'buah', 'Math.ceil(jetty_length / 12)', ['jetty_length'], { code: '5.3.1.56', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_INFRA, 'Kedalaman perairan diasumsikan ≤ 4 m di ujung dermaga dengan dasar lumpur/pasir; tiang kayu diawetkan kelas awet II.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk ponton apung HDPE, fender kapal besar, dan pengerukan kolam labuh.']
  }),

  tpl({
    id: 'CST-WHARF-CONCRETE',
    name: 'Dermaga Beton Tiang Pancang (Wharf Kapal Kecil)',
    category: 'PELABUHAN_PESISIR',
    subcategory: 'Dermaga Beton',
    description: 'Dermaga beton bertulang di atas tiang pancang untuk kapal perintis & kargo kecil: pancang beton, pile cap & balok, plat lantai dermaga, bollard & fender dasar, dan apron belakang. Per segmen panjang tambat.',
    badge: 'Wharf',
    icon: 'Anchor',
    parameters: [
      num('wharf_length', 'Panjang Sisi Tambat', 60, { min: 20, max: 400, unit: 'm' }),
      num('wharf_width', 'Lebar Apron Dermaga', 12, { min: 8, max: 30, unit: 'm' }),
      num('pile_depth', 'Kedalaman Pancang Rata-rata', 18, { min: 8, max: 40, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Kerja Darat', G.PERSIAPAN, 'm2', 'wharf_length * wharf_width * 1.2', ['wharf_length', 'wharf_width'], { code: 'C.37' }),
      comp('pancang', 'Penetrasi Tiang Pancang Beton 25x25 (Jasa Pancang per m)', G.PONDASI, 'm1', 'Math.ceil(wharf_length / 6) * Math.ceil(wharf_width / 5) * pile_depth', ['wharf_length', 'wharf_width', 'pile_depth'], { code: 'A.2.05.1c.3', price: 31250, priceNote: 'Item kanonis penetrasi pancang (PARTIAL — hanya jasa); pengadaan tiang pada komponen terpisah.' }),
      comp('tiang-supply', 'Pengadaan Tiang Pancang Beton Pracetak (per m Tiang)', G.PONDASI, 'm1', 'Math.ceil(wharf_length / 6) * Math.ceil(wharf_width / 5) * pile_depth', ['wharf_length', 'wharf_width', 'pile_depth'], { price: 685000, priceNote: 'Referensi pasok tiang pancang beton 30x30 termasuk angkut laut dekat.' }),
      comp('beton-deck', 'Beton Pile Cap, Balok & Plat Dermaga Ready Mix fc 10 (Basis)', G.STRUKTUR, 'm3', 'wharf_length * wharf_width * 0.34', ['wharf_length', 'wharf_width'], { code: '2.2.1.6.1' }),
      comp('beton-upgrade', 'Tambahan Mutu Beton Struktur Laut (Selisih ke fc 30 Tahan Sulfat)', G.STRUKTUR, 'm3', 'wharf_length * wharf_width * 0.34', ['wharf_length', 'wharf_width'], { price: 385000, level: 'PROFESSIONAL', priceNote: 'Referensi selisih biaya beton lingkungan laut (semen tahan sulfat & admixture) — komponen penambah di atas basis ready-mix kanonis.' }),
      comp('besi', 'Penulangan Struktur Dermaga BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'wharf_length * wharf_width * 30', ['wharf_length', 'wharf_width'], { code: '2.2.1.1.4' }),
      comp('hardener', 'Floor Hardener Permukaan Apron Dermaga', G.LANTAI, 'm2', 'wharf_length * wharf_width * 0.96', ['wharf_length', 'wharf_width'], { code: '3.9.9.9', level: 'PROFESSIONAL' }),
      comp('bollard', 'Bollard Dermaga Kapasitas 25 Ton (per Unit)', G.KHUSUS, 'unit', 'Math.ceil(wharf_length / 15)', ['wharf_length'], { price: 28500000, level: 'PROFESSIONAL', priceNote: 'Referensi bollard baja cor 25 T terpasang termasuk angkur kimia.' }),
      comp('fender', 'Fender Karet Dermaga (per Titik Tambat)', G.KHUSUS, 'unit', 'Math.ceil(wharf_length / 12)', ['wharf_length'], { price: 18500000, level: 'COMPREHENSIVE', priceNote: 'Referensi fender arch/cell kecil terpasang.' }),
      comp('apron', 'Perkerasan Beton Apron Belakang Dermaga fc 25', G.PERKERASAN, 'm3', 'wharf_length * 6 * 0.2', ['wharf_length'], { code: '7.2.2.1', level: 'COMPREHENSIVE' }),
      comp('lampu', 'Lampu Sorot LED 100 W Area Dermaga', G.ELEKTRIKAL, 'unit', 'Math.ceil(wharf_length / 15)', ['wharf_length'], { code: '5.3.1.9', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Grid tiang diasumsikan 6x5 m; beban dermaga untuk kapal ≤ 1.000 DWT dengan alat angkat ringan.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pengerukan kolam labuh (−9 m dst), crane dermaga, gudang transit, dan navigasi pelayaran.']
  }),

  tpl({
    id: 'CST-BEACH-PROTECTION',
    name: 'Pengaman Pantai Kombinasi: Bronjong + Kubus + Revegetasi',
    category: 'PELABUHAN_PESISIR',
    subcategory: 'Pengaman Pantai',
    description: 'Perlindungan pantai abrasi skala permukiman dengan kombinasi lunak-keras: bronjong bertingkat, kubus beton titik kritis, geotekstil, dan revegetasi mangrove/pandan laut. Ramah lingkungan & bertahap.',
    badge: 'Hybrid',
    icon: 'Palmtree',
    parameters: [
      num('shore_length', 'Panjang Pantai Dilindungi', 250, { min: 50, max: 3000, unit: 'm' }),
      num('slope_height', 'Tinggi Lereng Pantai', 2.2, { min: 1, max: 5, unit: 'm', group: 'specifications' }),
      num('mangrove_width', 'Lebar Sabuk Revegetasi', 8, { min: 0, max: 30, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Pantai', G.PERSIAPAN, 'm2', 'shore_length * 6', ['shore_length'], { code: 'A.1.01.a.1' }),
      comp('galian', 'Galian Kaki Struktur Tanah Berbatu (Zona Pasang)', G.TANAH, 'm3', 'shore_length * slope_height * 0.42', ['shore_length', 'slope_height'], { code: '1.2.3.1.1' }),
      comp('geotekstil', 'Geotekstil Sedang Manual Filter Lereng', G.PONDASI, 'm2', 'shore_length * (slope_height + 1)', ['shore_length', 'slope_height'], { code: '1.5.3' }),
      comp('bronjong', 'Bronjong Bertingkat Lereng Pantai (Kontak Air)', G.PONDASI, 'm3', 'shore_length * slope_height * 0.85', ['shore_length', 'slope_height'], { code: '2.7.7', price: 693561 }),
      comp('kubus', 'Beton Kubus Penahan Titik Kritis Ready Mix fc 10 (Pengecoran)', G.STRUKTUR, 'm3', 'shore_length * 0.55', ['shore_length'], { code: '2.2.1.6.1', level: 'PROFESSIONAL' }),
      comp('tanah-urug', 'Urugan Tanah Liat Pembentuk Ulang Profil Pantai', G.TANAH, 'm3', 'shore_length * slope_height * 0.5', ['shore_length', 'slope_height'], { code: '1.3.1.5', level: 'PROFESSIONAL' }),
      comp('mangrove', 'Penanaman Mangrove/Pandan Sabuk Hijau (Paket per m² termasuk Ajir)', G.LANSKAP, 'm2', 'shore_length * mangrove_width', ['shore_length', 'mangrove_width'], { price: 42500, condition: 'mangrove_width > 0', level: 'PROFESSIONAL', priceNote: 'Referensi penanaman mangrove propagul/anakan termasuk ajir bambu & garansi tanam 1 musim.' }),
      comp('siram-mangrove', 'Penyiraman & Perawatan Awal Sabuk Hijau (per Hari Paket)', G.LANSKAP, 'hari', 'shore_length * mangrove_width * 0.06', ['shore_length', 'mangrove_width'], { price: 7500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi biaya perawatan awal revegetasi per m²-hari paket.' }),
      comp('jalan-setapak', 'Jalan Setapak Inspeksi Rabat di Belakang Struktur', G.PERKERASAN, 'm2', 'shore_length * 1.5 * 0.4', ['shore_length'], { price: 265000, level: 'COMPREHENSIVE', priceNote: 'Referensi rabat beton t=8 cm jalur inspeksi.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Energi gelombang diasumsikan rendah-sedang (teluk terlindung); untuk pantai terbuka gunakan template Breakwater/Seawall penuh.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk struktur lepas pantai, sand nourishment skala besar, dan pemantauan garis pantai jangka panjang.']
  })
];
