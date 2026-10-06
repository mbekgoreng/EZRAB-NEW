/**
 * DAFTAR HARGA SATUAN UPAH, BAHAN, DAN PERALATAN BINA MARGA 2026
 * Sourced directly from SE Direktur Jenderal Bina Konstruksi No. 47/SE/Dk/2026 (Lampiran V)
 * Evaluated from sheet 'Upah Bahan' and inline special rates with complete provenance
 */

export interface BinaMargaPriceEntry {
  code: string;
  name: string;
  unit: string;
  price: number;
  category: 'labor' | 'material' | 'equipment';
  sourceSheet: string;
  sourceRow: number;
}

export const OFFICIAL_BM_2026_LABOR: BinaMargaPriceEntry[] = [
  {
    "code": "L01",
    "name": "Pekerja",
    "unit": "jam",
    "price": 27643.54,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 10
  },
  {
    "code": "L01",
    "name": "Pekerja Biasa",
    "unit": "Jam",
    "price": 27643.54,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 11
  },
  {
    "code": "L02",
    "name": "Tukang",
    "unit": "jam",
    "price": 29049.71,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 12
  },
  {
    "code": "L02",
    "name": "Tukang Batu",
    "unit": "jam",
    "price": 29049.71,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 13
  },
  {
    "code": "L02",
    "name": "Tukang Las",
    "unit": "jam",
    "price": 29049.71,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 14
  },
  {
    "code": "L03",
    "name": "Mandor",
    "unit": "jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 15
  },
  {
    "code": "L03",
    "name": "Mandor 0,00",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 16
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 1.314,13",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 17
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 1.898,18",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 18
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 12.657,10",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 19
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 3.432,26",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 20
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 39.216,47",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 21
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 487,25",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 22
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 6.568,59",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 23
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 6.960,65",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 24
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 60.934,44",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 25
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 7.194,34",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 26
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 774,40",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 27
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 8.753,21",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 28
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 833,43",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 29
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 9.515,81",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 30
  },
  {
    "code": "L08",
    "name": "Mekanik",
    "unit": "jam",
    "price": 31517.85,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 31
  },
  {
    "code": "L10",
    "name": "Kepala Tukang",
    "unit": "Jam",
    "price": 31517.85,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 32
  },
  {
    "code": "",
    "name": "Biaya Engineering",
    "unit": "titik",
    "price": 225000.0,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 33
  },
  {
    "code": "",
    "name": "Mandor (L02)",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 34
  },
  {
    "code": "",
    "name": "Mandor (L03)",
    "unit": "Jam",
    "price": 33312.62,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 35
  },
  {
    "code": "",
    "name": "Mobilisasi dan Demobilisasi Tenaga",
    "unit": "Ls",
    "price": 1500000.0,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 36
  },
  {
    "code": "",
    "name": "Pekerja (L01)",
    "unit": "Jam",
    "price": 27643.54,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 37
  },
  {
    "code": "",
    "name": "Tenaga Ahli Interpreter PDLT Test",
    "unit": "OH",
    "price": 849194.44,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 38
  },
  {
    "code": "",
    "name": "Tenaga Instalasi Inclinometer",
    "unit": "M",
    "price": 45000.0,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 39
  },
  {
    "code": "",
    "name": "Tenaga Instalasi Settlement Plate",
    "unit": "Titik",
    "price": 450000.0,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 40
  },
  {
    "code": "",
    "name": "Tenaga Instalasi Water Stand Pipe",
    "unit": "M'",
    "price": 27500.0,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 41
  },
  {
    "code": "",
    "name": "Tenaga Pendukung",
    "unit": "OH",
    "price": 407194.44,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 42
  },
  {
    "code": "",
    "name": "Tenaga Pengeboran Batu",
    "unit": "M'",
    "price": 45000.0,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 43
  },
  {
    "code": "",
    "name": "Tenaga Pengeboran Tanah",
    "unit": "M'",
    "price": 45000.0,
    "category": "labor",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 44
  }
];

export const OFFICIAL_BM_2026_MATERIALS: BinaMargaPriceEntry[] = [
  {
    "code": "",
    "name": "2",
    "unit": "3",
    "price": 4.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 8
  },
  {
    "code": "A1h",
    "name": "Cetakan Kereb",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 46
  },
  {
    "code": "EI311",
    "name": "Galian Tanah Biasa",
    "unit": "M3",
    "price": 38354.36,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 47
  },
  {
    "code": "EI311",
    "name": "Galian tanah biasa",
    "unit": "M3",
    "price": 38354.36,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 48
  },
  {
    "code": "EI612a",
    "name": "Lapis Perekat",
    "unit": "liter",
    "price": 22050.83,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 49
  },
  {
    "code": "EI871b",
    "name": "tebal 240 mikron",
    "unit": "M2",
    "price": 344333.01,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 50
  },
  {
    "code": "EI923a",
    "name": "Pekerjaan Galian",
    "unit": "M3",
    "price": 72623.2,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 51
  },
  {
    "code": "L02",
    "name": "Tukang Sub Total Tenaga 11.619,88",
    "unit": "Jam",
    "price": 29049.71,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 52
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 11.764,94",
    "unit": "Jam",
    "price": 33312.62,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 53
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 2.005,80",
    "unit": "Jam",
    "price": 33312.62,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 54
  },
  {
    "code": "L03",
    "name": "Mandor Sub Total Tenaga 3.838,98",
    "unit": "Jam",
    "price": 33312.62,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 55
  },
  {
    "code": "M01a",
    "name": "Agregat Halus",
    "unit": "M3",
    "price": 168800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 56
  },
  {
    "code": "M01a",
    "name": "Agregat Halus Beton",
    "unit": "M3",
    "price": 168800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 57
  },
  {
    "code": "M01a",
    "name": "Pasir Beton",
    "unit": "M3",
    "price": 168800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 58
  },
  {
    "code": "M01b",
    "name": "Pasir",
    "unit": "M3",
    "price": 246300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 59
  },
  {
    "code": "M01b",
    "name": "Pasir Pasang",
    "unit": "M3",
    "price": 246300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 60
  },
  {
    "code": "M01c",
    "name": "Pasir Halus",
    "unit": "M3",
    "price": 246300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 61
  },
  {
    "code": "M01d",
    "name": "Pasir Urug",
    "unit": "M3",
    "price": 229800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 62
  },
  {
    "code": "M01d",
    "name": "Tanah Kepasiran",
    "unit": "m3",
    "price": 229800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 63
  },
  {
    "code": "M02",
    "name": "Batu",
    "unit": "M3",
    "price": 209100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 64
  },
  {
    "code": "M02",
    "name": "Batu Kali",
    "unit": "M3",
    "price": 209100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 65
  },
  {
    "code": "M03",
    "name": "Aggregat Kasar",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 66
  },
  {
    "code": "M03",
    "name": "Agregat",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 67
  },
  {
    "code": "M03",
    "name": "Agregat Kasar",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 68
  },
  {
    "code": "M05",
    "name": "Abu Terbang",
    "unit": "Kg",
    "price": 700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 69
  },
  {
    "code": "M05",
    "name": "Debu Marmer",
    "unit": "Kg",
    "price": 700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 70
  },
  {
    "code": "M05",
    "name": "Filler Added (Non Pc)",
    "unit": "Kg",
    "price": 700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 71
  },
  {
    "code": "M05",
    "name": "Fly Ash",
    "unit": "Kg",
    "price": 700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 72
  },
  {
    "code": "M05",
    "name": "Fly ash",
    "unit": "Kg",
    "price": 700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 73
  },
  {
    "code": "M06",
    "name": "Batu Belah",
    "unit": "M3",
    "price": 209100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 74
  },
  {
    "code": "M06",
    "name": "Batu Kosong",
    "unit": "M3",
    "price": 209100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 75
  },
  {
    "code": "M06",
    "name": "Blinding Stone",
    "unit": "M3",
    "price": 209100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 76
  },
  {
    "code": "M08",
    "name": "Bahan Timbunan Biasa",
    "unit": "M3",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 77
  },
  {
    "code": "M08",
    "name": "Bahan Timbunan Biasa (Tanah Urug)",
    "unit": "M3",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 78
  },
  {
    "code": "M09",
    "name": "Bahan Granular Backfill",
    "unit": "M3",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 79
  },
  {
    "code": "M09",
    "name": "Bahan pilihan",
    "unit": "M3",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 80
  },
  {
    "code": "M09",
    "name": "Borrow Pit",
    "unit": "M3",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 81
  },
  {
    "code": "M09",
    "name": "Material Pilihan (Granular Back fill)",
    "unit": "M3",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 82
  },
  {
    "code": "M09",
    "name": "Timbunan Pilihan",
    "unit": "M3",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 83
  },
  {
    "code": "M09",
    "name": "Timbunan Pilihan Cetakan gorong-gorong",
    "unit": "M3",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 84
  },
  {
    "code": "M09",
    "name": "Timbunan Pilihan Cetakan gorong-gorong beton",
    "unit": "M3",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 85
  },
  {
    "code": "M10",
    "name": "Aspal",
    "unit": "Ltr",
    "price": 7032.26,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 86
  },
  {
    "code": "M10",
    "name": "Aspal Pen.60/70",
    "unit": "Kg",
    "price": 7032.26,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 87
  },
  {
    "code": "M100",
    "name": "Casing, Diameter 1000 mm",
    "unit": "M1",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 88
  },
  {
    "code": "M100",
    "name": "Casing, Diameter 400 mm",
    "unit": "M1",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 89
  },
  {
    "code": "M100",
    "name": "Casing, Diameter 500 mm",
    "unit": "M1",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 90
  },
  {
    "code": "M100",
    "name": "Casing, Diameter 600 mm",
    "unit": "M1",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 91
  },
  {
    "code": "M100",
    "name": "Casing, Diameter 800 mm",
    "unit": "M1",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 92
  },
  {
    "code": "M100",
    "name": "Casing, diameter 1000 mm",
    "unit": "M'",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 93
  },
  {
    "code": "M100",
    "name": "Casing, diameter 1200 mm",
    "unit": "M'",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 94
  },
  {
    "code": "M100",
    "name": "Casing, diameter 1500 mm",
    "unit": "M'",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 95
  },
  {
    "code": "M100",
    "name": "Casing, diameter 800 mm",
    "unit": "M'",
    "price": 24000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 96
  },
  {
    "code": "M116",
    "name": "Baja prategang 7 wires/ Strands, 1/2 inci",
    "unit": "Kg",
    "price": 13288.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 97
  },
  {
    "code": "M116",
    "name": "Kabel Prategang",
    "unit": "Kg",
    "price": 13288.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 98
  },
  {
    "code": "M117",
    "name": "Selongsong HDPE",
    "unit": "M",
    "price": 98400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 99
  },
  {
    "code": "M12",
    "name": "PC",
    "unit": "kg",
    "price": 1600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 100
  },
  {
    "code": "M12",
    "name": "Semen",
    "unit": "Kg",
    "price": 1600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 101
  },
  {
    "code": "M12",
    "name": "Semen (OPC Tipe I)",
    "unit": "Kg",
    "price": 1600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 102
  },
  {
    "code": "M12",
    "name": "Semen (PC)",
    "unit": "Kg",
    "price": 1600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 103
  },
  {
    "code": "M12",
    "name": "Semen PC",
    "unit": "m3",
    "price": 1600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 104
  },
  {
    "code": "M121",
    "name": "Kopel set, angkur",
    "unit": "Buah",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 105
  },
  {
    "code": "M122a",
    "name": "Baja Profil L 50x50x5",
    "unit": "M",
    "price": 30000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 106
  },
  {
    "code": "M122b",
    "name": "Baja Profil L 55x75x5",
    "unit": "M",
    "price": 39400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 107
  },
  {
    "code": "M122c",
    "name": "Baja Profil L 60x60x6",
    "unit": "M'",
    "price": 43200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 108
  },
  {
    "code": "M122h",
    "name": "Baja Profil L 25x25x3",
    "unit": "M'",
    "price": 20000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 109
  },
  {
    "code": "M122i",
    "name": "Baja Profil L 40x40x4",
    "unit": "M'",
    "price": 25900.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 110
  },
  {
    "code": "M123",
    "name": "Baja Profil Canal C60",
    "unit": "M",
    "price": 16149.38,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 111
  },
  {
    "code": "M125",
    "name": "Epoxy resin",
    "unit": "Kg",
    "price": 460000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 112
  },
  {
    "code": "M125",
    "name": "Perekat",
    "unit": "kg",
    "price": 460000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 113
  },
  {
    "code": "M125",
    "name": "Perekat Epoxy",
    "unit": "Kg",
    "price": 460000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 114
  },
  {
    "code": "M126",
    "name": "Sealant",
    "unit": "Kg",
    "price": 402500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 115
  },
  {
    "code": "M127",
    "name": "Tabung penyuntik kosong termasuk nipple",
    "unit": "Buah",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 116
  },
  {
    "code": "M129",
    "name": "Anti Korosi",
    "unit": "Kg",
    "price": 65500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 117
  },
  {
    "code": "M130",
    "name": "Acuan / bekisting",
    "unit": "m2",
    "price": 170000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 118
  },
  {
    "code": "M130",
    "name": "Triplek",
    "unit": "Lbr",
    "price": 170000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 119
  },
  {
    "code": "M130",
    "name": "Triplek 12 mm",
    "unit": "Lbr",
    "price": 170000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 120
  },
  {
    "code": "M133",
    "name": "Baja Pelat (Steel Plate)",
    "unit": "kg",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 121
  },
  {
    "code": "M133",
    "name": "Pelat Baja",
    "unit": "kg",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 122
  },
  {
    "code": "M133",
    "name": "Plat Besi uk 200 x 200 mm",
    "unit": "Kg",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 123
  },
  {
    "code": "M133",
    "name": "Plat Besi uk 500 x 500 mm Kabel TR NYFGBY 2 x 4 x 2.5",
    "unit": "Kg",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 124
  },
  {
    "code": "M133",
    "name": "mm, tebal 10 mm",
    "unit": "Kg",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 125
  },
  {
    "code": "M134",
    "name": "Baja Tulangan (angkur) penggantung/hanger L6",
    "unit": "Kg",
    "price": 19425.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 126
  },
  {
    "code": "M134",
    "name": "Baja Tulangan (angkur) penggantung/hanger L60.60.6",
    "unit": "Kg",
    "price": 19425.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 127
  },
  {
    "code": "M134",
    "name": "Mur baut 8 mm",
    "unit": "kg",
    "price": 19425.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 128
  },
  {
    "code": "M134",
    "name": "Mur, baut dll",
    "unit": "M",
    "price": 19425.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 129
  },
  {
    "code": "M136",
    "name": "Cat Galvanis",
    "unit": "Kg",
    "price": 92000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 130
  },
  {
    "code": "M14",
    "name": "Kawat Beton",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 131
  },
  {
    "code": "M14",
    "name": "Kawat Beton Sub Total Material 2.535.658,75",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 132
  },
  {
    "code": "M14",
    "name": "Kawat Beton Sub Total Material 2.669.546,84",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 133
  },
  {
    "code": "M14",
    "name": "Kawat Beton Sub Total Material 2.954.275,52",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 134
  },
  {
    "code": "M14",
    "name": "Kawat beton",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 135
  },
  {
    "code": "M14",
    "name": "Kawat beton Sub Total Material 498.506,12",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 136
  },
  {
    "code": "M14",
    "name": "Kawat beton Sub Total Material 526.919,72",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 137
  },
  {
    "code": "M14",
    "name": "Kawat beton Sub Total Material 652.029,38",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 138
  },
  {
    "code": "M14",
    "name": "Kawat beton Sub Total Material 717.281,22",
    "unit": "Kg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 139
  },
  {
    "code": "M141",
    "name": "Bahan Graut",
    "unit": "Kg",
    "price": 153180.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 140
  },
  {
    "code": "M142",
    "name": "Kayu Kelas 1",
    "unit": "m3",
    "price": 27500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 141
  },
  {
    "code": "M144",
    "name": "Plat Absorber",
    "unit": "M2",
    "price": 348757.77,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 142
  },
  {
    "code": "M144",
    "name": "Timbunan Porus",
    "unit": "M3",
    "price": 348757.77,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 143
  },
  {
    "code": "M15",
    "name": "Anchor L Dia. 12 mm Sub Total Material 630.506,12",
    "unit": "Buah",
    "price": 22000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 144
  },
  {
    "code": "M15",
    "name": "Anchor L Dia. 12 mm Sub Total Material 658.919,72",
    "unit": "Buah",
    "price": 22000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 145
  },
  {
    "code": "M15",
    "name": "Anchor L Dia. 12 mm Sub Total Material 784.029,38",
    "unit": "Buah",
    "price": 22000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 146
  },
  {
    "code": "M15",
    "name": "Anchor L Dia. 12 mm Sub Total Material 849.281,22",
    "unit": "Buah",
    "price": 22000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 147
  },
  {
    "code": "M158",
    "name": "Serat Selulosa",
    "unit": "Kg",
    "price": 22500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 148
  },
  {
    "code": "M15a",
    "name": "Bronjong dengan kawat dilapisi galvanis",
    "unit": "Kg",
    "price": 22000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 149
  },
  {
    "code": "M15b",
    "name": "Anyaman Penulangan Tanah dengan Kawat yang Dilapisi PVC per meter persegi",
    "unit": "Kg",
    "price": 22000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 150
  },
  {
    "code": "M15b",
    "name": "Bronjong dengan kawat dilapisi PVC",
    "unit": "Kg",
    "price": 22000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 151
  },
  {
    "code": "M16",
    "name": "Besi Siku",
    "unit": "Kg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 152
  },
  {
    "code": "M161",
    "name": "Asbuton B 5/20",
    "unit": "Kg",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 153
  },
  {
    "code": "M162",
    "name": "Campuran CPHMA",
    "unit": "Ton",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 154
  },
  {
    "code": "M162a",
    "name": "CPHMA Kemasan",
    "unit": "M3",
    "price": 1075000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 155
  },
  {
    "code": "M163",
    "name": "Asbuton B 50/30",
    "unit": "M3",
    "price": 11000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 156
  },
  {
    "code": "M165",
    "name": "Backer Rod",
    "unit": "Kg",
    "price": 16554.86,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 157
  },
  {
    "code": "M165",
    "name": "Backer rod diameter 3/8 inch",
    "unit": "m'",
    "price": 10833.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 158
  },
  {
    "code": "M165",
    "name": "Batang Penyokong (Backer Rod)",
    "unit": "m",
    "price": 10833.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 159
  },
  {
    "code": "M165",
    "name": "Road Backer",
    "unit": "m'",
    "price": 10833.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 160
  },
  {
    "code": "M166",
    "name": "Epoxy",
    "unit": "Kg",
    "price": 350000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 161
  },
  {
    "code": "M166",
    "name": "Graut Semen",
    "unit": "liter",
    "price": 350000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 162
  },
  {
    "code": "M16a",
    "name": "Sirtu",
    "unit": "M3",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 163
  },
  {
    "code": "M16a",
    "name": "Sirtu 2/3",
    "unit": "M3",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 164
  },
  {
    "code": "M16b",
    "name": "Lapis Fondasi Agregat",
    "unit": "M3",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 165
  },
  {
    "code": "M170",
    "name": "Air",
    "unit": "Ltr",
    "price": 14.65,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 166
  },
  {
    "code": "M170",
    "name": "Air Sub Total Material 2.774.923,99",
    "unit": "Ltr",
    "price": 14.65,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 167
  },
  {
    "code": "M170",
    "name": "air",
    "unit": "liter",
    "price": 14.65,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 168
  },
  {
    "code": "M171",
    "name": "Plasticizer",
    "unit": "Kg",
    "price": 35000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 169
  },
  {
    "code": "M171",
    "name": "Plastizier",
    "unit": "Kg",
    "price": 35000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 170
  },
  {
    "code": "M176",
    "name": "Mortar Rapid Setting",
    "unit": "Kg",
    "price": 4296.3,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 171
  },
  {
    "code": "M176",
    "name": "Mortar Semen",
    "unit": "Kg",
    "price": 4296.3,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 172
  },
  {
    "code": "M17a",
    "name": "Cat Marka Non Thermoplastic",
    "unit": "Kg",
    "price": 22500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 173
  },
  {
    "code": "M17b",
    "name": "Cat",
    "unit": "Kg",
    "price": 123333.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 174
  },
  {
    "code": "M17b",
    "name": "Cat Marka Thermoplastic",
    "unit": "Kg",
    "price": 123333.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 175
  },
  {
    "code": "M17c",
    "name": "Marka Template (50 Times)",
    "unit": "Buah",
    "price": 65000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 176
  },
  {
    "code": "M17d",
    "name": "Cat Marka ColdPlastic",
    "unit": "Kg",
    "price": 245000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 177
  },
  {
    "code": "M17e",
    "name": "Cat Marka Thermoplastic Glow in The Dark",
    "unit": "Kg",
    "price": 598000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 178
  },
  {
    "code": "M18",
    "name": "Paku",
    "unit": "Kg",
    "price": 36000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 179
  },
  {
    "code": "M18",
    "name": "Paku Sub Total Material 247.994,46",
    "unit": "Kg",
    "price": 36000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 180
  },
  {
    "code": "M181",
    "name": "Bahan grouting jenis preformed",
    "unit": "Kg",
    "price": 24775.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 181
  },
  {
    "code": "M182",
    "name": "Super Plastizier",
    "unit": "Kg",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 182
  },
  {
    "code": "M182",
    "name": "Super Plastizier Kg",
    "unit": "Kg",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 183
  },
  {
    "code": "M182",
    "name": "Superplasticizer",
    "unit": "Kg",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 184
  },
  {
    "code": "M186",
    "name": "Beton Fc 20 Mpa",
    "unit": "M3",
    "price": 1281635.64,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 185
  },
  {
    "code": "M186",
    "name": "Beton K-250 (Ready Mix)",
    "unit": "M3",
    "price": 1281635.64,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 186
  },
  {
    "code": "M186",
    "name": "Beton ReadyMix fc'20",
    "unit": "M3",
    "price": 1281635.64,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 187
  },
  {
    "code": "M186",
    "name": "Beton f`c 20 Mpa",
    "unit": "M3",
    "price": 1281635.64,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 188
  },
  {
    "code": "M186",
    "name": "Beton fc 20 MPa",
    "unit": "M3",
    "price": 1281635.64,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 189
  },
  {
    "code": "M19",
    "name": "Kaso 5/7",
    "unit": "M3",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 190
  },
  {
    "code": "M19",
    "name": "Kayu",
    "unit": "M3",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 191
  },
  {
    "code": "M19",
    "name": "Kayu Bekisting",
    "unit": "M3",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 192
  },
  {
    "code": "M19",
    "name": "Kayu Kaso",
    "unit": "M3",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 193
  },
  {
    "code": "M19",
    "name": "Kayu Kaso bekisting",
    "unit": "M3",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 194
  },
  {
    "code": "M19",
    "name": "Kayu Perancah",
    "unit": "M3",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 195
  },
  {
    "code": "M195",
    "name": "Bekisting",
    "unit": "M2",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 196
  },
  {
    "code": "M195",
    "name": "Formworks",
    "unit": "M2",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 197
  },
  {
    "code": "M195",
    "name": "Perancah",
    "unit": "m3",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 198
  },
  {
    "code": "M195",
    "name": "Perancah (Scafolding)",
    "unit": "m2",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 199
  },
  {
    "code": "M195",
    "name": "Scafolding 2 buah uk 3 x 3 x 6 m",
    "unit": "m2",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 200
  },
  {
    "code": "M197",
    "name": "Bahan pengawet: kreosot",
    "unit": "Kg",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 201
  },
  {
    "code": "M197",
    "name": "Kreosot",
    "unit": "Kg",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 202
  },
  {
    "code": "M198",
    "name": "Bonding Agent",
    "unit": "Ltr",
    "price": 286879.5,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 203
  },
  {
    "code": "M199a",
    "name": "1 200 mikron) Cat akhir protektif beton (MC",
    "unit": "liter",
    "price": 200000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 204
  },
  {
    "code": "M199b",
    "name": "1 100 mikron) Cat akhir dekoratif beton",
    "unit": "liter",
    "price": 167000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 205
  },
  {
    "code": "M199b",
    "name": "Cat dasar",
    "unit": "liter",
    "price": 167000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 206
  },
  {
    "code": "M199b",
    "name": "Cat dasar beton (penguard universal 100 mikron)",
    "unit": "liter",
    "price": 167000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 207
  },
  {
    "code": "M199c",
    "name": "1 240 mikron) Cat akhir dekoratif beton",
    "unit": "liter",
    "price": 240000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 208
  },
  {
    "code": "M200",
    "name": "Cat Dekoratif",
    "unit": "liter",
    "price": 206000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 209
  },
  {
    "code": "M200",
    "name": "Cat akhir protektif beton (MC Urethane)",
    "unit": "liter",
    "price": 206000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 210
  },
  {
    "code": "M200",
    "name": "Urethane)",
    "unit": "liter",
    "price": 206000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 211
  },
  {
    "code": "M201",
    "name": "(polyurethane)",
    "unit": "liter",
    "price": 206000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 212
  },
  {
    "code": "M202",
    "name": "Cat Dasar",
    "unit": "Kg",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 213
  },
  {
    "code": "M202a",
    "name": "Cat Dasar baja 80 mikron",
    "unit": "liter",
    "price": 187000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 214
  },
  {
    "code": "M202b",
    "name": "Cat Dasar baja 160 mikron",
    "unit": "liter",
    "price": 201000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 215
  },
  {
    "code": "M202c",
    "name": "Cat Dasar baja 240 mikron",
    "unit": "liter",
    "price": 212500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 216
  },
  {
    "code": "M202d",
    "name": "Cat Dasar baja 360 mikron",
    "unit": "liter",
    "price": 224300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 217
  },
  {
    "code": "M202e",
    "name": "Cat Dasar baja 500 mikron",
    "unit": "liter",
    "price": 235000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 218
  },
  {
    "code": "M203",
    "name": "Cat Akhir",
    "unit": "Kg",
    "price": 376400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 219
  },
  {
    "code": "M203",
    "name": "Cat Lapisan Akhir",
    "unit": "liter",
    "price": 376400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 220
  },
  {
    "code": "M204",
    "name": "FRP jenis E-glass untuk daera",
    "unit": "m2",
    "price": 575000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 221
  },
  {
    "code": "M205",
    "name": "FRP jenis E-glass untuk daerah bas",
    "unit": "m2",
    "price": 575000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 222
  },
  {
    "code": "M206",
    "name": "FRP laminasi jenis glass untuk daera",
    "unit": "m2",
    "price": 1092500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 223
  },
  {
    "code": "M207a",
    "name": "FRP jenis carbon untuk daerah kerin",
    "unit": "m2",
    "price": 1725000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 224
  },
  {
    "code": "M207b",
    "name": "FRP jenis carbon untuk daerah basa",
    "unit": "m2",
    "price": 1725000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 225
  },
  {
    "code": "M208",
    "name": "FRP laminasi jenis carbon untuk dae",
    "unit": "m2",
    "price": 1552500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 226
  },
  {
    "code": "M209",
    "name": "Baja untuk pelat buhul dan pelat ganja",
    "unit": "buah",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 227
  },
  {
    "code": "M209",
    "name": "Baja untuk pelat buhul dan pelat ganjal",
    "unit": "buah",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 228
  },
  {
    "code": "M210a",
    "name": "Baut mutu tinggi A325 Tipe 1 diamete",
    "unit": "Buah",
    "price": 33000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 229
  },
  {
    "code": "M210a",
    "name": "Baut mutu tinggi A325 Tipe 1 diameter M25",
    "unit": "Buah",
    "price": 33000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 230
  },
  {
    "code": "M210a",
    "name": "M25",
    "unit": "Buah",
    "price": 55000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 231
  },
  {
    "code": "M210b",
    "name": "Baut mutu tinggi A325 Tipe 1 diameter M20",
    "unit": "Buah",
    "price": 29000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 232
  },
  {
    "code": "M210c",
    "name": "Baut mutu tinggi A325 Tipe 1 diameter M24",
    "unit": "Buah",
    "price": 30000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 233
  },
  {
    "code": "M210d",
    "name": "Baut mutu tinggi A325 Tipe 1 diameter M16",
    "unit": "Buah",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 234
  },
  {
    "code": "M211a",
    "name": "Baut mutu tinggi A490 Tipe 1 diameter M25",
    "unit": "Buah",
    "price": 55000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 235
  },
  {
    "code": "M211b",
    "name": "Baut mutu tinggi A490 Tipe 1 diameter M20",
    "unit": "Buah",
    "price": 48000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 236
  },
  {
    "code": "M211c",
    "name": "Baut mutu tinggi A490 Tipe 1 diameter M24",
    "unit": "Buah",
    "price": 53000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 237
  },
  {
    "code": "M212",
    "name": "Baut Biasa Grade A diameter M25",
    "unit": "buah",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 238
  },
  {
    "code": "M212",
    "name": "Baut biasa Grade A diameter M25",
    "unit": "Buah",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 239
  },
  {
    "code": "M213",
    "name": "Baut biasa Grade B diameter M25",
    "unit": "Buah",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 240
  },
  {
    "code": "M214",
    "name": "Baut biasa Grade C untuk anchor bolts diameter M25",
    "unit": "Buah",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 241
  },
  {
    "code": "M215a",
    "name": "Elektroda Las SMAW mutu SS400 a",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 242
  },
  {
    "code": "M215a",
    "name": "Elektroda untuk pengelasan SAW Pengecatan struktur baja pada daerah kering",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 243
  },
  {
    "code": "M215b",
    "name": "Elektroda Las SMAW mutu SS490 atau SM490 atau setara",
    "unit": "Kg",
    "price": 36000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 244
  },
  {
    "code": "M216a",
    "name": "Elektroda Las SAW mutu SS400 atau",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 245
  },
  {
    "code": "M216c",
    "name": "Pasir Fluks SAW 0.45-2.5mm",
    "unit": "Kg",
    "price": 23280.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 246
  },
  {
    "code": "M216d",
    "name": "Pasir Fluks SAW 0.45-2.5mm Elektroda Las GMAW mutu SS490",
    "unit": "Kg",
    "price": 23280.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 247
  },
  {
    "code": "M217a",
    "name": "Elektroda Las GMAW mutu SS400 atau SM400 atau setara",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 248
  },
  {
    "code": "M217a",
    "name": "Elektroda Las SAW mutu SS490 atau",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 249
  },
  {
    "code": "M217b",
    "name": "atau SM490 atau setara",
    "unit": "Kg",
    "price": 36000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 250
  },
  {
    "code": "M22",
    "name": "Pelumas",
    "unit": "kg",
    "price": 43500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 251
  },
  {
    "code": "M221",
    "name": "Paku Jalan Memantul Bujur Sangkar",
    "unit": "Buah",
    "price": 54000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 252
  },
  {
    "code": "M222",
    "name": "Paku Jalan Memantul Persegi Panjang",
    "unit": "Buah",
    "price": 66000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 253
  },
  {
    "code": "M223",
    "name": "Baut dan Mur",
    "unit": "buah",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 254
  },
  {
    "code": "M223",
    "name": "Mur Baut",
    "unit": "Buah",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 255
  },
  {
    "code": "M223",
    "name": "Mur dan Baut (Dia. 16 mm)",
    "unit": "Set",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 256
  },
  {
    "code": "M223",
    "name": "Mur dan Baut (Dia. <10 mm)",
    "unit": "Set",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 257
  },
  {
    "code": "M223a",
    "name": "Mur dan Angkur Baut (L = 60 cm)",
    "unit": "Set",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 258
  },
  {
    "code": "M223a",
    "name": "Mur dan Baut Angkur (L=60 CM )",
    "unit": "Set",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 259
  },
  {
    "code": "M224",
    "name": "Cat Dasar Kayu",
    "unit": "Liter",
    "price": 48700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 260
  },
  {
    "code": "M225",
    "name": "Cat Protektif Kayu",
    "unit": "Liter",
    "price": 59800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 261
  },
  {
    "code": "M226",
    "name": "Beton fast track 8 jam",
    "unit": "m3",
    "price": 2183299.83,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 262
  },
  {
    "code": "M226",
    "name": "Mortar fast track (8 jam)",
    "unit": "M3",
    "price": 2183299.83,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 263
  },
  {
    "code": "M227",
    "name": "Silicon Seal",
    "unit": "kg",
    "price": 65333.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 264
  },
  {
    "code": "M228",
    "name": "Plat sambungan siar muai strip seal",
    "unit": "m",
    "price": 2950000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 265
  },
  {
    "code": "M229",
    "name": "Compression Seal Rubber",
    "unit": "M",
    "price": 250000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 266
  },
  {
    "code": "M23",
    "name": "Geotekstil Filter",
    "unit": "M2",
    "price": 19467.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 267
  },
  {
    "code": "M23",
    "name": "Geotextile Non Woven Kelas 2",
    "unit": "M2",
    "price": 19467.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 268
  },
  {
    "code": "M230",
    "name": "Plat sambungan siar muai tipe modular",
    "unit": "m",
    "price": 3700000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 269
  },
  {
    "code": "M231",
    "name": "Sambungan siar muai tipe finger plate",
    "unit": "M3",
    "price": 3500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 270
  },
  {
    "code": "M231",
    "name": "Sambungan siar muai tipe finger plate, Tipe C1a (20mm)",
    "unit": "m",
    "price": 3500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 271
  },
  {
    "code": "M232",
    "name": "Sambungan siar muai tipe dobel siku",
    "unit": "m",
    "price": 1500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 272
  },
  {
    "code": "M233",
    "name": "Neoprene Rubber 5mm",
    "unit": "m",
    "price": 1450000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 273
  },
  {
    "code": "M233",
    "name": "Penutup karet neoprene",
    "unit": "m",
    "price": 1450000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 274
  },
  {
    "code": "M234",
    "name": "Landasan logam berongga (Pot Bearing) 150 mm",
    "unit": "Buah",
    "price": 3331619.28,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 275
  },
  {
    "code": "M234",
    "name": "Landasan logam berongga (Pot Bearing) mm x 200 mm x 250 mm",
    "unit": "bh",
    "price": 3331619.28,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 276
  },
  {
    "code": "M235",
    "name": "Landasan logam jenis Spherical",
    "unit": "Buah",
    "price": 4500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 277
  },
  {
    "code": "M236",
    "name": "Stopper Lateral dan Horizontal",
    "unit": "bh",
    "price": 5500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 278
  },
  {
    "code": "M237",
    "name": "Dudukan, mur, baut dll",
    "unit": "M",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 279
  },
  {
    "code": "M237",
    "name": "Lem PVC",
    "unit": "Kg",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 280
  },
  {
    "code": "M238",
    "name": "Tiang Sandaran Baja",
    "unit": "kg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 281
  },
  {
    "code": "M239a",
    "name": "Deck drain cash iron Type 1 (6 Inch)",
    "unit": "Unit",
    "price": 740000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 282
  },
  {
    "code": "M239b",
    "name": "Deck drain cash iron Type 2 (6 Inch)",
    "unit": "Unit",
    "price": 840000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 283
  },
  {
    "code": "M240e",
    "name": "Cable Schoen 50 mm²",
    "unit": "Buah",
    "price": 21775.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 284
  },
  {
    "code": "M240e",
    "name": "PVC AW Ø 1 Inch",
    "unit": "M'",
    "price": 3754.31,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 285
  },
  {
    "code": "M240e",
    "name": "Pipa PVC Dia. 1 \"",
    "unit": "M",
    "price": 21775.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 286
  },
  {
    "code": "M240e",
    "name": "Pipa PVC Dia. 25 mm",
    "unit": "M",
    "price": 21775.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 287
  },
  {
    "code": "M240f",
    "name": "Pipa PVC 100 mm (4 Inch)",
    "unit": "M'",
    "price": 163225.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 288
  },
  {
    "code": "M240f",
    "name": "Pipa PVC AW Ø4\"",
    "unit": "M'",
    "price": 163225.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 289
  },
  {
    "code": "M240f",
    "name": "Pipa PVC Dia 4\"",
    "unit": "M'",
    "price": 40806.25,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 290
  },
  {
    "code": "M240f",
    "name": "Pipa PVC Dia. 4 \"",
    "unit": "M'",
    "price": 163225.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 291
  },
  {
    "code": "M240g",
    "name": "Pipa PVC Dia 75 mm",
    "unit": "M'",
    "price": 7188.75,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 292
  },
  {
    "code": "M240g",
    "name": "Pipa PVC Dia. 75 mm",
    "unit": "M'",
    "price": 28755.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 293
  },
  {
    "code": "M240h",
    "name": "Pipa PVC 50 mm",
    "unit": "M'",
    "price": 28000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 294
  },
  {
    "code": "M240h",
    "name": "Pipa PVC AW 2 inch",
    "unit": "M'",
    "price": 28000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 295
  },
  {
    "code": "M240h",
    "name": "Pipa PVC dia 2\"",
    "unit": "M",
    "price": 28000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 296
  },
  {
    "code": "M241",
    "name": "Pipa Baja",
    "unit": "m",
    "price": 400000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 297
  },
  {
    "code": "M241",
    "name": "Pipa Baja dia 150 mm",
    "unit": "m",
    "price": 400000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 298
  },
  {
    "code": "M241",
    "name": "Pipe Ø15 Subdrain 4 inc",
    "unit": "M'",
    "price": 400000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 299
  },
  {
    "code": "M241a",
    "name": "Pipa Baja dia 50 mm",
    "unit": "m",
    "price": 150000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 300
  },
  {
    "code": "M241b",
    "name": "Pipa Baja dia 100 m",
    "unit": "m",
    "price": 300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 301
  },
  {
    "code": "M242",
    "name": "Sambungan PVC Dia. 4\"",
    "unit": "Buah",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 302
  },
  {
    "code": "M242",
    "name": "Sambungan pipa PVC",
    "unit": "buah",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 303
  },
  {
    "code": "M243",
    "name": "Sambungan pipa baja",
    "unit": "buah",
    "price": 35000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 304
  },
  {
    "code": "M245",
    "name": "Bahan tiang pancang kayu Besi untuk sepatu tiang pancang / penyambung",
    "unit": "M1",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 305
  },
  {
    "code": "M245",
    "name": "Tiang Pancang Kayu Besi untuk sepatu tiang pancang / penyambung",
    "unit": "M3",
    "price": 2750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 306
  },
  {
    "code": "M246",
    "name": "(jika ada)",
    "unit": "Kg",
    "price": 15500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 307
  },
  {
    "code": "M24a",
    "name": "Besi Galvanis",
    "unit": "Kg",
    "price": 89166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 308
  },
  {
    "code": "M24a",
    "name": "Galvanish Stell Pipe 3\" (0.996*1*40)",
    "unit": "M'",
    "price": 89166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 309
  },
  {
    "code": "M24a",
    "name": "Pipa Baja Galvanis 3\"",
    "unit": "M",
    "price": 89166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 310
  },
  {
    "code": "M24a",
    "name": "Pipa d = 3\" cm Galvanised",
    "unit": "M",
    "price": 89166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 311
  },
  {
    "code": "M24a",
    "name": "Sandaran Baja Pipa Galvanis 3\"",
    "unit": "m",
    "price": 89166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 312
  },
  {
    "code": "M250",
    "name": "Beton fc' 30 MPa SCC",
    "unit": "M3",
    "price": 1562538.13,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 313
  },
  {
    "code": "M252",
    "name": "Beton Memadat Sendiri fc' 30 MPa",
    "unit": "M3",
    "price": 1376826.76,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 314
  },
  {
    "code": "M255a",
    "name": "Asphaltic plug",
    "unit": "kg",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 315
  },
  {
    "code": "M255a",
    "name": "Rubber bitumen (25 x 7,5 x 100) cm3",
    "unit": "Kg",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 316
  },
  {
    "code": "M256",
    "name": "Accelerator",
    "unit": "Kg",
    "price": 17500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 317
  },
  {
    "code": "M256",
    "name": "Water Reducing & Retarder",
    "unit": "Kg",
    "price": 17500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 318
  },
  {
    "code": "M258",
    "name": "Anyaman Kawat Baja Dilas",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 319
  },
  {
    "code": "M258",
    "name": "Besi Wermesh",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 320
  },
  {
    "code": "M258",
    "name": "Wiremesh Sub Total Material 669.755,78",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 321
  },
  {
    "code": "M258",
    "name": "Wiremesh Sub Total Material 820.601,17",
    "unit": "Kg",
    "price": 32000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 322
  },
  {
    "code": "M259",
    "name": "Curing Membrane",
    "unit": "liter",
    "price": 200000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 323
  },
  {
    "code": "M25a",
    "name": "Pipa Porous diameter 4\"",
    "unit": "M'",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 324
  },
  {
    "code": "M25b",
    "name": "Pipa Porous diameter 5\"",
    "unit": "M'",
    "price": 55000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 325
  },
  {
    "code": "M25c",
    "name": "Pipa Porous diameter 6\"",
    "unit": "M'",
    "price": 70000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 326
  },
  {
    "code": "M25d",
    "name": "Pipa Porous diameter 8\"",
    "unit": "M'",
    "price": 85000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 327
  },
  {
    "code": "M26",
    "name": "Agregat A",
    "unit": "M3",
    "price": 346024.76,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 328
  },
  {
    "code": "M26",
    "name": "Lapis Fondasi Agregat Kelas A",
    "unit": "M3",
    "price": 346024.76,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 329
  },
  {
    "code": "M261",
    "name": "Bridging Plate PL 125 x 6",
    "unit": "kg",
    "price": 15500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 330
  },
  {
    "code": "M262",
    "name": "Perletakan logam tipe fixed 150 Ton",
    "unit": "Buah",
    "price": 1500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 331
  },
  {
    "code": "M263",
    "name": "Perletakan logam tipe movable 150 Ton",
    "unit": "Buah",
    "price": 2000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 332
  },
  {
    "code": "M264",
    "name": "Elastomer karet jenis 3 ukuran 450 x 400 x 45 mm",
    "unit": "Buah",
    "price": 1500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 333
  },
  {
    "code": "M264a",
    "name": "Elastomer karet ukuran 500 x 500 x 100",
    "unit": "bh",
    "price": 1500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 334
  },
  {
    "code": "M265",
    "name": "Beton K-125 (Ready Mix)",
    "unit": "M3",
    "price": 1139970.93,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 335
  },
  {
    "code": "M265",
    "name": "Beton f`c 10 Mpa",
    "unit": "M3",
    "price": 1139970.93,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 336
  },
  {
    "code": "M266",
    "name": "Marmer ukuran 600 mm x 400mm",
    "unit": "m2",
    "price": 400000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 337
  },
  {
    "code": "M267",
    "name": "Baja (ducting, klem)",
    "unit": "Kg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 338
  },
  {
    "code": "M267",
    "name": "Baja Tulangan (ankur)",
    "unit": "Kg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 339
  },
  {
    "code": "M267",
    "name": "Tanaman Perdu",
    "unit": "Buah",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 340
  },
  {
    "code": "M268",
    "name": "Mahoni (Swietania Mahagoni)",
    "unit": "Btg",
    "price": 250000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 341
  },
  {
    "code": "M269",
    "name": "Graut berbahan dasar Semen",
    "unit": "Kg",
    "price": 350000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 342
  },
  {
    "code": "M27",
    "name": "Aggregat B",
    "unit": "M3",
    "price": 199271.65,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 343
  },
  {
    "code": "M27",
    "name": "Agregat B",
    "unit": "M3",
    "price": 199271.65,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 344
  },
  {
    "code": "M271",
    "name": "Tanah Humus ketebalan 20 cm",
    "unit": "M3",
    "price": 2500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 345
  },
  {
    "code": "M271",
    "name": "Tanah humus setebal 20 cm",
    "unit": "m3",
    "price": 2500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 346
  },
  {
    "code": "M272",
    "name": "Pupuk",
    "unit": "kg",
    "price": 16000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 347
  },
  {
    "code": "M273",
    "name": "Gebalan Rumput",
    "unit": "M2",
    "price": 3500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 348
  },
  {
    "code": "M273",
    "name": "Rumput",
    "unit": "M2",
    "price": 3500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 349
  },
  {
    "code": "M275",
    "name": "Pipa Baja Galvanis 6\" 1 jalur",
    "unit": "M'",
    "price": 291166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 350
  },
  {
    "code": "M275",
    "name": "Pipa Baja Galvanis 6\" 2 jalur",
    "unit": "M'",
    "price": 291166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 351
  },
  {
    "code": "M275",
    "name": "Pipa Besi Dia 6\" Tinggi 2 m",
    "unit": "M'",
    "price": 291166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 352
  },
  {
    "code": "M275",
    "name": "Pipa Besi Dia 6\" Tinggi 8 m",
    "unit": "M'",
    "price": 291166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 353
  },
  {
    "code": "M275",
    "name": "Pipa Galvanis Dia 6\" 2 mm",
    "unit": "M'",
    "price": 291166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 354
  },
  {
    "code": "M275",
    "name": "sisi Pipa Besi Dia 3\" Panjang 4.5 m x",
    "unit": "M'",
    "price": 291166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 355
  },
  {
    "code": "M275b",
    "name": "2 x 2 sisi Pipa Besi Dia 2.5\" Panjang 1.5 m",
    "unit": "M'",
    "price": 136666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 356
  },
  {
    "code": "M275b",
    "name": "Pipa Besi Dia 3\" Tinggi 4.5m",
    "unit": "M'",
    "price": 136666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 357
  },
  {
    "code": "M275b",
    "name": "Pipa Galvanis Dia 3\" 1 mm",
    "unit": "M'",
    "price": 136666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 358
  },
  {
    "code": "M275b",
    "name": "Pipa Galvanis Dia 3\" 2 mm",
    "unit": "M'",
    "price": 136666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 359
  },
  {
    "code": "M275b",
    "name": "Pipa Galvanised dia 3 Inch",
    "unit": "M",
    "price": 136666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 360
  },
  {
    "code": "M275c",
    "name": "114 mm",
    "unit": "M'",
    "price": 194666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 361
  },
  {
    "code": "M275c",
    "name": "Pipa Besi 4 inch",
    "unit": "M",
    "price": 194666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 362
  },
  {
    "code": "M275c",
    "name": "Pipa Besi Dia 4\" Tinggi 1 m",
    "unit": "M'",
    "price": 194666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 363
  },
  {
    "code": "M275c",
    "name": "Pipa Besi Dia 4\" Tinggi 1.2 m",
    "unit": "M'",
    "price": 194666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 364
  },
  {
    "code": "M275c",
    "name": "Pipa Besi Dia 4\" Tinggi 4 m Box Besi Uk. 300 x 300 x 300",
    "unit": "M'",
    "price": 194666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 365
  },
  {
    "code": "M275c",
    "name": "Pipa Besi Galvanized 4,5 inch",
    "unit": "M'",
    "price": 194666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 366
  },
  {
    "code": "M275c",
    "name": "Pipa Galvanis Dia 4\" 2 mm",
    "unit": "M'",
    "price": 194666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 367
  },
  {
    "code": "M275d",
    "name": "Galv Pipe Ø 2\" - 60 mm",
    "unit": "M'",
    "price": 104000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 368
  },
  {
    "code": "M275e",
    "name": "Pipa Besi 2,5 inch",
    "unit": "M",
    "price": 146166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 369
  },
  {
    "code": "M275e",
    "name": "Pipa Besi Dia 2.5\" Lengkung 5 m Box Besi Uk. 300 x 300 x 300",
    "unit": "M'",
    "price": 146166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 370
  },
  {
    "code": "M275e",
    "name": "x 18 buah Box Besi Uk. 300 x 300 x 300",
    "unit": "M'",
    "price": 146166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 371
  },
  {
    "code": "M275f",
    "name": "Pipa Baja Galvanis 4.5\"",
    "unit": "M'",
    "price": 214083.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 372
  },
  {
    "code": "M279",
    "name": "Mortar",
    "unit": "M3",
    "price": 4752.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 373
  },
  {
    "code": "M28",
    "name": "Strip drain",
    "unit": "M",
    "price": 45300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 374
  },
  {
    "code": "M280",
    "name": "Pipa Pralon Dia 2 I",
    "unit": "M'",
    "price": 23750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 375
  },
  {
    "code": "M280",
    "name": "Pipa Pralon Dia 2 Inch",
    "unit": "M'",
    "price": 23750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 376
  },
  {
    "code": "M281",
    "name": "Rubber Ring Dia. 40 cm",
    "unit": "unit",
    "price": 54500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 377
  },
  {
    "code": "M281a",
    "name": "Rubber Ring Dia. 60 cm",
    "unit": "Unit",
    "price": 102000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 378
  },
  {
    "code": "M281b",
    "name": "Rubber Ring Dia. 80 cm",
    "unit": "Unit",
    "price": 149000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 379
  },
  {
    "code": "M281c",
    "name": "Rubber Ring Dia. 100 cm",
    "unit": "Unit",
    "price": 244000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 380
  },
  {
    "code": "M281d",
    "name": "Rubber Ring Dia. 120 cm",
    "unit": "Unit",
    "price": 377500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 381
  },
  {
    "code": "M281e",
    "name": "Rubber Ring Dia. 150 cm",
    "unit": "Unit",
    "price": 507500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 382
  },
  {
    "code": "M283",
    "name": "Geotextile Non Woven",
    "unit": "M'",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 383
  },
  {
    "code": "M284",
    "name": "Pipa Penyalir Pra Fabrikasi",
    "unit": "M",
    "price": 5400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 384
  },
  {
    "code": "M285",
    "name": "Pagar Pemisah Pedestrian Carbon Steel",
    "unit": "Kg",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 385
  },
  {
    "code": "M286",
    "name": "Pagar Pemisah Pedestrian Galvanized",
    "unit": "Kg",
    "price": 16000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 386
  },
  {
    "code": "M288",
    "name": "Lapis Permukaan Agregat",
    "unit": "M3",
    "price": 442172.59,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 387
  },
  {
    "code": "M289",
    "name": "Mikro Surfacing Perata dengan aspal emulsi modifikasi polymer CQS-1hP atau QS-1hP untuk Tipe 1",
    "unit": "Ton",
    "price": 2230368.95,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 388
  },
  {
    "code": "M290",
    "name": "Mikro Surfacing Perata dengan aspal emulsi modifikasi polymer CQS-1hP atau QS-1hP untuk Tipe 2",
    "unit": "Ton",
    "price": 2268808.95,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 389
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D11hN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 390
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D11hT",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 391
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D11nhN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 392
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D12hN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 393
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D12hT",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 394
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D12nhN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 395
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D21hN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 396
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D21hT",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 397
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D21nhN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 398
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D21nhT",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 399
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D22hN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 400
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D22hT",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 401
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D22nhN",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 402
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb D22nhT",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 403
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E1h",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 404
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E1nh",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 405
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E2h",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 406
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E2nh",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 407
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E3h",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 408
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E3nh",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 409
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E4h",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 410
  },
  {
    "code": "M291",
    "name": "Cetakan Kereb E4nh",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 411
  },
  {
    "code": "M293",
    "name": "Kapur Dolomit",
    "unit": "Kg",
    "price": 760.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 412
  },
  {
    "code": "M294a",
    "name": "Beton Fast Track (≤ 8 jam)",
    "unit": "M3",
    "price": 2183299.83,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 413
  },
  {
    "code": "M294b",
    "name": "Beton Fast Track ≤ 24 Jam",
    "unit": "M3",
    "price": 2122440.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 414
  },
  {
    "code": "M294b",
    "name": "Beton Fast Track ≤ 24 jam",
    "unit": "M3",
    "price": 2122440.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 415
  },
  {
    "code": "M29a",
    "name": "Aggregat S",
    "unit": "M3",
    "price": 191931.78,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 416
  },
  {
    "code": "M29a",
    "name": "Agregat S",
    "unit": "M3",
    "price": 191931.78,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 417
  },
  {
    "code": "M29b",
    "name": "0-25mm rescreen Scalping Scree",
    "unit": "M3",
    "price": 277879.66,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 418
  },
  {
    "code": "M305a",
    "name": "Pracetak Gelagar Tipe U fc' 65 Mpa , Bentang 32 m",
    "unit": "buah",
    "price": 275000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 419
  },
  {
    "code": "M305b",
    "name": "Pracetak Gelagar Tipe U fc' 65 MPa, Bentang 40 m",
    "unit": "buah",
    "price": 281000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 420
  },
  {
    "code": "M306a",
    "name": "Pracetak Gelagar Tipe U fc' 45 Mpa Bentang Nominal 18 m",
    "unit": "buah",
    "price": 129590686.27,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 421
  },
  {
    "code": "M306b",
    "name": "Pracetak Gelagar Tipe U fc' 45 MPa, Bentang Nominal 33 m",
    "unit": "buah",
    "price": 158450676.27,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 422
  },
  {
    "code": "M307a",
    "name": "Pracetak Gelagar Tipe I fc' 45 MPa, Bentang Nominal 16 m",
    "unit": "buah",
    "price": 121027500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 423
  },
  {
    "code": "M307b",
    "name": "Pracetak Gelagar Tipe I fc' 45 Mpa, Bentang Nominal 25 m",
    "unit": "buah",
    "price": 125037500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 424
  },
  {
    "code": "M307b",
    "name": "Pracetak Gelagar Tipe I fc' 45 Mpa, Bentang Nominal 30 m",
    "unit": "buah",
    "price": 125037500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 425
  },
  {
    "code": "M308",
    "name": "Pracetak Gelagar Beton Pratekan Box, bentang 16.5 m, lebar 16.5 m",
    "unit": "buah",
    "price": 917715982.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 426
  },
  {
    "code": "M309",
    "name": "Pelat Berongga (Voided Slab) Pracetak bentang 16 Meter",
    "unit": "buah",
    "price": 189800000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 427
  },
  {
    "code": "M309",
    "name": "Pelat Berongga (Voided Slab) Pracetak bentang 5 Meter",
    "unit": "buah",
    "price": 24999364.53,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 428
  },
  {
    "code": "M310a",
    "name": "Panel Pracetak Beton Pratekan Full Depth Slab Bentang Nominal 5 m",
    "unit": "Buah",
    "price": 17717031.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 429
  },
  {
    "code": "M310b",
    "name": "Panel Pracetak Beton Pratekan Flat Slab Bentang Nominal 5 m",
    "unit": "Buah",
    "price": 1743339.91,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 430
  },
  {
    "code": "M311",
    "name": "Komponen Struktur Jembatan Baja Non Standar/Khusus",
    "unit": "Kg",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 431
  },
  {
    "code": "M312",
    "name": "Komponen Struktur Jembatan Baja Standar",
    "unit": "Kg",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 432
  },
  {
    "code": "M313",
    "name": "Komponen Struktur Jembatan Baja Semi Permanen",
    "unit": "Kg",
    "price": 35000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 433
  },
  {
    "code": "M315",
    "name": "Tiang Pancang Baja Diameter 500 mm dengan tebal 10 mm",
    "unit": "M",
    "price": 2389761.86,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 434
  },
  {
    "code": "M315",
    "name": "Tiang Pancang Baja Diameter 500 mm dengan tebal 12 mm",
    "unit": "M",
    "price": 2389761.86,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 435
  },
  {
    "code": "M315",
    "name": "Tiang Pancang Baja Diameter 500 mm dengan tebal 9 mm",
    "unit": "M",
    "price": 2389761.86,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 436
  },
  {
    "code": "M315",
    "name": "Tiang Pancang Baja Diameter 600 mm dengan tebal 12 mm",
    "unit": "M",
    "price": 2389761.86,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 437
  },
  {
    "code": "M315",
    "name": "Tiang Pancang Baja Diameter 600 mm dengan tebal 9 mm",
    "unit": "M",
    "price": 2389761.86,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 438
  },
  {
    "code": "M316",
    "name": "Tiang Pancang Beton Bertulang Pratekan Pracetak Ukuran 400 mm x 400 mm",
    "unit": "M",
    "price": 591429.87,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 439
  },
  {
    "code": "M317a",
    "name": "Tiang Pancang Beton Bertulang Pratekan Pracetak Bulat Berongga Diameter 500 mm",
    "unit": "M",
    "price": 789175.31,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 440
  },
  {
    "code": "M317a",
    "name": "Tiang Pancang Beton Pratekan Pracetak Bulat Berongga, diameter 500 mm",
    "unit": "M",
    "price": 789175.31,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 441
  },
  {
    "code": "M317b",
    "name": "Tiang Pancang Beton Bertulang Pratekan Pracetak Bulat Berongga Diameter 800 mm",
    "unit": "M",
    "price": 1813733.04,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 442
  },
  {
    "code": "M318",
    "name": "Bentonite cement slurry",
    "unit": "Kg",
    "price": 9800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 443
  },
  {
    "code": "M31a",
    "name": "Aspal Emulsi CSS-1 atau SS-1",
    "unit": "Kg",
    "price": 10500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 444
  },
  {
    "code": "M31a",
    "name": "Aspal Emulsi CSS-1h atau SS-1h",
    "unit": "ltr",
    "price": 10500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 445
  },
  {
    "code": "M31b",
    "name": "Aspal Emulsi (CQS-1h atau QS-1h)",
    "unit": "ltr",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 446
  },
  {
    "code": "M31c",
    "name": "Aspal Modifikasi",
    "unit": "Kg",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 447
  },
  {
    "code": "M31d",
    "name": "Aspal Emulsi",
    "unit": "ltr",
    "price": 12300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 448
  },
  {
    "code": "M320a",
    "name": "Lead Rubber Bearing fy 105kN, Fbd 215kN, dy 20mm, dbd 265mm, dan Qd 96.02 kN",
    "unit": "Buah",
    "price": 144925000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 449
  },
  {
    "code": "M320b",
    "name": "Lead Rubber Bearing fy 105kN, Fbd 240kN, dy 20mm, dbd 290mm, dan Qd 95 kN",
    "unit": "Buah",
    "price": 137709000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 450
  },
  {
    "code": "M320c",
    "name": "Lead Rubber Bearing fy 160kN, Fbd 412kN, dy 20mm, dbd 300mm, dan Qd 142kN",
    "unit": "Buah",
    "price": 115339583.7,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 451
  },
  {
    "code": "M320d",
    "name": "Lead Rubber Bearing fy 200kN, Fbd 480kN, dy 20mm, dbd 300mm, dan Qd 180kN",
    "unit": "Buah",
    "price": 111730208.7,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 452
  },
  {
    "code": "M320e",
    "name": "Lead Rubber Bearing fy 250kN, Fbd 600kN, dy 20mm, dbd 300mm, dan Qd 225kN",
    "unit": "Buah",
    "price": 188989166.3,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 453
  },
  {
    "code": "M322",
    "name": "Batu Alam Andesit Bintik Bakar 20 x 20 x 3",
    "unit": "Buah",
    "price": 9200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 454
  },
  {
    "code": "M322a",
    "name": "Batu Alam Andesit Hitam 20 x 20 x 3",
    "unit": "Buah",
    "price": 6400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 455
  },
  {
    "code": "M322b",
    "name": "Batu Alam Andesit Bintik Bakar 30 x 30 x 3",
    "unit": "Buah",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 456
  },
  {
    "code": "M322c",
    "name": "Batu Alam Andesit Hitam 30 x 30 x 3",
    "unit": "Buah",
    "price": 23000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 457
  },
  {
    "code": "M322d",
    "name": "Batu Alam Andesit Hitam 20 x 20 x 3 + Honed",
    "unit": "Buah",
    "price": 7400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 458
  },
  {
    "code": "M322e",
    "name": "Batu Alam Andesit Hitam 30 x 30 x 3 + Honed",
    "unit": "Buah",
    "price": 27272.73,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 459
  },
  {
    "code": "M322f",
    "name": "Batu Alam Andesit Polos Bakar 20 x x 3",
    "unit": "Buah",
    "price": 4280.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 460
  },
  {
    "code": "M322g",
    "name": "Batu Alam Andesit Polos Bakar 30 x x 3",
    "unit": "Buah",
    "price": 10454.55,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 461
  },
  {
    "code": "M323",
    "name": "Palem Putri (Veitchia merilli) Tinggi 2 m",
    "unit": "Btg",
    "price": 425000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 462
  },
  {
    "code": "M324",
    "name": "Palem Bambu (Chamaedorea seifrizii)",
    "unit": "Btg",
    "price": 155250.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 463
  },
  {
    "code": "M325",
    "name": "Pagoda (Plumeria pudica)",
    "unit": "Btg",
    "price": 86250.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 464
  },
  {
    "code": "M326",
    "name": "60 cm",
    "unit": "Btg",
    "price": 74750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 465
  },
  {
    "code": "M327",
    "name": "Ketapang(Terminallia Cattapa) 2 m",
    "unit": "Btg",
    "price": 190000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 466
  },
  {
    "code": "M328",
    "name": "Bungur (Largerslroemia Indica)",
    "unit": "Btg",
    "price": 212750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 467
  },
  {
    "code": "M329",
    "name": "Bintaro (Cerbera Oddlam) 2 m",
    "unit": "Btg",
    "price": 175000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 468
  },
  {
    "code": "M33",
    "name": "Pengencer",
    "unit": "liter",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 469
  },
  {
    "code": "M33",
    "name": "Pengencer (thinner)",
    "unit": "liter",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 470
  },
  {
    "code": "M33",
    "name": "Pengencer (thinner) 0,00",
    "unit": "liter",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 471
  },
  {
    "code": "M33",
    "name": "Thinner",
    "unit": "Liter",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 472
  },
  {
    "code": "M330",
    "name": "Waru Laut (Hibiscus Tillaceus) 1m",
    "unit": "Btg",
    "price": 287500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 473
  },
  {
    "code": "M332",
    "name": "Akasia Daun Lebar",
    "unit": "Btg",
    "price": 28000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 474
  },
  {
    "code": "M333",
    "name": "Biola Cantik",
    "unit": "Btg",
    "price": 71012.5,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 475
  },
  {
    "code": "M334",
    "name": "Butterfly",
    "unit": "Btg",
    "price": 212750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 476
  },
  {
    "code": "M335",
    "name": "Dadap Merah (Erythrina Oristagal)",
    "unit": "Btg",
    "price": 212750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 477
  },
  {
    "code": "M336",
    "name": "Kelapa Sawit (Elais Guineensis) 3 m",
    "unit": "Btg",
    "price": 1500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 478
  },
  {
    "code": "M337",
    "name": "Trembesi (Samanea Saman) 2 m",
    "unit": "Btg",
    "price": 550000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 479
  },
  {
    "code": "M338",
    "name": "Jati Mas",
    "unit": "Btg",
    "price": 23000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 480
  },
  {
    "code": "M339",
    "name": "plicata)",
    "unit": "Btg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 481
  },
  {
    "code": "M34",
    "name": "Blass Bead",
    "unit": "Kg",
    "price": 42000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 482
  },
  {
    "code": "M34",
    "name": "Glass Bead",
    "unit": "Kg",
    "price": 42000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 483
  },
  {
    "code": "M340",
    "name": "pterocarpum)",
    "unit": "Btg",
    "price": 44500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 484
  },
  {
    "code": "M341",
    "name": "littoralis)",
    "unit": "Btg",
    "price": 5750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 485
  },
  {
    "code": "M342",
    "name": "Bogenvil (Bougainvillea hybrida)",
    "unit": "Btg",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 486
  },
  {
    "code": "M343",
    "name": "Flamboyan (Delonix regia)",
    "unit": "Btg",
    "price": 300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 487
  },
  {
    "code": "M344",
    "name": "Hujan Mas (Casia glauca)",
    "unit": "Btg",
    "price": 35750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 488
  },
  {
    "code": "M345",
    "name": "Iris (Neomarica longofolia)",
    "unit": "Btg",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 489
  },
  {
    "code": "M346",
    "name": "Jambu Air (Syzigium aquae)",
    "unit": "Btg",
    "price": 80000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 490
  },
  {
    "code": "M347",
    "name": "Jatropa (Jatropha pandurifolia)",
    "unit": "Btg",
    "price": 23000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 491
  },
  {
    "code": "M348",
    "name": "Kaca Piring (Gardenia augusta)",
    "unit": "Btg",
    "price": 35000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 492
  },
  {
    "code": "M349",
    "name": "Pcuminata)",
    "unit": "Btg",
    "price": 330000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 493
  },
  {
    "code": "M35",
    "name": "Pelat Rambu EG",
    "unit": "Buah",
    "price": 135000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 494
  },
  {
    "code": "M350",
    "name": "Kamboja Merah (Plumeria rubra)",
    "unit": "Btg",
    "price": 350000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 495
  },
  {
    "code": "M351",
    "name": "Kana (Canna hybrida)",
    "unit": "Btg",
    "price": 75000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 496
  },
  {
    "code": "M352",
    "name": "variegata)",
    "unit": "Btg",
    "price": 155000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 497
  },
  {
    "code": "M353",
    "name": "Kecrutan (Spathodea campanulata)",
    "unit": "Btg",
    "price": 207000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 498
  },
  {
    "code": "M354",
    "name": "pulcherrima)",
    "unit": "Btg",
    "price": 43700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 499
  },
  {
    "code": "M355",
    "name": "sinesis)",
    "unit": "Btg",
    "price": 12450.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 500
  },
  {
    "code": "M356",
    "name": "Mangga (Mangifera indica)",
    "unit": "Btg",
    "price": 143750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 501
  },
  {
    "code": "M357",
    "name": "Oleander (Nerrium oleander)",
    "unit": "Btg",
    "price": 40250.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 502
  },
  {
    "code": "M358",
    "name": "Palem Weregu (Rhapis excelsa)",
    "unit": "Btg",
    "price": 138000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 503
  },
  {
    "code": "M359",
    "name": "Pangkas Kuning (Duranta sp)",
    "unit": "Btg",
    "price": 6000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 504
  },
  {
    "code": "M35g",
    "name": "Pelat Rambu Diamond Grade",
    "unit": "Buah",
    "price": 486000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 505
  },
  {
    "code": "M35i",
    "name": "Pelat Rambu HIG",
    "unit": "Buah",
    "price": 291150.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 506
  },
  {
    "code": "M35j",
    "name": "Pelat Rambu Peringatan/Larangan/Perintah den",
    "unit": "Buah",
    "price": 4863800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 507
  },
  {
    "code": "M35k",
    "name": "Pelat Rambu Papan Keterangan Jarak Lokasi K",
    "unit": "Buah",
    "price": 1548000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 508
  },
  {
    "code": "M35l",
    "name": "Pelat Rambu Jadi (Batas Wilayah, Uk 300 x 75",
    "unit": "Buah",
    "price": 1485000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 509
  },
  {
    "code": "M35m",
    "name": "Pelat Rambu Jadi (Batas Wilayah, Uk 400 x 10",
    "unit": "Buah",
    "price": 1645000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 510
  },
  {
    "code": "M35n",
    "name": "Pelat Rambu Jadi (Batas Wilayah, Uk 500 x 12",
    "unit": "Buah",
    "price": 1825000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 511
  },
  {
    "code": "M35o",
    "name": "Pelat Rambu Jadi (Batas Wilayah, Uk 600 x 15",
    "unit": "Buah",
    "price": 1935000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 512
  },
  {
    "code": "M35p",
    "name": "Pelat Rambu Jadi (300 x 750 mm)",
    "unit": "Buah",
    "price": 1444000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 513
  },
  {
    "code": "M35q",
    "name": "Pelat Rambu Jadi (1500 x 4000 mm)",
    "unit": "Buah",
    "price": 2850000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 514
  },
  {
    "code": "M35r",
    "name": "Pelat Rambu Jadi (1500 x 3000 mm)",
    "unit": "Buah",
    "price": 1650000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 515
  },
  {
    "code": "M35s",
    "name": "Pelat Rambu Jadi (140 x 600 mm)",
    "unit": "Buah",
    "price": 1550000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 516
  },
  {
    "code": "M36",
    "name": "Guardrail reflektif (termasuk baut)",
    "unit": "Buah",
    "price": 52000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 517
  },
  {
    "code": "M360",
    "name": "Pucuk Merah (Syzigium oleana) tinggi",
    "unit": "Btg",
    "price": 255000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 518
  },
  {
    "code": "M361",
    "name": "Rambutan (Nephelium lappaceum)",
    "unit": "Btg",
    "price": 182875.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 519
  },
  {
    "code": "M362",
    "name": "Sukun (Artocarpus altilis)",
    "unit": "Btg",
    "price": 58763.85,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 520
  },
  {
    "code": "M363",
    "name": "Tabebuya Pink (Tabebuia rosea)",
    "unit": "Btg",
    "price": 218500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 521
  },
  {
    "code": "M364",
    "name": "Wali Songo (Schefflera sp)",
    "unit": "Btg",
    "price": 223000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 522
  },
  {
    "code": "M366",
    "name": "Bambu Penopang",
    "unit": "Btg",
    "price": 17500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 523
  },
  {
    "code": "M367",
    "name": "Blok beton / Batu Bata 21 x 10.5 x 10",
    "unit": "Buah",
    "price": 105500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 524
  },
  {
    "code": "M368",
    "name": "Homogeneous Tile 20x20x3",
    "unit": "Buah",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 525
  },
  {
    "code": "M368a",
    "name": "Homogeneous Tile 30x30x3",
    "unit": "Buah",
    "price": 24545.45,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 526
  },
  {
    "code": "M369",
    "name": "Guiding Block Go Difabel Stainless Steel",
    "unit": "Buah",
    "price": 52000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 527
  },
  {
    "code": "M369a",
    "name": "Guiding Block Stop Difabel Stainless Steel",
    "unit": "Buah",
    "price": 27000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 528
  },
  {
    "code": "M369b",
    "name": "Guiding Block Go Difabel Alumunium",
    "unit": "Buah",
    "price": 21160.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 529
  },
  {
    "code": "M369c",
    "name": "Guiding Block Stop Difabel Alumunium",
    "unit": "Buah",
    "price": 9775.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 530
  },
  {
    "code": "M370",
    "name": "Iron Cast Manhole D60 + Besi Angkur set",
    "unit": "Buah",
    "price": 2340000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 531
  },
  {
    "code": "M370a",
    "name": "Ironcast Manhole Kotak 60 x 60",
    "unit": "Buah",
    "price": 2450000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 532
  },
  {
    "code": "M370a",
    "name": "Ironcast Manhole Kotak 80 x 80",
    "unit": "Buah",
    "price": 2700000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 533
  },
  {
    "code": "M370b",
    "name": "Iron Cast Tree Grade D60 Sub Total Material 1.900.000,00",
    "unit": "Buah",
    "price": 1900000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 534
  },
  {
    "code": "M370c",
    "name": "Iron Cast Tree Grade Kotak 60 x 60 Sub Total Material 2.100.000,00",
    "unit": "Buah",
    "price": 2100000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 535
  },
  {
    "code": "M370d",
    "name": "Iron Cast Drain Grade 100 x 58 x 4.5",
    "unit": "Buah",
    "price": 2700000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 536
  },
  {
    "code": "M371",
    "name": "Tempat Sampah Galvanis 75 Liter Sub Total Material 120.000,00",
    "unit": "Buah",
    "price": 120000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 537
  },
  {
    "code": "M371a",
    "name": "Tempat Sampah Galvanis 75 Liter + Tu Sub Total Material 200.000,00",
    "unit": "Buah",
    "price": 200000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 538
  },
  {
    "code": "M372",
    "name": "Kursi Taman Cast Iron + Kayu Sub Total Material 1.500.000,00",
    "unit": "Buah",
    "price": 1500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 539
  },
  {
    "code": "M374",
    "name": "Batu Bata",
    "unit": "Buah",
    "price": 800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 540
  },
  {
    "code": "M374",
    "name": "Batu Bata Sub Total Material 28.731,60",
    "unit": "Buah",
    "price": 800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 541
  },
  {
    "code": "M375",
    "name": "Bollard Cast iron",
    "unit": "Buah",
    "price": 1029250.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 542
  },
  {
    "code": "M375a",
    "name": "Bollard Cast iron Sub Total Material 895.000,00",
    "unit": "Buah",
    "price": 895000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 543
  },
  {
    "code": "M376",
    "name": "Bohlam Lampu LED 10 Watt Sub Total Material 1.067.950,00",
    "unit": "Buah",
    "price": 38700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 544
  },
  {
    "code": "M377",
    "name": "WPC (Wood Plastic Composite) Sub Total Material 568.965,52",
    "unit": "Buah",
    "price": 220000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 545
  },
  {
    "code": "M378",
    "name": "Penanda Tempat berupa lightbox acrylic Sub Total Material 459.000,00",
    "unit": "Unit",
    "price": 459000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 546
  },
  {
    "code": "M379",
    "name": "Cetakan Tipe New Jersey",
    "unit": "M1",
    "price": 91487.37,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 547
  },
  {
    "code": "M379a",
    "name": "Cetakan Tipe Single Slope",
    "unit": "M1",
    "price": 122007.81,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 548
  },
  {
    "code": "M379b",
    "name": "Cetakan Tipe F Shape",
    "unit": "M1",
    "price": 104461.81,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 549
  },
  {
    "code": "M379c",
    "name": "Cetakan Tipe Vertical Shape",
    "unit": "M1",
    "price": 87599.8,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 550
  },
  {
    "code": "M37a",
    "name": "Beton fc’25 MPa",
    "unit": "M3",
    "price": 1376559.29,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 551
  },
  {
    "code": "M380",
    "name": "Patok Pengarah Plastik",
    "unit": "Buah",
    "price": 137000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 552
  },
  {
    "code": "M380",
    "name": "Patok Rumija B Plastik",
    "unit": "Buah",
    "price": 137000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 553
  },
  {
    "code": "M381a",
    "name": "Lurus Tiang Penyangga (Profil U Uk. 1800 x 175 x",
    "unit": "M",
    "price": 480000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 554
  },
  {
    "code": "M381a",
    "name": "Pagar Pengaman Semi Kaku W Beam Lurus",
    "unit": "M",
    "price": 480000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 555
  },
  {
    "code": "M381b",
    "name": "Lengkung Tiang Penyangga (Profil U Uk. 1800 x 175 x",
    "unit": "M",
    "price": 575000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 556
  },
  {
    "code": "M381b",
    "name": "Pagar Pengaman Semi Kaku W Beam Lengkung",
    "unit": "M",
    "price": 575000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 557
  },
  {
    "code": "M381c",
    "name": "Pagar Pengaman Semi Kaku Thrie Beam",
    "unit": "M",
    "price": 670000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 558
  },
  {
    "code": "M381c",
    "name": "Pagar Pengaman Semi Kaku Thrie Beam Tiang Penyangga (Profil U Uk. 1800 x 175 x",
    "unit": "M",
    "price": 670000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 559
  },
  {
    "code": "M381c",
    "name": "Tiang Penyangga (Supporting Post)",
    "unit": "ea",
    "price": 670000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 560
  },
  {
    "code": "M381d",
    "name": "Pagar Pengaman Semi Kaku Tidak Menerus",
    "unit": "M",
    "price": 410000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 561
  },
  {
    "code": "M381d",
    "name": "Pagar Pengaman Semi Kaku Tidak Menerus Tiang Penyangga (Profil U Uk. 1800 x 175 x",
    "unit": "M",
    "price": 410000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 562
  },
  {
    "code": "M381e",
    "name": "72 x 6 mm) Besi Pengikat (Block Piece Profil U Uk 350",
    "unit": "M",
    "price": 579000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 563
  },
  {
    "code": "M381e",
    "name": "Tiang Penyangga (Profil U Uk. 1800 x 175 x 72 x 6 mm)",
    "unit": "M",
    "price": 579000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 564
  },
  {
    "code": "M381f",
    "name": "Besi Pengikat (Block Piece Profil U Uk 350 x x 72 x 6 mm)",
    "unit": "M",
    "price": 579000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 565
  },
  {
    "code": "M381f",
    "name": "x 175 x 72 x 6 mm)",
    "unit": "M",
    "price": 579000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 566
  },
  {
    "code": "M381g",
    "name": "Baut, ring, mur 16 x 32",
    "unit": "Buah",
    "price": 20100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 567
  },
  {
    "code": "M381h",
    "name": "Baut, ring, mur 16 x 35",
    "unit": "Buah",
    "price": 22400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 568
  },
  {
    "code": "M381i",
    "name": "Baut, ring, mur 16 x 50",
    "unit": "Buah",
    "price": 24500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 569
  },
  {
    "code": "M381j",
    "name": "Sticker retroreflektif",
    "unit": "M",
    "price": 7000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 570
  },
  {
    "code": "M381k",
    "name": "Bagian ujung pagar pengaman semi kaku W Beam",
    "unit": "Buah",
    "price": 150000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 571
  },
  {
    "code": "M381k",
    "name": "Beam",
    "unit": "Buah",
    "price": 150000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 572
  },
  {
    "code": "M381l",
    "name": "Bagian ujung pagar pengaman semi kaku Thrie Beam",
    "unit": "Buah",
    "price": 185000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 573
  },
  {
    "code": "M381l",
    "name": "Bagian ujung pagar pengaman semi kaku tidak menerus",
    "unit": "Buah",
    "price": 185000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 574
  },
  {
    "code": "M381l",
    "name": "Thrie Beam",
    "unit": "Buah",
    "price": 185000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 575
  },
  {
    "code": "M381l",
    "name": "tidak menerus",
    "unit": "Buah",
    "price": 185000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 576
  },
  {
    "code": "M381n",
    "name": "Asimetrik Beam",
    "unit": "Buah",
    "price": 205000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 577
  },
  {
    "code": "M382",
    "name": "Panel Beton Pracetak 2.4 x 0.4 x 0.05 K250",
    "unit": "Buah",
    "price": 123000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 578
  },
  {
    "code": "M384",
    "name": "Kabel Sling (Wire Steel) Box Besi Uk. 300 x 300 x 300",
    "unit": "M'",
    "price": 9000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 579
  },
  {
    "code": "M384a",
    "name": "Kabel Baja",
    "unit": "M'",
    "price": 34800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 580
  },
  {
    "code": "M385",
    "name": "Reflektor",
    "unit": "Buah",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 581
  },
  {
    "code": "M385",
    "name": "Refrektor",
    "unit": "ea",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 582
  },
  {
    "code": "M386",
    "name": "Reflektif Sheet",
    "unit": "M2",
    "price": 396666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 583
  },
  {
    "code": "M386",
    "name": "Reflekting Sheet & Panel",
    "unit": "M2",
    "price": 396666.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 584
  },
  {
    "code": "M388",
    "name": "Anchor L Dia. 25 mm",
    "unit": "Buah",
    "price": 93600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 585
  },
  {
    "code": "M388",
    "name": "Angkur Baut dia.25 - 40 cm & mur",
    "unit": "Buah",
    "price": 93600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 586
  },
  {
    "code": "M388",
    "name": "Angkur D 25",
    "unit": "bh",
    "price": 93600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 587
  },
  {
    "code": "M389",
    "name": "Kawat Duri Galvanized 2 mm",
    "unit": "M'",
    "price": 1750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 588
  },
  {
    "code": "M38a",
    "name": "Wiremesh M6",
    "unit": "Lbr",
    "price": 399800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 589
  },
  {
    "code": "M38b",
    "name": "Wiremesh M8",
    "unit": "Lbr",
    "price": 710600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 590
  },
  {
    "code": "M38c",
    "name": "Wiremesh M10",
    "unit": "Lbr",
    "price": 1052300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 591
  },
  {
    "code": "M390",
    "name": "Pagar BRC 175 cm x 240 cm, 7 mm",
    "unit": "Lbr",
    "price": 815000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 592
  },
  {
    "code": "M391",
    "name": "Tiang BRC T175 225 cm, 2 inch + aksesoris",
    "unit": "M'",
    "price": 124444.44,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 593
  },
  {
    "code": "M392",
    "name": "Pagar Pipa Besi 150 x 120 x 45",
    "unit": "Buah",
    "price": 950000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 594
  },
  {
    "code": "M392a",
    "name": "Pagar Pipa Besi 200 x 120 x 45",
    "unit": "Buah",
    "price": 1000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 595
  },
  {
    "code": "M393",
    "name": "Kawat Harmonika 50x50 2 m",
    "unit": "M'",
    "price": 89000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 596
  },
  {
    "code": "M394",
    "name": "Lengan 2.8 m Lampu Jalan LED 100 W (Solar",
    "unit": "Buah",
    "price": 6987000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 597
  },
  {
    "code": "M394",
    "name": "Lengan 2.8 m Lampu Jalan LED 150 W (Solar",
    "unit": "Buah",
    "price": 6987000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 598
  },
  {
    "code": "M394",
    "name": "Lengan 2.8 m Lampu Jalan LED 80 W (Solar",
    "unit": "Buah",
    "price": 6987000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 599
  },
  {
    "code": "M394",
    "name": "Tiang PJU Base Plate Galv., H = m",
    "unit": "Buah",
    "price": 13500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 600
  },
  {
    "code": "M394g",
    "name": "Flashing Light LED 2x20W + Tiang 1.5m",
    "unit": "Buah",
    "price": 6615000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 601
  },
  {
    "code": "M394h",
    "name": "Tiang PJU Lengan Tunggal dia. 172",
    "unit": "Buah",
    "price": 1443250.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 602
  },
  {
    "code": "M394i",
    "name": "Tiang PJU Lengan Ganda dia. 172m",
    "unit": "Buah",
    "price": 2250000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 603
  },
  {
    "code": "M394j",
    "name": "172mm, Tinggi 7 m, Panjang Lengan 2.8 m Lampu Jalan LED 150 W (Solar",
    "unit": "Buah",
    "price": 3725000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 604
  },
  {
    "code": "M394j",
    "name": "Lengan 2.8 m",
    "unit": "Buah",
    "price": 3725000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 605
  },
  {
    "code": "M395a",
    "name": "Lampu PJU LED 150 W",
    "unit": "Buah",
    "price": 4787000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 606
  },
  {
    "code": "M395b",
    "name": "Cell) Komplit",
    "unit": "Buah",
    "price": 10200000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 607
  },
  {
    "code": "M395d",
    "name": "Lampu LED-T 250 Watt (Lengkap)",
    "unit": "Buah",
    "price": 25000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 608
  },
  {
    "code": "M395h",
    "name": "Floodlight LED 200 W",
    "unit": "Buah",
    "price": 9985000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 609
  },
  {
    "code": "M395i",
    "name": "Lampu Pedestrian LED 1x5 W",
    "unit": "Buah",
    "price": 285000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 610
  },
  {
    "code": "M395j",
    "name": "(Lengkap)",
    "unit": "Buah",
    "price": 102000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 611
  },
  {
    "code": "M396a",
    "name": "NYA 1x16 mm² dan aksesoris",
    "unit": "M'",
    "price": 33400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 612
  },
  {
    "code": "M396b",
    "name": "NYA 1x25 mm² dan aksesoris",
    "unit": "M'",
    "price": 51600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 613
  },
  {
    "code": "M396d",
    "name": "NYA 1x4 mm² dan aksesoris",
    "unit": "M'",
    "price": 7560.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 614
  },
  {
    "code": "M396e",
    "name": "NYA 1x6 mm² dan aksesoris",
    "unit": "M'",
    "price": 11150.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 615
  },
  {
    "code": "M396g",
    "name": "Kabel NYFGBY 4 x 10 mm2",
    "unit": "M'",
    "price": 132900.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 616
  },
  {
    "code": "M396g",
    "name": "Kabel NYFGBY 4C - 10 mm2",
    "unit": "M'",
    "price": 132900.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 617
  },
  {
    "code": "M396g",
    "name": "NYFGbY 4x10 mm² dan aksesoris",
    "unit": "M'",
    "price": 132900.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 618
  },
  {
    "code": "M396g",
    "name": "NYFGbY 4x10 mm² dan aksesoris BCC 16 mm2 (0,16 kg/m) dan",
    "unit": "M'",
    "price": 132900.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 619
  },
  {
    "code": "M396h",
    "name": "Kabel NYFGBY 4C - 16 mm2",
    "unit": "M'",
    "price": 176900.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 620
  },
  {
    "code": "M396h",
    "name": "NYFGbY 4x16 mm² dan aksesoris",
    "unit": "M'",
    "price": 176900.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 621
  },
  {
    "code": "M396i",
    "name": "Kabel NYFGBY 4C - 25 mm2",
    "unit": "M'",
    "price": 274200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 622
  },
  {
    "code": "M396j",
    "name": "Kabel NYFGBY 4C - 35 mm2",
    "unit": "M'",
    "price": 349400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 623
  },
  {
    "code": "M396j",
    "name": "NYFGbY 4x35 mm² dan aksesoris",
    "unit": "M'",
    "price": 349400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 624
  },
  {
    "code": "M396j",
    "name": "NYFGbY 4x35 mm² dan aksesoris BCC 16 mm2 (0,16 kg/m) dan",
    "unit": "M'",
    "price": 349400.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 625
  },
  {
    "code": "M396k",
    "name": "Kabel NYFGBY 4C - 4 mm2",
    "unit": "M'",
    "price": 71000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 626
  },
  {
    "code": "M396k",
    "name": "NYFGbY 4x4 mm² dan aksesoris",
    "unit": "M'",
    "price": 71000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 627
  },
  {
    "code": "M396m",
    "name": "Kabel NYFGBY 4C - 6 mm2",
    "unit": "M'",
    "price": 92700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 628
  },
  {
    "code": "M396m",
    "name": "Kabel TR NYFGBY 4C x 6 mm2",
    "unit": "M'",
    "price": 92700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 629
  },
  {
    "code": "M396n",
    "name": "Kabel NYM 3 x 2.5 mm2",
    "unit": "M'",
    "price": 16020.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 630
  },
  {
    "code": "M396n",
    "name": "Kabel NYM 3x2.5 mm2",
    "unit": "M'",
    "price": 16020.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 631
  },
  {
    "code": "M396n",
    "name": "Kabel TR NYM 3x2.5 mm2",
    "unit": "M'",
    "price": 16020.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 632
  },
  {
    "code": "M396n",
    "name": "Kabel TR NYM 3x2.5 mm²",
    "unit": "M'",
    "price": 16020.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 633
  },
  {
    "code": "M396n",
    "name": "Kabel TR NYY 3x2.5 mm²",
    "unit": "M'",
    "price": 16020.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 634
  },
  {
    "code": "M396n",
    "name": "NYM 3x2.5 mm2",
    "unit": "M'",
    "price": 16020.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 635
  },
  {
    "code": "M396o",
    "name": "Kabel NYY 3 x 2.5 mm2",
    "unit": "M'",
    "price": 19940.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 636
  },
  {
    "code": "M396o",
    "name": "Kabel NYY 3C - 2.5 mm2",
    "unit": "M'",
    "price": 19940.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 637
  },
  {
    "code": "M396o",
    "name": "Kabel NYY 3x2.5 mm2",
    "unit": "M'",
    "price": 19940.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 638
  },
  {
    "code": "M396o",
    "name": "NYY 3x2.5 mm2",
    "unit": "M'",
    "price": 19940.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 639
  },
  {
    "code": "M396r",
    "name": "Kabel NYY/NYM 2x2.5 mm2",
    "unit": "M'",
    "price": 24960.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 640
  },
  {
    "code": "M396r",
    "name": "Kabel TR NYM /NYY 2x2.5 mm²",
    "unit": "M'",
    "price": 24960.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 641
  },
  {
    "code": "M396s",
    "name": "NYY 4x50 mm² dan aksesoris",
    "unit": "M'",
    "price": 394800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 642
  },
  {
    "code": "M396u",
    "name": "mm2",
    "unit": "M'",
    "price": 42700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 643
  },
  {
    "code": "M396v",
    "name": "Kabel NYFGBY 2C - 10 mm2",
    "unit": "M'",
    "price": 77000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 644
  },
  {
    "code": "M396w",
    "name": "Kabel NYFGBY 2C - 16 mm2",
    "unit": "M'",
    "price": 98000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 645
  },
  {
    "code": "M396x",
    "name": "Kabel NYFGBY 4C - 1 mm2",
    "unit": "M'",
    "price": 18000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 646
  },
  {
    "code": "M396y",
    "name": "Kabel NYFGBY 4C - 1.5 mm2",
    "unit": "M'",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 647
  },
  {
    "code": "M396z",
    "name": "Kabel NYFGBY 4C - 50 mm2",
    "unit": "M'",
    "price": 379000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 648
  },
  {
    "code": "M397",
    "name": "BC 16 mm2",
    "unit": "M'",
    "price": 29085.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 649
  },
  {
    "code": "M397b",
    "name": "Kabel BC - 6 mm2",
    "unit": "M'",
    "price": 11025.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 650
  },
  {
    "code": "M397c",
    "name": "Kabel BC - 10 mm2",
    "unit": "M'",
    "price": 16500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 651
  },
  {
    "code": "M397d",
    "name": "Kabel BC - 25 mm2",
    "unit": "M'",
    "price": 41000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 652
  },
  {
    "code": "M397e",
    "name": "Kabel BC - 35 mm2",
    "unit": "M'",
    "price": 55500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 653
  },
  {
    "code": "M398",
    "name": "MCB 1P, 2A, 4,5 kA",
    "unit": "Buah",
    "price": 96904.5,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 654
  },
  {
    "code": "M398g",
    "name": "Clamp L (kabel BC)",
    "unit": "Buah",
    "price": 106375.5,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 655
  },
  {
    "code": "M398g",
    "name": "MCB, 1P, 16A",
    "unit": "Buah",
    "price": 106375.5,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 656
  },
  {
    "code": "M398j",
    "name": "380/220V 10 kA Panel-Acc Cu, Busbar RST, N, PE",
    "unit": "Buah",
    "price": 600600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 657
  },
  {
    "code": "M398l",
    "name": "380/220V 10 kA Panel-Acc Cu, Busbar RST, N,",
    "unit": "Buah",
    "price": 600600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 658
  },
  {
    "code": "M398l",
    "name": "380/220V 15 kA Circuit Breaker-MCB 3P 10 A",
    "unit": "Buah",
    "price": 1117710.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 659
  },
  {
    "code": "M398n",
    "name": "MCB, 3P, 25A",
    "unit": "Buah",
    "price": 976223.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 660
  },
  {
    "code": "M399a",
    "name": "380V 18 kA EZC Circuit Breaker-MCB 3P 20 A",
    "unit": "Buah",
    "price": 1004850.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 661
  },
  {
    "code": "M399b",
    "name": "380V 18 kA EZC Circuit Breaker-MCB 3P 10 A",
    "unit": "Buah",
    "price": 1004850.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 662
  },
  {
    "code": "M399d",
    "name": "380V 18 kA EZC Circuit Breaker-MCB 3P 16 A",
    "unit": "Buah",
    "price": 1004850.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 663
  },
  {
    "code": "M399e",
    "name": "380V 18 kA EZC Circuit Breaker-MCB 3P 25 A",
    "unit": "Buah",
    "price": 1004850.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 664
  },
  {
    "code": "M399f",
    "name": "MCCB 3P 250A",
    "unit": "Buah",
    "price": 3781800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 665
  },
  {
    "code": "M399f",
    "name": "MCCB, 3P, 250A",
    "unit": "Buah",
    "price": 3781800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 666
  },
  {
    "code": "M39a",
    "name": "Baja Tulangan Polos",
    "unit": "Kg",
    "price": 8369.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 667
  },
  {
    "code": "M39a",
    "name": "Baja Tulangan Polos BjTP 280",
    "unit": "Kg",
    "price": 8369.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 668
  },
  {
    "code": "M39a",
    "name": "Besi Angkur P6",
    "unit": "Kg",
    "price": 8369.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 669
  },
  {
    "code": "M39a",
    "name": "Besi Tulangan Polos Diameter 13",
    "unit": "M'",
    "price": 8369.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 670
  },
  {
    "code": "M39a",
    "name": "Dowel (32mm)",
    "unit": "Kg",
    "price": 8369.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 671
  },
  {
    "code": "M39a",
    "name": "Dowel Dia 32 mm",
    "unit": "Kg",
    "price": 8369.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 672
  },
  {
    "code": "M39b",
    "name": "Baja Tulangan",
    "unit": "Kg",
    "price": 9000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 673
  },
  {
    "code": "M39b",
    "name": "Baja Tulangan BJTS",
    "unit": "Kg",
    "price": 9000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 674
  },
  {
    "code": "M39b",
    "name": "Baja Tulangan Sirip BjTS 280",
    "unit": "Kg",
    "price": 9000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 675
  },
  {
    "code": "M39b",
    "name": "Baja Tulangan Sirip dengan Proteksi BjTS 280",
    "unit": "Kg",
    "price": 12150.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 676
  },
  {
    "code": "M39b",
    "name": "Baja Tulangan Ulir (On Site)",
    "unit": "Kg",
    "price": 9000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 677
  },
  {
    "code": "M39b",
    "name": "Baja tulangan sirip BjTS 280",
    "unit": "Kg",
    "price": 9000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 678
  },
  {
    "code": "M40",
    "name": "Kapur",
    "unit": "M3",
    "price": 185000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 679
  },
  {
    "code": "M400",
    "name": "Cable Connector 4 mm",
    "unit": "Buah",
    "price": 6405.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 680
  },
  {
    "code": "M400a",
    "name": "Cable Connector PJU",
    "unit": "Buah",
    "price": 76000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 681
  },
  {
    "code": "M401",
    "name": "Schoen 16 mm2",
    "unit": "Buah",
    "price": 3500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 682
  },
  {
    "code": "M402",
    "name": "Armature Lampu Tunnel",
    "unit": "Buah",
    "price": 4580000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 683
  },
  {
    "code": "M403",
    "name": "Sekering Kontrol PJU",
    "unit": "Buah",
    "price": 115000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 684
  },
  {
    "code": "M404",
    "name": "Box PHB Induk",
    "unit": "Buah",
    "price": 1800000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 685
  },
  {
    "code": "M405",
    "name": "Box PHB Pembagi",
    "unit": "Buah",
    "price": 700000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 686
  },
  {
    "code": "M406",
    "name": "Handle Saklar 32 A",
    "unit": "Buah",
    "price": 300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 687
  },
  {
    "code": "M406a",
    "name": "Handle Saklar 40 A",
    "unit": "Buah",
    "price": 500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 688
  },
  {
    "code": "M407",
    "name": "Contactor Max 20A",
    "unit": "Buah",
    "price": 155000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 689
  },
  {
    "code": "M407a",
    "name": "Contactor Max 40A",
    "unit": "Buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 690
  },
  {
    "code": "M407b",
    "name": "Contactor Max 100A",
    "unit": "Buah",
    "price": 2100000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 691
  },
  {
    "code": "M408a",
    "name": "Panel 500x400x200 SS316L",
    "unit": "Buah",
    "price": 5700000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 692
  },
  {
    "code": "M408b",
    "name": "Panel 700x500x250 SS316L",
    "unit": "Buah",
    "price": 9500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 693
  },
  {
    "code": "M408b",
    "name": "SS316L",
    "unit": "Buah",
    "price": 9500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 694
  },
  {
    "code": "M409",
    "name": "Panel Canopy 0x500x250",
    "unit": "Buah",
    "price": 1355970.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 695
  },
  {
    "code": "M409",
    "name": "Panel-Canopy 0x500x250 Circuit Breaker-MCB 3P 16 A",
    "unit": "Buah",
    "price": 1355970.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 696
  },
  {
    "code": "M409",
    "name": "Panel-Canopy 0x500x250 Circuit Breaker-MCCB 3P 15 A",
    "unit": "Buah",
    "price": 1355970.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 697
  },
  {
    "code": "M409",
    "name": "Panel-Canopy 0x500x250 Circuit Breaker-MCCB 3P 20 A",
    "unit": "Buah",
    "price": 1355970.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 698
  },
  {
    "code": "M409",
    "name": "Panel-Canopy 0x500x250 Circuit Breaker-MCCB 3P 25 A",
    "unit": "Buah",
    "price": 1355970.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 699
  },
  {
    "code": "M409",
    "name": "Panel-Canopy 0x500x250 Circuit Breaker-MCCB 3P 30 A",
    "unit": "Buah",
    "price": 1355970.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 700
  },
  {
    "code": "M409",
    "name": "Panel-Canopy 0x500x250 Circuit Breaker-MCCB 3P 50 A",
    "unit": "Buah",
    "price": 1355970.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 701
  },
  {
    "code": "M414",
    "name": "15x3",
    "unit": "Buah",
    "price": 298622.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 702
  },
  {
    "code": "M414",
    "name": "PE 15x3",
    "unit": "Buah",
    "price": 298622.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 703
  },
  {
    "code": "M417",
    "name": "20kA Pipa-Galvanis Galv Pipe Ø 4\" -",
    "unit": "Buah",
    "price": 54862.5,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 704
  },
  {
    "code": "M418",
    "name": "Panel-Acc Pilot LED Panel-Acc Fuse+Catridge 6A,",
    "unit": "Buah",
    "price": 28535.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 705
  },
  {
    "code": "M421",
    "name": "Time Switch/Control",
    "unit": "Buah",
    "price": 765889.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 706
  },
  {
    "code": "M424",
    "name": "Pipa Conduit Ø20mm",
    "unit": "M'",
    "price": 8000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 707
  },
  {
    "code": "M425",
    "name": "Elbow Conduit Ø20mm",
    "unit": "Buah",
    "price": 10500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 708
  },
  {
    "code": "M430",
    "name": "T-Doos Conduit Ø20mm",
    "unit": "Buah",
    "price": 9735.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 709
  },
  {
    "code": "M433",
    "name": "Besi Siku 40.40.4",
    "unit": "M'",
    "price": 24166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 710
  },
  {
    "code": "M433",
    "name": "Besi Siku 40.40.4 mm",
    "unit": "M'",
    "price": 24166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 711
  },
  {
    "code": "M434",
    "name": "Besi Siku 50x50x5 mm",
    "unit": "M'",
    "price": 34180.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 712
  },
  {
    "code": "M435",
    "name": "Gembok Anti Karat",
    "unit": "Buah",
    "price": 1154895.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 713
  },
  {
    "code": "M436",
    "name": "Dynabolt m10 x 70mm",
    "unit": "Buah",
    "price": 5513.75,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 714
  },
  {
    "code": "M437",
    "name": "Anchor L Dia. 12 mm",
    "unit": "Buah",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 715
  },
  {
    "code": "M437",
    "name": "Anchor L dia. 12 mm",
    "unit": "Buah",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 716
  },
  {
    "code": "M437",
    "name": "Angkur 8 - 12 mm",
    "unit": "Buah",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 717
  },
  {
    "code": "M437",
    "name": "Mur dan Angkur Baut (L = 12 cm)",
    "unit": "Set",
    "price": 25000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 718
  },
  {
    "code": "M438e",
    "name": "Kabel BC 50 mm²",
    "unit": "M'",
    "price": 87675.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 719
  },
  {
    "code": "M439",
    "name": "aksesoris",
    "unit": "M'",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 720
  },
  {
    "code": "M439a",
    "name": "Kabel BCC 70 mm2",
    "unit": "M'",
    "price": 75000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 721
  },
  {
    "code": "M440",
    "name": "Tiang High Mast 20m Motorized",
    "unit": "Buah",
    "price": 80000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 722
  },
  {
    "code": "M440a",
    "name": "Tiang High Mast 25m Motorized",
    "unit": "Buah",
    "price": 100000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 723
  },
  {
    "code": "M440b",
    "name": "Tiang High Mast 30m Motorized",
    "unit": "Buah",
    "price": 135000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 724
  },
  {
    "code": "M440c",
    "name": "Tiang High Mast 40m Motorized",
    "unit": "Buah",
    "price": 150000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 725
  },
  {
    "code": "M441",
    "name": "Clamp Grounding",
    "unit": "Buah",
    "price": 40500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 726
  },
  {
    "code": "M443",
    "name": "Clamp Pipa",
    "unit": "Buah",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 727
  },
  {
    "code": "M444",
    "name": "Copper Ground Rod 3/4 Inch",
    "unit": "M'",
    "price": 384340.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 728
  },
  {
    "code": "M445",
    "name": "Coupler 3/4 Inch",
    "unit": "Buah",
    "price": 35500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 729
  },
  {
    "code": "M446",
    "name": "Conventional Base Plate 3/4 Inch",
    "unit": "Buah",
    "price": 193750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 730
  },
  {
    "code": "M447",
    "name": "Conventional Splitzen Pure Copper 3/4 Inch",
    "unit": "Buah",
    "price": 178750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 731
  },
  {
    "code": "M449b",
    "name": "20 cm",
    "unit": "Buah",
    "price": 12900000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 732
  },
  {
    "code": "M449b",
    "name": "20 cm Pipa Besi Dia 6\" Tinggi 7 m x 2",
    "unit": "Buah",
    "price": 12900000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 733
  },
  {
    "code": "M46",
    "name": "Pipa Baja Gelombang",
    "unit": "Ton",
    "price": 20000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 734
  },
  {
    "code": "M47",
    "name": "Beton fc'10 MPa",
    "unit": "M3",
    "price": 1139970.93,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 735
  },
  {
    "code": "M48",
    "name": "Baja Mutu SS330 Baut mutu tinggi A325 Tipe 1 diameter",
    "unit": "Kg",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 736
  },
  {
    "code": "M48",
    "name": "Plat Baja",
    "unit": "Kg",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 737
  },
  {
    "code": "M49",
    "name": "Besi Rangka hollow Guardrail 3.5mm M381 M' 35,4000 - 0,00",
    "unit": "Kg",
    "price": 13200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 738
  },
  {
    "code": "M49",
    "name": "setara Baut Mutu Tinggi A490 Tipe 1 diameter",
    "unit": "Kg",
    "price": 13200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 739
  },
  {
    "code": "M495",
    "name": "Colour Hardener",
    "unit": "Kg",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 740
  },
  {
    "code": "M496",
    "name": "Releaser Agent",
    "unit": "Kg",
    "price": 100000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 741
  },
  {
    "code": "M497",
    "name": "HCL Pembersih",
    "unit": "Liter",
    "price": 18000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 742
  },
  {
    "code": "M498",
    "name": "Concrete Sealer",
    "unit": "Kg",
    "price": 75000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 743
  },
  {
    "code": "M499",
    "name": "Stone Coating",
    "unit": "Liter",
    "price": 120000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 744
  },
  {
    "code": "M500",
    "name": "Stamp Concrete Mold",
    "unit": "M3",
    "price": 9100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 745
  },
  {
    "code": "M501",
    "name": "Cermin Tikungan Setengah Lingkaran UK 600 x 300",
    "unit": "Buah",
    "price": 3300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 746
  },
  {
    "code": "M501a",
    "name": "Cermin Tikungan Setengah Lingkaran UK 900 x 450",
    "unit": "Buah",
    "price": 5100000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 747
  },
  {
    "code": "M502",
    "name": "Cermin Tikungan diameter 600 mm",
    "unit": "Buah",
    "price": 255000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 748
  },
  {
    "code": "M502a",
    "name": "Cermin Tikungan diameter 800 mm",
    "unit": "Buah",
    "price": 330000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 749
  },
  {
    "code": "M502b",
    "name": "Cermin Tikungan diameter 1000 mm",
    "unit": "Buah",
    "price": 475000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 750
  },
  {
    "code": "M503",
    "name": "Kiara Payung (Filicium Decipiens)",
    "unit": "Btg",
    "price": 60000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 751
  },
  {
    "code": "M504",
    "name": "Tanjung (Mimusops Elengi)",
    "unit": "Btg",
    "price": 250000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 752
  },
  {
    "code": "M505",
    "name": "Angsana (Ptherocarphus Indicus)",
    "unit": "Btg",
    "price": 30000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 753
  },
  {
    "code": "M506",
    "name": "Teh-tehan (Duranta Erecta)",
    "unit": "Btg",
    "price": 5000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 754
  },
  {
    "code": "M507",
    "name": "Cemara (Cassuarina Equisetifolia)",
    "unit": "Btg",
    "price": 531000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 755
  },
  {
    "code": "M508",
    "name": "Bambu (Bambusa Sp)",
    "unit": "Btg",
    "price": 30000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 756
  },
  {
    "code": "M509",
    "name": "Nusa Indah (mussaenda Sp)",
    "unit": "Btg",
    "price": 75000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 757
  },
  {
    "code": "M51",
    "name": "Kawat Las",
    "unit": "m'",
    "price": 70000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 758
  },
  {
    "code": "M51",
    "name": "Kawat las",
    "unit": "Kg",
    "price": 14000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 759
  },
  {
    "code": "M510",
    "name": "Palem Raja (Roystonea Regia)",
    "unit": "Btg",
    "price": 500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 760
  },
  {
    "code": "M511",
    "name": "Pinang Jambe (Arera Catechu)",
    "unit": "Btg",
    "price": 1100000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 761
  },
  {
    "code": "M512",
    "name": "Lontar/Siwalan (Borassus Flabellifer)",
    "unit": "Btg",
    "price": 4750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 762
  },
  {
    "code": "M513",
    "name": "Khaya (Khaya Sinegalensis)",
    "unit": "Btg",
    "price": 850000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 763
  },
  {
    "code": "M514",
    "name": "Kol Banda (Pisonia Alba)",
    "unit": "Btg",
    "price": 900000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 764
  },
  {
    "code": "M515",
    "name": "Wilkesiana Macefeana)",
    "unit": "Btg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 765
  },
  {
    "code": "M516",
    "name": "Glodokan Tiang (Polyalthea Sp)",
    "unit": "Btg",
    "price": 735000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 766
  },
  {
    "code": "M517",
    "name": "Glodokan (Polyalthea Longifolia)",
    "unit": "Btg",
    "price": 1950000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 767
  },
  {
    "code": "M518",
    "name": "Safety Roller - Post - PVC Tube - Beam - Rolling Circle - End Socket - Post Cap - Bolt - Nut",
    "unit": "M'",
    "price": 8500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 768
  },
  {
    "code": "M519a",
    "name": "Visual Barrier (Panel, H Post, Bolt, Nut)",
    "unit": "M'",
    "price": 900000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 769
  },
  {
    "code": "M519b",
    "name": "Noise Barrier (Panel, H Post, Bolt, Nut)",
    "unit": "M'",
    "price": 1250000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 770
  },
  {
    "code": "M52",
    "name": "Pipa baja Pengecatan struktur baja pada daerah",
    "unit": "Kg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 771
  },
  {
    "code": "M52",
    "name": "Turap baja",
    "unit": "Kg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 772
  },
  {
    "code": "M520",
    "name": "Patok Penanda Kabel",
    "unit": "Buah",
    "price": 55000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 773
  },
  {
    "code": "M521",
    "name": "Pelindung Kabel",
    "unit": "M'",
    "price": 40000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 774
  },
  {
    "code": "M522",
    "name": "Precast U-Ditch Ukuran 70 x 70 X 100",
    "unit": "Unit",
    "price": 683000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 775
  },
  {
    "code": "M522a",
    "name": "Precast U-Ditch Ukuran x",
    "unit": "Unit",
    "price": 2472000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 776
  },
  {
    "code": "M522a",
    "name": "Precast U-Ditch Ukuran x 120 x 120",
    "unit": "Unit",
    "price": 2472000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 777
  },
  {
    "code": "M522b",
    "name": "Cover U-Ditch Uk 120 x 120",
    "unit": "Unit",
    "price": 207000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 778
  },
  {
    "code": "M522c",
    "name": "Precast U-Ditch Ukuran x 140 X 120",
    "unit": "Unit",
    "price": 2872000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 779
  },
  {
    "code": "M522d",
    "name": "Cover U-Ditch Ukuran 140 x 140",
    "unit": "Unit",
    "price": 237000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 780
  },
  {
    "code": "M522e",
    "name": "U-Ditch 400x400x1000",
    "unit": "Buah",
    "price": 590000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 781
  },
  {
    "code": "M522f",
    "name": "Cover U-Ditch 400",
    "unit": "Buah",
    "price": 165000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 782
  },
  {
    "code": "M523",
    "name": "Grounding Bak Kontrol Beton",
    "unit": "Buah",
    "price": 950000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 783
  },
  {
    "code": "M524",
    "name": "Copper Ground Rod",
    "unit": "M'",
    "price": 384340.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 784
  },
  {
    "code": "M53a",
    "name": "Baja Mutu SS490 atau setara Baut Mutu Tinggi A490 Tipe 1 diameter",
    "unit": "Kg",
    "price": 13350.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 785
  },
  {
    "code": "M53b",
    "name": "Baja Mutu SM 490 A, B, C atau setara Baut mutu tinggi A325 Tipe 1 diameter",
    "unit": "Kg",
    "price": 13500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 786
  },
  {
    "code": "M53c",
    "name": "Baja Mutu SM 490 YA, YB atau setara Baut Mutu Tinggi A490 Tipe 1 diameter",
    "unit": "Kg",
    "price": 13800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 787
  },
  {
    "code": "M54",
    "name": "Baja Mutu SM 520 B, C atau setara Baut Mutu Tinggi A490 Tipe 1 diameter",
    "unit": "Kg",
    "price": 14000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 788
  },
  {
    "code": "M55",
    "name": "Baja Mutu SM 570 B, C atau setara Baut Mutu Tinggi A490 Tipe 1 diameter",
    "unit": "Kg",
    "price": 14300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 789
  },
  {
    "code": "M55",
    "name": "Baja Mutu SS 540 atau setara Baut Mutu Tinggi A490 Tipe 1 diameter",
    "unit": "Kg",
    "price": 14300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 790
  },
  {
    "code": "M559",
    "name": "Arare (Osmoxylum lineare)",
    "unit": "Btg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 791
  },
  {
    "code": "M560",
    "name": "Bintaro Menado (Cerbera manghas)",
    "unit": "Btg",
    "price": 185000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 792
  },
  {
    "code": "M561",
    "name": "Bunga Tahi Ayam (Lantana Camara)",
    "unit": "Btg",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 793
  },
  {
    "code": "M562",
    "name": "sempervirens)",
    "unit": "Btg",
    "price": 531000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 794
  },
  {
    "code": "M563",
    "name": "Damar (Agathis dammara)",
    "unit": "Btg",
    "price": 300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 795
  },
  {
    "code": "M564",
    "name": "Dedalu Tangis (Salix babylonica)",
    "unit": "Btg",
    "price": 475000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 796
  },
  {
    "code": "M565",
    "name": "equisetifolia)",
    "unit": "Btg",
    "price": 30000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 797
  },
  {
    "code": "M566",
    "name": "Jambu-Jambuan (Syzigium grandis)",
    "unit": "Btg",
    "price": 100000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 798
  },
  {
    "code": "M567",
    "name": "Kacang-kacangan (Arachis pintoi)",
    "unit": "Btg",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 799
  },
  {
    "code": "M568",
    "name": "Kaliko (Altenanthera versicolor)",
    "unit": "Btg",
    "price": 35000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 800
  },
  {
    "code": "M569",
    "name": "Kamboja Putih (Plumeria alba)",
    "unit": "Btg",
    "price": 300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 801
  },
  {
    "code": "M570",
    "name": "Kucai (Zephyranthes)",
    "unit": "Btg",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 802
  },
  {
    "code": "M571",
    "name": "Mahkota Duri (Euphorbia Milii)",
    "unit": "Btg",
    "price": 80000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 803
  },
  {
    "code": "M572",
    "name": "Pandan Laut (Pandanus odorifer)",
    "unit": "Btg",
    "price": 50000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 804
  },
  {
    "code": "M573",
    "name": "Pacing Pentul (Costus woodsonii)",
    "unit": "Btg",
    "price": 8250.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 805
  },
  {
    "code": "M574",
    "name": "Palem Bismarkia (Bysmarckia nobilis)",
    "unit": "Btg",
    "price": 1500000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 806
  },
  {
    "code": "M575",
    "name": "Palem Kipas (Livistona saribus)",
    "unit": "Btg",
    "price": 235000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 807
  },
  {
    "code": "M576",
    "name": "Pandan Kuning (Pandanus pygmaeus)",
    "unit": "Btg",
    "price": 7500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 808
  },
  {
    "code": "M577",
    "name": "Peace Lily (Spathiphyllum petite)",
    "unit": "Btg",
    "price": 11250.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 809
  },
  {
    "code": "M578",
    "name": "Penawar Jamber (Cycas revolute)",
    "unit": "Btg",
    "price": 172500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 810
  },
  {
    "code": "M579",
    "name": "Rumput Gajah (Pinnesetum purpureum",
    "unit": "Btg",
    "price": 20000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 811
  },
  {
    "code": "M57a",
    "name": "Baja Tulangan (wire mesh)",
    "unit": "Kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 812
  },
  {
    "code": "M57a",
    "name": "Baja Tulangan BjTS 420",
    "unit": "Kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 813
  },
  {
    "code": "M57a",
    "name": "Baja Tulangan Sirip BjTS 420",
    "unit": "Kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 814
  },
  {
    "code": "M57a",
    "name": "Baja Tulangan Sirip dengan Proteksi BjTS 420",
    "unit": "Kg",
    "price": 13271.85,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 815
  },
  {
    "code": "M57a",
    "name": "Baja tulangan sirip BjTS 420",
    "unit": "Kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 816
  },
  {
    "code": "M57a",
    "name": "Batang Pengikat BJTS 420",
    "unit": "kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 817
  },
  {
    "code": "M57a",
    "name": "Besi Beton",
    "unit": "Kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 818
  },
  {
    "code": "M57a",
    "name": "Besi Beton + Angkur",
    "unit": "Kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 819
  },
  {
    "code": "M57a",
    "name": "Besi Tulangan",
    "unit": "Kg",
    "price": 9831.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 820
  },
  {
    "code": "M57b",
    "name": "Baja Tulangan Sirip BjTS 520",
    "unit": "Kg",
    "price": 9902.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 821
  },
  {
    "code": "M57b",
    "name": "Baja Tulangan Sirip dengan Proteksi BjTS 520",
    "unit": "Kg",
    "price": 13367.7,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 822
  },
  {
    "code": "M57c",
    "name": "Baja Tulangan Sirip BjTS 550",
    "unit": "Kg",
    "price": 10943.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 823
  },
  {
    "code": "M57c",
    "name": "Baja Tulangan Sirip dengan Proteksi BjTS 550",
    "unit": "Kg",
    "price": 14773.05,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 824
  },
  {
    "code": "M57d",
    "name": "Baja Tulangan Sirip BjTS 690",
    "unit": "Kg",
    "price": 10804.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 825
  },
  {
    "code": "M57d",
    "name": "Baja Tulangan Sirip dengan Proteksi BjTS 690",
    "unit": "Kg",
    "price": 14585.4,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 826
  },
  {
    "code": "M580",
    "name": "Rumput Gajah Mini (Axonopus Compres",
    "unit": "Btg",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 827
  },
  {
    "code": "M581",
    "name": "Ruelia Bunga Ungu (Ruellia britthniana)",
    "unit": "Btg",
    "price": 5000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 828
  },
  {
    "code": "M582",
    "name": "Sinyo Nakal (Duranta repens)",
    "unit": "Btg",
    "price": 10000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 829
  },
  {
    "code": "M583",
    "name": "Soga (Peltophorum pterocarpum)",
    "unit": "Btg",
    "price": 75000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 830
  },
  {
    "code": "M584",
    "name": "Tabebuya (Tabebuia chrystoricha)",
    "unit": "Btg",
    "price": 150000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 831
  },
  {
    "code": "M585",
    "name": "Pracetak Gelagar Beton Pratekan fc’ 65 MPa, Tipe T bentang nominal 50-60 m",
    "unit": "buah",
    "price": 225000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 832
  },
  {
    "code": "M586",
    "name": "Unit Pracetak Gelagar Beton Pratekan fc’ 70 MPa, Tipe Bulb Tee bentang nominal 55 m",
    "unit": "buah",
    "price": 175000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 833
  },
  {
    "code": "M587",
    "name": "Unit Pracetak Gelagar Beton Pratekan fc’ 70 MPa, Tipe Box bentang nominal 50 m",
    "unit": "buah",
    "price": 169000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 834
  },
  {
    "code": "M588",
    "name": "Unit Pracetak Gelagar Beton Pratekan fc’ 70 MPa, Tipe Channel bentang nominal 50 m",
    "unit": "buah",
    "price": 135000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 835
  },
  {
    "code": "M589",
    "name": "Pracetak Pratekan Tipe Double T untuk lantai jembatan rangka baja, mutu fc’ 45 MPa, bentang nominal 5 m",
    "unit": "buah",
    "price": 172000000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 836
  },
  {
    "code": "M58a",
    "name": "Geotextile Woven Kelas 4A",
    "unit": "M2",
    "price": 53200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 837
  },
  {
    "code": "M58b",
    "name": "Geotextile Woven Kelas 1",
    "unit": "M2",
    "price": 48978.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 838
  },
  {
    "code": "M58c",
    "name": "Geotextile Woven Kelas 2",
    "unit": "M2",
    "price": 46717.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 839
  },
  {
    "code": "M58d",
    "name": "Geotextile Non Woven Kelas 3",
    "unit": "M2",
    "price": 35867.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 840
  },
  {
    "code": "M58d",
    "name": "Geotextile Woven Kelas 3",
    "unit": "M2",
    "price": 35867.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 841
  },
  {
    "code": "M59",
    "name": "Beton 30 MPa",
    "unit": "M3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 842
  },
  {
    "code": "M59",
    "name": "Beton Fc 30 Mpa",
    "unit": "M3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 843
  },
  {
    "code": "M59",
    "name": "Beton Shotcrete 30 MPa",
    "unit": "M3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 844
  },
  {
    "code": "M59",
    "name": "Beton Shotcrete 30 Mpa",
    "unit": "M3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 845
  },
  {
    "code": "M59",
    "name": "Beton f`c 30 MPa",
    "unit": "M3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 846
  },
  {
    "code": "M59",
    "name": "Beton f`c 30 Mpa",
    "unit": "M3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 847
  },
  {
    "code": "M59",
    "name": "Beton fc' 30 MPa",
    "unit": "m3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 848
  },
  {
    "code": "M59",
    "name": "Beton struktur fc’30 MPa",
    "unit": "M3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 849
  },
  {
    "code": "M592",
    "name": "Besi UNP 80.45.5",
    "unit": "Bh",
    "price": 287500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 850
  },
  {
    "code": "M60",
    "name": "Beton Fc' 15 MPa",
    "unit": "M3",
    "price": 1185070.07,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 851
  },
  {
    "code": "M60",
    "name": "Beton f`c 15 MPa",
    "unit": "M3",
    "price": 1185070.07,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 852
  },
  {
    "code": "M60",
    "name": "Beton f`c 15 Mpa",
    "unit": "M3",
    "price": 1185070.07,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 853
  },
  {
    "code": "M60",
    "name": "Beton fc' 15 MPa",
    "unit": "M3",
    "price": 1185070.07,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 854
  },
  {
    "code": "M60",
    "name": "Tiang Beton Precast fc 15 Mpa",
    "unit": "M3",
    "price": 1185070.07,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 855
  },
  {
    "code": "M600",
    "name": "Beton Instant 40 Mpa",
    "unit": "M3",
    "price": 23549760.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 856
  },
  {
    "code": "M601",
    "name": "Epoxy FRP daerah kering",
    "unit": "kg",
    "price": 402500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 857
  },
  {
    "code": "M602",
    "name": "Epoxy FRP daerah basah",
    "unit": "kg",
    "price": 575000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 858
  },
  {
    "code": "M604",
    "name": "Aspal Modifikasi PG 64E",
    "unit": "Kg",
    "price": 11800.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 859
  },
  {
    "code": "M606",
    "name": "Bond Breaker Board",
    "unit": "M2",
    "price": 30000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 860
  },
  {
    "code": "M61",
    "name": "Cerucuk dolken diameter 8 - 10 cm",
    "unit": "M'",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 861
  },
  {
    "code": "M62",
    "name": "Benzoat Peroxide (BPO)",
    "unit": "Kg",
    "price": 2806000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 862
  },
  {
    "code": "M64",
    "name": "Paku Jalan Memantul Bulat",
    "unit": "Buah",
    "price": 75000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 863
  },
  {
    "code": "M66",
    "name": "Anti Stripping Agent",
    "unit": "Kg",
    "price": 80000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 864
  },
  {
    "code": "M66",
    "name": "Bahan anti pengelupasa",
    "unit": "Kg",
    "price": 80000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 865
  },
  {
    "code": "M72",
    "name": "Beton Fc'35 Mpa",
    "unit": "M3",
    "price": 1396326.51,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 866
  },
  {
    "code": "M72",
    "name": "Beton Pratekan Pracetak fc'35 MPa",
    "unit": "M'",
    "price": 704000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 867
  },
  {
    "code": "M73",
    "name": "Multiplek",
    "unit": "Lbr",
    "price": 150850.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 868
  },
  {
    "code": "M73a",
    "name": "Multipleks Phenolic 12 mm",
    "unit": "Lbr",
    "price": 210000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 869
  },
  {
    "code": "M74c",
    "name": "400 x 45 mm",
    "unit": "Buah",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 870
  },
  {
    "code": "M74c",
    "name": "Elastomer karet sintetis jenis 3 ukuran x 400 x 45 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 871
  },
  {
    "code": "M74d",
    "name": "Elastomer karet sintetis ukuran 150 x x 50 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 872
  },
  {
    "code": "M74e",
    "name": "Elastomer karet sintetis ukuran 300 x x 40 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 873
  },
  {
    "code": "M74f",
    "name": "Elastomer karet sintetis ukuran 300 x x 100 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 874
  },
  {
    "code": "M74g",
    "name": "Elastomer karet sintetis ukuran 380 x x 102 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 875
  },
  {
    "code": "M74h",
    "name": "Elastomer karet sintetis ukuran 380 x x 45 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 876
  },
  {
    "code": "M74i",
    "name": "Elastomer karet sintetis ukuran 400 x x 50 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 877
  },
  {
    "code": "M74j",
    "name": "Elastomer karet sintetis ukuran 400 x x 52 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 878
  },
  {
    "code": "M74l",
    "name": "Elastomer karet sintetis ukuran 500 x x 100 mm",
    "unit": "bh",
    "price": 838000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 879
  },
  {
    "code": "M77",
    "name": "Agregat 14 - 20 mm",
    "unit": "Kg",
    "price": 3750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 880
  },
  {
    "code": "M78",
    "name": "Paving Blok",
    "unit": "M2",
    "price": 132000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 881
  },
  {
    "code": "M81a",
    "name": "Rubber strip bearing lebar 250 mm, tebal , 20 mm",
    "unit": "M'",
    "price": 255000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 882
  },
  {
    "code": "M81b",
    "name": "Rubber strip bearing lebar 250 mm, tebal , 25 mm",
    "unit": "M'",
    "price": 281000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 883
  },
  {
    "code": "M81c",
    "name": "mm",
    "unit": "Buah",
    "price": 2300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 884
  },
  {
    "code": "M91",
    "name": "Agr 0 - 5",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 885
  },
  {
    "code": "M91",
    "name": "Agr 0-5",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 886
  },
  {
    "code": "M91",
    "name": "Agr Pch Mesin 0 - 5",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 887
  },
  {
    "code": "M91",
    "name": "Agregate Halus",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 888
  },
  {
    "code": "M91",
    "name": "Agregate halus",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 889
  },
  {
    "code": "M91",
    "name": "Agregate uk.0-5",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 890
  },
  {
    "code": "M92",
    "name": "Agr 5-10",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 891
  },
  {
    "code": "M92",
    "name": "Agr 5-10 & 10-15",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 892
  },
  {
    "code": "M92",
    "name": "Agr 5-8 & 8-11",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 893
  },
  {
    "code": "M92",
    "name": "Agr Pch Mesin 5-10",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 894
  },
  {
    "code": "M92",
    "name": "Agr Pch Mesin 5-10, 10-15 & 15-20",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 895
  },
  {
    "code": "M92",
    "name": "Agregate Kasar",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 896
  },
  {
    "code": "M92",
    "name": "Agregate kasar",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 897
  },
  {
    "code": "M92",
    "name": "Agregate uk.5-10",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 898
  },
  {
    "code": "M92",
    "name": "Agregate uk.5-10 & 10-15",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 899
  },
  {
    "code": "M93",
    "name": "Agr 20-30",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 900
  },
  {
    "code": "M93",
    "name": "Agregat Pengunci",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 901
  },
  {
    "code": "M93",
    "name": "Agregat Penutup",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 902
  },
  {
    "code": "M93",
    "name": "Agregat Pokok",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 903
  },
  {
    "code": "M94",
    "name": "Joint Sealant",
    "unit": "kg",
    "price": 34100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 904
  },
  {
    "code": "M94",
    "name": "Joint Sealent",
    "unit": "Kg",
    "price": 34100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 905
  },
  {
    "code": "M94",
    "name": "Sealant.",
    "unit": "Kg",
    "price": 34100.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 906
  },
  {
    "code": "M95",
    "name": "Cat Anti Karat",
    "unit": "Kg",
    "price": 35750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 907
  },
  {
    "code": "M95",
    "name": "Cat Besi",
    "unit": "kg",
    "price": 35750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 908
  },
  {
    "code": "M95a",
    "name": "Cat Waterproof Sub Total Material 210.276,02",
    "unit": "Kg",
    "price": 37000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 909
  },
  {
    "code": "M97",
    "name": "Polyethene 125 mikron",
    "unit": "M2",
    "price": 63200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 910
  },
  {
    "code": "M97",
    "name": "Polytene 125 mikron",
    "unit": "M2",
    "price": 63200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 911
  },
  {
    "code": "M98",
    "name": "Curing Compound",
    "unit": "Ltr",
    "price": 38500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 912
  },
  {
    "code": "M98",
    "name": "Curing compound",
    "unit": "Ltr",
    "price": 38500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 913
  },
  {
    "code": "",
    "name": "Acuan / bekisting (M130)",
    "unit": "m2",
    "price": 170000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 914
  },
  {
    "code": "",
    "name": "Agg Pengunci (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 915
  },
  {
    "code": "",
    "name": "Agg Penutup (M92)",
    "unit": "Kg",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 916
  },
  {
    "code": "",
    "name": "Agg Pokok (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 917
  },
  {
    "code": "",
    "name": "Aggr 0 - 5 (M91)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 918
  },
  {
    "code": "",
    "name": "Agr 0 - 5 (M91)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 919
  },
  {
    "code": "",
    "name": "Agr 0-5 (M91)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 920
  },
  {
    "code": "",
    "name": "Agr 5-10 & 10-15 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 921
  },
  {
    "code": "",
    "name": "Agr 5-10 & 10-20 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 922
  },
  {
    "code": "",
    "name": "Agr 5-8 & 11-16 & 16-22 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 923
  },
  {
    "code": "",
    "name": "Agr 5-8 & 11-16 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 924
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 0 - 5 (M91)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 925
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 0 - 5 (M91) 0,00 0,00",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 926
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 20-30 (M93)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 927
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 5-10 & (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 928
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 5-10 & 10-15 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 929
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 5-8 & 8-11 & 11-15 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 930
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 5-8 & 8-11 & 11-16 & 16 - 22 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 931
  },
  {
    "code": "",
    "name": "Agr Pch Mesin 5-8 & 8-11 & 11-16 & 16-22 (M92)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 932
  },
  {
    "code": "",
    "name": "Agregat 14 - 20 mm M77 Kg/m'",
    "unit": "",
    "price": 3750.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 933
  },
  {
    "code": "",
    "name": "Agregate(0/5) M91 M³",
    "unit": "",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 934
  },
  {
    "code": "",
    "name": "Asbuton 50/30 (M163)",
    "unit": "Kg",
    "price": 11000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 935
  },
  {
    "code": "",
    "name": "Aspal Emulsi CRS (M31b)",
    "unit": "liter",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 936
  },
  {
    "code": "",
    "name": "Aspal Emulsi CRS-1 (M31b) atau RS-1",
    "unit": "Liter",
    "price": 12000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 937
  },
  {
    "code": "",
    "name": "Aspal Emulsi CSS-1 (M31a) atau SS-1",
    "unit": "Liter",
    "price": 10500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 938
  },
  {
    "code": "",
    "name": "Aspal Emulsi Mod Polime (M31d)",
    "unit": "Liter",
    "price": 12300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 939
  },
  {
    "code": "",
    "name": "Aspal Pen 60/70 (M10)",
    "unit": "Kg",
    "price": 7032.26,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 940
  },
  {
    "code": "",
    "name": "Bahan lainnya",
    "unit": "Ls",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 941
  },
  {
    "code": "",
    "name": "Bahan turap kayu dengan pengawetan M192 M3/M2",
    "unit": "",
    "price": 1300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 942
  },
  {
    "code": "",
    "name": "Bahan turap kayu tanpa pengawetan M192 M3/M2",
    "unit": "",
    "price": 1300000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 943
  },
  {
    "code": "",
    "name": "Baut dan Mur (M223)",
    "unit": "buah",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 944
  },
  {
    "code": "",
    "name": "Baut mutu tinggi A325 Tipe 1 diameter M210A M25",
    "unit": "buah",
    "price": 33000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 945
  },
  {
    "code": "",
    "name": "Bekisting/Fix Form Rigid Pavement",
    "unit": "bh/M'",
    "price": 153060.88,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 946
  },
  {
    "code": "",
    "name": "Beton fc' 30 MPa (M59)",
    "unit": "m3",
    "price": 1382749.35,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 947
  },
  {
    "code": "",
    "name": "Bridging Plate M133 Kg/M'",
    "unit": "",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 948
  },
  {
    "code": "",
    "name": "Bridging Plate M133 Kg/m'",
    "unit": "",
    "price": 17000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 949
  },
  {
    "code": "",
    "name": "CPHMA Curah (M162b)",
    "unit": "M3",
    "price": 1025000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 950
  },
  {
    "code": "",
    "name": "Cetakan Kereb A1nh",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 951
  },
  {
    "code": "",
    "name": "Cetakan Kereb A2nh",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 952
  },
  {
    "code": "",
    "name": "Cetakan Kereb B1nh",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 953
  },
  {
    "code": "",
    "name": "Cetakan Kereb B2nh",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 954
  },
  {
    "code": "",
    "name": "Cetakan Kereb C1nh",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 955
  },
  {
    "code": "",
    "name": "Cetakan Kereb C2nh",
    "unit": "buah",
    "price": 750000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 956
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong beton diameter dalam 20 cm",
    "unit": "bh/M'",
    "price": 1495.91,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 957
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong beton diameter dalam 30 cm",
    "unit": "bh/M'",
    "price": 544.13,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 958
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong beton diameter dalam 40 cm",
    "unit": "bh/M'",
    "price": 33177.41,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 959
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 100 x 100",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 960
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 120 x 120",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 961
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 140 x 140",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 962
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 150 x 150",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 963
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 160 x 160",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 964
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 180 x 180",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 965
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 200 x 200",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 966
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 40 x 40",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 967
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 50 x 50",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 968
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 60 x 60",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 969
  },
  {
    "code": "",
    "name": "Cetakan gorong-gorong kotak ukuran 80 x 80",
    "unit": "bh/M'",
    "price": 58661.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 970
  },
  {
    "code": "",
    "name": "Chipping (M41)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 971
  },
  {
    "code": "",
    "name": "Chipping Lapis Kedua (M41)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 972
  },
  {
    "code": "",
    "name": "Chipping Lapis Pertama (M41)",
    "unit": "M3",
    "price": 315168.58,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 973
  },
  {
    "code": "",
    "name": "Debu Marmer (M05)",
    "unit": "Kg",
    "price": 700.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 974
  },
  {
    "code": "",
    "name": "Diafragma beton pratekan fc' 45 MPa",
    "unit": "buah",
    "price": 684902.57,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 975
  },
  {
    "code": "",
    "name": "Earth Presure Cell Geokon 4800 - 700 Kpa (Panjang Kabel = 25m)",
    "unit": "Titik",
    "price": 682000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 976
  },
  {
    "code": "",
    "name": "Elastomer karet sintetis ukuran 200 x 300 x 40 mm",
    "unit": "Buah",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 977
  },
  {
    "code": "",
    "name": "Elastomer karet sintetis ukuran 400 x 250 x 52 mm",
    "unit": "Buah",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 978
  },
  {
    "code": "",
    "name": "Elastomer karet sintetis ukuran 400 x 350 x 52 mm",
    "unit": "Buah",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 979
  },
  {
    "code": "",
    "name": "Elastomer karet sintetis ukuran 400 x 400 x 60 mm",
    "unit": "Buah",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 980
  },
  {
    "code": "",
    "name": "Elastomer karet sintetis ukuran 450 x 400 x 73 mm",
    "unit": "Buah",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 981
  },
  {
    "code": "",
    "name": "Elastomer karet ukuran 300 x 200 x 50 mm",
    "unit": "Buah",
    "price": 0.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 982
  },
  {
    "code": "",
    "name": "Formwork Plate M195 Set/M2",
    "unit": "",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 983
  },
  {
    "code": "",
    "name": "Graut berbahan dasar M270 Kilogram Cellular Plastic",
    "unit": "",
    "price": 350000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 984
  },
  {
    "code": "",
    "name": "Inclinometer ABS OD 70 mm",
    "unit": "Buah",
    "price": 729508.2,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 985
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 3 x 10 mm2 M396ag",
    "unit": "M'",
    "price": 68000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 986
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 4C - 120 mm2 M396ad",
    "unit": "M'",
    "price": 1135500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 987
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 4C - 150 mm2 M396ae",
    "unit": "M'",
    "price": 1391000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 988
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 4C - 16 mm2 M396ae",
    "unit": "M'",
    "price": 72623.2,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 989
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 4C - 70 mm2 M396aa",
    "unit": "M'",
    "price": 533500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 990
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 4C - 90 mm2 M396ab",
    "unit": "M'",
    "price": 800500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 991
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 4C - 95 mm2 M396ac",
    "unit": "M'",
    "price": 907500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 992
  },
  {
    "code": "",
    "name": "Kabel NYFGBY 7C - 2.5 mm2 M396af",
    "unit": "M'",
    "price": 70550.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 993
  },
  {
    "code": "",
    "name": "Kabel NYY 4C - 10 mm2 M396ah",
    "unit": "M'",
    "price": 94000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 994
  },
  {
    "code": "",
    "name": "Kabel NYY 4C - 16 mm2 M396ai",
    "unit": "M'",
    "price": 156000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 995
  },
  {
    "code": "",
    "name": "Kabel NYY 4C - 25 mm2 M396aj",
    "unit": "M'",
    "price": 239500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 996
  },
  {
    "code": "",
    "name": "Kabel NYY 4C - 35 mm2 M396ak",
    "unit": "M'",
    "price": 326500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 997
  },
  {
    "code": "",
    "name": "Kawat Harmonika 50x50 2 m M393 M'/Buah",
    "unit": "",
    "price": 89000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 998
  },
  {
    "code": "",
    "name": "Kawat Las M51 Dos",
    "unit": "",
    "price": 70000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 999
  },
  {
    "code": "",
    "name": "Kolom Beton Pracetak 160 x 200 x 2.25 K250 M383 Bauh",
    "unit": "",
    "price": 250000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1000
  },
  {
    "code": "",
    "name": "Kotak tanaman Silinder Beton EI-233a Pracetak d40",
    "unit": "buah",
    "price": 272992.97,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1001
  },
  {
    "code": "",
    "name": "Lapis Perekat (EI612a)",
    "unit": "liter",
    "price": 22050.83,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1002
  },
  {
    "code": "",
    "name": "Lapis Resap Pengikat EI-611",
    "unit": "liter",
    "price": 20119.41,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1003
  },
  {
    "code": "",
    "name": "Magnetic Extensometer",
    "unit": "Buah",
    "price": 3725000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1004
  },
  {
    "code": "",
    "name": "Multiflex Penolic 12 mm M73A",
    "unit": "Lbr",
    "price": 210000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1005
  },
  {
    "code": "",
    "name": "Mur Baut M223 Buah/M'",
    "unit": "",
    "price": 13000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1006
  },
  {
    "code": "",
    "name": "Pasir Halus (M01c)",
    "unit": "M3",
    "price": 246300.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1007
  },
  {
    "code": "",
    "name": "Pekerjaan Pembongkaran EI7152a",
    "unit": "m3",
    "price": 158418.25,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1008
  },
  {
    "code": "",
    "name": "Pengelasan EI-861a",
    "unit": "m",
    "price": 100119.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1009
  },
  {
    "code": "",
    "name": "Pengelasan Pelat EI-861a",
    "unit": "m",
    "price": 100119.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1010
  },
  {
    "code": "",
    "name": "Pipa Akses PVC 2\"",
    "unit": "M",
    "price": 65000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1011
  },
  {
    "code": "",
    "name": "Pipa Besi Galvanized 3 inch M275d Buah/M'",
    "unit": "",
    "price": 104000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1012
  },
  {
    "code": "",
    "name": "Pipa Besi Galvanized 3 inch M275d M'/Buah",
    "unit": "",
    "price": 104000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1013
  },
  {
    "code": "",
    "name": "Pipa PVC AW Dia 150 mm M240a batang/m'",
    "unit": "",
    "price": 363000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1014
  },
  {
    "code": "",
    "name": "Pipa PVC AW Dia 200 mm M240b batang/m'",
    "unit": "",
    "price": 402000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1015
  },
  {
    "code": "",
    "name": "Pipa PVC AW Dia 250 mm M240c batang/m'",
    "unit": "",
    "price": 562075.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1016
  },
  {
    "code": "",
    "name": "Pipa PVC AW Dia 300 mm M240d batang/m'",
    "unit": "",
    "price": 805200.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1017
  },
  {
    "code": "",
    "name": "Pipa PVC dia 6 Inch M240a Btg/m",
    "unit": "",
    "price": 363000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1018
  },
  {
    "code": "",
    "name": "Pipa baja 150 mm M241 batang/m'",
    "unit": "",
    "price": 400000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1019
  },
  {
    "code": "",
    "name": "Pohon Besar",
    "unit": "Btg",
    "price": 600000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1020
  },
  {
    "code": "",
    "name": "Pohon Kecil",
    "unit": "Btg",
    "price": 400000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1021
  },
  {
    "code": "",
    "name": "Pondasi Pasangan Batu 2.2.(1)",
    "unit": "M3",
    "price": 909953.47,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1022
  },
  {
    "code": "",
    "name": "Rubber bitumen (25 x 7,5 x 100) cm3 M255a Kg/m'",
    "unit": "",
    "price": 45000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1023
  },
  {
    "code": "",
    "name": "Rumput M273 slip/m'",
    "unit": "",
    "price": 3500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1024
  },
  {
    "code": "",
    "name": "Sandaran Baja Pipa Galvanis 3\" (M24a)",
    "unit": "m",
    "price": 89166.67,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1025
  },
  {
    "code": "",
    "name": "Semen (M12)",
    "unit": "Kg",
    "price": 1600.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1026
  },
  {
    "code": "",
    "name": "Serat Selulosa (M158)",
    "unit": "Kg",
    "price": 22500.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1027
  },
  {
    "code": "",
    "name": "TCM M292 Ton/M3",
    "unit": "",
    "price": 1675000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1028
  },
  {
    "code": "",
    "name": "Termoplastik M178 Kg/m (sealant tuang panas)",
    "unit": "",
    "price": 28985.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1029
  },
  {
    "code": "",
    "name": "Termoseting M180 Kg/m (sealant tuang dingin)",
    "unit": "",
    "price": 65333.33,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1030
  },
  {
    "code": "",
    "name": "Tiang Sandaran Baja (M238)",
    "unit": "kg",
    "price": 15000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1031
  },
  {
    "code": "",
    "name": "Water Stand Pipe Ø 2\"",
    "unit": "Buah",
    "price": 240000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1032
  },
  {
    "code": "",
    "name": "Zeolit (M159)",
    "unit": "Kg",
    "price": 6000.0,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1033
  },
  {
    "code": "",
    "name": "basah/pasang surut 360 mikron EI-8772a",
    "unit": "M2",
    "price": 344333.01,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1034
  },
  {
    "code": "",
    "name": "beton diameter dalam 40 cm",
    "unit": "bh/M'",
    "price": 33177.41,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1035
  },
  {
    "code": "",
    "name": "beton diameter dalam 60 cm",
    "unit": "bh/M'",
    "price": 41395.54,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1036
  },
  {
    "code": "",
    "name": "diameter dalam 100 cm",
    "unit": "bh/M'",
    "price": 67036.06,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1037
  },
  {
    "code": "",
    "name": "diameter dalam 120 cm",
    "unit": "bh/M'",
    "price": 80319.71,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1038
  },
  {
    "code": "",
    "name": "diameter dalam 150 cm",
    "unit": "bh/M'",
    "price": 100399.64,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1039
  },
  {
    "code": "",
    "name": "diameter dalam 60 cm",
    "unit": "bh/M'",
    "price": 41395.54,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1040
  },
  {
    "code": "",
    "name": "diameter dalam 80 cm",
    "unit": "bh/M'",
    "price": 54123.13,
    "category": "material",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1041
  }
];

export const OFFICIAL_BM_2026_EQUIPMENT: BinaMargaPriceEntry[] = [
  {
    "code": "E01",
    "name": "AMP",
    "unit": "Jam",
    "price": 12101657.96,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1043
  },
  {
    "code": "E01",
    "name": "ASPHALT MIXING PLANT (AMP)",
    "unit": "Jam",
    "price": 12101657.96,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1044
  },
  {
    "code": "E01",
    "name": "Asphalt Mixing Plant (AMP)",
    "unit": "Jam",
    "price": 12101657.96,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1045
  },
  {
    "code": "E02",
    "name": "ASPHALT FINISHER",
    "unit": "Jam",
    "price": 334873.37,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1046
  },
  {
    "code": "E02",
    "name": "Asp. Finisher",
    "unit": "Jam",
    "price": 334873.37,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1047
  },
  {
    "code": "E02",
    "name": "Asphalt Finisher",
    "unit": "Jam",
    "price": 334873.37,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1048
  },
  {
    "code": "E03",
    "name": "Power Broom",
    "unit": "Jam",
    "price": 96601.02,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1049
  },
  {
    "code": "E04",
    "name": "Bull Dozer",
    "unit": "jam",
    "price": 926330.51,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1050
  },
  {
    "code": "E04",
    "name": "Bulldozer 100-150 HP",
    "unit": "jam",
    "price": 926330.51,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1051
  },
  {
    "code": "E05",
    "name": "AIR COMPRESSOR",
    "unit": "Jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1052
  },
  {
    "code": "E05",
    "name": "Air Compresor",
    "unit": "Jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1053
  },
  {
    "code": "E05",
    "name": "Air Compressor",
    "unit": "Jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1054
  },
  {
    "code": "E05",
    "name": "COMPRESSOR AHX-10, 10 HP",
    "unit": "Jam",
    "price": 215444.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1055
  },
  {
    "code": "E05",
    "name": "Compresor",
    "unit": "Jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1056
  },
  {
    "code": "E05",
    "name": "Compressor",
    "unit": "Jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1057
  },
  {
    "code": "E05",
    "name": "Compressor 4000-6500 L",
    "unit": "jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1058
  },
  {
    "code": "E05",
    "name": "Compressor AHX-10, 10 HP",
    "unit": "Jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1059
  },
  {
    "code": "E05",
    "name": "Compressor AHX-10, HP",
    "unit": "Jam",
    "price": 215444.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1060
  },
  {
    "code": "E05",
    "name": "Compressor, 5000 L/Mnt; 75",
    "unit": "jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1061
  },
  {
    "code": "E05",
    "name": "Compressor, 5000 L/Mnt; 75 HP",
    "unit": "jam",
    "price": 215443.91,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1062
  },
  {
    "code": "E06",
    "name": "CONCRETE MIXER",
    "unit": "jam",
    "price": 119474.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1063
  },
  {
    "code": "E06",
    "name": "Concret Mixer",
    "unit": "Jam",
    "price": 119474.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1064
  },
  {
    "code": "E06",
    "name": "Concrete Mixer",
    "unit": "jam",
    "price": 119474.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1065
  },
  {
    "code": "E06",
    "name": "Concrete Mixer 0.3-0.6 M",
    "unit": "jam",
    "price": 119474.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1066
  },
  {
    "code": "E06",
    "name": "Concrrete Mixer",
    "unit": "Jam",
    "price": 119474.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1067
  },
  {
    "code": "E07",
    "name": "CRANE ON TRACK 10-15 TO",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1068
  },
  {
    "code": "E07",
    "name": "CRANE ON TRACK 10-15 TON",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1069
  },
  {
    "code": "E07",
    "name": "Crabe 10-15 Ton",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1070
  },
  {
    "code": "E07",
    "name": "Crane 1",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1071
  },
  {
    "code": "E07",
    "name": "Crane 10-15 Ton",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1072
  },
  {
    "code": "E07",
    "name": "Crane 10-15 Ton; 138 HP",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1073
  },
  {
    "code": "E07",
    "name": "Crane 2",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1074
  },
  {
    "code": "E07",
    "name": "Crane On Track 10-15 Ton",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1075
  },
  {
    "code": "E07",
    "name": "Crane On Truck (10-15) Ton; 260 HP",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1076
  },
  {
    "code": "E07",
    "name": "Crane on Track",
    "unit": "Jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1077
  },
  {
    "code": "E07",
    "name": "Crane on Track 10-15 Ton",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1078
  },
  {
    "code": "E07",
    "name": "TRUCK CRANE 5 TON",
    "unit": "Jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1079
  },
  {
    "code": "E08",
    "name": "DUMP TRUCK 4 TON; 134 HP",
    "unit": "Jam",
    "price": 433363.61,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1080
  },
  {
    "code": "E08",
    "name": "DUMP TRUCK 4 TON; 134 HP Alat Bantu Ls 1,000 - -",
    "unit": "Jam",
    "price": 433363.61,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1081
  },
  {
    "code": "E08",
    "name": "Dump Truck",
    "unit": "jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1082
  },
  {
    "code": "E08",
    "name": "Dump Truck 3 - 4 m3",
    "unit": "jam",
    "price": 433363.61,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1083
  },
  {
    "code": "E08",
    "name": "Dump Truck 4 Ton",
    "unit": "Jam",
    "price": 433363.61,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1084
  },
  {
    "code": "E08",
    "name": "Dump Truck 4 Ton; Bak 3 - 4 m3",
    "unit": "Jam",
    "price": 433363.61,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1085
  },
  {
    "code": "E10",
    "name": "EXCAVATOR",
    "unit": "Jam",
    "price": 573770.23,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1086
  },
  {
    "code": "E10",
    "name": "EXCAVATOR 80-140 HP",
    "unit": "Jam",
    "price": 573770.23,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1087
  },
  {
    "code": "E10",
    "name": "Excavator",
    "unit": "Jam",
    "price": 573770.23,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1088
  },
  {
    "code": "E10",
    "name": "Excavator 0,8 M3; 170 HP",
    "unit": "jam",
    "price": 573770.23,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1089
  },
  {
    "code": "E10",
    "name": "Excavator 80-140 HP",
    "unit": "jam",
    "price": 573770.23,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1090
  },
  {
    "code": "E100",
    "name": "Truck Crane 5 Ton",
    "unit": "Jam",
    "price": 875594.34,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1091
  },
  {
    "code": "E100a",
    "name": "Truck Crane 22 Ton",
    "unit": "jam",
    "price": 1200792.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1092
  },
  {
    "code": "E101",
    "name": "Mandrel Crane Alat Pancang PVD",
    "unit": "Jam",
    "price": 1045151.6,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1093
  },
  {
    "code": "E102",
    "name": "Rammer 60 Kg - 100 Kg",
    "unit": "jam",
    "price": 62208.24,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1094
  },
  {
    "code": "E103",
    "name": "Soil Compactor",
    "unit": "jam",
    "price": 62190.53,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1095
  },
  {
    "code": "E104",
    "name": "Crawler Type Road Cutte",
    "unit": "jam",
    "price": 1655462.01,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1096
  },
  {
    "code": "E106",
    "name": "Winch 1.8 Ton",
    "unit": "jam",
    "price": 65985.94,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1097
  },
  {
    "code": "E107",
    "name": "Road Removal Marking Machine",
    "unit": "Jam",
    "price": 65626.96,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1098
  },
  {
    "code": "E10a",
    "name": "Mini Excavator",
    "unit": "jam",
    "price": 281237.82,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1099
  },
  {
    "code": "E11",
    "name": "FLAT BED TRUCK 4 TON",
    "unit": "jam",
    "price": 410265.86,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1100
  },
  {
    "code": "E11",
    "name": "Flat Bed Truck 3-4 Ton",
    "unit": "Jam",
    "price": 410265.86,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1101
  },
  {
    "code": "E11",
    "name": "Flat Bed Truck 4 Ton",
    "unit": "Jam",
    "price": 410265.86,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1102
  },
  {
    "code": "E11",
    "name": "Flat Bet Truck 4 Ton",
    "unit": "Jam",
    "price": 410265.86,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1103
  },
  {
    "code": "E11",
    "name": "Truk Bak Datar 3 - 4 m3",
    "unit": "jam",
    "price": 399455.28,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1104
  },
  {
    "code": "E111",
    "name": "Power Trowel Machine",
    "unit": "jam",
    "price": 120695.59,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1105
  },
  {
    "code": "E112",
    "name": "MESIN LAS SAW PASIR FLUX MZ-1",
    "unit": "jam",
    "price": 105105.01,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1106
  },
  {
    "code": "E113",
    "name": "Mesin Amplas kayu",
    "unit": "jam",
    "price": 37385.52,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1107
  },
  {
    "code": "E11a",
    "name": "FLAT BED TRUCK 10 TON",
    "unit": "Jam",
    "price": 730037.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1108
  },
  {
    "code": "E11a",
    "name": "Flat Bed Truck",
    "unit": "Jam",
    "price": 730037.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1109
  },
  {
    "code": "E11a",
    "name": "Flat Bed Truck 10 Ton",
    "unit": "jam",
    "price": 730037.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1110
  },
  {
    "code": "E12",
    "name": "GENERATOR SET",
    "unit": "jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1111
  },
  {
    "code": "E12",
    "name": "GENERATOR SET ( GENSET )",
    "unit": "Jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1112
  },
  {
    "code": "E12",
    "name": "GENERATOR SET 2000 Watt",
    "unit": "Jam",
    "price": 497971.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1113
  },
  {
    "code": "E12",
    "name": "GENERATOR SET; 134 KVA; 180 H",
    "unit": "LS",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1114
  },
  {
    "code": "E12",
    "name": "GENERATOR SET; 134 KVA; 180 HP",
    "unit": "jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1115
  },
  {
    "code": "E12",
    "name": "GENERATORSET ( GENSET )",
    "unit": "Jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1116
  },
  {
    "code": "E12",
    "name": "Generator Set",
    "unit": "Jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1117
  },
  {
    "code": "E12",
    "name": "Generator Set ; 134 KVA; 180",
    "unit": "jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1118
  },
  {
    "code": "E12",
    "name": "Generator Set ; 134 KVA; 180 HP",
    "unit": "jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1119
  },
  {
    "code": "E12",
    "name": "Generator Set; 134 KVA: 180 Hp",
    "unit": "jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1120
  },
  {
    "code": "E12",
    "name": "Generator Set; 134 KVA; 180 HP",
    "unit": "jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1121
  },
  {
    "code": "E12",
    "name": "Genset",
    "unit": "Jam",
    "price": 497970.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1122
  },
  {
    "code": "E12a",
    "name": "Generator Set 45 Kva",
    "unit": "jam",
    "price": 99896.62,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1123
  },
  {
    "code": "E13",
    "name": "MOTOR GRADER",
    "unit": "Jam",
    "price": 597583.41,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1124
  },
  {
    "code": "E13",
    "name": "Motor Grader",
    "unit": "Jam",
    "price": 597583.41,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1125
  },
  {
    "code": "E13",
    "name": "Motor Grader Min 100 PK",
    "unit": "jam",
    "price": 597583.41,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1126
  },
  {
    "code": "E14",
    "name": "Track Loader",
    "unit": "jam",
    "price": 423486.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1127
  },
  {
    "code": "E14",
    "name": "Track Loader75-100 HP",
    "unit": "jam",
    "price": 423486.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1128
  },
  {
    "code": "E15",
    "name": "Wheel Loader",
    "unit": "Jam",
    "price": 591374.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1129
  },
  {
    "code": "E15",
    "name": "Whell Loader",
    "unit": "Jam",
    "price": 591374.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1130
  },
  {
    "code": "E15",
    "name": "Whell Loader 1.0-1.6 M3",
    "unit": "jam",
    "price": 591374.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1131
  },
  {
    "code": "E16a",
    "name": "Sheepfoot Roller",
    "unit": "Jam",
    "price": 448253.86,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1132
  },
  {
    "code": "E17",
    "name": "TANDEM ROLLER",
    "unit": "Jam",
    "price": 494721.02,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1133
  },
  {
    "code": "E17",
    "name": "Tandem Roller",
    "unit": "Jam",
    "price": 494721.02,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1134
  },
  {
    "code": "E17",
    "name": "Tandem Roller 6-8 Ton",
    "unit": "jam",
    "price": 494721.02,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1135
  },
  {
    "code": "E17",
    "name": "Tandem roller",
    "unit": "Jam",
    "price": 494721.02,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1136
  },
  {
    "code": "E17a",
    "name": "TANDEM ROLLER (8 - 10 TON)",
    "unit": "Jam",
    "price": 574449.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1137
  },
  {
    "code": "E17a",
    "name": "TANDEM ROLLER (8-10 TON)",
    "unit": "Jam",
    "price": 574449.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1138
  },
  {
    "code": "E17a",
    "name": "TANDEM ROLLER (8-10 Ton)",
    "unit": "Jam",
    "price": 574449.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1139
  },
  {
    "code": "E17a",
    "name": "Tandem Roller (8-10 Ton)",
    "unit": "Jam",
    "price": 574449.74,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1140
  },
  {
    "code": "E17b",
    "name": "TANDEM ROLLER (8-10 TON) WITC IC",
    "unit": "Jam",
    "price": 663822.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1141
  },
  {
    "code": "E17b",
    "name": "TANDEM ROLLER (8-10 TON) WITH IC",
    "unit": "Jam",
    "price": 663822.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1142
  },
  {
    "code": "E17b",
    "name": "TANDEM ROLLER (8-10 Ton) WITH IC",
    "unit": "Jam",
    "price": 663822.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1143
  },
  {
    "code": "E17b",
    "name": "TANDEM ROLLER WITH IC",
    "unit": "Jam",
    "price": 663822.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1144
  },
  {
    "code": "E17b",
    "name": "Tandem Roller With IC",
    "unit": "Jam",
    "price": 663822.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1145
  },
  {
    "code": "E18",
    "name": "P. Tyre Roller",
    "unit": "Jam",
    "price": 635885.11,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1146
  },
  {
    "code": "E18",
    "name": "PNEUMATIC TIRE ROLLER",
    "unit": "Jam",
    "price": 635885.11,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1147
  },
  {
    "code": "E18",
    "name": "Pneumatic Tire Roller",
    "unit": "Jam",
    "price": 635885.11,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1148
  },
  {
    "code": "E18",
    "name": "Tire Roller 8-10 Ton",
    "unit": "jam",
    "price": 635885.11,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1149
  },
  {
    "code": "E18a",
    "name": "P. Tyre Roller With IC",
    "unit": "Jam",
    "price": 655117.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1150
  },
  {
    "code": "E18a",
    "name": "PNEUMATIC TIRE ROLLER WITH IC",
    "unit": "Jam",
    "price": 655117.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1151
  },
  {
    "code": "E18a",
    "name": "Pneumatic Tire Roller With IC",
    "unit": "Jam",
    "price": 655117.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1152
  },
  {
    "code": "E19",
    "name": "Vibrator Roller",
    "unit": "Jam",
    "price": 371707.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1153
  },
  {
    "code": "E19",
    "name": "Vibratory Roller",
    "unit": "Jam",
    "price": 371707.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1154
  },
  {
    "code": "E19",
    "name": "Vibratory Roller 5-8 Ton",
    "unit": "jam",
    "price": 371707.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1155
  },
  {
    "code": "E19a",
    "name": "Baby Vibratory Roller",
    "unit": "Jam",
    "price": 121901.6,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1156
  },
  {
    "code": "E19b",
    "name": "Vibratory Roller 25 T",
    "unit": "jam",
    "price": 834185.79,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1157
  },
  {
    "code": "E19b",
    "name": "Vibratory Roller 25 T dng IC",
    "unit": "jam",
    "price": 834185.79,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1158
  },
  {
    "code": "E19b",
    "name": "Vibratory Roller 25T With IC",
    "unit": "jam",
    "price": 834185.79,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1159
  },
  {
    "code": "E19c",
    "name": "Vibratory Roller With IC",
    "unit": "jam",
    "price": 515343.62,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1160
  },
  {
    "code": "E19c",
    "name": "Vibratory Roller with IC",
    "unit": "jam",
    "price": 515343.62,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1161
  },
  {
    "code": "E20",
    "name": "CONCRETE VIBRATOR",
    "unit": "Jam",
    "price": 77078.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1162
  },
  {
    "code": "E20",
    "name": "CONCRETE VIBRATOR; GX 160; 5,5 HP",
    "unit": "Jam",
    "price": 77078.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1163
  },
  {
    "code": "E20",
    "name": "Concrete Vibrator",
    "unit": "Jam",
    "price": 77078.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1164
  },
  {
    "code": "E20",
    "name": "Concrete Vibrator (for manual)",
    "unit": "jam",
    "price": 77078.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1165
  },
  {
    "code": "E20",
    "name": "Concrete Vibrator Alat Bantu Ls 1,000 - -",
    "unit": "Jam",
    "price": 77078.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1166
  },
  {
    "code": "E22",
    "name": "WATER PUMP 70 - 100 mm",
    "unit": "Jam",
    "price": 76546.9,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1167
  },
  {
    "code": "E22",
    "name": "WATER PUMP 70-100 mm",
    "unit": "jam",
    "price": 76546.9,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1168
  },
  {
    "code": "E22",
    "name": "Water Pump 70-100 mm",
    "unit": "jam",
    "price": 76546.9,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1169
  },
  {
    "code": "E23",
    "name": "WATER TANK TRUCK",
    "unit": "Jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1170
  },
  {
    "code": "E23",
    "name": "WATER TANKER 3000 - 4500 L",
    "unit": "jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1171
  },
  {
    "code": "E23",
    "name": "WATERTANK TRUCK",
    "unit": "Jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1172
  },
  {
    "code": "E23",
    "name": "WATERTANK TRUCK 0,00",
    "unit": "Jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1173
  },
  {
    "code": "E23",
    "name": "Water Tank Truck",
    "unit": "jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1174
  },
  {
    "code": "E23",
    "name": "Water Tank Truck SKYLIFT CRANE TRUCK; 16",
    "unit": "jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1175
  },
  {
    "code": "E23",
    "name": "Water Tank Truck SKYLIFT CRANE TRUCK; 16 m,",
    "unit": "jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1176
  },
  {
    "code": "E23",
    "name": "Water Tank Truk",
    "unit": "jam",
    "price": 273774.34,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1177
  },
  {
    "code": "E23",
    "name": "Water Tank truck",
    "unit": "jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1178
  },
  {
    "code": "E23",
    "name": "Water TankTruck",
    "unit": "jam",
    "price": 500906.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1179
  },
  {
    "code": "E23",
    "name": "Water Tanker",
    "unit": "M3",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1180
  },
  {
    "code": "E23",
    "name": "Water Tanker 3000-4500",
    "unit": "jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1181
  },
  {
    "code": "E23",
    "name": "Water tank truck",
    "unit": "Jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1182
  },
  {
    "code": "E23",
    "name": "Watertank Truck",
    "unit": "Jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1183
  },
  {
    "code": "E23",
    "name": "Watertank truck",
    "unit": "Jam",
    "price": 500906.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1184
  },
  {
    "code": "E25",
    "name": "Stamper",
    "unit": "jam",
    "price": 103174.22,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1185
  },
  {
    "code": "E25",
    "name": "TAMPER",
    "unit": "Jam",
    "price": 103174.22,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1186
  },
  {
    "code": "E25",
    "name": "Tamper",
    "unit": "Jam",
    "price": 103174.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1187
  },
  {
    "code": "E26",
    "name": "JACK HAMMER; TEX-21 S; permukaan 1 m2/5mnt",
    "unit": "Jam",
    "price": 70534.42,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1188
  },
  {
    "code": "E26",
    "name": "Jack Hammer",
    "unit": "Jam",
    "price": 70534.42,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1189
  },
  {
    "code": "E26",
    "name": "Jack Hammer; TEX-21 S; permukaan 1 m2/5mnt",
    "unit": "Jam",
    "price": 70534.42,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1190
  },
  {
    "code": "E27",
    "name": "Pulvi mixer",
    "unit": "Jam",
    "price": 925645.66,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1191
  },
  {
    "code": "E27",
    "name": "Self Propelled Mixer",
    "unit": "jam",
    "price": 925645.66,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1192
  },
  {
    "code": "E28",
    "name": "Concrete Pump",
    "unit": "jam",
    "price": 571805.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1193
  },
  {
    "code": "E28a",
    "name": "Concrete Pump Truck 55 - 60 M3/Jam",
    "unit": "jam",
    "price": 370592.32,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1194
  },
  {
    "code": "E29",
    "name": "Semi Trailer 20 Ton, 245 HP",
    "unit": "jam",
    "price": 797200.4,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1195
  },
  {
    "code": "E29a",
    "name": "SEMI TRAILER 30 TON; 245 HP",
    "unit": "jam",
    "price": 774606.87,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1196
  },
  {
    "code": "E29a",
    "name": "Semi Trailer 30 Ton",
    "unit": "jam",
    "price": 774606.87,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1197
  },
  {
    "code": "E29a",
    "name": "Semi Trailer 30 Ton, 245 HP",
    "unit": "jam",
    "price": 774606.87,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1198
  },
  {
    "code": "E30",
    "name": "PILE DRIVER HAMMER (3,5-5,0) TON; 300 HP",
    "unit": "jam",
    "price": 83740.01,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1199
  },
  {
    "code": "E30",
    "name": "Pompa Aliva/Shotcrete Machine",
    "unit": "jam",
    "price": 83740.01,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1200
  },
  {
    "code": "E31",
    "name": "Crane 35 Ton; 125 HP",
    "unit": "jam",
    "price": 1413964.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1201
  },
  {
    "code": "E31",
    "name": "Crane On Track 35 Ton",
    "unit": "jam",
    "price": 1413964.19,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1202
  },
  {
    "code": "E32",
    "name": "WELDING SET",
    "unit": "jam",
    "price": 87120.34,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1203
  },
  {
    "code": "E32",
    "name": "WELDING SET; D 5400 Watt; 7,16 HP",
    "unit": "Jam",
    "price": 87120.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1204
  },
  {
    "code": "E32",
    "name": "Welding Set",
    "unit": "jam",
    "price": 87120.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1205
  },
  {
    "code": "E32",
    "name": "Welding set",
    "unit": "jam",
    "price": 87120.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1206
  },
  {
    "code": "E33",
    "name": "BORE PILE MACHINE DIAMETER MAKS 2 M 150 HP",
    "unit": "jam",
    "price": 734693.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1207
  },
  {
    "code": "E33",
    "name": "Bore Pile Machine",
    "unit": "jam",
    "price": 734693.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1208
  },
  {
    "code": "E33",
    "name": "Bore Pile Machine, Diameter Maks 2m; HP",
    "unit": "jam",
    "price": 734693.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1209
  },
  {
    "code": "E35",
    "name": "DUMP TRUCK 10 Ton",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1210
  },
  {
    "code": "E35",
    "name": "DUMP TRUCK TRONTON 10 TON",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1211
  },
  {
    "code": "E35",
    "name": "DUMP TRUCK TRONTON 10 TON; 217 HP",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1212
  },
  {
    "code": "E35",
    "name": "Dump Truck !0 Ton",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1213
  },
  {
    "code": "E35",
    "name": "Dump Truck 10 Ton",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1214
  },
  {
    "code": "E35",
    "name": "Dump Truck 10 Ton (1)",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1215
  },
  {
    "code": "E35",
    "name": "Dump Truck 10 Ton (2)",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1216
  },
  {
    "code": "E35",
    "name": "Dump Truck 10 Ton (3)",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1217
  },
  {
    "code": "E35",
    "name": "Dump Truck 6 - 8 m3",
    "unit": "jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1218
  },
  {
    "code": "E35",
    "name": "Dump Truck Tronton 10 Ton",
    "unit": "Jam",
    "price": 734421.88,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1219
  },
  {
    "code": "E36",
    "name": "Cold Milling",
    "unit": "Jam",
    "price": 1730026.83,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1220
  },
  {
    "code": "E36a",
    "name": "Rumble Strip Machine",
    "unit": "Jam",
    "price": 326420.16,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1221
  },
  {
    "code": "E37",
    "name": "Rock Drill Breaker",
    "unit": "Jam",
    "price": 710340.59,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1222
  },
  {
    "code": "E41",
    "name": "ASPHALT DISTRIBUTOR",
    "unit": "Jam",
    "price": 441600.84,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1223
  },
  {
    "code": "E41",
    "name": "Asp. Distributor",
    "unit": "Jam",
    "price": 441600.84,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1224
  },
  {
    "code": "E41",
    "name": "Asphalt Distributor",
    "unit": "Jam",
    "price": 441600.84,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1225
  },
  {
    "code": "E41",
    "name": "Asphalt Slurry Seal Truck",
    "unit": "Jam",
    "price": 441600.84,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1226
  },
  {
    "code": "E42",
    "name": "Slip Form Paver",
    "unit": "jam",
    "price": 632223.42,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1227
  },
  {
    "code": "E44",
    "name": "Concrete Breaker",
    "unit": "jam",
    "price": 912997.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1228
  },
  {
    "code": "E44",
    "name": "Concrete Pump 100 m3/J",
    "unit": "jam",
    "price": 571804.58,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1229
  },
  {
    "code": "E48",
    "name": "VIBRO HAMMER 80 KG",
    "unit": "Jam",
    "price": 73198.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1230
  },
  {
    "code": "E49",
    "name": "Agitator Truck 4.5 M3",
    "unit": "jam",
    "price": 847088.38,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1231
  },
  {
    "code": "E49",
    "name": "Truck Mixer",
    "unit": "jam",
    "price": 847088.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1232
  },
  {
    "code": "E49",
    "name": "Truck Mixer Agitator",
    "unit": "jam",
    "price": 847088.38,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1233
  },
  {
    "code": "E51",
    "name": "CRANE ON TRACK (10-15) TON; 260 HP",
    "unit": "Jam",
    "price": 2399218.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1234
  },
  {
    "code": "E51",
    "name": "CRANE ON TRACK (75-100) T; 190 HP",
    "unit": "jam",
    "price": 2399217.58,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1235
  },
  {
    "code": "E51",
    "name": "CRANE ON TRUCK (10-15) TON; 260 HP",
    "unit": "Jam",
    "price": 2399218.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1236
  },
  {
    "code": "E51",
    "name": "Crane On Track (10-15 Ton)",
    "unit": "jam",
    "price": 773917.31,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1237
  },
  {
    "code": "E51",
    "name": "Crane On Track (75-100) T; 190 HP",
    "unit": "jam",
    "price": 2399217.58,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1238
  },
  {
    "code": "E51",
    "name": "Crane on Track (75-100) T; 190 HP",
    "unit": "jam",
    "price": 2399217.58,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1239
  },
  {
    "code": "E56",
    "name": "Grouting Pump QZ-999, 650W",
    "unit": "jam",
    "price": 305197.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1240
  },
  {
    "code": "E56",
    "name": "Grouting Pump; 100 HP",
    "unit": "Jam",
    "price": 305197.68,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1241
  },
  {
    "code": "E57",
    "name": "Hidrolic Jack ; 10 HP",
    "unit": "jam",
    "price": 88389.86,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1242
  },
  {
    "code": "E57",
    "name": "Jack Hydraulic; 10 HP",
    "unit": "Jam",
    "price": 88390.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1243
  },
  {
    "code": "E61",
    "name": "PILE DRIVER HAMMER 2,5 Ton",
    "unit": "jam",
    "price": 1039982.25,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1244
  },
  {
    "code": "E61",
    "name": "Pile Dirver Hammer, 2,5 Ton",
    "unit": "jam",
    "price": 1039982.25,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1245
  },
  {
    "code": "E61",
    "name": "Pile Hammer, 2,5 Ton; 1 HP",
    "unit": "jam",
    "price": 1039982.25,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1246
  },
  {
    "code": "E62",
    "name": "STRESSING JACK, 46 - 100 TON; 89 HP",
    "unit": "jam",
    "price": 319391.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1247
  },
  {
    "code": "E62",
    "name": "Stressing Jack; 46--100 Ton; 89 HP",
    "unit": "Jam",
    "price": 319390.58,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1248
  },
  {
    "code": "E63",
    "name": "WELDING MACHINE, 300 A",
    "unit": "jam",
    "price": 81767.7,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1249
  },
  {
    "code": "E63",
    "name": "Welding Machine, 300 A",
    "unit": "jam",
    "price": 81767.7,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1250
  },
  {
    "code": "E63a",
    "name": "WELDING MACHINE, SEMI",
    "unit": "jam",
    "price": 77614.89,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1251
  },
  {
    "code": "E63a",
    "name": "Welding Machine, Semi",
    "unit": "jam",
    "price": 77614.89,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1252
  },
  {
    "code": "E64",
    "name": "Water Jet Blasting",
    "unit": "jam",
    "price": 81156.55,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1253
  },
  {
    "code": "E65",
    "name": "Mesin Pemotong Rumput",
    "unit": "Jam",
    "price": 65459.17,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1254
  },
  {
    "code": "E66",
    "name": "Ponton + Tug Boat; 40 Ton; 80 HP",
    "unit": "jam",
    "price": 612048.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1255
  },
  {
    "code": "E67",
    "name": "Silicon Seal pump",
    "unit": "jam",
    "price": 62429.82,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1256
  },
  {
    "code": "E68",
    "name": "Pompa untuk Epoxy",
    "unit": "jam",
    "price": 67429.36,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1257
  },
  {
    "code": "E69",
    "name": "DRILL MACHINE/GERINDA; 3,32 HP (dia 20-50 mm)",
    "unit": "Jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1258
  },
  {
    "code": "E69",
    "name": "Drilling Machine",
    "unit": "Jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1259
  },
  {
    "code": "E69",
    "name": "Gerinda GWS 750-100 4\"; 1 HP",
    "unit": "jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1260
  },
  {
    "code": "E69",
    "name": "Gerinda Tangan",
    "unit": "Jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1261
  },
  {
    "code": "E69",
    "name": "Gerinda Tangan GWS 750-10",
    "unit": "jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1262
  },
  {
    "code": "E69",
    "name": "Gerinda Tangan GWS 750-100 4\"; 1 HP",
    "unit": "jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1263
  },
  {
    "code": "E69",
    "name": "Gerinda tangan GWS 750-10",
    "unit": "jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1264
  },
  {
    "code": "E69",
    "name": "Gerinda tangan GWS 750-100 4\";",
    "unit": "jam",
    "price": 71762.81,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1265
  },
  {
    "code": "E70",
    "name": "Hand Mixer",
    "unit": "jam",
    "price": 78694.56,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1266
  },
  {
    "code": "E71",
    "name": "BOR MACHINE ; 3,32 HP (dia 20-50 mm)",
    "unit": "Jam",
    "price": 63691.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1267
  },
  {
    "code": "E71",
    "name": "Mesin Bor",
    "unit": "jam",
    "price": 63691.07,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1268
  },
  {
    "code": "E72",
    "name": "CRAWLER CRANE 25 TON",
    "unit": "Jam",
    "price": 983848.59,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1269
  },
  {
    "code": "E73",
    "name": "Crawler 55 Ton",
    "unit": "Jam",
    "price": 1235257.6,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1270
  },
  {
    "code": "E73",
    "name": "Crawler Crane 55 Ton",
    "unit": "Jam",
    "price": 1235258.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1271
  },
  {
    "code": "E74",
    "name": "KUNCI TORSI",
    "unit": "Jam",
    "price": 69935.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1272
  },
  {
    "code": "E74",
    "name": "KUNCI TORSI (TORQUE WRENCH)",
    "unit": "jam",
    "price": 69935.01,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1273
  },
  {
    "code": "E74",
    "name": "Kunci Torsi",
    "unit": "Jam",
    "price": 69935.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1274
  },
  {
    "code": "E74",
    "name": "Kunci Torsi (Torque Wrench)",
    "unit": "jam",
    "price": 69935.01,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1275
  },
  {
    "code": "E75",
    "name": "Pompa graut",
    "unit": "Jam",
    "price": 68053.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1276
  },
  {
    "code": "E76",
    "name": "ASPHALT CUTTER (0,5-0,7 m/menit)",
    "unit": "Jam",
    "price": 101054.21,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1277
  },
  {
    "code": "E76",
    "name": "Asphalt cutter 130 feet/mnt; 22 HP",
    "unit": "jam",
    "price": 101054.21,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1278
  },
  {
    "code": "E76",
    "name": "CONCRETE CUTTER (0,5-0,7 m/menit)",
    "unit": "Jam",
    "price": 101054.21,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1279
  },
  {
    "code": "E76",
    "name": "Concrete Cutter (0,5- 0,7 m/menit)",
    "unit": "Jam",
    "price": 101054.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1280
  },
  {
    "code": "E76",
    "name": "Concrete Cutter (0,5-0,7",
    "unit": "jam",
    "price": 101054.21,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1281
  },
  {
    "code": "E76",
    "name": "Concrete Cutter (0,5-0,7 m/menit)",
    "unit": "Jam",
    "price": 101054.21,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1282
  },
  {
    "code": "E76",
    "name": "Concrete cutter 130 feet/mnt; 22 HP",
    "unit": "jam",
    "price": 101054.21,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1283
  },
  {
    "code": "E78",
    "name": "1 Ton",
    "unit": "jam",
    "price": 674452.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1284
  },
  {
    "code": "E78",
    "name": "Mobile Crane 1 Ton",
    "unit": "Jam",
    "price": 674452.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1285
  },
  {
    "code": "E78",
    "name": "Mobile Crane 1 ton",
    "unit": "Jam",
    "price": 674452.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1286
  },
  {
    "code": "E78",
    "name": "Skyliftcrane Truck; 16 m, 1 To",
    "unit": "jam",
    "price": 674452.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1287
  },
  {
    "code": "E78",
    "name": "Skyliftcrane Truck; 16 m, 1 Ton",
    "unit": "jam",
    "price": 674452.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1288
  },
  {
    "code": "E78",
    "name": "m, 1 Ton",
    "unit": "jam",
    "price": 674452.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1289
  },
  {
    "code": "E79",
    "name": "Drum Mixer Khusus",
    "unit": "Jam",
    "price": 119353.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1290
  },
  {
    "code": "E80",
    "name": "Concrete Batching Plant",
    "unit": "jam",
    "price": 717241.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1291
  },
  {
    "code": "E82",
    "name": "Jack Hydraulic",
    "unit": "jam",
    "price": 125807.92,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1292
  },
  {
    "code": "E83",
    "name": "Hydraulic Pump",
    "unit": "jam",
    "price": 110031.02,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1293
  },
  {
    "code": "E85",
    "name": "Thermoplastic Road Marking Machine",
    "unit": "Jam",
    "price": 105340.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1294
  },
  {
    "code": "E86",
    "name": "Cold Paint Spray Machine",
    "unit": "Jam",
    "price": 91970.02,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1295
  },
  {
    "code": "E88",
    "name": "Truck 2 Ton",
    "unit": "Jam",
    "price": 343527.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1296
  },
  {
    "code": "E88",
    "name": "Truck 2 Ton Alat Bantu Ls 1,0000 - 0,00",
    "unit": "Jam",
    "price": 343527.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1297
  },
  {
    "code": "E94",
    "name": "Hot Compressor Air Lance (HCA)",
    "unit": "Jam",
    "price": 100330.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1298
  },
  {
    "code": "E95",
    "name": "Pre Heater",
    "unit": "Jam",
    "price": 117195.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1299
  },
  {
    "code": "E97",
    "name": "MACHINE BEAM LAUNCHER 300 TON",
    "unit": "jam",
    "price": 485881.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1300
  },
  {
    "code": "E97",
    "name": "Machine Beam Launcher Crane 300 Ton",
    "unit": "jam",
    "price": 485881.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1301
  },
  {
    "code": "E98b",
    "name": "Chainsaw",
    "unit": "Jam",
    "price": 68890.9,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1302
  },
  {
    "code": "E98b",
    "name": "MESIN POTONG KAYU (CHAINSAW)",
    "unit": "Jam",
    "price": 68891.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1303
  },
  {
    "code": "E98g",
    "name": "Mini Generator Set 2000 Watt",
    "unit": "jam",
    "price": 70121.92,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1304
  },
  {
    "code": "E99",
    "name": "Crack Filling Machine",
    "unit": "Jam",
    "price": 87087.93,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1305
  },
  {
    "code": "E99",
    "name": "Crack filling machine; 12 Ltr/mnt; 2,92 HP",
    "unit": "Jam",
    "price": 87088.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1306
  },
  {
    "code": "L01",
    "name": "Pekerja Biasa - - -",
    "unit": "jam",
    "price": 27524.49,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1307
  },
  {
    "code": "M184",
    "name": "Thermocouple",
    "unit": "buah",
    "price": 25000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1308
  },
  {
    "code": "",
    "name": "Alat Bantu",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1309
  },
  {
    "code": "",
    "name": "Alat Bantu Ls",
    "unit": "jam",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1310
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 0,00",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1311
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 1.314,44",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1312
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 1.731,58",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1313
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 1.968,55",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1314
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 17.551,68",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1315
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 178.139,60",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1316
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 182.415,36",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1317
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 197.890,17",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1318
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 202.744,28",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1319
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 3.340,58",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1320
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 4.363,23",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1321
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 4.825,28",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1322
  },
  {
    "code": "",
    "name": "Alat Bantu Sub Total Peralatan 814,04",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1323
  },
  {
    "code": "",
    "name": "Alat bantu",
    "unit": "Ls",
    "price": 0.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1324
  },
  {
    "code": "",
    "name": "Concrete Finisher 3 - 7 mE105",
    "unit": "jam",
    "price": 72388.51,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1325
  },
  {
    "code": "",
    "name": "Laporan Pengujian",
    "unit": "Ls",
    "price": 1500000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1326
  },
  {
    "code": "",
    "name": "Mobilisasi dan Demobilisasi Peralatan Pengujian Lengkap",
    "unit": "Ls",
    "price": 2500000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1327
  },
  {
    "code": "",
    "name": "Pelaksanaan pekerjaan pengujian PDLT di lapangan",
    "unit": "Buah",
    "price": 6215000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1328
  },
  {
    "code": "",
    "name": "Pemantauan Pengukuran Ultrasonik Termasuk Laporan",
    "unit": "Buah",
    "price": 1500000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1329
  },
  {
    "code": "",
    "name": "Penambahan tinggi Settlement Plate per 3 m",
    "unit": "nos",
    "price": 700000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1330
  },
  {
    "code": "",
    "name": "Pengujian Crosshole sonic logging (CSL) Termasuk Laporan",
    "unit": "Buah",
    "price": 2500000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1331
  },
  {
    "code": "",
    "name": "Pengujian Keutuhan Tiang dengan Pile Integrated Test (PIT) Termasuk Laporan",
    "unit": "Buah",
    "price": 1000000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1332
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Dinamis Jenis PDLT Termasuk Laporan",
    "unit": "Buah",
    "price": 3500000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1333
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Horisontal (Lateral Loading Test) Termasuk Laporan",
    "unit": "Buah",
    "price": 17500000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1334
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Jembatan Dinamic Loading Test Termasuk Laporan mn",
    "unit": "Buah",
    "price": 189000000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1335
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Jembatan Static Loading Test (Penguj",
    "unit": "Buah",
    "price": 182000000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1336
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Statis dengan beban hidrolik Cara Beban Bertahap Termasuk Laporan",
    "unit": "Buah",
    "price": 32000000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1337
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Statis dengan beban hidrolik Cara Beban Siklik Termasuk Laporan",
    "unit": "Buah",
    "price": 32000000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1338
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Statis dengan meja beban statis Cara Beban Bertahap Termasuk Laporan",
    "unit": "Buah",
    "price": 108000000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1339
  },
  {
    "code": "",
    "name": "Pengujian Pembebanan Statis dengan meja beban statis Cara Beban Siklik Termasuk Laporan",
    "unit": "Buah",
    "price": 108000000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1340
  },
  {
    "code": "",
    "name": "Peralatan Bor Tanah",
    "unit": "Jam",
    "price": 270000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1341
  },
  {
    "code": "",
    "name": "Setting Alat Bor",
    "unit": "Titik",
    "price": 1350000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1342
  },
  {
    "code": "",
    "name": "Settlement Plate (60 x 60 x 1,5) cm L = 3 m",
    "unit": "Titik",
    "price": 4200000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1343
  },
  {
    "code": "",
    "name": "Sewa Peralatan Pengujian 1.a Komputer PDA 1.b Sensor Transducer Unit 4,00 1.c Sensor Accelerometer Unit 2,00 1.d Main cable Unit 2,00 1.e Wireless Connector 1.f Pelindung Sensor Unit 4,00 1.g Peralatan Pendukung Bor, Grinda, Baut dan mur , dyna set, Palu ,Kabel Power ,Genset , Mal Sensor beton, Mal sensor baja, mata bor beton, kepala bor baja, mata bor besi ,hand tab ,mata tab 1.h Alat Bantu Peralatan untuk membuat laporan pengujian",
    "unit": "Set",
    "price": 4500000.0,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1344
  },
  {
    "code": "",
    "name": "Truk Bak Datar 6 - 8 m3",
    "unit": "jam",
    "price": 730037.27,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1345
  },
  {
    "code": "",
    "name": "Tukang Kayu, Tukang Ba (L02) -",
    "unit": "jam",
    "price": 28930.66,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1346
  },
  {
    "code": "",
    "name": "Vibro Hammer 40 KW",
    "unit": "jam",
    "price": 321130.23,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1347
  },
  {
    "code": "",
    "name": "Vibro Hammer 60 KW",
    "unit": "jam",
    "price": 389265.03,
    "category": "equipment",
    "sourceSheet": "Upah Bahan",
    "sourceRow": 1348
  }
];
