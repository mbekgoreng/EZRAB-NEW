/**
 * Panel Referensi Harga Pasar untuk satu komponen AHSP (Tahap 2).
 * ============================================================================
 * - Menampilkan referensi yang sudah ada (dengan badge status).
 * - Tambah referensi manual ber-URL bukti.
 * - "Minta Saran AI": memakai AiPriceSearchService yang sudah ada; hasilnya
 *   SELALU masuk sebagai ai_suggested / NEEDS_REVIEW — tidak pernah otomatis
 *   terverifikasi.
 * - Setujui → MARKET_VERIFIED + draft price_assumption (DRAFT).
 * - Tolak → REJECTED dengan alasan.
 */
import React, { useMemo, useState } from 'react';
import { marketReviewStore } from '../../engine/pricing/market/reviewStore';
import { extractSpec, compareKeyAttributes } from '../../engine/pricing/market/specProfiles';
import type {
  MarketPriceCandidate,
  MarketPriceReference,
  MarketSourceType,
} from '../../engine/pricing/market/types';
import { aiPriceSearchService } from '../../services/aiPriceSearchService';
import { assumptionStore } from '../../engine/pricing/assumption/assumptionStore';

interface Props {
  componentCode: string;
  componentName: string;
  componentUnit: string;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  MARKET_REFERENCE: { bg: '#e0f2fe', fg: '#0369a1', label: 'Referensi' },
  NEEDS_REVIEW: { bg: '#fef3c7', fg: '#92400e', label: 'Perlu tinjau' },
  MARKET_VERIFIED: { bg: '#dcfce7', fg: '#166534', label: 'Terverifikasi pasar' },
  REJECTED: { bg: '#fee2e2', fg: '#991b1b', label: 'Ditolak' },
};

const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

function relevantRefs(componentName: string): MarketPriceReference[] {
  const spec = extractSpec(componentName);
  return marketReviewStore.list().filter((r) => {
    if (!spec) return r.canonicalName.toLowerCase() === componentName.toLowerCase();
    if (r.spec.category !== spec.category) return false;
    return compareKeyAttributes(spec, r.spec).compatible;
  });
}

export const MarketReferencePanel: React.FC<Props> = ({
  componentCode, componentName, componentUnit, onClose, onChanged,
}) => {
  const [tick, setTick] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    sourceName: '', sourceType: 'toko_bangunan' as MarketSourceType,
    productUrl: '', listedPrice: '', packageQuantity: '1', packageUnit: componentUnit,
    priceType: 'normal' as const, region: '',
  });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const refs = useMemo(() => relevantRefs(componentName), [componentName, tick]);
  const refresh = () => { setTick((t) => t + 1); onChanged(); };

  const handleAdd = () => {
    const price = parseFloat(form.listedPrice);
    if (!form.sourceName.trim() || !(price > 0)) {
      setAiMsg('Nama sumber dan harga wajib diisi.');
      return;
    }
    const spec = extractSpec(componentName) ?? {
      category: 'lainnya', keyAttributes: {}, extraAttributes: {},
    };
    const candidate: MarketPriceCandidate = {
      canonicalName: componentName,
      spec,
      sourceName: form.sourceName.trim(),
      sourceType: form.sourceType,
      productUrl: form.productUrl.trim() || undefined,
      productTitle: `${componentName} — ${form.sourceName.trim()}`,
      listedPrice: price,
      packageQuantity: parseFloat(form.packageQuantity) || null,
      packageUnit: form.packageUnit.trim() || null,
      priceType: form.priceType,
      region: form.region.trim() || undefined,
    };
    marketReviewStore.ingest(
      { canonicalName: componentName, spec, normalizedUnit: componentUnit },
      [candidate],
      'estimator'
    );
    setShowForm(false);
    setAiMsg(null);
    setForm({ ...form, sourceName: '', productUrl: '', listedPrice: '', region: '' });
    refresh();
  };

  const handleAiSuggest = async () => {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const candidates = await aiPriceSearchService.searchWebPrices(componentName, {
        region: 'Indonesia', year: 2026, unit: componentUnit,
      });
      if (!candidates || candidates.length === 0) {
        setAiMsg('AI tidak menemukan kandidat yang dapat diverifikasi. Tambahkan manual dengan URL bukti.');
        return;
      }
      const spec = extractSpec(componentName) ?? {
        category: 'lainnya', keyAttributes: {}, extraAttributes: {},
      };
      const mapped: MarketPriceCandidate[] = candidates.map((c: any) => ({
        canonicalName: componentName,
        spec: extractSpec(c.specification || c.productTitle || componentName) ?? spec,
        sourceName: c.sourceName || 'Sumber AI',
        sourceType: 'ai_suggested' as MarketSourceType,
        sourceProductId: null,
        productUrl: c.sourceUrl || undefined,
        sellerName: null,
        brand: c.brand || null,
        productTitle: c.productTitle || `${componentName} (saran AI)`,
        listedPrice: c.price,
        packageQuantity: 1,
        packageUnit: c.unit || componentUnit,
        priceType: 'normal' as const,
        region: c.region || undefined,
      }));
      const { added, duplicates } = marketReviewStore.ingest(
        { canonicalName: componentName, spec, normalizedUnit: componentUnit },
        mapped,
        'ai-suggest'
      );
      setAiMsg(
        added.length > 0
          ? `${added.length} kandidat saran AI ditambahkan sebagai PERLU TINJAU (bukan harga final).${duplicates > 0 ? ` ${duplicates} duplikat dilewati.` : ''}`
          : 'Tidak ada kandidat baru (semua duplikat).'
      );
      refresh();
    } catch (e: any) {
      setAiMsg(`Saran AI gagal: ${e?.message || 'gangguan layanan'}. Tambahkan referensi manual.`);
    } finally {
      setAiBusy(false);
    }
  };

  const handleApprove = (id: string) => {
    const d = marketReviewStore.approve(id, 'estimator', componentCode);
    if (!d.ok) { setAiMsg(d.reason || 'Gagal menyetujui.'); return; }
    // Tautkan ke price_assumptions sebagai DRAFT (tetap berlabel pasar).
    if (d.assumptionDraft) {
      try {
        assumptionStore.create(
          {
            resourceCode: d.assumptionDraft.resourceCode,
            resourceName: d.assumptionDraft.resourceName,
            resourceType: d.assumptionDraft.resourceType,
            price: d.assumptionDraft.price,
            unit: d.assumptionDraft.unit,
            sourceNote: d.assumptionDraft.sourceNote,
            referenceDocument: d.assumptionDraft.referenceDocument,
            validFrom: new Date().toISOString().split('T')[0],
          },
          'estimator'
        );
      } catch (e: any) {
        setAiMsg(`Referensi terverifikasi, tetapi draft asumsi gagal dibuat: ${e?.message}`);
      }
    }
    setAiMsg('Referensi disetujui sebagai HARGA PASAR terverifikasi (bukan harga resmi).');
    refresh();
  };

  const handleReject = (id: string) => {
    if (!rejectReason.trim()) { setAiMsg('Isi alasan penolakan dulu.'); return; }
    marketReviewStore.reject(id, 'estimator', rejectReason.trim());
    setRejecting(null);
    setRejectReason('');
    refresh();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--ez-color-surface)', borderRadius: '16px', maxWidth: '640px', width: '100%', maxHeight: '88vh', overflow: 'auto', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Referensi Harga Pasar</h3>
            <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
              {componentName} <span style={{ color: '#94a3b8' }}>({componentCode} · per {componentUnit})</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ fontSize: '12px', color: '#475569', background: '#f1f5f9', borderRadius: '10px', padding: '10px 12px', lineHeight: 1.6 }}>
          Harga pasar hanya menjadi acuan setelah <strong>Anda verifikasi</strong> spesifikasi, satuan, dan sumbernya.
          Tidak ada pengambilan harga otomatis — setiap angka di bawah berasal dari input terverifikasi atau saran AI yang wajib ditinjau.
        </div>

        {aiMsg ? (
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0c4a6e', background: '#e0f2fe', borderRadius: '10px', padding: '10px 12px' }}>{aiMsg}</div>
        ) : null}

        {/* Daftar referensi */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {refs.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', textAlign: 'center', padding: '18px', border: '1.5px dashed var(--ez-color-border-line)', borderRadius: '12px' }}>
              Belum ada referensi untuk material ini.
            </div>
          ) : refs.map((r) => {
            const b = STATUS_BADGE[r.verificationStatus];
            return (
              <div key={r.id} style={{ border: '1px solid var(--ez-color-border-soft)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{r.sourceName}</div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '3px 10px', borderRadius: '999px', background: b.bg, color: b.fg }}>{b.label}</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569' }}>{r.productTitle}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '16px', fontWeight: 900 }}>{fmtRp(r.listedPrice)}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    per {r.packageQuantity && r.packageQuantity !== 1 ? `${r.packageQuantity} ` : ''}{r.packageUnit || r.normalizedUnit}
                    {r.normalizedUnitPrice !== null && r.packageUnit !== r.normalizedUnit ? ` (≈ ${fmtRp(r.normalizedUnitPrice)}/${r.normalizedUnit})` : ''}
                  </span>
                  {r.priceType !== 'normal' ? (
                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: '999px' }}>{r.priceType}</span>
                  ) : null}
                </div>
                {r.reviewNotes ? (
                  <div style={{ fontSize: '12px', color: '#92400e' }}>Catatan: {r.reviewNotes}</div>
                ) : null}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {r.productUrl ? (
                    <a href={r.productUrl} target="_blank" rel="noreferrer" style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1', textDecoration: 'none', border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '8px' }}>
                      Lihat Sumber ↗
                    </a>
                  ) : null}
                  {(r.verificationStatus === 'MARKET_REFERENCE' || r.verificationStatus === 'NEEDS_REVIEW') ? (
                    <>
                      <button onClick={() => handleApprove(r.id)} style={{ fontSize: '12px', fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}>
                        Setujui Harga
                      </button>
                      <button onClick={() => setRejecting(rejecting === r.id ? null : r.id)} style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', background: '#fee2e2', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}>
                        Tolak
                      </button>
                    </>
                  ) : null}
                </div>
                {rejecting === r.id ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Alasan penolakan (mis. spesifikasi tidak cocok)"
                      style={{ flex: 1, height: '36px', padding: '0 10px', borderRadius: '8px', border: '1.5px solid var(--ez-color-border-line)', fontSize: '12.5px' }}
                    />
                    <button onClick={() => handleReject(r.id)} style={{ fontSize: '12px', fontWeight: 700, color: '#fff', background: '#dc2626', border: 'none', padding: '0 14px', borderRadius: '8px', cursor: 'pointer' }}>OK</button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Aksi */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ flex: 1, minWidth: '180px', height: '40px', borderRadius: '10px', border: '1.5px solid var(--ez-color-primary)', background: 'transparent', color: 'var(--ez-color-primary)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            {showForm ? 'Tutup Form' : '＋ Tambah Referensi Manual'}
          </button>
          <button
            onClick={handleAiSuggest}
            disabled={aiBusy}
            style={{ flex: 1, minWidth: '180px', height: '40px', borderRadius: '10px', border: 'none', background: aiBusy ? '#94a3b8' : '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: aiBusy ? 'not-allowed' : 'pointer' }}
            title="Saran AI wajib ditinjau manual sebelum disetujui"
          >
            {aiBusy ? 'Mencari…' : '✨ Minta Saran AI'}
          </button>
        </div>

        {showForm ? (
          <div style={{ border: '1px solid var(--ez-color-border-soft)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} placeholder="Nama toko/sumber *" style={inputStyle} />
              <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value as MarketSourceType })} style={inputStyle}>
                <option value="toko_bangunan">Toko bangunan</option>
                <option value="marketplace">Marketplace</option>
                <option value="distributor">Distributor</option>
                <option value="manual">Lainnya (manual)</option>
              </select>
            </div>
            <input value={form.productUrl} onChange={(e) => setForm({ ...form, productUrl: e.target.value })} placeholder="URL produk (bukti, wajib untuk verifikasi)" style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <input value={form.listedPrice} onChange={(e) => setForm({ ...form, listedPrice: e.target.value })} placeholder="Harga (Rp) *" type="number" min="1" style={inputStyle} />
              <input value={form.packageQuantity} onChange={(e) => setForm({ ...form, packageQuantity: e.target.value })} placeholder="Isi kemasan" type="number" min="0" step="any" style={inputStyle} />
              <input value={form.packageUnit} onChange={(e) => setForm({ ...form, packageUnit: e.target.value })} placeholder="Satuan kemasan" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <select value={form.priceType} onChange={(e) => setForm({ ...form, priceType: e.target.value as any })} style={inputStyle}>
                <option value="normal">Harga normal</option>
                <option value="promo">Promo</option>
                <option value="grosir">Grosir</option>
                <option value="member">Member</option>
              </select>
              <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Wilayah (mis. Jakarta)" style={inputStyle} />
            </div>
            <button onClick={handleAdd} style={{ height: '40px', borderRadius: '10px', border: 'none', background: 'var(--ez-color-primary)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              Simpan Referensi
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  height: '38px', padding: '0 10px', borderRadius: '8px',
  border: '1.5px solid var(--ez-color-border-line)', fontSize: '13px', width: '100%',
  boxSizing: 'border-box',
};

export default MarketReferencePanel;
