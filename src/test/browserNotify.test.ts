/**
 * Tests: browserNotify — jembatan notifikasi in-app ke notifikasi browser.
 *
 * Memverifikasi gerbang penayangan (jangan tampilkan native notification
 * sembarangan):
 * 1. Preferensi default 'off' → tidak pernah tampil.
 * 2. requestPermission HANYA terpanggil dari requestBrowserNotifyPermission
 *    (jalur opt-in klik user) — tidak dari maybeShow/getter mana pun.
 * 3. Izin granted + pref 'on' + tab hidden → tampil via konstruktor
 *    (fallback tanpa service worker), tag = id item, data.link benar,
 *    onclick menavigasi via handler terdaftar.
 * 4. Izin granted + pref 'on' + tab TERLIHAT → tidak tampil.
 * 5. Izin denied → tidak tampil.
 * 6. Service worker tersedia → registration.showNotification dipakai,
 *    konstruktor tidak dipakai.
 * 7. Browser tanpa Notification API → semua fungsi aman (unsupported).
 * 8. ensureBrowserNotifyBridge dengan pref 'on' mendaftarkan service worker.
 *
 * Run: npx tsx src/test/browserNotify.test.ts
 */
import {
  ensureBrowserNotifyBridge,
  getBrowserNotifyPermission,
  getBrowserNotifyPref,
  isBrowserNotifySupported,
  maybeShowBrowserNotification,
  requestBrowserNotifyPermission,
  resetBrowserNotifyStateForTests,
  setBrowserNotifyNavigationHandler,
  setBrowserNotifyPref,
} from '../notifications/browserNotify';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(`ASSERT FAILED: ${message}`);
}

// ---------------------------------------------------------------------------
// Mocks (dipasang ke globalThis — modul membaca global DOM secara lazy)
// ---------------------------------------------------------------------------

class MockNotification {
  static permission: 'default' | 'granted' | 'denied' = 'default';
  static requestPermissionCalls = 0;
  static instances: MockNotification[] = [];

  static async requestPermission(): Promise<'default' | 'granted' | 'denied'> {
    MockNotification.requestPermissionCalls += 1;
    return MockNotification.permission;
  }

  title: string;
  options: Record<string, unknown> | undefined;
  onclick: (() => void) | null = null;
  closed = false;

  constructor(title: string, options?: Record<string, unknown>) {
    this.title = title;
    this.options = options;
    MockNotification.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

interface MockRegistration {
  calls: { title: string; options: Record<string, unknown> }[];
  showNotification: (title: string, options: Record<string, unknown>) => Promise<void>;
}

function makeRegistration(): MockRegistration {
  const reg: MockRegistration = {
    calls: [],
    showNotification(title, options) {
      reg.calls.push({ title, options });
      return Promise.resolve();
    },
  };
  return reg;
}

interface ScenarioOptions {
  withNotificationApi?: boolean;
  withServiceWorker?: boolean;
  hidden?: boolean;
  permission?: 'default' | 'granted' | 'denied';
}

function installGlobals(opts: ScenarioOptions = {}): { registration: MockRegistration; registerCalls: () => number } {
  const withApi = opts.withNotificationApi !== false;
  const registration = makeRegistration();
  let registerCalls = 0;

  MockNotification.permission = opts.permission ?? 'default';
  MockNotification.requestPermissionCalls = 0;
  MockNotification.instances = [];

  const win: Record<string, unknown> = { isSecureContext: true, focus: () => {} };
  if (withApi) win.Notification = MockNotification;

  const nav: Record<string, unknown> = {};
  if (opts.withServiceWorker) {
    nav.serviceWorker = {
      register: async () => {
        registerCalls += 1;
        return registration;
      },
      addEventListener: () => {},
    };
  }

  const doc: Record<string, unknown> = {};
  Object.defineProperty(doc, 'hidden', {
    value: opts.hidden === true,
    configurable: true,
  });

  const g = globalThis as Record<string, unknown>;
  // Node ≥21 mendefinisikan sebagian global (navigator) sebagai getter saja —
  // pasang semua mock lewat defineProperty agar bisa diganti antar-skenario.
  const setGlobal = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  setGlobal('window', win);
  setGlobal('document', doc);
  setGlobal('navigator', nav);
  setGlobal('localStorage', makeLocalStorage());
  if (withApi) setGlobal('Notification', MockNotification);
  else delete g.Notification;

  resetBrowserNotifyStateForTests();
  return { registration, registerCalls: () => registerCalls };
}

const ITEM = {
  id: 'notif-test-1',
  title: 'Full AI selesai',
  message: '12 pekerjaan dari 2 dokumen.',
  link: 'ded-ai',
};

async function main(): Promise<void> {
  // 1. Default pref 'off' → tidak tampil walau granted + hidden.
  installGlobals({ permission: 'granted', hidden: true });
  assert(getBrowserNotifyPref() === 'off', 'preferensi default harus off (opt-in)');
  assert(isBrowserNotifySupported() === true, 'API tersedia → supported');
  assert((await maybeShowBrowserNotification(ITEM)) === false, 'pref off → tidak tampil');
  assert(MockNotification.instances.length === 0, 'pref off → konstruktor tidak terpanggil');
  assert(MockNotification.requestPermissionCalls === 0, 'maybeShow tidak boleh meminta izin');

  // 2. Opt-in: requestPermission hanya dari fungsi opt-in; granted → pref 'on'.
  installGlobals({ permission: 'granted', hidden: true });
  assert(MockNotification.requestPermissionCalls === 0, 'belum ada permintaan izin sebelum opt-in');
  const grantedResult = await requestBrowserNotifyPermission();
  assert(MockNotification.requestPermissionCalls === 1, 'requestBrowserNotifyPermission meminta izin sekali');
  assert(grantedResult === 'granted', 'hasil izin granted diteruskan');
  assert(getBrowserNotifyPref() === 'on', 'granted → preferensi otomatis on');

  // 2b. Ditolak → pref tetap 'off'.
  installGlobals({ permission: 'denied', hidden: true });
  const deniedResult = await requestBrowserNotifyPermission();
  assert(deniedResult === 'denied', 'hasil izin denied diteruskan');
  assert(getBrowserNotifyPref() === 'off', 'denied → preferensi tetap off');

  // 3. granted + on + hidden, TANPA service worker → konstruktor fallback.
  installGlobals({ permission: 'granted', hidden: true });
  setBrowserNotifyPref('on');
  const navigated: string[] = [];
  setBrowserNotifyNavigationHandler((link) => navigated.push(link));
  assert((await maybeShowBrowserNotification(ITEM)) === true, 'granted+on+hidden → tampil');
  assert(MockNotification.instances.length === 1, 'konstruktor terpanggil tepat sekali');
  const inst = MockNotification.instances[0];
  assert(inst.title === ITEM.title, 'judul dari item');
  assert(inst.options?.body === ITEM.message, 'isi dari item.message');
  assert(inst.options?.tag === ITEM.id, 'tag = id item (anti-dobel)');
  assert((inst.options?.data as { link?: string })?.link === 'ded-ai', 'data.link dari item.link');
  assert(typeof inst.options?.icon === 'string', 'icon terisi');
  assert(MockNotification.requestPermissionCalls === 0, 'penayangan tidak meminta izin');
  inst.onclick?.();
  assert(navigated.length === 1 && navigated[0] === 'ded-ai', 'klik fallback menavigasi ke link item');
  assert(inst.closed === true, 'notifikasi ditutup setelah klik');

  // 4. granted + on + tab TERLIHAT → tidak tampil (user sedang menatap app).
  installGlobals({ permission: 'granted', hidden: false });
  setBrowserNotifyPref('on');
  assert((await maybeShowBrowserNotification(ITEM)) === false, 'tab terlihat → tidak tampil');
  assert(MockNotification.instances.length === 0, 'tab terlihat → konstruktor diam');

  // 5. denied + on + hidden → tidak tampil.
  installGlobals({ permission: 'denied', hidden: true });
  setBrowserNotifyPref('on');
  assert(getBrowserNotifyPermission() === 'denied', 'status denied terbaca');
  assert((await maybeShowBrowserNotification(ITEM)) === false, 'denied → tidak tampil');
  assert(MockNotification.instances.length === 0, 'denied → konstruktor diam');

  // 6. Service worker tersedia → showNotification dipakai, konstruktor tidak.
  const sw = installGlobals({ permission: 'granted', hidden: true, withServiceWorker: true });
  setBrowserNotifyPref('on');
  assert((await maybeShowBrowserNotification(ITEM)) === true, 'jalur SW → tampil');
  assert(sw.registration.calls.length === 1, 'registration.showNotification terpanggil sekali');
  assert(sw.registration.calls[0].title === ITEM.title, 'judul SW dari item');
  assert(sw.registration.calls[0].options.tag === ITEM.id, 'tag SW = id item');
  assert(MockNotification.instances.length === 0, 'jalur SW → konstruktor tidak dipakai');

  // 7. Tanpa Notification API → semua aman, unsupported.
  installGlobals({ withNotificationApi: false, hidden: true });
  assert(isBrowserNotifySupported() === false, 'tanpa API → tidak didukung');
  assert(getBrowserNotifyPermission() === 'unsupported', 'tanpa API → unsupported');
  assert((await requestBrowserNotifyPermission()) === 'unsupported', 'opt-in tanpa API → unsupported');
  setBrowserNotifyPref('on');
  assert((await maybeShowBrowserNotification(ITEM)) === false, 'tanpa API → tidak tampil, tidak crash');

  // 8. Bridge: pref 'on' saat init → service worker didaftarkan.
  const bridge = installGlobals({ permission: 'granted', hidden: true, withServiceWorker: true });
  setBrowserNotifyPref('off');
  ensureBrowserNotifyBridge();
  assert(bridge.registerCalls() === 0, 'pref off saat init → SW tidak didaftarkan');
  resetBrowserNotifyStateForTests();
  setBrowserNotifyPref('on');
  ensureBrowserNotifyBridge();
  assert(bridge.registerCalls() >= 1, 'pref on saat init → SW didaftarkan');

  console.log('browserNotify.test: SEMUA LULUS (8 kelompok skenario)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
