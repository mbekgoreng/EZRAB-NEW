import { TemplateSpace } from '../../data/buildingTemplates/schema/types';

export interface PackedSpaceRect {
  id: string;
  name: string;
  x: number;      // bottom-left X relative to building origin (meters)
  z: number;      // bottom-left Z relative to building origin (meters)
  width: number;  // X span (meters)
  length: number; // Z span (meters)
  area: number;   // m2
  isWetArea: boolean;
}

export class SpaceGridPacker {
  /**
   * Deterministic spatial packing for Indonesian residential and commercial floor plans.
   * Places spaces into organized architectural zones within building boundaries (W x L).
   */
  public static packResidentialSpaces(
    buildingWidth: number,
    buildingLength: number,
    spaces: TemplateSpace[]
  ): PackedSpaceRect[] {
    const W = Math.max(3.0, Number(buildingWidth || 6.0));
    const L = Math.max(3.0, Number(buildingLength || 6.0));

    if (!spaces || spaces.length === 0) {
      // Default single unified hall space
      return [
        {
          id: 'sp-default',
          name: 'Ruangan Utama',
          x: 0,
          z: 0,
          width: W,
          length: L,
          area: W * L,
          isWetArea: false,
        },
      ];
    }

    const packed: PackedSpaceRect[] = [];
    const halfW = W / 2;
    const halfL = L / 2;

    // For 4 to 6 spaces standard Indonesian house layout (2x2 / 2x3 grid partition):
    if (spaces.length <= 4) {
      // 2x2 Quadrant Grid
      const positions = [
        { x: 0, z: 0, w: halfW, l: halfL },          // Front Left (Ruang Tamu)
        { x: halfW, z: 0, w: halfW, l: halfL },      // Front Right (Kamar 1)
        { x: 0, z: halfL, w: halfW, l: halfL },      // Rear Left (Dapur / KM)
        { x: halfW, z: halfL, w: halfW, l: halfL },  // Rear Right (Kamar 2)
      ];

      spaces.forEach((sp, idx) => {
        const pos = positions[idx] || positions[0];
        packed.push({
          id: sp.id,
          name: sp.name,
          x: pos.x,
          z: pos.z,
          width: pos.w,
          length: pos.l,
          area: Math.round(pos.w * pos.l * 100) / 100,
          isWetArea: Boolean(sp.isWetArea),
        });
      });
    } else {
      // Standard 6 Spaces Layout (Teras, Ruang Tamu, Kamar Utama, Kamar Anak, Dapur, KM)
      // Front row (z: 0 to 0.55 * L): Teras & Ruang Tamu (left), Kamar Utama (right)
      // Back row (z: 0.55 * L to L): Dapur & KM (left), Kamar Anak (right)
      const frontL = L * 0.55;
      const backL = L * 0.45;
      const leftW = W * 0.52;
      const rightW = W * 0.48;

      // Space 1: Ruang Tamu & Keluarga
      packed.push({
        id: spaces[0]?.id || 'sp-1',
        name: spaces[0]?.name || 'Ruang Tamu & Keluarga',
        x: 0,
        z: 0,
        width: leftW,
        length: frontL,
        area: Math.round(leftW * frontL * 100) / 100,
        isWetArea: false,
      });

      // Space 2: Kamar Tidur Utama
      packed.push({
        id: spaces[1]?.id || 'sp-2',
        name: spaces[1]?.name || 'Kamar Tidur Utama',
        x: leftW,
        z: 0,
        width: rightW,
        length: frontL,
        area: Math.round(rightW * frontL * 100) / 100,
        isWetArea: false,
      });

      // Space 3: Kamar Tidur Anak
      packed.push({
        id: spaces[2]?.id || 'sp-3',
        name: spaces[2]?.name || 'Kamar Tidur Anak',
        x: leftW,
        z: frontL,
        width: rightW,
        length: backL,
        area: Math.round(rightW * backL * 100) / 100,
        isWetArea: false,
      });

      // Space 4: Kamar Mandi / WC
      const kmW = leftW * 0.45;
      const kmL = backL;
      packed.push({
        id: spaces[3]?.id || 'sp-4',
        name: spaces[3]?.name || 'Kamar Mandi / WC',
        x: 0,
        z: frontL,
        width: kmW,
        length: kmL,
        area: Math.round(kmW * kmL * 100) / 100,
        isWetArea: true,
      });

      // Space 5: Dapur & Makan
      const dapurW = leftW * 0.55;
      packed.push({
        id: spaces[4]?.id || 'sp-5',
        name: spaces[4]?.name || 'Dapur & Ruang Makan',
        x: kmW,
        z: frontL,
        width: dapurW,
        length: backL,
        area: Math.round(dapurW * backL * 100) / 100,
        isWetArea: false,
      });

      // Space 6 (if exists): Teras Depan
      if (spaces.length >= 6) {
        packed.push({
          id: spaces[5]?.id || 'sp-6',
          name: spaces[5]?.name || 'Teras Depan',
          x: 0,
          z: 0,
          width: leftW * 0.5,
          length: 1.5,
          area: Math.round(leftW * 0.5 * 1.5 * 100) / 100,
          isWetArea: false,
        });
      }
    }

    return packed;
  }
}
