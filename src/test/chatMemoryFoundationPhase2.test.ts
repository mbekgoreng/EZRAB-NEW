/**
 * chatMemoryFoundationPhase2.test.ts — FASE 2 Permanent Memory Foundation
 * (AI Intelligence Overhaul, direktif owner 2026-11-12 Part 15 Fase 2,
 * Part 4 + Part 16 A MEM-01…12).
 *
 * Membuktikan fondasi memori terstruktur 6 lapis (memory.ts) di atas pola
 * yang ADA (amplop berversi hardenedStorage + kunci saudara
 * draftPersistence): model record, pipeline tulis deterministik,
 * resolusi konflik, retrieval ter-skop + ranking, versioning/provenans/
 * retensi/penghapusan, kontrol pengguna, dan kejujuran arsitektur
 * (localStorage-only = BUKAN memori permanen lintas-perangkat).
 *
 * Kelas bukti: mock terkendali (localStorage shim; providerClient
 * di-stub bila dipakai) + builder kanonis murni. Provider nyata NOT RUN;
 * lintas-perangkat NOT RUN/BLOCKED tanpa auth (MEM-02/MEM-08 jujur).
 * UI browser dibuktikan E2E terpisah.
 *
 * Jalankan: npx tsx src/test/chatMemoryFoundationPhase2.test.ts
 * (pola runner vitest-shim gelombang sebelumnya).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMemoryRecord,
  saveMemory,
  listMemories,
  getCurrentMemory,
  storeMemoryWithConflictResolution,
  correctMemory,
  deleteMemory,
  deleteMemoriesForConversation,
  extractMemoryCandidates,
  extractSpecMemories,
  ingestMemoryCandidates,
  retrieveMemories,
  formatMemorySection,
  getPreferences,
  setPreference,
  isPersonalizationEnabled,
  applyPersonalizationGate,
  formatPreferenceLines,
  isMemoryExpired,
  purgeExpiredMemories,
  getMemoryReport,
  containsSecret,
  getMemoryTombstone,
  MEMORY_HONEST_LABEL,
  AI_MEMORY_STORAGE_KEY,
  AI_PREFERENCE_STORAGE_KEY,
  MEMORY_SECTION_BUDGET,
  MEMORY_MAX_RETRIEVED,
  type MemoryScope,
  type MemoryRecord,
} from '../ai-tools/ezrab-ai/memory';
import {
  buildCanonicalContext,
  CANONICAL_TOTAL_PROMPT_BUDGET,
} from '../ai-tools/ezrab-ai/canonicalContext';
import { buildProjectSnapshot } from '../ai-tools/ezrab-ai/projectContext';
import { UnifiedConversationStore } from '../services/ai/conversation/unifiedConversationStore';
import { getLastUniversalDraft, setLastUniversalDraft, clearLastUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';

/* ---------------- localStorage shim (pola draftPersistenceHardening) -- */
const store: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as { window?: unknown }).window = globalThis;

const PROJ_A = 'proj-A';
const PROJ_B = 'proj-B';
const CONV_A = 'conv-A';
const scopeA: MemoryScope = { userId: null, projectId: PROJ_A, conversationId: CONV_A };
const scopeB: MemoryScope = { userId: null, projectId: PROJ_B, conversationId: 'conv-B' };

function resetAll(): void {
  for (const k of Object.keys(store)) delete store[k];
  UnifiedConversationStore.resetInstance();
  clearLastUniversalDraft();
}

function seedProjectDecision(projectId: string, value = 'Galvalum'): MemoryRecord {
  const scope: MemoryScope = { userId: null, projectId, conversationId: null };
  const created = createMemoryRecord({
    userId: null,
    projectId,
    conversationId: null,
    memoryKey: 'spec:roof_material',
    layer: 'project',
    memoryType: 'decision',
    content: `Keputusan: Material atap: ${value}`,
    structuredPayload: { value, label: 'Material atap' },
    sourceMessageId: null,
    sourceType: 'user-message',
    provenance: 'pesan pengguna (seed tes)',
    quality: 'confirmed-fact',
    confidence: 0.85,
    importance: 3,
  });
  if (!created.ok) throw new Error(created.message);
  const saved = saveMemory(created.value);
  if (!saved.ok) throw new Error(saved.message);
  return created.value;
}

function seedBudget(projectId: string, amount: number): MemoryRecord {
  const created = createMemoryRecord({
    userId: null,
    projectId,
    conversationId: null,
    memoryKey: 'spec:budget',
    layer: 'project',
    memoryType: 'fact',
    content: `Budget proyek: Rp${amount.toLocaleString('id-ID')}`,
    structuredPayload: { value: amount, label: 'Budget proyek' },
    sourceMessageId: null,
    sourceType: 'user-message',
    provenance: 'pesan pengguna (seed tes)',
    quality: 'confirmed-fact',
    confidence: 0.9,
    importance: 3,
  });
  if (!created.ok) throw new Error(created.message);
  const saved = saveMemory(created.value);
  if (!saved.ok) throw new Error(saved.message);
  return created.value;
}

beforeEach(() => resetAll());

describe('M2-01 / MEM-01 — lanjut percakapan sesudah navigasi (di atas runtime lifecycle)', () => {
  it('memori proyek yang tersimpan tetap dapat diambil sesudah "navigasi" (baca ulang store dingin)', () => {
    seedProjectDecision(PROJ_A);
    // Simulasi navigasi: tidak ada state in-memory yang dipertahankan di
    // modul memori — setiap baca datang dari localStorage dingin.
    const again = listMemories(scopeA, { statuses: ['current'] });
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error('unreachable');
    expect(again.value.some((r) => r.content.includes('Galvalum'))).toBe(true);
    const retrieved = retrieveMemories(scopeA, 'atap rumah saya pakai apa?');
    expect(retrieved.selected.some((r) => r.memoryKey === 'spec:roof_material')).toBe(true);
    expect(retrieved.report.selected).toBeGreaterThan(0);
  });

  it('builder kanonis memakai memori itu (bukan riwayat mentah) sesudah navigasi', () => {
    seedProjectDecision(PROJ_A);
    const retrieved = retrieveMemories(scopeA, 'atap');
    const built = buildCanonicalContext({
      userId: null,
      projectId: PROJ_A,
      conversationId: CONV_A,
      messages: [{ role: 'user', content: 'lanjutkan atapnya' }],
      memorySection: formatMemorySection(retrieved.selected),
      memoryReport: retrieved.report,
    });
    expect(built.dataBlock).toContain('MEMORI TERSIMPAN');
    expect(built.dataBlock).toContain('Galvalum');
    expect(built.report.sections.memory.chars).toBeGreaterThan(0);
    expect(built.report.retrieval.memory?.selected).toBeGreaterThan(0);
  });
});

describe('M2-02 / MEM-02 — sesi baru: memori relevan diambil (dalam-perangkat); lintas-perangkat JUJUR', () => {
  it('sesi baru (percakapan baru, proyek sama) mengambil memori proyek lama', () => {
    seedProjectDecision(PROJ_A);
    const newSessionScope: MemoryScope = { userId: null, projectId: PROJ_A, conversationId: 'conv-BARU' };
    const retrieved = retrieveMemories(newSessionScope, 'material atap');
    expect(retrieved.selected.some((r) => r.content.includes('Galvalum'))).toBe(true);
  });

  it('JUJUR: label memori menyatakan lokal per-perangkat — bukan klaim lintas-perangkat', () => {
    expect(MEMORY_HONEST_LABEL).toContain('belum lintas-perangkat');
    expect(MEMORY_HONEST_LABEL).toContain('per-perangkat');
    // Store-nya localStorage semata: tidak ada kunci server/sinkronisasi.
    expect(AI_MEMORY_STORAGE_KEY.startsWith('ezrab_prod_ai_')).toBe(true);
    seedProjectDecision(PROJ_A);
    expect(Object.keys(store)).toContain(AI_MEMORY_STORAGE_KEY);
    expect(Object.keys(store).some((k) => k.includes('supabase') || k.includes('sync'))).toBe(false);
  });
});

describe('M2-03 / MEM-03 — tanya spek proyek sebelumnya → jawaban benar (via retrieval)', () => {
  it('retrieval mengembalikan spek terkonfirmasi dari structuredSpecs (bukan tebakan)', () => {
    const specs = [
      { key: 'roof_material', kind: 'select', label: 'Material atap', value: 'Galvalum', status: 'CONFIRMED', source: 'questionnaire', updatedAt: '2026-11-12T00:00:00.000Z' },
      { key: 'floors', kind: 'number', label: 'Jumlah lantai', value: 2, unit: 'lantai', status: 'CONFIRMED', source: 'questionnaire', updatedAt: '2026-11-12T00:00:00.000Z' },
    ] as never;
    const cands = extractSpecMemories(specs, scopeA);
    expect(cands).toHaveLength(2);
    expect(cands[0].quality).toBe('confirmed-fact');
    const ingested = ingestMemoryCandidates(cands, scopeA, 'structuredSpecs v2 (seed tes)');
    expect(ingested.every((r) => r.resolution !== null)).toBe(true);
    const retrieved = retrieveMemories(scopeA, 'berapa lantai dan atapnya?');
    const texts = retrieved.selected.map((r) => r.content).join('\n');
    expect(texts).toContain('Galvalum');
    expect(texts).toContain('Jumlah lantai: 2');
  });

  it('spek ASSUMPTION disimpan sebagai user-assumption — TIDAK PERNAH confirmed-fact', () => {
    const specs = [
      { key: 'roof_material', kind: 'select', label: 'Material atap', value: 'Spandek', status: 'ASSUMPTION', source: 'intake-guess', updatedAt: '2026-11-12T00:00:00.000Z' },
    ] as never;
    const cands = extractSpecMemories(specs, scopeA);
    expect(cands[0].quality).toBe('user-assumption');
    expect(cands[0].confidence).toBeLessThan(0.9);
  });
});

describe('M2-04 / MEM-04 — ubah satu spek → hanya field itu berubah', () => {
  it('koreksi budget hanya mengganti record budget; record atap tetap current & utuh', () => {
    const roof = seedProjectDecision(PROJ_A, 'Galvalum');
    const budget = seedBudget(PROJ_A, 300_000_000);
    const corrected = correctMemory(budget.memoryId, 'Budget proyek: Rp250.000.000', scopeA);
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) throw new Error('unreachable');
    expect(corrected.value.content).toContain('250.000.000');
    const roofNow = getCurrentMemory(scopeA, 'spec:roof_material');
    expect(roofNow?.memoryId).toBe(roof.memoryId);
    expect(roofNow?.content).toContain('Galvalum');
    const budgetNow = getCurrentMemory(scopeA, 'spec:budget');
    expect(budgetNow?.memoryId).toBe(corrected.value.memoryId);
    expect(budgetNow?.content).toContain('250.000.000');
    const history = listMemories(scopeA, { statuses: ['current', 'superseded'] });
    if (!history.ok) throw new Error('unreachable');
    expect(history.value.some((r) => r.memoryId === budget.memoryId && r.status === 'superseded')).toBe(true);
  });
});

describe('M2-05 / MEM-05 — info bertentangan → konflik terdeteksi (bukan dipilih diam-diam)', () => {
  it('nilai baru tanpa penanda penggantian eksplisit → contradictory, lama tetap current', () => {
    seedProjectDecision(PROJ_A, 'Galvalum');
    const candidate = createMemoryRecord({
      userId: null,
      projectId: PROJ_A,
      conversationId: null,
      memoryKey: 'spec:roof_material',
      layer: 'project',
      memoryType: 'decision',
      content: 'Keputusan: Material atap: Genteng',
      structuredPayload: { value: 'Genteng', label: 'Material atap' },
      sourceMessageId: null,
      sourceType: 'user-message',
      provenance: 'pesan pengguna (seed tes)',
      quality: 'confirmed-fact',
      confidence: 0.85,
      importance: 3,
    });
    if (!candidate.ok) throw new Error(candidate.message);
    const res = storeMemoryWithConflictResolution(candidate.value, scopeA);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.value.kind).toBe('contradiction-flagged');
    // Lama tetap current; kandidat bertentangan TIDAK masuk retrieval.
    expect(getCurrentMemory(scopeA, 'spec:roof_material')?.content).toContain('Galvalum');
    const retrieved = retrieveMemories(scopeA, 'atap');
    expect(retrieved.selected.every((r) => !r.content.includes('Genteng'))).toBe(true);
    const report = getMemoryReport(scopeA);
    expect(report.conflicts).toBe(1);
  });
});

describe('M2-06 / MEM-06 — koreksi eksplisit → baru current, lama superseded & tersimpan', () => {
  it('"ganti atap menjadi Genteng" → supersede; histori lama tetap ada', () => {
    seedProjectDecision(PROJ_A, 'Galvalum');
    const cands = extractMemoryCandidates('ganti atap menjadi Genteng', scopeA);
    expect(cands).toHaveLength(1);
    expect(cands[0].sourceType).toBe('user-correction');
    const ingested = ingestMemoryCandidates(cands, scopeA, 'pesan pengguna (tes M2-06)');
    expect(ingested[0].resolution?.kind).toBe('superseded');
    expect(getCurrentMemory(scopeA, 'spec:roof_material')?.content).toContain('Genteng');
    const history = listMemories(scopeA, { statuses: ['current', 'superseded'] });
    if (!history.ok) throw new Error('unreachable');
    const old = history.value.find((r) => r.content.includes('Galvalum'));
    expect(old?.status).toBe('superseded');
    expect(old?.quality).toBe('superseded');
  });

  it('ekstraksi TIDAK mengarang: teks tanpa pola eksplisit → nol kandidat', () => {
    expect(extractMemoryCandidates('halo, apa kabar hari ini?', scopeA)).toHaveLength(0);
    expect(extractMemoryCandidates('saya mau bangun rumah', scopeA)).toHaveLength(0);
    expect(extractMemoryCandidates('mungkin atapnya genteng kali ya', scopeA)).toHaveLength(0);
  });

  it('REGRESI E2E F2-5: "Saya mau bangun kandang ... atap Galvalum" BUKAN preferensi material', () => {
    const cands = extractMemoryCandidates(
      'Saya mau bangun kandang ayam 17 m x 9 m, luas atap 170 m2, budget Rp300.000.000, atap Galvalum, kapasitas 5000 ekor',
      scopeA,
    );
    // Budget TETAP terekstrak (fakta eksplisit); preferensi TIDAK BOLEH ada.
    expect(cands.some((c) => c.memoryType === 'preference')).toBe(false);
    expect(cands.some((c) => c.memoryKey === 'spec:budget')).toBe(true);
    // Kontrol positif: preferensi eksplisit yang singkat tetap terbaca.
    const pos = extractMemoryCandidates('saya lebih suka atap Galvalum', scopeA);
    expect(pos).toHaveLength(1);
    expect(pos[0].memoryType).toBe('preference');
    expect(pos[0].structuredPayload.value).toBe('galvalum');
    const pos2 = extractMemoryCandidates('oke, pakai atap Galvalum', scopeA);
    expect(pos2.some((c) => c.memoryType === 'decision')).toBe(true);
  });
});

describe('M2-07 / MEM-07 — multi-proyek: isolasi ketat', () => {
  it('memori proyek A TIDAK PERNAH ter-retrieval di skop proyek B (dan sebaliknya)', () => {
    seedProjectDecision(PROJ_A, 'Galvalum');
    seedProjectDecision(PROJ_B, 'Genteng');
    const inB = retrieveMemories(scopeB, 'atap');
    expect(inB.selected.every((r) => (r.projectId ?? null) === PROJ_B)).toBe(true);
    expect(inB.selected.some((r) => r.content.includes('Galvalum'))).toBe(false);
    expect(inB.report.droppedCrossScope).toBeGreaterThanOrEqual(1);
    const inA = retrieveMemories(scopeA, 'atap');
    expect(inA.selected.some((r) => r.content.includes('Genteng'))).toBe(false);
  });

  it('ARS-06: singleton draft terikat proyek — getLastUniversalDraft(proyek lain) = null', () => {
    // Draft diikat lewat setter langsung (tanpa jalur build berat):
    const fake = { id: 'd-1', title: 'Draft A', version: 1 } as never;
    setLastUniversalDraft(fake, PROJ_A);
    expect(getLastUniversalDraft(PROJ_A)?.id).toBe('d-1');
    expect(getLastUniversalDraft(PROJ_B)).toBeNull();
    expect(getLastUniversalDraft()).not.toBeNull(); // pemanggil tanpa arg = perilaku lama
    clearLastUniversalDraft(PROJ_A);
    expect(getLastUniversalDraft(PROJ_A)).toBeNull();
  });
});

describe('M2-08 / MEM-08 — multi-user: isolasi ketat — BLOCKED tanpa identitas', () => {
  it('BLOCKED: aplikasi tidak pernah memasok userId (selalu null) sehingga isolasi antar-user TIDAK BOLEH dinyatakan VERIFIED', () => {
    // Mekanik skop bekerja: record user 'u1' tidak terlihat skop 'u2'.
    const created = createMemoryRecord({
      userId: 'u1',
      projectId: PROJ_A,
      conversationId: null,
      memoryKey: 'spec:roof_material',
      layer: 'project',
      memoryType: 'decision',
      content: 'Keputusan: Material atap: Galvalum',
      structuredPayload: { value: 'Galvalum' },
      sourceMessageId: null,
      sourceType: 'user-message',
      provenance: 'seed tes',
      quality: 'confirmed-fact',
      confidence: 0.9,
      importance: 3,
    });
    if (!created.ok) throw new Error(created.message);
    expect(saveMemory(created.value).ok).toBe(true);
    const asU2 = retrieveMemories({ userId: 'u2', projectId: PROJ_A }, 'atap');
    expect(asU2.selected).toHaveLength(0);
    // Namun aplikasi (view/service) SELALU memanggil dengan userId null
    // (AUTH_ENABLED=false) — jadi dalam pemakaian nyata semua pengguna
    // berbagi skop anon; klaim isolasi antar-user = BLOCKED, bukan PASS.
    const anonScope: MemoryScope = { userId: null, projectId: PROJ_A };
    const asAnon = retrieveMemories(anonScope, 'atap');
    expect(asAnon.selected).toHaveLength(0); // record u1 tidak bocor ke anon
    // Bukti status: tidak ada identitas yang dipasok di mana pun di
    // jalur produk — dicatat sebagai BLOCKED di laporan Fase 2.
    expect(MEMORY_HONEST_LABEL).toContain('belum lintas-perangkat');
  });
});

describe('M2-09 / MEM-09 — percakapan panjang: konteks relevan dipertahankan (di atas builder Fase 1)', () => {
  it('30 pesan + memori: fakta + memori hadir, prompt ≤ 16.000, seksi memori ≤ 1.500', () => {
    seedProjectDecision(PROJ_A, 'Galvalum');
    seedBudget(PROJ_A, 300_000_000);
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: i === 29 ? 'jadi atapnya tetap Galvalum ya?' : `pesan pengisi ${i} tentang kolam dan taman`,
    }));
    const retrieved = retrieveMemories(scopeA, 'atap Galvalum');
    const snapshot = buildProjectSnapshot({ id: PROJ_A, name: 'Rumah Demo' } as never, [] as never);
    const built = buildCanonicalContext({
      userId: null,
      projectId: PROJ_A,
      conversationId: CONV_A,
      messages,
      projectSnapshot: snapshot,
      memorySection: formatMemorySection(retrieved.selected),
      memoryReport: retrieved.report,
    });
    expect(built.report.promptChars).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(built.report.sections.memory.chars).toBeLessThanOrEqual(MEMORY_SECTION_BUDGET);
    expect(built.dataBlock).toContain('Galvalum');
    expect(built.report.sections.facts.chars).toBeGreaterThan(0);
  });
});

describe('M2-10 / MEM-10 — hapus memori → tidak dapat diambil lagi (termasuk via ringkasan/indeks)', () => {
  it('deleteMemory: record + turunan hilang dari retrieval & dari seksi builder', () => {
    const parent = seedProjectDecision(PROJ_A, 'Galvalum');
    const child = createMemoryRecord({
      userId: null,
      projectId: PROJ_A,
      conversationId: null,
      memoryKey: 'derived:roof-note',
      layer: 'project',
      memoryType: 'fact',
      content: 'Catatan turunan: Galvalum tahan karat',
      structuredPayload: { value: 'tahan karat', derivedFrom: parent.memoryId },
      sourceMessageId: null,
      sourceType: 'system-consolidation',
      provenance: 'turunan dari memori atap',
      quality: 'ai-suggestion',
      confidence: 0.5,
      importance: 1,
    });
    if (!child.ok) throw new Error(child.message);
    expect(saveMemory(child.value).ok).toBe(true);
    const del = deleteMemory(parent.memoryId, scopeA);
    expect(del.ok).toBe(true);
    if (!del.ok) throw new Error('unreachable');
    expect(del.value.deleted).toBe(2); // induk + turunan
    const retrieved = retrieveMemories(scopeA, 'Galvalum atap');
    expect(retrieved.selected).toHaveLength(0);
    const listed = listMemories(scopeA, { statuses: ['current', 'superseded', 'contradictory'] });
    if (!listed.ok) throw new Error('unreachable');
    expect(listed.value).toHaveLength(0);
    // Indeks retrieval dibangun ulang dari store tiap baca — tidak ada
    // indeks basi yang bisa mengembalikan record yang dihapus.
    const built = buildCanonicalContext({
      userId: null,
      projectId: PROJ_A,
      conversationId: CONV_A,
      messages: [{ role: 'user', content: 'atapnya apa?' }],
      memorySection: formatMemorySection(retrieveMemories(scopeA, 'atap').selected),
      memoryReport: retrieveMemories(scopeA, 'atap').report,
    });
    expect(built.dataBlock).not.toContain('Galvalum');
  });

  it('deleteConversation menyebar ke memori percakapan (penghapusan turunan)', () => {
    const convStore = UnifiedConversationStore.getInstance();
    const conv = convStore.createConversation(PROJ_A, 'Percakapan tes');
    const created = createMemoryRecord({
      userId: null,
      projectId: PROJ_A,
      conversationId: conv.id,
      memoryKey: 'conv:note',
      layer: 'conversation',
      memoryType: 'fact',
      content: 'Catatan percakapan tes',
      structuredPayload: { value: 'tes' },
      sourceMessageId: null,
      sourceType: 'user-message',
      provenance: 'pesan pengguna (tes)',
      quality: 'confirmed-fact',
      confidence: 0.8,
      importance: 1,
    });
    if (!created.ok) throw new Error(created.message);
    expect(saveMemory(created.value).ok).toBe(true);
    expect(convStore.deleteConversation(conv.id, PROJ_A)).toBe(true);
    expect(deleteMemoriesForConversation(conv.id, PROJ_A, null)).toBe(0); // sudah ter-purge oleh deleteConversation
    const listed = listMemories({ userId: null, projectId: PROJ_A, conversationId: conv.id }, { statuses: ['current'] });
    if (!listed.ok) throw new Error('unreachable');
    expect(listed.value).toHaveLength(0);
  });

  it('REGRESI anti-bangkit: ingest OTOMATIS tidak membuat ulang memori yang dihapus; koreksi eksplisit boleh', () => {
    const rec = seedProjectDecision(PROJ_A, 'Galvalum');
    expect(deleteMemory(rec.memoryId, scopeA).ok).toBe(true);
    expect(getMemoryTombstone(scopeA, 'spec:roof_material')).not.toBeNull();
    // Ingest otomatis dari spek v2 (sumber masih hidup) DIBLOKIR.
    const specCands = extractSpecMemories(
      [{ key: 'roof_material', kind: 'select', label: 'Material atap', value: 'Galvalum', status: 'CONFIRMED', source: 'questionnaire', updatedAt: '2026-11-12T00:00:00.000Z' }] as never,
      scopeA,
    );
    const ingested = ingestMemoryCandidates(specCands, scopeA, 'structuredSpecs v2 (tes)');
    expect(ingested[0].resolution).toBeNull();
    expect(ingested[0].error ?? '').toContain('MEMORY_TOMBSTONED');
    expect(getCurrentMemory(scopeA, 'spec:roof_material')).toBeNull();
    // Pernyataan eksplisit pengguna justru menghapus tombstone & membuat ulang.
    const explicit = extractMemoryCandidates('ganti atap menjadi Spandek', scopeA);
    const ingested2 = ingestMemoryCandidates(explicit, scopeA, 'pesan pengguna (tes)');
    expect(ingested2[0].resolution).not.toBeNull();
    expect(getMemoryTombstone(scopeA, 'spec:roof_material')).toBeNull();
    expect(getCurrentMemory(scopeA, 'spec:roof_material')?.content).toContain('Spandek');
  });
});

describe('M2-11 / MEM-11 — personalisasi dinonaktifkan → preferensi tidak dipakai', () => {
  it('gerbang personalisasi: preferensi keluar dari prompt; fakta proyek tetap', () => {
    const pref = createMemoryRecord({
      userId: null,
      projectId: null,
      conversationId: null,
      memoryKey: 'pref:material:galvalum',
      layer: 'preference',
      memoryType: 'preference',
      content: 'Preferensi material: galvalum',
      structuredPayload: { value: 'galvalum' },
      sourceMessageId: null,
      sourceType: 'user-message',
      provenance: 'pesan pengguna (tes)',
      quality: 'user-assumption',
      confidence: 0.75,
      importance: 2,
    });
    if (!pref.ok) throw new Error(pref.message);
    expect(saveMemory(pref.value).ok).toBe(true);
    seedProjectDecision(PROJ_A, 'Galvalum');
    const off = setPreference(null, 'personalizationEnabled', false);
    expect(off.ok).toBe(true);
    expect(isPersonalizationEnabled(null)).toBe(false);
    expect(formatPreferenceLines(getPreferences(null))).toHaveLength(0);
    const retrieved = retrieveMemories(scopeA, 'galvalum');
    const gated = applyPersonalizationGate(retrieved.selected, getPreferences(null));
    expect(gated.some((r) => r.layer === 'preference')).toBe(false);
    expect(gated.some((r) => r.memoryKey === 'spec:roof_material')).toBe(true);
    const on = setPreference(null, 'personalizationEnabled', true);
    expect(on.ok).toBe(true);
    const gatedOn = applyPersonalizationGate(retrieveMemories(scopeA, 'galvalum').selected, getPreferences(null));
    expect(gatedOn.some((r) => r.layer === 'preference')).toBe(true);
  });

  it('preferensi hanya menerima kunci & nilai allowlist (tanpa inferensi atribut sensitif)', () => {
    const bad = setPreference(null, 'rabPresentation', 'mevvah-sekali' as never);
    expect(bad.ok).toBe(false);
    const prefs = getPreferences(null);
    expect(prefs.rabPresentation).toBe('ringkas'); // default tak berubah
    expect(Object.keys(getPreferences(null)).sort()).toEqual(
      ['detailLevel', 'language', 'personalizationEnabled', 'rabPresentation', 'updatedAt', 'workflowStyle'].sort(),
    );
  });
});

describe('M2-12 / MEM-12 — retrieval gagal → fallback jujur, tanpa recall karangan', () => {
  it('store memori korup → retrieval fail-closed kosong; builder tetap jalan tanpa memori', () => {
    store[AI_MEMORY_STORAGE_KEY] = '{bukan-json-yang-sah';
    const retrieved = retrieveMemories(scopeA, 'atap');
    expect(retrieved.selected).toHaveLength(0);
    expect(retrieved.report.considered).toBe(0);
    const built = buildCanonicalContext({
      userId: null,
      projectId: PROJ_A,
      conversationId: CONV_A,
      messages: [{ role: 'user', content: 'atapnya apa?' }],
      memorySection: null,
      memoryReport: null,
    });
    expect(built.dataBlock).toContain('(tidak ada memori relevan / personalisasi nonaktif)');
    expect(built.report.promptChars).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
  });

  it('secret TIDAK PERNAH masuk memori (penjaga pola)', () => {
    expect(containsSecret('api_key saya adalah sk-abcdefgh12345678')).toBe(true);
    expect(containsSecret('password: rahasia123')).toBe(true);
    const created = createMemoryRecord({
      userId: null,
      projectId: PROJ_A,
      conversationId: null,
      memoryKey: 'fact:note',
      layer: 'project',
      memoryType: 'fact',
      content: 'api_key saya adalah sk-abcdefgh12345678',
      structuredPayload: { value: 'x' },
      sourceMessageId: null,
      sourceType: 'user-message',
      provenance: 'tes',
      quality: 'confirmed-fact',
      confidence: 0.9,
      importance: 1,
    });
    expect(created.ok).toBe(false);
    if (created.ok) throw new Error('unreachable');
    expect(created.error).toBe('MEMORY_SECRET_REJECTED');
    expect(extractMemoryCandidates('api_key saya sk-abcdefgh12345678', scopeA)).toHaveLength(0);
  });

  it('retensi eksplisit: memori percakapan >90 hari kedaluwarsa & ter-purge; proyek tidak', () => {
    const old = createMemoryRecord({
      userId: null,
      projectId: PROJ_A,
      conversationId: CONV_A,
      memoryKey: 'conv:old',
      layer: 'conversation',
      memoryType: 'fact',
      content: 'Catatan lama',
      structuredPayload: { value: 'lama' },
      sourceMessageId: null,
      sourceType: 'user-message',
      provenance: 'tes',
      quality: 'confirmed-fact',
      confidence: 0.8,
      importance: 1,
    });
    if (!old.ok) throw new Error(old.message);
    const aged: MemoryRecord = {
      ...old.value,
      createdAt: new Date(Date.now() - 100 * 86_400_000).toISOString(),
    };
    expect(saveMemory(aged).ok).toBe(true);
    expect(isMemoryExpired(aged)).toBe(true);
    seedProjectDecision(PROJ_A, 'Galvalum');
    expect(purgeExpiredMemories(scopeA)).toBe(1);
    expect(getCurrentMemory(scopeA, 'spec:roof_material')).not.toBeNull();
  });
});

describe('M2-13 — migrasi server (proposal): berkas ada, aditif, tanpa DROP, tanpa operasi live', () => {
  it('berkas migrasi memori ada & memuat 3 tabel + RLS + tanpa DROP TABLE', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sqlPath = path.join(here, '..', '..', 'supabase', 'migrations', '20261112_ai_memory_foundation.sql');
    expect(fs.existsSync(sqlPath)).toBe(true);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    for (const table of ['ai_memories', 'ai_preferences', 'ai_memory_events']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY');
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).toContain('TIDAK diterapkan');
    // Bukti kunci preferensi dibatasi di skema (tanpa atribut sensitif).
    expect(sql).toContain("CHECK (key IN ('language'");
  });
});
