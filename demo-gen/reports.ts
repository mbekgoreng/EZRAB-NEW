/**
 * Laporan pendamping dataset Premium Demo — digenerate dari MODUL DATA FINAL
 * (src/data/premiumDemoData.ts) + status gerbang yang dihitung ulang dari spec.
 * Output: ~/workspace/your_files/demo-premium/*.csv + jawaban-kunci-skenario.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { SPEC, SPEC as _s, SECTIONS } from './spec';
import { SPEC2 } from './spec2';
import { SPEC3 } from './spec3';
import { matchDedItemToAhsp } from '../src/ai-tools/ded-canonical/canonicalDedPricing';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../src/data/premiumDemoData';
import type { RabItem } from '../src/types';

const OUT = '/home/hatch/workspace/your_files/demo-premium';
const ALL = [...SPEC, ...SPEC2, ...SPEC3];
const items = PREMIUM_DEMO_RAB_ITEMS as RabItem[];
if (items.length !== ALL.length) throw new Error('spec/items tidak sejajar');

const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const verdicts = ALL.map((sp) =>
  matchDedItemToAhsp({ name: sp.name, unit: sp.unit, specification: sp.spec, claimedAhspCode: sp.code }),
);

// ---------- register unresolved ----------
const NEED: Record<string, string> = {
  NEEDS_REVIEW: 'Estimator memilih satu kandidat katalog secara eksplisit di UI (daftar kandidat pada laporan matching).',
  INVALID: 'Harga katalog ditolak gerbang kewajaran kanonis — perlu peninjauan data katalog oleh pengelola data.',
  INCOMPLETE_COMPONENTS: 'Harga resmi salah satu komponen AHSP diterbitkan di basis harga sumber daya (lihat komponen hilang pada laporan matching).',
  NO_MATCH: 'Item pekerjaan di luar katalog AHSP (jasa/pengadaan/peralatan) — perlu harga pasar terverifikasi atau analisa harga satuan mandiri.',
  UNIT_MISMATCH: 'Perbaikan satuan pada record katalog resmi, atau item katalog padanan bersatuan benar.',
};
const regRows = items
  .map((it, i) => ({ it, v: verdicts[i] }))
  .filter(({ it }) => it.priceStatus !== 'PRICE_RESOLVED')
  .map(({ it, v }) => [
    it.wbsCode, it.sectionName, ALL[items.indexOf(it)].name, it.unit, it.volume,
    v.status, it.ahspCode ?? '', v.reason, NEED[v.status] ?? '',
  ]);
fs.writeFileSync(path.join(OUT, 'register-unresolved.csv'),
  ['wbs,seksi,uraian,satuan,volume,status_gerbang,kode_terpetakan,alasan,yang_dibutuhkan',
   ...regRows.map((r) => r.map(esc).join(','))].join('\n'));

// ---------- breakdown biaya (item berharga) ----------
const priced = items.filter((it) => it.priceStatus === 'PRICE_RESOLVED');
const bdRows = priced.map((it) => {
  const m = it.materialPrice ?? 0, l = it.laborPrice ?? 0, e = it.equipmentPrice ?? 0;
  return [it.wbsCode, it.sectionName, it.ahspCode, it.description, it.unit, it.volume,
    m, l, e, it.unitPrice, Math.round(m * it.volume), Math.round(l * it.volume), Math.round(e * it.volume), it.amount];
});
fs.writeFileSync(path.join(OUT, 'breakdown-biaya.csv'),
  ['wbs,seksi,kode_ahsp,uraian,satuan,volume,harga_material_per_satuan,harga_upah_per_satuan,harga_alat_per_satuan,harga_satuan,total_material,total_upah,total_alat,jumlah',
   ...bdRows.map((r) => r.map(esc).join(','))].join('\n'));

// ---------- agregat kebutuhan sumber daya ----------
type Agg = { qty: number; cost: number; items: number };
function aggregate(kind: 'materialComponents' | 'laborComponents' | 'equipmentComponents') {
  const map = new Map<string, Agg & { name: string; unit: string }>();
  for (const it of priced) {
    const snap = it.ahspSnapshot; if (!snap) continue;
    const seen = new Set<string>();
    for (const c of snap[kind]) {
      const key = `${c.name}|${c.unit}`;
      const a = map.get(key) ?? { name: c.name, unit: c.unit, qty: 0, cost: 0, items: 0 };
      a.qty += c.coefficient * it.volume;
      a.cost += (c.total ?? 0) * it.volume;
      if (!seen.has(key)) { a.items += 1; seen.add(key); }
      map.set(key, a);
    }
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}
const aggCsv = (rows: ReturnType<typeof aggregate>) => [
  'sumber_daya,satuan,kebutuhan_total,biaya_total,dipakai_di_berapa_item',
  ...rows.map((a) => [a.name, a.unit, Math.round(a.qty * 100) / 100, Math.round(a.cost), a.items].map(esc).join(',')),
].join('\n');
const aggM = aggregate('materialComponents');
const aggL = aggregate('laborComponents');
const aggE = aggregate('equipmentComponents');
fs.writeFileSync(path.join(OUT, 'kebutuhan-material.csv'), aggCsv(aggM));
fs.writeFileSync(path.join(OUT, 'kebutuhan-upah.csv'), aggCsv(aggL));
fs.writeFileSync(path.join(OUT, 'kebutuhan-alat.csv'), aggCsv(aggE));

// ---------- jawaban kunci skenario ----------
const cs = PREMIUM_DEMO_PROJECT.costSummary!;
const sumSec = (secs: number[]) => items
  .filter((it) => secs.includes(Number(String(it.wbsCode).split('.')[0])))
  .reduce((s, it) => s + (it.amount ?? 0), 0);
const perSection = SECTIONS.map((name, i) => {
  const rows = items.filter((it) => it.sectionName === name);
  return { seksi: name, item: rows.length, berharga: rows.filter((r) => r.amount != null).length,
    jumlah: rows.reduce((s, r) => s + (r.amount ?? 0), 0) };
});
const semenDetail = aggM.filter((a) => /semen/i.test(a.name))
  .map((a) => ({ name: a.name, unit: a.unit, qty: Math.round(a.qty * 100) / 100 }));
const byWbs = (w: string) => items.find((it) => it.wbsCode === w);
const answers = {
  totalRabParsial: cs.directCost,
  grandTotal: cs.grandTotal,
  itemBerharga: priced.length,
  itemBelumBerharga: items.length - priced.length,
  semenKg: Math.round(aggM.filter((a) => a.unit === 'kg' && /semen/i.test(a.name)).reduce((s, a) => s + a.qty, 0)),
  semenDetail,
  totalStruktur: sumSec([4, 5]),
  top5: [...priced].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5)
    .map((it) => ({ wbs: it.wbsCode, uraian: it.description, jumlah: it.amount })),
  volumeDindingLt2: [
    { wbs: '6.2', volume: byWbs('6.2')?.volume, keterangan: 'Eksterior bata merah lantai 2' },
    { wbs: '6.5', volume: byWbs('6.5')?.volume, keterangan: 'Partisi bata ringan lantai 2' },
    { wbs: '6.3 (bagian Lt2)', volume: 38, keterangan: 'Dinding KM lantai 2 dari item gabungan 61 m² (Lt1 23 + Lt2 38, lihat basis item)' },
    { total: (byWbs('6.2')?.volume ?? 0) + (byWbs('6.5')?.volume ?? 0) + 38 },
  ],
  totalMEP: sumSec([13, 14, 15, 16, 17]),
  totalArsitektur: sumSec([6, 7, 8, 9, 10, 11, 12, 19]),
  totalMaterial: priced.reduce((s, it) => s + Math.round((it.materialPrice ?? 0) * it.volume), 0),
  totalUpah: priced.reduce((s, it) => s + Math.round((it.laborPrice ?? 0) * it.volume), 0),
  totalAlat: priced.reduce((s, it) => s + Math.round((it.equipmentPrice ?? 0) * it.volume), 0),
  perSection,
};
fs.writeFileSync(path.join(OUT, 'jawaban-kunci-skenario.json'), JSON.stringify(answers, null, 2));
console.log('directCost', cs.directCost, '| grand', cs.grandTotal);
console.log('material', answers.totalMaterial, '| upah', answers.totalUpah, '| alat', answers.totalAlat);
console.log('semen kg:', answers.semenKg, '| struktur', answers.totalStruktur, '| MEP', answers.totalMEP, '| arsitektur', answers.totalArsitektur);
console.log('top5:', answers.top5.map((t) => `${t.wbs}:${t.jumlah}`).join(' '));
