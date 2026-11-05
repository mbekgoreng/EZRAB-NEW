/**
 * PREMIUM DEMO DATASET — integritas dataset demonstrasi "Rumah Tinggal
 * 2 Lantai — EZRAB Premium Demo".
 *
 * Yang dijaga:
 *  - injeksi satu kali (injectOnceById): tidak respawn, tidak duplikasi.
 *  - SEMUA item berharga (doktrin owner 2026-11-04: demo tampil bersih).
 *  - item berkode lolos katalog resmi: kode ada, satuan sama persis,
 *    aritmetika volume × harga = jumlah, snapshot konsisten; provenance
 *    OFFICIAL_AHSP (murni/konversi terdokumentasi) atau MARKET_REFERENCE
 *    (komponen dilengkapi harga pasar — tercatat di penjelasan).
 *  - item estimasi berlabel EZRAB_ASSUMPTION + penjelasan; bukan harga resmi.
 *  - ringkasan biaya proyek rekonsiliasi dengan item-itemnya.
 *
 * Jalankan: bundle esbuild -> node (pola suite src/test yang ada).
 */

import { injectOnceById, refreshByMatch } from '../lib/demoSeed';
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

// ---------- refreshByMatch (penyegaran versi dataset v1 -> v2) ----------
{
  const stored = [{ id: 'u1' }, { id: 'demo', v: 1 }, { id: 'u2' }];
  const fresh = [{ id: 'demo', v: 2 }];
  const isDemo = (x: { id: string }) => x.id === 'demo';
  const out = refreshByMatch(stored, fresh, isDemo, false);
  check('refresh: entri demo diganti segar, entri user utuh', out.length === 3 && (out.find((x) => x.id === 'demo') as { v?: number } | undefined)?.v === 2 && out.some((x) => x.id === 'u1'));
  check('refresh: versi mutakhir => tidak berubah', refreshByMatch(stored, fresh, isDemo, true) === stored);
  check('refresh: demo sudah dihapus user => tidak respawn', refreshByMatch([{ id: 'u1' }], fresh, isDemo, false).length === 1);
}

// ---------- struktur dataset ----------
const items = PREMIUM_DEMO_RAB_ITEMS;
check('dataset: 213 item', items.length === 213, `got ${items.length}`);
check('dataset: semua item milik proyek premium', items.every((i) => i.projectId === PREMIUM_DEMO_PROJECT_ID));
check('dataset: id unik', new Set(items.map((i) => i.id)).size === items.length);
check('dataset: wbsCode unik', new Set(items.map((i) => i.wbsCode)).size === items.length);
check('dataset: 20 seksi WBS', new Set(items.map((i) => i.sectionName)).size === 20);
check('dataset: semua item punya basis kuantitas (notes)', items.every((i) => !!i.notes && i.notes.length > 10));
check('dataset: semua item berharga (tidak ada null/0)', items.every((i) => i.unitPrice != null && i.unitPrice > 0 && i.amount != null));
check('dataset: semua PRICE_RESOLVED', items.every((i) => i.priceStatus === 'PRICE_RESOLVED'));
check('dataset: semua punya penjelasan sumber', items.every((i) => !!i.priceSourceExplanation));

// ---------- item berkode: lolos katalog resmi ----------
const coded = items.filter((i) => i.priceSourceKind === 'OFFICIAL_AHSP' || i.priceSourceKind === 'MARKET_REFERENCE');
check('dataset: >= 150 item berkode katalog', coded.length >= 150, `got ${coded.length}`);
for (const it of coded) {
  const cat = it.ahspCode ? officialAhspRepository.getOfficialAhsp(it.ahspCode) : undefined;
  if (!cat) { check(`resmi: kode katalog ada (${it.id})`, false, it.ahspCode); continue; }
  if (cat.unit !== it.unit) check(`resmi: satuan sama (${it.id})`, false, `${it.unit} vs ${cat.unit}`);
  if (it.unitPrice == null || it.amount !== Math.round(it.volume * it.unitPrice)) check(`resmi: aritmetika (${it.id})`, false);
  if (it.ahspMappingStatus !== 'VERIFIED') check(`resmi: provenance (${it.id})`, false);
  const split = (it.materialPrice ?? 0) + (it.laborPrice ?? 0) + (it.equipmentPrice ?? 0);
  if (Math.abs(split - (it.unitPrice ?? 0)) > 3) check(`resmi: rincian = harga satuan (${it.id})`, false, `${split} vs ${it.unitPrice}`);
  if (!it.ahspSnapshot || it.ahspSnapshot.code !== it.ahspCode) check(`resmi: snapshot (${it.id})`, false);
  const snapComps = [
    ...(it.ahspSnapshot?.laborComponents ?? []),
    ...(it.ahspSnapshot?.materialComponents ?? []),
    ...(it.ahspSnapshot?.equipmentComponents ?? []),
  ];
  if (snapComps.some((c) => c.unitPrice == null)) check(`resmi: snapshot lengkap berharga (${it.id})`, false);
}
check('resmi: semua item berkode lolos pemeriksaan katalog', true);

// ---------- item estimasi: berlabel jujur ----------
const estimates = items.filter((i) => i.priceSourceKind === 'EZRAB_ASSUMPTION');
check('estimasi: jumlah wajar (<= 70)', estimates.length > 0 && estimates.length <= 70, `got ${estimates.length}`);
check('estimasi: aritmetika', estimates.every((i) => i.amount === Math.round(i.volume * (i.unitPrice ?? 0))));
check('estimasi: status pemetaan NOT_APPLICABLE', estimates.every((i) => i.ahspMappingStatus === 'NOT_APPLICABLE'));
check('estimasi: label sumber estimasi contoh', estimates.every((i) => (i.priceSourceLabel ?? '').includes('Estimasi contoh')));

// ---------- rekonsiliasi proyek ----------
const direct = items.reduce((s, i) => s + (i.amount ?? 0), 0);
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
