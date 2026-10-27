/**
 * rabNeeds — ekstraksi kebutuhan RAB dari teks chat (Fase 2 Chat-to-RAB).
 *
 * Prinsip: HANYA mengekstrak yang benar-benar disebutkan pengguna. Kolom yang
 * tidak disebut tetap null dan ditanyakan lewat "Lengkapi kebutuhan" — tidak
 * pernah diisi asumsi diam-diam. Parser ini murni & deterministik (tanpa AI,
 * tanpa kredit), dipakai intentRouter (typed) dan view (refinement).
 */

export type RabKind =
  | 'rumah'
  | 'gedung'
  | 'jalan'
  | 'drainase'
  | 'jembatan'
  | 'irigasi'
  | 'renovasi'
  | 'ded'
  | 'lainnya';

export interface RabNeeds {
  kind: RabKind | null;
  /** Kata jenis apa adanya dari teks (mis. "ruko", "villa", "paving") */
  kindLabel: string | null;
  /** Subtipe pekerjaan terpilih/terdeteksi (id dari peta rabSubtypes, mis. "hotmix") */
  subtypeId: string | null;
  /** Label subtipe untuk tampilan (mis. "Hotmix / Aspal") */
  subtypeLabel: string | null;
  /** Panjang pekerjaan linear dalam meter (jalan/saluran/jembatan), dari "1 km" / "500 m" */
  lengthM: number | null;
  floors: number | null;
  /** Luas bangunan eksplisit (m²), dari "90 m2" / "luas 90" */
  buildingArea: number | null;
  landLength: number | null;
  landWidth: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carport: boolean | null;
  location: string | null;
}

export const emptyRabNeeds = (): RabNeeds => ({
  kind: null,
  kindLabel: null,
  subtypeId: null,
  subtypeLabel: null,
  lengthM: null,
  floors: null,
  buildingArea: null,
  landLength: null,
  landWidth: null,
  bedrooms: null,
  bathrooms: null,
  carport: null,
  location: null,
});

const KIND_PATTERNS: Array<{ kind: RabKind; label: string; re: RegExp }> = [
  { kind: 'ded', label: 'dari dokumen DED', re: /\b(ded|gambar kerja|gambar teknis|denah pdf)\b/ },
  { kind: 'drainase', label: 'drainase / saluran', re: /\b(drainase|saluran air|gorong|u-?ditch)\b/ },
  { kind: 'jembatan', label: 'jembatan', re: /\bjembatan\b/ },
  { kind: 'irigasi', label: 'bendungan / irigasi', re: /\b(bendungan|bendung|embung|irigasi)\b/ },
  { kind: 'jalan', label: 'jalan / perkerasan', re: /\b(jalan|perkerasan|paving|rabat beton|aspal)\b/ },
  { kind: 'renovasi', label: 'renovasi', re: /\b(renovasi|rehab|perbaikan rumah|perbaikan gedung)\b/ },
  { kind: 'gedung', label: 'gedung', re: /\b(gedung|kantor|ruko|villa|gudang|sekolah|masjid|kos|kontrakan|apartemen|hotel|toko)\b/ },
  { kind: 'rumah', label: 'rumah tinggal', re: /\brumah\b/ },
];



/* ------------------------------------------------------------------ */
/* Pemisahan LAHAN vs BANGUNAN (remediasi S7, 2026-10-22).             */
/* "lahan 8x12" adalah dimensi LAHAN — bukan tapak bangunan; "luas     */
/* lahan 90 m2" adalah luas lahan — bukan luas bangunan. Helper di     */
/* sini dipakai specRab (generate spek bebas) dan directRab (kartu      */
/* pilihan) agar frasa lahan diekstrak sebagai lahan dan DIBUANG dari   */
/* teks sebelum ekstraksi kebutuhan bangunan berjalan.                  */
/* ------------------------------------------------------------------ */

const LAND_AREA_RE =
  /luas\s*(?:lahan|tanah)\s*(?:=|sekitar|kurang lebih)?\s*(\d+(?:[.,]\d+)?)\s*(?:m(?:2|²)?)?|\b(?:lahan|tanah)\s*(?:seluas\s*)?(\d+(?:[.,]\d+)?)\s*m(?:2|²)/;

const LAND_DIMS_RE =
  /(?:^|[\s,;])(?:lahan|tanah)\s*(?:ukuran\s*)?(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/;

/** Luas lahan eksplisit dalam m² ("luas lahan 90 m2", "lahan 90 m2"). */
export function parseLandAreaM2(rawText: string): number | null {
  const t = (rawText || '').toLowerCase();
  const m = t.match(LAND_AREA_RE);
  if (!m) return null;
  const v = parseFloat((m[1] ?? m[2]).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Dimensi lahan eksplisit ("lahan 8x12", "tanah ukuran 6 x 15"). */
export function parseLandDims(rawText: string): { p: number; l: number } | null {
  const t = (rawText || '').toLowerCase();
  const m = t.match(LAND_DIMS_RE);
  if (!m) return null;
  const p = parseFloat(m[1].replace(',', '.'));
  const l = parseFloat(m[2].replace(',', '.'));
  return Number.isFinite(p) && Number.isFinite(l) && p > 0 && l > 0 ? { p, l } : null;
}

/** Luas lahan total: dari m² eksplisit, atau hasil kali dimensi lahan. */
export function resolveLandAreaM2(rawText: string): number | null {
  const explicit = parseLandAreaM2(rawText);
  if (explicit != null) return explicit;
  const dims = parseLandDims(rawText);
  return dims ? dims.p * dims.l : null;
}

/**
 * Buang frasa lahan (luas m² + dimensi) dari teks agar ekstraksi kebutuhan
 * bangunan tidak membacanya sebagai luas/dimensi BANGUNAN.
 */
export function stripLandPhrases(rawText: string): string {
  return (rawText || '')
    .replace(new RegExp(LAND_AREA_RE.source, 'g'), ' ')
    .replace(new RegExp(LAND_DIMS_RE.source, 'g'), ' ');
}

const WORD_FLOORS: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
};

/**
 * Jumlah lantai dari teks, semua bentuk yang dipakai pengguna Indonesia.
 * Urutan pemeriksaan menyelesaikan dua ambiguitas nyata:
 * - "5x10 lantai 2": pola "<angka> lantai" akan menelan angka dimensi
 *   ("10 lantai" → 10). Karena itu kecocokan "<angka> lantai" yang
 *   angkanya adalah ekor dimensi (didahului 'x'/'×') DILEWATI, lalu
 *   bentuk "lantai 2" (remediasi S7b) yang menang.
 * - "2 lantai 3 kamar": bentuk "lantai <angka>" akan salah memungut
 *   angka kamar — karena itu "<angka> lantai" yang sah dicek lebih dulu.
 * Lalu kata bilangan ("dua lantai" / "lantai dua") dan "bertingkat" (= 2,
 * konvensi katalog). Null bila tidak disebut.
 */
export function parseFloorsMention(text: string): number | null {
  const t = ` ${(text || '').toLowerCase()} `;
  const beforeRe = /(\d+)\s*lantai/g;
  let bm: RegExpExecArray | null;
  while ((bm = beforeRe.exec(t)) !== null) {
    const prev = bm.index > 0 ? t[bm.index - 1] : ' ';
    if (prev === 'x' || prev === '×') continue; // ekor dimensi, bukan lantai
    return parseInt(bm[1], 10);
  }
  const after = t.match(/\blantai\s*(\d+)/);
  if (after) return parseInt(after[1], 10);
  const wordAfter = t.match(/\blantai\s+(satu|dua|tiga|empat|lima)\b/);
  if (wordAfter) return WORD_FLOORS[wordAfter[1]];
  const wordBefore = t.match(/\b(satu|dua|tiga|empat|lima)\s+lantai\b/);
  if (wordBefore) return WORD_FLOORS[wordBefore[1]];
  if (/\bbertingkat\b/.test(t)) return 2;
  return null;
}

/** Kategori pekerjaan linear (panjang adalah kebutuhan utamanya). */
export function isLinearKind(kind: RabKind | null): boolean {
  return kind === 'jalan' || kind === 'drainase' || kind === 'jembatan' || kind === 'irigasi';
}

/**
 * Panjang pekerjaan linear dari teks: "panjang 1 km", "1 km", "500 m",
 * "panjang 250 meter". Mengembalikan nilai meter + rentang teks yang
 * terpakai (dipakai untuk menetralkan tafsir "km" sebagai kamar mandi).
 * Bentuk meter polos ("500 m") hanya diterima bila teks tidak memuat
 * pola dimensi "AxB" (yang sudah ditangani ekstraksi dimensi generik).
 */
export function parseLinearLength(
  text: string,
  hasDims: boolean
): { value: number; span: [number, number] } | null {
  const t = ` ${text.toLowerCase().trim().replace(/\s+/g, ' ')} `;
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const panjang = t.match(
    /panjang\s*(?:=|sekitar|kurang lebih)?\s*(\d+(?:[.,]\d+)?)\s*(km|kilometer|m|meter)\b/
  );
  if (panjang) {
    const v = num(panjang[1]) * (panjang[2].startsWith('k') ? 1000 : 1);
    if (Number.isFinite(v) && v > 0) {
      return { value: v, span: [panjang.index ?? 0, (panjang.index ?? 0) + panjang[0].length] };
    }
  }
  const kmMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer)\b/);
  if (kmMatch) {
    const v = num(kmMatch[1]) * 1000;
    if (Number.isFinite(v) && v > 0) {
      return { value: v, span: [kmMatch.index ?? 0, (kmMatch.index ?? 0) + kmMatch[0].length] };
    }
  }
  if (!hasDims) {
    const mMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(m|meter)\b/);
    if (mMatch) {
      const v = num(mMatch[1]);
      if (Number.isFinite(v) && v > 0) {
        return { value: v, span: [mMatch.index ?? 0, (mMatch.index ?? 0) + mMatch[0].length] };
      }
    }
  }
  return null;
}

/** Format panjang untuk ringkasan: 1000 → "1 km (1.000 m)", 250 → "250 m". */
export function formatLengthM(m: number): string {
  const meters = `${m.toLocaleString('id-ID')} m`;
  if (m >= 1000) {
    const km = (m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 3 });
    return `${km} km (${meters})`;
  }
  return meters;
}

/** Ekstrak kebutuhan dari satu teks. Tidak menebak kolom yang tak disebut. */
export function extractRabNeeds(text: string, base?: RabNeeds): RabNeeds {
  const t = ` ${text.toLowerCase().trim().replace(/\s+/g, ' ')} `;
  const n: RabNeeds = base ? { ...base } : emptyRabNeeds();

  for (const k of KIND_PATTERNS) {
    if (k.re.test(t)) {
      n.kind = k.kind;
      const m = t.match(k.re);
      n.kindLabel = k.kind === 'gedung' && m ? m[0].trim() : k.label;
      break;
    }
  }

  const floors = parseFloorsMention(text);
  if (floors != null) n.floors = floors;

  const dims = t.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m?\b/);
  if (dims) {
    n.landLength = parseFloat(dims[1].replace(',', '.'));
    n.landWidth = parseFloat(dims[2].replace(',', '.'));
  }

  /* Panjang pekerjaan linear (jalan/drainase/jembatan): "1 km" adalah
   * PANJANG, bukan "1 kamar mandi" — rentang teks kilometer dibuang dari
   * salinan yang dipakai regex kamar mandi di bawah. */
  let tForBathrooms = t;
  if (isLinearKind(n.kind)) {
    const len = parseLinearLength(text, Boolean(dims));
    if (len) {
      n.lengthM = len.value;
      tForBathrooms = `${t.slice(0, len.span[0])} ${t.slice(len.span[1])}`;
    }
  }

  const area = t.match(/(?:luas(?:\s+bangunan)?|lb)\s*(?:=|sekitar|kurang lebih)?\s*(\d+(?:[.,]\d+)?)\s*m/) ||
    t.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²|eter persegi|\s*persegi)/);
  if (area) n.buildingArea = parseFloat(area[1].replace(',', '.'));

  const kt = t.match(/(\d+)\s*(?:kamar tidur|kt)\b/);
  if (kt) n.bedrooms = parseInt(kt[1], 10);
  const km = tForBathrooms.match(/(\d+)\s*(?:kamar mandi|km)\b/);
  if (km) n.bathrooms = parseInt(km[1], 10);
  if (/\bcarport\b/.test(t)) n.carport = !/\b(tanpa|tidak ada|nggak ada|ga ada)\s+carport\b/.test(t);

  const loc = t.match(/\bdi\s+([a-z][a-z\s]{2,24}?)(?=\s*(?:,|\.|$|\d+\s*lantai|\d+\s*m\b))/);
  if (loc && !/^(sini|sana|dalam|luar|atas|bawah|rumah|gedung)\b/.test(loc[1].trim())) {
    n.location = loc[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return n;
}

/** Apakah teks ini jawaban refinement (angka/dimensi) dan bukan perintah baru? */
export function looksLikeNeedsAnswer(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(buka|buatkan|bikin|tampilkan|lihat|cari|hitung total|berapa)\b/.test(t) && !/^\s*\d/.test(t)) return false;
  return /(\d+\s*lantai|lantai\s*\d+|\d+\s*[x×]\s*\d+|\d+\s*m2|\d+\s*m²|luas\s*\d+|\d+\s*kamar|\d+\s*kt\b|\d+\s*km\b|carport)/.test(t);
}

/** Kolom penting yang belum terisi — untuk pertanyaan "Lengkapi kebutuhan". */
export function missingNeeds(n: RabNeeds): string[] {
  const missing: string[] = [];
  if (!n.kind) missing.push('jenis pekerjaan');
  if (n.kind === 'rumah' || n.kind === 'gedung' || !n.kind) {
    if (!n.floors) missing.push('jumlah lantai');
    if (!n.buildingArea && !(n.landLength && n.landWidth)) missing.push('luas bangunan atau ukuran tanah (mis. 6 × 15 m)');
    if (n.kind === 'rumah' && !n.bedrooms) missing.push('jumlah kamar tidur');
  }
  return missing;
}

/** Susun prompt desain untuk AI Design Studio dari kebutuhan terkonfirmasi. */
export function buildDesignPrompt(n: RabNeeds, rawText: string): string {
  if (n.kind !== 'rumah' && n.kind !== 'gedung' && n.kind !== 'renovasi') return rawText;
  const parts: string[] = [];
  parts.push(`Buatkan ${n.kindLabel ?? 'rumah tinggal'} ${n.floors ? `${n.floors} lantai` : '1 lantai'}`);
  if (n.landLength && n.landWidth) parts.push(`ukuran ${n.landLength} × ${n.landWidth} m`);
  if (n.buildingArea) parts.push(`luas bangunan ${n.buildingArea} m²`);
  if (n.bedrooms) parts.push(`${n.bedrooms} kamar tidur`);
  if (n.bathrooms) parts.push(`${n.bathrooms} kamar mandi`);
  parts.push('ruang tamu, dapur');
  if (n.carport) parts.push('carport');
  return `${parts.join(', ')}.`;
}

/** Ringkasan kebutuhan dalam format chat (bisa dibaca & dikoreksi pengguna). */
export function summarizeRabNeeds(
  n: RabNeeds,
  missing: string[],
  opts?: { closingLine?: boolean; hints?: boolean }
): string {
  const lines: string[] = ['Baik — ini ringkasan kebutuhan yang saya tangkap dari pesan Anda:'];
  const row = (label: string, value: string | null) =>
    lines.push(`• ${label}: ${value ?? '— (belum disebutkan)'}`);
  row('Jenis pekerjaan', n.kindLabel);
  if (isLinearKind(n.kind)) {
    if (n.subtypeLabel) row('Jenis / subtipe', n.subtypeLabel);
    row('Panjang', n.lengthM ? formatLengthM(n.lengthM) : null);
  }
  if (n.kind === 'rumah' || n.kind === 'gedung' || n.kind === 'renovasi' || !n.kind) {
    row('Jumlah lantai', n.floors ? `${n.floors} lantai` : null);
    row('Luas bangunan', n.buildingArea ? `${n.buildingArea} m²` : null);
    row('Ukuran tanah', n.landLength && n.landWidth ? `${n.landLength} × ${n.landWidth} m` : null);
    if (n.kind === 'rumah' || !n.kind) {
      row('Kamar tidur', n.bedrooms ? `${n.bedrooms}` : null);
      row('Kamar mandi', n.bathrooms ? `${n.bathrooms}` : null);
      row('Carport', n.carport === null ? null : n.carport ? 'ada' : 'tidak ada');
    }
  }
  if (n.location) row('Lokasi', n.location);
  if (opts?.hints === false) {
    /* Blok petunjuk diserahkan ke pemanggil (alur subtipe/jalur). */
  } else if (missing.length > 0) {
    lines.push(`Masih kurang: ${missing.join('; ')}.`);
    lines.push('Anda bisa melengkapinya lewat tombol "Lengkapi kebutuhan" atau langsung koreksi di chat, misalnya "2 lantai, 6x15, 3 kamar tidur".');
  } else {
    lines.push('Datanya sudah cukup untuk mulai. Anda tetap bisa mengoreksinya di dalam workspace.');
  }
  if (opts?.closingLine !== false) {
    lines.push('Belum ada yang dibuka otomatis — klik "Buka Workspace Desain & RAB" bila ringkasan ini sudah benar.');
  }
  return lines.join('\n');
}
