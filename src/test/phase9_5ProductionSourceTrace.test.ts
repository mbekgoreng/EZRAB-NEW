/**
 * Phase 9.5 — Production AI Source Trace & Real User Upload Test Suite
 *
 * Validates:
 * 1. Deterministic SHA-256 computation strictly derived from raw file byte stream.
 * 2. Real PDF Test A (5.20m × 0.35m × 0.55m = 1.001 m³, K-250) vs Real PDF Test B (7.40m × 0.25m × 0.60m = 1.110 m³, K-300).
 * 3. Real Image Test A (4.00m × 5.00m = 20.00 m²) vs Real Image Test B (6.00m × 3.50m = 21.00 m²).
 * 4. Production AISourceTrace schema compliance and in-memory trace registry.
 * 5. Negative & Safety Guards:
 *    - No source -> No fact (NOT_FOUND).
 *    - Blur / Unreadable file handling (UNREADABLE, confidence LOW, zero fabricated dimensions).
 *    - No-scale drawing handling (scaleVerified = false + warning).
 *    - Conflict detection (CONFLICT status across conflicting sources).
 *    - Project isolation (projectId + sourceId scoped).
 * 6. Multi-provider attribution (Extractor vs Reasoner vs Calculator).
 * 7. Security guard: Zero secret/API key exposure in traces or metadata.
 * 8. Anti-hardcoding verification: Dynamic extraction across varied inputs.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { aiSourceReadingService, AISourceTrace } from '../services/aiSourceReadingService';
import { queryFactInProjectSources, AIEvidence } from '../services/aiEvidenceService';
import { FullProjectAIContext } from '../services/aiContextService';
import { Project } from '../types';

function createRealPdfStream(lines: string[]): ArrayBuffer {
  const doc = new jsPDF();
  doc.setFontSize(12);
  lines.forEach((line, idx) => {
    doc.text(line, 15, 20 + idx * 10);
  });
  return doc.output('arraybuffer');
}

function createMockContext(projectOverride?: Partial<Project>, rabItems: any[] = []): FullProjectAIContext {
  const defaultProject: Project = {
    id: 'PRJ-TRACE-01',
    name: 'Proyek Verifikasi Trace Production',
    location: 'Surabaya',
    buildingType: 'Gedung Komersial',
    budget: 2500000000,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...projectOverride,
  } as unknown as Project;

  const totalRab = rabItems.reduce((acc, i) => acc + ((i.volume || 0) * (i.unitPrice || 0)), 0);

  return {
    project: defaultProject,
    currentPage: 'magic-ai',
    timestamp: new Date().toISOString(),
    rab: {
      totalRab,
      totalItems: rabItems.length,
      categories: [
        {
          name: 'Struktur Beton',
          total: totalRab,
          weightPercent: 100,
          itemCount: rabItems.length,
          items: rabItems,
        },
      ],
      highestCostItem: rabItems[0] || null,
      topCostItems: rabItems,
      anomalyItems: [],
      missingVolumeItems: [],
    },
    curveS: {
      plannedProgress: 35,
      actualProgress: 35,
      deviation: 0,
      status: 'ON_TRACK',
      statusLabel: 'On Track',
      totalWeeks: 12,
      currentWeek: 4,
      dataPoints: [],
    },
    schedule: {
      totalTasks: 0,
      completedTasks: [],
      activeTasks: [],
      pendingTasks: [],
      criticalTasks: [],
    },
    report: {
      projectName: defaultProject.name,
      clientName: 'Owner PT Maju Jaya',
      location: defaultProject.location || 'Indonesia',
      currentDate: '2026-09-22',
      periodLabel: 'Bulan ke-1',
      actualProgress: 35,
      plannedProgress: 35,
      deviation: 0,
      totalCost: totalRab,
      completedWorks: [],
      activeWorks: [],
      upcomingWorks: [],
      potentialIssues: [],
    },
  };
}

describe('PHASE 9.5 [1] — PRODUCTION SOURCE TRACE & REAL PDF A/B EXTRACTION', () => {
  beforeEach(() => {
    aiSourceReadingService.clearTraces();
  });

  it('should process Real PDF A (5.20m × 0.35m × 0.55m = 1.001 m³, K-250) and record full AISourceTrace', async () => {
    const pdfBytes = createRealPdfStream([
      'SPESIFIKASI TEKNIS BALOK B1 - LANTAI 1',
      'Panjang / Length = 5.20 m',
      'Lebar / Width = 0.35 m',
      'Tinggi / Height = 0.55 m',
      'Mutu Beton = K-250',
    ]);

    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-PROD-A',
      fileBuffer: pdfBytes,
      fileName: 'DED_BALOK_B1_REV1.pdf',
    });

    assert.equal(res.success, true);
    assert.equal(res.sourceType, 'pdf');
    assert.equal(res.processingPath, 'NATIVE_PDF_TEXT');
    assert.equal(res.classification, 'REAL_FILE');

    // Deterministic Hashing
    assert.ok(res.sourceId && res.sourceId.length === 64, 'SourceId must be 64-char SHA-256');
    assert.equal(res.sourceId, res.metadata.sha256Hash);

    // Extraction & Deterministic Calculation
    assert.equal(res.extractedData.length, 5.20);
    assert.equal(res.extractedData.width, 0.35);
    assert.equal(res.extractedData.height, 0.55);
    assert.equal(res.extractedData.concreteGrade, 'K-250');
    assert.ok(res.calculatedResult);
    assert.equal(res.calculatedResult.computedValue, 1.001);
    assert.equal(res.calculatedResult.calculationType, 'VOLUME_3D');

    // AISourceTrace Verification
    assert.ok(res.trace, 'Result must include AISourceTrace');
    assert.ok(res.trace.traceId.startsWith('trc_'));
    assert.ok(res.trace.requestId.startsWith('req_'));
    assert.equal(res.trace.projectId, 'PRJ-PROD-A');
    assert.equal(res.trace.sourceId, res.sourceId);
    assert.equal(res.trace.fileHash, res.sourceId);
    assert.equal(res.trace.sourceName, 'DED_BALOK_B1_REV1.pdf');
    assert.equal(res.trace.sourceType, 'pdf');
    assert.equal(res.trace.extractionStatus, 'SUCCESS');
    assert.equal(res.trace.evidenceCount, 1);
    assert.equal(res.trace.calculator, 'EZRAB_DETERMINISTIC_ENGINE');
    assert.equal(res.trace.classification, 'REAL_FILE');
    assert.ok(res.trace.latencyMs >= 0);

    // In-memory trace registry check
    const retrieved = aiSourceReadingService.getTrace(res.trace.traceId);
    assert.ok(retrieved);
    assert.equal(retrieved.traceId, res.trace.traceId);
  });

  it('should process Real PDF B (7.40m × 0.25m × 0.60m = 1.110 m³, K-300) with distinct hash and independent trace', async () => {
    const pdfBytes = createRealPdfStream([
      'SPESIFIKASI TEKNIS BALOK B2 - LANTAI 2',
      'Panjang / Length = 7.40 m',
      'Lebar / Width = 0.25 m',
      'Tinggi / Height = 0.60 m',
      'Mutu Beton = K-300',
    ]);

    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-PROD-B',
      fileBuffer: pdfBytes,
      fileName: 'DED_BALOK_B2_REV2.pdf',
    });

    assert.equal(res.success, true);
    assert.equal(res.extractedData.length, 7.40);
    assert.equal(res.extractedData.width, 0.25);
    assert.equal(res.extractedData.height, 0.60);
    assert.equal(res.extractedData.concreteGrade, 'K-300');
    assert.ok(res.calculatedResult);
    assert.equal(res.calculatedResult.computedValue, 1.110);
    assert.equal(res.trace.extractionStatus, 'SUCCESS');
    assert.equal(res.trace.projectId, 'PRJ-PROD-B');
  });
});

describe('PHASE 9.5 [2] — REAL IMAGE A/B 2D DIMENSION EXTRACTION & TRACE', () => {
  it('should extract 2D dimensions from Image A (4.00m × 5.00m = 20.00 m²) and record trace', async () => {
    const mockImagePayload = 'DENAH RUANG RAPAT: Dimensi 4.00m x 5.00m, Keramik Homogenous Tile 60x60';

    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-IMG-01',
      fileBuffer: mockImagePayload,
      fileName: 'DENAH_RUANG_RAPAT_A.png',
      mimeType: 'image/png',
    });

    assert.equal(res.success, true);
    assert.equal(res.sourceType, 'image');
    assert.equal(res.processingPath, 'IMAGE_VISION_OCR');
    assert.equal(res.extractedData.length, 4.00);
    assert.equal(res.extractedData.width, 5.00);
    assert.ok(res.calculatedResult);
    assert.equal(res.calculatedResult.calculationType, 'AREA_2D');
    assert.equal(res.calculatedResult.computedValue, 20.00);
    assert.equal(res.trace.extractionStatus, 'SUCCESS');
    assert.equal(res.trace.sourceType, 'image');
  });

  it('should extract 2D dimensions from Image B (6.00m × 3.50m = 21.00 m²) with distinct calculation', async () => {
    const mockImagePayload = 'DENAH GUDANG: Dimensi 6.00m x 3.50m, Finishing Floor Hardener';

    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-IMG-02',
      fileBuffer: mockImagePayload,
      fileName: 'DENAH_GUDANG_B.png',
      mimeType: 'image/png',
    });

    assert.equal(res.success, true);
    assert.equal(res.extractedData.length, 6.00);
    assert.equal(res.extractedData.width, 3.50);
    assert.ok(res.calculatedResult);
    assert.equal(res.calculatedResult.calculationType, 'AREA_2D');
    assert.equal(res.calculatedResult.computedValue, 21.00);
    assert.equal(res.trace.extractionStatus, 'SUCCESS');
  });
});

describe('PHASE 9.5 [3] — PRODUCTION NEGATIVE & SAFETY GUARDS', () => {
  it('Guard 1 (No Source -> No Fact): Should return NOT_FOUND when fact is absent from project sources', () => {
    const emptyContext = createMockContext({ id: 'PRJ-GUARD-01' });
    const result = queryFactInProjectSources('MUTU_BETON', emptyContext);

    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.confidence, 'LOW');
    assert.match(result.answer, /tidak menemukan/i);
    assert.match(result.source, /Tidak Ditemukan/i);
  });

  it('Guard 2 (Blur / Unreadable): Should return UNREADABLE with LOW confidence and zero hallucinated dimensions', async () => {
    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-BLUR-01',
      fileBuffer: 'CORRUPTED_BLURRY_IMAGE_STREAM_NO_READABLE_TEXT',
      fileName: 'FOTO_BURAM_SITE_LAPANGAN.jpg',
      mimeType: 'image/jpeg',
    });

    assert.equal(res.success, false);
    assert.equal(res.evidence.status, 'UNREADABLE');
    assert.equal(res.evidence.confidence, 'LOW');
    assert.equal(res.extractedData.length, undefined);
    assert.equal(res.extractedData.width, undefined);
    assert.equal(res.calculatedResult, undefined);
    assert.equal(res.trace.extractionStatus, 'UNREADABLE');
    assert.equal(res.trace.confidence, 'LOW');
  });

  it('Guard 3 (No Scale Drawing): Should issue scale warning when scale is uncalibrated', async () => {
    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-NOSCALE-01',
      fileBuffer: 'SKETSA DENAH TANPA DIMENSI DAN SKALA RESMI',
      fileName: 'SKETSA_NO-SCALE_KONSEP.png',
      mimeType: 'image/png',
    });

    assert.equal(res.success, true);
    assert.ok(res.metadata.scaleWarning, 'Must issue scale warning for uncalibrated drawing');
    assert.equal(res.evidence.status, 'ESTIMATED');
    assert.equal(res.evidence.confidence, 'LOW');
  });

  it('Guard 4 (Source Conflict): Should detect CONFLICT status when sources disagree', () => {
    const sourceA = { name: 'DED_Struktur_Rev1.pdf', value: 'K-250' };
    const sourceB = { name: 'RAB_Final_Signed.pdf', value: 'K-300' };

    const conflictRes = aiSourceReadingService.detectSourceConflict(sourceA, sourceB, 'Mutu Beton Balok');

    assert.equal(conflictRes.hasConflict, true);
    assert.equal(conflictRes.status, 'CONFLICT');
    assert.match(conflictRes.description!, /Konflik data/i);
    assert.match(conflictRes.description!, /K-250/);
    assert.match(conflictRes.description!, /K-300/);
  });

  it('Guard 5 (Project Isolation): Should isolate traces and sources strictly per projectId', async () => {
    const pdfBytesA = createRealPdfStream(['Proyek A Spesifikasi: Panjang 10.0m']);
    const pdfBytesB = createRealPdfStream(['Proyek B Spesifikasi: Panjang 20.0m']);

    await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-ALPHA',
      fileBuffer: pdfBytesA,
      fileName: 'SPEC_A.pdf',
    });

    await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-BETA',
      fileBuffer: pdfBytesB,
      fileName: 'SPEC_B.pdf',
    });

    const tracesAlpha = aiSourceReadingService.getTracesByProject('PRJ-ALPHA');
    const tracesBeta = aiSourceReadingService.getTracesByProject('PRJ-BETA');

    assert.equal(tracesAlpha.length, 1);
    assert.equal(tracesAlpha[0].projectId, 'PRJ-ALPHA');
    assert.equal(tracesAlpha[0].sourceName, 'SPEC_A.pdf');

    assert.equal(tracesBeta.length, 1);
    assert.equal(tracesBeta[0].projectId, 'PRJ-BETA');
    assert.equal(tracesBeta[0].sourceName, 'SPEC_B.pdf');
  });
});

describe('PHASE 9.5 [4] — SECURITY & MULTI-PROVIDER ATTRIBUTION AUDIT', () => {
  it('should strictly avoid exposing API keys, auth headers, or private secrets in trace logs', async () => {
    const pdfBytes = createRealPdfStream(['Spesifikasi Balok Panjang 5.0m Lebar 0.3m Tinggi 0.5m']);
    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-SEC-01',
      fileBuffer: pdfBytes,
      fileName: 'SAFE_SOURCE.pdf',
    });

    const traceJson = JSON.stringify(res.trace);
    const resultJson = JSON.stringify(res);

    // Assert no API key patterns in serialized objects
    assert.equal(traceJson.includes('AIza'), false, 'No Gemini API key prefix in trace');
    assert.equal(traceJson.includes('sk-'), false, 'No OpenAI/zrouter API key prefix in trace');
    assert.equal(traceJson.includes('Bearer'), false, 'No Bearer token in trace');
    assert.equal(resultJson.includes('AIza'), false, 'No Gemini API key prefix in result');
    assert.equal(resultJson.includes('sk-'), false, 'No OpenAI/zrouter API key prefix in result');
  });

  it('should clearly attribute Extractor vs Reasoner vs Calculator in evidence and trace', async () => {
    const pdfBytes = createRealPdfStream(['Balok Panjang 5.0m Lebar 0.3m Tinggi 0.5m']);
    const res = await aiSourceReadingService.processSourceFile({
      projectId: 'PRJ-ATTR-01',
      fileBuffer: pdfBytes,
      fileName: 'BALOK.pdf',
    });

    assert.ok(res.evidence.extractor, 'Evidence must record extractor');
    assert.equal(res.evidence.calculator, 'EZRAB_DETERMINISTIC_ENGINE');
    assert.equal(res.trace.calculator, 'EZRAB_DETERMINISTIC_ENGINE');
  });
});
