/**
 * DED AI ESTIMATE — FAST Prompt (src/ai-tools/ded-ai-estimate/prompts/fast.ts)
 * FAST mode: JSON-only output for quick preliminary estimate. Quantity MUST be
 * null when unvoided (never 0).
 */

import { standardPricingPolicySection, normalizePromptPolicy, type DedPromptPricingPolicy } from './policy';
import { buildDedSystemPrompt } from './wbsContext';

export interface DedFastPromptInput {
  projectType: string;
  buildingType: string;
  pageSummaries: Array<{ page: number; title: string; text: string }>;
  /** Kebijakan harga yang dipilih pengguna (default 'FULL_AI' = perilaku lama). */
  pricingPolicy?: DedPromptPricingPolicy;
}

export interface DedFastPromptResult {
  system: string;
  prompt: string;
}

export function createFastSystemPrompt(ctx: { projectType: string; pricingPolicy?: DedPromptPricingPolicy }): string {
  const projectType = ctx.projectType || 'BANGUNAN';
  const policy = normalizePromptPolicy(ctx.pricingPolicy);
  // Sprint 1 (Workstream A): urutan rakitan = identitas → kebijakan harga →
  // ATURAN WAJIB + skema JSON → instruksi interpretasi → konteks WBS terpilih
  // (TERAKHIR, lewat wbsContext). Kontrak di bawah tidak pernah dipotong;
  // konteks dipilih per tipe proyek dan ditegakkan ke anggaran 7.900 karakter
  // agar tidak terpotong diam-diam oleh gateway (cap 8.000).
  // Dual Mode §5 (G-PR-1/G-IS-4): instruksi FULL_AI TIDAK ADA lagi inline
  // di kontrak ini — semuanya berasal dari master prompt via
  // standardPricingPolicySection (policy.ts → ded-full-ai/masterPrompt.ts),
  // termasuk kewajiban estimasi harga TANPA referensi harga jalan inline.
  // Yang tersisa di sini hanyalah teks cabang DATABASE.
  const contract = `Kamu adalah estimator DED (DED AI Estimate — mode CEPAT). Tugasmu: identifikasi pekerjaan konstruksi proyek tipe "${projectType}" dan susun daftar pekerjaan dengan detail dasar.

${standardPricingPolicySection(policy)}
${policy === 'DATABASE' ? `MODE DATABASE: JANGAN mengeluarkan field proposedSubtotal atau proposedGrandTotal — total resmi dihitung aplikasi dari data tervalidasi.` : ''}

ATURAN WAJIB:
- Keluarkan JSON MURNI (tanpa teks lain, tanpa markdown).
- Struktur:
{
  "projectType": "${projectType}",
  "summary": "Ringkasan proyek 1-2 kalimat Bahasa Indonesia.",
  "workItems": [
    {
      "name": "Nama pekerjaan",
      "category": "kategori pekerjaan",
      "units": "m3|m2|m'|unit|bh|l|set|m1...",
      "quantity": 45.5,
      "quantityFormula": "rumus/dimensi mis. 10m x 0.15m x 0.3m",
      "dimensions": "10m x 0.15m x 0.3m",
      "quantitySource": "DED_EXPLICIT|DED_GEOMETRIC|AI_INFERENCE|ASSUMPTION|UNRESOLVED",
      "sourcePages": [1, 2],
      "sourceEvidence": "bukti singkat dari halaman DED",
      "specification": "spesifikasi ringkas",
      "confidence": "HIGH|MEDIUM|LOW",
      "estimatedUnitPrice": 950000,
      "unitPriceNote": "alasan singkat estimasi harga",
      "derivation": { "formulaType": "kolom_volume|dinding_netto|plester|balok_volume|sloof_volume", "inputs": [ {"name": "jumlah_kolom", "value": 12, "unit": "bh", "source": "DED"} ] }
    }
  ]
}

DERIVATION (opsional): inputs terpisah per komponen (jumlah, penampang, panjang/tinggi; dinding: panjang, tinggi, bukaan); source "DED"|"ASSUMPTION"|"USER". Tak lengkap → jangan sertakan, quantity=null.

DUPLIKAT & KONFLIK (wajib): pekerjaan yang sama di beberapa halaman = SATU item, sourcePages lengkap, jangan digandakan. Gambar/spesifikasi bertentangan: sebutkan keduanya di specification, pilih satu dengan alasan di quantityFormula, confidence ke LOW. Bedakan fakta DED (DED_EXPLICIT/DED_GEOMETRIC) dari inferensi (AI_INFERENCE/ASSUMPTION); jangan menaikkan status bukti. Item usulan tak terbukti: awali specification dengan persis "USULAN — TIDAK ADA DI DED: <alasan + verifikasi>".

ATURAN PENDEKATAN KUANTITAS:
- Prioritas: (1) angka eksplisit DED (BOQ, dimensi tertulis); (2) hitung dari dimensi yang ditemukan; (3) ESTIMASI CERDAS dari tipe/ukuran tipikal, rasio standar (pondasi ~0.5m³/m²), dimensi parsial (sloof 15×20 → panjang keliling) — dasar wajib jelas di quantityFormula, confidence jujur.
- quantity = null HANYA bila tak ada dasar estimasi sama sekali. JANGAN menghitung total/subtotal — tugas aplikasi.
- quantity = TOTAL volume/luas/jumlah seluruh pekerjaan, BUKAN per unit material. SALAH: keramik 40×40cm → 0.16. BENAR: lantai 4m × 5m → 20 m². Pintu/jendela: quantity = jumlah total unit.
- KOLOM: quantity = TOTAL VOLUME semua kolom (m³): 12 kolom @ 0.15×0.15×3m → 0.81 m³ (SALAH: 0.15 m'). DINDING: netto = bruto − bukaan EKSPLISIT DED; tak diketahui → JANGAN pakai persentase default: laporkan BRUTO (34m × 3.2m = 108.8 m²), minta konfirmasi user.

ATURAN KHUSUS PROYEK JALAN: cari STATIONING ("STA 0+000"–"STA 1+595" = 1595 m). Perkerasan: panjang × lebar (m2), lebar dari potongan melintang. Urugan: panjang × lebar × tebal (m3). Lebar tak ada → estimasi dari tipe jalan, asumsi di quantityFormula. Item perkerasan JANGAN dikosongkan.

${policy === 'DATABASE' ? `ATURAN HARGA FALLBACK (MODE DATABASE — tidak ada tabel harga pasar di mode ini): estimatedUnitPrice HANYA kandidat fallback — isi bila ada perkiraan masuk akal dari DED/spesifikasi, boleh null bila tak ada dasar. TIDAK ADA kewajiban mengisi harga semua item; TIDAK ADA tabel harga pasar yang harus diikuti — harga resmi hanya dari database kanonis tervalidasi. Perkiraanmu BUKAN harga resmi/database: aplikasi mengutamakan harga kanonis bila cocok; perkiraanmu dipakai hanya bila tak ada di database, berlabel "Estimasi AI".` : ''}

ATURAN SATUAN DIMENSI (WAJIB): setiap dimensi WAJIB berpenanda satuan eksplisit (mm, cm, atau m). BENAR: "4000 x 150 x 200 mm". SALAH: "4000 x 150 x 200" tanpa satuan — JANGAN. Satuan tak diketahui → dimensions=null, quantity=null.

Keluarkan JSON murni.`;
  return buildDedSystemPrompt(contract, projectType, { engine: 'standard' });
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

  return { system: createFastSystemPrompt({ projectType: input.projectType, pricingPolicy: input.pricingPolicy }), prompt: safePrompt };
}

export interface DedFastOutput {
  projectType: string;
  summary: string;
  workItems: Array<{
    name: string;
    category: string;
    units: string;
    quantity: number | null;
    quantitySource?: 'DED_EXPLICIT' | 'DED_GEOMETRIC' | 'AI_INFERENCE' | 'ASSUMPTION' | 'UNRESOLVED';
    sourcePages?: number[];
    sourceEvidence?: string;
    quantityFormula?: string;
    dimensions?: string;
    specification?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    estimatedUnitPrice?: number | null;
    unitPriceNote?: string;
    /** Dasar terstruktur kuantitas (inputs bernilai + satuan eksplisit per input). */
    derivation?: { formulaType: string; inputs: Array<{ name: string; value: number; unit: string; source?: string }> };
    /** Satuan dimensi yang dinyatakan model sebagai ASUMSI (bukan fakta DED). */
    dimensionUnitAssumption?: 'mm' | 'cm' | 'm';
    /** Usulan AI (mode FULL_AI saja): quantity × estimatedUnitPrice, null bila salah satunya null. */
    proposedSubtotal?: number | null;
  }>;
  /** Usulan AI (mode FULL_AI saja): jumlah semua proposedSubtotal. */
  proposedGrandTotal?: number | null;
}
