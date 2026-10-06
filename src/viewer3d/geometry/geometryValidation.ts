import { ViewerDimensions, ViewerVector3, ViewerElement3D, ModelBoundingBox } from '../types';

export interface GeometryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class GeometryValidator {
  /**
   * Validasi dimensi objek 3D (tidak boleh NaN, Infinity, atau <= 0 untuk panjang/lebar/tinggi nyata)
   */
  public static validateDimensions(dim: ViewerDimensions, elementName: string = 'Element'): GeometryValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isFinite(dim.width) || isNaN(dim.width)) {
      errors.push(`${elementName}: Lebar (width) tidak valid (NaN/Infinity).`);
    } else if (dim.width < 0) {
      errors.push(`${elementName}: Lebar (width) tidak boleh negatif (${dim.width}).`);
    }

    if (!isFinite(dim.height) || isNaN(dim.height)) {
      errors.push(`${elementName}: Tinggi (height) tidak valid (NaN/Infinity).`);
    } else if (dim.height < 0) {
      errors.push(`${elementName}: Tinggi (height) tidak boleh negatif (${dim.height}).`);
    }

    if (!isFinite(dim.depth) || isNaN(dim.depth)) {
      errors.push(`${elementName}: Tebal/Panjang (depth) tidak valid (NaN/Infinity).`);
    } else if (dim.depth < 0) {
      errors.push(`${elementName}: Tebal/Panjang (depth) tidak boleh negatif (${dim.depth}).`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validasi vektor koordinat 3D
   */
  public static validatePosition(pos: ViewerVector3, elementName: string = 'Element'): GeometryValidationResult {
    const errors: string[] = [];

    if (!isFinite(pos.x) || isNaN(pos.x)) errors.push(`${elementName}: Posisi X tidak valid.`);
    if (!isFinite(pos.y) || isNaN(pos.y)) errors.push(`${elementName}: Posisi Y tidak valid.`);
    if (!isFinite(pos.z) || isNaN(pos.z)) errors.push(`${elementName}: Posisi Z tidak valid.`);

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Hitung Bounding Box model dari kumpulan elemen 3D
   */
  public static computeBoundingBox(elements: ViewerElement3D[]): ModelBoundingBox {
    if (elements.length === 0) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
        center: { x: 0.5, y: 0.5, z: 0.5 },
        size: { width: 1, height: 1, depth: 1 },
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const el of elements) {
      const halfW = el.dimensions.width / 2;
      const halfH = el.dimensions.height / 2;
      const halfD = el.dimensions.depth / 2;

      const elMinX = el.position.x - halfW;
      const elMaxX = el.position.x + halfW;
      const elMinY = el.position.y - halfH;
      const elMaxY = el.position.y + halfH;
      const elMinZ = el.position.z - halfD;
      const elMaxZ = el.position.z + halfD;

      if (elMinX < minX) minX = elMinX;
      if (elMinY < minY) minY = elMinY;
      if (elMinZ < minZ) minZ = elMinZ;
      if (elMaxX > maxX) maxX = elMaxX;
      if (elMaxY > maxY) maxY = elMaxY;
      if (elMaxZ > maxZ) maxZ = elMaxZ;
    }

    const width = Math.max(0.1, maxX - minX);
    const height = Math.max(0.1, maxY - minY);
    const depth = Math.max(0.1, maxZ - minZ);

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2,
      },
      size: { width, height, depth },
    };
  }
}
