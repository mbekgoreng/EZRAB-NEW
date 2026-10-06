import type { TemplateDefinition, FieldRequirementType, DocumentCategory } from './types';
import type { CanonicalDocument, DocumentBlock } from './canonicalDocument';

const STORAGE_KEY_CUSTOM_TEMPLATES = 'ezrab:custom_templates';

/**
 * Built-in EZRAB templates across document types
 */
export const BUILTIN_TEMPLATES: TemplateDefinition[] = [
  // 1. Surat Penawaran Standard
  {
    id: 'offer-letter-standard',
    documentType: 'offer-letter',
    name: 'Surat Penawaran Standard',
    description: 'Format penawaran harga standar komersial untuk proyek swasta & institusi.',
    category: 'ADMINISTRATION',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 12,
    fields: [
      { id: 'project.name', label: 'Nama Pekerjaan', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'project.location', label: 'Lokasi Proyek', type: 'AUTO', variable: '{{project.location}}' },
      { id: 'rab.grandTotal', label: 'Nilai Penawaran (RAB)', type: 'AUTO', variable: '{{rab.grandTotal}}' },
      { id: 'rab.grandTotalInWords', label: 'Terbilang', type: 'AUTO', variable: '{{rab.grandTotalInWords}}' },
      { id: 'letter.number', label: 'Nomor Surat', type: 'REQUIRED_USER', variable: '{{letter.number}}', placeholder: '012/SPH/AKM/IV/2026' },
      { id: 'letter.date', label: 'Tanggal Surat', type: 'REQUIRED_USER', variable: '{{letter.date}}' },
      { id: 'signatory.name', label: 'Nama Penandatangan (Direktur)', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
      { id: 'signatory.position', label: 'Jabatan Penandatangan', type: 'REQUIRED_USER', variable: '{{signatory.position}}', defaultValue: 'Direktur Utama' },
      { id: 'recipient.name', label: 'Nama Penerima', type: 'REQUIRED_USER', variable: '{{recipient.name}}', placeholder: 'Pejabat Pembuat Komitmen / Owner' },
      { id: 'recipient.position', label: 'Jabatan Penerima', type: 'OPTIONAL', variable: '{{recipient.position}}' },
      { id: 'recipient.organization', label: 'Instansi / Perusahaan Penerima', type: 'OPTIONAL', variable: '{{recipient.organization}}' },
      { id: 'project.duration', label: 'Waktu Pelaksanaan', type: 'OPTIONAL', variable: '{{project.duration}}' },
    ],
    body: `SURAT PENAWARAN HARGA

Nomor : {{letter.number}}
Lampiran : 1 (satu) Berkas
Perihal : Penawaran Harga Pekerjaan {{project.name}}

Kepada Yth.
{{recipient.name}}
{{recipient.position}}
{{recipient.organization}}
di Tempat

Dengan hormat,
Sehubungan dengan pengadaan pekerjaan konstruksi untuk {{project.name}} yang berlokasi di {{project.location}}, dengan ini kami mengajukan penawaran harga sebesar:

{{rab.grandTotal}}
(Terbilang: {{rab.grandTotalInWords}})

Waktu pelaksanaan pekerjaan diestimasikan selama {{project.duration}} kalender. Penawaran ini berlaku selama 30 (tiga puluh) hari kalender sejak tanggal diterbitkan.

Demikian surat penawaran ini kami sampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih.`,
  },

  // 2. Surat Penawaran Tender LPSE / Pemerintah
  {
    id: 'offer-letter-tender',
    documentType: 'offer-letter',
    name: 'Surat Penawaran Tender Pemerintah / LPSE',
    description: 'Format penawaran resmi standar pengadaan barang/jasa pemerintah sesuai LKPP & Permen PUPR.',
    category: 'ADMINISTRATION',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    usageCount: 8,
    fields: [
      { id: 'project.name', label: 'Paket Pekerjaan', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'project.location', label: 'Lokasi Pekerjaan', type: 'AUTO', variable: '{{project.location}}' },
      { id: 'rab.grandTotal', label: 'Total Penawaran Termasuk PPN', type: 'AUTO', variable: '{{rab.grandTotal}}' },
      { id: 'rab.grandTotalInWords', label: 'Terbilang', type: 'AUTO', variable: '{{rab.grandTotalInWords}}' },
      { id: 'letter.number', label: 'Nomor Surat Penawaran', type: 'REQUIRED_USER', variable: '{{letter.number}}' },
      { id: 'letter.date', label: 'Tanggal Dokumen', type: 'REQUIRED_USER', variable: '{{letter.date}}' },
      { id: 'signatory.name', label: 'Nama Direktur / Kuasa Direksi', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
      { id: 'signatory.position', label: 'Jabatan', type: 'REQUIRED_USER', variable: '{{signatory.position}}', defaultValue: 'Direktur Utama' },
      { id: 'recipient.name', label: 'Pokja Pemilihan / PPK', type: 'REQUIRED_USER', variable: '{{recipient.name}}' },
      { id: 'recipient.organization', label: 'Nama Lembaga Pengadaan', type: 'OPTIONAL', variable: '{{recipient.organization}}' },
      { id: 'tender.number', label: 'Nomor Pokja / Tender', type: 'OPTIONAL', variable: '{{tender.number}}' },
    ],
    body: `SURAT PENAWARAN TENDER

Nomor : {{letter.number}}
Lampiran : Dokumen Kualifikasi, Teknis, dan Biaya
Perihal : Penawaran Pekerjaan {{project.name}}

Kepada Yth.
Pokja Pemilihan / PPK: {{recipient.name}}
{{recipient.organization}}

Menanggapi pengumuman pelelangan pekerjaan {{project.name}}, setelah mempelajari dokumen tender serta berita acara penjelasan pekerjaan, kami yang bertanda tangan di bawah ini mengajukan penawaran harga sebesar:

{{rab.grandTotal}}
({{rab.grandTotalInWords}})

Kami menyatakan tunduk pada semua ketentuan pelelangan dan sanggup melaksanakan pekerjaan dengan penuh tanggung jawab.`,
  },

  // 3. Metode Pelaksanaan Standar
  {
    id: 'method-building',
    documentType: 'execution-method',
    name: 'Metode Pelaksanaan Pekerjaan Gedung',
    description: 'Uraian metode teknis tahapan konstruksi struktur, arsitektur, dan MEP gedung bertingkat.',
    category: 'TECHNICAL',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 6,
    fields: [
      { id: 'project.name', label: 'Nama Proyek', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'project.location', label: 'Lokasi Proyek', type: 'AUTO', variable: '{{project.location}}' },
      { id: 'signatory.name', label: 'Penanggung Jawab Teknis', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
      { id: 'signatory.position', label: 'Jabatan', type: 'REQUIRED_USER', variable: '{{signatory.position}}', defaultValue: 'Project Manager / Site Manager' },
    ],
    body: `METODE PELAKSANAAN PEKERJAAN GEDUNG

I. PENDAHULUAN & LINGKUP PEKERJAAN
Paket pekerjaan {{project.name}} dilaksanakan di {{project.location}}. Metode ini mencakup persiapan, mobilisasi sumber daya, pekerjaan struktur, dan finishing.

II. PEKERJAAN PERSIAPAN
- Pengukuran dan pemasangan bowplank
- Pembuatan kantor lapangan (direksi keet) dan gudang material
- Pengadaan sarana K3 dan rambu keselamatan

III. PEKERJAAN STRUKTUR
- Galian tanah dan pondasi sesuai gambar kerja
- Pekerjaan pembesian dan bekisting terkontrol
- Pengecoran beton dengan slump test berkala

IV. MANAJEMEN MUTU & K3
Seluruh pelaksanaan mengikuti SOP Keselamatan Kerja dan standar SNI.`,
  },

  // 4. BOQ Format Standar
  {
    id: 'boq-standard',
    documentType: 'boq',
    name: 'Bill of Quantities (BOQ) Standar',
    description: 'Daftar kuantitas dan volume pekerjaan terstruktur per divisi.',
    category: 'COMMERCIAL',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 15,
    fields: [
      { id: 'project.name', label: 'Nama Pekerjaan', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'project.location', label: 'Lokasi', type: 'AUTO', variable: '{{project.location}}' },
      { id: 'signatory.name', label: 'Estimator / Penanggung Jawab', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
    ],
    body: `BILL OF QUANTITIES (BOQ)
Proyek: {{project.name}}
Lokasi: {{project.location}}

Daftar kuantitas pekerjaan disusun berdasarkan gambar kerja dan spesifikasi teknis.`,
  },

  // 5. RAB Format Komersial
  {
    id: 'rab-standard',
    documentType: 'rab',
    name: 'Rencana Anggaran Biaya (RAB) Komersial',
    description: 'Rekapitulasi dan rincian biaya proyek termasuk harga satuan dan total anggaran.',
    category: 'COMMERCIAL',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 18,
    fields: [
      { id: 'project.name', label: 'Nama Pekerjaan', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'project.location', label: 'Lokasi', type: 'AUTO', variable: '{{project.location}}' },
      { id: 'rab.grandTotal', label: 'Total Biaya (RAB)', type: 'AUTO', variable: '{{rab.grandTotal}}' },
      { id: 'rab.grandTotalInWords', label: 'Terbilang', type: 'AUTO', variable: '{{rab.grandTotalInWords}}' },
      { id: 'signatory.name', label: 'Nama Direktur', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
    ],
    body: `RENCANA ANGGARAN BIAYA (RAB)
Proyek: {{project.name}}
Lokasi: {{project.location}}
Total Nilai: {{rab.grandTotal}}
(Terbilang: {{rab.grandTotalInWords}})`,
  },

  // 6. Rencana Keselamatan Konstruksi (RKK)
  {
    id: 'rkk-standard',
    documentType: 'rkk',
    name: 'Rencana Keselamatan Konstruksi (RKK) PUPR',
    description: 'Pedoman Sistem Manajemen Keselamatan Konstruksi (SMKK) standar Kementerian PUPR.',
    category: 'HSE',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 7,
    fields: [
      { id: 'project.name', label: 'Nama Pekerjaan', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'project.location', label: 'Lokasi', type: 'AUTO', variable: '{{project.location}}' },
      { id: 'signatory.name', label: 'Ahli K3 Konstruksi / PJT', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
    ],
    body: `RENCANA KESELAMATAN KONSTRUKSI (RKK)
Proyek: {{project.name}}
Lokasi: {{project.location}}

1. KEPEMIMPINAN DAN PARTISIPASI PEKERJA
2. PERENCANAAN KESELAMATAN KONSTRUKSI
3. DUKUNGAN KESELAMATAN KONSTRUKSI
4. OPERASI KESELAMATAN KONSTRUKSI
5. EVALUASI KINERJA KESELAMATAN KONSTRUKSI`,
  },

  // 7. Job Safety Analysis (JSA)
  {
    id: 'jsa-standard',
    documentType: 'jsa',
    name: 'Job Safety Analysis (JSA) Proyek',
    description: 'Identifikasi bahaya, analisis risiko, dan tindakan pengendalian setiap langkah kerja.',
    category: 'HSE',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 5,
    fields: [
      { id: 'project.name', label: 'Nama Proyek', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'signatory.name', label: 'Petugas K3 Lapangan', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
    ],
    body: `JOB SAFETY ANALYSIS (JSA)
Paket Pekerjaan: {{project.name}}
Pengawas Lapangan: {{signatory.name}}

Analisis potensi bahaya dan prosedur mitigasi risiko kerja di area proyek.`,
  },

  // 8. Time Schedule Mingguan
  {
    id: 'schedule-standard',
    documentType: 'schedule',
    name: 'Jadwal Pelaksanaan (Time Schedule)',
    description: 'Jadwal mingguan aktivitas konstruksi dan durasi pekerjaan.',
    category: 'SCHEDULE',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 11,
    fields: [
      { id: 'project.name', label: 'Nama Pekerjaan', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'project.duration', label: 'Waktu Pelaksanaan', type: 'AUTO', variable: '{{project.duration}}' },
      { id: 'signatory.name', label: 'Site Manager', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
    ],
    body: `JADWAL WAKTU PELAKSANAAN (TIME SCHEDULE)
Pekerjaan: {{project.name}}
Durasi: {{project.duration}}`,
  },

  // 9. Kurva-S Proyek
  {
    id: 'curve-s-standard',
    documentType: 'curve-s',
    name: 'Kurva-S & Rencana Progres Kumulatif',
    description: 'Kurva-S derived dari bobot biaya dan durasi jadwal pelaksanaan mingguan.',
    category: 'SCHEDULE',
    source: 'EZRAB',
    templateSource: 'BUILTIN',
    isDefault: true,
    usageCount: 9,
    fields: [
      { id: 'project.name', label: 'Nama Pekerjaan', type: 'AUTO', variable: '{{project.name}}' },
      { id: 'signatory.name', label: 'Project Director', type: 'REQUIRED_USER', variable: '{{signatory.name}}' },
    ],
    body: `KURVA-S RENCANA DAN REALISASI
Pekerjaan: {{project.name}}
Pemetaan bobot biaya mingguan dan rencana progres kumulatif 0% - 100%.`,
  },
];

/**
 * Template Repository Class
 * Handles built-in templates and user custom templates in localStorage
 */
export class TemplateRepository {
  private customTemplatesKey: string;

  constructor(scope: string = 'global') {
    this.customTemplatesKey = `${STORAGE_KEY_CUSTOM_TEMPLATES}:${scope}`;
  }

  /**
   * Get all templates available for a given document type
   */
  getTemplatesForDocument(documentType: string): TemplateDefinition[] {
    const builtins = BUILTIN_TEMPLATES.filter((t) => t.documentType === documentType);
    const customs = this.getCustomTemplates().filter((t) => t.documentType === documentType);
    return [...builtins, ...customs];
  }

  /**
   * Get default template for document type
   */
  getDefaultTemplate(documentType: string): TemplateDefinition | undefined {
    const templates = this.getTemplatesForDocument(documentType);
    return templates.find((t) => t.isDefault) || templates[0];
  }

  /**
   * Find template by ID (built-in or custom)
   */
  getTemplateById(templateId: string): TemplateDefinition | undefined {
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
    if (builtin) return builtin;
    const customs = this.getCustomTemplates();
    return customs.find((t) => t.id === templateId);
  }

  /**
   * Get user custom templates
   */
  getCustomTemplates(): TemplateDefinition[] {
    try {
      const raw = localStorage.getItem(this.customTemplatesKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Save user custom template
   */
  saveCustomTemplate(template: Omit<TemplateDefinition, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): TemplateDefinition {
    const customs = this.getCustomTemplates();
    const id = template.id || `custom_tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const existingIndex = customs.findIndex((t) => t.id === id);
    const newTemplate: TemplateDefinition = {
      ...template,
      id,
      source: 'USER',
      createdAt: existingIndex >= 0 ? customs[existingIndex].createdAt : now,
      updatedAt: now,
      usageCount: existingIndex >= 0 ? (customs[existingIndex].usageCount || 0) : 0,
    };

    if (existingIndex >= 0) {
      customs[existingIndex] = newTemplate;
    } else {
      customs.unshift(newTemplate);
    }

    try {
      localStorage.setItem(this.customTemplatesKey, JSON.stringify(customs));
    } catch (e) {
      console.error('Failed to persist custom template:', e);
    }

    return newTemplate;
  }

  /**
   * Record template usage (for recently used / popular ordering)
   */
  recordUsage(templateId: string): void {
    const customs = this.getCustomTemplates();
    const idx = customs.findIndex((t) => t.id === templateId);
    if (idx >= 0) {
      customs[idx].usageCount = (customs[idx].usageCount || 0) + 1;
      customs[idx].lastUsedAt = new Date().toISOString();
      try {
        localStorage.setItem(this.customTemplatesKey, JSON.stringify(customs));
      } catch (e) {
        console.error('Failed to update template usage:', e);
      }
    }
  }

  /**
   * Delete custom template
   */
  deleteCustomTemplate(templateId: string): boolean {
    const customs = this.getCustomTemplates();
    const filtered = customs.filter((t) => t.id !== templateId);
    if (filtered.length !== customs.length) {
      try {
        localStorage.setItem(this.customTemplatesKey, JSON.stringify(filtered));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
