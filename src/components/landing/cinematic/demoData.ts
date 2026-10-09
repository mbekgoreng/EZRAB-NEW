/**
 * Consistent demo data for the cinematic landing hero.
 *
 * HONESTY CONTRACT (wajib):
 * - Every figure belongs to ONE fictitious project and is labelled as demo data.
 * - Prices are labelled "Harga contoh (bukan harga resmi)" — never official AHSP/HSPK.
 * - Volumes are computed with real math from the stated dimensions.
 * - No company statistics, no partner logos, no testimonials anywhere.
 */

export const DEMO_PROJECT_NAME = 'Rumah Tinggal Tipe 120 — Bekasi';
export const IS_DEMO = true;
export const DEMO_BADGE = 'Data demonstrasi';

export interface DemoProject {
  id: string;
  name: string;
  location: string;
  status: 'Aktif' | 'Draft' | 'Selesai';
  progress: number; // demo progress bar only
}

export const demoProjects: DemoProject[] = [
  { id: 'demo-p1', name: 'Rumah Tinggal Tipe 120 — Bekasi', location: 'Bekasi, Jawa Barat', status: 'Aktif', progress: 34 },
  { id: 'demo-p2', name: 'Ruko 3 Lantai — Tambun', location: 'Tambun, Bekasi', status: 'Draft', progress: 5 },
  { id: 'demo-p3', name: 'Renovasi Kantor — Cikarang', location: 'Cikarang, Bekasi', status: 'Selesai', progress: 100 },
];

export interface DemoResource {
  kind: 'Material' | 'Upah' | 'Alat';
  name: string;
  coef: number; // coefficient per unit of work
  unit: string;
}

export interface DemoRabItem {
  code: string; // AHSP-format demo code
  name: string;
  unit: string;
  /** volume computed from the qto formula below */
  qtoFormula: string;
  volume: number;
  resources: DemoResource[];
  /** Example unit price — NOT an official price. */
  unitPrice: number;
}

/**
 * Volumes are computed exactly from the stated dimensions:
 *  - Galian tanah: 1.50 × 0.80 × 12.50 = 15.00 m³
 *  - Pasangan batu kali: 0.60 × 0.80 × 12.50 = 6.00 m³
 *  - Beton sloof: 0.25 × 0.40 × 12.50 = 1.25 m³
 *  - Pembesian: tulangan utama 4 × 12.50 m × 0.617 kg/m = 30.85 kg;
 *    sengkang 84 bh × 1.30 m × 0.395 kg/m = 43.13 kg; total = 73.98 kg
 */
export const demoRabItems: DemoRabItem[] = [
  {
    code: 'AHSP.2026.CK.3.1',
    name: 'Galian tanah pondasi',
    unit: 'm³',
    qtoFormula: '1.50 × 0.80 × 12.50 m',
    volume: 1.5 * 0.8 * 12.5,
    resources: [
      { kind: 'Upah', name: 'Pekerja', coef: 0.75, unit: 'OH' },
      { kind: 'Upah', name: 'Mandor', coef: 0.025, unit: 'OH' },
    ],
    unitPrice: 95000,
  },
  {
    code: 'AHSP.2026.CK.4.1',
    name: 'Pasangan batu kali 1:4',
    unit: 'm³',
    qtoFormula: '0.60 × 0.80 × 12.50 m',
    volume: 0.6 * 0.8 * 12.5,
    resources: [
      { kind: 'Material', name: 'Batu kali', coef: 1.1, unit: 'm³' },
      { kind: 'Material', name: 'Semen PC', coef: 2.4, unit: 'zak' },
      { kind: 'Upah', name: 'Tukang batu', coef: 1.5, unit: 'OH' },
    ],
    unitPrice: 685000,
  },
  {
    code: 'AHSP.2026.CK.6.2',
    name: 'Beton sloof K-225',
    unit: 'm³',
    qtoFormula: '0.25 × 0.40 × 12.50 m',
    volume: 0.25 * 0.4 * 12.5,
    resources: [
      { kind: 'Material', name: 'Beton ready-mix K-225', coef: 1.03, unit: 'm³' },
      { kind: 'Alat', name: 'Concrete vibrator', coef: 0.15, unit: 'hari' },
      { kind: 'Upah', name: 'Tukang beton', coef: 1.65, unit: 'OH' },
    ],
    unitPrice: 1150000,
  },
  {
    code: 'AHSP.2026.CK.6.5',
    name: 'Pembesian polos sloof',
    unit: 'kg',
    qtoFormula: '(4 × 12.50 × 0.617) + (84 × 1.30 × 0.395) kg',
    volume: 4 * 12.5 * 0.617 + 84 * 1.3 * 0.395,
    resources: [
      { kind: 'Material', name: 'Besi beton polos', coef: 1.05, unit: 'kg' },
      { kind: 'Material', name: 'Kawat bendrat', coef: 0.015, unit: 'kg' },
      { kind: 'Upah', name: 'Tukang besi', coef: 0.07, unit: 'OH' },
    ],
    unitPrice: 18500,
  },
];

export interface DemoRabRow {
  code: string;
  name: string;
  unit: string;
  volume: number;
  unitPrice: number;
  subtotal: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const demoRabRows: DemoRabRow[] = demoRabItems.map((item) => ({
  code: item.code,
  name: item.name,
  unit: item.unit,
  volume: round2(item.volume),
  unitPrice: item.unitPrice,
  subtotal: Math.round(round2(item.volume) * item.unitPrice),
}));

export const demoSubtotal: number = demoRabRows.reduce((s, r) => s + r.subtotal, 0);

/** 8-point demo S-curve: cumulative weights, monotonically increasing 0 → 100. */
export const demoCurveS: number[] = [0, 8, 22, 45, 68, 85, 96, 100];

export const demoAiEstimateSteps = [
  'Menganalisis tipe proyek…',
  'Menyusun daftar pekerjaan…',
  'Menghitung estimasi biaya…',
] as const;

export const formatRupiah = (n: number): string =>
  'Rp' + Math.round(n).toLocaleString('id-ID');

export const formatVolume = (n: number, unit: string): string =>
  `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${unit}`;
