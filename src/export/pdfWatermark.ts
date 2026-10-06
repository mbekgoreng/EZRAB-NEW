import jsPDF from 'jspdf';

export interface WatermarkOptions {
  enabled: boolean;
  emblemDataUrl?: string | null;
  text?: string;
  subtext?: string;
  opacity?: number; // default 0.08
}

/**
 * Draws official EZRAB watermark directly into the PDF rendering context.
 * Embedded permanently into the PDF drawing layer, visible when printed or viewed in Acrobat.
 */
export function renderPdfWatermark(
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  options: WatermarkOptions
): void {
  if (!options.enabled) return;

  const opacity = options.opacity ?? 0.075;
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  // Save current graphics state
  try {
    doc.saveGraphicsState();
  } catch {
    // If not supported by older doc runner, continue safely
  }

  // 1. If official raster emblem is provided, render with low opacity
  let imageDrawn = false;
  if (options.emblemDataUrl) {
    try {
      if ((doc as any).GState) {
        doc.setGState(new (doc as any).GState({ opacity }));
      }

      // Aspect-ratio preserved emblem in center of page (approx 75mm x 75mm)
      const emblemSize = Math.min(pageWidth, pageHeight) * 0.38;
      const x = centerX - emblemSize / 2;
      const y = centerY - emblemSize / 2 - 8;

      doc.addImage(options.emblemDataUrl, 'PNG', x, y, emblemSize, emblemSize);
      imageDrawn = true;
    } catch (e) {
      console.warn('[pdfWatermark] Could not draw emblem image, falling back to vector watermark:', e);
    }
  }

  // 2. Vector & Typography Watermark (Draws diagonal watermark branding)
  try {
    if ((doc as any).GState) {
      doc.setGState(new (doc as any).GState({ opacity: imageDrawn ? 0.08 : 0.1 }));
    }

    // Watermark main text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(38);
    doc.setTextColor(30, 58, 138); // Deep Blueprint Navy

    // Draw rotated text across diagonal
    doc.text('EZRAB AI', centerX, centerY + 18, {
      align: 'center',
      angle: -32,
    });

    // Subtitle badge
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const subText = options.text || 'FREE / TRIAL VERSION — UNVERIFIED LICENSE';
    doc.text(subText, centerX, centerY + 28, {
      align: 'center',
      angle: -32,
    });

    // Secondary reminder line
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text('Dokumen dibuat menggunakan EZRAB AI Free Tier • ezrab.co.id', centerX, centerY + 36, {
      align: 'center',
      angle: -32,
    });
  } catch (e) {
    console.warn('[pdfWatermark] Error rendering vector text watermark:', e);
  }

  // Restore graphics state
  try {
    doc.restoreGraphicsState();
  } catch {
    // Continue
  }
}
