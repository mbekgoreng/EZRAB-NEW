/**
 * EZRAB — REKONSTRUKSI ARSITEKTUR AI TERPADU (Opsi A) — SUITE (2026-11-11)
 *
 * Menguji pekerjaan direktif rekonstruksi: layanan pembuatan proyek
 * Magic AI (penamaan + metadata + keputusan + idempotensi), skenario
 * regresi landscape kritis §9 PERSIS, detektor handoff §7, kode error
 * terstruktur §15, konstanta timing §11, dan kunci finalisasi bersama
 * konsolidasi DED §10.
 *
 * Yang TIDAK dibuktikan suite ini (dinyatakan di laporan): rendering
 * React modal/view, insertion spreadsheet lewat ProjectContext live
 * (React) — di sini diverifikasi pada kontrak payload + simulasi
 * penyimpanan/pengambilan ulang yang diberi label jelas.
 *
 * Jalankan: npx --yes tsx src/test/unifiedAiReconstruction.test.ts
 * (suite bergaya vitest — di sandbox dijalankan lewat shim vitest lokal
 * di node_modules, di luar repo.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import {
  extractProjectCreationIntent,
  decideMagicAiProjectAction,
  claimMagicAiSubmission,
  bindMagicAiSubmission,
  resetMagicAiSubmissions,
  formatAreaId,
} from '../ai-tools/ezrab-ai/projectCreationIntent';
import {
  extractProjectContext,
  parseAreaAllocations,
  resolveTotalAreaMention,
} from '../ai-tools/ezrab-ai/projectIntake';
import {
  executeIntent,
  tryContinueProjectContext,
  getProjectContextState,
  clearProjectContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import {
  getLastUniversalDraft,
  buildPushPayload,
  dedupePushPayload,
  validateTransfer,
} from '../ai-tools/ezrab-ai/universalRab';
import { detectHandoffNeed } from '../ai-tools/ezrab-ai/magicHandoff';
import { AI_ERROR_MESSAGES, structuredAiError } from '../ai-tools/ezrab-ai/aiErrorCodes';
import { AI_MIN_DELAY_MS } from '../ai-tools/aiResponseTiming';
import { buildFinalizationKey } from '../ai-tools/ded-ai-estimate/finalizationKey';
import { EzrabAiService } from '../ai-tools/ezrab-ai/service';
import { aiToolsProviderClient } from '../ai-tools/providerClient';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;

const LANDSCAPE_S9 =
  'Buatkan RAB landscape lahan 400m2 dengan 150m2 full tanaman hias. Sisanya jogging track, air mancur dan danau kecil.';

/* ================================================================== */
/* 1. Penamaan + metadata Magic AI (§5.4)                              */
/* ================================================================== */

describe('Penamaan proyek Magic AI — contoh wajib direktif', () => {
  it('"Buatkan RAB landscape 400 m²" → "Landscape 400 m²"', () => {
    const intent = extractProjectCreationIntent('Buatkan RAB landscape 400 m²');
    expect(intent.descriptiveName).toBe('Landscape 400 m²');
    expect(intent.buildingType).toBe('Landscape & Kawasan');
  });
  it('"Buat RAB rumah tinggal dua lantai luas 180 m²" → "Rumah Tinggal 2 Lantai 180 m²"', () => {
    const intent = extractProjectCreationIntent('Buat RAB rumah tinggal dua lantai luas 180 m²');
    expect(intent.descriptiveName).toBe('Rumah Tinggal 2 Lantai 180 m²');
    expect(intent.floors).toBe(2);
  });
  it('"Buat RAB pembangunan jalan beton sepanjang 1,2 km" → "Jalan Beton 1,2 KM"', () => {
    const intent = extractProjectCreationIntent('Buat RAB pembangunan jalan beton sepanjang 1,2 km');
    expect(intent.descriptiveName).toBe('Jalan Beton 1,2 KM');
    expect(intent.buildingType).toBe('Infrastruktur');
  });
  it('nama BUKAN potongan prompt dan BUKAN fallback Rumah Tinggal untuk jalan', () => {
    const intent = extractProjectCreationIntent('Buat RAB pembangunan jalan beton sepanjang 1,2 km');
    expect(intent.descriptiveName).not.toContain('Buat RAB');
    expect(intent.descriptiveName).not.toContain('Rumah');
    expect(intent.buildingType).not.toBe('Rumah Tinggal');
  });
  it('nama eksplisit pengguna menang atas nama deskriptif', () => {
    const intent = extractProjectCreationIntent(
      'Buatkan RAB landscape 400 m², nama proyek: Taman Melati Indah',
    );
    expect(intent.explicitName).toBe('Taman Melati Indah');
  });
  it('field tak diketahui = null (tidak dikarang): tanpa lokasi/klien pada prompt polos', () => {
    const intent = extractProjectCreationIntent('Buatkan RAB landscape 400 m²');
    expect(intent.location).toBeNull();
    expect(intent.clientName).toBeNull();
  });
  it('lokasi & klien diekstrak bila benar-benar disebut', () => {
    const intent = extractProjectCreationIntent(
      'Buatkan RAB rumah tinggal di Surabaya untuk Bapak Hendra',
    );
    expect(intent.location).toBe('Surabaya');
    expect(intent.clientName).toContain('Hendra');
  });
  it('formatAreaId memakai format id-ID', () => {
    expect(formatAreaId(400)).toBe('400 m²');
    expect(formatAreaId(10000)).toBe('10.000 m²');
  });
});

/* ================================================================== */
/* 2. Keputusan pembuatan + idempotensi (§5.3, §5.5)                   */
/* ================================================================== */

describe('Keputusan pembuatan proyek Magic AI', () => {
  it('belum ada proyek aktif → buat otomatis', () => {
    expect(decideMagicAiProjectAction({ hasActiveProject: false, explicitNewProject: false })).toBe('create');
  });
  it('proyek aktif ada + tidak eksplisit → tanya (tidak diam-diam membuat baru)', () => {
    expect(decideMagicAiProjectAction({ hasActiveProject: true, explicitNewProject: false })).toBe('ask');
  });
  it('proyek aktif ada + minta proyek baru eksplisit → buat', () => {
    expect(decideMagicAiProjectAction({ hasActiveProject: true, explicitNewProject: true })).toBe('create');
  });
  it('pilihan pengguna dari dialog dihormati dua arah', () => {
    expect(decideMagicAiProjectAction({ hasActiveProject: true, explicitNewProject: false, userChoice: 'reuse' })).toBe('reuse-active');
    expect(decideMagicAiProjectAction({ hasActiveProject: true, explicitNewProject: false, userChoice: 'new' })).toBe('create');
  });
  it('prompt "proyek baru" terdeteksi eksplisit', () => {
    const intent = extractProjectCreationIntent('Buatkan RAB rumah 90 m² sebagai proyek baru');
    expect(intent.explicitNewProject).toBe(true);
  });
});

describe('Idempotensi submit Magic AI', () => {
  beforeEach(() => resetMagicAiSubmissions());
  it('submit ganda prompt sama → klaim kedua duplikat & proyek yang sama', () => {
    const first = claimMagicAiSubmission('Buatkan RAB landscape 400 m²');
    expect(first.duplicate).toBe(false);
    bindMagicAiSubmission(first.key, 'PRJ-001');
    const second = claimMagicAiSubmission('Buatkan RAB landscape 400 m²');
    expect(second.duplicate).toBe(true);
    expect(second.projectId).toBe('PRJ-001');
  });
  it('prompt berbeda → bukan duplikat', () => {
    claimMagicAiSubmission('Buatkan RAB landscape 400 m²');
    const other = claimMagicAiSubmission('Buatkan RAB rumah 90 m²');
    expect(other.duplicate).toBe(false);
  });
  it('klaim kedaluwarsa sesudah TTL → dianggap baru', () => {
    const first = claimMagicAiSubmission('Buatkan RAB landscape 400 m²', 1_000_000);
    bindMagicAiSubmission(first.key, 'PRJ-001');
    const later = claimMagicAiSubmission('Buatkan RAB landscape 400 m²', 1_000_000 + 11 * 60_000);
    expect(later.duplicate).toBe(false);
  });
});

/* ================================================================== */
/* 3. Skenario regresi landscape kritis §9 — PERSIS                    */
/* ================================================================== */

describe('§9 Skenario landscape kritis — ekstraksi', () => {
  it('total lahan 400 (bukan 150), alokasi tanaman hias 150, sisa 250 eksplisit', () => {
    const ctx = extractProjectContext(LANDSCAPE_S9);
    expect(ctx.landAreaM2).toBe(400);
    expect(ctx.allocations).toHaveLength(1);
    expect(ctx.allocations[0].purpose).toBe('tanaman hias');
    expect(ctx.allocations[0].areaM2).toBe(150);
    const known = ctx.knownInformation.join('\n');
    expect(known).toContain('Total luas: 400 m²');
    expect(known).toContain('Alokasi: tanaman hias 150 m²');
    expect(known).toContain('Sisa 250 m² belum teralokasi spesifik');
  });
  it('fasilitas terkonfirmasi: tanaman hias, jogging track, air mancur, danau kecil', () => {
    const ctx = extractProjectContext(LANDSCAPE_S9);
    expect(ctx.facilities).toContain('jogging-track');
    expect(ctx.facilities).toContain('danau');
    expect(ctx.facilities).toContain('water-feature'); // air mancur
    expect(ctx.facilities.some((f) => f === 'lawn' || f === 'decorative-planting')).toBe(true);
  });
  it('fakta terkonfirmasi TIDAK mengandung dimensi karangan (panjang jogging/danau/pohon/lampu)', () => {
    const ctx = extractProjectContext(LANDSCAPE_S9);
    const known = ctx.knownInformation.join('\n');
    expect(known).not.toContain('380');
    expect(known).not.toContain('45 pohon');
    expect(known).not.toMatch(/jogging[^\n]*\d+\s*(m|meter)\b/i);
    expect(known).not.toMatch(/danau[^\n]*\d+/i);
    expect(known).not.toMatch(/panjang[^\n]*jogging/i);
  });
  it('follow-up "Lahan datar." tercatat sebagai kondisi lahan tanpa mengubah total', () => {
    const first = extractProjectContext(LANDSCAPE_S9);
    const second = extractProjectContext('Lahan datar.', first);
    expect(second.siteConditions).toContain('lahan datar');
    expect(second.landAreaM2).toBe(400);
    expect(second.allocations).toHaveLength(1);
  });
  it('alokasi melebihi total → peringatan tumpang tindih tampil', () => {
    const ctx = extractProjectContext(
      'Buatkan RAB landscape lahan 200m2 dengan 250m2 full tanaman hias',
    );
    expect(ctx.knownInformation.join('\n')).toContain('tumpang tindih');
    expect(ctx.missingInformation.join('\n')).toContain('tumpang tindih');
  });
  it('parseAreaAllocations: dua bentuk frasa terbaca; luas total bukan alokasi', () => {
    expect(parseAreaAllocations('lahan 400m2')).toHaveLength(0);
    const b = parseAreaAllocations('tanaman hias seluas 150 m2');
    expect(b).toHaveLength(1);
    expect(b[0].areaM2).toBe(150);
    expect(resolveTotalAreaMention(LANDSCAPE_S9, parseAreaAllocations(LANDSCAPE_S9))?.valueM2).toBe(400);
  });
});

describe('§9 Skenario landscape kritis — alur percakapan sampai draft', () => {
  beforeEach(() => clearProjectContext());
  it('alur penuh: intake → datar → konsep → generate → draft jujur + payload', () => {
    const r1 = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor(LANDSCAPE_S9)) as any;
    expect(String(r1?.message ?? '')).not.toContain('Pilih jalurnya');
    expect(String(r1?.message ?? '')).toContain('400 m²');
    let state = getProjectContextState();
    expect(state?.landAreaM2).toBe(400);

    const r2 = tryContinueProjectContext('Lahan datar.', ctxFor('Lahan datar.')) as any;
    expect(String(r2?.message ?? '')).toContain('lahan datar');
    state = getProjectContextState();
    expect(state?.siteConditions).toContain('lahan datar');
    expect(state?.landAreaM2).toBe(400);

    executeIntent('RAB_CONCEPT_SELECT', 'taman-publik', ctxFor(''));
    const r4 = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor('')) as any;
    const msg = String(r4?.message ?? '');
    expect(msg).toContain('luas 400 m²');
    // Default template TIDAK diam-diam: dinyatakan sebagai asumsi terbuka.
    expect(msg).toContain('Asumsi yang dipakai');
    expect(msg).toContain('default template (45 pohon)');
    expect(msg).toContain('default template (380 m)');
    // Nama proyek dari intent pembuatan (jalur Magic AI) untuk prompt ini:
    expect(extractProjectCreationIntent(LANDSCAPE_S9).descriptiveName).toBe('Landscape 400 m²');

    // Payload transfer: terstruktur, harga tak teresolusi tidak menjadi 0.
    const draft = getLastUniversalDraft();
    expect(draft).not.toBeNull();
    const payload = buildPushPayload(draft as never);
    expect(payload.length).toBeGreaterThan(0);
    for (const item of payload) {
      if (item.priceStatus === 'PRICE_UNRESOLVED') {
        expect(item.unitPrice ?? null).toBeNull();
      } else {
        expect(item.unitPrice ?? 0).toBeGreaterThan(0);
      }
    }
    // Validasi transfer: tanpa proyek tujuan → alasan eksplisit.
    const noProject = validateTransfer(draft as never, null);
    expect(noProject.allowed).toBe(false);
    expect(noProject.reasons.join(' ')).toContain('tidak ada proyek tujuan');
    const withProject = validateTransfer(draft as never, 'PRJ-SIM-S9');
    expect(withProject.allowed).toBe(true);

    // SIMULASI penyimpanan spreadsheet (kontrak store): sisipkan payload
    // ke store in-memory per proyek, lalu AMBIL ULANG dan cocokkan —
    // inilah pola verifikasi baca-balik yang dipakai jalur live lewat
    // getProjects() sesudah bulkAddRabItems.
    const store = new Map<string, typeof payload>();
    store.set('PRJ-SIM-S9', [...payload]);
    const retrieved = store.get('PRJ-SIM-S9') ?? [];
    expect(retrieved).toHaveLength(payload.length);
    expect(retrieved.reduce((s, i) => s + i.volume, 0)).toBe(
      payload.reduce((s, i) => s + i.volume, 0),
    );
    // Transfer ulang payload yang sama → dedupe menolak duplikat.
    const dedup = dedupePushPayload(payload, retrieved);
    expect(dedup.newItems).toHaveLength(0);
    expect(dedup.dupCount).toBe(payload.length);
  });
});

/* ================================================================== */
/* 4. Handoff (§7) + kode error (§15) + timing (§11)                   */
/* ================================================================== */

describe('Detektor handoff Magic AI → Chat AI', () => {
  it('dokumen DED banyak PDF → tawaran handoff', () => {
    const need = detectHandoffNeed('Tolong analisis beberapa file PDF gambar kerja DED proyek ini');
    expect(need.needed).toBe(true);
    expect(need.reason).toContain('analisis beberapa tahap');
    expect(need.reason).toContain('Anda juga bisa tetap melanjutkan di sini.');
  });
  it('permintaan RAB sederhana → tanpa tawaran', () => {
    expect(detectHandoffNeed('Buatkan RAB rumah tinggal 90 m²').needed).toBe(false);
    expect(detectHandoffNeed('halo').needed).toBe(false);
  });
  it('bangunan tinggi terdeteksi dari jumlah lantai', () => {
    expect(detectHandoffNeed('Buatkan RAB gedung kantor', { floors: 8 }).needed).toBe(true);
  });
});

describe('Kode error terstruktur §15', () => {
  it('seluruh kode direktif punya pesan aksi Bahasa Indonesia', () => {
    const codes = Object.keys(AI_ERROR_MESSAGES);
    expect(codes).toContain('PROJECT_CREATION_FAILED');
    expect(codes).toContain('ACTIVE_PROJECT_NOT_FOUND');
    expect(codes).toContain('AI_PROVIDER_TIMEOUT');
    expect(codes).toContain('AI_CONTEXT_LIMIT_EXCEEDED');
    expect(codes).toContain('DRAFT_GENERATION_FAILED');
    expect(codes).toContain('PRICE_UNRESOLVED');
    expect(codes).toContain('SPREADSHEET_TRANSFER_FAILED');
    expect(codes).toContain('SPREADSHEET_PERSISTENCE_UNVERIFIED');
    expect(codes).toContain('DUPLICATE_TRANSFER_BLOCKED');
    expect(codes).toContain('DOCUMENT_PROCESSING_FAILED');
    for (const c of codes) expect(AI_ERROR_MESSAGES[c as keyof typeof AI_ERROR_MESSAGES].length).toBeGreaterThan(20);
  });
  it('structuredAiError membawa kode + correlation id', () => {
    const err = structuredAiError('DUPLICATE_TRANSFER_BLOCKED');
    expect(err.code).toBe('DUPLICATE_TRANSFER_BLOCKED');
    expect(err.correlationId.length).toBeGreaterThan(4);
  });
});

describe('Timing terpusat §11', () => {
  it('konstanta sesuai rentang direktif: pendek ≈2 dtk, kontekstual 2–3, kompleks 3–5', () => {
    expect(AI_MIN_DELAY_MS.simple).toBe(2000);
    expect(AI_MIN_DELAY_MS.medium).toBeGreaterThanOrEqual(2000);
    expect(AI_MIN_DELAY_MS.medium).toBeLessThanOrEqual(3000);
    expect(AI_MIN_DELAY_MS.complex).toBeGreaterThanOrEqual(3000);
    expect(AI_MIN_DELAY_MS.complex).toBeLessThanOrEqual(5000);
  });
});

/* ================================================================== */
/* 5. Konsolidasi DED (§10) + pagar sumber (pin statis)                */
/* ================================================================== */

describe('Konsolidasi DED — kunci finalisasi bersama', () => {
  const items = [
    { description: 'Galian tanah', unit: 'm3', volume: 12, unitPrice: 85000, priceSourceKind: 'EZRAB_ASSUMPTION' },
    { description: 'Beton K-250', unit: 'm3', volume: 4, unitPrice: 1250000, priceSourceKind: 'EZRAB_ASSUMPTION' },
  ];
  it('kunci deterministik: set sama urutan berbeda → kunci sama', () => {
    expect(buildFinalizationKey('PRJ-1', items)).toBe(buildFinalizationKey('PRJ-1', [...items].reverse()));
  });
  it('proyek berbeda → kunci berbeda (duplikat hanya per proyek)', () => {
    expect(buildFinalizationKey('PRJ-1', items)).not.toBe(buildFinalizationKey('PRJ-2', items));
  });
  it('jalur MAGIC kini memakai kunci yang sama (pin sumber)', () => {
    const dash = readFileSync('src/components/magic-ai/DedAnalysisDashboard.tsx', 'utf-8');
    expect(dash).toContain('buildFinalizationKey');
    expect(dash).toContain('getLastBulkAddOutcome');
  });
});

describe('Fase F — anggaran riwayat prompt (akar insiden oversized)', () => {
  it('riwayat berisi pesan draft raksasa dipotong berpenanda; prompt di bawah batas gateway', async () => {
    const giant = `Tabel draft RAB\n${'x'.repeat(30_000)}`;
    const spy = vi
      .spyOn(aiToolsProviderClient, 'execute')
      .mockResolvedValue({ success: false, message: 'berhenti di tes', errorCode: 'TEST_STOP' } as never);
    try {
      const svc = new EzrabAiService();
      await svc.send({
        messages: [
          { role: 'assistant', content: giant },
          { role: 'assistant', content: giant },
          { role: 'user', content: 'ya, lanjutkan' },
        ],
      } as never);
      expect(spy.mock.calls.length).toBe(1);
      const arg = (spy.mock.calls[0][0] ?? {}) as { prompt?: string };
      const prompt = String(arg.prompt ?? '');
      // Blok riwayat tidak lagi memuat 60.000 karakter mentah.
      expect(prompt.length).toBeLessThan(30_000);
      expect(prompt).toContain('dipotong demi batas konteks');
      expect(prompt).toContain('ya, lanjutkan');
      expect(prompt).not.toContain('x'.repeat(10_000));
    } finally {
      (spy as { mockRestore?: () => void }).mockRestore?.();
    }
  });
  it('riwayat pendek tidak diubah (tanpa penanda potong)', async () => {
    const spy = vi
      .spyOn(aiToolsProviderClient, 'execute')
      .mockResolvedValue({ success: false, message: 'berhenti di tes', errorCode: 'TEST_STOP' } as never);
    try {
      const svc = new EzrabAiService();
      await svc.send({
        messages: [
          { role: 'user', content: 'halo' },
          { role: 'assistant', content: 'Halo! Ada yang bisa saya bantu?' },
          { role: 'user', content: 'buatkan RAB rumah 90 m²' },
        ],
      } as never);
      const arg = (spy.mock.calls[0][0] ?? {}) as { prompt?: string };
      const prompt = String(arg.prompt ?? '');
      expect(prompt).toContain('Halo! Ada yang bisa saya bantu?');
      expect(prompt).not.toContain('dipotong demi batas konteks');
    } finally {
      (spy as { mockRestore?: () => void }).mockRestore?.();
    }
  });
});

describe('Pagar sumber rekonstruksi', () => {
  it('CreateProjectModal tidak lagi memfabrikasi "Klien AI" / potongan prompt', () => {
    const modal = readFileSync('src/components/projects/CreateProjectModal.tsx', 'utf-8');
    expect(modal).not.toContain("'Klien AI'");
    expect(modal).not.toContain('substring(0, 36)');
    expect(modal).toContain('extractProjectCreationIntent');
    expect(modal).toContain('decideMagicAiProjectAction');
  });
  it('view Chat AI memuat presentasi Magic AI + tawaran handoff (satu mesin)', () => {
    const view = readFileSync('src/ai-tools/ezrab-ai/view.tsx', 'utf-8');
    expect(view).toContain('presentationMode');
    expect(view).toContain('EZRAB Magic AI');
    expect(view).toContain('detectHandoffNeed');
  });
  it('tidak ada RabGeneratorModal yang dihidupkan kembali', () => {
    const registry = readFileSync('src/ai-tools/ezrab-ai/actionRegistry.ts', 'utf-8');
    expect(registry).not.toContain('RabGeneratorModal');
  });
});
