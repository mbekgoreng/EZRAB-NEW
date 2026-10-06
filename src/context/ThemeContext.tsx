import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'emerald' | 'violet' | 'amber';
export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious';
export type MotionMode = 'full' | 'reduced' | 'off';

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

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    localStorage.setItem('ezrab_theme', theme);
    const root = document.documentElement;

    const resolveTheme = () => {
      if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDark ? 'dark' : 'light';
      }
      return theme;
    };

    const active = resolveTheme();
    setEffectiveTheme(active);
    root.setAttribute('data-theme', active);
  }, [theme]);

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
