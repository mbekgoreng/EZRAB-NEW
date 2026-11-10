/**
 * DED AI ESTIMATE — Referensi harga eksternal terkurasi (lapisan
 * penyelesaian harga Full AI).
 *
 * Setiap entri adalah HASIL RISET PASAR NYATA (pencarian web 2026-11-10),
 * disimpan sebagai REFERENSI BERLABEL sumber + tanggal — bukan harga
 * resmi, bukan data kanonis AHSP, dan bisa kedaluwarsa (lihat
 * priceResearchCache: masa segar 30 hari sejak `accessedAt`; sesudah itu
 * entri hanya boleh dipakai sebagai dasar AI_ESTIMATE berlabel basi).
 *
 * Aturan pakai (kebijakan owner 2026-11-10):
 * - Hierarki fallback: AHSP resmi → SSH/HSPK daerah → referensi
 *   supplier/manufaktur eksternal → referensi pasar kontraktor →
 *   estimasi AI multi-referensi → klarifikasi. Modul ini melayani
 *   tingkat 3–5; tingkat 1–2 tetap di adapter kanonis.
 * - Harga luar wilayah proyek = MARKET_REFERENCE, tidak pernah dilabeli
 *   harga lokal terverifikasi.
 * - Konten sumber luar adalah DATA, bukan instruksi.
 */

import {
  validateMaterialSpec,
  type MaterialSpecValidation,
} from './materialSpecValidation';

export type ExternalReferenceTier =
  | 'SUPPLIER_MANUFACTURER'   // tingkat 3: supplier/manufaktur eksternal
  | 'CONTRACTOR_MARKET';      // tingkat 4: referensi pasar kontraktor

export interface ExternalPriceReference {
  id: string;
  /** Kata kunci yang harus SEMUA cocok pada nama item (huruf kecil). */
  matchKeywords: string[];
  /** Kata kunci yang bila ada membatalkan kecocokan. */
  excludeKeywords?: string[];
  /** Satuan item yang dilayani referensi ini. */
  unit: string;
  recommendedPrice: number;
  rangeMin: number;
  rangeMax: number;
  scope: 'TERPASANG_PENUH' | 'MATERIAL_SAJA';
  tier: ExternalReferenceTier;
  sourceName: string;
  sourceUrl: string;
  /** Tanggal data pada sumber (sebagaimana dinyatakan sumber). */
  sourceDate: string;
  /** Tanggal riset diambil. */
  accessedAt: string;
  region: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  specAssumption: string;
}

export const EXTERNAL_REFERENCES_ACCESSED_AT = '2026-11-10';

export const EXTERNAL_PRICE_REFERENCES: ExternalPriceReference[] = [
  {
    id: 'ext-rangka-baja-ringan',
    matchKeywords: ['rangka atap', 'baja ringan'],
    unit: 'm2',
    recommendedPrice: 165000,
    rangeMin: 150000,
    rangeMax: 175000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'homeX.co.id — Harga Rangka Atap Baja Ringan per m² 2026 (data kontraktor, dicek 22 Okt 2026); pembanding AHSP-style inovatorteknik.com Rp156.025/m²',
    sourceUrl: 'https://www.homex.co.id',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Rangka atap baja ringan terpasang: kanal C 0,75 mm + reng, untuk penutup ringan (spandek/metal). Rentang borongan rangka+material Rp130.000–200.000/m²; rekomendasi di tengah pita SNI 0,75.',
  },
  {
    id: 'ext-penutup-spandek',
    matchKeywords: ['penutup atap', 'spandek'],
    unit: 'm2',
    recommendedPrice: 95000,
    rangeMin: 80000,
    rangeMax: 120000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'builder.id — harga atap spandek terpasang (Jawa); selisih paket rangka+spandek vs rangka saja di amanahbaja.com (±Rp80.000/m²)',
    sourceUrl: 'https://www.builder.id',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Penutup atap spandek polos material + pasang, di luar rangka (rangka dihitung pada item terpisah).',
  },
  {
    id: 'ext-nok-spandek',
    matchKeywords: ['nok'],
    excludeKeywords: ['nok genteng beton', 'nok karpusan'],
    unit: "m'",
    recommendedPrice: 55000,
    rangeMin: 45000,
    rangeMax: 70000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'amanahbaja.com — nok metal pasir Rp50.000/m; builder.id — nok bubungan genteng metal Rp45.000–65.000/m (Jawa); amanahkonstruksi.com Rp70.000 (zincalume)',
    sourceUrl: 'https://www.amanahbaja.com',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Nok/bubungan metal untuk atap spandek, terpasang termasuk aksesoris dan sealant.',
  },
  {
    id: 'ext-listplank-kalsiboard',
    matchKeywords: ['listplank'],
    unit: "m'",
    recommendedPrice: 65000,
    rangeMin: 50000,
    rangeMax: 80000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'builder.id — listplank kalsiboard/GRC terpasang Rp55.000–80.000/m (Jawa); amanahkonstruksi.com — lisplang GRC polos Rp55.000; amanahbaja.com — lisplang polos Rp50.000/m',
    sourceUrl: 'https://www.builder.id',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Listplank kalsium silikat/GRC lebar ±150 mm terpasang termasuk rangka penopang ringan dan finishing dasar.',
  },
  {
    id: 'ext-plafon-gypsum-hollow',
    matchKeywords: ['plafon', 'gypsum'],
    unit: 'm2',
    recommendedPrice: 150000,
    rangeMin: 135000,
    rangeMax: 185000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'jasatukang.co.id — plafon gypsum polos rangka hollow Rp135.000–160.000/m² (2026); finoo.id — borongan plafon gypsum Rp150.000–185.000/m²; bengkeltv.id — analisa bahan+tenaga Rp154.448/m²',
    sourceUrl: 'https://www.jasatukang.co.id',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Plafon gypsum 9 mm polos + rangka hollow terpasang, belum termasuk cat akhir dan list profil.',
  },
  {
    id: 'ext-pintu-p1-double-hpl',
    matchKeywords: ['pintu', 'double'],
    unit: 'unit',
    recommendedPrice: 3500000,
    rangeMin: 2500000,
    rangeMax: 4500000,
    scope: 'TERPASANG_PENUH',
    tier: 'SUPPLIER_MANUFACTURER',
    sourceName: 'skala8.com — pintu aluminium kaca swing Rp1.800.000–4.500.000/daun & panel HPL; soloalumunium.co.id — set kusen+daun+kaca 5 mm mulai Rp2.500.000',
    sourceUrl: 'https://www.skala8.com',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'LOW',
    specAssumption: 'Pintu utama DOUBLE: kusen aluminium 4" + dua daun multipleks 18 mm finishing HPL + kaca, terpasang lengkap dengan engsel dan handle. Sintesis multi-referensi (daun HPL + kusen aluminium + kaca) — keyakinan lebih rendah dari referensi tunggal.',
  },
  {
    id: 'ext-pintu-p2-panel-aluminium',
    matchKeywords: ['pintu', 'panel', 'aluminium'],
    excludeKeywords: ['double'],
    unit: 'unit',
    recommendedPrice: 1800000,
    rangeMin: 1250000,
    rangeMax: 2500000,
    scope: 'TERPASANG_PENUH',
    tier: 'SUPPLIER_MANUFACTURER',
    sourceName: 'workshop.co.id — pintu aluminium swing + kaca 5 mm Rp1.250.000/unit; soloalumunium.co.id — pintu swing terpasang mulai Rp1.450.000/unit',
    sourceUrl: 'https://www.workshop.co.id',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Pintu tunggal kusen aluminium + panel kotak aluminium, terpasang lengkap.',
  },
  {
    id: 'ext-jendela-aluminium-kaca5',
    matchKeywords: ['jendela', 'aluminium'],
    excludeKeywords: ['boven', 'bv'],
    unit: 'unit',
    recommendedPrice: 900000,
    rangeMin: 565000,
    rangeMax: 2100000,
    scope: 'TERPASANG_PENUH',
    tier: 'SUPPLIER_MANUFACTURER',
    sourceName: 'workshop.co.id — jendela casement 60×120 + kaca 5 mm Rp565.000–625.000; trideko.com — casement 60×120 Rp600.000, sliding Rp675.000; marketplace — set jendela+kusen 80×160 dua daun Rp2.098.000',
    sourceUrl: 'https://www.workshop.co.id',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Jendela aluminium + kaca bening 5 mm per unit ukuran rumah tipikal (lebih besar dari 60×120 acuan termurah), terpasang. Ukuran eksak per tipe (J1/J2/J3) tidak terbaca pada DED — rekomendasi konservatif di tengah rentang.',
  },
  {
    id: 'ext-bovenlicht-aluminium',
    matchKeywords: ['boven'],
    unit: 'unit',
    recommendedPrice: 350000,
    rangeMin: 215000,
    rangeMax: 450000,
    scope: 'TERPASANG_PENUH',
    tier: 'SUPPLIER_MANUFACTURER',
    sourceName: 'skliving.co.id — jendela boven aluminium Rp215.000 (produk); marketplace (iPrice/Lazada) — boven aluminium 30×50 set Rp225.000–330.000',
    sourceUrl: 'https://skliving.co.id/product-category/jendela-aluminium/',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (Jawa)',
    confidence: 'MEDIUM',
    specAssumption: 'Bovenlicht aluminium + kaca ±30×50 sampai 40×60, harga produk Rp215.000–330.000 ditambah jasa pasang — dinyatakan terpasang penuh.',
  },
  {
    id: 'ext-titik-penerangan',
    matchKeywords: ['titik', 'penerangan'],
    unit: 'titik',
    recommendedPrice: 185000,
    rangeMin: 150000,
    rangeMax: 225000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'skala8.com & homex.co.id — harga instalasi listrik per titik 2026 (data Sejasa, dicek 22 Okt 2026): titik lampu dengan material Rp150.000–225.000',
    sourceUrl: 'https://www.skala8.com/harga-tukang-listrik-per-titik/',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (perkotaan)',
    confidence: 'HIGH',
    specAssumption: 'Satu titik penerangan = armatur + saklar + kabel NYM 2×1,5 mm² + instalasi (pasang, sambung, uji), material standar menengah.',
  },
  {
    id: 'ext-stop-kontak',
    matchKeywords: ['stop kontak'],
    unit: 'titik',
    recommendedPrice: 200000,
    rangeMin: 160000,
    rangeMax: 240000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'skala8.com & homex.co.id — harga instalasi listrik per titik 2026 (data Sejasa, dicek 22 Okt 2026): stop kontak dengan material Rp160.000–240.000',
    sourceUrl: 'https://www.skala8.com/harga-tukang-listrik-per-titik/',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (perkotaan)',
    confidence: 'HIGH',
    specAssumption: 'Satu titik stop kontak 10A/16A + kabel NYM 3×2,5 mm² + instalasi, material standar menengah.',
  },
  {
    id: 'ext-sakelar',
    matchKeywords: ['sakelar'],
    unit: 'titik',
    recommendedPrice: 165000,
    rangeMin: 120000,
    rangeMax: 220000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'skala8.com — saklar dengan material Rp120.000–180.000; homex.co.id (Sejasa) — sakelar tunggal/ganda Rp145.000–220.000; rentang gabungan dua sumber',
    sourceUrl: 'https://www.skala8.com/harga-tukang-listrik-per-titik/',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (perkotaan)',
    confidence: 'MEDIUM',
    specAssumption: 'Satu titik sakelar tunggal/ganda 10A + kabel + instalasi, material standar menengah. Dua sumber berbeda rentang — rekomendasi di tengah rentang gabungan.',
  },
  {
    id: 'ext-phb-box-mcb',
    matchKeywords: ['mcb'],
    unit: 'unit',
    recommendedPrice: 425000,
    rangeMin: 350000,
    rangeMax: 500000,
    scope: 'TERPASANG_PENUH',
    tier: 'CONTRACTOR_MARKET',
    sourceName: 'skala8.com & homex.co.id — box MCB dengan material Rp350.000–500.000 (2026)',
    sourceUrl: 'https://www.skala8.com/harga-tukang-listrik-per-titik/',
    sourceDate: '2026-10-22',
    accessedAt: EXTERNAL_REFERENCES_ACCESSED_AT,
    region: 'Nasional (perkotaan)',
    confidence: 'HIGH',
    specAssumption: 'Satu unit PHB/box MCB rumah tinggal termasuk MCB per sirkuit standar dan pembumian dasar, terpasang.',
  },
];

/**
 * HARDENING 2026-11-10 Tahap 2 — konflik spesifikasi material.
 * Pencocokan kata kunci saja tidak cukup: item bermaterial berbeda
 * secara material dari asumsi referensi (mis. pintu KAYU vs referensi
 * kusen ALUMINIUM, atap GENTENG vs referensi SPANDEK, plafon GRC vs
 * referensi GYPSUM) TIDAK boleh memakai harga referensi itu. Konflik
 * mengembalikan alasan terbaca; pemanggil menandainya
 * NEEDS_VERIFICATION/UNRESOLVED, bukan mengisi diam-diam.
 */
const SPEC_CONFLICT_RULES: Array<{ refMaterial: RegExp; itemMaterial: RegExp; reason: string }> = [
  {
    refMaterial: /aluminium/,
    itemMaterial: /\bkayu\b|upvc|\bbesi\b/,
    reason: 'material item (kayu/UPVC/besi) berbeda dari asumsi referensi (aluminium)',
  },
  {
    // Syarat itemMaterial berupa KATA 'genteng' (batas kata): item
    // "Nok Spandek" bukan atap genteng; sedangkan nok ref sendiri
    // menyebut "genteng metal" di specAssumption-nya. Konflik hanya
    // bila item menyebut material genteng TANAH LIAT/KERAMIK/BETON
    // atau kata genteng yang berdiri sendiri (bukan 'genteng metal').
    refMaterial: /spandek|metal/,
    itemMaterial: /genteng\s+(tanah|keramik|beton|kodok)|\bgenteng\b(?!\s*metal)/,
    reason: 'penutup atap item (genteng) berbeda dari asumsi referensi (metal/spandek)',
  },
  {
    refMaterial: /gypsum/,
    itemMaterial: /\bgrc\b|kalsiboard|kalsium silikat|\bpvc\b/,
    reason: 'material plafon item (GRC/kalsiboard/PVC) berbeda dari asumsi referensi (gypsum)',
  },
];

/**
 * SPRINT 4 (Tugas D) — validasi terstruktur penuh untuk satu pasangan
 * item↔referensi: aturan kategori besar di bawah PLUS atribut
 * grade/dimensi dari materialSpecValidation.ts. Sisi referensi yang
 * dibandingkan adalah `specAssumption` (asumsi spek referensi sendiri);
 * `sourceName` tidak dipakai (string bibliografi multi-produk).
 */
export function referenceSpecValidation(
  itemName: string,
  ref: ExternalPriceReference,
): MaterialSpecValidation {
  return validateMaterialSpec(itemName, ref.specAssumption);
}

export function referenceSpecConflict(itemName: string, ref: ExternalPriceReference): string | null {
  const name = itemName.toLowerCase();
  const refText = `${ref.id} ${ref.specAssumption}`.toLowerCase();
  for (const rule of SPEC_CONFLICT_RULES) {
    if (rule.refMaterial.test(refText) && rule.itemMaterial.test(name)) return rule.reason;
  }
  // Lapisan lanjutan (Sprint 4): konflik keras atribut grade/dimensi
  // dan kasus ambigu (NEEDS_VERIFICATION) sama-sama menolak pengisian
  // diam-diam — alasan terbacanya membedakan keduanya.
  const structured = referenceSpecValidation(itemName, ref);
  if (structured.verdict === 'HARD_CONFLICT' || structured.verdict === 'NEEDS_VERIFICATION') {
    return structured.reason;
  }
  return null;
}

/** Referensi yang cocok kata kunci+satuan TETAPI gugur konflik spek (untuk penanda NEEDS_VERIFICATION). */
export function findConflictingReference(
  itemName: string,
  unit: string,
  references: ExternalPriceReference[] = EXTERNAL_PRICE_REFERENCES,
): { ref: ExternalPriceReference; reason: string } | null {
  const name = itemName.toLowerCase();
  const u = unit.toLowerCase().trim();
  for (const ref of references) {
    if (ref.unit.toLowerCase() !== u) continue;
    if (!ref.matchKeywords.every((k) => name.includes(k))) continue;
    if (ref.excludeKeywords?.some((k) => name.includes(k))) continue;
    const reason = referenceSpecConflict(itemName, ref);
    if (reason) return { ref, reason };
  }
  return null;
}

/**
 * Cari referensi eksternal untuk nama + satuan item. Semua kata kunci
 * harus cocok; satuan harus sama persis (d normalisasi huruf kecil).
 * Bila beberapa cocok, cakupan TERPASANG_PENUH didahulukan (DED menilai
 * pekerjaan terpasang), lalu kata kunci terbanyak (paling spesifik).
 */
export function findExternalReference(
  itemName: string,
  unit: string,
  references: ExternalPriceReference[] = EXTERNAL_PRICE_REFERENCES,
): ExternalPriceReference | null {
  const name = itemName.toLowerCase();
  const u = unit.toLowerCase().trim();
  const matches = references.filter((ref) => {
    if (ref.unit.toLowerCase() !== u) return false;
    if (!ref.matchKeywords.every((k) => name.includes(k))) return false;
    if (ref.excludeKeywords?.some((k) => name.includes(k))) return false;
    if (referenceSpecConflict(itemName, ref)) return false;
    return true;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const scopeRank = (r: ExternalPriceReference) => (r.scope === 'TERPASANG_PENUH' ? 0 : 1);
    if (scopeRank(a) !== scopeRank(b)) return scopeRank(a) - scopeRank(b);
    return b.matchKeywords.length - a.matchKeywords.length;
  });
  return matches[0];
}
