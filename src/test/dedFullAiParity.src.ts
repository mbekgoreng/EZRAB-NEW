/**
 * REGRESI PARITAS DED FULL AI — Sprint 4 (Tugas B).
 *
 * Run: npx esbuild src/test/dedFullAiParity.src.ts --bundle --platform=node
 *      --format=cjs --outfile=~/workspace/.ded-sprint4-bundles/dedFullAiParity.cjs
 *      && node ~/workspace/.ded-sprint4-bundles/dedFullAiParity.cjs
 *
 * Mencakup sisa paritas dari laporan Hardening Bagian F / I-P2-1 & I-P2-6:
 * - Harga: isian referensi eksternal Full AI membawa blok DedPriceCompletion
 *   TERSTRUKTUR yang sama dengan pipeline standar (klasifikasi, sourceKind
 *   via priceSourceKindFor — pasar kontraktor → MARKET_REFERENCE, supplier →
 *   VERIFIED_SUPPLIER — sumber/URL/tanggal/wilayah/cakupan, status
 *   verifikasi, penanda basi, harga asli/usulan, riwayat).
 * - Konflik spesifikasi material ditolak setara standar lewat helper
 *   bersama (findExternalReference + findConflictingReference): harga
 *   tetap kosong + blok NEEDS_VERIFICATION, bukan terisi diam-diam.
 * - Kuantitas: isian completeFullAiQuantities berklasifikasi 8 kelas
 *   bersama (DedQuantityClass) + audit lengkap; isian konteks SELALU
 *   ESTIMATED_FROM_CONTEXT, tidak pernah DRAWING_EXTRACTED; nol
 *   eksplisit tidak diisi.
 * - Persetujuan tercatat: Terima → APPROVED tanpa mengubah status
 *   verifikasi/sumber; Tolak memulihkan nilai asli & mencabut blok.
 * - Validator: penegakan metadata aman (peringatan) — pita kewajaran
 *   harga bersama, klaim AHSP tanpa kode, fragmen kuantitas bersama,
 *   konsistensi blok terstruktur & konflik blok.
 */
import {
  completeFullAiPrices, completeFullAiQuantities,
  acceptFullAiCompletion, rejectFullAiCompletion,
  buildFullAiPriceCompletion,
} from '../ai-tools/ded-full-ai/service';
import {
  validateFullAiItem, validateQuantityDetail,
} from '../ai-tools/ded-full-ai/validator';
import {
  EXTERNAL_PRICE_REFERENCES, findExternalReference,
} from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-11-10T00:00:00Z');

const mk = (over: Partial<FullAiItem>): FullAiItem => ({
  id: 'p', no: 1, name: 'Item', category: 'Uji',
  quantity: { value: 10, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
  price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
  subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_UNIT_PRICE',
  ...over,
} as FullAiItem);

// ===========================================================================
// A. Blok penyelesaian harga terstruktur
// ===========================================================================
console.log('== A. Blok DedPriceCompletion terstruktur ==');
{
  const items = [mk({
    id: 'a1', name: 'Rangka Atap Baja Ringan',
    quantity: { value: 90, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
  })];
  const filled = completeFullAiPrices(items, { now: NOW });
  const it = items[0];
  const pc = it.price.priceCompletion;
  check('A1 harga terisi dari referensi + penanda lama dipertahankan',
    filled === 1 && it.price.unitPrice === 165000 && it.price.filledFromExternalRef === true
    && it.status === 'READY' && it.subtotal === 90 * 165000);
  check('A2 blok terstruktur lengkap (sumber, URL, tanggal, wilayah, cakupan, rentang)',
    pc != null
    && pc.sourceName?.includes('homeX') === true
    && pc.sourceUrl === 'https://www.homex.co.id'
    && pc.sourceDate === '2026-10-22' && pc.accessedAt === '2026-11-10'
    && pc.region === 'Nasional (Jawa)' && pc.scope === 'TERPASANG_PENUH'
    && pc.rangeMin === 150000 && pc.rangeMax === 175000
    && typeof pc.specAssumption === 'string' && pc.specAssumption.length > 0
    && Array.isArray(pc.history),
    JSON.stringify(pc));
  check('A3 klasifikasi & status: MARKET_REFERENCE + UNVERIFIED + PENDING + harga asli tercatat',
    pc?.classification === 'MARKET_REFERENCE' && pc?.sourceKind === 'MARKET_REFERENCE'
    && pc?.verificationStatus === 'UNVERIFIED' && pc?.userApprovalStatus === 'PENDING'
    && pc?.recommendedPrice === 165000 && pc?.originalUnitPrice === null
    && pc?.referenceId === 'ext-rangka-baja-ringan' && !pc?.sourceStale);
  check('A4 cerminan item-level sama dengan blok bersarang; sumber item tetap AI_ESTIMATE (bukan AHSP)',
    it.priceCompletion === pc && it.price.source === 'AI_ESTIMATE' && it.price.ahspCode === undefined);
}
{
  const items = [mk({
    id: 'a2', name: 'Pintu Double P1',
    quantity: { value: 2, unit: 'unit', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: 'unit', source: 'UNRESOLVED' },
  })];
  completeFullAiPrices(items, { now: NOW });
  const pc = items[0].price.priceCompletion;
  check('A5 tier supplier/manufaktur → sourceKind VERIFIED_SUPPLIER (pemetaan standar)',
    items[0].price.unitPrice === 3500000 && pc?.classification === 'MARKET_REFERENCE'
    && pc?.sourceKind === 'VERIFIED_SUPPLIER' && pc?.referenceId === 'ext-pintu-p1-double-hpl');
}
{
  const items = [mk({
    id: 'a3', name: 'Rangka Atap Baja Ringan',
    quantity: { value: 90, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
  })];
  completeFullAiPrices(items, { now: new Date('2027-06-01T00:00:00Z') });
  const pc = items[0].price.priceCompletion;
  check('A6 referensi basi → klasifikasi AI_ESTIMATE + sourceStale + keyakinan LOW',
    pc?.classification === 'AI_ESTIMATE' && pc?.sourceKind === 'AI_ESTIMATE'
    && pc?.sourceStale === true && pc?.confidence === 'LOW');
}
{
  const items = [
    mk({ id: 'a4', name: 'Rangka Atap Baja Ringan', price: { unitPrice: 123456, unit: 'm2', source: 'USER_INPUT' } }),
    mk({ id: 'a5', name: 'Beton K-250', quantity: { value: 5, unit: 'm3', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 950000, unit: 'm3', source: 'AHSP_2026', ahspCode: 'X.1' } }),
  ];
  const filled = completeFullAiPrices(items, { now: NOW });
  check('A7 harga manual & kanonis TIDAK disentuh pass penyelesaian',
    filled === 0 && items[0].price.unitPrice === 123456 && items[0].price.priceCompletion === undefined
    && items[1].price.unitPrice === 950000 && items[1].price.priceCompletion === undefined);
}

// ===========================================================================
// B. Konflik spesifikasi material — setara standar
// ===========================================================================
console.log('== B. Konflik spesifikasi ==');
{
  check('B1 helper bersama menolak pintu kayu untuk referensi aluminium (jalur yang sama dengan standar)',
    findExternalReference('Pintu Double Kayu Kamper P1', 'unit') === null);
  const items = [mk({
    id: 'b1', name: 'Pintu Double Kayu Kamper P1',
    quantity: { value: 1, unit: 'unit', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: 'unit', source: 'UNRESOLVED' },
  })];
  const filled = completeFullAiPrices(items, { now: NOW });
  const pc = items[0].price.priceCompletion;
  check('B2 konflik → harga tetap kosong + blok NEEDS_VERIFICATION terstruktur',
    filled === 0 && items[0].price.unitPrice === null
    && pc?.verificationStatus === 'NEEDS_VERIFICATION' && pc?.classification === 'PRICE_UNRESOLVED'
    && pc?.sourceKind === 'UNRESOLVED' && pc?.referenceId === 'ext-pintu-p1-double-hpl'
    && /ditolak/.test(pc?.method || ''));
  const nok = [mk({
    id: 'b2', name: 'Nok Spandek',
    quantity: { value: 10, unit: "m'", provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: "m'", source: 'UNRESOLVED' },
  })];
  completeFullAiPrices(nok, { now: NOW });
  check('B3 "Nok Spandek" BUKAN konflik genteng — terisi normal',
    nok[0].price.unitPrice === 55000 && nok[0].price.priceCompletion?.classification === 'MARKET_REFERENCE');
}

// ===========================================================================
// C. Audit kuantitas 8 kelas bersama
// ===========================================================================
console.log('== C. Klasifikasi & audit kuantitas ==');
{
  const items: FullAiItem[] = [
    mk({ id: 'c1', name: 'Pemasangan Keramik Lantai 40x40', quantity: { value: 48.5, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' }, subtotal: 4850000, subtotalVerified: true, status: 'READY', exclusionReason: null }),
    mk({ id: 'c2', name: 'Titik Penerangan', quantity: { value: null, unit: 'titik', provenance: 'UNRESOLVED', confidence: 'LOW' }, price: { unitPrice: 185000, unit: 'titik', source: 'AI_ESTIMATE' } }),
    mk({ id: 'c3', name: 'Pekerjaan Opsional Tidak Dilakukan', quantity: { value: 0, unit: 'unit', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 100000, unit: 'unit', source: 'AI_ESTIMATE' } }),
    mk({ id: 'c4', name: 'Pengukuran dan Bouwplank', quantity: { value: 24, unit: "m'", provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 100000, unit: "m'", source: 'AI_ESTIMATE' }, subtotal: 2400000, subtotalVerified: true, status: 'READY', exclusionReason: null }),
    mk({ id: 'c5', name: 'Listplank Kalsiboard 30 cm', quantity: { value: 0.0295, unit: "m'", provenance: 'DERIVED', confidence: 'MEDIUM' }, price: { unitPrice: 65000, unit: "m'", source: 'AI_ESTIMATE' } }),
  ];
  const filled = completeFullAiQuantities(items);
  const qa2 = items[1].quantity.quantityAudit;
  check('C1 isian konteks: nilai 6 + audit ESTIMATED_FROM_CONTEXT lengkap (asli null, PENDING, UNVERIFIED, input konteks)',
    items[1].quantity.value === 6 && qa2?.classification === 'ESTIMATED_FROM_CONTEXT'
    && qa2?.method === 'plan-context-estimate' && qa2?.originalQuantity === null
    && qa2?.proposedQuantity === 6 && qa2?.userApprovalStatus === 'PENDING'
    && qa2?.verificationStatus === 'UNVERIFIED' && typeof qa2?.formula === 'string'
    && qa2 != null && qa2.inputs.some((i) => i.name === 'floorAreaM2' && i.value === 48.5));
  check('C2 isian konteks TIDAK PERNAH DRAWING_EXTRACTED; cerminan item-level sama',
    qa2?.classification !== 'DRAWING_EXTRACTED' && items[1].quantityAudit === qa2);
  check('C3 fakta gambar asli tetap DRAWING_EXTRACTED + NOT_REQUIRED (diskriminator bekerja dua arah)',
    items[0].quantity.quantityAudit?.classification === 'DRAWING_EXTRACTED'
    && items[0].quantity.quantityAudit?.userApprovalStatus === 'NOT_REQUIRED');
  check('C4 nol eksplisit TIDAK diisi + terklasifikasi EXPLICIT_ZERO',
    items[2].quantity.value === 0 && items[2].quantity.quantityAudit?.classification === 'EXPLICIT_ZERO');
  check('C5 fragmen listplank terisi 24 dengan nilai asli tercatat di audit; jumlah terisi = 2',
    items[4].quantity.value === 24 && items[4].quantity.quantityAudit?.classification === 'ESTIMATED_FROM_CONTEXT'
    && items[4].quantity.quantityAudit?.originalQuantity === 0.0295 && filled === 2);
}

// ===========================================================================
// D. Persetujuan tercatat (Terima / Tolak)
// ===========================================================================
console.log('== D. Terima / Tolak ==');
{
  const arr: FullAiItem[] = [
    mk({ id: 'd0', name: 'Pemasangan Keramik Lantai 40x40', quantity: { value: 48.5, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' }, subtotal: 4850000, subtotalVerified: true, status: 'READY', exclusionReason: null }),
    mk({ id: 'd1', name: 'Titik Penerangan', quantity: { value: null, unit: 'titik', provenance: 'UNRESOLVED', confidence: 'LOW' }, price: { unitPrice: null, unit: 'titik', source: 'UNRESOLVED' } }),
  ];
  completeFullAiPrices(arr, { now: NOW });
  completeFullAiQuantities(arr);
  const combined = arr[1];
  check('D1 item gabungan: harga & kuantitas terisi, quantityBasis menempel di blok harga',
    combined.price.unitPrice === 185000 && combined.quantity.value === 6
    && combined.price.priceCompletion?.quantityBasis != null
    && combined.quantity.quantityAudit?.classification === 'ESTIMATED_FROM_CONTEXT'
    && combined.status === 'READY' && combined.subtotal === 6 * 185000);

  const accepted = acceptFullAiCompletion(combined);
  check('D2 Terima → APPROVED di kedua blok (bersarang + cerminan), nilai tidak berubah',
    accepted.price.priceCompletion?.userApprovalStatus === 'APPROVED'
    && accepted.priceCompletion?.userApprovalStatus === 'APPROVED'
    && accepted.quantity.quantityAudit?.userApprovalStatus === 'APPROVED'
    && accepted.quantityAudit?.userApprovalStatus === 'APPROVED'
    && accepted.price.unitPrice === 185000 && accepted.quantity.value === 6);
  check('D3 Terima TIDAK mengubah verifikasi & TIDAK menaikkan sumber jadi resmi',
    accepted.price.priceCompletion?.verificationStatus === 'UNVERIFIED'
    && accepted.quantity.quantityAudit?.verificationStatus === 'UNVERIFIED'
    && accepted.price.priceCompletion?.classification === 'MARKET_REFERENCE'
    && accepted.price.source === 'AI_ESTIMATE');

  const rejected = rejectFullAiCompletion(combined);
  check('D4 Tolak → nilai asli dipulihkan (harga & kuantitas kosong) + kedua blok dicabut',
    rejected.price.unitPrice === null && rejected.quantity.value === null
    && rejected.price.priceCompletion === undefined && rejected.priceCompletion === undefined
    && rejected.quantity.quantityAudit === undefined && rejected.quantityAudit === undefined
    && rejected.price.filledFromExternalRef === undefined
    && rejected.price.source === 'UNRESOLVED' && rejected.quantity.provenance === 'UNRESOLVED'
    && rejected.subtotal === null && rejected.status === 'UNRESOLVED');
}
{
  // Tolak isian harga saja (kuantitas memang ada dari gambar).
  const arr = [mk({
    id: 'd2', name: 'Rangka Atap Baja Ringan',
    quantity: { value: 90, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
  })];
  completeFullAiPrices(arr, { now: NOW });
  const rejected = rejectFullAiCompletion(arr[0]);
  check('D5 Tolak harga saja: harga pulih kosong, kuantitas gambar utuh',
    rejected.price.unitPrice === null && rejected.quantity.value === 90
    && rejected.price.priceCompletion === undefined);

  // Tolak isian kuantitas saja (harga model memang ada, tanpa blok harga).
  const arr2: FullAiItem[] = [
    mk({ id: 'd3', name: 'Pemasangan Keramik Lantai 40x40', quantity: { value: 48.5, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' }, subtotal: 4850000, subtotalVerified: true, status: 'READY', exclusionReason: null }),
    mk({ id: 'd4', name: 'Titik Penerangan', quantity: { value: null, unit: 'titik', provenance: 'UNRESOLVED', confidence: 'LOW' }, price: { unitPrice: 185000, unit: 'titik', source: 'AI_ESTIMATE' } }),
  ];
  completeFullAiQuantities(arr2);
  const rejected2 = rejectFullAiCompletion(arr2[1]);
  check('D6 Tolak kuantitas saja: kuantitas pulih kosong, harga model utuh, audit dicabut',
    rejected2.quantity.value === null && rejected2.price.unitPrice === 185000
    && rejected2.quantity.quantityAudit === undefined && rejected2.quantityAudit === undefined);

  const plain = mk({ id: 'd5', name: 'Item Polos', price: { unitPrice: 500000, unit: 'm2', source: 'AI_ESTIMATE' } });
  check('D7 tanpa blok: Terima/Tolak tidak mengarang apa pun',
    acceptFullAiCompletion(plain) === plain && rejectFullAiCompletion(plain) === plain);
}

// ===========================================================================
// E. Paritas validasi (penegakan aman = peringatan)
// ===========================================================================
console.log('== E. Validasi ==');
{
  const insane = validateFullAiItem({
    name: 'Item Harga Aneh',
    quantity: { value: 1, unit: 'm2', provenance: 'DERIVED', confidence: 'HIGH' },
    price: { unitPrice: 50, unit: 'm2', source: 'AI_ESTIMATE' },
  }, 0);
  check('E1 harga estimasi di luar pita isSaneEstimate bersama → PERINGATAN (bukan penolakan finalisasi)',
    insane.valid && insane.warnings.some((w) => w.includes('isSaneEstimate')));

  const ahspNoCode = validateFullAiItem({
    name: 'Beton',
    quantity: { value: 1, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
    price: { unitPrice: 950000, unit: 'm3', source: 'AHSP_2026' },
  }, 0);
  check('E2 klaim AHSP_2026 tanpa kode → peringatan keterlacakan',
    ahspNoCode.warnings.some((w) => w.includes('AHSP_2026 tapi tanpa kode')));

  const frag = validateQuantityDetail(
    { value: 0.0000035714, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' }, 'Pelat Dak Beton t=100mm',
  );
  check('E3 fragmen mikro dikenali diskriminator bersama di validator Full AI',
    frag.warnings.some((w) => w.includes('IMPLAUSIBLE_FRAGMENT')));

  const p1ref = EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-pintu-p1-double-hpl')!;
  const conflictBlock = validateFullAiItem({
    name: 'Pintu Double Kayu Kamper P1',
    quantity: { value: 1, unit: 'unit', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: {
      unitPrice: 3500000, unit: 'unit', source: 'AI_ESTIMATE', filledFromExternalRef: true,
      priceCompletion: buildFullAiPriceCompletion(p1ref, { originalUnitPrice: null, now: NOW }),
    },
  }, 0);
  check('E4 blok penyelesaian yang konflik spesifikasi terdeteksi validator (pertahanan kedua)',
    conflictBlock.warnings.some((w) => w.includes('konflik spesifikasi')));

  const badAudit = validateFullAiItem({
    name: 'Item Audit Aneh',
    quantity: { value: 5, unit: 'm2', provenance: 'ASSUMPTION', confidence: 'MEDIUM', quantityAudit: { classification: 'KARANGAN' } },
    price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' },
  }, 0);
  check('E5 kelas audit di luar DedQuantityClass → peringatan',
    badAudit.warnings.some((w) => w.includes('bukan kelas DedQuantityClass')));

  const arr = [mk({
    id: 'e1', name: 'Rangka Atap Baja Ringan',
    quantity: { value: 90, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
  })];
  completeFullAiPrices(arr, { now: NOW });
  const clean = validateFullAiItem(arr[0], 0);
  check('E6 item terisi yang sah tetap lulus validasi tanpa peringatan blok',
    clean.valid && !clean.warnings.some((w) => w.includes('blok penyelesaian') || w.includes('konflik spesifikasi')));
}

console.log(`\nHASIL: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
