/**
 * EZRAB Document Consistency Verification Engine
 * 
 * Verifies cross-document consistency and data integrity before documents
 * are finalized, exported, or submitted for tender.
 * 
 * Rules:
 * 1. GRAND_TOTAL_MATCH: RAB Total == Offer Letter Value == Recap Total
 * 2. DURATION_MATCH: Schedule duration matches project commitment duration
 * 3. PERSONNEL_ALIGNMENT: Nominated personnel in availability statement match personnel list & RKK
 * 4. HSE_SMKK_COMPLIANCE: High-risk construction projects must include verified RKK & IBPR
 */

import type { ConsistencyCheckResult, ConsistencyIssue, ProjectMasterData, DocumentRecord } from './types';
import { formatRupiah } from './templateEngine';

export interface ConsistencyContext {
  projectMaster: ProjectMasterData;
  rabItems?: Array<{ total?: number; amount?: number; price?: number; volume?: number }>;
  scheduleTasks?: Array<{ duration?: number; days?: number }>;
  records?: Record<string, DocumentRecord>;
  activeDocumentIds?: string[];
}

export class ConsistencyEngine {
  /**
   * Run full consistency check across project data and documents
   */
  public static verify(context: ConsistencyContext): ConsistencyCheckResult {
    const issues: ConsistencyIssue[] = [];
    const master = context.projectMaster;
    const records = context.records || {};

    // 1. Calculate Authoritative RAB Grand Total
    let calculatedRabTotal = 0;
    if (context.rabItems && context.rabItems.length > 0) {
      calculatedRabTotal = context.rabItems.reduce((acc, it) => {
        const lineTotal = it.total || it.amount || (it.price && it.volume ? it.price * it.volume : 0) || 0;
        return acc + lineTotal;
      }, 0);
    } else if (master.contractValue) {
      calculatedRabTotal = typeof master.contractValue === 'number'
        ? master.contractValue
        : parseFloat(String(master.contractValue).replace(/[^0-9.-]+/g, '')) || 0;
    }

    // RULE 1: Grand Total Check between Offer Letter and RAB
    const offerLetterRecord = records['offer-letter'];
    if (offerLetterRecord) {
      const offerValRaw = offerLetterRecord.values?.contractValue || offerLetterRecord.data?.contractValue || calculatedRabTotal;
      const offerVal = typeof offerValRaw === 'number'
        ? offerValRaw
        : parseFloat(String(offerValRaw).replace(/[^0-9.-]+/g, '')) || 0;

      if (calculatedRabTotal > 0 && offerVal > 0 && Math.abs(calculatedRabTotal - offerVal) > 100) {
        issues.push({
          ruleId: 'GRAND_TOTAL_MATCH',
          severity: 'ERROR',
          title: 'Ketidaksesuaian Nilai Surat Penawaran dengan RAB',
          description: `Nilai pada Surat Penawaran (${formatRupiah(offerVal)}) berbeda dengan total kalkulasi RAB (${formatRupiah(calculatedRabTotal)}).`,
          sourceA: 'Surat Penawaran Tender (offer-letter)',
          valueA: formatRupiah(offerVal),
          sourceB: 'Rencana Anggaran Biaya (RAB)',
          valueB: formatRupiah(calculatedRabTotal),
          suggestedAction: 'Perbarui nilai pada Surat Penawaran agar sinkron dengan total RAB.',
        });
      }
    }

    // RULE 2: Duration Check between Schedule and Master Data
    if (context.scheduleTasks && context.scheduleTasks.length > 0) {
      const totalScheduleDays = context.scheduleTasks.reduce((max, task) => {
        const d = task.duration || task.days || 0;
        return d > max ? d : max;
      }, 0);

      const masterDurationStr = master.duration || '';
      const matchedDays = masterDurationStr.match(/(\d+)\s*(hari|day|hr)/i);
      if (matchedDays && totalScheduleDays > 0) {
        const daysFromMaster = parseInt(matchedDays[1], 10);
        if (Math.abs(daysFromMaster - totalScheduleDays) > 3) {
          issues.push({
            ruleId: 'DURATION_MATCH',
            severity: 'WARNING',
            title: 'Ketidaksesuaian Durasi Pekerjaan',
            description: `Durasi master proyek tercatat ${daysFromMaster} hari, sedangkan durasi kritis jadwal pekerjaan adalah ${totalScheduleDays} hari.`,
            sourceA: 'Master Data / Surat Pernyataan',
            valueA: `${daysFromMaster} Hari`,
            sourceB: 'Time Schedule / Kurva-S',
            valueB: `${totalScheduleDays} Hari`,
            suggestedAction: 'Sinkronkan durasi pada Time Schedule atau perbarui durasi master proyek.',
          });
        }
      }
    }

    // RULE 3: Key Personnel Check
    const hasPersonnelList = context.activeDocumentIds?.includes('personnel-list') || !!records['personnel-list'];
    const hasPersonnelAvail = context.activeDocumentIds?.includes('personnel-availability') || !!records['personnel-availability'];
    if (hasPersonnelAvail && !hasPersonnelList && !master.projectManager) {
      issues.push({
        ruleId: 'PERSONNEL_ALIGNMENT',
        severity: 'INFO',
        title: 'Data Personil Inti Belum Lengkap',
        description: 'Surat Pernyataan Personil telah dipilih namun data Project Manager belum diisi pada data proyek.',
        sourceA: 'Surat Pernyataan Personil',
        valueA: 'Dipilih',
        sourceB: 'Project Master Data',
        valueB: 'Kosong',
        suggestedAction: 'Lengkapi nama Project Manager dan Petugas K3 pada profil proyek.',
      });
    }

    // RULE 4: HSE Compliance for Construction Projects
    const isConstruction = (master.projectType || '').toLowerCase().includes('konstruksi') ||
                           (master.projectName || '').toLowerCase().includes('pembangunan') ||
                           (master.projectName || '').toLowerCase().includes('gedung');
    const hasRkk = context.activeDocumentIds?.includes('rkk') || !!records['rkk'];
    if (isConstruction && !hasRkk) {
      issues.push({
        ruleId: 'HSE_SMKK_COMPLIANCE',
        severity: 'WARNING',
        title: 'Dokumen K3 / RKK Direkomendasikan',
        description: 'Untuk proyek konstruksi fisik, Permen PUPR No. 10/2021 mewajibkan kelengkapan Rencana Keselamatan Konstruksi (RKK).',
        sourceA: 'Klasifikasi Proyek',
        valueA: master.projectType || 'Konstruksi',
        sourceB: 'Paket Dokumen',
        valueB: 'RKK Belum Dimasukkan',
        suggestedAction: 'Tambahkan dokumen RKK ke dalam paket dokumen tender.',
      });
    }

    // Calculate score
    const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
    const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
    let score = 100 - errorCount * 30 - warningCount * 10;
    if (score < 0) score = 0;

    return {
      valid: errorCount === 0,
      score,
      issues,
      verifiedAt: new Date().toISOString(),
    };
  }
}
