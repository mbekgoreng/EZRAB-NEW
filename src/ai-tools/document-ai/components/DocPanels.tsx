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
      setLogoMsg(v.error || 'Logo tidak valid.');
      return;
    }
    setEditing((e) => ({ ...e, logoDataUrl: v.dataUrl || null }));
    setLogoMsg(`Logo valid${v.width ? ` (${v.width}×${v.height}px, ${v.kind?.toUpperCase()})` : ''}.`);
  };

  const handleFullKop = async (file: File | null) => {
    if (!file) return;
    setKopBusy(true);
    setKopMsg(null);
    const v = await validateFullKopFile(file);
    setKopBusy(false);
    if (!v.ok) {
      // Error validasi ditampilkan apa adanya agar pengguna bisa bertindak.
      setKopMsg(v.error || 'Gambar kop tidak valid.');
      return;
    }
    setEditing((e) => ({ ...e, fullKopDataUrl: v.dataUrl || null }));
    setKopMsg(`Gambar kop valid${v.width ? ` (${v.width}×${v.height}px, ${v.kind?.toUpperCase()})` : ''}. Klik Simpan Profil untuk menyimpan.`);
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
      ? 'Hapus logo dari profil ini? Logo tidak tampil lagi di kop sampai Anda mengunggah ulang (klik Simpan Profil untuk menerapkan).'
      : confirmKind === 'fullkop'
        ? 'Hapus gambar kop penuh dari profil ini? Mode kop gambar penuh tidak aktif sampai gambar diunggah lagi (klik Simpan Profil untuk menerapkan).'
        : confirmKind === 'profile'
          ? `Hapus profil perusahaan "${editing.name || '(tanpa nama)'}" secara permanen dari perangkat ini?`
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
          <div className="docai-crumb">AI Document · Paper System</div>
          <h2><Building2 size={20} style={{ verticalAlign: -3 }} /> Identitas Perusahaan</h2>
          <p>Profil ini menjadi kop surat dokumen Anda. Tersimpan di perangkat ini (lokal), bukan di server.</p>
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
              {p.name || '(tanpa nama)'} {p.isDefault ? '• Default' : ''}
            </button>
          ))}
          <button className="docai-subbtn" onClick={() => setEditing(emptyProfile())}>+ Profil Baru</button>
        </div>
      )}

      <div className="docai-panelgrid">
        <div className="docai-card">
          <div className="docai-step">Profil Perusahaan</div>
          {field('Nama Perusahaan', 'name', 'mis. YF Architect Studio')}
          {field('Alamat', 'address', 'Jalan, kota, kode pos')}
          {field('Telepon', 'phone', 'mis. 0812-3456-7890')}
          {field('Email', 'email', 'halo@perusahaan.co.id')}
          {field('Website', 'website', 'www.perusahaan.co.id')}
          {field('Info Tambahan (opsional)', 'extra', 'mis. NPWP / nomor izin')}
          <div className="docai-step" style={{ marginTop: 8 }}>Kop Surat</div>
          <span className="docai-label">Mode Kop Surat</span>
          <div className="docai-modeline" role="tablist" aria-label="Mode kop surat" style={{ marginBottom: 12 }}>
            <button
              type="button"
              role="tab"
              aria-selected={kopMode === 'structured'}
              className={kopMode === 'structured' ? 'active' : ''}
              onClick={() => setEditing((p) => ({ ...p, kopMode: 'structured' }))}
            >
              Kop Terstruktur
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kopMode === 'full'}
              className={kopMode === 'full' ? 'active' : ''}
              onClick={() => setEditing((p) => ({ ...p, kopMode: 'full' }))}
            >
              Kop Gambar Penuh
            </button>
          </div>
          <p className="docai-hint" style={{ margin: '0 0 12px' }}>
            {kopMode === 'structured'
              ? 'Kop disusun dari logo + nama/kontak perusahaan di bawah. Gambar kop penuh (bila pernah diunggah) tetap tersimpan dan tidak ditimpa mode ini.'
              : 'Satu gambar kop surat lengkap menggantikan seluruh blok kop — logo/nama terstruktur TIDAK ditumpuk di atasnya. Data terstruktur tetap tersimpan dan tidak ditimpa mode ini.'}
          </p>

          {kopMode === 'structured' && (
            <>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">Layout Kop</span>
            <select
              className="docai-select docai-full"
              value={editing.layout}
              onChange={(e) => setEditing((p) => ({ ...p, layout: e.target.value as KopLayout }))}
            >
              <option value="left">Logo kiri, teks kanan</option>
              <option value="center">Di tengah</option>
              <option value="minimal">Minimal (satu baris)</option>
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">Warna Aksen Garis Kop</span>
            <input
              type="color"
              className="docai-colorinput"
              value={editing.accentColor}
              onChange={(e) => setEditing((p) => ({ ...p, accentColor: e.target.value }))}
            />
          </label>

          <div style={{ marginBottom: 12 }}>
            <span className="docai-label">Logo Perusahaan</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="docai-btn-ghost" onClick={() => fileRef.current?.click()} disabled={logoBusy}>
                <Upload size={14} /> {logoBusy ? 'Memeriksa…' : 'Unggah Logo'}
              </button>
              {editing.logoDataUrl && (
                <button className="docai-btn-ghost" onClick={() => setConfirmKind('logo')}>
                  <Trash2 size={14} /> Hapus Logo
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
            <p className="docai-hint">PNG/JPG/GIF/WebP asli (isi file diperiksa), maks 2 MB. Rekomendasi: latar transparan, lebar ≥ 400px.</p>
          </div>
            </>
          )}

          {kopMode === 'full' && (
            <div style={{ marginBottom: 12 }}>
              <span className="docai-label">Gambar Kop Surat Lengkap</span>
              {effectiveKopMode !== 'full' && (
                <div className="docai-warn" style={{ margin: '0 0 10px' }}>
                  Mode kop gambar penuh dipilih, tetapi gambar kop belum diunggah — yang tampil pada
                  dokumen saat ini adalah kop terstruktur. Unggah gambar kop di bawah agar mode penuh aktif.
                </div>
              )}
              {editing.fullKopDataUrl && (
                <img
                  className="docai-fullkop-img"
                  src={editing.fullKopDataUrl}
                  alt="Pratinjau gambar kop surat lengkap"
                  style={{ width: `${Math.max(50, Math.min(100, editing.fullKopWidthPct ?? 100))}%` }}
                />
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <button className="docai-btn-ghost" onClick={() => fullKopRef.current?.click()} disabled={kopBusy}>
                  <Upload size={14} /> {kopBusy ? 'Memeriksa…' : editing.fullKopDataUrl ? 'Ganti Gambar Kop' : 'Unggah Gambar Kop'}
                </button>
                {editing.fullKopDataUrl && (
                  <button className="docai-btn-ghost" onClick={() => setConfirmKind('fullkop')}>
                    <Trash2 size={14} /> Hapus Gambar Kop
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
              <p className="docai-hint">PNG/JPG/GIF/WebP asli (isi file diperiksa, bukan hanya ekstensi), maks 5 MB. Gambar tersimpan lokal di perangkat ini, sama seperti profil — bukan unggahan cloud.</p>
              <div className="docai-numrow">
                <label>
                  <span className="docai-label">Lebar Kop (%)</span>
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
                  <span className="docai-label">Jarak ke Isi (mm)</span>
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
            <span>Jadikan profil default</span>
          </label>

          {confirmKind && (
            <div className="docai-confirmbar" role="alertdialog" aria-live="polite">
              <AlertTriangle size={16} />
              <span>{confirmText}</span>
              <div className="docai-confirmbtns">
                <button className="docai-btn-primary" onClick={runConfirmedDelete}>Ya, Hapus</button>
                <button className="docai-btn-ghost" onClick={() => setConfirmKind(null)}>Batal</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="docai-btn-primary" onClick={handleSave}>
              <Check size={15} /> Simpan Profil
            </button>
            {profiles.some((p) => p.id === editing.id) && (
              <button className="docai-btn-ghost" onClick={() => setConfirmKind('profile')}>
                <Trash2 size={14} /> Hapus
              </button>
            )}
            {savedMsg && <span className="docai-savedmsg"><Check size={14} /> Tersimpan</span>}
          </div>
        </div>

        <div>
          <span className="docai-label">Pratinjau Kop Surat</span>
          <div className="docai-kop-preview">
            {kopHtml(editing) ? (
              <div dangerouslySetInnerHTML={{ __html: kopHtml(editing) }} />
            ) : (
              <p className="docai-hint">Isi nama perusahaan atau unggah logo untuk melihat kop surat.</p>
            )}
            <div className="docai-prose" style={{ opacity: 0.55 }}>
              <h1>Contoh Judul Dokumen</h1>
              <p>Paragraf contoh isi dokumen. Kop di atas akan tampil sama pada editor, hasil cetak, PDF, dan DOCX.</p>
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
          <div className="docai-crumb">AI Document · Paper System</div>
          <h2><FileText size={20} style={{ verticalAlign: -3 }} /> Template Saya</h2>
          <p>Template pribadi tersimpan di perangkat ini. Template dengan contoh isi akan membuka dokumen langsung dari contohnya; template tanpa contoh memakai AI dengan kerangka struktur Anda.</p>
        </div>
      </div>

      <div className="docai-panelgrid">
        <div className="docai-card">
          <div className="docai-step">Buat Template</div>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">Nama Template</span>
            <input className="docai-input" style={{ marginBottom: 0 }} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="mis. BA Pemeriksaan Kolom" />
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">Deskripsi</span>
            <input className="docai-input" style={{ marginBottom: 0 }} value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} placeholder="Kegunaan template ini" />
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">Template Dasar</span>
            <select className="docai-select docai-full" value={form.baseTemplateId} onChange={(e) => setForm((f) => ({ ...f, baseTemplateId: e.target.value }))}>
              {builtinNames.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="docai-label">Kerangka Struktur (untuk AI)</span>
            <textarea className="docai-textarea" rows={5} value={form.scaffold} onChange={(e) => setForm((f) => ({ ...f, scaffold: e.target.value }))} placeholder="Bagian-bagian dokumen, urutannya, dan hal yang wajib ada." />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="docai-btn-primary" disabled={!form.name.trim()} onClick={() => { persist(form); setForm(newUserTemplate({})); }}>
              <Check size={15} /> Simpan Template
            </button>
            {msg && <span className="docai-savedmsg"><Check size={14} /> Tersimpan</span>}
          </div>
          <p className="docai-hint" style={{ marginTop: 10 }}>Tip: dari editor dokumen, gunakan menu ⋯ → “Simpan sebagai Template” untuk menyimpan isi dokumen saat ini sebagai contoh template.</p>
        </div>

        <div>
          {items.length > 0 && (
            <div className="docai-listtoolbar">
              <div className="docai-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari template saya…"
                  aria-label="Cari template saya"
                />
              </div>
              <span className="docai-listcount">{shownItems.length} dari {items.length} template</span>
            </div>
          )}
          <div className="docai-draftlist" style={{ marginTop: 0 }}>
            {items.length === 0 && (
              <div className="docai-empty docai-empty-sm">
                <FileText size={26} />
                <h3>Belum ada template pribadi</h3>
                <p>Gunakan formulir buat template untuk menambahkan template pertama Anda, atau simpan isi dokumen dari editor lewat menu ⋯ → “Simpan sebagai Template”.</p>
              </div>
            )}
            {items.length > 0 && shownItems.length === 0 && (
              <p className="docai-hint" style={{ margin: 0 }}>Tidak ada template yang cocok dengan pencarian ini.</p>
            )}
            {shownItems.map((x) => (
              <div key={x.id} className={`docai-draftitem ${x.archived ? 'is-archived' : ''}`} style={{ cursor: 'default' }}>
                <div>
                  <strong>{x.name}</strong>
                  <span className="docai-draftmeta">{x.archived ? 'Diarsipkan' : x.sampleHtml ? 'Dengan contoh isi' : 'Kerangka AI'}</span>
                  {x.desc && <div className="docai-hint" style={{ marginTop: 2 }}>{x.desc}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="docai-iconbtn" title="Pakai template" aria-label={`Pakai template ${x.name}`} onClick={() => onUse(x)}><Play size={14} /></button>
                  <button className="docai-iconbtn" title="Duplikat" aria-label={`Duplikat template ${x.name}`} onClick={() => setItems(saveUserTemplate(newUserTemplate({ ...x, name: `${x.name} (salinan)` })))}><Copy size={14} /></button>
                  <button className="docai-iconbtn" title={x.archived ? 'Batalkan arsip' : 'Arsipkan'} aria-label={`${x.archived ? 'Batalkan arsip' : 'Arsipkan'} template ${x.name}`} onClick={() => setItems(saveUserTemplate({ ...x, archived: !x.archived }))}><Archive size={14} /></button>
                  <button className="docai-iconbtn danger" title="Hapus" aria-label={`Hapus template ${x.name}`} onClick={() => setItems(deleteUserTemplate(x.id))}><Trash2 size={14} /></button>
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
          <div className="docai-crumb">AI Document · Paper System</div>
          <h2><Archive size={20} style={{ verticalAlign: -3 }} /> Dokumen Tersimpan</h2>
          <p>Semua draf di perangkat ini beserta statusnya. Mengarsipkan tidak menghapus dokumen.</p>
        </div>
      </div>
      {drafts.length > 0 && (
        <div className="docai-listtoolbar">
          <div className="docai-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari dokumen (judul / template)…"
              aria-label="Cari dokumen tersimpan"
            />
          </div>
          <select className="docai-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter status dokumen">
            <option value="all">Semua status</option>
            <option value="draft">Draft</option>
            <option value="editing">Sedang Disunting</option>
            <option value="review">Siap Ditinjau</option>
            <option value="final">Final</option>
            <option value="archived">Diarsipkan</option>
          </select>
          <span className="docai-listcount">{shown.length} dari {drafts.length} dokumen</span>
        </div>
      )}
      <div className="docai-draftlist" style={{ marginTop: 0 }}>
        {drafts.length === 0 && (
          <div className="docai-empty">
            <Archive size={30} />
            <h3>Belum ada dokumen tersimpan</h3>
            <p>Draf yang Anda buat akan muncul di sini beserta statusnya, siap dibuka kembali kapan saja.</p>
            {onCreate && (
              <button className="docai-btn-primary" onClick={onCreate}>Buat Dokumen</button>
            )}
          </div>
        )}
        {drafts.length > 0 && shown.length === 0 && (
          <div className="docai-empty docai-empty-sm">
            <Search size={26} />
            <h3>Tidak ada dokumen yang cocok</h3>
            <p>Tidak ada dokumen yang cocok dengan pencarian atau filter status ini.</p>
            <button
              className="docai-btn-ghost"
              onClick={() => { setQuery(''); setFilter('all'); }}
            >
              Atur Ulang Filter
            </button>
          </div>
        )}
        {shown.map((d) => (
          <div key={d.id} className="docai-draftitem" style={{ cursor: 'default' }}>
            <div>
              <button type="button" className="docai-titlebtn" onClick={() => onOpen(d)} title="Buka dokumen di editor">{d.title}</button>
              <span className="docai-draftmeta">{d.templateName} · {new Date(d.updatedAt).toLocaleString('id-ID')}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {d.status === 'final' ? (
                // Final hanya dicapai lewat persetujuan bernama (approveDraft)
                // di editor — di sini statusnya terkunci, tidak dipilih bebas.
                <span className="docai-statusbadge st-final">
                  Final{d.approvedBy ? ` · ${d.approvedBy}` : ''}
                </span>
              ) : (
                <select
                  className="docai-select"
                  value={d.status === 'reviewed' ? 'review' : d.status}
                  onChange={(e) => onStatus(d, e.target.value as DocDraftStatus)}
                  aria-label="Status dokumen"
                >
                  <option value="draft">Draft</option>
                  <option value="editing">Sedang Disunting</option>
                  <option value="review">Siap Ditinjau</option>
                  <option value="archived">Diarsipkan</option>
                </select>
              )}
              <button className="docai-btn-primary docai-mini" onClick={() => onOpen(d)}>Buka</button>
            </div>
          </div>
        ))}
      </div>
      <p className="docai-hint" style={{ marginTop: 10 }}>Catatan: penyimpanan saat ini lokal per perangkat — bila dua orang menyunting dokumen yang sama dari perangkat berbeda, versi terakhir yang disimpan akan menang (belum ada penggabungan versi).</p>
    </div>
  );
};

export { docStatusLabel };
