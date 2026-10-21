import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, AlertTriangle } from 'lucide-react';

export interface RabWizardData {
  tipe: '36' | '45' | '60' | '90' | 'custom';
  lantai: number;
  tanahLebar: number;
  tanahPanjang: number;
  bangunanLebar: number;
  bangunanPanjang: number;
  kamarTidur: number;
  kamarMandi: number;
  ruangTamu: boolean;
  dapur: boolean;
  carport: boolean;
  lokasi: string;
  kualitas: 'standar' | 'menengah' | 'mewah';
}

interface RabWizardProps {
  onComplete: (data: RabWizardData) => void;
  onCancel: () => void;
  /** Data awal (draft yang dipertahankan pemanggil) — formulir tidak mulai dari nol. */
  initialData?: Partial<RabWizardData>;
  /** Dilaporkan setiap data berubah agar pemanggil dapat mempertahankan draft. */
  onDataChange?: (data: RabWizardData) => void;
}

const TIPE_PRESETS: Record<string, { label: string; luas: number; kt: number; km: number }> = {
  '36': { label: 'Tipe 36', luas: 36, kt: 2, km: 1 },
  '45': { label: 'Tipe 45', luas: 45, kt: 2, km: 1 },
  '60': { label: 'Tipe 60', luas: 60, kt: 3, km: 2 },
  '90': { label: 'Tipe 90', luas: 90, kt: 3, km: 2 },
  'custom': { label: 'Custom', luas: 0, kt: 3, km: 2 },
};

const STEPS = ['Tipe Rumah', 'Dimensi', 'Ruangan', 'Lokasi & Kualitas', 'Konfirmasi'];

/**
 * Wizard interaktif "Buatkan RAB Rumah".
 *
 * Tipe rumah adalah label awal yang perlu dikonfirmasi, bukan standar
 * dimensi universal. Semua nilai dapat disesuaikan.
 * Presentasi: bahasa desain dashboard EZRAB (token --ez-*), aman mode gelap.
 */
export const RabWizard: React.FC<RabWizardProps> = ({ onComplete, onCancel, initialData, onDataChange }) => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<RabWizardData>({
    tipe: '90', lantai: 1,
    tanahLebar: 6, tanahPanjang: 15,
    bangunanLebar: 6, bangunanPanjang: 15,
    kamarTidur: 3, kamarMandi: 2,
    ruangTamu: true, dapur: true, carport: true,
    lokasi: '', kualitas: 'standar',
    ...initialData,
  });

  const set = <K extends keyof RabWizardData>(k: K, v: RabWizardData[K]) =>
    setData(prev => ({ ...prev, [k]: v }));

  React.useEffect(() => { onDataChange?.(data); }, [data, onDataChange]);

  const selectTipe = (tipe: RabWizardData['tipe']) => {
    const preset = TIPE_PRESETS[tipe];
    setData(prev => ({
      ...prev, tipe,
      kamarTidur: preset.kt, kamarMandi: preset.km,
      // Estimasi dimensi dari luas (proporsi 1:2)
      ...(tipe !== 'custom' && preset.luas > 0 ? {
        bangunanLebar: Math.round(Math.sqrt(preset.luas / 2) * 10) / 10,
        bangunanPanjang: Math.round(Math.sqrt(preset.luas / 2) * 2 * 10) / 10,
      } : {}),
    }));
  };

  const luasBangunan = data.bangunanLebar * data.bangunanPanjang;
  const canNext = step === 0 || step === 4 ? true :
    step === 1 ? data.bangunanLebar > 0 && data.bangunanPanjang > 0 :
    step === 2 ? data.kamarTidur > 0 :
    step === 3 ? data.lokasi.trim().length > 0 : true;

  const buildPrompt = (): string => {
    const rooms: string[] = [];
    if (data.kamarTidur > 0) rooms.push(`${data.kamarTidur} kamar tidur`);
    if (data.kamarMandi > 0) rooms.push(`${data.kamarMandi} kamar mandi`);
    if (data.ruangTamu) rooms.push('ruang tamu');
    if (data.dapur) rooms.push('dapur');
    if (data.carport) rooms.push('carport');
    return `Buatkan rumah ${data.lantai} lantai luas bangunan ${luasBangunan.toFixed(0)} m², ` +
      `ukuran ${data.bangunanLebar} × ${data.bangunanPanjang} m, ${rooms.join(', ')}. ` +
      `Lokasi: ${data.lokasi}. Kualitas: ${data.kualitas}.`;
  };
  void buildPrompt; // prompt dibangun pemanggil dari data hasil onComplete

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ez-color-text-muted)' };

  return (
    <div style={{
      maxWidth: 620, margin: '0 auto', padding: 26,
      background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)',
      borderRadius: 18, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.10)',
      color: 'var(--ez-color-text-primary)',
    }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, height: 5, borderRadius: 999,
            background: i <= step ? 'var(--ez-color-primary)' : 'var(--ez-color-border-soft)',
            transition: 'background 0.2s ease',
          }} />
        ))}
      </div>
      <h3 style={{ margin: '0 0 3px', fontSize: 17, fontWeight: 800 }}>{STEPS[step]}</h3>
      <p style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', margin: '0 0 18px' }}>
        Langkah {step + 1} dari {STEPS.length}
      </p>

      {/* Step 0: Tipe */}
      {step === 0 && (
        <div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ez-color-text-secondary)', margin: '0 0 14px' }}>
            Tipe rumah adalah label awal — bukan standar dimensi universal. Anda dapat menyesuaikan semua ukuran di langkah berikutnya.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 9 }}>
            {Object.entries(TIPE_PRESETS).map(([key, p]) => {
              const active = data.tipe === key;
              return (
                <button key={key} onClick={() => selectTipe(key as RabWizardData['tipe'])}
                  style={{
                    position: 'relative', padding: '15px 10px 13px', borderRadius: 14, cursor: 'pointer',
                    border: active ? '1.5px solid var(--ez-color-primary)' : '1px solid var(--ez-color-border)',
                    background: active ? 'var(--ez-color-primary-soft)' : 'var(--ez-color-surface)',
                    transition: 'all 0.15s ease',
                  }}>
                  {active && (
                    <span style={{
                      position: 'absolute', top: 7, right: 7, width: 16, height: 16, borderRadius: '50%',
                      background: 'var(--ez-color-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={10} color="#FFF" strokeWidth={3.5} />
                    </span>
                  )}
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--ez-color-text-primary)' }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', marginTop: 2 }}>{p.luas > 0 ? `${p.luas} m²` : 'Bebas'}</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 18 }}>
            <div style={labelStyle}>Jumlah Lantai</div>
            <div style={{
              display: 'inline-flex', gap: 4, marginTop: 8, padding: 4, borderRadius: 12,
              background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-soft)',
            }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => set('lantai', n)}
                  style={{
                    padding: '7px 22px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: data.lantai === n ? 'var(--ez-color-surface)' : 'transparent',
                    color: data.lantai === n ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-secondary)',
                    fontWeight: data.lantai === n ? 800 : 550, fontSize: 13.5,
                    boxShadow: data.lantai === n ? '0 1px 3px rgba(15, 23, 42, 0.10)' : 'none',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Dimensi */}
      {step === 1 && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={labelStyle}>Tanah (lebar × panjang, meter)</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 7, alignItems: 'center' }}>
              <input type="number" value={data.tanahLebar} onChange={e => set('tanahLebar', +e.target.value)} style={inputStyle} />
              <span style={{ color: 'var(--ez-color-text-faint)', fontWeight: 700 }}>×</span>
              <input type="number" value={data.tanahPanjang} onChange={e => set('tanahPanjang', +e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={labelStyle}>Bangunan (lebar × panjang, meter)</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 7, alignItems: 'center' }}>
              <input type="number" value={data.bangunanLebar} onChange={e => set('bangunanLebar', +e.target.value)} style={inputStyle} />
              <span style={{ color: 'var(--ez-color-text-faint)', fontWeight: 700 }}>×</span>
              <input type="number" value={data.bangunanPanjang} onChange={e => set('bangunanPanjang', +e.target.value)} style={inputStyle} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', marginTop: 7 }}>
              Luas bangunan: <strong style={{ color: 'var(--ez-color-text-primary)' }}>{luasBangunan.toFixed(1)} m²</strong>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Ruangan */}
      {step === 2 && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={labelStyle}>Kamar Tidur</div>
              <input type="number" min={1} max={10} value={data.kamarTidur} onChange={e => set('kamarTidur', +e.target.value)} style={{ ...inputStyle, marginTop: 7 }} />
            </div>
            <div>
              <div style={labelStyle}>Kamar Mandi</div>
              <input type="number" min={1} max={10} value={data.kamarMandi} onChange={e => set('kamarMandi', +e.target.value)} style={{ ...inputStyle, marginTop: 7 }} />
            </div>
          </div>
          <div>
            <div style={labelStyle}>Ruang Tambahan</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {([['ruangTamu', 'Ruang Tamu'], ['dapur', 'Dapur'], ['carport', 'Carport']] as const).map(([key, label]) => {
                const active = data[key];
                return (
                  <button key={key} onClick={() => set(key, !active)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 650,
                      border: active ? '1.5px solid var(--ez-color-primary)' : '1px solid var(--ez-color-border)',
                      background: active ? 'var(--ez-color-primary-soft)' : 'var(--ez-color-surface)',
                      color: 'var(--ez-color-text-primary)',
                    }}>
                    {active && <Check size={13} strokeWidth={3.5} color="var(--ez-color-primary)" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Lokasi & Kualitas */}
      {step === 3 && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={labelStyle}>Lokasi Proyek *</div>
            <input value={data.lokasi} onChange={e => set('lokasi', e.target.value)}
              placeholder="Contoh: Jakarta Selatan" style={{ ...inputStyle, width: '100%', marginTop: 7, textAlign: 'left' }} />
          </div>
          <div>
            <div style={labelStyle}>Kualitas / Spesifikasi</div>
            <div style={{
              display: 'inline-flex', gap: 4, marginTop: 8, padding: 4, borderRadius: 12,
              background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-soft)',
            }}>
              {(['standar', 'menengah', 'mewah'] as const).map(q => (
                <button key={q} onClick={() => set('kualitas', q)}
                  style={{
                    padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                    background: data.kualitas === q ? 'var(--ez-color-surface)' : 'transparent',
                    color: data.kualitas === q ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-secondary)',
                    fontWeight: data.kualitas === q ? 800 : 550, fontSize: 13,
                    boxShadow: data.kualitas === q ? '0 1px 3px rgba(15, 23, 42, 0.10)' : 'none',
                  }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Konfirmasi */}
      {step === 4 && (
        <div>
          <div style={{ background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-soft)', borderRadius: 14, padding: '6px 16px' }}>
            {[
              ['Tipe', `${TIPE_PRESETS[data.tipe].label} (${data.lantai} lantai)`],
              ['Bangunan', `${data.bangunanLebar} × ${data.bangunanPanjang} m = ${luasBangunan.toFixed(1)} m²`],
              ['Ruang', `${data.kamarTidur} KT, ${data.kamarMandi} KM${data.ruangTamu ? ', RT' : ''}${data.dapur ? ', Dapur' : ''}${data.carport ? ', Carport' : ''}`],
              ['Lokasi', data.lokasi],
              ['Kualitas', data.kualitas],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--ez-color-border-soft)', fontSize: 13.5 }}>
                <span style={{ width: 84, flexShrink: 0, fontWeight: 700, color: 'var(--ez-color-text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--ez-color-text-primary)', textTransform: k === 'Kualitas' ? 'capitalize' : 'none' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 14, padding: '11px 13px',
            background: 'rgba(245, 158, 11, 0.10)', border: '1px solid rgba(245, 158, 11, 0.28)', borderRadius: 12,
          }}>
            <AlertTriangle size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ez-color-text-body)' }}>
              Data ini akan menjadi dasar desain AI. Tipe rumah adalah estimasi awal — denah dan RAB final perlu ditinjau sebelum dipakai.
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', gap: 8, marginTop: 22, alignItems: 'center' }}>
        <button onClick={onCancel} style={btnSecondary}>Batal</button>
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} style={btnSecondary}>
            <ArrowLeft size={14} /> Kembali
          </button>
        )}
        <div style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <button onClick={() => canNext && setStep(step + 1)} disabled={!canNext}
            style={{ ...btnPrimary, opacity: canNext ? 1 : 0.5, cursor: canNext ? 'pointer' : 'default' }}>
            Lanjut <ArrowRight size={14} />
          </button>
        ) : (
          <button onClick={() => onComplete({ ...data })}
            style={{
              ...btnPrimary,
              background: 'var(--ez-ai-surface-active)',
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.30)',
            }}>
            <Check size={15} strokeWidth={3} /> Buat Desain & RAB
          </button>
        )}
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 10, width: 110,
  border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-primary)', fontSize: 14, outline: 'none', textAlign: 'center',
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: 'var(--ez-color-primary)', color: '#FFF',
  fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 7,
};
const btnSecondary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10,
  border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-secondary)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 7,
};

export default RabWizard;
