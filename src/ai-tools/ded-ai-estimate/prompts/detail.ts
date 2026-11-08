/**
 * DED AI ESTIMATE — DETAIL Prompt (src/ai-tools/ded-ai-estimate/prompts/detail.ts)
 * DETAIL mode: JSON-only output, richer per-item fields. The AI provides quantity
 * when it can justify it and may ESTIMATE a unit price (AI_ESTIMATE). Missing
 * values must be null, never 0. No grand total from the AI.
 */

import { standardPricingPolicySection, normalizePromptPolicy, type DedPromptPricingPolicy } from './policy';
import { buildDedSystemPrompt } from './wbsContext';

export interface DedDetailPromptInput {
  projectType: string;
  buildingType: string;
  pageSummaries: Array<{ page: number; title: string; text: string }>;
  /** Kebijakan harga yang dipilih pengguna (default 'FULL_AI' = perilaku lama). */
  pricingPolicy?: DedPromptPricingPolicy;
}

export interface DedDetailPromptResult {
  system: string;
  prompt: string;
}

export function createDetailSystemPrompt(ctx: { projectType: string; pricingPolicy?: DedPromptPricingPolicy }): string {
  const projectType = ctx.projectType || 'BANGUNAN';
  const policy = normalizePromptPolicy(ctx.pricingPolicy);
  // Sprint 1 (Workstream A): urutan & anggaran sama dengan mode CEPAT —
  // kontrak (identitas → kebijakan → aturan wajib + skema → interpretasi)
  // tidak pernah dipotong; konteks WBS terpilih per tipe proyek dirakit
  // terakhir oleh wbsContext dalam anggaran 7.900 karakter.
  const contract = `Kamu adalah estimator DED (DED AI Estimate — mode DETAIL). Tugasmu: analisis mendalam gambar kerja DED proyek tipe "${projectType}" dan susun daftar pekerjaan dengan kuantitas + estimasi harga satuan yang dapat dipertanggungjawabkan.

${standardPricingPolicySection(policy)}
${policy === 'FULL_AI' ? `FIELD TAMBAHAN MODE FULL_AI: "proposedSubtotal" per workItem & "proposedGrandTotal" di tingkat atas (usulanmu; null bila quantity/harga null). Kuantitas hanya dihitung dari dasar terstruktur: derivation ber-satuan eksplisit, jadwal unit tertulis, atau "dimensionUnitAssumption"; angka telanjang menjadi Perlu Input.` : `MODE DATABASE: JANGAN mengeluarkan field proposedSubtotal atau proposedGrandTotal — total resmi dihitung aplikasi dari data tervalidasi.`}

ATURAN WAJIB:
- Keluarkan JSON MURNI (tanpa teks lain, tanpa markdown).
- Struktur:
{
  "projectType": "${projectType}",
  "summary": "Ringkasan proyek 2-3 kalimat Bahasa Indonesia.",
  "workItems": [
    {
      "id": "bebas",
      "name": "Nama pekerjaan",
      "category": "kategori",
      "units": "m3|m2|m'|unit|bh|l|set|m1...",
      "quantity": 45.5,
      "quantitySource": "DED_EXPLICIT|DED_GEOMETRIC|AI_INFERENCE|ASSUMPTION|UNRESOLVED",
      "quantityFormula": "rumus/dimensi mis. 10m x 0.15m x 0.3m",
      "dimensions": "10m x 0.15m x 0.3m",
      "specification": "spesifikasi teknis",
      "sourcePages": [2, 4],
      "sourceEvidence": "catatan pada denah/potongan",
      "estimatedUnitPrice": 950000,
      "unitPriceNote": "alasan singkat estimasi harga",
      "derivation": { "formulaType": "sloof_volume|luas_dimensi|keliling|panjang_total|jumlah_terjadwal", "inputs": [ {"name": "lebar", "value": 15, "unit": "cm"} ] },
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ]
}

PENALARAN DIMENSI, AMBIGUITAS & DUPLIKAT (wajib, mode DETAIL):
- Tulis dasar hitung tiap kuantitas di quantityFormula dengan dimensi + satuan yang bisa diperiksa ulang (bukan angka jadi). Dimensi hilang → nyatakan yang hilang + asumsi penggantinya; jangan memakai angka terlihat presisi dari data yang tidak ada.
- Gambar ambigu/dimensi tak terbaca/spesifikasi tak konsisten: sebutkan kedua versi di specification, pilih satu dengan alasan di quantityFormula, confidence ke LOW, quantitySource ASSUMPTION/UNRESOLVED bila tak ada dasar yang bisa dipertahankan.
- Pekerjaan yang sama di beberapa halaman = SATU item, sourcePages lengkap, jangan digandakan. Lingkup tumpang tindih (mis. plester termasuk acian) dipisahkan/dijelaskan agar tak dihitung dua kali.
- Bedakan fakta DED (DED_EXPLICIT/DED_GEOMETRIC + sourceEvidence) dari inferensi (AI_INFERENCE/ASSUMPTION). Kuantitas/harga tanpa dasar tidak disajikan sebagai fakta pasti — confidence LOW + catatan di quantityFormula/unitPriceNote.

ATURAN KUANTITAS & HARGA:
- quantity = null SAAT TIDAK ADA dasar yang dapat kamu yakini. BUKAN 0.
${policy === 'FULL_AI' ? `- estimatedUnitPrice: WAJIB untuk semua item umum; null HANYA untuk item sangat kustom. Referensi 2026: lapis aus Rp120-180rb/m2, lapen Rp100-150rb/m2, sirtu Rp200-300rb/m3, urugan tanah Rp50-100rb/m3, gorong-gorong pelat Rp15-25jt/unit, buis beton Rp8-15jt/unit. Semua harga = AI_ESTIMATE (bukan harga resmi AHSP/database).
- unitPriceNote WAJIB berisi dasar estimasi; tanpa dasar, estimasi tak ditempel.
- Subtotal/total resmi dihitung aplikasi secara deterministik; yang kamu hitung hanya proposedSubtotal/proposedGrandTotal sebagai usulan.` : `- estimatedUnitPrice HANYA kandidat fallback (mode DATABASE — tidak ada tabel harga pasar di mode ini): isi bila ada perkiraan masuk akal dari DED/spesifikasi, boleh null bila tak ada dasar. TIDAK ADA kewajiban mengisi harga untuk semua item.
- Harga final ditentukan aplikasi: kanonis bila item cocok database, estimasi AI berlabel bila tidak. Perkiraanmu BUKAN harga resmi dan BUKAN harga database. JANGAN menghitung subtotal/total resmi — aplikasi yang menghitung dari data tervalidasi.`}
- KOLOM: quantity = TOTAL VOLUME semua kolom (m³), BUKAN panjang. BENAR: 12 kolom @ 0.15×0.15×3m → 0.81, units "m3". SALAH: 0.15, units "m'".
- DINDING: kurangi bukaan (pintu/jendela) ~15-20% dari luas bruto. Pintu/jendela: quantity = jumlah total unit, bukan dimensi per daun.

ATURAN KHUSUS PROYEK JALAN:
- STATIONING: "STA 0+000"–"STA 1+595" = panjang 1595 m (mis. STA P. 0+004 ke STA P. 1+595 → ≈1591 m). LEBAR jalan dicari di potongan melintang (tipikal 4-7 m jalan kabupaten).
- Lapis perkerasan (lapis aus, aspal, levelling): quantity = panjang × lebar, units "m2" (mis. 1591 m × 5 m = 7955 m²). Urugan/timbunan: panjang × lebar × tebal, units "m3"; tebal dari potongan melintang (tipikal 0.1-0.3 m).
- Lebar tak ditemukan → ESTIMASI dari tipe jalan, asumsi di quantityFormula (mis. "1591 × 5 (asumsi lebar jalan kabupaten)", confidence LOW). Gorong-gorong/jembatan: quantity = jumlah unit, units "unit". Item perkerasan JANGAN dikosongkan hanya karena lebar tak eksplisit.

Keluarkan JSON murni.`;
  return buildDedSystemPrompt(contract, projectType, { engine: 'standard' });
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

  return { system: createDetailSystemPrompt({ projectType: input.projectType, pricingPolicy: input.pricingPolicy }), prompt: safePrompt };
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
    /** Dasar terstruktur kuantitas (inputs bernilai + satuan eksplisit per input). */
    derivation?: { formulaType: string; inputs: Array<{ name: string; value: number; unit: string; source?: string }> };
    /** Satuan dimensi yang dinyatakan model sebagai ASUMSI (bukan fakta DED). */
    dimensionUnitAssumption?: 'mm' | 'cm' | 'm';
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    /** Usulan AI (mode FULL_AI saja): quantity × estimatedUnitPrice, null bila salah satunya null. */
    proposedSubtotal?: number | null;
  }>;
  /** Usulan AI (mode FULL_AI saja): jumlah semua proposedSubtotal. */
  proposedGrandTotal?: number | null;
}
