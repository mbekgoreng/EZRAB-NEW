import React, { useState } from 'react';

/**
 * Demo QTO interaktif — ilustrasi cara kerja kalkulator volume.
 * Berlabel DEMO, angka contoh, TIDAK terhubung ke engine produksi.
 */

interface ElementDef {
  id: string;
  name: string;
  dims: Array<{ key: string; label: string; unit: string; def: number; step: number }>;
  formula: (d: Record<string, number>) => { label: string; value: number; unit: string };
}

const ELEMENTS: ElementDef[] = [
  {
    id: 'balok',
    name: 'Balok Beton',
    dims: [
      { key: 'p', label: 'Panjang', unit: 'm', def: 4, step: 0.5 },
      { key: 'l', label: 'Lebar', unit: 'm', def: 0.25, step: 0.05 },
      { key: 't', label: 'Tinggi', unit: 'm', def: 0.4, step: 0.05 },
      { key: 'n', label: 'Jumlah', unit: 'bh', def: 6, step: 1 },
    ],
    formula: (d) => ({ label: 'Volume beton', value: d.p * d.l * d.t * d.n, unit: 'm³' }),
  },
  {
    id: 'kolom',
    name: 'Kolom Beton',
    dims: [
      { key: 't', label: 'Tinggi', unit: 'm', def: 3.5, step: 0.25 },
      { key: 'l', label: 'Lebar', unit: 'm', def: 0.3, step: 0.05 },
      { key: 'w', label: 'Tebal', unit: 'm', def: 0.3, step: 0.05 },
      { key: 'n', label: 'Jumlah', unit: 'bh', def: 8, step: 1 },
    ],
    formula: (d) => ({ label: 'Volume beton', value: d.t * d.l * d.w * d.n, unit: 'm³' }),
  },
  {
    id: 'pelat',
    name: 'Pelat Lantai',
    dims: [
      { key: 'p', label: 'Panjang', unit: 'm', def: 6, step: 0.5 },
      { key: 'l', label: 'Lebar', unit: 'm', def: 4, step: 0.5 },
      { key: 't', label: 'Tebal', unit: 'm', def: 0.12, step: 0.02 },
      { key: 'n', label: 'Jumlah', unit: 'bh', def: 1, step: 1 },
    ],
    formula: (d) => ({ label: 'Volume beton', value: d.p * d.l * d.t * d.n, unit: 'm³' }),
  },
  {
    id: 'dinding',
    name: 'Dinding Bata',
    dims: [
      { key: 'p', label: 'Panjang', unit: 'm', def: 12, step: 1 },
      { key: 't', label: 'Tinggi', unit: 'm', def: 3.2, step: 0.2 },
      { key: 'n', label: 'Jumlah sisi', unit: 'bh', def: 2, step: 1 },
    ],
    formula: (d) => ({ label: 'Luas pasangan', value: d.p * d.t * d.n, unit: 'm²' }),
  },
];

export const QtoDemo: React.FC = () => {
  const [elId, setElId] = useState('balok');
  const el = ELEMENTS.find((e) => e.id === elId)!;
  const [dims, setDims] = useState<Record<string, number>>(() =>
    Object.fromEntries(el.dims.map((d) => [d.key, d.def])),
  );

  const selectEl = (id: string) => {
    const next = ELEMENTS.find((e) => e.id === id)!;
    setElId(id);
    setDims(Object.fromEntries(next.dims.map((d) => [d.key, d.def])));
  };

  const result = el.formula(dims);

  return (
    <div className="qto-demo" aria-label="Demo interaktif kalkulator volume">
      <div className="qto-demo-badge">DEMO — angka contoh, bukan data proyek Anda</div>

      <div className="qto-demo-tabs" role="tablist" aria-label="Pilih elemen bangunan">
        {ELEMENTS.map((e) => (
          <button
            key={e.id}
            role="tab"
            aria-selected={elId === e.id}
            className={`qto-demo-tab ${elId === e.id ? 'is-active' : ''}`}
            onClick={() => selectEl(e.id)}
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="qto-demo-body">
        <div className="qto-demo-inputs">
          {el.dims.map((d) => (
            <label key={d.key} className="qto-demo-field">
              <span>
                {d.label} <em>({d.unit})</em>
              </span>
              <input
                type="number"
                min={0}
                step={d.step}
                value={dims[d.key]}
                onChange={(e) =>
                  setDims((prev) => ({ ...prev, [d.key]: Math.max(0, Number(e.target.value) || 0) }))
                }
                aria-label={`${d.label} dalam ${d.unit}`}
              />
            </label>
          ))}
        </div>

        <div className="qto-demo-result">
          <div className="qto-demo-result-label">{result.label}</div>
          <div className="qto-demo-result-value">
            {result.value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}{' '}
            <span>{result.unit}</span>
          </div>
          <p className="qto-demo-result-note">
            Di EZRAB, hasil seperti ini otomatis menjadi item QTO, dicocokkan ke
            AHSP, dan masuk ke RAB — tanpa ketik ulang.
          </p>
        </div>
      </div>
    </div>
  );
};
