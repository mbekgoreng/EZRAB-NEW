/**
 * DED-to-RAB — Seleksi konteks WBS + anggaran prompt sistem (Sprint 1, Workstream A).
 *
 * Masalah yang diperbaiki: ketiga builder prompt DED dulu menyisipkan SELURUH
 * WORK_CLASSIFICATION_SPEC (±17,7 ribu karakter) SEBELUM aturan keluaran wajib,
 * sementara gateway memotong systemPrompt menjadi 8.000 karakter pertama
 * (api/_lib/security.js) — skema JSON + perintah "JSON murni" di ekor prompt
 * tidak pernah sampai ke model, model menjawab markdown, dan seluruh pass
 * terklasifikasi MALFORMED (NO_CALCULABLE_ITEMS).
 *
 * Modul ini:
 * 1. Memecah spesifikasi per seksi "## N." secara deterministik (hanya
 *    memotong teks yang ada — tidak mengarang isi, kode, atau item apa pun).
 * 2. Memilih seksi yang relevan per tipe proyek: selalu §0 (prinsip), §7
 *    (status bukti — disaring per mesin: sub-butir mesin lain dibuang), §8
 *    (larangan fabrikasi), dan satu seksi keluarga sesuai tipe. §2 (deteksi
 *    tipe) hanya untuk tipe tak dikenal (fallback aman: §0+§2+§6+§7+§8).
 *    §9/§10 hanya ditambahkan bila anggaran masih tersisa.
 * 3. Menegakkan anggaran keras: prompt sistem rakitan TIDAK BOLEH melebihi
 *    DED_SYSTEM_PROMPT_BUDGET_CHARS. Kontrak (identitas + kebijakan + aturan
 *    wajib + skema) TIDAK PERNAH dipotong; yang dikurangi hanya konteks, dari
 *    ekor tiap seksi pada batas baris/butir utuh dengan penanda "[…]".
 *    Bila kontrak saja sudah melebihi anggaran, dilempar DedPromptBudgetError
 *    terstruktur — prompt cacat tidak pernah dikirim diam-diam.
 */

import { WORK_CLASSIFICATION_SPEC } from './work-classification.generated';

export const DED_SYSTEM_PROMPT_BUDGET_CHARS = 7900;

export type WbsEngineKind = 'standard' | 'fullai';

export interface WbsContextSelection {
  /** Teks konteks terpilih (tanpa baris pembuka wrapper). */
  text: string;
  /** Nomor seksi yang benar-benar terpasang pada hasil akhir. */
  sectionsUsed: number[];
  /** true bila tipe proyek tidak dikenal dan strategi fallback dipakai. */
  fallback: boolean;
  /** Panjang blok konteks akhir (termasuk baris wrapper) setelah anggaran. */
  chars: number;
  /** Seksi keluarga WBS untuk tipe ini (6 pada fallback). */
  familySection: number | null;
  /** Seksi yang isinya dipotong sebagian oleh penegak anggaran. */
  trimmedSections: number[];
  /** Seksi yang dibuang utuh oleh penegak anggaran (§9/§10 tidak dihitung:
   *  keduanya memang hanya ditambahkan bila anggaran tersisa). */
  droppedSections: number[];
}

export class DedPromptBudgetError extends Error {
  readonly code = 'DED_PROMPT_BUDGET_EXCEEDED';
  readonly contractChars: number;
  readonly budgetChars: number;
  constructor(contractChars: number, budgetChars: number) {
    super(
      `Prompt sistem DED tidak dapat dirakit dalam anggaran ${budgetChars} karakter ` +
        `(bagian wajib saja berukuran ${contractChars} karakter). Analisis dihentikan ` +
        `daripada mengirim prompt yang terpotong diam-diam.`
    );
    this.name = 'DedPromptBudgetError';
    this.contractChars = contractChars;
    this.budgetChars = budgetChars;
  }
}

/** Pecah spesifikasi menjadi peta nomor seksi → teks seksi (header termasuk). */
export function splitWorkClassificationSpec(
  spec: string = WORK_CLASSIFICATION_SPEC
): Map<number, string> {
  const sections = new Map<number, string>();
  const re = /^## (\d+)\./gm;
  const marks: Array<{ n: number; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(spec))) marks.push({ n: Number(m[1]), at: m.index });
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : spec.length;
    sections.set(mark.n, spec.slice(mark.at, end).replace(/\s+$/, ''));
  });
  return sections;
}

const FAMILY_BY_TYPE: Record<string, number> = {
  BANGUNAN: 3,
  GEDUNG: 3,
  INDUSTRI: 3,
  BENDUNGAN: 4,
  IRIGASI: 4,
  'BANGUNAN AIR': 4,
  JALAN: 5,
  PAVING: 5,
  JEMBATAN: 6,
};

export function normalizeDedProjectType(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

/**
 * Saring §7 per mesin: sub-butir "- Mesin standar:" hanya untuk mesin standar
 * (fast/detail), "- Full AI:" hanya untuk mesin Full AI. Baris kelanjutan
 * sub-butir yang dibuang ikut dibuang; semua baris lain dipertahankan utuh.
 * Ini pemotongan (slicing), bukan penulisan ulang.
 */
export function filterEvidenceSectionForEngine(text: string, engine: WbsEngineKind): string {
  const dropLabel = engine === 'standard' ? 'Full AI' : 'Mesin standar';
  const lines = text.split('\n');
  const out: string[] = [];
  let dropping = false;
  let dropIndent = 0;
  for (const ln of lines) {
    const indent = ln.length - ln.trimStart().length;
    const bullet = ln.match(/^(\s*)- (Mesin standar|Full AI):/);
    if (dropping && ln.trim() !== '' && indent <= dropIndent) dropping = false;
    if (bullet && bullet[2] === dropLabel) {
      dropping = true;
      dropIndent = indent;
      continue;
    }
    if (dropping) continue;
    out.push(ln);
  }
  return out.join('\n');
}

export interface SelectWbsContextOptions {
  engine?: WbsEngineKind;
}

/** Pilih seksi WBS yang relevan untuk satu tipe proyek (deterministik). */
export function selectWbsContext(
  projectType: unknown,
  opts: SelectWbsContextOptions = {}
): WbsContextSelection {
  const engine = opts.engine ?? 'standard';
  const sections = splitWorkClassificationSpec();
  const type = normalizeDedProjectType(projectType);
  const known = Object.prototype.hasOwnProperty.call(FAMILY_BY_TYPE, type);
  const fallback = !known;
  const familySection = known ? FAMILY_BY_TYPE[type] : 6;
  const wanted = fallback ? [0, 2, 6, 7, 8] : [0, familySection, 7, 8];
  const parts: string[] = [];
  const used: number[] = [];
  for (const n of wanted) {
    const raw = sections.get(n);
    if (!raw) continue;
    parts.push(n === 7 ? filterEvidenceSectionForEngine(raw, engine) : raw);
    used.push(n);
  }
  const text = parts.join('\n\n');
  return {
    text,
    sectionsUsed: used,
    fallback,
    chars: text.length,
    familySection,
    trimmedSections: [],
    droppedSections: [],
  };
}

/** Seksi opsional (§9 hierarki, §10 penunjuk mode): hanya untuk ditambahkan
 *  bila anggaran tersisa — tidak pernah memicu pemotongan kontrak. */
export function optionalWbsSections(): Array<{ section: number; text: string }> {
  const sections = splitWorkClassificationSpec();
  const out: Array<{ section: number; text: string }> = [];
  for (const n of [9, 10]) {
    const raw = sections.get(n);
    if (raw) out.push({ section: n, text: raw });
  }
  return out;
}

const CONTEXT_HEADER =
  'SPESIFIKASI KLASIFIKASI & WBS DED–RAB (wajib diikuti; katalog kandidat per tipe — pilih kelompok sesuai bukti, jangan disalin semua):\n' +
  'Token tipe: BANGUNAN, GEDUNG, BANGUNAN AIR, JALAN, PAVING, BENDUNGAN, IRIGASI, JEMBATAN, INDUSTRI.';

/**
 * Batas bawah (floor) satu seksi saat dipotong: kepala seksi yang paling
 * kritis tidak boleh hilang.
 * - §7: sampai akhir baris pertama yang memuat PROPOSED_NOT_IN_SOURCE
 *   (ketiga nama status bukti harus selalu hadir).
 * - §3: sampai akhir baris pertama item bernomor 7 (kelompok interior).
 * - §0: sampai akhir butir utama pertama (prinsip katalog kandidat).
 * - §8: sampai akhir butir utama kedua (larangan AHSP + larangan peralatan
 *   karangan).
 * - Lainnya: fraksi tetap dari panjang seksi.
 */
function sectionFloor(section: number, text: string): number {
  const lines = text.split('\n');
  const endOfLineContaining = (pred: (ln: string) => boolean): number => {
    let acc = 0;
    for (const ln of lines) {
      if (pred(ln)) return acc + ln.length + 8; // + penanda "[…]" & slack
      acc += ln.length + 1;
    }
    return -1;
  };
  const endOfNthTopBullet = (nth: number): number => {
    // Posisi awal tiap butir utama (baris diawali "- "); akhir butir ke-n =
    // awal butir ke-(n+1), atau akhir teks bila butir ke-n adalah yang terakhir.
    const starts: number[] = [];
    let acc = 0;
    for (const ln of lines) {
      if (/^- /.test(ln)) starts.push(acc);
      acc += ln.length + 1;
    }
    if (starts.length < nth) return -1;
    const end = nth < starts.length ? starts[nth] : text.length;
    return end + 8; // + penanda "[…]" & slack
  };
  switch (section) {
    case 7: {
      const p = endOfLineContaining((ln) => ln.includes('PROPOSED_NOT_IN_SOURCE'));
      return p > 0 ? p : Math.ceil(text.length * 0.6);
    }
    case 3: {
      const p = endOfLineContaining((ln) => /^7\.\s/.test(ln));
      return p > 0 ? p : Math.ceil(text.length * 0.5);
    }
    case 0: {
      const p = endOfNthTopBullet(1);
      return p > 0 ? Math.min(p, text.length) : Math.ceil(text.length * 0.35);
    }
    case 8: {
      // Butir pertama §8 = larangan mengarang kode/koefisien/harga AHSP —
      // larangan fabrikasi paling kritis; itulah floor-nya.
      const p = endOfNthTopBullet(1);
      return p > 0 ? Math.min(p, text.length) : Math.ceil(text.length * 0.45);
    }
    case 2:
      return Math.ceil(text.length * 0.4);
    default:
      return Math.ceil(text.length * 0.45);
  }
}

const TRIM_MARKER = '\n[…]';

/**
 * Potong teks seksi sampai ≤ maxChars pada batas utuh: tidak pernah memotong
 * di tengah baris, dan tidak berakhir di tengah butir terbungkus (baris
 * kelanjutan yang menjorok dibuang mundur sampai awal butirnya). Penanda
 * "[…]" ditambahkan tepat di dalam seksi yang dipotong.
 */
export function trimSectionText(
  text: string,
  maxChars: number
): { text: string; trimmed: boolean } {
  if (text.length <= maxChars) return { text, trimmed: false };
  const limit = Math.max(0, maxChars - TRIM_MARKER.length);
  const lines = text.split('\n');
  const kept: string[] = [];
  let len = 0;
  for (const ln of lines) {
    const add = (kept.length > 0 ? 1 : 0) + ln.length;
    if (len + add > limit) break;
    kept.push(ln);
    len += add;
  }
  // Jangan berakhir di tengah butir terbungkus: baris terakhir yang disimpan
  // tidak boleh baris kelanjutan (menjorok) yang induknya ikut terpotong.
  while (kept.length > 1) {
    const last = kept[kept.length - 1];
    const isContinuation = /^\s/.test(last) && !/^\s*- /.test(last);
    if (!isContinuation) break;
    kept.pop();
  }
  if (kept.length === 0) {
    // Baris pertama saja sudah melebihi batas (mis. tabel harga satu baris
    // yang dipisah "; " / " | "): potong pada pemisah daftar terakhir yang
    // muat — tidak pernah mengembalikan teks melebihi maxChars.
    const first = lines[0] ?? '';
    let cut = -1;
    for (const sep of ['; ', ' | ', ', ']) {
      const idx = first.lastIndexOf(sep, limit);
      if (idx > cut) cut = idx;
    }
    const sliced = cut > 0 ? first.slice(0, cut) : first.slice(0, limit);
    return { text: sliced + TRIM_MARKER, trimmed: true };
  }
  return { text: kept.join('\n') + TRIM_MARKER, trimmed: true };
}

export interface AssembleOptions {
  budget?: number;
  engine?: WbsEngineKind;
  /** Blok opsional di paling akhir prompt (mis. tabel referensi harga Full AI).
   *  Dipotong pada batas baris — atau dibuang — sebelum error dilempar. */
  optionalTail?: string;
}

export interface AssembledDedPrompt {
  system: string;
  selection: WbsContextSelection;
}

/**
 * Rakit prompt sistem final: kontrak (tidak pernah diubah) + header konteks +
 * seksi WBS terpilih (+ §9/§10 bila muat) (+ ekor opsional). Menegakkan
 * anggaran: potong konteks dari prioritas terendah-nilai (keluarga → §2 →
 * §7 → §0 → §8), selalu menghormati floor tiap seksi; lempar
 * DedPromptBudgetError bila kontrak saja sudah melebihi anggaran.
 */
export function assembleDedSystemPrompt(
  contract: string,
  projectType: unknown,
  opts: AssembleOptions = {}
): AssembledDedPrompt {
  const budget = opts.budget ?? DED_SYSTEM_PROMPT_BUDGET_CHARS;
  const engine = opts.engine ?? 'standard';
  const base = selectWbsContext(projectType, { engine });
  const sections = splitWorkClassificationSpec();

  interface Part {
    section: number;
    text: string;
  }
  const parts: Part[] = base.sectionsUsed.map((n) => ({
    section: n,
    text:
      n === 7
        ? filterEvidenceSectionForEngine(sections.get(n) ?? '', engine)
        : (sections.get(n) ?? ''),
  }));
  let tail = opts.optionalTail ?? '';
  const trimmedSections: number[] = [];
  const droppedSections: number[] = [];

  const render = (): string =>
    contract +
    '\n\n' +
    CONTEXT_HEADER +
    '\n\n' +
    parts.map((p) => p.text).join('\n\n') +
    (tail ? '\n\n' + tail : '');

  let system = render();

  if (system.length > budget) {
    const family = base.familySection;
    const ladder: number[] = [];
    if (family != null) ladder.push(family);
    for (const n of [2, 7, 0, 8]) if (!ladder.includes(n)) ladder.push(n);
    for (const target of ladder) {
      if (system.length <= budget) break;
      const part = parts.find((p) => p.section === target);
      if (!part) continue;
      const floor = sectionFloor(target, part.text);
      if (part.text.length <= floor) continue;
      const excess = system.length - budget;
      const newLen = Math.max(floor, part.text.length - excess);
      const res = trimSectionText(part.text, newLen);
      if (res.trimmed) {
        part.text = res.text;
        if (!trimmedSections.includes(target)) trimmedSections.push(target);
        system = render();
      }
    }
  }

  if (system.length > budget && tail) {
    const excess = system.length - budget;
    if (tail.length <= excess) {
      tail = '';
    } else {
      const res = trimSectionText(tail, tail.length - excess);
      tail = res.trimmed ? res.text : '';
    }
    system = render();
    // Ekor adalah konteks opsional murni: bila potongan pada batas daftar
    // belum cukup, buang seluruhnya — jangan pernah melebihi anggaran.
    if (system.length > budget && tail) {
      tail = '';
      system = render();
    }
  }

  if (system.length > budget) {
    throw new DedPromptBudgetError(contract.length, budget);
  }

  // §9/§10: tambahkan hanya bila anggaran benar-benar tersisa.
  const usedNow = parts.map((p) => p.section);
  for (const opt of optionalWbsSections()) {
    if (usedNow.includes(opt.section)) continue;
    const candidate = system + '\n\n' + opt.text;
    if (candidate.length <= budget) {
      parts.push({ section: opt.section, text: opt.text });
      usedNow.push(opt.section);
      system = render();
    }
  }

  const selection: WbsContextSelection = {
    text: parts.map((p) => p.text).join('\n\n'),
    sectionsUsed: usedNow,
    fallback: base.fallback,
    chars: (CONTEXT_HEADER + '\n\n' + parts.map((p) => p.text).join('\n\n')).length,
    familySection: base.familySection,
    trimmedSections,
    droppedSections,
  };
  return { system, selection };
}

/** Pintasan untuk builder: rakit dan kembalikan string prompt sistem saja. */
export function buildDedSystemPrompt(
  contract: string,
  projectType: unknown,
  opts: AssembleOptions = {}
): string {
  return assembleDedSystemPrompt(contract, projectType, opts).system;
}
