/**
 * pricingFinancialIntegrity.test.ts — Batch 4 Universal (§7):
 * Pricing, Financial & Spreadsheet Integrity.
 *
 * Membuktikan harga/total yang ditampilkan user persis sama dengan yang
 * masuk spreadsheet yang disetujui dan ekspor berikutnya — lewat JALUR
 * KODE NYATA (bukan mock atas hal yang diuji; stub hanya untuk gateway
 * AI, pola chatBudgetRabFullAi; tanpa panggilan provider):
 *
 *   A. Status harga kanonis 7 keadaan (§7.1) + ceiling jujur + sentinel-0.
 *   B. Transfer estimasi Full AI — jalur DIRECT (§7.2, inti Batch 4):
 *      chat → mapper push → preview → binding → (spreadsheet).
 *   C. Transfer estimasi Full AI — jalur UNIVERSAL (§7.2): draft →
 *      completion → approval → payload → record → engine → persistensi.
 *   D. Rekonsiliasi finansial (§7.3/§7.4): ember, O&P, pajak, rounding,
 *      konfigurasi historis, default proyek baru, subtotal scope.
 *   E. Sinkronisasi spreadsheet (§7.5): round-trip, retry, duplikat,
 *      transfer gagal, identitas stabil.
 *   F. Integritas ekspor (§7.6): label Excel/PDF, snapshot, laporan,
 *      gerbang klaim final.
 *   G. Gerbang transfer risiko teknik (§8, handoff Batch 3).
 *   H. Pin regresi: tanpa completion perilaku lama byte-identical;
 *      estimatedTotal tidak dihitung ganda; volume = 1.0.
 *
 * Gaya plain-tsx assertion (bukan vitest), dijalankan via
 * `npx --yes tsx src/test/pricingFinancialIntegrity.test.ts`.
 */
import assert from 'node:assert';

// --- Shim localStorage (pola chatContinuityApproval) SEBELUM pemakaian
// draftPersistence (diperlukan untuk uji round-trip §C8). ----------------
const __b4Store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (__b4Store.has(k) ? __b4Store.get(k)! : null),
  setItem: (k: string, v: string) => {
    __b4Store.set(k, String(v));
  },
  removeItem: (k: string) => {
    __b4Store.delete(k);
  },
  clear: () => __b4Store.clear(),
  get length() {
    return __b4Store.size;
  },
  key: (i: number) => Array.from(__b4Store.keys())[i] ?? null,
};

import {
  buildUniversalDraft,
  effectiveItems,
  computeTotals,
  totalsFromItems,
  buildPushPreview,
  buildPushPayload,
  dedupePushPayload,
  validateTransfer,
  draftReadiness,
  isPriceValidForTotal,
  setLastUniversalDraft,
  transferPriceStatus,
  type UniversalDraft,
  type UniversalPushPayloadItem,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  buildDirectRab,
  setLastDirectRab,
  getLastDirectRab,
  type DirectRabResult,
} from '../ai-tools/ezrab-ai/directRab';
import {
  mapDirectRabPushItems,
  buildDirectPushPreview,
  formatDirectPushPreviewMessage,
  createDirectPushApprovalBinding,
  checkDirectPushApprovalBinding,
} from '../ai-tools/ezrab-ai/directRabPush';
import {
  executeBudgetFullAiRab,
  type ChatActionContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import type { ChatRabCompletionDeps } from '../ai-tools/ezrab-ai/fullAiRabCompletion';
import {
  saveDraft,
  loadDraft,
  peekPersistedDraft,
  draftFingerprint,
} from '../ai-tools/ezrab-ai/draftPersistence';
import {
  decideDraftItemAssumption,
  setDraftItemManualPrice,
} from '../ai-tools/ezrab-ai/draftReview';
import {
  assessDraftEngineering,
} from '../ai-tools/ezrab-ai/engineeringSpec';
import { RabTemplateService } from '../services/rabTemplateService';
import type { RabTemplate } from '../engine/rab/rabTemplates';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import {
  UnifiedProjectEngine,
} from '../engine/unifiedProjectEngine';
import type { Project } from '../types';
import { buildExcelSourceText } from '../export/excelExportEngine';
import { buildPdfSourceAnnotations } from '../export/pdfExporter';
import { freezeRabSnapshot } from '../export/fiveSheetPreset';
import { summarizeExportSections } from '../export/priceIntegrity';
import {
  resolveCanonicalPriceState,
  reconciliationLineAmount,
  reconcileProjectFinancials,
  reconcileScopeSubtotals,
  summarizeEstimateApprovals,
  checkEngineeringTransferGate,
  buildExportIntegrityReport,
  roundRupiah,
  type EngineeringReviewRecord,
} from '../ai-tools/ezrab-ai/pricingFinancialIntegrity';
import { formatWorkItemTitle } from '../ai-tools/ezrab-ai/workItemTitle';

/* ================================================================== */
/* Harness (pola engineeringQto.test.ts)                              */
/* ================================================================== */
let passed = 0;
let failed = 0;
const failures: string[] = [];
function section(letter: string, title: string): void {
  console.log(`\n== ${letter}. ${title} ==`);
}
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, () => assert.strictEqual(actual, expected));
}

/* ================================================================== */
/* Stub gateway AI (pola chatBudgetRabFullAi.test.ts — ringkas)       */
/* ================================================================== */
const STUB_PRICE = 150_000;
const MIN_CTX = {
  navigate: () => {},
  currentMenu: 'chat',
  activeProject: null,
  projects: [],
  projectTotal: null,
} as unknown as ChatActionContext;

function makeStub(fail?: string): ChatRabCompletionDeps {
  return {
    productId: 'EZRAB_AI',
    execute: (async (req: { prompt: string; systemPrompt?: string }) => {
      if (fail) {
        return {
          success: false,
          errorCode: 'MODEL_ERROR',
          stage: 'execute',
          message: fail,
          retryable: true,
        } as never;
      }
      const prompt = String(req.prompt ?? '');
      const isPrice = prompt.includes('ISI HARGA SATUAN');
      const items: Array<{ no: number; unit: string }> = [];
      const re = /- no (\d+): "[^"]*" \(satuan: ([^;]+);/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(prompt)) !== null) {
        items.push({ no: Number(m[1]), unit: m[2].trim() });
      }
      if (isPrice) {
        const fills = items.map(({ no, unit }) => ({
          no,
          unitPrice: STUB_PRICE,
          unit,
          spec: `Spek stub Batch 4 untuk item ${no}`,
          basis: 'Asumsi stub: harga pasar umum untuk uji transfer',
        }));
        return {
          success: true,
          content: JSON.stringify({ fills }),
          structured: null,
          requestId: 'stub-b4',
        } as never;
      }
      const fills = items.map(({ no }) => ({
        no,
        qty: 10,
        formula: '10 x 1',
        basis: 'asumsi stub: 10 satuan tipikal',
      }));
      return {
        success: true,
        content: JSON.stringify({ fills }),
        structured: null,
        requestId: 'stub-b4',
      } as never;
    }) as ChatRabCompletionDeps['execute'],
  };
}

function liveTemplate(id: string): RabTemplate {
  const t = RabTemplateService.getInstance().getTemplateById(id);
  if (!t) throw new Error(`template katalog ${id} tidak ditemukan`);
  return t;
}

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
  /* ================================================================ */
  /* A. Status harga kanonis 7 keadaan (§7.1)                         */
  /* ================================================================ */
  section('A', 'Status harga kanonis — 7 keadaan (§7.1)');
  {
    const base = {
      id: 'x', description: 'Item uji', category: 'Pekerjaan', volume: 2, unit: 'm3',
      unitPrice: 100_000, amount: 200_000, ahspCode: '7.3.(1)',
    };
    check('A1 OFFICIAL_AHSP: RESOLVED + kind resmi + VERIFIED + label RESMI AHSP', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP',
        ahspMappingStatus: 'VERIFIED', priceSourceLabel: 'AHSP 2026',
      });
      assert.equal(s.state, 'OFFICIAL_AHSP');
      assert.equal(s.label, 'RESMI AHSP');
      assert.equal(s.priced, true);
      assert.equal(s.amount, 200_000);
      assert.equal(s.verificationStatus, 'VERIFIED');
      assert.equal(s.assumptionStatus, 'NONE');
      assert.equal(s.source, 'OFFICIAL_AHSP');
      assert.equal(s.sourceLabel, 'AHSP 2026');
      assert.ok(s.provenance.includes('RESMI AHSP') && s.provenance.includes('VERIFIED'), s.provenance);
    });
    check('A2 VERIFIED_DATABASE: RESOLVED tanpa kind eksplisit = harga database terverifikasi', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_RESOLVED', priceSourceKind: undefined,
        ahspMappingStatus: 'VERIFIED',
      });
      assert.equal(s.state, 'VERIFIED_DATABASE');
      assert.equal(s.label, 'HARGA DATABASE');
      assert.equal(transferPriceStatus({ ...base, priceStatus: 'PRICE_RESOLVED', ahspMappingStatus: 'VERIFIED' }), 'PRICE_RESOLVED');
    });
    check('A3 MARKET_REFERENCE: kind pasar + tanggal sumber dipertahankan', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE',
        priceSourceDate: '2026-11-20',
      });
      assert.equal(s.state, 'MARKET_REFERENCE');
      assert.equal(s.label, 'REFERENSI PASAR');
      assert.equal(s.sourceDate, '2026-11-20');
      assert.ok(s.provenance.includes('berlaku 2026-11-20'), s.provenance);
    });
    check('A4 AI_ESTIMATED: label ESTIMASI AI + asumsi + PENDING + NEEDS_VERIFICATION', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION',
        priceSourceLabel: 'Estimasi AI', priceSourceExplanation: 'Asumsi AI: ...',
        verificationStatus: 'NEEDS_VERIFICATION',
      });
      assert.equal(s.state, 'AI_ESTIMATED');
      assert.equal(s.label, 'ESTIMASI AI');
      assert.equal(s.assumptionStatus, 'LABELED_ASSUMPTION');
      assert.equal(s.approvalStatus, 'PENDING');
      assert.equal(s.verificationStatus, 'NEEDS_VERIFICATION');
      assert.equal(transferPriceStatus({ ...base, priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION' }), 'PRICE_ESTIMATED');
    });
    check('A5 MANUAL: PRICE_MANUAL dan kind USER_MANUAL sama-sama MANUAL', () => {
      const a = resolveCanonicalPriceState({ ...base, priceStatus: 'PRICE_MANUAL' });
      const b = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'USER_MANUAL',
      });
      assert.equal(a.state, 'MANUAL');
      assert.equal(a.label, 'MANUAL');
      assert.equal(b.state, 'MANUAL');
      assert.equal(transferPriceStatus({ ...base, priceStatus: 'PRICE_MANUAL' }), 'PRICE_MANUAL');
    });
    check('A6 CUSTOM_COMPOSED: label Harga Komposisi Kustom; transfer TETAP ESTIMATED (S2)', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'CUSTOM_COMPOSED',
      });
      assert.equal(s.state, 'CUSTOM_COMPOSED');
      assert.equal(s.label, 'Harga Komposisi Kustom');
      assert.equal(transferPriceStatus({ ...base, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'CUSTOM_COMPOSED' }), 'PRICE_ESTIMATED');
    });
    check('A7 UNAVAILABLE: UNRESOLVED + unitPrice 0 tidak berharga, jumlah null', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_UNRESOLVED', unitPrice: 0, amount: 0,
      });
      assert.equal(s.state, 'UNAVAILABLE');
      assert.equal(s.label, 'HARGA BELUM TERSEDIA');
      assert.equal(s.priced, false);
      assert.equal(s.amount, null);
    });
    check('A8 sentinel-0 tanpa status = UNAVAILABLE (0 bukan harga valid)', () => {
      const s = resolveCanonicalPriceState({ ...base, unitPrice: 0, amount: 0 });
      assert.equal(s.state, 'UNAVAILABLE');
      assert.equal(s.priced, false);
    });
    check('A9 harga Rp0 EKSPLISIT + RESOLVED + resmi = priced dengan jumlah 0', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP',
        ahspMappingStatus: 'VERIFIED', unitPrice: 0, amount: 0,
      });
      assert.equal(s.state, 'OFFICIAL_AHSP');
      assert.equal(s.priced, true);
      assert.equal(s.amount, 0);
    });
    check('A10 ceiling jujur: klaim RESOLVED tanpa bukti = AI_ESTIMATED (bukan resmi)', () => {
      const s = resolveCanonicalPriceState({ ...base, priceStatus: 'PRICE_RESOLVED' });
      assert.equal(s.state, 'AI_ESTIMATED');
      assert.equal(transferPriceStatus({ ...base, priceStatus: 'PRICE_RESOLVED' }), 'PRICE_ESTIMATED');
    });
    check('A11 mata uang IDR + unit + explanation dipertahankan', () => {
      const s = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION',
        priceSourceExplanation: 'Spek X. Dasar Y.',
      });
      assert.equal(s.currency, 'IDR');
      assert.equal(s.unit, 'm3');
      assert.equal(s.explanation, 'Spek X. Dasar Y.');
    });
    check('A12 approval: DISETUJUI → APPROVED, DITOLAK → REJECTED; state harga tidak berubah', () => {
      const a = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION',
        userDecisionStatus: 'DISETUJUI',
      });
      const b = resolveCanonicalPriceState({
        ...base, priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION',
        userDecisionStatus: 'DITOLAK',
      });
      assert.equal(a.approvalStatus, 'APPROVED');
      assert.equal(b.approvalStatus, 'REJECTED');
      assert.equal(a.state, 'AI_ESTIMATED');
      assert.equal(b.state, 'AI_ESTIMATED');
    });
    check('A13 roundRupiah deterministik (0,5 ke atas)', () => {
      assert.equal(roundRupiah(499_999.5), 500_000);
      assert.equal(roundRupiah(123_456.4), 123_456);
      assert.equal(roundRupiah(100_000), 100_000);
    });
  }

  /* ================================================================ */
  /* B. Transfer Full AI — jalur DIRECT (§7.2)                        */
  /* ================================================================ */
  section('B', 'Transfer estimasi Full AI — jalur DIRECT (§7.2)');
  {
    const r = buildDirectRab('buatkan rab rumah type 70 2 lantai');
    assert.ok(r !== null, 'T70 direct tidak terbangun');
    const direct: DirectRabResult = r!;
    setLastDirectRab(direct);
    const klosetCalc = direct.calc.items.find((i) => i.name.includes('Kloset'));
    assert.ok(klosetCalc, 'item kloset tidak ditemukan di calc T70');

    const before = mapDirectRabPushItems(direct);
    const beforeKloset = before.find((i) => i.description.includes('Kloset'));
    eq('B1a sebelum completion: 25 item terpetakan', before.length, 25);
    check('B1b sebelum completion: kloset UNRESOLVED + tanpa provenance AI', () => {
      assert.ok(beforeKloset, 'kloset tidak ada di payload');
      assert.equal(beforeKloset!.priceStatus, 'PRICE_UNRESOLVED');
      assert.equal(beforeKloset!.priceSourceKind, undefined);
      // Harga tidak ada = field ABSEN (bukan 0 — sentinel-0 bukan harga).
      assert.equal(beforeKloset!.unitPrice, undefined);
    });
    check('B1c sebelum completion: TIDAK ADA item ber-provenance AI', () => {
      assert.ok(before.every((i) => i.priceSourceKind === undefined));
    });
    const previewBefore = buildDirectPushPreview(direct, new Set<string>());
    eq('B1d preview sebelum: aiFillCount 0', previewBefore.aiFillCount, 0);
    // Binding DIBUAT SEBELUM completion (sidik dihitung dari payload
    // saat itu) — dipakai B4a untuk membuktikan completion
    // menginvalidasi pratinjau lama.
    const bindingBefore = createDirectPushApprovalBinding(direct, 'p1');

    const res = await executeBudgetFullAiRab('lengkapi dengan full ai budget 500 juta', MIN_CTX, {
      target: 'direct',
      deps: makeStub(),
    });
    check('B2a completion direct sukses (stub)', () => {
      assert.equal(res.ok, true, res.message.slice(0, 200));
      assert.ok(res.message.includes('Lengkapi dengan Full AI'), res.message.slice(0, 200));
    });
    const completed = getLastDirectRab();
    assert.ok(completed !== null && completed.fullAiCompletion, 'fullAiCompletion tidak terisi');

    const after = mapDirectRabPushItems(completed);
    const afterKloset = after.find((i) => i.description.includes('Kloset'));
    check('B2b kloset terisi sebagai PRICE_ESTIMATED + EZRAB_ASSUMPTION + NEEDS_VERIFICATION', () => {
      assert.ok(afterKloset, 'kloset hilang dari payload sesudah completion');
      assert.equal(afterKloset!.priceStatus, 'PRICE_ESTIMATED');
      assert.equal(afterKloset!.priceSourceKind, 'EZRAB_ASSUMPTION');
      assert.equal(afterKloset!.verificationStatus, 'NEEDS_VERIFICATION');
      assert.equal(afterKloset!.unitPrice, STUB_PRICE);
      assert.equal(afterKloset!.volume, 2);
    });
    check('B2c label Estimasi AI (asumsi) + explanation spek/dasar ikut tercatat', () => {
      assert.equal(afterKloset!.priceSourceLabel, 'Estimasi AI (asumsi)');
      assert.ok((afterKloset!.priceSourceExplanation || '').includes('Spek: Spek stub Batch 4'));
      assert.ok((afterKloset!.priceSourceExplanation || '').includes('Dasar: Asumsi stub'));
    });
    check('B2d item berharga asli TIDAK BERUBAH (harga engine tidak ditimpa isian)', () => {
      for (const b of before) {
        if (b.description.includes('Kloset')) continue;
        const a = after.find((x) => x.code === b.code && x.description === b.description);
        assert.ok(a, `item ${b.description} hilang`);
        assert.equal(a!.unitPrice, b.unitPrice, b.description);
        assert.equal(a!.priceStatus, b.priceStatus, b.description);
        assert.equal(a!.volume, b.volume, b.description);
      }
    });
    check('B2e calc ASLI tidak pernah diubah (kloset tetap tanpa harga di calc)', () => {
      // isPriceValidForTotal bernilai true untuk unitPrice 0 berstatus
      // PRICE_UNAVAILABLE (bukan PRICE_UNRESOLVED) — jadi pin yang
      // tepat adalah harga + status mentahnya, bukan helper itu.
      assert.equal(klosetCalc!.unitPrice, 0);
      assert.equal(klosetCalc!.priceStatus, 'PRICE_UNAVAILABLE');
    });
    check('B2f total chat == total payload: isian Rp150.000 × 2 = +Rp300.000 di keduanya', () => {
      const chatTotal = completed.fullAiCompletion!.summary.estimatedTotal;
      const payloadTotal = after.reduce((s, i) => s + (i.unitPrice ?? 0) * i.volume, 0);
      const beforeTotal = before.reduce((s, i) => s + (i.unitPrice ?? 0) * i.volume, 0);
      // Total chat dijumlah orkestrator dari baris pecahan (debu float
      // ±Rp0,4) — dibandingkan sesudah dibulatkan ke rupiah, seperti
      // yang dirender formatRupiah; payload (yang ditransfer) eksak.
      assert.equal(Math.round(payloadTotal - beforeTotal), 300_000);
      assert.equal(Math.round(chatTotal - beforeTotal), 300_000);
    });

    const previewAfter = buildDirectPushPreview(completed, new Set<string>());
    eq('B3a preview sesudah: aiFillCount 1', previewAfter.aiFillCount, 1);
    check('B3b preview estimatedTotal naik persis Rp300.000', () => {
      assert.equal(previewAfter.estimatedTotal - previewBefore.estimatedTotal, 300_000);
    });
    check('B3c pesan preview menyebut estimasi AI + bukan harga resmi', () => {
      const msg = formatDirectPushPreviewMessage(completed, previewAfter, 'Proyek Uji');
      assert.ok(msg.includes('estimasi AI'), msg);
      assert.ok(msg.includes('bukan harga resmi'), msg);
    });
    check('B3d preview sebelum completion TIDAK menyebut isian AI', () => {
      const msg = formatDirectPushPreviewMessage(direct, previewBefore, 'Proyek Uji');
      assert.ok(!msg.includes('Lengkapi dengan Full AI'), msg);
    });

    check('B4a binding dibuat SEBELUM completion GAGAL sesudah completion (RESULT_CHANGED)', () => {
      const chk = checkDirectPushApprovalBinding(bindingBefore, completed, 'p1');
      assert.equal(chk.ok, false);
      assert.equal(chk.reason, 'RESULT_CHANGED');
    });
    check('B4b binding segar sesudah completion OK', () => {
      const b = createDirectPushApprovalBinding(completed, 'p1');
      const chk = checkDirectPushApprovalBinding(b, completed, 'p1');
      assert.equal(chk.ok, true);
    });
    check('B4c tanpa binding → NO_BINDING (transfer ditolak, tidak ada yang ditulis)', () => {
      const chk = checkDirectPushApprovalBinding(null, completed, 'p1');
      assert.equal(chk.ok, false);
      assert.equal(chk.reason, 'NO_BINDING');
    });
    check('B5 pemetaan deterministik: map dua kali = payload identik', () => {
      assert.equal(JSON.stringify(mapDirectRabPushItems(completed)), JSON.stringify(after));
    });
  }

  /* --- B6–B9: kasus sintetis mapper (volume + proteksi timpa) --- */
  section('B (lanjut)', 'Mapper direct — volume + proteksi timpa (§7.2)');
  {
    const synth = (over: Partial<DirectRabResult>): DirectRabResult => {
      const base: DirectRabResult = {
        mode: 'direct',
        userText: 'sintetis',
        projectInfo: { name: 'Sintetis', location: '', areaM2: 10, floors: 1 },
        generation: {
          workItems: [
            { name: 'Item A', wbsCode: 'A.1', quantity: 0, unit: 'unit', ahspCode: '', workItemId: 'a', category: 'K' },
            { name: 'Item B', wbsCode: 'B.1', quantity: 5, unit: 'm3', ahspCode: '', workItemId: 'b', category: 'K' },
            { name: 'Item C', wbsCode: 'C.1', quantity: 3, unit: 'm2', ahspCode: 'X', workItemId: 'c', category: 'K' },
          ],
        },
        calc: {
          items: [
            { name: 'Item A', wbsCode: 'A.1', volume: 0, unit: 'unit', unitPrice: 0, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED', category: 'K' },
            { name: 'Item B', wbsCode: 'B.1', volume: 5, unit: 'm3', unitPrice: 0, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED', category: 'K' },
            { name: 'Item C', wbsCode: 'C.1', volume: 3, unit: 'm2', unitPrice: 100_000, totalPrice: 300_000, priceStatus: 'PRICE_RESOLVED', category: 'K' },
          ],
          totalDirectCost: 300_000, totalRabCost: 300_000, totalVolume: 8,
          unpricedCount: 2, unpricedItems: [],
        },
        assumptions: [],
      } as unknown as DirectRabResult;
      return { ...base, ...over };
    };
    const completed: DirectRabResult = synth({
      fullAiCompletion: {
        items: [
          { name: 'Item A', wbsCode: 'A.1', volume: 4, unit: 'unit', unitPrice: 50_000, totalPrice: 200_000, priceStatus: 'PRICE_ESTIMATED', category: 'K' },
          { name: 'Item B', wbsCode: 'B.1', volume: 8, unit: 'm3', unitPrice: 20_000, totalPrice: 160_000, priceStatus: 'PRICE_ESTIMATED', category: 'K' },
          { name: 'Item C', wbsCode: 'C.1', volume: 3, unit: 'm2', unitPrice: 999_000, totalPrice: 2_997_000, priceStatus: 'PRICE_ESTIMATED', category: 'K' },
        ],
        summary: {
          filledCount: 2, totalAfterCompletion: 660_000,
          filledDetails: [
            { index: 0, description: 'Item A', unitPrice: 50_000, unit: 'unit', spec: 'Spek A', basis: 'Dasar A' },
            { index: 1, description: 'Item B', unitPrice: 20_000, unit: 'm3', spec: 'Spek B', basis: 'Dasar B' },
            { index: 2, description: 'Item C', unitPrice: 999_000, unit: 'm2', spec: 'Spek C', basis: 'Dasar C' },
          ],
        },
      } as never,
    });
    const payload = mapDirectRabPushItems(completed);
    check('B6 item qty 0 diselamatkan volume completion (A: vol 4, harga terisi)', () => {
      const a = payload.find((i) => i.description === 'Item A');
      assert.ok(a, 'Item A hilang');
      assert.equal(a!.volume, 4);
      assert.equal(a!.unitPrice, 50_000);
      assert.equal(a!.priceStatus, 'PRICE_ESTIMATED');
    });
    check('B7 volume completion menggantikan volume engine bila vol engine == qty kerja (B: 5→8)', () => {
      const b = payload.find((i) => i.description === 'Item B');
      assert.ok(b, 'Item B hilang');
      assert.equal(b!.volume, 8);
      assert.equal(b!.unitPrice, 20_000);
    });
    check('B8 harga engine ASLI tidak pernah ditimpa isian (C: tetap Rp100.000 RESOLVED)', () => {
      const c = payload.find((i) => i.description === 'Item C');
      assert.ok(c, 'Item C hilang');
      assert.equal(c!.unitPrice, 100_000);
      assert.equal(c!.priceStatus, 'PRICE_RESOLVED');
      assert.equal(c!.priceSourceKind, undefined);
      assert.equal(c!.priceSourceLabel, undefined);
    });
    check('B9 tanpa completion, item qty 0 tetap dilewati (perilaku lama)', () => {
      const plain = mapDirectRabPushItems(synth({}));
      assert.ok(!plain.some((i) => i.description === 'Item A'));
      eq('B9b dua item lainnya hadir', plain.length, 2);
    });
  }

  /* ================================================================ */
  /* C. Transfer Full AI — jalur UNIVERSAL (§7.2)                     */
  /* ================================================================ */
  section('C', 'Transfer estimasi Full AI — jalur UNIVERSAL (§7.2)');
  {
    const draft = buildGudangDraft('800 juta');
    const nulled = nullPricesWhere(draft, (it) => it.unit === 'm2');
    eq('C0 dua item m2 dikosongkan harga', nulled, 2);
    setLastUniversalDraft(draft);

    const res = await executeBudgetFullAiRab('', MIN_CTX, {
      target: 'universal',
      deps: makeStub(),
    });
    check('C1a completion universal sukses (stub)', () => {
      assert.equal(res.ok, true, res.message.slice(0, 200));
      assert.ok(res.message.includes('Lengkapi dengan Full AI'), res.message.slice(0, 200));
    });
    // Write-back memutasi objek draft yang sama (pola §4
    // chatBudgetRabFullAi) — `draft` kini membawa isian.
    const done = draft;
    const eff = effectiveItems(done);
    const filled = eff.filter((i) => i.priceSourceKind === 'EZRAB_ASSUMPTION');
    eq('C1b dua item terisi sebagai EZRAB_ASSUMPTION', filled.length, 2);
    check('C1c isian = PRICE_ESTIMATED + NEEDS_VERIFICATION + label + explanation', () => {
      for (const f of filled) {
        assert.equal(f.priceStatus, 'PRICE_ESTIMATED');
        assert.equal(f.verificationStatus, 'NEEDS_VERIFICATION');
        assert.equal(f.unitPrice, STUB_PRICE);
        assert.equal(f.priceSourceLabel, 'Estimasi AI (asumsi)');
        assert.ok((f.priceSourceExplanation || '').includes('Spek stub Batch 4'));
        assert.ok((f.priceSourceExplanation || '').includes('Dasar: Asumsi stub'));
      }
    });

    const preview = buildPushPreview(done);
    check('C2a preview membawa estimasi (total mencakup isian)', () => {
      assert.ok(preview.estimatedTotal > 0);
      const filledSum = filled.reduce((s, f) => s + (f.volume ?? 0) * (f.unitPrice ?? 0), 0);
      assert.ok(preview.estimatedTotal >= filledSum);
    });
    const payload = buildPushPayload(done, 'p1');
    check('C2b payload mempertahankan provenance estimasi', () => {
      const pFilled = payload.filter((p) => p.priceSourceKind === 'EZRAB_ASSUMPTION');
      assert.equal(pFilled.length, 2);
      for (const p of pFilled) {
        assert.equal(p.priceStatus, 'PRICE_ESTIMATED');
        assert.equal(p.verificationStatus, 'NEEDS_VERIFICATION');
        assert.equal(p.priceSourceLabel, 'Estimasi AI (asumsi)');
        assert.ok((p.priceSourceExplanation || '').includes('Spek stub Batch 4'));
      }
    });
    check('C2c transferPriceStatus tidak pernah mengangkat estimasi jadi RESOLVED', () => {
      for (const p of payload.filter((x) => x.priceSourceKind === 'EZRAB_ASSUMPTION')) {
        assert.equal(transferPriceStatus(p), 'PRICE_ESTIMATED');
      }
    });

    const records = payload.map((p) => createRabItemRecord(p as UniversalPushPayloadItem, 'p1', 0));
    check('C3a record spreadsheet mempertahankan provenance estimasi', () => {
      const rFilled = records.filter((r) => r.priceSourceKind === 'EZRAB_ASSUMPTION');
      assert.equal(rFilled.length, 2);
      for (const r of rFilled) {
        assert.equal(r.priceStatus, 'PRICE_ESTIMATED');
        assert.equal(r.verificationStatus, 'NEEDS_VERIFICATION');
        assert.equal(r.priceSourceLabel, 'Estimasi AI (asumsi)');
        assert.equal(r.unitPrice, STUB_PRICE);
      }
    });
    check('C3b engine menghitung estimasi dalam directCost (== total preview)', () => {
      const engine = UnifiedProjectEngine.recalculateCostSummary(records as never, {
        overheadPercent: 0, profitPercent: 0, taxPercent: 11,
      } as never);
      assert.equal(engine.directCost, preview.estimatedTotal);
    });

    /* C4: harga manual menang atas completion. */
    const draft2 = buildGudangDraft('800 juta');
    const target = effectiveItems(draft2).find((i) => i.unit === 'm2');
    assert.ok(target, 'target manual tidak ditemukan');
    const manual = setDraftItemManualPrice(draft2, target.id, 999_999, 'harga dari supplier');
    assert.ok(manual.ok && manual.draft, manual.message);
    nullPricesWhere(manual.draft!, (it) => it.unit === 'm2');
    setLastUniversalDraft(manual.draft!);
    const res2 = await executeBudgetFullAiRab('', MIN_CTX, {
      target: 'universal',
      deps: makeStub(),
    });
    check('C4 harga manual menang: item manual tetap 999.999 MANUAL (tidak ditimpa AI)', () => {
      assert.equal(res2.ok, true, res2.message.slice(0, 200));
      const afterManual = effectiveItems(manual.draft!).find((i) => i.id === target.id);
      assert.ok(afterManual, 'item manual hilang');
      assert.equal(afterManual!.unitPrice, 999_999);
      assert.equal(afterManual!.priceStatus, 'PRICE_MANUAL');
      assert.equal(afterManual!.priceSourceKind, 'USER_MANUAL');
    });

    /* C5–C6: DITOLAK / DISETUJUI. */
    const f1 = filled[0];
    const f2 = filled[1];
    const rejected = decideDraftItemAssumption(done, f1.id, 'DITOLAK');
    assert.ok(rejected.ok && rejected.draft, rejected.message);
    const afterReject = effectiveItems(rejected.draft!).find((i) => i.id === f1.id);
    check('C5a DITOLAK: nilai estimasi TIDAK ditimpa/dihapus (marker saja)', () => {
      assert.ok(afterReject, 'item ditolak hilang');
      assert.equal(afterReject!.unitPrice, STUB_PRICE);
      assert.equal(afterReject!.priceStatus, 'PRICE_ESTIMATED');
      assert.equal(afterReject!.userDecisionStatus, 'DITOLAK');
    });
    check('C5b DITOLAK: payload tetap membawa harga + marker DITOLAK (semantik P6)', () => {
      const p = buildPushPayload(rejected.draft!, 'p1').find(
        (x) => x.description === formatWorkItemTitle(f1.description),
      );
      assert.ok(p, 'item ditolak tidak ada di payload');
      assert.equal(p!.unitPrice, STUB_PRICE);
      assert.equal(p!.userDecisionStatus, 'DITOLAK');
    });
    const approved = decideDraftItemAssumption(rejected.draft!, f2.id, 'DISETUJUI');
    assert.ok(approved.ok && approved.draft, approved.message);
    check('C6 ringkasan approval: 1 DISETUJUI, 1 DITOLAK, 0 pending', () => {
      const s = summarizeEstimateApprovals(effectiveItems(approved.draft!));
      assert.equal(s.approved, 1);
      assert.equal(s.rejected, 1);
      assert.equal(s.pending, 0);
      assert.equal(s.total, 2);
      assert.equal(s.totalsByStatus.APPROVED, (f2.volume ?? 0) * STUB_PRICE);
      assert.equal(s.rejectedDescriptions.length, 1);
    });

    /* C7: persistensi round-trip (snapshot provenance B4). */
    const saved = saveDraft({ draft: done, projectId: 'p1', savedBy: 'manual' });
    check('C7a saveDraft sukses', () => assert.equal(saved.ok, true, (saved as any).error));
    const loaded = loadDraft('p1');
    check('C7b round-trip: isian bertahan dengan status/kind/label', () => {
      assert.equal(loaded.ok, true, (loaded as any).error ?? 'loadDraft gagal');
      if (!loaded.ok) return;
      const lFilled = effectiveItems(loaded.draft).filter((i) => i.priceSourceKind === 'EZRAB_ASSUMPTION');
      assert.equal(lFilled.length, 2);
      for (const f of lFilled) {
        assert.equal(f.priceStatus, 'PRICE_ESTIMATED');
        assert.equal(f.unitPrice, STUB_PRICE);
        assert.equal(f.priceSourceLabel, 'Estimasi AI (asumsi)');
      }
    });
    check('C7c snapshot provenance: PRICE_ESTIMATED TIDAK dilipat ke RESOLVED (bug B4)', () => {
      const rec = peekPersistedDraft('p1');
      assert.ok(rec, 'tidak ada record tersimpan');
      const prov = rec!.priceProvenance.filter((p) => p.priceStatus === 'PRICE_ESTIMATED');
      assert.equal(prov.length, 2);
    });

    /* C8: AI gagal → tidak ada isian, item asli utuh. */
    const draft3 = buildGudangDraft('800 juta');
    nullPricesWhere(draft3, (it) => it.unit === 'm2');
    setLastUniversalDraft(draft3);
    const res3 = await executeBudgetFullAiRab('', MIN_CTX, {
      target: 'universal',
      deps: makeStub('gateway down (stub)'),
    });
    check('C8 AI gagal: tidak ada isian, harga tetap kosong (tidak dikarang)', () => {
      assert.equal(res3.ok, true, res3.message.slice(0, 200));
      const eff3 = effectiveItems(draft3);
      assert.ok(eff3.every((i) => i.priceSourceKind !== 'EZRAB_ASSUMPTION'));
      assert.ok(eff3.filter((i) => !isPriceValidForTotal(i)).length >= 2);
    });
  }

  await main2();
}

async function main2(): Promise<void> {
  /* ================================================================ */
  /* D. Rekonsiliasi finansial (§7.3/§7.4)                           */
  /* ================================================================ */
  section('D', 'Rekonsiliasi finansial (§7.3/§7.4)');
  {
    const items = [
      { id: 'o', description: 'Resmi', category: 'A', volume: 2, unit: 'm3', unitPrice: 100_000, amount: 200_000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspMappingStatus: 'VERIFIED', verificationStatus: 'VERIFIED' },
      { id: 'd', description: 'Database', category: 'A', volume: 1, unit: 'm2', unitPrice: 50_000, amount: 50_000, priceStatus: 'PRICE_RESOLVED', ahspMappingStatus: 'VERIFIED', verificationStatus: 'VERIFIED' },
      { id: 'm', description: 'Pasar', category: 'A', volume: 3, unit: 'kg', unitPrice: 10_000, amount: 30_000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' },
      { id: 'a', description: 'Estimasi AI', category: 'B', volume: 4, unit: 'unit', unitPrice: 25_000, amount: 100_000, priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION', priceSourceLabel: 'Estimasi AI', verificationStatus: 'NEEDS_VERIFICATION' },
      { id: 'u', description: 'Manual', category: 'B', volume: 1, unit: 'ls', unitPrice: 75_000, amount: 75_000, priceStatus: 'PRICE_MANUAL', priceSourceKind: 'USER_MANUAL' },
      { id: 'c', description: 'Komposisi', category: 'B', volume: 2, unit: 'm', unitPrice: 15_000, amount: 30_000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'CUSTOM_COMPOSED' },
      { id: 'n', description: 'Tanpa harga', category: 'B', volume: 5, unit: 'm3', unitPrice: 0, amount: 0, priceStatus: 'PRICE_UNRESOLVED' },
    ] as never[];
    const rec = reconcileProjectFinancials(items, { overheadPercent: 0, profitPercent: 0 });
    check('D1a tiap item masuk tepat SATU ember', () => {
      const counts = Object.values(rec.buckets).reduce((s, b) => s + b.count, 0);
      assert.equal(counts, 7);
    });
    check('D1b ember terisi dengan benar', () => {
      assert.equal(rec.buckets.OFFICIAL_AHSP.total, 200_000);
      assert.equal(rec.buckets.VERIFIED_DATABASE.total, 50_000);
      assert.equal(rec.buckets.MARKET_REFERENCE.total, 30_000);
      assert.equal(rec.buckets.AI_ESTIMATED.total, 100_000);
      assert.equal(rec.buckets.MANUAL.total, 75_000);
      assert.equal(rec.buckets.CUSTOM_COMPOSED.total, 30_000);
      assert.equal(rec.buckets.UNAVAILABLE.count, 1);
      assert.equal(rec.buckets.UNAVAILABLE.total, 0);
    });
    eq('D1c pricedTotal = Σ ember berharga = 485.000', rec.pricedTotal, 485_000);
    check('D1d item tanpa harga DIKECUALIKAN dari total (bukan Rp0 gratis)', () => {
      assert.equal(rec.unpricedCount, 1);
      assert.equal(rec.isPartial, true);
      assert.ok(rec.warnings.some((w) => w.includes('PARSIAL') && w.includes('Tanpa harga')), rec.warnings.join(' | '));
    });
    check('D2 pricedTotal == directCost engine kanonis', () => {
      assert.equal(rec.summary.directCost, 485_000);
      assert.equal(rec.pricedTotal, rec.summary.directCost);
      assert.equal(rec.storedSummaryAgrees, true);
    });
    check('D3 estimasi tanpa approval TETAP dihitung di pricedTotal + ditandai pending', () => {
      assert.equal(rec.pendingEstimateCount, 1);
      assert.equal(rec.rejectedEstimateCount, 0);
      assert.ok(rec.warnings.some((w) => w.includes('menunggu review')), rec.warnings.join(' | '));
    });
    check('D4 rekonsiliasi deterministik (dua kali = hasil identik)', () => {
      assert.equal(
        JSON.stringify(reconcileProjectFinancials(items, { overheadPercent: 0, profitPercent: 0 })),
        JSON.stringify(rec),
      );
    });
    check('D5 rounding: vol 1,5 × 333.333 = 500.000 (bukan 499.999,5)', () => {
      const amt = reconciliationLineAmount({
        volume: 1.5, unitPrice: 333_333, priceStatus: 'PRICE_RESOLVED',
        priceSourceKind: 'OFFICIAL_AHSP', ahspMappingStatus: 'VERIFIED',
      } as never);
      assert.equal(amt, 500_000);
    });
    check('D6 jumlah tersimpan dipakai mentah (paritas engine)', () => {
      const amt = reconciliationLineAmount({
        volume: 2, unitPrice: 100_000, amount: 199_999,
        priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP',
        ahspMappingStatus: 'VERIFIED',
      } as never);
      assert.equal(amt, 199_999);
    });
  }

  /* D7–D11: O&P / pajak / historis / default. */
  {
    const stored = [
      { id: 'h', description: 'HSP', category: 'A', volume: 1, unit: 'ls', unitPrice: 1_000_000, amount: 1_000_000, priceStatus: 'PRICE_RESOLVED', priceCostBasis: 'HSP' },
      { id: 'd', description: 'Langsung', category: 'A', volume: 1, unit: 'ls', unitPrice: 1_000_000, amount: 1_000_000, priceStatus: 'PRICE_RESOLVED', priceCostBasis: 'DIRECT_COST' },
    ] as never[];
    check('D7 HSP dikecualikan dari basis O&P (overhead 10% dari Rp1jt, bukan Rp2jt)', () => {
      const s = UnifiedProjectEngine.recalculateCostSummary(stored, {
        overheadPercent: 10, profitPercent: 5, taxPercent: 11,
      } as never);
      assert.equal(s.directCost, 2_000_000);
      assert.equal(s.overheadAmount, 100_000);
      assert.equal(s.profitAmount, 50_000);
    });
    check('D8 pajak opt-in: tanpa flag = pajak 0; dengan PPN = 11% dari subtotal', () => {
      const off = UnifiedProjectEngine.recalculateCostSummary(stored, {
        overheadPercent: 10, profitPercent: 5, taxPercent: 11,
      } as never);
      assert.equal(off.taxAmount, 0);
      assert.equal(off.pphAmount, 0);
      const on = UnifiedProjectEngine.recalculateCostSummary(stored, {
        overheadPercent: 10, profitPercent: 5, taxPercent: 11, ppnEnabled: true,
      } as never);
      assert.equal(on.taxAmount, 236_500);
    });
    check('D9 konfigurasi historis dipertahankan (10/5/10 + PPN + PPh TIDAK ditulis ulang)', () => {
      const s = UnifiedProjectEngine.recalculateCostSummary(stored, {
        overheadPercent: 10, profitPercent: 5, taxPercent: 10,
        ppnEnabled: true, pphPercent: 2, pphEnabled: true,
      } as never);
      assert.equal(s.overheadPercent, 10);
      assert.equal(s.profitPercent, 5);
      assert.equal(s.taxPercent, 10);
      assert.equal(s.pphPercent, 2);
      assert.equal(s.ppnEnabled, true);
      assert.equal(s.pphEnabled, true);
    });
    check('D10 proyek baru: default 0% overhead / 0% profit / pajak mati', () => {
      const s = UnifiedProjectEngine.recalculateCostSummary(stored);
      assert.equal(s.overheadPercent, 0);
      assert.equal(s.profitPercent, 0);
      assert.equal(s.overheadAmount, 0);
      assert.equal(s.profitAmount, 0);
      assert.equal(s.ppnEnabled, false);
      assert.equal(s.taxAmount, 0);
      assert.equal(s.grandTotal, 2_000_000);
    });
    check('D11 reconcileProjectFinancials: storedSummary tidak cocok → storedSummaryAgrees false + diskrepansi', () => {
      const r = reconcileProjectFinancials(stored as never, { overheadPercent: 0, profitPercent: 0 }, {
        directCost: 999,
      } as never);
      assert.equal(r.storedSummaryAgrees, false);
      assert.ok(r.summaryDiscrepancies.some((d) => d.includes('directCost')), r.summaryDiscrepancies.join(' | '));
    });
  }

  /* D12–D14: subtotal scope + estimatedTotal + volume 1.0 (draft nyata). */
  {
    const built = buildUniversalDraft(
      'buatkan RAB perumahan 20 unit, jalan beton 1 km, drainase 500 m, dinding penahan 100 m',
    );
    assert.equal(built.kind, 'draft');
    const draft = built.draft;
    const eff = effectiveItems(draft);
    eq('D12a draft campuran: 4 part', draft.parts.length, 4);
    check('D12b subtotal scope merekonsiliasi dengan total proyek', () => {
      const byScope = new Map<string, typeof eff>();
      for (const it of eff) {
        const key = (it as any).__partScope ?? 'tanpa-scope';
        if (!byScope.has(key)) byScope.set(key, []);
        byScope.get(key)!.push(it);
      }
      const scopes = Array.from(byScope.entries()).map(([id, items]) => ({
        scopeId: id,
        label: id,
        subtotal: totalsFromItems(items).estimatedTotal,
        itemCount: items.length,
        unpricedCount: items.filter((i) => !isPriceValidForTotal(i)).length,
      }));
      const totals = computeTotals(draft);
      const r = reconcileScopeSubtotals(scopes, totals.estimatedTotal);
      assert.equal(r.agrees, true, `difference ${r.difference}`);
      assert.equal(r.sumOfScopes, totals.estimatedTotal);
    });
    check('D13 estimatedTotal TIDAK dihitung ganda (== Σ komponen, bukan Σ + komponen)', () => {
      const t = computeTotals(draft);
      assert.equal(t.estimatedTotal, t.verifiedTotal + t.databaseTotal + t.marketTotal + t.manualTotal);
    });
    check('D14 item draft nyata: jumlah baris == vol × harga (dibulatkan ke rupiah)', () => {
      const priced = eff.filter((i) => isPriceValidForTotal(i));
      assert.ok(priced.length > 0, 'tidak ada item berharga di draft campuran');
      for (const it of priced) {
        assert.equal(
          reconciliationLineAmount(it as never),
          Math.round((it.volume ?? 0) * (it.unitPrice ?? 0)),
        );
      }
    });
  }

  await main3();
}

async function main3(): Promise<void> {
  /* ================================================================ */
  /* E. Sinkronisasi spreadsheet (§7.5)                               */
  /* ================================================================ */
  section('E', 'Sinkronisasi spreadsheet (§7.5)');
  {
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    setLastUniversalDraft(draft);
    const res = await executeBudgetFullAiRab('', MIN_CTX, {
      target: 'universal',
      deps: makeStub(),
    });
    assert.equal(res.ok, true, res.message.slice(0, 200));
    const done = draft;
    const payload = buildPushPayload(done, 'p1');
    const records = payload.map((p) => createRabItemRecord(p as UniversalPushPayloadItem, 'p1', 0));
    const project = {
      id: 'p1', name: 'Proyek Uji B4', currentVersion: 'Rev 01',
      sections: [], rabItems: records, costSummary: {},
    } as unknown as Project;
    const sections = UnifiedProjectEngine.normalizeSections(project, records as never);
    const flat = sections.flatMap((s) => (s.items || []) as any[]);

    eq('E1a normalisasi: semua item payload hadir di seksi', flat.length, payload.length);
    check('E1b volumeBasis diteruskan ke seksi (perbaikan B4 §7.5)', () => {
      const withBasis = flat.filter((x) => x.volumeBasis != null);
      assert.ok(withBasis.length > 0, 'tidak ada item seksi membawa volumeBasis');
      const recordBasis = records.filter((r) => (r as any).volumeBasis != null).length;
      assert.equal(withBasis.length, recordBasis);
    });
    check('E1c provenance estimasi bertahan sampai seksi', () => {
      const est = flat.filter((x) => x.priceSourceKind === 'EZRAB_ASSUMPTION');
      assert.equal(est.length, 2);
      assert.ok(est.every((x) => x.priceStatus === 'PRICE_ESTIMATED'));
      assert.ok(est.every((x) => x.verificationStatus === 'NEEDS_VERIFICATION'));
    });
    check('E1d Σ subtotal seksi == directCost engine', () => {
      const subtotalSum = sections.reduce((a, s) => a + (s.subtotal || 0), 0);
      const engine = UnifiedProjectEngine.recalculateCostSummary(records as never, {
        overheadPercent: 0, profitPercent: 0, taxPercent: 11,
      } as never);
      assert.equal(subtotalSum, engine.directCost);
    });

    check('E2 edit yang disetujui memicu rekalkulasi kanonis (delta harga = delta total)', () => {
      const edited = records.map((r) => ({ ...r }));
      const first = edited.find((r) => r.priceStatus !== 'PRICE_UNRESOLVED');
      assert.ok(first, 'tidak ada item berharga untuk diedit');
      const before = UnifiedProjectEngine.recalculateCostSummary(records as never, {
        overheadPercent: 0, profitPercent: 0, taxPercent: 11,
      } as never);
      first!.unitPrice = (first!.unitPrice ?? 0) + 10_000;
      first!.amount = (first!.volume ?? 0) * first!.unitPrice;
      const after = UnifiedProjectEngine.recalculateCostSummary(edited as never, {
        overheadPercent: 0, profitPercent: 0, taxPercent: 11,
      } as never);
      assert.equal(after.directCost - before.directCost, (first!.volume ?? 0) * 10_000);
    });

    check('E3 transfer BLOCKED: validateTransfer menolak + buildPushPayload melempar + data asli utuh', () => {
      const blocked = JSON.parse(JSON.stringify(done)) as UniversalDraft;
      blocked.parts[0].generation.generationStatus = 'INCOMPLETE_MISSING_PARAMS';
      blocked.parts[0].generation.missingRequiredParams = ['luas bangunan'];
      const readiness = draftReadiness(blocked);
      assert.equal(readiness.status, 'BLOCKED');
      const v = validateTransfer(blocked, 'p1');
      assert.equal(v.allowed, false);
      assert.throws(() => buildPushPayload(blocked, 'p1'));
      // Draft asli tidak tersentuh (deep copy discipline).
      assert.notEqual(done.parts[0].generation.generationStatus, 'INCOMPLETE_MISSING_PARAMS');
      assert.equal(validateTransfer(done, 'p1').allowed, true);
    });

    check('E4 retry: dedupePayload menolak penyisipan ganda (identitas stabil)', () => {
      const first = dedupePushPayload(payload, []);
      assert.equal(first.newItems.length, payload.length);
      assert.equal(first.dupCount, 0);
      const retry = dedupePushPayload(payload, payload as never);
      assert.equal(retry.newItems.length, 0);
      assert.equal(retry.dupCount, payload.length);
      const internal = dedupePushPayload([...payload, ...payload], []);
      assert.equal(internal.newItems.length, payload.length);
      assert.equal(internal.dupCount, payload.length);
    });

    check('E5 transfer receipt: draft yang sudah ditransfer tidak bisa ditransfer ulang', () => {
      const transferred = JSON.parse(JSON.stringify(done)) as UniversalDraft;
      (transferred as any).lastTransfer = { projectId: 'p1', version: transferred.version };
      const v = validateTransfer(transferred, 'p1');
      assert.equal(v.allowed, false);
      assert.equal(v.duplicate, true);
    });

    check('E6 identitas stabil: buildPushPayload dua kali = payload identik', () => {
      assert.equal(JSON.stringify(buildPushPayload(done, 'p1')), JSON.stringify(payload));
    });
  }

  /* ================================================================ */
  /* F. Integritas ekspor (§7.6)                                      */
  /* ================================================================ */
  section('F', 'Integritas ekspor (§7.6)');
  {
    const official = { description: 'Resmi', priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', verificationStatus: 'VERIFIED', unitPrice: 100_000 };
    const market = { description: 'Pasar', priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE', verificationStatus: 'VERIFIED', unitPrice: 50_000 };
    const manual = { description: 'Manual', priceStatus: 'PRICE_MANUAL', priceSourceKind: 'USER_MANUAL', unitPrice: 75_000 };
    const ai = { description: 'Estimasi AI', priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'EZRAB_ASSUMPTION', priceSourceLabel: 'Estimasi AI', verificationStatus: 'NEEDS_VERIFICATION', unitPrice: 25_000 };
    const missing = { description: 'Tanpa harga', priceStatus: 'PRICE_UNRESOLVED', unitPrice: 0 };

    check('F1a Excel: label sumber per keadaan (RESMI/REFERENSI/MANUAL/ASUMSI/BELUM TERSEDIA)', () => {
      assert.equal(buildExcelSourceText(official as never), 'RESMI AHSP');
      assert.ok((buildExcelSourceText(market as never) || '').includes('REFERENSI PASAR'));
      assert.ok((buildExcelSourceText(manual as never) || '').includes('INPUT MANUAL'));
      assert.ok((buildExcelSourceText(ai as never) || '').includes('ASUMSI — PERLU VERIFIKASI'));
      assert.ok((buildExcelSourceText(missing as never) || '').includes('HARGA BELUM TERSEDIA'));
    });
    check('F1b PDF: anotasi per keadaan (resmi = tanpa anotasi; sisanya ditandai)', () => {
      const ann = [official, market, manual, ai, missing].map((i) => buildPdfSourceAnnotations(i as never));
      assert.equal(ann[0], '', 'item resmi tidak butuh anotasi');
      assert.ok(ann[1].includes('REFERENSI PASAR'), ann[1]);
      assert.ok(ann[2].includes('INPUT MANUAL'), ann[2]);
      assert.ok(ann[3].includes('ASUMSI — PERLU VERIFIKASI'), ann[3]);
      assert.ok(ann[4].includes('Harga belum tersedia'), ann[4]);
    });

    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    setLastUniversalDraft(draft);
    const res = await executeBudgetFullAiRab('', MIN_CTX, {
      target: 'universal',
      deps: makeStub(),
    });
    assert.equal(res.ok, true, res.message.slice(0, 200));
    const payload = buildPushPayload(draft, 'p1');
    const records = payload.map((p) => createRabItemRecord(p as UniversalPushPayloadItem, 'p1', 0));
    const project = {
      id: 'p1', name: 'Proyek Uji B4', currentVersion: 'Rev 01',
      sections: [], rabItems: records, costSummary: {},
    } as unknown as Project;
    const sections = UnifiedProjectEngine.normalizeSections(project, records as never);
    const costs = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections as never);
    const summary = summarizeExportSections(sections as any);
    const snapshot = freezeRabSnapshot(project, sections as never, costs, summary, {
      actor: 'b4-test',
      createdAt: '2026-11-23T00:00:00.000Z',
    });
    check('F2 snapshot membeku: volumeBasis + provenance bertahan', () => {
      const flat = snapshot.sections.flatMap((s) => (s.items || []) as any[]);
      assert.ok(flat.some((x) => x.volumeBasis != null), 'volumeBasis hilang di snapshot');
      const est = flat.filter((x) => x.priceSourceKind === 'EZRAB_ASSUMPTION');
      assert.equal(est.length, 2);
      assert.ok(est.every((x) => x.priceStatus === 'PRICE_ESTIMATED'));
    });

    check('F3a laporan ekspor: proyek lengkap + resmi-penuh BOLEH diklaim final', () => {
      const full = [
        { description: 'A', priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', verificationStatus: 'VERIFIED', volume: 1, unit: 'm3', unitPrice: 100_000, amount: 100_000, category: 'A' },
      ];
      const r = buildExportIntegrityReport(
        [{ code: 'A', name: 'Seksi A', items: full as never }],
        { directCost: 100_000 } as never,
      );
      assert.equal(r.isPartial, false);
      assert.equal(r.mayClaimFinal, true);
      assert.equal(r.mayClaimFullyOfficial, true);
      assert.equal(r.sectionsAgreeWithSummary, true);
    });
    check('F3b laporan ekspor: proyek PARSIAL TIDAK BOLEH diklaim final', () => {
      const partial = [
        { description: 'A', priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', verificationStatus: 'VERIFIED', volume: 1, unit: 'm3', unitPrice: 100_000, amount: 100_000, category: 'A' },
        { description: 'B', priceStatus: 'PRICE_UNRESOLVED', volume: 2, unit: 'm3', unitPrice: 0, amount: 0, category: 'A' },
      ];
      const r = buildExportIntegrityReport(
        [{ code: 'A', name: 'Seksi A', items: partial as never }],
        { directCost: 100_000 } as never,
      );
      assert.equal(r.isPartial, true);
      assert.equal(r.mayClaimFinal, false);
      assert.equal(r.mayClaimFullyOfficial, false);
      assert.ok(r.totalNote.includes('TOTAL PARSIAL'), r.totalNote);
      assert.ok(r.warnings.some((w) => w.includes('belum memiliki harga')), r.warnings.join(' | '));
    });
    check('F3c laporan ekspor: estimasi tanpa label ditandai (tidak boleh lolos diam-diam)', () => {
      const unlabeled = [
        { description: 'X', priceStatus: 'PRICE_ESTIMATED', volume: 1, unit: 'm3', unitPrice: 10_000, amount: 10_000, category: 'A' },
      ];
      const r = buildExportIntegrityReport(
        [{ code: 'A', name: 'Seksi A', items: unlabeled as never }],
        { directCost: 10_000 } as never,
      );
      assert.equal(r.unlabeledEstimates.length, 1);
      assert.equal(r.mayClaimFullyOfficial, false);
    });
    check('F3d laporan ekspor proyek gudang terisi: seksi cocok dengan ringkasan, ada estimasi', () => {
      const r = buildExportIntegrityReport(
        sections.map((s) => ({ code: s.code, name: s.name, items: s.items as never })),
        costs as never,
      );
      assert.equal(r.sectionsAgreeWithSummary, true);
      assert.equal(r.buckets.AI_ESTIMATED.count, 2);
      assert.equal(r.mayClaimFullyOfficial, false);
    });
  }

  /* ================================================================ */
  /* G. Gerbang transfer risiko teknik (§8)                           */
  /* ================================================================ */
  section('G', 'Gerbang transfer risiko teknik (§8, handoff Batch 3)');
  {
    const lowDraft = buildGudangDraft('800 juta');
    const low = assessDraftEngineering(lowDraft);
    check('G1 risiko LOW/MODERATE: transfer diizinkan tanpa review', () => {
      assert.ok(low.level === 'LOW' || low.level === 'MODERATE', low.level);
      const g = checkEngineeringTransferGate(low, null, {
        version: lowDraft.version,
        fingerprint: draftFingerprint(lowDraft),
      });
      assert.equal(g.allowed, true);
      assert.equal(g.requiresReview, false);
    });

    const wallDraft = buildUniversalDraft('dinding penahan tanah 100 m');
    assert.equal(wallDraft.kind, 'draft');
    const wall = assessDraftEngineering(wallDraft.draft);
    eq('G2a retaining 100 m tanpa tinggi = HIGH', wall.level, 'HIGH');
    const wallCurrent = {
      version: wallDraft.draft.version,
      fingerprint: draftFingerprint(wallDraft.draft),
    };
    check('G2b HIGH tanpa review → transfer DIBLOKIR gerbang', () => {
      // Pin semantik: draft nyata ini adalah kasus NEEDS_CLARIFICATION
      // (HIGH dengan humanReviewRequired=false) — gerbang WAJIB tetap
      // memblokir karena LEVEL-nya HIGH (bukan karena flag-nya).
      assert.equal(wall.humanReviewRequired, false);
      const g = checkEngineeringTransferGate(wall, null, wallCurrent);
      assert.equal(g.allowed, false);
      assert.equal(g.requiresReview, true);
      assert.ok(g.reasons.join(' ').includes('review'), g.reasons.join(' | '));
    });
    const review: EngineeringReviewRecord = {
      draftVersion: wallDraft.draft.version,
      draftFingerprint: wallCurrent.fingerprint,
      reviewedBy: 'Insinyur Uji',
      reviewedAt: new Date().toISOString(),
    };
    check('G3 HIGH + review terikat (versi + sidik cocok) → diizinkan', () => {
      const g = checkEngineeringTransferGate(wall, review, wallCurrent);
      assert.equal(g.allowed, true);
      assert.equal(g.reviewApplied?.reviewedBy, 'Insinyur Uji');
    });
    check('G4a review BASI (versi lama) → tetap diblokir', () => {
      const stale = { ...review, draftVersion: review.draftVersion + 1 };
      assert.equal(checkEngineeringTransferGate(wall, stale, wallCurrent).allowed, false);
    });
    check('G4b review untuk draft LAIN (sidik beda) → tetap diblokir', () => {
      const other = { ...review, draftFingerprint: 'deadbeef' };
      assert.equal(checkEngineeringTransferGate(wall, other, wallCurrent).allowed, false);
    });
    check('G5 preview membawa penilaian risiko (advisory — TIDAK memblokir transfer)', () => {
      const preview = buildPushPreview(wallDraft.draft);
      assert.equal(preview.engineeringRisk.level, 'HIGH');
      assert.equal(preview.transferBlocked, false);
      assert.equal(validateTransfer(wallDraft.draft, 'p1').allowed, true);
    });
    check('G6 CRITICAL (tinggi 8 m) juga diblokir gerbang tanpa review', () => {
      const crit = assessDraftEngineering({
        spec: { lengthM: 100, heightM: 8, rawText: 'dinding penahan 100 m tinggi 8 m' },
        parts: [
          { scope: { id: 'lanskap', label: 'Lanskap' }, template: liveTemplate('STR-RETAINING-RC') },
        ],
      });
      assert.equal(crit.level, 'CRITICAL');
      assert.equal(
        checkEngineeringTransferGate(crit, null, { version: 1, fingerprint: 'sintetis' }).allowed,
        false,
      );
    });
    check('G7 draftFingerprint stabil + membedakan revisi', () => {
      const a = draftFingerprint(wallDraft.draft);
      const b = draftFingerprint(wallDraft.draft);
      assert.equal(a, b);
      const changed = JSON.parse(JSON.stringify(wallDraft.draft)) as UniversalDraft;
      changed.version = changed.version + 1;
      assert.notEqual(draftFingerprint(changed), a);
    });
  }

  /* ================================================================ */
  /* H. Pin regresi                                                   */
  /* ================================================================ */
  section('H', 'Pin regresi');
  {
    check('H1 tanpa completion: mapper + preview byte-identical dengan perilaku lama', () => {
      const r = buildDirectRab('buatkan rab rumah type 36');
      assert.ok(r !== null);
      const payload = mapDirectRabPushItems(r!);
      assert.ok(payload.every((i) => i.priceSourceKind === undefined));
      assert.ok(payload.every((i) => i.priceSourceLabel === undefined));
      const preview = buildDirectPushPreview(r!, new Set<string>());
      assert.equal(preview.aiFillCount, 0);
      const msg = formatDirectPushPreviewMessage(r!, preview, 'P');
      assert.ok(!msg.includes('estimasi AI'), msg);
    });
    check('H2 estimatedTotal draft nyata = Σ komponen (tidak dihitung ganda)', () => {
      const built = buildUniversalDraft('buatkan rab gudang 10 x 20 m');
      assert.equal(built.kind, 'draft');
      const t = computeTotals(built.draft);
      assert.equal(t.estimatedTotal, t.verifiedTotal + t.databaseTotal + t.marketTotal + t.manualTotal);
    });
    check('H3 volume = 1.0 tidak diubah perilakunya (jumlah = harga satuan)', () => {
      const amt = reconciliationLineAmount({
        volume: 1.0, unitPrice: 123_456, priceStatus: 'PRICE_RESOLVED',
        priceSourceKind: 'OFFICIAL_AHSP', ahspMappingStatus: 'VERIFIED',
      } as never);
      assert.equal(amt, 123_456);
    });
  }

  console.log(`\nBatch 4: ${passed} lolos, ${failed} gagal (${passed + failed} total)`);
  if (failed > 0) {
    console.log('Gagal:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Batch 4 suite crash:', e);
  process.exit(1);
});
