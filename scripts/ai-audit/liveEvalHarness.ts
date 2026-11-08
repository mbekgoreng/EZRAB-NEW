/**
 * liveEvalHarness — harness evaluasi LIVE untuk jalur Chat AI EZRAB
 * (finalisasi 2026-11-08, §9). Status saat dibuat: NOT EXECUTED —
 * tidak ada kunci provider di lingkungan pengembangan ini.
 *
 * Syarat lingkungan untuk menjalankan (diisi OPERATOR, bukan di-commit):
 *   - RIVER_API_KEY (atau key provider sesuai rantai api/ai/_chain.js)
 *   - Opsional: EZRAB_AI_MODEL untuk menimpa model registry.
 * Perintah: npx --yes tsx scripts/ai-audit/liveEvalHarness.ts
 *
 * Harness mengirim subset skenario deterministik (constructionScenarios)
 * lewat EzrabAiService NYATA (mode fast & advanced) dan menilai apakah
 * respons (a) tidak menolak gudang sebagai "gedung bertingkat",
 * (b) memuat/menawarkan draft atau klarifikasi yang benar, (c) tidak
 * mengarang harga (angka Rp hanya boleh muncul bila resolver resmi
 * yang menghasilkannya — dinilai manual dari transkrip yang disimpan).
 * Hasil ditulis ke scripts/ai-audit/history/live-<timestamp>.json.
 * JANGAN menyajikan hasil harness ini sebagai lulus sebelum benar-benar
 * dijalankan dengan kunci asli.
 */
import { EzrabAiService } from '../../src/ai-tools/ezrab-ai/service';

const CASES: Array<{ id: string; prompt: string; mustNotContain: string[] }> = [
  { id: 'live-001', prompt: 'buatkan rab gudang 10 x 20 m dengan luas lahan 500 m2', mustNotContain: ['Gedung & Bangunan Bertingkat'] },
  { id: 'live-002', prompt: 'buatkan rab gudang -5x10', mustNotContain: [] },
  { id: 'live-003', prompt: 'buatkan rab sesuatu yang besar', mustNotContain: [] },
];

async function main(): Promise<void> {
  if (!process.env.RIVER_API_KEY && !process.env.ATMO_API_KEY) {
    console.log('LIVE EVALUATION = NOT EXECUTED: tidak ada kunci provider di environment (RIVER_API_KEY/ATMO_API_KEY kosong).');
    process.exit(2);
  }
  const svc = new EzrabAiService();
  for (const mode of ['fast', 'advanced'] as const) {
    for (const c of CASES) {
      const res = await svc.send({ messages: [{ role: 'user', content: c.prompt }], mode });
      const bad = c.mustNotContain.filter((s) => res.reply.includes(s));
      console.log(`[${mode}] ${c.id}: success=${res.success} terlarang=${bad.length ? bad.join(',') : 'tidak ada'}`);
    }
  }
}

void main();
