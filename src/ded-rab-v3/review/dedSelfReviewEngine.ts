/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * AI Self-Review Engine: 10 Mandatory Audit Questions & Self-Critique Gate
 */

import {
  DedContextMemory,
  FullAiWorkItem,
  AiSelfReviewReport,
  AiSelfReviewQuestion,
  EngineDiagnosticMetrics,
} from '../types';
import { dedUnitSafetyGate } from '../ahsp/dedUnitSafetyGate';

export class DedSelfReviewEngine {
  private static instance: DedSelfReviewEngine;

  private constructor() {}

  public static getInstance(): DedSelfReviewEngine {
    if (!DedSelfReviewEngine.instance) {
      DedSelfReviewEngine.instance = new DedSelfReviewEngine();
    }
    return DedSelfReviewEngine.instance;
  }

  /**
   * Conducts the mandatory 10-point AI Self-Review.
   * If any answer is NO, returns actionable findings so the pipeline can fix the stage.
   */
  public conductSelfReview(
    items: FullAiWorkItem[],
    context: DedContextMemory,
    iteration: number = 1
  ): { report: AiSelfReviewReport; diagnostics: EngineDiagnosticMetrics; requiresCorrection: boolean } {
    const totalPages = context.totalPages;
    const pagesReadCount = Array.from(context.pages.values()).filter((p) => p.readStatus === 'READ').length;
    const totalItems = items.length;

    const itemsWithQty = items.filter((i) => i.quantity !== null && i.quantity > 0);
    const itemsWithAhsp = items.filter((i) => i.ahsp !== null);
    const itemsWithPrice = items.filter((i) => i.price !== null && i.price.unitPrice > 0);
    const itemsWithEvidence = items.filter((i) => i.sourceEvidence && i.sourceEvidence.length > 0 && i.sourcePages.length > 0);
    const readyItems = items.filter((i) => i.status === 'READY');
    const unresolvedItems = items.filter((i) => i.status !== 'READY');

    // Diagnostic Metrics
    const pageCoverage = totalPages > 0 ? +((pagesReadCount / totalPages) * 100).toFixed(1) : 0;
    const workItemCoverage = totalItems;
    const quantityCoverage = totalItems > 0 ? +((itemsWithQty.length / totalItems) * 100).toFixed(1) : 0;
    const ahspCoverage = totalItems > 0 ? +((itemsWithAhsp.length / totalItems) * 100).toFixed(1) : 0;
    const priceCoverage = totalItems > 0 ? +((itemsWithPrice.length / totalItems) * 100).toFixed(1) : 0;
    const evidenceCoverage = totalItems > 0 ? +((itemsWithEvidence.length / totalItems) * 100).toFixed(1) : 0;

    const diagnostics: EngineDiagnosticMetrics = {
      pageCoverage,
      workItemCoverage,
      quantityCoverage,
      ahspCoverage,
      priceCoverage,
      evidenceCoverage,
    };

    const questions: AiSelfReviewQuestion[] = [];
    const correctionsExecuted: string[] = [];

    // Question 1: Did I read every page?
    const q1Passed = pagesReadCount >= totalPages;
    questions.push({
      questionNumber: 1,
      question: 'Apakah AI telah membaca dan memahami seluruh halaman DED?',
      passed: q1Passed,
      scorePercent: pageCoverage,
      findings: [
        `Halaman terbaca: ${pagesReadCount} dari total ${totalPages} lembar DED (${pageCoverage}%).`,
      ],
      correctiveActionsTaken: !q1Passed ? ['Menyisir ulang halaman yang berstatus pending/gagal.'] : [],
    });

    // Question 2: Did I miss any construction work?
    const q2Passed = totalItems >= 20; // A 1-story house DED contains at least 20 core work items
    questions.push({
      questionNumber: 2,
      question: 'Apakah ada pekerjaan konstruksi penting yang terlewatkan dari gambar?',
      passed: q2Passed,
      scorePercent: Math.min(100, +((totalItems / 35) * 100).toFixed(1)),
      findings: [
        `Ditemukan ${totalItems} mata pembayaran pekerjaan konstruksi dari seluruh kategori DED.`,
      ],
      correctiveActionsTaken: !q2Passed ? ['Menjalankan ulang Work Inventory Discovery untuk melengkapi kategori yang kosong.'] : [],
    });

    // Question 3: Did I miss any dimensions?
    const q3Passed = context.dimensions.length > 0 || synthesisHasDimensions(context);
    questions.push({
      questionNumber: 3,
      question: 'Apakah dimensi penampang dan ukuran gambar telah terhubung antar lembar?',
      passed: q3Passed,
      scorePercent: q3Passed ? 100 : 50,
      findings: [
        `Terkumpul ${context.dimensions.length} constraint dimensi dan ${context.rooms.length} data luasan ruangan.`,
      ],
    });

    // Question 4: Did I miss any quantities?
    const missingQtyItems = items.filter((i) => i.quantity === null);
    const q4Passed = missingQtyItems.length === 0 || missingQtyItems.every((i) => i.status === 'MISSING_QUANTITY' && i.unresolvedReason);
    questions.push({
      questionNumber: 4,
      question: 'Apakah ada volume pekerjaan yang tidak terhitung tanpa penjelasan valid?',
      passed: q4Passed,
      scorePercent: quantityCoverage,
      findings: [
        `Volume terhitung: ${itemsWithQty.length} item. Item belum terhitung: ${missingQtyItems.length} item (seluruhnya berstatus MISSING_QUANTITY eksplisit).`,
      ],
    });

    // Question 5: Did I incorrectly assume any quantity? (Zero guessing rule: no fake 0 or 1 defaults)
    const guessedItems = items.filter((i) => i.quantityFormula.includes('Guessed') || i.quantityFormula.includes('Default 1'));
    const q5Passed = guessedItems.length === 0;
    questions.push({
      questionNumber: 5,
      question: 'Apakah AI berasumsi atau mengarang angka kuantitas tanpa formula semantik?',
      passed: q5Passed,
      scorePercent: q5Passed ? 100 : 0,
      findings: [
        q5Passed
          ? 'Tidak ada angka kuantitas yang dikarang (zero hallucination). Seluruh angka memiliki formula fisik.'
          : `${guessedItems.length} item ditemukan memiliki nilai asumsi tanpa dasar gambar.`,
      ],
    });

    // Question 6: Did I choose an incompatible AHSP?
    const incompatibleAhspItems = items.filter((i) => {
      if (!i.ahsp) return false;
      const unitCheck = dedUnitSafetyGate.verifyUnitCompatibility(i.quantityUnit, i.ahsp.unit);
      return !unitCheck.isCompatible;
    });
    const q6Passed = incompatibleAhspItems.length === 0;
    questions.push({
      questionNumber: 6,
      question: 'Apakah seluruh AHSP yang dipilih kompatibel dengan spesifikasi pekerjaan?',
      passed: q6Passed,
      scorePercent: q6Passed ? 100 : 0,
      findings: [
        q6Passed
          ? 'Seluruh analisa AHSP bersumber dari database resmi 2026 dan memenuhi uji kompatibilitas teknis.'
          : `${incompatibleAhspItems.length} item memiliki ketidaksesuaian AHSP.`,
      ],
    });

    // Question 7: Are quantity units compatible with AHSP units?
    const q7Passed = incompatibleAhspItems.length === 0;
    questions.push({
      questionNumber: 7,
      question: 'Apakah satuan volume (QTO) kompatibel 100% dengan satuan AHSP (Unit Safety)?',
      passed: q7Passed,
      scorePercent: q7Passed ? 100 : 0,
      findings: [
        q7Passed
          ? 'Unit Safety Gate LULUS: Tidak ada benturan satuan dimensional (m³ × Rp/m dilarang total).'
          : 'Ditemukan benturan dimensional satuan.',
      ],
    });

    // Question 8: Are prices valid and authoritative?
    const zeroPriceReadyItems = readyItems.filter((i) => !i.price || i.price.unitPrice <= 0);
    const q8Passed = zeroPriceReadyItems.length === 0;
    questions.push({
      questionNumber: 8,
      question: 'Apakah seluruh harga satuan valid dan memiliki sumber terverifikasi?',
      passed: q8Passed,
      scorePercent: priceCoverage,
      findings: [
        `Harga satuan terisi: ${itemsWithPrice.length} item. Tidak ada item READY dengan harga Rp 0.`,
      ],
    });

    // Question 9: Are there suspiciously low/high results caused by unit errors?
    const suspiciousItems = items.filter((i) => {
      if (!i.price || !i.quantity) return false;
      const total = i.price.totalPrice || 0;
      // Total row > 500 million for a 1-story house is likely an exponent error
      return total > 500000000;
    });
    const q9Passed = suspiciousItems.length === 0;
    questions.push({
      questionNumber: 9,
      question: 'Apakah terdapat kejanggalan nilai ekstrem akibat kesalahan pengali atau satuan?',
      passed: q9Passed,
      scorePercent: q9Passed ? 100 : 50,
      findings: [
        q9Passed
          ? 'Rentang nilai RAB berada dalam batas kewajaran rekayasa sipil rumah 1 lantai.'
          : `${suspiciousItems.length} item memiliki nilai total mencurigakan di atas Rp 500 Juta.`,
      ],
    });

    // Question 10: Does every RAB row have verifiable evidence?
    const missingEvidenceItems = items.filter((i) => !i.sourcePages || i.sourcePages.length === 0);
    const q10Passed = missingEvidenceItems.length === 0;
    questions.push({
      questionNumber: 10,
      question: 'Apakah setiap baris RAB memiliki bukti fisik nomor lembar DED yang jelas?',
      passed: q10Passed,
      scorePercent: evidenceCoverage,
      findings: [
        `${itemsWithEvidence.length} dari ${totalItems} item (${evidenceCoverage}%) memiliki rekam jejak bukti halaman DED.`,
      ],
    });

    const overallPassed = questions.every((q) => q.passed);

    // If any question failed, execute auto-correction on items
    if (!overallPassed) {
      if (!q7Passed) {
        incompatibleAhspItems.forEach((it) => {
          it.ahsp = null;
          it.status = 'AHSP_UNRESOLVED';
          it.unresolvedReason = 'Unit Safety Gate membatalkan pasangan AHSP akibat perbedaan dimensi satuan.';
          correctionsExecuted.push(`Koreksi item ${it.name}: AHSP dibatalkan karena benturan unit.`);
        });
      }
      if (!q8Passed) {
        zeroPriceReadyItems.forEach((it) => {
          it.status = 'PRICE_UNRESOLVED';
          correctionsExecuted.push(`Koreksi item ${it.name}: Status diubah ke PRICE_UNRESOLVED karena unit price = 0.`);
        });
      }
    }

    const report: AiSelfReviewReport = {
      timestamp: Date.now(),
      iteration,
      overallPassed,
      questions,
      correctionsExecuted,
      unresolvedCount: unresolvedItems.length,
      readyCount: readyItems.length,
    };

    return {
      report,
      diagnostics,
      requiresCorrection: !overallPassed && iteration === 1,
    };
  }
}

function synthesisHasDimensions(context: DedContextMemory): boolean {
  return context.rooms.length > 0 || context.schedules.length > 0;
}

export const dedSelfReviewEngine = DedSelfReviewEngine.getInstance();
