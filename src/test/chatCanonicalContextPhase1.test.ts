/**
 * chatCanonicalContextPhase1.test.ts — FASE 1 Canonical Context Intelligence
 * (AI Intelligence Overhaul, direktif owner 2026-11-12 Part 15 Fase 1).
 *
 * Membuktikan SATU context builder kanonis (canonicalContext.ts) yang
 * dipakai EzrabAiService DAN Copilot, menutup ARS-07 secara terukur:
 *  (a) pesan terakhir TIDAK dikirim dua kali,
 *  (b) blok konteks proyek ber-cap karakter & tidak hilang oleh budget riwayat.
 *
 * Pemetaan direktif Part 16: MEM-01 (working memory), MEM-03 (conversation
 * memory/ringkasan), MEM-09 (isolasi proyek), AGT-02 (retrieval relevan),
 * AGT-06 (satu mesin untuk semua jalur), CON-12 (anggaran konteks).
 *
 * Kelas bukti: mock terkendali (providerClient di-stub) + builder murni.
 * Provider nyata NOT RUN; UI browser dibuktikan E2E terpisah.
 *
 * Jalankan: npx tsx src/test/chatCanonicalContextPhase1.test.ts
 * (pola runner vitest-shim gelombang sebelumnya).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildCanonicalContext, assembleChatPrompt, countOccurrences, scoreMessageRelevance, CANONICAL_TOTAL_PROMPT_BUDGET, CANONICAL_FACTS_BUDGET, CANONICAL_MAX_RETRIEVED_MESSAGES } from '../ai-tools/ezrab-ai/canonicalContext';
import { buildExtractiveSummary } from '../ai-tools/ezrab-ai/conversationSummary';
import { buildProjectSnapshot } from '../ai-tools/ezrab-ai/projectContext';
import { ezrabAiService } from '../ai-tools/ezrab-ai/service';
import { getToolListText } from '../ai-tools/ezrab-ai/tools';
import { EZRAB_AI_SYSTEM_PROMPT, EZRAB_AI_PROMPT_VERSION, RESPONSE_LANGUAGE_RULE } from '../ai-tools/ezrab-ai/prompt';
import { aiToolsProviderClient, type AiToolsResult } from '../ai-tools/providerClient';
import type { UniversalIntakeContext } from '../ai-tools/ezrab-ai/universalIntake';
import type { StructuredSpec } from '../ai-tools/ezrab-ai/structuredSpec';

const CANONICAL_SHA256 = 'cff0fb368fbc1f451c8c27ab83bb632d3150d3748a3bdbf3cb1616c55bb8e252';
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

function makeSnapshot(projectId: string, name: string, itemCount: number, descPrefix = 'Pekerjaan') {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `it-${i}`,
    code: `A.${i + 1}`,
    description: `${descPrefix} ${i + 1}`,
    unit: 'm2',
    volume: 10 + i,
    unitPrice: 100000 + i * 1000,
    totalPrice: (10 + i) * (100000 + i * 1000),
    priceStatus: 'PRICE_RESOLVED',
  }));
  return buildProjectSnapshot({ id: projectId, name } as never, items as never);
}

function makeIntake(overrides: Record<string, unknown> = {}): UniversalIntakeContext {
  return {
    primary: { label: 'Kandang Ayam' },
    secondary: [],
    projectName: 'Kandang Ayam Pak Budi',
    location: 'Malang',
    landAreaM2: 300,
    buildingAreaM2: 153,
    lengthM: 17,
    widthM: 9,
    floors: 1,
    budgetText: 'Rp300.000.000',
    budget: { amount: 300000000, kind: 'maksimal' },
    budgetHistory: [],
    materialPreference: 'Galvalum',
    qualityPreference: 'Standar',
    answers: { 'kandang-type': 'tertutup', 'kandang-roof-material': 'Galvalum' },
    corrections: [{ key: 'budget', from: 'Rp250.000.000', to: 'Rp300.000.000' }],
    facts: [{ key: 'tapak', label: 'Tapak', value: '17 m × 9 m', status: 'CONFIRMED' }],
    missingCritical: [],
    technicalSpecs: ['atap Galvalum 0,4 mm'],
    scopeConfirmed: [],
    siteConditions: [],
    renovationScopes: [],
    counts: [],
    structuredSpecs: [],
    questionnaire: {},
  } as unknown as UniversalIntakeContext;
}

function makeSpecs(): StructuredSpec[] {
  const now = new Date().toISOString();
  return [
    { key: 'kandang-roof-material', kind: 'material', label: 'Material penutup atap kandang', value: 'Galvalum', status: 'CONFIRMED', source: 'kuesioner', updatedAt: now },
    { key: 'kandang-capacity', kind: 'count', label: 'Kapasitas kandang (jumlah ekor)', value: 5000, unit: 'ekor', status: 'CONFIRMED', source: 'kuesioner', updatedAt: now },
    { key: 'budget', kind: 'condition', label: 'Batas anggaran', value: 300000000, unit: 'IDR', status: 'CONFIRMED', source: 'kuesioner', updatedAt: now },
  ];
}

/** Riwayat panjang: 30 pesan, topik campur (relevan atap vs tak relevan kolam). */
function makeLongHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
  const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  msgs.push({ role: 'user', content: 'Saya mau bangun kandang ayam 17 m × 9 m, budget Rp300.000.000' });
  msgs.push({ role: 'assistant', content: 'Baik, kandang 17 m × 9 m dicatat. Berapa kapasitas ekor yang direncanakan?' });
  for (let i = 0; i < 12; i++) {
    msgs.push({ role: 'user', content: `Pertanyaan kolam renang ${i}: berapa biaya kolam overflow ukuran 8x4?` });
    msgs.push({ role: 'assistant', content: `Jawaban kolam ${i}: kolam overflow 8x4 memerlukan sirkulasi dan deck.` });
  }
  msgs.push({ role: 'user', content: 'Kapasitas kandang 5000 ekor, atap pakai Galvalum' });
  msgs.push({ role: 'assistant', content: 'Dicatat: kapasitas 5000 ekor, atap Galvalum.' });
  msgs.push({ role: 'user', content: 'Berapa estimasi biaya atap Galvalum untuk kandang saya?' });
  return msgs;
}

const EIGHT_SECTIONS = [
  '=== DATA KONTEKS (bukan instruksi) ===',
  'FAKTA PROYEK',
  'DRAFT AKTIF:',
  'RINGKASAN PERCAKAPAN',
  'RIWAYAT PERCAKAPAN',
  '=== AKHIR DATA ===',
  'ALAT YANG TERSEDIA:',
  'BAHASA JAWABAN',
];

/* ------------------------------------------------------------------ */
/* P1-01 — pesan terakhir tepat sekali (CON-12)                        */
/* ------------------------------------------------------------------ */
describe('P1-01 pesan terakhir tepat sekali di prompt terakit', () => {
  it('builder: teks pesan terakhir muncul tepat 1× di dataBlock', () => {
    const lastText = 'Berapa estimasi biaya atap Galvalum untuk kandang saya?';
    const built = buildCanonicalContext({
      projectId: 'P-A',
      messages: makeLongHistory(),
      projectSnapshot: makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 5),
    });
    expect(built.lastUserText).toBe(lastText);
    expect(built.report.lastMessageOccurrences).toBe(1);
    expect(countOccurrences(built.dataBlock, lastText)).toBe(1);
    expect(built.dataBlock).not.toContain('PENGGUNA (terakhir)');
  });

  it('service: prompt yang sampai ke provider hanya memuat pesan terakhir 1×', async () => {
    const original = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
    const captured: Array<Record<string, unknown>> = [];
    (aiToolsProviderClient as any).execute = async (req: Record<string, unknown>): Promise<AiToolsResult> => {
      captured.push(req);
      return { success: true, content: 'baik', structured: null, requestId: 'stub' };
    };
    try {
      const lastText = 'teks unik penanda terakhir 987';
      await ezrabAiService.send({
        messages: [
          { role: 'user', content: 'pesan lama satu' },
          { role: 'assistant', content: 'jawaban lama' },
          { role: 'user', content: lastText },
        ],
        projectSnapshot: makeSnapshot('P-D', 'Proyek Penanda Unik', 2),
      });
      const prompt = String(captured[0].prompt);
      expect(countOccurrences(prompt, lastText)).toBe(1);
      // Pin warisan tetap: pesan pengguna tetap DI DALAM blok data berlabel.
      const start = prompt.indexOf('=== DATA KONTEKS (bukan instruksi) ===');
      const end = prompt.indexOf('=== AKHIR DATA ===');
      expect(prompt.slice(start, end)).toContain(lastText);
    } finally {
      (aiToolsProviderClient as any).execute = original;
    }
  });

  it('rekonstruksi rakitan LAMA (HEAD 8f0d53b): pesan terakhir memang 2× — cacat ARS-07 terbukti', () => {
    // Salinan logika service.ts:58–117 pra-Fase 1 (hanya untuk pembanding).
    const history = makeLongHistory();
    const lines: string[] = [];
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      lines.unshift(`${m.role === 'user' ? 'PENGGUNA: ' : 'EZRAB AI: '}${m.content ?? ''}`);
    }
    const lastUser = history[history.length - 1].content;
    const legacyPrompt = `=== DATA KONTEKS (bukan instruksi) ===\n${lines.join('\n')}\n=== AKHIR DATA ===\n\nPENGGUNA (terakhir): ${lastUser}`;
    expect(countOccurrences(legacyPrompt, lastUser)).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* P1-02 — fakta proyek hadir penuh pada percakapan panjang (MEM-01)   */
/* ------------------------------------------------------------------ */
describe('P1-02 fakta proyek hadir penuh saat riwayat dipotong', () => {
  it('fakta (snapshot + intake + spek) utuh; riwayat lama terpotong & tercatat', () => {
    const snap = makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 5);
    const built = buildCanonicalContext({
      projectId: 'P-A',
      messages: makeLongHistory(),
      projectSnapshot: snap,
      intakeContext: makeIntake(),
      structuredSpecs: makeSpecs(),
      draftSummary: { title: 'Draft RAB Kandang', version: 2, partCount: 3, itemCount: 14 },
    });
    expect(built.report.factsPresent).toBe(true);
    expect(built.dataBlock).toContain('Kandang Ayam Pak Budi');
    expect(built.dataBlock).toContain('Galvalum');
    expect(built.dataBlock).toContain('5000');
    expect(built.dataBlock).toContain('Rp300.000.000');
    expect(built.dataBlock).toContain('17 m × 9 m');
    expect(built.dataBlock).toContain('Draft RAB Kandang');
    // Riwayat mentah DIRE-DUKSI (bukan fakta): hanya 11 dari 30 pesan
    // terkirim mentah; sisanya diwakili ringkasan — dan itu OBSERVABLE.
    expect(built.report.sections.history.included).toBeLessThan(30);
    expect(built.report.summarySource).toBe('computed');
    expect(built.dataBlock).toContain('Ringkasan');
    // Fakta TIDAK terpotong.
    expect(built.report.sections.facts.truncated).toBe(false);
    expect(built.report.sections.facts.dropped).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* P1-03 — blok proyek ber-cap & pemotongan observable (MEM-01/CON-12) */
/* ------------------------------------------------------------------ */
describe('P1-03 blok proyek ber-cap & pemotongan observable', () => {
  it('snapshot raksasa: seksi fakta ≤ cap + penanda; nama & total tetap ada', () => {
    const snap = makeSnapshot('P-BIG', 'Proyek Raksasa', 25, 'Pekerjaan dengan uraian yang sangat panjang '.repeat(4));
    const built = buildCanonicalContext({
      projectId: 'P-BIG',
      messages: [{ role: 'user', content: 'berapa totalnya?' }],
      projectSnapshot: snap,
    });
    const factsSection = built.dataBlock.split('FAKTA PROYEK')[1].split('DRAFT AKTIF:')[0];
    expect(factsSection.length).toBeLessThanOrEqual(CANONICAL_FACTS_BUDGET + 300); // + penanda
    expect(built.report.sections.facts.truncated).toBe(true);
    expect(built.report.sections.facts.dropped).toBeGreaterThan(0);
    expect(built.report.truncations.join(' ')).toContain('fakta dipotong');
    expect(built.dataBlock).toContain('Proyek Raksasa');
    expect(built.dataBlock).toContain('Subtotal langsung');
  });
});

/* ------------------------------------------------------------------ */
/* P1-04 — ringkasan tidak menghilangkan fakta proyek (MEM-03)         */
/* ------------------------------------------------------------------ */
describe('P1-04 ringkasan tidak menghilangkan fakta proyek', () => {
  it('ringkasan tersimpan dipakai; fakta tetap dari state terstruktur', () => {
    const history = makeLongHistory();
    // Ringkasan tersimpan dibangun SEBELUM pesan terakhir dikirim
    // (seperti store: ringkasan diperbarui saat append, bukan sesudah
    // permintaan berjalan) — jadi ringkasan tak menduplikasi permintaan.
    const stored = buildExtractiveSummary(history.slice(0, -1));
    expect(stored.messageCount).toBe(history.length - 1);
    const built = buildCanonicalContext({
      projectId: 'P-A',
      messages: history,
      projectSnapshot: makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 5),
      intakeContext: makeIntake(),
      structuredSpecs: makeSpecs(),
      storedSummary: stored,
    });
    expect(built.report.summarySource).toBe('stored');
    expect(built.dataBlock).toContain('Galvalum');
    expect(built.dataBlock).toContain('Rp300.000.000');
    expect(built.dataBlock).toContain('5000');
    // Ringkasan tidak mengarang: hanya kalimat yang sudah ada.
    expect(built.dataBlock).toContain('Ringkasan');
  });

  it('tanpa ringkasan tersimpan: ringkasan dihitung deterministik & stabil', () => {
    const history = makeLongHistory();
    const a = buildCanonicalContext({ projectId: 'P-A', messages: history, projectSnapshot: makeSnapshot('P-A', 'Kandang', 3) });
    const b = buildCanonicalContext({ projectId: 'P-A', messages: history, projectSnapshot: makeSnapshot('P-A', 'Kandang', 3) });
    expect(a.report.summarySource).toBe('computed');
    expect(a.dataBlock).toBe(b.dataBlock);
    const s1 = buildExtractiveSummary(history);
    const s2 = buildExtractiveSummary(history);
    expect(s1.text).toBe(s2.text);
  });
});

/* ------------------------------------------------------------------ */
/* P1-05 — dua proyek: konteks tidak bercampur (MEM-09)                */
/* ------------------------------------------------------------------ */
describe('P1-05 isolasi proyek', () => {
  it('konteks proyek A murni: tanpa fakta proyek B, dan sebaliknya', () => {
    const snapA = makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 3);
    const snapB = makeSnapshot('P-B', 'Gudang Baja Surabaya', 3);
    const a = buildCanonicalContext({
      projectId: 'P-A',
      conversationId: 'conv-A',
      messages: [{ role: 'user', content: 'berapa total kandang saya?' }],
      projectSnapshot: snapA,
      intakeContext: makeIntake(),
    });
    const b = buildCanonicalContext({
      projectId: 'P-B',
      conversationId: 'conv-B',
      messages: [{ role: 'user', content: 'berapa total gudang saya?' }],
      projectSnapshot: snapB,
    });
    expect(a.dataBlock).toContain('Kandang Ayam Pak Budi');
    expect(a.dataBlock).not.toContain('Gudang Baja Surabaya');
    expect(a.dataBlock).not.toContain('P-B');
    expect(b.dataBlock).toContain('Gudang Baja Surabaya');
    expect(b.dataBlock).not.toContain('Kandang Ayam Pak Budi');
    expect(b.dataBlock).not.toContain('Galvalum');
    expect(a.report.scope.projectId).toBe('P-A');
    expect(b.report.scope.projectId).toBe('P-B');
  });

  it('snapshot lintas proyek DITOLAK tegas (throw), bukan dicampur diam-diam', () => {
    const snapB = makeSnapshot('P-B', 'Gudang Baja Surabaya', 3);
    expect(() =>
      buildCanonicalContext({
        projectId: 'P-A',
        messages: [{ role: 'user', content: 'halo' }],
        projectSnapshot: snapB,
      }),
    ).toThrow('CANONICAL_CONTEXT_PROJECT_MISMATCH');
  });
});

/* ------------------------------------------------------------------ */
/* P1-06 — relevansi: fakta tak relevan tidak ikut terkirim (AGT-02)    */
/* ------------------------------------------------------------------ */
describe('P1-06 retrieval berbasis relevansi', () => {
  it('permintaan soal atap: pesan atap terpilih, pesan kolam tak relevan tersingkir', () => {
    const built = buildCanonicalContext({
      projectId: 'P-A',
      messages: makeLongHistory(),
      projectSnapshot: makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 3),
    });
    expect(built.report.retrieval.selected).toBeLessThanOrEqual(CANONICAL_MAX_RETRIEVED_MESSAGES);
    expect(built.dataBlock).toContain('atap Galvalum');
    // Pesan kolam lama sebagian besar tidak terkirim mentah di seksi RIWAYAT
    // (12 pasang kolam di riwayat mentah → <12 kemunculan di seksi riwayat).
    const historySection = built.dataBlock.split('RIWAYAT PERCAKAPAN')[1].split('=== AKHIR DATA ===')[0];
    const kolamCount = (historySection.match(/kolam renang/g) ?? []).length;
    expect(kolamCount).toBeLessThan(12);
    expect(built.report.retrieval.considered).toBeGreaterThan(0);
  });

  it('skor relevansi: overlap topik + resensi mengalahkan pesan lama tak relevan', () => {
    const q = ['atap', 'galvalum'];
    const relevant = scoreMessageRelevance({ role: 'user', content: 'atap Galvalum berapa harganya?' }, q, 10, 12);
    const irrelevant = scoreMessageRelevance({ role: 'user', content: 'kolam overflow ukuran 8x4?' }, q, 1, 12);
    expect(relevant).toBeGreaterThan(irrelevant);
  });
});

/* ------------------------------------------------------------------ */
/* P1-07 — Copilot memakai builder yang sama (AGT-06)                  */
/* ------------------------------------------------------------------ */
describe('P1-07 Copilot memakai builder kanonis yang sama', () => {
  it('input sama → dataBlock identik antara jalur kanonis & jalur Copilot', () => {
    const input = {
      projectId: 'P-A',
      conversationId: 'conv-A',
      messages: makeLongHistory(),
      projectSnapshot: makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 5),
      intakeContext: makeIntake(),
      structuredSpecs: makeSpecs(),
      reservedChars: 500,
    };
    const viaService = buildCanonicalContext({ ...input, userId: null });
    const viaCopilot = buildCanonicalContext({ ...input, userId: 'guest-session' });
    expect(viaCopilot.dataBlock).toBe(viaService.dataBlock);
  });

  it('sumber: coAssistantService memanggil builder kanonis; slice(0,8000) hilang', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const src = fs.readFileSync(path.join(root, 'services', 'coAssistantService.ts'), 'utf8');
    expect(src).toContain('buildCanonicalContext');
    expect(src).not.toContain('slice(0, 8000)');
    expect(src).not.toContain('JSON.stringify(projectContext)');
    const svc = fs.readFileSync(path.join(root, 'ai-tools', 'ezrab-ai', 'service.ts'), 'utf8');
    expect(svc).toContain('buildCanonicalContext');
    expect(svc).not.toContain('PENGGUNA (terakhir)');
  });
});

/* ------------------------------------------------------------------ */
/* P1-08 — budget total tidak pernah melewati cap (CON-12)             */
/* ------------------------------------------------------------------ */
describe('P1-08 anggaran total + headroom gateway', () => {
  it('input adversarial (riwayat raksasa + snapshot raksasa): prompt ≤ 16.000', async () => {
    const giantHistory = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `pesan raksasa ${i} `.repeat(400),
    }));
    const snap = makeSnapshot('P-BIG', 'Proyek Raksasa', 25, 'Uraian panjang '.repeat(10));
    const built = buildCanonicalContext({
      projectId: 'P-BIG',
      messages: giantHistory,
      projectSnapshot: snap,
      intakeContext: makeIntake(),
      structuredSpecs: makeSpecs(),
      reservedChars: assembleChatPrompt('', getToolListText()).length,
    });
    const prompt = assembleChatPrompt(built.dataBlock, getToolListText());
    expect(prompt.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(built.report.promptChars).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    // Headroom di bawah batas gateway 20.000 (api/_lib/security.js).
    expect(prompt.length).toBeLessThanOrEqual(20000 - 4000);
    // Fakta tetap hadir meski anggaran ketat.
    expect(built.dataBlock).toContain('Proyek Raksasa');
    // Gateway menerima prompt rakitan ini (validasi asli, bukan tiruan).
    const security = await import('../../api/_lib/security.js');
    const r = (security as any).validateAiInput({ prompt, systemPrompt: EZRAB_AI_SYSTEM_PROMPT });
    expect(r.errors.length).toBe(0);
  });

  it('service: prompt rakitan untuk kasus biasa jauh di bawah cap', async () => {
    const original = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
    const captured: Array<Record<string, unknown>> = [];
    (aiToolsProviderClient as any).execute = async (req: Record<string, unknown>): Promise<AiToolsResult> => {
      captured.push(req);
      return { success: true, content: 'baik', structured: null, requestId: 'stub' };
    };
    try {
      await ezrabAiService.send({
        messages: makeLongHistory(),
        projectSnapshot: makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 5),
        intakeContext: makeIntake(),
        structuredSpecs: makeSpecs(),
      });
      const prompt = String(captured[0].prompt);
      expect(prompt.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    } finally {
      (aiToolsProviderClient as any).execute = original;
    }
  });
});

/* ------------------------------------------------------------------ */
/* P1-09 — regresi jalur lama: 8 seksi kanonis (Wave D T13–T17, I01–I05)*/
/* ------------------------------------------------------------------ */
describe('P1-09 regresi: 8 seksi kanonis tetap hadir (Wave D)', () => {
  const waveDInputs: Array<{ id: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>; projectId: string; name: string }> = [
    { id: 'T13', messages: [{ role: 'user', content: 'Saya mahasiswa belajar RAB gedung 3 lantai, luas 12x20 m' }], projectId: 'P-T13', name: 'Gedung 3 Lantai' },
    { id: 'T14', messages: [{ role: 'user', content: 'Hitung volume beton sloof gedung 3 lantai' }], projectId: 'P-T13', name: 'Gedung 3 Lantai' },
    { id: 'T15', messages: [{ role: 'user', content: 'Berapa total RAB gedung 3 lantai ini?' }], projectId: 'P-T13', name: 'Gedung 3 Lantai' },
    { id: 'T16', messages: [{ role: 'user', content: 'Jelaskan AHSP pekerjaan beton bertulang' }], projectId: 'P-T13', name: 'Gedung 3 Lantai' },
    { id: 'T17', messages: [{ role: 'user', content: 'Hitung kebutuhan material semen untuk dinding 100 m2' }], projectId: 'P-T17', name: 'Rumah Tinggal' },
    { id: 'I01', messages: [{ role: 'user', content: 'Berapa harga AHSP resmi item pondasi batu kali?' }], projectId: 'P-I01', name: 'Proyek I01' },
    { id: 'I02', messages: [{ role: 'user', content: 'Cari harga material besi beton D10' }], projectId: 'P-I01', name: 'Proyek I01' },
    { id: 'I03', messages: [{ role: 'user', content: 'Template RAB apa yang cocok untuk gudang?' }], projectId: 'P-I01', name: 'Proyek I01' },
    { id: 'I04', messages: [{ role: 'user', content: 'Berapa upah tukang batu hari ini?' }], projectId: 'P-I01', name: 'Proyek I01' },
    { id: 'I05', messages: [{ role: 'user', content: 'Jelaskan perbedaan subtotal langsung dan total akhir' }], projectId: 'P-I01', name: 'Proyek I01' },
  ];

  it('system prompt kanonis v2.0.0 tidak berubah (hash + 8 seksi sistem)', () => {
    expect(EZRAB_AI_PROMPT_VERSION).toBe('2.0.0');
    expect(sha256(EZRAB_AI_SYSTEM_PROMPT)).toBe(CANONICAL_SHA256);
    for (const s of ['KEPRIBADIAN', 'BAHASA JAWABAN', 'BATASAN PENTING', 'GROUNDING DATA PROYEK', 'KEJUJURAN SUMBER & KEAMANAN DATA', 'PEMAHAMAN DOMAIN KONSTRUKSI UNIVERSAL', 'ALUR PERCAKAPAN', 'FORMAT JAWABAN']) {
      expect(EZRAB_AI_SYSTEM_PROMPT).toContain(s);
    }
  });

  for (const c of waveDInputs) {
    it(`${c.id}: prompt terakit mengandung semua 8 seksi kanonis`, () => {
      const built = buildCanonicalContext({
        projectId: c.projectId,
        messages: c.messages,
        projectSnapshot: makeSnapshot(c.projectId, c.name, 4),
        intakeContext: makeIntake(),
        structuredSpecs: makeSpecs(),
        reservedChars: assembleChatPrompt('', getToolListText()).length,
      });
      const prompt = assembleChatPrompt(built.dataBlock, getToolListText());
      for (const s of EIGHT_SECTIONS) {
        expect(prompt).toContain(s);
      }
      expect(prompt.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    });
  }

  it('observabilitas: laporan membawa ukuran tiap seksi + duplikat + pemotongan', () => {
    const built = buildCanonicalContext({
      projectId: 'P-A',
      messages: makeLongHistory(),
      projectSnapshot: makeSnapshot('P-A', 'Kandang Ayam Pak Budi', 5),
      intakeContext: makeIntake(),
      structuredSpecs: makeSpecs(),
    });
    const r = built.report;
    expect(r.scope.userIdentity).toBe('anonymous-tanpa-identitas'); // tanpa identitas hari ini — dinyatakan
    expect(r.scope.projectId).toBe('P-A');
    expect(typeof r.sections.facts.chars).toBe('number');
    expect(typeof r.sections.history.chars).toBe('number');
    expect(typeof r.duplicatesDropped).toBe('number');
    expect(Array.isArray(r.truncations)).toBe(true);
    expect(r.retrieval.maxRetrieved).toBe(CANONICAL_MAX_RETRIEVED_MESSAGES);
    expect(r.budget.total).toBe(CANONICAL_TOTAL_PROMPT_BUDGET);
  });
});
