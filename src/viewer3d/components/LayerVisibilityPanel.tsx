import React from 'react';
import { ViewerLayerType } from '../types';
import { Eye, EyeOff, CheckSquare, Square } from 'lucide-react';

export interface LayerVisibilityPanelProps {
  visibleLayers: Record<ViewerLayerType, boolean>;
  layerCounts?: Record<ViewerLayerType, number>;
  onToggleLayer: (layer: ViewerLayerType) => void;
  onSetAllLayers: (visible: boolean) => void;
  onClose?: () => void;
}

const LAYER_LABELS: Record<ViewerLayerType, { label: string; color: string }> = {
  FOUNDATION: { label: '01. Pondasi Batu Kali', color: '#64748B' },
  STRUCTURE: { label: '02. Struktur (Sloof, Kolom, Balok)', color: '#0284C7' },
  WALLS: { label: '03. Pasangan Dinding Hebel', color: '#E2E8F0' },
  OPENINGS: { label: '04. Kusen Pintu & Jendela', color: '#D97706' },
  ROOF: { label: '05. Rangka & Penutup Atap', color: '#DC2626' },
  SLAB: { label: '06. Pelat Lantai 2', color: '#0284C7' },
  FINISHES: { label: '07. Plafon & Finishing', color: '#F8FAFC' },
  INFRASTRUCTURE: { label: '08. Infrastruktur Jalan', color: '#10B981' },
  DRAINAGE: { label: '09. Saluran Drainase', color: '#06B6D4' },
  GRID: { label: '10. Grid As Bangunan', color: '#38BDF8' },
};

export const LayerVisibilityPanel: React.FC<LayerVisibilityPanelProps> = ({
  visibleLayers,
  layerCounts,
  onToggleLayer,
  onSetAllLayers,
}) => {
  return (
    <div className="absolute top-14 right-3 z-20 w-64 bg-[#0F172A]/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl p-3.5 text-white text-xs select-none">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 font-semibold">
        <span>Lapisan Model (BIM Layers)</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => onSetAllLayers(true)}
            className="text-[10px] text-[#38BDF8] hover:underline"
            title="Tampilkan Semua"
          >
            Semua
          </button>
          <span className="text-white/20">|</span>
          <button
            onClick={() => onSetAllLayers(false)}
            className="text-[10px] text-[#94A3B8] hover:underline"
            title="Sembunyikan Semua"
          >
            Sembunyi
          </button>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
        {(Object.keys(LAYER_LABELS) as ViewerLayerType[]).map((layer) => {
          const isVisible = visibleLayers[layer] ?? true;
          const count = layerCounts?.[layer] ?? 0;
          const { label, color } = LAYER_LABELS[layer];

          if (layerCounts && count === 0 && layer !== 'GRID') {
            return null; // Don't show empty layers for this specific template
          }

          return (
            <div
              key={layer}
              onClick={() => onToggleLayer(layer)}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                isVisible ? 'bg-[#1E293B] hover:bg-[#334155]' : 'bg-[#1E293B]/40 opacity-50 hover:opacity-80'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{label}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-[#94A3B8]">
                {count > 0 && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{count}</span>}
                {isVisible ? <Eye className="w-3.5 h-3.5 text-[#38BDF8]" /> : <EyeOff className="w-3.5 h-3.5" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
