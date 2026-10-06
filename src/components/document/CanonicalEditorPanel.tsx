import React, { useState } from 'react';
import {
  Edit3,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ChevronDown,
  FileText,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import type { CanonicalDocument, DocumentBlock, ParagraphBlock, HeadingBlock, SignatureBlock } from '../../document-engine/canonicalDocument';
import { AVAILABLE_CANONICAL_VARIABLES } from '../../document-engine/templateMapper';
import { resolveTemplateVariables } from '../../document-engine/templateEngine';

export interface CanonicalEditorPanelProps {
  canonicalDoc: CanonicalDocument;
  onUpdateBlock: (blockId: string, newContent: string) => void;
  onAddParagraph: () => void;
  onAddHeading: () => void;
  onDeleteBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: 'up' | 'down') => void;
  onInsertVariable: (variablePath: string) => void;
  isReadOnly?: boolean;
  contextValues?: Record<string, string>;
}

export const CanonicalEditorPanel: React.FC<CanonicalEditorPanelProps> = ({
  canonicalDoc,
  onUpdateBlock,
  onAddParagraph,
  onAddHeading,
  onDeleteBlock,
  onMoveBlock,
  onInsertVariable,
  isReadOnly = false,
  contextValues = {},
}) => {
  const [showInsertDataMenu, setShowInsertDataMenu] = useState(false);
  const [selectedBlockIdForInsert, setSelectedBlockIdForInsert] = useState<string | null>(null);

  const handleVariableClick = (variablePath: string) => {
    onInsertVariable(variablePath);
    setShowInsertDataMenu(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* TOOLBAR */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowInsertDataMenu(!showInsertDataMenu)}
              disabled={isReadOnly}
              style={{
                background: '#2563EB',
                color: '#fff',
                border: 0,
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: isReadOnly ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Sparkles size={15} />
              <span>+ Insert Data</span>
              <ChevronDown size={14} />
            </button>

            {/* DROPDOWN VARIABLE MENU */}
            {showInsertDataMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  background: '#fff',
                  border: '1px solid #CBD5E1',
                  borderRadius: 10,
                  boxShadow: '0 10px 25px -5px rgba(15,23,42,0.15)',
                  width: 320,
                  maxHeight: 380,
                  overflowY: 'auto',
                  zIndex: 50,
                  padding: 8,
                }}
              >
                <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Pilih Data Proyek Untuk Dimasukkan:
                </div>
                {AVAILABLE_CANONICAL_VARIABLES.map((cat) => (
                  <div key={cat.category} style={{ marginBottom: 8 }}>
                    <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 750, color: '#2563EB', background: '#F1F5F9', borderRadius: 4 }}>
                      {cat.category}
                    </div>
                    {cat.variables.map((v) => (
                      <button
                        key={v.path}
                        onClick={() => handleVariableClick(v.path)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '7px 10px',
                          border: 0,
                          background: 'transparent',
                          borderRadius: 6,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 12,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div>
                          <div style={{ fontWeight: 650, color: '#0F172A' }}>{v.label}</div>
                          <div style={{ fontSize: 10.5, color: '#64748B' }}>{`{{${v.path}}}`}</div>
                        </div>
                        {v.example && (
                          <span style={{ fontSize: 10.5, color: '#16A34A', background: '#DCFCE7', padding: '1px 6px', borderRadius: 4 }}>
                            {v.example}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: 24, width: 1, background: '#E2E8F0' }} />

          <button
            onClick={onAddParagraph}
            disabled={isReadOnly}
            style={{
              background: '#fff',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 650,
              color: '#334155',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Type size={14} /> + Paragraf
          </button>

          <button
            onClick={onAddHeading}
            disabled={isReadOnly}
            style={{
              background: '#fff',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 650,
              color: '#334155',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AlignLeft size={14} /> + Judul (Heading)
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#64748B' }}>
          {canonicalDoc.blocks.length} Blok Konten
        </div>
      </div>

      {/* BLOCKS LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {canonicalDoc.blocks.map((block, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === canonicalDoc.blocks.length - 1;

          return (
            <div
              key={block.id}
              style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: 16,
                boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              }}
            >
              {/* Block Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 750, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>
                    {block.type}
                  </span>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>#{idx + 1}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => onMoveBlock(block.id, 'up')}
                    disabled={isFirst || isReadOnly}
                    title="Geser Ke Atas"
                    style={{ border: 0, background: 'none', color: isFirst ? '#CBD5E1' : '#64748B', cursor: isFirst ? 'default' : 'pointer', padding: 4 }}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    onClick={() => onMoveBlock(block.id, 'down')}
                    disabled={isLast || isReadOnly}
                    title="Geser Ke Bawah"
                    style={{ border: 0, background: 'none', color: isLast ? '#CBD5E1' : '#64748B', cursor: isLast ? 'default' : 'pointer', padding: 4 }}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    onClick={() => onDeleteBlock(block.id)}
                    disabled={isReadOnly}
                    title="Hapus Blok"
                    style={{ border: 0, background: 'none', color: '#DC2626', cursor: isReadOnly ? 'not-allowed' : 'pointer', padding: 4, marginLeft: 6 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Block Body By Type */}
              {block.type === 'heading' && (
                <div>
                  <input
                    type="text"
                    value={(block as HeadingBlock).text}
                    disabled={isReadOnly}
                    onChange={(e) => onUpdateBlock(block.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 16,
                      fontWeight: 750,
                      border: '1px solid #CBD5E1',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {block.type === 'paragraph' && (
                <div>
                  <textarea
                    rows={4}
                    value={(block as ParagraphBlock).content}
                    disabled={isReadOnly}
                    onChange={(e) => onUpdateBlock(block.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 13,
                      lineHeight: 1.6,
                      border: '1px solid #CBD5E1',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                  {/* Live Resolved Preview */}
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, fontSize: 11.5, color: '#475569' }}>
                    <span style={{ fontWeight: 700, color: '#64748B' }}>Pratinjau Variabel Terisi: </span>
                    {resolveTextWithContext((block as ParagraphBlock).content, contextValues)}
                  </div>
                </div>
              )}

              {block.type === 'header' && (
                <div style={{ fontSize: 12, color: '#475569', background: '#F8FAFC', padding: 10, borderRadius: 6 }}>
                  <strong>Kop Perusahaan:</strong> {block.companyName} ({block.address || 'Alamat Perusahaan'})
                </div>
              )}

              {block.type === 'signature' && (
                <div style={{ fontSize: 12, color: '#475569', background: '#F8FAFC', padding: 10, borderRadius: 6 }}>
                  <strong>Area Tanda Tangan:</strong> {(block as SignatureBlock).signatories.map((s) => `${s.name} (${s.position})`).join(', ')}
                </div>
              )}

              {block.type === 'table' && (
                <div style={{ fontSize: 12, color: '#475569', background: '#F8FAFC', padding: 10, borderRadius: 6 }}>
                  <strong>Tabel Rincian:</strong> {block.caption || 'Tabel Terstruktur'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function resolveTextWithContext(text: string, context: Record<string, string>): string {
  let res = text;
  for (const [k, v] of Object.entries(context)) {
    res = res.split(`{{${k}}}`).join(v);
  }
  return res;
}
