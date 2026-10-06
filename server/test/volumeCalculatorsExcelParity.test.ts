import { describe, it, expect } from 'vitest';
import {
  CONSTRUCTION_CALCULATORS,
  getCalculatorById,
} from '../../src/engine/constructionCalculators/registry';
import {
  WF_PROFILE_REGISTRY,
  calculateTheoreticalWfWeight,
  findWfProfile,
} from '../../src/engine/constructionCalculators/wfProfileRegistry';

describe('EZRAB — VOLUME CALCULATION EXCEL PARITY & BAJA WF TEST SUITE', () => {
  // =========================================================================
  // 1. REGISTRY INTEGRITY & DISCOVERY
  // =========================================================================
  describe('Calculator Registry Discovery & Integrity', () => {
    it('should contain all 19 Excel-parity calculators + Baja WF + Infrastructure', () => {
      expect(CONSTRUCTION_CALCULATORS.length).toBeGreaterThanOrEqual(20);

      const registeredIds = CONSTRUCTION_CALCULATORS.map((c) => c.id);
      
      // 19 Master Excel Calculators
      const expected19 = [
        'BOWPLANK',
        'PONDASI',
        'FOOT_PLATE',
        'SLOOF',
        'KOLOM',
        'BALOK',
        'BATA_RINGAN',
        'BATA_MERAH',
        'BATAKO',
        'PINTU_JENDELA',
        'ATAP_BAJA_RINGAN',
        'PLESTERAN_ACIAN',
        'PENUTUP_LANTAI',
        'PENUTUP_DINDING',
        'PLAFON',
        'PENGECATAN',
        'KELISTRIKAN',
        'AIR_BERSIH',
        'SANITAIR',
      ];

      expected19.forEach((id) => {
        expect(registeredIds).toContain(id);
        const spec = getCalculatorById(id);
        expect(spec).toBeDefined();
        expect(spec?.parameters.length).toBeGreaterThan(0);
        expect(typeof spec?.calculate).toBe('function');
      });

      // Baja WF
      expect(registeredIds).toContain('BAJA_WF');
      const wfSpec = getCalculatorById('BAJA_WF');
      expect(wfSpec).toBeDefined();
      expect(wfSpec?.category).toBe('struktur');
      expect(wfSpec?.primaryUnit).toBe('kg');
    });

    it('should retrieve calculators case-insensitively', () => {
      expect(getCalculatorById('bowplank')?.id).toBe('BOWPLANK');
      expect(getCalculatorById('Baja_Wf')?.id).toBe('BAJA_WF');
      expect(getCalculatorById('sloof')?.id).toBe('SLOOF');
      expect(getCalculatorById('kolom')?.id).toBe('KOLOM');
    });
  });

  // =========================================================================
  // 2. PARITY TESTS FOR 19 MASTER EXCEL CALCULATORS
  // =========================================================================
  describe('19 Master Excel Calculators — Formula & Parity Verification', () => {
    // 01. Bowplank
    it('01 Bowplank: should calculate perimeter and timber breakdown correctly', () => {
      const calc = getCalculatorById('BOWPLANK')!;
      const result = calc.calculate({ P: 12, L: 8, C: 0.60, H: 1.0, R: 2.0 });

      // Perimeter = 2 * (12 + 8 + 2 * 0.60) = 2 * 21.2 = 42.4 m
      expect(result.primaryQuantity).toBe(42.4);
      expect(result.primaryUnit).toBe('m');
      expect(result.breakdown.kelilingBowplank).toBe(42.4);
      expect(result.breakdown.luasLahan).toBe(96);
      expect(result.formulaSteps.length).toBeGreaterThanOrEqual(4);
      expect(result.materials.length).toBeGreaterThanOrEqual(3);
    });

    // 02. Pondasi (Golden Screenshot Parity)
    it('02 Pondasi: should match exact Excel screenshot golden scenario 100%', () => {
      const calc = getCalculatorById('PONDASI')!;
      
      // Exact inputs from Excel Screenshot:
      const result = calc.calculate({
        a1: 2.00,
        b1Galian: 2.00,
        c1: 2.00,
        P: 2.00,
        a2: 2.00,
        b2: 2.00,
        c2: 2.00,
        d: 2.00,
        e: 2.00,
        f: 0.40,
        urukanSamping: 25.0,
        panjangBangunan: 9.00,
        lebarBangunan: 6.00,
        tipeCampuran: 1, // 1SP : 3PP
      });

      // Section 2.2 Volume Verification
      expect(result.breakdown.volumeGalianM3).toBe(8.00);
      expect(result.breakdown.volumePondasiM3).toBe(8.00);
      expect(result.breakdown.volumeAanstampingM3).toBe(8.00);
      expect(result.breakdown.volumePasirUrukM3).toBe(8.00);
      expect(result.breakdown.volumeUrukanBawahLantaiM3).toBe(21.60);
      expect(result.breakdown.volumeUrukanSampingM3).toBe(2.00);
      expect(result.breakdown.volumeUrukanKembaliM3).toBe(8.00); // 8.00 m3 matching Excel screenshot

      // Section 2.3 AHSP Material & Labor Breakdown Verification
      const batuBelahPasangan = result.materials.find((m) => m.name.includes('Batu Belah Pasangan'));
      expect(batuBelahPasangan?.quantity).toBe(9.60); // 8 * 1.2

      const semen = result.materials.find((m) => m.name.includes('Semen Portland'));
      expect(semen?.quantity).toBe(32.32); // (8 * 202) / 50 = 32.32 sak

      const pasirPasang = result.materials.find((m) => m.name.includes('Pasir Pasang'));
      expect(pasirPasang?.quantity).toBe(3.88); // 8 * 0.485 = 3.88 m3

      const tanahUruk = result.materials.find((m) => m.name.includes('Tanah Uruk'));
      expect(tanahUruk?.quantity).toBe(33.04); // (21.60 + 2.00) * 1.4 = 33.04 m3

      const tukang = result.labor.find((l) => l.role.includes('Tukang Batu'));
      expect(tukang?.hoursOrDays).toBe(7.12); // 8 * 0.39 + 8 * 0.50 = 7.12 OH
    });

    // 02. Pondasi (Standard Trapezoidal Dimension)
    it('02 Pondasi: should calculate standard stone masonry, aanstampen, and excavation', () => {
      const calc = getCalculatorById('PONDASI')!;
      const result = calc.calculate({ b1: 0.30, b2: 0.70, h: 0.80, L: 45.0, ta: 0.20, tp: 0.05 });

      // Luas trapesium = 0.5 * (0.3 + 0.7) * 0.8 = 0.40 m2
      // Vol batu kali = 0.40 * 45 = 18.0 m3
      expect(result.primaryQuantity).toBe(18.0);
      expect(result.primaryUnit).toBe('m³');
      expect(result.breakdown.volumePondasiBatuKali).toBe(18.0);
      expect(result.breakdown.volumeAanstampenBatuKosong).toBe(6.3); // 0.7 * 0.2 * 45 = 6.3
    });

    // 03. Foot Plate (Golden Screenshot Parity)
    it('03 Foot Plate: should match exact Excel screenshot golden scenario 100%', () => {
      const calc = getCalculatorById('FOOT_PLATE')!;
      const result = calc.calculate({
        a1: 0.25,
        a2: 0.25,
        b1: 0.70,
        b2: 0.70,
        h1: 1.50,
        h2: 0.10,
        h3: 0.30,
        h4: 0.05,
        h5: 0.10,
        N: 5,
        d1: 16,
        d2: 16,
        d3: 10,
        diaKawat: 1.2,
        nUtama: 3,
        nSupport: 3,
        r1: 0.15,
        pKawat: 0.35,
        d4: 13,
        d5: 13,
        d6: 10,
        r2: 0.15,
        selimut: 0.03,
        massaJenis: 7850,
      });

      // Section 3.2 Volume Verification
      expect(result.breakdown.galianPondasiM3).toBe(5.02);
      expect(result.breakdown.uruganPasirPondasiM3).toBe(0.25);
      expect(result.breakdown.pekerjaanPembesianKg).toBe(334.71);
      expect(result.breakdown.pekerjaanBekistingM2).toBe(11.70);
      expect(result.breakdown.pekerjaanCorM3).toBe(1.33);
      expect(result.breakdown.jumlahKawatBetonKg).toBe(1.52);
      expect(result.breakdown.volumeLantaiKerjaM3).toBe(0.12);

      // Panjang besi d1..d6
      expect(result.breakdown.panjangBesiD1M).toBe(34.65);
      expect(result.breakdown.panjangBesiD2M).toBe(34.65);
      expect(result.breakdown.panjangBesiD3M).toBe(73.80);
      expect(result.breakdown.panjangBesiD4M).toBe(54.40);
      expect(result.breakdown.panjangBesiD5M).toBe(99.73);
      expect(result.breakdown.panjangBesiD6M).toBe(29.00);

      // Section 3.3 Result Bahan & Upah
      const besiUtama16 = result.materials.find((m) => m.name.includes('Besi utama, dia: 16 mm'));
      expect(besiUtama16?.quantity).toBe(2.89);

      const semen = result.materials.find((m) => m.name.includes('Semen Portland'));
      expect(semen?.quantity).toBe(10.80);

      const pekerja = result.labor.find((l) => l.role === 'Pekerja');
      expect(pekerja?.hoursOrDays).toBe(13.52);

      const tukang = result.labor.find((l) => l.role === 'Tukang');
      expect(tukang?.hoursOrDays).toBe(4.43);
    });

    // 03. Foot Plate (Generic)
    it('03 Foot Plate: should calculate concrete and rebar for isolated footings', () => {
      const calc = getCalculatorById('FOOT_PLATE')!;
      const result = calc.calculate({ P: 1.0, L: 1.0, t1: 0.25, bk: 0.25, hk: 0.25, hp: 1.0, N: 12, diaAlas: 13, spasiAlas: 15 });

      expect(result.primaryQuantity).toBeGreaterThan(0);
      expect(result.primaryUnit).toBe('m³');
      expect(result.breakdown.volumeBetonFootPlate).toBeGreaterThan(0);
      expect(result.breakdown.totalBeratBesiTulanganKg).toBeGreaterThan(0);
    });

    // 04. Sloof (Golden Screenshot Parity)
    it('04 Sloof: should match exact Excel screenshot golden scenario 100%', () => {
      const calc = getCalculatorById('SLOOF')!;
      const result = calc.calculate({
        P: 3.00,
        b: 0.20,
        h: 0.30,
        n: 5,
        diaUtama1: 10,
        diaUtama2: 8,
        diaSengkang: 6,
        diaKawat: 1.2,
        nUtama1: 4,
        nUtama2: 2,
        sTumpuan: 15,
        sLapangan: 20,
        selimut: 2.5,
        pKait: 0.10,
        pOverstek: 0.30,
        pKawat: 0.35,
        massaJenis: 7850,
      });

      // Section 4.2 Volume Verification
      expect(result.breakdown.pekerjaanPembesianKg).toBe(82.27);
      expect(result.breakdown.pekerjaanBekistingM2).toBe(9.00);
      expect(result.breakdown.pekerjaanCorSloofM3).toBe(0.90);
      expect(result.breakdown.jumlahKawatBetonKg).toBe(1.96);
      expect(result.breakdown.panjangBesiTulangan1M).toBe(76.00);
      expect(result.breakdown.panjangBesiTulangan2M).toBe(38.00);
      expect(result.breakdown.panjangBesiSengkangM).toBe(92.00);
      expect(result.breakdown.panjangKawatBetonM).toBe(220.50);

      // Section 4.3 Result Bahan & Upah
      const besi10 = result.materials.find((m) => m.name.includes('Besi diameter: 10 mm'));
      expect(besi10?.quantity).toBe(6.33);

      const semen = result.materials.find((m) => m.name.includes('Semen Portland'));
      expect(semen?.quantity).toBe(6.62);

      const pekerja = result.labor.find((l) => l.role === 'Pekerja');
      expect(pekerja?.hoursOrDays).toBe(6.66);
    });

    // 04. Sloof (Generic)
    it('04 Sloof: should calculate concrete, rebar weight, and formwork', () => {
      const calc = getCalculatorById('SLOOF')!;
      const result = calc.calculate({ P: 3.0, b: 0.20, h: 0.30, n: 5 });

      // Total length = 3 * 5 = 15 m
      // Vol beton = 0.20 * 0.30 * 15 = 0.90 m3
      expect(result.primaryQuantity).toBe(0.90);
      expect(result.primaryUnit).toBe('m³');
      expect(result.breakdown.pekerjaanCorSloofM3).toBe(0.90);
      expect(result.breakdown.pekerjaanPembesianKg).toBeGreaterThan(0);
    });

    // 05. Kolom (Golden Screenshot Parity)
    it('05 Kolom: should match exact Excel screenshot golden scenario 100%', () => {
      const calc = getCalculatorById('KOLOM')!;
      const result = calc.calculate({
        T: 3.00,
        L: 0.15,
        P: 0.25,
        n: 5,
        D1: 12,
        D2: 10,
        diaSengkang: 8,
        diaKawat: 1.2,
        nUtama: 4,
        nSupport: 2,
        jarakSengkang: 15,
        selimut: 2.5,
        pKaitAtas: 0.12,
        pKaitBawah: 0.12,
        pKawat: 0.35,
        massaJenis: 7850,
      });

      // Section 5.2 Volume Verification
      expect(result.breakdown.pekerjaanPembesianKg).toBe(107.67);
      expect(result.breakdown.pekerjaanBekistingM2).toBe(12.00);
      expect(result.breakdown.pekerjaanCorKolomM3).toBe(0.56);
      expect(result.breakdown.jumlahKawatBetonKg).toBe(2.05);
      expect(result.breakdown.panjangBesiUtamaM).toBe(64.80);
      expect(result.breakdown.panjangBesiSupportM).toBe(32.40);
      expect(result.breakdown.panjangBesiSengkangM).toBe(76.44);
      expect(result.breakdown.panjangKawatBetonM).toBe(231.00);

      // Section 5.3 Result Bahan & Upah
      const besi12 = result.materials.find((m) => m.name.includes('Besi utama Ø, 12 mm'));
      expect(besi12?.quantity).toBe(5.40);

      const semen = result.materials.find((m) => m.name.includes('Semen Portland'));
      expect(semen?.quantity).toBe(4.14);

      const pekerja = result.labor.find((l) => l.role === 'Pekerja');
      expect(pekerja?.hoursOrDays).toBe(9.50);
    });

    // 05. Kolom (Generic)
    it('05 Kolom: should calculate column concrete, stirrups, and longitudinal bars', () => {
      const calc = getCalculatorById('KOLOM')!;
      const result = calc.calculate({ H: 3.5, b: 0.15, h: 0.15, N: 16, nUtama: 4, diaUtama: 10, diaSengkang: 6, jarakSengkang: 15 });

      // Total volume = 0.15 * 0.15 * 3.5 * 16 = 1.26 m3
      expect(result.primaryQuantity).toBe(1.26);
      expect(result.primaryUnit).toBe('m³');
      expect(result.breakdown.volumeBetonKolom).toBe(1.26);
      expect(result.breakdown.totalBeratBesiKg).toBeGreaterThan(0);
    });

    // 06. Balok
    it('06 Balok: should calculate reinforced concrete beam quantities', () => {
      const calc = getCalculatorById('BALOK')!;
      const result = calc.calculate({ L: 32.0, b: 0.20, h: 0.35, nUtama: 6 });

      // Total length = 32 m
      // Vol beton = 0.20 * 0.35 * 32 = 2.24 m3
      expect(result.primaryQuantity).toBe(2.24);
      expect(result.primaryUnit).toBe('m³');
      expect(result.breakdown.volumeBetonBalok).toBe(2.24);
    });

    // 07. Bata Ringan (Golden Screenshot Parity)
    it('07 Bata Ringan: should match exact Excel screenshot golden scenario 100%', () => {
      const calc = getCalculatorById('BATA_RINGAN')!;
      const result = calc.calculate({
        Pi: 36.00,
        Pe: 39.00,
        T: 3.80,
        aPintu: 2.10,
        bPintu: 0.90,
        jmlPintu: 6,
        mJendela: 1.50,
        m1Jendela: 0.70,
        jmlJendela: 7,
        xBouven: 0.20,
        yBouven: 0.30,
        jmlBouven: 26,
        T2Ampig: 2.30,
        a2Ampig: 9.00,
        jmlAmpig: 2,
        x1Pengurang: 0.00,
        x2Pengurang: 0.00,
        x3Pengurang: 0.00,
        tebalPilihan: 1, // 7.5 cm
      });

      // Section 7.2 Volume Verification
      expect(result.breakdown.luasPasanganDindingM2).toBe(285.45);
      expect(result.breakdown.luasAmpigSopiSopiM2).toBe(20.70);
      expect(result.breakdown.luasPengurangDindingM2).toBe(20.25);
      expect(result.breakdown.jumlahBataRinganBuah).toBe(2497.69);
      expect(result.breakdown.kebutuhanMortarSak40kg).toBe(18.35);

      // Section 7.3 Result Bahan & Upah
      const bataRingan = result.materials.find((m) => m.name.includes('Bata ringan tebal 7.5 cm'));
      expect(bataRingan?.quantity).toBe(2497.69);

      const mortar = result.materials.find((m) => m.name.includes('Mortar'));
      expect(mortar?.quantity).toBe(18.35);

      const pekerja = result.labor.find((l) => l.role === 'Pekerja');
      expect(pekerja?.hoursOrDays).toBe(47.87);

      const tukang = result.labor.find((l) => l.role === 'Tukang');
      expect(tukang?.hoursOrDays).toBe(23.78);
    });

    // 07. Bata Ringan (Generic)
    it('07 Bata Ringan: should calculate wall area, block cubic meters, and mortar', () => {
      const calc = getCalculatorById('BATA_RINGAN')!;
      const result = calc.calculate({ P: 10, H: 3.2, Abukaan: 4.5, Asop: 0.0, tebalHebel: 10 });

      // Net area = 10 * 3.2 - 4.5 = 32 - 4.5 = 27.5 m2
      expect(result.primaryQuantity).toBe(27.5);
      expect(result.primaryUnit).toBe('m²');
      expect(result.breakdown.volumeKubikasiHebelM3).toBe(2.75); // 27.5 * 0.10
    });

    // 08. Bata Merah
    it('08 Bata Merah: should calculate red brick wall area and brick count', () => {
      const calc = getCalculatorById('BATA_MERAH')!;
      const result = calc.calculate({ P: 10, H: 3.0, Abukaan: 4.0, Asop: 0.0 });

      // Net area = 30 - 4 = 26 m2
      expect(result.primaryQuantity).toBe(26.0);
      expect(result.primaryUnit).toBe('m²');
      expect(result.breakdown.jumlahBataMerahPcs).toBe(1820); // 26 * 70
    });

    // 09. Batako
    it('09 Batako: should calculate batako block wall area and block count', () => {
      const calc = getCalculatorById('BATAKO')!;
      const result = calc.calculate({ P: 10, H: 3.0, Abukaan: 4.0, Asop: 0.0 });

      // Net area = 26 m2
      expect(result.primaryQuantity).toBe(26.0);
      expect(result.breakdown.jumlahBatakoPcs).toBe(325); // 26 * 12.5 = 325
    });

    // 10. Pintu & Jendela
    it('10 Pintu & Jendela: should calculate frame length, leaf area, and hardware', () => {
      const calc = getCalculatorById('PINTU_JENDELA')!;
      const result = calc.calculate({ nPintuUtama: 1, nPintuKamar: 4, nPintuKM: 2, nJendelaGanda: 3, nJendelaTunggal: 4 });

      expect(result.primaryQuantity).toBeGreaterThan(0);
      expect(result.breakdown.panjangKusenTotalM).toBeGreaterThan(0);
      expect(result.breakdown.totalPintuUnit).toBe(7);
      expect(result.breakdown.totalJendelaUnit).toBe(7);
    });

    // 11. Atap Baja Ringan
    it('11 Atap Baja Ringan: should calculate roof surface area with pitch angle', () => {
      const calc = getCalculatorById('ATAP_BAJA_RINGAN')!;
      const result = calc.calculate({ Lb: 8.0, Pb: 10.0, sudut: 30, overstek: 0.80, jarakKuda: 1.20 });

      // Sisi miring = (8/2 + 0.80) / cos(30) = 4.8 / 0.866025 = 5.54256 m
      // Panjang total = 10 + 2 * 0.8 = 11.6 m
      // Luas atap pelana = 2 * 5.54256 * 11.6 = 128.59 m2
      expect(result.primaryQuantity).toBeCloseTo(128.59, 1);
      expect(result.primaryUnit).toBe('m²');
    });

    // 12. Plesteran & Acian
    it('12 Plesteran & Acian: should calculate 2-side plastering and skim coat', () => {
      const calc = getCalculatorById('PLESTERAN_ACIAN')!;
      const result = calc.calculate({ luasDinding: 50, sisiPlester: 2, tebalPlester: 15 });

      // Total luas = 50 * 2 = 100 m2
      expect(result.primaryQuantity).toBe(100);
      expect(result.primaryUnit).toBe('m²');
      expect(result.breakdown.luasAcianM2).toBe(100);
    });

    // 13. Penutup Lantai
    it('13 Penutup Lantai: should calculate floor tiling and box count', () => {
      const calc = getCalculatorById('PENUTUP_LANTAI')!;
      const result = calc.calculate({ P: 6.0, L: 5.0, waste: 5.0, ukuranUbin: 60 });

      // Net area = 30 m2
      expect(result.primaryQuantity).toBe(30.0);
      expect(result.primaryUnit).toBe('m²');
      expect(result.breakdown.luasLantaiPlusWasteM2).toBe(31.5);
      expect(result.breakdown.kebutuhanDusGranitDus).toBeGreaterThan(0);
    });

    // 14. Penutup Dinding
    it('14 Penutup Dinding: should calculate wall ceramic tiling', () => {
      const calc = getCalculatorById('PENUTUP_DINDING')!;
      const result = calc.calculate({ K: 12, H: 2.0, Abukaan: 2.0 });

      // Net = (12 * 2.0 - 2.0) * 1.05 = 22 * 1.05 = 23.1 m2
      expect(result.primaryQuantity).toBe(23.1);
      expect(result.primaryUnit).toBe('m²');
    });

    // 15. Plafon
    it('15 Plafon: should calculate gypsum ceiling and metal furing frame', () => {
      const calc = getCalculatorById('PLAFON')!;
      const result = calc.calculate({ P: 6.0, L: 5.0 });

      // Net = 30 m2
      expect(result.primaryQuantity).toBe(30.0);
      expect(result.primaryUnit).toBe('m²');
      expect(result.breakdown.kebutuhanLembarGypsumLembar).toBeGreaterThan(0);
    });

    // 16. Pengecatan
    it('16 Pengecatan: should calculate wall & ceiling painting with 3 coats', () => {
      const calc = getCalculatorById('PENGECATAN')!;
      const result = calc.calculate({ luasInterior: 80, luasEksterior: 0, luasPlafon: 30 });

      // 80 + 0 + 30 = 110 m2
      expect(result.primaryQuantity).toBe(110);
      expect(result.primaryUnit).toBe('m²');
      expect(result.breakdown.kebutuhanCatInteriorPail20kg).toBeGreaterThan(0);
    });

    // 17. Kelistrikan
    it('17 Kelistrikan: should calculate electrical points, MCB, and cable lengths', () => {
      const calc = getCalculatorById('KELISTRIKAN')!;
      const result = calc.calculate({ nLampu: 12, nStopKontak: 8, nSaklarTunggal: 4, nSaklarGanda: 2, nMcb: 4 });

      // Total points = 12 + 8 + 4 + 2 = 26 titik
      expect(result.primaryQuantity).toBe(26);
      expect(result.primaryUnit).toBe('titik');
      expect(result.breakdown.panjangKabelNYMM).toBeGreaterThan(0);
    });

    // 18. Instalasi Air Bersih
    it('18 Air Bersih: should calculate pipe lengths, fittings, and accessories', () => {
      const calc = getCalculatorById('AIR_BERSIH')!;
      const result = calc.calculate({ pjgPipaUtama: 20, pjgPipaCabang: 15, nKran: 5 });

      // Total length = 35 m
      expect(result.primaryQuantity).toBe(35);
      expect(result.primaryUnit).toBe('m');
      expect(result.breakdown.kebutuhanBatang34Batang).toBe(5); // 20 / 4 = 5
      expect(result.breakdown.kebutuhanBatang12Batang).toBe(4); // 15 / 4 = 3.75 -> 4
    });

    // 19. Sanitair
    it('19 Sanitair: should calculate sanitary fixtures count', () => {
      const calc = getCalculatorById('SANITAIR')!;
      const result = calc.calculate({ nKlosetDuduk: 2, nKlosetJongkok: 0, nWastafel: 2, nFloorDrain: 2, nShowerSet: 4 });

      // Total fixtures = 2 + 0 + 2 + 2 + 4 = 10 unit
      expect(result.primaryQuantity).toBe(10);
      expect(result.primaryUnit).toBe('unit');
    });
  });

  // =========================================================================
  // 3. BAJA WF MODULE (SNI 07-7178-2006 & THEORETICAL MODE)
  // =========================================================================
  describe('Structural Steel Baja WF Module — Parity & SNI Profile Tests', () => {
    it('should have official standard profiles in WF_PROFILE_REGISTRY', () => {
      expect(WF_PROFILE_REGISTRY.length).toBeGreaterThanOrEqual(20);

      // Verify WF 200x100x5.5x8
      const wf200 = findWfProfile('WF 200 x 100 x 5.5 x 8');
      expect(wf200).toBeDefined();
      expect(wf200?.weightKgPerM).toBe(21.3);
      expect(wf200?.depthMm).toBe(200);
      expect(wf200?.flangeWidthMm).toBe(100);
      expect(wf200?.webThicknessMm).toBe(5.5);
      expect(wf200?.flangeThicknessMm).toBe(8);
      expect(wf200?.verified).toBe(true);
      expect(wf200?.source).toContain('SNI 07-7178-2006');

      // Verify WF 150x75x5x7
      const wf150 = findWfProfile('WF 150 x 75 x 5 x 7');
      expect(wf150).toBeDefined();
      expect(wf150?.weightKgPerM).toBe(14.0);

      // Verify WF 300x150x6.5x9
      const wf300 = findWfProfile('WF 300 x 150 x 6.5 x 9');
      expect(wf300).toBeDefined();
      expect(wf300?.weightKgPerM).toBe(36.7);
    });

    it('should calculate theoretical WF cross-section area and kg/m accurately', () => {
      // Test theoretical formula: A = 2 * bf * tf + (h - 2 * tf) * tw
      // For WF 200x100x5.5x8:
      // Flange area = 2 * 100 * 8 = 1600 mm2
      // Web area = (200 - 16) * 5.5 = 184 * 5.5 = 1012 mm2
      // Total area = 2612 mm2
      // kg/m = 2612 * 0.00785 = 20.5042 kg/m
      const theoretical = calculateTheoreticalWfWeight(200, 100, 5.5, 8.0);
      expect(theoretical.areaMm2).toBe(2612);
      expect(theoretical.theoreticalKgPerM).toBeCloseTo(20.504, 2);
    });

    it('should compute Baja WF total weight correctly with SNI profile & allowance', () => {
      const wfCalc = getCalculatorById('BAJA_WF')!;
      expect(wfCalc).toBeDefined();

      // Inputs: WF 200x100 (21.3 kg/m), L = 6m, n = 8 btg, waste = 5%, plate = 18 kg, bolt = 8.5 kg, weld = 3.2 kg
      const result = wfCalc.calculate({
        h: 200,
        bf: 100,
        tw: 5.5,
        tf: 8.0,
        kgPerM: 21.3,
        L: 6.0,
        n: 8,
        waste: 5.0,
        plateWeight: 18.0,
        boltWeight: 8.5,
        weldingAllowance: 3.2,
        useTheoretical: 0,
      });

      // totalLength = 6 * 8 = 48 m
      // baseWeight = 48 * 21.3 = 1022.4 kg
      // wasteWeight = 1022.4 * 0.05 = 51.12 kg
      // profileWeight = 1022.4 + 51.12 = 1073.52 kg
      // totalSteelWeight = 1073.52 + 18 + 8.5 + 3.2 = 1103.22 kg
      // totalTon = 1.1032 ton
      expect(result.primaryQuantity).toBe(1103.22);
      expect(result.primaryUnit).toBe('kg');
      expect(result.breakdown.totalPanjangM).toBe(48);
      expect(result.breakdown.beratNominalKgPerM).toBe(21.3);
      expect(result.breakdown.beratDasarBajaKg).toBe(1022.4);
      expect(result.breakdown.beratWasteBajaKg).toBe(51.12);
      expect(result.breakdown.beratProfilUtamaKg).toBe(1073.52);
      expect(result.breakdown.beratPlatSambungKg).toBe(18);
      expect(result.breakdown.beratBautKg).toBe(8.5);
      expect(result.breakdown.beratLasKg).toBe(3.2);
      expect(result.breakdown.totalBeratBajaKg).toBe(1103.22);
      expect(result.breakdown.totalBeratTon).toBe(1.1032);

      // Verify technical notes clearly state PROPOSED status and SNI source
      expect(result.technicalNotes?.[0]).toContain('STATUS: PROPOSED / SEPARATELY SOURCED');
      expect(result.formulaSteps.length).toBeGreaterThanOrEqual(5);
    });

    it('should calculate in theoretical mode when selected', () => {
      const wfCalc = getCalculatorById('BAJA_WF')!;
      const result = wfCalc.calculate({
        h: 200,
        bf: 100,
        tw: 5.5,
        tf: 8.0,
        kgPerM: 0, // Auto
        L: 6.0,
        n: 8,
        waste: 5.0,
        plateWeight: 0,
        boltWeight: 0,
        weldingAllowance: 0,
        useTheoretical: 1, // Force theoretical
      });

      // kg/m theoretical = 20.504
      // totalLength = 48 m
      // baseWeight = 48 * 20.504 = 984.192 kg
      // profileWeight = 984.192 * 1.05 = 1033.4016 kg
      expect(result.breakdown.beratNominalKgPerM).toBe(20.504);
      expect(result.primaryQuantity).toBeCloseTo(1033.4, 0);
    });
  });

  // =========================================================================
  // 4. DETERMINISTIC PRECISION & FORMULA TRACE
  // =========================================================================
  describe('Deterministic Engine & Step Trace Consistency', () => {
    it('should generate valid sequential step traces with no NaN values', () => {
      CONSTRUCTION_CALCULATORS.forEach((spec) => {
        const defaultInputs: Record<string, number> = {};
        spec.parameters.forEach((p) => {
          defaultInputs[p.id] = p.defaultValue;
        });

        const result = spec.calculate(defaultInputs);
        expect(Number.isFinite(result.primaryQuantity)).toBe(true);
        expect(result.primaryQuantity).toBeGreaterThan(0);
        expect(result.formulaSteps.length).toBeGreaterThan(0);

        result.formulaSteps.forEach((step, idx) => {
          expect(step.stepNumber).toBe(idx + 1);
          expect(step.code.length).toBeGreaterThan(0);
          expect(step.formulaText.length).toBeGreaterThan(0);
          expect(Number.isFinite(step.calculatedValue)).toBe(true);
          expect(isNaN(step.calculatedValue)).toBe(false);
        });
      });
    });
  });
});
