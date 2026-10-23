/**
 * EZRAB RAB Generator — AI generates complete work item list from project description.
 * Flow: prompt → AI generates items → user reviews/adjusts → push to spreadsheet.
 */

import React, { useState } from 'react';
import { X, Sparkles, Check, Loader2, ArrowRight, Edit3 } from 'lucide-react';
import { RabItem } from '../../types';

export interface GeneratedWorkItem {
  description: string;
  category: string;
  /** F5 (4.6): null = the model did NOT provide a volume. Never silently 1. */
  volume: number | null;
  unit: string;
  unitPrice: number | null;
  ahspCode: string;
  notes: string;
}

/**
 * F5 (4.6): map raw model output onto review items. A volume is accepted
 * ONLY when it is a finite number > 0; anything else (missing, string,
 * zero/negative) becomes null = "volume belum ditentukan" and blocks saving
 * until the user fills it in. Previously a missing volume was silently
 * replaced with 1 — a fabricated quantity one click away from the RAB.
 */
export function mapAiGeneratedItems(parsed: unknown): GeneratedWorkItem[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((p: any) => ({
    description: p?.description || '',
    category: p?.category || 'Lainnya',
    volume:
      typeof p?.volume === 'number' && Number.isFinite(p.volume) && p.volume > 0
        ? p.volume
        : null,
    unit: p?.unit || 'm²',
    unitPrice: typeof p?.unitPrice === 'number' && Number.isFinite(p.unitPrice) ? p.unitPrice : null,
    ahspCode: p?.ahspCode || '',
    notes: p?.notes || '',
  }));
}

/** Indexes of items whose volume is still undetermined (save gate). */
export function missingVolumeIndexes(items: GeneratedWorkItem[]): number[] {
  const out: number[] = [];
  items.forEach((item, idx) => {
    if (item.volume === null) out.push(idx);
  });
  return out;
}

interface RabGeneratorModalProps {
  initialPrompt: string;
  projectId: string;
  onClose: () => void;
  onAddItems: (items: Omit<RabItem, 'id'>[]) => Promise<void>;
}

export const RabGeneratorModal: React.FC<RabGeneratorModalProps> = ({
  initialPrompt,
  projectId,
  onClose,
  onAddItems,
}) => {
  const [items, setItems] = useState<GeneratedWorkItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const generateItems = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const { AiToolsProviderClient, scanLongestParseableJson } = await import('../../ai-tools/providerClient');
      const client = new AiToolsProviderClient();

      const systemPrompt = `Anda adalah estimator konstruksi Indonesia. Berdasarkan deskripsi proyek, buat DAFTAR LENGKAP pekerjaan dari awal (persiapan) sampai akhir (finishing).

Kembalikan JSON array:
[
  {
    "description": "nama pekerjaan",
    "category": "kategori (Persiapan/Tanah/Pondasi/Struktur/Dinding/Atap/Finishing/MEP)",
    "volume": number|null,
    "unit": "m2|m3|m1|kg|titik|ls|bh",
    "unitPrice": number|null,
    "ahspCode": "kode AHSP jika ada, atau kosong",
    "notes": "catatan singkat"
  }
]

Urutkan dari pekerjaan awal sampai akhir. Jika harga tidak pasti, unitPrice = null. Jangan mengarang harga. Jika volume tidak dapat ditentukan dari deskripsi, volume = null. Jangan mengarang volume.`;

      const result = await client.execute<any[]>({
        productId: 'EZRAB_AI',
        prompt: initialPrompt,
        systemPrompt,
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 4000,
      });

      if (!result.success) {
        throw new Error(result.message || 'AI tidak dapat memproses.');
      }

      // F5 (4.6): use the client's structured parse; fall back to its
      // balanced JSON scanner — NOT the old greedy /\[[\s\S]*\]/ regex, which
      // broke on prose containing brackets.
      const parsed = Array.isArray(result.structured)
        ? result.structured
        : scanLongestParseableJson(result.content);

      if (!Array.isArray(parsed)) throw new Error('Format respons tidak valid.');

      setItems(mapAiGeneratedItems(parsed));
    } catch (err: any) {
      setError(err.message || 'Gagal generate daftar pekerjaan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAll = async () => {
    if (items.length === 0) return;
    // F5 (4.6): save gate — an item without a volume must be filled in by
    // the user first; it is never saved with an invented quantity.
    const missing = missingVolumeIndexes(items);
    if (missing.length > 0) {
      setError(
        `Volume ${missing.length} item belum ditentukan (AI tidak memberikan volume): ` +
        `${missing.map((i) => `No. ${i + 1}`).join(', ')}. Isi volumenya melalui tombol Edit sebelum menyimpan.`
      );
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const rabItems: Omit<RabItem, 'id'>[] = items.map((item, idx) => ({
        no: idx + 1,
        projectId,
        code: `AI-GEN-${String(idx + 1).padStart(3, '0')}`,
        description: item.description,
        category: item.category,
        sectionName: item.category,
        volume: item.volume as number,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.unitPrice == null ? null : Math.round((item.volume as number) * item.unitPrice),
        totalPrice: item.unitPrice == null ? null : Math.round((item.volume as number) * item.unitPrice),
        volumeSource: 'AI_GENERATED' as any,
        ahspCode: item.ahspCode,
        verificationStatus: 'NEEDS_VERIFICATION',
        priceStatus: item.unitPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED',
      }));
      await onAddItems(rabItems);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan ke RAB.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateItem = (idx: number, field: keyof GeneratedWorkItem, value: any) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  React.useEffect(() => {
    generateItems();
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.65)',
      backdropFilter: 'blur(5px)', zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: '900px', maxHeight: '92vh',
        backgroundColor: 'var(--ez-color-surface)', borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid var(--ez-color-border-line)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--ez-color-border-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--ez-color-primary)" />
              Daftar Pekerjaan dari AI
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
              "{initialPrompt}" — {items.length} item • Sesuaikan sebelum dimasukkan ke RAB
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
            <X size={20} color="var(--ez-color-text-muted)" />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {isGenerating && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Loader2 size={32} className="animate-spin" color="var(--ez-color-primary)" />
              <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--ez-color-text-muted)' }}>
                AI sedang menyusun daftar pekerjaan lengkap...
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {!isGenerating && items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((item, idx) => (
                <div key={idx} style={{
                  border: '1px solid var(--ez-color-border-line)', borderRadius: '10px',
                  padding: '12px 16px', background: 'var(--ez-color-surface)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 800, flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                        {item.description}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span>{item.category}</span>
                        <span>•</span>
                        {item.volume !== null ? (
                          <span>{item.volume} {item.unit}</span>
                        ) : (
                          <span style={{ color: '#D97706', fontWeight: 700 }}>Volume belum ditentukan — wajib diisi</span>
                        )}
                        <span>•</span>
                        <span>{item.unitPrice != null ? `Rp ${item.unitPrice.toLocaleString('id-ID')}` : 'Harga belum tersedia'}</span>
                        {item.ahspCode && <span>•</span>}
                        {item.ahspCode && <span style={{ color: 'var(--ez-color-primary)' }}>{item.ahspCode}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button
                        onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                        style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line)', background: 'var(--ez-color-surface)', cursor: 'pointer' }}
                        title="Edit"
                      >
                        <Edit3 size={14} color="var(--ez-color-text-muted)" />
                      </button>
                      <button
                        onClick={() => removeItem(idx)}
                        style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line)', background: 'var(--ez-color-surface)', cursor: 'pointer' }}
                        title="Hapus"
                      >
                        <X size={14} color="#DC2626" />
                      </button>
                    </div>
                  </div>

                  {editingIdx === idx && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--ez-color-border-line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input
                        value={item.description}
                        onChange={e => updateItem(idx, 'description', e.target.value)}
                        placeholder="Deskripsi"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line)', fontSize: '12.5px' }}
                      />
                      <input
                        value={item.category}
                        onChange={e => updateItem(idx, 'category', e.target.value)}
                        placeholder="Kategori"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line)', fontSize: '12.5px' }}
                      />
                      <input
                        type="number"
                        value={item.volume ?? ''}
                        onChange={e => {
                          const raw = e.target.value.trim();
                          const v = raw === '' ? NaN : parseFloat(raw);
                          updateItem(idx, 'volume', Number.isFinite(v) && v > 0 ? v : null);
                        }}
                        placeholder="Volume (wajib diisi)"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: item.volume === null ? '1px solid #D97706' : '1px solid var(--ez-color-border-line)', fontSize: '12.5px' }}
                      />
                      <input
                        value={item.unit}
                        onChange={e => updateItem(idx, 'unit', e.target.value)}
                        placeholder="Satuan"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line)', fontSize: '12.5px' }}
                      />
                      <input
                        value={item.ahspCode}
                        onChange={e => updateItem(idx, 'ahspCode', e.target.value)}
                        placeholder="Kode AHSP"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line)', fontSize: '12.5px' }}
                      />
                      <input
                        type="number"
                        value={item.unitPrice || ''}
                        onChange={e => updateItem(idx, 'unitPrice', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="Harga satuan (kosongkan jika belum tahu)"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line)', fontSize: '12.5px' }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && items.length > 0 && (
          <div style={{
            padding: '16px 24px', borderTop: '1px solid var(--ez-color-border-line)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--ez-color-surface)',
          }}>
            <div style={{ fontSize: '13px', color: missingVolumeIndexes(items).length > 0 ? '#D97706' : 'var(--ez-color-text-muted)', fontWeight: missingVolumeIndexes(items).length > 0 ? 700 : 400 }}>
              {missingVolumeIndexes(items).length > 0
                ? `${missingVolumeIndexes(items).length} item belum memiliki volume — lengkapi dulu untuk menyimpan`
                : `${items.length} pekerjaan siap dimasukkan`}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onClose}
                style={{
                  height: '38px', padding: '0 18px', borderRadius: '8px',
                  border: '1px solid var(--ez-color-border-line)', background: 'var(--ez-color-surface)',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveAll}
                disabled={isSaving || missingVolumeIndexes(items).length > 0}
                style={{
                  height: '38px', padding: '0 20px', borderRadius: '8px',
                  background: 'var(--ez-color-primary)', color: '#FFFFFF', border: 'none',
                  fontSize: '13px', fontWeight: 700, cursor: isSaving || missingVolumeIndexes(items).length > 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  opacity: isSaving || missingVolumeIndexes(items).length > 0 ? 0.6 : 1,
                }}
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {isSaving ? 'Menyimpan...' : 'Masukkan ke Spreadsheet'}
                {!isSaving && <ArrowRight size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
