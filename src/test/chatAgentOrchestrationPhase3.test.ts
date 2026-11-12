/**
 * chatAgentOrchestrationPhase3.test.ts — FASE 3 High-Initiative Agent
 * Orchestration (AI Intelligence Overhaul, direktif owner 2026-11-12
 * Part 15 Fase 3 + Part 5 + Part 7, matriks Part 16 B AGT-01…12).
 *
 * Membuktikan orkestrasi agen di atas fondasi yang ADA (intentRouter,
 * questionnaire, specChain, executionRuntime, memory, canonicalContext):
 * pemahaman objektif, rencana multi-langkah + persistensi, kuesioner
 * sebagai langkah rencana, pemilihan tool yang dapat dijelaskan,
 * approval gate yang ditegakkan di kode, follow-up proaktif, pemulihan,
 * dan konsolidasi memori long-term deterministik.
 *
 * Kelas bukti: mock terkendali (localStorage shim; provider nyata
 * NOT RUN; UI browser dibuktikan E2E terpisah). Jalankan:
 * npx tsx src/test/chatAgentOrchestrationPhase3.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveObjective,
  formatObjectiveSection,
  buildPlanForObjective,
  savePlan,
  loadPlan,
  loadActivePlanForProject,
  nextReadyStep,
  approveStep,
  denyStep,
  executeStep,
  retryStep,
  skipStep,
  replanForNewObjective,
  getPendingFollowUps,
  formatFollowUpMessage,
  formatPlanSummary,
  analyzeDraftCosts,
  formatCostAnalysis,
  consolidateToLongTerm,
  requestLlmMemoryExtraction,
  stepRequiresApproval,
  STEP_TOOL_SELECTION,
  AGENT_MAX_PLAN_ITERATIONS,
  AGENT_MAX_STEP_RETRIES,
  AI_AGENT_PLANS_STORAGE_KEY,
  type AgentObjective,
  type TaskPlan,
} from '../ai-tools/ezrab-ai/agentOrchestrator';
import {
  createMemoryRecord,
  saveMemory,
  getCurrentMemory,
  type MemoryScope,
} from '../ai-tools/ezrab-ai/memory';
import {
  buildCanonicalContext,
  CANONICAL_TOTAL_PROMPT_BUDGET,
} from '../ai-tools/ezrab-ai/canonicalContext';

/* ---------------- localStorage shim (pola Fase 2) ---------------- */
const store: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as { window?: unknown }).window = globalThis;

const PROJ = 'proj-agt';
const CONV = 'conv-agt';
const scope: MemoryScope = { userId: null, projectId: PROJ, conversationId: CONV };

function resetAll(): void {
  for (const k of Object.keys(store)) delete store[k];
}

function kandangObjective(): AgentObjective {
  return deriveObjective('Saya mau bangun kandang sapi 20 ekor, ukuran 17 m x 9 m, atap Galvalum, budget 300 jt', 'CREATE_RAB_SUMMARY');
}

function kandangPlan(): TaskPlan {
  return buildPlanForObjective(kandangObjective(), { userId: null, projectId: PROJ, conversationId: CONV });
}

describe('A3-01 / AGT-01 — permintaan samar → objektif dipahami', () => {
  it('kandang sapi 20 ekor dikenali sebagai proyek fasilitas peternakan, bukan sekadar kata kunci', () => {
    const obj = kandangObjective();
    expect(obj.goal).toBe('build-rab');
    expect(obj.entities.categoryKey).toBe('kandang');
    expect(obj.entities.count?.value).toBe(20);
    expect(obj.entities.count?.unit).toBe('ekor');
    expect(obj.entities.lengthM).toBe(17);
    expect(obj.entities.widthM).toBe(9);
    expect(obj.entities.budgetRp).toBe(300_000_000);
    expect(obj.entities.materials).toContain('galvalum');
    expect(obj.vague).toBe(false);
  });
  it('permintaan samar ("buatkan rab") → goal clarify + vague, bukan tebakan kategori', () => {
    const obj = deriveObjective('buatkan rab dong', 'CREATE_RAB_CLARIFY');
    expect(obj.goal).toBe('clarify');
    expect(obj.vague).toBe(true);
    expect(obj.entities.categoryKey).toBe(null);
    expect(obj.missing).toContain('kategori proyek');
  });
});

describe('A3-02 / AGT-02 — dimensi hilang → pertanyaan relevan sebagai langkah rencana', () => {
  it('rencana memuat langkah kuesioner dengan input yang hilang (dimensi)', () => {
    const obj = deriveObjective('Buatkan RAB kandang sapi 20 ekor, atap Galvalum', 'CREATE_RAB_SUMMARY');
    expect(obj.missing).toContain('dimensi (panjang × lebar atau luas)');
    const plan = buildPlanForObjective(obj, { userId: null, projectId: PROJ, conversationId: CONV });
    const q = plan.steps.find((s) => s.kind === 'collect-specs-questionnaire');
    expect(q).toBeTruthy();
    expect(q!.tool).toBe('questionnaire.presentQuestionnaire');
    expect(q!.inputNeeded).toContain('dimensi (panjang × lebar atau luas)');
    // Kuesioner yang ADA dipakai — bukan duplikat: tool menunjuk modul questionnaire.
    expect(q!.selectionReason).toContain('kuesioner');
  });
});

describe('A3-03 / AGT-03 — proyek kompleks → rencana multi-langkah terbentuk', () => {
  it('kandang lengkap → rencana 7 langkah dengan dependensi berurutan', () => {
    const plan = kandangPlan();
    expect(plan.steps.length).toBe(7);
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds).toEqual([
      'understand-objective', 'collect-specs-questionnaire', 'validate-spec-chain',
      'generate-draft', 'verify-prices', 'present-draft', 'transfer-draft',
    ]);
    // Dependensi: draft tidak bisa jalan sebelum validasi spek.
    const gen = plan.steps.find((s) => s.kind === 'generate-draft')!;
    const val = plan.steps.find((s) => s.kind === 'validate-spec-chain')!;
    expect(gen.dependsOn).toContain(val.id);
    expect(nextReadyStep(plan)?.kind).toBe('collect-specs-questionnaire');
  });
  it('setiap langkah membawa alasan pemilihan tool yang dapat dijelaskan', () => {
    const plan = kandangPlan();
    for (const s of plan.steps) {
      expect(s.selectionReason.length).toBeGreaterThan(20);
      expect(s.tool.length).toBeGreaterThan(0);
      expect(STEP_TOOL_SELECTION[s.kind].tool).toBe(s.tool);
    }
  });
});

describe('A3-04 / AGT-04 — pengguna berubah arah → replan aman, sukses dipertahankan', () => {
  it('langkah sukses tidak diulang; iterasi bertambah; batas 5 iterasi ditegakkan', async () => {
    let plan = kandangPlan();
    // Selesaikan dua langkah pertama lewat runner sukses.
    const q = plan.steps.find((s) => s.kind === 'collect-specs-questionnaire')!;
    let r = await executeStep(plan, q.id, async () => ({ ok: true, result: 'Kuesioner dijawab: 17×9 m.' }));
    expect(r.ok).toBe(true);
    plan = r.plan;
    const val = plan.steps.find((s) => s.kind === 'validate-spec-chain')!;
    // Validasi butuh dependensi selesai — jalankan langsung (gate dependensi
    // adalah tanggung jawab pemanggil nextReadyStep, bukan executeStep).
    r = await executeStep(plan, val.id, async () => ({ ok: true, result: 'Validasi 6/6 lolos.' }));
    plan = r.plan;
    const succeededBefore = plan.steps.filter((s) => s.status === 'succeeded' && s.kind !== 'understand-objective').map((s) => s.description);
    const replanned = replanForNewObjective(plan, deriveObjective('Ganti jadi gudang baja 20 x 40, budget 500 jt', 'CREATE_RAB_SUMMARY'));
    expect(replanned.ok).toBe(true);
    expect(replanned.plan.iterationCount).toBe(2);
    expect(replanned.plan.objective.entities.categoryKey).toBe('gudang');
    for (const d of succeededBefore) {
      expect(replanned.plan.steps.some((s) => s.description === d && s.status === 'succeeded')).toBe(true);
    }
    expect(replanned.plan.recoveryNote).toContain('dipertahankan');
    // Batas iterasi: paksa sampai batas lalu tolak.
    let p = replanned.plan;
    for (let i = 0; i < AGENT_MAX_PLAN_ITERATIONS; i++) {
      const rr = replanForNewObjective(p, deriveObjective('Ganti lagi', 'CREATE_RAB_SUMMARY'));
      if (!rr.ok) break;
      p = rr.plan;
    }
    const over = replanForNewObjective(p, deriveObjective('Ganti lagi', 'CREATE_RAB_SUMMARY'));
    expect(over.ok).toBe(false);
    expect(over.error).toContain('Batas iterasi');
  });
});

describe('A3-05 / AGT-05 — "optimalkan biaya RAB" → analisis relevan, BUKAN direktori slash (menutup CHAT-01 jalur ini)', () => {
  it('objektif optimize-cost + rencana analisis atas draft nyata', () => {
    const obj = deriveObjective('optimalkan biaya RAB proyek ini, terlalu mahal', null);
    expect(obj.goal).toBe('optimize-cost');
    const plan = buildPlanForObjective(obj, { userId: null, projectId: PROJ, conversationId: CONV });
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds).toContain('analyze-costs');
    expect(kinds).toContain('identify-expensive-items');
    // Tidak ada langkah navigasi/direktori slash-command dalam rencana ini.
    expect(kinds).not.toContain('navigate');
    expect(plan.steps.every((s) => !s.tool.includes('slash') && s.action !== 'OPEN_TEMPLATE')).toBe(true);
  });
  it('analyzeDraftCosts menghitung dari item draft nyata (termahal + tak berharga jujur)', () => {
    const a = analyzeDraftCosts([
      { description: 'Pondasi batu kali', totalPrice: 12_000_000, priceStatus: 'PRICE_RESOLVED', unitPrice: 100000 },
      { description: 'Atap Galvalum', totalPrice: 45_000_000, priceStatus: 'PRICE_RESOLVED', unitPrice: 135600 },
      { description: 'Kolam renang custom', totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED', unitPrice: null },
    ]);
    expect(a.totalPricedRp).toBe(57_000_000);
    expect(a.unresolvedCount).toBe(1);
    expect(a.mostExpensive[0].description).toBe('Atap Galvalum');
    expect(a.suggestions.join(' ')).toContain('Atap Galvalum');
    expect(a.suggestions.join(' ')).toContain('parsial');
    const text = formatCostAnalysis(a);
    expect(text).toContain('Rp57.000.000');
  });
});

describe('A3-06 / AGT-06 — spek bertentangan → konflik diidentifikasi', () => {
  it('dua budget + dua material atap → conflicts tercatat, bukan dipilih diam-diam', () => {
    const obj = deriveObjective('Buatkan RAB kandang budget 300 jt, eh sebenarnya 250 jt, atap Galvalum atau Genteng', 'CREATE_RAB_SUMMARY');
    expect(obj.conflicts.length).toBeGreaterThanOrEqual(2);
    expect(obj.conflicts.map((c) => c.key)).toContain('budget');
    expect(obj.conflicts.map((c) => c.key)).toContain('roof_material');
  });
});

describe('A3-07 / AGT-07 — tugas tak didukung → batasan dijelaskan', () => {
  it('permintaan fiksi/luar cakupan → goal unsupported + langkah explain-limits', () => {
    const obj = deriveObjective('Buatkan RAB rumah di Mars, tandai sebagai fiksi', null);
    expect(obj.goal).toBe('unsupported');
    const plan = buildPlanForObjective(obj, { userId: null, projectId: PROJ, conversationId: CONV });
    expect(plan.steps.some((s) => s.kind === 'explain-limits')).toBe(true);
    expect(plan.steps.every((s) => s.consequence !== 'consequential')).toBe(true);
  });
});

describe('A3-08 / AGT-08 — hasil tool tak lengkap → hasil parsial dilaporkan jujur', () => {
  it('runner partial → partially-succeeded + hasil tersimpan, bukan karangan', async () => {
    const plan = kandangPlan();
    const gen = plan.steps.find((s) => s.kind === 'generate-draft')!;
    const r = await executeStep(plan, gen.id, async () => ({
      ok: true, partial: true, result: 'Draft tersusun 11 item; 2 item belum berharga (total parsial).',
    }));
    expect(r.ok).toBe(true);
    const step = r.plan.steps.find((s) => s.id === gen.id)!;
    expect(step.status).toBe('partially-succeeded');
    expect(step.result).toContain('belum berharga');
  });
});

describe('A3-09 / AGT-09 — tool sukses → sukses terverifikasi dilaporkan', () => {
  it('runner sukses → succeeded + result + completedAt', async () => {
    const plan = kandangPlan();
    const q = plan.steps.find((s) => s.kind === 'collect-specs-questionnaire')!;
    const r = await executeStep(plan, q.id, async () => ({ ok: true, result: 'Spek lengkap: 17×9 m, Galvalum.' }));
    expect(r.ok).toBe(true);
    const step = r.plan.steps.find((s) => s.id === q.id)!;
    expect(step.status).toBe('succeeded');
    expect(step.result).toContain('17×9');
    expect(step.completedAt).not.toBe(null);
  });
});

describe('A3-10 / AGT-10 — tool gagal → progres dipertahankan + pemulihan ditawarkan', () => {
  it('gagal di tengah: langkah sukses sebelumnya utuh, retry hanya langkah itu, maks 2×', async () => {
    let plan = kandangPlan();
    const q = plan.steps.find((s) => s.kind === 'collect-specs-questionnaire')!;
    let r = await executeStep(plan, q.id, async () => ({ ok: true, result: 'Spek lengkap.' }));
    plan = r.plan;
    const gen = plan.steps.find((s) => s.kind === 'generate-draft')!;
    r = await executeStep(plan, gen.id, async () => ({ ok: false, error: 'Katalog template tidak merespons (timeout).' }));
    expect(r.ok).toBe(false);
    plan = r.plan;
    expect(plan.steps.find((s) => s.id === q.id)!.status).toBe('succeeded');
    expect(plan.steps.find((s) => s.id === gen.id)!.status).toBe('failed');
    expect(plan.steps.find((s) => s.id === gen.id)!.error).toContain('timeout');
    // Follow-up mencantumkan langkah gagal + saran pemulihan.
    const fu = getPendingFollowUps(plan);
    expect(fu.some((f) => f.kind === 'failed-step')).toBe(true);
    expect(formatFollowUpMessage(plan)).toContain('Langkah gagal');
    // Retry 1× lalu 2× berhasil.
    let rr = retryStep(plan, gen.id);
    expect(rr.ok).toBe(true);
    expect(rr.plan.steps.find((s) => s.id === gen.id)!.retryCount).toBe(1);
    r = await executeStep(rr.plan, gen.id, async () => ({ ok: true, result: 'Draft tersusun.' }));
    expect(r.ok).toBe(true);
    // Batas retry: gagal 3× → retry ditolak.
    let p2 = kandangPlan();
    const g2 = p2.steps.find((s) => s.kind === 'generate-draft')!;
    for (let i = 0; i < 3; i++) {
      const fail = await executeStep(p2, g2.id, async () => ({ ok: false, error: 'gagal' }));
      p2 = fail.plan;
      const retry = retryStep(p2, g2.id);
      if (i < 2) { expect(retry.ok).toBe(true); p2 = retry.plan; }
      else expect(retry.ok).toBe(false);
    }
    // Skip sebagai opsi pemulihan ketiga.
    const sk = skipStep(p2, g2.id);
    expect(sk.ok).toBe(true);
    expect(sk.plan.steps.find((s) => s.id === g2.id)!.status).toBe('cancelled');
  });
});

describe('A3-11 / AGT-11 — pengguna pergi di tengah eksekusi → tugas dapat dipulihkan', () => {
  it('rencana dipersist (kunci saudara draftPersistence) dan utuh sesudah "reload" dingin', async () => {
    resetAll();
    let plan = kandangPlan();
    const q = plan.steps.find((s) => s.kind === 'collect-specs-questionnaire')!;
    const r = await executeStep(plan, q.id, async () => ({ ok: true, result: 'Spek lengkap.' }));
    plan = r.plan;
    expect(savePlan(plan)).toBe(true);
    // Simulasi reload: tidak ada state in-memory yang dipakai — baca ulang dari storage.
    const restored = loadPlan(plan.planId);
    expect(restored).not.toBe(null);
    expect(restored!.objective.entities.count?.value).toBe(20);
    expect(restored!.steps.find((s) => s.kind === 'collect-specs-questionnaire')!.status).toBe('succeeded');
    expect(restored!.steps.find((s) => s.kind === 'generate-draft')!.status).toBe('planned');
    expect(loadActivePlanForProject(PROJ, CONV)?.planId).toBe(plan.planId);
    // Kunci storage adalah kunci saudara pola draftPersistence (bukan dist repo).
    expect(store[AI_AGENT_PLANS_STORAGE_KEY]).toContain(plan.planId);
  });
});

describe('A3-12 / AGT-12 — pengguna kembali → konteks tugas dipulihkan', () => {
  it('follow-up menyajikan draft belum ditransfer + langkah berikut yang disarankan', () => {
    resetAll();
    const plan = kandangPlan();
    // Tandai draft tersusun, transfer masih menunggu.
    const gen = plan.steps.find((s) => s.kind === 'generate-draft')!;
    gen.status = 'succeeded';
    gen.result = 'Draft tersusun 11 item.';
    savePlan(plan);
    const restored = loadActivePlanForProject(PROJ, CONV)!;
    const fu = getPendingFollowUps(restored);
    expect(fu.some((f) => f.kind === 'draft-not-transferred')).toBe(true);
    const msg = formatFollowUpMessage(restored);
    expect(msg).toContain('belum dipindahkan ke proyek');
    expect(msg).toContain('Setujui pemindahan');
    // Tanpa pekerjaan tertunda → tidak ada pesan follow-up (anti-spam).
    const done = kandangPlan();
    done.steps.forEach((s) => { s.status = 'succeeded'; });
    done.objective.missing = [];
    expect(formatFollowUpMessage(done)).toBe(null);
  });
});

describe('A3-GATE — approval gate ditegakkan di kode (bukan hanya prompt)', () => {
  it('transfer-draft tanpa persetujuan → runner TIDAK dipanggil; approval model ditolak; approval user membuka jalan', async () => {
    const plan = kandangPlan();
    const transfer = plan.steps.find((s) => s.kind === 'transfer-draft')!;
    expect(stepRequiresApproval(transfer)).toBe(true);
    expect(transfer.status).toBe('awaiting-approval');
    let runnerCalled = false;
    let r = await executeStep(plan, transfer.id, async () => { runnerCalled = true; return { ok: true, result: 'Ditransfer.' }; });
    expect(r.ok).toBe(false);
    expect(runnerCalled).toBe(false);
    expect(r.error).toContain('APPROVAL_REQUIRED');
    // Model tidak pernah memberi dirinya izin.
    const selfGrant = approveStep(plan, transfer.id, 'model');
    expect(selfGrant.ok).toBe(false);
    expect(selfGrant.error).toContain('APPROVAL_SELF_GRANT_DENIED');
    const sysGrant = approveStep(plan, transfer.id, 'system');
    expect(sysGrant.ok).toBe(false);
    // Pengguna menyetujui → eksekusi berjalan.
    const approved = approveStep(r.plan, transfer.id, 'user');
    expect(approved.ok).toBe(true);
    r = await executeStep(approved.plan, transfer.id, async () => { runnerCalled = true; return { ok: true, result: 'Draft dipindahkan ke proyek.' }; });
    expect(r.ok).toBe(true);
    expect(runnerCalled).toBe(true);
    expect(r.plan.steps.find((s) => s.id === transfer.id)!.status).toBe('succeeded');
    // Langkah baca-saja tidak butuh persetujuan.
    const readOnly = plan.steps.find((s) => s.kind === 'verify-prices')!;
    expect(stepRequiresApproval(readOnly)).toBe(false);
    const needless = approveStep(plan, readOnly.id, 'user');
    expect(needless.ok).toBe(false);
    // Penolakan pengguna membatalkan tanpa eksekusi.
    const denied = denyStep(plan, transfer.id, 'user');
    expect(denied.ok).toBe(true);
    expect(denied.plan.steps.find((s) => s.id === transfer.id)!.status).toBe('cancelled');
  });
});

describe('A3-MEM — konsolidasi long-term deterministik; ekstraksi LLM tidak dibangun', () => {
  beforeEach(() => { resetAll(); });
  function seedDecision(key: string, value: string, quality: 'confirmed-fact' | 'user-assumption' = 'confirmed-fact'): void {
    const created = createMemoryRecord({
      userId: null, projectId: PROJ, conversationId: null,
      memoryKey: key, layer: 'project', memoryType: 'decision',
      content: `Keputusan: ${value}`,
      structuredPayload: { value },
      sourceMessageId: null, sourceType: 'user-message',
      provenance: 'pesan pengguna (seed tes)',
      quality, confidence: 0.9, importance: 3,
    });
    if (!created.ok) throw new Error(created.message);
    const saved = saveMemory(created.value);
    if (!saved.ok) throw new Error(saved.message);
  }
  it('keputusan terkonfirmasi → long-term dengan provenans; asumsi dilewati; idempoten', () => {
    seedDecision('spec:roof_material', 'Material atap: Galvalum', 'confirmed-fact');
    seedDecision('spec:floor_type', 'Lantai: keramik (asumsi)', 'user-assumption');
    const res = consolidateToLongTerm(scope);
    expect(res.promoted).toBe(1);
    expect(res.promotedKeys).toContain('lt:spec:roof_material');
    const lt = getCurrentMemory(scope, 'lt:spec:roof_material');
    expect(lt).not.toBe(null);
    expect(lt!.layer).toBe('long-term');
    expect(lt!.provenance).toContain('konsolidasi deterministik Fase 3');
    expect(lt!.structuredPayload['derivedFrom']).toBeTruthy();
    // Idempoten: konsolidasi kedua tidak menduplikasi.
    const res2 = consolidateToLongTerm(scope);
    expect(res2.promoted).toBe(0);
    expect(res2.skippedReasons.join(' ')).toContain('sudah ada long-term');
  });
  it('ekstraksi LLM menolak eksplisit (NOT_BUILT) — bukan dipaksakan', () => {
    const r = requestLlmMemoryExtraction();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('LLM_EXTRACTION_NOT_BUILT');
  });
});

describe('A3-CTX — objektif dipakai builder kanonis (seksi ke-10, cap 800)', () => {
  it('seksi OBJEKTIF hadir; prompt ≤ 16.000; formatPlanSummary jujur', () => {
    const obj = kandangObjective();
    const built = buildCanonicalContext({
      userId: null, projectId: PROJ, conversationId: CONV,
      messages: [{ role: 'user', content: 'Saya mau bangun kandang sapi 20 ekor, ukuran 17 m x 9 m, atap Galvalum, budget 300 jt' }],
      objectiveSection: formatObjectiveSection(obj),
    });
    expect(built.dataBlock).toContain('OBJEKTIF TUGAS');
    expect(built.dataBlock).toContain('Kandang / fasilitas peternakan');
    expect(built.dataBlock).toContain('20 ekor');
    expect(built.report.budget.objective).toBe(800);
    expect(built.report.promptChars).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(built.report.sections.objective.included).toBe(1);
    const summary = formatPlanSummary(kandangPlan());
    expect(summary).toContain('Rencana:');
    expect(summary).toContain('Memindahkan draft ke proyek');
  });
  it('secret tidak masuk objektif/rencana', () => {
    const obj = deriveObjective('Buatkan RAB rumah, api-key saya sk-abcdefgh12345678', 'CREATE_RAB_SUMMARY');
    expect(obj.sourceText).not.toContain('sk-abcdefgh');
    expect(obj.sourceText).toContain('kredensial');
  });
});
