import { useState, useCallback } from 'react';
import { ViewerModel3D, ViewerElement3D, ViewerLayerType, RenderMode, CameraPreset } from '../types';

export interface ViewerState {
  model: ViewerModel3D | null;
  renderMode: RenderMode;
  visibleLayers: Record<ViewerLayerType, boolean>;
  selectedElement: ViewerElement3D | null;
  hoveredElement: ViewerElement3D | null;
  cameraPreset: CameraPreset;
  isLoading: boolean;
  errorMessage: string | null;
}

export const DEFAULT_VISIBLE_LAYERS: Record<ViewerLayerType, boolean> = {
  FOUNDATION: true,
  STRUCTURE: true,
  WALLS: true,
  OPENINGS: true,
  ROOF: true,
  SLAB: true,
  FINISHES: true,
  INFRASTRUCTURE: true,
  DRAINAGE: true,
  GRID: true,
};

export function useViewerState(initialModel: ViewerModel3D | null = null) {
  const [model, setModel] = useState<ViewerModel3D | null>(initialModel);
  const [renderMode, setRenderMode] = useState<RenderMode>('SOLID');
  const [visibleLayers, setVisibleLayers] = useState<Record<ViewerLayerType, boolean>>(DEFAULT_VISIBLE_LAYERS);
  const [selectedElement, setSelectedElement] = useState<ViewerElement3D | null>(null);
  const [hoveredElement, setHoveredElement] = useState<ViewerElement3D | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('ISOMETRIC');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleLayer = useCallback((layer: ViewerLayerType) => {
    setVisibleLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  }, []);

  const setAllLayers = useCallback((visible: boolean) => {
    setVisibleLayers({
      FOUNDATION: visible,
      STRUCTURE: visible,
      WALLS: visible,
      OPENINGS: visible,
      ROOF: visible,
      SLAB: visible,
      FINISHES: visible,
      INFRASTRUCTURE: visible,
      DRAINAGE: visible,
      GRID: visible,
    });
  }, []);

  const selectElement = useCallback((element: ViewerElement3D | null) => {
    setSelectedElement(element);
  }, []);

  const resetViewer = useCallback(() => {
    setRenderMode('SOLID');
    setVisibleLayers(DEFAULT_VISIBLE_LAYERS);
    setSelectedElement(null);
    setHoveredElement(null);
    setCameraPreset('ISOMETRIC');
    setErrorMessage(null);
  }, []);

  return {
    model,
    setModel,
    renderMode,
    setRenderMode,
    visibleLayers,
    toggleLayer,
    setAllLayers,
    selectedElement,
    selectElement,
    hoveredElement,
    setHoveredElement,
    cameraPreset,
    setCameraPreset,
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
    resetViewer,
  };
}
