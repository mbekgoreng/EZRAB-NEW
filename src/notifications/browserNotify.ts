/**
 * browserNotify — jembatan notifikasi in-app EZRAB ke notifikasi native browser.
 *
 * Menghubungkan store notifikasi (NotificationContext) dengan Notification
 * API browser, TANPA mengubah API provider yang ada:
 * - NotificationProvider memanggil `ensureBrowserNotifyBridge()` sekali saat
 *   mount dan meneruskan setiap notifikasi BARU ke
 *   `maybeShowBrowserNotification(item)`.
 * - Notifikasi native hanya tampil bila SEMUA terpenuhi:
 *   preferensi user 'on' (opt-in eksplisit, tersimpan di localStorage
 *   `ezrab_browser_notify`, default 'off'), izin browser 'granted', dan tab
 *   sedang tidak fokus (document.hidden) — user yang sedang menatap aplikasi
 *   tidak diganggu; lonceng in-app sudah cukup untuknya.
 * - Izin TIDAK PERNAH diminta tanpa gesture: `requestBrowserNotifyPermission`
 *   hanya dipanggil dari klik tombol "Aktifkan" di UI.
 * - Penayangan memakai `registration.showNotification()` dari service worker
 *   `public/sw.js` bila registrasi tersedia (wajib untuk Chrome Android),
 *   fallback konstruktor `new Notification(...)`. Tag = id item (anti-dobel),
 *   data = { link } mengikuti NotificationItem.link.
 * - Klik notifikasi: service worker memfokuskan tab EZRAB yang ada lalu
 *   postMessage { type: 'ezrab-navigate', menu }; bridge meneruskannya ke
 *   handler navigasi terdaftar (TopBar mendaftarkan handler yang memakai
 *   pemecahan link 'menu:tab' yang sama persis dengan klik item lonceng).
 *   Pada jalur fallback konstruktor, onclick melakukan hal yang sama.
 *
 * BATAS FASE INI (sengaja): tidak ada Push API / push subscription / backend
 * push. Notifikasi menjangkau selama aplikasi terbuka di tab mana pun pada
 * browser yang sama (termasuk background), TIDAK setelah semua tab ditutup.
 * Backend push butuh endpoint server baru — tertahan batas 12 Serverless
 * Function Vercel Hobby (sudah penuh) dan backend ditunda owner.
 *
 * Modul ini membaca global DOM (window/document/navigator/localStorage)
 * secara lazy di dalam fungsi — tidak menyentuhnya saat import — agar aman
 * di lingkungan non-browser (tes Node) dan tidak membuat siklus impor.
 */

export const BROWSER_NOTIFY_PREF_KEY = 'ezrab_browser_notify';
export const BROWSER_NOTIFY_ICON = '/icons/apple-touch-icon.png';
const SERVICE_WORKER_URL = '/sw.js';

export type BrowserNotifyPref = 'on' | 'off';
export type BrowserNotifyPermission = NotificationPermission | 'unsupported';

/** Bentuk minimal yang dibutuhkan bridge — NotificationItem memenuhinya. */
export interface BrowserNotifyItem {
  id: string;
  title: string;
  message: string;
  link?: string;
}

// ---------------------------------------------------------------------------
// Preferensi user (persisten, opt-in)
// ---------------------------------------------------------------------------

const prefListeners = new Set<(pref: BrowserNotifyPref) => void>();

export function getBrowserNotifyPref(): BrowserNotifyPref {
  try {
    return localStorage.getItem(BROWSER_NOTIFY_PREF_KEY) === 'on' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export function setBrowserNotifyPref(pref: BrowserNotifyPref): void {
  try {
    localStorage.setItem(BROWSER_NOTIFY_PREF_KEY, pref);
  } catch {
    // Storage tidak tersedia: pref hanya berlaku sesi ini (listener tetap jalan).
  }
  prefListeners.forEach((fn) => {
    try {
      fn(pref);
    } catch {
      // Listener UI yang rusak tidak boleh menjatuhkan bridge.
    }
  });
  if (pref === 'on') {
    void registerBrowserNotifyServiceWorker();
  }
}

/** Langganan perubahan preferensi (untuk sinkronisasi state UI). */
export function subscribeBrowserNotifyPref(fn: (pref: BrowserNotifyPref) => void): () => void {
  prefListeners.add(fn);
  return () => {
    prefListeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Kapabilitas & izin
// ---------------------------------------------------------------------------

/** True bila Notification API ada, halaman konteks aman, dan SW didukung/diizinkan. */
export function isBrowserNotifySupported(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (!('Notification' in window)) return false;
    if (window.isSecureContext === false) return false;
    return true;
  } catch {
    return false;
  }
}

function hasServiceWorkerSupport(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  } catch {
    return false;
  }
}

export function getBrowserNotifyPermission(): BrowserNotifyPermission {
  if (!isBrowserNotifySupported()) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/**
 * Minta izin notifikasi ke browser. HANYA boleh dipanggil dari gesture user
 * (klik tombol "Aktifkan"). Bila user memberi izin, preferensi otomatis 'on'
 * dan service worker didaftarkan. Mengembalikan status izin akhir.
 */
export async function requestBrowserNotifyPermission(): Promise<BrowserNotifyPermission> {
  if (!isBrowserNotifySupported()) return 'unsupported';
  let result: NotificationPermission;
  try {
    const maybePromise = Notification.requestPermission() as unknown;
    if (maybePromise && typeof (maybePromise as Promise<NotificationPermission>).then === 'function') {
      result = await (maybePromise as Promise<NotificationPermission>);
    } else {
      // Browser lama (callback-style): status akhir terbaca dari properti.
      result = Notification.permission;
    }
  } catch {
    return getBrowserNotifyPermission();
  }
  if (result === 'granted') {
    setBrowserNotifyPref('on');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/** Daftarkan public/sw.js (idempoten; kegagalan → null, bukan throw). */
export function registerBrowserNotifyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!hasServiceWorkerSupport()) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SERVICE_WORKER_URL)
      .catch(() => null);
  }
  return registrationPromise;
}

// ---------------------------------------------------------------------------
// Navigasi dari klik notifikasi (jalur yang sama dengan klik lonceng)
// ---------------------------------------------------------------------------

type BrowserNotifyNavigationHandler = (link: string) => void;
let navigationHandler: BrowserNotifyNavigationHandler | null = null;

/**
 * Daftarkan handler navigasi aplikasi (TopBar: pemecahan link 'menu:tab' →
 * onNavigate — persis logika klik item NotificationBell). Teruskan null untuk
 * melepas.
 */
export function setBrowserNotifyNavigationHandler(
  handler: BrowserNotifyNavigationHandler | null,
): void {
  navigationHandler = handler;
}

function navigateFromNotification(link: string | null | undefined): void {
  if (!link || !navigationHandler) return;
  try {
    navigationHandler(link);
  } catch {
    // Navigasi gagal tidak boleh menjatuhkan bridge.
  }
}

function onServiceWorkerMessage(event: MessageEvent): void {
  const data = event?.data as { type?: unknown; menu?: unknown } | null;
  if (!data || data.type !== 'ezrab-navigate') return;
  navigateFromNotification(typeof data.menu === 'string' ? data.menu : null);
}

// ---------------------------------------------------------------------------
// Inisialisasi bridge (sekali)
// ---------------------------------------------------------------------------

let bridgeStarted = false;

/**
 * Pasang listener pesan service worker dan — bila preferensi sudah 'on' dari
 * sesi sebelumnya — daftarkan service worker. Idempoten; dipanggil
 * NotificationProvider saat mount. TIDAK meminta izin di sini.
 */
export function ensureBrowserNotifyBridge(): void {
  if (bridgeStarted) return;
  bridgeStarted = true;
  if (hasServiceWorkerSupport()) {
    try {
      navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    } catch {
      // Listener gagal terpasang: jalur klik SW nonaktif, sisanya tetap jalan.
    }
  }
  if (getBrowserNotifyPref() === 'on') {
    void registerBrowserNotifyServiceWorker();
  }
}

// ---------------------------------------------------------------------------
// Penayangan
// ---------------------------------------------------------------------------

/**
 * Tampilkan notifikasi native untuk item BARU — hanya bila pref 'on', izin
 * 'granted', dan tab tidak fokus (document.hidden). Mengembalikan true bila
 * notifikasi benar-benar ditayangkan. Tidak pernah throw.
 */
export async function maybeShowBrowserNotification(item: BrowserNotifyItem): Promise<boolean> {
  try {
    if (!isBrowserNotifySupported()) return false;
    if (getBrowserNotifyPref() !== 'on') return false;
    if (getBrowserNotifyPermission() !== 'granted') return false;
    if (typeof document === 'undefined' || !document.hidden) return false;

    const options: NotificationOptions = {
      body: item.message,
      icon: BROWSER_NOTIFY_ICON,
      tag: item.id, // tag = id item: notifikasi sama tidak bertumpuk dobel
      data: { link: item.link ?? null },
    };

    const registration = await registerBrowserNotifyServiceWorker();
    if (registration) {
      await registration.showNotification(item.title, options);
      return true;
    }

    // Fallback desktop tanpa service worker.
    const notification = new Notification(item.title, options);
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Abaikan: fokus jendela bisa ditolak browser.
      }
      navigateFromNotification(item.link);
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Khusus tes: reset state modul (registrasi SW ter-cache & flag bridge).
// ---------------------------------------------------------------------------

/** @internal Dipakai suite tes browserNotify untuk isolasi antar-skenario. */
export function resetBrowserNotifyStateForTests(): void {
  registrationPromise = null;
  bridgeStarted = false;
  navigationHandler = null;
  prefListeners.clear();
}
