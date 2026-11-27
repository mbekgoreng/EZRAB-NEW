/**
 * Try-out 5 peran server (SUPER_ADMIN, ESTIMATOR, DIREKSI, CLIENT, EDITOR)
 * — implementasi mockup `~/workspace/ts-spaces/mockup-coba-5-role/index.html`.
 *
 * APA ADANYA dari mockup: nama peran, orang, warna, PIN demo, matriks
 * kemampuan (CAPS), dan tabel akses menu (ACCESS) disalin verbatim dari
 * mockup. Satu-satunya penyesuaian adalah PEMETAAN menu mockup (8 menu)
 * ke id menu aplikasi asli (routes.ts / Sidebar) — lihat
 * TRYOUT_MENU_FAMILY di bawah; menu aplikasi yang tidak punya padanan di
 * mockup TIDAK digating (akses 'full', perilaku lama dipertahankan).
 *
 * BATAS TEGAS — ini HANYA try-out tampilan di browser (client-side),
 * sama seperti 5 role demo yang sudah ada:
 * - BUKAN otorisasi server. Peran demo login (src/auth/roleAccounts.ts —
 *   qs/estimator/kontraktor/konsultan/team) adalah hal BERBEDA dan TIDAK
 *   dipetakan ke peran server di sini (K-16 tetap terbuka).
 * - TIDAK ada pemeriksaan PIN di dalam workspace: kartu peran + PIN demo
 *   di layar Masuk adalah bagian mockup yang file-nya di luar cakupan
 *   worker ini (layar login tidak disentuh). PIN di bawah ini adalah PIN
 *   DEMO MOCKUP (pola 6 digit, mudah diingat untuk mencoba); PIN final
 *   per peran diputuskan saat penerapan (catatan mockup).
 * - Klien: mockup menampilkan RAB yang sama secara read-only. Pertanyaan
 *   "apakah Klien boleh melihat harga satuan atau hanya total?" MASIH
 *   TERBUKA (catatan mockup) — implementasi ini mengikuti mockup
 *   (read-only, harga satuan tetap terlihat) dan TIDAK memutuskan
 *   pertanyaan itu.
 * - EDITOR: mockup mengusulkan "draf saja" (tanpa verifikasi harga,
 *   tanpa ekspor final). EDITOR belum punya akun seed dan tidak dipakai
 *   kontrak skill mana pun (K-16) — kemampuan di sini mengikuti matriks
 *   mockup, bukan kapabilitas skill-engine yang sudah ada.
 *
 * Matriks mockup (baris = kemampuan, kolom = SA/EST/DIR/KLI/EDT):
 * - Lihat dashboard & progres proyek:      ✓ ✓ ✓ ✓ ✓
 * - Edit RAB & volume:                     ✓ ✓ — — ◐ (draf saja)
 * - Verifikasi harga pasar:                ✓ ✓ — — —
 * - Setujui anggaran / RAB final:          ✓ — ✓ ✓ —
 * - Ekspor laporan:                        ✓ ✓ ✓ — —
 * - Chat AI — operasi tulis ke RAB:        ✓ ✓ — — ✓
 * - Dokumen & DED AI:                      ✓ ✓ — — ✓
 * - Kelola tim & pengguna:                 ✓ — — — —
 * - Keamanan & kode akses:                 ✓ — — — —
 * - Billing & langganan:                   ✓ — ◐ (lihat saja) — —
 */

import type { SkillRole } from '../ai-tools/skill-engine/types';
import { SERVER_ROLE_TAXONOMY } from '../ai-tools/skill-engine/types';

/** Urutan peran mengikuti mockup (ROLE_ORDER). */
export const TRYOUT_ROLE_ORDER: readonly SkillRole[] = SERVER_ROLE_TAXONOMY;

export interface TryoutRoleMeta {
  /** Label peran (mockup ROLES[].name). */
  label: string;
  /** Nama orang di kartu mockup — mengikuti akun & anggota tim seed yang
   * sudah ada; Editor belum punya akun seed ("Belum ada akun seed"). */
  person: string;
  initials: string;
  /** Warna avatar/badge peran (mockup ROLES[].color). */
  color: string;
  /** PIN demo mockup — TIDAK ditegakkan di try-out dalam workspace. */
  pin: string;
  /** Deskripsi kartu peran (mockup ROLES[].desc). */
  desc: string;
}

/** Metadata kartu peran — verbatim mockup ROLES. */
export const TRYOUT_ROLE_META: Record<SkillRole, TryoutRoleMeta> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    person: 'Ahmad Yusuf Fahrezzi',
    initials: 'AY',
    color: '#1d4ed8',
    pin: '100100',
    desc: 'Akses penuh: semua proyek, kelola tim, keamanan, dan billing.',
  },
  ESTIMATOR: {
    label: 'Estimator',
    person: 'Budi Santoso',
    initials: 'BS',
    color: '#0f766e',
    pin: '200200',
    desc: 'Susun & edit RAB dan volume, verifikasi harga pasar, ekspor laporan.',
  },
  DIREKSI: {
    label: 'Direksi',
    person: 'Ir. Hendra Kusuma',
    initials: 'HK',
    color: '#b45309',
    pin: '300300',
    desc: 'Pantau dashboard & laporan, setujui anggaran. Tidak mengedit RAB.',
  },
  CLIENT: {
    label: 'Klien',
    person: 'Bambang Soediro',
    initials: 'BB',
    color: '#475569',
    pin: '400400',
    desc: 'Lihat progres & RAB proyek miliknya dan setujui RAB final — selebihnya lihat saja, tidak bisa mengedit.',
  },
  EDITOR: {
    label: 'Editor',
    person: 'Belum ada akun seed',
    initials: 'ED',
    color: '#c2410c',
    pin: '500500',
    desc: 'Susun draf RAB & dokumen proyek. Tanpa verifikasi harga, tanpa ekspor final.',
  },
};

/**
 * Kemampuan aksi per peran — verbatim mockup CAPS.
 * 'edit' EDITOR = draf saja (matriks: ◐ draf saja); kemampuan ini hanya
 * menyatakan BOLEH mengedit — pembedaan "draf vs final" hidup di alur
 * RAB dan bukan bagian try-out ini.
 */
export type TryoutCapability =
  | 'edit'
  | 'verify'
  | 'export'
  | 'approve'
  | 'team'
  | 'security'
  | 'billing'
  | 'chat';

export const TRYOUT_CAPABILITIES: Record<
  TryoutCapability,
  { roles: readonly SkillRole[]; label: string }
> = {
  edit: { roles: ['SUPER_ADMIN', 'ESTIMATOR', 'EDITOR'], label: 'mengedit RAB' },
  verify: { roles: ['SUPER_ADMIN', 'ESTIMATOR'], label: 'memverifikasi harga' },
  export: { roles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI'], label: 'mengekspor laporan' },
  approve: { roles: ['SUPER_ADMIN', 'DIREKSI', 'CLIENT'], label: 'menyetujui anggaran / RAB' },
  team: { roles: ['SUPER_ADMIN'], label: 'mengelola tim & pengguna' },
  security: { roles: ['SUPER_ADMIN'], label: 'mengubah pengaturan keamanan' },
  billing: { roles: ['SUPER_ADMIN'], label: 'mengelola billing & langganan' },
  chat: { roles: ['SUPER_ADMIN', 'ESTIMATOR', 'EDITOR'], label: 'memakai Chat AI untuk operasi tulis' },
};

export const canTryout = (role: SkillRole, cap: TryoutCapability): boolean =>
  TRYOUT_CAPABILITIES[cap].roles.includes(role);

/** Akses menu: 'full' = buka penuh · 'read' = lihat saja · 'lock' = terkunci. */
export type TryoutMenuAccess = 'full' | 'read' | 'lock';

/**
 * Pemetaan menu mockup -> id menu aplikasi asli (verbatim ACCESS mockup,
 * diterjemahkan ke keluarga menu nyata):
 * - dashboard  -> 'dashboard'
 * - rab        -> keluarga RAB & volume (rab-*, qto, qto-vc, daftar-pekerjaan)
 * - verifikasi -> 'master-pricing' (konsol harga master — tempat
 *   verifikasi harga pasar di aplikasi asli)
 * - dokumen    -> 'dokumen-ai', 'ded-ai'
 * - laporan    -> 'laporan', 'boq', 'rekapitulasi', 'export'
 * - tim        -> hidup di tab Pengaturan (users/roles) — file settings
 *   DI LUAR cakupan worker ini, jadi TIDAK dipetakan di sini.
 * - keamanan   -> tab Pengaturan (security) — sama, di luar cakupan.
 * - billing    -> 'subscription', 'kredit-ai'
 * Menu lain (proyek, manajemen-proyek, jadwal, kurva-s, template-rab,
 * ahsp-2026, database material/upah/alat, harga-proyek, resource-library,
 * keuangan-proyek, dokumen-tender, ezrab-ai, magic-ai, desain-rab,
 * pengaturan, blog-admin) TIDAK punya padanan di mockup -> 'full'
 * (perilaku lama dipertahankan; bukan keputusan izin, melainkan
 * ketiadaan padanan mockup).
 */
const RAB_FAMILY_MENUS = [
  'rab-estimasi',
  'rab-informasi-proyek',
  'rab-spreadsheet',
  'rab-rekapitulasi',
  'rab-analisa-harga',
  'rab-kurva-s',
  'rab-catatan',
  'rab-pengaturan',
  'qto',
  'qto-vc',
  'daftar-pekerjaan',
];

const DOKUMEN_MENUS = ['dokumen-ai', 'ded-ai'];
const LAPORAN_MENUS = ['laporan', 'boq', 'rekapitulasi', 'export'];
const BILLING_MENUS = ['subscription', 'kredit-ai'];

const TRYOUT_ACCESS_BY_FAMILY: Record<
  string,
  Record<SkillRole, TryoutMenuAccess>
> = {
  dashboard: {
    SUPER_ADMIN: 'full',
    ESTIMATOR: 'full',
    DIREKSI: 'full',
    CLIENT: 'full',
    EDITOR: 'full',
  },
  rab: {
    SUPER_ADMIN: 'full',
    ESTIMATOR: 'full',
    DIREKSI: 'read',
    CLIENT: 'read',
    EDITOR: 'full',
  },
  verifikasi: {
    SUPER_ADMIN: 'full',
    ESTIMATOR: 'full',
    DIREKSI: 'lock',
    CLIENT: 'lock',
    EDITOR: 'lock',
  },
  dokumen: {
    SUPER_ADMIN: 'full',
    ESTIMATOR: 'full',
    DIREKSI: 'lock',
    CLIENT: 'lock',
    EDITOR: 'full',
  },
  laporan: {
    SUPER_ADMIN: 'full',
    ESTIMATOR: 'full',
    DIREKSI: 'full',
    CLIENT: 'read',
    EDITOR: 'lock',
  },
  billing: {
    SUPER_ADMIN: 'full',
    ESTIMATOR: 'lock',
    DIREKSI: 'read',
    CLIENT: 'lock',
    EDITOR: 'lock',
  },
};

const menuFamilyOf = (menu: string): string | null => {
  if (menu === 'dashboard') return 'dashboard';
  if (menu === 'master-pricing') return 'verifikasi';
  if (RAB_FAMILY_MENUS.includes(menu)) return 'rab';
  if (DOKUMEN_MENUS.includes(menu)) return 'dokumen';
  if (LAPORAN_MENUS.includes(menu)) return 'laporan';
  if (BILLING_MENUS.includes(menu)) return 'billing';
  return null;
};

/** Akses menu aktif untuk peran try-out. Menu tanpa padanan mockup -> 'full'. */
export const tryoutMenuAccess = (
  role: SkillRole,
  menu: string,
): TryoutMenuAccess => {
  const family = menuFamilyOf(menu);
  if (!family) return 'full';
  return TRYOUT_ACCESS_BY_FAMILY[family][role];
};

/** Label menu (Bahasa Indonesia, dari mockup) untuk pesan penolakan. */
export const TRYOUT_MENU_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'rab-estimasi': 'RAB & Volume',
  'rab-informasi-proyek': 'RAB & Volume',
  'rab-spreadsheet': 'RAB & Volume',
  'rab-rekapitulasi': 'RAB & Volume',
  'rab-analisa-harga': 'RAB & Volume',
  'rab-kurva-s': 'RAB & Volume',
  'rab-catatan': 'RAB & Volume',
  'rab-pengaturan': 'RAB & Volume',
  qto: 'RAB & Volume',
  'qto-vc': 'RAB & Volume',
  'daftar-pekerjaan': 'RAB & Volume',
  'master-pricing': 'Verifikasi Harga',
  'dokumen-ai': 'Dokumen & DED AI',
  'ded-ai': 'Dokumen & DED AI',
  laporan: 'Laporan',
  boq: 'Laporan',
  rekapitulasi: 'Laporan',
  export: 'Laporan',
  subscription: 'Billing',
  'kredit-ai': 'Billing',
};

export const tryoutMenuLabel = (menu: string): string =>
  TRYOUT_MENU_LABELS[menu] ?? menu;

/** Pesan penolakan — pola verbatim mockup (toast "Ditolak — …"). */
export const tryoutDeniedMenuMessage = (role: SkillRole, menu: string): string =>
  `Ditolak — peran ${TRYOUT_ROLE_META[role].label} tidak punya akses ke menu ${tryoutMenuLabel(menu)}.`;

export const tryoutDeniedCapabilityMessage = (
  role: SkillRole,
  cap: TryoutCapability,
): string =>
  `Ditolak — peran ${TRYOUT_ROLE_META[role].label} tidak berhak ${TRYOUT_CAPABILITIES[cap].label}.`;

/** Pesan masuk peran — pola mockup setRole ("Masuk sebagai …"). */
export const tryoutEnteredMessage = (role: SkillRole): string => {
  const meta = TRYOUT_ROLE_META[role];
  return `Masuk sebagai ${meta.label} — ${meta.person}. Menu & izin sudah menyesuaikan peran ini.`;
};

/** Banner mode lihat saja — verbatim mockup bannerFor('read'). */
export const tryoutReadOnlyBanner = (role: SkillRole): string =>
  `Mode lihat saja. Peran ${TRYOUT_ROLE_META[role].label} dapat membuka halaman ini, tetapi semua tombol ubah dinonaktifkan.`;

/** Kunci localStorage untuk peran try-out (client-side saja). */
export const TRYOUT_ROLE_STORAGE_KEY = 'ezrab_server_role_tryout';

/** Baca peran try-out tersimpan; nilai tak dikenal -> default mockup (SUPER_ADMIN). */
export const readStoredTryoutRole = (): SkillRole => {
  try {
    const raw = localStorage.getItem(TRYOUT_ROLE_STORAGE_KEY);
    if (raw && (SERVER_ROLE_TAXONOMY as readonly string[]).includes(raw)) {
      return raw as SkillRole;
    }
  } catch {
    // localStorage tak tersedia — pakai default mockup.
  }
  return 'SUPER_ADMIN';
};

export const storeTryoutRole = (role: SkillRole): void => {
  try {
    localStorage.setItem(TRYOUT_ROLE_STORAGE_KEY, role);
  } catch {
    // Penyimpanan gagal — peran tetap berlaku untuk sesi ini saja.
  }
};
