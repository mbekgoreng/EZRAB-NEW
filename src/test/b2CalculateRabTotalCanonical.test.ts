/**
 * b2CalculateRabTotalCanonical.test.ts — Pin regresi Batch 2 (Master
 * Finalization 2026-11-25): tool AI `calculate_rab_total` HARUS memakai
 * mesin kanonis yang sama dengan Rekap/ekspor/konteks AI.
 *
 * DEFECT (direproduksi sebelum perbaikan, evidence
 * b2-repro-calculateRabTotal.log): tool menjumlah sendiri
 * Σ volume×unitPrice — tanpa overhead/profit/pajak proyek DAN menghitung
 * item PRICE_UNRESOLVED seolah berharga. Pada konfigurasi flagship
 * (overhead 5%, profit 5%, PPN 11%): tool Rp21.000.000 vs mesin
 * Rp24.420.000 (selisih Rp3.420.000). Tool ini masuk rencana AI
 * (planningEngine: CALCULATE_TOTAL / RESOLVE_MISSING_PRICES), jadi
 * jawabannya bisa dikutip AI sebagai "grand total RAB" — padahal
 * berbeda dari Rekap.
 *
 * Perbaikan: src/services/ai/tools/aiToolRegistry.ts — tool kini memanggil
 * UnifiedProjectEngine.recalculateCostSummary(items,
 * resolveProjectCostConfig(context.project)) dan mengembalikan rincian
 * mesin (directCost/overhead/profit/tax/unresolvedItems).
 *
 * Jalankan: npx --yes tsx src/test/b2CalculateRabTotalCanonical.test.ts
 * (Skrip tsx mandiri — pola rantaiJRegression / p5FiveSheetExport.)
 */
import { aiToolRegistry } from '../services/ai/tools/aiToolRegistry';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { resolveProjectCostConfig } from '../engine/projectCostConfig';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `dapat ${String(actual)}, harap ${String(expected)}`);
}

const PRICED = [
  { volume: 10, unitPrice: 1000000, amount: 10000000, priceStatus: 'PRICE_RESOLVED' },
  { volume: 5, unitPrice: 2000000, amount: 10000000, priceStatus: 'PRICE_RESOLVED' },
] as any[];
const WITH_UNRESOLVED = [
  ...PRICED,
  { volume: 2, unitPrice: 500000, amount: undefined, priceStatus: 'PRICE_UNRESOLVED' },
] as any[];

const FLAGSHIP_PROJECT = {
  id: 'PRJ-REPRO',
  overheadPercent: 5,
  profitPercent: 5,
  ppnEnabled: true,
  ppnPercent: 11,
  costSummary: {
    overheadPercent: 5, profitPercent: 5, taxPercent: 11,
    ppnEnabled: true, pphEnabled: false, pphPercent: 0,
    contingencyPercent: 0, directorMarkupPercent: 0,
  },
} as any;

const DEFAULTS_PROJECT = {
  id: 'PRJ-BARU',
  costSummary: {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
    ppnEnabled: false, pphEnabled: false, pphPercent: 0,
    contingencyPercent: 0, directorMarkupPercent: 0,
  },
} as any;

async function runTool(project: any, items: any[]): Promise<any> {
  const tool = aiToolRegistry.getTool('calculate_rab_total');
  if (!tool) throw new Error('tool calculate_rab_total tidak ditemukan');
  const res: any = await tool.execute({}, {
    projectId: project.id,
    conversationId: 'b2-repro',
    project,
    rabItems: items,
  } as any);
  return res;
}

async function main(): Promise<void> {
  // 1 — konfigurasi flagship: tool == mesin == Rp24.420.000 (bukan 21jt lama).
  const engineFlagship = UnifiedProjectEngine.recalculateCostSummary(
    WITH_UNRESOLVED as any, resolveProjectCostConfig(FLAGSHIP_PROJECT) as any,
  );
  const toolFlagship = await runTool(FLAGSHIP_PROJECT, WITH_UNRESOLVED);
  eq('B2-1 tool grandTotal == mesin (flagship 5/5/PPN)', toolFlagship.result.grandTotal, engineFlagship.grandTotal);
  eq('B2-1a pin flagship Rp24.420.000', toolFlagship.result.grandTotal, 24420000);

  // 2 — rincian tool sama dengan rincian mesin.
  eq('B2-2 directCost', toolFlagship.result.directCost, 20000000);
  eq('B2-2a overheadAmount', toolFlagship.result.overheadAmount, 1000000);
  eq('B2-2b profitAmount', toolFlagship.result.profitAmount, 1000000);
  eq('B2-2c taxAmount', toolFlagship.result.taxAmount, 2420000);

  // 3 — item PRICE_UNRESOLVED tidak masuk total (dulu ikut Rp1.000.000).
  eq('B2-3 unresolvedItems dilaporkan', toolFlagship.result.unresolvedItems, 1);
  eq('B2-3a directCost tanpa item tak berharga', toolFlagship.result.directCost, engineFlagship.directCost);

  // 4 — proyek baru (0/0, PPN mati): tool == mesin == biaya langsung.
  const engineDefaults = UnifiedProjectEngine.recalculateCostSummary(
    PRICED as any, resolveProjectCostConfig(DEFAULTS_PROJECT) as any,
  );
  const toolDefaults = await runTool(DEFAULTS_PROJECT, PRICED);
  eq('B2-4 tool grandTotal == mesin (default 0/0)', toolDefaults.result.grandTotal, engineDefaults.grandTotal);
  eq('B2-4a pin default Rp20.000.000', toolDefaults.result.grandTotal, 20000000);

  // 5 — proyek kosong → 0.
  const toolEmpty = await runTool(DEFAULTS_PROJECT, []);
  eq('B2-5 item kosong → grandTotal 0', toolEmpty.result.grandTotal, 0);
  eq('B2-5a itemCount 0', toolEmpty.result.itemCount, 0);

  // 6 — provenance menunjuk mesin kanonis, bukan rumus paralel.
  check(
    'B2-6 provenance = UnifiedProjectEngine.recalculateCostSummary',
    toolFlagship.provenance?.source === 'UnifiedProjectEngine.recalculateCostSummary',
    `dapat ${String(toolFlagship.provenance?.source)}`,
  );

  console.log(`\nB2 CALCULATE_RAB_TOTAL CANONICAL: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('B2 ERROR', e);
  process.exit(1);
});
