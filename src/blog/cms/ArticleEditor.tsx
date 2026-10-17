/**
 * Editor artikel CMS: form field, pratinjau markdown, workflow status,
 * validasi, dan riwayat revisi. Client-only (di dalam workspace /app/blog).
 */
import React, { useMemo, useState } from 'react';
import { BLOG_CATEGORIES, type BlogArticle, type BlogStatus } from '../types';
import { MarkdownView } from '../components/MarkdownView';
import {
  ALLOWED_TRANSITIONS,
  BlogAdminValidationError,
  type ArticleInput,
  type BlogAdminStore,
} from './store';

export const STATUS_LABEL: Record<BlogStatus, string> = {
  draft: 'Draft',
  review: 'Review',
  scheduled: 'Terjadwal',
  published: 'Published',
  archived: 'Arsip',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid var(--ez-color-border)',
  fontSize: 13.5,
  fontFamily: 'inherit',
  background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-primary)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ez-color-text-muted)',
  marginBottom: 6,
};

const emptyInput = (a?: BlogArticle | null): ArticleInput => ({
  title: a?.title ?? '',
  slug: a?.slug ?? '',
  excerpt: a?.excerpt ?? '',
  bodyMarkdown: a?.bodyMarkdown ?? '',
  category: a?.category ?? BLOG_CATEGORIES[0],
  tags: a?.tags ?? [],
  authorName: a?.author.name ?? '',
  authorRole: a?.author.role ?? '',
  authorBio: a?.author.bio ?? '',
  cover: a?.cover ?? '',
  seoTitle: a?.seoTitle ?? '',
  seoDescription: a?.seoDescription ?? '',
  canonical: a?.canonical ?? '',
  ogImage: a?.ogImage ?? '',
  featured: a?.featured ?? false,
  cta: a?.cta ?? '',
  references: a?.references ?? [],
  scheduledAt: a?.scheduledAt ?? '',
});

interface Props {
  store: BlogAdminStore;
  initial: BlogArticle | null;
  authorName: string;
  onClose: () => void;
  onChanged: () => void;
}

export const ArticleEditor: React.FC<Props> = ({ store, initial, authorName, onClose, onChanged }) => {
  const [form, setForm] = useState<ArticleInput>(() => emptyInput(initial));
  const [tab, setTab] = useState<'tulis' | 'pratinjau' | 'riwayat'>('tulis');
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [scheduleAt, setScheduleAt] = useState('');

  const isNew = !initial;
  const current = initial ? store.get(initial.slug) : undefined;
  const status: BlogStatus = current?.status ?? 'draft';
  const revisions = useMemo(
    () => (initial ? store.revisions(initial.slug) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, initial?.slug, savedTick]
  );

  const set = (patch: Partial<ArticleInput>) => setForm((f) => ({ ...f, ...patch }));

  const doSave = () => {
    setError(null);
    try {
      if (isNew) {
        store.create(form, authorName);
      } else if (initial) {
        store.update(initial.slug, form, authorName, 'Artikel diubah via editor');
      }
      setSavedTick((t) => t + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof BlogAdminValidationError ? e.message : 'Gagal menyimpan.');
    }
  };

  const doTransition = (next: BlogStatus) => {
    if (!initial) return;
    setError(null);
    if (next === 'published') {
      const ok = window.confirm(
        'Konfirmasi publish: artikel akan tampil di /blog publik dan masuk sitemap. Pastikan konten sudah direview manusia. Lanjutkan?'
      );
      if (!ok) return;
    }
    if (next === 'scheduled' && !scheduleAt && !current?.scheduledAt) {
      setError('Isi tanggal & jam terbit untuk menjadwalkan artikel.');
      return;
    }
    try {
      store.setStatus(initial.slug, next, authorName, {
        scheduledAt: next === 'scheduled' ? scheduleAt || current?.scheduledAt : undefined,
      });
      setForm((f) => ({ ...f, scheduledAt: next === 'scheduled' ? scheduleAt || f.scheduledAt : f.scheduledAt }));
      setSavedTick((t) => t + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof BlogAdminValidationError ? e.message : 'Gagal mengubah status.');
    }
  };

  const previewArticle: BlogArticle | null = current
    ? { ...current, title: form.title || current.title, bodyMarkdown: form.bodyMarkdown }
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} className="ezb-btn-ghost" style={{ padding: '8px 14px' }}>
          ← Kembali
        </button>
        <h2 style={{ margin: 0, fontSize: 18, color: 'var(--ez-color-text-primary)' }}>
          {isNew ? 'Artikel Baru' : `Edit: ${current?.title || form.title}`}
        </h2>
        {!isNew && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: '4px 12px',
              borderRadius: 999,
              background: status === 'published' ? '#dcfce7' : '#eef2ff',
              color: status === 'published' ? '#166534' : '#3730a3',
            }}
          >
            {STATUS_LABEL[status]}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" onClick={doSave} className="ezb-btn" style={{ padding: '9px 18px' }}>
            Simpan
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 12, padding: '12px 16px', fontSize: 13.5 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {(['tulis', 'pratinjau', 'riwayat'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: '1px solid var(--ez-color-border)',
              background: tab === t ? 'var(--ez-color-primary)' : 'var(--ez-color-surface)',
              color: tab === t ? '#fff' : 'var(--ez-color-text-primary)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t === 'tulis' ? 'Tulis' : t === 'pratinjau' ? 'Pratinjau' : `Riwayat (${revisions.length})`}
          </button>
        ))}
      </div>

      {tab === 'pratinjau' ? (
        <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)', borderRadius: 16, padding: 24 }}>
          <h1 style={{ fontSize: 26, color: 'var(--ez-color-text-primary)', margin: '0 0 12px' }}>
            {form.title || '(tanpa judul)'}
          </h1>
          {form.excerpt && <p style={{ color: 'var(--ez-color-text-muted)' }}>{form.excerpt}</p>}
          <MarkdownView markdown={form.bodyMarkdown || '*Belum ada isi.*'} className="ezb-prose" />
        </div>
      ) : tab === 'riwayat' ? (
        <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)', borderRadius: 16, padding: 20 }}>
          {revisions.length === 0 ? (
            <p style={{ color: 'var(--ez-color-text-muted)', fontSize: 13.5 }}>Belum ada revisi tercatat.</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {revisions.map((r) => (
                <li key={r.id} style={{ fontSize: 13.5 }}>
                  <strong>{r.note}</strong>
                  <div style={{ color: 'var(--ez-color-text-muted)', fontSize: 12.5 }}>
                    {new Date(r.savedAt).toLocaleString('id-ID')} · oleh {r.savedBy}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)', borderRadius: 16, padding: 20 }}>
            <div>
              <label style={labelStyle}>Judul *</label>
              <input style={inputStyle} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Judul artikel" />
            </div>
            <div>
              <label style={labelStyle}>Slug * {isNew ? '' : '(tidak bisa diubah setelah dibuat)'}</label>
              <input style={inputStyle} value={form.slug} disabled={!isNew} onChange={(e) => set({ slug: e.target.value })} placeholder="contoh: panduan-rab-rumah-tinggal" />
            </div>
            <div>
              <label style={labelStyle}>Excerpt</label>
              <textarea style={{ ...inputStyle, minHeight: 64 }} value={form.excerpt} onChange={(e) => set({ excerpt: e.target.value })} placeholder="Ringkasan 1–2 kalimat" />
            </div>
            <div>
              <label style={labelStyle}>Isi artikel (Markdown) *</label>
              <textarea
                style={{ ...inputStyle, minHeight: 320, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.6 }}
                value={form.bodyMarkdown}
                onChange={(e) => set({ bodyMarkdown: e.target.value })}
                placeholder="Tulis artikel dalam Markdown…"
              />
            </div>
            <div>
              <label style={labelStyle}>Referensi (satu per baris)</label>
              <textarea
                style={{ ...inputStyle, minHeight: 72 }}
                value={(form.references ?? []).join('\n')}
                onChange={(e) => set({ references: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                placeholder="cth: Kementerian PUPR — AHSP Bidang Cipta Karya 2026"
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Kategori *</label>
                <select style={inputStyle} value={form.category} onChange={(e) => set({ category: e.target.value })}>
                  {BLOG_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tag (koma)</label>
                <input style={inputStyle} value={form.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="rab, estimasi" />
              </div>
              <div>
                <label style={labelStyle}>Nama penulis</label>
                <input style={inputStyle} value={form.authorName} onChange={(e) => set({ authorName: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Peran penulis</label>
                <input style={inputStyle} value={form.authorRole} onChange={(e) => set({ authorRole: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Varian CTA</label>
                <select style={inputStyle} value={form.cta} onChange={(e) => set({ cta: e.target.value })}>
                  <option value="">general (semua fitur)</option>
                  <option value="rab">RAB &amp; Estimasi</option>
                  <option value="ahsp">AHSP 2026</option>
                  <option value="qto">QTO</option>
                  <option value="ded">DED to RAB AI</option>
                </select>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 600 }}>
                <input type="checkbox" checked={!!form.featured} onChange={(e) => set({ featured: e.target.checked })} />
                Artikel unggulan
              </label>
            </div>

            <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <strong style={{ fontSize: 13 }}>SEO</strong>
              <div>
                <label style={labelStyle}>SEO title</label>
                <input style={inputStyle} value={form.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} placeholder="default: judul" />
              </div>
              <div>
                <label style={labelStyle}>Meta description</label>
                <textarea style={{ ...inputStyle, minHeight: 56 }} value={form.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} placeholder="default: excerpt" />
              </div>
              <div>
                <label style={labelStyle}>Canonical (opsional)</label>
                <input style={inputStyle} value={form.canonical} onChange={(e) => set({ canonical: e.target.value })} placeholder="https://…" />
              </div>
              <div>
                <label style={labelStyle}>OG image (opsional)</label>
                <input style={inputStyle} value={form.ogImage} onChange={(e) => set({ ogImage: e.target.value })} placeholder="https://…/cover.jpg" />
              </div>
            </div>

            {!isNew && (
              <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <strong style={{ fontSize: 13 }}>Workflow</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ALLOWED_TRANSITIONS[status].map((next) => (
                    <button
                      key={next}
                      type="button"
                      onClick={() => doTransition(next)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        border: next === 'published' ? 'none' : '1px solid var(--ez-color-border)',
                        background: next === 'published' ? '#16a34a' : 'var(--ez-color-surface-secondary)',
                        color: next === 'published' ? '#fff' : 'var(--ez-color-text-primary)',
                        fontWeight: 700,
                        fontSize: 12.5,
                        cursor: 'pointer',
                      }}
                    >
                      → {STATUS_LABEL[next]}
                    </button>
                  ))}
                </div>
                {(ALLOWED_TRANSITIONS[status].includes('scheduled')) && (
                  <div>
                    <label style={labelStyle}>Jadwal terbit (untuk status Terjadwal)</label>
                    <input
                      type="datetime-local"
                      style={inputStyle}
                      value={scheduleAt || (current?.scheduledAt || '').slice(0, 16)}
                      onChange={(e) => setScheduleAt(e.target.value)}
                    />
                  </div>
                )}
                <p style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', margin: 0, lineHeight: 1.5 }}>
                  Publish meminta konfirmasi. Hanya artikel <em>Published</em> yang tampil di /blog publik &amp; sitemap.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleEditor;
