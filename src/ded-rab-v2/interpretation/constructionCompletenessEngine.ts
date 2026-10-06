/**
 * Construction Completeness Engine (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Generates secondary construction work items that are logically and structurally required
 *   by verified DED physical elements (e.g. bathrooms, masonry walls, concrete structures).
 * - CRITICAL AUDITABILITY RULE (Rule 12 & 40):
 *   Every derived item MUST be explicitly assigned `sourceType: 'CONSTRUCTION_RULE'`.
 *   It must NEVER be marked as `DED_VERIFIED`.
 * - Avoids duplication: if an item was already explicitly extracted from DED sheets,
 *   the completeness engine skips generating a duplicate.
 */

import {
  DedWorkItem,
  DedSpace,
  DedConstructionElement,
} from '../types';
import { constructionNormalizer } from './constructionNormalizer';

export class ConstructionCompletenessEngine {
  private static instance: ConstructionCompletenessEngine;

  private constructor() {}

  public static getInstance(): ConstructionCompletenessEngine {
    if (!ConstructionCompletenessEngine.instance) {
      ConstructionCompletenessEngine.instance = new ConstructionCompletenessEngine();
    }
    return ConstructionCompletenessEngine.instance;
  }

  /**
   * Evaluates verified DED work items and spaces, producing derived construction requirements.
   */
  public generateDerivedWorkItems(
    projectId: string,
    sourceDocumentId: string,
    existingWorkItems: DedWorkItem[],
    spaces: DedSpace[],
    startSequence: number = 100
  ): DedWorkItem[] {
    const derivedItems: DedWorkItem[] = [];
    let seq = startSequence;

    const existingNames = new Set(existingWorkItems.map((i) => i.name.toLowerCase()));

    // 1. BATHROOM / TOILET DERIVATIONS (Waterproofing, Trasraam, Floor Drain)
    const bathroomSpaces = spaces.filter((s) => s.name.toLowerCase().includes('kamar mandi') || s.name.toLowerCase().includes('km'));
    if (bathroomSpaces.length > 0) {
      const totalBathroomArea = bathroomSpaces.reduce((acc, s) => acc + (s.area || 3.0), 0);
      const totalBathrooms = bathroomSpaces.length;

      // Rule 1A: Waterproofing Lantai Kamar Mandi
      const wpName = 'Waterproofing Coating Lantai Kamar Mandi';
      if (!existingNames.has(wpName.toLowerCase()) && !existingWorkItems.some(i => i.name.toLowerCase().includes('waterproofing'))) {
        const normalized = constructionNormalizer.normalize(wpName, 'FLOOR_FINISH', 'SEMEN_POLYMER');
        derivedItems.push({
          id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
          projectId,
          sourceDocumentId,
          name: wpName,
          category: 'FLOOR_FINISH',
          status: 'CONFIRMED',
          sourceType: 'CONSTRUCTION_RULE',
          evidenceIds: bathroomSpaces.flatMap(s => s.evidenceIds),
          sourcePages: bathroomSpaces.flatMap(s => s.sourcePages),
          dimensions: {
            area: { value: totalBathroomArea, unit: 'm²', isMissing: false },
          },
          geometry: { shape: 'RECTANGULAR', notes: `Ditulis dari aturan konstruksi kamar mandi (${totalBathrooms} ruang, luas ${totalBathroomArea} m²)` },
          unit: 'm²',
          calculationInputs: { area: totalBathroomArea },
          confidence: 0.92,
          assumptions: [`Luas waterproofing dihitung dari total luas ${totalBathrooms} kamar mandi (${totalBathroomArea} m²)`],
          warnings: [],
          materialSpec: 'Waterproofing 2-komponen semen base + polymer',
        });
      }

      // Rule 1B: Floor Drain Kamar Mandi
      const fdName = 'Pemasangan Floor Drain Stainless Steel Kamar Mandi';
      if (!existingNames.has(fdName.toLowerCase()) && !existingWorkItems.some(i => i.name.toLowerCase().includes('floor drain'))) {
        derivedItems.push({
          id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
          projectId,
          sourceDocumentId,
          name: fdName,
          category: 'SANITARY',
          status: 'CONFIRMED',
          sourceType: 'CONSTRUCTION_RULE',
          evidenceIds: bathroomSpaces.flatMap(s => s.evidenceIds),
          sourcePages: bathroomSpaces.flatMap(s => s.sourcePages),
          dimensions: {
            count: { value: totalBathrooms, unit: 'buah', isMissing: false },
          },
          geometry: { shape: 'COUNT', notes: `1 floor drain per kamar mandi (${totalBathrooms} unit)` },
          unit: 'buah',
          calculationInputs: { count: totalBathrooms },
          confidence: 0.95,
          assumptions: [`1 titik floor drain dialokasikan untuk setiap kamar mandi teridentifikasi`],
          warnings: [],
          materialSpec: 'Floor drain stainless steel anti bau',
        });
      }
    }

    // 2. WALL FINISHES (Plesteran + Acian + Cat Dinding)
    const wallItems = existingWorkItems.filter((i) => i.category === 'WALL' && i.status !== 'MISSING_DATA');
    if (wallItems.length > 0) {
      const hasPlaster = existingWorkItems.some(i => i.category === 'PLASTER' || i.name.toLowerCase().includes('plester'));
      const hasPaint = existingWorkItems.some(i => i.category === 'PAINTING' || i.name.toLowerCase().includes('cat dinding'));

      // If walls exist but plesteran is not itemized, generate plesteran and acian (2 sides of wall)
      if (!hasPlaster) {
        // Calculate total wall area
        let totalWallArea = 0;
        for (const w of wallItems) {
          const l = w.calculationInputs.length || 0;
          const h = w.calculationInputs.height || 3.0;
          totalWallArea += (l * h);
        }

        if (totalWallArea > 0) {
          const plasterArea = Number((totalWallArea * 2).toFixed(2));

          const plasterName = 'Plesteran Dinding Campuran 1 SP : 4 PP Tebal 15 mm';
          derivedItems.push({
            id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
            projectId,
            sourceDocumentId,
            name: plasterName,
            category: 'PLASTER',
            status: 'CONFIRMED',
            sourceType: 'CONSTRUCTION_RULE',
            evidenceIds: wallItems.flatMap(w => w.evidenceIds).slice(0, 3),
            sourcePages: wallItems.flatMap(w => w.sourcePages),
            dimensions: {
              area: { value: plasterArea, unit: 'm²', isMissing: false },
            },
            geometry: { shape: 'RECTANGULAR', notes: `Dihitung untuk 2 sisi dinding (2 x ${totalWallArea} m² = ${plasterArea} m²)` },
            unit: 'm²',
            calculationInputs: { area: plasterArea },
            confidence: 0.90,
            assumptions: ['Luas plesteran dihitung 2 sisi bidang dinding pasangan bata'],
            warnings: [],
            materialSpec: 'Semen Portland + Pasir Pasang adukan 1:4 t=15mm',
          });

          const acianName = 'Acian Semen Dinding';
          derivedItems.push({
            id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
            projectId,
            sourceDocumentId,
            name: acianName,
            category: 'PLASTER',
            status: 'CONFIRMED',
            sourceType: 'CONSTRUCTION_RULE',
            evidenceIds: wallItems.flatMap(w => w.evidenceIds).slice(0, 3),
            sourcePages: wallItems.flatMap(w => w.sourcePages),
            dimensions: {
              area: { value: plasterArea, unit: 'm²', isMissing: false },
            },
            geometry: { shape: 'RECTANGULAR', notes: `Dihitung setara luas plesteran dinding (${plasterArea} m²)` },
            unit: 'm²',
            calculationInputs: { area: plasterArea },
            confidence: 0.90,
            assumptions: ['Acian diterapkan pada seluruh permukaan plesteran dinding'],
            warnings: [],
            materialSpec: 'Semen abu-abu acian halus',
          });
        }
      }

      // If walls exist but paint is not itemized
      if (!hasPaint) {
        let totalWallArea = 0;
        for (const w of wallItems) {
          const l = w.calculationInputs.length || 0;
          const h = w.calculationInputs.height || 3.0;
          totalWallArea += (l * h);
        }

        if (totalWallArea > 0) {
          const paintArea = Number((totalWallArea * 2).toFixed(2));
          const paintName = 'Pengecatan Tembok Interior & Eksterior (1 Dasar + 2 Penutup)';
          derivedItems.push({
            id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
            projectId,
            sourceDocumentId,
            name: paintName,
            category: 'PAINTING',
            status: 'CONFIRMED',
            sourceType: 'CONSTRUCTION_RULE',
            evidenceIds: wallItems.flatMap(w => w.evidenceIds).slice(0, 3),
            sourcePages: wallItems.flatMap(w => w.sourcePages),
            dimensions: {
              area: { value: paintArea, unit: 'm²', isMissing: false },
            },
            geometry: { shape: 'RECTANGULAR', notes: `Dihitung untuk 2 sisi dinding (${paintArea} m²)` },
            unit: 'm²',
            calculationInputs: { area: paintArea },
            confidence: 0.90,
            assumptions: ['Pengecatan 3 lapis untuk seluruh bidang dinding'],
            warnings: [],
            materialSpec: 'Cat tembok emulsi interior/eksterior',
          });
        }
      }

      // Rule 2B: Ring Balok Beton Bertulang (di atas dinding)
      const hasRingBalok = existingWorkItems.some(i => i.name.toLowerCase().includes('ring balok') || i.name.toLowerCase().includes('balok ring'));
      if (!hasRingBalok) {
        let totalWallLength = 0;
        for (const w of wallItems) {
          totalWallLength += (w.calculationInputs.length || 0);
        }
        if (totalWallLength > 0) {
          const ringBalokName = 'Pekerjaan Ring Balok Beton Bertulang 15/15 cm';
          const rbVol = Number((totalWallLength * 0.15 * 0.15).toFixed(3));
          derivedItems.push({
            id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
            projectId,
            sourceDocumentId,
            name: ringBalokName,
            category: 'STRUCTURE_BEAM',
            status: 'CONFIRMED',
            sourceType: 'CONSTRUCTION_RULE',
            evidenceIds: wallItems.flatMap(w => w.evidenceIds).slice(0, 3),
            sourcePages: wallItems.flatMap(w => w.sourcePages),
            dimensions: {
              length: { value: totalWallLength, unit: 'm', isMissing: false },
              width: { value: 0.15, unit: 'm', isMissing: false },
              height: { value: 0.15, unit: 'm', isMissing: false },
            },
            geometry: { shape: 'RECTANGULAR', notes: `Ring balok di atas dinding (P=${totalWallLength} m, penampang 15x15 cm)` },
            unit: 'm³',
            calculationInputs: { length: totalWallLength, width: 0.15, height: 0.15 },
            confidence: 0.92,
            assumptions: ['Ring balok dipasang di atas keliling pasangan dinding as'],
            warnings: [],
            materialSpec: 'Beton K-225 + Besi Tulangan 4D10 + Begel D6-150',
          });
        }
      }
    }

    // 3. FOUNDATION EARTHWORK & BEDDING (Galian, Urugan Pasir, Aanstamping)
    const foundationItems = existingWorkItems.filter((i) => i.category === 'FOUNDATION' && i.status !== 'MISSING_DATA');
    if (foundationItems.length > 0) {
      let totalFoundLength = 0;
      let foundWidth = 0.80;
      let foundHeight = 0.80;
      for (const f of foundationItems) {
        totalFoundLength += (f.calculationInputs.length || 0);
        if (f.calculationInputs.width) foundWidth = f.calculationInputs.width;
        if (f.calculationInputs.height) foundHeight = f.calculationInputs.height;
      }

      if (totalFoundLength > 0) {
        // 3A. Galian Tanah Pondasi
        const hasGalian = existingWorkItems.some(i => i.name.toLowerCase().includes('galian'));
        if (!hasGalian) {
          const trenchWidth = Number((foundWidth + 0.20).toFixed(2));
          const trenchDepth = Number((foundHeight + 0.20).toFixed(2));
          const galianVol = Number((totalFoundLength * trenchWidth * trenchDepth).toFixed(3));
          derivedItems.push({
            id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
            projectId,
            sourceDocumentId,
            name: 'Pekerjaan Galian Tanah Biasa Kedalaman 1 m',
            category: 'SITEWORK',
            status: 'CONFIRMED',
            sourceType: 'CONSTRUCTION_RULE',
            evidenceIds: foundationItems.flatMap(f => f.evidenceIds).slice(0, 3),
            sourcePages: foundationItems.flatMap(f => f.sourcePages),
            dimensions: {
              length: { value: totalFoundLength, unit: 'm', isMissing: false },
              width: { value: trenchWidth, unit: 'm', isMissing: false },
              height: { value: trenchDepth, unit: 'm', isMissing: false },
            },
            geometry: { shape: 'RECTANGULAR', notes: `Galian pondasi (P=${totalFoundLength} m, L=${trenchWidth} m, T=${trenchDepth} m)` },
            unit: 'm³',
            calculationInputs: { length: totalFoundLength, width: trenchWidth, height: trenchDepth },
            confidence: 0.90,
            assumptions: ['Lebar dan kedalaman galian memperhitungkan ruang kerja dan tebal pasir urug'],
            warnings: [],
            materialSpec: 'Tanah biasa galian manual/semi mekanis',
          });
        }

        // 3B. Urugan Pasir Bawah Pondasi
        const hasUruganPasir = existingWorkItems.some(i => i.name.toLowerCase().includes('pasir urug') || i.name.toLowerCase().includes('urugan pasir'));
        if (!hasUruganPasir) {
          const pasirThick = 0.10;
          const pasirVol = Number((totalFoundLength * foundWidth * pasirThick).toFixed(3));
          derivedItems.push({
            id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
            projectId,
            sourceDocumentId,
            name: 'Pengurugan 1 m3 dengan Pasir Urug Bawah Pondasi t=10 cm',
            category: 'SITEWORK',
            status: 'CONFIRMED',
            sourceType: 'CONSTRUCTION_RULE',
            evidenceIds: foundationItems.flatMap(f => f.evidenceIds).slice(0, 3),
            sourcePages: foundationItems.flatMap(f => f.sourcePages),
            dimensions: {
              length: { value: totalFoundLength, unit: 'm', isMissing: false },
              width: { value: foundWidth, unit: 'm', isMissing: false },
              height: { value: pasirThick, unit: 'm', isMissing: false },
            },
            geometry: { shape: 'RECTANGULAR', notes: `Urugan pasir pondasi (P=${totalFoundLength} m, L=${foundWidth} m, t=0.10 m)` },
            unit: 'm³',
            calculationInputs: { length: totalFoundLength, width: foundWidth, height: pasirThick },
            confidence: 0.90,
            assumptions: ['Tebal hamparan pasir urug bawah pondasi 10 cm dipadatkan'],
            warnings: [],
            materialSpec: 'Pasir urug darat/quarry',
          });
        }
      }
    }

    // 4. FLOOR FINISH & CEILING (Lantai Keramik & Plafon Ruangan)
    if (spaces.length > 0) {
      const totalDryArea = spaces
        .filter(s => !s.name.toLowerCase().includes('kamar mandi') && !s.name.toLowerCase().includes('km'))
        .reduce((acc, s) => acc + (s.area || 0), 0);
      const totalAllArea = spaces.reduce((acc, s) => acc + (s.area || 0), 0);

      // 4A. Keramik Lantai Ruangan
      const hasTile = existingWorkItems.some(i => i.category === 'FLOOR_FINISH' && (i.name.toLowerCase().includes('keramik') || i.name.toLowerCase().includes('tile')));
      if (!hasTile && totalDryArea > 0) {
        const floorArea = Number(totalDryArea.toFixed(2));
        derivedItems.push({
          id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
          projectId,
          sourceDocumentId,
          name: 'Pemasangan Lantai Homogeneous Tile 60x60 cm Unpolished',
          category: 'FLOOR_FINISH',
          status: 'CONFIRMED',
          sourceType: 'CONSTRUCTION_RULE',
          evidenceIds: spaces.flatMap(s => s.evidenceIds).slice(0, 3),
          sourcePages: spaces.flatMap(s => s.sourcePages),
          dimensions: {
            area: { value: floorArea, unit: 'm²', isMissing: false },
          },
          geometry: { shape: 'RECTANGULAR', notes: `Total luas lantai ruangan kering (${floorArea} m²)` },
          unit: 'm²',
          calculationInputs: { area: floorArea },
          confidence: 0.90,
          assumptions: ['Luas lantai dihitung dari total area ruangan kering teridentifikasi'],
          warnings: [],
          materialSpec: 'Homogeneous tile 60x60 cm unpolished + mortar perekat',
        });
      }

      // 4B. Plafon Gypsum Board 9 mm Rangka Hollow
      const hasCeiling = existingWorkItems.some(i => i.category === 'CEILING' || i.name.toLowerCase().includes('plafon'));
      if (!hasCeiling && totalAllArea > 0) {
        const ceilArea = Number(totalAllArea.toFixed(2));
        derivedItems.push({
          id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
          projectId,
          sourceDocumentId,
          name: 'Pemasangan Plafon Gypsum Board Tebal 9 mm Rangka Hollow Galvanis',
          category: 'CEILING',
          status: 'CONFIRMED',
          sourceType: 'CONSTRUCTION_RULE',
          evidenceIds: spaces.flatMap(s => s.evidenceIds).slice(0, 3),
          sourcePages: spaces.flatMap(s => s.sourcePages),
          dimensions: {
            area: { value: ceilArea, unit: 'm²', isMissing: false },
          },
          geometry: { shape: 'RECTANGULAR', notes: `Total luas penutup plafon ruangan (${ceilArea} m²)` },
          unit: 'm²',
          calculationInputs: { area: ceilArea },
          confidence: 0.90,
          assumptions: ['Luas plafon setara luas lantai seluruh ruangan'],
          warnings: [],
          materialSpec: 'Papan gypsum 9 mm + rangka hollow 40x40 & 20x40 galvanis',
        });
      }
    }

    // 5. INVENTORY PEKERJAAN DENGAN STATUS MISSING_QTY (Jika Gambar Detail/Isometrik Tidak Ditemukan)
    // Aturan Krusial: JANGAN dianggap 0! Status MISSING_DATA / MISSING_QTY, volume = null.

    // 5A. Plumbing Air Bersih (Jika belum ada)
    const hasPlumbingClean = existingWorkItems.some(i => i.name.toLowerCase().includes('pipa air bersih') || i.name.toLowerCase().includes('air bersih'));
    if (!hasPlumbingClean && spaces.some(s => s.name.toLowerCase().includes('km') || s.name.toLowerCase().includes('kamar mandi'))) {
      derivedItems.push({
        id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
        projectId,
        sourceDocumentId,
        name: 'Instalasi Pipa Air Bersih PVC AW 3/4 inch',
        category: 'MEP',
        status: 'MISSING_DATA',
        sourceType: 'CONSTRUCTION_RULE',
        evidenceIds: bathroomSpaces.flatMap(s => s.evidenceIds).slice(0, 2),
        sourcePages: bathroomSpaces.flatMap(s => s.sourcePages),
        dimensions: {
          length: { value: null, unit: 'm', isMissing: true },
        },
        geometry: { shape: 'LINEAR', notes: 'Jalur pipa air bersih belum tergambar isometrik pada DED' },
        unit: "m'",
        calculationInputs: {},
        confidence: 0.50,
        assumptions: ['Pekerjaan instalasi pipa air bersih wajib diadakan untuk kamar mandi'],
        warnings: ['Panjang jalur pipa air bersih belum tertera pada gambar DED (Status: MISSING_QTY). Volume tidak diisi default nol/satu.'],
        materialSpec: 'Pipa PVC AW diameter 3/4 inch',
      });
    }

    // 5B. Elektrikal Titik Lampu (Jika belum ada)
    const hasElectric = existingWorkItems.some(i => i.name.toLowerCase().includes('titik lampu') || i.name.toLowerCase().includes('penerangan'));
    if (!hasElectric && spaces.length > 0) {
      derivedItems.push({
        id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
        projectId,
        sourceDocumentId,
        name: 'Pemasangan 1 Titik Instalasi Penerangan Lampu (Kabel NYM 3x2,5 mm)',
        category: 'MEP',
        status: 'MISSING_DATA',
        sourceType: 'CONSTRUCTION_RULE',
        evidenceIds: spaces.flatMap(s => s.evidenceIds).slice(0, 2),
        sourcePages: spaces.flatMap(s => s.sourcePages),
        dimensions: {
          count: { value: null, unit: 'titik', isMissing: true },
        },
        geometry: { shape: 'COUNT', notes: 'Denah titik instalasi listrik belum lengkap pada lembar DED' },
        unit: 'titik',
        calculationInputs: {},
        confidence: 0.50,
        assumptions: ['Setiap ruangan teridentifikasi membutuhkan titik penerangan lampu'],
        warnings: ['Jumlah titik instalasi penerangan belum terinci pada gambar denah listrik DED (Status: MISSING_QTY). Volume tidak diisi default nol/satu.'],
        materialSpec: 'Kabel NYM 3x2.5 mm dalam pipa conduit PVC high impact',
      });
    }

    // 5C. Atap (Jika belum ada)
    const hasRoof = existingWorkItems.some(i => i.category === 'ROOF' || i.name.toLowerCase().includes('atap'));
    if (!hasRoof && spaces.length > 0) {
      derivedItems.push({
        id: `DED-DERIVED-${String(seq++).padStart(3, '0')}`,
        projectId,
        sourceDocumentId,
        name: 'Pemasangan Rangka Atap Baja Ringan (Zincalume/Galvalume)',
        category: 'ROOF',
        status: 'MISSING_DATA',
        sourceType: 'CONSTRUCTION_RULE',
        evidenceIds: spaces.flatMap(s => s.evidenceIds).slice(0, 2),
        sourcePages: spaces.flatMap(s => s.sourcePages),
        dimensions: {
          area: { value: null, unit: 'm²', isMissing: true },
        },
        geometry: { shape: 'RECTANGULAR', notes: 'Denah rangka atap belum terlampir pada lembar DED' },
        unit: 'm²',
        calculationInputs: {},
        confidence: 0.50,
        assumptions: ['Bangunan rumah tinggal membutuhkan konstruksi atap penutup'],
        warnings: ['Gambar denah dan detail rangka atap belum ditemukan pada dokumen DED (Status: MISSING_QTY). Volume tidak diisi default nol/satu.'],
        materialSpec: 'Rangka baja ringan profil C-75.75 komplit reng',
      });
    }


    return derivedItems.map((item) => {
      const wbs = constructionNormalizer.resolveWbs(item.name, item.category);
      item.workCategory = wbs.canonicalCategory;
      item.workPackage = wbs.workPackage;
      item.workItem = wbs.workItem;
      item.quantitySource = 'DERIVED_RULE';
      item.entityType = 'CONSTRUCTION_WORK';
      item.rabEligible = false;
      item.validationStatus = 'EXTRACTED';
      item.dedFact = {
        entityType: 'CONSTRUCTION_WORK',
        rawText: item.name,
        confidence: item.confidence,
        pageNumber: item.sourcePages[0] || 1,
        evidenceId: item.evidenceIds[0] || 'EV-DERIVED',
      };
      item.dedObject = {
        objectId: `OBJ-${item.id}`,
        canonicalType: 'CONSTRUCTION_WORK',
        label: item.name,
        pageNumber: item.sourcePages[0] || 1,
        evidenceId: item.evidenceIds[0] || 'EV-DERIVED',
        location: 'Bangunan Keseluruhan',
        dimensions: item.calculationInputs,
        specification: item.materialSpec,
      };
      item.constructionWork = {
        workId: `WRK-${item.id}`,
        objectId: `OBJ-${item.id}`,
        wbsCategory: wbs.canonicalCategory,
        workPackage: wbs.workPackage,
        description: wbs.workItem,
        unit: item.unit,
        quantitySource: 'DERIVED_RULE',
        isDerived: true,
      };
      return item;
    });
  }
}

export const constructionCompletenessEngine = ConstructionCompletenessEngine.getInstance();
