/**
 * P1 AuthZ + Confirmation — suite verifikasi hardening P1 (W-AUTH, 2026-11-24).
 *
 * Meliputi (direktif owner 2026-11-24, §4.2/§4.4/§4.5/§6):
 * - D6 N-7: Kontraktor (tanpa edit-estimate) DITOLAK di semua mutasi
 *   persisten Chat AI (pengaturan ×2, buat proyek, hapus, override
 *   harga, revisi, rename, QTO); Estimator mengeksekusi.
 * - D6 O-5: kirim-ulang teks perintah TIDAK mengeksekusi (WC-02) —
 *   eksekusi hanya lewat dispatch tombol konfirmasi
 *   (executeDirectConfirmation); slot sekali pakai.
 * - WC-03: model-emitted build_universal_draft DITOLAK (allowlist
 *   executeTool); transfer_draft tetap butuh approval; propose_*
 *   tetap role-gated; tool baca model-callable tetap jalan.
 * - §4.5: draft pertama TIDAK membuat proyek (draft tak-terikat);
 *   ensurer kontrak-baru hanya mengikat ke proyek yang SUDAH ADA.
 * - H-12 (P1-08): snapshot pra-completion + "Batalkan lengkapan"
 *   mengembalikan draft persis + baris pemberitahuan di pesan hasil.
 * - P1-E: setiap mutasi perintah langsung yang dikonfirmasi punya
 *   record audit (aktor, proyek, operasi, nilai, referensi konfirmasi,
 *   hasil, kunci idempotensi).
 * - Inventaris: kunci tak dikenal fail-closed; READ_ONLY /
 *   SIMULATION_ONLY tanpa capability; tanpa konteks → tolak.
 * - §9 Fast Track Continuation A2 (2026-11-24): slot konfirmasi
 *   terikat aktor pengusul; DELETE_PROJECT_CONFIRM +
 *   SET_PROJECT_PRICE_CONFIRM lewat slot (TTL + sekali pakai +
 *   sidik); pengikatan nilai tampilan koreksi QTO; validasi
 *   konfirmasi revisi spek DED (TTL + nilai dasar).
 *
 * Suite tsx polos (BUKAN vitest): AI `execute` SELALU di-stub lewat
 * injeksi deps — tanpa live gateway, tanpa network, tanpa paid call.
 * Jalankan: npx --yes tsx src/test/p1AuthzConfirmation.test.ts
 */
import {
  executeIntent,
  executeDirectConfirmation,
  executeBudgetFullAiRab,
  undoFullAiCompletion,
  acceptFullAiCompletion,
  discardFullAiCompletion,
  clearPendingDirectConfirmations,
  proposeUiActionConfirmation,
  DIRECT_COMMAND_CONFIRM_TTL_MS,
  qtoCorrectionMatchesDisplayed,
  validateDedSpecRevisionConfirm,
  __clearFullAiCompletionSnapshotForTests,
  __hasFullAiCompletionSnapshotForTests,
  __hasPendingFullAiCompletionForTests,
  __getPendingUniversalCompletionForTests,
  __getPendingDirectCompletionForTests,
  FULL_AI_COMPLETION_NOTICE,
  FULL_AI_COMPLETION_PREVIEW_NOTICE,
  tryContinueUniversalContext,
  submitQuestionnaireAnswers,
  clearUniversalContext,
  clearProjectContext,
  setLastRabNeeds,
  clearPendingRabChoice,
  type ChatActionContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import type { QtoCorrectionProposal, DedSpecRevisionPreview } from '../ai-tools/ezrab-ai/dedQtoIntegration';
import type { StructuredSpec } from '../ai-tools/ezrab-ai/structuredSpec';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { setAssistantOperationContext } from '../ai-tools/ezrab-ai/operations';
import { executeTool } from '../ai-tools/ezrab-ai/toolRegistry';
import {
  authorizeChatAiMutation,
  CHAT_AI_ADMIN_ONLY_MESSAGE,
} from '../ai-tools/ezrab-ai/mutationInventory';
import {
  listMutationAuditRecords,
  __resetMutationAuditLogForTests,
} from '../ai-tools/ezrab-ai/mutationAuditLog';
import { setDraftProjectEnsurer } from '../ai-tools/ezrab-ai/tempProject';
import {
  buildUniversalDraft,
  getLastUniversalDraft,
  getLastUniversalDraftProjectId,
  setLastUniversalDraft,
  effectiveItems,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import { buildDirectRab, setLastDirectRab } from '../ai-tools/ezrab-ai/directRab';
import type { ChatRabCompletionDeps } from '../ai-tools/ezrab-ai/fullAiRabCompletion';

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
/* Toko proyek palsu + ctx                                             */
/* ------------------------------------------------------------------ */

interface FakeProject { id: string; name: string }
let fakeProjects: FakeProject[] = [];
let settingsPatches: Array<{ projectId: string; patch: unknown }> = [];
let createdProjectNames: string[] = [];
let deletedIds: string[] = [];
let createdRevisionLabels: Array<string | undefined> = [];
let createdQtoInputs: unknown[] = [];
let syncedQtoIds: string[] = [];
let appliedOverrides: unknown[] = [];

function resetFakeStore(): void {
  fakeProjects = [{ id: 'p1', name: 'Proyek Uji' }];
  settingsPatches = [];
  createdProjectNames = [];
  deletedIds = [];
  createdRevisionLabels = [];
  createdQtoInputs = [];
  syncedQtoIds = [];
  appliedOverrides = [];
}

function makeCtx(): ChatActionContext {
  return {
    navigate: () => {},
    currentMenu: 'chat',
    activeProject: { id: 'p1', name: 'Proyek Uji' },
    projects: fakeProjects.map((p) => ({ id: p.id, name: p.name })),
    projectTotal: null,
    renameProject: (id: string, newName: string) => {
      const p = fakeProjects.find((x) => x.id === id);
      if (!p) return false;
      p.name = newName;
      return true;
    },
    createProject: (name: string) => {
      const p = { id: `p-${fakeProjects.length + 1}`, name };
      createdProjectNames.push(name);
      fakeProjects.push(p);
      return p;
    },
    deleteProject: (id: string) => {
      if (!fakeProjects.some((p) => p.id === id)) return false;
      deletedIds.push(id);
      return true;
    },
    archiveProject: (id: string) => fakeProjects.some((p) => p.id === id),
    duplicateProject: (id: string) => {
      const p = fakeProjects.find((x) => x.id === id);
      if (!p) return null;
      const c = { id: `p-dup-${id}`, name: `${p.name} (Salinan)` };
      createdProjectNames.push(c.name);
      return c;
    },
    updateProjectSettings: (id: string, patch: unknown) => {
      settingsPatches.push({ projectId: id, patch });
      return true;
    },
    createQtoItem: (input: unknown) => {
      createdQtoInputs.push(input);
      return { id: 'q1', kode: 'Q-001' };
    },
    listQtoItems: () => [
      { id: 'q1', uraian: 'galian', quantity: 10, unit: 'm3', kode: 'Q-001', unitPrice: 50000, priceUnit: 'm3' },
    ],
    syncQtoItem: (qtoItemId: string) => {
      syncedQtoIds.push(qtoItemId);
      return true;
    },
    createRevision: (label: string | undefined) => {
      createdRevisionLabels.push(label);
      return { versionNumber: 2, label: label ?? 'v2' };
    },
    setProjectPriceOverride: (_projectId: string, input: unknown) => {
      appliedOverrides.push(input);
      return true;
    },
  } as unknown as ChatActionContext;
}

/** Peran Kontraktor (tanpa edit-estimate) / Estimator (dengan edit-estimate). */
function asKontraktor(): void {
  setAssistantOperationContext({ actor: 'Kontraktor', writesEnabled: false });
}
function asEstimator(): void {
  setAssistantOperationContext({ actor: 'Estimator', writesEnabled: true });
}
/** Peran Admin KEDUA (dengan edit-estimate, nama aktor berbeda) — pin
 *  pengikatan aktor A2: proposal Estimator tidak boleh diklaim QS. */
function asQs(): void {
  setAssistantOperationContext({ actor: 'QS', writesEnabled: true });
}
function asNoContext(): void {
  setAssistantOperationContext(null);
}

function resetRegistry(): void {
  clearPendingDirectConfirmations();
  clearUniversalContext();
  clearProjectContext();
  setLastUniversalDraft(null);
  setLastDirectRab(null);
  setLastRabNeeds(null);
  clearPendingRabChoice();
  __clearFullAiCompletionSnapshotForTests();
  __resetMutationAuditLogForTests();
  setDraftProjectEnsurer(null);
  resetFakeStore();
}

/* ------------------------------------------------------------------ */
/* Stub execute Full AI (cermin chatBudgetRabFullAi.test.ts)            */
/* ------------------------------------------------------------------ */

function makeStub(): { deps: ChatRabCompletionDeps } {
  const execute = async (req: { prompt: string; systemPrompt?: string }): Promise<Record<string, unknown>> => {
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
        unitPrice: 150_000,
        unit,
        spec: `spek stub standar untuk item ${no}`,
        basis: 'harga pasar stub, kualitas standar',
      }));
      return { success: true, content: JSON.stringify({ fills }), structured: null, requestId: 'stub-1' };
    }
    const fills = items.map(({ no }) => ({ no, qty: 10, formula: '10 x 1', basis: 'asumsi stub: 10 satuan tipikal' }));
    return { success: true, content: JSON.stringify({ fills }), structured: null, requestId: 'stub-1' };
  };
  return { deps: { execute: execute as ChatRabCompletionDeps['execute'], productId: 'EZRAB_AI' } };
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

const MIN_CTX = {
  navigate: () => {},
  currentMenu: 'chat',
  activeProject: null,
  projects: [],
  projectTotal: null,
} as unknown as ChatActionContext;

async function main(): Promise<void> {
  /* ================================================================
   * §1. D6 N-7 — Kontraktor DITOLAK di semua mutasi persisten.
   * ================================================================ */
  console.log('== §1. N-7 Kontraktor ditolak ==');
  {
    resetRegistry();
    asKontraktor();
    const ctx = makeCtx();

    const s1 = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('N7-01 Kontraktor ubah overhead → ditolak kalimat owner', s1.ok === false && s1.message === CHAT_AI_ADMIN_ONLY_MESSAGE, s1.message.slice(0, 80));
    check('N7-02 Kontraktor ubah overhead → tidak ada patch', settingsPatches.length === 0);
    const s2 = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('N7-03 Kontraktor ubah overhead ×2 → tetap ditolak (bukan eksekusi)', s2.ok === false && s2.message === CHAT_AI_ADMIN_ONLY_MESSAGE && settingsPatches.length === 0);

    const c1 = executeIntent('CREATE_PROJECT', 'Rumah Impian', ctx);
    check('N7-04 Kontraktor buat proyek → ditolak kalimat owner', c1.ok === false && c1.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
    check('N7-05 Kontraktor buat proyek → tidak ada proyek dibuat', createdProjectNames.length === 0);

    const r1 = executeIntent('RENAME_PROJECT', 'Nama Baru', ctx);
    check('N7-06 Kontraktor rename → ditolak kalimat owner', r1.ok === false && r1.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
    check('N7-07 Kontraktor rename → nama tidak berubah', fakeProjects[0].name === 'Proyek Uji');

    const q1 = executeIntent('CREATE_QTO_ITEM', 'galian 10 m3', ctx);
    check('N7-08 Kontraktor buat item QTO → ditolak kalimat owner', q1.ok === false && q1.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
    check('N7-09 Kontraktor buat item QTO → tidak ada item dibuat', createdQtoInputs.length === 0);

    const d1 = executeIntent('DELETE_PROJECT_CONFIRM', 'p1', ctx);
    check('N7-10 Kontraktor hapus proyek (confirm) → ditolak kalimat owner', d1.ok === false && d1.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
    check('N7-11 Kontraktor hapus proyek → tidak ada penghapusan', deletedIds.length === 0);

    const pricePayload = JSON.stringify({
      v: 1, projectId: 'p1', code: 'M.001', name: 'Semen', category: 'MATERIAL',
      unit: 'kg', masterPrice: 1500, projectPrice: 2000,
    });
    const p1 = executeIntent('SET_PROJECT_PRICE_CONFIRM', pricePayload, ctx);
    check('N7-12 Kontraktor override harga → ditolak kalimat owner', p1.ok === false && p1.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
    check('N7-13 Kontraktor override harga → tidak diterapkan', appliedOverrides.length === 0);

    const v1 = executeIntent('CREATE_REVISION', 'Revisi A', ctx);
    check('N7-14 Kontraktor buat revisi → ditolak kalimat owner', v1.ok === false && v1.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
    check('N7-15 Kontraktor buat revisi → tidak ada revisi dibuat', createdRevisionLabels.length === 0);

    // Tanpa konteks operasi (identitas tak dapat ditegakkan) → tolak.
    asNoContext();
    const n1 = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('N7-16 tanpa konteks operasi → ditolak (fail-closed)', n1.ok === false && n1.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
  }

  /* ================================================================
   * §2. D6 N-7 — Estimator mengeksekusi (via tombol konfirmasi).
   * ================================================================ */
  console.log('== §2. N-7 Estimator mengeksekusi ==');
  {
    resetRegistry();
    asEstimator();
    const ctx = makeCtx();

    const ask = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('N7-17 Estimator ubah overhead → pratinjau + tombol konfirmasi', ask.ok === true && (ask.actions ?? []).length > 0 && settingsPatches.length === 0, ask.message.slice(0, 60));
    const exec = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('N7-18 Estimator konfirmasi tombol → dieksekusi', exec.ok === true && settingsPatches.length === 1, exec.message.slice(0, 60));

    const cAsk = executeIntent('CREATE_PROJECT', 'Rumah Impian', ctx);
    check('N7-19 Estimator buat proyek → pratinjau (belum dibuat)', cAsk.ok === true && createdProjectNames.length === 0);
    const cExec = executeDirectConfirmation('CREATE_PROJECT', 'Rumah Impian', ctx);
    check('N7-20 Estimator konfirmasi buat proyek → dibuat', cExec.ok === true && createdProjectNames.length === 1 && createdProjectNames[0] === 'Rumah Impian');

    const dAsk = executeIntent('DELETE_PROJECT', 'Proyek Uji', ctx);
    check('N7-21a Estimator hapus proyek → langkah 1 bertanya + tombol konfirmasi', dAsk.ok === true && (dAsk.actions ?? []).length > 0 && deletedIds.length === 0, dAsk.message.slice(0, 60));
    const dExec = executeDirectConfirmation('DELETE_PROJECT_CONFIRM', 'p1', ctx);
    check('N7-21 Estimator konfirmasi hapus → dihapus', dExec.ok === true && deletedIds.length === 1);

    const vAsk = executeIntent('CREATE_REVISION', 'Revisi A', ctx);
    check('N7-22 Estimator buat revisi → pratinjau (belum dibuat)', vAsk.ok === true && createdRevisionLabels.length === 0);
    const vExec = executeDirectConfirmation('CREATE_REVISION', 'Revisi A', ctx);
    check('N7-23 Estimator konfirmasi revisi → dibuat', vExec.ok === true && createdRevisionLabels.length === 1);
  }

  /* ================================================================
   * §3. D6 O-5 — kirim-ulang teks TIDAK mengeksekusi; sekali pakai.
   * ================================================================ */
  console.log('== §3. O-5 double-send tidak mengeksekusi ==');
  {
    resetRegistry();
    asEstimator();
    const ctx = makeCtx();

    const ask1 = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('O5-01 kirim 1 → pratinjau', ask1.ok === true && settingsPatches.length === 0);
    const ask2 = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('O5-02 kirim 2 (teks sama) → TANYA ULANG, bukan eksekusi', ask2.ok === true && settingsPatches.length === 0 && (ask2.actions ?? []).length > 0);
    const ask3 = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('O5-03 kirim 3 (teks sama) → tetap tidak mengeksekusi', settingsPatches.length === 0, `patches=${settingsPatches.length}`);
    const exec = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('O5-04 klik tombol konfirmasi → dieksekusi SEKALI', exec.ok === true && settingsPatches.length === 1);
    const exec2 = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('O5-05 klik tombol kedua → tanya ulang (slot sekali pakai)', exec2.ok === true && settingsPatches.length === 1 && (exec2.actions ?? []).length > 0);

    // Proposal berubah → konfirmasi lama batal (tanya ulang segar).
    resetRegistry();
    asEstimator();
    const ctx2 = makeCtx();
    executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx2);
    const changed = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 15%', ctx2);
    check('O5-06 proposal berubah (10%→15%) → konfirmasi lama batal, tanya ulang', changed.ok === true && settingsPatches.length === 0 && (changed.actions ?? []).length > 0);
    const execChanged = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 15%', ctx2);
    check('O5-07 konfirmasi proposal baru → dieksekusi', execChanged.ok === true && settingsPatches.length === 1);
  }

  /* ================================================================
   * §4. WC-03 — allowlist panggilan model.
   * ================================================================ */
  console.log('== §4. WC-03 allowlist model ==');
  {
    resetRegistry();
    asEstimator();

    const m1 = await executeTool({
      toolName: 'build_universal_draft',
      args: { text: 'buatkan rab gudang 10 x 20 m' },
      actor: 'model',
      channel: 'chat-ai',
    });
    check('WC03-01 model build_universal_draft → DITOLAK TOOL_NOT_MODEL_CALLABLE', m1.ok === false && m1.errorCode === 'TOOL_NOT_MODEL_CALLABLE', m1.errorCode ?? '');

    const m2 = await executeTool({
      toolName: 'transfer_draft',
      args: { projectId: 'p1', draftVersion: 1 },
      actor: 'model',
      channel: 'chat-ai',
    });
    check('WC03-02 model transfer_draft → DITOLAK (bukan EZRAB_AI_TOOLS)', m2.ok === false && m2.errorCode === 'TOOL_NOT_MODEL_CALLABLE', m2.errorCode ?? '');

    const m3 = await executeTool({
      toolName: 'build_universal_draft',
      args: { text: 'buatkan rab gudang 10 x 20 m' },
      actor: 'system',
      channel: 'chat-ai',
    });
    check('WC03-03 system build_universal_draft → TIDAK kena allowlist (lolos ke eksekusi)', m3.errorCode !== 'TOOL_NOT_MODEL_CALLABLE', m3.errorCode ?? 'ok');

    const m4 = await executeTool({
      toolName: 'tool_tidak_ada_xyz',
      args: {},
      actor: 'model',
      channel: 'chat-ai',
    });
    check('WC03-04 model tool tak dikenal → TOOL_NOT_FOUND', m4.ok === false && m4.errorCode === 'TOOL_NOT_FOUND', m4.errorCode ?? '');

    // propose_* tetap role-gated (pre-check writesEnabled).
    asKontraktor();
    const m5 = await executeTool({
      toolName: 'propose_update_quantity',
      args: { nama: 'plesteran', volume: 25 },
      projectId: 'p1',
      actor: 'model',
      channel: 'chat-ai',
    });
    check('WC03-05 model propose_* tanpa capability → WRITE_NOT_ENABLED', m5.ok === false && m5.errorCode === 'WRITE_NOT_ENABLED', m5.errorCode ?? '');

    // Tool baca model-callable tetap jalan.
    asEstimator();
    const m6 = await executeTool({
      toolName: 'subtotal',
      args: { volume: 2, unitPrice: 5000 },
      actor: 'model',
      channel: 'chat-ai',
    });
    check('WC03-06 model subtotal (baca) → tetap diizinkan', m6.ok === true, m6.errorCode ?? '');

    // Allowlist CHANNEL-AWARE: kanal copilot mengiklankan subset read-only
    // registry (COPILOT_ALLOWED_TOOLS) ke model — navigate BOLEH dipanggil
    // model di kanal copilot, tapi TIDAK di kanal chat-ai (tidak ada di
    // EZRAB_AI_TOOLS). build_universal_draft tidak ada di KEDUA daftar.
    const m7 = await executeTool({
      toolName: 'navigate', args: { command: 'buka dashboard' }, projectId: null,
      actor: 'model', channel: 'copilot',
    });
    check('WC03-07 model navigate di kanal COPILOT → diizinkan (subset read-only Copilot)', m7.errorCode !== 'TOOL_NOT_MODEL_CALLABLE', m7.errorCode ?? '');
    const m8 = await executeTool({
      toolName: 'navigate', args: { command: 'buka dashboard' }, projectId: null,
      actor: 'model', channel: 'chat-ai',
    });
    check('WC03-08 model navigate di kanal chat-ai → DITOLAK (bukan EZRAB_AI_TOOLS)', m8.errorCode === 'TOOL_NOT_MODEL_CALLABLE', m8.errorCode ?? '');
    const m9 = await executeTool({
      toolName: 'build_universal_draft', args: { text: 'buatkan rab jalan beton 1 km lebar 6 m' }, projectId: null,
      actor: 'model', channel: 'copilot',
    });
    check('WC03-09 model build_universal_draft di kanal COPILOT → DITOLAK (tidak ada di kedua daftar)', m9.errorCode === 'TOOL_NOT_MODEL_CALLABLE', m9.errorCode ?? '');
  }

  /* ================================================================
   * §5. §4.5 — draft pertama TIDAK membuat proyek.
   * ================================================================ */
  console.log('== §5. §4.5 tanpa proyek implisit ==');
  {
    resetRegistry();
    asEstimator();
    // Ensurer kontrak-BARU (§4.5): proyek live bila ada, SELAIN ITU
    // null — TIDAK PERNAH membuat proyek (cermin ensurer view.tsx).
    let liveProject: { id: string; name: string } | null = null;
    let ensurerCalls = 0;
    setDraftProjectEnsurer(((_draft: unknown, preferredProjectId?: string | null) => {
      ensurerCalls += 1;
      if (preferredProjectId) {
        return liveProject && liveProject.id === preferredProjectId
          ? { id: liveProject.id, name: liveProject.name, created: false }
          : null;
      }
      return liveProject ? { id: liveProject.id, name: liveProject.name, created: false } : null;
    }) as never);

    // A. Alur brief → draft universal pertama tanpa proyek aktif.
    const start = (text: string) => {
      const routed = routeIntent(text);
      return executeIntent(routed.intent, routed.param, {
        navigate: () => {},
        currentMenu: 'ezrab-ai',
        activeProject: null,
        projects: [],
        projectTotal: 0,
        projectItems: null,
        rawText: text,
      } as unknown as ChatActionContext);
    };
    const r1 = start('Buat RAB jalan beton sepanjang 2 km');
    check('S45-01 brief langkah 1 menanyakan lebar jalan', r1.message.includes('lebar jalan'));
    const jawab = tryContinueUniversalContext('lebarnya 5 meter');
    check('S45-02 jawaban lebar membuka kuesioner', !!(jawab && jawab.questionnaire));
    const brief = submitQuestionnaireAnswers({});
    check('S45-03 kuesioner menghasilkan brief', brief.message.includes('Brief proyek'));
    check('S45-04 belum ada proyek sebelum draft dibuat', fakeProjects.length === 1 && createdProjectNames.length === 0);
    const gen = executeIntent('RAB_INTAKE_GENERATE', undefined, {
      navigate: () => {},
      currentMenu: 'ezrab-ai',
      activeProject: null,
      projects: [],
      projectTotal: 0,
      projectItems: null,
      rawText: 'susun',
    } as unknown as ChatActionContext);
    check('S45-05 draft pertama berhasil dibangun', gen.ok === true && (gen.actions ?? []).some((a) => a.action.kind === 'push-universal'));
    check('S45-06 draft pertama TIDAK membuat proyek', createdProjectNames.length === 0, `dibuat: ${createdProjectNames.join(', ')}`);
    check('S45-07 draft pertama TAK TERIKAT (tanpa proyek)', getLastUniversalDraftProjectId() === null);
    check('S45-08 pesan draft TIDAK menyebut "proyek dibuat otomatis"', !gen.message.includes('dibuat otomatis'));
    check('S45-09 ensurer dipanggil tetapi mengembalikan null (tanpa live)', ensurerCalls > 0);

    // B. Jalur direct (GENERATE_RAB_TEMPLATE) juga tanpa proyek.
    resetRegistry();
    asEstimator();
    setDraftProjectEnsurer((() => null) as never);
    const direct = executeIntent('GENERATE_RAB_TEMPLATE', 'buatkan rab rumah tipe 21', {
      navigate: () => {},
      currentMenu: 'ezrab-ai',
      activeProject: null,
      projects: [],
      projectTotal: 0,
      projectItems: null,
      rawText: 'buatkan rab rumah tipe 21',
    } as unknown as ChatActionContext);
    check('S45-10 direct template menghasilkan draft', direct.ok === true && (direct.actions ?? []).some((a) => a.action.kind === 'push-rab'));
    check('S45-11 direct TIDAK membuat proyek', createdProjectNames.length === 0);

    // C. Jalur tool (F-ISO-4 hook) — actor system, tanpa proyek.
    resetRegistry();
    asEstimator();
    setDraftProjectEnsurer((() => null) as never);
    const toolRes = await executeTool({
      toolName: 'build_universal_draft',
      args: { text: 'buatkan rab gudang 10 x 20 m' },
      actor: 'system',
      channel: 'chat-ai',
    });
    check('S45-12 tool build_universal_draft sukses (actor system)', toolRes.ok === true, toolRes.errorCode ?? '');
    check('S45-13 draft tool TAK TERIKAT (hook F-ISO-4 tidak membuat proyek)', getLastUniversalDraftProjectId() === null);

    // D. Dengan proyek live, draft DIKALANG ke proyek itu (bukan dibuat baru).
    resetRegistry();
    asEstimator();
    liveProject = { id: 'p1', name: 'Proyek Uji' };
    setDraftProjectEnsurer(((_draft: unknown) => (
      liveProject ? { id: liveProject.id, name: liveProject.name, created: false } : null
    )) as never);
    const toolRes2 = await executeTool({
      toolName: 'build_universal_draft',
      args: { text: 'buatkan rab gudang 10 x 20 m' },
      actor: 'system',
      channel: 'chat-ai',
    });
    check('S45-14 tool draft dengan proyek live sukses', toolRes2.ok === true);
    check('S45-15 draft diikat ke proyek live yang ADA', getLastUniversalDraftProjectId() === 'p1');
    check('S45-16 TIDAK ada proyek baru dibuat (hanya pengikatan)', createdProjectNames.length === 0);
  }

  /* ================================================================
   * §6. H-12 — accept-before-persist penuh (Fast Track).
   * Completion menahan isian di klon tertunda + pratinjau; HANYA
   * "Terima lengkapan" yang menukar draft live (snapshot pra-terima
   * diambil saat terima); "Buang lengkapan" membuang klon tanpa
   * menyentuh draft. Undo tetap ada sebagai jaring pengaman sesudah
   * terima.
   * ================================================================ */
  console.log('== §6. H-12 accept-before-persist ==');
  {
    resetRegistry();
    asEstimator();
    const draft = buildGudangDraft('800 juta');
    const nulled = nullPricesWhere(draft, (it) => it.unit === 'm2');
    check('H12-01 2 item m2 dikosongkan harganya', nulled === 2, `dapat ${nulled}`);
    const beforeJson = JSON.stringify(draft);
    const stub = makeStub();
    const res = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    check('H12-02 completion universal ok', res.ok === true);
    check('H12-03 pratinjau memuat baris pemberitahuan pratinjau', res.message.includes(FULL_AI_COMPLETION_PREVIEW_NOTICE));
    check('H12-04 pratinjau TIDAK mengklaim tersimpan', res.message.includes('BELUM diterapkan dan BELUM tersimpan') && !res.message.includes('tersimpan dengan harga isian AI'));
    check('H12-05 pratinjau membawa Terima + Buang (tanpa undo)', (res.actions ?? []).some((a) => a.action.kind === 'budget-full-ai-accept') && (res.actions ?? []).some((a) => a.action.kind === 'budget-full-ai-discard') && !(res.actions ?? []).some((a) => a.action.kind === 'budget-full-ai-undo'));
    check('H12-06 belum ada snapshot sesudah completion (snapshot diambil saat terima)', __hasFullAiCompletionSnapshotForTests() === false && __hasPendingFullAiCompletionForTests('universal') === true);
    check('H12-07 draft live TIDAK BERUBAH sesudah completion', JSON.stringify(draft) === beforeJson);
    const pending = __getPendingUniversalCompletionForTests();
    check('H12-07b klon tertunda membawa 2 item terisi', pending !== null && effectiveItems(pending).filter((it) => it.priceStatus === 'PRICE_ESTIMATED').length === 2);
    const accept = acceptFullAiCompletion('universal');
    check('H12-08 terima lengkapan berhasil', accept.ok === true, accept.message.slice(0, 80));
    check('H12-08b snapshot pra-terima tersimpan sesudah terima', __hasFullAiCompletionSnapshotForTests() === true && __hasPendingFullAiCompletionForTests('universal') === false);
    const acceptedDraft = getLastUniversalDraft();
    check('H12-08c draft live terisi sesudah terima (2 item)', acceptedDraft !== null && effectiveItems(acceptedDraft).filter((it) => it.priceStatus === 'PRICE_ESTIMATED').length === 2);
    check('H12-08d pesan terima memuat pemberitahuan + tombol undo', accept.message.includes(FULL_AI_COMPLETION_NOTICE) && (accept.actions ?? []).some((a) => a.action.kind === 'budget-full-ai-undo'));
    const undo = undoFullAiCompletion('universal');
    check('H12-09 undo berhasil', undo.ok === true, undo.message.slice(0, 80));
    const afterUndo = getLastUniversalDraft();
    check('H12-10 restore mengembalikan draft PERSIS pra-completion', afterUndo !== null && JSON.stringify(afterUndo) === beforeJson);
    check('H12-11 snapshot terhapus sesudah restore (sekali pakai)', __hasFullAiCompletionSnapshotForTests() === false);
    const undo2 = undoFullAiCompletion('universal');
    check('H12-12 undo kedua ditolak jujur (snapshot sudah dipakai)', undo2.ok === false);

    // Jalur buang: completion baru → buang → draft tak berubah, pending hilang.
    const stubB = makeStub();
    const resB = await executeBudgetFullAiRab('', MIN_CTX, { deps: stubB.deps, target: 'universal' });
    check('H12-13 completion kedua ok (pratinjau baru)', resB.ok === true && __hasPendingFullAiCompletionForTests('universal') === true);
    const beforeDiscardJson = JSON.stringify(getLastUniversalDraft());
    const discard = discardFullAiCompletion('universal');
    check('H12-14 buang lengkapan berhasil', discard.ok === true);
    check('H12-15 draft live TIDAK BERUBAH sesudah buang', JSON.stringify(getLastUniversalDraft()) === beforeDiscardJson && __hasPendingFullAiCompletionForTests('universal') === false);
    const acceptAfterDiscard = acceptFullAiCompletion('universal');
    check('H12-16 terima sesudah buang ditolak jujur', acceptAfterDiscard.ok === false);

    // Jalur direct: undo = buang fullAiCompletion (calc.items tak tersentuh).
    resetRegistry();
    asEstimator();
    const built = buildDirectRab('buatkan rab rumah type 36');
    check('H12-17 buildDirectRab T36 menghasilkan hasil', built !== null);
    const direct = built!;
    const stub2 = makeStub();
    // rawText membawa budget (jalur direct butuh budgetCap dari spec teks).
    const resD = await executeBudgetFullAiRab('buatkan rab rumah type 36 budget 120 juta', MIN_CTX, { deps: stub2.deps, target: 'direct' });
    check('H12-18 completion direct ok', resD.ok === true);
    check('H12-19 completion direct memuat pemberitahuan pratinjau', resD.message.includes(FULL_AI_COMPLETION_PREVIEW_NOTICE));
    check('H12-20 tombol Terima + Buang direct disertakan', (resD.actions ?? []).some((a) => a.action.kind === 'budget-full-ai-accept') && (resD.actions ?? []).some((a) => a.action.kind === 'budget-full-ai-discard'));
    check('H12-21 fullAiCompletion BELUM terset sesudah completion', !direct.fullAiCompletion && __getPendingDirectCompletionForTests() !== null);
    const acceptD = acceptFullAiCompletion('direct');
    check('H12-22 terima direct berhasil + fullAiCompletion terset', acceptD.ok === true && !!direct.fullAiCompletion);
    check('H12-23 pesan terima direct memuat pemberitahuan', acceptD.message.includes(FULL_AI_COMPLETION_NOTICE));
    const undoD = undoFullAiCompletion('direct');
    check('H12-24 undo direct berhasil', undoD.ok === true);
    check('H12-25 fullAiCompletion dibuang sesudah undo', !direct.fullAiCompletion);
  }

  /* ================================================================
   * §7. P1-E — jejak audit mutasi.
   * ================================================================ */
  console.log('== §7. P1-E jejak audit ==');
  {
    resetRegistry();
    asEstimator();
    const ctx = makeCtx();

    executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('AUD-01 pratinjau saja TIDAK mencatat audit', listMutationAuditRecords().length === 0);
    executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    const recs1 = listMutationAuditRecords();
    check('AUD-02 konfirmasi settings → 1 record audit', recs1.length === 1, `dapat ${recs1.length}`);
    const r1 = recs1[0];
    check('AUD-03 record settings: operasi + proyek + aktor', r1.operation === 'UPDATE_PROJECT_SETTINGS' && r1.projectId === 'p1' && r1.actor === 'Estimator');
    check('AUD-04 record settings: hasil executed + outcomeVerified', r1.result === 'executed' && r1.outcomeVerified === true);
    check('AUD-05 record settings: referensi konfirmasi + kunci idempotensi', !!r1.confirmationRef && r1.confirmationRef.length > 0 && !!r1.idempotencyKey && r1.idempotencyKey.length > 0);
    check('AUD-06 record settings: after memuat patch overhead 10', JSON.stringify(r1.after).includes('10'));

    executeIntent('CREATE_PROJECT', 'Rumah Impian', ctx);
    executeDirectConfirmation('CREATE_PROJECT', 'Rumah Impian', ctx);
    const recs2 = listMutationAuditRecords();
    check('AUD-07 konfirmasi create project → record ke-2', recs2.length === 2);
    check('AUD-08 record create: operasi + after nama', recs2.some((r) => r.operation === 'CREATE_PROJECT' && JSON.stringify(r.after).includes('Rumah Impian')));

    executeIntent('DELETE_PROJECT', 'Proyek Uji', ctx);
    executeDirectConfirmation('DELETE_PROJECT_CONFIRM', 'p1', ctx);
    const recs3 = listMutationAuditRecords();
    check('AUD-09 konfirmasi hapus → record ke-3', recs3.length === 3);
    check('AUD-10 record hapus: before nama + after deleted', recs3.some((r) => r.operation === 'DELETE_PROJECT_CONFIRM' && JSON.stringify(r.before).includes('Proyek Uji') && JSON.stringify(r.after).includes('deleted')));

    executeIntent('CREATE_REVISION', 'Revisi A', ctx);
    executeDirectConfirmation('CREATE_REVISION', 'Revisi A', ctx);
    const recs4 = listMutationAuditRecords();
    check('AUD-11 konfirmasi revisi → record ke-4', recs4.length === 4);
    check('AUD-12 record revisi: operasi CREATE_REVISION', recs4.some((r) => r.operation === 'CREATE_REVISION'));

    // Penolakan kapabilitas TIDAK mencatat audit (tidak ada mutasi dicoba).
    const beforeRefuse = listMutationAuditRecords().length;
    asKontraktor();
    executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 12%', ctx);
    check('AUD-13 penolakan non-admin TIDAK mencatat audit', listMutationAuditRecords().length === beforeRefuse);

    // Filter per proyek: 3 dari 4 record ber-projectId 'p1' (settings,
    // hapus, revisi). Record CREATE_PROJECT ber-projectId null — proyek
    // belum ada saat dibuat dan handler tidak mengembalikan id baru
    // (keterbatasan terdokumentasi di recordDirectCommandAudit).
    const forP1 = listMutationAuditRecords('p1');
    check('AUD-14 filter per proyek bekerja', forP1.length === 3 && forP1.every((r) => r.projectId === 'p1'));
    const all = listMutationAuditRecords();
    const createRec = all.find((r) => r.operation === 'CREATE_PROJECT');
    check('AUD-15 record create: projectId null (proyek belum ada saat dibuat)', all.length === 4 && createRec !== undefined && createRec.projectId === null);
  }

  /* ================================================================
   * §8. Inventaris — fail-closed + klasifikasi.
   * ================================================================ */
  console.log('== §8. Inventaris fail-closed ==');
  {
    const u1 = authorizeChatAiMutation('MUTASI_TIDAK_DIKENAL_XYZ', true);
    check('INV-01 kunci tak dikenal → DITOLAK walau writesEnabled', u1.ok === false && u1.reason === 'UNKNOWN_KEY');
    const u2 = authorizeChatAiMutation('UPDATE_PROJECT_SETTINGS', undefined);
    check('INV-02 writesEnabled undefined → DITOLAK', u2.ok === false && u2.reason === 'CAPABILITY_REQUIRED');
    const u3 = authorizeChatAiMutation('UPDATE_PROJECT_SETTINGS', null);
    check('INV-03 writesEnabled null → DITOLAK', u3.ok === false);
    const u4 = authorizeChatAiMutation('QUERY_PROJECT_TOTAL', false);
    check('INV-04 READ_ONLY diizinkan tanpa capability', u4.ok === true);
    const u5 = authorizeChatAiMutation('CREATE_RAB_DIRECT', false);
    check('INV-05 SIMULATION_ONLY (bangun draft) diizinkan tanpa capability', u5.ok === true);
    const u6 = authorizeChatAiMutation('FULL_AI_COMPLETE', false);
    check('INV-06 cakupan draft (FULL_AI_COMPLETE) tanpa capability → DITOLAK (Fast Track §7: draft juga butuh Admin)', u6.ok === false && u6.reason === 'CAPABILITY_REQUIRED');
    const u6b = authorizeChatAiMutation('FULL_AI_COMPLETE', true);
    check('INV-06b cakupan draft (FULL_AI_COMPLETE) dengan capability → diizinkan', u6b.ok === true);
    const u6c = authorizeChatAiMutation('REVISION_ACTIVATE', false);
    check('INV-06c REVISION_ACTIVATE tanpa capability → DITOLAK (Fast Track §7)', u6c.ok === false && u6c.reason === 'CAPABILITY_REQUIRED');
    const u6d = authorizeChatAiMutation('QTO_CORRECTION', false);
    check('INV-06d QTO_CORRECTION tanpa capability → DITOLAK (Fast Track §7)', u6d.ok === false && u6d.reason === 'CAPABILITY_REQUIRED');
    const u6e = authorizeChatAiMutation('DED_SPEC_REVISION', false);
    check('INV-06e DED_SPEC_REVISION tanpa capability → DITOLAK (Fast Track §7)', u6e.ok === false && u6e.reason === 'CAPABILITY_REQUIRED');
    const u7 = authorizeChatAiMutation('PUSH_UNIVERSAL', false);
    check('INV-07 PUSH_UNIVERSAL tanpa capability → DITOLAK kalimat owner', u7.ok === false && !u7.ok && u7.message === CHAT_AI_ADMIN_ONLY_MESSAGE);
    const u8 = authorizeChatAiMutation('DED_FINALIZE', true);
    check('INV-08 DED_FINALIZE dengan capability → diizinkan', u8.ok === true);
  }

  /* ================================================================
   * §9. Fast Track Continuation A2 — pengikatan aktor, slot dua
   * langkah hapus/override, pengikatan nilai QTO, validasi revisi
   * spek DED.
   * ================================================================ */
  console.log('== §9. A2 actor binding + slot dua langkah + nilai QTO/DED ==');
  {
    // --- A2-A: proposal terikat aktor pengusul (demo-role). ---
    resetRegistry();
    asEstimator();
    const ctx = makeCtx();
    const ask = executeIntent('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('A2A-01 Estimator propose → pratinjau', ask.ok === true && settingsPatches.length === 0);
    asQs();
    const crossClaim = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('A2A-02 klaim oleh aktor BERBEDA (QS) ditolak — tidak dieksekusi', crossClaim.ok === true && settingsPatches.length === 0 && (crossClaim.actions ?? []).length > 0, `patches=${settingsPatches.length}`);
    const qsClaim = executeDirectConfirmation('UPDATE_PROJECT_SETTINGS', 'ubah overhead jadi 10%', ctx);
    check('A2A-03 proposal ulang oleh QS lalu klaim QS → dieksekusi', qsClaim.ok === true && settingsPatches.length === 1);
  }
  {
    // --- A2-B: DELETE_PROJECT_CONFIRM lewat slot (TTL + sekali pakai). ---
    resetRegistry();
    asEstimator();
    const ctx = makeCtx();
    const noSlot = executeDirectConfirmation('DELETE_PROJECT_CONFIRM', 'p1', ctx);
    check('A2B-01 konfirmasi hapus TANPA langkah 1 ditolak', noSlot.ok === false && deletedIds.length === 0, noSlot.message.slice(0, 60));
    const step1 = executeIntent('DELETE_PROJECT', 'Proyek Uji', ctx);
    check('A2B-02 langkah 1 hapus → bertanya + tombol', step1.ok === true && (step1.actions ?? []).some((a) => a.action.kind === 'intent' && a.action.intent === 'DELETE_PROJECT_CONFIRM') && deletedIds.length === 0);
    const exec = executeDirectConfirmation('DELETE_PROJECT_CONFIRM', 'p1', ctx);
    check('A2B-03 konfirmasi sesudah langkah 1 → dihapus', exec.ok === true && deletedIds.length === 1);
    const exec2 = executeDirectConfirmation('DELETE_PROJECT_CONFIRM', 'p1', ctx);
    check('A2B-04 konfirmasi kedua ditolak (slot sekali pakai)', exec2.ok === false && deletedIds.length === 1);

    // Proyek berganti nama sesudah langkah 1 → konfirmasi batal.
    resetRegistry();
    asEstimator();
    const ctx2 = makeCtx();
    executeIntent('DELETE_PROJECT', 'Proyek Uji', ctx2);
    ctx2.renameProject!('p1', 'Proyek Ganti Nama');
    const ctx2Fresh = makeCtx(); // ctx proyek segar (nama baru)
    const renamed = executeDirectConfirmation('DELETE_PROJECT_CONFIRM', 'p1', ctx2Fresh);
    check('A2B-05 konfirmasi ditolak bila proyek berganti nama sesudah langkah 1', renamed.ok === false && deletedIds.length === 0, renamed.message.slice(0, 60));

    // TTL: slot yang diusulkan > 10 menit lalu → konfirmasi ditolak.
    resetRegistry();
    asEstimator();
    const ctx3 = makeCtx();
    proposeUiActionConfirmation(
      'DELETE_PROJECT_CONFIRM',
      JSON.stringify({ intent: 'DELETE_PROJECT_CONFIRM', projectId: 'p1', name: 'Proyek Uji' }),
      Date.now() - DIRECT_COMMAND_CONFIRM_TTL_MS - 1000,
    );
    const expired = executeDirectConfirmation('DELETE_PROJECT_CONFIRM', 'p1', ctx3);
    check('A2B-06 konfirmasi hapus sesudah TTL ditolak', expired.ok === false && deletedIds.length === 0);
  }
  {
    // --- A2-C: SET_PROJECT_PRICE_CONFIRM lewat slot (sidik payload). ---
    resetRegistry();
    asEstimator();
    const ctx = makeCtx();
    const payload = JSON.stringify({
      v: 1, projectId: 'p1', code: 'M.001', name: 'Semen', category: 'MATERIAL',
      unit: 'kg', masterPrice: 1500, projectPrice: 2000,
    });
    const noSlot = executeDirectConfirmation('SET_PROJECT_PRICE_CONFIRM', payload, ctx);
    check('A2C-01 konfirmasi override TANPA langkah 1 ditolak', noSlot.ok === false && appliedOverrides.length === 0, noSlot.message.slice(0, 60));

    // TTL: slot kedaluwarsa → konfirmasi ditolak.
    proposeUiActionConfirmation(
      'SET_PROJECT_PRICE_CONFIRM',
      payload,
      Date.now() - DIRECT_COMMAND_CONFIRM_TTL_MS - 1000,
    );
    const expired = executeDirectConfirmation('SET_PROJECT_PRICE_CONFIRM', payload, ctx);
    check('A2C-02 konfirmasi override sesudah TTL ditolak', expired.ok === false && appliedOverrides.length === 0);

    // Alur penuh: langkah 1 → konfirmasi (param dari tombol) → diterapkan SEKALI.
    // Param langkah 1 adalah sisa sesudah "harga " (seperti yang
    // ditangkap router intentRouter.ts) — bukan kalimat perintah utuh.
    resetRegistry();
    asEstimator();
    const ctx2 = makeCtx();
    const step1 = executeIntent('SET_PROJECT_PRICE', 'semen jadi Rp 2.000 untuk proyek ini', ctx2);
    const confirmBtn = (step1.actions ?? []).find(
      (a) => a.action.kind === 'intent' && a.action.intent === 'SET_PROJECT_PRICE_CONFIRM',
    );
    check('A2C-03 langkah 1 override → pratinjau + tombol konfirmasi', step1.ok === true && confirmBtn !== undefined && appliedOverrides.length === 0, step1.message.slice(0, 80));
    if (confirmBtn && confirmBtn.action.kind === 'intent') {
      const exec = executeDirectConfirmation('SET_PROJECT_PRICE_CONFIRM', confirmBtn.action.param, ctx2);
      check('A2C-04 konfirmasi override sesudah langkah 1 → diterapkan', exec.ok === true && appliedOverrides.length === 1, exec.message.slice(0, 80));
      const exec2 = executeDirectConfirmation('SET_PROJECT_PRICE_CONFIRM', confirmBtn.action.param, ctx2);
      check('A2C-05 konfirmasi override kedua ditolak (slot sekali pakai)', exec2.ok === false && appliedOverrides.length === 1);
    } else {
      check('A2C-04 konfirmasi override sesudah langkah 1 → diterapkan', false, 'tanpa tombol konfirmasi');
      check('A2C-05 konfirmasi override kedua ditolak (slot sekali pakai)', false, 'tanpa tombol konfirmasi');
    }
  }
  {
    // --- A2-D: pengikatan nilai tampilan koreksi QTO (helper murni). ---
    const proposal: QtoCorrectionProposal = {
      id: 'qto:item-1',
      itemId: 'item-1',
      description: 'Galian tanah',
      dedQuantity: 10,
      dedUnit: 'm3',
      expectedQuantity: 12,
      expectedUnit: 'm3',
      basis: 'dimensi pengguna',
      checkDetail: 'MISMATCH',
    };
    check('A2D-01 nilai tampil sama → cocok', qtoCorrectionMatchesDisplayed(
      { expectedQuantity: 12, expectedUnit: 'm3', dedQuantity: 10, dedUnit: 'm3' },
      proposal,
    ) === true);
    check('A2D-02 expectedQuantity berubah → TIDAK cocok', qtoCorrectionMatchesDisplayed(
      { expectedQuantity: 15, expectedUnit: 'm3', dedQuantity: 10, dedUnit: 'm3' },
      proposal,
    ) === false);
    check('A2D-03 expectedUnit berubah → TIDAK cocok', qtoCorrectionMatchesDisplayed(
      { expectedQuantity: 12, expectedUnit: 'm2', dedQuantity: 10, dedUnit: 'm3' },
      proposal,
    ) === false);
    check('A2D-04 dedQuantity berubah → TIDAK cocok', qtoCorrectionMatchesDisplayed(
      { expectedQuantity: 12, expectedUnit: 'm3', dedQuantity: 9, dedUnit: 'm3' },
      proposal,
    ) === false);
    check('A2D-05 tanpa pengikatan (tombol lama) → cocok (perilaku lama)', qtoCorrectionMatchesDisplayed(undefined, proposal) === true);
  }
  {
    // --- A2-E: validasi konfirmasi revisi spek DED (helper murni). ---
    const now = Date.now();
    const preview: DedSpecRevisionPreview = {
      id: 'dedrev:ded-length:test',
      key: 'ded-length',
      label: 'Panjang (dari DED)',
      oldValue: 10,
      oldUnit: 'm',
      oldProvenance: 'DED "gambar-kerja.pdf" hal. 2',
      newValue: 12,
      newUnit: 'm',
      createdAt: new Date(now).toISOString(),
    };
    const spec = (value: number, unit = 'm'): StructuredSpec => ({
      key: 'ded-length',
      kind: 'dimension',
      label: 'Panjang (dari DED)',
      value,
      unit,
      status: 'CONFIRMED',
      source: 'DED',
      updatedAt: new Date(now).toISOString(),
      provenance: 'DED "gambar-kerja.pdf" hal. 2',
    });
    check('A2E-01 pratinjau segar + dasar sama → OK', validateDedSpecRevisionConfirm(preview, [spec(10)], now).ok === true);
    const expired = validateDedSpecRevisionConfirm(preview, [spec(10)], now + DIRECT_COMMAND_CONFIRM_TTL_MS + 1);
    check('A2E-02 pratinjau kedaluwarsa → EXPIRED', expired.ok === false && !expired.ok && expired.reason === 'EXPIRED');
    const changed = validateDedSpecRevisionConfirm(preview, [spec(11)], now);
    check('A2E-03 nilai DED dasar berubah → BASE_CHANGED', changed.ok === false && !changed.ok && changed.reason === 'BASE_CHANGED');
    const unitChanged = validateDedSpecRevisionConfirm(preview, [spec(10, 'cm')], now);
    check('A2E-04 satuan DED dasar berubah → BASE_CHANGED', unitChanged.ok === false && !unitChanged.ok && unitChanged.reason === 'BASE_CHANGED');
    const missing = validateDedSpecRevisionConfirm(preview, [], now);
    check('A2E-05 spek dasar hilang → BASE_MISSING', missing.ok === false && !missing.ok && missing.reason === 'BASE_MISSING');
  }

  console.log(`\np1AuthzConfirmation: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
