/**
 * MASTER PRICING §10 UI — EXPLICIT ADOPTION FLOW.
 *
 * Preview → diff → reasoned approval → NEW estimate version → pin
 * moves. The preview is computed FRESH per session (`previewAdoption`
 * is session-scoped — the UI never reuses a preview from an earlier
 * session). Approval goes through `approveAdoption` (10 checks +
 * snapshot capture — §14) and persists via
 * `ProjectContext.applyAdoptionResult` (new version list + active
 * pointer; the old versions and live RAB items are untouched).
 *
 * Version-kind adoption loads its contents from the `VersionedAhspCatalogSource`
 * (the live catalog covers the ACTIVE version; pinned older versions
 * need snapshot contents — loading them from disk is §13's job, so a
 * missing pin content is reported honestly, never substituted).
 * Price-kind adoption needs the caller to supply the price-change set;
 * without one the UI says so plainly instead of inventing changes.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import {
  AHSP_FAMILY_DOMAINS,
  compareAhspSnapshots,
  computeAhspContentChecksum,
  type AhspFamily,
  type AhspVersionRegistryState,
} from '../../data/nationalCostDatabase/ahspVersioning';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import type { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import { MASTER_PRICE_VERSION } from '../../data/priceDatabase2026/types';
import {
  computeCatalogChecksum,
  computeProjectsFingerprint,
  resolveCurrentBaselinePrices,
  type CurrentImpactState,
  type MasterPriceChangeInput,
} from '../../engine/pricing/impact/masterPriceImpactPreview';
import {
  approveAdoption,
  previewAdoption,
  resolveEffectiveProjectPricingMode,
  type AdoptionPreview,
  type AdoptionResult,
  type VersionedAhspCatalogSource,
} from '../../engine/pricing/projectPriceModes';
import {
  AHSP_FAMILY_LABELS_ID,
  buildProjectImpactInput,
  familyAdoptionAvailability,
  formatRupiah,
  formatRupiahDelta,
  summarizeAdoptionPreview,
  validateAdoptionReason,
} from '../../engine/pricing/admin/masterPricingUiLogic';
import type { Project } from '../../types';
import './masterPricing.css';

export interface AdoptionFlowProps {
  project: Project;
  family: AhspFamily;
  registry: AhspVersionRegistryState;
  catalogSource: VersionedAhspCatalogSource;
  /** Price changes since the pin, when the caller has them (price-kind adoption). */
  priceChanges?: readonly MasterPriceChangeInput[];
  targetMasterPriceVersion?: string;
  onAdopted?: (result: AdoptionResult) => void;
}

type AdoptionKind = 'AHSP_VERSION_CHANGE' | 'MASTER_PRICE_CHANGE';

const ITEM_STATUS_LABEL: Record<string, string> = {
  REPRICED: 'Dihitung ulang',
  UNCHANGED: 'Tidak berubah',
  NEWLY_PRICED: 'Baru berharga',
  BECAME_UNPRICED: 'Jadi tak berharga',
  UNCOMPUTABLE: 'Tidak terhitung',
  SKIPPED: 'Dilewati',
};

export function AdoptionFlow({
  project,
  family,
  registry,
  catalogSource,
  priceChanges,
  targetMasterPriceVersion,
  onAdopted,
}: AdoptionFlowProps): React.ReactElement {
  const { allRabItems, projectPriceOverrides, estimateVersions, applyAdoptionResult } = useProject();
  const [kind, setKind] = useState<AdoptionKind>('AHSP_VERSION_CHANGE');
  const [adoption, setAdoption] = useState<AdoptionPreview | null>(null);
  // §14 need #2 — the catalog the current preview was priced against,
  // retained so approval can capture the per-component snapshot map.
  // Price kind: the live catalog. Version kind: target items for the
  // adopted family + live items for the rest.
  const [adoptionCatalogItems, setAdoptionCatalogItems] =
    useState<readonly NationalAHSPItem[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdoptionResult | null>(null);

  const versionsForProject = useMemo(
    () => estimateVersions.filter((v) => v.projectId === project.id),
    [estimateVersions, project.id],
  );

  const activeVersion = useMemo(() => {
    if (versionsForProject.length === 0) return null;
    if (project.activeEstimateVersionId) {
      const found = versionsForProject.find((v) => v.id === project.activeEstimateVersionId);
      if (found) return found;
    }
    const sorted = [...versionsForProject].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
    );
    return sorted[0] ?? null;
  }, [versionsForProject, project.activeEstimateVersionId]);

  const projectInput = useMemo(
    () =>
      buildProjectImpactInput({
        project,
        items: allRabItems.filter((i) => i.projectId === project.id),
        overrides: projectPriceOverrides.filter((o) => o.projectId === project.id),
        activeVersion,
      }),
    [project, allRabItems, projectPriceOverrides, activeVersion],
  );

  const effectiveMode = useMemo(
    () => resolveEffectiveProjectPricingMode(projectInput.pricingMode ?? null).mode,
    [projectInput.pricingMode],
  );

  const activeVersionId = registry.active[family];
  const availability = useMemo(
    () =>
      familyAdoptionAvailability({
        family,
        mode: effectiveMode,
        pinnedAhspDatabaseVersion: projectInput.pinnedAhspDatabaseVersion ?? null,
        activeVersionId,
        pinnedMasterPriceVersion: projectInput.pinnedMasterPriceVersion ?? null,
        masterPriceVersion: MASTER_PRICE_VERSION,
      }),
    [family, effectiveMode, projectInput, activeVersionId],
  );

  const reasonCheck = useMemo(() => validateAdoptionReason(reason), [reason]);
  const summary = useMemo(() => (adoption ? summarizeAdoptionPreview(adoption) : null), [adoption]);

  const canPreviewVersion = availability.canAdoptVersion;
  const canPreviewPrice =
    availability.canAdoptPrices && (priceChanges !== undefined && priceChanges.length > 0);

  const handleComputePreview = (): void => {
    setError(null);
    setAdoption(null);
    setAdoptionCatalogItems(null);
    setResult(null);
    setBusy(true);
    window.setTimeout(() => {
      try {
        if (kind === 'AHSP_VERSION_CHANGE') {
          const pin = projectInput.pinnedAhspDatabaseVersion ?? '2026.1';
          const sourceItems = catalogSource.getVersionItems(family, pin);
          if (sourceItems === null) {
            throw new Error(
              `Konten versi ${pin} untuk keluarga ${AHSP_FAMILY_LABELS_ID[family]} tidak tersedia di sesi ini — ` +
                'snapshot versi lama belum dimuat (pekerjaan §13). Preview tidak dapat dihitung tanpa konten pin.',
            );
          }
          const targetItems = catalogSource.getVersionItems(family, activeVersionId);
          if (targetItems === null) {
            throw new Error(
              `Konten versi aktif ${activeVersionId} tidak tersedia di sesi ini — preview tidak dapat dihitung.`,
            );
          }
          const diff = compareAhspSnapshots(
            { versionId: pin, items: sourceItems },
            { versionId: activeVersionId, items: targetItems },
            AHSP_FAMILY_DOMAINS[family],
          );
          const next = previewAdoption({
            project: projectInput,
            change: {
              kind: 'AHSP_VERSION_CHANGE',
              family,
              sourceVersionId: pin,
              targetVersionId: activeVersionId,
              sourceItems,
              targetItems,
              diff,
              sourceContentChecksum: computeAhspContentChecksum(sourceItems),
              targetContentChecksum: computeAhspContentChecksum(targetItems),
              registry,
            },
          });
          setAdoption(next);
          setAdoptionCatalogItems([
            ...ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain !== AHSP_FAMILY_DOMAINS[family]),
            ...targetItems,
          ]);
        } else {
          if (priceChanges === undefined || priceChanges.length === 0) {
            throw new Error(
              'Adopsi harga membutuhkan daftar perubahan harga master sejak pin — daftar itu belum tersedia ' +
                '(riwayat perubahan harga §4.4 belum memiliki entri perubahan).',
            );
          }
          const next = previewAdoption({
            project: projectInput,
            change: {
              kind: 'MASTER_PRICE_CHANGE',
              priceChanges,
              catalogItems: ALL_OFFICIAL_AHSP_ITEMS,
              targetMasterPriceVersion: targetMasterPriceVersion ?? MASTER_PRICE_VERSION,
            },
          });
          setAdoption(next);
          setAdoptionCatalogItems(ALL_OFFICIAL_AHSP_ITEMS);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const handleApprove = (): void => {
    if (!adoption) return;
    if (!reasonCheck.valid) {
      setError(reasonCheck.error);
      return;
    }
    setError(null);
    setBusy(true);
    window.setTimeout(() => {
      try {
        // Rebuild the CURRENT input fresh: approval refuses when the
        // project moved since the preview (fingerprint check).
        const currentInput = buildProjectImpactInput({
          project,
          items: allRabItems.filter((i) => i.projectId === project.id),
          overrides: projectPriceOverrides.filter((o) => o.projectId === project.id),
          activeVersion,
        });
        const versionChecksums: Record<string, string> = {};
        for (const fam of Object.keys(registry.active) as AhspFamily[]) {
          for (const rec of Object.values(registry.versions[fam])) {
            versionChecksums[`${fam}|${rec.versionId}`] = rec.contentChecksum;
          }
        }
        const currentState: CurrentImpactState = {
          activeVersions: registry.active,
          versionChecksums,
          masterPriceVersion: MASTER_PRICE_VERSION,
          projectsFingerprint: computeProjectsFingerprint([currentInput]),
        };
        if (adoption.changeKind === 'MASTER_PRICE_CHANGE') {
          currentState.catalogChecksum = computeCatalogChecksum(ALL_OFFICIAL_AHSP_ITEMS);
        }
        const outcome = approveAdoption({
          adoption,
          currentProjectInput: currentInput,
          project,
          versions: versionsForProject,
          reason: reason.trim(),
          currentState,
          registry,
          currentPrices:
            adoption.changeKind === 'MASTER_PRICE_CHANGE'
              ? resolveCurrentBaselinePrices(adoption.preview)
              : undefined,
          catalogItems: adoptionCatalogItems ?? undefined,
        });
        applyAdoptionResult(outcome);
        setResult(outcome);
        setAdoption(null);
        setAdoptionCatalogItems(null);
        setReason('');
        onAdopted?.(outcome);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="mpu-muted">
        <div>
          <b>Adopsi versi AHSP ({AHSP_FAMILY_LABELS_ID[family]}):</b> {availability.versionReason}
        </div>
        <div>
          <b>Adopsi harga master:</b> {availability.priceReason}
          {availability.canAdoptPrices && (priceChanges === undefined || priceChanges.length === 0)
            ? ' Daftar perubahannya belum tersedia, jadi preview adopsi harga belum dapat dihitung.'
            : ''}
        </div>
      </div>

      <div className="mpu-toolbar">
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
          <input
            type="radio"
            name={`adoption-kind-${project.id}`}
            checked={kind === 'AHSP_VERSION_CHANGE'}
            onChange={() => {
              setKind('AHSP_VERSION_CHANGE');
              setAdoption(null);
              setError(null);
            }}
            disabled={!canPreviewVersion}
          />
          Adopsi versi AHSP
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
          <input
            type="radio"
            name={`adoption-kind-${project.id}`}
            checked={kind === 'MASTER_PRICE_CHANGE'}
            onChange={() => {
              setKind('MASTER_PRICE_CHANGE');
              setAdoption(null);
              setError(null);
            }}
            disabled={!canPreviewPrice}
          />
          Adopsi harga master
        </label>
        <button
          className="mpu-btn primary"
          onClick={handleComputePreview}
          disabled={busy || (kind === 'AHSP_VERSION_CHANGE' ? !canPreviewVersion : !canPreviewPrice)}
        >
          <RefreshCw size={14} /> {busy ? 'Menghitung…' : 'Hitung preview adopsi'}
        </button>
      </div>

      <div className="mpu-muted">
        Preview dihitung segar untuk sesi ini dan hanya berlaku selama proyek tidak berubah — bila proyek, item,
        mode, atau override bergerak sesudah preview, persetujuan ditolak dan preview harus dihitung ulang.
      </div>

      {error ? (
        <div className="mpu-banner red">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="mpu-banner green">
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Adopsi disetujui dan dibekukan sebagai versi estimasi baru <b>{result.created.versionNumber}</b> (
            {result.created.label}). Total proyek {formatRupiah(result.oldGrandTotal)} →{' '}
            {formatRupiah(result.newGrandTotal)} ({formatRupiahDelta(result.deltaGrandTotal)}). Versi lama tidak
            diubah; pin aktif proyek kini menunjuk versi adopsi.
          </span>
        </div>
      ) : null}

      {adoption && summary ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mpu-grid cols-4">
            <div className="mpu-stat">
              <div className="mpu-stat-label">Total lama</div>
              <div className="mpu-stat-value">{formatRupiah(summary.oldGrandTotal)}</div>
            </div>
            <div className="mpu-stat">
              <div className="mpu-stat-label">Total baru (adopsi)</div>
              <div className="mpu-stat-value">{formatRupiah(summary.newGrandTotal)}</div>
            </div>
            <div className="mpu-stat">
              <div className="mpu-stat-label">Delta</div>
              <div className="mpu-stat-value">{formatRupiahDelta(summary.deltaGrandTotal)}</div>
            </div>
            <div className="mpu-stat">
              <div className="mpu-stat-label">Target pin</div>
              <div className="mpu-stat-value" style={{ fontSize: 15 }}>
                AHSP {summary.targetAhspDatabaseVersion} · Harga {summary.targetMasterPriceVersion}
              </div>
            </div>
          </div>

          {!summary.computable ? (
            <div className="mpu-banner red">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Adopsi tidak dapat disetujui:</strong> {summary.uncomputableCount} item tidak dapat
                dihitung ulang.
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
                  {summary.uncomputableReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 13.5 }}>
              Diff per item ({summary.listedImpactCount} item tercantum; item yang tidak berubah dihitung, tidak
              dicantumkan)
            </h3>
            {adoption.adoptedItemImpacts.length === 0 ? (
              <div className="mpu-muted">Tidak ada item yang berubah.</div>
            ) : (
              <div className="mpu-table-wrap">
                <table className="mpu-table">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Uraian</th>
                      <th>Status</th>
                      <th className="mpu-num">Harga satuan lama</th>
                      <th className="mpu-num">Harga satuan baru</th>
                      <th className="mpu-num">Jumlah lama</th>
                      <th className="mpu-num">Jumlah baru</th>
                      <th className="mpu-num">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adoption.adoptedItemImpacts.map((row) => (
                      <tr key={row.rabItemId} style={{ cursor: 'default' }} title={row.reason}>
                        <td>
                          <b>{row.code}</b>
                        </td>
                        <td>{row.description}</td>
                        <td>{ITEM_STATUS_LABEL[row.status] ?? row.status}</td>
                        <td className="mpu-num">{formatRupiah(row.oldUnitPrice)}</td>
                        <td className="mpu-num">{formatRupiah(row.newUnitPrice)}</td>
                        <td className="mpu-num">{formatRupiah(row.oldAmount)}</td>
                        <td className="mpu-num">{formatRupiah(row.newAmount)}</td>
                        <td className="mpu-num">{formatRupiahDelta(row.deltaAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontWeight: 700, fontSize: 13 }} htmlFor={`adoption-reason-${project.id}`}>
              Alasan persetujuan (minimal {reasonCheck.minLength} karakter — dicatat verbatim di versi baru)
            </label>
            <textarea
              id={`adoption-reason-${project.id}`}
              className="mpu-textarea"
              style={{ marginTop: 6 }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Adopsi AHSP 2026.2 setelah verifikasi perubahan koefisien oleh estimator."
            />
            <div className="mpu-muted" style={{ marginTop: 4 }}>
              {reasonCheck.length}/{reasonCheck.minLength} karakter
              {reasonCheck.error ? ` — ${reasonCheck.error}` : ''}
            </div>
          </div>

          <div className="mpu-banner blue">
            <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Persetujuan membuat versi estimasi BARU yang membekukan item hasil adopsi; versi lama tidak pernah
              diubah, dan mode + overhead/profit proyek tidak berubah — hanya pointer versi aktif yang pindah.
            </span>
          </div>

          <div>
            <button
              className="mpu-btn primary"
              onClick={handleApprove}
              disabled={busy || !summary.computable || !reasonCheck.valid}
            >
              {busy ? 'Memproses…' : 'Setujui adopsi'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
