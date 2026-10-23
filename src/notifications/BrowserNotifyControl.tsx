/**
 * BrowserNotifyControl — baris pengaturan "Notifikasi browser" yang sadar status.
 *
 * Dipakai bersama oleh panel NotificationBell dan tab Notifikasi di
 * UnifiedSettingsView; keduanya mengendalikan preferensi yang sama
 * (localStorage `ezrab_browser_notify` via browserNotify.ts).
 *
 * Status yang ditangani:
 * - Browser tidak mendukung → teks redup, tanpa kontrol.
 * - Izin 'default' → tombol "Aktifkan" (klik = satu-satunya jalur yang boleh
 *   memanggil Notification.requestPermission, dari gesture user).
 * - Izin 'granted' → toggle Nyala/Mati yang mengendalikan preferensi.
 * - Izin 'denied' → petunjuk mengizinkan lewat pengaturan situs (tanpa tombol
 *   mati, karena browser tidak akan menampilkan dialog lagi).
 *
 * Tombol "Kirim tes" (opsional) menerbitkan notifikasi uji lewat
 * notificationBus agar user bisa mencoba alurnya; disertai petunjuk jujur
 * bahwa notifikasi browser hanya muncul saat tab tidak aktif/fokus.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import { notificationBus } from './notificationBus';
import {
  getBrowserNotifyPermission,
  getBrowserNotifyPref,
  isBrowserNotifySupported,
  requestBrowserNotifyPermission,
  setBrowserNotifyPref,
  subscribeBrowserNotifyPref,
  type BrowserNotifyPermission,
  type BrowserNotifyPref,
} from './browserNotify';

interface BrowserNotifyControlProps {
  /** Tampilkan tombol "Kirim tes" + petunjuk tab-tidak-fokus. */
  showTestButton?: boolean;
}

export const BrowserNotifyControl: React.FC<BrowserNotifyControlProps> = ({
  showTestButton = false,
}) => {
  const [supported] = useState<boolean>(() => isBrowserNotifySupported());
  const [permission, setPermission] = useState<BrowserNotifyPermission>(() =>
    getBrowserNotifyPermission(),
  );
  const [pref, setPref] = useState<BrowserNotifyPref>(() => getBrowserNotifyPref());
  const [requesting, setRequesting] = useState(false);

  // Sinkronkan preferensi antar permukaan (lonceng <-> pengaturan) dan
  // segarkan status izin saat tampil / jendela kembali fokus (izin bisa
  // berubah dari pengaturan browser di luar aplikasi).
  useEffect(() => subscribeBrowserNotifyPref(setPref), []);
  useEffect(() => {
    const refresh = () => setPermission(getBrowserNotifyPermission());
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const handleActivate = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await requestBrowserNotifyPermission();
      setPermission(result === 'unsupported' ? getBrowserNotifyPermission() : result);
      setPref(getBrowserNotifyPref());
    } finally {
      setRequesting(false);
    }
  }, []);

  const handleToggle = useCallback((next: boolean) => {
    setBrowserNotifyPref(next ? 'on' : 'off');
  }, []);

  const handleSendTest = useCallback(() => {
    notificationBus.publish({
      type: 'info',
      title: 'Notifikasi tes',
      message: 'Ini notifikasi uji dari EZRAB. Versi browser-nya muncul saat tab tidak aktif.',
    });
  }, []);

  const labelStyle: React.CSSProperties = {
    fontSize: '12.5px',
    fontWeight: 650,
    color: 'var(--ez-color-text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };
  const mutedStyle: React.CSSProperties = {
    fontSize: '11.5px',
    color: 'var(--ez-color-text-muted)',
    lineHeight: 1.45,
  };

  let control: React.ReactNode;
  if (!supported) {
    control = <span style={mutedStyle}>Browser ini tidak mendukung notifikasi</span>;
  } else if (permission === 'denied') {
    control = (
      <span style={mutedStyle}>
        Diblokir browser — izinkan lewat pengaturan situs (ikon gembok di address bar →
        Notifikasi → Izinkan)
      </span>
    );
  } else if (permission === 'granted') {
    control = (
      <label
        style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', flexShrink: 0 }}
      >
        <input
          type="checkbox"
          checked={pref === 'on'}
          onChange={(e) => handleToggle(e.target.checked)}
          aria-label="Nyala/matikan notifikasi browser"
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
        />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>
          {pref === 'on' ? 'Nyala' : 'Mati'}
        </span>
      </label>
    );
  } else {
    // permission 'default' (atau 'unsupported' yang tak terduga): tawarkan aktivasi.
    control = (
      <button
        onClick={handleActivate}
        disabled={requesting}
        style={{
          background: 'var(--ez-color-primary)',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 650,
          padding: '5px 12px',
          cursor: requesting ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        {requesting ? 'Meminta…' : 'Aktifkan'}
      </button>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <span style={labelStyle}>
          <BellRing size={14} color="var(--ez-color-primary)" />
          Notifikasi browser
        </span>
        {control}
      </div>
      {supported && permission === 'granted' && (
        <div style={{ ...mutedStyle, marginTop: '5px' }}>
          Notifikasi muncul di luar aplikasi saat tab EZRAB tidak sedang aktif.
        </div>
      )}
      {showTestButton && supported && permission === 'granted' && (
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleSendTest}
            style={{
              background: 'transparent',
              border: '1px solid var(--ez-color-border-strong)',
              borderRadius: '8px',
              fontSize: '11.5px',
              fontWeight: 600,
              color: 'var(--ez-color-primary)',
              padding: '4px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Send size={12} />
            Kirim tes
          </button>
          <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', lineHeight: 1.4 }}>
            Notifikasi browser hanya muncul bila tab tidak fokus — coba pindah tab setelah mengirim.
          </span>
        </div>
      )}
    </div>
  );
};

export default BrowserNotifyControl;
