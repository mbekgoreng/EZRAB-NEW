/**
 * DED AI ESTIMATE — Lapisan Penyelesaian Harga & Kuantitas (Full AI).
 *
 * Mandat owner 2026-11-10 03:13 + master prompt "AI Auto Price
 * Completion": dalam mode FULL AI, lubang harga dan lubang kuantitas
 * WAJIB dilengkapi sampai tuntas agar pengguna tidak kecewa — dengan
 * label & dasar yang jujur. Mode DATABASE tidak pernah disentuh modul
 * ini (pemanggil di service.ts hanya menjalankannya untuk FULL_AI).
 *
 * Hierarki fallback harga yang diterapkan:
 *  1. AHSP resmi terverifikasi (adapter kanonis — sudah berjalan di
 *     convertAiItem; lapisan ini TIDAK PERNAH menimpanya).
 *  2. SSH/HSPK pemerintah daerah (adapter kanonis yang sama).
 *  3. Referensi supplier/manufaktur eksternal terkurasi.
 *  4. Referensi pasar kontraktor terkurasi.
 *  5. Estimasi AI multi-referensi (sintesis — mis. pintu double HPL;
 *     berlabel AI_ESTIMATE dengan dasar multi-sumber).
 *  6. Klarifikasi — hanya bila spesifikasi esensial benar-benar
 *     menghalangi (dilaporkan NEEDS_CLARIFICATION/UNRESOLVED).
 *
 * Aturan keras:
 * - Item tanpa kode AHSP tetap item RAB sah berprovenans non-AHSP —
 *   tidak pernah ditolak.
 * - Harga manual pengguna & harga AHSP resmi TIDAK ditimpa. Estimasi
 *   penyelesaian yang sudah ada hanya diganti referensi lebih kuat
 *   lewat riwayat tertulis (history).
 * - Kuantitas TIDAK dikarang mesin harga: kuantitas hanya diisi jalur
 *   estimasi-kuantitas DED di modul ini (asumsi berlabel dari konteks
 *   denah), atau tetap NEEDS_QUANTITY ("butuh spesifikasi esensial").
 * - Overhead/profit proyek tidak disentuh — harga referensi dipakai
 *   apa adanya (biaya langsung, tanpa markup implisit).
 * - LLM tidak menghitung total: subtotal tetap dihitung calculator.ts.
 */

import type {
  DedAiItem, DedCompletionReport, DedPriceCompletion, DedEstimationPolicy,
  DedQuantityAudit, DedQuantityClass, DedPriceSourceKind,
} from './types';
import { EXTERNAL_PRICE_REFERENCES, findExternalReference, findConflictingReference, referenceSpecConflict, type ExternalPriceReference } from './externalPriceReferences';
import { getResearch, putResearch, isStale, referenceIsStale, type CachedResearch } from './priceResearchCache';
import { shapeForUnit } from './quantity';

// ---------------------------------------------------------------------------
// Konteks denah (diekstrak deterministik dari item hasil konversi sendiri)
// ---------------------------------------------------------------------------

export interface DedPlanContext {
  /** Luas lantai bangunan (m²) — dari item lantai keramik/ubin. */
  floorAreaM2: number | null;
  /** Luas plafon (m²) — proksi luas dak untuk pelat dak beton. */
  ceilingAreaM2: number | null;
  /** Keliling bangunan (m') — dari item bouwplank/pengukuran. */
  buildingPerimeterM: number | null;
  /** Jumlah unit pintu (P1+P2+…) — dasar hitung bovenlicht. */
  doorUnits: number | null;
  /** Jumlah ruang utama (estimasi dari luas lantai). */
  roomCount: number | null;
}

function qtyOf(items: DedAiItem[], pred: (it: DedAiItem) => boolean): number | null {
  const found = items.filter((it) => it.quantity != null && pred(it));
  if (found.length === 0) return null;
  return found.reduce((a, it) => a + (it.quantity as number), 0);
}

export function derivePlanContext(items: DedAiItem[]): DedPlanContext {
  const floorAreaM2 = qtyOf(items, (it) => /lantai/i.test(it.name) && /keramik|ubin|granit/i.test(it.name) && it.units === 'm2');
  const ceilingAreaM2 = qtyOf(items, (it) => /plafon/i.test(it.name) && it.units === 'm2');
  const buildingPerimeterM = qtyOf(items, (it) => /bouwplank|pengukuran/i.test(it.name));
  const doorUnits = qtyOf(items, (it) => /pintu/i.test(it.name) && shapeForUnit(it.units) === 'COUNT');
  const roomCount = floorAreaM2 != null ? Math.max(3, Math.round(floorAreaM2 / 12)) : null;
  return { floorAreaM2, ceilingAreaM2, buildingPerimeterM, doorUnits, roomCount };
}

// ---------------------------------------------------------------------------
// Diskriminator kuantitas nol/mikro (master prompt §7 vs arah owner 03:13)
// ---------------------------------------------------------------------------

export type ZeroQuantityClass = 'MISSING' | 'IMPLAUSIBLE_FRAGMENT' | 'EXPLICIT_ZERO' | 'PRESENT';

const STRUCTURAL_NAME = /pelat|plat|dak|balok|kolom|sloof|ringbalk|pondasi|pile\s?cap/i;

/**
 * Klasifikasi keadaan kuantitas:
 * - MISSING: null — jalur estimasi-kuantitas boleh mengisi dari denah.
 * - IMPLAUSIBLE_FRAGMENT: angka positif tetapi di bawah lantai fisik
 *   elemennya (pelat dak 3,57e-6 m³; listplank 0,0295 m' hasil salah
 *   baca spek "8x150mm"). Dalam FULL_AI → diestimasi berlabel; mode
 *   lain → ditahan (mesin kanonis menolak/menandai).
 * - EXPLICIT_ZERO: 0 yang memang disengaja (mis. koreksi pengguna) —
 *   tidak diestimasi; jumlah 0 + penanda tinjau.
 * - PRESENT: kuantitas wajar, tidak disentuh.
 */
export function classifyQuantity(item: Pick<DedAiItem, 'name' | 'units' | 'quantity'>): ZeroQuantityClass {
  const q = item.quantity;
  if (q === null || q === undefined) return 'MISSING';
  if (q === 0) return 'EXPLICIT_ZERO';
  const shape = shapeForUnit(item.units);
  if (shape === 'VOLUME' && q < 0.01 && STRUCTURAL_NAME.test(item.name)) return 'IMPLAUSIBLE_FRAGMENT';
  if (/listplank|lisplang/i.test(item.name) && shape === 'LENGTH' && q < 1) return 'IMPLAUSIBLE_FRAGMENT';
  return 'PRESENT';
}

// ---------------------------------------------------------------------------
// Jalur estimasi-kuantitas DED (asumsi berlabel dari konteks denah)
// ---------------------------------------------------------------------------

export interface QuantityEstimate {
  quantity: number;
  /** Rumus/dasar terbaca — ditampilkan ke pengguna, bisa diklik/ditinjau. */
  formula: string;
  basis: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function estimateMissingQuantity(
  item: DedAiItem,
  ctx: DedPlanContext,
): QuantityEstimate | null {
  const name = item.name.toLowerCase();
  const cls = classifyQuantity(item);

  // Septic tank: satu rumah tinggal = satu unit.
  if (/septic/.test(name) && shapeForUnit(item.units) === 'COUNT') {
    return {
      quantity: 1,
      formula: '1 unit septic tank + resapan untuk satu rumah tinggal 1 lantai',
      basis: 'Asumsi DED: satu rumah tinggal satu lantai memakai satu unit septic tank + resapan standar.',
    };
  }
  // Bovenlicht: satu di atas tiap unit pintu (jadwal kusen P1/P2 pada DED).
  if (/boven/.test(name) && ctx.doorUnits != null && ctx.doorUnits > 0) {
    return {
      quantity: ctx.doorUnits,
      formula: `Satu bovenlicht di atas tiap unit pintu: ${ctx.doorUnits} unit pintu pada jadwal kusen = ${ctx.doorUnits} unit BV`,
      basis: 'Asumsi DED: bovenlicht dipasang di atas tiap daun pintu sesuai denah kusen; jumlah pintu terbaca dari item pintu hasil analisis yang sama.',
    };
  }
  // Titik penerangan: ±1 titik per 9 m² luas lantai.
  if (/penerangan|titik lampu/.test(name) && ctx.floorAreaM2 != null) {
    const n = Math.max(3, Math.ceil(ctx.floorAreaM2 / 9));
    return {
      quantity: n,
      formula: `Luas lantai ${ctx.floorAreaM2} m² ÷ ±9 m² per titik = ${n} titik penerangan`,
      basis: 'Asumsi DED: satu titik penerangan per ±9 m² (ruang tamu, kamar, dapur, KM, teras) — perlu dicocokkan dengan denah elektrikal.',
    };
  }
  // Stop kontak: 2 titik per ruang utama.
  if (/stop kontak/.test(name) && ctx.roomCount != null) {
    const n = ctx.roomCount * 2;
    return {
      quantity: n,
      formula: `${ctx.roomCount} ruang utama × 2 titik = ${n} titik stop kontak`,
      basis: 'Asumsi DED: dua titik stop kontak per ruang utama (ruang tamu, kamar, dapur, area cuci).',
    };
  }
  // Sakelar: satu per titik penerangan.
  if (/sakelar|saklar/.test(name) && ctx.floorAreaM2 != null) {
    const n = Math.max(3, Math.ceil(ctx.floorAreaM2 / 9));
    return {
      quantity: n,
      formula: `Satu sakelar per titik penerangan = ${n} titik sakelar`,
      basis: 'Asumsi DED: jumlah sakelar mengikuti jumlah titik penerangan.',
    };
  }
  // PHB / box MCB: satu panel per rumah.
  if (/phb|box mcb|panel listrik/.test(name) && shapeForUnit(item.units) === 'COUNT') {
    return {
      quantity: 1,
      formula: '1 unit PHB/box MCB untuk satu rumah tinggal',
      basis: 'Asumsi DED: satu panel pembagi (PHB) per rumah tinggal.',
    };
  }
  // Pelat dak terbaca mikro/nol: luas dak ≈ luas plafon × tebal dari nama.
  if (cls === 'IMPLAUSIBLE_FRAGMENT' && /pelat|plat|dak/.test(name) && ctx.ceilingAreaM2 != null) {
    const tMatch = /t\s*=\s*(\d+)\s*mm/i.exec(item.name) || /(\d+)\s*mm/i.exec(item.name);
    const thickness = tMatch ? Number(tMatch[1]) / 1000 : 0.1;
    const qty = round2(ctx.ceilingAreaM2 * thickness);
    if (qty > 0) {
      return {
        quantity: qty,
        formula: `Luas dak ≈ luas plafon ${ctx.ceilingAreaM2} m² × tebal pelat ${thickness} m = ${qty} m³`,
        basis: `Asumsi DED: kuantitas terbaca (${item.quantity} m³) tidak fisik untuk pelat dak — diganti estimasi dari luas plafon dan tebal pelat pada nama item. Wajib ditinjau.`,
      };
    }
  }
  // Listplank terbaca fragmen (< 1 m'): panjang = keliling bangunan/atap.
  if (cls === 'IMPLAUSIBLE_FRAGMENT' && /listplank|lisplang/.test(name) && ctx.buildingPerimeterM != null) {
    return {
      quantity: ctx.buildingPerimeterM,
      formula: `Listplank mengelilingi atap: keliling bangunan ${ctx.buildingPerimeterM} m' (dari item pengukuran/bouwplank)`,
      basis: `Asumsi DED: kuantitas terbaca (${item.quantity} m') adalah fragmen salah-baca spesifikasi pada nama item — panjang listplank mengikuti keliling atap.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// HARDENING 2026-11-10 Tahap 1 — klasifikasi kuantitas eksplisit + audit
// ---------------------------------------------------------------------------

/**
 * Petakan klasifikasi penyelesaian yang ada ke jenis sumber kosakata
 * Unified Credits (master prompt Tahap 2). Klasifikasi lama tetap
 * sumber kebenaran; ini turunan murni.
 * - Tier SUPPLIER_MANUFACTURER (daftar harga supplier/manufaktur yang
 *   benar-benar diambil & dicatat URL-nya) → VERIFIED_SUPPLIER.
 * - Tier CONTRACTOR_MARKET → MARKET_REFERENCE.
 */
export function priceSourceKindFor(
  classification: DedPriceCompletion['classification'],
  tier?: ExternalPriceReference['tier'],
): DedPriceSourceKind {
  switch (classification) {
    case 'OFFICIAL_AHSP_VERIFIED': return 'OFFICIAL_AHSP';
    case 'OFFICIAL_REGIONAL_REFERENCE': return 'OFFICIAL_SSH_HSPK';
    case 'MARKET_REFERENCE': return tier === 'SUPPLIER_MANUFACTURER' ? 'VERIFIED_SUPPLIER' : 'MARKET_REFERENCE';
    case 'AI_ESTIMATE': return 'AI_ESTIMATE';
    case 'MANUAL_PRICE': return 'USER_MANUAL';
    default: return 'UNRESOLVED';
  }
}

/**
 * Klasifikasi kuantitas eksplisit SATU kelas per item. Precedence
 * (keadaan didahulukan atas asal-usul, agar tidak tertukar):
 *  1. kuantitas hilang → MISSING; nol → EXPLICIT_ZERO; fragmen tak
 *     fisik yang belum diperbaiki → IMPLAUSIBLE_FRAGMENT.
 *  2. evaluator kewajaran menandai NEEDS_REVIEW → NEEDS_REVIEW.
 *  3. asal-usul: USER_INPUT → USER_PROVIDED; DED_EXPLICIT →
 *     DRAWING_EXTRACTED; DED_GEOMETRIC/DERIVED →
 *     CALCULATED_FROM_VERIFIED_INPUT; ASSUMPTION/AI_INFERENCE →
 *     ESTIMATED_FROM_CONTEXT; UNRESOLVED tanpa kuantitas → MISSING.
 * Kuantitas isian konteks yang SUDAH diterapkan (ASSUMPTION dari jalur
 * estimasi) terklasifikasi ESTIMATED_FROM_CONTEXT — fragmen aslinya
 * tercatat di blok audit (originalQuantity), bukan kelasnya.
 */
export function classifyQuantityProvenance(
  item: Pick<DedAiItem, 'name' | 'units' | 'quantity' | 'quantitySource' | 'quantityReview'>,
): DedQuantityClass {
  const state = classifyQuantity(item);
  if (state === 'MISSING') return 'MISSING';
  if (state === 'EXPLICIT_ZERO') return 'EXPLICIT_ZERO';
  if (state === 'IMPLAUSIBLE_FRAGMENT' && item.quantitySource !== 'ASSUMPTION') {
    return 'IMPLAUSIBLE_FRAGMENT';
  }
  if (item.quantityReview?.outcome === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
  switch (item.quantitySource) {
    case 'USER_INPUT': return 'USER_PROVIDED';
    case 'DED_EXPLICIT': return 'DRAWING_EXTRACTED';
    case 'DED_GEOMETRIC':
    case 'DERIVED': return 'CALCULATED_FROM_VERIFIED_INPUT';
    case 'ASSUMPTION':
    case 'AI_INFERENCE': return 'ESTIMATED_FROM_CONTEXT';
    default: return item.quantity == null ? 'MISSING' : 'NEEDS_REVIEW';
  }
}

export interface QuantityFillTrace {
  estimate: QuantityEstimate;
  ctx: DedPlanContext;
  originalQuantity: number | null;
}

/** Variabel konteks denah yang relevan sebagai jejak input audit. */
function planContextInputs(ctx: DedPlanContext): Array<{ name: string; value: number | null }> {
  return [
    { name: 'floorAreaM2', value: ctx.floorAreaM2 },
    { name: 'ceilingAreaM2', value: ctx.ceilingAreaM2 },
    { name: 'buildingPerimeterM', value: ctx.buildingPerimeterM },
    { name: 'doorUnits', value: ctx.doorUnits },
    { name: 'roomCount', value: ctx.roomCount },
  ];
}

/**
 * Bangun blok audit kuantitas untuk satu item. `fill` diisi bila
 * kuantitas item ini dilengkapi jalur estimasi konteks pada putaran
 * ini — maka metode/rumus/asumsi diambil dari estimasinya dan status
 * persetujuan PENDING (estimasi tidak pernah disetujui diam-diam).
 */
export function buildQuantityAudit(item: DedAiItem, fill?: QuantityFillTrace): DedQuantityAudit {
  const classification = classifyQuantityProvenance(item);
  if (fill) {
    return {
      classification,
      originalQuantity: fill.originalQuantity,
      proposedQuantity: item.quantity,
      unit: item.units,
      method: 'plan-context-estimate',
      inputs: planContextInputs(fill.ctx),
      formula: fill.estimate.formula,
      assumptions: fill.estimate.basis,
      confidence: 'MEDIUM',
      verificationStatus: 'UNVERIFIED',
      userApprovalStatus: 'PENDING',
    };
  }
  const isEstimate = classification === 'ESTIMATED_FROM_CONTEXT';
  return {
    classification,
    originalQuantity: item.quantity,
    proposedQuantity: item.quantity,
    unit: item.units,
    method:
      classification === 'DRAWING_EXTRACTED' ? 'drawing-explicit'
      : classification === 'USER_PROVIDED' ? 'user-input'
      : classification === 'CALCULATED_FROM_VERIFIED_INPUT' ? 'deterministic-derivation'
      : isEstimate ? 'ai-inference-or-assumption'
      : 'none',
    inputs: item.derivation?.inputs.map((i) => ({ name: i.name, value: i.value })) ?? [],
    formula: item.quantityFormula,
    assumptions: item.quantityNote,
    confidence: classification === 'DRAWING_EXTRACTED' || classification === 'USER_PROVIDED'
      ? 'HIGH'
      : classification === 'MISSING' || classification === 'IMPLAUSIBLE_FRAGMENT' ? 'LOW' : 'MEDIUM',
    verificationStatus:
      classification === 'DRAWING_EXTRACTED' || classification === 'CALCULATED_FROM_VERIFIED_INPUT'
        ? 'VERIFIED'
        : classification === 'NEEDS_REVIEW' || classification === 'IMPLAUSIBLE_FRAGMENT'
          ? 'NEEDS_VERIFICATION'
          : 'UNVERIFIED',
    userApprovalStatus: isEstimate ? 'PENDING' : 'NOT_REQUIRED',
  };
}

// ---------------------------------------------------------------------------
// Penyelesaian per item
// ---------------------------------------------------------------------------

export type CompletionOutcome =
  | 'FILLED_MARKET_REFERENCE'
  | 'FILLED_AI_ESTIMATE'
  | 'KEPT_OFFICIAL'
  | 'KEPT_EXISTING'
  | 'NEEDS_QUANTITY'
  | 'NEEDS_CLARIFICATION'
  | 'UNRESOLVED'
  | 'FAILED';

export interface CompletionOptions {
  policy: DedEstimationPolicy;
  /** Wilayah proyek (untuk penanda lintas-wilayah). */
  projectRegion?: string;
  /** Tanggal penyelesaian (ISO) — dapat disuntik untuk tes deterministik. */
  now?: Date;
  /** Referensi yang dipakai (default: kurasi bawaan). */
  references?: ExternalPriceReference[];
  /**
   * HARDENING Tahap 3: true bila `references` diberikan pemanggil
   * secara eksplisit (bukan default modul) — himpunan itu otoritatif
   * dan cache sesi tidak dikonsultasikan untuk panggilan ini.
   */
  referencesExplicit?: boolean;
  /** Penilai referensi pengganti (untuk skenario kegagalan provider). */
  resolveReference?: (item: DedAiItem) => ExternalPriceReference | null;
}

const CLASSIFICATION_RANK: Record<string, number> = {
  OFFICIAL_AHSP_VERIFIED: 5,
  OFFICIAL_REGIONAL_REFERENCE: 4,
  MARKET_REFERENCE: 3,
  AI_ESTIMATE: 2,
  MANUAL_PRICE: 2,
  PRICE_UNRESOLVED: 0,
};

function completionNoteFor(ref: ExternalPriceReference, stale: boolean, crossRegion: boolean): string {
  const parts = [
    `Estimasi AI (referensi pasar eksternal${stale ? ' — referensi sudah melewati masa segar, perlakukan sebagai estimasi kasar' : ''}): Rp${ref.recommendedPrice.toLocaleString('id-ID')}/${ref.unit}`,
    `rentang Rp${ref.rangeMin.toLocaleString('id-ID')}–${ref.rangeMax.toLocaleString('id-ID')}`,
    `cakupan ${ref.scope === 'TERPASANG_PENUH' ? 'terpasang penuh' : 'material saja'}`,
    `sumber: ${ref.sourceName} (${ref.sourceUrl}), data ${ref.sourceDate}, diambil ${ref.accessedAt}`,
    `wilayah referensi: ${ref.region}${crossRegion ? ' — LUAR wilayah proyek, bukan harga lokal terverifikasi' : ''}`,
    `asumsi spek: ${ref.specAssumption}`,
  ];
  return parts.join('; ') + '. Bukan harga resmi AHSP — verifikasi sebelum pengadaan/kontrak.';
}

function baseCompletion(item: DedAiItem, nowIso: string): DedPriceCompletion {
  return {
    classification: 'PRICE_UNRESOLVED',
    sourceKind: 'UNRESOLVED',
    verificationStatus: 'UNVERIFIED',
    userApprovalStatus: 'NOT_REQUIRED',
    recommendedPrice: null,
    rangeMin: null,
    rangeMax: null,
    unit: item.units,
    scope: 'TIDAK_DINYATAKAN',
    accessedAt: nowIso,
    confidence: 'LOW',
    method: 'tidak ada',
    ahspRelated: Boolean(item.ahspCode || item.ahspMatch),
    originalUnitPrice: item.unitPrice,
    originalQuantity: item.quantity,
    history: [],
  };
}

/**
 * Selesaikan SATU item. Mengembalikan item baru + outcome. Tidak pernah
 * mengubah item ber-harga AHSP_2026 / USER_INPUT; tidak pernah menghitung
 * subtotal (itu wewenang calculator.ts).
 */
export function completeDedItem(
  item: DedAiItem,
  ctx: DedPlanContext,
  opts: CompletionOptions,
): { item: DedAiItem; outcome: CompletionOutcome } {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString().slice(0, 10);
  let next: DedAiItem = { ...item };
  let outcome: CompletionOutcome = 'UNRESOLVED';
  let quantityFilled = false;
  let fillTrace: QuantityFillTrace | undefined;

  // --- Jalur kuantitas (hanya estimasi-kuantitas DED; mesin harga tidak
  // mengarang kuantitas). Berjalan juga untuk item berharga: harga boleh
  // ada sementara kuantitas belum (kasus septic tank). ---
  const qClass = classifyQuantity(next);
  if (qClass === 'MISSING' || qClass === 'IMPLAUSIBLE_FRAGMENT') {
    const est = estimateMissingQuantity(next, ctx);
    if (est) {
      fillTrace = { estimate: est, ctx, originalQuantity: next.quantity };
      next = {
        ...next,
        quantity: est.quantity,
        quantitySource: 'ASSUMPTION',
        quantityFormula: est.formula,
        quantityNote: `Kuantitas dilengkapi AI (asumsi berlabel). ${est.basis}`,
        provenance: [...next.provenance, 'ai-completion:quantity'],
      };
      quantityFilled = true;
    }
  }

  // --- Perlindungan: harga resmi & manual tidak ditimpa. ---
  if (next.unitPrice != null) {
    if (next.priceSource === 'AHSP_2026') {
      outcome = 'KEPT_OFFICIAL';
      if (!next.priceCompletion) {
        next = {
          ...next,
          priceCompletion: {
            ...baseCompletion(next, nowIso),
            classification: 'OFFICIAL_AHSP_VERIFIED',
            sourceKind: 'OFFICIAL_AHSP',
            verificationStatus: 'VERIFIED',
            recommendedPrice: next.unitPrice,
            method: 'dipertahankan — harga kanonis AHSP tidak ditimpa penyelesaian AI',
            confidence: 'HIGH',
          },
        };
      }
    } else if (next.priceSource === 'USER_INPUT') {
      outcome = 'KEPT_EXISTING';
      if (!next.priceCompletion) {
        next = {
          ...next,
          priceCompletion: {
            ...baseCompletion(next, nowIso),
            classification: 'MANUAL_PRICE',
            sourceKind: 'USER_MANUAL',
            recommendedPrice: next.unitPrice,
            method: 'dipertahankan — harga manual pengguna tidak ditimpa penyelesaian AI',
            confidence: 'HIGH',
          },
        };
      }
    } else {
      // Harga estimasi model yang sudah ada: dipertahankan, kecuali ia
      // berasal dari penyelesaian ini dan referensi yang lebih kuat
      // muncul — penggantian transparan dengan riwayat.
      outcome = 'KEPT_EXISTING';
      const prev = next.priceCompletion;
      if (prev?.referenceId) {
        const stronger = findExternalReference(next.name, next.units, opts.references ?? EXTERNAL_PRICE_REFERENCES);
        if (stronger && stronger.id !== prev.referenceId) {
          const rankNew = CLASSIFICATION_RANK.MARKET_REFERENCE;
          const rankOld = CLASSIFICATION_RANK[prev.classification] ?? 0;
          if (rankNew > rankOld) {
            next = applyReference(next, stronger, false, opts, nowIso, 'penggantian transparan: referensi lebih kuat menggantikan estimasi penyelesaian sebelumnya');
            outcome = stronger.tier === 'SUPPLIER_MANUFACTURER' || stronger.tier === 'CONTRACTOR_MARKET'
              ? 'FILLED_MARKET_REFERENCE' : 'FILLED_AI_ESTIMATE';
          }
        }
      }
    }
    // Di cabang harga-ada ini outcome selalu KEPT_OFFICIAL / KEPT_EXISTING /
    // FILLED_* (tidak pernah UNRESOLVED) — kuantitas yang dilengkapi cukup
    // ditandai lewat markQuantityBasis, outcome harga dipertahankan apa adanya.
    return { item: withQuantityAudit(markQuantityBasis(next, quantityFilled), fillTrace), outcome };
  }

  // --- Harga kosong: konsultasikan cache riset, lalu referensi kurasi. ---
  const references = opts.references ?? EXTERNAL_PRICE_REFERENCES;
  let ref: ExternalPriceReference | null = null;
  let stale = false;
  if (opts.resolveReference) {
    ref = opts.resolveReference(next);
  } else if (opts.referencesExplicit ?? opts.references !== undefined) {
    // Pemanggil menyediakan himpunan referensi EKSPLISIT (kurasi uji /
    // cakupan terpilih): himpunan itu otoritatif untuk panggilan ini —
    // cache sesi tidak boleh menyuntikkan referensi di luar himpunan.
    ref = findExternalReference(next.name, next.units, references);
    if (ref) stale = referenceIsStale(ref, now);
  } else {
    const cached = getResearch(
      { description: next.name, specification: next.specification, unit: next.units, region: opts.projectRegion || '', scope: 'TERPASANG_PENUH' },
      now,
    );
    if (cached
      && cached.entry.reference.unit.toLowerCase() === next.units.toLowerCase()
      // HARDENING Tahap 2/3: entri cache juga harus lolos penjaga
      // konflik spesifikasi — cache bukan jalan pintas melewati
      // pemeriksaan material (entri bisa ditanam konteks lain).
      && !referenceSpecConflict(next.name, cached.entry.reference)) {
      ref = cached.entry.reference;
      stale = cached.stale;
    } else {
      ref = findExternalReference(next.name, next.units, references);
      if (ref) {
        // HARDENING Tahap 3: kunci simpan HARUS sama dengan kunci cari
        // di atas (wilayah dari opsi pemanggil, bukan wilayah referensi)
        // — sebelumnya simpan memakai ref.region sehingga hit cache di
        // jalur produksi praktis selalu meleset. Cakupan tetap cakupan
        // referensi yang jujur; pencarian memang meminta TERPASANG_PENUH.
        const entry = putResearch(
          { description: next.name, specification: next.specification, unit: next.units, region: opts.projectRegion || '', scope: ref.scope },
          ref,
          ref.accessedAt,
        );
        stale = isStale(entry as CachedResearch, now);
      }
    }
  }

  if (ref) {
    next = applyReference(next, ref, stale, opts, nowIso, 'fallback referensi eksternal terkurasi (hierarki tingkat 3–5)');
    outcome = stale ? 'FILLED_AI_ESTIMATE' : 'FILLED_MARKET_REFERENCE';
  } else if (quantityFilled || next.quantity != null) {
    outcome = 'UNRESOLVED';
  }

  // HARDENING Tahap 2: referensi yang gugur karena konflik spesifikasi
  // material ditandai NEEDS_VERIFICATION secara eksplisit — harga tetap
  // kosong (tidak diisi paksa), tetapi alasannya terlihat, bukan hilang.
  if (!ref && !next.priceCompletion) {
    const conflict = findConflictingReference(next.name, next.units, references);
    if (conflict) {
      next = {
        ...next,
        priceCompletion: {
          ...baseCompletion(next, nowIso),
          verificationStatus: 'NEEDS_VERIFICATION',
          method: `referensi ${conflict.ref.id} ditolak: ${conflict.reason} — harga dibiarkan kosong menunggu verifikasi spesifikasi`,
          specAssumption: conflict.ref.specAssumption,
          referenceId: conflict.ref.id,
        },
      };
    }
  }

  if (next.quantity == null) {
    // Kuantitas tetap tidak bisa diisi dari denah: harga (bila terisi)
    // disimpan, tetapi item dilaporkan butuh kuantitas — bukan diisi
    // diam-diam oleh mesin harga.
    outcome = 'NEEDS_QUANTITY';
  }
  return { item: withQuantityAudit(markQuantityBasis(next, quantityFilled), fillTrace), outcome };
}

/** Tempel blok audit kuantitas (Tahap 1) ke item hasil penyelesaian. */
function withQuantityAudit(item: DedAiItem, fill?: QuantityFillTrace): DedAiItem {
  return { ...item, quantityAudit: buildQuantityAudit(item, fill) };
}

function markQuantityBasis(item: DedAiItem, quantityFilled: boolean): DedAiItem {
  if (!quantityFilled) return item;
  const basis = item.quantityFormula;
  if (!basis) return item;
  const existing = item.priceCompletion;
  if (existing) {
    return { ...item, priceCompletion: { ...existing, quantityBasis: basis } };
  }
  // Item yang harganya sudah ada dari model (bukan isian penyelesaian)
  // tetap membawa jejak pengisian kuantitas agar dasarnya terlihat.
  const cls = item.priceSource === 'AHSP_2026'
    ? 'OFFICIAL_AHSP_VERIFIED' as const
    : item.priceSource === 'USER_INPUT'
      ? 'MANUAL_PRICE' as const
      : item.priceSource === 'AI_ESTIMATE'
        ? 'AI_ESTIMATE' as const
        : 'PRICE_UNRESOLVED' as const;
  return {
    ...item,
    priceCompletion: {
      classification: cls,
      sourceKind: priceSourceKindFor(cls),
      verificationStatus: cls === 'OFFICIAL_AHSP_VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
      userApprovalStatus: 'PENDING',
      recommendedPrice: item.unitPrice,
      rangeMin: null,
      rangeMax: null,
      unit: item.units,
      scope: 'TIDAK_DINYATAKAN',
      accessedAt: new Date().toISOString().slice(0, 10),
      confidence: 'MEDIUM',
      method: 'kuantitas dilengkapi jalur estimasi-kuantitas DED (asumsi berlabel dari konteks denah); harga item tidak diubah',
      ahspRelated: Boolean(item.ahspCode || item.ahspMatch),
      quantityBasis: basis,
      originalUnitPrice: item.unitPrice,
      originalQuantity: null,
      history: [],
    },
  };
}

function applyReference(
  item: DedAiItem,
  ref: ExternalPriceReference,
  stale: boolean,
  opts: CompletionOptions,
  nowIso: string,
  method: string,
): DedAiItem {
  const crossRegion = Boolean(opts.projectRegion && !ref.region.toLowerCase().includes(opts.projectRegion.toLowerCase()));
  const classification = stale ? 'AI_ESTIMATE' as const : 'MARKET_REFERENCE' as const;
  const prev = item.priceCompletion;
  const history = [
    ...(prev?.history ?? []),
    ...(prev && prev.recommendedPrice != null
      ? [{ unitPrice: prev.recommendedPrice, classification: prev.classification, at: nowIso, note: `digantikan oleh referensi ${ref.id} (${method})` }]
      : []),
  ];
  const completion: DedPriceCompletion = {
    classification,
    sourceKind: priceSourceKindFor(classification, ref.tier),
    verificationStatus: 'UNVERIFIED',
    userApprovalStatus: 'PENDING',
    recommendedPrice: ref.recommendedPrice,
    rangeMin: ref.rangeMin,
    rangeMax: ref.rangeMax,
    unit: ref.unit,
    scope: ref.scope,
    sourceName: ref.sourceName,
    sourceUrl: ref.sourceUrl,
    sourceDate: ref.sourceDate,
    accessedAt: ref.accessedAt,
    region: ref.region,
    specAssumption: ref.specAssumption,
    confidence: stale ? 'LOW' : ref.confidence,
    method,
    ahspRelated: Boolean(item.ahspCode || item.ahspMatch),
    referenceId: ref.id,
    sourceStale: stale || undefined,
    quantityBasis: prev?.quantityBasis,
    originalUnitPrice: prev?.originalUnitPrice ?? item.unitPrice,
    originalQuantity: prev?.originalQuantity ?? item.quantity,
    history,
  };
  return {
    ...item,
    unitPrice: ref.recommendedPrice,
    priceSource: 'AI_ESTIMATE',
    priceAssumptionNote: completionNoteFor(ref, stale, crossRegion),
    priceCompletion: completion,
    provenance: [...item.provenance, `ai-completion:price:${ref.id}`],
  };
}

/**
 * Terima penyelesaian pada satu item (aksi pengguna eksplisit, Tahap
 * 5): menandai blok penyelesaian + audit kuantitas sebagai APPROVED.
 * Tanpa aksi ini statusnya tetap PENDING — estimasi tidak pernah
 * dianggap disetujui diam-diam hanya karena tampil di layar.
 */
export function acceptCompletion(item: DedAiItem): DedAiItem {
  const c = item.priceCompletion;
  const qa = item.quantityAudit;
  if (!c && !qa) return item;
  return {
    ...item,
    priceCompletion: c ? { ...c, userApprovalStatus: 'APPROVED' } : c,
    quantityAudit: qa ? { ...qa, userApprovalStatus: 'APPROVED' } : qa,
    provenance: [...item.provenance, 'ai-completion:accepted'],
  };
}

/**
 * Tolak penyelesaian pada satu item (aksi pengguna): pulihkan harga &
 * kuantitas ke keadaan sebelum penyelesaian. Harga kanonis/manual tidak
 * pernah hasil penyelesaian, jadi penolakan hanya berdampak pada isian.
 */
export function rejectCompletion(item: DedAiItem): DedAiItem {
  const c = item.priceCompletion;
  if (!c) return item;
  const hadQuantityFill = item.provenance.includes('ai-completion:quantity');
  const hadPriceFill = item.provenance.some((p) => p.startsWith('ai-completion:price:'));
  if (!hadQuantityFill && !hadPriceFill) return item;
  return {
    ...item,
    unitPrice: hadPriceFill ? (c.originalUnitPrice ?? null) : item.unitPrice,
    priceSource: hadPriceFill
      ? (c.originalUnitPrice != null ? item.priceSource : 'UNRESOLVED')
      : item.priceSource,
    quantity: hadQuantityFill ? (c.originalQuantity ?? null) : item.quantity,
    quantitySource: hadQuantityFill ? 'UNRESOLVED' : item.quantitySource,
    // Blok audit kuantitas isian ikut dicabut — ia menjelaskan isian
    // yang barusan ditolak; mempertahankannya akan mengklaim jejak
    // estimasi atas kuantitas yang sudah dipulihkan.
    quantityAudit: hadQuantityFill ? undefined : item.quantityAudit,
    priceAssumptionNote: hadPriceFill
      ? 'Penyelesaian AI ditolak pengguna — harga dikembalikan ke keadaan sebelum penyelesaian.'
      : item.priceAssumptionNote,
    priceCompletion: undefined,
    provenance: [...item.provenance, 'ai-completion:rejected'],
  };
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

/**
 * Selesaikan satu batch. Satu item gagal TIDAK menghentikan batch
 * (kegagalan dicatat di laporan). Hanya berjalan untuk FULL_AI —
 * pemanggil wajib menegakkan pagar mode; fungsi ini sendiri menolak
 * mode DATABASE secara eksplisit sebagai pertahanan kedua.
 */
export function completeDedBatch(
  items: DedAiItem[],
  ctx: DedPlanContext,
  opts: CompletionOptions,
): { items: DedAiItem[]; report: DedCompletionReport } {
  const now = opts.now ?? new Date();
  const report: DedCompletionReport = {
    scanned: items.length,
    filledMarketReference: 0,
    filledAiEstimate: 0,
    quantityFilled: 0,
    officialPreserved: 0,
    existingKept: 0,
    needsQuantity: 0,
    needsClarification: 0,
    unresolved: 0,
    failures: 0,
    generatedAt: now.toISOString(),
  };
  if (opts.policy !== 'FULL_AI') {
    return { items, report };
  }
  const out = items.map((item) => {
    try {
      const before = item.quantity;
      const { item: done, outcome } = completeDedItem(item, ctx, opts);
      if (before == null && done.quantity != null) report.quantityFilled += 1;
      switch (outcome) {
        case 'FILLED_MARKET_REFERENCE': report.filledMarketReference += 1; break;
        case 'FILLED_AI_ESTIMATE': report.filledAiEstimate += 1; break;
        case 'KEPT_OFFICIAL': report.officialPreserved += 1; break;
        case 'KEPT_EXISTING': report.existingKept += 1; break;
        case 'NEEDS_QUANTITY': report.needsQuantity += 1; break;
        case 'NEEDS_CLARIFICATION': report.needsClarification += 1; break;
        case 'UNRESOLVED': report.unresolved += 1; break;
        default: break;
      }
      return done;
    } catch {
      report.failures += 1;
      return item;
    }
  });
  return { items: out, report };
}
