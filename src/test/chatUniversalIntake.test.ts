/**
 * Test: Universal Conversational Project Intake (master prompt owner
 * 2026-11-10) — perluasan intake percakapan dari landscape ke SEMUA
 * kategori konstruksi (bangunan, sipil, landscape & site, MEP, khusus,
 * multi-disiplin), dibangun DI ATAS paket landscape (projectIntake.ts)
 * tanpa state machine duplikat.
 *
 * Skenario bernama §5 master prompt:
 *  A kantor 3 lantai → fungsi + lantai tercatat; tanya luas bangunan.
 *  B jalan beton 2 km → panjang 2.000 m (SYSTEM_DERIVED, asli "2 km"
 *    dipertahankan); tanya lebar; jawab lebar → brief; afirmasi di
 *    brief → draft kanonis.
 *  C "Saya ingin membuat drainase lingkungan sepanjang 500 meter" →
 *    BUKAN "Perintah tidak dikenali"; tanya tipe saluran dengan opsi
 *    katalog + saluran beton terbuka berlabel konfirmasi pengguna.
 *  D renovasi rumah 2 lantai → tanya bagian yang direnovasi;
 *    "2 lantai" tercatat sebagai JUMLAH LANTAI, bukan cakupan renovasi.
 *  E sekolah + taman + pagar + drainase → multi-disiplin terpisah;
 *    pertanyaan pertama = pembangunan baru; gerbang landscape TIDAK
 *    mencegat.
 *  F koreksi luas bangunan 1.000 → 850 m² → pengakuan persis
 *    "Siap, saya perbarui: … — data lainnya tetap", fakta lain utuh.
 *  G "tambahkan pagar keliling dan area parkir" → cakupan bertambah
 *    TANPA restart.
 *
 * Ditambah (§13): hapus cakupan, konversi satuan (km/hektar/are/cm/mm/
 * titik), provenans fakta, kategori tanpa template katalog (lift,
 * playground — dilaporkan jujur, tidak dikarang), nol nilai finansial
 * karangan di brief, alur terlindungi (rumah, material atap, landscape,
 * DED, template) tidak dicegat, afirmasi saat pertanyaan menggantung
 * menuju brief — BUKAN draft.
 *
 * PAGAR (master prompt §14–15): LOKAL SAJA — tanpa commit/push/deploy/
 * aktivasi billing/metering/migration.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeIntent, tryContinueProjectContext, tryContinueUniversalContext,
  getProjectContextState, clearProjectContext,
  getUniversalContextState, clearUniversalContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  classifyUniversal, extractUniversalContext, catalogCoverage,
  coverageFor, subcategoryById, parseAnchoredLinear, parseCountMentions,
} from '../ai-tools/ezrab-ai/universalIntake';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;

const GENERIC_MENU_MARK = 'Pilih jalurnya';
const hasPush = (res: { actions?: Array<{ action: { kind: string } }> }) =>
  (res.actions ?? []).some((a) => a.action.kind === 'push-universal');

beforeEach(() => {
  clearProjectContext();
  clearUniversalContext();
});

const start = (text: string) =>
  executeIntent(routeIntent(text).intent as never, undefined, ctxFor(text));

describe('Universal Intake — Skenario §5 master prompt', () => {
  it('A: gedung kantor 3 lantai → fungsi+lantai tercatat, tanya luas bangunan total', () => {
    const res = start('Buatkan saya RAB gedung kantor 3 lantai');
    expect(res.awaitProjectConcept).toBe(true);
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(hasPush(res as never)).toBe(false);
    expect(res.message).toContain('luas bangunan total');
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('kantor');
    expect(ctx?.floors).toBe(3);
    expect(ctx?.isMulti).toBe(false);
  });

  it('B: jalan beton 2 km → 2.000 m SYSTEM_DERIVED (asli dipertahankan), tanya lebar; jawab → brief; afirmasi → draft', () => {
    const res = start('Buat RAB jalan beton sepanjang 2 km');
    expect(res.message).toContain('lebar jalan');
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('jalan-beton');
    expect(ctx?.lengthM).toBe(2000);
    expect(ctx?.lengthOriginal).toBe('2 km');
    const lenFact = ctx?.facts.find((f) => f.key === 'length');
    expect(lenFact?.status).toBe('SYSTEM_DERIVED');
    expect(lenFact?.value).toContain('2 km');

    const brief = tryContinueUniversalContext('lebarnya 5 meter');
    expect(brief).not.toBeNull();
    expect(brief!.message).toContain('Siap, saya perbarui: Lebar: 5 m');
    expect(brief!.message).toContain('Brief proyek');
    expect(hasPush(brief as never)).toBe(false);

    const draft = tryContinueUniversalContext('itu aja');
    expect(draft).not.toBeNull();
    expect(hasPush(draft as never)).toBe(true);
    expect(getUniversalContextState()).toBeNull();
  });

  it('C: "ingin membuat drainase 500 m" → ter-route SUMMARY, tanya tipe dengan opsi katalog + beton terbuka berlabel', () => {
    expect(routeIntent('Saya ingin membuat drainase lingkungan sepanjang 500 meter').intent).toBe('CREATE_RAB_SUMMARY');
    const res = start('Saya ingin membuat drainase lingkungan sepanjang 500 meter');
    expect(res.awaitProjectConcept).toBe(true);
    expect(res.message).toContain('U-ditch pracetak');
    expect(res.message).toContain('pasangan batu kali');
    expect(res.message).toContain('Saluran beton terbuka');
    expect(res.message).toContain('pilihan konfirmasi Anda');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('U-ditch pracetak');
    expect(labels).toContain('Saluran beton terbuka');
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('drainase');
    expect(ctx?.lengthM).toBe(500);

    const picked = executeIntent('RAB_INTAKE_OPTION', 'drain-uditch', ctxFor('u-ditch'));
    expect(picked.message).toContain('Brief proyek');
    expect(getUniversalContextState()?.drainageType).toBe('U-Ditch Pracetak');
    const draft = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('susun'));
    expect(hasPush(draft as never)).toBe(true);
  });

  it('D: renovasi rumah 2 lantai → tanya bagian yang direnovasi; lantai tercatat sebagai jumlah lantai', () => {
    const res = start('Buatkan RAB renovasi rumah 2 lantai');
    expect(res.message).toContain('Bagian mana saja yang ingin direnovasi');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Seluruh bangunan');
    expect(labels).toContain('Lantai 1 saja');
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('renovasi');
    expect(ctx?.floors).toBe(2);
    expect(ctx?.renovationScope).toBeNull();

    const brief = executeIntent('RAB_INTAKE_OPTION', 'renov-all', ctxFor('seluruh bangunan'));
    expect(brief.message).toContain('Brief proyek');
    expect(getUniversalContextState()?.renovationScope).toBe('seluruh bangunan');
  });

  it('E: sekolah + taman + pagar + drainase → multi-disiplin terpisah, tanya pembangunan baru, landscape tidak mencegat', () => {
    const res = start('Buatkan RAB pembangunan sekolah lengkap dengan taman, pagar, dan drainase');
    expect(getProjectContextState()).toBeNull();
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('sekolah');
    expect(ctx?.isMulti).toBe(true);
    const secIds = (ctx?.secondary ?? []).map((d) => d.id);
    expect(secIds).toContain('drainase');
    expect(secIds).toContain('pagar-gerbang');
    expect(secIds).toContain('landscape-umum');
    expect(res.message).toContain('pembangunan baru');
    // Kata benda "pembangunan" pada pesan awal TIDAK dihitung status.
    expect(ctx?.isNewConstruction).toBeNull();

    const next = tryContinueUniversalContext('pembangunan baru');
    expect(next!.message).toContain('Status: pembangunan baru');
    expect(getUniversalContextState()?.isNewConstruction).toBe(true);
  });

  it('F: koreksi luas bangunan 1.000 → 850 m² → pengakuan persis, fakta lain tetap', () => {
    start('Buatkan saya RAB gedung kantor 3 lantai');
    const f1 = tryContinueUniversalContext('luas bangunannya 1000 m2');
    expect(f1!.message).toContain('Siap, saya perbarui: Luas bangunan: 1.000 m² — data lainnya tetap');
    expect(getUniversalContextState()?.buildingAreaM2).toBe(1000);
    const f2 = tryContinueUniversalContext('Luas bangunannya bukan 1.000 m², tapi 850 m²');
    expect(f2!.message).toContain('Siap, saya perbarui: Luas bangunan: 850 m² — data lainnya tetap');
    const ctx = getUniversalContextState();
    expect(ctx?.buildingAreaM2).toBe(850);
    expect(ctx?.floors).toBe(3);
    expect(ctx?.primary?.id).toBe('kantor');
  });

  it('G: tambah pagar keliling + area parkir di intake aktif → cakupan bertambah tanpa restart', () => {
    start('Buatkan RAB pembangunan sekolah lengkap dengan taman dan drainase');
    const res = tryContinueUniversalContext('Tambahkan pekerjaan pagar keliling dan area parkir');
    expect(res).not.toBeNull();
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('sekolah');
    const scopeLabels = (ctx?.scopeConfirmed ?? []).map((s) => s.label);
    expect(scopeLabels.some((l) => /pagar/i.test(l))).toBe(true);
    expect(scopeLabels.some((l) => /hardscape/i.test(l))).toBe(true);
  });
});

describe('Universal Intake — hapus cakupan, provenans, satuan', () => {
  it('hapus cakupan: "hapus drainase" membuang disiplin itu dan mencatatnya di brief', () => {
    start('Buatkan RAB pembangunan sekolah lengkap dengan taman, pagar, dan drainase');
    const res = tryContinueUniversalContext('hapus drainase');
    expect(res!.message).toContain('Drainase & saluran dihapus dari lingkup');
    const ctx = getUniversalContextState();
    expect((ctx?.secondary ?? []).map((d) => d.id)).not.toContain('drainase');
    expect(ctx?.scopeRemoved).toContain('Drainase & saluran');
    const brief = executeIntent('RAB_INTAKE_OPTION', 'review', ctxFor('brief'));
    expect(brief.message).toContain('Dihapus atas permintaan Anda');
    expect(brief.message).not.toContain('• Kategori utama: Drainase');
  });

  it('provenans: saran paket berstatus SUGGESTION_ONLY dan tidak masuk cakupan terkonfirmasi', () => {
    const ctx = extractUniversalContext('Buatkan RAB gedung kantor 3 lantai');
    expect(ctx.primary?.id).toBe('kantor');
    expect(ctx.suggestedPackages.length).toBeGreaterThan(0);
    for (const p of ctx.suggestedPackages) {
      expect(ctx.scopeConfirmed.map((s) => s.label)).not.toContain(p);
    }
    const statuses = new Set(ctx.facts.map((f) => f.status));
    expect(statuses.has('USER_CONFIRMED')).toBe(true);
  });

  it('konversi satuan: km→m, cm/mm pada dimensi berjangkar, titik/unit terhitung', () => {
    expect(parseAnchoredLinear('sepanjang 2 km', ['sepanjang'])?.valueM).toBe(2000);
    expect(parseAnchoredLinear('lebarnya 350 cm', ['lebar'])?.valueM).toBe(3.5);
    expect(parseAnchoredLinear('kedalaman 1500 mm', ['kedalaman'])?.valueM).toBe(1.5);
    expect(parseAnchoredLinear('tinggi 3 meter', ['tinggi'])?.valueM).toBe(3);
    expect(parseCountMentions('bore pile 40 titik dan 12 unit')).toHaveLength(2);
    const jalan = extractUniversalContext('Buat RAB jalan beton sepanjang 2 km');
    expect(jalan.lengthM).toBe(2000);
  });

  it('koreksi linear "bukan X, tapi Y": nilai yang dibatalkan tidak menang', () => {
    const ctx = extractUniversalContext('Buat RAB jalan beton sepanjang 2 km');
    const merged = extractUniversalContext('panjangnya bukan 2 km, tapi 1500 meter', ctx);
    expect(merged.lengthM).toBe(1500);
  });

  it('brief tidak memuat nilai finansial karangan (tanpa total Rp, tanpa tabel draft)', () => {
    start('Buatkan saya RAB gedung kantor 3 lantai');
    const brief = executeIntent('RAB_INTAKE_OPTION', 'review', ctxFor('brief'));
    expect(brief.message).toContain('Brief proyek');
    expect(brief.message).not.toMatch(/Rp\s?[\d.]{4,}/);
    expect(brief.message).not.toContain('| No |');
  });
});

describe('Universal Intake — klasifikasi & cakupan katalog', () => {
  it('klasifikasi kategori mayor lintas keluarga', () => {
    expect(classifyUniversal('buatkan rab gedung kantor').primary?.id).toBe('kantor');
    expect(classifyUniversal('buatkan rab rumah sakit').primary?.id).toBe('kesehatan');
    expect(classifyUniversal('buatkan rab jalan tol').primary?.id).toBe('jalan-tol');
    expect(classifyUniversal('buatkan rab jembatan').primary?.id).toBe('jembatan');
    expect(classifyUniversal('buatkan rab irigasi').primary?.id).toBe('irigasi');
    expect(classifyUniversal('buatkan rab dinding penahan tanah').primary?.id).toBe('dinding-penahan');
    expect(classifyUniversal('buatkan rab instalasi listrik').primary?.family).toBe('mep');
    expect(classifyUniversal('buatkan rab hvac').primary?.id).toBe('hvac');
    expect(classifyUniversal('buatkan rab waterproofing').primary?.id).toBe('waterproofing');
    expect(classifyUniversal('buatkan rab interior fit out').primary?.id).toBe('interior');
    expect(classifyUniversal('buatkan rab pembongkaran gedung').primary?.id).toBe('pembongkaran');
  });

  it('MEP sebagai objek utama kalimat menjadi primer (instalasi listrik gedung kantor)', () => {
    const cls = classifyUniversal('buatkan rab instalasi listrik gedung kantor');
    expect(cls.primary?.id).toBe('listrik');
    expect(cls.secondary.map((d) => d.id)).toContain('kantor');
  });

  it('matriks cakupan dihitung dari katalog nyata: lift & playground = tidak-ada; landscape didukung', () => {
    const cov = catalogCoverage();
    expect(cov.find((c) => c.subcategoryId === 'lift')?.support).toBe('tidak-ada');
    expect(coverageFor(subcategoryById('playground')!).support).toBe('tidak-ada');
    expect(coverageFor(subcategoryById('landscape-umum')!).support).toBe('didukung');
    expect(coverageFor(subcategoryById('dinding-penahan')!).support).toBe('didukung');
    // Setiap entri membawa hitungan nyata dari katalog hidup.
    for (const c of cov) {
      expect(c.categoryTemplateCount).toBeGreaterThanOrEqual(c.specificTemplateCount);
    }
  });

  it('brief untuk kategori tanpa template menyatakan gap-nya secara terbuka (lift)', () => {
    start('buatkan rab pemasangan lift untuk gedung kantor 5 lantai');
    const brief = executeIntent('RAB_INTAKE_OPTION', 'review', ctxFor('brief'));
    expect(brief.message).toContain('belum ada template katalog');
    expect(brief.message).toContain('TIDAK dikarang');
  });

  it('kategori teridentifikasi tidak pernah dibalas menu generik (dinding penahan via CLARIFY)', () => {
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor('buatkan rab dinding penahan tanah'));
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).toContain('panjang dinding penahan');
  });

  it('"buatkan rab" tanpa kategori tetap menu generik (yang di sini memang benar)', () => {
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor('buatkan rab'));
    expect(res.message).toContain(GENERIC_MENU_MARK);
    expect(getUniversalContextState()).toBeNull();
  });
});

describe('Universal Intake — persetujuan generate & alur terlindungi', () => {
  it('afirmasi saat pertanyaan menggantung → brief, BUKAN draft', () => {
    start('Buatkan saya RAB gedung kantor 3 lantai');
    const res = tryContinueUniversalContext('oke');
    expect(res!.message).toContain('Brief proyek');
    expect(hasPush(res as never)).toBe(false);
    expect(getUniversalContextState()).not.toBeNull();
  });

  it('generate tanpa basis ukuran yang cukup → jawaban jujur mesin, konteks tetap hidup', () => {
    start('Buatkan RAB pembangunan sekolah lengkap dengan taman, pagar, dan drainase');
    tryContinueUniversalContext('pembangunan baru');
    tryContinueUniversalContext('itu aja');
    const res = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('susun draft'));
    expect(hasPush(res as never)).toBe(false);
    expect(getUniversalContextState()).not.toBeNull();
  });

  it('alur rumah tinggal TIDAK dicegat (ringkasan kebutuhan lama)', () => {
    // Permukaan yang sama dengan skenario C suite landscape: handler
    // CREATE_RAB_SUMMARY (routing frasa ini = CREATE_RAB_DIRECT adalah
    // jalur lama terpisah yang tidak disentuh paket ini).
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab rumah 2 lantai luas bangunan 180 m2'));
    expect(res.awaitProjectConcept).toBeUndefined();
    expect(getUniversalContextState()).toBeNull();
    expect(res.message).toContain('ringkasan kebutuhan');
  });

  it('gerbang material atap TIDAK dicegat', () => {
    const res = start('buatkan rab pemasangan rangka atap dengan lebar 5 x 9');
    expect(res.message).toContain('bahan');
    expect(getUniversalContextState()).toBeNull();
  });

  it('intake landscape murni TIDAK dicegat (gerbang landscape tetap pemiliknya)', () => {
    const res = start('BUATKAN SAYA RAB LANDSCAPE DENGAN TOTAL LUAS 1 HEKTAR');
    expect(getUniversalContextState()).toBeNull();
    expect(getProjectContextState()).not.toBeNull();
    expect(tryContinueProjectContext).toBeDefined();
  });

  it('proyek berdimensi lengkap tetap jalur cepat draft (gudang 1000 m²)', () => {
    const res = start('buatkan rab gudang 1000 m2');
    expect(res.awaitProjectConcept).toBeUndefined();
    expect(hasPush(res as never)).toBe(true);
  });

  it('permintaan DED tetap milik workflow DED (bukan intake universal)', () => {
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor('buatkan rab dari gambar ded ini'));
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(getUniversalContextState()).toBeNull();
  });
});
