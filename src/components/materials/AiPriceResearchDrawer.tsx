import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Search,
  Check,
  Building,
  ExternalLink,
  ShieldCheck,
  Loader2,
  DollarSign,
  ArrowRight,
  Info,
} from 'lucide-react';
import { MaterialMaster, MaterialPrice } from '../../domain/material/types';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';

interface AiPriceResearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  onAdoptPrice?: (material: MaterialMaster, price: number, saveToDb: boolean) => void;
}

export const AiPriceResearchDrawer: React.FC<AiPriceResearchDrawerProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
  onAdoptPrice,
}) => {
  const { currentProject } = useProject();
  const matDb = MaterialDatabaseService.getInstance();

  const [promptQuery, setPromptQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [candidates, setCandidates] = useState<Array<{
    id: string;
    material: MaterialMaster;
    materialName: string;
    brand: string;
    spec: string;
    unit: string;
    price: number | null;
    region: string;
    source: string;
    date: string;
    verificationLabel: string;
  }>>([]);

  if (!isOpen) return null;

  const handleRunSearch = () => {
    if (!promptQuery.trim()) return;
    setIsSearching(true);

    setTimeout(() => {
      // Cari kecocokan NYATA di database material — kandidat hanya berasal dari
      // data yang benar-benar ada; harga/atribut yang tidak ada ditampilkan apa
      // adanya (null/'—'), tidak pernah diisi angka atau label karangan.
      const q = promptQuery.toLowerCase();
      const matches = matDb.getAllMaterials().filter((m) => {
        return (
          m.name.toLowerCase().includes(q) ||
          (m.brand && m.brand.toLowerCase().includes(q)) ||
          (m.specification && m.specification.toLowerCase().includes(q))
        );
      });

      const candList = matches.slice(0, 5).map((m, idx) => {
        const pList = matDb.getPricesByMaterialId(m.id);
        const pRec = pList[0];
        return {
          id: `cand-${m.id}-${idx}`,
          material: m,
          materialName: m.name,
          brand: m.brand || '—',
          spec: m.specification || '—',
          unit: m.unit,
          price: typeof pRec?.price === 'number' ? pRec.price : null,
          region: pRec?.region.city
            ? `${pRec.region.city}, ${pRec.region.province}`
            : pRec?.region.province || '—',
          source: pRec?.sourceName || '—',
          date: pRec?.priceDate || '—',
          verificationLabel:
            pRec?.verificationStatus === 'VERIFIED'
              ? 'Terverifikasi'
              : pRec
                ? 'Belum terverifikasi'
                : 'Tanpa record harga',
        };
      });

      setCandidates(candList);
      setHasSearched(true);
      setIsSearching(false);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg ez-bg-surface h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-blue-50/70 to-indigo-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                AI Material & Price Assistant
              </h3>
              <p className="text-xs text-slate-500">
                Pencarian kandidat material & harga dari database material EZRAB.
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

        {/* Search Prompt Bar */}
        <div className="p-4 border-b border-slate-200 ez-bg-surface space-y-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Contoh: Cari harga pipa PVC 1/2 di Probolinggo..."
              value={promptQuery}
              onChange={(e) => setPromptQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunSearch()}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-20 py-2.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
            />
            <button
              onClick={handleRunSearch}
              disabled={isSearching}
              className="absolute right-1.5 top-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1 shadow-xs disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Riset
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 overflow-x-auto py-0.5">
            <span className="font-semibold text-slate-400">Pintasan:</span>
            {['Pipa PVC 1/2', 'Semen Gresik 50kg', 'Besi Beton D13', 'Batu Belah'].map((shortcut) => (
              <button
                key={shortcut}
                onClick={() => {
                  setPromptQuery(`Cari harga ${shortcut}`);
                }}
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium whitespace-nowrap transition"
              >
                {shortcut}
              </button>
            ))}
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {isSearching ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              <p className="text-xs font-semibold ez-text-body">Mencari di database material...</p>
              <p className="text-[11px] text-slate-400">Hanya kandidat yang benar-benar ada di database yang ditampilkan</p>
            </div>
          ) : candidates.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Ditemukan {candidates.length} kandidat dari database material:</span>
                <span className="text-slate-500 font-semibold">Status verifikasi per kandidat tertera di kartunya</span>
              </div>

              {candidates.map((c, idx) => (
                <div
                  key={c.id}
                  className="ez-bg-surface border border-slate-200 rounded-xl p-3.5 shadow-xs hover:border-blue-400 transition space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 mr-1.5">
                        KANDIDAT #{idx + 1}
                      </span>
                      <h4 className="font-extrabold ez-text-primary text-xs mt-1">
                        {c.materialName}
                      </h4>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Merek: <strong className="ez-text-primary">{c.brand}</strong> • Wilayah: <strong className="ez-text-primary">{c.region}</strong>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-sm font-black text-emerald-700">
                        {c.price !== null ? formatCurrencyIDR(c.price) : 'Belum tersedia'}
                      </div>
                      <span className="text-[10.5px] text-slate-400">/{c.unit}</span>
                    </div>
                  </div>

                  <p className="text-slate-600 text-[11px] leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {c.spec}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10.5px] text-slate-500">
                    <span className="truncate max-w-[200px]" title={c.source}>
                      Sumber: {c.source} • {c.date} • {c.verificationLabel}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          if (c.price !== null) onAdoptPrice?.(c.material, c.price, true);
                        }}
                        disabled={c.price === null}
                        title={c.price === null ? 'Kandidat ini belum memiliki harga' : 'Simpan sebagai record harga riset (belum terverifikasi)'}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Simpan Referensi
                      </button>

                      {currentProject && (
                        <button
                          onClick={() => {
                            if (c.price !== null) onAdoptPrice?.(c.material, c.price, false);
                          }}
                          disabled={c.price === null}
                          title={c.price === null ? 'Kandidat ini belum memiliki harga' : `Terapkan sebagai harga proyek ${currentProject.name}`}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Check className="w-3 h-3" />
                          Gunakan Proyek
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : hasSearched ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <Info className="w-6 h-6 mx-auto text-slate-400" />
              <p className="text-xs font-semibold ez-text-slate">
                Tidak ditemukan di database material.
              </p>
              <p className="text-[11px] text-slate-400">
                Tidak ada material yang cocok dengan kata kunci tersebut. Coba kata kunci lain, atau tambahkan material baru dari halaman database material.
              </p>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <Info className="w-6 h-6 mx-auto text-slate-400" />
              <p className="text-xs font-semibold ez-text-slate">
                Ketik nama material atau kebutuhan harga untuk mulai mencari.
              </p>
              <p className="text-[11px] text-slate-400">
                Pencarian menelusuri katalog material EZRAB yang tersimpan; database tidak diubah kecuali Anda memilih menyimpan/menerapkan harga.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Audit trail preserved</span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg ez-bg-surface border border-slate-300 ez-text-body font-semibold transition text-xs"
          >
            Tutup Panel
          </button>
        </div>
      </div>
    </div>
  );
};
