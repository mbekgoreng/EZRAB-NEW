/**
 * reconcileProjectSummaries — rekonsiliasi NON-DESTRUKTIF cache ringkasan
 * proyek terhadap record item (AUDIT REGRESI FINAL 2026-11-03, §6/§7).
 *
 * Latar: totalRab/costSummary/itemsCount adalah CACHE turunan. Instalasi
 * lama dapat menyimpan cache basi (mis. directCost tidak lagi sama dengan
 * jumlah item) dan tidak ada jalur yang memperbaikinya selain mengedit
 * item. Fungsi ini murni & idempoten:
 *
 * - Proyek TANPA item tidak pernah disentuh — cache-nya tidak dapat
 *   dibuktikan salah dari record, dan menghapusnya bisa merusak data sah.
 * - Proyek yang cache-nya sudah cocok dikembalikan apa adanya.
 * - Proyek basi dibangun ulang dari item dengan persen ringkasan EKSISTING
 *   (overhead/profit/kontingensi/markup dipertahankan) dan perlakuan pajak
 *   dari FLAG proyek (NEW-11, Batch C): pajak diterapkan bila flag-nya ON;
 *   bila flag belum pernah disetel (data lama sebelum kebijakan opt-in),
 *   ringkasan lama dipakai sebagai bukti perlakuan pajak. Item
 *   PRICE_UNRESOLVED tidak masuk directCost, selaras mesin kanonis.
 *   Record item tidak pernah diubah.
 *
 * BATAS (residu, bukan cakupan Batch C): tangga mini di sini tidak mengenal
 * pengecualian item HSP dari basis O&P (§17.1), basis kena pajak
 * proporsional (item taxIncluded), dan PPh dihitung atas subtotal penuh —
 * untuk proyek dengan item-item itu, hasil rebuild bisa sedikit menyimpang
 * dari mesin kanonis sampai ada mutasi dalam aplikasi yang menghitung
 * ulang lewat mesin. Delegasi penuh ke mesin kanonis adalah tindak lanjut
 * yang direkomendasikan.
 */
export function reconcileProjectSummaries(
  projects: Project[],
  items: Array<{ projectId?: string; amount?: number | null; priceStatus?: string; taxIncludedPpn?: boolean; taxIncludedPph?: boolean }>
): { projects: Project[]; changedIds: string[] } {
  const itemsByProject = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.projectId) continue;
    const list = itemsByProject.get(item.projectId);
    if (list) list.push(item);
    else itemsByProject.set(item.projectId, [item]);
  }

  const changedIds: string[] = [];
  const next = projects.map((project) => {
    const projectItems = itemsByProject.get(project.id);
    if (!projectItems || projectItems.length === 0) return project;

    const directCost = projectItems.reduce(
      (sum, i) => sum + (i.priceStatus === 'PRICE_UNRESOLVED' ? 0 : (i.amount ?? 0)),
      0
    );
    const cs = project.costSummary;
    // NEW-11: cache yang "konsisten sendiri" tetapi bertentangan dengan
    // flag pajak proyek tetap dianggap BASI — kalau tidak, kerusakan yang
    // ditimbulkan aturan lama (flag ON + taxAmount 0 + total direct-only
    // yang tersimpan rapi) tidak pernah diperbaiki. Pengecualian: proyek
    // yang SEMUA itemnya sudah termasuk pajak itu memang sah berpajak 0
    // walau flag-nya ON, jadi hanya proyek dengan minimal satu item kena
    // pajak yang ditandai basi. (Input minimal tanpa flag taxIncluded
    // diperlakukan sebagai kena pajak — tidak bisa membuktikan sebaliknya.)
    const hasTaxablePpnItem = projectItems.some((i) => i.taxIncludedPpn !== true);
    const hasTaxablePphItem = projectItems.some((i) => i.taxIncludedPph !== true);
    const ppnFlag = (project as any).ppnEnabled;
    const pphFlag = (project as any).pphEnabled;
    const taxInconsistent =
      (ppnFlag === true && (cs?.taxAmount ?? 0) === 0 && directCost > 0 && hasTaxablePpnItem) ||
      (pphFlag === true && (cs?.pphAmount ?? 0) === 0 && directCost > 0 && hasTaxablePphItem);
    if (
      cs &&
      cs.directCost === directCost &&
      project.totalRab === cs.grandTotal &&
      project.itemsCount === projectItems.length &&
      !taxInconsistent
    ) {
      return project;
    }

    // Batch 4: persen diselesaikan KANONIS — field konfigurasi proyek dulu
    // (sumber konfigurasi di semua permukaan lain: ProjectContext, ekspor,
    // Rekapitulasi), baru ringkasan lama, baru fallback. Sebelumnya
    // fungsi ini HANYA membaca ringkasan lama, sehingga proyek yang
    // ringkasannya hilang/basi tetapi field-nya terkonfigurasi (mis.
    // overheadPercent 10) dibangun ulang dengan overhead karangan 5% dan
    // totalRab-nya menyimpang dari total kanonis proyek yang sama.
    // Fallback terakhir kini 0 (keputusan owner 2026-11-08, selaras
    // mesin kanonis): proyek tanpa konfigurasi apa pun tidak lagi
    // dibebani 5% karangan. Nilai eksplisit di field/ringkasan lama
    // tetap menang karena ?? hanya jatuh bila undefined/null.
    const overheadPercent = (project as any).overheadPercent ?? cs?.overheadPercent ?? 0;
    const profitPercent = (project as any).profitPercent ?? cs?.profitPercent ?? 0;
    const contingencyPercent = cs?.contingencyPercent ?? 0;
    const directorMarkupPercent = cs?.directorMarkupPercent ?? 0;
    const taxPercent = (project as any).ppnPercent ?? cs?.taxPercent ?? 11;
    const pphPercent = (project as any).pphPercent ?? cs?.pphPercent ?? 0;
    const overheadAmount = Math.round((directCost * overheadPercent) / 100);
    const profitAmount = Math.round((directCost * profitPercent) / 100);
    const contingencyAmount = Math.round((directCost * contingencyPercent) / 100);
    const directorMarkupTotal = Math.round((directCost * directorMarkupPercent) / 100);
    const subtotalBeforeTax =
      directCost + overheadAmount + profitAmount + contingencyAmount + directorMarkupTotal;
    // NEW-11: perlakuan pajak dibaca dari FLAG proyek — aturan lama hanya
    // melihat ringkasan lama (`taxAmount > 0`), sehingga proyek dengan
    // flag ON tetapi ringkasan lama 0 dibangun ulang sebagai direct-only
    // (pajaknya hilang diam-diam setelah reload). Flag eksplisit OFF
    // dihormati (pajak 0); flag yang belum pernah disetel (data lama
    // sebelum kebijakan opt-in) jatuh ke ringkasan lama agar rekonsiliasi
    // tidak mengubah perlakuan pajak yang tidak diketahuinya. PPh
    // diperlakukan sama — aturan lama bahkan tidak menghitungnya sama
    // sekali sehingga rebuild membuang PPh dari grand total.
    const ppnApplies =
      ppnFlag === true ? true : ppnFlag === false ? false : (cs?.taxAmount ?? 0) > 0;
    const pphApplies =
      pphFlag === true ? true : pphFlag === false ? false : (cs?.pphAmount ?? 0) > 0;
    const taxAmount = ppnApplies ? Math.round((subtotalBeforeTax * taxPercent) / 100) : 0;
    const pphAmount = pphApplies ? Math.round((subtotalBeforeTax * pphPercent) / 100) : 0;
    const grandTotal = subtotalBeforeTax + taxAmount + pphAmount;

    changedIds.push(project.id);
    return {
      ...project,
      totalRab: grandTotal,
      itemsCount: projectItems.length,
      updatedAt: new Date().toISOString(),
      costSummary: {
        ...(cs as ProjectCostSummary),
        directCost,
        overheadPercent,
        overheadAmount,
        profitPercent,
        profitAmount,
        contingencyPercent,
        contingencyAmount,
        directorMarkupPercent,
        directorMarkupTotal,
        subtotalBeforeTax,
        taxPercent,
        taxAmount,
        pphPercent,
        pphAmount,
        grandTotal,
      },
    };
  });

  return { projects: next, changedIds };
}

/**
 * demoSeed — logika murni untuk P0-B (data demo tidak respawn).
 *
 * Aturan: seed default HANYA pada instalasi pertama (belum ada flag seed).
 * Setelah itu isi penyimpanan dihormati apa adanya — termasuk ketika pengguna
 * menghapus seluruh proyek demo (array kosong tetap kosong).
 */

import type { Project, ProjectCostSummary } from '../types';

export interface SeedResolution<T> {
  projects: T[];
  /** true = pemanggil harus menulis flag seed ke penyimpanan. */
  shouldMarkSeeded: boolean;
}

export function resolveInitialProjects<T extends { id: string }>(
  savedJson: string | null,
  alreadySeeded: boolean,
  defaults: T[]
): SeedResolution<T> {
  if (alreadySeeded) {
    if (savedJson) {
      try {
        const parsed = JSON.parse(savedJson);
        if (Array.isArray(parsed)) return { projects: parsed as T[], shouldMarkSeeded: false };
      } catch {
        /* jatuh ke bawah */
      }
    }
    return { projects: [], shouldMarkSeeded: false };
  }
  if (savedJson) {
    try {
      const parsed = JSON.parse(savedJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { projects: parsed as T[], shouldMarkSeeded: true };
      }
    } catch {
      /* jatuh ke seed default */
    }
  }
  return { projects: defaults, shouldMarkSeeded: true };
}

/**
 * F1a — resolusi awal item RAB flagship.
 *
 * Kunci penyimpanan yang SUDAH ADA selalu dihormati apa adanya — termasuk
 * array kosong hasil pengguna menghapus seluruh item (menghapus semua item
 * TIDAK boleh memunculkan kembali item contoh setelah reload). Seed hanya
 * dipakai bila kunci belum pernah ada (NOT_FOUND) atau isinya rusak
 * (perilaku lama: fallback ke seed).
 */
export function resolveInitialRabItems<T>(
  load: { ok: boolean; data?: T[] },
  seedItems: T[]
): T[] {
  if (load.ok) return load.data ?? seedItems;
  return seedItems;
}

/**
 * F1a — bangun ProjectCostSummary yang konsisten secara internal dari
 * item-item seed: directCost = jumlah amount item; overhead & profit dari
 * directCost; subtotal = direct + overhead + profit; pajak = taxPercent ×
 * subtotal; grandTotal = subtotal + pajak. Tidak ada angka yatim.
 */
export function computeSeedCostSummary(
  items: Array<{ amount?: number | null }>,
  opts: {
    overheadPercent?: number;
    profitPercent?: number;
    taxPercent?: number;
    costPerM2?: number;
  } = {}
): ProjectCostSummary {
  const overheadPercent = opts.overheadPercent ?? 5;
  const profitPercent = opts.profitPercent ?? 5;
  const taxPercent = opts.taxPercent ?? 11;
  const directCost = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const overheadAmount = Math.round((directCost * overheadPercent) / 100);
  const profitAmount = Math.round((directCost * profitPercent) / 100);
  const subtotalBeforeTax = directCost + overheadAmount + profitAmount;
  const taxAmount = Math.round((subtotalBeforeTax * taxPercent) / 100);
  return {
    directCost,
    overheadPercent,
    overheadAmount,
    profitPercent,
    profitAmount,
    contingencyPercent: 0,
    contingencyAmount: 0,
    directorMarkupPercent: 0,
    directorMarkupNominal: 0,
    directorMarkupTotal: 0,
    showMarkupToEditor: false,
    showMarkupToClient: false,
    subtotalBeforeTax,
    taxPercent,
    taxAmount,
    grandTotal: subtotalBeforeTax + taxAmount,
    costPerM2: opts.costPerM2 ?? 0,
  };
}

/**
 * F1a — normalisasi costSummary seed yang ditulis sebagai literal:
 * taxAmount & grandTotal SELALU diturunkan dari subtotalBeforeTax ×
 * taxPercent, agar tidak ada angka pajak yatim yang tidak cocok dengan
 * subtotalnya sendiri.
 */
export function consistentSeedCostSummary(cs: ProjectCostSummary): ProjectCostSummary {
  const taxAmount = Math.round((cs.subtotalBeforeTax * cs.taxPercent) / 100);
  return { ...cs, taxAmount, grandTotal: cs.subtotalBeforeTax + taxAmount };
}

/**
 * F1a — tandai proyek bawaan sebagai data contoh (isDemo) + normalisasi
 * costSummary-nya. totalRab yang terisi diselaraskan ke grandTotal hasil
 * normalisasi agar tidak menunjuk angka lama.
 */
export function markSeedProject(p: Project): Project {
  const costSummary = consistentSeedCostSummary(p.costSummary);
  return {
    ...p,
    isDemo: true,
    costSummary,
    totalRab: p.totalRab ? costSummary.grandTotal : p.totalRab,
  };
}

/**
 * Injeksi satu kali berdasarkan id (untuk dataset demo tambahan seperti
 * Premium Demo). Aturan sama dengan P0-B: hanya berjalan bila flag injeksi
 * belum pernah terpasang; setelah itu isi penyimpanan dihormati apa adanya —
 * termasuk bila pengguna menghapus datasetnya (tidak respawn). Entri yang
 * id-nya sudah ada tidak pernah diduplikasi.
 */
export function injectOnceById<T extends { id: string }>(
  existing: T[],
  additions: T[],
  alreadyInjected: boolean
): { items: T[]; shouldMarkInjected: boolean } {
  if (alreadyInjected) return { items: existing, shouldMarkInjected: false };
  const seen = new Set(existing.map((x) => x.id));
  const fresh = additions.filter((a) => !seen.has(a.id));
  return {
    items: fresh.length ? [...existing, ...fresh] : existing,
    shouldMarkInjected: true,
  };
}

/**
 * Segarkan dataset demo saat versi dataset naik (mis. v2: 213/213 berharga).
 * Hanya entri demo yang cocok `isDemoEntry` yang diganti dengan salinan
 * segar; entri lain tidak disentuh. Bila pengguna sudah menghapus dataset
 * demo (tidak ada entri cocok), penghapusan dihormati — tidak respawn.
 * Bila versi sudah mutakhir, array dikembalikan apa adanya.
 */
export function refreshByMatch<T>(
  existing: T[],
  fresh: T[],
  isDemoEntry: (x: T) => boolean,
  alreadyCurrent: boolean
): T[] {
  if (alreadyCurrent) return existing;
  if (!existing.some(isDemoEntry)) return existing;
  return [...existing.filter((x) => !isDemoEntry(x)), ...fresh];
}
