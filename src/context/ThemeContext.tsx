import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'emerald' | 'violet' | 'amber';
export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious';
export type MotionMode = 'full' | 'reduced' | 'off';
/** Tema premium (pelanggan berbayar): dark-based, override via data-premium-theme. */
export type PremiumTheme = 'default' | 'blueprint' | 'gold' | 'emerald';

interface ThemeContextType {
  theme: ThemeMode;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  density: InterfaceDensity;
  setDensity: (density: InterfaceDensity) => void;
  motion: MotionMode;
  setMotion: (motion: MotionMode) => void;
  premiumTheme: PremiumTheme;
  setPremiumTheme: (t: PremiumTheme) => void;
  /**
   * Hook point entitlement tema premium.
   * PENTING: ini BUKAN keamanan — hanya saklar UI client-side.
   * Hari ini selalu true (belum ada auth/backend subscription; AUTH_ENABLED=false).
   * Saat backend entitlement tervalidasi server tersedia, ganti isi fungsi ini
   * dengan pengecekan subscription sungguhan. Jangan pernah mengandalkan
   * nilai ini sebagai satu-satunya penjaga akses premium.
   */
  canUsePremiumThemes: () => boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('ezrab_theme') as ThemeMode) || 'light';
  });

  const [accent, setAccent] = useState<AccentColor>(() => {
    return (localStorage.getItem('ezrab_accent') as AccentColor) || 'blue';
  });

  const [density, setDensity] = useState<InterfaceDensity>(() => {
    return (localStorage.getItem('ezrab_density') as InterfaceDensity) || 'comfortable';
  });

  const [motion, setMotion] = useState<MotionMode>(() => {
    return (localStorage.getItem('ezrab_motion') as MotionMode) || 'full';
  });

  const [premiumTheme, setPremiumTheme] = useState<PremiumTheme>(() => {
    const v = localStorage.getItem('ezrab_premium_theme') as PremiumTheme | null;
    return v === 'blueprint' || v === 'gold' || v === 'emerald' ? v : 'default';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  // Hook point entitlement — lihat dokumentasi di interface. Selalu true
  // sampai ada backend subscription tervalidasi server.
  const canUsePremiumThemes = React.useCallback(() => true, []);

  useEffect(() => {
    localStorage.setItem('ezrab_theme', theme);
    localStorage.setItem('ezrab_premium_theme', premiumTheme);
    const root = document.documentElement;

    const resolveTheme = () => {
      // Tema premium selalu dark-based.
      if (premiumTheme !== 'default') return 'dark';
      if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDark ? 'dark' : 'light';
      }
      return theme;
    };

    const active = resolveTheme();
    setEffectiveTheme(active);
    root.setAttribute('data-theme', active);
    if (premiumTheme === 'default') root.removeAttribute('data-premium-theme');
    else root.setAttribute('data-premium-theme', premiumTheme);
  }, [theme, premiumTheme]);

  useEffect(() => {
    localStorage.setItem('ezrab_accent', accent);
    document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  useEffect(() => {
    localStorage.setItem('ezrab_density', density);
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    localStorage.setItem('ezrab_motion', motion);
    document.documentElement.setAttribute('data-motion', motion);
  }, [motion]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        effectiveTheme,
        setTheme,
        accent,
        setAccent,
        density,
        setDensity,
        motion,
        setMotion,
        premiumTheme,
        setPremiumTheme,
        canUsePremiumThemes,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
