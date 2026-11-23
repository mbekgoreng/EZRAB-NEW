/**
 * chatBudgetRabFullAi.test.ts — W5: Budget-Based RAB dengan hasil FULL AI
 * (§5 program Universal Construction Intelligence; DESIGN.md §6.3).
 *
 * Owner (2026-11-22 20:55): request RAB ber-budget di chat ("saya ada
 * uang 120jt… buatkan RAB…") harus menghasilkan RAB LENGKAP (pekerjaan +
 * volume + spek material + harga + total + verdict vs cap) dengan setiap
 * angka karangan AI berlabel asumsi + dasar dinyatakan. Berlaku generik
 * (bukan khusus satu preset/ukuran/jenis bangunan).
 *
 * Suite tsx polos (BUKAN vitest): AI `execute` SELALU di-stub lewat
 * injeksi deps — tanpa live gateway, tanpa network, tanpa paid call.
 * Jalankan: npx --yes tsx src/test/chatBudgetRabFullAi.test.ts
 *
 * CATATAN KALIBRASI (probe 2026-11-22, HEAD 450787a):
 * - buildDirectRab Tipe 36/45 + buildSpecRab 8x12: 25 item, 1 tak
 *   berharga (kloset, vol 1, satuan 'unit'); totalDirect T36 =
 *   Rp 116.737.891. Total ekspektasi dihitung DINAMIS dari engine
 *   (bukan angka pin) agar tahan perubahan data harga.
 * - Draft universal template NYATA semuanya berharga penuh (0 tak
 *   berharga) — tes universal mensimulasikan kondisi "database tak
 *   punya harga" dengan mengosongkan harga pada item generasi draft
 *   nyata (helper nullPricesWhere), lalu completion mengisinya.
 */

import {
  completeBudgetRabWithFullAi,
  buildFullAiCompletionSummary,
  draftNeedsFullAiCompletion,
  BUDGET_FULL_AI_FOLLOWUP_RE,
} from '../ai-tools/ezrab-ai/fullAiRabCompletion';
import type {
  ChatRabCompletionDeps,
  AdaptableChatItem,
} from '../ai-tools/ezrab-ai/fullAiRabCompletion';
import { buildDirectRab, formatDirectRabMessage } from '../ai-tools/ezrab-ai/directRab';
import type { DirectRabResult } from '../ai-tools/ezrab-ai/directRab';
import { buildSpecRab } from '../ai-tools/ezrab-ai/specRab';
import {
  buildUniversalDraft,
  formatUniversalDraftMessage,
  effectiveItems,
  isPriceValidForTotal,
  reviseUniversalDraft,
  transferPriceStatus,
  transferVerificationStatus,
  hasResolvedPriceEvidence,
} from '../ai-tools/ezrab-ai/universalRab';
import type { UniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import { executeBudgetFullAiRab } from '../ai-tools/ezrab-ai/actionRegistry';
import type { ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';
import { formatRupiah } from '../engine/formulaEngine';
import { spreadsheetToWorkItems } from '../ai-design/designToRabBridge';
import { parseHousePrompt } from '../ai-design/specEngine';
import { specToSpreadsheetRows } from '../ai-design/DesignSpreadsheet';

/* ------------------------------------------------------------------ */
/* Harness (pola dedFullAiQuantityAssumptions.src.ts)                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Stub execute                                                        */
/* ------------------------------------------------------------------ */

type StubCall = {
  kind: 'price' | 'quantity';
  prompt: string;
  system: string;
  tier: string | null;
};

const TIER_PRICES: Record<string, number> = {
  ekonomis: 100_000,
  standar: 150_000,
  menengah: 200_000,
  premium: 300_000,
  mewah: 500_000,
};

interface StubOptions {
  priceFor?: (no: number, tier: string, unit: string) => number;
  qtyFor?: (no: number) => { qty: number; formula: string; basis: string };
  /** Override mentah per nomor item (digabung ke fill default — untuk
   *  harga gila / tanpa basis / unit mismatch / ahspCode). */
  priceOverrides?: Map<number, Record<string, unknown>>;
  /** Field tambahan di payload JSON (untuk "total model diabaikan"). */
  extraPayload?: Record<string, unknown>;
  fail?: 'throw' | 'error' | null;
  failKind?: 'price' | 'quantity' | 'all';
}

function makeStub(opts: StubOptions = {}): { deps: ChatRabCompletionDeps; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const execute = async (req: {
    prompt: string;
    systemPrompt?: string;
  }): Promise<Record<string, unknown>> => {
    const prompt = String(req.prompt ?? '');
    const isPrice = prompt.includes('ISI HARGA SATUAN');
    const kind: 'price' | 'quantity' = isPrice ? 'price' : 'quantity';
    const tierM = /Kualitas: (EKONOMIS|STANDAR|MENENGAH|PREMIUM|MEWAH)/.exec(prompt);
    const tier = tierM ? tierM[1].toLowerCase() : null;
    calls.push({ kind, prompt, system: String(req.systemPrompt ?? ''), tier });
    if (opts.fail && (opts.failKind === 'all' || opts.failKind === kind || !opts.failKind)) {
      if (opts.fail === 'throw') throw new Error('stub transport failure');
      return {
        success: false,
        errorCode: 'MODEL_ERROR',
        stage: 'execute',
        message: 'stub model error',
        retryable: true,
      };
    }
    // Baris item prompt: - no N: "nama" (satuan: UNIT; ...
    const items: Array<{ no: number; unit: string }> = [];
    const re = /- no (\d+): "[^"]*" \(satuan: ([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) {
      items.push({ no: Number(m[1]), unit: m[2].trim() });
    }
    if (isPrice) {
      const fills = items.map(({ no, unit }) => {
        const base = {
          no,
          unitPrice: (opts.priceFor ?? ((_n, t) => TIER_PRICES[t ?? 'standar'] ?? 150_000))(
            no,
            tier ?? 'standar',
            unit,
          ),
          unit,
          spec: `spek stub kualitas ${tier ?? 'standar'} untuk item ${no}`,
          basis: `harga pasar stub, kualitas ${tier ?? 'standar'}`,
        };
        const over = opts.priceOverrides?.get(no);
        return over ? { ...base, ...over } : base;
      });
      return {
        success: true,
        content: JSON.stringify({ fills, ...(opts.extraPayload ?? {}) }),
        structured: null,
        requestId: 'stub-1',
      };
    }
    const fills = items.map(({ no }) => {
      const q = (opts.qtyFor ?? (() => ({ qty: 10, formula: '10 x 1', basis: 'asumsi stub: 10 satuan tipikal' })))(
        no,
      );
      return { no, qty: q.qty, formula: q.formula, basis: q.basis };
    });
    return {
      success: true,
      content: JSON.stringify({ fills }),
      structured: null,
      requestId: 'stub-1',
    };
  };
  return { deps: { execute: execute as ChatRabCompletionDeps['execute'], productId: 'EZRAB_AI' }, calls };
}

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

const MIN_CTX = {
  navigate: () => {},
  currentMenu: 'chat',
  activeProject: null,
  projects: [],
  projectTotal: null,
} as unknown as ChatActionContext;

/** Adapter item calc direct → input orkestrator (cermin actionRegistry). */
function directItemsToAdaptable(r: DirectRabResult): AdaptableChatItem[] {
  return r.calc.items.map((it) => ({
    description: it.name,
    category: it.category,
    volume: it.volume,
    unit: it.unit,
    unitPrice:
      typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) && it.unitPrice > 0
        ? it.unitPrice
        : null,
    priceStatus: it.priceStatus,
    totalPrice: it.totalPrice,
  }));
}

/** Kosongkan harga pada item generasi draft nyata (simulasi "database
 *  tak punya harga" — draft template nyata semuanya berharga penuh). */
function nullPricesWhere(
  draft: UniversalDraft,
  pred: (it: { description: string; unit: string }) => boolean,
): number {
  let nulled = 0;
  for (const part of draft.parts) {
    for (const gen of part.generation.items) {
      if (!pred(gen)) continue;
      gen.unitPrice = null;
      gen.amount = null;
      gen.totalPrice = null;
      gen.priceStatus = 'PRICE_UNRESOLVED';
      gen.priceSourceKind = 'UNRESOLVED';
      gen.priceSourceLabel = undefined;
      gen.priceSourceExplanation = undefined;
      nulled++;
    }
  }
  return nulled;
}

function buildGudangDraft(budgetText: string): UniversalDraft {
  const built = buildUniversalDraft(`buatkan rab gudang 10 x 20 m budget ${budgetText}`);
  if (built.kind !== 'draft') throw new Error(`gudang draft gagal dibangun: ${built.kind}`);
  return built.draft;
}

async function main(): Promise<void> {
  /* =================================================================
   * 1. Tipe 36 e2e (stubbed) — jalur direct + formatter completion.
   * ================================================================= */
  console.log('== 1. Tipe 36 e2e (stubbed) ==');
  {
    const r = buildDirectRab('buatkan rab rumah type 36');
    check('1a buildDirectRab T36 menghasilkan hasil', r !== null);
    const direct = r!;
    const defaultMsg = formatDirectRabMessage(direct);
    // Pin kosmetik (catatan koordinator): komponen 0% disembunyikan.
    check('1b pesan default tanpa "overhead 0%"', !defaultMsg.includes('overhead 0%'));
    check('1c pesan default tanpa "profit 0%"', !defaultMsg.includes('profit 0%'));
    check('1d pesan default tanpa "pajak 0%"', !defaultMsg.includes('pajak 0%'));
    check(
      '1e baris total RAB tanpa kurung saat semua 0%',
      defaultMsg.includes('**Total RAB PARSIAL — BELUM FINAL: '),
    );
    const engineTotal = direct.calc.generationResult.totalDirectCost;
    const unpriced = direct.calc.items.filter((i) => !(i.unitPrice > 0));
    check('1f tepat 1 item tak berharga (kloset)', unpriced.length === 1, `dapat ${unpriced.length}`);
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items: directItemsToAdaptable(direct),
      budgetCap: 120_000_000,
      quality: null,
      region: direct.region,
      projectType: direct.displayLabel,
      projectLabel: direct.displayLabel,
      deps: stub.deps,
      useLineTotals: true,
    });
    check('1g tidak gagal', result.failed === false);
    check('1h 1 harga terisi', result.filledPriceCount === 1, `dapat ${result.filledPriceCount}`);
    check('1i kualitas default standar', result.qualityUsed === 'standar' && result.qualityDefaulted === true);
    check('1j tanpa downgrade (UNDER)', result.qualityDowngradedFrom == null);
    const expectedTotal = engineTotal + unpriced.reduce((s, it) => s + it.volume * 150_000, 0);
    check(
      '1k total recomputed = engine + isian stub',
      result.totals.estimatedTotal === expectedTotal,
      `dapat ${result.totals.estimatedTotal}, harap ${expectedTotal}`,
    );
    check('1l verdict UNDER vs cap 120jt', result.feasibility.verdict === 'UNDER');
    check('1m satu panggilan harga (tanpa re-run)', stub.calls.filter((c) => c.kind === 'price').length === 1);
    // Formatter: completion menempel di salinan, calc asli TIDAK berubah.
    const completedItems = direct.calc.items.map((it, idx) => {
      const done = result.items[idx];
      if (!done || done.priceStatus !== 'PRICE_ESTIMATED') return it;
      return { ...it, unitPrice: done.unitPrice ?? it.unitPrice, totalPrice: done.totalPrice ?? it.totalPrice };
    });
    direct.fullAiCompletion = { items: completedItems, summary: buildFullAiCompletionSummary(result, 120_000_000) };
    const msg = formatDirectRabMessage(direct);
    check('1n blok completion tampil', msg.includes('Lengkapi dengan Full AI — Estimasi Sementara (asumsi AI)'));
    check('1o total recomputed tampil', msg.includes(formatRupiah(expectedTotal)));
    check('1p baris terisi ditandai (est. AI)', msg.includes('(est. AI)'));
    check('1q verdict DI BAWAH tampil', msg.includes('DI BAWAH anggaran'));
    check('1r caveat asumsi tampil', msg.includes('verdict kelayakan berlaku atas total asumsi ini, bukan atas harga resmi'));
    check('1s blok total RAB engine tidak tampil (diganti)', !msg.includes('**Total RAB PARSIAL'));
    check(
      '1t calc.items asli TIDAK dimutasi (kloset tetap 0)',
      direct.calc.items.find((i) => i.name.includes('Kloset'))?.unitPrice === 0,
    );
    check('1u spek per item terisi tampil', msg.includes('spek stub kualitas standar'));
  }

  /* =================================================================
   * 2. Tipe 45 — generik, bukan khusus satu preset.
   * ================================================================= */
  console.log('== 2. Tipe 45 ==');
  {
    const r = buildDirectRab('buatkan rab rumah type 45');
    check('2a buildDirectRab T45 menghasilkan hasil', r !== null);
    const direct = r!;
    const engineTotal = direct.calc.generationResult.totalDirectCost;
    const unpriced = direct.calc.items.filter((i) => !(i.unitPrice > 0));
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items: directItemsToAdaptable(direct),
      budgetCap: engineTotal + 50_000_000,
      quality: null,
      region: direct.region,
      projectType: direct.displayLabel,
      projectLabel: direct.displayLabel,
      deps: stub.deps,
      useLineTotals: true,
    });
    check('2b harga tak berharga terisi semua', result.filledPriceCount === unpriced.length);
    check(
      '2c total recomputed tepat',
      result.totals.estimatedTotal === engineTotal + unpriced.reduce((s, it) => s + it.volume * 150_000, 0),
    );
    check('2d verdict UNDER', result.feasibility.verdict === 'UNDER');
    check('2e tanpa downgrade', result.qualityDowngradedFrom == null);
  }

  /* =================================================================
   * 3. Custom size (spec 8x12) — generik ukuran bebas.
   * ================================================================= */
  console.log('== 3. Custom size 8x12 ==');
  {
    const r = buildSpecRab('buatkan rab rumah 8x12');
    check('3a buildSpecRab 8x12 menghasilkan hasil', r !== null);
    const direct = r!;
    const engineTotal = direct.calc.generationResult.totalDirectCost;
    const unpriced = direct.calc.items.filter((i) => !(i.unitPrice > 0));
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items: directItemsToAdaptable(direct),
      budgetCap: engineTotal + 50_000_000,
      quality: null,
      region: direct.region,
      projectType: direct.displayLabel,
      projectLabel: direct.displayLabel,
      deps: stub.deps,
      useLineTotals: true,
    });
    check('3b harga tak berharga terisi semua', result.filledPriceCount === unpriced.length);
    check(
      '3c total recomputed tepat',
      result.totals.estimatedTotal === engineTotal + unpriced.reduce((s, it) => s + it.volume * 150_000, 0),
    );
    check('3d verdict UNDER', result.feasibility.verdict === 'UNDER');
  }

  /* =================================================================
   * 4. Ruko/gudang (universal) — via executeBudgetFullAiRab + draft aktif.
   * ================================================================= */
  console.log('== 4. Gudang (universal, via registry) ==');
  {
    const draft = buildGudangDraft('800 juta');
    const nulled = nullPricesWhere(draft, (it) => it.unit === 'm2');
    check('4a 2 item m2 dikosongkan harganya', nulled === 2, `dapat ${nulled}`);
    const stub = makeStub();
    const res = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    check('4b registry ok', res.ok === true);
    check('4c blok completion tampil', res.message.includes('Lengkapi dengan Full AI — Estimasi Sementara (asumsi AI)'));
    check('4d hitungan terisi tampil', res.message.includes('Harga diisi AI untuk 2 dari 4 item'));
    check('4e kualitas standar dinyatakan', res.message.includes('kualitas standar'));
    check('4f verdict DI BAWAH tampil', res.message.includes('DI BAWAH anggaran'));
    check('4g caveat asumsi tampil', res.message.includes('verdict kelayakan di atas berlaku atas total asumsi ini, bukan atas harga resmi'));
    // Total: 37.600.000 + 190.800.000 + 200×150.000 + 270×150.000 = 298.900.000
    check('4h total Estimasi Sementara 298,9jt tampil', res.message.includes(formatRupiah(298_900_000)));
    check('4i porsi asumsi 70,5jt dinyatakan', res.message.includes(formatRupiah(70_500_000)));
    check('4j tanpa downgrade', !res.message.includes('diturunkan dari'));
    const eff = effectiveItems(draft);
    const filled = eff.filter((it) => it.priceStatus === 'PRICE_ESTIMATED');
    check('4k 2 item draft jadi PRICE_ESTIMATED', filled.length === 2, `dapat ${filled.length}`);
    check(
      '4l isian berlabel EZRAB_ASSUMPTION + NEEDS_VERIFICATION',
      filled.every((it) => it.priceSourceKind === 'EZRAB_ASSUMPTION' && it.verificationStatus === 'NEEDS_VERIFICATION'),
    );
    check(
      '4m label + penjelasan dasar terisi',
      filled.every((it) => (it.priceSourceLabel ?? '').length > 0 && (it.priceSourceExplanation ?? '').length > 0),
    );
    check(
      '4n item resolved (MARKET_REFERENCE) tak tersentuh',
      eff
        .filter((it) => it.priceSourceKind === 'MARKET_REFERENCE')
        .every((it) => it.priceStatus === 'PRICE_RESOLVED' && typeof it.unitPrice === 'number' && it.unitPrice > 0),
    );
    check('4o aksi push-universal disertakan', (res.actions ?? []).some((a) => a.action.kind === 'push-universal'));
  }

  /* =================================================================
   * 5. Harga resolved tak tersentuh (sintetis: OFFICIAL + MARKET).
   * ================================================================= */
  console.log('== 5. Harga resolved tak tersentuh ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Pekerjaan AHSP resmi', volume: 10, unit: 'm2', unitPrice: 125_000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'AHSP-REAL-1' },
      { description: 'Pekerjaan referensi pasar', volume: 5, unit: 'm3', unitPrice: 850_000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' },
      { description: 'Pekerjaan tanpa harga', volume: 2, unit: 'unit', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('5a hanya 1 terisi', result.filledPriceCount === 1);
    const [ahsp, market, unpriced] = result.items;
    check('5b AHSP: harga + status + kind + kode tak berubah', ahsp.unitPrice === 125_000 && ahsp.priceStatus === 'PRICE_RESOLVED' && ahsp.priceSourceKind === 'OFFICIAL_AHSP' && (ahsp as { ahspCode?: string }).ahspCode === 'AHSP-REAL-1');
    check('5c MARKET: harga + status + kind tak berubah', market.unitPrice === 850_000 && market.priceStatus === 'PRICE_RESOLVED' && market.priceSourceKind === 'MARKET_REFERENCE');
    check('5d tak berharga jadi ESTIMATED', unpriced.priceStatus === 'PRICE_ESTIMATED' && unpriced.unitPrice === 150_000);
    check(
      '5e total = 1.250.000 + 4.250.000 + 300.000',
      result.totals.estimatedTotal === 1_250_000 + 4_250_000 + 300_000,
      `dapat ${result.totals.estimatedTotal}`,
    );
  }

  /* =================================================================
   * 6. Quantity fills — rumus (deterministik) + AI (tanpa rumus).
   * ================================================================= */
  console.log('== 6. Quantity fills ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Pekerjaan berumus', volume: null, unit: 'm3', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED', formula: '2 x 3 x 0.5' },
      { description: 'Pekerjaan tanpa rumus', volume: null, unit: 'titik', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
      { description: 'Pekerjaan berkuantitas', volume: 4, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('6a tidak gagal', result.failed === false);
    check('6b 2 kuantitas terisi', result.filledQuantityCount === 2, `dapat ${result.filledQuantityCount}`);
    check('6c rumus 2x3x0.5 → 3', result.items[0].volume === 3, `dapat ${result.items[0].volume}`);
    check('6d AI mengisi tanpa rumus (10)', result.items[1].volume === 10, `dapat ${result.items[1].volume}`);
    check('6e kuantitas lama tak berubah (4)', result.items[2].volume === 4);
    check('6f isian kuantitas berdasar (formula/basis tercatat)', result.fills.quantities.length === 2 && result.fills.quantities.every((f) => f.formula.trim() !== '' || f.basis.trim() !== ''));
    check('6g 3 harga terisi', result.filledPriceCount === 3, `dapat ${result.filledPriceCount}`);
    check(
      '6h total = 3×150rb + 10×150rb + 4×150rb',
      result.totals.estimatedTotal === 3 * 150_000 + 10 * 150_000 + 4 * 150_000,
      `dapat ${result.totals.estimatedTotal}`,
    );
    check('6i kuantitas AI berlabel volumeSource AI_GENERATED', result.items[1].volumeSource === 'AI_GENERATED');
  }

  /* =================================================================
   * 7. Total recomputed app; total usulan model DIABAIKAN.
   * ================================================================= */
  console.log('== 7. Total recomputed (total model diabaikan) ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item A', volume: 10, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
      { description: 'Item B', volume: 20, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub({ extraPayload: { total: 999_999_999, grandTotal: 1, subtotal: 5 } });
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check(
      '7a total = Σ qty × harga (30 × 150rb)',
      result.totals.estimatedTotal === 30 * 150_000,
      `dapat ${result.totals.estimatedTotal}`,
    );
    check('7b total model 999jt TIDAK dipakai', result.totals.estimatedTotal !== 999_999_999);
    const summary = buildFullAiCompletionSummary(result, 100_000_000);
    check('7c ringkasan estimatedTotal sama', summary.estimatedTotal === 30 * 150_000);
    check('7d assumedTotal = total (semua asumsi)', summary.assumedTotal === 30 * 150_000);
  }

  /* =================================================================
   * 8. Verdict UNDER + OVER + caveat (formatter direct).
   * ================================================================= */
  console.log('== 8. Verdict UNDER + OVER + caveat ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item A', volume: 10, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    // UNDER: total 1,5jt vs cap 10jt.
    const stubUnder = makeStub();
    const under = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 10_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stubUnder.deps,
    });
    check('8a verdict UNDER', under.feasibility.verdict === 'UNDER');
    const direct = buildDirectRab('buatkan rab rumah type 36')!;
    direct.fullAiCompletion = {
      items: direct.calc.items,
      summary: buildFullAiCompletionSummary(under, 10_000_000),
    };
    const msgUnder = formatDirectRabMessage(direct);
    check('8b pesan UNDER memuat DI BAWAH anggaran', msgUnder.includes('DI BAWAH anggaran'));
    check('8c caveat asumsi tampil (UNDER)', msgUnder.includes('verdict kelayakan berlaku atas total asumsi ini, bukan atas harga resmi'));
    // OVER: total 1,5jt vs cap 100rb, kualitas ekonomis (tanpa downgrade).
    const stubOver = makeStub();
    const over = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000,
      quality: 'ekonomis',
      projectType: 'gedung',
      deps: stubOver.deps,
    });
    check('8d verdict OVER', over.feasibility.verdict === 'OVER');
    check('8e tanpa downgrade (sudah ekonomis)', over.qualityDowngradedFrom == null);
    direct.fullAiCompletion = {
      items: direct.calc.items,
      summary: buildFullAiCompletionSummary(over, 100_000),
    };
    const msgOver = formatDirectRabMessage(direct);
    check('8f pesan OVER memuat MELEBIHI anggaran', msgOver.includes('MELEBIHI anggaran'));
    check('8g pesan OVER memuat opsi (kurangi lingkup / tambah budget)', msgOver.includes('Lingkup perlu dikurangi atau budget ditambah'));
    check('8h caveat asumsi tampil (OVER)', msgOver.includes('verdict kelayakan berlaku atas total asumsi ini, bukan atas harga resmi'));
  }

  /* =================================================================
   * 9. Transfer honesty — ESTIMATED tetap ESTIMATED, tanpa bukti resolved.
   * ================================================================= */
  console.log('== 9. Transfer honesty ==');
  {
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const stub = makeStub();
    await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    const filled = effectiveItems(draft).filter((it) => it.priceStatus === 'PRICE_ESTIMATED');
    check('9a 2 item terisi untuk transfer', filled.length === 2);
    check(
      '9b transferPriceStatus = PRICE_ESTIMATED (bukan RESOLVED)',
      filled.every((it) => transferPriceStatus(it) === 'PRICE_ESTIMATED'),
    );
    check(
      '9c transferVerificationStatus = NEEDS_VERIFICATION',
      filled.every((it) => transferVerificationStatus(it) === 'NEEDS_VERIFICATION'),
    );
    check(
      '9d hasResolvedPriceEvidence = false (asumsi bukan bukti)',
      filled.every((it) => hasResolvedPriceEvidence(it) === false),
    );
    const resolved = effectiveItems(draft).filter((it) => it.priceSourceKind === 'MARKET_REFERENCE');
    check(
      '9e item MARKET_REFERENCE tetap punya bukti resolved',
      resolved.length > 0 && resolved.every((it) => hasResolvedPriceEvidence(it) === true),
    );
  }

  /* =================================================================
   * 10. Downgrade dinyatakan (standar OVER → ekonomis UNDER).
   * ================================================================= */
  console.log('== 10. Downgrade dinyatakan ==');
  {
    // Standar: 228,4jt + 70,5jt = 298,9jt (OVER cap 290jt).
    // Ekonomis: 228,4jt + 47jt = 275,4jt (UNDER).
    const draft = buildGudangDraft('290 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const stub = makeStub();
    const res = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    const priceCalls = stub.calls.filter((c) => c.kind === 'price');
    check('10a 2 panggilan harga (standar + re-run ekonomis)', priceCalls.length === 2, `dapat ${priceCalls.length}`);
    check('10b panggilan ke-1 STANDAR', priceCalls[0]?.tier === 'standar');
    check('10c panggilan ke-2 EKONOMIS', priceCalls[1]?.tier === 'ekonomis');
    check('10d prompt ke-2 memuat EKONOMIS', (priceCalls[1]?.prompt ?? '').includes('EKONOMIS'));
    check('10e downgrade dinyatakan', res.message.includes('diturunkan dari standar ke ekonomis'));
    check('10f total kualitas standar tampil (298,9jt)', res.message.includes(formatRupiah(298_900_000)));
    check('10g total ekonomis tampil (275,4jt)', res.message.includes(formatRupiah(275_400_000)));
    check('10h verdict sesudah downgrade UNDER', res.message.includes('DI BAWAH anggaran'));
    const eff = effectiveItems(draft);
    const filled = eff.filter((it) => it.priceStatus === 'PRICE_ESTIMATED');
    check('10i harga akhir = harga ekonomis (100rb)', filled.every((it) => it.unitPrice === 100_000));
    check('10j kualitas akhir ekonomis dinyatakan', res.message.includes('kualitas ekonomis'));
  }

  /* =================================================================
   * 11. Tanpa downgrade diam-diam (UNDER → 1 panggilan, tanpa baris).
   * ================================================================= */
  console.log('== 11. Tanpa downgrade diam-diam ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item A', volume: 10, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 10_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('11a 1 panggilan harga', stub.calls.filter((c) => c.kind === 'price').length === 1);
    check('11b tanpa downgrade', result.qualityDowngradedFrom == null && result.totalAtRequestedTier == null);
    const summary = buildFullAiCompletionSummary(result, 10_000_000);
    const direct = buildDirectRab('buatkan rab rumah type 36')!;
    direct.fullAiCompletion = { items: direct.calc.items, summary };
    const msg = formatDirectRabMessage(direct);
    check('11c pesan tanpa baris downgrade', !msg.includes('diturunkan dari'));
  }

  /* =================================================================
   * 12. Sudah-ekonomis OVER — tanpa pass ke-2, OVER + opsi.
   * ================================================================= */
  console.log('== 12. Sudah-ekonomis OVER ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item A', volume: 10, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000,
      quality: 'ekonomis',
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('12a verdict OVER', result.feasibility.verdict === 'OVER');
    check('12b 1 panggilan harga (tanpa re-run)', stub.calls.filter((c) => c.kind === 'price').length === 1);
    check('12c tanpa downgrade', result.qualityDowngradedFrom == null);
    check('12d kualitas tetap ekonomis', result.qualityUsed === 'ekonomis');
    const summary = buildFullAiCompletionSummary(result, 100_000);
    const direct = buildDirectRab('buatkan rab rumah type 36')!;
    direct.fullAiCompletion = { items: direct.calc.items, summary };
    const msg = formatDirectRabMessage(direct);
    check('12e pesan OVER + opsi', msg.includes('MELEBIHI anggaran') && msg.includes('Lingkup perlu dikurangi atau budget ditambah'));
    check('12f pesan tanpa baris downgrade', !msg.includes('diturunkan dari'));
  }

  /* =================================================================
   * 13. Default kualitas standar + dinyatakan.
   * ================================================================= */
  console.log('== 13. Default kualitas standar ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item A', volume: 10, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub();
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 10_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('13a qualityUsed standar', result.qualityUsed === 'standar');
    check('13b qualityDefaulted true', result.qualityDefaulted === true);
    check('13c harga = harga standar stub (150rb)', result.items[0].unitPrice === 150_000);
    const summary = buildFullAiCompletionSummary(result, 10_000_000);
    const direct = buildDirectRab('buatkan rab rumah type 36')!;
    direct.fullAiCompletion = { items: direct.calc.items, summary };
    const msg = formatDirectRabMessage(direct);
    check('13d pesan menyatakan asumsi kualitas', msg.includes('kualitas standar') && msg.includes('asumsi, karena kualitas tidak disebutkan'));
    // Kualitas eksplisit: tidak defaulted.
    const stub2 = makeStub();
    const result2 = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 10_000_000,
      quality: 'premium',
      projectType: 'gedung',
      deps: stub2.deps,
    });
    check('13e kualitas eksplisit premium, tidak defaulted', result2.qualityUsed === 'premium' && result2.qualityDefaulted === false);
    check('13f harga = harga premium stub (300rb)', result2.items[0].unitPrice === 300_000);
  }

  /* =================================================================
   * 14. Harga gila ditolak (di atas Rp50 M / di bawah Rp100).
   * ================================================================= */
  console.log('== 14. Harga gila ditolak ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item mahal gila', volume: 1, unit: 'unit', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
      { description: 'Item murah gila', volume: 1, unit: 'unit', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
      { description: 'Item wajar', volume: 1, unit: 'unit', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub({
      priceOverrides: new Map([
        [1, { unitPrice: 60_000_000_000 }],
        [2, { unitPrice: 50 }],
      ]),
    });
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('14a hanya item wajar terisi', result.filledPriceCount === 1, `dapat ${result.filledPriceCount}`);
    check('14b item mahal gila tetap UNRESOLVED', result.items[0].priceStatus === 'PRICE_UNRESOLVED' && result.items[0].unitPrice == null);
    check('14c item murah gila tetap UNRESOLVED', result.items[1].priceStatus === 'PRICE_UNRESOLVED' && result.items[1].unitPrice == null);
    check('14d unfilled memuat kedua item gila', result.unfilled.includes('Item mahal gila') && result.unfilled.includes('Item murah gila'));
    check('14e bukan failed (chunk berhasil, validasi menolak)', result.failed === false);
  }

  /* =================================================================
   * 15. Fill tanpa basis/spec ditolak.
   * ================================================================= */
  console.log('== 15. Fill tanpa basis/spec ditolak ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item tanpa spek', volume: 1, unit: 'unit', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
      { description: 'Item tanpa basis', volume: 1, unit: 'unit', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub({
      priceOverrides: new Map([
        [1, { spec: '' }],
        [2, { basis: '   ' }],
      ]),
    });
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('15a 0 terisi', result.filledPriceCount === 0, `dapat ${result.filledPriceCount}`);
    check('15b kedua item tetap UNRESOLVED', result.items.every((it) => it.priceStatus === 'PRICE_UNRESOLVED' && it.unitPrice == null));
    check('15c unfilled memuat keduanya', result.unfilled.length === 2);
    check('15d total 0 (tidak ada harga karangan)', result.totals.estimatedTotal === 0);
  }

  /* =================================================================
   * 16. ahspCode di-strip (harga kept, kode dibuang).
   * ================================================================= */
  console.log('== 16. ahspCode di-strip ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item A', volume: 2, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub({
      priceOverrides: new Map([[1, { ahspCode: 'AHSP-FAKE-123' }]]),
    });
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('16a harga tetap terisi', result.filledPriceCount === 1 && result.items[0].unitPrice === 150_000);
    check(
      '16b ahspCode TIDAK menempel di item terisi',
      (result.items[0] as { ahspCode?: string | null }).ahspCode == null,
    );
    check('16c kind tetap EZRAB_ASSUMPTION (bukan AHSP)', result.items[0].priceSourceKind === 'EZRAB_ASSUMPTION');
  }

  /* =================================================================
   * 17. AI gagal → fail-soft (orkestrator + registry).
   * ================================================================= */
  console.log('== 17. AI gagal fail-soft ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item A', volume: 2, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub({ fail: 'throw', failKind: 'all' });
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('17a failed true', result.failed === true);
    check('17b 0 terisi', result.filledPriceCount === 0 && result.filledQuantityCount === 0);
    check('17c item tidak berubah (tetap UNRESOLVED, null)', result.items[0].priceStatus === 'PRICE_UNRESOLVED' && result.items[0].unitPrice == null);
    check('17d failureMessage terisi', (result.failureMessage ?? '').length > 0);
    check('17e warning tercatat', result.warnings.length > 0);
    // Registry: pesan jujur + draft parsial tetap berlaku.
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const stub2 = makeStub({ fail: 'error', failKind: 'all' });
    const res = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub2.deps, target: 'universal' });
    check('17f pesan gagal jujur', res.message.includes('Lengkapi dengan Full AI gagal'));
    check('17g pesan menegaskan tidak ada harga dikarang', res.message.includes('tidak ada harga yang dikarang'));
    check('17h pesan memuat draft parsial asli', res.message.includes('Gudang'));
    check(
      '17i draft tetap tak berharga (0 ESTIMATED)',
      effectiveItems(draft).filter((it) => it.priceStatus === 'PRICE_ESTIMATED').length === 0,
    );
  }

  /* =================================================================
   * 18. Unit mismatch ditolak; normalisasi m2/m² diterima.
   * ================================================================= */
  console.log('== 18. Unit mismatch ==');
  {
    const items: AdaptableChatItem[] = [
      { description: 'Item m2 vs m3', volume: 2, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
      { description: 'Item m2 vs m²', volume: 2, unit: 'm2', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ];
    const stub = makeStub({
      priceOverrides: new Map([
        [1, { unit: 'm3' }],
        [2, { unit: 'm²' }],
      ]),
    });
    const result = await completeBudgetRabWithFullAi({
      items,
      budgetCap: 100_000_000,
      quality: null,
      projectType: 'gedung',
      deps: stub.deps,
    });
    check('18a mismatch m2/m3 ditolak', result.items[0].priceStatus === 'PRICE_UNRESOLVED' && result.items[0].unitPrice == null);
    check('18b ejaan m² diterima (normalisasi)', result.items[1].priceStatus === 'PRICE_ESTIMATED' && result.items[1].unitPrice === 150_000);
    check('18c unfilled memuat item mismatch', result.unfilled.includes('Item m2 vs m3'));
  }

  /* =================================================================
   * 19. Revisi menggugurkan fills dengan jujur.
   * ================================================================= */
  console.log('== 19. Revisi menggugurkan fills ==');
  {
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const stub = makeStub();
    const res = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    check('19a completion berhasil dulu', res.message.includes('Estimasi Sementara (asumsi AI)'));
    check(
      '19b fills menempel sebelum revisi',
      effectiveItems(draft).filter((it) => it.priceStatus === 'PRICE_ESTIMATED').length === 2,
    );
    const rev = reviseUniversalDraft(draft, 'ubah ukuran gudang menjadi 12 x 25 m');
    check('19c revisi diterapkan', rev !== null && rev.ok === true, rev ? rev.message.slice(0, 120) : 'null');
    const effAfter = effectiveItems(draft);
    check(
      '19d TIDAK ADA fills PRICE_ESTIMATED tersisa sesudah revisi',
      effAfter.filter((it) => it.priceStatus === 'PRICE_ESTIMATED').length === 0,
    );
    check(
      '19e TIDAK ADA kind EZRAB_ASSUMPTION tersisa',
      effAfter.filter((it) => it.priceSourceKind === 'EZRAB_ASSUMPTION').length === 0,
    );
    const msgAfter = formatUniversalDraftMessage(draft);
    check('19f pesan revisi tanpa blok completion', !msgAfter.includes('Estimasi Sementara (asumsi AI)'));
    const unpricedAfter = effAfter.filter((it) => !isPriceValidForTotal(it)).length;
    check(
      '19g predikat penawaran konsisten dengan keadaan pasca-revisi',
      draftNeedsFullAiCompletion({
        budgetCap: draft.spec.budgetCap,
        unpricedCount: unpricedAfter,
        totalItems: effAfter.length,
      }) === (unpricedAfter > 0),
      `unpriced=${unpricedAfter}`,
    );
  }

  /* =================================================================
   * 20. Byte-identical default paths + pin regex + pin kosmetik 0%
   *     (non-zero) + pin G17.
   * ================================================================= */
  console.log('== 20. Default byte-identical + pin regex/0%/G17 ==');
  {
    // Direct default: deterministik + tanpa penanda completion.
    const direct = buildDirectRab('buatkan rab rumah type 36')!;
    const msgA = formatDirectRabMessage(direct);
    const msgB = formatDirectRabMessage(direct);
    check('20a format direct deterministik (byte-identical)', msgA === msgB);
    check('20b default direct tanpa penanda completion', !msgA.includes('Estimasi Sementara (asumsi AI)') && !msgA.includes('(est. AI)') && !msgA.includes('Lengkapi dengan Full AI'));
    // Universal default: deterministik + tanpa penanda completion.
    const draft = buildGudangDraft('800 juta');
    const uniA = formatUniversalDraftMessage(draft);
    const uniB = formatUniversalDraftMessage(draft);
    check('20c format universal deterministik (byte-identical)', uniA === uniB);
    check('20d default universal tanpa penanda completion', !uniA.includes('Estimasi Sementara (asumsi AI)') && !uniA.includes('Lengkapi dengan Full AI'));
    // Regex trigger follow-up (DESIGN §6.3).
    check('20e regex cocok: full ai', BUDGET_FULL_AI_FOLLOWUP_RE.test('nah ini saya ingin full ai hasilnya'));
    check('20f regex cocok: isi semua harga', BUDGET_FULL_AI_FOLLOWUP_RE.test('isi semua harga'));
    check('20g regex cocok: lengkapi dengan full ai', BUDGET_FULL_AI_FOLLOWUP_RE.test('lengkapi dengan full ai'));
    check('20h regex cocok: lengkapi full ai (tanpa dengan)', BUDGET_FULL_AI_FOLLOWUP_RE.test('Lengkapi full ai'));
    check('20i regex cocok: isi harga', BUDGET_FULL_AI_FOLLOWUP_RE.test('tolong isi harga'));
    check('20j regex TIDAK cocok: request RAB baru', !BUDGET_FULL_AI_FOLLOWUP_RE.test('buatkan rab rumah type 36'));
    check('20k regex TIDAK cocok: tanya harga semen', !BUDGET_FULL_AI_FOLLOWUP_RE.test('berapa harga semen'));
    check('20l regex TIDAK cocok: "full" saja', !BUDGET_FULL_AI_FOLLOWUP_RE.test('full'));
    // Pin kosmetik 0% — komponen bukan nol TETAP tampil, 0% disembunyikan.
    const withComponents: DirectRabResult = {
      ...direct,
      generation: { ...direct.generation, overheadPercentage: 10, profitPercentage: 0, taxPercentage: 11 },
    };
    const msgC = formatDirectRabMessage(withComponents);
    check('20m komponen bukan nol tampil', msgC.includes('(termasuk overhead 10%, pajak 11%)'));
    check('20n profit 0% tetap disembunyikan', !msgC.includes('profit 0%'));
    // Pin G17-kecil: label G menempel di item desain.
    const parsed = parseHousePrompt('Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.');
    check('20o spec desain ter-parse', parsed.spec !== null);
    const workItems = spreadsheetToWorkItems(specToSpreadsheetRows(parsed.spec!));
    check('20p item desain dihasilkan', workItems.length > 0, `dapat ${workItems.length}`);
    check(
      '20q kelompok 01 Persiapan membawa gLabel G',
      workItems.some((it) => it.group === '01 Persiapan' && it.gLabel === '01. PEKERJAAN PERSIAPAN'),
      workItems.find((it) => it.group === '01 Persiapan')?.gLabel ?? 'tidak ada item 01 Persiapan',
    );
    const unknownGroup = spreadsheetToWorkItems([
      {
        id: 'x1',
        kategori: 'PEKERJAAN',
        kode: 'X-001',
        uraian: 'Pekerjaan kelompok aneh',
        kelompok: 'Kelompok Aneh Tak Dikenal',
        satuan: 'm2',
        volume: 1,
        panjang: 1,
        lebar: 1,
        tinggi: 0,
        status: 'OK',
        catatan: '',
      } as never,
    ]);
    check('20r kelompok tak dikenal → gLabel undefined', unknownGroup[0]?.gLabel === undefined);
  }

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
