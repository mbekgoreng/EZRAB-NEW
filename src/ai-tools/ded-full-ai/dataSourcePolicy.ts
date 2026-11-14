/**
 * DED-RAB AI DUAL MODE — Kebijakan sumber data per mode (§7 directive,
 * keputusan koordinator C3).
 *
 * Modul MURNI dan injectable/testable: satu-satunya tempat yang menjawab
 * "mode ini boleh memakai sumber data apa?". TIDAK mengimpor adapter
 * kanonis, katalog, atau data harga apa pun — hanya tipe. Semua gerbang
 * isolasi di mesin Full AI (service, validator, result view) membaca
 * dari sini, bukan dari cabang `policy === ...` tersebar.
 *
 * Batas isolasi (C3) — DITUTUP di mode FULL_AI:
 * - D1/D2: adapter kanonis (matchDedItemToAhsp, resolveDedPriceWithCanonical)
 *   beserta seluruh hilirnya (I1–I5: officialAhspRepository, priceResolver2026,
 *   canonicalPriceResolver, canonicalUnitRegistry via adapter, karantina;
 *   J1–J5: RESOURCE_PRICE_RECORDS, harga Cipta Karya, binaMarga adapter,
 *   fallback lokasi/periode, validator/governance harga).
 * - D3: resolveCanonicalCode (konfirmasi kandidat AHSP dari UI).
 * - D10/G-IS-4: tabel harga Jakarta + harga jalan inline di prompt
 *   (penegakannya di prompt builder — milik W3; kebijakan ini hanya
 *   menyatakan TERTUTUP agar satu sumber kebenaran).
 * - D4/D6/D8: penyelesaian harga dari externalPriceReferences +
 *   validasi terhadap referensi itu.
 *
 * BOLEH TETAP di mode FULL_AI (bukan katalog harga):
 * - D5/D9: layanan kuantitas bersama (derivePlanContext, classifyQuantity,
 *   estimateMissingQuantity, buildQuantityAudit) — logika estimasi
 *   kuantitas, bukan harga.
 * - Validasi satuan via registry bersama (bukan via adapter).
 * - Spek klasifikasi WBS (WORK_CLASSIFICATION_SPEC) — taksonomi, bukan harga.
 * - D7: pita kewajaran isSaneEstimate — AMBANG ANGKA (Rp100–Rp50 M),
 *   bukan katalog; didokumentasikan sebagai pita kewajaran.
 * - D11: priceSourceKindFor — pemetaan kosakata, bukan data harga.
 * - Parser dokumen + gateway AI bersama.
 *
 * Di mode EZRAB_AI semua sumber di atas TERBUKA seperti hari ini.
 *
 * Tipe DedRabAiMode dimiliki W1 (ded-ai-estimate/dedMode.ts, keputusan C1).
 * Dua predikat gerbang (§4 B) JUGA hidup di sana dan dipakai sebagai satu
 * sumber kebenaran lewat delegasi di bawah — modul ini tidak mendefinisikan
 * ulang arti "boleh pakai katalog" agar tidak ada dua jawaban yang bisa
 * melenceng. dedMode.ts sendiri tanpa impor (modul murni), sehingga impor
 * runtime ke sana tidak menambah ketergantungan ke katalog/harga.
 */
import type { DedRabAiMode } from '../ded-ai-estimate/dedMode';
import {
  canUseCanonicalCatalog as dedModeCanUseCanonicalCatalog,
  canUseInternalPriceData as dedModeCanUseInternalPriceData,
  modeFromLegacy,
} from '../ded-ai-estimate/dedMode';
import type { DedEstimationPolicy } from './types';

/** Akses satu mode ke setiap keluarga sumber data. */
export interface DedDataSourceAccess {
  /** D1/D3 + I1–I5 + J1–J5: katalog AHSP resmi & seluruh hilirnya. */
  canonicalAhspCatalog: boolean;
  /** D2: resolusi harga lewat adapter kanonis. */
  canonicalPricing: boolean;
  /** D4/D6/D8: referensi harga pasar terkurasi EZRAB. */
  externalPriceReferences: boolean;
  /** D10: tabel harga Jakarta + harga jalan inline di prompt. */
  jakartaPriceTable: boolean;
  /** D5/D9: layanan kuantitas bersama (bukan katalog harga). */
  quantityServices: boolean;
  /** Validasi satuan via registry bersama (bukan via adapter). */
  unitRegistry: boolean;
  /** D7: pita kewajaran isSaneEstimate (ambang angka, bukan katalog). */
  sanityBand: boolean;
  /** Spek klasifikasi WBS (taksonomi, bukan harga). */
  wbsClassification: boolean;
  /** Parser dokumen DED. */
  documentParser: boolean;
  /** D11: pemetaan kosakata sumber harga. */
  priceSourceVocabulary: boolean;
}

const ALWAYS_OPEN = {
  quantityServices: true,
  unitRegistry: true,
  sanityBand: true,
  wbsClassification: true,
  documentParser: true,
  priceSourceVocabulary: true,
} as const;

/**
 * Peta akses sumber data untuk satu mode. Objek baru setiap panggilan.
 * Keempat keluarga katalog/harga dibangun dari predikat §4 B dedMode
 * (satu sumber kebenaran) — peta ini tidak pernah bisa melenceng dari
 * helper gerbang di bawah karena keduanya membaca predikat yang sama.
 */
export function dataSourceAccessFor(mode: DedRabAiMode): DedDataSourceAccess {
  return {
    canonicalAhspCatalog: dedModeCanUseCanonicalCatalog(mode),
    canonicalPricing: dedModeCanUseCanonicalCatalog(mode),
    externalPriceReferences: dedModeCanUseInternalPriceData(mode),
    jakartaPriceTable: dedModeCanUseInternalPriceData(mode),
    ...ALWAYS_OPEN,
  };
}

/**
 * Turunan mode dari policy lama — SATU aturan dengan W1 (REKONSILIASI,
 * keputusan koordinator: MESIN-menang). Fungsi ini mendelegasikan ke
 * `modeFromLegacy` di dedMode.ts (satu sumber kebenaran); sinyal mesin
 * di modul ini adalah konstanta Full AI karena modul ini hidup di dalam
 * mesin Full AI, sehingga fallback ini selalu menghasilkan FULL_AI —
 * termasuk untuk policy DATABASE (hibrida lama: mesin Full AI + policy
 * DATABASE → FULL_AI, persis seperti modeFromLegacy).
 *
 * Konsekuensi yang disengaja: pemanggil lama TANPA mode eksplisit
 * (runExecute tanpa `rabMode`, applyFullAiPricePolicy 2-argumen, hasil
 * tersimpan lama yang diturunkan dari policy) kini selalu FULL_AI —
 * adapter kanonis tergerbang untuk mereka. Perilaku EZRAB_AI di mesin
 * ini HANYA tercapai lewat mode eksplisit (`options.rabMode` /
 * argumen ke-3 gerbang). Jalur produksi tidak berubah: view.tsx
 * meneruskan `rabMode` eksplisit dan hanya memanggil mesin Full AI
 * untuk mode FULL_AI; mesin standar (EZRAB_AI) tidak memakai fallback
 * ini. Pin suite lama yang menegaskan aturan policy-menang lama
 * (dedEstimationPolicy 2.4/2.5) menegaskan perilaku yang kini
 * disupersede — pembaruan pin itu adalah keputusan koordinator,
 * bukan bagian rekonsiliasi ini.
 *
 * Parameter `policy` dipertahankan demi kompatibilitas pemanggil;
 * nilainya diteruskan ke modeFromLegacy (yang hari ini tidak
 * membacanya — mesin yang menentukan) agar bila aturan migrasi di
 * dedMode.ts kelak memakai policy, fallback ini ikut tanpa perubahan.
 */
export function modeFromPolicy(policy: DedEstimationPolicy | undefined): DedRabAiMode {
  return modeFromLegacy({ policy, fullAi: true });
}

/**
 * Mode efektif: mode eksplisit menang; bila absen, diturunkan dari policy
 * lewat modeFromPolicy (mesin-menang — lihat di atas).
 * Satu-satunya tempat aturan fallback ini tinggal.
 */
export function resolveDedRabAiMode(
  explicit: DedRabAiMode | undefined,
  policy: DedEstimationPolicy | undefined,
): DedRabAiMode {
  return explicit ?? modeFromPolicy(policy);
}

/** G-IS-1/G-IS-2: bolehkah memanggil adapter kanonis (D1/D2)? → §4 B dedMode. */
export function canUseCanonicalCatalog(mode: DedRabAiMode): boolean {
  return dedModeCanUseCanonicalCatalog(mode);
}

/**
 * G-IS-1/G-IS-2: bolehkah harga kanonis menggantikan estimasi AI (D2)?
 * Harga kanonis hanya mengalir lewat adapter → predikat yang sama dengan
 * akses katalog.
 */
export function canUseCanonicalPricing(mode: DedRabAiMode): boolean {
  return dedModeCanUseCanonicalCatalog(mode);
}

/**
 * G-IS-5/G-IS-6: bolehkah penyelesaian/validasi memakai referensi internal
 * (D4/D6/D8)? Referensi terkurasi = data harga internal EZRAB → §4 B dedMode.
 */
export function canUseExternalPriceReferences(mode: DedRabAiMode): boolean {
  return dedModeCanUseInternalPriceData(mode);
}

/** G-IS-3: bolehkah UI mengonfirmasi kandidat AHSP lewat katalog (D3)? → §4 B. */
export function canConfirmCanonicalCandidate(mode: DedRabAiMode): boolean {
  return dedModeCanUseCanonicalCatalog(mode);
}

/**
 * G-IS-4: bolehkah prompt membawa tabel harga Jakarta (D10)? Tabel itu
 * data harga internal EZRAB → §4 B dedMode. Pernyataan kebijakan untuk
 * prompt builder (milik W3) — modul ini tidak menyentuh prompt; bila
 * builder kelak membaca kebijakan ini, satu sumber kebenaran sudah ada.
 */
export function canUseJakartaPriceTable(mode: DedRabAiMode): boolean {
  return dedModeCanUseInternalPriceData(mode);
}
