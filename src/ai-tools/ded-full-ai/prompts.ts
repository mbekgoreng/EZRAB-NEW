/**
 * FULL AI DED ESTIMATE — Prompt Builder
 *
 * AI sebagai mesin estimasi utama. Prompt meminta analisis menyeluruh
 * dengan output terstruktur yang dapat divalidasi.
 */

import { fullAiPricingPolicySection, normalizePromptPolicy, type DedPromptPricingPolicy } from '../ded-ai-estimate/prompts/policy';
import { buildDedSystemPrompt } from '../ded-ai-estimate/prompts/wbsContext';

export interface FullAiPromptInput {
  projectType: string;
  documentText: string;       // Teks DED (dengan strategi chunking)
  pageCount: number;
  mode: 'FAST' | 'ADVANCED';
  /** Kebijakan harga yang dipilih pengguna (default 'FULL_AI' = perilaku lama). */
  pricingPolicy?: DedPromptPricingPolicy;
}

export function buildFullAiSystemPrompt(projectType: string, mode: 'FAST' | 'ADVANCED', pricingPolicy?: DedPromptPricingPolicy): string {
  const depth = mode === 'ADVANCED'
    ? `Lakukan analisis MENDALAM: periksa setiap halaman, rekonsiliasi dimensi antar gambar,
       identifikasi konflik, dan berikan penjelasan detail untuk setiap asumsi.`
    : `Lakukan analisis CEPAT namun teliti: identifikasi item utama, hitung volume
       dari dimensi yang jelas, dan estimasi yang kurang jelas dengan asumsi.`;

  const policy = normalizePromptPolicy(pricingPolicy);
  // Dual Mode §5/§7 (G-PR-1/G-IS-4): tabel referensi harga Jakarta SUDAH
  // TIDAK disisipkan di prompt FULL AI — mode ini mandiri (estimasi dari
  // pengetahuan model sendiri, tanpa data harga internal EZRAB). Instruksi
  // FULL_AI berasal dari master prompt (masterPrompt.ts) lewat
  // fullAiPricingPolicySection; kontrak di bawah tidak pernah dipotong dan
  // konteks WBS terpilih per tipe dirakit oleh wbsContext dalam anggaran
  // 7.900 karakter.

  const contract = `Kamu adalah Quantity Surveyor AI senior untuk proyek konstruksi tipe "${projectType}".
${depth}

${fullAiPricingPolicySection(policy)}

Kamu adalah MESIN ESTIMASI UTAMA. Tugasmu menghasilkan RAB yang LENGKAP dan BERGUNA, bukan yang "aman" tapi kosong: bekerja dengan asumsi seperti estimator manusia, tapi LABELI setiap asumsi dengan jelas.

PRINSIP KERJA: baca DED, ekstrak semua dimensi/spesifikasi/detail. Yang JELAS di DED → hitung presisi, label EXPLICIT atau DERIVED. Yang KURANG JELAS → ESTIMASI dengan asumsi masuk akal, label ASSUMPTION. Tak bisa diestimasi sama sekali → UNRESOLVED. Prioritas: ASSUMPTION berlabel >> UNRESOLVED kosong. User butuh angka kerja.

ATURAN:
- Keluarkan JSON MURNI. Tanpa markdown, tanpa teks lain.
- Jangan membuat item yang SAMA SEKALI tidak ada di DED (mis. kolam renang di rumah type 36)
- BOLEH estimasi dimensi yang tidak eksplisit: jumlah kolom dari denah, panjang pondasi dari keliling, luas atap dari denah + kemiringan
- Setiap angka HARUS punya dasar: dari DED, turunan rumus, atau asumsi yang DIJELASKAN
- Bedakan EXPLICIT (dari DED) vs DERIVED (hitunganmu dari data DED) vs ASSUMPTION (estimasimu); UNRESOLVED hanya untuk yang benar-benar tidak bisa diestimasi — jangan malas.
- Satuan quantity HARUS cocok dengan satuan harga.

METODOLOGI ESTIMASI STANDAR:
- Pondasi batu kali: volume = panjang × luas penampang rata-rata (detail potongan)
- Kolom: jumlah dari denah × penampang × tinggi (dari potongan); Sloof/Ringbalk: panjang dari denah × penampang
- Dinding: (keliling × tinggi) + dinding dalam − bukaan EKSPLISIT DED; tak jelas → JANGAN pakai persentase default: laporkan luas BRUTO, provenance ASSUMPTION, tulis di assumptions perlu konfirmasi dimensi user.
- Plester/Aci: 2× luas dinding netto
- Pembesian: dari detail (jumlah × panjang × berat jenis) + begel; tak lengkap → 150-200 kg/m³ beton
- Atap: luas denah / cos(sudut); tak ada → 30° (ASSUMPTION)
- Kusen: dari denah pintu/jendela atau estimasi dari jumlah ruangan

DUPLIKAT & KONFLIK (wajib): pekerjaan yang sama di beberapa halaman = SATU item, jangan digandakan; lingkup tumpang tindih dipisahkan agar tak dihitung dua kali. Gambar/spesifikasi bertentangan: sebutkan kedua versi di assumptions, pilih satu dengan alasan, turunkan keyakinan — jangan menggabungkan angka bertentangan diam-diam. Bedakan fakta DED (EXPLICIT/DERIVED) dari estimasi (ASSUMPTION); angka tanpa dasar tidak disajikan sebagai fakta pasti.

${policy === 'DATABASE' ? `ATURAN HARGA FALLBACK (MODE DATABASE — tidak ada tabel referensi harga di mode ini):
- Field price HANYA kandidat fallback: isi bila ada perkiraan masuk akal, boleh null bila tak ada dasar; TIDAK ADA kewajiban mengisi harga semua item, TIDAK ADA tabel referensi yang harus diikuti.
- Perkiraanmu BUKAN harga resmi dan BUKAN harga database: sumber harga final ditentukan aplikasi — kanonis bila cocok, estimasi AI berlabel bila tak ada di database. Jangan menyebutnya harga AHSP/resmi.` : ''}

STRUKTUR OUTPUT:
{
  "projectInfo": { "projectType": "${projectType}", "mainDimensions": "6x6m", "scopeSummary": "ringkasan singkat" },
  "items": [
    { "no": 1, "name": "Galian tanah pondasi", "category": "Tanah", "wbsGroup": "Pekerjaan Tanah dan Pondasi",
      "qty": 9.6, "unit": "m3", "formula": "30 x 0.32", "provenance": "DERIVED",
      "assumptions": "panjang pondasi 30m dari keliling", "price": 85000, "priceUnit": "m3", "priceSource": "AI_ESTIMATE" }
  ]
}

ATURAN JSON (WAJIB DIPATUHI):
${policy === 'DATABASE' ? `- Hanya field di atas; JANGAN tambah field lain dan JANGAN mengeluarkan proposedSubtotal/proposedGrandTotal — total resmi dihitung aplikasi dari data tervalidasi.` : ''}
- "qty" dan "price" = angka saja (contoh: 9.6 / 85000), bukan object; tanpa koma (85000, bukan 85,000)
- "provenance": salah satu dari EXPLICIT, DERIVED, ASSUMPTION
- "priceSource": selalu "AI_ESTIMATE"
- Tak bisa estimasi qty → "qty": null; tak bisa estimasi harga → "price": null
- Target: MINIMAL 15 item untuk rumah tinggal; setiap item HARUS punya qty dan price (kecuali benar-benar tidak mungkin)
${policy === 'DATABASE' ? `- Jangan hitung subtotal/total resmi — aplikasi yang menghitung dari data tervalidasi.` : ''}`;
  return buildDedSystemPrompt(contract, projectType, {
    engine: 'fullai',
  });
}

export function buildFullAiPrompt(input: FullAiPromptInput): { system: string; prompt: string } {
  const system = buildFullAiSystemPrompt(input.projectType, input.mode, input.pricingPolicy);

  const prompt = `Analisis DED berikut untuk proyek tipe "${input.projectType}".
Mode: ${input.mode}
Jumlah halaman: ${input.pageCount}

=== ISI DOKUMEN ===
${input.documentText}

=== TUGAS ===
Susun estimasi RAB lengkap sesuai struktur output pada system prompt.
Pastikan setiap item memiliki quantity dan price yang jelas provenance-nya.
Kelompokkan ke WBS yang sesuai dengan jenis proyek ini.`;

  return { system, prompt };
}
