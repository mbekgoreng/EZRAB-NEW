import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import type { DocumentDefinition, DocumentData, RenderedDocument } from '../types';
import { renderDocument } from '../renderer';

export const generatePdf = (
  definition: DocumentDefinition,
  data: DocumentData,
  renderedDoc?: RenderedDocument,
  revision?: number
): Blob => {
  const rendered = renderedDoc || renderDocument(definition, data);
  const revNum = revision !== undefined ? revision : data.revision !== undefined ? data.revision : 0;
  const revStr = `REV ${String(revNum).padStart(2, '0')}`;

  const pdf = new jsPDF({ format: 'a4', unit: 'mm' });
  const pageWidth = pdf.internal.pageSize.getWidth();

  // 1. Header Banner & Logo
  let currentY = 18;

  // Try embedding logo if available
  const logoUrl = data.company.logo || data.project.companyLogo;
  if (logoUrl && typeof logoUrl === 'string' && logoUrl.startsWith('data:image')) {
    try {
      pdf.addImage(logoUrl, 'PNG', 18, currentY - 4, 28, 14);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(definition.name, 52, currentY + 3);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${data.company.name || 'EZRAB CONSTRUCTION'} · Dokumen Resmi`, 52, currentY + 9);
      currentY += 16;
    } catch {
      // Fallback if image format not directly parsable
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(definition.name, 18, currentY);
      currentY += 8;
    }
  } else {
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(definition.name, 18, currentY);
    currentY += 8;
  }

  // 2. Metadata Bar
  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(71, 85, 105);
  const metaText = `No. Dokumen: ${definition.code}   |   ${revStr}   |   Kategori: ${definition.category}   |   Tanggal: ${rendered.metadata.date}`;
  pdf.text(metaText, 18, currentY);
  currentY += 6;

  // Blue Accent Divider Rule
  pdf.setDrawColor(37, 99, 235);
  pdf.setLineWidth(0.8);
  pdf.line(18, currentY, pageWidth - 18, currentY);
  currentY += 8;

  // 3. Project Information Summary Box
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(18, currentY, pageWidth - 36, 28, 2, 2, 'FD');

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text('INFORMASI PROYEK', 24, currentY + 6);

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Nama Proyek : ${data.project.projectName || '—'}`, 24, currentY + 12);
  pdf.text(`Pemilik/Owner: ${data.project.owner || '—'}`, 24, currentY + 18);
  pdf.text(`Kontraktor  : ${data.project.contractor || data.company.name || '—'}`, 24, currentY + 24);

  const col2X = 115;
  pdf.text(`Lokasi Proyek : ${data.project.location || '—'}`, col2X, currentY + 12);
  pdf.text(`Nilai Kontrak : ${data.project.contractValue ? `Rp ${Number(data.project.contractValue).toLocaleString('id-ID')}` : '—'}`, col2X, currentY + 18);
  pdf.text(`Durasi Proyek : ${data.project.duration || '—'}`, col2X, currentY + 24);

  currentY += 34;

  // 4. Document Fields / Content
  if (definition.fields && definition.fields.length > 0) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('RINCIAN PERSYARATAN & PARAMETER', 18, currentY);
    currentY += 4;

    const fieldRows = definition.fields.map((f) => {
      const val = data.project[f.id as keyof typeof data.project] ?? '—';
      return [f.label, String(val)];
    });

    autoTable(pdf, {
      startY: currentY,
      head: [['Parameter / Ketentuan', 'Keterangan Nilai']],
      body: fieldRows,
      margin: { left: 18, right: 18 },
      theme: 'grid',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      styles: { fontSize: 8.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const lastAutoTable = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    currentY = (lastAutoTable?.finalY || currentY + 30) + 8;
  }

  // 5. Dynamic Data Tables (BOQ / RAB / Schedule / AHSP / Personnel)
  if (rendered.tables && rendered.tables.length > 0 && rendered.tableColumns && rendered.tableColumns.length > 0) {
    if (currentY > 210) {
      pdf.addPage();
      currentY = 20;
    }

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('LAMPIRAN DATA UTAMA', 18, currentY);
    currentY += 4;

    const headers = rendered.tableColumns.map((c) => c.label);
    const body = rendered.tables.map((row) =>
      rendered.tableColumns!.map((col) => {
        const val = row[col.key];
        if (typeof val === 'number') {
          return val.toLocaleString('id-ID');
        }
        return String(val ?? '—');
      })
    );

    const columnStyles: Record<number, { halign?: 'left' | 'center' | 'right' }> = {};
    rendered.tableColumns.forEach((col, idx) => {
      const k = col.key.toLowerCase();
      if (k === 'no') {
        columnStyles[idx] = { halign: 'center' };
      } else if (
        k.includes('price') ||
        k.includes('total') ||
        k.includes('amount') ||
        k.includes('quantity') ||
        k.includes('qty') ||
        k.includes('weight') ||
        k.includes('progress') ||
        k.includes('coefficient') ||
        k.includes('durasi') ||
        k.includes('duration')
      ) {
        columnStyles[idx] = { halign: 'right' };
      } else {
        columnStyles[idx] = { halign: 'left' };
      }
    });

    autoTable(pdf, {
      startY: currentY,
      head: [headers],
      body: body,
      margin: { left: 18, right: 18 },
      theme: 'striped',
      showHead: 'everyPage',
      pageBreak: 'auto',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: 'bold',
      },
      styles: { fontSize: 8, textColor: [30, 41, 59], overflow: 'linebreak', cellPadding: 2 },
      columnStyles,
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const lastAutoTable = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    currentY = (lastAutoTable?.finalY || currentY + 40) + 12;
  }

  // 6. Formal Signature Section
  if (currentY > 225) {
    pdf.addPage();
    currentY = 25;
  }

  const signX = pageWidth - 80;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(51, 65, 85);
  pdf.text(`${data.project.location || 'Tempat'}, ${rendered.metadata.date}`, signX, currentY);
  currentY += 5;
  pdf.text('Hormat kami,', signX, currentY);
  currentY += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.text(data.company.name || data.project.contractor || 'Penyedia Jasa / Kontraktor', signX, currentY);
  currentY += 8;

  // Signature image or formal lines
  const sig = rendered.signatures[0];
  const sigImg = data.company.signature;
  if (sigImg && typeof sigImg === 'string' && sigImg.startsWith('data:image')) {
    try {
      pdf.addImage(sigImg, 'PNG', signX, currentY, 32, 14);
      currentY += 16;
    } catch {
      currentY += 18;
    }
  } else {
    currentY += 18;
  }

  pdf.setDrawColor(71, 85, 105);
  pdf.setLineWidth(0.4);
  pdf.line(signX, currentY, signX + 56, currentY);
  currentY += 5;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  const signatoryName = sig?.name && !sig.isPlaceholder ? sig.name : 'Nama Penandatangan';
  pdf.text(signatoryName, signX, currentY);
  currentY += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.text(sig?.position || 'Direktur Utama', signX, currentY);

  // 7. Standard Formal Footer
  const totalPages = (pdf.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(18, 285, pageWidth - 18, 285);
    pdf.text(
      `${data.company.name || 'EZRAB'} · ${definition.code} · ${revStr}`,
      18,
      290
    );
    pdf.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 36, 290);
  }

  return pdf.output('blob');
};

export const downloadPdf = (
  definition: DocumentDefinition,
  data: DocumentData,
  renderedDoc?: RenderedDocument,
  revision?: number
) => {
  const revNum = revision !== undefined ? revision : data.revision !== undefined ? data.revision : 0;
  const revStr = `REV${String(revNum).padStart(2, '0')}`;
  const cleanProject = (data.project.projectName || 'PROJECT').replace(/[^a-z0-9]+/gi, '-');
  const filename = `${definition.code}_${cleanProject}_${revStr}.pdf`;
  saveAs(generatePdf(definition, data, renderedDoc, revision), filename);
};