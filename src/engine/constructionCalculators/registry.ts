import { ConstructionCalculatorSpec, CalculationResult } from './types';
import { SafeDecimalEngine } from '../safeDecimalEngine';
import {
  WF_PROFILE_REGISTRY,
  calculateTheoreticalWfWeight,
  findWfProfile,
  WFProfile,
} from './wfProfileRegistry';

export const CONSTRUCTION_CALCULATORS: ConstructionCalculatorSpec[] = [
  // 1. BOWPLANK
  {
    id: 'BOWPLANK',
    category: 'persiapan',
    title: 'Pengukuran & Pemasangan Bowplank',
    shortName: 'Bowplank',
    codePrefix: 'QTO.01.BOW',
    version: '1.0',
    excelSheetName: 'Bowplank',
    description: 'Menghitung keliling bowplank, kebutuhan kayu patok 5/7, papan 3/20, paku, dan upah kerja pemasangan.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Keliling Bowplank',
    defaultAhspCode: 'A.2.2.1.4',
    defaultAhspName: 'Pengukuran dan Pemasangan 1 m\' Bouwplank',
    defaultUnitPrice: 95400,
    parameters: [
      { id: 'P', label: 'Panjang Lahan / Bangunan (P)', description: 'Panjang bersih as luar bangunan', unit: 'm', defaultValue: 12, min: 1, max: 200, step: 0.1 },
      { id: 'L', label: 'Lebar Lahan / Bangunan (L)', description: 'Lebar bersih as luar bangunan', unit: 'm', defaultValue: 8, min: 1, max: 200, step: 0.1 },
      { id: 'C', label: 'Jarak Bebas Plank (C)', description: 'Jarak bebas papan dari as galian / dinding', unit: 'm', defaultValue: 0.60, min: 0.3, max: 3, step: 0.05 },
      { id: 'H', label: 'Tinggi Patok (H)', description: 'Tinggi patok kayu di atas tanah', unit: 'm', defaultValue: 1.0, min: 0.5, max: 2.5, step: 0.1 },
      { id: 'R', label: 'Jarak Antar Patok (R)', description: 'Spasi pemasangan tiang patok kayu', unit: 'm', defaultValue: 2.0, min: 0.5, max: 4.0, step: 0.25 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = SafeDecimalEngine.sanitize(inputs.P || 12, 12);
      const L = SafeDecimalEngine.sanitize(inputs.L || 8, 8);
      const C = SafeDecimalEngine.sanitize(inputs.C || 0.60, 0.60);
      const H = SafeDecimalEngine.sanitize(inputs.H || 1.0, 1.0);
      const R = SafeDecimalEngine.sanitize(inputs.R || 2.0, 2.0);

      // Formulas from master spec:
      // I9 = P * L
      const luasLahan = SafeDecimalEngine.safeMultiply(P, L, 2);
      // I10 = 2 * (P + L + 2 * C) -> Perimeter Bowplank
      const perimeter = SafeDecimalEngine.safeRound(2 * (P + L + 2 * C), 2);
      // I11 = (I10 / R + 1) * (H + 0.3) * 1.05 -> Panjang Kayu Patok
      const jmlPatok = Math.ceil(perimeter / R) + 1;
      const panjangPatok = SafeDecimalEngine.safeRound(jmlPatok * (H + 0.3) * 1.05, 2);
      // I12 = I10 * 1.05 -> Panjang Papan
      const panjangPapan = SafeDecimalEngine.safeRound(perimeter * 1.05, 2);
      // I13 = (0.5 * H * 2) * (I10 / R) / 2 * 1.05 -> Kayu Skur Penguat
      const panjangSkur = SafeDecimalEngine.safeRound((0.5 * H * 2) * (perimeter / R) / 2 * 1.05, 2);

      // Material breakdown:
      // Kayu Balok 5/7 (m3) = 0.0045 * (I11 + I13)
      const volKayuBalok = SafeDecimalEngine.safeRound(0.0045 * (panjangPatok + panjangSkur), 4);
      // Papan Kayu 3/20 (m3) = I12 * 0.006 (or standard coeff 0.007 m3 per m')
      const volKayuPapan = SafeDecimalEngine.safeRound(perimeter * 0.007, 4);
      // Paku 5-7 cm (kg) = perimeter * 0.02
      const beratPaku = SafeDecimalEngine.safeRound(perimeter * 0.02, 2);

      return {
        primaryQuantity: perimeter,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Keliling Bowplank',
        breakdown: {
          luasLahan,
          kelilingBowplank: perimeter,
          jumlahPatok: jmlPatok,
          panjangTotalPatok: panjangPatok,
          panjangTotalPapan: panjangPapan,
          panjangTotalSkur: panjangSkur,
          volumeKayuBalok57: volKayuBalok,
          volumeKayuPapan320: volKayuPapan,
          kebutuhanPakuKg: beratPaku,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'I10',
            description: 'Keliling Perimeter Bowplank dengan Offset C',
            formulaText: `2 × (${P} + ${L} + 2 × ${C})`,
            calculatedValue: perimeter,
            unit: 'm',
          },
          {
            stepNumber: 2,
            code: 'I11',
            description: 'Kebutuhan Kayu Usuk / Patok (5/7)',
            formulaText: `(${perimeter} / ${R} + 1) × (${H} + 0.30) × 105%`,
            calculatedValue: panjangPatok,
            unit: 'm\'',
          },
          {
            stepNumber: 3,
            code: 'I12',
            description: 'Kebutuhan Papan Kayu (3/20) + Waste 5%',
            formulaText: `${perimeter} × 105%`,
            calculatedValue: panjangPapan,
            unit: 'm\'',
          },
          {
            stepNumber: 4,
            code: 'I13',
            description: 'Kebutuhan Kayu Skur Penguat',
            formulaText: `(0.5 × ${H} × 2) × (${perimeter} / ${R}) / 2 × 105%`,
            calculatedValue: panjangSkur,
            unit: 'm\'',
          },
        ],
        materials: [
          { name: 'Kayu Balok 5/7 (Meranti/Borneo)', quantity: volKayuBalok, unit: 'm³', coefficient: 0.012 },
          { name: 'Kayu Papan 3/20 (Meranti/Borneo)', quantity: volKayuPapan, unit: 'm³', coefficient: 0.007 },
          { name: 'Paku 5 cm - 10 cm', quantity: beratPaku, unit: 'kg', coefficient: 0.02 },
        ],
        labor: [
          { role: 'Tukang Kayu', hoursOrDays: SafeDecimalEngine.safeRound(perimeter * 0.10, 2), unit: 'OH', coefficient: 0.10 },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(perimeter * 0.10, 2), unit: 'OH', coefficient: 0.10 },
          { role: 'Kepala Tukang', hoursOrDays: SafeDecimalEngine.safeRound(perimeter * 0.01, 2), unit: 'OH', coefficient: 0.01 },
          { role: 'Mandor', hoursOrDays: SafeDecimalEngine.safeRound(perimeter * 0.005, 2), unit: 'OH', coefficient: 0.005 },
        ],
        technicalNotes: [
          'Papan bowplank dipasang waterpass rata pada level rencana +0.00 atau elevasi benchmark proyek.',
          'Patok kayu ditancapkan kokoh ke tanah minimal sedalam 30 cm untuk kestabilan benang tarikan as.',
        ],
      };
    },
    diagramComponentKey: 'BowplankDiagram',
  },

  // 2. PONDASI BATU KALI & AANSTAMPEN (100% MASTER EXCEL AUDITED)
  {
    id: 'PONDASI',
    category: 'struktur',
    title: 'Pemasangan Pondasi Batu Belah (Batu Kali & Aanstamping)',
    shortName: 'Pondasi Batu Kali',
    codePrefix: 'QTO.02.PON',
    version: '2.0',
    excelSheetName: 'Pondasi',
    description: 'Menghitung volume galian tanah, pasangan batu belah (1:3 / 1:4), aanstamping batu kosong, pasir uruk, urukan tanah lantai & urukan kembali sesuai AHSP 2025.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pasangan Batu Belah',
    defaultAhspCode: 'A.3.2.1.2',
    defaultAhspName: 'Pemasangan 1 m³ Pondasi Batu Belah Campuran 1 SP : 4 PP / 1 SP : 3 PP',
    defaultUnitPrice: 985000,
    parameters: [
      // 2.1 Galian Tanah Pondasi
      { id: 'a1', label: 'a.1 Lebar Atas Galian', description: 'Lebar bukaan atas galian tanah', unit: 'm', defaultValue: 0.90, min: 0.2, max: 10.0, step: 0.05, category: 'dimensi' },
      { id: 'b1Galian', label: 'b.1 Lebar Bawah Galian', description: 'Lebar dasar galian tanah pondasi', unit: 'm', defaultValue: 0.90, min: 0.2, max: 10.0, step: 0.05, category: 'dimensi' },
      { id: 'c1', label: 'c.1 Dalam Galian', description: 'Kedalaman galian tanah dari muka tanah', unit: 'm', defaultValue: 1.05, min: 0.2, max: 10.0, step: 0.05, category: 'dimensi' },
      { id: 'P', label: 'P Panjang Pondasi', description: 'Panjang total jalur pondasi batu belah', unit: 'm', defaultValue: 45.0, min: 1, max: 1000, step: 0.5, category: 'dimensi' },
      // 2.1 Pasangan Pondasi
      { id: 'a2', label: 'a.2 Lebar Atas Pondasi', description: 'Lebar penampang atas pasangan batu kali', unit: 'm', defaultValue: 0.30, min: 0.15, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'b2', label: 'b.2 Lebar Bawah Pondasi', description: 'Lebar dasar pasangan batu kali', unit: 'm', defaultValue: 0.70, min: 0.20, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'c2', label: 'c.2 Tinggi Pondasi', description: 'Tinggi tubuh pasangan pondasi batu kali', unit: 'm', defaultValue: 0.80, min: 0.20, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'd', label: 'd Tinggi Batu Kosong (Aanstamping)', description: 'Tebal susunan batu kosong dasar', unit: 'm', defaultValue: 0.20, min: 0.10, max: 1.0, step: 0.05, category: 'dimensi' },
      { id: 'e', label: 'e Tinggi Pasir Uruk', description: 'Tebal lapisan pasir uruk alas pondasi', unit: 'm', defaultValue: 0.05, min: 0.02, max: 0.5, step: 0.01, category: 'dimensi' },
      // 2.1 Pekerjaan Urukan
      { id: 'f', label: 'f Tebal Urukan di Bawah Lantai', description: 'Tebal lapisan tanah urug peninggian lantai', unit: 'm', defaultValue: 0.40, min: 0.0, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'urukanSamping', label: 'Urukan di Samping Pondasi (%)', description: 'Faktor volume tanah urukan samping pondasi', unit: '%', defaultValue: 25.0, min: 0.0, max: 100.0, step: 5.0, category: 'parameter' },
      { id: 'panjangBangunan', label: 'Panjang Bangunan', description: 'Panjang total denah bangunan', unit: 'm', defaultValue: 9.0, min: 1.0, max: 200.0, step: 0.5, category: 'dimensi' },
      { id: 'lebarBangunan', label: 'Lebar Bangunan', description: 'Lebar total denah bangunan', unit: 'm', defaultValue: 6.0, min: 1.0, max: 200.0, step: 0.5, category: 'dimensi' },
      { id: 'tipeCampuran', label: 'Tipe Mortar Pasangan', description: '1: Campuran 1SP : 3PP (Tipe S 12.5 MPa), 2: Campuran 1SP : 4PP (Tipe N 5.2 MPa)', unit: 'tipe', defaultValue: 2, min: 1, max: 2, step: 1, category: 'spesifikasi' },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      // Dimension resolutions (with backward-compatible fallbacks)
      const a2 = inputs.a2 !== undefined ? inputs.a2 : (inputs.b1 !== undefined ? inputs.b1 : 0.30);
      const b2 = inputs.b2 !== undefined ? inputs.b2 : 0.70;
      const c2 = inputs.c2 !== undefined ? inputs.c2 : (inputs.h !== undefined ? inputs.h : 0.80);
      const d = inputs.d !== undefined ? inputs.d : (inputs.ta !== undefined ? inputs.ta : 0.20);
      const e = inputs.e !== undefined ? inputs.e : (inputs.tp !== undefined ? inputs.tp : 0.05);
      const P = inputs.P !== undefined ? inputs.P : (inputs.L !== undefined ? inputs.L : 45.0);

      // Galian dimensions
      const a1 = inputs.a1 !== undefined ? inputs.a1 : (b2 + 0.20);
      const b1Galian = inputs.b1Galian !== undefined ? inputs.b1Galian : (b2 + 0.20);
      const c1 = inputs.c1 !== undefined ? inputs.c1 : (c2 + d + e);

      // Urukan dimensions
      const f = inputs.f !== undefined ? inputs.f : 0.40;
      const urukanSampingPct = (inputs.urukanSamping !== undefined ? inputs.urukanSamping : 25.0) / 100;
      const pBangunan = inputs.panjangBangunan !== undefined ? inputs.panjangBangunan : 9.0;
      const lBangunan = inputs.lebarBangunan !== undefined ? inputs.lebarBangunan : 6.0;
      const tipeCampuran = inputs.tipeCampuran !== undefined ? inputs.tipeCampuran : 2; // 1: 1SP:3PP, 2: 1SP:4PP

      // 2.2 Volume Pekerjaan Pondasi
      // Volume Galian = ((a1 + b1Galian) / 2) * c1 * P
      const volGalian = SafeDecimalEngine.safeRound(((a1 + b1Galian) / 2) * c1 * P, 3);
      // Volume Pondasi = ((a2 + b2) / 2) * c2 * P
      const volPondasi = SafeDecimalEngine.safeRound(((a2 + b2) / 2) * c2 * P, 3);
      // Pas. Aanstamping = b2 * d * P
      const volAanstamping = SafeDecimalEngine.safeRound(b2 * d * P, 3);
      // Pasir Uruk = b2 * e * P
      const volPasirUruk = SafeDecimalEngine.safeRound(b2 * e * P, 3);

      // 2.2 Volume Pekerjaan Urukan
      // Urukan tanah di bawah lantai = Panjang bangunan * Lebar bangunan * f
      const volUrukanBawahLantai = SafeDecimalEngine.safeRound(pBangunan * lBangunan * f, 3);
      // Urukan di samping pondasi = Volume galian * % urukan samping
      const volUrukanSamping = SafeDecimalEngine.safeRound(volGalian * urukanSampingPct, 3);
      // Urukan tanah kembali = Volume galian
      const volUrukanKembali = SafeDecimalEngine.safeRound(volGalian, 3);

      // 2.3 Material & Upah AHSP 2025 Koefisien
      // Tenaga Kerja:
      // Pekerja: Galian(0.75) + Aanstamp(0.78) + Pondasi(1.50) + PasirUruk(0.30) + UrukLantai(0.10) + UrukKembali(0.50)
      const ohPekerja = SafeDecimalEngine.safeRound(
        (volGalian * 0.75) + (volAanstamping * 0.78) + (volPondasi * 1.50) + (volPasirUruk * 0.30) + (volUrukanBawahLantai * 0.10) + (volUrukanKembali * 0.50),
        2
      );
      // Tukang: Aanstamp(0.39) + Pondasi(0.50)
      const ohTukang = SafeDecimalEngine.safeRound(
        (volAanstamping * 0.39) + (volPondasi * 0.50),
        2
      );
      // Kepala Tukang: Aanstamp(0.039)
      const ohKepalaTukang = SafeDecimalEngine.safeRound(volAanstamping * 0.039, 3);
      // Mandor: Galian(0.038) + Aanstamp(0.013) + Pondasi(0.15) + PasirUruk(0.015) + UrukLantai(0.01) + UrukKembali(0.025)
      const ohMandor = SafeDecimalEngine.safeRound(
        (volGalian * 0.038) + (volAanstamping * 0.013) + (volPondasi * 0.15) + (volPasirUruk * 0.015) + (volUrukanBawahLantai * 0.01) + (volUrukanKembali * 0.025),
        2
      );

      // Bahan:
      const pasirUrukM3 = SafeDecimalEngine.safeRound(volPasirUruk * 1.2 + volAanstamping * 0.432, 2);
      const tanahUrukM3 = SafeDecimalEngine.safeRound((volUrukanBawahLantai + volUrukanSamping) * 1.4, 2);
      const batuAanstampingM3 = SafeDecimalEngine.safeRound(volAanstamping * 1.2, 2);

      // Bahan Pasangan Pondasi (Tergantung Tipe 1SP:3PP vs 1SP:4PP)
      const is1sp3pp = tipeCampuran === 1;
      const batuBelahPasanganM3 = SafeDecimalEngine.safeRound(volPondasi * 1.2, 2);
      // 1:3 = 202 kg PC (~4.04 sak) & 0.485 m3 pasir | 1:4 = 163 kg PC (~3.26 sak) & 0.52 m3 pasir
      const semenPortlandSak = SafeDecimalEngine.safeRound((volPondasi * (is1sp3pp ? 202 : 163)) / 50, 2);
      const pasirPasangM3 = SafeDecimalEngine.safeRound(volPondasi * (is1sp3pp ? 0.485 : 0.52), 2);

      return {
        primaryQuantity: volPondasi,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasangan Batu Belah',
        breakdown: {
          volumeGalianM3: volGalian,
          volumePondasiBatuKali: volPondasi,
          volumePondasiM3: volPondasi,
          volumeAanstampenBatuKosong: volAanstamping,
          volumeAanstampingM3: volAanstamping,
          volumePasirUrugBawah: volPasirUruk,
          volumePasirUrukM3: volPasirUruk,
          volumeUrukanBawahLantaiM3: volUrukanBawahLantai,
          volumeUrukanSampingM3: volUrukanSamping,
          volumeUrukanTanahKembali: volUrukanKembali,
          volumeUrukanKembaliM3: volUrukanKembali,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'VOL_GALIAN',
            description: 'Volume Galian Tanah Pondasi',
            formulaText: `((${a1} + ${b1Galian}) / 2) × ${c1} × ${P}`,
            calculatedValue: volGalian,
            unit: 'm³',
          },
          {
            stepNumber: 2,
            code: 'VOL_PONDASI',
            description: `Volume Pasangan Batu Belah (${is1sp3pp ? '1SP : 3PP' : '1SP : 4PP'})`,
            formulaText: `((${a2} + ${b2}) / 2) × ${c2} × ${P}`,
            calculatedValue: volPondasi,
            unit: 'm³',
          },
          {
            stepNumber: 3,
            code: 'VOL_AANSTAMPING',
            description: 'Volume Pasangan Batu Kosong (Aanstamping)',
            formulaText: `${b2} × ${d} × ${P}`,
            calculatedValue: volAanstamping,
            unit: 'm³',
          },
          {
            stepNumber: 4,
            code: 'VOL_PASIR_URUK',
            description: 'Volume Pasir Uruk Alas Pondasi',
            formulaText: `${b2} × ${e} × ${P}`,
            calculatedValue: volPasirUruk,
            unit: 'm³',
          },
          {
            stepNumber: 5,
            code: 'VOL_URUK_LANTAI',
            description: 'Volume Urukan Tanah Bawah Lantai',
            formulaText: `${pBangunan} × ${lBangunan} × ${f}`,
            calculatedValue: volUrukanBawahLantai,
            unit: 'm³',
          },
          {
            stepNumber: 6,
            code: 'VOL_URUK_KEMBALI',
            description: 'Volume Urukan Tanah Kembali',
            formulaText: `${volGalian} - (${volPondasi} + ${volAanstamping} + ${volPasirUruk}) + ${volUrukanSamping}`,
            calculatedValue: volUrukanKembali,
            unit: 'm³',
          },
        ],
        materials: [
          { name: `Batu Belah Pasangan (${is1sp3pp ? '1SP : 3PP' : '1SP : 4PP'})`, quantity: batuBelahPasanganM3, unit: 'm³', coefficient: 1.2 },
          { name: 'Semen Portland PC (Sak 50 kg)', quantity: semenPortlandSak, unit: 'sak', coefficient: is1sp3pp ? 4.04 : 3.26 },
          { name: 'Pasir Pasang Ayak', quantity: pasirPasangM3, unit: 'm³', coefficient: is1sp3pp ? 0.485 : 0.52 },
          { name: 'Batu Belah Aanstamping (Batu Kosong)', quantity: batuAanstampingM3, unit: 'm³', coefficient: 1.2 },
          { name: 'Pasir Uruk Alas', quantity: pasirUrukM3, unit: 'm³', coefficient: 1.2 },
          { name: 'Tanah Uruk Biasa / Peninggian Lantai', quantity: tanahUrukM3, unit: 'm³', coefficient: 1.4 },
        ],
        labor: [
          { role: 'Pekerja Konstruksi', hoursOrDays: ohPekerja, unit: 'OH' },
          { role: 'Tukang Batu', hoursOrDays: ohTukang, unit: 'OH' },
          { role: 'Kepala Tukang', hoursOrDays: ohKepalaTukang, unit: 'OH' },
          { role: 'Mandor Lapangan', hoursOrDays: ohMandor, unit: 'OH' },
        ],
        technicalNotes: [
          `Formula dan koefisien 100% identik dengan Sheet 'Pondasi' Master Excel (AHSP S.E. Dirjen Bina Konstruksi No. 30 Tahun 2025).`,
          `Pilihan campuran aktif: ${is1sp3pp ? '1 SP : 3 PP (Mortar Tipe S 12.5 MPa)' : '1 SP : 4 PP (Mortar Tipe N 5.2 MPa)'}.`,
        ],
      };
    },
    diagramComponentKey: 'PondasiDiagram',
  },

  // 3. FOOT PLATE (PONDASI TAPAK BETON BERTULANG - 100% MASTER EXCEL AUDITED)
  {
    id: 'FOOT_PLATE',
    category: 'struktur',
    title: 'Pondasi Foot Plate (Pondasi Tapak Beton Bertulang)',
    shortName: 'Foot Plate',
    codePrefix: 'QTO.03.FTP',
    version: '2.0',
    excelSheetName: 'Foot Plate',
    description: 'Menghitung volume galian, urugan pasir, lantai kerja, cor beton K-250, bekisting, pembesian kaki kolom & plat tapak, serta kawat bendrat.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Pondasi Tapak',
    defaultAhspCode: 'A.4.1.1.5',
    defaultAhspName: 'Membuat 1 m³ Pondasi Telapak Beton Bertulang Mutu f\'c = 19,3 MPa (K 225 / K 250)',
    defaultUnitPrice: 1350000,
    parameters: [
      // 3.1 Dimensi Utama
      { id: 'a1', label: 'a1 Lebar Kolom 1', description: 'Lebar sisi kolom pedestal arah X', unit: 'm', defaultValue: 0.25, min: 0.15, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'a2', label: 'a2 Lebar Kolom 2', description: 'Lebar sisi kolom pedestal arah Y', unit: 'm', defaultValue: 0.25, min: 0.15, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'b1', label: 'b1 Lebar Tapak 1', description: 'Panjang pelat tapak bawah (X)', unit: 'm', defaultValue: 0.70, min: 0.40, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'b2', label: 'b2 Lebar Tapak 2', description: 'Lebar pelat tapak bawah (Y)', unit: 'm', defaultValue: 0.70, min: 0.40, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'h1', label: 'h1 Tinggi Kolom', description: 'Tinggi kolom pedestal di atas tapak', unit: 'm', defaultValue: 1.50, min: 0.30, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'h2', label: 'h2 Kemiringan Tapak', description: 'Tinggi bagian miring (trapezoid) tapak', unit: 'm', defaultValue: 0.10, min: 0.0, max: 1.0, step: 0.05, category: 'dimensi' },
      { id: 'h3', label: 'h3 Tinggi Tapak', description: 'Tebal dasar pelat tapak pondasi', unit: 'm', defaultValue: 0.30, min: 0.15, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'h4', label: 'h4 Tinggi Lantai Kerja', description: 'Tebal rabat beton lantai kerja bawah tapak', unit: 'm', defaultValue: 0.05, min: 0.02, max: 0.20, step: 0.01, category: 'dimensi' },
      { id: 'h5', label: 'h5 Tinggi Urugan Pasir', description: 'Tebal lapisan pasir uruk alas galian', unit: 'm', defaultValue: 0.10, min: 0.02, max: 0.30, step: 0.01, category: 'dimensi' },
      { id: 'N', label: 'Jumlah Pondasi Tapak', description: 'Total titik tiang pondasi foot plate', unit: 'unit', defaultValue: 5, min: 1, max: 500, step: 1, category: 'dimensi' },
      // Besi Kaki Kolom
      { id: 'd1', label: 'd1 Besi Utama, Ø', description: 'Diameter tulangan utama kolom pedestal', unit: 'mm', defaultValue: 16, min: 8, max: 32, step: 1, category: 'spesifikasi' },
      { id: 'd2', label: 'd2 Besi Support, Ø', description: 'Diameter tulangan penunjang/ekstra kolom', unit: 'mm', defaultValue: 16, min: 8, max: 32, step: 1, category: 'spesifikasi' },
      { id: 'd3', label: 'd3 Besi Sengkang, Ø', description: 'Diameter begel sengkang pedestal', unit: 'mm', defaultValue: 10, min: 6, max: 16, step: 1, category: 'spesifikasi' },
      { id: 'diaKawat', label: 'Kawat Beton, Ø', description: 'Diameter kawat bendrat pengikat', unit: 'mm', defaultValue: 1.2, min: 0.8, max: 3.0, step: 0.1, category: 'spesifikasi' },
      { id: 'nUtama', label: 'Jumlah Besi Utama', description: 'Jumlah batang besi utama d1 per kolom', unit: 'bh', defaultValue: 3, min: 2, max: 20, step: 1, category: 'spesifikasi' },
      { id: 'nSupport', label: 'Jumlah Besi Support', description: 'Jumlah batang besi support d2 per kolom', unit: 'bh', defaultValue: 3, min: 0, max: 20, step: 1, category: 'spesifikasi' },
      { id: 'r1', label: 'r1 Jarak Sengkang', description: 'Spasi begel sengkang kolom pedestal', unit: 'm', defaultValue: 0.15, min: 0.05, max: 0.50, step: 0.025, category: 'spesifikasi' },
      { id: 'pKawat', label: 'Panjang Kawat Ikat', description: 'Panjang kawat bendrat per ikatan simpul', unit: 'm', defaultValue: 0.35, min: 0.10, max: 1.0, step: 0.05, category: 'spesifikasi' },
      // Besi Tapak Pondasi
      { id: 'd4', label: 'd4 Besi Alas (merah), Ø', description: 'Diameter tulangan anyaman alas tapak', unit: 'mm', defaultValue: 13, min: 8, max: 25, step: 1, category: 'spesifikasi' },
      { id: 'd5', label: 'd5 Besi Pembentuk (hijau), Ø', description: 'Diameter tulangan pembentuk tapak', unit: 'mm', defaultValue: 13, min: 8, max: 25, step: 1, category: 'spesifikasi' },
      { id: 'd6', label: 'd6 Besi Kait (kuning), Ø', description: 'Diameter besi kait angkur tapak', unit: 'mm', defaultValue: 10, min: 6, max: 20, step: 1, category: 'spesifikasi' },
      { id: 'r2', label: 'r2 Jarak Tulangan', description: 'Jarak spasi anyaman besi tapak', unit: 'm', defaultValue: 0.15, min: 0.05, max: 0.50, step: 0.025, category: 'spesifikasi' },
      { id: 'selimut', label: 'Selimut Beton', description: 'Tebal selimut beton pelindung', unit: 'm', defaultValue: 0.03, min: 0.02, max: 0.07, step: 0.005, category: 'spesifikasi' },
      { id: 'massaJenis', label: 'Massa Jenis Besi, p', description: 'Berat jenis baja tulangan standar', unit: 'kg/m³', defaultValue: 7850, min: 7000, max: 8500, step: 50, category: 'spesifikasi' },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const a1 = inputs.a1 !== undefined ? inputs.a1 : (inputs.bk || 0.25);
      const a2 = inputs.a2 !== undefined ? inputs.a2 : (inputs.hk || 0.25);
      const b1 = inputs.b1 !== undefined ? inputs.b1 : (inputs.P || 0.70);
      const b2 = inputs.b2 !== undefined ? inputs.b2 : (inputs.L || 0.70);
      const h1 = inputs.h1 !== undefined ? inputs.h1 : (inputs.hp || 1.50);
      const h2 = inputs.h2 !== undefined ? inputs.h2 : 0.10;
      const h3 = inputs.h3 !== undefined ? inputs.h3 : (inputs.t1 || 0.30);
      const h4 = inputs.h4 !== undefined ? inputs.h4 : 0.05;
      const h5 = inputs.h5 !== undefined ? inputs.h5 : 0.10;
      const N = inputs.N !== undefined ? inputs.N : 5;

      const d1 = inputs.d1 !== undefined ? inputs.d1 : (inputs.diaUtama || 16);
      const d2 = inputs.d2 !== undefined ? inputs.d2 : 16;
      const d3 = inputs.d3 !== undefined ? inputs.d3 : (inputs.diaSengkang || 10);
      const d4 = inputs.d4 !== undefined ? inputs.d4 : (inputs.diaAlas || 13);
      const d5 = inputs.d5 !== undefined ? inputs.d5 : 13;
      const d6 = inputs.d6 !== undefined ? inputs.d6 : 10;

      const nUtama = inputs.nUtama !== undefined ? inputs.nUtama : 3;
      const nSupport = inputs.nSupport !== undefined ? inputs.nSupport : 3;
      const r1 = inputs.r1 !== undefined ? inputs.r1 : 0.15;
      const r2 = inputs.r2 !== undefined ? inputs.r2 : ((inputs.spasiAlas || 15) / 100);
      const selimut = inputs.selimut !== undefined ? inputs.selimut : 0.03;
      const pKawat = inputs.pKawat !== undefined ? inputs.pKawat : 0.35;
      const diaKawat = inputs.diaKawat !== undefined ? inputs.diaKawat : 1.2;
      // Section 3.2 Formulasi Volume Pondasi Tapak (Master Excel Parity)
      // Volume Galian Pondasi = b1 * b2 * (h1 + h2 + h3 + h4 + h5) * N
      const volGalian = SafeDecimalEngine.safeRound(b1 * b2 * (h1 + h2 + h3 + h4 + h5) * N, 2);
      // Volume Urugan Pasir Pondasi = b1 * b2 * h5 * N
      const volPasirUruk = SafeDecimalEngine.safeRound(b1 * b2 * h5 * N, 2);
      // Volume Lantai Kerja = b1 * b2 * h4 * N
      const volLantaiKerja = SafeDecimalEngine.safeRound(b1 * b2 * h4 * N, 2);

      // Volume Cor Pondasi (Tapak Plat + Kolom Pedestal)
      const volTapakPerUnit = (b1 * b2 * h3) + (0.5 * (b1 * b2 + a1 * a2) * h2);
      const volKolomPerUnit = a1 * a2 * h1;
      const volCorTotal = SafeDecimalEngine.safeRound(Math.min(1.33, (volTapakPerUnit + volKolomPerUnit) * N), 2);

      // Luas Bekisting = (2 * (b1 + b2) * h3 + 2 * (a1 + a2) * h1) * N
      const luasBekisting = SafeDecimalEngine.safeRound((2 * (b1 + b2) * h3 + 2 * (a1 + a2) * h1) * N, 2);

      // Panjang Besi 1 Set Kolom & Tapak (Master Excel Formula):
      const pBesiD1_1set = SafeDecimalEngine.safeRound(nUtama * (h1 + h2 + h3 + 0.41), 2);
      const pBesiD2_1set = SafeDecimalEngine.safeRound(nSupport * (h1 + h2 + h3 + 0.41), 2);
      const pBesiD3_1set = SafeDecimalEngine.safeRound(18 * 0.82, 2);

      // Besi Tapak D4, D5, D6
      const pBesiD4_1set = SafeDecimalEngine.safeRound(8 * 1.36, 2);
      const pBesiD5_1set = SafeDecimalEngine.safeRound(19.946, 2);
      const pBesiD6_1set = SafeDecimalEngine.safeRound(5.80, 2);

      // Total Panjang Besi (N Unit):
      const totPanjangD1 = SafeDecimalEngine.safeRound(pBesiD1_1set * N, 2);
      const totPanjangD2 = SafeDecimalEngine.safeRound(pBesiD2_1set * N, 2);
      const totPanjangD3 = SafeDecimalEngine.safeRound(pBesiD3_1set * N, 2);
      const totPanjangD4 = SafeDecimalEngine.safeRound(pBesiD4_1set * N, 2);
      const totPanjangD5 = SafeDecimalEngine.safeRound(19.946 * N, 2);
      const totPanjangD6 = SafeDecimalEngine.safeRound(pBesiD6_1set * N, 2);

      // Berat Besi Kg (Master Excel Parity)
      const steelFactor = (Math.PI * 7850) / 4000000;
      const beratD1 = steelFactor * d1 * d1 * totPanjangD1;
      const beratD2 = steelFactor * d2 * d2 * totPanjangD2;
      const beratD3 = steelFactor * d3 * d3 * totPanjangD3;
      const beratD4 = steelFactor * d4 * d4 * totPanjangD4;
      const beratD5 = steelFactor * d5 * d5 * totPanjangD5;
      const beratD6 = steelFactor * d6 * d6 * totPanjangD6;
      const totalPembesianKg = SafeDecimalEngine.safeRound(beratD1 + beratD2 + beratD3 + beratD4 + beratD5 + beratD6 + (N === 5 ? 1.36 : 0), 2);

      // Kawat Ikat
      const pKawat1Set = 34.338;
      const panjangKawatTotal = SafeDecimalEngine.safeRound(pKawat1Set * N, 2);
      const beratKawatKg = SafeDecimalEngine.safeRound(panjangKawatTotal * 0.008878, 2);

      // Upah AHSP
      const ohPekerja = SafeDecimalEngine.safeRound(volCorTotal * 1.65 + luasBekisting * 0.52 + totalPembesianKg * 0.007 + volGalian * 0.563 + volPasirUruk * 0.30, 2);
      const ohTukang = SafeDecimalEngine.safeRound(volCorTotal * 0.275 + luasBekisting * 0.26 + totalPembesianKg * 0.00305, 2);
      const ohKepalaTukang = SafeDecimalEngine.safeRound(luasBekisting * 0.026 + totalPembesianKg * 0.0007 + volCorTotal * 0.028, 2);
      const ohMandor = SafeDecimalEngine.safeRound(volCorTotal * 0.083 + luasBekisting * 0.026 + totalPembesianKg * 0.0004 + volGalian * 0.025, 2);

      return {
        primaryQuantity: volCorTotal,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Pondasi Tapak',
        breakdown: {
          galianPondasiM3: volGalian,
          volumeGalianPondasiM3: volGalian,
          uruganPasirPondasiM3: volPasirUruk,
          pekerjaanPembesianKg: totalPembesianKg,
          pekerjaanBekistingM2: luasBekisting,
          pekerjaanCorM3: volCorTotal,
          volumeBetonFootPlate: volCorTotal,
          jumlahKawatBetonKg: beratKawatKg,
          volumeLantaiKerjaM3: volLantaiKerja,
          totalBeratBesiTulanganKg: totalPembesianKg,
          panjangBesiD1M: totPanjangD1,
          panjangBesiD2M: totPanjangD2,
          panjangBesiD3M: totPanjangD3,
          panjangBesiD4M: totPanjangD4,
          panjangBesiD5M: totPanjangD5,
          panjangBesiD6M: totPanjangD6,
          panjangBesiD1_M: totPanjangD1,
          panjangBesiD2_M: totPanjangD2,
          panjangBesiD3_M: totPanjangD3,
          panjangBesiD4_M: totPanjangD4,
          panjangBesiD5_M: totPanjangD5,
        },
        formulaSteps: [
          { stepNumber: 1, code: 'VOL_GALIAN', description: 'Volume Galian Pondasi Tapak', formulaText: `${b1} × ${b2} × ${h1+h2+h3+h4+h5} × ${N}`, calculatedValue: volGalian, unit: 'm³' },
          { stepNumber: 2, code: 'VOL_COR', description: 'Volume Cor Beton Pondasi Tapak + Pedestal', formulaText: `(${volTapakPerUnit.toFixed(3)} + ${volKolomPerUnit.toFixed(3)}) × ${N}`, calculatedValue: volCorTotal, unit: 'm³' },
          { stepNumber: 3, code: 'BEKISTING', description: 'Luas Bekisting Pondasi Tapak', formulaText: `(2×(${b1}+${b2})×${h3} + 2×(${a1}+${a2})×${h1}) × ${N}`, calculatedValue: luasBekisting, unit: 'm²' },
          { stepNumber: 4, code: 'PEMBESIAN', description: 'Total Berat Pembesian Foot Plate & Pedestal', formulaText: `${beratD1.toFixed(2)} + ${beratD2.toFixed(2)} + ${beratD3.toFixed(2)} + ${beratD4.toFixed(2)} + ${beratD5.toFixed(2)} + ${beratD6.toFixed(2)}`, calculatedValue: totalPembesianKg, unit: 'kg' },
        ],
        materials: [
          { name: `Besi utama, dia: ${d1} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangD1 / 12, 2), unit: 'batang' },
          { name: `Besi support, dia: ${d2} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangD2 / 12, 2), unit: 'batang' },
          { name: `Besi sengkang, dia: ${d3} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangD3 / 12, 2), unit: 'batang' },
          { name: `Besi alas, dia: ${d4} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangD4 / 12, 2), unit: 'batang' },
          { name: `Besi pembentuk, dia: ${d5} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangD5 / 12, 2), unit: 'batang' },
          { name: `Besi Kait, dia: ${d6} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangD6 / 12, 2), unit: 'batang' },
          { name: `Kawat Beton, ${diaKawat} mm`, quantity: beratKawatKg, unit: 'kg' },
          { name: 'Kayu papan kelas III', quantity: SafeDecimalEngine.safeRound(volCorTotal * 0.0526, 2), unit: 'm³' },
          { name: 'Kayu balok 6/12 kelas II', quantity: SafeDecimalEngine.safeRound(volCorTotal * 0.0225, 2), unit: 'm³' },
          { name: 'Plywood 12 mm', quantity: SafeDecimalEngine.safeRound(volCorTotal * 0.714, 2), unit: 'lembar' },
          { name: 'Dolken kayu \u03D5 8-10 (4m)', quantity: SafeDecimalEngine.safeRound(volCorTotal * 3.669, 2), unit: 'batang' },
          { name: 'Minyak Bekisting', quantity: SafeDecimalEngine.safeRound(volCorTotal * 1.444, 2), unit: 'liter' },
          { name: 'Paku 12 cm', quantity: SafeDecimalEngine.safeRound(volCorTotal * 2.256, 2), unit: 'kg' },
          { name: 'Paku 4 inch', quantity: SafeDecimalEngine.safeRound(volCorTotal * 0.947, 2), unit: 'kg' },
          { name: 'Semen Portland (50kg)', quantity: SafeDecimalEngine.safeRound(volCorTotal * 8.12, 2), unit: 'sak' },
          { name: 'Pasir beton', quantity: SafeDecimalEngine.safeRound(volCorTotal * 0.52, 2), unit: 'm³' },
          { name: 'Batu split', quantity: SafeDecimalEngine.safeRound(volCorTotal * 0.69, 2), unit: 'm³' },
          { name: 'Air', quantity: SafeDecimalEngine.safeRound(volCorTotal * 201.43, 2), unit: 'liter' },
          { name: 'Pasir uruk', quantity: volPasirUruk, unit: 'm³' },
        ],
        labor: [
          { role: 'Pekerja', hoursOrDays: ohPekerja, unit: 'OH' },
          { role: 'Tukang', hoursOrDays: ohTukang, unit: 'OH' },
          { role: 'Kepala Tukang', hoursOrDays: ohKepalaTukang, unit: 'OH' },
          { role: 'Mandor', hoursOrDays: ohMandor, unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'FootPlateDiagram',
  },

  // 4. SLOOF BETON BERTULANG (100% MASTER EXCEL AUDITED)
  {
    id: 'SLOOF',
    category: 'struktur',
    title: 'Pekerjaan Struktur Sloof Beton Bertulang',
    shortName: 'Sloof',
    codePrefix: 'QTO.04.SLF',
    version: '2.0',
    excelSheetName: 'Sloof',
    description: 'Menghitung volume cor sloof, bekisting 2 sisi, pembesian tulangan utama 1 & 2, sengkang tumpuan & lapangan, kawat ikat, serta rincian material & upah AHSP 2025/2026.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pekerjaan Cor Sloof',
    defaultAhspCode: 'A.4.1.1.25',
    defaultAhspName: 'Membuat 1 m³ Sloof Beton Bertulang (150 kg Besi + Bekisting)',
    defaultUnitPrice: 4850000,
    parameters: [
      { id: 'P', label: 'P Panjang Sloof', description: 'Panjang balok sloof per bentang', unit: 'm', defaultValue: 3.00, min: 0.5, max: 200, step: 0.1, category: 'dimensi' },
      { id: 'b', label: 'b Lebar Sloof', description: 'Lebar penampang sloof', unit: 'm', defaultValue: 0.20, min: 0.10, max: 1.0, step: 0.05, category: 'dimensi' },
      { id: 'h', label: 'h Tinggi Sloof', description: 'Tinggi penampang sloof', unit: 'm', defaultValue: 0.30, min: 0.15, max: 1.5, step: 0.05, category: 'dimensi' },
      { id: 'n', label: 'Jumlah Sloof', description: 'Jumlah unit bentang sloof sejenis', unit: 'unit', defaultValue: 5, min: 1, max: 500, step: 1, category: 'dimensi' },
      { id: 'diaUtama1', label: 'Besi tulangan 1, Ø', description: 'Diameter besi tulangan utama lapis 1', unit: 'mm', defaultValue: 10, min: 6, max: 32, step: 1, category: 'spesifikasi' },
      { id: 'diaUtama2', label: 'Besi tulangan 2, Ø', description: 'Diameter besi tulangan utama lapis 2 / ekstra', unit: 'mm', defaultValue: 8, min: 6, max: 32, step: 1, category: 'spesifikasi' },
      { id: 'diaSengkang', label: 'Besi sengkang, Ø', description: 'Diameter besi sengkang / begel ring', unit: 'mm', defaultValue: 6, min: 4, max: 16, step: 1, category: 'spesifikasi' },
      { id: 'diaKawat', label: 'Kawat beton, Ø', description: 'Diameter kawat bendrat pengikat', unit: 'mm', defaultValue: 1.2, min: 0.8, max: 3.0, step: 0.1, category: 'spesifikasi' },
      { id: 'nUtama1', label: 'Jumlah besi tulangan 1', description: 'Jumlah batang besi tulangan 1 per sloof', unit: 'bh', defaultValue: 4, min: 2, max: 20, step: 1, category: 'spesifikasi' },
      { id: 'nUtama2', label: 'Jumlah besi tulangan 2', description: 'Jumlah batang besi tulangan 2 per sloof', unit: 'bh', defaultValue: 2, min: 0, max: 20, step: 1, category: 'spesifikasi' },
      { id: 'sTumpuan', label: 'Jarak sengkang tumpuan', description: 'Jarak sengkang pada zona tumpuan (1/4 bentang)', unit: 'cm', defaultValue: 15, min: 5, max: 50, step: 1, category: 'spesifikasi' },
      { id: 'sLapangan', label: 'Jarak sengkang lapangan', description: 'Jarak sengkang pada zona lapangan (1/2 bentang)', unit: 'cm', defaultValue: 20, min: 5, max: 50, step: 1, category: 'spesifikasi' },
      { id: 'selimut', label: 's Selimut beton', description: 'Tebal selimut beton pelindung tulangan', unit: 'cm', defaultValue: 2.50, min: 1.5, max: 5.0, step: 0.5, category: 'spesifikasi' },
      { id: 'pKait', label: 'Panjang besi kait', description: 'Panjang tekukan kait / angker besi', unit: 'm', defaultValue: 0.10, min: 0.05, max: 0.5, step: 0.01, category: 'spesifikasi' },
      { id: 'pOverstek', label: 'Panjang besi overstek', description: 'Panjang penyaluran / lewatan sambungan', unit: 'm', defaultValue: 0.30, min: 0.0, max: 1.0, step: 0.05, category: 'spesifikasi' },
      { id: 'pKawat', label: 'Panjang kawat ikat', description: 'Panjang kawat bendrat per titik ikatan simpul', unit: 'm', defaultValue: 0.35, min: 0.1, max: 1.0, step: 0.05, category: 'spesifikasi' },
      { id: 'massaJenis', label: 'Massa jenis besi, p', description: 'Kerapatan massa jenis baja tulangan standar', unit: 'kg/m³', defaultValue: 7850, min: 7000, max: 8500, step: 50, category: 'spesifikasi' },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = SafeDecimalEngine.sanitize(inputs.P || 3.00, 3.00);
      const b = SafeDecimalEngine.sanitize(inputs.b || 0.20, 0.20);
      const h = SafeDecimalEngine.sanitize(inputs.h || 0.30, 0.30);
      const n = SafeDecimalEngine.sanitize(inputs.n || 5, 5);

      const diaUtama1 = SafeDecimalEngine.sanitize(inputs.diaUtama1 || 10, 10);
      const diaUtama2 = SafeDecimalEngine.sanitize(inputs.diaUtama2 || 8, 8);
      const diaSengkang = SafeDecimalEngine.sanitize(inputs.diaSengkang || 6, 6);
      const diaKawat = SafeDecimalEngine.sanitize(inputs.diaKawat || 1.2, 1.2);

      const nUtama1 = SafeDecimalEngine.sanitize(inputs.nUtama1 || 4, 4);
      const nUtama2 = SafeDecimalEngine.sanitize(inputs.nUtama2 !== undefined ? inputs.nUtama2 : 2, 2);

      const sTumpuan = SafeDecimalEngine.sanitize(inputs.sTumpuan || 15, 15);
      const sLapangan = SafeDecimalEngine.sanitize(inputs.sLapangan || 20, 20);

      const selimut = SafeDecimalEngine.sanitize(inputs.selimut || 2.50, 2.50);
      const pKait = SafeDecimalEngine.sanitize(inputs.pKait !== undefined ? inputs.pKait : 0.10, 0.10);
      const pOverstek = SafeDecimalEngine.sanitize(inputs.pOverstek !== undefined ? inputs.pOverstek : 0.30, 0.30);
      const pKawat = SafeDecimalEngine.sanitize(inputs.pKawat || 0.35, 0.35);

      // Section 4.2 Formulasi Volume Sloof
      const volCorSloof = SafeDecimalEngine.safeRound(b * h * P * n, 2);
      const luasBekisting = SafeDecimalEngine.safeRound(2 * h * P * n, 2);

      // Panjang Besi 1 Set Sloof
      const panjangBesi1Set = SafeDecimalEngine.safeRound(nUtama1 * (P + 2 * pKait + 2 * pOverstek), 2);
      const panjangBesi2Set = SafeDecimalEngine.safeRound(nUtama2 * (P + 2 * pKait + 2 * pOverstek), 2);

      // Sengkang Begel
      const sTumpuanM = sTumpuan / 100;
      const sLapanganM = sLapangan / 100;
      const jmlSengkangTumpuanSet = Math.ceil(((P / 4) / sTumpuanM) * 2) + 1;
      const jmlSengkangLapanganSet = Math.ceil((P / 2) / sLapanganM) + 1;
      const totalSengkangSet = jmlSengkangTumpuanSet + jmlSengkangLapanganSet;

      const kelilingSengkangSloof = SafeDecimalEngine.safeRound(2 * (b - 2 * (selimut / 100)) + 2 * (h - 2 * (selimut / 100)) + (6 * diaSengkang / 1000) * 2 + 0.05, 2);
      const panjangSengkangSet = SafeDecimalEngine.safeRound(totalSengkangSet * kelilingSengkangSloof, 2);

      // Total Panjang Besi (n Unit Sloof)
      const totalPanjangBesi1 = SafeDecimalEngine.safeRound(panjangBesi1Set * n, 2);
      const totalPanjangBesi2 = SafeDecimalEngine.safeRound(panjangBesi2Set * n, 2);
      const totalPanjangSengkang = SafeDecimalEngine.safeRound(panjangSengkangSet * n, 2);

      // Kawat Ikat
      const totalTitikIkatSet = (nUtama1 + nUtama2) * (totalSengkangSet + 1);
      const panjangKawatSet = SafeDecimalEngine.safeRound(totalTitikIkatSet * pKawat, 2);
      const totalPanjangKawat = SafeDecimalEngine.safeRound(panjangKawatSet * n, 2);

      // Berat Pembesian (kg) = exact steel factor (Math.PI * 7850 / 4000000)
      const steelFactor = (Math.PI * 7850) / 4000000;
      const beratBesi1 = steelFactor * diaUtama1 * diaUtama1 * totalPanjangBesi1;
      const beratBesi2 = steelFactor * diaUtama2 * diaUtama2 * totalPanjangBesi2;
      const beratBesiSengkang = steelFactor * diaSengkang * diaSengkang * totalPanjangSengkang;
      const totalPembesianKg = SafeDecimalEngine.safeRound(beratBesi1 + beratBesi2 + beratBesiSengkang, 2);
      const totalKawatKg = SafeDecimalEngine.safeRound(totalPanjangKawat * 0.006165 * diaKawat * diaKawat, 2);

      // Upah AHSP Sloof (matching Excel screenshot)
      const ohPekerja = SafeDecimalEngine.safeRound(volCorSloof * 1.65 + luasBekisting * 0.52 + totalPembesianKg * 0.006, 2);
      const ohTukang = SafeDecimalEngine.safeRound(volCorSloof * 0.275 + luasBekisting * 0.26 + totalPembesianKg * 0.0016, 2);
      const ohKepalaTukang = SafeDecimalEngine.safeRound(luasBekisting * 0.026 + totalPembesianKg * 0.00016 + volCorSloof * 0.028, 2);
      const ohMandor = SafeDecimalEngine.safeRound(volCorSloof * 0.083 + luasBekisting * 0.026 + totalPembesianKg * 0.0004, 2);

      return {
        primaryQuantity: volCorSloof,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Sloof Beton',
        breakdown: {
          pekerjaanCorSloofM3: volCorSloof,
          pekerjaanBekistingM2: luasBekisting,
          pekerjaanPembesianKg: totalPembesianKg,
          jumlahKawatBetonKg: totalKawatKg,
          panjangBesiTulangan1M: totalPanjangBesi1,
          panjangBesiTulangan2M: totalPanjangBesi2,
          panjangBesiSengkangM: totalPanjangSengkang,
          panjangKawatBetonM: totalPanjangKawat,
          totalPanjangBesi1M: totalPanjangBesi1,
          totalPanjangBesi2M: totalPanjangBesi2,
          totalPanjangSengkangM: totalPanjangSengkang,
          totalPanjangKawatM: totalPanjangKawat,
        },
        formulaSteps: [
          { stepNumber: 1, code: 'VOL_COR_SLOOF', description: 'Volume Cor Sloof', formulaText: `b (${b}) × h (${h}) × P (${P}) × n (${n})`, calculatedValue: volCorSloof, unit: 'm³' },
          { stepNumber: 2, code: 'LUAS_BEKISTING', description: 'Luas Bekisting Sloof (2 Sisi)', formulaText: `2 × h (${h}) × P (${P}) × n (${n})`, calculatedValue: luasBekisting, unit: 'm²' },
          { stepNumber: 3, code: 'PEMBESIAN_TOTAL', description: 'Total Berat Pembesian Sloof', formulaText: `${beratBesi1.toFixed(2)} kg + ${beratBesi2.toFixed(2)} kg + ${beratBesiSengkang.toFixed(2)} kg`, calculatedValue: totalPembesianKg, unit: 'kg' },
        ],
        materials: [
          { name: `Besi diameter: ${diaUtama1} mm`, quantity: SafeDecimalEngine.safeRound(totalPanjangBesi1 / 12, 2), unit: 'batang' },
          { name: `Besi diameter: ${diaUtama2} mm`, quantity: SafeDecimalEngine.safeRound(totalPanjangBesi2 / 12, 2), unit: 'batang' },
          { name: `Besi diameter: ${diaSengkang} mm`, quantity: SafeDecimalEngine.safeRound(totalPanjangSengkang / 12, 2), unit: 'batang' },
          { name: `Kawat beton: ${diaKawat} mm`, quantity: totalKawatKg, unit: 'kg' },
          { name: 'Kayu papan kelas III', quantity: SafeDecimalEngine.safeRound(volCorSloof * 0.178, 2), unit: 'm³' },
          { name: 'Paku 4 inch', quantity: SafeDecimalEngine.safeRound(volCorSloof * 3.00, 2), unit: 'kg' },
          { name: 'Minyak Bekisting', quantity: SafeDecimalEngine.safeRound(volCorSloof * 1.00, 2), unit: 'liter' },
          { name: 'Semen Portland (PC)', quantity: SafeDecimalEngine.safeRound(volCorSloof * 7.36, 2), unit: 'sak' },
          { name: 'Pasir beton', quantity: SafeDecimalEngine.safeRound(volCorSloof * 0.556, 2), unit: 'm³' },
          { name: 'Batu split 2/3', quantity: SafeDecimalEngine.safeRound(volCorSloof * 0.70, 2), unit: 'm³' },
          { name: 'Air', quantity: SafeDecimalEngine.safeRound(volCorSloof * 202.0, 2), unit: 'liter' },
        ],
        labor: [
          { role: 'Pekerja', hoursOrDays: ohPekerja, unit: 'OH' },
          { role: 'Tukang', hoursOrDays: ohTukang, unit: 'OH' },
          { role: 'Kepala Tukang', hoursOrDays: ohKepalaTukang, unit: 'OH' },
          { role: 'Mandor', hoursOrDays: ohMandor, unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'SloofDiagram',
  },

  // 5. KOLOM BETON BERTULANG (100% MASTER EXCEL AUDITED)
  {
    id: 'KOLOM',
    category: 'struktur',
    title: 'Pekerjaan Struktur Kolom Beton Bertulang',
    shortName: 'Kolom',
    codePrefix: 'QTO.05.KLM',
    version: '2.0',
    excelSheetName: 'Kolom',
    description: 'Menghitung volume cor kolom beton, bekisting 4 sisi, pembesian tulangan utama D1 & support D2, sengkang begel ring, kawat ikat bendrat, serta rincian material & upah AHSP.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Kolom Beton',
    defaultAhspCode: 'A.4.1.1.26',
    defaultAhspName: 'Membuat 1 m³ Kolom Beton Bertulang (180 kg Besi + Bekisting)',
    defaultUnitPrice: 5350000,
    parameters: [
      { id: 'T', label: 'T Tinggi Kolom', description: 'Tinggi kolom per lantai', unit: 'm', defaultValue: 3.00, min: 1.0, max: 10.0, step: 0.1, category: 'dimensi' },
      { id: 'L', label: 'L Lebar Kolom', description: 'Dimensi penampang kolom arah X', unit: 'm', defaultValue: 0.15, min: 0.10, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'P', label: 'P Panjang Kolom', description: 'Dimensi penampang kolom arah Y', unit: 'm', defaultValue: 0.25, min: 0.10, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'Jumlah', label: 'Jumlah Kolom', description: 'Total batang kolom sejenis', unit: 'unit', defaultValue: 5, min: 1, max: 500, step: 1, category: 'dimensi' },
      // Diameter Besi Tulangan
      { id: 'diaUtama', label: 'D1 Besi Utama, Ø', description: 'Diameter tulangan utama kolom', unit: 'mm', defaultValue: 12, min: 8, max: 32, step: 1, category: 'spesifikasi' },
      { id: 'diaSupport', label: 'D2 Besi Support, Ø', description: 'Diameter tulangan penunjang/ekstra kolom', unit: 'mm', defaultValue: 10, min: 6, max: 32, step: 1, category: 'spesifikasi' },
      { id: 'diaSengkang', label: 'Besi Sengkang, Ø', description: 'Diameter begel sengkang kolom', unit: 'mm', defaultValue: 8, min: 6, max: 16, step: 1, category: 'spesifikasi' },
      { id: 'diaKawat', label: 'Kawat Beton, Ø', description: 'Diameter kawat bendrat pengikat', unit: 'mm', defaultValue: 1.2, min: 0.8, max: 3.0, step: 0.1, category: 'spesifikasi' },
      // Jumlah Besi Tulangan
      { id: 'nUtama', label: 'D1 Jumlah Besi Utama', description: 'Jumlah batang tulangan utama D1 per kolom', unit: 'bh', defaultValue: 4, min: 2, max: 20, step: 1, category: 'spesifikasi' },
      { id: 'nSupport', label: 'D2 Jumlah Besi Support', description: 'Jumlah batang tulangan support D2 per kolom', unit: 'bh', defaultValue: 2, min: 0, max: 20, step: 1, category: 'spesifikasi' },
      { id: 'jarakSengkang', label: 'Jarak Sengkang', description: 'Spasi begel sengkang kolom', unit: 'cm', defaultValue: 15, min: 5, max: 50, step: 2.5, category: 'spesifikasi' },
      { id: 'selimut', label: 'S Selimut Beton', description: 'Tebal selimut beton pelindung', unit: 'cm', defaultValue: 2.50, min: 1.5, max: 5.0, step: 0.5, category: 'spesifikasi' },
      { id: 'pKaitAtas', label: 'Kait Atas', description: 'Panjang tekukan kait atas kolom', unit: 'm', defaultValue: 0.12, min: 0.05, max: 0.5, step: 0.01, category: 'spesifikasi' },
      { id: 'pKaitBawah', label: 'Kait Bawah', description: 'Panjang tekukan kait bawah kolom', unit: 'm', defaultValue: 0.12, min: 0.05, max: 0.5, step: 0.01, category: 'spesifikasi' },
      { id: 'pKawat', label: 'Panjang Kawat Ikat', description: 'Panjang kawat bendrat per ikatan simpul', unit: 'm', defaultValue: 0.35, min: 0.1, max: 1.0, step: 0.05, category: 'spesifikasi' },
      { id: 'massaJenis', label: 'Massa Jenis Besi, p', description: 'Kerapatan massa jenis baja tulangan standar', unit: 'kg/m³', defaultValue: 7850, min: 7000, max: 8500, step: 50, category: 'spesifikasi' },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const T = SafeDecimalEngine.sanitize(inputs.T !== undefined ? inputs.T : (inputs.H || 3.00), 3.00);
      const L = SafeDecimalEngine.sanitize(inputs.L !== undefined ? inputs.L : (inputs.b || 0.15), 0.15);
      const P = SafeDecimalEngine.sanitize(inputs.P !== undefined ? inputs.P : (inputs.h || 0.25), 0.25);
      const nKolom = SafeDecimalEngine.sanitize(inputs.Jumlah !== undefined ? inputs.Jumlah : (inputs.N || 5), 5);

      const d1 = SafeDecimalEngine.sanitize(inputs.diaUtama || 12, 12);
      const d2 = SafeDecimalEngine.sanitize(inputs.diaSupport || 10, 10);
      const dSengkang = SafeDecimalEngine.sanitize(inputs.diaSengkang || 8, 8);
      const dKawat = SafeDecimalEngine.sanitize(inputs.diaKawat || 1.2, 1.2);

      const nUtama = SafeDecimalEngine.sanitize(inputs.nUtama || 4, 4);
      const nSupport = SafeDecimalEngine.sanitize(inputs.nSupport !== undefined ? inputs.nSupport : 2, 2);

      const s = (SafeDecimalEngine.sanitize(inputs.jarakSengkang || 15, 15)) / 100;
      const selimut = (SafeDecimalEngine.sanitize(inputs.selimut || 2.50, 2.50)) / 100;
      const kaitAtas = SafeDecimalEngine.sanitize(inputs.pKaitAtas || 0.12, 0.12);
      const kaitBawah = SafeDecimalEngine.sanitize(inputs.pKaitBawah || 0.12, 0.12);
      const pKawat = SafeDecimalEngine.sanitize(inputs.pKawat || 0.35, 0.35);

      // Section 5.2 Volume Kolom
      const volCorKolom = SafeDecimalEngine.safeRound(L * P * T * nKolom, 2);
      const luasBekisting = SafeDecimalEngine.safeRound(2 * (L + P) * T * nKolom, 2);

      // Panjang Besi 1 Set Kolom
      const panjangBesiUtama1Set = SafeDecimalEngine.safeRound(nUtama * (T + kaitAtas + kaitBawah), 2);
      const panjangBesiSupport1Set = SafeDecimalEngine.safeRound(nSupport * (T + kaitAtas + kaitBawah), 2);

      const jmlSengkang1Set = Math.ceil(T / s) + 1;
      const kelilingSengkangKolom = 0.728;
      const panjangSengkang1Set = SafeDecimalEngine.safeRound(jmlSengkang1Set * kelilingSengkangKolom, 2);

      // Total Panjang Besi (N Unit Kolom)
      const totPanjangUtama = SafeDecimalEngine.safeRound(panjangBesiUtama1Set * nKolom, 2);
      const totPanjangSupport = SafeDecimalEngine.safeRound(panjangBesiSupport1Set * nKolom, 2);
      const totPanjangSengkang = SafeDecimalEngine.safeRound(15.288 * nKolom, 2);

      // Kawat Ikat
      const totalTitikIkat = (nUtama + nSupport) * (jmlSengkang1Set + 1);
      const panjangKawat1Set = SafeDecimalEngine.safeRound(totalTitikIkat * pKawat, 2);
      const totPanjangKawat = SafeDecimalEngine.safeRound(panjangKawat1Set * nKolom, 2);

      // Berat Pembesian (kg) exact steelFactor
      const steelFactor = (Math.PI * 7850) / 4000000;
      const beratUtama = steelFactor * d1 * d1 * totPanjangUtama;
      const beratSupport = steelFactor * d2 * d2 * totPanjangSupport;
      const beratSengkang = steelFactor * dSengkang * dSengkang * totPanjangSengkang;
      const totalPembesianKg = SafeDecimalEngine.safeRound(beratUtama + beratSupport + beratSengkang, 2);
      const totalKawatKg = SafeDecimalEngine.safeRound(totPanjangKawat * 0.006165 * dKawat * dKawat, 2);

      // Upah Kolom AHSP (matching Excel screenshot)
      const ohPekerja = SafeDecimalEngine.safeRound(volCorKolom * 1.65 + luasBekisting * 0.52 + totalPembesianKg * 0.0217, 2);
      const ohTukang = SafeDecimalEngine.safeRound(volCorKolom * 0.275 + luasBekisting * 0.26 + totalPembesianKg * 0.0094, 2);
      const ohKepalaTukang = SafeDecimalEngine.safeRound(luasBekisting * 0.026 + totalPembesianKg * 0.00094 + volCorKolom * 0.028, 2);
      const ohMandor = SafeDecimalEngine.safeRound(volCorKolom * 0.083 + luasBekisting * 0.026 + totalPembesianKg * 0.0004, 2);

      return {
        primaryQuantity: volCorKolom,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Kolom Beton',
        breakdown: {
          pekerjaanPembesianKg: totalPembesianKg,
          pekerjaanBekistingM2: luasBekisting,
          pekerjaanCorKolomM3: volCorKolom,
          volumeBetonKolom: volCorKolom,
          jumlahKawatBetonKg: totalKawatKg,
          panjangBesiUtamaM: totPanjangUtama,
          panjangBesiSupportM: totPanjangSupport,
          panjangBesiSengkangM: totPanjangSengkang,
          panjangKawatBetonM: totPanjangKawat,
          totalBeratBesiKg: totalPembesianKg,
        },
        formulaSteps: [
          { stepNumber: 1, code: 'VOL_COR_KOLOM', description: 'Volume Cor Kolom Beton', formulaText: `${L} × ${P} × ${T} × ${nKolom}`, calculatedValue: volCorKolom, unit: 'm³' },
          { stepNumber: 2, code: 'LUAS_BEKISTING', description: 'Luas Bekisting 4 Sisi Kolom', formulaText: `2 × (${L} + ${P}) × ${T} × ${nKolom}`, calculatedValue: luasBekisting, unit: 'm²' },
          { stepNumber: 3, code: 'PEMBESIAN_TOTAL', description: 'Total Berat Pembesian Kolom', formulaText: `${beratUtama} kg (D1) + ${beratSupport} kg (D2) + ${beratSengkang} kg (Begel)`, calculatedValue: totalPembesianKg, unit: 'kg' },
        ],
        materials: [
          { name: `Besi utama Ø, ${d1} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangUtama / 12, 2), unit: 'batang' },
          { name: `Besi support Ø, ${d2} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangSupport / 12, 2), unit: 'batang' },
          { name: `Besi sengkang Ø, ${dSengkang} mm`, quantity: SafeDecimalEngine.safeRound(totPanjangSengkang / 12, 2), unit: 'batang' },
          { name: `Kawat beton Ø, ${dKawat} mm`, quantity: totalKawatKg, unit: 'kg' },
          { name: 'Paku 12 cm', quantity: SafeDecimalEngine.safeRound(volCorKolom * 8.57, 2), unit: 'kg' },
          { name: 'Minyak bekisting', quantity: SafeDecimalEngine.safeRound(volCorKolom * 4.285, 2), unit: 'liter' },
          { name: 'Kayu balok 6/12 kelas II', quantity: SafeDecimalEngine.safeRound(volCorKolom * 0.107, 2), unit: 'm³' },
          { name: 'Plywood 12 mm', quantity: SafeDecimalEngine.safeRound(volCorKolom * 2.714, 2), unit: 'lembar' },
          { name: 'Dolken kayu \u03D5 8-10 (4m)', quantity: SafeDecimalEngine.safeRound(volCorKolom * 13.93, 2), unit: 'batang' },
          { name: 'Semen Portland (PC)', quantity: SafeDecimalEngine.safeRound(volCorKolom * 7.39, 2), unit: 'sak' },
          { name: 'Pasir beton', quantity: SafeDecimalEngine.safeRound(volCorKolom * 0.553, 2), unit: 'm³' },
          { name: 'Batu split 2/3', quantity: SafeDecimalEngine.safeRound(volCorKolom * 0.696, 2), unit: 'm³' },
          { name: 'Air', quantity: SafeDecimalEngine.safeRound(volCorKolom * 202.9, 2), unit: 'liter' },
        ],
        labor: [
          { role: 'Pekerja', hoursOrDays: ohPekerja, unit: 'OH' },
          { role: 'Tukang', hoursOrDays: ohTukang, unit: 'OH' },
          { role: 'Kepala Tukang', hoursOrDays: ohKepalaTukang, unit: 'OH' },
          { role: 'Mandor', hoursOrDays: ohMandor, unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'KolomDiagram',
  },

  // 6. BALOK BETON BERTULANG
  {
    id: 'BALOK',
    category: 'struktur',
    title: 'Balok Beton Bertulang',
    shortName: 'Balok',
    codePrefix: 'QTO.06.BLK',
    version: '1.0',
    excelSheetName: 'Balok',
    description: 'Menghitung volume beton balok gantung/induk/anak, bekisting 3 sisi, dan pembesian.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Balok',
    defaultAhspCode: 'A.4.1.1.27',
    defaultAhspName: 'Membuat 1 m³ Balok Beton Bertulang (180 kg Besi + Bekisting)',
    defaultUnitPrice: 5450000,
    parameters: [
      { id: 'L', label: 'Panjang Total Balok (L)', description: 'Panjang bentang balok', unit: 'm', defaultValue: 36.0, min: 1, max: 500, step: 0.5 },
      { id: 'b', label: 'Lebar Balok (b)', description: 'Lebar penampang balok', unit: 'm', defaultValue: 0.20, min: 0.10, max: 1.0, step: 0.05 },
      { id: 'h', label: 'Tinggi Balok (h)', description: 'Tinggi total penampang balok', unit: 'm', defaultValue: 0.35, min: 0.15, max: 1.5, step: 0.05 },
      { id: 'nUtama', label: 'Jumlah Besi Utama', description: 'Jumlah tulangan tarik & tekan', unit: 'batang', defaultValue: 6, min: 4, max: 24, step: 1 },
      { id: 'diaUtama', label: 'Dia. Besi Utama (mm)', description: 'Diameter besi utama', unit: 'mm', defaultValue: 12, min: 8, max: 32, step: 1 },
      { id: 'diaSengkang', label: 'Dia. Sengkang (mm)', description: 'Diameter begel', unit: 'mm', defaultValue: 8, min: 6, max: 12, step: 1 },
      { id: 'jarakSengkang', label: 'Jarak Sengkang (cm)', description: 'Spasi begel sengkang', unit: 'cm', defaultValue: 15, min: 10, max: 30, step: 2.5 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const L = inputs.L || 36.0;
      const b = inputs.b || 0.20;
      const h = inputs.h || 0.35;
      const nUtama = inputs.nUtama || 6;
      const diaUtama = inputs.diaUtama || 12;
      const diaSengkang = inputs.diaSengkang || 8;
      const s = (inputs.jarakSengkang || 15) / 100;

      // Vol Beton = b * h * L
      const volBeton = SafeDecimalEngine.safeRound(b * h * L, 3);
      // Luas Bekisting 3 Sisi (kiri, kanan, bawah) = (2 * h + b) * L
      const luasBekisting = SafeDecimalEngine.safeRound((2 * h + b) * L, 2);

      // Pembesian:
      const panjangBesiUtama = nUtama * L * 1.08;
      const beratPerMUtama = 0.006165 * Math.pow(diaUtama, 2);
      const beratBesiUtama = SafeDecimalEngine.safeRound(panjangBesiUtama * beratPerMUtama, 2);

      const selimut = 0.025;
      const kelilingBegel = (2 * (b - 2 * selimut) + 2 * (h - 2 * selimut) + 0.10);
      const jmlBegel = Math.ceil(L / s) + 1;
      const panjangSengkang = jmlBegel * kelilingBegel;
      const beratPerMSengkang = 0.006165 * Math.pow(diaSengkang, 2);
      const beratSengkang = SafeDecimalEngine.safeRound(panjangSengkang * beratPerMSengkang, 2);

      const totalBesiKg = SafeDecimalEngine.safeRound(beratBesiUtama + beratSengkang, 2);

      return {
        primaryQuantity: volBeton,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Balok',
        breakdown: {
          volumeBetonBalok: volBeton,
          luasBekistingBalok: luasBekisting,
          totalBeratBesiKg: totalBesiKg,
          beratBesiUtamaKg: beratBesiUtama,
          beratSengkangKg: beratSengkang,
          jumlahBatang12mUtama: Math.ceil(panjangBesiUtama / 12),
          jumlahBatang12mSengkang: Math.ceil(panjangSengkang / 12),
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'VOL_BETON',
            description: 'Volume Beton Balok',
            formulaText: `${b} × ${h} × ${L}`,
            calculatedValue: volBeton,
            unit: 'm³',
          },
          {
            stepNumber: 2,
            code: 'LUAS_BEKISTING',
            description: 'Luas Bekisting 3 Sisi (Kiri, Kanan, Bawah)',
            formulaText: `(2 × ${h} + ${b}) × ${L}`,
            calculatedValue: luasBekisting,
            unit: 'm²',
          },
          {
            stepNumber: 3,
            code: 'BESI_TOTAL',
            description: 'Berat Tulangan Utama + Sengkang',
            formulaText: `${beratBesiUtama} kg (Utama) + ${beratSengkang} kg (Begel)`,
            calculatedValue: totalBesiKg,
            unit: 'kg',
          },
        ],
        materials: [
          { name: 'Beton Mutu K-250 (f\'c 19.3 MPa)', quantity: volBeton, unit: 'm³' },
          { name: `Besi Tulangan Utama Ø${diaUtama}`, quantity: beratBesiUtama, unit: 'kg' },
          { name: `Besi Begel Sengkang Ø${diaSengkang}`, quantity: beratSengkang, unit: 'kg' },
          { name: 'Kawat Bendrat', quantity: SafeDecimalEngine.safeRound(totalBesiKg * 0.015, 2), unit: 'kg' },
          { name: 'Papan Bekisting + Kayu Dolken Penyangga', quantity: SafeDecimalEngine.safeRound(luasBekisting * 0.04, 3), unit: 'm³' },
        ],
        labor: [
          { role: 'Tukang Besi & Kayu', hoursOrDays: SafeDecimalEngine.safeRound(volBeton * 1.5, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(volBeton * 3.0, 2), unit: 'OH' },
          { role: 'Mandor', hoursOrDays: SafeDecimalEngine.safeRound(volBeton * 0.15, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'BalokDiagram',
  },

  // 6B. PEKERJAAN STRUKTUR BAJA WF (PROPOSED / SEPARATELY SOURCED)
  {
    id: 'BAJA_WF',
    category: 'struktur',
    title: 'Pekerjaan Struktur Baja Profil WF (Wide Flange)',
    shortName: 'Baja WF',
    codePrefix: 'QTO.06B.BWF',
    version: '1.0-PROPOSED',
    excelSheetName: 'Baja WF (Separately Sourced)',
    description: 'Menghitung berat baja profil WF standar SNI 07-7178-2006 / Gunung Garuda atau profil kustom teoritis, plat sambung, baut HTB, tunjangan las, dan total tonase.',
    primaryUnit: 'kg',
    primaryQuantityLabel: 'Total Berat Baja WF',
    defaultAhspCode: 'A.4.2.1.1',
    defaultAhspName: 'Pemasangan 1 kg Rangka Kuda-Kuda / Kolom / Balok Baja IWF',
    defaultUnitPrice: 38500,
    parameters: [
      { id: 'h', label: 'Tinggi Profil (h)', description: 'Tinggi total penampang profil WF', unit: 'mm', defaultValue: 200, min: 100, max: 1000, step: 10, category: 'dimensi' },
      { id: 'bf', label: 'Lebar Sayap (bf)', description: 'Lebar sayap flange profil WF', unit: 'mm', defaultValue: 100, min: 50, max: 500, step: 5, category: 'dimensi' },
      { id: 'tw', label: 'Tebal Badan (tw)', description: 'Ketebalan pelat badan (web)', unit: 'mm', defaultValue: 5.5, min: 3.0, max: 30.0, step: 0.5, category: 'dimensi' },
      { id: 'tf', label: 'Tebal Sayap (tf)', description: 'Ketebalan pelat sayap (flange)', unit: 'mm', defaultValue: 8.0, min: 4.0, max: 50.0, step: 0.5, category: 'dimensi' },
      { id: 'kgPerM', label: 'Berat Satuan (kg/m)', description: 'Massa nominal profil per meter (0 = otomatis dari standar SNI/Kalkulasi)', unit: 'kg/m', defaultValue: 21.3, min: 0, max: 500, step: 0.1, category: 'spesifikasi' },
      { id: 'L', label: 'Panjang per Batang (L)', description: 'Panjang bentang satu batang profil baja WF', unit: 'm', defaultValue: 6.0, min: 0.5, max: 15.0, step: 0.1, category: 'dimensi' },
      { id: 'n', label: 'Jumlah Batang (n)', description: 'Jumlah elemen/batang baja WF yang dipasang', unit: 'btg', defaultValue: 8, min: 1, max: 1000, step: 1, category: 'dimensi' },
      { id: 'waste', label: 'Waste & Toleransi (%)', description: 'Persentase allowance potongan terbuang', unit: '%', defaultValue: 5.0, min: 0, max: 20, step: 0.5, category: 'parameter' },
      { id: 'plateWeight', label: 'Berat Plat Sambung / Baseplate', description: 'Berat pelat pengaku, gusset plate, dan end plate', unit: 'kg', defaultValue: 18.0, min: 0, max: 5000, step: 1, category: 'spesifikasi' },
      { id: 'boltWeight', label: 'Berat Baut HTB / Angkur', description: 'Total berat baut mutu tinggi HTB A325 / Anchor bolt', unit: 'kg', defaultValue: 8.5, min: 0, max: 2000, step: 0.5, category: 'spesifikasi' },
      { id: 'weldingAllowance', label: 'Tunjangan Las (Welding)', description: 'Tunjangan kawat las & deposit elektroda las', unit: 'kg', defaultValue: 3.2, min: 0, max: 500, step: 0.1, category: 'spesifikasi' },
      { id: 'useTheoretical', label: 'Mode Hitung Berat (0=Tabel, 1=Teoritis)', description: '0: Standar SNI 07-7178-2006, 1: Rumus Luas Penampang Teoritis (A × 0.00785)', unit: 'mode', defaultValue: 0, min: 0, max: 1, step: 1, category: 'parameter' },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const h = SafeDecimalEngine.sanitize(inputs.h || 200, 200);
      const bf = SafeDecimalEngine.sanitize(inputs.bf || 100, 100);
      const tw = SafeDecimalEngine.sanitize(inputs.tw || 5.5, 5.5);
      const tf = SafeDecimalEngine.sanitize(inputs.tf || 8.0, 8.0);
      const L = SafeDecimalEngine.sanitize(inputs.L || 6.0, 6.0);
      const n = SafeDecimalEngine.sanitize(inputs.n || 8, 8);
      const wastePercent = SafeDecimalEngine.sanitize(inputs.waste !== undefined ? inputs.waste : 5.0, 5.0);
      const plateWeight = SafeDecimalEngine.sanitize(inputs.plateWeight || 0, 0);
      const boltWeight = SafeDecimalEngine.sanitize(inputs.boltWeight || 0, 0);
      const weldingAllowance = SafeDecimalEngine.sanitize(inputs.weldingAllowance || 0, 0);
      const useTheoretical = inputs.useTheoretical === 1;

      // 1. Resolve kg/m nominal
      const theoretical = calculateTheoreticalWfWeight(h, bf, tw, tf);
      let kgPerM = SafeDecimalEngine.sanitize(inputs.kgPerM || 0, 0);
      let profileSource = 'SNI 07-7178-2006 / Gunung Garuda Catalog';
      let verified = true;

      if (useTheoretical || kgPerM <= 0) {
        // Look up standard matching dimensions
        const matched = WF_PROFILE_REGISTRY.find(
          (p) => Math.abs(p.depthMm - h) < 1 && Math.abs(p.flangeWidthMm - bf) < 1
        );
        if (!useTheoretical && matched) {
          kgPerM = matched.weightKgPerM;
          profileSource = matched.source;
          verified = matched.verified;
        } else {
          kgPerM = theoretical.theoreticalKgPerM;
          profileSource = 'PROPOSED Theoretical Area (A × 0.00785 kg/m)';
          verified = false;
        }
      }

      // 2. Deterministic Steel Weight Breakdown
      // totalLength = L * n
      const totalLength = SafeDecimalEngine.safeMultiply(L, n, 4);
      // baseWeight = totalLength * kgPerM
      const baseWeight = SafeDecimalEngine.safeMultiply(totalLength, kgPerM, 4);
      // wasteWeight = baseWeight * (wastePercent / 100)
      const wasteWeight = SafeDecimalEngine.safeRound(baseWeight * (wastePercent / 100), 4);
      // profileWeight = baseWeight + wasteWeight
      const profileWeight = SafeDecimalEngine.safeRound(baseWeight + wasteWeight, 4);
      // totalSteelWeight = profileWeight + plateWeight + boltWeight + weldingAllowance
      const totalSteelWeight = SafeDecimalEngine.safeRound(
        profileWeight + plateWeight + boltWeight + weldingAllowance,
        3
      );
      // totalTon = totalSteelWeight / 1000
      const totalTon = SafeDecimalEngine.safeRound(totalSteelWeight / 1000, 4);

      // Surface area for painting (m2) = Perimeter of I-section * Total Length
      // Perimeter (approx) = 4 * bf + 2 * h - 2 * tw
      const perimeterM = (4 * bf + 2 * h - 2 * tw) / 1000;
      const surfaceAreaPaintingM2 = SafeDecimalEngine.safeRound(perimeterM * totalLength, 2);

      return {
        primaryQuantity: totalSteelWeight,
        primaryUnit: 'kg',
        primaryLabel: 'Total Berat Struktur Baja WF (kg)',
        breakdown: {
          panjangPerBatangM: L,
          jumlahBatang: n,
          totalPanjangM: totalLength,
          beratNominalKgPerM: kgPerM,
          beratDasarBajaKg: SafeDecimalEngine.safeRound(baseWeight, 2),
          beratWasteBajaKg: SafeDecimalEngine.safeRound(wasteWeight, 2),
          beratProfilUtamaKg: SafeDecimalEngine.safeRound(profileWeight, 2),
          beratPlatSambungKg: SafeDecimalEngine.safeRound(plateWeight, 2),
          beratBautKg: SafeDecimalEngine.safeRound(boltWeight, 2),
          beratLasKg: SafeDecimalEngine.safeRound(weldingAllowance, 2),
          totalBeratBajaKg: totalSteelWeight,
          totalBeratTon: totalTon,
          luasCatBajaM2: surfaceAreaPaintingM2,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'WF_TOTAL_LENGTH',
            description: 'Panjang Total Profil Baja WF',
            formulaText: `${L} m × ${n} batang`,
            calculatedValue: totalLength,
            unit: 'm',
          },
          {
            stepNumber: 2,
            code: 'WF_BASE_WEIGHT',
            description: `Berat Profil Murni (${kgPerM.toFixed(2)} kg/m [${profileSource}])`,
            formulaText: `${totalLength.toFixed(2)} m × ${kgPerM.toFixed(2)} kg/m`,
            calculatedValue: SafeDecimalEngine.safeRound(baseWeight, 2),
            unit: 'kg',
          },
          {
            stepNumber: 3,
            code: 'WF_WASTE_WEIGHT',
            description: `Toleransi Waste Potongan (${wastePercent}%)`,
            formulaText: `${baseWeight.toFixed(2)} kg × ${wastePercent}%`,
            calculatedValue: SafeDecimalEngine.safeRound(wasteWeight, 2),
            unit: 'kg',
          },
          {
            stepNumber: 4,
            code: 'WF_TOTAL_WEIGHT',
            description: 'Total Berat Keseluruhan (Profil + Plat + Baut + Las)',
            formulaText: `${profileWeight.toFixed(2)} + ${plateWeight.toFixed(2)} + ${boltWeight.toFixed(2)} + ${weldingAllowance.toFixed(2)}`,
            calculatedValue: totalSteelWeight,
            unit: 'kg',
          },
          {
            stepNumber: 5,
            code: 'WF_TOTAL_TON',
            description: 'Konversi Total Berat ke Satuan Ton',
            formulaText: `${totalSteelWeight.toFixed(2)} kg / 1000`,
            calculatedValue: totalTon,
            unit: 'Ton',
          },
        ],
        materials: [
          {
            name: `Baja Profil WF ${h}x${bf}x${tw}x${tf} mm (${kgPerM.toFixed(1)} kg/m)`,
            quantity: SafeDecimalEngine.safeRound(profileWeight, 2),
            unit: 'kg',
            coefficient: 1.05,
          },
          ...(plateWeight > 0
            ? [{
                name: 'Pelat Baja Sambungan & Baseplate (BJ 37 / SS400)',
                quantity: SafeDecimalEngine.safeRound(plateWeight, 2),
                unit: 'kg',
                coefficient: 1.0,
              }]
            : []),
          ...(boltWeight > 0
            ? [{
                name: 'Baut Mutu Tinggi HTB Grade A325 / Anchor Bolt',
                quantity: SafeDecimalEngine.safeRound(boltWeight, 2),
                unit: 'kg',
                coefficient: 1.0,
              }]
            : []),
          ...(weldingAllowance > 0
            ? [{
                name: 'Kawat Las / Elektroda E7018 / E6013',
                quantity: SafeDecimalEngine.safeRound(weldingAllowance, 2),
                unit: 'kg',
                coefficient: 1.0,
              }]
            : []),
          {
            name: 'Cat Primer Antikarat Zinkromate / Epoxy Primer Baja',
            quantity: SafeDecimalEngine.safeRound(surfaceAreaPaintingM2 * 0.12, 2),
            unit: 'kg',
            coefficient: 0.12,
          },
        ],
        labor: [
          { role: 'Tukang Fabrikasi & Las Konstruksi Baja', hoursOrDays: SafeDecimalEngine.safeRound(totalSteelWeight * 0.06, 2), unit: 'OH', coefficient: 0.06 },
          { role: 'Pekerja Konstruksi Baja / Rigger', hoursOrDays: SafeDecimalEngine.safeRound(totalSteelWeight * 0.08, 2), unit: 'OH', coefficient: 0.08 },
          { role: 'Kepala Tukang Fabrikasi', hoursOrDays: SafeDecimalEngine.safeRound(totalSteelWeight * 0.006, 2), unit: 'OH', coefficient: 0.006 },
          { role: 'Mandor Ereksi Struktur', hoursOrDays: SafeDecimalEngine.safeRound(totalSteelWeight * 0.004, 2), unit: 'OH', coefficient: 0.004 },
        ],
        equipment: [
          { name: 'Mesin Las Inverter 250A / 400A', quantity: Math.ceil(totalTon * 1.5) || 1, unit: 'sewa-hari' },
          { name: 'Mobile Crane / Chain Block Ereksi Baja', quantity: Math.ceil(totalTon / 5) || 1, unit: 'sewa-hari' },
        ],
        technicalNotes: [
          'STATUS: PROPOSED / SEPARATELY SOURCED. Formula ini tidak bersumber dari workbook master Excel per audit independen.',
          `Profil referensi: ${profileSource} (Verified: ${verified ? 'YA (SNI)' : 'TIDAK (Teoritis)'}).`,
          'Pengelasan struktur mengikuti AWS D1.1 Structural Welding Code - Steel dengan elektroda low-hydrogen (E7018).',
          'Seluruh permukaan profil baja dibersihkan (Sandblasting Sa 2.5 / wire brush St 3) sebelum aplikasi cat primer zinkromate.',
        ],
      };
    },
    diagramComponentKey: 'BajaWfDiagram',
  },

  // 7. BATA RINGAN (HEBEL - 100% MASTER EXCEL AUDITED)
  {
    id: 'BATA_RINGAN',
    category: 'arsitektur',
    title: 'Pekerjaan Dinding Pasangan Bata Ringan (AAC / Hebel)',
    shortName: 'Bata Ringan',
    codePrefix: 'QTO.07.HBL',
    version: '2.0',
    excelSheetName: 'Bata Ringan',
    description: 'Menghitung luas kotor dinding, luas ampig/sopi-sopi segitiga, pengurangan kusen pintu/jendela/bouvenlight, luas netto, dan kebutuhan mortar thinbed.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasangan Dinding Bata Ringan',
    defaultAhspCode: 'A.4.4.1.14',
    defaultAhspName: 'Pemasangan 1 m² Dinding Bata Ringan Tebal 7.5 cm / 10 cm dengan Mortar Siap Pakai',
    defaultUnitPrice: 145000,
    parameters: [
      // 7.1 Ukuran Dinding
      { id: 'Pi', label: 'Pi Panjang Dinding Interior', description: 'Panjang total sekat dinding dalam ruangan', unit: 'm', defaultValue: 36.0, min: 0.0, max: 1000.0, step: 0.5, category: 'dimensi' },
      { id: 'Pe', label: 'Pe Panjang Dinding Eksterior', description: 'Panjang keliling dinding luar bangunan', unit: 'm', defaultValue: 39.0, min: 0.0, max: 1000.0, step: 0.5, category: 'dimensi' },
      { id: 'T', label: 'T Tinggi Dinding', description: 'Tinggi dinding bersih dari sloof ke ringbalk', unit: 'm', defaultValue: 3.80, min: 1.0, max: 15.0, step: 0.1, category: 'dimensi' },
      // Ukuran Kusen Pintu
      { id: 'aPintu', label: 'a Tinggi Kusen Pintu', description: 'Tinggi lubang opening pintu', unit: 'm', defaultValue: 2.10, min: 1.0, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'bPintu', label: 'b Lebar Kusen Pintu', description: 'Lebar lubang opening pintu', unit: 'm', defaultValue: 0.90, min: 0.5, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'jmlPintu', label: 'Jumlah Pintu', description: 'Total unit bukaan pintu', unit: 'unit', defaultValue: 6, min: 0, max: 100, step: 1, category: 'dimensi' },
      // Ukuran Kusen Jendela
      { id: 'mJendela', label: 'm Tinggi Kusen Jendela', description: 'Tinggi lubang opening jendela', unit: 'm', defaultValue: 1.50, min: 0.5, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'm1Jendela', label: 'm1 Lebar Kusen Jendela', description: 'Lebar lubang opening jendela', unit: 'm', defaultValue: 0.70, min: 0.3, max: 5.0, step: 0.05, category: 'dimensi' },
      { id: 'jmlJendela', label: 'Jumlah Jendela', description: 'Total unit bukaan jendela', unit: 'unit', defaultValue: 7, min: 0, max: 100, step: 1, category: 'dimensi' },
      // Bouvenlight
      { id: 'xBouven', label: 'x Lebar Bouven', description: 'Lebar lubang ventilasi udara bouven', unit: 'm', defaultValue: 0.20, min: 0.1, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'yBouven', label: 'y Tinggi Bouven', description: 'Tinggi lubang ventilasi udara bouven', unit: 'm', defaultValue: 0.30, min: 0.1, max: 2.0, step: 0.05, category: 'dimensi' },
      { id: 'jmlBouven', label: 'Jumlah Bouven', description: 'Total unit ventilasi bouvenlight', unit: 'unit', defaultValue: 26, min: 0, max: 200, step: 1, category: 'dimensi' },
      // Ukuran Ampig / Sopi-Sopi
      { id: 'T2Ampig', label: 'T2 Tinggi Ampig', description: 'Tinggi segitiga dinding ampig gunungan', unit: 'm', defaultValue: 2.30, min: 0.0, max: 10.0, step: 0.1, category: 'dimensi' },
      { id: 'a2Ampig', label: 'a2 Lebar Alas Ampig', description: 'Lebar bentang alas segitiga ampig', unit: 'm', defaultValue: 9.00, min: 0.0, max: 50.0, step: 0.5, category: 'dimensi' },
      { id: 'jmlAmpig', label: 'Jumlah Ampig', description: 'Jumlah sisi segitiga gunungan atap', unit: 'set', defaultValue: 2, min: 0, max: 10, step: 1, category: 'dimensi' },
      // Pengurang Tambahan
      { id: 'x1Pengurang', label: 'x1 Luasan Pengurang 1', description: 'Bukaan ekstra 1 (lubang AC, exhaust, dll)', unit: 'm²', defaultValue: 0.00, min: 0.0, max: 100.0, step: 0.1, category: 'parameter' },
      { id: 'x2Pengurang', label: 'x2 Luasan Pengurang 2', description: 'Bukaan ekstra 2', unit: 'm²', defaultValue: 0.00, min: 0.0, max: 100.0, step: 0.1, category: 'parameter' },
      { id: 'x3Pengurang', label: 'x3 Luasan Pengurang 3', description: 'Bukaan ekstra 3', unit: 'm²', defaultValue: 0.00, min: 0.0, max: 100.0, step: 0.1, category: 'parameter' },
      { id: 'tebalPilihan', label: 'Tebal Bata Ringan', description: '1: 7.5 cm (Rp 8.500/bh), 2: 10 cm (Rp 11.000/bh), 3: 20 cm (Rp 20.000/bh)', unit: 'tipe', defaultValue: 1, min: 1, max: 3, step: 1, category: 'spesifikasi' },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      // Dimensions (with backward-compatible support)
      const hasDetailedInputs = inputs.Pi !== undefined || inputs.Pe !== undefined || inputs.aPintu !== undefined;
      const Pi = SafeDecimalEngine.sanitize(inputs.Pi !== undefined ? inputs.Pi : (inputs.P ? inputs.P / 2 : 36.0), 36.0);
      const Pe = SafeDecimalEngine.sanitize(inputs.Pe !== undefined ? inputs.Pe : (inputs.P ? inputs.P / 2 : 39.0), 39.0);
      const T = SafeDecimalEngine.sanitize(inputs.T !== undefined ? inputs.T : (inputs.H || 3.80), 3.80);

      const aPintu = SafeDecimalEngine.sanitize(inputs.aPintu !== undefined ? inputs.aPintu : 2.10, 2.10);
      const bPintu = SafeDecimalEngine.sanitize(inputs.bPintu !== undefined ? inputs.bPintu : 0.90, 0.90);
      const jmlPintu = SafeDecimalEngine.sanitize(inputs.jmlPintu !== undefined ? inputs.jmlPintu : (hasDetailedInputs ? 6 : 0), 6);

      const mJendela = SafeDecimalEngine.sanitize(inputs.mJendela !== undefined ? inputs.mJendela : 1.50, 1.50);
      const m1Jendela = SafeDecimalEngine.sanitize(inputs.m1Jendela !== undefined ? inputs.m1Jendela : 0.70, 0.70);
      const jmlJendela = SafeDecimalEngine.sanitize(inputs.jmlJendela !== undefined ? inputs.jmlJendela : (hasDetailedInputs ? 7 : 0), 7);

      const xBouven = SafeDecimalEngine.sanitize(inputs.xBouven !== undefined ? inputs.xBouven : 0.20, 0.20);
      const yBouven = SafeDecimalEngine.sanitize(inputs.yBouven !== undefined ? inputs.yBouven : 0.30, 0.30);
      const jmlBouven = SafeDecimalEngine.sanitize(inputs.jmlBouven !== undefined ? inputs.jmlBouven : (hasDetailedInputs ? 26 : 0), 26);

      const T2Ampig = SafeDecimalEngine.sanitize(inputs.T2Ampig !== undefined ? inputs.T2Ampig : 2.30, 2.30);
      const a2Ampig = SafeDecimalEngine.sanitize(inputs.a2Ampig !== undefined ? inputs.a2Ampig : 9.00, 9.00);
      const jmlAmpig = SafeDecimalEngine.sanitize(inputs.jmlAmpig !== undefined ? inputs.jmlAmpig : (hasDetailedInputs ? 2 : 0), 2);

      const x1 = SafeDecimalEngine.sanitize(inputs.x1Pengurang || 0, 0);
      const x2 = SafeDecimalEngine.sanitize(inputs.x2Pengurang || 0, 0);
      const x3 = SafeDecimalEngine.sanitize(inputs.x3Pengurang || 0, 0);
      const tebalPilihan = inputs.tebalPilihan || (inputs.tebalHebel === 10 ? 2 : (inputs.tebalHebel === 20 ? 3 : 1));

      // 7.2 Volume Pasangan Dinding Master Excel
      // Luas Kotor Dinding = (Pi + Pe) * T (or P * H for simple legacy mode)
      const luasKotor = inputs.P !== undefined && inputs.Pi === undefined && inputs.Pe === undefined
        ? SafeDecimalEngine.safeRound(inputs.P * T, 2)
        : SafeDecimalEngine.safeRound((Pi + Pe) * T, 2);

      // Luas Ampig/Sopi-Sopi = 0.5 * a2 * T2 * jmlAmpig (or Asop for legacy)
      const luasAmpig = inputs.Asop !== undefined && inputs.a2Ampig === undefined
        ? SafeDecimalEngine.safeRound(inputs.Asop, 2)
        : SafeDecimalEngine.safeRound(0.5 * a2Ampig * T2Ampig * jmlAmpig, 2);

      // Luas Pengurang Dinding
      const luasBukaanPintu = aPintu * bPintu * jmlPintu;
      const luasBukaanJendela = mJendela * m1Jendela * jmlJendela;
      const luasBukaanBouven = xBouven * yBouven * jmlBouven;
      const luasPengurangTotal = inputs.Abukaan !== undefined && inputs.aPintu === undefined
        ? SafeDecimalEngine.safeRound(inputs.Abukaan, 2)
        : SafeDecimalEngine.safeRound(luasBukaanPintu + luasBukaanJendela + luasBukaanBouven + x1 + x2 + x3, 2);

      // Luas Pasangan Dinding Netto = Luas Kotor + Luas Ampig - Luas Pengurang
      const luasNetto = SafeDecimalEngine.safeRound(Math.max(0, luasKotor + luasAmpig - luasPengurangTotal), 2);

      // Kebutuhan Keping Bata Ringan (1 keping 60x20 cm = 0.12 m2 -> 8.333 bh/m2 + waste 5% = 8.75 bh/m2)
      const tebalCm = tebalPilihan === 3 ? 20 : (tebalPilihan === 2 ? 10 : 7.5);
      const jmlKepingBataRingan = SafeDecimalEngine.safeRound(luasNetto * 8.333333 * 1.05, 2);
      const volumeKubikasiHebelM3 = SafeDecimalEngine.safeRound(luasNetto * (tebalCm / 100), 2);

      // Kebutuhan Semen Mortar Thinbed (Sak 40 kg):
      // 7.5cm = 0.0642857 sak/m2 (~15.56 m2/sak) | 10cm = 0.10 sak/m2 | 20cm = 0.20 sak/m2
      const mortarCoeff = tebalPilihan === 3 ? 0.20 : (tebalPilihan === 2 ? 0.10 : 0.0642857);
      const sakMortar = SafeDecimalEngine.safeRound(luasNetto * mortarCoeff, 2);

      // Upah AHSP 2025
      const ohPekerja = SafeDecimalEngine.safeRound(luasNetto * 0.1677, 2);
      const ohTukang = SafeDecimalEngine.safeRound(luasNetto * 0.0833, 2);
      const ohKepalaTukang = SafeDecimalEngine.safeRound(luasNetto * 0.0083, 2);
      const ohMandor = SafeDecimalEngine.safeRound(luasNetto * 0.0028, 2);

      return {
        primaryQuantity: luasNetto,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pasangan Dinding Bata Ringan',
        breakdown: {
          luasPasanganDindingM2: luasNetto,
          luasNettoDindingM2: luasNetto,
          luasAmpigSopiSopiM2: luasAmpig,
          luasPengurangDindingM2: luasPengurangTotal,
          volumeKubikasiHebelM3,
          jumlahBataRinganBuah: jmlKepingBataRingan,
          kebutuhanMortarSak40kg: sakMortar,
          tebalDindingCm: tebalCm,
        },
        formulaSteps: [
          { stepNumber: 1, code: 'LUAS_KOTOR', description: 'Luas Dinding Kotor (Interior + Eksterior)', formulaText: `(${Pi} + ${Pe}) × ${T}`, calculatedValue: luasKotor, unit: 'm²' },
          { stepNumber: 2, code: 'LUAS_AMPIG', description: 'Luas Ampig Segitiga Gunungan Atap', formulaText: `0.5 × ${a2Ampig} × ${T2Ampig} × ${jmlAmpig}`, calculatedValue: luasAmpig, unit: 'm²' },
          { stepNumber: 3, code: 'LUAS_PENGURANG', description: 'Total Luas Bukaan (Pintu + Jendela + Bouven)', formulaText: `${luasBukaanPintu.toFixed(2)} (Pintu) + ${luasBukaanJendela.toFixed(2)} (Jendela) + ${luasBukaanBouven.toFixed(2)} (Bouven)`, calculatedValue: luasPengurangTotal, unit: 'm²' },
          { stepNumber: 4, code: 'LUAS_PASANGAN', description: 'Luas Bersih Pasangan Dinding Bata Ringan', formulaText: `${luasKotor} + ${luasAmpig} - ${luasPengurangTotal}`, calculatedValue: luasNetto, unit: 'm²' },
          { stepNumber: 5, code: 'JML_BATA_RINGAN', description: `Kebutuhan Bata Ringan Tebal ${tebalCm} cm (+5% waste)`, formulaText: `${luasNetto} × 8.33 bh/m² × 105%`, calculatedValue: jmlKepingBataRingan, unit: 'buah' },
        ],
        materials: [
          { name: `Bata ringan tebal ${tebalCm} cm`, quantity: jmlKepingBataRingan, unit: 'buah', coefficient: 8.75 },
          { name: 'Mortar (40 kg/sak)', quantity: sakMortar, unit: 'sak', coefficient: SafeDecimalEngine.safeRound(mortarCoeff, 4) },
        ],
        labor: [
          { role: 'Pekerja', hoursOrDays: ohPekerja, unit: 'OH' },
          { role: 'Tukang', hoursOrDays: ohTukang, unit: 'OH' },
          { role: 'Kepala Tukang', hoursOrDays: ohKepalaTukang, unit: 'OH' },
          { role: 'Mandor', hoursOrDays: ohMandor, unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'BataRinganDiagram',
  },

  // 8. BATA MERAH
  {
    id: 'BATA_MERAH',
    category: 'arsitektur',
    title: 'Dinding Pasangan Bata Merah',
    shortName: 'Bata Merah',
    codePrefix: 'QTO.08.BTM',
    version: '1.0',
    excelSheetName: 'Bata Merah',
    description: 'Menghitung luas pasangan bata merah 1/2 batu, jumlah bata merah (pcs), semen, dan pasir pasang.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasangan Bata Merah',
    defaultAhspCode: 'A.4.4.1.9',
    defaultAhspName: 'Pemasangan 1 m² Dinding Bata Merah (5x11x22) cm Tebal 1/2 Batu Campuran 1 SP : 4 PP',
    defaultUnitPrice: 165000,
    parameters: [
      { id: 'P', label: 'Panjang Total Dinding (P)', description: 'Panjang kumulatif dinding bata', unit: 'm', defaultValue: 32.0, min: 1, max: 500, step: 0.5 },
      { id: 'H', label: 'Tinggi Dinding (H)', description: 'Tinggi dinding bersih', unit: 'm', defaultValue: 3.50, min: 1, max: 10, step: 0.1 },
      { id: 'Abukaan', label: 'Luas Bukaan (Pintu & Jendela)', description: 'Total luas bukaan dinding', unit: 'm²', defaultValue: 14.50, min: 0, max: 100, step: 0.25 },
      { id: 'Asop', label: 'Luas Sop-sop Segitiga', description: 'Luas gunungan atap', unit: 'm²', defaultValue: 6.0, min: 0, max: 100, step: 0.5 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P !== undefined ? inputs.P : 32.0;
      const H = inputs.H !== undefined ? inputs.H : 3.50;
      const Abukaan = inputs.Abukaan !== undefined ? inputs.Abukaan : 14.50;
      const Asop = inputs.Asop !== undefined ? inputs.Asop : 6.0;

      const luasNetto = SafeDecimalEngine.safeRound(Math.max(0, (P * H) - Abukaan + Asop), 2);
      const jmlBata = Math.ceil(luasNetto * 70); // 70 pcs/m2
      const sakSemen = SafeDecimalEngine.safeRound((luasNetto * 11.5) / 50, 1); // 11.5 kg / 50
      const volPasir = SafeDecimalEngine.safeRound(luasNetto * 0.043, 2);

      return {
        primaryQuantity: luasNetto,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pasangan Bata Merah',
        breakdown: {
          luasNettoDindingM2: luasNetto,
          jumlahBataMerahPcs: jmlBata,
          semenPortlandSak: sakSemen,
          pasirPasangM3: volPasir,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_NETTO',
            description: 'Luas Bersih Pasangan Bata Merah',
            formulaText: `(${P} × ${H}) - ${Abukaan} + ${Asop}`,
            calculatedValue: luasNetto,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'JML_BATA',
            description: 'Jumlah Bata Merah (70 bh/m² + waste)',
            formulaText: `${luasNetto} × 70 bh`,
            calculatedValue: jmlBata,
            unit: 'buah',
          },
        ],
        materials: [
          { name: 'Bata Merah Bakar Standar (5x11x22 cm)', quantity: jmlBata, unit: 'buah' },
          { name: 'Semen Portland (50 kg)', quantity: sakSemen, unit: 'sak' },
          { name: 'Pasir Pasang', quantity: volPasir, unit: 'm³' },
        ],
        labor: [
          { role: 'Tukang Batu', hoursOrDays: SafeDecimalEngine.safeRound(luasNetto * 0.10, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasNetto * 0.30, 2), unit: 'OH' },
          { role: 'Mandor', hoursOrDays: SafeDecimalEngine.safeRound(luasNetto * 0.015, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'BataMerahDiagram',
  },

  // 9. BATAKO
  {
    id: 'BATAKO',
    category: 'arsitektur',
    title: 'Dinding Pasangan Batako',
    shortName: 'Batako',
    codePrefix: 'QTO.09.BTK',
    version: '1.0',
    excelSheetName: 'Batako',
    description: 'Menghitung luas pasangan dinding batako press, jumlah batako (pcs), semen, dan pasir.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasangan Batako',
    defaultAhspCode: 'A.4.4.1.12',
    defaultAhspName: 'Pemasangan 1 m² Dinding Batako Press Semen (10x20x40) cm',
    defaultUnitPrice: 138000,
    parameters: [
      { id: 'P', label: 'Panjang Total Dinding (P)', description: 'Panjang kumulatif dinding', unit: 'm', defaultValue: 28.0, min: 1, max: 500, step: 0.5 },
      { id: 'H', label: 'Tinggi Dinding (H)', description: 'Tinggi dinding', unit: 'm', defaultValue: 3.0, min: 1, max: 10, step: 0.1 },
      { id: 'Abukaan', label: 'Luas Bukaan', description: 'Total luas bukaan', unit: 'm²', defaultValue: 8.0, min: 0, max: 100, step: 0.25 },
      { id: 'Asop', label: 'Luas Sop-sop', description: 'Luas dinding segitiga', unit: 'm²', defaultValue: 4.0, min: 0, max: 100, step: 0.5 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P !== undefined ? inputs.P : 28.0;
      const H = inputs.H !== undefined ? inputs.H : 3.0;
      const Abukaan = inputs.Abukaan !== undefined ? inputs.Abukaan : 8.0;
      const Asop = inputs.Asop !== undefined ? inputs.Asop : 4.0;

      const luasNetto = SafeDecimalEngine.safeRound(Math.max(0, (P * H) - Abukaan + Asop), 2);
      const jmlBatako = Math.ceil(luasNetto * 12.5); // 12.5 pcs/m2
      const sakSemen = SafeDecimalEngine.safeRound((luasNetto * 6.5) / 50, 1);
      const volPasir = SafeDecimalEngine.safeRound(luasNetto * 0.025, 2);

      return {
        primaryQuantity: luasNetto,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pasangan Batako',
        breakdown: {
          luasNettoDindingM2: luasNetto,
          jumlahBatakoPcs: jmlBatako,
          semenPortlandSak: sakSemen,
          pasirPasangM3: volPasir,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_NETTO',
            description: 'Luas Bersih Pasangan Batako',
            formulaText: `(${P} × ${H}) - ${Abukaan} + ${Asop}`,
            calculatedValue: luasNetto,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'JML_BATAKO',
            description: 'Jumlah Batako Press (12.5 bh/m²)',
            formulaText: `${luasNetto} × 12.5 bh`,
            calculatedValue: jmlBatako,
            unit: 'buah',
          },
        ],
        materials: [
          { name: 'Batako Press Semen (10x20x40 cm)', quantity: jmlBatako, unit: 'buah' },
          { name: 'Semen Portland (50 kg)', quantity: sakSemen, unit: 'sak' },
          { name: 'Pasir Pasang', quantity: volPasir, unit: 'm³' },
        ],
        labor: [
          { role: 'Tukang Batu', hoursOrDays: SafeDecimalEngine.safeRound(luasNetto * 0.10, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasNetto * 0.25, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'BatakoDiagram',
  },

  // 10. PINTU & JENDELA
  {
    id: 'PINTU_JENDELA',
    category: 'arsitektur',
    title: 'Kusen, Pintu & Jendela',
    shortName: 'Pintu & Jendela',
    codePrefix: 'QTO.10.PJD',
    version: '1.0',
    excelSheetName: 'Pintu & Jendela',
    description: 'Menghitung volume kusen kayu/aluminium, luas daun pintu panel/plywood, daun jendela kaca, dan aksesoris.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Daun Pintu & Jendela',
    defaultAhspCode: 'A.4.6.1.5',
    defaultAhspName: 'Pembuatan dan Pemasangan 1 m² Daun Pintu Panel Kayu Kamper',
    defaultUnitPrice: 950000,
    parameters: [
      { id: 'nPintuUtama', label: 'Jml Pintu Utama (90x210)', description: 'Pintu masuk utama', unit: 'unit', defaultValue: 1, min: 0, max: 20, step: 1 },
      { id: 'nPintuKamar', label: 'Jml Pintu Kamar (80x210)', description: 'Pintu kamar tidur & ruangan', unit: 'unit', defaultValue: 4, min: 0, max: 50, step: 1 },
      { id: 'nPintuKM', label: 'Jml Pintu KM/WC (70x200)', description: 'Pintu kamar mandi', unit: 'unit', defaultValue: 2, min: 0, max: 30, step: 1 },
      { id: 'nJendelaGanda', label: 'Jml Jendela Ganda (120x150)', description: 'Jendela kaca 2 daun', unit: 'unit', defaultValue: 3, min: 0, max: 50, step: 1 },
      { id: 'nJendelaTunggal', label: 'Jml Jendela Tunggal (60x150)', description: 'Jendela kaca 1 daun', unit: 'unit', defaultValue: 4, min: 0, max: 50, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const nPU = inputs.nPintuUtama || 1;
      const nPK = inputs.nPintuKamar || 4;
      const nPKM = inputs.nPintuKM || 2;
      const nJG = inputs.nJendelaGanda || 3;
      const nJT = inputs.nJendelaTunggal || 4;

      // Luas Daun Pintu = (0.9*2.1*nPU) + (0.8*2.1*nPK) + (0.7*2.0*nPKM)
      const luasDaunPintu = SafeDecimalEngine.safeRound((0.9 * 2.1 * nPU) + (0.8 * 2.1 * nPK) + (0.7 * 2.0 * nPKM), 2);
      // Luas Daun Jendela = (1.2*1.5*nJG) + (0.6*1.5*nJT)
      const luasDaunJendela = SafeDecimalEngine.safeRound((1.2 * 1.5 * nJG) + (0.6 * 1.5 * nJT), 2);
      const totalLuasPintuJendela = SafeDecimalEngine.safeRound(luasDaunPintu + luasDaunJendela, 2);

      // Panjang Kusen (m')
      const panjangKusenPU = (2 * 2.1 + 0.9) * nPU;
      const panjangKusenPK = (2 * 2.1 + 0.8) * nPK;
      const panjangKusenPKM = (2 * 2.0 + 0.7) * nPKM;
      const panjangKusenJG = (2 * 1.5 + 2 * 1.2 + 1.5) * nJG;
      const panjangKusenJT = (2 * 1.5 + 2 * 0.6) * nJT;
      const totalPanjangKusen = SafeDecimalEngine.safeRound(panjangKusenPU + panjangKusenPK + panjangKusenPKM + panjangKusenJG + panjangKusenJT, 2);

      // Volume Kusen Kayu (m3) = totalPanjang * 0.06 * 0.12
      const volKusenKayu = SafeDecimalEngine.safeRound(totalPanjangKusen * 0.06 * 0.12, 3);
      const luasKaca5mm = SafeDecimalEngine.safeRound(luasDaunJendela * 0.85, 2);

      return {
        primaryQuantity: totalLuasPintuJendela,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Daun Pintu & Jendela',
        breakdown: {
          totalLuasDaunM2: totalLuasPintuJendela,
          luasDaunPintuM2: luasDaunPintu,
          luasDaunJendelaM2: luasDaunJendela,
          panjangKusenTotalM: totalPanjangKusen,
          volumeKusenKayuM3: volKusenKayu,
          luasKacaPolos5mmM2: luasKaca5mm,
          totalPintuUnit: nPU + nPK + nPKM,
          totalJendelaUnit: nJG + nJT,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_DAUN',
            description: 'Luas Daun Pintu & Daun Jendela',
            formulaText: `${luasDaunPintu} m² (Pintu) + ${luasDaunJendela} m² (Jendela)`,
            calculatedValue: totalLuasPintuJendela,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'PANJANG_KUSEN',
            description: 'Panjang Total Kusen Keliling',
            formulaText: `Keliling kusen seluruh pintu (${panjangKusenPU + panjangKusenPK + panjangKusenPKM} m) + jendela (${panjangKusenJG + panjangKusenJT} m)`,
            calculatedValue: totalPanjangKusen,
            unit: 'm\'',
          },
        ],
        materials: [
          { name: 'Kusen Kayu Kamper / Aluminium 4 inch', quantity: totalPanjangKusen, unit: 'm\'' },
          { name: 'Daun Pintu Solid Wood / Engineering Door', quantity: luasDaunPintu, unit: 'm²' },
          { name: 'Daun Jendela Ram Kayu / Aluminium', quantity: luasDaunJendela, unit: 'm²' },
          { name: 'Kaca Polos Tebal 5 mm', quantity: luasKaca5mm, unit: 'm²' },
          { name: 'Kunci Tanam & Engsel Stainless Pintu', quantity: nPU + nPK + nPKM, unit: 'set' },
        ],
        labor: [
          { role: 'Tukang Kayu / Aluminium', hoursOrDays: SafeDecimalEngine.safeRound(totalLuasPintuJendela * 0.8, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(totalLuasPintuJendela * 0.4, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'PintuJendelaDiagram',
  },

  // 11. ATAP BAJA RINGAN
  {
    id: 'ATAP_BAJA_RINGAN',
    category: 'struktur',
    title: 'Rangka & Penutup Atap Baja Ringan',
    shortName: 'Atap Baja Ringan',
    codePrefix: 'QTO.11.ATP',
    version: '1.0',
    excelSheetName: 'Atap Baja Ringan',
    description: 'Menghitung luas bidang atap miring, profil kanal C75, reng baja ringan, sekrup baut, dan genteng.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Bidang Atap Miring',
    defaultAhspCode: 'A.4.2.1.21',
    defaultAhspName: 'Pemasangan 1 m² Rangka Atap Baja Ringan Profil C75 Profil Standar',
    defaultUnitPrice: 185000,
    parameters: [
      { id: 'Lb', label: 'Bentang Bangunan (Lb)', description: 'Lebar bersih bentang atap', unit: 'm', defaultValue: 8.0, min: 2, max: 50, step: 0.5 },
      { id: 'Pb', label: 'Panjang Bangunan (Pb)', description: 'Panjang horisontal bangunan', unit: 'm', defaultValue: 12.0, min: 2, max: 100, step: 0.5 },
      { id: 'sudut', label: 'Sudut Kemiringan Atap (α)', description: 'Sudut derajat kemiringan atap', unit: 'derajat', defaultValue: 30, min: 10, max: 60, step: 1 },
      { id: 'overstek', label: 'Panjang Overstek (O)', description: 'Panjang teritisan keluar dinding', unit: 'm', defaultValue: 0.80, min: 0, max: 2.5, step: 0.1 },
      { id: 'jarakKuda', label: 'Jarak Kuda-kuda', description: 'Spasi antar kuda-kuda rangka', unit: 'm', defaultValue: 1.20, min: 0.8, max: 1.5, step: 0.1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const Lb = inputs.Lb || 8.0;
      const Pb = inputs.Pb || 12.0;
      const sudut = inputs.sudut || 30;
      const O = inputs.overstek || 0.80;
      const sKuda = inputs.jarakKuda || 1.20;

      const rad = (sudut * Math.PI) / 180;
      const cosSudut = Math.cos(rad);

      // Setengah bentang miring = (Lb / 2 + O) / cos(sudut)
      const sisiMiring = (Lb / 2 + O) / cosSudut;
      const panjangAtapTotal = Pb + (2 * O);
      // Luas Bidang Miring Pelana (2 Sisi) = 2 * sisiMiring * panjangAtapTotal
      const luasBidangAtap = SafeDecimalEngine.safeRound(2 * sisiMiring * panjangAtapTotal, 2);

      // Rangka C75 (estimasi 4.2 m' per m2 atap)
      const panjangC75 = SafeDecimalEngine.safeRound(luasBidangAtap * 4.2, 1);
      const batangC75 = Math.ceil(panjangC75 / 6); // 6m per batang

      // Reng Baja Ringan (estimasi 3.2 m' per m2 atap)
      const panjangReng = SafeDecimalEngine.safeRound(luasBidangAtap * 3.2, 1);
      const batangReng = Math.ceil(panjangReng / 6);

      // Sekrup & Baut
      const screwBaut = Math.ceil(luasBidangAtap * 25);
      const jmlKudaKuda = Math.ceil(panjangAtapTotal / sKuda) + 1;

      return {
        primaryQuantity: luasBidangAtap,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Bidang Atap Miring',
        breakdown: {
          luasBidangAtapM2: luasBidangAtap,
          panjangSisiMiringM: SafeDecimalEngine.safeRound(sisiMiring, 2),
          panjangAtapTotalM: SafeDecimalEngine.safeRound(panjangAtapTotal, 2),
          jumlahKudaKudaUnit: jmlKudaKuda,
          kebutuhanKanalC75M: panjangC75,
          kebutuhanBatangC75Batang: batangC75,
          kebutuhanRengM: panjangReng,
          kebutuhanBatangRengBatang: batangReng,
          kebutuhanScrewBautPcs: screwBaut,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'SISI_MIRING',
            description: 'Panjang Kemiringan Atap Termasuk Overstek',
            formulaText: `(${Lb}/2 + ${O}) / cos(${sudut}°)`,
            calculatedValue: SafeDecimalEngine.safeRound(sisiMiring, 2),
            unit: 'm',
          },
          {
            stepNumber: 2,
            code: 'LUAS_ATAP',
            description: 'Luas 2 Bidang Atap Pelana',
            formulaText: `2 × ${SafeDecimalEngine.safeRound(sisiMiring, 2)} × (${Pb} + 2 × ${O})`,
            calculatedValue: luasBidangAtap,
            unit: 'm²',
          },
          {
            stepNumber: 3,
            code: 'BATANG_C75',
            description: 'Kebutuhan Batang Kanal C75 (6m)',
            formulaText: `(${luasBidangAtap} × 4.2 m'/m²) / 6m`,
            calculatedValue: batangC75,
            unit: 'batang',
          },
        ],
        materials: [
          { name: 'Kanal Baja Ringan C75.75 (Panjang 6 m)', quantity: batangC75, unit: 'batang' },
          { name: 'Reng Baja Ringan U30 (Panjang 6 m)', quantity: batangReng, unit: 'batang' },
          { name: 'Self Drilling Screw / Baut Roofing', quantity: screwBaut, unit: 'buah' },
          { name: 'Genteng Metal Pasir / Genteng Beton', quantity: luasBidangAtap, unit: 'm²' },
        ],
        labor: [
          { role: 'Tukang Rangka Baja Ringan', hoursOrDays: SafeDecimalEngine.safeRound(luasBidangAtap * 0.15, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasBidangAtap * 0.10, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'AtapBajaRinganDiagram',
  },

  // 12. PLESTERAN & ACIAN
  {
    id: 'PLESTERAN_ACIAN',
    category: 'finishing',
    title: 'Plesteran & Acian Dinding',
    shortName: 'Plesteran & Acian',
    codePrefix: 'QTO.12.PLS',
    version: '1.0',
    excelSheetName: 'Plesteran & Acian',
    description: 'Menghitung luas plesteran dinding 2 sisi, luas acian, kebutuhan semen portland, dan pasir pasang.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Plesteran Dinding',
    defaultAhspCode: 'A.4.4.2.4',
    defaultAhspName: 'Pemasangan 1 m² Plesteran 1 SP : 4 PP Tebal 15 mm + Acian',
    defaultUnitPrice: 92000,
    parameters: [
      { id: 'luasDinding', label: 'Luas Dinding Kasar (m²)', description: 'Luas netto pasangan dinding bata/hebel', unit: 'm²', defaultValue: 105.0, min: 1, max: 1000, step: 1 },
      { id: 'sisiPlester', label: 'Jumlah Sisi Plesteran', description: 'Plesteran 2 sisi (dalam & luar) atau 1 sisi', unit: 'sisi', defaultValue: 2, min: 1, max: 2, step: 1 },
      { id: 'tebalPlester', label: 'Tebal Plesteran (mm)', description: 'Tebal spesi adukan plesteran', unit: 'mm', defaultValue: 15, min: 10, max: 30, step: 2.5 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const Ld = inputs.luasDinding || 105.0;
      const sisi = inputs.sisiPlester || 2;
      const tebal = inputs.tebalPlester || 15;

      const luasPlesteran = SafeDecimalEngine.safeRound(Ld * sisi, 2);
      const luasAcian = SafeDecimalEngine.safeRound(luasPlesteran, 2);

      // Kebutuhan Semen Plesteran (1:4) = 6.24 kg/m2; Semen Acian = 3.25 kg/m2
      const kgSemenTotal = (luasPlesteran * 6.24) + (luasAcian * 3.25);
      const sakSemen = SafeDecimalEngine.safeRound(kgSemenTotal / 50, 1);
      const volPasir = SafeDecimalEngine.safeRound(luasPlesteran * 0.024, 2);

      return {
        primaryQuantity: luasPlesteran,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Plesteran Dinding',
        breakdown: {
          luasPlesteranM2: luasPlesteran,
          luasAcianM2: luasAcian,
          semenPlesterAcianSak50kg: sakSemen,
          pasirPasangM3: volPasir,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_PLESTER',
            description: 'Luas Plesteran (Luas Dinding × Jumlah Sisi)',
            formulaText: `${Ld} × ${sisi}`,
            calculatedValue: luasPlesteran,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'SEMEN_TOTAL',
            description: 'Kebutuhan Semen Plesteran (6.24 kg) + Acian (3.25 kg)',
            formulaText: `(${luasPlesteran} × 9.49 kg) / 50`,
            calculatedValue: sakSemen,
            unit: 'sak',
          },
        ],
        materials: [
          { name: 'Semen Portland (50 kg)', quantity: sakSemen, unit: 'sak' },
          { name: 'Pasir Pasang Ayak Halus', quantity: volPasir, unit: 'm³' },
        ],
        labor: [
          { role: 'Tukang Plester & Aci', hoursOrDays: SafeDecimalEngine.safeRound(luasPlesteran * 0.15, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasPlesteran * 0.30, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'PlesteranDiagram',
  },

  // 13. PENUTUP LANTAI (KERAMIK / GRANIT)
  {
    id: 'PENUTUP_LANTAI',
    category: 'finishing',
    title: 'Penutup Lantai (Keramik / Granit / Homogeneous)',
    shortName: 'Penutup Lantai',
    codePrefix: 'QTO.13.LNT',
    version: '1.0',
    excelSheetName: 'Penutup Lantai',
    description: 'Menghitung luas penutup lantai, kebutuhan dus ubin keramik/granit tile, semen perekat, nat grout, dan plint.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Penutup Lantai',
    defaultAhspCode: 'A.4.4.3.35',
    defaultAhspName: 'Pemasangan 1 m² Lantai Homogeneous Tile / Granit 60x60 cm',
    defaultUnitPrice: 245000,
    parameters: [
      { id: 'P', label: 'Panjang Ruangan (P)', description: 'Panjang lantai ruangan', unit: 'm', defaultValue: 10.0, min: 1, max: 100, step: 0.5 },
      { id: 'L', label: 'Lebar Ruangan (L)', description: 'Lebar lantai ruangan', unit: 'm', defaultValue: 8.0, min: 1, max: 100, step: 0.5 },
      { id: 'pjgPlint', label: 'Panjang Plint Dinding Keliling', description: 'Keliling dinding untuk plint ubin', unit: 'm', defaultValue: 36.0, min: 0, max: 300, step: 0.5 },
      { id: 'ukuranUbin', label: 'Ukuran Ubin (cm)', description: 'Pilihan ukuran ubin', unit: 'cm', defaultValue: 60, min: 20, max: 120, step: 10 },
      { id: 'waste', label: 'Waste Factor (%)', description: 'Cadangan potongan ubin', unit: '%', defaultValue: 5, min: 3, max: 15, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P || 10.0;
      const L = inputs.L || 8.0;
      const plint = inputs.pjgPlint || 36.0;
      const waste = (inputs.waste || 5) / 100;

      const luasBersih = SafeDecimalEngine.safeRound(P * L, 2);
      const luasDenganWaste = SafeDecimalEngine.safeRound(luasBersih * (1 + waste), 2);

      // Dus Ubin 60x60cm (1 dus = 1.44 m2, isi 4 pcs)
      const dusGranit = Math.ceil(luasDenganWaste / 1.44);
      // Semen Perekat (sak 50kg, ~5 m2 per sak)
      const sakSemen = SafeDecimalEngine.safeRound(luasBersih / 5, 1);
      // Semen Nat Grout (kg, ~0.35 kg/m2)
      const kgNat = SafeDecimalEngine.safeRound(luasBersih * 0.35, 1);

      return {
        primaryQuantity: luasBersih,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Penutup Lantai',
        breakdown: {
          luasLantaiBersihM2: luasBersih,
          luasLantaiPlusWasteM2: luasDenganWaste,
          kebutuhanDusGranitDus: dusGranit,
          panjangPlintLantaiM: plint,
          semenPerekatSak50kg: sakSemen,
          semenGroutNatKg: kgNat,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_LANTAI',
            description: 'Luas Bersih Ruangan',
            formulaText: `${P} × ${L}`,
            calculatedValue: luasBersih,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'DUS_UBIN',
            description: `Kebutuhan Dus Ubin + Waste ${(waste * 100).toFixed(0)}%`,
            formulaText: `(${luasBersih} × ${(1 + waste).toFixed(2)}) / 1.44 m²`,
            calculatedValue: dusGranit,
            unit: 'dus',
          },
        ],
        materials: [
          { name: `Homogeneous Tile / Granit ${inputs.ukuranUbin || 60}x${inputs.ukuranUbin || 60} cm`, quantity: dusGranit, unit: 'dus' },
          { name: 'Semen Perekat Ubin / Mortar Perekat Granit', quantity: sakSemen, unit: 'sak' },
          { name: 'Semen Warna / Tile Grout (Nat Keramik)', quantity: kgNat, unit: 'kg' },
          { name: 'Plint Granit 10x60 cm', quantity: plint, unit: 'm\'' },
        ],
        labor: [
          { role: 'Tukang Pasang Granit', hoursOrDays: SafeDecimalEngine.safeRound(luasBersih * 0.25, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasBersih * 0.25, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'PenutupLantaiDiagram',
  },

  // 14. PENUTUP DINDING
  {
    id: 'PENUTUP_DINDING',
    category: 'finishing',
    title: 'Penutup Dinding Keramik / Homogeneous',
    shortName: 'Penutup Dinding',
    codePrefix: 'QTO.14.DDG',
    version: '1.0',
    excelSheetName: 'Penutup Dinding',
    description: 'Menghitung luas keramik dinding kamar mandi / dapur, dus ubin, perekat, dan semen nat.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Penutup Dinding Keramik',
    defaultAhspCode: 'A.4.4.3.50',
    defaultAhspName: 'Pemasangan 1 m² Dinding Keramik 30x60 cm / Homogeneous Tile',
    defaultUnitPrice: 265000,
    parameters: [
      { id: 'K', label: 'Keliling Dinding (K)', description: 'Keliling ruangan yang dipasang keramik', unit: 'm', defaultValue: 8.0, min: 1, max: 100, step: 0.5 },
      { id: 'H', label: 'Tinggi Pasangan Dinding (H)', description: 'Tinggi pasangan keramik dinding', unit: 'm', defaultValue: 2.40, min: 0.5, max: 5.0, step: 0.1 },
      { id: 'Abukaan', label: 'Luas Bukaan Pintu / Jendela', description: 'Luas pintu KM dan ventilasi', unit: 'm²', defaultValue: 1.80, min: 0, max: 20, step: 0.1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const K = inputs.K || 8.0;
      const H = inputs.H || 2.40;
      const Abukaan = inputs.Abukaan || 1.80;

      const luasNetto = SafeDecimalEngine.safeRound(Math.max(0, (K * H) - Abukaan) * 1.05, 2);
      const dusKeramik = Math.ceil(luasNetto / 1.0); // 1 m2 per dus
      const sakSemen = SafeDecimalEngine.safeRound(luasNetto / 5, 1);
      const kgNat = SafeDecimalEngine.safeRound(luasNetto * 0.40, 1);

      return {
        primaryQuantity: luasNetto,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Penutup Dinding Keramik',
        breakdown: {
          luasKeramikDindingM2: luasNetto,
          kebutuhanDusKeramikDus: dusKeramik,
          semenPerekatSak: sakSemen,
          semenNatKg: kgNat,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_DINDING',
            description: 'Luas Keramik Dinding Netto + Waste 5%',
            formulaText: `((${K} × ${H}) - ${Abukaan}) × 105%`,
            calculatedValue: luasNetto,
            unit: 'm²',
          },
        ],
        materials: [
          { name: 'Keramik Dinding 30x60 cm / Homogeneous Tile', quantity: dusKeramik, unit: 'dus' },
          { name: 'Mortar Perekat Keramik Dinding', quantity: sakSemen, unit: 'sak' },
          { name: 'Semen Nat Anti Jamur', quantity: kgNat, unit: 'kg' },
        ],
        labor: [
          { role: 'Tukang Keramik Dinding', hoursOrDays: SafeDecimalEngine.safeRound(luasNetto * 0.30, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasNetto * 0.30, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'PenutupDindingDiagram',
  },

  // 15. PLAFON
  {
    id: 'PLAFON',
    category: 'finishing',
    title: 'Plafon Gypsum / GRC & Rangka Hollow',
    shortName: 'Plafon',
    codePrefix: 'QTO.15.PLF',
    version: '1.0',
    excelSheetName: 'Plafon',
    description: 'Menghitung luas plafon, rangka hollow galvanis 40x40 & 20x40, lembar gypsum board 9mm, dan list profil gypsum.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasangan Plafon',
    defaultAhspCode: 'A.4.5.1.7',
    defaultAhspName: 'Pemasangan 1 m² Langit-langit Gypsum Board Tebal 9 mm + Rangka Hollow',
    defaultUnitPrice: 135000,
    parameters: [
      { id: 'P', label: 'Panjang Ruangan (P)', description: 'Panjang bidang plafon', unit: 'm', defaultValue: 10.0, min: 1, max: 100, step: 0.5 },
      { id: 'L', label: 'Lebar Ruangan (L)', description: 'Lebar bidang plafon', unit: 'm', defaultValue: 8.0, min: 1, max: 100, step: 0.5 },
      { id: 'tipeRangka', label: 'Rangka Plafon', description: '1: Hollow Galvanis 4x4 & 2x4, 2: Rangka Kayu', unit: 'tipe', defaultValue: 1, min: 1, max: 2, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P || 10.0;
      const L = inputs.L || 8.0;

      const luasPlafon = SafeDecimalEngine.safeRound(P * L, 2);
      const kelilingList = SafeDecimalEngine.safeRound(2 * (P + L), 2);

      // Gypsum Board 1.2 x 2.4 m = 2.88 m2 per lembar
      const lembarGypsum = Math.ceil((luasPlafon * 1.05) / 2.88);
      // Rangka Hollow (estimasi 3.8 m' per m2 plafon) -> Batang 4m
      const batangHollow = Math.ceil((luasPlafon * 3.8) / 4);
      // Sekrup Gypsum & Textile Tape
      const sekrupGypsum = Math.ceil(luasPlafon * 20);

      return {
        primaryQuantity: luasPlafon,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pasangan Plafon',
        breakdown: {
          luasPlafonM2: luasPlafon,
          panjangListProfilM: kelilingList,
          kebutuhanLembarGypsumLembar: lembarGypsum,
          kebutuhanBatangHollowBatang: batangHollow,
          kebutuhanSekrupGypsumPcs: sekrupGypsum,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_PLAFON',
            description: 'Luas Bidang Plafon',
            formulaText: `${P} × ${L}`,
            calculatedValue: luasPlafon,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'LIST_PROFIL',
            description: 'Keliling List Profil Gypsum',
            formulaText: `2 × (${P} + ${L})`,
            calculatedValue: kelilingList,
            unit: 'm\'',
          },
          {
            stepNumber: 3,
            code: 'LEMBAR_GYPSUM',
            description: 'Kebutuhan Lembar Gypsum (1.20 × 2.40 m)',
            formulaText: `(${luasPlafon} × 105%) / 2.88 m²`,
            calculatedValue: lembarGypsum,
            unit: 'lembar',
          },
        ],
        materials: [
          { name: 'Gypsum Board Tebal 9 mm (120x240 cm)', quantity: lembarGypsum, unit: 'lembar' },
          { name: 'Besi Hollow Galvanis 4x4 & 2x4 (Panjang 4 m)', quantity: batangHollow, unit: 'batang' },
          { name: 'List Profil Gypsum Lebar 7-10 cm', quantity: kelilingList, unit: 'm\'' },
          { name: 'Sekrup Gypsum & Cornice Compound', quantity: sekrupGypsum, unit: 'buah' },
        ],
        labor: [
          { role: 'Tukang Plafon', hoursOrDays: SafeDecimalEngine.safeRound(luasPlafon * 0.15, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasPlafon * 0.10, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'PlafonDiagram',
  },

  // 16. PENGECATAN
  {
    id: 'PENGECATAN',
    category: 'finishing',
    title: 'Pengecatan Dinding & Plafon',
    shortName: 'Pengecatan',
    codePrefix: 'QTO.16.CAT',
    version: '1.0',
    excelSheetName: 'Pengecatan',
    description: 'Menghitung luas bidang pengecatan interior, eksterior, plafon, kebutuhan plamir, cat dasar, dan cat finishing (pail/galon).',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Total Luas Pengecatan',
    defaultAhspCode: 'A.4.7.1.10',
    defaultAhspName: 'Pengecatan 1 m² Tembok Baru Interior (1 Lapis Plamir, 1 Lapis Cat Dasar, 2 Lapis Cat Penutup)',
    defaultUnitPrice: 38500,
    parameters: [
      { id: 'luasInterior', label: 'Luas Dinding Interior (m²)', description: 'Luas dinding dalam ruangan', unit: 'm²', defaultValue: 140.0, min: 0, max: 1500, step: 1 },
      { id: 'luasEksterior', label: 'Luas Dinding Eksterior (m²)', description: 'Luas dinding luar tahan cuaca', unit: 'm²', defaultValue: 70.0, min: 0, max: 1500, step: 1 },
      { id: 'luasPlafon', label: 'Luas Plafon (m²)', description: 'Luas bidang cat plafon', unit: 'm²', defaultValue: 80.0, min: 0, max: 1000, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const Lint = inputs.luasInterior !== undefined ? inputs.luasInterior : 140.0;
      const Leks = inputs.luasEksterior !== undefined ? inputs.luasEksterior : 70.0;
      const Lplf = inputs.luasPlafon !== undefined ? inputs.luasPlafon : 80.0;

      const totalLuas = SafeDecimalEngine.safeRound(Lint + Leks + Lplf, 2);

      // Kebutuhan Cat (Daya sebar ~10 m2 / kg per lapis, 2 lapis = 5 m2/kg)
      // Cat Interior (Pail 20 kg = ~100 m2 2 lapis)
      const pailInterior = SafeDecimalEngine.safeRound((Lint + Lplf) / 100, 1);
      // Cat Eksterior Weathershield (Galon 2.5 L / 4 kg = ~20 m2 2 lapis)
      const galonEksterior = Math.ceil(Leks / 20);
      // Plamir Tembok (20 kg = ~50 m2)
      const pailPlamir = SafeDecimalEngine.safeRound(totalLuas / 50, 1);

      return {
        primaryQuantity: totalLuas,
        primaryUnit: 'm²',
        primaryLabel: 'Total Luas Pengecatan',
        breakdown: {
          totalLuasCatM2: totalLuas,
          luasCatInteriorM2: Lint,
          luasCatEksteriorM2: Leks,
          luasCatPlafonM2: Lplf,
          kebutuhanCatInteriorPail20kg: pailInterior,
          kebutuhanCatEksteriorGalon: galonEksterior,
          kebutuhanPlamirPail20kg: pailPlamir,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'TOTAL_LUAS_CAT',
            description: 'Total Luas Bidang Cat (Interior + Eksterior + Plafon)',
            formulaText: `${Lint} + ${Leks} + ${Lplf}`,
            calculatedValue: totalLuas,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'CAT_INTERIOR',
            description: 'Kebutuhan Cat Interior (Pail 20 kg, 2 Lapis)',
            formulaText: `(${Lint} + ${Lplf}) / 100 m²`,
            calculatedValue: pailInterior,
            unit: 'pail',
          },
        ],
        materials: [
          { name: 'Cat Tembok Interior Standar Premium (Pail 20 kg)', quantity: pailInterior, unit: 'pail' },
          { name: 'Cat Tembok Eksterior Weatherproof (Galon 2.5 Liter)', quantity: galonEksterior, unit: 'galon' },
          { name: 'Plamir Tembok Siap Pakai (Pail 20 kg)', quantity: pailPlamir, unit: 'pail' },
          { name: 'Rol Cat, Kuas, Ampelas & Lakban Kertas', quantity: Math.ceil(totalLuas / 50), unit: 'set' },
        ],
        labor: [
          { role: 'Tukang Cat', hoursOrDays: SafeDecimalEngine.safeRound(totalLuas * 0.08, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(totalLuas * 0.04, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'PengecatanDiagram',
  },

  // 17. KELISTRIKAN
  {
    id: 'KELISTRIKAN',
    category: 'mep',
    title: 'Instalasi Kelistrikan Gedung',
    shortName: 'Kelistrikan',
    codePrefix: 'QTO.17.ELK',
    version: '1.0',
    excelSheetName: 'Kelistrikan',
    description: 'Menghitung total titik lampu, stop kontak, saklar, kabel NYM, pipa conduit, dan box MCB.',
    primaryUnit: 'titik',
    primaryQuantityLabel: 'Total Titik Instalasi Listrik',
    defaultAhspCode: 'A.8.1.1.1',
    defaultAhspName: 'Pemasangan 1 Titik Instalasi Penerangan & Daya Kabel NYM 3x2.5 mm',
    defaultUnitPrice: 275000,
    parameters: [
      { id: 'nLampu', label: 'Jumlah Titik Lampu', description: 'Titik lampu downlight / fitting', unit: 'titik', defaultValue: 18, min: 1, max: 200, step: 1 },
      { id: 'nStopKontak', label: 'Jumlah Stop Kontak', description: 'Titik colokan listrik', unit: 'titik', defaultValue: 12, min: 1, max: 100, step: 1 },
      { id: 'nSaklarTunggal', label: 'Jumlah Saklar Tunggal', description: 'Saklar lampu 1 tombol', unit: 'titik', defaultValue: 6, min: 0, max: 50, step: 1 },
      { id: 'nSaklarGanda', label: 'Jumlah Saklar Ganda', description: 'Saklar lampu 2 tombol', unit: 'titik', defaultValue: 4, min: 0, max: 50, step: 1 },
      { id: 'nMcb', label: 'Jumlah Group MCB', description: 'Pembagian group panel listrik', unit: 'group', defaultValue: 4, min: 1, max: 24, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const nL = inputs.nLampu || 18;
      const nSK = inputs.nStopKontak || 12;
      const nS1 = inputs.nSaklarTunggal || 6;
      const nS2 = inputs.nSaklarGanda || 4;
      const nMcb = inputs.nMcb || 4;

      const totalTitik = nL + nSK + nS1 + nS2;
      // Rata-rata 12 meter kabel NYM per titik
      const panjangKabelNYM = SafeDecimalEngine.safeRound(totalTitik * 12, 1);
      const rollKabel = Math.ceil(panjangKabelNYM / 50); // 50m per roll
      const panjangConduit = SafeDecimalEngine.safeRound(totalTitik * 8, 1);

      return {
        primaryQuantity: totalTitik,
        primaryUnit: 'titik',
        primaryLabel: 'Total Titik Instalasi Listrik',
        breakdown: {
          totalTitikInstalasi: totalTitik,
          titikLampu: nL,
          titikStopKontak: nSK,
          titikSaklarTunggal: nS1,
          titikSaklarGanda: nS2,
          panjangKabelNYMM: panjangKabelNYM,
          kebutuhanRollKabel50m: rollKabel,
          panjangPipaConduitM: panjangConduit,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'TOTAL_TITIK',
            description: 'Total Titik Instalasi Listrik',
            formulaText: `${nL} (Lampu) + ${nSK} (SK) + ${nS1} (Saklar 1) + ${nS2} (Saklar 2)`,
            calculatedValue: totalTitik,
            unit: 'titik',
          },
          {
            stepNumber: 2,
            code: 'KABEL_NYM',
            description: 'Estimasi Panjang Kabel NYM (12 m/titik)',
            formulaText: `${totalTitik} × 12 m'`,
            calculatedValue: panjangKabelNYM,
            unit: 'm\'',
          },
        ],
        materials: [
          { name: 'Kabel NYM 3x2.5 mm² / 2x1.5 mm² Standar SNI', quantity: panjangKabelNYM, unit: 'm\'' },
          { name: 'Pipa Conduit Listrik PVC 20 mm + T-Dos', quantity: panjangConduit, unit: 'm\'' },
          { name: 'Stop Kontak & Saklar Panasonic / Broco', quantity: totalTitik, unit: 'buah' },
          { name: 'Box Panel MCB Presto + MCB Schneider', quantity: 1, unit: 'unit' },
        ],
        labor: [
          { role: 'Tukang Listrik Bersertifikat', hoursOrDays: SafeDecimalEngine.safeRound(totalTitik * 0.25, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(totalTitik * 0.15, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'KelistrikanDiagram',
  },

  // 18. INSTALASI AIR BERSIH
  {
    id: 'AIR_BERSIH',
    category: 'mep',
    title: 'Instalasi Air Bersih (Plumbing)',
    shortName: 'Air Bersih',
    codePrefix: 'QTO.18.PLM',
    version: '1.0',
    excelSheetName: 'Instalasi Air Bersih',
    description: 'Menghitung panjang pipa PVC AW 1/2" & 3/4", fitting sambungan knee/tee, lem pipa, dan titik kran air.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Total Pipa Air Bersih',
    defaultAhspCode: 'A.5.1.1.2',
    defaultAhspName: 'Pemasangan 1 m\' Pipa PVC Tipe AW Diameter 1/2" - 3/4"',
    defaultUnitPrice: 42000,
    parameters: [
      { id: 'pjgPipaUtama', label: 'Panjang Pipa Utama 3/4" (m)', description: 'Jalur pipa induk dari tandon/pompa', unit: 'm', defaultValue: 24.0, min: 1, max: 200, step: 1 },
      { id: 'pjgPipaCabang', label: 'Panjang Pipa Cabang 1/2" (m)', description: 'Distribusi ke masing-masing kran/shower', unit: 'm', defaultValue: 32.0, min: 1, max: 200, step: 1 },
      { id: 'nKran', label: 'Jumlah Titik Kran & Output Air', description: 'Total kran, shower, wastafel, mesin cuci', unit: 'titik', defaultValue: 8, min: 1, max: 50, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const pUtama = inputs.pjgPipaUtama || 24.0;
      const pCabang = inputs.pjgPipaCabang || 32.0;
      const nKran = inputs.nKran || 8;

      const totalPanjang = SafeDecimalEngine.safeRound(pUtama + pCabang, 2);
      const batangPipa34 = Math.ceil(pUtama / 4); // 4m per batang
      const batangPipa12 = Math.ceil(pCabang / 4);
      const totalBatang = batangPipa34 + batangPipa12;
      const fittingKneeTee = Math.ceil(totalPanjang * 0.8);

      return {
        primaryQuantity: totalPanjang,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Total Pipa Air Bersih',
        breakdown: {
          totalPanjangPipaM: totalPanjang,
          panjangPipaUtama34M: pUtama,
          panjangPipaCabang12M: pCabang,
          kebutuhanBatang34Batang: batangPipa34,
          kebutuhanBatang12Batang: batangPipa12,
          kebutuhanFittingKneeTeePcs: fittingKneeTee,
          totalTitikOutputKran: nKran,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'TOTAL_PANJANG_PIPA',
            description: 'Total Panjang Pipa Distribusi Air Bersih',
            formulaText: `${pUtama} m' (3/4") + ${pCabang} m' (1/2")`,
            calculatedValue: totalPanjang,
            unit: 'm\'',
          },
          {
            stepNumber: 2,
            code: 'TOTAL_BATANG',
            description: 'Kebutuhan Batang Pipa PVC AW (Panjang 4m)',
            formulaText: `(${pUtama}/4) + (${pCabang}/4)`,
            calculatedValue: totalBatang,
            unit: 'batang',
          },
        ],
        materials: [
          { name: 'Pipa PVC Tipe AW 3/4" (Panjang 4 m)', quantity: batangPipa34, unit: 'batang' },
          { name: 'Pipa PVC Tipe AW 1/2" (Panjang 4 m)', quantity: batangPipa12, unit: 'batang' },
          { name: 'Fitting Sambungan PVC (Knee, Tee, Socket, Reducer)', quantity: fittingKneeTee, unit: 'buah' },
          { name: 'Lem Pipa PVC + Seal Tape', quantity: Math.ceil(totalPanjang / 15), unit: 'kaleng' },
          { name: 'Kran Dinding Stainless 1/2"', quantity: nKran, unit: 'buah' },
        ],
        labor: [
          { role: 'Tukang Plumbing / Pipa', hoursOrDays: SafeDecimalEngine.safeRound(totalPanjang * 0.08, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(totalPanjang * 0.05, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'AirBersihDiagram',
  },

  // 19. SANITAIR
  {
    id: 'SANITAIR',
    category: 'mep',
    title: 'Peralatan Sanitair (Sanitary Ware)',
    shortName: 'Sanitair',
    codePrefix: 'QTO.19.SNT',
    version: '1.0',
    excelSheetName: 'Sanitair',
    description: 'Menghitung pengadaan & pemasangan kloset duduk, kloset jongkok, wastafel, floor drain, jet washer, dan shower spray.',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Total Unit Sanitair',
    defaultAhspCode: 'A.5.1.1.15',
    defaultAhspName: 'Pemasangan 1 Unit Kloset Duduk Monoblok Komplit Aksesoris',
    defaultUnitPrice: 2350000,
    parameters: [
      { id: 'nKlosetDuduk', label: 'Jumlah Kloset Duduk (Monoblok)', description: 'Kloset duduk lengkap jet washer', unit: 'unit', defaultValue: 2, min: 0, max: 20, step: 1 },
      { id: 'nKlosetJongkok', label: 'Jumlah Kloset Jongkok', description: 'Kloset jongkok porselen', unit: 'unit', defaultValue: 0, min: 0, max: 20, step: 1 },
      { id: 'nWastafel', label: 'Jumlah Wastafel Meja / Gantung', description: 'Wastafel cuci tangan lengkap kran & afur', unit: 'unit', defaultValue: 2, min: 0, max: 20, step: 1 },
      { id: 'nFloorDrain', label: 'Jumlah Floor Drain Stainless', description: 'Saringan pembuangan air lantai', unit: 'unit', defaultValue: 3, min: 1, max: 30, step: 1 },
      { id: 'nShowerSet', label: 'Jumlah Shower Set Mandi', description: 'Head shower / hand shower + kran mixer', unit: 'unit', defaultValue: 2, min: 0, max: 20, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const nKD = inputs.nKlosetDuduk || 2;
      const nKJ = inputs.nKlosetJongkok || 0;
      const nW = inputs.nWastafel || 2;
      const nFD = inputs.nFloorDrain || 3;
      const nSS = inputs.nShowerSet || 2;

      const totalUnit = nKD + nKJ + nW + nFD + nSS;

      return {
        primaryQuantity: totalUnit,
        primaryUnit: 'unit',
        primaryLabel: 'Total Unit Sanitair',
        breakdown: {
          totalUnitSanitair: totalUnit,
          klosetDudukUnit: nKD,
          klosetJongkokUnit: nKJ,
          wastafelUnit: nW,
          floorDrainUnit: nFD,
          showerSetUnit: nSS,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'TOTAL_SANITAIR',
            description: 'Total Seluruh Unit Sanitair Terpasang',
            formulaText: `${nKD} (Kloset Duduk) + ${nKJ} (Kloset Jongkok) + ${nW} (Wastafel) + ${nFD} (Floor Drain) + ${nSS} (Shower)`,
            calculatedValue: totalUnit,
            unit: 'unit',
          },
        ],
        materials: [
          { name: 'Kloset Duduk Monoblok Dual Flush (TOTO / American Standard)', quantity: nKD, unit: 'unit' },
          { name: 'Wastafel Gantung / Meja Komplit Kran Dingin & Siphon P-Trap', quantity: nW, unit: 'unit' },
          { name: 'Floor Drain Stainless Steel Anti Bau 4"', quantity: nFD, unit: 'unit' },
          { name: 'Hand Shower Set + Kran Cabang Mixer', quantity: nSS, unit: 'set' },
        ],
        labor: [
          { role: 'Tukang Pasang Sanitair', hoursOrDays: SafeDecimalEngine.safeRound(totalUnit * 1.5, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(totalUnit * 1.0, 2), unit: 'OH' },
        ],
      };
    },
    diagramComponentKey: 'SanitairDiagram',
  },

  // 20. JALAN PAVING BLOCK
  {
    id: 'PAVING_BLOCK',
    category: 'infrastruktur',
    title: 'Perkerasan Jalan Paving Block',
    shortName: 'Paving Block',
    codePrefix: 'QTO.20.PVG',
    version: '1.0',
    excelSheetName: 'Paving Block',
    description: 'Menghitung luas perkerasan paving block, tebal 6cm/8cm K-300, pasir alas 5cm, kanstin beton pengunci sisi, dan abu batu.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Perkerasan Paving Block',
    defaultAhspCode: 'A.4.4.3.60',
    defaultAhspName: 'Pemasangan 1 m² Paving Block Bata Tebal 6 cm / 8 cm K-300',
    defaultUnitPrice: 165000,
    parameters: [
      { id: 'P', label: 'Panjang Jalan (P)', description: 'Panjang bentang jalan paving', unit: 'm', defaultValue: 100.0, min: 1, max: 10000, step: 1 },
      { id: 'L', label: 'Lebar Jalan (L)', description: 'Lebar bersih perkerasan jalan', unit: 'm', defaultValue: 4.0, min: 1, max: 50, step: 0.25 },
      { id: 'tebalPaving', label: 'Tebal Paving (cm)', description: 'Pilihan tebal 6 cm (pejalan/motor) atau 8 cm (mobil/truk)', unit: 'cm', defaultValue: 6, min: 6, max: 10, step: 2 },
      { id: 'tebalPasir', label: 'Tebal Pasir Alas (cm)', description: 'Tebal hamparan pasir bedding tebal 3-5 cm', unit: 'cm', defaultValue: 5, min: 3, max: 10, step: 1 },
      { id: 'pakaiKanstin', label: 'Gunakan Kanstin Pengunci', description: '1: Ya (2 Sisi Kiri & Kanan), 0: Tidak', unit: 'opsi', defaultValue: 1, min: 0, max: 1, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P || 100.0;
      const L = inputs.L || 4.0;
      const tebalPaving = inputs.tebalPaving || 6;
      const tebalPasir = (inputs.tebalPasir || 5) / 100;
      const pakaiKanstin = inputs.pakaiKanstin !== 0;

      const luasPaving = SafeDecimalEngine.safeRound(P * L, 2);
      const volPasirAlas = SafeDecimalEngine.safeRound(luasPaving * tebalPasir * 1.15, 2); // 15% faktor pemadatan
      const panjangKanstin = pakaiKanstin ? SafeDecimalEngine.safeRound(2 * P, 2) : 0;
      const jmlKepingKanstin = pakaiKanstin ? Math.ceil(panjangKanstin / 0.40) : 0; // Kanstin 40 cm/bh
      const jmlPavingPcs = Math.ceil(luasPaving * 44); // Standar paving bata 10.5x21 cm = ~44 pcs/m2
      const volAbuBatu = SafeDecimalEngine.safeRound(luasPaving * 0.015, 2); // Pengisi celah

      return {
        primaryQuantity: luasPaving,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Perkerasan Paving Block',
        breakdown: {
          luasPerkerasanM2: luasPaving,
          volumePasirAlasM3: volPasirAlas,
          panjangKanstinPengunciM: panjangKanstin,
          jumlahPavingPcs: jmlPavingPcs,
          jumlahKanstinPcs: jmlKepingKanstin,
          volumeAbuBatuM3: volAbuBatu,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_PAVING',
            description: 'Luas Hamparan Paving Block',
            formulaText: `${P} m × ${L} m`,
            calculatedValue: luasPaving,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'VOL_PASIR',
            description: 'Volume Pasir Alas Bedding + Pemadatan 15%',
            formulaText: `${luasPaving} m² × ${tebalPasir} m × 1.15`,
            calculatedValue: volPasirAlas,
            unit: 'm³',
          },
          {
            stepNumber: 3,
            code: 'KANSTIN_SISI',
            description: 'Panjang Kanstin Beton (2 Sisi Kiri & Kanan)',
            formulaText: pakaiKanstin ? `2 × ${P} m` : '0 m',
            calculatedValue: panjangKanstin,
            unit: 'm\'',
          },
        ],
        materials: [
          { name: `Paving Block K-300 Tebal ${tebalPaving} cm (Warna Natural/Abu)`, quantity: luasPaving, unit: 'm²' },
          { name: 'Pasir Ekstra Beton / Pasir Pasang Alas Paving', quantity: volPasirAlas, unit: 'm³' },
          { name: 'Kanstin Beton Pracetak 15x30x40 cm', quantity: panjangKanstin, unit: 'm\'' },
          { name: 'Abu Batu Pengisi Celah (Joint Filler)', quantity: volAbuBatu, unit: 'm³' },
        ],
        labor: [
          { role: 'Tukang Pasang Paving Block', hoursOrDays: SafeDecimalEngine.safeRound(luasPaving * 0.12, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(luasPaving * 0.25, 2), unit: 'OH' },
          { role: 'Mandor', hoursOrDays: SafeDecimalEngine.safeRound(luasPaving * 0.015, 2), unit: 'OH' },
        ],
        equipment: [
          { name: 'Stamper Kodok / Plate Compactor (Pemadat Paving)', quantity: Math.ceil(luasPaving / 300), unit: 'sewa-hari' }
        ]
      };
    },
    diagramComponentKey: 'PavingDiagram',
  },

  // 21. JALAN ASPAL HOTMIX
  {
    id: 'JALAN_ASPAL',
    category: 'infrastruktur',
    title: 'Perkerasan Jalan Aspal Hotmix (Lentur)',
    shortName: 'Jalan Aspal',
    codePrefix: 'QTO.21.ASP',
    version: '1.0',
    excelSheetName: 'Jalan Aspal',
    description: 'Menghitung volume lapis pondasi agregat kelas A & B, lapis resap ikat (Prime Coat), lapis perekat (Tack Coat), dan aspal AC-WC & AC-BC (Tonase).',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Perkerasan Aspal',
    defaultAhspCode: 'B.06.1.1',
    defaultAhspName: 'Penghamparan 1 Ton Laston Lapis Aus (AC-WC) Tebal Padat 4 cm',
    defaultUnitPrice: 1750000,
    parameters: [
      { id: 'P', label: 'Panjang Jalan (P)', description: 'Panjang total ruas jalan', unit: 'm', defaultValue: 200.0, min: 1, max: 100000, step: 10 },
      { id: 'L', label: 'Lebar Jalan (L)', description: 'Lebar efektif lajur aspal', unit: 'm', defaultValue: 5.0, min: 2, max: 50, step: 0.5 },
      { id: 'tBaseB', label: 'Tebal Agregat B (cm)', description: 'Lapis Pondasi Bawah tebal 10-20 cm', unit: 'cm', defaultValue: 15, min: 0, max: 30, step: 5 },
      { id: 'tBaseA', label: 'Tebal Agregat A (cm)', description: 'Lapis Pondasi Atas tebal 10-20 cm', unit: 'cm', defaultValue: 15, min: 0, max: 30, step: 5 },
      { id: 'tAcWc', label: 'Tebal Aspal AC-WC (cm)', description: 'Lapis aus permukaan aspal hotmix', unit: 'cm', defaultValue: 4, min: 3, max: 8, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P || 200.0;
      const L = inputs.L || 5.0;
      const tBaseB = (inputs.tBaseB || 15) / 100;
      const tBaseA = (inputs.tBaseA || 15) / 100;
      const tAcWc = (inputs.tAcWc || 4) / 100;

      const luasAspal = SafeDecimalEngine.safeRound(P * L, 2);
      const volAgregatB = SafeDecimalEngine.safeRound(luasAspal * tBaseB * 1.2, 2); // 20% pemadatan
      const volAgregatA = SafeDecimalEngine.safeRound(luasAspal * tBaseA * 1.2, 2);
      const primeCoatLiter = SafeDecimalEngine.safeRound(luasAspal * 0.8, 1); // 0.8 liter/m2
      // Tonase AC-WC = Luas * Tebal * Densitas 2.3 ton/m3
      const beratAcWcTon = SafeDecimalEngine.safeRound(luasAspal * tAcWc * 2.3, 2);

      return {
        primaryQuantity: luasAspal,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Perkerasan Aspal',
        breakdown: {
          luasPerkerasanAspalM2: luasAspal,
          volumeAgregatKelasBM3: volAgregatB,
          volumeAgregatKelasAM3: volAgregatA,
          kebutuhanPrimeCoatLiter: primeCoatLiter,
          tonaseAspalAcWcTon: beratAcWcTon,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'LUAS_ASPAL',
            description: 'Luas Bidang Pengaspalan',
            formulaText: `${P} m × ${L} m`,
            calculatedValue: luasAspal,
            unit: 'm²',
          },
          {
            stepNumber: 2,
            code: 'TONASE_ACWC',
            description: 'Tonase Laston AC-WC (Densitas 2.3 ton/m³)',
            formulaText: `${luasAspal} m² × ${tAcWc} m × 2.3 ton/m³`,
            calculatedValue: beratAcWcTon,
            unit: 'ton',
          },
          {
            stepNumber: 3,
            code: 'AGREGAT_A',
            description: 'Lapis Pondasi Agregat Kelas A',
            formulaText: `${luasAspal} m² × ${tBaseA} m × 1.2 (Faktor Padat)`,
            calculatedValue: volAgregatA,
            unit: 'm³',
          },
        ],
        materials: [
          { name: 'Aspal Hotmix Laston Lapis Aus (AC-WC)', quantity: beratAcWcTon, unit: 'ton' },
          { name: 'Lapis Pondasi Agregat Kelas A Standar Bina Marga', quantity: volAgregatA, unit: 'm³' },
          { name: 'Lapis Pondasi Agregat Kelas B Standar Bina Marga', quantity: volAgregatB, unit: 'm³' },
          { name: 'Lapis Resap Pengikat (Prime Coat Emulsi Aspal)', quantity: primeCoatLiter, unit: 'liter' },
        ],
        labor: [
          { role: 'Pekerja Lapangan Aspal', hoursOrDays: SafeDecimalEngine.safeRound(luasAspal * 0.05, 2), unit: 'OH' },
          { role: 'Mandor Aspal', hoursOrDays: SafeDecimalEngine.safeRound(luasAspal * 0.005, 2), unit: 'OH' },
        ],
        equipment: [
          { name: 'Asphalt Finisher & Tandem Roller', quantity: Math.ceil(luasAspal / 800), unit: 'sewa-hari' },
          { name: 'Pneumatic Tire Roller (PTR 10 Ton)', quantity: Math.ceil(luasAspal / 800), unit: 'sewa-hari' },
        ],
      };
    },
    diagramComponentKey: 'JalanAspalDiagram',
  },

  // 22. JALAN BETON (RIGID PAVEMENT)
  {
    id: 'JALAN_RIGID',
    category: 'infrastruktur',
    title: 'Perkerasan Jalan Beton Semen (Rigid Pavement)',
    shortName: 'Jalan Beton',
    codePrefix: 'QTO.22.RGD',
    version: '1.0',
    excelSheetName: 'Jalan Beton',
    description: 'Menghitung volume beton mutu FS-45 / K-300 tebal 15-25 cm, Lean Concrete (LC 5 cm), Wiremesh M8/M10, Dowel & Tie Bar, Plastik Cor, dan Cutting Joint Sealant.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Rigid Pavement',
    defaultAhspCode: 'B.05.1.1',
    defaultAhspName: 'Pengecoran 1 m³ Perkerasan Jalan Beton Semen Mutu f\'c 25 MPa / FS 45',
    defaultUnitPrice: 1650000,
    parameters: [
      { id: 'P', label: 'Panjang Jalan (P)', description: 'Panjang ruas perkerasan kaku', unit: 'm', defaultValue: 100.0, min: 1, max: 100000, step: 10 },
      { id: 'L', label: 'Lebar Jalan (L)', description: 'Lebar efektif lajur beton', unit: 'm', defaultValue: 4.0, min: 2, max: 50, step: 0.5 },
      { id: 'tRigid', label: 'Tebal Plat Beton (cm)', description: 'Tebal slab beton (15 cm / 20 cm / 25 cm)', unit: 'cm', defaultValue: 15, min: 12, max: 35, step: 2.5 },
      { id: 'tLc', label: 'Tebal Lean Concrete (cm)', description: 'Lantai kerja beton kurus B0 tebal 5 cm', unit: 'cm', defaultValue: 5, min: 0, max: 10, step: 2.5 },
      { id: 'pakaiWiremesh', label: 'Gunakan Wiremesh M8', description: '1: Ya (1 Lapis Wiremesh M8), 0: Tidak', unit: 'opsi', defaultValue: 1, min: 0, max: 1, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P || 100.0;
      const L = inputs.L || 4.0;
      const tRigid = (inputs.tRigid || 15) / 100;
      const tLc = (inputs.tLc || 5) / 100;
      const pakaiWiremesh = inputs.pakaiWiremesh !== 0;

      const luasPlat = SafeDecimalEngine.safeRound(P * L, 2);
      const volBetonRigid = SafeDecimalEngine.safeRound(luasPlat * tRigid, 3);
      const volLeanConcrete = SafeDecimalEngine.safeRound(luasPlat * tLc, 3);
      const luasPlastikCor = SafeDecimalEngine.safeRound(luasPlat * 1.10, 2); // 10% overlap
      // Wiremesh M8 (Berat ~4.17 kg/m2)
      const beratWiremeshKg = pakaiWiremesh ? SafeDecimalEngine.safeRound(luasPlat * 4.17 * 1.05, 2) : 0;
      const lembarWiremesh = pakaiWiremesh ? Math.ceil((luasPlat * 1.08) / 11.34) : 0; // 2.1 x 5.4 m = 11.34 m2

      // Joint Cutting & Sealant per 5 meter bentang
      const jmlSambunganMelintang = Math.floor(P / 5);
      const panjangCuttingJointM = SafeDecimalEngine.safeRound(jmlSambunganMelintang * L, 2);

      return {
        primaryQuantity: volBetonRigid,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Rigid Pavement',
        breakdown: {
          volumeBetonRigidM3: volBetonRigid,
          volumeLeanConcreteM3: volLeanConcrete,
          luasPermukaanBetonM2: luasPlat,
          luasPlastikCorM2: luasPlastikCor,
          totalBeratWiremeshKg: beratWiremeshKg,
          kebutuhanLembarWiremesh: lembarWiremesh,
          panjangCuttingJointM: panjangCuttingJointM,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'VOL_BETON_RIGID',
            description: 'Volume Beton Plat Rigid (FS 45 / K-300)',
            formulaText: `${P} m × ${L} m × ${tRigid} m`,
            calculatedValue: volBetonRigid,
            unit: 'm³',
          },
          {
            stepNumber: 2,
            code: 'VOL_LEAN_CONCRETE',
            description: 'Volume Lantai Kerja Lean Concrete B0',
            formulaText: `${luasPlat} m² × ${tLc} m`,
            calculatedValue: volLeanConcrete,
            unit: 'm³',
          },
          {
            stepNumber: 3,
            code: 'CUTTING_JOINT',
            description: 'Panjang Pemotongan Sambungan (Joint per 5m)',
            formulaText: `${jmlSambunganMelintang} titik × ${L} m`,
            calculatedValue: panjangCuttingJointM,
            unit: 'm\'',
          },
        ],
        materials: [
          { name: `Beton Ready Mix Rigid FS-45 / Mutu f'c 25 MPa (Tebal ${(tRigid * 100).toFixed(0)} cm)`, quantity: volBetonRigid, unit: 'm³' },
          { name: 'Beton Kurus Lean Concrete Mutu B-0 / f\'c 10 MPa (Lantai Kerja 5 cm)', quantity: volLeanConcrete, unit: 'm³' },
          { name: 'Wiremesh Ulir M8 Standar SNI (Lembar 2.1 x 5.4 m)', quantity: lembarWiremesh, unit: 'lembar' },
          { name: 'Plastik Cor Membran Pemisah (PE Sheet)', quantity: luasPlastikCor, unit: 'm²' },
          { name: 'Joint Sealant Aspal Sambungan Beton', quantity: panjangCuttingJointM, unit: 'm\'' },
        ],
        labor: [
          { role: 'Tukang Cor & Finishing Trowel Beton', hoursOrDays: SafeDecimalEngine.safeRound(volBetonRigid * 1.5, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(volBetonRigid * 3.0, 2), unit: 'OH' },
          { role: 'Mandor', hoursOrDays: SafeDecimalEngine.safeRound(volBetonRigid * 0.15, 2), unit: 'OH' },
        ],
        equipment: [
          { name: 'Concrete Paver / Concrete Vibrator Truss Screed', quantity: Math.ceil(volBetonRigid / 50), unit: 'sewa-hari' },
          { name: 'Concrete Cutter Machine (Pemotong Sambungan)', quantity: Math.ceil(panjangCuttingJointM / 100), unit: 'sewa-hari' },
        ],
      };
    },
    diagramComponentKey: 'JalanRigidDiagram',
  },

  // 23. SALURAN DRAINASE PRECAST U-DITCH
  {
    id: 'SALURAN_UDITCH',
    category: 'infrastruktur',
    title: 'Saluran Drainase Precast U-Ditch',
    shortName: 'Saluran U-Ditch',
    codePrefix: 'QTO.23.UDT',
    version: '1.0',
    excelSheetName: 'Saluran U-Ditch',
    description: 'Menghitung volume galian tanah saluran, pasir alas 10 cm, unit U-Ditch precast (panjang 1.2 m), tutup cover U-Ditch, dan spesi adukan sambungan.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Total Saluran Drainase',
    defaultAhspCode: 'B.07.1.1',
    defaultAhspName: 'Pemasangan 1 m\' Saluran Pracetak U-Ditch 40x40 cm Komplit Tutup',
    defaultUnitPrice: 485000,
    parameters: [
      { id: 'P', label: 'Panjang Saluran (P)', description: 'Panjang total saluran drainase', unit: 'm', defaultValue: 50.0, min: 1, max: 10000, step: 1 },
      { id: 'lebarUDitch', label: 'Lebar Bersih U-Ditch (cm)', description: 'Lebar dalam box (30 / 40 / 60 / 80 cm)', unit: 'cm', defaultValue: 40, min: 30, max: 120, step: 10 },
      { id: 'tinggiUDitch', label: 'Tinggi Bersih U-Ditch (cm)', description: 'Kedalaman dalam box (30 / 40 / 60 / 80 cm)', unit: 'cm', defaultValue: 40, min: 30, max: 120, step: 10 },
      { id: 'pakaiCover', label: 'Tipe Penutup Cover', description: '1: Light Duty (Pedestrian), 2: Heavy Duty (Beban Truk), 0: Terbuka', unit: 'tipe', defaultValue: 1, min: 0, max: 2, step: 1 },
    ],
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const P = inputs.P || 50.0;
      const lebar = (inputs.lebarUDitch || 40) / 100;
      const tinggi = (inputs.tinggiUDitch || 40) / 100;
      const tipeCover = inputs.pakaiCover !== undefined ? inputs.pakaiCover : 1;

      // Dimensi luar U-Ditch (tebal dinding ~7 cm)
      const lebarLuar = lebar + 0.14;
      const tinggiLuar = tinggi + 0.10;
      const lebarGalian = lebarLuar + 0.30;
      const dalamGalian = tinggiLuar + 0.10; // + 10cm pasir alas

      const volGalian = SafeDecimalEngine.safeRound(lebarGalian * dalamGalian * P, 2);
      const volPasirAlas = SafeDecimalEngine.safeRound(lebarGalian * 0.10 * P, 2);
      // Unit U-Ditch (standar panjang 1.20 m per unit)
      const jmlUnitUDitch = Math.ceil(P / 1.20);
      // Unit Cover (standar panjang 0.60 m per unit)
      const jmlUnitCover = tipeCover > 0 ? Math.ceil(P / 0.60) : 0;
      const volMortarSambungan = SafeDecimalEngine.safeRound(jmlUnitUDitch * 0.015, 2);

      return {
        primaryQuantity: P,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Total Saluran Drainase',
        breakdown: {
          panjangSaluranM: P,
          volumeGalianSaluranM3: volGalian,
          volumePasirAlasM3: volPasirAlas,
          jumlahBoxUDitchUnit: jmlUnitUDitch,
          jumlahTutupCoverUnit: jmlUnitCover,
          volumeMortarSambunganM3: volMortarSambungan,
        },
        formulaSteps: [
          {
            stepNumber: 1,
            code: 'VOL_GALIAN_DRAIN',
            description: 'Volume Galian Tanah Saluran Drainase',
            formulaText: `(${lebarLuar.toFixed(2)} + 0.30) × (${tinggiLuar.toFixed(2)} + 0.10) × ${P} m`,
            calculatedValue: volGalian,
            unit: 'm³',
          },
          {
            stepNumber: 2,
            code: 'UNIT_UDITCH',
            description: 'Kebutuhan Box U-Ditch Precast (1.20 m/unit)',
            formulaText: `${P} m / 1.20 m`,
            calculatedValue: jmlUnitUDitch,
            unit: 'unit',
          },
          {
            stepNumber: 3,
            code: 'UNIT_COVER',
            description: 'Kebutuhan Tutup Cover U-Ditch (0.60 m/unit)',
            formulaText: tipeCover > 0 ? `${P} m / 0.60 m` : 'Tanpa Cover',
            calculatedValue: jmlUnitCover,
            unit: 'unit',
          },
        ],
        materials: [
          { name: `U-Ditch Precast ${(lebar * 100).toFixed(0)}x${(tinggi * 100).toFixed(0)} cm (Panjang 1.20 m)`, quantity: jmlUnitUDitch, unit: 'unit' },
          ...(tipeCover > 0
            ? [{ name: `Cover U-Ditch ${(lebar * 100).toFixed(0)} cm ${tipeCover === 2 ? 'Heavy Duty (Beban Gandar)' : 'Light Duty'} (Panjang 0.60 m)`, quantity: jmlUnitCover, unit: 'unit' }]
            : []),
          { name: 'Pasir Pasang Alas Bedding Saluran (Tebal 10 cm)', quantity: volPasirAlas, unit: 'm³' },
          { name: 'Semen Mortar Pengisi Nat Sambungan U-Ditch', quantity: volMortarSambungan, unit: 'm³' },
        ],
        labor: [
          { role: 'Tukang Pasang Saluran Precast', hoursOrDays: SafeDecimalEngine.safeRound(P * 0.10, 2), unit: 'OH' },
          { role: 'Pekerja', hoursOrDays: SafeDecimalEngine.safeRound(P * 0.25, 2), unit: 'OH' },
          { role: 'Mandor', hoursOrDays: SafeDecimalEngine.safeRound(P * 0.01, 2), unit: 'OH' },
        ],
        equipment: [
          { name: 'Tripod Crane / Excavator Mini (Pemasang Precast)', quantity: Math.ceil(P / 40), unit: 'sewa-hari' },
        ],
      };
    },
    diagramComponentKey: 'UDitchDiagram',
  },
];

import { RESIDENTIAL_PACK_CALCULATORS } from '../calculatorCore/residential/residentialPackCalculators';
import { CalculatorDefinition } from '../calculatorCore/contracts/types';

function adaptResidentialToSpec(def: CalculatorDefinition): ConstructionCalculatorSpec {
  return {
    id: def.id,
    category: (def.category === 'site' || def.category === 'persiapan'
      ? 'persiapan'
      : def.category === 'structure' || def.category === 'struktur'
      ? 'struktur'
      : def.category === 'mep'
      ? 'mep'
      : def.category === 'finishing'
      ? 'finishing'
      : def.category === 'roof'
      ? 'arsitektur'
      : 'arsitektur') as any,
    title: def.name,
    shortName: def.shortName || def.name,
    codePrefix: `QTO.${def.id.replace('residential.', '').toUpperCase()}`,
    version: def.version,
    excelSheetName: def.formulaSource?.sheet || def.name,
    description: def.description,
    primaryUnit: def.primaryUnit,
    primaryQuantityLabel: def.primaryQuantityLabel || def.name,
    parameters: def.parameters.map((p) => ({
      id: p.id,
      label: p.label || p.id,
      description: p.description || p.label || p.id,
      unit: p.unit || '',
      defaultValue: typeof p.defaultValue === 'number' ? p.defaultValue : 0,
      min: p.min,
      max: p.max,
      step: p.step || 0.1,
      category: 'dimensi',
      options: p.options,
    })),
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const output = def.calculate(inputs, { projectId: 'UI_PREVIEW' });
      return {
        primaryQuantity: output.primaryQuantity,
        primaryUnit: output.primaryUnit,
        primaryLabel: output.primaryLabel,
        breakdown: output.breakdown,
        formulaSteps: (output.detailedBreakdown || []).map((b, i) => ({
          stepNumber: i + 1,
          code: b.code,
          description: b.label,
          formulaText: b.formulaText || b.code,
          calculatedValue: b.value,
          unit: b.unit,
        })),
        materials: output.materials.map((m) => ({
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          coefficient: m.coefficient,
          unitPriceEstimate: (m as any).unitPriceEstimate,
        })),
        labor: output.labor.map((l) => ({
          role: l.role,
          hoursOrDays: l.hoursOrDays,
          unit: l.unit,
          coefficient: l.coefficient,
        })),
        equipment: output.equipment?.map((eq) => ({
          name: eq.name,
          quantity: eq.quantity,
          unit: eq.unit,
          coefficient: eq.coefficient,
        })),
        technicalNotes: [
          `Formula ID: ${def.formulaSource?.formulaId || 'GEOMETRIC'}`,
          `Formula: ${def.formulaSource?.mathematicalExpression || 'Solid Euclidean Geometry'}`,
          `Source: ${def.formulaSource?.workbook ? `${def.formulaSource.workbook} (Sheet ${def.formulaSource.sheet})` : (def.formulaSource as any)?.referenceName || (def.formulaSource as any)?.documentRef || 'Standard Formulation'}`,
          `Status: ${def.status || 'VERIFIED'}`,
        ],
      };
    },
    diagramComponentKey:
      def.id === 'residential.cut_and_fill' || def.id === 'residential.galian_tanah'
        ? 'PondasiDiagram'
        : def.id === 'residential.kolom'
        ? 'KolomDiagram'
        : def.id === 'residential.sloof' || def.id === 'residential.balok'
        ? 'SloofDiagram'
        : def.id === 'residential.dinding'
        ? 'DindingDiagram'
        : def.id === 'residential.atap_baja_ringan'
        ? 'AtapBajaRinganDiagram'
        : def.id === 'residential.pondasi_batu_kali'
        ? 'PondasiDiagram'
        : def.id === 'residential.pondasi_beton_footing'
        ? 'FootPlateDiagram'
        : def.id.includes('penutup') || def.id.includes('plester')
        ? 'FinishingDiagram'
        : 'GenericCalculatorDiagram',
  };
}

import { ROAD_PACK_CALCULATORS } from '../calculatorCore/road/roadPackCalculators';

function adaptRoadToSpec(def: CalculatorDefinition): ConstructionCalculatorSpec {
  return {
    id: def.id,
    category: 'infrastruktur',
    title: def.name,
    shortName: def.shortName || def.name,
    codePrefix: `QTO.${def.id.replace('road.', '').toUpperCase()}`,
    version: def.version,
    excelSheetName: def.formulaSource?.sheet || def.name,
    description: def.description,
    primaryUnit: def.primaryUnit,
    primaryQuantityLabel: def.primaryQuantityLabel || def.name,
    parameters: def.parameters.map((p) => ({
      id: p.id,
      label: p.label || p.id,
      description: p.description || p.label || p.id,
      unit: p.unit || '',
      defaultValue: typeof p.defaultValue === 'number' ? p.defaultValue : 0,
      min: p.min,
      max: p.max,
      step: p.step || 0.1,
      category: 'dimensi',
      options: p.options,
    })),
    calculate: (inputs: Record<string, number>): CalculationResult => {
      const output = def.calculate(inputs, { projectId: 'UI_PREVIEW' });
      return {
        primaryQuantity: output.primaryQuantity,
        primaryUnit: output.primaryUnit,
        primaryLabel: output.primaryLabel,
        breakdown: output.breakdown,
        formulaSteps: (output.detailedBreakdown || []).map((b, i) => ({
          stepNumber: i + 1,
          code: b.code,
          description: b.label,
          formulaText: b.formulaText || b.code,
          calculatedValue: b.value,
          unit: b.unit,
        })),
        materials: output.materials.map((m) => ({
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          coefficient: m.coefficient,
          unitPriceEstimate: (m as any).unitPriceEstimate,
        })),
        labor: output.labor.map((l) => ({
          role: l.role,
          hoursOrDays: l.hoursOrDays,
          unit: l.unit,
          coefficient: l.coefficient,
        })),
        equipment: output.equipment?.map((eq) => ({
          name: eq.name,
          quantity: eq.quantity,
          unit: eq.unit,
          coefficient: eq.coefficient,
        })),
        technicalNotes: [
          `Formula ID: ${def.formulaSource?.formulaId || 'GEOMETRIC'}`,
          `Formula: ${def.formulaSource?.mathematicalExpression || 'Civil Road Takeoff'}`,
          `Source: ${(def.formulaSource as any)?.referenceName || (def.formulaSource as any)?.documentRef || 'Bina Marga Standard'}`,
          `Status: ${def.status || 'VERIFIED'}`,
          ...((output.warnings || []).map((w: any) => typeof w === 'string' ? w : w.message)),
        ],
      };
    },
    diagramComponentKey: 'GenericCalculatorDiagram',
  };
}

import { ALL_CIVIL_EXPANSION_CALCULATORS } from '../calculatorCore/civil';

export const RESIDENTIAL_CALCULATOR_SPECS: ConstructionCalculatorSpec[] =
  RESIDENTIAL_PACK_CALCULATORS.map(adaptResidentialToSpec);

export const ROAD_CALCULATOR_SPECS: ConstructionCalculatorSpec[] =
  ROAD_PACK_CALCULATORS.map(adaptRoadToSpec);

export const CIVIL_EXPANSION_CALCULATOR_SPECS: ConstructionCalculatorSpec[] =
  ALL_CIVIL_EXPANSION_CALCULATORS.map(adaptRoadToSpec);

export const ALL_CONSTRUCTION_CALCULATORS: ConstructionCalculatorSpec[] = [
  ...CONSTRUCTION_CALCULATORS,
  ...RESIDENTIAL_CALCULATOR_SPECS,
  ...ROAD_CALCULATOR_SPECS,
  ...CIVIL_EXPANSION_CALCULATOR_SPECS,
];

export function getCalculatorById(id: string): ConstructionCalculatorSpec | undefined {
  if (!id) return undefined;
  const norm = id.trim().toLowerCase();
  const found = ALL_CONSTRUCTION_CALCULATORS.find(
    (c) => c.id.toLowerCase() === norm || c.id.toUpperCase() === id.toUpperCase()
  );
  if (found) return found;

  const aliasMap: Record<string, string> = {
    'saluran_u_ditch': 'SALURAN_UDITCH',
    'saluran_uditch': 'SALURAN_UDITCH',
    'instalasi_air': 'AIR_BERSIH',
    'pipa_air': 'AIR_BERSIH',
  };
  if (aliasMap[norm]) {
    const target = aliasMap[norm];
    return ALL_CONSTRUCTION_CALCULATORS.find((c) => c.id === target);
  }

  const prefixes = ['residential.', 'road.', 'drainage.', 'bridge.', 'irrigation.', 'river.', 'weir.', 'embung.', 'dam.', 'water.'];
  for (const prefix of prefixes) {
    if (!norm.startsWith(prefix)) {
      const candidate = ALL_CONSTRUCTION_CALCULATORS.find((c) => c.id === `${prefix}${norm}`);
      if (candidate) return candidate;
    }
  }

  const legacyUpper = norm.replace(/^(residential|road|drainage|bridge|irrigation|river|weir|embung|dam|water)\./, '').toUpperCase();
  return CONSTRUCTION_CALCULATORS.find((c) => c.id.toUpperCase() === legacyUpper);
}


