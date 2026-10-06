import React, { useState } from 'react';
import { X, UserCheck, Truck, ShieldAlert, Shield, Database } from 'lucide-react';
import { ProjectPersonnelView } from './ProjectPersonnelView';
import { ProjectEquipmentView } from './ProjectEquipmentView';
import { ProjectJsaView } from './ProjectJsaView';
import { ProjectRkkView } from './ProjectRkkView';
import { ProjectAhspView } from './ProjectAhspView';

export type ProjectSourceTab = 'personnel' | 'equipment' | 'jsa' | 'rkk' | 'ahsp';

interface ProjectSourceDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ProjectSourceTab;
  projectId: string;
  projectName?: string;
  onDataSaved?: () => void;
}

export const ProjectSourceDrawerModal: React.FC<ProjectSourceDrawerModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'personnel',
  projectId,
  projectName,
  onDataSaved,
}) => {
  const [activeTab, setActiveTab] = useState<ProjectSourceTab>(initialTab);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#F8FAFC',
          borderRadius: 14,
          width: '100%',
          maxWidth: 1080,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>
              Kelola Data Sumber Proyek
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: 12.5, color: '#64748B' }}>
              Perbarui data operasional proyek {projectName ? `"${projectName}"` : ''} untuk dokumen tender aktual.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 0,
              background: '#F1F5F9',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
          }}
        >
          {[
            { key: 'personnel', label: 'Personil Proyek', icon: <UserCheck size={16} /> },
            { key: 'equipment', label: 'Peralatan Proyek', icon: <Truck size={16} /> },
            { key: 'jsa', label: 'JSA / K3', icon: <ShieldAlert size={16} /> },
            { key: 'rkk', label: 'Rencana K3 (RKK)', icon: <Shield size={16} /> },
            { key: 'ahsp', label: 'AHSP Proyek', icon: <Database size={16} /> },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as ProjectSourceTab)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 0,
                  fontSize: 13,
                  fontWeight: 650,
                  cursor: 'pointer',
                  background: isActive ? '#EFF6FF' : 'transparent',
                  color: isActive ? '#2563EB' : '#64748B',
                  borderBottom: isActive ? '2px solid #2563EB' : '2px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'personnel' && (
            <ProjectPersonnelView projectId={projectId} projectName={projectName} onDataChanged={onDataSaved} />
          )}
          {activeTab === 'equipment' && (
            <ProjectEquipmentView projectId={projectId} projectName={projectName} onDataChanged={onDataSaved} />
          )}
          {activeTab === 'jsa' && (
            <ProjectJsaView projectId={projectId} projectName={projectName} onDataChanged={onDataSaved} />
          )}
          {activeTab === 'rkk' && (
            <ProjectRkkView projectId={projectId} projectName={projectName} onDataChanged={onDataSaved} />
          )}
          {activeTab === 'ahsp' && (
            <ProjectAhspView projectId={projectId} projectName={projectName} onDataChanged={onDataSaved} />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 24px',
            background: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#2563EB',
              color: '#FFFFFF',
              border: 0,
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Selesai & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
