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
  roleHasCapability,
  verifyRolePin,
  type RoleAccount,
  type RoleCapability,
} from './roleAccounts';

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
   * Cek kemampuan role aktif. Jika tidak ada sesi role, dianggap tidak
   * dibatasi (perilaku existing untuk pengguna non-role tetap sama).
   */
  hasCapability: (capability: RoleCapability) => boolean;
}

const readStoredSession = (): RoleSession | null => {
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
  hasCapability: () => true,
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<RoleSession | null>(() => readStoredSession());

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
    return { ok: true as const };
  }, []);

  const logoutRole = useCallback(() => {
    setSession(null);
  }, []);

  const hasCapability = useCallback(
    (capability: RoleCapability): boolean => {
      if (!session) return true; // tanpa sesi role: tidak ada pembatasan baru
      return roleHasCapability(session.roleId, capability);
    },
    [session]
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
