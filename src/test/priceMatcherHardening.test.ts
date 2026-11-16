/**
 * DB-sync Fase 2 — tes unit hardening matcher pipeline-local.
 *
 * Menguji scripts/price2026/matcherHardening.ts (murni, tanpa modul data
 * besar): aturan angka-spesifikasi (c), containment batas token (d),
 * kamus token, denylist alias roster (a), penonaktifan kode equipment/
 * komersial (b), pengecualian ikatan BM (e), dan kembar OJ.
 *
 * Jalankan: npx vitest run src/test/priceMatcherHardening.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  CODE_MATCH_DISABLED_SOURCES,
  isDeniedRosterAlias,
  pipelineNormalizeName,
  pipelineNameTokens,
  pipelineStrictNameMatch,
  pipelineNameCompatible,
  extractSpecTokens,
  specSetsCompatible,
  specTokensCompatible,
  tokenBoundaryBindingScore,
  isTokenSubsequence,
  bmAdapterCodeBindAllowed,
  twinUnitsForBmLabor,
} from '../../scripts/price2026/matcherHardening';
import { NAME_ONLY_THRESHOLD } from '../data/priceDatabase2026/normalize';

/** Helper: skor nama-vs-nama lewat pipelineStrictNameMatch (norm+spec otomatis). */
function score(a: string, b: string): number {
  return pipelineStrictNameMatch(
    pipelineNormalizeName(a),
    pipelineNameTokens(a),
    pipelineNormalizeName(b),
    pipelineNameTokens(b),
    extractSpecTokens(a),
    extractSpecTokens(b)
  );
}

describe('aturan angka-spesifikasi (c)', () => {
  it('dimensi 30x30 sama walau spasi/penulisan beda', () => {
    expect(extractSpecTokens('Keramik 30x30')).toEqual(['dim:30x30']);
    expect(extractSpecTokens('Keramik lantai 30 x 30')).toEqual(['dim:30x30']);
    expect(specTokensCompatible('Keramik 30x30', 'Keramik lantai 30 x 30')).toBe(true);
    expect(specTokensCompatible('Keramik 30x30', 'Keramik 40x40')).toBe(false);
  });

  it('dia 63 mm TIDAK cocok dengan 3" (63 mm ~ 2,5", bukan 3")', () => {
    expect(extractSpecTokens('Pipa Galvanis dia. 63 mm')).toEqual(['mm:63']);
    expect(extractSpecTokens('Pipa Galvanis Dia 3"')).toEqual(['mm:DN80']);
    expect(specTokensCompatible('Pipa Galvanis dia. 63 mm', 'Pipa Galvanis Dia 3"')).toBe(false);
    expect(score('Pipa Galvanis dia. 63 mm', 'Pipa Galvanis Dia 3"')).toBe(0);
  });

  it('50 mm vs 50 cm berkonflik (M241A: 2,8 jt adalah pipa 50 cm)', () => {
    expect(extractSpecTokens('Pipa Baja dia 50 mm')).toEqual(['mm:DN50']);
    expect(extractSpecTokens('Pipa baja dia. 50 cm')).toEqual(['mm:DN500']);
    expect(score('Pipa Baja dia 50 mm', 'Pipa baja dia. 50 cm')).toBe(0);
  });

  it('notasi ganda Ø 24" (600 mm) runtuh ke satu token nominal', () => {
    expect(extractSpecTokens('Bend 90° Ø 24" (600 mm)')).toEqual(['angle:90', 'mm:DN600']);
    expect(extractSpecTokens('Bend 90° Ø 24"')).toEqual(['angle:90', 'mm:DN600']);
    expect(specTokensCompatible('Bend 90° Ø 24" (600 mm)', 'Bend 90° Ø 24"')).toBe(true);
    expect(specTokensCompatible('Bend 90° Ø 24"', 'Bend 45° Ø 24"')).toBe(false);
    expect(specTokensCompatible('Bend 90° Ø 24"', 'Bend 90° Ø 20"')).toBe(false);
  });

  it('inci pecahan 2-1/2" = DN65 = 65 mm', () => {
    expect(extractSpecTokens('Bend 90° Ø 2-1/2" (65 mm)')).toEqual(['angle:90', 'mm:DN65']);
    expect(extractSpecTokens('Pipa Baja Karbon, DN. 2-1/2" (65 mm)')).toEqual(['mm:DN65']);
  });

  it('range agregat: 0-5 vs 5-10 berkonflik; 14-20 mm adalah satu range', () => {
    expect(extractSpecTokens('Agr 0-5')).toEqual(['range:0-5']);
    expect(extractSpecTokens('Agr 5-10')).toEqual(['range:5-10']);
    expect(extractSpecTokens('Agregat 14 - 20 mm')).toEqual(['range:14-20']);
    expect(specTokensCompatible('Agr 0-5', 'Agr 5-10')).toBe(false);
    expect(specTokensCompatible('Agr 0 - 5', 'Agregate uk.0-5')).toBe(true);
  });

  it('M-size hanya dari token terakhir (Wiremesh M8 ya, M3 PC tidak)', () => {
    expect(extractSpecTokens('Wiremesh M8')).toEqual(['msize:8']);
    expect(extractSpecTokens('M3 PC')).toEqual([]);
    expect(specTokensCompatible('Wiremesh M8', 'Wiremesh M6')).toBe(false);
  });

  it('M-size peka huruf besar: (m3) satuan BUKAN ukuran baut', () => {
    expect(extractSpecTokens('Air (m3)')).toEqual([]);
    expect(extractSpecTokens('Baut M10')).toEqual(['msize:10']);
    expect(extractSpecTokens('Dynabolt m10 x 70mm')).toEqual(['dim:10x70']);
  });

  it('inci pecahan membolehkan spasi: 3 / 4 Inch = 3/4" = DN20 (bukan DN100)', () => {
    expect(extractSpecTokens('Copper Ground Rod 3 / 4 Inch')).toEqual(['mm:DN20']);
    expect(extractSpecTokens('Copper Ground Rod 3/4 Inch')).toEqual(['mm:DN20']);
    expect(extractSpecTokens('Pipa 2 - 1/2 inch')).toEqual(['mm:DN65']);
    expect(specTokensCompatible('Copper Ground Rod 3/4 Inch', 'Copper Ground Rod 3 / 4 Inch')).toBe(true);
  });

  it('luas penampang mm2/mm² menjadi token area (membedakan ukuran kabel)', () => {
    expect(extractSpecTokens('Kabel NYFGBY 4C - 90 mm2')).toEqual(['area:90', 'cores:4']);
    expect(extractSpecTokens('NYFGbY 4x10 mm² dan aksesoris')).toEqual(['area:10', 'cores:4']);
    expect(extractSpecTokens('Kabel BC 95 mm2')).toEqual(['area:95']);
    expect(specTokensCompatible('Kabel NYFGBY 4C - 90 mm2', 'Kabel NYFGBY 4C - 70 mm2')).toBe(false);
    expect(specTokensCompatible('Kabel NYFGBY 4C - 90 mm2', 'Kabel NYFGBY 4C - 90 mm2 M396ab')).toBe(true);
  });

  it('jumlah core kabel menjadi token cores (2x vs 3x vs 4C dibedakan)', () => {
    expect(extractSpecTokens('Kabel NYFGBY 2 x 10 mm²')).toEqual(['area:10', 'cores:2']);
    expect(extractSpecTokens('Kabel NYFGBY 3 x 10 mm2')).toEqual(['area:10', 'cores:3']);
    expect(extractSpecTokens('Kabel NYFGBY 2C - 10 mm2')).toEqual(['area:10', 'cores:2']);
    // Tanpa cores, baris 2-core mendapat skor 1,00 melawan key 3-core
    // (digit tunggal hilang dari token) — regresi M396V pada run 2.
    expect(specTokensCompatible('Kabel NYFGBY 2 x 10 mm²', 'Kabel NYFGBY 3 x 10 mm2')).toBe(false);
    expect(specTokensCompatible('Kabel NYFGBY 2 x 10 mm²', 'Kabel NYFGBY 2C - 10 mm2')).toBe(true);
    expect(specTokensCompatible('Kabel NYFGBY 4 x 10 mm²', 'Kabel NYFGBY 4C - 10 mm2')).toBe(true);
  });

  it('subset spesifikasi kompatibel (label sumber yang kehilangan satu dimensi)', () => {
    // Baris file-mati BM M234 kehilangan "150" karena korupsi ekstraksi;
    // {200,250} ⊆ {150,200,250} adalah deskripsi kurang lengkap, bukan konflik.
    expect(
      specTokensCompatible(
        'Landasan logam berongga (Pot Bearing) mm x 200 mm x 250 mm',
        'Landasan logam berongga (Pot Bearing) 150 mm x 200 mm x 250 mm'
      )
    ).toBe(true);
    // Nilai disjoint tetap konflik.
    expect(specTokensCompatible('Pipa Baja dia 50 mm', 'Pipa Baja dia 50 mm x 100 mm')).toBe(true); // subset, didokumentasikan
    expect(specTokensCompatible('Agr 0-5', 'Agr 5-10')).toBe(false);
  });

  it('spesifikasi satu sisi tidak pernah memblokir', () => {
    expect(specSetsCompatible([], ['mm:DN50'])).toBe(true);
    expect(specTokensCompatible('Tandem Roller', 'Tandem Roller 6-8 ton')).toBe(true);
    expect(score('Truck Crane', 'Truck Crane 5 Ton')).toBeGreaterThan(0);
  });
});

describe('containment batas token (d)', () => {
  it('BUG AMP ⊂ stamper TERTUTUP: amp vs stamper = 0', () => {
    expect(tokenBoundaryBindingScore('amp', 'stamper')).toBe(0);
    expect(score('AMP', 'Stamper')).toBe(0);
    expect(score('AMP', 'Mesin Amplas kayu')).toBe(0);
  });

  it('nama lengkap AMP tetap mengikat; akronim saja butuh alias eksplisit', () => {
    expect(score('Asphalt Mixing Plant', 'Asphalt Mixing Plant AMP')).toBe(0.92);
    // Aturan token-tunggal lama dipertahankan: token tunggal hanya mengikat
    // bila ia token PERTAMA nama panjang. 'AMP' saja vs 'Asphalt Mixing
    // Plant (AMP)' = Jaccard 0,25 < ambang — akronim TIDAK ditebak oleh
    // matcher; ikatan akronim masuk aliases.json (Gelombang 2, ber-bukti).
    expect(score('AMP', 'Asphalt Mixing Plant (AMP)')).toBe(0.25);
  });

  it('containment butuh subsequence token + cakupan >= 0,5', () => {
    expect(isTokenSubsequence(['batu', 'bata'], ['bak', 'kontrol', 'batu', 'bata'])).toBe(true);
    expect(isTokenSubsequence(['amp'], ['stamper'])).toBe(false);
    expect(isTokenSubsequence(['asphalt', 'mixing'], ['asphalt', 'mixing', 'plant'])).toBe(true);
    // 'batu bata' di dalam nama bak kontrol 14-token: cakupan 2/14 -> jatuh ke Jaccard ~0,14
    expect(
      score(
        'Batu Bata',
        'Bak Kontrol Pemeriksaan dari Batu Bata 45 x 45 x 45 cm + Tutup Beton 45 x 45 x 10 cm'
      )
    ).toBeLessThan(NAME_ONLY_THRESHOLD);
  });

  it('containment legitim tetap lolos', () => {
    expect(score('Kepala tukang', 'Kepala Tukang Beton')).toBe(0.92);
    expect(score('Tukang Batu', 'Tukang Batu Kali')).toBe(0.92);
    expect(score('Pekerja', 'Pekerja Beton')).toBe(0.88);
    expect(score('Tandem Roller', 'Tandem Roller 6-8 ton')).toBeGreaterThanOrEqual(0.6);
  });

  it('cakupan 0,25: Truck Mixer mengalahkan Truck 2 Ton (regresi E88)', () => {
    // "Truck Mixer" mencakup 2/5 token nama baris (0,40 ≥ 0,25) → 0,92,
    // mengalahkan aturan token-tunggal "Truck" (0,88) ke key Truck 2 Ton.
    // Ambang lama 0,5 menjatuhkan E49 ke Jaccard 0,40 dan E88 menang.
    expect(score('Truck Mixer Ready Mix (Kapasitas 7 m³)', 'Truck Mixer')).toBe(0.92);
    expect(score('Truck Mixer Ready Mix (Kapasitas 7 m³)', 'Truck 2 Ton')).toBe(0.88);
    expect(score('Truck Mixer Ready Mix (Kapasitas 7 m³)', 'Truck Mixer')).toBeGreaterThan(
      score('Truck Mixer Ready Mix (Kapasitas 7 m³)', 'Truck 2 Ton')
    );
  });

  it('gerbang kode pipeline-local: tanpa substring containment', () => {
    expect(pipelineNameCompatible('AMP', 'Stamper')).toBe(0);
    expect(pipelineNameCompatible('Plate Compactor', 'FLAT BED TRUCK 4 TON')).toBe(0);
    expect(pipelineNameCompatible('Mandor Proyek (General Foreman)', 'Mandor')).toBe(0.85);
    expect(pipelineNameCompatible('Tukang Batu (Bricklayer / Mason)', 'Tukang batu')).toBe(0.85);
    expect(pipelineNameCompatible('Pipa Baja dia 50 mm', 'Pipa baja dia. 50 cm')).toBe(0);
  });
});

describe('kamus token geotextile=geotekstil', () => {
  it('menerjemahkan per token utuh', () => {
    expect(pipelineNormalizeName('Geotextile Non Woven')).toBe('geotekstil non woven');
    expect(pipelineNormalizeName('Geotekstil Filter')).toBe('geotekstil filter');
  });

  it('kamus saja TIDAK mengikat M-025 (butuh alias eksplisit — skor Jaccard 0,25)', () => {
    expect(score('Geotextile non-woven', 'Geotekstil Filter')).toBeLessThan(NAME_ONLY_THRESHOLD);
  });
});

describe('denylist alias roster (a)', () => {
  it('Ahli Mekanika Tanah dan Stamper Gilas ditolak', () => {
    expect(isDeniedRosterAlias('Ahli Mekanika Tanah')).toBe(true);
    expect(isDeniedRosterAlias('Stamper Gilas')).toBe(true);
  });

  it('alias legitim tidak ditolak', () => {
    expect(isDeniedRosterAlias('Mandor')).toBe(false);
    expect(isDeniedRosterAlias('Tukang Batu')).toBe(false);
    expect(isDeniedRosterAlias('Baby Roller')).toBe(false);
    expect(isDeniedRosterAlias('Welding Inspector')).toBe(false);
  });
});

describe('penonaktifan pencocokan kode (b)', () => {
  it('EQUIPMENT_2026 + COMMERCIAL_2026 nonaktif; sumber lain aktif', () => {
    expect(CODE_MATCH_DISABLED_SOURCES.has('EQUIPMENT_2026')).toBe(true);
    expect(CODE_MATCH_DISABLED_SOURCES.has('COMMERCIAL_2026')).toBe(true);
    expect(CODE_MATCH_DISABLED_SOURCES.has('HSD_2026')).toBe(false);
    expect(CODE_MATCH_DISABLED_SOURCES.has('LABOR_2026')).toBe(false);
    expect(CODE_MATCH_DISABLED_SOURCES.has('MATERIAL_MASTER_2026')).toBe(false);
  });
});

describe('pengecualian ikatan kode BM (e)', () => {
  it('M05, E41, E07, E11 tidak pernah ikat kode+satuan tanpa gerbang nama', () => {
    expect(bmAdapterCodeBindAllowed('M05', 'Abu Terbang')).toBe(false);
    expect(bmAdapterCodeBindAllowed('M05', 'M3 Debu Marmer')).toBe(false);
    expect(bmAdapterCodeBindAllowed('E41', 'Jam Asphalt Distributor')).toBe(false);
    expect(bmAdapterCodeBindAllowed('E07', 'CRANE ON TRACK 10-15 TON')).toBe(false);
    expect(bmAdapterCodeBindAllowed('E11', 'FLAT BED TRUCK 4 TON')).toBe(false);
  });

  it('label BELUM TERSEDIA tidak pernah auto-ikat', () => {
    expect(bmAdapterCodeBindAllowed('M57A', 'BELUM TERSEDIA')).toBe(false);
    expect(bmAdapterCodeBindAllowed('M15B', 'BELUM TERSEDIA')).toBe(false);
  });

  it('varian label terbukti boleh ikat', () => {
    expect(bmAdapterCodeBindAllowed('M91', 'Ltr Agregate(0/5)')).toBe(true);
    expect(bmAdapterCodeBindAllowed('M12', 'M3 PC')).toBe(true);
    expect(bmAdapterCodeBindAllowed('M06', 'M242 Buah Blinding Stone')).toBe(true);
    expect(bmAdapterCodeBindAllowed('E12', 'Jam Genset')).toBe(true);
    expect(bmAdapterCodeBindAllowed('E23', 'Jam Watertank Truck')).toBe(true);
  });
});

describe('kembar OJ (L03|OJ Mandor)', () => {
  it('baris labor BM bersatuan jam menjawab juga sebagai OJ', () => {
    expect(twinUnitsForBmLabor('jam')).toEqual(['jam', 'OJ']);
    expect(twinUnitsForBmLabor('OH')).toEqual(['OH']);
    expect(twinUnitsForBmLabor('m3')).toEqual(['m3']);
  });
});
