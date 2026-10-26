import type { NationalAHSPItem, AHSPDomain } from '../../data/nationalCostDatabase/types';

/**
 * Pengelompokan dropdown "Kategori AHSP" di tab Dari AHSP (SmartAddWorkItemModal).
 *
 * Masalah lama: opsi dropdown adalah daftar datar `item.category` (38 nilai
 * campur aduk: A.1.02, DIVISI 5, BINA_MARGA, III.1, UNSPECIFIED, ...) sehingga
 * pengguna tidak bisa membedakan jenis AHSP-nya. Padahal setiap item sudah
 * membawa `domain` resmi (CIPTA_KARYA / BINA_MARGA / SUMBER_DAYA_AIR / SMKK /
 * CUSTOM). Helper ini mengelompokkan kategori per domain, dalam urutan tetap
 * yang sama dengan urutan yang diminta owner.
 *
 * Kunci filter berbentuk `domain::category` (bukan category saja) supaya dua
 * domain yang kebetulan memakai nama kategori yang sama tidak pernah tercampur
 * — termasuk kategori buatan user di grup CUSTOM.
 */

/** Urutan grup di dropdown: Cipta Karya, Bina Marga, SDA, SMKK, Custom. */
export const AHSP_DOMAIN_ORDER: AHSPDomain[] = [
  'CIPTA_KARYA',
  'BINA_MARGA',
  'SUMBER_DAYA_AIR',
  'SMKK',
  'CUSTOM',
];

export const AHSP_DOMAIN_LABELS: Record<AHSPDomain, string> = {
  CIPTA_KARYA: 'CIPTA KARYA',
  BINA_MARGA: 'BINA MARGA',
  SUMBER_DAYA_AIR: 'SDA — SUMBER DAYA AIR',
  SMKK: 'SMKK',
  CUSTOM: 'CUSTOM — AHSP SAYA',
};

export interface AhspCategoryOption {
  /** Kunci filter: `domain::category`. */
  key: string;
  name: string;
  count: number;
}

export interface AhspCategoryGroup {
  domain: AHSPDomain;
  label: string;
  total: number;
  categories: AhspCategoryOption[];
}

/** Kunci filter untuk satu item AHSP. */
export function ahspGroupKey(item: {
  domain: AHSPDomain;
  category: string;
}): string {
  return `${item.domain}::${item.category}`;
}

/**
 * Kelompokkan daftar item AHSP menjadi grup per domain. Hanya grup yang punya
 * isi yang dikembalikan (grup CUSTOM muncul hanya bila ada AHSP custom).
 * Di dalam grup, kategori diurutkan jumlah item menurun, lalu nama menaik.
 */
export function groupAhspCategories(
  items: NationalAHSPItem[],
): AhspCategoryGroup[] {
  const perDomain = new Map<AHSPDomain, Map<string, number>>();
  for (const item of items) {
    const domain = item.domain;
    if (!perDomain.has(domain)) perDomain.set(domain, new Map());
    const cats = perDomain.get(domain)!;
    const cat = item.category || 'UNSPECIFIED';
    cats.set(cat, (cats.get(cat) || 0) + 1);
  }

  const groups: AhspCategoryGroup[] = [];
  for (const domain of AHSP_DOMAIN_ORDER) {
    const cats = perDomain.get(domain);
    if (!cats || cats.size === 0) continue;
    const categories: AhspCategoryOption[] = [...cats.entries()]
      .map(([name, count]) => ({
        key: `${domain}::${name}`,
        name,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    groups.push({
      domain,
      label: AHSP_DOMAIN_LABELS[domain],
      total: categories.reduce((sum, c) => sum + c.count, 0),
      categories,
    });
  }
  return groups;
}
