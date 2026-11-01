/**
 * SPRINT 3 — Workstream A: B1 (anggaran pass + kegagalan jujur),
 * B2 (evidensial provenance kuantitas), G3 (dedup sadar dimensi).
 *
 * Menguji modul ASLI:
 * - ded-ai-estimate/service: planDedPasses, summarizePassOutcomes,
 *   mergeRawItemsAcrossPasses, dimensionSignatureOf,
 *   verifyItemQuantityEvidence, isProjectTypeSupported.
 * - ded-ai-estimate/quantity: attemptQuantityFromDimensionString
 *   (diameter-only), formatQuantityDisplay.
 * - ded-ai-estimate/calculator: coverage.itemsWithAssumption (G2 Opsi A).
 * - Pembangun prompt ASLI (fast) dipakai sebagai fungsi ukur pass —
 *   persis seperti service memakainya.
 *
 * Catatan cakupan jujur: service.run penuh membutuhkan parser PDF +
 * provider gateway; kontrak B1 yang diuji di sini adalah perencana pass
 * murni + ringkasan status (fungsi yang dipakai run), bukan panggilan
 * jaringan. SKIPPED_BUDGET diuji lewat fungsi ukur sintetis karena
 * pembangun prompt asli memotong teks per halaman ke 4.000 karakter
 * sehingga satu halaman riil tidak dapat menembus anggaran sendirian;
 * kontrak perencana (halaman raksasa → dilewati tercatat, bukan dikirim
 * untuk gagal) adalah perilaku yang dijamin kode.
 *
 * Run: esbuild bundle lalu node, seperti suite .src.ts lain.
 */
import {
  planDedPasses,
  summarizePassOutcomes,
  mergeRawItemsAcrossPasses,
  dimensionSignatureOf,
  verifyItemQuantityEvidence,
  isProjectTypeSupported,
  DED_PASS_REQUEST_BUDGET_CHARS,
} from '../ai-tools/ded-ai-estimate/service';
import { buildFastPrompt } from '../ai-tools/ded-ai-estimate/prompts/fast';
import {
  attemptQuantityFromDimensionString,
  formatQuantityDisplay,
} from '../ai-tools/ded-ai-estimate/quantity';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import type { DedAiItem, DedPassTraceEntry } from '../ai-tools/ded-ai-estimate/types';
import type { SelectedPage } from '../ai-tools/ded-ai-estimate/analysisTrace';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const page = (n: number, text: string): SelectedPage => ({ page: n, title: `Halaman ${n}`, text, pageType: 'HALAMAN' });
const realMeasure = (pages: SelectedPage[]) => {
  const b = buildFastPrompt({ projectType: 'BANGUNAN', buildingType: 'BANGUNAN', pageSummaries: pages, pricingPolicy: 'FULL_AI' });
  return b.system.length + b.prompt.length;
};

console.log('=== B1: anggaran pass dengan pembangun prompt asli ===');
{
  const dense = Array.from({ length: 8 }, (_, i) => page(i + 1, 'a'.repeat(3900)));
  const plan = planDedPasses([{ label: 'Semua Halaman', pages: dense }], realMeasure);
  const sends = plan.filter((p) => p.kind === 'SEND');
  const sentPages = sends.flatMap((p) => p.pages.map((x) => x.page)).sort((a, b) => a - b);
  check('B1.1 klaster padat dipecah menjadi >1 pass SEND', sends.length > 1, `sends=${sends.length}`);
  check('B1.2 setiap request terukur ≤ anggaran 19.500', sends.every((p) => p.kind === 'SEND' && p.requestChars <= DED_PASS_REQUEST_BUDGET_CHARS),
    sends.map((p) => (p.kind === 'SEND' ? p.requestChars : -1)).join(','));
  check('B1.3 tidak ada halaman hilang/duplikat', JSON.stringify(sentPages) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), sentPages.join(','));
  check('B1.4 tidak ada SKIPPED untuk halaman normal', plan.every((p) => p.kind === 'SEND'));
}
{
  // Regresi irigasi Sprint 2: 8 halaman jurnal padat (±4.068 kar/hal.)
  // dulu satu pass 60rb → prompt > 20rb → PAYLOAD_TOO_LARGE total.
  const journal = Array.from({ length: 8 }, (_, i) => page(i + 1, 'b'.repeat(4068)));
  const plan = planDedPasses([{ label: 'Semua Halaman', pages: journal }], realMeasure);
  const sends = plan.filter((p) => p.kind === 'SEND');
  check('B1.5 regresi irigasi: semua halaman terkirim dalam pass-pass sah',
    sends.flatMap((p) => p.pages).length === 8 && sends.every((p) => p.kind === 'SEND' && p.requestChars <= DED_PASS_REQUEST_BUDGET_CHARS),
    `entries=${plan.length}`);
}

console.log('=== B1: SKIPPED_BUDGET + ringkasan parsial ===');
{
  const overhead = 9000;
  const synthMeasure = (pages: SelectedPage[]) => overhead + pages.reduce((a, p) => a + p.text.length, 0);
  const pages = [page(1, 'x'.repeat(2000)), page(2, 'y'.repeat(12000)), page(3, 'z'.repeat(2000))];
  const plan = planDedPasses([{ label: 'G', pages }], synthMeasure);
  const skipped = plan.filter((p) => p.kind === 'SKIPPED_BUDGET');
  const sends = plan.filter((p) => p.kind === 'SEND');
  check('B1.6 halaman raksasa tunggal → tepat 1 SKIPPED_BUDGET', skipped.length === 1 && skipped[0].pages[0].page === 2);
  check('B1.7 SKIPPED membawa alasan eksplisit', skipped.length === 1 && skipped[0].kind === 'SKIPPED_BUDGET' && /anggaran/.test(skipped[0].reason));
  check('B1.8 halaman normal tetap terkirim', sends.flatMap((p) => p.pages.map((x) => x.page)).sort().join(',') === '1,3');
}
{
  const t = (status: DedPassTraceEntry['status'], passStatus?: DedPassTraceEntry['passStatus']): DedPassTraceEntry => ({
    passIndex: 0, clusterLabel: 'G', pageTypes: [], pages: [], productId: 'DED_AI_FAST', mode: 'FAST', maxTokens: 16000, status, passStatus, itemCount: 0,
  });
  const mixed = summarizePassOutcomes([t('OK', 'SUCCESS'), t('FAILED', 'FAILED'), t('SKIPPED_BUDGET', 'SKIPPED_BUDGET')]);
  check('B1.9 campuran sukses/gagal/skip → partial=true', mixed.partial === true);
  check('B1.10 hitungan ringkasan benar', mixed.succeededPasses === 1 && mixed.failedPasses === 1 && mixed.skippedPasses === 1 && mixed.totalPasses === 3);
  const allOk = summarizePassOutcomes([t('OK', 'SUCCESS'), t('EMPTY_RESPONSE', 'SUCCESS')]);
  check('B1.11 semua pass sukses → partial=false', allOk.partial === false);
  const malformed = summarizePassOutcomes([t('MALFORMED_RESPONSE')]);
  check('B1.12 MALFORMED (status lama) dihitung gagal → partial', malformed.failedPasses === 1 && malformed.partial === true);
  check('B1.13 gerbang JEMBATAN kini didukung service', isProjectTypeSupported('JEMBATAN') === true);
  check('B1.14 tipe tak dikenal tetap ditolak', isProjectTypeSupported('HELIPAD') === false);
}

function makeItem(partial: Partial<DedAiItem>): DedAiItem {
  return {
    id: 't', name: 'Item', category: 'C', units: 'm3', quantity: null,
    quantitySource: 'UNRESOLVED', subtotal: null, sourcePages: [],
    provenance: [], stage: 'PARSE', unitPrice: null, priceSource: 'UNRESOLVED',
    ...partial,
  } as DedAiItem;
}

console.log('=== B2: verifikasi evidensial provenance kuantitas ===');
{
  const srcPages = [{ page: 1, text: 'Dimensi pondasi 4000 x 150 x 200 mm sesuai gambar struktur.' }];
  const kept = makeItem({ quantity: 0.12, quantitySource: 'DED_GEOMETRIC', rawDimensions: '4000 x 150 x 200 mm', sourcePages: [1] });
  verifyItemQuantityEvidence(kept, srcPages);
  check('B2.1 angka dimensi ada di sumber → label DED_GEOMETRIC dipertahankan', kept.quantitySource === 'DED_GEOMETRIC');

  const fabricated = makeItem({ quantity: 0.12, quantitySource: 'DED_GEOMETRIC', rawDimensions: '4000 x 150 x 200 mm', sourcePages: [1] });
  verifyItemQuantityEvidence(fabricated, [{ page: 1, text: 'Catatan umum tanpa dimensi apa pun di halaman ini.' }]);
  check('B2.2 angka dimensi TIDAK ada → turun ke AI_INFERENCE', fabricated.quantitySource === 'AI_INFERENCE');
  check('B2.3 nilai kuantitas dipertahankan sebagai estimasi', fabricated.quantity === 0.12);
  check('B2.4 penurunan tercatat di note + provenance',
    /diturunkan/.test(fabricated.quantityNote || '') && fabricated.provenance.some((p) => p.includes('evidence-unverified')));

  // Kasus jalan Sprint 2: "3753 m x 7 m" — 7 memang ada di teks, 3753 tidak.
  const road = makeItem({ quantity: 26271, quantitySource: 'DED_GEOMETRIC', rawDimensions: '3753 m x 7 m', sourcePages: [] });
  verifyItemQuantityEvidence(road, [{ page: 9, text: 'Lebar perkerasan 7 m; legenda material borrow pit; STA 0+000 s.d. akhir ruas.' }]);
  check('B2.5 kasus jalan: satu angka karangan cukup untuk menurunkan label', road.quantitySource === 'AI_INFERENCE');

  const citedWrong = makeItem({ quantity: 0.12, quantitySource: 'DED_GEOMETRIC', rawDimensions: '4000 x 150 x 200 mm', sourcePages: [2] });
  verifyItemQuantityEvidence(citedWrong, [
    { page: 1, text: 'Dimensi 4000 x 150 x 200 mm.' },
    { page: 2, text: 'Halaman lain tanpa dimensi.' },
  ]);
  check('B2.6 sitiran halaman meleset tetapi angka ada di dokumen → label dipertahankan + catatan',
    citedWrong.quantitySource === 'DED_GEOMETRIC' && citedWrong.provenance.some((p) => p.includes('di luar halaman sitiran')));

  const explicitQty = makeItem({ quantity: 1250, quantitySource: 'DED_EXPLICIT', sourcePages: [] });
  verifyItemQuantityEvidence(explicitQty, [{ page: 1, text: 'Volume galian tercantum 1.250 m3 pada tabel.' }]);
  check('B2.7 DED_EXPLICIT tanpa dimensi: nilai kuantitas ditemukan di sumber (format id) → dipertahankan', explicitQty.quantitySource === 'DED_EXPLICIT');

  const untouched = makeItem({ quantity: 5, quantitySource: 'AI_INFERENCE', rawDimensions: '9999 x 8888 mm' });
  verifyItemQuantityEvidence(untouched, [{ page: 1, text: 'kosong' }]);
  check('B2.8 item AI_INFERENCE tidak disentuh verifikasi', untouched.quantitySource === 'AI_INFERENCE');
}

console.log('=== B2: diameter-only + format tampilan mikro ===');
{
  const dia = attemptQuantityFromDimensionString("m'", 'ø800 mm');
  check('B2.9 ø800 mm untuk satuan linear → kuantitas null + diameterOnly', dia.quantity === null && dia.diameterOnly === true);
  const diaD = attemptQuantityFromDimensionString('m', 'D16');
  check('B2.10 "D16" tunggal → diameterOnly', diaD.quantity === null && diaD.diameterOnly === true);
  const plain = attemptQuantityFromDimensionString("m'", '12000 mm');
  check('B2.11 panjang polos 12000 mm tetap sah (= 12)', plain.quantity === 12 && !plain.diameterOnly);
  const vol = attemptQuantityFromDimensionString('m3', '4000 x 150 x 200 mm');
  check('B2.12 volume 4000x150x200 mm tetap 0,12 m³', vol.quantity !== null && Math.abs(vol.quantity - 0.12) < 1e-9);
  check('B2.13 formatQuantityDisplay(0.000002) tidak merender "0"', formatQuantityDisplay(0.000002) === '0,000002', formatQuantityDisplay(0.000002));
  check('B2.14 formatQuantityDisplay(2e-6) konsisten', formatQuantityDisplay(2e-6) === '0,000002');
  check('B2.15 formatQuantityDisplay(0) = "0", null = "—"', formatQuantityDisplay(0) === '0' && formatQuantityDisplay(null) === '—');
  check('B2.16 formatQuantityDisplay(0.315) presisi penuh', formatQuantityDisplay(0.315) === '0,315', formatQuantityDisplay(0.315));
  check('B2.17 formatQuantityDisplay(1234.5) grup ribuan id', formatQuantityDisplay(1234.5) === '1.234,5', formatQuantityDisplay(1234.5));
  check('B2.18 nilai sub-mikro memakai notasi eksponensial, bukan "0"', formatQuantityDisplay(2.5e-7) !== '0' && formatQuantityDisplay(2.5e-7).includes('e-7'), formatQuantityDisplay(2.5e-7));
}

console.log('=== G2: penghitung ASSUMPTION pada coverage ===');
{
  const out = DedAiCalculator.buildOutput({
    jobId: 'j', projectType: 'BANGUNAN', mode: 'FAST', projectName: 'P', pageCount: 1,
    items: [
      makeItem({ name: 'A', quantity: 10, quantitySource: 'ASSUMPTION', unitPrice: 1000, priceSource: 'AI_ESTIMATE' }),
      makeItem({ name: 'B', quantity: 5, quantitySource: 'AI_INFERENCE', unitPrice: 1000, priceSource: 'AI_ESTIMATE' }),
      makeItem({ name: 'C', quantity: null, quantitySource: 'ASSUMPTION', unitPrice: 1000, priceSource: 'AI_ESTIMATE' }),
    ],
  });
  check('G2.1 itemsWithAssumption menghitung hanya ASSUMPTION berkuantitas', out.coverage.itemsWithAssumption === 1, String(out.coverage.itemsWithAssumption));
}

console.log('=== G3: dedup sadar dimensi ===');
{
  const a = { name: 'Pondasi batu kali', units: 'm3', dimensions: '4000 x 150 x 200 mm', quantity: 0.12 };
  const b = { name: 'Pondasi batu kali', units: 'm3', dimensions: '6000 x 150 x 200 mm', quantity: 0.36 };
  const both = mergeRawItemsAcrossPasses([a, b]);
  check('G3.1 nama+satuan sama, dimensi beda → keduanya bertahan', both.length === 2, `len=${both.length}`);
  check('G3.2 item kedua ditandai konflik dimensi', (both[1] as any).__dedupDimensionConflict === true && !(both[0] as any).__dedupDimensionConflict);

  const c1 = { name: 'Pondasi batu kali', units: 'm3', dimensions: '4000 x 150 x 200 mm', quantity: null };
  const c2 = { name: 'Pondasi batu kali', units: 'm3', dimensions: '200 x 4000 x 150 mm', quantity: 0.12 };
  const merged = mergeRawItemsAcrossPasses([c1, c2]);
  check('G3.3 dimensi ekuivalen (urutan beda) antar-pass → digabung, utamakan berkuantitas',
    merged.length === 1 && merged[0].quantity === 0.12, `len=${merged.length}`);

  const d1 = { name: 'Mobilisasi', units: 'ls', quantity: null };
  const d2 = { name: 'Mobilisasi', units: 'ls', quantity: 1 };
  check('G3.4 tanpa dimensi di kedua sisi → perilaku lama (digabung)', mergeRawItemsAcrossPasses([d1, d2]).length === 1);
  check('G3.5 sidik dimensi tidak peka urutan', dimensionSignatureOf(a) === dimensionSignatureOf(c2));
  check('G3.6 sidik dimensi membedakan ukuran', dimensionSignatureOf(a) !== dimensionSignatureOf(b));
}

console.log(`\n=== HASIL SPRINT 3 DED INTEGRITY: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exitCode = 1;
