/**
 * EZRAB CALCULATOR CORE — WORKBOOK CALCULATOR MAP
 * Explicit cell-level mappings between 19 Construction Calculators and EZRAB_VOLUME_CALCULATOR_MASTER.xlsx.
 */

export interface CellMapping {
  parameterId: string;
  label: string;
  cell: string;
  unit: string;
  defaultValue: number;
}

export interface FormulaCellMapping {
  code: string;
  cell: string;
  description: string;
  rawFormula: string;
  unit: string;
}

export interface CalculatorSheetMapping {
  calculatorId: string;
  legacyId: string;
  sheetName: string;
  primaryOutputCell: string;
  primaryUnit: string;
  inputCells: CellMapping[];
  formulaCells: FormulaCellMapping[];
  notes?: string;
}

export const CALCULATOR_WORKBOOK_MAPPINGS: CalculatorSheetMapping[] = [
  // 1. Bowplank
  {
    calculatorId: 'building.persiapan.bowplank',
    legacyId: 'BOWPLANK',
    sheetName: 'Bowplank',
    primaryOutputCell: 'I10',
    primaryUnit: 'm',
    inputCells: [
      { parameterId: 'P', label: 'Panjang Lahan', cell: 'D9', unit: 'm', defaultValue: 12 },
      { parameterId: 'L', label: 'Lebar Lahan', cell: 'D10', unit: 'm', defaultValue: 8 },
      { parameterId: 'C', label: 'Jarak Bebas Plank', cell: 'D11', unit: 'm', defaultValue: 0.60 },
      { parameterId: 'H', label: 'Tinggi Patok', cell: 'D12', unit: 'm', defaultValue: 1.0 },
      { parameterId: 'R', label: 'Jarak Antar Patok', cell: 'D13', unit: 'm', defaultValue: 2.0 },
    ],
    formulaCells: [
      { code: 'I9', cell: 'I9', description: 'Luas Pembersihan Lahan', rawFormula: '=IFERROR(D9*D10,0)', unit: 'm²' },
      { code: 'I10', cell: 'I10', description: 'Keliling Perimeter Bowplank', rawFormula: '=IFERROR(2*(D9+D10+2*D11),0)', unit: 'm' },
      { code: 'I11', cell: 'I11', description: 'Panjang Kayu Patok (5/7)', rawFormula: '=(I10/D13+1)*(D12+0.3)*105%', unit: 'm\'' },
      { code: 'I12', cell: 'I12', description: 'Panjang Papan Bowplank (3/20)', rawFormula: '=I10*105%', unit: 'm\'' },
      { code: 'I13', cell: 'I13', description: 'Panjang Kayu Skur Penguat', rawFormula: '=(0.5*D12*2)*(I10/D13)/2*105%', unit: 'm\'' },
    ],
  },

  // 2. Pondasi Batu Kali
  {
    calculatorId: 'building.struktur.pondasi',
    legacyId: 'PONDASI',
    sheetName: 'Pondasi',
    primaryOutputCell: 'I10',
    primaryUnit: 'm³',
    inputCells: [
      { parameterId: 'a1', label: 'Lebar Atas Galian', cell: 'D9', unit: 'm', defaultValue: 0.90 },
      { parameterId: 'b1Galian', label: 'Lebar Bawah Galian', cell: 'D10', unit: 'm', defaultValue: 0.90 },
      { parameterId: 'c1', label: 'Dalam Galian', cell: 'D11', unit: 'm', defaultValue: 1.05 },
      { parameterId: 'P', label: 'Panjang Pondasi', cell: 'D12', unit: 'm', defaultValue: 45.0 },
      { parameterId: 'a2', label: 'Lebar Atas Pondasi', cell: 'D14', unit: 'm', defaultValue: 0.30 },
      { parameterId: 'b2', label: 'Lebar Bawah Pondasi', cell: 'D15', unit: 'm', defaultValue: 0.70 },
      { parameterId: 'c2', label: 'Tinggi Pondasi', cell: 'D16', unit: 'm', defaultValue: 0.80 },
      { parameterId: 'd', label: 'Tinggi Batu Kosong', cell: 'D17', unit: 'm', defaultValue: 0.20 },
      { parameterId: 'e', label: 'Tinggi Pasir Uruk', cell: 'D18', unit: 'm', defaultValue: 0.05 },
      { parameterId: 'f', label: 'Tebal Urukan Bawah Lantai', cell: 'D20', unit: 'm', defaultValue: 0.40 },
      { parameterId: 'urukanSamping', label: 'Urukan Samping %', cell: 'D21', unit: '%', defaultValue: 25.0 },
      { parameterId: 'panjangBangunan', label: 'Panjang Bangunan', cell: 'D22', unit: 'm', defaultValue: 9.0 },
      { parameterId: 'lebarBangunan', label: 'Lebar Bangunan', cell: 'D23', unit: 'm', defaultValue: 6.0 },
    ],
    formulaCells: [
      { code: 'I9', cell: 'I9', description: 'Volume Galian Tanah', rawFormula: '=IF(D9=D10,SUM((D9*D11)*D12),SUM((D9+D10)/2)*D11*D12)', unit: 'm³' },
      { code: 'I10', cell: 'I10', description: 'Volume Pasangan Pondasi Batu Kali', rawFormula: '=IF(D14=D15,SUM((D14*D16)*D12),SUM((D14+D15)/2)*D16*D12)', unit: 'm³' },
      { code: 'I11', cell: 'I11', description: 'Volume Batu Kosong Aanstamping', rawFormula: '=IFERROR(D12*D10*D17,0)', unit: 'm³' },
      { code: 'I12', cell: 'I12', description: 'Volume Pasir Urug Bawah Pondasi', rawFormula: '=IFERROR(D10*D18*D12,0)', unit: 'm³' },
    ],
  },

  // 3. Foot Plate
  {
    calculatorId: 'building.struktur.foot_plate',
    legacyId: 'FOOT_PLATE',
    sheetName: 'Foot Plate',
    primaryOutputCell: 'I20',
    primaryUnit: 'm³',
    inputCells: [
      { parameterId: 'a1', label: 'Lebar Kolom 1', cell: 'D8', unit: 'm', defaultValue: 0.25 },
      { parameterId: 'a2', label: 'Lebar Kolom 2', cell: 'D9', unit: 'm', defaultValue: 0.25 },
      { parameterId: 'b1', label: 'Lebar Tapak 1', cell: 'D10', unit: 'm', defaultValue: 0.70 },
      { parameterId: 'b2', label: 'Lebar Tapak 2', cell: 'D11', unit: 'm', defaultValue: 0.70 },
      { parameterId: 'h1', label: 'Tinggi Kolom Pedestal', cell: 'D12', unit: 'm', defaultValue: 1.50 },
      { parameterId: 'h2', label: 'Kemiringan Tapak', cell: 'D14', unit: 'm', defaultValue: 0.10 },
      { parameterId: 'h3', label: 'Tinggi Tapak', cell: 'D15', unit: 'm', defaultValue: 0.30 },
      { parameterId: 'h4', label: 'Tinggi Lantai Kerja', cell: 'D16', unit: 'm', defaultValue: 0.05 },
      { parameterId: 'h5', label: 'Tinggi Urugan Pasir', cell: 'D17', unit: 'm', defaultValue: 0.10 },
      { parameterId: 'N', label: 'Jumlah Pondasi Tapak', cell: 'D18', unit: 'unit', defaultValue: 5 },
      { parameterId: 'd1', label: 'Besi Utama Ø', cell: 'D20', unit: 'mm', defaultValue: 16 },
      { parameterId: 'd2', label: 'Besi Support Ø', cell: 'D21', unit: 'mm', defaultValue: 16 },
      { parameterId: 'd3', label: 'Besi Sengkang Ø', cell: 'D22', unit: 'mm', defaultValue: 10 },
      { parameterId: 'diaKawat', label: 'Kawat Beton Ø', cell: 'D23', unit: 'mm', defaultValue: 1.2 },
      { parameterId: 'nUtama', label: 'Jumlah Besi Utama', cell: 'D25', unit: 'bh', defaultValue: 3 },
      { parameterId: 'nSupport', label: 'Jumlah Besi Support', cell: 'D26', unit: 'bh', defaultValue: 3 },
      { parameterId: 'r1', label: 'Jarak Sengkang', cell: 'D27', unit: 'm', defaultValue: 0.15 },
      { parameterId: 'pKawat', label: 'Panjang Kawat Ikat', cell: 'D28', unit: 'm', defaultValue: 0.35 },
      { parameterId: 'd4', label: 'Besi Alas Ø', cell: 'D30', unit: 'mm', defaultValue: 13 },
      { parameterId: 'd5', label: 'Besi Pembentuk Ø', cell: 'D31', unit: 'mm', defaultValue: 13 },
      { parameterId: 'd6', label: 'Besi Kait Ø', cell: 'D32', unit: 'mm', defaultValue: 10 },
      { parameterId: 'r2', label: 'Jarak Tulangan Alas', cell: 'D33', unit: 'm', defaultValue: 0.15 },
      { parameterId: 'selimut', label: 'Selimut Beton', cell: 'D34', unit: 'm', defaultValue: 0.03 },
      { parameterId: 'massaJenis', label: 'Massa Jenis Besi', cell: 'D35', unit: 'kg/m³', defaultValue: 7850 },
    ],
    formulaCells: [
      { code: 'I18', cell: 'I18', description: 'Berat Total Baja Tulangan', rawFormula: '=IFERROR(0.785*D35/(10^6)*(I8*D20^2+I9*D21^2+I10*D22^2+I11*D30^2+I12*D31^2+I13*D32^2+I14*D23^2)*D18*1,0)', unit: 'kg' },
      { code: 'I20', cell: 'I20', description: 'Volume Beton Foot Plate', rawFormula: '=IFERROR((D8*D9*D12+D10*D11*D15+D10*D11*D14*0.5)*D18*1,0)', unit: 'm³' },
    ],
  },

  // 4. Sloof
  {
    calculatorId: 'building.struktur.sloof',
    legacyId: 'SLOOF',
    sheetName: 'Sloof',
    primaryOutputCell: 'I20',
    primaryUnit: 'm³',
    inputCells: [
      { parameterId: 'P', label: 'Panjang Sloof', cell: 'D9', unit: 'm', defaultValue: 3.00 },
      { parameterId: 'b', label: 'Lebar Sloof', cell: 'D10', unit: 'm', defaultValue: 0.20 },
      { parameterId: 'h', label: 'Tinggi Sloof', cell: 'D11', unit: 'm', defaultValue: 0.30 },
      { parameterId: 'n', label: 'Jumlah Sloof', cell: 'D12', unit: 'unit', defaultValue: 5 },
      { parameterId: 'diaUtama1', label: 'Besi Tulangan 1 Ø', cell: 'D14', unit: 'mm', defaultValue: 10 },
      { parameterId: 'diaUtama2', label: 'Besi Tulangan 2 Ø', cell: 'D15', unit: 'mm', defaultValue: 8 },
      { parameterId: 'diaSengkang', label: 'Besi Sengkang Ø', cell: 'D16', unit: 'mm', defaultValue: 6 },
      { parameterId: 'diaKawat', label: 'Kawat Beton Ø', cell: 'D17', unit: 'mm', defaultValue: 1.2 },
      { parameterId: 'nUtama1', label: 'Jumlah Tulangan 1', cell: 'D19', unit: 'bh', defaultValue: 4 },
      { parameterId: 'nUtama2', label: 'Jumlah Tulangan 2', cell: 'D20', unit: 'bh', defaultValue: 2 },
      { parameterId: 'sTumpuan', label: 'Jarak Sengkang Tumpuan', cell: 'D21', unit: 'cm', defaultValue: 15 },
      { parameterId: 'sLapangan', label: 'Jarak Sengkang Lapangan', cell: 'D22', unit: 'cm', defaultValue: 20 },
      { parameterId: 'selimut', label: 'Selimut Beton', cell: 'D23', unit: 'cm', defaultValue: 2.50 },
      { parameterId: 'pKait', label: 'Panjang Kait', cell: 'D24', unit: 'm', defaultValue: 0.10 },
      { parameterId: 'pOverstek', label: 'Panjang Overstek', cell: 'D25', unit: 'm', defaultValue: 0.30 },
      { parameterId: 'pKawat', label: 'Panjang Kawat', cell: 'D26', unit: 'm', defaultValue: 0.35 },
      { parameterId: 'massaJenis', label: 'Massa Jenis Besi', cell: 'D27', unit: 'kg/m³', defaultValue: 7850 },
    ],
    formulaCells: [
      { code: 'I20', cell: 'I20', description: 'Volume Beton Cor Sloof', rawFormula: '=IFERROR((D9*D10*D11)*D12,0)', unit: 'm³' },
    ],
  },

  // 5. Kolom
  {
    calculatorId: 'building.struktur.kolom',
    legacyId: 'KOLOM',
    sheetName: 'Kolom',
    primaryOutputCell: 'I20',
    primaryUnit: 'm³',
    inputCells: [
      { parameterId: 'T', label: 'T Tinggi Kolom', cell: 'D9', unit: 'm', defaultValue: 3.00 },
      { parameterId: 'L', label: 'L Lebar Kolom', cell: 'D10', unit: 'm', defaultValue: 0.15 },
      { parameterId: 'P', label: 'P Panjang Kolom', cell: 'D11', unit: 'm', defaultValue: 0.25 },
      { parameterId: 'Jumlah', label: 'Jumlah Kolom', cell: 'D12', unit: 'unit', defaultValue: 5 },
    ],
    formulaCells: [
      { code: 'I20', cell: 'I20', description: 'Volume Beton Kolom', rawFormula: '=IFERROR((D9*D10*D11)*D12,0)', unit: 'm³' },
    ],
  },

  // 6. Balok
  {
    calculatorId: 'building.struktur.balok',
    legacyId: 'BALOK',
    sheetName: 'Balok',
    primaryOutputCell: 'I20',
    primaryUnit: 'm³',
    inputCells: [
      { parameterId: 'L', label: 'Panjang Total Balok', cell: 'D9', unit: 'm', defaultValue: 36.0 },
      { parameterId: 'b', label: 'Lebar Balok', cell: 'D10', unit: 'm', defaultValue: 0.20 },
      { parameterId: 'h', label: 'Tinggi Balok', cell: 'D11', unit: 'm', defaultValue: 0.35 },
    ],
    formulaCells: [
      { code: 'I20', cell: 'I20', description: 'Volume Beton Balok', rawFormula: '=IFERROR((D9*D10*D11),0)', unit: 'm³' },
    ],
  },

  // 7. Bata Ringan
  {
    calculatorId: 'building.arsitektur.bata_ringan',
    legacyId: 'BATA_RINGAN',
    sheetName: 'Bata Ringan',
    primaryOutputCell: 'N9',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'Pi', label: 'Panjang Interior', cell: 'D9', unit: 'm', defaultValue: 36.0 },
      { parameterId: 'Pe', label: 'Panjang Eksterior', cell: 'D10', unit: 'm', defaultValue: 39.0 },
      { parameterId: 'T', label: 'Tinggi Dinding', cell: 'D11', unit: 'm', defaultValue: 3.80 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Luas Bersih Pasangan Bata Ringan', rawFormula: '=IFERROR(((D9+D10)*D11),0)', unit: 'm²' },
    ],
  },

  // 8. Bata Merah
  {
    calculatorId: 'building.arsitektur.bata_merah',
    legacyId: 'BATA_MERAH',
    sheetName: 'Bata Merah',
    primaryOutputCell: 'N9',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'P', label: 'Panjang Dinding', cell: 'D9', unit: 'm', defaultValue: 36.0 },
      { parameterId: 'T', label: 'Tinggi Dinding', cell: 'D10', unit: 'm', defaultValue: 3.20 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Luas Bersih Pasangan Bata Merah', rawFormula: '=IFERROR((D9*D10)-D11,0)', unit: 'm²' },
    ],
  },

  // 9. Batako
  {
    calculatorId: 'building.arsitektur.batako',
    legacyId: 'BATAKO',
    sheetName: 'Batako',
    primaryOutputCell: 'N9',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'P', label: 'Panjang Dinding', cell: 'D9', unit: 'm', defaultValue: 28.0 },
      { parameterId: 'T', label: 'Tinggi Dinding', cell: 'D10', unit: 'm', defaultValue: 3.00 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Luas Bersih Pasangan Batako', rawFormula: '=IFERROR((D9*D10)-D11,0)', unit: 'm²' },
    ],
  },

  // 10. Pintu & Jendela
  {
    calculatorId: 'building.arsitektur.pintu_jendela',
    legacyId: 'PINTU_JENDELA',
    sheetName: 'Pintu & Jendela',
    primaryOutputCell: 'N9',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'nPintuUtama', label: 'Pintu Utama', cell: 'D9', unit: 'unit', defaultValue: 1 },
      { parameterId: 'nPintuKamar', label: 'Pintu Kamar', cell: 'D10', unit: 'unit', defaultValue: 4 },
      { parameterId: 'nPintuKM', label: 'Pintu KM/WC', cell: 'D11', unit: 'unit', defaultValue: 2 },
      { parameterId: 'nJendelaGanda', label: 'Jendela Ganda', cell: 'D12', unit: 'unit', defaultValue: 3 },
      { parameterId: 'nJendelaTunggal', label: 'Jendela Tunggal', cell: 'D13', unit: 'unit', defaultValue: 4 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Total Luas Daun Pintu & Jendela', rawFormula: '=SUM(daunPintu, daunJendela)', unit: 'm²' },
    ],
  },

  // 11. Atap Baja Ringan
  {
    calculatorId: 'building.arsitektur.atap_baja_ringan',
    legacyId: 'ATAP_BAJA_RINGAN',
    sheetName: 'Atap Baja Ringan',
    primaryOutputCell: 'I8',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'P', label: 'Panjang Bangunan', cell: 'D8', unit: 'm', defaultValue: 12.0 },
      { parameterId: 'L', label: 'Lebar Bangunan', cell: 'D9', unit: 'm', defaultValue: 8.0 },
      { parameterId: 'overhang', label: 'Overhang / Teritisan', cell: 'D10', unit: 'm', defaultValue: 0.8 },
      { parameterId: 'sudutKemiringan', label: 'Sudut Kemiringan Atap', cell: 'D11', unit: 'derajat', defaultValue: 30 },
    ],
    formulaCells: [
      { code: 'I8', cell: 'I8', description: 'Luas Bidang Atap Miring Rencana', rawFormula: '=IFERROR(((D8+2*D10)*(D9+2*D10))/COS(RADIANS(D11)),0)', unit: 'm²' },
    ],
  },

  // 12. Plesteran & Acian
  {
    calculatorId: 'building.finishing.plesteran_acian',
    legacyId: 'PLESTERAN_ACIAN',
    sheetName: 'Plesteran & Acian',
    primaryOutputCell: 'N9',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'luasDinding', label: 'Luas Dinding', cell: 'D9', unit: 'm²', defaultValue: 105.0 },
      { parameterId: 'duaSisi', label: 'Plesteran 2 Sisi (1/0)', cell: 'D10', unit: 'tipe', defaultValue: 1 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Luas Bidang Plesteran & Acian', rawFormula: '=IFERROR(D9*2,0)', unit: 'm²' },
    ],
  },

  // 13. Penutup Lantai
  {
    calculatorId: 'building.finishing.penutup_lantai',
    legacyId: 'PENUTUP_LANTAI',
    sheetName: 'Penutup Lantai',
    primaryOutputCell: 'N9',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'P', label: 'Panjang Ruangan', cell: 'D9', unit: 'm', defaultValue: 10.0 },
      { parameterId: 'L', label: 'Lebar Ruangan', cell: 'D10', unit: 'm', defaultValue: 8.0 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Luas Permukaan Pasangan Lantai', rawFormula: '=IFERROR(D9*D10,0)', unit: 'm²' },
    ],
  },

  // 14. Penutup Dinding
  {
    calculatorId: 'building.finishing.penutup_dinding',
    legacyId: 'PENUTUP_DINDING',
    sheetName: 'Penutup Dinding',
    primaryOutputCell: 'N9',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'K', label: 'Keliling Ruangan', cell: 'D9', unit: 'm', defaultValue: 8.0 },
      { parameterId: 'H', label: 'Tinggi Pasangan', cell: 'D10', unit: 'm', defaultValue: 2.40 },
      { parameterId: 'Abukaan', label: 'Luas Bukaan', cell: 'D11', unit: 'm²', defaultValue: 1.80 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Luas Pasangan Keramik Dinding', rawFormula: '=IFERROR(((D9*D10)-D11)*1.05,0)', unit: 'm²' },
    ],
  },

  // 15. Plafon
  {
    calculatorId: 'building.finishing.plafon',
    legacyId: 'PLAFON',
    sheetName: 'Plafon',
    primaryOutputCell: 'J8',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'P', label: 'Panjang Ruangan', cell: 'D9', unit: 'm', defaultValue: 10.0 },
      { parameterId: 'L', label: 'Lebar Ruangan', cell: 'D10', unit: 'm', defaultValue: 8.0 },
    ],
    formulaCells: [
      { code: 'J8', cell: 'J8', description: 'Luas Pemasangan Plafon & Rangka', rawFormula: '=IFERROR(D9*D10,0)', unit: 'm²' },
    ],
  },

  // 16. Pengecatan
  {
    calculatorId: 'building.finishing.pengecatan',
    legacyId: 'PENGECATAN',
    sheetName: 'Pengecatan',
    primaryOutputCell: 'J20',
    primaryUnit: 'm²',
    inputCells: [
      { parameterId: 'luasInterior', label: 'Luas Interior', cell: 'D9', unit: 'm²', defaultValue: 140.0 },
      { parameterId: 'luasEksterior', label: 'Luas Eksterior', cell: 'D10', unit: 'm²', defaultValue: 70.0 },
      { parameterId: 'luasPlafon', label: 'Luas Plafon', cell: 'D11', unit: 'm²', defaultValue: 80.0 },
    ],
    formulaCells: [
      { code: 'J20', cell: 'J20', description: 'Luas Total Bidang Pengecatan', rawFormula: '=IFERROR(D9+D10+D11,0)', unit: 'm²' },
    ],
  },

  // 17. Kelistrikan
  {
    calculatorId: 'building.mep.kelistrikan',
    legacyId: 'KELISTRIKAN',
    sheetName: 'Kelistrikan',
    primaryOutputCell: 'N9',
    primaryUnit: 'titik',
    inputCells: [
      { parameterId: 'nLampu', label: 'Jumlah Lampu', cell: 'D9', unit: 'titik', defaultValue: 18 },
      { parameterId: 'nStopKontak', label: 'Jumlah Stop Kontak', cell: 'D10', unit: 'titik', defaultValue: 12 },
      { parameterId: 'nSaklarTunggal', label: 'Jumlah Saklar 1', cell: 'D11', unit: 'titik', defaultValue: 6 },
      { parameterId: 'nSaklarGanda', label: 'Jumlah Saklar 2', cell: 'D12', unit: 'titik', defaultValue: 4 },
    ],
    formulaCells: [
      { code: 'N9', cell: 'N9', description: 'Total Titik Instalasi Listrik', rawFormula: '=SUM(D9:D12)', unit: 'titik' },
    ],
  },

  // 18. Instalasi Air Bersih
  {
    calculatorId: 'building.mep.instalasi_air',
    legacyId: 'AIR_BERSIH',
    sheetName: 'Instalasi Air Bersih',
    primaryOutputCell: 'M8',
    primaryUnit: 'm',
    inputCells: [
      { parameterId: 'pjgPipaUtama', label: 'Panjang Pipa Utama', cell: 'D8', unit: 'm', defaultValue: 24.0 },
      { parameterId: 'pjgPipaCabang', label: 'Panjang Pipa Cabang', cell: 'D9', unit: 'm', defaultValue: 32.0 },
      { parameterId: 'nKran', label: 'Jumlah Titik Kran', cell: 'D10', unit: 'titik', defaultValue: 8 },
    ],
    formulaCells: [
      { code: 'M8', cell: 'M8', description: 'Panjang Total Pipa Air Bersih', rawFormula: '=IFERROR(D8+D9,0)', unit: 'm' },
    ],
  },

  // 19. Sanitair
  {
    calculatorId: 'building.mep.sanitair',
    legacyId: 'SANITAIR',
    sheetName: 'Sanitair',
    primaryOutputCell: 'E14',
    primaryUnit: 'unit',
    inputCells: [
      { parameterId: 'nKlosetDuduk', label: 'Kloset Duduk', cell: 'D9', unit: 'unit', defaultValue: 2 },
      { parameterId: 'nKlosetJongkok', label: 'Kloset Jongkok', cell: 'D10', unit: 'unit', defaultValue: 0 },
      { parameterId: 'nWastafel', label: 'Wastafel', cell: 'D11', unit: 'unit', defaultValue: 2 },
      { parameterId: 'nFloorDrain', label: 'Floor Drain', cell: 'D12', unit: 'unit', defaultValue: 3 },
      { parameterId: 'nShowerSet', label: 'Shower Set', cell: 'D13', unit: 'unit', defaultValue: 2 },
    ],
    formulaCells: [
      { code: 'E14', cell: 'E14', description: 'Total Unit Sanitair', rawFormula: '=SUM(D9:D13)', unit: 'unit' },
    ],
  },
];
