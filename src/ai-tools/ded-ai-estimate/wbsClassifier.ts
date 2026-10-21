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
 * FINAL REVIEW (Tugas B) — perangkat listrik tanpa kata "listrik".
 *
 * Item seperti "Instalasi Titik Lampu" tidak memuat kata "listrik"/
 * "elektrikal" sehingga lolos dari keyword BGN-10-A. Pemetaan tambahan ini
 * SENGAJA konservatif:
 * - Frasa majemuk "titik lampu" / "stop kontak" / "saklar" adalah istilah
 *   pekerjaan instalasi itu sendiri (sebuah "titik" = titik instalasi);
 *   frasa ini memetakan ke BGN-10-A kecuali teksnya berkonteks NON-pekerjaan
 *   (pengadaan/pembelian/sewa/katalog/dekorasi — produk, bukan pekerjaan).
 * - Kata "lampu" sendirian TIDAK cukup: wajib ada kata konteks pekerjaan
 *   instalasi (instalasi/pemasangan/listrik/elektrikal), bukan "lampu jalan"
 *   (itu penerangan jalan — katalog JLN-07-B, bukan listrik bangunan).
 * - Item yang sudah menang ke plumbing (BGN-10-B) tidak pernah dibajak.
 * Hanya klasifikasi yang berubah — quantity/provenance/harga tidak disentuh.
 */
const ELECTRICAL_STRONG_TERMS = ['titik lampu', 'stop kontak', 'saklar'];
const ELECTRICAL_WEAK_TERMS = ['lampu'];
const ELECTRICAL_WORK_CONTEXT = ['instalasi', 'pemasangan', 'listrik', 'elektrikal'];
const NON_WORK_CONTEXT = [
  'pengadaan', 'pembelian', 'pengiriman', 'penyediaan material',
  'sewa', 'katalog', 'brosur', 'dekorasi', 'hiasan', 'pajangan',
];

function electricalDeviceNode(
  text: string,
  catalog: WbsNode[],
  currentBest: WbsNode | null
): WbsNode | null {
  if (currentBest?.code === 'BGN-10-B') return null; // plumbing menang — jangan dibajak
  if (NON_WORK_CONTEXT.some((t) => text.includes(t))) return null;
  const strong = ELECTRICAL_STRONG_TERMS.some((t) => text.includes(t));
  const weakWithContext =
    !text.includes('lampu jalan') &&
    ELECTRICAL_WEAK_TERMS.some((t) => text.includes(t)) &&
    ELECTRICAL_WORK_CONTEXT.some((t) => text.includes(t));
  if (!strong && !weakWithContext) return null;
  return catalog.find((n) => n.code === 'BGN-10-A') ?? null;
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

  // Tugas B: perangkat listrik berkonteks instalasi → BGN-10-A, mengalahkan
  // skor generik (termasuk "Lain-lain"/kelompok MEP generik), kecuali plumbing.
  if (projectType === 'BANGUNAN' || projectType === 'GEDUNG') {
    const electrical = electricalDeviceNode(text, catalog, best);
    if (electrical) best = electrical;
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
