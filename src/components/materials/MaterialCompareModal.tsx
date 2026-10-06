import React from 'react';
import {
  X,
  Scale,
  Check,
  Building,
  ShieldCheck,
  Tag,
  DollarSign,
  ArrowRight,
  Info,
} from 'lucide-react';
import { MaterialMaster, MaterialPrice } from '../../domain/material/types';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';

interface MaterialCompareModalProps {
  isOpen: boolean;
  selectedMaterials: MaterialMaster[];
  onClose: () => void;
  onSelectForProject?: (material: MaterialMaster, price: number) => void;
  onRemoveMaterial?: (materialId: string) => void;
}

export const MaterialCompareModal: React.FC<MaterialCompareModalProps> = ({
  isOpen,
  selectedMaterials,
  onClose,
  onSelectForProject,
  onRemoveMaterial,
}) => {
  const { currentProject } = useProject();
  const matDb = MaterialDatabaseService.getInstance();

  if (!isOpen || selectedMaterials.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-5xl w-full text-xs shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Komparasi Material & Harga Konstruksi
              </h3>
              <p className="text-xs text-slate-500">
                Membandingkan {selectedMaterials.length} material berdampingan untuk evaluasi teknis & komersial.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Matrix Table */}
        <div className="p-6 overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-3 px-3 text-slate-500 uppercase text-[10px] font-bold w-40 bg-slate-50">
                  Parameter Komparasi
                </th>
                {selectedMaterials.map((mat) => (
                  <th key={mat.id} className="py-3 px-4 min-w-[200px] align-top bg-white">
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {mat.materialCode}
                      </span>
                      {onRemoveMaterial && selectedMaterials.length > 1 && (
                        <button
                          onClick={() => onRemoveMaterial(mat.id)}
                          className="text-slate-400 hover:text-red-500 p-0.5"
                          title="Hapus dari komparasi"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="font-extrabold text-slate-900 text-sm">{mat.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Row: Harga Acuan */}
              <tr className="bg-emerald-50/30">
                <td className="py-3 px-3 font-bold text-slate-700 bg-slate-50/80">Harga Acuan 2026</td>
                {selectedMaterials.map((mat) => {
                  const prices = matDb.getPricesByMaterialId(mat.id);
                  const price = prices[0]?.price || 0;
                  return (
                    <td key={mat.id} className="py-3 px-4">
                      <div className="font-mono text-base font-black text-emerald-800">
                        {price > 0 ? formatCurrencyIDR(price) : 'Belum Ada'}
                      </div>
                      <span className="text-[11px] text-slate-500">per {mat.unit}</span>
                    </td>
                  );
                })}
              </tr>

              {/* Row: Sektor & Kategori */}
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-600 bg-slate-50/80">Sektor</td>
                {selectedMaterials.map((mat) => (
                  <td key={mat.id} className="py-2.5 px-4 font-medium text-slate-800">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                      {mat.sector}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Row: Merek / Pabrikan */}
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-600 bg-slate-50/80">Merek</td>
                {selectedMaterials.map((mat) => (
                  <td key={mat.id} className="py-2.5 px-4 font-bold text-slate-900">
                    {mat.brand || 'Multi-Brand'}
                  </td>
                ))}
              </tr>

              {/* Row: Kelas Harga (Tier) */}
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-600 bg-slate-50/80">Kelas Harga</td>
                {selectedMaterials.map((mat) => (
                  <td key={mat.id} className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded font-bold text-[10.5px] bg-slate-100 text-slate-700 border border-slate-200">
                      {mat.priceTier || 'STANDARD'}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Row: Spesifikasi Teknik */}
              <tr>
                <td className="py-3 px-3 font-semibold text-slate-600 bg-slate-50/80">Spesifikasi Teknik</td>
                {selectedMaterials.map((mat) => (
                  <td key={mat.id} className="py-3 px-4 text-slate-600 leading-relaxed text-[11.5px]">
                    {mat.specification || '-'}
                  </td>
                ))}
              </tr>

              {/* Row: Standar Acuan */}
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-600 bg-slate-50/80">Standar Acuan</td>
                {selectedMaterials.map((mat) => (
                  <td key={mat.id} className="py-2.5 px-4 text-slate-700 font-medium">
                    {mat.standard || 'SNI'}
                  </td>
                ))}
              </tr>

              {/* Row: Wilayah Acuan */}
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-600 bg-slate-50/80">Cakupan Wilayah</td>
                {selectedMaterials.map((mat) => {
                  const prices = matDb.getPricesByMaterialId(mat.id);
                  const reg = prices[0]?.region;
                  return (
                    <td key={mat.id} className="py-2.5 px-4 text-slate-700">
                      {reg?.city ? `${reg.city}, ${reg.province}` : reg?.province || 'Nasional'}
                    </td>
                  );
                })}
              </tr>

              {/* Row: Sumber & Verifikasi */}
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-600 bg-slate-50/80">Sumber Data</td>
                {selectedMaterials.map((mat) => {
                  const prices = matDb.getPricesByMaterialId(mat.id);
                  const src = prices[0]?.sourceName || 'Katalog Resmi EZRAB';
                  return (
                    <td key={mat.id} className="py-2.5 px-4 text-slate-600 text-[11px]">
                      {src}
                    </td>
                  );
                })}
              </tr>

              {/* Row: Aksi Proyek */}
              <tr>
                <td className="py-3 px-3 font-bold text-slate-700 bg-slate-50/80">Pilih untuk Proyek</td>
                {selectedMaterials.map((mat) => {
                  const prices = matDb.getPricesByMaterialId(mat.id);
                  const price = prices[0]?.price || 0;
                  return (
                    <td key={mat.id} className="py-3 px-4">
                      {currentProject && onSelectForProject && price > 0 ? (
                        <button
                          onClick={() => onSelectForProject(mat, price)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Gunakan Harga Ini
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Pilih proyek untuk menerapkan</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-slate-500 text-xs">
            Komparasi harga bersifat referensial dan dapat disesuaikan dengan negosiasi volume supplier lokal.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
          >
            Selesai Komparasi
          </button>
        </div>
      </div>
    </div>
  );
};
