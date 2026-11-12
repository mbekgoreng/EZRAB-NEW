/**
 * conversationSummary.ts — Ringkasan percakapan EKSTRAKTIF & DETERMINISTIK
 * (AI Intelligence Overhaul Fase 1 — Canonical Context Intelligence).
 *
 * Modul MURNI, tanpa impor: dipakai builder kanonis DAN store percakapan.
 *
 * Ringkasan BUKAN pengganti fakta proyek: fakta selalu datang dari state
 * terstruktur (structuredSpecs + intake + draft + snapshot) — ringkasan
 * hanya menggantikan riwayat mentah yang panjang agar anggaran riwayat
 * tidak menelan fakta. Ringkasan disusun dari kalimat-kalimat pengguna
 * yang membawa fakta (angka/dimensi/material/budget) + kalimat pertama
 * dan terakhir pengguna — tanpa LLM, tanpa karangan, deterministik penuh
 * (input sama → ringkasan sama).
 */

export interface ConversationSummary {
  /** Teks ringkasan (sudah ber-cap, berpenanda bila dipotong). */
  text: string;
  /** Jumlah pesan yang diringkas saat ringkasan ini dibuat. */
  messageCount: number;
  updatedAt: string;
}

export const CONVERSATION_SUMMARY_CAP = 2000;

/** Kata kunci penanda kalimat pembawa fakta (Indonesia + Inggris). */
const FACT_WORDS = [
  'budget', 'rp', 'rupiah', 'm²', 'm2', 'm3', 'm³', 'lantai', 'atap',
  'pondasi', 'material', 'dimensi', 'panjang', 'lebar', 'luas', 'tinggi',
  'dalam', 'kamar', 'gudang', 'kandang', 'jalan', 'kolam', 'drainase',
  'renovasi', 'beton', 'baja', 'genteng', 'keramik', 'granit', 'kayu',
  'harga', 'volume', 'tapak', 'denah', 'bentang', 'kapasitas', 'ekor',
  'skimmer', 'overflow', 'foot', 'bore', 'pile', 'dak', 'spandek',
  'galvalum', 'plafon', 'pintu', 'jendela', 'toilet', 'dapur', 'garasi',
  'taman', 'pagar', 'sumur', 'septic', 'listrik', 'pipa', 'cat',
];

function isFactSentence(s: string): boolean {
  const lower = ` ${s.toLowerCase()} `;
  if (/\d/.test(s)) return true; // kalimat berangka hampir selalu membawa fakta
  return FACT_WORDS.some((w) => lower.includes(w));
}

function splitSentences(content: string): string[] {
  return content
    .split(/[\n.!?]+/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => s.length >= 8 && s.length <= 400);
}

export function normalizeForDedupe(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/…\[.*?\]|…/g, '').trim();
}

/**
 * Susun ringkasan ekstraktif dari pesan-pesan (urutan kronologis).
 * Deterministik; tidak pernah mengarang kalimat baru — hanya memilih
 * kalimat yang sudah ada.
 */
export function buildExtractiveSummary(
  messages: Array<{ role: string; content: string }>,
  cap: number = CONVERSATION_SUMMARY_CAP,
): ConversationSummary {
  const userMessages = messages.filter((m) => m.role === 'user');
  const picked: string[] = [];
  const seen = new Set<string>();
  const push = (s: string): void => {
    const key = normalizeForDedupe(s);
    if (!key || seen.has(key)) return;
    seen.add(key);
    picked.push(s);
  };

  // 1) Kalimat pertama pengguna pertama = maksud awal percakapan.
  if (userMessages.length > 0) {
    const first = splitSentences(userMessages[0].content ?? '')[0];
    if (first) push(first);
  }
  // 2) Semua kalimat pembawa fakta dari pesan pengguna (kronologis).
  for (const m of userMessages) {
    for (const s of splitSentences(m.content ?? '')) {
      if (isFactSentence(s)) push(s);
    }
  }
  // 3) Kalimat pertama pesan pengguna terakhir = permintaan berjalan.
  if (userMessages.length > 1) {
    const last = splitSentences(userMessages[userMessages.length - 1].content ?? '')[0];
    if (last) push(last);
  }

  let text = picked.join(' • ');
  if (text.length > cap) {
    text = `${text.slice(0, cap)}\n…[ringkasan dipotong demi batas konteks]`;
  }
  return {
    text: text ? `Ringkasan ${messages.length} pesan: ${text}` : '',
    messageCount: messages.length,
    updatedAt: new Date().toISOString(),
  };
}
