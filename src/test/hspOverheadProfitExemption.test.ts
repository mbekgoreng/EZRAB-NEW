/**
 * Gelombang 2 Blok A — Pengecualian O&P per-item ber-basis HSP (§17.1 opsi b).
 *
 * Aturan yang ditegakkan (keputusan owner, grant gelombang 2 2026-11-13):
 * item yang harganya SUDAH HSP/DHSP (mengandung overhead & profit ±10%
 * SE DJBK No. 47/SE/Dk/2026) tidak dikenai O&P rekap lagi; item ber-basis
 * Biaya Langsung (jalur DED, Premium Demo, QTO, chat add_item) TETAP kena
 * O&P. Pengecualian dikunci pada BASIS HARGA, bukan pada kind semata —
 * `priceSourceKind === 'OFFICIAL_AHSP'` saja TIDAK cukup (lima jalur
 * menempelkan kind itu dengan basis berbeda; lihat `isHspPricedItem`).
 *
 * GELOMBANG 2 THREADING (2026-11-13): jembatan transisional kind+label
 * (Blok A) DIHAPUS — pengecualian kini HANYA lewat penanda eksplisit
 * `priceCostBasis` yang ditandai produsen (gerbang template 'HSP';
 * DED/QTO/chat/demo-gen 'DIRECT_COST') dan diteruskan factory +
 * buildPushPayload. Bagian A mem-pin penghapusan jembatan itu; helper
 * bagian B/C/F memakai penanda eksplisit seperti produsen nyata.
 *
 * Run: npx tsx src/test/hspOverheadProfitExemption.test.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  UnifiedProjectEngine,
  isHspPricedItem,
} from '../engine/unifiedProjectEngine';
import {
  PREMIUM_DEMO_RAB_ITEMS,
  PREMIUM_DEMO_PROJECT,
} from '../data/premiumDemoData';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const eq = (a: unknown, b: unknown) => a === b;

const TEMPLATE_LABEL = 'Harga Resmi AHSP 2026';
const DED_LABEL = 'AHSP Kanonis (SE 47/2026)';
const DEMO_LABEL = 'AHSP 2026 — SE DJBK No. 47/SE/Dk/2026';

/* ========================================================================= */
/* A. Predikat basis — lima jalur OFFICIAL_AHSP dibedakan dengan benar.       */
/* ========================================================================= */
console.log('A. Predikat isHspPricedItem (basis harga, bukan kind semata)');
{
  check(
    'jembatan label DIHAPUS: kind+label template TANPA penanda TIDAK dibebaskan',
    isHspPricedItem({
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: TEMPLATE_LABEL,
    }) === false
  );
  check(
    'penanda eksplisit HSP dibebaskan (tanpa kind)',
    isHspPricedItem({ priceCostBasis: 'HSP' }) === true
  );
  check(
    'penanda eksplisit HSP menang atas kind pasar',
    isHspPricedItem({ priceCostBasis: 'HSP', priceSourceKind: 'MARKET_REFERENCE' }) === true
  );
  check(
    'penanda eksplisit DIRECT_COST menang atas label template',
    isHspPricedItem({
      priceCostBasis: 'DIRECT_COST',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: TEMPLATE_LABEL,
    }) === false
  );
  check(
    'item gerbang template dibebaskan (penanda HSP + OFFICIAL + label template)',
    isHspPricedItem({
      priceCostBasis: 'HSP',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: TEMPLATE_LABEL,
    }) === true
  );
  check(
    'tanda tangan DED TIDAK dibebaskan (OFFICIAL + label kanonis DED)',
    isHspPricedItem({ priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: DED_LABEL }) === false
  );
  check(
    'tanda tangan Premium Demo TIDAK dibebaskan (OFFICIAL + VERIFIED + label demo)',
    isHspPricedItem({ priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: DEMO_LABEL }) === false
  );
  check(
    'tanda tangan QTO TIDAK dibebaskan (OFFICIAL + label RESMI AHSP)',
    isHspPricedItem({ priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: 'RESMI AHSP' }) === false
  );
  check(
    'tanda tangan chat add_item TIDAK dibebaskan (OFFICIAL tanpa label)',
    isHspPricedItem({ priceSourceKind: 'OFFICIAL_AHSP' }) === false
  );
  check(
    'label template saja TIDAK dibebaskan (label bukan bukti basis — jembatan dihapus)',
    isHspPricedItem({ priceSourceKind: 'MARKET_REFERENCE', priceSourceLabel: TEMPLATE_LABEL }) === false
  );
  check(
    'MARKET_REFERENCE / EZRAB_ASSUMPTION / UNRESOLVED tidak dibebaskan',
    isHspPricedItem({ priceSourceKind: 'MARKET_REFERENCE' }) === false &&
      isHspPricedItem({ priceSourceKind: 'EZRAB_ASSUMPTION' }) === false &&
      isHspPricedItem({ priceSourceKind: 'UNRESOLVED' }) === false
  );
  check(
    'item kosong / null / undefined tidak dibebaskan (fail-closed)',
    isHspPricedItem({}) === false &&
      isHspPricedItem(null) === false &&
      isHspPricedItem(undefined) === false
  );
}

/* ========================================================================= */
/* B. recalculateCostSummary — tangga O&P dengan basis terpisah.              */
/* ========================================================================= */
console.log('B. recalculateCostSummary: pengecualian O&P per item');
{
  // Helper memakai penanda eksplisit seperti produsen nyata pasca
  // threading (gerbang template 'HSP', DED 'DIRECT_COST') — label saja
  // tidak lagi membebaskan apa pun (jembatan dihapus).
  const hspItem = (amount: number) => ({
    id: 'hsp-1',
    amount,
    priceStatus: 'PRICE_RESOLVED',
    priceCostBasis: 'HSP',
    priceSourceKind: 'OFFICIAL_AHSP',
    priceSourceLabel: TEMPLATE_LABEL,
  });
  const dedItem = (amount: number) => ({
    id: 'ded-1',
    amount,
    priceStatus: 'PRICE_RESOLVED',
    priceCostBasis: 'DIRECT_COST',
    priceSourceKind: 'OFFICIAL_AHSP',
    priceSourceLabel: DED_LABEL,
  });
  const marketItem = (amount: number) => ({
    id: 'mkt-1',
    amount,
    priceStatus: 'PRICE_RESOLVED',
    priceSourceKind: 'MARKET_REFERENCE',
  });

  // B1 — proyek 0%/0%: campuran HSP + non-HSP identik dengan sebelum
  // perubahan (basis apa pun × 0% = 0).
  {
    const s = UnifiedProjectEngine.recalculateCostSummary(
      [hspItem(1000000), marketItem(1000000)] as never,
      { overheadPercent: 0, profitPercent: 0, ppnEnabled: false } as never
    );
    check('B1 0%/0% tanpa PPN: grand = direct', eq(s.grandTotal, 2000000), `dapat ${s.grandTotal}`);
    check('B1 0%/0%: OH & profit 0', s.overheadAmount === 0 && s.profitAmount === 0);
    const sPpn = UnifiedProjectEngine.recalculateCostSummary(
      [hspItem(1000000), marketItem(1000000)] as never,
      { overheadPercent: 0, profitPercent: 0, taxPercent: 11, ppnEnabled: true } as never
    );
    check('B1 0%/0% + PPN: PPN 220.000, grand 2.220.000',
      sPpn.taxAmount === 220000 && sPpn.grandTotal === 2220000,
      `PPN ${sPpn.taxAmount} grand ${sPpn.grandTotal}`);
  }

  // B2 — pasangan 3.1.3.8 (10 m²): HSP Rp135.600 dibebaskan, Biaya Langsung
  // Rp123.274 tetap kena O&P; + item pasar Rp500.000.
  // direct = 1.356.000 + 1.232.740 + 500.000 = 3.088.740
  // basis O&P = 3.088.740 − 1.356.000 = 1.732.740 → OH = profit = 86.637
  // subtotal = 3.262.014; PPN = round(3.262.014 × 11%) = 358.822
  // grand = 3.620.836 (tanpa pengecualian: 3.771.352; selisih 150.516).
  {
    const items = [hspItem(1356000), dedItem(1232740), marketItem(500000)];
    const s = UnifiedProjectEngine.recalculateCostSummary(items as never, {
      overheadPercent: 5, profitPercent: 5, taxPercent: 11, ppnEnabled: true,
    } as never);
    check('B2 direct tetap 3.088.740 (item HSP tetap masuk direct)',
      eq(s.directCost, 3088740), `dapat ${s.directCost}`);
    check('B2 OH 86.637 (basis 1.732.740, bukan 3.088.740)',
      eq(s.overheadAmount, 86637), `dapat ${s.overheadAmount}`);
    check('B2 profit 86.637', eq(s.profitAmount, 86637), `dapat ${s.profitAmount}`);
    check('B2 subtotal 3.262.014', eq(s.subtotalBeforeTax, 3262014), `dapat ${s.subtotalBeforeTax}`);
    check('B2 PPN 358.822 (tetap atas subtotal penuh incl. item HSP)',
      eq(s.taxAmount, 358822), `dapat ${s.taxAmount}`);
    check('B2 grand 3.620.836', eq(s.grandTotal, 3620836), `dapat ${s.grandTotal}`);
    // Pasangan kontrol: jumlah SAMA, penanda HSP dicabut (item DED) → tangga lama.
    const noExempt = UnifiedProjectEngine.recalculateCostSummary(
      [dedItem(1356000), dedItem(1232740), marketItem(500000)] as never,
      { overheadPercent: 5, profitPercent: 5, taxPercent: 11, ppnEnabled: true } as never
    );
    check('B2 kontrol tanpa penanda HSP: grand lama 3.771.352',
      eq(noExempt.grandTotal, 3771352), `dapat ${noExempt.grandTotal}`);
    check('B2 delta pengecualian = 150.516',
      eq(noExempt.grandTotal - s.grandTotal, 150516));
  }

  // B3 — item DED saja tetap kena O&P penuh.
  {
    const s = UnifiedProjectEngine.recalculateCostSummary([dedItem(1232740)] as never, {
      overheadPercent: 5, profitPercent: 5, ppnEnabled: false,
    } as never);
    check('B3 DED: OH = profit = 61.637, grand 1.356.014',
      s.overheadAmount === 61637 && s.profitAmount === 61637 && s.grandTotal === 1356014,
      `OH ${s.overheadAmount} grand ${s.grandTotal}`);
  }

  // B4 — item HSP saja: O&P nol.
  {
    const s = UnifiedProjectEngine.recalculateCostSummary([hspItem(1356000)] as never, {
      overheadPercent: 5, profitPercent: 5, ppnEnabled: false,
    } as never);
    check('B4 HSP saja: OH = profit = 0, grand = direct 1.356.000',
      s.overheadAmount === 0 && s.profitAmount === 0 && s.grandTotal === 1356000,
      `OH ${s.overheadAmount} grand ${s.grandTotal}`);
  }

  // B5 — tangga lama tidak berubah untuk item tanpa penanda (pin batch4).
  {
    const s = UnifiedProjectEngine.recalculateCostSummary(
      [{ amount: 892612393, priceStatus: 'PRICE_RESOLVED' }] as never,
      { overheadPercent: 5, profitPercent: 5, taxPercent: 11, ppnEnabled: true } as never
    );
    check('B5 item tanpa penanda: grand lama 1.089.879.733',
      s.grandTotal === 1089879733 &&
        s.overheadAmount === 44630620 &&
        s.profitAmount === 44630620 &&
        s.taxAmount === 108006100,
      `grand ${s.grandTotal}`);
  }

  // B6 — item HSP PRICE_UNRESOLVED tidak masuk direct maupun basis.
  {
    const s = UnifiedProjectEngine.recalculateCostSummary(
      [
        {
          id: 'hsp-u', amount: null, unitPrice: null,
          priceStatus: 'PRICE_UNRESOLVED',
          priceCostBasis: 'HSP',
          priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: TEMPLATE_LABEL,
        },
        marketItem(1000000),
      ] as never,
      { overheadPercent: 5, profitPercent: 5, ppnEnabled: false } as never
    );
    check('B6 unresolved HSP: direct 1.000.000, unresolved 1, grand 1.100.000',
      s.directCost === 1000000 && s.unresolvedItems === 1 && s.grandTotal === 1100000,
      `direct ${s.directCost} unresolved ${s.unresolvedItems} grand ${s.grandTotal}`);
  }

  // B7 — kontingensi BUKAN O&P: tetap memakai directCost penuh.
  {
    const s = UnifiedProjectEngine.recalculateCostSummary(
      [hspItem(1000000), marketItem(1000000)] as never,
      { overheadPercent: 5, profitPercent: 0, contingencyPercent: 2, ppnEnabled: false } as never
    );
    check('B7 kontingensi 40.000 (2% × direct penuh 2.000.000), OH 50.000',
      s.contingencyAmount === 40000 && s.overheadAmount === 50000 && s.grandTotal === 2090000,
      `kontingensi ${s.contingencyAmount} OH ${s.overheadAmount} grand ${s.grandTotal}`);
  }

  // B8 — PPN tetap dikenakan atas nilai item HSP (HSP mengandung O&P,
  // bukan pajak).
  {
    const s = UnifiedProjectEngine.recalculateCostSummary([hspItem(1000000)] as never, {
      overheadPercent: 0, profitPercent: 0, taxPercent: 11, ppnEnabled: true,
    } as never);
    check('B8 HSP + PPN 11%: PPN 110.000, grand 1.110.000',
      s.taxAmount === 110000 && s.grandTotal === 1110000,
      `PPN ${s.taxAmount} grand ${s.grandTotal}`);
  }
}

/* ========================================================================= */
/* C. Jalur seksi (ekspor/Rekap) + threading penanda lewat normalizeSections.*/
/* ========================================================================= */
console.log('C. computeCostSummaryFromSections + normalizeSections');
{
  const flat = (over: Record<string, unknown>) => ({
    id: 'x', category: 'Pekerjaan Atap', volume: 10, unit: 'm2',
    unitPrice: 100000, amount: 1000000, totalPrice: 1000000,
    priceStatus: 'PRICE_RESOLVED', ...over,
  });
  const project = { overheadPercent: 5, costSummary: { profitPercent: 5 } } as never;

  // C1 — item HSP (penanda eksplisit + label) dibebaskan di jalur seksi;
  // penanda priceCostBasis diteruskan normalizeSections ke RABItem.
  {
    const hsp = flat({
      id: 'hsp', priceCostBasis: 'HSP',
      priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: TEMPLATE_LABEL,
    });
    const sections = UnifiedProjectEngine.normalizeSections({} as never, [hsp, flat({ id: 'mkt', priceSourceKind: 'MARKET_REFERENCE' })] as never);
    const normHsp = sections[0].items.find((it) => it.id === 'hsp') as any;
    check('C1 normalizeSections meneruskan priceCostBasis + label',
      normHsp?.priceCostBasis === 'HSP' && normHsp?.priceSourceLabel === TEMPLATE_LABEL,
      `basis ${normHsp?.priceCostBasis} label ${normHsp?.priceSourceLabel}`);
    const s = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);
    check('C1 jalur seksi: OH = profit = 50.000, grand 2.100.000',
      s.overheadAmount === 50000 && s.profitAmount === 50000 && s.grandTotal === 2100000,
      `OH ${s.overheadAmount} grand ${s.grandTotal}`);
  }

  // C2 — seksi tanpa item (subtotal tersimpan): tanpa bukti basis HSP,
  // O&P tetap penuh (fail-closed).
  {
    const s = UnifiedProjectEngine.computeCostSummaryFromSections(project, [
      { subtotal: 2000000, items: [] },
    ] as never);
    check('C2 seksi tanpa item: OH = profit = 100.000, grand 2.200.000',
      s.overheadAmount === 100000 && s.profitAmount === 100000 && s.grandTotal === 2200000,
      `OH ${s.overheadAmount} grand ${s.grandTotal}`);
  }

  // C3 — item DED lewat seksi tetap kena O&P penuh.
  {
    const sections = UnifiedProjectEngine.normalizeSections({} as never, [
      flat({ id: 'ded', priceCostBasis: 'DIRECT_COST', priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: DED_LABEL }),
      flat({ id: 'mkt', priceSourceKind: 'MARKET_REFERENCE' }),
    ] as never);
    const s = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);
    check('C3 DED lewat seksi: OH = profit = 100.000, grand 2.200.000',
      s.overheadAmount === 100000 && s.profitAmount === 100000 && s.grandTotal === 2200000,
      `OH ${s.overheadAmount} grand ${s.grandTotal}`);
  }
}

/* ========================================================================= */
/* D. Premium Demo PRJ-DEMO-PREMIUM-01 — total TIDAK berubah (delta Rp0).     */
/*                                                                            */
/* Alasan: ke-131 item OFFICIAL_AHSP fixture ber-basis Biaya Langsung         */
/* (generator demo-gen memakai comp.unitPrice gerbang kanonis DED, TIDAK      */
/* PERNAH hspPrice — grep hspPrice di demo-gen = 0 hit; perbandingan          */
/* resolver: tidak satu pun unitPrice fixture menyamai HSP yang melebihi     */
/* Biaya Langsungnya). Jadi tidak ada markup ganda di proyek ini dan          */
/* pengecualian yang benar tidak mengubah totalnya. Implementasi naif        */
/* berbasis kind saja akan menurunkan grand total sebesar Rp67.823.864        */
/* (menjadi Rp1.022.055.869) — regresi yang dihindari di sini.                */
/* ========================================================================= */
console.log('D. Premium Demo PRJ-DEMO-PREMIUM-01 (fixture nyata, 213 baris)');
{
  const items = PREMIUM_DEMO_RAB_ITEMS;
  check('D0 fixture 213 baris', items.length === 213, `dapat ${items.length}`);
  const kinds = new Map<string, number>();
  for (const it of items) kinds.set(it.priceSourceKind ?? '(none)', (kinds.get(it.priceSourceKind ?? '(none)') ?? 0) + 1);
  check('D0 komposisi kind: OFFICIAL 131 / MARKET 23 / ASSUMPTION 59',
    kinds.get('OFFICIAL_AHSP') === 131 &&
      kinds.get('MARKET_REFERENCE') === 23 &&
      kinds.get('EZRAB_ASSUMPTION') === 59,
    JSON.stringify([...kinds.entries()]));
  check('D0 tidak satu pun item membawa label gerbang template',
    items.every((it) => it.priceSourceLabel !== TEMPLATE_LABEL));
  const exempt = items.filter((it) => isHspPricedItem(it as never));
  const exemptAmount = exempt.reduce((a, it) => a + (it.amount || 0), 0);
  check('D0 item dibebaskan = 0 (tidak ada basis HSP di fixture)',
    exempt.length === 0 && exemptAmount === 0,
    `${exempt.length} item, Rp${exemptAmount}`);
  const s = UnifiedProjectEngine.recalculateCostSummary(items as never, {
    overheadPercent: 5, profitPercent: 5, taxPercent: 11, ppnEnabled: true,
  } as never);
  check('D1 direct 892.612.393', eq(s.directCost, 892612393), `dapat ${s.directCost}`);
  check('D1 OH 44.630.620', eq(s.overheadAmount, 44630620), `dapat ${s.overheadAmount}`);
  check('D1 profit 44.630.620', eq(s.profitAmount, 44630620), `dapat ${s.profitAmount}`);
  check('D1 subtotal 981.873.633', eq(s.subtotalBeforeTax, 981873633), `dapat ${s.subtotalBeforeTax}`);
  check('D1 PPN 108.006.100', eq(s.taxAmount, 108006100), `dapat ${s.taxAmount}`);
  check('D1 grand BARU = grand lama 1.089.879.733 (delta Rp0)',
    eq(s.grandTotal, 1089879733), `dapat ${s.grandTotal}`);
  check('D1 grand hasil hitung = grand tersimpan di fixture',
    eq(s.grandTotal, PREMIUM_DEMO_PROJECT.costSummary!.grandTotal));
}

/* ========================================================================= */
/* E. Golden kandang / multi-gedung / DED — tidak mengalir lewat engine.      */
/*                                                                            */
/* Bukti struktural: keempat modul penghitung golden TIDAK mengimpor          */
/* unifiedProjectEngine, dan rumus totalnya adalah jumlah langsung            */
/* (tanpa O&P): totalsFromItems menjumlah per ember; DedAiCalculator          */
/* menjumlah subtotal kategori. Perubahan berkas engine ini tidak dapat       */
/* mengubah ketiganya.                                                         */
/* ========================================================================= */
console.log('E. Golden tidak mengalir lewat engine (penjaga sumber)');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
  const goldenModules = [
    '../ai-tools/ezrab-ai/universalRab.ts',
    '../ai-tools/ded-ai-estimate/calculator.ts',
    '../ai-tools/ezrab-ai/specChain.ts',
    '../services/rabTemplateService.ts',
  ];
  for (const m of goldenModules) {
    check(`E ${m.split('/').pop()} tidak mengimpor unifiedProjectEngine`,
      !read(m).includes('unifiedProjectEngine'));
  }
  check('E rumus total draft = jumlah langsung per ember (tanpa O&P)',
    read('../ai-tools/ezrab-ai/universalRab.ts').includes(
      'verifiedTotal + databaseTotal + marketTotal + manualTotal'
    ));
  check('E rumus grand total DED = jumlah subtotal kategori (tanpa O&P)',
    read('../ai-tools/ded-ai-estimate/calculator.ts').includes(
      'categorySummaries.reduce((acc, c) => acc + c.subtotal, 0)'
    ));
}

/* ========================================================================= */
/* F. F.46 + 3.1.3.8 — bukti resolver (§17.2 & §10.2).                        */
/* ========================================================================= */
console.log('F. F.46 (makadam) & 3.1.3.8 (Galvalum) lewat resolver kanonis');
{
  const f46 = officialAhspRepository.getOfficialAhsp('F.46');
  check('F1 F.46 ditemukan di katalog kanonis', f46 != null);
  if (f46) {
    const c = priceResolver2026.resolveAhspUnitPrice(f46);
    check('F1 F.46 hspPrice = 1.723.874,06 (HSP tercetak Lampiran V p.916)',
      Math.abs((c.hspPrice as number) - 1723874.06) < 0.01, `dapat ${c.hspPrice}`);
    check('F1 F.46 unitPrice komposisi = 126.039 (4 peralatan, tanpa tenaga/material)',
      c.unitPrice === 126039, `dapat ${c.unitPrice}`);
    check('F1 F.46 status FULL 4/4 (komposisi terpotong tetap FULL)',
      c.pricingStatus === 'FULL' && c.resolvedComponents === 4 && c.totalComponents === 4,
      `${c.pricingStatus} ${c.resolvedComponents}/${c.totalComponents}`);
    // ARTEFAK YANG DIDOKUMENTASIKAN, BUKAN O&P SEBENARNYA:
    // overheadAmount resolver = hspPrice − unitPrice komposisi terpotong
    // = 1.723.874,06 − 126.039 = 1.597.835. O&P sebenarnya menurut
    // formulir PDF p.916 adalah Rp156.715,82 (10% × D Rp1.567.158,23).
    // Nilai artefak ini tidak dipakai gerbang template (hanya hspPrice +
    // splits yang diteruskan) dan TIDAK BOLEH dikutip sebagai O&P F.46.
    check('F1 F.46 overheadAmount resolver = 1.597.835 (ARTEFAK — bukan O&P Rp156.715,82)',
      (c as any).overheadAmount === 1597835, `dapat ${(c as any).overheadAmount}`);
  }
  const g38 = officialAhspRepository.getOfficialAhsp('3.1.3.8');
  check('F2 3.1.3.8 ditemukan di katalog kanonis', g38 != null);
  if (g38) {
    const c = priceResolver2026.resolveAhspUnitPrice(g38);
    check('F2 3.1.3.8 unitPrice (Biaya Langsung) = 123.274',
      c.unitPrice === 123274, `dapat ${c.unitPrice}`);
    check('F2 3.1.3.8 hspPrice (DHSP) = 135.600',
      c.hspPrice === 135600, `dapat ${c.hspPrice}`);
    check('F2 3.1.3.8 overheadAmount resolver = 12.326',
      (c as any).overheadAmount === 12326, `dapat ${(c as any).overheadAmount}`);
  }

  // F3 — item makadam F.46 template (900 m³ × Rp1.723.874,06) dibebaskan
  // dari O&P saat proyek mengonfigurasi O&P 5%/5%: amount dibulatkan
  // seperti factory (900 × 1.723.874,06 = 1.551.486.654).
  {
    const s = UnifiedProjectEngine.recalculateCostSummary(
      [
        {
          id: 'macadam', amount: 1551486654, priceStatus: 'PRICE_RESOLVED',
          priceCostBasis: 'HSP',
          priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: TEMPLATE_LABEL,
        },
        { id: 'mkt', amount: 100000000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' },
      ] as never,
      { overheadPercent: 5, profitPercent: 5, ppnEnabled: false } as never
    );
    check('F3 F.46 template: OH = profit = 5.000.000 (hanya atas item pasar)',
      s.overheadAmount === 5000000 && s.profitAmount === 5000000,
      `OH ${s.overheadAmount} profit ${s.profitAmount}`);
    check('F3 F.46 template: grand 1.661.486.654',
      eq(s.grandTotal, 1661486654), `dapat ${s.grandTotal}`);
  }
}

console.log(`\nhspOverheadProfitExemption: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
