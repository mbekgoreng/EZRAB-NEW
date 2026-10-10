/**
 * FULL AI DED ESTIMATE — Prompt Builder
 *
 * AI sebagai mesin estimasi utama. Prompt meminta analisis menyeluruh
 * dengan output terstruktur yang dapat divalidasi.
 */

import { formatPriceReferenceForPrompt } from './jakartaPrices';

export interface FullAiPromptInput {
  projectType: string;
  documentText: string;       // Teks DED (dengan strategi chunking)
  pageCount: number;
  mode: 'FAST' | 'ADVANCED';
}

export function buildFullAiSystemPrompt(projectType: string, mode: 'FAST' | 'ADVANCED'): string {
  const depth = mode === 'ADVANCED'
    ? `Lakukan analisis MENDALAM: periksa setiap halaman, rekonsiliasi dimensi antar gambar,
       identifikasi konflik, dan berikan penjelasan detail untuk setiap asumsi.`
    : `Lakukan analisis CEPAT namun teliti: identifikasi item utama, hitung volume
       dari dimensi yang jelas, dan estimasi yang kurang jelas dengan asumsi.`;

  const priceRef = formatPriceReferenceForPrompt();

  return `Kamu adalah Quantity Surveyor AI senior untuk proyek konstruksi tipe "${projectType}".
${depth}

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

${priceRef}

ATURAN HARGA:
- WAJIB isi unitPrice untuk SEMUA item standar menggunakan referensi di atas
- source: "AI_ESTIMATE", region: "Jakarta", period: "2026"
- Jika item tidak ada di referensi, pakai yang paling dekat dan jelaskan di notes
- unitPrice = null HANYA untuk item yang benar-benar tidak ada acuan sama sekali

STRUKTUR OUTPUT:
{
  "projectInfo": {
    "projectType": "string",
    "buildingFunction": "string atau null",
    "floorCount": "number atau null",
    "mainDimensions": "string atau null (contoh: 6x6m)",
    "structuralSystem": "string atau null",
    "scopeSummary": "ringkasan 2-3 kalimat",
    "missingInfo": ["info yang tidak ditemukan tapi diasumsikan"],
    "ambiguities": ["hal yang ambigu"]
  },
  "items": [
    {
      "no": 1,
      "wbsCode": "BGN-04-B atau null",
      "wbsGroup": "nama kelompok atau null",
      "name": "nama pekerjaan",
      "description": "deskripsi singkat atau null",
      "category": "kategori",
      "quantity": {
        "value": 0.81,
        "unit": "m3",
        "formula": "12 × 0.15 × 0.15 × 3",
        "steps": ["langkah 1", "langkah 2"],
        "dimensions": "0.15×0.15×3m per kolom",
        "sourcePages": [1, 3],
        "provenance": "EXPLICIT|DERIVED|ASSUMPTION|NEEDS_CONFIRMATION|UNRESOLVED",
        "confidence": "HIGH|MEDIUM|LOW",
        "assumptions": ["asumsi yang dipakai, WAJIB diisi jika ASSUMPTION"],
        "notes": "catatan ketidakpastian"
      },
      "price": {
        "unitPrice": 4500000,
        "unit": "m3",
        "source": "AI_ESTIMATE",
        "region": "Jakarta",
        "period": "2026",
        "ahspCode": null,
        "notes": "referensi harga Jakarta 2026"
      },
      "sourcePages": [1, 3]
    }
  ],
  "warnings": ["peringatan jika ada"]
}

PENTING:
- Target: MINIMAL 15-20 item untuk rumah tinggal, JANGAN kurang dari 10
- Setiap item HARUS punya quantity.value dan price.unitPrice (kecuali benar-benar tidak mungkin)
- "assumptions" WAJIB diisi untuk setiap ASSUMPTION — jelaskan dasar perkiraanmu
- Jangan hitung subtotal — aplikasi yang memverifikasi.
- WBS: gunakan kode yang sesuai jenis proyek.`;
}

export function buildFullAiPrompt(input: FullAiPromptInput): { system: string; prompt: string } {
  const system = buildFullAiSystemPrompt(input.projectType, input.mode);

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
