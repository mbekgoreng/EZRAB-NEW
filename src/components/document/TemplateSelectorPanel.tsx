import React from 'react';
import { Layers, Star, Plus, Upload, Trash2, CheckCircle2 } from 'lucide-react';
import type { TemplateDefinition, DocumentDefinition } from '../../document-engine/types';

export interface TemplateSelectorPanelProps {
  definition: DocumentDefinition;
  availableTemplates: TemplateDefinition[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onDocxUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isImportingDocx: boolean;
  onDeleteCustomTemplate: (templateId: string) => void;
}

export const TemplateSelectorPanel: React.FC<TemplateSelectorPanelProps> = ({
  definition,
  availableTemplates,
  selectedTemplateId,
  onSelectTemplate,
  onDocxUpload,
  isImportingDocx,
  onDeleteCustomTemplate,
}) => {
  const builtinTemplates = availableTemplates.filter((t) => t.source === 'EZRAB');
  const customTemplates = availableTemplates.filter((t) => t.source === 'USER');
  const activeTemplate = availableTemplates.find((t) => t.id === selectedTemplateId) || availableTemplates[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Active Template Banner */}
      {activeTemplate && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1E3A8A 0%, #1E293B 100%)',
            color: '#fff',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 12px rgba(15,23,42,0.1)',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 750, color: '#93C5FD', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Template Aktif ({activeTemplate.source === 'EZRAB' ? '⭐ Template EZRAB' : '★ Template Saya'})
            </div>
            <h3 style={{ margin: '4px 0 2px', fontSize: 17, fontWeight: 800, color: '#FFFFFF' }}>
              {activeTemplate.name}
            </h3>
            <div style={{ fontSize: 12.5, color: '#CBD5E1' }}>
              {activeTemplate.description || 'Template resmi untuk dokumen proyek ini.'}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
            ✓ Sedang Digunakan
          </div>
        </div>
      )}

      {/* Upload Custom DOCX Template Card */}
      <div
        style={{
          background: '#fff',
          border: '2px dashed #93C5FD',
          borderRadius: 12,
          padding: '20px 24px',
          textAlign: 'center',
        }}
      >
        <Upload size={28} color="#2563EB" style={{ margin: '0 auto 8px' }} />
        <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 750, color: '#0F172A' }}>
          Upload Template Kustom (DOCX)
        </h4>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#64748B', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          Gunakan file Microsoft Word (.docx) format perusahaan Anda. EZRAB akan mendeteksi paragraf, tabel, dan variabel placeholder secara otomatis.
        </p>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 18px',
            background: '#2563EB',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: isImportingDocx ? 'wait' : 'pointer',
          }}
        >
          <Plus size={16} />
          <span>{isImportingDocx ? 'Membaca File DOCX...' : '+ Upload Template (.docx)'}</span>
          <input
            type="file"
            accept=".docx"
            disabled={isImportingDocx}
            onChange={onDocxUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Built-in Templates Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Star size={18} color="#EAB308" fill="#EAB308" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: '#0F172A' }}>
            Template Standar EZRAB
          </h3>
          <span style={{ fontSize: 12, color: '#64748B' }}>({builtinTemplates.length} varian)</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {builtinTemplates.map((tpl) => {
            const isSelected = tpl.id === selectedTemplateId;
            return (
              <div
                key={tpl.id}
                style={{
                  background: '#fff',
                  border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.1)' : 'none',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: '#0F172A' }}>
                      {tpl.name}
                    </h4>
                    {isSelected && (
                      <span style={{ background: '#DCFCE7', color: '#16A34A', fontSize: 11, fontWeight: 750, padding: '2px 8px', borderRadius: 6 }}>
                        Aktif
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#64748B', lineHeight: 1.45 }}>
                    {tpl.description}
                  </p>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 14 }}>
                    Kategori: {tpl.category} · Digunakan {tpl.usageCount || 0} kali
                  </div>
                </div>

                <button
                  onClick={() => onSelectTemplate(tpl.id)}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: isSelected ? '1px solid #2563EB' : '1px solid #CBD5E1',
                    background: isSelected ? '#EFF6FF' : '#fff',
                    color: isSelected ? '#2563EB' : '#334155',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isSelected ? '✓ Sedang Aktif' : 'Gunakan Template Ini'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Custom Templates Section */}
      {customTemplates.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>★</span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: '#0F172A' }}>
              Template Saya (Kustom)
            </h3>
            <span style={{ fontSize: 12, color: '#64748B' }}>({customTemplates.length} template)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {customTemplates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <div
                  key={tpl.id}
                  style={{
                    background: '#fff',
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: '#0F172A' }}>
                        {tpl.name}
                      </h4>
                      <button
                        onClick={() => onDeleteCustomTemplate(tpl.id)}
                        title="Hapus template kustom"
                        style={{ border: 0, background: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 650, marginBottom: 4 }}>
                      Sumber: DOCX Import
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748B' }}>
                      {tpl.description || 'Template kustom yang diupload oleh pengguna.'}
                    </p>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 14 }}>
                      Digunakan {tpl.usageCount || 0} kali
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectTemplate(tpl.id)}
                    style={{
                      width: '100%',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: isSelected ? '1px solid #2563EB' : '1px solid #CBD5E1',
                      background: isSelected ? '#EFF6FF' : '#fff',
                      color: isSelected ? '#2563EB' : '#334155',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isSelected ? '✓ Sedang Aktif' : 'Gunakan'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
