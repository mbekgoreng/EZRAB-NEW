import jsPDFConstructor, * as jspdfNamespace from 'jspdf';
import autoTableFn, * as autoTableNamespace from 'jspdf-autotable';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import { Project, Company, RABSection, RabItem } from '../types';
import { formatRupiah, formatNumberId } from '../engine/formulaEngine';
import { terbilangIndo } from './exportDesignSystem';
import { renderPdfWatermark } from './pdfWatermark';
import { loadOfficialEzrabEmblem, loadOfficialEzrabLogo } from './pdfAssets';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
// PHASE 1 (audit §16): single canonical default set, so the PDF agrees with the screen.
import { resolvePolicyValue } from '../engine/cost/policy/costPolicyDefaults';

const SafeJsPDF: any =
  (jspdfNamespace as any).default?.jsPDF ||
  (jspdfNamespace as any).default ||
  (jspdfNamespace as any).jsPDF ||
  jsPDFConstructor;

const safeAutoTable: any =
  (autoTableNamespace as any).default || autoTableFn;

export interface PDFExportOptions {
  subscriptionPlan?: 'free' | 'trial' | 'basic' | 'pro' | 'enterprise';
  isWatermarkRequired?: boolean;
  companyLogoUrl?: string; // Data URL or verified image
  leadEstimatorName?: string;
  directorName?: string;
  clientApproverName?: string;
  documentNumberOverride?: string;
  revisionOverride?: string;
  accentColor?: string;
}

// Color Palette for Official Construction Documents
const DOC_COLORS = {
  NAVY_PRIMARY: [15, 23, 42] as [number, number, number], // #0F172A
  NAVY_SECONDARY: [30, 41, 59] as [number, number, number], // #1E293B
  BLUE_ACCENT: [37, 99, 235] as [number, number, number], // #2563EB
  BLUE_LIGHT: [239, 246, 255] as [number, number, number], // #EFF6FF
  SLATE_MUTED: [100, 116, 139] as [number, number, number], // #64748B
  SLATE_LIGHT: [241, 245, 249] as [number, number, number], // #F1F5F9
  BORDER_COLOR: [203, 213, 225] as [number, number, number], // #CBD5E1
  TEXT_DARK: [15, 23, 42] as [number, number, number],
  TEXT_BODY: [51, 65, 85] as [number, number, number], // #334155
};

/**
 * Normalizes project sections.
 * If project.sections exists and is populated, uses it.
 * Otherwise groups project.items or flat items by category.
 * If completely empty, falls back to stored items or standard construction divisions.
 */
function normalizeProjectSections(project: Project): RABSection[] {
  if (project.sections && Array.isArray(project.sections) && project.sections.length > 0) {
    return project.sections;
  }

  let rawItems: any[] = (project as any).items || (project as any).rabItems || [];

  // Try retrieving from browser localStorage if rawItems is empty
  if (rawItems.length === 0 && typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('ezrab_prod_rab_items');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const matched = parsed.filter((it) => it.projectId === project.id);
          rawItems = matched.length > 0 ? matched : parsed;
        }
      }
    } catch {
      // ignore localStorage parse error
    }
  }

  // Fallback to default construction division sections if still completely empty
  if (rawItems.length === 0) {
    const baseBudget = project.totalRab || 150000000;
    return [
      {
        id: 'sec-div-01',
        code: 'DIV-01',
        name: 'Pekerjaan Persiapan & Pengukuran',
        subtotal: Math.round(baseBudget * 0.08),
        items: [
          {
            id: 'it-01-1',
            sectionId: 'sec-div-01',
            itemNumber: '1.1',
            code: 'A.2.2.1.1',
            description: 'Pengukuran dan Pemasangan Bowplank',
            specification: 'Kayu 5/7 & papan 2/20 terpasang presisi',
            volume: 85,
            unit: 'm¹',
            materialPrice: 32000,
            laborPrice: 18000,
            equipmentPrice: 0,
            unitPrice: 50000,
            totalPrice: 4250000,
            verificationStatus: 'VERIFIED',
          },
          {
            id: 'it-01-2',
            sectionId: 'sec-div-01',
            itemNumber: '1.2',
            code: 'A.2.1.1.2',
            description: 'Pembersihan Lahan & Perataan Lokasi',
            specification: 'Pembersihan semak & puing sisa',
            volume: 150,
            unit: 'm²',
            materialPrice: 0,
            laborPrice: 25000,
            equipmentPrice: 15000,
            unitPrice: 40000,
            totalPrice: 6000000,
            verificationStatus: 'VERIFIED',
          },
        ],
      },
      {
        id: 'sec-div-02',
        code: 'DIV-02',
        name: 'Pekerjaan Struktur & Pondasi',
        subtotal: Math.round(baseBudget * 0.45),
        items: [
          {
            id: 'it-02-1',
            sectionId: 'sec-div-02',
            itemNumber: '2.1',
            code: 'A.2.3.1.1',
            description: 'Galian Tanah Pondasi Footplat',
            specification: 'Tanah biasa kedalaman s/d 2m',
            volume: 48,
            unit: 'm³',
            materialPrice: 0,
            laborPrice: 85000,
            equipmentPrice: 0,
            unitPrice: 85000,
            totalPrice: 4080000,
            verificationStatus: 'VERIFIED',
          },
          {
            id: 'it-02-2',
            sectionId: 'sec-div-02',
            itemNumber: '2.2',
            code: 'A.4.1.1.5',
            description: 'Beton Bertulang Mutu K-300 (Footplat & Sloof)',
            specification: 'Ready mix slump 12±2 cm, tulangan ulir fy 420',
            volume: 32,
            unit: 'm³',
            materialPrice: 1150000,
            laborPrice: 250000,
            equipmentPrice: 50000,
            unitPrice: 1450000,
            totalPrice: 46400000,
            verificationStatus: 'VERIFIED',
          },
        ],
      },
      {
        id: 'sec-div-03',
        code: 'DIV-03',
        name: 'Pekerjaan Arsitektur & Finishing',
        subtotal: Math.round(baseBudget * 0.47),
        items: [
          {
            id: 'it-03-1',
            sectionId: 'sec-div-03',
            itemNumber: '3.1',
            code: 'A.4.4.1.9',
            description: 'Pasangan Dinding Bata Ringan (Hebel) t=10cm',
            specification: 'Mortar perekat instan tebal 3mm',
            volume: 210,
            unit: 'm²',
            materialPrice: 110000,
            laborPrice: 35000,
            equipmentPrice: 0,
            unitPrice: 1450000,
            totalPrice: 30450000,
            verificationStatus: 'VERIFIED',
          },
        ],
      },
    ];
  }

  // Group flat items by category
  const groups = new Map<string, any[]>();
  rawItems.forEach((item) => {
    const cat = item.category || item.sectionName || 'Pekerjaan Umum / Standar';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  });

  const sections: RABSection[] = [];
  let secIdx = 1;
  for (const [catName, items] of groups.entries()) {
    const code = `DIV-${secIdx < 10 ? '0' + secIdx : secIdx}`;
    const subtotal = items.reduce(
      (acc, it) => acc + (Number(it.amount || it.totalPrice) || (Number(it.volume) * Number(it.unitPrice)) || 0),
      0
    );
    sections.push({
      id: `sec-${secIdx}`,
      code,
      name: catName,
      subtotal,
      items: items.map((it, iIdx) => ({
        id: it.id || `it-${secIdx}-${iIdx + 1}`,
        sectionId: `sec-${secIdx}`,
        itemNumber: it.itemNumber || it.code || `${secIdx}.${iIdx + 1}`,
        code: it.code || it.ahspCode || `${secIdx}.${iIdx + 1}`,
        description: it.description || it.uraian || 'Pekerjaan Konstruksi',
        specification: it.specification || '',
        volume: Number(it.volume) || 0,
        unit: it.unit || 'ls',
        materialPrice: Number(it.materialPrice) || 0,
        laborPrice: Number(it.laborPrice) || 0,
        equipmentPrice: Number(it.equipmentPrice) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        totalPrice: Number(it.amount || it.totalPrice) || (Number(it.volume) * Number(it.unitPrice)) || 0,
        verificationStatus: it.verificationStatus || 'VERIFIED',
      })),
    });
    secIdx++;
  }

  return sections;
}

/**
 * Computes exact mathematical totals
 */
function computeCostSummary(project: Project, sections: RABSection[]) {
  const directCost = sections.reduce((sum, s) => sum + s.subtotal, 0);
  const cost = project.costSummary || ({} as any);

  const overheadPercent = resolvePolicyValue('overheadPercent', cost.overheadPercent, 'pdfExporter.computeCostSummary');
  const overheadAmount = Math.round(directCost * (overheadPercent / 100));

  // PHASE 1 (audit C-10): was `: 10`, which made the PDF disagree with the screen (5%).
  const profitPercent = resolvePolicyValue('profitPercent', cost.profitPercent, 'pdfExporter.computeCostSummary');
  const profitAmount = Math.round(directCost * (profitPercent / 100));

  const subtotalBeforeTax = directCost + overheadAmount + profitAmount;

  const taxPercent = resolvePolicyValue('taxPercent', cost.taxPercent, 'pdfExporter.computeCostSummary');
  const taxAmount = Math.round(subtotalBeforeTax * (taxPercent / 100));

  const grandTotal = subtotalBeforeTax + taxAmount;

  return {
    directCost,
    overheadPercent,
    overheadAmount,
    profitPercent,
    profitAmount,
    subtotalBeforeTax,
    taxPercent,
    taxAmount,
    grandTotal,
  };
}

/**
 * Main export function to generate high-end, professional construction RAB PDF.
 */
export async function exportProjectToPDF(
  project: Project,
  company: Company,
  options?: PDFExportOptions
): Promise<any> {
  // 1. Validation & Safety Checks
  if (!project) {
    throw new Error('Data proyek tidak ditemukan.');
  }

  const sections = UnifiedProjectEngine.normalizeSections(project);
  if (sections.length === 0) {
    throw new Error('Tidak ada data rincian pekerjaan (RAB) yang dapat diekspor.');
  }

  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);

  // 2. Resolve Subscription & Watermark Entitlement (FAIL-CLOSED SECURITY)
  const plan = options?.subscriptionPlan || 'free';
  const isPaid = plan === 'basic' || plan === 'pro' || plan === 'enterprise';
  // FREE and TRIAL tiers ALWAYS mandate the watermark. Client override is strictly ignored.
  const isWatermarkRequired = !isPaid ? true : (options?.isWatermarkRequired ?? false);

  // 3. Preload Official EZRAB Assets
  const [officialEmblem, officialLogo] = await Promise.all([
    loadOfficialEzrabEmblem(),
    loadOfficialEzrabLogo(),
  ]);

  // Company logo resolution (respecting paid plan status and aspect ratio)
  const effectiveCompanyLogo = isPaid && (options?.companyLogoUrl || company.logo)
    ? (options?.companyLogoUrl || company.logo)
    : officialLogo;

  // 4. Initialize jsPDF Document (Portrait for Cover & Summary)
  const doc = new SafeJsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm

  const watermarkOpts = {
    enabled: isWatermarkRequired,
    emblemDataUrl: officialEmblem,
    text: 'EZRAB AI — FREE / TRIAL VERSION',
    opacity: 0.08,
  };

  const documentNumber = options?.documentNumberOverride || project.projectNumber || 'PRJ-2026-001';
  const revisionNumber = options?.revisionOverride || project.currentVersion || 'Rev. 0.0';
  const dateFormatted = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // =========================================================================
  // HALAMAN 1 — COVER (PORTRAIT)
  // =========================================================================

  // Decorative border margin
  doc.setDrawColor(...DOC_COLORS.BLUE_ACCENT);
  doc.setLineWidth(0.8);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

  doc.setDrawColor(...DOC_COLORS.BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // Watermark on Cover (if free/trial)
  renderPdfWatermark(doc, pageWidth, pageHeight, watermarkOpts);

  // Top Logo / Header in Cover
  const logoTopY = 22;
  if (effectiveCompanyLogo) {
    try {
      // Fit logo in a clean 48mm width x 20mm height box without distortion
      doc.addImage(effectiveCompanyLogo, 'PNG', 20, logoTopY, 45, 15);
    } catch (e) {
      console.warn('[PDF Cover] Failed to render company logo, using text header:', e);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...DOC_COLORS.NAVY_PRIMARY);
      doc.text(company.name.toUpperCase(), 20, logoTopY + 8);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...DOC_COLORS.NAVY_PRIMARY);
    doc.text(company.name.toUpperCase(), 20, logoTopY + 8);
  }

  // Company contact right side of cover header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
  const compName = company.name || '-';
  const compAddress = company.address || '-';
  const compPhone = company.phone || '-';
  const compTax = company.taxNumber || '-';
  doc.text(compName, pageWidth - 20, logoTopY + 4, { align: 'right' });
  doc.text(compAddress, pageWidth - 20, logoTopY + 8, { align: 'right' });
  doc.text(`Telp: ${compPhone} | NPWP: ${compTax}`, pageWidth - 20, logoTopY + 12, { align: 'right' });

  // Divider Line
  doc.setDrawColor(...DOC_COLORS.BLUE_ACCENT);
  doc.setLineWidth(0.6);
  doc.line(20, logoTopY + 18, pageWidth - 20, logoTopY + 18);

  // Title Box in middle of Cover
  const titleY = 82;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...DOC_COLORS.NAVY_PRIMARY);
  doc.text('RENCANA ANGGARAN BIAYA', pageWidth / 2, titleY, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(...DOC_COLORS.BLUE_ACCENT);
  doc.text('( R A B )', pageWidth / 2, titleY + 8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
  doc.text('DOKUMEN PENAWARAN & ESTIMASI BIAYA KONSTRUKSI', pageWidth / 2, titleY + 15, { align: 'center' });

  // Blue Accent Bar
  doc.setFillColor(...DOC_COLORS.BLUE_ACCENT);
  doc.rect((pageWidth / 2) - 25, titleY + 20, 50, 1.2, 'F');

  // Project Identity Metadata Box (Formal Certificate Grid)
  const metaBoxY = titleY + 30;
  const metaBody = [
    [{ content: 'Nama Proyek', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${project.name}`],
    [{ content: 'Lokasi Proyek', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${project.location || 'Indonesia'}`],
    [{ content: 'Pemilik Pekerjaan (Klien)', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${project.clientName || (project as any).client || 'Pribadi'}`],
    [{ content: 'Kontraktor / Konsultan', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${company.name}`],
    [{ content: 'Nomor Dokumen', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${documentNumber}`],
    [{ content: 'Status / Revisi', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${revisionNumber} (${(project.status || 'DRAFT').toUpperCase()})`],
    [{ content: 'Tanggal Dokumen', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${dateFormatted}`],
    [{ content: 'Penyusun (Lead Estimator)', styles: { fontStyle: 'bold', textColor: DOC_COLORS.NAVY_PRIMARY } }, `: ${options?.leadEstimatorName || company.leadEstimatorName || '-'}`],
  ];

  safeAutoTable(doc, {
    startY: metaBoxY,
    body: metaBody,
    theme: 'plain',
    tableWidth: 160,
    styles: {
      fontSize: 9,
      cellPadding: 2,
      textColor: DOC_COLORS.TEXT_BODY,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 110 },
    },
    margin: { left: 25, right: 25 },
  });

  // Grand Total Highlight Banner on Cover
  const coverTableEndY = (doc as any).lastAutoTable.finalY || (metaBoxY + 50);
  const totalCardY = coverTableEndY + 8;

  doc.setFillColor(...DOC_COLORS.BLUE_LIGHT);
  doc.setDrawColor(...DOC_COLORS.BLUE_ACCENT);
  doc.setLineWidth(0.4);
  doc.roundedRect(25, totalCardY, pageWidth - 50, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...DOC_COLORS.BLUE_ACCENT);
  doc.text('TOTAL ESTIMASI ANGGARAN BIAYA (TERMASUK PPN)', pageWidth / 2, totalCardY + 6.5, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(...DOC_COLORS.NAVY_PRIMARY);
  doc.text(formatRupiah(costs.grandTotal), pageWidth / 2, totalCardY + 14, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
  doc.text(`Terbilang: ${terbilangIndo(costs.grandTotal)}`, pageWidth / 2, totalCardY + 20, { align: 'center' });

  // Cover Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
  doc.text(
    `Dokumen Sah Dihasilkan oleh Platform EZRAB AI Konstruksi • ${new Date().getFullYear()}`,
    pageWidth / 2,
    pageHeight - 16,
    { align: 'center' }
  );

  // =========================================================================
  // HALAMAN 2 — IDENTITAS TEKNIS & REKAPITULASI BIAYA (PORTRAIT)
  // =========================================================================
  doc.addPage('a4', 'portrait');

  // Watermark for page 2
  renderPdfWatermark(doc, pageWidth, pageHeight, watermarkOpts);

  // Running Header Page 2
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DOC_COLORS.NAVY_PRIMARY);
  doc.text('REKAPITULASI RENCANA ANGGARAN BIAYA (RAB)', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
  doc.text(`Proyek: ${project.name} | No: ${documentNumber} | Tanggal: ${dateFormatted}`, 14, 21);

  doc.setDrawColor(...DOC_COLORS.BLUE_ACCENT);
  doc.setLineWidth(0.6);
  doc.line(14, 23, pageWidth - 14, 23);

  // Project Technical Parameters Sub-table
  const buildingArea = project.buildingArea || 120;
  const landArea = project.landArea || 150;
  const costPerM2 = buildingArea > 0 ? Math.round(costs.grandTotal / buildingArea) : 0;

  const techParamsBody = [
    [
      { content: 'Jenis Bangunan:', styles: { fontStyle: 'bold' } },
      project.buildingType || 'Rumah Tinggal',
      { content: 'Luas Bangunan:', styles: { fontStyle: 'bold' } },
      `${buildingArea} m² (Tanah: ${landArea} m²)`,
    ],
    [
      { content: 'Standar Regional:', styles: { fontStyle: 'bold' } },
      (project as any).regionalStandard || 'DKI Jakarta (Indeks 1.00)',
      { content: 'Estimasi Biaya / m²:', styles: { fontStyle: 'bold' } },
      `${formatRupiah(costPerM2)} / m²`,
    ],
  ];

  safeAutoTable(doc, {
    startY: 26,
    body: techParamsBody as any,
    theme: 'plain',
    tableWidth: 182,
    styles: { fontSize: 8, cellPadding: 1.2, textColor: DOC_COLORS.TEXT_BODY },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 59 },
      2: { cellWidth: 32 },
      3: { cellWidth: 59 },
    },
    margin: { left: 14, right: 14 },
  });

  // WBS Category Summary Rows
  const recapRows: any[] = [];
  sections.forEach((sec, idx) => {
    const weightPercent = costs.directCost > 0 ? (sec.subtotal / costs.directCost) * 100 : 0;
    recapRows.push([
      (idx + 1).toString(),
      sec.name,
      `${formatNumberId(weightPercent, 2)} %`,
      formatRupiah(sec.subtotal),
    ]);
  });

  // Subtotal Direct Cost Row
  recapRows.push([
    '',
    { content: 'JUMLAH BIAYA LANGSUNG FISIK (DIRECT COST)', styles: { fontStyle: 'bold', halign: 'right' } },
    { content: '100,00 %', styles: { fontStyle: 'bold', halign: 'center' } },
    { content: formatRupiah(costs.directCost), styles: { fontStyle: 'bold', halign: 'right' } },
  ]);

  // Overhead Row
  if (costs.overheadPercent > 0) {
    recapRows.push([
      '',
      { content: `Biaya Overhead Umum (${costs.overheadPercent}%)`, styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: `${formatNumberId(costs.overheadPercent, 2)} %`, styles: { halign: 'center', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: formatRupiah(costs.overheadAmount), styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
    ]);
  }

  // Profit Row
  if (costs.profitPercent > 0) {
    recapRows.push([
      '',
      { content: `Keuntungan Kontraktor (${costs.profitPercent}%)`, styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: `${formatNumberId(costs.profitPercent, 2)} %`, styles: { halign: 'center', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: formatRupiah(costs.profitAmount), styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
    ]);
  }

  // Tax PPN Row
  if (costs.taxAmount > 0) {
    recapRows.push([
      '',
      { content: `Pajak Pertambahan Nilai (PPN ${costs.taxPercent}%)`, styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: `${formatNumberId(costs.taxPercent, 2)} %`, styles: { halign: 'center', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: formatRupiah(costs.taxAmount), styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
    ]);
  }

  // Tax PPh Row (if configured)
  const pphPercent = (project.costSummary as any)?.pphPercent || 0;
  if (pphPercent > 0) {
    const pphAmount = Math.round(costs.directCost * (pphPercent / 100));
    recapRows.push([
      '',
      { content: `Pajak Penghasilan (PPh Final ${pphPercent}%)`, styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: `${formatNumberId(pphPercent, 2)} %`, styles: { halign: 'center', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: formatRupiah(pphAmount), styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
    ]);
  }

  // Grand Total Highlight Row
  recapRows.push([
    '',
    {
      content: 'TOTAL BIAYA KESELURUHAN (GRAND TOTAL)',
      styles: {
        fontStyle: 'bold',
        halign: 'right',
        fillColor: DOC_COLORS.BLUE_ACCENT,
        textColor: [255, 255, 255],
      },
    },
    {
      content: '-',
      styles: {
        fontStyle: 'bold',
        halign: 'center',
        fillColor: DOC_COLORS.BLUE_ACCENT,
        textColor: [255, 255, 255],
      },
    },
    {
      content: formatRupiah(costs.grandTotal),
      styles: {
        fontStyle: 'bold',
        halign: 'right',
        fillColor: DOC_COLORS.BLUE_ACCENT,
        textColor: [255, 255, 255],
      },
    },
  ]);

  safeAutoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 4,
    head: [['No', 'Uraian Kelompok Pekerjaan (WBS)', 'Bobot (%)', 'Jumlah Harga (Rp)']],
    body: recapRows,
    theme: 'grid',
    tableWidth: 182,
    headStyles: {
      fillColor: DOC_COLORS.NAVY_PRIMARY,
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: DOC_COLORS.TEXT_DARK,
      lineColor: DOC_COLORS.BORDER_COLOR,
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 104 },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 42, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // Terbilang Note under Recap Table
  const recapEndY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
  doc.text(`Terbilang: ${terbilangIndo(costs.grandTotal)}`, 14, recapEndY);

  // Formal 3-Column Signature Block
  const sigY = recapEndY + 12;
  const col1X = 35;
  const col2X = pageWidth / 2;
  const col3X = pageWidth - 35;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...DOC_COLORS.TEXT_BODY);

  doc.text('Disusun Oleh,', col1X, sigY, { align: 'center' });
  doc.text('Lead Estimator', col1X, sigY + 4, { align: 'center' });
  doc.line(col1X - 22, sigY + 22, col1X + 22, sigY + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(options?.leadEstimatorName || company.leadEstimatorName || '-', col1X, sigY + 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.text('Direview & Disetujui,', col2X, sigY, { align: 'center' });
  doc.text('Direktur Teknik', col2X, sigY + 4, { align: 'center' });
  doc.line(col2X - 22, sigY + 22, col2X + 22, sigY + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(options?.directorName || company.directorName || '-', col2X, sigY + 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.text('Disetujui Oleh,', col3X, sigY, { align: 'center' });
  doc.text('Pemilik / Klien Proyek', col3X, sigY + 4, { align: 'center' });
  doc.line(col3X - 22, sigY + 22, col3X + 22, sigY + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(options?.clientApproverName || project.clientName || (project as any).client || 'Owner Proyek', col3X, sigY + 26, { align: 'center' });

  // Page 2 Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
  doc.text(`Dokumen Resmi EZRAB PRO • Halaman 2`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  doc.text(`Dicetak pada: ${dateFormatted}`, 14, pageHeight - 8);

  // =========================================================================
  // HALAMAN 3 DST — DETAIL RINCIAN RAB (LANDSCAPE)
  // =========================================================================
  // Add first landscape page for detailed items
  doc.addPage('a4', 'landscape');

  const lsWidth = doc.internal.pageSize.getWidth(); // 297mm
  const lsHeight = doc.internal.pageSize.getHeight(); // 210mm

  // Prepare table rows for Detailed RAB
  const detailRows: any[] = [];
  let globalItemIndex = 1;

  sections.forEach((section) => {
    const secWeight = costs.directCost > 0 ? (section.subtotal / costs.directCost) * 100 : 0;

    // Section Category Header Row
    detailRows.push([
      {
        content: section.code,
        styles: { fontStyle: 'bold', fillColor: DOC_COLORS.SLATE_LIGHT, textColor: DOC_COLORS.NAVY_PRIMARY },
      },
      {
        content: section.name.toUpperCase(),
        colSpan: 5,
        styles: { fontStyle: 'bold', fillColor: DOC_COLORS.SLATE_LIGHT, textColor: DOC_COLORS.NAVY_PRIMARY },
      },
      {
        content: formatRupiah(section.subtotal),
        styles: { fontStyle: 'bold', halign: 'right', fillColor: DOC_COLORS.SLATE_LIGHT, textColor: DOC_COLORS.NAVY_PRIMARY },
      },
      {
        content: `${formatNumberId(secWeight, 2)} %`,
        styles: { fontStyle: 'bold', halign: 'right', fillColor: DOC_COLORS.SLATE_LIGHT, textColor: DOC_COLORS.NAVY_PRIMARY },
      },
    ]);

    // Items within section
    (section.items || []).forEach((item) => {
      const itemTotalPrice = Number(item.totalPrice) || (Number(item.volume) * Number(item.unitPrice)) || 0;
      const itemWeight = costs.directCost > 0 ? (itemTotalPrice / costs.directCost) * 100 : 0;

      detailRows.push([
        globalItemIndex.toString(),
        item.code || '-',
        item.description + (item.specification ? `\nSpesifikasi: ${item.specification}` : ''),
        item.unit || 'ls',
        item.volume.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
        formatRupiah(item.unitPrice),
        formatRupiah(itemTotalPrice),
        `${formatNumberId(itemWeight, 2)} %`,
      ]);
      globalItemIndex++;
    });
  });

  // Direct Cost Subtotal Row
  detailRows.push([
    '',
    { content: 'SUBTOTAL BIAYA LANGSUNG FISIK (DIRECT COST)', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: formatRupiah(costs.directCost), styles: { fontStyle: 'bold', halign: 'right' } },
    { content: '100,00 %', styles: { fontStyle: 'bold', halign: 'right' } },
  ]);

  // Tax Row
  if (costs.taxAmount > 0) {
    detailRows.push([
      '',
      { content: `Pajak Pertambahan Nilai (PPN ${costs.taxPercent}%)`, colSpan: 5, styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: formatRupiah(costs.taxAmount), styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
      { content: '-', styles: { halign: 'right', textColor: DOC_COLORS.SLATE_MUTED } },
    ]);
  }

  // Grand Total in Detail Table
  detailRows.push([
    '',
    {
      content: 'TOTAL BIAYA KESELURUHAN (GRAND TOTAL)',
      colSpan: 5,
      styles: {
        fontStyle: 'bold',
        halign: 'right',
        fillColor: DOC_COLORS.BLUE_ACCENT,
        textColor: [255, 255, 255],
      },
    },
    {
      content: formatRupiah(costs.grandTotal),
      styles: {
        fontStyle: 'bold',
        halign: 'right',
        fillColor: DOC_COLORS.BLUE_ACCENT,
        textColor: [255, 255, 255],
      },
    },
    {
      content: '-',
      styles: {
        fontStyle: 'bold',
        halign: 'right',
        fillColor: DOC_COLORS.BLUE_ACCENT,
        textColor: [255, 255, 255],
      },
    },
  ]);

  // Landscape Table Widths: Total 273 mm (fits in 297 mm with 12 mm margins)
  safeAutoTable(doc, {
    startY: 22,
    head: [['No', 'Kode AHSP', 'Uraian Pekerjaan & Spesifikasi', 'Satuan', 'Volume', 'Harga Satuan (Rp)', 'Jumlah Harga (Rp)', 'Bobot (%)']],
    body: detailRows,
    theme: 'grid',
    tableWidth: 273,
    rowPageBreak: 'avoid',
    showHead: 'everyPage', // REPEAT HEADER AUTOMATICALLY ON EVERY LANDSCAPE PAGE
    headStyles: {
      fillColor: DOC_COLORS.NAVY_PRIMARY,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: DOC_COLORS.TEXT_DARK,
      lineColor: DOC_COLORS.BORDER_COLOR,
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 100 },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 40, halign: 'right' },
      6: { cellWidth: 44, halign: 'right' },
      7: { cellWidth: 20, halign: 'right' },
    },
    margin: { left: 12, right: 12, top: 22, bottom: 14 },
    didDrawPage: (data: any) => {
      // Only apply landscape header & footer for page 3 onwards
      if (data.pageNumber >= 3) {
        // Watermark for each landscape page
        renderPdfWatermark(doc, lsWidth, lsHeight, watermarkOpts);

        // Running Header Landscape
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...DOC_COLORS.NAVY_PRIMARY);
        doc.text('RINCIAN DETAIL RENCANA ANGGARAN BIAYA (RAB)', 12, 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
        doc.text(`Proyek: ${project.name} | Dok: ${documentNumber} | Revisi: ${revisionNumber}`, 12, 16.5);

        doc.text(`Dicetak: ${dateFormatted}`, lsWidth - 12, 16.5, { align: 'right' });

        // Running Line Separator Top
        doc.setDrawColor(...DOC_COLORS.BORDER_COLOR);
        doc.setLineWidth(0.3);
        doc.line(12, 18.5, lsWidth - 12, 18.5);

        // Running Footer Landscape
        doc.setFontSize(7.5);
        doc.setTextColor(...DOC_COLORS.SLATE_MUTED);
        doc.text(
          `Dokumen Resmi EZRAB PRO • Dicetak pada ${dateFormatted}`,
          12,
          lsHeight - 6
        );

        // Page numbering
        doc.text(
          `Halaman ${data.pageNumber}`,
          lsWidth - 12,
          lsHeight - 6,
          { align: 'right' }
        );
      }
    },
  });

  // 9. Multi-tier cross-browser PDF download execution
  if (typeof window !== 'undefined') {
    // P0-B: jangan pakai nomor dokumen contoh sebagai identitas resmi.
    const cleanDocNum = (documentNumber || project.projectNumber || project.id || 'TANPA-NOMOR').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanProjName = (project.name || 'Proyek').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `RAB_${cleanDocNum}_${cleanProjName}_Resmi.pdf`;

    try {
      // Tier 1: Blob-based download via file-saver
      const blob = doc.output('blob');
      if (typeof saveAs === 'function') {
        saveAs(blob, fileName);
      } else if (typeof window.URL !== 'undefined' && typeof document !== 'undefined') {
        // Tier 2: Programmatic anchor download
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 1500);
      } else {
        doc.save(fileName);
      }
    } catch (saveErr) {
      console.warn('[PDFExporter] Blob download fallback to doc.save:', saveErr);
      try {
        doc.save(fileName);
      } catch (finalErr) {
        console.error('[PDFExporter] All download methods failed:', finalErr);
      }
    }
  }

  return doc;
}
