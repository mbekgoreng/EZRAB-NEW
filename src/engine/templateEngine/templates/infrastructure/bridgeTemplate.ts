import { ConstructionProjectTemplate } from '../../types';

export const bridgeTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-infra-bridge',
  name: 'Jembatan Gelagar Beton & Baja',
  code: 'INF-BRG-001',
  category: 'INFRASTRUCTURE',
  type: 'bridge',
  version: '2.0.0',
  description: 'Konstruksi jembatan gelagar beton prategang (PCI Girder) atau jembatan rangka baja bentang menengah/panjang dengan 22 hierarki WBS standar Bina Marga.',
  aliases: ['jembatan', 'bridge', 'flyover', 'jembatan girder', 'jembatan beton', 'jembatan baja', 'jembatan komposit'],
  keywords: ['jembatan', 'bridge', 'abutment', 'pier', 'girder', 'pci girder', 'elastomeric bearing pad', 'expansion joint', 'railing jembatan', 'oprit'],
  parameters: [
    { id: 'bridge_length', name: 'Bentang Panjang Jembatan Total', type: 'NUMBER', required: true, defaultValue: 30, unit: 'm', min: 6, max: 500, group: 'dimensions' },
    { id: 'bridge_width', name: 'Lebar Total Jembatan Termasuk Trotoar', type: 'NUMBER', required: true, defaultValue: 9, unit: 'm', min: 3, max: 40, group: 'dimensions' },
    { id: 'bridge_structure_type', name: 'Tipe Struktur Utama', type: 'SELECT', required: true, defaultValue: 'pci_girder', options: [{ label: 'Gelagar Beton Prategang (PCI Girder)', value: 'pci_girder' }, { label: 'Gelagar Baja Komposit (Steel I-Girder)', value: 'steel_girder' }, { label: 'Rangka Baja Pelengkung / Truss', value: 'steel_truss' }], group: 'specifications' },
    { id: 'foundation_type', name: 'Tipe Pondasi Jembatan', type: 'SELECT', required: false, defaultValue: 'bored_pile', options: [{ label: 'Pondasi Bored Pile D80-120cm', value: 'bored_pile' }, { label: 'Tiang Pancang Baja / Spun Pile', value: 'spun_pile' }], group: 'specifications' },
    { id: 'has_pier', name: 'Memiliki Pilar Tengah (Pier Jembatan)', type: 'BOOLEAN', required: false, defaultValue: false, group: 'specifications' },
    { id: 'has_approach_slab', name: 'Memiliki Pelat Injak (Approach Slab)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'has_pier',
      condition: { parameterId: 'bridge_length', operator: '>', value: 35 },
      assumedValue: true,
      confidence: 0.9,
      reasoning: 'Bentang jembatan di atas 35 meter lazimnya memerlukan pilar tengah (pier) pendukung'
    }
  ],
  validationRules: [
    { id: 'VAL-BRG-1', name: 'Panjang Jembatan Positif', severity: 'ERROR', expression: 'bridge_length > 0', errorMessage: 'Panjang jembatan harus lebih dari 0 meter.' },
    { id: 'VAL-BRG-2', name: 'Lebar Jembatan Positif', severity: 'ERROR', expression: 'bridge_width > 0', errorMessage: 'Lebar jembatan harus lebih dari 0 meter.' }
  ],
  quantityRules: [
    { wbsCode: '10.01', formula: 'bridge_length * bridge_width', unit: 'm²', variables: ['bridge_length', 'bridge_width'], description: 'Luas lantai deck jembatan' },
    { wbsCode: '13.01', formula: 'bridge_length * bridge_width * 0.25', unit: 'm³', variables: ['bridge_length', 'bridge_width'], description: 'Volume beton plat deck lantai t=25cm' }
  ],
  wbsHierarchy: [
    { code: '01', title: 'PEKERJAAN PERSIAPAN', level: 1, children: [{ code: '01.01', title: 'Pembersihan Lokasi, Mobilisasi Alat Berat & K3 Jembatan', level: 2 }] },
    { code: '02', title: 'PEKERJAAN SURVEY DAN PENYELIDIKAN TANAH', level: 1, children: [{ code: '02.01', title: 'Survey Batimetri Sungai & Boring Log Geoteknik Tanah Dasar', level: 2 }] },
    { code: '03', title: 'PEKERJAAN FASILITAS PENGALIHAN & DEWATERING', level: 1, children: [{ code: '03.01', title: 'Kisdam (Cofferdam) Pasir / Sheet Pile Baja & Pompa Dewatering Sungai', level: 2 }] },
    { code: '04', title: 'PEKERJAAN TANAH', level: 1, children: [{ code: '04.01', title: 'Galian Tanah Struktur Abutment dan Pembuangan', level: 2 }] },
    { code: '05', title: 'PEKERJAAN PONDASI DALAM JEMBATAN', level: 1, children: [{ code: '05.01', title: 'Pengeboran Bored Pile D80-100cm & Pile Cap Abutment K-350', level: 2 }] },
    { code: '06', title: 'PEKERJAAN ABUTMENT JEMBATAN', level: 1, children: [{ code: '06.01', title: 'Dinding Abutment, Wing Wall & Backwall Beton Bertulang K-300', level: 2 }] },
    {
      code: '07',
      title: 'PEKERJAAN PIER (PILAR TENGAH JEMBATAN)',
      level: 1,
      conditionalRule: { parameterId: 'has_pier', operator: '==', value: true },
      children: [{ code: '07.01', title: 'Kolom Pilar Jembatan Bulat/Persegi & Pier Head Beton Prategang K-400', level: 2 }]
    },
    { code: '08', title: 'PEKERJAAN GIRDER (GELAGAR UTAMA)', level: 1, children: [{ code: '08.01', title: 'Pengadaan & Erection Gelagar PCI Girder / Baja Bentang Rencana Menggunakan Crane', level: 2 }] },
    { code: '09', title: 'PEKERJAAN BEARING PAD (LANDASAN JEMBATAN)', level: 1, children: [{ code: '09.01', title: 'Pemasangan Elastomeric Bearing Pad Karet Alam Berlapis Baja Standar Bina Marga', level: 2 }] },
    { code: '10', title: 'PEKERJAAN DECK SLAB (LANTAI JEMBATAN)', level: 1, children: [{ code: '10.01', title: 'Pemasangan Precast Half Slab Panel / Bondek Penahan Cor Lantai', level: 2 }] },
    { code: '11', title: 'PEKERJAAN PEMBESIAN STRUKTUR JEMBATAN', level: 1, children: [{ code: '11.01', title: 'Pabrikasi Pembesian Besi Ulir BJTS-420B D16-D25', level: 2 }] },
    { code: '12', title: 'PEKERJAAN BEKISTING & PERANCAH', level: 1, children: [{ code: '12.01', title: 'Bekisting Pelat Lantai Jembatan & Perancah Cantilever', level: 2 }] },
    { code: '13', title: 'PEKERJAAN BETON STRUKTUR DECK', level: 1, children: [{ code: '13.01', title: 'Pengecoran Beton Ready Mix K-350 / Fc 30 MPa Deck Jembatan', level: 2 }] },
    { code: '14', title: 'PEKERJAAN WATERPROOFING LANTAI JEMBATAN', level: 1, children: [{ code: '14.01', title: 'Waterproofing Membrane Bakar Tebal 3-4mm Perlindungan Pelat Lantai Beton', level: 2 }] },
    { code: '15', title: 'PEKERJAAN EXPANSION JOINT (SIAR MUAI)', level: 1, children: [{ code: '15.01', title: 'Pemasangan Expansion Joint Tipe Asphaltic Plug / Finger Joint Baja', level: 2 }] },
    { code: '16', title: 'PEKERJAAN RAILING & TROTOAR JEMBATAN', level: 1, children: [{ code: '16.01', title: 'Railing Pipa Besi Galvanis D3 Inch & Parapet Pengaman Beton', level: 2 }] },
    {
      code: '17',
      title: 'PEKERJAAN APPROACH SLAB (PELAT INJAK)',
      level: 1,
      conditionalRule: { parameterId: 'has_approach_slab', operator: '==', value: true },
      children: [{ code: '17.01', title: 'Pengecoran Pelat Injak Beton Bertulang t=20cm Mencegah Penurunan Oprit', level: 2 }]
    },
    { code: '18', title: 'PEKERJAAN DRAINASE JEMBATAN', level: 1, children: [{ code: '18.01', title: 'Drain Hole Pipa Pembuangan Air Hujan Galvanis D3 Inch Melalui Sayap', level: 2 }] },
    { code: '19', title: 'PEKERJAAN JALAN PENDEKAT (OPRIT JEMBATAN)', level: 1, children: [{ code: '19.01', title: 'Timbunan Pilihan Berbutir Oprit Jembatan & Pemadatan Kering', level: 2 }] },
    { code: '20', title: 'PEKERJAAN FINISHING & PERLINDUNGAN TEBING', level: 1, children: [{ code: '20.01', title: 'Pasangan Batu Bronjong / Rip-Rap Pelindung Abutment dari Gerusan Air', level: 2 }] },
    { code: '21', title: 'PEKERJAAN TESTING & PENGUJIAN BEBAN (LOAD TEST)', level: 1, children: [{ code: '21.01', title: 'Dynamic & Static Load Test Uji Lendutan Jembatan dengan Truk Berbeban', level: 2 }] },
    { code: '22', title: 'DOKUMEN AS-BUILT DRAWING & SERAH TERIMA', level: 1, children: [{ code: '22.01', title: 'Penyusunan Laporan Uji Kelayakan, As-Built Drawing & BAST', level: 2 }] }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
