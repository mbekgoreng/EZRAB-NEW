/**
 * magicAiSuggestion — pengayaan deterministik saran Magic AI jalur langsung
 * (FAIL-2, verifikasi live 16 Nov 2026).
 *
 * Temuan live: prompt "pekerjaan plesteran dinding 10 m2" di modal
 * "Rancang Pekerjaan via Magic AI" menghasilkan saran yang tidak bisa
 * ditambahkan — kategori jatuh ke fallback "Pekerjaan Persiapan &
 * Bowplank", volume "Belum ditentukan", harga "Belum ada harga", tombol
 * "Tambahkan" disabled. Banner JSON tidak muncul (fix retry JSON 15 Nov
 * bekerja), jadi model MENGEMBALIKAN JSON valid — tetapi isinya tidak
 * lengkap: volume/harga null (model mengikuti instruksi "jangan mengarang"
 * di system prompt) dan kategori kosong. Jalur ini mempercayai model untuk
 * ketiga fakta itu dan tidak punya cadangan deterministik apa pun:
 *  - TIDAK ADA ekstraksi kuantitas dari prompt ("10 m2" tidak pernah dibaca);
 *  - TIDAK ADA resolusi harga dari katalog/resolver resmi (satu-satunya
 *    sumber harga adalah angka `unitPrice` dari model);
 *  - kategori kosong jatuh ke `targetCategory` (default WORK_CATEGORIES[0]).
 *
 * Modul MURNI ini menutup ketiga lubang itu dengan memakai MESIN YANG SAMA
 * dengan jalur (b) "Lanjutkan di Chat AI" yang sudah PASS live:
 *  - kuantitas: `parseRequestedQuantity` (chatAnswerTransfer) atas prompt
 *    pengguna — angka+satuan eksplisit, tanpa karangan;
 *  - padanan AHSP: `searchChatAhsp` (chatSearch) atas prompt (lalu deskripsi
 *    model sebagai cadangan) — pencarian katalog deterministik yang sama
 *    dengan yang dipakai Chat AI;
 *  - harga + provenance: `buildAnswerTransfer` (chatAnswerTransfer) —
 *    harga SELALU di-resolve ulang dari resolver resmi, satuan yang tidak
 *    cocok dilewati tanpa konversi diam-diam, tanpa volume tidak ada item.
 *
 * Aturan kejujuran (cermin chatAnswerTransfer):
 * - Angka harga dari MODEL DIBUANG — tidak pernah dipakai sebagai harga.
 *   Tanpa padanan katalog yang ter-resolve, harga = null ("Belum ada
 *   harga"), bukan angka model dan bukan karangan.
 * - Volume HANYA dari prompt (didahulukan) atau volume numerik yang
 *   dinyatakan model; tanpa keduanya volume tetap null dan gerbang simpan
 *   (aiItemSaveGate) tetap memblokir sampai user mengisi manual.
 * - Kategori/deskripsi/kode dari KATALOG bila ada padanan; tanpa padanan,
 *   nilai model dipertahankan apa adanya (tidak ditebak ulang).
 * - Kegagalan pencarian (throw / NOT_FOUND / satuan tak cocok) bersifat
 *   fail-closed: saran kembali tanpa padanan, tidak pernah item rusak.
 */
import { searchChatAhsp, normalizeUnit } from '../../ai-tools/ezrab-ai/chatSearch';
import {
  parseRequestedQuantity,
  buildAnswerTransfer,
  type RequestedQuantity,
} from '../../ai-tools/ezrab-ai/chatAnswerTransfer';
import type { AiGeneratedItemState } from './SmartAddWorkItemModal';

export type MagicAiNoMatchReason = 'NO_QUANTITY' | 'NO_MATCH' | 'SEARCH_FAILED';

export interface MagicAiEnrichment {
  /** Saran sesudah pengayaan (salinan baru — `base` tidak dimutasi). */
  item: AiGeneratedItemState;
  /** Kode AHSP yang dipadankan, atau null bila tidak ada padanan. */
  matchedCode: string | null;
  /** Kuantitas eksplisit dari prompt (null bila prompt tak menyebut angka+satuan). */
  promptQuantity: RequestedQuantity | null;
  /** Kuantitas efektif yang dipakai untuk padanan (prompt didahulukan,
   *  lalu volume+satuan model bila keduanya valid). */
  effectiveQuantity: RequestedQuantity | null;
  /** Alasan jujur bila tidak ada padanan (diagnosis; tidak tampil ke user). */
  noMatchReason: MagicAiNoMatchReason | null;
}

/**
 * Kuantitas efektif untuk padanan: prompt didahulukan (angka eksplisit
 * user mengalahkan tebakan model); bila prompt tak menyebut kuantitas,
 * pakai volume+satuan model bila volume numerik > 0 dan satuan
 * ternormalisasi tidak kosong. Tanpa keduanya → null (tidak dikarang).
 */
function effectiveQuantityFor(
  base: AiGeneratedItemState,
  promptQuantity: RequestedQuantity | null,
): RequestedQuantity | null {
  if (promptQuantity) return promptQuantity;
  if (typeof base.volume === 'number' && Number.isFinite(base.volume) && base.volume > 0) {
    const unit = normalizeUnit(base.unit);
    if (unit) return { volume: base.volume, unit };
  }
  return null;
}

/**
 * Perkaya saran model dengan fakta deterministik dari prompt + katalog
 * resmi. Pure (membaca katalog/resolver read-only) + exported untuk tes.
 *
 * Urutan kueri pencarian: (1) prompt pengguna — sumber kebenaran atas
 * apa yang diminta, termasuk spesifier rasio/mutu bila ada; (2) deskripsi
 * model — cadangan bila prompt terlalu samar untuk dicari (mis. "buatkan
 * 12 m2") tetapi model sudah menyebut pekerjaannya.
 */
export function enrichMagicAiSuggestion(
  base: AiGeneratedItemState,
  prompt: string,
): MagicAiEnrichment {
  const promptQuantity = parseRequestedQuantity(prompt);
  const effectiveQuantity = effectiveQuantityFor(base, promptQuantity);

  // Mulai dari salinan base. Angka harga model DIBUANG di sini — harga
  // hanya sah bila datang dari resolver resmi (di bawah); tanpa resolve,
  // unitPrice tetap null yang jujur ("Belum ada harga").
  const item: AiGeneratedItemState = { ...base, unitPrice: null };
  delete item.resolvedPrice;

  // Volume prompt menimpa volume model: angka eksplisit user menang atas
  // tebakan model (dan atas kekosongan model — kasus live).
  if (promptQuantity) {
    item.volume = promptQuantity.volume;
    item.unit = promptQuantity.unit;
  }

  if (!effectiveQuantity) {
    return {
      item,
      matchedCode: null,
      promptQuantity,
      effectiveQuantity: null,
      noMatchReason: 'NO_QUANTITY',
    };
  }

  const queries: string[] = [];
  const seen = new Set<string>();
  for (const q of [prompt, base.description]) {
    const norm = String(q ?? '').trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    queries.push(String(q).trim());
  }

  let searchFailed = false;
  for (const query of queries) {
    let codes: string[];
    try {
      const result = searchChatAhsp(query);
      if (result.outcome === 'NOT_FOUND' || result.items.length === 0) continue;
      codes = result.items.map((i) => i.code);
    } catch {
      // Kegagalan pencarian tidak boleh menggagalkan saran — coba kueri
      // berikutnya; bila semuanya gagal, saran kembali tanpa padanan.
      searchFailed = true;
      continue;
    }
    // buildAnswerTransfer = pipa yang sama dengan jalur (b): hanya item
    // teratas yang dapat dipetakan, harga resolver resmi, satuan tak cocok
    // dilewati tanpa konversi diam-diam.
    let plan: ReturnType<typeof buildAnswerTransfer>;
    try {
      plan = buildAnswerTransfer(codes, effectiveQuantity);
    } catch {
      searchFailed = true;
      continue;
    }
    if (plan.items.length === 0) continue;
    const p = plan.items[0];
    const enriched: AiGeneratedItemState = {
      ...item,
      code: p.code,
      description: p.description,
      category: p.category,
      volume: p.volume,
      unit: p.unit,
      unitPrice: p.unitPrice ?? null,
      notes: `Dipadankan ke AHSP ${p.code} — ${p.priceSourceLabel}.`,
      resolvedPrice: {
        ahspCode: p.ahspCode,
        priceStatus: p.priceStatus,
        priceSourceKind: p.priceSourceKind,
        priceSourceLabel: p.priceSourceLabel,
        priceSourceExplanation: p.priceSourceExplanation,
        verificationStatus: p.verificationStatus,
      },
    };
    return {
      item: enriched,
      matchedCode: p.code,
      promptQuantity,
      effectiveQuantity,
      noMatchReason: null,
    };
  }

  return {
    item,
    matchedCode: null,
    promptQuantity,
    effectiveQuantity,
    noMatchReason: searchFailed ? 'SEARCH_FAILED' : 'NO_MATCH',
  };
}
