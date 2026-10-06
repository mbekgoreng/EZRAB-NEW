/**
 * Canonical Work Item Builder (Phase 6.3)
 *
 * Enforces the strict Hard Rule:
 * "NEVER generate final RAB from raw page extraction. Only canonical entities can continue to the next stage."
 *
 * Flow: Evidence -> Entity -> Canonical Work Item -> Quantity -> WBS -> AHSP -> RAB
 */

import {
  CanonicalEntity,
  CanonicalWorkItem
} from '../../src/domain/document/canonicalEntityTypes';

export class CanonicalWorkItemBuilder {
  private static instance: CanonicalWorkItemBuilder;

  private constructor() {}

  public static getInstance(): CanonicalWorkItemBuilder {
    if (!CanonicalWorkItemBuilder.instance) {
      CanonicalWorkItemBuilder.instance = new CanonicalWorkItemBuilder();
    }
    return CanonicalWorkItemBuilder.instance;
  }

  /**
   * Build Canonical Work Items strictly from verified, non-duplicate, non-superseded Canonical Entities
   */
  public buildWorkItemsFromEntities(
    entities: CanonicalEntity[],
    projectId: string
  ): CanonicalWorkItem[] {
    const workItems: CanonicalWorkItem[] = [];

    // Filter ONLY valid canonical entities
    const validEntities = entities.filter(ent => 
      !ent.isDuplicate && 
      !ent.isSuperseded && 
      ent.resolutionStatus !== 'POTENTIAL_DUPLICATE'
    );

    for (const ent of validEntities) {
      let wbsCategory = 'PEKERJAAN_STRUKTUR_BETON_BERTULANG';
      let itemCode = `STR.${ent.identifier}`;
      let itemDescription = `Pekerjaan ${ent.name}`;
      let unitPrice = 1250000;
      let ahspCode = 'PUPR.2026.A.4.1.1.27';

      if (ent.elementType === 'COLUMN') {
        wbsCategory = 'PEKERJAAN_STRUKTUR_BETON_BERTULANG';
        itemCode = `STR.COL.${ent.identifier}`;
        itemDescription = `Pekerjaan Kolom ${ent.identifier} (${ent.dimensions || '30x30 cm'}) ${ent.location.floor}`;
        unitPrice = 4500000;
        ahspCode = 'PUPR.2026.A.4.1.1.28';
      } else if (ent.elementType === 'BEAM') {
        wbsCategory = 'PEKERJAAN_STRUKTUR_BETON_BERTULANG';
        itemCode = `STR.BM.${ent.identifier}`;
        itemDescription = `Pekerjaan Balok ${ent.identifier} (${ent.dimensions || '25x40 cm'}) ${ent.location.floor}`;
        unitPrice = 3800000;
        ahspCode = 'PUPR.2026.A.4.1.1.29';
      } else if (ent.elementType === 'FOUNDATION') {
        wbsCategory = 'PEKERJAAN_PONDASI_DAN_STRUKTUR_BAWAH';
        itemCode = `FND.${ent.identifier}`;
        itemDescription = `Pekerjaan Pondasi Poer / Footing ${ent.identifier} (${ent.dimensions || '100x100x40 cm'})`;
        unitPrice = 2800000;
        ahspCode = 'PUPR.2026.A.3.2.1.15';
      } else if (ent.elementType === 'DOOR' || ent.elementType === 'WINDOW') {
        wbsCategory = 'PEKERJAAN_PINTU_JENDELA_DAN_KACA';
        itemCode = `ARC.DW.${ent.identifier}`;
        itemDescription = `Pemasangan Unit ${ent.name} (${ent.material || 'Kusen Aluminium'})`;
        unitPrice = 1850000;
        ahspCode = 'PUPR.2026.A.4.6.1.12';
      } else if (ent.elementType === 'SLAB') {
        wbsCategory = 'PEKERJAAN_STRUKTUR_BETON_BERTULANG';
        itemCode = `STR.SLB.${ent.identifier}`;
        itemDescription = `Pengecoran Plat Lantai ${ent.identifier} ${ent.location.floor}`;
        unitPrice = 2100000;
        ahspCode = 'PUPR.2026.A.4.1.1.30';
      }

      const qty = ent.canonicalQuantity.quantity;
      const unit = ent.canonicalQuantity.unit || 'unit';
      const totalPrice = Math.round(qty * unitPrice);

      workItems.push({
        workItemId: `cwi_${projectId}_${ent.identifier}_${ent.location.floor.replace(/\s+/g, '_')}_${Date.now()}`,
        projectId,
        entityId: ent.entityId,
        wbsCategory,
        itemCode,
        itemDescription,
        canonicalQuantity: qty,
        unit,
        unitPrice,
        totalPrice,
        ahspCode,
        confidence: ent.canonicalQuantity.confidence,
        provenanceEvidenceIds: ent.evidenceIds,
        createdAt: new Date().toISOString()
      });
    }

    return workItems;
  }
}
