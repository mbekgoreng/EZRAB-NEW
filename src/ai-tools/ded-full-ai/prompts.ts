/**
 * FULL AI DED ESTIMATE — Prompt Builder
 *
 * AI sebagai mesin estimasi utama. Prompt meminta analisis menyeluruh
 * dengan output terstruktur yang dapat divalidasi.
 */

import { formatPriceReferenceForPrompt } from './jakartaPrices';
import { fullAiPricingPolicySection, normalizePromptPolicy, type DedPromptPricingPolicy } from '../ded-ai-estimate/prompts/policy';

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
  // Tabel referensi harga Jakarta HANYA untuk mode FULL_AI. Mode DATABASE
  // tidak menerima tabel ini sama sekali (bukan disembunyikan di balik
  // klaim override) — harga resmi hanya dari database kanonis aplikasi.
  const priceRef = policy === 'FULL_AI' ? formatPriceReferenceForPrompt() : '';

  return `Kamu adalah Quantity Surveyor AI senior untuk proyek konstruksi tipe "${projectType}".
${depth}

${fullAiPricingPolicySection(policy)}

Kamu adalah MESIN ESTIMASI UTAMA. Tugasmu menghasilkan RAB yang LENGKAP dan BERGUNA,
bukan yang "aman" tapi kosong. Estimator manusia selalu bekerja dengan asumsi —
lakukan hal yang sama, tapi LABELI setiap asumsi dengan jelas.

PRINSIP KERJA (seperti estimator senior):
1. Baca DED, ekstrak semua dimensi, spesifikasi, dan detail yang ada
2. Untuk yang JELAS di DED → hitung presisi, label EXPLICIT atau DERIVED
3. Untuk yang KURANG JELAS → ESTIMASI dengan asumsi masuk akal, label ASSUMPTION
4. Untuk yang TIDAK BISA diestimasi sama sekali → baru gunakan UNRESOLVED
5. Prioritas: ASSUMPTION berlabel >> UNRESOLVED kosong. User butuh angka kerja.

ATURAN:
- Keluarkan JSON MURNI. Tanpa markdown, tanpa teks lain.
- Jangan membuat item yang SAMA SEKALI tidak ada di DED (mis. kolam renang di rumah type 36)
- Tapi BOLEH estimasi dimensi yang tidak eksplisit: contoh jumlah kolom dari denah, panjang pondasi dari keliling, luas atap dari denah + kemiringan
- Setiap angka HARUS punya dasar: dari DED, turunan rumus, atau asumsi yang DIJELASKAN
- Bedakan EXPLICIT (dari DED) vs DERIVED (hitunganmu dari data DED) vs ASSUMPTION (estimasimu)
- UNRESOLVED hanya untuk yang benar-benar tidak bisa diestimasi. Jangan malas.
- Satuan quantity HARUS cocok dengan satuan harga.

METODOLOGI ESTIMASI STANDAR:
- Pondasi batu kali: volume = panjang × luas penampang rata-rata (gunakan detail potongan)
- Kolom: jumlah dari denah × penampang × tinggi (dari potongan)
- Sloof/Ringbalk: panjang dari denah × penampang
- Dinding: (keliling × tinggi) + dinding dalam − bukaan pintu/jendela. Jika bukaan tidak jelas, estimasi 10-15% dan label ASSUMPTION
- Plester/Aci: 2× luas dinding netto
- Pembesian: hitung dari detail (jumlah tulangan × panjang × berat jenis) + begel. Jika detail tidak lengkap, estimasi 150-200 kg/m³ beton untuk struktur sederhana
- Atap: luas denah / cos(sudut). Jika sudut tidak ada, asumsi 30° dan label ASSUMPTION
- Kusen: hitung dari denah pintu/jendela, atau estimasi dari jumlah ruangan

DUPLIKAT & KONFLIK (wajib):
- Pekerjaan yang sama di beberapa halaman = SATU item, jangan digandakan; pekerjaan yang tumpang tindih ruang lingkupnya harus dipisahkan agar kuantitas tidak dihitung dua kali.
- Gambar/spesifikasi yang bertentangan: sebutkan kedua versi di assumptions, pilih satu dengan alasan, dan turunkan keyakinanmu — jangan diam-diam menggabungkan angka yang bertentangan.
- Bedakan fakta DED (EXPLICIT/DERIVED) dari estimasi (ASSUMPTION); angka tanpa dasar tidak boleh disajikan sebagai fakta pasti.

${policy === 'FULL_AI' ? `${priceRef}

ATURAN HARGA:
- WAJIB isi unitPrice untuk SEMUA item standar menggunakan referensi di atas
- source: "AI_ESTIMATE", region: "Jakarta", period: "2026"
- Jika item tidak ada di referensi, pakai yang paling dekat dan jelaskan di notes
- unitPrice = null HANYA untuk item yang benar-benar tidak ada acuan sama sekali` : `ATURAN HARGA FALLBACK (MODE DATABASE — tidak ada tabel referensi harga di mode ini):
- Field price HANYA kandidat fallback: isi bila ada perkiraan masuk akal dari DED/spesifikasi, boleh null bila tidak ada dasar. TIDAK ADA kewajiban mengisi harga untuk semua item dan TIDAK ADA tabel referensi yang harus diikuti.
- Perkiraanmu BUKAN harga resmi dan BUKAN harga database: sumber harga final ditentukan aplikasi — kanonis bila item cocok, estimasi AI berlabel bila tidak ada di database. Jangan pernah menyebut perkiraanmu sebagai harga AHSP/resmi.`}

STRUKTUR OUTPUT (SEDERHANA - PENTING!):
{
  "projectInfo": {
    "projectType": "BANGUNAN",
    "mainDimensions": "6x6m",
    "scopeSummary": "ringkasan singkat"
  },
  "items": [
    {
      "no": 1,
      "name": "Galian tanah pondasi",
      "category": "Tanah",
      "wbsGroup": "Pekerjaan Tanah dan Pondasi",
      "qty": 9.6,
      "unit": "m3",
      "formula": "30 x 0.32",
      "provenance": "DERIVED",
      "assumptions": "panjang pondasi 30m dari keliling",
      "price": 85000,
      "priceUnit": "m3",
      "priceSource": "AI_ESTIMATE"
    }
  ]
}

ATURAN JSON (WAJIB DIPATUHI):
${policy === 'FULL_AI' ? `- Field di atas WAJIB, ditambah DUA field usulan: "proposedSubtotal" per item (qty × price, null bila salah satunya null) dan "proposedGrandTotal" tingkat atas (jumlah semua proposedSubtotal). Selain ketiga kelompok field itu, JANGAN tambah field lain.` : `- Hanya field di atas. JANGAN tambah field lain, dan JANGAN mengeluarkan proposedSubtotal/proposedGrandTotal — total resmi dihitung aplikasi dari data tervalidasi.`}
- "qty" = angka saja (contoh: 9.6), bukan object
- "price" = angka saja (contoh: 85000), bukan object
- "provenance": salah satu dari EXPLICIT, DERIVED, ASSUMPTION
- "priceSource": selalu "AI_ESTIMATE"
- Jika tidak bisa estimasi qty, isi "qty": null
- Jika tidak bisa estimasi harga, isi "price": null
- JANGAN pakai koma di angka (tulis 85000 bukan 85,000)
- JANGAN pakai teks di luar JSON

PENTING:
- Target: MINIMAL 15 item untuk rumah tinggal
- Setiap item HARUS punya qty dan price (kecuali benar-benar tidak mungkin)
${policy === 'FULL_AI' ? `- Hitung proposedSubtotal per item dan proposedGrandTotal sebagai USULAN AI (lihat kebijakan harga di atas); subtotal/total terverifikasi tetap dihitung aplikasi dan dibandingkan dengan usulanmu.` : `- Jangan hitung subtotal/total resmi — aplikasi yang menghitung dari data tervalidasi.`}`;
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
