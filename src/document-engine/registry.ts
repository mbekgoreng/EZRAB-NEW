import type { DocumentDefinition, DocumentField } from './types';

const autoField = (id: string, label: string, variable: string): DocumentField => ({
  id,
  label,
  type: 'text',
  required: true,
  variable,
  sourceType: 'AUTO',
});

const userField = (id: string, label: string, variable?: string, placeholder?: string, defaultValue?: any): DocumentField => ({
  id,
  label,
  type: 'text',
  required: true,
  variable,
  sourceType: 'USER',
  placeholder,
  defaultValue,
});

const optionalField = (id: string, label: string, variable?: string, placeholder?: string, defaultValue?: any): DocumentField => ({
  id,
  label,
  type: 'text',
  required: false,
  variable,
  sourceType: 'OPTIONAL',
  placeholder,
  defaultValue,
});

export const DOCUMENT_REGISTRY: DocumentDefinition[] = [
  // 1. Surat Penawaran Tender
  {
    id: 'offer-letter',
    code: 'TDR-ADM-001',
    name: 'Surat Penawaran Tender',
    category: 'ADMINISTRATION',
    description: 'Surat penawaran harga resmi untuk pelelangan/tender pekerjaan konstruksi.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    templateId: 'offer-letter',
    dependencies: ['project', 'rab'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('location', 'Lokasi Proyek', '{{project.location}}'),
      autoField('contractValue', 'Nilai Penawaran', '{{rab.grandTotal}}'),
      autoField('duration', 'Waktu Pelaksanaan', '{{project.duration}}'),
      autoField('contractor', 'Kontraktor', '{{company.name}}'),
      autoField('owner', 'Pemilik Pekerjaan', '{{project.owner}}'),
    ],
    autoVariables: [
      'project.name',
      'project.location',
      'rab.grandTotal',
      'rab.grandTotalInWords',
      'project.duration',
      'company.name',
      'project.owner',
      'letter.date',
    ],
    userFields: [
      userField('letter.date', 'Tanggal Surat', '{{letter.date}}', 'Tanggal dokumen'),
      userField('letter.number', 'Nomor Surat', '{{letter.number}}', 'Contoh: 012/SPH/AKM/IV/2026'),
      userField('signatory.name', 'Nama Direktur / Penandatangan', '{{signatory.name}}', 'Nama Lengkap Direktur'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Direktur Utama', 'Direktur Utama'),
      userField('recipient.name', 'Nama Penerima', '{{recipient.name}}', 'Pokja Pemilihan / PPK'),
      userField('recipient.position', 'Jabatan Penerima', '{{recipient.position}}', 'Ketua Pokja Pemilihan'),
      userField('recipient.organization', 'Instansi Penerima', '{{recipient.organization}}', 'Dinas / Kementerian'),
    ],
    optionalFields: [
      optionalField('recipient.address', 'Alamat Penerima', '{{recipient.address}}', 'Alamat lengkap instansi'),
      optionalField('letter.attachment', 'Lampiran', '{{letter.attachment}}', '1 (satu) Berkas Dokumen', '1 (satu) Berkas'),
      optionalField('letter.subject', 'Perihal Surat', '{{letter.subject}}', 'Penawaran Pekerjaan', 'Penawaran Pekerjaan'),
    ],
    templateBody: `Nomor: {{letter.number}}
Lampiran: {{letter.attachment}}
Perihal: {{letter.subject}}

Kepada Yth.
{{recipient.name}}
{{recipient.position}}
{{recipient.organization}}
{{recipient.address}}

Dengan hormat,

Sehubungan dengan pelelangan/permintaan penawaran pekerjaan:
Nama Pekerjaan : {{project.name}}
Lokasi         : {{project.location}}

Dengan ini kami mengajukan penawaran pekerjaan dengan total nilai sebesar:
{{rab.grandTotal}}
(Terbilang: {{rab.grandTotalInWords}})

Waktu pelaksanaan pekerjaan selama {{project.duration}} terhitung sejak diterbitkannya Surat Perintah Mulai Kerja (SPMK). Penawaran ini berlaku selama 60 (enam puluh) hari kalender sejak tanggal pembukaan dokumen penawaran.

Demikian surat penawaran ini kami sampaikan dengan penuh tanggung jawab atas kebenaran seluruh data.

Hormat kami,
{{company.name}}


{{signatory.name}}
{{signatory.position}}`,
  },

  // 2. Formulir Data Kualifikasi
  {
    id: 'qualification',
    code: 'TDR-ADM-002',
    name: 'Formulir Data Kualifikasi',
    category: 'ADMINISTRATION',
    description: 'Formulir isian kualifikasi badan usaha penyedia jasa konstruksi.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    templateId: 'qualification',
    dependencies: ['project'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('contractor', 'Nama Perusahaan', '{{company.name}}'),
      autoField('location', 'Alamat Domisili', '{{company.address}}'),
    ],
    autoVariables: ['project.name', 'company.name', 'company.address', 'company.phone', 'company.email'],
    userFields: [
      userField('signatory.name', 'Nama Pimpinan Perusahaan', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Direktur Utama', 'Direktur Utama'),
    ],
    optionalFields: [
      optionalField('license_number', 'Nomor SBU / NIB', undefined, 'Nomor Izin Usaha Konstruksi'),
    ],
  },

  // 3. Pakta Integritas
  {
    id: 'integrity-pact',
    code: 'TDR-ADM-003',
    name: 'Pakta Integritas',
    category: 'ADMINISTRATION',
    description: 'Surat pernyataan pakta integritas tender konstruksi.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    templateId: 'integrity-pact',
    dependencies: ['project'],
    fields: [
      autoField('projectName', 'Nama Paket Pekerjaan', '{{project.name}}'),
      autoField('contractor', 'Nama Perusahaan', '{{company.name}}'),
    ],
    autoVariables: ['project.name', 'company.name', 'letter.date'],
    userFields: [
      userField('signatory.name', 'Nama Penandatangan', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Direktur Utama', 'Direktur Utama'),
    ],
    optionalFields: [
      optionalField('id_card_number', 'Nomor KTP / NIK', undefined, 'Nomor Identitas Penandatangan'),
    ],
  },

  // 4. Surat Pernyataan Sedia Personil
  {
    id: 'personnel-availability',
    code: 'TDR-ADM-004',
    name: 'Surat Pernyataan Sedia Personil',
    category: 'ADMINISTRATION',
    description: 'Surat pernyataan ketersediaan tenaga ahli / personil manajerial proyek.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    existingModule: 'Personil',
    dependencies: ['project', 'personnel'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('contractor', 'Nama Perusahaan', '{{company.name}}'),
    ],
    autoVariables: ['project.name', 'company.name'],
    userFields: [
      userField('signatory.name', 'Nama Penandatangan', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Direktur Utama', 'Direktur Utama'),
    ],
    optionalFields: [
      optionalField('personnel_note', 'Catatan Personil', undefined, 'Keterangan mobilisasi personil'),
    ],
  },

  // 5. Surat Pernyataan Kompetensi
  {
    id: 'competency-statement',
    code: 'TDR-ADM-005',
    name: 'Surat Pernyataan Kompetensi',
    category: 'ADMINISTRATION',
    description: 'Pernyataan kemampuan teknis dan manajerial dalam melaksanakan pekerjaan.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    templateId: 'competency-statement',
    dependencies: ['project'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('contractor', 'Nama Perusahaan', '{{company.name}}'),
    ],
    autoVariables: ['project.name', 'company.name'],
    userFields: [
      userField('signatory.name', 'Nama Penandatangan', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Direktur Utama', 'Direktur Utama'),
    ],
  },

  // 6. Surat Pernyataan Kesanggupan
  {
    id: 'commitment-statement',
    code: 'TDR-ADM-006',
    name: 'Surat Pernyataan Kesanggupan',
    category: 'ADMINISTRATION',
    description: 'Pernyataan kesanggupan mematuhi jadwal, mutu, dan spesifikasi teknis.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    templateId: 'commitment-statement',
    dependencies: ['project'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('duration', 'Waktu Pelaksanaan', '{{project.duration}}'),
    ],
    autoVariables: ['project.name', 'project.duration', 'company.name'],
    userFields: [
      userField('signatory.name', 'Nama Penandatangan', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Direktur Utama', 'Direktur Utama'),
    ],
  },

  // 7. Metode Pelaksanaan
  {
    id: 'execution-method',
    code: 'TDR-TEC-001',
    name: 'Metode Pelaksanaan',
    category: 'TECHNICAL',
    description: 'Dokumen penjelasan tahapan dan metode pelaksanaan teknis pekerjaan.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    existingModule: 'Metode Pelaksanaan',
    dependencies: ['project'],
    fields: [
      autoField('projectName', 'Nama Pekerjaan', '{{project.name}}'),
      autoField('location', 'Lokasi', '{{project.location}}'),
      autoField('duration', 'Durasi Pekerjaan', '{{project.duration}}'),
    ],
    autoVariables: ['project.name', 'project.location', 'project.duration', 'company.name'],
    userFields: [
      userField('signatory.name', 'Penyusun / Site Manager', '{{signatory.name}}', 'Nama Site Manager / Project Manager'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Site Manager', 'Site Manager'),
    ],
    optionalFields: [
      optionalField('method_scope', 'Lingkup Pekerjaan Utama', undefined, 'Uraian ringkas divisi pekerjaan'),
      optionalField('traffic_management', 'Manajemen Lalu Lintas & Lingkungan', undefined, 'Penanganan akses dan material'),
    ],
    templateBody: `DOKUMEN METODE PELAKSANAAN PEKERJAAN

Proyek       : {{project.name}}
Lokasi       : {{project.location}}
Waktu        : {{project.duration}}
Kontraktor   : {{company.name}}

1. PENDAHULUAN
Metode pelaksanaan ini disusun sebagai acuan kerja operasional di lapangan guna menjamin mutu, waktu, biaya, serta keselamatan kerja sesuai standar teknis yang disyaratkan.

2. TAHAPAN PELAKSANAAN UTAMA
A. Pekerjaan Persiapan (Mobilisasi, Pengukuran, Keselamatan K3)
B. Pekerjaan Struktur dan Pondasi
C. Pekerjaan Arsitektur dan Finishing
D. Pekerjaan Mekanikal, Elektrikal, dan Plumbing (MEP)
E. Uji Fungsi (Commissioning) dan Pembersihan Akhir

Disusun oleh,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },

  // 8. Daftar Alat & Personil
  {
    id: 'personnel-list',
    code: 'TDR-TEC-002',
    name: 'Daftar Alat & Personil',
    category: 'TECHNICAL',
    description: 'Daftar rincian ketersediaan personil ahli dan alat utama proyek.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX', 'XLSX'],
    existingModule: 'Daftar Alat dan Personil',
    dependencies: ['project', 'personnel', 'equipment'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('location', 'Lokasi Proyek', '{{project.location}}'),
    ],
    autoVariables: ['project.name', 'project.location', 'company.name'],
    userFields: [
      userField('signatory.name', 'Penanggung Jawab Teknis', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Project Manager', 'Project Manager'),
    ],
  },

  // 9. Quality Plan
  {
    id: 'quality-plan',
    code: 'TDR-TEC-003',
    name: 'Quality Plan',
    category: 'TECHNICAL',
    description: 'Rencana kendali mutu dan pengujian material proyek konstruksi.',
    requirement: 'RECOMMENDED',
    supportedFormats: ['PDF', 'DOCX'],
    dependencies: ['project'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
    ],
    autoVariables: ['project.name', 'company.name'],
    userFields: [
      userField('signatory.name', 'Quality Control Inspector', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'QC Engineer', 'QC Engineer'),
    ],
  },

  // 10. BOQ (Bill of Quantities)
  {
    id: 'boq',
    code: 'TDR-COM-001',
    name: 'BOQ',
    category: 'COMMERCIAL',
    description: 'Daftar kuantitas dan harga satuan pekerjaan (Bill of Quantities).',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'XLSX'],
    existingModule: 'BOQ',
    dependencies: ['project', 'boq'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('location', 'Lokasi Proyek', '{{project.location}}'),
      autoField('contractValue', 'Total Nilai BOQ', '{{boq.total}}'),
    ],
    autoVariables: ['project.name', 'project.location', 'boq.total', 'boq.itemCount', 'company.name'],
    userFields: [
      userField('signatory.name', 'Penanggung Jawab Estimasi', '{{signatory.name}}', 'Nama Estimator / QS'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Quantity Surveyor', 'Quantity Surveyor'),
    ],
    optionalFields: [
      optionalField('tax_note', 'Keterangan Pajak', undefined, 'Harga termasuk PPN 11%', 'Termasuk PPN 11%'),
    ],
    templateBody: `DAFTAR KUANTITAS DAN HARGA (BILL OF QUANTITIES)

Pekerjaan       : {{project.name}}
Lokasi Proyek   : {{project.location}}
Total Nilai BOQ : {{boq.total}}
Penyedia Jasa   : {{company.name}}

Daftar kuantitas volume dan estimasi harga satuan pekerjaan disajikan lengkap pada tabel terlampir.

Dibuat oleh,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },

  // 11. RAB (Rencana Anggaran Biaya)
  {
    id: 'rab',
    code: 'TDR-COM-002',
    name: 'RAB',
    category: 'COMMERCIAL',
    description: 'Rencana Anggaran Biaya pekerjaan konstruksi lengkap.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'XLSX'],
    existingModule: 'RAB',
    dependencies: ['project', 'rab'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('location', 'Lokasi', '{{project.location}}'),
      autoField('contractValue', 'Grand Total RAB', '{{rab.grandTotal}}'),
    ],
    autoVariables: ['project.name', 'project.location', 'rab.grandTotal', 'rab.grandTotalInWords', 'rab.itemCount'],
    userFields: [
      userField('signatory.name', 'Dibuat Oleh', '{{signatory.name}}', 'Nama Estimator / Cost Engineer'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Estimator Proyek', 'Estimator Proyek'),
    ],
    optionalFields: [
      optionalField('checked_by', 'Diperiksa Oleh', undefined, 'Nama Project Manager'),
    ],
    templateBody: `RENCANA ANGGARAN BIAYA (RAB)

Nama Pekerjaan  : {{project.name}}
Lokasi Proyek   : {{project.location}}
Total Biaya     : {{rab.grandTotal}}
Terbilang       : {{rab.grandTotalInWords}}

Rincian harga satuan, uraian pekerjaan, koefisien, dan rekapitulasi total anggaran terlampir pada dokumen ini.

Disusun oleh,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },

  // 12. AHSP
  {
    id: 'ahsp',
    code: 'TDR-COM-003',
    name: 'AHSP',
    category: 'COMMERCIAL',
    description: 'Analisis Harga Satuan Pekerjaan (upah, bahan, alat).',
    requirement: 'CONDITIONAL',
    supportedFormats: ['PDF', 'XLSX'],
    existingModule: 'AHSP',
    dependencies: ['project', 'ahsp'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
    ],
    autoVariables: ['project.name', 'company.name'],
    userFields: [
      userField('signatory.name', 'Penyusun Analisis', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Cost Engineer', 'Cost Engineer'),
    ],
    templateBody: `ANALISIS HARGA SATUAN PEKERJAAN (AHSP)

Paket Pekerjaan : {{project.name}}
Pelaksana       : {{company.name}}

Analisis rincian komponen koefisien upah tenaga kerja, material bahan bangunan, dan sewa peralatan konstruksi tertera pada tabel AHSP terlampir.

Penyusun,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },

  // 13. Rekapitulasi Pekerjaan
  {
    id: 'recap',
    code: 'TDR-COM-004',
    name: 'Rekapitulasi Pekerjaan',
    category: 'COMMERCIAL',
    description: 'Rekapitulasi biaya total pekerjaan per divisi/sub-pekerjaan.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'XLSX'],
    existingModule: 'Rekapitulasi Pekerjaan',
    dependencies: ['project', 'rab'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('contractValue', 'Total Biaya', '{{rab.grandTotal}}'),
    ],
    autoVariables: ['project.name', 'rab.grandTotal', 'rab.grandTotalInWords'],
    userFields: [
      userField('signatory.name', 'Penanggung Jawab', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Direktur Utama', 'Direktur Utama'),
    ],
  },

  // 14. Bobot Pekerjaan
  {
    id: 'weight',
    code: 'TDR-COM-005',
    name: 'Bobot Pekerjaan',
    category: 'COMMERCIAL',
    description: 'Daftar bobot persentase item pekerjaan terhadap total kontrak.',
    requirement: 'RECOMMENDED',
    supportedFormats: ['PDF', 'XLSX'],
    existingModule: 'Bobot Pekerjaan',
    dependencies: ['project', 'rab'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
    ],
    autoVariables: ['project.name', 'rab.grandTotal'],
    userFields: [
      userField('signatory.name', 'Penyusun', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Site Engineer', 'Site Engineer'),
    ],
  },

  // 15. Time Schedule
  {
    id: 'schedule',
    code: 'TDR-SCH-001',
    name: 'Time Schedule',
    category: 'SCHEDULE',
    description: 'Jadwal pelaksanaan waktu pekerjaan konstruksi mingguan.',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'XLSX'],
    existingModule: 'Schedule',
    dependencies: ['project', 'schedule'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('duration', 'Waktu Pelaksanaan', '{{project.duration}}'),
    ],
    autoVariables: ['project.name', 'project.duration', 'schedule.taskCount', 'schedule.durationWeeks'],
    userFields: [
      userField('signatory.name', 'Scheduler / Project Manager', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Project Manager', 'Project Manager'),
    ],
    optionalFields: [
      optionalField('schedule_notes', 'Catatan Waktu Kritis (Critical Path)', undefined, 'Penjelasan tahapan kritis pelaksanaan'),
    ],
    templateBody: `JADWAL WAKTU PELAKSANAAN (TIME SCHEDULE)

Nama Pekerjaan  : {{project.name}}
Waktu Pelaksanaan: {{project.duration}}
Jumlah Aktivitas: {{schedule.taskCount}} Aktivitas

Matriks tahapan jadwal pelaksanaan pekerjaan dan alokasi durasi waktu terlampir secara sistematis.

Disetujui oleh,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },

  // 16. Kurva-S
  {
    id: 'curve-s',
    code: 'TDR-SCH-002',
    name: 'Kurva-S',
    category: 'SCHEDULE',
    description: 'Grafik Kurva-S progres rencana kumulatif berbasis Schedule dan RAB.',
    requirement: 'CONDITIONAL',
    supportedFormats: ['PDF', 'XLSX'],
    existingModule: 'Kurva-S',
    dependencies: ['project', 'schedule', 'kurva-s'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('contractValue', 'Nilai Kontrak', '{{rab.grandTotal}}'),
      autoField('duration', 'Durasi Waktu', '{{project.duration}}'),
    ],
    autoVariables: ['project.name', 'rab.grandTotal', 'project.duration', 'schedule.durationWeeks'],
    userFields: [
      userField('signatory.name', 'Disetujui Oleh', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Project Manager', 'Project Manager'),
    ],
    templateBody: `MONITORING RENCANA KURVA-S

Nama Pekerjaan    : {{project.name}}
Total Nilai Bobot : {{rab.grandTotal}}
Target Durasi     : {{project.duration}}

Grafik distribusi bobot mingguan dan persentase kumulatif rencana progres fisik disajikan pada diagram Kurva-S terlampir.

Disahkan oleh,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },

  // 17. RKK (Rencana Keselamatan Konstruksi)
  {
    id: 'rkk',
    code: 'TDR-HSE-001',
    name: 'RKK',
    category: 'HSE',
    description: 'Rencana Keselamatan Konstruksi (Sistem Manajemen Keselamatan Konstruksi).',
    requirement: 'CORE',
    supportedFormats: ['PDF', 'DOCX'],
    existingModule: 'RKK',
    dependencies: ['project', 'rkk'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('location', 'Lokasi Proyek', '{{project.location}}'),
    ],
    autoVariables: ['project.name', 'project.location', 'company.name'],
    userFields: [
      userField('signatory.name', 'Ahli K3 Konstruksi', '{{signatory.name}}', 'Nama Ahli K3'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'HSE Coordinator', 'HSE Coordinator'),
    ],
    optionalFields: [
      optionalField('rkk_policy', 'Pernyataan Kebijakan K3', undefined, 'Komitmen Manajemen terhadap Keselamatan Kerja'),
    ],
    templateBody: `RENCANA KESELAMATAN KONSTRUKSI (RKK)

Paket Pekerjaan : {{project.name}}
Lokasi Proyek   : {{project.location}}
Penyedia Jasa   : {{company.name}}

KEBIJAKAN KESELAMATAN KONSTRUKSI
Kami berkomitmen menerapkan Sistem Manajemen Keselamatan Konstruksi (SMKK) secara konsisten guna mencegah kecelakaan kerja, penyakit akibat kerja, serta melindungi seluruh tenaga kerja dan lingkungan proyek.

Disetujui oleh,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },

  // 18. IBPR (Identifikasi Bahaya dan Penilaian Risiko)
  {
    id: 'ibpr',
    code: 'TDR-HSE-002',
    name: 'IBPR',
    category: 'HSE',
    description: 'Tabel identifikasi bahaya, penilaian risiko, dan penetapan pengendalian.',
    requirement: 'CONDITIONAL',
    supportedFormats: ['PDF', 'XLSX'],
    dependencies: ['project'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
    ],
    autoVariables: ['project.name'],
    userFields: [
      userField('signatory.name', 'Petugas K3', '{{signatory.name}}'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'HSE Officer', 'HSE Officer'),
    ],
  },

  // 19. JSA (Job Safety Analysis)
  {
    id: 'jsa',
    code: 'TDR-HSE-003',
    name: 'JSA',
    category: 'HSE',
    description: 'Analisis keselamatan per langkah pekerjaan risiko tinggi.',
    requirement: 'CONDITIONAL',
    supportedFormats: ['PDF', 'DOCX', 'XLSX'],
    existingModule: 'JSA',
    dependencies: ['project', 'jsa'],
    fields: [
      autoField('projectName', 'Nama Proyek', '{{project.name}}'),
      autoField('location', 'Lokasi Proyek', '{{project.location}}'),
    ],
    autoVariables: ['project.name', 'project.location', 'company.name'],
    userFields: [
      userField('signatory.name', 'Penyusun JSA (Safety Officer)', '{{signatory.name}}', 'Nama Safety Officer'),
      userField('signatory.position', 'Jabatan', '{{signatory.position}}', 'Safety Officer', 'Safety Officer'),
      userField('reviewer_name', 'Diperiksa Oleh (Site Manager)', undefined, 'Nama Site Manager'),
    ],
    optionalFields: [
      optionalField('emergency_contact', 'Kontak Darurat Proyek', undefined, 'Nomor Telepon Emergency / RS Terdekat'),
    ],
    templateBody: `JOB SAFETY ANALYSIS (JSA)

Nama Pekerjaan  : {{project.name}}
Lokasi Proyek   : {{project.location}}
Penyedia Jasa   : {{company.name}}

Identifikasi potensi bahaya kerja, tahapan mitigasi risiko, serta alat pelindung diri (APD) tertera pada formulir matriks JSA terlampir.

Dibuat oleh,
{{company.name}}

{{signatory.name}}
{{signatory.position}}`,
  },
];

export const getDocumentDefinition = (id: string) => DOCUMENT_REGISTRY.find(d => d.id === id);

export const TENDER_PACKAGE_PRESETS = {
  ALL: [
    'offer-letter', 'qualification', 'integrity-pact', 'personnel-availability', 'commitment-statement',
    'execution-method', 'personnel-list', 'quality-plan', 'ibpr', 'jsa',
    'boq', 'rab', 'ahsp', 'recap', 'weight',
    'schedule', 'curve-s',
    'rkk'
  ],
  ADMINISTRATION: [
    'offer-letter', 'qualification', 'integrity-pact', 'personnel-availability', 'commitment-statement'
  ],
  TECHNICAL: [
    'execution-method', 'personnel-list', 'quality-plan', 'ibpr', 'jsa'
  ],
  COMMERCIAL: [
    'boq', 'rab', 'ahsp', 'recap', 'weight'
  ],
  COST: [
    'boq', 'rab', 'ahsp', 'recap', 'weight'
  ],
  SCHEDULE: [
    'schedule', 'curve-s'
  ],
  HSE: [
    'rkk'
  ]
} as const;

export type TenderPresetKey = keyof typeof TENDER_PACKAGE_PRESETS;

export const getPresetDocuments = (preset: TenderPresetKey): DocumentDefinition[] => {
  const ids = TENDER_PACKAGE_PRESETS[preset] || [];
  return ids.map(id => getDocumentDefinition(id)).filter(Boolean) as DocumentDefinition[];
};