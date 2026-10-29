/**
 * DEFINISI PAKET KANONIS EZRAB — SATU-SATUNYA SUMBER KEBENARAN PAKET
 * ============================================================================
 * Modul ini mengkodekan tabel paket yang DISETUJUI OWNER (Master Prompt
 * Billing §3, 30 Oktober 2026) beserta matriks entitlement-nya (Audit
 * Billing Master §C + Addendum Keputusan Owner O-1 s.d. O-13).
 *
 * FASE 1 (fondasi entitlement): modul ini berisi DEFINISI + RESOLVER saja.
 * TIDAK ada penegakan/gating di sini dan belum ada permukaan fitur yang
 * wajib mematuhinya — penegakan per fitur adalah fase-fase berikutnya.
 * Permukaan yang sudah membaca dari sini: landing pricing
 * (ExactPricing.tsx), konfigurasi kredit AI (src/ai-credits/config.ts),
 * dan tab Paket & Billing Pengaturan (UnifiedSettingsView.tsx).
 *
 * Aturan main:
 * - Angka harga/batas/jatah JANGAN di-hardcode di komponen — impor dari sini.
 * - Kredit Free bersifat INITIAL (sekali di awal), BUKAN periodik. Jangan
 *   pernah memperlakukannya sebagai jatah per periode.
 * - Business tanpa batas proyek direpresentasikan sebagai `null` secara
 *   eksplisit (bukan angka besar karangan); gunakan `isUnlimitedProjects`.
 * - Harga top-up TIDAK didefinisikan di sini: owner menunda keputusannya
 *   (O-10) sampai kalibrasi biaya provider selesai (Fase 4).
 */
import type { AHSPDomain } from '../data/nationalCostDatabase/types';
import type { UserRole } from '../types';

/** ID paket kanonis. (Kredit simulasi lama memakai id 'pro' — pemetaannya
 *  ada di src/ai-credits/config.ts: CREDIT_PLAN_TO_PLAN_ID.) */
export type PlanId = 'free' | 'starter' | 'professional' | 'business';

/** Urutan paket dari terendah ke tertinggi (untuk tampilan & perbandingan). */
export const PLAN_IDS: readonly PlanId[] = ['free', 'starter', 'professional', 'business'];

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'starter' || value === 'professional' || value === 'business';
}

/**
 * Jatah kredit AI per paket. Dua semantik yang TIDAK boleh tertukar:
 * - 'initial'  — diberikan sekali di awal (Free: 100). Bukan periodik.
 * - 'periodic' — diberikan ulang setiap periode tagihan (bulanan).
 */
export type CreditAllowance =
  | { kind: 'initial'; credits: number }
  | { kind: 'periodic'; credits: number; period: 'monthly' };

/** Batas jumlah proyek. `null` = tanpa batas langganan (Business). */
export type ProjectLimit = number | null;

/** Peran tim yang diakui matriks entitlement (subset UserRole kanonis). */
export type EntitlementTeamRole = Extract<UserRole, 'SUPER_ADMIN' | 'ESTIMATOR' | 'CLIENT'>;

// ---------------------------------------------------------------------------
// Deskriptor akses per fitur (DATA untuk fase penegakan berikutnya)
// ---------------------------------------------------------------------------

/**
 * Akses kalkulator volume:
 * - 'restricted-set' — hanya ID pada daftar (Free: 13 ID hasil pemetaan
 *   kategori Persiapan/Pondasi/Dinding, tafsir (a′) — Keputusan O-2).
 * - 'sni-verified-set' — hanya ID bersitasi SNI bernomor terverifikasi
 *   (Starter interim — Keputusan O-1; registri sitasi SNI sungguhan adalah
 *   paket kerja Fase 2, daftar ini diganti hasil registri itu nanti).
 * - 'all' — seluruh kalkulator yang didukung (190).
 */
export type CalculatorAccess =
  | { kind: 'restricted-set'; calculatorIds: readonly string[] }
  | { kind: 'sni-verified-set'; calculatorIds: readonly string[] }
  | { kind: 'all' };

/**
 * Akses katalog template RAB:
 * - 'template-ids' — hanya ID terdaftar (Free: Rumah Type 36 1 & 2 lantai).
 * - 'categories' — seluruh template pada kategori terdaftar (Starter:
 *   3 kategori utuh = 32 ID — Keputusan O-3).
 * - 'all' — seluruh katalog teraudit (180).
 */
export type TemplateAccess =
  | { kind: 'template-ids'; templateIds: readonly string[] }
  | { kind: 'categories'; categories: readonly string[] }
  | { kind: 'all' };

/** AI Documents: 'credit-metered' = tersedia, dibatasi kredit per operasi
 *  saja (Keputusan O-6 — tanpa batas kategori/frekuensi). */
export type AiDocumentsAccess = 'locked' | 'credit-metered' | 'full';

/** Document Templates (kelompok terpisah dari AI Documents & Ekspor RAB):
 *  'bast-only' = BAST dari Registri 1 AI Document Studio (Keputusan O-4);
 *  'project-documents-and-schedule' = Registri 2 Document Engine. */
export type DocumentTemplateAccess =
  | 'none'
  | 'bast-only'
  | 'project-documents-and-schedule'
  | 'all';

/** Finance: Professional 'available' = semua modul, tanpa batas transaksi,
 *  pembatasan hanya lingkup proyek (Keputusan O-7). */
export type FinanceAccess = 'locked' | 'available' | 'full';

/** Reports: Free 'rekapitulasi-only' = tab Rekapitulasi saja (Keputusan O-8). */
export type ReportsAccess = 'rekapitulasi-only' | 'available' | 'full';

/** Ekspor PDF: Free 'limited' = Cover + Daftar Isi + Rekap RAB saja;
 *  "Rekap RAB" = tabel rekap + blok tanda tangan, parameter teknis
 *  dikeluarkan (Keputusan O-9). */
export type PdfExportAccess = 'limited' | 'available';

/** Ekspor Excel: Free 'limited-static' = Cover + Daftar Isi + Rekap RAB
 *  sebagai nilai statis, TANPA formula. */
export type ExcelExportAccess = 'limited-static' | 'available';

/** Matriks entitlement satu paket (Audit Billing Master §C). */
export interface PlanEntitlements {
  calculators: CalculatorAccess;
  /** Domain AHSP yang dibuka (dari union AHSPDomain aplikasi). */
  ahspDomains: readonly AHSPDomain[];
  templates: TemplateAccess;
  dedAi: boolean;
  aiDocuments: AiDocumentsAccess;
  documentTemplates: DocumentTemplateAccess;
  finance: FinanceAccess;
  reports: ReportsAccess;
  pdfExport: PdfExportAccess;
  excelExport: ExcelExportAccess;
  teamCollaboration: boolean;
  /** Peran tim yang diizinkan. Business mengikuti implementasi peran
   *  terverifikasi (§3 prompt) — belum berupa daftar final (O-12 terbuka). */
  teamRoles: readonly EntitlementTeamRole[] | 'follow-verified-implementation';
}

export interface PlanDefinition {
  id: PlanId;
  displayName: string;
  /** Harga langganan per bulan (IDR). Free = 0. */
  monthlyPriceIdr: number;
  projectLimit: ProjectLimit;
  credits: CreditAllowance;
  entitlements: PlanEntitlements;
}

// ---------------------------------------------------------------------------
// Daftar ID/kategori hasil keputusan owner (bahan fase penegakan)
// ---------------------------------------------------------------------------

/**
 * Kalkulator Free — 13 ID (Keputusan O-2, tafsir (a′)):
 * Persiapan (hasil adaptasi runtime) + Pondasi + Dinding.
 */
export const FREE_CALCULATOR_IDS: readonly string[] = [
  // Persiapan
  'BOWPLANK',
  'residential.cut_and_fill',
  'residential.galian_tanah',
  'residential.urugan_tanah',
  'residential.drainase',
  // Pondasi
  'PONDASI',
  'FOOT_PLATE',
  'residential.pondasi_batu_kali',
  'residential.pondasi_beton_footing',
  // Dinding
  'BATA_RINGAN',
  'BATA_MERAH',
  'BATAKO',
  'residential.dinding',
];

/**
 * Kalkulator Starter INTERIM — 8 ID bersitasi SNI bernomor eksplisit
 * (Keputusan O-1; Audit Billing Master §E.2). Catatan auditor: sitasi
 * BAJA_WF (SNI 07-7178-2006) hidup di teks deskripsi + registri profil baja,
 * bukan field spesifikasi. Daftar ini digantikan registri sitasi SNI
 * sungguhan pada Fase 2.
 */
export const STARTER_SNI_VERIFIED_CALCULATOR_IDS: readonly string[] = [
  'BAJA_WF',
  'residential.pembesian',
  'drainage.manhole',
  'drainage.excavation',
  'river.gabion',
  'water.pipe',
  'water.concrete_structure',
  'water.excavation',
];

/** Template Free — Rumah Type 36 satu & dua lantai (ID katalog terverifikasi). */
export const FREE_TEMPLATE_IDS: readonly string[] = ['HOUSE-T36-1FL', 'HOUSE-T36-2FL'];

/** Kategori template Starter — tiga kategori utuh = 32 ID (Keputusan O-3). */
export const STARTER_TEMPLATE_CATEGORIES: readonly string[] = [
  'RUMAH_TINGGAL',
  'GEDUNG',
  'KESEHATAN',
];

/** Seluruh domain AHSP yang didukung aplikasi (di luar 'CUSTOM'). */
export const ALL_AHSP_DOMAINS: readonly AHSPDomain[] = [
  'CIPTA_KARYA',
  'BINA_MARGA',
  'SUMBER_DAYA_AIR',
  'SMKK',
];

const NO_TEAM_ROLES: readonly EntitlementTeamRole[] = [];
const PROFESSIONAL_TEAM_ROLES: readonly EntitlementTeamRole[] = [
  'SUPER_ADMIN',
  'ESTIMATOR',
  'CLIENT',
];

// ---------------------------------------------------------------------------
// Definisi kanonis (Master Prompt Billing §3 — owner-approved)
// ---------------------------------------------------------------------------

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    displayName: 'Free',
    monthlyPriceIdr: 0,
    projectLimit: 1,
    credits: { kind: 'initial', credits: 100 },
    entitlements: {
      calculators: { kind: 'restricted-set', calculatorIds: FREE_CALCULATOR_IDS },
      ahspDomains: ['CIPTA_KARYA'],
      templates: { kind: 'template-ids', templateIds: FREE_TEMPLATE_IDS },
      dedAi: false,
      aiDocuments: 'locked',
      documentTemplates: 'none',
      finance: 'locked',
      reports: 'rekapitulasi-only',
      pdfExport: 'limited',
      excelExport: 'limited-static',
      teamCollaboration: false,
      teamRoles: NO_TEAM_ROLES,
    },
  },
  starter: {
    id: 'starter',
    displayName: 'Starter',
    monthlyPriceIdr: 54_999,
    projectLimit: 7,
    credits: { kind: 'periodic', credits: 5_000, period: 'monthly' },
    entitlements: {
      calculators: { kind: 'sni-verified-set', calculatorIds: STARTER_SNI_VERIFIED_CALCULATOR_IDS },
      ahspDomains: ['CIPTA_KARYA'],
      templates: { kind: 'categories', categories: STARTER_TEMPLATE_CATEGORIES },
      dedAi: true,
      aiDocuments: 'locked',
      documentTemplates: 'bast-only',
      finance: 'locked',
      reports: 'available',
      pdfExport: 'available',
      excelExport: 'available',
      teamCollaboration: false,
      teamRoles: NO_TEAM_ROLES,
    },
  },
  professional: {
    id: 'professional',
    displayName: 'Professional',
    monthlyPriceIdr: 79_999,
    projectLimit: 25,
    credits: { kind: 'periodic', credits: 10_000, period: 'monthly' },
    entitlements: {
      calculators: { kind: 'all' },
      ahspDomains: ALL_AHSP_DOMAINS,
      templates: { kind: 'all' },
      dedAi: true,
      aiDocuments: 'credit-metered',
      documentTemplates: 'project-documents-and-schedule',
      finance: 'available',
      reports: 'full',
      pdfExport: 'available',
      excelExport: 'available',
      teamCollaboration: true,
      teamRoles: PROFESSIONAL_TEAM_ROLES,
    },
  },
  business: {
    id: 'business',
    displayName: 'Business',
    monthlyPriceIdr: 159_999,
    projectLimit: null,
    credits: { kind: 'periodic', credits: 30_000, period: 'monthly' },
    entitlements: {
      calculators: { kind: 'all' },
      ahspDomains: ALL_AHSP_DOMAINS,
      templates: { kind: 'all' },
      dedAi: true,
      aiDocuments: 'full',
      documentTemplates: 'all',
      finance: 'full',
      reports: 'full',
      pdfExport: 'available',
      excelExport: 'available',
      teamCollaboration: true,
      teamRoles: 'follow-verified-implementation',
    },
  },
};

// ---------------------------------------------------------------------------
// Resolver bertipe
// ---------------------------------------------------------------------------

export function getPlanDefinition(planId: PlanId): PlanDefinition {
  return PLAN_DEFINITIONS[planId];
}

export function getEntitlement<K extends keyof PlanEntitlements>(
  planId: PlanId,
  key: K
): PlanEntitlements[K] {
  return PLAN_DEFINITIONS[planId].entitlements[key];
}

/** true bila paket tidak punya batas jumlah proyek (Business). */
export function isUnlimitedProjects(planId: PlanId): boolean {
  return PLAN_DEFINITIONS[planId].projectLimit === null;
}

/** Jatah kredit periodik per bulan; `null` untuk paket berjatah initial (Free). */
export function periodicCredits(planId: PlanId): number | null {
  const c = PLAN_DEFINITIONS[planId].credits;
  return c.kind === 'periodic' ? c.credits : null;
}

/** Jatah kredit awal (sekali); `null` untuk paket periodik. */
export function initialCredits(planId: PlanId): number | null {
  const c = PLAN_DEFINITIONS[planId].credits;
  return c.kind === 'initial' ? c.credits : null;
}
