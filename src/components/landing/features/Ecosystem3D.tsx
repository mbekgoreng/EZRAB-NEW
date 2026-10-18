/**
 * Ecosystem3D — pembungkus React untuk EcosystemScene.
 * Label HTML tajam, kartu info hover, panel detail klik, kontrol,
 * fallback non-WebGL, mode ringkas untuk mobile, hormati reduced-motion.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCcw, Play, Pause, ArrowRight, MousePointerClick } from 'lucide-react';
import { EcosystemScene, ECO_NODES } from './ecosystemScene';

interface Props {
  onOpenWorkspace: () => void;
  onExploreFeatures: () => void;
}

const TIER_LABEL: Record<string, string> = {
  ai: 'AI',
  core: 'Proses Inti',
  data: 'Data Referensi',
  output: 'Output',
};

const TIER_COLOR: Record<string, string> = {
  ai: '#a855f7',
  core: '#3b82f6',
  data: '#14b8a6',
  output: '#f59e0b',
};

const roleLine = (tier: string, role: string) => {
  const t = TIER_LABEL[tier] || tier;
  return t.toLowerCase() === role.toLowerCase() ? t : `${t} · ${role}`;
};

export const Ecosystem3D: React.FC<Props> = ({ onOpenWorkspace, onExploreFeatures }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EcosystemScene | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<{ id: string; x: number; y: number; visible: boolean }[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [compact, setCompact] = useState(false);
  const [motionReduced, setMotionReduced] = useState(false);
  const [visible, setVisible] = useState(false);

  const nodeById = useCallback((id: string | null) => ECO_NODES.find((n) => n.id === id) ?? null, []);
  const hovered = nodeById(hoveredId);
  const selected = nodeById(selectedId);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setMotionReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Mount scene saat terlihat (lazy) — hemat resource
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !mountRef.current || sceneRef.current) return;
    let scene: EcosystemScene | null = null;
    try {
      scene = new EcosystemScene(mountRef.current, {
        onHoverNode: setHoveredId,
        onSelectNode: setSelectedId,
        onProjectLabels: setLabels,
      });
      const ok = scene.init();
      if (!ok) {
        setWebglOk(false);
        scene = null;
        return;
      }
      sceneRef.current = scene;
    } catch {
      setWebglOk(false);
      scene = null;
      return;
    }

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener('resize', onResize);

    // Pause saat tab tidak aktif
    const onVis = () => {
      // scene mengelola RAF internal; resize memicu sinkronisasi ulang
      if (!document.hidden) sceneRef.current?.resize();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [visible]);

  const labelFor = (id: string) => labels.find((l) => l.id === id);
  const activeNode = selected || hovered;

  // ---- Fallback non-WebGL -------------------------------------------------
  if (!webglOk) {
    return (
      <div className="eco3d-fallback">
        <p className="eco3d-fallback-title">Ekosistem EZRAB</p>
        <div className="eco3d-fallback-grid">
          {ECO_NODES.map((n) => (
            <div key={n.id} className="eco3d-fallback-card" style={{ borderColor: TIER_COLOR[n.tier] }}>
              <div className="eco3d-fallback-name" style={{ color: TIER_COLOR[n.tier] }}>{n.name}</div>
              <div className="eco3d-fallback-desc">{n.desc}</div>
              <div className="eco3d-fallback-role">{n.role}</div>
            </div>
          ))}
        </div>
        <FlowSummary onOpenWorkspace={onOpenWorkspace} onExploreFeatures={onExploreFeatures} />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="eco3d-wrap">
      <div
        ref={mountRef}
        className="eco3d-canvas"
        style={{ height: compact ? 340 : 560 }}
        role="img"
        aria-label="Visualisasi 3D interaktif ekosistem EZRAB: gedung di tengah dikelilingi delapan modul yang saling terhubung"
      >
        {/* Label HTML */}
        {!compact && labels.map((l) => {
          const n = nodeById(l.id);
          if (!n || !l.visible) return null;
          const active = l.id === hoveredId || l.id === selectedId;
          return (
            <div
              key={l.id}
              className={`eco3d-label${active ? ' is-active' : ''}`}
              style={{ left: l.x, top: l.y, borderColor: TIER_COLOR[n.tier] }}
            >
              <span className="eco3d-label-dot" style={{ background: TIER_COLOR[n.tier] }} />
              {n.name}
            </div>
          );
        })}

        {/* Kartu info hover */}
        {activeNode && !compact && (
          <div className="eco3d-infocard">
            <div className="eco3d-infocard-role" style={{ color: TIER_COLOR[activeNode.tier] }}>
              {roleLine(activeNode.tier, activeNode.role)}
            </div>
            <div className="eco3d-infocard-name">{activeNode.name}</div>
            <div className="eco3d-infocard-desc">{activeNode.desc}</div>
            {!selected && (
              <div className="eco3d-infocard-hint">
                <MousePointerClick size={12} /> Klik untuk detail
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kontrol */}
      <div className="eco3d-controls">
        <button type="button" className="eco3d-btn" onClick={() => sceneRef.current?.resetView()}>
          <RotateCcw size={14} /> Reset tampilan
        </button>
        {!motionReduced && (
          <button type="button" className="eco3d-btn" onClick={() => sceneRef.current?.replay()}>
            <Play size={14} /> Putar ulang pembangunan
          </button>
        )}
        <span className="eco3d-legend">
          {Object.entries(TIER_LABEL).map(([k, v]) => (
            <span key={k} className="eco3d-legend-item">
              <span className="eco3d-legend-dot" style={{ background: TIER_COLOR[k] }} />
              {v}
            </span>
          ))}
        </span>
      </div>

      {/* Panel detail (klik node) */}
      {selected && (
        <div className="eco3d-detail">
          <div>
            <div className="eco3d-infocard-role" style={{ color: TIER_COLOR[selected.tier] }}>
              {roleLine(selected.tier, selected.role)}
            </div>
            <div className="eco3d-detail-name">{selected.name}</div>
            <p className="eco3d-detail-desc">{selected.desc}</p>
          </div>
          <div className="eco3d-detail-actions">
            <button type="button" className="eco3d-cta" onClick={onOpenWorkspace}>
              Coba EZRAB <ArrowRight size={15} />
            </button>
            <button type="button" className="eco3d-btn" onClick={() => { setSelectedId(null); sceneRef.current?.resetView(); }}>
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Mobile: daftar kartu vertikal */}
      {compact && (
        <div className="eco3d-mobile-list">
          {ECO_NODES.map((n) => (
            <button
              key={n.id}
              type="button"
              className="eco3d-mobile-card"
              style={{ borderLeftColor: TIER_COLOR[n.tier] }}
              onClick={onOpenWorkspace}
            >
              <div className="eco3d-mobile-name" style={{ color: TIER_COLOR[n.tier] }}>{n.name}</div>
              <div className="eco3d-mobile-desc">{n.desc}</div>
              <div className="eco3d-mobile-role">{roleLine(n.tier, n.role)}</div>
            </button>
          ))}
        </div>
      )}

      <FlowSummary onOpenWorkspace={onOpenWorkspace} onExploreFeatures={onExploreFeatures} />
    </div>
  );
};

const FlowSummary: React.FC<{ onOpenWorkspace: () => void; onExploreFeatures: () => void }> = ({
  onOpenWorkspace, onExploreFeatures,
}) => (
  <div className="eco3d-flow">
    <div className="eco3d-flow-steps">
      {['Pahami desain', 'Hitung volume', 'Susun estimasi', 'Periksa referensi harga', 'Hasilkan laporan'].map((s, i, arr) => (
        <React.Fragment key={s}>
          <span className="eco3d-flow-step">{s}</span>
          {i < arr.length - 1 && <span className="eco3d-flow-arrow">→</span>}
        </React.Fragment>
      ))}
    </div>
    <p className="eco3d-flow-note">
      Setiap tahap memakai peran berbeda — AI membaca dan mengusulkan, Anda meninjau dan memutuskan.
    </p>
    <div className="eco3d-flow-ctas">
      <button type="button" className="eco3d-cta" onClick={onOpenWorkspace}>
        Coba EZRAB <ArrowRight size={15} />
      </button>
      <button type="button" className="eco3d-btn" onClick={onExploreFeatures}>
        Jelajahi Fitur
      </button>
    </div>
  </div>
);

export default Ecosystem3D;
