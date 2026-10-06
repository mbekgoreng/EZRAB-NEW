/**
 * Multi-Signal Page Role Classifier (Phase 6.1)
 *
 * Classifies construction drawing pages into 20 strict taxonomical page roles
 * by analyzing filenames, drawing numbers, title block text, visible OCR tokens, and surrounding context.
 */

import { PageRoleType, PageClassificationResult } from '../../src/domain/document/documentSetTypes';
import { DocumentDiscipline } from '../../src/domain/document/types';

export interface PageClassificationInput {
  pageNumber: number;
  totalPages: number;
  fileName: string;
  pageTitle?: string;
  drawingNumber?: string;
  extractedText: string;
  neighboringRoles?: PageRoleType[];
}

export class PageRoleClassifier {
  private static instance: PageRoleClassifier;

  private constructor() {}

  public static getInstance(): PageRoleClassifier {
    if (!PageRoleClassifier.instance) {
      PageRoleClassifier.instance = new PageRoleClassifier();
    }
    return PageRoleClassifier.instance;
  }

  /**
   * Classify page role with multi-signal evidence weighting
   */
  public classifyPage(input: PageClassificationInput): PageClassificationResult {
    const text = (input.extractedText || '').toLowerCase();
    const title = (input.pageTitle || '').toLowerCase();
    const fileName = (input.fileName || '').toLowerCase();
    const drawingNo = (input.drawingNumber || '').toUpperCase();
    const pageNum = input.pageNumber;

    const evidence: string[] = [];

    // Signal 1: Cover Page
    if (
      pageNum === 1 &&
      (title.includes('cover') || title.includes('sampul') || title.includes('judul') ||
       text.includes('gambar kerja') || text.includes('detail engineering design') ||
       fileName.includes('cover') || fileName.includes('sampul'))
    ) {
      evidence.push(`Halaman pertama (#1) dengan indikator sampul/judul proyek.`);
      return {
        pageRole: 'COVER',
        confidence: 0.96,
        reason: 'Halaman pertama berfungsi sebagai sampul (Cover) dokumen DED.',
        evidence
      };
    }

    // Signal 2: Index / Daftar Gambar / Table of Contents
    if (
      title.includes('daftar isi') || title.includes('daftar gambar') || title.includes('index') ||
      title.includes('table of content') || text.includes('daftar isi') || text.includes('daftar gambar') ||
      drawingNo.startsWith('00') || drawingNo.includes('IDX')
    ) {
      evidence.push(`Header 'Daftar Gambar' atau drawing number berawalan indeks.`);
      return {
        pageRole: 'INDEX',
        confidence: 0.95,
        reason: 'Halaman berisi lembar indeks / daftar isi gambar proyek.',
        evidence
      };
    }

    // Signal 3: Site Plan / Situasi / Tata Letak
    if (
      title.includes('site plan') || title.includes('situasi') || title.includes('layout plan') ||
      title.includes('tata letak') || text.includes('site plan') || text.includes('rencana tapak') ||
      drawingNo.includes('SP-') || drawingNo.includes('ST-')
    ) {
      evidence.push(`Teridentifikasi teks/drawing number tapak/site plan: '${input.drawingNumber || input.pageTitle}'.`);
      return {
        pageRole: 'SITE_PLAN',
        confidence: 0.94,
        reason: 'Halaman denah tapak dan situasi lingkungan (Site Plan).',
        evidence
      };
    }

    // Signal 4: Roof Plan / Rencana Atap
    if (
      title.includes('rencana atap') || title.includes('roof plan') || title.includes('denah atap') ||
      text.includes('rencana atap') || text.includes('penutup atap') || text.includes('kemiringan atap')
    ) {
      evidence.push(`Kata kunci spesifik atap ('rencana atap' / 'roof plan') ditemukan.`);
      return {
        pageRole: 'ROOF_PLAN',
        confidence: 0.93,
        reason: 'Halaman denah penataan atap dan talang air (Roof Plan).',
        evidence
      };
    }

    // Signal 5A: Window Schedule (Strictly for window-only schedules)
    if (
      !title.includes('pintu') && !title.includes('door') &&
      (title.includes('jendela') || title.includes('window') || text.includes('jadwal jendela') || text.includes('tipe jendela'))
    ) {
      evidence.push(`Tabel spesifikasi kusen & kaca jendela.`);
      return {
        pageRole: 'WINDOW_SCHEDULE',
        confidence: 0.92,
        reason: 'Tabel jadwal dan dimensi jendela (Window Schedule).',
        evidence
      };
    }

    // Signal 5B: Door Schedule / Door & Window Schedule
    if (
      title.includes('pintu') || title.includes('door') ||
      text.includes('jadwal pintu') || text.includes('tabel kusen') || text.includes('tipe pintu')
    ) {
      evidence.push(`Tabel dimensi & tipe bukaan pintu dan jendela.`);
      return {
        pageRole: 'DOOR_SCHEDULE',
        confidence: 0.92,
        reason: 'Tabel jadwal kusen pintu/jendela (Door/Window Schedule).',
        evidence
      };
    }

    // Signal 6: Floor Plan / Denah Lantai
    if (
      title.includes('denah') || title.includes('floor plan') || title.includes('layout') ||
      text.includes('denah lantai') || text.includes('denah ruang') || text.includes('layout plan') ||
      (drawingNo.startsWith('A-1') || drawingNo.startsWith('AR-1') || drawingNo.startsWith('ARS-1'))
    ) {
      evidence.push(`Judul denah arsitektur ('${input.pageTitle || input.drawingNumber}').`);
      return {
        pageRole: 'FLOOR_PLAN',
        confidence: 0.94,
        reason: 'Denah arsitektur tata ruang lantai bangunan.',
        evidence
      };
    }

    // Signal 7: Elevation / Tampak
    if (
      title.includes('tampak') || title.includes('elevation') ||
      text.includes('tampak depan') || text.includes('tampak samping') || text.includes('tampak belakang') ||
      (drawingNo.startsWith('A-2') || drawingNo.startsWith('AR-2') || drawingNo.startsWith('ARS-2'))
    ) {
      evidence.push(`Indikator elevasi/tampak arsitektur.`);
      return {
        pageRole: 'ELEVATION',
        confidence: 0.93,
        reason: 'Gambar tampak luar bangunan (Elevation).',
        evidence
      };
    }

    // Signal 8: Section / Potongan
    if (
      title.includes('potongan') || title.includes('section') ||
      text.includes('potongan a-a') || text.includes('potongan b-b') || text.includes('potongan melintang') ||
      (drawingNo.startsWith('A-3') || drawingNo.startsWith('AR-3') || drawingNo.startsWith('ARS-3'))
    ) {
      evidence.push(`Indikator potongan melintang / membujur (Section).`);
      return {
        pageRole: 'SECTION',
        confidence: 0.93,
        reason: 'Gambar potongan arsitektur/struktur bangunan.',
        evidence
      };
    }

    // Signal 9: Structural Plan (Denah Pondasi / Kolom / Balok / Plat)
    if (
      title.includes('rencana pondasi') || title.includes('rencana kolom') || title.includes('rencana balok') ||
      title.includes('rencana plat') || title.includes('denah struktur') || title.includes('structural plan') ||
      (drawingNo.startsWith('S-1') || drawingNo.startsWith('STR-1') || drawingNo.startsWith('ST-1')) ||
      (text.includes('rencana pondasi') || text.includes('rencana balok lantai'))
    ) {
      evidence.push(`Denah elemen struktur utama (Pondasi/Balok/Kolom/Plat).`);
      return {
        pageRole: 'STRUCTURAL_PLAN',
        confidence: 0.95,
        reason: 'Denah rencana penempatan elemen struktur.',
        evidence
      };
    }

    // Signal 10: Structural Detail (Pembesian, Detail Pondasi, Detail Kolom K1, Balok B1)
    if (
      title.includes('detail struktur') || title.includes('detail pondasi') || title.includes('detail penulangan') ||
      title.includes('detail kolom') || title.includes('detail balok') || title.includes('structural detail') ||
      (drawingNo.startsWith('S-2') || drawingNo.startsWith('S-3') || drawingNo.startsWith('STR-2')) ||
      text.includes('pembesian') || text.includes('diameter tulangan') || text.includes('sengkang')
    ) {
      evidence.push(`Detail pembesian dan penampang struktur beton/baja.`);
      return {
        pageRole: 'STRUCTURAL_DETAIL',
        confidence: 0.95,
        reason: 'Gambar detail penulangan & fabrikasi struktur.',
        evidence
      };
    }

    // Signal 11: MEP Plan (Plumbing, Elektrikal, Tata Udara)
    if (
      title.includes('instalasi air') || title.includes('instalasi listrik') || title.includes('denah titik lampu') ||
      title.includes('denah sanitasi') || title.includes('mep plan') || title.includes('plumbing') ||
      (drawingNo.startsWith('ME-1') || drawingNo.startsWith('MEP-1') || drawingNo.startsWith('E-1') || drawingNo.startsWith('P-1')) ||
      text.includes('jalur pipa air bersih') || text.includes('single line diagram')
    ) {
      evidence.push(`Denah jalur mekanikal, elektrikal, atau sanitasi plumbing.`);
      return {
        pageRole: 'MEP_PLAN',
        confidence: 0.93,
        reason: 'Denah rencana instalasi MEP (Mekanikal, Elektrikal, Plumbing).',
        evidence
      };
    }

    // Signal 12: MEP Detail (Detail Septic Tank, Detail Panel Listrik, Skematik)
    if (
      title.includes('detail mep') || title.includes('detail septic tank') || title.includes('skema panel') ||
      title.includes('diagram satu garis') || title.includes('riser diagram') ||
      (drawingNo.startsWith('ME-2') || drawingNo.startsWith('MEP-2') || drawingNo.startsWith('E-2')) ||
      text.includes('riser diagram') || text.includes('sumur resapan')
    ) {
      evidence.push(`Gambar skematik atau detail sistem MEP.`);
      return {
        pageRole: 'MEP_DETAIL',
        confidence: 0.93,
        reason: 'Gambar detail teknis & diagram riser MEP.',
        evidence
      };
    }

    // Signal 13: Material Schedule
    if (
      title.includes('finishing schedule') || title.includes('tabel material') || title.includes('daftar bahan') ||
      text.includes('skedul material') || text.includes('daftar finishing')
    ) {
      evidence.push(`Tabel skedul material dan finishing interior/eksterior.`);
      return {
        pageRole: 'MATERIAL_SCHEDULE',
        confidence: 0.91,
        reason: 'Tabel spesifikasi material dan finishing bangunan.',
        evidence
      };
    }

    // Signal 14: Specification / RKS
    if (
      title.includes('spesifikasi') || title.includes('rks') || title.includes('syarat teknis') ||
      text.includes('rencana kerja dan syarat') || text.includes('spesifikasi teknis')
    ) {
      evidence.push(`Teks spesifikasi teknis dan standar pelaksanaan (RKS).`);
      return {
        pageRole: 'SPECIFICATION',
        confidence: 0.92,
        reason: 'Dokumen lembar spesifikasi teknis (RKS).',
        evidence
      };
    }

    // Signal 15: General Architectural Detail
    if (
      title.includes('detail') || text.includes('detail arsitektur') || text.includes('detail tangga') ||
      text.includes('detail toilet') || (drawingNo.startsWith('A-4') || drawingNo.startsWith('A-5'))
    ) {
      evidence.push(`Gambar detail arsitektur spesifik.`);
      return {
        pageRole: 'DETAIL',
        confidence: 0.90,
        reason: 'Gambar pembesaran detail arsitektural.',
        evidence
      };
    }

    // Signal 16: Calculation Sheet
    if (
      title.includes('perhitungan') || title.includes('calculation') || title.includes('kalkulasi') ||
      text.includes('analisis struktur sap2000') || text.includes('beban gempa')
    ) {
      evidence.push(`Lembar laporan kalkulasi teknis.`);
      return {
        pageRole: 'CALCULATION',
        confidence: 0.91,
        reason: 'Lembar kalkulasi teknis & analisis beban.',
        evidence
      };
    }

    // Default Unknown
    evidence.push(`Tidak ditemukan pola kuat pada judul atau teks halaman.`);
    return {
      pageRole: 'UNKNOWN',
      confidence: 0.50,
      reason: 'Pola gambar belum terklasifikasi secara pasti.',
      evidence
    };
  }
}

export const pageRoleClassifier = PageRoleClassifier.getInstance();
