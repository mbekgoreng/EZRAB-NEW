/**
 * MASTER PRICING §11.3 — AHSP COMPONENT DETAIL.
 *
 * Every component row distinguishes the 12 §11.3 fields (name, category,
 * coefficient, AHSP unit, canonical master item, master unit, resolved
 * master price, original AHSP source price, price difference, provenance,
 * last update, sync status) with one of the 9 sync statuses. The status
 * derivation is the tested pure logic — SYNCED is structurally impossible
 * for an unresolved item/price. All numbers come from the §6 resolution
 * (`AhspUnitPriceComposition`); nothing is guessed.
 */
import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import './masterPricing.css';
import type { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import type { AhspUnitPriceComposition } from '../../data/priceDatabase2026/types';
import {
  AHSP_COMPONENT_SYNC_STATUS_LABELS,
  buildAhspItemComponentDetails,
  formatCoefficient,
  formatDateId,
  formatRupiah,
  formatRupiahDelta,
  isUnresolvedSyncStatus,
  type AhspComponentDetailContext,
  type AhspComponentSyncStatus,
} from '../../engine/pricing/admin/masterPricingUiLogic';

const STATUS_PILL_CLASS: Record<AhspComponentSyncStatus, string> = {
  SYNCED: 'green',
  MASTER_PRICE_UPDATED: 'blue',
  PRICE_UNAVAILABLE: 'slate',
  UNIT_MISMATCH: 'red',
  ITEM_NOT_MAPPED: 'red',
  PRICE_CONFLICT: 'amber',
  NEEDS_VERIFICATION: 'amber',
  SNAPSHOT_LOCKED: 'purple',
  PROJECT_OVERRIDE: 'purple',
};

export function SyncStatusBadge({ status }: { status: AhspComponentSyncStatus }): React.ReactElement {
  const { label, description } = AHSP_COMPONENT_SYNC_STATUS_LABELS[status];
  return (
    <span className={`mpu-pill ${STATUS_PILL_CLASS[status]}`} title={description}>
      {label}
    </span>
  );
}

export interface AhspComponentDetailTableProps {
  item: NationalAHSPItem;
  composition: AhspUnitPriceComposition | null;
  context?: AhspComponentDetailContext;
}

export function AhspComponentDetailTable({ item, composition, context }: AhspComponentDetailTableProps): React.ReactElement {
  const details = useMemo(
    () => buildAhspItemComponentDetails(item, composition, context),
    [item, composition, context],
  );
  const unresolvedCount = details.filter((d) => isUnresolvedSyncStatus(d.syncStatus)).length;
  const syncedCount = details.filter((d) => d.syncStatus === 'SYNCED').length;

  if (details.length === 0) {
    return <div className="mpu-empty">Item ini tidak memiliki komponen.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mpu-muted">
        {details.length} komponen · {syncedCount} sinkron · {unresolvedCount} belum ter-resolve
        {composition === null ? ' · komposisi tidak tersedia — semua baris ditampilkan belum ter-resolve' : ''}
      </div>
      <div className="mpu-table-wrap">
        <table className="mpu-table">
          <thead>
            <tr>
              <th>Nama Komponen</th>
              <th>Kategori</th>
              <th className="mpu-num">Koefisien</th>
              <th>Satuan AHSP</th>
              <th>Item Master Kanonis</th>
              <th>Satuan Master</th>
              <th className="mpu-num">Harga Master</th>
              <th className="mpu-num">Harga Sumber AHSP</th>
              <th className="mpu-num">Selisih</th>
              <th>Provenance</th>
              <th>Update Terakhir</th>
              <th>Status Sinkronisasi</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d, i) => (
              <tr key={`${d.category}-${i}`} style={{ cursor: 'default' }} title={d.syncReason}>
                <td>
                  <b>{d.name}</b>
                  {d.unresolvedReason ? <div className="mpu-muted">{d.unresolvedReason}</div> : null}
                </td>
                <td>{d.categoryLabel}</td>
                <td className="mpu-num">{formatCoefficient(d.coefficient)}</td>
                <td>{d.ahspUnit}</td>
                <td>{d.canonicalMasterItem ?? '—'}</td>
                <td>{d.masterUnit ?? '—'}</td>
                <td className="mpu-num">
                  <b>{formatRupiah(d.resolvedMasterPrice)}</b>
                </td>
                <td className="mpu-num">{formatRupiah(d.originalAhspSourcePrice)}</td>
                <td className="mpu-num">{formatRupiahDelta(d.priceDifference)}</td>
                <td>
                  {d.provenance ?? '—'}
                  {d.verificationStatus ? <div className="mpu-muted">{d.verificationStatus}</div> : null}
                </td>
                <td>{formatDateId(d.lastUpdated)}</td>
                <td>
                  <SyncStatusBadge status={d.syncStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Section wrapper for embedding in the AHSP explorer detail modal. */
export function AhspComponentSyncSection({
  item,
  composition,
}: {
  item: NationalAHSPItem;
  composition: AhspUnitPriceComposition | null;
}): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '12.5px',
        background: 'var(--ez-color-surface)',
        padding: '14px 16px',
        borderRadius: 'var(--ez-radius-card)',
        border: '1px solid var(--ez-color-border-soft)',
      }}
    >
      <div
        style={{
          fontWeight: 800,
          color: 'var(--ez-color-text-primary)',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <Layers size={15} color="var(--ez-hue-blue-text)" />
        <span>Sinkronisasi Harga Master (§11.3)</span>
      </div>
      <div className="mpu-muted" style={{ marginBottom: 10 }}>
        Setiap komponen dibedakan status sinkronisasinya terhadap harga master. Status “Sinkron” hanya
        tampil bila item dan harganya ter-resolve.
      </div>
      <AhspComponentDetailTable item={item} composition={composition} />
    </div>
  );
}
