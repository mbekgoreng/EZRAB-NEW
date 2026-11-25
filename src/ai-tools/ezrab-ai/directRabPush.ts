/**
 * directRabPush — pemetaan hasil RAB langsung (directRab) ke payload
 * Spreadsheet. Modul MURNI (tanpa React) agar bisa dites langsung.
 *
 * Aturan kejujuran harga (perbaikan 2026-10-27, keluhan "push = Rp0"):
 * payload lama tidak membawa harga sama sekali + memaksa status
 * PRICE_UNRESOLVED, sehingga factory meng-nol-kan semua item — termasuk
 * yang di tabel chat sudah berharga resmi (mis. 3.7.4). Di sini harga
 * diambil dari calc.items (sumber yang sama dengan tabel chat,
 * dicocokkan nama+wbsCode seperti formatter) dengan status jujur:
 * - OFFICIAL + harga > 0  → PRICE_RESOLVED (harga resmi, dipertahankan)
 * - BENCHMARK / fabricated + harga > 0 → PRICE_ESTIMATED +
 *   NEEDS_VERIFICATION (tampil "Perlu verifikasi", BUKAN harga resmi)
 * - tanpa harga (UNAVAILABLE/MISMATCH/UNRESOLVED/harga 0) →
 *   PRICE_UNRESOLVED (tetap Rp0 + "Harga belum diisi")
 * Tidak ada harga yang dikarang di sini — hanya yang sudah dihitung
 * mesin parametrik.
 *
 * H-09 (Fast Track, W-AUTH2): status + verifikasi di atas TIDAK LAGI
 * diklaim langsung — keduanya dirutekan lewat kontrak transfer S2
 * (transferPriceStatus / transferVerificationStatus dari universalRab,
 * cermin finalizeMapping.applyTransferContract). Sebelumnya, harga
 * engine OFFICIAL diklaim PRICE_RESOLVED TANPA priceSourceKind dan
 * TANPA verificationStatus, sehingga record mewarisi VERIFIED dari
 * default factory tanpa bukti apa pun (factory: status tak-eksplisit +
 * bukan UNRESOLVED → VERIFIED). Kini item OFFICIAL membawa kind
 * OFFICIAL_AHSP — bukti yang membuat S2 mempertahankan RESOLVED — dan
 * verificationStatus eksplisit hasil kontrak (VERIFIED untuk RESOLVED
 * berbukti; NEEDS_VERIFICATION untuk ESTIMATED/UNRESOLVED). Total
 * TIDAK berubah: S2 tidak pernah memindahkan item berharga keluar
 * total (ESTIMATED dan RESOLVED sama-sama masuk total).
 *
 * Batch 4 (§7.2) — transfer estimasi Full AI: bila hasil membawa
 * `fullAiCompletion` (salinan calc terisi dari "Lengkapi dengan Full
 * AI"), harga isian AI IKUT ter-push — sebagai PRICE_ESTIMATED +
 * NEEDS_VERIFICATION + kind EZRAB_ASSUMPTION + label/penjelasan
 * asumsi, TIDAK PERNAH sebagai RESOLVED. Aturan merge (cermin
 * penanda '(est. AI)' di formatDirectRabMessage — tabel chat dan
 * spreadsheet membaca keadaan yang sama):
 * - isian HANYA berlaku di mana calc ASLI tak berharga (harga engine
 *   yang sudah ada TIDAK PERNAH ditimpa — isian tidak menggantikan
 *   harga resmi/benchmark);
 * - volume isian HANYA berlaku bila volume calc berubah oleh
 *   completion DAN volume calc asli sama dengan kuantitas work item
 *   (delta itu murni isian — bukan selisih struktural);
 * - work item berkuantitas tak valid yang volumenya terisi completion
 *   IKUT ter-push (tabel chat menampilkannya) — selain itu filter
 *   volume lama dipertahankan persis;
 * - `calc` ASLI tidak pernah diubah (modul ini hanya MEMBACA hasil);
 *   pembatalan = tidak ada push (approval binding W11 sudah
 *   mengikat pratinjau — estimasi yang tidak ditinjau tidak
 *   tertulis); sidik binding otomatis mencakup isian karena sidik
 *   dibangun dari payload mapper ini.
 */
import type { DirectRabResult } from './directRab';
import { formatWorkItemTitle } from './workItemTitle';
import {
  transferPriceStatus,
  transferVerificationStatus,
  type TransferPriceInput,
} from './universalRab';

export type DirectRabPushPriceStatus = 'PRICE_RESOLVED' | 'PRICE_ESTIMATED' | 'PRICE_UNRESOLVED';

export interface DirectRabPushItem {
  description: string;
  volume: number;
  unit: string;
  code: string;
  category?: string;
  unitPrice?: number;
  priceStatus: DirectRabPushPriceStatus;
  verificationStatus?: 'NEEDS_VERIFICATION' | 'VERIFIED';
  volumeSource: 'AI_GENERATED';
  ahspCode?: string;
  /**
   * H-09 — provenance eksplisit (kontrak S2):
   * - harga engine OFFICIAL (PRICE_RESOLVED non-isian) → OFFICIAL_AHSP
   *   (bukti yang membuat S2 mempertahankan RESOLVED);
   * - harga isian Full AI → EZRAB_ASSUMPTION + label/penjelasan asumsi
   *   dari filledDetails (HANYA untuk isian completion);
   * - benchmark / tanpa harga → kind ABSEN (S2 menurunkannya ke
   *   ESTIMATED / UNRESOLVED). Factory meneruskan ketiganya apa adanya
   *   ke record (allowlist factory).
   */
  priceSourceKind?: 'OFFICIAL_AHSP' | 'MARKET_REFERENCE' | 'EZRAB_ASSUMPTION' | 'UNRESOLVED' | 'USER_MANUAL' | 'CUSTOM_COMPOSED';
  priceSourceLabel?: string;
  priceSourceExplanation?: string;
}

const pushItemKey = (name: string, wbsCode?: string | null): string =>
  `${name}|${wbsCode ?? ''}`;

const hasValidEnginePrice = (unitPrice: unknown): unitPrice is number =>
  typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice > 0;

/**
 * H-09 — Kontrak transfer S2 untuk satu item push direct (cermin
 * finalizeMapping.applyTransferContract): status + verifikasi TIDAK
 * diklaim langsung, melainkan diturunkan dari klaim + bukti lewat
 * transferPriceStatus / transferVerificationStatus.
 *
 * - klaim RESOLVED + kind OFFICIAL_AHSP → RESOLVED + VERIFIED;
 * - klaim ESTIMATED (benchmark / fabricated / isian AI) → ESTIMATED +
 *   NEEDS_VERIFICATION;
 * - tanpa harga valid → UNRESOLVED + NEEDS_VERIFICATION.
 * PRICE_MANUAL tidak pernah keluar dari sini (klaim tidak pernah
 * MANUAL) — cabang penyempitan hanya untuk memuaskan tipe sempit
 * DirectRabPushPriceStatus; bila suatu hari muncul, ia diturunkan ke
 * ESTIMATED (fail-closed: bukan harga resmi).
 */
function applyTransferContract(
  claimedStatus: DirectRabPushPriceStatus,
  unitPrice: number | null,
  priceSourceKind: DirectRabPushItem['priceSourceKind'],
): { priceStatus: DirectRabPushPriceStatus; verificationStatus: 'NEEDS_VERIFICATION' | 'VERIFIED' } {
  const input: TransferPriceInput = {
    priceStatus: claimedStatus,
    unitPrice,
    priceSourceKind: priceSourceKind ?? null,
  };
  const contracted = transferPriceStatus(input);
  // Fast Track P4 (tsc): transferVerificationStatus mengembalikan tipe
  // penuh VerificationStatus, sementara DirectRabPushItem memakai union
  // sempit. Input di sini tidak membawa klaim verificationStatus, jadi
  // transfer hanya mengembalikan VERIFIED untuk PRICE_RESOLVED —
  // penyempitan ini fail-closed (apa pun yang bukan VERIFIED eksplisit
  // menjadi NEEDS_VERIFICATION) dan hanya memuaskan tipe sempit.
  const verified = transferVerificationStatus(input, contracted);
  return {
    priceStatus: contracted === 'PRICE_MANUAL' ? 'PRICE_ESTIMATED' : contracted,
    verificationStatus: verified === 'VERIFIED' ? 'VERIFIED' : 'NEEDS_VERIFICATION',
  };
}

export function mapDirectRabPushItems(r: DirectRabResult): DirectRabPushItem[] {
  const calcByKey = new Map(
    r.calc.items.map((it) => [pushItemKey(it.name, it.wbsCode), it])
  );
  // Batch 4 (§7.2): salinan terisi completion (bila ada) — join dengan
  // kunci yang SAMA dengan calc (nama+wbsCode, fallback nama saja).
  // `calc` asli TIDAK PERNAH diubah di sini (hanya dibaca).
  const completed = r.fullAiCompletion?.items ?? null;
  const completedByKey = completed
    ? new Map(completed.map((it) => [pushItemKey(it.name, it.wbsCode), it]))
    : null;
  const fillDetailByDesc = new Map(
    (r.fullAiCompletion?.summary.filledDetails ?? []).map((d) => [d.description, d]),
  );
  const findCalc = (name: string, wbsCode?: string | null) =>
    calcByKey.get(pushItemKey(name, wbsCode)) ??
    r.calc.items.find((it) => it.name === name);
  const findCompleted = (name: string, wbsCode?: string | null) =>
    completedByKey?.get(pushItemKey(name, wbsCode)) ??
    completed?.find((it) => it.name === name);
  const out: DirectRabPushItem[] = [];
  for (const wi of r.generation.workItems) {
    const w: any = wi as any;
    const calc = findCalc(w.name, w.wbsCode);
    const done = findCompleted(w.name, w.wbsCode);
    const workQtyValid = Number.isFinite(w.quantity) && w.quantity > 0;
    // Volume isian kuantitas: berlaku HANYA bila volume calc berubah
    // oleh completion DAN volume calc asli sama dengan kuantitas work
    // item (delta murni isian). Work item berkuantitas tak valid yang
    // volumenya terisi completion ikut ter-push (tabel chat
    // menampilkannya); selain itu filter volume lama dipertahankan.
    let volume: number | null = workQtyValid ? w.quantity : null;
    if (
      done &&
      typeof done.volume === 'number' &&
      Number.isFinite(done.volume) &&
      done.volume > 0
    ) {
      const origVol = calc?.volume;
      if (volume == null) {
        volume = done.volume;
      } else if (
        typeof origVol === 'number' &&
        Number.isFinite(origVol) &&
        done.volume !== origVol &&
        origVol === w.quantity
      ) {
        volume = done.volume;
      }
    }
    if (volume == null) continue;
    const origPriced = calc != null && hasValidEnginePrice(calc.unitPrice);
    // Isian harga AI: HANYA di mana calc ASLI tak berharga DAN salinan
    // terisi berharga (aturan yang sama dengan penanda '(est. AI)' di
    // formatter — tabel chat dan payload membaca keadaan yang sama).
    const aiFilled =
      !origPriced && done != null && hasValidEnginePrice(done.unitPrice);
    const price = aiFilled
      ? (done as { unitPrice: number }).unitPrice
      : origPriced
        ? (calc as { unitPrice: number }).unitPrice
        : null;
    const estimated =
      aiFilled ||
      (price != null &&
        (calc?.priceStatus === 'BENCHMARK' || Boolean(w.isPriceFabricated)));
    const claimedStatus: DirectRabPushPriceStatus =
      price == null ? 'PRICE_UNRESOLVED' : estimated ? 'PRICE_ESTIMATED' : 'PRICE_RESOLVED';
    // H-09 — kind klaim: isian AI = EZRAB_ASSUMPTION; harga engine
    // OFFICIAL (RESOLVED non-isian) = OFFICIAL_AHSP; sisanya tanpa
    // kind (S2 menurunkannya sendiri).
    const claimedKind: DirectRabPushItem['priceSourceKind'] = aiFilled
      ? 'EZRAB_ASSUMPTION'
      : claimedStatus === 'PRICE_RESOLVED'
        ? 'OFFICIAL_AHSP'
        : undefined;
    const { priceStatus, verificationStatus } = applyTransferContract(claimedStatus, price, claimedKind);
    const detail = aiFilled ? fillDetailByDesc.get(w.name) : undefined;
    out.push({
      description: formatWorkItemTitle(w.name),
      volume,
      unit: w.unit,
      code: w.ahspCode ?? w.workItemId,
      category: w.category,
      ...(price != null ? { unitPrice: price } : {}),
      priceStatus,
      verificationStatus,
      volumeSource: 'AI_GENERATED' as const,
      ...(w.ahspCode ? { ahspCode: w.ahspCode } : {}),
      ...(claimedKind ? { priceSourceKind: claimedKind } : {}),
      // Isian AI TIDAK PERNAH membawa kind/label resmi — provenance
      // asumsi eksplisit (spek + dasar dari filledDetails bila ada).
      ...(aiFilled
        ? {
            priceSourceLabel: 'Estimasi AI (asumsi)',
            ...(detail
              ? { priceSourceExplanation: `Spek: ${detail.spec}. Dasar: ${detail.basis}` }
              : {}),
          }
        : {}),
    });
  }
  return out;
}

export function countPushPriceStatuses(items: Array<{ priceStatus: DirectRabPushPriceStatus }>): {
  resolved: number;
  estimated: number;
  unresolved: number;
} {
  return {
    resolved: items.filter((i) => i.priceStatus === 'PRICE_RESOLVED').length,
    estimated: items.filter((i) => i.priceStatus === 'PRICE_ESTIMATED').length,
    unresolved: items.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').length,
  };
}

/* ================================================================== */
/* W11 §11 (S1-R5) — pratinjau + pengikatan approval push direct.      */
/*                                                                     */
/* Sebelum W11, tombol "Push ke Spreadsheet RAB" menulis ke            */
/* spreadsheet dalam SATU klik tanpa pratinjau — satu-satunya jalur    */
/* transfer tanpa approval, sementara transfer universal sudah punya   */
/* preview + konfirmasi + binding (buildPushPreview /                 */
/* createTransferApprovalBinding / checkTransferApprovalBinding).      */
/* Ketiganya di sini adalah cermin pola itu untuk hasil directRab:     */
/*   - buildDirectPushPreview: ringkasan yang akan ditulis, TANPA      */
/*     menulis apa pun (hitungan + status harga + duplikat).           */
/*   - create/checkDirectPushApprovalBinding: konfirmasi hanya         */
/*     berlaku untuk hasil yang DITINJAU di pratinjau (sidik payload   */
/*     + proyek + TTL 10 menit, SAMA dengan TRANSFER_APPROVAL_TTL_MS   */
/*     di draftPersistence.ts). Tanpa binding yang sah, handler        */
/*     konfirmasi di view MENOLAK menulis.                             */
/*   - guard BLOCKED: hasil tanpa satu pun item yang dapat di-push     */
/*     (semua volume tidak valid) tidak mendapat tombol konfirmasi.    */
/* Semua fungsi di bawah MURNI (tanpa tulis apa pun).                  */
/* ================================================================== */

/** TTL approval push direct — 10 menit, SAMA dengan
 *  TRANSFER_APPROVAL_TTL_MS (draftPersistence.ts) + PLAN_TTL_MS
 *  (operations.ts). Didefinisikan lokal (bukan impor) agar modul murni
 *  ini tidak menarik graf draftPersistence/universalRab. */
export const DIRECT_PUSH_APPROVAL_TTL_MS = 10 * 60 * 1000;

export interface DirectRabPushPreview {
  /** Jumlah item payload (sesudah filter volume tidak valid). */
  itemCount: number;
  /** Item yang BELUM ada di spreadsheet (berdasarkan kode). */
  newCount: number;
  /** Item yang sudah ada di spreadsheet (akan dilewati). */
  dupCount: number;
  resolved: number;
  estimated: number;
  unresolved: number;
  /**
   * Batch 4 (§7.2) — jumlah item yang harganya berasal dari isian
   * "Lengkapi dengan Full AI" (subset dari `estimated`: estimasi AI,
   * bukan harga resmi). 0 bila hasil tanpa completion.
   */
  aiFillCount: number;
  /** Σ volume × harga satuan item BERHARGA saja (unpriced tidak masuk
   *  total — bukan Rp0). */
  estimatedTotal: number;
  /** Deskripsi item belum berharga (maks 10 tampil — jumlah sisanya
   *  disebut di pesan, bukan dibuang diam-diam). */
  unpricedItems: string[];
  /** True bila TIDAK ADA item yang dapat di-push (payload kosong). */
  blocked: boolean;
  blockReasons: string[];
}

/**
 * Preview push direct: hitungan + status harga + duplikat, tanpa
 * menulis. `existingCodes` = kode item yang sudah ada di spreadsheet
 * proyek tujuan (dibaca view dari projectRabItems) — dipakai HANYA
 * untuk hitungan pratinjau; dedup SESUNGGUHNYA tetap dihitung ulang
 * segar di handler konfirmasi.
 */
export function buildDirectPushPreview(
  r: DirectRabResult,
  existingCodes: ReadonlySet<string>,
): DirectRabPushPreview {
  const items = mapDirectRabPushItems(r);
  const counts = countPushPriceStatuses(items);
  let newCount = 0;
  for (const it of items) if (!existingCodes.has(it.code)) newCount++;
  let estimatedTotal = 0;
  // Batch 4 (§7.2): isian AI dikenali dari provenance-nya (kind
  // EZRAB_ASSUMPTION hanya ditempel mapper pada harga isian
  // completion — bukan pada estimasi benchmark engine).
  const aiFillCount = items.filter((it) => it.priceSourceKind === 'EZRAB_ASSUMPTION').length;
  const unpricedItems: string[] = [];
  for (const it of items) {
    if (it.unitPrice != null) {
      estimatedTotal += it.volume * it.unitPrice;
    } else {
      unpricedItems.push(it.description);
    }
  }
  const blocked = items.length === 0;
  return {
    itemCount: items.length,
    newCount,
    dupCount: items.length - newCount,
    resolved: counts.resolved,
    estimated: counts.estimated,
    unresolved: counts.unresolved,
    aiFillCount,
    estimatedTotal,
    unpricedItems: unpricedItems.slice(0, 10),
    blocked,
    blockReasons: blocked
      ? ['Tidak ada item RAB yang dapat di-push (semua volume tidak valid).']
      : [],
  };
}

function formatIdr(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

/** Pesan pratinjau push direct (cermin formatPushPreviewMessage). */
export function formatDirectPushPreviewMessage(
  r: DirectRabResult,
  preview: DirectRabPushPreview,
  projectName: string | null,
): string {
  const lines: string[] = [];
  lines.push(`**Preview push — RAB ${r.displayLabel} (${r.floors} lantai)**`);
  lines.push(`• Proyek tujuan: ${projectName ?? '— (belum ada proyek aktif — buat/buka proyek dulu di menu Proyek)'}`);
  lines.push(`• ${preview.itemCount} item (${preview.newCount} baru, ${preview.dupCount} sudah ada di spreadsheet dan akan dilewati)`);
  lines.push(`• Harga: ${preview.resolved} resmi AHSP, ${preview.estimated} estimasi (perlu verifikasi, bukan harga resmi), ${preview.unresolved} belum berharga`);
  if (preview.aiFillCount > 0) {
    lines.push(`• Termasuk ${preview.aiFillCount} estimasi AI dari "Lengkapi dengan Full AI" (asumsi — masuk sebagai ESTIMASI AI + Perlu verifikasi, bukan harga resmi; spek + dasar asumsi ikut tercatat di spreadsheet)`);
  }
  lines.push(`• Total estimasi item berharga: ${formatIdr(preview.estimatedTotal)}`);
  if (preview.unresolved > 0) {
    lines.push(`• Item belum berharga: ${preview.unresolved} — nilainya BELUM DAPAT DIHITUNG dan tidak masuk total (bukan Rp 0); masuk sebagai PRICE_UNRESOLVED — tetapkan di spreadsheet`);
    for (const d of preview.unpricedItems) lines.push(`  – ${d}`);
    if (preview.unresolved > preview.unpricedItems.length) {
      lines.push(`  – dan ${preview.unresolved - preview.unpricedItems.length} item lainnya`);
    }
  }
  if (preview.blocked) {
    lines.push(`• ⛔ HASIL INI DIBLOKIR UNTUK PUSH:`);
    for (const reason of preview.blockReasons) lines.push(`  – ${reason}`);
  }
  lines.push('');
  if (preview.blocked) {
    lines.push('Hasil ini TIDAK DAPAT di-push sampai ada item bervolume valid. Susun ulang RAB-nya, lalu coba lagi dari preview.');
  } else {
    lines.push('Tekan **Konfirmasi Push** untuk menulis ke Spreadsheet, atau batalkan dan perbaiki dulu di chat. Tanpa klik konfirmasi, tidak ada item yang ditulis.');
  }
  return lines.join('\n');
}

/** Sidik isi hasil direct — payload yang AKAN DITULIS (bukan objek
 *  hasil mentah yang besar): dua hasil dengan payload identik adalah
 *  push yang sama. displayLabel/floors/totalArea ikut agar hasil dari
 *  permintaan berbeda tidak pernah berbagi sidik walau payload-nya
 *  kebetulan sama. Diekspor untuk proposal transfer tak-terikat §4.5
 *  (view.tsx) — sidik yang sama dipakai approval binding. */
export function directPushFingerprint(r: DirectRabResult): string {
  return JSON.stringify({
    label: r.displayLabel,
    floors: r.floors,
    totalArea: r.totalArea,
    sourceKind: r.sourceKind,
    items: mapDirectRabPushItems(r),
  });
}

/** Approval push direct yang terikat pada SATU keadaan hasil: yang
 *  ditinjau pengguna di pratinjau. Disimpan di memori sesi saja
 *  (pendingDirectPushApprovalRef di view.tsx, pola
 *  pendingTransferApprovalRef) — TIDAK dipersist; reload membatalkan
 *  approval. */
export interface DirectPushApprovalBinding {
  /** Label hasil yang ditinjau (diagnostik — bukan kunci keamanan). */
  resultLabel: string;
  projectId: string;
  /** directPushFingerprint(hasil) saat pratinjau dibuat. */
  fingerprint: string;
  /** Date.now() saat pratinjau dibuat (dasar TTL). */
  createdAt: number;
}

export type DirectPushApprovalCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'NO_BINDING' | 'RESULT_CHANGED' | 'PROJECT_CHANGED' | 'EXPIRED';
      message: string;
    };

export function createDirectPushApprovalBinding(
  r: DirectRabResult,
  projectId: string,
  now: number = Date.now(),
): DirectPushApprovalBinding {
  return {
    resultLabel: r.displayLabel,
    projectId,
    fingerprint: directPushFingerprint(r),
    createdAt: now,
  };
}

/**
 * Periksa apakah konfirmasi push direct masih berlaku untuk hasil
 * AKTIF saat klik. Urutan cek meniru checkTransferApprovalBinding
 * (draftPersistence.ts): kedaluwarsa → proyek berganti → isi berubah.
 * Murni: tidak membaca storage, tidak menulis apa pun.
 */
export function checkDirectPushApprovalBinding(
  binding: DirectPushApprovalBinding | null,
  r: DirectRabResult | null,
  projectId: string,
  now: number = Date.now(),
): DirectPushApprovalCheck {
  if (!binding) {
    return {
      ok: false,
      reason: 'NO_BINDING',
      message:
        'Tidak ada pratinjau push yang aktif di sesi ini (pratinjau sudah dipakai, kedaluwarsa, atau sesi dimuat ulang).',
    };
  }
  if (now > binding.createdAt + DIRECT_PUSH_APPROVAL_TTL_MS) {
    return {
      ok: false,
      reason: 'EXPIRED',
      message:
        'Pratinjau push kedaluwarsa (lebih dari 10 menit). Buat pratinjau baru agar angka yang ditampilkan selalu data terbaru.',
    };
  }
  if (projectId !== binding.projectId) {
    return {
      ok: false,
      reason: 'PROJECT_CHANGED',
      message:
        'Proyek aktif sudah berganti sejak pratinjau dibuat — push DIBATALKAN agar tidak menyentuh proyek yang salah.',
    };
  }
  if (!r || directPushFingerprint(r) !== binding.fingerprint) {
    return {
      ok: false,
      reason: 'RESULT_CHANGED',
      message: 'Hasil RAB berubah sesudah pratinjau — tinjau ulang sebelum push.',
    };
  }
  return { ok: true };
}
