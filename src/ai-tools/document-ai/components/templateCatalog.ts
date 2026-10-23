/**
 * AI DOCUMENT — Logika katalog Template Studio (polish §2).
 *
 * Fungsi MURNI untuk katalog template profesional: pengelompokan per
 * kategori, pencarian, dan preview struktur singkat dari scaffold meta.
 * Dipisah dari DocCreator agar dapat diuji tanpa render React.
 *
 * Kategori bersumber dari docTemplates.ts (TEMPLATE_CATEGORIES /
 * TEMPLATE_CATEGORY_BY_ID) — file ini tidak mendefinisikan kategori baru.
 * Template pengguna mengikuti kategori template dasarnya; yang dasarnya
 * tidak dikenal masuk grup 'template-saya' (tidak ditebak kategorinya).
 */
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_BY_ID,
  type TemplateCategory,
} from '../docTemplates';

export interface CatalogTemplateEntry {
  id: string;
  name: string;
  desc: string;
}

export type CatalogGroupId = TemplateCategory | 'template-saya';

export const CATALOG_GROUP_LABELS: Record<CatalogGroupId, string> = {
  ...Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c.id, c.label])),
  'template-saya': 'Template Saya',
} as Record<CatalogGroupId, string>;

/** Urutan tampil grup: 6 kategori resmi, lalu Template Saya. */
export const CATALOG_GROUP_ORDER: CatalogGroupId[] = [
  ...TEMPLATE_CATEGORIES.map((c) => c.id),
  'template-saya',
];

/**
 * Kategori katalog untuk satu entri template.
 * `userBaseById`: peta id template pengguna → id template dasarnya.
 */
export function catalogCategoryOf(
  entryId: string,
  userBaseById: ReadonlyMap<string, string>,
): CatalogGroupId {
  const base = userBaseById.get(entryId);
  if (base) return TEMPLATE_CATEGORY_BY_ID[base] ?? 'template-saya';
  return TEMPLATE_CATEGORY_BY_ID[entryId] ?? 'template-saya';
}

export interface CatalogGroup {
  id: CatalogGroupId;
  label: string;
  entries: CatalogTemplateEntry[];
}

/** Kelompokkan entri per kategori (urutan kanonis; grup kosong dibuang). */
export function groupCatalogEntries(
  entries: CatalogTemplateEntry[],
  userBaseById: ReadonlyMap<string, string>,
): CatalogGroup[] {
  const byGroup = new Map<CatalogGroupId, CatalogTemplateEntry[]>();
  for (const e of entries) {
    const g = catalogCategoryOf(e.id, userBaseById);
    const arr = byGroup.get(g) ?? [];
    arr.push(e);
    byGroup.set(g, arr);
  }
  return CATALOG_GROUP_ORDER.filter((g) => (byGroup.get(g)?.length ?? 0) > 0).map((g) => ({
    id: g,
    label: CATALOG_GROUP_LABELS[g],
    entries: byGroup.get(g) ?? [],
  }));
}

/** Saring entri dengan kata kunci pada nama/deskripsi (tidak peka huruf). */
export function filterCatalogEntries(
  entries: CatalogTemplateEntry[],
  query: string,
): CatalogTemplateEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q),
  );
}

/**
 * Preview struktur singkat dari teks scaffold meta: scaffold berbentuk
 * "Struktur: bagian satu, bagian dua (rinci, rinci), bagian tiga." —
 * pecah pada koma level teratas (koma di dalam kurung tidak memecah),
 * ambil maksimal `maxLines` segmen pertama.
 */
export function scaffoldPreviewLines(
  scaffold: string | undefined | null,
  maxLines = 4,
): string[] {
  if (!scaffold?.trim()) return [];
  const s = scaffold.replace(/^Struktur:\s*/i, '').trim();
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts
    .map((p) => p.trim().replace(/\.$/, ''))
    .filter(Boolean)
    .slice(0, maxLines);
}
