/**
 * directRabGate.ts — GERBANG RELEVANSI untuk jalur RAB parametrik rumah
 * (GATE 5 / 5E, penutup kalibrasi ARS-05 Overhaul Fase 5).
 *
 * Jalur `buildDirectRab` / `buildSpecRab` (directRab.ts / specRab.ts)
 * memakai registry parametrik rumah (masterBuildingTemplateRegistry +
 * parametricVolumeEngine) — registry yang BERBEDA dari 180 template
 * katalog yang dikalibrasi Wave E. Karena itu gerbang tidak ditegakkan
 * di sana sebelum kalibrasi registry ini selesai: probe Overhaul Fase 5
 * menemukan tepat 1 false positive per RAB rumah ("Rabat Beton Lantai
 * Kerja Tebal 5 cm" ditolak regex ROAD_ITEM_RE "rabat beton").
 *
 * Kalibrasi 5E (lihat relevanceGate.ts): pengecualian "lantai kerja"
 * mempersempit signature — matriks kalibrasi sesudahnya: 0 dari 200
 * item 8 RAB rumah (T36 1/2 lantai, T45, T70 + 4 varian spek bebas)
 * yang tertolak, sementara kontaminan jalan yang sesungguhnya
 * ("Jalan Inspeksi Rabat Beton Sempit Sepanjang Tanggul", satu-satunya
 * item "rabat beton" jalan di katalog 183 template) tetap REJECTED.
 * Sesudah kalibrasi lolos, gerbang DITEGAKKAN di sini.
 *
 * BEDA dengan jalur universal (buildUniversalDraft): di sana gerbang
 * menyaring `generation.items` SEBELUM total dihitung dari item.
 * Di jalur parametrik, engine menghitung total DI DALAM `calculate()`
 * — jadi penyaringan di sini WAJIB menghitung ulang seluruh turunan
 * total dari item yang tersisa, memakai RUMUS ENGINE YANG SAMA
 * persis (parametricVolumeEngine.ts: totalDirectCost = Σ totalPrice;
 * overhead/profit = round(direct × %); pajak = round(subtotal × %);
 * totalStatus dari aturan engine yang sama). Ini BUKAN aritmetika
 * finansial baru — ini rumus engine yang diterapkan ke himpunan item
 * yang sudah digerbang, sama seperti yang dihasilkan engine seandainya
 * template tidak memuat item itu. Pada data rumah nyata saat ini 0
 * item yang gugur, sehingga total tidak berubah; gerbang adalah
 * jaring pengaman + penegakan untuk perubahan template mendatang.
 *
 * Pengaman (pola applyRelevanceGateToPart): bila penyaringan akan
 * mengosongkan hasil, hasil asal DIPERTAHANKAN + peringatan — RAB
 * kosong tidak pernah dikembalikan diam-diam.
 */

import { classifyItemRelevance } from './relevanceGate';
import { detectScopes } from './universalRab';
import type { DirectRabResult } from './directRab';
import type { TemplateGenerationResult } from '../../data/buildingTemplates/schema/types';

type DirectCalc = DirectRabResult['calc'];

export interface DirectGateOutcome {
  /** Hasil engine sesudah gerbang (referensi yang SAMA bila 0 item gugur). */
  calc: DirectCalc;
  /** Jumlah item yang dikeluarkan (0 bila tidak ada / bila pengaman aktif). */
  removed: number;
  removedNames: string[];
  /** Catatan transparan untuk result.warnings (berawalan [Gerbang relevansi]). */
  notes: string[];
}

function itemKey(name: string, wbsCode?: string): string {
  return `${name}|${wbsCode ?? ''}`;
}

/**
 * Terapkan gerbang relevansi pada hasil `parametricVolumeEngine.calculate()`
 * untuk RAB rumah (`projectId 'rumah'`). Cakupan eksplisit diturunkan dari
 * teks permintaan (pola yang sama dengan jalur universal: scope yang
 * terdeteksi di teks membebaskan keluarga terkait — mis. "jalan
 * lingkungan" yang memang diminta membebaskan item jalan).
 */
export function applyRelevanceGateToDirectCalc(
  calc: DirectCalc,
  rawText: string,
): DirectGateOutcome {
  const explicitScopes = detectScopes(rawText ?? '').map((s) => s.id);
  const removedIdx = new Set<number>();
  const removedNames: string[] = [];
  const notes: string[] = [];
  calc.items.forEach((it, i) => {
    const v = classifyItemRelevance(it.name, 'rumah', explicitScopes);
    if (v.level === 'REJECTED' || v.level === 'LOW') {
      removedIdx.add(i);
      removedNames.push(it.name);
      notes.push(
        `[Gerbang relevansi] Item "${it.name}" dikeluarkan dari RAB rumah (${v.level}: ${v.reason})`,
      );
    }
  });
  if (removedIdx.size === 0) return { calc, removed: 0, removedNames: [], notes: [] };
  if (removedIdx.size >= calc.items.length) {
    // Pengaman: jangan kembalikan RAB kosong — hasil asal dipertahankan.
    return {
      calc,
      removed: 0,
      removedNames: [],
      notes: [
        `[Gerbang relevansi] ${removedNames.length} item terdeteksi tidak relevan untuk RAB rumah, tetapi penyaringan akan mengosongkan RAB — hasil asal dipertahankan; periksa cakupan permintaan Anda.`,
      ],
    };
  }

  const g: TemplateGenerationResult = calc.generationResult;
  const keptItems = calc.items.filter((_, i) => !removedIdx.has(i));

  // workItems engine berkorespondensi 1:1 (urutan sama) dengan
  // calc.items (calculate() memetakan workItems → items). Bila panjang
  // tidak sama (kontrak dilanggar pemanggil lain), jatuh ke pencocokan
  // nama|wbsCode.
  const aligned = g.workItems.length === calc.items.length;
  const removedKeys = new Set(
    [...removedIdx].map((i) => itemKey(calc.items[i].name, calc.items[i].wbsCode)),
  );
  const keptWorkItems = g.workItems.filter((w, i) =>
    aligned ? !removedIdx.has(i) : !removedKeys.has(itemKey(w.name, w.wbsCode)),
  );
  const keptWorkItemIds = new Set(keptWorkItems.map((w) => w.workItemId));

  // --- Hitung ulang turunan total — RUMUS ENGINE YANG SAMA ---
  // (parametricVolumeEngine.ts §4 + aturan totalStatus §3G).
  const categorySubtotals: Record<string, number> = {};
  for (const k of Object.keys(g.categorySubtotals)) categorySubtotals[k] = 0;
  let totalDirectCost = 0;
  let verifiedDirectCost = 0;
  let fabricatedDirectCost = 0;
  let ambiguousItemCount = 0;
  let confidenceSum = 0;
  for (const w of keptWorkItems) {
    categorySubtotals[w.category] = (categorySubtotals[w.category] ?? 0) + w.totalPrice;
    totalDirectCost += w.totalPrice;
    if (w.priceStatus === 'OFFICIAL') verifiedDirectCost += w.totalPrice;
    else if (w.priceStatus === 'BENCHMARK') fabricatedDirectCost += w.totalPrice;
    if (w.isPriceAmbiguous) ambiguousItemCount += 1;
    confidenceSum += w.confidence;
  }
  const overheadAmount = Math.round((totalDirectCost * g.overheadPercentage) / 100);
  const profitAmount = Math.round((totalDirectCost * g.profitPercentage) / 100);
  const subtotalWithOverheadProfit = totalDirectCost + overheadAmount + profitAmount;
  const taxAmount = Math.round((subtotalWithOverheadProfit * g.taxPercentage) / 100);
  const totalRabCost = subtotalWithOverheadProfit + taxAmount;
  const areaParam =
    g.parametersUsed.buildingArea ??
    g.parametersUsed.pavementLength ??
    g.parametersUsed.drainageLength ??
    1;
  const costPerM2 = Math.round(totalRabCost / Number(areaParam));
  const confidenceScore =
    keptWorkItems.length > 0
      ? Math.round((confidenceSum / keptWorkItems.length) * 100) / 100
      : 1.0;
  const unpricedItems = (g.unpricedItems ?? []).filter((u) => keptWorkItemIds.has(u.workItemId));
  const hasBlockedOrError = keptWorkItems.some(
    (w) => w.status === 'blocked' || (w.errors && w.errors.length > 0),
  );
  const hasUnresolvedTotal =
    hasBlockedOrError || ambiguousItemCount > 0 || unpricedItems.length > 0;
  const totalStatus: 'VERIFIED' | 'INDICATIVE' | 'INCOMPLETE' = hasUnresolvedTotal
    ? 'INCOMPLETE'
    : fabricatedDirectCost > 0
      ? 'INDICATIVE'
      : 'VERIFIED';
  const vOverhead = Math.round((verifiedDirectCost * g.overheadPercentage) / 100);
  const vProfit = Math.round((verifiedDirectCost * g.profitPercentage) / 100);
  const vSubtotal = verifiedDirectCost + vOverhead + vProfit;
  const vTax = Math.round((vSubtotal * g.taxPercentage) / 100);

  // Peringatan/kesalahan engine yang menyebut item yang dihapus ikut
  // dibersihkan agar tidak merujuk item yang sudah tidak ada.
  const mentionsRemoved = (s: string): boolean =>
    removedNames.some((n) => s.includes(n));
  const scrubbedWarnings = g.warnings.filter((w) => !mentionsRemoved(w));
  const scrubbedErrors = g.errors.filter((e) => !mentionsRemoved(e));

  const generationResult: TemplateGenerationResult = {
    ...g,
    workItems: keptWorkItems,
    categorySubtotals: categorySubtotals as TemplateGenerationResult['categorySubtotals'],
    totalDirectCost,
    verifiedDirectCost,
    fabricatedDirectCost,
    ambiguousItemCount,
    totalStatus,
    ...(totalStatus === 'VERIFIED'
      ? {
          verifiedOverheadAmount: vOverhead,
          verifiedProfitAmount: vProfit,
          verifiedTaxAmount: vTax,
          verifiedTotalRabCost: vSubtotal + vTax,
        }
      : {
          verifiedOverheadAmount: undefined as number | undefined,
          verifiedProfitAmount: undefined as number | undefined,
          verifiedTaxAmount: undefined as number | undefined,
          verifiedTotalRabCost: undefined as number | undefined,
        }),
    overheadAmount,
    profitAmount,
    taxAmount,
    totalRabCost,
    costPerM2,
    confidenceScore,
    warnings: scrubbedWarnings,
    errors: scrubbedErrors,
    isReadyForSpreadsheet: scrubbedErrors.length === 0 && unpricedItems.length === 0,
    unpricedItems,
    unpricedItemCount: unpricedItems.length,
  };

  // categoryGroups dihitung ulang dari item yang tersisa (urutan
  // kemunculan kategori dipertahankan, pola yang sama dengan engine).
  const groupMap = new Map<string, DirectCalc['items']>();
  for (const it of keptItems) {
    const key = it.category ?? 'LAINNYA';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(it);
  }
  const categoryGroups = [...groupMap.entries()].map(([categoryName, items]) => ({
    categoryName,
    items,
  }));

  return {
    calc: {
      ...calc,
      items: keptItems,
      categoryGroups,
      totalDirectCost,
      totalRabCost,
      generationResult,
    },
    removed: removedIdx.size,
    removedNames,
    notes,
  };
}
