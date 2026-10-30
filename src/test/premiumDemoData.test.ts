/**
 * PREMIUM DEMO DATASET — integritas dataset demonstrasi "Rumah Tinggal
 * 2 Lantai — EZRAB Premium Demo".
 *
 * Yang dijaga:
 *  - injeksi satu kali (injectOnceById): tidak respawn, tidak duplikasi.
 *  - setiap item berharga lolos katalog resmi: kode ada, satuan sama persis,
 *    aritmetika volume × harga = jumlah, snapshot konsisten.
 *  - setiap item tak berharga benar-benar null (BUKAN 0) + status jujur.
 *  - ringkasan biaya proyek rekonsiliasi dengan item-itemnya.
 *
 * Jalankan: bundle esbuild -> node (pola suite src/test yang ada).
 */

import { injectOnceById } from '../lib/demoSeed';
import {
  PREMIUM_DEMO_PROJECT,
  PREMIUM_DEMO_RAB_ITEMS,
  PREMIUM_DEMO_PROJECT_ID,
} from '../data/premiumDemoData';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------- injectOnceById ----------
{
  const base = [{ id: 'a' }, { id: 'b' }];
  const add = [{ id: 'b' }, { id: 'c' }];
  const first = injectOnceById(base, add, false);
  check('injeksi: menambahkan yang belum ada saja', first.items.map((x) => x.id).join(',') === 'a,b,c');
  check('injeksi: menandai harus pasang flag', first.shouldMarkInjected === true);
  const second = injectOnceById(first.items, add, true);
  check('injeksi: flag terpasang => tidak berubah (tidak respawn)', second.items === first.items && second.shouldMarkInjected === false);
  const empty = injectOnceById(base, [], false);
  check('injeksi: tanpa tambahan tetap menandai flag', empty.shouldMarkInjected === true && empty.items === base);
}

// ---------- struktur dataset ----------
const items = PREMIUM_DEMO_RAB_ITEMS;
check('dataset: 213 item', items.length === 213, `got ${items.length}`);
check('dataset: semua item milik proyek premium', items.every((i) => i.projectId === PREMIUM_DEMO_PROJECT_ID));
check('dataset: id unik', new Set(items.map((i) => i.id)).size === items.length);
check('dataset: wbsCode unik', new Set(items.map((i) => i.wbsCode)).size === items.length);
check('dataset: 20 seksi WBS', new Set(items.map((i) => i.sectionName)).size === 20);
check('dataset: semua item punya basis kuantitas (notes)', items.every((i) => !!i.notes && i.notes.length > 10));
check('dataset: tidak ada harga 0', items.every((i) => i.unitPrice === null || i.unitPrice > 0));

// ---------- item berharga: lolos katalog resmi ----------
const priced = items.filter((i) => i.priceStatus === 'PRICE_RESOLVED');
check('dataset: >= 100 item berharga resmi', priced.length >= 100, `got ${priced.length}`);
for (const it of priced) {
  const cat = it.ahspCode ? officialAhspRepository.getOfficialAhsp(it.ahspCode) : undefined;
  if (!cat) { check(`resmi: kode katalog ada (${it.id})`, false, it.ahspCode); continue; }
  if (cat.unit !== it.unit) check(`resmi: satuan sama (${it.id})`, false, `${it.unit} vs ${cat.unit}`);
  if (it.unitPrice == null || it.amount !== Math.round(it.volume * it.unitPrice)) check(`resmi: aritmetika (${it.id})`, false);
  if (it.priceSourceKind !== 'OFFICIAL_AHSP' || it.ahspMappingStatus !== 'VERIFIED') check(`resmi: provenance (${it.id})`, false);
  const split = (it.materialPrice ?? 0) + (it.laborPrice ?? 0) + (it.equipmentPrice ?? 0);
  if (Math.abs(split - (it.unitPrice ?? 0)) > 3) check(`resmi: rincian = harga satuan (${it.id})`, false, `${split} vs ${it.unitPrice}`);
  if (!it.ahspSnapshot || it.ahspSnapshot.code !== it.ahspCode) check(`resmi: snapshot (${it.id})`, false);
}
check('resmi: semua item berharga lolos pemeriksaan katalog', true);

// ---------- item tak berharga: null + status jujur ----------
const unpriced = items.filter((i) => i.priceStatus !== 'PRICE_RESOLVED');
check('unresolved: harga & jumlah null (bukan 0)', unpriced.every((i) => i.unitPrice === null && i.amount === null && i.totalPrice === null));
check('unresolved: priceSourceKind UNRESOLVED', unpriced.every((i) => i.priceSourceKind === 'UNRESOLVED'));
check(
  'unresolved: status pemetaan valid',
  unpriced.every((i) => ['NEEDS_MAPPING', 'MAPPED_UNPRICED', 'UNIT_MISMATCH'].includes(i.ahspMappingStatus ?? ''))
);
check(
  'unresolved: yang terpetakan kode tetap kode resmi',
  unpriced.every((i) => !i.ahspCode || officialAhspRepository.hasOfficialAhsp(i.ahspCode))
);
check('unresolved: semua punya penjelasan', unpriced.every((i) => !!i.priceSourceExplanation));

// ---------- rekonsiliasi proyek ----------
const direct = priced.reduce((s, i) => s + (i.amount ?? 0), 0);
const cs = PREMIUM_DEMO_PROJECT.costSummary;
check('proyek: isDemo', PREMIUM_DEMO_PROJECT.isDemo === true);
check('proyek: itemsCount = jumlah item', (PREMIUM_DEMO_PROJECT as { itemsCount?: number }).itemsCount === items.length);
check('proyek: directCost = Σ jumlah item', cs.directCost === direct, `${cs.directCost} vs ${direct}`);
check('proyek: grandTotal rekonsiliasi', cs.grandTotal === cs.subtotalBeforeTax + cs.taxAmount);
check('proyek: totalRab = grandTotal', (PREMIUM_DEMO_PROJECT as { totalRab?: number }).totalRab === cs.grandTotal);

console.log(`\npremiumDemoData: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log('FAILURES:', failures.slice(0, 10));
  process.exit(1);
}
