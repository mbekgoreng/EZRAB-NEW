import { MasterBuildingTemplate } from '../../data/buildingTemplates/schema/types';
import { ViewerElement3D, ViewerModel3D, ViewerLayerType } from '../types';
import { GeometryValidator } from './geometryValidation';
import { SpaceGridPacker } from './spaceGridPacker';

export class BuildingGeometryAdapter {
  /**
   * Mengubah Master Building Template Rumah Tinggal (Tipe 36, 45, 70, 2 Lantai) dan Ruko
   * menjadi Model Geometri 3D terstruktur dengan koordinat eksak, layer, dan link WBS.
   */
  public static generateBuildingModel(
    template: MasterBuildingTemplate,
    parameters: Record<string, any> = {}
  ): ViewerModel3D {
    const W = Math.max(3.0, Number(parameters.buildingWidth || template.parameters.buildingWidth?.defaultValue || 6.0));
    const L = Math.max(3.0, Number(parameters.buildingLength || template.parameters.buildingLength?.defaultValue || 6.0));
    const wallHeight = Math.max(2.5, Number(template.assumptions.wall_height?.value || 3.5));
    const sloofW = Number(template.assumptions.sloof_width?.value || 0.15);
    const sloofH = Number(template.assumptions.sloof_height?.value || 0.20);
    const kolomSize = Number(template.assumptions.kolom_size?.value || 0.15);
    const ringSize = Number(template.assumptions.ring_balok_size?.value || 0.15);
    const pondasiH = Number(template.assumptions.pondasi_height?.value || 0.60);
    const pondasiTopW = Number(template.assumptions.pondasi_top_width?.value || 0.30);
    const pondasiBottomW = Number(template.assumptions.pondasi_bottom_width?.value || 0.60);
    const roofOverhang = Number(template.assumptions.roof_overhang?.value || 0.80);
    const roofSlopeDeg = Number(template.assumptions.roof_slope_angle?.value || 30);
    const floorCount = Number(parameters.floorCount || template.parameters.floorCount?.defaultValue || 1);

    const elements: ViewerElement3D[] = [];
    const warnings: string[] = [];
    let elemCounter = 1;

    const createId = (prefix: string) => `${template.code.toLowerCase()}-${prefix}-${elemCounter++}`;

    // 1. Spatial Breakdown of Rooms
    const packedSpaces = SpaceGridPacker.packResidentialSpaces(W, L, template.spaces);

    // =========================================================================
    // A. PONDASI BATU KALI (FOUNDATION LAYER)
    // =========================================================================
    // Perimeter strips: Front, Back, Left, Right
    const pondasiElevation = -pondasiH / 2;

    // Front Pondasi
    elements.push({
      elementId: createId('fnd-front'),
      stableId: `${template.code}-FND-FRONT`,
      name: 'Pondasi Batu Kali Depan',
      elementType: 'PONDASI',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'pondasi_height'],
      wbsCode: '03.01',
      dimensions: { width: W, height: pondasiH, depth: (pondasiTopW + pondasiBottomW) / 2 },
      position: { x: W / 2, y: pondasiElevation, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Batu Kali',
      colorHex: '#64748B',
      layer: 'FOUNDATION',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
      calculationReference: {
        formula: 'Panjang × Luas Penampang Trapesium',
        formulaInputs: { W, pondasiH, pondasiTopW, pondasiBottomW },
        volume: Math.round(W * ((pondasiTopW + pondasiBottomW) / 2) * pondasiH * 100) / 100,
        unit: 'm³',
        wbsCode: '03.01',
      },
    });

    // Back Pondasi
    elements.push({
      elementId: createId('fnd-back'),
      stableId: `${template.code}-FND-BACK`,
      name: 'Pondasi Batu Kali Belakang',
      elementType: 'PONDASI',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'pondasi_height'],
      wbsCode: '03.01',
      dimensions: { width: W, height: pondasiH, depth: (pondasiTopW + pondasiBottomW) / 2 },
      position: { x: W / 2, y: pondasiElevation, z: L },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Batu Kali',
      colorHex: '#64748B',
      layer: 'FOUNDATION',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Left Pondasi
    elements.push({
      elementId: createId('fnd-left'),
      stableId: `${template.code}-FND-LEFT`,
      name: 'Pondasi Batu Kali Samping Kiri',
      elementType: 'PONDASI',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'pondasi_height'],
      wbsCode: '03.01',
      dimensions: { width: (pondasiTopW + pondasiBottomW) / 2, height: pondasiH, depth: L },
      position: { x: 0, y: pondasiElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Batu Kali',
      colorHex: '#64748B',
      layer: 'FOUNDATION',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Right Pondasi
    elements.push({
      elementId: createId('fnd-right'),
      stableId: `${template.code}-FND-RIGHT`,
      name: 'Pondasi Batu Kali Samping Kanan',
      elementType: 'PONDASI',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'pondasi_height'],
      wbsCode: '03.01',
      dimensions: { width: (pondasiTopW + pondasiBottomW) / 2, height: pondasiH, depth: L },
      position: { x: W, y: pondasiElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Batu Kali',
      colorHex: '#64748B',
      layer: 'FOUNDATION',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Interior Pondasi Cross-Dividers
    packedSpaces.forEach((sp, idx) => {
      if (sp.x > 0 && sp.x < W) {
        elements.push({
          elementId: createId(`fnd-part-${idx}`),
          stableId: `${template.code}-FND-PART-${idx}`,
          name: `Pondasi Partisi Sekat ${sp.name}`,
          elementType: 'PONDASI',
          sourceTemplateId: template.id,
          sourceParameterKeys: ['pondasi_height'],
          wbsCode: '03.01',
          dimensions: { width: (pondasiTopW + pondasiBottomW) / 2, height: pondasiH, depth: sp.length },
          position: { x: sp.x, y: pondasiElevation, z: sp.z + (sp.length / 2) },
          rotation: { x: 0, y: 0, z: 0 },
          unit: 'meter',
          materialCategory: 'Batu Kali',
          colorHex: '#475569',
          layer: 'FOUNDATION',
          visibility: true,
          confidence: 'DERIVED',
          reviewStatus: 'VERIFIED',
        });
      }
    });

    // =========================================================================
    // B. STRUKTUR SLOOF BETON BERTULANG (STRUCTURE LAYER)
    // =========================================================================
    const sloofElevation = sloofH / 2;

    // Perimeter Sloof
    elements.push({
      elementId: createId('sloof-front'),
      stableId: `${template.code}-SLOOF-FRONT`,
      name: 'Sloof Beton 15/20 cm Depan',
      elementType: 'SLOOF',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'sloof_width', 'sloof_height'],
      wbsCode: '04.01',
      dimensions: { width: W, height: sloofH, depth: sloofW },
      position: { x: W / 2, y: sloofElevation, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#38BDF8',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    elements.push({
      elementId: createId('sloof-back'),
      stableId: `${template.code}-SLOOF-BACK`,
      name: 'Sloof Beton 15/20 cm Belakang',
      elementType: 'SLOOF',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'sloof_width', 'sloof_height'],
      wbsCode: '04.01',
      dimensions: { width: W, height: sloofH, depth: sloofW },
      position: { x: W / 2, y: sloofElevation, z: L },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#38BDF8',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    elements.push({
      elementId: createId('sloof-left'),
      stableId: `${template.code}-SLOOF-LEFT`,
      name: 'Sloof Beton 15/20 cm Samping Kiri',
      elementType: 'SLOOF',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'sloof_width', 'sloof_height'],
      wbsCode: '04.01',
      dimensions: { width: sloofW, height: sloofH, depth: L },
      position: { x: 0, y: sloofElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#38BDF8',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    elements.push({
      elementId: createId('sloof-right'),
      stableId: `${template.code}-SLOOF-RIGHT`,
      name: 'Sloof Beton 15/20 cm Samping Kanan',
      elementType: 'SLOOF',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'sloof_width', 'sloof_height'],
      wbsCode: '04.01',
      dimensions: { width: sloofW, height: sloofH, depth: L },
      position: { x: W, y: sloofElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#38BDF8',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // =========================================================================
    // C. STRUKTUR KOLOM PRAKTIS (12 TITIK) (STRUCTURE LAYER)
    // =========================================================================
    // Grid junctions for columns: corners + internal space partition intersections
    const columnPositions: Array<{ x: number; z: number; label: string }> = [
      // 4 Exterior corners
      { x: 0, z: 0, label: 'Sudut Depan Kiri' },
      { x: W, z: 0, label: 'Sudut Depan Kanan' },
      { x: 0, z: L, label: 'Sudut Belakang Kiri' },
      { x: W, z: L, label: 'Sudut Belakang Kanan' },
      // Mid-points on perimeter
      { x: W * 0.52, z: 0, label: 'Kolom Muka Tengah' },
      { x: W * 0.52, z: L, label: 'Kolom Belakang Tengah' },
      { x: 0, z: L * 0.55, label: 'Kolom Kiri Tengah' },
      { x: W, z: L * 0.55, label: 'Kolom Kanan Tengah' },
      // Interior intersections
      { x: W * 0.52, z: L * 0.55, label: 'Kolom Partisi Tengah' },
      { x: W * 0.23, z: L * 0.55, label: 'Kolom Sekat Kamar Mandi' },
      { x: W * 0.23, z: L, label: 'Kolom Belakang Kamar Mandi' },
      { x: W * 0.52, z: L * 0.25, label: 'Kolom Ruang Tamu / Kamar' },
    ];

    const columnElevation = sloofH + (wallHeight / 2);

    columnPositions.forEach((cp, idx) => {
      elements.push({
        elementId: createId(`col-${idx + 1}`),
        stableId: `${template.code}-COL-${idx + 1}`,
        name: `Kolom Praktis 15/15 (${cp.label})`,
        elementType: 'KOLOM',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['wall_height', 'kolom_size'],
        wbsCode: '04.02',
        dimensions: { width: kolomSize, height: wallHeight, depth: kolomSize },
        position: { x: cp.x, y: columnElevation, z: cp.z },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton K-225',
        colorHex: '#0284C7',
        layer: 'STRUCTURE',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });
    });

    // =========================================================================
    // D. DINDING BATA RINGAN & BUKAAN (WALLS & OPENINGS LAYER)
    // =========================================================================
    const wallThick = 0.10; // Hebel 10cm
    const wallElevation = sloofH + (wallHeight / 2);

    // Front Wall with Door (0.9x2.1m) and Window (1.2x1.4m)
    elements.push({
      elementId: createId('wall-front-left'),
      stableId: `${template.code}-WALL-FRONT-1`,
      name: 'Dinding Depan Muka Teras',
      elementType: 'DINDING',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'wall_height'],
      wbsCode: '05.01',
      dimensions: { width: W * 0.52 - 0.9, height: wallHeight, depth: wallThick },
      position: { x: (W * 0.52 - 0.9) / 2, y: wallElevation, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Bata Ringan Hebel',
      colorHex: '#E2E8F0',
      layer: 'WALLS',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Main Door Element
    elements.push({
      elementId: createId('door-main'),
      stableId: `${template.code}-DOOR-MAIN`,
      name: 'Pintu Utama Kayu Solid / Aluminium 90x210 cm',
      elementType: 'PINTU',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['doorWindowType'],
      wbsCode: '10.01',
      dimensions: { width: 0.9, height: 2.1, depth: 0.05 },
      position: { x: W * 0.52 - 0.45, y: sloofH + (2.1 / 2), z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Kayu Kamper / Aluminium',
      colorHex: '#D97706',
      layer: 'OPENINGS',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Front Wall Right with Window
    elements.push({
      elementId: createId('wall-front-right'),
      stableId: `${template.code}-WALL-FRONT-2`,
      name: 'Dinding Depan Kamar Utama',
      elementType: 'DINDING',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'wall_height'],
      wbsCode: '05.01',
      dimensions: { width: W * 0.48, height: wallHeight, depth: wallThick },
      position: { x: W * 0.52 + (W * 0.48 / 2), y: wallElevation, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Bata Ringan Hebel',
      colorHex: '#E2E8F0',
      layer: 'WALLS',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Front Window
    elements.push({
      elementId: createId('window-front'),
      stableId: `${template.code}-WIN-FRONT`,
      name: 'Jendela Kaca Aluminium Kamar Depan 120x140 cm',
      elementType: 'JENDELA',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['doorWindowType'],
      wbsCode: '10.02',
      dimensions: { width: 1.2, height: 1.4, depth: 0.05 },
      position: { x: W * 0.52 + (W * 0.48 / 2), y: sloofH + 0.9 + (1.4 / 2), z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Kaca & Kusen Aluminium',
      colorHex: '#38BDF8',
      layer: 'OPENINGS',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Back Wall
    elements.push({
      elementId: createId('wall-back'),
      stableId: `${template.code}-WALL-BACK`,
      name: 'Dinding Belakang Rumah',
      elementType: 'DINDING',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'wall_height'],
      wbsCode: '05.01',
      dimensions: { width: W, height: wallHeight, depth: wallThick },
      position: { x: W / 2, y: wallElevation, z: L },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Bata Ringan Hebel',
      colorHex: '#E2E8F0',
      layer: 'WALLS',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Left Wall
    elements.push({
      elementId: createId('wall-left'),
      stableId: `${template.code}-WALL-LEFT`,
      name: 'Dinding Samping Kiri',
      elementType: 'DINDING',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'wall_height'],
      wbsCode: '05.01',
      dimensions: { width: wallThick, height: wallHeight, depth: L },
      position: { x: 0, y: wallElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Bata Ringan Hebel',
      colorHex: '#E2E8F0',
      layer: 'WALLS',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Right Wall
    elements.push({
      elementId: createId('wall-right'),
      stableId: `${template.code}-WALL-RIGHT`,
      name: 'Dinding Samping Kanan',
      elementType: 'DINDING',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'wall_height'],
      wbsCode: '05.01',
      dimensions: { width: wallThick, height: wallHeight, depth: L },
      position: { x: W, y: wallElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Bata Ringan Hebel',
      colorHex: '#E2E8F0',
      layer: 'WALLS',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Interior Partition Walls
    packedSpaces.forEach((sp, idx) => {
      if (sp.x > 0 && sp.x < W) {
        elements.push({
          elementId: createId(`wall-part-${idx}`),
          stableId: `${template.code}-WALL-PART-${idx}`,
          name: `Dinding Partisi ${sp.name}`,
          elementType: 'DINDING',
          sourceTemplateId: template.id,
          sourceParameterKeys: ['wall_height'],
          wbsCode: '05.01',
          dimensions: { width: wallThick, height: wallHeight, depth: sp.length },
          position: { x: sp.x, y: wallElevation, z: sp.z + (sp.length / 2) },
          rotation: { x: 0, y: 0, z: 0 },
          unit: 'meter',
          materialCategory: 'Bata Ringan Hebel',
          colorHex: '#CBD5E1',
          layer: 'WALLS',
          visibility: true,
          confidence: 'DERIVED',
          reviewStatus: 'VERIFIED',
        });
      }
    });

    // =========================================================================
    // E. RING BALOK BETON (STRUCTURE LAYER)
    // =========================================================================
    const ringElevation = sloofH + wallHeight + (ringSize / 2);

    elements.push({
      elementId: createId('ring-front'),
      stableId: `${template.code}-RING-FRONT`,
      name: 'Ring Balok Beton 15/15 cm Depan',
      elementType: 'RING_BALOK',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'ring_balok_size'],
      wbsCode: '04.03',
      dimensions: { width: W, height: ringSize, depth: ringSize },
      position: { x: W / 2, y: ringElevation, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#0284C7',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    elements.push({
      elementId: createId('ring-back'),
      stableId: `${template.code}-RING-BACK`,
      name: 'Ring Balok Beton 15/15 cm Belakang',
      elementType: 'RING_BALOK',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingWidth', 'ring_balok_size'],
      wbsCode: '04.03',
      dimensions: { width: W, height: ringSize, depth: ringSize },
      position: { x: W / 2, y: ringElevation, z: L },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#0284C7',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    elements.push({
      elementId: createId('ring-left'),
      stableId: `${template.code}-RING-LEFT`,
      name: 'Ring Balok Beton 15/15 cm Kiri',
      elementType: 'RING_BALOK',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'ring_balok_size'],
      wbsCode: '04.03',
      dimensions: { width: ringSize, height: ringSize, depth: L },
      position: { x: 0, y: ringElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#0284C7',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    elements.push({
      elementId: createId('ring-right'),
      stableId: `${template.code}-RING-RIGHT`,
      name: 'Ring Balok Beton 15/15 cm Kanan',
      elementType: 'RING_BALOK',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'ring_balok_size'],
      wbsCode: '04.03',
      dimensions: { width: ringSize, height: ringSize, depth: L },
      position: { x: W, y: ringElevation, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Beton K-225',
      colorHex: '#0284C7',
      layer: 'STRUCTURE',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // =========================================================================
    // F. PLAFON GYPSUM (FINISHES LAYER)
    // =========================================================================
    elements.push({
      elementId: createId('ceiling'),
      stableId: `${template.code}-CEILING`,
      name: 'Plafon Gypsum Board 9 mm Rangka Hollow',
      elementType: 'PLAFON',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingArea'],
      wbsCode: '08.01',
      dimensions: { width: W, height: 0.02, depth: L },
      position: { x: W / 2, y: sloofH + wallHeight - 0.05, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Gypsum 9mm',
      colorHex: '#F8FAFC',
      layer: 'FINISHES',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // =========================================================================
    // G. RANGKA & PENUTUP ATAP (ROOF LAYER)
    // =========================================================================
    // Gable Roof: Left Slope and Right Slope meeting at center ridge
    const roofBaseY = sloofH + wallHeight + ringSize;
    const ridgeRise = ((W / 2) + roofOverhang) * Math.tan((roofSlopeDeg * Math.PI) / 180);
    const roofRidgeY = roofBaseY + ridgeRise;
    const roofSpanX = (W / 2) + roofOverhang;
    const roofLenZ = L + (2 * roofOverhang);
    const slopeLength = roofSpanX / Math.cos((roofSlopeDeg * Math.PI) / 180);

    // Left Roof Pitch Plane
    elements.push({
      elementId: createId('roof-left'),
      stableId: `${template.code}-ROOF-SLOPE-LEFT`,
      name: 'Penutup Atap Genteng Metal Sayap Kiri',
      elementType: 'PENUTUP_ATAP',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roof_slope_angle', 'roof_overhang', 'roofCover'],
      wbsCode: '09.02',
      dimensions: { width: slopeLength, height: 0.05, depth: roofLenZ },
      position: { x: (W / 4) - (roofOverhang / 2), y: roofBaseY + (ridgeRise / 2), z: L / 2 },
      rotation: { x: 0, y: 0, z: (roofSlopeDeg * Math.PI) / 180 },
      unit: 'meter',
      materialCategory: 'Genteng Metal Pasir',
      colorHex: '#DC2626',
      layer: 'ROOF',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Right Roof Pitch Plane
    elements.push({
      elementId: createId('roof-right'),
      stableId: `${template.code}-ROOF-SLOPE-RIGHT`,
      name: 'Penutup Atap Genteng Metal Sayap Kanan',
      elementType: 'PENUTUP_ATAP',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['roof_slope_angle', 'roof_overhang', 'roofCover'],
      wbsCode: '09.02',
      dimensions: { width: slopeLength, height: 0.05, depth: roofLenZ },
      position: { x: (3 * W / 4) + (roofOverhang / 2), y: roofBaseY + (ridgeRise / 2), z: L / 2 },
      rotation: { x: 0, y: 0, z: -(roofSlopeDeg * Math.PI) / 180 },
      unit: 'meter',
      materialCategory: 'Genteng Metal Pasir',
      colorHex: '#DC2626',
      layer: 'ROOF',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // Kuda-kuda Baja Ringan Truss Center Ridge
    elements.push({
      elementId: createId('roof-truss-ridge'),
      stableId: `${template.code}-ROOF-TRUSS-RIDGE`,
      name: 'Nok / Ridge Rangka Baja Ringan C75',
      elementType: 'RANGKA_ATAP',
      sourceTemplateId: template.id,
      sourceParameterKeys: ['buildingLength', 'roof_overhang'],
      wbsCode: '09.01',
      dimensions: { width: 0.08, height: 0.08, depth: roofLenZ },
      position: { x: W / 2, y: roofRidgeY, z: L / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      unit: 'meter',
      materialCategory: 'Baja Ringan C75',
      colorHex: '#94A3B8',
      layer: 'ROOF',
      visibility: true,
      confidence: 'VERIFIED',
      reviewStatus: 'VERIFIED',
    });

    // 2-Floor Additional Elements (Floor 2 Slab, Stairs, Floor 2 Columns & Walls)
    if (floorCount >= 2) {
      const slabH2 = 0.12;
      const slabElevation = sloofH + wallHeight;
      const fl2WallElevation = slabElevation + slabH2 + (wallHeight / 2);

      // Floor 2 Concrete Slab
      elements.push({
        elementId: createId('slab-floor-2'),
        stableId: `${template.code}-SLAB-FL2`,
        name: 'Pelat Lantai 2 Beton Bertulang t=12cm',
        elementType: 'PELAT_LANTAI',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['slab_thickness'],
        wbsCode: '04.04',
        dimensions: { width: W, height: slabH2, depth: L },
        position: { x: W / 2, y: slabElevation + (slabH2 / 2), z: L / 2 },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton Bertulang K-225',
        colorHex: '#0284C7',
        layer: 'SLAB',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });

      // Concrete Stairs
      elements.push({
        elementId: createId('stairs'),
        stableId: `${template.code}-STAIRS`,
        name: 'Tangga Beton Bertulang Lantai 1 ke 2',
        elementType: 'TANGGA',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['floor_height_1'],
        wbsCode: '04.05',
        dimensions: { width: 1.0, height: wallHeight, depth: 3.0 },
        position: { x: W * 0.15, y: (wallHeight / 2) + sloofH, z: L * 0.7 },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Beton K-225',
        colorHex: '#0369A1',
        layer: 'STRUCTURE',
        visibility: true,
        confidence: 'DERIVED',
        reviewStatus: 'VERIFIED',
      });

      // Floor 2 Columns (4 Corners + Midpoints)
      columnPositions.slice(0, 8).forEach((cp, idx) => {
        elements.push({
          elementId: createId(`col-fl2-${idx + 1}`),
          stableId: `${template.code}-COL-FL2-${idx + 1}`,
          name: `Kolom Lantai 2 (${cp.label})`,
          elementType: 'KOLOM',
          sourceTemplateId: template.id,
          sourceParameterKeys: ['wall_height', 'kolom_size'],
          wbsCode: '04.02',
          dimensions: { width: kolomSize, height: wallHeight, depth: kolomSize },
          position: { x: cp.x, y: fl2WallElevation, z: cp.z },
          rotation: { x: 0, y: 0, z: 0 },
          unit: 'meter',
          materialCategory: 'Beton K-225',
          colorHex: '#0284C7',
          layer: 'STRUCTURE',
          visibility: true,
          confidence: 'VERIFIED',
          reviewStatus: 'VERIFIED',
        });
      });

      // Floor 2 Exterior Perimeter Walls (Front, Back, Left, Right)
      elements.push({
        elementId: createId('wall-fl2-front'),
        stableId: `${template.code}-WALL-FL2-FRONT`,
        name: 'Dinding Lantai 2 Muka Depan',
        elementType: 'DINDING',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['buildingWidth', 'wall_height'],
        wbsCode: '05.01',
        dimensions: { width: W, height: wallHeight, depth: wallThick },
        position: { x: W / 2, y: fl2WallElevation, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Bata Ringan Hebel',
        colorHex: '#E2E8F0',
        layer: 'WALLS',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });

      elements.push({
        elementId: createId('wall-fl2-back'),
        stableId: `${template.code}-WALL-FL2-BACK`,
        name: 'Dinding Lantai 2 Belakang',
        elementType: 'DINDING',
        sourceTemplateId: template.id,
        sourceParameterKeys: ['buildingWidth', 'wall_height'],
        wbsCode: '05.01',
        dimensions: { width: W, height: wallHeight, depth: wallThick },
        position: { x: W / 2, y: fl2WallElevation, z: L },
        rotation: { x: 0, y: 0, z: 0 },
        unit: 'meter',
        materialCategory: 'Bata Ringan Hebel',
        colorHex: '#E2E8F0',
        layer: 'WALLS',
        visibility: true,
        confidence: 'VERIFIED',
        reviewStatus: 'VERIFIED',
      });
    }

    // Compute Bounding Box
    const boundingBox = GeometryValidator.computeBoundingBox(elements);

    // Count layers
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
