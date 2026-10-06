import { ConstructionProjectTemplate } from '../../types';

export const waterStructureTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-infra-water',
  name: 'Bangunan Air, Saluran Irigasi & Drainase',
  code: 'INF-WTR-001',
  category: 'INFRASTRUCTURE',
  type: 'water-structure',
  version: '2.0.0',
  description: 'Template fleksibel untuk proyek ke-PU-an SDA: saluran irigasi primer/sekunder, gorong-gorong box culvert, drainase perkotaan U-ditch, kolam retensi / embung, dan pintu air bendung.',
  aliases: ['saluran air', 'irigasi', 'drainase', 'bangunan air', 'tanggul sungai', 'u ditch', 'bendung', 'embung', 'box culvert', 'gorong gorong', 'waduk', 'kolam retensi', 'intake air'],
  keywords: ['irigasi', 'saluran', 'drainase', 'u-ditch', 'bendung', 'embung', 'pasangan batu kali air', 'pintu air', 'sheet pile', 'box culvert', 'talud'],
  parameters: [
    { id: 'water_variant', name: 'Jenis Bangunan Air', type: 'SELECT', required: true, defaultValue: 'irrigation-channel', options: [
      { label: 'Saluran Irigasi Pasangan Batu / Beton', value: 'irrigation-channel' },
      { label: 'Drainase Perkotaan U-Ditch Precast', value: 'drainage' },
      { label: 'Gorong-gorong Box Culvert Silang Jalan', value: 'box-culvert' },
      { label: 'Embung / Kolam Retensi Penampung Banjir', value: 'reservoir' },
      { label: 'Bendung & Bangunan Sadap / Intake Air Baku', value: 'water-intake' },
      { label: 'Bangunan Air & Tanggul Sungai Umum', value: 'water-structure-general' }
    ], group: 'general' },
    { id: 'channel_length', name: 'Panjang Saluran / Struktur', type: 'NUMBER', required: true, defaultValue: 500, unit: 'm', min: 2, max: 50000, group: 'dimensions' },
    { id: 'channel_width', name: 'Lebar Bukaan / Penampang Basah', type: 'NUMBER', required: false, defaultValue: 1.2, unit: 'm', group: 'dimensions' },
    { id: 'channel_depth', name: 'Kedalaman / Tinggi Saluran', type: 'NUMBER', required: false, defaultValue: 1.0, unit: 'm', group: 'dimensions' },
    { id: 'water_flow_rate', name: 'Estimasi Debit Rencana (Q)', type: 'NUMBER', required: false, defaultValue: 2.5, unit: 'm³/detik', group: 'specifications' },
    { id: 'channel_material', name: 'Material Saluran', type: 'SELECT', required: false, defaultValue: 'pasangan_batu', options: [
      { label: 'Pasangan Batu Belah Kali Adukan 1:4', value: 'pasangan_batu' },
      { label: 'Beton Pracetak (Precast U-Ditch / Box)', value: 'precast' },
      { label: 'Beton Cor Insitu Bertulang K-225', value: 'cast_insitu' }
    ], group: 'specifications' },
    { id: 'has_sluice_gate', name: 'Memiliki Pintu Air Sorong Baja (Sluice Gate)', type: 'BOOLEAN', required: false, defaultValue: false, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'channel_material',
      condition: { parameterId: 'water_variant', operator: '==', value: 'drainage' },
      assumedValue: 'precast',
      confidence: 0.9,
      reasoning: 'Drainase perkotaan lazimnya menggunakan U-Ditch precast untuk efisiensi pemasangan jalan'
    }
  ],
  validationRules: [
    { id: 'VAL-WTR-1', name: 'Panjang Saluran Positif', severity: 'ERROR', expression: 'channel_length > 0', errorMessage: 'Panjang saluran air harus lebih dari 0 meter.' }
  ],
  quantityRules: [
    { wbsCode: '02.01', formula: 'channel_length * channel_width * channel_depth', unit: 'm³', variables: ['channel_length', 'channel_width', 'channel_depth'], description: 'Volume galian tanah saluran air' },
    { wbsCode: '03.01', formula: 'channel_length * (channel_width + channel_depth * 2)', unit: 'm²', variables: ['channel_length', 'channel_width', 'channel_depth'], description: 'Luas selimut pasangan batu atau precast' }
  ],
  wbsHierarchy: [
    { code: '01', title: 'PEKERJAAN PERSIAPAN & KISDAM (DEWATERING)', level: 1, children: [{ code: '01.01', title: 'Pembuatan Kisdam Karung Pasir / Terpal & Pompa Air Dewatering', level: 2 }, { code: '01.02', title: 'Pengukuran Bowplank & Penentuan Kemiringan Hidrolik Saluran', level: 2 }] },
    { code: '02', title: 'PEKERJAAN TANAH DAN GALIAN SALURAN', level: 1, children: [{ code: '02.01', title: 'Galian Tanah Saluran Menggunakan Excavator & Manual Profile', level: 2 }, { code: '02.02', title: 'Perapihan Talud Saluran & Pembuangan Tanah Sisa Galian', level: 2 }, { code: '02.03', title: 'Pemadatan Tanah Dasar Saluran & Urugan Pasir Alas t=10cm', level: 2 }] },
    {
      code: '03',
      title: 'PEKERJAAN STRUKTUR DINDING & LINING SALURAN',
      level: 1,
      children: [
        {
          code: '03.01',
          title: 'Pasangan Batu Belah 1:4 Talud Saluran Irigasi + Siaran 1:2 & Suling Resapan',
          level: 2,
          conditionalRule: { parameterId: 'water_variant', operator: '==', value: 'irrigation-channel' }
        },
        {
          code: '03.02',
          title: 'Pemasangan Saluran U-Ditch Precast & Tutup Cover Slab Beton Beban Berat',
          level: 2,
          conditionalRule: { parameterId: 'water_variant', operator: '==', value: 'drainage' }
        },
        {
          code: '03.03',
          title: 'Pemasangan Box Culvert Precast Sambungan Spigot Socket Silang Jalan',
          level: 2,
          conditionalRule: { parameterId: 'water_variant', operator: '==', value: 'box-culvert' }
        },
        {
          code: '03.04',
          title: 'Galian Tanggul Kolam Retensi, Geotekstil Non-Woven & Paving Blok Perkuatan Lereng',
          level: 2,
          conditionalRule: { parameterId: 'water_variant', operator: '==', value: 'reservoir' }
        },
        {
          code: '03.05',
          title: 'Struktur Tubuh Bendung / Intake Beton Bertulang K-300 Tahan Erosi Air',
          level: 2,
          conditionalRule: { parameterId: 'water_variant', operator: '==', value: 'water-intake' }
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN PINTU AIR & MEKANIKAL HIDROLIK',
      level: 1,
      conditionalRule: { parameterId: 'has_sluice_gate', operator: '==', value: true },
      children: [
        { code: '04.01', title: 'Pengadaan Pintu Air Sorong Plat Baja Rangka UNP / WF Cat Marine Epoxy', level: 2 },
        { code: '04.02', title: 'Stang Drat Ulir Kuningan, Roda Gigi Putar (Gearbox) & Dudukan Pintu Air', level: 2 },
        { code: '04.03', title: 'Saringan Sampah Trash Rack Jeruji Besi Kisi-kisi Pencegah Sumbatan', level: 2 }
      ]
    },
    { code: '05', title: 'PEKERJAAN FINISHING & UJI ALIRAN AIR', level: 1, children: [{ code: '05.01', title: 'Pembersihan Sedimen Endapan & Pembongkaran Kisdam Aliran', level: 2 }, { code: '05.02', title: 'Commissioning Uji Aliran Air Basah (Wet Test Run) & BAST', level: 2 }] }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
