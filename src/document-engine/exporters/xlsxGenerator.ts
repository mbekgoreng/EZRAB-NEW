import ExcelJS from 'exceljs';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import type { DocumentData, DocumentDefinition, RenderedDocument } from '../types';

export const generateXlsx = async (
  definition: DocumentDefinition,
  data: DocumentData,
  _renderedDoc?: RenderedDocument,
  revision?: number
): Promise<Blob> => {
  const wb = new ExcelJS.Workbook();
  const revNum = revision !== undefined ? revision : data.revision !== undefined ? data.revision : 0;
  const revStr = `REV ${String(revNum).padStart(2, '0')}`;

  const preferredName = ['boq', 'rab', 'ahsp', 'jsa', 'rkk', 'schedule', 'recap'].includes(definition.id.toLowerCase())
    ? definition.id.toUpperCase()
    : definition.code || definition.name;
  const sheetName = preferredName.slice(0, 31).replace(/[\\/?*:[\]]/g, '-');
  const ws = wb.addWorksheet(sheetName);

  // 1. Header Banner
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `${definition.code} — ${definition.name} (${revStr})`;
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E40AF' } };

  ws.getCell('A2').value = `Proyek: ${data.project.projectName || '—'}   |   Pemilik: ${data.project.owner || '—'}`;
  ws.getCell('A2').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };

  ws.getCell('A3').value = `Kontraktor: ${data.project.contractor || data.company.name || '—'}   |   Tanggal: ${new Date().toLocaleDateString('id-ID')}`;
  ws.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };

  ws.addRow([]); // Blank line at row 4

  // Determine schema: BOQ, RAB, AHSP, Schedule, JSA, RKK, Personnel, Equipment
  const defId = definition.id.toLowerCase();
  const isBoq = defId === 'boq' || (definition.category === 'COMMERCIAL' && data.boq.length > 0 && defId !== 'rab' && defId !== 'ahsp');
  const isAhsp = defId === 'ahsp' || (data.ahsp.length > 0 && defId.includes('ahsp'));
  const isSchedule = defId === 'schedule' || definition.category === 'SCHEDULE';
  const isJsa = defId === 'jsa' || (definition.category === 'HSE' && defId.includes('jsa'));
  const isRkk = defId === 'rkk' || (definition.category === 'HSE' && defId.includes('rkk'));
  const isPersonnel = defId.includes('personnel') || defId.includes('personil');
  const isEquipment = defId.includes('equipment') || defId.includes('alat');
  const isRab = defId === 'rab' || (!isBoq && !isAhsp && !isSchedule && !isJsa && !isRkk && !isPersonnel && !isEquipment && data.rab.length > 0);

  let headerRowIdx = 5;

  if (isBoq) {
    // 9 Columns: NO | CODE | ITEM | DESCRIPTION | SPECIFICATION | UNIT | QTY | UNIT PRICE | TOTAL
    const headers = ['NO', 'CODE', 'ITEM', 'DESCRIPTION', 'SPECIFICATION', 'UNIT', 'QTY', 'UNIT PRICE', 'TOTAL'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'code', width: 14 },
      { key: 'item', width: 26 },
      { key: 'desc', width: 34 },
      { key: 'spec', width: 22 },
      { key: 'unit', width: 10 },
      { key: 'qty', width: 12 },
      { key: 'price', width: 18 },
      { key: 'total', width: 20 },
    ];

    const rows = data.boq;
    const startDataRow = headerRowIdx + 1;

    rows.forEach((x, idx) => {
      const rowNumber = startDataRow + idx;
      const r = ws.addRow([
        idx + 1,
        x.code || '',
        x.item || x.description || '',
        x.description || '',
        x.specification || '',
        x.unit || '',
        Number(x.quantity ?? x.qty) || 0,
        Number(x.unitPrice) || 0,
        null,
      ]);

      // Row formula: QTY (G) * UNIT PRICE (H)
      r.getCell(9).value = { formula: `G${rowNumber}*H${rowNumber}` };
      r.getCell(7).numFmt = '#,##0.00';
      r.getCell(8).numFmt = '#,##0';
      r.getCell(9).numFmt = '#,##0';
    });

    if (rows.length > 0) {
      const endDataRow = startDataRow + rows.length - 1;
      const totalRow = ws.addRow(['', '', '', '', '', '', '', 'GRAND TOTAL', null]);
      totalRow.font = { bold: true };
      totalRow.getCell(9).value = { formula: `SUM(I${startDataRow}:I${endDataRow})` };
      totalRow.getCell(9).numFmt = '#,##0';
    }
  } else if (isAhsp) {
    // AHSP: NO | KODE AHSP | URAIAN | SATUAN | KOEFISIEN | HARGA SATUAN | JUMLAH
    const headers = ['NO', 'KODE AHSP', 'URAIAN', 'SATUAN', 'KOEFISIEN', 'HARGA SATUAN', 'JUMLAH'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'code', width: 16 },
      { key: 'desc', width: 36 },
      { key: 'unit', width: 10 },
      { key: 'coef', width: 14 },
      { key: 'price', width: 18 },
      { key: 'amount', width: 20 },
    ];

    const rows = data.ahsp;
    const startDataRow = headerRowIdx + 1;

    rows.forEach((x, idx) => {
      const rowNumber = startDataRow + idx;
      const r = ws.addRow([
        idx + 1,
        x.code || '',
        x.description || x.name || '',
        x.unit || '',
        Number(x.coefficient ?? x.coef) || 0,
        Number(x.unitPrice ?? x.price) || 0,
        null,
      ]);

      // Row formula: KOEFISIEN (E) * HARGA SATUAN (F)
      r.getCell(7).value = { formula: `E${rowNumber}*F${rowNumber}` };
      r.getCell(5).numFmt = '#,##0.0000';
      r.getCell(6).numFmt = '#,##0';
      r.getCell(7).numFmt = '#,##0';
    });

    if (rows.length > 0) {
      const endDataRow = startDataRow + rows.length - 1;
      const totalRow = ws.addRow(['', '', '', '', '', 'TOTAL AHSP', null]);
      totalRow.font = { bold: true };
      totalRow.getCell(7).value = { formula: `SUM(G${startDataRow}:G${endDataRow})` };
      totalRow.getCell(7).numFmt = '#,##0';
    }
  } else if (isSchedule) {
    // Schedule: NO | ACTIVITY | DURATION | START | FINISH | WEIGHT | PROGRESS
    const headers = ['NO', 'ACTIVITY', 'DURATION (MG)', 'START', 'FINISH', 'WEIGHT (%)', 'PROGRESS (%)'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'act', width: 40 },
      { key: 'dur', width: 16 },
      { key: 'start', width: 14 },
      { key: 'finish', width: 14 },
      { key: 'weight', width: 14 },
      { key: 'prog', width: 16 },
    ];

    const rows = data.schedule;
    const startDataRow = headerRowIdx + 1;
    rows.forEach((x, idx) => {
      const r = ws.addRow([
        idx + 1,
        x.activity || x.name || '',
        Number(x.duration) || 0,
        x.start || '',
        x.finish || '',
        Number(x.weight) || 0,
        Number(x.progress) || 0,
      ]);
      r.getCell(6).numFmt = '0.00"%"';
      r.getCell(7).numFmt = '0.00"%"';
    });

    if (rows.length > 0) {
      const endDataRow = startDataRow + rows.length - 1;
      const totalRow = ws.addRow(['', 'TOTAL BOBOT', '', '', '', null, '']);
      totalRow.font = { bold: true };
      totalRow.getCell(6).value = { formula: `SUM(F${startDataRow}:F${endDataRow})` };
      totalRow.getCell(6).numFmt = '0.00"%"';
    }
  } else if (isJsa) {
    // JSA: NO | AKTIVITAS PEKERJAAN | POTENSI BAHAYA | TINGKAT RISIKO | PENGENDALIAN (MITIGASI)
    const headers = ['NO', 'AKTIVITAS PEKERJAAN', 'POTENSI BAHAYA', 'TINGKAT RISIKO', 'PENGENDALIAN (MITIGASI)'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'activity', width: 34 },
      { key: 'hazard', width: 30 },
      { key: 'riskLevel', width: 16 },
      { key: 'controlMeasure', width: 44 },
    ];

    const rows = data.jsa;
    rows.forEach((x, idx) => {
      ws.addRow([
        idx + 1,
        x.activity || '',
        x.hazard || '',
        x.riskLevel || (x as any).risk || 'SEDANG',
        x.controlMeasure || (x as any).mitigation || (x as any).control || '',
      ]);
    });
  } else if (isRkk) {
    // RKK: NO | STRUKTUR ORGANISASI K3 | PERSONIL K3 | SASARAN K3 | PENGENDALIAN RISIKO
    const headers = ['NO', 'STRUKTUR ORGANISASI K3', 'PERSONIL K3', 'SASARAN K3', 'PENGENDALIAN RISIKO'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'org', width: 32 },
      { key: 'personnel', width: 26 },
      { key: 'objectives', width: 30 },
      { key: 'controls', width: 34 },
    ];

    const rows = data.rkk;
    rows.forEach((x, idx) => {
      ws.addRow([
        idx + 1,
        x.organization || '',
        x.hsePersonnel || '',
        x.safetyObjectives || '',
        x.riskControls || '',
      ]);
    });
  } else if (isPersonnel) {
    // Personnel: NO | NAMA PERSONIL | POSISI / JABATAN | KUALIFIKASI / PENDIDIKAN | PENGALAMAN KERJA
    const headers = ['NO', 'NAMA PERSONIL', 'POSISI / JABATAN', 'KUALIFIKASI / PENDIDIKAN', 'PENGALAMAN KERJA'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'name', width: 28 },
      { key: 'position', width: 24 },
      { key: 'qualification', width: 32 },
      { key: 'experience', width: 24 },
    ];

    const rows = data.personnel;
    rows.forEach((x, idx) => {
      ws.addRow([
        idx + 1,
        x.name || '',
        x.position || x.role || '',
        x.qualification || '',
        x.experience || '',
      ]);
    });
  } else if (isEquipment) {
    // Equipment: NO | NAMA PERALATAN | TIPE / MODEL | JUMLAH (UNIT) | KAPASITAS | KONDISI
    const headers = ['NO', 'NAMA PERALATAN', 'TIPE / MODEL', 'JUMLAH (UNIT)', 'KAPASITAS', 'KONDISI'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'name', width: 28 },
      { key: 'type', width: 22 },
      { key: 'quantity', width: 16 },
      { key: 'capacity', width: 22 },
      { key: 'condition', width: 18 },
    ];

    const rows = data.equipment;
    rows.forEach((x, idx) => {
      const r = ws.addRow([
        idx + 1,
        x.name || '',
        x.type || '',
        Number(x.quantity ?? x.qty) || 0,
        x.capacity || '',
        x.condition || 'Baik / Beroperasi Normal',
      ]);
      r.getCell(4).numFmt = '#,##0';
    });
  } else if (isRab) {
    // RAB: NO | WORK ITEM | DESCRIPTION | UNIT | VOLUME | HARGA SATUAN | JUMLAH HARGA
    const headers = ['NO', 'URAIAN PEKERJAAN', 'SPESIFIKASI', 'SATUAN', 'VOLUME', 'HARGA SATUAN', 'JUMLAH HARGA'];
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };

    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'item', width: 26 },
      { key: 'desc', width: 34 },
      { key: 'unit', width: 10 },
      { key: 'qty', width: 14 },
      { key: 'price', width: 18 },
      { key: 'amount', width: 20 },
    ];

    const rows = data.rab;
    const startDataRow = headerRowIdx + 1;

    rows.forEach((x, idx) => {
      const rowNumber = startDataRow + idx;
      const r = ws.addRow([
        idx + 1,
        x.workItem || x.code || '',
        x.description || '',
        x.unit || '',
        Number(x.quantity ?? x.qty) || 0,
        Number(x.unitPrice) || 0,
        null,
      ]);

      // Row formula: VOLUME (E) * HARGA SATUAN (F)
      r.getCell(7).value = { formula: `E${rowNumber}*F${rowNumber}` };
      r.getCell(5).numFmt = '#,##0.00';
      r.getCell(6).numFmt = '#,##0';
      r.getCell(7).numFmt = '#,##0';
    });

    if (rows.length > 0) {
      const endDataRow = startDataRow + rows.length - 1;
      const totalRow = ws.addRow(['', '', '', '', '', 'GRAND TOTAL', null]);
      totalRow.font = { bold: true };
      totalRow.getCell(7).value = { formula: `SUM(G${startDataRow}:G${endDataRow})` };
      totalRow.getCell(7).numFmt = '#,##0';
    }
  } else {
    // Generic fallback using renderedDoc table columns & rows
    const cols = _renderedDoc?.tableColumns || [];
    const rows = _renderedDoc?.tables || [];

    if (cols.length > 0 && rows.length > 0) {
      const headers = ['NO', ...cols.map((c) => c.label)];
      const hRow = ws.addRow(headers);
      hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

      ws.columns = [
        { key: 'no', width: 6 },
        ...cols.map((c) => ({ key: c.key, width: Math.max(c.width || 18, 14) })),
      ];

      rows.forEach((row, idx) => {
        const rowVals = [
          idx + 1,
          ...cols.map((col) => {
            const v = row[col.key];
            return typeof v === 'number' ? v : String(v ?? '—');
          }),
        ];
        ws.addRow(rowVals);
      });
    }
  }

  // Freeze top rows below headers
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

export const downloadXlsx = async (
  definition: DocumentDefinition,
  data: DocumentData,
  renderedDoc?: RenderedDocument,
  revision?: number
) => {
  const revNum = revision !== undefined ? revision : data.revision !== undefined ? data.revision : 0;
  const revStr = `REV${String(revNum).padStart(2, '0')}`;
  const cleanProject = (data.project.projectName || 'PROJECT').replace(/[^a-z0-9]+/gi, '-');
  const filename = `${definition.code}_${cleanProject}_${revStr}.xlsx`;
  const blob = await generateXlsx(definition, data, renderedDoc, revision);
  saveAs(blob, filename);
};