import React, { useState } from 'react';
import { MasterBuildingTemplate } from '../../data/buildingTemplates/schema/types';
import { MasterGeometryResolver } from '../geometry/masterGeometryResolver';
import { useViewerState } from '../state/viewerStore';
import { ParametricViewer3D } from './ParametricViewer3D';
import { ViewerToolbar } from './ViewerToolbar';
import { LayerVisibilityPanel } from './LayerVisibilityPanel';
import { ElementInspector } from './ElementInspector';
import { X, Box, Info } from 'lucide-react';

export interface TemplateModel3DModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: MasterBuildingTemplate | null;
  parameters?: Record<string, any>;
}

export const TemplateModel3DModal: React.FC<TemplateModel3DModalProps> = ({
  isOpen,
  onClose,
  template,
  parameters = {},
}) => {
  if (!isOpen || !template) return null;

  // Generate 3D Model deterministically from template and parameters
  let initialModel = null;
  let generationError: string | null = null;

  try {
    initialModel = MasterGeometryResolver.resolve({
      templateIdOrCode: template.id,
      parameters,
    });
  } catch (err: any) {
    generationError = err?.message || 'Gagal menghasilkan model 3D parametrik.';
  }

  const {
    model,
    renderMode,
    setRenderMode,
    visibleLayers,
    toggleLayer,
    setAllLayers,
    selectedElement,
    selectElement,
    cameraPreset,
    setCameraPreset,
    resetViewer,
  } = useViewerState(initialModel);

  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-6xl h-[85vh] bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#0B132B]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/20 text-[#38BDF8] border border-blue-500/30">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#38BDF8] font-bold">{template.code}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                  3D BIM Wireframe Ready
                </span>
              </div>
              <h3 className="text-base font-bold text-white leading-tight mt-0.5">{template.name}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <ViewerToolbar
          renderMode={renderMode}
          onRenderModeChange={setRenderMode}
          cameraPreset={cameraPreset}
          onCameraPresetChange={setCameraPreset}
          onResetCamera={resetViewer}
          isLayerPanelOpen={isLayerPanelOpen}
          onToggleLayerPanel={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
          isInspectorOpen={isInspectorOpen}
          onToggleInspector={() => setIsInspectorOpen(!isInspectorOpen)}
        />

        {/* 3D Canvas Area with Overlays */}
        <div className="relative flex-1 w-full bg-[#0B132B] overflow-hidden">
          {generationError ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[#94A3B8]">
              <Info className="w-10 h-10 text-amber-400 mb-2" />
              <h4 className="text-white font-bold mb-1">Model 3D Belum Tersedia</h4>
              <p className="text-xs max-w-md">{generationError}</p>
            </div>
          ) : (
            <>
              <ParametricViewer3D
                model={model}
                renderMode={renderMode}
                visibleLayers={visibleLayers}
                selectedElement={selectedElement}
                onSelectElement={selectElement}
                cameraPreset={cameraPreset}
                onCameraPresetChange={setCameraPreset}
              />

              {/* Layer Panel Overlay */}
              {isLayerPanelOpen && (
                <LayerVisibilityPanel
                  visibleLayers={visibleLayers}
                  layerCounts={model?.layerCounts}
                  onToggleLayer={toggleLayer}
                  onSetAllLayers={setAllLayers}
                />
              )}

              {/* Inspector Panel Overlay */}
              {isInspectorOpen && (
                <ElementInspector
                  element={selectedElement}
                  onClose={() => selectElement(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Modal Footer Info */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-[#0B132B] border-t border-white/10 text-[11px] text-[#94A3B8]">
          <div className="flex items-center gap-4">
            <span>Total Elemen 3D: <strong className="text-white">{model?.elements.length || 0}</strong></span>
            <span>Dimensi Model: <strong className="text-white">{model?.boundingBox.size.width.toFixed(1)}m × {model?.boundingBox.size.depth.toFixed(1)}m × {model?.boundingBox.size.height.toFixed(1)}m</strong></span>
          </div>
          <span className="text-emerald-400 font-medium">✓ Read-Only Preview • Deterministik</span>
        </div>
      </div>
    </div>
  );
};
