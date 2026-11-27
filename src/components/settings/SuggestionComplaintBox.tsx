/**
 * ============================================================================
 *  Kirim Masukan — dialog gaya Google di Pengaturan (tab 'help'
 *  UnifiedSettingsView), mengikuti mockup v2 di
 *  ~/workspace/ts-spaces/mockup-kirim-masukan/index.html.
 *
 *  SATU-SATUNYA titik masuk adalah panel di bawah ini, di dalam Pengaturan.
 *  Tidak ada tombol di sidebar, tidak ada tombol melayang, tidak ada
 *  shortcut atas — ketiganya dihapus dari mockup v2 atas perintah owner.
 *
 *  UI-FIRST, TANPA backend pengiriman (keadaan yang sama seperti preflight
 *  audit di suggestionComplaintLogic.ts: tidak ada endpoint maupun tabel
 *  laporan yang terverifikasi). Karena itu komponen ini secara jujur:
 *  - TIDAK mengirim, TIDAK menyimpan ke mana pun, dan TIDAK menampilkan
 *    tampilan sukses apa pun. Menekan Kirim hanya menampilkan pesan
 *    SUBMISSION_UNAVAILABLE_MESSAGE apa adanya; tulisan tetap di dialog.
 *  - TIDAK membuat kode referensi apa pun dan TIDAK menampilkan daftar
 *    kiriman lama. Blok "Masukan Saya" hanya menampilkan draf yang sedang
 *    ditulis di halaman ini, dengan label "Draf — Belum terkirim".
 *  - Draf hanya hidup di state komponen selama halaman terbuka (tanpa
 *    penyimpanan web apa pun); menutup halaman akan menghilangkan draf.
 *  - Screenshot BUKAN tangkapan otomatis halaman — aplikasi tidak punya
 *    kemampuan itu. Tombol "Ambil screenshot" membuka pemilih berkas agar
 *    pengguna melampirkan berkas gambar yang sudah diambilnya sendiri;
 *    pratinjau menampilkan berkas asli itu (nama + gambar), dan lampiran
 *    bisa dihapus sebelum mencoba mengirim.
 *  - Identitas pelapor berasal dari sesi yang sudah ada (AuthContext /
 *    RoleContext, gerbang kode akses diakui sebagai 'Pengunjung demo' —
 *    invarian D-83: komponen ini hanya di-mount di tab help
 *    UnifiedSettingsView, di dalam workspace yang sudah melewati gerbang).
 * ============================================================================
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Bug,
  Camera,
  HelpCircle,
  Info,
  Lightbulb,
  Lock,
  MessageCircle,
  MessageSquare,
  Send,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useRole } from '../../auth/RoleContext';
import { useI18n } from '../../i18n';
import {
  SUBMISSION_UNAVAILABLE_MESSAGE,
  resolveReporterIdentity,
} from './suggestionComplaintLogic';

/** Jenis masukan — persis empat chip pada mockup (default: Saran Fitur). */
type FeedbackCategory = 'Laporan Bug' | 'Saran Fitur' | 'Pertanyaan' | 'Lainnya';

const FEEDBACK_CATEGORIES: { value: FeedbackCategory; icon: LucideIcon }[] = [
  { value: 'Laporan Bug', icon: Bug },
  { value: 'Saran Fitur', icon: Lightbulb },
  { value: 'Pertanyaan', icon: HelpCircle },
  { value: 'Lainnya', icon: MessageSquare },
];

/** Batas panjang kolom masukan pada mockup. */
const FEEDBACK_MESSAGE_MAX_LENGTH = 1000;

/** Asal draf — komponen ini hanya hidup di Pengaturan (tab Pusat Bantuan). */
const DRAFT_PAGE_LABEL = 'Pengaturan';

interface AttachedScreenshot {
  fileName: string;
  objectUrl: string;
}

/** Lebar sempit (<640px): dialog menjadi lembar bawah seperti pada mockup. */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return narrow;
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  border: '1.5px solid var(--ez-color-border-strong)',
  background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-slate)',
  borderRadius: '999px',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 700,
  minHeight: '2.5rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const chipPressedStyle: React.CSSProperties = {
  borderColor: 'var(--ez-color-primary)',
  background: 'var(--ez-color-primary-soft)',
  color: 'var(--ez-color-primary-hover)',
};

export const SuggestionComplaintBox: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { activeRole } = useRole();
  const { t } = useI18n();
  const narrow = useNarrowViewport();
  // D-83 (Batch G2): gateSession: true — INVARIAN MOUNT: komponen ini
  // hanya di-mount di tab help UnifiedSettingsView, di dalam workspace
  // yang hanya bisa dimasuki lewat gerbang kode akses (produksi) atau
  // tanpa gerbang (dev). Sesi gerbang diakui sebagai identitas
  // 'Pengunjung demo' — sebelumnya pengguna yang sudah masuk lewat
  // gerbang ditolak formulir dan diarahkan ke /masuk yang login
  // emailnya dinonaktifkan (jalan buntu). Bila komponen ini suatu hari
  // di-mount di luar workspace, invarian ini HARUS ditinjau ulang.
  const identity = resolveReporterIdentity({
    accountEmail: user?.email ?? null,
    roleName: activeRole?.name ?? null,
    gateSession: true,
  });

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('Saran Fitur');
  const [message, setMessage] = useState('');
  const [newsConsent, setNewsConsent] = useState(false);
  const [screenshot, setScreenshot] = useState<AttachedScreenshot | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [showSensitiveTip, setShowSensitiveTip] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFocusRef = useRef<Element | null>(null);
  const screenshotRef = useRef<AttachedScreenshot | null>(null);
  screenshotRef.current = screenshot;

  // Bersihkan URL objek pratinjau screenshot saat komponen dilepas.
  useEffect(
    () => () => {
      if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current.objectUrl);
    },
    [],
  );

  // Dialog terbuka: kunci scroll halaman, fokus ke kolom teks, tutup
  // dengan Escape. Dialog tertutup: kembalikan fokus ke tombol pembuka.
  useEffect(() => {
    if (!open) {
      const target = lastFocusRef.current;
      lastFocusRef.current = null;
      if (target instanceof HTMLElement) target.focus();
      return;
    }
    lastFocusRef.current = document.activeElement;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 60);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSensitiveTip(false);
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open ]);

  const signedIn = identity.kind !== 'none';
  const messageEmpty = message.trim().length === 0;
  // Draf yang sedang ditulis (hanya di state halaman ini): judul turunan
  // adalah baris pertama tulisan pengguna, dipotong 60 karakter.
  const firstLine = message.trim().split('\n')[0] ?? '';
  const draftTitle = firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;

  const handleOpen = () => {
    setUnavailableMessage(null);
    setOpen(true);
  };

  const handleClose = () => {
    setShowSensitiveTip(false);
    setOpen(false);
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);
    // Pesan hasil percobaan sebelumnya tidak lagi berlaku setelah draf berubah.
    setUnavailableMessage(null);
  };

  const handleCategorySelect = (value: FeedbackCategory) => {
    setCategory(value);
    setUnavailableMessage(null);
  };

  const handleScreenshotPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (screenshot) URL.revokeObjectURL(screenshot.objectUrl);
    setScreenshot({ fileName: file.name, objectUrl: URL.createObjectURL(file) });
    setIncludeScreenshot(true);
  };

  const handleRemoveScreenshot = () => {
    if (screenshot) URL.revokeObjectURL(screenshot.objectUrl);
    setScreenshot(null);
    setIncludeScreenshot(true);
  };

  const handleClearDraft = () => {
    if (screenshot) URL.revokeObjectURL(screenshot.objectUrl);
    setScreenshot(null);
    setIncludeScreenshot(true);
    setCategory('Saran Fitur');
    setMessage('');
    setNewsConsent(false);
    setUnavailableMessage(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (checking) return; // cegah klik ganda selama transisi lokal berjalan
    if (messageEmpty) return;
    setChecking(true);
    // Transisi lokal singkat agar status tombol sempat ter-render; ini BUKAN
    // panggilan jaringan — keputusan jujur murni lokal (tidak ada backend).
    window.setTimeout(() => {
      setUnavailableMessage(SUBMISSION_UNAVAILABLE_MESSAGE);
      setChecking(false);
    }, 0);
  };

  return (
    <section
      aria-label={t('settings.ks_judul')}
      style={{
        border: '1.5px solid var(--ez-color-primary)',
        borderRadius: '14px',
        background: 'var(--ez-color-surface)',
        padding: '16px',
        boxShadow: '0 4px 16px rgba(13, 32, 58, 0.08)',
      }}
    >
      <div style={{ display: 'flex', gap: '13px', alignItems: 'flex-start' }}>
        <div
          aria-hidden="true"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            flex: 'none',
            background: 'var(--ez-color-primary-soft)',
            color: 'var(--ez-color-primary)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <MessageCircle size={19} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
            Kirim Masukan{' '}
            <span
              style={{
                marginLeft: '6px',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.05em',
                background: '#F97316',
                color: '#fff',
                borderRadius: '999px',
                padding: '2px 7px',
                verticalAlign: '2px',
                whiteSpace: 'nowrap',
              }}
            >
              USULAN
            </span>
          </h4>
          <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Laporkan bug, usulkan fitur, atau tanyakan apa pun ke tim EZRAB. Halaman terakhir yang Anda buka ikut
            tercatat otomatis di laporan.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleOpen}
        aria-expanded={open}
        aria-controls="ks-panel"
        style={{
          marginTop: '14px',
          width: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '10px',
          border: '1px solid transparent',
          background: 'var(--ez-color-primary)',
          color: '#fff',
          fontSize: '14px',
          fontWeight: 700,
          padding: '10px 18px',
          minHeight: '2.5rem',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <MessageCircle size={18} />
        Kirim Masukan
      </button>

      {!messageEmpty && (
        <div
          style={{
            marginTop: '16px',
            borderTop: '1px solid var(--ez-color-border)',
            paddingTop: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ez-color-text-muted)',
            }}
          >
            Masukan Saya
          </div>
          <div
            style={{
              border: '1px solid var(--ez-color-border)',
              borderRadius: '10px',
              padding: '10px 12px',
              background: 'var(--ez-color-surface-secondary)',
            }}
          >
            <button
              type="button"
              onClick={handleOpen}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--ez-color-text-primary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {draftTitle}
            </button>
            <div
              style={{
                fontSize: '11.5px',
                color: 'var(--ez-color-text-muted)',
                fontWeight: 500,
                marginTop: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'var(--ez-hue-amber-bg)',
                  color: 'var(--ez-hue-amber-text)',
                }}
              >
                Draf
              </span>
              <span>
                {category} · {DRAFT_PAGE_LABEL}
                {screenshot && includeScreenshot ? ' · Screenshot terlampir' : ''}
              </span>
              <span>Belum terkirim</span>
              <button
                type="button"
                onClick={handleClearDraft}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ez-color-danger-strong)',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '4px 0',
                  marginLeft: 'auto',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Trash2 size={13} />
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: narrow ? 'flex-end' : 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: narrow ? 0 : '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            id="ks-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ks-dialog-title"
            style={{
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-primary)',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '92dvh',
              overflowY: 'auto',
              borderRadius: narrow ? '18px 18px 0 0' : '18px',
              boxShadow: '0 18px 50px rgba(13, 32, 58, 0.16)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '18px 20px 6px',
              }}
            >
              <h2 id="ks-dialog-title" style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Kirim masukan ke EZRAB
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label={t('common.tutup')}
                style={{
                  width: '38px',
                  height: '38px',
                  minHeight: '38px',
                  borderRadius: '10px',
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  border: '1px solid transparent',
                  background: 'transparent',
                  color: 'var(--ez-color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '8px 20px 4px' }}>
              {authLoading ? (
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.ks_memeriksa_sesi')}
                </p>
              ) : !signedIn ? (
                // Cabang defensif: dengan gateSession: true di atas, cabang
                // ini tidak terjangkau dalam praktik (komponen hanya hidup
                // di dalam workspace). Dipertahankan sebagai pengaman bila
                // invarian mount berubah — TANPA tombol ke /masuk (D-83):
                // login email di sana dinonaktifkan (mode demoOnly), jadi
                // tombol itu adalah jalan buntu.
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'var(--ez-color-surface)',
                    border: '1px solid var(--ez-color-border-soft)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <Lock size={15} style={{ color: 'var(--ez-color-text-muted)', flexShrink: 0, marginTop: '1px' }} />
                    <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-slate)', margin: 0, lineHeight: 1.55 }}>
                      {t('settings.ks_butuh_masuk')}
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate aria-label={t('settings.ks_form_aria')}>
                  <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '0 0 2px', lineHeight: 1.5 }}>
                    {t('settings.ks_melapor_a')}
                    <strong style={{ color: 'var(--ez-color-text-primary)' }}>{identity.label}</strong>
                    {identity.kind === 'demo-role' ? t('settings.ks_sesi_demo') : ''}
                    {identity.kind === 'access-gate' ? t('settings.ks_sesi_gerbang') : ''}
                    {t('settings.ks_melapor_b')}
                  </p>

                  <span
                    id="ks-cat-label"
                    style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, margin: '14px 0 8px' }}
                  >
                    Jenis masukan
                  </span>
                  <div role="group" aria-labelledby="ks-cat-label" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {FEEDBACK_CATEGORIES.map(({ value, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={category === value}
                        onClick={() => handleCategorySelect(value)}
                        style={category === value ? { ...chipStyle, ...chipPressedStyle } : chipStyle}
                      >
                        <Icon size={16} />
                        {value}
                      </button>
                    ))}
                  </div>

                  <label
                    htmlFor="ks-message"
                    style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, margin: '14px 0 8px' }}
                  >
                    Jelaskan masukan Anda{' '}
                    <span style={{ color: 'var(--ez-color-danger)', fontWeight: 700 }}>(wajib diisi)</span>
                  </label>
                  <textarea
                    ref={textareaRef}
                    id="ks-message"
                    value={message}
                    maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    placeholder="Beri tahu kami apa yang terjadi, atau apa yang bisa kami perbaiki…"
                    aria-required="true"
                    aria-describedby="ks-message-count"
                    style={{
                      width: '100%',
                      minHeight: '118px',
                      resize: 'vertical',
                      border: '1.5px solid var(--ez-color-border-strong)',
                      borderRadius: '12px',
                      background: 'var(--ez-color-surface)',
                      color: 'var(--ez-color-text-primary)',
                      fontFamily: 'inherit',
                      fontSize: '14.5px',
                      lineHeight: 1.55,
                      padding: '12px 14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12.5px',
                        color: 'var(--ez-color-text-muted)',
                        fontWeight: 500,
                      }}
                    >
                      Harap jangan sertakan informasi sensitif apa pun
                      <span style={{ position: 'relative', display: 'inline-grid', placeItems: 'center' }}>
                        <button
                          type="button"
                          aria-label="Contoh informasi sensitif"
                          aria-expanded={showSensitiveTip}
                          onMouseEnter={() => setShowSensitiveTip(true)}
                          onMouseLeave={() => setShowSensitiveTip(false)}
                          onFocus={() => setShowSensitiveTip(true)}
                          onBlur={() => setShowSensitiveTip(false)}
                          style={{
                            width: '26px',
                            height: '26px',
                            minHeight: '26px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--ez-color-text-muted)',
                            display: 'grid',
                            placeItems: 'center',
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          <Info size={16} />
                        </button>
                        {showSensitiveTip && (
                          <span
                            role="tooltip"
                            style={{
                              display: 'block',
                              position: 'absolute',
                              bottom: 'calc(100% + 8px)',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '230px',
                              background: 'var(--ez-color-text-primary)',
                              color: 'var(--ez-color-surface)',
                              fontSize: '12px',
                              lineHeight: 1.5,
                              fontWeight: 500,
                              borderRadius: '9px',
                              padding: '9px 11px',
                              zIndex: 5,
                              textAlign: 'left',
                            }}
                          >
                            Contohnya: kata sandi, PIN, nomor rekening, atau data pribadi klien. Cukup jelaskan
                            masalahnya saja.
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      id="ks-message-count"
                      style={{
                        fontSize: '12px',
                        color: 'var(--ez-color-text-muted)',
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {message.length}/{FEEDBACK_MESSAGE_MAX_LENGTH} {t('settings.ks_karakter')}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: '13.5px',
                      lineHeight: 1.55,
                      color: 'var(--ez-color-text-slate)',
                      fontWeight: 600,
                      margin: '18px 0 9px',
                    }}
                  >
                    Screenshot akan membantu kami memahami masukan Anda dengan lebih baik.
                  </p>
                  {!screenshot && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '9px',
                        border: '1.5px solid var(--ez-color-border-strong)',
                        background: 'var(--ez-color-surface)',
                        color: 'var(--ez-color-primary)',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        padding: '12px',
                        minHeight: '3rem',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Camera size={19} />
                      Ambil screenshot
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    aria-label="Pilih berkas screenshot"
                    onChange={handleScreenshotPicked}
                    style={{ display: 'none' }}
                    tabIndex={-1}
                  />
                  {screenshot && (
                    <div
                      style={{
                        marginTop: '12px',
                        border: '1px solid var(--ez-color-border)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border)' }}>
                        <img
                          src={screenshot.objectUrl}
                          alt="Screenshot yang dilampirkan"
                          style={{
                            width: '100%',
                            display: 'block',
                            maxHeight: '200px',
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '9px 12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            gap: '11px',
                            alignItems: 'flex-start',
                            padding: '4px 2px',
                            cursor: 'pointer',
                            fontSize: '13.5px',
                            lineHeight: 1.55,
                            fontWeight: 500,
                            color: 'var(--ez-color-text-slate)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={includeScreenshot}
                            onChange={(e) => setIncludeScreenshot(e.target.checked)}
                            style={{ width: '20px', height: '20px', margin: '1px 0 0', accentColor: 'var(--ez-color-primary)', flex: 'none', cursor: 'pointer' }}
                          />
                          <span>Sertakan screenshot ini</span>
                        </label>
                        <span style={{ flex: 1 }} />
                        <span
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 600,
                            color: 'var(--ez-color-text-slate)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '180px',
                          }}
                        >
                          {screenshot.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={handleRemoveScreenshot}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--ez-color-danger-strong)',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            padding: '8px',
                            minHeight: '2.25rem',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <Trash2 size={15} />
                          Hapus
                        </button>
                      </div>
                    </div>
                  )}

                  <label
                    style={{
                      display: 'flex',
                      gap: '11px',
                      alignItems: 'flex-start',
                      padding: '12px 2px',
                      marginTop: '8px',
                      cursor: 'pointer',
                      fontSize: '13.5px',
                      lineHeight: 1.55,
                      fontWeight: 500,
                      color: 'var(--ez-color-text-slate)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newsConsent}
                      onChange={(e) => setNewsConsent(e.target.checked)}
                      style={{ width: '20px', height: '20px', margin: '1px 0 0', accentColor: 'var(--ez-color-primary)', flex: 'none', cursor: 'pointer' }}
                    />
                    <span>Bersedia menerima info terbaru dan permintaan informasi</span>
                  </label>

                  <p style={{ fontSize: '12px', lineHeight: 1.65, color: 'var(--ez-color-text-muted)', fontWeight: 500, margin: '10px 0 2px' }}>
                    Beberapa{' '}
                    <span style={{ color: 'var(--ez-color-primary)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                      informasi akun dan sistem
                    </span>{' '}
                    mungkin dikirimkan ke EZRAB — halaman yang sedang dibuka, peran Anda, dan versi aplikasi. Kami
                    menggunakan informasi tersebut untuk memperbaiki masalah dan meningkatkan kualitas layanan, sesuai
                    dengan{' '}
                    <span style={{ color: 'var(--ez-color-primary)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                      Kebijakan Privasi
                    </span>{' '}
                    dan{' '}
                    <span style={{ color: 'var(--ez-color-primary)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                      Persyaratan Layanan
                    </span>{' '}
                    kami.
                  </p>

                  {unavailableMessage && (
                    <div
                      role="status"
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                        padding: '12px',
                        borderRadius: '12px',
                        background: 'var(--ez-color-info-soft)',
                        border: '1px solid var(--ez-color-border-soft)',
                        marginTop: '12px',
                      }}
                    >
                      <Info size={15} style={{ color: 'var(--ez-color-info)', flexShrink: 0, marginTop: '1px' }} />
                      <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-slate)', margin: 0, lineHeight: 1.55 }}>
                        {unavailableMessage}{' '}
                        <span style={{ color: 'var(--ez-color-text-muted)' }}>
                          {t('settings.ks_tulisan_tetap')}
                        </span>
                      </p>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '10px',
                      padding: '14px 0 16px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleClose}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        borderRadius: '10px',
                        border: '1px solid var(--ez-color-border-strong)',
                        background: 'var(--ez-color-surface)',
                        color: 'var(--ez-color-text-primary)',
                        fontSize: '14px',
                        fontWeight: 700,
                        padding: '10px 18px',
                        minHeight: '2.5rem',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {t('common.batal')}
                    </button>
                    <button
                      type="submit"
                      disabled={checking || messageEmpty}
                      style={{
                        minWidth: '110px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        borderRadius: '10px',
                        border: '1px solid transparent',
                        background: checking || messageEmpty ? 'var(--ez-color-border)' : 'var(--ez-color-primary)',
                        color: checking || messageEmpty ? 'var(--ez-color-text-muted)' : '#fff',
                        fontSize: '14px',
                        fontWeight: 700,
                        padding: '10px 18px',
                        minHeight: '2.5rem',
                        cursor: checking || messageEmpty ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Send size={14} />
                      {checking ? 'Mengirim…' : 'Kirim'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SuggestionComplaintBox;
