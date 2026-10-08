/**
 * ============================================================================
 *  KONFIGURASI AKUN ROLE DEMO — EZRAB
 * ============================================================================
 * Alur "Masuk per Role": pengguna memilih salah satu role di bawah, lalu
 * memverifikasi identitasnya dengan PIN 6-digit khusus role tersebut.
 * Verifikasi PIN BENAR-BENAR dicek terhadap config ini (bukan pajangan).
 *
 * ----------------------------------------------------------------------------
 *  PIN DEMO (didokumentasikan untuk keperluan demo & pengujian):
 * ----------------------------------------------------------------------------
 *   Role            Nama Tampilan           PIN Demo
 *   --------------  ----------------------  --------
 *   qs              Quantity Surveyor       111111
 *   estimator       Estimator               222222
 *   kontraktor      Kontraktor              333333
 *   konsultan       Konsultan Perencana     444444
 *   team            Project Team            555555
 * ----------------------------------------------------------------------------
 * CATATAN KEAMANAN: PIN di atas adalah kredensial DEMO yang disengaja publik
 * agar alur login per role bisa dicoba siapa pun. JANGAN gunakan mekanisme ini
 * untuk data produksi yang sensitif — gunakan autentikasi server (Supabase)
 * yang sudah tersedia di AuthModal untuk akun nyata.
 * ============================================================================
 */

export type RoleId = 'qs' | 'estimator' | 'kontraktor' | 'konsultan' | 'team';

/** Kemampuan (capability) yang bisa dimiliki sebuah role. */
export type RoleCapability =
  | 'view-dashboard' // melihat dashboard & daftar proyek
  | 'edit-estimate' // membuat/mengubah RAB, QTO, volume
  | 'export-doc' // ekspor Excel/PDF/laporan
  | 'manage-users' // mengelola tim & anggota (sensitif)
  | 'manage-security'; // pengaturan keamanan akun (sensitif)

export interface RoleAccount {
  id: RoleId;
  /** Nama tampilan role (Indonesia — dilokalkan di UI via key `role.<id>` bila perlu). */
  name: string;
  /** Jabatan / spesialisasi. */
  title: string;
  /** Deskripsi singkat tugas role. */
  description: string;
  /** PIN demo 6-digit — diverifikasi sungguhan saat login. */
  pin: string;
  /** Daftar kemampuan role ini. */
  capabilities: RoleCapability[];
}

export const ROLE_ACCOUNTS: RoleAccount[] = [
  {
    id: 'qs',
    name: 'Quantity Surveyor',
    title: 'Presisi Volume & BoQ',
    description: 'Ekstraksi kuantitas dari gambar kerja dan penyusunan BoQ terstruktur.',
    pin: '111111',
    capabilities: ['view-dashboard', 'edit-estimate', 'export-doc'],
  },
  {
    id: 'estimator',
    name: 'Estimator',
    title: 'Analisa AHSP Cepat',
    description: 'Penyesuaian koefisien bahan, upah lokal, dan simulasi harga penawaran.',
    pin: '222222',
    capabilities: ['view-dashboard', 'edit-estimate', 'export-doc'],
  },
  {
    id: 'kontraktor',
    name: 'Kontraktor',
    title: 'Pengendalian Biaya',
    description: 'Pengawasan anggaran pelaksanaan, cash flow, dan monitoring kurva S.',
    pin: '333333',
    capabilities: ['view-dashboard', 'export-doc'],
  },
  {
    id: 'konsultan',
    name: 'Konsultan Perencana',
    title: 'Owner Estimate (OE)',
    description: 'Penyusunan Engineer Estimate dan HPS yang transparan dan siap audit.',
    pin: '444444',
    capabilities: ['view-dashboard', 'edit-estimate', 'export-doc'],
  },
  {
    id: 'team',
    name: 'Project Team',
    title: 'Kolaborasi Terpadu',
    description: 'Sinkronisasi engineering lapangan, pengadaan material, dan keuangan.',
    pin: '555555',
    capabilities: ['view-dashboard', 'edit-estimate', 'export-doc', 'manage-users', 'manage-security'],
  },
];

export const getRoleAccount = (roleId: string): RoleAccount | undefined =>
  ROLE_ACCOUNTS.find((r) => r.id === roleId);

/**
 * Verifikasi PIN sebuah role. Perbandingan dilakukan digit-per-digit agar
 * tidak ada jalan pintas tipe data (mis. "111111 " dengan spasi ditolak).
 * Mengembalikan true hanya jika cocok persis dengan config.
 */
export function verifyRolePin(roleId: string, pin: string): boolean {
  const account = getRoleAccount(roleId);
  if (!account) return false;
  const input = (pin || '').trim();
  if (!/^\d{6}$/.test(input)) return false;
  const expected = account.pin;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** True jika role boleh mengakses menu yang jelas-jelas sensitif. */
export function roleHasCapability(roleId: string, capability: RoleCapability): boolean {
  const account = getRoleAccount(roleId);
  if (!account) return false;
  return account.capabilities.includes(capability);
}
