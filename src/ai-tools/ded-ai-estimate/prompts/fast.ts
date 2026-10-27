/**
 * DED AI ESTIMATE — FAST Prompt (src/ai-tools/ded-ai-estimate/prompts/fast.ts)
 * FAST mode: JSON-only output for quick preliminary estimate. Quantity MUST be
 * null when unvoided (never 0).
 */

import { standardPricingPolicySection, normalizePromptPolicy, type DedPromptPricingPolicy } from './policy';
import { WORK_CLASSIFICATION_SPEC } from './work-classification.generated';

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
  return `Kamu adalah estimator DED (DED AI Estimate — mode CEPAT). Peranmu: mengidentifikasi pekerjaan konstruksi untuk proyek tipe "${projectType}" dan menyusun daftar pekerjaan dengan detail dasar.

${standardPricingPolicySection(policy)}
${policy === 'FULL_AI' ? `FIELD TAMBAHAN MODE FULL_AI (di luar struktur di bawah): setiap workItem boleh berisi "proposedSubtotal": quantity × estimatedUnitPrice (null bila salah satunya null), dan tingkat atas berisi "proposedGrandTotal": jumlah semua proposedSubtotal.` : `MODE DATABASE: JANGAN mengeluarkan field proposedSubtotal atau proposedGrandTotal — total resmi dihitung aplikasi dari data tervalidasi.`}

SPESIFIKASI KLASIFIKASI & WBS DED–RAB (wajib diikuti; katalog di bawah adalah daftar kandidat, bukan daftar wajib — kelompok dipilih dinamis sesuai tipe proyek dan bukti, bukan disalin semua):
${WORK_CLASSIFICATION_SPEC}

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
      "quantitySource": "DED_EXPLICIT|DED_GEOMETRIC|AI_INFERENCE|ASSUMPTION|UNRESOLVED",
      "sourcePages": [1, 2],
      "sourceEvidence": "bukti singkat dari halaman DED (notasi/tabel/dimensi)",
      "specification": "spesifikasi ringkas",
      "confidence": "HIGH|MEDIUM|LOW",
      "estimatedUnitPrice": 950000,
      "unitPriceNote": "alasan singkat estimasi harga",
      "derivation": {
        "formulaType": "kolom_volume|dinding_netto|plester|balok_volume|sloof_volume",
        "inputs": [
          {"name": "jumlah_kolom", "value": 12, "unit": "bh", "source": "DED"},
          {"name": "lebar", "value": 0.15, "unit": "m", "source": "DED"}
        ]
      }
    }
  ]
}

CATATAN DERIVATION (opsional tapi dianjurkan untuk item compound):
- Untuk kolom/balok/sloof: sertakan jumlah, dimensi penampang, dan panjang/tinggi sebagai inputs terpisah.
- Untuk dinding: sertakan panjang, tinggi, dan luas bukaan (jika diketahui) sebagai inputs terpisah.
- Untuk plester: sertakan luas bidang dan jumlah sisi sebagai inputs terpisah.
- Source: "DED" (dari dokumen), "ASSUMPTION" (asumsi), "USER" (input pengguna).
- Jika inputs tidak lengkap, JANGAN sertakan derivation — biarkan quantity=null.

DUPLIKAT & KONFLIK (wajib):
- Pekerjaan yang sama di beberapa halaman = SATU item dengan sourcePages lengkap, jangan digandakan.
- Bila dua gambar/spesifikasi bertentangan, sebutkan keduanya di specification, pilih satu dengan alasan di quantityFormula, dan turunkan confidence ke LOW — jangan diam-diam menggabungkan angka yang bertentangan.
- Bedakan fakta DED (quantitySource DED_EXPLICIT/DED_GEOMETRIC) dari inferensi/asumsi (AI_INFERENCE/ASSUMPTION) — jangan menaikkan status bukti demi terlihat pasti.

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

ATURAN KHUSUS PROYEK JALAN:
- Cari STATIONING: "STA 0+000" sampai "STA 1+595" = panjang 1595 meter.
- Lapis perkerasan: quantity = panjang × lebar (m2). Cari lebar di potongan melintang.
- Urugan: quantity = panjang × lebar × tebal (m3).
- Jika lebar tidak ada, estimasi dari tipe jalan dengan asumsi jelas di quantityFormula.
- JANGAN biarkan item perkerasan kosong — estimasi dengan asumsi yang transparan.

CONTOH ESTIMASI YANG BAIK:
- "Pondasi Batu Gunung": quantity 8.5, quantityFormula: "Estimasi: keliling 34m × 0.5m × 0.5m (asumsi rumah 36m²)", confidence: "MEDIUM"
- "Sloof 15×20": quantity 1.02, quantityFormula: "15×20cm × 34m keliling (dari nama item + estimasi panjang)", confidence: "MEDIUM"

${policy === 'FULL_AI' ? `ATURAN ESTIMASI HARGA:
- estimatedUnitPrice = estimasi harga satuan (Rupiah) berdasarkan pengetahuan pasar konstruksi Indonesia 2026.
- WAJIB isi estimatedUnitPrice untuk SEMUA item yang umum. Jangan biarkan kosong untuk item standar.
- Referensi harga tipikal 2026:
  * Lapis aus / AC-WC: Rp120.000-180.000/m2
  * Aspal lapen: Rp100.000-150.000/m2
  * Urugan sirtu: Rp200.000-300.000/m3
  * Urugan tanah: Rp50.000-100.000/m3
  * Gorong-gorong pelat beton: Rp15.000.000-25.000.000/unit
  * Gorong-gorong buis beton: Rp8.000.000-15.000.000/unit
  * Jembatan kecil: estimasi berdasarkan bentang
- estimatedUnitPrice = null HANYA untuk item sangat kustom tanpa referensi pasar sama sekali.
- unitPriceNote = alasan singkat (mis. "pasaran Jawa 2026", "estimasi dimensi").
- Harga adalah ESTIMASI AI, bukan harga resmi — aplikasi akan menandainya dengan jelas.` : `ATURAN HARGA FALLBACK (MODE DATABASE — tidak ada tabel harga pasar di mode ini):
- estimatedUnitPrice HANYA kandidat fallback: isi bila kamu punya perkiraan yang masuk akal dari DED/spesifikasi; boleh null bila tidak ada dasar.
- TIDAK ADA kewajiban mengisi harga untuk semua item, dan TIDAK ADA tabel harga pasar yang harus diikuti di mode ini — harga resmi hanya dari database kanonis yang divalidasi aplikasi.
- Perkiraanmu BUKAN harga resmi dan BUKAN harga database: aplikasi mengutamakan harga kanonis bila item cocok, dan hanya memakai perkiraanmu bila tidak ada di database, dengan label "Estimasi AI".
- unitPriceNote = alasan singkat perkiraan (atau kosong bila null).`}

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
    /** Usulan AI (mode FULL_AI saja): quantity × estimatedUnitPrice, null bila salah satunya null. */
    proposedSubtotal?: number | null;
  }>;
  /** Usulan AI (mode FULL_AI saja): jumlah semua proposedSubtotal. */
  proposedGrandTotal?: number | null;
}
