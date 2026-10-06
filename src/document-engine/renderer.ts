import type { DocumentData, DocumentDefinition, RenderedDocument } from './types';

export const renderDocument = (
  definition: DocumentDefinition,
  data: DocumentData
): RenderedDocument => {
  const revNum = data.revision !== undefined ? data.revision : 0;
  const revStr = `REV ${String(revNum).padStart(2, '0')}`;

  let tables: Array<Record<string, unknown>> = [];
  let tableColumns: Array<{ key: string; label: string; width?: number }> = [];

  const defId = definition.id.toLowerCase();
  const defCategory = definition.category;

  if (defId === 'boq' || (defCategory === 'COMMERCIAL' && data.boq.length > 0 && defId !== 'rab' && defId !== 'ahsp')) {
    tables = data.boq;
    tableColumns = [
      { key: 'no', label: 'NO', width: 8 },
      { key: 'code', label: 'CODE', width: 14 },
      { key: 'item', label: 'ITEM', width: 24 },
      { key: 'description', label: 'DESCRIPTION', width: 30 },
      { key: 'specification', label: 'SPECIFICATION', width: 20 },
      { key: 'unit', label: 'UNIT', width: 10 },
      { key: 'quantity', label: 'QTY', width: 12 },
      { key: 'unitPrice', label: 'UNIT PRICE', width: 16 },
      { key: 'total', label: 'TOTAL', width: 18 },
    ];
  } else if (defId === 'rab' || (data.rab.length > 0 && defId !== 'ahsp')) {
    tables = data.rab;
    tableColumns = [
      { key: 'no', label: 'NO', width: 8 },
      { key: 'workItem', label: 'URAIAN PEKERJAAN', width: 32 },
      { key: 'description', label: 'SPESIFIKASI', width: 28 },
      { key: 'unit', label: 'SATUAN', width: 10 },
      { key: 'quantity', label: 'VOLUME', width: 12 },
      { key: 'unitPrice', label: 'HARGA SATUAN', width: 16 },
      { key: 'amount', label: 'JUMLAH HARGA', width: 18 },
    ];
  } else if (defId === 'schedule' || defCategory === 'SCHEDULE') {
    tables = data.schedule;
    tableColumns = [
      { key: 'no', label: 'NO', width: 8 },
      { key: 'activity', label: 'KEGIATAN / AKTIVITAS', width: 36 },
      { key: 'duration', label: 'DURASI (MG)', width: 14 },
      { key: 'start', label: 'MULAI', width: 14 },
      { key: 'finish', label: 'SELESAI', width: 14 },
      { key: 'weight', label: 'BOBOT (%)', width: 12 },
      { key: 'progress', label: 'PROGRESS (%)', width: 14 },
    ];
  } else if (defId === 'personnel-list' || defId === 'personnel') {
    tables = data.personnel.length > 0 ? data.personnel : data.equipment;
    tableColumns = [
      { key: 'name', label: 'NAMA PERSONIL / ALAT', width: 24 },
      { key: 'position', label: 'POSISI / JENIS', width: 20 },
      { key: 'qualification', label: 'KUALIFIKASI / SPESIFIKASI', width: 28 },
      { key: 'experience', label: 'PENGALAMAN / KONDISI', width: 20 },
    ];
  } else if (defId === 'ahsp' && data.ahsp.length > 0) {
    tables = data.ahsp;
    tableColumns = [
      { key: 'code', label: 'KODE AHSP', width: 16 },
      { key: 'description', label: 'URAIAN', width: 36 },
      { key: 'unit', label: 'SATUAN', width: 10 },
      { key: 'coefficient', label: 'KOEFISIEN', width: 12 },
      { key: 'unitPrice', label: 'HARGA SATUAN', width: 16 },
      { key: 'amount', label: 'JUMLAH', width: 18 },
    ];
  } else if (defId === 'jsa' || (defCategory === 'HSE' && data.jsa.length > 0)) {
    tables = data.jsa;
    tableColumns = [
      { key: 'activity', label: 'AKTIVITAS PEKERJAAN', width: 28 },
      { key: 'hazard', label: 'POTENSI BAHAYA', width: 24 },
      { key: 'riskLevel', label: 'TINGKAT RISIKO', width: 14 },
      { key: 'controlMeasure', label: 'PENGENDALIAN (MITIGASI)', width: 34 },
    ];
  } else if (defId === 'rkk' && data.rkk.length > 0) {
    tables = data.rkk;
    tableColumns = [
      { key: 'organization', label: 'STRUKTUR ORGANISASI K3', width: 30 },
      { key: 'hsePersonnel', label: 'PERSONIL K3', width: 24 },
      { key: 'safetyObjectives', label: 'SASARAN K3', width: 24 },
      { key: 'riskControls', label: 'PENGENDALIAN RISIKO', width: 22 },
    ];
  } else if (defId === 'equipment' && data.equipment.length > 0) {
    tables = data.equipment;
    tableColumns = [
      { key: 'name', label: 'NAMA PERALATAN', width: 24 },
      { key: 'type', label: 'TIPE / JENIS', width: 20 },
      { key: 'quantity', label: 'JUMLAH', width: 12 },
      { key: 'capacity', label: 'KAPASITAS', width: 24 },
      { key: 'condition', label: 'KONDISI', width: 20 },
    ];
  }

  const signatory = data.company.signatory || data.project.director || '';
  const hasSignatory = Boolean(signatory.trim());

  return {
    metadata: {
      code: definition.code,
      name: definition.name,
      category: definition.category,
      revision: revStr,
      revisionNumber: revNum,
      project: data.project.projectName || '—',
      date: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
      owner: data.project.owner || '—',
      contractor: data.project.contractor || data.company.name || '—',
      location: data.project.location || '—',
      contractValue: data.project.contractValue,
    },
    sections: [
      'Cover & Header',
      'Document Information',
      'Project Information',
      'Scope of Works / Content',
      tables.length > 0 ? 'Data Tables' : '',
      'Formal Signatures',
      'Attachments & Metadata',
    ].filter(Boolean),
    tables,
    tableColumns,
    signatures: [
      {
        name: hasSignatory ? signatory : '____________________',
        position: data.company.signatoryPosition || 'Direktur Utama / Authorized Representative',
        signatureImage: data.company.signature,
        isPlaceholder: !hasSignatory,
      },
    ],
    warnings: [],
  };
};