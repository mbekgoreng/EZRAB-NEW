import React from 'react';
import { ArrowRight, BriefcaseBusiness, FileCheck2, Files, ShieldCheck } from 'lucide-react';

interface EnterpriseEntryPageProps { onOpenDocuments?: () => void; }

export const EnterpriseEntryPage: React.FC<EnterpriseEntryPageProps> = ({ onOpenDocuments }) => (
  <main style={{ minHeight: 'calc(100vh - 64px)', padding: '48px 24px', background: '#F8FAFC' }}>
    <section style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #123E73 100%)', color: '#F8FAFC', borderRadius: 20, padding: '48px clamp(24px, 6vw, 72px)', boxShadow: '0 18px 45px rgba(15, 54, 100, 0.16)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#93C5FD', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em' }}><BriefcaseBusiness size={16} /> EZRAB ENTERPRISE</div>
        <h1 style={{ margin: '16px 0 12px', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-0.03em' }}>Professional Construction Workspace</h1>
        <p style={{ maxWidth: 620, margin: 0, color: '#CBD5E1', fontSize: 16, lineHeight: 1.7 }}>Kelola pekerjaan, data proyek, dokumen, template perusahaan, dan export profesional dalam satu workflow yang terstruktur.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginTop: 24 }}>
        {[[Files, 'Dokumen Proyek', 'Satu workspace untuk dokumen yang terhubung dengan data pekerjaan.'], [FileCheck2, 'Template Dokumen', 'Mulai dari template profesional, bukan halaman kosong.'], [ShieldCheck, 'Company Profile', 'Informasi perusahaan siap dipakai pada dokumen dan letterhead.'], [BriefcaseBusiness, 'Professional Export', 'Preview dan export PDF dengan data proyek yang konsisten.']].map(([Icon, title, description]) => { const FeatureIcon = Icon as typeof Files; return <article key={title as string} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}><FeatureIcon size={20} color="#2563EB" /><h2 style={{ margin: '14px 0 6px', fontSize: 15 }}>{title as string}</h2><p style={{ margin: 0, color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>{description as string}</p></article>; })}
      </div>
      <button type="button" onClick={onOpenDocuments} style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, borderRadius: 9, padding: '12px 18px', background: '#2563EB', color: '#FFFFFF', fontWeight: 750, cursor: 'pointer' }}>Buka Dokumen Proyek <ArrowRight size={16} /></button>
    </section>
  </main>
);