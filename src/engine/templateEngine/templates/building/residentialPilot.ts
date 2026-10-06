import { ConstructionProjectTemplate } from '../../types';

export const residentialPilotTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-residential',
  name: 'Rumah Tinggal Standar & Mewah',
  code: 'BLD-RES-001',
  category: 'BUILDING',
  type: 'residential',
  version: '1.1.0',
  description: 'Template standar konstruksi Rumah Tinggal (1-3 lantai) lengkap 15 hierarki WBS standar PUPR & Quantity Rules.',
  aliases: [
    'rumah',
    'rumah tinggal',
    'residence',
    'residential',
    'villa',
    'townhouse',
    'kost',
    'kontrakan',
    'rumah type 36',
    'rumah type 45',
    'rumah type 60',
    'rumah type 70',
    'rumah type 100',
    'rumah type 120',
    'rumah 1 lantai',
    'rumah 2 lantai'
  ],
  keywords: [
    'rumah',
    'hunian',
    'tinggal',
    'residence',
    'villa',
    'perumahan',
    'cluster',
    'kamar',
    'type 36',
    'type 45',
    'type 60',
    'type 70',
    'type 100'
  ],
  parameters: [
    {
      id: 'building_area',
      name: 'Luas Bangunan',
      description: 'Total luas lantai bangunan yang akan dibangun',
      type: 'NUMBER',
      required: true,
      defaultValue: 70,
      unit: 'm²',
      min: 18,
      max: 2000,
      group: 'dimensions'
    },
    {
      id: 'land_area',
      name: 'Luas Tanah',
      description: 'Total luas kavling tanah eksisting',
      type: 'NUMBER',
      required: false,
      defaultValue: 100,
      unit: 'm²',
      min: 20,
      max: 10000,
      group: 'dimensions'
    },
    {
      id: 'num_floors',
      name: 'Jumlah Lantai',
      description: 'Berapa lantai bangunan yang direncanakan',
      type: 'NUMBER',
      required: true,
      defaultValue: 1,
      unit: 'lantai',
      min: 1,
      max: 4,
      group: 'dimensions'
    },
    {
      id: 'num_bedrooms',
      name: 'Jumlah Kamar Tidur',
      type: 'NUMBER',
      required: false,
      defaultValue: 3,
      unit: 'ruang',
      min: 1,
      max: 20,
      group: 'general'
    },
    {
      id: 'num_bathrooms',
      name: 'Jumlah Kamar Mandi',
      type: 'NUMBER',
      required: false,
      defaultValue: 2,
      unit: 'ruang',
      min: 1,
      max: 10,
      group: 'general'
    },
    {
      id: 'foundation_type',
      name: 'Jenis Pondasi Utama',
      type: 'SELECT',
      required: false,
      defaultValue: 'batu_kali',
      options: [
        { label: 'Pondasi Batu Kali / Belah', value: 'batu_kali' },
        { label: 'Pondasi Telapak / Footplat Beton', value: 'footplat' },
        { label: 'Pondasi Strauss Pile / Tiang Pancang Mini', value: 'strauss_pile' }
      ],
      group: 'specifications'
    },
    {
      id: 'wall_material',
      name: 'Material Dinding',
      type: 'SELECT',
      required: false,
      defaultValue: 'bata_ringan',
      options: [
        { label: 'Bata Ringan (Hebel) t=10cm', value: 'bata_ringan' },
        { label: 'Bata Merah Bakar Konvensional', value: 'bata_merah' },
        { label: 'Batako Semen Press', value: 'batako' }
      ],
      group: 'specifications'
    },
    {
      id: 'roof_type',
      name: 'Jenis Penutup Atap',
      type: 'SELECT',
      required: false,
      defaultValue: 'genteng_beton',
      options: [
        { label: 'Genteng Beton Flat / Gelombang', value: 'genteng_beton' },
        { label: 'Genteng Keramik Glazur', value: 'genteng_keramik' },
        { label: 'Genteng Tanah Liat Pres', value: 'genteng_tanah_liat' },
        { label: 'Spandek / Galvalum Gelombang', value: 'spandek' },
        { label: 'Dak Beton Ekspos / Rooftop', value: 'dak_beton' }
      ],
      group: 'specifications'
    },
    {
      id: 'finishing_quality',
      name: 'Kelas Spesifikasi / Finishing',
      type: 'SELECT',
      required: false,
      defaultValue: 'medium',
      options: [
        { label: 'Ekonomis / Sederhana', value: 'economic' },
        { label: 'Menengah / Standar', value: 'medium' },
        { label: 'Mewah / Premium', value: 'luxury' }
      ],
      group: 'finishing'
    },
    {
      id: 'has_carport',
      name: 'Memiliki Carport',
      type: 'BOOLEAN',
      required: false,
      defaultValue: true,
      group: 'specifications'
    },
    {
      id: 'location_province',
      name: 'Provinsi Lokasi Proyek',
      type: 'STRING',
      required: false,
      defaultValue: 'Jawa Timur',
      group: 'location'
    },
    {
      id: 'location_city',
      name: 'Kabupaten / Kota Lokasi Proyek',
      type: 'STRING',
      required: false,
      defaultValue: 'Surabaya',
      group: 'location'
    }
  ],
  assumptionRules: [
    {
      parameterId: 'land_area',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'building_area * 1.4',
      confidence: 0.85,
      reasoning: 'Rasio KDB perumahan standar Indonesia rata-rata 60-70% luas tapak',
      industryStandardReference: 'SNI 03-1733-2004 Tata Cara Perencanaan Lingkungan Perumahan di Perkotaan'
    },
    {
      parameterId: 'num_floors',
      assumedValue: 1,
      confidence: 0.9,
      reasoning: 'Default rumah tapak diasumsikan 1 lantai jika tidak disebutkan secara eksplisit'
    },
    {
      parameterId: 'roof_type',
      assumedValue: 'genteng_beton',
      confidence: 0.8,
      reasoning: 'Standar umum konstruksi rumah tinggal modern menggunakan genteng beton flat/gelombang'
    },
    {
      parameterId: 'finishing_quality',
      assumedValue: 'medium',
      confidence: 0.8,
      reasoning: 'Kualitas spesifikasi standar material kelas medium (granit 60x60, cat dulux/jotun sekelas)'
    }
  ],
  validationRules: [
    {
      id: 'VAL-001',
      name: 'Luas Bangunan Positif',
      severity: 'ERROR',
      expression: 'building_area > 0',
      errorMessage: 'Luas bangunan harus lebih besar dari 0 m².'
    },
    {
      id: 'VAL-002',
      name: 'KDB / Luas Tanah Valid',
      severity: 'WARNING',
      expression: 'land_area >= building_area / num_floors',
      errorMessage: 'Luas tanah tampak lebih kecil dari tapak dasar lantai 1 bangunan.'
    }
  ],
  quantityRules: [
    {
      wbsCode: '01.01.01',
      formula: 'building_area * 1.2',
      unit: 'm²',
      variables: ['building_area'],
      description: 'Luas pembersihan site = luas bangunan + keliling kerja 20%'
    },
    {
      wbsCode: '01.02.02',
      formula: 'Math.sqrt(building_area) * 4 + 8',
      unit: 'm1',
      variables: ['building_area'],
      description: 'Keliling bouwplank = keliling tapak dasar + 2 meter per perimeter'
    },
    {
      wbsCode: '02.01.01',
      formula: 'building_area * 0.35',
      unit: 'm³',
      variables: ['building_area'],
      description: 'Estimasi volume galian tanah pondasi batu kali'
    },
    {
      wbsCode: '03.01.01',
      formula: 'building_area * 0.08',
      unit: 'm³',
      variables: ['building_area'],
      description: 'Volume sloof beton bertulang'
    },
    {
      wbsCode: '04.01.01',
      formula: 'building_area * 2.8',
      unit: 'm²',
      variables: ['building_area'],
      description: 'Estimasi luas bidang pasangan dinding bata'
    },
    {
      wbsCode: '06.01.02',
      formula: 'building_area * 0.95',
      unit: 'm²',
      variables: ['building_area'],
      description: 'Estimasi luas pasang keramik / granit ruang dalam'
    },
    {
      wbsCode: '07.02.01',
      formula: '(building_area / num_floors) * 1.25',
      unit: 'm²',
      variables: ['building_area', 'num_floors'],
      description: 'Luas bidang atap kemiringan 30 derajat'
    },
    {
      wbsCode: '09.02.01',
      formula: 'building_area * 0.9',
      unit: 'm²',
      variables: ['building_area'],
      description: 'Luas plafon gypsum interior'
    },
    {
      wbsCode: '12.02.01',
      formula: 'building_area * 5.2',
      unit: 'm²',
      variables: ['building_area'],
      description: 'Luas bidang cat interior dan eksterior (2 sisi dinding)'
    }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN PERSIAPAN',
      level: 1,
      children: [
        {
          code: '01.01',
          title: 'Pembersihan Lokasi & Perataan Tanah',
          level: 2,
          children: [
            { code: '01.01.01', title: 'Pembersihan dan penebasan lapangan/semak belukar', level: 3, unit: 'm²', ahspCode: 'A.2.2.1.1' },
            { code: '01.01.02', title: 'Perataan dan pemadatan tanah kerja', level: 3, unit: 'm²', ahspCode: 'A.2.3.1.11' }
          ]
        },
        {
          code: '01.02',
          title: 'Pengukuran & Pemasangan Bouwplank',
          level: 2,
          children: [
            { code: '01.02.01', title: 'Pengukuran site & pematokan elevasi', level: 3, unit: 'ls' },
            { code: '01.02.02', title: 'Pemasangan bouwplank kayu meranti kaso 5/7', level: 3, unit: 'm1', ahspCode: 'A.2.2.1.4' }
          ]
        },
        {
          code: '01.03',
          title: 'Fasilitas Sementara & K3 Konstruksi',
          level: 2,
          children: [
            { code: '01.03.01', title: 'Pembuatan direksi keet dan gudang material semen', level: 3, unit: 'm²', ahspCode: 'A.2.2.1.8' },
            { code: '01.03.02', title: 'Pengadaan listrik dan air kerja sementara', level: 3, unit: 'ls' },
            { code: '01.03.03', title: 'Penyediaan perlengkapan keselamatan kerja (K3)', level: 3, unit: 'ls' }
          ]
        }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN TANAH',
      level: 1,
      children: [
        {
          code: '02.01',
          title: 'Galian dan Pembuangan Tanah',
          level: 2,
          children: [
            { code: '02.01.01', title: 'Galian tanah pondasi batu kali kedalaman 1 m', level: 3, unit: 'm³', ahspCode: 'A.2.3.1.1' },
            { code: '02.01.02', title: 'Galian tanah pondasi footplat / cakar ayam', level: 3, unit: 'm³', ahspCode: 'A.2.3.1.2', conditionalRule: { parameterId: 'num_floors', operator: '>=', value: 2 } },
            { code: '02.01.03', title: 'Pembuangan tanah sisa galian keluar lokasi', level: 3, unit: 'm³' }
          ]
        },
        {
          code: '02.02',
          title: 'Urugan dan Pemadatan Tanah',
          level: 2,
          children: [
            { code: '02.02.01', title: 'Urugan pasir bawah pondasi tebal 10 cm', level: 3, unit: 'm³', ahspCode: 'A.2.3.1.11' },
            { code: '02.02.02', title: 'Urugan tanah kembali bekas galian pondasi', level: 3, unit: 'm³', ahspCode: 'A.2.3.1.9' },
            { code: '02.02.03', title: 'Urugan peninggian lantai bawah keramik t=15cm', level: 3, unit: 'm³', ahspCode: 'A.2.3.1.11' }
          ]
        }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN PONDASI',
      level: 1,
      children: [
        {
          code: '03.01',
          title: 'Pondasi Batu Kali / Belah',
          level: 2,
          children: [
            { code: '03.01.01', title: 'Pemasangan pondasi batu kosong (aanstamping)', level: 3, unit: 'm³', ahspCode: 'A.3.2.1.1' },
            { code: '03.01.02', title: 'Pemasangan pondasi batu kali belah adukan 1:5', level: 3, unit: 'm³', ahspCode: 'A.3.2.1.2' }
          ]
        },
        {
          code: '03.02',
          title: 'Pondasi Footplat / Cakar Ayam Bertulang',
          level: 2,
          conditionalRule: { parameterId: 'num_floors', operator: '>=', value: 2 },
          children: [
            { code: '03.02.01', title: 'Beton footplat K-250 bertulang besi ulir D13', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.5' },
            { code: '03.02.02', title: 'Lantai kerja bawah footplat t=5 cm B-0', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.1' }
          ]
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN STRUKTUR',
      level: 1,
      children: [
        {
          code: '04.01',
          title: 'Struktur Bawah (Lantai 1)',
          level: 2,
          children: [
            { code: '04.01.01', title: 'Beton sloof 15/20 bertulang K-225', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.2' },
            { code: '04.01.02', title: 'Beton kolom praktis 15/15 K-175', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.3' },
            { code: '04.01.03', title: 'Beton kolom utama 20/20 K-250', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.4' }
          ]
        },
        {
          code: '04.02',
          title: 'Struktur Atas & Pelat Lantai 2',
          level: 2,
          conditionalRule: { parameterId: 'num_floors', operator: '>=', value: 2 },
          children: [
            { code: '04.02.01', title: 'Beton balok gantung 20/35 K-250 bertulang', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.6' },
            { code: '04.02.02', title: 'Pelat lantai beton bertulang t=12 cm K-250 bondek/wiremesh M8', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.7' },
            { code: '04.02.03', title: 'Beton tangga dan bordes bertulang K-250', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.8' },
            { code: '04.02.04', title: 'Beton kolom lantai 2 K-250', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.4' }
          ]
        },
        {
          code: '04.03',
          title: 'Ringbalk & Pengaku Atap',
          level: 2,
          children: [
            { code: '04.03.01', title: 'Beton ringbalk 15/20 K-200 pengaku atap', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.9' },
            { code: '04.03.02', title: 'Beton kanopi jendela / talang beton K-225', level: 3, unit: 'm³', ahspCode: 'A.4.1.1.10' }
          ]
        }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN DINDING',
      level: 1,
      children: [
        {
          code: '05.01',
          title: 'Pasangan Dinding Bata / Hebel',
          level: 2,
          children: [
            { code: '05.01.01', title: 'Pasangan bata ringan hebel t=10 cm mortar instan', level: 3, unit: 'm²', ahspCode: 'A.4.4.1.1' },
            { code: '05.01.02', title: 'Pasangan trasraam 1:2 kedap air area kamar mandi', level: 3, unit: 'm²', ahspCode: 'A.4.4.1.2' }
          ]
        },
        {
          code: '05.02',
          title: 'Plesteran dan Acian Dinding',
          level: 2,
          children: [
            { code: '05.02.01', title: 'Plesteran dinding tebal 15 mm 1:4', level: 3, unit: 'm²', ahspCode: 'A.4.4.2.1' },
            { code: '05.02.02', title: 'Acian semen instan / semen PC halus', level: 3, unit: 'm²', ahspCode: 'A.4.4.2.2' }
          ]
        }
      ]
    },
    {
      code: '06',
      title: 'PEKERJAAN LANTAI',
      level: 1,
      children: [
        {
          code: '06.01',
          title: 'Lantai Ruang Utama & Kamar',
          level: 2,
          children: [
            { code: '06.01.01', title: 'Rabat beton lantai dasar t=5 cm', level: 3, unit: 'm²', ahspCode: 'A.4.1.1.1' },
            { code: '06.01.02', title: 'Pasang lantai homogeneous tile / granit 60x60 polished', level: 3, unit: 'm²', ahspCode: 'A.4.4.3.1' },
            { code: '06.01.03', title: 'Pasang plint granit 10x60 keliling ruangan', level: 3, unit: 'm1', ahspCode: 'A.4.4.3.2' }
          ]
        },
        {
          code: '06.02',
          title: 'Lantai dan Dinding Kamar Mandi',
          level: 2,
          children: [
            { code: '06.02.01', title: 'Waterproofing coating kamar mandi 2 lapis', level: 3, unit: 'm²', ahspCode: 'A.4.4.3.3' },
            { code: '06.02.02', title: 'Pasang keramik lantai KM unpolished 30x30 anti slip', level: 3, unit: 'm²', ahspCode: 'A.4.4.3.4' },
            { code: '06.02.03', title: 'Pasang keramik dinding KM 30x60 motif setinggi 2 m', level: 3, unit: 'm²', ahspCode: 'A.4.4.3.5' }
          ]
        },
        {
          code: '06.03',
          title: 'Lantai Carport & Teras',
          level: 2,
          conditionalRule: { parameterId: 'has_carport', operator: '==', value: true },
          children: [
            { code: '06.03.01', title: 'Rabat beton bertulang wiremesh lantai carport t=8 cm', level: 3, unit: 'm²', ahspCode: 'A.4.1.1.1' },
            { code: '06.03.02', title: 'Lantai carport keramik tekstur kasar / batu sikat koral', level: 3, unit: 'm²', ahspCode: 'A.4.4.3.6' }
          ]
        }
      ]
    },
    {
      code: '07',
      title: 'PEKERJAAN ATAP',
      level: 1,
      children: [
        {
          code: '07.01',
          title: 'Rangka Atap Baja Ringan',
          level: 2,
          children: [
            { code: '07.01.01', title: 'Rangka atap truss baja ringan Zincalume C75 tebal 0.75 mm', level: 3, unit: 'm²', ahspCode: 'A.4.2.1.1' },
            { code: '07.01.02', title: 'Reng baja ringan tebal 0.45 mm', level: 3, unit: 'm²', ahspCode: 'A.4.2.1.2' }
          ]
        },
        {
          code: '07.02',
          title: 'Penutup Atap & Nok / Bubungan',
          level: 2,
          children: [
            { code: '07.02.01', title: 'Pasang penutup atap sesuai spesifikasi (genteng beton/keramik/spandek)', level: 3, unit: 'm²', ahspCode: 'A.4.5.1.1' },
            { code: '07.02.02', title: 'Pasang genteng nok/bubungan 1:3', level: 3, unit: 'm1', ahspCode: 'A.4.5.1.2' },
            { code: '07.02.03', title: 'Pemasangan insulation aluminium foil peredam panas', level: 3, unit: 'm²', ahspCode: 'A.4.5.1.3' }
          ]
        },
        {
          code: '07.03',
          title: 'Listplank dan Talang',
          level: 2,
          children: [
            { code: '07.03.01', title: 'Listplank GRC board profil lebar 20 cm', level: 3, unit: 'm1', ahspCode: 'A.4.5.2.1' },
            { code: '07.03.02', title: 'Talang jurai seng galvalum / plat aluminium', level: 3, unit: 'm1', ahspCode: 'A.4.5.2.2' }
          ]
        }
      ]
    },
    {
      code: '08',
      title: 'PEKERJAAN KUSEN, PINTU, DAN JENDELA',
      level: 1,
      children: [
        {
          code: '08.01',
          title: 'Kusen dan Daun Pintu',
          level: 2,
          children: [
            { code: '08.01.01', title: 'Kusen aluminium 4 inch powder coating', level: 3, unit: 'm1', ahspCode: 'A.4.6.1.1' },
            { code: '08.01.02', title: 'Daun pintu utama panel kayu solid engineering', level: 3, unit: 'bh', ahspCode: 'A.4.6.1.2' },
            { code: '08.01.03', title: 'Daun pintu kamar tidur flush door finishing HPL', level: 3, unit: 'bh', ahspCode: 'A.4.6.1.3' },
            { code: '08.01.04', title: 'Pintu PVC / UPVC kedap air kamar mandi', level: 3, unit: 'bh', ahspCode: 'A.4.6.1.4' }
          ]
        },
        {
          code: '08.02',
          title: 'Jendela, Ventilasi & Kaca',
          level: 2,
          children: [
            { code: '08.02.01', title: 'Kaca polos tebal 5 mm untuk daun jendela', level: 3, unit: 'm²', ahspCode: 'A.4.6.2.1' },
            { code: '08.02.02', title: 'Aksesoris engsel casement, grendel, dan handle jendela', level: 3, unit: 'set' }
          ]
        },
        {
          code: '08.03',
          title: 'Kunci dan Aksesoris',
          level: 2,
          children: [
            { code: '08.03.01', title: 'Kunci tanam silinder 2 slaag pintu utama (dekson/sekelas)', level: 3, unit: 'set', ahspCode: 'A.4.6.3.1' },
            { code: '08.03.02', title: 'Handle pintu lever handle set lengkap', level: 3, unit: 'set', ahspCode: 'A.4.6.3.2' }
          ]
        }
      ]
    },
    {
      code: '09',
      title: 'PEKERJAAN PLAFON',
      level: 1,
      children: [
        {
          code: '09.01',
          title: 'Rangka Plafon',
          level: 2,
          children: [
            { code: '09.01.01', title: 'Rangka plafon besi hollow galvanis 40x40 & 20x40', level: 3, unit: 'm²', ahspCode: 'A.4.5.3.1' }
          ]
        },
        {
          code: '09.02',
          title: 'Penutup dan Lis Plafon',
          level: 2,
          children: [
            { code: '09.02.01', title: 'Plafon gypsum board tebal 9 mm (Jayaboard/Elephant)', level: 3, unit: 'm²', ahspCode: 'A.4.5.3.2' },
            { code: '09.02.02', title: 'Plafon kalsiboard/GRC tebal 4 mm area basah/toilet/overstek', level: 3, unit: 'm²', ahspCode: 'A.4.5.3.3' },
            { code: '09.02.03', title: 'Lis profil gypsum C7 / 10 cm keliling ruangan', level: 3, unit: 'm1', ahspCode: 'A.4.5.3.4' }
          ]
        }
      ]
    },
    {
      code: '10',
      title: 'PEKERJAAN LISTRIK',
      level: 1,
      children: [
        {
          code: '10.01',
          title: 'Panel & Pengaman Listrik',
          level: 2,
          children: [
            { code: '10.01.01', title: 'Box panel MCB pre-wired 4-6 group (Schneider)', level: 3, unit: 'unit', ahspCode: 'A.6.1.1.1' },
            { code: '10.01.02', title: 'Instalasi pembumian / grounding copper rod D 5/8 inch', level: 3, unit: 'titik', ahspCode: 'A.6.1.1.2' }
          ]
        },
        {
          code: '10.02',
          title: 'Titik Lampu dan Saklar',
          level: 2,
          children: [
            { code: '10.02.01', title: 'Instalasi titik lampu kabel NYM 3x1.5 mm dalam pipa conduit', level: 3, unit: 'titik', ahspCode: 'A.6.1.2.1' },
            { code: '10.02.02', title: 'Lampu LED downlight 9W / 12W hemat energi (Philips)', level: 3, unit: 'bh', ahspCode: 'A.6.1.2.2' },
            { code: '10.02.03', title: 'Saklar tunggal & saklar ganda (Panasonic / Schneider)', level: 3, unit: 'bh', ahspCode: 'A.6.1.2.3' }
          ]
        },
        {
          code: '10.03',
          title: 'Stop Kontak & Jalur Khusus',
          level: 2,
          children: [
            { code: '10.03.01', title: 'Instalasi titik stop kontak kabel NYM 3x2.5 mm pipa conduit', level: 3, unit: 'titik', ahspCode: 'A.6.1.3.1' },
            { code: '10.03.02', title: 'Stop kontak dinding 16A (Panasonic / Schneider)', level: 3, unit: 'bh', ahspCode: 'A.6.1.3.2' },
            { code: '10.03.03', title: 'Stop kontak khusus AC & Water Heater dengan isolator pengaman', level: 3, unit: 'titik', ahspCode: 'A.6.1.3.3' }
          ]
        }
      ]
    },
    {
      code: '11',
      title: 'PEKERJAAN PLUMBING DAN SANITASI',
      level: 1,
      children: [
        {
          code: '11.01',
          title: 'Perlengkapan Sanitair',
          level: 2,
          children: [
            { code: '11.01.01', title: 'Kloset duduk monoblok dual flush (Toto / sekelas)', level: 3, unit: 'unit', ahspCode: 'A.5.1.1.1' },
            { code: '11.01.02', title: 'Jet washer bidet spray kloset duduk', level: 3, unit: 'unit', ahspCode: 'A.5.1.1.2' },
            { code: '11.01.03', title: 'Shower set dinding + stop kran stainless steel', level: 3, unit: 'unit', ahspCode: 'A.5.1.1.3' },
            { code: '11.01.04', title: 'Floor drain stainless steel anti bau & serangga', level: 3, unit: 'bh', ahspCode: 'A.5.1.1.4' },
            { code: '11.01.05', title: 'Kitchen sink cuci piring 1 bak stainless + kran angsa', level: 3, unit: 'unit', ahspCode: 'A.5.1.1.5' }
          ]
        },
        {
          code: '11.02',
          title: 'Instalasi Pemipaan Air Bersih & Kotor',
          level: 2,
          children: [
            { code: '11.02.01', title: 'Instalasi pipa air bersih PVC AW 3/4 inch & 1/2 inch', level: 3, unit: 'm1', ahspCode: 'A.5.1.2.1' },
            { code: '11.02.02', title: 'Instalasi pipa air kotor & limbah PVC D 3 inch & 4 inch', level: 3, unit: 'm1', ahspCode: 'A.5.1.2.2' },
            { code: '11.02.03', title: 'Bio septic tank fiberglass ramah lingkungan kapasitas 1000L', level: 3, unit: 'unit', ahspCode: 'A.5.1.3.1' }
          ]
        }
      ]
    },
    {
      code: '12',
      title: 'PEKERJAAN PENGECATAN',
      level: 1,
      children: [
        {
          code: '12.01',
          title: 'Pengecatan Plafon',
          level: 2,
          children: [
            { code: '12.01.01', title: 'Cat plafon gypsum interior primer & cat 2 lapis', level: 3, unit: 'm²', ahspCode: 'A.4.7.1.1' }
          ]
        },
        {
          code: '12.02',
          title: 'Pengecatan Dinding Interior & Eksterior',
          level: 2,
          children: [
            { code: '12.02.01', title: 'Cat dinding interior alkali sealer + 2 lapis emulsi', level: 3, unit: 'm²', ahspCode: 'A.4.7.1.2' },
            { code: '12.02.02', title: 'Cat dinding eksterior weathershield tahan cuaca', level: 3, unit: 'm²', ahspCode: 'A.4.7.1.3' }
          ]
        },
        {
          code: '12.03',
          title: 'Pengecatan Kayu / Besi',
          level: 2,
          children: [
            { code: '12.03.01', title: 'Cat anti karat meni besi / cat dasar', level: 3, unit: 'm²', ahspCode: 'A.4.7.1.4' },
            { code: '12.03.02', title: 'Pernis / melamik daun pintu kayu panel', level: 3, unit: 'm²', ahspCode: 'A.4.7.1.5' }
          ]
        }
      ]
    },
    {
      code: '13',
      title: 'PEKERJAAN EKSTERIOR',
      level: 1,
      children: [
        {
          code: '13.01',
          title: 'Pagar & Gerbang',
          level: 2,
          children: [
            { code: '13.01.01', title: 'Pondasi dan kolom pagar depan pasangan batu bata aci', level: 3, unit: 'm1' },
            { code: '13.01.02', title: 'Pintu gerbang besi hollow galvanis finishing duco', level: 3, unit: 'm²' }
          ]
        },
        {
          code: '13.02',
          title: 'Saluran Drainase Luar & Halaman',
          level: 2,
          children: [
            { code: '13.02.01', title: 'Saluran pembuangan keliling buis beton U-20 + tutup', level: 3, unit: 'm1', ahspCode: 'A.2.3.1.5' },
            { code: '13.02.02', title: 'Perapihan tanah halaman / taman rumput gajah mini', level: 3, unit: 'm²' }
          ]
        }
      ]
    },
    {
      code: '14',
      title: 'PEKERJAAN FINISHING',
      level: 1,
      children: [
        {
          code: '14.01',
          title: 'Pekerjaan Aksesoris & Ornamen',
          level: 2,
          children: [
            { code: '14.01.01', title: 'Pemasangan nomor rumah, mailbox, dan bel pintu', level: 3, unit: 'set' },
            { code: '14.01.02', title: 'Pemasangan railing tangga besi hollow / stainless steel', level: 3, unit: 'm1', conditionalRule: { parameterId: 'num_floors', operator: '>=', value: 2 } }
          ]
        },
        {
          code: '14.02',
          title: 'Kanopi & Waterproofing Proteksi',
          level: 2,
          conditionalRule: { parameterId: 'has_carport', operator: '==', value: true },
          children: [
            { code: '14.02.01', title: 'Rangka kanopi carport hollow galvanis & solarflat', level: 3, unit: 'm²' }
          ]
        }
      ]
    },
    {
      code: '15',
      title: 'PEMBERSIHAN DAN SERAH TERIMA',
      level: 1,
      children: [
        {
          code: '15.01',
          title: 'Pembersihan Akhir',
          level: 2,
          children: [
            { code: '15.01.01', title: 'Pembersihan puing, sisa cat, dan pembersihan lantai general', level: 3, unit: 'ls' },
            { code: '15.01.02', title: 'Pembuangan sisa puing keluar lokasi proyek', level: 3, unit: 'ls' }
          ]
        },
        {
          code: '15.02',
          title: 'Uji Coba & Dokumen Serah Terima',
          level: 2,
          children: [
            { code: '15.02.01', title: 'Testing & commissioning instalasi listrik dan sanitasi', level: 3, unit: 'ls' },
            { code: '15.02.02', title: 'Penyusunan as-built drawing dan Berita Acara Serah Terima (BAST)', level: 3, unit: 'ls' }
          ]
        }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
