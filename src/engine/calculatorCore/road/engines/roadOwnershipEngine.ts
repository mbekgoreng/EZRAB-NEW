/**
 * Road Quantity Ownership & Anti-Duplication Engine
 * Enforces single-producer rule across road hierarchy:
 * projectId :: roadEntityId :: quantityKind :: segmentId :: layerId
 */

export interface RoadOwnershipKey {
  projectId: string;
  roadEntityId: string;
  quantityKind: string; // e.g. 'EARTHWORK_CUT', 'PAVEMENT_BASE_A', 'KERB_LENGTH'
  segmentId?: string; // e.g. 'STA_0_000_TO_0_500'
  layerId?: string; // e.g. 'LAYER_AC_WC'
  materialId?: string;
  producerCalculatorId?: string;
}

export class RoadOwnershipEngine {
  private static registeredOwnership = new Map<string, string>();

  /**
   * Format authoritative unique ownership key
   */
  public static createKey(params: RoadOwnershipKey): string {
    const proj = params.projectId || 'GLOBAL';
    const entity = params.roadEntityId || 'ROAD_MAIN';
    const kind = params.quantityKind.toUpperCase();
    const seg = params.segmentId || 'ALL_SEGMENTS';
    const layer = params.layerId || 'BASE';
    const mat = params.materialId || 'DEFAULT';
    return `${proj}::${entity}::${kind}::${seg}::${layer}::${mat}`;
  }

  /**
   * Alias for generateOwnershipKey
   */
  public static generateOwnershipKey(params: RoadOwnershipKey): string {
    return this.createKey(params);
  }

  /**
   * Clear registry for test isolation
   */
  public static clearRegistry(): void {
    this.registeredOwnership.clear();
  }

  /**
   * Claim authoritative producer ownership for a physical road quantity slice
   */
  public static claimOwnership(params: RoadOwnershipKey): boolean {
    const key = this.createKey(params);
    const producer = params.producerCalculatorId || 'UNKNOWN';
    if (this.registeredOwnership.has(key)) {
      return false; // Duplicate blocked
    }
    this.registeredOwnership.set(key, producer);
    return true;
  }

  /**
   * Check if quantity producer is authoritative or child duplicate
   */
  public static validateProducerOwnership(
    parentKey: string,
    existingProducedKeys: Set<string>
  ): { isAllowed: boolean; error?: string } {
    if (existingProducedKeys.has(parentKey)) {
      return {
        isAllowed: false,
        error: `DUPLICATE_OWNERSHIP_BLOCKED: Kuantitas fisik untuk key ${parentKey} sudah diproduksi oleh kalkulator pemilik sebelumnya.`,
      };
    }
    return { isAllowed: true };
  }
}
