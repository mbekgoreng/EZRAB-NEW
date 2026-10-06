/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Unit Safety Gate: Strict Unit Invariant Verification & Collision Prevention
 */

export class DedUnitSafetyGate {
  private static instance: DedUnitSafetyGate;

  private constructor() {}

  public static getInstance(): DedUnitSafetyGate {
    if (!DedUnitSafetyGate.instance) {
      DedUnitSafetyGate.instance = new DedUnitSafetyGate();
    }
    return DedUnitSafetyGate.instance;
  }

  /**
   * Normalizes a unit string to standard canonical representation.
   */
  public normalizeUnit(unit: string | undefined | null): string {
    if (!unit) return 'm²';
    const u = unit.toLowerCase().trim();

    // Volume
    if (u === 'm3' || u === 'm³' || u === 'kubik' || u === 'meter kubik') return 'm³';
    // Area
    if (u === 'm2' || u === 'm²' || u === 'persegi' || u === 'meter persegi') return 'm²';
    // Length
    if (u === "m'" || u === 'm' || u === 'meter' || u === 'ml' || u === 'mtr') return 'm';
    // Count / Sets
    if (u === 'bh' || u === 'buah' || u === 'unit' || u === 'set' || u === 'btg' || u === 'batang') return 'unit';
    // Electrical points
    if (u === 'titik' || u === 'ttk' || u === 'point') return 'titik';
    // Weight
    if (u === 'kg' || u === 'kilogram') return 'kg';
    // Lump sum
    if (u === 'ls' || u === 'lumpsum' || u === 'lump sum') return 'ls';

    return u;
  }

  /**
   * Evaluates compatibility between quantityUnit and ahspUnit.
   * Invariant: Never multiply incompatible dimensional units (e.g. m³ × Rp/m').
   */
  public verifyUnitCompatibility(
    quantityUnit: string,
    ahspUnit: string
  ): { isCompatible: boolean; normQtyUnit: string; normAhspUnit: string; rejectionReason?: string } {
    const normQty = this.normalizeUnit(quantityUnit);
    const normAhsp = this.normalizeUnit(ahspUnit);

    // Exact canonical match
    if (normQty === normAhsp) {
      return { isCompatible: true, normQtyUnit: normQty, normAhspUnit: normAhsp };
    }

    // Flexible unit equivalences in Indonesian construction practice:
    // unit <=> bh <=> set
    if (
      (normQty === 'unit' && (normAhsp === 'bh' || normAhsp === 'set' || normAhsp === 'buah')) ||
      (normAhsp === 'unit' && (normQty === 'bh' || normQty === 'set' || normQty === 'buah'))
    ) {
      return { isCompatible: true, normQtyUnit: normQty, normAhspUnit: normAhsp };
    }

    // titik <=> unit for electrical installations
    if (
      (normQty === 'titik' && (normAhsp === 'unit' || normAhsp === 'bh' || normAhsp === 'titik')) ||
      (normAhsp === 'titik' && (normQty === 'unit' || normQty === 'bh' || normQty === 'titik'))
    ) {
      return { isCompatible: true, normQtyUnit: normQty, normAhspUnit: normAhsp };
    }

    // Incompatible: Volume vs Area vs Length vs Count
    return {
      isCompatible: false,
      normQtyUnit: normQty,
      normAhspUnit: normAhsp,
      rejectionReason: `UNIT_MISMATCH: Satuan kuantitas '${normQty}' tidak kompatibel dengan satuan AHSP '${normAhsp}'. Perkalian dimensional dilarang.`,
    };
  }

  /**
   * Validates if a work item's quantity unit is structurally sensible from an engineering perspective.
   * Fails closed: rejects anomalies like 'Pembesian 4D12 = 32.64 m²' or 'Keramik = 10 m³'.
   */
  public validateWorkItemEngineeringUnit(
    itemName: string,
    quantityUnit: string
  ): { isValid: boolean; expectedUnit?: string; rejectionReason?: string } {
    const name = itemName.toLowerCase();
    const unit = this.normalizeUnit(quantityUnit);

    // 1. Pembesian / Tulangan: MUST be kg (or m' if strictly length per bar, NEVER m² or m³)
    if (name.includes('pembesian') || name.includes('tulangan') || (name.includes('besi') && (name.includes('beton') || name.includes('ulir') || name.includes('polos')))) {
      if (unit === 'm²' || unit === 'm³') {
        return {
          isValid: false,
          expectedUnit: 'kg',
          rejectionReason: `ENGINEERING_UNIT_INVALID: Pekerjaan pembesian/tulangan ('${itemName}') tidak valid menggunakan satuan '${unit}'. Satuan pembesian harus 'kg'.`,
        };
      }
    }

    // 2. Keramik (lantai / dinding): MUST be m²
    if (name.includes('keramik') || name.includes('granit') || name.includes('vinyl') || name.includes('lantai kerja')) {
      if (!name.includes('plint') && (unit === 'm³' || unit === 'm' || unit === 'kg' || unit === 'unit')) {
        return {
          isValid: false,
          expectedUnit: 'm²',
          rejectionReason: `ENGINEERING_UNIT_INVALID: Pekerjaan keramik/lantai ('${itemName}') tidak valid menggunakan satuan '${unit}'. Satuan harus 'm²'.`,
        };
      }
    }

    // 3. Plafon: MUST be m² (unless list plafon which is m)
    if (name.includes('plafon') || name.includes('langit-langit') || name.includes('plafond')) {
      if (!name.includes('list') && (unit === 'm³' || unit === 'kg' || unit === 'unit')) {
        return {
          isValid: false,
          expectedUnit: 'm²',
          rejectionReason: `ENGINEERING_UNIT_INVALID: Pekerjaan penutup plafon ('${itemName}') tidak valid menggunakan satuan '${unit}'. Satuan harus 'm²'.`,
        };
      }
    }

    // 4. Struktur Beton: MUST be m³ (unless bekisting which is m² or pembesian which is kg)
    if (
      (name.includes('beton sloof') || name.includes('beton kolom') || name.includes('beton ring') || name.includes('beton balok') || name.includes('beton pelat')) &&
      !name.includes('bekisting') && !name.includes('pembesian') && !name.includes('tulangan')
    ) {
      if (unit === 'm²' || unit === 'm' || unit === 'kg') {
        return {
          isValid: false,
          expectedUnit: 'm³',
          rejectionReason: `ENGINEERING_UNIT_INVALID: Pekerjaan beton struktur ('${itemName}') tidak valid menggunakan satuan '${unit}'. Satuan harus 'm³'.`,
        };
      }
    }

    // 5. Saklar, Downlight, Stop Kontak, MCB, Kloset, Kran: MUST be unit or titik
    if (
      name.includes('saklar') || name.includes('stop kontak') || name.includes('downlight') ||
      name.includes('mcb') || name.includes('kloset') || name.includes('kran air') || name.includes('floor drain')
    ) {
      if (unit === 'm²' || unit === 'm³' || unit === 'm' || unit === 'kg') {
        return {
          isValid: false,
          expectedUnit: name.includes('downlight') || name.includes('titik') ? 'titik' : 'unit',
          rejectionReason: `ENGINEERING_UNIT_INVALID: Komponen elektrikal/sanitair ('${itemName}') tidak valid menggunakan satuan '${unit}'. Satuan harus 'unit' atau 'titik'.`,
        };
      }
    }

    return { isValid: true };
  }
}

export const dedUnitSafetyGate = DedUnitSafetyGate.getInstance();
