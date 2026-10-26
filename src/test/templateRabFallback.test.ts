import { describe, it, expect } from 'vitest';
import { EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';

function invokeTemplate(q: string): string {
  const tool = EZRAB_AI_TOOLS.find((t) => t.name === 'cari_template_rab');
  expect(tool).toBeDefined();
  return String((tool as any).invoke({ kata_kunci: q }));
}

// Regresi dua lapis untuk permintaan RAB "paving":
// 1. Template kosong bukan dead-end: tool mengembalikan item AHSP.
// 2. FASE 5A (service.ts): hasil tool DITAMPILKAN APA ADANYA sebagai jawaban
//    akhir — jadi output tool HARUS berbentuk jawaban jadi (tabel draf +
//    pertanyaan dimensi), dan TIDAK BOLEH berisi instruksi internal untuk
//    model lain ("Lanjutkan: ...", "ajukan SATU klarifikasi", ...). Instruksi
//    seperti itu dijamin bocor ke bubble user — itulah bug "jawabannya aneh".
describe('cari_template_rab fallback AHSP', () => {
  it('paving: tabel draf jadi + pertanyaan dimensi, tanpa instruksi internal', () => {
    const out = invokeTemplate('paving');
    // Tabel draf lengkap sebagai jawaban jadi.
    expect(out).toMatch(/\| No \| Uraian Pekerjaan \| Volume \| Satuan \| Harga Satuan \| Jumlah Harga \| Status Harga \|/);
    expect(out).toMatch(/7\.1\.1\.1/);
    expect(out).toMatch(/Rp 133\.462/);
    expect(out).toMatch(/Harga lengkap/);
    // Volume belum bisa dihitung tanpa dimensi: placeholder, bukan karangan.
    expect(out).toMatch(/\| — \| m2 \| Rp/);
    // Pertanyaan dimensi untuk pengguna (bukan instruksi untuk model).
    expect(out).toMatch(/panjang dan lebar jalan/);
    // TIDAK BOLEH ada instruksi internal yang bocor.
    expect(out).not.toMatch(/Lanjutkan:/);
    expect(out).not.toMatch(/ajukan SATU klarifikasi/);
    expect(out).not.toMatch(/susun draf tabel/);
    expect(out).not.toMatch(/Harga hanya dari tool/);
    // "bukan Rp0" dalam catatan boleh muncul; yang dilarang adalah harga Rp 0
    // sebagai nilai (dengan spasi, seperti format harga "Rp 0").
    expect(out).not.toMatch(/Rp 0\b/);
  });

  it('kata kunci yang benar-benar tidak ada: saran user-facing, bukan instruksi internal', () => {
    const out = invokeTemplate('zzzzqqqq');
    expect(out).toMatch(/kata kunci lain/);
    expect(out).not.toMatch(/Jangan berhenti/);
    expect(out).not.toMatch(/susun draf tabel/);
  });
});
