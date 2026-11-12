/**
 * EZRAB — AI INTELLIGENCE OVERHAUL, FASE 7: RESPONSE QUALITY & SELF-VERIFICATION
 * — TEST SUITE F7 (gerbang kualitas deterministik untuk respons Chat AI).
 *
 * Membuktikan, di atas fondasi yang ADA (builder konteks kanonis Fase 1,
 * memori Fase 2, orkestrator Fase 3, registry tool Fase 5, runtime
 * persisten Fase 6, rantai spek + AHSP Gates 1–7):
 *
 *  (U) Parser deterministik: angka Indonesia, angka Rupiah (+ pengali
 *      juta/ribu/miliar), pembulatan, pemisah kalimat, atribusi item,
 *      klaim spek/total/tabel/konversi.
 *  (A–J) Satu tes LOLOS + satu tes GAGAL (minimal) per aturan, memakai
 *      fixture bukti yang sama dengan yang dirakit adapter dari state
 *      chat nyata — termasuk batas yang DIPUTUSKAN tidak ditegakkan
 *      (angka pengetahuan umum, subtotal, klaim AHSP di luar draft,
 *      spek ASSUMPTION, kontradiksi-diri).
 *  (N) Integrasi: adapter dari draft nyata (buildUniversalDraft),
 *      konflik end-to-end lewat adapter, format pesan penahanan,
 *      kejujuran verdict (checked/notApplicable), dedup, kemurnian
 *      modul (tanpa fetch/provider), dan wiring view (sumber).
 *
 * Kelas bukti: murni deterministik (tanpa provider — 0 panggilan;
 * UI browser dibuktikan E2E terpisah).
 * Jalankan: npx --yes tsx src/test/chatResponseQualityPhase7.test.ts
 */

import { strict as assert } from 'assert';
import { readFileSync } from 'node:fs';
import {
  checkResponseQuality,
  buildQualityGateEvidence,
  formatQualityGateNotice,
  emptyQualityGateEvidence,
  parseIdNumber,
  isRoundedForm,
  splitSentences,
  extractRupiahFigures,
  extractSpecClaims,
  extractTotalClaims,
  extractTableSumChecks,
  extractExplicitSums,
  extractConversionClaims,
  attributeItemToSentence,
  significantTokens,
  type QualityGateEvidence,
  type QualityGateItem,
  type QualityRuleId,
} from '../ai-tools/ezrab-ai/responseQualityGate';
import { buildUniversalDraft, type UniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import type { TechnicalConflict } from '../ai-tools/ezrab-ai/technicalConflicts';

/* ---------------- fixture bukti ---------------- */

const ITEM_GALIAN: QualityGateItem = {
  description: 'Pekerjaan Galian Tanah Biasa',
  volume: 10, unit: 'm³', unitPrice: 50000, amount: 500000,
  priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: '3.1.3.8',
};
const ITEM_BATA: QualityGateItem = {
  description: 'Pasangan Bata Merah 1:4',
  volume: 20, unit: 'm²', unitPrice: 135600, amount: 2712000,
  priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'B.38',
};
const ITEM_SEMEN: QualityGateItem = {
  description: 'Semen Portland',
  volume: 5, unit: 'sak', unitPrice: 72500, amount: 362500,
  priceStatus: 'PRICE_ESTIMATED', priceSourceKind: 'MARKET_REFERENCE', ahspCode: null,
};
const ITEM_BETON: QualityGateItem = {
  description: 'Beton K-225',
  volume: 3, unit: 'm³', unitPrice: null, amount: null,
  priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'UNRESOLVED', ahspCode: null,
};

/** Fixture kandang: 4 item (2 resmi, 1 estimasi pasar, 1 tanpa harga). */
function fixtureEvidence(): QualityGateEvidence {
  const ev = emptyQualityGateEvidence();
  ev.hasDraft = true;
  ev.draftTitle = 'RAB Kandang Sapi';
  ev.draftVersion = 1;
  ev.items = [ITEM_GALIAN, ITEM_BATA, ITEM_SEMEN, ITEM_BETON];
  ev.totals = {
    estimatedTotal: 3574500,
    verifiedTotal: 3212000,
    databaseTotal: 0,
    marketTotal: 362500,
    manualTotal: 0,
    unpricedCount: 1,
    needsSpecCount: 0,
    status: 'PARSIAL',
  };
  ev.specs = [
    { key: 'kandang-capacity', label: 'Kapasitas kandang', kind: 'count', value: 20, unit: 'ekor', status: 'CONFIRMED' },
    { key: 'kandang-roof-material', label: 'Material atap', kind: 'material', value: 'galvalum', status: 'CONFIRMED' },
    { key: 'building-bedrooms', label: 'Kamar tidur', kind: 'count', value: 3, unit: 'kamar tidur', status: 'ASSUMPTION' },
  ];
  ev.dimensions = {
    // Konvensi sisi rabNeeds untuk "17 x 9 m": angka pertama = lebar
    // (17), angka kedua = panjang (9) — sama seperti yang disimpan
    // draft.spec oleh buildUniversalDraft (lihat F7-N4).
    landAreaM2: 200, buildingAreaM2: 153, lengthM: 9, widthM: 17,
    depthM: null, heightM: null, spanM: null, volumeM3: null, floors: 1,
  };
  ev.budgetCap = 300000000;
  return ev;
}

/** Fixture draft LENGKAP + semua resmi (untuk C2/H2 sisi lolos). */
function completeOfficialEvidence(): QualityGateEvidence {
  const ev = fixtureEvidence();
  ev.items = [ITEM_GALIAN, ITEM_BATA];
  ev.totals = {
    estimatedTotal: 3212000,
    verifiedTotal: 3212000,
    databaseTotal: 0, marketTotal: 0, manualTotal: 0,
    unpricedCount: 0, needsSpecCount: 0, status: 'LENGKAP',
  };
  return ev;
}

function areaConflict(): TechnicalConflict {
  return {
    kind: 'area-exceeds-land',
    detail: 'Luas bangunan 200 m² melebihi luas tanah 150 m².',
    values: { buildingAreaM2: 200, landAreaM2: 150 },
    severity: 'high',
    resolution: 'needs-user-decision',
  };
}

function budgetConflict(): TechnicalConflict {
  return {
    kind: 'budget-vs-scope',
    detail: 'Total RAB Rp 350.000.000 melebihi budget Rp 300.000.000.',
    values: { totalPriced: 350000000, cap: 300000000 },
    severity: 'high',
    resolution: 'needs-user-decision',
  };
}

function duplicateRoofConflict(): TechnicalConflict {
  return {
    kind: 'duplicate-spec-value',
    detail: 'Spek "Material atap" punya dua nilai berbeda: genteng vs galvalum — pilih satu, jangan gabung diam-diam.',
    values: { key: 'kandang-roof-material', values: 'genteng | galvalum' },
    severity: 'medium',
    resolution: 'needs-user-decision',
  };
}

/* ---------------- runner (pola F6) ---------------- */

let passed = 0;
let failed = 0;
const failedNames: string[] = [];
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((e) => {
      failed += 1;
      failedNames.push(name);
      console.log(`  ✗ ${name} — ${(e as Error).message}`);
    });
}

const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');

function hasRule(v: ReturnType<typeof checkResponseQuality>, rule: QualityRuleId): boolean {
  return v.violations.some((x) => x.rule === rule);
}
function hasCheck(v: ReturnType<typeof checkResponseQuality>, check: string): boolean {
  return v.violations.some((x) => x.check === check);
}

async function main(): Promise<void> {
  /* ================= (U) Parser deterministik ================= */

  await test('F7-U1 parseIdNumber: ribuan/desimal/ambigu', () => {
    assert.equal(parseIdNumber('1.250.000'), 1250000);
    assert.equal(parseIdNumber('1,25'), 1.25);
    assert.equal(parseIdNumber('1.5'), 1.5);
    assert.equal(parseIdNumber('12.750'), 12750);
    assert.equal(parseIdNumber('300.000.000,00'), 300000000);
    assert.equal(parseIdNumber('17,5'), 17.5);
    assert.equal(parseIdNumber('1.250.5'), null, 'bentuk ambigu jangan ditebak');
    assert.equal(parseIdNumber(''), null);
    assert.equal(parseIdNumber('abc'), null);
  });

  await test('F7-U2 extractRupiahFigures: pengali + label per kalimat', () => {
    const figs = extractRupiahFigures('Total Rp 1.250.000. Semen Rp 1,25 juta. Harganya sekitar Rp 135 ribu.');
    assert.equal(figs.length, 3);
    assert.equal(figs[0].value, 1250000);
    assert.equal(figs[1].value, 1250000);
    assert.equal(figs[2].value, 135000);
    assert.equal(figs[0].labeled, false);
    assert.equal(figs[2].labeled, true, '"sekitar" melabeli angka dalam kalimatnya');
    const big = extractRupiahFigures('Biaya Rp 2,5 miliar.');
    assert.equal(big[0].value, 2500000000);
  });

  await test('F7-U3 isRoundedForm: batas 10% eksplisit', () => {
    assert.equal(isRoundedForm(135000, 135600), true, 'pembulatan ke bawah ribuan');
    assert.equal(isRoundedForm(136000, 135600), true, 'pembulatan ke atas ribuan');
    assert.equal(isRoundedForm(1250000000, 1253000000), true, '"Rp 1,25 miliar"');
    assert.equal(isRoundedForm(100000, 135600), false, 'selisih 26% bukan pembulatan jujur');
    assert.equal(isRoundedForm(135600, 135600), false, 'angka sama bukan pembulatan');
  });

  await test('F7-U4 splitSentences: titik dalam angka bukan batas', () => {
    const s = splitSentences('Harga Rp 1.250.000. Kode 3.1.3.8 berlaku.');
    assert.equal(s.length, 2, 'dua kalimat');
    assert.ok(s[0].text.includes('1.250.000'), 'angka ribuan utuh dalam kalimat 1');
    assert.ok(s[1].text.includes('3.1.3.8'), 'kode AHSP utuh dalam kalimat 2');
  });

  await test('F7-U5 attributeItemToSentence: cocok, seri = null', () => {
    const items = [ITEM_GALIAN, ITEM_BATA, ITEM_SEMEN, ITEM_BETON];
    assert.equal(attributeItemToSentence('Galian tanah Rp 50.000 per m³.', items), ITEM_GALIAN);
    assert.equal(attributeItemToSentence('Semen Portland Rp 72.500.', items), ITEM_SEMEN);
    assert.equal(attributeItemToSentence('Harga semen di pasaran naik.', items), null, 'satu token saja tidak cukup');
    // Seri: dua item berbagi token yang sama persis.
    const twins: QualityGateItem[] = [
      { ...ITEM_GALIAN, description: 'Pekerjaan Galian Tanah' },
      { ...ITEM_GALIAN, description: 'Galian Tanah Manual' },
    ];
    assert.equal(attributeItemToSentence('Galian tanah Rp 50.000.', twins), null, 'seri tidak ditebak');
    // Kode AHSP mengikat langsung.
    assert.equal(attributeItemToSentence('Item B.38 perlu ditinjau.', items), ITEM_BATA);
    assert.deepEqual(significantTokens('Pekerjaan Galian Tanah Biasa'), ['galian', 'tanah', 'biasa']);
  });

  await test('F7-U6 extractSpecClaims: field + satuan + pasangan berjangkar', () => {
    const claims = extractSpecClaims('Rumah 2 lantai, luas bangunan 150 m², panjang 17 m.');
    assert.equal(claims.find((c) => c.field === 'floors')?.value, 2);
    assert.equal(claims.find((c) => c.field === 'buildingArea')?.value, 150);
    assert.equal(claims.find((c) => c.field === 'buildingArea')?.unit, 'm2');
    assert.equal(claims.find((c) => c.field === 'length')?.value, 17);
    const pair = extractSpecClaims('Ukuran kandang 17 m x 9 m.');
    // Konvensi rabNeeds: angka pertama = lebar, angka kedua = panjang.
    assert.equal(pair.find((c) => c.field === 'width')?.value, 17);
    assert.equal(pair.find((c) => c.field === 'length')?.value, 9);
    const noAnchor = extractSpecClaims('Sloof 2 m x 3 m dipasang di sudut.');
    assert.equal(noAnchor.length, 0, 'pasangan tanpa jangkar dimensi bangunan diabaikan');
    const budget = extractSpecClaims('Budget Rp 300 juta.');
    assert.equal(budget.find((c) => c.field === 'budget')?.value, 300000000);
  });

  await test('F7-U7 extractTotalClaims: grand/subtotal/telanjang', () => {
    const t = extractTotalClaims('Grand Total: Rp 3.574.500. Subtotal Rp 1.000.000. Total 3574500.');
    assert.equal(t.find((x) => x.kind === 'grand')?.value, 3574500);
    assert.equal(t.find((x) => x.kind === 'subtotal')?.value, 1000000);
    assert.equal(t.find((x) => x.kind === 'bare')?.value, 3574500);
    const notTotal = extractTotalClaims('Total 2 item sudah dicek.');
    assert.equal(notTotal.length, 0, '"total 2 item" bukan klaim total rupiah');
  });

  await test('F7-U8 extractTableSumChecks + extractExplicitSums', () => {
    const ok = extractTableSumChecks('- Galian: Rp 500.000\n- Bata: Rp 2.712.000\nTotal: Rp 3.212.000');
    assert.equal(ok.length, 1);
    assert.equal(ok[0].itemSum, 3212000);
    assert.equal(ok[0].total, 3212000);
    const bad = extractTableSumChecks('- Galian: Rp 500.000\n- Bata: Rp 2.712.000\nTotal: Rp 3.500.000');
    assert.equal(bad[0].itemSum, 3212000);
    assert.equal(bad[0].total, 3500000);
    // Angka terakhir tiap baris = jumlah baris ("10 m³ × Rp 72.500 = Rp 725.000").
    const calc = extractTableSumChecks('- Semen: 10 sak × Rp 72.500 = Rp 725.000\n- Pasir: Rp 275.000\nTotal: Rp 1.000.000');
    assert.equal(calc[0].itemSum, 1000000);
    const sums = extractExplicitSums('Rp 500.000 + Rp 2.712.000 = Rp 3.212.000');
    assert.equal(sums.length, 1);
    assert.equal(sums[0].sum, 3212000);
    assert.equal(sums[0].result, 3212000);
    const noRp = extractExplicitSums('2 + 3 = 5');
    assert.equal(noRp.length, 0, 'jumlah tanpa Rp bukan urusan gerbang');
  });

  await test('F7-U9 extractConversionClaims: perkalian dilewati', () => {
    const c = extractConversionClaims('1 m = 100 cm.');
    assert.equal(c.length, 1);
    assert.equal(c[0].leftValue, 1);
    assert.equal(c[0].rightValue, 100);
    assert.equal(extractConversionClaims('25 m × 12 m = 300 m².').length, 0, 'operan perkalian bukan konversi');
    assert.equal(extractConversionClaims('1 m² = 1 m × 1 m.').length, 0, 'kanan dilanjutkan perkalian bukan konversi');
  });

  /* ================= (A) Angka yang diklaim ada di data ================= */

  await test('F7-A1 harga item cocok dengan draft → lolos', () => {
    const v = checkResponseQuality('Galian tanah Rp 50.000 per m³.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-A2 harga item tidak cocok → A1', () => {
    const v = checkResponseQuality('Pasangan bata merah Rp 100.000 per m².', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'A1'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'B'), 'bukan pembulatan — ini angka yang salah');
  });

  await test('F7-A3 jumlah baris (volume × harga) dikutip → lolos', () => {
    const v = checkResponseQuality('Pasangan bata merah: Rp 2.712.000.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-A4 angka dikaitkan ke proyek tanpa dasar → A2', () => {
    const v = checkResponseQuality('Biaya overhead proyek ini Rp 5.000.000.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'A2'), JSON.stringify(v.violations));
  });

  await test('F7-A5 angka pengetahuan umum TIDAK diperiksa (batas jujur)', () => {
    const v = checkResponseQuality('Harga semen di pasaran umumnya Rp 60.000 sampai Rp 80.000 per sak.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-A6 tanpa bukti → A/B tidak berlaku (bukan lolos diam-diam)', () => {
    const v = checkResponseQuality('Semen Rp 65.000 per sak.', emptyQualityGateEvidence());
    assert.equal(v.passed, true);
    assert.ok(v.notApplicable.includes('A'), 'A dicatat tidak berlaku');
    assert.ok(v.notApplicable.includes('B'), 'B dicatat tidak berlaku');
  });

  await test('F7-A7 jumlah baris pecahan dikutip sebagai bilangan bulat → lolos (< Rp 1)', () => {
    const ev = fixtureEvidence();
    ev.items = [{ ...ITEM_BATA, amount: 2712000.8 }];
    const v = checkResponseQuality('Pasangan bata merah: Rp 2.712.001.', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  /* ================= (B) Harga tidak dibulatkan diam-diam ================= */

  await test('F7-B1 pembulatan diam-diam → B1', () => {
    const v = checkResponseQuality('Pasangan bata merah Rp 135 ribu per m².', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'B1'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'A'), 'pembulatan dilaporkan di B, bukan A');
  });

  await test('F7-B2 pembulatan berlabel → lolos', () => {
    const v = checkResponseQuality('Pasangan bata merah sekitar Rp 135 ribu per m².', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-B3 angka persis → tidak ada pelanggaran B', () => {
    const v = checkResponseQuality('Pasangan bata merah Rp 135.600 per m².', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  /* ================= (C) Status harga jujur ================= */

  await test('F7-C1 harga untuk item tanpa harga → C1 (bukan Rp0, bukan karangan)', () => {
    const v = checkResponseQuality('Beton K-225 Rp 1.100.000 per m³.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'C1'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'A'), 'item tanpa harga adalah wilayah C, bukan A');
  });

  await test('F7-C2 klaim "semua harga lengkap" pada draft PARSIAL → C2', () => {
    const v = checkResponseQuality('Semua item sudah ada harganya.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'C2'), JSON.stringify(v.violations));
  });

  await test('F7-C3 klaim kelengkapan pada draft LENGKAP → lolos', () => {
    const v = checkResponseQuality('Semua item sudah ada harganya.', completeOfficialEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-C4 harga estimasi/pasar tanpa label → C3', () => {
    const v = checkResponseQuality('Semen Portland Rp 72.500 per sak.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'C3'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'A'), 'angkanya benar — yang salah penyajiannya');
  });

  await test('F7-C5 harga estimasi berlabel → lolos', () => {
    const v = checkResponseQuality('Semen Portland sekitar Rp 72.500 per sak (harga pasar).', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-C6 total Rp0 padahal item ada → C4', () => {
    const v = checkResponseQuality('Total RAB Rp 0.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'C4'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'G'), 'total Rp0 adalah wilayah C, bukan G');
  });

  /* ================= (D) Spek tidak diubah diam-diam ================= */

  await test('F7-D1 jumlah lantai bertentangan → D1', () => {
    const v = checkResponseQuality('Rumah 2 lantai ini membutuhkan sloof yang kuat.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'D1'), JSON.stringify(v.violations));
  });

  await test('F7-D2 luas bangunan bertentangan → D1', () => {
    const v = checkResponseQuality('Luas bangunan 120 m².', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'D1'), JSON.stringify(v.violations));
  });

  await test('F7-D3 spek cocok (termasuk pasangan dimensi) → lolos', () => {
    const v = checkResponseQuality('Kandang 17 m x 9 m dengan luas bangunan 153 m².', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-D4 budget bertentangan → D1', () => {
    const v = checkResponseQuality('Budget Rp 250 juta.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'D1'), JSON.stringify(v.violations));
  });

  await test('F7-D5 spek ASSUMPTION bukan kebenaran user: D tidak berlaku, I yang bekerja', () => {
    // Kamar tidur di fixture berstatus ASSUMPTION (nilai sistem, bukan
    // pernyataan user) — D tidak boleh menghukumnya; penegasan tanpa
    // label atas field yang tidak diketahui user adalah wilayah I.
    const v = checkResponseQuality('Rumah ini punya 4 kamar tidur.', fixtureEvidence());
    assert.ok(!hasRule(v, 'D'), `D tidak boleh menembak spek ASSUMPTION: ${JSON.stringify(v.violations)}`);
    assert.ok(hasRule(v, 'I'), `I harus menembak penegasan tanpa label: ${JSON.stringify(v.violations)}`);
  });

  await test('F7-D6 material atap bertentangan dengan spek CONFIRMED → D2', () => {
    const v = checkResponseQuality('Atap genteng untuk kandang ini.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'D2'), JSON.stringify(v.violations));
  });

  await test('F7-D7 material atap cocok → lolos', () => {
    const v = checkResponseQuality('Atap galvalum untuk kandang ini.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-D8 rekomendasi mengubah material BUKAN perubahan diam-diam → lolos', () => {
    const v = checkResponseQuality('Sebaiknya atap genteng dipakai untuk kandang ini.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  /* ================= (E) Konflik spek ================= */

  await test('F7-E1 konflik luas ditegaskan diam-diam → E1', () => {
    const ev = fixtureEvidence();
    ev.dimensions = { ...ev.dimensions, landAreaM2: 150, buildingAreaM2: 200 };
    ev.conflicts = [areaConflict()];
    const v = checkResponseQuality('Luas bangunan 200 m².', ev);
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'E1'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'D'), 'nilainya benar — yang salah: konfliknya dibungkam');
  });

  await test('F7-E2 konflik disebut + ditanyakan → lolos', () => {
    const ev = fixtureEvidence();
    ev.dimensions = { ...ev.dimensions, landAreaM2: 150, buildingAreaM2: 200 };
    ev.conflicts = [areaConflict()];
    const v = checkResponseQuality('Ada konflik: luas bangunan 200 m² melebihi luas tanah 150 m². Mana yang benar?', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-E3 konflik budget + klaim "masih dalam budget" → E1', () => {
    const ev = fixtureEvidence();
    ev.conflicts = [budgetConflict()];
    const v = checkResponseQuality('Total masih dalam budget.', ev);
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'E1'), JSON.stringify(v.violations));
  });

  await test('F7-E4 tanpa konflik → E tidak berlaku', () => {
    const v = checkResponseQuality('Luas bangunan 153 m².', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
    assert.ok(v.notApplicable.includes('E'), 'E dicatat tidak berlaku');
  });

  await test('F7-E5 nilai ganda ditegaskan salah satunya → E1', () => {
    const ev = fixtureEvidence();
    ev.conflicts = [duplicateRoofConflict()];
    const v = checkResponseQuality('Atap genteng untuk kandang ini.', ev);
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'E1'), JSON.stringify(v.violations));
  });

  /* ================= (F) Satuan ================= */

  await test('F7-F1 luas dalam "m" → F1', () => {
    const v = checkResponseQuality('Luas bangunan 153 m.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'F1'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'D'), 'angkanya benar — satuannya yang salah');
  });

  await test('F7-F2 panjang dalam "m²" → F1', () => {
    const v = checkResponseQuality('Panjang 9 m².', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'F1'), JSON.stringify(v.violations));
    assert.ok(!hasRule(v, 'D'), 'angkanya benar — satuannya yang salah');
  });

  await test('F7-F3 satuan benar → lolos', () => {
    const v = checkResponseQuality('Luas bangunan 153 m², panjang 9 m.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-F4 konversi salah faktor → F2', () => {
    const v = checkResponseQuality('1 m = 10 cm.', emptyQualityGateEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'F2'), JSON.stringify(v.violations));
  });

  await test('F7-F5 konversi lintas dimensi → F2', () => {
    const v = checkResponseQuality('120 m² = 1.200 m.', emptyQualityGateEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'F2'), JSON.stringify(v.violations));
  });

  await test('F7-F6 konversi benar → lolos', () => {
    const v = checkResponseQuality('1 m = 100 cm.', emptyQualityGateEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-F7 hitungan luas "25 m × 12 m = 300 m²" bukan konversi → lolos', () => {
    const v = checkResponseQuality('25 m × 12 m = 300 m².', emptyQualityGateEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  /* ================= (G) Total konsisten ================= */

  await test('F7-G1 tabel konsisten + total cocok → lolos', () => {
    const reply = '- Galian tanah: Rp 500.000\n- Pasangan bata merah: Rp 2.712.000\nTotal: Rp 3.212.000';
    const v = checkResponseQuality(reply, fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-G2 total tabel tidak sama dengan jumlah baris → G1', () => {
    // Total 3.574.500 adalah total estimasi draft yang sah (G2 lolos) —
    // tetapi TIDAK sama dengan jumlah baris tabel 3.212.000 (G1 menembak).
    const reply = '- Galian tanah: Rp 500.000\n- Pasangan bata merah: Rp 2.712.000\nTotal: Rp 3.574.500';
    const v = checkResponseQuality(reply, fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'G1'), JSON.stringify(v.violations));
    assert.ok(!hasCheck(v, 'G2'), 'totalnya sendiri adalah angka draft yang sah');
  });

  await test('F7-G3 total tidak ada di data → G2', () => {
    const v = checkResponseQuality('Total RAB Rp 9.999.999.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'G2'), JSON.stringify(v.violations));
  });

  await test('F7-G4 total cocok dengan salah satu ember total → lolos', () => {
    const v = checkResponseQuality('Total RAB Rp 3.212.000 (total terverifikasi).', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-G5 total pembulatan berlabel → lolos', () => {
    const v = checkResponseQuality('Total RAB sekitar Rp 3,6 juta.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-G6 jumlah eksplisit salah hitung → G1', () => {
    const v = checkResponseQuality('Rp 500.000 + Rp 2.712.000 = Rp 3.500.000', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'G1'), JSON.stringify(v.violations));
  });

  await test('F7-G7 subtotal TIDAK diperiksa (batas jujur: tanpa pemetaan seksi)', () => {
    const v = checkResponseQuality('Subtotal struktur Rp 9.999.999.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-G8 total pecahan dikutip sebagai bilangan bulat → lolos (< Rp 1)', () => {
    const ev = fixtureEvidence();
    ev.totals = { ...ev.totals!, estimatedTotal: 3574500.8 };
    const v = checkResponseQuality('Total RAB Rp 3.574.501.', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-G9 kata di antara "Total RAB" dan Rp tetap tertangkap G2 (bukan A2)', () => {
    const v = checkResponseQuality('Total RAB proyek ini adalah Rp 999.999.999.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'G2'), `G2 tidak menembak: ${JSON.stringify(v.violations)}`);
    assert.ok(!hasCheck(v, 'A2'), 'A2 tidak boleh menembak kalimat klaim total');
  });

  await test('F7-G10 total benar dengan kata perantara → lolos', () => {
    const v = checkResponseQuality('Grand Total untuk proyek ini adalah Rp 3.574.500.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  /* ================= (H) Klaim AHSP resmi ================= */

  await test('F7-H1 klaim resmi untuk item pasar → H1', () => {
    const v = checkResponseQuality('Harga Semen Portland Rp 72.500 adalah harga AHSP resmi.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'H1'), JSON.stringify(v.violations));
  });

  await test('F7-H2 klaim resmi untuk item resmi → lolos', () => {
    const v = checkResponseQuality('Harga Galian Tanah Rp 50.000 sesuai AHSP resmi.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-H3 klaim menyeluruh "semua harga AHSP" pada draft campuran → H2', () => {
    const v = checkResponseQuality('Semua harga sudah sesuai AHSP resmi.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'H2'), JSON.stringify(v.violations));
  });

  await test('F7-H4 klaim menyeluruh pada draft semua-resmi → lolos', () => {
    const v = checkResponseQuality('Semua harga sudah sesuai AHSP resmi.', completeOfficialEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-H5 kode AHSP salah → H3', () => {
    const v = checkResponseQuality('Galian Tanah Biasa (AHSP 3.1.3.9) Rp 50.000.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'H3'), JSON.stringify(v.violations));
  });

  await test('F7-H6 kode AHSP benar → lolos', () => {
    const v = checkResponseQuality('Galian Tanah Biasa (AHSP 3.1.3.8) Rp 50.000.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-H7 klaim AHSP untuk item DI LUAR draft TIDAK ditegakkan (batas jujur)', () => {
    const v = checkResponseQuality('Harga Baja Ringan Rp 85.000 sesuai AHSP resmi.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  /* ================= (I) Asumsi berlabel ================= */

  await test('F7-I1 penambahan spek diam-diam → I1', () => {
    const ev = fixtureEvidence();
    ev.dimensions = { ...ev.dimensions, floors: null };
    const v = checkResponseQuality('Rumah ini 2 lantai.', ev);
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'I1'), JSON.stringify(v.violations));
  });

  await test('F7-I2 penambahan berlabel asumsi → lolos', () => {
    const ev = fixtureEvidence();
    ev.dimensions = { ...ev.dimensions, floors: null };
    const v = checkResponseQuality('Asumsi: rumah ini 2 lantai.', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-I3 rekomendasi bukan penegasan → lolos', () => {
    const ev = fixtureEvidence();
    ev.dimensions = { ...ev.dimensions, floors: null };
    const v = checkResponseQuality('Sebaiknya rumah ini 2 lantai.', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-I4 pertanyaan bukan penegasan → lolos', () => {
    const ev = fixtureEvidence();
    ev.dimensions = { ...ev.dimensions, floors: null };
    const v = checkResponseQuality('Apakah rumah ini 2 lantai?', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-I5 label TIDAK memaafkan angka yang bertentangan (D tetap menembak)', () => {
    const v = checkResponseQuality('Luas bangunan sekitar 120 m².', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'D1'), JSON.stringify(v.violations));
  });

  await test('F7-I6 penambahan material diam-diam → I1', () => {
    const ev = fixtureEvidence();
    ev.specs = ev.specs.filter((s) => s.key !== 'kandang-roof-material');
    const v = checkResponseQuality('Atapnya genteng.', ev);
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'I1'), JSON.stringify(v.violations));
  });

  /* ================= (J) Klaim tindakan ================= */

  await test('F7-J1 klaim draft tersusun padahal tidak ada draft → J1', () => {
    const v = checkResponseQuality('Draft RAB sudah saya susun untuk Anda.', emptyQualityGateEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'J1'), JSON.stringify(v.violations));
  });

  await test('F7-J2 klaim draft tersusun + draft memang ada → lolos', () => {
    const v = checkResponseQuality('Draft RAB sudah tersusun.', fixtureEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-J3 klaim transfer padahal tidak ada transfer → J2', () => {
    const v = checkResponseQuality('Draft sudah saya kirim ke Spreadsheet.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'J2'), JSON.stringify(v.violations));
  });

  await test('F7-J4 klaim transfer + receipt cocok → lolos', () => {
    const ev = fixtureEvidence();
    ev.hasTransferReceipt = true;
    const v = checkResponseQuality('Draft sudah saya kirim ke Spreadsheet.', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-J5 klaim perubahan item sudah terjadi → J3 (propose_* hanya pratinjau)', () => {
    const v = checkResponseQuality('Saya sudah mengubah harga semen menjadi Rp 70.000.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'J3'), JSON.stringify(v.violations));
  });

  await test('F7-J6 klaim sudah mengecek data padahal tidak ada tool → J4', () => {
    const v = checkResponseQuality('Saya sudah mengecek harga di database AHSP.', fixtureEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'J4'), JSON.stringify(v.violations));
  });

  await test('F7-J7 klaim pengecekan + tool baca sukses → lolos', () => {
    const ev = fixtureEvidence();
    ev.toolResults = [{ toolName: 'cari_ahsp', ok: true }];
    const v = checkResponseQuality('Saya sudah mengecek harga di database AHSP.', ev);
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-J8 tool GAGAL tidak memenuhi klaim pengecekan → J4', () => {
    const ev = fixtureEvidence();
    ev.toolResults = [{ toolName: 'cari_ahsp', ok: false }];
    const v = checkResponseQuality('Saya sudah mengecek harga di database AHSP.', ev);
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'J4'), JSON.stringify(v.violations));
  });

  await test('F7-J9 kalimat masa depan bukan klaim tindakan → lolos', () => {
    const v = checkResponseQuality('Saya akan menyusun draft RAB untuk Anda.', emptyQualityGateEvidence());
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-J10 klaim proyek sudah dibuat AI → J5', () => {
    const v = checkResponseQuality('Proyek sudah saya buat.', emptyQualityGateEvidence());
    assert.equal(v.passed, false);
    assert.ok(hasCheck(v, 'J5'), JSON.stringify(v.violations));
  });

  /* ================= (N) Integrasi / adapter / pesan / wiring ================= */

  await test('F7-N1 penjelasan umum tanpa klaim proyek → lolos (jangkar proyek bekerja)', () => {
    const v = checkResponseQuality(
      'Pondasi foot plat menyebarkan beban lewat pelat beton bertulang, sedangkan tiang pancang menyalurkan beban ke lapisan tanah keras.',
      fixtureEvidence(),
    );
    assert.equal(v.passed, true, JSON.stringify(v.violations));
  });

  await test('F7-N2 formatQualityGateNotice: jujur, beraturan, tanpa isi jawaban asli', () => {
    const v = checkResponseQuality('Total RAB Rp 9.999.999.', fixtureEvidence());
    assert.equal(v.passed, false);
    const notice = formatQualityGateNotice(v);
    assert.ok(notice.includes('ditahan'), 'menyebut penahanan');
    assert.ok(notice.includes('[G]'), 'menyebut aturan G');
    assert.ok(notice.includes('Total tidak konsisten'), 'menyebut judul aturan');
    assert.ok(notice.includes('9.999.999'), 'detail menyebut angka yang ditolak');
    assert.ok(notice.includes('tidak ditampilkan'), 'menyatakan jawaban asli tidak tampil');
    assert.ok(notice.includes('kirim ulang'), 'mengajak kirim ulang');
    assert.ok(!notice.includes('Total RAB Rp 9.999.999.'), 'tidak memuat kalimat jawaban asli');
  });

  await test('F7-N3 verdict jujur: checked vs notApplicable pada bukti kosong', () => {
    const v = checkResponseQuality('Pondasi foot plat menyebarkan beban lewat pelat.', emptyQualityGateEvidence());
    assert.equal(v.passed, true);
    assert.deepEqual([...v.checked].sort(), ['F', 'G', 'J'], 'hanya cek mandiri (F/G/J) yang dievaluasi');
    assert.ok(v.notApplicable.includes('A') && v.notApplicable.includes('C') && v.notApplicable.includes('D'));
    assert.ok(v.notApplicable.includes('E') && v.notApplicable.includes('H') && v.notApplicable.includes('I'));
  });

  await test('F7-N4 adapter dari draft nyata (buildUniversalDraft kandang)', () => {
    const built = buildUniversalDraft(
      'Buatkan RAB kandang sapi 20 ekor ukuran 17 x 9 m atap Galvalum budget 300 juta',
      undefined,
      { projectId: 'proj-f7' },
    );
    assert.equal(built.kind, 'draft', 'fixture kandang harus menghasilkan draft');
    const draft = (built as { draft: UniversalDraft }).draft;
    const ev = buildQualityGateEvidence({ draft, intake: null, snapshot: null, toolResults: [] });
    assert.equal(ev.hasDraft, true);
    assert.ok(ev.items.length > 0, 'adapter memuat item draft');
    assert.ok(ev.totals != null, 'adapter menghitung total');
    assert.equal(ev.dimensions.lengthM, 9, 'dimensi panjang dari draft.spec (angka kedua "17 x 9")');
    assert.equal(ev.dimensions.widthM, 17, 'dimensi lebar dari draft.spec (angka pertama "17 x 9")');
    assert.equal(ev.budgetCap, 300000000, 'budget dari draft.spec');
    assert.equal(ev.hasTransferReceipt, false, 'draft baru belum pernah ditransfer');
  });

  await test('F7-N5 konflik end-to-end lewat adapter → E1 pada jawaban', () => {
    const built = buildUniversalDraft(
      'Buatkan RAB kandang sapi 20 ekor ukuran 17 x 9 m atap Galvalum budget 300 juta',
      undefined,
      { projectId: 'proj-f7' },
    );
    const draft = (built as { draft: UniversalDraft }).draft;
    draft.spec.landAreaM2 = 150;
    draft.spec.areaM2 = 200;
    const ev = buildQualityGateEvidence({ draft, intake: null, snapshot: null, toolResults: [] });
    assert.ok(
      ev.conflicts.some((c) => c.kind === 'area-exceeds-land'),
      `adapter mendeteksi konflik luas: ${JSON.stringify(ev.conflicts.map((c) => c.kind))}`,
    );
    const v = checkResponseQuality('Luas bangunan 200 m².', ev);
    assert.ok(hasCheck(v, 'E1'), JSON.stringify(v.violations));
  });

  await test('F7-N6 dedup: pelanggaran yang sama disebut dua kali = satu', () => {
    const v = checkResponseQuality('Total RAB Rp 9.999.999. Total RAB Rp 9.999.999.', fixtureEvidence());
    assert.equal(v.violations.filter((x) => x.check === 'G2').length, 1);
  });

  await test('F7-N7 gerbang murni: tanpa fetch/provider/storage (sumber)', () => {
    const src = read('src/ai-tools/ezrab-ai/responseQualityGate.ts');
    for (const banned of ['fetch(', 'providerClient', 'localStorage', 'axios', 'XMLHttpRequest', 'api/ai']) {
      assert.ok(!src.includes(banned), `modul gate tidak boleh memuat ${banned}`);
    }
    for (const fn of ['checkResponseQuality', 'buildQualityGateEvidence', 'formatQualityGateNotice', 'emptyQualityGateEvidence']) {
      assert.ok(src.includes(`export function ${fn}`), `ekspor ${fn} ada`);
    }
  });

  await test('F7-N8 wiring view: gate di jalur LLM, lewati output tool, tahan + fail-open (sumber)', () => {
    const viewSrc = read('src/ai-tools/ezrab-ai/view.tsx');
    assert.ok(viewSrc.includes('checkResponseQuality'), 'view mengimpor/memanggil checkResponseQuality');
    assert.ok(viewSrc.includes('buildQualityGateEvidence'), 'view merakit bukti gate');
    assert.ok(viewSrc.includes('formatQualityGateNotice'), 'view memakai pesan penahanan');
    // Gate hanya untuk prosa LLM murni (bukan output tool deterministik).
    assert.ok(
      viewSrc.includes('FASE 7') && viewSrc.includes('toolCalls'),
      'wiring gate ditandai FASE 7 dan mempertimbangkan toolCalls',
    );
    // Fail-open: pengecualian gate tidak boleh memblokir tampil.
    assert.ok(viewSrc.includes('[response-quality-gate] fail-open'), 'fail-open gate tercatat di view');
    assert.ok(viewSrc.includes('heldReplyNotice'), 'jawaban yang ditahan diganti pesan penahanan');
  });

  console.log(`\nRESPONSE QUALITY (FASE 7): ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log(`Gagal: ${failedNames.join(' | ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('F7 fatal:', e);
  process.exit(1);
});
