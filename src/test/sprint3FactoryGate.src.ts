/**
 * SPRINT 3 — Workstream G1: gerbang eksistensi AHSP kanonis di factory RAB.
 *
 * Menutup temuan Sprint 2 (sprint2Integrity S1 FINDING): createRabItemRecord
 * sebelumnya menilai kode karangan '9.9.9.9' sebagai identity SAFE dan
 * mempertahankan klaim VERIFIED, karena checkAhspIdentitySafety hanya
 * menolak artefak parsing dan tidak pernah memeriksa keberadaan kode di
 * katalog. Kini factory juga memverifikasi keberadaan kode lewat
 * canonicalAhspCodeExists -> officialAhspRepository.hasOfficialAhsp
 * (gerbang §14 yang sama dengan gerbang harga kanonis DED).
 *
 * Setup yang diverifikasi lewat lookup itu sendiri (probe 2026-11-01):
 * - '3.7.4'   -> hasOfficialAhsp = true  (plesteran 1SP:4PP, kode kanonis nyata)
 * - '9.9.9.9' -> hasOfficialAhsp = false (karangan)
 * - '3.7.4.1' -> hasOfficialAhsp = false (format persis keluarga 3.7.x nyata,
 *                tetapi kode ini TIDAK ada — keluarga katalog berhenti di
 *                sub-kode dua segmen terakhir .16 untuk 3.7.x)
 *
 * Run: esbuild bundle lalu node, seperti suite .src.ts lain.
 */
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import {
  checkAhspIdentitySafety,
  canonicalAhspCodeExists,
} from '../data/priceDatabase2026/ahspDisplayPolicy';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const base = { description: 'Plesteran dinding', volume: 1, unit: 'm2', unitPrice: 999999 };

// =====================================================================
console.log('=== G1-0: prasyarat katalog (sumber kebenaran tunggal) ===');
check('validator sependapat dengan repository: 3.7.4 ada',
  canonicalAhspCodeExists('3.7.4') === true && officialAhspRepository.hasOfficialAhsp('3.7.4') === true);
check('validator: 9.9.9.9 tidak ada di katalog kanonis', canonicalAhspCodeExists('9.9.9.9') === false);
check('validator: 3.7.4.1 (format nyata, kode tidak ada) -> false', canonicalAhspCodeExists('3.7.4.1') === false);
check('validator: kode kosong/null -> false (bukan error)',
  canonicalAhspCodeExists('') === false && canonicalAhspCodeExists(null) === false && canonicalAhspCodeExists(undefined) === false);
check('semantik checkAhspIdentitySafety TIDAK berubah: A.1.1 tetap lolos cek parsing',
  checkAhspIdentitySafety({ code: 'A.1.1', name: 'Pekerjaan galian tanah biasa' }).safe === true);
check('tetapi A.1.1 BUKAN kode kanonis 2026 (warisan 2022)', canonicalAhspCodeExists('A.1.1') === false);

// =====================================================================
console.log('=== G1-1: kode palsu 9.9.9.9 + klaim VERIFIED (kasus Sprint 2) ===');
const hostile = createRabItemRecord(
  { ...base, ahspCode: '9.9.9.9', verificationStatus: 'VERIFIED' } as never, 'proj-s3', {});
check('kode palsu: ahspIdentityStatus UNSAFE (bukan SAFE)',
  (hostile as any).ahspIdentityStatus === 'UNSAFE', String((hostile as any).ahspIdentityStatus));
check('kode palsu: alasan menyebut tidak ditemukan di katalog',
  String((hostile as any).ahspIdentityReason || '').includes('tidak ditemukan di katalog AHSP kanonis'));
check('kode palsu: verificationStatus diturunkan ke NEEDS_VERIFICATION',
  hostile.verificationStatus === 'NEEDS_VERIFICATION', String(hostile.verificationStatus));
check('kode palsu: kode asli dipertahankan sebagai klaim (data tidak dihapus)',
  hostile.ahspCode === '9.9.9.9');
check('kode palsu: harga & amount pemanggil tidak diubah (sumbu harga independen)',
  hostile.unitPrice === 999999 && hostile.amount === 999999);

// =====================================================================
console.log('=== G1-2: kode berformat nyata tetapi tidak ada (3.7.4.1) ===');
const plausible = createRabItemRecord(
  { ...base, ahspCode: '3.7.4.1', verificationStatus: 'VERIFIED' } as never, 'proj-s3', {});
check('kode plausible-fake: UNSAFE', (plausible as any).ahspIdentityStatus === 'UNSAFE');
check('kode plausible-fake: VERIFIED diturunkan', plausible.verificationStatus === 'NEEDS_VERIFICATION');
// Tanpa klaim eksplisit pun default VERIFIED (harga resolved) tidak boleh lolos:
const plausibleDefault = createRabItemRecord(
  { ...base, ahspCode: '3.7.4.1' } as never, 'proj-s3', {});
check('kode plausible-fake tanpa klaim: default VERIFIED ikut diturunkan',
  plausibleDefault.verificationStatus === 'NEEDS_VERIFICATION', String(plausibleDefault.verificationStatus));
check('kode plausible-fake tanpa klaim: UNSAFE', (plausibleDefault as any).ahspIdentityStatus === 'UNSAFE');
// Status non-VERIFIED tidak disentuh oleh penurunan:
const plausibleAi = createRabItemRecord(
  { ...base, ahspCode: '3.7.4.1', verificationStatus: 'AI_GENERATED' } as never, 'proj-s3', {});
check('kode plausible-fake + AI_GENERATED: status non-VERIFIED dipertahankan',
  plausibleAi.verificationStatus === 'AI_GENERATED', String(plausibleAi.verificationStatus));

// =====================================================================
console.log('=== G1-3: kode kanonis nyata 3.7.4 — kendali positif ===');
const canon = createRabItemRecord(
  { ...base, ahspCode: '3.7.4', verificationStatus: 'VERIFIED', priceSourceKind: 'OFFICIAL_AHSP' } as never,
  'proj-s3', {});
check('kode kanonis: identity SAFE', (canon as any).ahspIdentityStatus === 'SAFE');
check('kode kanonis: tanpa alasan ketidakamanan', !(canon as any).ahspIdentityReason);
check('kode kanonis: VERIFIED bertahan', canon.verificationStatus === 'VERIFIED');
check('kode kanonis: OFFICIAL_AHSP bertahan', (canon as any).priceSourceKind === 'OFFICIAL_AHSP');

// =====================================================================
console.log('=== G1-4: item manual tanpa kode AHSP — kompatibilitas penuh ===');
const manual = createRabItemRecord(
  { description: 'Pekerjaan manual pengguna', volume: 2, unit: 'ls', unitPrice: 150000 } as never,
  'proj-s3', {});
check('tanpa kode: tidak ada flag identitas (backward compat)',
  (manual as any).ahspIdentityStatus === undefined);
check('tanpa kode: VERIFIED default harga-resolved tidak berubah',
  manual.verificationStatus === 'VERIFIED');
check('tanpa kode: amount normal 300.000', manual.amount === 300000, String(manual.amount));
const manualEmpty = createRabItemRecord(
  { description: 'Pekerjaan manual pengguna', volume: 2, unit: 'ls', unitPrice: 150000, ahspCode: '' } as never,
  'proj-s3', {});
check('kode string kosong diperlakukan sama dengan tanpa kode',
  (manualEmpty as any).ahspIdentityStatus === undefined && manualEmpty.verificationStatus === 'VERIFIED');

// =====================================================================
console.log('=== G1-5: klaim harga resmi atas identitas tak dikenal dicabut ===');
const fakeOfficial = createRabItemRecord(
  { ...base, ahspCode: '9.9.9.9', verificationStatus: 'VERIFIED', priceSourceKind: 'OFFICIAL_AHSP' } as never,
  'proj-s3', {});
check('kode palsu + OFFICIAL_AHSP: kind diturunkan ke UNRESOLVED',
  (fakeOfficial as any).priceSourceKind === 'UNRESOLVED', String((fakeOfficial as any).priceSourceKind));
check('kode palsu + OFFICIAL_AHSP: record tetap UNSAFE + NEEDS_VERIFICATION',
  (fakeOfficial as any).ahspIdentityStatus === 'UNSAFE' && fakeOfficial.verificationStatus === 'NEEDS_VERIFICATION');
const codelessOfficial = createRabItemRecord(
  { ...base, priceSourceKind: 'OFFICIAL_AHSP' } as never, 'proj-s3', {});
check('REGRESI Keputusan B (Sprint 3.1; dulu: provenance diteruskan sebagai celah tersisa G1): ' +
  'tanpa kode + OFFICIAL_AHSP -> kind UNRESOLVED, identitas TIDAK ditandai UNSAFE (ketiadaan kode bukan kepalsuan)',
  (codelessOfficial as any).priceSourceKind === 'UNRESOLVED' &&
  (codelessOfficial as any).ahspIdentityStatus === undefined, String((codelessOfficial as any).priceSourceKind));
const fakeAssumption = createRabItemRecord(
  { ...base, ahspCode: '9.9.9.9', priceSourceKind: 'EZRAB_ASSUMPTION' } as never, 'proj-s3', {});
check('kode palsu + kind non-resmi (EZRAB_ASSUMPTION): kind tidak disentuh',
  (fakeAssumption as any).priceSourceKind === 'EZRAB_ASSUMPTION');

// =====================================================================
console.log('=== G1-6: artefak parsing tetap UNSAFE lewat jalur lama ===');
const artifact = createRabItemRecord(
  { description: 'USGPM', volume: 10, unit: 'm3', unitPrice: 50000, ahspCode: '1.000' } as never,
  'proj-s3', {});
check('artefak 1.000: UNSAFE dengan alasan artefak parsing',
  (artifact as any).ahspIdentityStatus === 'UNSAFE' &&
  String((artifact as any).ahspIdentityReason || '').includes('artefak'));

console.log(`\n=== HASIL SPRINT 3 FACTORY GATE: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
