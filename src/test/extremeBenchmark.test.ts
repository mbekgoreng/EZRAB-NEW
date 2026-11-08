/**
 * EZRAB — EXTREME CONSTRUCTION INTELLIGENCE BENCHMARK (800 skenario)
 *
 * Dataset: src/test/extremeBenchmark.json (8 kategori × 100, digenerasi
 * dari probe perilaku nyata + oracle independen — lihat generator).
 * Semua kasus deterministik dijalankan lewat PIPELINE NYATA (parser,
 * tipologi, builder draft, resolver AHSP, mesin finansial, evaluator
 * DED, registry kalkulator, state percakapan actionRegistry).
 *
 * Putusan per kasus: PASS / FAIL / BLOCKED (kasus live yang bergantung
 * model — tanpa kunci di lingkungan ini, TIDAK dieksekusi dan BUKAN
 * PASS mock) / KNOWN-DEFECT (perilaku cacat yang terdokumentasi cocok
 * dengan catatan aktual; bila perilaku berubah ke ideal → PASS, bila
 * berubah ke arah lain → FAIL untuk ditinjau) / REFERENCE (kategori H:
 * bukti suite jalur hardening renderer, dirujuk bukan dieksekusi).
 *
 * Jalankan: npx --yes tsx src/test/extremeBenchmark.test.ts
 * Hasil JSON: $TMPDIR/extreme-benchmark-results.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const storage: Record<string, string> = {};
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};

import { understandProject } from '../ai-tools/ezrab-ai/buildingTypology';
import { buildUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import {
  toolCalculateQto, toolCalculateBuildingArea, toolSearchAhsp, toolSearchAvailableCalculators,
  toolGenerateWorkScope, toolValidatePriceProvenance,
} from '../ai-tools/ezrab-ai/constructionTools';
import { searchConstructionKnowledge } from '../ai-tools/ezrab-ai/constructionRetrieval';
import { CONSTRUCTION_KNOWLEDGE } from '../ai-tools/ezrab-ai/constructionKnowledge';
import { calculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';
import { computeQuantity, parseDimensionsString, shapeForUnit } from '../ai-tools/ded-ai-estimate/quantity';
import { evaluateQuantityReasonableness } from '../ai-tools/ded-ai-estimate/reasonableness';
import { isSaneEstimate, applyAiEstimatePrice } from '../ai-tools/ded-ai-estimate/pricing';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { PREMIUM_DEMO_PROJECT } from '../data/premiumDemoData';
import { EZRAB_AI_SYSTEM_PROMPT } from '../ai-tools/ezrab-ai/prompt';
import { executeIntent, continueRabNeeds, continueRabFinalize } from '../ai-tools/ezrab-ai/actionRegistry';

type Verdict = 'PASS' | 'FAIL' | 'BLOCKED' | 'KNOWN-DEFECT' | 'REFERENCE';
interface Row { id: string; category: string; severity: string; verdict: Verdict; detail: string }
const rows: Row[] = [];
const nearly = (a: number | null | undefined, b: number, tol = 0.6) => a != null && Math.abs(a - b) <= tol;

function matchUnderstand(text: string, exp: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const d: any = buildUniversalDraft(text);
  const u: any = understandProject(text);
  if (exp.kind !== undefined && d.kind !== exp.kind) problems.push(`kind=${d.kind}≠${exp.kind}`);
  if (exp.function !== undefined && u.functionId !== exp.function) problems.push(`function=${u.functionId}≠${exp.function}`);
  if (exp.footprint !== undefined && !nearly(u.footprint?.value, exp.footprint as number)) problems.push(`footprint=${u.footprint?.value}≠${exp.footprint}`);
  if (exp.land !== undefined) {
    if (exp.land === null) { if (u.landArea?.value !== null) problems.push(`land=${u.landArea?.value}≠null`); }
    else if (!nearly(u.landArea?.value, exp.land as number)) problems.push(`land=${u.landArea?.value}≠${exp.land}`);
  }
  if (exp.floors !== undefined && u.floors?.value !== exp.floors) problems.push(`floors=${u.floors?.value}≠${exp.floors}`);
  return problems;
}

function draftInvariant(text: string): string[] {
  const problems: string[] = [];
  const d: any = buildUniversalDraft(text);
  if (d.kind !== 'draft') return [`kind=${d.kind}≠draft`];
  for (const p of d.draft.parts) {
    for (const it of p.generation.items) {
      if (it.priceStatus !== 'PRICE_UNRESOLVED' && (it.unitPrice == null || it.unitPrice <= 0)) problems.push(`item berharga-sah tak valid: ${it.description ?? it.id} up=${it.unitPrice}`);
      if (/99\.99|88\.88/.test(String(it.code ?? ''))) problems.push(`kode palsu muncul: ${it.code}`);
      if (typeof it.amount === 'number' && typeof it.volume === 'number' && typeof it.unitPrice === 'number') {
        if (Math.abs(it.amount - Math.round(it.volume * it.unitPrice)) > Math.max(1, it.volume)) problems.push(`amount tak konsisten: ${it.amount} vs vol×up=${it.volume * it.unitPrice}`);
      }
    }
  }
  return problems;
}

const ctx = (rawText: string) => ({
  navigate: () => undefined, rawText, currentMenu: 'ezrab-ai', activeProject: null, projects: [], projectTotal: null,
} as any);
const firstLine = (r: any) => String(r?.message ?? '').split('\n')[0];

function runCase(c: any): { verdict: Verdict; detail: string } {
  switch (c.type) {
    case 'blocked': return { verdict: 'BLOCKED', detail: c.reason };
    case 'ref': return { verdict: 'REFERENCE', detail: `${c.refSuite} — ${c.note}` };
    case 'understand': {
      if (c.knownDefect) {
        const idealProblems = matchUnderstand(c.text, c.ideal);
        if (idealProblems.length === 0) return { verdict: 'PASS', detail: 'cacat terdokumentasi telah terperbaiki (aktual == ideal)' };
        const actualProblems = matchUnderstand(c.text, c.actual);
        if (actualProblems.length === 0) return { verdict: 'KNOWN-DEFECT', detail: c.knownDefect };
        return { verdict: 'FAIL', detail: `menyimpang dari ideal maupun aktual tercatat: ${actualProblems.join('; ')}` };
      }
      const problems = matchUnderstand(c.text, c.expect);
      return { verdict: problems.length ? 'FAIL' : 'PASS', detail: problems.join('; ') };
    }
    case 'qto': {
      try {
        const r = toolCalculateQto({ calculatorId: c.calcId, inputs: c.inputs, ...(c.expectedUnit ? { expectedUnit: c.expectedUnit } : {}) });
        if (c.expectThrow) return { verdict: 'FAIL', detail: 'seharusnya melempar, malah mengembalikan hasil' };
        const ok = Math.abs(r.primaryQuantity - c.oracle) < 0.005;
        return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `qty=${r.primaryQuantity}≠oracle ${c.oracle}` };
      } catch (e: any) {
        return { verdict: c.expectThrow ? 'PASS' : 'FAIL', detail: c.expectThrow ? '' : `lempar tak terduga: ${e.message}` };
      }
    }
    case 'qto-prov': {
      const r = toolCalculateQto({ calculatorId: c.calcId, inputs: c.inputs });
      const ok = r.provenance.length > 0 && !!r.calculatorVersion;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : 'provenance/versi kosong' };
    }
    case 'area': {
      try {
        const r = toolCalculateBuildingArea({ widthM: c.widthM, lengthM: c.lengthM, floors: c.floors });
        if (c.throws) return { verdict: 'FAIL', detail: 'seharusnya melempar' };
        const ok = r.footprintM2 === c.footprint && r.totalFloorAreaM2 === c.total;
        return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `fp=${r.footprintM2} total=${r.totalFloorAreaM2}` };
      } catch {
        return { verdict: c.throws ? 'PASS' : 'FAIL', detail: c.throws ? '' : 'lempar tak terduga' };
      }
    }
    case 'qty': {
      const r = computeQuantity(c.shape, c.inputs, 'benchmark');
      const ok = c.expected === null ? r.quantity === null : (r.quantity != null && Math.abs(r.quantity - c.expected) < 1e-9);
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `qty=${r.quantity}≠${c.expected}` };
    }
    case 'parse': {
      const got = parseDimensionsString(c.input ?? undefined);
      const ok = JSON.stringify(got) === JSON.stringify(c.expected);
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `${JSON.stringify(got)}≠${JSON.stringify(c.expected)}` };
    }
    case 'shape': {
      const got = shapeForUnit(c.unit);
      return { verdict: got === c.expected ? 'PASS' : 'FAIL', detail: got === c.expected ? '' : `${got}≠${c.expected}` };
    }
    case 'ahsp': {
      const r: any = toolSearchAhsp({ query: c.query });
      if (c.knownDefect) {
        if (r.outcome === c.idealOutcome) return { verdict: 'PASS', detail: 'cacat terdokumentasi telah terperbaiki' };
        if (r.outcome === c.actualOutcome) return { verdict: 'KNOWN-DEFECT', detail: c.knownDefect };
        return { verdict: 'FAIL', detail: `outcome=${r.outcome}` };
      }
      return { verdict: r.outcome === c.outcome ? 'PASS' : 'FAIL', detail: r.outcome === c.outcome ? '' : `outcome=${r.outcome}≠${c.outcome}` };
    }
    case 'ahsp-throw': {
      try { toolSearchAhsp({ query: '' }); return { verdict: 'FAIL', detail: 'query kosong tidak ditolak' }; }
      catch { return { verdict: 'PASS', detail: '' }; }
    }
    case 'prov': {
      const r = toolValidatePriceProvenance({ item: c.item });
      return { verdict: r.label === c.label ? 'PASS' : 'FAIL', detail: r.label === c.label ? '' : `label=${r.label}≠${c.label}` };
    }
    case 'wbs': {
      const r = toolGenerateWorkScope({ knowledgeId: c.knowledgeId });
      if (c.expectCount === null) return { verdict: r === null ? 'PASS' : 'FAIL', detail: r === null ? '' : 'id tak dikenal tidak null' };
      const ok = !!r && r.scope.length === c.expectCount && r.label.toLowerCase().includes(c.labelIncludes);
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `n=${r?.scope.length} label=${r?.label}` };
    }
    case 'calc-count': {
      const n = toolSearchAvailableCalculators({}).length;
      return { verdict: n === c.expected ? 'PASS' : 'FAIL', detail: n === c.expected ? '' : `n=${n}≠${c.expected}` };
    }
    case 'calc-filter': {
      const all = toolSearchAvailableCalculators({ keyword: c.keyword });
      if (c.mode === 'empty') return { verdict: all.length === 0 ? 'PASS' : 'FAIL', detail: `n=${all.length}` };
      const ok = all.length > 0 && all.every((x) => `${x.id} ${x.name} ${x.category}`.toLowerCase().includes(c.keyword));
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : 'hasil filter tak relevan' };
    }
    case 'retrieval': {
      const hits = searchConstructionKnowledge(c.query, { maxResults: 3 });
      const top1 = (hits[0] as any)?.record?.id ?? null;
      if (c.knownDefect) {
        if (top1 === c.ideal) return { verdict: 'PASS', detail: 'miss terdokumentasi telah terperbaiki' };
        if (top1 === c.actualTop1) return { verdict: 'KNOWN-DEFECT', detail: c.knownDefect };
        return { verdict: 'FAIL', detail: `top1=${top1}` };
      }
      return { verdict: top1 === c.top1 ? 'PASS' : 'FAIL', detail: top1 === c.top1 ? '' : `top1=${top1}≠${c.top1}` };
    }
    case 'kb-invariant': {
      if (c.check === 'count') return { verdict: CONSTRUCTION_KNOWLEDGE.length === c.expected ? 'PASS' : 'FAIL', detail: `n=${CONSTRUCTION_KNOWLEDGE.length}` };
      if (c.check === 'provenance-unverified') {
        const ok = (CONSTRUCTION_KNOWLEDGE as any[]).every((r) => r.provenance?.verificationStatus === 'unverified');
        return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : 'ada record tanpa status unverified' };
      }
      if (c.check === 'refs-valid') {
        const valid = new Set(calculatorRegistry.list().map((x) => x.id));
        const bad: string[] = [];
        for (const r of CONSTRUCTION_KNOWLEDGE as any[]) for (const id of r.availableCalculators ?? []) if (!valid.has(id)) bad.push(`${r.id}:${id}`);
        return { verdict: bad.length === 0 ? 'PASS' : 'FAIL', detail: bad.join(',') };
      }
      const dist: Record<string, number> = {};
      for (const r of CONSTRUCTION_KNOWLEDGE as any[]) dist[r.supportStatus] = (dist[r.supportStatus] ?? 0) + 1;
      const ok = JSON.stringify(dist) === JSON.stringify(c.expected);
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : JSON.stringify(dist) };
    }
    case 'determinism': {
      if (c.kind === 'ahsp') {
        const a: any = toolSearchAhsp({ query: c.query }); const b: any = toolSearchAhsp({ query: c.query });
        return { verdict: a.outcome === b.outcome && a.items.length === b.items.length ? 'PASS' : 'FAIL', detail: 'hasil tak deterministik' };
      }
      const h1 = searchConstructionKnowledge(c.query, { maxResults: 3 });
      const h2 = searchConstructionKnowledge(c.query, { maxResults: 3 });
      const ok = (h1[0] as any)?.record?.id === (h2[0] as any)?.record?.id;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: 'top1 tak deterministik' };
    }
    case 'ded-eval': {
      const r = evaluateQuantityReasonableness(c.item);
      const got = r ? `${r.outcome}/${r.reasonCode}` : null;
      return { verdict: got === c.outcome ? 'PASS' : 'FAIL', detail: got === c.outcome ? '' : `${got}≠${c.outcome}` };
    }
    case 'ded-price': {
      const v = c.value === 'NaN' ? NaN : c.value === 'Infinity' ? Infinity : c.value;
      const sane = isSaneEstimate(v);
      const applied = applyAiEstimatePrice(v);
      const ok = sane === c.sane && applied.priceSource === c.source && applied.unitPrice === c.unitPrice;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `sane=${sane} src=${applied.priceSource} up=${applied.unitPrice}` };
    }
    case 'ded-nomutate': {
      const before = JSON.stringify(c.item);
      evaluateQuantityReasonableness(c.item);
      return { verdict: JSON.stringify(c.item) === before ? 'PASS' : 'FAIL', detail: 'item termutasi evaluator' };
    }
    case 'fin': {
      const items = c.items.map((i: any) => ({ projectId: 'P', ...i }));
      const cs: any = UnifiedProjectEngine.recalculateCostSummary(items, c.summary ?? undefined);
      const o = c.oracle;
      const ok = cs.directCost === o.direct && cs.grandTotal === o.grand && cs.taxAmount === o.tax
        && (cs.pphAmount ?? 0) === o.pph && cs.overheadPercent === o.oh && cs.profitPercent === o.pf;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `direct=${cs.directCost}/${o.direct} grand=${cs.grandTotal}/${o.grand} tax=${cs.taxAmount}/${o.tax} pph=${cs.pphAmount}/${o.pph} oh=${cs.overheadPercent}/${o.oh} pf=${cs.profitPercent}/${o.pf}` };
    }
    case 'draft-fin': {
      const d: any = buildUniversalDraft(c.text);
      if (d.kind !== 'draft') return { verdict: 'FAIL', detail: `kind=${d.kind}` };
      const items = d.draft.parts.flatMap((p: any) => p.generation.items) as any[];
      const pricedSum = items.filter((i) => i.priceStatus !== 'PRICE_UNRESOLVED').reduce((s, i) => s + (i.amount ?? 0), 0);
      const cs: any = UnifiedProjectEngine.recalculateCostSummary(items, undefined);
      const ok = cs.directCost === pricedSum && cs.overheadPercent === 0 && cs.profitPercent === 0;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `direct=${cs.directCost} vs pricedSum=${pricedSum}` };
    }
    case 'premium-check': {
      const ok = (PREMIUM_DEMO_PROJECT as any).costSummary.grandTotal === 1089879733;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `grand=${(PREMIUM_DEMO_PROJECT as any).costSummary.grandTotal}` };
    }
    case 'prompt': {
      const missing = c.includes.filter((s: string) => !EZRAB_AI_SYSTEM_PROMPT.includes(s));
      return { verdict: missing.length === 0 ? 'PASS' : 'FAIL', detail: missing.length ? `hilang: ${missing.join(' | ')}` : '' };
    }
    case 'draft-invariant': {
      const problems = draftInvariant(c.text);
      return { verdict: problems.length ? 'FAIL' : 'PASS', detail: problems.join('; ') };
    }
    case 'conv-correction': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      const r = continueRabNeeds(c.say);
      const ok = !!r && firstLine(r).includes(c.want);
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `first="${firstLine(r)}"` };
    }
    case 'conv-chain': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      for (const s of c.steps) {
        const r = continueRabNeeds(s.say);
        if (!r || !firstLine(r).includes(s.want)) return { verdict: 'FAIL', detail: `langkah "${s.say}": first="${firstLine(r)}"` };
      }
      return { verdict: 'PASS', detail: '' };
    }
    case 'conv-finalize': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      for (const s of c.steps ?? []) {
        const r = continueRabNeeds(s.say);
        if (!r || !firstLine(r).includes(s.want)) return { verdict: 'FAIL', detail: `langkah "${s.say}": first="${firstLine(r)}"` };
      }
      const fin: any = continueRabFinalize(c.finalizeSay);
      if (!fin) return { verdict: 'FAIL', detail: 'finalisasi null' };
      const missing = c.mustInclude.filter((s: string) => !String(fin.message).includes(s));
      const leaked = c.mustExclude.filter((s: string) => String(fin.message).includes(s));
      const ok = missing.length === 0 && leaked.length === 0;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: [...missing.map((s: string) => `tak ada "${s}"`), ...leaked.map((s: string) => `bocor "${s}"`)].join('; ') };
    }
    case 'conv-nochange-finalize': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      continueRabNeeds(c.say);
      const fin: any = continueRabFinalize('itu aja');
      const ok = !!fin && c.mustInclude.every((s: string) => String(fin.message).includes(s));
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : 'fakta berubah oleh pesan tanpa data' };
    }
    case 'conv-nochange-ack': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      const r = continueRabNeeds(c.say);
      const ok = !!r && firstLine(r).includes(c.wantFirst);
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `first="${firstLine(r)}"` };
    }
    case 'conv-finalize-null': {
      // Isolasi urutan: sesi RUMAH lengkap lebih dulu (menyetel state),
      // lalu sesi target menggantikannya — finalisasi harus null karena
      // sesi aktif bukan rumah. Tanpa sesi rumah pendahulu, state global
      // antar-kasus dapat mencemari hasil (runner mengeksekusi semua
      // kasus dalam satu proses, sama seperti skenario nyata berganti
      // topik di satu tab).
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx('buatkan rab rumah 2 lantai 8x12 3 kamar tidur 2 kamar mandi'));
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      const fin = continueRabFinalize(c.finalizeSay);
      return { verdict: fin === null ? 'PASS' : 'FAIL', detail: fin === null ? '' : 'finalisasi rumah diterapkan ke sesi non-rumah' };
    }
    case 'conv-finalize-blocked': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      const fin: any = continueRabFinalize(c.finalizeSay);
      if (!fin) return { verdict: 'FAIL', detail: 'finalisasi null (diharapkan pesan penolakan jujur)' };
      const missing = c.mustInclude.filter((s: string) => !String(fin.message).includes(s));
      return { verdict: missing.length === 0 ? 'PASS' : 'FAIL', detail: missing.length ? `tak ada "${missing.join('", "')}"` : '' };
    }
    case 'conv-isolation': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base1));
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base2));
      const fin: any = continueRabFinalize(c.finalizeSay);
      if (!fin) return { verdict: 'FAIL', detail: 'finalisasi null' };
      const missing = c.mustInclude.filter((s: string) => !String(fin.message).includes(s));
      const leaked = c.mustExclude.filter((s: string) => String(fin.message).includes(s));
      const ok = missing.length === 0 && leaked.length === 0;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: [...missing.map((s: string) => `tak ada "${s}"`), ...leaked.map((s: string) => `bocor "${s}"`)].join('; ') };
    }
    case 'conv-blocked': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      const fin: any = continueRabFinalize(c.finalizeSay);
      const ok = !!fin && fin.awaitRabNeeds === true;
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `await=${fin?.awaitRabNeeds}` };
    }
    case 'conv-draft-first': {
      const r: any = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.text));
      const ok = !!r && c.mustInclude.every((s: string) => String(r.message).includes(s));
      return { verdict: ok ? 'PASS' : 'FAIL', detail: ok ? '' : `msg="${String(r?.message).slice(0, 80)}"` };
    }
    case 'conv-known-defect': {
      executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(c.base));
      const r = continueRabNeeds(c.say);
      const fl = firstLine(r);
      if (fl.includes(c.idealFirst)) return { verdict: 'PASS', detail: 'cacat terdokumentasi telah terperbaiki' };
      if (fl.includes(c.actualFirst)) return { verdict: 'KNOWN-DEFECT', detail: c.knownDefect };
      return { verdict: 'FAIL', detail: `first="${fl}"` };
    }
    default:
      return { verdict: 'FAIL', detail: `tipe tak dikenal: ${c.type}` };
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(join(here, 'extremeBenchmark.json'), 'utf8')) as { cases: any[] };
for (const c of dataset.cases) {
  try {
    const { verdict, detail } = runCase(c);
    rows.push({ id: c.id, category: c.category, severity: c.severity, verdict, detail });
  } catch (e: any) {
    rows.push({ id: c.id, category: c.category, severity: c.severity, verdict: 'FAIL', detail: `exception: ${e.message}` });
  }
}

const byCat: Record<string, Record<Verdict, number>> = {};
for (const r of rows) {
  byCat[r.category] = byCat[r.category] ?? { PASS: 0, FAIL: 0, BLOCKED: 0, 'KNOWN-DEFECT': 0, REFERENCE: 0 };
  byCat[r.category][r.verdict]++;
}
for (const r of rows) {
  if (r.verdict === 'FAIL' || r.verdict === 'KNOWN-DEFECT') console.log(`  ${r.verdict} ${r.id} [${r.severity}] — ${r.detail}`);
}
console.log('\nPer kategori:', JSON.stringify(byCat, null, 1));
const totals: Record<Verdict, number> = { PASS: 0, FAIL: 0, BLOCKED: 0, 'KNOWN-DEFECT': 0, REFERENCE: 0 };
for (const r of rows) totals[r.verdict]++;
console.log(`EXTREME BENCHMARK: ${rows.length} kasus — PASS ${totals.PASS}, FAIL ${totals.FAIL}, BLOCKED ${totals.BLOCKED}, KNOWN-DEFECT ${totals['KNOWN-DEFECT']}, REFERENCE ${totals.REFERENCE}`);
writeFileSync(join(process.env.TMPDIR ?? '/tmp', 'extreme-benchmark-results.json'), JSON.stringify({ totals, byCat, rows }, null, 1));
process.exit(totals.FAIL > 0 ? 1 : 0);
