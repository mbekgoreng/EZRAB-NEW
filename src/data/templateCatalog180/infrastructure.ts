/**
 * Katalog 180 — Infrastruktur: JALAN_TRANSPORTASI (+5), SDA_IRIGASI (+6),
 * PERKERASAN (+4), UTILITAS (+5).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { G, num, comp, tpl } from './builders';

const ASUMSI_INFRA = [
  'Nilai default parameter adalah asumsi awal berlabel — wajib disesuaikan dengan DED, data tanah, dan kondisi lapangan.',
  'Harga resmi hanya untuk komponen berkode AHSP 2026 kanonis yang lolos gerbang resolver; sisanya harga referensi pasar 2026.',
  'Pekerjaan persiapan kawasan skala besar (pembebasan lahan, relokasi utilitas pihak ketiga) tidak termasuk.'
];
const EKSKLUSI_INFRA = [
  'Tidak termasuk pembebasan lahan, ganti rugi, dan relokasi jaringan utilitas milik pihak ketiga.',
  'Tidak termasuk pengujian laboratorium & jasa konsultan pengawas kecuali dinyatakan sebagai komponen.'
];

export const INFRA_TEMPLATES_A: RabTemplate[] = [
  // =======================================================================
  // JALAN & TRANSPORTASI (+5)
  // =======================================================================
  tpl({
    id: 'INFRA-ROAD-COLLECTOR',
    name: 'Jalan Kolektor Aspal 2 Lajur + Drainase & Trotoar',
    category: 'JALAN_TRANSPORTASI',
    subcategory: 'Jalan Kolektor',
    description: 'Paket jalan kolektor perkotaan lengkap per kilometer: struktur perkerasan aspal berlapis, drainase U-ditch tertutup, trotoar difabel, kanstin, marka, dan PJU. Untuk jalan kabupaten/kota kelas kolektor.',
    badge: 'Kolektor',
    icon: 'Milestone',
    parameters: [
      num('road_length', 'Panjang Jalan', 1000, { min: 100, max: 20000, unit: 'm' }),
      num('road_width', 'Lebar Perkerasan', 7, { min: 4, max: 14, unit: 'm', group: 'specifications' }),
      num('sidewalk_width', 'Lebar Trotoar per Sisi', 1.5, { min: 0, max: 4, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Badan Jalan', G.PERSIAPAN, 'm2', 'road_length * (road_width + 4)', ['road_length', 'road_width'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Biasa Badan Jalan (Volume Besar)', G.TANAH, 'm3', 'road_length * road_width * 0.35', ['road_length', 'road_width'], { code: '1.2.1.1.3' }),
      comp('pemadatan', 'Pemadatan Tanah Dasar (Stamper/Proctor setara)', G.TANAH, 'm3', 'road_length * road_width * 0.2', ['road_length', 'road_width'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('lpa', 'Lapis Pondasi Agregat Kelas A t=15 cm', G.PERKERASAN, 'm3', 'road_length * road_width * 0.15', ['road_length', 'road_width'], { price: 425000, priceNote: 'Referensi LPA terhampar & padat (kode BM kanonis memakai skema huruf terpisah; komponen ini belum terpetakan).' }),
      comp('prime', 'Lapis Resap Pengikat (Prime Coat) 0,8 L/m²', G.PERKERASAN, 'm2', 'road_length * road_width', ['road_length', 'road_width'], { price: 21500, level: 'PROFESSIONAL', priceNote: 'Referensi prime coat terpasang.' }),
      comp('acbc', 'Laston Lapis Antara AC-BC (per Ton)', G.PERKERASAN, 'ton', 'road_length * road_width * 0.06 * 2.3', ['road_length', 'road_width'], { code: 'F.27' }),
      comp('acwc', 'Laston Lapis Aus AC-WC (per Ton)', G.PERKERASAN, 'ton', 'road_length * road_width * 0.04 * 2.3', ['road_length', 'road_width'], { code: 'F.22' }),
      comp('uditch', 'Saluran U-Ditch 40x40 + Lantai Kerja (2 Sisi)', G.DRAINASE, 'm1', 'road_length * 2', ['road_length'], { code: '8.1.1.3', price: 585000, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi U-ditch terpasang.' }),
      comp('trotoar', 'Paving Block Trotoar Natural 6 cm fc 20 + Pengunci', G.PERKERASAN, 'm2', 'road_length * sidewalk_width * 2', ['road_length', 'sidewalk_width'], { code: '7.1.1.1', level: 'PROFESSIONAL', condition: 'sidewalk_width > 0' }),
      comp('kanstin', 'Kanstin Jalan Akses 15x40 dengan Kupingan', G.PERKERASAN, 'm1', 'road_length * 2', ['road_length'], { code: '7.1.2.2', level: 'PROFESSIONAL' }),
      comp('marka', 'Marka Jalan Cat Penerapan Umum', G.PERKERASAN, 'm2', 'road_length * 0.45', ['road_length'], { code: 'I.42', level: 'COMPREHENSIVE' }),
      comp('pju', 'Lampu PJU Kawasan LED 50 W + Tiang 6–7 m (per 35 m)', G.ELEKTRIKAL, 'unit', 'Math.ceil(road_length / 35)', ['road_length'], { code: '5.3.1.18', level: 'COMPREHENSIVE' }),
      comp('delineator', 'Patok Pengarah/Delineator Tepi Jalan', G.KHUSUS, 'buah', 'Math.ceil(road_length / 50)', ['road_length'], { code: 'SMKK.0139', price: 165000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Item SMKK kanonis (patok pengarah); fallback referensi bila komposisi tidak FULL.' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: EKSKLUSI_INFRA
  }),

  tpl({
    id: 'INFRA-BRT-CORRIDOR',
    name: 'Koridor BRT: Perkerasan Beton Jalur Bus + Halte (Sipil)',
    category: 'JALAN_TRANSPORTASI',
    subcategory: 'Koridor BRT',
    description: 'Paket sipil koridor bus rapid transit per segmen: perkerasan beton jalur khusus bus, pondasi & struktur halte (sipil), kanstin pemisah, dan marka. Sistem ITS & kendaraan di luar lingkup.',
    badge: 'BRT',
    icon: 'Bus',
    parameters: [
      num('corridor_length', 'Panjang Koridor (2 Arah)', 2000, { min: 300, max: 30000, unit: 'm' }),
      num('lane_width', 'Lebar Jalur Bus per Arah', 3.5, { min: 3, max: 4.5, unit: 'm', group: 'specifications' }),
      num('num_stations', 'Jumlah Halte/Stasiun', 6, { min: 1, max: 60, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Koridor', G.PERSIAPAN, 'm2', 'corridor_length * lane_width * 2.3', ['corridor_length', 'lane_width'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Badan Jalur Bus', G.TANAH, 'm3', 'corridor_length * lane_width * 2 * 0.42', ['corridor_length', 'lane_width'], { code: '1.2.1.1.3' }),
      comp('lpb', 'Lapis Pondasi Agregat Kelas B t=20 cm', G.PERKERASAN, 'm3', 'corridor_length * lane_width * 2 * 0.2', ['corridor_length', 'lane_width'], { price: 385000, priceNote: 'Referensi LPB terhampar & padat.' }),
      comp('rigid', 'Perkerasan Beton fc 30 MPa Jalan Kolektor (Ready Mix)', G.PERKERASAN, 'm3', 'corridor_length * lane_width * 2 * 0.28', ['corridor_length', 'lane_width'], { code: '7.2.2.4' }),
      comp('dowel', 'Dowel & Tie Bar Sambungan Perkerasan (Pekerjaan Baja Siku Las setara)', G.PERKERASAN, 'kg', 'corridor_length * 9', ['corridor_length'], { code: '2.3.1.5', level: 'PROFESSIONAL', priceNote: 'Item kanonis baja siku las dipakai sebagai padanan pekerjaan baja sambungan perkerasan.' }),
      comp('halte-pondasi', 'Pondasi Batu Belah Struktur Halte', G.PONDASI, 'm3', 'num_stations * 14', ['num_stations'], { code: '2.2.2.1.4' }),
      comp('halte-beton', 'Beton Platform & Struktur Halte fc 15 MPa', G.STRUKTUR, 'm3', 'num_stations * 16', ['num_stations'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('halte-baja', 'Struktur Atap Halte Baja Profil (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'num_stations * 2400', ['num_stations'], { code: '2.3.1.1', price: 39800, level: 'PROFESSIONAL' }),
      comp('halte-lantai', 'Lantai Ubin Granit Platform Halte', G.LANTAI, 'm2', 'num_stations * 85', ['num_stations'], { code: '3.9.5.3', level: 'PROFESSIONAL' }),
      comp('kanstin', 'Kanstin Pemisah Jalur 15x40 dengan Kupingan', G.PERKERASAN, 'm1', 'corridor_length * 2', ['corridor_length'], { code: '7.1.2.2', level: 'PROFESSIONAL' }),
      comp('marka', 'Marka Jalan Cat Penerapan Khusus (Jalur Bus)', G.PERKERASAN, 'm2', 'corridor_length * 0.8', ['corridor_length'], { code: 'I.43', level: 'COMPREHENSIVE' }),
      comp('pju', 'Instalasi Titik PJU Tiang 7 m Kabel NYY (per 40 m)', G.ELEKTRIKAL, 'titik', 'Math.ceil(corridor_length / 40)', ['corridor_length'], { code: '5.3.1.36', level: 'COMPREHENSIVE' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk bus, sistem tiket/ITS, genset halte, dan pembebasan lahan pelebaran koridor.']
  }),

  tpl({
    id: 'INFRA-ROAD-MOUNTAIN',
    name: 'Jalan Pegunungan + Dinding Penahan & Bronjong',
    category: 'JALAN_TRANSPORTASI',
    subcategory: 'Jalan Pegunungan',
    description: 'Jalan daerah perbukitan rawan longsor: galian tebing berbatu, dinding penahan batu belah & bronjong lereng, drainase lereng, dan perkerasan aspal tipis. Fokus stabilitas lereng & drainase.',
    badge: 'Pegunungan',
    icon: 'Mountain',
    parameters: [
      num('road_length', 'Panjang Jalan', 800, { min: 100, max: 10000, unit: 'm' }),
      num('road_width', 'Lebar Perkerasan', 4.5, { min: 3, max: 7, unit: 'm', group: 'specifications' }),
      num('retaining_length', 'Panjang Dinding Penahan/Bronjong', 300, { min: 0, max: 5000, unit: 'm', group: 'specifications' }),
      num('retaining_height', 'Tinggi Rata-rata Penahan Lereng', 2.5, { min: 1, max: 6, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lereng Jalan', G.PERSIAPAN, 'm2', 'road_length * (road_width + 6)', ['road_length', 'road_width'], { code: 'C.37' }),
      comp('tebas', 'Tebas Tebang Pohon dia. > 75 cm Jalur Jalan', G.TANAH, 'btg', 'Math.ceil(road_length / 60)', ['road_length'], { code: '1.1.3.7', level: 'PROFESSIONAL' }),
      comp('galian-batu', 'Galian Tanah Berbatu Kedalaman > 1–2 m (Tebing)', G.TANAH, 'm3', 'road_length * road_width * 0.5', ['road_length', 'road_width'], { code: '1.2.3.1.2' }),
      comp('galian-cadas', 'Galian Cadas/Tanah Keras Badan Jalan', G.TANAH, 'm3', 'road_length * road_width * 0.25', ['road_length', 'road_width'], { code: '1.2.4.1.1', level: 'PROFESSIONAL' }),
      comp('buang', 'Angkut Tanah Lepas Jarak s.d. 10 m (Buangan Lereng)', G.TANAH, 'm3', 'road_length * road_width * 0.3', ['road_length', 'road_width'], { code: '1.4.1.1', level: 'PROFESSIONAL' }),
      comp('bronjong', 'Bronjong Kawat Galvanis Penahan Lereng (Tidak Kontak Air)', G.PONDASI, 'm3', 'retaining_length * retaining_height * 1', ['retaining_length', 'retaining_height'], { code: '2.7.6', condition: 'retaining_length > 0' }),
      comp('dpt', 'Pasangan Batu Belah Dinding Penahan (Mortar S Semi Mekanis)', G.PONDASI, 'm3', 'retaining_length * retaining_height * 0.55', ['retaining_length', 'retaining_height'], { code: '2.2.2.1.5', condition: 'retaining_length > 0', level: 'PROFESSIONAL' }),
      comp('geotekstil', 'Geotekstil Tipis Manual Separator Lereng', G.PONDASI, 'm2', 'retaining_length * (retaining_height + 1)', ['retaining_length', 'retaining_height'], { code: '1.5.1', level: 'COMPREHENSIVE' }),
      comp('lpa', 'Lapis Pondasi Agregat Kelas A t=15 cm', G.PERKERASAN, 'm3', 'road_length * road_width * 0.15', ['road_length', 'road_width'], { price: 425000 }),
      comp('acwc', 'Laston Lapis Aus AC-WC (per Ton)', G.PERKERASAN, 'ton', 'road_length * road_width * 0.04 * 2.3', ['road_length', 'road_width'], { code: 'F.22' }),
      comp('drain-lereng', 'Saluran U-Ditch 30x40 Lereng (1 Sisi)', G.DRAINASE, 'm1', 'road_length', ['road_length'], { code: '8.1.1.2', price: 525000, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi U-ditch terpasang.' }),
      comp('guardrail', 'Pagar Pengaman Sisi Jurang (Guardrail W-Beam setara)', G.KHUSUS, 'm1', 'road_length * 0.35', ['road_length'], { price: 685000, level: 'COMPREHENSIVE', priceNote: 'Referensi guardrail galvanis terpasang termasuk tiang & reflektor.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Volume galian tebing diasumsikan campuran tanah berbatu & cadas; desain lereng final mengikuti kajian geoteknik.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk shotcrete & soil nailing (perlu desain khusus), jembatan, dan penanganan longsor skala besar.']
  }),

  tpl({
    id: 'INFRA-PARKING-AREA',
    name: 'Area Parkir & Terminal Bay (Perkerasan + Marka + PJU)',
    category: 'JALAN_TRANSPORTASI',
    subcategory: 'Area Parkir',
    description: 'Lahan parkir/terminal bay kendaraan: perkerasan beton area manuver, kanstin & wheel stop, marka petak parkir, drainase perimeter, dan PJU area. Untuk parkir gedung, terminal, dan pool kendaraan.',
    badge: 'Parkir',
    icon: 'SquareParking',
    parameters: [
      num('parking_area', 'Luas Area Parkir', 2500, { min: 300, max: 30000, unit: 'm²' }),
      num('num_bays', 'Jumlah Petak Parkir', 80, { min: 10, max: 1000, group: 'specifications' }),
      num('perimeter', 'Keliling Area (Drainase & Kanstin)', 220, { min: 60, max: 1500, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Parkir', G.PERSIAPAN, 'm2', 'parking_area * 1.1', ['parking_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Perataan Area', G.TANAH, 'm3', 'parking_area * 0.25', ['parking_area'], { code: '1.2.1.1.2' }),
      comp('urugan', 'Urugan Tanah Liat Tanpa Pemadatan (Perataan Awal)', G.TANAH, 'm3', 'parking_area * 0.12', ['parking_area'], { code: '1.3.1.5', level: 'PROFESSIONAL' }),
      comp('pemadatan', 'Pemadatan Tanah per 20 cm (Timbris Manual)', G.TANAH, 'm3', 'parking_area * 0.2', ['parking_area'], { code: '1.3.2.1', level: 'PROFESSIONAL' }),
      comp('lpb', 'Lapis Pondasi Agregat Kelas B t=15 cm', G.PERKERASAN, 'm3', 'parking_area * 0.15', ['parking_area'], { price: 385000 }),
      comp('rigid', 'Perkerasan Beton fc 25 MPa Jalan Lingkungan (Semi Mekanis)', G.PERKERASAN, 'm3', 'parking_area * 0.18', ['parking_area'], { code: '7.2.2.1' }),
      comp('hardener', 'Floor Hardener Finishing Permukaan Parkir Indoor/Semi', G.LANTAI, 'm2', 'parking_area * 0.4', ['parking_area'], { code: '3.9.9.9', level: 'COMPREHENSIVE', optional: true }),
      comp('kanstin', 'Kanstin Lingkungan 10x20x40 dengan Kupingan', G.PERKERASAN, 'm1', 'perimeter', ['perimeter'], { code: '7.1.2.1', level: 'PROFESSIONAL' }),
      comp('drain', 'Saluran U-Ditch 30x30 Perimeter', G.DRAINASE, 'm1', 'perimeter * 0.8', ['perimeter'], { code: '8.1.1.1', price: 465000, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi U-ditch terpasang.' }),
      comp('marka', 'Marka Jalan Cat (Petak Parkir & Arah)', G.PERKERASAN, 'm2', 'num_bays * 2.6', ['num_bays'], { code: 'I.42', level: 'PROFESSIONAL' }),
      comp('wheelstop', 'Wheel Stop Beton per Petak (Pekerjaan Beton Pracetak setara)', G.KHUSUS, 'buah', 'num_bays', ['num_bays'], { price: 185000, level: 'COMPREHENSIVE', priceNote: 'Referensi wheel stop beton precast terpasang termasuk baut angkur.' }),
      comp('pju', 'Lampu PJU Kawasan LED 50 W + Tiang (per 600 m²)', G.ELEKTRIKAL, 'unit', 'Math.ceil(parking_area / 600)', ['parking_area'], { code: '5.3.1.18', level: 'PROFESSIONAL' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk gedung parkir bertingkat, sistem e-parking & palang otomatis, dan pos jaga.']
  }),

  tpl({
    id: 'INFRA-ROAD-RECONSTRUCTION',
    name: 'Rekonstruksi Jalan Beton Eksisting (Bongkar + Rigid Baru)',
    category: 'JALAN_TRANSPORTASI',
    subcategory: 'Rekonstruksi Jalan',
    description: 'Rekonstruksi perkerasan beton rusak: pembongkaran plat lama, perbaikan tanah dasar & lapis pondasi, perkerasan beton baru, dan rehabilitasi drainase tepi. Untuk peningkatan jalan lingkungan/kolektor eksisting.',
    badge: 'Rekonstruksi',
    icon: 'Construction',
    parameters: [
      num('road_length', 'Panjang Jalan Rekonstruksi', 600, { min: 100, max: 10000, unit: 'm' }),
      num('road_width', 'Lebar Perkerasan', 5, { min: 3, max: 12, unit: 'm', group: 'specifications' }),
      num('old_thickness', 'Tebal Beton Eksisting', 0.18, { min: 0.1, max: 0.35, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('bongkar', 'Pembongkaran Beton Mutu Rendah < 20 MPa (Manual)', G.BONGKAR, 'm3', 'road_length * road_width * old_thickness * 0.6', ['road_length', 'road_width', 'old_thickness'], { code: '1.6.3' }),
      comp('bongkar-keras', 'Pembongkaran Beton Mutu ≥ 20 MPa (Manual)', G.BONGKAR, 'm3', 'road_length * road_width * old_thickness * 0.4', ['road_length', 'road_width', 'old_thickness'], { code: '1.6.4' }),
      comp('buang', 'Angkut Puing & Tanah Lepas s.d. 10 m (per Muat)', G.TANAH, 'm3', 'road_length * road_width * old_thickness * 1.25', ['road_length', 'road_width', 'old_thickness'], { code: '1.4.1.1', level: 'PROFESSIONAL' }),
      comp('galian', 'Galian Perbaikan Tanah Dasar', G.TANAH, 'm3', 'road_length * road_width * 0.22', ['road_length', 'road_width'], { code: '1.2.1.1.2' }),
      comp('geotekstil', 'Geotekstil Tebal Sedang Semi Mekanis (Stabilisasi Dasar Lunak)', G.PONDASI, 'm2', 'road_length * road_width * 0.4', ['road_length', 'road_width'], { code: '1.5.4', level: 'COMPREHENSIVE', optional: true }),
      comp('lpa', 'Lapis Pondasi Agregat Kelas A t=15 cm', G.PERKERASAN, 'm3', 'road_length * road_width * 0.15', ['road_length', 'road_width'], { price: 425000 }),
      comp('rigid', 'Perkerasan Beton fc 25 MPa Ready Mix Jalan Lingkungan', G.PERKERASAN, 'm3', 'road_length * road_width * 0.2', ['road_length', 'road_width'], { code: '7.2.2.3' }),
      comp('curing', 'Perawatan Beton Perkerasan (Penggenangan)', G.PERKERASAN, 'm2', 'road_length * road_width', ['road_length', 'road_width'], { code: '2.2.1.9.1', level: 'PROFESSIONAL' }),
      comp('drain', 'Rehabilitasi Saluran U-Ditch 40x40 (1 Sisi)', G.DRAINASE, 'm1', 'road_length', ['road_length'], { code: '8.1.1.3', price: 585000, level: 'PROFESSIONAL' }),
      comp('bakkontrol', 'Bak Kontrol Pas. Bata 45x45 T=50 cm (Persimpangan Drainase)', G.DRAINASE, 'buah', 'Math.ceil(road_length / 75)', ['road_length'], { code: '6.3.2', level: 'COMPREHENSIVE' }),
      comp('marka', 'Marka Jalan Cat Penerapan Umum', G.PERKERASAN, 'm2', 'road_length * 0.4', ['road_length'], { code: 'I.42', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Proporsi bongkar beton diasumsikan 60% mutu < 20 MPa & 40% ≥ 20 MPa berdasarkan kondisi visual tipikal; verifikasi dengan core drill sebelum kontrak.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk manajemen lalu lintas skala besar, pengalihan utilitas bawah tanah, dan perbaikan jembatan pada segmen.']
  }),

  // =======================================================================
  // SDA & IRIGASI (+6)
  // =======================================================================
  tpl({
    id: 'SDA-RIVER-NORMALIZATION',
    name: 'Normalisasi Sungai & Tanggul Tanah + Turap',
    category: 'SDA_IRIGASI',
    subcategory: 'Normalisasi Sungai',
    description: 'Pengerukan & pelebaran alur sungai, tanggul tanah padat, turap beton pracetak tepi permukiman, dan perkuatan tebing bronjong. Per segmen sungai dengan akses alat dari bantaran.',
    badge: 'Sungai',
    icon: 'Waves',
    parameters: [
      num('river_length', 'Panjang Segmen Sungai', 500, { min: 100, max: 10000, unit: 'm' }),
      num('channel_width', 'Lebar Dasar Alur Rencana', 8, { min: 3, max: 40, unit: 'm', group: 'specifications' }),
      num('dredge_depth', 'Kedalaman Pengerukan Rata-rata', 1.2, { min: 0.3, max: 4, unit: 'm', group: 'specifications' }),
      num('turap_length', 'Panjang Turap Tepi Permukiman', 200, { min: 0, max: 10000, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Bantaran Sungai', G.PERSIAPAN, 'm2', 'river_length * (channel_width + 8)', ['river_length', 'channel_width'], { code: 'A.1.01.a.1' }),
      comp('keruk', 'Galian Tanah Berbatu Alur Sungai (Pengerukan Manual/Semi)', G.TANAH, 'm3', 'river_length * channel_width * dredge_depth * 0.7', ['river_length', 'channel_width', 'dredge_depth'], { code: '1.2.3.1.1' }),
      comp('keruk-biasa', 'Galian Tanah Biasa Alur & Tanggul', G.TANAH, 'm3', 'river_length * channel_width * dredge_depth * 0.3', ['river_length', 'channel_width', 'dredge_depth'], { code: '1.2.1.1.2' }),
      comp('tanggul', 'Timbunan Tanggul dari Galian (Urugan Kembali + Pemadatan Stamper)', G.TANAH, 'm3', 'river_length * 6.5', ['river_length'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('buang', 'Angkut Sedimen s.d. 10 m ke Spoil Area Bantaran', G.TANAH, 'm3', 'river_length * channel_width * dredge_depth * 0.5', ['river_length', 'channel_width', 'dredge_depth'], { code: '1.4.1.1', level: 'PROFESSIONAL' }),
      comp('turap', 'Penetrasi Turap Beton Precast 22x50 (Tepi Permukiman)', G.PONDASI, 'm1', 'turap_length * 4', ['turap_length'], { code: '2.2.2.5.3', condition: 'turap_length > 0' }),
      comp('bronjong', 'Bronjong Kawat Perkuatan Kaki Tebing (Kontak Air)', G.PONDASI, 'm3', 'river_length * 1.4', ['river_length'], { code: '2.7.7', price: 693561, level: 'PROFESSIONAL', priceNote: 'Harga diselaraskan komposisi kanonis bronjong kontak air (fallback referensi bila tidak FULL).' }),
      comp('geotekstil', 'Geotekstil Sedang Manual di Belakang Turap', G.PONDASI, 'm2', 'turap_length * 3.2', ['turap_length'], { code: '1.5.3', level: 'COMPREHENSIVE', condition: 'turap_length > 0' }),
      comp('rumput-tebing', 'Penanaman Vegetasi Tebing (Penyiraman Awal per Hari)', G.LANSKAP, 'hari', 'river_length * 0.4', ['river_length'], { price: 95000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi paket revegetasi tebing (vetiver/rumput lokal) termasuk perawatan awal per satuan hari paket.' }),
      comp('jalan-inspeksi', 'Jalan Inspeksi Rabat Beton Sempit Sepanjang Tanggul', G.PERKERASAN, 'm2', 'river_length * 2.5 * 0.35', ['river_length'], { price: 265000, level: 'COMPREHENSIVE', priceNote: 'Referensi rabat beton t=8 cm jalan inspeksi.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Pengerukan diasumsikan kondisi kering/surut dengan dewatering ringan; sedimen dibuang ke spoil area bantaran ≤ 10 m.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pengerukan mekanis skala besar (ponton keruk), sheet pile baja permanen, dan normalisasi jembatan di segmen.']
  }),

  tpl({
    id: 'SDA-WEIR-SMALL',
    name: 'Bendung Kecil & Pintu Air Irigasi Desa',
    category: 'SDA_IRIGASI',
    subcategory: 'Bendung Kecil',
    description: 'Bendung tetap skala kecil (tinggi ≤ 3 m) untuk irigasi desa: tubuh bendung pasangan batu & beton siklop, lantai apron, pintu angkat manual, dan saluran pengarah. Termasuk peredam energi sederhana.',
    badge: 'Bendung',
    icon: 'Dam',
    parameters: [
      num('weir_width', 'Lebar Bentang Bendung', 18, { min: 6, max: 60, unit: 'm' }),
      num('weir_height', 'Tinggi Tubuh Bendung', 2.5, { min: 1, max: 4, unit: 'm', group: 'specifications' }),
      num('num_gates', 'Jumlah Pintu Air (Pengatur + Pembilas)', 2, { min: 1, max: 8, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Bendung', G.PERSIAPAN, 'm2', 'weir_width * 22', ['weir_width'], { code: 'A.1.01.a.1' }),
      comp('kistdam', 'Kistdam & Pengeringan Sementara (Pekerjaan Tanah Paket)', G.TANAH, 'm3', 'weir_width * 9', ['weir_width'], { price: 145000, priceNote: 'Referensi kistdam tanah + karung termasuk pembongkaran kembali.' }),
      comp('galian', 'Galian Tanah Berbatu Pondasi Bendung', G.TANAH, 'm3', 'weir_width * weir_height * 2.4', ['weir_width', 'weir_height'], { code: '1.2.3.1.1' }),
      comp('siklop', 'Pondasi Beton Siklop 60% fc 15 : 40% Batu (Tubuh Bendung)', G.PONDASI, 'm3', 'weir_width * weir_height * 3.1', ['weir_width', 'weir_height'], { code: '2.2.2.2.1', price: 1012906, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan harga komposisi kanonis siklop.' }),
      comp('batu', 'Pasangan Batu Belah Mortar M (Sayap & Apron)', G.PONDASI, 'm3', 'weir_width * weir_height * 1.1', ['weir_width', 'weir_height'], { code: '2.2.2.1.2', level: 'PROFESSIONAL' }),
      comp('beton', 'Beton Lantai & Pilar Pintu fc 15 MPa', G.STRUKTUR, 'm3', 'weir_width * 1.8 + num_gates * 2.4', ['weir_width', 'num_gates'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm Pilar & Lantai', G.STRUKTUR, 'kg', '(weir_width * 1.8 + num_gates * 2.4) * 62', ['weir_width', 'num_gates'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('siar', 'Finishing Siar Pasangan Batu Kali 1SP:2PP (Mercu & Sayap)', G.DINDING, 'm2', 'weir_width * weir_height * 1.6', ['weir_width', 'weir_height'], { code: '2.7.4', level: 'PROFESSIONAL' }),
      comp('pintu', 'Pintu Air Baja Pelat Rangka Siku + Stang Ulir Manual', G.KHUSUS, 'm2', 'num_gates * 2.6', ['num_gates'], { code: '3.11.1.15', price: 1407892, level: 'PROFESSIONAL', priceNote: 'Item kanonis pintu besi pelat dipakai sebagai padanan pintu air baja; fallback referensi bila tidak FULL.' }),
      comp('bronjong-hilir', 'Bronjong Peredam Energi Hilir (Tidak Kontak Langsung)', G.PONDASI, 'm3', 'weir_width * 1.8', ['weir_width'], { code: '2.7.6', level: 'COMPREHENSIVE' }),
      comp('cat-baja', 'Pengecatan Baja Galvanis 3 Lapis Pintu Air', G.FINISHING, 'm2', 'num_gates * 5.2', ['num_gates'], { code: '3.8.14', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Debit banjir rencana & stabilitas bendung wajib diverifikasi perencana SDA; template adalah estimasi awal lingkup sipil.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk bendung gerak/karet, pintu otomatis/elektrik, dan bangunan ukur debit (ambang ukur terpisah).']
  }),

  tpl({
    id: 'SDA-EMBUNG',
    name: 'Embung / Tampungan Air Tanah & Geomembran',
    category: 'SDA_IRIGASI',
    subcategory: 'Embung',
    description: 'Embung penampung air skala desa: galian kolam, tanggul keliling padat, pelapis geomembran dasar, inlet/outlet sederhana, dan pagar pengaman. Untuk konservasi air & irigasi suplemeter.',
    badge: 'Embung',
    icon: 'Container',
    parameters: [
      num('pond_area', 'Luas Permukaan Embung', 1200, { min: 200, max: 10000, unit: 'm²' }),
      num('pond_depth', 'Kedalaman Rata-rata', 3, { min: 1.5, max: 6, unit: 'm', group: 'specifications' }),
      num('perimeter', 'Keliling Tanggul Embung', 150, { min: 50, max: 600, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area Embung', G.PERSIAPAN, 'm2', 'pond_area * 1.2', ['pond_area'], { code: 'A.1.01.a.1' }),
      comp('galian', 'Galian Tanah Biasa Badan Embung', G.TANAH, 'm3', 'pond_area * pond_depth * 0.82', ['pond_area', 'pond_depth'], { code: '1.2.1.1.2' }),
      comp('tanggul', 'Tanggul Keliling dari Galian (Urugan Kembali)', G.TANAH, 'm3', 'perimeter * 4.4', ['perimeter'], { code: '1.3.1.1', level: 'PROFESSIONAL' }),
      comp('pemadatan', 'Pemadatan Tanggul & Dasar (Stamper Semi Mekanis)', G.TANAH, 'm3', 'perimeter * 4.4 + pond_area * 0.25', ['perimeter', 'pond_area'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('geomembran', 'Geomembran t=1,5 mm Pelapis Dasar & Lereng Dalam', G.PONDASI, 'm2', 'pond_area * 1.45', ['pond_area'], { code: '1.5.7', level: 'PROFESSIONAL' }),
      comp('geotekstil', 'Geotekstil Sedang Manual Pelindung Geomembran', G.PONDASI, 'm2', 'pond_area * 1.45', ['pond_area'], { code: '1.5.3', level: 'COMPREHENSIVE' }),
      comp('inlet', 'Beton Inlet & Outlet fc 15 MPa + Saringan', G.STRUKTUR, 'm3', '14', [], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('pipa-outlet', 'Pipa PVC DN 2-1/2" Outlet & Distribusi Awal', G.DRAINASE, 'm', 'perimeter * 0.5', ['perimeter'], { code: '9.1.1.1', level: 'PROFESSIONAL' }),
      comp('pagar', 'Pagar BRC Galvanis Keliling Embung', G.LANSKAP, 'm2', 'perimeter * 1.5', ['perimeter'], { price: 285000, level: 'COMPREHENSIVE', priceNote: 'Referensi pagar BRC + tiang terpasang (harga kanonis item sejenis tidak mencerminkan pasok material).' }),
      comp('rumput', 'Penanaman Rumput Lereng Luar Tanggul + Penyiraman', G.LANSKAP, 'm2', 'perimeter * 3.4', ['perimeter'], { price: 38500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi penanaman rumput gajah mini + media tanam terpasang.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Tanah dasar diasumsikan cukup kedap sebagai cadangan di bawah geomembran; kajian geologi lokal menentukan kebutuhan liner penuh.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk sumber air (sumur bor/bendung pengalih), jaringan distribusi irigasi lanjutan, dan rumah pompa.']
  }),

  tpl({
    id: 'SDA-FLOOD-POLDER',
    name: 'Sistem Polder Mini: Tanggul + Pintu + Stasiun Pompa (Sipil)',
    category: 'SDA_IRIGASI',
    subcategory: 'Polder & Banjir',
    description: 'Pengendalian banjir kawasan rendah skala kecil: tanggul keliling, kolam retensi, pintu klep otomatis dasar, dan rumah pompa (sipil). Pompa banjir dicantumkan sebagai komponen terpisah terukur.',
    badge: 'Polder',
    icon: 'ShieldAlert',
    parameters: [
      num('levee_length', 'Panjang Tanggul Keliling', 900, { min: 200, max: 6000, unit: 'm' }),
      num('retention_area', 'Luas Kolam Retensi', 3500, { min: 500, max: 30000, unit: 'm²' }),
      num('num_pumps', 'Jumlah Pompa Banjir (unit)', 2, { min: 1, max: 8, group: 'specifications' }),
      num('num_gates', 'Jumlah Pintu Klep/Pintu Air', 3, { min: 1, max: 12, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Tanggul & Kolam', G.PERSIAPAN, 'm2', 'levee_length * 9 + retention_area * 0.4', ['levee_length', 'retention_area'], { code: 'A.1.01.a.1' }),
      comp('galian-kolam', 'Galian Tanah Biasa Kolam Retensi', G.TANAH, 'm3', 'retention_area * 1.6', ['retention_area'], { code: '1.2.1.1.2' }),
      comp('tanggul', 'Tanggul Keliling Padat (Urugan Kembali + Stamper)', G.TANAH, 'm3', 'levee_length * 7.2', ['levee_length'], { code: '1.3.3.1' }),
      comp('geotekstil', 'Geotekstil Tipis Mekanis Kaki Tanggul', G.PONDASI, 'm2', 'levee_length * 3', ['levee_length'], { code: '1.5.2', level: 'PROFESSIONAL' }),
      comp('revet-batu', 'Pasangan Batu Belah Revetmen Lereng Basah Tanggul', G.PONDASI, 'm3', 'levee_length * 0.9', ['levee_length'], { code: '2.2.2.1.3', level: 'PROFESSIONAL' }),
      comp('pintu', 'Pintu Air Baja + Klep (Pintu Besi Pelat setara)', G.KHUSUS, 'm2', 'num_gates * 3.2', ['num_gates'], { code: '3.11.1.15', price: 1407892, level: 'PROFESSIONAL' }),
      comp('rumah-pompa-beton', 'Beton Rumah Pompa & Bak Hisap fc 15 MPa', G.STRUKTUR, 'm3', 'num_pumps * 16 + 12', ['num_pumps'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan Rumah Pompa BjTP ≥ 12 mm', G.STRUKTUR, 'kg', '(num_pumps * 16 + 12) * 58', ['num_pumps'], { code: '2.2.1.1.4', level: 'PROFESSIONAL' }),
      comp('waterstop', 'PVC Waterstop 230–320 mm Bak Pompa', G.STRUKTUR, 'm1', 'num_pumps * 9', ['num_pumps'], { code: '2.2.1.2.4', level: 'COMPREHENSIVE' }),
      comp('pompa', 'Pompa Submersible Cutter 100 LPM (Unit Pompa Awal)', G.MEKANIKAL, 'unit', 'num_pumps', ['num_pumps'], { code: '6.2.2.3', level: 'PROFESSIONAL', priceNote: 'Kapasitas pompa banjir final mengikuti kajian hidrologi; unit kanonis ini adalah pompa awal terukur, bukan pompa banjir utama.' }),
      comp('pipa-buang', 'Pipa Air Limbah Tanah DN 8" Jalur Buang Pompa', G.DRAINASE, 'm1', 'num_pumps * 14', ['num_pumps'], { code: '6.4.5.2', level: 'COMPREHENSIVE' }),
      comp('panel', 'Panel Power Stasiun Pompa (Panel AHU setara)', G.ELEKTRIKAL, 'unit', 'num_pumps', ['num_pumps'], { code: '5.1.2.18', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Tanggul diasumsikan tinggi efektif ±2 m penampang trapesoid standar; pompa utama banjir berskala besar dihitung terpisah oleh perencana hidrologi.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk pompa banjir kapasitas besar & genset stasiun, pintu otomatis elektrik, dan normalisasi sungai penerima.']
  }),

  tpl({
    id: 'SDA-CHECK-DAM',
    name: 'Check Dam & Groundsill Pengendali Sedimen',
    category: 'SDA_IRIGASI',
    subcategory: 'Check Dam',
    description: 'Seri bangunan pengendali sedimen alur gunung: check dam pasangan batu & beton siklop, groundsill, dan apron hilir bronjong. Per unit bangunan pada segmen alur curam.',
    badge: 'Check Dam',
    icon: 'Waves',
    parameters: [
      num('num_units', 'Jumlah Unit Check Dam', 3, { min: 1, max: 20, group: 'specifications' }),
      num('dam_width', 'Lebar Alur per Unit', 10, { min: 4, max: 30, unit: 'm' }),
      num('dam_height', 'Tinggi Check Dam', 2, { min: 1, max: 4, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Alur per Unit', G.PERSIAPAN, 'm2', 'num_units * dam_width * 14', ['num_units', 'dam_width'], { code: 'A.1.01.a.1' }),
      comp('galian', 'Galian Tanah Berbatu Kunci Check Dam', G.TANAH, 'm3', 'num_units * dam_width * dam_height * 1.7', ['num_units', 'dam_width', 'dam_height'], { code: '1.2.3.1.1' }),
      comp('siklop', 'Beton Siklop 60:40 Tubuh Check Dam', G.PONDASI, 'm3', 'num_units * dam_width * dam_height * 1.9', ['num_units', 'dam_width', 'dam_height'], { code: '2.2.2.2.1', price: 1012906, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis.' }),
      comp('batu', 'Pasangan Batu Belah Sayap & Tembok Penahan Alur', G.PONDASI, 'm3', 'num_units * dam_width * dam_height * 0.9', ['num_units', 'dam_width', 'dam_height'], { code: '2.2.2.1.2', level: 'PROFESSIONAL' }),
      comp('siar', 'Finishing Siar Pasangan Batu Mercu', G.DINDING, 'm2', 'num_units * dam_width * dam_height * 1.2', ['num_units', 'dam_width', 'dam_height'], { code: '2.7.4', level: 'PROFESSIONAL' }),
      comp('bronjong', 'Bronjong Apron Hilir per Unit (Kontak Air, Beda Tinggi 3–4 m)', G.PONDASI, 'm3', 'num_units * dam_width * 1.1', ['num_units', 'dam_width'], { code: '2.7.7', price: 693561, level: 'PROFESSIONAL' }),
      comp('beton-lantai', 'Beton Lantai Apron fc 15 MPa', G.STRUKTUR, 'm3', 'num_units * dam_width * 0.9', ['num_units', 'dam_width'], { code: '2.2.1.4.3', price: 1355000, level: 'COMPREHENSIVE' }),
      comp('akses', 'Angkut Material Manual Jalur Alur (per m³ setara)', G.TANAH, 'm3', 'num_units * dam_width * dam_height * 0.8', ['num_units', 'dam_width', 'dam_height'], { code: '1.4.1.1', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_INFRA, 'Material batu diasumsikan tersedia di sekitar alur (jarak angkut manual ≤ 10 m); desain mengikuti pedoman bangunan pengendali sedimen.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk sabo dam beton skala besar, jalan akses permanen, dan penanganan lahar dingin khusus.']
  }),

  tpl({
    id: 'SDA-IRRIGATION-CONCRETE',
    name: 'Saluran Irigasi Lining Beton Pracetak & Pasangan',
    category: 'SDA_IRIGASI',
    subcategory: 'Irigasi Lining Beton',
    description: 'Peningkatan saluran irigasi tanah menjadi lining beton: galian profil, lantai kerja, lining beton bertulang ringan/pracetak, dan bangunan bagi sederhana. Berbeda dari saluran pasangan batu legacy.',
    badge: 'Lining Beton',
    icon: 'Waves',
    parameters: [
      num('channel_length', 'Panjang Saluran', 1000, { min: 100, max: 20000, unit: 'm' }),
      num('channel_width', 'Lebar Dasar Saluran', 0.8, { min: 0.4, max: 3, unit: 'm', group: 'specifications' }),
      num('channel_depth', 'Kedalaman Saluran', 0.8, { min: 0.4, max: 2.5, unit: 'm', group: 'specifications' }),
      num('num_structures', 'Jumlah Bangunan Bagi/Sadap', 5, { min: 0, max: 60, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Jalur Saluran', G.PERSIAPAN, 'm2', 'channel_length * (channel_width + 2.4)', ['channel_length', 'channel_width'], { code: 'A.1.01.a.1' }),
      comp('galian', 'Galian Profil Saluran Tanah Biasa', G.TANAH, 'm3', 'channel_length * (channel_width + channel_depth) * channel_depth * 0.62', ['channel_length', 'channel_width', 'channel_depth'], { code: '1.2.1.1.2' }),
      comp('timbun', 'Timbunan & Pemadatan Bahu Saluran (Stamper)', G.TANAH, 'm3', 'channel_length * 0.7', ['channel_length'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('lantai-kerja', 'Beton Mutu Rendah fc 7,5 Lantai Kerja Lining', G.STRUKTUR, 'm3', 'channel_length * channel_width * 0.05', ['channel_length', 'channel_width'], { code: '2.2.1.4.1', price: 928002, priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis beton mutu rendah.' }),
      comp('lining', 'Beton Lining Saluran fc 15 MPa (Dinding & Lantai)', G.STRUKTUR, 'm3', 'channel_length * (channel_width + channel_depth * 2) * 0.1', ['channel_length', 'channel_width', 'channel_depth'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('wiremesh', 'Wiremesh M6–M10 Penguat Lining Tipis', G.STRUKTUR, 'kg', 'channel_length * (channel_width + channel_depth * 2) * 2.6', ['channel_length', 'channel_width', 'channel_depth'], { code: '2.2.1.1.5', level: 'PROFESSIONAL' }),
      comp('bekisting', 'Bekisting Dinding Saluran (Multiflex, Pakai Ulang)', G.STRUKTUR, 'm2', 'channel_length * channel_depth * 0.7', ['channel_length', 'channel_depth'], { code: 'A.1.03.2e.1', price: 44275, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback diselaraskan komposisi kanonis bekisting.' }),
      comp('bagi-beton', 'Beton Bangunan Bagi/Sadap fc 15 MPa', G.STRUKTUR, 'm3', 'num_structures * 2.8', ['num_structures'], { code: '2.2.1.4.3', price: 1355000, condition: 'num_structures > 0', level: 'PROFESSIONAL' }),
      comp('pintu', 'Pintu Sorong Baja Bangunan Bagi (Pintu Besi Pelat setara)', G.KHUSUS, 'm2', 'num_structures * 0.9', ['num_structures'], { code: '3.11.1.15', price: 1407892, condition: 'num_structures > 0', level: 'COMPREHENSIVE' }),
      comp('siar', 'Finishing Siar & Perataan Bibir Saluran', G.DINDING, 'm2', 'channel_length * 0.4', ['channel_length'], { code: '2.7.4', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Penampang trapesoid diasumsikan; volume lining dari keliling basah dikali tebal 10 cm.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk bangunan ukur, jembatan petani di atas saluran, dan rehabilitasi jaringan tersier di luar panjang saluran.']
  }),

  // =======================================================================
  // PERKERASAN (+4)
  // =======================================================================
  tpl({
    id: 'PAV-CONCRETE-YARD',
    name: 'Halaman Beton Manuver Truk K-350 (Container Yard Ringan)',
    category: 'PERKERASAN',
    subcategory: 'Yard Truk',
    description: 'Perkerasan beton beban berat untuk area manuver & parkir truk: subgrade dipadatkan, LPB/LPA tebal, plat beton fs 45 dengan dowel & joint seal. Untuk pool truk, gudang, dan depo kontainer ringan.',
    badge: 'Beban Berat',
    icon: 'Truck',
    parameters: [
      num('yard_area', 'Luas Area Yard', 3000, { min: 500, max: 30000, unit: 'm²' }),
      num('slab_thickness', 'Tebal Plat Beton', 0.25, { min: 0.18, max: 0.35, unit: 'm', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Yard', G.PERSIAPAN, 'm2', 'yard_area * 1.08', ['yard_area'], { code: 'C.37' }),
      comp('galian', 'Galian Perataan & Pembentukan Badan Yard', G.TANAH, 'm3', 'yard_area * 0.28', ['yard_area'], { code: '1.2.1.1.2' }),
      comp('pemadatan', 'Pemadatan Tanah Dasar per 20 cm (Timbris)', G.TANAH, 'm3', 'yard_area * 0.2', ['yard_area'], { code: '1.3.2.1', level: 'PROFESSIONAL' }),
      comp('geotekstil', 'Geotekstil Sedang Semi Mekanis (Tanah Lunak)', G.PONDASI, 'm2', 'yard_area * 0.35', ['yard_area'], { code: '1.5.4', level: 'COMPREHENSIVE', optional: true }),
      comp('lpb', 'Lapis Pondasi Agregat Kelas B t=15 cm', G.PERKERASAN, 'm3', 'yard_area * 0.15', ['yard_area'], { price: 385000 }),
      comp('lpa', 'Lapis Pondasi Agregat Kelas A t=10 cm', G.PERKERASAN, 'm3', 'yard_area * 0.1', ['yard_area'], { price: 425000, level: 'PROFESSIONAL' }),
      comp('rigid', 'Perkerasan Beton fc 30 MPa Jalan Kolektor Ready Mix', G.PERKERASAN, 'm3', 'yard_area * slab_thickness', ['yard_area', 'slab_thickness'], { code: '7.2.2.4' }),
      comp('dowel', 'Dowel & Tie Bar (Baja Siku Las setara pekerjaan sambungan)', G.PERKERASAN, 'kg', 'yard_area * 1.9', ['yard_area'], { code: '2.3.1.5', level: 'PROFESSIONAL' }),
      comp('joint', 'Joint Sealant Sambungan Plat (Aplikasi Sealant setara)', G.PERKERASAN, 'm1', 'yard_area * 0.55', ['yard_area'], { price: 42000, level: 'COMPREHENSIVE', priceNote: 'Referensi sealant sambungan perkerasan termasuk backing rod.' }),
      comp('curing', 'Perawatan Beton (Penggenangan 4 Hari)', G.PERKERASAN, 'm2', 'yard_area', ['yard_area'], { code: '2.2.1.9.1', level: 'PROFESSIONAL' }),
      comp('drain', 'Saluran U-Ditch 50x50 Keliling Yard', G.DRAINASE, 'm1', 'yard_area * 0.09', ['yard_area'], { code: '8.1.1.4', price: 625000, level: 'COMPREHENSIVE', priceNote: 'Komposisi resolver PARTIAL — fallback referensi U-ditch terpasang.' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk perkerasan blok kontainer bertumpuk (RTG pad khusus), rel crane, dan timbangan truk.']
  }),

  tpl({
    id: 'PAV-GRASS-BLOCK',
    name: 'Grass Block & Eco-Paving Area Parkir Hijau',
    category: 'PERKERASAN',
    subcategory: 'Eco Paving',
    description: 'Perkerasan ramah lingkungan untuk parkir & jalur hijau: grass block berisi tanah media & rumput, lapisan pasir & agregat resapan, dan kanstin pengunci. Mendukung target ruang terbuka hijau kawasan.',
    badge: 'Eco',
    icon: 'Leaf',
    parameters: [
      num('paving_area', 'Luas Area Grass Block', 800, { min: 100, max: 10000, unit: 'm²' }),
      num('perimeter', 'Keliling Area (Kanstin)', 140, { min: 40, max: 800, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'paving_area * 1.1', ['paving_area'], { code: 'C.37' }),
      comp('galian', 'Galian & Perataan Dasar', G.TANAH, 'm3', 'paving_area * 0.22', ['paving_area'], { code: '1.2.1.1.2' }),
      comp('pemadatan', 'Pemadatan Dasar (Stamper)', G.TANAH, 'm3', 'paving_area * 0.18', ['paving_area'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('geotekstil', 'Geotekstil Tipis Manual Lapisan Pemisah Resapan', G.PONDASI, 'm2', 'paving_area', ['paving_area'], { code: '1.5.1', level: 'PROFESSIONAL' }),
      comp('agregat', 'Lapis Agregat Resapan t=15 cm (Batu Pecah 2/3)', G.PERKERASAN, 'm3', 'paving_area * 0.15', ['paving_area'], { price: 365000, priceNote: 'Referensi agregat resapan terhampar (tanpa pemadatan penuh agar tetap porus).' }),
      comp('grassblock', 'Grass Block Beton + Isi Media Tanam & Rumput', G.PERKERASAN, 'm2', 'paving_area', ['paving_area'], { price: 168000, priceNote: 'Referensi grass block terpasang termasuk pasir urug & penanaman rumput awal.' }),
      comp('kanstin', 'Kanstin Lingkungan 10x20x40 dengan Kupingan', G.PERKERASAN, 'm1', 'perimeter', ['perimeter'], { code: '7.1.2.1', level: 'PROFESSIONAL' }),
      comp('siraman', 'Penyiraman Area Tanam Sprinkler (Paket Awal 30 Hari)', G.LANSKAP, 'm2', 'paving_area', ['paving_area'], { code: '4.2.1.2', level: 'COMPREHENSIVE', priceNote: 'Item kanonis penyiraman sprinkler per hari per m² — volume diset sebagai paket awal; verifikasi durasi saat kontrak.' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk sistem irigasi permanen, sumur resapan dalam, dan perawatan rumput jangka panjang.']
  }),

  tpl({
    id: 'PAV-STAMPED-CONCRETE',
    name: 'Stamped Concrete Plaza & Pedestrian Dekoratif',
    category: 'PERKERASAN',
    subcategory: 'Beton Dekoratif',
    description: 'Perkerasan beton cetak (stamped) untuk plaza, trotoar premium, dan area komersial: plat beton berwarna, cetakan pola batu/bata, dan coating sealer. Termasuk lapis pondasi & kanstin.',
    badge: 'Dekoratif',
    icon: 'Palette',
    parameters: [
      num('plaza_area', 'Luas Area Plaza', 600, { min: 100, max: 8000, unit: 'm²' }),
      num('perimeter', 'Keliling Area (Kanstin)', 110, { min: 30, max: 700, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'plaza_area * 1.1', ['plaza_area'], { code: 'C.37' }),
      comp('galian', 'Galian & Perataan Dasar Plaza', G.TANAH, 'm3', 'plaza_area * 0.24', ['plaza_area'], { code: '1.2.1.1.2' }),
      comp('lpb', 'Lapis Pondasi Agregat Kelas B t=12 cm', G.PERKERASAN, 'm3', 'plaza_area * 0.12', ['plaza_area'], { price: 385000 }),
      comp('beton', 'Beton Plat Plaza fc 25 MPa Semi Mekanis (Basis Stamped)', G.PERKERASAN, 'm3', 'plaza_area * 0.12', ['plaza_area'], { code: '7.2.2.1' }),
      comp('stamped', 'Pekerjaan Stamping Pola + Color Hardener + Release Agent', G.PERKERASAN, 'm2', 'plaza_area', ['plaza_area'], { price: 145000, priceNote: 'Referensi tambahan proses stamped di atas plat beton (matras pola, pewarna, pelepas).' }),
      comp('sealer', 'Coating Sealer Gloss Pelindung Stamped Concrete', G.PERKERASAN, 'm2', 'plaza_area', ['plaza_area'], { price: 58000, level: 'PROFESSIONAL', priceNote: 'Referensi sealer akrilik 2 lapis terpasang.' }),
      comp('wiremesh', 'Wiremesh M6–M10 Penguat Plat Plaza', G.STRUKTUR, 'kg', 'plaza_area * 3.9', ['plaza_area'], { code: '2.2.1.1.5', level: 'PROFESSIONAL' }),
      comp('kanstin', 'Kanstin Akses 15x40 Tanpa Kupingan (Tepi Plaza)', G.PERKERASAN, 'm1', 'perimeter', ['perimeter'], { code: '7.1.2.4', level: 'PROFESSIONAL' }),
      comp('tactile', 'Ubin Pemandu Difabel Jalur Plaza (Paving Tactile setara)', G.PERKERASAN, 'm2', 'plaza_area * 0.06', ['plaza_area'], { code: '7.1.1.3', level: 'COMPREHENSIVE', priceNote: 'Item kanonis paving block dipakai sebagai padanan jalur pemandu; material tactile khusus diverifikasi saat pengadaan.' })
    ],
    assumptions: ASUMSI_INFRA,
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk furnitur plaza, air mancur, dan pencahayaan dekoratif (template lanskap terpisah).']
  }),

  tpl({
    id: 'PAV-ASPHALT-OVERLAY',
    name: 'Overlay Aspal Area Parkir & Jalan Internal + Marka',
    category: 'PERKERASAN',
    subcategory: 'Overlay Aspal',
    description: 'Pelapisan ulang aspal di atas perkerasan eksisting: perbaikan tambal, tack coat, overlay AC-WC, penyesuaian tutup manhole, dan marka ulang. Untuk peremajaan parkir & jalan internal kawasan.',
    badge: 'Overlay',
    icon: 'Layers',
    parameters: [
      num('overlay_area', 'Luas Area Overlay', 1500, { min: 200, max: 20000, unit: 'm²' }),
      num('patch_percent', 'Persentase Area Tambal Perbaikan', 8, { min: 0, max: 40, unit: '%', group: 'specifications' }),
      num('num_bays', 'Jumlah Petak Parkir (Marka Ulang)', 50, { min: 0, max: 800, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Penyapuan Permukaan Eksisting (Pengupasan Ringan)', G.PERSIAPAN, 'm2', 'overlay_area', ['overlay_area'], { code: 'C.37' }),
      comp('patch-bongkar', 'Pembongkaran Beton/Aspal Rusak Area Tambal (Bongkar Beton setara)', G.BONGKAR, 'm3', 'overlay_area * patch_percent / 100 * 0.15', ['overlay_area', 'patch_percent'], { code: 'G.204' }),
      comp('patch-lpa', 'Lapis Pondasi Agregat Perbaikan Tambal t=15 cm', G.PERKERASAN, 'm3', 'overlay_area * patch_percent / 100 * 0.15', ['overlay_area', 'patch_percent'], { price: 425000 }),
      comp('patch-acbc', 'Laston AC-BC Penambal & Perata (per Ton)', G.PERKERASAN, 'ton', 'overlay_area * patch_percent / 100 * 0.05 * 2.3', ['overlay_area', 'patch_percent'], { code: 'F.27', level: 'PROFESSIONAL' }),
      comp('tack', 'Lapis Perekat Tack Coat Emulsi 0,3 L/m²', G.PERKERASAN, 'm2', 'overlay_area', ['overlay_area'], { price: 14500, priceNote: 'Referensi tack coat terpasang.' }),
      comp('acwc', 'Laston Lapis Aus AC-WC Overlay 4 cm (per Ton)', G.PERKERASAN, 'ton', 'overlay_area * 0.04 * 2.3', ['overlay_area'], { code: 'F.22' }),
      comp('fogseal', 'Fog Seal Aspal Emulsi Peremajaan Permukaan Lama (Opsional)', G.PERKERASAN, 'm2', 'overlay_area * 0.3', ['overlay_area'], { price: 22500, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi fog seal (kode kanonis D.1 satuan tidak standar; diperlakukan referensi).' }),
      comp('marka', 'Marka Jalan Cat (Petak & Sirkulasi)', G.PERKERASAN, 'm2', 'num_bays * 2.6 + overlay_area * 0.01', ['num_bays', 'overlay_area'], { code: 'I.42', level: 'PROFESSIONAL', condition: 'num_bays > 0' }),
      comp('manhole', 'Penyesuaian & Perapian Tutup Bak Kontrol Eksisting', G.DRAINASE, 'buah', 'Math.ceil(overlay_area / 450)', ['overlay_area'], { code: '6.3.1', price: 561633, level: 'COMPREHENSIVE', priceNote: 'Item kanonis bak kontrol dipakai sebagai padanan pekerjaan penyesuaian tutup; fallback referensi bila tidak FULL.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Perkerasan eksisting diasumsikan masih layak struktural (tanpa rekonstruksi pondasi total); persentase tambal dari survei kondisi visual.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk milling aspal skala besar, perbaikan struktur pondasi gagal total, dan penutupan total area (phasing kerja tidak dihitung).']
  }),

  // =======================================================================
  // UTILITAS (+5)
  // =======================================================================
  tpl({
    id: 'UTIL-WTP-PLANT',
    name: 'Instalasi Pengolahan Air (IPA) & Gedung Pompa',
    category: 'UTILITAS',
    subcategory: 'Pengolahan Air Bersih',
    description: 'Bangunan IPA kapasitas kecil-menengah: bak koagulasi-flokulasi-sedimentasi beton kedap air, gedung pompa & blower, dan ruang kimia. Lingkup sipil proses; peralatan mekanikal oleh vendor.',
    badge: 'IPA/WTP',
    icon: 'Droplets',
    parameters: [
      num('capacity_lps', 'Kapasitas IPA (liter/detik)', 50, { min: 5, max: 500, unit: 'L/det', group: 'specifications' }),
      num('basin_area', 'Luas Total Bak Proses', 420, { min: 80, max: 3000, unit: 'm²' }),
      num('pumphouse_area', 'Luas Gedung Pompa & Blower', 180, { min: 50, max: 900, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', '(basin_area + pumphouse_area) * 1.35', ['basin_area', 'pumphouse_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Bak & Pondasi (Berbatu Ringan)', G.TANAH, 'm3', 'basin_area * 2.6 + pumphouse_area * 0.5', ['basin_area', 'pumphouse_area'], { code: '1.2.3.1.1' }),
      comp('beton-kedap', 'Beton Kedap Air dengan Aditif (Dinding & Lantai Bak)', G.STRUKTUR, 'm3', 'basin_area * 0.85', ['basin_area'], { code: '2.2.1.5.11', price: 1565000, priceNote: 'Komposisi resolver PARTIAL — fallback referensi beton kedap air terpasang.' }),
      comp('beton', 'Beton Struktur Gedung Pompa fc 15 MPa', G.STRUKTUR, 'm3', 'pumphouse_area * 0.18', ['pumphouse_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm (Struktur Air)', G.STRUKTUR, 'kg', 'basin_area * 34 + pumphouse_area * 12', ['basin_area', 'pumphouse_area'], { code: '2.2.1.1.4' }),
      comp('waterstop', 'PVC Waterstop lebar 200 mm Sambungan Bak', G.STRUKTUR, 'm1', 'basin_area * 0.55', ['basin_area'], { code: '2.2.1.2.2', level: 'PROFESSIONAL' }),
      comp('wp-coating', 'Waterproofing Semen Base Permukaan Bak Dalam', G.ATAP, 'm2', 'basin_area * 1.7', ['basin_area'], { code: '3.4.3', level: 'PROFESSIONAL' }),
      comp('baja', 'Struktur Baja Gedung Pompa (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'pumphouse_area * 26', ['pumphouse_area'], { code: '2.3.1.1', price: 39800, level: 'PROFESSIONAL' }),
      comp('pompa-transfer', 'Pompa Booster 450 lpm Transfer Air Bersih', G.MEKANIKAL, 'unit', 'Math.ceil(capacity_lps / 25)', ['capacity_lps'], { code: '6.1.2.2', level: 'PROFESSIONAL' }),
      comp('pipa', 'Pipa Galvanis MED DN 1-1/4" Interkoneksi Bak', G.SANITASI, 'm1', 'basin_area * 0.4', ['basin_area'], { code: '6.4.2.4', level: 'PROFESSIONAL' }),
      comp('valve', 'Gate Valve 10K + Pressure Gauge per Titik Kontrol', G.SANITASI, 'buah', 'Math.ceil(capacity_lps / 10)', ['capacity_lps'], { code: '6.5.10.2', price: 2894782, level: 'COMPREHENSIVE' }),
      comp('panel', 'Panel Power Pompa & Blower', G.ELEKTRIKAL, 'unit', '2', [], { code: '5.1.2.18', level: 'COMPREHENSIVE' }),
      comp('listrik', 'Lampu TLED Dust Proof Gedung Pompa', G.ELEKTRIKAL, 'unit', 'Math.ceil(pumphouse_area / 24)', ['pumphouse_area'], { code: '5.3.1.13', level: 'PROFESSIONAL' }),
      comp('pagar', 'Pagar BRC Galvanis Keliling IPA', G.LANSKAP, 'm2', '(basin_area + pumphouse_area) * 0.34', ['basin_area', 'pumphouse_area'], { price: 285000, level: 'COMPREHENSIVE', priceNote: 'Referensi pagar BRC + tiang terpasang.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Kedalaman bak proses diasumsikan 3,5–4 m; jumlah pompa transfer proporsional terhadap kapasitas (25 L/det per unit).'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk peralatan proses (mixer, scraper, media filter, dosing), reservoir distribusi, dan jaringan transmisi.']
  }),

  tpl({
    id: 'UTIL-DEEP-WELL',
    name: 'Sumur Bor Dalam + Pompa Submersible + Menara Air',
    category: 'UTILITAS',
    subcategory: 'Sumur Bor Dalam',
    description: 'Sistem air tanah mandiri untuk fasilitas tanpa PDAM andal: sumur bor dalam bercasing, pompa submersible, rumah pompa kecil, dan menara air/rooftank. Termasuk uji pemompaan dasar.',
    badge: 'Air Tanah',
    icon: 'ArrowDownWideNarrow',
    parameters: [
      num('well_depth', 'Kedalaman Sumur Bor', 80, { min: 30, max: 250, unit: 'm', group: 'specifications' }),
      num('num_wells', 'Jumlah Sumur', 1, { min: 1, max: 6, group: 'specifications' }),
      num('tower_capacity', 'Kapasitas Tangki Atas (m³)', 12, { min: 2, max: 50, unit: 'm³', group: 'specifications' })
    ],
    components: [
      comp('bor-dangkal', 'Pengeboran Sumur Bor Air Tanah (Paket per Meter termasuk Casing Awal)', G.KHUSUS, 'm1', 'well_depth * num_wells', ['well_depth', 'num_wells'], { code: 'A.3.08.1a.4', price: 685000, priceNote: 'Item kanonis hanya pengeboran batuan (PARTIAL) — fallback referensi paket bor + casing + gravel pack per meter.' }),
      comp('pompa', 'Pompa Submersible Cutter 100 LPM (Cadangan & Transfer)', G.MEKANIKAL, 'unit', 'num_wells', ['num_wells'], { code: '6.2.2.3', level: 'PROFESSIONAL', priceNote: 'Pompa utama deep-well dikonfirmasi terhadap head & debit desain; unit kanonis ini adalah pompa transfer terukur.' }),
      comp('rumah-pompa', 'Beton Rumah Pompa & Bak Kontrol fc 15 MPa', G.STRUKTUR, 'm3', 'num_wells * 6', ['num_wells'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('tangki', 'Roof Tank Fiberglass kap. 12 m³ (atau Setara Kapasitas)', G.SANITASI, 'unit', 'Math.ceil(tower_capacity / 12)', ['tower_capacity'], { code: '6.1.1.3', level: 'PROFESSIONAL' }),
      comp('menara', 'Struktur Baja Menara Air (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'tower_capacity * 210', ['tower_capacity'], { code: '2.3.1.1', price: 39800, level: 'PROFESSIONAL', priceNote: 'Berat baja menara diasumsikan proporsional terhadap kapasitas tangki (asumsi rekayasa dinyatakan).' }),
      comp('pipa-riser', 'Pipa Galvanis MED DN 1" Riser Sumur–Tangki', G.SANITASI, 'm1', 'num_wells * 42', ['num_wells'], { code: '6.4.2.3', level: 'PROFESSIONAL' }),
      comp('panel', 'Panel Kontrol Pompa & Level Switch', G.ELEKTRIKAL, 'unit', 'num_wells', ['num_wells'], { price: 6850000, level: 'COMPREHENSIVE', priceNote: 'Referensi panel pompa otomatis + WLC terpasang.' }),
      comp('uji', 'Uji Pemompaan & Kualitas Air Dasar (Paket per Sumur)', G.KHUSUS, 'unit', 'num_wells', ['num_wells'], { price: 4500000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi pumping test 24 jam + uji laboratorium parameter dasar.' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Kondisi akuifer diasumsikan produktif pada kedalaman target; hasil eksplorasi geolistrik menentukan kedalaman final.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk survei geolistrik, perizinan SIPA air tanah, water treatment lanjutan, dan jaringan distribusi ke bangunan.']
  }),

  tpl({
    id: 'UTIL-FIRE-HYDRANT',
    name: 'Jaringan Hydrant & Fire Fighting Kawasan',
    category: 'UTILITAS',
    subcategory: 'Hydrant & Pemadam',
    description: 'Sistem proteksi kebakaran aktif kawasan/gedung: pipa hydrant galvanis, rumah pompa hydrant (sipil), pillar hydrant, dan sprinkler gedung dasar. Pompa hydrant utama sebagai komponen terpisah.',
    badge: 'Fire Fighting',
    icon: 'Flame',
    parameters: [
      num('pipe_length', 'Panjang Pipa Hydrant Utama', 600, { min: 100, max: 5000, unit: 'm' }),
      num('num_pillars', 'Jumlah Pillar Hydrant', 6, { min: 1, max: 40, group: 'specifications' }),
      num('building_area', 'Luas Bangunan Terproteksi Sprinkler', 3000, { min: 0, max: 30000, unit: 'm²' })
    ],
    components: [
      comp('galian', 'Galian Tanah Biasa Parit Pipa Hydrant', G.TANAH, 'm3', 'pipe_length * 0.55', ['pipe_length'], { code: '1.2.1.1.2' }),
      comp('urugan', 'Urugan Kembali Parit Pipa', G.TANAH, 'm3', 'pipe_length * 0.45', ['pipe_length'], { code: '1.3.1.1', level: 'PROFESSIONAL' }),
      comp('pipa-4', 'Pipa Galvanis MED DN 1-1/4" (Distribusi Cabang)', G.SANITASI, 'm1', 'pipe_length * 0.4', ['pipe_length'], { code: '6.4.2.4' }),
      comp('pipa-utama', 'Pipa Hydrant Utama Galvanis Dia. Besar (Paket per Meter)', G.SANITASI, 'm1', 'pipe_length * 0.6', ['pipe_length'], { price: 485000, priceNote: 'Referensi pipa galvanis 4–6 inci + fitting + thrust block terpasang.' }),
      comp('pillar', 'Pillar Hydrant 2 Way + Box & Aksesoris', G.KHUSUS, 'unit', 'num_pillars', ['num_pillars'], { price: 8750000, priceNote: 'Referensi pillar hydrant standar SNI terpasang.' }),
      comp('valve', 'Gate Valve 10K + Pressure Gauge Titik Kontrol', G.SANITASI, 'buah', 'num_pillars', ['num_pillars'], { code: '6.5.10.3', price: 3817489, level: 'PROFESSIONAL' }),
      comp('rumah-pompa', 'Beton Rumah Pompa Hydrant fc 15 MPa', G.STRUKTUR, 'm3', '18', [], { code: '2.2.1.4.3', price: 1355000, level: 'PROFESSIONAL' }),
      comp('pompa', 'Pompa Booster 450 lpm (Jockey/Transfer Awal)', G.MEKANIKAL, 'unit', '1', [], { code: '6.1.2.2', level: 'PROFESSIONAL', priceNote: 'Pompa hydrant utama (electric + diesel) dihitung dari kurva sistem oleh perencana proteksi kebakaran.' }),
      comp('sprinkler', 'Sprinkler Head Pendant Gedung Terproteksi', G.MEKANIKAL, 'unit', 'building_area / 11', ['building_area'], { code: '5.6.2.1', condition: 'building_area > 0', level: 'PROFESSIONAL' }),
      comp('alarm', 'Terminal Box Fire Alarm Lengkap Modul per Zona', G.ELEKTRIKAL, 'unit', 'Math.ceil(building_area / 900)', ['building_area'], { code: '5.4.1.6', level: 'COMPREHENSIVE', condition: 'building_area > 0' }),
      comp('apar', 'Fire Extinguisher 6 kg Titik Strategis', G.MEKANIKAL, 'unit', 'num_pillars * 2', ['num_pillars'], { code: '5.6.3.4', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Tekanan & debit desain mengikuti NFPA/SNI proteksi kebakaran; template adalah estimasi lingkup awal.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk reservoir air kebakaran khusus, pompa diesel hydrant utama, panel kontrol alamat penuh, dan sertifikasi damkar.']
  }),

  tpl({
    id: 'UTIL-STP-BUILDING',
    name: 'STP / IPAL Gedung Komersial (Biofilter Terpadu)',
    category: 'UTILITAS',
    subcategory: 'IPAL Gedung',
    description: 'Sewage treatment plant gedung (hotel, RS, mal): bak ekualisasi & biofilter beton kedap air, blower room, dan jaringan pipa air limbah tanah. Peralatan proses (media, blower, disinfeksi) sebagai paket terpisah.',
    badge: 'STP/IPAL',
    icon: 'Recycle',
    parameters: [
      num('capacity_m3d', 'Kapasitas Olah (m³/hari)', 60, { min: 10, max: 500, unit: 'm³/hari', group: 'specifications' }),
      num('tank_area', 'Luas Total Bak STP', 85, { min: 20, max: 600, unit: 'm²' }),
      num('pipe_length', 'Panjang Pipa Air Limbah Pengumpul', 240, { min: 50, max: 2000, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Area STP', G.PERSIAPAN, 'm2', 'tank_area * 1.4', ['tank_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Berbatu Bak STP', G.TANAH, 'm3', 'tank_area * 2.8', ['tank_area'], { code: '1.2.3.1.1' }),
      comp('beton-kedap', 'Beton Kedap Air Bak Ekualisasi & Biofilter', G.STRUKTUR, 'm3', 'tank_area * 0.92', ['tank_area'], { code: '2.2.1.5.11', price: 1565000 }),
      comp('besi', 'Penulangan Bak BjTP ≥ 12 mm', G.STRUKTUR, 'kg', 'tank_area * 36', ['tank_area'], { code: '2.2.1.1.4' }),
      comp('waterstop', 'PVC Waterstop lebar 150 mm Sambungan Bak', G.STRUKTUR, 'm1', 'tank_area * 0.6', ['tank_area'], { code: '2.2.1.2.1', level: 'PROFESSIONAL' }),
      comp('wp', 'Waterproofing Semen Base Bak Dalam', G.ATAP, 'm2', 'tank_area * 1.8', ['tank_area'], { code: '3.4.3', level: 'PROFESSIONAL' }),
      comp('gtrap', 'Grease Trap Portable Fiberglass 30 L (Pra-Treatment Dapur)', G.SANITASI, 'unit', 'Math.ceil(capacity_m3d / 30)', ['capacity_m3d'], { code: '6.2.3.1', level: 'PROFESSIONAL' }),
      comp('pipa', 'Pipa Air Limbah Tanah DN 6" Pengumpul', G.DRAINASE, 'm1', 'pipe_length', ['pipe_length'], { code: '6.4.5.1' }),
      comp('pipa8', 'Pipa Air Limbah Tanah DN 8" Kolektor Utama', G.DRAINASE, 'm1', 'pipe_length * 0.3', ['pipe_length'], { code: '6.4.5.2', level: 'PROFESSIONAL' }),
      comp('pompa-lift', 'Pompa Submersible Cutter 75 LPM Lift Station', G.MEKANIKAL, 'unit', '2', [], { code: '6.2.2.2', level: 'PROFESSIONAL' }),
      comp('paket-proses', 'Paket Proses STP (Media Biofilter, Blower, Disinfeksi UV/Klor)', G.KHUSUS, 'unit', '1', [], { price: 285000000, level: 'COMPREHENSIVE', priceNote: 'Referensi paket proses STP extended aeration untuk kapasitas dasar 60 m³/hari; skala harga diverifikasi vendor untuk kapasitas lain.' }),
      comp('sumur-resap', 'Sumur Resapan Air Limbah Olahan dia. 80 cm + Tutup', G.DRAINASE, 'unit', 'Math.ceil(capacity_m3d / 25)', ['capacity_m3d'], { code: '6.2.4.1', price: 973078, level: 'COMPREHENSIVE' }),
      comp('panel', 'Panel Power STP & Blower', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.2.18', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_INFRA, 'Baku mutu efluen mengikuti Permen LHK untuk kegiatan sejenis; paket proses adalah estimasi vendor awal untuk kapasitas dasar.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk perizinan pembuangan (IPLC), uji laboratorium berkala, lumpur & pengurasan berkala, dan jaringan limbah dari fixture dalam gedung.']
  }),

  tpl({
    id: 'UTIL-RAINWATER',
    name: 'Panen Air Hujan & Sumur Resapan Kawasan',
    category: 'UTILITAS',
    subcategory: 'Konservasi Air',
    description: 'Sistem pemanenan air hujan gedung/kawasan: talang & pipa downspout besar, tangki penampung, sumur resapan hujan terdistribusi, dan pompa transfer untuk siram taman & flushing.',
    badge: 'Rain Harvesting',
    icon: 'CloudRain',
    parameters: [
      num('roof_area', 'Luas Atap Penangkap Hujan', 1200, { min: 200, max: 10000, unit: 'm²' }),
      num('num_wells', 'Jumlah Sumur Resapan', 6, { min: 1, max: 40, group: 'specifications' }),
      num('tank_capacity', 'Kapasitas Tangki Panen (m³)', 24, { min: 4, max: 200, unit: 'm³', group: 'specifications' })
    ],
    components: [
      comp('talang', 'Talang & Downspout Atap (Pipa PVC DN 2-1/2" setara jalur tegak)', G.ATAP, 'm', 'roof_area * 0.14', ['roof_area'], { code: '9.1.1.1', priceNote: 'Item kanonis pipa PVC dipakai sebagai padanan jalur penangkap hujan atap.' }),
      comp('pipa-kumpul', 'Pipa Pengumpul Air Hujan PVC ke Tangki (Jalur Mendatar)', G.DRAINASE, 'm', 'roof_area * 0.1', ['roof_area'], { code: '9.1.1.1', level: 'PROFESSIONAL', priceNote: 'Padanan item kanonis pipa PVC DN 2-1/2".' }),
      comp('tangki', 'Roof Tank Fiberglass kap. 12 m³ Penampung Panen', G.SANITASI, 'unit', 'Math.ceil(tank_capacity / 12)', ['tank_capacity'], { code: '6.1.1.3', level: 'PROFESSIONAL' }),
      comp('sumur', 'Sumur Resapan Air Hujan dia. 80 cm t=100 cm + Tutup Beton', G.DRAINASE, 'buah', 'num_wells', ['num_wells'], { code: '6.6.1.1', price: 1125000, priceNote: 'Komposisi resolver PARTIAL — fallback referensi sumur resapan terpasang.' }),
      comp('pompa', 'Pompa Jet 100 lpm Transfer ke Pemakaian Non-Potable', G.MEKANIKAL, 'unit', '1', [], { code: '6.1.2.6', level: 'PROFESSIONAL' }),
      comp('filter', 'Paket Filter Awal (First Flush Diverter + Saringan Daun)', G.KHUSUS, 'unit', 'Math.ceil(roof_area / 400)', ['roof_area'], { price: 3850000, level: 'COMPREHENSIVE', priceNote: 'Referensi paket first-flush & leaf screen terpasang.' }),
      comp('pipa-distribusi', 'Pipa PPR PN10 DN 3/4" Distribusi Siram/Flushing', G.SANITASI, 'm1', 'roof_area * 0.12', ['roof_area'], { code: '6.4.3.2', level: 'COMPREHENSIVE' }),
      comp('pelimpah', 'Saluran Pelimpah ke Drainase Kota (U-Ditch 30x30 Sebagian)', G.DRAINASE, 'm1', 'roof_area * 0.05', ['roof_area'], { code: '8.1.1.1', price: 465000, level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_INFRA, 'Curah hujan desain & koefisien limpasan mengikuti data BMKG setempat; tangki dihitung untuk pemakaian non-potable.'],
    exclusions: [...EKSKLUSI_INFRA, 'Tidak termasuk treatment air minum, perizinan sumur resapan massal, dan jaringan flushing dalam gedung.']
  })
];
