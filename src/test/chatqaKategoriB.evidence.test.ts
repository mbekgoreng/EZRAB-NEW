/**
 * CHAT-QA KATEGORI B — evidence harness (BUKAN regression suite produk).
 * Run: npx vitest run src/test/chatqaKategoriB.evidence.test.ts
 *
 * Tujuan: membuktikan secara deterministik, untuk 15 kasus perhitungan
 * Kategori B, (1) jalur aktual tiap input di pipeline Chat AI lokal
 * (routeIntent), (2) oracle hitungan yang benar (dihitung di harness,
 * bukan dinilai dari bahasa), (3) cakupan tool deterministik yang
 * benar-benar ada di src/ai-tools/ezrab-ai/tools.ts, termasuk perilaku
 * service bila model memanggil tool secara ideal (stub transport,
 * pola chatAiF3.test.ts).
 *
 * Kasus yang jawabannya berupa prosa model live TIDAK dinilai di sini —
 * harness ini hanya memproduksi bukti arsitektur + cakupan deterministik.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { runTool, EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';
import { aiToolsProviderClient, AiToolsResult } from '../ai-tools/providerClient';
import { ezrabAiService } from '../ai-tools/ezrab-ai/service';

const CASES: { id: string; input: string }[] = [
  { id: 'B1', input: 'Hitung volume balok beton 0,25 m × 0,40 m × 6 m.' },
  { id: 'B2', input: 'Pelat 6 m × 8 m tebal 12 cm. Hitung volume tanpa bukaan.' },
  { id: 'B3', input: 'Dinding 10 m × 3,5 m memiliki dua pintu 0,9 × 2,1 m dan dua jendela 1,2 × 1,2 m. Berapa luas bersih?' },
  { id: 'B4', input: 'Galian berukuran 2,5 m × 1,2 m × 0,8 m. Hitung volume geometrisnya.' },
  { id: 'B5', input: 'Volume 125 m² dengan harga Rp85.000/m². Berapa total?' },
  { id: 'B6', input: 'Jumlahkan Rp12.500.000, Rp7.250.000, dan Rp3.875.000.' },
  { id: 'B7', input: 'Subtotal Rp240 juta dan PPN diasumsikan 11%. Berapa PPN dan total? Nyatakan tarif sebagai asumsi soal.' },
  { id: 'B8', input: 'Konversi tebal 125 mm menjadi meter.' },
  { id: 'B9', input: 'Konversi 2,75 m³ menjadi liter.' },
  { id: 'B10', input: 'Mengapa harga Rp/kg tidak boleh langsung dikalikan dengan volume m³ tanpa konversi yang sah?' },
  { id: 'B11', input: 'Delapan pekerja menyelesaikan 40 m² dalam 2 hari. Berapa produktivitas rata-rata per pekerja per hari?' },
  { id: 'B12', input: 'Panjang 12,4 m dibagi menjadi empat segmen sama. Berapa panjang setiap segmen?' },
  { id: 'B13', input: 'Apa yang harus dilakukan jika volume hasil perhitungan negatif?' },
  { id: 'B14', input: 'Kontraktor menyebut 100 m³ sedangkan hasil ukur 82 m³. Berapa selisih dan persentasenya terhadap 82 m³?' },
  { id: 'B15', input: 'Jika hasil hitungan tampak benar tetapi satuan harga dan kuantitas berbeda, apakah boleh langsung digunakan?' },
];

describe('Bukti 1 — jalur aktual tiap kasus di router lokal', () => {
  for (const c of CASES) {
    it(`${c.id} → routeIntent`, () => {
      const r = routeIntent(c.input);
      // eslint-disable-next-line no-console
      console.log(`[ROUTE] ${c.id}: intent=${r.intent} localOnly=${r.localOnly} needsClarification=${r.needsClarification}`);
      expect(typeof r.intent).toBe('string');
    });
  }
});

describe('Bukti 2 — oracle deterministik (dihitung di harness)', () => {
  it('oracle sesuai kunci jawaban master prompt', () => {
    expect(0.25 * 0.4 * 6).toBeCloseTo(0.6, 10); // B1
    expect(6 * 8 * (12 / 100)).toBeCloseTo(5.76, 10); // B2 (12 cm = 0,12 m)
    expect(10 * 3.5 - 2 * (0.9 * 2.1) - 2 * (1.2 * 1.2)).toBeCloseTo(28.34, 10); // B3
    expect(2.5 * 1.2 * 0.8).toBeCloseTo(2.4, 10); // B4
    expect(125 * 85000).toBe(10625000); // B5
    expect(12500000 + 7250000 + 3875000).toBe(23625000); // B6
    expect(240000000 * 0.11).toBeCloseTo(26400000, 6); // B7 PPN
    expect(240000000 * 1.11).toBeCloseTo(266400000, 4); // B7 total
    expect(125 / 1000).toBeCloseTo(0.125, 10); // B8
    expect(2.75 * 1000).toBe(2750); // B9
    expect(40 / (8 * 2)).toBeCloseTo(2.5, 10); // B11
    expect(12.4 / 4).toBeCloseTo(3.1, 10); // B12
    expect(100 - 82).toBe(18); // B14 selisih
    expect((18 / 82) * 100).toBeCloseTo(21.95, 2); // B14 persen
  });
});

describe('Bukti 3 — inventaris tool deterministik chat', () => {
  it('daftar tool yang tersedia untuk model', () => {
    const names = EZRAB_AI_TOOLS.map((t) => t.name);
    // eslint-disable-next-line no-console
    console.log('[TOOLS]', names.join(', '));
    // Tool hitung yang ada hanya 4 ini:
    expect(names).toContain('subtotal');
    expect(names).toContain('volume_persegi');
    expect(names).toContain('luas_dinding');
    expect(names).toContain('persentase_level');
    // TIDAK ada tool: penjumlahan umum, persen-dari-nilai/PPN, konversi
    // satuan, produktivitas, pembagian segmen, selisih/persen-selisih.
    const calcNames = names.filter((n) =>
      /jumlah|tambah|sum|konversi|convert|ppn|pajak|tax|produktif|bagi|selisih/.test(n),
    );
    expect(calcNames).toEqual([]);
  });
});

describe('Bukti 4 — perilaku tool deterministik terhadap argumen kasus', () => {
  it('B1: volume_persegi(6 × 0,25 × 0,40) = oracle', () => {
    const out = runTool('volume_persegi', { panjang: 6, lebar: 0.25, tinggi: 0.4 });
    console.log('[TOOL B1]', out);
    expect(out).toBe('Volume = 0,6 m³');
  });
  it('B4: volume_persegi(2,5 × 1,2 × 0,8) = oracle', () => {
    const out = runTool('volume_persegi', { panjang: 2.5, lebar: 1.2, tinggi: 0.8 });
    console.log('[TOOL B4]', out);
    expect(out).toBe('Volume = 2,4 m³');
  });
  it('B2: volume_persegi hanya benar SETELAH konversi cm→m dilakukan di luar tool', () => {
    const out = runTool('volume_persegi', { panjang: 6, lebar: 8, tinggi: 0.12 });
    console.log('[TOOL B2 pasca-konversi]', out);
    expect(out).toBe('Volume = 5,76 m³');
    // Tanpa konversi (tinggi=12 apa adanya) tool menghasilkan angka salah
    // tanpa peringatan satuan apa pun:
    const raw = runTool('volume_persegi', { panjang: 6, lebar: 8, tinggi: 12 });
    console.log('[TOOL B2 tanpa-konversi]', raw);
    expect(raw).toBe('Volume = 576 m³');
  });
  it('B5: subtotal(125 × 85.000) = oracle', () => {
    const out = runTool('subtotal', { volume: 125, unitPrice: 85000 });
    console.log('[TOOL B5]', out);
    expect(out).toBe('Subtotal = Rp 10.625.000');
  });
  it('B3 (REGRESI Fase 4): luas_dinding default SATU bidang → hasil = oracle', () => {
    // Dulu rumus tool (p×t)×2 − bukaan menghasilkan 63,34 (salah untuk soal
    // satu bidang). Sesudah perbaikan FIX-1: default satu bidang
    // (p×t − bukaan); dua sisi hanya via parameter sisi: 2.
    // Total bukaan soal: 2×(0,9×2,1) + 2×(1,2×1,2) = 3,78 + 2,88 = 6,66 m².
    const out = runTool('luas_dinding', { panjang: 10, tinggi: 3.5, bukaan: 6.66 });
    console.log('[TOOL B3]', out, '| oracle = Luas dinding = 28,34 m²');
    expect(out).toBe('Luas dinding = 28,34 m²');
  });
  it('B14: persentase_level(18, 82) memberi nilai persen oracle tetapi berlabel "Level"', () => {
    const out = runTool('persentase_level', { kenaikan: 18, jarak: 82 });
    console.log('[TOOL B14]', out);
    expect(out).toBe('Level = 21,95%');
  });
  it('B13 (REGRESI Fase 4): volume_persegi DAN subtotal kini sama-sama menolak negatif', () => {
    const neg = runTool('volume_persegi', { panjang: -2, lebar: 3, tinggi: 2 });
    console.log('[TOOL B13 volume negatif]', neg);
    expect(neg).toBe('ERROR: hasil volume harus lebih dari nol.');
    const negSubtotal = runTool('subtotal', { volume: -5, unitPrice: 1000 });
    console.log('[TOOL B13 subtotal negatif]', negSubtotal);
    // Dulu lolos sebagai 'Subtotal = Rp -5.000'; kini ERROR terstruktur.
    expect(negSubtotal).toContain('ERROR');
    expect(negSubtotal).toContain('tidak boleh negatif');
  });
  it('B10/B15: subtotal mengalikan satuan apa pun tanpa validasi dimensi', () => {
    // Tidak ada argumen satuan sama sekali pada subtotal — volume "m³" dan
    // harga "Rp/kg" akan dikalikan begitu saja bila model memanggilnya.
    const out = runTool('subtotal', { volume: 2.75, unitPrice: 15000 });
    console.log('[TOOL B10/B15 buta-satuan]', out);
    expect(out).toBe('Subtotal = Rp 41.250');
  });
});

describe('Bukti 5 — end-to-end service dengan stub transport (pola chatAiF3)', () => {
  const original = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
  afterAll(() => {
    (aiToolsProviderClient as any).execute = original;
  });
  function stubExecute(content: string) {
    (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> => ({
      success: true,
      content,
      structured: null,
      requestId: 'stub-qa-B',
    });
  }

  it('B1: model ideal memanggil volume_persegi → balasan service = output tool = oracle', async () => {
    stubExecute('{"tool":"volume_persegi","args":{"panjang":6,"lebar":0.25,"tinggi":0.4}}');
    const res = await ezrabAiService.send({
      messages: [{ role: 'user', content: CASES[0].input }],
    });
    console.log('[E2E B1]', res.reply);
    expect(res.success).toBe(true);
    expect(res.reply).toBe('Volume = 0,6 m³');
    expect(res.toolCalls?.[0]?.toolName).toBe('volume_persegi');
  });

  it('B5: model ideal memanggil subtotal → balasan service = oracle', async () => {
    stubExecute('{"tool":"subtotal","args":{"volume":125,"unitPrice":85000}}');
    const res = await ezrabAiService.send({
      messages: [{ role: 'user', content: CASES[4].input }],
    });
    console.log('[E2E B5]', res.reply);
    expect(res.success).toBe(true);
    expect(res.reply).toBe('Subtotal = Rp 10.625.000');
  });

  it('B3 (REGRESI Fase 4): model memakai luas_dinding → balasan service = oracle', async () => {
    stubExecute('{"tool":"luas_dinding","args":{"panjang":10,"tinggi":3.5,"bukaan":6.66}}');
    const res = await ezrabAiService.send({
      messages: [{ role: 'user', content: CASES[2].input }],
    });
    console.log('[E2E B3]', res.reply, '| oracle 28,34 m²');
    expect(res.success).toBe(true);
    expect(res.reply).toBe('Luas dinding = 28,34 m²'); // dulu 63,34 (rumus ×2)
  });

  it('B6: tanpa tool penjumlahan, jawaban sepenuhnya teks model (stub prosa diteruskan apa adanya)', async () => {
    // Stub menirukan model yang menjawab prosa TANPA tool call — service
    // meneruskan teks itu sebagai jawaban final (service.ts: toolReply ??
    // fallbackText). Angka di dalamnya tidak diverifikasi kode apa pun.
    stubExecute('Totalnya adalah Rp 23.625.000.');
    const res = await ezrabAiService.send({
      messages: [{ role: 'user', content: CASES[5].input }],
    });
    console.log('[E2E B6 prosa]', res.reply, '| toolCalls:', res.toolCalls);
    expect(res.success).toBe(true);
    expect(res.toolCalls).toBeUndefined();
    expect(res.reply).toBe('Totalnya adalah Rp 23.625.000.');
  });
});
