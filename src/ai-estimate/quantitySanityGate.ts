/**
 * EZRAB AI ESTIMATE — Quantity Sanity & Gating Layer
 *
 * Sits directly between:
 * AI RAW QUANTITY → QUANTITY SANITY → ACCEPTED QUANTITY
 *
 * CRITICAL INVARIANTS:
 * 1. AI RAW Quantity is preserved for full auditability.
 * 2. Catastrophic / extreme quantities are marked BLOCKED_FROM_TOTAL.
 * 3. Extreme quantities NEVER auto-correct silently.
 * 4. Extreme items have subtotal = null and are STRICTLY excluded from the grand total.
 * 5. Extreme items MUST NEVER be given HIGH confidence.
 * 6. Missing quantity remains null (MISSING != ZERO).
 */

import {
  AiEstimateWorkItem,
  QuantitySanityStatus,
  AiEstimateWarning,
  QuantityTrace,
} from './types';

export interface QuantitySanityThreshold {
  keyword: string;
  expectedUnit: string;
  normalMin: number;
  normalMax: number;
  catastrophicLimit: number;
  description: string;
}

/**
 * Engineering boundary table based on real-world civil construction (Residential 1-2 story scale).
 * Exceeding catastrophicLimit causes immediate BLOCKED_FROM_TOTAL.
 */
export const QUANTITY_SANITY_THRESHOLDS: QuantitySanityThreshold[] = [
  {
    keyword: 'galian',
    expectedUnit: 'm³',
    normalMin: 5,
    normalMax: 150,
    catastrophicLimit: 500,
    description: 'Pekerjaan galian tanah pondasi rumah tinggal biasanya 15-80 m³',
  },
  {
    keyword: 'urugan',
    expectedUnit: 'm³',
    normalMin: 2,
    normalMax: 80,
    catastrophicLimit: 300,
    description: 'Pekerjaan urugan tanah kembali biasanya 5-40 m³',
  },
  {
    keyword: 'pondasi',
    expectedUnit: 'm³',
    normalMin: 5,
    normalMax: 80,
    catastrophicLimit: 250,
    description: 'Volume pondasi batu kali rumah tinggal biasanya 15-50 m³',
  },
  {
    keyword: 'sloof',
    expectedUnit: 'm³',
    normalMin: 0.5,
    normalMax: 15,
    catastrophicLimit: 50,
    description: 'Volume beton sloof rumah tinggal biasanya 1-5 m³',
  },
  {
    keyword: 'ring',
    expectedUnit: 'm³',
    normalMin: 0.5,
    normalMax: 15,
    catastrophicLimit: 50,
    description: 'Volume beton ring balk rumah tinggal biasanya 1-4 m³',
  },
  {
    keyword: 'kolom',
    expectedUnit: 'm³',
    normalMin: 0.5,
    normalMax: 20,
    catastrophicLimit: 60,
    description: 'Volume beton kolom rumah tinggal biasanya 1-6 m³',
  },
  {
    keyword: 'dinding',
    expectedUnit: 'm²',
    normalMin: 30,
    normalMax: 600,
    catastrophicLimit: 1500,
    description: 'Luas pasangan dinding rumah 1-2 lantai biasanya 80-350 m²',
  },
  {
    keyword: 'plester',
    expectedUnit: 'm²',
    normalMin: 60,
    normalMax: 1200,
    catastrophicLimit: 3000,
    description: 'Luas plesteran dinding rumah tinggal biasanya 160-700 m²',
  },
  {
    keyword: 'acian',
    expectedUnit: 'm²',
    normalMin: 60,
    normalMax: 1200,
    catastrophicLimit: 3000,
    description: 'Luas acian dinding rumah tinggal biasanya 160-700 m²',
  },
  {
    keyword: 'cat',
    expectedUnit: 'm²',
    normalMin: 50,
    normalMax: 1200,
    catastrophicLimit: 3000,
    description: 'Luas pengecatan dinding/plafon biasanya 100-700 m²',
  },
  {
    keyword: 'plafon',
    expectedUnit: 'm²',
    normalMin: 20,
    normalMax: 300,
    catastrophicLimit: 1000,
    description: 'Luas plafon rumah tinggal biasanya setara luas lantai 40-150 m²',
  },
  {
    keyword: 'keramik',
    expectedUnit: 'm²',
    normalMin: 10,
    normalMax: 300,
    catastrophicLimit: 1000,
    description: 'Luas penutup lantai keramik biasanya setara luas ruangan 30-150 m²',
  },
];

export class QuantitySanityGate {
  /**
   * Applies engineering sanity check and gating to all items.
   * Modifies items in-place to populate:
   * - rawQuantity (preserved)
   * - acceptedQuantity (null if blocked)
   * - quantity (effective quantity for calculations = acceptedQuantity)
   * - quantityStatus ('ACCEPTED' | 'BLOCKED_FROM_TOTAL' | 'SUSPICIOUS' | 'UNRESOLVED')
   * - blockingReason
   * - quantityTrace
   */
  public static evaluateAll(items: AiEstimateWorkItem[]): void {
    for (const item of items) {
      this.evaluateItem(item);
    }
  }

  /**
   * Evaluate a single work item against physical engineering sanity bounds.
   */
  public static evaluateItem(item: AiEstimateWorkItem): void {
    // 1. Preserve raw quantity
    if (item.rawQuantity === undefined || item.rawQuantity === null) {
      item.rawQuantity = item.quantity;
    }

    // 1b. Sync item & workName & specification
    item.item = item.item || item.workName || '';
    item.workName = item.workName || item.item || '';
    item.specification = item.specification || item.description || '';

    const rawQty = item.rawQuantity;
    const nameLower = (item.workName || item.item || '').toLowerCase();
    const unitLower = (item.unit || '').toLowerCase().trim();

    // 2. Case: Missing / null quantity
    if (rawQty === null || isNaN(rawQty) || rawQty <= 0) {
      item.quantityStatus = 'UNRESOLVED';
      item.status = 'UNRESOLVED';
      item.acceptedQuantity = null;
      item.quantity = null;
      item.blockingReason = 'Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY)';
      item.confidence = 'LOW';
      item.quantityTrace = {
        raw: 'Tidak ditemukan dimensi lengkap di DED',
        normalized: 'null',
        formula: 'N/A',
        result: 'UNRESOLVED',
      };
      return;
    }

    // 3. Match against engineering thresholds
    let matchedThreshold: QuantitySanityThreshold | null = null;
    for (const t of QUANTITY_SANITY_THRESHOLDS) {
      if (nameLower.includes(t.keyword)) {
        matchedThreshold = t;
        break;
      }
    }

    // 4. Catastrophic general bound check (e.g. quantity > 100,000 or m3 > 1,000)
    let isCatastrophic = false;
    let reason = '';

    if (rawQty > 100_000) {
      isCatastrophic = true;
      reason = `Kuantitas ekstrem (${rawQty.toLocaleString('id-ID')} ${item.unit}) melampaui batas absolut wajar (100.000). Kemungkinan terjadi kesalahan skala, duplikasi halaman, atau interpretasi mm sebagai meter.`;
    } else if (matchedThreshold) {
      if (rawQty > matchedThreshold.catastrophicLimit) {
        isCatastrophic = true;
        reason = `Kuantitas ${rawQty.toLocaleString('id-ID')} ${item.unit} melampaui batas fisik maksimum (${matchedThreshold.catastrophicLimit} ${matchedThreshold.expectedUnit}) untuk pekerjaan "${matchedThreshold.keyword}". ${matchedThreshold.description}.`;
      }
    } else if (unitLower.includes('m3') || unitLower.includes('m³')) {
      if (rawQty > 1_000) {
        isCatastrophic = true;
        reason = `Volume ${rawQty.toLocaleString('id-ID')} m³ sangat tidak wajar untuk proyek skala bangunan gedung/rumah tinggal (maks wajar 1.000 m³).`;
      }
    } else if (unitLower.includes('m2') || unitLower.includes('m²')) {
      if (rawQty > 5_000) {
        isCatastrophic = true;
        reason = `Luas ${rawQty.toLocaleString('id-ID')} m² sangat tidak wajar untuk proyek skala bangunan rumah tinggal (maks wajar 5.000 m²).`;
      }
    }

    // 5. Apply gating decision
    // FASE DED-FIX TASK 5: jangan auto-block kuantitas besar yang masih mungkin valid
    // untuk proyek infrastruktur. Blokir hanya nilai yang benar-benar katastrofik
    // (> 10x batas). Sisanya -> SUSPICIOUS (perlu tinjau, tidak otomatis masuk total).
    if (isCatastrophic) {
      const isTrulyAbsurd = rawQty > 100_000 ||
        (matchedThreshold && rawQty > matchedThreshold.catastrophicLimit * 10);
      if (isTrulyAbsurd) {
      item.quantityStatus = 'BLOCKED_FROM_TOTAL';
      item.status = 'BLOCKED';
      item.acceptedQuantity = null;
      item.quantity = null; // Strictly blocked from downstream multiplication
      item.subtotal = null;
      item.estimatedSubtotal = null; // Zero subtotal contribution
      item.blockingReason = reason;

      // CRITICAL RULE: Extreme quantity MUST NEVER have HIGH confidence
      item.confidence = 'LOW';

      // Register warning
      const warning: AiEstimateWarning = {
        type: 'EXTREME_QUANTITY',
        level: 'CRITICAL',
        message: `[BLOCKED_FROM_TOTAL] "${item.workName}": ${reason}`,
        itemId: item.id,
        itemName: item.workName,
        suggestedAction: 'Periksa satuan dimensi gambar kerja (apakah mm/cm dibaca sebagai meter) atau periksa korelasi denah.',
      };
      item.warnings.push(warning);

      // Build trace
      item.quantityTrace = {
        raw: `${rawQty} ${item.unit}`,
        normalized: `${rawQty} (EXTREME OUTLIER)`,
        formula: item.assumptions?.join('; ') || 'Perhitungan geometri visual DED',
        result: `BLOCKED_FROM_TOTAL: ${reason}`,
      };
      } else {
        // FASE DED-FIX: besar tapi belum tentu salah (proyek infrastruktur) ->
        // SUSPICIOUS, bukan BLOCKED. Tidak otomatis masuk total tanpa tinjauan.
        item.quantityStatus = 'SUSPICIOUS';
        item.status = 'WARNING';
        item.acceptedQuantity = null;
        item.blockingReason = `${reason} Nilai besar masih mungkin valid untuk proyek infrastruktur — perlu tinjauan manual sebelum masuk total.`;
        item.confidence = 'LOW';
        item.warnings.push({
          type: 'EXTREME_QUANTITY',
          level: 'WARNING',
          message: `[SUSPICIOUS] "${item.workName}": ${item.blockingReason}`,
          itemId: item.id,
          itemName: item.workName,
          suggestedAction: 'Verifikasi dimensi dengan gambar kerja detail; konfirmasi skala proyek.',
        });
        item.quantityTrace = {
          raw: `${rawQty} ${item.unit}`,
          normalized: `${rawQty} (LARGE, NEEDS REVIEW)`,
          formula: item.assumptions?.join('; ') || 'Perhitungan geometri visual DED',
          result: `SUSPICIOUS: ${reason}`,
        };
      }
    } else {
      // Check if suspicious (between normalMax and catastrophicLimit)
      const isSuspicious = matchedThreshold && rawQty > matchedThreshold.normalMax;

      if (isSuspicious) {
        item.quantityStatus = 'SUSPICIOUS';
        item.status = 'WARNING';
        item.acceptedQuantity = rawQty;
        item.quantity = rawQty;
        item.blockingReason = `Kuantitas (${rawQty.toLocaleString('id-ID')} ${item.unit}) di atas batas normal tipikal (${matchedThreshold?.normalMax} ${matchedThreshold?.expectedUnit}), tetapi masih di bawah batas pemblokiran.`;
        if (item.confidence === 'HIGH') item.confidence = 'MEDIUM';

        item.warnings.push({
          type: 'EXTREME_QUANTITY',
          level: 'WARNING',
          message: `[SUSPICIOUS] "${item.workName}": ${item.blockingReason}`,
          itemId: item.id,
          itemName: item.workName,
          suggestedAction: 'Verifikasi dimensi dengan gambar kerja detail.',
        });
      } else {
        item.quantityStatus = 'ACCEPTED';
        item.status = item.status === 'BLOCKED' ? 'BLOCKED' : (item.warnings.length > 0 ? 'WARNING' : 'VALID');
        item.acceptedQuantity = rawQty;
        item.quantity = rawQty;
        item.blockingReason = undefined;
      }

      // Build trace for accepted item
      item.quantityTrace = {
        raw: `${rawQty} ${item.unit}`,
        normalized: `${rawQty} ${item.unit}`,
        formula: item.assumptions?.length ? item.assumptions.join('; ') : `Formula standar ${item.unit}`,
        result: `${rawQty} ${item.unit} [${item.quantityStatus}]`,
      };
    }
  }
}
