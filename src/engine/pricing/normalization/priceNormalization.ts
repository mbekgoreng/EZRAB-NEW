/**
 * EZRAB PRICING DOMAIN — NORMALIZATION LAYER
 */

import { AHSPNormalizationEngine } from '../../ahsp/normalization/ahspNormalization';

export class PriceNormalizationEngine {
  public static normalizeCode(code: string): string {
    if (!code) return '';
    return code
      .trim()
      .toUpperCase()
      .replace(/[\s_]+/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\./, '')
      .replace(/\.$/, '');
  }

  public static normalizeText(text: string): string {
    return AHSPNormalizationEngine.normalizeText(text);
  }

  public static normalizeUnit(unit: string): string {
    return AHSPNormalizationEngine.normalizeUnit(unit);
  }
}
