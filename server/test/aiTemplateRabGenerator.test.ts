import { describe, it, expect } from 'vitest';
import { defaultAiProvider } from '../../src/services/aiProviderEngine';
import { intentClassifier } from '../orchestrator/intentClassifier';

describe('EZRAB AI CORE — TEMPLATE RAB GENERATOR & COMMAND ENGINE TESTS', () => {
  const mockContext: any = {
    project: { name: 'Proyek Uji Validasi Cepat' },
    projectProvince: 'Jawa Timur',
    rab: { totalRab: 0, items: [], categories: [] },
    curveS: { plannedProgress: 0, actualProgress: 0, deviation: 0 },
    qto: [],
    ahsp: []
  };

  it('should classify "buatkan rab rumah type 36" as GENERATE_TEMPLATE_RAB', () => {
    const classified = intentClassifier.classify('buatkan rab rumah type 36');
    expect(classified.category).toBe('GENERATE_TEMPLATE_RAB');
    expect(classified.requiresFunction).toBe(true);
  });

  it('should generate complete RAB with AHSP 2026 for House Type 36 1-Floor', async () => {
    const result = await defaultAiProvider.chat('buatkan rab rumah type 36', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.content).toContain('Kalkulasi RAB Otomatis');
    expect(result.content).toContain('Tipe 36');
    expect(result.content).toContain('AHSP PUPR 2026');
    expect(result.actionProposal).toBeDefined();
    expect(result.actionProposal?.type).toBe('ADD_RAB_ITEM');
    expect(result.actionProposal?.items?.length).toBeGreaterThanOrEqual(15);
    expect(result.table?.rows?.length).toBeGreaterThan(0);
  });

  it('should generate complete RAB with AHSP 2026 for House Type 45 1-Floor', async () => {
    const result = await defaultAiProvider.chat('buatkan rab rumah type 45', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.content).toContain('Tipe 45');
    expect(result.actionProposal?.items?.length).toBeGreaterThanOrEqual(15);
  });

  it('should generate complete RAB with AHSP 2026 for House Type 70 1-Floor', async () => {
    const result = await defaultAiProvider.chat('hitung rab rumah type 70', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.content).toContain('Tipe 70');
    expect(result.actionProposal?.items?.length).toBeGreaterThanOrEqual(15);
  });

  it('should generate complete RAB with AHSP 2026 for House Type 36 2-Floor', async () => {
    const result = await defaultAiProvider.chat('buatkan rab rumah type 36 2 lantai', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.content).toContain('Tipe 36/60 (2 Lantai)');
    expect(result.actionProposal?.items?.length).toBeGreaterThanOrEqual(15);
  });

  it('should generate complete RAB with AHSP 2026 for Ruko 2-Floor', async () => {
    const result = await defaultAiProvider.chat('buatkan rab ruko 2 lantai', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.content).toContain('Ruko');
    expect(result.actionProposal?.items?.length).toBeGreaterThanOrEqual(15);
  });

  it('should generate complete RAB with AHSP 2026 for Concrete Road (Rigid Pavement)', async () => {
    const result = await defaultAiProvider.chat('buatkan rab jalan beton panjang 200m', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.content).toContain('Jalan Beton');
    expect(result.actionProposal?.items?.length).toBeGreaterThanOrEqual(5);
  });

  it('should generate complete RAB with AHSP 2026 for U-Ditch Precast Drainage', async () => {
    const result = await defaultAiProvider.chat('buatkan rab saluran uditch panjang 100m', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.content).toContain('U-Ditch');
    expect(result.actionProposal?.items?.length).toBeGreaterThanOrEqual(6);
  });

  it('should fallback generic "buatkan rab rumah" to standard house template', async () => {
    const result = await defaultAiProvider.chat('tolong buatkan rab rumah', mockContext);
    expect(result.badge).toBe('RAB');
    expect(result.actionProposal?.items?.length).toBeGreaterThan(0);
  });
});
