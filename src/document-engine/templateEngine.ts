import type { DocumentDefinition, DocumentField, ProjectMasterData } from './types';
import type { DocumentSourceContext } from './documentData';

export interface TemplateVariableMeta {
  path: string;
  label: string;
  sourceType: 'AUTO' | 'USER' | 'OPTIONAL';
  description: string;
  example?: string;
}

export const VARIABLE_REGISTRY: Record<string, TemplateVariableMeta> = {
  'project.name': { path: 'project.name', label: 'Nama Proyek / Pekerjaan', sourceType: 'AUTO', description: 'Nama pekerjaan konstruksi dari master proyek' },
  'project.number': { path: 'project.number', label: 'Nomor Proyek', sourceType: 'AUTO', description: 'Nomor kode registrasi proyek' },
  'project.location': { path: 'project.location', label: 'Lokasi Proyek', sourceType: 'AUTO', description: 'Lokasi geografis/alamat proyek' },
  'project.owner': { path: 'project.owner', label: 'Pemilik Proyek (Owner)', sourceType: 'AUTO', description: 'Nama instansi atau pemilik pekerjaan' },
  'project.contractor': { path: 'project.contractor', label: 'Kontraktor Pelaksana', sourceType: 'AUTO', description: 'Nama kontraktor/perusahaan pelaksana' },
  'project.value': { path: 'project.value', label: 'Nilai Kontrak / Proyek', sourceType: 'AUTO', description: 'Nilai total kontrak atau pagu proyek' },
  'project.duration': { path: 'project.duration', label: 'Waktu Pelaksanaan', sourceType: 'AUTO', description: 'Durasi waktu pekerjaan' },
  'project.startDate': { path: 'project.startDate', label: 'Tanggal Mulai', sourceType: 'AUTO', description: 'Tanggal mulai pelaksanaan' },
  'project.endDate': { path: 'project.endDate', label: 'Tanggal Selesai', sourceType: 'AUTO', description: 'Tanggal target penyelesaian' },

  'rab.grandTotal': { path: 'rab.grandTotal', label: 'Total Nilai RAB (Rp)', sourceType: 'AUTO', description: 'Nilai total RAB dalam format rupiah terformat' },
  'rab.grandTotalInWords': { path: 'rab.grandTotalInWords', label: 'Total Nilai RAB (Terbilang)', sourceType: 'AUTO', description: 'Kalimat terbilang bahasa Indonesia untuk total RAB' },
  'rab.itemCount': { path: 'rab.itemCount', label: 'Jumlah Item RAB', sourceType: 'AUTO', description: 'Banyaknya baris item pekerjaan dalam RAB' },

  'boq.total': { path: 'boq.total', label: 'Total Nilai BOQ', sourceType: 'AUTO', description: 'Total nilai rekapitulasi BOQ' },
  'boq.itemCount': { path: 'boq.itemCount', label: 'Jumlah Item BOQ', sourceType: 'AUTO', description: 'Total kuantitas item pekerjaan pada BOQ' },

  'schedule.taskCount': { path: 'schedule.taskCount', label: 'Jumlah Aktivitas Jadwal', sourceType: 'AUTO', description: 'Banyaknya aktivitas jadwal konstruksi' },
  'schedule.durationWeeks': { path: 'schedule.durationWeeks', label: 'Durasi Jadwal (Minggu)', sourceType: 'AUTO', description: 'Estimasi durasi total dalam satuan minggu' },

  'company.name': { path: 'company.name', label: 'Nama Perusahaan', sourceType: 'AUTO', description: 'Nama legal perusahaan kontraktor' },
  'company.address': { path: 'company.address', label: 'Alamat Perusahaan', sourceType: 'AUTO', description: 'Alamat domisili legal perusahaan' },
  'company.phone': { path: 'company.phone', label: 'Telepon Perusahaan', sourceType: 'AUTO', description: 'Nomor telepon kontak perusahaan' },
  'company.email': { path: 'company.email', label: 'Email Perusahaan', sourceType: 'AUTO', description: 'Alamat surat elektronik resmi' },

  'signatory.name': { path: 'signatory.name', label: 'Nama Penandatangan', sourceType: 'USER', description: 'Nama lengkap penandatangan dokumen' },
  'signatory.position': { path: 'signatory.position', label: 'Jabatan Penandatangan', sourceType: 'USER', description: 'Jabatan resmi penandatangan (misal: Direktur Utama)' },

  'recipient.name': { path: 'recipient.name', label: 'Nama Penerima Dokumen', sourceType: 'USER', description: 'Nama lengkap pihak yang dituju' },
  'recipient.position': { path: 'recipient.position', label: 'Jabatan Penerima', sourceType: 'USER', description: 'Jabatan pihak yang dituju' },
  'recipient.organization': { path: 'recipient.organization', label: 'Instansi / Lembaga Penerima', sourceType: 'USER', description: 'Nama instansi penerima surat' },
  'recipient.address': { path: 'recipient.address', label: 'Alamat Penerima', sourceType: 'OPTIONAL', description: 'Alamat instansi penerima surat' },

  'letter.number': { path: 'letter.number', label: 'Nomor Surat', sourceType: 'USER', description: 'Nomor surat penawaran atau pengantar resmi' },
  'letter.attachment': { path: 'letter.attachment', label: 'Lampiran', sourceType: 'OPTIONAL', description: 'Keterangan lampiran berkas' },
  'letter.subject': { path: 'letter.subject', label: 'Perihal Surat', sourceType: 'OPTIONAL', description: 'Subjek atau perihal surat' },
  'letter.date': { path: 'letter.date', label: 'Tanggal Surat', sourceType: 'AUTO', description: 'Tanggal pembuatan dokumen' },
};

/**
 * Robust Indonesian Currency "Terbilang" Converter
 * Converts numeric amounts into formal Indonesian words, e.g. 1.250.000.000 -> "Satu Miliar Dua Ratus Lima Puluh Juta Rupiah"
 */
export function numberToWordsRupiah(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
  if (isNaN(num) || num === 0) return 'Nol Rupiah';

  const units = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function convert(n: number): string {
    n = Math.floor(n);
    if (n === 0) return '';
    if (n < 12) return units[n];
    if (n < 20) return (convert(n - 10) + ' Belas').trim();
    if (n < 100) return (convert(Math.floor(n / 10)) + ' Puluh ' + convert(n % 10)).trim();
    if (n < 200) return ('Seratus ' + convert(n - 100)).trim();
    if (n < 1000) return (convert(Math.floor(n / 100)) + ' Ratus ' + convert(n % 100)).trim();
    if (n < 2000) return ('Seribu ' + convert(n - 1000)).trim();
    if (n < 1000000) return (convert(Math.floor(n / 1000)) + ' Ribu ' + convert(n % 1000)).trim();
    if (n < 1000000000) return (convert(Math.floor(n / 1000000)) + ' Juta ' + convert(n % 1000000)).trim();
    if (n < 1000000000000) return (convert(Math.floor(n / 1000000000)) + ' Miliar ' + convert(n % 1000000000)).trim();
    return (convert(Math.floor(n / 1000000000000)) + ' Triliun ' + convert(n % 1000000000000)).trim();
  }

  const rounded = Math.round(Math.abs(num));
  const words = convert(rounded).replace(/\s+/g, ' ').trim();
  return `${words} Rupiah`;
}

/**
 * Formats numeric currency to standard Indonesian Rupiah string
 */
export function formatRupiah(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
  if (isNaN(n)) return 'Rp 0';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

export interface TemplateContext {
  project: Record<string, any>;
  rab: Record<string, any>;
  boq: Record<string, any>;
  schedule: Record<string, any>;
  company: Record<string, any>;
  signatory: Record<string, any>;
  recipient: Record<string, any>;
  letter: Record<string, any>;
}

/**
 * Builds the canonical variable context from existing EZRAB project and source data
 */
export function buildTemplateContext(
  sourceContext: DocumentSourceContext,
  userValues: Record<string, any> = {}
): TemplateContext {
  const master = sourceContext.master || ({} as ProjectMasterData);
  const rabItems = sourceContext.rabItems || [];
  const scheduleTasks = sourceContext.scheduleTasks || [];

  // 1. Calculate RAB Grand Total
  let totalRab = 0;
  if (rabItems.length > 0) {
    totalRab = rabItems.reduce((sum, item: any) => {
      const val = Number(item.totalPrice ?? item.amount ?? (Number(item.volume || 0) * Number(item.unitPrice || 0)));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  } else if (master.contractValue) {
    const raw = typeof master.contractValue === 'number' ? master.contractValue : parseFloat(String(master.contractValue).replace(/[^0-9.-]/g, ''));
    totalRab = isNaN(raw) ? 0 : raw;
  }

  const rabInWords = numberToWordsRupiah(totalRab);
  const formattedRab = formatRupiah(totalRab);

  // 2. Schedule metadata
  const taskCount = scheduleTasks.length;
  let durationWeeks = 0;
  if (scheduleTasks.length > 0) {
    const maxEndWeek = Math.max(...scheduleTasks.map((t: any) => Number(t.endWeek || t.durationWeeks || 0)));
    durationWeeks = maxEndWeek > 0 ? maxEndWeek : Math.ceil(scheduleTasks.length * 1.5);
  }

  const todayStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

  return {
    project: {
      name: master.projectName || '—',
      number: master.projectNumber || '—',
      location: master.location || (master as any).address || '—',
      owner: master.owner || '—',
      contractor: master.contractor || master.companyName || '—',
      value: formattedRab,
      duration: master.duration || '—',
      startDate: master.startDate || '—',
      endDate: master.endDate || '—',
      tenderNumber: master.tenderNumber || master.projectNumber || '—',
    },
    rab: {
      grandTotal: formattedRab,
      grandTotalNumeric: totalRab,
      grandTotalInWords: rabInWords,
      itemCount: rabItems.length,
    },
    boq: {
      total: formattedRab,
      itemCount: rabItems.length,
    },
    schedule: {
      taskCount,
      durationWeeks,
    },
    company: {
      name: master.companyName || master.contractor || '—',
      address: master.companyAddress || '—',
      phone: master.companyPhone || '—',
      email: master.companyEmail || '—',
    },
    signatory: {
      name: userValues['signatory.name'] || userValues['signatory'] || userValues['director'] || master.director || '',
      position: userValues['signatory.position'] || userValues['position'] || 'Direktur Utama',
    },
    recipient: {
      name: userValues['recipient.name'] || userValues['recipientName'] || '',
      position: userValues['recipient.position'] || userValues['recipientPosition'] || '',
      organization: userValues['recipient.organization'] || userValues['organization'] || master.owner || '',
      address: userValues['recipient.address'] || userValues['recipientAddress'] || master.location || '',
    },
    letter: {
      number: userValues['letter.number'] || userValues['documentNumber'] || userValues['letterNumber'] || '',
      attachment: userValues['letter.attachment'] || userValues['attachment'] || '1 (satu) Berkas',
      subject: userValues['letter.subject'] || userValues['subject'] || 'Penawaran Pekerjaan',
      date: userValues['letter.date'] || todayStr,
    },
  };
}

export interface TemplateResolutionResult {
  text: string;
  missingVariables: string[];
  resolvedValues: Record<string, string>;
}

/**
 * Safe controlled template evaluator
 * Resolves dot-notation {{domain.property}} and legacy {{UPPERCASE}} variables without eval/Function
 */
export function resolveTemplateVariables(
  templateBody: string,
  context: TemplateContext,
  userValues: Record<string, any> = {}
): TemplateResolutionResult {
  if (!templateBody) {
    return { text: '', missingVariables: [], resolvedValues: {} };
  }

  const missingVariables: string[] = [];
  const resolvedValues: Record<string, string> = {};

  // Legacy uppercase aliases mapping
  const legacyAliasMap: Record<string, string> = {
    PROJECT_NAME: 'project.name',
    PROJECT_NUMBER: 'project.number',
    PROJECT_LOCATION: 'project.location',
    LOCATION: 'project.location',
    OWNER: 'project.owner',
    CONTRACTOR: 'project.contractor',
    CONTRACT_VALUE: 'project.value',
    PROJECT_DURATION: 'project.duration',
    START_DATE: 'project.startDate',
    END_DATE: 'project.endDate',
    TENDER_NUMBER: 'project.tenderNumber',
    COMPANY_NAME: 'company.name',
    COMPANY_ADDRESS: 'company.address',
    COMPANY_PHONE: 'company.phone',
    COMPANY_EMAIL: 'company.email',
    DIRECTOR: 'signatory.name',
    SIGNATORY_NAME: 'signatory.name',
    SIGNATORY_POSITION: 'signatory.position',
    RAB_GRAND_TOTAL: 'rab.grandTotal',
    RAB_TERBILANG: 'rab.grandTotalInWords',
  };

  const regex = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

  const resolvedText = templateBody.replace(regex, (match, rawKey: string) => {
    let key = rawKey.trim();
    if (legacyAliasMap[key]) {
      key = legacyAliasMap[key];
    }

    // Direct lookup in userValues first
    if (userValues[key] !== undefined && userValues[key] !== null && String(userValues[key]).trim() !== '') {
      const val = String(userValues[key]);
      resolvedValues[key] = val;
      return val;
    }

    // Dot-notation navigation in context
    const parts = key.split('.');
    let cur: any = context;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) {
        cur = cur[p];
      } else {
        cur = undefined;
        break;
      }
    }

    if (cur !== undefined && cur !== null && String(cur).trim() !== '') {
      const val = String(cur);
      resolvedValues[key] = val;
      return val;
    }

    // Variable not resolved
    missingVariables.push(key);
    return `[${key}]`;
  });

  return {
    text: resolvedText,
    missingVariables: Array.from(new Set(missingVariables)),
    resolvedValues,
  };
}

export interface ClassifiedDocumentFields {
  autoFields: DocumentField[];
  userFields: DocumentField[];
  optionalFields: DocumentField[];
}

/**
 * Classifies document fields into AUTO, USER, and OPTIONAL based on the 3-type rule (Section 7)
 */
export function classifyDocumentFields(definition: DocumentDefinition): ClassifiedDocumentFields {
  const autoFields: DocumentField[] = [];
  const userFields: DocumentField[] = [];
  const optionalFields: DocumentField[] = [];

  // If definition already has explicit classification, use them
  if (definition.userFields && definition.userFields.length > 0) {
    return {
      autoFields: definition.fields.filter(f => f.sourceType === 'AUTO' || (!f.sourceType && ['projectName', 'owner', 'contractor', 'location'].includes(f.id))),
      userFields: definition.userFields,
      optionalFields: definition.optionalFields || [],
    };
  }

  for (const field of definition.fields) {
    const st = field.sourceType;
    if (st === 'USER') {
      userFields.push(field);
    } else if (st === 'OPTIONAL') {
      optionalFields.push(field);
    } else if (st === 'AUTO') {
      autoFields.push(field);
    } else {
      // Default heuristic by field ID
      if (['projectName', 'owner', 'contractor', 'location', 'documentNumber', 'revision'].includes(field.id)) {
        autoFields.push({ ...field, sourceType: 'AUTO' });
      } else if (field.required) {
        userFields.push({ ...field, sourceType: 'USER' });
      } else {
        optionalFields.push({ ...field, sourceType: 'OPTIONAL' });
      }
    }
  }

  return { autoFields, userFields, optionalFields };
}
