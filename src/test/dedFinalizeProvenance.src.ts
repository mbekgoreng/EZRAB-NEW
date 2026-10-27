/**
 * DED-to-RAB — Finalization Provenance Tests (temuan audit P0 2026-10-27)
 * Mengunci: provenance finalisasi bertahan ke baris RAB spreadsheet dan
 * harga estimasi AI TIDAK PERNAH ditandai VERIFIED seolah kanonis.
 * Menguji helper pemetaan murni + factory (bukan komponen React — tidak
 * ada infra UI test di repo ini; handler view.tsx hanya memanggil helper).
 */
import { mapDedAiItemToRabInput, mapFullAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}`); }
}

const stdBase = {
  id: 'dedai-1', name: 'Plesteran', category: 'Dinding', units: 'm2',
  quantitySource: 'DED_GEOMETRIC', subtotal: null, sourcePages: [1],
  provenance: [], stage: 'CALCULATED',
} as const;
const stdCanon = {
  ...stdBase, quantity: 10, unitPrice: 51622, priceSource: 'AHSP_2026',
  ahspCode: '3.7.4', priceAssumptionNote: 'AHSP kanonis 3.7.4 (SE 47/2026, biaya langsung)',
} as unknown as DedAiItem;
const stdFallback = {
  ...stdBase, quantity: 5, unitPrice: 850000, priceSource: 'AI_ESTIMATE',
  priceAssumptionNote: 'Estimasi AI — tidak ditemukan di database AHSP EZRAB: NO_MATCH (perkiraan, bukan harga database).',
  ahspMatch: { status: 'NEEDS_REVIEW', reason: 'x' },
} as unknown as DedAiItem;
const stdManual = {
  ...stdBase, quantity: 2, unitPrice: 100000, priceSource: 'USER_INPUT',
} as unknown as DedAiItem;
const stdUnresolved = {
  ...stdBase, quantity: 3, unitPrice: null, priceSource: 'UNRESOLVED',
} as unknown as DedAiItem;

console.log('=== DED Finalize Provenance (standard) ===');
const mCanon = mapDedAiItemToRabInput(stdCanon, 'DATABASE');
check('standar kanonis: kind OFFICIAL_AHSP', mCanon?.priceSourceKind === 'OFFICIAL_AHSP');
check('standar kanonis: kode AHSP dipertahankan', mCanon?.ahspCode === '3.7.4');
check('standar kanonis: verification VERIFIED', mCanon?.verificationStatus === 'VERIFIED');
check('standar kanonis: label kanonis', (mCanon?.priceSourceLabel || '').includes('AHSP Kanonis'));

const mFall = mapDedAiItemToRabInput(stdFallback, 'DATABASE');
check('standar fallback: kind EZRAB_ASSUMPTION (bukan OFFICIAL)', mFall?.priceSourceKind === 'EZRAB_ASSUMPTION');
check('standar fallback: label Estimasi AI', mFall?.priceSourceLabel === 'Estimasi AI');
check('standar fallback: TIDAK VERIFIED', mFall?.verificationStatus === 'NEEDS_VERIFICATION');
check('standar fallback: tanpa kode AHSP meski ada ahspMatch review', mFall?.ahspCode === undefined);
check('standar fallback: penjelasan menyebut bukan harga database', (mFall?.priceSourceExplanation || '').includes('bukan harga database'));

const mMan = mapDedAiItemToRabInput(stdManual, 'DATABASE');
check('standar manual: label Input User', mMan?.priceSourceLabel === 'Input User');
check('standar manual: TIDAK VERIFIED', mMan?.verificationStatus === 'NEEDS_VERIFICATION');
check('standar manual: tanpa kode AHSP', mMan?.ahspCode === undefined);

check('standar unresolved: tidak jadi baris', mapDedAiItemToRabInput(stdUnresolved, 'DATABASE') === null);

// Factory: metadata helper harus bertahan menjadi RabItem (dulu `notes` dibuang).
const recFall = createRabItemRecord(mFall as never, 'proj-1', {});
check('factory fallback: kind bertahan', (recFall as any).priceSourceKind === 'EZRAB_ASSUMPTION');
check('factory fallback: label bertahan', (recFall as any).priceSourceLabel === 'Estimasi AI');
check('factory fallback: explanation bertahan', ((recFall as any).priceSourceExplanation || '').includes('bukan harga database'));
check('factory fallback: verification BUKAN VERIFIED', (recFall as any).verificationStatus === 'NEEDS_VERIFICATION');
const recCanon = createRabItemRecord(mCanon as never, 'proj-1', {});
check('factory kanonis: kind + kode + VERIFIED bertahan', (recCanon as any).priceSourceKind === 'OFFICIAL_AHSP' && (recCanon as any).ahspCode === '3.7.4' && (recCanon as any).verificationStatus === 'VERIFIED');

console.log('=== DED Finalize Provenance (Full AI) ===');
const fullBase = {
  id: 'fullai-1', no: 1, name: 'Kolom Praktis', category: 'Struktur',
  subtotal: 100000, subtotalVerified: true, status: 'READY', exclusionReason: null,
} as const;
const fullCanon = {
  ...fullBase,
  quantity: { value: 2, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 4500000, unit: 'm3', source: 'AHSP_2026', region: 'Nasional', period: '2026', ahspCode: '2.2.1.4.1', notes: 'AHSP kanonis 2.2.1.4.1' },
} as unknown as FullAiItem;
const fullFall = {
  ...fullBase,
  quantity: { value: 2, unit: 'm3', provenance: 'ASSUMPTION', confidence: 'MEDIUM' },
  price: { unitPrice: 4000000, unit: 'm3', source: 'AI_ESTIMATE', region: 'Jakarta', period: '2026', notes: 'Estimasi AI — tidak ditemukan di database AHSP EZRAB: NO_MATCH (perkiraan, bukan harga database).', ahspMatch: { status: 'NEEDS_REVIEW', reason: 'x' } },
} as unknown as FullAiItem;
const fullMan = {
  ...fullBase,
  quantity: { value: 1, unit: 'm3', provenance: 'USER_INPUT', confidence: 'HIGH' },
  price: { unitPrice: 3000000, unit: 'm3', source: 'USER_INPUT', notes: 'x [Diedit user: harga asli 4000000 (AI_ESTIMATE)]' },
} as unknown as FullAiItem;
const fullLegacy = {
  ...fullBase,
  quantity: { value: 1, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 2000000, unit: 'm3', source: 'VERIFIED_SOURCE' },
} as unknown as FullAiItem;

const fCanon = mapFullAiItemToRabInput(fullCanon, 'DATABASE');
check('fullai kanonis: OFFICIAL + kode + VERIFIED', fCanon?.priceSourceKind === 'OFFICIAL_AHSP' && fCanon?.ahspCode === '2.2.1.4.1' && fCanon?.verificationStatus === 'VERIFIED');
const fFall = mapFullAiItemToRabInput(fullFall, 'DATABASE');
check('fullai fallback: Estimasi AI + NEEDS_VERIFICATION + tanpa kode', fFall?.priceSourceLabel === 'Estimasi AI' && fFall?.verificationStatus === 'NEEDS_VERIFICATION' && fFall?.ahspCode === undefined);
const fMan = mapFullAiItemToRabInput(fullMan, 'FULL_AI');
check('fullai manual: Input User + NEEDS_VERIFICATION', fMan?.priceSourceLabel === 'Input User' && fMan?.verificationStatus === 'NEEDS_VERIFICATION');
const fLeg = mapFullAiItemToRabInput(fullLegacy, 'DATABASE');
check('fullai warisan VERIFIED_SOURCE: label netral + NEEDS_VERIFICATION + tanpa kode', (fLeg?.priceSourceLabel || '').includes('Belum terverifikasi') && fLeg?.verificationStatus === 'NEEDS_VERIFICATION' && fLeg?.ahspCode === undefined);
const recFFall = createRabItemRecord(fFall as never, 'proj-1', {});
check('factory fullai fallback: label + NEEDS_VERIFICATION bertahan', (recFFall as any).priceSourceLabel === 'Estimasi AI' && (recFFall as any).verificationStatus === 'NEEDS_VERIFICATION');

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
