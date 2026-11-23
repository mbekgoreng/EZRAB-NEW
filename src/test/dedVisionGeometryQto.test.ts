// Suite: DED vision — deterministic geometry-based QTO (increment I4, spec §5/§8).
// src/ai-tools/ded-vision/geometryQto.ts — pure functions over SafeDecimalEngine.
// Semua ground truth dihitung tangan (bukan dari output modul):
//   dinding 3500×3000 mm − pintu 900×2100 mm = 10.5 − 1.89 = 8.61 m²
//   pelat 4000×3000×150 mm = 4 × 3 × 0.15 = 1.8 m³
//   keliling 4000×3000 mm = 2 × (4 + 3) = 14 m
//   luas permukaan balok 4000×3000×150 mm = 2 × (12 + 0.6 + 0.45) = 26.1 m²
//   agregasi 2 lantai @ 8.61 m² = 17.22 m²
// Jalankan dari root repo: npx --yes tsx src/test/dedVisionGeometryQto.test.ts
import {
  qtoLength,
  qtoArea,
  qtoPerimeter,
  qtoVolume,
  qtoCount,
  qtoSurfaceArea,
  qtoWallNetArea,
  aggregateFloors,
} from '../ai-tools/ded-vision/geometryQto';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

/** Exact equality at 4 decimals (SafeDecimalEngine's native scale). */
function eq4(actual: number | null, expected: number): boolean {
  return actual !== null && Math.abs(actual - expected) < 1e-9;
}

function assumptionsMention(q: { assumptions: string[] }, needle: string): boolean {
  return q.assumptions.some((a) => a.includes(needle));
}

console.log('dedVisionGeometryQto — QTO deterministik berbasis geometri');

// --- qtoLength ---
const len = qtoLength(3500, { sourcePages: [2] });
check('panjang 3500 mm = 3.5 m, unit m, kind LENGTH', eq4(len.quantity, 3.5) && len.unit === 'm' && len.kind === 'LENGTH');
check('panjang: status HIGH_CONFIDENCE (VERIFIED tidak pernah otomatis)', len.status === 'HIGH_CONFIDENCE');
check('panjang: sourcePages diteruskan', len.sourcePages.length === 1 && len.sourcePages[0] === 2);
check('panjang: formula display-only memuat konversi', len.formula === '3500 mm = 3.500 m');

// --- qtoArea ---
const area = qtoArea(3500, 3000);
check('luas 3500×3000 mm = 10.5 m²', eq4(area.quantity, 10.5) && area.unit === 'm2' && area.kind === 'AREA');
check('luas: inputs memuat mm dan m', area.inputs.panjang_mm === 3500 && area.inputs.lebar_mm === 3000 && area.inputs.panjang_m === 3.5 && area.inputs.lebar_m === 3);

// --- qtoWallNetArea (fixture utama) ---
const wall = qtoWallNetArea(3500, 3000, [{ widthMm: 900, heightMm: 2100 }], { sourcePages: [3] });
check('dinding netto 3500×3000 − pintu 900×2100 = 8.61 m² (tepat 4 desimal)',
  wall.quantity === 8.61 && wall.unit === 'm2' && wall.kind === 'AREA');
check('dinding netto: bruto 10.5 dan deduksi pintu 1.89 tercantum di inputs',
  wall.inputs.luas_bruto_m2 === 10.5 && wall.inputs.bukaan_1_luas_m2 === 1.89 && wall.inputs.total_bukaan_m2 === 1.89);
check('dinding netto: formula "3.500 × 3.000 − 0.900 × 2.100"',
  wall.formula === '3.500 × 3.000 − 0.900 × 2.100');
check('dinding netto: status HIGH_CONFIDENCE, tanpa asumsi', wall.status === 'HIGH_CONFIDENCE' && wall.assumptions.length === 0);

const wallNoOpening = qtoWallNetArea(3500, 3000, []);
check('dinding tanpa bukaan = bruto 10.5 m²', eq4(wallNoOpening.quantity, 10.5) && wallNoOpening.inputs.jumlah_bukaan === 0);

const wallTwoOpenings = qtoWallNetArea(4000, 3000, [
  { widthMm: 900, heightMm: 2100 },
  { widthMm: 1200, heightMm: 1200 },
]);
check('dinding 2 bukaan: 12 − 1.89 − 1.44 = 8.67 m², tiap deduksi tercantum',
  wallTwoOpenings.quantity === 8.67 && wallTwoOpenings.inputs.bukaan_1_luas_m2 === 1.89 && wallTwoOpenings.inputs.bukaan_2_luas_m2 === 1.44);

// --- qtoVolume (pelat) ---
const slab = qtoVolume(4000, 3000, 150);
check('volume pelat 4000×3000×150 mm = 1.8 m³', slab.quantity === 1.8 && slab.unit === 'm3' && slab.kind === 'VOLUME');
check('volume pelat: formula "4.000 × 3.000 × 0.150"', slab.formula === '4.000 × 3.000 × 0.150');

// --- qtoPerimeter ---
const peri = qtoPerimeter(4000, 3000);
check('keliling 4000×3000 mm = 14 m', eq4(peri.quantity, 14) && peri.unit === 'm' && peri.kind === 'PERIMETER');

// --- qtoSurfaceArea ---
const surf = qtoSurfaceArea(4000, 3000, 150);
check('luas permukaan balok 4000×3000×150 = 26.1 m²', surf.quantity === 26.1 && surf.unit === 'm2' && surf.kind === 'SURFACE_AREA');
check('luas permukaan: tiap sisi tercantum di inputs',
  surf.inputs.sisi_lw_m2 === 12 && surf.inputs.sisi_lh_m2 === 0.6 && surf.inputs.sisi_wh_m2 === 0.45);

// --- qtoCount ---
const cnt = qtoCount(3);
check('count 3 = 3 unit', cnt.quantity === 3 && cnt.unit === 'unit' && cnt.kind === 'COUNT');
const cntZero = qtoCount(0);
check('count 0 adalah nilai sah (bukan missing)', cntZero.quantity === 0 && cntZero.status === 'HIGH_CONFIDENCE');
const cntFrac = qtoCount(2.5);
check('count pecahan 2.5 → null + UNRESOLVED', cntFrac.quantity === null && cntFrac.status === 'UNRESOLVED');

// --- aggregateFloors (2 lantai) ---
const floor1 = qtoWallNetArea(3500, 3000, [{ widthMm: 900, heightMm: 2100 }], { sourcePages: [3] });
const floor2 = qtoWallNetArea(3500, 3000, [{ widthMm: 900, heightMm: 2100 }], { sourcePages: [4] });
const total = aggregateFloors([floor1, floor2]);
check('agregasi 2 lantai: 8.61 + 8.61 = 17.22 m²', total.quantity === 17.22 && total.unit === 'm2' && total.kind === 'AREA');
check('agregasi: tiap lantai tercantum di inputs', total.inputs.lantai_1 === 8.61 && total.inputs.lantai_2 === 8.61 && total.inputs.jumlah_lantai === 2);
check('agregasi: sourcePages gabungan [3, 4]', total.sourcePages.length === 2 && total.sourcePages[0] === 3 && total.sourcePages[1] === 4);
check('agregasi: formula "8.61 + 8.61"', total.formula === '8.61 + 8.61');

const singleFloor = aggregateFloors([floor1]);
check('agregasi 1 lantai = lantai itu sendiri (8.61 m²)', singleFloor.quantity === 8.61);

// --- Missing / invalid inputs → null + UNRESOLVED, tidak pernah 0 ---
const missingWidth = qtoArea(3500, null);
check('luas lebar null → quantity null + UNRESOLVED', missingWidth.quantity === null && missingWidth.status === 'UNRESOLVED');
check('luas lebar null → asumsi menyebut "lebar"', assumptionsMention(missingWidth, 'lebar'));
check('luas lebar null → formula memakai "?" untuk yang hilang', missingWidth.formula === '3.500 × ?');

const missingHeight = qtoVolume(4000, 3000, undefined);
check('volume tinggi undefined → null + UNRESOLVED, asumsi menyebut "tinggi"',
  missingHeight.quantity === null && missingHeight.status === 'UNRESOLVED' && assumptionsMention(missingHeight, 'tinggi'));

const nanInput = qtoArea(NaN, 3000);
check('luas panjang NaN → null + UNRESOLVED', nanInput.quantity === null && nanInput.status === 'UNRESOLVED');

const negative = qtoLength(-500);
check('panjang negatif −500 mm → null + UNRESOLVED (bukan nilai negatif)',
  negative.quantity === null && negative.status === 'UNRESOLVED' && assumptionsMention(negative, 'panjang'));

const negativeCount = qtoCount(-1);
check('count negatif → null + UNRESOLVED', negativeCount.quantity === null && negativeCount.status === 'UNRESOLVED');

const badOpening = qtoWallNetArea(3500, 3000, [{ widthMm: 900, heightMm: null }]);
check('dinding dengan bukaan tinggi null → null + UNRESOLVED, bukaan disebut',
  badOpening.quantity === null && badOpening.status === 'UNRESOLVED' && assumptionsMention(badOpening, 'bukaan ke-1'));

const oversizedOpening = qtoWallNetArea(1000, 1000, [{ widthMm: 900, heightMm: 2100 }]);
check('bukaan (1.89 m²) lebih besar dari dinding (1 m²) → null + UNRESOLVED, bukan negatif',
  oversizedOpening.quantity === null && oversizedOpening.status === 'UNRESOLVED' && assumptionsMention(oversizedOpening, 'melebihi'));

// --- aggregateFloors: mismatch / null member / kosong ---
const mismatched = aggregateFloors([qtoArea(3500, 3000), qtoVolume(4000, 3000, 150)]);
check('agregasi AREA + VOLUME → null + UNRESOLVED (tidak pernah jumlah salah)',
  mismatched.quantity === null && mismatched.status === 'UNRESOLVED' && assumptionsMention(mismatched, 'tidak cocok'));

const withNullMember = aggregateFloors([floor1, qtoArea(3500, null)]);
check('agregasi dengan anggota null → null + UNRESOLVED',
  withNullMember.quantity === null && withNullMember.status === 'UNRESOLVED' && assumptionsMention(withNullMember, 'tidak lengkap'));

const emptyAgg = aggregateFloors([]);
check('agregasi daftar kosong → null + UNRESOLVED', emptyAgg.quantity === null && emptyAgg.status === 'UNRESOLVED');

// --- Confidence → status (VERIFIED tidak pernah otomatis) ---
const lowConf = qtoLength(3500, { confidence: 0.7 });
check('confidence 0.7 → NEEDS_REVIEW, nilai tetap terhitung', lowConf.status === 'NEEDS_REVIEW' && lowConf.quantity === 3.5);
const veryLowConf = qtoLength(3500, { confidence: 0.5 });
check('confidence 0.5 → UNRESOLVED, nilai tetap terhitung', veryLowConf.status === 'UNRESOLVED' && veryLowConf.quantity === 3.5);
const highConf = qtoLength(3500, { confidence: 1 });
check('confidence 1 → HIGH_CONFIDENCE (bukan VERIFIED)', highConf.status === 'HIGH_CONFIDENCE');

// --- Id unik per hasil ---
const idA = qtoLength(1000);
const idB = qtoLength(1000);
check('id hasil berbeda antar panggilan', idA.id !== idB.id);
const idCustom = qtoLength(1000, { id: 'qto-custom-1' });
check('id kustom dari opts dihormati', idCustom.id === 'qto-custom-1');

const totalChecks = pass + fail;
console.log(`\nPASS ${pass}/${totalChecks}`);
if (fail > 0) process.exit(1);
