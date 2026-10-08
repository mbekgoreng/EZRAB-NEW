import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Copy,
  MoreVertical,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Eye,
  Check,
  Layers,
  Sparkles,
  BookOpen,
  PenTool,
  LayoutTemplate,
} from 'lucide-react';
import { RabItem, VolumeSourceType } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { AddItemMode } from './SmartAddWorkItemModal';

export interface GroupedWbsCategory {
  categoryName: string;
  codeLetter: string;
  badgeColor: { bg: string; text: string; border: string };
  items: RabItem[];
  subtotal: number;
  subtotalVolume: number;
}

interface EstimatorSpreadsheetTableProps {
  groups: GroupedWbsCategory[];
  selectedItemIds: Set<string>;
  onToggleSelectItem: (id: string, shiftKey: boolean) => void;
  onToggleSelectAll: () => void;
  isAllSelected: boolean;
  activeCell: { itemId: string; column: string } | null;
  onCellClick: (itemId: string, column: string) => void;
  editingCell: { itemId: string; column: string } | null;
  editValue: string;
  onEditValueChange: (val: string) => void;
  onStartEditing: (itemId: string, column: string, val: any) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onEditKeyDown: (e: React.KeyboardEvent, itemId: string, column: string, val: any) => void;
  collapsedCategories: Record<string, boolean>;
  onToggleCollapseCategory: (catName: string) => void;
  onOpenInspector: (item: RabItem) => void;
  onDuplicateItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onInsertRowAbove: (item: RabItem) => void;
  onInsertRowBelow: (item: RabItem) => void;
  onContextMenu: (e: React.MouseEvent, item: RabItem) => void;
  onAddNewItem?: (mode?: AddItemMode, categoryContext?: string) => void;
  onOpenTemplates?: () => void;
  onOpenMagicAi?: () => void;
  visibleColumns?: Record<string, boolean>;
}

export const EstimatorSpreadsheetTable: React.FC<EstimatorSpreadsheetTableProps> = ({
  groups,
  selectedItemIds,
  onToggleSelectItem,
  onToggleSelectAll,
  isAllSelected,
  activeCell,
  onCellClick,
  editingCell,
  editValue,
  onEditValueChange,
  onStartEditing,
  onCommitEdit,
  onCancelEdit,
  onEditKeyDown,
  collapsedCategories,
  onToggleCollapseCategory,
  onOpenInspector,
  onDuplicateItem,
  onDeleteItem,
  onInsertRowAbove,
  onInsertRowBelow,
  onContextMenu,
  onAddNewItem,
  onOpenTemplates,
  onOpenMagicAi,
  visibleColumns = {
    no: true,
    code: true,
    description: true,
    volume: true,
    unit: true,
    unitPrice: true,
    amount: true,
    volumeSource: true,
  },
}) => {
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return window.innerWidth < 768;
    return false;
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Close row menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => {
      if (openRowMenuId) setOpenRowMenuId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [openRowMenuId]);

  // Calculate total visible column count for colspan calculations
  const totalVisibleCols =
    1 + // Checkbox
    (visibleColumns.no !== false ? 1 : 0) +
    (visibleColumns.code !== false ? 1 : 0) +
    1 + // Description (mandatory)
    (visibleColumns.volume !== false ? 1 : 0) +
    (visibleColumns.unit !== false ? 1 : 0) +
    (visibleColumns.unitPrice !== false ? 1 : 0) +
    1 + // Amount (mandatory)
    (visibleColumns.volumeSource !== false ? 1 : 0) +
    1; // Actions

  const totalItemsAcrossGroups = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        position: 'relative',
      }}
    >
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '12.5px',
          }}
        >
          {/* TABLE HEADER */}
          <thead>
            <tr
              style={{
                background: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                color: '#475569',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'none',
                letterSpacing: '0.01em',
                userSelect: 'none',
              }}
            >
              {/* Select All Checkbox */}
              <th style={{ width: '36px', padding: '10px 8px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Pilih semua item"
                  style={{
                    width: '15px',
                    height: '15px',
                    accentColor: '#2563EB',
                    cursor: 'pointer',
                  }}
                />
              </th>
              {/* No */}
              {visibleColumns.no !== false && (
                <th className="tablet-up" style={{ width: '45px', padding: '10px 8px', textAlign: 'center' }}>No</th>
              )}
              {/* Kode AHSP */}
              {visibleColumns.code !== false && (
                <th className="tablet-up" style={{ width: '110px', padding: '10px 12px' }}>Kode AHSP</th>
              )}
              {/* Uraian Pekerjaan (Wide - Mandatory) */}
              <th style={{ minWidth: '180px', padding: '10px 12px' }}>Uraian Pekerjaan</th>
              {/* Volume */}
              {visibleColumns.volume !== false && (
                <th style={{ width: '85px', padding: '10px 10px', textAlign: 'right' }}>Volume</th>
              )}
              {/* Satuan */}
              {visibleColumns.unit !== false && (
                <th style={{ width: '55px', padding: '10px 6px', textAlign: 'center' }}>Satuan</th>
              )}
              {/* Harga Satuan */}
              {visibleColumns.unitPrice !== false && (
                <th className="tablet-up" style={{ width: '130px', padding: '10px 12px', textAlign: 'right' }}>Harga Satuan (Rp)</th>
              )}
              {/* Jumlah (Mandatory) */}
              <th style={{ width: '130px', padding: '10px 12px', textAlign: 'right' }}>Jumlah (Rp)</th>
              {/* Sumber */}
              {visibleColumns.volumeSource !== false && (
                <th className="tablet-up" style={{ width: '95px', padding: '10px 8px', textAlign: 'center' }}>Sumber</th>
              )}
              {/* Aksi */}
              <th style={{ width: '90px', padding: '10px 8px', textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>

          {/* TABLE BODY */}
          <tbody>
            {groups.length === 0 || totalItemsAcrossGroups === 0 ? (
              /* Phase 22: Rich Empty State */
              <tr>
                <td colSpan={totalVisibleCols} style={{ padding: '64px 24px', textAlign: 'center' }}>
                  <div
                    style={{
                      maxWidth: '480px',
                      margin: '0 auto',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        background: '#EFF6FF',
                        border: '1px solid #DBEAFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#2563EB',
                      }}
                    >
                      <Layers size={28} />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      Belum Ada Pekerjaan
                    </h3>
                    <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                      Mulai membangun RAB proyek Anda. Pilih salah satu cara berikut untuk menambahkan rincian pekerjaan:
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        marginTop: '8px',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                      }}
                    >
                      {onAddNewItem && (
                        <button
                          onClick={() => onAddNewItem('ahsp')}
                          style={{
                            padding: '9px 16px',
                            borderRadius: '8px',
                            background: '#2563EB',
                            color: '#FFFFFF',
                            fontSize: '12.5px',
                            fontWeight: 750,
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
                          }}
                        >
                          <BookOpen size={14} />
                          <span>Dari AHSP</span>
                        </button>
                      )}
                      {onAddNewItem && (
                        <button
                          onClick={() => onAddNewItem('manual')}
                          style={{
                            padding: '9px 16px',
                            borderRadius: '8px',
                            background: '#F0FDF4',
                            color: '#16A34A',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            border: '1px solid #DCFCE7',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <PenTool size={14} color="#16A34A" />
                          <span>Manual</span>
                        </button>
                      )}
                      {onAddNewItem && (
                        <button
                          onClick={() => onAddNewItem('ai')}
                          style={{
                            padding: '9px 16px',
                            borderRadius: '8px',
                            background: '#EFF6FF',
                            color: '#2563EB',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            border: '1px solid #DBEAFE',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Sparkles size={14} color="#2563EB" />
                          <span>Dengan AI</span>
                        </button>
                      )}
                      {onAddNewItem && (
                        <button
                          onClick={() => onAddNewItem('template')}
                          style={{
                            padding: '9px 16px',
                            borderRadius: '8px',
                            background: '#FFFBEB',
                            color: '#D97706',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            border: '1px solid #FEF3C7',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <LayoutTemplate size={14} color="#D97706" />
                          <span>Template</span>
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const isCollapsed = collapsedCategories[group.categoryName];

                return (
                  <React.Fragment key={group.categoryName}>
                    {/* WBS GROUP HEADER ROW */}
                    <tr
                      style={{
                        background: '#F8FAFC',
                        borderTop: '1px solid #E2E8F0',
                        borderBottom: '1px solid #E2E8F0',
                        userSelect: 'none',
                      }}
                    >
                      {/* Checkbox Placeholder / Toggle indicator */}
                      <td
                        onClick={() => onToggleCollapseCategory(group.categoryName)}
                        style={{ textAlign: 'center', padding: '10px 12px', cursor: 'pointer' }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#64748B',
                          }}
                        >
                          {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        </span>
                      </td>

                      {/* Group Badge Letter (A, B, C, D, E...) */}
                      {visibleColumns.no !== false && (
                        <td
                          className="tablet-up"
                          onClick={() => onToggleCollapseCategory(group.categoryName)}
                          style={{ textAlign: 'center', padding: '8px', cursor: 'pointer' }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '22px',
                              height: '22px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: group.badgeColor.bg,
                              color: group.badgeColor.text,
                              border: `1px solid ${group.badgeColor.border}`,
                            }}
                          >
                            {group.codeLetter}
                          </span>
                        </td>
                      )}

                      {/* Group Title & Item Count Pill */}
                      <td
                        colSpan={
                          Math.max(
                            1,
                            (visibleColumns.code !== false ? 1 : 0) +
                              1 + // description
                              (visibleColumns.volume !== false ? 1 : 0) +
                              (visibleColumns.unit !== false ? 1 : 0) +
                              (visibleColumns.unitPrice !== false ? 1 : 0)
                          )
                        }
                        onClick={() => onToggleCollapseCategory(group.categoryName)}
                        style={{ padding: '10px 12px', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 750, color: '#0F172A' }}>
                            {group.categoryName}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '1px 7px',
                              borderRadius: '999px',
                              background: '#EFF6FF',
                              color: '#2563EB',
                              border: '1px solid #DBEAFE',
                            }}
                          >
                            {group.items.length} item
                          </span>
                        </div>
                      </td>

                      {/* Group Subtotal (Right-aligned) */}
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 800,
                          fontSize: '13px',
                          color: '#0F172A',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatCurrencyIDR(group.subtotal)}
                      </td>

                      {/* Source column spacer if visible */}
                      {visibleColumns.volumeSource !== false && (
                        <td className="tablet-up" style={{ padding: '8px' }} />
                      )}

                      {/* Inline + Tambah Item in this specific WBS */}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {onAddNewItem && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddNewItem('selector', group.categoryName);
                            }}
                            title={`+ Tambah item di kelompok ${group.categoryName}`}
                            style={{
                              height: '24px',
                              padding: '0 8px',
                              borderRadius: '4px',
                              background: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#2563EB',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <Plus size={12} />
                            <span>Tambah</span>
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* GROUP ITEM ROWS (Render if not collapsed) */}
                    {!isCollapsed &&
                      group.items.map((item, index) => {
                        const isSelected = selectedItemIds.has(item.id);
                        const isRowActive = activeCell?.itemId === item.id;
                        const itemTotal = (item.amount || item.totalPrice || item.volume * item.unitPrice) || 0;

                        return (
                          <tr
                            key={item.id}
                            onContextMenu={(e) => onContextMenu(e, item)}
                            style={{
                              background: isSelected ? '#EFF6FF' : isRowActive ? '#F8FAFC' : '#FFFFFF',
                              borderBottom: '1px solid #F1F5F9',
                              transition: 'background 0.12s ease',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected && !isRowActive) e.currentTarget.style.background = '#F8FAFC';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected && !isRowActive) e.currentTarget.style.background = '#FFFFFF';
                            }}
                          >
                            {/* 1. Checkbox */}
                            <td style={{ textAlign: 'center', padding: '9px 12px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => onToggleSelectItem(item.id, (e.nativeEvent as MouseEvent).shiftKey)}
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  accentColor: '#2563EB',
                                  cursor: 'pointer',
                                }}
                              />
                            </td>

                            {/* 2. Item Number */}
                            {visibleColumns.no !== false && (
                              <td className="tablet-up" style={{ textAlign: 'center', color: '#64748B', fontSize: '11.5px', padding: '9px 8px' }}>
                                {index + 1}
                              </td>
                            )}

                            {/* 3. Kode AHSP */}
                            {visibleColumns.code !== false && (
                              <td
                                className="tablet-up"
                                onClick={() => onCellClick(item.id, 'code')}
                                onDoubleClick={() => onStartEditing(item.id, 'code', item.code || item.ahspCode)}
                                style={{
                                  padding: '9px 12px',
                                  color: '#64748B',
                                  fontFamily: 'monospace',
                                  fontSize: '11.5px',
                                  cursor: 'text',
                                }}
                              >
                                {editingCell?.itemId === item.id && editingCell?.column === 'code' ? (
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => onEditValueChange(e.target.value)}
                                    onKeyDown={(e) => onEditKeyDown(e, item.id, 'code', item.code)}
                                    onBlur={onCommitEdit}
                                    style={{
                                      width: '100%',
                                      padding: '2px 4px',
                                      fontSize: '11.5px',
                                      fontFamily: 'monospace',
                                      border: '1px solid #2563EB',
                                      borderRadius: '4px',
                                      outline: 'none',
                                    }}
                                  />
                                ) : (
                                  <span>{item.code || item.ahspCode || '—'}</span>
                                )}
                              </td>
                            )}

                            {/* 4. Uraian Pekerjaan */}
                            <td
                              onClick={() => onCellClick(item.id, 'description')}
                              onDoubleClick={() => onStartEditing(item.id, 'description', item.description)}
                              style={{
                                padding: '9px 12px',
                                color: '#0F172A',
                                fontWeight: 600,
                                fontSize: '12.5px',
                                cursor: 'text',
                              }}
                            >
                              {editingCell?.itemId === item.id && editingCell?.column === 'description' ? (
                                <input
                                  ref={inputRef}
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => onEditValueChange(e.target.value)}
                                  onKeyDown={(e) => onEditKeyDown(e, item.id, 'description', item.description)}
                                  onBlur={onCommitEdit}
                                  style={{
                                    width: '100%',
                                    padding: '3px 6px',
                                    fontSize: '12.5px',
                                    border: '1px solid #2563EB',
                                    borderRadius: '4px',
                                    outline: 'none',
                                  }}
                                />
                              ) : (
                                <div>
                                  <div>{item.description}</div>
                                  {/* P1 PRICE-1: tampilkan item yang butuh verifikasi */}
                                  {(item.priceStatus === 'PRICE_UNRESOLVED' || item.verificationStatus === 'NEEDS_VERIFICATION') && (
                                    <span
                                      title={item.priceStatus === 'PRICE_UNRESOLVED' ? 'Harga satuan belum diisi — bukan Rp0. Isi harga nyata.' : 'Item ini perlu diverifikasi.'}
                                      style={{ display: 'inline-block', background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, marginTop: '3px' }}
                                    >
                                      ⚠ {item.priceStatus === 'PRICE_UNRESOLVED' ? 'Harga belum diisi' : 'Perlu verifikasi'}
                                    </span>
                                  )}
                                  <div
                                    className="mobile-only"
                                    style={{
                                      fontSize: '11px',
                                      color: '#64748B',
                                      marginTop: '3px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      flexWrap: 'wrap',
                                      fontWeight: 400,
                                    }}
                                  >
                                    {(item.code || item.ahspCode) && (
                                      <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>
                                        {item.code || item.ahspCode}
                                      </span>
                                    )}
                                    <span>@ Rp {item.unitPrice.toLocaleString('id-ID')}</span>
                                    {item.volumeSource && (
                                      <span style={{ background: '#EFF6FF', color: '#2563EB', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>
                                        {item.volumeSource}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* 5. Volume */}
                            {visibleColumns.volume !== false && (
                              <td
                                onClick={() => onCellClick(item.id, 'volume')}
                                onDoubleClick={() => onStartEditing(item.id, 'volume', item.volume)}
                                style={{
                                  padding: '9px 12px',
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: '#2563EB',
                                  fontVariantNumeric: 'tabular-nums',
                                  cursor: 'text',
                                }}
                              >
                                {editingCell?.itemId === item.id && editingCell?.column === 'volume' ? (
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    inputMode="decimal"
                                    value={editValue}
                                    onChange={(e) => onEditValueChange(e.target.value)}
                                    onKeyDown={(e) => onEditKeyDown(e, item.id, 'volume', item.volume)}
                                    onBlur={onCommitEdit}
                                    style={{
                                      width: '75px',
                                      padding: '2px 4px',
                                      textAlign: 'right',
                                      fontSize: '12px',
                                      border: '1px solid #2563EB',
                                      borderRadius: '4px',
                                      outline: 'none',
                                    }}
                                  />
                                ) : (
                                  <span>
                                    {item.volume.toLocaleString('id-ID', {
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                )}
                              </td>
                            )}

                            {/* 6. Satuan */}
                            {visibleColumns.unit !== false && (
                              <td
                                onClick={() => onCellClick(item.id, 'unit')}
                                onDoubleClick={() => onStartEditing(item.id, 'unit', item.unit)}
                                style={{
                                  padding: '9px 8px',
                                  textAlign: 'center',
                                  color: '#64748B',
                                  fontSize: '11.5px',
                                  cursor: 'text',
                                }}
                              >
                                {editingCell?.itemId === item.id && editingCell?.column === 'unit' ? (
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => onEditValueChange(e.target.value)}
                                    onKeyDown={(e) => onEditKeyDown(e, item.id, 'unit', item.unit)}
                                    onBlur={onCommitEdit}
                                    style={{
                                      width: '45px',
                                      padding: '2px 4px',
                                      textAlign: 'center',
                                      fontSize: '11.5px',
                                      border: '1px solid #2563EB',
                                      borderRadius: '4px',
                                      outline: 'none',
                                    }}
                                  />
                                ) : (
                                  <span>{item.unit}</span>
                                )}
                              </td>
                            )}

                            {/* 7. Harga Satuan */}
                            {visibleColumns.unitPrice !== false && (
                              <td
                                className="tablet-up"
                                onClick={() => onCellClick(item.id, 'unitPrice')}
                                onDoubleClick={() => onStartEditing(item.id, 'unitPrice', item.unitPrice)}
                                style={{
                                  padding: '9px 12px',
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  color: '#334155',
                                  fontVariantNumeric: 'tabular-nums',
                                  cursor: 'text',
                                }}
                              >
                                {editingCell?.itemId === item.id && editingCell?.column === 'unitPrice' ? (
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={editValue}
                                    onChange={(e) => onEditValueChange(e.target.value)}
                                    onKeyDown={(e) => onEditKeyDown(e, item.id, 'unitPrice', item.unitPrice)}
                                    onBlur={onCommitEdit}
                                    style={{
                                      width: '100px',
                                      padding: '2px 4px',
                                      textAlign: 'right',
                                      fontSize: '12px',
                                      border: '1px solid #2563EB',
                                      borderRadius: '4px',
                                      outline: 'none',
                                    }}
                                  />
                                ) : (
                                  <span>{formatCurrencyIDR(item.unitPrice)}</span>
                                )}
                              </td>
                            )}

                            {/* 8. Jumlah / Total Harga */}
                            <td
                              style={{
                                padding: '9px 12px',
                                textAlign: 'right',
                                fontWeight: 800,
                                color: '#0F172A',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatCurrencyIDR(itemTotal)}
                            </td>

                            {/* 9. Sumber Data */}
                            {visibleColumns.volumeSource !== false && (
                              <td className="tablet-up" style={{ padding: '9px 8px', textAlign: 'center' }}>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background:
                                      item.volumeSource === 'CALCULATOR'
                                        ? '#EEF2FF'
                                        : item.volumeSource === 'MANUAL'
                                        ? '#ECFDF5'
                                        : '#EFF6FF',
                                    color:
                                      item.volumeSource === 'CALCULATOR'
                                        ? '#4338CA'
                                        : item.volumeSource === 'MANUAL'
                                        ? '#047857'
                                        : '#1D4ED8',
                                    border:
                                      item.volumeSource === 'CALCULATOR'
                                        ? '1px solid #C7D2FE'
                                        : item.volumeSource === 'MANUAL'
                                        ? '1px solid #A7F3D0'
                                        : '1px solid #BFDBFE',
                                  }}
                                >
                                  {item.volumeSource || 'MANUAL'}
                                </span>
                              </td>
                            )}

                            {/* 10. Aksi / Menu Baris */}
                            <td style={{ textAlign: 'center', padding: '9px 8px', position: 'relative' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                <button
                                  onClick={() => onOpenInspector(item)}
                                  title="Buka Analisa AHSP"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#64748B',
                                    cursor: 'pointer',
                                    padding: '3px',
                                    borderRadius: '4px',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
                                >
                                  <Eye size={14} />
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenRowMenuId((prev) => (prev === item.id ? null : item.id));
                                  }}
                                  title="Menu Baris"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#64748B',
                                    cursor: 'pointer',
                                    padding: '3px',
                                    borderRadius: '4px',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
                                >
                                  <MoreVertical size={14} />
                                </button>
                              </div>

                              {/* Row Menu Dropdown */}
                              {openRowMenuId === item.id && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '32px',
                                    background: '#FFFFFF',
                                    borderRadius: '8px',
                                    border: '1px solid #E2E8F0',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                    zIndex: 50,
                                    width: '180px',
                                    padding: '4px',
                                    textAlign: 'left',
                                  }}
                                >
                                  <button
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      onOpenInspector(item);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      width: '100%',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#334155',
                                      fontSize: '11.5px',
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <Eye size={12} color="#2563EB" />
                                    <span>Buka Rincian AHSP</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      onDuplicateItem(item.id);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      width: '100%',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#334155',
                                      fontSize: '11.5px',
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <Copy size={12} color="#059669" />
                                    <span>Duplikasi Item</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      onInsertRowAbove(item);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      width: '100%',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#334155',
                                      fontSize: '11.5px',
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <ArrowUp size={12} color="#64748B" />
                                    <span>Sisipkan di Atas</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      onInsertRowBelow(item);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      width: '100%',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#334155',
                                      fontSize: '11.5px',
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <ArrowDown size={12} color="#64748B" />
                                    <span>Sisipkan di Bawah</span>
                                  </button>

                                  <div style={{ height: '1px', background: '#F1F5F9', margin: '3px 0' }} />

                                  <button
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      onDeleteItem(item.id);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      width: '100%',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#EF4444',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <Trash2 size={12} color="#EF4444" />
                                    <span>Hapus Item</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
