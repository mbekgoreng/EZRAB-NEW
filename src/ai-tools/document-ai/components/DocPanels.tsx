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
import { Building2, Upload, Trash2, Check, FileText, Archive, Copy, Play } from 'lucide-react';
import {
  emptyProfile,
  kopHtml,
  listProfiles,
  saveProfile,
  deleteProfile,
  validateLogoFile,
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
  const [savedMsg, setSavedMsg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
  };

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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 20, alignItems: 'start' }}>
        <div>
          {field('Nama Perusahaan', 'name', 'mis. YF Architect Studio')}
          {field('Alamat', 'address', 'Jalan, kota, kode pos')}
          {field('Telepon', 'phone', 'mis. 0812-3456-7890')}
          {field('Email', 'email', 'halo@perusahaan.co.id')}
          {field('Website', 'website', 'www.perusahaan.co.id')}
          {field('Info Tambahan (opsional)', 'extra', 'mis. NPWP / nomor izin')}
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
              value={editing.accentColor}
              onChange={(e) => setEditing((p) => ({ ...p, accentColor: e.target.value }))}
              style={{ width: 64, height: 36, padding: 2, background: 'transparent', border: 'none' }}
            />
          </label>
          <label className="docai-checkrow" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={editing.isDefault}
              onChange={(e) => setEditing((p) => ({ ...p, isDefault: e.target.checked }))}
            />
            <span>Jadikan profil default</span>
          </label>

          <div style={{ marginBottom: 12 }}>
            <span className="docai-label">Logo Perusahaan</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="docai-btn-ghost" onClick={() => fileRef.current?.click()} disabled={logoBusy}>
                <Upload size={14} /> {logoBusy ? 'Memeriksa…' : 'Unggah Logo'}
              </button>
              {editing.logoDataUrl && (
                <button className="docai-btn-ghost" onClick={() => setEditing((p) => ({ ...p, logoDataUrl: null }))}>
                  <Trash2 size={14} /> Hapus Logo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => void handleLogo(e.target.files?.[0] ?? null)}
              />
            </div>
            {logoMsg && <p className="docai-hint" style={{ marginTop: 6 }}>{logoMsg}</p>}
            <p className="docai-hint">PNG/JPG/GIF/WebP asli (isi file diperiksa), maks 2 MB. Rekomendasi: latar transparan, lebar ≥ 400px.</p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="docai-btn-primary" onClick={handleSave}>
              <Check size={15} /> Simpan Profil
            </button>
            {profiles.some((p) => p.id === editing.id) && (
              <button className="docai-btn-ghost" onClick={handleDelete}>
                <Trash2 size={14} /> Hapus
              </button>
            )}
            {savedMsg && <span className="docai-hint" style={{ alignSelf: 'center' }}>Tersimpan ✓</span>}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 20, alignItems: 'start' }}>
        <div>
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
            {msg && <span className="docai-hint" style={{ alignSelf: 'center' }}>Tersimpan ✓</span>}
          </div>
          <p className="docai-hint" style={{ marginTop: 10 }}>Tip: dari editor dokumen, gunakan menu ⋯ → “Simpan sebagai Template” untuk menyimpan isi dokumen saat ini sebagai contoh template.</p>
        </div>

        <div className="docai-draftlist" style={{ marginTop: 0 }}>
          {items.length === 0 && <p className="docai-hint">Belum ada template pribadi.</p>}
          {items.map((x) => (
            <div key={x.id} className="docai-draftitem" style={{ cursor: 'default' }}>
              <div>
                <strong>{x.name}</strong>
                <span className="docai-draftst">{x.archived ? 'Diarsipkan' : x.sampleHtml ? 'Dengan contoh isi' : 'Kerangka AI'}</span>
                {x.desc && <div className="docai-hint">{x.desc}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="docai-btn-ghost" title="Pakai template" onClick={() => onUse(x)}><Play size={14} /></button>
                <button className="docai-btn-ghost" title="Duplikat" onClick={() => setItems(saveUserTemplate(newUserTemplate({ ...x, name: `${x.name} (salinan)` })))}><Copy size={14} /></button>
                <button className="docai-btn-ghost" title={x.archived ? 'Batalkan arsip' : 'Arsipkan'} onClick={() => setItems(saveUserTemplate({ ...x, archived: !x.archived }))}><Archive size={14} /></button>
                <button className="docai-btn-ghost" title="Hapus" onClick={() => setItems(deleteUserTemplate(x.id))}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
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
}> = ({ drafts, onOpen, onStatus }) => {
  const [filter, setFilter] = useState<string>('all');
  const shown = drafts.filter((d) => filter === 'all' || d.status === filter || (filter === 'review' && d.status === 'reviewed'));
  return (
    <div className="docai-tab">
      <div className="docai-pagehead">
        <div>
          <div className="docai-crumb">AI Document · Paper System</div>
          <h2><Archive size={20} style={{ verticalAlign: -3 }} /> Dokumen Tersimpan</h2>
          <p>Semua draf di perangkat ini beserta statusnya. Mengarsipkan tidak menghapus dokumen.</p>
        </div>
        <select className="docai-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Semua status</option>
          <option value="draft">Draft</option>
          <option value="editing">Sedang Disunting</option>
          <option value="review">Siap Ditinjau</option>
          <option value="final">Final</option>
          <option value="archived">Diarsipkan</option>
        </select>
      </div>
      <div className="docai-draftlist" style={{ marginTop: 0 }}>
        {shown.length === 0 && <p className="docai-hint">Tidak ada dokumen pada filter ini.</p>}
        {shown.map((d) => (
          <div key={d.id} className="docai-draftitem" style={{ cursor: 'default' }}>
            <div>
              <strong>{d.title}</strong>
              <span className="docai-draftst">{d.templateName} · {new Date(d.updatedAt).toLocaleString('id-ID')}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="docai-select"
                value={d.status === 'reviewed' ? 'review' : d.status}
                onChange={(e) => onStatus(d, e.target.value as DocDraftStatus)}
                aria-label="Status dokumen"
              >
                <option value="draft">Draft</option>
                <option value="editing">Sedang Disunting</option>
                <option value="review">Siap Ditinjau</option>
                <option value="final">Final</option>
                <option value="archived">Diarsipkan</option>
              </select>
              <button className="docai-btn-primary" onClick={() => onOpen(d)}>Buka</button>
            </div>
          </div>
        ))}
      </div>
      <p className="docai-hint" style={{ marginTop: 10 }}>Catatan: penyimpanan saat ini lokal per perangkat — bila dua orang menyunting dokumen yang sama dari perangkat berbeda, versi terakhir yang disimpan akan menang (belum ada penggabungan versi).</p>
    </div>
  );
};

export { docStatusLabel };
