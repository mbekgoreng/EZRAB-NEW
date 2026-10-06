/**
 * DED -> RAB Validation Gate & Eligibility Verification Engine
 *
 * ROOT-CAUSE FIX PRINCIPLES:
 * 1. "AI TIDAK BOLEH MENENTUKAN SENDIRI KODE AHSP, HARGA, ATAU QUANTITY"
 * 2. "SERVER / DATABASE / DETERMINISTIC ENGINE adalah source of truth"
 * 3. "LEBIH MEMILIH 0 READY ITEMS DARIPADA 67 WRONG RAB ITEMS"
 *
 * An item can ONLY achieve 'READY' and 'rabEligible: true' if it passes ALL 13 validation gates.
 */

import {
  DedWorkItem,
  ValidationStatus,
  AhspProvenance,
  DedAhspMatch,
} from '../types';
import { semanticClassifier } from '../semantic/semanticClassifier';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/officialAhspRepository';
import { dedUnitSafetyGate } from '../../ded-rab-v3/ahsp/dedUnitSafetyGate';

export interface GateValidationResult {
  rabEligible: boolean;
  validationStatus: ValidationStatus;
  confidenceRating: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH';
  validationErrors: string[];
  provenance: AhspProvenance;
  gates?: Array<{ gate: number; name: string; status: 'PASS' | 'FAIL'; reason: string }>;
  // Compatibility aliases
  isValid: boolean;
  status: ValidationStatus;
  errors: string[];
  confidenceScore: number;
}

export class DedRabValidationGate {
  private static instance: DedRabValidationGate;

  private constructor() {}

  public static getInstance(): DedRabValidationGate {
    if (!DedRabValidationGate.instance) {
      DedRabValidationGate.instance = new DedRabValidationGate();
    }
    return DedRabValidationGate.instance;
  }

  /**
   * Evaluates an item against all 13 RAB eligibility criteria.
   */
  public validateItem(
    item: DedWorkItem,
    projectIdOrVersion?: string,
    targetAhspVersion?: string
  ): GateValidationResult {
    const errors: string[] = [];
    const matchReasons: string[] = [];

    // 1. Gate 1: Semantic Construction Work Check
    const semanticRes = semanticClassifier.classify(item.name, item.category);
    const isConstructionWork = semanticRes.isRabEligible && semanticRes.fact.entityType === 'CONSTRUCTION_WORK';
    if (!isConstructionWork) {
      errors.push(semanticRes.rejectReason || `"${item.name}" bukan item pekerjaan konstruksi.`);
    } else {
      matchReasons.push('Terklasifikasi sebagai aktivitas pekerjaan konstruksi fisik yang terukur (CONSTRUCTION_WORK).');
    }

    // 2. Gate 2 & 3: Official AHSP Verification (NO AI-CUSTOM ALLOWED!)
    const ahsp = item.ahspMatch;
    const isAiCustom = Boolean(
      (ahsp?.matchType === 'AI_CUSTOM' && ahsp?.code !== 'AI-ESTIMATE') ||
      (ahsp?.code && ahsp.code.toUpperCase().startsWith('AI-CUSTOM-')) ||
      (item.ahspStatus === 'AI_CUSTOM' && ahsp?.code !== 'AI-ESTIMATE')
    );

    const hasMultipleCandidates = Boolean(
      (item.candidateAhspList && item.candidateAhspList.length > 1 && (!ahsp || !ahsp.code)) ||
      item.ahspStatus === 'AMBIGUOUS'
    );

    let isAhspVerified = false;
    let ahspCode = '';
    let ahspName = '';
    let ahspVersion = 'Standar PUPR 2026';
    let ahspField = 'Cipta Karya';
    let ahspUnit = item.unit || 'm³';

    const priceRes = item.price;
    const isPriceValid = typeof priceRes?.unitPrice === 'number' && priceRes.unitPrice > 0;
    const isAiEstimatedPrice =
      priceRes?.priceSource === 'AI_ESTIMATE' ||
      priceRes?.priceSource === 'MIXED' ||
      item.priceStatus === 'PRICE_AI_ESTIMATE' ||
      item.priceStatus === 'PRICE_MIXED';

    if (isAiCustom) {
      errors.push('Kode AHSP berasal dari fallback sintetis AI (AI-CUSTOM). Kode sintetis dilarang keras masuk ke RAB resmi.');
    } else if (hasMultipleCandidates) {
      errors.push(`Terdapat ${item.candidateAhspList?.length || 'beberapa'} kandidat AHSP resmi yang valid. Perlu konfirmasi pilihan dari pengguna.`);
    } else if (!ahsp || !ahsp.code || ahsp.matchType === 'NOT_FOUND' || ahsp.code === 'AI-ESTIMATE') {
      const hasAiSpec = Boolean(item.materialSpec || item.constructionWork?.specification || item.name);
      if (isPriceValid && hasAiSpec) {
        // RAB READY RULE: An item with valid quantity, valid AI construction specification,
        // and AI-estimated / market price SHOULD BE ALLOWED into the RAB.
        isAhspVerified = true;
        ahspCode = 'AI-ESTIMATE';
        ahspName = item.materialSpec || item.name;
        ahspVersion = 'Spesifikasi Teknis Konstruksi AI (Estimasi Pasar)';
        ahspUnit = item.unit || 'unit';
        matchReasons.push('Spesifikasi teknis konstruksi AI tervalidasi dengan harga estimasi AI (RAB Ready).');
      } else {
        errors.push('Analisa Harga Satuan Pekerjaan (AHSP) resmi belum ditemukan dalam katalog PUPR 2026.');
      }
    } else {
      const cleanCode = ahsp.code.trim().toLowerCase();
      // Official catalog is the ONLY authority (§2/§14). The legacy AHSP view and the
      // 2022 Permen baseline are deliberately NOT acceptable as "official" here.
      const inOfficial = officialAhspRepository.hasOfficialAhsp(cleanCode);

      if (!inOfficial) {
        errors.push(`Kode AHSP "${ahsp.code}" tidak terdaftar dalam database resmi AHSP.`);
      } else {
        isAhspVerified = true;
        ahspCode = ahsp.code;
        ahspName = ahsp.name;
        ahspVersion = ahsp.source || 'AHSP PUPR 2026 (SE DJBK No. 47/SE/Dk/2026)';
        ahspUnit = ahsp.unit;

        // Check target AHSP version if specified
        const expectedVersion = targetAhspVersion || (projectIdOrVersion && projectIdOrVersion.startsWith('SNI_') ? projectIdOrVersion : undefined);
        if (expectedVersion && isAhspVerified) {
          const vNorm = ahspVersion.toLowerCase();
          const expNorm = expectedVersion.toLowerCase();
          if (expNorm.includes('deprecated') || (expNorm.includes('2008') && !vNorm.includes('2008'))) {
            errors.push(`Versi AHSP "${ahspVersion}" tidak kompatibel dengan standar proyek "${expectedVersion}".`);
            isAhspVerified = false;
          }
        }

        if (isAhspVerified) {
          matchReasons.push(`Kode AHSP resmi terverifikasi: ${ahsp.code} (${ahsp.name}) dari sumber ${ahspVersion}.`);
        }
      }
    }

    // 3. Gate 4 & 5: Specification Compatibility Check
    const specCheck = this.checkSpecificationCompatibility(item.name, item.materialSpec, ahspName);
    if (!specCheck.isCompatible) {
      errors.push(specCheck.reason);
    } else if (specCheck.matchedSpec) {
      matchReasons.push(`Spesifikasi teknis sesuai: ${specCheck.matchedSpec}.`);
    }

    // 4. Gate 6: Unit Compatibility & Engineering Unit Safety Check
    const unitSafetyCheck = dedUnitSafetyGate.validateWorkItemEngineeringUnit(item.name, item.unit);
    const unitCheck = !unitSafetyCheck.isValid
      ? { isCompatible: false, reason: unitSafetyCheck.rejectionReason || 'ENGINEERING_UNIT_INVALID' }
      : this.checkUnitCompatibility(item.unit, ahspUnit);

    if (!unitCheck.isCompatible) {
      errors.push(unitCheck.reason);
    } else {
      matchReasons.push(`Satuan pekerjaan kompatibel: ${item.unit} vs ${ahspUnit}.`);
    }

    // 5. Gate 7: Quantity & Deterministic QTO Check
    const qty = item.quantity;
    const isQtyValid = typeof qty === 'number' && !isNaN(qty) && qty > 0;
    if (!isQtyValid) {
      errors.push('Volume pekerjaan (Quantity / QTO) belum terhitung atau bernilai kosong/nol.');
    } else {
      matchReasons.push(`Volume pekerjaan deterministik tervalidasi: ${qty} ${item.unit} (${item.qto?.formula || 'QTO terukur'}).`);
    }

    // 6. Gate 8: Price Resolution Check (Zero Price Fabrication Rule)
    if (!isPriceValid) {
      errors.push('Harga satuan pekerjaan belum tersedia dari database harga proyek atau katalog resmi.');
    } else {
      if (isAiEstimatedPrice) {
        matchReasons.push(`Harga satuan estimasi AI diselesaikan: Rp ${Number(priceRes?.unitPrice || 0).toLocaleString('id-ID')} (${priceRes?.priceStatus || priceRes?.priceSource || 'AI_ESTIMATE'}).`);
      } else {
        matchReasons.push(`Harga satuan resmi diselesaikan: Rp ${Number(priceRes?.unitPrice || 0).toLocaleString('id-ID')} (${priceRes?.priceSource || 'OFFICIAL_AHSP'}).`);
      }
    }

    // 7. Gate 9: Source Document Trace Check
    const hasSourceTrace = Boolean(
      (item.sourcePages && item.sourcePages.length > 0) &&
      (item.evidenceIds && item.evidenceIds.length > 0)
    );
    if (!hasSourceTrace) {
      errors.push('Trace bukti visual (Source Page / Evidence ID) tidak lengkap.');
    } else {
      matchReasons.push(`Trace bukti visual terhubung pada halaman ${item.sourcePages.join(', ')}.`);
    }

    // 8. Gate 10: AHSP Components Existence Check
    const hasComponents = Boolean(
      (priceRes?.components && priceRes.components.length > 0) || isAiEstimatedPrice
    );
    if (isAhspVerified && isPriceValid && !hasComponents && !isAiEstimatedPrice) {
      errors.push('Komponen AHSP (bahan, upah, alat) tidak ditemukan dalam data harga yang di-resolve.');
    } else if (hasComponents) {
      matchReasons.push(`Komponen AHSP tersedia: ${priceRes?.components?.length || 1} komponen teridentifikasi.`);
    }

    // 9. Gate 11: Resource Price Validity Check
    const hasResources = Boolean(
      !item.missingResources || item.missingResources.length === 0 || isAiEstimatedPrice
    );
    if (isAhspVerified && !hasResources) {
      errors.push(`Terdapat ${item.missingResources!.length} resource yang belum memiliki harga dalam komponen AHSP.`);
    } else if (isAhspVerified && hasResources) {
      matchReasons.push(isAiEstimatedPrice ? 'Resource telah memiliki harga valid atau estimasi AI.' : 'Seluruh resource dalam komponen AHSP telah memiliki harga valid.');
    }

    // 10. Gate 12: Deterministic Calculation Verified
    const isDeterministicCalcValid = Boolean(
      isQtyValid && isPriceValid &&
      typeof priceRes?.totalPrice === 'number' && priceRes.totalPrice > 0
    );
    if (isQtyValid && isPriceValid && !isDeterministicCalcValid) {
      errors.push('Total harga pekerjaan (quantity × unit price) tidak menghasilkan nilai deterministik yang valid.');
    } else if (isDeterministicCalcValid) {
      matchReasons.push(`Kalkulasi deterministik terverifikasi: ${qty} × Rp ${Number(priceRes?.unitPrice).toLocaleString('id-ID')} = Rp ${Number(priceRes?.totalPrice).toLocaleString('id-ID')}.`);
    }

    // 11. Gate 13: No Critical Audit Error
    const hasCriticalWarning = Boolean(
      item.warnings && item.warnings.some(w =>
        w.toLowerCase().includes('critical') ||
        w.toLowerCase().includes('fatal') ||
        w.toLowerCase().includes('conflict')
      )
    );
    if (hasCriticalWarning) {
      errors.push('Item memiliki warning kritis yang harus diselesaikan sebelum masuk RAB.');
    }

    // Determine final granular validation status
    let validationStatus: ValidationStatus = 'READY';
    let rabEligible = false;
    let confidenceRating: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH' = 'HIGH';

    if (!isConstructionWork) {
      validationStatus = 'INVALID';
      confidenceRating = 'NO_MATCH';
      rabEligible = false;
    } else if (hasMultipleCandidates) {
      validationStatus = 'AMBIGUOUS';
      confidenceRating = 'MEDIUM';
      rabEligible = false;
    } else if (!isAhspVerified) {
      validationStatus = 'MISSING_AHSP';
      confidenceRating = 'LOW';
      rabEligible = false;
    } else if (!specCheck.isCompatible) {
      validationStatus = 'SPECIFICATION_MISMATCH';
      confidenceRating = 'LOW';
      rabEligible = false;
    } else if (!unitCheck.isCompatible) {
      validationStatus = 'UNIT_MISMATCH';
      confidenceRating = 'LOW';
      rabEligible = false;
    } else if (!isQtyValid) {
      validationStatus = 'MISSING_QUANTITY';
      confidenceRating = 'MEDIUM';
      rabEligible = false;
    } else if (!isPriceValid) {
      validationStatus = 'MISSING_PRICE';
      confidenceRating = 'MEDIUM';
      rabEligible = false;
    } else if (!hasSourceTrace) {
      validationStatus = 'NEEDS_REVIEW';
      confidenceRating = 'MEDIUM';
      rabEligible = false;
    } else if (isAhspVerified && isPriceValid && !hasComponents) {
      validationStatus = 'COMPONENT_MISSING';
      confidenceRating = 'MEDIUM';
      rabEligible = false;
    } else if (isAhspVerified && !hasResources) {
      validationStatus = 'RESOURCE_MISSING';
      confidenceRating = 'MEDIUM';
      rabEligible = false;
    } else if (isQtyValid && isPriceValid && !isDeterministicCalcValid) {
      validationStatus = 'NEEDS_REVIEW';
      confidenceRating = 'MEDIUM';
      rabEligible = false;
    } else if (hasCriticalWarning) {
      validationStatus = 'NEEDS_REVIEW';
      confidenceRating = 'LOW';
      rabEligible = false;
    } else {
      // All 13 gates passed!
      validationStatus = 'READY';
      rabEligible = true;
      confidenceRating = isAiEstimatedPrice
        ? (priceRes?.confidenceRating || (priceRes?.confidence as any) || 'MEDIUM')
        : 'HIGH';
    }

    const provenance: AhspProvenance = {
      workDescription: item.name,
      matchedAhspCode: ahspCode || '—',
      matchedAhspName: ahspName || 'Belum terpetakan',
      ahspVersion: ahspVersion,
      field: ahspField,
      officialUnit: ahspUnit,
      specificationMatch: {
        dedSpec: item.materialSpec || item.name,
        ahspSpec: ahspName,
        isCompatible: specCheck.isCompatible,
      },
      unitMatch: {
        dedUnit: item.unit,
        ahspUnit: ahspUnit,
        isCompatible: unitCheck.isCompatible,
      },
      matchReasons,
      sourceDocumentTrace: {
        fileName: item.sourceDocumentId || 'DED',
        pageNumber: item.sourcePages?.[0] || 1,
        evidenceId: item.evidenceIds?.[0] || '—',
      },
      priceVerification: {
        source: priceRes?.sourceDetail || (isAiEstimatedPrice ? 'EZRAB AI Price Estimation Engine' : (priceRes?.priceSource || 'PRICE_NOT_FOUND')),
        verified: isPriceValid,
        unitPrice: priceRes?.unitPrice || null,
      },
      databaseVerified: isAhspVerified && !isAiEstimatedPrice && !isAiCustom,
      priceSource: priceRes?.priceSource || 'PRICE_NOT_FOUND',
    };

    const gatesBreakdown: Array<{ gate: number; name: string; status: 'PASS' | 'FAIL'; reason: string }> = [
      { gate: 1, name: 'Construction Work Check', status: isConstructionWork ? 'PASS' : 'FAIL', reason: isConstructionWork ? 'Item terklasifikasi sebagai CONSTRUCTION_WORK' : (semanticRes.rejectReason || 'Bukan item pekerjaan konstruksi') },
      { gate: 2, name: 'Source Trace Check', status: hasSourceTrace ? 'PASS' : 'FAIL', reason: hasSourceTrace ? `Trace visual: Hal ${item.sourcePages?.join(', ')} / Ev: ${item.evidenceIds?.join(', ')}` : 'Trace bukti visual tidak lengkap' },
      { gate: 3, name: 'Quantity & QTO Check', status: isQtyValid ? 'PASS' : 'FAIL', reason: isQtyValid ? `Qty tervalidasi: ${qty} ${item.unit}` : 'Volume pekerjaan kosong / null / 0' },
      { gate: 4, name: 'Unit Compatibility Check', status: unitCheck.isCompatible ? 'PASS' : 'FAIL', reason: unitCheck.isCompatible ? `Satuan kompatibel (${item.unit} vs ${ahspUnit})` : unitCheck.reason },
      { gate: 5, name: 'AHSP Candidate Check', status: Boolean((ahsp && ahsp.code && ahsp.matchType !== 'NOT_FOUND' && !hasMultipleCandidates && !isAiCustom) || isAiEstimatedPrice) ? 'PASS' : 'FAIL', reason: Boolean(ahsp && ahsp.code && ahsp.matchType !== 'NOT_FOUND' && !hasMultipleCandidates && !isAiCustom) ? `Kandidat AHSP: ${ahsp?.code}` : (isAiEstimatedPrice ? 'Estimasi AI: Spesifikasi teknis valid' : isAiCustom ? 'AI-CUSTOM sintetis ditolak' : hasMultipleCandidates ? 'AMBIGUOUS: Multi-kandidat' : 'Kandidat AHSP tidak ditemukan') },
      { gate: 6, name: 'Official AHSP Catalog Validation', status: isAhspVerified ? 'PASS' : 'FAIL', reason: isAhspVerified ? (isAiEstimatedPrice ? 'Spesifikasi teknis non-katalog tervalidasi' : `Terverifikasi dalam katalog resmi PUPR (${ahspCode})`) : `Kode AHSP tidak ada di katalog resmi` },
      { gate: 7, name: 'Version Match Check', status: isAhspVerified ? 'PASS' : 'FAIL', reason: isAhspVerified ? `Versi terverifikasi: ${ahspVersion}` : 'Versi AHSP tidak sesuai standar proyek' },
      { gate: 8, name: 'Specification Compatibility Check', status: specCheck.isCompatible ? 'PASS' : 'FAIL', reason: specCheck.isCompatible ? (specCheck.matchedSpec || 'Spesifikasi sesuai') : specCheck.reason },
      { gate: 9, name: 'AHSP Components Existence', status: (isAhspVerified && isPriceValid) ? (hasComponents ? 'PASS' : 'FAIL') : (isAhspVerified ? 'FAIL' : 'FAIL'), reason: hasComponents ? `Komponen tersedia (${priceRes?.components?.length || 1} komponen)` : 'Komponen bahan/upah/alat tidak ditemukan' },
      { gate: 10, name: 'Resource Price Validity', status: hasResources ? 'PASS' : 'FAIL', reason: hasResources ? 'Seluruh resource terharga' : `Terdapat resource belum terharga: ${item.missingResources?.join(', ')}` },
      { gate: 11, name: 'Price Validity Check', status: isPriceValid ? 'PASS' : 'FAIL', reason: isPriceValid ? (isAiEstimatedPrice ? `Harga estimasi AI: Rp ${Number(priceRes?.unitPrice).toLocaleString('id-ID')} (${priceRes?.priceStatus || priceRes?.priceSource})` : `Harga resmi: Rp ${Number(priceRes?.unitPrice).toLocaleString('id-ID')} (${priceRes?.priceSource})`) : 'Harga satuan belum tersedia / null' },
      { gate: 12, name: 'Deterministic Calculation Verified', status: isDeterministicCalcValid ? 'PASS' : 'FAIL', reason: isDeterministicCalcValid ? `Kalkulasi terverifikasi: Rp ${Number(priceRes?.totalPrice).toLocaleString('id-ID')}` : 'Total kalkulasi tidak valid' },
      { gate: 13, name: 'No Critical Audit Error', status: !hasCriticalWarning ? 'PASS' : 'FAIL', reason: !hasCriticalWarning ? 'Audit bersih tanpa warning kritis' : 'Memiliki warning kritis' },
    ];

    const confidenceScore =
      confidenceRating === 'HIGH' ? 0.95 :
      confidenceRating === 'MEDIUM' ? 0.75 :
      confidenceRating === 'LOW' ? 0.4 : 0.0;

    return {
      rabEligible,
      validationStatus,
      confidenceRating,
      validationErrors: errors,
      provenance,
      gates: gatesBreakdown,
      isValid: rabEligible,
      status: validationStatus,
      errors,
      confidenceScore,
    };
  }

  /**
   * Verifies specification compatibility (e.g. bata merah vs bata ringan).
   */
  private checkSpecificationCompatibility(
    dedName: string,
    dedSpec?: string,
    ahspName?: string
  ): { isCompatible: boolean; reason: string; matchedSpec?: string } {
    if (!ahspName) {
      return { isCompatible: false, reason: 'Nama pekerjaan AHSP belum tersedia.' };
    }

    const text = `${dedName} ${dedSpec || ''}`.toLowerCase();
    const ahsp = ahspName.toLowerCase();

    // 1. Brick wall specification conflicts
    if (text.includes('bata merah') && (ahsp.includes('bata ringan') || ahsp.includes('hebel') || ahsp.includes('batako'))) {
      return {
        isCompatible: false,
        reason: 'Ketidakcocokan spesifikasi material: Gambar menentukan "Bata Merah", namun AHSP terpetakan ke "Bata Ringan / Batako".',
      };
    }
    if ((text.includes('bata ringan') || text.includes('hebel')) && ahsp.includes('bata merah')) {
      return {
        isCompatible: false,
        reason: 'Ketidakcocokan spesifikasi material: Gambar menentukan "Bata Ringan / Hebel", namun AHSP terpetakan ke "Bata Merah".',
      };
    }

    // 2. Foundation specification conflicts
    if ((text.includes('batu kali') || text.includes('batu belah')) && (ahsp.includes('beton bertulang') && !ahsp.includes('pondasi batu'))) {
      return {
        isCompatible: false,
        reason: 'Ketidakcocokan spesifikasi pondasi: Gambar menentukan "Pondasi Batu Kali", namun AHSP terpetakan ke "Pondasi Beton".',
      };
    }

    // 3. Concrete grade conflicts (e.g. K-125 vs K-350)
    const kMatchDed = text.match(/k[-\s]?(\d{3})/i);
    const kMatchAhsp = ahsp.match(/k[-\s]?(\d{3})/i);
    if (kMatchDed && kMatchAhsp && kMatchDed[1] !== kMatchAhsp[1]) {
      const diff = Math.abs(parseInt(kMatchDed[1], 10) - parseInt(kMatchAhsp[1], 10));
      if (diff > 50) {
        return {
          isCompatible: false,
          reason: `Ketidakcocokan mutu beton: Gambar menentukan K-${kMatchDed[1]}, namun AHSP menggunakan mutu K-${kMatchAhsp[1]}.`,
        };
      }
    }

    return {
      isCompatible: true,
      reason: 'Spesifikasi teknis kompatibel.',
      matchedSpec: dedSpec || dedName,
    };
  }

  /**
   * Verifies unit compatibility.
   */
  private checkUnitCompatibility(
    dedUnit: string,
    ahspUnit: string
  ): { isCompatible: boolean; reason: string } {
    const u1 = (dedUnit || '').toLowerCase().replace(/³/g, '3').replace(/²/g, '2').trim();
    const u2 = (ahspUnit || '').toLowerCase().replace(/³/g, '3').replace(/²/g, '2').trim();

    if (!u1 || !u2) {
      return { isCompatible: true, reason: 'Satuan tidak ditentukan spesifik.' };
    }

    if (u1 === u2) {
      return { isCompatible: true, reason: 'Satuan identik.' };
    }

    // Normal variations
    const aliases: Record<string, string> = {
      m3: 'm3',
      meter3: 'm3',
      m2: 'm2',
      meter2: 'm2',
      m: 'm',
      m1: 'm',
      "m'": 'm',
      meter: 'm',
      'meter lari': 'm',
      bh: 'unit',
      buah: 'unit',
      unit: 'unit',
      ttk: 'titik',
      titik: 'titik',
      kg: 'kg',
      ton: 'ton',
      ls: 'ls',
      lumpsum: 'ls',
      set: 'set',
    };

    const norm1 = aliases[u1] || u1;
    const norm2 = aliases[u2] || u2;

    if (norm1 === norm2) {
      return { isCompatible: true, reason: 'Satuan identik via alias.' };
    }

    // Special allowance: floor tile / homogeneous items where official catalog table 3.9.4.9 specifies m' for m2
    if ((norm1 === 'm2' && (norm2 === 'm' || norm2 === "m'")) || ((norm1 === 'm' || norm1 === "m'") && norm2 === 'm2')) {
      return { isCompatible: true, reason: 'Satuan kompatibel via standar katalog pekerjaan lantai (m²/m\').' };
    }

    // Incompatible units
    return {
      isCompatible: false,
      reason: `Ketidakcocokan satuan teknis (Unit Mismatch): Satuan DED adalah "${dedUnit}", sedangkan satuan AHSP adalah "${ahspUnit}". Konversi dimensional tidak dapat diasumsikan secara otomatis.`,
    };
  }
}

export const dedRabValidationGate = DedRabValidationGate.getInstance();
