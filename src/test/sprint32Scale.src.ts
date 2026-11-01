/**
 * SPRINT 3.2 — Sumbu skala total-item pada evaluator kewajaran
 * kuantitas (reasonableness.ts) + regresi offline atas keluaran
 * pipeline NYATA Sprint 3.1.
 *
 * Menguji modul ASLI:
 * - ded-ai-estimate/reasonableness: evaluateQuantityReasonableness
 *   (gabungan sumbu derivasi Sprint 3.1 + sumbu skala Sprint 3.2),
 *   applyQuantityReasonablenessReview.
 * - ded-ai-estimate/calculator: DedAiCalculator.buildOutput (kasus
 *   ASSUMPTION terflag skala TETAP masuk Total Estimasi tunggal).
 *
 * Bagian A: 15 kasus adversarial brief §6 Sprint 3.2.
 * Bagian B: regresi offline — evaluator yang sekarang dijalankan atas
 * dump pipeline Sprint 3.1 (../your_files/EZRAB-SPRINT3-1/items/).
 * Dump hilang = suite GAGAL keras (bukan dilewati diam-diam).
 *
 * Run: esbuild bundle lalu node, seperti suite .src.ts lain.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateQuantityReasonableness,
  applyQuantityReasonablenessReview,
} from '../ai-tools/ded-ai-estimate/reasonableness';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

let seq = 0;
function mkItem(over: Partial<DedAiItem>): DedAiItem {
  seq++;
  return {
    id: `uji32-${seq}`,
    name: 'Pekerjaan Uji',
    category: 'Struktur',
    units: 'm3',
    quantity: null,
    quantitySource: 'AI_INFERENCE',
    unitPrice: null,
    priceSource: 'UNRESOLVED',
    subtotal: null,
    sourcePages: [],
    provenance: [],
    stage: 'PARSE',
    ...over,
  } as DedAiItem;
}

const BELOW = 'TOTAL_QUANTITY_BELOW_SCALE_ENVELOPE';
const ABOVE = 'TOTAL_QUANTITY_ABOVE_SCALE_ENVELOPE';

function main() {
  console.log('=== A1: dimensi mereproduksi total tak masuk akal (kolom gedung 8,5e-07 m³) ===');
  {
    // Pola persis matriks Sprint 3.1: dimensi fragmen (10×10×8,5 mm)
    // menghasilkan persis kuantitas mikro yang tercatat — sumbu
    // derivasi menilai KONSISTEN (REASONABLE di Sprint 3.1). Sumbu
    // skala harus menandainya: total kolom < 0,01 m³ adalah fragmen.
    const item = mkItem({
      name: 'Pekerjaan kolom struktur beton bertulang',
      quantity: 8.5e-07,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 8.5 mm',
      quantityFormula: '10 x 10 x 8.5 mm (= 0,01 × 0,01 × 0,0085)',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A1a NEEDS_REVIEW walau derivasi konsisten', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('A1b kode utama TOTAL_QUANTITY_BELOW_SCALE_ENVELOPE', r?.reasonCode === BELOW, String(r?.reasonCode));
    check('A1c profil STRUCTURAL_CONCRETE_M3 tercatat', r?.scaleProfile === 'STRUCTURAL_CONCRETE_M3', String(r?.scaleProfile));
    check('A1d kode derivasi tercatat sekunder (DIMENSIONS_EXPLAIN_QUANTITY)', r?.derivationReasonCode === 'DIMENSIONS_EXPLAIN_QUANTITY', String(r?.derivationReasonCode));
  }

  console.log('=== A2a: jumlah pengulangan karangan membenarkan mikro per-elemen ===');
  {
    // Formula mengklaim ×500 elemen agar total 0,005 m³ tampak
    // terdekomposisi. Sumbu derivasi menerima (base × 500 cocok) —
    // tetapi TOTAL-nya sendiri tetap di bawah amplop sloof/balok.
    const item = mkItem({
      name: 'Balok B1',
      quantity: 0.005,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 100 mm',
      quantityFormula: '0,01 x 0,01 x 0,1 x 500 elemen (= 0,005)',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A2a-1 total tetap terflag NEEDS_REVIEW', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('A2a-2 kode utama BELOW (klaim jumlah tidak mengesahkan total)', r?.reasonCode === BELOW, String(r?.reasonCode));
    check('A2a-3 penjelasan derivasi (REPEATED_OBJECTS) tercatat sekunder', r?.derivationReasonCode === 'REPEATED_OBJECTS', String(r?.derivationReasonCode));
  }

  console.log('=== A2b: jumlah karangan menggembungkan pasangan batu di atas amplop ===');
  {
    const item = mkItem({
      name: 'Pasangan Batu 1PC : 4PS',
      quantity: 150000,
      quantitySource: 'AI_INFERENCE',
      quantityFormula: '2 x 0,5 x 150000 m (= 150000)',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A2b-1 NEEDS_REVIEW', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('A2b-2 kode ABOVE (utama atau sekunder)', r?.reasonCode === ABOVE || r?.scaleReasonCode === ABOVE, `${r?.reasonCode}/${r?.scaleReasonCode}`);
    check('A2b-3 profil STONE_MASONRY_M3', r?.scaleProfile === 'STONE_MASONRY_M3', String(r?.scaleProfile));
  }

  console.log('=== A3: di dalam amplop per-elemen, di luar amplop total proyek ===');
  {
    // Satu balok 0,72 m³ itu wajar; TOTAL 20.000 m³ untuk satu kelas
    // elemen dalam satu item melampaui amplop total struktural
    // (10.000 m³) walau dekomposisi jumlahnya terdokumentasi.
    const item = mkItem({
      name: 'Balok B1',
      quantity: 20000,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '300 x 600 x 4000 mm',
      quantityFormula: '0,3 x 0,6 x 4,0 x 27778 balok (= 20000)',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A3a NEEDS_REVIEW pada total', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('A3b kode utama ABOVE', r?.reasonCode === ABOVE, String(r?.reasonCode));
  }

  console.log('=== A4: melampaui profil + konteks proyek independen — klasifikasi jujur ===');
  {
    // Evaluator TIDAK memiliki kanal pembenaran yang mengangkat
    // amplop: konteks proyek hanya dicatat. Galian 6 jt m³ pada
    // proyek BENDUNGAN tetap NEEDS_REVIEW — pembenaran skala
    // bendungan adalah wewenang peninjau manusia, bukan evaluator.
    const item = mkItem({ name: 'Galian tanah biasa', quantity: 6000000, quantitySource: 'AI_INFERENCE' });
    const r = evaluateQuantityReasonableness(item, { projectType: 'BENDUNGAN' });
    check('A4a tetap NEEDS_REVIEW (konteks bukan pembenaran otomatis)', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('A4b kode ABOVE + severity HIGH (profil pekerjaan tanah)', r?.reasonCode === ABOVE && r?.severity === 'HIGH', `${r?.reasonCode}/${r?.severity}`);
    check('A4c konteks BENDUNGAN tercatat di contextUsed', (r?.contextUsed || '').includes('BENDUNGAN'), String(r?.contextUsed));
  }

  console.log('=== A5: di bawah batas fragmen tetapi sah untuk proyek kecil ===');
  {
    // Sloof total 0,045 m³ — di atas batas fragmen 0,01 m³ dan
    // dijelaskan dimensinya: TIDAK boleh terflag oleh sumbu skala.
    const item = mkItem({
      name: 'Sloof 15/20',
      quantity: 0.045,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '150 x 200 x 1500 mm',
      quantityFormula: '150 x 200 x 1500 mm (= 0,15 × 0,2 × 1,5)',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A5a REASONABLE', r?.outcome === 'REASONABLE', JSON.stringify(r));
    check('A5b profil tercatat, di dalam amplop', r?.scaleProfile === 'STRUCTURAL_CONCRETE_M3' && r?.scaleReasonCode === null, `${r?.scaleProfile}/${r?.scaleReasonCode}`);
    check('A5c basis DIMENSIONS_EXPLAIN_QUANTITY', r?.reasonCode === 'DIMENSIONS_EXPLAIN_QUANTITY', String(r?.reasonCode));
  }

  console.log('=== A6: tanpa konteks proyek — sumbu skala tetap berlaku, ketiadaan dicatat ===');
  {
    const item = mkItem({
      name: 'Pekerjaan kolom struktur beton bertulang',
      quantity: 8.5e-07,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 8.5 mm',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A6a tetap terflag BELOW tanpa konteks', r?.outcome === 'NEEDS_REVIEW' && r?.reasonCode === BELOW, JSON.stringify(r));
    check('A6b contextUsed mencatat PROJECT_CONTEXT_MISSING', (r?.contextUsed || '').includes('PROJECT_CONTEXT_MISSING'), String(r?.contextUsed));
  }

  console.log('=== A7: konversi satuan mengubah skala tampak — hasil harus sama ===');
  {
    // Kuantitas fisik yang sama (8,5e-07 m³) dinyatakan lewat dimensi
    // mm dan lewat dimensi cm: sumbu derivasi dan sumbu skala harus
    // menghasilkan penilaian yang identik.
    const mm = mkItem({
      name: 'Pekerjaan kolom struktur beton bertulang',
      quantity: 8.5e-07,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 8.5 mm',
    });
    const cm = mkItem({
      name: 'Pekerjaan kolom struktur beton bertulang',
      quantity: 8.5e-07,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '1 x 1 x 0,85 cm',
    });
    const rmm = evaluateQuantityReasonableness(mm);
    const rcm = evaluateQuantityReasonableness(cm);
    check('A7a outcome & kode identik lintas satuan dimensi', rmm?.outcome === rcm?.outcome && rmm?.reasonCode === rcm?.reasonCode, `${rmm?.reasonCode} vs ${rcm?.reasonCode}`);
    check('A7b keduanya BELOW', rmm?.reasonCode === BELOW && rcm?.reasonCode === BELOW);
    check('A7c derivedQuantity setara', Math.abs((rmm?.derivedQuantity ?? -1) - (rcm?.derivedQuantity ?? -2)) < 1e-12, `${rmm?.derivedQuantity} vs ${rcm?.derivedQuantity}`);
  }

  console.log('=== A8: mismatch dimensi/satuan tetap terdeteksi sumbu derivasi ===');
  {
    const item = mkItem({
      name: 'Balok B1',
      quantity: 720,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '300 x 600 x 4000 mm',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A8a NEEDS_REVIEW DIMENSION_RESULT_MISMATCH (tak tertutup sumbu skala)', r?.outcome === 'NEEDS_REVIEW' && r?.reasonCode === 'DIMENSION_RESULT_MISMATCH', JSON.stringify(r));
    check('A8b total 720 m³ di dalam amplop struktural (skala diam)', r?.scaleReasonCode === null || r?.scaleReasonCode === undefined, String(r?.scaleReasonCode));
  }

  console.log('=== A9: kategori tak didukung → tidak ada profil karangan ===');
  {
    const titik = mkItem({ name: 'Instalasi titik lampu', units: 'titik', quantity: 120, quantitySource: 'AI_INFERENCE' });
    const r1 = evaluateQuantityReasonableness(titik);
    check('A9a satuan hitung: REASONABLE dari sumbu derivasi saja', r1?.outcome === 'REASONABLE' && r1?.reasonCode === 'COUNT_UNIT', JSON.stringify(r1));
    check('A9b scaleProfile null (tidak dikarang)', r1?.scaleProfile === null && r1?.category === null, `${r1?.scaleProfile}/${r1?.category}`);
    const petir = mkItem({ name: 'Pekerjaan Instalasi Penangkal Petir', units: "m'", quantity: 250, quantitySource: 'AI_INFERENCE', rawDimensions: '250 m' });
    const r2 = evaluateQuantityReasonableness(petir);
    check('A9c item linear tak terprofil: scaleProfile null', r2?.scaleProfile === null, JSON.stringify(r2));
  }

  console.log('=== A10: ASSUMPTION terflag skala — TETAP masuk Total Estimasi tunggal ===');
  {
    const item = mkItem({
      name: 'Kolom K1',
      quantity: 0.005,
      quantitySource: 'ASSUMPTION',
      unitPrice: 4000000,
      priceSource: 'AI_ESTIMATE',
      // Dimensi konsisten-internal (0,1×0,1×0,5 m = 0,005 m³): sumbu
      // derivasi menilai wajar — yang menandai adalah sumbu SKALA.
      rawDimensions: '100 x 100 x 500 mm',
    });
    const r = evaluateQuantityReasonableness(item);
    check('A10a ASSUMPTION mikro terflag BELOW', r?.outcome === 'NEEDS_REVIEW' && r?.reasonCode === BELOW, JSON.stringify(r));
    applyQuantityReasonablenessReview([item]);
    const out = DedAiCalculator.buildOutput({
      jobId: 'uji-32',
      projectType: 'BANGUNAN',
      mode: 'FAST',
      policy: 'FULL_AI',
      projectName: 'Uji Sprint 3.2',
      pageCount: 1,
      items: [item],
    });
    const fin = out.items[0];
    check('A10b item tetap CALCULATED', fin.stage === 'CALCULATED', fin.stage);
    check('A10c subtotal & total tunggal memuat asumsi (0,005 × Rp4.000.000)', fin.subtotal === 20000 && out.grandTotal === 20000, `${fin.subtotal}/${out.grandTotal}`);
    check('A10d coverage.itemsWithAssumption = 1', out.coverage.itemsWithAssumption === 1);
    check('A10e quantityReview NEEDS_REVIEW bertahan melewati kalkulator', fin.quantityReview?.outcome === 'NEEDS_REVIEW' && fin.quantityReview?.reasonCode === BELOW);
    check('A10f kuantitas asli tidak diubah', fin.quantity === 0.005);
  }

  console.log('=== A11: item non-AHSP menerima review skala yang sama ===');
  {
    const item = mkItem({
      name: 'Pekerjaan kolom struktur beton bertulang',
      quantity: 8.5e-07,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 8.5 mm',
      ahspMatch: { status: 'NO_MATCH' } as never,
    });
    const r = evaluateQuantityReasonableness(item);
    check('A11a non-AHSP tetap terflag BELOW', r?.outcome === 'NEEDS_REVIEW' && r?.reasonCode === BELOW, JSON.stringify(r));
    check('A11b profil sama dengan item ber-AHSP', r?.scaleProfile === 'STRUCTURAL_CONCRETE_M3', String(r?.scaleProfile));
  }

  console.log('=== A12: harga manual tidak memengaruhi kewajaran kuantitas ===');
  {
    const base = {
      name: 'Sloof 15/20',
      quantity: 0.045,
      quantitySource: 'DED_GEOMETRIC' as const,
      rawDimensions: '150 x 200 x 1500 mm',
    };
    const murah = mkItem({ ...base, unitPrice: 1, priceSource: 'UNRESOLVED' });
    const mahal = mkItem({ ...base, unitPrice: 999999999, priceSource: 'AI_ESTIMATE' });
    const r1 = evaluateQuantityReasonableness(murah);
    const r2 = evaluateQuantityReasonableness(mahal);
    check('A12a review identik lintas harga', JSON.stringify(r1) === JSON.stringify(r2), `${JSON.stringify(r1)} vs ${JSON.stringify(r2)}`);
  }

  console.log('=== A13: determinisme (input ternormalisasi identik → hasil identik) ===');
  {
    const mk = () => mkItem({
      name: 'Pekerjaan kolom struktur beton bertulang',
      quantity: 8.5e-07,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 8.5 mm',
    });
    const r1 = evaluateQuantityReasonableness(mk(), { projectType: 'GEDUNG' });
    const r2 = evaluateQuantityReasonableness(mk(), { projectType: 'GEDUNG' });
    check('A13a dua evaluasi identik (termasuk konteks)', JSON.stringify(r1) === JSON.stringify(r2));
  }

  console.log('=== A14: evaluator tidak memutasi item ===');
  {
    const item = mkItem({
      name: 'Pekerjaan kolom struktur beton bertulang',
      quantity: 8.5e-07,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 8.5 mm',
    });
    const before = JSON.stringify(item);
    evaluateQuantityReasonableness(item, { projectType: 'GEDUNG' });
    check('A14a item byte-identik setelah evaluasi murni', JSON.stringify(item) === before);
  }

  console.log('=== A15: anotasi ulang idempoten (penanda tidak berduplikasi) ===');
  {
    const item = mkItem({
      name: 'Balok B1',
      quantity: 0.005,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '10 x 10 x 100 mm',
      quantityFormula: '0,01 x 0,01 x 0,1 x 500 elemen (= 0,005)',
    });
    applyQuantityReasonablenessReview([item]);
    const note1 = item.quantityNote || '';
    const review1 = JSON.stringify(item.quantityReview);
    applyQuantityReasonablenessReview([item]);
    const note2 = item.quantityNote || '';
    const occurrences = (note2.match(/Tinjauan kewajaran kuantitas/g) || []).length;
    check('A15a penanda muncul tepat 1× setelah 2× apply', occurrences === 1, `occ=${occurrences}`);
    check('A15b quantityNote stabil antar apply', note1 === note2);
    check('A15c quantityReview stabil antar apply', JSON.stringify(item.quantityReview) === review1);
  }

  // =====================================================================
  console.log('=== B: REGRESI OFFLINE atas dump pipeline Sprint 3.1 ===');
  const dumpDir = join(process.cwd(), '..', 'your_files', 'EZRAB-SPRINT3-1', 'items');
  const loadDump = (key: string): any => {
    const p = join(dumpDir, `${key}.json`);
    if (!existsSync(p)) throw new Error(`DUMP TIDAK DITEMUKAN: ${p} — regresi offline tidak dapat dilewati diam-diam`);
    return JSON.parse(readFileSync(p, 'utf8'));
  };
  const normUnit = (u: string | undefined): string =>
    String(u || '').toLowerCase().replace(/³/g, '3').replace(/²/g, '2').replace(/\s+/g, '').trim();

  interface DocStat { key: string; evaluated: number; reasonable: number; needsReview: number; insufficient: number }
  const stats: DocStat[] = [];
  const evaluateDump = (key: string): { dump: any; evaluated: { item: any; review: any }[]; stat: DocStat } => {
    const dump = loadDump(key);
    const items: any[] = Array.isArray(dump.items) ? dump.items : [];
    const evaluated: { item: any; review: any }[] = [];
    const stat: DocStat = { key, evaluated: 0, reasonable: 0, needsReview: 0, insufficient: 0 };
    for (const raw of items) {
      if (typeof raw.quantity !== 'number' || !(raw.quantity > 0)) continue;
      const clone = JSON.parse(JSON.stringify(raw));
      const review = evaluateQuantityReasonableness(clone, { projectType: dump.projectType });
      if (!review) continue;
      evaluated.push({ item: raw, review });
      stat.evaluated++;
      if (review.outcome === 'REASONABLE') stat.reasonable++;
      else if (review.outcome === 'NEEDS_REVIEW') stat.needsReview++;
      else stat.insufficient++;
    }
    stats.push(stat);
    console.log(`  OFFLINE ${key}: dinilai=${stat.evaluated} wajar=${stat.reasonable} review=${stat.needsReview} konteksKurang=${stat.insufficient}`);
    return { dump, evaluated, stat };
  };

  const gedung = evaluateDump('gedung');
  const irigasi = evaluateDump('irigasi');
  const rumah = evaluateDump('rumah');
  const jalan = evaluateDump('jalan');
  const bendungan = evaluateDump('bendungan');
  const jembatan = evaluateDump('jembatan');

  console.log('=== B1: gedung — kelas mikro tidak lagi REASONABLE ===');
  {
    const microM3 = gedung.evaluated.filter(
      ({ item }) => normUnit(item.units) === 'm3' && item.quantity < 0.01
    );
    check('B1a dump gedung memuat ≥3 item mikro m³ (kelas Sprint 3.1)', microM3.length >= 3, `ditemukan ${microM3.length}`);
    check(
      'B1b SEMUA item mikro m³ terflag (NEEDS_REVIEW / INSUFFICIENT_CONTEXT — tidak satu pun REASONABLE)',
      microM3.every(({ review }) => review.outcome !== 'REASONABLE'),
      microM3.map(({ item, review }) => `${item.name}:${review.outcome}/${review.reasonCode}`).join(' | ')
    );
    check(
      'B1c ≥1 NEEDS_REVIEW berkode utama TOTAL_QUANTITY_BELOW_SCALE_ENVELOPE',
      gedung.evaluated.some(({ review }) => review.outcome === 'NEEDS_REVIEW' && review.reasonCode === BELOW),
      ''
    );
    const plafonMicro = gedung.evaluated.filter(
      ({ item }) => normUnit(item.units) === 'm2' && item.quantity < 0.1 && /plafon/i.test(item.name || '')
    );
    check(
      'B1d item plafon mikro m² (profil AREA_FINISH) ikut terflag',
      plafonMicro.length >= 1 && plafonMicro.every(({ review }) => review.outcome !== 'REASONABLE'),
      plafonMicro.map(({ item, review }) => `${item.name}:${review.outcome}/${review.reasonCode}`).join(' | ')
    );
  }

  console.log('=== B2: irigasi — dua besaran ekstrem terflag, nilai tak berubah ===');
  {
    const galian = irigasi.evaluated.find(
      ({ item }) => item.quantity > 300000 && /galian/i.test(item.name || '')
    );
    check('B2a item galian ekstrem (±38,9 jt m³) ditemukan di dump', !!galian, '');
    if (galian) {
      check(
        'B2b galian ekstrem terflag (ABOVE utama/sekunder atau INSUFFICIENT_CONTEXT)',
        (galian.review.outcome === 'NEEDS_REVIEW' &&
          (galian.review.reasonCode === ABOVE || galian.review.scaleReasonCode === ABOVE)) ||
          galian.review.outcome === 'INSUFFICIENT_CONTEXT',
        `${galian.review.outcome}/${galian.review.reasonCode}/${galian.review.scaleReasonCode}`
      );
      check('B2c kuantitas galian di dump tidak berubah oleh evaluator', Math.abs(galian.item.quantity - 38877511.68) < 0.01, String(galian.item.quantity));
    }
    const batu = irigasi.evaluated.find(
      ({ item }) => item.quantity > 300000 && item.quantity < 400000 && /pasangan/i.test(item.name || '')
    );
    check('B2d item pasangan batu ekstrem (±364 rb m³) ditemukan di dump', !!batu, '');
    if (batu) {
      check(
        'B2e pasangan batu ekstrem terflag (ABOVE utama/sekunder atau INSUFFICIENT_CONTEXT)',
        (batu.review.outcome === 'NEEDS_REVIEW' &&
          (batu.review.reasonCode === ABOVE || batu.review.scaleReasonCode === ABOVE)) ||
          batu.review.outcome === 'INSUFFICIENT_CONTEXT',
        `${batu.review.outcome}/${batu.review.reasonCode}/${batu.review.scaleReasonCode}`
      );
      check('B2f kuantitas pasangan batu tidak berubah', Math.abs(batu.item.quantity - 364314.93) < 0.01, String(batu.item.quantity));
    }
  }

  console.log('=== B3: penjaga false-positive (rumah + jalan + bendungan + jembatan) ===');
  {
    const guard = [rumah, jalan, bendungan, jembatan];
    const totalEval = guard.reduce((a, g) => a + g.stat.evaluated, 0);
    const totalFlag = guard.reduce((a, g) => a + g.stat.needsReview, 0);
    const share = totalEval > 0 ? totalFlag / totalEval : 0;
    console.log(`  FALSE-POSITIVE GUARD: dinilai=${totalEval} terflag NEEDS_REVIEW=${totalFlag} share=${(share * 100).toFixed(1)}%`);
    check('B3a pangsa terflag ≤ 25% pada empat dokumen pembanding', share <= 0.25, `share=${(share * 100).toFixed(1)}%`);
    check('B3b keempat dokumen pembanding memiliki item yang dinilai', totalEval > 0, `dinilai=${totalEval}`);
  }

  console.log(`\n=== HASIL SPRINT 3.2 SCALE: ${pass} PASS, ${fail} FAIL ===`);
  if (fail > 0) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error('SUITE ERROR', err);
  process.exitCode = 1;
}
