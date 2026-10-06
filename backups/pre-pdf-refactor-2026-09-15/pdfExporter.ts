import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, Company } from '../types';
import { formatRupiah } from '../engine/formulaEngine';

const formatIDR = formatRupiah;

export function exportProjectToPDF(project: Project, company: Company): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Header / Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // Navy 900
  doc.text(company.name.toUpperCase(), 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(`${company.address} | Telp: ${company.phone} | NPWP: ${company.taxNumber}`, 14, 23);

  // Line separator
  doc.setDrawColor(37, 99, 235); // Blue 600
  doc.setLineWidth(0.8);
  doc.line(14, 26, pageWidth - 14, 26);

  // Title Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('RENCANA ANGGARAN BIAYA (RAB) KONSTRUKSI', pageWidth / 2, 34, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Nomor: ${project.projectNumber} | Versi: ${project.currentVersion} | Tanggal: ${project.startDate}`, pageWidth / 2, 39, { align: 'center' });

  // Project Metadata Subheader Table
  const metaBody: any[] = [
    [
      { content: 'Nama Proyek:', styles: { fontStyle: 'bold' as const } },
      project.name,
      { content: 'No. Dokumen:', styles: { fontStyle: 'bold' as const } },
      project.projectNumber || 'PRJ-2026-001'
    ],
    [
      { content: 'Lokasi:', styles: { fontStyle: 'bold' as const } },
      project.location || 'Indonesia',
      { content: 'Tanggal:', styles: { fontStyle: 'bold' as const } },
      new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    ],
    [
      { content: 'Pemilik / Klien:', styles: { fontStyle: 'bold' as const } },
      project.clientName || (project as any).client || 'Pribadi',
      { content: 'Jenis Bangunan:', styles: { fontStyle: 'bold' as const } },
      project.buildingType || 'Rumah Tinggal'
    ],
    [
      { content: 'Luas Bangunan:', styles: { fontStyle: 'bold' as const } },
      `${project.buildingArea || 120} m² (Tanah: ${project.landArea || 150} m²)`,
      { content: 'Status RAB:', styles: { fontStyle: 'bold' as const } },
      project.status
    ],
  ];

  autoTable(doc, {
    startY: 43,
    body: metaBody,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 65 },
      2: { cellWidth: 28 },
      3: { cellWidth: 65 },
    },
    margin: { left: 14, right: 14 }
  });

  // Table of RAB Items
  const tableRows: any[] = [];

  (project.sections || []).forEach(section => {
    // Section Header row
    tableRows.push([
      { content: section.code, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: section.name, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: formatIDR(section.subtotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } }
    ]);

    (section.items || []).forEach(item => {
      tableRows.push([
        (item as any).itemNumber || (item as any).code,
        item.description,
        item.volume.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
        item.unit,
        formatIDR(item.unitPrice),
        formatIDR(item.totalPrice)
      ]);
    });
  });

  // Cost Summary Rows
  const cost = project.costSummary || {
    directCost: (project as any).totalRab || 0,
    overheadPercent: 5,
    overheadAmount: 0,
    profitPercent: 5,
    profitAmount: 0,
    contingencyPercent: 0,
    contingencyAmount: 0,
    taxPercent: 11,
    taxAmount: 0,
    grandTotal: (project as any).totalRab || 0,
  };

  tableRows.push([
    { content: 'SUBTOTAL BIAYA LANGSUNG (DIRECT COST)', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: formatIDR(cost.directCost), styles: { fontStyle: 'bold', halign: 'right' } }
  ]);

  if (cost.overheadPercent > 0) {
    tableRows.push([
      { content: `Overhead Biaya Umum (${cost.overheadPercent}%)`, colSpan: 5, styles: { halign: 'right', textColor: [100, 116, 139] } },
      { content: formatIDR(cost.overheadAmount), styles: { halign: 'right', textColor: [100, 116, 139] } }
    ]);
  }

  if (cost.profitPercent > 0) {
    tableRows.push([
      { content: `Profit Kontraktor (${cost.profitPercent}%)`, colSpan: 5, styles: { halign: 'right', textColor: [100, 116, 139] } },
      { content: formatIDR(cost.profitAmount), styles: { halign: 'right', textColor: [100, 116, 139] } }
    ]);
  }

  if (cost.taxAmount > 0) {
    tableRows.push([
      { content: `Pajak Pertambahan Nilai (PPN ${cost.taxPercent}%)`, colSpan: 5, styles: { halign: 'right', textColor: [100, 116, 139] } },
      { content: formatIDR(cost.taxAmount), styles: { halign: 'right', textColor: [100, 116, 139] } }
    ]);
  }

  tableRows.push([
    { content: 'TOTAL ESTIMASI ANGGARAN BIAYA (GRAND TOTAL)', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [37, 99, 235], textColor: [255, 255, 255] } },
    { content: formatIDR(cost.grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [37, 99, 235], textColor: [255, 255, 255] } }
  ]);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 4,
    head: [['No', 'Uraian Pekerjaan', 'Vol', 'Sat', 'Harga Satuan (Rp)', 'Total Harga (Rp)']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center'
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 85 },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 31, halign: 'right' }
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data: any) => {
      // Footer page numbering
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Dokumen Resmi EZRAB PRO | Hal. ${data.pageNumber}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      );
      doc.text(
        `Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        14,
        doc.internal.pageSize.getHeight() - 8
      );
    }
  });

  // Signature Section
  const finalY = (doc as any).lastAutoTable.finalY + 12;

  // Add new page if not enough space for signatures
  if (finalY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
  }

  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  const col1X = 20;
  const col2X = pageWidth / 2;
  const col3X = pageWidth - 20;

  doc.text('Disusun Oleh,', col1X, finalY, { align: 'center' });
  doc.text('Lead Estimator', col1X, finalY + 4, { align: 'center' });
  doc.text('_______________________', col1X, finalY + 22, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(project.estimatorName || 'Ahmad Yusuf (Super Admin)', col1X, finalY + 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.text('Direview & Disetujui,', col2X, finalY, { align: 'center' });
  doc.text('Direktur Operasional', col2X, finalY + 4, { align: 'center' });
  doc.text('_______________________', col2X, finalY + 22, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(company.directorName || 'Direktur Teknik', col2X, finalY + 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.text('Disetujui Oleh,', col3X, finalY, { align: 'center' });
  doc.text('Pemilik / Klien', col3X, finalY + 4, { align: 'center' });
  doc.text('_______________________', col3X, finalY + 22, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(project.clientName || (project as any).client || 'Owner Proyek', col3X, finalY + 26, { align: 'center' });

  // Save PDF
  const numClean = (project.projectNumber || 'PRJ-2026-001').replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfName = `RAB_${numClean}_Resmi.pdf`;
  doc.save(pdfName);
}
