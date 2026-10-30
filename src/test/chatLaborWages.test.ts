/**
 * chatLaborWages — regresi routing pertanyaan upah EZRAB Chat.
 *
 * Latar: pertanyaan "berapa upah mandor dan tukang di proyek yang saya
 * pilih?" pernah dijawab dengan baris item RAB (volume × harga satuan
 * pekerjaan = subtotal) karena tidak ada tool rincian upah. Suite ini
 * mengunci perilaku tool get_project_labor + pagar integritasnya:
 * (1) pertanyaan persis contoh dengan item legacy A.2.2.1.1,
 * (2) item berkode katalog menampilkan tabel upah SE 47/2026,
 * (3) perilaku tool ringkasan RAB generik tidak berubah (byte-stable),
 * (4) data upah hilang dinyatakan eksplisit (tanpa karangan, tanpa Rp0),
 * (5) ganti proyek tanpa kebocoran antar-proyek,
 * (6) tanpa proyek aktif -> pesan jujur; referensi umum via cari_harga utuh.
 */
import { runTool, setActiveProjectSnapshot } from '../ai-tools/ezrab-ai/tools';
import { buildProjectSnapshot } from '../ai-tools/ezrab-ai/projectContext';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function snap(projectId: string, projectName: string, items: Array<Record<string, unknown>>) {
  return buildProjectSnapshot({ id: projectId, name: projectName }, items);
}

const LEGACY_BOWPLANK = {
  id: 'it-legacy-1',
  code: 'A.2.2.1.1',
  description: 'Pengukuran dan pemasangan Bowplank',
  unit: "m'",
  volume: 124.5,
  unitPrice: 48500,
  totalPrice: 6038250,
  priceStatus: 'PRICE_RESOLVED',
  sectionName: 'Pekerjaan Persiapan',
};
const CATALOG_BOWPLANK = {
  id: 'it-cat-1',
  code: '1.1.4.2',
  description: "Pasangan 1 m' bouwplank",
  unit: "m'",
  volume: 50,
  unitPrice: 51240,
  totalPrice: 2562000,
  priceStatus: 'PRICE_RESOLVED',
  sectionName: 'Pekerjaan Persiapan',
};
const CATALOG_PLASTER = {
  id: 'it-cat-2',
  code: '3.7.4',
  description: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm',
  unit: 'm2',
  volume: 200,
  unitPrice: 51622,
  totalPrice: 10324400,
  priceStatus: 'PRICE_RESOLVED',
  sectionName: 'Pekerjaan Dinding',
};
const NO_LABOR_ITEM = {
  id: 'it-nolabor',
  code: '1.3.3.1',
  description: 'Item katalog tanpa komponen upah',
  unit: 'm3',
  volume: 10,
  unitPrice: 100000,
  totalPrice: 1000000,
  priceStatus: 'PRICE_RESOLVED',
  sectionName: 'Pekerjaan Tanah',
};

console.log('== Grup 1: pertanyaan persis contoh (item legacy A.2.2.1.1) ==');
setActiveProjectSnapshot(snap('p-legacy', 'Proyek Legacy', [LEGACY_BOWPLANK]));
const g1 = String(runTool('get_project_labor', {}));
check('menyatakan rincian upah TIDAK TERSEDIA', g1.includes('TIDAK TERSEDIA'));
check('menyebut kode A.2.2.1.1 apa adanya', g1.includes('A.2.2.1.1'));
check('menyatakan kode tidak ada di katalog', g1.includes('tidak ada di katalog AHSP 2026'));
check('TIDAK memetakan diam-diam ke 1.1.4.2', !g1.includes('1.1.4.2'));
check('TIDAK menyajikan subtotal item sebagai upah', !g1.includes('6.038.250'));
check('referensi umum berlabel BUKAN data proyek', g1.includes('BUKAN data proyek ini'));
check('referensi memuat Mandor', g1.includes('Mandor'));

console.log('== Grup 2: item berkode katalog -> tabel upah SE 47/2026 ==');
setActiveProjectSnapshot(snap('p-catalog', 'Rumah 2 Lantai', [CATALOG_BOWPLANK, CATALOG_PLASTER]));
const g2 = String(runTool('get_project_labor', {}));
check('memuat kategori Mandor', g2.includes('Mandor'));
check('memuat tarif Mandor Rp200.000', g2.includes('Rp200.000') || g2.includes('Rp 200.000'));
check('memuat koefisien Mandor bouwplank 0,0012', g2.includes('0,0012'));
check('memuat tarif Tukang Rp145.000', g2.includes('Rp145.000') || g2.includes('Rp 145.000'));
check('menyebut sumber Standar Upah Cipta Karya SE 47/2026', g2.includes('Standar Upah Cipta Karya SE 47/2026'));
check('membingkai sebagai analisa AHSP, bukan upah khusus proyek', g2.includes('ANALISA AHSP katalog'));
check('memuat tarif ringkas per kategori', g2.includes('Tarif upah yang dipakai dalam analisa'));
const g2k = String(runTool('get_project_labor', { kategori: 'mandor' }));
check('filter kategori mandor: memuat Mandor', g2k.includes('Mandor'));
check('filter kategori mandor: baris Tukang biasa tidak ikut', !g2k.includes('Tukang: koefisien'));
const g2n = String(runTool('get_project_labor', { nama: 'bouwplank' }));
check('filter nama item: hanya item bouwplank', g2n.includes('bouwplank') && !g2n.includes('plesteran'));

console.log('== Grup 3: perilaku ringkasan RAB generik tidak berubah ==');
setActiveProjectSnapshot(snap('p-catalog', 'Rumah 2 Lantai', [CATALOG_BOWPLANK, CATALOG_PLASTER]));
const total = String(runTool('get_project_total', {}));
check(
  'get_project_total byte-stable',
  total.startsWith('Subtotal langsung proyek "Rumah 2 Lantai": Rp12.886.400\nJumlah item: 2'),
  total.split('\n')[0],
);
const items = String(runTool('get_project_items', {}));
check(
  'get_project_items byte-stable',
  items ===
    "1. Pasangan 1 m' bouwplank — 50 m' × Rp51.240/m' = Rp2.562.000\n" +
      '2. Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm — 200 m2 × Rp51.622/m2 = Rp10.324.400',
  items,
);
const detail = String(runTool('get_item_detail', { nama: 'bouwplank' }));
check('get_item_detail tetap memuat harga satuan pekerjaan', detail.includes('Harga satuan: Rp51.240'));

console.log('== Grup 4: data upah hilang -> eksplisit, tanpa karangan, tanpa Rp0 ==');
setActiveProjectSnapshot(snap('p-nolabor', 'Proyek Tanpa Upah', [NO_LABOR_ITEM]));
const g4 = String(runTool('get_project_labor', {}));
check('item tanpa komponen upah dinyatakan tidak tersedia', g4.includes('TIDAK TERSEDIA'));
check('penyebab dinyatakan (tidak memuat komponen upah)', g4.includes('tidak memuat komponen upah'));
check('tidak ada angka upah karangan Rp0', !/Rp ?0(?![0-9.])/.test(g4.replace(/Rp200\.000|Rp145\.000|Rp175\.000|Rp100\.000/g, '')));
setActiveProjectSnapshot(snap('p-catalog', 'Rumah 2 Lantai', [CATALOG_BOWPLANK]));
const g4b = String(runTool('get_project_labor', { kategori: 'operator' }));
check('kategori tak dikenal: dinyatakan tidak ditemukan + kategori tersedia disebut', g4b.includes('tidak ditemukan') && g4b.includes('Mandor'));

console.log('== Grup 5: ganti proyek tanpa kebocoran ==');
setActiveProjectSnapshot(snap('p-a', 'Proyek A', [CATALOG_PLASTER]));
const gA = String(runTool('get_project_labor', {}));
check('jawaban memakai proyek A', gA.includes('Proyek A') && gA.includes('plesteran'));
setActiveProjectSnapshot(snap('p-b', 'Proyek B', [LEGACY_BOWPLANK]));
const gB = String(runTool('get_project_labor', {}));
check('jawaban memakai proyek B', gB.includes('Proyek B'));
check('tidak ada kebocoran item proyek A', !gB.includes('plesteran'));
check('snapshot B (legacy) tetap tidak tersedia', gB.includes('TIDAK TERSEDIA'));

console.log('== Grup 6: tanpa proyek aktif + referensi umum utuh ==');
setActiveProjectSnapshot(null);
const g6 = String(runTool('get_project_labor', {}));
check('tanpa proyek: pesan jujur tidak ada proyek aktif', g6.includes('Tidak ada proyek aktif'));
const ref = String(runTool('cari_harga', { kata_kunci: 'Mandor', jenis: 'upah' }));
check('cari_harga upah Mandor tetap mengembalikan referensi', ref.includes('Mandor'));
check('referensi memuat status sumber', ref.includes('Status sumber'));

setActiveProjectSnapshot(null);
console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
