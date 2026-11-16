/**
 * MASTER PRICING §11.2 — AHSP DATABASE MANAGEMENT.
 *
 * Registry (per family: active version, version history), sync status
 * (live runtime catalog checksum vs the ACTIVE snapshot checksum),
 * version compare (real §8 `compareAhspSnapshots`), clone / publish /
 * rollback with live session-only previews, and Mode A direct edit
 * (checkpoint → impact → confirm → apply).
 *
 * Global writes are admin-only and the §4 gate denies them while server
 * enforcement is BLOCKED: every "Terapkan" is disabled with the honest
 * reason. Reads, previews, compare, checkpoint, impact and confirm are
 * LIVE — previews run the real §8 transitions on a COPY of the session
 * registry and are labeled session-only, never saved.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  GitBranch,
  History,
  Info,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  AHSP_FAMILIES,
  AHSP_FAMILY_DOMAINS,
  AHSP_VERSION_REASON_MIN_LENGTH,
  assessDirectEditImpact,
  cloneAhspItems,
  cloneVersion,
  compareAhspSnapshots,
  confirmDirectEdit,
  createCheckpoint,
  getVersionRecord,
  isValidVersionId,
  publishVersion,
  rollbackVersion,
  type AhspFamily,
  type AhspVersionCheckpoint,
  type AhspVersionImpact,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
  type DirectEditConfirmation,
} from '../../data/nationalCostDatabase/ahspVersioning';
import type { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import {
  ahspVersionWriteGate,
  AHSP_FAMILY_LABELS_ID,
  buildAhspRegistryViewModel,
  buildVersionCompareViewModel,
  checkAhspFamilySync,
  formatDateId,
  formatRupiah,
  type AhspFamilySyncResult,
  type VersionCompareViewModel,
} from '../../engine/pricing/admin/masterPricingUiLogic';
import { collectWorkspaceProjects } from '../../engine/pricing/impact/workspaceProjectCollector';
import type { VersionedAhspCatalogSource } from '../../engine/pricing/projectPriceModes';
import { AhspComponentDetailTable } from './AhspComponentDetail';
import { AhspVersionGateBanner } from './AdminGateBanner';
import { PriceUpdateConfirmDialog } from './PriceUpdateConfirmDialog';
import './masterPricing.css';

export interface AhspDatabaseViewProps {
  registry: AhspVersionRegistryState;
  catalogSource: VersionedAhspCatalogSource;
}

function suggestNextVersionId(activeVersionId: string): string {
  const m = /^(\d{4})\.(\d+)$/.exec(activeVersionId);
  if (!m) return '';
  return `${m[1]}.${Number(m[2]) + 1}`;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draf',
  ACTIVE: 'Aktif',
  SUPERSEDED: 'Digantikan',
};

export function AhspDatabaseView({ registry, catalogSource }: AhspDatabaseViewProps): React.ReactElement {
  const [family, setFamily] = useState<AhspFamily>('CIPTA_KARYA');
  const [sync, setSync] = useState<Record<AhspFamily, AhspFamilySyncResult | null> | null>(null);
  const [syncLoading, setSyncLoading] = useState(true);

  const viewModel = useMemo(() => buildAhspRegistryViewModel(registry), [registry]);
  const selected = useMemo(
    () => viewModel.find((v) => v.family === family) ?? viewModel[0],
    [viewModel, family],
  );

  const familyItems = useMemo(
    () => ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === AHSP_FAMILY_DOMAINS[family]),
    [family],
  );

  // Sync check for all four families (full-catalog checksums, ~1.4 s
  // total) — deferred so the UI paints first.
  useEffect(() => {
    setSyncLoading(true);
    const t = window.setTimeout(() => {
      const out = {} as Record<AhspFamily, AhspFamilySyncResult>;
      for (const fam of AHSP_FAMILIES) {
        const rec = getVersionRecord(registry, fam, registry.active[fam]);
        out[fam] = rec
          ? checkAhspFamilySync({ family: fam, record: rec, liveItems: ALL_OFFICIAL_AHSP_ITEMS })
          : {
              family: fam,
              status: 'UNKNOWN' as const,
              recordChecksum: '',
              liveChecksum: null,
              liveItemCount: 0,
              detail: 'Tidak ada record aktif untuk keluarga ini.',
            };
      }
      setSync(out);
      setSyncLoading(false);
    }, 30);
    return () => window.clearTimeout(t);
  }, [registry]);

  // MASTER PRICING §12 (§11 BLOCKED #2 closed): each AHSP-version action
  // gates its OWN §4 operation — clone, publish, rollback, direct edit —
  // instead of one shared gate reusing EDIT_MASTER_PRICE. The decisions
  // are identical today (identity-based, denied while §4.1 is BLOCKED),
  // but the operation + label in each decision are now correct.
  const cloneGate = useMemo(() => ahspVersionWriteGate('CLONE_AHSP_VERSION'), []);
  const publishGate = useMemo(() => ahspVersionWriteGate('PUBLISH_AHSP_VERSION'), []);
  const rollbackGate = useMemo(() => ahspVersionWriteGate('ROLLBACK_AHSP_VERSION'), []);
  const applyGate = useMemo(() => ahspVersionWriteGate('EDIT_AHSP_ACTIVE'), []);

  // ---- Compare ----
  const [compareSource, setCompareSource] = useState('');
  const [compareTarget, setCompareTarget] = useState('');
  const [compareResult, setCompareResult] = useState<VersionCompareViewModel | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    setCompareSource(selected.activeVersionId);
    setCompareTarget(selected.activeVersionId);
    setCompareResult(null);
    setCompareError(null);
  }, [family, selected.activeVersionId]);

  const handleCompare = (): void => {
    setCompareError(null);
    setCompareResult(null);
    try {
      const sourceItems = catalogSource.getVersionItems(family, compareSource);
      if (sourceItems === null) {
        throw new Error(
          `Konten versi ${compareSource} tidak tersedia di sesi ini — snapshot versi lama belum dimuat (pekerjaan §13).`,
        );
      }
      const targetItems = catalogSource.getVersionItems(family, compareTarget);
      if (targetItems === null) {
        throw new Error(
          `Konten versi ${compareTarget} tidak tersedia di sesi ini — snapshot versi lama belum dimuat (pekerjaan §13).`,
        );
      }
      const diff = compareAhspSnapshots(
        { versionId: compareSource, items: sourceItems },
        { versionId: compareTarget, items: targetItems },
        AHSP_FAMILY_DOMAINS[family],
      );
      setCompareResult(buildVersionCompareViewModel(diff));
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Clone / publish / rollback previews (session-only) ----
  const [cloneNewId, setCloneNewId] = useState(() => suggestNextVersionId('2026.1'));
  const [cloneReason, setCloneReason] = useState('');
  const [clonePreview, setClonePreview] = useState<AhspVersionRecord | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [publishVersionId, setPublishVersionId] = useState('');
  const [publishReason, setPublishReason] = useState('');
  const [publishPreview, setPublishPreview] = useState<{
    published: boolean;
    record: AhspVersionRecord;
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [rollbackTargetId, setRollbackTargetId] = useState('');
  const [rollbackNewId, setRollbackNewId] = useState(() => suggestNextVersionId('2026.1'));
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackPreview, setRollbackPreview] = useState<AhspVersionRecord | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  useEffect(() => {
    setPublishVersionId(selected.activeVersionId);
    setRollbackTargetId(selected.activeVersionId);
    setPublishPreview(null);
    setRollbackPreview(null);
    setClonePreview(null);
  }, [family, selected.activeVersionId]);

  const handleClonePreview = (): void => {
    setCloneError(null);
    setClonePreview(null);
    try {
      const out = cloneVersion(registry, {
        family,
        sourceVersionId: selected.activeVersionId,
        newVersionId: cloneNewId.trim(),
        reason: cloneReason.trim(),
      });
      setClonePreview(out.record);
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePublishPreview = (): void => {
    setPublishError(null);
    setPublishPreview(null);
    try {
      const out = publishVersion(registry, {
        family,
        versionId: publishVersionId,
        reason: publishReason.trim(),
      });
      setPublishPreview({ published: out.published, record: out.record });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRollbackPreview = (): void => {
    setRollbackError(null);
    setRollbackPreview(null);
    try {
      const out = rollbackVersion(registry, {
        family,
        targetVersionId: rollbackTargetId,
        newVersionId: rollbackNewId.trim(),
        reason: rollbackReason.trim(),
      });
      setRollbackPreview(out.record);
    } catch (e) {
      setRollbackError(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Mode A direct edit ----
  const [itemQuery, setItemQuery] = useState('');
  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null);
  const [editComponentKey, setEditComponentKey] = useState<string | null>(null);
  const [editCoefficient, setEditCoefficient] = useState('');
  const [modeAReason, setModeAReason] = useState('');
  const [modeANewId, setModeANewId] = useState(() => suggestNextVersionId('2026.1'));
  const [checkpoint, setCheckpoint] = useState<AhspVersionCheckpoint | null>(null);
  const [impact, setImpact] = useState<AhspVersionImpact | null>(null);
  const [confirmation, setConfirmation] = useState<DirectEditConfirmation | null>(null);
  const [modeAError, setModeAError] = useState<string | null>(null);
  const [modeABusy, setModeABusy] = useState(false);
  const [modeADialogOpen, setModeADialogOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<readonly NationalAHSPItem[] | null>(null);

  const itemMatches = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (q === '') return [];
    return familyItems
      .filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.codeNormalized.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [familyItems, itemQuery]);

  const selectedItem = useMemo(
    () => familyItems.find((i) => i.code === selectedItemCode) ?? null,
    [familyItems, selectedItemCode],
  );

  const selectedComposition = useMemo(
    () => (selectedItem ? priceResolver2026.resolveAhspUnitPrice(selectedItem) : null),
    [selectedItem],
  );

  const handleModeACheckpointAndImpact = (): void => {
    if (!selectedItem || !editComponentKey) return;
    setModeAError(null);
    setConfirmation(null);
    const coef = Number(editCoefficient.replace(',', '.'));
    if (!Number.isFinite(coef) || coef < 0) {
      setModeAError('Koefisien baru harus berupa angka ≥ 0.');
      return;
    }
    if (modeAReason.trim().length < AHSP_VERSION_REASON_MIN_LENGTH) {
      setModeAError(`Alasan minimal ${AHSP_VERSION_REASON_MIN_LENGTH} karakter.`);
      return;
    }
    if (!isValidVersionId(modeANewId.trim())) {
      setModeAError('ID versi baru harus berbentuk YYYY.minor (mis. 2026.2).');
      return;
    }
    setModeABusy(true);
    window.setTimeout(() => {
      try {
        const [arrayType, indexStr] = editComponentKey.split('::');
        const index = Number(indexStr);
        const draft = cloneAhspItems(familyItems);
        const draftItem = draft.find((i) => i.code === selectedItem.code);
        if (!draftItem) throw new Error('Item terpilih tidak ditemukan di konten draf.');
        const arr =
          arrayType === 'labor'
            ? draftItem.laborComponents
            : arrayType === 'material'
              ? draftItem.materialComponents
              : draftItem.equipmentComponents;
        if (!arr[index]) throw new Error('Komponen terpilih tidak ditemukan di konten draf.');
        arr[index] = { ...arr[index], coefficient: coef };
        setDraftItems(draft);
        const cp = createCheckpoint(registry, { family, reason: modeAReason.trim() });
        setCheckpoint(cp);
        const collected = collectWorkspaceProjects();
        const assessed = assessDirectEditImpact(registry, {
          family,
          sourceVersionId: selected.activeVersionId,
          sourceItems: familyItems,
          targetVersionId: modeANewId.trim(),
          newItems: draft,
          projects: collected.projects,
        });
        setImpact(assessed);
        if (assessed.preview) {
          setModeADialogOpen(true);
        } else {
          setModeAError(
            `Dampak tidak dapat dihitung: ${assessed.note} — edit tidak dapat dikonfirmasi tanpa preview dampak yang terhitung.`,
          );
        }
      } catch (e) {
        setModeAError(e instanceof Error ? e.message : String(e));
      } finally {
        setModeABusy(false);
      }
    }, 30);
  };

  const handleModeAConfirm = (): void => {
    if (!checkpoint || !impact) return;
    setModeAError(null);
    try {
      const conf = confirmDirectEdit(registry, {
        checkpoint,
        impact,
        reason: modeAReason.trim(),
      });
      setConfirmation(conf);
      setModeADialogOpen(false);
    } catch (e) {
      setModeAError(e instanceof Error ? e.message : String(e));
    }
  };

  const resetModeA = (): void => {
    setCheckpoint(null);
    setImpact(null);
    setConfirmation(null);
    setDraftItems(null);
    setEditComponentKey(null);
    setEditCoefficient('');
    setModeAError(null);
  };

  return (
    <div className="mpu">
      <div className="mpu-head">
        <h1>Database AHSP</h1>
        <p>
          Registry versi AHSP 2026 per keluarga — versi aktif, riwayat versi, banding, clone, publish, rollback,
          dan edit langsung (Mode A). Konten versi bersifat immutable; setiap perubahan membuat versi baru.
        </p>
      </div>

      <AhspVersionGateBanner />

      <div className="mpu-grid cols-4">
        {viewModel.map((v) => {
          const s = sync?.[v.family];
          return (
            <div
              key={v.family}
              className="mpu-stat"
              onClick={() => setFamily(v.family)}
              style={{ cursor: 'pointer', borderColor: family === v.family ? '#2563EB' : undefined }}
              title={`Pilih keluarga ${v.familyLabel}`}
            >
              <div className="mpu-stat-label">{v.familyLabel}</div>
              <div className="mpu-stat-value" style={{ fontSize: 16 }}>
                Aktif: {v.activeVersionId}
              </div>
              <div className="mpu-stat-sub">
                {v.versionCount} versi{v.draftCount > 0 ? ` · ${v.draftCount} draf` : ''} ·{' '}
                {v.activeRecord ? `${v.activeRecord.itemCount.toLocaleString('id-ID')} item` : '—'}
              </div>
              <div style={{ marginTop: 6 }}>
                {syncLoading ? (
                  <span className="mpu-pill slate">Memeriksa sinkron…</span>
                ) : s ? (
                  <span
                    className={`mpu-pill ${s.status === 'SYNCED' ? 'green' : s.status === 'MISMATCH' ? 'red' : 'slate'}`}
                  >
                    {s.status === 'SYNCED'
                      ? 'Sinkron dengan snapshot'
                      : s.status === 'MISMATCH'
                        ? 'Tidak sinkron — runtime ≠ snapshot'
                        : 'Sinkron tidak diketahui'}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mpu-card">
        <h2>
          {selected.familyLabel} — versi aktif {selected.activeVersionId}
        </h2>
        {selected.activeRecord ? (
          <dl className="mpu-dl">
            <div>
              <dt>Status</dt>
              <dd>{STATUS_LABEL[selected.activeRecord.status] ?? selected.activeRecord.status}</dd>
            </div>
            <div>
              <dt>Item</dt>
              <dd>{selected.activeRecord.itemCount.toLocaleString('id-ID')}</dd>
            </div>
            <div>
              <dt>Checksum konten</dt>
              <dd>
                <code>{selected.activeRecord.contentChecksum}</code>
              </dd>
            </div>
            <div>
              <dt>Provenance konten</dt>
              <dd>{selected.activeRecord.contentProvenance}</dd>
            </div>
            <div>
              <dt>Snapshot</dt>
              <dd>
                <code>{selected.activeRecord.snapshotPath}</code>
              </dd>
            </div>
            <div>
              <dt>Dibuat</dt>
              <dd>{formatDateId(selected.activeRecord.createdAt)}</dd>
            </div>
            <div>
              <dt>Alasan</dt>
              <dd>{selected.activeRecord.reason}</dd>
            </div>
            <div>
              <dt>Live item keluarga</dt>
              <dd>
                {familyItems.length.toLocaleString('id-ID')} item di katalog runtime
                {sync?.[family] && !syncLoading ? ` — ${sync[family]!.detail}` : ''}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mpu-muted">Tidak ada record aktif untuk keluarga ini.</div>
        )}

        <h3 style={{ marginTop: 16 }}>
          <History size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          Riwayat versi
        </h3>
        <div className="mpu-table-wrap">
          <table className="mpu-table">
            <thead>
              <tr>
                <th>Versi</th>
                <th>Status</th>
                <th>Dibuat dari</th>
                <th className="mpu-num">Item</th>
                <th>Checksum</th>
                <th>Dibuat</th>
                <th>Alasan</th>
              </tr>
            </thead>
            <tbody>
              {selected.versions.map((v) => (
                <tr key={v.versionId} style={{ cursor: 'default' }}>
                  <td>
                    <b>{v.versionId}</b>
                  </td>
                  <td>
                    <span className={`mpu-pill ${v.status === 'ACTIVE' ? 'green' : v.status === 'DRAFT' ? 'amber' : 'slate'}`}>
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                  </td>
                  <td>{v.createdFrom ?? '—'}</td>
                  <td className="mpu-num">{v.itemCount.toLocaleString('id-ID')}</td>
                  <td>
                    <code>{v.contentChecksum.slice(0, 12)}…</code>
                  </td>
                  <td>{formatDateId(v.createdAt)}</td>
                  <td>{v.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {registry.history.length === 0 ? (
          <div className="mpu-muted" style={{ marginTop: 8 }}>
            Belum ada entri riwayat transisi di sesi ini — registry dibangun dari pointer baseline 2026.1
            (4 record ACTIVE, tanpa riwayat transisi tersimpan).
          </div>
        ) : (
          <div className="mpu-muted" style={{ marginTop: 8 }}>
            {registry.history.length} entri riwayat transisi tersimpan di sesi ini.
          </div>
        )}
      </div>

      <div className="mpu-card">
        <h2>
          <ArrowLeftRight size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          Bandingkan versi (compare §8)
        </h2>
        <div className="mpu-toolbar">
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
            Sumber
            <select
              className="mpu-select"
              value={compareSource}
              onChange={(e) => setCompareSource(e.target.value)}
              aria-label="Versi sumber"
            >
              {selected.versions.map((v) => (
                <option key={v.versionId} value={v.versionId}>
                  {v.versionId} ({STATUS_LABEL[v.status] ?? v.status})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
            Target
            <select
              className="mpu-select"
              value={compareTarget}
              onChange={(e) => setCompareTarget(e.target.value)}
              aria-label="Versi target"
            >
              {selected.versions.map((v) => (
                <option key={v.versionId} value={v.versionId}>
                  {v.versionId} ({STATUS_LABEL[v.status] ?? v.status})
                </option>
              ))}
            </select>
          </label>
          <button className="mpu-btn primary" onClick={handleCompare}>
            Bandingkan
          </button>
        </div>
        {compareError ? (
          <div className="mpu-banner red" style={{ marginTop: 10 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{compareError}</span>
          </div>
        ) : null}
        {compareResult ? (
          <div style={{ marginTop: 12 }}>
            <div className="mpu-grid cols-4">
              <div className="mpu-stat">
                <div className="mpu-stat-label">Ditambah</div>
                <div className="mpu-stat-value">{compareResult.added}</div>
              </div>
              <div className="mpu-stat">
                <div className="mpu-stat-label">Dihapus</div>
                <div className="mpu-stat-value">{compareResult.removed}</div>
              </div>
              <div className="mpu-stat">
                <div className="mpu-stat-label">Direvisi</div>
                <div className="mpu-stat-value">{compareResult.revised}</div>
              </div>
              <div className="mpu-stat">
                <div className="mpu-stat-label">Tidak berubah</div>
                <div className="mpu-stat-value">{compareResult.unchanged}</div>
              </div>
            </div>
            <div className="mpu-muted" style={{ marginTop: 6 }}>
              Sumber {compareResult.totalSource.toLocaleString('id-ID')} item · Target{' '}
              {compareResult.totalTarget.toLocaleString('id-ID')} item · {compareResult.fieldChanges} perubahan
              field · {compareResult.componentChanges} perubahan komponen.
            </div>
            {compareResult.revisedItems.length > 0 ? (
              <div className="mpu-table-wrap" style={{ marginTop: 10 }}>
                <table className="mpu-table">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama</th>
                      <th className="mpu-num">Harga lama</th>
                      <th className="mpu-num">Harga baru</th>
                      <th>Perubahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareResult.revisedItems.slice(0, 50).map((r) => (
                      <tr key={r.code} style={{ cursor: 'default' }}>
                        <td>
                          <b>{r.code}</b>
                        </td>
                        <td>{r.name}</td>
                        <td className="mpu-num">{formatRupiah(r.oldPrice)}</td>
                        <td className="mpu-num">{formatRupiah(r.newPrice)}</td>
                        <td>{r.diffNote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {compareResult.addedItems.length > 0 || compareResult.removedItems.length > 0 ? (
              <div className="mpu-muted" style={{ marginTop: 8 }}>
                {compareResult.addedItems.length > 0
                  ? `Ditambah: ${compareResult.addedItems.slice(0, 10).map((i) => i.code).join(', ')}${compareResult.addedItems.length > 10 ? ' …' : ''}`
                  : ''}
                {compareResult.removedItems.length > 0
                  ? ` Dihapus: ${compareResult.removedItems.slice(0, 10).map((i) => i.code).join(', ')}${compareResult.removedItems.length > 10 ? ' …' : ''}`
                  : ''}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mpu-grid cols-3">
        <div className="mpu-card">
          <h2>
            <Copy size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            Clone versi (Mode B)
          </h2>
          <div className="mpu-muted" style={{ marginBottom: 10 }}>
            Clone {selected.activeVersionId} menjadi draf baru dengan konten IDENTIK (checksum sama). Pointer
            aktif tidak bergerak; publish adalah langkah terpisah.
          </div>
          <label className="mpu-muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            ID versi baru
          </label>
          <input
            className="mpu-input"
            value={cloneNewId}
            onChange={(e) => setCloneNewId(e.target.value)}
            placeholder="2026.2"
            style={{ marginTop: 4, marginBottom: 8 }}
          />
          <label className="mpu-muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            Alasan (≥{AHSP_VERSION_REASON_MIN_LENGTH} karakter)
          </label>
          <textarea
            className="mpu-textarea"
            value={cloneReason}
            onChange={(e) => setCloneReason(e.target.value)}
            placeholder="Contoh: Draf revisi AHSP Cipta Karya 2026.2."
            style={{ marginTop: 4 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="mpu-btn" onClick={handleClonePreview}>
              Pratinjau
            </button>
            <button className="mpu-btn primary" disabled title={cloneGate.reason}>
              Terapkan clone
            </button>
          </div>
          <div className="mpu-muted" style={{ marginTop: 6 }}>
            Terapkan tidak tersedia: {cloneGate.reason}
          </div>
          {cloneError ? (
            <div className="mpu-banner red" style={{ marginTop: 10 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{cloneError}</span>
            </div>
          ) : null}
          {clonePreview ? (
            <div className="mpu-banner green" style={{ marginTop: 10 }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Pratinjau (sesi saja, tidak disimpan): draf <b>{clonePreview.versionId}</b> dari{' '}
                {clonePreview.createdFrom}, {clonePreview.itemCount.toLocaleString('id-ID')} item, checksum{' '}
                <code>{clonePreview.contentChecksum.slice(0, 12)}…</code>, snapshot{' '}
                <code>{clonePreview.snapshotPath}</code>.
              </span>
            </div>
          ) : null}
        </div>

        <div className="mpu-card">
          <h2>
            <GitBranch size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            Publish versi
          </h2>
          <div className="mpu-muted" style={{ marginBottom: 10 }}>
            {selected.draftCount === 0
              ? `Tidak ada draf untuk ${selected.familyLabel} — hanya versi aktif ${selected.activeVersionId}. Publish versi aktif adalah no-op idempotent (tidak mengubah apa pun).`
              : 'Publish draf: draf menjadi AKTIF, versi aktif lama menjadi SUPERSEDED, pointer bergerak.'}
          </div>
          <label className="mpu-muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            Versi yang dipublish
          </label>
          <select
            className="mpu-select"
            value={publishVersionId}
            onChange={(e) => setPublishVersionId(e.target.value)}
            style={{ marginTop: 4, marginBottom: 8, width: '100%' }}
          >
            {selected.versions.map((v) => (
              <option key={v.versionId} value={v.versionId}>
                {v.versionId} ({STATUS_LABEL[v.status] ?? v.status})
              </option>
            ))}
          </select>
          <label className="mpu-muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            Alasan (≥{AHSP_VERSION_REASON_MIN_LENGTH} karakter)
          </label>
          <textarea
            className="mpu-textarea"
            value={publishReason}
            onChange={(e) => setPublishReason(e.target.value)}
            placeholder="Contoh: Publish AHSP 2026.2 setelah verifikasi."
            style={{ marginTop: 4 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="mpu-btn" onClick={handlePublishPreview}>
              Pratinjau
            </button>
            <button className="mpu-btn primary" disabled title={publishGate.reason}>
              Terapkan publish
            </button>
          </div>
          <div className="mpu-muted" style={{ marginTop: 6 }}>
            Terapkan tidak tersedia: {publishGate.reason}
          </div>
          {publishError ? (
            <div className="mpu-banner red" style={{ marginTop: 10 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{publishError}</span>
            </div>
          ) : null}
          {publishPreview ? (
            <div className="mpu-banner green" style={{ marginTop: 10 }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Pratinjau (sesi saja, tidak disimpan):{' '}
                {publishPreview.published
                  ? `versi ${publishPreview.record.versionId} akan menjadi AKTIF; versi aktif lama menjadi SUPERSEDED.`
                  : `versi ${publishPreview.record.versionId} sudah AKTIF — publish adalah no-op idempotent, tidak ada perubahan dan tidak ada entri riwayat baru.`}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mpu-card">
          <h2>
            <RotateCcw size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            Rollback / recovery
          </h2>
          <div className="mpu-muted" style={{ marginBottom: 10 }}>
            Rollback membuat DRAF BARU berisi konten versi target (salinan rollback) — versi lama tidak pernah
            diaktifkan kembali secara langsung.
          </div>
          <label className="mpu-muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            Versi target rollback
          </label>
          <select
            className="mpu-select"
            value={rollbackTargetId}
            onChange={(e) => setRollbackTargetId(e.target.value)}
            style={{ marginTop: 4, marginBottom: 8, width: '100%' }}
          >
            {selected.versions.map((v) => (
              <option key={v.versionId} value={v.versionId}>
                {v.versionId} ({STATUS_LABEL[v.status] ?? v.status})
              </option>
            ))}
          </select>
          <label className="mpu-muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            ID versi baru
          </label>
          <input
            className="mpu-input"
            value={rollbackNewId}
            onChange={(e) => setRollbackNewId(e.target.value)}
            placeholder="2026.2"
            style={{ marginTop: 4, marginBottom: 8 }}
          />
          <label className="mpu-muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
            Alasan (≥{AHSP_VERSION_REASON_MIN_LENGTH} karakter)
          </label>
          <textarea
            className="mpu-textarea"
            value={rollbackReason}
            onChange={(e) => setRollbackReason(e.target.value)}
            placeholder="Contoh: Rollback ke 2026.1 karena kesalahan koefisien di 2026.2."
            style={{ marginTop: 4 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="mpu-btn" onClick={handleRollbackPreview}>
              Pratinjau
            </button>
            <button className="mpu-btn primary" disabled title={rollbackGate.reason}>
              Terapkan rollback
            </button>
          </div>
          <div className="mpu-muted" style={{ marginTop: 6 }}>
            Terapkan tidak tersedia: {rollbackGate.reason}
          </div>
          {rollbackError ? (
            <div className="mpu-banner red" style={{ marginTop: 10 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{rollbackError}</span>
            </div>
          ) : null}
          {rollbackPreview ? (
            <div className="mpu-banner green" style={{ marginTop: 10 }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Pratinjau (sesi saja, tidak disimpan): draf <b>{rollbackPreview.versionId}</b> berisi konten{' '}
                {rollbackPreview.createdFrom}, {rollbackPreview.itemCount.toLocaleString('id-ID')} item,
                provenance {rollbackPreview.contentProvenance}, checksum{' '}
                <code>{rollbackPreview.contentChecksum.slice(0, 12)}…</code>.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mpu-card">
        <h2>
          <Pencil size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
          Edit database aktif — Mode A (checkpoint → impact → confirm → apply)
        </h2>
        <div className="mpu-muted" style={{ marginBottom: 10 }}>
          Ubah satu koefisien komponen pada satu item {selected.familyLabel}. Alurnya: checkpoint versi aktif →
          hitung dampak nyata (§9) atas semua proyek workspace → konfirmasi dengan dialog dampak → terapkan
          sebagai versi baru. Langkah terapkan adalah tulis global dan saat ini tidak tersedia; checkpoint,
          dampak, dan konfirmasi berjalan penuh.
        </div>

        <div className="mpu-search" style={{ maxWidth: 480 }}>
          <Search size={16} style={{ color: 'var(--ez-color-text-muted)', flexShrink: 0 }} />
          <input
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            placeholder={`Cari item ${selected.familyLabel} (kode atau nama)…`}
            aria-label="Cari item AHSP untuk edit"
          />
        </div>
        {itemMatches.length > 0 ? (
          <div className="mpu-table-wrap" style={{ marginTop: 10 }}>
            <table className="mpu-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Uraian</th>
                  <th>Satuan</th>
                  <th className="mpu-num">Harga satuan</th>
                </tr>
              </thead>
              <tbody>
                {itemMatches.map((i) => (
                  <tr
                    key={i.id}
                    className={i.code === selectedItemCode ? 'selected' : ''}
                    onClick={() => {
                      setSelectedItemCode(i.code);
                      resetModeA();
                    }}
                  >
                    <td>
                      <b>{i.code}</b>
                    </td>
                    <td>{i.name}</td>
                    <td>{i.unit}</td>
                    <td className="mpu-num">{formatRupiah(i.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {itemQuery.trim() !== '' && itemMatches.length === 0 ? (
          <div className="mpu-muted" style={{ marginTop: 8 }}>
            Tidak ada item {selected.familyLabel} yang cocok dengan “{itemQuery.trim()}”.
          </div>
        ) : null}

        {selectedItem ? (
          <div style={{ marginTop: 14 }}>
            <h3>
              {selectedItem.code} — {selectedItem.name}
            </h3>
            <div className="mpu-muted" style={{ marginBottom: 10 }}>
              Satuan {selectedItem.unit} · Harga satuan live {formatRupiah(selectedItem.unitPrice)} · Pilih satu
              komponen untuk diubah koefisiennya.
            </div>

            <div className="mpu-table-wrap">
              <table className="mpu-table">
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th>Kode</th>
                    <th>Nama komponen</th>
                    <th>Satuan</th>
                    <th className="mpu-num">Koefisien</th>
                    <th className="mpu-num">Harga satuan</th>
                    <th className="mpu-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['labor', 'Upah', selectedItem.laborComponents],
                      ['material', 'Material', selectedItem.materialComponents],
                      ['equipment', 'Alat', selectedItem.equipmentComponents],
                    ] as const
                  ).flatMap(([arrayType, label, comps]) =>
                    comps.map((c, i) => {
                      const key = `${arrayType}::${i}`;
                      return (
                        <tr
                          key={`${selectedItem.id}-${key}`}
                          className={editComponentKey === key ? 'selected' : ''}
                          onClick={() => {
                            setEditComponentKey(key);
                            setEditCoefficient(String(c.coefficient));
                            setModeAError(null);
                          }}
                        >
                          <td>{label}</td>
                          <td>{c.code}</td>
                          <td>{c.name}</td>
                          <td>{c.unit}</td>
                          <td className="mpu-num">{c.coefficient}</td>
                          <td className="mpu-num">{formatRupiah(c.unitPrice)}</td>
                          <td className="mpu-num">{formatRupiah(c.total)}</td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>

            {editComponentKey ? (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="mpu-toolbar">
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                    Koefisien baru
                    <input
                      className="mpu-input"
                      value={editCoefficient}
                      onChange={(e) => setEditCoefficient(e.target.value)}
                      inputMode="decimal"
                      style={{ width: 140 }}
                    />
                  </label>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                    ID versi baru
                    <input
                      className="mpu-input"
                      value={modeANewId}
                      onChange={(e) => setModeANewId(e.target.value)}
                      style={{ width: 120 }}
                    />
                  </label>
                </div>
                <label style={{ fontWeight: 700, fontSize: 13 }}>
                  Alasan edit (≥{AHSP_VERSION_REASON_MIN_LENGTH} karakter — dicatat di checkpoint dan konfirmasi)
                </label>
                <textarea
                  className="mpu-textarea"
                  value={modeAReason}
                  onChange={(e) => setModeAReason(e.target.value)}
                  placeholder="Contoh: Koreksi koefisien pekerja berdasarkan SE DJBK terbaru."
                />
                <div>
                  <button
                    className="mpu-btn primary"
                    onClick={handleModeACheckpointAndImpact}
                    disabled={modeABusy}
                  >
                    <RefreshCw size={14} />{' '}
                    {modeABusy ? 'Menghitung dampak…' : 'Checkpoint & hitung dampak'}
                  </button>
                </div>
              </div>
            ) : null}

            {modeAError ? (
              <div className="mpu-banner red" style={{ marginTop: 12 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{modeAError}</span>
              </div>
            ) : null}

            {checkpoint ? (
              <div className="mpu-banner blue" style={{ marginTop: 12 }}>
                <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Checkpoint dibuat: {checkpoint.family} {checkpoint.versionId}, checksum{' '}
                  <code>{checkpoint.contentChecksum.slice(0, 12)}…</code>, {formatDateId(checkpoint.createdAt)}
                  . Konten draf ({draftItems?.length.toLocaleString('id-ID') ?? '—'} item) hanya ada di sesi ini.
                </span>
              </div>
            ) : null}

            {confirmation ? (
              <div className="mpu-banner green" style={{ marginTop: 12 }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div>
                    Edit dikonfirmasi (Mode A langkah 3 dari 4): {confirmation.family} → versi baru{' '}
                    <b>{modeANewId.trim()}</b>. Dampak {confirmation.impact.status};{' '}
                    {confirmation.impact.affectedAhspCodes
                      ? `${confirmation.impact.affectedAhspCodes.length} kode AHSP terdampak`
                      : 'kode terdampak tidak dihitung'}
                    {confirmation.impact.affectedLiveProjects
                      ? `; ${confirmation.impact.affectedLiveProjects.length} proyek live terdampak`
                      : ''}
                    .
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button className="mpu-btn primary" disabled title={applyGate.reason}>
                      Terapkan sebagai versi {modeANewId.trim()}
                    </button>
                    <span className="mpu-muted" style={{ marginLeft: 8 }}>
                      Terapkan tidak tersedia: {applyGate.reason}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <h3 style={{ marginTop: 18 }}>Detail komponen &amp; referensi harga master (§11.3)</h3>
            <AhspComponentDetailTable item={selectedItem} composition={selectedComposition} />
          </div>
        ) : null}
      </div>

      {modeADialogOpen && impact?.preview ? (
        <PriceUpdateConfirmDialog
          preview={impact.preview}
          operationLabel={`Konfirmasi edit AHSP ${selected.familyLabel} (Mode A)`}
          confirmLabel="Konfirmasi edit"
          confirmDisabledReason={null}
          onConfirm={handleModeAConfirm}
          onClose={() => setModeADialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
