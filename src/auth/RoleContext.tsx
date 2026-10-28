import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getRoleAccount,
  resolveCapability,
  verifyRolePin,
  type RoleAccount,
  type RoleCapability,
} from './roleAccounts';
import { clearLogoutInProgress } from './sessionBoundary';

/** Kunci penyimpanan sesi role aktif di localStorage. */
export const ROLE_STORAGE_KEY = 'ezrab_role_v1';

export interface RoleSession {
  roleId: string;
  name: string;
  title: string;
  loginAt: string;
}

export interface RoleContextValue {
  /** Akun role yang sedang aktif (null = tidak ada sesi role). */
  activeRole: RoleAccount | null;
  /** Ringkasan sesi yang tersimpan. */
  session: RoleSession | null;
  /**
   * Login dengan PIN. PIN benar-benar diverifikasi terhadap `roleAccounts.ts`.
   * Mengembalikan { ok: true } saat berhasil, atau { ok: false, error } saat gagal.
   */
  loginWithPin: (roleId: string, pin: string) => { ok: boolean; error?: 'unknown-role' | 'invalid-pin' };
  /** Keluar dari mode role (menghapus sesi). */
  logoutRole: () => void;
  /**
   * Cek kemampuan role aktif (R1, default-deny).
   * - Tanpa sesi -> false untuk semua capability.
   * - Nama capability tak dikenal -> false.
   * - Capability sensitif (manage-users, manage-security, verify-prices)
   *   hanya true bila PIN dimasukkan di tab ini; sesi yang dipulihkan
   *   dari localStorage (termasuk yang dipalsukan) tidak mendapatkannya.
   */
  hasCapability: (capability: RoleCapability) => boolean;
}

/**
 * Membaca sesi role tersimpan. Diekspor untuk pengujian.
 * PERHATIAN: fungsi ini hanya memvalidasi BENTUK (roleId string yang
 * dikenal). Ia TIDAK membuktikan keaslian — nilai localStorage bisa
 * ditulis siapa pun. Keaslian untuk capability sensitif ditegakkan
 * terpisah lewat pinVerifiedInTab di provider (lihat resolveCapability).
 */
export const readStoredSession = (): RoleSession | null => {
  try {
    const raw = localStorage.getItem(ROLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoleSession>;
    if (typeof parsed.roleId !== 'string' || !getRoleAccount(parsed.roleId)) return null;
    return {
      roleId: parsed.roleId,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      loginAt: typeof parsed.loginAt === 'string' ? parsed.loginAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const defaultRoleValue: RoleContextValue = {
  activeRole: null,
  session: null,
  loginWithPin: () => ({ ok: false, error: 'unknown-role' }),
  logoutRole: () => {
    /* tanpa provider: no-op */
  },
  // Tanpa provider: default-deny (R1). Sebelumnya true — celah yang sama
  // dengan perilaku tanpa-sesi di provider.
  hasCapability: () => false,
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<RoleSession | null>(() => readStoredSession());
  /**
   * R1: true hanya bila PIN dimasukkan lewat loginWithPin di tab ini.
   * Sengaja TIDAK dipersist ke localStorage — nilai yang dipersist bisa
   * dipalsukan, jadi nilai ini harus lahir dari aksi login di tab ini
   * dan mati saat logout. Sesi yang dipulihkan dari penyimpanan
   * (reload tab / nilai palsu) selalu mulai dengan false.
   */
  const [pinVerifiedInTab, setPinVerifiedInTab] = useState(false);

  const activeRole: RoleAccount | null = useMemo(
    () => (session ? getRoleAccount(session.roleId) ?? null : null),
    [session]
  );

  // Persist sesi ke localStorage setiap berubah.
  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(ROLE_STORAGE_KEY);
      }
    } catch {
      /* abaikan */
    }
  }, [session]);

  const loginWithPin = useCallback((roleId: string, pin: string) => {
    const account = getRoleAccount(roleId);
    if (!account) return { ok: false as const, error: 'unknown-role' as const };
    if (!verifyRolePin(roleId, pin)) return { ok: false as const, error: 'invalid-pin' as const };
    setSession({
      roleId: account.id,
      name: account.name,
      title: account.title,
      loginAt: new Date().toISOString(),
    });
    // Sesi baru dimulai di tab ini: PIN terverifikasi, dan penanda
    // logout (bila ada dari sesi sebelumnya) dibersihkan.
    setPinVerifiedInTab(true);
    clearLogoutInProgress();
    return { ok: true as const };
  }, []);

  const logoutRole = useCallback(() => {
    setSession(null);
    setPinVerifiedInTab(false);
  }, []);

  const hasCapability = useCallback(
    (capability: RoleCapability): boolean =>
      resolveCapability(session, capability, pinVerifiedInTab),
    [session, pinVerifiedInTab]
  );

  const value = useMemo<RoleContextValue>(
    () => ({ activeRole, session, loginWithPin, logoutRole, hasCapability }),
    [activeRole, session, loginWithPin, logoutRole, hasCapability]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

/**
 * Hook sesi role. Aman dipakai tanpa provider — mengembalikan state
 * "tidak ada role aktif" dengan fungsi no-op.
 */
export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  return ctx ?? defaultRoleValue;
}

export default RoleProvider;
