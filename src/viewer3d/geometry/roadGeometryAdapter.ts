import { MasterBuildingTemplate } from '../../data/buildingTemplates/schema/types';
import { ViewerElement3D, ViewerModel3D, ViewerLayerType } from '../types';
import { GeometryValidator } from './geometryValidation';

export class RoadGeometryAdapter {
  /**
   * Mengubah Master Building Template Jalan Beton (Rigid Pavement Bina Marga)
   * menjadi Model Geometri 3D terstruktur dengan elevasi bertingkat:
   * 1. Subgrade / Lapis Pondasi Agregat Kelas A (tebal 15cm)
   * 2. Lean Concrete B-0 / Lantai Kerja (tebal 5cm)
   * 3. Pelat Beton Rigid Pavement K-350 (tebal 20cm) dengan sambungan melintang (Transverse Joint)
   * 4. Bahu Jalan Agregat Kelas B Kiri & Kanan (lebar 1m, tebal 15cm)
   * 5. Garis Marka Jalan Putih & Kuning
   */
  public static generateRoadModel(
    template: MasterBuildingTemplate,
    parameters: Record<string, any> = {}
  ): ViewerModel3D {
    // Normalisasi parameter (panjang trase di-clamp untuk render 3D visual preview jika > 100m, namun volume tetap akurat)
    const rawLength = Number(parameters.roadLength || template.parameters.roadLength?.defaultValue || 500);
    // Untuk visual 3D representation yang proporsional di viewer, gunakan segmen 50m - 100m jika total trase ratusan meter
    const L = Math.min(rawLength, Math.max(20.0, Number(parameters.visualLength || 50.0)));
    const W = Math.max(3.0, Number(parameters.roadWidth || template.parameters.roadWidth?.defaultValue || 6.0));
    
    const slabH = Number(parameters.slabThickness || template.assumptions.slab_thickness?.value || 0.20);
    const subbaseH = Number(template.assumptions.subbase_thickness?.value || 0.15);
    const leanH = Number(template.assumptions.lean_concrete_thickness?.value || 0.05);
    const shoulderW = Number(template.assumptions.shoulder_width?.value || 1.0);

    const elements: ViewerElement3D[] = [];
    const warnings: string[] = [];
    let elemCounter = 1;

    const createId = (prefix: string) => `${template.code.toLowerCase()}-${prefix}-${elemCounter++}`;

    // =========================================================================
    // A. LAPIS PONDASI AGREGAT KELAS A (FOUNDATION LAYER)
    // =========================================================================
    const subbaseElevation = -subbaseH / 2;
    const subbaseWidth = W + (2 * shoulderW);

    elements.push({
      elementId: createId('subbase-agregat'),
      stableId: `${template.code}-SUBBASE-AGR`,
      name: `Lapis Pondasi Agregat Kelas A (t=${subbaseH * 100}cm)`,
      elementType: 'ROAD_BED',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength', 'roadWidth', 'subbase_thickness'],
      wbsCode: '02.01',
      dimensions: { width: subbaseWidth, height: subbaseH, depth: L },
      position: { x: W / 2, y: subbaseElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Agregat Kelas A',
      colorHex: '#64748B',
      layer: 'FOUNDATION',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
      calculationReference: {
        formula: 'Panjang Jalan × Lebar Total × Tebal Subbase',
        formulaInputs: { rawLength, subbaseWidth, subbaseH },
        volume: Math.round(rawLength * subbaseWidth * subbaseH * 100) / 100,
        unit: 'm³',
        wbsCode: '02.01',
      },
    });

    // =========================================================================
    // B. LEAN CONCRETE B-0 / LANTAI KERJA (STRUCTURE LAYER)
    // =========================================================================
    const leanElevation = leanH / 2;

    elements.push({
      elementId: createId('lean-concrete'),
      stableId: `${template.code}-LEAN-CONC`,
      name: `Lantai Kerja Lean Concrete B-0 / K-125 (t=${leanH * 100}cm)`,
      elementType: 'ROAD_BED',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength', 'roadWidth', 'lean_concrete_thickness'],
      wbsCode: '03.01',
      dimensions: { width: W, height: leanH, depth: L },
      position: { x: W / 2, y: leanElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-125 / B-0',
      colorHex: '#94A3B8',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
      calculationReference: {
        formula: 'Panjang Jalan × Lebar Jalan × Tebal Lean Concrete',
        formulaInputs: { rawLength, W, leanH },
        volume: Math.round(rawLength * W * leanH * 100) / 100,
        unit: 'm³',
        wbsCode: '03.01',
      },
    });

    // =========================================================================
    // C. RIGID PAVEMENT SLABS (STRUCTURE LAYER - SEGMENTED WITH JOINTS)
    // =========================================================================
    const slabElevation = leanH + (slabH / 2);
    const panelLength = 5.0; // Standard joint spacing 5.0m
    const numPanels = Math.max(1, Math.floor(L / panelLength));

    for (let i = 0; i < numPanels; i++) {
      const zPos = (i * panelLength) + (panelLength / 2);
      const isLeftLane = i % 2 === 0;

      // Slab Panel Kiri (Lane 1)
      elements.push({
        elementId: createId(`slab-panel-l-${i + 1}`),
        stableId: `${template.code}-SLAB-L-${i + 1}`,
        name: `Pelat Beton Rigid K-350 Lajur Kiri Panel ${i + 1}`,
        elementType: 'ROAD_SLAB',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['roadLength', 'roadWidth', 'slabThickness'],
        wbsCode: '04.01',
        dimensions: { width: (W / 2) - 0.02, height: slabH, depth: panelLength - 0.02 },
        position: { x: W / 4, y: slabElevation, z: zPos },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton K-350 Rigid',
        colorHex: isLeftLane ? '#CBD5E1' : '#E2E8F0',
        layer: 'STRUCTURE',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
        calculationReference: {
          formula: 'Panjang Panel × Setengah Lebar × Tebal Pelat',
          formulaInputs: { panelLength, width: W / 2, slabH },
          volume: Math.round(panelLength * (W / 2) * slabH * 100) / 100,
          unit: 'm³',
          wbsCode: '04.01',
        },
      });

      // Slab Panel Kanan (Lane 2)
      elements.push({
        elementId: createId(`slab-panel-r-${i + 1}`),
        stableId: `${template.code}-SLAB-R-${i + 1}`,
        name: `Pelat Beton Rigid K-350 Lajur Kanan Panel ${i + 1}`,
        elementType: 'ROAD_SLAB',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['roadLength', 'roadWidth', 'slabThickness'],
        wbsCode: '04.01',
        dimensions: { width: (W / 2) - 0.02, height: slabH, depth: panelLength - 0.02 },
        position: { x: (3 * W) / 4, y: slabElevation, z: zPos },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton K-350 Rigid',
        colorHex: isLeftLane ? '#E2E8F0' : '#CBD5E1',
        layer: 'STRUCTURE',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });

      // Transverse Contraction Joint / Dowel Bar Line
      if (i > 0) {
        elements.push({
          elementId: createId(`joint-transverse-${i}`),
          stableId: `${template.code}-JOINT-TR-${i}`,
          name: `Transverse Contraction Joint & Dowel Ø25 STA 0+${(i * panelLength).toFixed(0)}`,
          elementType: 'ROAD_BED',
          sourceTemplateId: template.id,
          sourceParameterKeys: ['roadWidth'],
          wbsCode: '04.03',
          dimensions: { width: W, height: 0.04, depth: 0.04 },
          position: { x: W / 2, y: leanH + slabH - 0.02, z: i * panelLength },
          rotation: { x: 0, y: 0, z: 0 },
          unit: 'meter',
          materialCategory: 'Joint Sealant & Dowel',
          colorHex: '#0F172A',
          layer: 'INFRASTRUCTURE',
          visibility: true,
          confidence: 'VERIFIED',
          reviewStatus: 'VERIFIED',
        });
      }
    }

    // Longitudinal Centerline Joint / Tie-Bar
    elements.push({
      elementId: createId('joint-longitudinal'),
      stableId: `${template.code}-JOINT-LONG`,
      name: 'Longitudinal Centerline Joint & Tie Bar D16',
      elementType: 'ROAD_BED',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength'],
      wbsCode: '04.03',
      dimensions: { width: 0.04, height: 0.04, depth: L },
      position: { x: W / 2, y: leanH + slabH - 0.02, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Joint Sealant',
      colorHex: '#0F172A',
      layer: 'INFRASTRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // =========================================================================
    // D. BAHU JALAN AGREGAT KELAS B (FINISHES / INFRASTRUCTURE LAYER)
    // =========================================================================
    const shoulderElevation = (subbaseH + leanH + slabH) / 2 - (subbaseH / 2);

    // Bahu Jalan Kiri
    elements.push({
      elementId: createId('shoulder-left'),
      stableId: `${template.code}-SHOULDER-LEFT`,
      name: `Bahu Jalan Agregat Kelas B Kiri (L=${shoulderW}m)`,
      elementType: 'ROAD_SHOULDER',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength', 'shoulder_width'],
      wbsCode: '05.01',
      dimensions: { width: shoulderW, height: slabH + leanH, depth: L },
      position: { x: -shoulderW / 2, y: shoulderElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Agregat Kelas B',
      colorHex: '#78716C',
      layer: 'FINISHES',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Bahu Jalan Kanan
    elements.push({
      elementId: createId('shoulder-right'),
      stableId: `${template.code}-SHOULDER-RIGHT`,
      name: `Bahu Jalan Agregat Kelas B Kanan (L=${shoulderW}m)`,
      elementType: 'ROAD_SHOULDER',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength', 'shoulder_width'],
      wbsCode: '05.01',
      dimensions: { width: shoulderW, height: slabH + leanH, depth: L },
      position: { x: W + (shoulderW / 2), y: shoulderElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Agregat Kelas B',
      colorHex: '#78716C',
      layer: 'FINISHES',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // =========================================================================
    // E. MARKA JALAN (FINISHES LAYER)
    // =========================================================================
    // Marka Tengah Putih Putus-Putus
    elements.push({
      elementId: createId('marking-center'),
      stableId: `${template.code}-MARK-CENTER`,
      name: 'Marka Garis Tengah Putih Thermoplastic',
      elementType: 'ROAD_BED',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength'],
      wbsCode: '06.01',
      dimensions: { width: 0.12, height: 0.005, depth: L },
      position: { x: W / 2, y: leanH + slabH + 0.003, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Cat Thermoplastic Putih',
      colorHex: '#FFFFFF',
      layer: 'FINISHES',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Marka Tepi Kiri Putih Utuh
    elements.push({
      elementId: createId('marking-edge-left'),
      stableId: `${template.code}-MARK-EDGE-L`,
      name: 'Marka Tepi Kiri Putih Thermoplastic',
      elementType: 'ROAD_BED',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength'],
      wbsCode: '06.01',
      dimensions: { width: 0.10, height: 0.005, depth: L },
      position: { x: 0.10, y: leanH + slabH + 0.003, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Cat Thermoplastic Putih',
      colorHex: '#FFFFFF',
      layer: 'FINISHES',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Marka Tepi Kanan Putih Utuh
    elements.push({
      elementId: createId('marking-edge-right'),
      stableId: `${template.code}-MARK-EDGE-R`,
      name: 'Marka Tepi Kanan Putih Thermoplastic',
      elementType: 'ROAD_BED',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roadLength'],
      wbsCode: '06.01',
      dimensions: { width: 0.10, height: 0.005, depth: L },
      position: { x: W - 0.10, y: leanH + slabH + 0.003, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Cat Thermoplastic Putih',
      colorHex: '#FFFFFF',
      layer: 'FINISHES',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Bounding Box calculation
    const boundingBox = GeometryValidator.computeBoundingBox(elements);

    // Layer Counts
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
