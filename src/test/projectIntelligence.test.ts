/**
 * projectIntelligence — Fase A Asisten AI: tool baca intelijen proyek.
 *
 * Mencakup: ringkasan per seksi, item termahal, kebutuhan material dari
 * analisa AHSP (koefisien × volume, agregasi satuan-sama), provenance pada
 * detail item, dan jalur tidak-tersedia yang jujur untuk kode legacy.
 *
 * Jalankan: bundle dengan esbuild lalu node (pola suite chatLaborWages).
 */
import { setActiveProjectSnapshot, EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';
import type { ProjectSnapshot } from '../ai-tools/ezrab-ai/projectContext';

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed += 1; console.log(`  PASS ${label}`); }
  else { failed += 1; console.error(`  FAIL ${label}`); }
}
function includes(hay: string, needle: string, label: string): void {
  ok(hay.includes(needle), `${label} (mengandung "${needle}")`);
}
function tool(name: string): (args: Record<string, unknown>) => string {
  const t = EZRAB_AI_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} tidak ditemukan`);
  return t.invoke as (args: Record<string, unknown>) => string;
}

function makeSnap(items: Array<Record<string, unknown>>, over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  const full = items.map((i) => ({
    id: '', code: '', description: '', unit: '', volume: 0, unitPrice: null, totalPrice: 0,
    priceStatus: 'PRICE_RESOLVED', sectionName: '', ahspCode: '', ahspMappingStatus: '', priceSourceKind: '',
    ...i,
  })) as ProjectSnapshot['items'];
  return {
    projectId: 'P-INT', projectName: 'Proyek Intelijen',
    itemCount: full.length,
    totalDirect: full.reduce((s, i) => s + i.totalPrice, 0),
    unresolvedCount: full.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').length,
    unresolvedItems: full.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED'),
    items: full, truncated: false, costBreakdown: null, ...over,
  } as ProjectSnapshot;
}

console.log('== Seksi & item termahal ==');
{
  const snap = makeSnap([
    { id: 'a', code: '1.1.4.2', description: 'Pasangan bouwplank', unit: "m'", volume: 124.5, unitPrice: 48500, totalPrice: 6038250, sectionName: 'Persiapan' },
    { id: 'b', code: '3.7.4', description: 'Plesteran dinding', unit: 'm2', volume: 200, unitPrice: 150000, totalPrice: 30000000, sectionName: 'Dinding' },
    { id: 'c', code: 'X.1', description: 'Item misterius', unit: 'ls', volume: 1, unitPrice: null, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED', sectionName: 'Dinding' },
  ]);
  setActiveProjectSnapshot(snap);
  const sections = tool('get_project_sections')({});
  includes(sections, 'Persiapan: 1 item', 'seksi Persiapan terdaftar');
  includes(sections, 'Dinding: 2 item', 'seksi Dinding terdaftar');
  includes(sections, '1 item belum berharga', 'seksi Dinding mencatat item belum berharga');
  includes(sections, 'Rp36.038.250', 'total langsung = jumlah subtotal ter-resolve');
  const top = tool('get_project_costliest')({ jumlah: 2 });
  ok(top.indexOf('Plesteran dinding') < top.indexOf('Pasangan bouwplank'), 'peringkat: plesteran (30 jt) di atas bouwplank (6 jt)');
  includes(top, '1 item belum berharga dan tidak ikut peringkat', 'catatan item belum berharga disebut');
  ok(!top.split('\n').some((l) => l.startsWith('1.') && l.includes('misterius')), 'item belum berharga TIDAK masuk peringkat');
}

console.log('== Kebutuhan material dari analisa AHSP ==');
{
  const snap = makeSnap([
    { id: 'a', code: '1.1.4.2', description: 'Pasangan bouwplank', unit: "m'", volume: 124.5, unitPrice: 155785, totalPrice: 19395232, sectionName: 'Persiapan' },
    { id: 'b', code: '3.7.4', description: 'Plesteran 1SP:4PP', unit: 'm2', volume: 200, unitPrice: 51622, totalPrice: 10324400, sectionName: 'Dinding' },
  ]);
  setActiveProjectSnapshot(snap);
  const mats = tool('get_project_materials')({});
  includes(mats, 'Kebutuhan material', 'judul kebutuhan material');
  includes(mats, 'Semen portland (PC)', 'semen dari analisa plesteran tampil');
  includes(mats, '1.248 kg', 'kebutuhan semen = 6,24 kg × 200 m2 = 1.248 kg');
  includes(mats, 'Paku 2 inch', 'paku dari analisa bouwplank tampil');
  includes(mats, '2,49 kg', 'kebutuhan paku = 0,02 kg × 124,5 = 2,49 kg');
  includes(mats, 'Pasir pasang', 'pasir tampil dengan satuannya sendiri (m3, tidak dicampur kg)');
  const one = tool('get_project_materials')({ nama: 'plesteran' });
  includes(one, 'Semen portland (PC)', 'mode satu item: semen tampil');
  ok(!one.includes('Paku 2 inch'), 'mode satu item: material item lain tidak ikut');
}

console.log('== Material: kode legacy tidak dipetakan diam-diam ==');
{
  const snap = makeSnap([
    { id: 'l1', code: 'A.2.2.1.1', description: 'Pengukuran dan pemasangan Bowplank', unit: "m'", volume: 124.5, unitPrice: 48500, totalPrice: 6038250, sectionName: 'Persiapan' },
  ]);
  setActiveProjectSnapshot(snap);
  const mats = tool('get_project_materials')({});
  includes(mats, 'TIDAK TERSEDIA', 'material legacy dinyatakan tidak tersedia');
  includes(mats, 'A.2.2.1.1', 'kode legacy disebut apa adanya');
  ok(!mats.includes('Semen portland'), 'tidak ada material karangan untuk kode legacy');
}

console.log('== Detail item: provenance & pemetaan ==');
{
  const snap = makeSnap([
    { id: 'a', code: '1.1.4.2', ahspCode: '1.1.4.2', ahspMappingStatus: 'VERIFIED', priceSourceKind: 'OFFICIAL_AHSP', description: 'Pasangan bouwplank', unit: "m'", volume: 10, unitPrice: 155785, totalPrice: 1557850, sectionName: 'Persiapan' },
  ]);
  setActiveProjectSnapshot(snap);
  const detail = tool('get_item_detail')({ nama: 'bouwplank' });
  includes(detail, 'Kode AHSP tertaut: 1.1.4.2', 'ahspCode tampil di detail');
  includes(detail, 'Status pemetaan AHSP: VERIFIED', 'status pemetaan tampil');
  includes(detail, 'Jenis sumber harga: AHSP resmi', 'jenis sumber harga diterjemahkan');
}

console.log('== Tanpa proyek aktif ==');
{
  setActiveProjectSnapshot(null);
  const out = tool('get_project_materials')({});
  includes(out, 'Tidak ada proyek aktif', 'tanpa snapshot: pesan jujur');
  const out2 = tool('get_project_sections')({});
  includes(out2, 'Tidak ada proyek aktif', 'seksi tanpa snapshot: pesan jujur');
}

console.log(`\nprojectIntelligence: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
