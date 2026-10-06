/**
 * EZRAB CONSTRUCTION DATA VALIDATOR & INTEGRITY SCANNER
 *
 * Full-spectrum auditor across AHSP, Resources, Units, Sources, and Price Coverage:
 * 1. AHSP Integrity & Incomplete Work Item Classification
 * 2. Resource Mapping & Canonical Resolution
 * 3. Physical Dimensional Unit Verification
 * 4. Document Source & Official Standard Verification
 * 5. Price Anomaly & Quality Scan (Missing Fields, Duplicates, Expirations, Conflicts)
 * 6. Regional & Domain Coverage Metrics
 */

import { CanonicalResourceRegistry } from './canonicalResourceRegistry';
import { UnitDimensionalValidator } from './unitDimensionalValidator';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { OFFICIAL_HSD_2026_ITEMS } from '../../data/nationalCostDatabase/officialHSD2026';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';

export type AHSPCompletenessStatus = 'VALID' | 'PARTIAL' | 'SUSPICIOUS' | 'INVALID';

export interface AHSPAuditItem {
  code: string;
  name: string;
  standard: string;
  version: string;
  domain: string;
  unit: string;
  componentCount: number;
  laborCount: number;
  materialCount: number;
  equipmentCount: number;
  completenessStatus: AHSPCompletenessStatus;
  sourceStatus: 'VERIFIED' | 'SOURCE_UNVERIFIED';
  missingResources: string[];
  invalidCoefficients: string[];
  unitMismatches: string[];
  notes: string[];
}

export interface PriceAuditRecord {
  id: string;
  code: string;
  name: string;
  price: number;
  unit: string;
  year?: number;
  region: string;
  source: string;
  effectiveDate?: string;
  issues: ('MISSING_SOURCE' | 'MISSING_YEAR' | 'MISSING_REGION' | 'MISSING_UNIT' | 'EXPIRED' | 'DUPLICATE' | 'CONFLICT')[];
}

export interface DomainCoverageMetric {
  domain: string;
  ahspCount: number;
  uniqueResourcesCount: number;
  pricedResourcesCount: number;
  priceCoveragePercent: number;
  missingPriceCount: number;
  sourceVerifiedCount: number;
  sourceCoveragePercent: number;
}

export interface ComprehensiveAuditReport {
  timestamp: string;
  ahspSummary: {
    totalAHSP: number;
    validCount: number;
    partialCount: number;
    suspiciousCount: number;
    invalidCount: number;
    sourceVerifiedCount: number;
    sourceUnverifiedCount: number;
    sourceCoveragePercent: number;
  };
  priceSummary: {
    totalPrices: number;
    cleanCount: number;
    missingSourceCount: number;
    missingYearCount: number;
    missingRegionCount: number;
    missingUnitCount: number;
    duplicateCount: number;
    conflictCount: number;
    expiredCount: number;
  };
  coverageSummary: {
    nationalResourceCoveragePercent: number;
    provinceResourceCoveragePercent: number;
    cityRegencyResourceCoveragePercent: number;
  };
  domainCoverages: DomainCoverageMetric[];
  ahspAuditSample: AHSPAuditItem[];
}

export class ConstructionDataValidator {
  /**
   * Run full audit of AHSP database
   */
  public static auditAHSPDataset(items: any[] = ALL_OFFICIAL_AHSP_ITEMS): {
    records: AHSPAuditItem[];
    summary: ComprehensiveAuditReport['ahspSummary'];
  } {
    const canonical = CanonicalResourceRegistry.getInstance();
    const records: AHSPAuditItem[] = [];

    let validCount = 0;
    let partialCount = 0;
    let suspiciousCount = 0;
    let invalidCount = 0;
    let sourceVerifiedCount = 0;

    for (const item of items) {
      const notes: string[] = [];
      const missingResources: string[] = [];
      const invalidCoefficients: string[] = [];
      const unitMismatches: string[] = [];

      const laborComps = item.laborComponents || [];
      const materialComps = item.materialComponents || [];
      const equipmentComps = item.equipmentComponents || [];
      const allComps = [...laborComps, ...materialComps, ...equipmentComps];

      const laborCount = laborComps.length;
      const materialCount = materialComps.length;
      const equipmentCount = equipmentComps.length;
      const componentCount = allComps.length;

      // 1. Source verification check
      const sourceDoc = item.sourceDocument || item.provenance?.sourceDocument || item.source;
      const version = item.version || item.provenance?.version || '2026.1';
      const standard = item.standard || item.domain || 'SNI / PUPR';
      const hasVerifiedSource = Boolean(sourceDoc && sourceDoc.trim() !== '' && sourceDoc !== 'UNKNOWN');

      if (hasVerifiedSource) {
        sourceVerifiedCount++;
      } else {
        notes.push('Sumber rujukan standar / dokumen AHSP belum terverifikasi');
      }

      // 2. Validate components: coefficient > 0, unit validity, canonical resource mapping
      for (const comp of allComps) {
        // Coefficient check
        if (comp.coefficient === undefined || comp.coefficient === null || isNaN(comp.coefficient) || comp.coefficient <= 0) {
          invalidCoefficients.push(`${comp.itemName || comp.itemCode} (coeff: ${comp.coefficient})`);
        }

        // Canonical mapping check
        const resolved = canonical.resolveCanonical(comp.itemName || comp.itemCode);
        if (!resolved) {
          missingResources.push(comp.itemName || comp.itemCode || 'Unknown Resource');
        }

        // Unit dimension check
        const unitDim = UnitDimensionalValidator.getDimension(comp.unit);
        if (unitDim === 'UNKNOWN') {
          unitMismatches.push(`${comp.itemName}: unit tidak baku "${comp.unit}"`);
        }
      }

      // 3. Work-type context completeness check:
      // JANGAN otomatis menganggap invalid jika tanpa material/equipment!
      const nameLower = (item.name || '').toLowerCase();
      const isEarthworkManual = nameLower.includes('galian tanah manual') || nameLower.includes('pembersihan lapangan') || nameLower.includes('striping');
      const isSupplyOnly = nameLower.includes('pengadaan') || nameLower.includes('supply') || nameLower.includes('material only');
      const isStructuralWork = nameLower.includes('beton') || nameLower.includes('pasangan batu') || nameLower.includes('aspal');

      let status: AHSPCompletenessStatus = 'VALID';

      if (invalidCoefficients.length > 0) {
        status = 'INVALID';
        notes.push(`Ditemukan ${invalidCoefficients.length} koefisien <= 0 atau NaN`);
      } else if (componentCount === 0) {
        status = 'INVALID';
        notes.push('Tidak memiliki komponen analisa sama sekali');
      } else if (isStructuralWork && (materialCount === 0 || laborCount === 0)) {
        status = 'SUSPICIOUS';
        notes.push('Pekerjaan struktur beton/pasangan wajib memiliki bahan dan tenaga kerja');
      } else if (isSupplyOnly && materialCount > 0 && laborCount === 0 && equipmentCount === 0) {
        // Valid for material procurement item
        status = 'VALID';
        notes.push('Pengadaan material pracetak/bahan (valid tanpa upah/alat terpasang)');
      } else if (isEarthworkManual && laborCount > 0 && equipmentCount === 0) {
        // Valid for manual labor task
        status = 'VALID';
        notes.push('Pekerjaan galian/persiapan manual (valid tanpa alat berat)');
      } else if (laborCount === 0 && materialCount > 0) {
        status = 'PARTIAL';
        notes.push('Hanya komponen bahan yang terdefinisi');
      } else if (materialCount === 0 && equipmentCount === 0 && !isEarthworkManual) {
        status = 'PARTIAL';
        notes.push('Hanya komponen tenaga kerja yang terdefinisi');
      }

      if (status === 'VALID') validCount++;
      else if (status === 'PARTIAL') partialCount++;
      else if (status === 'SUSPICIOUS') suspiciousCount++;
      else if (status === 'INVALID') invalidCount++;

      records.push({
        code: item.code || item.codeNormalized || 'UNKNOWN',
        name: item.name || 'Tanpa Nama',
        standard,
        version,
        domain: item.domain || 'UMUM',
        unit: item.unit || 'm3',
        componentCount,
        laborCount,
        materialCount,
        equipmentCount,
        completenessStatus: status,
        sourceStatus: hasVerifiedSource ? 'VERIFIED' : 'SOURCE_UNVERIFIED',
        missingResources,
        invalidCoefficients,
        unitMismatches,
        notes,
      });
    }

    const total = items.length;
    const sourceCoveragePercent = total > 0 ? Math.round((sourceVerifiedCount / total) * 100) : 0;

    return {
      records,
      summary: {
        totalAHSP: total,
        validCount,
        partialCount,
        suspiciousCount,
        invalidCount,
        sourceVerifiedCount,
        sourceUnverifiedCount: total - sourceVerifiedCount,
        sourceCoveragePercent,
      },
    };
  }

  /**
   * Run full audit of Price database (HSD & Commercial)
   */
  public static auditPriceDataset(
    prices: any[] = [...OFFICIAL_HSD_2026_ITEMS, ...MASTER_PRICE_ITEMS]
  ): {
    records: PriceAuditRecord[];
    summary: ComprehensiveAuditReport['priceSummary'];
  } {
    const records: PriceAuditRecord[] = [];
    const seenCodes = new Set<string>();
    const seenCodePrices = new Map<string, number>();

    let cleanCount = 0;
    let missingSourceCount = 0;
    let missingYearCount = 0;
    let missingRegionCount = 0;
    let missingUnitCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;
    let expiredCount = 0;

    const currentYear = 2026;

    for (const p of prices) {
      const issues: PriceAuditRecord['issues'] = [];
      const codeKey = (p.code || p.name || '').toLowerCase().trim();

      // Missing source check
      if (!p.priceSource && !p.provenance?.sourceName && !p.source) {
        issues.push('MISSING_SOURCE');
        missingSourceCount++;
      }

      // Missing region check
      if (!p.location && !p.region && !p.provenance?.location) {
        issues.push('MISSING_REGION');
        missingRegionCount++;
      }

      // Missing unit check
      if (!p.unit || p.unit.trim() === '') {
        issues.push('MISSING_UNIT');
        missingUnitCount++;
      }

      // Year check
      const year = p.year || (p.periodVersion ? parseInt(p.periodVersion.slice(0, 4)) : undefined);
      if (!year) {
        issues.push('MISSING_YEAR');
        missingYearCount++;
      }

      // Duplicate & Conflict check
      if (seenCodes.has(codeKey)) {
        issues.push('DUPLICATE');
        duplicateCount++;
        const prevPrice = seenCodePrices.get(codeKey);
        if (prevPrice !== undefined && prevPrice !== p.price) {
          issues.push('CONFLICT');
          conflictCount++;
        }
      } else {
        seenCodes.add(codeKey);
        seenCodePrices.set(codeKey, p.price);
      }

      // Expired check
      if (p.validUntil && new Date(p.validUntil).getTime() < new Date().getTime()) {
        issues.push('EXPIRED');
        expiredCount++;
      }

      if (issues.length === 0) {
        cleanCount++;
      }

      records.push({
        id: p.id || `PRC_${codeKey}`,
        code: p.code || codeKey,
        name: p.name || 'Material Item',
        price: p.price,
        unit: p.unit,
        year,
        region: p.location || p.region || 'Nasional',
        source: p.priceSource || p.source || 'Tidak Tercatat',
        effectiveDate: p.lastUpdated || p.effectiveDate,
        issues,
      });
    }

    return {
      records,
      summary: {
        totalPrices: prices.length,
        cleanCount,
        missingSourceCount,
        missingYearCount,
        missingRegionCount,
        missingUnitCount,
        duplicateCount,
        conflictCount,
        expiredCount,
      },
    };
  }

  /**
   * Calculate regional and domain coverage
   */
  public static calculateCoverageMetrics(
    ahspRecords: AHSPAuditItem[],
    priceRecords: PriceAuditRecord[]
  ): {
    coverageSummary: ComprehensiveAuditReport['coverageSummary'];
    domainCoverages: DomainCoverageMetric[];
  } {
    const canonical = CanonicalResourceRegistry.getInstance().getAll();
    const totalCanonical = canonical.length;

    // Check national coverage
    const nationalPriced = canonical.filter((c) =>
      priceRecords.some((p) => {
        const matchName = p.name.toLowerCase().includes(c.name.toLowerCase()) || c.aliases.some((al) => p.name.toLowerCase().includes(al));
        const matchReg = p.region.toLowerCase().includes('nasional') || p.region.toLowerCase().includes('acuan');
        return matchName && matchReg && p.price > 0;
      })
    ).length;

    // Check province coverage (Jawa / regional)
    const provincePriced = canonical.filter((c) =>
      priceRecords.some((p) => {
        const matchName = p.name.toLowerCase().includes(c.name.toLowerCase()) || c.aliases.some((al) => p.name.toLowerCase().includes(al));
        const matchReg = p.region.toLowerCase().includes('jawa') || p.region.toLowerCase().includes('jakarta') || p.region.toLowerCase().includes('provinsi');
        return matchName && matchReg && p.price > 0;
      })
    ).length;

    // Check city / regency coverage
    const cityPriced = canonical.filter((c) =>
      priceRecords.some((p) => {
        const matchName = p.name.toLowerCase().includes(c.name.toLowerCase()) || c.aliases.some((al) => p.name.toLowerCase().includes(al));
        const matchReg = p.region.toLowerCase().includes('kab') || p.region.toLowerCase().includes('kota');
        return matchName && matchReg && p.price > 0;
      })
    ).length;

    const natPct = Math.round((nationalPriced / totalCanonical) * 100);
    const provPct = Math.round((provincePriced / totalCanonical) * 100);
    const cityPct = Math.round((cityPriced / totalCanonical) * 100);

    // Domain coverage breakdown
    const domains = ['SUMBER_DAYA_AIR', 'BINA_MARGA', 'CIPTA_KARYA', 'SMKK'];
    const domainCoverages: DomainCoverageMetric[] = domains.map((dom) => {
      const items = ahspRecords.filter((a) => a.domain.toUpperCase() === dom);
      const ahspCount = items.length;
      const verifiedCount = items.filter((a) => a.sourceStatus === 'VERIFIED').length;
      const srcPct = ahspCount > 0 ? Math.round((verifiedCount / ahspCount) * 100) : 0;

      // Approximate resource count for domain
      const totalComps = items.reduce((acc, curr) => acc + curr.componentCount, 0);
      const missingCount = items.reduce((acc, curr) => acc + curr.missingResources.length, 0);
      const pricedCount = Math.max(0, totalComps - missingCount);
      const pricePct = totalComps > 0 ? Math.round((pricedCount / totalComps) * 100) : 0;

      return {
        domain: dom,
        ahspCount,
        uniqueResourcesCount: totalComps,
        pricedResourcesCount: pricedCount,
        priceCoveragePercent: pricePct,
        missingPriceCount: missingCount,
        sourceVerifiedCount: verifiedCount,
        sourceCoveragePercent: srcPct,
      };
    });

    return {
      coverageSummary: {
        nationalResourceCoveragePercent: natPct,
        provinceResourceCoveragePercent: provPct,
        cityRegencyResourceCoveragePercent: cityPct,
      },
      domainCoverages,
    };
  }

  /**
   * Generate Full Comprehensive Audit Report
   */
  public static generateComprehensiveReport(): ComprehensiveAuditReport {
    const ahspAudit = this.auditAHSPDataset();
    const priceAudit = this.auditPriceDataset();
    const coverage = this.calculateCoverageMetrics(ahspAudit.records, priceAudit.records);

    return {
      timestamp: new Date().toISOString(),
      ahspSummary: ahspAudit.summary,
      priceSummary: priceAudit.summary,
      coverageSummary: coverage.coverageSummary,
      domainCoverages: coverage.domainCoverages,
      ahspAuditSample: ahspAudit.records.slice(0, 15),
    };
  }
}
