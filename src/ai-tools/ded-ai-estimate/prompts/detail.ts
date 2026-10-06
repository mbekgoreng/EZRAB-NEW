/**
 * DED AI ESTIMATE — DETAIL Prompt (src/ai-tools/ded-ai-estimate/prompts/detail.ts)
 * DETAIL mode: JSON-only output, richer per-item fields. The AI provides quantity
 * when it can justify it and may ESTIMATE a unit price (AI_ESTIMATE). Missing
 * values must be null, never 0. No grand total from the AI.
 */

export interface DedDetailPromptInput {
  projectType: string;
  buildingType: string;
  pageSummaries: Array<{ page: number; title: string; text: string }>;
}

export interface DedDetailPromptResult {
  system: string;
  prompt: string;
}

export function createDetailSystemPrompt(ctx: { projectType: string }): string {
  const projectType = ctx.projectType || 'BANGUNAN';
  return `Kamu adalah estimator DED (DED AI Estimate — mode DETAIL). Peranmu: menganalisis secara mendalam gambar kerja DED proyek tipe "${projectType}" dan menyusun daftar pekerjaan dengan kuantitas + estimasi harga satuan yang dapat dipertanggungjawabkan.

ATURAN WAJIB:
- Keluarkan JSON MURNI (tanpa teks lain, tanpa markdown).
- Struktur:
{
  "projectType": "${projectType}",
  "summary": "Ringkasan proyek dalam 2-3 kalimat Bahasa Indonesia.",
  "workItems": [
    {
      "id": "bebas",
      "name": "Nama pekerjaan",
      "category": "kategori",
      "units": "m3|m2|m'|unit|bh|l|set|m1...",
      "quantity": 45.5,
      "quantitySource": "DED_EXPLICIT|DED_GEOMETRIC|AI_INFERENCE|ASSUMPTION|UNRESOLVED",
      "quantityFormula": "rumus / dimensi mis. 10m x 0.15m x 0.3m",
      "dimensions": "10m x 0.15m x 0.3m",
      "specification": "spesifikasi teknis",
      "sourcePages": [2, 4],
      "sourceEvidence": "catatan pada denah/potongan",
      "estimatedUnitPrice": 950000,
      "unitPriceNote": "alasan singkat estimasi harga",
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ]
}

ATURAN KUANTITAS & HARGA:
- quantity = null SAAT TIDAK ADA dasar yang dapat kamu yakini. BUKAN 0.
- estimatedUnitPrice = null SAAT TIDAK ADA dasar harga. BUKAN 0.
- Harga SEMUANYA adalah AI_ESTIMATE (bukan harga resmi AHSP / database).
- JANGAN menghitung subtotal/total — aplikasi yang melakukannya secara deterministik.

Keluarkan JSON murni.`;
}

export function buildDetailPrompt(input: DedDetailPromptInput): DedDetailPromptResult {
  const pageBlock = input.pageSummaries
    .map((p) => `--- Halaman ${p.page} (${p.title}) ---\n${p.text.slice(0, 4000)}`)
    .join('\n');

  const prompt = `Proyek tipe: ${input.projectType} (tipe bangunan: ${input.buildingType})

Isi halaman DED:
${pageBlock}

Lakukan analisis mendalam seluruh halaman, identifikasi seluruh pekerjaan, dan isikan
kuantitas serta estimasi harga satuan bila memungkinkan. Ikuti aturan output pada system prompt.`;

  const safePrompt = prompt.replace(
    /\b(gemini[- ]?[a-z0-9.]*|zyrouter|geminiflash-3\.8|mercury-2\.5|claude[- ]?[a-z0-9.]*)\b/gi,
    (m) => (/\d/.test(m) ? 'EZRAB VISION' : m)
  );

  return { system: createDetailSystemPrompt({ projectType: input.projectType }), prompt: safePrompt };
}

export interface DedDetailOutput {
  projectType: string;
  summary: string;
  workItems: Array<{
    id?: string;
    name: string;
    category: string;
    units: string;
    quantity: number | null;
    quantitySource?: 'DED_EXPLICIT' | 'DED_GEOMETRIC' | 'AI_INFERENCE' | 'ASSUMPTION' | 'UNRESOLVED';
    quantityFormula?: string;
    dimensions?: string;
    specification?: string;
    sourcePages?: number[];
    sourceEvidence?: string;
    estimatedUnitPrice: number | null;
    unitPriceNote?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}
