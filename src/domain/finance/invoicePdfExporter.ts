/**
 * EZRAB Project Finance — Invoice PDF Exporter
 * Generates official Indonesian construction invoices in PDF format.
 */

import jsPDFConstructor, * as jspdfNamespace from 'jspdf';
import autoTableFn, * as autoTableNamespace from 'jspdf-autotable';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import { Invoice, Termin } from './types';
import { Company, Project } from '../../types';
import { formatRupiah } from '../../engine/formulaEngine';
import { terbilangIndo } from '../../export/exportDesignSystem';
import { loadOfficialEzrabLogo } from '../../export/pdfAssets';

const SafeJsPDF: any =
  (jspdfNamespace as any).default?.jsPDF ||
  (jspdfNamespace as any).default ||
  (jspdfNamespace as any).jsPDF ||
  jsPDFConstructor;

const safeAutoTable: any =
  (autoTableNamespace as any).default || autoTableFn;

export interface InvoicePdfOptions {
  company?: Company;
  project?: Project | null;
  termin?: Termin | null;
  signatoryName?: string;
  signatoryPosition?: string;
}

export async function exportInvoiceToPdf(
  invoice: Invoice,
  options: InvoicePdfOptions = {}
): Promise<Blob> {
  const doc = new SafeJsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  const company = options.company || {
    id: 'comp-default',
    name: 'PT EZRAB KONSTRUKSI DIGITAL',
    address: 'Jl. Raya Konstruksi No. 88, Surabaya, Jawa Timur',
    phone: '031-5558899',
    email: 'finance@ezrab.com',
    website: 'https://ezrab.com',
    taxNumber: '01.234.567.8-901.000',
    directorName: 'Ir. Hendra Kusuma, MT',
    leadEstimatorName: 'Ahmad Yusuf, ST',
    defaultOverheadPercent: 5,
    defaultProfitPercent: 10,
    defaultContingencyPercent: 3,
    defaultTaxPercent: 11,
  };

  // 1. Header / Kop Perusahaan
  let currentY = 18;

  // Try loading company logo or default ezrab logo
  try {
    const logoData = company.logo || (await loadOfficialEzrabLogo());
    if (logoData) {
      doc.addImage(logoData, 'PNG', margin, currentY, 45, 14);
    }
  } catch {
    // Ignore and fallback to text header
  }

  // Company Information (Right Aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(company.name.toUpperCase(), pageWidth - margin, currentY + 4, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(company.address || 'Indonesia', pageWidth - margin, currentY + 9, { align: 'right' });
  doc.text(
    `Telp: ${company.phone || '-'}  |  Email: ${company.email || '-'}`,
    pageWidth - margin,
    currentY + 13,
    { align: 'right' }
  );
  if (company.taxNumber) {
    doc.text(`NPWP: ${company.taxNumber}`, pageWidth - margin, currentY + 17, { align: 'right' });
  }

  // Horizontal separator rule
  currentY += 22;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.6);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  // 2. Invoice Title & Metadata
  currentY += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text('INVOICE / FAKTUR TAGIHAN', margin, currentY);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Nomor: ${invoice.invoiceNumber}`, margin, currentY + 6);

  // Status Badge
  const statusLabels: Record<string, string> = {
    DRAFT: 'DRAFT',
    ISSUED: 'DITAGIHKAN',
    PARTIALLY_PAID: 'DIBAYAR SEBAGIAN',
    PAID: 'LUNAS',
    OVERDUE: 'JATUH TEMPO',
    CANCELLED: 'DIBATALKAN',
  };
  const statusColor: Record<string, [number, number, number]> = {
    DRAFT: [100, 116, 139],
    ISSUED: [37, 99, 235],
    PARTIALLY_PAID: [217, 119, 6],
    PAID: [22, 163, 74],
    OVERDUE: [220, 38, 38],
    CANCELLED: [148, 163, 184],
  };

  const badgeText = statusLabels[invoice.status] || invoice.status;
  const [br, bg, bb] = statusColor[invoice.status] || [37, 99, 235];
  doc.setFillColor(br, bg, bb);
  doc.roundedRect(pageWidth - margin - 35, currentY - 5, 35, 7, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(badgeText, pageWidth - margin - 17.5, currentY - 0.5, { align: 'center' });

  // 3. Info Grid (Ditujukan Kepada & Detail Tagihan)
  currentY += 15;
  const colWidth = (contentWidth - 8) / 2;

  // Box Left: Ditujukan Kepada (Client)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, colWidth, 34, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DITUJUKAN KEPADA:', margin + 4, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.clientName || 'Klien Proyek', margin + 4, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Proyek: ${invoice.projectName || 'Proyek Konstruksi'}`, margin + 4, currentY + 18);
  doc.text(`Lokasi: ${invoice.projectLocation || options.project?.location || 'Indonesia'}`, margin + 4, currentY + 23);
  if (invoice.clientPhone) {
    doc.text(`Kontak: ${invoice.clientPhone}`, margin + 4, currentY + 28);
  }

  // Box Right: Tanggal & Pembayaran
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin + colWidth + 8, currentY, colWidth, 34, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('RINCIAN TAGIHAN:', margin + colWidth + 12, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Tanggal Terbit:', margin + colWidth + 12, currentY + 12);
  doc.text('Jatuh Tempo:', margin + colWidth + 12, currentY + 18);
  doc.text('Termin / Acuan:', margin + colWidth + 12, currentY + 24);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.invoiceDate || '-', pageWidth - margin - 4, currentY + 12, { align: 'right' });
  doc.text(invoice.dueDate || '-', pageWidth - margin - 4, currentY + 18, { align: 'right' });
  doc.text(options.termin?.name || (invoice.terminId ? 'Termin Terjadwal' : 'Tagihan Standar'), pageWidth - margin - 4, currentY + 24, { align: 'right' });

  // 4. Items Table
  currentY += 40;

  const tableRows: any[][] = [];
  if (invoice.items && invoice.items.length > 0) {
    invoice.items.forEach((item, idx) => {
      tableRows.push([
        idx + 1,
        item.description,
        `${item.quantity} ${item.unit}`,
        formatRupiah(item.unitPrice),
        formatRupiah(item.totalPrice),
      ]);
    });
  } else {
    tableRows.push([
      1,
      options.termin
        ? `Pembayaran ${options.termin.name} (${options.termin.percentage}% dari Nilai Kontrak)`
        : `Pembayaran Pekerjaan ${invoice.projectName}`,
      '1 Paket',
      formatRupiah(invoice.subtotal),
      formatRupiah(invoice.subtotal),
    ]);
  }

  safeAutoTable(doc, {
    startY: currentY,
    head: [['No', 'Deskripsi Pekerjaan / Tagihan', 'Volume', 'Harga Satuan', 'Total Nominal']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3.5,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 35 },
      4: { halign: 'right', cellWidth: 38 },
    },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || currentY + 30;

  // 5. Summary / Calculation Breakdown Box (Right Aligned)
  let calcY = finalY + 4;
  const calcBoxWidth = 85;
  const calcBoxX = pageWidth - margin - calcBoxWidth;

  const calcLines = [
    { label: 'Subtotal', val: formatRupiah(invoice.subtotal), bold: false },
    { label: `PPN (${invoice.taxPercent}%)`, val: formatRupiah(invoice.taxAmount), bold: false },
  ];

  if (invoice.deductions && invoice.deductions > 0) {
    calcLines.push({ label: 'Potongan / Retensi', val: `- ${formatRupiah(invoice.deductions)}`, bold: false });
  }

  calcLines.push({ label: 'TOTAL TAGIHAN', val: formatRupiah(invoice.total), bold: true });

  if (invoice.paidAmount > 0) {
    calcLines.push({ label: 'Sudah Dibayar', val: formatRupiah(invoice.paidAmount), bold: false });
    calcLines.push({ label: 'SISA TAGIHAN', val: formatRupiah(invoice.outstandingAmount), bold: true });
  }

  calcLines.forEach((line) => {
    doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
    doc.setFontSize(line.bold ? 9.5 : 8.5);
    doc.setTextColor(line.bold ? 15 : 71, line.bold ? 23 : 85, line.bold ? 42 : 105);
    doc.text(line.label, calcBoxX, calcY);
    doc.text(line.val, pageWidth - margin, calcY, { align: 'right' });
    calcY += 5;
  });

  // 6. Terbilang Box
  const terbilangY = finalY + 4;
  const terbilangWidth = contentWidth - calcBoxWidth - 8;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, terbilangY, terbilangWidth, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TERBILANG:', margin + 4, terbilangY + 5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const words = `${terbilangIndo(invoice.total)} rupiah`;
  const splitWords = doc.splitTextToSize(words, terbilangWidth - 8);
  doc.text(splitWords, margin + 4, terbilangY + 10);

  // 7. Payment Instructions & Bank Details
  const paymentY = Math.max(calcY + 4, terbilangY + 24);
  const bankName = invoice.bankName || 'BCA (Bank Central Asia)';
  const bankAccount = invoice.bankAccount || '8830-1234-5678';
  const bankHolder = invoice.bankAccountHolder || company.name;

  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(margin, paymentY, contentWidth * 0.6, 24, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(37, 99, 235);
  doc.text('INFORMASI REKENING PEMBAYARAN:', margin + 4, paymentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Bank: ${bankName}`, margin + 4, paymentY + 10);
  doc.text(`No. Rekening: ${bankAccount}`, margin + 4, paymentY + 15);
  doc.text(`Atas Nama: ${bankHolder}`, margin + 4, paymentY + 20);

  // 8. Signatory Box (Right Bottom)
  const sigX = pageWidth - margin - 55;
  const sigY = paymentY;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`${company.address ? company.address.split(',')[0] : 'Surabaya'}, ${invoice.invoiceDate}`, sigX + 27.5, sigY + 5, { align: 'center' });
  doc.text(company.name, sigX + 27.5, sigY + 9, { align: 'center' });

  const signatory = options.signatoryName || company.directorName || 'Direktur Utama';
  const position = options.signatoryPosition || 'Direktur Utama';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(signatory, sigX + 27.5, sigY + 28, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(position, sigX + 27.5, sigY + 32, { align: 'center' });

  // 9. Notes / Catatan Tambahan at very bottom
  if (invoice.notes) {
    const notesY = Math.max(paymentY + 28, sigY + 36);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Catatan: ${invoice.notes}`, margin, notesY);
  }

  const pdfBlob = doc.output('blob');
  return pdfBlob;
}

export async function downloadInvoicePdf(invoice: Invoice, options: InvoicePdfOptions = {}): Promise<void> {
  const blob = await exportInvoiceToPdf(invoice, options);
  const cleanNum = invoice.invoiceNumber.replace(/[\/\\]/g, '-');
  saveAs(blob, `Invoice_${cleanNum}_${invoice.projectName || 'Proyek'}.pdf`);
}
