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
- quantity = null SAAT TIDAK ADA dasar geometri/eksplisit yang dapat kamu yakini. BUKAN 0.
- JANGAN menghitung total/subtotal — itu tugas aplikasi, bukan kamu.

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
