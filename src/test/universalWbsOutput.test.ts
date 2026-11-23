/**
 * EZRAB — UNIVERSAL CONSTRUCTION INTELLIGENCE, W3/W9 (2026-11-22):
 * WBS fondasi + output lengkap (§3 + §9).
 *
 * Cakupan:
 *  A. Render WBS di pesan draft (G2) — seksi "Struktur paket (WBS)"
 *     tetap sebelum tabel item (node artefak + laporan kelengkapan).
 *  B. Seksi brief di kepala pesan (G14) — 3–5 baris.
 *  C. Subtotal per scope untuk draft multi-scope single-building (G14).
 *  D. Satu baris tangga keuangan (G15) + label keuangan selaras
 *     parametrik vs universal (G16, label saja — tanpa ubah angka).
 *  E. WBS konseptual 6 → 18 scope (G3).
 *  F. Tabel pemetaan 5 skema kelompok kerja (G4) + pemetaan 12 kelompok
 *     DesignSpreadsheet ke skema G (G17-kecil).
 *  G. Transfer trace QTO + volumeBasis (S3-15/16): payload → factory →
 *     clone; volumeSource dibedakan dari basis; `qtoTrace` +
 *     `sourceComponentId` W7 diteruskan di ketiga tempat yang sama
 *     (catatan koordinator 2026-11-22 21:35).
 *
 * Harness: tsx polos (pola universalRabHardening). Tanpa panggilan
 * provider, tanpa network. Jalankan:
 *   npx --yes tsx src/test/universalWbsOutput.test.ts
 */

import { strict as assert } from 'assert';
import {
  buildUniversalDraft,
  extractUniversalSpec,
  formatUniversalDraftMessage,
  buildPushPayload,
  computeTotals,
  computeScopeTotals,
  effectiveItems,
  wbsStructureLines,
  SCOPE_GROUPS,
  officialTemplates,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  conceptualWbsFor,
  conceptualWbsLines,
  CONCEPTUAL_WBS_LABEL,
} from '../ai-tools/ezrab-ai/conceptualWbs';
import {
  WBS_GROUP_MAP,
  rowForGroup,
  groupForCategoryLabel,
  groupsForCategoryLabel,
  groupForLegacyLabel,
  groupForRegistryCategory,
  groupForSpreadsheetGroup,
  gLabelForSpreadsheetGroup,
  scopesForGroup,
  groupsForScope,
  legacyGroupLabels,
  registryCategories,
  spreadsheetGroups,
  type WbsGroupId,
} from '../ai-tools/ezrab-ai/wbsGroupMapping';
import { G } from '../data/templateCatalog180/builders';
import { createRabItemRecord, cloneProvenance } from '../engine/rab/rabItemFactory';
import { buildDirectRab, formatDirectRabMessage, type DirectRabResult } from '../ai-tools/ezrab-ai/directRab';

// Mock localStorage untuk Node (pola universalRabHardening.test.ts).
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
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

/** Baris-baris seksi di antara header seksi dan baris kosong berikutnya. */
function sectionLines(msg: string, header: string): string[] {
  const lines = msg.split('\n');
  const i = lines.findIndex((l) => l.includes(header));
  assert.ok(i >= 0, `seksi "${header}" tidak ditemukan di pesan`);
  const out: string[] = [];
  for (let j = i; j < lines.length; j++) {
    if (j > i && lines[j] === '') break;
    out.push(lines[j]);
  }
  return out;
}

/* ================= A. Render WBS di pesan (G2) ================= */
console.log('== A. Render WBS di pesan (G2) ==');

test('A1: seksi "Struktur paket (WBS)" tampil di pesan single-scope (node + kelengkapan)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('**Struktur paket (WBS):**'));
  assert.ok(msg.includes('Jembatan & Struktur Khusus: LENGKAP — 11 item'), 'baris node scope + status + jumlah item');
  assert.ok(msg.includes('"Jembatan Gelagar Beton Pratekan Bentang 20 m"'), 'nama template di baris node');
  assert.ok(msg.includes('**Kelengkapan WBS:** LENGKAP'), 'laporan kelengkapan ikut tampil');
});

test('A2: seksi WBS terletak SEBELUM tabel item dan SESUDAH ringkasan alasan', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUniversalDraftMessage(d);
  const wbs = msg.indexOf('**Struktur paket (WBS):**');
  const table = msg.indexOf('| No |');
  const reasons = msg.indexOf('**Alasan komponen:**');
  assert.ok(wbs >= 0 && table > wbs, 'WBS sebelum tabel item');
  assert.ok(reasons >= 0 && reasons < wbs, 'ringkasan alasan (GATE 5) tetap mendahului WBS');
});

test('A3: draft multi-scope — WBS mencantumkan kedua scope', () => {
  const d = draftOf('Buat RAB pekerjaan drainase dan sanitasi sepanjang 500 meter');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('Drainase & Saluran: LENGKAP — 4 item'));
  assert.ok(msg.includes('Sanitasi & Air Limbah: LENGKAP — 7 item'));
  assert.ok(msg.includes('**Kelengkapan WBS:** LENGKAP — 2 paket pekerjaan'));
});

test('A4: wbsStructureLines langsung — header + node + kelengkapan', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const lines = wbsStructureLines(d);
  assert.equal(lines[0], '**Struktur paket (WBS):**');
  assert.ok(lines.some((l) => l.includes('Jembatan & Struktur Khusus: LENGKAP')));
  assert.ok(lines.some((l) => l.startsWith('**Kelengkapan WBS:**')));
});

/* ================= B. Seksi brief (G14) ================= */
console.log('== B. Seksi brief di kepala pesan (G14) ==');

test('B1: brief jembatan — 4 baris benar (fungsi, ukuran, material, cakupan)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUniversalDraftMessage(d);
  const brief = sectionLines(msg, '**Brief proyek:**');
  assert.equal(brief.length, 5, `brief = header + 4 baris, dapat ${brief.length}: ${brief.join(' | ')}`);
  assert.ok(brief[1].includes('Fungsi: Jembatan'), `fungsi: ${brief[1]}`);
  assert.ok(brief[1].includes('disiplin: Jembatan & Struktur Khusus'));
  assert.ok(brief[2].includes('Ukuran terkonfirmasi:') && brief[2].includes('bentang 12 m'), `ukuran: ${brief[2]}`);
  assert.ok(brief[3].includes('Spek material: beton'), `material: ${brief[3]}`);
  assert.ok(brief[4].includes('Cakupan: 11 item dalam 1 paket'), `cakupan: ${brief[4]}`);
});

test('B2: brief tampil di kepala — sebelum baris Jenis proyek', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.indexOf('**Brief proyek:**') < msg.indexOf('• Jenis proyek:'));
});

test('B3: brief tanpa material/ukuran — fallback jujur, tanpa karangan', () => {
  const d = draftOf('Buat RAB saluran drainase sepanjang 500 meter');
  const msg = formatUniversalDraftMessage(d);
  const brief = sectionLines(msg, '**Brief proyek:**');
  assert.ok(brief[3].includes('— (tidak disebut; memakai default template)'), `material fallback: ${brief[3]}`);
  const r = draftOf('Buat RAB renovasi rumah dengan anggaran Rp150 juta');
  const briefR = sectionLines(formatUniversalDraftMessage(r), '**Brief proyek:**');
  assert.ok(briefR[2].includes('— (memakai default template, lihat asumsi)'), `ukuran fallback: ${briefR[2]}`);
  assert.ok(briefR[1].includes('Fungsi: Rumah Tinggal'));
});

test('B4: brief multi-scope — disiplin + jumlah paket benar', () => {
  const d = draftOf('Buat RAB pekerjaan drainase dan sanitasi sepanjang 500 meter');
  const msg = formatUniversalDraftMessage(d);
  const brief = sectionLines(msg, '**Brief proyek:**');
  assert.ok(brief[1].includes('Drainase & Saluran, Sanitasi & Air Limbah'));
  assert.ok(brief[4].includes('11 item dalam 2 paket'));
});

/* ================= C. Subtotal per scope (G14) ================= */
console.log('== C. Subtotal per scope (G14) ==');

test('C1: pesan multi-scope memuat subtotal per cakupan + rekonsiliasi seimbang', () => {
  const d = draftOf('Buat RAB pekerjaan drainase dan sanitasi sepanjang 500 meter');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('**Subtotal per cakupan:**'));
  assert.ok(msg.includes('Drainase & Saluran: "Saluran Drainase U-Ditch Beton Pracetak" — 4 item — subtotal Rp 373.975.000'));
  assert.ok(msg.includes('Sanitasi & Air Limbah: "Saluran U-Ditch + Tutup Heavy Duty Jalan Kolektor" — 7 item — subtotal Rp 538.787.308'));
  assert.ok(msg.includes('• Rekonsiliasi total: Σ cakupan Rp 912.762.308 = total proyek Rp 912.762.308 (selisih Rp 0 — seimbang)'));
});

test('C2: computeScopeTotals — Σ scope = total proyek, Σ item = item efektif', () => {
  const d = draftOf('Buat RAB pekerjaan drainase dan sanitasi sepanjang 500 meter');
  const st = computeScopeTotals(d);
  assert.equal(st.length, 2);
  const sum = st.reduce((a, s) => a + s.totals.estimatedTotal, 0);
  assert.equal(sum, computeTotals(d).estimatedTotal);
  assert.equal(st.reduce((a, s) => a + s.itemCount, 0), effectiveItems(d).length);
  assert.deepEqual(st.map((s) => s.scopeId), ['drainase', 'sanitasi']);
  assert.deepEqual(st.map((s) => s.totals.estimatedTotal), [373975000, 538787308]);
});

test('C3: draft single-scope TIDAK menampilkan subtotal per cakupan', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  assert.ok(!formatUniversalDraftMessage(d).includes('**Subtotal per cakupan:**'));
  assert.equal(computeScopeTotals(d).length, 1, 'helper tetap mengembalikan 1 scope');
});

/* ============ D. Tangga keuangan (G15) + label (G16) ============ */
console.log('== D. Tangga keuangan (G15) + label keuangan (G16) ==');

test('D1: pesan universal menyatakan total pratinjau = biaya langsung, Total RAB pasca-transfer', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('Total pratinjau di atas adalah **biaya langsung**'), 'baris tangga keuangan ada');
  assert.ok(msg.includes('**Total RAB** dihitung sesudah transfer di Spreadsheet'));
  assert.ok(msg.includes('overhead 0%, profit 0%, pajak opt-in'));
  // Baris tangga terletak sesudah definisi ESTIMASI (blok total), bukan di ringkasan.
  assert.ok(msg.indexOf('Total pratinjau di atas adalah') > msg.indexOf('ESTIMASI di sini berarti'));
});

test('D2: label total lama TIDAK berubah (pin p3b 1.9 dipertahankan)', () => {
  const d = draftOf('Buat RAB jalan beton sepanjang 1 km');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('Total estimasi (termasuk harga database, referensi pasar, dan manual)'));
  assert.ok(msg.includes('ESTIMASI di sini berarti total kuantitas × harga katalog per item'));
});

test('D3 (G16): parametrik & universal memakai kosakata tangga yang sama (biaya langsung vs Total RAB)', () => {
  const r = buildDirectRab('buatkan rab rumah type 70 2 lantai');
  assert.ok(r !== null, 'buildDirectRab menghasilkan RAB');
  const paramMsg = formatDirectRabMessage(r!);
  assert.ok(paramMsg.includes('Total biaya langsung'), 'parametrik: label biaya langsung');
  // Re-baseline koordinator 2026-11-22 21:52 (final gate): W5 (§5) menyembunyikan
  // komponen 0% — pada default §14 (0/0/0) kurung "(termasuk overhead …%)" hilang
  // dan baris menjadi "**Total RAB: Rp…**". Kosakata G16 tetap selaras (label
  // "biaya langsung" vs "Total RAB" sama di kedua jalur); pin lama yang menuntut
  // kurung SELALU tampil adalah perilaku lama, bukan regresi. Kedua cabang dipin:
  assert.ok(paramMsg.includes('Total RAB'), 'parametrik: label Total RAB');
  assert.ok(!paramMsg.includes('(termasuk overhead'), 'parametrik: kurung tangga hilang pada 0/0/0');
  const withComponents: DirectRabResult = {
    ...r!,
    generation: { ...r!.generation, overheadPercentage: 10, profitPercentage: 0, taxPercentage: 11 },
  };
  const paramMsgNz = formatDirectRabMessage(withComponents);
  assert.ok(
    paramMsgNz.includes('(termasuk overhead 10%, pajak 11%)'),
    'parametrik: kurung tangga tampil bila komponen bukan nol',
  );
  assert.ok(!paramMsgNz.includes('profit 0%'), 'parametrik: profit 0% tetap disembunyikan');
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const uniMsg = formatUniversalDraftMessage(d);
  assert.ok(uniMsg.includes('biaya langsung'), 'universal: menyebut biaya langsung');
  assert.ok(uniMsg.includes('Total RAB'), 'universal: menyebut Total RAB');
});

test('D4: pesan baru tetap jujur — tanpa literal Rp0 di luar "bukan Rp0"', () => {
  for (const text of ['Buat RAB jembatan beton bentang 12 meter', 'Buat RAB pekerjaan drainase dan sanitasi sepanjang 500 meter']) {
    const msg = formatUniversalDraftMessage(draftOf(text));
    const total = msg.split('Rp0').length - 1;
    const honest = (msg.match(/bukan Rp0/g) ?? []).length;
    assert.equal(total, honest, `tidak ada Rp0 tampil pada "${text}"`);
    assert.ok(!/harga terkini(?!")/i.test(msg), 'tidak ada klaim harga terkini');
  }
});

/* ============ E. WBS konseptual 6 → 18 scope (G3) ============ */
console.log('== E. WBS konseptual 6 → 18 scope (G3) ==');

test('E1: ke-18 scope engine punya WBS konseptual (≥5 baris, tanpa angka)', () => {
  for (const s of SCOPE_GROUPS) {
    const wbs = conceptualWbsFor(s.id);
    assert.ok(Array.isArray(wbs) && wbs.length >= 5, `scope ${s.id} punya WBS konseptual (dapat ${wbs?.length})`);
    for (const line of wbs!) {
      assert.ok(!/\d/.test(line), `tanpa angka — scope ${s.id}: "${line}"`);
    }
  }
});

test('E2: 6 kunci warisan TIDAK berubah (panjang + isi awal dipin)', () => {
  assert.equal(conceptualWbsFor('rumah')!.length, 10);
  assert.equal(conceptualWbsFor('gudang-industri')!.length, 8);
  assert.equal(conceptualWbsFor('kandang')!.length, 8);
  assert.equal(conceptualWbsFor('kolam')!.length, 8);
  assert.equal(conceptualWbsFor('jembatan')!.length, 8);
  assert.equal(conceptualWbsFor('renovasi')!.length, 6);
  assert.equal(conceptualWbsFor('rumah')![0], 'Pekerjaan persiapan & pengukuran');
  assert.equal(conceptualWbsFor('kolam')![2], 'Waterproofing kolam');
  // jembatan + renovasi adalah kunci ganda: subkategori SEKALIGUS scope.
  assert.equal(conceptualWbsFor('jembatan')![1], 'Pondasi & abutment (kepala jembatan)');
});

test('E3: kunci tak dikenal / kosong → null; label wajib tidak berubah', () => {
  assert.equal(conceptualWbsFor('tidak-ada'), null);
  assert.equal(conceptualWbsFor(null), null);
  assert.equal(conceptualWbsFor(undefined), null);
  assert.equal(CONCEPTUAL_WBS_LABEL, 'WBS konseptual (struktur diskusi — BUKAN BOQ terverifikasi/AHSP, tanpa angka)');
  const lines = conceptualWbsLines('jalan');
  assert.ok(lines.some((l) => l.includes('BUKAN BOQ terverifikasi/AHSP')));
  assert.ok(lines.some((l) => l.includes('Perkerasan (aspal/beton/paving — dipilih eksplisit)')));
  assert.deepEqual(conceptualWbsLines('tidak-ada'), []);
});

/* ===== F. Pemetaan 5 skema (G4) + spreadsheet→G (G17-kecil) ===== */
console.log('== F. Pemetaan 5 skema kelompok kerja (G4/G17) ==');

// Jangkar literal ke berkas sumber (bukan ke tabel itu sendiri):
// legacy = buildStandardHouseComponents, registry = WorkItemCategoryGroup,
// spreadsheet = DesignSpreadsheet.tsx. Bila label sumber berubah, tes ini
// gagal dan tabel wajib diperbarui secara sadar.
const EXPECTED_LEGACY = [
  '01. PEKERJAAN PERSIAPAN',
  '02. PEKERJAAN TANAH DAN PONDASI',
  '03. PEKERJAAN STRUKTUR',
  '04. PEKERJAAN DINDING',
  '05. PEKERJAAN LANTAI',
  '06. PEKERJAAN ATAP',
  '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
  '08. PEKERJAAN PLAFON',
  '09. PEKERJAAN INSTALASI LISTRIK',
  '10. PEKERJAAN PLAMBING DAN SANITASI',
  '11. PEKERJAAN PENGECATAN',
  '12. PEKERJAAN TAMBAHAN EKSTERIOR',
];
const EXPECTED_REGISTRY = [
  '01_PERSIAPAN', '02_TANAH', '03_PONDASI', '04_STRUKTUR_BETON', '05_DINDING',
  '06_PLESTERAN_ACIAN', '07_LANTAI', '08_PLAFON', '09_ATAP',
  '10_KUSEN_PINTU_JENDELA', '11_PENGECATAN', '12_SANITASI', '13_INSTALASI_AIR',
  '14_INSTALASI_LISTRIK', '15_INFRASTRUKTUR_JALAN', '16_DRAINASE', '17_PEKERJAAN_LUAR',
];
const EXPECTED_SPREADSHEET = [
  '01 Persiapan', '02 Tanah', '03 Pondasi', '04 Struktur', '05 Dinding',
  '06 Atap', '07 Plafond', '08 Lantai', '09 Kusen, Pintu & Jendela',
  '10 Instalasi Listrik', '11 Instalasi Air & Sanitasi', '12 Pengecatan & Finishing',
];

test('F1: 17 baris G; label G persis nilai builders.ts (bukan salinan ketik)', () => {
  assert.equal(WBS_GROUP_MAP.length, 17);
  assert.deepEqual(WBS_GROUP_MAP.map((r) => r.id), [
    'G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09',
    'G10', 'G11', 'G12', 'G13', 'G14', 'G15', 'G16', 'G17',
  ]);
  assert.deepEqual(WBS_GROUP_MAP.map((r) => r.g), Object.values(G));
  for (const row of WBS_GROUP_MAP) {
    assert.equal(groupForCategoryLabel(row.g), row.id, `label G ${row.g} round-trip`);
  }
});

test('F2: round-trip legacy (12 label) — tiap label kembali ke barisnya', () => {
  assert.deepEqual([...legacyGroupLabels()].sort(), [...EXPECTED_LEGACY].sort());
  for (const label of EXPECTED_LEGACY) {
    const id = groupForLegacyLabel(label);
    assert.ok(id, `legacy "${label}" terpetakan`);
    assert.ok(rowForGroup(id!)!.legacy.includes(label), `round-trip legacy "${label}" → ${id}`);
  }
});

test('F3: round-trip registry (17 kategori, termasuk 13 & 17 yang belum dipakai template)', () => {
  assert.deepEqual([...registryCategories()].sort(), [...EXPECTED_REGISTRY].sort());
  for (const cat of EXPECTED_REGISTRY) {
    const id = groupForRegistryCategory(cat);
    assert.ok(id, `registry "${cat}" terpetakan`);
    assert.ok(rowForGroup(id!)!.registry.includes(cat), `round-trip registry "${cat}" → ${id}`);
  }
  // Bukti katalog: plesteran → Dinding (G05), pengecatan → Finishing (G09).
  assert.equal(groupForRegistryCategory('06_PLESTERAN_ACIAN'), 'G05');
  assert.equal(groupForRegistryCategory('11_PENGECATAN'), 'G09');
});

test('F4 (G17): round-trip spreadsheet (12 kelompok) + label G per kelompok', () => {
  assert.deepEqual([...spreadsheetGroups()].sort(), [...EXPECTED_SPREADSHEET].sort());
  for (const kelompok of EXPECTED_SPREADSHEET) {
    const id = groupForSpreadsheetGroup(kelompok);
    assert.ok(id, `spreadsheet "${kelompok}" terpetakan`);
    assert.ok(rowForGroup(id!)!.spreadsheet.includes(kelompok), `round-trip spreadsheet "${kelompok}" → ${id}`);
  }
  assert.equal(gLabelForSpreadsheetGroup('01 Persiapan'), '01. PEKERJAAN PERSIAPAN');
  assert.equal(gLabelForSpreadsheetGroup('07 Plafond'), '07. PEKERJAAN ATAP & PLAFON');
  assert.equal(gLabelForSpreadsheetGroup('12 Pengecatan & Finishing'), '09. PEKERJAAN FINISHING');
  assert.equal(gLabelForSpreadsheetGroup('99 Tidak Ada'), null);
});

test('F5: penggabungan/pemisahan nyata — label gabungan legacy 02 → G02+G03; G07 menampung 2 legacy', () => {
  assert.deepEqual(groupsForCategoryLabel('02. PEKERJAAN TANAH DAN PONDASI'), ['G02', 'G03']);
  assert.equal(groupForCategoryLabel('02. PEKERJAAN TANAH DAN PONDASI'), 'G02', 'lookup tunggal deterministik (pertama)');
  assert.equal(groupForLegacyLabel('06. PEKERJAAN ATAP'), 'G07');
  assert.equal(groupForLegacyLabel('08. PEKERJAAN PLAFON'), 'G07');
  assert.deepEqual(rowForGroup('G07')!.legacy, ['06. PEKERJAAN ATAP', '08. PEKERJAAN PLAFON']);
  assert.deepEqual(rowForGroup('G12')!.legacy, [], 'G12 tanpa padanan legacy (jujur kosong)');
  assert.deepEqual(rowForGroup('G16')!.registry, [], 'G16 tanpa padanan registry');
  assert.deepEqual(rowForGroup('G17')!.spreadsheet, [], 'G17 tanpa padanan spreadsheet');
});

test('F6: label tak dikenal / ad-hoc → null (tidak ditebak)', () => {
  assert.equal(groupForCategoryLabel('01. PERSIAPAN'), null, 'label ad-hoc seed di luar kelima skema');
  assert.equal(groupForCategoryLabel('02. PASIR ALAS'), null);
  assert.equal(groupForCategoryLabel(''), null);
  assert.equal(groupForLegacyLabel('01_PERSIAPAN'), null, 'lookup skema-spesifik tidak lintas skema');
  assert.deepEqual(groupsForCategoryLabel('tidak ada'), []);
});

test('F7: round-trip artefak — tiap scope punya grup; tiap grup punya scope', () => {
  for (const s of SCOPE_GROUPS) {
    const groups = groupsForScope(s.id);
    assert.ok(groups.length >= 1, `scope ${s.id} punya grup`);
    for (const g of groups) {
      assert.ok(scopesForGroup(g).includes(s.id), `round-trip scope ${s.id} ↔ ${g}`);
    }
  }
  for (const row of WBS_GROUP_MAP) {
    assert.ok(row.scopes.length >= 1, `grup ${row.id} punya scope`);
  }
  // Jangkar turunan: G08 hanya di 4 scope; G17 hanya di 5 scope.
  assert.deepEqual(groupsForScope('demolisi').sort(), ['G01', 'G02', 'G04', 'G16', 'G17']);
  assert.deepEqual(scopesForGroup('G08'), ['finishing', 'gedung', 'renovasi', 'pertanian']);
});

test('F8: tabel scope ↔ katalog hidup TIDAK drift (turunkan ulang dari template resmi)', () => {
  const templates = officialTemplates();
  assert.equal(templates.length, 183, 'katalog resmi tetap 183 (pin S2)');
  for (const scope of SCOPE_GROUPS) {
    const cats = new Set(scope.categories);
    const derived = new Set<WbsGroupId>();
    let templateCount = 0;
    for (const t of templates) {
      if (!cats.has(t.category)) continue;
      templateCount++;
      for (const c of t.components ?? []) {
        for (const g of groupsForCategoryLabel(c.category)) derived.add(g);
      }
    }
    assert.ok(templateCount >= 1, `scope ${scope.id} punya template resmi`);
    assert.deepEqual(
      [...groupsForScope(scope.id)].sort(),
      [...derived].sort(),
      `scope ${scope.id}: tabel ≠ katalog hidup — turunkan ulang tabel (lihat header wbsGroupMapping.ts)`,
    );
  }
});

/* ===== G. Transfer trace + volumeBasis (S3-15/16) ===== */
console.log('== G. Transfer trace + volumeBasis (S3-15/16) ==');

test('G1: payload membawa volumeBasis di SEMUA item + calculationFormula (rumus murni W7)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  assert.equal(payload.length, effectiveItems(d).length);
  for (const p of payload) {
    assert.ok(p.volumeBasis === 'USER_DIMENSION' || p.volumeBasis === 'ASSUMPTION', `basis valid: ${p.description}`);
    assert.ok(p.calculationFormula && p.calculationFormula.length > 0, `formula terisi: ${p.description}`);
    // Konsistensi: formula top-level == formula di qtoTrace (satu
    // sumber: calculationRule komponen — bukan dua angka berbeda).
    if (p.qtoTrace?.formula) assert.equal(p.calculationFormula, p.qtoTrace.formula, `formula == trace.formula: ${p.description}`);
  }
  // Spot-check rumus murni (bukan string komposit 'Rule: … | Detail: …').
  assert.equal(payload[0].calculationFormula, 'span_length * bridge_width * 2.2');
});

test('G2: volumeSource dibedakan dari basis — USER_DIMENSION → MANUAL, ASSUMPTION → AI_GENERATED', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  const byBasis = (b: string) => payload.filter((p) => p.volumeBasis === b);
  assert.ok(byBasis('USER_DIMENSION').length >= 1, 'ada item USER_DIMENSION (bentang 12 m dipakai rumus)');
  assert.ok(byBasis('ASSUMPTION').length >= 1, 'ada item ASSUMPTION (default template)');
  for (const p of byBasis('USER_DIMENSION')) assert.equal(p.volumeSource, 'MANUAL', p.description);
  for (const p of byBasis('ASSUMPTION')) assert.equal(p.volumeSource, 'AI_GENERATED', p.description);
});

test('G3: multi-scope — basis per part benar (tanpa tabrakan ID mentah antar-part)', () => {
  const d = draftOf('Buat RAB pekerjaan drainase dan sanitasi sepanjang 500 meter');
  const payload = buildPushPayload(d);
  assert.equal(payload.length, 11);
  assert.ok(payload.every((p) => p.volumeBasis === 'USER_DIMENSION' || p.volumeBasis === 'ASSUMPTION'));
  assert.ok(payload.every((p) => !!p.calculationFormula), 'semua item multi-scope membawa formula');
  assert.ok(payload.every((p) => !!p.qtoTrace && !!p.sourceComponentId), 'semua item multi-scope membawa trace + komponen');
  assert.ok(payload.some((p) => p.volumeBasis === 'USER_DIMENSION'), 'ada item USER_DIMENSION (panjang 500 m)');
  // Konsistensi basis ↔ volumeSource di semua item.
  for (const p of payload) {
    assert.equal(p.volumeSource, p.volumeBasis === 'USER_DIMENSION' ? 'MANUAL' : 'AI_GENERATED');
  }
});

test('G4: factory meneruskan volumeBasis + calculationFormula (allowlist)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  const records = payload.map((p, i) => createRabItemRecord(p as never, 'proj-test', { index: i }));
  assert.equal(records.length, payload.length);
  for (let i = 0; i < payload.length; i++) {
    assert.equal((records[i] as { volumeBasis?: string }).volumeBasis, payload[i].volumeBasis, `basis bertahan: ${payload[i].description}`);
    assert.equal(records[i].calculationFormula, payload[i].calculationFormula, `formula bertahan: ${payload[i].description}`);
    assert.equal(records[i].volumeSource, payload[i].volumeSource, `volumeSource bertahan: ${payload[i].description}`);
  }
});

test('G5: cloneProvenance membawa volumeBasis + calculationFormula (salinan = basis sama)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  const rec = createRabItemRecord(payload[0] as never, 'proj-test', { index: 0 });
  const cloned = cloneProvenance(rec);
  assert.equal((cloned as { volumeBasis?: string }).volumeBasis, payload[0].volumeBasis);
  assert.equal(cloned.calculationFormula, payload[0].calculationFormula);
  // Jalur duplikat nyata: clone → factory lagi → tetap bertahan.
  const rec2 = createRabItemRecord({ ...cloned, description: rec.description, volume: rec.volume, unit: rec.unit } as never, 'proj-test', { index: 1 });
  assert.equal((rec2 as { volumeBasis?: string }).volumeBasis, payload[0].volumeBasis);
  assert.equal(rec2.calculationFormula, payload[0].calculationFormula);
});

test('G6: harga/total TIDAK berubah oleh transfer trace (payload == total pratinjau)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  let pricedSum = 0;
  for (const p of payload) {
    assert.ok(['PRICE_RESOLVED', 'PRICE_UNRESOLVED', 'PRICE_ESTIMATED', 'PRICE_MANUAL'].includes(p.priceStatus));
    if (p.priceStatus !== 'PRICE_UNRESOLVED' && p.unitPrice != null) pricedSum += p.volume * p.unitPrice;
  }
  assert.ok(Math.abs(pricedSum - computeTotals(d).estimatedTotal) < 1, `Σ payload berharga == total pratinjau (${pricedSum} vs ${computeTotals(d).estimatedTotal})`);
  // Spot-check kontrak S2 tetap berlaku: item resmi membawa kind + label.
  const official = payload.find((p) => p.priceSourceKind === 'OFFICIAL_AHSP');
  assert.ok(official, 'ada item resmi di payload');
  assert.equal(official.priceSourceLabel, 'Harga Resmi AHSP 2026');
});

test('G7 (W7): payload membawa qtoTrace + sourceComponentId di SEMUA item', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  for (const p of payload) {
    assert.ok(p.sourceComponentId && p.sourceComponentId.length > 0, `komponen terisi: ${p.description}`);
    assert.ok(p.qtoTrace, `trace terisi: ${p.description}`);
    assert.equal(p.qtoTrace!.sourceComponentId, p.sourceComponentId, 'top-level == di dalam trace');
    assert.equal(p.qtoTrace!.volumeSource, 'CALCULATOR', 'trace: evaluasi deterministik rule template');
    assert.ok(p.qtoTrace!.formula, 'trace membawa rumus');
    assert.equal(typeof p.qtoTrace!.formulaInputs, 'object', 'trace membawa input rumus');
  }
  // Spot-check input rumus nyata (snapshot parameter yang dirujuk rule).
  assert.deepEqual(payload[0].qtoTrace!.formulaInputs, { span_length: 12, bridge_width: 7 });
  assert.equal(payload[0].sourceComponentId, 'BRG-GIRDER-20M::prep');
});

test('G8 (W7): factory + cloneProvenance meneruskan qtoTrace + sourceComponentId', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const payload = buildPushPayload(d);
  const records = payload.map((p, i) => createRabItemRecord(p as never, 'proj-test', { index: i }));
  for (let i = 0; i < payload.length; i++) {
    assert.equal(records[i].sourceComponentId, payload[i].sourceComponentId, `komponen bertahan: ${payload[i].description}`);
    assert.deepEqual(records[i].qtoTrace, payload[i].qtoTrace, `trace bertahan: ${payload[i].description}`);
    // Salinan defensif: record tidak mengaliasi objek trace draft.
    assert.notEqual(records[i].qtoTrace, payload[i].qtoTrace, 'trace record adalah salinan');
    assert.notEqual(records[i].qtoTrace!.formulaInputs, payload[i].qtoTrace!.formulaInputs, 'formulaInputs record adalah salinan');
  }
  const cloned = cloneProvenance(records[0]);
  assert.equal(cloned.sourceComponentId, payload[0].sourceComponentId);
  assert.deepEqual(cloned.qtoTrace, payload[0].qtoTrace);
  // Jalur duplikat nyata: clone → factory lagi → tetap bertahan.
  const rec2 = createRabItemRecord({ ...cloned, description: records[0].description, volume: records[0].volume, unit: records[0].unit } as never, 'proj-test', { index: 1 });
  assert.equal(rec2.sourceComponentId, payload[0].sourceComponentId);
  assert.deepEqual(rec2.qtoTrace, payload[0].qtoTrace);
});

test('G9: fallback formula — item tanpa field W7 memakai jejak traceability (tanpa karangan trace)', () => {
  const d = draftOf('Buat RAB jembatan beton bentang 12 meter');
  const item = d.parts[0].generation.items[0];
  delete (item as { calculationFormula?: string }).calculationFormula;
  delete (item as { qtoTrace?: unknown }).qtoTrace;
  delete (item as { sourceComponentId?: string }).sourceComponentId;
  const payload = buildPushPayload(d);
  const p0 = payload[0];
  assert.ok(p0.calculationFormula?.startsWith('Rule: span_length * bridge_width * 2.2'), `fallback jejak: ${p0.calculationFormula}`);
  assert.equal(p0.qtoTrace, undefined, 'tanpa trace = tanpa qtoTrace (tidak dikarang)');
  assert.equal(p0.sourceComponentId, undefined, 'tanpa komponen = tanpa sourceComponentId');
  // Item lain tidak terpengaruh.
  assert.ok(payload[1].qtoTrace && payload[1].sourceComponentId);
});

console.log(`\nUNIVERSAL WBS OUTPUT (W3/W9): ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
