/**
 * Katalog 180 — Sektor bangunan komersial: GEDUNG (+5), BANGUNAN_TINGGI (+4), HOTEL (+4).
 * Kode komponen diverifikasi terhadap katalog AHSP 2026 kanonis saat authoring;
 * komponen tanpa kode adalah harga referensi pasar 2026 (bukan harga resmi).
 */
import { RabTemplate } from '../../types/rabTemplate';
import { G, num, comp, tpl, ASUMSI_BANGUNAN, EKSKLUSI_BANGUNAN } from './builders';

export const BUILDING_TEMPLATES_A: RabTemplate[] = [
  // =======================================================================
  // GEDUNG
  // =======================================================================
  tpl({
    id: 'BLD-BANK-BRANCH',
    name: 'Gedung Kantor Cabang Bank 3 Lantai',
    category: 'GEDUNG',
    subcategory: 'Kantor Cabang Bank',
    description: 'Gedung cabang bank 3 lantai: banking hall, ruang brankas (vault) berdinding beton tebal, ruang server, dan fasad ACP + kaca. Struktur beton bertulang dengan pengamanan perbankan.',
    badge: 'Perbankan',
    icon: 'Landmark',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 400, { min: 150, max: 1500, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 3, { min: 1, max: 8 }),
      num('vault_area', 'Luas Ruang Brankas (Vault)', 24, { min: 9, max: 80, unit: 'm²' }),
      num('num_tellers', 'Jumlah Loket Teller', 6, { min: 2, max: 20, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan Kerja', G.PERSIAPAN, 'm2', 'floor_area * 1.3', ['floor_area'], { code: 'C.37' }),
      comp('pagar', 'Pagar Proyek Seng Gelombang Rangka Baja t=1,8 m', G.PERSIAPAN, 'm1', 'Math.sqrt(floor_area) * 4 * 1.3', ['floor_area'], { code: '1.1.1.4', level: 'PROFESSIONAL' }),
      comp('galian', 'Galian Tanah Pondasi (200–2.000 m³, Manual)', G.TANAH, 'm3', 'floor_area * 0.5', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('urugan', 'Urugan Kembali & Pemadatan Stamper', G.TANAH, 'm3', 'floor_area * 0.18', ['floor_area'], { code: '1.3.3.1', level: 'PROFESSIONAL' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S (Semi Mekanis)', G.PONDASI, 'm3', 'floor_area * 0.32', ['floor_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Kolom, Balok, Plat)', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.16', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000, priceNote: 'Komposisi resolver PARTIAL — fallback referensi ready-mix fc 15 terpasang.' }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm (Semi Mekanis)', G.STRUKTUR, 'kg', 'floor_area * num_floors * 14', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('bekplat', 'Bekisting Plat Lantai (3x Pakai)', G.STRUKTUR, 'm2', 'floor_area * num_floors * 0.92', ['floor_area', 'num_floors'], { code: '2.2.1.3.5', level: 'PROFESSIONAL' }),
      comp('vault', 'Dinding Vault Beton Bertulang K-350 t=30 cm + Pintu Baja Brankas', G.KHUSUS, 'm2', 'vault_area * 3.4', ['vault_area'], { price: 3850000, level: 'COMPREHENSIVE', priceNote: 'Paket referensi dinding vault + pintu baja brankas terpasang.' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm Mortar Siap Pakai', G.DINDING, 'm2', 'floor_area * num_floors * 1.55', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'floor_area * num_floors * 3.1', ['floor_area', 'num_floors'], { code: '3.7.4', price: 68500 }),
      comp('aci', 'Acian Dinding', G.DINDING, 'm2', 'floor_area * num_floors * 3.1', ['floor_area', 'num_floors'], { code: '3.7.8', level: 'PROFESSIONAL' }),
      comp('lantai', 'Lantai Granit Tile 60x60 (Banking Hall & Kantor)', G.LANTAI, 'm2', 'floor_area * num_floors * 0.9', ['floor_area', 'num_floors'], { code: '3.9.5.3' }),
      comp('plafon', 'Plafon Gypsum 9 mm + Rangka Hollow 40.40', G.ATAP, 'm2', 'floor_area * num_floors * 0.92', ['floor_area', 'num_floors'], { code: '3.5.2.1', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru (Dasar + 2 Penutup)', G.FINISHING, 'm2', 'floor_area * num_floors * 2.6', ['floor_area', 'num_floors'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('kaca', 'Kaca Tempered 12 mm Fasad & Partisi Brankas Area Publik', G.KUSEN, 'm2', 'floor_area * 0.55', ['floor_area'], { code: '3.12.13', level: 'COMPREHENSIVE' }),
      comp('counter', 'Counter Teller & Backwall Kayu Lapis Formika', G.FINISHING, 'unit', 'num_tellers', ['num_tellers'], { price: 12750000, level: 'COMPREHENSIVE', priceNote: 'Referensi paket counter teller per loket termasuk top table.' }),
      comp('listrik', 'Instalasi Titik Lampu & Stop Kontak Kantor', G.ELEKTRIKAL, 'titik', 'Math.ceil(floor_area * num_floors / 9)', ['floor_area', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('genset', 'Genset Silent 75 kVA + Panel Sinkronisasi Dasar', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.3.1', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Ruang brankas diasumsikan di lantai dasar dengan dinding beton t=30 cm keliling.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk mesin ATM, sistem antrian, CCTV & alarm perbankan (paket vendor), dan interior brankas (safe deposit box).']
  }),

  tpl({
    id: 'BLD-SHOWROOM-AUTO',
    name: 'Showroom Mobil & Bengkel Resmi 2 Lantai',
    category: 'GEDUNG',
    subcategory: 'Showroom Otomotif',
    description: 'Showroom kendaraan lantai granit polished area display, mezzanine kantor, dan area bengkel servis dengan lantai floor hardener + epoxy. Fasad full kaca tempered.',
    badge: 'Otomotif',
    icon: 'Car',
    parameters: [
      num('display_area', 'Luas Area Display Showroom', 600, { min: 200, max: 2500, unit: 'm²' }),
      num('workshop_area', 'Luas Area Bengkel Servis', 450, { min: 150, max: 2000, unit: 'm²' }),
      num('num_stalls', 'Jumlah Stall Servis / Lift Bay', 6, { min: 2, max: 24, group: 'specifications' }),
      num('facade_width', 'Lebar Fasad Kaca Depan', 30, { min: 10, max: 120, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', '(display_area + workshop_area) * 1.25', ['display_area', 'workshop_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', '(display_area + workshop_area) * 0.42', ['display_area', 'workshop_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Manual', G.PONDASI, 'm3', '(display_area + workshop_area) * 0.3', ['display_area', 'workshop_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', '(display_area + workshop_area) * 0.15', ['display_area', 'workshop_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm Manual', G.STRUKTUR, 'kg', '(display_area + workshop_area) * 11', ['display_area', 'workshop_area'], { code: '2.2.1.1.3' }),
      comp('baja', 'Struktur Baja Profil Area Display Bentang Lebar (Pabrikasi & Ereksi)', G.STRUKTUR, 'kg', 'display_area * 32', ['display_area'], { code: '2.3.1.1', price: 39800, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi baja WF fabrikasi terpasang.' }),
      comp('lantai-display', 'Lantai Granit 60x60 Polished Area Display', G.LANTAI, 'm2', 'display_area * 0.95', ['display_area'], { code: '3.9.5.3' }),
      comp('lantai-bengkel', 'Floor Hardener Lantai Bengkel', G.LANTAI, 'm2', 'workshop_area * 0.95', ['workshop_area'], { code: '3.9.9.9' }),
      comp('epoxy', 'Cat Epoxy Lantai Area Stall Servis 2 Lapis', G.LANTAI, 'm2', 'num_stalls * 30', ['num_stalls'], { price: 168000, level: 'COMPREHENSIVE', priceNote: 'Referensi epoxy floor coating 2 lapis termasuk persiapan permukaan.' }),
      comp('fasad', 'Kaca Tempered 12 mm Fasad Showroom', G.KUSEN, 'm2', 'facade_width * 5.5', ['facade_width'], { code: '3.12.13' }),
      comp('rolling', 'Rolling Door Besi Akses Bengkel', G.KUSEN, 'm2', 'num_stalls * 12', ['num_stalls'], { code: '3.11.1.1', level: 'PROFESSIONAL' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', '(display_area + workshop_area) * 0.85', ['display_area', 'workshop_area'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', '(display_area + workshop_area) * 1.7', ['display_area', 'workshop_area'], { code: '3.7.4', price: 68500 }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', '(display_area + workshop_area) * 1.5', ['display_area', 'workshop_area'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('lift-bay', 'Pondasi & Dudukan Car Lift 2-Post per Stall', G.KHUSUS, 'unit', 'num_stalls', ['num_stalls'], { price: 4850000, level: 'COMPREHENSIVE', optional: true, priceNote: 'Referensi pekerjaan sipil dudukan lift; unit lift oleh vendor.' }),
      comp('listrik', 'Instalasi Titik Lampu Highbay & Umum', G.ELEKTRIKAL, 'titik', 'Math.ceil((display_area + workshop_area) / 12)', ['display_area', 'workshop_area'], { code: '5.3.1.1', level: 'PROFESSIONAL' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Tinggi area display diasumsikan 6 m (double height) dengan struktur baja bentang lebar.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk peralatan bengkel (lift, kompresor, diagnostic tools), signage/logo dealer, dan perizinan operasional bengkel.']
  }),

  tpl({
    id: 'BLD-COWORKING',
    name: 'Gedung Co-Working Space & Kantor Sewa 4 Lantai',
    category: 'GEDUNG',
    subcategory: 'Co-Working Space',
    description: 'Gedung kantor sewa fleksibel 4 lantai: open workspace, private office, meeting room partisi kaca, dan area komunal. Finishing industrial-modern dengan plafon ekspos sebagian.',
    badge: 'Kantor Sewa',
    icon: 'Briefcase',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 500, { min: 200, max: 1600, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 4, { min: 2, max: 12 }),
      num('num_meeting', 'Jumlah Meeting Room', 6, { min: 1, max: 30, group: 'specifications' }),
      num('num_desks', 'Kapasitas Meja Kerja (Hot Desk)', 120, { min: 20, max: 600, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.25', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.48', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'floor_area * 0.3', ['floor_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.15', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 13', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm (Shell)', G.DINDING, 'm2', 'floor_area * num_floors * 1.1', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('partisi', 'Dinding Partisi Gypsumboard t=12 mm (Private Office)', G.DINDING, 'm2', 'floor_area * num_floors * 0.55', ['floor_area', 'num_floors'], { code: '3.6.6.1', price: 385000, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi partisi gypsum double rangka terpasang.' }),
      comp('partisi-kaca', 'Partisi Kaca Meeting Room Rangka Aluminium', G.DINDING, 'm2', 'num_meeting * 14', ['num_meeting'], { code: '3.11.1.5', level: 'PROFESSIONAL' }),
      comp('karpet', 'Lantai Karpet Tile Area Kerja + Underlayer', G.LANTAI, 'm2', 'floor_area * num_floors * 0.78', ['floor_area', 'num_floors'], { code: '3.9.9.2', level: 'PROFESSIONAL' }),
      comp('lantai-komunal', 'Lantai Keramik Artistik Area Komunal & Pantry', G.LANTAI, 'm2', 'floor_area * num_floors * 0.18', ['floor_area', 'num_floors'], { code: '3.9.7.4' }),
      comp('plafon', 'Rangka Plafon Hollow 40.40 Modul 60x60 (Area Kantor)', G.ATAP, 'm2', 'floor_area * num_floors * 0.6', ['floor_area', 'num_floors'], { code: '3.5.3.1', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'floor_area * num_floors * 2.1', ['floor_area', 'num_floors'], { code: '3.8.10.1' }),
      comp('data', 'Kabel UTP CAT 6 + Conduit ke Meja Kerja', G.ELEKTRIKAL, 'm1', 'num_desks * 9', ['num_desks'], { code: '5.1.1.10.1', level: 'COMPREHENSIVE' }),
      comp('wifi', 'Wireless Access Point Outdoor/Area Komunal', G.ELEKTRIKAL, 'unit', 'num_floors * 2', ['num_floors'], { code: '5.4.5.20', level: 'COMPREHENSIVE', optional: true }),
      comp('listrik', 'Instalasi Titik Lampu', G.ELEKTRIKAL, 'titik', 'Math.ceil(floor_area * num_floors / 8)', ['floor_area', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('ac', 'AC Wall Mounted 5.000 BTUH (Ruang Meeting)', G.MEKANIKAL, 'unit', 'num_meeting * 2', ['num_meeting'], { code: '5.5.1.1', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Layout diasumsikan 60% open workspace, 25% private office, 15% komunal & sirkulasi.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk furniture meja/kursi, sistem akses kontrol & booking ruangan, dan peralatan IT (server, switch core).']
  }),

  tpl({
    id: 'BLD-DORMITORY',
    name: 'Asrama Mahasiswa / Karyawan 4 Lantai',
    category: 'GEDUNG',
    subcategory: 'Asrama',
    description: 'Gedung asrama 4 lantai dengan kamar tidur berpenghuni 2–4 orang, kamar mandi komunal terjadwal, ruang belajar bersama, dan dapur komunal. Finishing ekonomis tahan pakai.',
    badge: 'Asrama',
    icon: 'BedDouble',
    parameters: [
      num('num_rooms', 'Jumlah Kamar Tidur', 48, { min: 12, max: 240, group: 'specifications' }),
      num('room_area', 'Luas per Kamar', 16, { min: 9, max: 30, unit: 'm²', group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 4, { min: 2, max: 8 }),
      num('num_bathrooms', 'Jumlah Kamar Mandi Komunal', 16, { min: 4, max: 80, group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'num_rooms * room_area * 0.45', ['num_rooms', 'room_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'num_rooms * room_area * 0.28', ['num_rooms', 'room_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'num_rooms * room_area * 0.2', ['num_rooms', 'room_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'num_rooms * room_area * 0.13', ['num_rooms', 'room_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'num_rooms * room_area * 9.5', ['num_rooms', 'room_area'], { code: '2.2.1.1.3' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'num_rooms * room_area * 1.85', ['num_rooms', 'room_area'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'num_rooms * room_area * 3.7', ['num_rooms', 'room_area'], { code: '3.7.4', price: 68500 }),
      comp('aci', 'Acian Dinding', G.DINDING, 'm2', 'num_rooms * room_area * 3.7', ['num_rooms', 'room_area'], { code: '3.7.8', level: 'PROFESSIONAL' }),
      comp('lantai', 'Lantai Ubin PC 60x60 Kamar & Koridor', G.LANTAI, 'm2', 'num_rooms * room_area * 1.12', ['num_rooms', 'room_area'], { code: '3.9.1.4' }),
      comp('keramik-km', 'Dinding Keramik 20x20 Kamar Mandi Komunal', G.DINDING, 'm2', 'num_bathrooms * 9', ['num_bathrooms'], { code: '3.10.1.4', level: 'PROFESSIONAL' }),
      comp('kloset', 'Kloset Jongkok + Kran & Floor Drain per KM', G.SANITASI, 'unit', 'num_bathrooms', ['num_bathrooms'], { price: 1475000, priceNote: 'Referensi paket kloset jongkok keramik + aksesoris terpasang.' }),
      comp('fdrain', 'Floor Drain Stainless Steel', G.SANITASI, 'buah', 'num_bathrooms', ['num_bathrooms'], { code: '3.18.6.1', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'num_rooms * room_area * 3.1', ['num_rooms', 'room_area'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu per Kamar & Koridor', G.ELEKTRIKAL, 'titik', 'num_rooms * 2 + num_floors * 8', ['num_rooms', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('toren', 'Roof Tank Stainless kap. 2 m³ + Pompa Jet 100 lpm', G.SANITASI, 'unit', 'Math.ceil(num_rooms / 24)', ['num_rooms'], { code: '6.1.1.4', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Kamar mandi komunal diasumsikan 1 unit per 3 kamar; dapur komunal 1 per lantai.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk furniture kamar (ranjang, lemari, meja belajar), laundry komersial, dan sistem absensi penghuni.']
  }),

  tpl({
    id: 'BLD-MARKET-MODERN',
    name: 'Pasar Modern / Trade Center 2 Lantai',
    category: 'GEDUNG',
    subcategory: 'Pasar Modern',
    description: 'Pasar modern 2 lantai dengan los basah (lantai keramik anti selip + drainase terbuka), kios kering, area food court, dan loading dock. Struktur beton dengan atap baja bentang lebar.',
    badge: 'Pasar Modern',
    icon: 'Store',
    parameters: [
      num('floor_area', 'Luas Lantai per Lantai', 1800, { min: 500, max: 6000, unit: 'm²' }),
      num('num_stalls', 'Jumlah Los & Kios', 120, { min: 30, max: 600, group: 'specifications' }),
      num('wet_area', 'Luas Zona Basah (Ikan/Daging)', 500, { min: 100, max: 2500, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai', 2, { min: 1, max: 4 })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.35', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'floor_area * 0.4', ['floor_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Semi Mekanis', G.PONDASI, 'm3', 'floor_area * 0.28', ['floor_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.14', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'floor_area * num_floors * 12', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('baja-atap', 'Rangka Atap Baja Ringan Pelana C75 (Bentang Los)', G.ATAP, 'm2', 'floor_area * 1.12', ['floor_area'], { code: '2.1.1.1', level: 'PROFESSIONAL' }),
      comp('lantai-basah', 'Lantai Keramik Artistik Anti Selip Zona Basah', G.LANTAI, 'm2', 'wet_area', ['wet_area'], { code: '3.9.7.3' }),
      comp('lantai-kering', 'Lantai Ubin PC 40x40 Zona Kering & Sirkulasi', G.LANTAI, 'm2', 'floor_area * num_floors * 0.72', ['floor_area', 'num_floors'], { code: '3.9.1.3' }),
      comp('meja-los', 'Meja Los Beton Finishing Keramik per Unit Los Basah', G.KHUSUS, 'unit', 'num_stalls * 0.4', ['num_stalls'], { price: 2350000, level: 'PROFESSIONAL', priceNote: 'Referensi meja los beton + keramik + saluran air per unit.' }),
      comp('drain', 'Pipa Air Limbah Tanah DN 6" Zona Basah & IPAL Sederhana', G.DRAINASE, 'm1', 'wet_area * 0.55', ['wet_area'], { code: '6.4.5.1', level: 'PROFESSIONAL' }),
      comp('gtrap', 'Grease Trap Central Fiberglass kap. 5 m³ (Food Court)', G.SANITASI, 'unit', '1', [], { code: '6.2.3.3', level: 'COMPREHENSIVE' }),
      comp('rolling', 'Rolling Door Aluminium Kios', G.KUSEN, 'm2', 'num_stalls * 3.6', ['num_stalls'], { code: '3.11.1.2', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Eksterior Tembok Baru', G.FINISHING, 'm2', 'floor_area * 1.1', ['floor_area'], { code: '3.8.10.2', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Area Los', G.ELEKTRIKAL, 'titik', 'Math.ceil(floor_area * num_floors / 14)', ['floor_area', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('sump', 'Pompa Submersible Cutter 100 LPM Sump Pit Pasar', G.SANITASI, 'unit', '2', [], { code: '6.2.2.3', level: 'COMPREHENSIVE', optional: true })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Zona basah diasumsikan di lantai dasar dengan kemiringan lantai ke saluran terbuka; IPAL komunal sederhana termasuk grease trap.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk cold storage, timbangan & peralatan pedagang, TPS terpadu, dan perizinan pengelolaan pasar.']
  }),

  // =======================================================================
  // BANGUNAN TINGGI
  // =======================================================================
  tpl({
    id: 'BLD-HIGHRISE-OFFICE-A',
    name: 'Menara Kantor Grade A 25 Lantai + Basement',
    category: 'BANGUNAN_TINGGI',
    subcategory: 'Menara Kantor',
    description: 'Menara kantor premium dengan core wall beton, fasad curtain wall kaca laminated, lantai marmer lobby, dan sistem MEP gedung tinggi (MDP, busduct, genset sinkron). Lingkup sipil-arsitektural-MEP dasar per lantai tipikal.',
    badge: 'Grade A',
    icon: 'Building2',
    parameters: [
      num('floor_area', 'Luas Lantai Tipikal', 1100, { min: 500, max: 2500, unit: 'm²' }),
      num('num_floors', 'Jumlah Lantai di Atas Tanah', 25, { min: 10, max: 60 }),
      num('basement_floors', 'Jumlah Lantai Basement', 2, { min: 0, max: 5, group: 'specifications' }),
      num('facade_area', 'Luas Fasad Curtain Wall', 9500, { min: 2000, max: 30000, unit: 'm²', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'floor_area * 1.2', ['floor_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Keras Basement (Semi Mekanis setara)', G.TANAH, 'm3', 'floor_area * basement_floors * 3.1', ['floor_area', 'basement_floors'], { code: '1.2.4.1.1', condition: 'basement_floors > 0' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Core, Kolom, Balok, Plat)', G.STRUKTUR, 'm3', 'floor_area * num_floors * 0.21', ['floor_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm Semi Mekanis', G.STRUKTUR, 'kg', 'floor_area * num_floors * 19', ['floor_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('bekplat', 'Bekisting Plat Lantai (3x Pakai)', G.STRUKTUR, 'm2', 'floor_area * num_floors * 0.94', ['floor_area', 'num_floors'], { code: '2.2.1.3.5', level: 'PROFESSIONAL' }),
      comp('curing', 'Perawatan Beton (Penggenangan Air 4 Hari)', G.STRUKTUR, 'm2', 'floor_area * num_floors', ['floor_area', 'num_floors'], { code: '2.2.1.9.1', level: 'COMPREHENSIVE' }),
      comp('fasad', 'Kaca Laminated 16 mm + Frame Aluminium Curtain Wall', G.KUSEN, 'm2', 'facade_area', ['facade_area'], { code: '3.12.12' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm (Shaft & Toilet Core)', G.DINDING, 'm2', 'floor_area * num_floors * 0.38', ['floor_area', 'num_floors'], { code: '3.6.4.2' }),
      comp('marmer', 'Lantai Marmer 100x100 Lobby & Lift Hall', G.LANTAI, 'm2', 'floor_area * num_floors * 0.12', ['floor_area', 'num_floors'], { code: '3.9.9.1', level: 'PROFESSIONAL' }),
      comp('lantai-kerja', 'Lantai Ubin Granit 60x60 Area Kerja Tenant', G.LANTAI, 'm2', 'floor_area * num_floors * 0.8', ['floor_area', 'num_floors'], { code: '3.9.5.3', level: 'PROFESSIONAL' }),
      comp('plafon-akustik', 'Plafon Akustik 60x120 Profil Aluminium Lantai Kantor', G.ATAP, 'm2', 'floor_area * num_floors * 0.85', ['floor_area', 'num_floors'], { code: '3.5.1.4', level: 'COMPREHENSIVE' }),
      comp('mdp', 'Main Distribution Panel (MDP) Floor Standing', G.ELEKTRIKAL, 'unit', 'Math.ceil(num_floors / 8)', ['num_floors'], { code: '5.1.2.3', level: 'PROFESSIONAL' }),
      comp('busduct', 'Busduct 1.000A Riser Elektrikal', G.ELEKTRIKAL, 'm1', 'num_floors * 3.4', ['num_floors'], { price: 3105487, level: 'COMPREHENSIVE', priceNote: 'Referensi dari item kanonis 5.1.9.1 (satuan kanonis tidak standar sehingga tidak lolos unit-gate; harga diperlakukan referensi).' }),
      comp('genset', 'Genset Silent 400 kVA (Backup Esensial)', G.ELEKTRIKAL, 'unit', '1', [], { code: '5.1.3.3', level: 'COMPREHENSIVE', optional: true }),
      comp('petir', 'Penangkal Petir Konvensional + Grounding', G.ELEKTRIKAL, 'buah', '2', [], { code: 'SMKK.0173', level: 'COMPREHENSIVE' }),
      comp('sprinkler', 'Sprinkler Head Pendant per Lantai Tipikal', G.MEKANIKAL, 'unit', 'floor_area * num_floors / 12', ['floor_area', 'num_floors'], { code: '5.6.2.1', level: 'PROFESSIONAL' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Pondasi dalam (bored pile/raft) tidak termasuk — gunakan template kategori Pondasi & Geoteknik untuk lingkup sub-struktur.', 'Lantai tenant diserahkan kondisi semi-finished (lantai & plafon dasar).'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk lift & eskalator (paket vendor), BMS, pekerjaan pondasi dalam, dan fit-out interior tenant.']
  }),

  tpl({
    id: 'BLD-CONDOTEL',
    name: 'Kondotel / Apartemen Hotel 18 Lantai',
    category: 'BANGUNAN_TINGGI',
    subcategory: 'Kondotel',
    description: 'Menara kondotel 18 lantai dengan unit studio & 1BR fully furnished standar hotel, koridor berkarpet, dan fasilitas podium (lobby, resto, kolam). Finishing setara hotel bintang 4.',
    badge: 'Kondotel',
    icon: 'Building',
    parameters: [
      num('num_units', 'Jumlah Unit Kondotel', 180, { min: 40, max: 600, group: 'specifications' }),
      num('unit_area', 'Luas Rata-rata per Unit', 38, { min: 24, max: 90, unit: 'm²', group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 18, { min: 8, max: 40 }),
      num('corridor_area', 'Luas Koridor & Area Umum per Lantai', 160, { min: 60, max: 400, unit: 'm²' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'num_units * unit_area * 0.16', ['num_units', 'unit_area'], { code: 'C.37' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'num_units * unit_area * 0.19', ['num_units', 'unit_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'num_units * unit_area * 17', ['num_units', 'unit_area'], { code: '2.2.1.1.4' }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm Antar Unit', G.DINDING, 'm2', 'num_units * unit_area * 1.35', ['num_units', 'unit_area'], { code: '3.6.4.2' }),
      comp('dinding-20', 'Dinding Bata Ringan t=20 cm Dinding Api Koridor', G.DINDING, 'm2', 'corridor_area * num_floors * 0.8', ['corridor_area', 'num_floors'], { code: '3.6.4.3', level: 'PROFESSIONAL' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'num_units * unit_area * 2.7', ['num_units', 'unit_area'], { code: '3.7.4', price: 68500 }),
      comp('aci', 'Acian Dinding Unit', G.DINDING, 'm2', 'num_units * unit_area * 2.7', ['num_units', 'unit_area'], { code: '3.7.8', level: 'PROFESSIONAL' }),
      comp('lantai-unit', 'Lantai Ubin Granit 60x60 Unit Hunian', G.LANTAI, 'm2', 'num_units * unit_area * 0.92', ['num_units', 'unit_area'], { code: '3.9.5.3' }),
      comp('karpet-koridor', 'Karpet Tile Koridor + Underlayer', G.LANTAI, 'm2', 'corridor_area * num_floors', ['corridor_area', 'num_floors'], { code: '3.9.9.2', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru Unit', G.FINISHING, 'm2', 'num_units * unit_area * 2.3', ['num_units', 'unit_area'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('sanitair', 'Paket Sanitair Unit (Kloset Duduk, Wastafel, Shower)', G.SANITASI, 'unit', 'num_units', ['num_units'], { price: 6850000, priceNote: 'Referensi paket sanitair standar hotel bintang 4 terpasang.' }),
      comp('shower', 'Shower Set Stainless per Unit', G.SANITASI, 'buah', 'num_units', ['num_units'], { code: '3.18.6.9', level: 'COMPREHENSIVE' }),
      comp('ac', 'AC Wall Mounted 5.000 BTUH per Unit (2 titik/unit)', G.MEKANIKAL, 'unit', 'num_units * 2', ['num_units'], { code: '5.5.1.1', level: 'COMPREHENSIVE', optional: true }),
      comp('listrik', 'Instalasi Titik Lampu Unit & Koridor', G.ELEKTRIKAL, 'titik', 'num_units * 7 + num_floors * 10', ['num_units', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' }),
      comp('apar', 'Fire Extinguisher 6 kg per Lantai', G.MEKANIKAL, 'unit', 'num_floors * 2', ['num_floors'], { code: '5.6.3.4', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Unit diasumsikan 1 kamar mandi per unit; dapur kecil (pantry) tanpa kompor gas.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk furniture & peralatan elektronik unit, lift, kolam renang podium (template terpisah), dan sistem manajemen hotel.']
  }),

  tpl({
    id: 'BLD-RUSUN',
    name: 'Rumah Susun Sederhana (Rusunawa) 5 Lantai',
    category: 'BANGUNAN_TINGGI',
    subcategory: 'Rumah Susun',
    description: 'Blok rusunawa 5 lantai tipe unit 36 dengan koridor terbuka (single loaded), tangga beton, dan finishing ekonomis sesuai standar perumahan rakyat. Struktur beton bertulang pracetak sebagian.',
    badge: 'Rusunawa',
    icon: 'Building',
    parameters: [
      num('num_units', 'Jumlah Unit Hunian', 60, { min: 20, max: 200, group: 'specifications' }),
      num('unit_area', 'Luas per Unit (Tipe 36)', 36, { min: 24, max: 45, unit: 'm²', group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 5, { min: 3, max: 8 }),
      num('corridor_length', 'Panjang Koridor per Lantai', 55, { min: 25, max: 120, unit: 'm' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'num_units * unit_area * 0.35', ['num_units', 'unit_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'num_units * unit_area * 0.24', ['num_units', 'unit_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S', G.PONDASI, 'm3', 'num_units * unit_area * 0.17', ['num_units', 'unit_area'], { code: '2.2.2.1.4' }),
      comp('beton', 'Beton Struktur fc 15 MPa', G.STRUKTUR, 'm3', 'num_units * unit_area * 0.145', ['num_units', 'unit_area'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. < 12 mm', G.STRUKTUR, 'kg', 'num_units * unit_area * 10', ['num_units', 'unit_area'], { code: '2.2.1.1.3' }),
      comp('bek-kolom-prak', 'Bekisting Kolom Beton Pracetak (10–12x Pakai)', G.STRUKTUR, 'm2', 'num_units * unit_area * 0.3', ['num_units', 'unit_area'], { code: '2.4.1.3', level: 'COMPREHENSIVE', optional: true }),
      comp('dinding', 'Dinding Bata Ringan t=10 cm', G.DINDING, 'm2', 'num_units * unit_area * 1.7', ['num_units', 'unit_area'], { code: '3.6.4.2' }),
      comp('plester', 'Plesteran 1SP:4PP t=15 mm', G.DINDING, 'm2', 'num_units * unit_area * 3.4', ['num_units', 'unit_area'], { code: '3.7.4', price: 68500 }),
      comp('lantai', 'Lantai Ubin PC 40x40 Unit & Koridor', G.LANTAI, 'm2', 'num_units * unit_area * 1.15', ['num_units', 'unit_area'], { code: '3.9.1.3' }),
      comp('railing', 'Railing Tangga & Handrail Koridor Terbuka', G.FINISHING, 'm1', 'corridor_length * num_floors * 1.15', ['corridor_length', 'num_floors'], { code: '3.13.5', level: 'PROFESSIONAL' }),
      comp('cat', 'Pengecatan Interior Tembok Baru', G.FINISHING, 'm2', 'num_units * unit_area * 2.9', ['num_units', 'unit_area'], { code: '3.8.10.1', level: 'PROFESSIONAL' }),
      comp('cat-eks', 'Pengecatan Eksterior Tembok Baru', G.FINISHING, 'm2', 'num_units * unit_area * 0.85', ['num_units', 'unit_area'], { code: '3.8.10.2', level: 'PROFESSIONAL' }),
      comp('kloset', 'Kloset Jongkok per Unit', G.SANITASI, 'unit', 'num_units', ['num_units'], { price: 1185000, priceNote: 'Referensi kloset jongkok keramik + kran terpasang.' }),
      comp('pipa', 'Pipa PPR PN10 DN 1" Distribusi Air Bersih Riser', G.SANITASI, 'm1', 'num_floors * 42', ['num_floors'], { code: '6.4.3.3', level: 'PROFESSIONAL' }),
      comp('listrik', 'Instalasi Titik Lampu Unit & Koridor', G.ELEKTRIKAL, 'titik', 'num_units * 4 + num_floors * 6', ['num_units', 'num_floors'], { code: '5.3.1.1', level: 'PROFESSIONAL' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Koridor terbuka satu sisi (single loaded) dengan railing pengaman tinggi 1,1 m; tanpa lift sesuai standar rusunawa ≤ 5 lantai.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk jaringan air bersih kawasan, TPS, ruang serbaguna terpisah, dan perabot unit.']
  }),

  tpl({
    id: 'BLD-DATA-CENTER',
    name: 'Gedung Data Center Tier III (Fasilitas IT Kritis)',
    category: 'BANGUNAN_TINGGI',
    subcategory: 'Data Center',
    description: 'Fasilitas data center dengan ruang server raised floor, redundansi daya (trafo ganda, genset 2N, busduct), lantai anti-statik, dan keamanan berlapis. Lingkup konstruksi & MEP daya dasar.',
    badge: 'Tier III',
    icon: 'Server',
    parameters: [
      num('hall_area', 'Luas Ruang Server (Data Hall)', 800, { min: 200, max: 4000, unit: 'm²' }),
      num('num_racks', 'Jumlah Rack Server', 220, { min: 40, max: 1200, group: 'specifications' }),
      num('num_floors', 'Jumlah Lantai', 3, { min: 1, max: 8 }),
      num('it_load_kw', 'Beban IT Total (kW)', 1500, { min: 200, max: 10000, unit: 'kW', group: 'specifications' })
    ],
    components: [
      comp('prep', 'Pembersihan & Pengupasan Lahan', G.PERSIAPAN, 'm2', 'hall_area * 2.1', ['hall_area'], { code: 'C.37' }),
      comp('galian', 'Galian Tanah Pondasi', G.TANAH, 'm3', 'hall_area * 0.9', ['hall_area'], { code: '1.2.1.1.2' }),
      comp('batu', 'Pondasi Batu Belah Mortar Tipe S Semi Mekanis', G.PONDASI, 'm3', 'hall_area * 0.55', ['hall_area'], { code: '2.2.2.1.5' }),
      comp('beton', 'Beton Struktur fc 15 MPa (Slab on Grade Diperkuat)', G.STRUKTUR, 'm3', 'hall_area * num_floors * 0.22', ['hall_area', 'num_floors'], { code: '2.2.1.4.3', price: 1355000 }),
      comp('besi', 'Penulangan BjTP dia. ≥ 12 mm', G.STRUKTUR, 'kg', 'hall_area * num_floors * 18', ['hall_area', 'num_floors'], { code: '2.2.1.1.4' }),
      comp('wiremesh', 'Penulangan Wiremesh M6–M10 Slab Data Hall', G.STRUKTUR, 'kg', 'hall_area * 8.4', ['hall_area'], { code: '2.2.1.1.5', level: 'PROFESSIONAL' }),
      comp('raised', 'Raised Floor Anti-Statik H=40 cm Ruang Server', G.LANTAI, 'm2', 'hall_area', ['hall_area'], { price: 1185000, priceNote: 'Referensi raised floor calcium sulphate panel + pedestal terpasang.' }),
      comp('dinding', 'Dinding Bata Ringan t=20 cm (Kompartemen Api)', G.DINDING, 'm2', 'hall_area * 1.1', ['hall_area'], { code: '3.6.4.3' }),
      comp('pintu-api', 'Pintu Besi Tahan Api Ruang Server & UPS', G.KUSEN, 'm2', 'num_floors * 8.4', ['num_floors'], { code: '3.11.1.16', price: 2950000, level: 'PROFESSIONAL', priceNote: 'Komposisi resolver PARTIAL — fallback referensi pintu tahan api 120 menit terpasang.' }),
      comp('trafo', 'Trafo 630 kVA Synthetic Oil Ester + Terminasi', G.ELEKTRIKAL, 'unit', '2', [], { code: '5.1.4.1', level: 'PROFESSIONAL' }),
      comp('genset', 'Genset Silent 400 kVA (Redundansi N+1)', G.ELEKTRIKAL, 'unit', '2', [], { code: '5.1.3.3', level: 'PROFESSIONAL' }),
      comp('mdp', 'Main Distribution Panel (MDP) Floor Standing', G.ELEKTRIKAL, 'unit', 'num_floors * 2', ['num_floors'], { code: '5.1.2.3', level: 'PROFESSIONAL' }),
      comp('tray', 'Kabel Tray 300x100 Horizontal Distribusi Daya', G.ELEKTRIKAL, 'unit', 'num_racks * 1.2', ['num_racks'], { code: '5.1.1.12.4', level: 'COMPREHENSIVE' }),
      comp('busduct', 'Busduct 2.000A Distribusi Utama', G.ELEKTRIKAL, 'm1', 'num_floors * 28', ['num_floors'], { price: 5305487, level: 'COMPREHENSIVE', priceNote: 'Referensi dari item kanonis 5.1.9.2 (satuan kanonis tidak standar sehingga tidak lolos unit-gate; harga diperlakukan referensi).' }),
      comp('petir', 'Penangkal Petir + Grounding Grid', G.ELEKTRIKAL, 'buah', '4', [], { code: 'SMKK.0173', level: 'COMPREHENSIVE' }),
      comp('apar', 'Fire Extinguisher 25 kg Ruang Elektrikal', G.MEKANIKAL, 'unit', 'num_floors * 4', ['num_floors'], { code: '5.6.3.3', level: 'COMPREHENSIVE' })
    ],
    assumptions: [...ASUMSI_BANGUNAN, 'Redundansi daya diasumsikan N+1 untuk genset dan 2 trafo; UPS & baterai adalah paket vendor di luar lingkup konstruksi.', 'Beban lantai data hall diasumsikan ≥ 12 kN/m² dengan slab diperkuat wiremesh lapis ganda.'],
    exclusions: [...EKSKLUSI_BANGUNAN, 'Tidak termasuk UPS, CRAC/CRAH precision cooling, rack & server, sistem FM-200/gas suppression, dan sertifikasi Tier.']
  })
];
