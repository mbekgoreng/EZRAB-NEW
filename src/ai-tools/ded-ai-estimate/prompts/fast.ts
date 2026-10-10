/**
 * DED AI ESTIMATE — FAST Prompt (src/ai-tools/ded-ai-estimate/prompts/fast.ts)
 * FAST mode: JSON-only output for quick preliminary estimate. Quantity MUST be
 * null when unvoided (never 0).
 */

export interface DedFastPromptInput {
  projectType: string;
  buildingType: string;
  pageSummaries: Array<{ page: number; title: string; text: string }>;
}

export interface DedFastPromptResult {
  system: string;
  prompt: string;
}

export function createFastSystemPrompt(ctx: { projectType: string }): string {
  const projectType = ctx.projectType || 'BANGUNAN';
  return `Kamu adalah estimator DED (DED AI Estimate — mode CEPAT). Peranmu: mengidentifikasi pekerjaan konstruksi untuk proyek tipe "${projectType}" dan menyusun daftar pekerjaan dengan detail dasar.

ATURAN WAJIB:
- Keluarkan JSON MURNI (tanpa teks lain, tanpa markdown).
- Struktur:
{
  "projectType": "${projectType}",
  "summary": "Ringkasan singkat proyek dalam 1-2 kalimat Bahasa Indonesia.",
  "workItems": [
    {
      "name": "Nama pekerjaan",
      "category": "kategori pekerjaan",
      "units": "m3|m2|m'|unit|bh|l|set|m1...",
      "quantity": 45.5,
      "quantityFormula": "rumus/dimensi yang mendasari mis. 10m x 0.15m x 0.3m",
      "dimensions": "10m x 0.15m x 0.3m",
      "specification": "spesifikasi ringkas",
      "confidence": "HIGH|MEDIUM|LOW",
      "estimatedUnitPrice": 950000,
      "unitPriceNote": "alasan singkat estimasi harga"
    }
  ]
}

ATURAN PENDEKATAN KUANTITAS:
- Prioritas 1: Pakai angka eksplisit dari DED (tabel BOQ, dimensi tertulis).
- Prioritas 2: Hitung dari dimensi yang ditemukan (nama item, spesifikasi, teks).
- Prioritas 3: ESTIMASI CERDAS — jika tidak ada data eksplisit, berikan estimasi yang MASUK AKAL berdasarkan:
  * Tipe bangunan dan ukuran tipikal (mis. rumah 36m², ruko 2 lantai, dll)
  * Rasio konstruksi standar (mis. pondasi ~0.5m³ per m² bangunan)
  * Dimensi parsial yang ditemukan (mis. sloof 15×20 → asumsikan panjang keliling bangunan)
- Setiap estimasi WAJIB sertakan dasar yang jelas di quantityFormula dan confidence yang jujur.
- quantity = null HANYA jika benar-benar tidak ada dasar sama sekali untuk estimasi.
- JANGAN menghitung total/subtotal — itu tugas aplikasi, bukan kamu.
- PENTING: quantity adalah TOTAL VOLUME/LUAS/JUMLAH untuk seluruh pekerjaan, BUKAN spesifikasi per unit material.
  Contoh SALAH: keramik 40×40cm → quantity 0.16 (itu luas 1 keping!).
  Contoh BENAR: lantai 4m × 5m → quantity 20 (total luas lantai dalam m²).
- Untuk pintu/jendela: quantity = jumlah total unit (mis. 3), bukan dimensi per daun pintu.
- Untuk KOLOM: quantity = TOTAL VOLUME semua kolom dalam m³, BUKAN panjang.
  Contoh BENAR: 12 kolom @ 0.15×0.15×3m → quantity = 12 × 0.0675 = 0.81 m³, units = "m3".
  Contoh SALAH: quantity = 0.15, units = "m'" (itu hanya satu dimensi!).
- Untuk DINDING: kurangi luas bukaan (pintu/jendela) ~15-20% dari luas bruto.
  Contoh: keliling 34m × tinggi 3.2m = 108.8 m² bruto → netto ≈ 92 m².

CONTOH ESTIMASI YANG BAIK:
- "Pondasi Batu Gunung": quantity 8.5, quantityFormula: "Estimasi: keliling 34m × 0.5m × 0.5m (asumsi rumah 36m²)", confidence: "MEDIUM"
- "Sloof 15×20": quantity 1.02, quantityFormula: "15×20cm × 34m keliling (dari nama item + estimasi panjang)", confidence: "MEDIUM"

ATURAN ESTIMASI HARGA:
- estimatedUnitPrice = estimasi harga satuan (Rupiah) berdasarkan pengetahuan pasar konstruksi Indonesia 2026.
- estimatedUnitPrice = null SAAT TIDAK ADA dasar harga yang wajar. BUKAN 0.
- unitPriceNote = alasan singkat dasar estimasi harga (mis. "pasaran Jakarta 2026").
- Harga adalah ESTIMASI AI, bukan harga resmi — aplikasi akan menandainya dengan jelas.

ATURAN SATUAN DIMENSI (WAJIB):
- Setiap dimensi WAJIB menyertakan penanda satuan eksplisit: mm, cm, atau m.
- Contoh benar: "4000 x 150 x 200 mm", "400 x 15 x 20 cm", "4 x 0.15 x 0.20 m".
- Contoh SALAH: "4000 x 150 x 200" (tanpa satuan) — JANGAN lakukan ini.
- Bila satuan tidak diketahui dari DED, tulis dimensions = null dan quantity = null.

Keluarkan JSON murni.`;
}

export function buildFastPrompt(input: DedFastPromptInput): DedFastPromptResult {
  const pageBlock = input.pageSummaries
    .map((p) => `--- Halaman ${p.page} (${p.title}) ---\n${p.text.slice(0, 4000)}`)
    .join('\n');

  const prompt = `Proyek tipe: ${input.projectType} (tipe bangunan: ${input.buildingType})

Isi halaman DED:
${pageBlock}

Analisis halaman-halaman ini dan buat daftar pekerjaan estimasi awal (cepat). Ikuti aturan output pada system prompt.`;

  const safePrompt = prompt.replace(
    /\b(gemini[- ]?[a-z0-9.]*|zyrouter|geminiflash-3\.8|mercury-2\.5|claude[- ]?[a-z0-9.]*)\b/gi,
    (m) => (/\d/.test(m) ? 'EZRAB VISION' : m)
  );

  return { system: createFastSystemPrompt({ projectType: input.projectType }), prompt: safePrompt };
}

export interface DedFastOutput {
  projectType: string;
  summary: string;
  workItems: Array<{
    name: string;
    category: string;
    units: string;
    quantity: number | null;
    quantityFormula?: string;
    dimensions?: string;
    specification?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    estimatedUnitPrice?: number | null;
    unitPriceNote?: string;
  }>;
}
