/**
 * FABRICATED PRICE TELEMETRY — Phase 1 (freeze fabricated prices)
 * ---------------------------------------------------------------
 * Purpose
 *   The Phase 0 forensic audit (`docs/pricing-engine-audit.md`) proved that five
 *   parallel pricing systems in EZRAB invent a price whenever real data is
 *   missing: Rp 50.000, Rp 45.000, Rp 74.000, Rp 120.000, Rp 150.000,
 *   Rp 1.150.000, and 15 "borongan" constants chosen from calculator titles.
 *
 *   Phase 1 does NOT change any number. It makes the inventions *observable*.
 *
 * Contract
 *   - Pure recording. This module never returns a price and never mutates inputs.
 *   - Safe to import from both the browser bundle and Node scripts.
 *   - Zero side effects at import time.
 *
 * Exit gate for Phase 1 (see `docs/pricing-engine-audit.md` §16):
 *   "impact report available; no change to numbers on existing RAB."
 */

export type FabricatedSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

/**
 * Where a displayed unit price actually came from.
 * Added by Phase 1 step 1.1 so the UI can label provenance without changing any value.
 */
export type CostPriceSourceKind =
  | 'MASTER_DB'            // resolved from a real price record
  | 'PROJECT_PRICE'        // resolved from a project-scoped price
  | 'OVERRIDE'             // explicit estimator override
  | 'CALCULATOR_ESTIMATE'  // supplied by the calculator itself (not authoritative, but not invented here)
  | 'FABRICATED'           // invented by a hardcoded constant (see FABRICATED_PRICE_SITES)
  | 'UNRESOLVED';          // no price at all

/** Overall completeness of a cost panel. Replaces the silent "Rp 0" presentation. */
export type CostPriceStatus =
  | 'RESOLVED'            // every row came from a real source
  | 'REFERENCE_ESTIMATE'  // at least one row is fabricated or calculator-supplied
  | 'INCOMPLETE';         // at least one row has no price at all


/** A fixed location in the source tree where a fabricated constant is applied. */
export interface FabricatedPriceSite {
  /** Stable identifier, e.g. `qto.material.last-resort`. */
  readonly id: string;
  /** The fabricated constant, in IDR. */
  readonly constant: number;
  /** Repository-relative file path. Documentation only. */
  readonly file: string;
  /** Line number at the time of the Phase 0 audit. Documentation only. */
  readonly line: number;
  readonly severity: FabricatedSeverity;
  /** What this fallback means in plain Indonesian. */
  readonly note: string;
}

/** One observed application of a fabricated constant. */
export interface FabricatedPriceEvent {
  readonly siteId: string;
  readonly constant: number;
  readonly severity: FabricatedSeverity;
  readonly file: string;
  readonly line: number;
  /** Calculator registry id, if known (e.g. `weir.body`). */
  readonly calculatorId?: string;
  /** Calculator title as shown in the UI. */
  readonly calculatorTitle?: string;
  /** The resource that could not be priced. */
  readonly itemName?: string;
  readonly quantity?: number;
  readonly unit?: string;
  /** quantity × constant. */
  readonly fabricatedTotal: number;
  /** Epoch milliseconds. */
  readonly at: number;
}

export interface FabricatedPriceSiteSummary {
  readonly siteId: string;
  readonly constant: number;
  readonly severity: FabricatedSeverity;
  readonly file: string;
  readonly line: number;
  readonly note: string;
  readonly hits: number;
  readonly exposedAmount: number;
  readonly calculators: readonly string[];
  readonly sampleItems: readonly string[];
}

export interface FabricatedPriceSummary {
  readonly totalHits: number;
  readonly totalExposedAmount: number;
  readonly sites: readonly FabricatedPriceSiteSummary[];
  readonly byCalculator: readonly { calculator: string; hits: number; exposedAmount: number }[];
  readonly bySeverity: Readonly<Record<FabricatedSeverity, { hits: number; exposedAmount: number }>>;
}

/**
 * The authoritative catalogue of fabricated-price sites.
 *
 * Every entry below was located empirically during the Phase 0 audit by
 * `scripts/forensicPricingSweep.ts` and `scripts/forensicPricingTrace.ts`.
 * Adding a site here does not change behaviour — it only names the defect so the
 * Phase 1 impact report can attribute each invented rupiah to a file and a line.
 */
export const FABRICATED_PRICE_SITES: readonly FabricatedPriceSite[] = Object.freeze([
  // ---------------------------------------------------------------------------
  // A. UI QTO pricing — `src/components/qto/QtoCalculatorView.tsx`
  // ---------------------------------------------------------------------------
  {
    id: 'qto.material.keyword-branch',
    constant: 0,
    file: 'src/components/qto/QtoCalculatorView.tsx',
    line: 888,
    severity: 'CRITICAL',
    note: 'Harga material ditebak dari substring nama (termasuk includes("Air") → Rp 120 untuk material apa pun yang memuat "air").',
  },
  {
    id: 'qto.material.last-resort',
    constant: 50000,
    file: 'src/components/qto/QtoCalculatorView.tsx',
    line: 899,
    severity: 'CRITICAL',
    note: 'Fallback terakhir Rp 50.000 untuk material apa pun. Ini sumber Rp 17.500.000 pada Weir Body.',
  },
  {
    id: 'qto.labor.role-default',
    constant: 0,
    file: 'src/components/qto/QtoCalculatorView.tsx',
    line: 865,
    severity: 'HIGH',
    note: 'Upah tenaga kerja ditebak dari substring peran (Pekerja 100.000 / Tukang 145.000 / Kepala 175.000 / lainnya 200.000).',
  },
  {
    id: 'qto.equipment.implicit-default',
    constant: 45000,
    file: 'src/components/qto/QtoCalculatorView.tsx',
    line: 918,
    severity: 'HIGH',
    note: 'Array equipment kosong diganti satu baris "Alat Bantu Konstruksi & Pengadukan" Rp 45.000.',
  },
  {
    id: 'qto.equipment.last-resort',
    constant: 45000,
    file: 'src/components/qto/QtoCalculatorView.tsx',
    line: 925,
    severity: 'HIGH',
    note: 'Fallback terakhir Rp 45.000 untuk peralatan yang tidak ditemukan di master price.',
  },
  {
    id: 'qto.borongan.title-keyword',
    constant: 0,
    file: 'src/components/qto/QtoCalculatorView.tsx',
    line: 945,
    severity: 'CRITICAL',
    note: 'Harga borongan dipilih dari kata kunci judul calculator; 15 konstanta antara Rp 18.000 dan Rp 3.500.000.',
  },

  // ---------------------------------------------------------------------------
  // B. Authoritative AHSP bridge + deterministic RAB draft (server)
  // ---------------------------------------------------------------------------
  {
    id: 'bridge.ahsp.fabricated-unit-price',
    constant: 1150000,
    file: 'server/services/authoritativeAhspPriceBridge.ts',
    line: 183,
    severity: 'CRITICAL',
    note: 'Harga AHSP dikarang Rp 1.150.000 lalu dilabeli PRICE_VERIFIED / confidence 0,95.',
  },
  {
    id: 'rabdraft.borongan.default',
    constant: 150000,
    file: 'server/services/automaticRabDraftEngine.ts',
    line: 133,
    severity: 'HIGH',
    note: 'Harga satuan borongan default Rp 150.000 pada jalur DED → RAB.',
  },

  // ---------------------------------------------------------------------------
  // C. Project price engine
  // ---------------------------------------------------------------------------
  {
    id: 'projectprice.material.default',
    constant: 74000,
    file: 'src/engine/pricing/projectPriceEngine.ts',
    line: 851,
    severity: 'CRITICAL',
    note: 'Harga material tanpa data → Rp 74.000/sak dengan isFinal: true.',
  },
  {
    id: 'projectprice.material.default-fallback',
    constant: 74000,
    file: 'src/engine/pricing/projectPriceEngine.ts',
    line: 988,
    severity: 'CRITICAL',
    note: 'Jalur cadangan kedua untuk Rp 74.000/sak pada resolver harga proyek.',
  },

  // ---------------------------------------------------------------------------
  // D. Parametric volume engine
  // ---------------------------------------------------------------------------
  {
    id: 'parametric.borongan.default',
    constant: 150000,
    file: 'src/engine/parametricVolumeEngine/parametricVolumeEngine.ts',
    line: 242,
    severity: 'HIGH',
    note: 'Harga borongan Rp 150.000 × multiplier, dengan region default "DKI Jakarta".',
  },

  // ---------------------------------------------------------------------------
  // E. AHSP calculation engine
  // ---------------------------------------------------------------------------
  {
    id: 'ahspcalc.zero-as-estimate',
    constant: 0,
    file: 'src/engine/ahspCalculationEngine.ts',
    line: 45,
    severity: 'MEDIUM',
    note: 'unitPrice = 0 dilabeli sumber "Estimasi Standar", menyamarkan data hilang sebagai estimasi.',
  },
]);

const SITE_BY_ID: ReadonlyMap<string, FabricatedPriceSite> = new Map(
  FABRICATED_PRICE_SITES.map((site) => [site.id, site]),
);

const MAX_EVENTS = 5000;
const events: FabricatedPriceEvent[] = [];

/** Look up a catalogue entry. Returns undefined for unknown ids (and does not throw). */
export function getFabricatedPriceSite(siteId: string): FabricatedPriceSite | undefined {
  return SITE_BY_ID.get(siteId);
}

export interface RecordFabricatedPriceInput {
  /** Catalogue id from `FABRICATED_PRICE_SITES`. */
  readonly siteId: string;
  /** Overrides the catalogue constant when a site uses several values (e.g. borongan). */
  readonly constant?: number;
  readonly quantity?: number;
  readonly unit?: string;
  readonly itemName?: string;
  readonly calculatorId?: string;
  readonly calculatorTitle?: string;
}

/**
 * Record that a fabricated constant was applied.
 *
 * IMPORTANT: this function returns `void`. It must never be used to obtain a
 * price — the caller keeps using its existing constant so that Phase 1 stays
 * behaviour-preserving. Any change to a returned number here would violate the
 * Phase 1 exit gate.
 */
export function recordFabricatedPrice(input: RecordFabricatedPriceInput): void {
  const site = SITE_BY_ID.get(input.siteId);
  if (!site) return;

  const constant = input.constant ?? site.constant;
  const quantity = Number.isFinite(input.quantity) ? (input.quantity as number) : undefined;
  const fabricatedTotal = quantity === undefined ? 0 : quantity * constant;

  if (events.length >= MAX_EVENTS) {
    // Keep the first MAX_EVENTS for attribution; drop the tail rather than grow unbounded.
    return;
  }

  events.push({
    siteId: site.id,
    constant,
    severity: site.severity,
    file: site.file,
    line: site.line,
    calculatorId: input.calculatorId,
    calculatorTitle: input.calculatorTitle,
    itemName: input.itemName,
    quantity,
    unit: input.unit,
    fabricatedTotal,
    at: Date.now(),
  });
}

/**
 * Record with a pre-computed total (when quantity × constant has already been done by the caller).
 * `quantity` is accepted for attribution but never used to recompute the total.
 */
export function recordFabricatedTotal(
  siteId: string,
  fabricatedTotal: number,
  input: Omit<RecordFabricatedPriceInput, 'siteId'> = {},
): void {
  const site = SITE_BY_ID.get(siteId);
  if (!site) return;
  if (events.length >= MAX_EVENTS) return;

  events.push({
    siteId: site.id,
    constant: input.constant ?? site.constant,
    severity: site.severity,
    file: site.file,
    line: site.line,
    calculatorId: input.calculatorId,
    calculatorTitle: input.calculatorTitle,
    itemName: input.itemName,
    quantity: input.quantity,
    unit: input.unit,
    fabricatedTotal,
    at: Date.now(),
  });
}

/** All recorded events (read-only view). */
export function getFabricatedPriceEvents(): readonly FabricatedPriceEvent[] {
  return events;
}

/** Clear the buffer. Used by tests and by the impact-report script. */
export function resetFabricatedPriceTelemetry(): void {
  events.length = 0;
}

/** Aggregate the buffer into a report-ready summary. */
export function summarizeFabricatedPrices(): FabricatedPriceSummary {
  const bySite = new Map<string, {
    hits: number;
    exposedAmount: number;
    calculators: Set<string>;
    sampleItems: Set<string>;
  }>();
  const byCalculator = new Map<string, { hits: number; exposedAmount: number }>();
  const bySeverity: Record<FabricatedSeverity, { hits: number; exposedAmount: number }> = {
    CRITICAL: { hits: 0, exposedAmount: 0 },
    HIGH: { hits: 0, exposedAmount: 0 },
    MEDIUM: { hits: 0, exposedAmount: 0 },
  };

  let totalHits = 0;
  let totalExposedAmount = 0;

  for (const event of events) {
    totalHits += 1;
    totalExposedAmount += event.fabricatedTotal;

    const siteAgg = bySite.get(event.siteId) ?? {
      hits: 0,
      exposedAmount: 0,
      calculators: new Set<string>(),
      sampleItems: new Set<string>(),
    };
    siteAgg.hits += 1;
    siteAgg.exposedAmount += event.fabricatedTotal;
    if (event.calculatorId) siteAgg.calculators.add(event.calculatorId);
    if (event.itemName && siteAgg.sampleItems.size < 5) siteAgg.sampleItems.add(event.itemName);
    bySite.set(event.siteId, siteAgg);

    const calcKey = event.calculatorId || event.calculatorTitle || '(unknown)';
    const calcAgg = byCalculator.get(calcKey) ?? { hits: 0, exposedAmount: 0 };
    calcAgg.hits += 1;
    calcAgg.exposedAmount += event.fabricatedTotal;
    byCalculator.set(calcKey, calcAgg);

    bySeverity[event.severity].hits += 1;
    bySeverity[event.severity].exposedAmount += event.fabricatedTotal;
  }

  const sites: FabricatedPriceSiteSummary[] = [...bySite.entries()]
    .map(([siteId, agg]) => {
      const site = SITE_BY_ID.get(siteId);
      return {
        siteId,
        constant: site?.constant ?? 0,
        severity: site?.severity ?? 'MEDIUM',
        file: site?.file ?? '(unknown)',
        line: site?.line ?? 0,
        note: site?.note ?? '',
        hits: agg.hits,
        exposedAmount: agg.exposedAmount,
        calculators: [...agg.calculators].sort(),
        sampleItems: [...agg.sampleItems],
      };
    })
    .sort((a, b) => b.exposedAmount - a.exposedAmount || b.hits - a.hits);

  return {
    totalHits,
    totalExposedAmount,
    sites,
    byCalculator: [...byCalculator.entries()]
      .map(([calculator, agg]) => ({ calculator, ...agg }))
      .sort((a, b) => b.exposedAmount - a.exposedAmount),
    bySeverity,
  };
}

/**
 * Render the summary as a Markdown impact report.
 * Kept here (not in the script) so the UI can reuse it later.
 */
export function renderFabricatedPriceReport(generatedAt = new Date()): string {
  const summary = summarizeFabricatedPrices();
  const idr = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

  const lines: string[] = [];
  lines.push('# LAPORAN DAMPAK HARGA KARANGAN (PHASE 1)');
  lines.push('');
  lines.push(`Dibuat: ${generatedAt.toISOString()}`);
  lines.push('');
  lines.push('Dokumen ini melaporkan berapa kali sistem **mengarang** harga, dan berapa rupiah yang terdampak.');
  lines.push('Tidak ada angka pada RAB yang diubah. Ini murni pengukuran.');
  lines.push('');
  lines.push('## Ringkasan');
  lines.push('');
  lines.push('| Metrik | Nilai |');
  lines.push('|---|---|');
  lines.push(`| Total pemakaian harga karangan | **${summary.totalHits}** |`);
  lines.push(`| Total nilai terdampak | **${idr(summary.totalExposedAmount)}** |`);
  lines.push(`| KRITIS | ${summary.bySeverity.CRITICAL.hits} pemakaian / ${idr(summary.bySeverity.CRITICAL.exposedAmount)} |`);
  lines.push(`| TINGGI | ${summary.bySeverity.HIGH.hits} pemakaian / ${idr(summary.bySeverity.HIGH.exposedAmount)} |`);
  lines.push(`| SEDANG | ${summary.bySeverity.MEDIUM.hits} pemakaian / ${idr(summary.bySeverity.MEDIUM.exposedAmount)} |`);

  if (summary.totalHits === 0) {
    lines.push('');
    lines.push('> Tidak ada pemakaian harga karangan yang terekam pada sesi ini.');
    lines.push('> Jalankan sweep terlebih dahulu untuk memperoleh data.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('## Pemakaian per lokasi fallback');
  lines.push('');
  lines.push('| Lokasi | Konstanta | Severitas | Pemakaian | Nilai terdampak |');
  lines.push('|---|---|---|---|---|');
  for (const site of summary.sites) {
    const constant = site.constant > 0 ? idr(site.constant) : '(kondisional)';
    lines.push(`| \`${site.file}:${site.line}\` | ${constant} | ${site.severity} | ${site.hits} | ${idr(site.exposedAmount)} |`);
  }

  lines.push('');
  lines.push('## Calculator paling terdampak');
  lines.push('');
  lines.push('| Calculator | Pemakaian | Nilai terdampak |');
  lines.push('|---|---|---|');
  for (const row of summary.byCalculator.slice(0, 25)) {
    lines.push(`| \`${row.calculator}\` | ${row.hits} | ${idr(row.exposedAmount)} |`);
  }

  lines.push('');
  lines.push('## Detail per lokasi');
  lines.push('');
  for (const site of summary.sites) {
    lines.push(`### \`${site.siteId}\``);
    lines.push('');
    lines.push(`- Berkas: \`${site.file}:${site.line}\``);
    lines.push(`- Severitas: **${site.severity}**`);
    lines.push(`- Konstanta: ${site.constant > 0 ? idr(site.constant) : '(kondisional)'}`);
    lines.push(`- Pemakaian: ${site.hits} kali, nilai terdampak ${idr(site.exposedAmount)}`);
    lines.push(`- Catatan: ${site.note}`);
    if (site.calculators.length > 0) {
      lines.push(`- Calculator: ${site.calculators.map((c) => `\`${c}\``).join(', ')}`);
    }
    if (site.sampleItems.length > 0) {
      lines.push(`- Contoh item: ${site.sampleItems.map((i) => `"${i}"`).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('**Catatan:** laporan ini adalah alat ukur, bukan perbaikan.');
  lines.push('Perbaikan (menghapus konstanta) dilakukan pada Phase 2 setelah data harga ber-region tersedia.');
  return lines.join('\n');
}

/** Narrow global handle so scripts and DevTools can inspect the buffer. */
export interface FabricatedPriceTelemetryGlobal {
  summarize: typeof summarizeFabricatedPrices;
  events: typeof getFabricatedPriceEvents;
  reset: typeof resetFabricatedPriceTelemetry;
  sites: readonly FabricatedPriceSite[];
}

const GLOBAL_KEY = '__EZRAB_FABRICATED_PRICE_TELEMETRY__';

/** Attach the telemetry to `globalThis` for interactive inspection. Idempotent. */
export function exposeFabricatedPriceTelemetry(): void {
  try {
    const holder = globalThis as unknown as Record<string, FabricatedPriceTelemetryGlobal>;
    if (!holder[GLOBAL_KEY]) {
      holder[GLOBAL_KEY] = {
        summarize: summarizeFabricatedPrices,
        events: getFabricatedPriceEvents,
        reset: resetFabricatedPriceTelemetry,
        sites: FABRICATED_PRICE_SITES,
      };
    }
  } catch {
    // Never let diagnostics break the application.
  }
}
