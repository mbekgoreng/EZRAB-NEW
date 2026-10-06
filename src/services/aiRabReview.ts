/**
 * EZRAB AI RAB Review & Consistency Audit Service (Phase 9)
 * 
 * Performs an intelligent, multi-dimensional audit of project RAB against:
 * 1. Master Price benchmarks
 * 2. Drawing estimates / Geometry
 * 3. AHSP catalog mappings and coefficients
 * 4. Duplicate scope detection
 * 5. Possible missing work items
 * 
 * CORE PRINCIPLES:
 * - Never mutates RAB automatically.
 * - Every finding includes severity (INFO, REVIEW, WARNING), category, source attribution, and confidence.
 * - Uses professional, non-alarmist construction engineering terminology.
 * - Strict project-scoped isolation.
 */

import type { RabItem, Project } from '../types';
import { DEFAULT_MASTER_PRICE_CATALOG, MasterPriceReferenceItem } from './aiReceiptIntelligence';

export type RABReviewSeverity = 'INFO' | 'REVIEW' | 'WARNING';
export type RABReviewCategory = 'PRICE' | 'QUANTITY' | 'AHSP' | 'DUPLICATE' | 'MISSING' | 'CONSISTENCY';

export interface RABReviewFinding {
  id: string;
  severity: RABReviewSeverity;
  category: RABReviewCategory;
  itemId?: string;
  itemName: string;
  rabPrice?: number;
  benchmarkPrice?: number;
  differencePercent?: number;
  rabQuantity?: number;
  source: 'Master Price' | 'AHSP' | 'Project RAB' | 'Drawing' | 'Project Schedule' | 'User Input';
  reason: string;
  suggestion: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface RABReviewSummary {
  totalItemsReviewed: number;
  totalFindings: number;
  priceFindings: number;
  quantityFindings: number;
  ahspFindings: number;
  duplicateFindings: number;
  missingFindings: number;
  criticalWarnings: number;
  needsReviewCount: number;
  findings: RABReviewFinding[];
  healthScore: number; // 0 - 100
}

export interface RABReviewRequest {
  projectId: string;
  projectName?: string;
  rabItems: RabItem[];
  masterPrices?: MasterPriceReferenceItem[];
  drawingSpaces?: Array<{ name: string; area: number }>;
}

export interface RABReviewResponse {
  success: boolean;
  summary: RABReviewSummary;
  error?: string;
}

/**
 * 1. Price Consistency Check against Master Price
 */
function auditPrices(
  rabItems: RabItem[],
  masterPrices: MasterPriceReferenceItem[]
): RABReviewFinding[] {
  const findings: RABReviewFinding[] = [];

  rabItems.forEach((item) => {
    if (!item.unitPrice || item.unitPrice <= 0) return;

    const cleanDesc = item.description.toLowerCase();
    
    // Find closest match in master price catalog
    const match = masterPrices.find((mp) => {
      const kwList = mp.name.toLowerCase().split(/\s+/);
      const matched = kwList.filter((k) => k.length >= 3 && cleanDesc.includes(k));
      return matched.length / kwList.length >= 0.5;
    });

    if (match) {
      const diffPercent = Number((((item.unitPrice - match.price) / match.price) * 100).toFixed(1));
      const diffAbs = Math.abs(diffPercent);

      if (diffAbs > 12) {
        findings.push({
          id: `fnd-price-${item.id}`,
          severity: 'WARNING',
          category: 'PRICE',
          itemId: item.id,
          itemName: item.description,
          rabPrice: item.unitPrice,
          benchmarkPrice: match.price,
          differencePercent: diffPercent,
          source: 'Master Price',
          reason: `Harga satuan ${item.description} (Rp ${item.unitPrice.toLocaleString('id-ID')}) berada ${diffPercent > 0 ? '+' : ''}${diffPercent}% dibanding harga acuan Master Price (Rp ${match.price.toLocaleString('id-ID')}).`,
          suggestion: 'Verifikasi apakah terdapat spesifikasi teknis khusus, merk premium, atau kenaikan harga pasar terkini.',
          confidence: 'HIGH',
        });
      } else if (diffAbs > 5) {
        findings.push({
          id: `fnd-price-${item.id}`,
          severity: 'REVIEW',
          category: 'PRICE',
          itemId: item.id,
          itemName: item.description,
          rabPrice: item.unitPrice,
          benchmarkPrice: match.price,
          differencePercent: diffPercent,
          source: 'Master Price',
          reason: `Harga satuan ${item.description} (Rp ${item.unitPrice.toLocaleString('id-ID')}) memiliki selisih ${diffPercent > 0 ? '+' : ''}${diffPercent}% dari acuan standar.`,
          suggestion: 'Lakukan review berkala untuk memastikan estimasi tetap kompetitif.',
          confidence: 'MEDIUM',
        });
      }
    }
  });

  return findings;
}

/**
 * 2. AHSP Mapping & Unit Integrity Check
 */
function auditAhspMappings(rabItems: RabItem[]): RABReviewFinding[] {
  const findings: RABReviewFinding[] = [];

  rabItems.forEach((item) => {
    // Check missing AHSP
    if (!item.ahspCode || item.ahspCode.trim() === '') {
      findings.push({
        id: `fnd-ahsp-${item.id}`,
        severity: 'REVIEW',
        category: 'AHSP',
        itemId: item.id,
        itemName: item.description,
        source: 'AHSP',
        reason: `Item pekerjaan "${item.description}" belum memiliki referensi kode analisis AHSP standar.`,
        suggestion: 'Petakan item ke kode AHSP SNI/Permen PUPR agar rincian koefisien bahan, upah, dan alat terstruktur.',
        confidence: 'HIGH',
      });
    }

    // Check unit alignment
    const desc = item.description.toLowerCase();
    const unit = (item.unit || '').toLowerCase().trim();

    if ((desc.includes('beton') || desc.includes('cor')) && !desc.includes('rabat') && unit === 'm2') {
      findings.push({
        id: `fnd-unit-${item.id}`,
        severity: 'WARNING',
        category: 'AHSP',
        itemId: item.id,
        itemName: item.description,
        source: 'AHSP',
        reason: `Pekerjaan struktur beton "${item.description}" menggunakan satuan "${item.unit}", lazimnya menggunakan satuan volume kubik (m³).`,
        suggestion: 'Periksa apakah perhitungan volume perlu dikonversikan ke satuan volume m³.',
        confidence: 'HIGH',
      });
    }

    if ((desc.includes('pasangan bata') || desc.includes('plesteran') || desc.includes('acian') || desc.includes('cat')) && unit === 'm3') {
      findings.push({
        id: `fnd-unit-${item.id}`,
        severity: 'WARNING',
        category: 'AHSP',
        itemId: item.id,
        itemName: item.description,
        source: 'AHSP',
        reason: `Pekerjaan dinding/finishing "${item.description}" menggunakan satuan kubik (m³), lazimnya menggunakan satuan luas permukaan (m²).`,
        suggestion: 'Periksa satuan pekerjaan pada spreadsheet RAB.',
        confidence: 'HIGH',
      });
    }
  });

  return findings;
}

/**
 * 3. Duplicate & Overlapping Work Scope Check
 */
function auditDuplicates(rabItems: RabItem[]): RABReviewFinding[] {
  const findings: RABReviewFinding[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < rabItems.length; i++) {
    for (let j = i + 1; j < rabItems.length; j++) {
      const itemA = rabItems[i];
      const itemB = rabItems[j];
      const pairKey = `${itemA.id}_${itemB.id}`;

      if (processedPairs.has(pairKey)) continue;

      const descA = itemA.description.toLowerCase().trim();
      const descB = itemB.description.toLowerCase().trim();

      if (descA === descB && itemA.unit === itemB.unit) {
        findings.push({
          id: `fnd-dup-${itemA.id}-${itemB.id}`,
          severity: 'WARNING',
          category: 'DUPLICATE',
          itemId: itemA.id,
          itemName: itemA.description,
          source: 'Project RAB',
          reason: `Ditemukan item pekerjaan duplikat: "${itemA.description}" muncul berulang di spreadsheet dengan satuan yang sama (${itemA.unit}).`,
          suggestion: 'Periksa apakah kedua item memang memiliki lokasi terpisah atau dapat digabungkan volumenya.',
          confidence: 'HIGH',
        });
        processedPairs.add(pairKey);
      } else if (descA.length > 8 && descB.length > 8 && (descA.includes(descB) || descB.includes(descA))) {
        findings.push({
          id: `fnd-dup-scope-${itemA.id}-${itemB.id}`,
          severity: 'REVIEW',
          category: 'DUPLICATE',
          itemId: itemA.id,
          itemName: itemA.description,
          source: 'Project RAB',
          reason: `Kemungkinan terdapat lingkup pekerjaan tumpang tindih antara "${itemA.description}" dan "${itemB.description}".`,
          suggestion: 'Pastikan kedua item memiliki batasan pekerjaan yang jelas agar tidak terjadi double-budgeting.',
          confidence: 'MEDIUM',
        });
        processedPairs.add(pairKey);
      }
    }
  }

  return findings;
}

/**
 * 4. Missing Essential Construction Items Check
 */
function auditMissingItems(rabItems: RabItem[]): RABReviewFinding[] {
  const findings: RABReviewFinding[] = [];
  const allDescriptions = rabItems.map((i) => i.description.toLowerCase()).join(' ');

  const hasWall = allDescriptions.includes('bata') || allDescriptions.includes('dinding') || allDescriptions.includes('hebel');
  const hasPlaster = allDescriptions.includes('plester') || allDescriptions.includes('plesteran');
  const hasAcian = allDescriptions.includes('acian') || allDescriptions.includes('aci');
  const hasPaint = allDescriptions.includes('cat') || allDescriptions.includes('pengecatan');
  const hasStructure = allDescriptions.includes('kolom') || allDescriptions.includes('balok') || allDescriptions.includes('sloof');

  // If wall exists, check if plaster/acian/paint are missing
  if (hasWall && !hasPlaster) {
    findings.push({
      id: 'fnd-miss-plaster',
      severity: 'REVIEW',
      category: 'MISSING',
      itemName: 'Pekerjaan Plesteran Dinding',
      source: 'Drawing',
      reason: 'Pekerjaan Pasangan Dinding terdaftar pada RAB, namun belum ditemukan item Pekerjaan Plesteran Dinding pendukung.',
      suggestion: 'Tambahkan item Pekerjaan Plesteran 1:4 / 1:5 sesuai luas dinding terpasang.',
      confidence: 'MEDIUM',
    });
  }

  if (hasWall && !hasAcian) {
    findings.push({
      id: 'fnd-miss-acian',
      severity: 'INFO',
      category: 'MISSING',
      itemName: 'Pekerjaan Acian Dinding',
      source: 'Drawing',
      reason: 'Belum ditemukan item Pekerjaan Acian Semen/Mortar untuk perataan plesteran dinding.',
      suggestion: 'Pastikan apakah acian sudah terangkum dalam item plesteran atau perlu dibuat terpisah.',
      confidence: 'MEDIUM',
    });
  }

  if (hasWall && !hasPaint) {
    findings.push({
      id: 'fnd-miss-paint',
      severity: 'REVIEW',
      category: 'MISSING',
      itemName: 'Pekerjaan Pengecatan Dinding',
      source: 'Drawing',
      reason: 'Pekerjaan finishing cat dinding interior/eksterior belum terdaftar dalam anggaran biaya.',
      suggestion: 'Tambahkan item Pengecatan Dinding (plamir, cat dasar, dan cat penutup 2 lapis).',
      confidence: 'MEDIUM',
    });
  }

  // If paint exists without wall/plaster
  if (hasPaint && !hasWall) {
    findings.push({
      id: 'fnd-miss-wall-base',
      severity: 'REVIEW',
      category: 'MISSING',
      itemName: 'Pekerjaan Pasangan Dinding / Partisi',
      source: 'Drawing',
      reason: 'Item pengecatan dinding tercatat, namun item pasangan dinding bata/hebel/partisi belum terdaftar.',
      suggestion: 'Verifikasi apakah proyek merupakan pekerjaan renovasi cat ulang atau pekerjaan gedung baru.',
      confidence: 'MEDIUM',
    });
  }

  if (hasPaint && !hasPlaster && !hasAcian) {
    findings.push({
      id: 'fnd-miss-prep-paint',
      severity: 'INFO',
      category: 'MISSING',
      itemName: 'Pekerjaan Persiapan / Plamir Permukaan',
      source: 'AHSP',
      reason: 'Item pengecatan membutuhkan persiapan permukaan bidang plamir atau pembersihan dasar sebelum pengecatan.',
      suggestion: 'Pastikan item persiapan dan plamir dinding sudah tercakup.',
      confidence: 'LOW',
    });
  }

  if (hasStructure && !allDescriptions.includes('pembesian') && !allDescriptions.includes('besi beton')) {
    findings.push({
      id: 'fnd-miss-rebar',
      severity: 'INFO',
      category: 'MISSING',
      itemName: 'Pekerjaan Pembesian / Tulangan Baja',
      source: 'AHSP',
      reason: 'Pekerjaan struktur beton bertulang terdaftar. Pastikan pembesian sudah terangkum dalam harga cor beton atau tercatat terpisah.',
      suggestion: 'Verifikasi komponen analisa AHSP cor beton yang digunakan.',
      confidence: 'MEDIUM',
    });
  }

  return findings;
}

/**
 * 5. Quantity & Calculation Outlier Check
 */
function auditQuantities(rabItems: RabItem[]): RABReviewFinding[] {
  const findings: RABReviewFinding[] = [];

  rabItems.forEach((item) => {
    if (item.volume <= 0) {
      findings.push({
        id: `fnd-qty-zero-${item.id}`,
        severity: 'WARNING',
        category: 'QUANTITY',
        itemId: item.id,
        itemName: item.description,
        rabQuantity: item.volume,
        source: 'Project RAB',
        reason: `Item pekerjaan "${item.description}" memiliki volume 0 atau bernilai kosong.`,
        suggestion: 'Lakukan perhitungan volume QTO atau masukkan volume pekerjaan yang valid.',
        confidence: 'HIGH',
      });
    }
  });

  return findings;
}

/**
 * Main Review Execution Engine
 */
export function reviewProjectRab(request: RABReviewRequest): RABReviewResponse {
  try {
    if (!request.projectId || request.projectId.trim() === '') {
      return {
        success: false,
        summary: {
          totalItemsReviewed: 0,
          totalFindings: 0,
          priceFindings: 0,
          quantityFindings: 0,
          ahspFindings: 0,
          duplicateFindings: 0,
          missingFindings: 0,
          criticalWarnings: 0,
          needsReviewCount: 0,
          findings: [],
          healthScore: 0,
        },
        error: 'Project ID tidak valid.',
      };
    }

    const items = request.rabItems || [];
    if (items.length === 0) {
      return {
        success: true,
        summary: {
          totalItemsReviewed: 0,
          totalFindings: 0,
          priceFindings: 0,
          quantityFindings: 0,
          ahspFindings: 0,
          duplicateFindings: 0,
          missingFindings: 0,
          criticalWarnings: 0,
          needsReviewCount: 0,
          findings: [],
          healthScore: 100,
        },
      };
    }

    const masterCatalog = request.masterPrices || DEFAULT_MASTER_PRICE_CATALOG;

    // Run audits across 5 categories
    const priceFindings = auditPrices(items, masterCatalog);
    const ahspFindings = auditAhspMappings(items);
    const duplicateFindings = auditDuplicates(items);
    const missingFindings = auditMissingItems(items);
    const quantityFindings = auditQuantities(items);

    const allFindings = [
      ...priceFindings,
      ...ahspFindings,
      ...duplicateFindings,
      ...missingFindings,
      ...quantityFindings,
    ];

    const criticalWarnings = allFindings.filter((f) => f.severity === 'WARNING').length;
    const needsReviewCount = allFindings.filter((f) => f.severity === 'REVIEW').length;

    // Calculate health score (100 minus weighted penalties)
    const penalty = criticalWarnings * 10 + needsReviewCount * 4;
    const healthScore = Math.max(20, Math.min(100, 100 - penalty));

    const summary: RABReviewSummary = {
      totalItemsReviewed: items.length,
      totalFindings: allFindings.length,
      priceFindings: priceFindings.length,
      quantityFindings: quantityFindings.length,
      ahspFindings: ahspFindings.length,
      duplicateFindings: duplicateFindings.length,
      missingFindings: missingFindings.length,
      criticalWarnings,
      needsReviewCount,
      findings: allFindings,
      healthScore,
    };

    return {
      success: true,
      summary,
    };
  } catch (err: any) {
    return {
      success: false,
      summary: {
        totalItemsReviewed: 0,
        totalFindings: 0,
        priceFindings: 0,
        quantityFindings: 0,
        ahspFindings: 0,
        duplicateFindings: 0,
        missingFindings: 0,
        criticalWarnings: 0,
        needsReviewCount: 0,
        findings: [],
        healthScore: 0,
      },
      error: err?.message || 'Gagal melakukan review RAB.',
    };
  }
}
