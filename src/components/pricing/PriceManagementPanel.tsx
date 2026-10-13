/**
 * EZRAB Price Management — Assumption List & Approval UI
 * Standalone component. Integrate into navigation without modifying Sidebar.tsx.
 */
import React, { useState, useMemo } from 'react';
import {
  assumptionStore,
  PRICE_SOURCE_LABELS,
  isAssumptionUsable,
} from '../../engine/pricing/assumption/index';
import type { PriceAssumption, AssumptionStatus } from '../../engine/pricing/assumption/index';

const STATUS_COLORS: Record<AssumptionStatus, string> = {
  DRAFT: '#6b7280',
  PENDING: '#d97706',
  APPROVED: '#059669',
  EXPIRED: '#9ca3af',
  REJECTED: '#dc2626',
  DISABLED: '#4b5563',
};

const STATUS_LABELS: Record<AssumptionStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Menunggu Persetujuan',
  APPROVED: 'Disetujui',
  EXPIRED: 'Kedaluwarsa',
  REJECTED: 'Ditolak',
  DISABLED: 'Dinonaktifkan',
};

function fmtRp(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export const PriceManagementPanel: React.FC<{ currentUser: string }> = ({ currentUser }) => {
  const [, force] = useState(0);
  const [filter, setFilter] = useState<AssumptionStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const refresh = () => force((x) => x + 1);

  const items = useMemo(() => {
    return assumptionStore.list({
      status: filter === 'ALL' ? undefined : filter,
      search: search || undefined,
    });
  }, [filter, search]);

  const handle = (fn: () => void, label: string) => {
    try {
      fn();
      refresh();
    } catch (e) {
      alert(`${label} gagal: ${(e as Error).message}`);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 8px' }}>Manajemen Harga</h2>
      <p style={{ color: '#6b7280', margin: '0 0 16px', fontSize: 14 }}>
        Kelola harga asumsi EZRAB. Harga asumsi <strong>tidak pernah</strong> menjadi harga resmi AHSP.
        Label sumber: {Object.values(PRICE_SOURCE_LABELS).join(' · ')}
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Cari kode / nama resource…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as AssumptionStatus | 'ALL')}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
        >
          <option value="ALL">Semua status</option>
          {(Object.keys(STATUS_LABELS) as AssumptionStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {items.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
          Belum ada harga asumsi. Buat asumsi baru melalui API atau impor.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((a: PriceAssumption) => {
          const usable = isAssumptionUsable(a);
          return (
            <div
              key={a.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 16,
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {a.resourceCode} — {a.resourceName}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                    {fmtRp(a.price)} / {a.unit} · {a.resourceType}
                    {a.region ? ` · ${a.region}` : ''}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                    Dasar: {a.sourceNote}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    Berlaku {a.validFrom}{a.validUntil ? ` s.d. ${a.validUntil}` : ''} ·
                    Dibuat {a.createdBy} · {new Date(a.createdAt).toLocaleDateString('id-ID')}
                    {a.approvedBy ? ` · Disetujui ${a.approvedBy}` : ''}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#fff',
                    background: STATUS_COLORS[a.status],
                    padding: '4px 10px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {STATUS_LABELS[a.status]}
                </span>
              </div>

              {!usable && a.status === 'APPROVED' && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#d97706' }}>
                  ⚠ Di luar periode berlaku — tidak dipakai resolver.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {a.status === 'DRAFT' && (
                  <button
                    onClick={() => handle(() => assumptionStore.submit(a.id, currentUser), 'Submit')}
                    style={btn}
                  >
                    Ajukan Persetujuan
                  </button>
                )}
                {a.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => handle(() => assumptionStore.approve(a.id, currentUser), 'Setujui')}
                      style={{ ...btn, background: '#059669', color: '#fff', border: 'none' }}
                    >
                      Setujui
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('Alasan penolakan:');
                        if (reason) handle(() => assumptionStore.reject(a.id, currentUser, reason), 'Tolak');
                      }}
                      style={{ ...btn, background: '#dc2626', color: '#fff', border: 'none' }}
                    >
                      Tolak
                    </button>
                  </>
                )}
                {(a.status === 'APPROVED' || a.status === 'PENDING') && (
                  <button
                    onClick={() => handle(() => assumptionStore.disable(a.id, currentUser), 'Nonaktifkan')}
                    style={btn}
                  >
                    Nonaktifkan
                  </button>
                )}
                {(a.status === 'REJECTED' || a.status === 'EXPIRED' || a.status === 'DISABLED') && (
                  <button
                    onClick={() => handle(() => assumptionStore.backToDraft(a.id, currentUser), 'Draft ulang')}
                    style={btn}
                  >
                    Kembali ke Draft
                  </button>
                )}
              </div>

              {a.history.length > 1 && (
                <details style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                  <summary style={{ cursor: 'pointer' }}>Riwayat ({a.history.length})</summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {a.history.map((h, i) => (
                      <li key={i}>
                        {new Date(h.at).toLocaleString('id-ID')} — {h.by}: {h.action}
                        {h.note ? ` (${h.note})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const btn: React.CSSProperties = {
  padding: '6px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

export default PriceManagementPanel;
