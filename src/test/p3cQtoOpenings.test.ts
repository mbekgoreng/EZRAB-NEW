/**
 * p3cQtoOpenings.test.ts — P3C (FULL REPAIR EZRAB, 2026-11-13):
 * kontradiksi aturan bukaan B-04 + integrasi QTO.
 *
 * B-04: kode derivasi melarang persentase default bukaan
 * (derivation.ts: "Bukaan HARUS dari data terverifikasi, bukan
 * persentase default"), sementara prompt model memerintahkannya
 * (~15-20% di FAST/DETAIL, 10-15% di Full AI). P3C menghapus perintah
 * persentase default dari ketiga prompt DED dan menggantinya dengan
 * instruksi ringkas (anggaran prompt 7.900 karakter nyaris penuh —
 * kontrak maks 4.853/5.016): pakai bukaan EKSPLISIT dari DED, bila tak
 * diketahui laporkan BRUTO + minta/tandai perlu konfirmasi dimensi user.
 *
 * Prompt kanonis chat (EZRAB_AI_SYSTEM_PROMPT, SHA-pin
 * gatewayPromptIntegrity) TIDAK memuat perintah bukaan — tidak diubah,
 * tidak ada pin hash yang diperbarui.
 *
 * Gaya vitest (dijalankan lewat runner/shim sementara — vitest tidak
 * terpasang). Tanpa panggilan provider.
 */
import { describe, it, expect } from 'vitest';
import { createFastSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/fast';
import { createDetailSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/detail';
import { buildFullAiSystemPrompt } from '../ai-tools/ded-full-ai/prompts';
import {
  deriveDindingNetto,
  deriveKolomVolume,
} from '../ai-tools/ded-ai-estimate/derivation';
import {
  checkQtoAgainstUserDimensions,
  formatQtoCheckLines,
  type QtoItemLike,
} from '../ai-tools/ezrab-ai/qtoBridge';
import {
  reconcileDedQto,
  type DedAttachment,
  type DedAttachmentItem,
} from '../ai-tools/ezrab-ai/dedQtoIntegration';

/* ---------- Prompt DED (ketiga builder, kedua kebijakan) ---------- */

const FAST = (pol: 'FULL_AI' | 'DATABASE') =>
  createFastSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: pol });
const DETAIL = (pol: 'FULL_AI' | 'DATABASE') =>
  createDetailSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: pol });
const FULLAI = (mode: 'FAST' | 'ADVANCED', pol: 'FULL_AI' | 'DATABASE') =>
  buildFullAiSystemPrompt('BANGUNAN', mode, pol);

describe('P3C-1 prompt DED bebas perintah persentase default bukaan (B-04)', () => {
  it('FAST: tanpa "15-20%" / "~15-20%" / "netto ≈ 92"', () => {
    for (const pol of ['FULL_AI', 'DATABASE'] as const) {
      const s = FAST(pol);
      expect(s).not.toContain('15-20%');
      expect(s).not.toContain('~15-20%');
      expect(s).not.toContain('netto ≈ 92');
      expect(s).not.toMatch(/kurangi bukaan[^.]{0,40}\d+\s*%/);
    }
  });

  it('DETAIL: tanpa "15-20%" / "~15-20%"', () => {
    for (const pol of ['FULL_AI', 'DATABASE'] as const) {
      const s = DETAIL(pol);
      expect(s).not.toContain('15-20%');
      expect(s).not.toContain('~15-20%');
      expect(s).not.toMatch(/kurangi bukaan[^.]{0,40}\d+\s*%/);
    }
  });

  it('Full AI (FAST+ADVANCED): tanpa "10-15%" / perintah estimasi persen bukaan', () => {
    for (const mode of ['FAST', 'ADVANCED'] as const) {
      for (const pol of ['FULL_AI', 'DATABASE'] as const) {
        const s = FULLAI(mode, pol);
        expect(s).not.toContain('10-15%');
        expect(s).not.toMatch(/bukaan tak jelas[^.]{0,40}\d+\s*%/);
        expect(s).not.toContain('15-20%');
      }
    }
  });
});

describe('P3C-2 prompt memerintahkan bukaan eksplisit / konfirmasi user', () => {
  it('FAST: larang persen default, minta konfirmasi user', () => {
    for (const s of [FAST('FULL_AI'), FAST('DATABASE')]) {
      expect(s).toContain('JANGAN pakai persentase default');
      expect(s).toContain('bukaan EKSPLISIT');
      expect(s).toContain('minta konfirmasi user');
      expect(s).toContain('BRUTO');
    }
  });

  it('DETAIL: larang persen default, minta konfirmasi user (teks dipadatkan karena anggaran 7.900)', () => {
    for (const s of [DETAIL('FULL_AI'), DETAIL('DATABASE')]) {
      expect(s).toContain('JANGAN % default');
      expect(s).toContain('bukaan EKSPLISIT');
      expect(s).toContain('minta konfirmasi user');
      expect(s).toContain('BRUTO');
    }
  });

  it('Full AI: larang persen default, minta konfirmasi dimensi', () => {
    for (const mode of ['FAST', 'ADVANCED'] as const) {
      for (const pol of ['FULL_AI', 'DATABASE'] as const) {
        const s = FULLAI(mode, pol);
        expect(s).toContain('JANGAN pakai persentase default');
        expect(s).toContain('bukaan EKSPLISIT');
        expect(s).toContain('konfirmasi dimensi user');
        expect(s).toContain('luas BRUTO');
      }
    }
  });

  it('FAST: contoh 34×3.2 tetap ada sebagai BRUTO (bukan netto hasil persen)', () => {
    const s = FAST('FULL_AI');
    expect(s).toContain('34m × 3.2m = 108.8 m²');
  });
});

/* ---------- Derivasi: tanpa dimensi bukaan → MISSING/hilang ---------- */

describe('P3C-3 derivasi tanpa dimensi bukaan: bukan angka persentase default', () => {
  it('bukaan null → BRUTO utuh 108.8 (bukan 92 ≈ 85%), status tandai bukaan belum diketahui', () => {
    const t = deriveDindingNetto(34, 3.2, null);
    expect(t.result).toBe(108.8);
    expect(t.formulaType).toBe('dinding_bruto');
    expect(t.validationStatus).toContain('bukaan belum diketahui');
    expect(t.notes ?? '').toContain('JANGAN kurangi dengan persentase default');
    // Bukan hasil pengurangan persen default mana pun:
    expect(t.result).not.toBe(92.48); // 108.8 × 0.85
    expect(t.result).not.toBe(87.04); // 108.8 × 0.80
  });

  it('panjang/tinggi hilang → result null + rejected (MISSING)', () => {
    const a = deriveDindingNetto(null, 3.2, null);
    expect(a.result).toBeNull();
    expect(a.validationStatus).toContain('rejected');
    const b = deriveDindingNetto(34, null, null);
    expect(b.result).toBeNull();
    expect(b.validationStatus).toContain('rejected');
  });

  it('kontrol: bukaan EKSPLISIT tetap dihormati (34×3.2 − 16.32 = 92.48)', () => {
    const t = deriveDindingNetto(34, 3.2, 16.32, 'DED');
    expect(t.result).toBe(92.48);
    expect(t.formulaType).toBe('dinding_netto');
    expect(t.validationStatus).toBe('ok');
  });

  it('kontrol: derivasi lain tetap menolak input hilang (kolom)', () => {
    const t = deriveKolomVolume(null, 0.15, 0.15, 3);
    expect(t.result).toBeNull();
    expect(t.validationStatus).toContain('rejected');
  });

  it('jembatan QTO: kuantitas null → MISSING (bukan 0)', () => {
    const checks = checkQtoAgainstUserDimensions(
      [{ description: 'Dinding bata', quantity: null, unit: 'm2' }],
      { lengthM: 10, widthM: 8 },
    );
    expect(checks).toHaveLength(1);
    expect(checks[0].verdict).toBe('MISSING');
    expect(checks[0].quantity).toBeNull();
    expect(checks[0].detail).toContain('hilang');
  });
});

/* ---------- Unit mismatch diblokir di jalur QTO ---------- */

function dedAttachmentWith(items: DedAttachmentItem[]): DedAttachment {
  return {
    jobId: 'P3C-FIXTURE',
    fileName: null,
    projectName: 'Fixture P3C',
    projectType: 'BANGUNAN',
    mode: 'FAST',
    projectId: 'PRJ-P3C',
    receivedAt: '2026-11-13T00:00:00.000Z',
    consumedAt: null,
    items,
    truncatedItems: 0,
    coverage: {
      totalItems: items.length,
      itemsWithQuantity: items.filter((i) => i.quantity != null).length,
      itemsWithPrice: 0,
      itemsFullyResolved: 0,
      itemsUnresolved: 0,
      partial: false,
    },
    insufficientDivisions: [],
    decisions: [],
  };
}

describe('P3C-4 unit mismatch diblokir di jalur QTO (CON-11)', () => {
  it('jembatan: unit diminta m3 vs item m2 → UNIT_MISMATCH + DIBLOKIR', () => {
    const checks = checkQtoAgainstUserDimensions(
      [{ description: 'Beton kolom', quantity: 2.5, unit: 'm2' }],
      { lengthM: 10, widthM: 8, depthM: 0.5 },
      { requestedUnitByDescription: { 'Beton kolom': 'm3' } },
    );
    expect(checks[0].verdict).toBe('UNIT_MISMATCH');
    expect(checks[0].detail).toContain('DIBLOKIR');
  });

  it('jembatan kontrol: unit cocok → bukan UNIT_MISMATCH', () => {
    const checks = checkQtoAgainstUserDimensions(
      [{ description: 'Beton kolom', quantity: 40, unit: 'm3' }],
      { lengthM: 10, widthM: 8, depthM: 0.5 },
      { requestedUnitByDescription: { 'Beton kolom': 'm3' } },
    );
    expect(checks[0].verdict).not.toBe('UNIT_MISMATCH');
    expect(checks[0].verdict).toBe('OK');
  });

  it('kabel DED→QTO: derivation.resultUnit m3 vs units m2 → UNIT_MISMATCH', () => {
    const att = dedAttachmentWith([
      {
        id: 'it-1',
        name: 'Beton kolom',
        category: 'Beton',
        units: 'm2',
        quantity: 2.5,
        quantitySource: 'DED_GEOMETRIC',
        quantityNote: null,
        unitPrice: null,
        priceSource: 'UNRESOLVED',
        sourcePages: [1],
        sourceEvidence: 'Potongan',
        provenance: [],
        derivation: {
          formulaType: 'kolom_volume',
          inputs: [
            { name: 'jumlah_kolom', value: 12, unit: 'bh', source: 'DED' },
            { name: 'lebar', value: 0.15, unit: 'm', source: 'DED' },
            { name: 'panjang', value: 0.15, unit: 'm', source: 'DED' },
            { name: 'tinggi', value: 3, unit: 'm', source: 'DED' },
          ],
          result: 0.81,
          resultUnit: 'm3',
          validationStatus: 'ok',
        },
      },
    ]);
    const { checks, requestedUnitByDescription } = reconcileDedQto(att, {
      lengthM: 10,
      widthM: 8,
      depthM: 0.5,
    });
    expect(requestedUnitByDescription['Beton kolom']).toBe('m3');
    expect(checks).toHaveLength(1);
    expect(checks[0].verdict).toBe('UNIT_MISMATCH');
  });

  it('kabel DED→QTO kontrol: resultUnit cocok dengan units → bukan UNIT_MISMATCH', () => {
    const att = dedAttachmentWith([
      {
        id: 'it-1',
        name: 'Galian tanah pondasi',
        category: 'Tanah',
        units: 'm3',
        quantity: 40,
        quantitySource: 'DED_GEOMETRIC',
        quantityNote: null,
        unitPrice: null,
        priceSource: 'UNRESOLVED',
        sourcePages: [1],
        sourceEvidence: 'Denah',
        provenance: [],
        derivation: {
          formulaType: 'galian_volume',
          inputs: [{ name: 'volume', value: 40, unit: 'm3', source: 'DED' }],
          result: 40,
          resultUnit: 'm3',
          validationStatus: 'ok',
        },
      },
    ]);
    const { checks } = reconcileDedQto(att, { lengthM: 10, widthM: 8, depthM: 0.5 });
    expect(checks[0].verdict).not.toBe('UNIT_MISMATCH');
    expect(checks[0].verdict).toBe('OK');
  });
});

/* ---------- Formula + bukti pengukuran dipertahankan ---------- */

describe('P3C-5 formula + bukti pengukuran dipertahankan pada item QTO', () => {
  it('jembatan: quantityFormula diteruskan ke QtoCheck.formula + baris konteks', () => {
    const item: QtoItemLike = {
      description: 'Dinding bata',
      quantity: 92.48,
      unit: 'm2',
      quantityFormula: '34 × 3.2 − bukaan 16.32',
      derivationInputs: [
        { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
        { name: 'tinggi', value: 3.2, unit: 'm', source: 'DED' },
        { name: 'luas_bukaan', value: 16.32, unit: 'm2', source: 'DED' },
      ],
    };
    const checks = checkQtoAgainstUserDimensions([item], { buildingAreaM2: 108.8 });
    expect(checks[0].formula).toBe('34 × 3.2 − bukaan 16.32');
    const lines = formatQtoCheckLines(checks);
    expect(lines.join('\n')).toContain('Rumus: 34 × 3.2 − bukaan 16.32');
  });

  it('jembatan: input derivasi ASUMSI ditandai eksplisit di detail (bukti pengukuran)', () => {
    const checks = checkQtoAgainstUserDimensions(
      [
        {
          description: 'Urugan pasir',
          quantity: 10,
          unit: 'm3',
          quantityFormula: '10 × 8 × 0.125 (asumsi tebal)',
          derivationInputs: [
            { name: 'tebal', value: 0.125, unit: 'm', source: 'ASSUMPTION' },
          ],
        },
      ],
      {},
    );
    expect(checks[0].verdict).toBe('ASSUMPTION');
    expect(checks[0].detail).toContain('tebal=0.125m');
    expect(checks[0].detail).toContain('ASUMSI');
    expect(checks[0].formula).toBe('10 × 8 × 0.125 (asumsi tebal)');
  });

  it('jembatan kompatibel mundur: tanpa rumus → formula null, baris tanpa "Rumus:"', () => {
    const checks = checkQtoAgainstUserDimensions(
      [{ description: 'Galian tanah pondasi', quantity: 40, unit: 'm3' }],
      { lengthM: 10, widthM: 8, depthM: 0.5 },
    );
    expect(checks[0].formula).toBeNull();
    expect(checks[0].verdict).toBe('OK');
    expect(formatQtoCheckLines(checks).join('\n')).not.toContain('Rumus:');
  });

  it('jejak derivasi: inputs bernama + bersatuan + bersumber (bukti pengukuran)', () => {
    const t = deriveDindingNetto(34, 3.2, 16.32, 'DED');
    expect(t.inputs).toEqual([
      { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
      { name: 'tinggi', value: 3.2, unit: 'm', source: 'DED' },
      { name: 'luas_bukaan', value: 16.32, unit: 'm2', source: 'DED' },
    ]);
    expect(t.notes).toContain('Bruto 108.80 - bukaan 16.32 (DED) = 92.48 m²');
  });
});

/* ---------- Anggaran prompt DED tetap terjaga (smoke) ---------- */

describe('P3C-6 anggaran prompt DED ≤ 7.900 karakter (smoke BANGUNAN)', () => {
  it('FAST/DETAIL/Full AI BANGUNAN kedua kebijakan ≤ 7900', () => {
    for (const pol of ['FULL_AI', 'DATABASE'] as const) {
      expect(FAST(pol).length).toBeLessThanOrEqual(7900);
      expect(DETAIL(pol).length).toBeLessThanOrEqual(7900);
      expect(FULLAI('FAST', pol).length).toBeLessThanOrEqual(7900);
      expect(FULLAI('ADVANCED', pol).length).toBeLessThanOrEqual(7900);
    }
  });
});
