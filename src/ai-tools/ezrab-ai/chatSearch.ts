/**
 * EZRAB AI — Chat-local AHSP search (remediasi Batch 1, 2026-10-28).
 *
 * Lapisan CHAT saja. File ini TIDAK mengubah scoring
 * `officialAhspRepository.searchOfficialAhsp` maupun semantik resolver harga
 * bersama (keduanya dipakai adapter kanonis DED). Engine ini membaca katalog
 * aktif + resolver, lalu menerapkan aturannya sendiri:
 *
 * - Lookup kode eksak dulu (getOfficialAhsp); kode yang tidak ada dijawab
 *   NOT_FOUND eksplisit — tidak pernah disubstitusi hasil text search.
 * - Normalisasi kueri: buang kata tanya/stopword, pertahankan istilah
 *   konstruksi, rasio, notasi mutu, dan satuan yang diminta.
 * - Pencocokan batas kata (token), bukan substring mentah — "duduk" tidak
 *   lagi cocok dengan "dudukan". Substring hanya bonus kecil (+1) dan tidak
 *   pernah mengalahkan kecocokan token (+3).
 * - Varian ejaan sempit yang terdokumentasi: kloset <-> closet.
 * - Ambang relevansi: skor < 3 (tanpa satu pun kecocokan token) = NOT_FOUND.
 *   Daftar generik tidak pernah ditampilkan sebagai jawaban.
 * - Spesifier keras: rasio (1:4) atau notasi mutu (K-225) yang tidak cocok
 *   dengan item mana pun => NOT_FOUND + penjelasan, bukan item curing/tiang.
 * - Satuan: bila satuan diminta, item yang satuannya cocok diprioritaskan;
 *   bila TIDAK ADA item cocok bersatuan sesuai => NOT_FOUND + near-miss
 *   (bukan item bersatuan lain sebagai jawaban). Item bersatuan berbeda
 *   yang tetap ditampilkan selalu disertai peringatan eksplisit — tidak
 *   pernah ada konversi diam-diam.
 * - Provenance: sumber koefisien (sourceDocument) DIPISAH dari dasar harga
 *   (komposisi HSD / DHSP resmi / master katalog / belum tersedia).
 *   Status record VERIFIED tidak lagi ditempel sebagai bukti relevansi.
 * - Item demolisi (bongkar/pembongkaran) disaring kecuali kueri menyebut
 *   bongkar — cerminan perilaku searchOfficialAhsp.
 */
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { getAhspDirectPrice } from '../../data/priceDatabase2026/ahspDisplayPolicy';
import { ahspChatPriceSuffix } from './ahspChatPrice';

export type ChatSearchOutcome = 'FOUND_RELEVANT' | 'FOUND_PARTIAL' | 'NOT_FOUND';

export type ChatPriceOrigin = 'COMPOSITION' | 'DHSP' | 'MASTER' | 'UNAVAILABLE';

export interface ChatSearchItem {
  code: string;
  title: string;
  unit: string;
  /** Sufiks harga dari ahspChatPriceSuffix (sudah termasuk label lengkap/parsial). */
  priceSuffix: string;
  priceOrigin: ChatPriceOrigin;
  pricingStatus: string;
  resolvedComponents: number;
  totalComponents: number;
  /** Nama sumber HSD komponen yang ter-resolve (unik, apa adanya dari resolver). */
  hsdSources: string[];
  /** Dokumen koefisien dari record (mis. Lampiran VI SE DJBK No. 47/SE/Dk/2026). */
  coefficientSource: string;
  /** Sumber DHSP resmi bila origin DHSP (mis. SE ... (Daftar Harga Satuan Pekerjaan, Baris N)). */
  dhspSource: string | null;
  /** True bila satuan katalog != satuan yang diminta. */
  unitMismatch: boolean;
  /** Istilah konten yang cocok token pada item ini. */
  matchedTerms: string[];
  score: number;
}

export interface ChatSearchResult {
  outcome: ChatSearchOutcome;
  /** Kueri mentah pengguna (untuk pesan, bukan untuk scoring). */
  rawQuery: string;
  /** Istilah konten setelah normalisasi. */
  terms: string[];
  /** Satuan yang diminta (normalisasi), atau null. */
  requestedUnit: string | null;
  /** Kode eksak yang terdeteksi, bila ada. */
  codeQuery: string | null;
  /** Spesifier yang gagal cocok (kode/rasio/mutu/satuan), bila ada. */
  unmatchedSpecifier: string | null;
  /** Item jawaban (maks 8). */
  items: ChatSearchItem[];
  /** Item skor-teratas bersatuan berbeda (hanya bila satuan diminta). */
  flaggedItems: ChatSearchItem[];
  /** Catatan kecocokan sebagian / klarifikasi (PARTIAL). */
  note: string | null;
  /** Pesan NOT_FOUND lengkap (hanya bila outcome NOT_FOUND). */
  notFoundMessage: string | null;
}

/* ------------------------------------------------------------------ */
/* Normalisasi                                                         */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'dan', 'atau', 'yang', 'berapa', 'berapakah', 'harganya', 'harga', 'per',
  'apa', 'itu', 'ini', 'adalah', 'untuk', 'dari', 'dengan', 'di', 'ke',
  'pada', 'dalam', 'bagaimana', 'gimana', 'mohon', 'tolong', 'saya', 'mau',
  'cari', 'carikan', 'search', 'ahsp', 'kode', 'pekerjaan', 'pemasangan',
  'pembuatan', 'pasang', 'buatkan', 'satuan', 'jika', 'kalau', 'apabila',
  'tidak', 'ada', 'tersedia', 'ditemukan', 'sebuah', 'satu', 'rp',
  'tolong', 'dong', 'ya', 'kah', 'sih', 'aja', 'saja',
  // "campuran" generik — maknanya dibawa rasio (1:4) atau istilah lain,
  // bukan kata itu sendiri. Tanpa ini, "plesteran dinding campuran 1:4"
  // kalah dari item pasangan bata yang kebetulan memuat "campuran".
  'campuran',
]);

/** Varian ejaan sempit yang terdokumentasi (katalog memakai "closet"). */
const SPELLING_MAP: Record<string, string> = { kloset: 'closet' };

const UNIT_TOKENS = new Set(['m2', 'm3', 'kg', "m'", 'buah', 'unit', 'titik', 'ls', 'm']);

const DEMOLITION_RE = /bongkar|pembongkaran|dibongkar/;

export function normalizeUnit(u: string | null | undefined): string {
  return String(u ?? '').toLowerCase().replace(/[²]/g, '2').replace(/[³]/g, '3').trim();
}

function tokenize(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[²]/g, '2')
    .replace(/[³]/g, '3')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => SPELLING_MAP[t] ?? t);
}

export interface NormalizedChatQuery {
  terms: string[];
  requestedUnit: string | null;
  /** { a, b } untuk rasio a:b atau aSP:bPP. */
  ratio: { a: string; b: string } | null;
  /** Notasi mutu ternormalisasi: 'k225' atau 'fc20'. */
  grade: string | null;
  /** Kode eksak yang terdeteksi (bentuk penuh), atau null. */
  codeQuery: string | null;
  hasDemolitionWord: boolean;
}

function extractUnit(text: string): string | null {
  const m =
    text.match(/\bm\s*2\b|m²|\bm\s*3\b|m³|\bkg\b|m'|\bbuah\b|\bunit\b|\btitik\b|\bls\b/) ||
    text.match(/m\s*2|m²|m\s*3|m³/);
  if (!m) return null;
  const raw = m[0].replace(/\s+/g, '').replace('²', '2').replace('³', '3');
  if (raw.startsWith('m2')) return 'm2';
  if (raw.startsWith('m3')) return 'm3';
  if (raw === 'kg') return 'kg';
  if (raw === "m'") return "m'";
  return raw; // buah | unit | titik | ls
}

export function normalizeChatQuery(raw: string): NormalizedChatQuery {
  const text = String(raw ?? '').toLowerCase().trim();
  const requestedUnit = extractUnit(text);

  // Kode eksak: seluruh kueri, atau sisa setelah buang stopword.
  // Bentuk yang diterima: numerik (3.7.4, 9.9.9.9), huruf (B.38),
  // campuran huruf-angka (A.2.01.b1.1), dan parenthesized (2.3.(21a)).
  const stripped = text.replace(/[?.,!\s]+$/g, '').trim();
  const codeShape = /^(\d+(\.\d+)+[a-z]?|[a-z][a-z0-9]*(\.[a-z0-9]+)+|\d+(\.\d+)*\.\([0-9a-z]+\))$/i;
  let codeQuery: string | null = null;
  if (codeShape.test(stripped)) {
    codeQuery = stripped;
  } else {
    const ws = text.split(/\s+/).map((t) => t.replace(/[?.,!]+$/g, ''));
    const rest = ws.filter((t) => t && !STOPWORDS.has(t));
    if (rest.length === 1 && codeShape.test(rest[0])) codeQuery = rest[0];
  }

  let ratio: NormalizedChatQuery['ratio'] = null;
  const ratioMatch =
    text.match(/(\d+)\s*:\s*(\d+)/) || text.match(/(\d+)\s*sp\s*:\s*(\d+)\s*pp/);
  if (ratioMatch) ratio = { a: ratioMatch[1], b: ratioMatch[2] };

  let grade: string | null = null;
  const kMatch = text.match(/\bk\s*-?\s*(\d+)/);
  const fcMatch = text.match(/\bf\s*'?\s*c\s*(\d+)/);
  if (kMatch) grade = `k${kMatch[1]}`;
  else if (fcMatch) grade = `fc${fcMatch[1]}`;

  const terms: string[] = [];
  for (const t of tokenize(text)) {
    if (STOPWORDS.has(t)) continue;
    if (UNIT_TOKENS.has(t)) continue;
    if (/^\d+$/.test(t)) continue; // dimensi/angka bukan diskriminator judul
    if (t.length < 2) continue;
    if (!terms.includes(t)) terms.push(t);
  }

  return {
    terms,
    requestedUnit,
    ratio,
    grade,
    codeQuery,
    hasDemolitionWord: DEMOLITION_RE.test(text),
  };
}

/* ------------------------------------------------------------------ */
/* Harga + provenance per item                                         */
/* ------------------------------------------------------------------ */

function buildChatItem(item: any, requestedUnit: string | null): ChatSearchItem {
  let comp: any = null;
  try {
    comp = priceResolver2026.resolveAhspUnitPrice(item);
  } catch {
    comp = null;
  }
  const direct = comp ? getAhspDirectPrice(comp) : null;
  const baked =
    typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : null;
  let priceOrigin: ChatPriceOrigin;
  if (direct !== null && direct !== undefined) {
    priceOrigin = comp && comp.totalComponents > 0 ? 'COMPOSITION' : 'DHSP';
  } else if (baked !== null) {
    priceOrigin = 'MASTER';
  } else {
    priceOrigin = 'UNAVAILABLE';
  }
  const hsdSources: string[] = [];
  if (comp) {
    for (const cat of [comp.labor, comp.material, comp.equipment]) {
      for (const c of cat?.components ?? []) {
        if (c?.resolved && c.sourceName && !hsdSources.includes(c.sourceName)) {
          hsdSources.push(c.sourceName);
        }
      }
    }
  }
  const title = String(item.title ?? item.name ?? '-');
  return {
    code: String(item.code ?? '-'),
    title,
    unit: String(item.unit ?? ''),
    priceSuffix: ahspChatPriceSuffix(item),
    priceOrigin,
    pricingStatus: comp ? String(comp.pricingStatus ?? '') : '',
    resolvedComponents: comp ? Number(comp.resolvedComponents ?? 0) : 0,
    totalComponents: comp ? Number(comp.totalComponents ?? 0) : 0,
    hsdSources,
    coefficientSource: String(item.sourceDocument ?? ''),
    dhspSource: comp ? (comp.provenanceSource ?? null) : null,
    unitMismatch:
      requestedUnit !== null && normalizeUnit(item.unit) !== requestedUnit,
    matchedTerms: [],
    score: 0,
  };
}

function provenanceLine(it: ChatSearchItem): string {
  const coef = it.coefficientSource
    ? `Sumber koefisien: ${it.coefficientSource}`
    : 'Sumber koefisien: tidak tercantum';
  let basis: string;
  if (it.priceOrigin === 'COMPOSITION') {
    basis = `Dasar harga: dihitung dari komposisi (koefisien × HSD: ${it.hsdSources.length ? it.hsdSources.join(', ') : 'input HSD tidak tercantum'})`;
  } else if (it.priceOrigin === 'DHSP') {
    basis = `Dasar harga: harga DHSP resmi${it.dhspSource ? ` (${it.dhspSource})` : ''}`;
  } else if (it.priceOrigin === 'MASTER') {
    basis = 'Dasar harga: harga master katalog (bukan hasil komposisi komponen)';
  } else {
    basis = 'Harga belum tersedia (bukan Rp0)';
  }
  // Wilayah/periode HSD tidak terekam terpisah pada record AHSP — ungkapkan,
  // jangan karang. (Nama sumber HSD sendiri memuat referensi dokumen/tahun.)
  return `${coef} · ${basis} · Wilayah/periode HSD: tidak tercantum terpisah pada record ini`;
}

/* ------------------------------------------------------------------ */
/* Pencarian                                                           */
/* ------------------------------------------------------------------ */

/** Perbandingan kode hierarkis (3.6.1.2 < 3.6.1.10) — bukan leksikografis. */
function compareCodes(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function ratioMatchesTitle(a: string, b: string, title: string): boolean {
  return new RegExp(`${a}\\s*SP\\s*:\\s*${b}\\s*PP`, 'i').test(title);
}

function gradeMatchesTitle(grade: string, title: string): boolean {
  const normTitle = title.toLowerCase().replace(/[\s'\-]/g, '');
  return normTitle.includes(grade);
}

function scoreItem(
  title: string,
  terms: string[],
  ratio: NormalizedChatQuery['ratio'],
  grade: string | null,
): { matched: string[]; score: number } {
  const tokens = tokenize(title);
  const titleLower = title.toLowerCase();
  const matched: string[] = [];
  let score = 0;
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    if (tokens.includes(t)) {
      matched.push(t);
      // Istilah pertama = kata kerja/pekerjaan utama ("plesteran dinding",
      // "pasangan bata") — bobot ganda agar tidak kalah dari istilah objek
      // generik ("dinding") yang muncul di ratusan judul.
      score += i === 0 ? 6 : 3;
    } else if (titleLower.includes(t)) {
      // Bonus substring kecil — tidak pernah mengalahkan kecocokan token.
      score += 1;
    }
  }
  if (ratio && ratioMatchesTitle(ratio.a, ratio.b, title)) score += 4;
  if (grade && gradeMatchesTitle(grade, title)) score += 4;
  return { matched, score };
}

export function searchChatAhsp(
  rawQuery: string,
  opts?: { unit?: string },
): ChatSearchResult {
  const raw = String(rawQuery ?? '').trim();
  const n = normalizeChatQuery(raw);
  const requestedUnit = opts?.unit ? normalizeUnit(opts.unit) : n.requestedUnit;

  const base: Omit<ChatSearchResult, 'outcome' | 'notFoundMessage'> = {
    rawQuery: raw,
    terms: n.terms,
    requestedUnit,
    codeQuery: n.codeQuery,
    unmatchedSpecifier: null,
    items: [],
    flaggedItems: [],
    note: null,
  };
  const notFound = (specifier: string | null, message: string): ChatSearchResult => ({
    ...base,
    outcome: 'NOT_FOUND',
    unmatchedSpecifier: specifier,
    notFoundMessage: message,
  });

  const active = officialAhspRepository.getActiveOfficialAhsp();

  // 1. Kode eksak dulu — tidak pernah jatuh ke text search.
  if (n.codeQuery) {
    const exact: any = officialAhspRepository.getOfficialAhsp(n.codeQuery);
    if (exact) {
      const it = buildChatItem(exact, requestedUnit);
      it.matchedTerms = [];
      it.score = 100;
      return { ...base, outcome: 'FOUND_RELEVANT', items: [it], notFoundMessage: null };
    }
    // Awalan kelompok (maks 2 segmen, mis. "3.7") bukan kode lengkap yang
    // salah — tampilkan keluarganya sebagai PARTIAL, bukan NOT_FOUND.
    // Kode lengkap (>= 3 segmen) yang tidak ada tetap NOT_FOUND tegas.
    const segments = n.codeQuery.split('.').length;
    if (segments <= 2) {
      const prefix = n.codeQuery.toLowerCase() + '.';
      const family = (active as any[])
        .filter((it) => String(it.code ?? '').toLowerCase().startsWith(prefix))
        .sort((a, b) => compareCodes(String(a.code), String(b.code)))
        .slice(0, 8)
        .map((it) => {
          const built = buildChatItem(it, requestedUnit);
          built.score = 50;
          return built;
        });
      if (family.length > 0) {
        return {
          ...base,
          outcome: 'FOUND_PARTIAL',
          items: family,
          note: `Kode ${n.codeQuery} adalah awalan kelompok — menampilkan item di bawahnya; sebutkan kode lengkap untuk satu item.`,
          notFoundMessage: null,
        };
      }
    }
    return notFound(
      n.codeQuery,
      `Kode ${n.codeQuery} tidak ditemukan di katalog AHSP 2026 resmi. ` +
        'Periksa kembali kodenya — kode yang tidak ada tidak diganti dengan item lain.',
    );
  }

  // 2. Spesifier keras: rasio / mutu yang tidak cocok dengan item mana pun.
  if (n.ratio) {
    const anyRatio = active.some((it: any) =>
      ratioMatchesTitle(n.ratio!.a, n.ratio!.b, String(it.title ?? it.name ?? '')),
    );
    if (!anyRatio) {
      return notFound(
        `rasio ${n.ratio.a}:${n.ratio.b}`,
        `Tidak ditemukan item dengan rasio ${n.ratio.a}:${n.ratio.b} di katalog AHSP 2026. ` +
          'Coba rasio lain (mis. plesteran 1:4) atau sebutkan nama pekerjaannya.',
      );
    }
  }
  if (n.grade) {
    const anyGrade = active.some((it: any) =>
      gradeMatchesTitle(n.grade!, String(it.title ?? it.name ?? '')),
    );
    if (!anyGrade) {
      const gradeLabel = n.grade.startsWith('k')
        ? `K-${n.grade.slice(1)}`
        : `f'c ${n.grade.slice(2)} MPa`;
      return notFound(
        n.grade,
        `Notasi mutu ${gradeLabel} tidak memiliki padanan langsung di katalog AHSP 2026 — ` +
          'item beton di katalog memakai notasi f\'c (MPa), bukan K-xxx, dan tidak ditemukan ' +
          `item dengan notasi ${gradeLabel}. Sebutkan mutu f'c yang dimaksud (mis. f'c 20 MPa) ` +
          'atau pekerjaan yang memakai beton tersebut (sloof/kolom/pelat), agar saya carikan item yang tepat.',
      );
    }
  }

  // 3. Tanpa istilah konten => tidak ada yang bisa dicari.
  if (n.terms.length === 0) {
    return notFound(
      null,
      `Kata kunci "${raw}" terlalu umum setelah dibersihkan — sebutkan nama pekerjaan ` +
        'atau kodenya (mis. "plesteran 1:4", "3.7.4").',
    );
  }

  // 4. Scoring batas kata atas katalog aktif.
  const scored: ChatSearchItem[] = [];
  for (const it of active as any[]) {
    const title = String(it.title ?? it.name ?? '');
    if (!n.hasDemolitionWord && DEMOLITION_RE.test(title.toLowerCase())) continue;
    const { matched, score } = scoreItem(title, n.terms, n.ratio, n.grade);
    if (score <= 0) continue;
    const built = buildChatItem(it, requestedUnit);
    built.matchedTerms = matched;
    built.score = score;
    scored.push(built);
  }
  const topScore = scored.reduce((m, it) => Math.max(m, it.score), 0);
  if (topScore < 3) {
    return notFound(
      null,
      `Tidak ditemukan AHSP untuk "${raw}" di katalog AHSP 2026 resmi. ` +
        'Coba kata yang lebih umum — nama pekerjaannya saja (mis. "beton", "pasangan bata", ' +
        'galian tanah") atau potongan kodenya.',
    );
  }
  const topAll = scored
    .filter((it) => it.score === topScore)
    .sort((a, b) => compareCodes(a.code, b.code));

  // 5. Satuan yang diminta mengalahkan urutan katalog.
  let answer: ChatSearchItem[];
  let flagged: ChatSearchItem[] = [];
  if (requestedUnit) {
    const compatible = topAll.filter((it) => !it.unitMismatch);
    if (compatible.length === 0) {
      const nearMiss = topAll
        .slice(0, 4)
        .map((it) => `[${it.code}] ${it.title} — ${it.unit}`)
        .join('; ');
      return notFound(
        `satuan ${requestedUnit}`,
        `Tidak ditemukan "${n.terms.join(' ')}" dengan satuan ${requestedUnit} di katalog AHSP 2026. ` +
          `Item terdekat memakai satuan berbeda: ${nearMiss}. ` +
          'Item bersatuan berbeda bukan jawaban untuk satuan yang diminta — ' +
          'tanyakan ulang dengan satuan yang sesuai, atau sebutkan pekerjaan yang dimaksud.',
      );
    }
    answer = compatible.slice(0, 8);
    flagged = topAll.filter((it) => it.unitMismatch).slice(0, 4);
  } else {
    answer = topAll.slice(0, 8);
  }

  const broad = topAll.length > 8;
  const allMatched = answer.every((it) => it.matchedTerms.length === n.terms.length);
  const outcome: ChatSearchOutcome = allMatched && !broad ? 'FOUND_RELEVANT' : 'FOUND_PARTIAL';

  let note: string | null = null;
  if (outcome === 'FOUND_PARTIAL') {
    if (broad) {
      note =
        `Kata kunci "${raw}" terlalu umum — ${topAll.length} item cocok dengan skor tertinggi. ` +
        'Persempit dengan nama pekerjaan yang lebih spesifik (tambah jenis pekerjaan atau spesifikasinya), lalu tanya lagi.';
    } else {
      const first = answer[0];
      const unmatched = n.terms.filter((t) => !first.matchedTerms.includes(t));
      const matchedDesc = [
        ...(first.matchedTerms.length ? [`"${first.matchedTerms.join('", "')}"`] : []),
        ...(n.ratio ? [`rasio ${n.ratio.a}:${n.ratio.b}`] : []),
        ...(n.grade ? [`mutu ${n.grade}`] : []),
      ].join(' + ');
      note =
        `Cocok sebagian: ${unmatched.length ? `istilah "${unmatched.join('", "')}" tidak tercantum di judul record; ` : ''}` +
        `hasil di bawah ini cocok dengan ${matchedDesc || 'sebagian istilah'}. ` +
        'Periksa judulnya sebelum memakai harganya.';
    }
  }

  return { ...base, outcome, items: answer, flaggedItems: flagged, note, notFoundMessage: null };
}

/* ------------------------------------------------------------------ */
/* Format output (dipakai tool cari_ahsp + klarifikasi AHSP)            */
/* ------------------------------------------------------------------ */

function formatItemLine(it: ChatSearchItem, index: number, requestedUnit: string | null): string {
  const head = `${index + 1}. [${it.code}] ${it.title} — ${it.unit}${it.priceSuffix}`;
  const lines = [`${head}\n   ${provenanceLine(it)}`];
  if (it.unitMismatch && requestedUnit) {
    lines.push(
      `   ⚠ Satuan katalog (${it.unit}) berbeda dari satuan yang Anda minta (${requestedUnit}) — angka ini per ${it.unit}, ` +
        `bukan per ${requestedUnit}. Jangan dikonversi tanpa data geometri.`,
    );
  }
  return lines.join('\n');
}

export function formatChatAhspResult(result: ChatSearchResult): string {
  if (result.outcome === 'NOT_FOUND') {
    return result.notFoundMessage ?? `Tidak ditemukan AHSP untuk "${result.rawQuery}".`;
  }
  const parts: string[] = [];
  if (result.outcome === 'FOUND_PARTIAL' && result.note) {
    parts.push(`Hasil cocok sebagian untuk "${result.rawQuery}":\n${result.note}`);
  }
  parts.push(result.items.map((it, i) => formatItemLine(it, i, result.requestedUnit)).join('\n'));
  if (result.flaggedItems.length > 0) {
    parts.push(
      'Item berikut satuannya berbeda dengan yang Anda minta — ditampilkan hanya sebagai ' +
        'pemberitahuan, bukan sebagai jawaban:\n' +
        result.flaggedItems.map((it, i) => formatItemLine(it, i, result.requestedUnit)).join('\n'),
    );
  }
  return parts.join('\n\n');
}
