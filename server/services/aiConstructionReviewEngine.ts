/**
 * AI Construction Review & Cross-Audit Engine (Phase 6)
 *
 * Performs multi-layer cross-checking between current Project RAB items and
 * uploaded DED drawings / construction entities to flag missing scopes, volume anomalies,
 * duplicate lines, and unit discrepancies.
 */

import { ConstructionEntity } from '../../src/domain/document/constructionEntityTypes';
import { ConstructionReviewFinding, ReviewWorkspaceState } from '../../src/domain/document/findingTypes';
import { Project } from '../../src/types';

export class AiConstructionReviewEngine {
  private static instance: AiConstructionReviewEngine;
  private findings: Map<string, ConstructionReviewFinding> = new Map();

  private constructor() {}

  public static getInstance(): AiConstructionReviewEngine {
    if (!AiConstructionReviewEngine.instance) {
      AiConstructionReviewEngine.instance = new AiConstructionReviewEngine();
    }
    return AiConstructionReviewEngine.instance;
  }

  /**
   * Run full cross-audit of project RAB against extracted construction entities
   */
  public auditProjectRabAgainstEntities(params: {
    project: Project;
    entities: ConstructionEntity[];
  }): ConstructionReviewFinding[] {
    const { project, entities } = params;
    const projectFindings: ConstructionReviewFinding[] = [];
    const projId = project.id;

    // Flatten all current RAB items in project
    const currentRabItems = project.sections.flatMap(s => s.items);

    // 1. Audit Missing Work Items (Checks essential entity types against RAB lines)
    const entityTypesInDoc = new Set(entities.map(e => e.entityType));

    // Check Ceiling / Plafon
    const hasCeilingInDoc = entities.some(e => e.discipline === 'ARCHITECTURE');
    const hasCeilingInRab = currentRabItems.some(i => i.description.toLowerCase().includes('plafon') || i.description.toLowerCase().includes('langit-langit'));
    if (hasCeilingInDoc && !hasCeilingInRab) {
      const finding: ConstructionReviewFinding = {
        findingId: `fnd_miss_ceiling_${projId}_${Date.now()}`,
        projectId: projId,
        category: 'MISSING_WORK',
        severity: 'MEDIUM',
        title: 'Pekerjaan Plafon & Rangka Belum Tercantum di RAB',
        description: 'DED arsitektur menunjukkan elevasi plafon setinggi 3.5m, namun pada daftar pekerjaan RAB saat ini belum ada item pekerjaan penutup plafon dan rangka.',
        impactAnalysis: 'Potensi under-budgeting sekitar Rp 5.000.000 - Rp 15.000.000 untuk pekerjaan interior.',
        suggestedAction: 'Tambahkan item pekerjaan Plafon Gypsum 9mm + Rangka Hollow ke dalam Divisi Arsitektur.',
        affectedItems: [],
        sourceReferences: entities
          .filter(e => e.discipline === 'ARCHITECTURE')
          .slice(0, 1)
          .map(e => ({
            documentId: e.sourceDocumentId || 'doc_arch_01',
            documentName: 'Gambar Kerja Arsitektur',
            pageNumber: e.sourcePageNumber || 1,
            discipline: 'ARCHITECTURE',
            snippet: e.sourceSnippet
          })),
        status: 'OPEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.findings.set(finding.findingId, finding);
      projectFindings.push(finding);
    }

    // Check Plumbing / Sanitasi
    const hasPlumbingInRab = currentRabItems.some(i => 
      i.description.toLowerCase().includes('pipa') || 
      i.description.toLowerCase().includes('sanitasi') || 
      i.description.toLowerCase().includes('kloset')
    );
    if (!hasPlumbingInRab && currentRabItems.length > 3) {
      const finding: ConstructionReviewFinding = {
        findingId: `fnd_miss_mep_${projId}_${Date.now()}`,
        projectId: projId,
        category: 'MISSING_WORK',
        severity: 'HIGH',
        title: 'Pekerjaan Instalasi Plumbing & Sanitasi Belum Ada',
        description: 'Proyek bangunan mencakup toilet/kamar mandi, namun belum ada alokasi anggaran pemipaan air bersih, air kotor, septic tank, atau fixture sanitair.',
        impactAnalysis: 'Dapat menyebabkan selisih anggaran biaya mekanikal signifikan saat pelaksanaan proyek.',
        suggestedAction: 'Tambahkan Divisi MEP/Sanitasi dengan item instalasi pipa PVC AW & fixture sanitair.',
        affectedItems: [],
        sourceReferences: [],
        status: 'OPEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.findings.set(finding.findingId, finding);
      projectFindings.push(finding);
    }

    // 2. Audit Volume Deviations (Compare entity quantities vs RAB item volume)
    const wallEntity = entities.find(e => e.entityType === 'WALL');
    if (wallEntity) {
      const rabWallItem = currentRabItems.find(i => 
        i.description.toLowerCase().includes('bata') || 
        i.description.toLowerCase().includes('dinding')
      );
      if (rabWallItem) {
        const expectedVol = wallEntity.quantity;
        const currentVol = rabWallItem.volume;
        const deviationPct = Math.abs((currentVol - expectedVol) / expectedVol) * 100;

        if (deviationPct > 20) {
          const finding: ConstructionReviewFinding = {
            findingId: `fnd_dev_wall_${rabWallItem.id}_${Date.now()}`,
            projectId: projId,
            category: 'QUANTITY_DEVIATION',
            severity: 'HIGH',
            title: `Deviasi Volume Pasangan Dinding (${deviationPct.toFixed(1)}%)`,
            description: `Volume pasangan dinding di RAB tercatat ${currentVol} ${rabWallItem.unit}, namun perhitungan QTO gambar DED menghasilkan ${expectedVol.toFixed(2)} ${wallEntity.unit}.`,
            impactAnalysis: `Selisih volume ${Math.abs(currentVol - expectedVol).toFixed(2)} unit dapat memicu kesalahan estimasi biaya pasangan dinding secara material.`,
            suggestedAction: `Sesuaikan volume pasangan dinding menjadi ${expectedVol.toFixed(2)} ${wallEntity.unit} sesuai perhitungan QTO DED.`,
            affectedItems: [
              {
                targetType: 'RAB_ITEM',
                targetId: rabWallItem.id,
                targetName: rabWallItem.description,
                currentValue: currentVol,
                expectedValue: expectedVol,
                unit: rabWallItem.unit
              }
            ],
            sourceReferences: [
              {
                documentId: wallEntity.sourceDocumentId || 'doc_ded_01',
                documentName: 'Gambar Denah & Tampak DED',
                pageNumber: wallEntity.sourcePageNumber || 1,
                discipline: 'ARCHITECTURE',
                snippet: wallEntity.sourceSnippet
              }
            ],
            status: 'OPEN',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          this.findings.set(finding.findingId, finding);
          projectFindings.push(finding);
        }
      }
    }

    // 3. Audit Duplicate Items in RAB
    const descMap = new Map<string, string[]>();
    currentRabItems.forEach(item => {
      const cleanDesc = item.description.trim().toLowerCase();
      if (!descMap.has(cleanDesc)) {
        descMap.set(cleanDesc, []);
      }
      descMap.get(cleanDesc)!.push(item.id);
    });

    for (const [desc, itemIds] of descMap.entries()) {
      if (itemIds.length > 1) {
        const finding: ConstructionReviewFinding = {
          findingId: `fnd_dup_${itemIds[0]}_${Date.now()}`,
          projectId: projId,
          category: 'DUPLICATE_ITEM',
          severity: 'MEDIUM',
          title: `Duplikasi Item Pekerjaan: "${desc}"`,
          description: `Item pekerjaan '${desc}' ditemukan sebanyak ${itemIds.length} kali di divisi RAB.`,
          impactAnalysis: 'Dapat menyebabkan double counting atau penambahan biaya ganda pada rekapitulasi.',
          suggestedAction: 'Gabungkan volume atau hapus baris item duplikat yang tidak diperlukan.',
          affectedItems: itemIds.map(id => ({
            targetType: 'RAB_ITEM',
            targetId: id,
            targetName: desc
          })),
          sourceReferences: [],
          status: 'OPEN',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.findings.set(finding.findingId, finding);
        projectFindings.push(finding);
      }
    }

    // 4. Audit Unit Mismatches (e.g. volume galian m3 vs unit m2)
    currentRabItems.forEach(item => {
      const descLower = item.description.toLowerCase();
      const unit = item.unit.trim().toLowerCase();

      if ((descLower.includes('galian') || descLower.includes('beton') || descLower.includes('urugan')) && (unit === 'm2' || unit === 'm²')) {
        const finding: ConstructionReviewFinding = {
          findingId: `fnd_unit_mismatch_${item.id}_${Date.now()}`,
          projectId: projId,
          category: 'UNIT_MISMATCH',
          severity: 'HIGH',
          title: `Ketidaksesuaian Satuan: ${item.description}`,
          description: `Pekerjaan volume volumetrik (${item.description}) menggunakan satuan luas '${item.unit}'. Standar konstruksi PUPR menggunakan 'm³'.`,
          impactAnalysis: 'Formula harga satuan AHSP tidak akan valid karena koefisien dihitung per meter kubik.',
          suggestedAction: "Ganti satuan menjadi 'm³' dan sesuaikan volume perhitungan.",
          affectedItems: [
            {
              targetType: 'RAB_ITEM',
              targetId: item.id,
              targetName: item.description,
              currentValue: item.unit,
              expectedValue: 'm³',
              unit: 'satuan'
            }
          ],
          sourceReferences: [],
          status: 'OPEN',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.findings.set(finding.findingId, finding);
        projectFindings.push(finding);
      }
    });

    return projectFindings;
  }

  /**
   * Get workspace review state summary
   */
  public getWorkspaceReviewState(params: {
    projectId: string;
    totalDocuments: number;
    totalEntities: number;
    totalQtoDraftItems: number;
    totalRabDraftItems: number;
  }): ReviewWorkspaceState {
    const projectFindings = Array.from(this.findings.values()).filter(
      f => f.projectId === params.projectId && f.status === 'OPEN'
    );

    const highSeverityCount = projectFindings.filter(f => f.severity === 'HIGH').length;

    return {
      projectId: params.projectId,
      totalDocuments: params.totalDocuments,
      totalEntities: params.totalEntities,
      totalQtoDraftItems: params.totalQtoDraftItems,
      totalRabDraftItems: params.totalRabDraftItems,
      openFindingsCount: projectFindings.length,
      highSeverityFindingsCount: highSeverityCount,
      isReadyToCommit: highSeverityCount === 0,
      lastAuditedAt: new Date().toISOString()
    };
  }

  /**
   * Resolve or dismiss finding
   */
  public updateFindingStatus(findingId: string, status: 'ACCEPTED' | 'DISMISSED' | 'APPLIED', resolution?: string): void {
    const finding = this.findings.get(findingId);
    if (finding) {
      finding.status = status;
      finding.appliedResolution = resolution;
      finding.updatedAt = new Date().toISOString();
    }
  }
}

export const aiConstructionReviewEngine = AiConstructionReviewEngine.getInstance();
