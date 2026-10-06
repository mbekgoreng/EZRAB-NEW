import React from 'react';
import { RenderMode, CameraPreset } from '../types';
import { Box, Layers, Eye, RefreshCw, Compass, Maximize2 } from 'lucide-react';

export interface ViewerToolbarProps {
  renderMode: RenderMode;
  onRenderModeChange: (mode: RenderMode) => void;
  cameraPreset: CameraPreset;
  onCameraPresetChange: (preset: CameraPreset) => void;
  onResetCamera: () => void;
  isLayerPanelOpen: boolean;
  onToggleLayerPanel: () => void;
  isInspectorOpen: boolean;
  onToggleInspector: () => void;
}

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  renderMode,
  onRenderModeChange,
  cameraPreset,
  onCameraPresetChange,
  onResetCamera,
  isLayerPanelOpen,
  onToggleLayerPanel,
  isInspectorOpen,
  onToggleInspector,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#0F172A] border-b border-white/10 text-white text-xs">
      {/* Render Mode Switcher */}
      <div className="flex items-center gap-1 bg-[#1E293B] p-1 rounded-lg border border-white/5">
        <button
          onClick={() => onRenderModeChange('SOLID')}
          className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
            renderMode === 'SOLID' ? 'bg-[#2563EB] text-white shadow' : 'text-[#94A3B8] hover:text-white'
          }`}
          title="Mode Solid Shaded"
        >
          <Box className="w-3.5 h-3.5" />
          <span>Solid</span>
        </button>
        <button
          onClick={() => onRenderModeChange('WIREFRAME')}
          className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
            renderMode === 'WIREFRAME' ? 'bg-[#2563EB] text-white shadow' : 'text-[#94A3B8] hover:text-white'
          }`}
          title="Mode Blueprint Wireframe"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Wireframe</span>
        </button>
        <button
          onClick={() => onRenderModeChange('TRANSPARENT')}
          className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
            renderMode === 'TRANSPARENT' ? 'bg-[#2563EB] text-white shadow' : 'text-[#94A3B8] hover:text-white'
          }`}
          title="Mode Transparan X-Ray"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>X-Ray</span>
        </button>
      </div>

      {/* Camera Presets */}
      <div className="flex items-center gap-1 bg-[#1E293B] p-1 rounded-lg border border-white/5">
        <button
          onClick={() => onCameraPresetChange('ISOMETRIC')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            cameraPreset === 'ISOMETRIC' ? 'bg-[#334155] text-white' : 'text-[#94A3B8] hover:text-white'
          }`}
          title="Sudut Isometrik 3D"
        >
          3D Iso
        </button>
        <button
          onClick={() => onCameraPresetChange('TOP')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            cameraPreset === 'TOP' ? 'bg-[#334155] text-white' : 'text-[#94A3B8] hover:text-white'
          }`}
          title="Tampak Atas (Denah)"
        >
          Atas
        </button>
        <button
          onClick={() => onCameraPresetChange('FRONT')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            cameraPreset === 'FRONT' ? 'bg-[#334155] text-white' : 'text-[#94A3B8] hover:text-white'
          }`}
          title="Tampak Depan"
        >
          Depan
        </button>
        <button
          onClick={() => onCameraPresetChange('RIGHT')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            cameraPreset === 'RIGHT' ? 'bg-[#334155] text-white' : 'text-[#94A3B8] hover:text-white'
          }`}
          title="Tampak Samping"
        >
          Samping
        </button>
      </div>

      {/* Action Buttons: Layers, Inspector, Reset */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleLayerPanel}
          className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 border ${
            isLayerPanelOpen
              ? 'bg-[#2563EB] border-[#3B82F6] text-white'
              : 'bg-[#1E293B] border-white/5 text-[#94A3B8] hover:text-white'
          }`}
          title="Panel Lapisan Struktur (Layers)"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Layer</span>
        </button>

        <button
          onClick={onToggleInspector}
          className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 border ${
            isInspectorOpen
              ? 'bg-[#2563EB] border-[#3B82F6] text-white'
              : 'bg-[#1E293B] border-white/5 text-[#94A3B8] hover:text-white'
          }`}
          title="Panel Detail Elemen BIM (Inspector)"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Inspector</span>
        </button>

        <button
          onClick={onResetCamera}
          className="p-1.5 rounded-lg bg-[#1E293B] border border-white/5 text-[#94A3B8] hover:text-white hover:bg-[#334155] transition-colors"
          title="Reset Sudut Pandang Kamera"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
