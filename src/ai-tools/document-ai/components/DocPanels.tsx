/**
 * AI DOKUMEN — Panel Paper System (Fase B2/B4/B5).
 *
 * CompanyIdentityPanel: kelola profil perusahaan & kop surat (lokal).
 * MyTemplatesPanel: kelola template pengguna (lokal).
 * SavedDocsPanel: daftar draf tersimpan + ubah status dokumen.
 *
 * Semua data panel ini tersimpan di perangkat (localStorage) — bukan
 * database server; label di UI menyatakannya apa adanya.
 */
import React, { useRef, useState } from 'react';
import { Building2, Upload, Trash2, Check, FileText, Archive, Copy, Play, AlertTriangle, Search } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nContext';
import {
  emptyProfile,
  kopHtml,
  kopModeEffective,
  listProfiles,
  saveProfile,
  deleteProfile,
  validateLogoFile,
  validateFullKopFile,
  type CompanyProfile,
  type KopLayout,
} from '../companyProfile';
import {
  deleteUserTemplate,
  listUserTemplates,
  newUserTemplate,
  saveUserTemplate,
  type UserTemplate,
} from '../docTemplates';
import { docStatusLabel, type DocDraftStatus, type DraftRecord } from '../view';

/* ------------------------------------------------------------------ */
/* Identitas Perusahaan                                                */
/* ------------------------------------------------------------------ */

export const CompanyIdentityPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<CompanyProfile[]>(() => listProfiles());
  const [editing, setEditing] = useState<CompanyProfile>(() => listProfiles().find((x) => x.isDefault) ?? emptyProfile());
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [kopMsg, setKopMsg] = useState<string | null>(null);
  const [kopBusy, setKopBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  /** Konfirmasi inline dua langkah untuk aksi destruktif (pola confirmBar fitur ini — bukan window.confirm). */
  const [confirmKind, setConfirmKind] = useState<'logo' | 'fullkop' | 'profile' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fullKopRef = useRef<HTMLInputElement>(null);

  const kopMode = editing.kopMode ?? 'structured';
  /** Mode yang benar-benar tampil saat render (full hanya bila asetnya ada). */
  const effectiveKopMode = kopModeEffective(editing);

  const refresh = (next: CompanyProfile[]) => {
    setProfiles(next);
    onChanged?.();
  };

  const handleLogo = async (file: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    setLogoMsg(null);
    const v = await validateLogoFile(file);
    setLogoBusy(false);
    if (!v.ok) {
      setLogoMsg(v.error || t('ai.doc.panels.logo_invalid'));
      return;
    }
    setEditing((e) => ({ ...e, logoDataUrl: v.dataUrl || null }));
    setLogoMsg(`${t('ai.doc.panels.logo_valid_a')}${v.width ? ` (${v.width}×${v.height}px, ${v.kind?.toUpperCase()})` : ''}${t('ai.doc.panels.logo_valid_b')}`);
  };

  const handleFullKop = async (file: File | null) => {
    if (!file) return;
    setKopBusy(true);
    setKopMsg(null);
    const v = await validateFullKopFile(file);
    setKopBusy(false);
    if (!v.ok) {
      // Error validasi ditampilkan apa adanya agar pengguna bisa bertindak.
      setKopMsg(v.error || t('ai.doc.panels.kop_invalid'));
      return;
    }
    setEditing((e) => ({ ...e, fullKopDataUrl: v.dataUrl || null }));
    setKopMsg(`${t('ai.doc.panels.kop_valid_a')}${v.width ? ` (${v.width}×${v.height}px, ${v.kind?.toUpperCase()})` : ''}${t('ai.doc.panels.kop_valid_b')}`);
  };

  const handleSave = () => {
    const next = saveProfile(editing);
    refresh(next);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2200);
  };

  const handleDelete = () => {
    const next = deleteProfile(editing.id);
    refresh(next);
    setEditing(next.find((x) => x.isDefault) ?? emptyProfile());
    setConfirmKind(null);
  };

  /** Jalankan aksi destruktif yang sudah dikonfirmasi pengguna. */
  const runConfirmedDelete = () => {
    if (confirmKind === 'logo') setEditing((p) => ({ ...p, logoDataUrl: null }));
    else if (confirmKind === 'fullkop') setEditing((p) => ({ ...p, fullKopDataUrl: null }));
    else if (confirmKind === 'profile') {
      handleDelete();
      return;
    }
    setConfirmKind(null);
  };

  const confirmText =
    confirmKind === 'logo'
      ? t('ai.doc.panels.confirm_logo')
      : confirmKind === 'fullkop'
        ? t('ai.doc.panels.confirm_fullkop')
        : confirmKind === 'profile'
          ? `${t('ai.doc.panels.confirm_profile_a')}${editing.name || t('ai.doc.panels.no_name')}${t('ai.doc.panels.confirm_profile_b')}`
          : '';

  const field = (label: string, key: keyof CompanyProfile, placeholder?: string) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span className="docai-label">{label}</span>
      <input
        className="docai-input"
        style={{ marginBottom: 0 }}
        value={String(editing[key] ?? '')}
        placeholder={placeholder}
        onChange={(e) => setEditing((p) => ({ ...p, [key]: e.target.value }))}
      />
    </label>
  );

  return (
    <div className="docai-tab">
      <div className="docai-pagehead">
        <div>
          <h2><Building2 size={20} style={{ verticalAlign: -3 }} /> {t('ai.doc.panels.identity_title')}</h2>
          <p>{t('ai.doc.panels.identity_sub')}</p>
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="docai-subnav">
          {profiles.map((p) => (
            <button
              key={p.id}
              className={`docai-subbtn ${editing.id === p.id ? 'active' : ''}`}
              onClick={() => setEditing(p)}
            >
              {p.name || t('ai.doc.panels.no_name')} {p.isDefault ? t('ai.doc.panels.profile_default') : ''}
            </button>
          ))}
          <button className="docai-subbtn" onClick={() => setEditing(emptyProfile())}>{t('ai.doc.panels.new_profile')}</button>
        </div>
      )}

      <div className="docai-panelgrid">
        <div className="docai-card">
          <div className="docai-step">{t('ai.doc.panels.profile_title')}</div>
          {field(t('ai.doc.panels.field_name'), 'name', t('ai.doc.panels.ph_name'))}
          {field(t('ai.doc.panels.field_address'), 'address', t('ai.doc.panels.ph_address'))}
          {field(t('ai.doc.panels.field_phone'), 'phone', t('ai.doc.panels.ph_phone'))}
          {field(t('ai.doc.panels.field_email'), 'email', t('ai.doc.panels.ph_email'))}
          {field(t('ai.doc.panels.field_website'), 'website', t('ai.doc.panels.ph_website'))}
          {field(t('ai.doc.panels.field_extra'), 'extra', t('ai.doc.panels.ph_extra'))}
          <div className="docai-step" style={{ marginTop: 8 }}>{t('ai.doc.panels.kop_title')}</div>
          <span className="docai-label">{t('ai.doc.panels.kop_mode')}</span>
          <div className="docai-modeline" role="tablist" aria-label={t('ai.doc.panels.kop_mode_aria')} style={{ marginBottom: 12 }}>
            <button
              type="button"
              role="tab"
              aria-selected={kopMode === 'structured'}
              className={kopMode === 'structured' ? 'active' : ''}
              onClick={() => setEditing((p) => ({ ...p, kopMode: 'structured' }))}
            >
              {t('ai.doc.panels.kop_mode_structured')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kopMode === 'full'}
              className={kopMode === 'full' ? 'active' : ''}
              onClick={() => setEditing((p) => ({ ...p, kopMode: 'full' }))}
            >
              {t('ai.doc.panels.kop_mode_full')}
            </button>
          </div>
          <p className="docai-hint" style={{ margin: '0 0 12px' }}>
            {kopMode === 'structured'
              ? t('ai.doc.panels.kop_hint_structured')
              : t('ai.doc.panels.kop_hint_full')}
          </p>

          {kopMode === 'structured' && (
            <>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">{t('ai.doc.panels.kop_layout')}</span>
            <select
              className="docai-select docai-full"
              value={editing.layout}
              onChange={(e) => setEditing((p) => ({ ...p, layout: e.target.value as KopLayout }))}
            >
              <option value="left">{t('ai.doc.panels.kop_layout_left')}</option>
              <option value="center">{t('ai.doc.panels.kop_layout_center')}</option>
              <option value="minimal">{t('ai.doc.panels.kop_layout_minimal')}</option>
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">{t('ai.doc.panels.kop_accent')}</span>
            <input
              type="color"
              className="docai-colorinput"
              value={editing.accentColor}
              onChange={(e) => setEditing((p) => ({ ...p, accentColor: e.target.value }))}
            />
          </label>

          <div style={{ marginBottom: 12 }}>
            <span className="docai-label">{t('ai.doc.panels.logo_title')}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="docai-btn-ghost" onClick={() => fileRef.current?.click()} disabled={logoBusy}>
                <Upload size={14} /> {logoBusy ? t('ai.doc.panels.checking') : t('ai.doc.panels.upload_logo')}
              </button>
              {editing.logoDataUrl && (
                <button className="docai-btn-ghost" onClick={() => setConfirmKind('logo')}>
                  <Trash2 size={14} /> {t('ai.doc.panels.delete_logo')}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => { void handleLogo(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
            </div>
            {logoMsg && <p className="docai-hint" style={{ marginTop: 6 }}>{logoMsg}</p>}
            <p className="docai-hint">{t('ai.doc.panels.logo_hint')}</p>
          </div>
            </>
          )}

          {kopMode === 'full' && (
            <div style={{ marginBottom: 12 }}>
              <span className="docai-label">{t('ai.doc.panels.fullkop_title')}</span>
              {effectiveKopMode !== 'full' && (
                <div className="docai-warn" style={{ margin: '0 0 10px' }}>
                  {t('ai.doc.panels.fullkop_warn')}
                </div>
              )}
              {editing.fullKopDataUrl && (
                <img
                  className="docai-fullkop-img"
                  src={editing.fullKopDataUrl}
                  alt={t('ai.doc.panels.fullkop_alt')}
                  style={{ width: `${Math.max(50, Math.min(100, editing.fullKopWidthPct ?? 100))}%` }}
                />
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <button className="docai-btn-ghost" onClick={() => fullKopRef.current?.click()} disabled={kopBusy}>
                  <Upload size={14} /> {kopBusy ? t('ai.doc.panels.checking') : editing.fullKopDataUrl ? t('ai.doc.panels.change_fullkop') : t('ai.doc.panels.upload_fullkop')}
                </button>
                {editing.fullKopDataUrl && (
                  <button className="docai-btn-ghost" onClick={() => setConfirmKind('fullkop')}>
                    <Trash2 size={14} /> {t('ai.doc.panels.delete_fullkop')}
                  </button>
                )}
                <input
                  ref={fullKopRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => { void handleFullKop(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
              </div>
              {kopMsg && <p className="docai-hint" style={{ marginTop: 6 }}>{kopMsg}</p>}
              <p className="docai-hint">{t('ai.doc.panels.fullkop_hint')}</p>
              <div className="docai-numrow">
                <label>
                  <span className="docai-label">{t('ai.doc.panels.fullkop_width')}</span>
                  <input
                    type="number"
                    className="docai-input"
                    style={{ marginBottom: 0 }}
                    min={50}
                    max={100}
                    value={editing.fullKopWidthPct ?? 100}
                    onChange={(e) => setEditing((p) => ({ ...p, fullKopWidthPct: Math.max(50, Math.min(100, Number(e.target.value) || 100)) }))}
                  />
                </label>
                <label>
                  <span className="docai-label">{t('ai.doc.panels.fullkop_gap')}</span>
                  <input
                    type="number"
                    className="docai-input"
                    style={{ marginBottom: 0 }}
                    min={0}
                    max={30}
                    value={editing.fullKopMarginMm ?? 0}
                    onChange={(e) => setEditing((p) => ({ ...p, fullKopMarginMm: Math.max(0, Math.min(30, Number(e.target.value) || 0)) }))}
                  />
                </label>
              </div>
            </div>
          )}

          <label className="docai-checkrow" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={editing.isDefault}
              onChange={(e) => setEditing((p) => ({ ...p, isDefault: e.target.checked }))}
            />
            <span>{t('ai.doc.panels.make_default')}</span>
          </label>

          {confirmKind && (
            <div className="docai-confirmbar" role="alertdialog" aria-live="polite">
              <AlertTriangle size={16} />
              <span>{confirmText}</span>
              <div className="docai-confirmbtns">
                <button className="docai-btn-primary" onClick={runConfirmedDelete}>{t('ai.doc.panels.confirm_yes')}</button>
                <button className="docai-btn-ghost" onClick={() => setConfirmKind(null)}>{t('ai.doc.create.ed_cancel')}</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="docai-btn-primary" onClick={handleSave}>
              <Check size={15} /> {t('ai.doc.panels.save_profile')}
            </button>
            {profiles.some((p) => p.id === editing.id) && (
              <button className="docai-btn-ghost" onClick={() => setConfirmKind('profile')}>
                <Trash2 size={14} /> {t('ai.doc.lib.title_delete')}
              </button>
            )}
            {savedMsg && <span className="docai-savedmsg"><Check size={14} /> {t('ai.doc.create.saved')}</span>}
          </div>
        </div>

        <div>
          <span className="docai-label">{t('ai.doc.panels.preview_title')}</span>
          <div className="docai-kop-preview">
            {kopHtml(editing) ? (
              <div dangerouslySetInnerHTML={{ __html: kopHtml(editing) }} />
            ) : (
              <p className="docai-hint">{t('ai.doc.panels.preview_empty')}</p>
            )}
            <div className="docai-prose" style={{ opacity: 0.55 }}>
              <h1>{t('ai.doc.panels.preview_doc_title')}</h1>
              <p>{t('ai.doc.panels.preview_doc_body')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Template Saya                                                       */
/* ------------------------------------------------------------------ */

export const MyTemplatesPanel: React.FC<{
  builtinNames: Array<{ id: string; name: string }>;
  onUse: (t: UserTemplate) => void;
}> = ({ builtinNames, onUse }) => {
  const { t } = useI18n();
  const [items, setItems] = useState<UserTemplate[]>(() => listUserTemplates());
  const [form, setForm] = useState<UserTemplate>(() => newUserTemplate({}));
  const [msg, setMsg] = useState(false);
  const [query, setQuery] = useState('');
  const shownItems = items.filter(
    (x) => !query.trim() || `${x.name} ${x.desc ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const persist = (t: UserTemplate) => {
    setItems(saveUserTemplate(t));
    setMsg(true);
    setTimeout(() => setMsg(false), 2000);
  };

  return (
    <div className="docai-tab">
      <div className="docai-pagehead">
        <div>
          <h2><FileText size={20} style={{ verticalAlign: -3 }} /> {t('ai.doc.panels.templates_title')}</h2>
          <p>{t('ai.doc.panels.templates_sub')}</p>
        </div>
      </div>

      <div className="docai-panelgrid">
        <div className="docai-card">
          <div className="docai-step">{t('ai.doc.panels.templates_create')}</div>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">{t('ai.doc.panels.templates_name')}</span>
            <input className="docai-input" style={{ marginBottom: 0 }} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('ai.doc.panels.templates_ph_name')} />
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">{t('ai.doc.panels.templates_desc')}</span>
            <input className="docai-input" style={{ marginBottom: 0 }} value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} placeholder={t('ai.doc.panels.templates_ph_desc')} />
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">{t('ai.doc.panels.templates_base')}</span>
            <select className="docai-select docai-full" value={form.baseTemplateId} onChange={(e) => setForm((f) => ({ ...f, baseTemplateId: e.target.value }))}>
              {builtinNames.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">{t('ai.doc.panels.templates_scaffold')}</span>
            <textarea className="docai-textarea" rows={5} value={form.scaffold} onChange={(e) => setForm((f) => ({ ...f, scaffold: e.target.value }))} placeholder={t('ai.doc.panels.templates_ph_scaffold')} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="docai-btn-primary" disabled={!form.name.trim()} onClick={() => { persist(form); setForm(newUserTemplate({})); }}>
              <Check size={15} /> {t('ai.doc.panels.templates_save')}
            </button>
            {msg && <span className="docai-savedmsg"><Check size={14} /> {t('ai.doc.create.saved')}</span>}
          </div>
          <p className="docai-hint" style={{ marginTop: 10 }}>{t('ai.doc.panels.templates_tip')}</p>
        </div>

        <div>
          {items.length > 0 && (
            <div className="docai-listtoolbar">
              <div className="docai-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('ai.doc.panels.templates_search_ph')}
                  aria-label={t('ai.doc.panels.templates_search_ph')}
                />
              </div>
              <span className="docai-listcount">{shownItems.length} {t('ai.doc.panels.count_of')} {items.length} {t('ai.doc.panels.count_templates')}</span>
            </div>
          )}
          <div className="docai-draftlist" style={{ marginTop: 0 }}>
            {items.length === 0 && (
              <div className="docai-empty docai-empty-sm">
                <FileText size={26} />
                <h3>{t('ai.doc.panels.templates_empty_h')}</h3>
                <p>{t('ai.doc.panels.templates_empty_p')}</p>
              </div>
            )}
            {items.length > 0 && shownItems.length === 0 && (
              <p className="docai-hint" style={{ margin: 0 }}>{t('ai.doc.panels.templates_no_match')}</p>
            )}
            {shownItems.map((x) => (
              <div key={x.id} className={`docai-draftitem ${x.archived ? 'is-archived' : ''}`} style={{ cursor: 'default' }}>
                <div>
                  <strong>{x.name}</strong>
                  <span className="docai-draftmeta">{x.archived ? t('ai.doc.panels.status_archived') : x.sampleHtml ? t('ai.doc.panels.tpl_with_sample') : t('ai.doc.panels.tpl_scaffold_only')}</span>
                  {x.desc && <div className="docai-hint" style={{ marginTop: 2 }}>{x.desc}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="docai-iconbtn" title={t('ai.doc.panels.tpl_use')} aria-label={`${t('ai.doc.panels.tpl_use')} ${x.name}`} onClick={() => onUse(x)}><Play size={14} /></button>
                  <button className="docai-iconbtn" title={t('ai.doc.panels.tpl_duplicate')} aria-label={`${t('ai.doc.panels.tpl_duplicate')} ${t('ai.doc.panels.tpl_word_template')} ${x.name}`} onClick={() => setItems(saveUserTemplate(newUserTemplate({ ...x, name: `${x.name}${t('ai.doc.panels.tpl_copy_suffix')}` })))}><Copy size={14} /></button>
                  <button className="docai-iconbtn" title={x.archived ? t('ai.doc.panels.tpl_unarchive') : t('ai.doc.panels.tpl_archive')} aria-label={`${x.archived ? t('ai.doc.panels.tpl_unarchive') : t('ai.doc.panels.tpl_archive')} ${t('ai.doc.panels.tpl_word_template')} ${x.name}`} onClick={() => setItems(saveUserTemplate({ ...x, archived: !x.archived }))}><Archive size={14} /></button>
                  <button className="docai-iconbtn danger" title={t('ai.doc.lib.title_delete')} aria-label={`${t('ai.doc.lib.title_delete')} ${t('ai.doc.panels.tpl_word_template')} ${x.name}`} onClick={() => setItems(deleteUserTemplate(x.id))}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Dokumen Tersimpan                                                   */
/* ------------------------------------------------------------------ */

export const SavedDocsPanel: React.FC<{
  drafts: DraftRecord[];
  onOpen: (d: DraftRecord) => void;
  onStatus: (d: DraftRecord, s: DocDraftStatus) => void;
  /** Aksi kosong-state: kembali ke sub-view Buat Dokumen (opsional). */
  onCreate?: () => void;
}> = ({ drafts, onOpen, onStatus, onCreate }) => {
  const { t } = useI18n();
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const shown = drafts.filter(
    (d) =>
      (filter === 'all' || d.status === filter || (filter === 'review' && d.status === 'reviewed')) &&
      (!query.trim() || `${d.title} ${d.templateName}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  return (
    <div className="docai-tab">
      <div className="docai-pagehead">
        <div>
          <h2><Archive size={20} style={{ verticalAlign: -3 }} /> {t('ai.doc.panels.saved_title')}</h2>
          <p>{t('ai.doc.panels.saved_sub')}</p>
        </div>
      </div>
      {drafts.length > 0 && (
        <div className="docai-listtoolbar">
          <div className="docai-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('ai.doc.panels.saved_search_ph')}
              aria-label={t('ai.doc.panels.saved_search_label')}
            />
          </div>
          <select className="docai-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('ai.doc.panels.filter_label')}>
            <option value="all">{t('ai.doc.panels.filter_all')}</option>
            <option value="draft">{t('ai.doc.panels.status_draft')}</option>
            <option value="editing">{t('ai.doc.panels.status_editing')}</option>
            <option value="review">{t('ai.doc.panels.status_review')}</option>
            <option value="final">{t('ai.doc.panels.status_final')}</option>
            <option value="archived">{t('ai.doc.panels.status_archived')}</option>
          </select>
          <span className="docai-listcount">{shown.length} {t('ai.doc.panels.count_of')} {drafts.length} {t('ai.doc.panels.count_documents')}</span>
        </div>
      )}
      <div className="docai-draftlist" style={{ marginTop: 0 }}>
        {drafts.length === 0 && (
          <div className="docai-empty">
            <Archive size={30} />
            <h3>{t('ai.doc.panels.saved_empty_h')}</h3>
            <p>{t('ai.doc.panels.saved_empty_p')}</p>
            {onCreate && (
              <button className="docai-btn-primary" onClick={onCreate}>{t('ai.doc.panels.create_doc')}</button>
            )}
          </div>
        )}
        {drafts.length > 0 && shown.length === 0 && (
          <div className="docai-empty docai-empty-sm">
            <Search size={26} />
            <h3>{t('ai.doc.panels.saved_nomatch_h')}</h3>
            <p>{t('ai.doc.panels.saved_nomatch_p')}</p>
            <button
              className="docai-btn-ghost"
              onClick={() => { setQuery(''); setFilter('all'); }}
            >
              {t('ai.doc.panels.reset_filter')}
            </button>
          </div>
        )}
        {shown.map((d) => (
          <div key={d.id} className="docai-draftitem" style={{ cursor: 'default' }}>
            <div>
              <button type="button" className="docai-titlebtn" onClick={() => onOpen(d)} title={t('ai.doc.panels.open_doc_title')}>{d.title}</button>
              <span className="docai-draftmeta">{d.templateName} · {new Date(d.updatedAt).toLocaleString('id-ID')}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {d.status === 'final' ? (
                // Final hanya dicapai lewat persetujuan bernama (approveDraft)
                // di editor — di sini statusnya terkunci, tidak dipilih bebas.
                <span className="docai-statusbadge st-final">
                  {t('ai.doc.panels.status_final')}{d.approvedBy ? ` · ${d.approvedBy}` : ''}
                </span>
              ) : (
                <select
                  className="docai-select"
                  value={d.status === 'reviewed' ? 'review' : d.status}
                  onChange={(e) => onStatus(d, e.target.value as DocDraftStatus)}
                  aria-label={t('ai.doc.panels.status_label')}
                >
                  <option value="draft">{t('ai.doc.panels.status_draft')}</option>
                  <option value="editing">{t('ai.doc.panels.status_editing')}</option>
                  <option value="review">{t('ai.doc.panels.status_review')}</option>
                  <option value="archived">{t('ai.doc.panels.status_archived')}</option>
                </select>
              )}
              <button className="docai-btn-primary docai-mini" onClick={() => onOpen(d)}>{t('ai.doc.panels.open_doc')}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="docai-hint" style={{ marginTop: 10 }}>{t('ai.doc.panels.saved_note')}</p>
    </div>
  );
};

export { docStatusLabel };
