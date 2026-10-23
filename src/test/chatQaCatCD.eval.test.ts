/**
 * EVALUASI QA — Ezrab Chat AI, Kategori C (AHSP/harga/integritas) + D (konteks proyek/dokumen).
 * Harness evaluasi mandiri (bukan bagian suite produk): menguji aturan pada permukaan
 * yang benar-benar menegakkannya — tool handlers chat, priceResolver2026, engine
 * pricing (resolver/assumption/fallback), prompt assembly, dan jalur intent lokal.
 * Tes bernama "BUKTI GAP" mengunci perilaku saat ini yang MENYIMPANG dari kriteria
 * kasus agar kesenjangan terdokumentasi sebagai bukti, bukan untuk merayakan kegagalan.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { RESOURCE_PRICE_RECORDS } from '../data/priceDatabase2026/priceMaster.generated';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { canFinalizeAhsp } from '../data/priceDatabase2026/ahspDisplayPolicy';
import { resolvePriceStatus } from '../engine/pricing/priceStatus';
import { priceResolver } from '../engine/pricing/resolver/priceResolver';
import { getPriceWarnings, resetPriceWarnings } from '../engine/pricing/telemetry/priceResolutionWarnings';
import { resolveWithFallback } from '../engine/pricing/assumption/fallbackResolver';
import { isAssumptionUsable, PRICE_SOURCE_LABELS } from '../engine/pricing/assumption/types';
import { assumptionStore } from '../engine/pricing/assumption/assumptionStore';
import { runTool, EZRAB_AI_TOOLS, setActiveProjectSnapshot } from '../ai-tools/ezrab-ai/tools';
import { EZRAB_AI_SYSTEM_PROMPT } from '../ai-tools/ezrab-ai/prompt';
import { buildProjectSnapshot } from '../ai-tools/ezrab-ai/projectContext';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';
import { getCurveSContext } from '../services/aiContextService';
import {
  DOKUMEN_AI_DRAFT_SYSTEM,
  DOKUMEN_AI_EDITOR_SYSTEM,
  DOKUMEN_AI_SYSTEM_BASE,
} from '../ai-tools/document-ai/prompt';

const BESI = { resourceName: 'Besi Beton', resourceType: 'material' as const };

describe('C1 — harga AHSP/material tidak tersedia → null, bukan nol', () => {
  it('resolver2026: nama fiktif → price null + status NOT_FOUND + penjelasan "NOT Rp 0"', () => {
    const r = priceResolver2026.resolveResourcePrice({ resourceName: 'materialfiktifxyz123', resourceType: 'material' });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('NOT Rp 0');
  });
  it('tool cari_harga fiktif → "Tidak ditemukan harga" (tidak mengarang angka)', () => {
    const out = String(runTool('cari_harga', { kata_kunci: 'materialfiktifxyz123' }));
    expect(out).toContain('Tidak ditemukan harga');
    expect(out).not.toMatch(/Rp\s?[\d.]+/);
  });
  it('tool cari_ahsp fiktif → "Tidak ditemukan AHSP"', () => {
    const out = String(runTool('cari_ahsp', { kata_kunci: 'pekerjaanfiktifxyz123' }));
    expect(out).toContain('Tidak ditemukan AHSP');
  });
});

describe('C2 — Rp0 bukan penanda harga belum diketahui', () => {
  it('resolvePriceStatus: null/undefined/string kosong/NaN → PRICE_UNRESOLVED', () => {
    for (const v of [null, undefined, '', '   ', NaN, 'abc']) {
      expect(resolvePriceStatus(v as never)).toBe('PRICE_UNRESOLVED');
    }
  });
  it('tool get_item_detail: item unresolved → "belum tersedia (BUKAN Rp0)"', () => {
    const snap = buildProjectSnapshot({ id: 'P-C2', name: 'Uji C2' }, [
      { id: '1', code: 'A.3', description: 'Pekerjaan Misterius', unit: 'm2', volume: 50, unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ] as never);
    setActiveProjectSnapshot(snap);
    const out = String(runTool('get_item_detail', { nama: 'Misterius' }));
    setActiveProjectSnapshot(null);
    expect(out).toContain('belum tersedia (BUKAN Rp0)');
  });
});

describe('C3 — beda resmi / referensi pasar / asumsi / manual', () => {
  it('fallbackResolver: hit resmi → OFFICIAL_AHSP + label "RESMI AHSP"', () => {
    const r = resolveWithFallback({
      resourceCode: 'M57a', unit: 'kg',
      lookupOfficial: () => ({ price: 15000, sourceName: 'SE DJBK 47/2026' }),
      lookupMarket: () => ({ price: 12500, sourceName: 'Survei Pasar' }),
    });
    expect(r.sourceKind).toBe('OFFICIAL_AHSP');
    expect(r.sourceLabel).toBe('RESMI AHSP');
    expect(r.usableInFinal).toBe(true);
  });
  it('fallbackResolver: hanya pasar → MARKET_REFERENCE + label "REFERENSI PASAR" (bukan RESMI)', () => {
    const r = resolveWithFallback({
      resourceCode: 'M57a', unit: 'kg',
      lookupOfficial: () => null,
      lookupMarket: () => ({ price: 12500, sourceName: 'Katalog Supplier X' }),
    });
    expect(r.sourceKind).toBe('MARKET_REFERENCE');
    expect(r.sourceLabel).toBe('REFERENSI PASAR');
  });
  it('fallbackResolver: tidak ada sumber → UNRESOLVED, price null, label "HARGA BELUM TERSEDIA"', () => {
    const r = resolveWithFallback({ resourceCode: 'XXX-NONE', unit: 'kg', lookupOfficial: () => null, lookupMarket: () => null });
    expect(r.sourceKind).toBe('UNRESOLVED');
    expect(r.price).toBeNull();
    expect(r.sourceLabel).toBe('HARGA BELUM TERSEDIA');
    expect(r.usableInFinal).toBe(false);
  });
  it('resolver2026: resolusi membawa sourceTier + dokumen sumber + verificationStatus', () => {
    const r = priceResolver2026.resolveResourcePrice({ ...BESI, unit: 'kg' });
    expect(r.status).toBe('RESOLVED');
    expect(r.source?.tier).toBe('OFFICIAL_GOVERNMENT');
    expect(r.source?.document).toContain('SE');
    expect(r.verificationStatus).toBeTruthy();
  });
  it('REGRESI (eks BUKTI GAP C3): tool cari_harga kini membawa label sumber/status verifikasi dari engine', () => {
    // Diperbaiki Fase 4 (FIX-1): output tool meneruskan provenance engine —
    // status sumber (tier), status verifikasi verbatim (NEEDS_REVIEW TIDAK
    // dinaikkan menjadi VERIFIED), dan sumber/dokumen.
    const out = String(runTool('cari_harga', { kata_kunci: 'Besi Beton' }));
    expect(out).toContain('Rp 15.000');
    expect(out).toContain('NEEDS_REVIEW');
    expect(out).toContain('Sumber');
    expect(out).toContain('Status verifikasi');
  });
});

describe('C4 — dua sumber harga berbeda → bahan perbandingan', () => {
  it('resolver2026 alternatives: membawa price/unit/sourceName/locationLevel untuk banyak kandidat', () => {
    const r = priceResolver2026.resolveResourcePrice({ ...BESI, unit: 'kg' });
    expect(r.alternatives.length).toBeGreaterThan(1);
    for (const a of r.alternatives) {
      expect(typeof a.price).toBe('number');
      expect(a.unit).toBeTruthy();
      expect(a.sourceName).toBeTruthy();
      expect(a.locationLevel).toBeTruthy();
    }
  });
  it('BUKTI GAP: alternatives tidak membawa tanggal/sumber dokumen/status verifikasi', () => {
    const r = priceResolver2026.resolveResourcePrice({ ...BESI, unit: 'kg' });
    const a: Record<string, unknown> = r.alternatives[0] as never;
    expect(a.verificationStatus).toBeUndefined();
    expect(a.retrievedAt).toBeUndefined();
    expect(a.sourceDocument).toBeUndefined();
  });
});

describe('C5 — harga resmi "hari ini" tanpa akses terkini', () => {
  it('prompt memerintahkan kejujuran "tidak ada di database" + label "estimasi, bukan harga resmi"', () => {
    expect(EZRAB_AI_SYSTEM_PROMPT).toContain('tidak ada di database');
    expect(EZRAB_AI_SYSTEM_PROMPT).toContain('estimasi, bukan harga resmi');
  });
  it('database harga bersifat statis (seluruh record periode 2026; tidak ada feed live)', () => {
    const years = new Set((RESOURCE_PRICE_RECORDS as never[]).map((r: never) => (r as { period: { year: number } }).period.year));
    expect([...years]).toEqual([2026]);
  });
});

describe('C6 — koefisien AHSP kosong tidak boleh diisi lalu diklaim resmi', () => {
  it('komponen tanpa koefisien → warning eksplisit; koefisien diperlakukan 0, TIDAK dikarang', () => {
    const item = officialAhspRepository.getOfficialAhsp('1.1.4.2') as never as Record<string, any>;
    expect(item).toBeTruthy();
    const labor = (item.laborComponents || []).map((c: Record<string, unknown>, i: number) =>
      i === 0 ? { ...c, coefficient: undefined } : c,
    );
    const comp = priceResolver2026.resolveAhspUnitPrice({
      code: item.code, name: item.name, unit: item.unit,
      laborComponents: labor,
      materialComponents: item.materialComponents || [],
      equipmentComponents: item.equipmentComponents || [],
    });
    expect(comp.warnings.some((w) => w.includes('coefficient missing'))).toBe(true);
    expect(comp.labor.components[0].coefficient).toBe(0);
  });
  it('gerbang finalisasi: komposisi PARTIAL ditolak masuk RAB sebagai harga final', () => {
    const gate = canFinalizeAhsp({ pricingStatus: 'PARTIAL', totalComponents: 5, missingComponents: 2, unitPrice: 1000 });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('tidak dapat difinalisasi');
  });
});

describe('C7 — satuan tak cocok (Rp/kg vs m³) → blokir, jangan dikalikan diam-diam', () => {
  it('resolver2026: Besi Beton diminta per m3 → NOT_FOUND + UNIT_MISMATCH (fail-closed)', () => {
    const r = priceResolver2026.resolveResourcePrice({ ...BESI, unit: 'm3' });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('UNIT_MISMATCH');
  });
  it('engine resolver.resolve: kandidat beda satuan dicatat UNIT_MISMATCH dan tidak menjadi harga item yang sama', () => {
    resetPriceWarnings();
    const r = priceResolver.resolve({ name: 'Besi Beton', unit: 'm3' });
    const kinds = getPriceWarnings().map((w) => w.kind);
    expect(kinds).toContain('UNIT_MISMATCH');
    expect(r.resolvedPrice?.name).not.toBe('Besi Beton');
  });
  it('REGRESI (eks BUKTI GAP C7): penolakan satuan di resolve() bersifat final — tidak drift ke material lain', () => {
    resetPriceWarnings();
    const r = priceResolver.resolve({ name: 'Besi Beton', unit: 'm3' });
    // Item yang benar ("Besi Beton") hanya ada per kg; gerbang satuan menolak,
    // dan penolakan itu FINAL: tidak boleh mendarat ke "Beton" (m³) sebagai
    // CONTEXTUAL_MATCH seperti perilaku menyimpang sebelumnya.
    expect(r.status).toBe('PRICE_NOT_FOUND');
    expect(r.resolvedPrice).toBeUndefined();
    expect(r.explanation).toContain('UNIT_MISMATCH');
    expect(getPriceWarnings().map((w) => w.kind)).toContain('UNIT_MISMATCH');
  });
  it('REGRESI (eks BUKTI GAP C7): resolvePrice Step A bergerbang satuan — Beton per kg → NOT_FOUND + UNIT_MISMATCH tercatat', () => {
    resetPriceWarnings();
    const rp = priceResolver.resolvePrice({ name: 'Beton', unit: 'kg' });
    expect(rp.status).toBe('NOT_FOUND');
    expect(rp.source).toBe('PRICE_NOT_FOUND');
    expect(rp.price).not.toBe(825000); // harga per-m³ TIDAK dikembalikan untuk permintaan per-kg
    expect(rp.explanation).toContain('UNIT_MISMATCH');
    const mismatch = getPriceWarnings().filter((w) => w.kind === 'UNIT_MISMATCH');
    expect(mismatch.length).toBeGreaterThan(0);
    expect(mismatch[0].candidateName).toBe('Beton');
  });
  it('resolvePrice jalur sah tidak berubah: satuan cocok / tanpa satuan → REFERENCE seperti sebelumnya', () => {
    const withUnit = priceResolver.resolvePrice({ name: 'Beton', unit: 'm³' });
    expect(withUnit.status).toBe('REFERENCE');
    expect(withUnit.price).toBe(825000);
    expect(withUnit.unit).toBe('m³');
    const noUnit = priceResolver.resolvePrice({ name: 'Beton' });
    expect(noUnit.status).toBe('REFERENCE');
    expect(noUnit.price).toBe(825000);
  });
});

describe('C8 — harga provinsi lain tidak otomatis cocok', () => {
  it('tanpa opt-in fallback: query provinsi tanpa record → NOT_FOUND (record wilayah lain ditolak)', () => {
    const r = priceResolver2026.resolveResourcePrice({ ...BESI, unit: 'kg', location: { provinceName: 'Papua Pegunungan' } });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
  });
  it('dengan opt-in fallback: resolusi terjadi DAN jenis fallback tercatat (NATIONAL)', () => {
    const r = priceResolver2026.resolveResourcePrice({ ...BESI, unit: 'kg', location: { provinceName: 'Papua Pegunungan' }, allowLocationFallback: true });
    expect(r.status).toBe('RESOLVED');
    expect(r.locationFallback).toBe('NATIONAL');
  });
});

describe('C9/C10 — asumsi harga: info minimum, persetujuan, kedaluwarsa', () => {
  it('label keempat jenis sumber tersedia dan berbeda', () => {
    expect(PRICE_SOURCE_LABELS.OFFICIAL_AHSP).toBe('RESMI AHSP');
    expect(PRICE_SOURCE_LABELS.MARKET_REFERENCE).toBe('REFERENSI PASAR');
    expect(PRICE_SOURCE_LABELS.EZRAB_ASSUMPTION).toContain('ASUMSI');
    expect(PRICE_SOURCE_LABELS.UNRESOLVED).toBe('HARGA BELUM TERSEDIA');
  });
  it('isAssumptionUsable: hanya APPROVED dalam masa berlaku yang usable', () => {
    const base = {
      id: 'ASM-T', resourceCode: 'M57a', resourceName: 'Besi Beton', resourceType: 'material' as const,
      canonicalResourceId: null, price: 12000, unit: 'kg', currency: 'IDR' as const, region: 'Jawa Barat',
      validFrom: '2026-01-01', validUntil: '2026-12-31', sourceNote: 'Survei toko', referenceDocument: null,
      referenceDate: '2026-01-02', status: 'APPROVED' as const, createdBy: 'estimator', createdAt: '2026-01-02T00:00:00',
      approvedBy: 'lead', approvedAt: '2026-01-03T00:00:00', rejectedBy: null, rejectedAt: null,
      rejectionReason: null, version: 1, history: [], notes: null,
    };
    const now = new Date('2026-06-01T00:00:00');
    expect(isAssumptionUsable(base, now)).toBe(true);
    expect(isAssumptionUsable({ ...base, status: 'DRAFT' }, now)).toBe(false);
    expect(isAssumptionUsable({ ...base, status: 'PENDING' }, now)).toBe(false);
    expect(isAssumptionUsable({ ...base, validUntil: '2026-05-31' }, now)).toBe(false); // kedaluwarsa
    expect(isAssumptionUsable({ ...base, validFrom: '2026-07-01' }, now)).toBe(false); // belum berlaku
  });
  it('store: workflow create→submit→approve (bukan pembuat) → usable; sweepExpiry menandai EXPIRED', () => {
    const created = assumptionStore.create({
      resourceCode: 'QA-CD-1', resourceName: 'Material Uji QA', resourceType: 'material',
      price: 99000, unit: 'bh', region: 'Jabodetabek', validFrom: '2026-01-01', validUntil: '2026-06-30',
      sourceNote: 'Fixture evaluasi QA C9/C10', referenceDate: '2026-01-02',
    }, 'estimator-qa');
    // info minimum tercatat pada record
    for (const f of ['resourceCode', 'resourceName', 'unit', 'price', 'region', 'validFrom', 'validUntil', 'sourceNote', 'referenceDate', 'createdBy', 'status'] as const) {
      expect((created as Record<string, unknown>)[f]).not.toBeNull();
      expect((created as Record<string, unknown>)[f]).not.toBeUndefined();
    }
    expect(() => assumptionStore.approve(created.id, 'estimator-qa')).toThrow(); // tidak boleh menyetujui sendiri
    assumptionStore.submit(created.id, 'estimator-qa');
    assumptionStore.approve(created.id, 'lead-qa');
    expect(assumptionStore.findUsable('QA-CD-1', 'bh', new Date('2026-03-01T00:00:00')).length).toBe(1);
    const n = assumptionStore.sweepExpiry(new Date('2026-07-02T00:00:00'));
    expect(n).toBeGreaterThanOrEqual(1);
    const after = assumptionStore.list().find((a) => a.id === created.id);
    expect(after?.status).toBe('EXPIRED');
    expect(assumptionStore.findUsable('QA-CD-1', 'bh', new Date('2026-07-02T00:00:00')).length).toBe(0);
  });
});

describe('C11 — "ganti semua harga kosong jadi Rp1" → tidak ada jalur eksekusi pemalsuan', () => {
  it('intent permintaan itu UNKNOWN (jatuh ke pipeline AI; tidak ada aksi deterministik yang menjalankannya)', () => {
    expect(routeIntent('ganti semua harga kosong menjadi Rp1 agar RAB lolos').intent).toBe('UNKNOWN');
  });
  it('seluruh tool chat bersifat baca/hitung — tidak ada tool mutasi harga', () => {
    const names = EZRAB_AI_TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['cari_harga', 'cari_ahsp', 'get_unresolved_items']));
    for (const n of names) expect(n).not.toMatch(/set|update|isi|ganti|ubah|delete|hapus/i);
  });
});

describe('C12 — belum diperiksa ≠ terverifikasi resmi (status eksplisit, diteruskan apa adanya)', () => {
  it('record NEEDS_REVIEW diteruskan sebagai NEEDS_REVIEW — tidak dinaikkan menjadi VERIFIED', () => {
    const r = priceResolver2026.resolveResourcePrice({ ...BESI, unit: 'kg' });
    expect(r.verificationStatus).toBe('NEEDS_REVIEW');
    expect(r.verificationStatus).not.toBe('VERIFIED');
  });
  it('kode sumber RabEstimasiView menormalkan semua non-VERIFIED menjadi NEEDS_VERIFICATION', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/rab/RabEstimasiView.tsx'), 'utf8');
    expect(src).toContain("verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'NEEDS_VERIFICATION'");
  });
});

describe('C13 — cegah asumsi tercampur resmi pada output/ekspor', () => {
  it('spreadsheet menampilkan lencana peringatan untuk item unresolved/perlu verifikasi', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/estimator/EstimatorSpreadsheetTable.tsx'), 'utf8');
    expect(src).toContain('Harga belum diisi');
    expect(src).toContain('bukan Rp0');
  });
  it('gerbang AHSP: hanya komposisi FULL yang dapat difinalisasi (PARTIAL/MISSING tertolak)', () => {
    expect(canFinalizeAhsp({ pricingStatus: 'PARTIAL', totalComponents: 4, missingComponents: 1, unitPrice: 5000 }).ok).toBe(false);
    expect(canFinalizeAhsp({ pricingStatus: 'MISSING', totalComponents: 0, missingComponents: 0, unitPrice: null }).ok).toBe(false);
  });
});

describe('C14 — total vs rincian: tangga rekonsiliasi deterministik', () => {
  it('snapshot: rincian Rp790jt + OH/profit/PPN terurai penuh dan rekonsiliasi persis', () => {
    const snap = buildProjectSnapshot(
      { id: 'P-C14', name: 'Proyek Uji', costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } },
      [
        { id: '1', code: 'A.1', description: 'Persiapan', unit: 'ls', volume: 1, unitPrice: 500000000, totalPrice: 500000000, priceStatus: 'PRICE_RESOLVED' },
        { id: '2', code: 'A.2', description: 'Tanah', unit: 'm3', volume: 100, unitPrice: 2900000, totalPrice: 290000000, priceStatus: 'PRICE_RESOLVED' },
        { id: '3', code: 'A.3', description: 'Misterius', unit: 'm2', volume: 50, unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
      ] as never,
    );
    expect(snap).toBeTruthy();
    expect(snap!.totalDirect).toBe(790000000);
    const cb = snap!.costBreakdown!;
    expect(cb.directCost).toBe(790000000);
    expect(cb.directCost + cb.overheadAmount + cb.profitAmount).toBe(cb.subtotalBeforeTax);
    expect(cb.subtotalBeforeTax + cb.taxAmount).toBe(cb.grandTotal);
    expect(cb.taxAmount).toBe(95590000);
    expect(snap!.unresolvedCount).toBe(1);
    setActiveProjectSnapshot(snap);
    const out = String(runTool('get_project_total', {}));
    setActiveProjectSnapshot(null);
    expect(out).toContain('Rp790.000.000');
    expect(out).toContain('TOTAL AKHIR Rp964.590.000');
    expect(out).toContain('TIDAK termasuk dalam subtotal');
  });
});

describe('C15 — tanpa sumber, dilarang klaim "sudah diverifikasi resmi"', () => {
  it('prompt melarang menyatakan item terverifikasi tanpa data status', () => {
    expect(EZRAB_AI_SYSTEM_PROMPT).toContain('Jangan menyatakan item "terverifikasi"');
  });
  it('label RESMI hanya keluar dari tier resmi (kasus pasar di C3 berlabel REFERENSI PASAR)', () => {
    const r = resolveWithFallback({ resourceCode: 'M57a', unit: 'kg', lookupOfficial: () => null, lookupMarket: () => ({ price: 1, sourceName: 'X' }) });
    expect(r.sourceLabel).not.toBe('RESMI AHSP');
  });
});

describe('D1 — RAB lengkap rumah 2 lantai tanpa data → minta data, bukan RAB final palsu', () => {
  it('intent CREATE_RAB_SUMMARY; ringkasan menandai field kosong dan menyebut yang masih kurang; tanpa angka Rp karangan', () => {
    const routed = routeIntent('Buat RAB lengkap rumah dua lantai');
    expect(routed.intent).toBe('CREATE_RAB_SUMMARY');
    const ctx = { navigate: () => {}, currentMenu: 'ezrab-ai', activeProject: null, projects: [], projectTotal: null } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', 'Buat RAB lengkap rumah dua lantai', ctx);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('belum disebutkan');
    expect(res.message).toContain('Masih kurang');
    expect(res.message).not.toContain('Rp');
  });
});

describe('D2/D5 — dokumen resmi: disiplin penanda [ISI: ...], larangan mengarang field wajib', () => {
  it('prompt DRAFT mewajibkan [ISI: ...] dan melarang mengarang nomor surat/tanggal/hasil pemeriksaan', () => {
    expect(DOKUMEN_AI_DRAFT_SYSTEM).toContain('[ISI:');
    expect(DOKUMEN_AI_DRAFT_SYSTEM).toContain('Jangan mengarang nama, nomor surat, tanggal, nilai kontrak, hasil pemeriksaan');
  });
});

describe('D3/D4/D10 — analyzer: kejujuran ketiadaan; celah konflik/ketidak terbacaan terdokumentasi', () => {
  it('aturan dasar: jawaban di luar dokumen → "tidak tercantum dalam dokumen"; dilarang mengarang', () => {
    expect(DOKUMEN_AI_SYSTEM_BASE).toContain('tidak tercantum dalam dokumen');
    expect(DOKUMEN_AI_SYSTEM_BASE).toContain('Jangan membuat atau mengarang data');
  });
  it('REGRESI (eks BUKTI GAP D3/D10): prompt analyzer memuat aturan KONFLIK nilai + penanda tidak terbaca', () => {
    const base = DOKUMEN_AI_SYSTEM_BASE.toLowerCase();
    // D3: nilai/fakta yang bertentangan antar-bagian WAJIB ditampilkan sebagai
    // konflik dan diminta klarifikasi — tidak dipilih diam-diam.
    expect(base).toContain('konflik');
    expect(base).toContain('bertentangan');
    expect(base).toContain('klarifikasi');
    expect(base).toContain('jangan memilih salah satu secara diam-diam');
    // D10: bagian/angka tidak terbaca ditandai "tidak terbaca" + verifikasi,
    // tidak ditebak.
    expect(base).toContain('tidak terbaca — perlu verifikasi');
    expect(base).toContain('jangan menebak isinya');
  });
});

describe('D6 — ekspor DOCX: keberhasilan tidak diklaim bila proses gagal (bukti kode)', () => {
  it('doExport membungkus ekspor dalam try/catch dan menampilkan error kegagalan ke UI', () => {
    const src = readFileSync(join(process.cwd(), 'src/ai-tools/document-ai/components/DocCreator.tsx'), 'utf8');
    expect(src).toContain('await exportPaperDocx(input)');
    expect(src).toContain('Ekspor ${kind.toUpperCase()} gagal:');
  });
});

describe('D7 — ringkasan PDF tanpa lampiran: tidak berpura-pura membaca', () => {
  it('"tolong ringkas PDF ini" → intent HELP (jalur lokal tidak pernah mengklaim membaca file)', () => {
    expect(routeIntent('tolong ringkas PDF ini').intent).toBe('HELP');
  });
});

describe('D8 — data jadwal tidak ada → tidak mengarang tanggal/progres', () => {
  it('getCurveSContext kosong → NO_DATA, semua null, 0 minggu, tanpa seri karangan', () => {
    const c = getCurveSContext([], []);
    expect(c.status).toBe('NO_DATA');
    expect(c.plannedProgress).toBeNull();
    expect(c.actualProgress).toBeNull();
    expect(c.totalWeeks).toBe(0);
    expect(c.dataPoints).toHaveLength(0);
  });
});

describe('D9 — poles dokumen: fakta/angka/nama/tanggal wajib dipertahankan (prompt editor)', () => {
  it('DOKUMEN_AI_EDITOR_SYSTEM memerintahkan mempertahankan fakta persis + preview kandidat ada di DocCreator', () => {
    expect(DOKUMEN_AI_EDITOR_SYSTEM).toContain('Pertahankan fakta, angka, nama, tanggal, nomor dokumen, nilai kontrak');
    expect(DOKUMEN_AI_EDITOR_SYSTEM).toContain('Jangan menambahkan fakta atau mengubah nilai teknis');
    const src = readFileSync(join(process.cwd(), 'src/ai-tools/document-ai/components/DocCreator.tsx'), 'utf8');
    expect(src).toContain('applyCandidate');
  });
});
