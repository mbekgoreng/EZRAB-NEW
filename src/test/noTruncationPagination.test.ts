/**
 * TANPA BATAS PEMROSESAN (2026-11-19) — suite paginasi tanpa-trunkasi.
 *
 * Membuktikan perintah owner: tidak ada lagi teks/dokumen yang DIPOTONG
 * dan dibuang selama pemrosesan DED + Document AI. Paginasi, BUKAN
 * trunkasi: dokumen diproses seluruhnya dalam pass sebanyak yang
 * dibutuhkan, setiap request tetap terukur ≤ anggaran gateway.
 *
 * Jalankan: npx vitest run src/test/noTruncationPagination.test.ts
 * (tes service memakai klien AI palsu; tiap chat() membayar minimum
 * timing 3 detik — timeout per tes dinaikkan.)
 */
import { describe, it, expect } from 'vitest';
import {
  expandPagesIntoSegments,
  renderDedPageBlock,
  renderDedPageBlocks,
  segmentBudgetFromEmptyRequest,
  splitTextAtWordBoundaries,
} from '../ai-tools/ded-ai-estimate/pageSegments';
import { buildFastPrompt } from '../ai-tools/ded-ai-estimate/prompts/fast';
import { buildDetailPrompt } from '../ai-tools/ded-ai-estimate/prompts/detail';
import { planDedPasses, DED_PASS_REQUEST_BUDGET_CHARS } from '../ai-tools/ded-ai-estimate/service';
import type { SelectedPage } from '../ai-tools/ded-ai-estimate/analysisTrace';
import { planFullAiDocument } from '../ai-tools/ded-full-ai/service';
import { buildFullAiPrompt } from '../ai-tools/ded-full-ai/prompts';
import { DokumenAiService } from '../ai-tools/document-ai/service';
import {
  buildDocumentChunks,
  measureAiRequestChars,
  splitDocumentPages,
} from '../ai-tools/document-ai/chunking';
import { aiToolsError } from '../ai-tools/types';

const chars = (n: number, c = 'x') => c.repeat(n);
const page = (n: number, text: string, pageType = 'DENAH'): SelectedPage => ({
  page: n,
  title: `Halaman ${n}`,
  text,
  pageType,
});
/** Pengukuran sintetis deterministik: overhead 9.000 + 40 karakter header per halaman. */
const synthMeasure = (pages: SelectedPage[]) =>
  9000 + pages.reduce((a, p) => a + p.text.length + 40, 0);

function makeDoc(pages: number, charsPerPage: number, markerPage?: number, marker?: string): string {
  const out: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const body = (p === markerPage && marker ? `${marker} ` : '') +
      'teks pengisi dokumen konstruksi nomor pasal dan ketentuan umum '.repeat(
        Math.max(1, Math.floor(charsPerPage / 60)),
      );
    out.push(`[Halaman ${p}]\n${body.slice(0, charsPerPage)}`);
  }
  return out.join('\n\n');
}

interface RecordedCall { systemPrompt?: string; prompt: string }
function fakeClient(handler: (call: RecordedCall, idx: number) => any) {
  const calls: RecordedCall[] = [];
  const client = {
    calls,
    execute: async (req: any) => {
      const call: RecordedCall = { systemPrompt: req.systemPrompt, prompt: req.prompt };
      calls.push(call);
      return handler(call, calls.length - 1);
    },
  };
  return client as any;
}
const okReply = (content: string) => ({
  success: true, content, structured: null, requestId: 'test', provider: 'fake', model: 'fake',
});
const allWithinBudget = (calls: RecordedCall[]) =>
  calls.every((c) => measureAiRequestChars(c.systemPrompt || '', c.prompt) <= 19_500);

/* ------------------------------------------------------------------ */
describe('pageSegments — pemecahan halaman tanpa kehilangan karakter', () => {
  it('splitTextAtWordBoundaries: partisi eksak, gabungan = teks asli', () => {
    const text = 'Kolom beton 4000 x 150 x 200 mm dengan tulangan 4D12 dan sengkang D8-150. '.repeat(200);
    const parts = splitTextAtWordBoundaries(text, 1000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.join('')).toBe(text);
  });

  it('splitTextAtWordBoundaries: tidak membelah kata bila ada spasi', () => {
    const text = 'kata-satu kata-dua kata-tiga kata-empat kata-lima';
    const parts = splitTextAtWordBoundaries(text, 20);
    // Batas tiap potongan jatuh pada spasi: potongan berakhir dengan spasi,
    // atau potongan berikutnya diawali spasi (batas tepat di akhir kata) —
    // tidak ada kata terbelah.
    expect(
      parts.slice(0, -1).every((p, i) => p.endsWith(' ') || parts[i + 1].startsWith(' ')),
    ).toBe(true);
    expect(parts.every((p) => p.length <= 20)).toBe(true);
    expect(parts.join('')).toBe(text);
  });

  it('splitTextAtWordBoundaries: teks pendek kembali utuh', () => {
    expect(splitTextAtWordBoundaries('pendek', 1000)).toEqual(['pendek']);
  });

  it('expandPagesIntoSegments: halaman pendek tanpa penanda; halaman panjang berpenanda bagian', () => {
    const segs = expandPagesIntoSegments(
      [page(1, chars(500)), page(2, chars(2500, 'y'))],
      1000,
    );
    expect(segs[0].partIndex).toBeUndefined();
    const page2 = segs.filter((s) => s.page === 2);
    expect(page2.length).toBe(3);
    expect(page2.map((s) => s.partIndex)).toEqual([1, 2, 3]);
    expect(page2.every((s) => s.partCount === 3)).toBe(true);
    expect(page2.map((s) => s.text).join('')).toBe(chars(2500, 'y'));
    // Urutan halaman lestari.
    expect(segs.map((s) => s.page)).toEqual([1, 2, 2, 2]);
  });

  it('segmentBudgetFromEmptyRequest: anggaran = budget − request kosong − margin, lantai 1.000', () => {
    expect(segmentBudgetFromEmptyRequest(9000, 19_500)).toBe(10_300);
    expect(segmentBudgetFromEmptyRequest(19_000, 19_500)).toBe(1000);
  });

  it('renderDedPageBlock: segmen berpenanda bagian; halaman utuh tanpa penanda', () => {
    expect(renderDedPageBlock(page(1, 'isi'))).toBe('--- Halaman 1 (Halaman 1) ---\nisi');
    expect(
      renderDedPageBlock({ ...page(5, 'isi'), partIndex: 2, partCount: 3 }),
    ).toBe('--- Halaman 5 (Halaman 5 — bagian 2 dari 3) ---\nisi');
    expect(renderDedPageBlocks([page(1, 'a'), page(2, 'b')])).toBe(
      '--- Halaman 1 (Halaman 1) ---\na\n--- Halaman 2 (Halaman 2) ---\nb',
    );
  });
});

/* ------------------------------------------------------------------ */
describe('prompt DED — tidak ada lagi slice(0, 4000)', () => {
  it('buildFastPrompt memuat SELURUH teks halaman 6.000 karakter', () => {
    const text = `${chars(5990)}TAIL-UNIK-123`;
    const b = buildFastPrompt({
      projectType: 'BANGUNAN',
      buildingType: 'BANGUNAN',
      pageSummaries: [page(1, text)],
      pricingPolicy: 'FULL_AI',
    });
    expect(b.prompt).toContain(text);
    expect(b.prompt).toContain('TAIL-UNIK-123');
  });

  it('buildDetailPrompt memuat SELURUH teks halaman 6.000 karakter', () => {
    const text = `${chars(5990, 'd')}EKOR-DETAIL-456`;
    const b = buildDetailPrompt({
      projectType: 'BANGUNAN',
      buildingType: 'BANGUNAN',
      pageSummaries: [page(1, text)],
      pricingPolicy: 'FULL_AI',
    });
    expect(b.prompt).toContain(text);
    expect(b.prompt).toContain('EKOR-DETAIL-456');
  });
});

/* ------------------------------------------------------------------ */
describe('planDedPasses + segmen — halaman raksasa terkirim utuh', () => {
  it('halaman 30.000 karakter terkirim seluruhnya dalam pass-pass SEND ≤ anggaran', () => {
    const segments = expandPagesIntoSegments(
      [page(1, chars(30000, 'a')), page(2, chars(3000, 'b'))],
      10_300,
    );
    const plan = planDedPasses([{ label: 'G', pages: segments }], synthMeasure);
    expect(plan.every((p) => p.kind === 'SEND')).toBe(true);
    expect(plan.every((p) => p.requestChars <= DED_PASS_REQUEST_BUDGET_CHARS)).toBe(true);
    const sentChars = plan.flatMap((p) => p.pages).reduce((a, s) => a + s.text.length, 0);
    expect(sentChars).toBe(33_000);
    // Tidak ada segmen hilang/duplikat: 3 segmen halaman 1 + halaman 2.
    expect(plan.flatMap((p) => p.pages)).toHaveLength(4);
  });

  it('backstop SKIPPED_BUDGET menyebut BAGIAN segmen, bukan seluruh halaman', () => {
    const hugeOverhead = (pages: SelectedPage[]) =>
      19_000 + pages.reduce((a, p) => a + p.text.length, 0);
    const segments = expandPagesIntoSegments([page(7, chars(3000, 'z'))], 1000);
    const plan = planDedPasses([{ label: 'G', pages: segments }], hugeOverhead);
    expect(plan.every((p) => p.kind === 'SKIPPED_BUDGET')).toBe(true);
    const reasons = plan
      .filter((p): p is Extract<typeof p, { kind: 'SKIPPED_BUDGET' }> => p.kind === 'SKIPPED_BUDGET')
      .map((p) => p.reason);
    expect(reasons[0]).toContain('Halaman 7 (bagian 1 dari 3)');
    expect(reasons[2]).toContain('Halaman 7 (bagian 3 dari 3)');
  });
});

/* ------------------------------------------------------------------ */
describe('planFullAiDocument dengan pengukur prompt ASLI', () => {
  it('20 halaman × 4.000 karakter: semua terkirim, tiap kelompok ≤ 19.500', () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({
      page: i + 1,
      title: `Halaman ${i + 1}`,
      text: chars(4000, 'f'),
      pageType: 'DENAH',
    }));
    const measure = (segs: SelectedPage[]) => {
      const b = buildFullAiPrompt({
        projectType: 'BANGUNAN',
        documentText: renderDedPageBlocks(segs),
        pageCount: 20,
        mode: 'FAST',
        pricingPolicy: 'FULL_AI',
      });
      return b.system.length + b.prompt.length;
    };
    const plan = planFullAiDocument(pages, measure);
    expect(plan.includedPages).toHaveLength(20);
    expect(plan.skippedSegments).toEqual([]);
    expect(plan.totalChars).toBe(80_000);
    expect(plan.groups.length).toBeGreaterThan(1);
    expect(plan.groups.every((g) => g.requestChars <= DED_PASS_REQUEST_BUDGET_CHARS)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
describe('Document AI SUMMARY — temuan utuh + sintesis hierarkis', () => {
  it('temuan 5.000 karakter TIDAK dipotong 2.600 saat sintesis', async () => {
    const marker = 'TAIL-MARKER-12345';
    const client = fakeClient((call: RecordedCall) =>
      call.prompt.includes('Ekstrak temuan faktual')
        ? okReply(`${'F'.repeat(5000 - marker.length)}${marker}`)
        : okReply('RINGKASAN-AKHIR'));
    const svc = new DokumenAiService(client);
    const res = await svc.chat({
      documentText: makeDoc(2, 5000), fileName: 't.pdf', mode: 'SUMMARY',
    });
    expect(res.success).toBe(true);
    const synthCall = client.calls.find((c: RecordedCall) => c.prompt.includes('Susun ringkasan dokumen'));
    expect(synthCall).toBeDefined();
    expect(synthCall!.prompt).toContain(marker);
    expect(allWithinBudget(client.calls)).toBe(true);
  }, 30000);

  it('temuan besar disintesis hierarkis: multi-batch + reduce akhir, semua ≤ anggaran', async () => {
    const client = fakeClient((call: RecordedCall) =>
      call.prompt.includes('Ekstrak temuan faktual')
        ? okReply('X'.repeat(8000))
        : okReply('GABUNGAN'));
    const svc = new DokumenAiService(client);
    const res = await svc.chat({
      documentText: makeDoc(4, 13000), fileName: 'besar.pdf', mode: 'SUMMARY',
    });
    const nChunks = buildDocumentChunks(splitDocumentPages(makeDoc(4, 13000))).length;
    expect(nChunks).toBe(4);
    expect(res.success).toBe(true);
    // 4 map + ≥2 reduce (batch + reduce akhir — jumlah batch bergantung
    // panjang system prompt, jadi ditegaskan batas bawah, bukan angka pas).
    expect(client.calls.length).toBeGreaterThanOrEqual(6);
    expect(client.calls.some((c: RecordedCall) => c.prompt.includes('Susun ringkasan dokumen'))).toBe(true);
    expect(res.reply).toContain('GABUNGAN');
    expect(allWithinBudget(client.calls)).toBe(true);
    expect(res.partial).toBe(false);
  }, 30000);
});

/* ------------------------------------------------------------------ */
describe('Document AI EXTRACT / CHECKLIST / DRAFT / TRANSLATE — paginasi', () => {
  it('EXTRACT dokumen besar: map-reduce seluruh potongan, penanda halaman akhir ikut diproses', async () => {
    const marker = 'PENANDA-AKHIR-DOKUMEN-UNIK';
    const client = fakeClient((call: RecordedCall) =>
      call.prompt.includes('Ekstrak tabel/spesifikasi dari potongan')
        ? okReply('ekstrak-potongan')
        : okReply('EKSTRAK-GABUNGAN'));
    const svc = new DokumenAiService(client);
    const doc = makeDoc(6, 5000, 6, marker);
    const res = await svc.chat({ documentText: doc, fileName: 'e.pdf', mode: 'EXTRACT' });
    const nChunks = buildDocumentChunks(splitDocumentPages(doc)).length;
    expect(res.success).toBe(true);
    expect(res.coverage?.processedChunks).toBe(nChunks);
    expect(res.coverage?.totalChunks).toBe(nChunks);
    expect(res.partial).toBe(false);
    expect(res.truncated).toBe(false);
    // Ekor dokumen benar-benar dikirim ke model (bukan dipotong).
    expect(client.calls.some((c: RecordedCall) => c.prompt.includes(marker))).toBe(true);
    expect(allWithinBudget(client.calls)).toBe(true);
  }, 30000);

  it('CHECKLIST mode nyata lewat chat (bukan lagi adaptasi CHAT)', async () => {
    const client = fakeClient(() => okReply('ADA: identitas proyek. TIDAK DITEMUKAN: jadwal.'));
    const svc = new DokumenAiService(client);
    const res = await svc.chat({
      documentText: makeDoc(2, 800), fileName: 'c.pdf', mode: 'CHECKLIST',
    });
    expect(res.success).toBe(true);
    expect(res.reply).toContain('TIDAK DITEMUKAN');
    expect(client.calls.length).toBe(1);
  }, 30000);

  it('DRAFT create dokumen besar: summarize-then-draft, draf memakai ringkasan utuh', async () => {
    const client = fakeClient((call: RecordedCall) => {
      if (call.prompt.includes('Ekstrak temuan faktual')) return okReply('temuan singkat');
      if (call.prompt.includes('Susun ringkasan dokumen')) return okReply('RINGKASAN-UTUH-SELURUH-DOKUMEN');
      if (call.prompt.includes('Buatkan draf dokumen')) return okReply('DRAF-JADI');
      return okReply('?');
    });
    const svc = new DokumenAiService(client);
    const res = await svc.chat({
      documentText: makeDoc(6, 5000), fileName: 'ref.pdf', mode: 'DRAFT',
      prompt: 'Buatkan surat penawaran.',
    });
    expect(res.success).toBe(true);
    expect(res.reply).toBe('DRAF-JADI');
    const draftCall = client.calls.find((c: RecordedCall) => c.prompt.includes('Buatkan draf dokumen'));
    expect(draftCall).toBeDefined();
    expect(draftCall!.prompt).toContain('RINGKASAN-UTUH-SELURUH-DOKUMEN');
    expect(allWithinBudget(client.calls)).toBe(true);
  }, 30000);

  it('DRAFT revise dokumen besar: tiap potongan direvisi lalu digabung', async () => {
    const client = fakeClient((call: RecordedCall) => {
      const m = call.prompt.match(/halaman (\d+)–(\d+)/);
      return okReply(m ? `REVISI-HAL-${m[1]}-${m[2]}` : 'REVISI-?');
    });
    const svc = new DokumenAiService(client);
    const doc = makeDoc(6, 5000);
    const res = await svc.chat({
      documentText: doc, fileName: 'd.pdf', mode: 'DRAFT',
      draftMode: 'revise', prompt: 'Perbaiki ejaan.',
    });
    const chunks = buildDocumentChunks(splitDocumentPages(doc));
    expect(res.success).toBe(true);
    expect(res.partial).toBe(false);
    for (const ch of chunks) {
      expect(res.reply).toContain(`REVISI-HAL-${ch.startPage}-${ch.endPage}`);
    }
    expect(res.reply).not.toContain('CATATAN SISTEM');
    expect(allWithinBudget(client.calls)).toBe(true);
  }, 30000);

  it('TRANSLATE dokumen besar: per potongan + gabung, semua potongan diterjemahkan', async () => {
    const client = fakeClient((_call: RecordedCall, idx: number) => okReply(`TERJEMAHAN-${idx}`));
    const svc = new DokumenAiService(client);
    const doc = makeDoc(6, 5000);
    const res = await svc.chat({
      documentText: doc, fileName: 't.pdf', mode: 'TRANSLATE', targetLanguage: 'en',
    });
    const nChunks = buildDocumentChunks(splitDocumentPages(doc), 8000).length;
    expect(res.success).toBe(true);
    expect(res.partial).toBe(false);
    expect(res.truncated).toBe(false);
    expect(client.calls.length).toBe(nChunks);
    for (let i = 0; i < nChunks; i++) {
      expect(res.reply).toContain(`TERJEMAHAN-${i}`);
    }
  }, 30000);

  it('TRANSLATE potongan gagal: teks asli dipertahankan + penanda eksplisit', async () => {
    const marker = 'ASLI-POTONGAN-2-UNIK';
    const client = fakeClient((call: RecordedCall, idx: number) =>
      idx === 1
        ? aiToolsError('MODEL_ERROR', 'fake:http', 'provider gagal')
        : okReply(`TERJEMAHAN-${idx}`));
    const svc = new DokumenAiService(client);
    const doc = makeDoc(6, 5000, 2, marker);
    const res = await svc.chat({
      documentText: doc, fileName: 't.pdf', mode: 'TRANSLATE', targetLanguage: 'en',
    });
    expect(res.success).toBe(true);
    expect(res.partial).toBe(true);
    expect(res.reply).toContain(marker);
    expect(res.reply).toContain('CATATAN SISTEM');
    expect(res.reply).toContain('tidak diterjemahkan');
  }, 30000);

  it('ENHANCE: kegagalan satu segmen menggagalkan seluruhnya dengan menyebut nomor segmen', async () => {
    const client = fakeClient((_call: RecordedCall, idx: number) =>
      idx === 1
        ? aiToolsError('MODEL_ERROR', 'fake:http', 'provider gagal')
        : okReply('[disunting]'));
    const svc = new DokumenAiService(client);
    const res = await svc.chat({
      documentText: '', fileName: 'Dokumen', mode: 'ENHANCE',
      selectionText: 'Kalimat penting. '.repeat(600), transform: 'formal',
    });
    expect(res.success).toBe(false);
    expect(res.message).toContain('bagian 2 dari 2');
  }, 30000);
});

/* ------------------------------------------------------------------ */
describe('Document AI QA — kutipan jujur + compareDocuments', () => {
  it('QA kutipan terpotong: batas paragraf + penanda eksplisit + truncated true', async () => {
    // 4 halaman × 5.000 karakter, semuanya mengandung "bronjong" —
    // kutipan terpilih melebihi anggaran sehingga potongan terakhir dipotong.
    const pages: string[] = [];
    for (let p = 1; p <= 4; p++) {
      const paras = Array.from({ length: 90 }, () => `Paragraf tentang bronjong galvanis dan tebing sungai ${p}.`);
      pages.push(`[Halaman ${p}]\n${paras.join('\n\n').slice(0, 5000)}`);
    }
    const client = fakeClient(() => okReply('Jawaban dari kutipan.'));
    const svc = new DokumenAiService(client);
    const res = await svc.chat({
      documentText: pages.join('\n\n'), fileName: 'q.pdf', mode: 'QA',
      prompt: 'Apa spesifikasi bronjong pada dokumen ini?',
    });
    expect(res.success).toBe(true);
    expect(client.calls.length).toBe(1);
    expect(client.calls[0].prompt).toContain('kutipan dipotong');
    expect(res.truncated).toBe(true);
    expect(allWithinBudget(client.calls)).toBe(true);
  }, 30000);

  it('QA tanpa relevansi: truncated false (pencarian mencakup semua potongan)', async () => {
    const client = fakeClient(() => okReply('tidak boleh terpanggil'));
    const svc = new DokumenAiService(client);
    const res = await svc.chat({
      documentText: makeDoc(4, 3000), fileName: 'q.pdf', mode: 'QA',
      prompt: 'Siapa nama kucing direktur dan warna bulunya?',
    });
    expect(res.success).toBe(true);
    expect(res.contextInsufficient).toBe(true);
    expect(res.truncated).toBe(false);
    expect(client.calls.length).toBe(0);
  }, 30000);

  it('compareDocuments: dua dokumen utuh dibandingkan, cakupan gabungan tercatat', async () => {
    const client = fakeClient((call: RecordedCall) =>
      call.prompt.includes('Ekstrak poin-poin kunci')
        ? okReply('POIN-DOKUMEN')
        : okReply('PERBANDINGAN-AKHIR'));
    const svc = new DokumenAiService(client);
    const res = await svc.compareDocuments(
      { fileName: 'A.pdf', text: makeDoc(4, 5000) },
      { fileName: 'B.pdf', text: makeDoc(4, 5000) },
    );
    expect(res.success).toBe(true);
    expect(res.reply).toContain('PERBANDINGAN-AKHIR');
    expect(res.mode).toBe('COMPARE');
    expect(res.truncated).toBe(false);
    expect(res.partial).toBe(false);
    expect(res.coverage?.totalPages).toBe(8);
    expect(res.coverage?.processedChunks).toBe(4);
    expect(allWithinBudget(client.calls)).toBe(true);
  }, 30000);

  it('compareDocuments: dokumen kosong → NO_DATA bernama', async () => {
    const client = fakeClient(() => okReply('tidak boleh terpanggil'));
    const svc = new DokumenAiService(client);
    const res = await svc.compareDocuments(
      { fileName: 'A.pdf', text: makeDoc(2, 1000) },
      { fileName: 'B-kosong.pdf', text: '   ' },
    );
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('NO_DATA');
    expect(res.message).toContain('B-kosong.pdf');
    expect(client.calls.length).toBe(0);
  }, 30000);
});
