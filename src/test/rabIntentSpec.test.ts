// Suite: RAB intent-spec extractor (Worker A — FIX global Chat AI RAB).
// Membuktikan extractor `rabIntentSpec.ts` menangkap spesifikasi RAB dari
// teks bebas TANPA mengarang: null/[] = UNKNOWN, luas tanah vs luas
// bangunan terpisah, "type 70" tidak bocor jadi luas, dimensi tidak
// diturunkan jadi luas, merge hanya menimpa field yang disebut eksplisit.
// Skrip asersi tsx polos (BUKAN vitest).
// Jalankan dari root repo: npx --yes tsx src/test/rabIntentSpec.test.ts
import {
  extractRabIntentSpec,
  mergeRabIntentSpec,
  identifyMissingSpec,
  specFieldLabel,
  type RabIntentSpec,
} from '../ai-tools/ezrab-ai/rabIntentSpec.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

/** JSON spesifikasi tanpa rawText (rawText boleh memuat angka mentah input). */
function specWithoutRaw(spec: RabIntentSpec): string {
  const { rawText: _raw, ...rest } = spec;
  return JSON.stringify(rest);
}

function containsCI(list: string[], needle: string): boolean {
  return list.some((x) => x.toLowerCase().includes(needle.toLowerCase()));
}

console.log('§7.1 — REPRODUCTION CASE (input persis laporan bug)');
{
  const spec = extractRabIntentSpec(
    'buatkan rab rumah dengan luas 100m2 luas bangunan 86m2 lengkap dari pondasi sampai atap. memakai atap baja wf dan campuran baja ringan',
  );
  check('repro: landAreaM2=100', spec.landAreaM2 === 100, spec.landAreaM2);
  check('repro: buildingAreaM2=86', spec.buildingAreaM2 === 86, spec.buildingAreaM2);
  check('repro: floors=null (tidak dikarang)', spec.floors === null, spec.floors);
  check('repro: bedrooms=null (tidak dikarang)', spec.bedrooms === null, spec.bedrooms);
  check('repro: bathrooms=null (tidak dikarang)', spec.bathrooms === null, spec.bathrooms);
  check('repro: location=null (tidak ditebak)', spec.location === null, spec.location);
  check("repro: roofSystem memuat 'baja WF'", containsCI(spec.roofSystem, 'baja WF'), spec.roofSystem);
  check("repro: roofSystem memuat 'baja ringan'", containsCI(spec.roofSystem, 'baja ringan'), spec.roofSystem);
  check(
    'repro: scope mengindikasikan lengkap/pondasi–atap',
    containsCI(spec.scope, 'pondasi sampai atap') || containsCI(spec.scope, 'lengkap'),
    spec.scope,
  );
  check('repro: buildingType=rumah', spec.buildingType === 'rumah', spec.buildingType);
  check("repro: TIDAK ADA '70' di spesifikasi (tanpa leakage Type 70)", !specWithoutRaw(spec).includes('70'), specWithoutRaw(spec));
  check(
    'repro: explicitFields memuat luas + atap + scope, BUKAN floors/kamar/lokasi',
    spec.explicitFields.includes('landAreaM2') &&
      spec.explicitFields.includes('buildingAreaM2') &&
      spec.explicitFields.includes('roofSystem') &&
      spec.explicitFields.includes('scope') &&
      !spec.explicitFields.includes('floors') &&
      !spec.explicitFields.includes('bedrooms') &&
      !spec.explicitFields.includes('location'),
    spec.explicitFields,
  );
  const missing = identifyMissingSpec(spec);
  check(
    'repro: missing memuat floors/location/bedrooms/bathrooms, BUKAN luas/atap/scope',
    missing.includes('floors') &&
      missing.includes('location') &&
      missing.includes('bedrooms') &&
      missing.includes('bathrooms') &&
      !missing.includes('landAreaM2') &&
      !missing.includes('buildingAreaM2') &&
      !missing.includes('roofSystem') &&
      !missing.includes('scope'),
    missing,
  );
}

console.log('§7.2 — Luas eksplisit menang atas "type 70"');
{
  const spec = extractRabIntentSpec('buatkan RAB rumah type 70 tapi luas bangunan 120 m2');
  check('type70: buildingAreaM2=120 (eksplisit menang)', spec.buildingAreaM2 === 120, spec.buildingAreaM2);
  check("type70: TIDAK ADA '70' di spesifikasi", !specWithoutRaw(spec).includes('70'), specWithoutRaw(spec));
  check('type70: landAreaM2=null', spec.landAreaM2 === null, spec.landAreaM2);
}

console.log('§7.3 — Luas tanah & luas bangunan terpisah');
{
  const spec = extractRabIntentSpec('luas tanah 200 m2, luas bangunan 150 m2');
  check('pisah: landAreaM2=200', spec.landAreaM2 === 200, spec.landAreaM2);
  check('pisah: buildingAreaM2=150', spec.buildingAreaM2 === 150, spec.buildingAreaM2);
  const onlyLand = extractRabIntentSpec('luas tanah 120 m2');
  check('pisah: luas tanah saja → land=120, building=null', onlyLand.landAreaM2 === 120 && onlyLand.buildingAreaM2 === null, onlyLand);
  const lb = extractRabIntentSpec('rumah LB 86 LT 120');
  check('pisah: LB 86 / LT 120 → building=86, land=120', lb.buildingAreaM2 === 86 && lb.landAreaM2 === 120, lb);
  const bare = extractRabIntentSpec('rumah luas 100 m2');
  check('pisah: "luas" telanjang tunggal → building=100', bare.buildingAreaM2 === 100 && bare.landAreaM2 === null, bare);
  const comma = extractRabIntentSpec('luas bangunan 86,5 m²');
  check('pisah: desimal koma + m² → building=86.5', comma.buildingAreaM2 === 86.5, comma.buildingAreaM2);
  const words = extractRabIntentSpec('luas bangunan 120 meter persegi');
  check('pisah: "meter persegi" → building=120', words.buildingAreaM2 === 120, words.buildingAreaM2);
}

console.log('§7.4 — Material & struktur kustom dipertahankan');
{
  const spec = extractRabIntentSpec('struktur baja WF, dinding bata ringan, cat Dulux');
  check("kustom: structuralSystem memuat 'baja WF'", containsCI(spec.structuralSystem, 'baja WF'), spec.structuralSystem);
  check("kustom: materials memuat 'bata ringan'", containsCI(spec.materials, 'bata ringan'), spec.materials);
  check("kustom: materials memuat 'cat Dulux'", containsCI(spec.materials, 'cat Dulux'), spec.materials);
  const spec2 = extractRabIntentSpec('pondasi batu kali, struktur beton bertulang, keramik granit, kayu jati');
  check("kustom: foundationSystem='batu kali'", spec2.foundationSystem === 'batu kali', spec2.foundationSystem);
  check("kustom: structural memuat 'beton bertulang'", containsCI(spec2.structuralSystem, 'beton bertulang'), spec2.structuralSystem);
  check("kustom: materials memuat 'keramik granit'", containsCI(spec2.materials, 'keramik granit'), spec2.materials);
  check("kustom: materials memuat 'kayu jati'", containsCI(spec2.materials, 'kayu jati'), spec2.materials);
}

console.log('§7.5 — Gedung bertingkat');
{
  const spec = extractRabIntentSpec('gedung 3 lantai, luas bangunan 450 m2');
  check('lantai: floors=3', spec.floors === 3, spec.floors);
  check('lantai: buildingAreaM2=450', spec.buildingAreaM2 === 450, spec.buildingAreaM2);
  check('lantai: buildingType=gedung', spec.buildingType === 'gedung', spec.buildingType);
  const missing = identifyMissingSpec(spec);
  check('lantai: gedung TIDAK ditanya kamar tidur/mandi', !missing.includes('bedrooms') && !missing.includes('bathrooms'), missing);
  const words = extractRabIntentSpec('rumah dua lantai');
  check('lantai: "dua lantai" → floors=2', words.floors === 2, words.floors);
  const one = extractRabIntentSpec('rumah 1 lantai');
  check('lantai: "1 lantai" → floors=1', one.floors === 1, one.floors);
}

console.log('§7.6 — Renovasi');
{
  const spec = extractRabIntentSpec('buat RAB renovasi rumah, ganti atap genteng, tambah 1 kamar');
  check("renovasi: projectCategory='renovasi'", spec.projectCategory === 'renovasi', spec.projectCategory);
  check("renovasi: roofSystem memuat 'genteng'", containsCI(spec.roofSystem, 'genteng'), spec.roofSystem);
  check('renovasi: "tambah 1 kamar" → bedrooms=1', spec.bedrooms === 1, spec.bedrooms);
  const baru = extractRabIntentSpec('buat RAB rumah baru, bangun baru 2 lantai');
  check("renovasi: 'bangun baru' → projectCategory='baru'", baru.projectCategory === 'baru', baru.projectCategory);
}

console.log('§7.7 — Spesifikasi tidak lengkap');
{
  const spec = extractRabIntentSpec('buatkan RAB rumah');
  check('kosong: hampir semua null', spec.buildingAreaM2 === null && spec.floors === null && spec.bedrooms === null && spec.bathrooms === null && spec.location === null && spec.roofSystem.length === 0 && spec.foundationSystem === null, spec);
  const missing = identifyMissingSpec(spec);
  check('kosong: identifyMissingSpec tidak kosong', missing.length > 0, missing);
  check('kosong: missing TIDAK memuat buildingType (sudah diisi)', !missing.includes('buildingType'), missing);
  check('kosong: missing mengutamakan luas/lantai/lokasi/kamar', missing.indexOf('buildingAreaM2') < missing.indexOf('floors') && missing.indexOf('floors') < missing.indexOf('location') && missing.indexOf('location') < missing.indexOf('bedrooms'), missing);
  const warehouse = extractRabIntentSpec('buatkan RAB gudang');
  const wMissing = identifyMissingSpec(warehouse);
  check('kosong: gudang TIDAK ditanya kamar tidur/mandi', !wMissing.includes('bedrooms') && !wMissing.includes('bathrooms'), wMissing);
}

console.log('§7.8 — Koreksi via merge (hanya field yang disebut yang berubah)');
{
  const base = extractRabIntentSpec(
    'buatkan rab rumah dengan luas 100m2 luas bangunan 86m2 lengkap dari pondasi sampai atap. memakai atap baja wf dan campuran baja ringan',
  );
  const m1 = mergeRabIntentSpec(base, 'lantainya 2, lokasinya di Malang');
  check('merge1: floors=2', m1.floors === 2, m1.floors);
  check("merge1: location='Malang'", m1.location === 'Malang', m1.location);
  check('merge1: landAreaM2 tetap 100', m1.landAreaM2 === 100, m1.landAreaM2);
  check('merge1: buildingAreaM2 tetap 86', m1.buildingAreaM2 === 86, m1.buildingAreaM2);
  check('merge1: roofSystem TIDAK berubah', m1.roofSystem.length === base.roofSystem.length && containsCI(m1.roofSystem, 'baja WF') && containsCI(m1.roofSystem, 'baja ringan'), m1.roofSystem);
  check(
    'merge1: explicitFields = gabungan (lama + floors + location)',
    m1.explicitFields.includes('landAreaM2') && m1.explicitFields.includes('floors') && m1.explicitFields.includes('location'),
    m1.explicitFields,
  );
  const m2 = mergeRabIntentSpec(m1, 'bangunannya jadi 90 m2');
  check('merge2: buildingAreaM2=90', m2.buildingAreaM2 === 90, m2.buildingAreaM2);
  check('merge2: landAreaM2 tetap 100', m2.landAreaM2 === 100, m2.landAreaM2);
  check('merge2: floors tetap 2', m2.floors === 2, m2.floors);
  check("merge2: location tetap 'Malang'", m2.location === 'Malang', m2.location);
  check('merge2: buildingType tetap rumah (bukan dari kata "bangunan")', m2.buildingType === 'rumah', m2.buildingType);
  const m3 = mergeRabIntentSpec(m2, 'tambah atap genteng');
  check("merge3: roof bertambah 'genteng', 'baja WF' tetap ada", containsCI(m3.roofSystem, 'genteng') && containsCI(m3.roofSystem, 'baja WF'), m3.roofSystem);
  check('merge3: rawText merangkai riwayat koreksi', m3.rawText.includes('lantainya 2') && m3.rawText.includes('bangunannya jadi 90 m2'), m3.rawText);
}

console.log('§7.9 — Berbasis DED');
{
  const spec = extractRabIntentSpec('buat RAB berdasarkan gambar kerja, luas bangunan 200 m2');
  check("ded: source='ded'", spec.source === 'ded', spec.source);
  check('ded: buildingAreaM2=200', spec.buildingAreaM2 === 200, spec.buildingAreaM2);
  check('ded: identifyMissingSpec kosong (gambar yang menjawab)', identifyMissingSpec(spec).length === 0, identifyMissingSpec(spec));
  const tpl = extractRabIntentSpec('buat RAB pakai template rumah type 45');
  check("ded: 'template' → source='template'", tpl.source === 'template', tpl.source);
  check("ded: template 'type 45' TIDAK jadi luas", tpl.buildingAreaM2 === null && !specWithoutRaw(tpl).includes('45'), specWithoutRaw(tpl));
  const free = extractRabIntentSpec('buatkan RAB rumah');
  check("ded: tanpa sinyal DED/template → source='free'", free.source === 'free', free.source);
}

console.log('§7.10 — Pengecualian');
{
  const spec = extractRabIntentSpec('buat RAB rumah 100 m2 tanpa pagar dan tidak termasuk interior');
  check("excl: buildingAreaM2=100 (bare luas → bangunan)", spec.buildingAreaM2 === 100, spec.buildingAreaM2);
  check("excl: exclusions memuat 'pagar'", containsCI(spec.exclusions, 'pagar'), spec.exclusions);
  check("excl: exclusions memuat 'interior'", containsCI(spec.exclusions, 'interior'), spec.exclusions);
  const spec2 = extractRabIntentSpec('RAB rumah, kecuali lanskap, di luar pagar keliling');
  check("excl: 'kecuali lanskap' → exclusions memuat 'lanskap'", containsCI(spec2.exclusions, 'lanskap'), spec2.exclusions);
}

console.log('§7.11 — Dimensi (tanpa turunan luas diam-diam)');
{
  const spec = extractRabIntentSpec('rumah 6x12 m, 2 lantai');
  check('dimensi: widthM=6 (lebar x panjang)', spec.dimensionsM?.widthM === 6, spec.dimensionsM);
  check('dimensi: lengthM=12', spec.dimensionsM?.lengthM === 12, spec.dimensionsM);
  check('dimensi: floors=2', spec.floors === 2, spec.floors);
  check('dimensi: buildingAreaM2 TETAP null (tidak dihitung dari 6x12)', spec.buildingAreaM2 === null, spec.buildingAreaM2);
  const words = extractRabIntentSpec('rumah lebar 6 panjang 12');
  check('dimensi: "lebar 6 panjang 12" → 6x12', words.dimensionsM?.widthM === 6 && words.dimensionsM?.lengthM === 12, words.dimensionsM);
  const cross = extractRabIntentSpec('rumah 5×10 m');
  check('dimensi: "5×10 m" (tanda ×) → 5x10', cross.dimensionsM?.widthM === 5 && cross.dimensionsM?.lengthM === 10, cross.dimensionsM);
}

console.log('§7.12 — Budget, kualitas, kamar, lokasi (tambahan)');
{
  const b1 = extractRabIntentSpec('buat RAB rumah budget 500 juta');
  check('budget: "500 juta" → 500000000', b1.budgetIdr === 500_000_000, b1.budgetIdr);
  const b2 = extractRabIntentSpec('anggaran Rp 1,2 M');
  check('budget: "Rp 1,2 M" → 1200000000', b2.budgetIdr === 1_200_000_000, b2.budgetIdr);
  const b3 = extractRabIntentSpec('dana 300jt, kualitas premium');
  check('budget: "300jt" → 300000000', b3.budgetIdr === 300_000_000, b3.budgetIdr);
  check("kualitas: 'premium'", b3.quality === 'premium', b3.quality);
  const b4 = extractRabIntentSpec('Rp 500.000.000 untuk rumah 2 lantai');
  check('budget: "Rp 500.000.000" → 500000000', b4.budgetIdr === 500_000_000, b4.budgetIdr);
  const r1 = extractRabIntentSpec('rumah 3 kamar tidur, 2 kamar mandi');
  check('kamar: bedrooms=3', r1.bedrooms === 3, r1.bedrooms);
  check('kamar: bathrooms=2', r1.bathrooms === 2, r1.bathrooms);
  const r2 = extractRabIntentSpec('rumah 3 KT 2 KM');
  check('kamar: "3 KT 2 KM" → 3/2', r2.bedrooms === 3 && r2.bathrooms === 2, r2);
  const r3 = extractRabIntentSpec('rumah 2 kamar mandi');
  check('kamar: "2 kamar mandi" TIDAK jadi bedrooms', r3.bedrooms === null && r3.bathrooms === 2, r3);
  const l1 = extractRabIntentSpec('buat RAB rumah di Malang 2 lantai');
  check("lokasi: 'di Malang' → 'Malang'", l1.location === 'Malang', l1.location);
  const l2 = extractRabIntentSpec('lokasi di Surabaya, rumah 100 m2');
  check("lokasi: 'lokasi di Surabaya' → 'Surabaya'", l2.location === 'Surabaya', l2.location);
  const l3 = extractRabIntentSpec('rumah di atas tanah 100 m2');
  check('lokasi: "di atas tanah" BUKAN lokasi', l3.location === null, l3.location);
  const s1 = extractRabIntentSpec('RAB rumah struktur saja, tanpa finishing');
  check("scope: 'struktur saja'", containsCI(s1.scope, 'struktur saja'), s1.scope);
  check("scope: 'tanpa finishing' → exclusions", containsCI(s1.exclusions, 'finishing'), s1.exclusions);
}

console.log('§7.13 — Label field Indonesia');
{
  check("label: floors → 'jumlah lantai'", specFieldLabel('floors') === 'jumlah lantai', specFieldLabel('floors'));
  check("label: buildingAreaM2 → 'luas bangunan'", specFieldLabel('buildingAreaM2') === 'luas bangunan', specFieldLabel('buildingAreaM2'));
  check("label: landAreaM2 → 'luas tanah'", specFieldLabel('landAreaM2') === 'luas tanah', specFieldLabel('landAreaM2'));
  check("label: roofSystem → 'sistem atap'", specFieldLabel('roofSystem') === 'sistem atap', specFieldLabel('roofSystem'));
  check("label: unknown key dikembalikan apa adanya", specFieldLabel('fieldBaru') === 'fieldBaru', specFieldLabel('fieldBaru'));
  const spec = extractRabIntentSpec('buatkan RAB rumah');
  check(
    'label: semua missing field punya label',
    identifyMissingSpec(spec).every((f) => specFieldLabel(f).length > 0 && specFieldLabel(f) !== f),
    identifyMissingSpec(spec),
  );
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
