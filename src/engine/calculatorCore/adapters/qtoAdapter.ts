/**
 * EZRAB CALCULATOR CORE — QTO ADAPTER
 * Adapts pure quantity calculation outputs into authoritative QTO Items.
 * Fail-closed on missing or invalid project context. No pricing calculations allowed here.
 */

import { CalculationOutput, CalculationContext } from '../contracts/types';
import { QTOItem } from '../../../types';

export class QtoAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QtoAdapterError';
  }
}

export class QtoAdapter {
  /**
   * Convert CalculationOutput to a standard QTOItem.
   * STRICT: Fails closed if projectId is not provided or is invalid.
   */
  public static toQtoItem(
    output: CalculationOutput,
    ctx: CalculationContext,
    options: {
      customKode?: string;
      customUraian?: string;
      category?: string;
      notes?: string;
      targetQtoId?: string;
    } = {}
  ): QTOItem {
    // 1. Authoritative Project Context Check (Fail Closed)
    if (!ctx.projectId || typeof ctx.projectId !== 'string' || ctx.projectId.trim() === '') {
      throw new QtoAdapterError('Project ID is required and must be authoritative for all QTO mutations. FAILED CLOSED.');
    }

    const qtoId = options.targetQtoId || `QTO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const formulaSummary = (output.detailedBreakdown || [])
      .map((b) => `${b.code}: ${b.formulaText} = ${b.value} ${b.unit}`)
      .join(' | ') || `${output.primaryLabel}: ${output.primaryQuantity} ${output.primaryUnit}`;

    const item: QTOItem = {
      id: qtoId,
      projectId: ctx.projectId.trim(),
      calculationRunId: `RUN-${Date.now().toString().slice(-6)}`,
      calculatorId: output.calculatorId,
      formulaId: output.provenance?.[0]?.formulaId || output.calculatorId,
      formulaVersion: output.version,
      kode: options.customKode || `QTO.${(output.calculatorId || 'CALC').toUpperCase().slice(0, 6)}.01`,
      uraian: options.customUraian || output.primaryLabel,
      quantity: output.primaryQuantity,
      unit: output.primaryUnit,
      parameterSnapshot: output.trace?.inputs || {},
      formulaSnapshot: formulaSummary,
      status: 'CALCULATED',
      source: 'CALCULATOR',
      category: options.category || 'Pekerjaan Struktur',
      notes: options.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return item;
  }
}
