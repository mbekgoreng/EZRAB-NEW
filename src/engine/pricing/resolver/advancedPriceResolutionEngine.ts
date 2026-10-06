/**
 * EZRAB ADVANCED PRICE RESOLUTION ENGINE
 * Multi-tier priority (PROJECT -> CITY -> PROVINCE -> NATIONAL -> NO_PRICE)
 * Deterministic resolution, no silent Rp0 fallbacks, anomaly detection, provenance, and snapshotting.
 */

import { UnitEngine, UnitConversionError } from '../../calculatorCore/unit/unitEngine';
import { PriceNormalizationEngine } from '../normalization/priceNormalization';

export type ResolutionStatus =
  | 'VERIFIED'
  | 'VALID'
  | 'PARTIAL'
  | 'MISSING'
  | 'EXPIRED'
  | 'CONFLICT'
  | 'INVALID';

export type PriceResolutionTier =
  | 'PROJECT_SPECIFIC'
  | 'CITY_REGENCY'
  | 'PROVINCE'
  | 'NATIONAL'
  | 'NO_PRICE';

export interface PriceRecord {
  id: string;
  resourceId: string;
  resourceName: string;
  price: number;
  unit: string;
  tier: PriceResolutionTier;
  projectId?: string;
  provinceId?: string;
  cityId?: string;
  source: string;
  sourceDocument: string;
  year: number;
  month?: number;
  effectiveDate: string;
  validUntil?: string;
  confidence: number;
}

export interface PriceResolutionQuery {
  resourceId: string;
  resourceName?: string;
  targetUnit?: string;
  projectId?: string;
  provinceId?: string;
  cityId?: string;
  year: number;
  month?: number;
  priceSource?: string;
}

export interface PriceProvenance {
  price: number;
  unit: string;
  source: string;
  sourceDocument: string;
  region: string;
  year: number;
  effectiveDate: string;
  confidence: number;
  tier: PriceResolutionTier;
  resolutionReason: string;
}

export interface PriceAnomaly {
  code: 'PRICE_TOO_LOW' | 'PRICE_TOO_HIGH' | 'NEGATIVE_PRICE' | 'UNIT_MISMATCH' | 'YEAR_MISMATCH' | 'EXPIRED_PRICE';
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface PriceResolutionOutput {
  status: ResolutionStatus;
  price: number | null;
  unit: string | null;
  provenance: PriceProvenance | null;
  anomalies: PriceAnomaly[];
  explanation: string;
}

export interface PriceSnapshot {
  snapshotId: string;
  createdAt: string;
  projectId?: string;
  items: Map<string, PriceResolutionOutput>;
}

export class AdvancedPriceResolutionEngine {
  private priceDatabase: PriceRecord[] = [];

  constructor(initialRecords: PriceRecord[] = []) {
    this.priceDatabase = [...initialRecords];
  }

  public registerPrice(record: PriceRecord): void {
    this.priceDatabase.push(record);
  }

  /**
   * Deterministically resolve price according to strict priority order:
   * 1. PROJECT_SPECIFIC
   * 2. CITY_REGENCY
   * 3. PROVINCE
   * 4. NATIONAL
   * 5. NO_PRICE (Returns MISSING, NEVER Rp0 fallback)
   */
  public resolvePrice(query: PriceResolutionQuery): PriceResolutionOutput {
    const anomalies: PriceAnomaly[] = [];

    // Filter candidate records matching resource
    const candidates = this.priceDatabase.filter((r) => {
      const matchId = r.resourceId.toLowerCase() === query.resourceId.toLowerCase();
      const matchName = query.resourceName
        ? PriceNormalizationEngine.normalizeText(r.resourceName) === PriceNormalizationEngine.normalizeText(query.resourceName)
        : false;
      return matchId || matchName;
    });

    if (candidates.length === 0) {
      return {
        status: 'MISSING',
        price: null,
        unit: null,
        provenance: null,
        anomalies,
        explanation: `Harga untuk resource "${query.resourceId}" (${query.resourceName || ''}) tidak ditemukan di database.`,
      };
    }

    // Sort/filter by priority tier:
    // 1. PROJECT_SPECIFIC
    // 2. CITY_REGENCY
    // 3. PROVINCE
    // 4. NATIONAL
    // 5. NO_PRICE (Never Rp0 fallback)
    const priorityTiers: PriceResolutionTier[] = [
      'PROJECT_SPECIFIC',
      'CITY_REGENCY',
      'PROVINCE',
      'NATIONAL',
    ];

    let selectedRecord: PriceRecord | null = null;
    let selectedTier: PriceResolutionTier = 'NO_PRICE';
    let resolutionReason = '';
    let hadConflict = false;

    for (const tier of priorityTiers) {
      const tierMatches = candidates.filter((c) => {
        if (tier === 'PROJECT_SPECIFIC') return c.tier === tier && query.projectId && c.projectId === query.projectId;
        if (tier === 'CITY_REGENCY') return c.tier === tier && query.cityId && c.cityId?.toLowerCase() === query.cityId.toLowerCase();
        if (tier === 'PROVINCE') return c.tier === tier && query.provinceId && c.provinceId?.toLowerCase() === query.provinceId.toLowerCase();
        if (tier === 'NATIONAL') return c.tier === tier;
        return false;
      });

      if (tierMatches.length === 1) {
        selectedRecord = tierMatches[0];
        selectedTier = tier;
        resolutionReason = `Resolved via priority tier ${tier} (${selectedRecord.source})`;
        break;
      } else if (tierMatches.length > 1) {
        hadConflict = true;
        // Deterministic Conflict Resolution:
        // 1. Preferred priceSource if specified
        // 2. Latest effectiveDate
        // 3. Latest year & month
        // 4. Highest confidence
        tierMatches.sort((a, b) => {
          if (query.priceSource) {
            if (a.source === query.priceSource && b.source !== query.priceSource) return -1;
            if (b.source === query.priceSource && a.source !== query.priceSource) return 1;
          }
          const dateDiff = new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime();
          if (dateDiff !== 0) return dateDiff;
          if (b.year !== a.year) return b.year - a.year;
          if ((b.month || 0) !== (a.month || 0)) return (b.month || 0) - (a.month || 0);
          return b.confidence - a.confidence;
        });

        selectedRecord = tierMatches[0];
        selectedTier = tier;
        resolutionReason = `Resolved conflict among ${tierMatches.length} candidates in tier ${tier} using ${
          query.priceSource && selectedRecord.source === query.priceSource ? 'matching priceSource & ' : ''
        }latest effectiveDate (${selectedRecord.effectiveDate}) from ${selectedRecord.sourceDocument || selectedRecord.source}`;
        break;
      }
    }

    if (!selectedRecord) {
      return {
        status: 'MISSING',
        price: null,
        unit: null,
        provenance: null,
        anomalies,
        explanation: `Resource terdaftar tetapi tidak memiliki data harga yang cocok dengan lokasi/proyek query.`,
      };
    }

    // DILARANG: Rp0 fallback kecuali secara eksplisit zero-cost confirmed
    if (selectedRecord.price === 0 && !(selectedRecord as any).isZeroCostConfirmed) {
      return {
        status: 'MISSING',
        price: null,
        unit: null,
        provenance: null,
        anomalies: [
          {
            code: 'PRICE_TOO_LOW',
            message: 'Harga Rp0 tidak diperbolehkan tanpa konfirmasi zero-cost eksplisit.',
            severity: 'ERROR',
          },
        ],
        explanation: 'Harga Rp0 tidak valid karena belum dikonfirmasi sebagai item bebas biaya (zero-cost).',
      };
    }

    // Check validity & anomalies
    let status: ResolutionStatus = selectedRecord.confidence >= 0.95 ? 'VERIFIED' : 'VALID';

    // 1. Negative price check
    if (selectedRecord.price < 0) {
      anomalies.push({
        code: 'NEGATIVE_PRICE',
        message: `Harga bernilai negatif: ${selectedRecord.price}`,
        severity: 'ERROR',
      });
      status = 'INVALID';
    }

    // 2. Suspicious range check: too low
    if (selectedRecord.price > 0 && selectedRecord.price < 10) {
      anomalies.push({
        code: 'PRICE_TOO_LOW',
        message: `Harga terindikasi tidak wajar (terlalu rendah): Rp ${selectedRecord.price}`,
        severity: 'WARNING',
      });
    }

    // 3. Suspicious range check: too high
    if (selectedRecord.price > 500_000_000) {
      anomalies.push({
        code: 'PRICE_TOO_HIGH',
        message: `Harga terindikasi tidak wajar (terlalu tinggi): Rp ${selectedRecord.price}`,
        severity: 'WARNING',
      });
    }

    // 4. Expiration check
    if (selectedRecord.validUntil) {
      const now = new Date();
      if (new Date(selectedRecord.validUntil).getTime() < now.getTime()) {
        anomalies.push({
          code: 'EXPIRED_PRICE',
          message: `Masa berlaku harga telah kedaluwarsa pada ${selectedRecord.validUntil}`,
          severity: 'WARNING',
        });
        status = 'EXPIRED';
      }
    }

    // 5. Year check
    if (query.year && selectedRecord.year !== query.year) {
      anomalies.push({
        code: 'YEAR_MISMATCH',
        message: `Tahun harga (${selectedRecord.year}) berbeda dengan tahun proyek (${query.year})`,
        severity: 'WARNING',
      });
    }

    // 6. Unit Conversion check
    let finalPrice = selectedRecord.price;
    let finalUnit = selectedRecord.unit;

    if (query.targetUnit && query.targetUnit !== selectedRecord.unit) {
      if (!UnitEngine.areCompatible(selectedRecord.unit, query.targetUnit)) {
        anomalies.push({
          code: 'UNIT_MISMATCH',
          message: `Unit tidak kompatibel: tidak dapat mengonversi ${selectedRecord.unit} ke ${query.targetUnit}`,
          severity: 'ERROR',
        });
        return {
          status: 'INVALID',
          price: null,
          unit: null,
          provenance: null,
          anomalies,
          explanation: `UNIT_CONVERSION_ERROR: Incompatible units "${selectedRecord.unit}" and "${query.targetUnit}".`,
        };
      } else {
        try {
          const baseRatio = UnitEngine.convert(1, query.targetUnit, selectedRecord.unit);
          finalPrice = selectedRecord.price * baseRatio;
          finalUnit = query.targetUnit;
        } catch (e: any) {
          anomalies.push({
            code: 'UNIT_MISMATCH',
            message: e.message,
            severity: 'ERROR',
          });
          return {
            status: 'INVALID',
            price: null,
            unit: null,
            provenance: null,
            anomalies,
            explanation: `UNIT_CONVERSION_ERROR: ${e.message}`,
          };
        }
      }
    }

    const provenance: PriceProvenance = {
      price: finalPrice,
      unit: finalUnit,
      source: selectedRecord.source,
      sourceDocument: selectedRecord.sourceDocument,
      region: selectedRecord.cityId || selectedRecord.provinceId || 'Nasional',
      year: selectedRecord.year,
      effectiveDate: selectedRecord.effectiveDate,
      confidence: selectedRecord.confidence,
      tier: selectedTier,
      resolutionReason,
    };

    return {
      status,
      price: finalPrice,
      unit: finalUnit,
      provenance,
      anomalies,
      explanation: `Harga ${selectedRecord.resourceName} berhasil diselesaikan: Rp ${finalPrice.toLocaleString('id-ID')}/${finalUnit} (${selectedTier})`,
    };
  }

  /**
   * Create an immutable snapshot of current project prices
   */
  public createSnapshot(projectId: string, queries: PriceResolutionQuery[]): PriceSnapshot {
    const snapshotMap = new Map<string, PriceResolutionOutput>();
    for (const q of queries) {
      const res = this.resolvePrice({ ...q, projectId });
      snapshotMap.set(q.resourceId, res);
    }

    return {
      snapshotId: `SNAP_${projectId}_${Date.now()}`,
      createdAt: new Date().toISOString(),
      projectId,
      items: snapshotMap,
    };
  }
}
