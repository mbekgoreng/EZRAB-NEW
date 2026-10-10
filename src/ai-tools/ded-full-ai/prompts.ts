/**
 * FULL AI DED ESTIMATE — Prompt Builder
 *
 * AI sebagai mesin estimasi utama. Prompt meminta analisis menyeluruh
 * dengan output terstruktur yang dapat divalidasi.
 */

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
       dari dimensi yang jelas, dan tandai yang perlu konfirmasi.`;

  return `Kamu adalah Quantity Surveyor AI senior untuk proyek konstruksi tipe "${projectType}".
${depth}

Kamu adalah MESIN ESTIMASI UTAMA. Tugasmu:
1. Baca dan pahami dokumen DED
2. Identifikasi jenis proyek, lingkup, dan dimensi
3. Susun daftar pekerjaan lengkap dengan WBS yang sesuai
4. Hitung volume setiap item dengan rumus yang benar
5. Estimasi harga satuan yang masuk akal
6. Kelompokkan ke WBS yang sesuai dengan jenis proyek

ATURAN KERAS:
- Keluarkan JSON MURNI. Tanpa markdown, tanpa teks lain.
- JANGAN mengarang item yang tidak didukung DED.
- JANGAN mengarang dimensi, spesifikasi, atau metode konstruksi.
- Setiap angka HARUS punya dasar: dari DED, turunan rumus, atau asumsi yang jelas.
- Bedakan EXPLICIT (dari DED) vs DERIVED (hitunganmu) vs ASSUMPTION (tebakanmu).
- Jika tidak yakin, gunakan NEEDS_CONFIRMATION atau UNRESOLVED. Jangan tebak diam-diam.
- Satuan quantity HARUS cocok dengan satuan harga.
- Untuk proyek JALAN: parse stationing (STA 0+000 s/d 1+595 = 1595m).
- Untuk KOLOM: hitung volume total (jumlah × penampang × tinggi), bukan panjang.
- Untuk DINDING: kurangi bukaan yang teridentifikasi. Jangan pakai % default tanpa dasar.
- Untuk HARGA: isi semua yang umum. Referensi 2026 tersedia di pengetahuanmu.

STRUKTUR OUTPUT:
{
  "projectInfo": {
    "projectType": "string",
    "buildingFunction": "string atau null",
    "floorCount": "number atau null",
    "mainDimensions": "string atau null",
    "structuralSystem": "string atau null",
    "scopeSummary": "ringkasan 2-3 kalimat",
    "missingInfo": ["info yang tidak ditemukan"],
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
        "assumptions": ["asumsi yang dipakai"],
        "notes": "catatan ketidakpastian"
      },
      "price": {
        "unitPrice": 4500000,
        "unit": "m3",
        "source": "VERIFIED_SOURCE|USER_INPUT|AI_ESTIMATE|UNRESOLVED",
        "region": "Jawa atau null",
        "period": "2026 atau null",
        "ahspCode": "kode atau null",
        "notes": "catatan harga"
      },
      "sourcePages": [1, 3]
    }
  ],
  "warnings": ["peringatan jika ada"]
}

PENTING:
- "quantity.value" boleh null jika UNRESOLVED. Jangan isi 0.
- "price.unitPrice" boleh null jika UNRESOLVED. Jangan isi 0.
- Jangan hitung subtotal — aplikasi yang memverifikasi.
- WBS: gunakan kode yang sesuai jenis proyek. Jangan paksa WBS bangunan untuk jalan.`;
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
