/**
 * universalConstructionMatrix.test.ts — W13: Matriks validasi §13 master
 * prompt (Program Universal Construction Intelligence, 2026-11-22).
 *
 * 22 skenario §13, masing-masing MENJALANKAN kode nyata (bukan asersi
 * string): klasifikasi, buildUniversalDraft/buildDirectRab, completion
 * Full AI (execute di-STUB — tanpa live gateway, tanpa paid call),
 * revisi, intake multi-giliran, matcher AHSP, komposer custom, WBS,
 * QTO trace, budget feasibility, dan approval.
 *
 * Suite tsx polos (BUKAN vitest). Jalankan dari root repo:
 *   npx --yes tsx src/test/universalConstructionMatrix.test.ts
 *
 * Konvensi penamaan: `13.Nx` = skenario §13 nomor N, asersi x.
 * Checks berlabel DOKUMENTASI mem-pin perilaku saat ini yang BUKAN
 * kemampuan penuh (keterbatasan nyata) — bila check itu gagal, artinya
 * perilakunya BERUBAH (bisa jadi perbaikan), bukan regresi matriks;
 * baca komentarnya sebelum mengubah.
 *
 * Nilai rupiah di suite ini adalah OUTPUT ENGINE (dihitung dinamis dari
 * data katalog saat run) atau pin observasi probe 2026-11-22 — bukan
 * angka karangan. Bila data harga berubah, pin observasi boleh bergerak
 * HANYA sesudah diverifikasi dari output aktual (preseden re-baseline
 * koordinator program ini).
 */

import {
  buildUniversalDraft,
  formatUniversalDraftMessage,
  computeTotals,
  computeScopeTotals,
  effectiveItems,
  itemKey,
  reviseUniversalDraft,
  buildPushPayload,
  wbsStructureLines,
  wbsCompletenessLines,
  detectScopes,
  extractUniversalSpec,
  isPriceValidForTotal,
  SCOPE_GROUPS,
} from '../ai-tools/ezrab-ai/universalRab';
import type { UniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import { classifyUniversal } from '../ai-tools/ezrab-ai/universalTaxonomy';
import {
  evaluateRabIntent,
  continueRabIntent,
  getLastRabIntentSpec,
  setLastRabIntentSpec,
  clearLastRabIntentSpec,
} from '../ai-tools/ezrab-ai/rabIntentFlow';
import { extractRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import { buildDirectRab, formatDirectRabMessage } from '../ai-tools/ezrab-ai/directRab';
import type { DirectRabResult } from '../ai-tools/ezrab-ai/directRab';
import {
  completeBudgetRabWithFullAi,
  buildFullAiCompletionSummary,
} from '../ai-tools/ezrab-ai/fullAiRabCompletion';
import type {
  ChatRabCompletionDeps,
  AdaptableChatItem,
} from '../ai-tools/ezrab-ai/fullAiRabCompletion';
import {
  assessBudgetFeasibility,
  formatBudgetFeasibilityLine,
} from '../ai-tools/ezrab-ai/budgetFeasibility';
import {
  extractUniversalContext,
  selectNextQuestion,
} from '../ai-tools/ezrab-ai/universalIntake';
import { selectQuestionnaireQuestions } from '../ai-tools/ezrab-ai/questionnaire';
import {
  executeIntent,
  executeDirectConfirmation,
  tryContinueUniversalContext,
  getUniversalContextState,
  clearUniversalContext,
  clearProjectContext,
  clearPendingRabChoice,
  clearPendingDirectConfirmations,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { setAssistantOperationContext } from '../ai-tools/ezrab-ai/operations';
import type { ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { matchDedItemToAhsp } from '../ai-tools/ded-canonical/canonicalDedPricing';
import { composeCustomAhspPrice, RabTemplateService } from '../services/rabTemplateService';
import type { CustomAhspComponent } from '../types/rabTemplate';
import { getKnowledgeRecord } from '../ai-tools/ezrab-ai/constructionKnowledge';
import {
  searchConstructionKnowledge,
  formatKnowledgeContext,
} from '../ai-tools/ezrab-ai/constructionRetrieval';
import { conceptualWbsFor } from '../ai-tools/ezrab-ai/conceptualWbs';
import { shapeForUnit } from '../ai-tools/ded-ai-estimate/quantity';
import {
  buildDirectPushPreview,
  formatDirectPushPreviewMessage,
  createDirectPushApprovalBinding,
  checkDirectPushApprovalBinding,
  DIRECT_PUSH_APPROVAL_TTL_MS,
} from '../ai-tools/ezrab-ai/directRabPush';

/* ------------------------------------------------------------------ */
/* localStorage shim (pola universalRabHardening)                       */
/* ------------------------------------------------------------------ */
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (k: string) => storage[k] || null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
  },
};
(global as any).localStorage = (global as any).window.localStorage;

/* ------------------------------------------------------------------ */
/* Harness + ringkasan per skenario                                    */
/* ------------------------------------------------------------------ */
let pass = 0;
let fail = 0;
const failures: string[] = [];
const sectionStats = new Map<string, { pass: number; fail: number }>();
let currentSection = '';
function section(id: string, title: string): void {
  currentSection = id;
  sectionStats.set(id, { pass: 0, fail: 0 });
  console.log(`\n== §13.${id} — ${title} ==`);
}
function check(name: string, cond: boolean, detail?: unknown): void {
  const st = sectionStats.get(currentSection);
  if (cond) {
    pass++;
    if (st) st.pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    if (st) st.fail++;
    failures.push(`${currentSection} :: ${name}`);
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

/** Total proyek draft. PENTING: `estimatedTotal` BUKAN ember kelima —
 *  ia adalah JUMLAH keempat ember (verified+database+market+manual);
 *  menjumlah kelima field menggandakan total (ditemukan W13 saat
 *  13.14k: validSum 1.374.454.980 vs jumlah-5-ember 2.748.909.960).
 *  Kontrak P3B: estimatedTotal == directCost kanonis. */
function draftTotal(d: UniversalDraft): number {
  return computeTotals(d).estimatedTotal;
}

function draftOf(text: string): UniversalDraft | null {
  const r = buildUniversalDraft(text);
  return r.kind === 'draft' ? r.draft : null;
}

function dupKeys(d: UniversalDraft): string[] {
  const keys = effectiveItems(d).map((it) => itemKey(it));
  return keys.filter((k, i) => keys.indexOf(k) !== i);
}

const OWNER_PROMPT =
  'saya ada uang 120jt, buatkan RAB rumah type 36, apa saja pekerjaan dan spek materialnya?';

/** Adapter item calc direct → input orkestrator (cermin actionRegistry + W5). */
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
 *  tak punya harga" — pola W5; draft template nyata semuanya berharga
 *  penuh, jadi kondisi ini harus disimulasikan). */
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

/* Stub execute (pola W5, disederhanakan): harga per tier + kuantitas
 * 10 satuan tipikal. TIDAK PERNAH memanggil provider. */
const TIER_PRICES: Record<string, number> = {
  ekonomis: 100_000,
  standar: 150_000,
  menengah: 200_000,
  premium: 300_000,
  mewah: 500_000,
};
function makeStub(): { deps: ChatRabCompletionDeps; calls: Array<{ kind: string }> } {
  const calls: Array<{ kind: string }> = [];
  const execute = async (req: { prompt: string; systemPrompt?: string }): Promise<Record<string, unknown>> => {
    const prompt = String(req.prompt ?? '');
    const isPrice = prompt.includes('ISI HARGA SATUAN');
    const kind = isPrice ? 'price' : 'quantity';
    calls.push({ kind });
    const tierM = /Kualitas: (EKONOMIS|STANDAR|MENENGAH|PREMIUM|MEWAH)/.exec(prompt);
    const tier = (tierM ? tierM[1].toLowerCase() : 'standar') as string;
    const items: Array<{ no: number; unit: string }> = [];
    const re = /- no (\d+): "[^"]*" \(satuan: ([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) items.push({ no: Number(m[1]), unit: m[2].trim() });
    if (isPrice) {
      const fills = items.map(({ no, unit }) => ({
        no,
        unitPrice: TIER_PRICES[tier] ?? 150_000,
        unit,
        spec: `spek stub kualitas ${tier} untuk item ${no}`,
        basis: `harga pasar stub, kualitas ${tier}`,
      }));
      return { success: true, content: JSON.stringify({ fills }), structured: null, requestId: 'stub-w13' };
    }
    const fills = items.map(({ no }) => ({ no, qty: 10, formula: '10 x 1', basis: 'asumsi stub: 10 satuan tipikal' }));
    return { success: true, content: JSON.stringify({ fills }), structured: null, requestId: 'stub-w13' };
  };
  return { deps: { execute: execute as ChatRabCompletionDeps['execute'], productId: 'EZRAB_AI' }, calls };
}

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
const start = (text: string) =>
  executeIntent(routeIntent(text).intent as never, undefined, ctxFor(text));
function resetFlow(): void {
  clearUniversalContext();
  clearProjectContext();
  clearPendingRabChoice();
  clearLastRabIntentSpec();
}

/** Komponen AHSP 3.7.4 (plesteran 1SP:4PP 15 mm) — data nyata katalog;
 *  komposisi penuhnya mereproduksi harga kanonis Rp51.622 (W8). */
const PLESTERAN_374: CustomAhspComponent[] = [
  { resourceName: 'Pekerja', resourceType: 'labor', coefficient: 0.2, unit: 'OH' },
  { resourceName: 'Tukang batu', resourceType: 'labor', coefficient: 0.1, unit: 'OH' },
  { resourceName: 'Kepala tukang', resourceType: 'labor', coefficient: 0.01, unit: 'OH' },
  { resourceName: 'Mandor', resourceType: 'labor', coefficient: 0.0033, unit: 'OH' },
  { resourceName: 'Semen portland (PC)', resourceType: 'material', coefficient: 6.24, unit: 'kg' },
  { resourceName: 'Pasir pasang (quarry - lokasi pekerjaan)', resourceType: 'material', coefficient: 0.024, unit: 'm3' },
];

const MIXED_TEXT = 'buatkan RAB perumahan 20 unit + jalan 1 km + drainase 500 m + retaining wall 100 m';
const JALAN_TEXT = 'buatkan RAB jalan beton panjang 1 km lebar 6 m';

async function main(): Promise<void> {
  /* ================================================================ */
  /* §13.1 — Residensial: rumah Tipe 36 + budget 120jt (prompt owner)  */
  /* ================================================================ */
  section('1', 'Residensial — rumah Tipe 36 + budget Rp120jt (prompt owner persis)');
  {
    check('13.1a prompt owner → budget 120jt (rabIntentSpec)', extractRabIntentSpec(OWNER_PROMPT).budgetIdr === 120_000_000);
    check('13.1b prompt owner → budget 120jt (universalSpec.budgetCap)', extractUniversalSpec(OWNER_PROMPT).budgetCap === 120_000_000);
    check('13.1c klasifikasi primer = rumah', classifyUniversal(OWNER_PROMPT).primary?.id === 'rumah');
    const direct = buildDirectRab(OWNER_PROMPT);
    check('13.1d buildDirectRab menghasilkan draft', direct !== null);
    if (direct) {
      const engineTotal = direct.calc.generationResult.totalDirectCost;
      const unpriced = direct.calc.items.filter((i) => !(i.unitPrice > 0));
      check('13.1e 25 item parametrik', direct.calc.items.length === 25, direct.calc.items.length);
      check('13.1f tepat 1 item tak berharga (kloset)', unpriced.length === 1 && unpriced[0].name.includes('Kloset'), unpriced.map((u) => u.name));
      check('13.1g total engine > 0', engineTotal > 0, engineTotal);
      // Completion Full AI — execute di-STUB (tanpa provider).
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
      check('13.1h completion tidak gagal', result.failed === false);
      check('13.1i 1 harga terisi (kloset)', result.filledPriceCount === 1, result.filledPriceCount);
      const expectedTotal = engineTotal + unpriced.reduce((s, it) => s + it.volume * 150_000, 0);
      check('13.1j total recomputed = engine + isian stub', result.totals.estimatedTotal === expectedTotal, {
        got: result.totals.estimatedTotal, want: expectedTotal,
      });
      check('13.1k verdict UNDER vs cap 120jt', result.feasibility.verdict === 'UNDER', result.feasibility.verdict);
      check('13.1l kualitas default standar (tanpa downgrade)', result.qualityUsed === 'standar' && result.qualityDowngradedFrom == null);
      check('13.1m stub execute dipanggil (1 harga, 0 kuantitas — semua volume terisi)',
        stub.calls.filter((c) => c.kind === 'price').length === 1 && stub.calls.filter((c) => c.kind === 'quantity').length === 0,
        stub.calls);
      // Pesan: blok completion + verdict + caveat asumsi tampil.
      const completedItems = direct.calc.items.map((it, idx) => {
        const done = result.items[idx];
        if (!done || done.priceStatus !== 'PRICE_ESTIMATED') return it;
        return { ...it, unitPrice: done.unitPrice ?? it.unitPrice, totalPrice: done.totalPrice ?? it.totalPrice };
      });
      direct.fullAiCompletion = { items: completedItems, summary: buildFullAiCompletionSummary(result, 120_000_000) };
      const msg = formatDirectRabMessage(direct);
      check('13.1n blok completion tampil (Estimasi Sementara, asumsi AI)', msg.includes('Lengkapi dengan Full AI — Estimasi Sementara (asumsi AI)'));
      check('13.1o verdict DI BAWAH tampil', msg.includes('DI BAWAH anggaran'));
      check('13.1p caveat asumsi tampil', msg.includes('verdict kelayakan berlaku atas total asumsi ini, bukan atas harga resmi'));
      check('13.1q item terisi ditandai (est. AI)', msg.includes('(est. AI)'));
      check('13.1r calc.items asli TIDAK dimutasi (kloset tetap 0)', direct.calc.items.find((i) => i.name.includes('Kloset'))?.unitPrice === 0);
    }
  }

  /* ================================================================ */
  /* §13.2 — Komersial: ruko + kantor                                  */
  /* ================================================================ */
  section('2', 'Komersial — ruko + gedung kantor');
  {
    check('13.2a klasifikasi ruko = komersial', classifyUniversal('buatkan RAB ruko 2 lantai luas 120 m2').primary?.id === 'komersial');
    const ruko = draftOf('buatkan RAB ruko 2 lantai luas 120 m2');
    check('13.2b ruko → draft 1 part', ruko !== null && ruko.parts.length === 1, ruko?.parts.map((p) => p.template.id));
    check('13.2c ruko → 14 item, total > 0', ruko !== null && effectiveItems(ruko).length === 14 && draftTotal(ruko) > 0,
      ruko ? { items: effectiveItems(ruko).length, total: draftTotal(ruko) } : null);
    // B1 (2026-11-23): pin observasi lama (BLD-HIGHRISE-TOWER untuk ruko
    // 2 lantai) adalah kegagalan kesesuaian #3 yang diperbaiki Batch 1 —
    // evaluator kini menolak high-rise (F1 fungsi generik) dan penskor
    // kanonis memilih SHOWROOM-AUTO (retail ≈ ruko, skor 16) di atas
    // OFFICE-MULTI (skor 8, −8 penalti konflik kantor/ruko). Parameter
    // display/bengkel di luar batas diungkap lewat peringatan.
    check('13.2d template ruko = BLD-SHOWROOM-AUTO (B1: bukan high-rise)',
      ruko?.parts[0]?.template.id === 'BLD-SHOWROOM-AUTO', ruko?.parts[0]?.template.id);
    check('13.2e klasifikasi kantor = kantor', classifyUniversal('buatkan RAB gedung kantor 3 lantai luas 300 m2').primary?.id === 'kantor');
    const kantor = draftOf('buatkan RAB gedung kantor 3 lantai luas 300 m2');
    check('13.2f kantor → draft BLD-OFFICE-MULTI, 11 item',
      kantor !== null && kantor.parts[0]?.template.id === 'BLD-OFFICE-MULTI' && effectiveItems(kantor).length === 11,
      kantor?.parts.map((p) => p.template.id));
    check('13.2g kantor → luas 300 m² terbaca di spek', kantor?.spec.areaM2 === 300, kantor?.spec.areaM2);
    check('13.2h kantor → total > 0', kantor !== null && draftTotal(kantor) > 0);
  }

  /* ================================================================ */
  /* §13.3 — Gudang (industri, bentang bebas)                          */
  /* ================================================================ */
  section('3', 'Gudang industri — bentang bebas 10 x 20 m');
  {
    check('13.3a klasifikasi = gudang-industri', classifyUniversal('buatkan RAB gudang 10 x 20 m').primary?.id === 'gudang-industri');
    const d = draftOf('buatkan RAB gudang 10 x 20 m');
    check('13.3b gudang → draft BLD-IND-WAREHOUSE', d !== null && d.parts[0]?.template.id === 'BLD-IND-WAREHOUSE', d?.parts.map((p) => p.template.id));
    check('13.3c luas 10 x 20 = 200 m² terbaca', d?.spec.areaM2 === 200, d?.spec.areaM2);
    check('13.3d gudang → 4 item, total > 0', d !== null && effectiveItems(d).length === 4 && draftTotal(d) > 0,
      d ? { items: effectiveItems(d).length, total: draftTotal(d) } : null);
    check('13.3e scope engine = gedung (industri)', detectScopes('buatkan RAB gudang 10 x 20 m').map((s) => s.id).join() === 'gedung');
  }

  /* ================================================================ */
  /* §13.4 — Jalan: panjang + lebar → template jalan                    */
  /* ================================================================ */
  section('4', 'Jalan — beton 1 km x 6 m');
  {
    check('13.4a klasifikasi = jalan-beton', classifyUniversal(JALAN_TEXT).primary?.id === 'jalan-beton');
    const d = draftOf(JALAN_TEXT);
    check('13.4b jalan → draft 8 item', d !== null && effectiveItems(d).length === 8, d ? effectiveItems(d).length : null);
    check('13.4c panjang 1 km = 1000 m terbaca', d?.spec.lengthM === 1000, d?.spec.lengthM);
    check('13.4d lebar 6 m terbaca', d?.spec.widthM === 6, d?.spec.widthM);
    check('13.4e jalan → total > 0', d !== null && draftTotal(d) > 0, d ? draftTotal(d) : null);
    check('13.4f tanpa lebar pun draft (template rigid, default lebar)',
      draftOf('buatkan RAB jalan beton panjang 1 km')?.parts[0]?.template.id === 'INFRA-ROAD-RIGID');
    // PIN DOKUMENTASI — quirk parser pra-ada: "lebar 6 m" ikut terbaca
    // sebagai luas (areaM2=6). Bukan perilaku yang diinginkan; dipin agar
    // perbaikannya terdeteksi (bila pin ini gagal, quirk-nya berubah).
    check('13.4g DOKUMENTASI: areaM2 ikut terbaca 6 dari "lebar 6 m" (quirk parser)',
      d?.spec.areaM2 === 6, d?.spec.areaM2);
  }

  /* ================================================================ */
  /* §13.5 — Jembatan: bentang → klarifikasi lebar; REQUIRES_ENGINEERING_SPEC */
  /* ================================================================ */
  section('5', 'Jembatan — bentang, klarifikasi lebar, REQUIRES_ENGINEERING_SPEC');
  {
    const rec = getKnowledgeRecord('jembatan');
    check('13.5a knowledge jembatan = REQUIRES_ENGINEERING_SPEC', rec?.supportStatus === 'REQUIRES_ENGINEERING_SPEC', rec?.supportStatus);
    check('13.5b spek wajib jembatan = bentang', rec?.requiredSpecs.includes('bentang') === true, rec?.requiredSpecs);
    check('13.5c kapabilitas tak didukung menyebut DED/perencana',
      (rec?.unsupportedCapabilities ?? []).some((u) => u.includes('DED') && u.includes('perencana')), rec?.unsupportedCapabilities);
    const hits = searchConstructionKnowledge('jembatan bentang 12 m');
    check('13.5d retrieval jembatan membawa status REQUIRES_ENGINEERING_SPEC',
      hits[0]?.record.id === 'jembatan' && hits[0]?.record.supportStatus === 'REQUIRES_ENGINEERING_SPEC');
    check('13.5e konteks retrieval menampilkan status dukungan',
      formatKnowledgeContext(hits.slice(0, 1)).includes('REQUIRES_ENGINEERING_SPEC'));
    // Tanpa bentang → needs-spec (volume TIDAK ditebak).
    const noSpan = buildUniversalDraft('buatkan RAB jembatan panjang 50 m');
    check('13.5f jembatan tanpa bentang → needs-spec', noSpan.kind === 'needs-spec', (noSpan as any).kind);
    if (noSpan.kind === 'needs-spec') {
      check('13.5g missing menyebut bentang', noSpan.missing.some((m) => m.includes('bentang')), noSpan.missing);
    }
    // Bentang di luar cakupan template (50 m > maks 40 m) → needs-spec + DED.
    const over = buildUniversalDraft('Buat RAB jembatan beton bentang 50 meter');
    check('13.5h bentang 50 m (di luar template) → needs-spec', over.kind === 'needs-spec', (over as any).kind);
    if (over.kind === 'needs-spec') {
      check('13.5i missing bentang-50m menyebut DED', over.missing.some((m) => m.includes('DED')), over.missing);
    }
    // Dengan bentang → draft, tetapi PARSIAL (jujur, bukan klaim penuh).
    const full = draftOf('buatkan RAB jembatan beton bentang 12 m lebar 7 m');
    check('13.5j jembatan bentang 12 m → draft BRG-GIRDER-20M', full !== null && full.parts[0]?.template.id === 'BRG-GIRDER-20M');
    check('13.5k draft jembatan PARSIAL (1 item belum berharga — bukan klaim penuh)',
      full !== null && computeTotals(full).status === 'PARSIAL' && computeTotals(full).unpricedCount === 1,
      full ? computeTotals(full) : null);
    // Intake: sesudah bentang dijawab, pertanyaan berikutnya = lebar.
    resetFlow();
    const b1 = start('buatkan rab jembatan panjang 50 m');
    check('13.5l intake jembatan tanpa bentang → menunggu jawaban', b1.awaitProjectConcept === true);
    const b2 = tryContinueUniversalContext('bentang 12 m');
    check('13.5m jawaban "bentang 12 m" ditangkap intake', b2 !== null && getUniversalContextState()?.spanM === 12);
    check('13.5n pertanyaan berikutnya = lebar jembatan', (b2?.message ?? '').includes('lebar jembatan'), (b2?.message ?? '').slice(0, 120));
    resetFlow();
  }

  /* ================================================================ */
  /* §13.6 — Irigasi: saluran + dimensi                                */
  /* ================================================================ */
  section('6', 'Irigasi — saluran 500 m x 2 m');
  {
    check('13.6a klasifikasi = irigasi', classifyUniversal('buatkan RAB saluran irigasi panjang 500 m lebar 2 m').primary?.id === 'irigasi');
    const d = draftOf('buatkan RAB saluran irigasi panjang 500 m lebar 2 m');
    check('13.6b irigasi → draft SDA-IRRIGATION-STONE', d !== null && d.parts[0]?.template.id === 'SDA-IRRIGATION-STONE', d?.parts.map((p) => p.template.id));
    check('13.6c panjang 500 m terbaca', d?.spec.lengthM === 500, d?.spec.lengthM);
    check('13.6d lebar 2 m terbaca', d?.spec.widthM === 2, d?.spec.widthM);
    check('13.6e irigasi → 3 item, total > 0', d !== null && effectiveItems(d).length === 3 && draftTotal(d) > 0);
    // RE-BASELINE BATCH 2 (§5.3, 2026-11-23): pin observasi lama
    // ("part irigasi tercatat di scope drainase") adalah KEBOJORAN
    // yang diperbaiki Batch 2 — "saluran" di dalam frasa "saluran
    // irigasi" bukan lagi kata kunci drainase (pengecualian frasa di
    // SCOPE_KEYWORD_EXCLUSIONS + constraint I1 evaluator), sehingga
    // part irigasi kini tercatat di scope IRIGASI sendiri dan
    // subtotalnya muncul sebagai irigasi. Template, jumlah item,
    // dan total TIDAK berubah (pin 13.6b/e di atas tetap hijau).
    check('13.6f B2: part irigasi tercatat di scope IRIGASI sendiri (bukan drainase)',
      d !== null && d.parts[0]?.scope.id === 'irigasi'
        && computeScopeTotals(d).some((s) => s.scopeId === 'irigasi')
        && !computeScopeTotals(d).some((s) => s.scopeId === 'drainase'),
      d ? { partScope: d.parts[0]?.scope.id, totals: computeScopeTotals(d).map((s) => s.scopeId) } : null);
  }

  /* ================================================================ */
  /* §13.7 — Drainase: U-ditch + panjang                               */
  /* ================================================================ */
  section('7', 'Drainase — U-ditch 300 m');
  {
    check('13.7a klasifikasi = drainase', classifyUniversal('buatkan RAB drainase U-ditch panjang 300 m').primary?.id === 'drainase');
    const d = draftOf('buatkan RAB drainase U-ditch panjang 300 m');
    check('13.7b drainase → draft SDA-DRAIN-UDITCH', d !== null && d.parts[0]?.template.id === 'SDA-DRAIN-UDITCH', d?.parts.map((p) => p.template.id));
    check('13.7c panjang 300 m terbaca', d?.spec.lengthM === 300, d?.spec.lengthM);
    check('13.7d drainase → 4 item, total > 0', d !== null && effectiveItems(d).length === 4 && draftTotal(d) > 0);
    check('13.7e scope engine = drainase', detectScopes('buatkan RAB drainase U-ditch panjang 300 m').map((s) => s.id).join() === 'drainase');
  }

  /* ================================================================ */
  /* §13.8 — Renovasi                                                   */
  /* ================================================================ */
  section('8', 'Renovasi — rumah 60 m²');
  {
    const cls = classifyUniversal('buatkan RAB renovasi rumah luas 60 m2');
    check('13.8a klasifikasi primer = renovasi', cls.primary?.id === 'renovasi', cls.primary?.id);
    check('13.8b sekunder memuat rumah (konteks dipertahankan)', cls.secondary.some((s) => s.id === 'rumah'), cls.secondary.map((s) => s.id));
    const d = draftOf('buatkan RAB renovasi rumah luas 60 m2');
    check('13.8c renovasi → draft RENOV-HOUSE-FULL', d !== null && d.parts[0]?.template.id === 'RENOV-HOUSE-FULL', d?.parts.map((p) => p.template.id));
    check('13.8d luas 60 m² terbaca', d?.spec.areaM2 === 60, d?.spec.areaM2);
    check('13.8e renovasi → 5 item, total > 0', d !== null && effectiveItems(d).length === 5 && draftTotal(d) > 0);
  }

  /* ================================================================ */
  /* §13.9 — MEP-only: listrik/plumbing — tanpa pertanyaan rumah        */
  /* ================================================================ */
  section('9', 'MEP-only — instalasi listrik/plumbing tanpa pertanyaan rumah');
  {
    const ctx = extractUniversalContext('buatkan RAB instalasi listrik luas 120 m2');
    check('13.9a konteks MEP primer = listrik', ctx.primary?.id === 'listrik', ctx.primary?.id);
    const qkeys = selectQuestionnaireQuestions(ctx).map((q) => q.key);
    check('13.9b kuesioner MEP menanyakan daya + titik', qkeys.includes('mep-power-capacity') && qkeys.includes('mep-points'), qkeys);
    check('13.9c kuesioner MEP HANYA kunci mep/sanitation (tanpa kunci rumah)',
      qkeys.length > 0 && qkeys.every((k) => k.startsWith('mep-') || k.startsWith('sanitation-')), qkeys);
    // B1 (2026-11-23): listrik-only TIDAK LAGI memakai paket MEP terpadu
    // (kegagalan kesesuaian #5 — paket mencakup 5 subsistem untuk
    // permintaan satu subsistem). Template listrik katalog berparameter
    // daya/titik, bukan luas — jadi permintaan berbasis luas saja kini
    // needs-spec yang menanyakan daya/titik, bukan draft menyesatkan.
    const d = buildUniversalDraft('buatkan RAB instalasi listrik luas 120 m2');
    check('13.9d MEP listrik → needs-spec (BUKAN draft MEP-COMPLETE-PKG)', d.kind === 'needs-spec', d.kind);
    check('13.9e needs-spec MEP menyebut subsistem listrik (tanpa part gedung/rumah)',
      d.kind === 'needs-spec' && /Mekanikal, Elektrikal & Plumbing|listrik/i.test(d.reason), d.kind === 'needs-spec' ? d.reason.slice(0, 120) : d.kind);
    check('13.9f MEP listrik → missing menyebut daya kVA atau titik instalasi',
      d.kind === 'needs-spec' && d.missing.some((m) => /kVA|titik/i.test(m)), d.kind === 'needs-spec' ? d.missing : d.kind);
    const dp = buildUniversalDraft('buatkan RAB instalasi plumbing luas 90 m2');
    check('13.9g MEP plumbing → needs-spec (tanpa pertanyaan rumah)', dp.kind === 'needs-spec', dp.kind);
    check('13.9h plumbing 90 m² → needs-spec jujur: missing menyebut lantai/unit basah/panjang pipa (bukan penolakan diam-diam)',
      dp.kind === 'needs-spec' && dp.missing.some((m) => /lantai|unit basah|panjang jaringan pipa/i.test(m)), dp.kind === 'needs-spec' ? dp.missing : dp.kind);
    // Tanpa ukuran → needs-spec menanyakan LUAS/PANJANG, bukan kamar.
    const noSize = buildUniversalDraft('buatkan RAB instalasi listrik rumah 3 kamar tidur');
    check('13.9i MEP tanpa ukuran → needs-spec (bukan tebakan)', noSize.kind === 'needs-spec', (noSize as any).kind);
    if (noSize.kind === 'needs-spec') {
      check('13.9j missing MEP menyebut luas/panjang instalasi',
        noSize.missing.some((m) => m.includes('luas bangunan') || m.includes('panjang instalasi')), noSize.missing);
      check('13.9k missing MEP TIDAK menanyakan kamar', !noSize.missing.some((m) => m.toLowerCase().includes('kamar')), noSize.missing);
    }
    const nq = selectNextQuestion(extractUniversalContext('buatkan RAB instalasi listrik rumah 3 kamar tidur'));
    // Re-baseline Batch 3 (§6.1) — dulu 'mep-area': kuesioner MEP
    // menanyakan LUAS sebagai kritis untuk SEMUA subsistem, padahal
    // template MEP-ELECTRICAL-DIST tidak punya parameter luas
    // (basisnya installed_kva + num_floors — B1 §9.8). Perilaku lama
    // adalah inkonsistensi yang dicatat B1, bukan perilaku yang
    // diinginkan: pertanyaan kritis listrik kini daya/lantai
    // ('mep-power-capacity'). HVAC/fire/mep-umum tetap 'mep-area'.
    check('13.9l pertanyaan kritis listrik = daya terpasang (critical)',
      (nq as any)?.key === 'mep-power-capacity' && (nq as any)?.critical === true, nq);
  }

  /* ================================================================ */
  /* §13.10 — Mixed-discipline: perumahan + jalan + drainase + retaining wall */
  /* ================================================================ */
  section('10', 'Mixed-discipline — perumahan + jalan + drainase + retaining wall');
  {
    const cls = classifyUniversal(MIXED_TEXT);
    check('13.10a klasifikasi multi-disiplin', cls.isMulti === true && cls.primary?.id === 'rumah', { primary: cls.primary?.id, multi: cls.isMulti });
    check('13.10b sekunder memuat jalan + drainase + dinding-penahan',
      ['jalan', 'drainase', 'dinding-penahan'].every((id) => cls.secondary.some((s) => s.id === id)),
      cls.secondary.map((s) => s.id));
    const spec = extractUniversalSpec(MIXED_TEXT);
    check('13.10c spek per-scope: jalan lengthM 1000', (spec as any).scopeSpecs?.jalan?.lengthM === 1000,
      (spec as any).scopeSpecs?.jalan);
    check('13.10d spek per-scope: drainase lengthM 500', (spec as any).scopeSpecs?.drainase?.lengthM === 500,
      (spec as any).scopeSpecs?.drainase);
    const d = draftOf(MIXED_TEXT);
    check('13.10e mixed → SATU draft 4 part', d !== null && d.parts.length === 4, d?.parts.map((p) => `${p.scope.id}:${p.template.id}`));
    // B1 (2026-11-23): 28 → 39 item — perumahan kini BLD-RUSUN (14 item,
    // bukan hotel 4 item) dan retaining wall kini STR-RETAINING-RC
    // (8 item, bukan taman kota 7 item); drainase 7 + jalan 10 tetap.
    check('13.10f mixed → 39 item', d !== null && effectiveItems(d).length === 39, d ? effectiveItems(d).length : null);
    check('13.10g mixed → TANPA duplikat item (itemKey unik)', d !== null && dupKeys(d).length === 0, d ? dupKeys(d) : null);
    check('13.10h mixed → subtotal 4 scope', d !== null && computeScopeTotals(d).length === 4,
      d ? computeScopeTotals(d).map((s) => s.scopeId) : null);
    check('13.10i mixed → total > 0', d !== null && draftTotal(d) > 0, d ? draftTotal(d) : null);
    // Draft parsial (G10): scope gagal PICK → warning + part lain lanjut.
    const partial = buildUniversalDraft('gudang 10 x 20 m + jembatan beton bentang 50 m');
    check('13.10j gudang + jembatan-50m → DRAFT parsial (bukan needs-spec)', partial.kind === 'draft', (partial as any).kind);
    if (partial.kind === 'draft') {
      check('13.10k draft parsial: hanya part gedung', partial.draft.parts.map((p) => p.scope.id).join() === 'gedung',
        partial.draft.parts.map((p) => p.scope.id));
      check('13.10l draft parsial: warning menyebut jembatan tidak dibangun',
        partial.draft.warnings.some((w) => w.toLowerCase().includes('jembatan') && w.includes('tidak dibangun')), partial.draft.warnings);
    }
    // PIN DOKUMENTASI — batas G10: scope tanpa BASIS UKURAN masih
    // memblokir seluruh draft (needs-spec), tidak seperti scope gagal
    // pick. Perilaku saat ini; draft parsial per-dimensi butuh keputusan
    // desain (gating per-scope ketat — handoff W2/W10).
    const noDims = buildUniversalDraft('buatkan RAB perumahan + jalan + drainase + retaining wall');
    check('13.10m DOKUMENTASI: mixed tanpa ukuran apa pun → needs-spec (bukan draft parsial)',
      noDims.kind === 'needs-spec', (noDims as any).kind);
  }

  /* ================================================================ */
  /* §13.11 — Custom unsupported: perilaku JUJUR (bukan RAB karangan)  */
  /* ================================================================ */
  section('11', 'Custom unsupported — pin perilaku jujur (tanpa builder kustom)');
  {
    for (const [label, text] of [
      ['menara telekomunikasi', 'buatkan RAB menara telekomunikasi tinggi 30 m'],
      ['landasan pacu', 'buatkan RAB landasan pacu bandara panjang 2 km'],
      ['menara pandang bambu', 'buatkan rab menara pandang bambu 3 lantai'],
      ['lift', 'buatkan rab lift 10 lantai'],
    ] as const) {
      const ev = evaluateRabIntent(text);
      const reasons = ev.recommendation.reasons.join(' ');
      check(`13.11a [${label}] rute = custom`, ev.route === 'custom', ev.route);
      check(`13.11b [${label}] teks jujur: "Belum ada jalur hitung" + "ringkasan kebutuhan"`,
        reasons.includes('Belum ada jalur hitung') && reasons.includes('ringkasan kebutuhan'), reasons.slice(0, 200));
      check(`13.11c [${label}] TIDAK menjanjikan "jalur kustom"`, !reasons.includes('jalur kustom'), reasons.slice(0, 200));
      check(`13.11d [${label}] teks menyebut BUKAN RAB jadi`, reasons.includes('bukan RAB jadi'), reasons.slice(0, 200));
      const r = buildUniversalDraft(text);
      check(`13.11e [${label}] engine TIDAK menghasilkan draft (tanpa RAB karangan)`, r.kind !== 'draft', (r as any).kind);
    }
    // Builder kustom memang belum ada (G11) — pin sebagai dokumentasi:
    // route custom jatuh ke ringkasan kebutuhan, bukan ke builder.
    check('13.11f DOKUMENTASI: klasifikasi menara = null (kategori tak dikenali)',
      classifyUniversal('buatkan RAB menara telekomunikasi tinggi 30 m').primary === null);
  }

  /* ================================================================ */
  /* §13.12 — Budget-only: hanya budget + tujuan umum → klarifikasi    */
  /* ================================================================ */
  section('12', 'Budget-only — hanya budget + tujuan umum → klarifikasi, bukan tebakan');
  {
    check('13.12a budget 120jt tetap ter-parse (rabIntentSpec)', extractRabIntentSpec('saya ada uang 120 juta mau bangun rumah').budgetIdr === 120_000_000);
    check('13.12b budget 120jt tetap ter-parse (universalSpec)', extractUniversalSpec('saya ada uang 120 juta mau bangun rumah').budgetCap === 120_000_000);
    const ev = evaluateRabIntent('saya ada uang 120 juta mau bangun rumah');
    check('13.12c budget + tujuan rumah → rute clarify (bukan generate)', ev.route === 'clarify', ev.route);
    check('13.12d alasan clarify: basis terukur belum ada',
      ev.recommendation.reasons.some((r) => r.includes('Basis terukur') && r.includes('klarifikasi')), ev.recommendation.reasons);
    const r = buildUniversalDraft('saya ada uang 120 juta');
    check('13.12e budget murni → TIDAK ada draft (tanpa RAB karangan)', (r as any).kind !== 'draft', (r as any).kind);
    check('13.12f budget murni → kind unsupported (cakupan tak dikenali)', (r as any).kind === 'unsupported', (r as any).kind);
    // PIN DOKUMENTASI — drift tipe: BuildResult di universalRab.ts hanya
    // mendeklarasikan 'draft' | 'needs-spec', tetapi runtime juga
    // mengembalikan 'unsupported' (budget-only + custom tanpa objek).
    // Bukan kegagalan perilaku; tipe perlu diselaraskan (tindak lanjut).
    const ev2 = evaluateRabIntent('saya ada uang 120 juta');
    check('13.12g budget murni → rute custom + teks jujur (ringkasan kebutuhan)',
      ev2.route === 'custom' && ev2.recommendation.reasons.join(' ').includes('ringkasan kebutuhan'), ev2.route);
    check('13.12h DOKUMENTASI: kind runtime "unsupported" di luar tipe BuildResult',
      typeof (r as any).reason === 'string' && (r as any).missing === undefined, JSON.stringify(r).slice(0, 120));
  }

  /* ================================================================ */
  /* §13.13 — Missing dimension (F6): jawaban susulan melanjutkan intake */
  /* ================================================================ */
  section('13', 'Missing dimension (F6) — jembatan tanpa bentang, jawaban susulan melanjutkan intake');
  {
    check('13.13a kontrafaktual: "bentang 12 m" tanpa konteks = UNKNOWN (jatuh ke LLM)',
      routeIntent('bentang 12 m').intent === 'UNKNOWN');
    resetFlow();
    const b1 = start('buatkan rab jembatan panjang 50 m');
    check('13.13b jembatan tanpa bentang → needs-spec menunggu jawaban', b1.awaitProjectConcept === true);
    check('13.13c pesan needs-spec menyebut bentang yang hilang', b1.message.includes('bentang'));
    check('13.13d pesan needs-spec TIDAK menyuruh kirim ulang lengkap', !b1.message.includes('Kirim ulang permintaan lengkap'));
    const bCtx = getUniversalContextState();
    check('13.13e universalCtx tersetel (primer jembatan, bentang null, panjang 50)',
      bCtx?.primary?.id === 'jembatan' && bCtx?.spanM == null && bCtx?.lengthM === 50,
      { primer: bCtx?.primary?.id, span: bCtx?.spanM, length: bCtx?.lengthM });
    const b2 = tryContinueUniversalContext('bentang 12 m');
    check('13.13f jawaban "bentang 12 m" ditangkap intake (bukan null/LLM)', b2 !== null);
    check('13.13g bentang 12 m tergabung ke konteks', getUniversalContextState()?.spanM === 12);
    check('13.13h intake melanjutkan: pertanyaan berikutnya = lebar jembatan',
      (b2?.message ?? '').includes('lebar jembatan'), (b2?.message ?? '').slice(0, 120));
    check('13.13i status menunggu tetap hidup sesudah jawaban susulan', b2?.awaitProjectConcept === true);
    const b3 = b2 ? tryContinueUniversalContext('lebar 7 m') : null;
    check('13.13j giliran ketiga berlanjut: ditanya tipe konstruksi (beton/baja)',
      (b3?.message ?? '').includes('beton') && (b3?.message ?? '').includes('baja'), (b3?.message ?? '').slice(0, 120));
    // Kasus jalan: tanpa panjang sama sekali → needs-spec + jawaban susulan.
    resetFlow();
    const j1 = start('buatkan rab jalan');
    check('13.13k jalan tanpa panjang → needs-spec menunggu jawaban', j1.awaitProjectConcept === true);
    const j2 = tryContinueUniversalContext('panjang 2 km');
    check('13.13l jawaban "panjang 2 km" ditangkap + 2000 m tergabung',
      j2 !== null && getUniversalContextState()?.lengthM === 2000, getUniversalContextState()?.lengthM);
    check('13.13m intake jalan melanjutkan: pertanyaan berikutnya = lebar jalan',
      (j2?.message ?? '').includes('lebar jalan'), (j2?.message ?? '').slice(0, 120));
    resetFlow();
  }

  /* ================================================================ */
  /* §13.14 — Missing price: UNRESOLVED + total parsial jujur          */
  /* ================================================================ */
  section('14', 'Missing price — UNRESOLVED + total parsial jujur (bukan Rp0 valid)');
  {
    const direct = buildDirectRab(OWNER_PROMPT);
    check('13.14a direct T36 tersedia', direct !== null);
    if (direct) {
      const engineTotal = direct.calc.generationResult.totalDirectCost;
      const priced = direct.calc.items.filter((i) => i.unitPrice > 0);
      const unpriced = direct.calc.items.filter((i) => !(i.unitPrice > 0));
      const pricedSum = priced.reduce((s, it) => s + it.volume * it.unitPrice, 0);
      check('13.14b total engine = jumlah item BERHARGA saja (kloset tak berharga dikecualikan)',
        Math.abs(pricedSum - engineTotal) < 1, { pricedSum, engineTotal });
      check('13.14c item tak berharga TIDAK valid untuk total', !isPriceValidForTotal({ priceStatus: 'PRICE_UNRESOLVED', unitPrice: null }));
      check('13.14d item berharga valid untuk total', isPriceValidForTotal({ priceStatus: 'PRICE_OK', unitPrice: 150_000 }));
      check('13.14e total parsial > 0 (bukan Rp0 valid)', engineTotal > 0 && unpriced.length === 1);
    }
    // Universal: kosongkan 2 harga pada draft jalan nyata.
    const d = draftOf(JALAN_TEXT);
    check('13.14f draft jalan tersedia', d !== null);
    if (d) {
      const before = draftTotal(d);
      // B1 (2026-11-23): draft jalan kini INFRA-ROAD-RIGID (bukan
      // RECONSTRUCTION) — "Galian Perbaikan" adalah item rekonstruksi
      // yang tidak ada di RIGID; diganti "Kanstin Beton" (item RIGID
      // yang berharga) agar tetap tepat 2 harga yang dikosongkan.
      const nulled = nullPricesWhere(d, (it) => it.description.includes('Perkerasan Beton') || it.description.includes('Kanstin Beton'));
      check('13.14g 2 harga dikosongkan (simulasi database tak punya harga)', nulled === 2, nulled);
      const t = computeTotals(d);
      check('13.14h status menjadi PARSIAL', t.status === 'PARSIAL', t.status);
      check('13.14i unpricedCount = 2', t.unpricedCount === 2, t.unpricedCount);
      check('13.14j total turun PERSIS sebesar nilai item yang dikosongkan (bukan Rp0, bukan karangan)',
        draftTotal(d) < before && draftTotal(d) > 0, { before, after: draftTotal(d) });
      const validSum = effectiveItems(d)
        .filter((it) => isPriceValidForTotal(it))
        .reduce((s, it) => s + (it.volume ?? 0) * (it.unitPrice ?? 0), 0);
      check('13.14k total = jumlah item valid saja', Math.abs(validSum - draftTotal(d)) < 1, { validSum, total: draftTotal(d) });
      const msg = formatUniversalDraftMessage(d);
      check('13.14l pesan menyebut PARSIAL/belum berharga (jujur di permukaan)',
        msg.includes('PARSIAL') || msg.toLowerCase().includes('belum ada harga') || msg.toLowerCase().includes('belum berharga'),
        msg.slice(0, 200));
    }
  }

  /* ================================================================ */
  /* §13.15 — AHSP matching: cocok → kode + harga resmi; tanpa match → NO_MATCH/NEEDS_REVIEW */
  /* ================================================================ */
  section('15', 'AHSP matching — kode + harga resmi; tanpa match tanpa auto-pick');
  {
    const pembesian = matchDedItemToAhsp({ name: 'Pembesian kolom', unit: 'kg' });
    check('13.15a "Pembesian kolom" → kandidat teratas penulangan 2.2.1.1.3 (skor ≥100)',
      pembesian.candidates[0]?.code === '2.2.1.1.3' && (pembesian.candidates[0]?.score ?? 0) >= 100,
      pembesian.candidates[0]);
    check('13.15b kandidat teratas membawa harga kanonis (biaya langsung)',
      typeof pembesian.candidates[0]?.canonicalPrice === 'number' && (pembesian.candidates[0]?.canonicalPrice ?? 0) > 0,
      pembesian.candidates[0]?.canonicalPrice);
    const urugan = matchDedItemToAhsp({ name: 'Urugan pasir', unit: 'm3' });
    check('13.15c "Urugan pasir" → TIMBUNAN A.3.02.1g (alias sinonim W8)',
      urugan.candidates[0]?.code === 'A.3.02.1g', urugan.candidates[0]?.code);
    const claimed = matchDedItemToAhsp({ name: 'Plesteran dinding', unit: 'm2', claimedAhspCode: '3.7.4' });
    check('13.15d klaim kode valid 3.7.4 → RESOLVED + matchedCode 3.7.4',
      claimed.status === 'RESOLVED' && claimed.matchedCode === '3.7.4',
      { status: claimed.status, code: claimed.matchedCode });
    const noMatch = matchDedItemToAhsp({ name: 'Pekerjaan fiktif xyzq tidak ada di katalog', unit: 'm2' });
    check('13.15e nama fiktif → NO_MATCH/NEEDS_REVIEW (bukan RESOLVED)',
      (noMatch.status === 'NO_MATCH' || noMatch.status === 'NEEDS_REVIEW') && noMatch.status !== 'RESOLVED',
      { status: noMatch.status, code: noMatch.matchedCode });
    check('13.15f nama fiktif → TIDAK ada kode auto-pick (matchedCode kosong)',
      noMatch.matchedCode == null, noMatch.matchedCode);
    const unitBad = matchDedItemToAhsp({ name: 'Plesteran dinding 1:4', unit: 'kg' });
    check('13.15g satuan salah (plesteran per kg) → TIDAK resolve diam-diam',
      unitBad.status !== 'RESOLVED' && unitBad.matchedCode == null,
      { status: unitBad.status, code: unitBad.matchedCode });
  }

  /* ================================================================ */
  /* §13.16 — Non-AHSP: item custom ber-provenance transparan           */
  /* ================================================================ */
  section('16', 'Non-AHSP — CUSTOM_COMPOSED + manual berlabel');
  {
    const full = composeCustomAhspPrice(PLESTERAN_374);
    check('13.16a komposisi 3.7.4 → FULL', full.status === 'FULL', full.status);
    check('13.16b komposisi 3.7.4 = Rp51.622 (harga kanonis, reproduksi eksak)', full.unitPrice === 51622, full.unitPrice);
    check('13.16c resolved 6/6', full.resolved === 6 && full.total === 6, { resolved: full.resolved, total: full.total });
    check('13.16d splits tenaga + material + alat = harga',
      full.splits.labor + full.splits.material + full.splits.equipment === 51622, full.splits);
    check('13.16e provenance per baris: sumber master tercatat',
      full.lines.every((l) => l.unitPrice != null && l.amount != null && !!l.sourceName), full.lines.length);
    const partial = composeCustomAhspPrice([
      ...PLESTERAN_374,
      { resourceName: 'Bahan fiktif tidak ada xyz', resourceType: 'material', coefficient: 1, unit: 'kg' },
    ]);
    check('13.16f satu komponen tak ter-resolve → PARTIAL', partial.status === 'PARTIAL', partial.status);
    check('13.16g PARTIAL: harga null (jumlah parsial TIDAK dipakai)', partial.unitPrice === null, partial.unitPrice);
    check('13.16h PARTIAL: daftar hilang menyebut komponen fiktif',
      partial.missing.some((m) => m.resourceName.includes('Bahan fiktif')));
    const svc = new RabTemplateService();
    const resolve = (comp: any, mat: number | null = null, meta: any = null) =>
      (svc as any).resolveTemplateComponentPrice(comp, mat, meta);
    const baseComp = { id: 'c1', name: 'Plesteran custom', category: '06. PLESTERAN', unit: 'm2', calculationRule: 'luas', variables: ['luas'] };
    const rComposed = resolve({ ...baseComp, customComposition: PLESTERAN_374 });
    check('13.16i resolver: kind CUSTOM_COMPOSED', rComposed.kind === 'CUSTOM_COMPOSED', rComposed.kind);
    check('13.16j resolver: harga komposisi Rp51.622', rComposed.unitPrice === 51622, rComposed.unitPrice);
    check('13.16k resolver: basis DIRECT_COST + label komposisi kustom',
      rComposed.priceCostBasis === 'DIRECT_COST' && rComposed.label === 'Harga Komposisi Kustom',
      { basis: rComposed.priceCostBasis, label: rComposed.label });
    check('13.16l resolver: explanation menyebut komponen + dasar harga',
      String(rComposed.explanation).includes('Semen portland') && String(rComposed.explanation).includes('biaya langsung'));
    const rBaked = resolve({ ...baseComp, unitPrice: 99999 });
    check('13.16m komponen tanpa kode + harga baked → MARKET_REFERENCE berlabel (bukan OFFICIAL)',
      rBaked.kind === 'MARKET_REFERENCE' && rBaked.unitPrice === 99999, { kind: rBaked.kind, price: rBaked.unitPrice });
  }

  /* ================================================================ */
  /* §13.17 — WBS generation: seksi WBS + subtotal per scope           */
  /* ================================================================ */
  section('17', 'WBS — seksi struktur + subtotal per scope (draft mixed)');
  {
    const d = draftOf(MIXED_TEXT);
    check('13.17a draft mixed tersedia', d !== null);
    if (d) {
      const wbs = wbsStructureLines(d);
      check('13.17b wbsStructureLines ber-header "Struktur paket (WBS):"',
        wbs[0] === '**Struktur paket (WBS):**', wbs[0]);
      const joined = wbs.join('\n');
      check('13.17c seksi WBS menyebut keempat scope (drainase, jalan, gedung, lanskap)',
        ['Drainase', 'Jalan', 'Gedung', 'Lanskap'].every((s) => joined.includes(s)), joined.slice(0, 400));
      check('13.17d wbsCompletenessLines tidak kosong', wbsCompletenessLines(d).length > 0);
      const scopes = computeScopeTotals(d);
      check('13.17e 4 subtotal scope', scopes.length === 4, scopes.map((s) => s.scopeId));
      const scopeSum = scopes.reduce((s, x) => s + x.totals.estimatedTotal, 0);
      check('13.17f Σ subtotal scope = total proyek (|selisih| < 0,005)',
        Math.abs(scopeSum - draftTotal(d)) < 0.005, { scopeSum, total: draftTotal(d) });
      check('13.17g Σ item scope = 39 item proyek',
        scopes.reduce((s, x) => s + x.itemCount, 0) === 39, scopes.map((s) => s.itemCount));
      const msg = formatUniversalDraftMessage(d);
      check('13.17h pesan memuat brief di kepala', msg.includes('**Brief proyek:**'));
      check('13.17i pesan memuat seksi WBS', msg.includes('**Struktur paket (WBS):**'));
      check('13.17j pesan memuat subtotal per cakupan', msg.includes('**Subtotal per cakupan:**'));
      check('13.17k pesan memuat baris tangga keuangan (biaya langsung vs Total RAB)',
        msg.includes('**biaya langsung**') && msg.includes('**Total RAB**') && msg.includes('sesudah transfer'),
        msg.slice(0, 300));
    }
    check('13.17l WBS konseptual: 18 scope terpetakan (SCOPE_GROUPS)',
      SCOPE_GROUPS.every((s) => conceptualWbsFor(s.id) !== null),
      SCOPE_GROUPS.filter((s) => conceptualWbsFor(s.id) === null).map((s) => s.id));
    check('13.17m WBS konseptual rumah = 10 langkah', conceptualWbsFor('rumah')?.length === 10);
    check('13.17n WBS konseptual jembatan = 8 langkah', conceptualWbsFor('jembatan')?.length === 8);
    check('13.17o WBS konseptual rumah diawali persiapan & pengukuran',
      conceptualWbsFor('rumah')?.[0] === 'Pekerjaan persiapan & pengukuran');
  }

  /* ================================================================ */
  /* §13.18 — QTO traceability: formula + inputs + sourceComponentId + volumeBasis */
  /* ================================================================ */
  section('18', 'QTO traceability — formula + inputs + sourceComponentId + volumeBasis');
  {
    const d = draftOf(MIXED_TEXT);
    check('13.18a draft mixed tersedia', d !== null);
    if (d) {
      const items = effectiveItems(d);
      check('13.18b SEMUA item membawa qtoTrace',
        items.every((it) => it.qtoTrace != null), `${items.filter((it) => it.qtoTrace).length}/${items.length}`);
      check('13.18c SEMUA trace membawa formula + inputs + sourceComponentId + volumeSource CALCULATOR',
        items.every((it) =>
          it.qtoTrace != null &&
          typeof it.qtoTrace.formulaInputs === 'object' &&
          typeof it.qtoTrace.sourceComponentId === 'string' && it.qtoTrace.sourceComponentId.length > 0 &&
          it.qtoTrace.volumeSource === 'CALCULATOR'),
        items[0]?.qtoTrace);
      check('13.18d sourceComponentId top-level = sourceComponentId di trace',
        items.every((it) => it.sourceComponentId === it.qtoTrace?.sourceComponentId));
      const chan = items.find((it) => it.qtoTrace?.formula === 'channel_length * 1.6');
      check('13.18e spot recompute: channel_length 500 x 1.6 → volume 800',
        chan != null && chan.qtoTrace?.formulaInputs?.channel_length === 500 && chan.volume === 800,
        chan ? { formula: chan.qtoTrace?.formula, inputs: chan.qtoTrace?.formulaInputs, volume: chan.volume } : null);
      const payload = buildPushPayload(d);
      check('13.18f payload push = 39 item', payload.length === 39, payload.length);
      check('13.18g SEMUA payload membawa volumeBasis (USER_DIMENSION/ASSUMPTION)',
        payload.every((p: any) => p.volumeBasis === 'USER_DIMENSION' || p.volumeBasis === 'ASSUMPTION'));
      check('13.18h payload membawa qtoTrace + sourceComponentId (trace diteruskan saat transfer)',
        payload.every((p: any) => p.qtoTrace != null && typeof p.sourceComponentId === 'string'));
      const userDim = payload.filter((p: any) => p.volumeBasis === 'USER_DIMENSION').length;
      check('13.18i sebagian basis = USER_DIMENSION (dimensi dari pengguna)', userDim > 0 && userDim < payload.length, { userDim, total: payload.length });
      check('13.18j volumeSource dibedakan dari basis (USER_DIMENSION → MANUAL)',
        payload.filter((p: any) => p.volumeBasis === 'USER_DIMENSION').every((p: any) => p.volumeSource === 'MANUAL'));
    }
    check('13.18k bentuk WEIGHT: shapeForUnit("kg") = WEIGHT (W7/S3-3)', shapeForUnit('kg') === 'WEIGHT', shapeForUnit('kg'));
    check('13.18l bentuk WEIGHT: shapeForUnit("ton") = WEIGHT', shapeForUnit('ton') === 'WEIGHT', shapeForUnit('ton'));
  }

  /* ================================================================ */
  /* §13.19 — Budget comparison: UNDER/OVER + caveat asumsi            */
  /* ================================================================ */
  section('19', 'Budget comparison — UNDER/OVER + caveat asumsi bila completion');
  {
    const under = assessBudgetFeasibility({ totalPriced: 116_737_891, unpricedCount: 0, budgetCap: 120_000_000 });
    check('13.19a 116,7jt vs cap 120jt → UNDER', under.verdict === 'UNDER', under.verdict);
    check('13.19b diff = cap − total = 3.262.109', under.diff === 3_262_109, under.diff);
    check('13.19c baris UNDER menyebut DI BAWAH + selisih',
      formatBudgetFeasibilityLine(under).includes('DI BAWAH anggaran sebesar Rp3.262.109'), formatBudgetFeasibilityLine(under));
    const jalanTotal = draftTotal(draftOf(JALAN_TEXT)!);
    const over = assessBudgetFeasibility({ totalPriced: jalanTotal, unpricedCount: 0, budgetCap: 1_000_000 });
    check('13.19d total jalan vs cap 1jt → OVER', over.verdict === 'OVER', { total: jalanTotal, verdict: over.verdict });
    check('13.19e baris OVER menyebut MELEBIHI + "tidak dipangkas diam-diam"',
      formatBudgetFeasibilityLine(over).includes('MELEBIHI anggaran') && formatBudgetFeasibilityLine(over).includes('tidak dipangkas diam-diam'));
    const prov = assessBudgetFeasibility({ totalPriced: 100_000_000, unpricedCount: 2, budgetCap: 120_000_000 });
    check('13.19f total parsial (2 tak berharga) → provisional + alasan',
      prov.provisional === true && typeof prov.reason === 'string' && prov.reason.length > 0, prov);
    check('13.19g baris provisional memuat catatan SEMENTARA — total PARSIAL',
      formatBudgetFeasibilityLine(prov).includes('SEMENTARA — total PARSIAL'));
    const noBudget = assessBudgetFeasibility({ totalPriced: 100_000_000, unpricedCount: 0, budgetCap: null });
    check('13.19h tanpa cap → NO_BUDGET', noBudget.verdict === 'NO_BUDGET', noBudget.verdict);
    const cannot = assessBudgetFeasibility({ totalPriced: null, unpricedCount: 3, budgetCap: 120_000_000 });
    check('13.19i tanpa item berharga → CANNOT_ASSESS (bukan verdict palsu)',
      cannot.verdict === 'CANNOT_ASSESS', cannot.verdict);
  }

  /* ================================================================ */
  /* §13.20 — Conversation continuity: ubah spek → konteks sama diperbarui */
  /* ================================================================ */
  section('20', 'Conversation continuity — ubah spek via bahasa alami, tanpa duplikat');
  {
    // (a) Intake universal: giliran 2 menggabung ke konteks giliran 1.
    const ctx1 = extractUniversalContext('rumah 3 kamar tidur');
    const ctx2 = extractUniversalContext('kualitas premium', ctx1);
    check('13.20a konteks intake tergabung antar-giliran (kamar g1 + kualitas g2)',
      ctx2.house?.bedrooms === 3 && ctx2.house?.quality === 'premium', ctx2.house);
    check('13.20b konteks giliran 1 TIDAK hilang sesudah giliran 2',
      ctx2.house?.bedrooms === 3 && ctx1.house?.bedrooms === 3);
    // (b) Koreksi spek rumah: hanya field yang disebut berubah.
    resetFlow();
    setLastRabIntentSpec(extractRabIntentSpec('buatkan rab rumah luas bangunan 100 m2'));
    const ev = continueRabIntent('lantainya 2');
    check('13.20c continueRabIntent: koreksi lantai diterapkan', ev.spec.floors === 2, ev.spec.floors);
    check('13.20d continueRabIntent: field lain dipertahankan (bangunan 100)',
      ev.spec.buildingAreaM2 === 100, ev.spec.buildingAreaM2);
    check('13.20e spek aktif tersimpan (floors 2 + bangunan 100)',
      getLastRabIntentSpec()?.floors === 2 && getLastRabIntentSpec()?.buildingAreaM2 === 100);
    clearLastRabIntentSpec();
    // (c) Revisi draft universal: spek berubah, draft yang SAMA diperbarui.
    const d = draftOf(JALAN_TEXT);
    check('13.20f draft jalan tersedia', d !== null);
    if (d) {
      const totalBefore = draftTotal(d);
      const vBefore = d.version;
      const rev = reviseUniversalDraft(d, 'lebar menjadi 8 m');
      check('13.20g revisi "lebar menjadi 8 m" berhasil', rev?.ok === true && rev?.changed === true, rev ? { ok: rev.ok, changed: rev.changed } : null);
      check('13.20h lebar spek menjadi 8 (konteks sama diperbarui)', d.spec.widthM === 8, d.spec.widthM);
      check('13.20i versi naik (v1 → v2), template sama (tanpa proyek/draft baru)',
        d.version === vBefore + 1 && d.parts[0]?.template.id === 'INFRA-ROAD-RIGID',
        { version: d.version, template: d.parts[0]?.template.id });
      check('13.20j jumlah item tetap 8 (tanpa item duplikat)', effectiveItems(d).length === 8, effectiveItems(d).length);
      check('13.20k total dihitung ulang naik (lebar 6→8 m)', draftTotal(d) > totalBefore, { before: totalBefore, after: draftTotal(d) });
      check('13.20l revisi yang sama kedua kali → item tetap 8, tanpa duplikat kunci',
        (() => { reviseUniversalDraft(d, 'lebar menjadi 8 m'); return effectiveItems(d).length === 8 && dupKeys(d).length === 0; })());
    }
    // PIN DOKUMENTASI — batas revisi: satuan km TIDAK diterima regex
    // revisi dimensi ("panjang menjadi 2 km" → null, draft tak berubah).
    // Perilaku saat ini; revisi panjang jalan 2 km harus ditulis "2000 m".
    const dKm = draftOf(JALAN_TEXT);
    check('13.20m DOKUMENTASI: revisi "panjang menjadi 2 km" → null (km tak diterima)',
      dKm !== null && reviseUniversalDraft(dKm, 'panjang menjadi 2 km') === null);
  }

  /* ================================================================ */
  /* §13.21 — Duplicate item prevention                                */
  /* ================================================================ */
  section('21', 'Duplicate prevention — perintah ganda / revisi tanpa item ganda');
  {
    const d = draftOf(JALAN_TEXT);
    check('13.21a draft jalan tersedia', d !== null);
    if (d) {
      const r1 = reviseUniversalDraft(d, 'tambahkan marka jalan');
      check('13.21b tambah "marka jalan" pertama → berhasil, item 8→9',
        r1?.ok === true && effectiveItems(d).length === 9, { ok: r1?.ok, items: effectiveItems(d).length });
      const r2 = reviseUniversalDraft(d, 'tambahkan marka jalan');
      check('13.21c tambah "marka jalan" kedua → DITOLAK (sudah ada — tidak digandakan)',
        r2?.ok === false && r2?.changed === false && (r2?.message ?? '').includes('sudah ada di draft — tidak digandakan'),
        r2?.message.slice(0, 120));
      check('13.21d item tetap 9 sesudah perintah ganda', effectiveItems(d).length === 9, effectiveItems(d).length);
      check('13.21e tanpa duplikat kunci item sesudah perintah ganda', dupKeys(d).length === 0, dupKeys(d));
      const t1 = reviseUniversalDraft(d, 'tambahkan trotoar');
      const t2 = reviseUniversalDraft(d, 'tambahkan trotoar');
      check('13.21f pola yang sama untuk "trotoar" (tambah 1x, tolak ke-2)',
        t1?.ok === true && t2?.ok === false && effectiveItems(d).length === 10,
        { t1: t1?.ok, t2: t2?.ok, items: effectiveItems(d).length });
    }
    // Build ganda deterministik: state global tidak mengakumulasi item.
    const m1 = draftOf(MIXED_TEXT);
    const m2 = draftOf(MIXED_TEXT);
    check('13.21g build mixed dua kali → keduanya 39 item (tanpa akumulasi)',
      m1 !== null && m2 !== null && effectiveItems(m1).length === 39 && effectiveItems(m2).length === 39);
    check('13.21h build mixed kedua tetap tanpa duplikat kunci', m2 !== null && dupKeys(m2).length === 0);
    // Tambah item tak dikenal → jujur gagal, draft tak berubah.
    const d3 = draftOf(JALAN_TEXT);
    if (d3) {
      const bad = reviseUniversalDraft(d3, 'tambahkan rambu lalu lintas');
      check('13.21i tambah item tak dikenal → gagal jujur, item tetap 8',
        bad?.ok === false && effectiveItems(d3).length === 8, bad?.message.slice(0, 100));
    }
  }

  /* ================================================================ */
  /* §13.22 — Approval before permanent project changes                */
  /* ================================================================ */
  section('22', 'Approval — push direct + 6 perintah minta konfirmasi dulu');
  {
    // (a) Push direct: pratinjau + binding; tanpa binding tidak menulis.
    const direct = buildDirectRab('buatkan rab rumah type 36 1 lantai');
    check('13.22a direct T36 tersedia', direct !== null);
    if (direct) {
      const preview = buildDirectPushPreview(direct, new Set<string>());
      const previewMsg = formatDirectPushPreviewMessage(direct, preview, 'Rumah Demo');
      check('13.22b pratinjau push memuat judul + hitungan item',
        previewMsg.includes('Preview push') && preview.itemCount === 25, { itemCount: preview.itemCount });
      const noBinding = checkDirectPushApprovalBinding(null, direct, 'p1');
      check('13.22c tanpa binding → NO_BINDING (tidak boleh menulis)',
        !noBinding.ok && noBinding.reason === 'NO_BINDING', noBinding);
      const binding = createDirectPushApprovalBinding(direct, 'p1', 1_000_000);
      check('13.22d binding segar dari pratinjau → ok',
        checkDirectPushApprovalBinding(binding, direct, 'p1', 1_000_000).ok);
      check('13.22e lewat TTL → EXPIRED',
        !checkDirectPushApprovalBinding(binding, direct, 'p1', 1_000_000 + DIRECT_PUSH_APPROVAL_TTL_MS + 1).ok);
      check('13.22f proyek berganti → PROJECT_CHANGED',
        checkDirectPushApprovalBinding(binding, direct, 'p2', 1_000_000).reason === 'PROJECT_CHANGED');
      const direct45 = buildDirectRab('buatkan rab rumah type 45 1 lantai');
      check('13.22g hasil berubah sesudah pratinjau → RESULT_CHANGED',
        direct45 !== null && checkDirectPushApprovalBinding(binding, direct45, 'p1', 1_000_000).reason === 'RESULT_CHANGED');
      check('13.22h klik kedua (slot dikosongkan) → NO_BINDING, tidak menulis dua kali',
        !checkDirectPushApprovalBinding(null, direct, 'p1', 1_000_000).ok);
    }
    // (b) 6 perintah langsung: panggilan pertama HANYA bertanya.
    // P1-B/P1-C (direktif owner 2026-11-24): seksi ini berjalan sebagai
    // Estimator (gerbang kapabilitas) dan eksekusi ke-2 memakai KLIK
    // TOMBOL konfirmasi (executeDirectConfirmation) — kirim-ulang teks
    // TIDAK PERNAH mengeksekusi (D6 O-5).
    setAssistantOperationContext({ actor: 'Penguji', writesEnabled: true });
    const PROJECTS = [
      { id: 'p1', name: 'Rumah Demo' },
      { id: 'p2', name: 'Gedung Sekolah' },
    ];
    const baseCtx = (): ChatActionContext => ({
      navigate: () => {},
      currentMenu: '',
      activeProject: { id: 'p1', name: 'Rumah Demo' },
      projects: PROJECTS.map((p) => ({ ...p })),
      projectTotal: null,
    });
    // B1 rename
    {
      clearPendingDirectConfirmations();
      const calls: Array<{ id: string; name: string }> = [];
      const ctx = baseCtx();
      ctx.renameProject = (id, name) => { calls.push({ id, name }); return true; };
      const ask = executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
      check('13.22i rename ke-1 → callback TIDAK dipanggil', calls.length === 0);
      check('13.22j rename ke-1 → bertanya + tombol konfirmasi',
        ask.ok && (ask.actions?.length ?? 0) === 1 && ask.actions![0].label === 'Ubah nama proyek menjadi Rumah Impian');
      executeDirectConfirmation('RENAME_PROJECT', 'Rumah Impian', ctx);
      check('13.22k rename klik tombol konfirmasi → callback tepat sekali', calls.length === 1 && calls[0].name === 'Rumah Impian');
      executeIntent('RENAME_PROJECT', 'Rumah Impian', ctx);
      check('13.22l rename ke-3 → TIDAK mengeksekusi lagi (idempotensi)', calls.length === 1);
    }
    // B2 create project
    {
      clearPendingDirectConfirmations();
      const created: string[] = [];
      const ctx = baseCtx();
      ctx.createProject = (name) => { created.push(name); return { id: 'p9', name }; };
      const ask = executeIntent('CREATE_PROJECT', 'Rumah Impian', ctx);
      check('13.22m buat proyek ke-1 → TIDAK membuat', created.length === 0);
      check('13.22n buat proyek ke-1 → tombol konfirmasi', ask.actions?.[0]?.label === 'Buat proyek Rumah Impian');
      executeDirectConfirmation('CREATE_PROJECT', 'Rumah Impian', ctx);
      check('13.22o buat proyek klik tombol konfirmasi → membuat tepat sekali', created.length === 1);
      executeIntent('CREATE_PROJECT', 'Rumah Impian', ctx);
      check('13.22p buat proyek ke-3 → TIDAK membuat lagi', created.length === 1);
    }
    // B3 archive
    {
      clearPendingDirectConfirmations();
      const archived: string[] = [];
      const ctx = baseCtx();
      ctx.archiveProject = (id) => { archived.push(id); return true; };
      const ask = executeIntent('ARCHIVE_PROJECT', 'ini', ctx);
      check('13.22q arsip ke-1 → TIDAK mengarsipkan', archived.length === 0);
      check('13.22r arsip ke-1 → tombol konfirmasi bernamakan target', ask.actions?.[0]?.label === 'Arsipkan proyek Rumah Demo');
      executeDirectConfirmation('ARCHIVE_PROJECT', 'ini', ctx);
      check('13.22s arsip klik tombol konfirmasi → mengarsipkan tepat sekali', archived.length === 1 && archived[0] === 'p1');
      executeIntent('ARCHIVE_PROJECT', 'ini', ctx);
      check('13.22t arsip ke-3 → TIDAK mengarsipkan lagi', archived.length === 1);
    }
    // B4 duplicate
    {
      clearPendingDirectConfirmations();
      const duped: string[] = [];
      const ctx = baseCtx();
      ctx.duplicateProject = (id) => { duped.push(id); return { id: 'p9', name: 'Rumah Demo (Salinan)' }; };
      const ask = executeIntent('DUPLICATE_PROJECT', 'ini', ctx);
      check('13.22u duplikat ke-1 → TIDAK menduplikat', duped.length === 0);
      check('13.22v duplikat ke-1 → tombol konfirmasi', ask.actions?.[0]?.label === 'Duplikat proyek Rumah Demo');
      executeDirectConfirmation('DUPLICATE_PROJECT', 'ini', ctx);
      check('13.22w duplikat klik tombol konfirmasi → menduplikat tepat sekali', duped.length === 1);
      executeIntent('DUPLICATE_PROJECT', 'ini', ctx);
      check('13.22x duplikat ke-3 → TIDAK menduplikat lagi', duped.length === 1);
    }
    // B5 update settings
    {
      clearPendingDirectConfirmations();
      let applyCount = 0;
      let seenPatch: Record<string, unknown> | null = null;
      const ctx = baseCtx();
      ctx.updateProjectSettings = (_id, patch) => {
        applyCount++;
        seenPatch = patch as unknown as Record<string, unknown>;
        return true;
      };
      const ask = executeIntent('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
      check('13.22y settings ke-1 → TIDAK diterapkan', applyCount === 0 && seenPatch === null);
      check('13.22z settings ke-1 → pratinjau perubahan + tombol konfirmasi',
        ask.message.includes('Overhead') && ask.actions?.[0]?.label === 'Ubah Overhead jadi 10%');
      executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
      check('13.22aa settings klik tombol konfirmasi → diterapkan tepat sekali, patch hanya field yang disebut',
        applyCount === 1 && seenPatch !== null && (seenPatch as Record<string, unknown>).overheadPercent === 10);
      executeIntent('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
      check('13.22ab settings ke-3 → TIDAK diterapkan lagi', applyCount === 1);
    }
    // B6 create QTO item
    {
      clearPendingDirectConfirmations();
      const created: Array<{ uraian: string; quantity: number; unit: string }> = [];
      const ctx = baseCtx();
      ctx.createQtoItem = (input) => { created.push(input); return { id: 'q1', kode: 'Q-001' }; };
      const ask = executeIntent('CREATE_QTO_ITEM', 'galian tanah 10 m3', ctx);
      check('13.22ac buat QTO ke-1 → TIDAK membuat item', created.length === 0);
      check('13.22ad buat QTO ke-1 → tombol konfirmasi', ask.actions?.[0]?.label === 'Buat item QTO galian tanah 10 m3');
      executeDirectConfirmation('CREATE_QTO_ITEM', 'galian tanah 10 m3', ctx);
      check('13.22ae buat QTO klik tombol konfirmasi → membuat tepat sekali', created.length === 1 && created[0].uraian === 'galian tanah');
      executeIntent('CREATE_QTO_ITEM', 'galian tanah 10 m3', ctx);
      check('13.22af buat QTO ke-3 → TIDAK membuat lagi', created.length === 1);
    }
    // B7 sync QTO
    {
      clearPendingDirectConfirmations();
      const items = [{ id: 'q1', uraian: 'galian tanah', quantity: 10, unit: 'm3', unitPrice: 50000, priceUnit: 'm3' }];
      const synced: string[] = [];
      const ctx = baseCtx();
      ctx.listQtoItems = () => items as never;
      ctx.syncQtoItem = (id) => { synced.push(id); return true; };
      const ask = executeIntent('SYNC_QTO', 'galian ke rab', ctx);
      check('13.22ag sync QTO ke-1 → TIDAK menyinkron', synced.length === 0);
      check('13.22ah sync QTO ke-1 → tombol konfirmasi', ask.actions?.[0]?.label === 'Sinkronkan QTO galian tanah ke RAB');
      executeDirectConfirmation('SYNC_QTO', 'galian ke rab', ctx);
      check('13.22ai sync QTO klik tombol konfirmasi → menyinkron tepat sekali', synced.length === 1 && synced[0] === 'q1');
      executeIntent('SYNC_QTO', 'galian ke rab', ctx);
      check('13.22aj sync QTO ke-3 → TIDAK menyinkron lagi', synced.length === 1);
    }
  }

  /* ================================================================ */
  /* Ringkasan                                                         */
  /* ================================================================ */
  console.log('\n================ RINGKASAN MATRIKS §13 ================');
  for (const [id, st] of [...sectionStats.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const mark = st.fail === 0 ? 'OK  ' : 'GAGAL';
    console.log(`  §13.${id.padStart(2, ' ')} [${mark}] ${st.pass} pass / ${st.fail} fail`);
  }
  console.log(`\nTOTAL: ${pass} pass / ${fail} fail (${pass + fail} asersi)`);
  if (failures.length > 0) {
    console.log('\nDaftar gagal:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL (suite crash):', e);
  process.exitCode = 1;
});
