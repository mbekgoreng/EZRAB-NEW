/**
 * D5-lanjutan — Proposal draf DALAM BUDGET (perintah owner 2026-11-28
 * 00:18): saat total draf jauh MELEBIHI budget maksimum, chat harus
 * menyajikan draf yang DIBATASI sebesar budget — tahap yang benar-benar
 * muat — plus pernyataan polos bahwa budget tidak cukup menyelesaikan
 * proyek. BUKAN tanya-balik (itu D5/`overBudgetAskBack`) dan BUKAN
 * penurunan kualitas (`qualityDowngradedFrom` — mekanisme lain).
 *
 * Yang dipin di sini (kontrak untuk W2/actionRegistry):
 *  - `selectWithinBudgetScope(draft)` → WithinBudgetProposal | null.
 *  - `formatWithinBudgetProposal(proposal, decision)` → blok pesan.
 *
 * Aturan pemilihan (deterministik): paket struktural (persiapan,
 * galian, pondasi, struktur) didahulukan sesuai urutan paket draft,
 * lalu item diambil berurutan selama total berharga tetap ≤ cap —
 * item tidak pernah dipotong sebagian, harga tidak pernah diturunkan.
 * Item belum berharga TIDAK PERNAH masuk total; ia hanya ikut bila
 * paketnya sudah termasuk. Begitu satu item berharga akan melampaui
 * cap, pemilihan BERHENTI (tanpa skip-and-continue).
 *
 * Kasus villa owner DIREPRODUKSI PERSIS dari mesin template
 * (bukan sintetis): "Budget saya Rp50jt, buatkan RAB villa 2 lantai
 * 500 m² full finishing mewah" → total Rp1.319.572.020 (26,39×
 * budget, PARSIAL — 3 item belum berharga). Kasus tepi memakai draf
 * sintetis minimal (helper `synDraft` — hanya field yang dibaca
 * `effectiveItems`/`computeTotals`/`overBudgetDecision`).
 *
 * Jalankan: npx --yes tsx src/test/withinBudgetProposal.test.ts
 * (skrip asersi tsx polos — BUKAN vitest; tanpa live AI.)
 */
import {
  buildUniversalDraft,
  computeTotals,
  effectiveItems,
  overBudgetDecision,
  selectWithinBudgetScope,
  formatWithinBudgetProposal,
  type UniversalDraft,
  type OverBudgetDecision,
  type WithinBudgetProposal,
} from '../ai-tools/ezrab-ai/universalRab';

// Mock localStorage untuk lingkungan Node (pola universalRab.test.ts).
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};
(global as any).localStorage = (global as any).window.localStorage;

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

/* ------------------------------------------------------------------ */
/* Helper draf sintetis minimal (hanya field yang dibaca mesin total)  */
/* ------------------------------------------------------------------ */
function synItem(
  description: string, volume: number, unit: string,
  unitPrice: number | null, priceStatus = 'PRICE_RESOLVED',
): any {
  return {
    id: description, no: 1, code: '', category: 'Struktur',
    description, volume, unit, unitPrice,
    amount: unitPrice == null ? null : volume * unitPrice,
    priceStatus,
  };
}
function synPart(scopeLabel: string, templateName: string, items: any[]): any {
  return {
    scope: { id: scopeLabel, label: scopeLabel, categories: [], keywords: [], primaryMeasure: 'area', primaryLabel: 'luas' },
    template: { id: `tpl-${scopeLabel}`, name: templateName },
    evaluatedParams: {},
    generation: { items },
    removedKeys: [],
    manualPrices: {},
  };
}
function synDraft(cap: number | null, parts: any[]): UniversalDraft {
  return {
    id: 'syn-1', title: 'Sintetis',
    spec: { budgetCap: cap },
    parts, assumptions: [], warnings: [], changes: [],
    versions: [], version: 1, createdAt: '',
  } as unknown as UniversalDraft;
}
function decisionOf(draft: UniversalDraft): OverBudgetDecision {
  const dec = overBudgetDecision(draft);
  if (!dec) throw new Error('diharapkan OverBudgetDecision non-null');
  return dec;
}

/* ------------------------------------------------------------------ */
/* 1 — Kasus villa owner (angka PERSIS dari mesin template)            */
/* ------------------------------------------------------------------ */
console.log('== 1 — Villa owner: Rp50jt vs total Rp1.319.572.020 ==');
{
  const res = buildUniversalDraft(
    'Budget saya Rp50jt, buatkan RAB villa 2 lantai 500 m² full finishing mewah',
    undefined, { projectId: null },
  );
  check('1.1 draft terbentuk', res.kind === 'draft', res.kind);
  if (res.kind !== 'draft') throw new Error('draft villa tidak terbentuk');
  const d = res.draft;
  const dec = decisionOf(d);
  check('1.2 total Rp1.319.572.020', close(dec.total, 1319572020), String(dec.total));
  check('1.3 cap Rp50.000.000', dec.cap === 50000000, String(dec.cap));
  check('1.4 kelipatan 26,39×', Math.abs(dec.multiple - 26.3914) < 0.01, dec.multiple.toFixed(4));
  check('1.5 provisional (3 item belum berharga)', dec.provisional === true);
  const totalsBefore = computeTotals(d).estimatedTotal;
  const itemsBefore = effectiveItems(d).length;
  const p: WithinBudgetProposal | null = selectWithinBudgetScope(d);
  check('1.6 proposal non-null', p !== null);
  if (p) {
    check('1.7 includedTotal Rp5.525.000 ≤ cap', p.includedTotal === 5525000 && p.includedTotal <= p.cap, String(p.includedTotal));
    check('1.8 included = [Pembersihan Lapangan & Bowplank Presisi] saja',
      p.included.length === 1 && p.included[0].description === 'Pembersihan Lapangan & Bowplank Presisi',
      JSON.stringify(p.included.map((i) => i.description)));
    check('1.9 struktur raksasa TIDAK ikut (630,5jt > cap)',
      !p.included.some((i) => i.description.includes('Struktur Beton Bertulang')));
    check('1.10 excluded 15 item', p.excluded.length === 15, String(p.excluded.length));
    check('1.11 excludedPricedTotal Rp1.314.047.020', close(p.excludedPricedTotal, 1314047020), String(p.excludedPricedTotal));
    check('1.12 invarian: included + excluded = full', close(p.includedTotal + p.excludedPricedTotal, p.fullTotal),
      `${p.includedTotal} + ${p.excludedPricedTotal} ≠ ${p.fullTotal}`);
    check('1.13 fullTotal Rp1.319.572.020', close(p.fullTotal, 1319572020), String(p.fullTotal));
    check('1.14 cap Rp50.000.000', p.cap === 50000000, String(p.cap));
    check('1.15 remaining = full − included', close(p.remaining, p.fullTotal - p.includedTotal), String(p.remaining));
    check('1.16 coverage ≈ 0,42%', Math.abs(p.coveragePct - 0.4187) < 0.01, p.coveragePct.toFixed(4));
    check('1.17 unpriced: 0 ikut / 3 tidak ikut (paket Finishing tak termasuk)',
      p.unpricedIncludedCount === 0 && p.unpricedExcludedCount === 3,
      `${p.unpricedIncludedCount}/${p.unpricedExcludedCount}`);
    check('1.18 semua item included berharga (unitPrice non-null)',
      p.included.every((i) => i.unitPrice != null));
    check('1.19 semua item unpriced tetap null (tak ada harga karangan)',
      [...p.included, ...p.excluded].filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').every((i) => i.unitPrice == null));
    check('1.20 draf tidak diubah (total + jumlah item sama)',
      computeTotals(d).estimatedTotal === totalsBefore && effectiveItems(d).length === itemsBefore);

    const msg = formatWithinBudgetProposal(p, dec);
    check('1.21 header Tahap 1 — sesuai budget 50.000.000',
      msg.includes('Tahap 1 — sesuai budget') && msg.includes('50.000.000'), msg.split('\n')[0]);
    check('1.22 aturan satu kalimat: tak dipotong / tak diturunkan',
      msg.includes('tidak pernah dipotong sebagian') && msg.includes('harga tidak pernah diturunkan'));
    check('1.23 subtotal Tahap 1 Rp5.525.000', msg.includes('Subtotal Tahap 1') && msg.includes('5.525.000'));
    check('1.24 seksi Belum teranggarkan hadir', msg.includes('Belum teranggarkan'));
    check('1.25 SEMUA item excluded disebut namanya',
      p.excluded.every((i) => msg.includes(i.description)),
      p.excluded.filter((i) => !msg.includes(i.description)).map((i) => i.description).join('; '));
    check('1.26 pernyataan tidak cukup + total penuh + sisa',
      msg.includes('tidak cukup untuk menyelesaikan proyek ini') &&
      msg.includes('1.319.572.020') && msg.includes('1.314.047.020'));
    check('1.27 coverage 0,4% + kelipatan 26,39×',
      msg.includes('0,4%') && msg.includes('26,39×'), msg.split('\n').slice(-3).join(' | '));
    check('1.28 unpriced tampil "Harga belum tersedia"',
      msg.includes('Harga belum tersedia'));
    check('1.29 TANPA harga Rp0 karangan', !msg.includes('Rp 0'));
    check('1.30 catatan SEMENTARA (total PARSIAL)', msg.includes('SEMENTARA'));
  }
}

/* ------------------------------------------------------------------ */
/* 2 — Tepi (a): item struktural pertama saja sudah melebihi cap       */
/* ------------------------------------------------------------------ */
console.log('== 2 — Tepi (a): item pertama > cap → included kosong ==');
{
  const d = synDraft(50000000, [
    synPart('Struktur', 'Struktur Beton Bertulang', [
      synItem('Struktur Beton Bertulang K-250 Kolom, Balok & Plat', 130, 'm3', 4850000),
      synItem('Pembersihan Lapangan & Bowplank Presisi', 650, 'm2', 8500),
      synItem('Pengukuran Topografi', 1, 'ls', null, 'PRICE_UNRESOLVED'),
    ]),
  ]);
  const dec = decisionOf(d);
  const p = selectWithinBudgetScope(d);
  check('2.1 proposal non-null (OVER)', p !== null);
  if (p) {
    check('2.2 included kosong, includedTotal 0', p.included.length === 0 && p.includedTotal === 0,
      JSON.stringify(p.included.map((i) => i.description)));
    check('2.3 item murah sesudahnya TIDAK dilompati (stop, bukan skip)',
      p.excluded.some((i) => i.description.includes('Pembersihan Lapangan')));
    check('2.4 excluded 3 item', p.excluded.length === 3, String(p.excluded.length));
    check('2.5 unpriced: 0 ikut / 1 tidak ikut (tak ada paket termasuk)',
      p.unpricedIncludedCount === 0 && p.unpricedExcludedCount === 1);
    check('2.6 remaining = full total', close(p.remaining, p.fullTotal), String(p.remaining));
    check('2.7 coverage 0%', p.coveragePct === 0, String(p.coveragePct));
    const msg = formatWithinBudgetProposal(p, dec);
    check('2.8 pesan: tidak ada satu tahap lengkap pun yang muat',
      msg.includes('Tidak ada satu tahap lengkap pun yang muat dalam budget'));
    check('2.9 pesan: menyebut pemblokir (Struktur Beton, 630.500.000)',
      msg.includes('Struktur Beton Bertulang K-250') && msg.includes('630.500.000'));
    check('2.10 pesan: tidak ada item yang bisa dikerjakan sebagian',
      msg.includes('tidak ada item yang bisa dikerjakan sebagian'));
    check('2.11 pesan: Belum teranggarkan menyebut Pembersihan + Pengukuran',
      msg.includes('Pembersihan Lapangan') && msg.includes('Pengukuran Topografi'));
  }
}

/* ------------------------------------------------------------------ */
/* 3 — Tepi (b): unpriced ikut hanya bila paketnya sudah termasuk      */
/* ------------------------------------------------------------------ */
console.log('== 3 — Tepi (b): unpriced dalam paket termasuk vs tidak ==');
{
  const d = synDraft(50000000, [
    synPart('Persiapan', 'Pekerjaan Persiapan', [
      // Unpriced SEBELUM item berharga pertama paketnya — tetap ikut
      // (pass 2: paket sudah termasuk), bukan hilang karena urutan.
      synItem('Pengukuran & Pematokan', 1, 'ls', null, 'PRICE_UNRESOLVED'),
      synItem('Pembersihan Lapangan & Bowplank Presisi', 650, 'm2', 8500),
      synItem('Galian Tanah Pondasi', 10, 'm3', 300000),
    ]),
    synPart('Finishing & Interior', 'Finishing Interior', [
      synItem('Cat Dinding Interior Premium', 100, 'm2', 1000000),
      synItem('Plafon Akustik Tile', 475, 'm2', null, 'PRICE_UNRESOLVED'),
    ]),
  ]);
  const dec = decisionOf(d);
  const p = selectWithinBudgetScope(d);
  check('3.1 proposal non-null', p !== null);
  if (p) {
    check('3.2 includedTotal Rp8.525.000', p.includedTotal === 8525000, String(p.includedTotal));
    check('3.3 included urutan draf asli: [Pengukuran, Pembersihan, Galian]',
      JSON.stringify(p.included.map((i) => i.description)) ===
      JSON.stringify(['Pengukuran & Pematokan', 'Pembersihan Lapangan & Bowplank Presisi', 'Galian Tanah Pondasi']),
      JSON.stringify(p.included.map((i) => i.description)));
    check('3.4 unpriced paket termasuk ikut (Pengukuran, harga tetap null)',
      p.included.some((i) => i.description === 'Pengukuran & Pematokan' && i.unitPrice == null));
    check('3.5 unpriced: 1 ikut / 1 tidak ikut',
      p.unpricedIncludedCount === 1 && p.unpricedExcludedCount === 1,
      `${p.unpricedIncludedCount}/${p.unpricedExcludedCount}`);
    check('3.6 unpriced paket tak termasuk TIDAK ikut (Plafon)',
      p.excluded.some((i) => i.description === 'Plafon Akustik Tile'));
    check('3.7 invarian total', close(p.includedTotal + p.excludedPricedTotal, p.fullTotal));
    const msg = formatWithinBudgetProposal(p, dec);
    check('3.8 tabel termasuk: Pengukuran tampil "Harga belum tersedia"',
      msg.includes('Pengukuran & Pematokan') && msg.includes('Harga belum tersedia'));
    check('3.9 Belum teranggarkan: Plafon tampil "Harga belum tersedia"',
      msg.includes('Plafon Akustik Tile') && msg.includes('Harga belum tersedia'));
    check('3.10 subtotal menyebut parsial (1 item belum berharga)',
      msg.includes('parsial — 1 item belum berharga'));
    check('3.11 coverage ≈ 7,9%', msg.includes('7,9%'), msg.split('\n').slice(-3).join(' | '));
  }
}

/* ------------------------------------------------------------------ */
/* 4 — Berhenti, bukan lompat: item murah sesudah pemblokir tetap      */
/*     excluded walau muat                                            */
/* ------------------------------------------------------------------ */
console.log('== 4 — Stop-not-skip ==');
{
  const d = synDraft(50000000, [
    synPart('Struktur', 'Struktur', [
      synItem('Item A — Struktur Utama', 1, 'ls', 40000000),
      synItem('Item B — Struktur Sekunder', 1, 'ls', 30000000),
      synItem('Item C — Kecil Sekali', 1, 'ls', 5000000),
    ]),
  ]);
  const p = selectWithinBudgetScope(d);
  check('4.1 proposal non-null', p !== null);
  if (p) {
    check('4.2 included = [A] saja (40jt)', p.included.length === 1 && p.included[0].description.includes('Item A'),
      JSON.stringify(p.included.map((i) => i.description)));
    check('4.3 C excluded walau 40jt + 5jt ≤ 50jt (tahap utuh, bukan comotan)',
      p.excluded.some((i) => i.description.includes('Item C')));
    check('4.4 includedTotal 40jt', p.includedTotal === 40000000, String(p.includedTotal));
  }
}

/* ------------------------------------------------------------------ */
/* 5 — Tepi (c) + (d): null saat cap ≤ 0 / tanpa cap / bukan OVER     */
/* ------------------------------------------------------------------ */
console.log('== 5 — Null: cap ≤ 0, tanpa cap, UNDER, total == cap ==');
{
  const over = () => synDraft(50000000, [
    synPart('Struktur', 'Struktur', [synItem('Struktur Beton', 1, 'ls', 100000000)]),
  ]);
  const under = () => synDraft(400000000, [
    synPart('Struktur', 'Struktur', [synItem('Struktur Beton', 1, 'ls', 100000000)]),
  ]);
  const exact = () => synDraft(100000000, [
    synPart('Struktur', 'Struktur', [synItem('Struktur Beton', 1, 'ls', 100000000)]),
  ]);
  const noCap = () => synDraft(null, [
    synPart('Struktur', 'Struktur', [synItem('Struktur Beton', 1, 'ls', 100000000)]),
  ]);
  const zeroCap = () => synDraft(0, [
    synPart('Struktur', 'Struktur', [synItem('Struktur Beton', 1, 'ls', 100000000)]),
  ]);
  const negCap = () => synDraft(-5000000, [
    synPart('Struktur', 'Struktur', [synItem('Struktur Beton', 1, 'ls', 100000000)]),
  ]);
  check('5.1 OVER → non-null (kontrol)', selectWithinBudgetScope(over()) !== null);
  check('5.2 UNDER (100jt < 400jt) → null', selectWithinBudgetScope(under()) === null);
  check('5.3 total == cap (ketat `>`) → null', selectWithinBudgetScope(exact()) === null);
  check('5.4 tanpa cap → null', selectWithinBudgetScope(noCap()) === null);
  check('5.5 cap 0 → null', selectWithinBudgetScope(zeroCap()) === null);
  check('5.6 cap negatif → null', selectWithinBudgetScope(negCap()) === null);
  // (d) semuanya muat = UNDER → null (bukan proposal kosong).
  const allFit = synDraft(500000000, [
    synPart('Persiapan', 'Persiapan', [synItem('Pembersihan Lapangan', 650, 'm2', 8500)]),
    synPart('Finishing & Interior', 'Finishing', [synItem('Cat Dinding', 100, 'm2', 100000)]),
  ]);
  check('5.7 semuanya muat → null (bukan OVER)', selectWithinBudgetScope(allFit) === null);
}

console.log(`\nD5-lanjutan withinBudgetProposal: ${passed} lulus / ${failed} gagal${failed ? ` — GAGAL: ${failures.join(', ')}` : ''}`);
if (failed > 0) process.exit(1);
