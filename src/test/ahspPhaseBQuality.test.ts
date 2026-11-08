/**
 * EZRAB PHASE B — CATALOG QUALITY REGRESSION TESTS
 * (Master AHSP Data Quality Audit, Phase B — 2026-11-08)
 *
 * Proves the Phase B safety invariants over the REAL catalog:
 * - Source identity preservation (raw backing store keeps the typo'd spelling).
 * - Display alias reversibility (repository applies the alias; the raw record
 *   still carries the original, so removing the alias entry restores it).
 * - Duplicate non-merging (Pasir Pasang vs Pasir Beton stay distinct;
 *   grade/dimension identities stay separate; collision records preserved).
 * - Unit mismatch rejection (resolver keeps UNIT_MISMATCH, price stays null).
 * - Missing price stays missing (never silently Rp0).
 * - Zero coefficients preserved as source data (placeholder/framework rows).
 * - Official source codes preserved (Bina Marga letter code + standardCode).
 * - Code collisions detectable and BOTH records preserved.
 * - Manual / non-AHSP item support (empty code stays findable in full list).
 */

declare const process: any;

import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import { getCorrections, PHASE_B_DISPLAY_CORRECTIONS, OWNER_APPROVED_DISPLAY_CORRECTIONS } from '../data/nationalCostDatabase/ahspDescriptionCorrections';
import { FORBIDDEN_MERGES, resolveCodeAlias } from '../data/nationalCostDatabase/ahspCodeAliases';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';

interface Check { name: string; passed: boolean; detail?: string }
const checks: Check[] = [];
function check(name: string, passed: boolean, detail = '') {
  checks.push({ name, passed, detail });
}

const all = ALL_OFFICIAL_AHSP_ITEMS as any[];
const active = officialAhspRepository.getActiveOfficialAhsp() as any[];
const compNames = (it: any): string[] => [
  ...(it.laborComponents ?? []), ...(it.materialComponents ?? []), ...(it.equipmentComponents ?? []),
].map((c: any) => String(c.name));

// ---------------------------------------------------------------------------
// 1. Phase B alias registry hygiene: exactly the proven typo, fully provenanced.
// ---------------------------------------------------------------------------
check('Phase B alias registry berisi tepat 1 entri (hanya typo terbukti)', PHASE_B_DISPLAY_CORRECTIONS.length === 1,
  `dapat ${PHASE_B_DISPLAY_CORRECTIONS.length}`);
const alias = PHASE_B_DISPLAY_CORRECTIONS[0];
check('Alias Mistar: field materialName index 0', alias.code === 'A.1.02.5c.1' && alias.field === 'materialName' && alias.materialIndex === 0);
check('Alias Mistar: oldValue = ejaan sumber persis', alias.oldValue === 'Mistar Ukur Allumunium, lebar 8 M.76.a');
check('Alias Mistar: newValue hanya mengganti ejaan typo', alias.newValue === 'Mistar Ukur Aluminium, lebar 8 M.76.a');
check('Alias Mistar: provenans halaman sumber tercatat', alias.pdfPage === 327 && /Lampiran IV/.test(alias.reason));

// ---------------------------------------------------------------------------
// 2. Source identity preservation + alias reversibility.
// ---------------------------------------------------------------------------
const rawMistar = all.find((i) => i.code === 'A.1.02.5c.1');
check('Record sumber A.1.02.5c.1 ada di backing store', !!rawMistar);
check('Identitas sumber utuh: backing store tetap "Allumunium"',
  !!rawMistar && compNames(rawMistar).includes('Mistar Ukur Allumunium, lebar 8 M.76.a'));
const dispMistar = officialAhspRepository.getOfficialAhsp('A.1.02.5c.1');
check('Lapisan display menampilkan "Aluminium"',
  !!dispMistar && compNames(dispMistar).includes('Mistar Ukur Aluminium, lebar 8 M.76.a'));
check('Koefisien & satuan komponen Mistar tidak berubah oleh alias',
  !!dispMistar && (dispMistar.materialComponents?.[0]?.coefficient === 1) && (dispMistar.materialComponents?.[0]?.unit === "m'"),
  `coef=${dispMistar?.materialComponents?.[0]?.coefficient} unit=${dispMistar?.materialComponents?.[0]?.unit}`);
check('getCorrections(A.1.02.5c.1) memuat alias Phase B', getCorrections('A.1.02.5c.1').some((c) => c.newValue.includes('Aluminium')));

// ---------------------------------------------------------------------------
// 2b. Owner-approved equipment alias (2026-11-08): Crabe -> Crane on BM I.15.
//     Mechanism extension: field 'equipmentName' + 'equipmentIndex' mirrors
//     'materialName' semantics exactly; display-only and reversible.
// ---------------------------------------------------------------------------
check('Registry persetujuan owner berisi tepat 1 entri (hanya Crabe)', OWNER_APPROVED_DISPLAY_CORRECTIONS.length === 1,
  `dapat ${OWNER_APPROVED_DISPLAY_CORRECTIONS.length}`);
const crabe = OWNER_APPROVED_DISPLAY_CORRECTIONS[0] ?? ({} as typeof OWNER_APPROVED_DISPLAY_CORRECTIONS[number]);
check('Alias Crabe: field equipmentName index 0 pada I.15', crabe.code === 'I.15' && crabe.field === 'equipmentName' && crabe.equipmentIndex === 0);
check('Alias Crabe: oldValue = nama sumber persis', crabe.oldValue === 'ALAT Crabe 10-15 Ton');
check('Alias Crabe: newValue hanya mengganti ejaan typo', crabe.newValue === 'ALAT Crane 10-15 Ton');
check('Alias Crabe: provenans tercatat (E07, harga identik, hal. 1762, persetujuan owner)',
  crabe.pdfPage === 1762 && /E07/.test(crabe.reason) && /773\.917,31/.test(crabe.reason) && /PERSETUJUAN OWNER 2026-11-08/.test(crabe.reason));
const rawCrabe = all.find((i) => i.code === 'I.15');
check('Record sumber I.15 ada di backing store', !!rawCrabe);
check('Identitas sumber utuh: backing store tetap "Crabe" (E07)',
  !!rawCrabe && rawCrabe.equipmentComponents?.[0]?.name === 'ALAT Crabe 10-15 Ton' && rawCrabe.equipmentComponents?.[0]?.code === 'E07');
const dispCrabe = officialAhspRepository.getOfficialAhsp('I.15');
check('Lapisan display menampilkan "Crane" untuk peralatan I.15',
  !!dispCrabe && dispCrabe.equipmentComponents?.[0]?.name === 'ALAT Crane 10-15 Ton');
check('Backing store TIDAK termutasi oleh panggilan repository (tetap "Crabe")',
  rawCrabe.equipmentComponents?.[0]?.name === 'ALAT Crabe 10-15 Ton');
check('Koefisien, satuan & harga komponen Crabe tidak berubah oleh alias',
  !!dispCrabe && dispCrabe.equipmentComponents?.[0]?.coefficient === 1 && dispCrabe.equipmentComponents?.[0]?.unit === 'jam'
  && dispCrabe.equipmentComponents?.[0]?.unitPrice === 773917.31,
  `coef=${dispCrabe?.equipmentComponents?.[0]?.coefficient} unit=${dispCrabe?.equipmentComponents?.[0]?.unit} price=${dispCrabe?.equipmentComponents?.[0]?.unitPrice}`);
check('Harga & nama item I.15 tidak berubah oleh alias peralatan',
  !!dispCrabe && dispCrabe.unitPrice === 851309.04 && dispCrabe.name === 'Truck Crane 10 - 15 Ton');
check('getCorrections(I.15) memuat alias peralatan owner', getCorrections('I.15').some((c) => c.field === 'equipmentName' && c.newValue === 'ALAT Crane 10-15 Ton'));
check('Alias Mistar tetap utuh berdampingan dengan alias Crabe',
  getCorrections('A.1.02.5c.1').some((c) => c.newValue.includes('Aluminium')) && PHASE_B_DISPLAY_CORRECTIONS.length === 1);

// ---------------------------------------------------------------------------
// 3. Duplicate non-merging: Pasir Pasang vs Pasir Beton; grade separation.
// ---------------------------------------------------------------------------
const pasirNames = new Set(active.flatMap(compNames));
check('Pasir Pasang dan Pasir Beton tetap identitas terpisah',
  [...pasirNames].some((n) => /^pasir pasang/i.test(n)) && [...pasirNames].some((n) => /^pasir beton/i.test(n)));
check('FORBIDDEN_MERGES tetap terdaftar (pengaman anti-gabung)', FORBIDDEN_MERGES.length >= 3);
for (const f of FORBIDDEN_MERGES) {
  check(`Pasangan terlarang tidak ter-alias: ${f.a} !-> ${f.b}`, resolveCodeAlias(f.a) !== f.b && resolveCodeAlias(f.b) !== f.a);
}
const betonGrades = new Set([...pasirNames].filter((n) => /beton.*K-\d+|K-\d+.*beton/i.test(n)));
check('Kelas beton berbeda tetap terpisah (K-300 vs K-350 dsb.)', betonGrades.size >= 2, `${betonGrades.size} varian nama beton bergrade`);

// ---------------------------------------------------------------------------
// 4. Unit mismatch rejection + missing price stays null (never Rp0).
// ---------------------------------------------------------------------------
const crane = active.find((i) => compNames(i).some((n) => n === 'Mobile Crane Kapasitas 1. T.13.a'));
check('Item Mobile Crane token-putus ditemukan untuk uji resolver', !!crane, crane?.code);
if (crane) {
  const res: any = priceResolver2026.resolveAhspUnitPrice(crane);
  const allComps = [...(res.labor?.components ?? []), ...(res.material?.components ?? []), ...(res.equipment?.components ?? [])];
  // The resolver reports the component NAME inside unresolvedReason; sourceName
  // is the price-record provenance label, not the component name.
  const craneComp = allComps.find((c: any) => /Mobile Crane Kapasitas 1\./.test(String(c.unresolvedReason ?? '')));
  check('Komponen crane tetap tak teresolusi (harga null, bukan 0)',
    !!craneComp && craneComp.resolved === false && craneComp.unitPrice === null,
    `unitPrice=${craneComp?.unitPrice} resolved=${craneComp?.resolved}`);
  check('Alasan resolusi crane eksplisit "NOT priced — NOT Rp 0" (tanpa konversi diam-diam)',
    !!craneComp && /NOT priced|NOT Rp 0|No price record/i.test(String(craneComp.unresolvedReason ?? '')),
    String(craneComp?.unresolvedReason ?? '').slice(0, 80));
  check('Item crane berstatus PARTIAL (tidak disajikan sebagai harga lengkap)',
    res.pricingStatus === 'PARTIAL', `pricingStatus=${res.pricingStatus}`);
}

// ---------------------------------------------------------------------------
// 5. Zero coefficients preserved (placeholder/framework source rows untouched).
// ---------------------------------------------------------------------------
const fw = active.find((i) => i.code === '4.1.1.1');
check('Item framework 4.1.1.1 tetap ada (tidak dihapus diam-diam)', !!fw);
check('Koefisien nol framework dipertahankan apa adanya',
  !!fw && compNames(fw).length > 0 && [...(fw.laborComponents ?? []), ...(fw.materialComponents ?? []), ...(fw.equipmentComponents ?? [])].every((c: any) => c.coefficient === 0));

// ---------------------------------------------------------------------------
// 6. Official codes preserved + collisions detectable, both records preserved.
// ---------------------------------------------------------------------------
const bm = active.find((i) => i.domain === 'BINA_MARGA' && i.standardCode);
check('Item Bina Marga membawa kode huruf + standardCode resmi kurung', !!bm, bm ? `${bm.code} / ${bm.standardCode}` : '');
const reducers = all.filter((i) => i.code === 'A.3.08.3.4.b.6.a');
check('Tabrakan kode Reducer: kedua record sumber terawetkan', reducers.length === 2, `dapat ${reducers.length}`);
check('Tabrakan Reducer: dua ukuran berbeda tetap terbedakan namanya',
  reducers.length === 2 && reducers.some((r) => /1400/.test(r.name)) && reducers.some((r) => /1200/.test(r.name)));

// ---------------------------------------------------------------------------
// 7. Manual / non-AHSP support: the single empty-code item stays in the catalog.
// ---------------------------------------------------------------------------
const emptyCode = all.filter((i) => !String(i.code ?? '').trim());
check('Tepat 1 item kode kosong (Pondasi Tiang Bor) terawetkan', emptyCode.length === 1, `dapat ${emptyCode.length}`);
check('Item kode kosong tetap bernama & bersatuan (dapat dipakai sbg item manual)',
  emptyCode.length === 1 && /Pondasi Tiang Bor/.test(emptyCode[0].name) && emptyCode[0].unit === "m'");
check('Item kode kosong TIDAK lolos gerbang resmi (hasOfficialAhsp("") = false)',
  officialAhspRepository.hasOfficialAhsp('') === false);

// ---------------------------------------------------------------------------
const failed = checks.filter((c) => !c.passed);
console.log(`\nPHASE B CATALOG QUALITY: ${checks.length - failed.length} PASSED, ${failed.length} FAILED\n`);
for (const c of checks) console.log(`  ${c.passed ? 'PASS' : 'FAIL'} — ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
if (failed.length > 0) process.exit(1);
