/**
 * EZRAB CORE AI — SELF-REVIEW ENGINE
 * 
 * Performs automated audits of construction work items, QTO, AHSP matches,
 * price resolutions, and arithmetic consistency.
 * Enables self-correcting retry loops within configured limits.
 */

import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';
import { constructionVocabulary } from './constructionVocabulary';
import { RabItem } from '../../../types';

export interface AuditFinding {
  itemId: string;
  itemName: string;
  type:
    | 'MISSING_AHSP'
    | 'MISSING_QTO'
    | 'MISSING_PRICE'
    | 'UNIT_MISMATCH'
    | 'DUPLICATE_ITEM'
    | 'ARITHMETIC_INCONSISTENCY'
    | 'UNVERIFIED_AHSP'
    | 'PRICE_UNRESOLVED';
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  suggestedAction: string;
}

export interface SelfReviewReport {
  totalItems: number;
  readyItemsCount: number;
  needsReviewCount: number;
  findings: AuditFinding[];
  isPassed: boolean;
  summaryText: string;
}

export class SelfReviewEngine {
  private static instance: SelfReviewEngine | null = null;

  private constructor() {}

  public static getInstance(): SelfReviewEngine {
    if (!SelfReviewEngine.instance) {
      SelfReviewEngine.instance = new SelfReviewEngine();
    }
    return SelfReviewEngine.instance;
  }

  /**
   * Performs automated audit over an array of items.
   */
  public auditItems(items: Array<Partial<RabItem> & { name?: string; description?: string; volume?: number | null; unitPrice?: number | null; ahspCode?: string; unit?: string }>): SelfReviewReport {
    const findings: AuditFinding[] = [];
    const seenNames = new Set<string>();
    let readyCount = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const name = (it.description || it.name || `Item-${idx + 1}`).trim();
      const lowerName = name.toLowerCase();

      let hasCritical = false;

      // 1. Check Duplicates
      if (seenNames.has(lowerName)) {
        findings.push({
          itemId: String(it.id || idx),
          itemName: name,
          type: 'DUPLICATE_ITEM',
          severity: 'WARNING',
          message: `Item pekerjaan "${name}" terduplikasi pada daftar estimasi.`,
          suggestedAction: 'Gabungkan volume item yang sama atau perjelas spesifikasi lokasi.',
        });
      }
      seenNames.add(lowerName);

      // 2. Check Missing Quantity
      if (it.volume === null || it.volume === undefined || it.volume <= 0) {
        findings.push({
          itemId: String(it.id || idx),
          itemName: name,
          type: 'MISSING_QTO',
          severity: 'CRITICAL',
          message: `Volume pekerjaan belum tersedia atau bernilai <= 0.`,
          suggestedAction: 'Hitung dimensi geometri via calculate_volume tool.',
        });
        hasCritical = true;
      }

      // 3. Check Missing AHSP
      const ahspCode = (it.ahspCode || it.code || '').trim();
      if (!ahspCode) {
        findings.push({
          itemId: String(it.id || idx),
          itemName: name,
          type: 'MISSING_AHSP',
          severity: 'CRITICAL',
          message: 'Kode analisa AHSP belum dipetakan.',
          suggestedAction: 'Jalankan search_ahsp tool untuk mencocokkan analisa PUPR 2026.',
        });
        hasCritical = true;
      } else if (ahspCode.startsWith('AI-CUSTOM')) {
        findings.push({
          itemId: String(it.id || idx),
          itemName: name,
          type: 'UNVERIFIED_AHSP',
          severity: 'CRITICAL',
          message: `Kode AHSP "${ahspCode}" adalah AI-CUSTOM tidak resmi.`,
          suggestedAction: 'Ganti dengan kode resmi dari katalog PUPR 2026.',
        });
        hasCritical = true;
      }

      // 4. Check Missing Price
      if (it.unitPrice === null || it.unitPrice === undefined || it.unitPrice <= 0) {
        findings.push({
          itemId: String(it.id || idx),
          itemName: name,
          type: 'MISSING_PRICE',
          severity: 'CRITICAL',
          message: 'Harga satuan pekerjaan belum teresolusi (Rp 0 atau null).',
          suggestedAction: 'Jalankan resolve_project_price tool atau lengkapi HSD regional.',
        });
        hasCritical = true;
      }

      // 5. Check Arithmetic Consistency
      if (it.volume && it.unitPrice && it.amount) {
        const expected = SafeDecimalEngine.safeMultiply(it.volume, it.unitPrice, 2);
        const diff = Math.abs(expected - it.amount);
        if (diff > 1.0) {
          findings.push({
            itemId: String(it.id || idx),
            itemName: name,
            type: 'ARITHMETIC_INCONSISTENCY',
            severity: 'CRITICAL',
            message: `Aritmatika total (Rp ${it.amount}) berbeda dengan Volume x Harga Satuan (Rp ${expected}).`,
            suggestedAction: 'Koreksi perhitungan dengan SafeDecimalEngine.',
          });
          hasCritical = true;
        }
      }

      if (!hasCritical) {
        readyCount++;
      }
    }

    const needsReview = items.length - readyCount;
    const isPassed = findings.filter(f => f.severity === 'CRITICAL').length === 0;

    let summaryText = `Audit selesai: ${readyCount} dari ${items.length} item dinyatakan READY FOR RAB.`;
    if (needsReview > 0) {
      summaryText += ` Ditemukan ${needsReview} item yang membutuhkan review/penyempurnaan data.`;
    }

    return {
      totalItems: items.length,
      readyItemsCount: readyCount,
      needsReviewCount: needsReview,
      findings,
      isPassed,
      summaryText,
    };
  }
}

export const selfReviewEngine = SelfReviewEngine.getInstance();
