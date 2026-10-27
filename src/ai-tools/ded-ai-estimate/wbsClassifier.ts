/**
 * DED ESTIMATE — Klasifikasi WBS
 *
 * Memetakan item DED ke katalog WBS berdasarkan keyword.
 * - Satu item = satu kelompok utama (ambil skor tertinggi).
 * - Tidak mengubah quantity, provenance, atau price.
 * - Item tidak cocok → tidak terkategorisasi (bukan "Lain-lain" palsu);
 *   label kategori asli item tetap dipertahankan di mana-mana
 *   (item.category, laporan, finalisasi) — hanya panel WBS yang
 *   menampilkannya sebagai "tidak terkategorisasi".
 *
 * Alignment WBS 2026-10-28 — pencarian lintas katalog:
 * - Katalog utama = katalog projectType (perilaku lama, tidak berubah).
 * - Bila katalog utama tidak cocok, SEMUA katalog lain dicari dengan
 *   skor yang sama persis dan skor berapa pun di atas 0 menang.
 * - Bila katalog utama SUDAH cocok, katalog lain hanya menang bila
 *   skornya melebihi skor utama dengan MARGIN ≥ 7 (kira-kira satu kata
 *   kunci distintif). Tanpa margin, dua kata generik di katalog lain
 *   ('jembatan' + 'struktur' = 16 di JLN-06) akan menggusur kata
 *   spesifik katalog utama ('oprit' = 10 di JMB-03-C) — padahal itemnya
 *   jelas milik proyek jembatan. Seri dan selisih kecil tetap milik
 *   katalog utama. Ambang ini dipin oleh tes (oprit selisih 6 kalah,
 *   saluran irigasi selisih 8 menang).
 *   Ini yang membuat item bendung/irigasi/jalan pada proyek campuran
 *   tetap terkelompok benar meski projectType-nya BANGUNAN/BANGUNAN AIR,
 *   tanpa mengubah hasil lama yang sudah cocok.
 * - Override perangkat listrik (Tugas B) tetap hanya untuk
 *   BANGUNAN/GEDUNG dan tetap mengalahkan skor generik.
 */
import { WbsNode, WbsItemStatus, WBS_CATALOGS, getWbsCatalog } from './wbsCatalog';
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

  // Skor satu katalog dengan aturan lama persis (subkelompok didahulukan,
  // skor = jumlah panjang keyword yang cocok, bonus ×2 untuk subkelompok).
  // Dipakai untuk katalog utama maupun lintas katalog agar perbandingan
  // skor antarkatalog bersifat apel-ke-apel dan deterministik.
  const scoreCatalog = (nodes: WbsNode[]): { node: WbsNode | null; score: number } => {
    let best: WbsNode | null = null;
    let bestScore = 0;
    const sorted = [...nodes].sort((a, b) => {
      if (a.level === 'subkelompok' && b.level !== 'subkelompok') return -1;
      if (b.level === 'subkelompok' && a.level !== 'subkelompok') return 1;
      return 0;
    });
    for (const node of sorted) {
      let score = 0;
      for (const kw of node.keywords) {
        if (text.includes(kw.toLowerCase())) {
          score += kw.length;
        }
      }
      if (node.level === 'subkelompok' && score > 0) {
        score *= 2;
      }
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return { node: best, score: bestScore };
  };

  const primary = scoreCatalog(catalog);
  let best = primary.node;
  let bestScore = primary.score;

  // Tugas B: perangkat listrik berkonteks instalasi → BGN-10-A, mengalahkan
  // skor generik (termasuk "Lain-lain"/kelompok MEP generik), kecuali plumbing.
  // Perilaku lama dipertahankan persis: override ini mengakhiri pencarian
  // (tidak ada katalog lain yang boleh membajaknya).
  if (projectType === 'BANGUNAN' || projectType === 'GEDUNG') {
    const electrical = electricalDeviceNode(text, catalog, best);
    if (electrical) return { node: electrical, status: wbsStatusOf(item) };
  }

  // Lintas katalog (alignment WBS): hanya katalog yang BUKAN katalog utama
  // (perbandingan identitas array — GEDUNG berbagi array dengan BANGUNAN,
  // jadi keduanya dilewati bersama). Pemenang lintas katalog dibandingkan
  // dengan skor UTAMA (bukan skor berjalan), dengan margin ≥ 7 bila skor
  // utama > 0; bila skor utama 0, skor berapa pun di atas 0 cukup.
  // Urutan katalog pendaftaran menjadi penentu seri antarkatalog luar.
  let crossBest: WbsNode | null = null;
  let crossScore = 0;
  for (const nodes of Object.values(WBS_CATALOGS)) {
    if (nodes === catalog) continue;
    const candidate = scoreCatalog(nodes);
    if (candidate.node && candidate.score > crossScore) {
      crossBest = candidate.node;
      crossScore = candidate.score;
    }
  }
  if (crossBest && (bestScore === 0 ? crossScore > 0 : crossScore - bestScore >= 7)) {
    best = crossBest;
  }

  return { node: best, status: wbsStatusOf(item) };
}

/** Status WBS dari quantitySource — tidak berubah dari perilaku lama. */
function wbsStatusOf(item: DedAiItem): WbsItemStatus {
  if (item.quantitySource === 'DERIVED' || item.quantitySource === 'DED_GEOMETRIC') {
    return 'DERIVED';
  }
  if (item.quantitySource === 'AI_INFERENCE' || item.quantitySource === 'ASSUMPTION') {
    return 'NEEDS_CONFIRM';
  }
  if (item.quantitySource === 'UNRESOLVED' || item.quantity == null) {
    return 'NEEDS_CONFIRM';
  }
  return 'IDENTIFIED';
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

    // Naik ke level kelompok untuk grouping utama. Induk dicari di
    // SEMUA katalog (bukan hanya katalog utama): simpul lintas katalog
    // (mis. JLN-05-A pada proyek BANGUNAN) induknya tidak ada di katalog
    // utama, dan tanpa ini ia tampil sebagai kelompoknya sendiri.
    // Kode bersifat unik antarkatalog (awalan BGN/JLN/DRN/JMB/BDM/IRG),
    // jadi pencarian ini deterministik.
    let groupCode = node.code;
    let groupNode = node;
    if (node.level === 'subkelompok' && node.parentCode) {
      const parent = Object.values(WBS_CATALOGS)
        .flatMap((nodes) => nodes)
        .find((n) => n.code === node.parentCode);
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
