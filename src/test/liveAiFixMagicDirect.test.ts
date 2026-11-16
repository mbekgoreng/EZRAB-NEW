/**
 * liveAiFixMagicDirect.test — REGRESI FAIL-2 (verifikasi live 16 Nov 2026).
 *
 * Temuan live Preview 47c7dc9: prompt "pekerjaan plesteran dinding 10 m2"
 * di modal "Rancang Pekerjaan via Magic AI" (submit langsung) TIDAK LAGI
 * menampilkan banner JSON (fix retry 15 Nov bekerja) — tetapi sarannya
 * TIDAK BISA DIPAKAI: kategori jatuh ke fallback "Pekerjaan Persiapan &
 * Bowplank", volume "Belum ditentukan — wajib diisi", "Harga Satuan:
 * Belum ada harga", total "—", tombol "Tambahkan" disabled — 0 item
 * ditambahkan. Jalur (b) "Lanjutkan di Chat AI" pada prompt yang sama
 * PASS live ([3.7.1] Rp61.465, 10 m² → Rp614.650).
 *
 * Akar penyebab (terbukti dari kode, lihat FAIL2-MAGICAI.md):
 *  (a) model mengembalikan JSON VALID tetapi isinya tidak lengkap
 *      (volume/harga null mengikuti instruksi "jangan mengarang",
 *      kategori kosong) — kategori tampil = fallback `targetCategory`
 *      (WORK_CATEGORIES[0]), bukan tebakan model;
 *  (b) jalur ini TIDAK PERNAH membaca kuantitas dari prompt dan TIDAK
 *      PERNAH me-resolve harga dari katalog/resolver resmi — satu-satunya
 *      sumber harga adalah angka `unitPrice` dari model.
 *
 * Perbaikan yang diuji di sini (magicAiSuggestion.ts + modal):
 * pengayaan deterministik memakai mesin yang SAMA dengan jalur (b):
 * parseRequestedQuantity + searchChatAhsp + buildAnswerTransfer.
 * Angka harga model DIBUANG; harga hanya dari resolver resmi; tanpa
 * padanan, saran jujur (volume prompt + harga null), bukan item rusak.
 *
 * SELURUH tes memakai KATALOG + RESOLVER NYATA (read-only) — tidak ada
 * panggilan model live / berbayar, tidak ada kunci provider.
 *
 * Jalankan: npx --yes vitest run src/test/liveAiFixMagicDirect.test.ts
 * (dari root repo ~/workspace/ezrab-unified)
 */
import { describe, it, expect } from 'vitest';
import {
  mapAiGeneratedItem,
  aiItemSaveGate,
  buildAiSuggestedRabItem,
  aiSuggestedTotalNote,
  aiSuggestedPriceDisplay,
  dropResolvedPrice,
  type AiGeneratedItemState,
} from '../components/estimator/SmartAddWorkItemModal';
import { enrichMagicAiSuggestion } from '../components/estimator/magicAiSuggestion';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';

const LIVE_PROMPT = 'pekerjaan plesteran dinding 10 m2';
/** Keadaan modal live: proyek baru tanpa item → targetCategory default. */
const FALLBACK_CATEGORY = 'Pekerjaan Persiapan & Bowplank';

/** Respons model yang paling konsisten dengan gejala live: JSON valid,
 *  volume/harga null (mengikuti "jangan mengarang"), kategori kosong. */
const LIVE_MODEL_RESPONSE = {
  description: 'Plesteran dinding',
  volume: null,
  unitPrice: null,
};

function suggest(parsed: any, prompt: string) {
  const base = mapAiGeneratedItem(parsed, {
    fallbackDescription: prompt,
    category: FALLBACK_CATEGORY,
    code: 'AI.01',
  });
  return { base, enriched: enrichMagicAiSuggestion(base, prompt) };
}

describe('FAIL-2 — repro live: plesteran 10 m2 menjadi saran yang BISA ditambahkan', () => {
  it('padanan katalog benar + volume prompt + harga resolver (bukan angka model)', () => {
    const { enriched } = suggest(LIVE_MODEL_RESPONSE, LIVE_PROMPT);
    const item = enriched.item;
    expect(enriched.matchedCode).toBe('3.7.1');
    expect(enriched.promptQuantity).toEqual({ volume: 10, unit: 'm2' });
    expect(enriched.noMatchReason).toBeNull();
    expect(item.code).toBe('3.7.1');
    expect(item.description).toBe('Pemasangan 1 m2 Plesteran 1SP : 1PP Tebal 15 mm');
    // Kategori dari KATALOG — bukan lagi fallback Persiapan & Bowplank.
    expect(item.category).toBe('DIVISI 3 - PEKERJAAN ARSITEKTUR');
    expect(item.category).not.toBe(FALLBACK_CATEGORY);
    expect(item.volume).toBe(10);
    expect(item.unit).toBe('m2');
    expect(item.unitPrice).toBe(61465);
    expect(item.notes).toContain('3.7.1');
  });

  it('provenance ter-resolve: PRICE_RESOLVED + OFFICIAL_AHSP + VERIFIED', () => {
    const { enriched } = suggest(LIVE_MODEL_RESPONSE, LIVE_PROMPT);
    const rp = enriched.item.resolvedPrice;
    expect(rp?.ahspCode).toBe('3.7.1');
    expect(rp?.priceStatus).toBe('PRICE_RESOLVED');
    expect(rp?.priceSourceKind).toBe('OFFICIAL_AHSP');
    expect(rp?.verificationStatus).toBe('VERIFIED');
    expect(rp?.priceSourceLabel).toBe('Harga resmi AHSP 2026 (komposisi lengkap)');
    expect(rp?.priceSourceExplanation).toContain('6/6 komponen');
  });

  it('gerbang simpan LOLOS tanpa konfirmasi — tombol "Tambahkan" aktif', () => {
    const { enriched } = suggest(LIVE_MODEL_RESPONSE, LIVE_PROMPT);
    expect(aiItemSaveGate(enriched.item, false)).toEqual({ ok: true });
  });

  it('payload RAB: total Rp614.650 + ahspCode + volumeSource AI_GENERATED', () => {
    const { enriched } = suggest(LIVE_MODEL_RESPONSE, LIVE_PROMPT);
    const payload = buildAiSuggestedRabItem(enriched.item, 0);
    expect(payload.no).toBe(1);
    expect(payload.code).toBe('3.7.1');
    expect(payload.ahspCode).toBe('3.7.1');
    expect(payload.volume).toBe(10);
    expect(payload.unit).toBe('m2');
    expect(payload.unitPrice).toBe(61465);
    expect(payload.amount).toBe(614650);
    expect(payload.totalPrice).toBe(614650);
    expect(payload.volumeSource).toBe('AI_GENERATED');
    expect(payload.priceStatus).toBe('PRICE_RESOLVED');
    expect(payload.priceSourceKind).toBe('OFFICIAL_AHSP');
    expect(payload.verificationStatus).toBe('VERIFIED');
    expect(payload.priceSourceLabel).toBe('Harga resmi AHSP 2026 (komposisi lengkap)');
  });

  it('factory: identitas SAFE, VERIFIED + OFFICIAL_AHSP dipertahankan', () => {
    const { enriched } = suggest(LIVE_MODEL_RESPONSE, LIVE_PROMPT);
    const rec = createRabItemRecord(buildAiSuggestedRabItem(enriched.item, 0), 'PRJ-FAIL2-TEST');
    expect(rec.ahspIdentityStatus).toBe('SAFE');
    expect(rec.priceStatus).toBe('PRICE_RESOLVED');
    expect(rec.priceSourceKind).toBe('OFFICIAL_AHSP');
    expect(rec.verificationStatus).toBe('VERIFIED');
    expect(rec.unitPrice).toBe(61465);
    expect(rec.amount).toBe(614650);
  });

  it('pratinjau: total BUKAN parsial; harga bertanda (AHSP 2026), bukan (est.)', () => {
    const { enriched } = suggest(LIVE_MODEL_RESPONSE, LIVE_PROMPT);
    const note = aiSuggestedTotalNote(enriched.item);
    expect(note).toContain('Harga resmi AHSP 2026 (3.7.1)');
    expect(note).not.toContain('PARSIAL');
    const disp = aiSuggestedPriceDisplay(enriched.item);
    expect(disp).toContain('61.465');
    expect(disp).toContain('(AHSP 2026)');
    expect(disp).not.toContain('(est.)');
  });
});

describe('FAIL-2 — angka model tidak pernah dipakai sebagai harga', () => {
  it('unitPrice model 999999 DIBUANG → harga resolver Rp61.465', () => {
    const { base, enriched } = suggest(
      { description: 'Plesteran dinding', volume: null, unitPrice: 999999 },
      LIVE_PROMPT,
    );
    expect(base.unitPrice).toBe(999999); // mapper lama tidak diubah
    expect(enriched.item.unitPrice).toBe(61465);
    expect(enriched.item.unitPrice).not.toBe(999999);
    // Base tidak dimutasi oleh pengayaan.
    expect(base.unitPrice).toBe(999999);
    expect(base.resolvedPrice).toBeUndefined();
  });

  it('tanpa padanan, angka model 999999 → harga null (bukan angka model)', () => {
    const { enriched } = suggest(
      { description: 'Xyzq abcdef', volume: null, unitPrice: 999999 },
      'pekerjaan xyzq abcdef 5 m2',
    );
    expect(enriched.matchedCode).toBeNull();
    expect(enriched.item.unitPrice).toBeNull();
    expect(enriched.item.resolvedPrice).toBeUndefined();
  });
});

describe('FAIL-2 — volume string dari model (hipotesis kedua gejala live)', () => {
  it('mapper lama menjatuhkan volume string; pengayaan memulihkan dari prompt', () => {
    const { base, enriched } = suggest(
      { description: 'Plesteran dinding', category: '', volume: '10 m2', unit: 'm2', unitPrice: '50000' },
      LIVE_PROMPT,
    );
    // Perilaku mapper yang ada TIDAK diubah: string → null.
    expect(base.volume).toBeNull();
    expect(base.unitPrice).toBeNull();
    // Pengayaan memulihkan keduanya dari sumber deterministik.
    expect(enriched.matchedCode).toBe('3.7.1');
    expect(enriched.item.volume).toBe(10);
    expect(enriched.item.unitPrice).toBe(61465);
    expect(aiItemSaveGate(enriched.item, false).ok).toBe(true);
  });
});

describe('FAIL-2 — spesifier & komposisi parsial dihormati seperti jalur (b)', () => {
  it('rasio 1:4 dari prompt → padanan 3.7.4 (bukan 3.7.1)', () => {
    const { enriched } = suggest(
      { description: 'Plesteran dinding 1:4', volume: null, unitPrice: null },
      'pekerjaan plesteran dinding campuran 1:4 10 m2',
    );
    expect(enriched.matchedCode).toBe('3.7.4');
    expect(enriched.item.volume).toBe(10);
    expect(enriched.item.resolvedPrice?.priceStatus).toBe('PRICE_RESOLVED');
  });

  it('komposisi PARSIAL → PRICE_ESTIMATED + NEEDS_VERIFICATION + label parsial', () => {
    const { enriched } = suggest(
      { description: 'Waterproofing kamar mandi', volume: null, unitPrice: null },
      'waterproofing kamar mandi 12 m2',
    );
    expect(enriched.matchedCode).toBe('3.4.1');
    expect(enriched.item.volume).toBe(12);
    expect(enriched.item.unitPrice).toBe(30775);
    expect(enriched.item.resolvedPrice?.priceStatus).toBe('PRICE_ESTIMATED');
    expect(enriched.item.resolvedPrice?.verificationStatus).toBe('NEEDS_VERIFICATION');
    expect(enriched.item.resolvedPrice?.priceSourceLabel).toContain('parsial');
    expect(aiItemSaveGate(enriched.item, false).ok).toBe(true);
    const note = aiSuggestedTotalNote(enriched.item);
    expect(note).toContain('TOTAL PARSIAL');
    expect(note).toContain('parsial');
    expect(aiSuggestedPriceDisplay(enriched.item)).toContain('(est.)');
  });
});

describe('FAIL-2 — perilaku jujur bila tidak ada padanan / tidak ada kuantitas', () => {
  it('tanpa kuantitas di mana pun → volume null, gerbang VOLUME_MISSING (tidak dikarang)', () => {
    const { enriched } = suggest(
      { description: 'Plesteran dinding', volume: null, unitPrice: null },
      'berapa harga plesteran dinding?',
    );
    expect(enriched.matchedCode).toBeNull();
    expect(enriched.noMatchReason).toBe('NO_QUANTITY');
    expect(enriched.item.volume).toBeNull();
    expect(enriched.item.unitPrice).toBeNull();
    const gate = aiItemSaveGate(enriched.item, true);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('VOLUME_MISSING');
  });

  it('satuan tak cocok (10 m3 untuk item m2) → tanpa padanan, tanpa konversi diam-diam', () => {
    const { enriched } = suggest(
      { description: 'Plesteran dinding', volume: null, unitPrice: null },
      'plesteran dinding 10 m3',
    );
    expect(enriched.matchedCode).toBeNull();
    expect(enriched.noMatchReason).toBe('NO_MATCH');
    expect(enriched.item.volume).toBe(10);
    expect(enriched.item.unit).toBe('m3');
    expect(enriched.item.unitPrice).toBeNull();
    // Volume terisi → gerbang hanya menuntut konfirmasi harga kosong.
    const blocked = aiItemSaveGate(enriched.item, false);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('PRICE_NEEDS_CONFIRMATION');
    expect(aiItemSaveGate(enriched.item, true).ok).toBe(true);
    const payload = buildAiSuggestedRabItem(enriched.item, 0);
    expect(payload.priceStatus).toBe('PRICE_UNRESOLVED');
    expect(payload.unitPrice).toBeNull();
    expect(payload.amount).toBeNull();
    expect(payload.ahspCode).toBe('');
  });

  it('kueri tanpa padanan → volume prompt terisi, harga null, deskripsi model dipertahankan', () => {
    const { enriched } = suggest(
      { description: 'Xyzq abcdef', volume: null, unitPrice: null },
      'pekerjaan xyzq abcdef 5 m2',
    );
    expect(enriched.matchedCode).toBeNull();
    expect(enriched.item.volume).toBe(5);
    expect(enriched.item.unit).toBe('m2');
    expect(enriched.item.unitPrice).toBeNull();
    expect(enriched.item.description).toBe('Xyzq abcdef');
    // Tanpa padanan, kategori fallback dipertahankan apa adanya (tidak ditebak).
    expect(enriched.item.category).toBe(FALLBACK_CATEGORY);
  });
});

describe('FAIL-2 — sumber kuantitas & kueri cadangan', () => {
  it('prompt tanpa kuantitas → volume numerik model dipakai untuk padanan', () => {
    const { enriched } = suggest(
      { description: 'Plesteran dinding', volume: 5, unit: 'm2', unitPrice: null },
      'plesteran dinding',
    );
    expect(enriched.promptQuantity).toBeNull();
    expect(enriched.effectiveQuantity).toEqual({ volume: 5, unit: 'm2' });
    expect(enriched.matchedCode).toBe('3.7.1');
    expect(enriched.item.volume).toBe(5);
    expect(enriched.item.unitPrice).toBe(61465);
  });

  it('prompt samar ("buatkan 12 m2") → deskripsi model dipakai sebagai kueri cadangan', () => {
    const { enriched } = suggest(
      { description: 'Waterproofing kamar mandi', volume: null, unitPrice: null },
      'buatkan 12 m2',
    );
    expect(enriched.matchedCode).toBe('3.4.1');
    expect(enriched.item.volume).toBe(12);
    expect(enriched.item.unitPrice).toBe(30775);
  });

  it('kuantitas prompt MENANG atas volume model yang berbeda', () => {
    const { enriched } = suggest(
      { description: 'Plesteran dinding', volume: 7, unit: 'm2', unitPrice: null },
      LIVE_PROMPT,
    );
    expect(enriched.item.volume).toBe(10);
    expect(enriched.item.unitPrice).toBe(61465);
  });
});

describe('FAIL-2 — edit pratinjau mencabut provenance ter-resolve', () => {
  it('dropResolvedPrice: provenance hilang, nilai lain utuh; payload kembali ke plafon P1', () => {
    const { enriched } = suggest(LIVE_MODEL_RESPONSE, LIVE_PROMPT);
    const edited = dropResolvedPrice(enriched.item);
    expect(edited.resolvedPrice).toBeUndefined();
    expect(edited.unitPrice).toBe(61465);
    expect(edited.volume).toBe(10);
    expect(edited.description).toBe(enriched.item.description);
    // Harga ketikan (bekas resolve) diklasifikasi sebagai estimasi —
    // bukan lagi harga resmi.
    const payload = buildAiSuggestedRabItem(edited, 0);
    expect(payload.priceStatus).toBe('PRICE_ESTIMATED');
    expect(payload.priceSourceKind).toBe('EZRAB_ASSUMPTION');
    expect(payload.priceSourceLabel).toBe('Estimasi AI');
    expect(payload.verificationStatus).toBe('NEEDS_VERIFICATION');
    expect(payload.ahspCode).toBe('');
    expect(payload.volumeSource).toBe('CALCULATOR');
  });

  it('dropResolvedPrice pada item tanpa provenance → item yang sama', () => {
    const plain: AiGeneratedItemState = {
      code: 'AI.01',
      description: 'Item biasa',
      category: 'Kategori',
      volume: 3,
      unit: 'm2',
      unitPrice: 5000,
      notes: 'x',
    };
    expect(dropResolvedPrice(plain)).toBe(plain);
  });
});

describe('FAIL-2 — kontrak P1/S9 untuk item TANPA resolvedPrice tidak berubah', () => {
  const plain = (over: Partial<AiGeneratedItemState> = {}): AiGeneratedItemState => ({
    code: 'AI.01',
    description: 'Pekerjaan plesteran dinding bata',
    category: 'Pekerjaan Dinding',
    volume: 10,
    unit: 'm²',
    unitPrice: 150000,
    notes: 'Dianalisis oleh EZRAB AI.',
    ...over,
  });

  it('harga model non-null → PRICE_ESTIMATED + EZRAB_ASSUMPTION, tidak pernah RESOLVED', () => {
    const payload = buildAiSuggestedRabItem(plain(), 0);
    expect(payload.priceStatus).toBe('PRICE_ESTIMATED');
    expect(payload.priceStatus).not.toBe('PRICE_RESOLVED');
    expect(payload.priceSourceKind).toBe('EZRAB_ASSUMPTION');
    expect(payload.priceSourceLabel).toBe('Estimasi AI');
    expect(payload.verificationStatus).toBe('NEEDS_VERIFICATION');
    expect(payload.ahspCode).toBe('');
    expect(payload.volumeSource).toBe('CALCULATOR');
  });

  it('harga null → PRICE_UNRESOLVED + null di semua medan uang', () => {
    const payload = buildAiSuggestedRabItem(plain({ unitPrice: null }), 0);
    expect(payload.priceStatus).toBe('PRICE_UNRESOLVED');
    expect(payload.unitPrice).toBeNull();
    expect(payload.amount).toBeNull();
    expect(payload.totalPrice).toBeNull();
  });

  it('catatan total + tampilan harga item biasa tidak berubah', () => {
    const note = aiSuggestedTotalNote(plain());
    expect(note).toContain('TOTAL PARSIAL');
    expect(note).toContain('estimasi AI');
    expect(note).toContain('belum terverifikasi');
    expect(note).toContain('bukan harga resmi AHSP');
    expect(aiSuggestedTotalNote(plain({ unitPrice: null }))).toContain('tidak termasuk dalam total');
    expect(aiSuggestedPriceDisplay(plain())).toContain('(est.)');
    expect(aiSuggestedPriceDisplay(plain({ unitPrice: null }))).toBe('Belum ada harga');
  });
});
