/**
 * ============================================================================
 *  Kotak Saran & Pengaduan — komponen UI di Pusat Bantuan (tab 'help'
 *  UnifiedSettingsView). Implementasi UI-FIRST: belum ada backend laporan
 *  (lihat preflight audit di suggestionComplaintLogic.ts), jadi komponen ini
 *  secara jujur TIDAK mengirim, TIDAK menyimpan, dan TIDAK mengklaim sukses.
 *  Draf hanya hidup di state komponen ini selama halaman terbuka.
 * ============================================================================
 */
import React, { useState } from 'react';
import { AlertCircle, Inbox, Info, Lock, MapPin, Paperclip, Send } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useRole } from '../../auth/RoleContext';
import { navigateTo } from '../../routing/routes';
import {
  DESCRIPTION_MAX_LENGTH,
  EMPTY_REPORT_DRAFT,
  PAGE_CONTEXT_LABEL,
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  TITLE_MAX_LENGTH,
  attemptSubmit,
  resolveReporterIdentity,
  type ReportDraft,
  type ReportFieldErrors,
  type ReportPriority,
} from './suggestionComplaintLogic';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--ez-color-text-body)',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '38px',
  borderRadius: '10px',
  border: '1px solid var(--ez-color-border-strong)',
  background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-primary)',
  fontSize: '13px',
  padding: '0 12px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '5px',
  fontSize: '11.5px',
  color: 'var(--ez-color-danger)',
  margin: '6px 0 0',
  lineHeight: 1.45,
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} style={errorStyle} role="alert">
      <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>{message}</span>
    </p>
  );
}

export const SuggestionComplaintBox: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { activeRole } = useRole();
  const identity = resolveReporterIdentity({
    accountEmail: user?.email ?? null,
    roleName: activeRole?.name ?? null,
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_REPORT_DRAFT);
  const [errors, setErrors] = useState<ReportFieldErrors>({});
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const updateDraft = (patch: Partial<ReportDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    // Pesan hasil percobaan sebelumnya tidak lagi berlaku setelah draf berubah.
    setUnavailableMessage(null);
    setErrors((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof ReportDraft)[]).forEach((key) => {
        if (key === 'title' || key === 'category' || key === 'description' || key === 'priority') {
          delete next[key];
        }
      });
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (checking) return; // cegah klik ganda selama transisi lokal berjalan
    setChecking(true);
    // Transisi lokal singkat agar status tombol sempat ter-render; ini BUKAN
    // panggilan jaringan — validasi & keputusan jujur murni lokal.
    window.setTimeout(() => {
      const outcome = attemptSubmit(draft);
      if (outcome.status === 'validation-error') {
        setErrors(outcome.errors);
        setUnavailableMessage(null);
        const firstInvalid = ['title', 'category', 'description', 'priority'].find(
          (field) => outcome.errors[field as keyof ReportFieldErrors],
        );
        if (firstInvalid) {
          document.getElementById(`ks-${firstInvalid}`)?.focus();
        }
      } else {
        setErrors({});
        setUnavailableMessage(outcome.message);
      }
      setChecking(false);
    }, 0);
  };

  const signedIn = identity.kind !== 'none';

  return (
    <section
      aria-label="Kotak Saran dan Pengaduan"
      style={{
        padding: '16px',
        borderRadius: '16px',
        background: 'var(--ez-color-surface-secondary)',
        border: '1px solid #EEF1F6',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div
          aria-hidden="true"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--ez-color-primary-soft), var(--ez-color-surface))',
            border: '1px solid var(--ez-color-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ez-color-primary)',
            flexShrink: 0,
          }}
        >
          <Inbox size={19} />
        </div>
        <div style={{ flex: '1 1 260px', minWidth: '220px' }}>
          <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
            Kotak Saran &amp; Pengaduan
          </h4>
          <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-slate)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Sampaikan saran, laporkan kendala, atau beri tahu kami jika Anda menemukan masalah pada EZRAB.
            Masukan Anda membantu kami meningkatkan kualitas layanan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="ks-panel"
          style={{
            height: '36px',
            padding: '0 16px',
            borderRadius: '999px',
            border: 'none',
            background: 'var(--ez-color-primary)',
            color: 'var(--ez-color-on-primary)',
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          {open ? 'Tutup Formulir' : 'Buat Laporan'}
        </button>
      </div>

      {open && (
        <div id="ks-panel" style={{ marginTop: '16px' }}>
          {authLoading ? (
            <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
              Memeriksa sesi masuk Anda…
            </p>
          ) : !signedIn ? (
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
                  Fitur ini tersedia untuk pengguna yang sudah masuk, agar setiap laporan terhubung ke
                  akun yang jelas. Laporan anonim tidak didukung. Masuk dulu untuk membuat laporan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('/masuk')}
                style={{
                  marginTop: '12px',
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '999px',
                  border: '1px solid var(--ez-color-border-strong)',
                  background: 'var(--ez-color-surface)',
                  color: 'var(--ez-color-primary)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Masuk untuk Membuat Laporan
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Melapor sebagai{' '}
                <strong style={{ color: 'var(--ez-color-text-primary)' }}>{identity.label}</strong>
                {identity.kind === 'demo-role' ? ' (sesi peran demo)' : ''} — identitas diambil dari sesi
                masuk Anda, jadi Anda tidak perlu mengetik ulang email.
              </p>

              <form onSubmit={handleSubmit} noValidate aria-label="Formulir saran dan pengaduan">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label htmlFor="ks-title" style={labelStyle}>
                      Judul laporan <span aria-hidden="true" style={{ color: 'var(--ez-color-danger)' }}>*</span>
                    </label>
                    <input
                      id="ks-title"
                      type="text"
                      value={draft.title}
                      maxLength={TITLE_MAX_LENGTH}
                      onChange={(e) => updateDraft({ title: e.target.value })}
                      placeholder="Ringkasan singkat masalah atau saran Anda"
                      aria-required="true"
                      aria-invalid={errors.title ? true : undefined}
                      aria-describedby={errors.title ? 'ks-title-error' : undefined}
                      style={inputStyle}
                    />
                    <FieldError id="ks-title-error" message={errors.title} />
                  </div>

                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
                      <label htmlFor="ks-category" style={labelStyle}>
                        Kategori <span aria-hidden="true" style={{ color: 'var(--ez-color-danger)' }}>*</span>
                      </label>
                      <select
                        id="ks-category"
                        value={draft.category}
                        onChange={(e) => updateDraft({ category: e.target.value })}
                        aria-required="true"
                        aria-invalid={errors.category ? true : undefined}
                        aria-describedby={errors.category ? 'ks-category-error' : undefined}
                        style={{ ...inputStyle, padding: '0 10px' }}
                      >
                        <option value="">Pilih kategori laporan</option>
                        {REPORT_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <FieldError id="ks-category-error" message={errors.category} />
                    </div>

                    <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
                      <label htmlFor="ks-priority" style={labelStyle}>
                        Prioritas yang dirasakan (opsional)
                      </label>
                      <select
                        id="ks-priority"
                        value={draft.priority}
                        onChange={(e) => updateDraft({ priority: e.target.value as ReportPriority })}
                        aria-invalid={errors.priority ? true : undefined}
                        aria-describedby={errors.priority ? 'ks-priority-error' : undefined}
                        style={{ ...inputStyle, padding: '0 10px' }}
                      >
                        {REPORT_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                      <FieldError id="ks-priority-error" message={errors.priority} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ks-description" style={labelStyle}>
                      Deskripsi <span aria-hidden="true" style={{ color: 'var(--ez-color-danger)' }}>*</span>
                    </label>
                    <textarea
                      id="ks-description"
                      value={draft.description}
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      onChange={(e) => updateDraft({ description: e.target.value })}
                      placeholder="Jelaskan saran atau kendala Anda — langkah yang dilakukan, hasil yang diharapkan, dan yang sebenarnya terjadi."
                      rows={5}
                      aria-required="true"
                      aria-invalid={errors.description ? true : undefined}
                      aria-describedby={errors.description ? 'ks-description-error' : 'ks-description-count'}
                      style={{ ...inputStyle, minHeight: '110px', padding: '10px 12px', resize: 'vertical', lineHeight: 1.55 }}
                    />
                    {errors.description ? (
                      <FieldError id="ks-description-error" message={errors.description} />
                    ) : (
                      <p id="ks-description-count" style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', margin: '6px 0 0', textAlign: 'right' }}>
                        {draft.description.length}/{DESCRIPTION_MAX_LENGTH} karakter
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="ks-attachment" style={labelStyle}>
                      Lampiran screenshot (opsional)
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                        padding: '11px 12px',
                        borderRadius: '10px',
                        border: '1px dashed var(--ez-color-border-strong)',
                        background: 'var(--ez-color-surface)',
                      }}
                    >
                      <Paperclip size={14} style={{ color: 'var(--ez-color-text-muted)', flexShrink: 0, marginTop: '1px' }} />
                      <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: 0, lineHeight: 1.5 }}>
                        Lampiran belum tersedia — pengiriman laporan belum terhubung ke server, jadi file
                        belum dapat dilampirkan saat ini.
                      </p>
                    </div>
                    <input id="ks-attachment" type="file" accept="image/*" disabled style={{ display: 'none' }} tabIndex={-1} />
                  </div>

                  <div>
                    <label
                      htmlFor="ks-context"
                      style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', fontSize: '12.5px', color: 'var(--ez-color-text-body)', lineHeight: 1.5 }}
                    >
                      <input
                        id="ks-context"
                        type="checkbox"
                        checked={draft.includePageContext}
                        onChange={(e) => updateDraft({ includePageContext: e.target.checked })}
                        style={{ marginTop: '2px', flexShrink: 0 }}
                      />
                      <span>
                        Sertakan konteks halaman ini
                        <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
                          Menandai bahwa laporan dibuat dari halaman Pusat Bantuan.
                        </span>
                      </span>
                    </label>
                    {draft.includePageContext && (
                      <p
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          color: 'var(--ez-color-primary)',
                          background: 'var(--ez-color-primary-soft)',
                          borderRadius: 'var(--ez-radius-pill)',
                          padding: '3px 10px',
                          margin: '8px 0 0',
                        }}
                      >
                        <MapPin size={12} /> {PAGE_CONTEXT_LABEL}
                      </p>
                    )}
                  </div>

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
                      }}
                    >
                      <Info size={15} style={{ color: 'var(--ez-color-info)', flexShrink: 0, marginTop: '1px' }} />
                      <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-slate)', margin: 0, lineHeight: 1.55 }}>
                        {unavailableMessage}{' '}
                        <span style={{ color: 'var(--ez-color-text-muted)' }}>
                          Tulisan Anda tetap ada di formulir ini selama halaman terbuka, tetapi belum
                          tersimpan di mana pun.
                        </span>
                      </p>
                    </div>
                  )}

                  <div>
                    <button
                      type="submit"
                      disabled={checking}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                        height: '38px',
                        padding: '0 18px',
                        borderRadius: '999px',
                        border: 'none',
                        background: 'var(--ez-color-primary)',
                        color: 'var(--ez-color-on-primary)',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: checking ? 'wait' : 'pointer',
                        opacity: checking ? 0.65 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      <Send size={14} />
                      {checking ? 'Memeriksa…' : 'Kirim Laporan'}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default SuggestionComplaintBox;
