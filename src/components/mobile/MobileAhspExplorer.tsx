/**
 * MobileAhspExplorer — presentasi NATIVE mobile Penjelajah AHSP 2026
 * (Gelombang 1, layar 16 galeri + mockup EZRAB-AHSP-MOBILE: daftar kartu
 * ringkas + layar detail harga satuan per kelompok Bahan/Upah/Alat).
 *
 * HANYA presentasi: katalog dari officialAhspRepository yang sama,
 * harga dari resolveWithMarket + resolver resmi yang sama dengan
 * AhspExplorerView desktop, gerbang tambah-ke-RAB memakai
 * canFinalizeAhsp yang sama (AHSP parsial tidak pernah masuk RAB
 * sebagai harga final), dan penyimpanan ke AHSP proyek memakai
 * saveProjectAhspFromCatalog yang sama. Harga yang belum teresolusi
 * tetap ditampilkan apa adanya ("Belum ada harga"), tidak diisi angka
 * lain. Panel audit pasar & filter lanjutan (metode/status/sortir)
 * tetap fitur view desktop pada gelombang ini.
 *
 * Keputusan desain (mandat owner "buat yang terbaik", 2026-11-10):
 * gerbang finalisasi menerima konteks item yang SEDANG ditambahkan
 * (desktop meneruskan konteks item yang sedang dipilih — perilaku
 * ekuivalen saat modal dibuka dari item yang sama, dan lebih tepat
 * saat dibuka dari kartu lain).
 */
import React, { useMemo, useState } from 'react';
import { Search, ArrowLeft, Copy, Check, BookOpen, Plus, Save, X } from 'lucide-react';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import type { AHSPDomain, NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import type { AhspRouteParams } from '../../routing/routes';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { getAhspDirectPrice, canFinalizeAhsp } from '../../data/priceDatabase2026/ahspDisplayPolicy';
import { applyMarketOverlay, type AugmentedComponent } from '../../engine/pricing/market/ahspMarketOverlay';
import { saveProjectAhspFromCatalog } from '../../project-data/ahspBridge';
import { formatCurrencyIDR, formatNumberID } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';
import { resolveWithMarket, domainShortLabel } from '../ahsp/AhspExplorerView';

interface MobileAhspExplorerProps {
  routeParams?: AhspRouteParams;
  onAddAhspToRab?: (ahsp: NationalAHSPItem, volume: number) => boolean;
}

type DomainFilter = AHSPDomain | 'ALL';

const DOMAIN_CHIPS: Array<{ id: DomainFilter; label: string }> = [
  { id: 'ALL', label: 'Semua Bidang' },
  { id: 'CIPTA_KARYA', label: 'Cipta Karya' },
  { id: 'BINA_MARGA', label: 'Bina Marga' },
  { id: 'SUMBER_DAYA_AIR', label: 'SDA' },
  { id: 'SMKK', label: 'SMKK' },
];

const PAGE_STEP = 48;

const priceOf = (item: NationalAHSPItem) => {
  const composition = resolveWithMarket(item);
  const hspPrice = getAhspDirectPrice(composition) ?? item.unitPrice;
  const pricingStatus =
    hspPrice && hspPrice > 0 && item.domain === 'SMKK' ? 'FULL' : composition.pricingStatus;
  return { hspPrice, pricingStatus };
};

const CompGroup: React.FC<{ title: string; comps: AugmentedComponent[]; subtotal: number }> = ({ title, comps, subtotal }) => {
  if (comps.length === 0) return null;
  return (
    <div>
      <div className="mnw-comp-group-title">
        <span>{title}</span>
        <span>{formatCurrencyIDR(subtotal)}</span>
      </div>
      {comps.map((r, idx) => {
        const price = r.unitPrice ?? r.marketUnitPrice;
        const hasPrice = price !== null && price !== undefined && price > 0;
        return (
          <div key={idx} className="mnw-comp-row">
            <span className="mnw-comp-name">
              {r.itemName}
              <small>
                {formatNumberID(r.coefficient, 4)} {r.unit} × {hasPrice ? price!.toLocaleString('id-ID') : '—'}
              </small>
            </span>
            <span className="mnw-comp-amt">{hasPrice ? formatCurrencyIDR(r.coefficient * price!) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
};

export const MobileAhspExplorer: React.FC<MobileAhspExplorerProps> = ({ routeParams, onAddAhspToRab }) => {
  const { currentProject, createRabItemDirect } = useProject();

  const [searchQuery, setSearchQuery] = useState(routeParams?.q ?? '');
  const [selectedDomain, setSelectedDomain] = useState<DomainFilter>(() => {
    const d = routeParams?.domain;
    return d === 'CIPTA_KARYA' || d === 'BINA_MARGA' || d === 'SUMBER_DAYA_AIR' || d === 'SMKK' ? d : 'ALL';
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [selectedItem, setSelectedItem] = useState<NationalAHSPItem | null>(null);
  const [inputVolume, setInputVolume] = useState(1);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMsg(text);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const activeItems = useMemo(() => officialAhspRepository.getActiveOfficialAhsp(), []);

  // Penyaringan + sortir kode sama dengan view desktop (tanpa filter
  // lanjutan metode/status yang tetap di desktop pada gelombang ini).
  const filteredItems = useMemo(() => {
    const qClean = searchQuery.trim().toLowerCase();
    const filtered = activeItems.filter((item) => {
      if (selectedDomain !== 'ALL' && item.domain !== selectedDomain) return false;
      if (qClean) {
        const matchCode =
          item.code.toLowerCase().includes(qClean) || item.codeNormalized.toLowerCase().includes(qClean);
        const matchName = item.name.toLowerCase().includes(qClean);
        const matchCat = item.category.toLowerCase().includes(qClean);
        const matchSub = (item.subCategory || '').toLowerCase().includes(qClean);
        const matchResource =
          item.laborComponents.some((e) => e.name.toLowerCase().includes(qClean)) ||
          item.materialComponents.some((e) => e.name.toLowerCase().includes(qClean)) ||
          item.equipmentComponents.some((e) => e.name.toLowerCase().includes(qClean));
        if (!matchCode && !matchName && !matchCat && !matchSub && !matchResource) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => a.codeNormalized.localeCompare(b.codeNormalized, undefined, { numeric: true }));
  }, [activeItems, selectedDomain, searchQuery]);

  const visibleItems = filteredItems.slice(0, visibleCount);

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => undefined);
    }
    setCopiedCode(code);
    showToast(`Kode analisa ${code} disalin ke clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Alur konfirmasi tambah-ke-RAB: replika persis handler desktop
  // (gerbang finalisasi → pengayaan item → prop onAddAhspToRab atau
  // fallback createRabItemDirect → toast jujur bila tidak ada proyek).
  const handleConfirmAddToRab = (item: NationalAHSPItem) => {
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const augmented = applyMarketOverlay(comp);
    const gate = canFinalizeAhsp(augmented, { code: item.code, name: item.name });
    if (!gate.ok) {
      showToast(`Tidak dapat ditambahkan: ${gate.reason}`);
      return;
    }
    const hsp = getAhspDirectPrice(augmented)!;
    const marketNote = augmented?.hasMarketPrices ? ' (sebagian harga dari referensi pasar terverifikasi)' : '';
    const enrichedItem: NationalAHSPItem = {
      ...item,
      unitPrice: hsp,
      totalLabor: augmented?.labor.subtotalPerUnit || 0,
      totalMaterial: augmented?.material.subtotalPerUnit || 0,
      totalEquipment: augmented?.equipment.subtotalPerUnit || 0,
    };

    let added = false;
    if (onAddAhspToRab) {
      added = onAddAhspToRab(enrichedItem, inputVolume);
    } else if (currentProject && createRabItemDirect) {
      createRabItemDirect({
        code: item.code,
        ahspCode: item.code,
        description: item.name,
        unit: item.unit,
        volume: inputVolume,
        unitPrice: hsp,
        totalPrice: hsp * inputVolume,
        category: item.category || 'Pekerjaan',
        sectionName: item.category || 'Pekerjaan',
        laborPrice: augmented?.labor.subtotalPerUnit || 0,
        materialPrice: augmented?.material.subtotalPerUnit || 0,
        equipmentPrice: augmented?.equipment.subtotalPerUnit || 0,
      });
      added = true;
    }

    if (!added) {
      showToast('Pilih atau buka proyek terlebih dahulu untuk menambahkan ke RAB!');
      return;
    }
    showToast(`Berhasil menambahkan ${item.code} (${inputVolume} ${item.unit}) ke RAB!${marketNote}`);
    setInputVolume(1);
  };

  // Simpan ke AHSP proyek: replika persis handler desktop.
  const handleSaveToProjectAhsp = (item: NationalAHSPItem) => {
    if (!currentProject?.id) {
      showToast('Pilih atau buka proyek terlebih dahulu untuk menyimpan ke AHSP Proyek!');
      return;
    }
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const augmented = applyMarketOverlay(comp);
    const gate = canFinalizeAhsp(augmented, { code: item.code, name: item.name });
    if (!gate.ok) {
      showToast(`Tidak dapat disimpan: ${gate.reason}`);
      return;
    }
    const hsp = getAhspDirectPrice(augmented)!;
    const enrichedItem: NationalAHSPItem = {
      ...item,
      unitPrice: hsp,
      totalLabor: comp.labor.subtotalPerUnit || 0,
      totalMaterial: comp.material.subtotalPerUnit || 0,
      totalEquipment: comp.equipment.subtotalPerUnit || 0,
    };
    saveProjectAhspFromCatalog(currentProject.id, enrichedItem);
    showToast(`Analisa ${item.code} berhasil disimpan ke AHSP Proyek "${currentProject.name}"!`);
  };

  /* ------------------------------ DETAIL ------------------------------ */
  if (selectedItem) {
    const item = selectedItem;
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const augmented = applyMarketOverlay(comp);
    const { hspPrice, pricingStatus } = priceOf(item);
    return (
      <div className="mnw-screen">
        <div className="mnw-backbar">
          <button type="button" className="mnw-backbtn" onClick={() => setSelectedItem(null)} aria-label="Kembali ke daftar AHSP">
            <ArrowLeft size={18} />
          </button>
          <span className="mnw-code-chip">{item.code}</span>
          <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 700 }}>{domainShortLabel(item.domain)}</span>
        </div>

        <h1 style={{ fontSize: 17.5, fontWeight: 800, lineHeight: 1.45, margin: '0 0 4px', color: '#0F172A' }}>{item.name}</h1>
        <p className="mnw-sub" style={{ marginBottom: 12 }}>
          {item.category}
          {item.subCategory ? ` · ${item.subCategory}` : ''} · Satuan: {item.unit || '—'}
        </p>

        <div className="mnw-totalbar">
          <div>
            <span className="mnw-totalbar-label">Harga Satuan / {item.unit || 'satuan'}</span>
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)' }}>
              {pricingStatus === 'FULL' ? 'Harga lengkap' : pricingStatus === 'PARTIAL' ? 'Harga parsial' : 'Harga belum tersedia'}
            </span>
          </div>
          <span className="mnw-totalbar-value">
            {hspPrice ? `${formatCurrencyIDR(hspPrice)}${pricingStatus === 'PARTIAL' ? '*' : ''}` : 'Belum ada harga'}
          </span>
        </div>

        {augmented.pricingStatus === 'PARTIAL' && (
          <div className="mnw-warn">
            Harga parsial: {augmented.resolvedComponents} dari {augmented.totalComponents} komponen teresolusi.
            {augmented.missing.length > 0 &&
              ` Belum terharga: ${augmented.missing.slice(0, 6).map((m) => m.name).join(', ')}${augmented.missing.length > 6 ? ', dst.' : ''}.`}
          </div>
        )}
        {augmented.pricingStatus === 'MISSING' && (
          <div className="mnw-warn">
            <strong>Harga Belum Tersedia:</strong> belum ada data harga satuan untuk komponen pada analisa ini di
            database standar 2026. Item ini belum dapat ditambahkan ke RAB sebagai harga final.
          </div>
        )}

        <section className="mnw-card" style={{ marginTop: 12 }}>
          <CompGroup title="Tenaga Kerja" comps={augmented.labor.components} subtotal={augmented.labor.subtotalPerUnit} />
          <CompGroup title="Bahan / Material" comps={augmented.material.components} subtotal={augmented.material.subtotalPerUnit} />
          <CompGroup title="Peralatan" comps={augmented.equipment.components} subtotal={augmented.equipment.subtotalPerUnit} />
          {augmented.labor.components.length === 0 &&
            augmented.material.components.length === 0 &&
            augmented.equipment.components.length === 0 && (
              <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>Analisa ini tidak memiliki rincian komponen.</p>
            )}
        </section>

        <div className="mnw-volrow">
          <input
            className="mnw-volinput"
            type="number"
            min={0}
            step="any"
            value={inputVolume}
            onChange={(e) => setInputVolume(Math.max(0, Number(e.target.value) || 0))}
            aria-label={`Volume dalam ${item.unit || 'satuan'}`}
          />
          <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 700 }}>{item.unit}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="mnw-action-btn primary" style={{ padding: '13px 8px' }} onClick={() => handleConfirmAddToRab(item)}>
            <Plus size={15} /> Tambah ke RAB
          </button>
          <button type="button" className="mnw-action-btn" style={{ padding: '13px 8px' }} onClick={() => handleSaveToProjectAhsp(item)}>
            <Save size={15} /> Simpan ke Proyek
          </button>
        </div>

        {toastMsg && (
          <div className="mnw-toast" role="status">
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{toastMsg}</span>
              <X size={14} style={{ flexShrink: 0, marginTop: 2 }} onClick={() => setToastMsg(null)} />
            </span>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ DAFTAR ------------------------------ */
  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Katalog Resmi</div>
      <h1 className="mnw-title">AHSP 2026</h1>
      <p className="mnw-sub">
        {activeItems.length.toLocaleString('id-ID')} analisa aktif · standar SE 47/2026. Ketuk kartu untuk rincian
        harga satuan.
      </p>

      <div className="mnw-search">
        <Search size={15} />
        <input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleCount(PAGE_STEP);
          }}
          placeholder="Cari kode, nama, atau komponen…"
          aria-label="Cari AHSP 2026"
        />
      </div>

      <div className="mnw-chips" role="tablist" aria-label="Bidang AHSP">
        {DOMAIN_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={selectedDomain === chip.id}
            className={`mnw-chip${selectedDomain === chip.id ? ' is-active' : ''}`}
            onClick={() => {
              setSelectedDomain(chip.id);
              setVisibleCount(PAGE_STEP);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <p className="mnw-sub" style={{ margin: '10px 2px' }}>
        Menampilkan {Math.min(visibleCount, filteredItems.length)} dari {filteredItems.length.toLocaleString('id-ID')} analisa
      </p>

      {filteredItems.length === 0 ? (
        <div className="mnw-empty">
          <BookOpen size={26} color="#94A3B8" />
          <p style={{ margin: 0 }}>Tidak ada analisa yang cocok dengan pencarian/bidang ini.</p>
        </div>
      ) : (
        <>
          {visibleItems.map((item) => {
            const { hspPrice, pricingStatus } = priceOf(item);
            const badgeClass = pricingStatus === 'FULL' ? 'full' : pricingStatus === 'PARTIAL' ? 'partial' : 'missing';
            const badgeLabel = pricingStatus === 'FULL' ? 'Harga lengkap' : pricingStatus === 'PARTIAL' ? 'Harga parsial' : 'Belum ada harga';
            return (
              <article key={item.id} className="mnw-ahsp-card">
                <div className="mnw-ahsp-top">
                  <span className="mnw-code-chip">{item.code}</span>
                  <span style={{ flex: 1 }} />
                  <span className="mnw-badge" style={{ background: '#F1F5F9', color: '#475569' }}>
                    {domainShortLabel(item.domain)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(item.code)}
                    aria-label={`Salin kode ${item.code}`}
                    style={{
                      width: 44,
                      height: 44,
                      marginTop: -11,
                      marginRight: -10,
                      border: 'none',
                      background: 'transparent',
                      color: '#94A3B8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      borderRadius: 10,
                    }}
                  >
                    {copiedCode === item.code ? <Check size={15} color="#16A34A" /> : <Copy size={15} />}
                  </button>
                </div>
                <button type="button" className="mnw-ahsp-cardbtn" onClick={() => setSelectedItem(item)} aria-label={`Buka rincian ${item.code}`}>
                  <span className="mnw-ahsp-name" style={{ display: 'block', marginTop: 8 }}>{item.name}</span>
                  <span className="mnw-ahsp-meta">
                    {item.category} · Satuan: {item.unit || '—'}
                  </span>
                  <span className="mnw-ahsp-price-row">
                    <span>
                      <span className="mnw-ahsp-price">
                        {hspPrice ? `${formatCurrencyIDR(hspPrice)}${pricingStatus === 'PARTIAL' ? '*' : ''}` : 'Belum ada harga'}
                      </span>{' '}
                      <span className="mnw-ahsp-per">/ {item.unit || 'satuan'}</span>
                    </span>
                    <span className={`mnw-badge ${badgeClass}`}>{badgeLabel}</span>
                  </span>
                </button>
              </article>
            );
          })}
          {visibleCount < filteredItems.length && (
            <button type="button" className="mnw-more-btn" onClick={() => setVisibleCount((c) => c + PAGE_STEP)}>
              Muat {Math.min(PAGE_STEP, filteredItems.length - visibleCount)} analisa lagi
            </button>
          )}
        </>
      )}

      {toastMsg && (
        <div className="mnw-toast" role="status">
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span>{toastMsg}</span>
            <X size={14} style={{ flexShrink: 0, marginTop: 2 }} onClick={() => setToastMsg(null)} />
          </span>
        </div>
      )}
    </div>
  );
};

export default MobileAhspExplorer;
