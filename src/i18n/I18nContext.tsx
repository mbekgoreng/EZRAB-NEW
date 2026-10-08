import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { dictionaries } from './dictionaries';

/**
 * Bahasa yang didukung antarmuka EZRAB.
 * - 'id'  : Bahasa Indonesia (default)
 * - 'en'  : English
 * - 'zh'  : 简体中文 (Mandarin Sederhana)
 * - 'ms'  : Bahasa Melayu
 */
export type Lang = 'id' | 'en' | 'zh' | 'ms';

/** Kunci penyimpanan bahasa di localStorage. */
export const LANG_STORAGE_KEY = 'ezrab_lang_v1';

/** Daftar bahasa untuk selector, dengan nama asli (native name). */
export const LANG_OPTIONS: Array<{ id: Lang; nativeName: string }> = [
  { id: 'id', nativeName: 'Indonesia' },
  { id: 'en', nativeName: 'English' },
  { id: 'zh', nativeName: '简体中文' },
  { id: 'ms', nativeName: 'Melayu' },
];

const VALID_LANGS: Lang[] = ['id', 'en', 'zh', 'ms'];

const readStoredLang = (): Lang => {
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    if (raw && (VALID_LANGS as string[]).includes(raw)) return raw as Lang;
  } catch {
    /* abaikan — pakai default */
  }
  return 'id';
};

/**
 * Ambil nilai string dari dictionary berdasarkan path bertitik, mis. "nav.home".
 */
function resolveKey(dict: unknown, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur !== null && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

export interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Terjemahkan key bertitik. Fallback: bahasa Indonesia → (dev saja) key mentah. */
  t: (key: string) => string;
}

const isDev = (): boolean => {
  try {
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
};

/** Default aman ketika hook dipakai tanpa I18nProvider: bahasa Indonesia. */
const defaultT = (key: string): string => {
  const idValue = resolveKey(dictionaries.id, key);
  if (idValue !== undefined) return idValue;
  return isDev() ? `[${key}]` : key;
};

const defaultI18nValue: I18nValue = {
  lang: 'id',
  setLang: () => {
    /* tanpa provider: no-op */
  },
  t: defaultT,
};

const I18nContext = createContext<I18nValue | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang());

  const setLang = useCallback((next: Lang) => {
    if (!(VALID_LANGS as string[]).includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* abaikan */
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      const value = resolveKey(dictionaries[lang], key);
      if (value !== undefined) return value;
      const idValue = resolveKey(dictionaries.id, key);
      if (idValue !== undefined) return idValue;
      // Key mentah tidak boleh bocor ke UI produksi — hanya tampilkan di dev.
      return isDev() ? `[${key}]` : key;
    },
    [lang]
  );

  // Sinkronkan atribut lang pada <html> agar screen reader & STT mengenali bahasa aktif.
  useEffect(() => {
    const htmlLang: Record<Lang, string> = { id: 'id', en: 'en', zh: 'zh-CN', ms: 'ms' };
    try {
      document.documentElement.lang = htmlLang[lang];
    } catch {
      /* abaikan */
    }
  }, [lang]);

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

/**
 * Hook i18n. Aman dipakai tanpa provider — mengembalikan default bahasa 'id'
 * dengan setLang yang no-op.
 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  return ctx ?? defaultI18nValue;
}

export default I18nProvider;
