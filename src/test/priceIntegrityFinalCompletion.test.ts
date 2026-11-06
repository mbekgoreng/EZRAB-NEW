/**
 * ONE-PASS FINALIZATION — regresi Task A–E (lanjutan Price Integrity Gate).
 * Run: npx --yes tsx src/test/priceIntegrityFinalCompletion.test.ts
 *
 * A: helper tampilan peringatan integritas di editor RAB.
 * B: summarizeExportItems menghormati flag isPartial eksplisit.
 * C: applyRecalcPriceIntegrity — transisi lengkap↔parsial jalur existingMapping.
 * D: anotasi PDF — label REFERENSI PASAR + metadata wilayah + HARGA PARSIAL.
 * E: klasifikasi harga manual jalur QTO sync — batasan terdokumentasi dikunci.
 */
import {
  summarizeExportItems,
  summarizeExportSections,
  exportTotalNote,
} from '../export/priceIntegrity';
import { buildPdfSourceAnnotations } from '../export/pdfExporter';
import { getRabItemIntegrityNotice } from '../components/estimator/rabPriceIntegrityBadge';
import {
  applyRecalcPriceIntegrity,
  buildRecalcPartialWarning,
  RECALC_PARTIAL_WARNING_PREFIX,
} from '../lib/qtoRecalcIntegrity';
import { resolveQtoSyncPrice } from '../lib/qtoSyncPricing';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('== Task A: notice editor RAB dari field tersimpan ==');
{
  const partial = getRabItemIntegrityNotice({
    isPartial: true,
    unresolvedComponentCount: 3,
    priceValidationWarnings: ['Harga referensi berasal dari Jawa Timur. Belum diverifikasi sebagai harga lokal proyek Bali.'],
  } as any);
  check('Item parsial → notice ada', partial !== null);
  check('Badge menyebut parsial + jumlah komponen', !!partial && partial.badgeLabel.includes('Harga parsial') && partial.badgeLabel.includes('3 komponen'), partial?.badgeLabel);
  check('Detail peringatan tersedia untuk diperluas', !!partial && partial.hasDetail && partial.warnings.length === 1);
  const warnOnly = getRabItemIntegrityNotice({
    isPartial: false,
    unresolvedComponentCount: 0,
    priceValidationWarnings: ['Sumber INDEX ONLY (keyakinan lebih rendah): LPA.'],
  } as any);
  check('Item lengkap berwarning → notice "Peringatan harga" (bukan parsial)', !!warnOnly && !warnOnly.isPartial && warnOnly.badgeLabel === 'Peringatan harga');
  const countOnly = getRabItemIntegrityNotice({ unresolvedComponentCount: 2 } as any);
  check('unresolvedComponentCount > 0 tanpa flag → tetap parsial', !!countOnly && countOnly.isPartial && countOnly.unresolvedComponentCount === 2);
  const clean = getRabItemIntegrityNotice({ isPartial: false, unresolvedComponentCount: 0, priceValidationWarnings: [] } as any);
  check('Item bersih → notice null (editor tidak berubah)', clean === null);
  const blankWarnings = getRabItemIntegrityNotice({ priceValidationWarnings: ['', '   '] } as any);
  check('Peringatan string kosong ditapis → notice null', blankWarnings === null);
}

console.log('== Task B: ringkasan ekspor menghormati isPartial eksplisit ==');
{
  const official = { volume: 2, unit: 'm³', unitPrice: 1001900, totalPrice: 2003800, amount: 2003800, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' };
  const flaggedPartial = { volume: 1, unit: 'm³', unitPrice: 480000, totalPrice: 480000, amount: 480000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE', isPartial: true, unresolvedComponentCount: 2 };
  const s = summarizeExportItems([official, flaggedPartial] as any);
  check('Item berflag parsial tetap terhitung rupiahnya (gerbang status tidak berubah)', s.pricedTotal === 2483800 && s.pricedCount === 2, `${s.pricedTotal}`);
  check('unpricedCount tetap 0 (tidak ada item tanpa harga)', s.unpricedCount === 0);
  check('isPartial = true WALAU semua item berharga', s.isPartial === true);
  check('partialItemCount = 1, unresolvedComponentTotal = 2', s.partialItemCount === 1 && s.unresolvedComponentTotal === 2, `${s.partialItemCount}/${s.unresolvedComponentTotal}`);
  check('Catatan total menyebut TOTAL PARSIAL + rincian komponen', exportTotalNote(s).includes('TOTAL PARSIAL') && exportTotalNote(s).includes('rincian komponen'), exportTotalNote(s));
  const complete = summarizeExportItems([official] as any);
  check('Himpunan lengkap valid TIDAK berubah: isPartial false, hitungan baru 0', complete.isPartial === false && complete.partialItemCount === 0 && complete.unresolvedComponentTotal === 0 && complete.pricedTotal === 2003800);
  const stale = { volume: 1, unit: 'm³', unitPrice: 0, totalPrice: 999999, amount: 0, priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'UNRESOLVED', isPartial: true, unresolvedComponentCount: 4 };
  const s2 = summarizeExportItems([official, stale] as any);
  check('UNRESOLVED berflag parsial: total basi 999.999 TETAP dibuang', s2.pricedTotal === 2003800 && s2.unpricedCount === 1, `${s2.pricedTotal}/${s2.unpricedCount}`);
  check('UNRESOLVED berflag parsial: hitungan komponen tetap akurat', s2.unresolvedComponentTotal === 4 && s2.isPartial === true);
  const secs = summarizeExportSections([{ code: 'A', name: 'Seksi A', items: [official, flaggedPartial] as any }]);
  check('Agregasi seksi meneruskan partialItemCount + isPartial', secs.partialItemCount === 1 && secs.isPartial === true && secs.sections[0].isPartial === true);
}

console.log('== Task C: transisi integritas jalur existingMapping ==');
{
  const untouched = applyRecalcPriceIntegrity({ isPartial: true, unresolvedComponentCount: 5 } as any, undefined);
  check('Tanpa data integritas pemanggil → patch kosong (metadata lama tidak ditebak)', Object.keys(untouched).length === 0);
  const storedItem = { isPartial: false, unresolvedComponentCount: 0, priceValidationWarnings: ['Harga referensi berasal dari Jawa Timur. Belum diverifikasi sebagai harga lokal proyek Bali.'] } as any;
  const toPartial = applyRecalcPriceIntegrity(storedItem, { isPartial: true, unresolvedComponentCount: 2, priceValidationWarnings: ['Sumber INDEX ONLY (keyakinan lebih rendah): LPA.'] });
  check('Lengkap → parsial: flag + jumlah ditetapkan', toPartial.isPartial === true && toPartial.unresolvedComponentCount === 2);
  check('Lengkap → parsial: peringatan lama + pemanggil + peringatan parsial tergabung', (toPartial.priceValidationWarnings ?? []).length === 3 && (toPartial.priceValidationWarnings ?? []).some((w) => w.startsWith(RECALC_PARTIAL_WARNING_PREFIX)), JSON.stringify(toPartial.priceValidationWarnings));
  check('Patch TIDAK menyentuh harga/status harga (tidak ada harga sintetis / timpa harga user)', !('unitPrice' in toPartial) && !('priceStatus' in toPartial) && !('amount' in toPartial));
  const itemAfterPartial = { isPartial: true, unresolvedComponentCount: 2, priceValidationWarnings: toPartial.priceValidationWarnings } as any;
  const toPartial2 = applyRecalcPriceIntegrity(itemAfterPartial, { isPartial: true, unresolvedComponentCount: 5 });
  const prefixCount = (toPartial2.priceValidationWarnings ?? []).filter((w) => w.startsWith(RECALC_PARTIAL_WARNING_PREFIX)).length;
  check('Parsial → parsial (hitungan berubah): peringatan parsial lama diganti, bukan menumpuk', prefixCount === 1 && (toPartial2.priceValidationWarnings ?? []).some((w) => w.includes('5 komponen')), JSON.stringify(toPartial2.priceValidationWarnings));
  const toComplete = applyRecalcPriceIntegrity(itemAfterPartial, { isPartial: false, unresolvedComponentCount: 0, priceValidationWarnings: ['Sumber INDEX ONLY (keyakinan lebih rendah): LPA.'] });
  check('Parsial → lengkap tervalidasi: flag dibersihkan, peringatan parsial hilang', toComplete.isPartial === false && toComplete.unresolvedComponentCount === 0 && (toComplete.priceValidationWarnings ?? []).length === 1 && !(toComplete.priceValidationWarnings ?? []).some((w) => w.startsWith(RECALC_PARTIAL_WARNING_PREFIX)));
  const toCompleteBare = applyRecalcPriceIntegrity(itemAfterPartial, { isPartial: false, unresolvedComponentCount: 0 });
  check('Parsial → lengkap tanpa peringatan baru: warnings dikosongkan', toCompleteBare.priceValidationWarnings === undefined);
  check('Teks peringatan parsial menyebut harga tersimpan dipertahankan', buildRecalcPartialWarning(2).includes('harga satuan tersimpan dipertahankan'));
}

console.log('== Task D: provenance PDF konsisten dengan Excel ==');
{
  const market = buildPdfSourceAnnotations({
    priceStatus: 'PRICE_RESOLVED',
    priceSourceKind: 'MARKET_REFERENCE',
    priceSourceSupplier: 'Jayasteel',
    priceSourceDate: '2026-09-01',
    priceSourceRegion: 'Jawa Timur',
  });
  check('PDF: REFERENSI PASAR berlabel + bukan resmi AHSP', market.includes('REFERENSI PASAR') && market.includes('bukan harga resmi AHSP'), market);
  check('PDF: metadata tercatat tampil (pemasok · berlaku · wilayah)', market.includes('Jayasteel') && market.includes('berlaku 2026-09-01') && market.includes('Jawa Timur'), market);
  const marketBare = buildPdfSourceAnnotations({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' });
  check('PDF: pasar tanpa metadata → label polos, tidak ada metadata karangan', marketBare.includes('REFERENSI PASAR') && !marketBare.includes('berlaku'), marketBare);
  const manualMarket = buildPdfSourceAnnotations({ priceStatus: 'PRICE_MANUAL', priceSourceKind: 'MARKET_REFERENCE', priceSourceSupplier: 'Jayasteel' });
  check('PDF: PRICE_MANUAL menang atas label pasar (sama seperti Excel)', manualMarket.includes('INPUT MANUAL') && !manualMarket.includes('REFERENSI PASAR'), manualMarket);
  const partial = buildPdfSourceAnnotations({ priceStatus: 'PRICE_RESOLVED', isPartial: true, unresolvedComponentCount: 2 });
  check('PDF: item parsial beranotasi HARGA PARSIAL + jumlah komponen', partial.includes('HARGA PARSIAL') && partial.includes('2 komponen'), partial);
  const partialByCount = buildPdfSourceAnnotations({ priceStatus: 'PRICE_RESOLVED', unresolvedComponentCount: 1 });
  check('PDF: unresolvedComponentCount > 0 saja → tetap beranotasi parsial', partialByCount.includes('HARGA PARSIAL'), partialByCount);
  const plainOfficial = buildPdfSourceAnnotations({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' });
  check('PDF: item resmi bersih → tanpa anotasi baru (perilaku lama utuh)', plainOfficial === '', JSON.stringify(plainOfficial));
}

console.log('== Task E: klasifikasi harga manual jalur QTO sync (batasan terkunci) ==');
{
  // Keputusan Task E: normalisasi ke PRICE_MANUAL TIDAK dilakukan —
  // kontrak P1 yang teruji + keputusan owner yang belum diambil (Gate §10.6).
  // Tes ini mengunci perilaku kompatibel saat ini secara eksplisit.
  const caller = resolveQtoSyncPrice(85000);
  check('Harga pemanggil → PRICE_RESOLVED (kontrak kompatibel dipertahankan, BUKAN dilabeli ulang diam-diam)', caller.priceStatus === 'PRICE_RESOLVED');
  check('Tanpa harga pemanggil → PRICE_UNRESOLVED (tidak mengarang)', resolveQtoSyncPrice(undefined).priceStatus === 'PRICE_UNRESOLVED');
  check('Helper QTO sync tidak pernah mengeluarkan PRICE_MANUAL', resolveQtoSyncPrice(1).priceStatus !== 'PRICE_MANUAL' && resolveQtoSyncPrice(undefined).priceStatus !== 'PRICE_MANUAL');
}

console.log(`\npriceIntegrityFinalCompletion: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
