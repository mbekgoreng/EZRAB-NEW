/**
 * EZRAB CONSTRUCTION SCOPE VALIDATOR
 *
 * Prevents a single volume takeoff (e.g. 350 m3 concrete body) from being falsely
 * classified as a complete construction project.
 *
 * Rule: 350 m3 concrete != Total Weir Project.
 * Returns PARTIAL_SCOPE with detailed audit of missing lifecycle packages.
 */

export type ProjectScopeStatus = 'COMPLETE_PROJECT' | 'PARTIAL_SCOPE' | 'INSUFFICIENT_SCOPE';

export interface ScopeChecklistRequirement {
  scopeId: string;
  scopeName: string;
  isMandatoryForCompleteProject: boolean;
  typicalSharePercentRange: [number, number];
  description: string;
}

export interface ScopeValidationResult {
  projectType: string;
  scopeStatus: ProjectScopeStatus;
  detectedScopes: string[];
  missingMandatoryScopes: string[];
  scopeCoveragePercent: number;
  auditExplanation: string;
  warningNote: string;
}

export class ConstructionScopeValidator {
  /**
   * Authoritative checklist of mandatory scopes for a civil weir project (KP-02 standard)
   */
  private static readonly WEIR_MANDATORY_SCOPES: ScopeChecklistRequirement[] = [
    {
      scopeId: 'RIVER_DIVERSION_COFFERDAM',
      scopeName: 'Pengelakan Sungai & Cofferdam / Dewatering',
      isMandatoryForCompleteProject: true,
      typicalSharePercentRange: [5, 12],
      description: 'Saluran pengelakan, tanggul penutup, dan pemompaan air tanah pondasi',
    },
    {
      scopeId: 'FOUNDATION_EXCAVATION',
      scopeName: 'Galian Struktur & Perbaikan Tanah Pondasi',
      isMandatoryForCompleteProject: true,
      typicalSharePercentRange: [8, 15],
      description: 'Galian tanah/batuan dasar sungai, cerucuk/grouting bila diperlukan',
    },
    {
      scopeId: 'WEIR_MAIN_BODY_CONCRETE',
      scopeName: 'Tubuh Bendung Tetap (Beton Masif / Siklop / Batu Kali)',
      isMandatoryForCompleteProject: true,
      typicalSharePercentRange: [25, 40],
      description: 'Struktur utama bendung penahan air',
    },
    {
      scopeId: 'STILLING_BASIN_APRON',
      scopeName: 'Kolam Olak (Stilling Basin) & Lantai Muka (Apron)',
      isMandatoryForCompleteProject: true,
      typicalSharePercentRange: [15, 25],
      description: 'Peredam energi hidraulik hilir dan lantai pelindung gerusan hulu/hilir',
    },
    {
      scopeId: 'RIVERBANK_PROTECTION_RIPRAP',
      scopeName: 'Tembok Sayap & Proteksi Tebing (Bronjong / Pasangan Batu)',
      isMandatoryForCompleteProject: true,
      typicalSharePercentRange: [8, 15],
      description: 'Sayap hulu/hilir dan riprap pengaman tebing sungai dari erosi',
    },
    {
      scopeId: 'INTAKE_AND_GATES',
      scopeName: 'Bangunan Sadap (Intake), Pintu Pembilas & Saluran Pembawa',
      isMandatoryForCompleteProject: true,
      typicalSharePercentRange: [10, 20],
      description: 'Pintu sorong baja, trashrack, dan pengatur aliran intake irigasi',
    },
  ];

  /**
   * Validate scope completeness for a Weir calculation
   */
  public static validateWeirScope(
    providedScopes: string[],
    primaryQuantity: number,
    primaryUnit: string
  ): ScopeValidationResult {
    const normProvided = providedScopes.map((s) => s.toUpperCase());

    const detected: string[] = [];
    const missing: string[] = [];

    for (const req of this.WEIR_MANDATORY_SCOPES) {
      const isPresent = normProvided.some((s) => s.includes(req.scopeId) || s.includes(req.scopeName.toUpperCase()) || s.includes('BODY') && req.scopeId.includes('BODY'));
      if (isPresent) {
        detected.push(req.scopeName);
      } else if (req.isMandatoryForCompleteProject) {
        missing.push(req.scopeName);
      }
    }

    const coverage = Math.round((detected.length / this.WEIR_MANDATORY_SCOPES.length) * 100);

    // If only concrete / body volume is present (e.g. 350 m3 concrete body)
    if (detected.length <= 2 && missing.length >= 4) {
      return {
        projectType: 'WEIR_IRRIGATION',
        scopeStatus: 'PARTIAL_SCOPE',
        detectedScopes: detected,
        missingMandatoryScopes: missing,
        scopeCoveragePercent: coverage,
        auditExplanation:
          `Estimasi saat ini HANYA mencakup sebagian item (${detected.join(', ')}: ${primaryQuantity} ${primaryUnit}). ` +
          `Item tersebut BUKAN merupakan total biaya keseluruhan proyek bendung.`,
        warningNote:
          `PARTIAL_SCOPE: Proyek bendung lengkap wajib menyertakan: ${missing.slice(0, 3).join(', ')} dan paket lainnya. ` +
          `Dilarang menyajikan angka ini sebagai RAB total proyek bendung.`,
      };
    }

    if (missing.length === 0) {
      return {
        projectType: 'WEIR_IRRIGATION',
        scopeStatus: 'COMPLETE_PROJECT',
        detectedScopes: detected,
        missingMandatoryScopes: [],
        scopeCoveragePercent: 100,
        auditExplanation: 'Seluruh paket lingkup struktur bendung (KP-02) teridentifikasi lengkap.',
        warningNote: 'Scope lengkap sesuai standar perencanaan bendung SDA.',
      };
    }

    return {
      projectType: 'WEIR_IRRIGATION',
      scopeStatus: 'PARTIAL_SCOPE',
      detectedScopes: detected,
      missingMandatoryScopes: missing,
      scopeCoveragePercent: coverage,
      auditExplanation: `Cakupan lingkup konstruksi bendung mencapai ${coverage}% (${detected.length}/${this.WEIR_MANDATORY_SCOPES.length} paket).`,
      warningNote: `Paket belum lengkap: Masih memerlukan ${missing.join(', ')}.`,
    };
  }
}
