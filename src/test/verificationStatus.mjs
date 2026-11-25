/**
 * EZRAB FASE 5C TASK 3 — Verification status test (src/test/verificationStatus.mjs)
 *
 * Proves that AI-generated / imported items are NOT auto-marked VERIFIED.
 * Only items from verified sources (official AHSP 2026 DB) may carry VERIFIED.
 *
 * Fast Track H-02 (2026-11-24) — REWRITE: file ini sebelumnya VACUOUS —
 * stub lokal mengembalikan string hardcoded dan suite meng-assert stub itu
 * sendiri, tanpa mengimpor satu pun modul sumber. V4-nya ("manual priced
 * items -> NEEDS_VERIFICATION") lolos sementara factory nyata mengembalikan
 * VERIFIED untuk input yang persis sama. Kini suite mengimpor modul NYATA
 * (pola bundle esbuild yang sama dengan dataIntegrityHotfix.mjs) dan
 * meng-assert OUTPUT NYATA:
 *   - createRabItemRecord (factory RAB — jalur tulis resmi)
 *   - mapDedAiItemToRabInput (mapper finalisasi DED -> RAB)
 *   - UnifiedProjectEngine.normalizeSections (rekonstruksi seksi ekspor)
 *
 * Run: node src/test/verificationStatus.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const P = process.cwd();
const entry = `
import { createRabItemRecord } from '${P}/src/engine/rab/rabItemFactory.ts';
import { mapDedAiItemToRabInput } from '${P}/src/ai-tools/ded-ai-estimate/finalizeMapping.ts';
import { UnifiedProjectEngine } from '${P}/src/engine/unifiedProjectEngine.ts';
export { createRabItemRecord, mapDedAiItemToRabInput, UnifiedProjectEngine };
`;
mkdirSync(`${P}/.tmp_test`, { recursive: true });
writeFileSync(`${P}/.tmp_test/_vs_entry.mjs`, entry);
buildSync({
  entryPoints: [`${P}/.tmp_test/_vs_entry.mjs`],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: `${P}/.tmp_test/_vs_bundle.mjs`,
  absWorkingDir: P,
});
const { createRabItemRecord, mapDedAiItemToRabInput, UnifiedProjectEngine } =
  await import(pathToFileURL(`${P}/.tmp_test/_vs_bundle.mjs`).href);

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const PID = 'proj-vs';

// DED AI item shape (mkItem preseden sprint31AhspPolicy.src.ts).
function mkDedItem(p) {
  return {
    id: 'vs-1', name: 'Pekerjaan uji', category: 'Umum', units: 'm2',
    quantity: 10, quantitySource: 'AI_ESTIMATE', unitPrice: 50000,
    priceSource: 'AI_ESTIMATE', subtotal: 500000, sourcePages: [1],
    provenance: [], stage: 'PARSE', ...p,
  };
}

console.log('VERIFICATION STATUS (real modules)');

// V1/V2 — DED AI items via the REAL finalize mapper + factory (dulu: stub).
const dedMapped = mapDedAiItemToRabInput(mkDedItem({}), 'DATABASE');
check('V1 DED AI item (mapper nyata, AI_ESTIMATE) -> NEEDS_VERIFICATION',
  dedMapped !== null && dedMapped.verificationStatus === 'NEEDS_VERIFICATION',
  String(dedMapped && dedMapped.verificationStatus));
check('V1b DED AI item (mapper nyata) -> PRICE_ESTIMATED',
  dedMapped !== null && dedMapped.priceStatus === 'PRICE_ESTIMATED',
  String(dedMapped && dedMapped.priceStatus));
const dedRec = dedMapped ? createRabItemRecord({ ...dedMapped }, PID, {}) : null;
check('V2 DED AI item lewat factory nyata tetap NEEDS_VERIFICATION (never VERIFIED)',
  dedRec !== null && dedRec.verificationStatus === 'NEEDS_VERIFICATION',
  String(dedRec && dedRec.verificationStatus));

// V3 — AHSP official: jalur yang disengaja tetap VERIFIED (factory nyata,
// kode kanonis 3.7.4 + klaim VERIFIED eksplisit + OFFICIAL_AHSP).
const official = createRabItemRecord(
  { description: 'Plesteran dinding', volume: 1, unit: 'm2', unitPrice: 999999,
    ahspCode: '3.7.4', verificationStatus: 'VERIFIED', priceSourceKind: 'OFFICIAL_AHSP' },
  PID, {});
check('V3 AHSP official items -> VERIFIED (legitimate source, explicit claim)',
  official.verificationStatus === 'VERIFIED', String(official.verificationStatus));

// V4 — H-01: manual priced items -> NEEDS_VERIFICATION (kontrak baru;
// factory lama mengembalikan VERIFIED untuk input ini — itulah yang
// membuat suite stub lama berbahaya).
const manual = createRabItemRecord(
  { description: 'Pekerjaan manual pengguna', volume: 2, unit: 'ls',
    unitPrice: 150000, priceStatus: 'PRICE_MANUAL' },
  PID, {});
check('V4 manual priced items -> NEEDS_VERIFICATION (H-01)',
  manual.verificationStatus === 'NEEDS_VERIFICATION', String(manual.verificationStatus));

// V5 — manual unpriced -> NEEDS_VERIFICATION.
const manualUnpriced = createRabItemRecord(
  { description: 'Pekerjaan manual pengguna', volume: 2, unit: 'ls', unitPrice: null },
  PID, {});
check('V5 manual unpriced items -> NEEDS_VERIFICATION',
  manualUnpriced.verificationStatus === 'NEEDS_VERIFICATION',
  String(manualUnpriced.verificationStatus));

// V6 — H-01 sharpest instance: AHSP custom user (domain CUSTOM di
// SmartAddWorkItemModal) — harga ketikan user + PRICE_MANUAL eksplisit.
const customAhsp = createRabItemRecord(
  { description: 'Pemasangan ornamen fasad kustom', volume: 3, unit: 'unit',
    unitPrice: 250000, priceStatus: 'PRICE_MANUAL', code: 'CUST-01',
    priceSourceKind: 'USER_MANUAL', priceSourceLabel: 'Input User' },
  PID, {});
check('V6 custom-AHSP manual price -> NEEDS_VERIFICATION (never VERIFIED)',
  customAhsp.verificationStatus === 'NEEDS_VERIFICATION',
  String(customAhsp.verificationStatus));
check('V6b custom-AHSP manual price dipertahankan (harga & amount tidak diubah)',
  customAhsp.unitPrice === 250000 && customAhsp.amount === 750000,
  `${customAhsp.unitPrice}/${customAhsp.amount}`);

// V7 — PRICE_ESTIMATED tanpa status -> NEEDS_VERIFICATION (paritas dengan
// kontrak lapisan transfer transferVerificationStatus).
const estimated = createRabItemRecord(
  { description: 'Estimasi AI', volume: 10, unit: 'm3',
    unitPrice: 75000, priceStatus: 'PRICE_ESTIMATED' },
  PID, {});
check('V7 estimated-price items -> NEEDS_VERIFICATION (H-01, transfer parity)',
  estimated.verificationStatus === 'NEEDS_VERIFICATION',
  String(estimated.verificationStatus));

// V8 — H-08: rekonstruksi seksi (normalizeSections) — item PRICE_MANUAL
// warisan tanpa status -> NEEDS_VERIFICATION di seksi ekspor.
const sections = UnifiedProjectEngine.normalizeSections(
  { id: PID },
  [{ description: 'Item warisan manual', volume: 2, unit: 'ls', unitPrice: 150000,
     priceStatus: 'PRICE_MANUAL', category: '01. PEKERJAAN PERSIAPAN' }],
);
const recon = sections[0] && sections[0].items[0];
check('V8 reconstructed PRICE_MANUAL item (no status) -> NEEDS_VERIFICATION (H-08)',
  recon !== undefined && recon.verificationStatus === 'NEEDS_VERIFICATION',
  String(recon && recon.verificationStatus));

// V9 — batas scope H-01: klaim VERIFIED EKSPLISIT tetap dihormati factory
// (yang berubah hanya DEFAULT saat pemanggil tidak mengisi status).
const explicitVerified = createRabItemRecord(
  { description: 'Pekerjaan manual pengguna', volume: 2, unit: 'ls',
    unitPrice: 150000, priceStatus: 'PRICE_MANUAL', verificationStatus: 'VERIFIED' },
  PID, {});
check('V9 explicit VERIFIED on manual price is honored (only the default changed)',
  explicitVerified.verificationStatus === 'VERIFIED',
  String(explicitVerified.verificationStatus));

// V10 — enum contract atas output NYATA.
const validStatuses = ['AI_GENERATED', 'NEEDS_VERIFICATION', 'VERIFIED'];
check('V10 all real outputs in enum',
  [dedRec, official, manual, manualUnpriced, customAhsp, estimated, recon, explicitVerified]
    .every((r) => r && validStatuses.includes(r.verificationStatus)));

// V11 — SISA (keputusan owner, SENGAJA tidak diubah H-01): item
// PRICE_RESOLVED tanpa status eksplisit tetap default VERIFIED. Pin ini
// mendokumentasikan perilaku saat ini — BUKAN persetujuan atasnya; ubah
// hanya atas keputusan owner.
const resolvedDefault = createRabItemRecord(
  { description: 'Item harga resolved tanpa klaim status', volume: 1, unit: 'ls',
    unitPrice: 100000, priceStatus: 'PRICE_RESOLVED' },
  PID, {});
check('V11 PRICE_RESOLVED without explicit status still defaults VERIFIED (owner decision pending)',
  resolvedDefault.verificationStatus === 'VERIFIED',
  String(resolvedDefault.verificationStatus));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
