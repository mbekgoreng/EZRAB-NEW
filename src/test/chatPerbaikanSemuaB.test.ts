/**
 * chatPerbaikanSemuaB.test.ts — GELOMBANG "PERBAIKI SEMUA" (perintah owner
 * 2026-11-13 00:02 "perbaiki semua kecuali yang gabisa"), klaster B
 * (non-view): SEC-04, tes flaky S2, O-6B, ARS-06 warisan, komentar
 * anggaran konteks yang berbohong.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPerbaikanSemuaB.test.ts`
 *
 * SEC-04 (audit produk §12): DedAnalysisDashboard.tsx menampilkan klaim
 * progres/verifikasi STATIS yang difabrikasi apa pun berkasnya: durasi
 * tahap tetap, "32 halaman" (metadata BERKAS CONTOH — diverifikasi:
 * public/samples/pdf-gambar-rumah-1-lantai_compress.pdf memang 3,01 MB /
 * 32 halaman / rumah 1 lantai — tetapi ditampilkan untuk berkas apa pun
 * bahkan saat belum ada berkas), klaim validasi/verifikasi statis atas
 * volume/HSP/RAB, dan "0 blocker kritis" hardcoded. Perbaikan: klaim
 * dihapus; yang tampil kini hanya data nyata hasil pipeline
 * (totalPagesRead, hitungan status item dari quantitySanityGate, dan
 * stats pipeline). Durasi tahap tetap dihapus (medan duration tidak
 * pernah di-render di mana pun di komponen itu); elapsed nyata tetap
 * dipakai selama PROCESSING.
 *
 * S2 (LAPORAN-AKHIR §2.5/§6): tes membandingkan objek spek lengkap
 * termasuk updatedAt milidetik; applyQuestionnaireAnswers mencap
 * submittedAt baru tiap panggilan (questionnaire.ts:958/976) dan
 * deriveStructuredSpecs memakai cap itu (questionnaire.ts:1171) —
 * lolos hanya bila dua apply mendarat di milidetik yang sama (flaky by
 * construction). Perbaikan: bandingkan tanpa updatedAt (strip field itu
 * sebelum perbandingan) + tegaskan stempelnya tetap ada dan valid ISO.
 * INI SATU-SATUNYA pin yang berubah di gelombang ini.
 *
 * O-6B (Gate 6 §6/§12): jalur Copilot /api/ai/chat mengubah payload
 * non-objek (mis. halaman error HTML) menjadi balasan ramah non-error.
 * Lokasi sebenarnya: normalizeAiResponse di src/services/aiApiClient.ts
 * (BUKAN api/ai/chat.js — itu hanya wrapper tipis gateway — dan bukan
 * api/_lib/). Desain: error jujur di BATAS TRANSPORT (sendMessage
 * melempar AiApiError INVALID_RESPONSE, retryable, untuk badan 200
 * non-objek), BUKAN dengan mengubah normalizer — semantik normalizer
 * dipin TEST 8 (G) aiApiClient.test.ts + 6U-27 Gate 6, dan gelombang ini
 * hanya mengizinkan pin S2 berubah. Satu-satunya pemanggil produksi
 * normalizer adalah sendMessage, sehingga tidak ada lagi jalur produksi
 * yang mengubah kegagalan transport menjadi balasan ramah.
 *
 * ARS-06 warisan (Fase 5 §6): toolCreateRabDraft masih membangun draft
 * tanpa proyek. Perbaikan: terima projectId opsional dan teruskan ke
 * buildUniversalDraft sebagai opts.projectId, mengikuti pola persis
 * registry build_universal_draft (toolRegistry.ts:665-672). Hasil build
 * tidak berubah (opts hanya memengaruhi ikatan singleton).
 *
 * Komentar service.ts (~79-82): mengklaim "anggaran builder sudah
 * menjamin ini tidak terjadi" untuk guard CONTEXT_BUDGET_EXCEEDED,
 * padahal guard itu DAPAT menyala (observasi Fase 6). Perbaikan: HANYA
 * komentar (anggaran/nilai budget/logika guard tidak disentuh).
 *
 * Provider nyata: NOT RUN (0 panggilan). Fetch di-stub di memori.
 */
import { readFileSync } from 'node:fs';
import { AiApiClient, AiApiError, normalizeAiResponse, getFriendlyErrorMessage } from '../services/aiApiClient';
import { toolCreateRabDraft } from '../ai-tools/ezrab-ai/constructionTools';
import {
  buildUniversalDraft,
  getLastUniversalDraft,
  getLastUniversalDraftProjectId,
  setLastUniversalDraft,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  extractUniversalContext,
  type UniversalIntakeContext,
} from '../ai-tools/ezrab-ai/universalIntake';
import { applyQuestionnaireAnswers, deriveStructuredSpecs } from '../ai-tools/ezrab-ai/questionnaire';
import type { StructuredSpec } from '../ai-tools/ezrab-ai/structuredSpec';

// localStorage in-memory (pola chatSpecChainSchema.test.ts).
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}
(globalThis as Record<string, unknown>).localStorage = makeStorage();

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS ${name}`);
    })
    .catch((e: unknown) => {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(name);
      console.log(`  FAIL ${name}: ${msg}`);
    });
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const KANDANG_TEXT = 'Buatkan RAB kandang sapi 20 ekor ukuran 17 x 9 m atap Galvalum budget 300 juta';

function specByKey(specs: StructuredSpec[], key: string): StructuredSpec | undefined {
  return specs.find((s) => s.key === key);
}

function kandangCtx(): UniversalIntakeContext {
  const ctx = extractUniversalContext('buatkan rab kandang sapi 17 x 9 meter');
  applyQuestionnaireAnswers(ctx, {
    'kandang-capacity': { selectedIds: ['kap-30'], customText: null, status: 'answered' },
    'kandang-roof-material': { selectedIds: ['atap-galvalum'], customText: null, status: 'answered' },
    'kandang-manure': { selectedIds: [], customText: null, status: 'skipped' },
  });
  ctx.answers['kandang-type'] = 'terbuka';
  ctx.budget = { amount: 250_000_000, kind: 'MAXIMUM', original: 'Rp250 juta', coverage: null };
  return ctx;
}

/** Proyeksi stabil hasil build draft (tanpa id/timestamp) untuk perbandingan. */
function draftShape(d: UniversalDraft) {
  const items = d.parts.flatMap((p) => (p.generation.items ?? []) as Array<Record<string, unknown>>);
  return {
    title: d.title,
    version: d.version,
    parts: d.parts.length,
    itemCount: items.length,
    items: items.map((i) => ({
      name: i.description ?? i.name ?? i.item ?? i.workName ?? '',
      unit: i.unit ?? i.satuan ?? '',
      qty: i.quantity ?? i.volume ?? null,
      price: i.estimatedUnitPrice ?? i.unitPrice ?? null,
      status: i.priceStatus ?? i.status ?? null,
    })),
  };
}

async function main() {
  console.log('chatPerbaikanSemuaB — klaster B (SEC-04, S2, O-6B, ARS-06, komentar budget)');

  // ------------------------------------------------------------------
  // SEC-04 — klaim fabrikasi hilang dari dashboard (asersi sumber)
  // ------------------------------------------------------------------
  await check('B-01 SEC-04: tidak ada lagi klaim verifikasi statis di dashboard', () => {
    const src = read('../components/magic-ai/DedAnalysisDashboard.tsx');
    const fabricated = [
      '32 halaman gambar kerja',
      'Memproses 32 halaman gambar kerja',
      'totalPagesRead || 32',
      "duration: '12s'",
      "duration: '18s'",
      "duration: '24s'",
      "duration: '6s'",
      "'12s'",
      "'18s'",
      "'24s'",
      "'6s'",
      'Volume & HSP deterministik tervalidasi',
      'RAB terverifikasi tanpa anomali harga',
      '3.01 MB',
      'Gambar kerja rumah tinggal 1 lantai',
      '0 blocker kritis',
    ];
    for (const s of fabricated) {
      assert(!src.includes(s), `klaim fabrikasi masih ada: ${JSON.stringify(s)}`);
    }
    // Prop totalPages viewer kini kondisional pada hitungan nyata.
    assert(
      src.includes('outputResult.totalPagesRead > 0 ? outputResult.totalPagesRead : 32'),
      'prop totalPages DocumentViewer harus memakai hitungan nyata bila ada'
    );
  });

  await check('B-02 SEC-04: pengganti jujur berbasis data nyata tampil', () => {
    const src = read('../components/magic-ai/DedAnalysisDashboard.tsx');
    const honest = [
      'Belum ada dokumen dibaca',
      'Jumlah halaman belum dihitung',
      'Jumlah halaman tidak tercatat',
      'Dokumen PDF',
      'Pilih berkas PDF DED untuk dianalisis',
      'item tertahan',
      'Perlu tinjauan',
      'totalPagesRead > 0',
      'stats?.blockedItems',
      'st?.unresolvedItems',
      'st?.blockedItems',
      "i.status === 'VALID'",
      "i.status === 'BLOCKED'",
    ];
    for (const s of honest) {
      assert(src.includes(s), `pengganti jujur hilang: ${JSON.stringify(s)}`);
    }
    // Fungsi dashboard lain tidak diubah: filter status + ekspor + commit utuh.
    assert(src.includes('handleExportCsv'), 'ekspor CSV harus utuh');
    assert(src.includes('handleCommitToProject'), 'commit ke proyek harus utuh');
    assert(src.includes("statusFilter === 'BLOCKED'"), 'filter status harus utuh');
  });

  // ------------------------------------------------------------------
  // O-6B — payload non-objek pada 200 = error jujur (perilaku sendMessage)
  // ------------------------------------------------------------------
  const origFetch = globalThis.fetch;
  function stubFetch(ok: boolean, status: number, jsonImpl: () => Promise<unknown>) {
    (globalThis as Record<string, unknown>).fetch = async () => ({
      ok,
      status,
      json: jsonImpl,
    });
  }

  await check('B-03 O-6B: badan 200 bukan-JSON (halaman error HTML) → AiApiError INVALID_RESPONSE', async () => {
    stubFetch(true, 200, async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    });
    const client = new AiApiClient();
    let caught: unknown = null;
    try {
      await client.sendMessage({ message: 'halo' });
    } catch (e) {
      caught = e;
    } finally {
      globalThis.fetch = origFetch;
    }
    assert(caught instanceof AiApiError, `harus melempar AiApiError, dapat: ${String(caught)}`);
    const err = caught as AiApiError;
    assert(err.code === 'INVALID_RESPONSE', `kode harus INVALID_RESPONSE, dapat: ${err.code}`);
    assert(err.retryable === true, 'error transport harus retryable');
    assert(err.message === getFriendlyErrorMessage('INVALID_RESPONSE'), 'pesan harus pesan ramah INVALID_RESPONSE');
  });

  await check('B-04 O-6B: JSON non-objek (string/angka/array) pada 200 → INVALID_RESPONSE', async () => {
    const client = new AiApiClient();
    for (const body of ['"kesalahan proxy"', '500', '[1,2,3]']) {
      stubFetch(true, 200, async () => JSON.parse(body));
      let caught: unknown = null;
      try {
        await client.sendMessage({ message: 'halo' });
      } catch (e) {
        caught = e;
      } finally {
        globalThis.fetch = origFetch;
      }
      assert(caught instanceof AiApiError, `body ${body}: harus melempar AiApiError, dapat: ${String(caught)}`);
      assert((caught as AiApiError).code === 'INVALID_RESPONSE', `body ${body}: kode harus INVALID_RESPONSE`);
    }
  });

  await check('B-05 O-6B: payload objek valid tidak berubah perilakunya', async () => {
    stubFetch(true, 200, async () => ({ content: 'Halo dari AI', status: 'COMPLETED' }));
    const client = new AiApiClient();
    let res: unknown = null;
    try {
      res = await client.sendMessage({ message: 'halo' });
    } finally {
      globalThis.fetch = origFetch;
    }
    const r = res as { content: string; isError: boolean; status: string };
    assert(r.content === 'Halo dari AI', `konten objek valid harus diteruskan, dapat: ${r.content}`);
    assert(r.isError === false, 'objek valid bukan error');
    assert(r.status === 'COMPLETED', 'status objek valid dipertahankan');
  });

  await check('B-06 O-6B: semantik normalizeAiResponse TIDAK berubah (pin TEST 8 (G) + 6U-27 utuh)', () => {
    // Pin TEST 8 (G): null → fallback ramah persis.
    const empty = normalizeAiResponse(null);
    assert(
      empty.content === 'Maaf, EZRAB AI belum menghasilkan jawaban. Silakan coba lagi.',
      'fallback ramah null harus persis seperti pin TEST 8 (G)'
    );
    // Pin 6U-27: payload non-objek di normalizer tetap non-error (perilaku
    // teramati yang dipin); yang berubah adalah sendMessage yang kini tidak
    // lagi meneruskan payload semacam itu ke normalizer.
    const html = normalizeAiResponse('<!DOCTYPE html><html>error proxy</html>');
    assert(html.isError === false, 'pin 6U-27: normalizer non-objek tetap non-error');
    assert(html.content.includes('belum menghasilkan jawaban'), 'pin 6U-27: fallback ramah tampil');
    // Error terstruktur tetap dinormalisasi seperti semula.
    const err = normalizeAiResponse({ success: false, error: { code: 'AI_CORE_TIMEOUT', message: 'lambat', retryable: true } });
    assert(err.isError === true && err.retryable === true && err.code === 'AI_CORE_TIMEOUT', 'error terstruktur tetap dinormalisasi');
    // Asersi sumber: guard hidup di sendMessage, bukan di normalizer.
    const src = read('../services/aiApiClient.ts');
    assert(src.includes("if (!data || typeof data !== 'object' || Array.isArray(data))"), 'guard non-objek harus ada di sendMessage');
    assert(src.includes("throw new AiApiError(\n        'INVALID_RESPONSE',"), 'guard harus melempar INVALID_RESPONSE');
  });

  // ------------------------------------------------------------------
  // ARS-06 warisan — toolCreateRabDraft terikat projectId
  // ------------------------------------------------------------------
  await check('B-07 ARS-06: draft hasil toolCreateRabDraft terikat projectId (tidak bocor lintas proyek)', () => {
    setLastUniversalDraft(null, null);
    const res = toolCreateRabDraft({ text: KANDANG_TEXT, projectId: 'PROJ-B7' });
    assert(res.kind === 'draft', `fixture kandang harus menghasilkan draft, dapat: ${res.kind}`);
    if (res.kind !== 'draft') return;
    assert(getLastUniversalDraftProjectId() === 'PROJ-B7', 'ikatan singleton harus PROJ-B7');
    const same = getLastUniversalDraft('PROJ-B7');
    assert(same !== null && same.id === res.draft.id, 'draft terbaca balik di proyek yang sama');
    assert(getLastUniversalDraft('PROJ-LAIN') === null, 'draft TIDAK BOLEH terbaca dari proyek lain');
  });

  await check('B-08 ARS-06: hasil build draft tidak berubah oleh pengikatan proyek', () => {
    setLastUniversalDraft(null, null);
    const viaTool = toolCreateRabDraft({ text: KANDANG_TEXT, projectId: 'PROJ-B8' });
    const viaDirect = buildUniversalDraft(KANDANG_TEXT);
    assert(viaTool.kind === 'draft' && viaDirect.kind === 'draft', 'kedua jalur harus menghasilkan draft');
    if (viaTool.kind !== 'draft' || viaDirect.kind !== 'draft') return;
    const a = draftShape(viaTool.draft);
    const b = draftShape(viaDirect.draft);
    assert(a.itemCount > 0, 'fixture harus menghasilkan item');
    assert(JSON.stringify(a) === JSON.stringify(b), 'bentuk draft (judul/versi/part/item) harus identik dengan/tanpa projectId');
    // Tanpa projectId: ikatan null seperti sebelumnya (perilaku lama dipertahankan).
    setLastUniversalDraft(null, null);
    const noPid = toolCreateRabDraft({ text: KANDANG_TEXT });
    assert(noPid.kind === 'draft', 'tanpa projectId tetap menghasilkan draft');
    assert(getLastUniversalDraftProjectId() === null, 'tanpa projectId ikatan tetap null');
    // projectId non-string diperlakukan sebagai null (pola registry).
    const badPid = toolCreateRabDraft({ text: KANDANG_TEXT, projectId: 123 as unknown as string });
    assert(badPid.kind === 'draft', 'projectId non-string tetap menghasilkan draft');
    assert(getLastUniversalDraftProjectId() === null, 'projectId non-string menjadi null');
    setLastUniversalDraft(null, null);
  });

  await check('B-09 ARS-06: sumber mengikuti pola registry build_universal_draft', () => {
    const src = read('../ai-tools/ezrab-ai/constructionTools.ts');
    assert(src.includes('projectId?: string | null'), 'toolCreateRabDraft harus menerima projectId opsional');
    assert(src.includes("const projectId = typeof input.projectId === 'string' ? input.projectId : null;"), 'normalisasi projectId harus mengikuti pola registry');
    assert(src.includes('return buildUniversalDraft(input.text, undefined, { projectId });'), 'projectId harus diteruskan sebagai opts.projectId');
    assert(src.includes("inputSchema: '{ text: string, projectId?: string }'"), 'skema registry CreateRabDraft harus menyebut projectId');
    const reg = read('../ai-tools/ezrab-ai/toolRegistry.ts');
    assert(reg.includes("const projectId = typeof args.projectId === 'string' ? args.projectId : null;"), 'pola acuan registry harus ada (sanity)');
  });

  // ------------------------------------------------------------------
  // Komentar service.ts — tidak lagi berbohong; guard tidak disentuh
  // ------------------------------------------------------------------
  await check('B-10 Komentar: teks baru tidak mengklaim guard mustahil menyala; logika guard utuh', () => {
    const src = read('../ai-tools/ezrab-ai/service.ts');
    assert(!src.includes('anggaran builder sudah menjamin ini tidak terjadi'), 'klaim lama yang berbohong harus hilang');
    assert(!src.includes('(bug anggaran)'), 'frasa "(bug anggaran)" harus hilang');
    assert(src.includes('guard ini DAPAT menyala'), 'komentar baru harus menyatakan guard dapat menyala');
    assert(src.includes('tidak menjamin prompt rakitan'), 'komentar baru harus menjelaskan alasannya');
    // Logika guard + anggaran TIDAK disentuh.
    assert(src.includes('if (prompt.length > CANONICAL_TOTAL_PROMPT_BUDGET)'), 'kondisi guard harus utuh');
    assert(src.includes("errorCode: 'CONTEXT_BUDGET_EXCEEDED'"), 'errorCode guard harus utuh');
    assert(src.includes("reply: 'Permintaan terlalu besar untuk dikirim (melebihi anggaran konteks). Coba persingkat pesan atau mulai percakapan baru.'"), 'pesan guard harus utuh');
  });

  // ------------------------------------------------------------------
  // S2 — perbandingan tanpa updatedAt (replikasi logika tes yang diperbaiki)
  // ------------------------------------------------------------------
  await check('B-11 S2: perbandingan tanpa updatedAt lolos 25×; perbandingan penuh TERBUKTI gagal bila cap berbeda', () => {
    const stripUpdatedAt = (s: StructuredSpec | undefined) => {
      if (!s) return s;
      const { updatedAt: _ignored, ...rest } = s;
      return rest;
    };
    const keys = ['kandang-capacity', 'kandang-manure', 'kandang-type', 'budget'];
    for (let i = 0; i < 25; i++) {
      const ctx = kandangCtx();
      const before = deriveStructuredSpecs(ctx);
      applyQuestionnaireAnswers(ctx, {
        'kandang-roof-material': { selectedIds: ['atap-spandek'], customText: null, status: 'answered' },
      });
      const after = deriveStructuredSpecs(ctx);
      assert(specByKey(after, 'kandang-roof-material')?.value === 'Spandek', `iterasi ${i}: revisi atap harus Spandek`);
      for (const key of keys) {
        assert(
          JSON.stringify(stripUpdatedAt(specByKey(after, key))) === JSON.stringify(stripUpdatedAt(specByKey(before, key))),
          `iterasi ${i}: spek ${key} tanpa updatedAt harus identik`
        );
        const u = specByKey(after, key)?.updatedAt;
        assert(typeof u === 'string' && Number.isFinite(Date.parse(u ?? '')), `iterasi ${i}: updatedAt ${key} harus string ISO valid`);
      }
    }
    // Bukti deterministik bahwa perbaikan ini load-bearing: paksa dua cap
    // submittedAt yang berbeda, maka perbandingan PENUH pasti gagal
    // (inilah flaky-nya S2 lama) sementara perbandingan tanpa updatedAt
    // tetap lolos.
    const ctx = kandangCtx();
    ctx.questionnaire.submittedAt = '2026-11-13T00:00:00.000Z';
    const before = deriveStructuredSpecs(ctx);
    applyQuestionnaireAnswers(ctx, {
      'kandang-roof-material': { selectedIds: ['atap-spandek'], customText: null, status: 'answered' },
    });
    ctx.questionnaire.submittedAt = '2026-11-13T00:00:00.001Z';
    const after = deriveStructuredSpecs(ctx);
    assert(
      JSON.stringify(specByKey(after, 'kandang-capacity')) !== JSON.stringify(specByKey(before, 'kandang-capacity')),
      'dengan cap berbeda, perbandingan penuh HARUS gagal (membuktikan diagnosis flaky)'
    );
    assert(
      JSON.stringify(stripUpdatedAt(specByKey(after, 'kandang-capacity'))) === JSON.stringify(stripUpdatedAt(specByKey(before, 'kandang-capacity'))),
      'dengan cap berbeda, perbandingan tanpa updatedAt harus lolos'
    );
  });

  await check('B-12 S2: berkas tes hanya berubah di S2 (stripUpdatedAt ada; tes lain utuh)', () => {
    const src = read('./chatSpecChainSchema.test.ts');
    assert(src.includes('stripUpdatedAt'), 'S2 harus memakai stripUpdatedAt');
    assert(src.includes('PERUBAHAN PIN'), 'S2 harus mendokumentasikan perubahan pin');
    assert(
      !src.includes('expect(specByKey(after, key)).toEqual(specByKey(before, key));'),
      'perbandingan penuh lama harus hilang dari S2'
    );
    // Tes lain tidak disentuh: semua judul S1/S3–S7 tetap ada.
    for (const t of [
      'S1: derivasi contoh kandang lengkap',
      'S3: round-trip v2 serialize→rehydrate identik',
      'S4: snapshot v1 lama termigrasi',
      'S5: v2 dengan structuredSpecs rusak',
      'S6: version 99 → null',
      'S7: SPEC_KEY_META mencakup semua kunci definisi kuesioner',
    ]) {
      assert(src.includes(t), `judul tes lain harus utuh: ${t}`);
    }
  });

  console.log(`\nchatPerbaikanSemuaB: ${passed} lolos, ${failed} gagal${failures.length > 0 ? ` — gagal: ${failures.join(', ')}` : ''}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error('SUITE CRASH:', e);
  process.exitCode = 2;
});
