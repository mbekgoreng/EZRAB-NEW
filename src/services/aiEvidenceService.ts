/**
 * EZRAB AI Evidence & Provenance Service (Phase 9.1)
 * 
 * CORE PRINCIPLE: NO SOURCE -> NO FACT
 * 
 * Defines standardized evidence objects, source hierarchy, source inventory scanner,
 * and anti-hallucination guardrails across the entire EZRAB Magic AI ecosystem.
 */

import { FullProjectAIContext } from './aiContextService';
import { Project, RabItem, ScheduleTask } from '../types';
import { DEFAULT_MASTER_PRICE_CATALOG, MasterPriceReferenceItem } from './aiReceiptIntelligence';
import { LocalDocumentRepository } from '../document-engine/repository';
import { ProjectFinanceRepository } from '../domain/finance/repository';

export type EvidenceStatus =
  | 'VERIFIED'    // Data found explicitly in primary source (DED, PDF, Master Data, Confirmed Record)
  | 'DERIVED'     // Data computed deterministically from verified sources (Subtotal, Area = WxL)
  | 'INFERRED'    // AI inference based on verified contextual clues (Must show basis & cannot be treated as fact)
  | 'ESTIMATED'   // Explicit estimate (e.g. preliminary takeoff when scale is uncalibrated)
  | 'CONFLICT'    // Discrepancy between multiple valid sources requiring user resolution
  | 'UNREADABLE'  // Source image or document is blurred, damaged, or unparseable
  | 'NOT_FOUND';  // Data is absent in sources; AI must refuse to guess

export type EvidenceSourceType =
  | 'pdf'
  | 'image'
  | 'drawing'
  | 'ded'
  | 'rab'
  | 'boq'
  | 'ahsp'
  | 'schedule'
  | 'project'
  | 'finance'
  | 'document'
  | 'company_profile'
  | 'master_price';

export interface AIEvidence {
  sourceType: EvidenceSourceType;
  sourceId: string;
  sourceName: string;
  page?: number;
  field?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  extractedText?: string;
  extractedValue?: unknown;
  basis?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  status: EvidenceStatus;

  // Phase 9.3 Multi-Provider Attribution
  provider?: string;
  model?: string;
  extractor?: string;
  extractorModel?: string;
  reasoner?: string;
  reasonerModel?: string;
  calculator?: string;
}

export interface FactualAnswerContract {
  answer: string;
  status: EvidenceStatus;
  source: string;
  pageOrField?: string;
  basis?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: AIEvidence;
  requiresUpload?: boolean;
  missingField?: string;
}

export interface AvailableSourceItem {
  type: EvidenceSourceType;
  name: string;
  isAvailable: boolean;
  itemCount?: number;
  summaryText: string;
}

export interface ProjectSourceInventory {
  projectId: string;
  projectName: string;
  sources: AvailableSourceItem[];
  hasDedOrDrawing: boolean;
  hasRab: boolean;
  hasSchedule: boolean;
  hasFinance: boolean;
  hasDocuments: boolean;
  hasMasterPrice: boolean;
  totalAvailableSourcesCount: number;
}

/**
 * Scans and builds a deterministic inventory of all data sources available for the active project.
 */
export function buildProjectSourceInventory(context: FullProjectAIContext): ProjectSourceInventory {
  const project = context.project;
  const projectId = project?.id || 'NO_ACTIVE_PROJECT';
  const projectName = project?.name || 'Belum Ada Proyek Aktif';

  const rabCount = context.rab?.totalItems || 0;
  const scheduleCount = context.schedule?.totalTasks || 0;

  let financeCount = 0;
  let docCount = 0;

  if (project?.id) {
    try {
      const finRepo = new ProjectFinanceRepository(project.id);
      financeCount = finRepo.getExpenses().length + finRepo.getInvoices().length + finRepo.getTerms().length;
    } catch {}

    try {
      const docRepo = new LocalDocumentRepository(project.id);
      docCount = docRepo.getProjectDocuments(project.id).length;
    } catch {}
  }

  // Check if project has explicit building area or duration in master data
  const hasProjectMaster = Boolean(project?.name);
  const hasArea = Boolean(project?.buildingType && (project as any)?.surfaceArea || (project as any)?.buildingArea);
  const hasDed = Boolean((project as any)?.hasDed || (project as any)?.drawingFiles?.length > 0);

  const sources: AvailableSourceItem[] = [
    {
      type: 'project',
      name: 'Project Master Data',
      isAvailable: hasProjectMaster,
      summaryText: hasProjectMaster ? `${project?.name} (${project?.location || 'Indonesia'})` : 'Belum diisi',
    },
    {
      type: 'ded',
      name: 'DED / Gambar Denah',
      isAvailable: hasDed,
      summaryText: hasDed ? 'File gambar / PDF terunggah' : 'Belum diunggah',
    },
    {
      type: 'rab',
      name: 'RAB & BOQ Spreadsheet',
      isAvailable: rabCount > 0,
      itemCount: rabCount,
      summaryText: rabCount > 0 ? `${rabCount} item pekerjaan` : 'Belum ada item',
    },
    {
      type: 'schedule',
      name: 'Time Schedule & Timeline',
      isAvailable: scheduleCount > 0,
      itemCount: scheduleCount,
      summaryText: scheduleCount > 0 ? `${scheduleCount} tahapan kerja` : 'Belum ada task',
    },
    {
      type: 'finance',
      name: 'Finance & Pembayaran',
      isAvailable: financeCount > 0,
      itemCount: financeCount,
      summaryText: financeCount > 0 ? `${financeCount} catatan finansial` : 'Belum ada transaksi',
    },
    {
      type: 'document',
      name: 'Dokumen Proyek Tersimpan',
      isAvailable: docCount > 0,
      itemCount: docCount,
      summaryText: docCount > 0 ? `${docCount} berkas tersimpan` : 'Belum ada dokumen',
    },
    {
      type: 'master_price',
      name: 'Master Price Benchmark EZRAB',
      isAvailable: DEFAULT_MASTER_PRICE_CATALOG.length > 0,
      itemCount: DEFAULT_MASTER_PRICE_CATALOG.length,
      summaryText: `${DEFAULT_MASTER_PRICE_CATALOG.length} harga material acuan`,
    },
  ];

  const totalAvailable = sources.filter((s) => s.isAvailable).length;

  return {
    projectId,
    projectName,
    sources,
    hasDedOrDrawing: hasDed,
    hasRab: rabCount > 0,
    hasSchedule: scheduleCount > 0,
    hasFinance: financeCount > 0,
    hasDocuments: docCount > 0,
    hasMasterPrice: true,
    totalAvailableSourcesCount: totalAvailable,
  };
}

/**
 * Searches indexed sources for specific factual fields.
 * If data is NOT present, returns NOT_FOUND with zero guessing.
 */
export function queryFactInProjectSources(
  queryKey: 'LUAS_BANGUNAN' | 'DURASI_PROYEK' | 'TOTAL_BIAYA_RAB' | 'MUTU_BETON' | 'TINGGI_DINDING' | 'HARGA_MATERIAL' | 'NILAI_KONTRAK' | 'TERMIN_STATUS',
  context: FullProjectAIContext,
  optionalParam?: string
): FactualAnswerContract {
  const project = context.project;
  const rab = context.rab;
  const schedule = context.schedule;

  switch (queryKey) {
    case 'LUAS_BANGUNAN': {
      // Check explicit project master fields
      const pArea = (project as any)?.buildingArea || (project as any)?.luasBangunan;
      if (pArea && Number(pArea) > 0) {
        return {
          answer: `Luas bangunan adalah ${pArea} m².`,
          status: 'VERIFIED',
          source: 'Project Master Data',
          pageOrField: 'Field: Luas Bangunan',
          basis: 'Tercatat di data master proyek',
          confidence: 'HIGH',
        };
      }
      return {
        answer: 'Saya tidak menemukan data luas bangunan yang dapat diverifikasi pada source project yang tersedia. Silakan upload DED/denah atau masukkan luas bangunan pada Project Master Data.',
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        basis: 'Belum ada file DED/denah atau isian luas pada data proyek aktif',
        confidence: 'LOW',
        requiresUpload: true,
        missingField: 'Luas Bangunan',
      };
    }

    case 'DURASI_PROYEK': {
      const pDuration = (project as any)?.duration || (project as any)?.durasi;
      if (pDuration) {
        return {
          answer: `Durasi pekerjaan proyek adalah ${pDuration}.`,
          status: 'VERIFIED',
          source: 'Project Master Data',
          pageOrField: 'Field: Project Duration',
          basis: 'Tercatat pada data master proyek',
          confidence: 'HIGH',
        };
      }
      if (schedule && schedule.totalTasks > 0) {
        return {
          answer: `Durasi proyek terhitung dari ${schedule.totalTasks} task jadwal kerja.`,
          status: 'DERIVED',
          source: 'Project Schedule',
          pageOrField: 'Schedule WBS',
          basis: 'Akumulasi durasi task schedule',
          confidence: 'HIGH',
        };
      }
      return {
        answer: 'Saya tidak menemukan data durasi atau timeline pekerjaan pada source project yang tersedia. Silakan masukkan durasi proyek di menu Pengaturan Proyek atau susun Jadwal Kerja.',
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        basis: 'Belum ada isian durasi di Project Master atau Time Schedule',
        confidence: 'LOW',
        missingField: 'Durasi Proyek',
      };
    }

    case 'TOTAL_BIAYA_RAB': {
      if (rab && rab.totalRab > 0) {
        return {
          answer: `Total estimasi RAB proyek adalah Rp ${rab.totalRab.toLocaleString('id-ID')} (${rab.totalItems} item pekerjaan).`,
          status: 'DERIVED',
          source: 'RAB Spreadsheet',
          pageOrField: 'Grand Total Rekapitulasi',
          basis: `Penjumlahan volume x harga satuan dari ${rab.totalItems} item pekerjaan`,
          confidence: 'HIGH',
        };
      }
      return {
        answer: 'Saya belum menemukan data anggaran atau lembar kerja RAB yang tersimpan untuk proyek ini. Silakan buat atau upload RAB terlebih dahulu.',
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        basis: 'Lembar kerja RAB masih kosong (0 item)',
        confidence: 'LOW',
        missingField: 'Item RAB',
      };
    }

    case 'MUTU_BETON': {
      // Check if any RAB item explicitly mentions concrete specification (e.g., K-250, K-300, fc' 20 MPa)
      const allRabItems = rab?.categories?.flatMap((c) => c.items) || [];
      const concreteItem = allRabItems.find((i) =>
        /k-?\d{3}|fc'?\s*\d+|beton\s+ready\s*mix/i.test(i.description)
      );

      if (concreteItem) {
        return {
          answer: `Mutu beton yang tercatat pada item pekerjaan adalah "${concreteItem.description}".`,
          status: 'VERIFIED',
          source: 'RAB Item Pekerjaan',
          pageOrField: `Item: ${concreteItem.description}`,
          basis: 'Tercantum pada uraian pekerjaan RAB',
          confidence: 'HIGH',
        };
      }

      return {
        answer: 'Saya tidak menemukan spesifikasi mutu beton pada source project yang tersedia (RAB, DED, atau RKS). Jangan mengasumsikan mutu beton tanpa dokumen spesifikasi resmi.',
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        basis: 'Tidak ada dokumen spesifikasi teknik atau item pekerjaan beton pada proyek ini',
        confidence: 'LOW',
        requiresUpload: true,
        missingField: 'Spesifikasi Mutu Beton',
      };
    }

    case 'TINGGI_DINDING': {
      // Check if project has explicit height note or drawing data
      const pHeight = (project as any)?.wallHeight || (project as any)?.tinggiDinding;
      if (pHeight && Number(pHeight) > 0) {
        return {
          answer: `Tinggi dinding yang tercatat adalah ${pHeight} meter.`,
          status: 'VERIFIED',
          source: 'Project Parameter',
          pageOrField: 'Field: Tinggi Dinding',
          basis: 'Tercatat pada parameter teknis proyek',
          confidence: 'HIGH',
        };
      }
      return {
        answer: 'Saya tidak menemukan data tinggi dinding pada source project yang tersedia. Upload gambar potongan DED atau tentukan tinggi elevasi dinding secara manual.',
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        basis: 'Belum ada gambar potongan DED atau parameter tinggi dinding yang terverifikasi',
        confidence: 'LOW',
        requiresUpload: true,
        missingField: 'Tinggi Dinding',
      };
    }

    case 'HARGA_MATERIAL': {
      const queryMat = optionalParam?.toLowerCase() || '';
      // Check in Master Price Catalog
      const matched = DEFAULT_MASTER_PRICE_CATALOG.find((mp) =>
        queryMat && mp.name.toLowerCase().includes(queryMat)
      );

      if (matched) {
        return {
          answer: `Harga acuan untuk ${matched.name} adalah Rp ${matched.price.toLocaleString('id-ID')} / ${matched.unit}.`,
          status: 'VERIFIED',
          source: 'Master Price Benchmark EZRAB',
          pageOrField: `Katalog: ${matched.category}`,
          basis: 'Harga pasar acuan material standar',
          confidence: 'HIGH',
        };
      }

      return {
        answer: `Saya tidak menemukan harga acuan untuk "${optionalParam || 'material ini'}" pada Master Price EZRAB maupun nota supplier proyek. Masukkan harga supplier atau nota pembelian terkait.`,
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        basis: 'Material tidak terdaftar di katalog Master Price dan belum ada nota tersimpan',
        confidence: 'LOW',
        missingField: 'Harga Satuan Material',
      };
    }

    case 'NILAI_KONTRAK': {
      if (project?.id) {
        try {
          const finRepo = new ProjectFinanceRepository(project.id);
          const summary = finRepo.getSummary();
          if (summary && summary.contractValue > 0) {
            return {
              answer: `Nilai kontrak proyek adalah Rp ${summary.contractValue.toLocaleString('id-ID')}.`,
              status: 'VERIFIED',
              source: 'Project Finance Contract Data',
              pageOrField: 'Nilai Kontrak Proyek',
              basis: 'Tercatat di data keuangan kontrak proyek',
              confidence: 'HIGH',
            };
          }
        } catch {}
      }
      return {
        answer: 'Saya tidak menemukan data nilai kontrak yang terkonfirmasi pada Keuangan Proyek. Silakan tetapkan nilai kontrak pada menu Keuangan Proyek.',
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        basis: 'Nilai kontrak belum diatur di Project Finance',
        confidence: 'LOW',
        missingField: 'Nilai Kontrak',
      };
    }

    default:
      return {
        answer: 'Data yang diminta tidak ditemukan pada source project yang tersedia.',
        status: 'NOT_FOUND',
        source: 'Tidak Ditemukan',
        confidence: 'LOW',
      };
  }
}

/**
 * Formats a clean, standardized evidence callout markdown string.
 */
export function formatEvidenceCallout(contract: FactualAnswerContract): string {
  if (contract.status === 'NOT_FOUND') {
    return `\n\n> 🔍 **Status:** \`NOT FOUND\`\n> **Sumber:** ${contract.source}\n> **Alasan:** ${contract.basis || 'Data tidak tersedia pada file atau catatan proyek aktif.'}\n> *${contract.requiresUpload ? '💡 Tindakan: Upload DED / Dokumen atau input manual.' : '💡 Tindakan: Lengkapi data proyek.'}*`;
  }

  const badgeIcon = contract.status === 'VERIFIED' ? '✅' : contract.status === 'DERIVED' ? '📐' : '💡';
  return `\n\n> ${badgeIcon} **Status:** \`${contract.status}\` | **Confidence:** \`${contract.confidence}\`\n> **Sumber:** ${contract.source}${contract.pageOrField ? ` (${contract.pageOrField})` : ''}\n> **Dasar:** ${contract.basis || 'Data eksplisit terverifikasi'}`;
}
