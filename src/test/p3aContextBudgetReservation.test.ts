/**
 * p3aContextBudgetReservation.test.ts — P3A (G2-F1): urutan reservasi
 * anggaran konteks kanonis.
 *
 * Membuktikan DED/QTO tidak lagi kelaparan anggaran dalam kondisi
 * produksi: builder mencadangkan DED/QTO SEBELUM ringkasan, sehingga
 * dengan reservedChars produksi (~7.747, seksi daftar alat) seksi
 * DED/QTO yang diteruskan mendapat anggaran > 0 dan isinya MUNCUL di
 * prompt rakitan — bukan hanya penanda terpotong (capture titik-C
 * N-DEDQTO: userHasTruncationMarker=true pada kedua attempt).
 *
 * Total anggaran 16.000 TIDAK berubah; prompt kanonis sistem
 * (prompt.ts) dan service.ts TIDAK disentuh.
 *
 * Jalankan: pola runner vitest-shim (lihat shim-p3a/run-targeted-p3a.sh).
 * Provider nyata NOT RUN; 0 panggilan.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCanonicalContext,
  assembleChatPrompt,
  CANONICAL_TOTAL_PROMPT_BUDGET,
  CANONICAL_DED_BUDGET,
  CANONICAL_QTO_BUDGET,
} from '../ai-tools/ezrab-ai/canonicalContext';
import { getToolListText } from '../ai-tools/ezrab-ai/tools';

/** reservedChars kondisi produksi (addendum G2-F1: ~7.747). */
const PRODUCTION_RESERVED = 7_747;
/** dataBudget produksi = 16.000 − 7.747 = 8.253. */
const PRODUCTION_DATA = CANONICAL_TOTAL_PROMPT_BUDGET - PRODUCTION_RESERVED;
/** Reservasi struktural sebelum DED/QTO: fakta 4.000 + objektif 800 + draft 800 + memori 1.500. */
const STRUCTURAL_BEFORE_DEDQTO = 4_000 + 800 + 800 + 1_500;

const DED_MARKER_HEAD = 'SPESIFIKASI-DED-UNIK-ALPHA';
const DED_MARKER_TAIL = 'SPESIFIKASI-DED-UNIK-OMEGA';
const QTO_MARKER_HEAD = 'PEMERIKSAAN-QTO-UNIK-ALPHA';
const QTO_MARKER_TAIL = 'PEMERIKSAAN-QTO-UNIK-OMEGA';

function dedSectionOf(totalLen: number): string {
  // Token kepala di awal (selalu dalam anggaran), token ekor di akhir
  // (di luar anggaran bila totalLen > dedBudget — dipakai uji potong).
  const head = `${DED_MARKER_HEAD}: Beton K-300, kolom 20x20, `;
  const tail = ` ${DED_MARKER_TAIL}`;
  const fillLen = Math.max(0, totalLen - head.length - tail.length);
  return head + 'x'.repeat(fillLen) + tail;
}

function qtoSectionOf(totalLen: number): string {
  const head = `${QTO_MARKER_HEAD}: Galian 40 m3 vs DED 90 m3, `;
  const tail = ` ${QTO_MARKER_TAIL}`;
  const fillLen = Math.max(0, totalLen - head.length - tail.length);
  return head + 'x'.repeat(fillLen) + tail;
}

const BASE_MESSAGES = [{ role: 'user' as const, content: 'Berapa spek beton dari DED?' }];

describe('P3A-01 kondisi produksi: DED/QTO mendapat anggaran > 0 dan isinya muncul', () => {
  it('reservedChars ~7.747 + dedSection + qtoSection → dedBudget 800, qtoBudget 353, isi muncul (bukan hanya penanda)', () => {
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      dedSection: dedSectionOf(600),
      qtoSection: qtoSectionOf(300),
      reservedChars: PRODUCTION_RESERVED,
    });
    // Aritmetika: 8.253 − 7.100 = 1.153 sisa → DED min(800, 1.153) = 800,
    // QTO min(800, 353) = 353, ringkasan 0.
    expect(PRODUCTION_DATA - STRUCTURAL_BEFORE_DEDQTO).toBe(1_153);
    expect(built.report.budget.ded).toBe(800);
    expect(built.report.budget.qto).toBe(353);
    expect(built.report.budget.ded).toBeGreaterThan(0);
    expect(built.report.budget.qto).toBeGreaterThan(0);
    // Isi seksi MUNCUL di prompt rakitan (bukan hanya penanda terpotong).
    expect(built.dataBlock).toContain(DED_MARKER_HEAD);
    expect(built.dataBlock).toContain(QTO_MARKER_HEAD);
    expect(built.dataBlock).toContain('Beton K-300');
    expect(built.dataBlock).toContain('Galian 40 m3 vs DED 90 m3');
    expect(built.report.sections.ded.included).toBe(1);
    expect(built.report.sections.qto.included).toBe(1);
    expect(built.report.sections.ded.truncated).toBe(false);
    expect(built.report.sections.qto.truncated).toBe(false);
  });

  it('dengan seksi alat ASLI (tool probe nyata): DED/QTO tetap > 0', () => {
    const reserved = assembleChatPrompt('', getToolListText()).length;
    // Probe nyata harus menyerupai kondisi produksi addendum (~7.747).
    expect(reserved).toBeGreaterThan(7_000);
    expect(reserved).toBeLessThan(9_000);
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      dedSection: dedSectionOf(600),
      qtoSection: qtoSectionOf(300),
      reservedChars: reserved,
    });
    expect(built.report.budget.ded).toBeGreaterThan(0);
    expect(built.report.budget.qto).toBeGreaterThan(0);
    expect(built.dataBlock).toContain(DED_MARKER_HEAD);
    expect(built.dataBlock).toContain(QTO_MARKER_HEAD);
  });
});

describe('P3A-02 tanpa seksi DED/QTO: perilaku IDENTIK dengan sebelumnya', () => {
  it('anggaran DED/QTO 0 dan ringkasan mendapat sisa yang sama persis seperti urutan lama', () => {
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      reservedChars: PRODUCTION_RESERVED,
    });
    expect(built.report.budget.ded).toBe(0);
    expect(built.report.budget.qto).toBe(0);
    // Urutan lama: ringkasan = min(2.000, 8.253 − 7.100) = 1.153.
    // Urutan baru dengan ded=qto=0 mereduksi ke rumus yang sama persis.
    expect(built.report.budget.summary).toBe(1_153);
    expect(built.report.budget.facts).toBe(4_000);
    expect(built.report.budget.objective).toBe(800);
    expect(built.report.budget.draft).toBe(800);
    expect(built.report.budget.memory).toBe(1_500);
    expect(built.dataBlock).toContain('(tidak ada hasil DED yang di-wire ke permintaan ini)');
    expect(built.dataBlock).toContain('(tidak ada pemeriksaan QTO yang di-wire ke permintaan ini)');
  });

  it('null vs undefined vs string kosong: ketiganya 0 dan placeholder sama', () => {
    const a = buildCanonicalContext({ projectId: 'P-P3A', messages: BASE_MESSAGES, dedSection: null, qtoSection: null, reservedChars: PRODUCTION_RESERVED });
    const b = buildCanonicalContext({ projectId: 'P-P3A', messages: BASE_MESSAGES, reservedChars: PRODUCTION_RESERVED });
    const c = buildCanonicalContext({ projectId: 'P-P3A', messages: BASE_MESSAGES, dedSection: '', qtoSection: '', reservedChars: PRODUCTION_RESERVED });
    expect(a.report.budget.ded).toBe(0);
    expect(a.report.budget.qto).toBe(0);
    expect(a.dataBlock).toBe(b.dataBlock);
    expect(a.dataBlock).toBe(c.dataBlock);
  });

  it('hanya DED: QTO 0, ringkasan mendapat sisa sesudah DED (353)', () => {
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      dedSection: dedSectionOf(600),
      reservedChars: PRODUCTION_RESERVED,
    });
    expect(built.report.budget.ded).toBe(800);
    expect(built.report.budget.qto).toBe(0);
    expect(built.report.budget.summary).toBe(353);
  });

  it('hanya QTO: DED 0, QTO 800, ringkasan 353', () => {
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      qtoSection: qtoSectionOf(300),
      reservedChars: PRODUCTION_RESERVED,
    });
    expect(built.report.budget.ded).toBe(0);
    expect(built.report.budget.qto).toBe(800);
    expect(built.report.budget.summary).toBe(353);
  });
});

describe('P3A-03 total prompt tidak pernah melewati cap 16.000', () => {
  it('input adversarial produksi (riwayat raksasa + DED/QTO panjang): prompt ≤ 16.000', () => {
    const giantHistory = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `pesan raksasa ${i} `.repeat(400),
    }));
    const reserved = assembleChatPrompt('', getToolListText()).length;
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: giantHistory,
      dedSection: dedSectionOf(5_000),
      qtoSection: qtoSectionOf(5_000),
      reservedChars: reserved,
    });
    const prompt = assembleChatPrompt(built.dataBlock, getToolListText());
    expect(prompt.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(built.report.promptChars).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(built.report.budget.total).toBe(CANONICAL_TOTAL_PROMPT_BUDGET);
    // Meski dipotong, kepala seksi DED/QTO tetap hadir.
    expect(built.dataBlock).toContain(DED_MARKER_HEAD);
    expect(built.dataBlock).toContain(QTO_MARKER_HEAD);
  });

  it('riwayat REALISTIS (pesan pendek + preview RAB 1.500) + DED/QTO terpotong: prompt ≤ 16.000', () => {
    // Skenario C: pada kode LAMA prompt ini 16.806 (+806) — cacat laten
    // overhead blok yang tidak dihitung; P3A menutupnya lewat probe
    // overhead pada anggaran riwayat (lihat komentar di builder §4).
    const realistic = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content:
        i % 2 === 0
          ? `pesan pengguna ${i}: hitung volume beton sloof rumah 2 lantai`
          : `RAB preview ${i} `.repeat(100) + 'Rp1.000.000',
    }));
    const reserved = assembleChatPrompt('', getToolListText()).length;
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: realistic,
      dedSection: dedSectionOf(5_000),
      qtoSection: qtoSectionOf(5_000),
      reservedChars: reserved,
    });
    const prompt = assembleChatPrompt(built.dataBlock, getToolListText());
    expect(prompt.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(built.report.promptChars).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(built.dataBlock).toContain(DED_MARKER_HEAD);
    expect(built.dataBlock).toContain(QTO_MARKER_HEAD);
  });

  it('anggaran longgar (reservedChars 0): semua cap penuh — DED 800, QTO 800, ringkasan 2.000', () => {
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      dedSection: dedSectionOf(600),
      qtoSection: qtoSectionOf(300),
      reservedChars: 0,
    });
    expect(built.report.budget.ded).toBe(CANONICAL_DED_BUDGET);
    expect(built.report.budget.qto).toBe(CANONICAL_QTO_BUDGET);
    expect(built.report.budget.summary).toBe(2_000);
  });
});

describe('P3A-04 pemotongan selalu berpenanda, tidak pernah diam-diam', () => {
  it('DED 2.000 karakter pada anggaran 800: kepala hadir, ekor hilang, penanda + laporan ada', () => {
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      dedSection: dedSectionOf(2_000),
      qtoSection: qtoSectionOf(300),
      reservedChars: PRODUCTION_RESERVED,
    });
    expect(built.report.budget.ded).toBe(800);
    expect(built.report.sections.ded.truncated).toBe(true);
    expect(built.dataBlock).toContain(DED_MARKER_HEAD);
    expect(built.dataBlock).not.toContain(DED_MARKER_TAIL);
    expect(built.dataBlock).toContain('…[dipotong demi batas konteks');
    expect(built.report.truncations.some((t) => t.startsWith('DED dipotong'))).toBe(true);
  });

  it('QTO 2.000 karakter pada anggaran 353: kepala hadir, ekor hilang, penanda + laporan ada', () => {
    const built = buildCanonicalContext({
      projectId: 'P-P3A',
      messages: BASE_MESSAGES,
      dedSection: dedSectionOf(600),
      qtoSection: qtoSectionOf(2_000),
      reservedChars: PRODUCTION_RESERVED,
    });
    expect(built.report.budget.qto).toBe(353);
    expect(built.report.sections.qto.truncated).toBe(true);
    expect(built.dataBlock).toContain(QTO_MARKER_HEAD);
    expect(built.dataBlock).not.toContain(QTO_MARKER_TAIL);
    expect(built.dataBlock).toContain('…[dipotong demi batas konteks');
    expect(built.report.truncations.some((t) => t.startsWith('QTO dipotong'))).toBe(true);
  });
});
