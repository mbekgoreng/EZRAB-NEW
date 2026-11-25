/**
 * fastTrackAhsp — pin perilaku baru program EZRAB Fast Track Completion
 * (W-AHSP, 2026-11-24), dikelompokkan per tugas:
 *
 * - WB-02 (HIGH): normalizeUnitName memetakan Meter Panjang → m dan
 *   Kilogram → kg; awalan alasan FU2 memakai hasil gerbang sebenarnya.
 * - WB-03 (HIGH): pencocokan spec batas kata (K-250 tidak lagi cocok
 *   dengan "jarak 250"); EXACT_MATCH wajib punya tumpang-tindih nama.
 * - WB-04 (HIGH): lookup kode parenthesized Bina Marga via standardCode.
 * - WB-05 (HIGH): searchOfficialAhsp punya lantai relevansi (nol
 *   kecocokan nyata → []); kategori keluar dari haystack.
 * - WB-06 (MEDIUM): pencarian kode berjangkar (3.7.4 ⊄ 4.1.3.7.4) +
 *   jalur multi-kode di chat.
 * - WB-07 (MEDIUM): koreksi fuzzy hanya fallback + istilah terkoreksi
 *   wajib cocok dengan item skor-teratas; seri skor diputus jumlah
 *   istilah cocok.
 * - WB-11 (MEDIUM): gatherEstimateSources membuang referensi yang tak
 *   dapat dinormalisasi / satuannya tidak cocok.
 * - WB-12 (MEDIUM): fallback cari_template_rab lewat searchChatAhsp
 *   dengan judul + pertanyaan dimensi dari kueri (bukan paving-block).
 * - H-06 (MEDIUM): status evidence diturunkan dari pemeriksaan
 *   (regex/AI-0.40 → INFERRED; auto-fill tidak mempromosikan
 *   kelengkapan menjadi VERIFIED).
 *
 * Suite tsx polos (BUKAN vitest). Tanpa live gateway, tanpa network,
 * tanpa paid call, tanpa DB live.
 * Jalankan: npx --yes tsx src/test/fastTrackAhsp.test.ts
 */
import {
  validateUnitCompatibility,
  normalizeUnitName,
} from '../engine/constructionCalculators/unitCompatibility';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { DedToRabPipelineService, derivePriceProvenance } from '../services/dedToRabPipelineService';
import { searchChatAhsp, normalizeChatQuery } from '../ai-tools/ezrab-ai/chatSearch';
import { gatherEstimateSources } from '../engine/pricing/aiEstimate/aiPriceEstimate';
import { marketReviewStore } from '../engine/pricing/market/reviewStore';
import { EZRAB_AI_TOOL_MAP } from '../ai-tools/ezrab-ai/tools';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const svc = DedToRabPipelineService.getInstance();

/* ================= WB-02 ================= */
{
  check(
    'WB-02a validateUnitCompatibility(m, Meter Panjang) = EXACT_MATCH',
    validateUnitCompatibility('m', 'Meter Panjang').result === 'EXACT_MATCH',
    JSON.stringify(validateUnitCompatibility('m', 'Meter Panjang'))
  );
  check(
    'WB-02b validateUnitCompatibility(kg, Kilogram) = EXACT_MATCH',
    validateUnitCompatibility('kg', 'Kilogram').result === 'EXACT_MATCH'
  );
  check('WB-02c normalizeUnitName(Meter Panjang) = m', normalizeUnitName('Meter Panjang') === 'm');
  check('WB-02d normalizeUnitName(Kilogram) = kg', normalizeUnitName('Kilogram') === 'kg');
  check('WB-02e normalizeUnitName(Meter Lari) = m', normalizeUnitName('Meter Lari') === 'm');
  const r = svc.resolveLatestAHSP('Saluran U Pracetak Tipe DS 1', undefined, 'm');
  check('WB-02f Saluran DS 1 + m → B.38', r.ahspCode === 'B.38', `got ${r.ahspCode}`);
  check('WB-02g Saluran DS 1 + m tanpa unitMismatch', r.unitMismatch === undefined, JSON.stringify(r.unitMismatch ?? null));
  // Awalan alasan FU2 memakai hasil gerbang sebenarnya (UNIT_UNKNOWN,
  // bukan hardcoded UNIT_MISMATCH).
  const u = svc.resolveLatestAHSP('Saluran U Pracetak Tipe DS 1', undefined, 'sey');
  check(
    'WB-02h satuan tak dikenal → result UNIT_UNKNOWN',
    u.unitMismatch?.result === 'UNIT_UNKNOWN',
    JSON.stringify(u.unitMismatch ?? null)
  );
  check(
    'WB-02i alasan FU2 berawalan UNIT_UNKNOWN:',
    (u.unitMismatch?.reason ?? '').startsWith('UNIT_UNKNOWN:'),
    (u.unitMismatch?.reason ?? '').slice(0, 40)
  );
}

/* ================= WB-03 ================= */
{
  const beton = svc.resolveLatestAHSP('Beton K-250', 'K-250', 'm3');
  check(
    'WB-03a Beton K-250 TIDAK mengembalikan A.3.05.4c.1 (item kayu jarak 250)',
    beton.ahspCode !== 'A.3.05.4c.1',
    `got ${beton.ahspCode} ${beton.matchStatus}`
  );
  check(
    'WB-03b Beton K-250 bukan EXACT_MATCH',
    beton.matchStatus !== 'EXACT_MATCH',
    `got ${beton.matchStatus}`
  );
  const zzzz = svc.resolveLatestAHSP('zzzz', 'K-250', 'm3');
  check(
    'WB-03c nama fiktif + K-250 → NOT_FOUND/AI_CUSTOM, bukan EXACT_MATCH',
    zzzz.matchStatus === 'NOT_FOUND' && zzzz.sourceType === 'AI_CUSTOM',
    `got ${zzzz.ahspCode} ${zzzz.matchStatus} ${zzzz.sourceType}`
  );
  // Kontrol positif: spec token asli tetap cocok + EXACT.
  const wire = svc.resolveLatestAHSP('Wiremesh M10', 'M10', 'm2');
  check(
    'WB-03d Wiremesh M10 + spec M10 tetap EXACT_MATCH (token m10 asli)',
    wire.ahspCode === '2.2.1.1.5' && wire.matchStatus === 'EXACT_MATCH',
    `got ${wire.ahspCode} ${wire.matchStatus}`
  );
  const fc = svc.resolveLatestAHSP('Beton kolom', 'fc 20', 'm3');
  check(
    'WB-03e Beton kolom + spec fc 20 tetap EXACT_MATCH',
    fc.matchStatus === 'EXACT_MATCH',
    `got ${fc.ahspCode} ${fc.matchStatus}`
  );
}

/* ================= WB-04 ================= */
{
  check(
    "WB-04a getOfficialAhsp('2.3.(21a)') = B.38",
    officialAhspRepository.getOfficialAhsp('2.3.(21a)')?.code === 'B.38',
    `got ${officialAhspRepository.getOfficialAhsp('2.3.(21a)')?.code}`
  );
  check(
    "WB-04b hasOfficialAhsp('2.3.(21a)') = true",
    officialAhspRepository.hasOfficialAhsp('2.3.(21a)') === true
  );
  check(
    "WB-04c getOfficialAhsp('7.3.(1)') = G.74",
    officialAhspRepository.getOfficialAhsp('7.3.(1)')?.code === 'G.74'
  );
  const chat = searchChatAhsp('7.3.(1)');
  check(
    "WB-04d searchChatAhsp('7.3.(1)') → FOUND_RELEVANT G.74",
    chat.outcome === 'FOUND_RELEVANT' && chat.items[0]?.code === 'G.74',
    `${chat.outcome} ${chat.items.map((i) => i.code).join(',')}`
  );
  check(
    'WB-04e kode parenthesized fiktif tetap NOT_FOUND',
    officialAhspRepository.getOfficialAhsp('9.9.(99z)') === undefined
  );
  // Gerbang §14 diterapkan pada item hasil resolusi: E.2 karantina,
  // standardCode-nya (5.1.(1b)) tetap tidak dapat dilookup.
  check(
    'WB-04f standardCode item karantina (E.2 → 5.1.(1b)) tetap undefined',
    officialAhspRepository.getOfficialAhsp('5.1.(1b)') === undefined
  );
}

/* ================= WB-05 ================= */
{
  check(
    "WB-05a searchOfficialAhsp('harga ACP per m2') → []",
    officialAhspRepository.searchOfficialAhsp('harga ACP per m2').length === 0,
    officialAhspRepository.searchOfficialAhsp('harga ACP per m2').map((h) => h.item.code).join(',')
  );
  check(
    'WB-05b kueri yang semua istilah kontennya absen → []',
    officialAhspRepository.searchOfficialAhsp('asdfghjkl qwerty').length === 0
  );
  check(
    "WB-05c kueri tanpa istilah konten ('harga per m2') → []",
    officialAhspRepository.searchOfficialAhsp('harga per m2').length === 0
  );
  // Kontrol positif: kueri nyata tetap menemukan hasil (gerbang tidak overreach).
  // (Limit 50: item 3.7.x berskor 40 seri dengan banyak item lain dan
  // terurut stabil sesudah 2.2.x — perilaku pra-perubahan, bukan efek gerbang.)
  const plester = officialAhspRepository.searchOfficialAhsp('plesteran dinding 1:4', { limit: 50 });
  check(
    'WB-05d plesteran dinding 1:4 tetap menemukan item 3.7.x',
    plester.length > 0 && plester.some((h) => h.item.code === '3.7.4'),
    plester.map((h) => h.item.code).slice(0, 4).join(',')
  );
  const pondasi = officialAhspRepository.searchOfficialAhsp('pondasi batu kali');
  check(
    'WB-05e pondasi batu kali tetap menemukan hasil',
    pondasi.length > 0,
    `got ${pondasi.length}`
  );
}

/* ================= WB-06 ================= */
{
  const codes = officialAhspRepository
    .searchOfficialAhsp('3.7.4 3.7.5')
    .map((h) => h.item.code);
  check(
    "WB-06a search '3.7.4 3.7.5' hanya 3.7.4/3.7.5 (tanpa 4.1.3.7.4/4.1.3.7.5)",
    codes.length === 2 && codes.includes('3.7.4') && codes.includes('3.7.5'),
    codes.join(',')
  );
  check(
    'WB-06b normalizeChatQuery multi-kode mendeteksi kedua kode',
    JSON.stringify(normalizeChatQuery('3.7.4 3.7.5').codeQueries) === JSON.stringify(['3.7.4', '3.7.5']),
    JSON.stringify(normalizeChatQuery('3.7.4 3.7.5').codeQueries)
  );
  const multi = searchChatAhsp('3.7.4 3.7.5');
  check(
    "WB-06c searchChatAhsp('3.7.4 3.7.5') → FOUND_RELEVANT kedua kode",
    multi.outcome === 'FOUND_RELEVANT' &&
      multi.items.map((i) => i.code).includes('3.7.4') &&
      multi.items.map((i) => i.code).includes('3.7.5'),
    `${multi.outcome} ${multi.items.map((i) => i.code).join(',')}`
  );
  const partial = searchChatAhsp('3.7.4 9.9.9.9');
  check(
    "WB-06d multi-kode sebagian hilang → FOUND_PARTIAL + kode hilang di catatan",
    partial.outcome === 'FOUND_PARTIAL' &&
      partial.items.some((i) => i.code === '3.7.4') &&
      (partial.note ?? '').includes('9.9.9.9'),
    `${partial.outcome} note=${partial.note ?? '-'}`
  );
}

/* ================= WB-07 ================= */
{
  const portlan = searchChatAhsp('semen portlan');
  check(
    "WB-07a 'semen portlan' TIDAK dikoreksi menjadi 'portal'",
    !(portlan.note ?? '').includes('portal'),
    portlan.note ?? '-'
  );
  const blow = searchChatAhsp('blowplank');
  check(
    "WB-07b 'blowplank' tetap dikoreksi → bouwplank + FOUND_RELEVANT 1.1.4.2",
    blow.outcome === 'FOUND_RELEVANT' &&
      blow.items.some((i) => i.code === '1.1.4.2') &&
      (blow.note ?? '').includes('"blowplank" dikoreksi menjadi "bouwplank"'),
    `${blow.outcome} note=${blow.note ?? '-'}`
  );
  // Kasus sah C-014 yang dijaga: outcome PARTIAL tetap dipertahankan.
  check(
    "WB-07c 'dynabolt m10' tetap FOUND_PARTIAL (kasus C-014 dijaga)",
    searchChatAhsp('dynabolt m10').outcome === 'FOUND_PARTIAL'
  );
  // Seri skor diputus jumlah istilah cocok dulu: pada jawaban mana pun,
  // item berskor sama terurut jumlah istilah cocok menurun.
  for (const q of ['atap genteng metal', 'pintu kayu jati', 'galian tanah biasa']) {
    const r = searchChatAhsp(q);
    let ordered = true;
    for (let i = 1; i < r.items.length; i++) {
      if (
        r.items[i].score === r.items[i - 1].score &&
        r.items[i].matchedTerms.length > r.items[i - 1].matchedTerms.length
      ) {
        ordered = false;
      }
    }
    check(`WB-07d seri skor terurut jumlah istilah cocok (${q})`, ordered);
  }
}

/* ================= WB-11 ================= */
{
  const SPEC = { category: 'semen', keyAttributes: { berat_kg: 50 }, extraAttributes: {} } as any;
  const seed = (id: string, patch: Record<string, unknown>) => {
    (marketReviewStore as any).refs.set(id, {
      id,
      materialId: null,
      canonicalName: 'Semen Portland 50kg',
      aliases: [],
      spec: SPEC,
      needSpec: SPEC,
      sourceName: 'Toko Maju',
      sourceType: 'toko_bangunan',
      sourceProductId: null,
      productTitle: 'Semen 50kg',
      productUrl: 'https://toko.example/semen',
      listedPrice: 75000,
      packageQuantity: 1,
      packageUnit: 'zak',
      normalizedUnit: 'zak',
      priceType: 'normal',
      region: 'Jakarta',
      verificationStatus: 'MARKET_VERIFIED',
      normalizedUnitPrice: 75000,
      confidence: 0.9,
      history: [],
      ingestedAt: new Date().toISOString(),
      ingestedBy: 'test',
      ...patch,
    });
  };
  (marketReviewStore as any).refs.clear();
  seed('ft-wb11-ok', {});
  seed('ft-wb11-null', { listedPrice: 50000, normalizedUnitPrice: null });
  seed('ft-wb11-unit', { listedPrice: 60000, normalizedUnitPrice: 60000, normalizedUnit: 'kg' });
  const srcs = gatherEstimateSources('Semen Portland 50kg', 'zak');
  check(
    'WB-11a referensi tak-ternormalisasi (null) + satuan tak cocok dibuang — hanya 1 sumber',
    srcs.length === 1,
    `got ${srcs.length}: ${JSON.stringify(srcs)}`
  );
  check(
    'WB-11b sumber yang dipakai adalah yang ternormalisasi (Rp75.000/zak)',
    srcs.length === 1 && srcs[0].price === 75000 && srcs[0].unit === 'zak'
  );
  // Lookup material_db / ahsp_similar ikut gerbang satuan.
  (marketReviewStore as any).refs.clear();
  const lookups = gatherEstimateSources('Material Entah Berantah Xyz', 'zak', {
    materialDbLookup: () => ({ price: 1000, unit: 'kg', label: 'db-kg' }),
    similarAhspLookup: () => ({ price: 2000, unit: 'zak', label: 'ahsp-zak' }),
  });
  check(
    'WB-11c lookup bersatuan tak cocok dibuang, yang cocok dipakai',
    lookups.length === 1 && lookups[0].label === 'ahsp-zak',
    JSON.stringify(lookups)
  );
}

/* ================= WB-12 ================= */
{
  const tool = EZRAB_AI_TOOL_MAP['cari_template_rab'];
  const out = tool.invoke({ kata_kunci: 'gudang' });
  check(
    "WB-12a fallback 'gudang' berjudul dari kueri, bukan Paving Block",
    out.startsWith('Draf RAB — gudang') && !out.includes('Paving Block'),
    out.slice(0, 120)
  );
  check(
    "WB-12b fallback 'gudang' tanpa pertanyaan tebal paving",
    !out.includes('tebal paving') && !out.includes('paving'),
    out.slice(0, 120)
  );
  check(
    'WB-12c fallback memakai pertanyaan dimensi generik',
    out.includes('Sebutkan ukuran/dimensi pekerjaan yang dimaksud')
  );
  const none = tool.invoke({ kata_kunci: 'asdfghjkl' });
  check(
    'WB-12d kueri tanpa template + tanpa AHSP → pesan tidak ada yang cocok',
    none.includes('Tidak ada template RAB maupun item AHSP yang cocok'),
    none.slice(0, 120)
  );
}

/* ================= H-06 ================= */
async function runH06(): Promise<void> {
  // (a) Deteksi regex: INFERRED, bukan VERIFIED.
  const src: any = {
    sourceId: 'ft-h06-src-001',
    sourceName: 'DED_Struktur_Kolom.pdf',
    sourceType: 'pdf',
  };
  const dets = svc.detectVisibleElements(src, 'Kolom K1 beton bertulang pada denah lantai 1.');
  check('H-06a detectVisibleElements menemukan kolom', dets.length > 0, `got ${dets.length}`);
  check(
    'H-06b deteksi regex berstatus INFERRED (bukan VERIFIED)',
    dets.length > 0 && dets.every((d: any) => d.evidence.status === 'INFERRED'),
    dets.map((d: any) => d.evidence.status).join(',')
  );

  // (b) Interpretasi AI 0.40 (skala tak terverifikasi): INFERRED.
  const lowScale: any = {
    sourceId: 'ft-h06-src-002',
    fileHash: 'ft-h06-src-002',
    sourceType: 'pdf',
    sourceName: 'DED_Struktur_Kolom.pdf',
    pageCount: 1,
    fileSizeBytes: 1000,
    status: 'VERIFIED',
    classification: 'STRUCTURAL_DRAWING',
    scale: 'UNVERIFIED',
    scaleVerified: false,
    uploadedAt: new Date().toISOString(),
    rawText: 'Kolom K1 beton. Length = 3.00 m, Width = 0.30 m, Height = 0.30 m',
  };
  const interp = await svc.interpretConstructionDocuments('FT-H06-LOW', [lowScale]);
  const aiEvs = interp.evidence.filter((e) => e.model === 'EZRAB_AI_INTERPRETATION_ENGINE');
  check('H-06c interpretasi skala-tak-terverifikasi menghasilkan evidence AI', aiEvs.length > 0);
  check(
    'H-06d evidence AI 0.40 TIDAK berlabel VERIFIED',
    aiEvs.length > 0 && aiEvs.every((e) => e.status !== 'VERIFIED'),
    aiEvs.map((e) => `${e.status}/${e.confidence}`).join(',')
  );
  check(
    'H-06e work item skala-tak-terverifikasi ber-confidence 0.40',
    interp.workItems.length > 0 && interp.workItems.every((w) => w.confidence === 0.4),
    interp.workItems.map((w) => String(w.confidence)).join(',')
  );

  // (c) Kontrol positif: skala terverifikasi + padanan EXACT (fc 20) → VERIFIED.
  const highScale: any = {
    ...lowScale,
    sourceId: 'ft-h06-src-003',
    fileHash: 'ft-h06-src-003',
    scale: '1:100',
    scaleVerified: true,
    rawText: 'Kolom K1 beton fc 20. Length = 3.00 m, Width = 0.30 m, Height = 0.30 m',
  };
  const interpHi = await svc.interpretConstructionDocuments('FT-H06-HI', [highScale]);
  const aiEvsHi = interpHi.evidence.filter((e) => e.model === 'EZRAB_AI_INTERPRETATION_ENGINE');
  check(
    'H-06f evidence AI 0.95 (skala terverifikasi + EXACT) tetap VERIFIED',
    aiEvsHi.length > 0 && aiEvsHi.some((e) => e.status === 'VERIFIED'),
    aiEvsHi.map((e) => `${e.status}/${e.confidence}`).join(',')
  );

  // (d) Auto-fill: kelengkapan tidak mempromosikan item LOW-confidence.
  const draftLow: any = {
    projectId: 'FT-H06-AF-LOW',
    detectedWorkItems: [
      {
        id: 'wi-ft-h06-low',
        projectId: 'FT-H06-AF-LOW',
        name: 'Plesteran dinding',
        category: 'Pekerjaan Dinding',
        quantity: 10,
        unit: 'm2',
        ahspCode: '3.7.4',
        ahspName: 'Plesteran',
        unitPrice: undefined,
        totalPrice: undefined,
        status: 'ESTIMATED',
        confidence: 'LOW',
        evidence: [],
        isCustomItem: false,
        ahspMatchStatus: 'SEMANTIC_MATCH',
      },
    ],
    rows: [],
    subtotal: 0,
    ppnEnabled: false,
    pphEnabled: false,
    verifiedCount: 0,
    needsReviewCount: 0,
    missingCount: 0,
  };
  (svc as any).projectDrafts.set('FT-H06-AF-LOW', draftLow);
  const afLow = svc.autoFillMissingWithValidSources('FT-H06-AF-LOW');
  const wiLow = afLow.updatedDraft.detectedWorkItems[0];
  check('H-06g auto-fill mengisi harga item LOW (cabang promosi tercapai)', afLow.filledCount > 0 && !!wiLow.unitPrice, `filled=${afLow.filledCount} price=${wiLow.unitPrice}`);
  check(
    'H-06h item LOW-confidence TIDAK dipromosikan ke VERIFIED/HIGH',
    wiLow.status !== 'VERIFIED' && wiLow.confidence !== 'HIGH',
    `${wiLow.status}/${wiLow.confidence}`
  );

  // (e) Kontrol positif: item HIGH-confidence tetap dipromosikan.
  const draftHi: any = {
    projectId: 'FT-H06-AF-HI',
    detectedWorkItems: [
      {
        id: 'wi-ft-h06-hi',
        projectId: 'FT-H06-AF-HI',
        name: 'Plesteran dinding',
        category: 'Pekerjaan Dinding',
        quantity: 10,
        unit: 'm2',
        ahspCode: '3.7.4',
        ahspName: 'Plesteran',
        unitPrice: undefined,
        totalPrice: undefined,
        status: 'NOT_FOUND',
        confidence: 'HIGH',
        evidence: [],
        isCustomItem: false,
        ahspMatchStatus: 'EXACT_MATCH',
      },
    ],
    rows: [],
    subtotal: 0,
    ppnEnabled: false,
    pphEnabled: false,
    verifiedCount: 0,
    needsReviewCount: 0,
    missingCount: 0,
  };
  (svc as any).projectDrafts.set('FT-H06-AF-HI', draftHi);
  const afHi = svc.autoFillMissingWithValidSources('FT-H06-AF-HI');
  const wiHi = afHi.updatedDraft.detectedWorkItems[0];
  check(
    'H-06i item HIGH-confidence + lengkap tetap dipromosikan ke VERIFIED',
    wiHi.status === 'VERIFIED' && !!wiHi.unitPrice,
    `${wiHi.status}/${wiHi.confidence} price=${wiHi.unitPrice}`
  );
  svc.resetProjectState('FT-H06-AF-LOW');
  svc.resetProjectState('FT-H06-AF-HI');
}

/* ================= Pagar kanonis (tidak bergerak) ================= */
{
  check(
    'GOLDEN registry count tetap 5.742',
    officialAhspRepository.size === 5742,
    `got ${officialAhspRepository.size}`
  );
  check(
    'GOLDEN active count tetap 5.725',
    officialAhspRepository.getActiveOfficialAhsp().length === 5725,
    `got ${officialAhspRepository.getActiveOfficialAhsp().length}`
  );

  // ── FTC-UNIT: unit-alignment dinormalisasi (WD-3.7-06 class) ──────────
  // Pipeline meneruskan satuan superskrip ('m³'/'m²') sementara katalog
  // memakai 'm3'/'m2' — perbandingan exact-string lama tidak pernah cocok,
  // bonus +15 hilang, dan item berskor 25–40 jatuh ke AI_CUSTOM
  // (realDed test 7: Beton Kolom K-250 42 dengan bonus, 27 tanpa).
  {
    const kM3 = svc.resolveLatestAHSP('Beton Kolom K-250', 'K-250', 'm3');
    const kSup = svc.resolveLatestAHSP('Beton Kolom K-250', 'K-250', 'm³');
    check(
      'FTC-U1 kolom: m3 vs m³ hasil pemetaan identik (bukan AI_CUSTOM)',
      kM3.ahspCode === kSup.ahspCode &&
        kM3.sourceType === 'OFFICIAL_AHSP' &&
        kSup.sourceType === 'OFFICIAL_AHSP' &&
        kM3.matchStatus === kSup.matchStatus,
      `m3=${kM3.ahspCode}/${kM3.sourceType}/${kM3.matchStatus} m³=${kSup.ahspCode}/${kSup.sourceType}/${kSup.matchStatus}`
    );
    const pM3 = svc.resolveLatestAHSP('Pondasi Batu Kali', 'K-250', 'm3');
    const pSup = svc.resolveLatestAHSP('Pondasi Batu Kali', 'K-250', 'm³');
    check(
      'FTC-U2 pondasi: m3 vs m³ hasil pemetaan identik (bukan AI_CUSTOM)',
      pM3.ahspCode === pSup.ahspCode &&
        pM3.sourceType === 'OFFICIAL_AHSP' &&
        pSup.sourceType === 'OFFICIAL_AHSP' &&
        pM3.matchStatus === pSup.matchStatus,
      `m3=${pM3.ahspCode}/${pM3.sourceType}/${pM3.matchStatus} m³=${pSup.ahspCode}/${pSup.sourceType}/${pSup.matchStatus}`
    );
  }

  // ── FTC-PROV: derivePriceProvenance — tanpa harga, tanpa provenance ───
  check(
    'FTC-P1 unitMismatch + ada harga → undefined',
    derivePriceProvenance({ reason: 'x' }, { unitPrice: 50000, valueSourceType: 'OFFICIAL_AHSP' }, false) === undefined
  );
  check(
    'FTC-P2 tanpa harga + non-custom + tanpa source → undefined (bukan OFFICIAL_AHSP)',
    derivePriceProvenance(undefined, { unitPrice: undefined, valueSourceType: undefined }, false) === undefined
  );
  check(
    'FTC-P3 harga null + custom → undefined',
    derivePriceProvenance(undefined, { unitPrice: null, valueSourceType: undefined }, true) === undefined
  );
  check(
    'FTC-P4 harga 0 (sentinel unresolved) → undefined',
    derivePriceProvenance(undefined, { unitPrice: 0, valueSourceType: undefined }, false) === undefined
  );
  check(
    'FTC-P5 ada harga + valueSourceType → valueSourceType dipakai',
    derivePriceProvenance(undefined, { unitPrice: 50000, valueSourceType: 'PROJECT_PRICE' }, false) === 'PROJECT_PRICE'
  );
  check(
    'FTC-P6 ada harga + tanpa source + custom → AI_ESTIMATE',
    derivePriceProvenance(undefined, { unitPrice: 50000, valueSourceType: undefined }, true) === 'AI_ESTIMATE'
  );
  check(
    'FTC-P7 ada harga + tanpa source + non-custom → OFFICIAL_AHSP',
    derivePriceProvenance(undefined, { unitPrice: 50000, valueSourceType: undefined }, false) === 'OFFICIAL_AHSP'
  );
}

runH06()
  .then(() => {
    console.log(`\n${pass} lulus, ${fail} gagal`);
    if (fail > 0) {
      console.log('Gagal:\n' + failures.map((f) => ` - ${f}`).join('\n'));
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error('ERROR suite:', e);
    process.exit(1);
  });
