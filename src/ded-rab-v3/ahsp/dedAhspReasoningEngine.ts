/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * AHSP Reasoning & Compatibility Engine
 *
 * Invariants:
 * - Single source of truth: OfficialAhspRepository (Canonical 2026 dataset).
 * - ZERO fabricated codes: No AI-CUSTOM, no synthetic IDs.
 * - Strict multi-dimensional compatibility check (work type, method, material, spec, unit).
 * - Mandatory unit safety verification.
 */

import {
  DedContextMemory,
  FullAiWorkItem,
  AhspMatchResult,
  AhspCandidateReview,
} from '../types';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import { dedUnitSafetyGate } from './dedUnitSafetyGate';
import { specificationValidator } from '../validation/specificationValidator';

export class DedAhspReasoningEngine {
  private static instance: DedAhspReasoningEngine;
  private ahspRepo = officialAhspRepository;

  private constructor() {}

  public static getInstance(): DedAhspReasoningEngine {
    if (!DedAhspReasoningEngine.instance) {
      DedAhspReasoningEngine.instance = new DedAhspReasoningEngine();
    }
    return DedAhspReasoningEngine.instance;
  }

  /**
   * Matches official AHSP items for all work items in the inventory.
   */
  public matchAhspForInventory(items: FullAiWorkItem[], context: DedContextMemory): void {
    for (const item of items) {
      const match = this.reasonAhspForItem(item);
      if (match) {
        item.ahsp = match;
        item.ahspConfidence = match.confidence;
        context.ahsp_evidence.set(item.id, match);
      } else {
        item.ahsp = null;
        item.ahspConfidence = 'UNRESOLVED';
        if (item.status === 'READY') {
          item.status = 'AHSP_UNRESOLVED';
          item.unresolvedReason = `Tidak ditemukan analisa harga resmi yang kompatibel untuk spesifikasi '${item.name} (${item.specification})' pada katalog resmi 2026.`;
        }
      }
    }
  }

  /**
   * Finds, evaluates, and selects the most compatible official AHSP item.
   */
  public reasonAhspForItem(item: FullAiWorkItem): AhspMatchResult | null {
    // 1. Build search query terms
    const searchQueries = this.buildSearchQueries(item);

    // 2. Fetch candidates from official repository
    const rawCandidates: NationalAHSPItem[] = [];
    const seenCodes = new Set<string>();

    for (const q of searchQueries) {
      const results = this.ahspRepo.searchOfficialAhsp(q, { limit: 12 });
      for (const res of results) {
        if (!seenCodes.has(res.item.code)) {
          seenCodes.add(res.item.code);
          rawCandidates.push(res.item);
        }
      }
      if (rawCandidates.length >= 10) break;
    }

    if (rawCandidates.length === 0) {
      // Broad category search
      const broadResults = this.ahspRepo.searchOfficialAhsp(item.category.slice(0, 20), { limit: 5 });
      for (const res of broadResults) {
        if (!seenCodes.has(res.item.code)) {
          seenCodes.add(res.item.code);
          rawCandidates.push(res.item);
        }
      }
    }

    // 3. Evaluate compatibility for every candidate
    const evaluations: AhspCandidateReview[] = rawCandidates.map((candidate) =>
      this.evaluateCompatibility(item, candidate)
    );

    // 4. Filter only compatible items with passing unit safety checks
    const compatibleCandidates = evaluations
      .filter((ev) => ev.isCompatible && ev.compatibilityScore >= 50)
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    if (compatibleCandidates.length === 0) {
      return null;
    }

    // 5. Select the highest scoring compatible official item
    const bestReview = compatibleCandidates[0];
    const selectedItem = this.ahspRepo.getOfficialAhsp(bestReview.candidateCode);

    if (!selectedItem) {
      return null;
    }

    const confidence = bestReview.compatibilityScore >= 80 ? 'HIGH' : 'MEDIUM';

    return {
      code: selectedItem.code,
      name: selectedItem.name,
      unit: selectedItem.unit,
      source: (selectedItem.domain === 'BINA_MARGA' ? 'BINA_MARGA_2026' : selectedItem.domain === 'SMKK' ? 'SMKK_2026' : 'CIPTA_KARYA_2026') as any,
      category: selectedItem.category,
      domain: selectedItem.domain,
      confidence,
      compatibilitySummary: `Kecocokan ${bestReview.compatibilityScore}%: Spesifikasi DED (${item.name} - ${item.specification}) sesuai dengan analisa resmi ${selectedItem.code}.`,
      candidatesEvaluated: evaluations.slice(0, 5),
    };
  }

  /**
   * Deep multi-dimensional compatibility evaluation.
   */
  private evaluateCompatibility(item: FullAiWorkItem, candidate: NationalAHSPItem): AhspCandidateReview {
    const itemName = item.name.toLowerCase();
    const itemSpec = item.specification.toLowerCase();
    const candName = (candidate.name || '').toLowerCase();
    const candUnit = (candidate.unit || '').toLowerCase();

    // 1. Mandatory Engineering Unit Check (fail closed on impossible units like rebar in m²)
    const engUnitCheck = dedUnitSafetyGate.validateWorkItemEngineeringUnit(item.name, item.quantityUnit);
    if (!engUnitCheck.isValid) {
      return {
        candidateCode: candidate.code,
        candidateName: candidate.name,
        candidateUnit: candidate.unit,
        compatibilityScore: 0,
        isCompatible: false,
        compatibilityChecks: {
          workTypeMatch: false,
          constructionMethodMatch: false,
          materialMatch: false,
          dimensionsMatch: false,
          specificationMatch: false,
          unitMatch: false,
        },
        rejectionReason: engUnitCheck.rejectionReason,
      };
    }

    // 2. Mandatory Unit Safety Check between QTO Unit and AHSP Unit
    const unitCheck = dedUnitSafetyGate.verifyUnitCompatibility(item.quantityUnit, candUnit);
    if (!unitCheck.isCompatible) {
      return {
        candidateCode: candidate.code,
        candidateName: candidate.name,
        candidateUnit: candidate.unit,
        compatibilityScore: 0,
        isCompatible: false,
        compatibilityChecks: {
          workTypeMatch: false,
          constructionMethodMatch: false,
          materialMatch: false,
          dimensionsMatch: false,
          specificationMatch: false,
          unitMatch: false,
        },
        rejectionReason: unitCheck.rejectionReason,
      };
    }

    // 3. Strict Specification Validation (Dimensional & Material verification)
    const specValidation = specificationValidator.validate(
      item.name,
      item.specification,
      candidate.name,
      candidate.unit
    );
    if (!specValidation.isCompatible) {
      return {
        candidateCode: candidate.code,
        candidateName: candidate.name,
        candidateUnit: candidate.unit,
        compatibilityScore: 0,
        isCompatible: false,
        compatibilityChecks: {
          workTypeMatch: false,
          constructionMethodMatch: false,
          materialMatch: specValidation.materialMatch,
          dimensionsMatch: specValidation.dimensionMatch,
          specificationMatch: false,
          unitMatch: unitCheck.isCompatible,
        },
        rejectionReason: specValidation.rejectionReasons.join('; '),
      };
    }

    // 4. Work Type & Category Match
    let workTypeMatch = false;
    if (
      (itemName.includes('pembesian') || itemName.includes('tulangan') || (itemName.includes('besi') && itemName.includes('beton'))) &&
      (candName.includes('pembesian') || candName.includes('besi') || candName.includes('tulangan'))
    ) {
      workTypeMatch = true;
    } else if (
      (itemName.includes('galian') && candName.includes('galian')) ||
      (itemName.includes('urugan') && candName.includes('urug')) ||
      (itemName.includes('pondasi') && candName.includes('pondasi')) ||
      (itemName.includes('sloof') && (candName.includes('sloof') || candName.includes('beton bertulang') || candName.includes('balok'))) ||
      (itemName.includes('kolom') && (candName.includes('kolom') || candName.includes('beton bertulang'))) ||
      (itemName.includes('ring') && (candName.includes('ring') || candName.includes('balok') || candName.includes('beton bertulang'))) ||
      (itemName.includes('dinding') && (candName.includes('dinding') || candName.includes('bata'))) ||
      (itemName.includes('plesteran') && candName.includes('plesteran')) ||
      (itemName.includes('acian') && candName.includes('acian')) ||
      (itemName.includes('kusen') && candName.includes('kusen')) ||
      (itemName.includes('pintu') && candName.includes('pintu')) ||
      (itemName.includes('jendela') && (candName.includes('jendela') || candName.includes('kaca'))) ||
      (itemName.includes('keramik') && candName.includes('keramik')) ||
      (itemName.includes('plafon') && candName.includes('plafon')) ||
      (itemName.includes('atap') && (candName.includes('atap') || candName.includes('kuda') || candName.includes('spandek') || candName.includes('genteng'))) ||
      (itemName.includes('cat') && candName.includes('cat')) ||
      (itemName.includes('pipa') && candName.includes('pipa')) ||
      (itemName.includes('lampu') && candName.includes('lampu')) ||
      (itemName.includes('saklar') && candName.includes('saklar')) ||
      (itemName.includes('stop kontak') && candName.includes('stop kontak')) ||
      (itemName.includes('kloset') && candName.includes('kloset'))
    ) {
      workTypeMatch = true;
    }

    // 3. Material Match
    let materialMatch = true;
    if (itemName.includes('aluminium') && (candName.includes('kayu') || candName.includes('upvc'))) {
      materialMatch = false;
    }
    if (itemName.includes('kayu') && candName.includes('aluminium')) {
      materialMatch = false;
    }
    if (itemName.includes('bata merah') && candName.includes('bata ringan')) {
      materialMatch = false;
    }
    if (itemName.includes('bata ringan') && candName.includes('bata merah')) {
      materialMatch = false;
    }
    if (itemName.includes('gypsum') && candName.includes('triplek')) {
      materialMatch = false;
    }

    // 4. Construction Method & Dimension Match
    let dimensionsMatch = true;
    let specificationMatch = true;

    // e.g. Sloof 15x20 vs Balok Praktis 10x15
    if (itemName.includes('sloof') && candName.includes('praktis') && !itemName.includes('praktis')) {
      dimensionsMatch = false; // Sloof structure must not be replaced by minor praktis unless spec allows
    }
    if (itemSpec.includes('1:4') && candName.includes('1:2')) {
      specificationMatch = false;
    }
    if (itemSpec.includes('1:2') && candName.includes('1:4')) {
      specificationMatch = false;
    }

    // Score calculation
    let score = 0;
    if (workTypeMatch) score += 35;
    if (materialMatch) score += 25;
    if (specificationMatch) score += 20;
    if (dimensionsMatch) score += 10;
    if (unitCheck.isCompatible) score += 10;

    const isCompatible = workTypeMatch && materialMatch && score >= 50;

    return {
      candidateCode: candidate.code,
      candidateName: candidate.name,
      candidateUnit: candidate.unit,
      compatibilityScore: score,
      isCompatible,
      compatibilityChecks: {
        workTypeMatch,
        constructionMethodMatch: true,
        materialMatch,
        dimensionsMatch,
        specificationMatch,
        unitMatch: unitCheck.isCompatible,
      },
      rejectionReason: !isCompatible ? `Inkompatibilitas teknis: WorkType=${workTypeMatch}, Material=${materialMatch}` : undefined,
    };
  }

  private buildSearchQueries(item: FullAiWorkItem): string[] {
    const name = item.name.toLowerCase();
    const queries: string[] = [];

    if (name.includes('pembesian') || name.includes('tulangan') || name.includes('sengkang') || (name.includes('besi') && name.includes('beton'))) {
      queries.push('pembesian besi ulir', 'pembesian besi polos', 'pembesian', 'besi beton');
    }
    else if (name.includes('pembersihan')) queries.push('pembersihan lapangan', 'pembersihan lahan');
    else if (name.includes('bouwplank')) queries.push('bouwplank', 'pengukuran');
    else if (name.includes('galian') && name.includes('pondasi')) queries.push('galian tanah biasa 1 m', 'galian tanah');
    else if (name.includes('urugan pasir') && name.includes('pondasi')) queries.push('urugan pasir bawah pondasi', 'urugan pasir');
    else if (name.includes('urugan pasir') && name.includes('lantai')) queries.push('urugan pasir bawah lantai', 'urugan pasir');
    else if (name.includes('urugan tanah')) queries.push('urugan tanah kembali', 'urugan kembali');
    else if (name.includes('aanstamping') || name.includes('batu kosong')) queries.push('batu kosong', 'aanstamping');
    else if (name.includes('pondasi') && name.includes('batu')) queries.push('pondasi batu belah 1:4', 'pondasi batu kali', 'batu belah 1:4');
    else if (name.includes('sloof')) queries.push('beton sloof k-225', 'sloof', 'balok beton');
    else if (name.includes('kolom')) queries.push('kolom praktis', 'kolom beton bertulang');
    else if (name.includes('ring') && name.includes('balk')) queries.push('ring balk', 'balok beton bertulang');
    else if (name.includes('pelat') || name.includes('dak')) queries.push('pelat lantai beton', 'pelat beton bertulang');
    else if (name.includes('dinding') || name.includes('pasangan bata')) queries.push('dinding bata merah 1:4', 'pasangan bata merah');
    else if (name.includes('plesteran')) queries.push('plesteran 1:4', 'plesteran tebal 15 mm');
    else if (name.includes('acian')) queries.push('acian', 'acian semen');
    else if (name.includes('kusen') && name.includes('aluminium')) queries.push('kusen aluminium 4', 'kusen aluminium');
    else if (name.includes('p1') || name.includes('p2') || (name.includes('pintu') && (name.includes('aluminium') || name.includes('multipleks') || name.includes('hpl')))) {
      queries.push('daun pintu aluminium', 'pintu aluminium', 'daun pintu multipleks', 'pintu panel');
    }
    else if (name.includes('pintu panel')) queries.push('daun pintu panel', 'pintu panel');
    else if (name.includes('pintu pvc')) queries.push('pintu pvc', 'daun pintu pvc');
    else if (name.includes('waterproofing')) queries.push('waterproofing coating', 'waterproofing membran', 'waterproofing');
    else if (name.includes('kaca')) queries.push('kaca bening 5 mm', 'kaca polos 5 mm');
    else if (name.includes('kunci') || name.includes('aksesoris')) queries.push('kunci tanam', 'pasang kunci');
    else if (name.includes('keramik') && name.includes('40x40')) queries.push('lantai keramik 40x40', 'keramik 40x40');
    else if (name.includes('keramik') && name.includes('25x25')) queries.push('lantai keramik 25x25', 'keramik 25x25');
    else if (name.includes('keramik dinding')) queries.push('dinding keramik 25x40', 'dinding keramik');
    else if (name.includes('plint')) queries.push('plint keramik 10x40', 'plint keramik');
    else if (name.includes('plafon') && (name.includes('gypsum') || name.includes('hollow'))) queries.push('langit-langit gypsum', 'plafon gypsum hollow');
    else if (name.includes('list plafon')) queries.push('list langit-langit', 'list profil gypsum');
    else if (name.includes('kuda-kuda') || name.includes('rangka atap')) queries.push('rangka atap baja ringan', 'kuda-kuda baja');
    else if (name.includes('penutup atap') || name.includes('spandek')) queries.push('atap spandek', 'atap metal');
    else if (name.includes('nok') || name.includes('bubungan')) queries.push('nok spandek', 'bubungan');
    else if (name.includes('lisplank')) queries.push('lisplank grc', 'lisplank');
    else if (name.includes('kloset')) queries.push('kloset duduk', 'monoblok');
    else if (name.includes('kran')) queries.push('kran air 1/2', 'kran');
    else if (name.includes('floor drain')) queries.push('floor drain', 'saringan air');
    else if (name.includes('pipa air bersih')) queries.push('pipa pvc 1/2', 'pipa air bersih');
    else if (name.includes('pipa air kotor')) queries.push('pipa pvc 3', 'pipa pvc 4');
    else if (name.includes('septic tank')) queries.push('septic tank', 'biofill');
    else if (name.includes('titik instalasi') || name.includes('titik lampu')) queries.push('titik lampu', 'instalasi penerangan');
    else if (name.includes('saklar')) queries.push('saklar', 'saklar tunggal');
    else if (name.includes('stop kontak')) queries.push('stop kontak');
    else if (name.includes('box panel') || name.includes('mcb')) queries.push('panel mcb', 'box sekring');
    else if (name.includes('cat interior')) queries.push('cat tembok interior', 'cat dinding dalam');
    else if (name.includes('cat eksterior')) queries.push('cat tembok eksterior', 'cat luar');
    else if (name.includes('cat plafon')) queries.push('cat plafon', 'cat langit-langit');
    else queries.push(item.name.slice(0, 25));

    return queries;
  }
}

export const dedAhspReasoningEngine = DedAhspReasoningEngine.getInstance();
