/**
 * MASTER PRICING §11 — ADMIN CONSOLE.
 *
 * Three tabs over the §3–§10 engines:
 *   1. Database Master (§11.1) — priceMaster records, provenance,
 *      linked AHSP references, history, real §9 impact simulation.
 *   2. Database AHSP (§11.2) — version registry, sync, compare, clone /
 *      publish / rollback previews, Mode A direct edit.
 *   3. Mode & Adopsi Proyek (§10 UI) — per-project pricing mode picker
 *      + explicit adoption flow (fresh preview per session).
 *
 * The console owns the session registry state (built once from the
 * baseline pointer records) and the versioned catalog source (live
 * catalog as the ACTIVE version's content). It performs NO global
 * write: every global apply is disabled by the §4 admin gate while
 * server enforcement is BLOCKED (§4.1), and the banner says so.
 */
import React, { useMemo, useState } from 'react';
import { Coins, Database, GitBranch, Info } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import {
  ACTIVE_AHSP_VERSIONS,
  AHSP_VERSION_RECORDS,
} from '../../data/nationalCostDatabase/ahspVersionPointer.generated';
import {
  AHSP_FAMILIES,
  buildRegistryState,
  type AhspFamily,
} from '../../data/nationalCostDatabase/ahspVersioning';
import { MASTER_PRICE_VERSION } from '../../data/priceDatabase2026/types';
import {
  ADMIN_GATE_ENFORCEMENT_NOTE,
  AHSP_FAMILY_LABELS_ID,
} from '../../engine/pricing/admin/masterPricingUiLogic';
import { createVersionedCatalogSource } from '../../engine/pricing/projectPriceModes';
import { syncAdminGate } from '../../engine/pricing/sync/syncUiLogic';
import { AdoptionFlow } from './AdoptionFlow';
import { AhspDatabaseView } from './AhspDatabaseView';
import { MasterDatabaseView } from './MasterDatabaseView';
import { ProjectPricingModePicker } from './ProjectPricingModePicker';
import { SyncAdminCard } from './SyncAdminCard';
import './masterPricing.css';

type ConsoleTab = 'master' | 'ahsp' | 'projects';

const CONSOLE_TABS: Array<{
  id: ConsoleTab;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}> = [
  { id: 'master', label: 'Database Master', icon: Coins },
  { id: 'ahsp', label: 'Database AHSP', icon: Database },
  { id: 'projects', label: 'Mode & Adopsi Proyek', icon: GitBranch },
];

export function MasterPricingAdminView(): React.ReactElement {
  const [tab, setTab] = useState<ConsoleTab>('master');
  const [registry] = useState(() => buildRegistryState(AHSP_VERSION_RECORDS));
  const catalogSource = useMemo(
    () => createVersionedCatalogSource({ activeVersions: ACTIVE_AHSP_VERSIONS }),
    [],
  );

  const { projects, estimateVersions } = useProject();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [adoptionFamily, setAdoptionFamily] = useState<AhspFamily>('CIPTA_KARYA');

  // MASTER PRICING §13 — the sync admin gate (honest local identity:
  // DENIED while §4.1 is BLOCKED; the trigger is the CLI, not the
  // browser — the browser cannot run the pipeline).
  const syncGate = useMemo(() => syncAdminGate(), []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

  const projectPins = useMemo(() => {
    if (!selectedProject) return { ahsp: null as string | null, master: null as string | null };
    const versions = estimateVersions.filter((v) => v.projectId === selectedProject.id);
    let active = null;
    if (selectedProject.activeEstimateVersionId) {
      active = versions.find((v) => v.id === selectedProject.activeEstimateVersionId) ?? null;
    }
    if (!active && versions.length > 0) {
      active = [...versions].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
    }
    return {
      ahsp: active?.ahspDatabaseVersion ?? null,
      master: active?.masterPriceVersion ?? null,
    };
  }, [selectedProject, estimateVersions]);

  return (
    <div className="mpu">
      <div className="mpu-head">
        <h1>Harga Master &amp; AHSP</h1>
        <p>
          Konsol admin pricing terpusat — database master {MASTER_PRICE_VERSION} · AHSP 2026.1 (4 keluarga).
          Semua angka dihitung dari data dan mesin nyata; tidak ada angka contoh.
        </p>
      </div>

      <div className="mpu-banner amber">
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>Penegakan server belum aktif (§4.1 BLOCKED):</strong> {ADMIN_GATE_ENFORCEMENT_NOTE} Aksi tulis
          global (edit harga master, clone/publish/rollback AHSP, terapkan edit Mode A) ditampilkan tidak
          tersedia dengan alasan ini. Preview, banding, simulasi dampak, mode proyek, dan adopsi berjalan penuh.
        </span>
      </div>

      {/* MASTER PRICING §13 — sync trigger (CLI; the browser cannot run the pipeline). */}
      <SyncAdminCard gate={syncGate} />

      <div className="mpu-tabs">
        {CONSOLE_TABS.map((t) => (
          <button
            key={t.id}
            className={`mpu-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={18} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'master' ? <MasterDatabaseView /> : null}
      {tab === 'ahsp' ? <AhspDatabaseView registry={registry} catalogSource={catalogSource} /> : null}
      {tab === 'projects' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="mpu-card">
            <h2>Mode harga &amp; adopsi proyek</h2>
            <div className="mpu-muted" style={{ marginBottom: 12 }}>
              Pilih proyek untuk melihat mode harga efektifnya dan mengadopsi versi AHSP / harga master baru
              secara eksplisit. Adopsi membuat versi estimasi baru — versi lama dan item RAB live tidak pernah
              diubah.
            </div>
            <div className="mpu-toolbar">
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                Proyek
                <select
                  className="mpu-select"
                  value={selectedProject?.id ?? ''}
                  onChange={(e) => setSelectedProjectId(e.target.value || null)}
                  aria-label="Pilih proyek"
                  style={{ minWidth: 240 }}
                >
                  {projects.length === 0 ? <option value="">Tidak ada proyek</option> : null}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                Keluarga AHSP
                <select
                  className="mpu-select"
                  value={adoptionFamily}
                  onChange={(e) => setAdoptionFamily(e.target.value as AhspFamily)}
                  aria-label="Pilih keluarga AHSP"
                >
                  {AHSP_FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {AHSP_FAMILY_LABELS_ID[f]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedProject ? (
              <>
                <h3 style={{ marginTop: 16 }}>Mode harga proyek</h3>
                <ProjectPricingModePicker
                  project={selectedProject}
                  pinnedAhspDatabaseVersion={projectPins.ahsp}
                  pinnedMasterPriceVersion={projectPins.master}
                />
                <h3 style={{ marginTop: 20 }}>Adopsi eksplisit — {AHSP_FAMILY_LABELS_ID[adoptionFamily]}</h3>
                <AdoptionFlow
                  project={selectedProject}
                  family={adoptionFamily}
                  registry={registry}
                  catalogSource={catalogSource}
                />
              </>
            ) : (
              <div className="mpu-empty">Belum ada proyek di workspace ini.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MasterPricingAdminView;
