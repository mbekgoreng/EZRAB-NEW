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
  | 'renovasi'
  | 'ded'
  | 'lainnya';

export interface RabNeeds {
  kind: RabKind | null;
  /** Kata jenis apa adanya dari teks (mis. "ruko", "villa", "paving") */
  kindLabel: string | null;
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
  { kind: 'jalan', label: 'jalan / perkerasan', re: /\b(jalan|perkerasan|paving|rabat beton|aspal)\b/ },
  { kind: 'renovasi', label: 'renovasi', re: /\b(renovasi|rehab|perbaikan rumah|perbaikan gedung)\b/ },
  { kind: 'gedung', label: 'gedung', re: /\b(gedung|kantor|ruko|villa|gudang|sekolah|masjid|kos|kontrakan|apartemen|hotel|toko)\b/ },
  { kind: 'rumah', label: 'rumah tinggal', re: /\brumah\b/ },
];



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

  const floors = t.match(/(\d+)\s*lantai/);
  if (floors) n.floors = parseInt(floors[1], 10);

  const dims = t.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m?\b/);
  if (dims) {
    n.landLength = parseFloat(dims[1].replace(',', '.'));
    n.landWidth = parseFloat(dims[2].replace(',', '.'));
  }

  const area = t.match(/(?:luas(?:\s+bangunan)?|lb)\s*(?:=|sekitar|kurang lebih)?\s*(\d+(?:[.,]\d+)?)\s*m/) ||
    t.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²|eter persegi|\s*persegi)/);
  if (area) n.buildingArea = parseFloat(area[1].replace(',', '.'));

  const kt = t.match(/(\d+)\s*(?:kamar tidur|kt)\b/);
  if (kt) n.bedrooms = parseInt(kt[1], 10);
  const km = t.match(/(\d+)\s*(?:kamar mandi|km)\b/);
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
  return /(\d+\s*lantai|\d+\s*[x×]\s*\d+|\d+\s*m2|\d+\s*m²|luas\s*\d+|\d+\s*kamar|\d+\s*kt\b|\d+\s*km\b|carport)/.test(t);
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
export function summarizeRabNeeds(n: RabNeeds, missing: string[]): string {
  const lines: string[] = ['Baik — ini ringkasan kebutuhan yang saya tangkap dari pesan Anda:'];
  const row = (label: string, value: string | null) =>
    lines.push(`• ${label}: ${value ?? '— (belum disebutkan)'}`);
  row('Jenis pekerjaan', n.kindLabel);
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
  if (missing.length > 0) {
    lines.push(`Masih kurang: ${missing.join('; ')}.`);
    lines.push('Anda bisa melengkapinya lewat tombol "Lengkapi kebutuhan" atau langsung koreksi di chat, misalnya "2 lantai, 6x15, 3 kamar tidur".');
  } else {
    lines.push('Datanya sudah cukup untuk mulai. Anda tetap bisa mengoreksinya di dalam workspace.');
  }
  lines.push('Belum ada yang dibuka otomatis — klik "Buka Workspace Desain & RAB" bila ringkasan ini sudah benar.');
  return lines.join('\n');
}
