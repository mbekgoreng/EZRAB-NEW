/**
 * DED ESTIMATE — Klasifikasi WBS
 *
 * Memetakan item DED ke katalog WBS berdasarkan keyword.
 * - Satu item = satu kelompok utama (ambil skor tertinggi).
 * - Tidak mengubah quantity, provenance, atau price.
 * - Item tidak cocok → kelompok "Lain-lain".
 */
import { WbsNode, WbsItemStatus, getWbsCatalog } from './wbsCatalog';
import { DedAiItem } from './types';

export interface ClassifiedItem extends DedAiItem {
  wbsCode?: string;
  wbsName?: string;
  wbsStatus: WbsItemStatus;
  wbsParentCode?: string;
}

export interface WbsGroup {
  node: WbsNode;
  items: ClassifiedItem[];
  subtotal: number;
  itemCount: number;
  validCount: number;
  issueCount: number;
}

/**
 * Klasifikasikan satu item ke WBS.
 * Mengembalikan node dengan skor keyword tertinggi.
 */
export function classifyToWbs(
  item: DedAiItem,
  projectType: string
): { node: WbsNode | null; status: WbsItemStatus } {
  const catalog = getWbsCatalog(projectType);
  const text = `${item.name} ${item.category} ${item.specification || ''}`.toLowerCase();

  let best: WbsNode | null = null;
  let bestScore = 0;

  // Prioritaskan subkelompok (lebih spesifik) daripada kelompok
  const sorted = [...catalog].sort((a, b) => {
    if (a.level === 'subkelompok' && b.level !== 'subkelompok') return -1;
    if (b.level === 'subkelompok' && a.level !== 'subkelompok') return 1;
    return 0;
  });

  for (const node of sorted) {
    let score = 0;
    for (const kw of node.keywords) {
      if (text.includes(kw.toLowerCase())) {
        // Keyword lebih panjang = lebih spesifik = skor lebih tinggi
        score += kw.length;
      }
    }
    // Bonus untuk subkelompok (lebih spesifik daripada kelompok)
    if (node.level === 'subkelompok' && score > 0) {
      score *= 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }

  // Tentukan status berdasarkan quantitySource
  let status: WbsItemStatus = 'IDENTIFIED';
  if (item.quantitySource === 'DERIVED' || item.quantitySource === 'DED_GEOMETRIC') {
    status = 'DERIVED';
  } else if (item.quantitySource === 'AI_INFERENCE' || item.quantitySource === 'ASSUMPTION') {
    status = 'NEEDS_CONFIRM';
  } else if (item.quantitySource === 'UNRESOLVED' || item.quantity == null) {
    status = 'NEEDS_CONFIRM';
  }

  return { node: best, status };
}

/**
 * Kelompokkan items ke dalam struktur WBS.
 * Mengembalikan groups yang HANYA berisi kelompok dengan item aktual.
 * Kelompok kosong tidak ditampilkan di hasil utama.
 */
export function groupByWbs(
  items: DedAiItem[],
  projectType: string
): { groups: WbsGroup[]; unclassified: ClassifiedItem[] } {
  const catalog = getWbsCatalog(projectType);
  const groupMap = new Map<string, WbsGroup>();
  const unclassified: ClassifiedItem[] = [];

  for (const item of items) {
    const { node, status } = classifyToWbs(item, projectType);
    const classified: ClassifiedItem = {
      ...item,
      wbsCode: node?.code,
      wbsName: node?.name,
      wbsStatus: status,
      wbsParentCode: node?.parentCode,
    };

    if (!node) {
      unclassified.push(classified);
      continue;
    }

    // Naik ke level kelompok untuk grouping utama
    let groupCode = node.code;
    let groupNode = node;
    if (node.level === 'subkelompok' && node.parentCode) {
      const parent = catalog.find((n) => n.code === node.parentCode);
      if (parent) {
        groupCode = parent.code;
        groupNode = parent;
      }
    }

    let group = groupMap.get(groupCode);
    if (!group) {
      group = { node: groupNode, items: [], subtotal: 0, itemCount: 0, validCount: 0, issueCount: 0 };
      groupMap.set(groupCode, group);
    }

    group.items.push(classified);
    group.itemCount++;
    if (item.subtotal != null && item.subtotal > 0) {
      group.subtotal += item.subtotal;
      group.validCount++;
    } else {
      group.issueCount++;
    }
  }

  // Urutkan berdasarkan order katalog
  const groups = Array.from(groupMap.values()).sort((a, b) => a.node.order - b.node.order);

  return { groups, unclassified };
}

/**
 * Dapatkan kandidat opsional dari katalog yang BELUM ada itemnya.
 * Untuk ditampilkan di panel terpisah — TIDAK masuk total.
 */
export function getOptionalCandidates(
  projectType: string,
  existingWbsCodes: Set<string>
): WbsNode[] {
  const catalog = getWbsCatalog(projectType);
  return catalog.filter(
    (n) => n.level === 'subkelompok' && !existingWbsCodes.has(n.code)
  );
}
