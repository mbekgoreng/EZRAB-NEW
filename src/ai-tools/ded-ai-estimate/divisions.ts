/**
 * DED AI ESTIMATE — Kontrak 12 Divisi Rumah & Pemeriksaan Cakupan (FASE P0)
 *
 * Kontrak keluaran standar untuk proyek rumah tinggal (BANGUNAN/GEDUNG):
 * 12 divisi tetap dengan urutan baku. Divisi adalah LAPISAN KONTRAK di atas
 * klasifikasi WBS yang sudah ada (wbsCatalog/wbsClassifier) — kode WBS lama
 * (BGN-*) tidak diubah; pemetaan ditulis eksplisit di file ini.
 *
 * Aturan integritas:
 * - Template rumah (houseType36) hanya SCAFFOLD pemeriksaan kelengkapan.
 *   Item template yang tidak didukung DED hanya muncul sebagai kandidat
 *   asumsi TERLABEL (nama + satuan + kode template), TANPA volume/harga.
 * - Spek yang terbukti dari DED selalu mengalahkan default template:
 *   divisi dengan item DED berstatus IDENTIFIED tidak ditimpa asumsi.
 * - "Belum terdeteksi" (INSUFFICIENT_DATA) dibedakan dari "tidak berlaku"
 *   (NOT_APPLICABLE, hanya untuk tipe proyek non-bangunan).
 */
import { DedAiItem, DedDivisionCoverage, DedDivisionAssumptionCandidate } from './types';
import { HOUSE_TYPE_36_WORK_ITEMS } from '../../data/buildingTemplates/templates/houseType36Template';

export interface DedDivisionDef {
  code: string;
  name: string;
  order: number;
  /** Kode WBS (kelompok/subkelompok BGN) yang memetakan ke divisi ini. */
  wbsCodes: string[];
  /** Kategori template houseType36 (mis. "10_KUSEN_PINTU_JENDELA") sebagai scaffold. */
  templateCategories: string[];
  /** Jenis halaman (parser pageType) yang menjadi bukti pendukung divisi. */
  evidencePageTypes: string[];
}

export const DED_DIVISIONS: DedDivisionDef[] = [
  {
    code: 'DIV-01', name: 'Pekerjaan Persiapan', order: 1,
    wbsCodes: ['BGN-01', 'BGN-01-A', 'BGN-01-B'],
    templateCategories: ['01_PERSIAPAN'],
    evidencePageTypes: ['SITUASI'],
  },
  {
    code: 'DIV-02', name: 'Pekerjaan Tanah dan Pondasi', order: 2,
    // BGN-02 (Tanah) + BGN-03 (Pondasi) digabung sesuai kontrak 12 divisi.
    wbsCodes: ['BGN-02', 'BGN-02-A', 'BGN-02-B', 'BGN-03', 'BGN-03-A', 'BGN-03-B', 'BGN-03-C'],
    templateCategories: ['02_TANAH', '03_PONDASI'],
    evidencePageTypes: ['STRUKTUR', 'POTONGAN'],
  },
  {
    code: 'DIV-03', name: 'Pekerjaan Struktur Beton', order: 3,
    wbsCodes: ['BGN-04', 'BGN-04-A', 'BGN-04-B', 'BGN-04-C', 'BGN-04-D', 'BGN-04-E', 'BGN-04-F'],
    templateCategories: ['04_STRUKTUR_BETON'],
    evidencePageTypes: ['STRUKTUR', 'POTONGAN'],
  },
  {
    code: 'DIV-04', name: 'Pekerjaan Dinding dan Plesteran', order: 4,
    wbsCodes: ['BGN-05', 'BGN-05-A', 'BGN-05-B'],
    templateCategories: ['05_DINDING', '06_PLESTERAN_ACIAN'],
    evidencePageTypes: [],
  },
  {
    code: 'DIV-05', name: 'Pekerjaan Atap', order: 5,
    // BGN-06-C (Plafon) SENGAJA tidak di sini — masuk DIV-06.
    wbsCodes: ['BGN-06', 'BGN-06-A', 'BGN-06-B'],
    templateCategories: ['09_ATAP'],
    evidencePageTypes: ['ATAP'],
  },
  {
    code: 'DIV-06', name: 'Pekerjaan Plafond', order: 6,
    wbsCodes: ['BGN-06-C'],
    templateCategories: ['08_PLAFON'],
    evidencePageTypes: ['PLAFOND'],
  },
  {
    code: 'DIV-07', name: 'Pekerjaan Lantai dan Dinding Keramik', order: 7,
    wbsCodes: ['BGN-07'],
    templateCategories: ['07_LANTAI'],
    evidencePageTypes: ['LANTAI'],
  },
  {
    code: 'DIV-08', name: 'Pekerjaan Kusen, Pintu dan Jendela', order: 8,
    wbsCodes: ['BGN-08', 'BGN-08-A', 'BGN-08-B', 'BGN-08-C'],
    templateCategories: ['10_KUSEN_PINTU_JENDELA'],
    evidencePageTypes: ['JADWAL_KUSEN', 'DETAIL_KUSEN'],
  },
  {
    code: 'DIV-09', name: 'Pekerjaan Pengecatan', order: 9,
    // Di WBS lama pengecatan adalah subkelompok dari "Finishing" (BGN-09).
    wbsCodes: ['BGN-09', 'BGN-09-A'],
    templateCategories: ['11_PENGECATAN'],
    evidencePageTypes: [],
  },
  {
    code: 'DIV-10', name: 'Pekerjaan Sanitair dan Plambing', order: 10,
    // BGN-10 (MEP) dipisah: plumbing/sanitair ke sini, listrik ke DIV-11.
    wbsCodes: ['BGN-10-B'],
    templateCategories: ['12_SANITASI'],
    evidencePageTypes: ['MEP_PLUMBING', 'SANITAIR', 'MEP'],
  },
  {
    code: 'DIV-11', name: 'Pekerjaan Instalasi Listrik', order: 11,
    wbsCodes: ['BGN-10-A'],
    templateCategories: ['14_INSTALASI_LISTRIK'],
    evidencePageTypes: ['MEP_ELECTRICAL', 'MEP'],
  },
  {
    code: 'DIV-12', name: 'Pekerjaan Finishing dan Pembersihan', order: 12,
    // Tidak ada kelompok WBS lama maupun kategori template yang setara
    // (pembersihan awal masuk DIV-01; pekerjaan luar BGN-11 bukan finishing).
    // Divisi ini dilaporkan apa adanya: tanpa bukti/scaffold → INSUFFICIENT_DATA.
    wbsCodes: [],
    templateCategories: [],
    evidencePageTypes: [],
  },
];

const WBS_TO_DIVISION: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const d of DED_DIVISIONS) {
    for (const code of d.wbsCodes) map[code] = d.code;
  }
  return map;
})();

/**
 * Petakan kode WBS (kelompok atau subkelompok) ke kode divisi.
 * Mengembalikan null bila tidak ada pemetaan (mis. BGN-10 kelompok generik
 * MEP, BGN-11 pekerjaan luar) — item tetap tampil di grup WBS-nya, hanya
 * tidak diklaim masuk divisi mana pun.
 */
export function divisionCodeForWbs(wbsCode?: string | null): string | null {
  if (!wbsCode) return null;
  return WBS_TO_DIVISION[wbsCode] ?? null;
}

/** Kandidat asumsi scaffold untuk satu divisi (nama/satuan saja — tanpa volume/harga). */
export function templateCandidatesForDivision(def: DedDivisionDef): DedDivisionAssumptionCandidate[] {
  if (def.templateCategories.length === 0) return [];
  return HOUSE_TYPE_36_WORK_ITEMS
    .filter((it) => def.templateCategories.includes(it.category))
    .map((it) => ({
      name: it.name,
      unit: it.unit,
      templateWbsCode: it.wbsCode,
      source: 'TEMPLATE_RUMAH_TIPE36' as const,
      note: 'Kandidat dari template rumah tipe 36 — belum terbukti dari DED; wajib konfirmasi pengguna.',
    }));
}

export interface DivisionCoverageInput {
  /** Item yang sudah diklasifikasikan WBS (groupByWbs / classifyToWbs). */
  classifiedItems: Array<Pick<DedAiItem, 'id' | 'wbsCode' | 'wbsStatus'>>;
  /** Halaman hasil parser (untuk bukti jenis halaman per divisi). */
  pages: Array<{ page: number; pageType: string }>;
  projectType: string;
}

/**
 * Bangun cakupan 12 divisi dari item terklasifikasi + bukti halaman.
 * Murni & deterministik — tidak mengubah item, tidak membuat volume/harga.
 */
export function buildDivisionCoverage(input: DivisionCoverageInput): DedDivisionCoverage[] {
  const isHouse = input.projectType === 'BANGUNAN' || input.projectType === 'GEDUNG';

  return DED_DIVISIONS.map((def) => {
    const items = input.classifiedItems.filter(
      (it) => divisionCodeForWbs(it.wbsCode) === def.code
    );
    const identified = items.filter(
      (it) => it.wbsStatus === 'IDENTIFIED' || it.wbsStatus === 'DERIVED'
    );
    const needsConfirm = items.filter(
      (it) => it.wbsStatus === 'NEEDS_CONFIRM' || it.wbsStatus === 'OPTIONAL'
    );
    const evidencePages = input.pages
      .filter((p) => def.evidencePageTypes.includes(p.pageType))
      .map((p) => p.page);

    const base = {
      divisionCode: def.code,
      divisionName: def.name,
      order: def.order,
      itemCount: items.length,
      identifiedItemCount: identified.length,
      needsConfirmItemCount: needsConfirm.length,
      itemIds: items.map((it) => it.id),
      evidencePages,
    };

    if (identified.length > 0) {
      return {
        ...base,
        status: 'IDENTIFIED' as const,
        assumptionCandidates: [],
        note: `${identified.length} item terbukti dari DED${needsConfirm.length > 0 ? `; ${needsConfirm.length} item lain masih perlu konfirmasi` : ''}.`,
      };
    }
    if (needsConfirm.length > 0) {
      return {
        ...base,
        status: 'ASSUMPTION_REQUIRES_CONFIRMATION' as const,
        assumptionCandidates: [],
        note: 'Hanya ada item hasil inferensi/asumsi AI — belum terbukti dari DED, wajib konfirmasi.',
      };
    }
    if (!isHouse) {
      return {
        ...base,
        status: 'NOT_APPLICABLE' as const,
        assumptionCandidates: [],
        note: `Divisi rumah tidak berlaku untuk tipe proyek "${input.projectType}".`,
      };
    }
    if (evidencePages.length > 0) {
      return {
        ...base,
        status: 'INSUFFICIENT_DATA' as const,
        assumptionCandidates: [],
        note: `Halaman pendukung terdeteksi (hal. ${evidencePages.join(', ')}) tetapi tidak ada item yang terekstrak untuk divisi ini.`,
      };
    }
    const candidates = templateCandidatesForDivision(def);
    if (candidates.length > 0) {
      return {
        ...base,
        status: 'ASSUMPTION_REQUIRES_CONFIRMATION' as const,
        assumptionCandidates: candidates,
        note: 'Tidak terdeteksi di DED. Kandidat berikut hanya asumsi template rumah tipe 36 (tanpa volume/harga) — wajib konfirmasi sebelum dipakai.',
      };
    }
    return {
      ...base,
      status: 'INSUFFICIENT_DATA' as const,
      assumptionCandidates: [],
      note: 'Tidak terdeteksi di DED dan tidak ada scaffold template untuk divisi ini.',
    };
  });
}
