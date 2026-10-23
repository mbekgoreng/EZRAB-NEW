/**
 * FASE 4 QA — Intent CALCULATE deterministik + perbaikan A1/A3/G3 +
 * provenance tool harga + delimiter data prompt + Idempotency-Key.
 * Run: npx vitest run src/test/chatCalcDeterministic.test.ts
 *
 * Oracle kasus B dihitung ulang dari laporan evaluasi kategori B
 * (oracle deterministik, bukan penilaian bahasa). Setiap kasus dijalankan
 * lewat pipeline lokal sebenarnya: routeIntent → executeIntent.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';
import { evaluateCalculation } from '../ai-tools/ezrab-ai/calcIntent';
import { runTool, setActiveProjectSnapshot } from '../ai-tools/ezrab-ai/tools';
import { buildProjectSnapshot } from '../ai-tools/ezrab-ai/projectContext';
import { ezrabAiService } from '../ai-tools/ezrab-ai/service';
import { aiToolsProviderClient, AiToolsResult } from '../ai-tools/providerClient';
import { RabTemplateService } from '../services/rabTemplateService';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

const ctxFor = (rawText: string) =>
  ({
    navigate: () => {},
    currentMenu: 'ezrab-ai',
    activeProject: null,
    projects: [],
    projectTotal: null,
    rawText,
  }) as never;

function ask(text: string): string {
  const routed = routeIntent(text);
  expect(routed.intent).toBe('CALCULATE');
  expect(routed.localOnly).toBe(true);
  const res = executeIntent(routed.intent, routed.param, ctxFor(text));
  expect(res.ok).toBe(true);
  return res.message;
}

describe('Kategori B — hitungan deterministik lewat routeIntent/executeIntent', () => {
  it('B1: volume balok 0,25 × 0,40 × 6 m = 0,6 m³', () => {
    const msg = ask('Hitung volume balok beton 0,25 m × 0,40 m × 6 m.');
    expect(msg).toContain('0,6 m³');
  });

  it('B2: pelat 6 × 8 m tebal 12 cm = 5,76 m³ (12 cm dikonversi ke 0,12 m di dalam hitungan)', () => {
    const msg = ask('Pelat 6 m × 8 m tebal 12 cm. Hitung volume tanpa bukaan.');
    expect(msg).toContain('12 cm = 0,12 m');
    expect(msg).toContain('5,76 m³');
    expect(msg).not.toContain('576 m³');
  });

  it('B3: luas bersih dinding 10 × 3,5 dengan 2 pintu + 2 jendela = 28,34 m²', () => {
    const msg = ask('Dinding 10 m × 3,5 m memiliki dua pintu 0,9 × 2,1 m dan dua jendela 1,2 × 1,2 m. Berapa luas bersih?');
    expect(msg).toContain('28,34 m²');
    expect(msg).not.toContain('63,34');
  });

  it('B4: volume galian 2,5 × 1,2 × 0,8 m = 2,4 m³', () => {
    const msg = ask('Galian berukuran 2,5 m × 1,2 m × 0,8 m. Hitung volume geometrisnya.');
    expect(msg).toContain('2,4 m³');
  });

  it('B5: 125 m² × Rp85.000 = Rp 10.625.000', () => {
    const msg = ask('Volume 125 m² dengan harga Rp85.000/m². Berapa total?');
    expect(msg).toContain('Rp 10.625.000');
  });

  it('B6: jumlahkan tiga nilai Rupiah = Rp 23.625.000', () => {
    const msg = ask('Jumlahkan Rp12.500.000, Rp7.250.000, dan Rp3.875.000.');
    expect(msg).toContain('Rp 23.625.000');
  });

  it('B7: PPN 11% dari Rp240 juta = Rp 26.400.000, total Rp 266.400.000, tarif dibingkai asumsi soal', () => {
    const msg = ask('Subtotal Rp240 juta dan PPN diasumsikan 11%. Berapa PPN dan total? Nyatakan tarif sebagai asumsi soal.');
    expect(msg).toContain('Rp 26.400.000');
    expect(msg).toContain('Rp 266.400.000');
    expect(msg).toMatch(/asumsi sesuai soal/i);
  });

  it('B8: konversi 125 mm = 0,125 m', () => {
    const msg = ask('Konversi tebal 125 mm menjadi meter.');
    expect(msg).toContain('0,125 m');
  });

  it('B9: konversi 2,75 m³ = 2.750 liter', () => {
    const msg = ask('Konversi 2,75 m³ menjadi liter.');
    expect(msg).toContain('2.750 liter');
  });

  it('B11: produktivitas 40 m² / 8 pekerja / 2 hari = 2,5 m²/orang/hari', () => {
    const msg = ask('Delapan pekerja menyelesaikan 40 m² dalam 2 hari. Berapa produktivitas rata-rata per pekerja per hari?');
    expect(msg).toContain('2,5 m²/orang/hari');
  });

  it('B12: 12,4 m dibagi empat segmen = 3,1 m', () => {
    const msg = ask('Panjang 12,4 m dibagi menjadi empat segmen sama. Berapa panjang setiap segmen?');
    expect(msg).toContain('3,1 m');
  });

  it('B14: selisih 100 vs 82 m³ = 18 m³ dan 21,95% terhadap 82', () => {
    const msg = ask('Kontraktor menyebut 100 m³ sedangkan hasil ukur 82 m³. Berapa selisih dan persentasenya terhadap 82 m³?');
    expect(msg).toContain('18 m³');
    expect(msg).toContain('21,95%');
  });

  it('B10/B15/B13 konseptual TIDAK tertangkap CALCULATE (tetap ke AI)', () => {
    for (const q of [
      'Mengapa harga Rp/kg tidak boleh langsung dikalikan dengan volume m³ tanpa konversi yang sah?',
      'Jika hasil hitungan tampak benar tetapi satuan harga dan kuantitas berbeda, apakah boleh langsung digunakan?',
      'Apa yang harus dilakukan jika volume hasil perhitungan negatif?',
    ]) {
      const r = routeIntent(q);
      expect(r.intent).toBe('UNKNOWN');
      expect(r.localOnly).toBe(false);
      expect(evaluateCalculation(q)).toBeNull();
    }
  });

  it('B13 deterministik: input dimensi negatif ditolak dengan jelas', () => {
    const r = evaluateCalculation('hitung volume balok -2 m × 3 m × 2 m');
    expect(r).not.toBeNull();
    expect(r!.message).toContain('tidak valid');
  });

  it('G2: hitungan metaforis tidak dipaksakan ke evaluator', () => {
    expect(evaluateCalculation('Hitung volume satu ember kesabaran mandor yang proyeknya terlambat enam bulan.')).toBeNull();
  });
});

describe('Perbaikan tool hitung yang ada (tools.ts)', () => {
  it('luas_dinding: SATU bidang secara default — B3 lewat tool = 28,34 m²', () => {
    const out = String(runTool('luas_dinding', { panjang: 10, tinggi: 3.5, bukaan: 6.66 }));
    expect(out).toContain('28,34 m²');
  });

  it('luas_dinding: dua sisi hanya bila eksplisit (sisi=2)', () => {
    const out = String(runTool('luas_dinding', { panjang: 10, tinggi: 3.5, bukaan: 6.66, sisi: 2 }));
    expect(out).toContain('63,34 m²');
  });

  it('luas_dinding: bukaan sebagai daftar {panjang, tinggi, jumlah} dihitung tool', () => {
    const out = String(runTool('luas_dinding', {
      panjang: 10, tinggi: 3.5,
      bukaan: [
        { panjang: 0.9, tinggi: 2.1, jumlah: 2 },
        { panjang: 1.2, tinggi: 1.2, jumlah: 2 },
      ],
    }));
    expect(out).toContain('28,34 m²');
  });

  it('subtotal: menolak kuantitas/harga negatif (celah B13)', () => {
    expect(String(runTool('subtotal', { volume: -5, unitPrice: 1000 }))).toContain('negatif');
    expect(String(runTool('subtotal', { volume: 5, unitPrice: -1000 }))).toContain('negatif');
  });

  it('subtotal: menolak perkalian lintas satuan yang dinyatakan (B10/B15)', () => {
    const out = String(runTool('subtotal', { volume: 2.75, unitPrice: 15000, unit: 'm3', priceUnit: 'kg' }));
    expect(out).toContain('ERROR');
    expect(out).toContain('berbeda');
  });

  it('subtotal: satuan cocok (m2 vs Rp/m²) tetap dihitung', () => {
    const out = String(runTool('subtotal', { volume: 2, unitPrice: 1000, unit: 'm2', priceUnit: 'Rp/m²' }));
    expect(out).toBe('Subtotal = Rp 2.000');
  });
});

describe('A1 — CAPABILITIES mencapai redaksi umum + angka runtime nyata', () => {
  it('"Apa saja yang bisa kamu bantu untuk proyek konstruksi?" → CAPABILITIES', () => {
    expect(routeIntent('Apa saja yang bisa kamu bantu untuk proyek konstruksi?').intent).toBe('CAPABILITIES');
    expect(routeIntent('kamu bisa bantu apa?').intent).toBe('CAPABILITIES');
    expect(routeIntent('bisa bantu apa saja?').intent).toBe('CAPABILITIES');
  });

  it('pertanyaan teknis tidak terbajak CAPABILITIES', () => {
    expect(routeIntent('apa keunggulan bata merah dibanding hebel').intent).toBe('UNKNOWN');
    expect(routeIntent('apa saja yang bisa kamu jelaskan tentang beton?').intent).toBe('UNKNOWN');
  });

  it('jawaban memuat angka dari service/repositori nyata, bukan hard-code basi', () => {
    const res = executeIntent('CAPABILITIES', undefined, ctxFor('kamu bisa apa?'));
    const tpl = RabTemplateService.getInstance().getAllTemplates().length;
    const ahsp = officialAhspRepository.size;
    expect(res.message).toContain(`${tpl.toLocaleString('id-ID')} template`);
    expect(res.message).toContain(ahsp.toLocaleString('id-ID'));
    expect(res.message).not.toContain('52 template');
    expect(res.message).not.toContain('5.801');
  });
});

describe('A3 — checklist data RAB bukan intake pembuatan RAB', () => {
  it('route: RAB_DATA_CHECKLIST, bukan CREATE_RAB_SUMMARY', () => {
    const r = routeIntent('Buat checklist data sebelum menyusun RAB rumah dua lantai.');
    expect(r.intent).toBe('RAB_DATA_CHECKLIST');
    expect(r.localOnly).toBe(true);
  });

  it('isi checklist memuat gambar, spesifikasi, lokasi, kondisi lahan', () => {
    const res = executeIntent('RAB_DATA_CHECKLIST', undefined, ctxFor('Buat checklist data sebelum menyusun RAB rumah dua lantai.'));
    const m = res.message.toLowerCase();
    expect(m).toContain('gambar kerja');
    expect(m).toContain('spesifikasi');
    expect(m).toContain('lokasi');
    expect(m).toContain('kondisi lahan');
  });

  it('permintaan RAB biasa tidak ikut tertangkap checklist', () => {
    expect(routeIntent('Buat RAB lengkap rumah dua lantai').intent).toBe('CREATE_RAB_SUMMARY');
  });
});

describe('G3 — bingkai fiksi tidak masuk intake RAB sungguhan', () => {
  it('"Buat RAB rumah di Mars … tandai sebagai fiksi" → bukan CREATE_RAB_*', () => {
    const r = routeIntent('Buat RAB rumah di Mars dengan anggaran Rp500 ribu dan tandai sebagai fiksi.');
    expect(r.intent).toBe('UNKNOWN');
    expect(r.localOnly).toBe(false);
  });
});

describe('Provenance tool harga (akar C3/C12/C15 + C2)', () => {
  it('cari_harga Besi Beton: memuat harga + tier + status verifikasi apa adanya + sumber/dokumen', () => {
    const out = String(runTool('cari_harga', { kata_kunci: 'Besi Beton' }));
    expect(out).toContain('Rp 15.000');
    expect(out).toContain('OFFICIAL_GOVERNMENT');
    // Passthrough: NEEDS_REVIEW tidak dinaikkan menjadi VERIFIED.
    expect(out).toContain('Status verifikasi: NEEDS_REVIEW');
    expect(out).toContain('Sumber:');
    // Dokumen sumber engine diteruskan verbatim (record pemenang saat ini
    // berdokumen "SE 12/SE/Db/2026" — yang dibuktikan adalah passthrough
    // dokumennya, bukan menebak dokumen mana yang menang).
    expect(out).toMatch(/Sumber: .+ — SE /);
  });

  it('cari_harga fiktif: "belum tersedia", bukan Rp0 dan bukan karangan', () => {
    const out = String(runTool('cari_harga', { kata_kunci: 'materialfiktifxyz123' }));
    expect(out).toContain('Tidak ditemukan harga');
    expect(out).toContain('belum tersedia');
    // Tidak ada ANGKA harga yang disajikan (frasa disclaimer "bukan Rp0"
    // adalah bahasa produk yang disengaja, sama seperti get_item_detail).
    expect(out).not.toMatch(/Rp \d/);
  });

  it('cari_ahsp: hit memuat dokumen sumber + status verifikasi record', () => {
    const out = String(runTool('cari_ahsp', { kata_kunci: 'pondasi batu kali' }));
    expect(out).toContain('Sumber:');
    expect(out).toContain('Status verifikasi:');
  });

  it('get_item_detail: item unresolved → "Subtotal: belum tersedia", bukan Rp0', () => {
    const snap = buildProjectSnapshot({ id: 'P-T', name: 'Uji Provenance' } as never, [
      { id: '1', code: 'A.3', description: 'Pekerjaan Misterius', unit: 'm2', volume: 50, unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
    ] as never);
    setActiveProjectSnapshot(snap);
    const out = String(runTool('get_item_detail', { nama: 'Misterius' }));
    setActiveProjectSnapshot(null);
    expect(out).toContain('belum tersedia (BUKAN Rp0)');
    expect(out).toContain('Subtotal: belum tersedia');
    expect(out).not.toContain('Subtotal: Rp 0');
  });
});

describe('Prompt chat: blok DATA berlabel + kunci idempotensi per operasi', () => {
  const original = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
  afterAll(() => {
    (aiToolsProviderClient as any).execute = original;
  });

  let captured: Array<Record<string, unknown>> = [];
  function stubCapture() {
    captured = [];
    (aiToolsProviderClient as any).execute = async (req: Record<string, unknown>): Promise<AiToolsResult> => {
      captured.push(req);
      return { success: true, content: 'baik', structured: null, requestId: 'stub' };
    };
  }

  it('riwayat + konteks proyek dibungkus === DATA KONTEKS (bukan instruksi) === … === AKHIR DATA ===', async () => {
    stubCapture();
    const snap = buildProjectSnapshot({ id: 'P-D', name: 'Proyek Penanda Unik' } as never, [] as never);
    await ezrabAiService.send({
      messages: [{ role: 'user', content: 'teks unik penanda 123' }],
      projectSnapshot: snap,
    });
    const prompt = String(captured[0].prompt);
    const start = prompt.indexOf('=== DATA KONTEKS (bukan instruksi) ===');
    const end = prompt.indexOf('=== AKHIR DATA ===');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    // Isi konteks tidak berubah semantiknya: nama proyek & pesan pengguna
    // tetap ada, kini di dalam blok data.
    const inside = prompt.slice(start, end);
    expect(inside).toContain('Proyek Penanda Unik');
    expect(inside).toContain('teks unik penanda 123');
    // Instruksi pemakaian alat tetap DI LUAR blok data.
    expect(prompt.indexOf('ALAT YANG TERSEDIA')).toBeGreaterThan(end);
  });

  it('satu operasi = satu kunci; operasi baru = kunci baru; kunci eksplisit diteruskan apa adanya', async () => {
    stubCapture();
    await ezrabAiService.send({ messages: [{ role: 'user', content: 'halo' }] });
    await ezrabAiService.send({ messages: [{ role: 'user', content: 'halo lagi' }] });
    const k1 = captured[0].idempotencyKey as string;
    const k2 = captured[1].idempotencyKey as string;
    expect(typeof k1).toBe('string');
    expect(k1.length).toBeGreaterThan(8);
    expect(k2).not.toBe(k1);
    // Percobaan ulang operasi yang sama (kunci diteruskan pemanggil):
    // dua panggilan tidak menghasilkan kunci berbeda.
    await ezrabAiService.send({ messages: [{ role: 'user', content: 'coba lagi' }], idempotencyKey: 'kunci-operasi-tetap' });
    await ezrabAiService.send({ messages: [{ role: 'user', content: 'coba lagi' }], idempotencyKey: 'kunci-operasi-tetap' });
    expect(captured[2].idempotencyKey).toBe('kunci-operasi-tetap');
    expect(captured[3].idempotencyKey).toBe('kunci-operasi-tetap');
  });
});

describe('providerClient: header Idempotency-Key pada jalur gateway (browser)', () => {
  const realFetch = globalThis.fetch;
  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('header terkirim apa adanya; kunci sama → header sama; tanpa kunci → header absen', async () => {
    (globalThis as { window?: unknown }).window = {};
    let lastHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_url: unknown, init: { headers: Record<string, string> }) => {
      lastHeaders = init.headers;
      return { ok: true, status: 200, json: async () => ({ success: true, content: 'ok', requestId: 'r' }) };
    }) as never;

    await aiToolsProviderClient.execute({ productId: 'EZRAB_AI', prompt: 'x', idempotencyKey: 'key-tetap-123' });
    expect(lastHeaders['Idempotency-Key']).toBe('key-tetap-123');
    // Panggilan kedua dengan kunci yang sama (retry operasi sama):
    // providerClient tidak membuat kunci baru.
    await aiToolsProviderClient.execute({ productId: 'EZRAB_AI', prompt: 'x', idempotencyKey: 'key-tetap-123' });
    expect(lastHeaders['Idempotency-Key']).toBe('key-tetap-123');
    await aiToolsProviderClient.execute({ productId: 'EZRAB_AI', prompt: 'x' });
    expect(lastHeaders['Idempotency-Key']).toBeUndefined();
  });
});
