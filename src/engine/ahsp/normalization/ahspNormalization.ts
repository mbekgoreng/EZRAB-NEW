/**
 * EZRAB AHSP DOMAIN — NORMALIZATION LAYER
 * Normalizes AHSP codes, units, and structural representations.
 */

import { AHSPComponentDefinition, AHSPDefinition } from '../contracts/types';
import { UnitEngine } from '../../calculatorCore/unit/unitEngine';

export class AHSPNormalizationEngine {
  /**
   * Normalize an AHSP code into canonical dot-separated uppercase representation.
   * Example: "a. 2. 2. 1. 4 " -> "A.2.2.1.4"
   */
  public static normalizeCode(code: string): string {
    if (!code) return '';
    return code
      .trim()
      .toUpperCase()
      .replace(/[\s_]+/g, '') // remove all spaces and underscores
      .replace(/\.+/g, '.')   // collapse multiple dots
      .replace(/^\./, '')     // remove leading dot
      .replace(/\.$/, '');    // remove trailing dot
  }

  /**
   * Normalize an AHSP text query or item name for fuzzy/keyword matching.
   */
  public static normalizeText(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize unit string to canonical form using UnitEngine.
   */
  public static normalizeUnit(unit: string): string {
    if (!unit) return '';
    const trimmed = unit.trim().toLowerCase();
    
    // Map common Indonesian construction shorthand
    if (trimmed === 'm\'' || trimmed === 'm1' || trimmed === 'meter' || trimmed === 'm') return 'm';
    if (trimmed === 'm2' || trimmed === 'm²' || trimmed === 'meter persegi' || trimmed === 'meter2') return 'm²';
    if (trimmed === 'm3' || trimmed === 'm³' || trimmed === 'meter kubik' || trimmed === 'meter3') return 'm³';
    if (trimmed === 'bh' || trimmed === 'buah' || trimmed === 'pcs' || trimmed === 'pc') return 'bh';
    if (trimmed === 'kg' || trimmed === 'kilogram') return 'kg';
    if (trimmed === 'oh' || trimmed === 'org/hari' || trimmed === 'orang hari') return 'OH';
    if (trimmed === 'jam' || trimmed === 'hour' || trimmed === 'hrs') return 'jam';
    if (trimmed === 'sak' || trimmed === 'zak') return 'sak';
    if (trimmed === 'btg' || trimmed === 'batang') return 'batang';
    if (trimmed === 'ls' || trimmed === 'lump sum' || trimmed === 'lumpsum') return 'ls';
    if (trimmed === 'ttk' || trimmed === 'titik') return 'titik';

    return UnitEngine.normalizeUnit(unit);
  }

  /**
   * Calculate total coefficients for components
   */
  public static sumCoefficients(components: AHSPComponentDefinition[]): number {
    return components.reduce((sum, c) => sum + (c.coefficient || 0), 0);
  }
}
