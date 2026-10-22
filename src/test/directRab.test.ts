/**
 * directRab.test.ts — RAB langsung dari chat (perintah user 2026-10-21).
 * "buatkan rab rumah type 70 2 lantai" harus menghasilkan tabel RAB detail
 * dari mesin parametrik (bukan ringkasan/template), dengan angka yang
 * konsisten internal: total = jumlah item, volume selalu > 0, harga tidak
 * pernah dikarang di luar output engine.
 */
import { describe, it, expect } from 'vitest';
import { buildDirectRab, formatDirectRabMessage } from '../ai-tools/ezrab-ai/directRab';

describe('directRab — bangun RAB dari perintah chat', () => {
  it('type 70 2 lantai: hasil terbangun dari template', () => {
    const r = buildDirectRab('buatkan saya rab rumah type 70 2 lantai');
    expect(r).not.toBeNull();
    expect(r!.houseType).toBe(70);
    expect(r!.floors).toBe(2);
    expect(r!.calc.items.length).toBeGreaterThanOrEqual(15);
  });

  it('semua volume positif dan total konsisten dengan jumlah item', () => {
    const r = buildDirectRab('buatkan saya rab rumah type 70 2 lantai')!;
    for (const it of r.calc.items) {
      expect(it.volume).toBeGreaterThan(0);
      expect(it.unit.trim().length).toBeGreaterThan(0);
    }
    const sum = r.calc.items.reduce((s, it) => s + (it.totalPrice || 0), 0);
    expect(Math.abs(sum - r.calc.totalDirectCost)).toBeLessThan(1);
    expect(r.calc.totalDirectCost).toBeGreaterThan(0);
  });

  it('2 lantai berbeda hasil dari 1 lantai (lantai benar-benar berpengaruh)', () => {
    const two = buildDirectRab('buatkan rab rumah type 70 2 lantai')!;
    const one = buildDirectRab('buatkan rab rumah type 70 1 lantai')!;
    expect(one.floors).toBe(1);
    expect(two.calc.totalDirectCost).not.toBe(one.calc.totalDirectCost);
  });

  it('type 36 1 lantai juga terbangun', () => {
    const r = buildDirectRab('buatkan rab rumah type 36');
    expect(r).not.toBeNull();
    expect(r!.houseType).toBe(36);
    expect(r!.calc.items.length).toBeGreaterThanOrEqual(15);
  });

  it('tanpa tipe eksplisit → null (pemanggil jatuh ke ringkasan)', () => {
    expect(buildDirectRab('buatkan rab rumah 2 lantai')).toBeNull();
    expect(buildDirectRab('buatkan rab rumah')).toBeNull();
  });

  it('bukan rumah → null', () => {
    expect(buildDirectRab('buatkan rab jalan type 70')).toBeNull();
    expect(buildDirectRab('buatkan rab drainase')).toBeNull();
  });

  it('pesan chat memuat tabel markdown + total + status', () => {
    const r = buildDirectRab('buatkan saya rab rumah type 70 2 lantai')!;
    const msg = formatDirectRabMessage(r);
    expect(msg).toContain('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    expect(msg).toContain('Type 70');
    expect(msg).toContain('Total biaya langsung');
    expect(msg).toContain('Total RAB');
    expect(msg).toContain('Push ke Spreadsheet RAB');
  });
});
