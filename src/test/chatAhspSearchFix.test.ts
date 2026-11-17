/**
 * EZRAB Chat AI — Perbaikan pencarian AHSP (temuan live 2026-11-17).
 * 1. "bebas carikan ahsp yang cocok" mencari kata "yang cocok" harfiah
 *    dan gagal NOT_FOUND — frasa kualifikator kini dibuang dari kata
 *    kunci (router) dan dari istilah pencarian (stopword).
 * 2. "blowplank" (salah eja) tidak menemukan "bouwplank" — koreksi
 *    ejaan fuzzy kini mengoreksi ke token katalog terdekat dan
 *    mengumumkannya di catatan hasil.
 * 3. Pencarian tanpa kata kunci kini memakai topik dari pesan
 *    sebelumnya (fallback riwayat) sebelum bertanya balik.
 * 4. Aturan prompt 28: hitung dari dimensi yang diberi (asumsi
 *    berlabel), jangan tanya balik bentuk yang sudah tersirat.
 * Run: npx tsx src/test/chatAhspSearchFix.test.ts
 */
import { routeIntent, cleanAhspKeyword } from '../ai-tools/ezrab-ai/intentRouter';
import {
  searchChatAhsp,
  formatChatAhspResult,
  resolveAhspTopicFromHistory,
} from '../ai-tools/ezrab-ai/chatSearch';
import { EZRAB_AI_SYSTEM_PROMPT, EZRAB_AI_PROMPT_VERSION } from '../ai-tools/ezrab-ai/prompt';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

// --- Router: frasa kualifikator dibuang dari kata kunci ---

// 1. Kasus persis dari laporan user: hanya kualifikator → klarifikasi
{
  const r = routeIntent('bebas carikan ahsp yang cocok');
  assert(r.intent === 'SEARCH_AHSP', '1: tetap SEARCH_AHSP');
  assert(r.needsClarification === true, '1: tanpa kata kunci nyata → klarifikasi');
  assert(r.param === undefined, '1: param kosong sesudah kualifikator dibuang');
}
// 2. Kata kunci + kualifikator → kata kunci dipertahankan
{
  const r = routeIntent('carikan ahsp bouwplank yang cocok');
  assert(r.intent === 'SEARCH_AHSP' && r.needsClarification === false, '2: kata kunci ada → langsung cari');
  assert(r.param === 'bouwplank', '2: param = bouwplank (kualifikator dibuang)');
}
// 3. "yang pas" (frasa) dibuang — token "pas" sendiri tetap bermakna
{
  assert(cleanAhspKeyword('yang pas') === '', '3: "yang pas" → kosong');
  assert(cleanAhspKeyword('pasangan bata yang pas') === 'pasangan bata', '3: "pasangan bata yang pas" → pasangan bata');
  const r = routeIntent('carikan ahsp yang sesuai untuk pondasi');
  assert(r.param === 'untuk pondasi', '3: "yang sesuai" dibuang, sisa diteruskan ke pencarian');
}
// 4. Perilaku lama tidak berubah untuk kata kunci biasa
{
  assert(routeIntent('cari ahsp beton').param === 'beton', '4: "beton" utuh');
  assert(routeIntent('cari ahsp plesteran 1:4').param === 'plesteran 1:4', '4: rasio utuh');
  assert(routeIntent('cari ahsp').needsClarification === true, '4: tanpa kata kunci → klarifikasi');
}

// --- Search: stopword kualifikator + koreksi ejaan fuzzy ---

// 5. "yang cocok" lewat tool langsung: bukan NOT_FOUND palsu lagi
{
  const r = searchChatAhsp('yang cocok');
  assert(r.terms.length === 0, '5: "yang cocok" → 0 istilah konten');
  assert(r.outcome === 'NOT_FOUND', '5: tetap NOT_FOUND (tidak ada yang dicari)');
  assert((r.notFoundMessage ?? '').includes('terlalu umum setelah dibersihkan'), '5: pesan jujur "terlalu umum", bukan "tidak ditemukan untuk yang cocok"');
  assert(!(r.notFoundMessage ?? '').includes('Tidak ditemukan AHSP untuk "yang cocok"'), '5: pesan lama yang menyesatkan hilang');
}
// 6. Typo "blowplank" dikoreksi ke "bouwplank" dan menemukan item
{
  const r = searchChatAhsp('blowplank');
  assert(r.outcome === 'FOUND_RELEVANT', '6: blowplank → FOUND_RELEVANT sesudah koreksi');
  assert(r.items.some((it) => it.code === '1.1.4.2'), '6: item 1.1.4.2 Pasangan 1 m\' bouwplank ditemukan');
  assert((r.note ?? '').includes('"blowplank" dikoreksi menjadi "bouwplank"'), '6: koreksi diumumkan di catatan');
  const text = formatChatAhspResult(r);
  assert(text.includes('dikoreksi menjadi "bouwplank"'), '6: catatan koreksi tampil di teks hasil');
  assert(text.includes('1.1.4.2'), '6: teks hasil memuat item bouwplank');
}
// 7. Ejaan benar tidak dikoreksi dan tidak berubah
{
  const r = searchChatAhsp('bouwplank');
  assert(r.outcome === 'FOUND_RELEVANT', '7: bouwplank tetap FOUND_RELEVANT');
  assert(r.items.some((it) => it.code === '1.1.4.2'), '7: item 1.1.4.2 ditemukan');
  assert(!r.note, '7: tanpa catatan koreksi untuk ejaan benar');
}
// 8. Gerbang anti over-matching tetap jalan (di luar katalog tetap NOT_FOUND)
// ("emas batangan" SENGAJA tidak diasertasi: kecocokan sebagian ke pohon
// "Hujan Emas" adalah perilaku pra-ada yang gerbang N1/N2 memang tidak
// menangkap — di luar cakupan perbaikan ini, bukan regresi.)
{
  const r2 = searchChatAhsp('teleportasi material');
  assert(r2.outcome === 'NOT_FOUND', '8: teleportasi material tetap NOT_FOUND');
}
// 9. Istilah pendek/tidak dikenal tidak dikoreksi asal-asalan
{
  const r = searchChatAhsp('zzzz');
  assert(r.outcome === 'NOT_FOUND', '9: "zzzz" tetap NOT_FOUND tanpa koreksi');
  assert(!r.note, '9: tanpa catatan koreksi untuk istilah tak dikenal');
}

// --- Fallback topik dari riwayat ---

// 10. Alur persis laporan user: pesan sebelumnya soal blowplank 5x10
{
  const t = resolveAhspTopicFromHistory(['penambahan item pekerjaan blowplank dalam 5x10 m']);
  assert(t !== null, '10: topik ditemukan dari pesan sebelumnya');
  assert(t!.query === 'blowplank', '10: query = blowplank (istilah topik)');
  assert(t!.message.includes('dari pesan sebelumnya'), '10: pesan menyebut sumbernya dari pesan sebelumnya');
  assert(t!.message.includes('1.1.4.2'), '10: pesan memuat hasil bouwplank 1.1.4.2');
  assert(t!.message.includes('dikoreksi menjadi "bouwplank"'), '10: pesan memuat catatan koreksi ejaan');
}
// 11. Tanpa riwayat / riwayat tanpa topik → null (penelepon bertanya balik)
{
  assert(resolveAhspTopicFromHistory([]) === null, '11: riwayat kosong → null');
  assert(resolveAhspTopicFromHistory(['halo']) === null, '11: sapaan → null');
  assert(resolveAhspTopicFromHistory(['berapa total proyek saya?']) === null, '11: pertanyaan total → null');
}
// 12. Hanya pesan TERBARU yang dipakai
{
  const t = resolveAhspTopicFromHistory(['cari ahsp beton', 'penambahan item pekerjaan blowplank dalam 5x10 m']);
  assert(t === null, '12: pesan terbaru ("cari ahsp beton") tanpa topik relevan → null, pesan lama tidak dipakai');
}

// --- Prompt: aturan 28 + versi ---

// 13. System prompt memuat aturan hitungan dari dimensi
{
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('HITUNGAN DARI DIMENSI YANG DIBERI'), '13: prompt memuat aturan 28');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('2×(5+10) = 30 m'), '13: prompt memuat contoh keliling bouwplank 5×10');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('JANGAN menanyakan ulang bentuk/tata letak'), '13: prompt melarang tanya balik bentuk yang tersirat');
}
// 14. Versi prompt naik (2.3.0 = aturan 29 daftar kemampuan resmi,
// 2026-11-17)
{
  assert(EZRAB_AI_PROMPT_VERSION === '2.3.0', '14: EZRAB_AI_PROMPT_VERSION = 2.3.0');
}

console.log(`chatAhspSearchFix: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
