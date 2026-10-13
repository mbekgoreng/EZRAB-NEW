/**
 * Concrete Grade Extractor & Matcher Gate
 * =======================================
 * Phase: Bina Marga 2026 Grade Mismatch Gate
 *
 * Extracts concrete grade from text in K-xxx and fc'xx formats.
 * WITHOUT an approved conversion table, K-xxx and fc'xx are treated as
 * DIFFERENT systems — K-250 is NOT assumed equivalent to fc'21.
 *
 * A match is allowed only when:
 * - Both sides have no detectable grade, OR
 * - Both sides have the SAME grade (same system, same value)
 *
 * Otherwise: GRADE_MISMATCH (rejected with reason).
 */

export interface ConcreteGrade {
  /** 'K' for K-xxx (Indonesian), 'FC' for fc'xx (American) */
  system: 'K' | 'FC';
  /** Numeric value: 250 for K-250, 35 for fc'35 */
  value: number;
  /** Raw matched text, e.g. "K-250", "fc'35 MPa" */
  raw: string;
}

/**
 * Extract concrete grade from text.
 * Handles: K-250, K250, K 250, beton K-250, fc'21, fc' 21, f'c 21 MPa, fc 35
 */
export function extractConcreteGrade(text: string): ConcreteGrade | null {
  if (!text) return null;
  const t = text.toLowerCase();

  // K-xxx format (Indonesian standard)
  // Matches: K-250, K250, K 250, k-300
  const kMatch = t.match(/\bk[-\s]?(\d{3})\b/);
  if (kMatch) {
    return {
      system: 'K',
      value: parseInt(kMatch[1], 10),
      raw: kMatch[0],
    };
  }

  // fc'xx format (American standard)
  // Matches: fc'21, fc' 21, f'c 21, fc 35, fc'35 MPa, f'c35
  const fcMatch = t.match(/\bf['’`]?c['’`]?\s?(\d{2,3})\b/);
  if (fcMatch) {
    return {
      system: 'FC',
      value: parseInt(fcMatch[1], 10),
      raw: fcMatch[0],
    };
  }

  return null;
}

export type GradeMatchResult =
  | { compatible: true }
  | { compatible: false; reason: string; inputGrade: string; candidateGrade: string };

/**
 * Check if input grade and candidate grade are compatible.
 *
 * Rules (per user decision):
 * 1. Neither has grade → compatible (existing relevance rules apply)
 * 2. Both have SAME grade (same system + same value) → compatible
 * 3. Both have grade but differ → GRADE_MISMATCH (rejected)
 * 4. Input has grade, candidate has none → NEEDS_REVIEW (not high-confidence)
 * 5. Input has none, candidate has grade → compatible (candidate is more specific)
 */
export function checkGradeCompatibility(
  inputText: string,
  candidateText: string
): GradeMatchResult {
  const inputGrade = extractConcreteGrade(inputText);
  const candGrade = extractConcreteGrade(candidateText);

  // Rule 1: neither has grade
  if (!inputGrade && !candGrade) {
    return { compatible: true };
  }

  // Rule 2: both have grade — must match exactly (same system, same value)
  if (inputGrade && candGrade) {
    if (inputGrade.system === candGrade.system && inputGrade.value === candGrade.value) {
      return { compatible: true };
    }
    // Different grades → mismatch
    // Note: K-250 vs fc'21 are different systems; without approved conversion,
    // they are NOT assumed equivalent.
    return {
      compatible: false,
      reason: `GRADE_MISMATCH: diminta ${inputGrade.raw} (${inputGrade.system}-${inputGrade.value}), kandidat ${candGrade.raw} (${candGrade.system}-${candGrade.value})`,
      inputGrade: `${inputGrade.system}-${inputGrade.value}`,
      candidateGrade: `${candGrade.system}-${candGrade.value}`,
    };
  }

  // Rule 4: input has grade, candidate doesn't → needs review, not auto-match
  if (inputGrade && !candGrade) {
    return {
      compatible: false,
      reason: `NEEDS_REVIEW: diminta ${inputGrade.raw} tetapi kandidat tidak mencantumkan mutu beton`,
      inputGrade: `${inputGrade.system}-${inputGrade.value}`,
      candidateGrade: 'unknown',
    };
  }

  // Rule 5: input has no grade, candidate does → allow (candidate more specific)
  return { compatible: true };
}
