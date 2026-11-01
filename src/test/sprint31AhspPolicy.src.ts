/**
 * SPRINT 3.1 — Workstream B: Kebijakan item non-AHSP (Keputusan B owner) +
 * regresi identitas AHSP kanonis.
 *
 * KEPUTUSAN B (otoritatif): item TANPA kode AHSP adalah item yang sah —
 * ketiadaan kode BUKAN kode palsu. Item tanpa kode harus bisa dibuat,
 * diedit, disimpan, dihargai, dihitung, dan diekspor; tidak boleh dinilai
 * UNSAFE hanya karena kodenya absen; provenance harganya harus jujur.
 * Sebaliknya kode palsu/non-kanonis tetap dilarang menjadi VERIFIED/SAFE,
 * dan klaim OFFICIAL_AHSP hanya sah bila genuine terverifikasi.
 *
 * PEMETAAN PROVENANCE (konseptual brief -> nilai aktual kode):
 * Union aktual `PriceSourceKind` (src/types/index.ts:927):
 *   'OFFICIAL_AHSP' | 'MARKET_REFERENCE' | 'EZRAB_ASSUMPTION' | 'UNRESOLVED'
 * - PRICE_MANUAL (konsep) -> TIDAK ada kind khusus. Representasi jujur di
 *   codebase: priceSourceKind TIDAK diisi + priceSourceLabel 'Input User' +
 *   verificationStatus 'NEEDS_VERIFICATION' (konvensi finalizeMapping
 *   mapDedAiItemToRabInput cabang USER_INPUT); sumbu terpisah priceStatus
 *   punya nilai 'PRICE_MANUAL' sendiri.
 * - MARKET_REFERENCE (konsep) -> 'MARKET_REFERENCE' (persis ada di union).
 * - UNRESOLVED (konsep) -> 'UNRESOLVED' (+ priceStatus 'PRICE_UNRESOLVED'
 *   bila harga memang belum ada).
 * - OFFICIAL_AHSP (konsep) -> 'OFFICIAL_AHSP' (hanya genuine: kode kanonis
 *   terverifikasi — ditegakkan factory, lihat Kasus 11/12).
 * - 'EZRAB_ASSUMPTION' juga ada di union (estimasi AI) — di luar empat
 *   konsep brief, tidak dipakai di suite ini kecuali sebagai pembeda.
 *
 * Cakupan jujur per kasus:
 * - Kasus 13/14 menyentuh updateRabItemFull di ProjectContext (React
 *   context, tidak bisa dieksekusi di node) -> diuji sebagai kontrak
 *   sumber + satu GAP yang dicatat eksplisit (bukan disetujui).
 * - Kasus 15 mengikuti pola rabExportIntegrity (tidak ada exporter
 *   standalone yang bisa diimpor; suite itu pun memverifikasi lewat
 *   factory + perhitungan independen).
 *
 * Run: esbuild bundle lalu node, seperti suite .src.ts lain.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { canonicalAhspCodeExists } from '../data/priceDatabase2026/ahspDisplayPolicy';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function mkItem(p: Partial<DedAiItem>): DedAiItem {
  return {
    id: 's31-1', name: 'Pekerjaan uji', category: 'Umum', units: 'm2',
    quantity: null, quantitySource: 'UNRESOLVED', unitPrice: null,
    priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [1],
    provenance: [], stage: 'PARSE', ...p,
  } as DedAiItem;
}

const P = 'proj-s31';

// =====================================================================
console.log('=== B31-0: prasyarat katalog (sumber kebenaran tunggal) ===');
check('Kasus 1 prasyarat: repository memuat 3.7.4', officialAhspRepository.hasOfficialAhsp('3.7.4') === true);
check('Kasus 2 prasyarat: repository memuat B.38 (Bina Marga)', officialAhspRepository.hasOfficialAhsp('B.38') === true);
check('Kasus 3 prasyarat: repository memuat G.74 (Bina Marga)', officialAhspRepository.hasOfficialAhsp('G.74') === true);
check('Kasus 4/5 prasyarat: 9.9.9.9 & 3.7.4.1 TIDAK ada di katalog',
  canonicalAhspCodeExists('9.9.9.9') === false && canonicalAhspCodeExists('3.7.4.1') === false);
check('Task 3 prasyarat: A.1.1 (warisan 2022) TIDAK ada di katalog kanonis 2026',
  canonicalAhspCodeExists('A.1.1') === false);

// =====================================================================
console.log('=== B31-1: kode kanonis valid -> SAFE + VERIFIED + resmi bertahan ===');
for (const [code, desc, unit] of [
  ['3.7.4', 'Pemasangan plesteran dinding', 'm2'],
  ['B.38', 'Pekerjaan perkerasan jalan raya', 'm3'],
  ['G.74', 'Pekerjaan drainase jalan lingkungan', 'm'],
] as const) {
  const rec = createRabItemRecord({
    description: desc, volume: 2, unit, unitPrice: 100000,
    ahspCode: code, verificationStatus: 'VERIFIED', priceSourceKind: 'OFFICIAL_AHSP',
  } as never, P, {});
  check(`kode kanonis ${code}: identity SAFE`, (rec as any).ahspIdentityStatus === 'SAFE', String((rec as any).ahspIdentityStatus));
  check(`kode kanonis ${code}: VERIFIED + OFFICIAL_AHSP bertahan`,
    rec.verificationStatus === 'VERIFIED' && (rec as any).priceSourceKind === 'OFFICIAL_AHSP');
}

// =====================================================================
console.log('=== B31-2: kode palsu -> tidak SAFE, tidak VERIFIED (Sprint 3 dipertahankan) ===');
for (const code of ['9.9.9.9', '3.7.4.1'] as const) {
  const rec = createRabItemRecord({
    description: 'Plesteran dinding', volume: 1, unit: 'm2', unitPrice: 999999,
    ahspCode: code, verificationStatus: 'VERIFIED',
  } as never, P, {});
  check(`kode palsu ${code}: identity UNSAFE`, (rec as any).ahspIdentityStatus === 'UNSAFE', String((rec as any).ahspIdentityStatus));
  check(`kode palsu ${code}: VERIFIED diturunkan NEEDS_VERIFICATION; kode dipertahankan sbg klaim`,
    rec.verificationStatus === 'NEEDS_VERIFICATION' && rec.ahspCode === code);
}

// =====================================================================
console.log('=== B31-3: TANPA kode = item sah (Keputusan B inti) ===');
// Kasus 6: tidak ada entri katalog yang berlaku untuk pekerjaan ini.
const codeless = createRabItemRecord({
  description: 'Pekerjaan khusus fabrikasi baja non-standar', volume: 2, unit: 'ls', unitPrice: 5000000,
} as never, P, {});
check('Kasus 6: item tanpa kode bisa dibuat (id + projectId terisi)', !!codeless.id && codeless.projectId === P);
check('Kasus 6: tanpa kode TIDAK dinilai UNSAFE (identitas tak berflag)', (codeless as any).ahspIdentityStatus === undefined, String((codeless as any).ahspIdentityStatus));
check('Kasus 6: ahspCode kosong apa adanya (tidak dikarang), harga & amount utuh',
  codeless.ahspCode === '' && codeless.unitPrice === 5000000 && codeless.amount === 10000000 && codeless.priceStatus === 'PRICE_RESOLVED');
// Kasus 7: item kustom manual — record lengkap dan wajar.
const custom = createRabItemRecord({
  description: 'Pemasangan ornamen fasad kustom pesanan khusus', category: '99. PEKERJAAN KHUSUS',
  sectionName: '99. PEKERJAAN KHUSUS', volume: 3, unit: 'unit', unitPrice: 250000,
} as never, P, {});
check('Kasus 7: item kustom manual tersimpan utuh (uraian/volume/satuan/harga persis)',
  custom.description === 'Pemasangan ornamen fasad kustom pesanan khusus' &&
  custom.volume === 3 && custom.unit === 'unit' && custom.unitPrice === 250000 && custom.amount === 750000);
check('Kasus 7: volumeSource default MANUAL; tanpa kode karangan; tanpa flag identitas',
  custom.volumeSource === 'MANUAL' && custom.ahspCode === '' && (custom as any).ahspIdentityStatus === undefined);

// =====================================================================
console.log('=== B31-4: provenance harga item tanpa kode tetap jujur ===');
// Kasus 8a: jalur mapper finalisasi DED — harga manual (USER_INPUT).
const manualMapped = mapDedAiItemToRabInput(mkItem({
  name: 'Pekerjaan khusus manual', category: 'Khusus', units: 'ls',
  quantity: 1, quantitySource: 'MANUAL', unitPrice: 1500000, priceSource: 'USER_INPUT',
}), 'DATABASE');
check('Kasus 8 (mapper): harga manual -> kind TIDAK diisi (tidak ada PRICE_MANUAL di union), label "Input User"',
  manualMapped !== null && manualMapped.priceSourceKind === undefined && manualMapped.priceSourceLabel === 'Input User');
check('Kasus 8 (mapper): harga manual -> NEEDS_VERIFICATION, tanpa ahspCode',
  manualMapped?.verificationStatus === 'NEEDS_VERIFICATION' && manualMapped?.ahspCode === undefined);
const manualRec = manualMapped ? createRabItemRecord({ ...manualMapped } as never, P, {}) : null;
check('Kasus 8 (factory): record manual tanpa kode tidak memperoleh identitas/kind resmi apa pun',
  manualRec !== null && (manualRec as any).priceSourceKind === undefined &&
  (manualRec as any).ahspIdentityStatus === undefined && manualRec.unitPrice === 1500000);
// Kasus 8b: sumbu priceStatus PRICE_MANUAL mempertahankan harga (paralel rabExportIntegrity #10).
const manualStatus = createRabItemRecord({
  description: 'Item harga manual pengguna', volume: 10, unit: 'm3', unitPrice: 1000000, priceStatus: 'PRICE_MANUAL',
} as never, P, {});
check('Kasus 8 (priceStatus): PRICE_MANUAL mempertahankan harga & amount, tanpa kind resmi karangan',
  manualStatus.unitPrice === 1000000 && manualStatus.amount === 10000000 && (manualStatus as any).priceSourceKind === undefined);
// Kasus 9: tanpa kode + MARKET_REFERENCE.
const market = createRabItemRecord({
  description: 'Pengadaan material khusus survei pasar', volume: 5, unit: 'm3', unitPrice: 320000,
  priceSourceKind: 'MARKET_REFERENCE', priceSourceName: 'Survei pasar lokal',
} as never, P, {});
check('Kasus 9: MARKET_REFERENCE dipertahankan apa adanya (bukan resmi, bukan diturunkan)',
  (market as any).priceSourceKind === 'MARKET_REFERENCE' && (market as any).priceSourceName === 'Survei pasar lokal');
check('Kasus 9: item referensi pasar tanpa kode tetap tak berflag identitas (bukan UNSAFE)',
  (market as any).ahspIdentityStatus === undefined && market.ahspCode === '');
// Kasus 10: tanpa kode + harga UNRESOLVED -> keluar dari total.
const unresolved = createRabItemRecord({
  description: 'Pekerjaan pendukung belum ada harga', volume: 4, unit: 'm3', unitPrice: null,
  priceSourceKind: 'UNRESOLVED',
} as never, P, {});
check('Kasus 10: harga belum ada -> PRICE_UNRESOLVED + NEEDS_VERIFICATION + kind UNRESOLVED (tidak jadi Rp0 sah)',
  unresolved.priceStatus === 'PRICE_UNRESOLVED' && unresolved.verificationStatus === 'NEEDS_VERIFICATION' &&
  (unresolved as any).priceSourceKind === 'UNRESOLVED');
const summary = UnifiedProjectEngine.recalculateCostSummary([unresolved, codeless], {
  overheadPercent: 0, profitPercent: 0, taxPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0,
});
check('Kasus 10: item UNRESOLVED dikeluarkan dari total biaya langsung (hanya item berharga yang masuk)',
  summary.directCost === 10000000, String(summary.directCost));

// =====================================================================
console.log('=== B31-5: klaim resmi tak berdasar dicabut — dua keadaan berbeda ===');
// Kasus 11 (PERBAIKAN Sprint 3.1): tanpa kode + klaim OFFICIAL_AHSP.
const codelessOfficial = createRabItemRecord({
  description: 'Pekerjaan manual mengklaim harga resmi', volume: 1, unit: 'ls', unitPrice: 750000,
  priceSourceKind: 'OFFICIAL_AHSP', priceSourceLabel: 'RESMI AHSP',
} as never, P, {});
check('Kasus 11: tanpa kode + klaim OFFICIAL_AHSP -> kind diturunkan ke UNRESOLVED',
  (codelessOfficial as any).priceSourceKind === 'UNRESOLVED', String((codelessOfficial as any).priceSourceKind));
check('Kasus 11: ketiadaan kode TIDAK dihukum UNSAFE (status identitas tetap tak berflag)',
  (codelessOfficial as any).ahspIdentityStatus === undefined, String((codelessOfficial as any).ahspIdentityStatus));
check('Kasus 11: alasan penurunan tercatat; nilai harga tidak diubah (sumbu harga independen)',
  String((codelessOfficial as any).ahspIdentityReason || '').includes('OFFICIAL_AHSP') && codelessOfficial.unitPrice === 750000);
// Kasus 12: kode palsu + klaim OFFICIAL_AHSP (perilaku Sprint 3, dipertahankan).
const fakeOfficial = createRabItemRecord({
  description: 'Plesteran dinding', volume: 1, unit: 'm2', unitPrice: 999999,
  ahspCode: '9.9.9.9', verificationStatus: 'VERIFIED', priceSourceKind: 'OFFICIAL_AHSP',
} as never, P, {});
check('Kasus 12: kode palsu + klaim OFFICIAL_AHSP -> UNSAFE + kind UNRESOLVED + NEEDS_VERIFICATION',
  (fakeOfficial as any).ahspIdentityStatus === 'UNSAFE' &&
  (fakeOfficial as any).priceSourceKind === 'UNRESOLVED' &&
  fakeOfficial.verificationStatus === 'NEEDS_VERIFICATION');
check('Perbedaan wajib (B4): tanpa kode != kode palsu — hanya yang berkode palsu yang UNSAFE',
  (codelessOfficial as any).ahspIdentityStatus === undefined && (fakeOfficial as any).ahspIdentityStatus === 'UNSAFE');

// =====================================================================
console.log('=== B31-6: jalur edit (kontrak sumber ProjectContext.updateRabItemFull) ===');
// updateRabItemFull adalah callback React di ProjectContext — tidak bisa
// dieksekusi di harness node. Diuji sebagai kontrak sumber terhadap file
// aslinya; GAP dicatat apa adanya (bukan perilaku target).
const ctxPath = ['src/context/ProjectContext.tsx', '../context/ProjectContext.tsx']
  .find((p) => existsSync(p));
check('Kasus 13/14 prasyarat: ProjectContext.tsx ditemukan untuk kontrak sumber', !!ctxPath, 'path tidak ditemukan');
const ctxSrc = ctxPath ? readFileSync(ctxPath, 'utf8') : '';
const updStart = ctxSrc.indexOf('const updateRabItemFull');
const updEnd = ctxSrc.indexOf('const deleteRabItem', updStart);
const updBody = updStart >= 0 && updEnd > updStart ? ctxSrc.slice(updStart, updEnd) : '';
check('Kasus 13/14 prasyarat: badan updateRabItemFull terlokalisasi', updBody.length > 200);
check('Kasus 14: gerbang edit HANYA terpicu kode non-kosong dari pemanggil (edit tanpa menyentuh kode tidak pernah memasang kode asing)',
  updBody.includes("typeof updates.ahspCode === 'string'") && updBody.includes("updates.ahspCode.trim() !== ''") && updBody.includes('!canonicalAhspCodeExists(updates.ahspCode)'));
check('Kasus 13: memasang kode non-kanonis lewat edit -> penurunan identitas tercermin di jalur edit (UNSAFE + NEEDS_VERIFICATION + kind UNRESOLVED)',
  updBody.includes("ahspIdentityStatus: 'UNSAFE'") && updBody.includes("verificationStatus: 'NEEDS_VERIFICATION'") && updBody.includes("priceSourceKind: 'UNRESOLVED'"));
check('REGRESI Kasus 13 (dulu GAP TERCATAT Sprint 3.1, ditutup parent di fase gerbang): updateRabItemFull membersihkan ahspIdentityStatus/klaim OFFICIAL_AHSP lama saat kode DIHAPUS (ahspCode: "") — record tanpa kode tidak menyimpan flag SAFE basi',
  updBody.includes('ahspIdentityStatus: undefined') && updBody.includes('ahspIdentityReason: undefined'));

// =====================================================================
console.log('=== B31-7: ekspor item tanpa kode tanpa identitas karangan (pola rabExportIntegrity) ===');
// Tidak ada exporter standalone yang bisa diimpor; lapisan ekspor membaca
// field record apa adanya. Yang dibuktikan di sini: field yang dibaca
// exporter dari item tanpa kode tidak mengandung identitas resmi karangan.
check('Kasus 15: field ekspor item referensi pasar tanpa kode bebas identitas resmi (kode "", tanpa flag, kind bukan OFFICIAL_AHSP)',
  market.ahspCode === '' && (market as any).ahspIdentityStatus === undefined &&
  (market as any).priceSourceKind !== 'OFFICIAL_AHSP' && market.description.length > 0 && market.amount === 1600000);
check('Kasus 15 (kendali): item berkode kanonis mengekspor kode aslinya (tidak dihapus gerbang)',
  (() => { const r = createRabItemRecord({ description: 'Pemasangan plesteran dinding', volume: 1, unit: 'm2', unitPrice: 51622, ahspCode: '3.7.4' } as never, P, {}); return r.ahspCode === '3.7.4' && (r as any).ahspIdentityStatus === 'SAFE'; })());

console.log(`\n=== HASIL SPRINT 3.1 AHSP POLICY: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
