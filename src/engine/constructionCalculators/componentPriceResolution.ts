/**
 * COMPONENT PRICE RESOLUTION SERVICE — Fase 7 Master Repair (2026-11-06)
 * =======================================================================
 * Satu-satunya jalur penilaian harga komponen kalkulator volume.
 * QtoCalculatorView TIDAK lagi mencocokkan harga sendiri — ia mengonsumsi
 * hasil terstruktur dari service ini.
 *
 * Urutan resolusi (Master Price Coverage Completion §2, 2026-11-06):
 *   1. USER_PROVIDED — harga eksplisit dari pengguna (bila pemanggil
 *      menyediakannya), berlabel manual.
 *   2. OFFICIAL_AHSP_2026 — identitas kanonis punya pemetaan resource resmi
 *      terverifikasi → priceResolver2026 (gerbang satuan internal resolver
 *      + gerbang satuan Fase 3 di sini). Tier sumber WAJIB
 *      OFFICIAL_GOVERNMENT dan status VERIFIED; selain itu BUKAN resmi.
 *   3. OFFICIAL_HSPK_REGIONAL — tautan HSPK pemerintah daerah
 *      (regionalPrices.ts): harga resmi PEMDA, bukan AHSP nasional.
 *      Kelas ini hanya untuk provinsi proyek yang SAMA dengan provinsi
 *      sumber (atau provinsi belum diketahui, dengan penanda asumsi).
 *   4. MARKET_REFERENCE — identitas kanonis tertaut ke record katalog pasar
 *      (MASTER_PRICE_ITEMS) yang lolos gerbang satuan Fase 3, atau tautan
 *      pasar hasil riset di regionalPrices.ts (atribusi penuh), ATAU
 *      harga regional dari provinsi LAIN yang dipakai sebagai referensi
 *      lintas-wilayah (§5: ditandai crossRegion + asal wilayah eksplisit,
 *      tidak pernah diklaim lokal). Selalu berlabel pasar, tidak pernah
 *      "resmi".
 *   5. CALCULATOR_ESTIMATE — estimasi yang dideklarasikan spek kalkulator
 *      sendiri (unitPriceEstimate/rateEstimate), berlabel estimasi.
 *   6. UNRESOLVED — null. Bukan Rp0, bukan tebakan.
 *
 * Pencocokan nama `includes()` TIDAK dipakai di sini sama sekali.
 * Satu-satunya jembatan nama→record adalah registry alias terkendali
 * (canonicalResources.ts) yang entri-entrinya eksplisit dan dapat diaudit.
 */
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';
import type { PriceItem } from '../../types';
import {
  resolveCanonicalIdentity,
  type CanonicalIdentityMatch,
  type ResourceCategory,
} from './canonicalResources';
import {
  validateUnitCompatibility,
  unitAllowsPricing,
  type UnitValidation,
} from './unitCompatibility';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { SafeDecimalEngine } from '../safeDecimalEngine';
import {
  REGIONAL_PRICE_LINKS,
  type RegionalPriceLink,
  type RegionalPriceSource,
} from './regionalPrices';
import { findProvinceByName } from '../../data/indonesiaRegions';

export type ComponentPriceStatus =
  | 'RESOLVED'
  | 'INCOMPLETE'
  | 'UNRESOLVED'
  | 'UNIT_MISMATCH'
  | 'AMBIGUOUS_MAPPING';

export type ComponentPriceProvenance =
  | 'OFFICIAL_AHSP_2026'
  | 'OFFICIAL_HSPK_REGIONAL'
  | 'MARKET_REFERENCE'
  | 'USER_PROVIDED'
  | 'CALCULATOR_ESTIMATE'
  | 'UNRESOLVED';

export interface ComponentPriceInput {
  kind: ResourceCategory;
  /** Nama tampilan komponen (bukan identitas). */
  name: string;
  unit: string;
  quantity: number;
  /** Kode kanonis bila komposisi sudah membawanya (Fase 1/6). */
  resourceCode?: string;
  /** Estimasi bawaan spek kalkulator (opsional, berlabel). */
  declaredEstimate?: number | null;
  /** Harga eksplisit pengguna (opsional, berlabel manual). */
  userPrice?: number | null;
  /**
   * Provinsi proyek aktif (Project.province, nama kanonis) — dipakai
   * HANYA untuk menimbang cakupan harga regional (regionalPrices.ts).
   * Bila tidak disediakan: harga regional dipakai dengan penanda asumsi
   * (regionalPriceAssumption), TIDAK diam-diam dianggap nasional.
   */
  projectProvince?: string | null;
}

export interface ComponentPriceResult {
  /** Kode identitas kanonis; null bila identitas belum terdaftar. */
  resourceCode: string | null;
  description: string;
  unit: string;
  quantity: number;
  /** null = tidak ada harga terverifikasi. BUKAN Rp0. */
  unitPrice: number | null;
  subtotal: number | null;
  status: ComponentPriceStatus;
  provenance: ComponentPriceProvenance;
  /** Referensi sumber: id record pasar / kode resource resmi / 'CALCULATOR'. */
  sourceReference: string | null;
  unitValidation: UnitValidation | null;
  explanation: string;
  /** Alasan terstruktur bila tak berharga (untuk matriks remediasi). */
  missingReason:
    | 'NO_VERIFIED_SOURCE'
    | 'OFFICIAL_MAPPING_PENDING'
    | 'UNIT_MISMATCH'
    | 'AMBIGUOUS_MAPPING'
    | 'NO_IDENTITY'
    | null;
  /**
   * Provenance penuh sumber regional (HSPK Pemda / pasar riset) bila
   * harga berasal dari regionalPrices.ts; null untuk jalur lain.
   */
  regionalSource?: RegionalPriceSource | null;
  /**
   * true bila harga regional dipakai TANPA provinsi proyek yang
   * diketahui (asumsi wilayah sumber yang eksplisit, bukan nasional).
   */
  regionalPriceAssumption?: boolean;
  /**
   * (DEPRECATED sejak Coverage Completion §5) Dulu: tautan regional yang
   * ditolak karena provinsi berbeda. Kebijakan baru TIDAK menolak lagi —
   * harga lintas provinsi dipakai sebagai MARKET_REFERENCE bertanda
   * `crossRegion`. Field dipertahankan untuk kompatibilitas pembaca
   * lama (probe/laporan) dan selalu null dari resolver sekarang.
   */
  regionalRejected?: Array<{ provinceScope: string; publisher: string }> | null;
  /**
   * true bila harga berasal dari provinsi LAIN daripada provinsi proyek
   * dan dipakai sebagai referensi lintas-wilayah (provenance selalu
   * MARKET_REFERENCE dalam kasus ini — tidak pernah diklaim lokal).
   */
  crossRegion?: boolean;
  /** Provinsi asal harga (nama kanonis) bila harga regional/pasar riset dipakai; null untuk sumber nasional. */
  sourceRegion?: string | null;
  /** Tingkat keyakinan bukti sumber riset: VERIFIED_LIVE / INDEX_ONLY; null untuk jalur non-riset. */
  priceConfidence?: 'VERIFIED_LIVE' | 'INDEX_ONLY' | null;
}

/** Label Bahasa Indonesia per kelas provenance (Master Prompt §9). */
export const PROVENANCE_LABELS_ID: Record<ComponentPriceProvenance, string> = {
  OFFICIAL_AHSP_2026: 'Harga AHSP Nasional',
  OFFICIAL_HSPK_REGIONAL: 'Harga HSPK Daerah',
  MARKET_REFERENCE: 'Referensi Harga Pasar',
  CALCULATOR_ESTIMATE: 'Estimasi Kalkulator',
  USER_PROVIDED: 'Harga Manual Proyek',
  UNRESOLVED: 'Harga Belum Tersedia',
};

/** Catatan ringkas lintas-wilayah (§9): asal harga vs provinsi proyek. */
export function crossRegionNoteId(sourceRegion: string, projectProvince: string): string {
  return `Harga referensi berasal dari ${sourceRegion}. Belum diverifikasi sebagai harga lokal proyek ${projectProvince}.`;
}

const KIND_TO_RESOLVER_TYPE: Record<ResourceCategory, 'material' | 'labor' | 'equipment'> = {
  MATERIAL: 'material',
  LABOR: 'labor',
  EQUIPMENT: 'equipment',
};

function unresolved(
  input: ComponentPriceInput,
  resourceCode: string | null,
  status: ComponentPriceStatus,
  missingReason: ComponentPriceResult['missingReason'],
  explanation: string,
  unitValidation: UnitValidation | null = null
): ComponentPriceResult {
  return {
    resourceCode,
    description: input.name,
    unit: input.unit,
    quantity: input.quantity,
    unitPrice: null,
    subtotal: null,
    status,
    provenance: 'UNRESOLVED',
    sourceReference: null,
    unitValidation,
    explanation,
    missingReason,
  };
}

function priced(
  input: ComponentPriceInput,
  resourceCode: string | null,
  unitPrice: number,
  provenance: ComponentPriceProvenance,
  sourceReference: string | null,
  explanation: string,
  unitValidation: UnitValidation | null
): ComponentPriceResult {
  return {
    resourceCode,
    description: input.name,
    unit: input.unit,
    quantity: input.quantity,
    unitPrice,
    subtotal: SafeDecimalEngine.safeMultiply(input.quantity, unitPrice),
    status: 'RESOLVED',
    provenance,
    sourceReference,
    unitValidation,
    explanation,
    missingReason: null,
  };
}

// ---------------------------------------------------------------------------
// Resolusi harga regional (HSPK Pemda + pasar riset) — remediasi 2026-11-06,
// geografi dilunakkan oleh Master Price Coverage Completion §5 (2026-11-06).
//
// Penilaian tautan (deterministik; gerbang satuan Fase 3 selalu berlaku):
//   geoRank 0 — provinsi sumber SAMA dengan provinsi proyek → dipakai
//               sebagai kelas aslinya (HSPK daerah / pasar), lokal.
//   geoRank 1 — sumber nasional (provinceScope null) ATAU provinsi proyek
//               belum diketahui (tautan dipakai dengan penanda asumsi
//               regionalPriceAssumption; untuk scope null tanpa asumsi).
//   geoRank 2 — provinsi sumber BERBEDA dengan provinsi proyek → tautan
//               TETAP dipakai, tetapi sebagai MARKET_REFERENCE
//               lintas-wilayah: provenance diturunkan (HSPK wilayah lain
//               pun tidak diklaim resmi-lokal), crossRegion = true,
//               sourceRegion terisi, dan penjelasan memuat catatan
//               "Harga referensi berasal dari … Belum diverifikasi
//               sebagai harga lokal proyek …". Asal wilayah tidak
//               dihapus; tidak ada faktor penyesuaian yang dikarang.
// Di geoRank yang sama, HSPK mendahului pasar; urutan array adalah
// penentu terakhir (deterministik).
interface RegionalResolution {
  link: RegionalPriceLink;
  gate: UnitValidation;
  assumption: boolean;
  cross: boolean;
}

/** Provinsi kanonis dari nama bebas — null bila tidak dikenal (termasuk alias resmi seperti DKI Jakarta). */
function canonicalProvince(name: string): string | null {
  const p = findProvinceByName(name);
  return p ? p.name : null;
}

function resolveRegionalLink(
  resourceCode: string,
  input: ComponentPriceInput
): RegionalResolution | null {
  const links = REGIONAL_PRICE_LINKS.filter((l) => l.resourceCode === resourceCode);
  if (links.length === 0) return null;
  const projectCanon = input.projectProvince ? canonicalProvince(input.projectProvince) : null;
  const candidates: Array<RegionalResolution & { geo: number; kindRank: number; idx: number }> = [];
  links.forEach((link, idx) => {
    const gate = validateUnitCompatibility(input.unit, link.source.unit);
    if (!unitAllowsPricing(gate)) return;
    const scope = link.source.provinceScope;
    const kindRank = link.source.kind === 'OFFICIAL_HSPK' ? 0 : 1;
    if (scope === null) {
      candidates.push({ link, gate, assumption: false, cross: false, geo: 1, kindRank, idx });
      return;
    }
    const scopeCanon = canonicalProvince(scope);
    if (projectCanon === null) {
      // Provinsi proyek tak diketahui (atau nama provinsi tak dikenal):
      // dipakai dengan penanda asumsi — perilaku putaran 1 dipertahankan.
      candidates.push({ link, gate, assumption: true, cross: false, geo: 1, kindRank, idx });
      return;
    }
    if (scopeCanon !== null && scopeCanon === projectCanon) {
      candidates.push({ link, gate, assumption: false, cross: false, geo: 0, kindRank, idx });
      return;
    }
    // Provinsi berbeda (atau scope tak terpetakan): lintas-wilayah.
    candidates.push({ link, gate, assumption: false, cross: true, geo: 2, kindRank, idx });
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.geo - b.geo) || (a.kindRank - b.kindRank) || (a.idx - b.idx));
  const best = candidates[0];
  return { link: best.link, gate: best.gate, assumption: best.assumption, cross: best.cross };
}

/** Penjelasan hasil dari tautan regional — provenance penuh, selalu menyebut dokumen + wilayah. */
function regionalExplanation(
  input: ComponentPriceInput,
  link: RegionalPriceLink,
  gate: UnitValidation,
  assumption: boolean,
  cross: boolean,
  formatter: Intl.NumberFormat
): { explanation: string; provenance: ComponentPriceProvenance } {
  const s = link.source;
  const money = `Rp${formatter.format(s.price)}/${s.unit}`;
  const docRef = `${s.documentTitle} (${s.documentDate})`;
  const tax = s.taxNote ? ` Status pajak menurut sumber: ${s.taxNote}.` : '';
  const conf = s.confidence === 'INDEX_ONLY'
    ? ' Tingkat keyakinan sumber: INDEX ONLY — nilai berasal dari teks indeks pencarian atas dokumen/penerbit tersebut (halaman sumber tidak dibuka pada riset ini); perlakukan sebagai referensi berkepastian lebih rendah.'
    : '';
  // Keterbatasan keaslian sumber (audit 2026-11-06): diteruskan apa adanya
  // agar tampil di penjelasan hasil, bukan terkubur di registry.
  const auth = s.authenticityNote ? ` CATATAN KEASLIAN SUMBER: ${s.authenticityNote}` : '';
  if (cross) {
    // Lintas-wilayah (§5B): SELALU MARKET_REFERENCE, asal wilayah eksplisit.
    const origin = s.provinceScope ?? s.regionLabel;
    const base = s.kind === 'OFFICIAL_HSPK'
      ? `Referensi lintas-wilayah ${money} — harga resmi HSPK pemerintah daerah ${s.regionLabel} (${s.publisher}, ${docRef}) yang dipakai sebagai REFERENSI PASAR untuk proyek di luar wilayah sumbernya. Ini BUKAN harga resmi AHSP 2026 nasional dan BUKAN harga HSPK lokal proyek ini. Sumber: ${s.url} (diakses riset ${s.accessedAt}).`
      : `Referensi pasar lintas-wilayah ${money} — ${s.publisher}, daftar "${s.documentTitle}" (${s.documentDate}), wilayah ${s.regionLabel}. Bukan harga resmi. Sumber: ${s.url} (diakses riset ${s.accessedAt}).`;
    const note = input.projectProvince
      ? ` ${crossRegionNoteId(origin, input.projectProvince)} Ganti dengan penawaran lokal bila tersedia — tidak ada faktor transport/penyesuaian wilayah yang ditambahkan.`
      : '';
    const notes = [s.note, s.gradeMappingNote].filter(Boolean).join(' ');
    const conv = gate.result === 'APPROVED_CONVERSION' ? ` ${gate.reason}` : '';
    return {
      explanation: `${base}${tax}${conf}${auth}${note}${notes ? ` ${notes}` : ''}${conv}`,
      provenance: 'MARKET_REFERENCE',
    };
  }
  const base = s.kind === 'OFFICIAL_HSPK'
    ? `Harga resmi HSPK pemerintah daerah ${money} — ${s.publisher}, ${docRef}. Berlaku untuk wilayah ${s.regionLabel}. Ini harga HSPK daerah, BUKAN harga resmi AHSP 2026 nasional. Sumber: ${s.url} (diakses riset ${s.accessedAt}).`
    : `Referensi pasar ${money} — ${s.publisher}, daftar "${s.documentTitle}" (${s.documentDate}), wilayah ${s.regionLabel}. Bukan harga resmi. Sumber: ${s.url} (diakses riset ${s.accessedAt}).`;
  const conv = gate.result === 'APPROVED_CONVERSION' ? ` ${gate.reason}` : '';
  const notes = [s.note, s.gradeMappingNote].filter(Boolean).join(' ');
  const assum = assumption
    ? ` Harga regional ini dipakai karena provinsi proyek belum diketahui — ASUMSI: proyek berada di ${s.provinceScope ?? s.regionLabel}. Pilih/isi provinsi proyek agar cakupan wilayahnya terverifikasi.`
    : input.projectProvince
      ? ` Provinsi proyek (${input.projectProvince}) sesuai dengan cakupan sumber.`
      : '';
  return {
    explanation: `${base}${tax}${conf}${auth}${notes ? ` ${notes}` : ''}${conv}${assum}`,
    provenance: s.kind === 'OFFICIAL_HSPK' ? 'OFFICIAL_HSPK_REGIONAL' : 'MARKET_REFERENCE',
  };
}

/** Salin penanda regional (sumber/penanda wilayah/keyakinan) ke hasil akhir. */
function attachRegionalMarkers(result: ComponentPriceResult, regional: RegionalResolution): void {
  result.regionalSource = regional.link.source;
  result.regionalPriceAssumption = regional.assumption;
  result.crossRegion = regional.cross;
  result.sourceRegion = regional.link.source.provinceScope;
  result.priceConfidence = regional.link.source.confidence ?? null;
}

const IDR_FMT = new Intl.NumberFormat('id-ID');

/**
 * Resolusi satu komponen. Deterministik: input sama → hasil sama,
 * tanpa urutan array / kandidat-pertama yang ambigu.
 */
export function resolveComponentPrice(input: ComponentPriceInput): ComponentPriceResult {
  // Cadangan regional (remediasi 2026-11-06): diisi blok 1r bila identitas
  // punya resource resmi nasional DAN tautan regional — dipakai hanya bila
  // seluruh jalur nasional/pasar katalog gagal menghasilkan harga.
  let pendingRegional: { regional: RegionalResolution; code: string } | null = null;

  const applyRegionalFallback = (result: ComponentPriceResult): ComponentPriceResult => {
    if (result.unitPrice != null) return result;
    if (pendingRegional) {
      const { regional, code } = pendingRegional;
      const { explanation, provenance } = regionalExplanation(input, regional.link, regional.gate, regional.assumption, regional.cross, IDR_FMT);
      const s = regional.link.source;
      const unitPrice = regional.gate.priceFactor && regional.gate.priceFactor !== 1
        ? Math.round(s.price * regional.gate.priceFactor)
        : s.price;
      const fallback = priced(input, code, unitPrice, provenance,
        s.kind === 'OFFICIAL_HSPK' && !regional.cross ? `HSPK:${s.documentTitle}` : `MARKET:${s.publisher}`,
        `${explanation} (Jalur nasional tidak menghasilkan harga untuk identitas ini: ${result.explanation})`, regional.gate);
      attachRegionalMarkers(fallback, regional);
      return fallback;
    }
    return result;
  };

  // 0. Harga eksplisit pengguna — berlabel manual, tidak pernah "resmi".
  if (typeof input.userPrice === 'number' && Number.isFinite(input.userPrice)) {
    return priced(input, input.resourceCode ?? null, input.userPrice, 'USER_PROVIDED', 'USER',
      'Harga diisi eksplisit oleh pengguna (manual) — bukan harga resmi AHSP.', null);
  }

  // 1. Identitas kanonis (kode bawaan komposisi, atau registry alias).
  const identity: CanonicalIdentityMatch = resolveCanonicalIdentity({
    name: input.name,
    unit: input.unit,
    category: input.kind,
    resourceCode: input.resourceCode,
  });

  if (identity.kind === 'AMBIGUOUS') {
    return unresolved(input, null, 'AMBIGUOUS_MAPPING', 'AMBIGUOUS_MAPPING',
      `Pemetaan nama ambigu: ${identity.candidates.length} identitas kanonis plausibel ` +
      `(${identity.candidates.map((c) => c.code).join(', ')}) — tidak ada yang dipilih otomatis.`);
  }

  const resource = identity.kind === 'FOUND' ? identity.resource : null;

  const finish = (result: ComponentPriceResult): ComponentPriceResult => applyRegionalFallback(result);

  if (resource) {
    // 1r. Jalur REGIONAL (HSPK Pemda / pasar riset) — remediasi 2026-11-06.
    // HANYA menelan harga untuk komponen yang secara nasional memang belum
    // berharga: bila jalur resmi AHSP nasional akan menghasilkan harga
    // (resource resmi ada), jalur regional tidak mendahuluinya. Untuk
    // identitas tanpa resource resmi, regional berjalan sebelum pasar
    // katalog (presedensi resmi-daerah > pasar, sejalan taksonomi).
    const regional = resolveRegionalLink(resource.code, input);
    if (regional) {
      const nationalMayResolve = !!resource.officialResourceName || !!resource.officialResourceCode;
      if (!nationalMayResolve) {
        const { explanation, provenance } = regionalExplanation(input, regional.link, regional.gate, regional.assumption, regional.cross, IDR_FMT);
        const s = regional.link.source;
        const unitPrice = regional.gate.priceFactor && regional.gate.priceFactor !== 1
          ? Math.round(s.price * regional.gate.priceFactor)
          : s.price;
        const result = priced(input, resource.code, unitPrice, provenance,
          s.kind === 'OFFICIAL_HSPK' && !regional.cross ? `HSPK:${s.documentTitle}` : `MARKET:${s.publisher}`,
          explanation, regional.gate);
        attachRegionalMarkers(result, regional);
        return result;
      }
      // Nasional mungkin teresolusi: jalur nasional tetap didahulukan di
      // bawah; regional hanya cadangan bila nasional gagal (ditangani
      // pemanggil lewat fallthrough — lihat blok cadangan di akhir fungsi
      // resolveComponentPrice melalui variabel pendamping).
      pendingRegional = { regional, code: resource.code };
    }
    // 1a. Jalur RESMI: resource resmi terverifikasi lewat priceResolver2026.
    if (resource.officialResourceName || resource.officialResourceCode) {
      const res = priceResolver2026.resolveResourcePrice({
        resourceName: resource.officialResourceName ?? resource.canonicalName,
        resourceCode: resource.officialResourceCode,
        resourceType: KIND_TO_RESOLVER_TYPE[input.kind],
        unit: input.unit,
      } as Parameters<typeof priceResolver2026.resolveResourcePrice>[0]);

      if (res.status === 'RESOLVED' && res.price != null) {
        const gate = validateUnitCompatibility(input.unit, res.unit ?? '');
        const isOfficial = res.source?.tier === 'OFFICIAL_GOVERNMENT' && res.verificationStatus === 'VERIFIED';
        if (isOfficial && unitAllowsPricing(gate)) {
          const unitPrice = gate.priceFactor && gate.priceFactor !== 1
            ? Math.round(res.price * gate.priceFactor)
            : res.price;
          return finish(priced(input, resource.code, unitPrice, 'OFFICIAL_AHSP_2026',
            res.resourceCode || resource.officialResourceCode || null,
            `Harga resmi AHSP 2026 via resolver: ${res.explanation}`, gate));
        }
        if (!unitAllowsPricing(gate)) {
          // Satuan resmi tidak kompatibel: jangan berhenti bila registry
          // juga menautkan record pasar — pasar dicoba di langkah 1b.
          // Tanpa tautan pasar, ini UNIT_MISMATCH final.
          if (!resource.masterPriceItemId) {
            return finish(unresolved(input, resource.code, 'UNIT_MISMATCH', 'UNIT_MISMATCH',
              `Resource resmi ditemukan tetapi satuan tidak kompatibel. ${gate.reason}`, gate));
          }
        }
        // Resolver memberi harga dari tier non-resmi → itu referensi pasar,
        // JANGAN labeli resmi. Hanya dipakai bila gerbang satuan lolos;
        // bila tidak lolos, alur lanjut ke tautan pasar registry (1b).
        if (unitAllowsPricing(gate)) {
          return finish(priced(input, resource.code, res.price, 'MARKET_REFERENCE',
            res.resourceCode || null,
            `Harga referensi (bukan resmi) via resolver 2026: ${res.explanation}`, gate));
        }
      }
      if (res.explanation && res.explanation.includes('UNIT_MISMATCH')) {
        // Penolakan satuan oleh resolver BUKAN akhir bila registry juga
        // menautkan record pasar bersatuan cocok (kasus semen: resmi per-kg,
        // pasar per-sak) — lanjut ke 1b. Tanpa tautan pasar: estimasi
        // kalkulator berlabel didahulukan, barulah UNIT_MISMATCH final.
        if (!resource.masterPriceItemId) {
          if (typeof input.declaredEstimate === 'number' && input.declaredEstimate > 0) {
            return finish(priced(input, resource.code, input.declaredEstimate, 'CALCULATOR_ESTIMATE', 'CALCULATOR',
              `Estimasi bawaan spek kalkulator. Resolver resmi menolak satuan: ${res.explanation}`, null));
          }
          const gate = validateUnitCompatibility(input.unit, '');
          return finish(unresolved(input, resource.code, 'UNIT_MISMATCH', 'UNIT_MISMATCH',
            `Resolver resmi menolak satuan: ${res.explanation}`, gate.result === 'UNIT_UNKNOWN' ? null : gate));
        }
      }
      // Resmi belum ketemu → JANGAN diam-diam jatuh ke pasar untuk resource
      // yang kebijakan resminya diwajibkan; pasar hanya bila registry
      // secara eksplisit menautkan record pasar.
      if (!resource.masterPriceItemId) {
        // Estimasi kalkulator tetap boleh (berlabel) sebelum menyerah.
        if (typeof input.declaredEstimate === 'number' && input.declaredEstimate > 0) {
          return finish(priced(input, resource.code, input.declaredEstimate, 'CALCULATOR_ESTIMATE', 'CALCULATOR',
            `Estimasi bawaan spek kalkulator (bukan harga resmi/pasar terverifikasi). Resolver resmi: ${res.explanation}`, null));
        }
        return finish(unresolved(input, resource.code, 'UNRESOLVED', 'OFFICIAL_MAPPING_PENDING',
          `Identitas kanonis ${resource.code} terdaftar, tetapi harga resmi AHSP 2026 belum terverifikasi. ${res.explanation}`));
      }
    }

    // 1b. Jalur PASAR: record katalog tertaut eksplisit di registry.
    if (resource.masterPriceItemId) {
      const record: PriceItem | undefined = MASTER_PRICE_ITEMS.find((p) => p.id === resource.masterPriceItemId);
      if (record) {
        if (record.category !== input.kind) {
          return finish(unresolved(input, resource.code, 'UNRESOLVED', 'NO_VERIFIED_SOURCE',
            `Record pasar ${record.id} berkategori ${record.category}, komponen berkategori ${input.kind} — ditolak.`));
        }
        const gate = validateUnitCompatibility(input.unit, record.unit);
        if (!unitAllowsPricing(gate)) {
          // Record pasar tertolak satuan; estimasi kalkulator yang
          // dideklarasikan untuk satuan komponen ini tetap sah & berlabel.
          if (typeof input.declaredEstimate === 'number' && input.declaredEstimate > 0) {
            return finish(priced(input, resource.code, input.declaredEstimate, 'CALCULATOR_ESTIMATE', 'CALCULATOR',
              `Estimasi bawaan spek kalkulator. Record pasar ${record.id} tertolak gerbang satuan: ${gate.reason}`, gate));
          }
          return finish(unresolved(input, resource.code, 'UNIT_MISMATCH', 'UNIT_MISMATCH',
            `Record pasar ${record.id} (${record.name}) tertaut, tetapi ${gate.reason}`, gate));
        }
        const unitPrice = gate.priceFactor && gate.priceFactor !== 1
          ? Math.round(record.price * gate.priceFactor)
          : record.price;
        return finish(priced(input, resource.code, unitPrice, 'MARKET_REFERENCE', record.id,
          `Referensi pasar ${record.id} — ${record.name} (${record.location}, ${record.periodVersion}). Bukan harga resmi AHSP. ${gate.result === 'APPROVED_CONVERSION' ? gate.reason : ''}`, gate));
      }
    }
  }

  // 2. Estimasi bawaan kalkulator (berlabel, bukan sumber nyata).
  if (typeof input.declaredEstimate === 'number' && input.declaredEstimate > 0) {
    return finish(priced(input, resource?.code ?? input.resourceCode ?? null, input.declaredEstimate,
      'CALCULATOR_ESTIMATE', 'CALCULATOR',
      'Estimasi bawaan spek kalkulator — bukan harga resmi AHSP dan bukan record pasar terverifikasi.', null));
  }

  // 3. Menyerah dengan jujur.
  return finish(unresolved(input, resource?.code ?? null, 'UNRESOLVED',
    resource ? 'NO_VERIFIED_SOURCE' : 'NO_IDENTITY',
    resource
      ? `Identitas kanonis ${resource.code} belum memiliki sumber harga terverifikasi (resmi/pasar) yang lolos gerbang satuan.`
      : 'Komponen belum memiliki identitas kanonis terdaftar dan tidak ada sumber harga terverifikasi — harga tidak diisi (bukan Rp0).'));
}

/** Agregasi status satu kalkulator dari hasil komponennya. */
export function summarizeComponentPrices(results: ComponentPriceResult[]): {
  grandTotal: number;
  resolvedCount: number;
  unresolvedCount: number;
  unitMismatchCount: number;
  ambiguousCount: number;
  status: 'RESOLVED' | 'INCOMPLETE' | 'UNRESOLVED';
} {
  const resolved = results.filter((r) => r.unitPrice != null);
  const grandTotal = results.reduce((acc, r) => acc + (r.subtotal ?? 0), 0);
  const unresolvedCount = results.length - resolved.length;
  return {
    grandTotal,
    resolvedCount: resolved.length,
    unresolvedCount,
    unitMismatchCount: results.filter((r) => r.status === 'UNIT_MISMATCH').length,
    ambiguousCount: results.filter((r) => r.status === 'AMBIGUOUS_MAPPING').length,
    status: results.length === 0 || unresolvedCount === results.length
      ? 'UNRESOLVED'
      : unresolvedCount > 0
        ? 'INCOMPLETE'
        : 'RESOLVED',
  };
}
