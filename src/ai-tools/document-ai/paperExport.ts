/**
 * AI DOKUMEN — Ekspor Kertas (Fase B3 Paper System).
 *
 * Menghasilkan PDF dan DOCX ASLI dari PaperBlock (paperModel.ts) memakai
 * library yang sama dengan document-engine proyek: jsPDF + autotable untuk
 * PDF, paket `docx` untuk Word, file-saver untuk unduhan.
 *
 * Mengapa tidak lewat exportService document-engine: kontraknya terikat
 * DocumentDefinition + master-data tender (validasinya dapat menghentikan
 * ekspor dokumen bebas AI Document). Generator ramping ini memakai model
 * blok sendiri agar perilaku ekspor dokumen bebas dapat diprediksi & diuji.
 *
 * Fidelitas: PDF A4 dengan kop (halaman 1), footer + nomor halaman semua
 * halaman, tabel autotable, font Times. DOCX A4 dengan header kop Word,
 * footer bernomor halaman (field Word asli), heading & tabel Word asli.
 * Kop dua mode (polish §3): terstruktur (logo + identitas) atau gambar kop
 * penuh yang menggantikan seluruh blok terstruktur; rasio gambar asli
 * dipertahankan di kedua format (jsPDF getImageProperties untuk PDF,
 * parser dimensi byte untuk DOCX).
 * Keterbatasan: gaya inline di dalam sel tabel diratakan; daftar bernomor
 * DOCX memakai satu skema penomoran dokumen (tidak restart per daftar).
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import fileSaver from 'file-saver';
import type { PaperBlock, PaperRun } from './paperModel';
import { kopContactLine, type CompanyProfile } from './companyProfile';

export interface PaperExportInput {
  title: string;
  blocks: PaperBlock[];
  profile: CompanyProfile | null;
  orientation?: 'portrait' | 'landscape';
}

function safeFilename(title: string, ext: string): string {
  const base = (title || 'Dokumen AI').replace(/[^\w\- ]/g, '').trim().slice(0, 60) || 'Dokumen AI';
  return `${base}.${ext}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#1d4ed8').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  if (Number.isNaN(n)) return [29, 78, 216];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; kind: 'png' | 'jpg' | 'gif' | 'bmp' } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!m) return { bytes: new Uint8Array(0), kind: 'png' };
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const kind = m[1] === 'jpeg' || m[1] === 'jpg' ? 'jpg' : m[1] === 'gif' ? 'gif' : 'png';
  return { bytes, kind };
}

/**
 * Dimensi asli gambar dari byte mentah (PNG/JPEG/GIF/WebP) — deterministik,
 * tanpa memuat Image. Dipakai ekspor DOCX agar rasio logo/kop memakai rasio
 * ASLI gambar, bukan tebakan. null bila format tidak dikenali/rusak.
 */
export function imageSizeFromBytes(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    // PNG: IHDR pada offset 16 (lebar) & 20 (tinggi), big-endian.
    const w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    const h = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    // GIF: lebar/tinggi little-endian pada offset 6 & 8.
    const w = bytes[6] | (bytes[7] << 8);
    const h = bytes[8] | (bytes[9] << 8);
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    // WebP: VP8X (extended) menyimpan canvas 24-bit LE (+1) pada 24 & 27.
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
      const w = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
      const h = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
      return { width: w, height: h };
    }
    // WebP VP8 (lossy): dimensi 14-bit pada offset 26 & 28.
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20 && bytes.length >= 30) {
      const w = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const h = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG: telusuri segmen sampai Start-Of-Frame (bukan DHT/JPGn/DAC).
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        return w > 0 && h > 0 ? { width: w, height: h } : null;
      }
      if (segLen < 2) return null;
      i += 2 + segLen;
    }
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* PDF (jsPDF)                                                         */
/* ------------------------------------------------------------------ */

const MM = {
  pageW: 210,
  pageH: 297,
  marginX: 20,
  top: 16,
  bottom: 18,
};
const LINE_H = 6.4;

function fontStyleOf(r: PaperRun): string {
  if (r.bold && r.italic) return 'bolditalic';
  if (r.bold) return 'bold';
  if (r.italic) return 'italic';
  return 'normal';
}

interface StyledWord { text: string; style: string; underline?: boolean; strike?: boolean }

function wordsOf(runs: PaperRun[]): StyledWord[] {
  const words: StyledWord[] = [];
  for (const r of runs) {
    const style = fontStyleOf(r);
    for (const w of r.text.split(/\s+/)) {
      if (w) words.push({ text: w, style, underline: r.underline, strike: r.strike });
    }
  }
  return words;
}

export async function exportPaperPdf(input: PaperExportInput): Promise<void> {
  const landscape = input.orientation === 'landscape';
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  const pageW = landscape ? MM.pageH : MM.pageW;
  const pageH = landscape ? MM.pageW : MM.pageH;
  const contentW = pageW - MM.marginX * 2;
  const bottomLimit = pageH - MM.bottom;
  const p = input.profile;
  let y = MM.top;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = MM.top;
    }
  };

  /* Kop surat gambar penuh — halaman pertama, MENGGANTIKAN kop terstruktur
     (tidak ditumpuk). Lebar sesuai fullKopWidthPct dari area konten, rasio
     asli dipertahankan lewat properti gambar jsPDF; isi mulai di bawah kop
     + margin aman profil. Bila gambar gagal dibaca jsPDF, jatuh ke kop
     terstruktur di bawah (dokumen tidak pernah kehilangan kop diam-diam). */
  let fullKopDrawn = false;
  if (p && p.kopMode === 'full' && p.fullKopDataUrl) {
    try {
      const props = doc.getImageProperties(p.fullKopDataUrl);
      const pct = Math.max(10, Math.min(100, p.fullKopWidthPct ?? 100));
      const kopW = (contentW * pct) / 100;
      const kopH = (kopW * props.height) / props.width;
      doc.addImage(p.fullKopDataUrl, 'PNG', MM.marginX + (contentW - kopW) / 2, y, kopW, kopH);
      y += kopH + Math.max(0, p.fullKopMarginMm ?? 0) + 6;
      fullKopDrawn = true;
    } catch { /* jatuh ke kop terstruktur */ }
  }

  /* Kop surat terstruktur — halaman pertama */
  if (!fullKopDrawn && p && (p.name.trim() || p.logoDataUrl)) {
    const accent = hexToRgb(p.accentColor);
    let logoW = 0;
    let logoH = 0;
    if (p.logoDataUrl) {
      try {
        const props = doc.getImageProperties(p.logoDataUrl);
        logoW = Math.max(14, Math.min(70, p.logoWidthMm || 32));
        logoH = (logoW * props.height) / props.width;
        if (logoH > 24) {
          logoH = 24;
          logoW = (24 * props.width) / props.height;
        }
      } catch { logoW = 0; }
    }
    const contact = kopContactLine(p);
    if (p.layout === 'center') {
      if (logoW > 0) doc.addImage(p.logoDataUrl!, 'PNG', (pageW - logoW) / 2, y, logoW, logoH);
      let ty = y + (logoW > 0 ? logoH + 3 : 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      if (p.name.trim()) { doc.text(p.name, pageW / 2, ty + 5, { align: 'center' }); ty += 8; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      if (contact) { doc.text(contact, pageW / 2, ty + 3, { align: 'center', maxWidth: contentW }); ty += 6; }
      doc.setTextColor(0, 0, 0);
      y = ty + 2;
    } else if (p.layout === 'minimal') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      if (p.name.trim()) doc.text(p.name, MM.marginX, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      if (contact) doc.text(contact, pageW - MM.marginX, y + 5, { align: 'right', maxWidth: contentW * 0.55 });
      doc.setTextColor(0, 0, 0);
      y += 9;
    } else {
      // left
      let textX = MM.marginX;
      if (logoW > 0) {
        doc.addImage(p.logoDataUrl!, 'PNG', MM.marginX, y, logoW, logoH);
        textX = MM.marginX + logoW + 6;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      if (p.name.trim()) doc.text(p.name, textX, y + 5, { maxWidth: pageW - MM.marginX - textX });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      if (contact) doc.text(contact, textX, y + 11, { maxWidth: pageW - MM.marginX - textX });
      doc.setTextColor(0, 0, 0);
      y += Math.max(logoH, 14) + 3;
    }
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(0.9);
    doc.line(MM.marginX, y, pageW - MM.marginX, y);
    y += 8;
  }

  /** Gambar satu paragraf kaya (bold/italic per kata) dengan word-wrap manual. */
  const drawRichParagraph = (runs: PaperRun[], opts?: { size?: number; align?: string; indent?: number }) => {
    const size = opts?.size ?? 12;
    const indent = opts?.indent ?? 0;
    const maxW = contentW - indent;
    doc.setFontSize(size);
    const words = wordsOf(runs);
    if (words.length === 0) return;
    // Susun baris
    const lines: StyledWord[][] = [];
    let line: StyledWord[] = [];
    let lineW = 0;
    for (const w of words) {
      doc.setFont('times', w.style);
      const ww = doc.getTextWidth(w.text);
      const spaceW = line.length ? doc.getTextWidth(' ') : 0;
      if (line.length && lineW + spaceW + ww > maxW) {
        lines.push(line);
        line = [w];
        lineW = ww;
      } else {
        line.push(w);
        lineW += spaceW + ww;
      }
    }
    if (line.length) lines.push(line);
    for (const ln of lines) {
      newPageIfNeeded(LINE_H);
      let totalW = 0;
      for (let i = 0; i < ln.length; i++) {
        doc.setFont('times', ln[i].style);
        totalW += doc.getTextWidth(ln[i].text) + (i ? doc.getTextWidth(' ') : 0);
      }
      let x = MM.marginX + indent;
      if (opts?.align === 'center') x = MM.marginX + indent + (maxW - totalW) / 2;
      else if (opts?.align === 'right') x = MM.marginX + indent + (maxW - totalW);
      for (let i = 0; i < ln.length; i++) {
        const w = ln[i];
        doc.setFont('times', w.style);
        if (i) x += doc.getTextWidth(' ');
        doc.text(w.text, x, y + 4.4);
        const ww = doc.getTextWidth(w.text);
        if (w.underline) doc.line(x, y + 5.4, x + ww, y + 5.4);
        if (w.strike) doc.line(x, y + 2.6, x + ww, y + 2.6);
        x += ww;
      }
      y += LINE_H;
    }
    y += 2.2;
  };

  for (const b of input.blocks) {
    if (b.type === 'heading') {
      const size = b.level === 1 ? 16 : b.level === 2 ? 13.5 : 12;
      newPageIfNeeded(LINE_H * 2.4);
      y += b.level === 1 ? 2 : 4;
      doc.setFont('times', 'bold');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(b.text, contentW) as string[];
      for (const ln of lines) {
        newPageIfNeeded(LINE_H);
        const align = b.align === 'center' ? 'center' : b.align === 'right' ? 'right' : 'left';
        doc.text(ln, align === 'left' ? MM.marginX : align === 'center' ? pageW / 2 : pageW - MM.marginX, y + 4.4, { align });
        y += LINE_H * (size / 12);
      }
      y += 2;
    } else if (b.type === 'paragraph') {
      drawRichParagraph(b.runs, { align: b.align });
    } else if (b.type === 'list') {
      b.items.forEach((item, i) => {
        const marker: PaperRun[] = [{ text: b.ordered ? `${i + 1}.` : '•', bold: false }];
        newPageIfNeeded(LINE_H);
        drawRichParagraph([...marker, ...item.map((r, ix) => (ix === 0 ? { ...r, text: ` ${r.text}` } : r))], { indent: 4 });
      });
      y += 1;
    } else if (b.type === 'table') {
      newPageIfNeeded(14);
      autoTable(doc, {
        startY: y,
        head: b.header ? [b.header] : undefined,
        body: b.rows,
        theme: 'grid',
        styles: { font: 'times', fontSize: 10, cellPadding: 1.6, lineColor: [148, 163, 184], lineWidth: 0.2 },
        headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold' },
        margin: { left: MM.marginX, right: MM.marginX },
      });
      const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      y = (last?.finalY ?? y + 20) + 6;
    } else if (b.type === 'hr') {
      newPageIfNeeded(6);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
      doc.line(MM.marginX, y + 2, pageW - MM.marginX, y + 2);
      y += 6;
    } else if (b.type === 'image') {
      try {
        if (b.src.startsWith('data:')) {
          const props = doc.getImageProperties(b.src);
          const w = Math.min(120, contentW);
          const h = (w * props.height) / props.width;
          newPageIfNeeded(h + 4);
          doc.addImage(b.src, 'PNG', MM.marginX + (contentW - w) / 2, y, w, h);
          y += h + 5;
        }
      } catch { /* gambar tidak dapat dirender — dilewati dengan sadar */ }
    } else if (b.type === 'pageBreak') {
      doc.addPage();
      y = MM.top;
    }
  }

  /* Footer + nomor halaman di semua halaman */
  const total = doc.getNumberOfPages();
  const footLeft = [p?.name?.trim(), input.title].filter(Boolean).join(' • ');
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(MM.marginX, pageH - 14, pageW - MM.marginX, pageH - 14);
    if (footLeft) doc.text(footLeft, MM.marginX, pageH - 9, { maxWidth: contentW * 0.7 });
    doc.text(`Halaman ${i} dari ${total}`, pageW - MM.marginX, pageH - 9, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(safeFilename(input.title, 'pdf'));
}

/* ------------------------------------------------------------------ */
/* DOCX (paket docx)                                                   */
/* ------------------------------------------------------------------ */

function runsToTextRuns(runs: PaperRun[], size = 24): TextRun[] {
  return runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        underline: r.underline ? {} : undefined,
        strike: r.strike,
        size,
        font: 'Times New Roman',
      }),
  );
}

function alignOf(a?: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (a === 'center') return AlignmentType.CENTER;
  if (a === 'right') return AlignmentType.RIGHT;
  if (a === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

export async function exportPaperDocx(input: PaperExportInput): Promise<void> {
  const p = input.profile;
  const landscape = input.orientation === 'landscape';

  /* Header kop Word */
  let header: Header | undefined;
  const fullKopDocx = p && p.kopMode === 'full' && p.fullKopDataUrl ? p.fullKopDataUrl : null;
  if (p && (p.name.trim() || p.logoDataUrl || fullKopDocx)) {
    const children: Paragraph[] = [];
    // Lebar area konten DOCX (twips → px @96dpi): halaman dikurangi margin kiri/kanan 1134 twips.
    const contentWidthPx = Math.round((((landscape ? 16838 : 11906) - 2268) / 1440) * 96);
    if (fullKopDocx) {
      // Kop gambar penuh: SATU gambar di header, rasio asli dari byte gambar;
      // tanpa nama/kontak terstruktur agar tidak dobel dengan isi kop.
      const { bytes, kind } = dataUrlToBytes(fullKopDocx);
      if (bytes.length) {
        const size = imageSizeFromBytes(bytes);
        const pct = Math.max(10, Math.min(100, p.fullKopWidthPct ?? 100));
        const widthPx = Math.round((contentWidthPx * pct) / 100);
        const ratio = size ? size.height / size.width : 0.25;
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ type: kind, data: bytes, transformation: { width: widthPx, height: Math.max(1, Math.round(widthPx * ratio)) } })],
          }),
        );
      }
    } else if (p.logoDataUrl) {
      const { bytes, kind } = dataUrlToBytes(p.logoDataUrl);
      if (bytes.length) {
        const widthPx = Math.round((Math.max(14, Math.min(70, p.logoWidthMm || 32)) / 25.4) * 96);
        // Rasio ASLI logo dari byte gambar (sebelumnya ditebak 0.45).
        const size = imageSizeFromBytes(bytes);
        const ratio = size ? size.height / size.width : 0.45;
        children.push(
          new Paragraph({
            alignment: p.layout === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
            children: [new ImageRun({ type: kind, data: bytes, transformation: { width: widthPx, height: Math.max(1, Math.round(widthPx * ratio)) } })],
          }),
        );
      }
    }
    if (!fullKopDocx && p.name.trim()) {
      children.push(
        new Paragraph({
          alignment: p.layout === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: p.name, bold: true, size: 30, font: 'Calibri' })],
        }),
      );
    }
    const contact = fullKopDocx ? '' : kopContactLine(p);
    if (contact) {
      children.push(
        new Paragraph({
          alignment: p.layout === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: contact, size: 18, color: '64748B', font: 'Calibri' })],
        }),
      );
    }
    header = new Header({ children });
  }

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${p?.name?.trim() ? `${p.name} • ` : ''}${input.title} — Halaman `, size: 17, color: '64748B', font: 'Calibri' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 17, color: '64748B', font: 'Calibri' }),
          new TextRun({ text: ' dari ', size: 17, color: '64748B', font: 'Calibri' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: '64748B', font: 'Calibri' }),
        ],
      }),
    ],
  });

  const children: (Paragraph | Table)[] = [];
  for (const b of input.blocks) {
    if (b.type === 'heading') {
      children.push(
        new Paragraph({
          text: b.text,
          heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          alignment: alignOf(b.align),
          keepNext: true,
        }),
      );
    } else if (b.type === 'paragraph') {
      children.push(new Paragraph({ children: runsToTextRuns(b.runs), alignment: alignOf(b.align), spacing: { after: 120, line: 360 } }));
    } else if (b.type === 'list') {
      b.items.forEach((item, i) => {
        if (b.ordered) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${i + 1}. `, size: 24, font: 'Times New Roman' }), ...runsToTextRuns(item)],
              indent: { left: 360 },
              spacing: { after: 60, line: 360 },
            }),
          );
        } else {
          children.push(
            new Paragraph({
              children: runsToTextRuns(item),
              bullet: { level: 0 },
              spacing: { after: 60, line: 360 },
            }),
          );
        }
      });
    } else if (b.type === 'table') {
      const rows: TableRow[] = [];
      if (b.header) {
        rows.push(
          new TableRow({
            tableHeader: true,
            children: b.header.map(
              (h) =>
                new TableCell({
                  shading: { type: ShadingType.CLEAR, fill: '1D4ED8' },
                  children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20, font: 'Times New Roman' })] })],
                }),
            ),
          }),
        );
      }
      for (const row of b.rows) {
        rows.push(
          new TableRow({
            children: row.map(
              (c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, size: 20, font: 'Times New Roman' })] })] }),
            ),
          }),
        );
      }
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      children.push(new Paragraph({ text: '' }));
    } else if (b.type === 'hr') {
      children.push(
        new Paragraph({
          text: '',
          border: { bottom: { style: 'single' as never, size: 6, color: '94A3B8', space: 1 } },
        }),
      );
    } else if (b.type === 'image') {
      if (b.src.startsWith('data:')) {
        const { bytes, kind } = dataUrlToBytes(b.src);
        if (bytes.length) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ type: kind, data: bytes, transformation: { width: 453, height: 300 } })],
            }),
          );
        }
      }
    } else if (b.type === 'pageBreak') {
      children.push(new Paragraph({ pageBreakBefore: true, text: '' }));
    }
  }

  const docx = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: landscape ? 16838 : 11906,
              height: landscape ? 11906 : 16838,
              orientation: landscape ? ('landscape' as never) : ('portrait' as never),
            },
            margin: { top: 907, bottom: 1020, left: 1134, right: 1134 },
          },
        },
        headers: header ? { default: header } : undefined,
        footers: { default: footer },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(docx);
  fileSaver.saveAs(blob, safeFilename(input.title, 'docx'));
}
