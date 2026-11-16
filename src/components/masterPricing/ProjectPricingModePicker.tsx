/**
 * MASTER PRICING §10 UI — PROJECT PRICING MODE PICKER.
 *
 * Renders the project's effective pricing mode (§10 (a)) and lets the
 * user change it. The change itself is PROJECT-scoped policy (not a
 * global master write), so it persists through `ProjectContext` via
 * `setProjectPricingMode` + `updateProject`. Switching TO snapshot does
 * not itself pin a version — the pin lives on the project's ACTIVE
 * estimate version, shown here alongside the mode.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import type { ProjectPricingMode } from '../../data/priceDatabase2026/types';
import { PROJECT_PRICING_MODES } from '../../data/priceDatabase2026/types';
import {
  effectiveProjectPricingState,
  setProjectPricingMode,
} from '../../engine/pricing/projectPriceModes';
import {
  PRICING_MODE_LABELS_ID,
} from '../../engine/pricing/admin/masterPricingUiLogic';
import type { Project } from '../../types';
import './masterPricing.css';

export interface ProjectPricingModePickerProps {
  project: Project;
  pinnedAhspDatabaseVersion: string | null;
  pinnedMasterPriceVersion: string | null;
  onModeChanged?: (project: Project) => void;
}

export function ProjectPricingModePicker({
  project,
  pinnedAhspDatabaseVersion,
  pinnedMasterPriceVersion,
  onModeChanged,
}: ProjectPricingModePickerProps): React.ReactElement {
  const { updateProject } = useProject();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const state = useMemo(
    () =>
      effectiveProjectPricingState({
        pricingMode: project.pricingMode ?? null,
        pinnedAhspDatabaseVersion,
        pinnedMasterPriceVersion,
      }),
    [project.pricingMode, pinnedAhspDatabaseVersion, pinnedMasterPriceVersion],
  );

  const handleSelect = (mode: ProjectPricingMode): void => {
    if (mode === state.mode) return;
    setError(null);
    setNotice(null);
    try {
      const next = setProjectPricingMode(project, mode);
      updateProject(project.id, { pricingMode: next.pricingMode });
      setNotice(
        `Mode harga proyek diubah ke “${PRICING_MODE_LABELS_ID[mode].label}”.` +
          (mode === 'SNAPSHOT_PRICE'
            ? ' Pin versi tidak berubah — mode snapshot memakai pin dari versi estimasi aktif.'
            : ''),
      );
      onModeChanged?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="mpu-muted">
        Mode efektif saat ini: <b>{PRICING_MODE_LABELS_ID[state.mode].label}</b>{' '}
        {state.modeSource === 'DEFAULT_SNAPSHOT'
          ? '(default snapshot — proyek lama tanpa mode tercatat; tidak pernah ditulis ulang diam-diam)'
          : '(tercatat di proyek)'}
        <br />
        Pin AHSP: <b>{state.pinnedAhspDatabaseVersion}</b>{' '}
        {state.pinSource === 'LEGACY_DEFAULT' ? '(default legacy — tanpa pin tercatat)' : '(tercatat)'} · Pin harga
        master: <b>{state.pinnedMasterPriceVersion}</b>{' '}
        {state.masterPinSource === 'LEGACY_DEFAULT' ? '(default legacy)' : '(tercatat)'}
      </div>

      <div className="mpu-grid cols-2">
        {PROJECT_PRICING_MODES.map((mode) => {
          const labels = PRICING_MODE_LABELS_ID[mode];
          const selected = mode === state.mode;
          return (
            <label key={mode} className={`mpu-radio-card ${selected ? 'selected' : ''}`}>
              <input
                type="radio"
                name={`pricing-mode-${project.id}`}
                checked={selected}
                onChange={() => handleSelect(mode)}
              />
              <span>
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>{labels.label}</span>
                <span className="mpu-muted" style={{ display: 'block', marginTop: 2 }}>
                  {labels.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mpu-banner blue">
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Mode harga adalah kebijakan per proyek, bukan perubahan harga global. Proyek SNAPSHOT tidak pernah berubah
          harganya tanpa adopsi eksplisit; proyek OVERRIDE memakai harga proyek per komponen.
        </span>
      </div>

      {notice ? (
        <div className="mpu-banner green">
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{notice}</span>
        </div>
      ) : null}
      {error ? (
        <div className="mpu-banner red">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
