/**
 * Test: REGRESI Wave C — Extractor Completion (keputusan owner
 * 2026-11-11 23:45). Menutup dua celah terdokumentasi Gelombang B:
 *  C1 — fungsi per lantai terstruktur (semula GAP T24).
 *  C2 — cakupan budget terstruktur (semula GAP T29).
 *
 * Seluruh varian redaksi di suite ini BERBEDA dari naskah T24/T29 —
 * perbaikan harus umum, bukan hafalan naskah. Asersi keamanan sama
 * pentingnya: tanpa frasa cakupan, cakupan TIDAK ditebak (tetap null);
 * tanpa penugasan, fungsi lantai TIDAK dikarang.
 *
 * PAGAR: LOKAL SAJA — tanpa commit/push/deploy; subtipe jalan tidak
 * disentuh.
 */
import { describe, it, expect } from 'vitest';
import {
  extractUniversalContext, parseFloorFunctionAssignments, parseBudgetCoverage,
  describeBudgetCoverage, budgetCoverageHasData, buildUniversalBriefLines,
} from '../ai-tools/ezrab-ai/universalIntake';

/* ================= C1 — fungsi per lantai ================= */

describe('Wave C / C1 — fungsi per lantai', () => {
  it('satu kalimat, angka: "Lantai 1 untuk kantor, lantai 2 untuk ruang rapat" → dua penugasan terstruktur', () => {
    const ctx = extractUniversalContext('Lantai 1 untuk kantor, lantai 2 untuk ruang rapat.');
    expect(ctx.floorFunctions).toHaveLength(2);
    expect(ctx.floorFunctions.find((a) => a.floor === 1)?.functionLabel).toBe('kantor');
    expect(ctx.floorFunctions.find((a) => a.floor === 2)?.functionLabel).toBe('ruang rapat');
  });

  it('lintas giliran: penugasan menumpuk per lantai tanpa menghapus lantai lain; jumlah lantai lestari', () => {
    const p1 = extractUniversalContext('Buat gedung perkantoran 3 lantai.');
    const p2 = extractUniversalContext('Lantai pertama untuk lobi.', p1);
    const p3 = extractUniversalContext('Lantai ketiga untuk ruang direktur.', p2);
    expect(p3.floors).toBe(3);
    expect(p3.floorFunctions).toHaveLength(2);
    expect(p3.floorFunctions.find((a) => a.floor === 1)?.functionLabel).toBe('lobi');
    expect(p3.floorFunctions.find((a) => a.floor === 3)?.functionLabel).toBe('ruang direktur');
    expect(p3.technicalSpecs).toContain('fungsi lantai 3: ruang direktur');
  });

  it('varian titik dua & "difungsikan sebagai" terbaca', () => {
    const a = parseFloorFunctionAssignments('Lantai 2: ruang arsip.', 2);
    expect(a).toHaveLength(1);
    expect(a[0].functionLabel).toBe('ruang arsip');
    const b = parseFloorFunctionAssignments('Lantai kedua difungsikan sebagai ruang rapat.', 2);
    expect(b).toHaveLength(1);
    expect(b[0].floor).toBe(2);
  });

  it('"lantai atas" memetakan ke lantai teratas HANYA bila jumlah lantai diketahui', () => {
    const known = parseFloorFunctionAssignments('Lantai atas untuk rooftop garden.', 3);
    expect(known).toHaveLength(1);
    expect(known[0].floor).toBe(3);
    const unknown = parseFloorFunctionAssignments('Lantai atas untuk rooftop garden.', null);
    expect(unknown).toHaveLength(0);
  });

  it('koreksi "bukan X, tapi Y" mengubah HANYA lantai yang disebut; lantai lain & spek lain utuh', () => {
    const p1 = extractUniversalContext('Saya ingin membuat gedung kantor 2 lantai.');
    const p2 = extractUniversalContext('Luas setiap lantai 200 m².', p1);
    const p3 = extractUniversalContext('Lantai pertama untuk kantor, lantai kedua untuk ruang rapat.', p2);
    const p4 = extractUniversalContext('Lantai 2 bukan ruang rapat, tapi ruang arsip.', p3);
    expect(p4.floorFunctions.find((a) => a.floor === 2)?.functionLabel).toBe('ruang arsip');
    expect(p4.floorFunctions.find((a) => a.floor === 1)?.functionLabel).toBe('kantor');
    expect(p4.buildingAreaM2).toBe(200);
    expect(p4.floors).toBe(2);
    expect(p4.corrections.some((c) => c.key === 'floorFunction-2')).toBe(true);
    expect(p4.technicalSpecs).toContain('fungsi lantai 2: ruang arsip');
    expect(p4.technicalSpecs).not.toContain('fungsi lantai 2: ruang rapat');
  });

  it('penugasan ulang biasa di giliran berikut menimpa lantai yang sama', () => {
    const p1 = extractUniversalContext('Lantai kedua untuk ruang rapat.');
    const p2 = extractUniversalContext('Lantai kedua untuk ruang arsip.', p1);
    expect(p2.floorFunctions).toHaveLength(1);
    expect(p2.floorFunctions[0].functionLabel).toBe('ruang arsip');
  });

  it('brief menampilkan seksi Fungsi per lantai', () => {
    const p1 = extractUniversalContext('Saya ingin membuat gedung kantor 2 lantai.');
    const p2 = extractUniversalContext('Lantai pertama untuk kantor, lantai kedua untuk ruang rapat.', p1);
    const brief = buildUniversalBriefLines(p2).join('\n');
    expect(brief).toContain('Fungsi per lantai');
    expect(brief).toContain('Lantai 2: ruang rapat');
  });

  it('keamanan: frasa luas per lantai & cakupan renovasi TIDAK mengarang fungsi lantai', () => {
    const a = extractUniversalContext('Luas setiap lantai 200 m².');
    expect(a.floorFunctions).toHaveLength(0);
    const b = extractUniversalContext('Renovasi lantai 1 saja.');
    expect(b.floorFunctions).toHaveLength(0);
    const c = extractUniversalContext('Buat rumah 2 lantai.');
    expect(c.floorFunctions).toHaveLength(0);
  });
});

/* ================= C2 — cakupan budget ================= */

describe('Wave C / C2 — cakupan budget', () => {
  it('terstruktur: peralatan & utilitas true; pajak/upah tetap null (tidak ditebak); notes menyebut "instalasi air"', () => {
    const ext = extractUniversalContext('Saya ingin membangun kandang sapi 10 × 25 meter, tetapi budget 275 juta sudah termasuk peralatan dan instalasi air.');
    expect(ext.budget?.amount).toBe(275_000_000);
    expect(ext.budget?.coverage?.includesEquipment).toBe(true);
    expect(ext.budget?.coverage?.includesUtilities).toBe(true);
    expect(ext.budget?.coverage?.includesTax).toBeNull();
    expect(ext.budget?.coverage?.includesLabor).toBeNull();
    expect(ext.budget?.coverage?.notes).toContain('instalasi air');
    expect(describeBudgetCoverage(ext.budget?.coverage)).toContain('peralatan');
  });

  it('eksklusi: "belum termasuk pajak dan upah" → keduanya false; komponen lain tetap null', () => {
    const cov = parseBudgetCoverage('Budget 500 juta belum termasuk pajak dan upah.');
    expect(cov?.includesTax).toBe(false);
    expect(cov?.includesLabor).toBe(false);
    expect(cov?.includesEquipment).toBeNull();
    expect(cov?.includesUtilities).toBeNull();
  });

  it('campuran satu kalimat: PPN termasuk, peralatan belum termasuk', () => {
    const ext = extractUniversalContext('Budget 300 juta sudah termasuk PPN, belum termasuk peralatan.');
    expect(ext.budget?.coverage?.includesTax).toBe(true);
    expect(ext.budget?.coverage?.includesEquipment).toBe(false);
  });

  it('"di luar upah" terbaca eksklusi upah; "di luar ruangan" TIDAK membalik apa pun', () => {
    const cov = parseBudgetCoverage('Anggaran 800 juta di luar upah tukang.');
    expect(cov?.includesLabor).toBe(false);
    const ext = extractUniversalContext('Kandang di luar ruangan dengan budget 100 juta.');
    expect(budgetCoverageHasData(ext.budget?.coverage)).toBe(false);
  });

  it('koreksi cakupan murni (tanpa angka): hanya cakupan berubah; jumlah & konteks lain utuh; tercatat sebagai koreksi', () => {
    const p1 = extractUniversalContext('Buat rumah 1 lantai luas 100 m² budget 500 juta.');
    const p2 = extractUniversalContext('Budgetnya belum termasuk pajak.', p1);
    expect(p2.budget?.amount).toBe(500_000_000);
    expect(p2.budget?.coverage?.includesTax).toBe(false);
    expect(p2.buildingAreaM2).toBe(100);
    expect(p2.floors).toBe(1);
    expect(p2.corrections.some((c) => c.key === 'budgetCoverage')).toBe(true);
    expect(p2.technicalSpecs.some((s) => s.startsWith('cakupan budget:') && s.includes('pajak belum termasuk'))).toBe(true);
  });

  it('koreksi jumlah MEWARISI cakupan: cakupan tidak terhapus oleh ubah angka', () => {
    const p1 = extractUniversalContext('Saya ingin membangun kandang sapi 10 × 25 meter, tetapi budget 275 juta sudah termasuk peralatan dan instalasi air.');
    const p2 = extractUniversalContext('Ubah budget menjadi 300 juta.', p1);
    expect(p2.budget?.amount).toBe(300_000_000);
    expect(p2.budget?.coverage?.includesEquipment).toBe(true);
    expect(p2.budget?.coverage?.includesUtilities).toBe(true);
  });

  it('koreksi cakupan per komponen: menyebut pajak tidak menimpa cakupan peralatan yang sudah ada', () => {
    const p1 = extractUniversalContext('Budget 275 juta sudah termasuk peralatan.');
    const p2 = extractUniversalContext('Oh iya, budget itu belum termasuk pajak.', p1);
    expect(p2.budget?.coverage?.includesEquipment).toBe(true);
    expect(p2.budget?.coverage?.includesTax).toBe(false);
  });

  it('brief menampilkan baris Cakupan budget secara eksplisit', () => {
    const ext = extractUniversalContext('Saya ingin membangun kandang sapi 10 × 25 meter, tetapi budget 275 juta sudah termasuk peralatan dan instalasi air.');
    const brief = buildUniversalBriefLines(ext).join('\n');
    expect(brief).toContain('Cakupan budget: termasuk peralatan');
    expect(brief).toContain('bukan terhadap biaya konstruksi murni');
  });

  it('keamanan: budget tanpa frasa cakupan → cakupan null; penyebutan komponen tanpa penanda TIDAK dicatat', () => {
    const a = extractUniversalContext('Buat rumah 1 lantai budget 500 juta.');
    expect(budgetCoverageHasData(a.budget?.coverage)).toBe(false);
    const b = extractUniversalContext('Kandang ini butuh peralatan khusus, budget 200 juta.');
    expect(budgetCoverageHasData(b.budget?.coverage)).toBe(false);
    expect(b.technicalSpecs.some((s) => s.startsWith('cakupan budget:'))).toBe(false);
  });
});
