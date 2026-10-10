/**
 * Consistent demo data for the cinematic landing hero.
 *
 * HONESTY CONTRACT (wajib):
 * - Every figure belongs to ONE fictitious project and is labelled as demo data.
 * - Prices are labelled "Harga contoh (bukan harga resmi)" — never official AHSP/HSPK.
 * - Volumes are computed with real math from the stated dimensions.
 * - Demo case: Rumah Tipe 36 — realistic 2026 market-estimate figures
 *   (total ±Rp 136 juta), NOT official prices.
 * - No company statistics, no partner logos, no testimonials anywhere.
 */

export const DEMO_PROJECT_NAME = 'Rumah Tipe 36 — Bekasi';
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
  { id: 'demo-p1', name: 'Rumah Tipe 36 — Bekasi', location: 'Bekasi, Jawa Barat', status: 'Aktif', progress: 34 },
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
 * Volumes are computed exactly from the stated dimensions (Rumah Tipe 36):
 *  - Persiapan: 45 m² (lahan)
 *  - Struktur beton K-225: sloof + kolom + ringbalk = 5.70 m³
 *  - Pondasi batu kali: 18.75 × 0.60 × 0.80 = 9.00 m³
 *  - Pembesian: Ø10 & Ø8 terpasang = 485 kg
 *  - Dinding bata + plester + aci: 185 m²
 *  - Atap baja ringan + plafon gypsum: 48 + 38 = 86 m²
 *  - Lantai keramik 40×40: 38 m²
 *  - Kusen/pintu/jendela, MEP, finishing: 1 paket each
 * Subtotal demo: Rp 135.723.000 (±Rp 136 juta — realistic 2026 estimate)
 */
export const demoRabItems: DemoRabItem[] = [
  {
    code: 'AHSP.2026.PS.1',
    name: 'Pekerjaan persiapan',
    unit: 'm²',
    qtoFormula: '45 m²',
    volume: 45,
    resources: [
      { kind: 'Upah', name: 'Pekerja', coef: 0.6, unit: 'OH' },
      { kind: 'Upah', name: 'Mandor', coef: 0.06, unit: 'OH' },
      { kind: 'Material', name: 'Papan bouwplank', coef: 0.04, unit: 'm³' },
    ],
    unitPrice: 32000,
  },
  {
    code: 'AHSP.2026.ST.2',
    name: 'Struktur beton K-225',
    unit: 'm³',
    qtoFormula: 'Σ sloof + kolom + ringbalk',
    volume: 5.7,
    resources: [
      { kind: 'Material', name: 'Beton ready-mix K-225', coef: 1.03, unit: 'm³' },
      { kind: 'Alat', name: 'Concrete vibrator', coef: 0.15, unit: 'hari' },
      { kind: 'Upah', name: 'Tukang beton', coef: 1.65, unit: 'OH' },
    ],
    unitPrice: 1225000,
  },
  {
    code: 'AHSP.2026.PD.3',
    name: 'Pondasi batu kali 1:4',
    unit: 'm³',
    qtoFormula: '18.75 × 0.60 × 0.80 m',
    volume: 18.75 * 0.6 * 0.8,
    resources: [
      { kind: 'Material', name: 'Batu kali', coef: 1.1, unit: 'm³' },
      { kind: 'Material', name: 'Semen PC', coef: 2.4, unit: 'zak' },
      { kind: 'Upah', name: 'Tukang batu', coef: 1.5, unit: 'OH' },
    ],
    unitPrice: 985000,
  },
  {
    code: 'AHSP.2026.BS.4',
    name: 'Pembesian beton',
    unit: 'kg',
    qtoFormula: 'Ø10 & Ø8 terpasang',
    volume: 485,
    resources: [
      { kind: 'Material', name: 'Besi beton', coef: 1.05, unit: 'kg' },
      { kind: 'Material', name: 'Kawat bendrat', coef: 0.015, unit: 'kg' },
      { kind: 'Upah', name: 'Tukang besi', coef: 0.07, unit: 'OH' },
    ],
    unitPrice: 19500,
  },
  {
    code: 'AHSP.2026.DD.5',
    name: 'Dinding bata + plester + aci',
    unit: 'm²',
    qtoFormula: '185 m²',
    volume: 185,
    resources: [
      { kind: 'Material', name: 'Bata merah', coef: 70, unit: 'bh' },
      { kind: 'Material', name: 'Semen PC', coef: 0.18, unit: 'zak' },
      { kind: 'Upah', name: 'Tukang batu', coef: 0.3, unit: 'OH' },
    ],
    unitPrice: 160000,
  },
  {
    code: 'AHSP.2026.AT.6',
    name: 'Atap baja ringan + plafon',
    unit: 'm²',
    qtoFormula: '48 + 38 m²',
    volume: 86,
    resources: [
      { kind: 'Material', name: 'Baja ringan C75', coef: 1.1, unit: 'btg' },
      { kind: 'Material', name: 'Genteng metal', coef: 1.05, unit: 'm²' },
      { kind: 'Upah', name: 'Tukang atap', coef: 0.25, unit: 'OH' },
    ],
    unitPrice: 208000,
  },
  {
    code: 'AHSP.2026.LT.7',
    name: 'Lantai keramik 40×40',
    unit: 'm²',
    qtoFormula: '38 m²',
    volume: 38,
    resources: [
      { kind: 'Material', name: 'Keramik 40×40', coef: 1.05, unit: 'm²' },
      { kind: 'Material', name: 'Semen PC', coef: 0.12, unit: 'zak' },
      { kind: 'Upah', name: 'Tukang keramik', coef: 0.35, unit: 'OH' },
    ],
    unitPrice: 235000,
  },
  {
    code: 'AHSP.2026.KS.8',
    name: 'Kusen, pintu & jendela',
    unit: 'paket',
    qtoFormula: '1 paket',
    volume: 1,
    resources: [
      { kind: 'Material', name: 'Kusen aluminium', coef: 7, unit: 'unit' },
      { kind: 'Material', name: 'Daun pintu panel', coef: 3, unit: 'unit' },
      { kind: 'Upah', name: 'Tukang kayu', coef: 2.5, unit: 'OH' },
    ],
    unitPrice: 14900000,
  },
  {
    code: 'AHSP.2026.ME.9',
    name: 'MEP: saniter, air, listrik',
    unit: 'paket',
    qtoFormula: '1 paket',
    volume: 1,
    resources: [
      { kind: 'Material', name: 'Kloset + septictank', coef: 1, unit: 'paket' },
      { kind: 'Material', name: 'Kabel NYM + fitting', coef: 1, unit: 'paket' },
      { kind: 'Upah', name: 'Tukang listrik', coef: 3, unit: 'OH' },
    ],
    unitPrice: 13620000,
  },
  {
    code: 'AHSP.2026.FN.10',
    name: 'Finishing: cat, pagar, kanopi',
    unit: 'paket',
    qtoFormula: '1 paket',
    volume: 1,
    resources: [
      { kind: 'Material', name: 'Cat tembok', coef: 44, unit: 'kg' },
      { kind: 'Material', name: 'Alderon kanopi', coef: 16, unit: 'm²' },
      { kind: 'Upah', name: 'Tukang cat', coef: 4, unit: 'OH' },
    ],
    unitPrice: 24040000,
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
