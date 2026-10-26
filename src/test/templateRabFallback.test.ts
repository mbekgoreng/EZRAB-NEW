import { describe, it, expect } from 'vitest';
import { EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';

function invokeTemplate(q: string): string {
  const tool = EZRAB_AI_TOOLS.find((t) => t.name === 'cari_template_rab');
  expect(tool).toBeDefined();
  return String((tool as any).invoke({ kata_kunci: q }));
}

// Regresi: permintaan RAB "paving" dulu berhenti di dead-end
// `Tidak ditemukan template RAB untuk "paving".` padahal item AHSP
// "Paving Blok" (Bina Marga) tersedia. Template kosong bukan jawaban akhir:
// tool harus mengembalikan item AHSP + panduan tabel, bukan dead-end.
describe('cari_template_rab fallback AHSP', () => {
  it('paving: menampilkan item AHSP + panduan kolom tabel, bukan dead-end', () => {
    const out = invokeTemplate('paving');
    expect(out).not.toBe('Tidak ditemukan template RAB untuk "paving".');
    expect(out).toMatch(/AHSP/);
    expect(out).toMatch(/Status Harga/);
    expect(out).toMatch(/klarifikasi/i);
    // "bukan Rp0" dalam panduan boleh muncul; yang dilarang adalah harga Rp 0
    // sebagai nilai (dengan spasi, seperti format harga "Rp 0").
    expect(out).not.toMatch(/Rp 0\b/);
  });

  it('kata kunci yang benar-benar tidak ada: panduan kata kunci lain, bukan dead-end bisu', () => {
    const out = invokeTemplate('zzzzqqqq');
    expect(out).toMatch(/perkerasan|jalan/);
    expect(out).not.toBe('Tidak ditemukan template RAB untuk "zzzzqqqq".');
  });
});
