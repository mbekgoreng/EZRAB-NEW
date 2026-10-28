import { describe, it, expect } from 'vitest';
import {
  buildExactDuplicateKey,
  partitionExactDuplicates,
} from '../context/ProjectContext';
import { RabTemplateService } from '../services/rabTemplateService';

// P1 — Safe template-apply deduplication.
// Key = normalized triple (code-part + name + unit). Code alone never
// suffices; rows lacking any part are never skipped (conservative).

describe('buildExactDuplicateKey', () => {
  it('menyamakan ejaan satuan dan kapitalisasi/whitespace nama', () => {
    const a = buildExactDuplicateKey({
      ahspCode: '3.7.4',
      description: 'Pemasangan 1 m2 plesteran 1SP : 4PP',
      unit: 'm²',
    });
    const b = buildExactDuplicateKey({
      ahspCode: ' 3.7.4 ',
      description: '  pemasangan 1 m2 PLESTERAN 1sp : 4pp ',
      unit: 'Meter Persegi',
    });
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('ahspCode diutamakan, code dipakai bila ahspCode kosong', () => {
    const a = buildExactDuplicateKey({ ahspCode: 'C.37', description: 'Pembersihan lahan', unit: 'm2' });
    const b = buildExactDuplicateKey({ code: 'C.37', description: 'Pembersihan lahan', unit: 'm2' });
    expect(a).toBe(b);
  });

  it('kode sama saja TIDAK cukup: nama berbeda -> kunci berbeda', () => {
    const a = buildExactDuplicateKey({ ahspCode: 'BM.5.1.2', description: 'Penyiapan subgrade', unit: 'm2' });
    const b = buildExactDuplicateKey({ ahspCode: 'BM.5.1.2', description: 'Lapis pondasi bawah agregat', unit: 'm3' });
    expect(a).not.toBe(b);
  });

  it('satuan berbeda tidak digabung (tanpa konversi diam-diam)', () => {
    const a = buildExactDuplicateKey({ ahspCode: 'X.1', description: 'Galian tanah', unit: 'm2' });
    const b = buildExactDuplicateKey({ ahspCode: 'X.1', description: 'Galian tanah', unit: 'm3' });
    expect(a).not.toBe(b);
  });

  it('identitas tak lengkap -> null (tidak pernah dibuang atas partial match)', () => {
    expect(buildExactDuplicateKey({ description: 'Tanpa kode', unit: 'm2' })).toBeNull();
    expect(buildExactDuplicateKey({ ahspCode: 'X.1', description: '   ', unit: 'm2' })).toBeNull();
    expect(buildExactDuplicateKey({ ahspCode: 'X.1', description: 'Ada nama' })).toBeNull();
  });
});

describe('partitionExactDuplicates', () => {
  const existing = [
    { ahspCode: '3.7.4', description: 'Plesteran dinding', unit: 'm2', volume: 10, unitPrice: 51622 },
  ];

  it('melewati duplikat eksak lintas batch + dalam batch yang sama', () => {
    const proposed = [
      { ahspCode: '3.7.4', description: '  PLESTERAN DINDING ', unit: 'm²', volume: 10, unitPrice: 51622 },
      { ahspCode: '3.9.8.9', description: 'Keramik lantai KM', unit: 'm2', volume: 5, unitPrice: 113962 },
      { ahspCode: '3.9.8.9', description: 'Keramik lantai KM', unit: 'm2', volume: 5, unitPrice: 113962 },
    ];
    const { inserted, skipped } = partitionExactDuplicates(existing, proposed);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].description).toBe('Keramik lantai KM');
    expect(skipped).toHaveLength(2);
  });

  it('mempertahankan item berbeda yang hanya berbagi kode', () => {
    const proposed = [
      { ahspCode: 'BM.5.1.2', description: 'Penyiapan subgrade', unit: 'm2', volume: 100, unitPrice: 18500 },
      { ahspCode: 'BM.5.1.2', description: 'Bahu jalan agregat', unit: 'm3', volume: 20, unitPrice: 380000 },
    ];
    const { inserted, skipped } = partitionExactDuplicates([], proposed);
    expect(inserted).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('tidak memutasi input dan mengembalikan objek asli', () => {
    const proposed = [{ ahspCode: 'A.1', description: 'Item baru', unit: 'm2', volume: 1, unitPrice: null }];
    const { inserted } = partitionExactDuplicates(existing, proposed);
    expect(inserted[0]).toBe(proposed[0]);
    expect(proposed).toHaveLength(1);
    expect(existing).toHaveLength(1);
  });

  it('baris tanpa kunci selalu dimasukkan (konservatif)', () => {
    const proposed = [
      { description: 'Item manual tanpa kode', unit: 'm2', volume: 3, unitPrice: null },
      { ahspCode: '3.7.4', description: 'Plesteran dinding', unit: 'm2', volume: 99, unitPrice: 1 },
    ];
    const { inserted, skipped } = partitionExactDuplicates(existing, proposed);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].description).toBe('Item manual tanpa kode');
    expect(skipped).toHaveLength(1);
  });
});

describe('apply template dua kali (data generate nyata)', () => {
  it('aplikasi kedua tidak menambahkan satu pun item eksak', () => {
    const svc = RabTemplateService.getInstance();
    const tpl = svc.getTemplateById('HOUSE-T36-1FL');
    expect(tpl).toBeDefined();
    const first = svc.generateRabFromTemplate(tpl!, {}, 'proj-p1-test', 'STANDARD', []);
    expect(first.items.length).toBeGreaterThan(0);
    // Simulasi: batch pertama masuk proyek, batch kedua = apply ulang.
    const second = partitionExactDuplicates(first.items as any[], first.items as any[]);
    expect(second.inserted).toHaveLength(0);
    expect(second.skipped).toHaveLength(first.items.length);
  });
});
