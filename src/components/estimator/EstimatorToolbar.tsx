import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Filter,
  Layers,
  ArrowUpDown,
  Columns3,
  MoreHorizontal,
  ChevronDown,
  X,
  SlidersHorizontal,
  BookOpen,
  PenTool,
  Sparkles,
  LayoutTemplate,
  Copy,
  RefreshCw,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Calculator,
  RotateCcw,
  Keyboard,
  History,
  ShieldCheck,
  ChevronsUpDown,
  Maximize2,
  Minimize2,
  FileText,
  Undo2,
  Redo2,
} from 'lucide-react';
import { WORK_CATEGORIES } from '../../data/mockData';
import { AddItemMode } from './SmartAddWorkItemModal';

interface EstimatorToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  selectedSource: string;
  onSourceChange: (src: string) => void;
  activeFiltersCount?: number;
  onToggleFilterModal?: () => void;
  isGrouped?: boolean;
  onToggleGroupMode?: () => void;
  onExpandAllGroups?: () => void;
  onCollapseAllGroups?: () => void;
  activeSortLabel?: string;
  sortDirection?: 'asc' | 'desc' | null;
  onToggleSortModal?: () => void;
  onToggleColumnsModal?: () => void;
  onAddItem: (mode?: AddItemMode) => void;
  onOpenDocumentReview?: () => void;
  onMoreActions?: () => void;
  onRefreshData?: () => void;
  onImportExcel?: () => void;
  onExportPackage?: () => void;
  onValidateIntegrity?: () => void;
  onRecalculateTotals?: () => void;
  onResetView?: () => void;
  onOpenKeyboardShortcuts?: () => void;
  onOpenVersionHistory?: () => void;
  totalMatchedItems?: number;
  totalItems?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const EstimatorToolbar: React.FC<EstimatorToolbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedSource,
  onSourceChange,
  activeFiltersCount = 0,
  onToggleFilterModal,
  isGrouped = true,
  onToggleGroupMode,
  onExpandAllGroups,
  onCollapseAllGroups,
  activeSortLabel,
  sortDirection,
  onToggleSortModal,
  onToggleColumnsModal,
  onAddItem,
  onOpenDocumentReview,
  onRefreshData,
  onImportExcel,
  onExportPackage,
  onValidateIntegrity,
  onRecalculateTotals,
  onResetView,
  onOpenKeyboardShortcuts,
  onOpenVersionHistory,
  totalMatchedItems,
  totalItems,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const addMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '12px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
      }}
    >
      {/* Left controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexGrow: 1 }}>
        {/* Phase 14: Search input with live count & clear button */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search
            size={14}
            color="#94A3B8"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari kode, uraian, atau material..."
            style={{
              width: '100%',
              height: '34px',
              paddingLeft: '32px',
              paddingRight: searchQuery ? '75px' : '10px',
              borderRadius: '6px',
              border: searchQuery ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#0F172A',
              outline: 'none',
              background: '#FFFFFF',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#2563EB';
              e.target.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.1)';
            }}
            onBlur={(e) => {
              if (!searchQuery) e.target.style.borderColor = '#CBD5E1';
              e.target.style.boxShadow = 'none';
            }}
          />
          {searchQuery && (
            <div style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {totalMatchedItems !== undefined && (
                <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                  {totalMatchedItems}
                </span>
              )}
              <button
                onClick={() => onSearchChange('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Hapus pencarian"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Phase 15: Category Dropdown */}
        <div style={{ position: 'relative' }}>
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            style={{
              height: '34px',
              padding: '0 24px 0 10px',
              borderRadius: '6px',
              border: selectedCategory !== 'ALL' ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: selectedCategory !== 'ALL' ? 700 : 500,
              color: selectedCategory !== 'ALL' ? '#1D4ED8' : '#334155',
              background: selectedCategory !== 'ALL' ? '#EFF6FF' : '#FFFFFF',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              maxWidth: '160px',
            }}
          >
            <option value="ALL">Semua Kategori</option>
            {WORK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            color={selectedCategory !== 'ALL' ? '#2563EB' : '#64748B'}
            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>

        {/* Phase 16: Source Dropdown */}
        <div style={{ position: 'relative' }}>
          <select
            value={selectedSource}
            onChange={(e) => onSourceChange(e.target.value)}
            style={{
              height: '34px',
              padding: '0 24px 0 10px',
              borderRadius: '6px',
              border: selectedSource !== 'ALL' ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: selectedSource !== 'ALL' ? 700 : 500,
              color: selectedSource !== 'ALL' ? '#1D4ED8' : '#334155',
              background: selectedSource !== 'ALL' ? '#EFF6FF' : '#FFFFFF',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
            }}
          >
            <option value="ALL">Semua Sumber</option>
            <option value="AHSP 2024">AHSP 2024</option>
            <option value="MANUAL">MANUAL</option>
            <option value="CALCULATOR">CALCULATOR (AI)</option>
            <option value="IMPORT">IMPORT</option>
          </select>
          <ChevronDown
            size={12}
            color={selectedSource !== 'ALL' ? '#2563EB' : '#64748B'}
            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>

        {/* Phase 17: Filter Button (with active count badge) */}
        <button
          onClick={onToggleFilterModal}
          style={{
            height: '34px',
            padding: '0 10px',
            borderRadius: '6px',
            border: activeFiltersCount > 0 ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
            background: activeFiltersCount > 0 ? '#EFF6FF' : '#FFFFFF',
            fontSize: '12px',
            fontWeight: 600,
            color: activeFiltersCount > 0 ? '#1D4ED8' : '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            if (activeFiltersCount === 0) e.currentTarget.style.background = '#F8FAFC';
          }}
          onMouseLeave={(e) => {
            if (activeFiltersCount === 0) e.currentTarget.style.background = '#FFFFFF';
          }}
        >
          <Filter size={13} color={activeFiltersCount > 0 ? '#2563EB' : '#64748B'} />
          <span>Filter</span>
          {activeFiltersCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '1px 5px',
                borderRadius: '999px',
                background: '#2563EB',
                color: '#FFFFFF',
                marginLeft: '2px',
              }}
            >
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Phase 18: WBS Group Toggle & Expand/Collapse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            onClick={onToggleGroupMode}
            style={{
              height: '34px',
              padding: '0 10px',
              borderRadius: '6px',
              border: !isGrouped ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              background: !isGrouped ? '#EFF6FF' : '#FFFFFF',
              fontSize: '12px',
              fontWeight: 600,
              color: !isGrouped ? '#1D4ED8' : '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
            }}
            title={isGrouped ? 'Tampilan WBS Hierarki (Klik untuk beralih ke Flat)' : 'Tampilan Flat (Klik untuk beralih ke WBS)'}
            onMouseEnter={(e) => {
              if (isGrouped) e.currentTarget.style.background = '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              if (isGrouped) e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <Layers size={13} color={!isGrouped ? '#2563EB' : '#64748B'} />
            <span>{isGrouped ? 'WBS Group' : 'Flat List'}</span>
          </button>
        </div>

        {/* Phase 19: Urutkan Button */}
        <button
          onClick={onToggleSortModal}
          style={{
            height: '34px',
            padding: '0 10px',
            borderRadius: '6px',
            border: activeSortLabel ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
            background: activeSortLabel ? '#EFF6FF' : '#FFFFFF',
            fontSize: '12px',
            fontWeight: 600,
            color: activeSortLabel ? '#1D4ED8' : '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!activeSortLabel) e.currentTarget.style.background = '#F8FAFC';
          }}
          onMouseLeave={(e) => {
            if (!activeSortLabel) e.currentTarget.style.background = '#FFFFFF';
          }}
        >
          <ArrowUpDown size={13} color={activeSortLabel ? '#2563EB' : '#64748B'} />
          <span>{activeSortLabel ? `Urut: ${activeSortLabel} ${sortDirection === 'asc' ? '↑' : '↓'}` : 'Urutkan'}</span>
        </button>

        {/* Phase 20: Kolom Manager Dropdown Button */}
        <button
          onClick={onToggleColumnsModal}
          style={{
            height: '34px',
            padding: '0 10px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 600,
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
        >
          <Columns3 size={13} color="#64748B" />
          <span>Kolom</span>
          <ChevronDown size={11} color="#64748B" />
        </button>

        {/* Undo & Redo Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '4px', borderLeft: '1px solid #E2E8F0', paddingLeft: '8px' }}>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title={canUndo ? 'Undo (Ctrl+Z)' : 'Tidak ada riwayat untuk Undo'}
            style={{
              height: '34px',
              width: '34px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: canUndo ? '#FFFFFF' : '#F8FAFC',
              color: canUndo ? '#1E293B' : '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (canUndo) e.currentTarget.style.background = '#EFF6FF';
            }}
            onMouseLeave={(e) => {
              if (canUndo) e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title={canRedo ? 'Redo (Ctrl+Y / Ctrl+Shift+Z)' : 'Tidak ada riwayat untuk Redo'}
            style={{
              height: '34px',
              width: '34px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: canRedo ? '#FFFFFF' : '#F8FAFC',
              color: canRedo ? '#1E293B' : '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (canRedo) e.currentTarget.style.background = '#EFF6FF';
            }}
            onMouseLeave={(e) => {
              if (canRedo) e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <Redo2 size={14} />
          </button>
        </div>
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
        {/* Phase 10: SPLIT BUTTON [ + Tambah Item | ▼ ] */}
        <div ref={addMenuRef} style={{ display: 'inline-flex', position: 'relative', zIndex: 10 }}>
          {/* Main Smart Add Action */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddItem('selector');
            }}
            style={{
              height: '34px',
              padding: '0 12px',
              borderTopLeftRadius: '6px',
              borderBottomLeftRadius: '6px',
              background: '#2563EB',
              border: '1px solid #1D4ED8',
              borderRight: 'none',
              fontSize: '12.5px',
              fontWeight: 750,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
              transition: 'background 0.15s ease',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1D4ED8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#2563EB')}
          >
            <Plus size={15} color="#FFFFFF" strokeWidth={2.5} style={{ pointerEvents: 'none' }} />
            <span style={{ pointerEvents: 'none' }}>Tambah Item</span>
          </button>

          {/* Split Dropdown Trigger */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsAddMenuOpen((prev) => !prev);
            }}
            aria-label="Pilih metode penambahan item"
            style={{
              height: '34px',
              width: '28px',
              borderTopRightRadius: '6px',
              borderBottomRightRadius: '6px',
              background: '#1D4ED8',
              border: '1px solid #1D4ED8',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1E40AF')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#1D4ED8')}
          >
            <ChevronDown size={14} color="#FFFFFF" style={{ pointerEvents: 'none' }} />
          </button>

          {/* Split Dropdown Menu */}
          {isAddMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                width: '220px',
                zIndex: 60,
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddMenuOpen(false);
                  onAddItem('ahsp');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#0F172A',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <BookOpen size={14} color="#2563EB" />
                <div>
                  <div>Dari AHSP PUPR 2026</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 400 }}>Database analisa resmi</div>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddMenuOpen(false);
                  onAddItem('manual');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#0F172A',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#ECFDF5')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <PenTool size={14} color="#059669" />
                <div>
                  <div>Input Manual Mandiri</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 400 }}>Kustom uraian & harga</div>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddMenuOpen(false);
                  onAddItem('ai');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#0F172A',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF2FF')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Sparkles size={14} color="#6366F1" />
                <div>
                  <div>Dengan Magic AI</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 400 }}>Bahasa natural ke RAB</div>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddMenuOpen(false);
                  onAddItem('template');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#0F172A',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#FFFBEB')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <LayoutTemplate size={14} color="#D97706" />
                <div>
                  <div>Dari Template Proyek</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 400 }}>Paket WBS gedung</div>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddMenuOpen(false);
                  onAddItem('duplicate');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#0F172A',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#ECFEFF')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Copy size={14} color="#0891B2" />
                <div>
                  <div>Duplikasi Pekerjaan</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 400 }}>Salin item eksisting</div>
                </div>
              </button>

              <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />

              <button
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onOpenDocumentReview?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#1D4ED8',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FileText size={14} color="#2563EB" />
                <div>
                  <div>DED & AI Document Review</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 400 }}>QTO & audit gambar kerja</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Phase 21: SECONDARY / UTILITY MORE MENU (...) */}
        <div ref={moreMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsMoreMenuOpen((prev) => !prev)}
            aria-label="Fitur utilitas spreadsheet lainnya"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: isMoreMenuOpen ? '#F1F5F9' : '#FFFFFF',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
            onMouseLeave={(e) => {
              if (!isMoreMenuOpen) e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <MoreHorizontal size={15} />
          </button>

          {isMoreMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                width: '240px',
                zIndex: 60,
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onRefreshData?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <RefreshCw size={13} color="#64748B" />
                <span>Refresh Data</span>
              </button>

              <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />

              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onImportExcel?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FileSpreadsheet size={13} color="#059669" />
                <span>Import Excel (.xlsx)</span>
              </button>

              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onExportPackage?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Download size={13} color="#2563EB" />
                <span>Export / Download Paket RAB</span>
              </button>

              <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />

              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onValidateIntegrity?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <ShieldCheck size={13} color="#D97706" />
                <span>Validate Integritas RAB</span>
              </button>

              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onRecalculateTotals?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Calculator size={13} color="#6366F1" />
                <span>Recalculate Totals</span>
              </button>

              <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />

              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onResetView?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <RotateCcw size={13} color="#64748B" />
                <span>Reset View & Filter</span>
              </button>

              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenKeyboardShortcuts?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Keyboard size={13} color="#64748B" />
                <span>Keyboard Shortcuts</span>
              </button>

              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenVersionHistory?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 550,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <History size={13} color="#64748B" />
                <span>Activity / Version History</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
