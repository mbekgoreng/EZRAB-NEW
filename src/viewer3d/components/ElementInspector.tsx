import React from 'react';
import { ViewerElement3D } from '../types';
import { Compass, Ruler, Calculator, ShieldCheck, X } from 'lucide-react';

export interface ElementInspectorProps {
  element: ViewerElement3D | null;
  onClose?: () => void;
}

export const ElementInspector: React.FC<ElementInspectorProps> = ({ element, onClose }) => {
  if (!element) {
    return (
      <div className="absolute top-14 left-3 z-20 w-72 bg-[#0F172A]/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl p-4 text-white text-xs select-none">
        <div className="flex items-center gap-2 text-[#94A3B8] italic">
          <Compass className="w-4 h-4 text-[#38BDF8]" />
          <span>Klik elemen 3D untuk melihat dimensi & rincian teknis BIM.</span>
        </div>
      </div>
    );
  }

  const { width, height, depth } = element.dimensions;
  const { x, y, z } = element.position;

  return (
    <div className="absolute top-14 left-3 z-20 w-80 bg-[#0F172A]/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl p-4 text-white text-xs select-none max-h-[80vh] overflow-y-auto">
      <div className="flex items-start justify-between pb-2 mb-3 border-b border-white/10">
        <div>
          <span className="text-[10px] font-mono text-[#38BDF8] uppercase tracking-wider block">
            {element.elementType} • {element.layer}
          </span>
          <h4 className="font-bold text-sm text-white leading-tight mt-0.5">{element.name}</h4>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Stable ID & WBS */}
        <div className="grid grid-cols-2 gap-2 bg-[#1E293B] p-2.5 rounded-lg border border-white/5">
          <div>
            <span className="text-[10px] text-[#94A3B8] block">Stable ID</span>
            <span className="font-mono text-[11px] font-semibold text-emerald-400 truncate block">
              {element.stableId}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#94A3B8] block">WBS Code</span>
            <span className="font-mono text-[11px] font-semibold text-[#38BDF8]">
              {element.wbsCode || 'N/A'}
            </span>
          </div>
        </div>

        {/* Physical Dimensions (m) */}
        <div className="bg-[#1E293B] p-2.5 rounded-lg border border-white/5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[#38BDF8] font-semibold">
            <Ruler className="w-3.5 h-3.5" />
            <span>Dimensi Fisik (Meter)</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
            <div className="bg-[#0F172A] p-1.5 rounded">
              <span className="text-[10px] text-[#94A3B8] block">Lebar (P)</span>
              <span className="font-bold text-white">{width.toFixed(2)} m</span>
            </div>
            <div className="bg-[#0F172A] p-1.5 rounded">
              <span className="text-[10px] text-[#94A3B8] block">Tinggi (T)</span>
              <span className="font-bold text-white">{height.toFixed(2)} m</span>
            </div>
            <div className="bg-[#0F172A] p-1.5 rounded">
              <span className="text-[10px] text-[#94A3B8] block">Tebal (L)</span>
              <span className="font-bold text-white">{depth.toFixed(2)} m</span>
            </div>
          </div>
        </div>

        {/* Spatial Coordinates (X, Y, Z) */}
        <div className="bg-[#1E293B] p-2.5 rounded-lg border border-white/5 space-y-1">
          <span className="text-[10px] text-[#94A3B8] block">Koordinat Posisi Pusat (X, Y, Z)</span>
          <span className="font-mono text-[11px] text-white block">
            X: {x.toFixed(2)}m • Y: {y.toFixed(2)}m • Z: {z.toFixed(2)}m
          </span>
        </div>

        {/* Material Category & Status */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#1E293B] p-2 rounded-lg border border-white/5">
            <span className="text-[10px] text-[#94A3B8] block">Material</span>
            <span className="font-medium text-white truncate block">{element.materialCategory}</span>
          </div>
          <div className="bg-[#1E293B] p-2 rounded-lg border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-[#94A3B8] block">Status</span>
              <span className="font-semibold text-emerald-400">{element.confidence}</span>
            </div>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* Calculation Reference (if available) */}
        {element.calculationReference && (
          <div className="bg-[#1E293B] p-2.5 rounded-lg border border-white/5 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <Calculator className="w-3.5 h-3.5" />
              <span>Kalkulasi Volume Terkait</span>
            </div>
            <p className="text-[11px] text-[#CBD5E1] font-mono">{element.calculationReference.formula}</p>
            <div className="flex justify-between items-center pt-1 border-t border-white/5">
              <span className="text-[10px] text-[#94A3B8]">Volume Volume Engine:</span>
              <span className="font-bold text-amber-300 font-mono">
                {element.calculationReference.volume} {element.calculationReference.unit}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
