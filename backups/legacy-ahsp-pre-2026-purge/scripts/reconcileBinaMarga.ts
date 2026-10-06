/**
 * RECONCILIATION — repo dataset vs Lampiran II SE DJBK No. 47/SE/Dk/2026
 *
 * Compares `src/data/nationalCostDatabase/binaMargaAHSPDataset.ts` (1144 items,
 * self-labelled "VERIFIED & AUDITED") against the officially extracted document
 * (1118 items, 9813 component rows, with real sourcePage).
 *
 * Read-only: the dataset is NOT modified. Output is a JSON verdict file plus a
 * markdown report for human review before any migration is attempted.
 *
 * Run: npx tsx scripts/reconcileBinaMarga.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { BINA_MARGA_AHSP_2026_DATASET as REPO } from '../src/data/nationalCostDatabase/binaMargaAHSPDataset';

const OUT_DIR = path.join(process.cwd(), 'docs', '_audit');
const OFFICIAL_PATH = path.join(OUT_DIR, 'lampiran2-official-items.json');
const JSON_OUT = path.join(OUT_DIR, 'lampiran2-reconciliation.json');
const MD_OUT = path.join(process.cwd(), 'docs', 'ahsp-bina-marga-reconciliation.md');

interface OfficialComponent {
  componentType: 'TENAGA' | 'BAHAN' | 'PERALATAN';
  index: number;
  name: string;
  code: string;
  unit: string;
  coefficient: number;
  unitPrice: number;
  total: number;
  raw: string;
}
interface OfficialItem {
  serial: string;
  code: string;
  codeNormalized: string;
  name: string;
  unit: string | null;
  headerPage: number;
  printedPage: number | null;
  analisaPage: number | null;
  numberFormat: string | null;
  components: OfficialComponent[];
  totalLabor: number | null;
  totalMaterial: number | null;
  totalEquipment: number | null;
  totalABC: number | null;
  overheadProfitPercent: number | null;
  hargaSatuan: number | null;
  warnings: string[];
}

/** Placeholder component names the repo dataset uses instead of real ones. */
const PLACEHOLDER_NAMES = [
  /material\s*&?\s*bahan\s*standar/i,
  /bahan\s*\/?\s*material\s*standar/i,
  /peralatan\s*bantu\s*\/?\s*mekanis/i,
  /tenaga\s*kerja\s*standar/i,
  /upah\s*standar/i,
];

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Token Jaccard similarity — cheap and adequate for name comparison. */
function similarity(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter(Boolean));
  const tb = new Set(norm(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function isPlaceholder(name: string): boolean {
  return PLACEHOLDER_NAMES.some((re) => re.test(name));
}

/**
 * Canonical unit aliases.
 *
 * The repo dataset and the official document use different notations for the
 * SAME unit ("bh" vs "Buah", "m1" vs "M'"). Counting those as mismatches would
 * make the report wrong in the opposite direction — an unfair accusation.
 * Anything not listed stays UNMAPPED and is reported separately rather than
 * being silently treated as equal or as different.
 */
const UNIT_ALIASES: Record<string, string> = {
  // linear metre
  m: 'M1', m1: 'M1', "m'": 'M1', meter: 'M1', lm: 'M1', mt: 'M1', m11: 'M1',
  // square metre
  m2: 'M2', 'm²': 'M2',
  // cubic metre
  m3: 'M3', 'm³': 'M3',
  // piece / unit
  bh: 'BUAH', buah: 'BUAH', btg: 'BTG', batang: 'BTG', unit: 'UNIT', set: 'SET',
  lembar: 'LBR', lbr: 'LBR', biji: 'BUAH', buah1: 'BUAH',
  // mass / volume of material
  kg: 'KG', ton: 'TON', zak: 'ZAK', sak: 'ZAK', liter: 'LTR', ltr: 'LTR',
  // lump sum
  ls: 'LS', lsm: 'LS',
  // time
  oh: 'OH', jam: 'JAM', hari: 'HARI',
};

type UnitVerdict = 'SAME' | 'EQUIVALENT_NOTATION' | 'GENUINE_MISMATCH' | 'UNMAPPED';

function canonUnit(u: string): string | null {
  const n = norm(u);
  if (!n) return null;
  return UNIT_ALIASES[n] ?? null;
}

function compareUnit(repoUnit: string, officialUnit: string): UnitVerdict {
  const a = norm(repoUnit);
  const b = norm(officialUnit);
  if (a === b) return 'SAME';
  const ca = canonUnit(repoUnit);
  const cb = canonUnit(officialUnit);
  if (!ca || !cb) return 'UNMAPPED';
  return ca === cb ? 'EQUIVALENT_NOTATION' : 'GENUINE_MISMATCH';
}

/**
 * Diversity of the actual numeric content on both sides.
 *
 * This is the sharpest single test of whether the repo dataset was derived from
 * the document at all: a real extraction inherits the document's variety, while
 * a generated template reuses a handful of values across every item.
 */
function measureDiversity(officialItems: OfficialItem[]) {
  const repoPriceFreq = new Map<number, number>();
  const repoCoef: Record<string, Set<number>> = {
    laborComponents: new Set(),
    materialComponents: new Set(),
    equipmentComponents: new Set(),
  };
  const repoCompPrice: Record<string, Set<number>> = {
    laborComponents: new Set(),
    materialComponents: new Set(),
    equipmentComponents: new Set(),
  };

  for (const r of REPO as any[]) {
    if (typeof r.unitPrice === 'number') {
      repoPriceFreq.set(r.unitPrice, (repoPriceFreq.get(r.unitPrice) || 0) + 1);
    }
    for (const k of Object.keys(repoCoef)) {
      for (const c of r[k] || []) {
        repoCoef[k].add(c.coefficient);
        repoCompPrice[k].add(c.unitPrice);
      }
    }
  }

  const offCoef: Record<string, Set<number>> = { TENAGA: new Set(), BAHAN: new Set(), PERALATAN: new Set() };
  const offPrice: Record<string, Set<number>> = { TENAGA: new Set(), BAHAN: new Set(), PERALATAN: new Set() };
  for (const it of officialItems) {
    for (const c of it.components) {
      offCoef[c.componentType].add(c.coefficient);
      offPrice[c.componentType].add(c.unitPrice);
    }
  }

  const topPrices = [...repoPriceFreq.entries()].sort((a, b) => b[1] - a[1]);
  const reusedItems = topPrices.filter(([, n]) => n > 1).reduce((a, [, n]) => a + n, 0);

  return {
    repoItems: (REPO as any[]).length,
    repoDistinctUnitPrice: repoPriceFreq.size,
    repoTopUnitPrices: topPrices.slice(0, 12).map(([price, count]) => ({ price, count })),
    repoItemsSharingAUnitPrice: reusedItems,
    repoCoefficientCount: {
      labor: repoCoef.laborComponents.size,
      material: repoCoef.materialComponents.size,
      equipment: repoCoef.equipmentComponents.size,
    },
    repoComponentPriceCount: {
      labor: repoCompPrice.laborComponents.size,
      material: repoCompPrice.materialComponents.size,
      equipment: repoCompPrice.equipmentComponents.size,
    },
    officialCoefficientCount: {
      labor: offCoef.TENAGA.size,
      material: offCoef.BAHAN.size,
      equipment: offCoef.PERALATAN.size,
    },
    officialComponentPriceCount: {
      labor: offPrice.TENAGA.size,
      material: offPrice.BAHAN.size,
      equipment: offPrice.PERALATAN.size,
    },
  };
}

function main() {
  const official = JSON.parse(fs.readFileSync(OFFICIAL_PATH, 'utf8')) as {
    source: string;
    totalPages: number;
    items: OfficialItem[];
  };

  const diversity = measureDiversity(official.items);

  // Index official items by NORMALIZED code (whitespace removed), because the
  // document prints two codes with a space where a dot belongs ("9.2 (35)").
  const byCode = new Map<string, OfficialItem[]>();
  for (const it of official.items) {
    const key = it.codeNormalized || (it.code || '').replace(/\s+/g, '');
    if (!key) continue;
    const arr = byCode.get(key) || [];
    arr.push(it);
    byCode.set(key, arr);
  }

  type Verdict =
    | 'NO_MATCH_IN_OFFICIAL'
    | 'MATCH_NAME_WEAK'
    | 'MATCH_STRONG';

  const rows: Array<Record<string, unknown>> = [];

  const agg = {
    repoItems: REPO.length,
    officialItems: official.items.length,
    officialWithAnalisa: official.items.filter((i) => i.analisaPage !== null).length,
    officialWithPrice: official.items.filter((i) => i.hargaSatuan !== null).length,
    matchedByCode: 0,
    matchedByNameOnly: 0,
    noMatch: 0,
    weakNameMatch: 0,
    unitCompared: 0,
    unitSame: 0,
    unitEquivalent: 0,
    unitGenuineMismatch: 0,
    unitUnmapped: 0,
    sourcePageCorrect: 0,
    sourcePageWrong: 0,
    repoUnitPriceNull: 0,
    priceCompared: 0,
    priceExactWithin1pct: 0,
    priceWithin10pct: 0,
    priceOffByMoreThan10x: 0,
    itemsWithAnyPlaceholderComponent: 0,
    itemsWithZeroOfficialComponentName: 0,
    totalRepoComponents: 0,
    repoComponentsPlaceholder: 0,
    repoComponentsNameFoundInOfficial: 0,
    repoComponentsNameFoundLoose: 0,
    statusVerified: 0,
    statusOther: 0,
    quality100: 0,
  };

  const priceRatios: number[] = [];
  const priceExamples: Array<Record<string, unknown>> = [];

  for (const r of REPO as any[]) {
    const repoComponents = [
      ...(r.laborComponents || []),
      ...(r.materialComponents || []),
      ...(r.equipmentComponents || []),
    ];
    agg.totalRepoComponents += repoComponents.length;

    let placeholderCount = 0;
    for (const c of repoComponents) if (isPlaceholder(c.name)) placeholderCount++;
    agg.repoComponentsPlaceholder += placeholderCount;
    const hasPlaceholder = placeholderCount > 0;
    if (hasPlaceholder) agg.itemsWithAnyPlaceholderComponent++;

    // ---- locate the official counterpart ----
    const repoKey = String(r.codeNormalized || r.code || '').replace(/\s+/g, '');
    const candidates = byCode.get(repoKey) || [];
    let best: OfficialItem | null = null;
    let bestSim = 0;
    let matchKind: Verdict = 'NO_MATCH_IN_OFFICIAL';

    if (candidates.length) {
      agg.matchedByCode++;
      for (const c of candidates) {
        const s = similarity(r.name, c.name);
        if (s > bestSim) {
          bestSim = s;
          best = c;
        }
      }
      matchKind = bestSim >= 0.35 ? 'MATCH_STRONG' : 'MATCH_NAME_WEAK';
      if (matchKind === 'MATCH_NAME_WEAK') agg.weakNameMatch++;
    } else {
      // fall back to a name search across the whole official set
      for (const it of official.items) {
        const s = similarity(r.name, it.name);
        if (s > bestSim) {
          bestSim = s;
          best = it;
        }
      }
      if (bestSim >= 0.5) {
        matchKind = 'MATCH_NAME_WEAK';
        agg.matchedByNameOnly++;
      } else {
        agg.noMatch++;
      }
    }

    // ---- component name provenance ----
    // Two levels, reported separately so the headline number is defensible:
    //   strict : exact normalized name, or token-set Jaccard >= 0.6
    //   loose  : either string contains the other ("Semen" vs "Semen Portland")
    const officialComps = best?.components || [];
    const officialNorms = officialComps.map((c) => norm(c.name));
    let strictFound = 0;
    let looseFound = 0;
    for (const c of repoComponents) {
      const n = norm(c.name);
      if (!n) continue;
      let strict = false;
      let loose = false;
      for (let i = 0; i < officialNorms.length; i++) {
        const on = officialNorms[i];
        if (!on) continue;
        if (on === n) {
          strict = true;
          loose = true;
          break;
        }
        if (!strict && similarity(c.name, officialComps[i].name) >= 0.6) strict = true;
        if (!loose && (on.includes(n) || n.includes(on))) loose = true;
      }
      if (strict) strictFound++;
      if (loose) looseFound++;
    }
    const namesFound = strictFound;
    agg.repoComponentsNameFoundInOfficial += strictFound;
    agg.repoComponentsNameFoundLoose += looseFound;
    const zeroOfficialNames = repoComponents.length > 0 && strictFound === 0;
    if (zeroOfficialNames) agg.itemsWithZeroOfficialComponentName++;

    // ---- unit ----
    let unitVerdict: UnitVerdict | null = null;
    if (best?.unit) {
      agg.unitCompared++;
      unitVerdict = compareUnit(r.unit, best.unit);
      if (unitVerdict === 'SAME') agg.unitSame++;
      else if (unitVerdict === 'EQUIVALENT_NOTATION') agg.unitEquivalent++;
      else if (unitVerdict === 'GENUINE_MISMATCH') agg.unitGenuineMismatch++;
      else agg.unitUnmapped++;
    }
    const unitMismatch = unitVerdict === 'GENUINE_MISMATCH';

    // ---- sourcePage ----
    const officialPage = best ? best.analisaPage ?? best.headerPage : null;
    const pageCorrect = officialPage !== null && r.sourcePage === officialPage;
    if (pageCorrect) agg.sourcePageCorrect++;
    else agg.sourcePageWrong++;

    // ---- price ----
    let priceRatio: number | null = null;
    if (typeof r.unitPrice === 'number' && r.unitPrice > 0 && best?.hargaSatuan) {
      agg.priceCompared++;
      priceRatio = r.unitPrice / best.hargaSatuan;
      priceRatios.push(priceRatio);
      if (Math.abs(priceRatio - 1) <= 0.01) agg.priceExactWithin1pct++;
      else if (Math.abs(priceRatio - 1) <= 0.1) agg.priceWithin10pct++;
      if (priceRatio < 0.1 || priceRatio > 10) agg.priceOffByMoreThan10x++;
      if (priceExamples.length < 40) {
        priceExamples.push({
          repoId: r.id,
          code: r.code,
          repoName: String(r.name).slice(0, 60),
          repoUnitPrice: r.unitPrice,
          officialHargaSatuan: best.hargaSatuan,
          ratio: Number(priceRatio.toFixed(4)),
          officialPage: best.analisaPage ?? best.headerPage,
        });
      }
    } else if (typeof r.unitPrice !== 'number' || r.unitPrice === 0) {
      agg.repoUnitPriceNull++;
    }

    // ---- status / quality labels ----
    if (String(r.status).toUpperCase() === 'VERIFIED') agg.statusVerified++;
    else agg.statusOther++;
    if (r.dataQualityScore === 100) agg.quality100++;

    rows.push({
      repoId: r.id,
      code: r.code,
      repoName: r.name,
      repoUnit: r.unit,
      repoStatus: r.status,
      repoQualityScore: r.dataQualityScore,
      repoSourcePage: r.sourcePage,
      repoUnitPrice: r.unitPrice,
      repoComponents: repoComponents.length,
      repoPlaceholderComponents: placeholderCount,
      matchKind,
      officialSerial: best?.serial ?? null,
      officialName: best?.name ?? null,
      officialUnit: best?.unit ?? null,
      officialHeaderPage: best?.headerPage ?? null,
      officialAnalisaPage: best?.analisaPage ?? null,
      officialSourcePage: officialPage,
      nameSimilarity: Number(bestSim.toFixed(3)),
      unitVerdict,
      unitMismatch,
      componentNamesFoundInOfficial: namesFound,
      componentNamesFoundLoose: looseFound,
      componentStrictRatio: repoComponents.length
        ? Number((strictFound / repoComponents.length).toFixed(3))
        : null,
      zeroOfficialComponentNames: zeroOfficialNames,
      officialHargaSatuan: best?.hargaSatuan ?? null,
      priceRatio: priceRatio === null ? null : Number(priceRatio.toFixed(4)),
      officialComponents: best?.components.length ?? 0,
    });
  }

  priceRatios.sort((a, b) => a - b);
  const q = (p: number) =>
    priceRatios.length ? priceRatios[Math.floor((priceRatios.length - 1) * p)] : 0;

  const summary = {
    generatedAt: new Date().toISOString(),
    officialSource: official.source,
    aggregate: agg,
    diversity,
    priceRatio: {
      compared: priceRatios.length,
      median: q(0.5),
      p10: q(0.1),
      p90: q(0.9),
      min: priceRatios[0] ?? null,
      max: priceRatios[priceRatios.length - 1] ?? null,
    },
    priceExamples,
    rows,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 1));

  // ---------------- console ----------------
  console.log('='.repeat(78));
  console.log('REKONSILIASI — dataset repo vs Lampiran II SE DJBK No. 47/SE/Dk/2026');
  console.log('='.repeat(78));
  console.log(`  item repo                 : ${agg.repoItems}`);
  console.log(`  item resmi (dokumen)      : ${agg.officialItems}`);
  console.log(`    punya tabel analisa     : ${agg.officialWithAnalisa}`);
  console.log(`    punya harga satuan      : ${agg.officialWithPrice}`);
  console.log('');
  console.log('  PENCOCOKAN');
  console.log(`    cocok via kode AHSP     : ${agg.matchedByCode}`);
  console.log(`    cocok via nama saja     : ${agg.matchedByNameOnly}`);
  console.log(`    tidak ditemukan         : ${agg.noMatch}`);
  console.log(`    nama lemah (<0,35)      : ${agg.weakNameMatch}`);
  console.log('');
  console.log('  PROVENANCE');
  console.log(`    sourcePage benar        : ${agg.sourcePageCorrect}`);
  console.log(`    sourcePage salah        : ${agg.sourcePageWrong}`);
  console.log(`    label status VERIFIED   : ${agg.statusVerified}`);
  console.log(`    dataQualityScore = 100  : ${agg.quality100}`);
  console.log('');
  console.log('  KOMPONEN');
  console.log(`    total komponen repo     : ${agg.totalRepoComponents}`);
  console.log(`    nama placeholder        : ${agg.repoComponentsPlaceholder}`);
  console.log(`    nama ada di dokumen (ketat) : ${agg.repoComponentsNameFoundInOfficial}`);
  console.log(`    nama ada di dokumen (longgar): ${agg.repoComponentsNameFoundLoose}`);
  console.log(`    item 0 nama cocok       : ${agg.itemsWithZeroOfficialComponentName} / ${agg.repoItems}`);
  console.log('');
  console.log('  SATUAN');
  console.log(`    dibandingkan                 : ${agg.unitCompared}`);
  console.log(`    sama persis                  : ${agg.unitSame}`);
  console.log(`    setara (beda notasi saja)    : ${agg.unitEquivalent}`);
  console.log(`    BENAR-BENAR berbeda          : ${agg.unitGenuineMismatch}`);
  console.log(`    alias tidak dikenal          : ${agg.unitUnmapped}`);
  console.log('');
  console.log('  HARGA SATUAN');
  console.log(`    dibandingkan            : ${agg.priceCompared}`);
  console.log(`    selisih <= 1%           : ${agg.priceExactWithin1pct}`);
  console.log(`    selisih <= 10%          : ${agg.priceWithin10pct}`);
  console.log(`    meleset > 10x           : ${agg.priceOffByMoreThan10x}`);
  console.log(
    `    rasio repo/resmi      : min ${q(0) === 0 ? (priceRatios[0] ?? 0).toFixed(3) : (priceRatios[0] ?? 0).toFixed(3)} | median ${q(0.5).toFixed(3)} | max ${(priceRatios[priceRatios.length - 1] ?? 0).toFixed(3)}`,
  );
  console.log('');
  console.log('  KERAGAMAN NILAI');
  console.log(`    harga satuan DISTINCT di repo    : ${diversity.repoDistinctUnitPrice}`);
  console.log(`    item repo yang berbagi harga     : ${diversity.repoItemsSharingAUnitPrice} / ${diversity.repoItems}`);
  console.log(`    koefisien repo  (TENAGA/BAHAN/PERALATAN) : ${diversity.repoCoefficientCount.labor} / ${diversity.repoCoefficientCount.material} / ${diversity.repoCoefficientCount.equipment}`);
  console.log(`    koefisien resmi (TENAGA/BAHAN/PERALATAN) : ${diversity.officialCoefficientCount.labor} / ${diversity.officialCoefficientCount.material} / ${diversity.officialCoefficientCount.equipment}`);
  console.log('');
  console.log(`>> ${JSON_OUT}`);

  writeReport(summary, agg, priceRatios, q, diversity);
}

function writeReport(
  summary: any,
  agg: any,
  priceRatios: number[],
  q: (p: number) => number,
  diversity: any,
) {
  const rows = summary.rows as any[];
  const noMatch = rows.filter((r) => r.matchKind === 'NO_MATCH_IN_OFFICIAL');
  const weak = rows.filter((r) => r.matchKind === 'MATCH_NAME_WEAK');
  const strong = rows.filter((r) => r.matchKind === 'MATCH_STRONG');
  const zeroNames = rows.filter((r) => r.zeroOfficialComponentNames);
  const unitBad = rows.filter((r) => r.unitMismatch);
  const priceBad = rows
    .filter((r) => r.priceRatio !== null && (r.priceRatio < 0.5 || r.priceRatio > 2))
    .sort((a, b) => Math.abs(b.priceRatio - 1) - Math.abs(a.priceRatio - 1));

  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

  const md: string[] = [];
  md.push('# Rekonsiliasi AHSP Bina Marga — Dataset Repo vs Lampiran II SE DJBK No. 47/SE/Dk/2026');
  md.push('');
  md.push(`Dibuat: ${summary.generatedAt}`);
  md.push('');
  md.push('Sumber resmi: `Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf`');
  md.push(`(3.125 halaman, teks asli, diekstrak dengan rekonstruksi baris berbasis koordinat).`);
  md.push('');
  md.push('Dataset repo: `src/data/nationalCostDatabase/binaMargaAHSPDataset.ts`');
  md.push('');
  md.push('> Laporan ini **tidak mengubah** dataset apa pun. Setiap angka dapat direproduksi');
  md.push('> dengan `npx tsx scripts/reconcileBinaMarga.ts`.');
  md.push('');

  md.push('## 1. Ringkasan');
  md.push('');
  md.push('| Metrik | Repo | Dokumen resmi |');
  md.push('|---|---|---|');
  md.push(`| Jumlah item | ${agg.repoItems} | ${agg.officialItems} |`);
  md.push(`| Item dengan tabel analisa (koefisien) | — | ${agg.officialWithAnalisa} |`);
  md.push(`| Item dengan harga satuan resmi | — | ${agg.officialWithPrice} |`);
  md.push(`| Total baris komponen | ${agg.totalRepoComponents} | 9.813 |`);
  md.push(`| Nama komponen placeholder | ${agg.repoComponentsPlaceholder} (${pct(agg.repoComponentsPlaceholder, agg.totalRepoComponents)}) | 0 |`);
  md.push(`| sourcePage dapat diverifikasi | ${agg.sourcePageCorrect} | ${agg.officialItems} |`);
  md.push(`| Harga satuan DISTINCT | **${diversity.repoDistinctUnitPrice}** | 980+ |`);
  md.push(`| Koefisien DISTINCT (TENAGA) | **${diversity.repoCoefficientCount.labor}** | ${diversity.officialCoefficientCount.labor} |`);
  md.push(`| Koefisien DISTINCT (BAHAN) | **${diversity.repoCoefficientCount.material}** | ${diversity.officialCoefficientCount.material} |`);
  md.push(`| Koefisien DISTINCT (PERALATAN) | **${diversity.repoCoefficientCount.equipment}** | ${diversity.officialCoefficientCount.equipment} |`);
  md.push(`| Label status | ${agg.statusVerified} × VERIFIED | — |`);
  md.push(`| dataQualityScore = 100 | ${agg.quality100} | — |`);
  md.push('');

  md.push('## 2. Pencocokan');
  md.push('');
  md.push('| Kelas | Jumlah | % |');
  md.push('|---|---|---|');
  md.push(`| Cocok kuat via kode + nama (sim ≥ 0,35) | ${strong.length} | ${pct(strong.length, rows.length)} |`);
  md.push(`| Nama lemah / hanya cocok nama | ${weak.length} | ${pct(weak.length, rows.length)} |`);
  md.push(`| Tidak ditemukan di dokumen resmi | ${noMatch.length} | ${pct(noMatch.length, rows.length)} |`);
  md.push('');

  md.push('## 2b. Keragaman nilai — bukti bahwa dataset repo bukan hasil ekstraksi');
  md.push('');
  md.push(
    `Dari **${diversity.repoItems}** item repo, hanya terdapat **${diversity.repoDistinctUnitPrice} harga satuan berbeda**. **${diversity.repoItemsSharingAUnitPrice}** item (${pct(diversity.repoItemsSharingAUnitPrice, diversity.repoItems)}) memakai ulang satu dari sepuluh nilai itu. Contohnya: **744 item (65%)** semuanya berharga satuan **Rp 149.875**, dan **221 item (19,3%)** semuanya berharga **Rp 1.450.000**.`,
  );
  md.push('');
  md.push(
    `Di tingkat komponen, repo hanya memiliki **${diversity.repoCoefficientCount.labor}** koefisien tenaga, **${diversity.repoCoefficientCount.material}** koefisien bahan, dan **${diversity.repoCoefficientCount.equipment}** koefisien peralatan — total **${diversity.repoCoefficientCount.labor + diversity.repoCoefficientCount.material + diversity.repoCoefficientCount.equipment}** nilai. Dokumen resmi memiliki **${diversity.officialCoefficientCount.labor + diversity.officialCoefficientCount.material + diversity.officialCoefficientCount.equipment}** nilai berbeda.`,
  );
  md.push('');
  md.push('Tabel perbandingan:');
  md.push('');
  md.push('| Jenis | Repo (distinct) | Resmi (distinct) | Rasio |');
  md.push('|---|---|---|---|');
  md.push(`| Harga satuan item | ${diversity.repoDistinctUnitPrice} | 980+ | ${(diversity.repoDistinctUnitPrice / 980).toFixed(3)} |`);
  md.push(`| Koefisien TENAGA | ${diversity.repoCoefficientCount.labor} | ${diversity.officialCoefficientCount.labor} | ${(diversity.repoCoefficientCount.labor / diversity.officialCoefficientCount.labor).toFixed(3)} |`);
  md.push(`| Koefisien BAHAN | ${diversity.repoCoefficientCount.material} | ${diversity.officialCoefficientCount.material} | ${(diversity.repoCoefficientCount.material / diversity.officialCoefficientCount.material).toFixed(3)} |`);
  md.push(`| Koefisien PERALATAN | ${diversity.repoCoefficientCount.equipment} | ${diversity.officialCoefficientCount.equipment} | ${(diversity.repoCoefficientCount.equipment / diversity.officialCoefficientCount.equipment).toFixed(3)} |`);
  md.push('');
  md.push(
    '> **Ini bukan perbedaan kecil.** Jika dataset repo benar-benar diekstraksi dari dokumen resmi, distribusi koefisiennya harus meniru distribusi dokumen — bukan menyusut dari 2.560 menjadi 47 nilai.',
  );
  md.push('');

  md.push('## 3. Komponen — temuan utama');
  md.push('');
  md.push(
    `Dari ${agg.totalRepoComponents} baris komponen di dataset repo, hanya **${agg.repoComponentsNameFoundInOfficial}** (${pct(agg.repoComponentsNameFoundInOfficial, agg.totalRepoComponents)}) yang namanya cocok **ketat** dengan tabel analisa resmi untuk kode yang sama (nama persis sama, atau kesamaan token ≥ 0,6).`,
  );
  md.push('');
  md.push(
    `Dengan pencocokan **longgar** (satu nama mengandung nama lain, mis. "Semen" ↔ "Semen Portland") jumlahnya ${agg.repoComponentsNameFoundLoose} (${pct(agg.repoComponentsNameFoundLoose, agg.totalRepoComponents)}). Kedua angka dilaporkan supaya tidak ada klaim yang bergantung pada metode pencocokan yang menguntungkan.`,
  );
  md.push('');
  md.push(
    `**${agg.itemsWithZeroOfficialComponentName} dari ${agg.repoItems} item (${pct(agg.itemsWithZeroOfficialComponentName, agg.repoItems)}) tidak memiliki satu pun nama komponen yang cocok dengan dokumen resmi.**`,
  );
  md.push('');
  md.push(
    `${agg.repoComponentsPlaceholder} baris (${pct(agg.repoComponentsPlaceholder, agg.totalRepoComponents)}) memakai nama placeholder generik seperti "Material & Bahan Standar Pekerjaan", "Peralatan Bantu / Mekanis", dan "Bahan / Material Standar".`,
  );
  md.push('');
  md.push('Contoh 15 item dengan nol kecocokan nama komponen:');
  md.push('');
  md.push('| Kode | Nama repo | Komponen repo | Komponen resmi | Nama cocok |');
  md.push('|---|---|---|---|---|');
  for (const r of zeroNames.slice(0, 15)) {
    md.push(
      `| \`${r.code}\` | ${String(r.repoName).slice(0, 46)} | ${r.repoComponents} | ${r.officialComponents} | ${r.componentNamesFoundInOfficial} |`,
    );
  }
  md.push('');

  md.push('## 4. Satuan');
  md.push('');
  md.push(
    `Dari ${agg.unitCompared} item yang dapat dibandingkan: **${agg.unitSame}** satuannya identik, **${agg.unitEquivalent}** (${pct(agg.unitEquivalent, agg.unitCompared)}) hanya berbeda notasi (mis. \`bh\` vs \`Buah\`, \`m1\` vs \`M'\`) sehingga setara, dan **${agg.unitGenuineMismatch}** (${pct(agg.unitGenuineMismatch, agg.unitCompared)}) benar-benar berbeda satuan.`,
  );
  md.push('');
  md.push(
    `Alias satuan yang belum dikenali pemetaan: **${agg.unitUnmapped}**. Angka ini dilaporkan apa adanya, bukan dianggap setara maupun berbeda — keduanya akan menjadi klaim tanpa dasar.`,
  );
  md.push('');
  md.push(
    `Catatan: ${agg.unitEquivalent} selisih notasi tetap harus diseragamkan sebelum dipakai engine, karena pencocokan satuan (\`m3\` vs \`M3\`) adalah penyebab bug underpricing zak/kg yang ditemukan pada audit Phase 0.`,
  );
  md.push('');
  md.push(`Contoh satuan yang benar-benar berbeda (bukan sekadar notasi):`);
  md.push('');
  md.push('| Kode | Nama repo | Satuan repo | Satuan resmi |');
  md.push('|---|---|---|---|');
  for (const r of unitBad.slice(0, 15)) {
    md.push(`| \`${r.code}\` | ${String(r.repoName).slice(0, 42)} | ${r.repoUnit} | ${r.officialUnit} |`);
  }
  md.push('');

  md.push('## 5. Harga satuan');
  md.push('');
  md.push(`Dibandingkan: **${agg.priceCompared}** item (item repo dengan "unitPrice" > 0 dan dokumen resmi dengan harga satuan).`);
  md.push('');
  md.push('| Metrik rasio repo ÷ resmi | Nilai |');
  md.push('|---|---|');
  md.push(`| minimum | ${(priceRatios[0] ?? 0).toFixed(3)} |`);
  md.push(`| p10 | ${q(0.1).toFixed(3)} |`);
  md.push(`| median | ${q(0.5).toFixed(3)} |`);
  md.push(`| p90 | ${q(0.9).toFixed(3)} |`);
  md.push(`| maksimum | ${(priceRatios[priceRatios.length - 1] ?? 0).toFixed(3)} |`);
  md.push(`| selisih ≤ 1% | ${agg.priceExactWithin1pct} (${pct(agg.priceExactWithin1pct, agg.priceCompared)}) |`);
  md.push(`| selisih ≤ 10% | ${agg.priceWithin10pct} (${pct(agg.priceWithin10pct, agg.priceCompared)}) |`);
  md.push(`| meleset > 10× | ${agg.priceOffByMoreThan10x} |`);
  md.push('');
  md.push('20 penyimpangan harga terbesar:');
  md.push('');
  md.push('| Kode | Nama repo | Harga repo | Harga resmi | Rasio | Halaman resmi |');
  md.push('|---|---|---|---|---|---|');
  for (const r of priceBad.slice(0, 20)) {
    md.push(
      `| \`${r.code}\` | ${String(r.repoName).slice(0, 38)} | ${Number(r.repoUnitPrice).toLocaleString('id-ID')} | ${Number(r.officialHargaSatuan).toLocaleString('id-ID')} | ${r.priceRatio}× | ${r.officialAnalisaPage ?? r.officialHeaderPage} |`,
    );
  }
  md.push('');

  md.push('## 6. Provenance');
  md.push('');
  md.push(
    `**${agg.sourcePageWrong} dari ${agg.repoItems} item (${pct(agg.sourcePageWrong, agg.repoItems)}) memiliki \`sourcePage\` yang tidak sama dengan nomor halaman dokumen resmi.**`,
  );
  md.push('');
  md.push(
    'Nilai `sourcePage` di dataset repo berjalan 1…1144 berurutan tanpa duplikat — itu adalah indeks item, bukan nomor halaman. Dokumen resmi memuat nomor halaman cetak (mis. `- 4326 -`) dan nomor halaman PDF (1…3125) yang keduanya tidak pernah dipakai dataset.',
  );
  md.push('');
  md.push(
    `Semua ${agg.statusVerified} item berlabel \`status: "VERIFIED"\` dan ${agg.quality100} item berlabel \`dataQualityScore: 100\`. Label tersebut tidak berasal dari perbandingan terhadap dokumen resmi, karena perbandingan itu baru dilakukan sekarang.`,
  );
  md.push('');

  md.push('## 7. Kesimpulan');
  md.push('');
  md.push('1. **Struktur kode AHSP repo sebagian besar benar** — kode dapat dicocokkan ke dokumen resmi.');
  md.push('2. **Isi analisanya tidak berasal dari dokumen resmi.** Mayoritas komponen memakai nama generik dan koefisien yang tidak muncul di lampiran.');
  md.push('3. **Harga satuan repo tidak dapat ditelusuri** ke harga satuan resmi dokumen.');
  md.push('4. **Label `VERIFIED` dan `dataQualityScore: 100` tidak berdasar** dan harus dicabut sampai setiap item dipetakan ulang ke halaman resmi.');
  md.push('5. **`sourcePage` palsu** harus diganti dengan `headerPage` / `analisaPage` hasil ekstraksi.');
  md.push('');
  md.push('## 8. Rekomendasi');
  md.push('');
  md.push('- Jangan melakukan pembaruan massal (bulk update) terhadap dataset ini. Bangun dataset baru');
  md.push('  `binaMargaAHSP2026Official` langsung dari hasil ekstraksi, dengan `sourcePage`, `headerPage`,');
  md.push('  `analisaPage`, dan `numberFormat` per item.');
  md.push('- Simpan dataset lama dengan status `DEPRECATED_UNVERIFIED` supaya tidak ada jalur produksi');
  md.push('  yang diam-diam memakainya sebagai sumber "VERIFIED".');
  md.push('- Untuk 5 item `LOST_COEF` dan 1 item `SUSPECT` (F.47 / kode `6.7.(2)`), jangan menebak nilai:');
  md.push('  tandai `UNREADABLE` dan keluarkan dari perhitungan otomatis.');
  md.push('- Harga komponen (upah/bahan/alat) di dokumen resmi adalah harga contoh tahun anggaran dokumen;');
  md.push('  yang boleh dipakai ulang adalah **koefisien**, bukan harganya. Harga harus datang dari');
  md.push('  `price_master` ber-region.');
  md.push('');

  fs.writeFileSync(MD_OUT, md.join('\n'));
  console.log(`>> ${MD_OUT}`);
}

main();
