/**
 * responseQualityGate.ts — GERBANG KUALITAS RESPONS (AI Intelligence
 * Overhaul FASE 7 — Response Quality & Self-Verification).
 *
 * Gerbang DETERMINISTIK yang memverifikasi jawaban Chat AI SEBELUM
 * ditampilkan. Ia menegakkan secara kode apa yang selama ini hanya
 * diminta oleh system prompt (prompt.ts v2.0.0: aturan 3/6/6a/7/10/
 * 15/17/22/26 + "ASUMSI WAJIB DILABELI" + "JANGAN mengarang kuantitas,
 * harga, kode/referensi AHSP"). Gerbang ini TIDAK PERNAH memperbaiki
 * jawaban — bila gagal, jawaban DITAHAN dan pengguna diberi pesan
 * jujur yang menyebut aturan yang dilanggar (formatQualityGateNotice).
 *
 * Modul MURNI: tanpa fetch, tanpa provider, tanpa I/O. Semua bukti
 * datang dari parameter (QualityGateEvidence) yang dirakit pemanggil
 * dari state yang sudah ada (draft aktif, konteks intake kanonis,
 * snapshot proyek, hasil tool respons ini). Bukti gate LEBIH KUAT
 * dari yang dilihat model: model tidak menerima harga item draft di
 * blok data kanonis (draftSummary hanya hitungan) dan diinstruksikan
 * memakai tool untuk angka proyek — gate membandingkan klaim model
 * dengan kebenaran dasar (ground truth) draft/snapshot, bukan dengan
 * konteks model.
 *
 * ATURAN A–J (keputusan penegakan — kejujuran lebih penting dari
 * cakupan; yang tidak dapat ditegakkan deterministik DICATAT, bukan
 * dipura-pura ditegakkan):
 *
 *  A  Angka yang diklaim ada di data yang dikutip — DITEGAKKAN
 *     SEBAGIAN: harga satuan item yang disebut untuk item draft yang
 *     dikenali harus cocok dengan harga draft (A1); angka yang
 *     dikaitkan eksplisit ke proyek/draft harus cocok dengan salah
 *     satu angka yang diketahui (A2). Angka pengetahuan umum tanpa
 *     kaitan proyek TIDAK diperiksa (tidak dapat diverifikasi
 *     deterministik; riwayat tool turn sebelumnya tidak diparse).
 *  B  Harga tak pernah dikarang/dibulatkan diam-diam — DITEGAKKAN
 *     SEBAGIAN: "dikarang" ditegakkan via A; "dibulatkan diam-diam"
 *     ditegakkan via B1 (angka yang merupakan bentuk pembulatan dari
 *     angka yang diketahui — selisih relatif ≤10% + cocok pada satu
 *     unit pembulatan — tanpa label sekitar/estimasi/dibulatkan).
 *  C  Status harga dinyatakan jujur — DITEGAKKAN: harga untuk item
 *     PRICE_UNRESOLVED (C1); klaim "semua harga lengkap/total final"
 *     pada draft PARSIAL (C2); harga ESTIMASI/pasar/asumsi tanpa
 *     label (C3); total Rp0 padahal item ada (C4).
 *  D  Spek user tidak diubah/ditambah diam-diam — DITEGAKKAN
 *     SEBAGIAN: klaim numerik (lantai/luas/dimensi/volume/budget/
 *     kamar/ekor) yang bertentangan dengan spek CONFIRMED atau
 *     dimensi intake (D1); material atap/pondasi yang bertentangan
 *     dengan spek CONFIRMED (D2, pasangan material terbatas).
 *     Penambahan spek ditangani aturan I. Kontradiksi-diri dalam
 *     satu jawaban TIDAK ditegakkan (ambiguitas multi-gedung).
 *  E  Konflik spek tidak diselesaikan diam-diam — DITEGAKKAN:
 *     konflik dihitung deterministik via detectTechnicalConflicts
 *     pada data intake/draft; bila ada konflik dan jawaban menegaskan
 *     nilai pada dimensi yang berkonflik tanpa menyebut konfliknya
 *     (atau bertanya) → pelanggaran. Tanpa konflik terdeteksi,
 *     aturan tidak berlaku (dicatat, bukan dianggap lolos).
 *  F  Unit tidak dicampur — DITEGAKKAN SEBAGIAN: klaim spek dengan
 *     satuan yang salah untuk jenis kuantitasnya (luas dalam "m",
 *     panjang dalam "m²") (F1); klaim konversi antar-satuan yang
 *     salah hitung atau lintas dimensi (F2). Pencampuran unit dalam
 *     prosa bebas tanpa kaitan spek TIDAK ditegakkan.
 *  G  Total konsisten dengan item — DITEGAKKAN: total klaim harus
 *     cocok dengan salah satu total yang diketahui (G2); total pada
 *     tabel/jumlah eksplisit harus sama dengan jumlah barisnya (G1 —
 *     hanya tabel/jumlah eksplisit, BUKAN prosa, agar harga satuan
 *     tidak keliru dihitung sebagai jumlah baris). Subtotal TIDAK
 *     diperiksa (pemetaan seksi tidak tersedia di bukti).
 *  H  Klaim AHSP resmi hanya bila provenans resmi ada — DITEGAKKAN:
 *     klaim resmi untuk item draft yang sumbernya bukan OFFICIAL_AHSP
 *     (H1); klaim menyeluruh "semua harga AHSP" pada draft campuran/
 *     parsial (H2); kode AHSP yang dikutip tidak cocok dengan kode
 *     item (H3). Klaim AHSP untuk item DI LUAR draft tidak
 *     ditegakkan (bisa berasal dari hasil tool turn sebelumnya).
 *  I  Asumsi berlabel eksplisit — DITEGAKKAN SEBAGIAN: klaim
 *     proyek pada field spek yang TIDAK DIKETAHUI (penambahan diam-
 *     diam) tanpa label asumsi/estimasi → pelanggaran (I1 — numerik
 *     + material atap/pondasi). Label TIDAK memaafkan angka yang
 *     bertentangan dengan bukti (aturan A/D/G tetap berlaku).
 *  J  Jawaban tidak mengklaim tindakan yang tidak terjadi —
 *     DITEGAKKAN: klaim selesai atas draft (J-draft), transfer ke
 *     Spreadsheet/proyek (J-transfer), perubahan item (J-change —
 *     selalu pelanggaran: propose_* hanya pratinjau, tidak ada tool
 *     yang mengeksekusi mutasi), pencarian/pengecekan data
 *     (J-search — butuh tool baca yang sukses pada respons ini),
 *     pembuatan proyek (J-project). J memverifikasi KEADAAN, bukan
 *     agensi (draft yang memang ada = klaim "draft sudah tersusun"
 *     benar, siapa pun yang menyusunnya). Klaim hitungan ("sudah
 *     saya hitung") TIDAK ditegakkan (tidak dapat dibedakan dari
 *     hitungan turn sebelumnya tanpa riwayat) — angkanya tetap
 *     diperiksa aturan A/G.
 *
 * SEMANTIK PUTUSAN: satu tingkat keparahan — semua pelanggaran
 * menahan jawaban (tidak ada tier peringatan di Fase 7; tier
 * peringatan butuh desain UI tersendiri). `checked` mencatat aturan
 * yang benar-benar dievaluasi; `notApplicable` mencatat aturan yang
 * dilewati karena bukti tidak tersedia — keduanya jujur, bukan
 * "lolos diam-diam". Perbandingan angka rupiah memakai toleransi
 * < Rp 1 (figuresEqual): selisih pecahan adalah artefak float dari
 * volume desimal × harga, bukan selisih nyata — jawaban yang
 * mengutip total pecahan sebagai bilangan bulat tidak ditahan.
 *
 * FAIL-OPEN: bila gate sendiri melempar (bug), pemanggil WAJIB
 * menampilkan jawaban + mencatat error — gate adalah lapisan
 * kualitas, bukan batas keamanan; crash gate tidak boleh memblokir
 * chat. Fungsi-fungsi di sini ditulis defensif (null-safe) dan
 * adapter membungkus deteksi konflik dalam try/catch.
 */

import type { UniversalDraft } from './universalRab';
import { effectiveItems, computeTotals } from './universalRab';
import type { UniversalIntakeContext } from './universalIntake';
import type { StructuredSpec } from './structuredSpec';
import type { TechnicalConflict } from './technicalConflicts';
import { detectTechnicalConflicts } from './technicalConflicts';
import type { ProjectSnapshot } from './projectContext';
import type { EzrabAiToolResult } from './types';

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

export type QualityRuleId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export const QUALITY_RULE_TITLES: Record<QualityRuleId, string> = {
  A: 'Angka tidak cocok dengan data',
  B: 'Harga dibulatkan diam-diam',
  C: 'Status harga tidak jujur',
  D: 'Spek diubah diam-diam',
  E: 'Konflik spek diselesaikan diam-diam',
  F: 'Satuan tercampur',
  G: 'Total tidak konsisten',
  H: 'Klaim AHSP resmi tanpa provenans',
  I: 'Asumsi tanpa label',
  J: 'Klaim tindakan yang tidak terjadi',
};

export interface QualityGateViolation {
  rule: QualityRuleId;
  /** Kode cek spesifik, mis. 'A1', 'G2'. */
  check: string;
  detail: string;
}

export interface QualityGateVerdict {
  passed: boolean;
  violations: QualityGateViolation[];
  /** Aturan yang benar-benar dievaluasi (bukti tersedia). */
  checked: QualityRuleId[];
  /** Aturan yang dilewati karena bukti tidak tersedia. */
  notApplicable: QualityRuleId[];
}

export type QualityPriceStatus =
  | 'PRICE_RESOLVED'
  | 'PRICE_UNRESOLVED'
  | 'PRICE_ESTIMATED'
  | 'PRICE_MANUAL';

export type QualityPriceSourceKind =
  | 'OFFICIAL_AHSP'
  | 'MARKET_REFERENCE'
  | 'EZRAB_ASSUMPTION'
  | 'UNRESOLVED';

export interface QualityGateItem {
  description: string;
  volume: number;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  priceStatus: QualityPriceStatus | null;
  priceSourceKind: QualityPriceSourceKind | null;
  ahspCode: string | null;
}

export interface QualityGateSpec {
  key: string;
  label: string;
  kind: 'material' | 'dimension' | 'count' | 'scope' | 'quality' | 'condition';
  value: string | number;
  unit?: string;
  status: 'CONFIRMED' | 'ASSUMPTION' | 'RECOMMENDATION' | 'UNRESOLVED';
}

export interface QualityGateDimensions {
  landAreaM2: number | null;
  buildingAreaM2: number | null;
  lengthM: number | null;
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  spanM: number | null;
  volumeM3: number | null;
  floors: number | null;
}

export interface QualityGateEvidence {
  hasDraft: boolean;
  draftTitle: string | null;
  draftVersion: number | null;
  items: QualityGateItem[];
  totals: {
    estimatedTotal: number;
    verifiedTotal: number;
    databaseTotal: number;
    marketTotal: number;
    manualTotal: number;
    unpricedCount: number;
    needsSpecCount: number;
    status: 'PARSIAL' | 'ESTIMASI' | 'LENGKAP';
  } | null;
  projectTotals: {
    totalDirect: number;
    grandTotal: number;
    subtotalBeforeTax: number;
    directCost: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
  } | null;
  projectHasItems: boolean;
  specs: QualityGateSpec[];
  dimensions: QualityGateDimensions;
  budgetCap: number | null;
  conflicts: TechnicalConflict[];
  /** Tool yang benar-benar dieksekusi pada respons ini (aturan J). */
  toolResults: Array<{ toolName: string; ok: boolean }>;
  /** Draft ini sudah pernah ditransfer (receipt cocok versi + proyek). */
  hasTransferReceipt: boolean;
}

/** Bukti kosong — percakapan umum tanpa draft/spek/proyek. */
export function emptyQualityGateEvidence(): QualityGateEvidence {
  return {
    hasDraft: false,
    draftTitle: null,
    draftVersion: null,
    items: [],
    totals: null,
    projectTotals: null,
    projectHasItems: false,
    specs: [],
    dimensions: {
      landAreaM2: null,
      buildingAreaM2: null,
      lengthM: null,
      widthM: null,
      depthM: null,
      heightM: null,
      spanM: null,
      volumeM3: null,
      floors: null,
    },
    budgetCap: null,
    conflicts: [],
    toolResults: [],
    hasTransferReceipt: false,
  };
}

/* ------------------------------------------------------------------ */
/* Parsing angka Indonesia                                             */
/* ------------------------------------------------------------------ */

/**
 * Parse angka format Indonesia: "1.250.000" → 1250000; "1,25" → 1.25;
 * "1.5" → 1.5 (titik diikuti 1–2 digit = desimal); "12.750" → 12750
 * (titik diikuti tepat 3 digit = ribuan). Bentuk ambigu ("1.250.5")
 * mengembalikan null — jangan tebak.
 */
export function parseIdNumber(raw: string): number | null {
  let s = (raw || '').trim().replace(/[.,]+$/, '');
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  if (s.includes(',')) {
    // Koma = desimal; titik sebelum koma = ribuan.
    const [intPart, ...decParts] = s.split(',');
    const dec = decParts.join('');
    const intNorm = intPart.replace(/\./g, '');
    if (intNorm === '' && dec === '') return null;
    const n = Number(`${intNorm || '0'}.${dec || '0'}`);
    return Number.isFinite(n) ? n : null;
  }
  const parts = s.split('.');
  if (parts.length === 1) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const allThousands = parts.slice(1).every((p) => p.length === 3);
  if (allThousands) {
    const n = Number(parts.join(''));
    return Number.isFinite(n) ? n : null;
  }
  if (parts.length === 2) {
    const n = Number(`${parts[0]}.${parts[1]}`);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function rupiahMultiplier(unit: string | undefined | null): number {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === 'miliar' || u === 'milyar') return 1_000_000_000;
  if (u === 'juta' || u === 'jt') return 1_000_000;
  if (u === 'ribu' || u === 'rb') return 1_000;
  return 1;
}

/**
 * Apakah `claimed` adalah bentuk pembulatan dari `known`? Syarat:
 * cocok pada satu unit pembulatan (round/floor/ceil) DAN selisih
 * relatif ≤10% (batas eksplisit: "Rp 100 ribu" untuk Rp 135.600
 * bukan pembulatan yang jujur — itu angka yang salah).
 */
export function isRoundedForm(claimed: number, known: number): boolean {
  if (!Number.isFinite(claimed) || !Number.isFinite(known)) return false;
  if (claimed === known || known <= 0 || claimed <= 0) return false;
  if (Math.abs(claimed - known) / known > 0.1) return false;
  const units = [10, 100, 1000, 10000, 100000, 1000000, 10000000];
  for (const u of units) {
    if (Math.round(known / u) * u === claimed) return true;
    if (Math.floor(known / u) * u === claimed) return true;
    if (Math.ceil(known / u) * u === claimed) return true;
  }
  return false;
}

/** Format rupiah ringkas untuk pesan detail (tanpa desimal). */
export function formatGateRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/**
 * Kesamaan angka rupiah: selisih < Rp 1 dianggap sama. Rupiah tidak
 * punya subunit yang dipakai (sen sudah mati) — selisih pecahan
 * adalah artefak float dari volume desimal × harga (mis. total draft
 * 238.669.438,8), bukan selisih nyata. Tanpa ini, jawaban yang
 * mengutip total yang benar sebagai bilangan bulat ("Rp 238.669.439")
 * akan keliru ditahan.
 */
export function figuresEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

/* ------------------------------------------------------------------ */
/* Kalimat & label                                                     */
/* ------------------------------------------------------------------ */

/** Label estimasi/asumsi/pembulatan yang membuat klaim angka jujur. */
export const ESTIMATE_LABEL_RE =
  /\b(asumsi|diasumsikan|estimasi|diestimasi|perkiraan|diperkirakan|sekitar|kira-kira|kurang\s+lebih|dibulatkan|pembulatan|ilustrasi|contoh|konseptual|bukan\s+harga\s+resmi|harga\s+pasar|pasaran|rentang|antara)\b|±/i;

/** Penanda rekomendasi/saran — bukan penegasan fakta (aturan I). */
const RECOMMENDATION_MARKER_RE =
  /\b(sebaiknya|disarankan|saran|rekomendasi|idealnya|cocok|bisa|dapat|kira-kira|sekitar|estimasi|asumsi|perkiraan|contoh|misal|alternatif|opsi|pilihan)\b/i;

export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

/**
 * Bagi teks menjadi kalimat. Titik di antara dua digit ("1.250.000",
 * "3.1.3.8") BUKAN batas kalimat. Baris baru selalu batas.
 */
export function splitSentences(text: string): SentenceSpan[] {
  const out: SentenceSpan[] = [];
  let start = 0;
  const isBoundary = (i: number): boolean => {
    const ch = text[i];
    if (ch === '\n') return true;
    if (ch === '!' || ch === '?') return true;
    if (ch === '.') {
      const prev = text[i - 1] ?? '';
      const next = text[i + 1] ?? '';
      if (/\d/.test(prev) && /\d/.test(next)) return false;
      return true;
    }
    return false;
  };
  for (let i = 0; i < text.length; i++) {
    if (isBoundary(i)) {
      const end = i + 1;
      const chunk = text.slice(start, end);
      if (chunk.trim()) out.push({ text: chunk, start, end });
      start = end;
    }
  }
  const tail = text.slice(start);
  if (tail.trim()) out.push({ text: tail, start, end: text.length });
  return out;
}

function sentenceAt(sentences: SentenceSpan[], index: number): SentenceSpan | null {
  for (const s of sentences) {
    if (index >= s.start && index < s.end) return s;
  }
  return sentences.length ? sentences[sentences.length - 1] : null;
}

function hasLabel(sentenceText: string): boolean {
  return ESTIMATE_LABEL_RE.test(sentenceText);
}

/* ------------------------------------------------------------------ */
/* Ekstraksi klaim dari jawaban                                        */
/* ------------------------------------------------------------------ */

export interface RupiahFigure {
  value: number;
  raw: string;
  sentence: string;
  index: number;
  labeled: boolean;
}

const RUPIAH_FIGURE_RE =
  /Rp\.?\s*([\d.,]+)\s*(miliar|milyar|juta|jt|ribu|rb)?\b/gi;

/** Semua angka Rupiah ("Rp …") beserta kalimat konteksnya. */
export function extractRupiahFigures(text: string): RupiahFigure[] {
  const sentences = splitSentences(text);
  const out: RupiahFigure[] = [];
  for (const m of text.matchAll(RUPIAH_FIGURE_RE)) {
    const base = parseIdNumber(m[1]);
    if (base == null) continue;
    const value = base * rupiahMultiplier(m[2]);
    if (!Number.isFinite(value)) continue;
    const sent = sentenceAt(sentences, m.index ?? 0);
    const sentenceText = sent ? sent.text : '';
    out.push({
      value,
      raw: m[0],
      sentence: sentenceText,
      index: m.index ?? 0,
      labeled: hasLabel(sentenceText),
    });
  }
  return out;
}

/** Field spek yang dilacak gerbang (klaim numerik yang dapat diperiksa). */
export type SpecField =
  | 'floors'
  | 'buildingArea'
  | 'landArea'
  | 'length'
  | 'width'
  | 'depth'
  | 'height'
  | 'span'
  | 'volume'
  | 'budget'
  | 'bedrooms'
  | 'capacity';

export const SPEC_FIELD_LABELS: Record<SpecField, string> = {
  floors: 'jumlah lantai',
  buildingArea: 'luas bangunan',
  landArea: 'luas tanah',
  length: 'panjang',
  width: 'lebar',
  depth: 'kedalaman',
  height: 'tinggi',
  span: 'bentang',
  volume: 'volume',
  budget: 'budget',
  bedrooms: 'jumlah kamar tidur',
  capacity: 'kapasitas kandang',
};

/** Satuan yang benar per field (null = tanpa satuan / hitungan). */
export const SPEC_FIELD_UNITS: Record<SpecField, 'm2' | 'm' | 'm3' | 'Rp' | null> = {
  floors: null,
  buildingArea: 'm2',
  landArea: 'm2',
  length: 'm',
  width: 'm',
  depth: 'm',
  height: 'm',
  span: 'm',
  volume: 'm3',
  budget: 'Rp',
  bedrooms: null,
  capacity: null,
};

export interface SpecClaim {
  field: SpecField;
  value: number;
  /** Satuan yang ditulis jawaban ('m2' | 'm' | 'm3' | 'Rp' | null). */
  unit: 'm2' | 'm' | 'm3' | 'Rp' | null;
  raw: string;
  sentence: string;
  index: number;
  labeled: boolean;
}

function normalizeUnitToken(u: string | undefined | null): 'm2' | 'm' | 'm3' | null {
  if (!u) return null;
  const t = u.toLowerCase().replace(/\s+/g, ' ').trim();
  if (t === 'm²' || t === 'm2' || t === 'meter persegi') return 'm2';
  if (t === 'm³' || t === 'm3' || t === 'meter kubik') return 'm3';
  if (t === 'm' || t === 'meter') return 'm';
  return null;
}

/**
 * Klaim spek numerik: "2 lantai", "luas bangunan 150 m²", "panjang
 * 17 m", "budget Rp 300 juta", "3 kamar tidur", "20 ekor", dan
 * pasangan dimensi "17 m x 9 m" (hanya bila kalimatnya berjangkar
 * dimensi bangunan — "ukuran/dimensi/tapak/bangunan/rumah/gedung/
 * kandang" — agar "sloof 2 m x 3 m" tidak keliru dibaca sebagai
 * dimensi bangunan).
 */
export function extractSpecClaims(text: string): SpecClaim[] {
  const sentences = splitSentences(text);
  const out: SpecClaim[] = [];
  const push = (
    field: SpecField,
    value: number | null,
    unit: 'm2' | 'm' | 'm3' | 'Rp' | null,
    raw: string,
    index: number,
  ) => {
    if (value == null || !Number.isFinite(value)) return;
    const sent = sentenceAt(sentences, index);
    const sentenceText = sent ? sent.text : '';
    out.push({ field, value, unit, raw, sentence: sentenceText, index, labeled: hasLabel(sentenceText) });
  };

  const areaUnit = '(m²|m2|meter\\s*persegi|m\\b)';
  const lenUnit = '(m²|m2|m³|m3|meter\\s*persegi|meter\\s*kubik|meter|m\\b)';
  // Kata estimasi yang boleh muncul di antara label dan angka
  // ("Luas bangunan sekitar 120 m²") — klaim tetap diekstrak (dan
  // tetap dinilai; label tidak memaafkan angka yang salah, aturan I).
  const estWords = '(?:sekitar\\s+|kira-kira\\s+|kurang\\s+lebih\\s+)?';
  const patterns: Array<{
    field: SpecField;
    re: RegExp;
    unitFrom: (m: RegExpMatchArray) => 'm2' | 'm' | 'm3' | 'Rp' | null;
    valueFrom: (m: RegExpMatchArray) => number | null;
  }> = [
    {
      field: 'floors',
      re: /(\d+(?:[.,]\d+)?)\s*lantai\b/gi,
      unitFrom: () => null,
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'floors',
      re: /berlantai\s*(\d+(?:[.,]\d+)?)/gi,
      unitFrom: () => null,
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'landArea',
      re: new RegExp(`luas\\s*tanah\\s*:?\\s*${estWords}([\\d.,]+)\\s*${areaUnit}`, 'gi'),
      unitFrom: (m) => normalizeUnitToken(m[2]),
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'buildingArea',
      re: new RegExp(`luas\\s*(?:bangunan|lantai|rumah|gedung|total)?\\s*:?\\s*${estWords}([\\d.,]+)\\s*${areaUnit}`, 'gi'),
      unitFrom: (m) => normalizeUnitToken(m[2]),
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'length',
      re: new RegExp(`panjang\\s*:?\\s*${estWords}([\\d.,]+)\\s*${lenUnit}`, 'gi'),
      unitFrom: (m) => normalizeUnitToken(m[2]),
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'width',
      re: new RegExp(`lebar\\s*:?\\s*${estWords}([\\d.,]+)\\s*${lenUnit}`, 'gi'),
      unitFrom: (m) => normalizeUnitToken(m[2]),
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'height',
      re: new RegExp(`tinggi\\s*:?\\s*${estWords}([\\d.,]+)\\s*${lenUnit}`, 'gi'),
      unitFrom: (m) => normalizeUnitToken(m[2]),
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'depth',
      re: new RegExp(`(?:kedalaman|dalam)\\s*:?\\s*${estWords}([\\d.,]+)\\s*${lenUnit}`, 'gi'),
      unitFrom: (m) => normalizeUnitToken(m[2]),
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'span',
      re: new RegExp(`bentang\\s*:?\\s*${estWords}([\\d.,]+)\\s*${lenUnit}`, 'gi'),
      unitFrom: (m) => normalizeUnitToken(m[2]),
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'volume',
      re: new RegExp(`volume\\s*:?\\s*${estWords}([\\d.,]+)\\s*(m³|m3|m²|m2|meter\\s*kubik|meter\\s*persegi|liter|lt|meter|m\\b)`, 'gi'),
      unitFrom: (m) => {
        const t = (m[2] || '').toLowerCase();
        if (t === 'liter' || t === 'lt') return 'm3'; // liter = satuan volume yang sah (1 m³ = 1000 L)
        return normalizeUnitToken(m[2]);
      },
      valueFrom: (m) => {
        const v = parseIdNumber(m[1]);
        if (v == null) return null;
        const t = (m[2] || '').toLowerCase();
        // Volume bukti disimpan dalam m³; klaim liter dikonversi.
        if (t === 'liter' || t === 'lt') return v / 1000;
        return v;
      },
    },
    {
      field: 'budget',
      re: /(?:anggaran|budget|dana)\s*(?:sebesar|maksimal|maks|total|anda|kamu|sekitar|kira-kira|kurang\s+lebih)?\s*:?\s*Rp\.?\s*([\d.,]+)\s*(miliar|milyar|juta|jt|ribu|rb)?\b/gi,
      unitFrom: () => 'Rp',
      valueFrom: (m) => {
        const base = parseIdNumber(m[1]);
        return base == null ? null : base * rupiahMultiplier(m[2]);
      },
    },
    {
      field: 'bedrooms',
      re: /(\d+(?:[.,]\d+)?)\s*kamar\s*tidur/gi,
      unitFrom: () => null,
      valueFrom: (m) => parseIdNumber(m[1]),
    },
    {
      field: 'capacity',
      re: /(\d+(?:[.,]\d+)?)\s*ekor/gi,
      unitFrom: () => null,
      valueFrom: (m) => parseIdNumber(m[1]),
    },
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p.re)) {
      push(p.field, p.valueFrom(m), p.unitFrom(m), m[0], m.index ?? 0);
    }
  }
  // Pasangan dimensi "17 m x 9 m" — hanya dengan jangkar dimensi bangunan.
  // KONVENSI SISI mengikuti rabNeeds (extractUniversalSpec): angka
  // PERTAMA = lebar (buildingWidthM), angka KEDUA = panjang
  // (buildingLengthM) — sama seperti yang disimpan draft.spec dan
  // dipakai adapter, agar klaim pasangan dapat dibandingkan dengan
  // bukti tanpa penukaran diam-diam.
  const pairRe = /([\d.,]+)\s*m\s*[x×]\s*([\d.,]+)\s*m/gi;
  const pairAnchorRe = /\b(ukuran|dimensi|tapak|bangunan|rumah|gedung|kandang|panjang|lebar)\b/i;
  for (const m of text.matchAll(pairRe)) {
    const sent = sentenceAt(sentences, m.index ?? 0);
    if (!sent || !pairAnchorRe.test(sent.text)) continue;
    const a = parseIdNumber(m[1]);
    const b = parseIdNumber(m[2]);
    if (a == null || b == null) continue;
    push('width', a, 'm', m[0], m.index ?? 0);
    push('length', b, 'm', m[0], m.index ?? 0);
  }
  return out;
}

export interface TotalClaim {
  value: number;
  kind: 'grand' | 'subtotal' | 'bare';
  raw: string;
  sentence: string;
  index: number;
  labeled: boolean;
}

/**
 * Klaim total: "Grand Total Rp …", "Total RAB Rp …", "Subtotal …",
 * "Jumlah total …" — dengan atau tanpa "Rp" (angka telanjang hanya
 * bila tampak seperti rupiah: mengandung titik ribuan atau ≥6 digit,
 * agar "total 2 item" tidak terbaca sebagai klaim total).
 */
export function extractTotalClaims(text: string): TotalClaim[] {
  const sentences = splitSentences(text);
  const out: TotalClaim[] = [];
  const seen = new Set<number>();
  const push = (value: number | null, kind: TotalClaim['kind'], raw: string, index: number) => {
    if (value == null || !Number.isFinite(value) || seen.has(index)) return;
    seen.add(index);
    const sent = sentenceAt(sentences, index);
    const sentenceText = sent ? sent.text : '';
    out.push({ value, kind, raw, sentence: sentenceText, index, labeled: hasLabel(sentenceText) });
  };
  // Celah tempered (maks 40 karakter, berhenti di "Rp"/angka) di antara
  // frasa total dan angka: "Total RAB proyek ini adalah Rp X" harus
  // tertangkap — versi tanpa celah gagal di E2E run 2 (F7-3 ditahan
  // oleh A2, bukan G2). Titik tidak menembus baris baru.
  const rpRe =
    /(grand\s*total|total\s*akhir|total\s*keseluruhan|subtotal|jumlah\s*total|total\s*(?:rab|biaya|proyek)?)\s*:?\s*(?:(?!\brp\b|\d).){0,40}?Rp\.?\s*([\d.,]+)\s*(miliar|milyar|juta|jt|ribu|rb)?\b/gi;
  for (const m of text.matchAll(rpRe)) {
    const label = (m[1] || '').toLowerCase();
    const kind: TotalClaim['kind'] = label.includes('subtotal')
      ? 'subtotal'
      : label.includes('grand') || label.includes('akhir') || label.includes('keseluruhan')
        ? 'grand'
        : 'bare';
    const base = parseIdNumber(m[2]);
    push(base == null ? null : base * rupiahMultiplier(m[3]), kind, m[0], m.index ?? 0);
  }
  const bareRe =
    /(grand\s*total|total\s*akhir|total\s*keseluruhan|subtotal|jumlah\s*total|total\s*(?:rab|biaya|proyek)?)\s*:?\s*(?:(?!\d).){0,40}?([\d.]{4,}|\d{6,})(?!\d)(?!\s*(?:m²|m2|m³|m3|m\b|cm|mm|kg|ekor|lantai|kamar|orang|hari|jam|unit|buah|batang|lembar|sak))/gi;
  for (const m of text.matchAll(bareRe)) {
    // Jangan gandakan angka yang sudah tertangkap pola Rp (indeks sama).
    if (seen.has(m.index ?? 0)) continue;
    const label = (m[1] || '').toLowerCase();
    const kind: TotalClaim['kind'] = label.includes('subtotal')
      ? 'subtotal'
      : label.includes('grand') || label.includes('akhir') || label.includes('keseluruhan')
        ? 'grand'
        : 'bare';
    push(parseIdNumber(m[2]), kind, m[0], m.index ?? 0);
  }
  return out;
}

export interface TableSumCheck {
  /** Jumlah baris tabel (angka Rp terakhir tiap baris). */
  itemSum: number;
  total: number;
  totalRaw: string;
  labeled: boolean;
}

/**
 * Pemeriksaan konsistensi internal (G1): blok ≥2 baris berurutan yang
 * masing-masing memuat angka Rp (baris tabel/daftar; angka Rp TERAKHIR
 * tiap baris = jumlah baris — "10 m³ × Rp 72.500 = Rp 725.000" memakai
 * 725.000), diikuti ≤3 baris kemudian oleh baris total. Hanya struktur
 * eksplisit ini yang diperiksa — prosa ("semen Rp X, pasir Rp Y")
 * TIDAK, karena harga satuan tidak dapat dibedakan dari jumlah baris.
 */
export function extractTableSumChecks(text: string): TableSumCheck[] {
  const lines = text.split('\n');
  const out: TableSumCheck[] = [];
  const totalLineRe = /(grand\s*total|total|jumlah|subtotal)/i;
  const budgetLineRe = /\b(anggaran|budget|dana)\b/i;
  let block: number[] = [];
  let blockEnd = -1;
  const flush = (uptoLine: number) => {
    if (block.length < 2) {
      block = [];
      return;
    }
    // Cari baris total dalam 3 baris sesudah blok.
    for (let j = blockEnd + 1; j <= Math.min(blockEnd + 3, uptoLine); j++) {
      const line = lines[j] ?? '';
      if (!totalLineRe.test(line) || budgetLineRe.test(line)) continue;
      const figs = extractRupiahFigures(line);
      if (figs.length === 0) continue;
      const total = figs[figs.length - 1];
      out.push({
        itemSum: block.reduce((a, b) => a + b, 0),
        total: total.value,
        totalRaw: total.raw,
        labeled: hasLabel(line),
      });
      break;
    }
    block = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const figs = extractRupiahFigures(line);
    const isTotalLine = totalLineRe.test(line) && !budgetLineRe.test(line);
    if (figs.length > 0 && !isTotalLine && !budgetLineRe.test(line)) {
      block.push(figs[figs.length - 1].value);
      blockEnd = i;
    } else {
      if (block.length >= 2 && isTotalLine) {
        // Baris total langsung sesudah blok — flush memakai baris ini.
        const total = figs[figs.length - 1];
        if (total) {
          out.push({
            itemSum: block.reduce((a, b) => a + b, 0),
            total: total.value,
            totalRaw: total.raw,
            labeled: hasLabel(line),
          });
        }
        block = [];
      } else if (block.length > 0) {
        flush(i - 1);
      }
      if (figs.length === 0 && line.trim() !== '') {
        // Baris non-kosong tanpa angka memutus blok (kecuali baris total
        // yang sudah ditangani di atas).
        block = [];
      }
    }
  }
  if (block.length >= 2) flush(lines.length - 1);
  return out;
}

export interface ConversionClaim {
  leftValue: number;
  leftUnit: string;
  rightValue: number;
  rightUnit: string;
  raw: string;
}

/**
 * Klaim konversi "A satuan = B satuan" (F2). Dilewati bila angka kiri
 * adalah operan perkalian ("25 m × 12 m = 300 m²" — "12 m" didahului
 * "×") atau bila kanan dilanjutkan perkalian ("1 m² = 1 m × 1 m").
 */
export function extractConversionClaims(text: string): ConversionClaim[] {
  const out: ConversionClaim[] = [];
  const unitAlt = '(m²|m2|cm²|cm2|m³|m3|meter\\s*persegi|meter\\s*kubik|cm|mm|km|kg|ton|liter|lt|m\\b)';
  const re = new RegExp(`([\\d.,]+)\\s*${unitAlt}\\s*=\\s*([\\d.,]+)\\s*${unitAlt}`, 'gi');
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 6), idx);
    if (/[×x*]\s*$/.test(before)) continue;
    const after = text.slice(idx + m[0].length, idx + m[0].length + 4);
    if (/^\s*[×x*]/.test(after)) continue;
    const leftValue = parseIdNumber(m[1]);
    const rightValue = parseIdNumber(m[3]);
    if (leftValue == null || rightValue == null) continue;
    out.push({ leftValue, leftUnit: m[2], rightValue, rightUnit: m[4], raw: m[0] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Atribusi item — kalimat mana menyebut item draft yang mana          */
/* ------------------------------------------------------------------ */

const ITEM_STOPWORDS = new Set([
  'pekerjaan', 'pasangan', 'pemasangan', 'pembuatan', 'pengadaan',
  'perbaikan', 'penggantian', 'penambahan', 'pengecatan', 'pembersihan',
  'instalasi', 'penggalian', 'penimbunan', 'pemadatan', 'pengangkutan',
  'pembongkaran', 'pengukuran', 'pengujian', 'pemeliharaan', 'penyiapan',
  'penyediaan', 'pengerjaan', 'pelaksanaan', 'pengawasan', 'dan', 'dengan',
  'untuk', 'dari', 'yang', 'atau', 'pada', 'di', 'ke', 'per', 'satu', 'dua',
  'tiga', 'item', 'harga', 'biaya', 'total', 'volume', 'satuan', 'jenis',
  'bahan', 'material',
]);

/** Token bermakna dari deskripsi item (panjang ≥4, bukan stopword). */
export function significantTokens(description: string): string[] {
  return (description || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !ITEM_STOPWORDS.has(t));
}

function wordIn(haystackLower: string, token: string): boolean {
  // Pencocokan kata utuh (batas kata); token boleh mengandung '-'/'angka'.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystackLower);
}

/**
 * Atribusikan satu kalimat ke SATU item draft: item dengan tumpang
 * tindih token bermakna terbanyak (minimal 2), atau kecocokan kode
 * AHSP langsung. Seri (tie) = tidak dapat diatribusikan deterministik
 * → null (bukan ditebak).
 */
export function attributeItemToSentence(
  sentence: string,
  items: QualityGateItem[],
): QualityGateItem | null {
  const lower = sentence.toLowerCase();
  // Kode AHSP langsung mengikat (paling kuat).
  for (const it of items) {
    if (it.ahspCode && lower.includes(it.ahspCode.toLowerCase())) return it;
  }
  let best: QualityGateItem | null = null;
  let bestScore = 0;
  let tied = false;
  for (const it of items) {
    const tokens = significantTokens(it.description);
    if (tokens.length === 0) continue;
    let score = 0;
    for (const t of tokens) {
      if (wordIn(lower, t)) score++;
    }
    if (score < 2) continue;
    if (score > bestScore) {
      best = it;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  if (tied) return null;
  return best;
}

/* ------------------------------------------------------------------ */
/* Pembantu cek                                                        */
/* ------------------------------------------------------------------ */

const ALL_RULES: QualityRuleId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Semua angka yang diketahui (untuk A2/G2) beserta labelnya. */
function knownFigures(ev: QualityGateEvidence): Array<{ value: number; label: string }> {
  const out: Array<{ value: number; label: string }> = [];
  for (const it of ev.items) {
    if (it.unitPrice != null) out.push({ value: it.unitPrice, label: `harga satuan "${it.description}"` });
    if (it.amount != null) out.push({ value: it.amount, label: `jumlah "${it.description}"` });
  }
  if (ev.totals) {
    const t = ev.totals;
    out.push(
      { value: t.estimatedTotal, label: 'total estimasi draft' },
      { value: t.verifiedTotal, label: 'total terverifikasi draft' },
      { value: t.databaseTotal, label: 'total database draft' },
      { value: t.marketTotal, label: 'total referensi pasar draft' },
      { value: t.manualTotal, label: 'total harga manual draft' },
    );
  }
  if (ev.projectTotals) {
    const p = ev.projectTotals;
    out.push(
      { value: p.totalDirect, label: 'total langsung proyek' },
      { value: p.grandTotal, label: 'grand total proyek' },
      { value: p.subtotalBeforeTax, label: 'subtotal sebelum pajak proyek' },
      { value: p.directCost, label: 'biaya langsung proyek' },
      { value: p.overheadAmount, label: 'overhead proyek' },
      { value: p.profitAmount, label: 'profit proyek' },
      { value: p.taxAmount, label: 'pajak proyek' },
    );
  }
  if (ev.budgetCap != null) {
    out.push({ value: ev.budgetCap, label: 'budget' });
    const total = ev.totals?.estimatedTotal ?? ev.projectTotals?.totalDirect ?? null;
    if (total != null) {
      const remaining = ev.budgetCap - total;
      if (remaining >= 0) out.push({ value: remaining, label: 'sisa budget' });
      else out.push({ value: -remaining, label: 'selisih melebihi budget' });
    }
  }
  return out;
}

function matchesKnown(value: number, known: Array<{ value: number }>): boolean {
  return known.some((k) => figuresEqual(k.value, value));
}

function roundedOfKnown(value: number, known: Array<{ value: number }>): boolean {
  return known.some((k) => isRoundedForm(value, k.value));
}

/** Nilai kebenaran untuk satu field spek (null = tidak diketahui). */
export function expectedSpecValue(ev: QualityGateEvidence, field: SpecField): number | null {
  switch (field) {
    case 'floors': return ev.dimensions.floors;
    case 'buildingArea': return ev.dimensions.buildingAreaM2;
    case 'landArea': return ev.dimensions.landAreaM2;
    case 'length': return ev.dimensions.lengthM;
    case 'width': return ev.dimensions.widthM;
    case 'depth': return ev.dimensions.depthM;
    case 'height': return ev.dimensions.heightM;
    case 'span': return ev.dimensions.spanM;
    case 'volume': return ev.dimensions.volumeM3;
    case 'budget': return ev.budgetCap;
    case 'bedrooms':
    case 'capacity': {
      const unit = field === 'bedrooms' ? 'kamar tidur' : 'ekor';
      const spec = ev.specs.find(
        (s) => s.kind === 'count' && s.status === 'CONFIRMED' && s.unit === unit && typeof s.value === 'number',
      );
      return spec && typeof spec.value === 'number' ? spec.value : null;
    }
    default: return null;
  }
}

/** Apakah bukti memuat kebenaran spek apa pun (syarat aturan D/I). */
function hasSpecTruth(ev: QualityGateEvidence): boolean {
  if (ev.budgetCap != null) return true;
  const d = ev.dimensions;
  if (d.landAreaM2 != null || d.buildingAreaM2 != null || d.lengthM != null || d.widthM != null ||
    d.depthM != null || d.heightM != null || d.spanM != null || d.volumeM3 != null || d.floors != null) return true;
  return ev.specs.some((s) => s.status === 'CONFIRMED');
}

/** Apakah kalimat berjangkar ke proyek ini (bukan pengetahuan umum)? */
function isProjectAnchored(sentence: string): boolean {
  const anchored =
    /(\b(proyek|rumah|gedung|kandang|bangunan|draft|rab|desain|rencana)\b.{0,24}\b(ini|anda|kamu|mu)\b|\b(ini|anda|kamu)\b.{0,24}\b(proyek|rumah|gedung|kandang|bangunan|draft|rab|desain|rencana)\b)/i.test(sentence);
  if (anchored) return true;
  return /\b(luas|lantai|panjang|lebar|tinggi|dalam|kedalaman|volume|budget|anggaran|kamar|kapasitas|atap|pondasi)\w*nya\b/i.test(sentence);
}

function isQuestion(sentence: string): boolean {
  return sentence.includes('?');
}

/* --- Aserti material (atap / pondasi) --- */

const ROOF_TOKENS = ['genteng', 'galvalum', 'spandek', 'zincalume', 'dak', 'seng', 'asbes', 'metal', 'sirap'];
const FOUNDATION_TOKENS = ['foot plat', 'batu kali', 'bore pile', 'tiang pancang', 'sumuran', 'cakar ayam', 'strauss', 'mini pile'];
const ROOF_SPEC_KEYS = ['building-roof-type', 'kandang-roof-material', 'warehouse-roof'];
const FOUNDATION_SPEC_KEYS = ['building-foundation'];

export interface MaterialAssertion {
  aspect: 'roof' | 'foundation';
  tokens: string[];
  raw: string;
  sentence: string;
  labeled: boolean;
}

function tokensIn(text: string, tokens: string[]): string[] {
  const lower = ` ${text.toLowerCase().replace(/[-_]/g, ' ')} `;
  return tokens.filter((t) => lower.includes(` ${t} `) || lower.includes(` ${t},`) || lower.endsWith(` ${t} `));
}

export function extractMaterialAssertions(text: string): MaterialAssertion[] {
  const sentences = splitSentences(text);
  const out: MaterialAssertion[] = [];
  const roofRe = /(atap|atapnya|penutup\s*atap)\s+(genteng|galvalum|spandek|zincalume|dak(\s*beton)?|seng|asbes|metal|sirap)/gi;
  const roofRe2 = /(genteng|galvalum|spandek|zincalume|dak\s*beton)\s+(sebagai|untuk)\s+(atap|penutup)/gi;
  const foundRe = /(pondasi|pondasinya)\s+(foot\s*plat|batu\s*kali|bore\s*pile|tiang\s*pancang|sumuran|cakar\s*ayam|strauss|mini\s*pile)/gi;
  const push = (aspect: 'roof' | 'foundation', m: RegExpMatchArray) => {
    const sent = sentenceAt(sentences, m.index ?? 0);
    const sentenceText = sent ? sent.text : '';
    const tokens = tokensIn(m[0], aspect === 'roof' ? ROOF_TOKENS : FOUNDATION_TOKENS);
    if (tokens.length === 0) return;
    out.push({ aspect, tokens, raw: m[0], sentence: sentenceText, labeled: hasLabel(sentenceText) });
  };
  for (const m of text.matchAll(roofRe)) push('roof', m);
  for (const m of text.matchAll(roofRe2)) push('roof', m);
  for (const m of text.matchAll(foundRe)) push('foundation', m);
  return out;
}

/** Token material dari spek CONFIRMED (null = spek tidak ada/tidak dikenali). */
function confirmedMaterialTokens(ev: QualityGateEvidence, aspect: 'roof' | 'foundation'): string[] | null {
  const keys = aspect === 'roof' ? ROOF_SPEC_KEYS : FOUNDATION_SPEC_KEYS;
  const tokens = aspect === 'roof' ? ROOF_TOKENS : FOUNDATION_TOKENS;
  for (const key of keys) {
    const spec = ev.specs.find((s) => s.key === key && s.status === 'CONFIRMED');
    if (spec) {
      const found = tokensIn(String(spec.value), tokens);
      return found.length > 0 ? found : null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Cek A + B — harga item & angka proyek                               */
/* ------------------------------------------------------------------ */

function checkPriceRules(
  ev: QualityGateEvidence,
  figures: RupiahFigure[],
  specClaims: SpecClaim[],
  totalClaims: TotalClaim[],
  violations: QualityGateViolation[],
): void {
  const known = knownFigures(ev);
  const totalSentences = new Set(totalClaims.map((t) => t.sentence));
  const budgetSentences = new Set(specClaims.filter((c) => c.field === 'budget').map((c) => c.sentence));
  const projectFigureRe = /\b(draft|rab|proyek|anggaran)\b/i;
  const costWordRe = /\b(biaya|harga|overhead|profit|pajak|ppn|sisa|selisih|dibutuhkan|diperlukan|anggaran|total)\b/i;

  for (const fig of figures) {
    const sentence = fig.sentence;
    // Total & budget ditangani aturan G & D — bukan di sini.
    if (totalSentences.has(sentence) || budgetSentences.has(sentence)) continue;
    const item = attributeItemToSentence(sentence, ev.items);
    if (item) {
      if (item.unitPrice == null || item.priceStatus === 'PRICE_UNRESOLVED') {
        // Item tanpa harga → aturan C (C1), bukan A.
        continue;
      }
      const amount = item.amount ?? item.volume * item.unitPrice;
      if (figuresEqual(fig.value, item.unitPrice) || figuresEqual(fig.value, amount)) continue;
      const rounded = isRoundedForm(fig.value, item.unitPrice) || isRoundedForm(fig.value, amount);
      if (rounded) {
        if (!fig.labeled) {
          violations.push({
            rule: 'B',
            check: 'B1',
            detail: `Harga "${item.description}" ditulis ${formatGateRupiah(fig.value)} — pembulatan dari ${formatGateRupiah(item.unitPrice)} tanpa label "sekitar/estimasi".`,
          });
        }
        continue;
      }
      violations.push({
        rule: 'A',
        check: 'A1',
        detail: `Harga "${item.description}" disebut ${formatGateRupiah(fig.value)}, padahal data draft: ${formatGateRupiah(item.unitPrice)}/satuan (jumlah ${formatGateRupiah(amount)}).`,
      });
      continue;
    }
    // A2: angka yang dikaitkan eksplisit ke proyek/draft.
    if (projectFigureRe.test(sentence) && costWordRe.test(sentence)) {
      if (matchesKnown(fig.value, known)) continue;
      if (roundedOfKnown(fig.value, known)) {
        if (!fig.labeled) {
          violations.push({
            rule: 'B',
            check: 'B1',
            detail: `Angka ${formatGateRupiah(fig.value)} yang dikaitkan ke proyek adalah pembulatan dari angka data tanpa label "sekitar/estimasi".`,
          });
        }
        continue;
      }
      violations.push({
        rule: 'A',
        check: 'A2',
        detail: `Angka ${formatGateRupiah(fig.value)} yang dikaitkan ke proyek/draft tidak ada di data yang dikutip (bukan harga item, total, maupun budget yang diketahui).`,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cek C — status harga                                                */
/* ------------------------------------------------------------------ */

function checkPriceStatus(
  ev: QualityGateEvidence,
  figures: RupiahFigure[],
  totalClaims: TotalClaim[],
  violations: QualityGateViolation[],
): void {
  // C1: harga diklaim untuk item tanpa harga.
  for (const fig of figures) {
    const item = attributeItemToSentence(fig.sentence, ev.items);
    if (!item) continue;
    if (item.unitPrice == null || item.priceStatus === 'PRICE_UNRESOLVED') {
      violations.push({
        rule: 'C',
        check: 'C1',
        detail: `Harga ${formatGateRupiah(fig.value)} disebut untuk "${item.description}", padahal item itu belum memiliki harga di draft (harga belum tersedia, bukan Rp0).`,
      });
      continue;
    }
    // C3: harga estimasi/pasar/asumsi tanpa label.
    const needsLabel =
      item.priceStatus === 'PRICE_ESTIMATED' ||
      item.priceSourceKind === 'MARKET_REFERENCE' ||
      item.priceSourceKind === 'EZRAB_ASSUMPTION';
    if (needsLabel && !fig.labeled) {
      const kindLabel =
        item.priceStatus === 'PRICE_ESTIMATED'
          ? 'estimasi'
          : item.priceSourceKind === 'MARKET_REFERENCE'
            ? 'referensi pasar'
            : 'asumsi';
      violations.push({
        rule: 'C',
        check: 'C3',
        detail: `Harga ${formatGateRupiah(fig.value)} untuk "${item.description}" adalah ${kindLabel}, tetapi disajikan tanpa label estimasi/asumsi.`,
      });
    }
  }
  // C2 (klaim kelengkapan menyeluruh) memakai teks jawaban penuh —
  // ditangani checkCompletenessClaim, bukan di sini.
  // C4: total Rp0 padahal item ada.
  const hasItems = (ev.hasDraft && ev.items.length > 0) || ev.projectHasItems;
  if (hasItems) {
    for (const tc of totalClaims) {
      if (tc.value === 0) {
        violations.push({
          rule: 'C',
          check: 'C4',
          detail: 'Total dinyatakan Rp0, padahal draft/proyek memiliki item — total Rp0 tidak pernah benar untuk RAB berisi item (harga yang belum tersedia bukan Rp0).',
        });
      }
    }
  }
}

function checkCompletenessClaim(reply: string, ev: QualityGateEvidence, violations: QualityGateViolation[]): void {
  const t = ev.totals;
  if (!t || !(t.unpricedCount > 0 || t.status === 'PARSIAL')) return;
  const blanketRe =
    /(semua|seluruh)\s+(item|harga)[^.]{0,60}(sudah\s+ada|tersedia|lengkap|terisi|final|terverifikasi)/i;
  const noMissingRe = /tidak\s+ada\s+item\s+(yang\s+)?(tanpa|belum)[^.]{0,30}harga/i;
  const finalTotalRe = /total\s+(sudah\s+)?final/i;
  if (blanketRe.test(reply) || noMissingRe.test(reply) || finalTotalRe.test(reply)) {
    violations.push({
      rule: 'C',
      check: 'C2',
      detail: `Jawaban menyatakan semua harga lengkap/total final, padahal ${t.unpricedCount} item draft belum memiliki harga (total PARSIAL).`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Cek D — spek diubah diam-diam                                       */
/* ------------------------------------------------------------------ */

function checkSpecChanges(
  ev: QualityGateEvidence,
  specClaims: SpecClaim[],
  materialAssertions: MaterialAssertion[],
  violations: QualityGateViolation[],
): void {
  for (const claim of specClaims) {
    const expected = expectedSpecValue(ev, claim.field);
    if (expected == null) continue;
    const mismatch =
      claim.field === 'floors' || claim.field === 'bedrooms' || claim.field === 'capacity'
        ? claim.value !== expected
        : Math.abs(claim.value - expected) > 1e-9;
    if (!mismatch) continue;
    const fmt = (f: SpecField, v: number) =>
      f === 'budget' ? formatGateRupiah(v) : `${v.toLocaleString('id-ID')} ${SPEC_FIELD_UNITS[f] === 'm2' ? 'm²' : SPEC_FIELD_UNITS[f] === 'm3' ? 'm³' : SPEC_FIELD_UNITS[f] === 'm' ? 'm' : SPEC_FIELD_UNITS[f] === 'Rp' ? '' : ''}`.trim();
    violations.push({
      rule: 'D',
      check: 'D1',
      detail: `${SPEC_FIELD_LABELS[claim.field]} disebut ${fmt(claim.field, claim.value)}, padahal spek pengguna: ${fmt(claim.field, expected)}.`,
    });
  }
  // D2: material atap/pondasi bertentangan dengan spek CONFIRMED.
  for (const a of materialAssertions) {
    if (isQuestion(a.sentence)) continue;
    if (RECOMMENDATION_MARKER_RE.test(a.sentence) || /lebih\s+baik/i.test(a.sentence)) continue;
    const expectedTokens = confirmedMaterialTokens(ev, a.aspect);
    if (!expectedTokens) continue;
    const overlap = a.tokens.some((t) => expectedTokens.includes(t));
    if (!overlap) {
      violations.push({
        rule: 'D',
        check: 'D2',
        detail: `${a.aspect === 'roof' ? 'Atap' : 'Pondasi'} disebut "${a.tokens.join('/')}", padahal spek terkonfirmasi pengguna: "${expectedTokens.join('/')}".`,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cek E — konflik spek                                                */
/* ------------------------------------------------------------------ */

const CONFLICT_ACK_RE =
  /\b(konflik|bertentangan|tidak\s+konsisten|perlu\s+diputuskan|mana\s+yang\s+benar|mohon\s+konfirmasi|belum\s+diputuskan|ada\s+perbedaan|tidak\s+cocok|melebihi\s+luas\s+tanah|melampaui|perlu\s+klarifikasi|harus\s+diputuskan|belum\s+jelas|minta\s+konfirmasi|pilih\s+salah\s+satu)\b/i;

const CONFLICT_FIELD_WORDS: Record<string, string[]> = {
  'area-exceeds-land': ['luas', 'tanah', 'bangunan'],
  'height-vs-floors': ['tinggi', 'lantai'],
  'volume-vs-dimensions': ['volume', 'panjang', 'lebar', 'kedalaman', 'dalam'],
  'material-vs-structure': ['atap', 'genteng', 'dak', 'struktur'],
  'budget-vs-scope': ['budget', 'anggaran', 'total'],
};

function checkConflicts(
  reply: string,
  ev: QualityGateEvidence,
  specClaims: SpecClaim[],
  materialAssertions: MaterialAssertion[],
  totalClaims: TotalClaim[],
  violations: QualityGateViolation[],
): void {
  if (ev.conflicts.length === 0) return;
  // Jawaban yang MENYEBUT konflik (atau menanyakannya) tidak melanggar.
  let acknowledged = CONFLICT_ACK_RE.test(reply);
  if (!acknowledged) {
    for (const sentence of splitSentences(reply)) {
      if (!sentence.text.includes('?')) continue;
      const words = Object.values(CONFLICT_FIELD_WORDS).flat();
      if (words.some((w) => sentence.text.toLowerCase().includes(w))) {
        acknowledged = true;
        break;
      }
    }
  }
  if (acknowledged) return;

  for (const conflict of ev.conflicts) {
    const detail = conflict.detail;
    switch (conflict.kind) {
      case 'area-exceeds-land': {
        const hit = specClaims.find((c) => c.field === 'buildingArea' || c.field === 'landArea');
        if (hit) {
          violations.push({
            rule: 'E', check: 'E1',
            detail: `Konflik luas tidak disebut: ${detail} — jawaban justru menegaskan ${SPEC_FIELD_LABELS[hit.field]} ${hit.value} m² seolah sudah diputuskan.`,
          });
        }
        break;
      }
      case 'height-vs-floors': {
        const hit = specClaims.find((c) => c.field === 'height' || c.field === 'floors');
        if (hit) {
          violations.push({
            rule: 'E', check: 'E1',
            detail: `Konflik tinggi/lantai tidak disebut: ${detail} — jawaban justru menegaskan ${SPEC_FIELD_LABELS[hit.field]} ${hit.value} seolah sudah diputuskan.`,
          });
        }
        break;
      }
      case 'volume-vs-dimensions': {
        const hit = specClaims.find((c) => c.field === 'volume' || c.field === 'length' || c.field === 'width' || c.field === 'depth');
        if (hit) {
          violations.push({
            rule: 'E', check: 'E1',
            detail: `Konflik volume/dimensi tidak disebut: ${detail} — jawaban justru menegaskan ${SPEC_FIELD_LABELS[hit.field]} ${hit.value} seolah sudah diputuskan.`,
          });
        }
        break;
      }
      case 'material-vs-structure': {
        const hit = materialAssertions.find((a) => a.aspect === 'roof');
        if (hit) {
          violations.push({
            rule: 'E', check: 'E1',
            detail: `Konflik material/struktur tidak disebut: ${detail} — jawaban justru menegaskan atap "${hit.tokens.join('/')}" seolah sudah diputuskan.`,
          });
        }
        break;
      }
      case 'budget-vs-scope': {
        const cap = ev.budgetCap;
        const overTotal = totalClaims.find((tc) => cap != null && tc.value > cap);
        const affordRe = /(masih\s+)?(dalam|sesuai|di\s*bawah)\s*budget|tidak\s+melebihi\s*budget|aman\s+secara\s*budget|cukup\b[^.]{0,20}budget/i;
        if (overTotal) {
          violations.push({
            rule: 'E', check: 'E1',
            detail: `Konflik budget tidak disebut: ${detail} — jawaban menyebut total ${formatGateRupiah(overTotal.value)} tanpa mencatat bahwa total itu melebihi budget.`,
          });
        } else if (affordRe.test(reply)) {
          violations.push({
            rule: 'E', check: 'E1',
            detail: `Konflik budget tidak disebut: ${detail} — jawaban justru mengklaim masih dalam budget.`,
          });
        }
        break;
      }
      case 'duplicate-spec-value': {
        const key = typeof conflict.values?.key === 'string' ? (conflict.values.key as string) : '';
        const valuesStr = typeof conflict.values?.values === 'string' ? (conflict.values.values as string) : '';
        const values = valuesStr.split('|').map((v) => v.trim().toLowerCase()).filter(Boolean);
        const mentionsValue = values.some((v) => v.length >= 2 && reply.toLowerCase().includes(v));
        const keyField = key === 'budget' ? 'budget' : key === 'kandang-capacity' ? 'capacity' : key === 'building-bedrooms' ? 'bedrooms' : null;
        const specHit = keyField ? specClaims.find((c) => c.field === keyField) : undefined;
        const roofHit = ROOF_SPEC_KEYS.includes(key)
          ? materialAssertions.find((a) => a.aspect === 'roof')
          : undefined;
        const foundHit = FOUNDATION_SPEC_KEYS.includes(key)
          ? materialAssertions.find((a) => a.aspect === 'foundation')
          : undefined;
        if (specHit || roofHit || foundHit || mentionsValue) {
          violations.push({
            rule: 'E', check: 'E1',
            detail: `Konflik nilai ganda tidak disebut: ${detail} — jawaban menegaskan salah satu nilainya seolah sudah diputuskan.`,
          });
        }
        break;
      }
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cek F — satuan                                                      */
/* ------------------------------------------------------------------ */

const UNIT_DIMENSIONS: Record<string, { dim: 'length' | 'area' | 'volume' | 'mass'; factor: number }> = {
  m: { dim: 'length', factor: 1 },
  cm: { dim: 'length', factor: 0.01 },
  mm: { dim: 'length', factor: 0.001 },
  km: { dim: 'length', factor: 1000 },
  'm²': { dim: 'area', factor: 1 },
  m2: { dim: 'area', factor: 1 },
  'meter persegi': { dim: 'area', factor: 1 },
  'cm²': { dim: 'area', factor: 0.0001 },
  cm2: { dim: 'area', factor: 0.0001 },
  'm³': { dim: 'volume', factor: 1 },
  m3: { dim: 'volume', factor: 1 },
  'meter kubik': { dim: 'volume', factor: 1 },
  liter: { dim: 'volume', factor: 0.001 },
  lt: { dim: 'volume', factor: 0.001 },
  kg: { dim: 'mass', factor: 1 },
  ton: { dim: 'mass', factor: 1000 },
};

function checkUnits(
  specClaims: SpecClaim[],
  conversions: ConversionClaim[],
  violations: QualityGateViolation[],
): void {
  for (const claim of specClaims) {
    const expected = SPEC_FIELD_UNITS[claim.field];
    if (expected == null || claim.unit == null) continue;
    if (claim.unit !== expected) {
      const unitLabel = (u: string) => (u === 'm2' ? 'm²' : u === 'm3' ? 'm³' : u);
      violations.push({
        rule: 'F',
        check: 'F1',
        detail: `${SPEC_FIELD_LABELS[claim.field]} ditulis dengan satuan ${unitLabel(claim.unit)}, padahal satuannya harus ${unitLabel(expected)}.`,
      });
    }
  }
  for (const conv of conversions) {
    const left = UNIT_DIMENSIONS[conv.leftUnit.toLowerCase()];
    const right = UNIT_DIMENSIONS[conv.rightUnit.toLowerCase()];
    if (!left || !right) continue;
    if (left.dim !== right.dim) {
      violations.push({
        rule: 'F',
        check: 'F2',
        detail: `Konversi "${conv.raw}" menyamakan satuan lintas dimensi (${conv.leftUnit} ≠ ${conv.rightUnit}) — tidak dapat dikonversi.`,
      });
      continue;
    }
    const expectedRight = (conv.leftValue * left.factor) / right.factor;
    const denom = Math.max(Math.abs(expectedRight), 1e-9);
    if (Math.abs(conv.rightValue - expectedRight) / denom > 0.01) {
      violations.push({
        rule: 'F',
        check: 'F2',
        detail: `Konversi "${conv.raw}" salah hitung: ${conv.leftValue} ${conv.leftUnit} = ${expectedRight.toLocaleString('id-ID')} ${conv.rightUnit}, bukan ${conv.rightValue.toLocaleString('id-ID')} ${conv.rightUnit}.`,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cek G — total                                                       */
/* ------------------------------------------------------------------ */

function checkTotals(
  ev: QualityGateEvidence,
  totalClaims: TotalClaim[],
  tableChecks: TableSumCheck[],
  explicitSums: Array<{ sum: number; result: number; raw: string; labeled: boolean }>,
  violations: QualityGateViolation[],
): void {
  // G1: konsistensi internal tabel/jumlah eksplisit.
  for (const tc of tableChecks) {
    if (figuresEqual(tc.total, tc.itemSum)) continue;
    if (tc.labeled && isRoundedForm(tc.total, tc.itemSum)) continue;
    violations.push({
      rule: 'G',
      check: 'G1',
      detail: `Total tabel ${formatGateRupiah(tc.total)} tidak sama dengan jumlah barisnya (${formatGateRupiah(tc.itemSum)}).`,
    });
  }
  for (const s of explicitSums) {
    if (figuresEqual(s.result, s.sum)) continue;
    if (s.labeled && isRoundedForm(s.result, s.sum)) continue;
    violations.push({
      rule: 'G',
      check: 'G1',
      detail: `Jumlah "${s.raw.trim()}" salah hitung: hasilnya ${formatGateRupiah(s.sum)}, bukan ${formatGateRupiah(s.result)}.`,
    });
  }
  // G2: klaim total vs total yang diketahui (subtotal tidak diperiksa —
  // pemetaan seksi tidak tersedia di bukti).
  const known = knownFigures(ev).filter((k) => /total|biaya langsung|sisa budget|selisih/.test(k.label));
  const hasKnownTotals = ev.totals != null || ev.projectTotals != null;
  if (!hasKnownTotals) return;
  for (const tc of totalClaims) {
    if (tc.kind === 'subtotal') continue;
    if (tc.value === 0) continue; // Total Rp0 = aturan C (C4).
    if (matchesKnown(tc.value, known)) continue;
    if (tc.labeled && roundedOfKnown(tc.value, known)) continue;
    violations.push({
      rule: 'G',
      check: 'G2',
      detail: `Total disebut ${formatGateRupiah(tc.value)}, padahal total yang diketahui dari data: ${known
        .map((k) => `${k.label} ${formatGateRupiah(k.value)}`)
        .slice(0, 4)
        .join('; ')}.`,
    });
  }
}

/** Jumlah eksplisit "A + B = C" pada baris ber-Rp (G1). */
export function extractExplicitSums(text: string): Array<{ sum: number; result: number; raw: string; labeled: boolean }> {
  const out: Array<{ sum: number; result: number; raw: string; labeled: boolean }> = [];
  for (const line of text.split('\n')) {
    if (!line.includes('Rp') || !line.includes('+') || !line.includes('=')) continue;
    const [left, right] = line.split('=');
    if (!left || !right) continue;
    const operands = left.split('+');
    if (operands.length < 2) continue;
    const values: number[] = [];
    let ok = true;
    for (const op of operands) {
      const m = op.match(/([\d.,]+)\s*(miliar|milyar|juta|jt|ribu|rb)?/);
      if (!m) {
        ok = false;
        break;
      }
      const v = parseIdNumber(m[1]);
      if (v == null) {
        ok = false;
        break;
      }
      values.push(v * rupiahMultiplier(m[2]));
    }
    if (!ok) continue;
    const rm = right.match(/([\d.,]+)\s*(miliar|milyar|juta|jt|ribu|rb)?/);
    if (!rm) continue;
    const resultBase = parseIdNumber(rm[1]);
    if (resultBase == null) continue;
    out.push({
      sum: values.reduce((a, b) => a + b, 0),
      result: resultBase * rupiahMultiplier(rm[2]),
      raw: line,
      labeled: hasLabel(line),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cek H — klaim AHSP resmi                                            */
/* ------------------------------------------------------------------ */

const AHSP_OFFICIAL_CLAIM_RE =
  /(\bAHSP\b.{0,40}\b(resmi|official)\b|\b(resmi|sesuai|berdasarkan)\s+AHSP\b|harga\s+AHSP|analisa\s+AHSP)/i;
const AHSP_CODE_RE = /\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+|\b[A-Z]\.\d+[a-z]?|\d+\.\d+\.\(\d+[a-z]?\)/;

function checkAhspClaims(
  reply: string,
  ev: QualityGateEvidence,
  violations: QualityGateViolation[],
): void {
  // H1: klaim resmi untuk item yang sumbernya bukan OFFICIAL_AHSP.
  for (const sentence of splitSentences(reply)) {
    const text = sentence.text;
    if (!AHSP_OFFICIAL_CLAIM_RE.test(text)) continue;
    if (!/Rp\b/i.test(text) && !/\bharga\b/i.test(text)) continue;
    const item = attributeItemToSentence(text, ev.items);
    if (!item) continue;
    if (item.priceSourceKind !== 'OFFICIAL_AHSP') {
      const sourceLabel =
        item.priceSourceKind === 'MARKET_REFERENCE'
          ? 'referensi pasar'
          : item.priceSourceKind === 'EZRAB_ASSUMPTION'
            ? 'asumsi'
            : item.priceSourceKind === 'UNRESOLVED'
              ? 'belum tersedia'
              : 'bukan AHSP resmi';
      violations.push({
        rule: 'H',
        check: 'H1',
        detail: `Harga "${item.description}" diklaim resmi AHSP, padahal sumber harganya ${sourceLabel}.`,
      });
    }
  }
  // H2: klaim menyeluruh "semua harga AHSP" pada draft campuran/parsial.
  const t = ev.totals;
  const pricedNonOfficial = ev.items.filter(
    (it) => it.unitPrice != null && it.priceStatus !== 'PRICE_UNRESOLVED' && it.priceSourceKind !== 'OFFICIAL_AHSP',
  ).length;
  const mixedOrPartial = pricedNonOfficial > 0 || (t != null && (t.unpricedCount > 0 || t.status !== 'LENGKAP'));
  if (mixedOrPartial) {
    const blanketRe = /(semua|seluruh)\s+(harga|item)[^.]{0,60}AHSP|semua[^.]{0,40}AHSP\s+resmi/i;
    if (blanketRe.test(reply)) {
      violations.push({
        rule: 'H',
        check: 'H2',
        detail: `Jawaban menyatakan semua harga sesuai AHSP resmi, padahal ${pricedNonOfficial} item berharga non-resmi${t && t.unpricedCount > 0 ? ` dan ${t.unpricedCount} item belum berharga` : ''}.`,
      });
    }
  }
  // H3: kode AHSP yang dikutip tidak cocok dengan kode item.
  for (const sentence of splitSentences(reply)) {
    const text = sentence.text;
    if (!/\bAHSP\b/i.test(text)) continue;
    const codeMatch = text.match(AHSP_CODE_RE);
    if (!codeMatch) continue;
    const item = attributeItemToSentence(text, ev.items);
    if (!item) continue;
    const cited = codeMatch[0].toLowerCase().replace(/\s+/g, '');
    if (!item.ahspCode) {
      violations.push({
        rule: 'H',
        check: 'H3',
        detail: `Kode AHSP "${codeMatch[0]}" dikutip untuk "${item.description}", padahal item itu tidak memiliki kode AHSP di draft.`,
      });
    } else if (item.ahspCode.toLowerCase().replace(/\s+/g, '') !== cited) {
      violations.push({
        rule: 'H',
        check: 'H3',
        detail: `Kode AHSP "${codeMatch[0]}" dikutip untuk "${item.description}", padahal kode item itu "${item.ahspCode}".`,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cek I — asumsi tanpa label (penambahan spek diam-diam)              */
/* ------------------------------------------------------------------ */

function checkUnlabeledAdditions(
  ev: QualityGateEvidence,
  specClaims: SpecClaim[],
  materialAssertions: MaterialAssertion[],
  violations: QualityGateViolation[],
): void {
  for (const claim of specClaims) {
    const expected = expectedSpecValue(ev, claim.field);
    if (expected != null) continue; // Diketahui → wilayah aturan D, bukan I.
    if (claim.labeled) continue;
    if (isQuestion(claim.sentence)) continue;
    if (RECOMMENDATION_MARKER_RE.test(claim.sentence)) continue;
    if (!isProjectAnchored(claim.sentence)) continue;
    violations.push({
      rule: 'I',
      check: 'I1',
      detail: `${SPEC_FIELD_LABELS[claim.field]} ${claim.field === 'budget' ? formatGateRupiah(claim.value) : claim.value} dinyatakan sebagai fakta proyek, padahal pengguna tidak pernah menyebutkannya — tanpa label asumsi/estimasi.`,
    });
  }
  for (const a of materialAssertions) {
    const expectedTokens = confirmedMaterialTokens(ev, a.aspect);
    if (expectedTokens) continue; // Spek ada → wilayah aturan D, bukan I.
    if (a.labeled) continue;
    if (isQuestion(a.sentence)) continue;
    if (RECOMMENDATION_MARKER_RE.test(a.sentence) || /lebih\s+baik/i.test(a.sentence)) continue;
    if (!isProjectAnchored(a.sentence)) continue;
    violations.push({
      rule: 'I',
      check: 'I1',
      detail: `${a.aspect === 'roof' ? 'Atap' : 'Pondasi'} "${a.tokens.join('/')}" dinyatakan sebagai pilihan proyek, padahal pengguna tidak pernah menentukannya — tanpa label asumsi.`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Cek J — klaim tindakan                                              */
/* ------------------------------------------------------------------ */

const READ_TOOL_NAMES = new Set([
  'cari_ahsp', 'cari_harga', 'cari_template_rab', 'cari_pengetahuan_konstruksi',
  'cari_kalkulator', 'get_project_total', 'get_project_items', 'get_item_detail',
  'get_unresolved_items', 'get_project_labor', 'get_project_sections',
  'get_project_costliest', 'get_project_materials', 'get_operation_history',
  'hitung_qto', 'search_domain_candidates', 'validate_spec_chain',
  'detect_technical_conflicts', 'analyze_draft_costs', 'assess_budget_feasibility',
  'check_qto', 'extract_ded_specs', 'subtotal', 'volume_persegi', 'luas_dinding',
  'persentase_level',
]);

function toolOk(ev: QualityGateEvidence, names: string[]): boolean {
  return ev.toolResults.some((r) => r.ok && names.includes(r.toolName));
}

function anyReadToolOk(ev: QualityGateEvidence): boolean {
  return ev.toolResults.some((r) => r.ok && READ_TOOL_NAMES.has(r.toolName));
}

function checkActionClaims(reply: string, ev: QualityGateEvidence, violations: QualityGateViolation[]): void {
  for (const sentence of splitSentences(reply)) {
    const text = sentence.text;
    if (isQuestion(text)) continue;
    // J-draft: klaim draft sudah tersusun/dibuat. Tiga bentuk:
    // kata-kerja-depan ("sudah saya susun draft" / "saya sudah
    // menyusun draft"), objek-depan ("draft sudah saya susun"), dan
    // pasif ("draft sudah tersusun"). Sesudah "saya", kata kerja
    // memakai bentuk STEM (susun/buat) — bukan bentuk berawalan.
    const draftClaim =
      /((sudah|telah)\s+(saya\s+)?|saya\s+(sudah|telah)\s+)(menyusun|susun|membuat|buat|menyelesaikan|selesaikan|merancang|rancang)\s+(draft|rab|rancangan)/i.test(text) ||
      /(draft|rab)\b.{0,24}((sudah|telah)\s+(saya\s+)?|saya\s+(sudah|telah)\s+)(menyusun|susun|membuat|buat|menyelesaikan|selesaikan|merancang|rancang)\b/i.test(text) ||
      /(draft|rab)\s+(sudah|telah)\s+(tersusun|dibuat|selesai|jadi|siap)/i.test(text);
    if (draftClaim) {
      const ok = ev.hasDraft || toolOk(ev, ['build_universal_draft']);
      if (!ok) {
        violations.push({
          rule: 'J', check: 'J1',
          detail: 'Jawaban menyatakan draft RAB sudah tersusun, padahal tidak ada draft aktif dan tidak ada penyusunan draft pada respons ini.',
        });
      }
    }
    // J-transfer: klaim sudah disimpan/dikirim ke Spreadsheet/proyek.
    const transferClaim =
      /((sudah|telah)\s+(saya\s+)?|saya\s+(sudah|telah)\s+)(menyimpan|simpan|mengirim|kirim|memindahkan|pindah|mentransfer|transfer|memasukkan|masukkan|menyalin|salin)\b[^.]{0,80}(spreadsheet|ke\s+proyek|proyek)/i.test(text) ||
      /(sudah|telah)\s+(tersimpan|terkirim|terpindah|tersalin)\b[^.]{0,60}(spreadsheet|proyek)/i.test(text);
    if (transferClaim) {
      const ok = toolOk(ev, ['transfer_draft']) || ev.hasTransferReceipt;
      if (!ok) {
        violations.push({
          rule: 'J', check: 'J2',
          detail: 'Jawaban menyatakan draft sudah dikirim/disimpan ke Spreadsheet/proyek, padahal tidak ada transfer yang terjadi.',
        });
      }
    }
    // J-change: klaim perubahan item sudah terjadi (SELALU pelanggaran —
    // propose_* hanya membuat pratinjau; tidak ada tool yang mengeksekusi
    // mutasi dari jalur LLM).
    const changeClaim =
      /((sudah|telah)\s+saya\s+|saya\s+(sudah|telah)\s+)(mengubah|ubah|memperbarui|perbarui|mengupdate|update|menambah|tambah|menghapus|hapus|mengedit|edit|mengganti|ganti)\b[^.]{0,60}(item|harga|volume|jumlah|kuantitas|satuan|deskripsi|nama|spesifikasi|spek)/i.test(text);
    if (changeClaim) {
      violations.push({
        rule: 'J', check: 'J3',
        detail: 'Jawaban menyatakan perubahan item sudah terjadi, padahal perubahan dari AI hanya berupa pratinjau yang menunggu konfirmasi pengguna — tidak pernah terjadi sendiri.',
      });
    }
    // J-search: klaim sudah mencari/mengecek data.
    const searchMatch = text.match(/((sudah|telah)\s+(saya\s+)?|saya\s+(sudah|telah)\s+)(mencari|cari|mengecek|cek|memeriksa|periksa|melihat|lihat|menelusuri|telusuri)\b[^.]{0,80}(database|ahsp|harga|katalog|template|proyek|data)/i);
    if (searchMatch) {
      const source = (searchMatch[6] || '').toLowerCase();
      let ok: boolean;
      if (source.includes('ahsp')) ok = toolOk(ev, ['cari_ahsp']);
      else if (source.includes('harga')) ok = toolOk(ev, ['cari_harga']);
      else if (source.includes('template') || source.includes('katalog')) ok = toolOk(ev, ['cari_template_rab', 'cari_kalkulator']);
      else ok = anyReadToolOk(ev);
      if (!ok) {
        violations.push({
          rule: 'J', check: 'J4',
          detail: `Jawaban menyatakan sudah mencari/mengecek ${source || 'data'}, padahal tidak ada pencarian data yang berjalan pada respons ini.`,
        });
      }
    }
    // J-project: klaim proyek sudah dibuat/disimpan oleh AI — dua bentuk:
    // "sudah saya buat proyek" dan "proyek sudah saya buat".
    const projectClaimActive =
      /((sudah|telah)\s+saya\s+|saya\s+(sudah|telah)\s+)(membuat|buat|membuka|buka|menyimpan|simpan)\s+proyek\b/i.test(text) ||
      /proyek\s+(sudah|telah)\s+saya\s+(buat|buka|simpan)\b/i.test(text);
    if (projectClaimActive) {
      violations.push({
        rule: 'J', check: 'J5',
        detail: 'Jawaban menyatakan proyek sudah dibuat/disimpan oleh AI, padahal AI tidak memiliki kemampuan membuat proyek — proyek dibuat pengguna lewat antarmuka.',
      });
    } else {
      const projectClaimPassive = /proyek\s+(sudah|telah)\s+(dibuat|disimpan)\b/i.test(text);
      if (projectClaimPassive && ev.projectTotals == null && !ev.projectHasItems) {
        violations.push({
          rule: 'J', check: 'J5',
          detail: 'Jawaban menyatakan proyek sudah dibuat, padahal tidak ada proyek aktif.',
        });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Titik masuk utama                                                   */
/* ------------------------------------------------------------------ */

/**
 * Periksa satu jawaban LLM terhadap bukti. Murni + defensif: tidak
 * pernah melempar untuk input berbentuk apa pun (pemanggil tetap
 * membungkus dalam try/catch sebagai jaring pengaman fail-open).
 */
export function checkResponseQuality(reply: string, ev: QualityGateEvidence): QualityGateVerdict {
  const text = reply ?? '';
  if (text.trim() === '') {
    // Tidak ada klaim → tidak ada yang dapat diperiksa (jujur: semua
    // aturan "tidak berlaku", bukan "lolos").
    return { passed: true, violations: [], checked: [], notApplicable: [...ALL_RULES] };
  }
  const violations: QualityGateViolation[] = [];
  const figures = extractRupiahFigures(text);
  const specClaims = extractSpecClaims(text);
  const totalClaims = extractTotalClaims(text);
  const tableChecks = extractTableSumChecks(text);
  const explicitSums = extractExplicitSums(text);
  const conversions = extractConversionClaims(text);
  const materialAssertions = extractMaterialAssertions(text);

  const hasKnownFigures = knownFigures(ev).length > 0;
  const specTruth = hasSpecTruth(ev);

  if (hasKnownFigures) {
    checkPriceRules(ev, figures, specClaims, totalClaims, violations);
  }
  if (ev.hasDraft) {
    checkPriceStatus(ev, figures, totalClaims, violations);
    checkCompletenessClaim(text, ev, violations);
    checkAhspClaims(text, ev, violations);
  }
  if (specTruth) {
    checkSpecChanges(ev, specClaims, materialAssertions, violations);
    checkUnlabeledAdditions(ev, specClaims, materialAssertions, violations);
  }
  if (ev.conflicts.length > 0) {
    checkConflicts(text, ev, specClaims, materialAssertions, totalClaims, violations);
  }
  checkUnits(specClaims, conversions, violations);
  checkTotals(ev, totalClaims, tableChecks, explicitSums, violations);
  checkActionClaims(text, ev, violations);

  // Dedup: klaim yang sama disebut dua kali = satu pelanggaran.
  const seen = new Set<string>();
  const deduped = violations.filter((v) => {
    const key = `${v.rule}|${v.check}|${v.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const checked: QualityRuleId[] = [];
  const notApplicable: QualityRuleId[] = [];
  const mark = (rule: QualityRuleId, applicable: boolean) => {
    if (applicable) checked.push(rule);
    else notApplicable.push(rule);
  };
  mark('A', hasKnownFigures);
  mark('B', hasKnownFigures);
  mark('C', ev.hasDraft);
  mark('D', specTruth);
  mark('E', ev.conflicts.length > 0);
  mark('F', true);
  mark('G', true);
  mark('H', ev.hasDraft);
  mark('I', specTruth);
  mark('J', true);

  return { passed: deduped.length === 0, violations: deduped, checked, notApplicable };
}

/* ------------------------------------------------------------------ */
/* Adapter — bukti dari state chat yang sudah ada                      */
/* ------------------------------------------------------------------ */

export interface QualityGateStateInput {
  /** Draft aktif proyek (dari getLastUniversalDraft). */
  draft: UniversalDraft | null;
  /** Konteks intake kanonis (dari getUniversalContextState). */
  intake: UniversalIntakeContext | null;
  /** Snapshot proyek aktif (bila ada). */
  snapshot: ProjectSnapshot | null;
  /** Hasil tool pada respons ini (res.toolResults). */
  toolResults: EzrabAiToolResult[];
  /** Id proyek aktif (untuk mencocokkan receipt transfer). */
  projectId?: string | null;
}

function toQualitySpec(s: StructuredSpec): QualityGateSpec | null {
  if (s.value == null || typeof s.value === 'boolean') return null;
  const value = Array.isArray(s.value) ? s.value.join(', ') : s.value;
  if (value === '') return null;
  return {
    key: s.key,
    label: s.label,
    kind: s.kind,
    value,
    ...(s.unit ? { unit: s.unit } : {}),
    status: s.status,
  };
}

/**
 * Rakit bukti dari state yang sudah ada di jalur tampil. Murni membaca
 * (tanpa fetch/provider); deteksi konflik dibungkus try/catch agar
 * kegagalannya tidak pernah menggagalkan tampil.
 */
export function buildQualityGateEvidence(input: QualityGateStateInput): QualityGateEvidence {
  const ev = emptyQualityGateEvidence();
  const { draft, intake, snapshot } = input;

  if (draft) {
    ev.hasDraft = true;
    ev.draftTitle = draft.title ?? null;
    ev.draftVersion = draft.version ?? null;
    ev.items = effectiveItems(draft).map((it) => ({
      description: it.description,
      volume: it.volume,
      unit: it.unit,
      unitPrice: it.unitPrice ?? null,
      amount: it.amount ?? (it.unitPrice != null ? it.volume * it.unitPrice : null),
      priceStatus: (it.priceStatus as QualityPriceStatus | undefined) ?? null,
      priceSourceKind: (it.priceSourceKind as QualityPriceSourceKind | undefined) ?? null,
      ahspCode: it.ahspCode ?? null,
    }));
    const totals = computeTotals(draft);
    ev.totals = {
      estimatedTotal: totals.estimatedTotal,
      verifiedTotal: totals.verifiedTotal,
      databaseTotal: totals.databaseTotal,
      marketTotal: totals.marketTotal,
      manualTotal: totals.manualTotal,
      unpricedCount: totals.unpricedCount,
      needsSpecCount: totals.needsSpecCount,
      status: totals.status,
    };
    ev.hasTransferReceipt =
      draft.lastTransfer != null &&
      draft.lastTransfer.version === draft.version &&
      (input.projectId == null || draft.lastTransfer.projectId === input.projectId);
  }

  if (snapshot) {
    ev.projectHasItems = snapshot.itemCount > 0;
    const cb = snapshot.costBreakdown;
    if (cb) {
      ev.projectTotals = {
        totalDirect: snapshot.totalDirect,
        grandTotal: cb.grandTotal,
        subtotalBeforeTax: cb.subtotalBeforeTax,
        directCost: cb.directCost,
        overheadAmount: cb.overheadAmount,
        profitAmount: cb.profitAmount,
        taxAmount: cb.taxAmount,
      };
    }
  }

  // Spek: intake lebih segar dari draft; draft sebagai fallback.
  const rawSpecs: StructuredSpec[] =
    (intake?.structuredSpecs?.length ? intake.structuredSpecs : null) ??
    draft?.structuredSpecs ??
    [];
  ev.specs = rawSpecs
    .map(toQualitySpec)
    .filter((s): s is QualityGateSpec => s !== null);

  // Dimensi: intake dulu, draft.spec sebagai fallback per-field.
  const spec = draft?.spec;
  ev.dimensions = {
    landAreaM2: intake?.landAreaM2 ?? spec?.landAreaM2 ?? null,
    buildingAreaM2: intake?.buildingAreaM2 ?? spec?.areaM2 ?? null,
    lengthM: intake?.lengthM ?? spec?.lengthM ?? spec?.buildingLengthM ?? null,
    widthM: intake?.widthM ?? spec?.widthM ?? spec?.buildingWidthM ?? null,
    depthM: intake?.depthM ?? null,
    heightM: intake?.heightM ?? spec?.heightM ?? null,
    spanM: intake?.spanM ?? spec?.spanM ?? null,
    volumeM3: intake?.volumeM3 ?? spec?.volumeM3 ?? null,
    floors: intake?.floors ?? spec?.floors ?? null,
  };
  ev.budgetCap = intake?.budget?.amount ?? spec?.budgetCap ?? null;

  // Konflik teknis deterministik (aturan E) — dihitung di sini karena
  // jalur kirim tidak menyimpannya; tanpa scope memori (tanpa tulis).
  try {
    const d = ev.dimensions;
    const hasDims =
      d.landAreaM2 != null || d.buildingAreaM2 != null || d.lengthM != null ||
      d.widthM != null || d.depthM != null || d.heightM != null ||
      d.spanM != null || d.volumeM3 != null || d.floors != null;
    if (hasDims || rawSpecs.length > 0) {
      ev.conflicts = detectTechnicalConflicts({
        specs: rawSpecs,
        dimensions: {
          landAreaM2: d.landAreaM2,
          buildingAreaM2: d.buildingAreaM2,
          lengthM: d.lengthM,
          widthM: d.widthM,
          depthM: d.depthM,
          heightM: d.heightM,
          floors: d.floors,
          volumeM3: d.volumeM3,
        },
        budget: {
          totalPriced: ev.totals?.estimatedTotal ?? ev.projectTotals?.totalDirect ?? null,
          cap: ev.budgetCap,
        },
      });
    }
  } catch {
    ev.conflicts = [];
  }

  ev.toolResults = (input.toolResults ?? []).map((r) => ({ toolName: r.toolName, ok: r.ok }));
  return ev;
}

/* ------------------------------------------------------------------ */
/* Pesan penahanan jujur                                               */
/* ------------------------------------------------------------------ */

/**
 * Pesan yang ditampilkan SEBAGAI PENGGANTI jawaban yang ditahan:
 * menyebut aturan yang dilanggar + detailnya, menyatakan jawaban
 * asli TIDAK ditampilkan (bukan diperbaiki diam-diam), dan mengajak
 * pengguna mengirim ulang. Tidak pernah memuat isi jawaban asli.
 */
export function formatQualityGateNotice(verdict: QualityGateVerdict): string {
  const lines: string[] = [
    'Jawaban AI ditahan — tidak lolos pemeriksaan kualitas.',
    '',
    'Jawaban asli tidak ditampilkan agar tidak menyesatkan. Pemeriksaan menemukan:',
  ];
  for (const v of verdict.violations) {
    lines.push(`• [${v.rule}] ${QUALITY_RULE_TITLES[v.rule]}: ${v.detail}`);
  }
  lines.push(
    '',
    'Silakan kirim ulang pertanyaan Anda, atau minta AI menjawab ulang dengan data yang benar.',
  );
  return lines.join('\n');
}
