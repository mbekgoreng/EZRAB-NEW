/**
 * directRab.test.ts — RAB langsung dari chat (perintah user 2026-10-21).
 * "buatkan rab rumah type 70 2 lantai" harus menghasilkan tabel RAB detail
 * dari mesin parametrik (bukan ringkasan/template), dengan angka yang
 * konsisten internal: total = jumlah item, volume selalu > 0, harga tidak
 * pernah dikarang di luar output engine.
 */
import { describe, it, expect } from 'vitest';
import { buildDirectRab, displayTemplateBasisName, formatDirectRabMessage } from '../ai-tools/ezrab-ai/directRab';

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

  it('D2: dua baris total dipisah baris kosong (renderer tidak menggabung paragraf → tidak ada "<br/>" literal)', () => {
    const r = buildDirectRab('buatkan rab rumah type 45')!;
    const msg = formatDirectRabMessage(r);
    expect(msg).not.toContain('<br/>');
    expect(msg).toMatch(/Total biaya langsung[^\n]*\n\n\*\*Total RAB/);
  });

  it('Fase 8: item berharga null tampil "Harga belum tersedia" + total PARSIAL (bukan Rp0, bukan final)', () => {
    const r = buildDirectRab('buatkan rab rumah type 45')!;
    // Simulasikan kontrak engine remediasi: satu item tak terpetakan
    // berharga null dan status total INCOMPLETE. Formatter lapisan chat
    // harus menoleransinya tanpa mengarang angka.
    const first = r.calc.items[0] as unknown as { unitPrice: number | null; totalPrice: number | null };
    first.unitPrice = null;
    first.totalPrice = null;
    (r.generation as unknown as { totalStatus: string }).totalStatus = 'INCOMPLETE';
    const msg = formatDirectRabMessage(r);
    const priced = r.calc.items.filter(
      (it) => typeof it.unitPrice === 'number' && it.unitPrice > 0
    ).length;
    expect(msg).toContain('Harga belum tersedia');
    expect(msg).toContain('Status total: **INCOMPLETE**');
    expect(msg).toContain('Total RAB PARSIAL — BELUM FINAL');
    expect(msg).toContain(`PARSIAL — ${priced} dari ${r.calc.items.length} item berharga`);
    expect(msg).toContain('item belum ada harga dan tidak dihitung ke total');
    // Baris item tak berharga tidak menampilkan angka karangan.
    const row = msg.split('\n').find((l) => l.includes('Harga belum tersedia'));
    expect(row).toBeTruthy();
    expect(row).not.toContain('Rp');
    expect(row).toContain('| — |');
  });
});

describe('directRab — nama basis template tampilan (WS-2, temuan QA Fase 9)', () => {
  // Nama registri memuat klaim lantai bawaan entri template ("…Tipe 45
  // (1 Lantai)"). Pada hasil berlantai efektif berbeda, klaim itu TIDAK
  // boleh tampil sebagai fakta hasil; nama/ID registri tidak berubah —
  // yang disesuaikan hanya lapisan tampilan.
  it('helper: klaim lantai yang bertentangan dibuang, yang cocok dipertahankan persis', () => {
    expect(displayTemplateBasisName('Rumah Tinggal Menengah Tipe 45 (1 Lantai)', 2)).toBe(
      'Rumah Tinggal Menengah Tipe 45'
    );
    expect(displayTemplateBasisName('Rumah Tinggal Menengah Tipe 45 (1 Lantai)', 1)).toBe(
      'Rumah Tinggal Menengah Tipe 45 (1 Lantai)'
    );
    expect(displayTemplateBasisName('Rumah Tinggal Tipe 36/60 (2 Lantai)', 1)).toBe(
      'Rumah Tinggal Tipe 36/60'
    );
    expect(displayTemplateBasisName('Rumah Tinggal Tipe 36/60 (2 Lantai)', 2)).toBe(
      'Rumah Tinggal Tipe 36/60 (2 Lantai)'
    );
    // Nama tanpa klaim lantai kurung tidak disentuh.
    expect(displayTemplateBasisName('Rumah Toko (Ruko) Komersial 2 Lantai (4.5x12m)', 2)).toBe(
      'Rumah Toko (Ruko) Komersial 2 Lantai (4.5x12m)'
    );
  });

  it('hasil type 45 2 lantai: header TIDAK menampilkan klaim "(1 Lantai)"', () => {
    const r = buildDirectRab('buatkan rab rumah type 45 2 lantai')!;
    expect(r.floors).toBe(2);
    expect(r.templateName).toContain('(1 Lantai)'); // nama registri mentah tidak berubah
    const msg = formatDirectRabMessage(r);
    expect(msg).toContain('Rumah Type 45 (2 lantai, luas total ±90 m²)');
    expect(msg).not.toContain('(1 Lantai)');
    expect(msg).toContain('(Rumah Tinggal Menengah Tipe 45)');
  });

  it('hasil type 45 1 lantai: klaim "(1 Lantai)" tetap tampil dan benar', () => {
    const r = buildDirectRab('buatkan rab rumah type 45')!;
    expect(r.floors).toBe(1);
    const msg = formatDirectRabMessage(r);
    expect(msg).toContain('Rumah Type 45 (1 lantai, luas total ±45 m²)');
    expect(msg).toContain('(Rumah Tinggal Menengah Tipe 45 (1 Lantai))');
  });
});
