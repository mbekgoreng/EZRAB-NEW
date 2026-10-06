/**
 * Phase 6.4: Template Validation Engine
 *
 * Validates template-driven construction mapping:
 * - Required parameters completeness
 * - Conditional WBS activations vs physical evidence
 * - Irrelevant work detection
 * - Missing expected structural elements
 * - Unmapped entity audits
 */

import {
  ExtractedConstructionParameter,
  AdaptiveWbsNode,
  EntityWbsMapping,
  TemplateValidationFinding,
  MappingCoverageSummary
} from '../../src/domain/document/templateMappingTypes';
import { ConstructionProjectTemplate } from '../../src/engine/templateEngine/types';

export interface ValidationInput {
  template: ConstructionProjectTemplate;
  parameters: Record<string, ExtractedConstructionParameter>;
  adaptiveWBS: AdaptiveWbsNode[];
  mappedEntities: EntityWbsMapping[];
  unmappedEntities: EntityWbsMapping[];
  coverage: MappingCoverageSummary;
}

export class TemplateValidationEngine {
  /**
   * Run comprehensive validation against template mapping context.
   */
  public static validate(input: ValidationInput): TemplateValidationFinding[] {
    const findings: TemplateValidationFinding[] = [];
    const { template, parameters, adaptiveWBS, unmappedEntities, coverage } = input;

    // 1. Validate Required Parameters
    const requiredDefs = (template.parameters || []).filter(p => p.required);
    for (const req of requiredDefs) {
      const pVal = parameters[req.id];
      if (!pVal || pVal.status === 'MISSING' || pVal.value === null || pVal.value === undefined || pVal.value === '') {
        findings.push({
          findingId: `val_req_${req.id}`,
          severity: 'CRITICAL',
          category: 'MISSING_REQUIRED_PARAMETER',
          title: `Parameter Wajib Hilang: ${req.name}`,
          description: `Parameter '${req.name}' (${req.id}) diperlukan oleh template '${template.name}' namun belum terisi atau terdeteksi dari DED.`,
          suggestedAction: `Lengkapi nilai '${req.name}' di form parameter proyek atau upload gambar denah yang memuat dimensi ini.`
        });
      }
    }

    // 2. Validate Conditional WBS Consistency
    const hasBasementEvidence = Boolean(parameters['has_basement']?.value);
    const hasLiftEvidence = Boolean(parameters['has_lift']?.value) || (Number(parameters['has_lift']?.value) > 0);
    const floorCount = Number(parameters['floors']?.value || parameters['floor_count']?.value || 1);

    // Check if Lift is active in 1-story house
    if (template.type.toLowerCase().includes('residential') || template.type.toLowerCase().includes('rumah')) {
      if (floorCount === 1 && hasLiftEvidence) {
        findings.push({
          findingId: 'val_irr_lift_1f',
          severity: 'WARNING',
          category: 'IRRELEVANT_WORK_DETECTED',
          title: 'Potensi Pekerjaan Tidak Relevan: Lift pada Rumah 1 Lantai',
          description: 'Pekerjaan Lift/Elevator terdeteksi aktif pada template Rumah 1 Lantai.',
          suggestedAction: 'Verifikasi kembali drawing apakah unit lift memang ada atau merupakan kesalahan ekstraksi.'
        });
      }
    }

    // Check if 2-story building has columns/beams
    if (floorCount >= 2) {
      const hasColumns = input.mappedEntities.some(m => m.elementType.toUpperCase().includes('COLUMN') || m.workCategory.includes('KOLOM'));
      const hasBeams = input.mappedEntities.some(m => m.elementType.toUpperCase().includes('BEAM') || m.workCategory.includes('BALOK'));

      if (!hasColumns) {
        findings.push({
          findingId: 'val_miss_col_2f',
          severity: 'WARNING',
          category: 'MISSING_EXPECTED_WORK',
          title: 'Elemen Kolom Lantai Atas Belum Ditemukan',
          description: 'Proyek terdeteksi memiliki 2 lantai atau lebih, namun belum ada entitas Kolom Struktur yang terpetakan.',
          suggestedAction: 'Pastikan gambar Denah Kolom Lantai 2 telah diunggah ke dalam Document Set.'
        });
      }
      if (!hasBeams) {
        findings.push({
          findingId: 'val_miss_beam_2f',
          severity: 'WARNING',
          category: 'MISSING_EXPECTED_WORK',
          title: 'Elemen Balok Struktur Belum Ditemukan',
          description: 'Proyek bertingkat memerlukan balok pemikul lantai, namun belum ada entitas Balok yang terpetakan.',
          suggestedAction: 'Pastikan gambar Denah Balok / Pelat Lantai telah diunggah ke dalam Document Set.'
        });
      }
    }

    // 3. Validate Unmapped Entities
    if (unmappedEntities.length > 0) {
      findings.push({
        findingId: 'val_unmapped_entities',
        severity: 'WARNING',
        category: 'UNMAPPED_ENTITY',
        title: `${unmappedEntities.length} Construction Entity Belum Terpetakan`,
        description: `Terdapat ${unmappedEntities.length} entitas fisik dari drawing yang belum dapat dihubungkan ke WBS template '${template.name}'.`,
        suggestedAction: 'Periksa daftar unmapped entities di bawah dan lakukan pemetaan manual atau pilih cabang WBS yang sesuai.'
      });
    }

    // 4. Validate Coverage Rate
    if (coverage.coveragePercentage < 70.0 && coverage.totalEntities > 0) {
      findings.push({
        findingId: 'val_low_coverage',
        severity: 'WARNING',
        category: 'UNMAPPED_ENTITY',
        title: `Coverage Pemetaan Rendah (${coverage.coveragePercentage}%)`,
        description: `Persentase entitas terpetakan di bawah batas optimal 70%. Hal ini dapat mengindikasikan ketidaksesuaian antara template yang dipilih dengan isi DED.`,
        suggestedAction: 'Pertimbangkan untuk mengganti template proyek atau menyesuaikan struktur WBS template.'
      });
    }

    // 5. Validate Empty Entities
    if (coverage.totalEntities === 0) {
      findings.push({
        findingId: 'val_no_entities',
        severity: 'INFO',
        category: 'MISSING_EXPECTED_WORK',
        title: 'Belum Ada Entitas DED Terdeteksi',
        description: `Tidak ada entitas fisik yang diekstrak dari DED untuk dipetakan ke template '${template.name}'. Estimasi kuantitas menggunakan parameter default template.`,
        suggestedAction: 'Unggah file gambar DED atau masukkan kuantitas pekerjaan secara manual.'
      });
    }

    return findings;
  }
}
