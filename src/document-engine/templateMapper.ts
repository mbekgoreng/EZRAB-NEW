import type { DocumentBlock, ParagraphBlock } from './canonicalDocument';

/**
 * Standard dictionary for automatic placeholder inference
 */
const AUTO_MAPPING_DICTIONARY: Record<string, string> = {
  'nama pekerjaan': 'project.name',
  'nama proyek': 'project.name',
  'paket pekerjaan': 'project.name',
  'pekerjaan': 'project.name',
  'lokasi': 'project.location',
  'lokasi pekerjaan': 'project.location',
  'lokasi proyek': 'project.location',
  'nilai rab': 'rab.grandTotal',
  'nilai penawaran': 'rab.grandTotal',
  'total biaya': 'rab.grandTotal',
  'harga penawaran': 'rab.grandTotal',
  'terbilang': 'rab.grandTotalInWords',
  'waktu pelaksanaan': 'project.duration',
  'durasi': 'project.duration',
  'jangka waktu': 'project.duration',
  'nomor surat': 'letter.number',
  'no surat': 'letter.number',
  'tanggal': 'letter.date',
  'tanggal surat': 'letter.date',
  'nama penerima': 'recipient.name',
  'penerima': 'recipient.name',
  'jabatan penerima': 'recipient.position',
  'instansi penerima': 'recipient.organization',
  'perusahaan penerima': 'recipient.organization',
  'nama direktur': 'signatory.name',
  'penandatangan': 'signatory.name',
  'nama penandatangan': 'signatory.name',
  'direktur': 'signatory.name',
  'jabatan': 'signatory.position',
  'jabatan direktur': 'signatory.position',
  'kontraktor': 'company.name',
  'nama perusahaan': 'company.name',
  'perusahaan': 'company.name',
  'alamat perusahaan': 'company.address',
  'telepon perusahaan': 'company.phone',
  'email perusahaan': 'company.email',
  'pemilik pekerjaan': 'project.owner',
  'owner': 'project.owner',
};

/**
 * Controlled variable options available in EZRAB for manual selection
 */
export const AVAILABLE_CANONICAL_VARIABLES: Array<{
  category: string;
  variables: Array<{ path: string; label: string; example?: string }>;
}> = [
  {
    category: 'Project',
    variables: [
      { path: 'project.name', label: 'Nama Pekerjaan', example: 'Rumah Tinggal 2 Lantai' },
      { path: 'project.location', label: 'Lokasi Proyek', example: 'Probolinggo' },
      { path: 'project.duration', label: 'Waktu Pelaksanaan', example: '120 Hari Kalender' },
      { path: 'project.owner', label: 'Pemilik Pekerjaan', example: 'Dinas PUPR' },
    ],
  },
  {
    category: 'RAB',
    variables: [
      { path: 'rab.grandTotal', label: 'Nilai Total Penawaran', example: 'Rp 150.281.473' },
      { path: 'rab.grandTotalInWords', label: 'Terbilang Nilai Total', example: 'Seratus Lima Puluh Juta...' },
    ],
  },
  {
    category: 'Perusahaan',
    variables: [
      { path: 'company.name', label: 'Nama Perusahaan Kontraktor', example: 'PT. Mandiri Jaya' },
      { path: 'company.address', label: 'Alamat Perusahaan', example: 'Jl. Pemuda No. 45' },
      { path: 'company.phone', label: 'Telepon Perusahaan', example: '031-1234567' },
      { path: 'company.email', label: 'Email Perusahaan', example: 'info@mandiri.co.id' },
      { path: 'company.npwp', label: 'NPWP Perusahaan', example: '01.234.567.8-901.000' },
      { path: 'company.bank', label: 'Rekening Bank', example: 'Bank Mandiri 142-00-1234567-8' },
    ],
  },
  {
    category: 'Penandatangan',
    variables: [
      { path: 'signatory.name', label: 'Nama Penandatangan / Direktur', example: 'Ir. Budi Santoso' },
      { path: 'signatory.position', label: 'Jabatan Penandatangan', example: 'Direktur Utama' },
    ],
  },
  {
    category: 'Dokumen',
    variables: [
      { path: 'letter.number', label: 'Nomor Surat', example: '012/SPH/AKM/IV/2026' },
      { path: 'letter.date', label: 'Tanggal Surat', example: '21 April 2026' },
    ],
  },
  {
    category: 'Penerima',
    variables: [
      { path: 'recipient.name', label: 'Nama Penerima', example: 'Pejabat Pembuat Komitmen' },
      { path: 'recipient.position', label: 'Jabatan Penerima', example: 'Kepala Satker' },
      { path: 'recipient.organization', label: 'Instansi / Perusahaan Penerima', example: 'Dinas PUPR Kab. Probolinggo' },
    ],
  },
];

/**
 * Suggest canonical EZRAB variable for a raw placeholder string (e.g. [NAMA PEKERJAAN])
 */
export function suggestVariableMapping(rawPlaceholder: string): string | undefined {
  const clean = rawPlaceholder
    .replace(/[\[\]\{\}]/g, '')
    .trim()
    .toLowerCase();

  // 1. Direct dictionary match
  if (AUTO_MAPPING_DICTIONARY[clean]) {
    return AUTO_MAPPING_DICTIONARY[clean];
  }

  // 2. Partial inclusion match
  for (const [key, val] of Object.entries(AUTO_MAPPING_DICTIONARY)) {
    if (clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }

  return undefined;
}

/**
 * Apply variable mapping to canonical document blocks
 * Replaces bracket placeholders [RAW] with canonical {{variable.path}} tokens without eval
 */
export function applyVariableMapping(
  blocks: DocumentBlock[],
  mapping: Record<string, string>
): DocumentBlock[] {
  return blocks.map((block) => {
    if (block.type === 'paragraph') {
      let content = block.content;
      for (const [rawPlaceholder, canonicalVar] of Object.entries(mapping)) {
        if (!canonicalVar) continue;
        const targetToken = `{{${canonicalVar}}}`;
        content = content.split(rawPlaceholder).join(targetToken);
      }
      return { ...block, content };
    }
    if (block.type === 'heading') {
      let text = block.text;
      for (const [rawPlaceholder, canonicalVar] of Object.entries(mapping)) {
        if (!canonicalVar) continue;
        const targetToken = `{{${canonicalVar}}}`;
        text = text.split(rawPlaceholder).join(targetToken);
      }
      return { ...block, text };
    }
    return block;
  });
}
