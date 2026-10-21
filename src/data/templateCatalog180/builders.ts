/**
 * EZRAB — KATALOG TEMPLATE RAB 180: builder helpers untuk 128 template baru.
 *
 * Prinsip kejujuran harga (Fase F):
 * - Komponen dengan `code` memakai kode yang diverifikasi ada di katalog
 *   AHSP 2026 kanonis (officialAhspRepository) pada saat authoring; status
 *   final selalu dihitung ulang saat generate oleh RabTemplateService.
 * - Komponen dengan `price` tanpa kode terverifikasi adalah HARGA REFERENSI
 *   (estimasi pasar 2026, dilabeli REFERENCE_PRICE saat generate) — bukan
 *   harga resmi AHSP.
 * - Komponen tanpa `code` dan tanpa `price` menghasilkan harga null
 *   (UNPRICED) — tidak pernah Rp0 karangan.
 */

import {
  RabTemplate,
  TemplateCategory,
  TemplateParameter,
  ConstructionComponentTemplate,
  DetailLevel
} from '../../types/rabTemplate';

export const G = {
  PERSIAPAN: '01. PEKERJAAN PERSIAPAN',
  TANAH: '02. PEKERJAAN TANAH',
  PONDASI: '03. PEKERJAAN PONDASI',
  STRUKTUR: '04. PEKERJAAN STRUKTUR',
  DINDING: '05. PEKERJAAN DINDING & PARTISI',
  LANTAI: '06. PEKERJAAN LANTAI',
  ATAP: '07. PEKERJAAN ATAP & PLAFON',
  KUSEN: '08. PEKERJAAN KUSEN, PINTU & JENDELA',
  FINISHING: '09. PEKERJAAN FINISHING',
  SANITASI: '10. PEKERJAAN SANITASI & PLAMBING',
  ELEKTRIKAL: '11. PEKERJAAN ELEKTRIKAL',
  MEKANIKAL: '12. PEKERJAAN MEKANIKAL & HVAC',
  PERKERASAN: '13. PEKERJAAN PERKERASAN',
  DRAINASE: '14. PEKERJAAN DRAINASE',
  LANSKAP: '15. PEKERJAAN LANSKAP & EKSTERIOR',
  KHUSUS: '16. PEKERJAAN KHUSUS',
  BONGKAR: '17. PEKERJAAN PEMBONGKARAN'
} as const;

export function num(
  key: string,
  label: string,
  def: number,
  opts: { min?: number; max?: number; unit?: string; group?: TemplateParameter['group']; required?: boolean } = {}
): TemplateParameter {
  return {
    id: `p-${key}`,
    key,
    label,
    type: 'NUMBER',
    unit: opts.unit,
    required: opts.required !== false,
    defaultValue: def,
    min: opts.min,
    max: opts.max,
    group: opts.group || 'dimensions'
  };
}

export function sel(
  key: string,
  label: string,
  options: Array<{ label: string; value: string | number }>,
  def: string | number,
  group: TemplateParameter['group'] = 'specifications'
): TemplateParameter {
  return { id: `p-${key}`, key, label, type: 'SELECT', required: true, defaultValue: def, options, group };
}

export interface CompOpts {
  /** Kode AHSP 2026 kanonis terverifikasi (tanpa kode = NEEDS_MAPPING bila price ada, UNPRICED bila tidak). */
  code?: string;
  /** Harga referensi pasar 2026 (dilabeli REFERENCE_PRICE, bukan resmi). */
  price?: number;
  level?: DetailLevel;
  optional?: boolean;
  condition?: string;
  desc?: string;
  deps?: string[];
  priceNote?: string;
}

/** Komponen dengan id lokal; tpl() memberi prefix id template + menulis ulang dependensi. */
export function comp(
  localId: string,
  name: string,
  group: string,
  unit: string,
  rule: string,
  vars: string[],
  opts: CompOpts = {}
): ConstructionComponentTemplate {
  return {
    id: localId,
    name,
    category: group,
    unit,
    calculationRule: rule,
    variables: vars,
    ahspCode: opts.code,
    ahspName: opts.code ? name : undefined,
    unitPrice: opts.price,
    priceSource: opts.code ? undefined : opts.price != null ? 'REFERENCE_PRICE' : undefined,
    mappingStatus: opts.code ? 'VERIFIED' : opts.price != null ? 'NEEDS_MAPPING' : undefined,
    priceNote: opts.priceNote,
    detailLevel: opts.level || 'STANDARD',
    isOptional: opts.optional || false,
    condition: opts.condition,
    description: opts.desc,
    dependencies: opts.deps
  };
}

export interface TplDef {
  id: string;
  name: string;
  category: TemplateCategory;
  subcategory: string;
  description: string;
  badge: string;
  icon: string;
  parameters: TemplateParameter[];
  components: ConstructionComponentTemplate[];
  assumptions: string[];
  exclusions: string[];
}

export function tpl(def: TplDef): RabTemplate {
  const prefix = def.id;
  const components = def.components.map(c => ({
    ...c,
    id: `${prefix}::${c.id}`,
    dependencies: c.dependencies ? c.dependencies.map(d => `${prefix}::${d}`) : undefined
  }));
  const groups: string[] = [];
  for (const c of components) {
    if (!groups.includes(c.category)) groups.push(c.category);
  }
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    subcategory: def.subcategory,
    description: def.description,
    badge: def.badge,
    icon: def.icon,
    supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
    defaultDetailLevel: 'PROFESSIONAL',
    parameters: def.parameters,
    workPackages: groups.map((g, i) => ({
      id: `${prefix}-WP${i + 1}`,
      code: `WP.${i + 1}`,
      name: g,
      category: g,
      componentIds: components.filter(c => c.category === g).map(c => c.id),
      order: i + 1
    })),
    components,
    assumptions: def.assumptions,
    exclusions: def.exclusions,
    formulaVersion: '1.0',
    validationRules: [
      {
        id: `${prefix}-VR1`,
        description: 'Seluruh parameter wajib memiliki nilai > 0; nilai default adalah asumsi berlabel, bukan hasil pengukuran.',
        severity: 'WARNING'
      }
    ],
    metadata: {
      source: 'EZRAB_OFFICIAL',
      version: '1.0.0',
      author: 'EZRAB Katalog 180',
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z'
    }
  };
}

/** Asumsi generik yang dipakai lintas template sektor bangunan. */
export const ASUMSI_BANGUNAN = [
  'Nilai default parameter adalah asumsi awal berlabel — wajib disesuaikan dengan gambar kerja & kondisi lapangan.',
  'Harga resmi hanya berlaku untuk komponen berkode AHSP 2026 kanonis yang lolos gerbang resolver; sisanya harga referensi pasar 2026.',
  'Volume dihitung deterministik dari parameter; tidak termasuk waste material (diatur terpisah di Pengaturan Estimasi Global).'
];
export const EKSKLUSI_BANGUNAN = [
  'Tidak termasuk perizinan (PBG/IMB), biaya notaris, dan sambungan daya PLN/PDAM induk.',
  'Tidak termasuk pekerjaan di luar lingkup template (mis. interior loose furniture) kecuali komponen opsional dipilih.'
];
