/**
 * EZRAB CORE AI — RULE ENGINE
 * 
 * Safety, integrity, and determinism rule verification.
 * Enforces all Golden Rules before any item, price, quantity, or proposal
 * is accepted by EZRAB Core AI.
 */

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: 'BLOCKING' | 'WARNING';
  message: string;
  context?: Record<string, any>;
}

export interface RuleValidationResult {
  passed: boolean;
  violations: RuleViolation[];
}

export class RuleEngine {
  private static instance: RuleEngine | null = null;

  private constructor() {}

  public static getInstance(): RuleEngine {
    if (!RuleEngine.instance) {
      RuleEngine.instance = new RuleEngine();
    }
    return RuleEngine.instance;
  }

  /**
   * Asserts that an AHSP candidate is valid and not hallucinated.
   */
  public validateAhspCode(code: string | undefined | null, source?: string): RuleValidationResult {
    const violations: RuleViolation[] = [];
    const clean = (code || '').trim().toUpperCase();

    if (!clean) {
      violations.push({
        ruleId: 'RULE-01',
        ruleName: 'AI_CANNOT_INVENT_AHSP',
        severity: 'BLOCKING',
        message: 'Kode AHSP tidak boleh kosong.',
      });
      return { passed: false, violations };
    }

    if (clean.startsWith('AI-CUSTOM') || clean.startsWith('CUSTOM-') || source === 'AI_CUSTOM') {
      violations.push({
        ruleId: 'RULE-01',
        ruleName: 'AI_CANNOT_INVENT_AHSP',
        severity: 'BLOCKING',
        message: `Kode "${clean}" terdeteksi sebagai AI-CUSTOM halusinasi. AI dilarang menciptakan kode AHSP sendiri.`,
        context: { code: clean, source },
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Validates full AHSP item including version and custom code checks.
   */
  public validateAhspItem(item: { code?: string; name?: string; unit?: string; sourceStandard?: string }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const code = (item.code || '').trim().toUpperCase();

    if (!code) {
      errors.push('Kode AHSP tidak boleh kosong.');
    } else if (code.startsWith('AI-CUSTOM') || code.startsWith('CUSTOM-')) {
      errors.push(`Kode "${code}" ditolak keras: AI-CUSTOM dilarang.`);
    }

    if (item.sourceStandard && item.sourceStandard !== 'PUPR_2026') {
      errors.push(`Standar "${item.sourceStandard}" ditolak. EZRAB mewajibkan standar PUPR_2026.`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates unit compatibility between DED measurement and AHSP standard.
   */
  public validateUnitCompatibility(unitA: string, unitB: string): { compatible: boolean; reason?: string } {
    const normA = (unitA || '').trim().toLowerCase().replace('²', '2').replace('³', '3');
    const normB = (unitB || '').trim().toLowerCase().replace('²', '2').replace('³', '3');

    if (normA === normB) {
      return { compatible: true };
    }

    return {
      compatible: false,
      reason: `Satuan "${unitA}" tidak kompatibel dengan satuan "${unitB}".`,
    };
  }

  /**
   * Asserts that a quantity is valid and not defaulted to fallback 0 or 1 on missing data.
   */
  public validateQuantity(quantity: number | null | undefined, hasMissingInputs: boolean = false): { valid: boolean; passed: boolean; reason: string; violations: RuleViolation[] } {
    const violations: RuleViolation[] = [];

    if (quantity === null || quantity === undefined) {
      return {
        valid: false,
        passed: false,
        reason: 'Kuantitas bernilai null atau belum dihitung.',
        violations: [{
          ruleId: 'RULE-03',
          ruleName: 'AI_CANNOT_INVENT_QUANTITY',
          severity: 'BLOCKING',
          message: 'Kuantitas bernilai null.',
        }],
      };
    }

    if (hasMissingInputs && quantity !== null) {
      violations.push({
        ruleId: 'RULE-03',
        ruleName: 'AI_CANNOT_INVENT_QUANTITY',
        severity: 'BLOCKING',
        message: 'Parameter dimensi tidak lengkap; kuantitas harus bernilai null (MISSING_DATA), bukan angka tebakan.',
        context: { quantity },
      });
    }

    if (quantity === 0) {
      violations.push({
        ruleId: 'RULE-08',
        ruleName: 'UNKNOWN_IS_NOT_ZERO',
        severity: 'BLOCKING',
        message: 'Kuantitas tidak boleh 0 pada pekerjaan konstruksi yang teridentifikasi.',
        context: { quantity },
      });
    }

    if (hasMissingInputs && quantity === 1) {
      violations.push({
        ruleId: 'RULE-10',
        ruleName: 'MISSING_QUANTITY_IS_NOT_ONE',
        severity: 'BLOCKING',
        message: 'Kuantitas yang hilang tidak boleh otomatis di-default menjadi 1.',
        context: { quantity },
      });
    }

    const passed = violations.length === 0;
    return {
      valid: passed,
      passed,
      reason: violations[0]?.message || '',
      violations,
    };
  }

  /**
   * Asserts that a price is genuine, non-zero, and from an approved source.
   */
  public validatePrice(price: number | null | undefined, priceSource?: string): RuleValidationResult {
    const violations: RuleViolation[] = [];

    if (price === 0) {
      violations.push({
        ruleId: 'RULE-09',
        ruleName: 'MISSING_PRICE_IS_NOT_FREE',
        severity: 'BLOCKING',
        message: 'Harga satuan tidak boleh Rp 0. Item yang belum memiliki harga harus bertatus PRICE_NOT_FOUND / null.',
        context: { price, priceSource },
      });
    }

    if (price === null || price === undefined) {
      violations.push({
        ruleId: 'RULE-02',
        ruleName: 'AI_CANNOT_INVENT_PRICE',
        severity: 'WARNING',
        message: 'Harga belum tersedia dari Price Engine. Item berstatus NO_PRICE.',
        context: { priceSource },
      });
    }

    return {
      passed: violations.every(v => v.severity !== 'BLOCKING'),
      violations,
    };
  }

  /**
   * Validates project isolation.
   */
  public validateProjectIsolation(targetProjectId: string, contextProjectId: string): RuleValidationResult {
    const violations: RuleViolation[] = [];

    if (!targetProjectId || !contextProjectId || targetProjectId.trim() !== contextProjectId.trim()) {
      violations.push({
        ruleId: 'RULE-13',
        ruleName: 'PROJECT_ISOLATION_MANDATORY',
        severity: 'BLOCKING',
        message: `Pelanggaran isolasi proyek: target "${targetProjectId}" tidak sesuai dengan context "${contextProjectId}".`,
        context: { targetProjectId, contextProjectId },
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}

export const ruleEngine = RuleEngine.getInstance();
