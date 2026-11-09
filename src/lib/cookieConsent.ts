/**
 * Persetujuan cookie EZRAB — penyimpanan pilihan pengunjung landing.
 *
 * Keadaan saat ini (jujur): EZRAB TIDAK memasang analitik/iklan. Cookie
 * penting (sesi & gerbang akses) selalu aktif. Pilihan di sini dicatat
 * untuk pengukuran kunjungan di masa depan: pengukuran HANYA boleh
 * berjalan bila `hasAnalyticsConsent()` mengembalikan true.
 *
 * Pilihan disimpan di localStorage dengan kunci versi di bawah; format
 * JSON { choice, ts } agar kelak bisa diaudit kapan persetujuan diberi.
 */

export const COOKIE_CONSENT_STORAGE_KEY = 'ezrab-cookie-consent-v1';

export type CookieConsentChoice = 'accepted' | 'rejected';

interface StoredCookieConsent {
  choice: CookieConsentChoice;
  ts: number;
}

const readStorage = (): Storage | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // localStorage bisa melempar (mode privat / kebijakan browser).
    return null;
  }
};

/** Pilihan tersimpan pengunjung, atau null bila belum pernah memilih. */
export const getCookieConsent = (): CookieConsentChoice | null => {
  const storage = readStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCookieConsent>;
    if (parsed.choice === 'accepted' || parsed.choice === 'rejected') {
      return parsed.choice;
    }
    return null;
  } catch {
    return null;
  }
};

/** Simpan pilihan pengunjung beserta waktu pemberiannya. */
export const setCookieConsent = (choice: CookieConsentChoice): void => {
  const storage = readStorage();
  if (!storage) return;
  try {
    const record: StoredCookieConsent = { choice, ts: Date.now() };
    storage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Gagal menyimpan tidak boleh merusak halaman; banner akan tampil
    // lagi pada kunjungan berikutnya.
  }
};

/**
 * Gerbang analitik: true HANYA bila pengunjung menekan "Terima".
 * Pakai fungsi ini sebelum memuat alat ukur apa pun di masa depan.
 */
export const hasAnalyticsConsent = (): boolean => getCookieConsent() === 'accepted';
