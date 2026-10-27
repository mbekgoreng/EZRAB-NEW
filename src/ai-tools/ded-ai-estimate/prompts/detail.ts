/**
 * DED AI ESTIMATE — DETAIL Prompt (src/ai-tools/ded-ai-estimate/prompts/detail.ts)
 * DETAIL mode: JSON-only output, richer per-item fields. The AI provides quantity
 * when it can justify it and may ESTIMATE a unit price (AI_ESTIMATE). Missing
 * values must be null, never 0. No grand total from the AI.
 */

import { standardPricingPolicySection, normalizePromptPolicy, type DedPromptPricingPolicy } from './policy';
import { WORK_CLASSIFICATION_SPEC } from './work-classification.generated';

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
  return `Kamu adalah estimator DED (DED AI Estimate — mode DETAIL). Peranmu: menganalisis secara mendalam gambar kerja DED proyek tipe "${projectType}" dan menyusun daftar pekerjaan dengan kuantitas + estimasi harga satuan yang dapat dipertanggungjawabkan.

${standardPricingPolicySection(policy)}
${policy === 'FULL_AI' ? `FIELD TAMBAHAN MODE FULL_AI (di luar struktur di bawah): setiap workItem boleh berisi "proposedSubtotal": quantity × estimatedUnitPrice (null bila salah satunya null), dan tingkat atas berisi "proposedGrandTotal": jumlah semua proposedSubtotal.` : `MODE DATABASE: JANGAN mengeluarkan field proposedSubtotal atau proposedGrandTotal — total resmi dihitung aplikasi dari data tervalidasi.`}

SPESIFIKASI KLASIFIKASI & WBS DED–RAB (wajib diikuti; katalog di bawah adalah daftar kandidat, bukan daftar wajib — kelompok dipilih dinamis sesuai tipe proyek dan bukti, bukan disalin semua):
${WORK_CLASSIFICATION_SPEC}

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

PENALARAN DIMENSI, AMBIGUITAS & DUPLIKAT (wajib, mode DETAIL):
- Tulis dasar hitung tiap kuantitas di quantityFormula dengan dimensi + satuan yang bisa diperiksa ulang (bukan hanya angka jadi). Bila satu dimensi hilang, nyatakan apa yang hilang dan asumsi penggantinya — jangan memakai angka yang terlihat presisi dari data yang tidak ada.
- Gambar ambigu / dimensi tidak terbaca / spesifikasi tidak konsisten: sebutkan kedua versi di specification, pilih satu dengan alasan di quantityFormula, turunkan confidence ke LOW, dan tandai quantitySource sebagai ASSUMPTION atau UNRESOLVED bila tidak ada dasar yang bisa dipertahankan.
- Pekerjaan yang sama di beberapa halaman = SATU item dengan sourcePages lengkap, jangan digandakan. Pekerjaan yang tumpang tindih ruang lingkupnya (mis. plester sudah termasuk acian) harus dipisahkan atau dijelaskan agar kuantitas tidak dihitung dua kali.
- Bedakan secara eksplisit fakta DED (DED_EXPLICIT/DED_GEOMETRIC, lengkap dengan sourceEvidence) dari inferensi/asumsi (AI_INFERENCE/ASSUMPTION). Kuantitas atau harga tanpa dasar tidak boleh disajikan sebagai fakta pasti — beri confidence LOW dan catatan di quantityFormula/unitPriceNote.

ATURAN KUANTITAS & HARGA:
- quantity = null SAAT TIDAK ADA dasar yang dapat kamu yakini. BUKAN 0.
${policy === 'FULL_AI' ? `- estimatedUnitPrice: WAJIB diisi untuk semua item umum. Jangan biarkan kosong untuk item standar.
  Referensi 2026: lapis aus Rp120-180rb/m2, aspal lapen Rp100-150rb/m2, sirtu Rp200-300rb/m3,
  urugan tanah Rp50-100rb/m3, gorong-gorong pelat Rp15-25jt/unit, buis beton Rp8-15jt/unit.
- estimatedUnitPrice = null HANYA untuk item sangat kustom tanpa referensi pasar.
- Harga SEMUANYA adalah AI_ESTIMATE (bukan harga resmi AHSP / database).
- Subtotal/total resmi tetap dihitung aplikasi secara deterministik; yang kamu hitung hanya proposedSubtotal/proposedGrandTotal sebagai usulan.` : `- estimatedUnitPrice HANYA kandidat fallback (mode DATABASE — tidak ada tabel harga pasar di mode ini): isi bila ada perkiraan masuk akal dari DED/spesifikasi, boleh null bila tidak ada dasar. TIDAK ADA kewajiban mengisi harga untuk semua item.
- Harga final ditentukan aplikasi: kanonis bila item cocok dengan database, estimasi AI berlabel bila tidak ada di database. Perkiraanmu BUKAN harga resmi dan BUKAN harga database.
- JANGAN menghitung subtotal/total resmi — aplikasi yang menghitungnya dari data tervalidasi.`}
- Untuk KOLOM: quantity = TOTAL VOLUME semua kolom dalam m³, BUKAN panjang.
  Contoh BENAR: 12 kolom @ 0.15×0.15×3m → quantity = 0.81, units = "m3".
  Contoh SALAH: quantity = 0.15, units = "m'".
- Untuk DINDING: kurangi luas bukaan (pintu/jendela) ~15-20% dari luas bruto.
- Untuk pintu/jendela: quantity = jumlah total unit, bukan dimensi per daun.

ATURAN KHUSUS PROYEK JALAN:
- Cari STATIONING: format "STA 0+000" sampai "STA 1+595" berarti panjang 1595 meter.
  Contoh: STA P. 0+004 ke STA P. 1+595 → panjang ≈ 1591 m.
- Cari LEBAR JALAN di potongan melintang (tipikal 4-7 m untuk jalan kabupaten).
- Lapis perkerasan (Lapis Aus, Aspal, Levelling): quantity = panjang × lebar, units = "m2".
  Contoh: 1591 m × 5 m = 7955 m².
- Urugan/timbunan: quantity = panjang × lebar × tebal, units = "m3".
  Cari tebal urugan di potongan melintang (tipikal 0.1-0.3 m).
- Jika lebar tidak ditemukan, ESTIMASI dari tipe jalan dan nyatakan asumsi di quantityFormula.
  Contoh: "1591 × 5 (asumsi lebar jalan kabupaten)" dengan confidence LOW.
- Gorong-gorong/jembatan: quantity = jumlah unit, units = "unit".
- JANGAN biarkan item perkerasan kosong hanya karena lebar tidak eksplisit — estimasi dengan asumsi yang jelas.

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
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    /** Usulan AI (mode FULL_AI saja): quantity × estimatedUnitPrice, null bila salah satunya null. */
    proposedSubtotal?: number | null;
  }>;
  /** Usulan AI (mode FULL_AI saja): jumlah semua proposedSubtotal. */
  proposedGrandTotal?: number | null;
}
