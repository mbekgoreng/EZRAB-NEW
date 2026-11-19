/**
 * MASTER PRICING §11.1 — MASTER DATABASE MANAGEMENT.
 *
 * Material / labor / equipment over the REAL priceMaster records
 * (452), with search + filters (category, verification status, §4.3
 * provenance, region), price history (§4.4 entries when provided),
 * source + provenance, regional pricing, verification status, linked
 * AHSP references (the §9 resource→component index), and a real §9
 * impact preview for a simulated price change.
 *
 * Global edits are admin-only: the edit/apply actions are gated by the
 * §4 authorization module and shown as unavailable with the honest
 * reason while server enforcement is BLOCKED. The impact simulation is
 * a READ — it always runs for real, and its confirmation dialog is the
 * §11.4 dialog with computed numbers.
 *
 * MASTER PRICING §12/§13 (P10): the confirm button is WIRED to the real
 * apply (`applyMasterPriceChange` in `engine/pricing/admin/
 * masterPriceApply.ts`) — gate → re-resolve → validate → §4.4 audit →
 * client-side overlay → §13 feed → resolver cache invalidation. The
 * apply is BROWSER-LOCAL until the server exists (see that module's
 * header): the table shows applied prices with an "admin (lokal)"
 * marker, and the history tables below render the local §4.4 audit
 * entries recorded by applies in this browser.
 */
import React, { useMemo, useState } from 'react';
import { Calculator, Database, HardHat, History, Info, Package, Search, Truck } from 'lucide-react';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { RESOURCE_PRICE_RECORDS } from '../../data/priceDatabase2026/priceMaster.generated';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import {
  applyAdminOverlayToRecords,
  getAdminMasterPriceOverlayEntry,
} from '../../data/priceDatabase2026/adminMasterPriceOverlay';
import { getSourceBindings } from '../../data/priceDatabase2026/sourceIdentityRegistry';
import type {
  PriceVerificationStatus,
  ResourcePriceRecord,
} from '../../data/priceDatabase2026/types';
import type { MasterPriceHistoryEntry } from '../../engine/pricing/admin/masterPriceHistory';
import { currentLocalIdentity } from '../../engine/pricing/admin/masterPriceAuthorization';
import {
  applyMasterPriceChange,
  loadLocalMasterPriceHistory,
} from '../../engine/pricing/admin/masterPriceApply';
import {
  buildHistoryRow,
  buildMasterRecordRow,
  filterMasterRecords,
  formatDateId,
  formatRupiah,
  linkedAhspReferencesForKey,
  masterRecordRegions,
  summarizeLinkedReferences,
  toMasterPriceChangeInput,
  validateProposedPrice,
  type MasterProvenanceLabel,
  type MasterRecordFilter,
} from '../../engine/pricing/admin/masterPricingUiLogic';
import { labelForRecord, MASTER_PROVENANCE_LABELS } from '../../engine/pricing/admin/provenanceLabels';
import {
  buildResourceComponentIndex,
  computeMasterPriceImpact,
  type MasterPriceImpactPreview,
} from '../../engine/pricing/impact/masterPriceImpactPreview';
import { collectWorkspaceProjects } from '../../engine/pricing/impact/workspaceProjectCollector';
import { AdminGateBanner, useAdminGate } from './AdminGateBanner';
import { PriceUpdateConfirmDialog } from './PriceUpdateConfirmDialog';
import './masterPricing.css';

type Tab = 'material' | 'labor' | 'equipment';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }> = [
  { id: 'material', label: 'Material', icon: Package },
  { id: 'labor', label: 'Upah', icon: HardHat },
  { id: 'equipment', label: 'Alat', icon: Truck },
];

const VERIFICATION_LABELS: Record<PriceVerificationStatus, string> = {
  VERIFIED: 'Terverifikasi',
  SOURCE_REPORTED: 'Dilaporkan sumber',
  NEEDS_REVIEW: 'Perlu tinjauan',
};

const PROVENANCE_LABELS_ID: Record<MasterProvenanceLabel, string> = {
  OFFICIAL_AHSP: 'AHSP Resmi',
  OFFICIAL_VERIFIED: 'Resmi Terverifikasi',
  MARKET_REFERENCE: 'Referensi Pasar',
  MANUAL: 'Manual',
  ASSUMPTION: 'Asumsi',
  PRICE_UNAVAILABLE: 'Harga Belum Tersedia',
  NEEDS_VERIFICATION: 'Perlu Verifikasi',
};

const ROW_LIMIT = 200;

export interface MasterDatabaseViewProps {
  initialTab?: 'MATERIALS' | 'LABOR' | 'EQUIPMENT' | 'PROJECT_PRICE';
  /** §4.4 history entries to render (empty in this environment — see the empty state). */
  historyEntries?: readonly MasterPriceHistoryEntry[];
  onNavigateToTab?: (tab: string) => void;
}

const TAB_MAP: Record<string, Tab> = {
  MATERIALS: 'material',
  LABOR: 'labor',
  EQUIPMENT: 'equipment',
  PROJECT_PRICE: 'material',
};

export function MasterDatabaseView({ initialTab, historyEntries }: MasterDatabaseViewProps): React.ReactElement {
  const [tab, setTab] = useState<Tab>(TAB_MAP[initialTab ?? 'MATERIALS'] ?? 'material');
  const [query, setQuery] = useState('');
  const [verification, setVerification] = useState<'ALL' | PriceVerificationStatus>('ALL');
  const [provenance, setProvenance] = useState<'ALL' | MasterProvenanceLabel>('ALL');
  const [region, setRegion] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposedPrice, setProposedPrice] = useState('');
  const [simError, setSimError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [preview, setPreview] = useState<MasterPriceImpactPreview | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collectorWarnings, setCollectorWarnings] = useState<string[]>([]);
  // MASTER PRICING §12/§13 (P10) — the pending apply + its local audit trail.
  const [pendingNewPrice, setPendingNewPrice] = useState<number | null>(null);
  const [localHistory, setLocalHistory] = useState<readonly MasterPriceHistoryEntry[]>(() =>
    loadLocalMasterPriceHistory(),
  );
  const [applyNotice, setApplyNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  );
  /** Bumped after an apply so the overlay-backed record list re-reads. */
  const [overlayTick, setOverlayTick] = useState(0);

  const editGate = useAdminGate('EDIT_MASTER_PRICE');

  // The generated master, with admin-applied prices overlaid (copies —
  // the generated records are never mutated). Re-read after each apply.
  const records = useMemo(
    () => applyAdminOverlayToRecords(RESOURCE_PRICE_RECORDS),
    [overlayTick],
  );
  const index = useMemo(() => buildResourceComponentIndex(ALL_OFFICIAL_AHSP_ITEMS), []);
  const regions = useMemo(() => masterRecordRegions(records), [records]);

  const counts = useMemo(() => {
    const byType = (t: string): number => records.filter((r) => r.resourceType === t).length;
    return {
      total: records.length,
      material: byType('material'),
      labor: byType('labor'),
      equipment: byType('equipment'),
      verified: records.filter((r) => r.verificationStatus === 'VERIFIED').length,
      needsReview: records.filter((r) => r.verificationStatus === 'NEEDS_REVIEW').length,
    };
  }, [records]);

  const filter: MasterRecordFilter = useMemo(
    () => ({ query, category: tab, verificationStatus: verification, provenance, region }),
    [query, tab, verification, provenance, region],
  );
  const filtered = useMemo(() => filterMasterRecords(records, filter), [records, filter]);
  const shown = useMemo(() => filtered.slice(0, ROW_LIMIT), [filtered]);

  const selected: ResourcePriceRecord | null = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );
  const selectedRow = useMemo(() => (selected ? buildMasterRecordRow(selected) : null), [selected]);
  /** The admin-applied overlay entry for the selected record, if one exists in this browser. */
  const selectedOverlay = useMemo(
    () => (selected ? getAdminMasterPriceOverlayEntry(selected.id) : null),
    [selected, overlayTick],
  );
  /** The selected record's GENERATED price (before any local admin apply). */
  const selectedGeneratedPrice = useMemo(
    () => RESOURCE_PRICE_RECORDS.find((r) => r.id === selectedId)?.price ?? null,
    [selectedId],
  );
  /** §4.4 history: server-provided entries (when the parent passes them) + local applies, newest first. */
  const mergedHistory = useMemo(() => {
    const byId = new Map<string, MasterPriceHistoryEntry>();
    for (const e of [...(historyEntries ?? []), ...localHistory]) {
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
    return [...byId.values()].sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
  }, [historyEntries, localHistory]);
  const selectedBindings = useMemo(
    () => (selected?.resourceId ? getSourceBindings(selected.resourceId) : []),
    [selected],
  );
  const selectedRefs = useMemo(
    () => (selected ? linkedAhspReferencesForKey(index, selected.resourceCode, selected.unit) : []),
    [index, selected],
  );
  const selectedRefSummary = useMemo(() => summarizeLinkedReferences(selectedRefs), [selectedRefs]);
  const selectedHistory = useMemo(() => {
    if (!selected) return [];
    return mergedHistory
      .filter((e) => e.priceRecordId === selected.id || (e.resourceId !== null && e.resourceId === selected.resourceId))
      .map(buildHistoryRow);
  }, [mergedHistory, selected]);

  const handleSimulate = (): void => {
    if (!selected) return;
    setSimError(null);
    setCollectorWarnings([]);
    const digits = proposedPrice.replace(/[^\d]/g, '');
    if (digits === '') {
      setSimError('Masukkan harga baru (angka rupiah).');
      return;
    }
    const newPrice = Number(digits);
    setComputing(true);
    window.setTimeout(() => {
      try {
        // The §9 effective-price model: the baseline is the price the
        // RESOLVER currently returns for this key — not the record's
        // own price (this record may not be the winning record).
        const resolution = priceResolver2026.resolveResourcePrice({
          resourceCode: selected.resourceCode,
          resourceName: selected.resourceName,
          resourceType: selected.resourceType,
          unit: selected.unit,
        });
        const oldPrice = resolution.status === 'RESOLVED' ? resolution.price : null;
        const check = validateProposedPrice(newPrice, oldPrice);
        if (!check.valid) {
          setSimError(check.error);
          return;
        }
        const change = toMasterPriceChangeInput({ record: selected, oldPrice, newPrice });
        const collected = collectWorkspaceProjects();
        setCollectorWarnings(collected.warnings);
        const computed = computeMasterPriceImpact({
          priceChanges: [change],
          catalogItems: ALL_OFFICIAL_AHSP_ITEMS,
          projects: collected.projects,
        });
        setPendingNewPrice(newPrice);
        setPreview(computed);
        setDialogOpen(true);
      } catch (e) {
        setSimError(e instanceof Error ? e.message : String(e));
      } finally {
        setComputing(false);
      }
    }, 30);
  };

  /**
   * MASTER PRICING §12/§13 (P10) — the real apply. The dialog's
   * confirm button is disabled while the §4 gate denies (the expected
   * state while AUTH_ENABLED=false), AND the apply service re-checks
   * the gate itself — a disabled button is never the only enforcement.
   * The ORIGINAL generated record is passed (not the overlaid copy):
   * the service re-resolves the live effective price at apply time.
   */
  const handleConfirmApply = (reason: string): void => {
    if (!selected || pendingNewPrice === null) return;
    const originalRecord =
      RESOURCE_PRICE_RECORDS.find((r) => r.id === selected.id) ?? selected;
    const result = applyMasterPriceChange({
      identity: currentLocalIdentity(),
      record: originalRecord,
      newPrice: pendingNewPrice,
      reason,
      affectedAhspReferences: preview?.affectedAhspReferences ?? [],
      affectedLivePriceProjects: preview?.affectedLivePriceProjects ?? [],
    });
    setDialogOpen(false);
    setPendingNewPrice(null);
    if (!result.ok) {
      setApplyNotice({ kind: 'error', text: `Perubahan harga TIDAK diterapkan: ${result.reason}` });
      return;
    }
    setLocalHistory(loadLocalMasterPriceHistory());
    setOverlayTick((t) => t + 1);
    setProposedPrice('');
    setPreview(null);
    const warnings =
      result.persistenceWarnings.length > 0 ? ` ${result.persistenceWarnings.join(' ')}` : '';
    const feedNote = result.feedEntry
      ? ' Feed perubahan harga §13 ikut tercatat.'
      : result.feedSkippedReason
        ? ` ${result.feedSkippedReason}`
        : '';
    setApplyNotice({
      kind: 'success',
      text:
        `Harga ${originalRecord.resourceName} diterapkan: ` +
        `${formatRupiah(result.previousAmount)} → ${formatRupiah(result.newAmount)} per ${originalRecord.unit}. ` +
        `Berlaku sebagai harga master di browser ini (proyek snapshot tidak berubah); ` +
        `jejak audit ${result.historyEntry.id} tercatat di riwayat bawah.${feedNote}${warnings}`,
    });
  };

  return (
    <div className="mpu">
      <div className="mpu-head">
        <h1>Database Harga Master</h1>
        <p>
          Harga material, upah &amp; alat — database master 2026 (versi harga master {counts.total} record). Semua
          angka di halaman ini berasal dari data master dan mesin resolusi, bukan angka contoh.
        </p>
      </div>

      <AdminGateBanner operation="EDIT_MASTER_PRICE" />

      {applyNotice ? (
        <div className={`mpu-banner ${applyNotice.kind === 'success' ? 'green' : 'red'}`}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}>{applyNotice.text}</span>
          <button
            className="mpu-btn"
            onClick={() => setApplyNotice(null)}
            aria-label="Tutup pemberitahuan"
            style={{ padding: '4px 10px' }}
          >
            Tutup
          </button>
        </div>
      ) : null}

      <div className="mpu-grid cols-4">
        <div className="mpu-stat">
          <div className="mpu-stat-label">Total record master</div>
          <div className="mpu-stat-value">{counts.total.toLocaleString('id-ID')}</div>
          <div className="mpu-stat-sub">priceMaster 2026.1</div>
        </div>
        <div className="mpu-stat">
          <div className="mpu-stat-label">Material · Upah · Alat</div>
          <div className="mpu-stat-value" style={{ fontSize: 16 }}>
            {counts.material} · {counts.labor} · {counts.equipment}
          </div>
          <div className="mpu-stat-sub">per kategori</div>
        </div>
        <div className="mpu-stat">
          <div className="mpu-stat-label">Terverifikasi</div>
          <div className="mpu-stat-value">{counts.verified}</div>
          <div className="mpu-stat-sub">dari {counts.total} record</div>
        </div>
        <div className="mpu-stat">
          <div className="mpu-stat-label">Perlu tinjauan</div>
          <div className="mpu-stat-value">{counts.needsReview}</div>
          <div className="mpu-stat-sub">provenance belum lengkap</div>
        </div>
      </div>

      <div className="mpu-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`mpu-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => {
              setTab(t.id);
              setSelectedId(null);
            }}
          >
            <t.icon size={18} /> {t.label}
            <span className="mpu-pill" style={{ marginLeft: 2 }}>
              {t.id === 'material' ? counts.material : t.id === 'labor' ? counts.labor : counts.equipment}
            </span>
          </button>
        ))}
      </div>

      <div className="mpu-toolbar">
        <div className="mpu-search">
          <Search size={16} style={{ color: 'var(--ez-color-text-muted)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, kode, atau ID resource…"
            aria-label="Cari record master"
          />
        </div>
        <select
          className="mpu-select"
          value={verification}
          onChange={(e) => setVerification(e.target.value as 'ALL' | PriceVerificationStatus)}
          aria-label="Filter status verifikasi"
        >
          <option value="ALL">Semua status verifikasi</option>
          <option value="VERIFIED">Terverifikasi</option>
          <option value="SOURCE_REPORTED">Dilaporkan sumber</option>
          <option value="NEEDS_REVIEW">Perlu tinjauan</option>
        </select>
        <select
          className="mpu-select"
          value={provenance}
          onChange={(e) => setProvenance(e.target.value as 'ALL' | MasterProvenanceLabel)}
          aria-label="Filter provenance"
        >
          <option value="ALL">Semua provenance</option>
          {MASTER_PROVENANCE_LABELS.map((label) => (
            <option key={label} value={label}>
              {PROVENANCE_LABELS_ID[label]}
            </option>
          ))}
        </select>
        <select
          className="mpu-select"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Filter wilayah"
        >
          <option value="ALL">Semua wilayah</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="mpu-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mpu-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="mpu-table">
            <thead>
              <tr>
                <th>Nama / Kode</th>
                <th>Satuan</th>
                <th className="mpu-num">Harga</th>
                <th>Wilayah</th>
                <th>Periode</th>
                <th>Verifikasi</th>
                <th>Provenance</th>
                <th className="mpu-num">Ref. AHSP</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((rec) => {
                const refs = linkedAhspReferencesForKey(index, rec.resourceCode, rec.unit);
                const label = labelForRecord(rec);
                const overlay = getAdminMasterPriceOverlayEntry(rec.id);
                return (
                  <tr
                    key={rec.id}
                    className={rec.id === selectedId ? 'selected' : ''}
                    onClick={() => {
                      setSelectedId(rec.id);
                      setProposedPrice('');
                      setSimError(null);
                      setPendingNewPrice(null);
                    }}
                  >
                    <td>
                      <b>{rec.resourceName}</b>
                      <div className="mpu-muted">
                        {rec.resourceCode}
                        {rec.resourceId ? ` · ${rec.resourceId}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className="mpu-pill">{rec.unit}</span>
                    </td>
                    <td className="mpu-num">
                      <b>{formatRupiah(rec.price)}</b>
                      {overlay ? (
                        <div className="mpu-muted">Harga admin (lokal)</div>
                      ) : null}
                    </td>
                    <td>{rec.location.provinceName ?? '—'}</td>
                    <td>{rec.period.label}</td>
                    <td>
                      <span
                        className={`mpu-pill ${rec.verificationStatus === 'VERIFIED' ? 'green' : rec.verificationStatus === 'NEEDS_REVIEW' ? 'amber' : 'slate'}`}
                      >
                        {VERIFICATION_LABELS[rec.verificationStatus]}
                      </span>
                    </td>
                    <td>{PROVENANCE_LABELS_ID[label]}</td>
                    <td className="mpu-num">{refs.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className="mpu-empty">Tidak ada record yang cocok dengan pencarian/filter.</div>
        ) : (
          <div className="mpu-muted" style={{ padding: '10px 16px' }}>
            Menampilkan {shown.length} dari {filtered.length} record
            {filtered.length > ROW_LIMIT ? ` (batasi ${ROW_LIMIT} baris — persempit pencarian untuk melihat sisanya)` : ''}.
            Klik baris untuk detail, referensi AHSP tertaut, riwayat, dan simulasi dampak.
          </div>
        )}
      </div>

      {selected && selectedRow ? (
        <div className="mpu-card">
          <h2>
            {selectedRow.resourceName} <span className="mpu-muted">· {selectedRow.resourceCode}</span>
          </h2>
          <div className="mpu-muted" style={{ marginBottom: 12 }}>
            ID record {selectedRow.id}
            {selectedRow.resourceId ? ` · Entitas kanonis ${selectedRow.resourceId}` : ' · Tanpa ikatan entitas kanonis'}
          </div>

          <dl className="mpu-dl">
            <div>
              <dt>Harga</dt>
              <dd>
                {formatRupiah(selectedRow.price)}
                {selectedOverlay && selectedGeneratedPrice !== null ? (
                  <div className="mpu-muted">
                    Harga master hasil generate: {formatRupiah(selectedGeneratedPrice)} · diterapkan admin
                    menjadi {formatRupiah(selectedOverlay.price)} pada{' '}
                    {formatDateId(selectedOverlay.changedAt)} (berlaku di browser ini; audit{' '}
                    {selectedOverlay.historyEntryId}).
                  </div>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Satuan</dt>
              <dd>
                {selectedRow.unit}
                {selectedRow.unitRaw !== selectedRow.unit ? ` (tertulis: ${selectedRow.unitRaw})` : ''}
              </dd>
            </div>
            <div>
              <dt>Wilayah</dt>
              <dd>{selectedRow.regionLabel}</dd>
            </div>
            <div>
              <dt>Periode</dt>
              <dd>{selectedRow.periodLabel}</dd>
            </div>
            <div>
              <dt>Sumber</dt>
              <dd>
                {selectedRow.sourceName}
                <div className="mpu-muted">
                  {selectedRow.sourceKey} · {selectedRow.sourceTier}
                </div>
              </dd>
            </div>
            <div>
              <dt>Dokumen sumber</dt>
              <dd>{selectedRow.sourceDocument ?? '—'}</dd>
            </div>
            <div>
              <dt>Status verifikasi</dt>
              <dd>{VERIFICATION_LABELS[selectedRow.verificationStatus]}</dd>
            </div>
            <div>
              <dt>Provenance (§4.3)</dt>
              <dd>
                {PROVENANCE_LABELS_ID[selectedRow.provenanceLabel]}
                <div className="mpu-muted">{selectedRow.provenanceExplanation}</div>
              </dd>
            </div>
            <div>
              <dt>Metode ikatan</dt>
              <dd>
                {selectedRow.matchMethod} · keyakinan {(selectedRow.matchConfidence * 100).toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt>Versi record</dt>
              <dd>
                v{selectedRow.version ?? '—'} · {selectedRow.status ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Jenis harga</dt>
              <dd>{selectedRow.priceType ?? '—'}</dd>
            </div>
            <div>
              <dt>Spesifikasi</dt>
              <dd>{selectedRow.specContext ?? '—'}</dd>
            </div>
          </dl>

          <h3 style={{ marginTop: 16 }}>
            <Database size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Sumber terikat (registry identitas sumber §3.2)
          </h3>
          {selectedBindings.length === 0 ? (
            <div className="mpu-muted">Tidak ada ikatan sumber terverifikasi untuk entitas ini.</div>
          ) : (
            <div className="mpu-table-wrap">
              <table className="mpu-table">
                <thead>
                  <tr>
                    <th>Dataset sumber</th>
                    <th>Kode sumber</th>
                    <th>Deskripsi asli</th>
                    <th>Satuan asli</th>
                    <th>Dokumen</th>
                    <th>Verifikasi</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBindings.map((b, i) => (
                    <tr key={`${b.sourceDataset}-${i}`} style={{ cursor: 'default' }}>
                      <td>{b.sourceDataset}</td>
                      <td>{b.sourceCode}</td>
                      <td>{b.originalDescription}</td>
                      <td>{b.originalUnit}</td>
                      <td>{b.sourceDocument ?? '—'}</td>
                      <td>{VERIFICATION_LABELS[b.verificationStatus]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ marginTop: 16 }}>
            Referensi AHSP tertaut ({selectedRefSummary.referenceCount} referensi komponen di{' '}
            {selectedRefSummary.itemCount} item)
          </h3>
          {selectedRefs.length === 0 ? (
            <div className="mpu-muted">
              Tidak ada komponen AHSP berkode yang memakai kunci ini. Komponen tanpa kode tidak dapat
              diatribusikan pada kunci harga (dihitung terpisah di preview dampak, tidak pernah ditebak).
            </div>
          ) : (
            <>
              <div className="mpu-muted" style={{ marginBottom: 8 }}>
                Per keluarga:{' '}
                {selectedRefSummary.byFamily.map((f) => `${f.family}: ${f.count}`).join(' · ')}
              </div>
              <div className="mpu-table-wrap">
                <table className="mpu-table">
                  <thead>
                    <tr>
                      <th>Kode AHSP</th>
                      <th>Item</th>
                      <th>Keluarga</th>
                      <th>Tipe</th>
                      <th className="mpu-num">Koefisien</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRefs.slice(0, 10).map((ref, i) => (
                      <tr key={`${ref.itemId}-${i}`} style={{ cursor: 'default' }}>
                        <td>
                          <b>{ref.itemCode}</b>
                        </td>
                        <td>{ref.itemName}</td>
                        <td>{ref.family}</td>
                        <td>{ref.componentType}</td>
                        <td className="mpu-num">{ref.coefficient}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedRefs.length > 10 ? (
                <div className="mpu-muted" style={{ marginTop: 6 }}>
                  Menampilkan 10 dari {selectedRefs.length} referensi.
                </div>
              ) : null}
            </>
          )}

          <h3 style={{ marginTop: 16 }}>
            <History size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Riwayat harga record ini
          </h3>
          {selectedHistory.length === 0 ? (
            <div className="mpu-muted">
              Belum ada entri riwayat perubahan untuk record ini. Jejak audit interim (§4.4) tersimpan di{' '}
              <code>data/price2026/reports/master_price_history.jsonl</code>; tabel server{' '}
              <code>master_price_history</code> belum diterapkan (migrasi NOT APPLIED).
            </div>
          ) : (
            <div className="mpu-table-wrap">
              <table className="mpu-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Operasi</th>
                    <th className="mpu-num">Harga lama</th>
                    <th className="mpu-num">Harga baru</th>
                    <th>Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedHistory.map((h) => (
                    <tr key={h.id} style={{ cursor: 'default' }}>
                      <td>{formatDateId(h.changedAt)}</td>
                      <td>{h.operationLabel}</td>
                      <td className="mpu-num">{formatRupiah(h.previousAmount)}</td>
                      <td className="mpu-num">{formatRupiah(h.newAmount)}</td>
                      <td>{h.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ marginTop: 16 }}>
            <Calculator size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Simulasikan dampak perubahan harga
          </h3>
          <div className="mpu-muted" style={{ marginBottom: 8 }}>
            Simulasi menghitung dampak NYATA dari harga efektif saat ini (hasil resolver untuk kunci ini, bukan
            harga record ini semata) ke semua item AHSP dan proyek workspace — tanpa mengubah apa pun.{' '}
            {editGate.allowed
              ? 'Konfirmasi menerapkan harga baru sebagai harga master di browser ini (overlay lokal + jejak audit §4.4); proyek snapshot tidak berubah.'
              : 'Menerapkan perubahan adalah aksi admin global dan saat ini tidak tersedia.'}
          </div>
          <div className="mpu-toolbar">
            <input
              className="mpu-input"
              value={proposedPrice}
              onChange={(e) => setProposedPrice(e.target.value)}
              placeholder={`Harga baru (saat ini ${formatRupiah(selectedRow.price)})`}
              inputMode="numeric"
              aria-label="Harga baru untuk simulasi"
              style={{ minWidth: 220 }}
            />
            <button className="mpu-btn primary" onClick={handleSimulate} disabled={computing}>
              <Calculator size={14} /> {computing ? 'Menghitung…' : 'Hitung dampak'}
            </button>
          </div>
          {simError ? (
            <div className="mpu-banner red" style={{ marginTop: 10 }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{simError}</span>
            </div>
          ) : null}
          {collectorWarnings.length > 0 ? (
            <div className="mpu-banner amber" style={{ marginTop: 10 }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Perhatian pengumpulan proyek:</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
                  {collectorWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mpu-card">
        <h2>Riwayat harga master (§4.4)</h2>
        {mergedHistory.length === 0 ? (
          <div className="mpu-muted">
            Belum ada entri riwayat perubahan harga di sesi ini. Jejak audit interim (§4.4) tersimpan di{' '}
            <code>data/price2026/reports/master_price_history.jsonl</code> dan ditulis per regenerasi pipeline;
            tabel server <code>master_price_history</code> belum diterapkan (migrasi NOT APPLIED), sehingga belum
            ada riwayat perubahan yang dapat ditampilkan dari server. Perubahan harga yang diterapkan admin di
            browser ini tercatat di tabel ini (tersimpan lokal).
          </div>
        ) : (
          <div className="mpu-table-wrap">
            <table className="mpu-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Operasi</th>
                  <th>Resource</th>
                  <th className="mpu-num">Harga lama</th>
                  <th className="mpu-num">Harga baru</th>
                  <th>Alasan</th>
                </tr>
              </thead>
              <tbody>
                {mergedHistory.map(buildHistoryRow).map((h) => (
                  <tr key={h.id} style={{ cursor: 'default' }}>
                    <td>{formatDateId(h.changedAt)}</td>
                    <td>{h.operationLabel}</td>
                    <td>{h.resourceId ?? '—'}</td>
                    <td className="mpu-num">{formatRupiah(h.previousAmount)}</td>
                    <td className="mpu-num">{formatRupiah(h.newAmount)}</td>
                    <td>{h.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogOpen && preview ? (
        <PriceUpdateConfirmDialog
          preview={preview}
          operationLabel="Konfirmasi update harga master"
          confirmLabel="Terapkan update harga"
          confirmDisabledReason={editGate.allowed ? null : editGate.reason}
          requireReason
          onConfirm={handleConfirmApply}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
