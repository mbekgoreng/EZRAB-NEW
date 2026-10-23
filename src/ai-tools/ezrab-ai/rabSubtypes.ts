/**
 * rabSubtypes — peta subtipe pekerjaan untuk klarifikasi Chat-to-RAB
 * (permintaan user 2026-10-23): user mengetik "buatkan rab jalan 1km" →
 * chat bertanya balik "Jalan apa?" dengan tombol subtipe; sesudah subtipe
 * dipilih, barulah tampil kartu jalur (Template / Full AI / DED).
 *
 * KEJUJURAN DATA: subtipe di sini BUKAN karangan — setiap subtipe membawa
 * `categories` + `match` yang dicocokkan ke katalog template NYATA
 * (RabTemplateService.getAllTemplates — sumber yang sama dengan menu
 * Template RAB). Pencocokan memakai teks yang sama dengan pencarian
 * katalog (nama + subkategori + deskripsi + id). Subtipe yang katalognya
 * kosong (saat ini: Makadam/Telford) TETAP ditawarkan karena lazim diminta
 * pengguna, tetapi jalur Template-nya wajib menjawab jujur "belum ada
 * template" — tidak pernah mengarang template. Tes data-grounding di
 * commandCenter.test.ts mengunci klaim ini terhadap katalog asli.
 *
 * Mekanisme generik: kategori baru cukup menambah satu grup di
 * RAB_SUBTYPE_GROUPS (kind dari rabNeeds + pertanyaan + daftar subtipe).
 */

import type { RabKind } from './rabNeeds';

export interface RabSubtype {
  /** Id stabil (dipakai sebagai param tombol & nilai RabNeeds.subtypeId) */
  id: string;
  /** Label tombol & ringkasan */
  label: string;
  /** Kata kunci yang diteruskan sebagai query pencarian katalog template */
  query: string;
  /** Deteksi subtipe dari teks pengguna (teks ternormalisasi, huruf kecil) */
  detect: RegExp;
  /** Kategori katalog (TemplateCategory) tempat subtipe ini dicari */
  categories: string[];
  /** Pencocok template terhadap teks gabungan nama+subkategori+deskripsi+id */
  match: RegExp;
}

export interface RabSubtypeGroup {
  kind: RabKind;
  /** Pertanyaan klarifikasi, mis. "Jalan apa?" */
  question: string;
  subtypes: RabSubtype[];
}

export const RAB_SUBTYPE_GROUPS: RabSubtypeGroup[] = [
  {
    kind: 'jalan',
    question: 'Jalan apa?',
    subtypes: [
      {
        id: 'hotmix',
        label: 'Hotmix / Aspal',
        query: 'aspal',
        detect: /\b(hotmix|hot mix|aspal|asphalt)\b/,
        categories: ['JALAN_TRANSPORTASI', 'PERKERASAN'],
        match: /aspal|hotmix/i,
      },
      {
        id: 'beton',
        label: 'Beton / Rigid',
        query: 'beton',
        detect: /\b(beton|rigid|rabat|cor)\b/,
        categories: ['JALAN_TRANSPORTASI', 'PERKERASAN'],
        match: /beton|rigid/i,
      },
      {
        id: 'paving',
        label: 'Paving Block',
        query: 'paving',
        detect: /\b(paving|konblok|conblock|grass ?block)\b/,
        categories: ['JALAN_TRANSPORTASI', 'PERKERASAN'],
        match: /paving|grass block/i,
      },
      {
        // Lazim diminta, tetapi katalog EZRAB saat ini TIDAK punya template
        // makadam/telford — jalur Template wajib menjawab jujur (lihat
        // actionRegistry RAB_PATH_TEMPLATE) dan mengarahkan ke Full AI.
        id: 'makadam',
        label: 'Makadam / Telford',
        query: 'makadam',
        detect: /\b(makadam|macadam|telford)\b/,
        categories: ['JALAN_TRANSPORTASI', 'PERKERASAN'],
        match: /makadam|macadam|telford/i,
      },
    ],
  },
  {
    kind: 'drainase',
    question: 'Drainase / saluran apa?',
    subtypes: [
      {
        id: 'uditch',
        label: 'U-Ditch Pracetak',
        query: 'u-ditch',
        detect: /\bu-?ditch\b/,
        categories: ['DRAINASE_SANITASI', 'SDA_IRIGASI'],
        match: /u-?ditch/i,
      },
      {
        id: 'gorong',
        label: 'Gorong-gorong / Box Culvert',
        query: 'gorong-gorong',
        detect: /\b(gorong|culvert)\b/,
        categories: ['DRAINASE_SANITASI', 'SDA_IRIGASI'],
        match: /gorong|culvert|cross drain/i,
      },
      {
        id: 'batu',
        label: 'Pasangan Batu Kali',
        query: 'pasangan batu',
        detect: /\b(pasangan batu|batu kali)\b/,
        categories: ['DRAINASE_SANITASI', 'SDA_IRIGASI'],
        match: /pasangan batu|batu kali/i,
      },
      {
        id: 'resapan',
        label: 'Resapan / Retensi',
        query: 'resapan',
        detect: /\b(resapan|french drain|detensi|retensi)\b/,
        categories: ['DRAINASE_SANITASI', 'SDA_IRIGASI'],
        match: /resapan|french drain|detensi|retensi/i,
      },
    ],
  },
  {
    kind: 'jembatan',
    question: 'Jembatan apa?',
    subtypes: [
      {
        id: 'gelagar',
        label: 'Gelagar Beton',
        query: 'gelagar',
        detect: /\b(gelagar|girder)\b/,
        categories: ['JEMBATAN_STRUKTUR'],
        match: /gelagar|girder/i,
      },
      {
        id: 'rangka-baja',
        label: 'Rangka Baja',
        query: 'rangka baja',
        detect: /\b(rangka baja|truss)\b/,
        categories: ['JEMBATAN_STRUKTUR'],
        match: /rangka baja|truss/i,
      },
      {
        id: 'box-culvert',
        label: 'Box Culvert',
        query: 'box culvert',
        detect: /\bbox culvert\b/,
        categories: ['JEMBATAN_STRUKTUR'],
        match: /box culvert/i,
      },
      {
        id: 'plat',
        label: 'Plat Beton (Slab)',
        query: 'slab',
        detect: /\b(plat|slab)\b/,
        categories: ['JEMBATAN_STRUKTUR'],
        match: /slab|plat beton/i,
      },
      {
        id: 'jpo',
        label: 'JPO (Penyeberangan Orang)',
        query: 'jpo',
        detect: /\b(jpo|penyeberangan)\b/,
        categories: ['JEMBATAN_STRUKTUR'],
        match: /jpo|penyeberangan/i,
      },
      {
        id: 'bailey',
        label: 'Darurat (Bailey)',
        query: 'bailey',
        detect: /\b(bailey|darurat)\b/,
        categories: ['JEMBATAN_STRUKTUR'],
        match: /bailey|darurat/i,
      },
    ],
  },
];

/** Grup subtipe untuk sebuah kategori pekerjaan (null bila tak punya peta). */
export function subtypeGroupFor(kind: RabKind | null): RabSubtypeGroup | null {
  if (!kind) return null;
  return RAB_SUBTYPE_GROUPS.find((g) => g.kind === kind) ?? null;
}

/** Subtipe berdasarkan id di dalam grup kind-nya. */
export function getSubtype(kind: RabKind | null, subtypeId: string | null): RabSubtype | null {
  const group = subtypeGroupFor(kind);
  if (!group || !subtypeId) return null;
  return group.subtypes.find((s) => s.id === subtypeId) ?? null;
}

/** Deteksi subtipe yang disebut eksplisit di teks (urutan grup = prioritas). */
export function detectSubtypeFromText(kind: RabKind | null, text: string): RabSubtype | null {
  const group = subtypeGroupFor(kind);
  if (!group) return null;
  const t = ` ${(text || '').toLowerCase().trim().replace(/\s+/g, ' ')} `;
  for (const s of group.subtypes) {
    if (s.detect.test(t)) return s;
  }
  return null;
}

/** Bentuk struktural minimal template katalog yang dibutuhkan pencocokan. */
export interface SubtypeTemplateLike {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  description?: string | null;
}

/**
 * Template NYATA di katalog yang cocok dengan subtipe: kategori termasuk
 * daftar subtipe DAN teks gabungan (nama + subkategori + deskripsi + id)
 * cocok dengan regex subtipe — cerminan bidang pencarian katalog.
 */
export function findSubtypeTemplates<T extends SubtypeTemplateLike>(
  subtype: RabSubtype,
  templates: T[]
): T[] {
  return templates.filter((tpl) => {
    if (!subtype.categories.includes(tpl.category)) return false;
    const hay = `${tpl.name} ${tpl.subcategory ?? ''} ${tpl.description ?? ''} ${tpl.id}`;
    return subtype.match.test(hay);
  });
}
