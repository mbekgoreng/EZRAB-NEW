/**
 * Scope-to-AHSP Mapping Registry
 * ================================
 *
 * Maps construction scope items to AHSP codes from the official dataset.
 * This is a living registry — it should be expanded as more calculators
 * are connected to the CostPolicyEngine.
 *
 * Domain: BINA_MARGA (Lampiran V SE DJBK No. 47/SE/Dk/2026)
 *
 * NOTE: the Bina Marga annex is Lampiran **V**. (Lampiran II is
 * "Acuan dalam Penyusunan AHSP" and carries no items.)
 *
 * Design:
 * - Each scope item has a canonical AHSP code.
 * - Fallback codes are provided for cases where the primary code is
 *   UNREADABLE or not available.
 * - The registry is versioned per AHSP edition.
 * - Codes are the BM master LETTER codes (e.g. G.24, C.4) — the canonical
 *   identifier in `binaMarga2026Master.generated.ts` and the `code` field
 *   the cost engine indexes. The parenthesized standardCode printed in the
 *   document (e.g. 7.1.(5a4)) is recorded in each description for
 *   traceability; the engine resolves both forms.
 *
 * ⚠️ REMAP BATCH B (2026-11-14) — D-63 / G-ER-1. The registry as written
 * (a506967) used an invented numbering scheme (3.1.x = beton, 3.2.x =
 * tulangan, 3.3.x = bekisting) that NEVER matched Lampiran V BM 2026 — in
 * BM, Divisi 3.1 = Galian. Result: 6 of the 12 weir codes resolved to
 * WRONG items (concrete priced as excavation, backfill as stone masonry,
 * disposal as culvert, dewatering as filter material) and 6 did not exist
 * in the master at all. The remap below was verified code-by-code against
 * `BINA_MARGA_2026_MASTER` (1.137 items, all targets VERIFIED with prices).
 *
 * Remap rules (deterministic, documented — owner may override per OD-14):
 * - K → fc': K-xxx means xxx kg/cm² characteristic strength
 *   (1 kg/cm² = 0,0980665 MPa); the target is the next available BM fc'
 *   grade AT OR ABOVE the converted strength — never under-specified.
 *   K-175 (17,2 MPa) → fc'20 · K-225 (22,1) → fc'25 · K-250 (24,5) →
 *   fc'25 · K-300 (29,4) → fc'30 · K-350 (34,3) → fc'35. Plain "Beton
 *   struktur" variant (not "massa" / "memadat sendiri" — variant choice
 *   is an OD-14 refinement).
 * - Rebar follows the weir pipeline's own spec (BJTS 420B sirip,
 *   `weirAhspDatabase.ts`): G.78 "Baja Tulangan Sirip tanpa proteksi
 *   BjTS 420". The with-protection variant (G.77) is an OD-14 question.
 * - Foundation excavation defaults to the shallowest structure band
 *   (C.4, 0–2 m); the depth band for a given weir is an OD-14 question.
 * - Backfill: sand bedding → selected fine fill from borrow (C.23);
 *   soil backfill → ordinary fill from excavation spoil (C.17).
 * - Masonry: BM 2026 carries no 1:3 / 1:4 mix distinction — both map to
 *   the generic G.160 "Pasangan Batu" (7.9.(1)); the mix ratio is lost,
 *   recorded as an OD-14 limitation.
 *
 * Scopes with NO BM master equivalent are UNMAPPED (primaryCode omitted,
 * unmappedReason set) — they surface as honestly unmapped in the UI
 * instead of resolving to a wrong item:
 *   formwork (no bekisting pay item — BM concrete items already carry
 *   formwork materials in their components) · disposal-soil (no standalone
 *   soil-disposal pay item) · dewatering (I.23 Pompa Air is an equipment
 *   rental rate, not a work item) · cofferdam (turap items are permanent
 *   sheet piling, not temporary cofferdam) · SMKK (separate domain; the
 *   master row A.7 is a corrupt UNVERIFIED extraction artifact) ·
 *   grouting (D.49 is a material, not a grouting work item) · sliding
 *   gate (hydromechanical — SDA domain, not in the BM road-works annex).
 */

export interface ScopeMapping {
  scopeId: string;
  scopeName: string;
  domain: 'BINA_MARGA' | 'SDA' | 'CIPTA_KARYA' | 'SMKK';
  /**
   * BM master letter code (e.g. 'G.24'). OMITTED when the scope has no
   * equivalent pay item in the BM 2026 master — see `unmappedReason`.
   * A scope must never carry a code that resolves to the wrong work.
   */
  primaryCode?: string;
  fallbackCodes: string[];
  unit: string;
  description: string;
  /** Why this scope has no primaryCode (Batch B: honest unmapped state). */
  unmappedReason?: string;
}

export const SCOPE_AHSP_REGISTRY: ScopeMapping[] = [
  // === EARTHWORK & EXCAVATION ===
  {
    scopeId: 'excavation-trench',
    scopeName: 'Galian Selokan Drainase dan Saluran Air',
    domain: 'BINA_MARGA',
    primaryCode: 'B.1',
    fallbackCodes: [],
    unit: 'M3',
    description: 'Galian untuk selokan drainase dan saluran air dengan kedalaman < 1 m (std 2.1.(1)). Satu-satunya item 2.1 di master — tidak ada fallback 2.1.(2).',
  },
  {
    scopeId: 'excavation-foundation',
    scopeName: 'Galian Pondasi Bangunan',
    domain: 'BINA_MARGA',
    primaryCode: 'C.4',
    fallbackCodes: ['C.5', 'C.6'],
    unit: 'M3',
    description: 'Galian struktur pondasi, pita kedalaman 0–2 m (std 3.1.(4)). ASUMSI pita dangkal sebagai default — pita kedalaman per bendung adalah keputusan engineering (OD-14); fallback C.5 (2–4 m), C.6 (4–6 m).',
  },
  {
    scopeId: 'backfill-sand',
    scopeName: 'Urugan Pasir',
    domain: 'BINA_MARGA',
    primaryCode: 'C.23',
    fallbackCodes: ['C.27'],
    unit: 'M3',
    description: 'Urugan pasir untuk fondasi dan lantai kerja → Timbunan Pilihan Halus dari Sumber Galian (std 3.2.(2a1)): pasir urug adalah material pilihan halus dari borrow.',
  },
  {
    scopeId: 'backfill-soil',
    scopeName: 'Urugan Tanah',
    domain: 'BINA_MARGA',
    primaryCode: 'C.17',
    fallbackCodes: ['C.14'],
    unit: 'M3',
    description: 'Urugan tanah kembali (backfill) → Timbunan Biasa dari Hasil Galian (std 3.2.(1d)): urugan dari tanah galian sendiri.',
  },

  // === CONCRETE WORKS ===
  // K → fc' (1 kg/cm² = 0,0980665 MPa), dibulatkan KE ATAS ke grade BM
  // berikutnya — tidak pernah di bawah mutu yang dispesifikasikan.
  {
    scopeId: 'concrete-k-175',
    scopeName: 'Beton K-175',
    domain: 'BINA_MARGA',
    primaryCode: 'G.31',
    fallbackCodes: ['G.28'],
    unit: 'M3',
    description: 'Beton mutu K-175 (17,2 MPa) → Beton struktur fc\'20 MPa (std 7.1.(7a)).',
  },
  {
    scopeId: 'concrete-k-225',
    scopeName: 'Beton K-225',
    domain: 'BINA_MARGA',
    primaryCode: 'G.28',
    fallbackCodes: ['G.24'],
    unit: 'M3',
    description: 'Beton mutu K-225 (22,1 MPa) → Beton struktur fc\'25 MPa (std 7.1.(6a)).',
  },
  {
    scopeId: 'concrete-k-250',
    scopeName: 'Beton K-250',
    domain: 'BINA_MARGA',
    primaryCode: 'G.28',
    fallbackCodes: ['G.24'],
    unit: 'M3',
    description: 'Beton mutu K-250 (24,5 MPa) → Beton struktur fc\'25 MPa (std 7.1.(6a)).',
  },
  {
    scopeId: 'concrete-k-300',
    scopeName: 'Beton K-300',
    domain: 'BINA_MARGA',
    primaryCode: 'G.24',
    fallbackCodes: ['G.17'],
    unit: 'M3',
    description: 'Beton mutu K-300 (29,4 MPa) → Beton struktur fc\'30 MPa (std 7.1.(5a4)).',
  },
  {
    scopeId: 'concrete-k-350',
    scopeName: 'Beton K-350',
    domain: 'BINA_MARGA',
    primaryCode: 'G.17',
    fallbackCodes: ['G.8'],
    unit: 'M3',
    description: 'Beton mutu K-350 (34,3 MPa) → Beton struktur fc\'35 MPa (std 7.1.(4a7)).',
  },

  // === REINFORCEMENT ===
  {
    scopeId: 'reinforcement-steel',
    scopeName: 'Pembesian Baja Tulangan',
    domain: 'BINA_MARGA',
    primaryCode: 'G.78',
    fallbackCodes: ['G.77', 'G.74'],
    unit: 'KG',
    description: 'Pembesian dengan baja tulangan sirip BjTS 420 tanpa proteksi (std 7.3.(3b)) — mengikuti spesifikasi pipeline bendung sendiri (BJTS 420B sirip). Varian dengan proteksi (G.77) adalah pertanyaan OD-14.',
  },

  // === FORMWORK — no BM equivalent ===
  {
    scopeId: 'formwork-plain',
    scopeName: 'Bekisting Kayu untuk Beton',
    domain: 'BINA_MARGA',
    fallbackCodes: [],
    unit: 'M2',
    description: 'Bekisting kayu untuk permukaan beton biasa. TIDAK ADA mata pembayaran bekisting/acuan di master BM 2026 — item beton BM sudah memuat material bekisting dalam komponennya (paku, kaso, multipleks) — scope ini sengaja tidak dipetakan.',
    unmappedReason: 'Tidak ada mata pembayaran bekisting di master BM 2026; item beton BM sudah memuat material bekisting dalam komponennya.',
  },

  // === MASONRY ===
  // BM 2026 tidak membedakan campuran 1:3 vs 1:4 — keduanya ke G.160.
  {
    scopeId: 'masonry-stone-1-3',
    scopeName: 'Pasangan Batu Kali 1:3',
    domain: 'BINA_MARGA',
    primaryCode: 'G.160',
    fallbackCodes: ['B.2'],
    unit: 'M3',
    description: 'Pasangan batu kali dengan mortar 1 PC : 3 Pasir → Pasangan Batu (std 7.9.(1)). BATASAN: master BM tidak membedakan rasio campuran 1:3/1:4 — rasio hilang dalam pemetaan ini (OD-14).',
  },
  {
    scopeId: 'masonry-stone-1-4',
    scopeName: 'Pasangan Batu Kali 1:4',
    domain: 'BINA_MARGA',
    primaryCode: 'G.160',
    fallbackCodes: ['B.2'],
    unit: 'M3',
    description: 'Pasangan batu kali dengan mortar 1 PC : 4 Pasir → Pasangan Batu (std 7.9.(1)). BATASAN: master BM tidak membedakan rasio campuran 1:3/1:4 — rasio hilang dalam pemetaan ini (OD-14).',
  },

  // === GROUTING & JOINTS — no BM work item ===
  {
    scopeId: 'grouting-cement',
    scopeName: 'Grouting Semen',
    domain: 'BINA_MARGA',
    fallbackCodes: [],
    unit: 'M3',
    description: 'Grouting dengan semen untuk injeksi batu / beton. TIDAK ADA item pekerjaan grouting di master BM 2026 (D.49 "Material Injeksi Berbahan Dasar Semen" adalah material per kg, bukan item pekerjaan) — scope ini sengaja tidak dipetakan.',
    unmappedReason: 'Tidak ada item pekerjaan grouting di master BM 2026 (D.49 adalah material, bukan pekerjaan).',
  },

  // === HYDROMECHANICAL — SDA domain, not BM ===
  {
    scopeId: 'gate-sliding',
    scopeName: 'Pintu Air Geser (Sliding Gate)',
    domain: 'BINA_MARGA',
    fallbackCodes: [],
    unit: 'BUAH',
    description: 'Pemasangan pintu air geser dengan rangka baja. TIDAK ADA item pintu air di master BM 2026 (annex pekerjaan jalan; pintu air adalah domain SDA) — scope ini sengaja tidak dipetakan.',
    unmappedReason: 'Pintu air adalah domain SDA — tidak ada di master BM 2026.',
  },

  // === DISPOSAL — no BM pay item ===
  {
    scopeId: 'disposal-soil',
    scopeName: 'Pembuangan Tanah Galian',
    domain: 'BINA_MARGA',
    fallbackCodes: [],
    unit: 'M3',
    description: 'Pembuangan / pengangkutan tanah galian ke lokasi pembuangan. TIDAK ADA mata pembayaran khusus pembuangan tanah galian di master BM 2026 (G.212 adalah pengangkutan hasil bongkaran > 5 km, bukan tanah galian) — scope ini sengaja tidak dipetakan.',
    unmappedReason: 'Tidak ada mata pembayaran pembuangan tanah galian di master BM 2026.',
  },

  // === DEWATERING — no BM work item ===
  {
    scopeId: 'dewatering-wellpoint',
    scopeName: 'Dewatering dengan Wellpoint',
    domain: 'BINA_MARGA',
    fallbackCodes: [],
    unit: 'JAM',
    description: 'Pompa dewatering wellpoint untuk pengurangan muka air tanah. TIDAK ADA item pekerjaan dewatering di master BM 2026 (I.23 "Pompa Air 70–100 mm" adalah tarif sewa alat per jam, bukan item pekerjaan) — scope ini sengaja tidak dipetakan.',
    unmappedReason: 'Tidak ada item pekerjaan dewatering di master BM 2026 (I.23 adalah tarif sewa alat).',
  },

  // === TEMPORARY WORKS — no BM cofferdam item ===
  {
    scopeId: 'temporary-cofferdam',
    scopeName: 'Pekerjaan Cofferdam Sementara',
    domain: 'BINA_MARGA',
    fallbackCodes: [],
    unit: 'M2',
    description: 'Pemasangan dan pembongkaran cofferdam untuk pekerjaan di dalam air. TIDAK ADA item cofferdam sementara di master BM 2026 (item turap G.105–G.109 adalah turap permanen penyediaan+pemancangan, bukan cofferdam sementara) — scope ini sengaja tidak dipetakan.',
    unmappedReason: 'Tidak ada item cofferdam sementara di master BM 2026 (item turap adalah turap permanen).',
  },

  // === SAFETY / SMKK — separate domain ===
  {
    scopeId: 'safety-smkk',
    scopeName: 'Biaya SMKK (K3)',
    domain: 'SMKK',
    fallbackCodes: [],
    unit: 'LS',
    description: 'Biaya Keselamatan dan Kesehatan Kerja (di luar AHSP Bina Marga). SMKK adalah domain terpisah (Lampiran III); baris master A.7 adalah artefak ekstraksi korup (UNVERIFIED, tanpa harga) dan tidak dapat dipakai — scope ini sengaja tidak dipetakan.',
    unmappedReason: 'SMKK adalah domain terpisah (Lampiran III); baris master A.7 korup (UNVERIFIED, tanpa harga).',
  },
];

/** Lookup by scopeId. */
export function findScopeMapping(scopeId: string): ScopeMapping | undefined {
  return SCOPE_AHSP_REGISTRY.find((s) => s.scopeId === scopeId);
}

/** Lookup by AHSP code. */
export function findScopeByCode(code: string): ScopeMapping | undefined {
  return SCOPE_AHSP_REGISTRY.find(
    (s) => s.primaryCode === code || s.fallbackCodes.includes(code)
  );
}

/** True iff the scope has a real BM master code (not an honest unmapped state). */
export function isScopeMapped(mapping: ScopeMapping | undefined): boolean {
  return !!mapping?.primaryCode;
}
