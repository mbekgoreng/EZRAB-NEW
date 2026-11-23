// Suite: DED vision page classification (increment I1, spec §2) —
// src/ai-tools/ded-vision/classification.ts
// Ground-truth fixtures for EACH of the 13 spec classes + UNKNOWN
// (empty text, no title, text without drawing terms, scanned page with
// untrusted text) + an ambiguous mixed-signal page + a single weak
// signal + title-only scanned page + title-start disambiguation.
// Plain-tsx assertion script (repo pattern, NO vitest imports).
// Jalankan dari root repo: npx --yes tsx src/test/dedVisionPageClassification.test.ts
import {
  classifyDrawingPage,
  type ClassifyDrawingPageInput,
} from '../ai-tools/ded-vision/classification';
import type { DrawingPageClass } from '../ai-tools/ded-vision/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`);
  }
}

/** A titled page with agreeing title + body signals must classify with high confidence. */
function expectClass(
  name: string,
  input: ClassifyDrawingPageInput,
  expected: DrawingPageClass,
) {
  const r = classifyDrawingPage(input);
  check(`${name}: class ${expected} (got ${r.drawingClass})`, r.drawingClass === expected);
  check(
    `${name}: confidence >= 0.85 (got ${r.confidence})`,
    r.confidence >= 0.85,
  );
  check(
    `${name}: status HIGH_CONFIDENCE (got ${r.status})`,
    r.status === 'HIGH_CONFIDENCE',
  );
  check(`${name}: signals recorded (${r.signals.join(', ')})`, r.signals.length > 0);
  check(`${name}: page echoed (${r.page})`, r.page === input.page);
}

/** A page with no usable signal must be UNKNOWN at confidence 0, never a guess. */
function expectUnknown(name: string, input: ClassifyDrawingPageInput) {
  const r = classifyDrawingPage(input);
  check(`${name}: class UNKNOWN (got ${r.drawingClass})`, r.drawingClass === 'UNKNOWN');
  check(`${name}: confidence 0 (got ${r.confidence})`, r.confidence === 0);
  check(`${name}: status UNRESOLVED (got ${r.status})`, r.status === 'UNRESOLVED');
  check(`${name}: no signals recorded`, r.signals.length === 0);
}

// --- 13 spec classes -------------------------------------------------------

expectClass('COVER', {
  page: 1,
  title: 'Sampul — Gambar Kerja Rumah Tinggal',
  text: 'Nama Proyek: Rumah Tinggal 2 Lantai. Daftar Gambar: A-101 Denah Lantai 1, A-201 Tampak Depan. Disiapkan oleh YF Architect.',
  hasTextLayer: true,
}, 'COVER');

expectClass('SITE_PLAN', {
  page: 2,
  title: 'Denah Situasi',
  text: 'Denah situasi tapak 15 x 20 m. Batas tanah utara jalan lingkungan. GSB 3 m dari as jalan. Orientasi utara.',
  hasTextLayer: true,
}, 'SITE_PLAN');

expectClass('FLOOR_PLAN (uppercase title)', {
  page: 3,
  title: 'DENAH LANTAI 1',
  text: 'Denah lantai 1: ruang tamu, ruang keluarga, 3 kamar tidur, dapur, 2 kamar mandi. Skala 1:100.',
  hasTextLayer: true,
}, 'FLOOR_PLAN');

expectClass('ELEVATION', {
  page: 4,
  title: 'Tampak Depan',
  text: 'Tampak depan rumah tinggal. Fasad bata ekspos dengan aksen kayu. Elevasi lantai +0.00, plafon +3.20.',
  hasTextLayer: true,
}, 'ELEVATION');

expectClass('SECTION', {
  page: 5,
  title: 'Potongan A-A',
  text: 'Potongan A-A melintang bangunan. Penampang dinding bata, sloof, dan atap pelana. Skala 1:50.',
  hasTextLayer: true,
}, 'SECTION');

expectClass('STRUCTURAL', {
  page: 6,
  title: 'Denah Struktur Lantai 2',
  text: 'Denah struktur lantai 2. Kolom K1 15/15, balok B1 15/30, pelat lantai tebal 12 cm, beton bertulang mutu K-250.',
  hasTextLayer: true,
}, 'STRUCTURAL');

expectClass('FOUNDATION (longest anchor beats bare denah)', {
  page: 7,
  title: 'Denah Pondasi Batu Kali',
  text: 'Denah pondasi batu kali lebar 60 cm. Footplat F1 80x80 cm di bawah kolom. Sloof 15/20 di atas pondasi.',
  hasTextLayer: true,
}, 'FOUNDATION');

expectClass('ROOF_PLAN', {
  page: 8,
  title: 'Denah Atap & Rangka Atap',
  text: 'Denah atap pelana. Rangka atap baja ringan, kuda-kuda bentang 6 m, penutup genteng beton.',
  hasTextLayer: true,
}, 'ROOF_PLAN');

expectClass('DOOR_WINDOW_SCHEDULE', {
  page: 9,
  title: 'Jadwal Kusen Pintu dan Jendela',
  text: 'Jadwal kusen: D1 pintu utama 90x210, P1 pintu kamar 80x210, J1 jendela 120x150. Daun pintu kayu jati, kusen aluminium.',
  hasTextLayer: true,
}, 'DOOR_WINDOW_SCHEDULE');

expectClass('STRUCTURAL_SCHEDULE', {
  page: 10,
  title: 'Jadwal Pembesian Kolom & Balok',
  text: 'Jadwal pembesian kolom K1: tulangan pokok 4D16, sengkang D8-150. Balok B1 tulangan 6D16.',
  hasTextLayer: true,
}, 'STRUCTURAL_SCHEDULE');

expectClass('MEP', {
  page: 11,
  title: 'Denah Instalasi Listrik Lantai 1',
  text: 'Denah instalasi listrik: titik lampu, stop kontak, saklar, panel MCB. Instalasi air bersih terpisah.',
  hasTextLayer: true,
}, 'MEP');

expectClass('DETAIL (title-start detail beats balok/kolom)', {
  page: 12,
  title: 'Detail Sambungan Balok dan Kolom',
  text: 'Detail sambungan balok B1 ke kolom K1. Baut angkur M16, pelat simpul 10 mm, las sudut.',
  hasTextLayer: true,
}, 'DETAIL');

expectClass('LEGEND_SPEC', {
  page: 13,
  title: 'Legenda dan Spesifikasi Teknis',
  text: 'Legenda simbol gambar. Spesifikasi teknis pekerjaan struktur dan arsitektur. RKS Bab III. Catatan umum: semua ukuran dalam mm.',
  hasTextLayer: true,
}, 'LEGEND_SPEC');

// --- UNKNOWN: never guess from nothing -------------------------------------

expectUnknown('UNKNOWN: scanned page, no text layer, no title', {
  page: 14,
  hasTextLayer: false,
});

expectUnknown('UNKNOWN: text layer present but empty', {
  page: 15,
  text: '   ',
  hasTextLayer: true,
});

expectUnknown('UNKNOWN: text with no drawing terms', {
  page: 16,
  text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  hasTextLayer: true,
});

expectUnknown('UNKNOWN: scanned page — text ignored without text layer', {
  page: 17,
  text: 'denah lantai 1 tampak depan pondasi',
  hasTextLayer: false,
});

expectUnknown('UNKNOWN: substring trap — "arsitektur" must not fire SITE_PLAN', {
  page: 18,
  text: 'arsitektur rumah tinggal modern bergaya minimalis',
  hasTextLayer: true,
});

// --- Ambiguous page: a contested top must not claim a class --------------
// I10b E9 PIN UPDATE — the old pin ("deterministic tie-break picks
// FLOOR_PLAN") encoded the bug: a 9-vs-9 tie between FLOOR_PLAN and
// ELEVATION was resolved by CLASS_ORDER, so a composite sheet got a
// forced single class. The fix returns UNKNOWN for margin <= 1 with
// the contest recorded in signals. The confidence/status checks are
// unchanged (0 < 0.85, UNRESOLVED).
{
  const r = classifyDrawingPage({
    page: 19,
    title: 'Gambar Denah dan Tampak',
    text: 'Lihat denah dan tampak pada gambar ini.',
    hasTextLayer: true,
  });
  check(
    `AMBIGUOUS: confidence < 0.85 (got ${r.confidence})`,
    r.confidence < 0.85,
  );
  check(
    `AMBIGUOUS: status UNRESOLVED, never HIGH_CONFIDENCE (got ${r.status})`,
    r.status === 'UNRESOLVED',
  );
  check(
    `AMBIGUOUS: tie recorded in signals (${r.signals.join(', ')})`,
    r.signals.some((s) => s.startsWith('tie:')),
  );
  check(
    `AMBIGUOUS: exact tie classifies UNKNOWN, never a forced class (got ${r.drawingClass})`,
    r.drawingClass === 'UNKNOWN',
  );
}

// --- Single weak signal: classified, but low confidence --------------------

{
  const r = classifyDrawingPage({
    page: 20,
    text: 'Lihat denah terlampir untuk ukuran ruang.',
    hasTextLayer: true,
  });
  check(
    `WEAK SIGNAL: class FLOOR_PLAN (got ${r.drawingClass})`,
    r.drawingClass === 'FLOOR_PLAN',
  );
  check(
    `WEAK SIGNAL: confidence < 0.6 (got ${r.confidence})`,
    r.confidence < 0.6,
  );
  check(
    `WEAK SIGNAL: status UNRESOLVED (got ${r.status})`,
    r.status === 'UNRESOLVED',
  );
}

// --- Scanned page WITH a title: title evidence still counts -----------------

{
  const r = classifyDrawingPage({
    page: 21,
    title: 'Potongan B-B',
    hasTextLayer: false,
  });
  check(
    `SCANNED+TITLE: class SECTION (got ${r.drawingClass})`,
    r.drawingClass === 'SECTION',
  );
  check(
    `SCANNED+TITLE: confidence >= 0.85 (got ${r.confidence})`,
    r.confidence >= 0.85,
  );
}

// --- Title-start disambiguation parity with parser.ts ----------------------

{
  const r = classifyDrawingPage({
    page: 22,
    title: 'Denah Kusen Lantai 1',
    text: 'Denah kusen menunjukkan posisi semua pintu dan jendela.',
    hasTextLayer: true,
  });
  check(
    `DENAH KUSEN: class DOOR_WINDOW_SCHEDULE, not FLOOR_PLAN (got ${r.drawingClass})`,
    r.drawingClass === 'DOOR_WINDOW_SCHEDULE',
  );
}

// --- I10b E9: a contested top (margin <= 1) classifies UNKNOWN ------------
// The margin-0 case is pinned by the AMBIGUOUS test above; this is the
// margin-1 case (111853: FLOOR_PLAN 4 vs five classes at 3).
{
  const r = classifyDrawingPage({
    page: 30,
    title: 'PLAN SHOWING PROPOSED CONSTRUCTION',
    text: 'floor plan elevation section detail legend site',
    hasTextLayer: true,
  });
  check(
    `E9 margin-1 contest classifies UNKNOWN (got ${r.drawingClass})`,
    r.drawingClass === 'UNKNOWN',
  );
  check(`E9 margin-1: confidence 0 (got ${r.confidence})`, r.confidence === 0);
  check(`E9 margin-1: status UNRESOLVED (got ${r.status})`, r.status === 'UNRESOLVED');
  check(
    `E9 margin-1: contest recorded in signals (${r.signals.join(', ')})`,
    r.signals.some((s) => s.startsWith('contested:')),
  );
}

// A margin-2 win still classifies (SECTION 6 vs FLOOR_PLAN 4) — the
// rule stops at margin 1, it does not swallow clear wins.
{
  const r = classifyDrawingPage({
    page: 31,
    title: 'Gambar Section',
    text: 'floor plan',
    hasTextLayer: true,
  });
  check(
    `E9 margin-2 still classifies SECTION (got ${r.drawingClass})`,
    r.drawingClass === 'SECTION',
  );
  check(`E9 margin-2: confidence 0.78 (got ${r.confidence})`, r.confidence === 0.78);
}

// --- I10b E11/E12: the CIVIL class (road / bridge / dam / SDA) -------------

expectClass('CIVIL (alinemen)', {
  page: 32,
  title: 'ALINEMEN HORISONTAL',
  text: 'alinemen horisontal jalan sta 0+000 sta 1+200',
  hasTextLayer: true,
}, 'CIVIL');

expectClass('CIVIL (denah alinemen jalan — E11, not FLOOR_PLAN)', {
  page: 33,
  title: 'DENAH ALINEMEN JALAN',
  text: 'denah alinement jalan jembatan sta',
  hasTextLayer: true,
}, 'CIVIL');

expectClass('CIVIL (road title anchor)', {
  page: 34,
  title: 'Road Plan',
  text: 'paving layers asphalt',
  hasTextLayer: true,
}, 'CIVIL');

// CIVIL keywords must not flip building sheets: a site plan that
// mentions a road/bridge/river stays SITE_PLAN.
expectClass('SITE_PLAN with civil surroundings stays SITE_PLAN', {
  page: 35,
  title: 'DENAH SITUASI',
  text: 'denah situasi jalan akses jembatan sungai',
  hasTextLayer: true,
}, 'SITE_PLAN');

// Kirkland: "Road" in a section title must not beat SECTION (road is a
// weight-1 civil keyword by design).
{
  const r = classifyDrawingPage({
    page: 36,
    title: 'Standard Road Cross Section',
    text: 'asphalt curb paving layers',
    hasTextLayer: true,
  });
  check(
    `CIVIL guard: Kirkland stays SECTION (got ${r.drawingClass})`,
    r.drawingClass === 'SECTION',
  );
  check(`CIVIL guard: Kirkland confidence 0.78 (got ${r.confidence})`, r.confidence === 0.78);
}

// Dam sheets stay SECTION/DETAIL (civil terms present but not dominant).
expectClass('SECTION (potongan bendungan stays SECTION)', {
  page: 37,
  title: 'POTONGAN BENDUNGAN',
  text: 'potongan bendungan saluran irigasi',
  hasTextLayer: true,
}, 'SECTION');
expectClass('DETAIL (detail saluran stays DETAIL)', {
  page: 38,
  title: 'DETAIL SALURAN',
  text: 'detail saluran irigasi pintu air',
  hasTextLayer: true,
}, 'DETAIL');

// `street` is an address word, not a civil-works signal.
expectUnknown('UNKNOWN: street-only text has no civil signal', {
  page: 39,
  title: 'Project',
  text: 'Main Street address 123',
  hasTextLayer: true,
});

const total = pass + fail;
console.log(`\nPASS ${pass}/${total}`);
if (fail > 0) process.exit(1);
