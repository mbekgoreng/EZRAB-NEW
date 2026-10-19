import React, { useState } from 'react';

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
 */
export const RabWizard: React.FC<RabWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<RabWizardData>({
    tipe: '90', lantai: 1,
    tanahLebar: 6, tanahPanjang: 15,
    bangunanLebar: 6, bangunanPanjang: 15,
    kamarTidur: 3, kamarMandi: 2,
    ruangTamu: true, dapur: true, carport: true,
    lokasi: '', kualitas: 'standar',
  });

  const set = <K extends keyof RabWizardData>(k: K, v: RabWizardData[K]) =>
    setData(prev => ({ ...prev, [k]: v }));

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

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', background: '#FFF', borderRadius: 16, padding: 24, border: '1px solid #E2E8F0' }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? '#1E3A5F' : '#E2E8F0' }} />
        ))}
      </div>
      <h3 style={{ margin: '0 0 4px', color: '#1E3A5F' }}>{STEPS[step]}</h3>
      <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px' }}>
        Langkah {step + 1} dari {STEPS.length}
      </p>

      {/* Step 0: Tipe */}
      {step === 0 && (
        <div>
          <p style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
            Tipe rumah adalah label awal — bukan standar dimensi universal. Anda dapat menyesuaikan semua ukuran di langkah berikutnya.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
            {Object.entries(TIPE_PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => selectTipe(key as RabWizardData['tipe'])}
                style={{
                  padding: 16, borderRadius: 12, border: data.tipe === key ? '2px solid #1E3A5F' : '1px solid #E2E8F0',
                  background: data.tipe === key ? '#EFF6FF' : '#FFF', cursor: 'pointer',
                }}>
                <div style={{ fontWeight: 700, color: '#1E3A5F' }}>{p.label}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{p.luas > 0 ? `${p.luas} m²` : 'Bebas'}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Jumlah Lantai</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => set('lantai', n)}
                  style={{ padding: '8px 20px', borderRadius: 8, border: data.lantai === n ? '2px solid #1E3A5F' : '1px solid #E2E8F0', background: data.lantai === n ? '#EFF6FF' : '#FFF', cursor: 'pointer', fontWeight: 600 }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Dimensi */}
      {step === 1 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Tanah (lebar × panjang, meter)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input type="number" value={data.tanahLebar} onChange={e => set('tanahLebar', +e.target.value)} style={inputStyle} />
              <input type="number" value={data.tanahPanjang} onChange={e => set('tanahPanjang', +e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Bangunan (lebar × panjang, meter)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input type="number" value={data.bangunanLebar} onChange={e => set('bangunanLebar', +e.target.value)} style={inputStyle} />
              <input type="number" value={data.bangunanPanjang} onChange={e => set('bangunanPanjang', +e.target.value)} style={inputStyle} />
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Luas bangunan: {luasBangunan.toFixed(1)} m²</div>
          </div>
        </div>
      )}

      {/* Step 2: Ruangan */}
      {step === 2 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Kamar Tidur</label>
              <input type="number" min={1} max={10} value={data.kamarTidur} onChange={e => set('kamarTidur', +e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Kamar Mandi</label>
              <input type="number" min={1} max={10} value={data.kamarMandi} onChange={e => set('kamarMandi', +e.target.value)} style={inputStyle} />
            </div>
          </div>
          {([['ruangTamu', 'Ruang Tamu'], ['dapur', 'Dapur'], ['carport', 'Carport']] as const).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={data[key]} onChange={e => set(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      )}

      {/* Step 3: Lokasi & Kualitas */}
      {step === 3 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Lokasi Proyek *</label>
            <input value={data.lokasi} onChange={e => set('lokasi', e.target.value)}
              placeholder="Contoh: Jakarta Selatan" style={{ ...inputStyle, width: '100%', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Kualitas / Spesifikasi</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {(['standar', 'menengah', 'mewah'] as const).map(q => (
                <button key={q} onClick={() => set('kualitas', q)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: data.kualitas === q ? '2px solid #1E3A5F' : '1px solid #E2E8F0', background: data.kualitas === q ? '#EFF6FF' : '#FFF', cursor: 'pointer', textTransform: 'capitalize' }}>
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
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16, fontSize: 13 }}>
            <div><strong>Tipe:</strong> {TIPE_PRESETS[data.tipe].label} ({data.lantai} lantai)</div>
            <div><strong>Bangunan:</strong> {data.bangunanLebar} × {data.bangunanPanjang} m = {luasBangunan.toFixed(1)} m²</div>
            <div><strong>Ruang:</strong> {data.kamarTidur} KT, {data.kamarMandi} KM{data.ruangTamu ? ', RT' : ''}{data.dapur ? ', Dapur' : ''}{data.carport ? ', Carport' : ''}</div>
            <div><strong>Lokasi:</strong> {data.lokasi}</div>
            <div><strong>Kualitas:</strong> {data.kualitas}</div>
          </div>
          <p style={{ fontSize: 12, color: '#92400E', marginTop: 12 }}>
            ⚠ Data ini akan menjadi dasar desain AI. Tipe rumah adalah estimasi awal — denah dan RAB final perlu ditinjau sebelum dipakai.
          </p>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button onClick={onCancel} style={btnSecondary}>Batal</button>
        {step > 0 && <button onClick={() => setStep(step - 1)} style={btnSecondary}>← Kembali</button>}
        <div style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <button onClick={() => canNext && setStep(step + 1)} disabled={!canNext} style={btnPrimary}>Lanjut →</button>
        ) : (
          <button onClick={() => onComplete({ ...data })} style={btnPrimary}>✅ Buat Desain & RAB</button>
        )}
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, width: 100 };
const btnPrimary: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#FFF', fontWeight: 700, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFF', color: '#1E3A5F', fontWeight: 600, cursor: 'pointer' };

export default RabWizard;
