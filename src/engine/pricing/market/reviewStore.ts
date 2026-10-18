/**
 * Antrean review estimator untuk referensi harga pasar (in-memory, Tahap 1).
 * ============================================================================
 * Alur: MARKET_REFERENCE/NEEDS_REVIEW → (estimator setuju) → MARKET_VERIFIED
 *     → tautkan ke price_assumptions sebagai DRAFT (sumber: referensi pasar).
 *
 * Aturan:
 * - Verifikasi WAJIB manusia + productUrl bukti (kecuali ditolak).
 * - Tidak boleh verifikasi sendiri bila pembuat = pemverifikasi? (dibolehkan di
 *   tahap ini, tapi dicatat di verifiedBy untuk audit).
 * - Perubahan harga/status menambah entri riwayat; versi lama tidak dihapus.
 * - Referensi yang sudah MARKET_VERIFIED tidak bisa diubah diam-diam menjadi
 *   resmi AHSP — tidak ada jalur ke sana di modul ini.
 */
import type {
  MarketPriceCandidate,
  MarketPriceHistoryEntry,
  MarketPriceReference,
  MarketReferenceStatus,
} from './types';
import { matchCandidate, dedupKey, type MatchNeed } from './matchingEngine';

let seq = 0;
const rid = () => `MPR-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export interface ReviewDecision {
  ok: boolean;
  reference?: MarketPriceReference;
  /** Bila disetujui: payload DRAFT untuk price_assumptions (dibuat pemanggil). */
  assumptionDraft?: {
    resourceCode: string;
    resourceName: string;
    resourceType: 'material' | 'labor' | 'equipment';
    price: number;
    unit: string;
    sourceNote: string;
    referenceDocument: string | null;
  };
  reason?: string;
}

export class MarketReviewStore {
  private refs = new Map<string, MarketPriceReference>();
  private history: MarketPriceHistoryEntry[] = [];

  /** Daftarkan kandidat → referensi baru (dedup otomatis). */
  ingest(
    need: MatchNeed,
    candidates: MarketPriceCandidate[],
    createdBy: string
  ): { added: MarketPriceReference[]; duplicates: number } {
    const added: MarketPriceReference[] = [];
    let duplicates = 0;
    const existingKeys = new Set([...this.refs.values()].map(dedupKey));
    for (const c of candidates) {
      const k = dedupKey(c);
      if (existingKeys.has(k)) { duplicates++; continue; }
      existingKeys.add(k);
      const m = matchCandidate(need, c);
      const now = new Date().toISOString();
      const ref: MarketPriceReference = {
        id: rid(),
        materialId: null,
        canonicalName: need.canonicalName,
        aliases: [],
        spec: c.spec,
        sourceName: c.sourceName,
        sourceType: c.sourceType,
        sourceProductId: c.sourceProductId ?? null,
        productUrl: c.productUrl ?? null,
        sellerName: c.sellerName ?? null,
        brand: c.brand ?? null,
        productTitle: c.productTitle,
        listedPrice: c.listedPrice,
        currency: 'IDR',
        packageQuantity: c.packageQuantity ?? null,
        packageUnit: c.packageUnit ?? null,
        normalizedUnit: need.normalizedUnit,
        normalizedUnitPrice: m.normalizedUnitPrice,
        priceType: c.priceType ?? 'normal',
        region: c.region ?? null,
        availability: c.availability ?? 'tidak_diketahui',
        verificationStatus: m.comparable ? 'MARKET_REFERENCE' : 'NEEDS_REVIEW',
        matchConfidence: m.matchConfidence,
        reviewNotes: m.comparable ? null : m.blockers.join('; '),
        verifiedBy: null,
        verifiedAt: null,
        capturedAt: now,
        lastVerifiedAt: null,
        createdBy,
        version: 1,
      };
      this.refs.set(ref.id, ref);
      this.pushHistory(ref.id, createdBy, 'created', null, ref.verificationStatus, 'kandidat didaftarkan');
      added.push(ref);
    }
    return { added, duplicates };
  }

  list(status?: MarketReferenceStatus): MarketPriceReference[] {
    const all = [...this.refs.values()];
    return status ? all.filter((r) => r.verificationStatus === status) : all;
  }

  get(id: string): MarketPriceReference | undefined {
    return this.refs.get(id);
  }

  /** Estimator menyetujui → MARKET_VERIFIED + draft price_assumption. */
  approve(id: string, by: string, resourceCode: string): ReviewDecision {
    const ref = this.refs.get(id);
    if (!ref) return { ok: false, reason: 'referensi tidak ditemukan' };
    if (ref.verificationStatus === 'MARKET_VERIFIED') {
      return { ok: false, reason: 'sudah terverifikasi; buat revisi harga bila berubah' };
    }
    if (!ref.productUrl) {
      return { ok: false, reason: 'verifikasi butuh URL bukti produk (productUrl wajib)' };
    }
    if (ref.normalizedUnitPrice === null || ref.normalizedUnitPrice <= 0) {
      return { ok: false, reason: 'harga per satuan dasar belum dapat dinormalisasi' };
    }
    const old = ref.verificationStatus;
    ref.verificationStatus = 'MARKET_VERIFIED';
    ref.verifiedBy = by;
    const now = new Date().toISOString();
    ref.verifiedAt = now;
    ref.lastVerifiedAt = now;
    ref.version += 1;
    this.pushHistory(id, by, 'status_changed', old, 'MARKET_VERIFIED', 'disetujui estimator');
    // Tautan ke price_assumptions: tetap berlabel pasar, bukan resmi.
    return {
      ok: true,
      reference: ref,
      assumptionDraft: {
        resourceCode,
        resourceName: ref.canonicalName,
        resourceType: 'material',
        price: ref.normalizedUnitPrice,
        unit: ref.normalizedUnit,
        sourceNote: `Referensi pasar terverifikasi ${ref.sourceName} (${ref.id}); tetap HARGA PASAR, bukan resmi AHSP.`,
        referenceDocument: ref.productUrl,
      },
    };
  }

  /** Estimator menolak (duplikat / tidak sebanding / indikasi palsu). */
  reject(id: string, by: string, reason: string): ReviewDecision {
    const ref = this.refs.get(id);
    if (!ref) return { ok: false, reason: 'referensi tidak ditemukan' };
    const old = ref.verificationStatus;
    ref.verificationStatus = 'REJECTED';
    ref.reviewNotes = reason;
    ref.version += 1;
    this.pushHistory(id, by, 'status_changed', old, 'REJECTED', reason);
    return { ok: true, reference: ref };
  }

  /** Perbarui harga (mis. pantauan berkala): versi naik, riwayat tercatat. */
  updatePrice(id: string, by: string, newListedPrice: number): ReviewDecision {
    const ref = this.refs.get(id);
    if (!ref || !(newListedPrice > 0)) return { ok: false, reason: 'referensi/harga tidak valid' };
    const old = String(ref.listedPrice);
    ref.listedPrice = newListedPrice;
    ref.version += 1;
    this.pushHistory(id, by, 'price_updated', old, String(newListedPrice), 'pembaruan berkala');
    return { ok: true, reference: ref };
  }

  getHistory(referenceId: string): MarketPriceHistoryEntry[] {
    return this.history.filter((h) => h.referenceId === referenceId);
  }

  private pushHistory(
    referenceId: string, by: string,
    kind: MarketPriceHistoryEntry['changeKind'],
    oldValue: string | null, newValue: string | null, note: string | null
  ) {
    this.history.push({
      id: `MPH-${Date.now().toString(36)}-${this.history.length}`,
      referenceId, changedAt: new Date().toISOString(), changedBy: by,
      changeKind: kind, oldValue, newValue, note,
    });
  }
}

export const marketReviewStore = new MarketReviewStore();
