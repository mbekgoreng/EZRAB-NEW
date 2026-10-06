import { MasterBuildingTemplate } from '../../data/buildingTemplates/schema/types';
import { ViewerElement3D, ViewerModel3D, ViewerLayerType } from '../types';
import { GeometryValidator } from './geometryValidation';

export class DrainageGeometryAdapter {
  /**
   * Mengubah Master Building Template Saluran Precast U-Ditch (SDA & Bina Marga)
   * menjadi Model Geometri 3D terstruktur dengan profil saluran U-channel akurat:
   * 1. Galian Tanah Saluran (Trench Excavation)
   * 2. Pasir Urug Alas Saluran (Sand Bedding t=10cm)
   * 3. Lantai Kerja Beton Bo (Lean Concrete t=5cm)
   * 4. Precast U-Ditch Channel Segments (Bottom slab + Left wall + Right wall, L=1.20m per unit)
   * 5. Precast Cover Slabs (Heavy Duty / Light Duty dengan lubang kontrol)
   * 6. Urugan Tanah Kembali Samping Saluran
   */
  public static generateDrainageModel(
    template: MasterBuildingTemplate,
    parameters: Record<string, any> = {}
  ): ViewerModel3D {
    const rawLength = Number(parameters.drainageLength || template.parameters.drainageLength?.defaultValue || 100);
    // Visual length representation clamped for viewport clarity (e.g. 24m = 20 segment @ 1.2m)
    const L = Math.min(rawLength, Math.max(12.0, Number(parameters.visualLength || 24.0)));
    
    const innerW = Number(parameters.uDitchWidth || template.parameters.uDitchWidth?.defaultValue || 0.40);
    const innerH = Number(parameters.uDitchHeight || template.parameters.uDitchHeight?.defaultValue || 0.40);
    const wallThick = Number(parameters.uDitchWallThickness || template.parameters.uDitchWallThickness?.defaultValue || 0.07);
    const bottomThick = wallThick; // Tebal dasar U-Ditch
    const coverType = String(parameters.coverType || template.parameters.coverType?.defaultValue || 'HEAVY_DUTY');

    const clearance = Number(template.assumptions.trench_side_clearance?.value || 0.15);
    const sandH = Number(template.assumptions.sand_bed_thickness?.value || 0.10);
    const leanH = Number(template.assumptions.lean_concrete_thickness?.value || 0.05);

    const outerW = innerW + (2 * wallThick);
    const outerH = innerH + bottomThick;
    const trenchW = outerW + (2 * clearance);
    const trenchH = outerH + sandH + leanH;

    const elements: ViewerElement3D[] = [];
    const warnings: string[] = [];
    let elemCounter = 1;

    const createId = (prefix: string) => `${template.code.toLowerCase()}-${prefix}-${elemCounter++}`;

    // =========================================================================
    // A. STRUKTUR GALIAN & LAPISAN DASAR (FOUNDATION / DRAINAGE LAYER)
    // =========================================================================
    // Pasir Urug Alas (Sand Bedding)
    const sandElevation = -(trenchH) + (sandH / 2);
    elements.push({
      elementId: createId('sand-bedding'),
      stableId: `${template.code}-SAND-BED`,
      name: `Pasir Urug Bawah Saluran (t=${sandH * 100}cm)`,
      elementType: 'DRAINAGE_CHANNEL',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['drainageLength', 'sand_bed_thickness'],
      wbsCode: '02.01',
      dimensions: { width: trenchW, height: sandH, depth: L },
      position: { x: outerW / 2, y: sandElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Pasir Urug',
      colorHex: '#FBBF24',
      layer: 'FOUNDATION',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
      calculationReference: {
        formula: 'Panjang Saluran × Lebar Galian × Tebal Pasir',
        formulaInputs: { rawLength, trenchW, sandH },
        volume: Math.round(rawLength * trenchW * sandH * 100) / 100,
        unit: 'm³',
        wbsCode: '02.01',
      },
    });

    // Lantai Kerja Beton Bo (Lean Concrete)
    const leanElevation = -(trenchH) + sandH + (leanH / 2);
    elements.push({
      elementId: createId('lean-concrete'),
      stableId: `${template.code}-LEAN-CONC`,
      name: `Lantai Kerja Beton Bo (t=${leanH * 100}cm)`,
      elementType: 'DRAINAGE_CHANNEL',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['drainageLength', 'lean_concrete_thickness'],
      wbsCode: '03.01',
      dimensions: { width: outerW, height: leanH, depth: L },
      position: { x: outerW / 2, y: leanElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton Bo / K-125',
      colorHex: '#94A3B8',
      layer: 'FOUNDATION',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // =========================================================================
    // B. PRECAST U-DITCH CHANNEL UNITS (STRUCTURE / DRAINAGE LAYER)
    // =========================================================================
    // Segments of U-Ditch (Standard length = 1.20m per precast block)
    const unitLength = 1.20;
    const numUnits = Math.max(1, Math.floor(L / unitLength));
    const uDitchBaseY = -(outerH); // Elevation at top of lean concrete = -outerH

    for (let i = 0; i < numUnits; i++) {
      const zPos = (i * unitLength) + (unitLength / 2);
      const isAltColor = i % 2 === 0;

      // 1. Bottom Slab of U-Ditch
      elements.push({
        elementId: createId(`uditch-bot-${i + 1}`),
        stableId: `${template.code}-BOT-${i + 1}`,
        name: `U-Ditch Precast ${innerW * 100}x${innerH * 100} cm Unit ${i + 1} (Pelat Bawah)`,
        elementType: 'DRAINAGE_CHANNEL',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['uDitchWidth', 'uDitchHeight', 'uDitchWallThickness'],
        wbsCode: '04.01',
        dimensions: { width: outerW, height: bottomThick, depth: unitLength - 0.01 },
        position: { x: outerW / 2, y: uDitchBaseY + (bottomThick / 2), z: zPos },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton Precast K-350',
        colorHex: isAltColor ? '#64748B' : '#475569',
        layer: 'DRAINAGE',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });

      // 2. Left Wall of U-Ditch
      elements.push({
        elementId: createId(`uditch-wall-l-${i + 1}`),
        stableId: `${template.code}-WALL-L-${i + 1}`,
        name: `Dinding Kiri U-Ditch Unit ${i + 1}`,
        elementType: 'DRAINAGE_CHANNEL',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['uDitchHeight', 'uDitchWallThickness'],
        wbsCode: '04.01',
        dimensions: { width: wallThick, height: innerH, depth: unitLength - 0.01 },
        position: { x: wallThick / 2, y: uDitchBaseY + bottomThick + (innerH / 2), z: zPos },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton Precast K-350',
        colorHex: isAltColor ? '#64748B' : '#475569',
        layer: 'DRAINAGE',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });

      // 3. Right Wall of U-Ditch
      elements.push({
        elementId: createId(`uditch-wall-r-${i + 1}`),
        stableId: `${template.code}-WALL-R-${i + 1}`,
        name: `Dinding Kanan U-Ditch Unit ${i + 1}`,
        elementType: 'DRAINAGE_CHANNEL',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['uDitchHeight', 'uDitchWallThickness'],
        wbsCode: '04.01',
        dimensions: { width: wallThick, height: innerH, depth: unitLength - 0.01 },
        position: { x: outerW - (wallThick / 2), y: uDitchBaseY + bottomThick + (innerH / 2), z: zPos },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton Precast K-350',
        colorHex: isAltColor ? '#64748B' : '#475569',
        layer: 'DRAINAGE',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });

      // 4. Precast Cover Slab (0.60m length each, 2 covers per 1.2m unit)
      if (coverType !== 'TANPA_COVER') {
        const coverThick = coverType === 'HEAVY_DUTY' ? 0.10 : 0.07;
        const coverLen = unitLength / 2;

        for (let c = 0; c < 2; c++) {
          const coverZ = (i * unitLength) + (c * coverLen) + (coverLen / 2);
          const coverIdx = (i * 2) + c + 1;

          elements.push({
            elementId: createId(`cover-${coverIdx}`),
            stableId: `${template.code}-COVER-${coverIdx}`,
            name: `Cover U-Ditch Precast ${coverType === 'HEAVY_DUTY' ? 'Heavy Duty' : 'Light Duty'} (${coverIdx})`,
            elementType: 'DRAINAGE_COVER',
            sourceTemplateId: template.id,
            sourceParameterKeys: ['coverType', 'uDitchWidth'],
            wbsCode: '05.01',
            dimensions: { width: outerW, height: coverThick, depth: coverLen - 0.01 },
            position: { x: outerW / 2, y: (coverThick / 2), z: coverZ },
            rotation: { x: 0, y: 0, z: 0 },
            unit: 'meter',
            materialCategory: 'Beton Precast K-350 HD',
            colorHex: coverType === 'HEAVY_DUTY' ? '#334155' : '#64748B',
            layer: 'OPENINGS',
            visibility: true,
            confidence: 'VERIFIED',
            reviewStatus: 'VERIFIED',
            calculationReference: {
              formula: 'Jumlah Buah Cover Precast Ukuran Sesuai Saluran',
              formulaInputs: { count: numUnits * 2, coverType },
              volume: numUnits * 2,
              unit: 'bh',
              wbsCode: '05.01',
            },
          });
        }
      }
    }

    // =========================================================================
    // C. URUGAN KEMBALI SAMPING SALURAN (FINISHES / DRAINAGE LAYER)
    // =========================================================================
    // Sisi Kiri
    elements.push({
      elementId: createId('backfill-left'),
      stableId: `${template.code}-BACKFILL-LEFT`,
      name: 'Urugan Tanah Kembali Sisi Kiri Saluran',
      elementType: 'DRAINAGE_CHANNEL',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['trench_side_clearance'],
      wbsCode: '06.01',
      dimensions: { width: clearance, height: outerH, depth: L },
      position: { x: -clearance / 2, y: -outerH / 2, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Tanah Urug Padat',
      colorHex: '#A16207',
      layer: 'DRAINAGE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Sisi Kanan
    elements.push({
      elementId: createId('backfill-right'),
      stableId: `${template.code}-BACKFILL-RIGHT`,
      name: 'Urugan Tanah Kembali Sisi Kanan Saluran',
      elementType: 'DRAINAGE_CHANNEL',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['trench_side_clearance'],
      wbsCode: '06.01',
      dimensions: { width: clearance, height: outerH, depth: L },
      position: { x: outerW + (clearance / 2), y: -outerH / 2, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Tanah Urug Padat',
      colorHex: '#A16207',
      layer: 'DRAINAGE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Bounding Box
    const boundingBox = GeometryValidator.computeBoundingBox(elements);

    // Layer counts
    const layerCounts: Record<ViewerLayerType, number> = {
      FOUNDATION: 0,
      STRUCTURE: 0,
      WALLS: 0,
      OPENINGS: 0,
      ROOF: 0,
      SLAB: 0,
      FINISHES: 0,
      INFRASTRUCTURE: 0,
      DRAINAGE: 0,
      GRID: 0,
    };

    for (const el of elements) {
      if (layerCounts[el.layer] !== undefined) {
        layerCounts[el.layer]++;
      }
    }

    return {
      modelId: `model-${template.code.toLowerCase()}-${Date.now()}`,
      templateId: template.id,
      templateCode: template.code,
      templateName: template.name,
      boundingBox,
      elements,
      layerCounts,
      warnings,
      generatedAt: new Date().toISOString(),
      isDeterministic: true,
    };
  }
}
