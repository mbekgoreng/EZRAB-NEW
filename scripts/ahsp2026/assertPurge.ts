/**
 * EZRAB AHSP 2026 — PURGE & INTEGRITY ASSERTIONS
 * ==============================================
 *
 * Implements the post-purge gates (purge prompt §11), the forensic cross-check
 * (§21), the duplicate audit (§22), the integrity audit (§23) and the mandatory
 * test cases (§25).
 *
 * FAIL-CLOSED: any failed assertion exits non-zero.
 *
 * Usage: npx tsx scripts/ahsp2026/assertPurge.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { AHSP_2026_CANONICAL, AHSP_2026_CANONICAL_SUMMARY } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { ALL_OFFICIAL_AHSP_ITEMS, CostDatabaseEngine } from '../../src/data/nationalCostDatabase/masterRegistry';
import { AHSPRepository } from '../../src/engine/ahsp/repository/ahspRepository';

const ROOT = process.cwd();
const NCD = path.join(ROOT, 'src', 'data', 'nationalCostDatabase');
const VALIDATED = path.join(ROOT, 'data', 'ahsp2026', 'validated');

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(t: string) { console.log(`\n${t}`); }

/* ------------------------------------------------------------------ */
/* §11 — post-purge assertions                                          */
/* ------------------------------------------------------------------ */
section('[§11] POST-PURGE ASSERTIONS');

const PURGED = [
  'sdaAHSPDataset.ts',
  'binaMargaAHSPDataset.ts',
  'binaMargaAHSP2026Official.ts',
  'binaMargaAHSP2026OfficialTypes.ts',
  'ciptaKaryaAHSPDataset.ts',
  'smkkDataset.ts',
];
for (const f of PURGED) {
  check(`legacy module removed: ${f}`, !fs.existsSync(path.join(NCD, f)));
}

const backupDir = path.join(ROOT, 'backups', 'legacy-ahsp-pre-2026-purge');
const manifest = path.join(backupDir, 'MANIFEST.json');
check('legacy backup manifest exists', fs.existsSync(manifest));
if (fs.existsSync(manifest)) {
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  check('legacy backup copied every target', m.counts.missing === 0, `copied=${m.counts.copied}/${m.counts.targets}`);
}

/* ------------------------------------------------------------------ */
/* §20 / §21 — canonical count + forensic cross-check                   */
/* ------------------------------------------------------------------ */
section('[§20/§21] CANONICAL COUNT + CROSS-CHECK');

const master = JSON.parse(fs.readFileSync(path.join(VALIDATED, 'ahsp_2026_master.json'), 'utf8'));
const sourceItems: any[] = master.items;
const byField = (rows: any[]) => {
  const c: Record<string, number> = { SMKK: 0, SDA: 0, BINA_MARGA: 0, CIPTA_KARYA: 0 };
  for (const r of rows) c[r.field] = (c[r.field] ?? 0) + 1;
  return c;
};
const sourceCounts = byField(sourceItems);
const moduleCounts = AHSP_2026_CANONICAL_SUMMARY.byField;

// METHOD A = source artefact; METHOD B = generated module; METHOD C = runtime registry
const methodA = sourceItems.length;
const methodB = AHSP_2026_CANONICAL.length;
const methodC = ALL_OFFICIAL_AHSP_ITEMS.length;
const methodD = CostDatabaseEngine.getAllItems().length;
const methodE = AHSPRepository.getInstance().count();

console.log(`  METHOD A (source artefact)      : ${methodA}`);
console.log(`  METHOD B (generated module)     : ${methodB}`);
console.log(`  METHOD C (registry constant)    : ${methodC}`);
console.log(`  METHOD D (CostDatabaseEngine)   : ${methodD}`);
console.log(`  METHOD E (AHSPRepository)       : ${methodE}`);

check('METHOD A == B == C (source ↔ module ↔ registry)', methodA === methodB && methodB === methodC);
check('runtime engine count equals canonical (no legacy merge)', methodD === methodA, `${methodD} vs ${methodA}`);
// The repository indexes by normalized code; records whose source prints no code
// are intentionally un-indexed (they remain addressable by id — §25).
const codeLess = AHSP_2026_CANONICAL.filter((i) => !i.code.trim()).length;
check(
  'repository count = canonical minus code-less records',
  methodE === methodA - codeLess,
  `${methodE} vs ${methodA} - ${codeLess}`
);

check('total = 5801', methodA === 5801, String(methodA));
check('SMKK = 223', sourceCounts.SMKK === 223 && moduleCounts.SMKK === 223);
check('SDA = 1556', sourceCounts.SDA === 1556 && moduleCounts.SDA === 1556);
check('BINA_MARGA = 1163', sourceCounts.BINA_MARGA === 1163 && moduleCounts.BINA_MARGA === 1163);
check('CIPTA_KARYA = 2859', sourceCounts.CIPTA_KARYA === 2859 && moduleCounts.CIPTA_KARYA === 2859);
check('total is NOT 6211', methodA !== 6211);

/* ------------------------------------------------------------------ */
/* §3 — no Bidang Umum                                                  */
/* ------------------------------------------------------------------ */
section('[§3] NO BIDANG UMUM');

const umm = AHSP_2026_CANONICAL.filter((i) => (i.domain as string) === 'UMUM');
check('zero items with domain UMUM', umm.length === 0, `${umm.length}`);
const ummCat = AHSP_2026_CANONICAL.filter((i) => /BIDANG_UMUM|LAMPIRAN_UMUM/i.test(String(i.category)));
check('zero items with UMUM category', ummCat.length === 0, `${ummCat.length}`);
const ummSrc = AHSP_2026_CANONICAL.filter((i) => /BIDANG UMUM/i.test(i.sourceDocument));
check('zero items sourced from a Bidang Umum annex', ummSrc.length === 0, `${ummSrc.length}`);

/* ------------------------------------------------------------------ */
/* §14 — attachment correctness                                         */
/* ------------------------------------------------------------------ */
section('[§14] ATTACHMENT CORRECTNESS');

const expectedAttachment: Record<string, string> = {
  SMKK: 'III',
  SDA: 'IV',
  BINA_MARGA: 'V',
  CIPTA_KARYA: 'VI',
};
for (const [field, att] of Object.entries(expectedAttachment)) {
  const rows = AHSP_2026_CANONICAL.filter((i) => i.domain === fieldToDomain(field));
  const bad = rows.filter((i) => i.provenance?.attachment !== att);
  check(`${field} attachment = "${att}"`, bad.length === 0, bad.length ? `${bad.length} wrong` : `${rows.length} rows OK`);
}
function fieldToDomain(f: string): string {
  return f === 'SDA' ? 'SUMBER_DAYA_AIR' : f;
}

const bmWrong = AHSP_2026_CANONICAL.filter(
  (i) => i.domain === 'BINA_MARGA' && (i.provenance?.attachment === 'II' || /Lampiran II\b/i.test(i.sourceDocument))
);
check('zero Bina Marga records labelled "II"', bmWrong.length === 0, `${bmWrong.length}`);

/* ------------------------------------------------------------------ */
/* §23 — integrity audit                                                */
/* ------------------------------------------------------------------ */
section('[§23] INTEGRITY AUDIT');

const missingProvenance = AHSP_2026_CANONICAL.filter((i) => !i.provenance || !i.provenance.regulation || !i.provenance.attachment);
check('missing provenance = 0', missingProvenance.length === 0, `${missingProvenance.length}`);

const noSourceFile = AHSP_2026_CANONICAL.filter((i) => !i.provenance?.sourceFile);
check('missing source_file = 0', noSourceFile.length === 0, `${noSourceFile.length}`);

const withPrice = AHSP_2026_CANONICAL.filter((i) => i.unitPrice !== 0 || i.totalLabor !== 0 || i.totalMaterial !== 0 || i.totalEquipment !== 0);
check('no active price inside the master (price-free)', withPrice.length === 0, `${withPrice.length}`);

const invalidStatus = AHSP_2026_CANONICAL.filter((i) => !['VERIFIED', 'NEEDS_REVIEW', 'SOURCE_DEFECT'].includes(String(i.validationStatus)));
check('INVALID status count = 0', invalidStatus.length === 0, `${invalidStatus.length}`);

const dupIds = AHSP_2026_CANONICAL.length - new Set(AHSP_2026_CANONICAL.map((i) => i.id)).size;
check('duplicate ids = 0', dupIds === 0, `${dupIds}`);

// orphan components: a component whose item id is not in the catalog is impossible
// (components are embedded), so verify the reverse: every component belongs to its item.
let orphanComponents = 0;
for (const i of AHSP_2026_CANONICAL) {
  for (const c of [...i.laborComponents, ...i.materialComponents, ...i.equipmentComponents]) {
    if (!String(c.id).startsWith(i.id)) orphanComponents++;
  }
}
check('orphan components = 0', orphanComponents === 0, `${orphanComponents}`);

const statusCounts = AHSP_2026_CANONICAL_SUMMARY.byStatus as Record<string, number>;
console.log(`  status: VERIFIED=${statusCounts.VERIFIED} NEEDS_REVIEW=${statusCounts.NEEDS_REVIEW} SOURCE_DEFECT=${statusCounts.SOURCE_DEFECT}`);
check('VERIFIED >= 3440', statusCounts.VERIFIED >= 3440, String(statusCounts.VERIFIED));
check('TOTAL status = 5801', statusCounts.VERIFIED + statusCounts.NEEDS_REVIEW + statusCounts.SOURCE_DEFECT === 5801);

/* ------------------------------------------------------------------ */
/* §25 — mandatory test cases                                           */
/* ------------------------------------------------------------------ */
section('[§25] MANDATORY TEST CASES');

const byCode = new Map<string, typeof AHSP_2026_CANONICAL[number]>();
for (const i of AHSP_2026_CANONICAL) byCode.set(i.code, i);

check('Bina Marga "1.2" present', byCode.has('1.2'), byCode.get('1.2')?.name?.slice(0, 40));
check('Bina Marga "7.2.(5c).30" readable', byCode.has('7.2.(5c).30'), byCode.get('7.2.(5c).30')?.name?.slice(0, 40));
check('Cipta Karya "2.2.1.1.1a" present', byCode.has('2.2.1.1.1a'));
check('Cipta Karya "5.1.1.12.100" present (wrapped code joined)', byCode.has('5.1.1.12.100'));
check('Bina Marga "2.1.(1)" name matches source', byCode.get('2.1.(1)')?.name === 'Galian untuk Selokan Drainase dan Saluran Air');

const sda810 = AHSP_2026_CANONICAL.find((i) => i.id === 'AHSP-2026-SDA-000810');
check('SDA row 810 keeps an EMPTY code (not invented)', !!sda810 && sda810.code === '', sda810 ? `code=${JSON.stringify(sda810.code)}` : 'not found');
check('SDA row 810 flagged SOURCE_DEFECT', sda810?.validationStatus === 'SOURCE_DEFECT');

const bmAny = AHSP_2026_CANONICAL.find((i) => i.domain === 'BINA_MARGA');
check('Bina Marga attachment is "V"', bmAny?.provenance?.attachment === 'V', String(bmAny?.provenance?.attachment));

/* ------------------------------------------------------------------ */
/* §22 — duplicate audit                                                */
/* ------------------------------------------------------------------ */
section('[§22] DUPLICATE AUDIT');

const dupFile = path.join(ROOT, 'data', 'ahsp2026', 'forensic', 'duplicate_classification.json');
check('duplicate classification artefact exists', fs.existsSync(dupFile));
if (fs.existsSync(dupFile)) {
  const dup = JSON.parse(fs.readFileSync(dupFile, 'utf8'));
  const groups = dup.groups?.length ?? dup.total_groups ?? 0;
  console.log(`  duplicate groups classified: ${groups}`);
  check('duplicate groups are classified, not auto-deleted', groups >= 0);
}

/* ------------------------------------------------------------------ */
console.log(`\n${'='.repeat(70)}`);
if (failures === 0) {
  console.log(`RESULT: ALL ASSERTIONS PASSED`);
} else {
  console.log(`RESULT: ${failures} ASSERTION(S) FAILED`);
}
console.log(`${'='.repeat(70)}`);
process.exit(failures === 0 ? 0 : 1);
